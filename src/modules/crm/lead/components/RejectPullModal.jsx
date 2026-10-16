// src/modules/crm/lead/components/RejectPullModal.jsx
// "Reject Request" -- Modal/RejectRequest, design-handoff/mockup/Lead
// Management.dc.html:407-413. Alasan WAJIB (beda dari MarkAsLostModal's
// optional text) -- cermin RPC lead_pool_reject_pull yang menolak alasan
// kosong. Selalu SATU target (reject tidak punya bentuk bulk di mockup
// maupun RPC).
//
// TD-318 Irisan 3, REVISI 2 §4: target line jadi teks POLOS tanpa kotak,
// persis mockup :410 (`<span style="color:#5C6B52">{{tgtLabel}}</span>`,
// BUKAN dibungkus border seperti MarkAsLost/RequestPull/Reassign).
// Placeholder "Tell the requester why" (:411) menggantikan placeholder lama.
//
// REVISI 2 §1: tombol "Reject" SELALU aktif, persis mockup `saveReject`.
// Klik dengan Reason kosong -> "Reason is required" (SEMANTIC.warn.fg),
// bukan lagi tombol ter-disable tanpa pesan.
import { useState } from 'react';
import { Modal, Textarea, Button, OutlineBtn } from '../../../../kit';
import { INK_SOFT, FONT_BODY } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string}|null} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onRejected
 */
export default function RejectPullModal({ open, onClose, account, showToast, onRejected }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setReason(''); setTouched(false); }
  }

  const empty = reason.trim().length === 0;

  async function handleConfirmClick() {
    if (empty) { setTouched(true); return; } // persis saveReject: set({rejT:true}), TIDAK menyentuh network
    if (!account) return;
    setSaving(true);
    const { error } = await supabase.rpc('lead_pool_reject_pull', { p_account_id: account.id, p_reason: reason.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to reject: ' + error.message, 'error'); return; }
    window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));
    onRejected?.();
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Reject Request" width={460} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <Button variant="danger" loading={saving} onClick={handleConfirmClick}>Reject</Button>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: INK_SOFT }}>
          {account.code ? `${account.code}, ` : ''}{account.name}
        </span>
        <Textarea label="Reason" required value={reason} onChange={setReason} rows={3}
          placeholder="Tell the requester why"
          error={touched && empty ? 'Reason is required' : undefined} />
      </div>
    </Modal>
  );
}
