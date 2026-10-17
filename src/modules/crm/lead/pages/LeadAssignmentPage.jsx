// src/modules/crm/lead/pages/LeadAssignmentPage.jsx
// "Lead Assignment / Claim" -- slot 1.1.2, design-handoff/crm-2026-10-11/
// Lead Management.dc.html (poolOpts final, baris ~809: Leads / Free Agent
// Customers / Pull Approvals, approvals khusus pemegang
// crm_lead_pool_approval). Batch DS 3 Lead Management, irisan 9 Paket 2 --
// GANTIKAN LeadPoolPage.jsx + LeadPoolApprovalPage.jsx (dihapus).
//
// SATU query accounts (is_in_lead_pool=true) dipecah client-side jadi tiga
// baris tampilan -- pull_status='pending' SELALU menyiratkan
// is_in_lead_pool=true (invarian RPC), jadi tab Approvals tidak perlu query
// terpisah. Last Owner/Requested By diresolve lewat profMap (id->nama),
// BUKAN embed FK -- accounts.lead_pool_last_owner/pull_requested_by nol FK
// bernama yang bisa dipakai PostgREST embed di sini (beda dari assigned_to
// yang punya prospects_assigned_to_fkey).
//
// NOL .from('accounts').update(...) di file ini -- seluruh tulis lewat RPC
// (lead_pool_release/request_pull/approve_pull/reject_pull, dan kini
// lead_pool_assign lewat ReassignModal -- lihat TD-318 Irisan 4).
//
// Tab Free Agent Customers pakai kolom PERSIS mockup (keputusan Den):
// Released On = lead_pool_at, Release Reason = lead_pool_reason, Last
// Invoice & Invoice Value Before Release tampil '—' literal (data invoice
// MSI masih di Odoo, belum ada jalur baca di Nexus).
//
// TD-318 Irisan 4 (audit token-per-token penuh vs Lead Management.dc.html
// :104-153 + script renderVals -- termasuk DUA definisi poolOpts/
// poolCountLabel yang ternyata ada di mockup, baris 678/680 [dua-tab lama,
// vestigial/mati] vs 811/814 [tiga-tab, DEFINITIF -- dipakai markup nyata
// `{{o.bd}}`/`{{o.bg}}` yang hanya ada di bentuk 811]):
//   #33 -- kolom aksi dirombak PERSIS `canRequest`/`showMyPending`/
//     `canAssign` mockup (:551/:815) -- lihat RowActions di bawah.
//   #34 -- Entity FAC dari `company_id` (FK prospects_company_id_fkey,
//     schema_snapshot.sql:16375), BUKAN `owner_company_id` (nullable, FK
//     prospects_owner_company_id_fkey, :16399) yang scoping utama TIDAK
//     memakainya (lihat `.eq('company_id', ...)` di query bawah).
//   Ketiga tabel: grid CSS persis mockup (pola sama LeadQualificationPage,
//   Fase 1) -- header FONT_HEAD, Account Code mono-bold, hover ROW_HOVER,
//   label hitung terpisah (`poolCountLabel`-equivalent).
//   Account Code JADI LINK, Company Name teks biasa -- persis mockup
//   `r.open` di SEMUA baris (:119/:126/:140). Versi lama (Company Name
//   link) satu-satunya sumbernya KOMENTAR KODE sendiri ("instruksi Den
//   irisan berikutnya") -- nol jejak di PROGRESS.md/08_TECH_DEBT.md/commit
//   message mana pun yang menyebut keputusan ini secara independen.
//   Mengikuti aturan PLAN Irisan 4: tanpa sumber lain, ikut mockup.
import { useState, useEffect, useCallback } from 'react';
import { UserPlus } from 'lucide-react';
import { PageHeader, Card, EmptyState, Segmented, Badge, OutlineBtn, PrimaryBtn } from '../../../../kit';
import { INK, INK_SOFT, INK_FAINT, LINE_SOFT, HEAD_BG, FONT_BODY, FONT_HEAD, FONT_MONO, ROW_HOVER, SP, fmtRp, avatarToneFor } from '../../../../kit/tokens';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../contexts/useAuth';
import { isAllEntities as isAllEntitiesRole } from '../../../../lib/roles';
import { SOURCE_LABELS } from '../lib/leadOptions';
import RequestPullModal from '../components/RequestPullModal';
import RejectPullModal from '../components/RejectPullModal';
import ReassignModal from '../components/ReassignModal';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PullStatusBadge({ status }) {
  if (status === 'pending') return <Badge tone="warn">Pending Approval</Badge>;
  if (status === 'rejected') return <Badge tone="neutral">Rejected</Badge>;
  return <span style={{ color: INK_FAINT, fontSize: 13 }}>—</span>;
}

// Account Code JADI LINK (persis mockup `r.open` -- Pool :119, FAC :126,
// Approvals :140), Company Name tetap teks biasa. Dulu TERBALIK (Company
// Name link) -- lihat catatan header file utk alasan koreksi.
function CodeLink({ row, onSelectAccount, children }) {
  if (!onSelectAccount) return children;
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onSelectAccount(row); }} style={{ color: INK, textDecoration: 'underline' }}>
      {children}
    </a>
  );
}

// TD-318 Irisan 4, temuan B (tes Den + review Vir): toast yang memakai
// `.code` langsung berbunyi "null assigned to ..." saat code kosong --
// pakai code kalau ada, kalau kosong pakai nama akun (konvensi yang sama
// dgn `tgtLabel`/label Mark-as-Lost-Archive di LeadCapturePage.jsx/
// LeadDetailPage.jsx, Irisan 3).
function codeOrName(a) { return a?.code || a?.name || ''; }

// TD-318 Irisan 4, temuan C (tes Den + review Vir): Account Code kosong
// dulu tetap jadi LINK berisi '--' bergaris bawah (terbaca seperti '=').
// Kalau code ADA: Account Code jadi link (persis mockup), Company Name teks
// biasa. Kalau code KOSONG: Account Code '--' POLOS INK_FAINT tanpa link,
// Company Name JADI link supaya baris tetap bisa dibuka.
function AccountCodeCell({ row, onSelectAccount }) {
  if (!row.code) return <span style={{ color: INK_FAINT, fontFamily: FONT_BODY, fontWeight: 400 }}>—</span>;
  return <CodeLink row={row} onSelectAccount={onSelectAccount}>{row.code}</CodeLink>;
}
function CompanyNameCell({ row, onSelectAccount }) {
  if (row.code) return row.name;
  return <CodeLink row={row} onSelectAccount={onSelectAccount}>{row.name}</CodeLink>;
}

const headCell = { padding: '12px', fontFamily: FONT_HEAD, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, whiteSpace: 'nowrap' };
const cell = { padding: '12px', fontFamily: FONT_BODY, fontSize: 13, color: INK, minWidth: 0 };

const POOL_GRID_COLS = '96px minmax(170px,1.4fr) 124px minmax(180px,1.3fr) 108px minmax(130px,1fr) 136px 140px 160px';
const POOL_GRID_MIN_W = 1180;
const FAC_GRID_COLS = '110px minmax(200px,1.4fr) 72px minmax(130px,1fr) 112px 112px 160px minmax(200px,1.4fr) 140px 160px';
const FAC_GRID_MIN_W = 1460;
const APPR_GRID_COLS = '96px 96px minmax(170px,1.3fr) minmax(150px,1fr) 116px minmax(220px,1.8fr) 136px 196px';
const APPR_GRID_MIN_W = 1240;

function gridRow(cols, minW, extra) {
  return { display: 'grid', gridTemplateColumns: cols, minWidth: minW, alignItems: 'center', ...extra };
}
function hoverHandlers() {
  return {
    onMouseEnter: (e) => { e.currentTarget.style.background = ROW_HOVER; },
    onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
  };
}

// Kolom aksi tab Leads/Free Agent -- SATU logika dipakai kedua tabel,
// PERSIS mockup `canRequest`/`showMyPending`/`canAssign` (:551, :815):
//   canRequest    = !canApprove (proksi `isSales`) DAN belum pending.
//   showMyPending = !canApprove DAN pending DAN pengaju = diri sendiri --
//     badge "Pending Approval" DI KOLOM AKSI (duplikat sinyal kolom Pull
//     Status, tapi persis mockup -- bukan kelupaan menghapus duplikat).
//   canAssign     = canApprove, TANPA syarat pending sama sekali -- klik
//     men-assign LANGSUNG; RPC lead_pool_assign sendiri yang menutup pull
//     pending dari user lain + mengirim notifikasi (migrasi
//     20261016000004) -- TIDAK ADA tombol "Review" di baris, mockup tak
//     punya ini (dulu ada, dicabut Irisan 4).
function RowActions({ row, canApprove, profileId, showAssignIcon, onRequestPull, onAssign }) {
  const pending = row.pull_status === 'pending';
  const canRequest = !canApprove && !pending;
  const showMyPending = !canApprove && pending && row.pull_requested_by === profileId;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      {canRequest && <OutlineBtn size="sm" onClick={() => onRequestPull(row)}>Request Pull</OutlineBtn>}
      {showMyPending && <Badge tone="warn">Pending Approval</Badge>}
      {canApprove && (
        <OutlineBtn size="sm" icon={showAssignIcon ? <UserPlus /> : undefined} onClick={() => onAssign(row)}>
          Assign to Sales
        </OutlineBtn>
      )}
    </div>
  );
}

/**
 * @param {boolean} canApprove - pemegang crm_lead_pool_approval (dari route wrapper, hasMenuPermission)
 * @param {'pool'|'fac'|'approvals'} [initialView='pool'] - dipakai rute /crm/lead/assignment/approval (bookmark lama)
 * @param {(account:{id:string})=>void} [onSelectAccount]
 * @param {(msg:string, type?:string)=>void} [showToast]
 */
export default function LeadAssignmentPage({ canApprove, initialView = 'pool', onSelectAccount, showToast }) {
  const { profile, erpRoles } = useAuth();
  const isAllEntities = isAllEntitiesRole(erpRoles);

  const [view, setView] = useState(initialView === 'approvals' && canApprove ? 'approvals' : 'pool');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profMap, setProfMap] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  const [pullTarget, setPullTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    // Sengaja TANPA setLoading(true) sinkron di sini (react-hooks/
    // set-state-in-effect -- pola sama LeadCapturePage.fetchLeads): `loading`
    // mulai `true` lewat useState awal, jadi pemuatan PERTAMA tetap
    // menampilkan "Loading data…"; refetch berikutnya (reloadKey berubah,
    // sesudah aksi RPC) memperbarui baris tanpa kedipan loading.
    // TD-318 Irisan 4, temuan A (KRITIS): `is_in_lead_pool` DAN `assigned_to`
    // WAJIB ikut di-select -- ReassignModal.jsx (`:157-158`) menentukan
    // jalur tulis (RPC lead_pool_assign vs .update() langsung) PERSIS dari
    // `is_in_lead_pool` pada setiap akun yang diterimanya. Tanpa kolom ini,
    // nilainya undefined -- lihat guard baru ReassignModal.jsx yang
    // sekarang menolak (bukan menebak) kalau kolom ini tak ada.
    let query = supabase
      .from('accounts')
      .select(`
        id, code, name, source, lifecycle_stage, estimated_value, company_id,
        is_in_lead_pool, assigned_to,
        lead_pool_reason, lead_pool_at, lead_pool_last_owner,
        pull_status, pull_requested_by, pull_requested_at, pull_justification,
        entity:companies!prospects_company_id_fkey(code, name)
      `)
      .eq('is_in_lead_pool', true)
      .is('deleted_at', null);
    if (!isAllEntities) query = query.eq('company_id', profile.company_id);

    query.order('lead_pool_at', { ascending: false }).limit(1000).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { showToast?.('Failed to load Lead Pool: ' + error.message, 'error'); setRows([]); setLoading(false); return; }
      const list = data || [];
      setRows(list);

      const ids = [...new Set(list.flatMap((r) => [r.lead_pool_last_owner, r.pull_requested_by]).filter(Boolean))];
      if (!ids.length) { setProfMap({}); setLoading(false); return; }
      supabase.from('profiles').select('id, full_name').in('id', ids).limit(1000).then(({ data: profs }) => {
        if (cancelled) return;
        const map = {};
        (profs || []).forEach((p) => { map[p.id] = p.full_name; });
        setProfMap(map);
        setLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, showToast, reloadKey]);

  const poolRows = rows.filter((r) => r.lifecycle_stage !== 'free_agent');
  const facRows = rows.filter((r) => r.lifecycle_stage === 'free_agent');
  const apprRows = rows.filter((r) => r.pull_status === 'pending');

  const tabs = [
    { value: 'pool', label: `Leads (${poolRows.length})` },
    { value: 'fac', label: `Free Agent Customers (${facRows.length})` },
    ...(canApprove ? [{ value: 'approvals', label: `Pull Approvals (${apprRows.length})` }] : []),
  ];
  // Pengaju tanpa izin approval tidak boleh terdampar di tab Approvals kalau
  // izinnya dicabut sesudah mount -- jatuh balik ke Leads (pola sama dgn
  // mockup `poolView = isSales && s.poolView==='approvals' ? 'pool' : s.poolView`).
  const activeView = view === 'approvals' && !canApprove ? 'pool' : view;

  // Label hitung terpisah di sebelah tab pills -- persis mockup
  // `poolCountLabel` (:814, bentuk 3-tab definitif -- lihat catatan header
  // file soal dua definisi yang ada di mockup).
  const countLabel = activeView === 'pool' ? `${poolRows.length} leads in the pool`
    : activeView === 'fac' ? `${facRows.length} customers released to the pool`
    : `${apprRows.length} requests waiting for approval`;

  return (
    <div>
      {/* TD-318 Irisan 4 (audit header): breadcrumb mockup ("CRM (Business
          Development) > Lead Management > Lead Assignment / Claim", :47)
          SENGAJA TIDAK ditambah lewat prop `crumbs` -- ContextHeader
          (route-table.jsx, layout bersama seluruh halaman Kerangka Bagian
          1) SUDAH merender breadcrumb "Modul > Level 2 > Level 3" sekali
          di atas halaman ini; menambah `crumbs` di sini akan jadi
          breadcrumb GANDA (pelajaran yang sama sudah dicatat
          LeadCapturePage.jsx, diverifikasi staging). H1 "Lead Assignment /
          Claim" sudah persis mockup `PAGES.pool`. */}
      <PageHeader title="Lead Assignment / Claim" />

      <div style={{ marginBottom: SP.s4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Segmented ariaLabel="Lead Assignment view" value={activeView} onChange={setView} options={tabs} />
        <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK_SOFT }}>{countLabel}</span>
      </div>

      {activeView === 'pool' && (
        <PoolTable
          rows={poolRows} loading={loading} profMap={profMap} canApprove={canApprove} profileId={profile?.id}
          onSelectAccount={onSelectAccount}
          onRequestPull={(a) => setPullTarget(a)} onAssign={(a) => setAssignTarget(a)}
        />
      )}
      {activeView === 'fac' && (
        <FreeAgentTable
          rows={facRows} loading={loading} profMap={profMap} canApprove={canApprove} profileId={profile?.id}
          onSelectAccount={onSelectAccount}
          onRequestPull={(a) => setPullTarget(a)} onAssign={(a) => setAssignTarget(a)}
        />
      )}
      {activeView === 'approvals' && canApprove && (
        <ApprovalsTable
          rows={apprRows} loading={loading} profMap={profMap} profile={profile}
          onSelectAccount={onSelectAccount}
          onReject={(a) => setRejectTarget(a)}
          onApprove={async (a) => {
            const { error } = await supabase.rpc('lead_pool_approve_pull', { p_account_id: a.id });
            if (error) { showToast?.('Failed to approve: ' + error.message, 'error'); return; }
            window.dispatchEvent(new CustomEvent('nexus:lead-pool-changed'));
            const ownerName = profMap[profile?.id] || profile?.full_name || 'you';
            showToast?.(`Approved. ${codeOrName(a)} is now owned by ${ownerName}`, 'success');
            refetch();
          }}
        />
      )}

      {/* TD-318 Irisan 3: toast dinamis persis mockup submitPull/saveReject
          -- "by" (pengaju) utk Reject diresolve dari pull_requested_by yang
          SUDAH ter-select di query utama (lihat komentar header) lewat
          profMap yang SUDAH ada di scope ini, NOL query baru. */}
      <RequestPullModal open={!!pullTarget} onClose={() => setPullTarget(null)} account={pullTarget} showToast={showToast}
        onRequested={() => { setPullTarget(null); showToast?.(`Pull request for ${codeOrName(pullTarget)} sent for approval`); refetch(); }} />
      <RejectPullModal open={!!rejectTarget} onClose={() => setRejectTarget(null)} account={rejectTarget} showToast={showToast}
        onRejected={() => {
          const by = rejectTarget?.pull_requested_by ? (profMap[rejectTarget.pull_requested_by] || 'the requester') : 'the requester';
          showToast?.(`Request rejected. ${by} has been notified`);
          setRejectTarget(null); refetch();
        }} />
      {/* TD-318 Irisan 4: AssignToSalesModal.jsx DIHAPUS -- assign dari Pool/FAC
          kini lewat ReassignModal.jsx (sama persis mockup `openAssign`/
          `saveRe` assignCust -- satu modal, bukan dua). Target SELALU tanpa
          pemilik di sini (is_in_lead_pool=true dari query utama), jadi
          `allUnassigned` otomatis true -- judul/tombol "Assign to Sales"/
          "Assign" muncul lewat logika yang SUDAH ADA, nol kode tambahan. */}
      {/* TD-318 Irisan 4, temuan A: `is_in_lead_pool: true` dipaksa EKSPLISIT
          di sini sbg pengaman LAPIS KEDUA -- SELURUH baris di halaman ini
          berasal dari query ber-`.eq('is_in_lead_pool', true)` (lihat atas),
          jadi nilainya SELALU true, tapi menuliskannya ulang di titik
          pemanggilan modal bersama membuatnya tidak bergantung diam-diam
          pada bentuk SELECT yang mungkin berubah lagi di masa depan. */}
      <ReassignModal open={!!assignTarget} onClose={() => setAssignTarget(null)}
        accounts={assignTarget ? [{ ...assignTarget, is_in_lead_pool: true }] : []} showToast={showToast}
        onReassigned={(salesName) => {
          showToast?.(`${codeOrName(assignTarget)} assigned to ${salesName || 'sales'}`);
          setAssignTarget(null); refetch();
        }} />
    </div>
  );
}

function PoolTable({ rows, loading, profMap, canApprove, profileId, onSelectAccount, onRequestPull, onAssign }) {
  return (
    <Card padded={false}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
      ) : rows.length === 0 ? (
        // TD-318 Irisan 4 (REVISI 1): mockup NOL empty-state utk tab Pool/FAC
        // (hanya header tabel kosong kalau poolRows/facRows kosong) -- beda
        // dari Approvals yang punya teks polos (:152). EmptyState kit
        // DIPERTAHANKAN di sini -- bukan mockup menolaknya, mockup sekadar
        // tidak pernah membahas keadaan ini sama sekali.
        <EmptyState icon="inbox" title="No leads in the pool" sub="Leads released or swept into the pool will appear here." />
      ) : (
        <div className="nk-scroll" role="table" aria-label="Lead Pool" style={{ overflowX: 'auto' }}>
          <div role="row" style={{ ...gridRow(POOL_GRID_COLS, POOL_GRID_MIN_W, { background: HEAD_BG }) }}>
            <div role="columnheader" style={headCell}>Account Code</div>
            <div role="columnheader" style={headCell}>Company Name</div>
            <div role="columnheader" style={headCell}>Source</div>
            <div role="columnheader" style={headCell}>Pool Reason</div>
            <div role="columnheader" style={headCell}>Pooled On</div>
            <div role="columnheader" style={headCell}>Last Owner</div>
            <div role="columnheader" style={{ ...headCell, textAlign: 'right' }}>Estimated Value</div>
            <div role="columnheader" style={headCell}>Pull Status</div>
            <div role="columnheader" style={headCell} />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} role="row" {...hoverHandlers()}
              style={gridRow(POOL_GRID_COLS, POOL_GRID_MIN_W, { borderBottom: i < rows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' })}>
              <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, fontWeight: 600 }}>
                <AccountCodeCell row={r} onSelectAccount={onSelectAccount} />
              </div>
              <div role="cell" style={{ ...cell, fontWeight: 500 }}><CompanyNameCell row={r} onSelectAccount={onSelectAccount} /></div>
              <div role="cell" style={cell}><Badge tone="neutral">{SOURCE_LABELS[r.source] || r.source || '—'}</Badge></div>
              <div role="cell" style={{ ...cell, color: INK_SOFT }}>{r.lead_pool_reason || '—'}</div>
              <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, color: INK_SOFT }}>{fmtDate(r.lead_pool_at)}</div>
              <div role="cell" style={{ ...cell, color: r.lead_pool_last_owner ? INK : INK_FAINT }}>{r.lead_pool_last_owner ? (profMap[r.lead_pool_last_owner] || '—') : 'None'}</div>
              <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, textAlign: 'right' }}>{r.estimated_value != null ? fmtRp(r.estimated_value) : '—'}</div>
              <div role="cell" style={cell}><PullStatusBadge status={r.pull_status} /></div>
              <div role="cell" style={{ ...cell, display: 'flex', justifyContent: 'flex-end' }}>
                <RowActions row={r} canApprove={canApprove} profileId={profileId} showAssignIcon onRequestPull={onRequestPull} onAssign={onAssign} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FreeAgentTable({ rows, loading, profMap, canApprove, profileId, onSelectAccount, onRequestPull, onAssign }) {
  return (
    <Card padded={false}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title="No Free Agent customers" sub="Dormant customers released to the pool will appear here." />
      ) : (
        <div className="nk-scroll" role="table" aria-label="Free Agent Customers" style={{ overflowX: 'auto' }}>
          <div role="row" style={gridRow(FAC_GRID_COLS, FAC_GRID_MIN_W, { background: HEAD_BG })}>
            <div role="columnheader" style={headCell}>Customer Code</div>
            <div role="columnheader" style={headCell}>Company Name</div>
            <div role="columnheader" style={headCell}>Entity</div>
            <div role="columnheader" style={headCell}>Last Owner</div>
            <div role="columnheader" style={headCell}>Released On</div>
            <div role="columnheader" style={headCell}>Last Invoice</div>
            <div role="columnheader" style={{ ...headCell, textAlign: 'right' }}>Invoice Value Before Release</div>
            <div role="columnheader" style={headCell}>Release Reason</div>
            <div role="columnheader" style={headCell}>Pull Status</div>
            <div role="columnheader" style={headCell} />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} role="row" {...hoverHandlers()}
              style={gridRow(FAC_GRID_COLS, FAC_GRID_MIN_W, { borderBottom: i < rows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' })}>
              <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, fontWeight: 600 }}>
                <AccountCodeCell row={r} onSelectAccount={onSelectAccount} />
              </div>
              <div role="cell" style={{ ...cell, fontWeight: 500 }}><CompanyNameCell row={r} onSelectAccount={onSelectAccount} /></div>
              {/* TD-318 Irisan 4, #34: Entity dari company_id (embed
                  prospects_company_id_fkey), BUKAN owner_company_id yang
                  nullable dan bukan sumbu scoping -- lihat catatan header. */}
              <div role="cell" style={cell}><Badge tone="neutral">{r.entity?.code || '—'}</Badge></div>
              <div role="cell" style={{ ...cell, color: r.lead_pool_last_owner ? INK : INK_FAINT }}>{r.lead_pool_last_owner ? (profMap[r.lead_pool_last_owner] || '—') : 'None'}</div>
              <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, color: INK_SOFT }}>{fmtDate(r.lead_pool_at)}</div>
              <div role="cell" style={{ ...cell, color: INK_FAINT }}>—</div>
              <div role="cell" style={{ ...cell, color: INK_FAINT, textAlign: 'right' }}>—</div>
              <div role="cell" style={{ ...cell, color: INK_SOFT }}>{r.lead_pool_reason || '—'}</div>
              <div role="cell" style={cell}><PullStatusBadge status={r.pull_status} /></div>
              <div role="cell" style={{ ...cell, display: 'flex', justifyContent: 'flex-end' }}>
                {/* TD-318 Irisan 4 (REVISI 2): TANPA ikon di tombol Assign --
                    persis mockup FAC (:129, beda dari Pool/Table :120 yang
                    BER-ikon -- mockup sendiri tidak konsisten, diikuti apa
                    adanya per tabel). */}
                <RowActions row={r} canApprove={canApprove} profileId={profileId} showAssignIcon={false} onRequestPull={onRequestPull} onAssign={onAssign} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ApprovalTooltip({ show }) {
  if (!show) return null;
  return (
    <div role="tooltip" style={{
      position: 'absolute', right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)',
      background: INK, color: '#FFFFFF', padding: '8px 12px', borderRadius: 10,
      fontFamily: FONT_BODY, fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(51,66,43,.2)', zIndex: 10,
    }}>
      You cannot approve your own request
    </div>
  );
}

function ApprovalsTable({ rows, loading, profMap, profile, onSelectAccount, onApprove, onReject }) {
  const [tipRowId, setTipRowId] = useState(null);
  return (
    <Card padded={false}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
      ) : rows.length === 0 ? (
        // TD-318 Irisan 4 (REVISI 1): teks polos persis mockup (:152
        // `noAppr`), BUKAN EmptyState kit -- satu-satunya tab yang mockup
        // sendiri mendefinisikan keadaan kosongnya secara eksplisit.
        <div style={{ padding: '32px 16px', textAlign: 'center', color: INK_SOFT, fontFamily: FONT_BODY }}>
          No pull requests waiting for approval.
        </div>
      ) : (
        <div className="nk-scroll" role="table" aria-label="Pull Approvals" style={{ overflowX: 'auto' }}>
          <div role="row" style={gridRow(APPR_GRID_COLS, APPR_GRID_MIN_W, { background: HEAD_BG })}>
            <div role="columnheader" style={headCell}>Account Code</div>
            <div role="columnheader" style={headCell}>Type</div>
            <div role="columnheader" style={headCell}>Company Name</div>
            <div role="columnheader" style={headCell}>Requested By</div>
            <div role="columnheader" style={headCell}>Requested On</div>
            <div role="columnheader" style={headCell}>Reason</div>
            <div role="columnheader" style={{ ...headCell, textAlign: 'right' }}>Estimated Value</div>
            <div role="columnheader" style={headCell} />
          </div>
          {rows.map((r, i) => {
            const self = r.pull_requested_by === profile?.id;
            const requesterName = r.pull_requested_by ? (profMap[r.pull_requested_by] || '—') : '—';
            const tone = r.pull_requested_by ? avatarToneFor(r.pull_requested_by) : null;
            return (
              <div key={r.id} role="row" {...hoverHandlers()}
                style={gridRow(APPR_GRID_COLS, APPR_GRID_MIN_W, { borderBottom: i < rows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' })}>
                <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, fontWeight: 600 }}>
                  <AccountCodeCell row={r} onSelectAccount={onSelectAccount} />
                </div>
                <div role="cell" style={cell}><Badge tone="neutral">{r.lifecycle_stage === 'free_agent' ? 'Customer' : 'Lead'}</Badge></div>
                <div role="cell" style={{ ...cell, fontWeight: 500 }}><CompanyNameCell row={r} onSelectAccount={onSelectAccount} /></div>
                <div role="cell" style={cell}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tone && (
                      <span style={{ width: 24, height: 24, borderRadius: 12, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 24px' }}>
                        {requesterName !== '—' ? requesterName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?'}
                      </span>
                    )}
                    {requesterName}
                  </span>
                </div>
                <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, color: INK_SOFT, whiteSpace: 'nowrap' }}>{fmtDate(r.pull_requested_at)}</div>
                <div role="cell" style={{ ...cell, color: INK_SOFT }}>{r.pull_justification || '—'}</div>
                <div role="cell" style={{ ...cell, fontFamily: FONT_MONO, textAlign: 'right' }}>{r.estimated_value != null ? fmtRp(r.estimated_value) : '—'}</div>
                <div role="cell" style={{ ...cell, display: 'flex', justifyContent: 'flex-end' }}>
                  <div onMouseEnter={() => self && setTipRowId(r.id)} onMouseLeave={() => setTipRowId(null)} style={{ position: 'relative', display: 'flex', gap: 8 }}>
                    {/* TD-318 Irisan 4: Approve jadi PrimaryBtn (filled ACCENT,
                        persis mockup :145 -- sebelumnya outline sama dgn
                        Reject). Tooltip custom (role="tooltip") menggantikan
                        native `title`, persis mockup :148. */}
                    <PrimaryBtn size="sm" disabled={self} onClick={() => !self && onApprove(r)}>Approve</PrimaryBtn>
                    <OutlineBtn size="sm" disabled={self} onClick={() => !self && onReject(r)}>Reject</OutlineBtn>
                    <ApprovalTooltip show={self && tipRowId === r.id} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
