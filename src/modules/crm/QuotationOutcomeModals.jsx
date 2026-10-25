// src/modules/crm/QuotationOutcomeModals.jsx
// MarkAcceptedModal — Keputusan Den 25 Okt 2026, Putaran 5 K1d: quotation
// yang ditandai Accepted WAJIB disertai bukti (Accepted otomatis menjadikan
// inquiry terkait WON, lihat trg_fn_inquiry_won_on_quotation_accepted) --
// jalur ini harus seketat Mark as Won manual yang sudah mewajibkan bukti.
//
// SENGAJA FILE BARU, SATU KOMPONEN SAJA (bukan dipadatkan ke
// QuotationDetailPage.jsx yang sudah panjang) -- pola sama DealWonModals.jsx
// (file terpisah khusus modal berkonsekuensi WON, dipisah dari modal
// konfirmasi polos RejectReasonModal yang tetap LOKAL di QuotationDetailPage).
//
// Bentuknya MENIRU MarkWonModal (DealWonModals.jsx) minus dropdown alasan --
// mockup "Record Outcome" (Quotation Management.dc.html) tidak punya konsep
// whitelist alasan untuk Accepted, hanya Notes bebas + bukti wajib (deviasi
// dari mockup yang SEBENARNYA, dilaporkan terpisah, bukan tiru-tempel yang
// tak sesuai sumbernya). Palet DITERIMA LEWAT PROP `tokens` (bukan diimpor
// dari DealPanels.jsx) -- QuotationDetailPage.jsx punya `C` lokalnya sendiri
// (cream/orange, BUKAN kit sage -- Quotation belum pada gilirannya migrasi
// kit), dan modal ini harus terasa satu keluarga dengan RejectReasonModal
// (sibling di halaman yang sama), bukan membawa palet CRM v3.
//
// Pemanggil WAJIB mengoper `key` yang berubah tiap kali dibuka supaya
// komponen remount dengan field bersih -- pola sama DealWonModals/
// RejectReasonModal.

import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Paperclip } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   MarkAcceptedModal
   onSave({ notes, file }) -- pemanggil yang memanggil
   setQuotationOutcomeWithEvidence (src/lib/db.js), yang mengunggah `file` ke
   bucket quotation-acceptance-evidence (path company_id/quotation_id/uuid.ext)
   lalu memanggil set_quotation_outcome(quotationId, 'ACCEPTED', notes, path).
   Modal ini TIDAK memanggil supabase sama sekali -- murni form, pola sama
   MarkWonModal.
   `uploadError` -- pesan dari pemanggil saat unggah gagal; modal TETAP
   TERBUKA, user menekan submit lagi untuk mencoba ulang (file yang sama
   masih terpilih).
   ═══════════════════════════════════════════════════════════════════════════ */
export function MarkAcceptedModal({ open, quotationNo, saving, uploadError, tokens: C, onSave, onCancel }) {
  const [notes, setNotes] = useState('');
  const [file,  setFile]  = useState(null);
  const [err,   setErr]   = useState('');

  if (!open) return null;

  const submit = () => {
    if (!file) { setErr('Proof is required.'); return; }
    setErr('');
    onSave?.({ notes: notes.trim() || null, file });
  };

  const field = {
    width: '100%', boxSizing: 'border-box', borderRadius: 8, padding: '9px 11px',
    border: `1px solid ${C.line}`, background: C.surface, fontSize: 13,
    color: C.ink, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
  };
  const btnGhost = {
    padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.surface2, color: C.inkSoft, fontSize: 13, fontWeight: 600,
    cursor: saving ? 'not-allowed' : 'pointer',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,18,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} role="dialog" aria-modal="true">
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, padding: '22px 24px', width: 460, maxWidth: '100%', boxShadow: '0 12px 40px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 6 }}>
          <CheckCircle2 size={17} style={{ color: C.ok, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 15.5, fontWeight: 800 }}>Record customer acceptance</div>
        </div>
        <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 16, lineHeight: 1.5 }}>
          {quotationNo} will be marked ACCEPTED, and the linked inquiry will be moved to Won
          automatically. A proof document is required.
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, marginBottom: 5 }} htmlFor="quo-accept-notes">
          Notes <span style={{ fontWeight: 400, textTransform: 'none' }}>Optional</span>
        </label>
        <textarea
          id="quo-accept-notes" rows={3} style={field} value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. customer confirmed by email, PO number PO-12345"
        />

        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkFaint, marginBottom: 5 }}>
            Proof <span style={{ color: C.orange }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {file && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px',
                borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft,
              }}>
                <Paperclip size={11} />{file.name}
              </span>
            )}
            <label style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {file ? 'Replace file' : 'Upload signed quotation, PO, or email approval'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                style={{ display: 'none' }}
                disabled={saving}
                onChange={(e) => { setFile(e.target.files?.[0] || null); if (err) setErr(''); }}
              />
            </label>
          </div>
        </div>

        {(err || uploadError) && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12,
            padding: '9px 11px', borderRadius: 8,
            background: C.dangerBg, border: `1px solid ${C.dangerBd}`,
            fontSize: 12.5, color: C.danger,
          }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            {err || uploadError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
          <button onClick={onCancel} disabled={saving} style={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={saving}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.ok, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving ? 'Working…' : 'Yes, Mark Accepted'}
          </button>
        </div>
      </div>
    </div>
  );
}
