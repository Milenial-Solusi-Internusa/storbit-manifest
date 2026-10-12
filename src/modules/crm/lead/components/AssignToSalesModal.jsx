// src/modules/crm/lead/components/AssignToSalesModal.jsx
// "Assign to Sales" -- Lead Assignment / Claim (Leads + Free Agent tabs),
// mockup `canAssign: isMgmt` button. Batch DS 3 Lead Management, irisan 9
// Paket 2 (Task B/C.5 keputusan Den: dipertahankan, dibangun lewat RPC
// BARU lead_pool_assign -- bukan .update() langsung seperti mockup-nya).
//
// BEDA dari ReassignModal: ini untuk akun TANPA pemilik (is_in_lead_pool),
// jadi tidak ada "Current Owner"/"Effective Date"/"Notify previous owner" --
// cuma pilih target. Kandidat di-scope ke user_roles AKTIF di entitas akun
// ini (bukan profiles.active saja) -- cermin guard lead_pool_assign.
import { useState } from 'react';
import { Modal, FloatingSelect, SaveButton, OutlineBtn } from '../../../../kit';
import { INK_SOFT, FONT_MONO, LINE, SP } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{id:string, name:string, code?:string, company_id:string}|null} account
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onAssigned
 */
export default function AssignToSalesModal({ open, onClose, account, showToast, onAssigned }) {
  const [candidates, setCandidates] = useState([]);
  const [target, setTarget] = useState('');

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && account?.company_id) {
      setTarget('');
      // user_roles.user_id -> auth.users, BUKAN public.profiles -- nol FK
      // langsung utk embed PostgREST, jadi dua langkah: id dulu, baru profil.
      supabase.from('user_roles').select('user_id')
        .eq('company_id', account.company_id).eq('is_active', true).is('valid_until', null)
        .then(({ data }) => {
          const ids = [...new Set((data || []).map((r) => r.user_id).filter(Boolean))];
          if (!ids.length) { setCandidates([]); return; }
          supabase.from('profiles').select('id, full_name').in('id', ids).eq('active', true)
            .order('full_name', { ascending: true }).limit(1000)
            .then(({ data: profs }) => setCandidates(profs || []));
        });
    }
  }

  const canSave = !!target && !!account;

  async function handleSave() {
    if (!canSave) return { error: new Error('Select a salesperson') };
    const { error } = await supabase.rpc('lead_pool_assign', { p_account_id: account.id, p_user_id: target });
    if (error) return { error };
    window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));
    onAssigned?.();
    return undefined;
  }

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title="Assign to Sales" width={460} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label="Assign" savedLabel="Assigned!" disabled={!canSave}
          onError={(err) => showToast?.('Failed to assign: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: INK_SOFT, border: `1px solid ${LINE}`, borderRadius: 10, padding: '10px 14px' }}>
          {account.code ? `${account.code}, ` : ''}{account.name}
        </div>
        <FloatingSelect label="Assign To" value={target} onChange={setTarget}
          options={[{ value: '', label: 'Select an active salesperson' }, ...candidates.map((c) => ({ value: c.id, label: c.full_name }))]} />
      </div>
    </Modal>
  );
}
