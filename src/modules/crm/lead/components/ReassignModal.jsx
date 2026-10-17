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
// walau tombolnya terlihat. Effective Date TIDAK dipakai RPC
// lead_pool_assign (tak punya parameter itu) -- hanya relevan utk baris
// non-pool; dibiarkan terisi apa adanya, bukan disembunyikan kondisional
// (kompleksitas UI yang tak diminta). Reason SEKARANG ikut dikirim ke
// lead_pool_assign sebagai p_reason (TD-318 Irisan 2, migrasi
// 20261016000004) -- tersimpan di account_pool_history.reason utk baris
// pool juga, bukan cuma di activities utk baris non-pool.
//
// TD-318 Irisan 2: judul modal + label tombol memakai `allUnassigned`
// (SEMUA target tanpa pemilik), persis mockup `allUn` -- BUKAN `bulk`
// (accounts.length > 1). Satu lead tanpa pemilik dibuka dari Lead Detail
// juga allUnassigned=true (judul "Assign to Sales"), bukan hanya saat
// bulk; sebaliknya bulk-select beberapa lead yang SEMUA sudah berpemilik
// tetap "Reassign Lead" (allUnassigned=false), bukan "Assign to Sales".
// `bulk` TETAP dipakai di tempat lain (tampilan Current Owner, kata
// "owners" jamak) -- dua sumbu berbeda, jangan disatukan.
//
// TD-318 Irisan 3, REVISI 3 -- audit ulang token-per-token terhadap mockup
// :372-380 (tabel Irisan 2 sebelumnya menyatakan "persis mockup" padahal
// tidak, lihat laporan):
//   1. width 520->500.
//   2. Label "Current Owner" SEBELUMNYA uppercase/11px/700 -- mockup
//      `font:600 12px Inter,color:#5C6B52` TANPA uppercase, SAMA PERSIS
//      label field lain (Reason/Effective Date). Diperbaiki.
//   3. Kapsul SELALU dirender (termasuk Unassigned -- SEBELUMNYA nol
//      avatar sama sekali utk kasus itu) persis :375: `inline-flex, padding
//      4px 12px 4px 4px, radius pill, bg HEAD_BG, border 1px LINE`; avatar
//      24px (bukan 22), radius pill, font 700 10px Montserrat, teks avatar
//      SELALU INK (bukan tone.fg), border avatar 1px dashed TRANSPARENT
//      selalu (bukan kondisional). Isi 3 keadaan persis script mockup
//      `:748` (`reCur`/`reCurIni`/`reCurBg`): bulk -> String(count) di atas
//      HEAD_BG; satu lead berpemilik -> inisial di atas warna avatar; tanpa
//      pemilik -> KOSONG di atas LINE_SOFT + teks "Unassigned". Warna
//      avatar pemilik TETAP avatarToneFor() (bukan AV{nama:warna} mockup --
//      itu fixture 6 nama demo, tak bisa menggeneralisasi ke user nyata;
//      Kategori E, dicatat di laporan akhir).
//   4. "New Owner" (FloatingSelect) dapat tanda wajib (prop `required`).
//   5. Label checkbox SELALU "Notify previous owner" (mockup TIDAK
//      memplural -- SEBELUMNYA "...owners" saat bulk) + style
//      accentColor/ukuran persis :378 (`accent-color:#838E7A;
//      width:16px;height:16px`).
import { useState } from 'react';
import { Modal, FloatingInput, FloatingSelect, Textarea, SaveButton, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, FONT_BODY, FONT_HEAD, RADIUS, SP, avatarToneFor } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { getTodayWIB } from '../../../../lib/dateUtils';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {Array<{id:string, name:string, code?:string, company_id:string, assigned_to?:string|null, assigned_profile?:{full_name?:string}, is_in_lead_pool?:boolean}>} accounts
 * @param {(msg:string, type?:string)=>void} [showToast]
 * @param {(newOwnerName?: string) => void} onReassigned - TD-318 Irisan 4: dipanggil
 *   dengan nama owner baru (string, atau 'Unknown' kalau nol kecocokan di `profiles`
 *   -- lihat `newOwnerName` di `handleSave`), supaya pemanggil (mis.
 *   LeadAssignmentPage.jsx assign-from-pool) bisa menyusun toast dinamis tanpa
 *   query ulang. Argumen OPSIONAL -- pemanggil lama yang tak memakainya nol
 *   perubahan perilaku.
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
  //
  // TD-318 Irisan 4 (PLAN REVISI 2): saat `allUnassigned` (assign dari Lead
  // Pool/Free Agent Customer, bukan reassign biasa), kandidat di-scope
  // lewat `user_roles` (aktif + `valid_until IS NULL` + profil aktif),
  // PERSIS guard `lead_pool_assign` -- bukan `profiles.company_id` (query
  // lama, dipertahankan APA ADANYA untuk reassign biasa/`!allUnassigned`,
  // supaya nol perubahan perilaku pada jalur yang sudah teruji Irisan 2/3).
  // `profiles.company_id` = lokasi HOME user, bukan "punya peran aktif di
  // entitas ini" -- untuk target tanpa pemilik, menampilkan kandidat yang
  // kemudian ditolak RPC adalah UX yang lebih buruk daripada menyaringnya
  // lebih dulu. Multi-entitas: `user_roles.company_id IN companyIds`
  // (pola sama `companyIds` yang sudah ada), bukan hanya satu entitas
  // seperti AssignToSalesModal.jsx lama (yang cuma pernah menangani satu
  // akun sekaligus).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && companyIds.length) {
      setNewOwner(''); setReason(''); setEffectiveDate(getTodayWIB()); setNotify(true);
      if (allUnassigned) {
        // TD-318 Irisan 4, item G (tes Den + review Vir): RLS
        // user_roles_read hanya mengizinkan baris sendiri, atau
        // company_id=home + is_manager_or_above(), atau super admin --
        // approver Lead Pool LINTAS entitas (mis. staging: peran ceo di
        // SOA punya crm_lead_pool_approval) akan mendapat daftar kandidat
        // KOSONG lewat query user_roles+profiles langsung di atas (kelas
        // bug yang sama dgn gotcha #26/#35). Diganti RPC SECURITY DEFINER
        // `lead_pool_assign_candidates` (migrasi
        // 20261017000001_lead_pool_assign_candidates.sql, BELUM
        // DIJALANKAN) yang digerbang syarat PERSIS SAMA dgn
        // lead_pool_assign sendiri -- dipanggil SATU KALI per entitas di
        // `companyIds`, diambil IRISAN kalau target lebih dari satu
        // entitas. RPC error -> tampilkan pesannya, daftar dibiarkan
        // kosong (bukan diam-diam jatuh balik ke query lama).
        Promise.all(companyIds.map((cid) => supabase.rpc('lead_pool_assign_candidates', { p_company_id: cid })))
          .then((results) => {
            const firstError = results.find((r) => r.error)?.error;
            if (firstError) {
              showToast?.('Failed to load candidates: ' + firstError.message, 'error');
              setProfiles([]);
              return;
            }
            const sets = results.map((r) => r.data || []);
            const intersected = sets.reduce((acc, list) => {
              if (acc === null) return list;
              const ids = new Set(list.map((p) => p.id));
              return acc.filter((p) => ids.has(p.id));
            }, null) || [];
            setProfiles(intersected);
          });
      } else {
        supabase.from('profiles').select('id, full_name').in('company_id', companyIds).eq('active', true)
          .order('full_name', { ascending: true }).limit(1000)
          .then(({ data }) => setProfiles(data || []));
      }
    }
  }

  const canSave = !!newOwner && accounts.length > 0;

  async function handleSave() {
    if (!canSave) return { error: new Error('Select a new owner') };

    // TD-318 Irisan 4, temuan A (KRITIS, tes Den + review Vir): `.filter(a
    // => !a.is_in_lead_pool)` menganggap `undefined` sebagai "bukan pool"
    // (!undefined === true) -- kalau PEMANGGIL lupa menyertakan
    // `is_in_lead_pool` di query/props-nya, SEMUA akun diam-diam jatuh ke
    // jalur .update() langsung (DILARANG komentar header file ini sendiri,
    // :23) walau sebenarnya is_in_lead_pool=true -- assigned_to terisi
    // tapi is_in_lead_pool/lifecycle_stage/account_pool_history tak pernah
    // tersentuh (bukti staging: LeadAssignmentPage.jsx tak men-select
    // kolom ini). Pengaman: TOLAK secara eksplisit kalau `is_in_lead_pool`
    // tak diketahui (undefined) pada akun MANA PUN -- JANGAN diam-diam
    // menebak jalur, supaya kesalahan wiring seperti ini ketahuan saat tes
    // (console.error + toast), bukan sukses-tapi-salah secara senyap.
    const unknownPool = accounts.filter((a) => a.is_in_lead_pool === undefined);
    if (unknownPool.length) {
      console.error('[ReassignModal] is_in_lead_pool tidak diketahui (undefined) pada akun:', unknownPool.map((a) => a.id),
        '-- pemanggil lupa menyertakan kolom ini di query/props. Dibatalkan supaya tidak diam-diam memakai jalur .update() yang salah.');
      return { error: new Error('Internal error: is_in_lead_pool missing on target account(s) — reassign cancelled, contact support') };
    }

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
    // adanya, bukan diseragamkan. p_reason dikirim sama dengan baris
    // non-pool (TD-318 Irisan 2, migrasi 20261016000004) -- trim, null
    // kalau kosong (bukan string kosong -- account_pool_history.reason
    // lebih bersih NULL daripada '').
    const trimmedReason = reason.trim() || null;
    let poolOkCount = 0;
    for (const a of poolAccounts) {
      const { error } = await supabase.rpc('lead_pool_assign', { p_account_id: a.id, p_user_id: newOwner, p_reason: trimmedReason });
      if (error) failures.push({ name: a.name, message: error.message });
      else { okCount++; poolOkCount++; }
    }
    // Satu dispatch utk SELURUH baris pool baris ini (bukan per baris) --
    // badge sidebar cukup tahu "sesuatu berubah", bukan apa/berapa banyak.
    if (poolOkCount > 0) window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));

    if (failures.length) {
      const detail = failures.map((f) => `${f.name}: ${f.message}`).join(' | ');
      showToast?.(`${okCount} succeeded, ${failures.length} failed — ${detail}`, 'error');
      onReassigned?.(newOwnerName); // baris yang berhasil tetap tersimpan -- refresh daftar pemanggil
      return false; // SaveButton: idle tanpa "Tersimpan!" -- pesan sudah ditampilkan di atas
    }
    onReassigned?.(newOwnerName);
    return undefined;
  }

  if (!accounts.length) return null;

  // REVISI 3, §3: tiga keadaan kapsul Current Owner persis script mockup
  // `:748` -- reCur/reCurIni/reCurBg.
  const name = !bulk ? accounts[0].assigned_profile?.full_name : null;
  const capsuleText = bulk ? `${accounts.length} leads` : (name || 'Unassigned');
  const capsuleIni = bulk ? String(accounts.length) : (name ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '');
  const capsuleBg = bulk ? HEAD_BG : (name ? avatarToneFor(accounts[0].assigned_to).bg : LINE_SOFT);

  return (
    <Modal open={open} onClose={onClose} title={title ?? (allUnassigned ? 'Assign to Sales' : 'Reassign Lead')} width={500} footer={(
      <>
        <OutlineBtn onClick={onClose}>Cancel</OutlineBtn>
        <SaveButton onSave={handleSave} label={allUnassigned ? 'Assign' : 'Save and Reassign'} savedLabel={allUnassigned ? 'Assigned!' : 'Reassigned!'} disabled={!canSave}
          onError={(err) => showToast?.('Failed to reassign: ' + err.message, 'error')} />
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {/* REVISI 3, §2: label PERSIS field lain (600 12px Inter
              #5C6B52) -- SEBELUMNYA uppercase/11px/700, tak cocok mockup. */}
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: INK_SOFT }}>Current Owner</span>
          <span style={{
            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 12px 4px 4px', borderRadius: RADIUS.pill, background: HEAD_BG, border: `1px solid ${LINE}`,
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: RADIUS.pill, background: capsuleBg, border: '1px dashed transparent',
              color: INK, fontFamily: FONT_HEAD, fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 24px',
            }}>
              {capsuleIni}
            </span>
            {capsuleText}
          </span>
        </div>

        <FloatingSelect label="New Owner" required value={newOwner} onChange={setNewOwner}
          options={[{ value: '', label: 'Select an active salesperson' }, ...profiles
            .filter((p) => bulk || p.id !== accounts[0].assigned_to)
            .map((p) => ({ value: p.id, label: p.full_name }))]} />

        <Textarea label="Reason" value={reason} onChange={setReason} rows={3} placeholder="Why is this lead being reassigned?"
          hint="Recorded in the activity timeline." />

        <FloatingInput label="Effective Date" type="date" value={effectiveDate} onChange={setEffectiveDate} />

        {/* REVISI 3, §5: label SELALU "Notify previous owner" (mockup tak
            memplural, :378) + style persis accent-color #838E7A / 16x16. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK, fontFamily: FONT_BODY, cursor: 'pointer' }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)}
            style={{ accentColor: INK_FAINT, width: 16, height: 16 }} />
          Notify previous owner
        </label>
      </div>
    </Modal>
  );
}
