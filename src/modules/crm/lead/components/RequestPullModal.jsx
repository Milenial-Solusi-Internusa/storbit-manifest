// src/modules/crm/lead/components/RequestPullModal.jsx
// "Request Pull" -- Modal/RequestPull, design-handoff/mockup/Lead
// Management.dc.html:397-405. Lead Assignment / Claim (slot 1.1.2), DIPAKAI
// ULANG untuk Pool biasa maupun Free Agent Customer (LeadAssignmentPage.jsx
// `onRequestPull` sama persis utk PoolTable & FreeAgentTable -- `account`
// SELALU punya `estimated_value` dari query bersama, nol cabang kondisional
// per jenis baris diperlukan di sini).
//
// Alasan wajib, MINIMAL 20 karakter (cermin validasi RPC
// lead_pool_request_pull -- validasi di sini adalah UX, bukan satu-
// satunya penjaga; mockup SENDIRI tak punya aturan panjang minimum, lihat
// REVISI 2 di bawah).
//
// TD-318 Irisan 3:
// #12 -- ringkasan jadi grid 3 kolom (Account Code / Company Name /
//        Estimated Value, `auto 1fr auto` persis mockup :398-400), bukan
//        lagi satu chip mono.
// #13 -- helper teks statis "Your request will be sent to your supervisor
//        or manager for approval." (:401) menggantikan counter hidup.
//
// REVISI 2, §2: tombol "Submit Request" SELALU aktif, persis mockup
// `submitPull`. Klik dengan Reason kosong -> "Reason is required" (persis
// mockup `pullErr`); klik dengan isi 1-19 karakter -> "Reason must be at
// least 20 characters" (aturan TAMBAHAN app, MIN_LEN tetap ditegakkan --
// mockup sendiri tak membedakan dua kasus ini). Counter karakter hidup
// DICABUT -- helper statis saja.
import { useState } from 'react';
import { Modal, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { INK_SOFT, FONT_BODY, FONT_MONO, BG, LINE_SOFT, RADIUS, fmtRp } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';

const MIN_LEN = 20;

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string, estimated_value?:number|null}|null} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onRequested
 */
export default function RequestPullModal({ open, onClose, account, showToast, onRequested }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setReason(''); setTouched(false); }
  }

  const trimmedLen = reason.trim().length;
  const empty = trimmedLen === 0;
  const tooShort = trimmedLen > 0 && trimmedLen < MIN_LEN;
  const invalid = touched && (empty || tooShort);

  async function handleSave() {
    if (!account) return false;
    if (empty || tooShort) { setTouched(true); return false; } // persis submitPull: set({pullT:true}), TIDAK menyentuh network
    const { error } = await supabase.rpc('lead_pool_request_pull', { p_account_id: account.id, p_reason: reason.trim() });
    if (error) return { error };
    // Beri tahu badge sidebar (App.jsx) untuk hitung ulang segera -- irisan
    // berikutnya, Task 1a. Nol listener = no-op, aman dipanggil di mana pun.
    window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));
    onRequested?.();
    return undefined;
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Request Pull" width={500} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label="Submit Request" savedLabel="Requested!"
          onError={(err) => showToast?.('Failed to request pull: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, padding: '12px 16px', background: BG, border: `1px solid ${LINE_SOFT}`, borderRadius: RADIUS.md }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>Account Code</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{account.code || '—'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>Company Name</span>
            <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, overflowWrap: 'anywhere' }}>{account.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>Estimated Value</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, overflowWrap: 'anywhere' }}>{account.estimated_value != null ? fmtRp(account.estimated_value) : '—'}</span>
          </div>
        </div>

        <Textarea label="Reason" required value={reason} onChange={setReason} rows={4}
          placeholder="Why should you own this lead?"
          error={invalid ? (empty ? 'Reason is required' : `Reason must be at least ${MIN_LEN} characters`) : undefined}
          hint="Your request will be sent to your supervisor or manager for approval." />
      </div>
    </Modal>
  );
}
