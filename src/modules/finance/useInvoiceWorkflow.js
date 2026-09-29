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
import { isManagerOrAbove, canIssueInvoice, canRecordInvoicePayment } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import { formatIdNumber, readMoneyInput } from '../../lib/numberFormat';
import InvoicePDF from '../logistics/InvoicePDF';

// `pph` SENGAJA TIDAK ADA di sini. Nilai PPh yang disimpan diturunkan dari
// `pphField` di bawah -- satu sumber dengan yang TAMPIL di kolomnya. Menyimpannya
// juga di payForm berarti dua penyimpan untuk satu angka, dan itu bentuk PERSIS
// bug yang ditutup perubahan ini (saran tampil di layar, nol yang tercatat).
const PAY_FORM_KOSONG = () => ({
  amount: '', paymentDate: getTodayWIB(), reference: '', buktiUrl: '', buktiNo: '',
});
const TTF_FORM_KOSONG = { receivedBy: '', ttfNo: '', notes: '' };

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

  // ── Buffer TEKS dua kolom uang + nilai PPh EFEKTIF ────────────────────────
  // Buffer teks dipisah dari nilai kanonik: `payForm.amount` tetap STRING
  // NUMERIK ('1766050') supaya `Number(payForm.amount)` di handleRecordPayment
  // dan di gate tombol tidak perlu disentuh. Kalau teks berformat disimpan di
  // sana, Number() memberi NaN lalu 0 -- bug yang sama dari pintu lain.
  const [payAmountText, setPayAmountText] = useState('');
  const [payAmountBad,  setPayAmountBad]  = useState(false);
  const [payPphText,    setPayPphText]    = useState('');
  const [payPphBad,     setPayPphBad]     = useState(false);

  // Saran PPh 23 = 2% x ongkir invoice, DIKURANGI PPh yang sudah tercatat.
  // Suku ongkir = total_amount - dpp - ppn (definisi v_total_amount di
  // create_invoice). Pengurangannya bukan kosmetik: begitu saran ikut TERSIMPAN
  // secara default, saran penuh pada pembayaran parsial KEDUA akan mencatat PPh
  // dua kali -- record_payment tidak punya cap (v_settled = Sigma amount +
  // Sigma pph, status jadi 'paid' begitu v_settled >= total - 1, dan AR dikredit
  // amount + pph), jadi dobel itu melunasi invoice dengan uang yang tak pernah
  // masuk. Lihat TD-285.
  const totalOngkirInv = (Number(invoice?.total_amount) || 0)
    - (Number(invoice?.total_dpp) || 0) - (Number(invoice?.total_ppn) || 0);
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

  // Satu pola untuk kedua kolom: teks mentah saat mengetik, format saat blur,
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
  const payAmountHandlers = buatHandlerUang(payAmountText, setPayAmountText, setPayAmountBad, 'amount');
  const payPphBase        = buatHandlerUang(payPphText,    setPayPphText,    setPayPphBad,    null);
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
  // mark_ttf_received meloloskan manager ke atas DI SAMPING finance_controller
  // dan super_admin — daftarnya sengaja ditulis utuh di sini, bukan meminjam
  // canIssueInvoice yang kebetulan berisi himpunan yang sama hari ini.
  const canMarkTtf       = isManagerOrAbove(erpRoles) || canRecordPayment;

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
    setPaySaving(true);
    const { error } = await recordPayment({
      invoiceId,
      amount:         amt,
      paymentDate:    payForm.paymentDate || null,
      reference:      payForm.reference.trim() || null,
      // Nilai yang TAMPIL di kolom PPh, bukan state terpisah. Sebelum ini
      // `Number(payForm.pph) || 0` mengirim 0 setiap kali user tidak menyentuh
      // kolomnya -- padahal layar menunjukkan angka saran (bug SP 2031966).
      pph:            pphField.value,
      buktiPotongUrl: payForm.buktiUrl.trim() || null,
      buktiPotongNo:  payForm.buktiNo.trim() || null,
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
    // Buffer teks kedua kolom ikut direset -- kalau tidak, angka pembayaran
    // sebelumnya tetap terbaca di kolomnya walau payForm sudah kosong.
    setPayAmountText(''); setPayAmountBad(false);
    setPayPphText('');    setPayPphBad(false);
    setPaySaving(false);
    showToast?.('Pembayaran dicatat', 'success');
  }, [invoiceId, paySaving, payForm, pphField, showToast, onChanged]);

  const handleMarkTtf = useCallback(async () => {
    if (!invoiceId || ttfSaving) return;
    if (!ttfForm.receivedBy.trim()) { showToast?.('Nama penerima wajib diisi', 'error'); return; }
    setTtfSaving(true);
    const { error } = await markTtfReceived({
      invoiceId,
      receivedBy: ttfForm.receivedBy.trim(),
      ttfNo:      ttfForm.ttfNo.trim() || null,
      notes:      ttfForm.notes.trim() || null,
    });
    if (error) {
      setTtfSaving(false);
      showToast?.(error.message || 'Gagal menandai TTF', 'error');
      return;
    }
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
  }, [invoiceId, ttfSaving, ttfForm, ttf, showToast]);

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
   *  UPDATE), jadi submit yang sama memperbarui baris, bukan bikin TTF kedua. */
  const mulaiEditTtf = useCallback(() => {
    setTtfForm({
      receivedBy: ttf?.diterima_oleh || '',
      ttfNo:      ttf?.no_ttf || '',
      notes:      ttf?.notes || '',
    });
    setTtfEditing(true);
  }, [ttf]);

  const batalEditTtf = useCallback(() => {
    setTtfEditing(false);
    setTtfForm(TTF_FORM_KOSONG);
  }, []);

  // Sisa tagihan = total_amount - Sigma(amount + pph). TIDAK di-clamp ke nol:
  // kalau tercatat lebih bayar, angkanya sengaja tampil negatif.
  const paidSettled = payments.reduce((sum, p) => sum + (Number(p.amount) || 0) + (Number(p.pph) || 0), 0);
  const sisaTagihan = (Number(invoice?.total_amount) || 0) - paidSettled;
  // `totalOngkirInv` + `pphSuggestion` DIPINDAH KE ATAS (dekat state form
  // Pembayaran) -- handleRecordPayment memakainya lewat `pphField`, dan itu wajib
  // dideklarasikan sebelum useCallback-nya.

  const invStatus = invoice?.status || null;
  const bisaBayarSekarang  = ['issued', 'submitted', 'partial'].includes(invStatus);
  const showPaymentHistory = !!invStatus && !['draft', 'void'].includes(invStatus);
  const bisaTtfSekarang    = ['issued', 'submitted', 'partial', 'paid'].includes(invStatus);

  return {
    // data
    payments, ttf, paidSettled, sisaTagihan, totalOngkirInv, pphSuggestion,
    // form
    payForm, setPayForm, pphTouched, setPphTouched,
    // kolom uang: teks tampilan + penanda "tak dikenali" + handler siap-pakai
    pphField, payAmountText, payAmountBad, payPphBad,
    payAmountHandlers, payPphHandlers,
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
