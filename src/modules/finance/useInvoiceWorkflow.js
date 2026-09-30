// src/modules/finance/useInvoiceWorkflow.js
// Seluruh KELAKUAN halaman Detail Invoice dalam satu hook: state form, gate
// peran, dan keempat aksi (submit, catat pembayaran, tandai TTF, buat PDF).
//
// ⛔ DIPINDAH APA ADANYA dari `InvoicePanel.jsx` (yang dihapus saat tampilan
// Detail Invoice dirombak). Nol perubahan logika, nol perubahan RPC, nol
// perubahan gate peran -- yang berubah cuma DI MANA ia tinggal. Alasannya:
// render panel lama adalah satu tumpukan vertikal yang tidak bisa menjadi tata
// letak dokumen-kiri/konteks-kanan tanpa ditulis ulang, sementara handler-nya
// tidak boleh ikut ditulis ulang. Memisahkan keduanya membuat diff tampilan
// bisa dibaca sebagai tampilan.
//
// DUA hal yang TIDAK ikut pindah, keduanya karena tak bisa dicapai dari sini:
//   1. `handleCreateInvoice` + gate `canCreateInvoice` (Sigma qty/shipped_qty).
//      Halaman Detail dibuka lewat id invoice yang SUDAH ada, jadi cabang
//      "belum diterbitkan" mustahil dirender. Rumah penerbitan tetap satu:
//      halaman Siap Ditagih (ReadyToInvoicePage), yang memakai RPC yang sama.
//   2. Pemuatan baris invoice lewat `getSpInvoice(spOrderId)`. Halaman kini
//      memuatnya lewat id (`getInvoiceViewData`) -- lebih tepat, karena satu SP
//      bisa punya lebih dari satu baris sp_invoices non-deleted (mis. satu void
//      + satu aktif) dan `maybeSingle()` pada sp_order_id gagal di kasus itu.
//
// Nol JSX di berkas ini (elemen PDF dibangun lewat createElement) supaya ia
// tetap `.js` dan tak perlu ikut aturan berkas komponen.
import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  submitInvoiceRpc, getInvoicePdfData,
  recordPayment, markTtfReceived, getPaymentHistory, getTtfStatus,
} from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove, canIssueInvoice, canRecordInvoicePayment, hasAnyRole } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import { formatIdNumber, readMoneyInput } from '../../lib/numberFormat';
import { invoiceShippingFromHeader } from '../../lib/taxConstants';
import { rp } from '../logistics/spDetailTokens.js';
import InvoicePDF from '../logistics/InvoicePDF';

// `pph` SENGAJA TIDAK ADA di sini. Nilai PPh yang disimpan diturunkan dari
// `pphField` di bawah -- satu sumber dengan yang TAMPIL di kolomnya. Menyimpannya
// juga di payForm berarti dua penyimpan untuk satu angka, dan itu bentuk PERSIS
// bug yang ditutup perubahan ini (saran tampil di layar, nol yang tercatat).
// potonganLain/potonganKeterangan -- AR Tahap 3 (TD-287): potongan lain di
// luar kas & PPh (mis. biaya TTF). Keduanya BOLEH langsung di payForm (beda
// dari pph) karena nol saran otomatis yang perlu dijaga dari dobel-simpan.
const PAY_FORM_KOSONG = () => ({
  amount: '', paymentDate: getTodayWIB(), reference: '', buktiUrl: '', buktiNo: '',
  potonganLain: '', potonganKeterangan: '',
});
// ttfDate diisi ULANG saat mulaiEditTtf (prefill dari TTF yang ada, atau hari
// ini untuk pencatatan pertama) -- '' di sini cuma nilai kosong awal render.
const TTF_FORM_KOSONG = { receivedBy: '', ttfNo: '', notes: '', ttfDate: '' };

/**
 * @param {object}   p
 * @param {object}   p.invoice     baris invoice yang sedang dibuka (boleh null saat memuat)
 * @param {function} p.showToast
 * @param {function} p.onChanged   dipanggil sesudah submit/bayar supaya halaman
 *                                 memuat ulang baris invoice-nya sendiri.
 */
export default function useInvoiceWorkflow({ invoice, showToast, onChanged }) {
  const [invoiceSaving,  setInvoiceSaving]  = useState(false);
  // Satu state untuk DUA tombol PDF (download & cetak) — keduanya nonaktif
  // selama salah satu berjalan, tapi hanya yang ditekan yang berubah labelnya.
  const [invoicePdfBusy, setInvoicePdfBusy] = useState(null);

  const [payments,   setPayments]   = useState([]);
  const [ttf,        setTtf]        = useState(null);
  const [paySaving,  setPaySaving]  = useState(false);
  const [ttfSaving,  setTtfSaving]  = useState(false);
  const [payForm,    setPayForm]    = useState(PAY_FORM_KOSONG);
  const [pphTouched, setPphTouched] = useState(false);
  const [ttfForm,    setTtfForm]    = useState(TTF_FORM_KOSONG);
  const [ttfEditing, setTtfEditing] = useState(false);

  // ── Buffer TEKS tiga kolom uang + nilai PPh EFEKTIF ───────────────────────
  // Buffer teks dipisah dari nilai kanonik: `payForm.amount` tetap STRING
  // NUMERIK ('1766050') supaya `Number(payForm.amount)` di handleRecordPayment
  // dan di gate tombol tidak perlu disentuh. Kalau teks berformat disimpan di
  // sana, Number() memberi NaN lalu 0 -- bug yang sama dari pintu lain.
  const [payAmountText, setPayAmountText] = useState('');
  const [payAmountBad,  setPayAmountBad]  = useState(false);
  const [payPphText,    setPayPphText]    = useState('');
  const [payPphBad,     setPayPphBad]     = useState(false);
  // Potongan lain (TD-287) -- pola SAMA dengan payAmountText, bukan dgn PPh:
  // nol saran otomatis, jadi nol kebutuhan buffer "touched" terpisah.
  const [payPotonganText, setPayPotonganText] = useState('');
  const [payPotonganBad,  setPayPotonganBad]  = useState(false);

  // Saran PPh 23 = 2% x ongkir invoice, DIKURANGI PPh yang sudah tercatat.
  // Suku ongkir = invoiceShippingFromHeader() (taxConstants.js) -- SATU sumber
  // dipakai bersama PDF (getInvoicePdfData), lihat TD-296. Pengurangannya bukan
  // kosmetik: begitu saran ikut TERSIMPAN secara default, saran penuh pada
  // pembayaran parsial KEDUA akan mencatat PPh dua kali -- record_payment tidak
  // punya cap (v_settled = Sigma amount + Sigma pph, status jadi 'paid' begitu
  // v_settled >= total - 1, dan AR dikredit amount + pph), jadi dobel itu
  // melunasi invoice dengan uang yang tak pernah masuk. Lihat TD-285.
  const totalOngkirInv = invoiceShippingFromHeader(invoice);
  const pphFullSuggestion = Math.round(Math.max(0, totalOngkirInv) * 0.02);
  const pphRecorded   = payments.reduce((sum, p) => sum + (Number(p.pph) || 0), 0);
  const pphSuggestion = Math.max(0, pphFullSuggestion - pphRecorded);

  // Kolom PPh 23 -- SATU sumber untuk apa yang TAMPIL dan apa yang TERSIMPAN.
  // ⛔ WAJIB dideklarasikan DI ATAS handleRecordPayment: ia masuk dependency
  // array useCallback itu, dan dep array dievaluasi SAAT RENDER -- menaruhnya
  // di bawah menghasilkan ReferenceError saat render, bukan bug senyap.
  // ⛔ JANGAN pecah lagi jadi ternary terpisah di JSX: memisahkan teks dari
  // nilai adalah bug yang ditutup perubahan ini (SP 2031966, PPh 46.000 hilang).
  // useMemo supaya identitasnya stabil: ia masuk dependency array
  // handleRecordPayment, dan objek baru tiap render membuat useCallback di sana
  // ikut berganti identitas tiap render -- memoisasinya jadi sia-sia.
  const pphField = useMemo(() => (pphTouched
    ? { text: payPphText,                    value: readMoneyInput(payPphText).value }
    : { text: formatIdNumber(pphSuggestion), value: pphSuggestion }
  ), [pphTouched, payPphText, pphSuggestion]);

  // Sisa tagihan = total_amount - Sigma(amount + pph + potongan_lain). TIDAK
  // di-clamp ke nol: kalau tercatat lebih bayar, angkanya sengaja tampil
  // negatif. ⛔ WAJIB dideklarasikan DI ATAS handleRecordPayment (dipakai
  // sebagai dependency-nya, dan sebagai basis guard pra-kirim TD-285/286) --
  // pola yang SAMA dengan pphField di atas; menaruhnya di bawah adalah kelas
  // TDZ yang sama yang pernah menabrak winRateDegraded (9 Sep 2026).
  const paidSettled = payments.reduce((sum, p) =>
    sum + (Number(p.amount) || 0) + (Number(p.pph) || 0) + (Number(p.potongan_lain) || 0), 0);
  const sisaTagihan = (Number(invoice?.total_amount) || 0) - paidSettled;

  // Satu pola untuk ketiga kolom: teks mentah saat mengetik, format saat blur,
  // teks tak dikenali DIBIARKAN di kolomnya + pesan inline (nilai kanonik 0).
  // onBlur membaca BUFFER, bukan e.target.value -- untuk kolom PPh yang belum
  // disentuh, DOM menampilkan teks saran sementara buffernya masih '', jadi
  // blur dari DOM akan memaku saran itu dan menghentikannya mengikuti
  // pphSuggestion saat data invoice ter-refresh.
  const buatHandlerUang = (text, setText, setBad, key) => ({
    onChange: (e) => {
      const raw = e.target.value;
      setText(raw);
      const { value, unrecognized } = readMoneyInput(raw);
      setBad(unrecognized);
      // key null = kolom ini tidak punya cerminan di payForm (PPh: nilainya
      // diturunkan dari pphField, bukan disimpan dua kali).
      if (key) setPayForm((f) => ({ ...f, [key]: raw.trim() === '' ? '' : String(value) }));
    },
    onBlur: () => {
      const { value, unrecognized } = readMoneyInput(text);
      if (unrecognized) return;
      setText(text.trim() === '' ? '' : formatIdNumber(value));
    },
    // selectOnFocus (spDetailTokens.js) ber-guard `type === 'number'`, jadi ia
    // jadi NO-OP begitu kolomnya text. Select-all dipasang eksplisit supaya
    // ketikan tetap MENIMPA nilai lama, bukan ter-append.
    onFocus: (e) => e.target.select(),
  });
  const payAmountHandlers   = buatHandlerUang(payAmountText,   setPayAmountText,   setPayAmountBad,   'amount');
  const payPotonganHandlers = buatHandlerUang(payPotonganText, setPayPotonganText, setPayPotonganBad, 'potonganLain');
  const payPphBase          = buatHandlerUang(payPphText,      setPayPphText,      setPayPphBad,      null);
  // `pphTouched` = penanda "user sudah mengambil alih kolom ini". Sebelum
  // disentuh, yang berlaku (TAMPIL dan TERSIMPAN) adalah saran.
  const payPphHandlers    = {
    ...payPphBase,
    onChange: (e) => { setPphTouched(true); payPphBase.onChange(e); },
  };

  // Gate peran SENGAJA dari erpRoles (array seluruh role aktif), BUKAN role
  // primer: finance_controller berada DI BAWAH manager di daftar prioritas, jadi
  // user manager+finance_controller akan ter-resolve jadi 'manager' dan kehilangan
  // akses form, padahal RPC-nya (has_role) meloloskan.
  const { erpRoles } = useAuth();
  const canSubmit        = canIssueInvoice(erpRoles);         // cermin submit_invoice
  const canRecordPayment = canRecordInvoicePayment(erpRoles); // cermin record_payment
  // mark_ttf_received meloloskan manager ke atas DI SAMPING finance_controller,
  // finance, dan super_admin — daftarnya sengaja ditulis utuh di sini, bukan
  // meminjam canIssueInvoice yang kebetulan berisi himpunan yang sama hari
  // ini. has_role('finance') ditulis EKSPLISIT (bukan hanya lewat efek
  // samping OR canRecordPayment) supaya baris ini tidak diam-diam ikut
  // bergeser kalau canRecordInvoicePayment berubah untuk alasan lain nanti
  // (AR Tahap 3 bagian kedua, 24 Sep 2026).
  const canMarkTtf       = isManagerOrAbove(erpRoles) || canRecordPayment || hasAnyRole(erpRoles, ['finance']);

  const invoiceId = invoice?.id || null;

  // Riwayat pembayaran + status TTF, mengikuti invoice yang aktif.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invoiceId) { setPayments([]); setTtf(null); return undefined; }
    let batal = false;
    Promise.all([getPaymentHistory(invoiceId), getTtfStatus(invoiceId)]).then(([pay, t]) => {
      if (batal) return;
      setPayments(pay.data || []);
      setTtf(t.data || null);
    });
    return () => { batal = true; };
  }, [invoiceId]);

  const handleSubmitInvoice = useCallback(async () => {
    if (!invoiceId) return;
    setInvoiceSaving(true);
    const { error } = await submitInvoiceRpc(invoiceId);
    setInvoiceSaving(false);
    if (error) { showToast?.('Gagal menandai invoice: ' + (error.message || 'penyebab tidak diketahui'), 'error'); return; }
    showToast?.('Invoice ditandai sudah diupload ke portal', 'success');
    await onChanged?.();
  }, [invoiceId, showToast, onChanged]);

  // Pesan RAISE dari record_payment sudah manusiawi & berbahasa Indonesia
  // (mis. "Peran akun [kas_bank] belum dipetakan untuk entitas [SOA]…"), jadi
  // diteruskan apa adanya — jangan dibungkus pesan generik.
  const handleRecordPayment = useCallback(async () => {
    if (!invoiceId || paySaving) return;
    const amt = Number(payForm.amount) || 0;
    if (amt <= 0) { showToast?.('Nominal pembayaran harus lebih besar dari nol', 'error'); return; }
    const potonganLain = Number(payForm.potonganLain) || 0;
    const potonganKeterangan = payForm.potonganKeterangan.trim();
    if (potonganLain > 0 && !potonganKeterangan) {
      showToast?.('Keterangan potongan wajib diisi kalau ada potongan lain', 'error');
      return;
    }

    // Guard PRA-KIRIM (TD-285/286) -- pesan dini di FE, mencerminkan cap yang
    // SAMA dengan record_payment (toleransi Rp1, TD-294), supaya user tidak
    // menunggu round-trip server untuk kesalahan yang sudah terlihat di sini.
    // Pengaman UTAMA tetap di RPC -- ini tidak menggantikannya.
    const sisaSebelum = Math.max(sisaTagihan, 0);
    if (pphField.value > sisaTagihan + 1) {
      showToast?.(`PPh 23 (${rp(pphField.value)}) melebihi sisa tagihan (${rp(sisaSebelum)})`, 'error');
      return;
    }
    const totalBayarIni = amt + pphField.value + potonganLain;
    if (totalBayarIni > sisaTagihan + 1) {
      showToast?.(`Total pembayaran (${rp(totalBayarIni)}) melebihi sisa tagihan (${rp(sisaSebelum)})`, 'error');
      return;
    }

    setPaySaving(true);
    const { error } = await recordPayment({
      invoiceId,
      amount:         amt,
      paymentDate:    payForm.paymentDate || null,
      reference:      payForm.reference.trim() || null,
      // Nilai yang TAMPIL di kolom PPh, bukan state terpisah. Sebelum ini
      // `Number(payForm.pph) || 0` mengirim 0 setiap kali user tidak menyentuh
      // kolomnya -- padahal layar menunjukkan angka saran (bug SP 2031966).
      pph:                pphField.value,
      buktiPotongUrl:     payForm.buktiUrl.trim() || null,
      buktiPotongNo:      payForm.buktiNo.trim() || null,
      potonganLain,
      potonganKeterangan: potonganKeterangan || null,
    });
    if (error) {
      setPaySaving(false);
      showToast?.(error.message || 'Gagal mencatat pembayaran', 'error');
      return;
    }
    await onChanged?.();
    const { data } = await getPaymentHistory(invoiceId);
    setPayments(data || []);
    setPayForm(PAY_FORM_KOSONG());
    setPphTouched(false);
    // Buffer teks ketiga kolom ikut direset -- kalau tidak, angka pembayaran
    // sebelumnya tetap terbaca di kolomnya walau payForm sudah kosong.
    setPayAmountText('');   setPayAmountBad(false);
    setPayPphText('');      setPayPphBad(false);
    setPayPotonganText(''); setPayPotonganBad(false);
    setPaySaving(false);
    showToast?.('Pembayaran dicatat', 'success');
  }, [invoiceId, paySaving, payForm, pphField, sisaTagihan, showToast, onChanged]);

  const handleMarkTtf = useCallback(async () => {
    if (!invoiceId || ttfSaving) return;
    if (!ttfForm.receivedBy.trim()) { showToast?.('Nama penerima wajib diisi', 'error'); return; }
    if (!ttfForm.ttfDate) { showToast?.('Tanggal TTF wajib diisi', 'error'); return; }
    setTtfSaving(true);
    const { error } = await markTtfReceived({
      invoiceId,
      receivedBy: ttfForm.receivedBy.trim(),
      ttfNo:      ttfForm.ttfNo.trim() || null,
      notes:      ttfForm.notes.trim() || null,
      ttfDate:    ttfForm.ttfDate,
    });
    if (error) {
      setTtfSaving(false);
      showToast?.(error.message || 'Gagal menandai TTF', 'error');
      return;
    }
    // mark_ttf_received bisa mengubah due_date (AR Tahap 3) -- itu kolom pada
    // baris INVOICE, bukan pada wf.ttf, jadi memuat ulang wf.ttf saja (di bawah)
    // tidak cukup. Tanpa onChanged(), header/MetaRow Jatuh Tempo di halaman
    // (yang membaca `inv.due_date` milik induk) tetap menampilkan nilai lama
    // sampai halaman di-reload. Pola sama dengan handleSubmitInvoice/
    // handleRecordPayment.
    await onChanged?.();
    const { data } = await getTtfStatus(invoiceId);
    setTtf(data || null);
    setTtfForm(TTF_FORM_KOSONG);
    setTtfEditing(false);
    setTtfSaving(false);
    // Kata kerjanya ditentukan oleh ADA/TIDAKNYA TTF sebelum simpan, bukan oleh
    // `ttfEditing` -- sejak formnya juga dibuka untuk pencatatan PERTAMA, flag
    // itu true di kedua kasus dan pesannya akan selalu berbunyi "diperbarui".
    // `ttf` di sini masih nilai LAMA (setTtf di atas belum ter-commit), jadi ia
    // persis menjawab "sebelumnya sudah ada atau belum".
    showToast?.(ttf?.tanggal_menerima ? 'TTF diperbarui' : 'TTF ditandai diterima', 'success');
  }, [invoiceId, ttfSaving, ttfForm, ttf, showToast, onChanged]);

  const handleInvoicePdf = useCallback(async (variant) => {
    if (!invoiceId) return;
    setInvoicePdfBusy(variant);
    try {
      const { data: pdfData, error } = await getInvoicePdfData(invoiceId);
      if (error || !pdfData) {
        showToast?.('Gagal menyiapkan data invoice: ' + (error?.message || 'penyebab tidak diketahui'), 'error');
        return;
      }
      const blob = await pdf(createElement(InvoicePDF, { invoice: pdfData, variant })).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = `Invoice-${(pdfData.invoice_no || 'INV').replace(/\//g, '-')}`;
      a.download = variant === 'print' ? `${baseName}-cetak.pdf` : `${baseName}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast?.('Gagal membuat PDF: ' + (e?.message || e), 'error');
    } finally {
      setInvoicePdfBusy(null);
    }
  }, [invoiceId, showToast]);

  /** Masuk mode ubah TTF dengan data yang ada sebagai prefill. RPC
   *  mark_ttf_received sudah upsert (IF v_ttf_id IS NULL → INSERT, ELSE →
   *  UPDATE), jadi submit yang sama memperbarui baris, bukan bikin TTF kedua.
   *  ttfDate -- AR Tahap 3: prefill dari tanggal_ttf yang ADA (koreksi), atau
   *  hari ini untuk pencatatan PERTAMA (pola sama dengan Tanggal Bayar). */
  const mulaiEditTtf = useCallback(() => {
    setTtfForm({
      receivedBy: ttf?.diterima_oleh || '',
      ttfNo:      ttf?.no_ttf || '',
      notes:      ttf?.notes || '',
      ttfDate:    ttf?.tanggal_ttf || getTodayWIB(),
    });
    setTtfEditing(true);
  }, [ttf]);

  const batalEditTtf = useCallback(() => {
    setTtfEditing(false);
    setTtfForm(TTF_FORM_KOSONG);
  }, []);

  const invStatus = invoice?.status || null;
  const bisaBayarSekarang  = ['issued', 'submitted', 'partial'].includes(invStatus);
  const showPaymentHistory = !!invStatus && !['draft', 'pending_approval', 'void'].includes(invStatus);
  const bisaTtfSekarang    = ['issued', 'submitted', 'partial', 'paid'].includes(invStatus);

  return {
    // data
    payments, ttf, paidSettled, sisaTagihan, totalOngkirInv, pphSuggestion,
    // form
    payForm, setPayForm, pphTouched, setPphTouched,
    // kolom uang: teks tampilan + penanda "tak dikenali" + handler siap-pakai
    pphField, payAmountText, payAmountBad, payPphBad,
    payAmountHandlers, payPphHandlers,
    payPotonganText, payPotonganBad, payPotonganHandlers,
    ttfForm, setTtfForm, ttfEditing, mulaiEditTtf, batalEditTtf,
    // status kerja
    invoiceSaving, invoicePdfBusy, paySaving, ttfSaving,
    // gate
    canSubmit, canRecordPayment, canMarkTtf,
    bisaBayarSekarang, showPaymentHistory, bisaTtfSekarang,
    // aksi
    handleSubmitInvoice, handleRecordPayment, handleMarkTtf, handleInvoicePdf,
  };
}
