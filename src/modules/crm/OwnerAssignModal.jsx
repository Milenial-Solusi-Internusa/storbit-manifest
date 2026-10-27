// src/modules/crm/OwnerAssignModal.jsx
// Modal bersama Assign/Reassign Owner -- Inquiry Management Putaran 11,
// Tahap B. Satu komponen dipakai TIGA tempat:
//   (1) DealDetailPage.jsx kebab "Reassign Owner" -- targets 1 elemen,
//       mode="reassign" (inquiry sudah punya owner).
//   (2) InquiryOwnerAssignmentPage.jsx tab Unassigned, tombol per-baris
//       "Assign to Sales" -- targets 1 elemen, mode="assign".
//   (3) InquiryOwnerAssignmentPage.jsx tab Unassigned, toolbar bulk
//       "Assign to Sales" -- targets N elemen, mode="assign" SELALU
//       (Unassigned = nol owner by definition -- dikonfirmasi mockup,
//       bulk entry point hanya ada di tab ini, baris 461-475 mockup).
//
// SENGAJA BERBEDA dari pola DealCloseModals.jsx/DealWonModals.jsx/
// ChangeAccountModal.jsx (modal "murni form", pemanggil yang memanggil RPC
// lewat onSave): modal INI memanggil RPC reassign_inquiry_owner SENDIRI,
// di-loop satu per target -- pola PERSIS src/modules/crm/lead/components/
// ReassignModal.jsx (Lead Management, battle-tested utk kasus bulk+single
// sekaligus). Alasannya: bulk-loop + agregasi sukses/gagal parsial adalah
// logika yang SAMA utk ketiga pemanggil di atas; menaruhnya di modal
// sekali dibanding meminta tiap pemanggil reimplementasi loop sendiri.
//
// Reason wajib SAAT REASSIGN, opsional SAAT ASSIGN (Keputusan Den, Putaran
// 11 prompt 40 jawaban 5) -- ditegakkan DI LAYAR SAJA, badan RPC
// reassign_inquiry_owner TIDAK menambah pemeriksaan p_reason apa pun
// (lihat migrasi 20261028000001).
//
// Checkbox "Notify new owner" (default tercentang) mengirim p_notify ke
// RPC v3 (migrasi 20261028000001) -- notifikasi ke owner baru TETAP
// dikecualikan untuk self-assign (rule 111 nexus-notes.js) apa pun nilai
// p_notify, ditegakkan DI DALAM RPC, bukan di sini.
//
// Kotak "Also moves: N quotation/rate request" di mockup TIDAK dibangun --
// diperiksa (Putaran 11 prompt 40, syarat teks mockup): RLS
// quotations_read/quotations_update dan prf_select/prf_update_* memakai
// created_by = auth.uid(), BUKAN join ke inquiries.owner_id
// (schema_snapshot.sql:20046/:20053/:19804/:19811/:19818). Kepemilikan
// quotation/PRF TIDAK ikut inquiry.owner_id, jadi teks itu TIDAK benar di
// Nexus -- dilaporkan, tidak dibangun.
//
// Pemanggil WAJIB mengoper `key` yang berubah tiap kali dibuka supaya
// komponen remount dengan field bersih -- pola sama 3 modal lain di
// keluarga ini (DealCloseModals/DealWonModals/ChangeAccountModal).

import { useState, useEffect } from 'react';
import { UserCog, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { C, HEAD, BODY, fmtRp } from './DealPanels';
import { fetchOperationalRoster } from './salesRoster';

// Status "masih terbuka" -- SAMA PERSIS LOSABLE_INQUIRY_STATUS/
// CANCELLABLE_INQUIRY_STATUS (DealDetailPage.jsx). Const itu tidak
// diekspor dari sana; duplikat literal di sini HANYA dipakai utk
// menghitung label "(N open)" per kandidat New Owner -- bukan gerbang.
const OPEN_INQUIRY_STATUS = ['OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION'];

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(22,36,58,.45)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', padding: 16,
};
const sheet = {
  width: '100%', maxWidth: 480, background: '#fff',
  border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden',
};
const label = {
  display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 700,
  color: C.textFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5,
};
const field = {
  width: '100%', padding: '9px 11px', borderRadius: 9,
  border: `1px solid ${C.border}`, background: '#fff',
  fontFamily: BODY, fontSize: 13.5, color: C.text, outline: 'none',
};
const btnGhost = {
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.border}`,
  background: '#fff', color: C.navy, fontFamily: HEAD, fontSize: 12.5,
  fontWeight: 600, cursor: 'pointer',
};
// Navy solid -- Keputusan Den (Putaran 11 prompt 40 jawaban 1): pola
// IDENTIK tombol "Save" Change Account (aksi edit, bukan destruktif/
// sukses). Palet sage dikerjakan Putaran 16a, TIDAK disentuh di sini.
const btnPrimary = (disabled) => ({
  height: 34, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.navy}`,
  background: C.navy, color: '#fff', fontFamily: HEAD, fontSize: 12.5, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Array<{id:string, inquiry_no?:string, customer_name?:string, estimated_value?:number, owner_id?:string|null, owner_name?:string|null}>} targets
 *   SELALU array -- 1 elemen dari kebab Detail Inquiry / tombol per-baris,
 *   N elemen dari toolbar bulk.
 * @param {'assign'|'reassign'} mode -- ditentukan PEMANGGIL dari ada/
 *   tiadanya owner saat ini, BUKAN ditebak di dalam modal (bulk dari tab
 *   Unassigned SELALU 'assign').
 * @param {string} companyId -- entitas target (satu entitas utk seluruh
 *   `targets`, konsisten desain halaman Owner Assignment yang sudah
 *   di-scope profile.company_id).
 * @param {(newOwnerName?: string) => void} [onSaved] -- dipanggil sesudah
 *   SETIAP panggilan RPC selesai (termasuk saat sebagian gagal, supaya
 *   pemanggil bisa refresh daftar/detail dan melihat baris yang SUDAH
 *   berhasil) dengan nama owner baru.
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function OwnerAssignModal({ open, onClose, targets = [], mode = 'assign', companyId, onSaved, showToast }) {
  const [roster, setRoster] = useState([]);
  const [openCounts, setOpenCounts] = useState({});
  const [newOwner, setNewOwner] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const single = targets.length === 1;
  const isReassign = mode === 'reassign';
  const title = isReassign ? 'Reassign Owner' : 'Assign to Sales';
  const submitLabel = isReassign ? 'Reassign' : 'Assign';
  // Reason wajib HANYA saat reassign -- opsional saat assign (tunggal
  // ATAU bulk, keduanya SELALU assign; lihat header file).
  const reasonRequired = isReassign;

  // Roster + "(N open)" per kandidat -- dimuat ulang tiap kali modal
  // dibuka utk entitas ini. `.limit(1000)` konsisten konvensi fetch
  // (AGENTS.md).
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    fetchOperationalRoster(companyId).then(async (list) => {
      if (cancelled) return;
      setRoster(list);
      const ids = list.map((p) => p.id);
      if (!ids.length) { setOpenCounts({}); return; }
      const { data } = await supabase
        .from('inquiries')
        .select('owner_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('owner_id', ids)
        .in('status', OPEN_INQUIRY_STATUS)
        .limit(1000);
      if (cancelled) return;
      const counts = {};
      (data || []).forEach((r) => { counts[r.owner_id] = (counts[r.owner_id] || 0) + 1; });
      setOpenCounts(counts);
    });
    return () => { cancelled = true; };
  }, [open, companyId]);

  if (!open) return null;

  // Reassign (selalu target tunggal): kandidat TIDAK termasuk owner
  // sekarang. Assign (tunggal atau bulk): SEMUA kandidat (mockup --
  // "options = all salespeople except current owner when reassigning,
  // ALL salespeople when assigning").
  const currentOwnerId = isReassign && single ? targets[0]?.owner_id : null;
  const ownerOptions = roster
    .filter((p) => p.id !== currentOwnerId)
    .map((p) => ({ value: p.id, label: `${p.full_name} (${openCounts[p.id] || 0} open)` }));

  const totalValue = targets.reduce((sum, t) => sum + (Number(t.estimated_value) || 0), 0);

  async function submit() {
    if (!newOwner) { setErr('New Owner is required.'); return; }
    if (reasonRequired && !reason.trim()) { setErr('Reason is required for a reassignment.'); return; }
    setErr('');
    setSaving(true);

    const trimmedReason = reason.trim() || null;
    const newOwnerName = roster.find((p) => p.id === newOwner)?.full_name || 'Unknown';
    let okCount = 0;
    const failures = []; // { name, message }

    for (const t of targets) {
      // Loop sengaja sekuensial -- pola sama ReassignModal.jsx (Lead) baris
      // pool: satu RPC per target, bukan batch, supaya gagal-sebagian bisa
      // dilacak per-baris.
      const { error } = await supabase.rpc('reassign_inquiry_owner', {
        p_inquiry_id: t.id,
        p_new_owner_id: newOwner,
        p_reason: trimmedReason,
        p_notify: notify,
      });
      if (error) failures.push({ name: t.inquiry_no || t.id, message: error.message });
      else okCount++;
    }

    setSaving(false);

    if (failures.length) {
      const detail = failures.map((f) => `${f.name}: ${f.message}`).join(' | ');
      showToast?.(`${okCount} succeeded, ${failures.length} failed — ${detail}`, 'error');
      onSaved?.(newOwnerName); // baris yang berhasil tetap tersimpan -- refresh pemanggil
      return; // modal TETAP TERBUKA -- pesan sudah tampil, user memutuskan lanjut/batal
    }

    showToast?.(
      isReassign ? 'Inquiry owner updated.' : (single ? 'Inquiry assigned.' : `${okCount} inquiries assigned.`),
      'success',
    );
    onSaved?.(newOwnerName);
    onClose?.();
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={sheet}>
        <header style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <UserCog size={18} style={{ color: C.navy, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontFamily: HEAD, fontSize: 15.5, fontWeight: 700, color: C.text }}>{title}</h3>
            <div style={{ marginTop: 2, fontFamily: BODY, fontSize: 12.5, color: C.textMute }}>
              {single ? `Inquiry ${targets[0]?.inquiry_no || ''}` : `${targets.length} inquiries`}
            </div>
          </div>
        </header>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>Customer</label>
              <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>
                {single ? (targets[0]?.customer_name || '—') : 'Multiple customers'}
              </div>
            </div>
            <div>
              <label style={label}>{single ? 'Estimated Value' : 'Total Estimated Value'}</label>
              <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>{fmtRp(totalValue)}</div>
            </div>
          </div>

          {isReassign && single && (
            <div>
              <label style={label}>Current Owner</label>
              <div style={{ fontFamily: BODY, fontSize: 13.5, color: C.text }}>{targets[0]?.owner_name || 'Unassigned'}</div>
            </div>
          )}

          <div>
            <label style={label} htmlFor="owner-assign-new-owner">New Owner *</label>
            <select
              id="owner-assign-new-owner" style={field} value={newOwner}
              onChange={(e) => { setNewOwner(e.target.value); setErr(''); }}
            >
              <option value="">Select an active salesperson</option>
              {ownerOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={label} htmlFor="owner-assign-reason">
              Reason {reasonRequired ? <span style={{ color: C.amber }}>*</span> : <span style={{ fontWeight: 400, color: C.textFaint, textTransform: 'none' }}>(optional)</span>}
            </label>
            <textarea
              id="owner-assign-reason" rows={3}
              style={{ ...field, resize: 'vertical' }}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setErr(''); }}
              placeholder="Why this salesperson?"
            />
            <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 12, color: C.textFaint }}>
              Recorded in the Status History tab.
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: BODY, fontSize: 13, color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 16, height: 16 }} />
            Notify new owner
          </label>

          {err && (
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '9px 11px', borderRadius: 9,
              background: C.redBg, border: `1px solid ${C.redBd}`,
              fontFamily: BODY, fontSize: 12.5, color: C.red,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {err}
            </div>
          )}
        </div>

        <footer style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={btnPrimary(saving)} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
