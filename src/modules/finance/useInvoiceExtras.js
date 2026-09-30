// src/modules/finance/useInvoiceExtras.js
// Kelakuan BARU Detail Invoice: catatan internal, lampiran, dan data pajak.
//
// Sengaja TERPISAH dari `useInvoiceWorkflow.js`. Hook itu memegang kelakuan
// yang DIPINDAH apa adanya dari panel lama, dan nilainya ada pada diff-nya yang
// bisa dibaca sebagai "nol logika berubah". Menumpuk hal baru ke dalamnya
// menghapus sifat itu.
//
// Seluruh penulisan lewat RPC: sejak 20260928000004 `authenticated` tidak punya
// hak tulis langsung ke tabel invoice, jadi memang tidak ada jalur lain.
//
// Nol JSX -- berkas ini tetap `.js`.
import { useCallback, useEffect, useState } from 'react';
import {
  listInvoiceNotes, addInvoiceNote, deleteInvoiceNote,
  listInvoiceAttachments, uploadInvoiceAttachment, deleteInvoiceAttachment,
  signInvoiceAttachment, setInvoiceTaxInfo, markInvoicePrinted,
  approveInvoiceRpc, rejectInvoiceRpc, getInvoiceAuditTrail,
  INVOICE_DOC_MAX_BYTES, INVOICE_DOC_MIME,
} from '../../lib/db';
import { useAuth } from '../../contexts/useAuth';
import { isManagerOrAbove, isSuperAdmin, canApproveInvoice, roleCodesOf } from '../../lib/roles';

/**
 * @param {object}   p
 * @param {object}   p.invoice    baris invoice yang sedang dibuka (boleh null)
 * @param {function} p.showToast
 * @param {function} p.onChanged  dipanggil sesudah data pajak berubah, supaya
 *                                halaman memuat ulang kepala invoice-nya.
 */
export default function useInvoiceExtras({ invoice, showToast, onChanged }) {
  const [notes,       setNotes]       = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [noteDraft,   setNoteDraft]   = useState('');
  const [noteSaving,  setNoteSaving]  = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [taxForm,     setTaxForm]     = useState({ fakturNo: '', coretaxTxCode: '' });
  const [taxSaving,   setTaxSaving]   = useState(false);
  const [auditTrail,  setAuditTrail]  = useState([]);
  const [approveSaving, setApproveSaving] = useState(false);
  const [rejectSaving,  setRejectSaving]  = useState(false);

  const { erpRoles, user } = useAuth();
  const kode   = roleCodesOf(erpRoles);
  const super_ = isSuperAdmin(erpRoles);
  // Cermin guard RPC. ⛔ Kalau daftar peran di RPC berubah, ubah DI SINI juga --
  // kelas checklist TD-233. Cermin ini TIDAK menentukan izin; ia hanya
  // memutuskan sebuah kolom tampil bisa diisi atau tidak (aturan K-6).
  const bolehIsiPajak  = super_ || kode.includes('finance_controller') || kode.includes('finance');
  const bolehUnggah    = super_ || isManagerOrAbove(erpRoles)
                      || kode.includes('finance_controller') || kode.includes('finance');

  // AR Tahap 3 bagian kedua -- approve/reject. Cermin approve_invoice_issue/
  // reject_invoice_issue: TANPA is_manager_or_above, DENGAN ceo (lihat
  // canApproveInvoice, src/lib/roles.js). "Tidak boleh menyetujui/menolak
  // pengajuan sendiri kecuali super_admin" dicerminkan di sini (bukan di
  // roles.js) karena butuh membandingkan created_by baris INI dengan user
  // yang sedang login -- bukan sesuatu yang bisa dijawab dari erpRoles saja.
  const diajukanSendiri = !!invoice?.created_by && invoice.created_by === user?.id;
  const bolehApprove = canApproveInvoice(erpRoles) && !(diajukanSendiri && !super_);

  const invoiceId = invoice?.id || null;
  const companyId = invoice?.company_id || null;

  const muatCatatan = useCallback(async () => {
    if (!invoiceId) return;
    const { data } = await listInvoiceNotes(invoiceId);
    setNotes(data || []);
  }, [invoiceId]);

  const muatLampiran = useCallback(async () => {
    if (!invoiceId) return;
    const { data } = await listInvoiceAttachments(invoiceId);
    setAttachments(data || []);
  }, [invoiceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invoiceId) { setNotes([]); setAttachments([]); return undefined; }
    let batal = false;
    Promise.all([listInvoiceNotes(invoiceId), listInvoiceAttachments(invoiceId)])
      .then(([n, a]) => {
        if (batal) return;
        setNotes(n.data || []);
        setAttachments(a.data || []);
      });
    return () => { batal = true; };
  }, [invoiceId]);

  const muatRiwayat = useCallback(async () => {
    if (!invoiceId) { setAuditTrail([]); return; }
    const { data } = await getInvoiceAuditTrail(invoiceId);
    setAuditTrail(data || []);
  }, [invoiceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!invoiceId) { setAuditTrail([]); return undefined; }
    let batal = false;
    getInvoiceAuditTrail(invoiceId).then(({ data }) => { if (!batal) setAuditTrail(data || []); });
    return () => { batal = true; };
  }, [invoiceId]);

  // Prefill data pajak dari nilai yang sudah ada -- supaya kolom yang terisi
  // tampil apa adanya dan tidak terbaca sebagai "belum diisi".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTaxForm({
      fakturNo: invoice?.faktur_no || '',
      coretaxTxCode: invoice?.coretax_tx_code || '',
    });
  }, [invoice?.faktur_no, invoice?.coretax_tx_code]);

  const simpanPajak = useCallback(async () => {
    if (!invoiceId || taxSaving) return;
    const f = taxForm.fakturNo.trim();
    const c = taxForm.coretaxTxCode.trim();
    if (!f && !c) { showToast?.('Isi nomor Faktur Pajak atau kode Coretax lebih dulu', 'error'); return; }
    setTaxSaving(true);
    // Hanya kirim yang BERUBAH. Mengirim nilai lama yang sama sebenarnya
    // idempoten di server, tapi mengirimnya tetap membuat satu baris audit_logs
    // untuk perubahan yang tidak terjadi.
    const { error } = await setInvoiceTaxInfo({
      invoiceId,
      fakturNo:      f && f !== (invoice?.faktur_no || '')       ? f : null,
      coretaxTxCode: c && c !== (invoice?.coretax_tx_code || '') ? c : null,
    });
    setTaxSaving(false);
    if (error) { showToast?.(error.message || 'Gagal menyimpan data pajak', 'error'); return; }
    showToast?.('Data pajak tersimpan', 'success');
    await onChanged?.();
  }, [invoiceId, taxSaving, taxForm, invoice, showToast, onChanged]);

  const kirimCatatan = useCallback(async () => {
    if (!invoiceId || noteSaving) return;
    const body = noteDraft.trim();
    if (!body) { showToast?.('Catatan tidak boleh kosong', 'error'); return; }
    setNoteSaving(true);
    const { error } = await addInvoiceNote(invoiceId, body);
    setNoteSaving(false);
    if (error) { showToast?.(error.message || 'Gagal menyimpan catatan', 'error'); return; }
    setNoteDraft('');
    await muatCatatan();
  }, [invoiceId, noteSaving, noteDraft, showToast, muatCatatan]);

  const hapusCatatan = useCallback(async (noteId) => {
    const { error } = await deleteInvoiceNote(noteId);
    if (error) { showToast?.(error.message || 'Gagal menghapus catatan', 'error'); return; }
    await muatCatatan();
  }, [showToast, muatCatatan]);

  const unggah = useCallback(async (fileList) => {
    if (!invoiceId || !companyId || uploading) return;
    const berkas = Array.from(fileList || []);
    if (berkas.length === 0) return;
    if (attachments.length + berkas.length > 10) {
      showToast?.(`Maksimum 10 lampiran per invoice (sekarang ${attachments.length}).`, 'error');
      return;
    }
    setUploading(true);
    let sukses = 0;
    // Berurutan, BUKAN Promise.all: RPC-nya membatasi 10 lampiran per invoice
    // dan menghitungnya saat dipanggil. Unggahan paralel bisa sama-sama membaca
    // hitungan lama lalu sama-sama lolos -- batasnya jadi tidak mengikat.
    for (const file of berkas) {
      const { error } = await uploadInvoiceAttachment({ invoiceId, companyId, file });
      if (error) showToast?.(error.message || `Gagal mengunggah ${file.name}`, 'error');
      else sukses += 1;
    }
    await muatLampiran();
    setUploading(false);
    if (sukses > 0) showToast?.(`${sukses} lampiran diunggah`, 'success');
  }, [invoiceId, companyId, uploading, attachments.length, showToast, muatLampiran]);

  /** Jejak cetak. Dipanggil SESUDAH PDF-nya benar-benar jadi -- mencatat lebih
   *  dulu akan menghitung percobaan yang gagal sebagai cetakan.
   *  Kegagalannya SENGAJA diam: yang gagal cuma jejaknya, sementara PDF-nya
   *  sudah di tangan orangnya. Toast merah di situ hanya membuat cetakan yang
   *  berhasil terlihat gagal. */
  const catatCetak = useCallback(async (variant) => {
    if (!invoiceId) return;
    const { error } = await markInvoicePrinted(invoiceId, variant);
    if (error) return;
    await onChanged?.();
  }, [invoiceId, onChanged]);

  const hapusLampiran = useCallback(async (id) => {
    const { error } = await deleteInvoiceAttachment(id);
    if (error) { showToast?.(error.message || 'Gagal menghapus lampiran', 'error'); return; }
    await muatLampiran();
  }, [showToast, muatLampiran]);

  /** Buka lampiran lewat URL bertanda tangan (bucket PRIVAT, berlaku 60 menit).
   *  Dibuat saat diklik dan tidak disimpan -- URL yang disimpan akan bocor
   *  masa berlakunya ke tempat yang tidak kita kendalikan. */
  const bukaLampiran = useCallback(async (storagePath) => {
    const { data, error } = await signInvoiceAttachment(storagePath);
    if (error || !data) { showToast?.(error?.message || 'Gagal membuka lampiran', 'error'); return; }
    window.open(data, '_blank', 'noopener,noreferrer');
  }, [showToast]);

  /** Setujui invoice pending_approval. onChanged memuat ulang kepala invoice
   *  (invoice_no/status baru lahir di sana); muatRiwayat menambahkan entri
   *  SETUJUI_INVOICE ke panel Riwayat tanpa reload halaman. */
  const handleApproveInvoice = useCallback(async () => {
    if (!invoiceId || approveSaving) return;
    setApproveSaving(true);
    const { error } = await approveInvoiceRpc(invoiceId);
    setApproveSaving(false);
    if (error) { showToast?.(error.message || 'Gagal menyetujui invoice', 'error'); return; }
    showToast?.('Invoice disetujui', 'success');
    await Promise.all([onChanged?.(), muatRiwayat()]);
  }, [invoiceId, approveSaving, showToast, onChanged, muatRiwayat]);

  /** Tolak invoice pending_approval. Catatan wajib -- diperiksa di sini SAJA
   *  supaya pesannya muncul sebelum panggilan RPC (RPC menolak juga, tapi
   *  pesan client lebih cepat). Returns boolean sukses -- pemanggil (form
   *  inline Tolak) memakainya untuk memutuskan tutup form atau biarkan
   *  catatan yang sudah diketik tetap ada saat gagal. */
  const handleRejectInvoice = useCallback(async (rejectionNote) => {
    if (!invoiceId || rejectSaving) return false;
    const catatan = (rejectionNote || '').trim();
    if (!catatan) { showToast?.('Catatan penolakan wajib diisi', 'error'); return false; }
    setRejectSaving(true);
    const { error } = await rejectInvoiceRpc(invoiceId, catatan);
    setRejectSaving(false);
    if (error) { showToast?.(error.message || 'Gagal menolak invoice', 'error'); return false; }
    showToast?.('Invoice ditolak', 'success');
    await Promise.all([onChanged?.(), muatRiwayat()]);
    return true;
  }, [invoiceId, rejectSaving, showToast, onChanged, muatRiwayat]);

  return {
    notes, attachments,
    noteDraft, setNoteDraft, noteSaving, kirimCatatan, hapusCatatan,
    uploading, unggah, hapusLampiran, bukaLampiran, catatCetak,
    taxForm, setTaxForm, taxSaving, simpanPajak,
    bolehIsiPajak, bolehUnggah, isSuperAdmin: super_,
    auditTrail, bolehApprove, diajukanSendiri, approveSaving, rejectSaving,
    handleApproveInvoice, handleRejectInvoice,
    maxBytes: INVOICE_DOC_MAX_BYTES, mimeDiterima: INVOICE_DOC_MIME,
  };
}
