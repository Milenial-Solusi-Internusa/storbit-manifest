// src/modules/crm/lead/components/RequestPullModal.jsx
// "Request Pull" -- Lead Assignment / Claim (slot 1.1.2), mockup
// 14-modal-request-pull-sales.png. Batch DS 3 Lead Management, irisan 9
// Paket 2. Alasan wajib, MINIMAL 20 karakter (cermin validasi RPC
// lead_pool_request_pull -- validasi di sini adalah UX, bukan satu-
// satunya penjaga).
import { useState } from 'react';
import { Modal, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { INK_SOFT, FONT_BODY, FONT_MONO, LINE, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';

const MIN_LEN = 20;

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string}|null} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onRequested
 */
export default function RequestPullModal({ open, onClose, account, showToast, onRequested }) {
  const [reason, setReason] = useState('');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason('');
  }

  const valid = reason.trim().length >= MIN_LEN;

  async function handleSave() {
    if (!account || !valid) return { error: new Error(`Reason must be at least ${MIN_LEN} characters`) };
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
    <Modal open={open} onClose={onClose} title="Request Pull" width={480} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label="Submit Request" savedLabel="Requested!" disabled={!valid}
          onError={(err) => showToast?.('Failed to request pull: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
          {account.code ? `${account.code}, ` : ''}{account.name}
        </div>
        <Textarea label="Reason" value={reason} onChange={setReason} rows={4}
          placeholder={`Explain why you should claim this account (min ${MIN_LEN} characters)…`} />
        <div style={{ fontSize: 11.5, color: valid ? INK_SOFT : '#B23227', fontFamily: FONT_BODY }}>
          {reason.trim().length}/{MIN_LEN} characters minimum
        </div>
      </div>
    </Modal>
  );
}
