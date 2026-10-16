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
//
// Batch DS 3 Lead Management, irisan 9 Paket 2 (C.1, keputusan Den):
// akun is_in_lead_pool=true TIDAK BOLEH lewat .update() langsung --
// lead_pool_last_owner/pull_* akan tertinggal kacau (is_in_lead_pool tetap
// true walau sudah berpemilik baru). Akun pool dipisah dan dikirim SATU
// PER SATU lewat RPC lead_pool_assign; sisanya (non-pool) tetap lewat
// .update() bulk seperti sebelumnya -- nol perubahan perilaku untuk
// seleksi yang seluruhnya non-pool. Gate TOMBOL yang membuka modal ini
// (LeadCapturePage/LeadDetailPage/CustomerDetailPage) memakai
// isManagerOrAbove -- LEBIH LUAS dari izin crm_lead_pool_approval yang
// dicek lead_pool_assign di server, jadi baris pool BISA ditolak RPC
// walau tombolnya terlihat. Reason/Effective Date di bawah TIDAK dipakai
// RPC lead_pool_assign (tak punya parameter itu) -- hanya relevan utk
// baris non-pool; dibiarkan terisi apa adanya, bukan disembunyikan
// kondisional (kompleksitas UI yang tak diminta).
//
// TD-318 Irisan 2: judul modal + label tombol memakai `allUnassigned`
// (SEMUA target tanpa pemilik), persis mockup `allUn` -- BUKAN `bulk`
// (accounts.length > 1). Satu lead tanpa pemilik dibuka dari Lead Detail
// juga allUnassigned=true (judul "Assign to Sales"), bukan hanya saat
// bulk; sebaliknya bulk-select beberapa lead yang SEMUA sudah berpemilik
// tetap "Reassign Lead" (allUnassigned=false), bukan "Assign to Sales".
// `bulk` TETAP dipakai di tempat lain (tampilan Current Owner, kata
// "owners" jamak) -- dua sumbu berbeda, jangan disatukan.
import { useState } from 'react';
import { Modal, FloatingInput, FloatingSelect, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, FONT_BODY, FONT_HEAD, SP, avatarToneFor } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { getTodayWIB } from '../../../../lib/dateUtils';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Array<{id:string, name:string, code?:string, company_id:string, assigned_to?:string|null, assigned_profile?:{full_name?:string}, is_in_lead_pool?:boolean}>} accounts
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {() => void} onReassigned
 * @param {string} [title] - judul modal; default-nya mengikuti kepemilikan SEMUA
 *   target (allUnassigned ? 'Assign to Sales' : 'Reassign Lead'), bukan jumlah
 *   target -- TD-318 Irisan 2, persis mockup `allUn`. Pemanggil non-Lead
 *   (mis. Customer) mengirim judul tetap sendiri.
 * @param {string} [notifyEventType] - notifications.event_type, default 'lead_reassigned'
 * @param {string} [notifyReferenceType] - notifications.reference_type, default 'lead'
 */
export default function ReassignModal({ open, onClose, accounts = [], showToast, onReassigned, title, notifyEventType = 'lead_reassigned', notifyReferenceType = 'lead' }) {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [newOwner, setNewOwner] = useState('');
  const [reason, setReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getTodayWIB());
  const [notify, setNotify] = useState(true);

  const bulk = accounts.length > 1;
  // TD-318 Irisan 2 -- persis mockup `allUn`: SEMUA target tanpa pemilik,
  // independen dari `bulk`. Dipakai HANYA utk judul/tombol (lihat header).
  const allUnassigned = accounts.length > 0 && accounts.every((a) => !a.assigned_to);
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

    const poolAccounts = accounts.filter((a) => a.is_in_lead_pool);
    const normalAccounts = accounts.filter((a) => !a.is_in_lead_pool);

    let okCount = 0;
    const failures = []; // { name, message }

    // Non-pool: jalur lama tanpa perubahan -- satu update bulk + log +
    // notifikasi, hanya atas subset non-pool dari seleksi.
    if (normalAccounts.length) {
      const { error } = await supabase.from('accounts')
        .update({ assigned_to: newOwner, last_activity_at: new Date().toISOString() })
        .in('id', normalAccounts.map((a) => a.id));
      if (error) {
        normalAccounts.forEach((a) => failures.push({ name: a.name, message: error.message }));
      } else {
        okCount += normalAccounts.length;
        const logRows = normalAccounts.map((a) => {
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
          const prevOwners = [...new Map(normalAccounts.filter((a) => a.assigned_to).map((a) => [a.assigned_to, a.company_id])).entries()];
          for (const [prevOwnerId, companyId] of prevOwners) {
            try {
              const { data: prevProfile } = await supabase.from('profiles').select('active').eq('id', prevOwnerId).maybeSingle();
              if (prevProfile?.active) {
                await supabase.from('notifications').insert({
                  company_id: companyId, user_id: prevOwnerId, event_type: notifyEventType,
                  title: 'Lead Reassigned',
                  body: normalAccounts.length > 1 ? `${normalAccounts.length} leads have been reassigned to ${newOwnerName}.` : `${normalAccounts[0].name} has been reassigned to ${newOwnerName}.`,
                  reference_type: notifyReferenceType, reference_id: normalAccounts[0].id,
                });
              }
            } catch (e) {
              console.error('[lead] notify previous owner failed:', e?.message || e);
            }
          }
        }
      }
    }

    // Pool: SATU PER SATU lewat RPC lead_pool_assign -- gerbangnya
    // crm_lead_pool_approval di server, lebih sempit dari gate tombol
    // (isManagerOrAbove) pemanggil; pesan gagal RPC ditampilkan apa
    // adanya, bukan diseragamkan.
    let poolOkCount = 0;
    for (const a of poolAccounts) {
      const { error } = await supabase.rpc('lead_pool_assign', { p_account_id: a.id, p_user_id: newOwner });
      if (error) failures.push({ name: a.name, message: error.message });
      else { okCount++; poolOkCount++; }
    }
    // Satu dispatch utk SELURUH baris pool baris ini (bukan per baris) --
    // badge sidebar cukup tahu "sesuatu berubah", bukan apa/berapa banyak.
    if (poolOkCount > 0) window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));

    if (failures.length) {
      const detail = failures.map((f) => `${f.name}: ${f.message}`).join(' | ');
      showToast?.(`${okCount} succeeded, ${failures.length} failed — ${detail}`, 'error');
      onReassigned?.(); // baris yang berhasil tetap tersimpan -- refresh daftar pemanggil
      return false; // SaveButton: idle tanpa "Tersimpan!" -- pesan sudah ditampilkan di atas
    }
    onReassigned?.();
    return undefined;
  }

  if (!accounts.length) return null;

  return (
    <Modal open={open} onClose={onClose} title={title ?? (allUnassigned ? 'Assign to Sales' : 'Reassign Lead')} width={520} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label={allUnassigned ? 'Assign' : 'Save and Reassign'} savedLabel={allUnassigned ? 'Assigned!' : 'Reassigned!'} disabled={!canSave}
          onError={(err) => showToast?.('Failed to reassign: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, marginBottom: 6, fontFamily: FONT_BODY }}>
            {bulk ? `${accounts.length} Leads Selected` : 'Current Owner'}
          </div>
          {bulk ? (
            <div style={{ fontSize: 14, color: INK, fontFamily: FONT_BODY, fontWeight: 600 }}>{accounts.map((a) => a.name).join(', ')}</div>
          ) : (() => {
            const name = accounts[0].assigned_profile?.full_name;
            const tone = name ? avatarToneFor(accounts[0].assigned_to) : null;
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {name && (
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 22px' }}>
                    {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                )}
                <span style={{ fontSize: 14, color: INK, fontFamily: FONT_BODY, fontWeight: 600 }}>{name || 'Unassigned'}</span>
              </div>
            );
          })()}
        </div>

        <FloatingSelect label="New Owner" value={newOwner} onChange={setNewOwner}
          options={[{ value: '', label: 'Select an active salesperson' }, ...profiles
            .filter((p) => bulk || p.id !== accounts[0].assigned_to)
            .map((p) => ({ value: p.id, label: p.full_name }))]} />

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
