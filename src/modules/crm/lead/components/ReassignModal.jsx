// src/modules/crm/lead/components/ReassignModal.jsx
// "Reassign Lead" (satu akun, design-handoff/crm-2026-10-11/shots/lead/
// 30-modal-reassign-supervisor.png) DAN "Assign to Sales" (bulk bar, judul
// berbeda tapi mekanisme SAMA -- tombolnya di mockup memang berlabel
// "Assign to Sales" untuk >1 baris terpilih, bukan dua fitur terpisah).
// Batch DS 3 Lead Management, Paket 1 irisan 5. Hanya supervisor ke atas
// (gate di pemanggil -- LeadDetailPage/LeadCapturePage -- bukan di sini).
//
// Prop `accounts` SELALU array (satu elemen dari header/menu baris, >1 dari
// bulk bar) -- satu komponen, satu jalur tulis, supaya "Reassign satu" dan
// "Assign to Sales banyak" tidak diam-diam melenceng.
//
// Berlaku SEKETIKA (update langsung accounts.assigned_to per baris) --
// bukan pengajuan/approval. "Effective Date" BUKAN kolom baru: dicatat
// sebagai teks di baris `activities` baru (type='owner_change') PER AKUN,
// sama dengan pola "Owner Change" di timeline Activity tab mockup
// (18-detail-activity.png). Notifikasi pemilik lama lewat tabel
// notifications yang SUDAH ADA, dicegat kalau profil penerima non-aktif
// (profiles.active) -- pola best-effort yang sama dengan
// LeadPoolPage.jsx/LeadPoolApprovalPage.jsx notifySales/notifyManagers.
import { useState } from 'react';
import { Modal, FloatingInput, FloatingSelect, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, FONT_BODY, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { getTodayWIB } from '../../../../lib/dateUtils';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Array<{id:string, name:string, code?:string, company_id:string, assigned_to?:string|null, assigned_profile?:{full_name?:string}}>} accounts
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onReassigned
 */
export default function ReassignModal({ open, onClose, accounts = [], showToast, onReassigned }) {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [newOwner, setNewOwner] = useState('');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getTodayWIB());
  const [notify, setNotify] = useState(true);

  const bulk = accounts.length > 1;
  const companyIds = [...new Set(accounts.map((a) => a.company_id).filter(Boolean))];

  // Reset + muat daftar salesperson aktif SAAT modal dibuka -- pola "adjust
  // state during render" (bukan effect), sama dengan CaptureLeadModal.wasOpen.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && companyIds.length) {
      setNewOwner(''); setReason(''); setEffectiveDate(getTodayWIB()); setNotify(true);
      supabase.from('profiles').select('id, full_name').in('company_id', companyIds).eq('active', true)
        .order('full_name', { ascending: true }).limit(1000)
        .then(({ data }) => setProfiles(data || []));
    }
  }

  const canSave = !!newOwner && accounts.length > 0;

  async function handleSave() {
    if (!canSave) return { error: new Error('Select a new owner') };
    const newOwnerName = profiles.find((p) => p.id === newOwner)?.full_name || 'Unknown';

    const { error } = await supabase.from('accounts')
      .update({ assigned_to: newOwner, last_activity_at: new Date().toISOString() })
      .in('id', accounts.map((a) => a.id));
    if (error) return { error };

    const logRows = accounts.map((a) => {
      const prevOwnerName = a.assigned_profile?.full_name || 'Unassigned';
      const lines = [`Reassigned from ${prevOwnerName} to ${newOwnerName}.`];
      if (reason.trim()) lines.push(`Reason: ${reason.trim()}`);
      lines.push(`Effective: ${effectiveDate}`);
      return {
        account_id: a.id, company_id: a.company_id, type: 'owner_change', status: 'done',
        notes: lines.join(' '), created_by: profile.id, completed_at: new Date().toISOString(),
      };
    });
    const { error: logErr } = await supabase.from('activities').insert(logRows);
    if (logErr) console.error('[lead] reassign activity log failed:', logErr.message);

    if (notify) {
      const prevOwners = [...new Map(accounts.filter((a) => a.assigned_to).map((a) => [a.assigned_to, a.company_id])).entries()];
      for (const [prevOwnerId, companyId] of prevOwners) {
        try {
          const { data: prevProfile } = await supabase.from('profiles').select('active').eq('id', prevOwnerId).maybeSingle();
          if (prevProfile?.active) {
            await supabase.from('notifications').insert({
              company_id: companyId, user_id: prevOwnerId, event_type: 'lead_reassigned',
              title: 'Lead Reassigned',
              body: bulk ? `${accounts.length} leads have been reassigned to ${newOwnerName}.` : `${accounts[0].name} has been reassigned to ${newOwnerName}.`,
              reference_type: 'lead', reference_id: accounts[0].id,
            });
          }
        } catch (e) {
          console.error('[lead] notify previous owner failed:', e?.message || e);
        }
      }
    }
    onReassigned?.();
    return undefined;
  }

  if (!accounts.length) return null;

  return (
    <Modal open={open} onClose={onClose} title={bulk ? 'Assign to Sales' : 'Reassign Lead'} width={520} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label={bulk ? 'Assign' : 'Save and Reassign'} savedLabel={bulk ? 'Assigned!' : 'Reassigned!'} disabled={!canSave}
          onError={(err) => showToast?.('Failed to reassign: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>
            {bulk ? `${accounts.length} Leads Selected` : 'Current Owner'}
          </div>
          <div style={{ fontSize: 14, color: INK, fontFamily: FONT_BODY, fontWeight: 600 }}>
            {bulk ? accounts.map((a) => a.name).join(', ') : (accounts[0].assigned_profile?.full_name || 'Unassigned')}
          </div>
        </div>

        <FloatingSelect label="New Owner" value={newOwner} onChange={setNewOwner}
          options={profiles.map((p) => ({ value: p.id, label: p.full_name }))} />

        <Textarea label="Reason" value={reason} onChange={setReason} rows={3} placeholder="Why is this lead being reassigned?" />
        <div style={{ fontSize: 11.5, color: INK_SOFT, fontFamily: FONT_BODY, marginTop: -SP.s2 }}>Recorded in the activity timeline.</div>

        <FloatingInput label="Effective Date" type="date" value={effectiveDate} onChange={setEffectiveDate} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK, fontFamily: FONT_BODY, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify previous owner{bulk ? 's' : ''}
        </label>
      </div>
    </Modal>
  );
}
