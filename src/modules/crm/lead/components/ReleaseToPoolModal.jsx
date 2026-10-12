// src/modules/crm/lead/components/ReleaseToPoolModal.jsx
// "Release to Pool" -- item ketiga menu titik tiga Detail Lead, sesudah
// Mark as Lost dan Archive (keputusan Den, irisan 9 Paket 2 -- TIDAK ADA
// di mockup 1.1.2, ditambahkan sebagai perluasan sadar). Pola modal SAMA
// dengan MarkAsLostModal (Button manual, bukan SaveButton -- konsisten
// dgn RejectPullModal). Alasan wajib, cermin RPC lead_pool_release.
// RPC adalah penjaga utama (guard lifecycle/pool/inquiry-quotation
// terbuka) -- gate tombol pemanggil (LeadDetailPage) hanya cek pemilik/
// izin + lifecycle + belum di pool, TIDAK mereplikasi cek dokumen terbuka.
import { useState } from 'react';
import { Modal, Textarea, Button, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, FONT_MONO, FONT_BODY, LINE, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string}|null} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onReleased
 */
export default function ReleaseToPoolModal({ open, onClose, account, showToast, onReleased }) {
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
    const { error } = await supabase.rpc('lead_pool_release', { p_account_id: account.id, p_reason: reason.trim() });
    setSaving(false);
    if (error) { showToast?.('Failed to release: ' + error.message, 'error'); return; }
    window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));
    onReleased?.();
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Release to Pool" width={460} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <Button variant="danger" loading={saving} disabled={!valid} onClick={handleConfirm}>Release to Pool</Button>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ fontSize: 13.5, color: INK, fontFamily: FONT_BODY, lineHeight: 1.5 }}>
          The lead will be unassigned and moved to the Lead Pool. Anyone with access can request to claim it back.
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
          {account.code ? `${account.code}, ` : ''}{account.name}
        </div>
        <Textarea label="Reason" value={reason} onChange={setReason} rows={3} placeholder="Why is this lead being released to the pool?" />
      </div>
    </Modal>
  );
}
