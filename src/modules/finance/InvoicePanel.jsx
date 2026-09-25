// src/modules/finance/InvoicePanel.jsx
// Panel Invoice — DIPINDAH dari SalesOrderDetailPage.jsx (AR Tahap 2, 25 Sep 2026).
//
// "Apa adanya" (keputusan Den K-5): JSX kartunya disalin verbatim, dan seluruh
// alurnya memanggil RPC yang SAMA (create_invoice, submit_invoice, record_payment,
// mark_ttf_received). Yang berubah hanya DI MANA ia dirender dan dari mana angka
// SP-nya datang (props, bukan state halaman Detail SP).
//
// Dua penyesuaian isi, dan cuma dua:
//   1. `spOrder?.id` -> prop `spOrderId` (panel tidak lagi memegang baris sp_orders).
//   2. komentar due_date dikoreksi — sejak AR Tahap 1 ia diisi saat TERBIT, bukan
//      saat submit.
//
// Kenapa panel-nya di modules/finance tapi tokennya dari modules/logistics:
// isinya urusan FINANCE, tampilannya keluarga ungu/serif Storbit. Mengimpor token
// dari tetangga lebih jujur daripada menyalinnya ke sini (dua salinan yang pasti
// melenceng) atau memakai sage duluan (palet kelima — keputusan #61). Impor
// lintas-modul ini mati sendiri saat Batch DS menyatukan kit.
import { useState, useEffect, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Check, Download, Link2, Pencil, Printer, Receipt, Send, Wallet } from 'lucide-react';
import {
  getSpInvoice, createInvoiceRpc, submitInvoiceRpc, getInvoicePdfData,
  recordPayment, markTtfReceived, getPaymentHistory, getTtfStatus,
} from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove } from '../../lib/roles';
import { getTodayWIB } from '../../lib/dateUtils';
import InvoicePDF from '../logistics/InvoicePDF';
import {
  C, FONT_DISPLAY, FONT_MONO, SP, RADIUS, kickerStyle, thStyle,
  TAG_PALE, TAG_OUTLINE, TAG_ATTN, rp, fmtDate, selectOnFocus,
} from '../logistics/spDetailTokens.js';
import { Badge, ModalField, ModalInp, ModalGrid } from '../logistics/spDetailKit.jsx';

/**
 * @param {object}   p
 * @param {string}   p.spOrderId    id sp_orders (null = SP belum punya baris header)
 * @param {number}   p.totalQty     Sigma qty seluruh item SP
 * @param {number}   p.shippedQty   Sigma shipped_qty seluruh item SP
 * @param {function} p.showToast
 * @param {function} [p.onChanged]  dipanggil sesudah invoice terbit/submit/dibayar,
 *                                  supaya halaman induk bisa menyegarkan miliknya.
 * @param {function} [p.onInvoice]  dipanggil dgn baris invoice tiap kali ia dimuat
 *                                  ulang — halaman Detail Invoice memakainya untuk
 *                                  judul halaman; Detail SP tidak memakainya.
 */
export default function InvoicePanel({ spOrderId, totalQty = 0, shippedQty = 0, showToast, onChanged, onInvoice }) {
  const [invoice,        setInvoice]        = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceSaving,  setInvoiceSaving]  = useState(false);
  // Satu state untuk DUA tombol PDF (download & cetak) — keduanya nonaktif
  // selama salah satu berjalan, tapi hanya yang ditekan yang berubah labelnya.
  const [invoicePdfBusy, setInvoicePdfBusy] = useState(null);

  const [payments,   setPayments]   = useState([]);
  const [ttf,        setTtf]        = useState(null);
  const [paySaving,  setPaySaving]  = useState(false);
  const [ttfSaving,  setTtfSaving]  = useState(false);
  const [payForm,    setPayForm]    = useState({ amount: '', paymentDate: getTodayWIB(), reference: '', pph: '', buktiUrl: '', buktiNo: '' });
  const [pphTouched, setPphTouched] = useState(false);
  const [ttfForm,    setTtfForm]    = useState({ receivedBy: '', ttfNo: '', notes: '' });
  const [ttfEditing, setTtfEditing] = useState(false);

  // Gate peran SENGAJA dari erpRoles (array seluruh role aktif), BUKAN role
  // primer: finance_controller berada DI BAWAH manager di daftar prioritas, jadi
  // user manager+finance_controller akan ter-resolve jadi 'manager' dan kehilangan
  // akses form, padahal RPC-nya (has_role) meloloskan.
  const { erpRoles } = useAuth();
  const roleCodes      = (erpRoles || []).map(r => r.roles?.code).filter(Boolean);
  const isSuperAdmin   = roleCodes.includes('super_admin');
  const isFinanceCtl   = roleCodes.includes('finance_controller');
  const isManagerAbove = isManagerOrAbove(erpRoles);
  const canRecordPayment = isFinanceCtl || isSuperAdmin;
  const canMarkTtf       = isManagerAbove || isFinanceCtl || isSuperAdmin;

  const muatInvoice = useCallback(async () => {
    if (!spOrderId) { setInvoice(null); setInvoiceLoading(false); return; }
    const { data } = await getSpInvoice(spOrderId);
    setInvoice(data || null);
    onInvoice?.(data || null);
    setInvoiceLoading(false);
  }, [spOrderId, onInvoice]);

  useEffect(() => {
    let batal = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvoiceLoading(true);
    if (!spOrderId) { setInvoice(null); setInvoiceLoading(false); return undefined; }
    getSpInvoice(spOrderId).then(({ data }) => {
      if (batal) return;
      setInvoice(data || null);
      onInvoice?.(data || null);
      setInvoiceLoading(false);
    });
    return () => { batal = true; };
  }, [spOrderId, onInvoice]);

  // Riwayat pembayaran + status TTF, mengikuti invoice yang aktif.
  useEffect(() => {
    const invId = invoice?.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invId) { setPayments([]); setTtf(null); return undefined; }
    let batal = false;
    Promise.all([getPaymentHistory(invId), getTtfStatus(invId)]).then(([pay, t]) => {
      if (batal) return;
      setPayments(pay.data || []);
      setTtf(t.data || null);
    });
    return () => { batal = true; };
  }, [invoice?.id]);

  const sesudahBerubah = async () => {
    await muatInvoice();
    onChanged?.();
  };

  const handleCreateInvoice = async () => {
    if (!spOrderId) return;
    setInvoiceSaving(true);
    const { error } = await createInvoiceRpc(spOrderId);
    setInvoiceSaving(false);
    if (error) { showToast?.('Gagal menerbitkan invoice: ' + (error.message || 'unknown error'), 'error'); return; }
    showToast?.('Invoice berhasil diterbitkan', 'success');
    await sesudahBerubah();
  };

  const handleSubmitInvoice = async () => {
    if (!invoice?.id) return;
    setInvoiceSaving(true);
    const { error } = await submitInvoiceRpc(invoice.id);
    setInvoiceSaving(false);
    if (error) { showToast?.('Gagal menandai invoice: ' + (error.message || 'unknown error'), 'error'); return; }
    showToast?.('Invoice ditandai sudah diupload ke portal', 'success');
    await sesudahBerubah();
  };

  // Pesan RAISE dari record_payment sudah manusiawi & berbahasa Indonesia
  // (mis. "Peran akun [kas_bank] belum dipetakan untuk entitas [SOA]…"), jadi
  // diteruskan apa adanya — jangan dibungkus pesan generik.
  const handleRecordPayment = async () => {
    if (!invoice?.id || paySaving) return;
    const amt = Number(payForm.amount) || 0;
    if (amt <= 0) { showToast?.('Nominal pembayaran harus lebih besar dari nol', 'error'); return; }
    setPaySaving(true);
    const { error } = await recordPayment({
      invoiceId:      invoice.id,
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
    await sesudahBerubah();
    const { data } = await getPaymentHistory(invoice.id);
    setPayments(data || []);
    setPayForm({ amount: '', paymentDate: getTodayWIB(), reference: '', pph: '', buktiUrl: '', buktiNo: '' });
    setPphTouched(false);
    setPaySaving(false);
    showToast?.('Pembayaran dicatat', 'success');
  };

  const handleMarkTtf = async () => {
    if (!invoice?.id || ttfSaving) return;
    if (!ttfForm.receivedBy.trim()) { showToast?.('Nama penerima wajib diisi', 'error'); return; }
    setTtfSaving(true);
    const { error } = await markTtfReceived({
      invoiceId:  invoice.id,
      receivedBy: ttfForm.receivedBy.trim(),
      ttfNo:      ttfForm.ttfNo.trim() || null,
      notes:      ttfForm.notes.trim() || null,
    });
    if (error) {
      setTtfSaving(false);
      showToast?.(error.message || 'Gagal menandai TTF', 'error');
      return;
    }
    const { data } = await getTtfStatus(invoice.id);
    setTtf(data || null);
    setTtfForm({ receivedBy: '', ttfNo: '', notes: '' });
    setTtfEditing(false);
    setTtfSaving(false);
    showToast?.(ttfEditing ? 'TTF diperbarui' : 'TTF ditandai diterima', 'success');
  };

  const handleInvoicePdf = async (variant) => {
    if (!invoice?.id) return;
    setInvoicePdfBusy(variant);
    try {
      const { data: pdfData, error } = await getInvoicePdfData(invoice.id);
      if (error || !pdfData) {
        showToast?.('Gagal menyiapkan data invoice: ' + (error?.message || 'unknown error'), 'error');
        return;
      }
      const blob = await pdf(<InvoicePDF invoice={pdfData} variant={variant} />).toBlob();
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
  };

  // FASE 4 — invoice cuma boleh diterbitkan saat seluruh qty sudah terkirim
  // (cermin guard Sigma shipped=Sigma qty di RPC; dihitung dari angka yang
  // dikirim halaman induk, bukan query baru).
  const canCreateInvoice = !!spOrderId && totalQty > 0 && shippedQty === totalQty;

  // Sisa tagihan = total_amount - Sigma(amount + pph). TIDAK di-clamp ke nol:
  // kalau tercatat lebih bayar, angkanya sengaja tampil negatif.
  const paidSettled = payments.reduce((sum, p) => sum + (Number(p.amount) || 0) + (Number(p.pph) || 0), 0);
  const sisaTagihan = (Number(invoice?.total_amount) || 0) - paidSettled;
  // Saran PPh 23 = total ongkir x 2%. Suku ongkir = total_amount - dpp - ppn.
  const totalOngkirInv = (Number(invoice?.total_amount) || 0)
    - (Number(invoice?.total_dpp) || 0) - (Number(invoice?.total_ppn) || 0);
  const pphSuggestion = Math.round(Math.max(0, totalOngkirInv) * 0.02);
  const invStatus = invoice?.status || null;
  const showPaymentForm = canRecordPayment && ['issued', 'submitted', 'partial'].includes(invStatus);
  const showPaymentHistory = !!invStatus && !['draft', 'void'].includes(invStatus);
  const showTtfBlock = canMarkTtf && ['issued', 'submitted', 'partial', 'paid'].includes(invStatus);

  // Kartu MANDIRI (hasil un-merge). Di mockup asli ini card terpisah ber-kicker
  // "Invoice" (grid-column 1/-1). SELURUH field fungsional dipertahankan —
  // mockup cuma badge+tombol, itu contoh bentuk, bukan spek fungsi.
  // `gridColumn` dipertahankan apa adanya: ia hanya berarti saat panel ini
  // dirender di dalam grid (Detail Invoice melakukannya), dan mencabutnya
  // berarti menyentuh isi kartu yang seharusnya pindah apa adanya.
  return (
    <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: RADIUS.md, padding: SP.s3, gridColumn: '1 / -1' }}>
      <div style={{ ...kickerStyle }}>Invoice</div>
      <div style={{ marginTop: SP.s2 }}>
        {invoiceLoading ? (
          <p style={{ fontSize: 13, color: C.inkFaint, padding: '10px 0' }}>Memuat…</p>
        ) : invoice ? (
          <>
            {[
              { k: 'No. Invoice', v: invoice.invoice_no || '—' },
              { k: 'Tanggal',     v: fmtDate(invoice.invoice_date) },
              // due_date kini diisi SAAT TERBIT oleh create_invoice_for_sp
              // (AR Tahap 1 butir b, 20260926000002) — sebelumnya baru saat
              // submit. Invoice LAMA tetap NULL sampai backfill AR Tahap 2
              // (20260927000001) jalan di lingkungan itu.
              { k: 'Batas Waktu Pembayaran', v: fmtDate(invoice.due_date) },
              { k: 'DPP',         v: rp(invoice.total_dpp) },
              { k: 'PPN',         v: rp(invoice.total_ppn) },
            ].map(row => (
              <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', fontSize: 13, borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ color: C.inkSoft, fontWeight: 600 }}>{row.k}</span>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>{row.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0 0', marginTop: 5, borderTop: `1.5px solid ${C.line}` }}>
              <span style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>Total</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700, color: C.grandTotal }}>{rp(invoice.total_amount)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
              {invoice.status === 'submitted' ? (
                <Badge {...TAG_PALE}>Submitted</Badge>
              ) : (
                <Badge {...TAG_OUTLINE}>Issued</Badge>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => handleInvoicePdf('download')}
                  disabled={!!invoicePdfBusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: invoicePdfBusy ? C.inkFaint : C.inkSoft, fontSize: 13, fontWeight: 600, cursor: invoicePdfBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  <Download size={13}/> {invoicePdfBusy === 'download' ? 'Menyiapkan…' : 'Download'}
                </button>
                {/* Versi untuk KERTAS KOP: tanpa blok kop & tanpa latar krem,
                    isinya dijauhkan dari kop/kaki yang sudah tercetak.
                    Gate-nya SENGAJA identik dgn tombol Download di atas —
                    tak ada syarat role yang ditambah maupun dikurangi. */}
                <button
                  onClick={() => handleInvoicePdf('print')}
                  disabled={!!invoicePdfBusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: invoicePdfBusy ? C.inkFaint : C.inkSoft, fontSize: 13, fontWeight: 600, cursor: invoicePdfBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  <Printer size={13}/> {invoicePdfBusy === 'print' ? 'Menyiapkan…' : 'Cetak (Kop Surat)'}
                </button>
                {invoice.status === 'issued' && (
                  <button
                    onClick={handleSubmitInvoice}
                    disabled={invoiceSaving}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', height: 34, borderRadius: 8, border: `1px solid ${invoiceSaving ? C.line : C.accent}`, background: 'transparent', color: invoiceSaving ? C.inkFaint : C.accent, fontSize: 13, fontWeight: 600, cursor: invoiceSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                  >
                    <Send size={13}/> {invoiceSaving ? 'Menyimpan…' : 'Submit'}
                  </button>
                )}
              </div>
            </div>

            {/* ── TASK 5: badge Lunas ─────────────────────────────── */}
            {invStatus === 'paid' && (
              <div style={{ marginTop: SP.s3 }}>
                <Badge {...TAG_PALE}>Lunas</Badge>
              </div>
            )}

            {/* ── TASK 2: Terima Pembayaran (inline) ──────────────── */}
            {showPaymentForm && (
              <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: SP.s3, paddingTop: SP.s3 }}>
                <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Terima Pembayaran</div>
                {/* Label dinamis: negatif = kelebihan bayar, ditampilkan
                    sebagai angka positif dgn warna perlu-perhatian.
                    Murni tampilan — perhitungan sisaTagihan tak berubah. */}
                <div style={{ fontSize: 13, marginBottom: SP.s2 }}>
                  {sisaTagihan >= 0 ? (
                    <>
                      <span style={{ color: C.inkSoft }}>Sisa Tagihan: </span>
                      <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.ink }}>
                        {rp(sisaTagihan)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: C.attn }}>Lebih Bayar: </span>
                      <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: C.attn }}>
                        {rp(Math.abs(sisaTagihan))}
                      </span>
                    </>
                  )}
                </div>

                <ModalGrid cols={3}>
                  <ModalField label="Nominal Pembayaran (Rp)" req>
                    <ModalInp type="number" value={payForm.amount} onFocus={selectOnFocus}
                      onChange={e => setPayForm(f => ({ ...f, amount: e.target.value.replace(/^0+(?=\d)/, '') }))}/>
                  </ModalField>
                  <ModalField label="Tanggal Bayar">
                    <ModalInp type="date" value={payForm.paymentDate}
                      onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))}/>
                  </ModalField>
                  <ModalField label="Referensi / No. Transfer">
                    <ModalInp value={payForm.reference}
                      onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}/>
                  </ModalField>
                </ModalGrid>

                <div style={{ marginTop: SP.s2 }}>
                  <ModalGrid cols={3}>
                    <ModalField label="PPh 23 (Rp)">
                      {/* Prefill saran sekali; begitu user mengetik, nilainya tak ditimpa lagi. */}
                      <ModalInp type="number"
                        value={pphTouched ? payForm.pph : (payForm.pph || String(pphSuggestion))}
                        onFocus={selectOnFocus}
                        onChange={e => { setPphTouched(true); setPayForm(f => ({ ...f, pph: e.target.value })); }}/>
                      <span style={{ fontSize: 11, color: C.inkFaint }}>
                        Saran otomatis, sesuaikan dengan bukti potong asli.
                      </span>
                    </ModalField>
                    <ModalField label="Link Bukti Potong">
                      <ModalInp type="url" placeholder="https://drive.google.com/…" value={payForm.buktiUrl}
                        onChange={e => setPayForm(f => ({ ...f, buktiUrl: e.target.value }))}/>
                    </ModalField>
                    <ModalField label="No. Bukti Potong">
                      <ModalInp value={payForm.buktiNo}
                        onChange={e => setPayForm(f => ({ ...f, buktiNo: e.target.value }))}/>
                    </ModalField>
                  </ModalGrid>
                </div>

                <button
                  onClick={handleRecordPayment}
                  disabled={paySaving || !(Number(payForm.amount) > 0)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: SP.s3, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${(!paySaving && Number(payForm.amount) > 0) ? C.accent : C.line}`, background: 'transparent', color: (!paySaving && Number(payForm.amount) > 0) ? C.accent : C.inkFaint, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: (!paySaving && Number(payForm.amount) > 0) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY }}
                >
                  <Wallet size={14}/> {paySaving ? 'Menyimpan…' : 'Catat Pembayaran'}
                </button>
              </div>
            )}

            {/* ── TASK 3: Riwayat Pembayaran (inline) ─────────────── */}
            {showPaymentHistory && (
              <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: SP.s3, paddingTop: SP.s3 }}>
                <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Riwayat Pembayaran</div>
                {payments.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.inkFaint, margin: 0 }}>Belum ada pembayaran tercatat.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {[['Tanggal', 'left'], ['Nominal', 'right'], ['PPh', 'right'], ['Referensi', 'left']].map(([h, align]) => (
                            <th key={h} style={{ ...thStyle, textAlign: align, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(pm => (
                          <tr key={pm.id}>
                            <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, whiteSpace: 'nowrap' }}>{fmtDate(pm.payment_date)}</td>
                            <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>{rp(pm.amount)}</td>
                            <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}`, textAlign: 'right', fontFamily: FONT_MONO, color: C.inkSoft, whiteSpace: 'nowrap' }}>{rp(pm.pph)}</td>
                            <td style={{ padding: SP.s2, borderBottom: `1px solid ${C.lineSoft}` }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {pm.reference || '—'}
                                {pm.bukti_potong_url && (
                                  <a href={pm.bukti_potong_url} target="_blank" rel="noopener noreferrer"
                                     title={pm.bukti_potong_no ? `Bukti potong ${pm.bukti_potong_no}` : 'Bukti potong'}
                                     style={{ color: C.accent, display: 'inline-flex', alignItems: 'center' }}>
                                    <Link2 size={13}/>
                                  </a>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── TASK 4: TTF (inline) ────────────────────────────── */}
            {showTtfBlock && (
              <div style={{ borderTop: `1px solid ${C.lineSoft}`, marginTop: SP.s3, paddingTop: SP.s3 }}>
                <div style={{ ...kickerStyle, marginBottom: SP.s2 }}>Tanda Terima Faktur</div>
                {(ttf?.tanggal_menerima && !ttfEditing) ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s2, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      TTF diterima <b>{fmtDate(ttf.tanggal_menerima)}</b>
                      {ttf.diterima_oleh ? <> oleh <b>{ttf.diterima_oleh}</b></> : null}
                      {ttf.no_ttf ? <span style={{ color: C.inkSoft }}> &middot; No. {ttf.no_ttf}</span> : null}
                    </p>
                    {/* Masuk mode form dgn data existing sbg prefill. RPC
                        mark_ttf_received sudah upsert (IF v_ttf_id IS NULL
                        → INSERT, ELSE → UPDATE), jadi submit yang sama
                        akan memperbarui baris, bukan bikin TTF kedua. */}
                    <button
                      onClick={() => {
                        setTtfForm({
                          receivedBy: ttf.diterima_oleh || '',
                          ttfNo:      ttf.no_ttf || '',
                          notes:      ttf.notes || '',
                        });
                        setTtfEditing(true);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 9px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                    >
                      <Pencil size={12}/> Edit
                    </button>
                  </div>
                ) : (
                  <>
                    <ModalGrid cols={3}>
                      <ModalField label="Nama Penerima" req>
                        <ModalInp value={ttfForm.receivedBy}
                          onChange={e => setTtfForm(f => ({ ...f, receivedBy: e.target.value }))}/>
                      </ModalField>
                      <ModalField label="No. TTF">
                        <ModalInp value={ttfForm.ttfNo}
                          onChange={e => setTtfForm(f => ({ ...f, ttfNo: e.target.value }))}/>
                      </ModalField>
                      <ModalField label="Catatan">
                        <ModalInp value={ttfForm.notes}
                          onChange={e => setTtfForm(f => ({ ...f, notes: e.target.value }))}/>
                      </ModalField>
                    </ModalGrid>
                    <div style={{ display: 'flex', gap: SP.s2, marginTop: SP.s3, flexWrap: 'wrap' }}>
                      <button
                        onClick={handleMarkTtf}
                        disabled={ttfSaving || !ttfForm.receivedBy.trim()}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${(!ttfSaving && ttfForm.receivedBy.trim()) ? C.accent : C.line}`, background: 'transparent', color: (!ttfSaving && ttfForm.receivedBy.trim()) ? C.accent : C.inkFaint, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: (!ttfSaving && ttfForm.receivedBy.trim()) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY }}
                      >
                        <Check size={14}/> {ttfSaving ? 'Menyimpan…' : (ttfEditing ? 'Simpan Perubahan' : 'Tandai TTF Diterima')}
                      </button>
                      {ttfEditing && (
                        <button
                          onClick={() => { setTtfEditing(false); setTtfForm({ receivedBy: '', ttfNo: '', notes: '' }); }}
                          disabled={ttfSaving}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${C.line}`, background: 'transparent', color: C.inkSoft, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: ttfSaving ? 'not-allowed' : 'pointer', fontFamily: FONT_DISPLAY }}
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP.s3, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Badge {...TAG_ATTN}>Belum Diterbitkan</Badge>
              <p style={{ fontSize: 13, opacity: .8, margin: `${SP.s2}px 0 0` }}>
                Invoice diterbitkan setelah barang selesai dikirim atau atas permintaan pelanggan.
              </p>
              {!canCreateInvoice && (
                <p style={{ fontSize: 12, color: C.inkFaint, marginTop: SP.s1 }}>
                  {!spOrderId
                    ? 'SP ini belum punya data skema baru (sp_orders) — invoice belum bisa diterbitkan.'
                    : totalQty === 0
                    ? 'SP belum punya item.'
                    : `Belum bisa diterbitkan — outstanding ${(totalQty - shippedQty).toLocaleString('id-ID')} dari ${totalQty.toLocaleString('id-ID')} qty (${shippedQty.toLocaleString('id-ID')} sudah terkirim). Invoice hanya bisa diterbitkan setelah seluruh qty terkirim penuh.`}
                </p>
              )}
            </div>
            <button
              onClick={handleCreateInvoice}
              disabled={!canCreateInvoice || invoiceSaving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9.2px 16.56px', borderRadius: RADIUS.md, border: `1px solid ${(canCreateInvoice && !invoiceSaving) ? C.accent : C.line}`, background: 'transparent', color: (canCreateInvoice && !invoiceSaving) ? C.accent : C.inkFaint, fontSize: 14, fontWeight: 600, lineHeight: 1.2, cursor: (canCreateInvoice && !invoiceSaving) ? 'pointer' : 'not-allowed', fontFamily: FONT_DISPLAY, flexShrink: 0 }}
            >
              <Receipt size={14}/> {invoiceSaving ? 'Menerbitkan…' : 'Terbitkan Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
