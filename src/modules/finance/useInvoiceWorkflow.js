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
import { createElement, useCallback, useEffect, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import {
  submitInvoiceRpc, getInvoicePdfData,
  recordPayment, markTtfReceived, getPaymentHistory, getTtfStatus,
} from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove, canIssueInvoice, canRecordInvoicePayment } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import InvoicePDF from '../logistics/InvoicePDF';

const PAY_FORM_KOSONG = () => ({
  amount: '', paymentDate: getTodayWIB(), reference: '', pph: '', buktiUrl: '', buktiNo: '',
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
      pph:            Number(payForm.pph) || 0,
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
    setPaySaving(false);
    showToast?.('Pembayaran dicatat', 'success');
  }, [invoiceId, paySaving, payForm, showToast, onChanged]);

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
  // Saran PPh 23 = total ongkir x 2%. Suku ongkir = total_amount - dpp - ppn.
  const totalOngkirInv = (Number(invoice?.total_amount) || 0)
    - (Number(invoice?.total_dpp) || 0) - (Number(invoice?.total_ppn) || 0);
  const pphSuggestion = Math.round(Math.max(0, totalOngkirInv) * 0.02);

  const invStatus = invoice?.status || null;
  const bisaBayarSekarang  = ['issued', 'submitted', 'partial'].includes(invStatus);
  const showPaymentHistory = !!invStatus && !['draft', 'void'].includes(invStatus);
  const bisaTtfSekarang    = ['issued', 'submitted', 'partial', 'paid'].includes(invStatus);

  return {
    // data
    payments, ttf, paidSettled, sisaTagihan, totalOngkirInv, pphSuggestion,
    // form
    payForm, setPayForm, pphTouched, setPphTouched,
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
