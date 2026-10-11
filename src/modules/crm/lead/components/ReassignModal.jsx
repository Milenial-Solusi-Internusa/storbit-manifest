// src/modules/crm/lead/components/ReassignModal.jsx
// "Reassign Lead" -- design-handoff/crm-2026-10-11/shots/lead/30-modal-reassign-supervisor.png.
// Batch DS 3 Lead Management, Paket 1 irisan 5. Hanya supervisor ke atas
// (gate di LeadDetailPage, bukan di sini -- modal ini dipasang TANPA cek
// peran sendiri, pemanggil yang memutuskan kapan merendernya, sama seperti
// CaptureLeadModal/ImportLeadsModal).
//
// Berlaku SEKETIKA (update langsung accounts.assigned_to) -- bukan
// pengajuan/approval. "Effective Date" BUKAN kolom baru: dicatat sebagai
// teks di baris `activities` baru (type='owner_change'), sama dengan pola
// "Owner Change" di timeline Activity tab mockup (18-detail-activity.png).
// Notifikasi pemilik lama lewat tabel notifications yang SUDAH ADA, dicegat
// kalau profil penerima non-aktif (profiles.active) -- pola best-effort yang
// sama dengan LeadPoolPage.jsx/LeadPoolApprovalPage.jsx notifySales/notifyManagers.
import { useState } from 'react';
import { Modal, FloatingInput, FloatingSelect, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, FONT_BODY, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { getTodayWIB } from '../../../../lib/dateUtils';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string, company_id:string, assigned_to?:string|null, assigned_profile?:{full_name?:string}}} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onReassigned
 */
export default function ReassignModal({ open, onClose, account, showToast, onReassigned }) {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [newOwner, setNewOwner] = useState('');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getTodayWIB());
  const [notify, setNotify] = useState(true);

  // Reset + muat daftar salesperson aktif SAAT modal dibuka -- pola "adjust
  // state during render" (bukan effect), sama dengan CaptureLeadModal.wasOpen.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && account?.company_id) {
      setNewOwner(''); setReason(''); setEffectiveDate(getTodayWIB()); setNotify(true);
      supabase.from('profiles').select('id, full_name').eq('company_id', account.company_id).eq('active', true)
        .neq('id', account.assigned_to || '00000000-0000-0000-0000-000000000000')
        .order('full_name', { ascending: true }).limit(1000)
        .then(({ data }) => setProfiles(data || []));
    }
  }

  const canSave = !!newOwner;

  async function handleSave() {
    if (!canSave || !account) return { error: new Error('Select a new owner') };
    const newOwnerName = profiles.find((p) => p.id === newOwner)?.full_name || 'Unknown';
    const prevOwnerId = account.assigned_to || null;
    const prevOwnerName = account.assigned_profile?.full_name || 'Unassigned';

    const { error } = await supabase.from('accounts')
      .update({ assigned_to: newOwner, last_activity_at: new Date().toISOString() })
      .eq('id', account.id);
    if (error) return { error };

    const lines = [`Reassigned from ${prevOwnerName} to ${newOwnerName}.`];
    if (reason.trim()) lines.push(`Reason: ${reason.trim()}`);
    lines.push(`Effective: ${effectiveDate}`);
    const { error: logErr } = await supabase.from('activities').insert({
      account_id: account.id, company_id: account.company_id, type: 'owner_change', status: 'done',
      notes: lines.join(' '), created_by: profile.id, completed_at: new Date().toISOString(),
    });
    if (logErr) console.error('[lead] reassign activity log failed:', logErr.message);

    if (notify && prevOwnerId) {
      try {
        const { data: prevProfile } = await supabase.from('profiles').select('active').eq('id', prevOwnerId).maybeSingle();
        if (prevProfile?.active) {
          await supabase.from('notifications').insert({
            company_id: account.company_id, user_id: prevOwnerId, event_type: 'lead_reassigned',
            title: 'Lead Reassigned', body: `${account.name} has been reassigned to ${newOwnerName}.`,
            reference_type: 'lead', reference_id: account.id,
          });
        }
      } catch (e) {
        console.error('[lead] notify previous owner failed:', e?.message || e);
      }
    }
    onReassigned?.();
    return undefined;
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Reassign Lead" width={520} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label="Save and Reassign" savedLabel="Reassigned!" disabled={!canSave}
          onError={(err) => showToast?.('Failed to reassign: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>Current Owner</div>
          <div style={{ fontSize: 14, color: INK, fontFamily: FONT_BODY, fontWeight: 600 }}>{account.assigned_profile?.full_name || 'Unassigned'}</div>
        </div>

        <FloatingSelect label="New Owner" value={newOwner} onChange={setNewOwner}
          options={profiles.map((p) => ({ value: p.id, label: p.full_name }))} />

        <Textarea label="Reason" value={reason} onChange={setReason} rows={3} placeholder="Why is this lead being reassigned?" />
        <div style={{ fontSize: 11.5, color: INK_SOFT, fontFamily: FONT_BODY, marginTop: -SP.s2 }}>Recorded in the activity timeline.</div>

        <FloatingInput label="Effective Date" type="date" value={effectiveDate} onChange={setEffectiveDate} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK, fontFamily: FONT_BODY, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify previous owner
        </label>
      </div>
    </Modal>
  );
}
