// src/modules/crm/lead/components/RejectPullModal.jsx
// "Reject Request" -- Pull Approvals tab, mockup
// 29-modal-reject-request-supervisor.png. Batch DS 3 Lead Management,
// irisan 9 Paket 2. Alasan WAJIB (beda dari MarkAsLostModal's optional
// text) -- cermin RPC lead_pool_reject_pull yang menolak alasan kosong.
import { useState } from 'react';
import { Modal, Textarea, Button, OutlineBtn } from '../../../../kit';
import { INK_SOFT, FONT_MONO, LINE, SP } from '../../../../kit/tokens';
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
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason('');
  }

  const valid = reason.trim().length > 0;

  async function handleConfirm() {
    if (!account || !valid) return;
    setSaving(true);
    const { error } = await supabase.rpc('lead_pool_reject_pull', { p_account_id: account.id, p_reason: reason.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to reject: ' + error.message, 'error'); return; }
    onRejected?.();
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Reject Request" width={460} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <Button variant="danger" loading={saving} disabled={!valid} onClick={handleConfirm}>Reject</Button>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
          {account.code ? `${account.code}, ` : ''}{account.name}
        </div>
        <Textarea label="Reason" value={reason} onChange={setReason} rows={3} placeholder="Why is this request being rejected?" />
      </div>
    </Modal>
  );
}
