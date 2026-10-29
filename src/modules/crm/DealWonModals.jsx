// src/modules/crm/DealWonModals.jsx
// Modal penutupan deal — TD-318 Irisan 3, diselaraskan ke mockup Inquiry
// Management.dc.html Putaran 11 Tahap C.
//   MarkWonModal   — Won manual: alasan (4 pilihan tetap), notes opsional,
//                    bukti wajib (file dipilih di sini, DIUNGGAH + RPC
//                    mark_inquiry_won dipanggil oleh PEMANGGIL lewat onSave,
//                    bukan di dalam modal ini sendiri -- pola sama
//                    LostReasonModal/CancelReasonModal di DealCloseModals.jsx).
//   RevertWonModal — Revert Manual Win: alasan wajib. Memanggil
//                    revert_manual_win lewat onSave pemanggil.
//
// SENGAJA FILE BARU (pola sama DealCloseModals.jsx) -- bukan menambah mode ke
// ConfirmModal generik, supaya pilih-berkas + validasi alasan/bukti tidak
// bercampur dengan komponen konfirmasi polos yang dipakai di banyak tempat.
//
// Pemanggil WAJIB mengoper `key` yang berubah tiap kali dibuka supaya
// komponen remount dengan field bersih -- pola sama DealCloseModals.
//
// Putaran 11 Tahap C -- tiga banner mockup diaudit, DUA dibangun, SATU
// SENGAJA DILEWATI (keputusan Den):
//   - Saran "Record the customer's acceptance on the quotation instead" --
//     dibangun, hanya tampil bila ADA quotation berstatus SENT (gate PERSIS
//     `canRecordOutcome` QuotationDetailPage.jsx:410) -- data `sentQuotation`
//     dihitung PEMANGGIL dari `quotations` yang sudah di-fetch, nol query baru.
//   - "First win" -- dibangun TANPA kode customer (koreksi Vir: kode akun
//     [MSI0001 dst] dibuat SAAT akun di-INSERT oleh trg_z_gen_account_code_ins,
//     BUKAN saat Won pertama -- tidak ada "kode customer" yang lahir di momen
//     ini) dan TANPA kalimat "onboarding starts" (Nexus nol fitur onboarding).
//     Gate: `isFirstWin` dihitung PEMANGGIL dari `account?.lifecycle_stage`
//     yang sudah ada di state halaman -- nol query baru.
//   - Banner `wonDeny` ("Only the inquiry owner or a Manager can mark this
//     inquiry as won.") TIDAK dibangun -- keadaan itu TIDAK TERJANGKAU:
//     tombol primer "Mark as Won" di DealDetailPage.jsx SUDAH digerbang
//     `canMarkWon` yang PERSIS gate ini, jadi modal ini tak pernah terbuka
//     dalam keadaan yang coba diperingatkan banner itu.
//   - "Prototype, upload result" (selector Works/Upload fails/File not
//     found) TIDAK dibangun -- harness simulasi khusus mockup, bukan field
//     produk (keputusan Den eksplisit).
// Helper Proof kondisional (`hasSupervisor`) dibangun persis mockup --
// `hasSupervisor` = `!!profile?.reports_to` MILIK PEMANGGIL RPC (auth.uid()),
// BUKAN pemilik inquiry -- cermin persis `mark_inquiry_won`
// (20261021000001:173, `SELECT reports_to ... WHERE id = auth.uid()`).

import { useState } from 'react';
import { CheckCircle2, RotateCcw, AlertTriangle, Info, Paperclip } from 'lucide-react';
import { DEAL_C as C } from './inquiryTheme';
import { HEAD, BODY } from './DealPanels';
import { WON_MANUAL_REASONS } from './inquiryOptions';

// [Putaran 16a Tahap 1] Chrome overlay/sheet diukur mockup
// data-screen-label="Modal/MarkWon"/"Modal/RevertManualWin": backdrop INK
// rgba(51,66,43,.35) + sheet NOL border, box-shadow rgba(51,66,43,.22),
// radius 18.
const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: C.backdrop, display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
};
const sheet = {
  width: '100%', maxWidth: 480, background: C.surface,
  borderRadius: 18, boxShadow: C.shadowModal, overflow: 'hidden',
};
// [Putaran 16a Tahap 1] label field diukur mockup: INK_SOFT (textMute),
// bukan INK_FAINT (textFaint).
const label = {
  display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 700,
  color: C.textMute, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5,
};
// [Putaran 16a Tahap 1] field diukur mockup: background BG (C.bg), bukan putih solid.
const field = {
  width: '100%', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${C.border}`, background: C.bg,
  fontFamily: BODY, fontSize: 13.5, color: C.text, outline: 'none',
};
// [Putaran 16a Tahap 1] tombol "Cancel" footer diukur mockup: background
// transparent, border INK_FAINT (borderStrong) bukan LINE.
const btnGhost = {
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.borderStrong}`,
  background: 'transparent', color: C.navy, fontFamily: HEAD, fontSize: 12.5,
  fontWeight: 600, cursor: 'pointer',
};
// [Putaran 16a Tahap 1, KOREKSI] diukur mockup ({{ saveWon }} "Yes, Mark as
// Won" DAN {{ saveRevertWin }} "Revert"): KEDUANYA solid ACCENT + teks INK --
// BUKAN hijau solid+putih. SEMANTIC.ok nol kemunculan di region modal
// mockup; nama fungsi `btnGreen` dipertahankan (dipakai 2 titik di bawah),
// nilainya sudah ACCENT/INK.
const btnGreen = (disabled) => ({
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.orange}`,
  background: C.orange, color: C.text, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

function Shell({ icon, title, children, err, onCancel, onSubmit, saving, submitLabel, submitStyle }) {
  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={sheet}>
        {/* border-bottom diukur mockup: LINE_SOFT, bukan LINE (C.border). */}
        <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {icon}
          <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15.5, fontWeight: 700, color: C.text }}>{title}</h3>
        </header>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
          {/* [Putaran 16a Tahap 1, GAGAL ditutup] diukur mockup (pesan
              validasi + Modal/MarkWon/NotAllowed/UploadFailed/FileMissing):
              amber (warn), BUKAN merah/danger. */}
          {err && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '9px 11px', borderRadius: 9,
              background: C.amberBg, border: `1px solid ${C.amberBd}`,
              fontFamily: BODY, fontSize: 12.5, color: C.amber,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {err}
            </div>
          )}
        </div>

        <footer style={{ padding: '14px 20px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" style={submitStyle(saving)} onClick={onSubmit} disabled={saving}>
            {saving ? 'Working…' : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MarkWonModal
   onSave({ reason, notes, file }) -- pemanggil yang mengunggah `file` ke
   bucket inquiry-won-evidence (path company_id/inquiry_id/uuid.ext) lalu
   memanggil mark_inquiry_won(p_inquiry_id, reason, evidence_path, notes).
   Modal ini TIDAK memanggil supabase sama sekali -- murni form.
   `uploadError` -- pesan generik dari pemanggil saat unggah gagal (final
   decision §9.6); modal TETAP TERBUKA, user menekan "Yes, Mark as Won" lagi
   untuk mencoba ulang (bukan tombol Retry tersendiri -- file yang sama
   masih terpilih, submit berarti coba lagi).

   Putaran 11 Tahap C -- 5 prop baru, SEMUANYA dihitung PEMANGGIL dari data
   yang sudah di-fetch di DealDetailPage.jsx (nol query baru di dalam modal):
     sentQuotation  -- quotation (atau null) berstatus SENT milik inquiry ini.
     onOpenQuotation(q) -- navigasi ke Detail Quotation itu (reuse onViewQuotation).
     isFirstWin     -- account?.lifecycle_stage !== 'customer'.
     customerName   -- nama akun, utk teks banner firstWin.
     hasSupervisor  -- !!profile?.reports_to MILIK PEMANGGIL (lihat header file).
   ═══════════════════════════════════════════════════════════════════════════ */
export function MarkWonModal({
  open, inquiryNo, saving, uploadError, onSave, onCancel,
  sentQuotation, onOpenQuotation, isFirstWin, customerName, hasSupervisor,
}) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');

  if (!open) return null;

  const submit = () => {
    if (!reason) { setErr('Won Reason is required.'); return; }
    if (!file) { setErr('Proof is required.'); return; }
    setErr('');
    onSave?.({ reason, notes: notes.trim() || null, file });
  };

  return (
    <Shell
      icon={<CheckCircle2 size={18} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />}
      title="Mark this inquiry as won?"
      err={err || uploadError}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      submitLabel="Yes, Mark as Won"
      submitStyle={btnGreen}
    >
      <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>{inquiryNo}</div>

      {sentQuotation && (
        // [Putaran 16a Tahap 1, GAGAL ditutup] diukur mockup (banner
        // {{ wonSug.on }}): teks headline WARIS warna container (blue/
        // info.fg), BUKAN C.text (INK) -- koreksi span di bawah.
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '9px 11px', borderRadius: 9,
          background: C.blueBg, border: `1px solid ${C.blueBd}`,
        }}>
          <Info size={14} style={{ color: C.blue, flexShrink: 0, marginTop: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: BODY, fontSize: 12.5, color: C.blue }}>
              Record the customer&rsquo;s acceptance on the quotation instead.
            </span>
            {/* background EKSPLISIT C.surface (putih) -- diukur mockup
                (tombol "Open Record Outcome" DI ATAS latar biru tint
                butuh latar putih sendiri, BUKAN transparent spread
                dari btnGhost yang kini transparent). */}
            <button type="button"
              onClick={() => onOpenQuotation?.(sentQuotation)}
              style={{ ...btnGhost, background: C.surface, alignSelf: 'flex-start', height: 28, padding: '0 10px', fontSize: 11.5, color: C.blue, borderColor: C.blueBd }}>
              Open Record Outcome
            </button>
          </div>
        </div>
      )}

      <label>
        <span style={label}>Won Reason <span style={{ color: C.amber }}>*</span></span>
        <select style={field} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select a reason</option>
          {WON_MANUAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>

      <label>
        <span style={label}>Notes <span style={{ fontWeight: 400, color: C.textFaint, textTransform: 'none' }}>Optional</span></span>
        <textarea style={{ ...field, resize: 'vertical' }} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <label>
        <span style={label}>Proof <span style={{ color: C.amber }}>*</span></span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {file && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px',
              borderRadius: 6, fontFamily: HEAD, fontSize: 11.5, fontWeight: 700,
              border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.textMute,
            }}>
              <Paperclip size={11} />{file.name}
            </span>
          )}
          <label style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            {file ? 'Replace file' : 'Upload PO, email, or chat screenshot'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
          {hasSupervisor
            ? 'Manual wins are reported separately and your supervisor is notified.'
            : 'Manual wins are reported separately. No supervisor is recorded on your profile, so no notification will be sent.'}
        </div>
      </label>

      {/* [Putaran 16a Tahap 1, GAGAL ditutup] diukur mockup
          (Modal/MarkWon/FirstWin): latar NEUTRAL (HEAD_BG/LINE), BUKAN
          hijau -- "first win" bukan state sukses tersendiri di mockup. */}
      {isFirstWin && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '9px 11px', borderRadius: 9,
          background: C.surfaceAlt, border: `1px solid ${C.border}`,
          fontFamily: BODY, fontSize: 12.5, color: C.text,
        }}>
          <CheckCircle2 size={14} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
          This is the first win for {customerName || 'this account'}. The account becomes a customer.
        </div>
      )}
    </Shell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RevertWonModal
   onSave({ reason })
   ═══════════════════════════════════════════════════════════════════════════ */
export function RevertWonModal({ open, inquiryNo, saving, onSave, onCancel }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  if (!open) return null;

  const submit = () => {
    if (!reason.trim()) { setErr('Reason is required.'); return; }
    setErr('');
    onSave?.({ reason: reason.trim() });
  };

  return (
    <Shell
      icon={<RotateCcw size={18} style={{ color: C.textMute, flexShrink: 0, marginTop: 1 }} />}
      title="Revert Manual Win"
      err={err}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      submitLabel="Revert"
      // [Putaran 16a Tahap 1, KOREKSI] diukur mockup ({{ saveRevertWin }}
      // "Revert"): solid ACCENT + teks INK, BUKAN hijau solid+putih.
      submitStyle={(disabled) => ({
        height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.orange}`,
        background: C.orange, color: C.text, fontFamily: HEAD, fontSize: 12.5, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      })}
    >
      <div style={{ fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>{inquiryNo}</div>
      <label>
        <span style={label}>Reason <span style={{ color: C.amber }}>*</span></span>
        <textarea style={{ ...field, resize: 'vertical' }} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div style={{ fontFamily: BODY, fontSize: 12, color: C.textFaint }}>The inquiry returns to its previous status.</div>
    </Shell>
  );
}
