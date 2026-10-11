// src/modules/crm/lead/components/MarkAsLostModal.jsx
// "Mark as Lost" -- design-handoff/crm-2026-10-11/shots/lead/23-modal-mark-as-lost.png.
// Batch DS 3 Lead Management, Paket 1 irisan 5. Gate (pemilik lead ATAU
// supervisor ke atas) diputuskan oleh pemanggil (LeadDetailPage), modal ini
// hanya dirender.
//
// lifecycle_stage -> 'lost'; lost_reason dari MasterSelect (list_key
// 'lost_reason', 6 nilai global, migrasi 20261011000002) -- kolom
// accounts.lost_reason SUDAH ADA (pre-existing, bukan baru). Competitor
// field (accounts.competitor_name, migrasi 20261011000001) muncul HANYA
// saat alasannya 'lost_to_competitor', sama persis slug seed-nya.
import { useState } from 'react';
import { Modal, Textarea, FloatingInput, MasterSelect, Button, OutlineBtn } from '../../../../kit';
import { INK_SOFT, LINE, FONT_MONO, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';

const COMPETITOR_VALUE = 'lost_to_competitor';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string, company_id:string}} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onMarked
 */
export default function MarkAsLostModal({ open, onClose, account, showToast, onMarked }) {
  const { profile } = useAuth();
  const [reasonOptions, setReasonOptions] = useState([]);
  const [lostReason, setLostReason] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLostReason(''); setCompetitorName(''); setNotes('');
      supabase.from('dropdown_options').select('id, label, value').eq('list_key', 'lost_reason').eq('is_active', true).is('deleted_at', null)
        .order('sort_order', { ascending: true }).limit(1000).then(({ data }) => setReasonOptions(data || []));
    }
  }

  async function handleConfirm() {
    if (!lostReason) { showToast?.('Select a Lost Reason', 'error'); return; }
    setSaving(true);
    const reasonLabel = reasonOptions.find((o) => o.value === lostReason)?.label || lostReason;
    const { error } = await supabase.from('accounts').update({
      lifecycle_stage: 'lost',
      lost_reason: lostReason,
      competitor_name: lostReason === COMPETITOR_VALUE ? (competitorName.trim() || null) : null,
      last_activity_at: new Date().toISOString(),
    }).eq('id', account.id);
    if (error) {
      setSaving(false);
      showToast?.('Failed to mark as lost: ' + error.message, 'error');
      return;
    }
    const logNotes = [`Marked as Lost. Reason: ${reasonLabel}.`];
    if (lostReason === COMPETITOR_VALUE && competitorName.trim()) logNotes.push(`Competitor: ${competitorName.trim()}.`);
    if (notes.trim()) logNotes.push(notes.trim());
    const { error: logErr } = await supabase.from('activities').insert({
      account_id: account.id, company_id: account.company_id, type: 'lead_lost', status: 'done',
      notes: logNotes.join(' '), created_by: profile.id, completed_at: new Date().toISOString(),
    });
    if (logErr) console.error('[lead] mark-as-lost activity log failed:', logErr.message);
    setSaving(false);
    onMarked?.();
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Mark as Lost" width={480} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <Button variant="danger" loading={saving} disabled={!lostReason} onClick={handleConfirm}>Mark as Lost</Button>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
          {account.code ? `${account.code}, ` : ''}{account.name}
        </div>

        <MasterSelect label="Lost Reason" value={lostReason} onChange={setLostReason}
          options={reasonOptions.map((o) => ({ value: o.value, label: o.label }))} />

        {lostReason === COMPETITOR_VALUE && (
          <FloatingInput label="Competitor Name" value={competitorName} onChange={setCompetitorName} />
        )}

        <Textarea label="Notes" value={notes} onChange={setNotes} rows={3} hint="Optional" />
      </div>
    </Modal>
  );
}
