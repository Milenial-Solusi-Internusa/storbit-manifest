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
// (lead_pool_release/request_pull/approve_pull/reject_pull/assign).
//
// Tab Free Agent Customers pakai kolom PERSIS mockup (keputusan Den):
// Released On = lead_pool_at, Release Reason = lead_pool_reason, Last
// Invoice & Invoice Value Before Release tampil '—' literal (data invoice
// MSI masih di Odoo, belum ada jalur baca di Nexus).
import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Card, EmptyState, Segmented, Badge, OutlineBtn } from '../../../../kit';
import { INK, INK_SOFT, INK_FAINT, LINE, LINE_SOFT, HEAD_BG, FONT_BODY, FONT_HEAD, FONT_MONO, SP, fmtRp, avatarToneFor } from '../../../../kit/tokens';
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

// Nama perusahaan jadi LINK ke detail (Account Code jadi teks biasa) --
// pola sama LeadCapturePage (kolom Account Code di sana link, tapi di sini
// Company Name yang dipakai sebagai pegangan klik, instruksi Den irisan
// berikutnya).
function CompanyLink({ row, onSelectAccount }) {
  if (!onSelectAccount) return row.name;
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onSelectAccount(row); }} style={{ color: INK, textDecoration: 'underline' }}>
      {row.name}
    </a>
  );
}

// Kolom aksi tab Leads/Free Agent -- SATU logika dipakai kedua tabel
// (irisan berikutnya, Task 2a):
//   pull_status null/rejected -- Request Pull (siapa pun) + Assign to
//     Sales (tambahan, hanya canApprove).
//   pull_status pending, canApprove -- Review (pindah ke tab Pull Approvals).
//   pull_status pending, !canApprove -- kosong (badge-nya sudah ada di
//     kolom Pull Status, tak perlu diulang di sini).
function PoolRowActions({ row, canApprove, onRequestPull, onAssign, onReview }) {
  if (row.pull_status === 'pending') {
    if (!canApprove) return null;
    return <OutlineBtn size="sm" onClick={() => onReview()}>Review</OutlineBtn>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <OutlineBtn size="sm" onClick={() => onRequestPull(row)}>Request Pull</OutlineBtn>
      {canApprove && <OutlineBtn size="sm" onClick={() => onAssign(row)}>Assign to Sales</OutlineBtn>}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT, fontFamily: FONT_BODY, whiteSpace: 'nowrap' };
const td = { padding: '12px', fontSize: 13, color: INK, fontFamily: FONT_BODY };

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
    let query = supabase
      .from('accounts')
      .select(`
        id, code, name, source, lifecycle_stage, estimated_value, company_id,
        lead_pool_reason, lead_pool_at, lead_pool_last_owner,
        pull_status, pull_requested_by, pull_requested_at, pull_justification,
        source_company:companies!prospects_owner_company_id_fkey(code, name)
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

  return (
    <div>
      <PageHeader title="Lead Assignment / Claim" />

      <div style={{ marginBottom: SP.s4 }}>
        <Segmented ariaLabel="Lead Assignment view" value={activeView} onChange={setView} options={tabs} />
      </div>

      {activeView === 'pool' && (
        <PoolTable
          rows={poolRows} loading={loading} profMap={profMap} canApprove={canApprove}
          codeLabel="Account Code" onSelectAccount={onSelectAccount}
          onRequestPull={(a) => setPullTarget(a)} onAssign={(a) => setAssignTarget(a)}
          onReview={() => setView('approvals')}
        />
      )}
      {activeView === 'fac' && (
        <FreeAgentTable
          rows={facRows} loading={loading} profMap={profMap} canApprove={canApprove}
          onSelectAccount={onSelectAccount}
          onRequestPull={(a) => setPullTarget(a)} onAssign={(a) => setAssignTarget(a)}
          onReview={() => setView('approvals')}
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
            showToast?.(`Pull request for "${a.name}" approved`, 'success');
            refetch();
          }}
        />
      )}

      {/* TD-318 Irisan 3: toast dinamis persis mockup submitPull/saveReject
          -- "by" (pengaju) utk Reject diresolve dari pull_requested_by yang
          SUDAH ter-select di query utama (lihat komentar header) lewat
          profMap yang SUDAH ada di scope ini, NOL query baru. */}
      <RequestPullModal open={!!pullTarget} onClose={() => setPullTarget(null)} account={pullTarget} showToast={showToast}
        onRequested={() => { setPullTarget(null); showToast?.(`Pull request for ${pullTarget?.code} sent for approval`); refetch(); }} />
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
      <ReassignModal open={!!assignTarget} onClose={() => setAssignTarget(null)} accounts={assignTarget ? [assignTarget] : []} showToast={showToast}
        onReassigned={(salesName) => {
          showToast?.(`${assignTarget?.code} assigned to ${salesName || 'sales'}`);
          setAssignTarget(null); refetch();
        }} />
    </div>
  );
}

function PoolTable({ rows, loading, profMap, canApprove, onSelectAccount, onRequestPull, onAssign, onReview }) {
  return (
    <Card padded={false}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title="No leads in the pool" sub="Leads released or swept into the pool will appear here." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                <th style={th}>Account Code</th>
                <th style={th}>Company Name</th>
                <th style={th}>Source</th>
                <th style={th}>Pool Reason</th>
                <th style={th}>Pooled On</th>
                <th style={th}>Last Owner</th>
                <th style={{ ...th, textAlign: 'right' }}>Estimated Value</th>
                <th style={th}>Pull Status</th>
                <th style={{ ...th, width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' }}>
                  <td style={{ ...td, fontFamily: FONT_MONO }}>{r.code || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}><CompanyLink row={r} onSelectAccount={onSelectAccount} /></td>
                  <td style={td}><Badge tone="neutral">{SOURCE_LABELS[r.source] || r.source || '—'}</Badge></td>
                  <td style={{ ...td, color: INK_SOFT }}>{r.lead_pool_reason || '—'}</td>
                  <td style={{ ...td, fontFamily: FONT_MONO, color: INK_SOFT }}>{fmtDate(r.lead_pool_at)}</td>
                  <td style={{ ...td, color: r.lead_pool_last_owner ? INK : INK_FAINT }}>{r.lead_pool_last_owner ? (profMap[r.lead_pool_last_owner] || '—') : 'None'}</td>
                  <td style={{ ...td, fontFamily: FONT_MONO, textAlign: 'right' }}>{r.estimated_value != null ? fmtRp(r.estimated_value) : '—'}</td>
                  <td style={td}><PullStatusBadge status={r.pull_status} /></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <PoolRowActions row={r} canApprove={canApprove} onRequestPull={onRequestPull} onAssign={onAssign} onReview={onReview} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FreeAgentTable({ rows, loading, profMap, canApprove, onSelectAccount, onRequestPull, onAssign, onReview }) {
  return (
    <Card padded={false}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title="No Free Agent customers" sub="Dormant customers released to the pool will appear here." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                <th style={th}>Customer Code</th>
                <th style={th}>Company Name</th>
                <th style={th}>Entity</th>
                <th style={th}>Last Owner</th>
                <th style={th}>Released On</th>
                <th style={th}>Last Invoice</th>
                <th style={{ ...th, textAlign: 'right' }}>Invoice Value Before Release</th>
                <th style={th}>Release Reason</th>
                <th style={th}>Pull Status</th>
                <th style={{ ...th, width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' }}>
                  <td style={{ ...td, fontFamily: FONT_MONO }}>{r.code || '—'}</td>
                  <td style={{ ...td, fontWeight: 600 }}><CompanyLink row={r} onSelectAccount={onSelectAccount} /></td>
                  <td style={td}><Badge tone="neutral">{r.source_company?.code || '—'}</Badge></td>
                  <td style={{ ...td, color: r.lead_pool_last_owner ? INK : INK_FAINT }}>{r.lead_pool_last_owner ? (profMap[r.lead_pool_last_owner] || '—') : 'None'}</td>
                  <td style={{ ...td, fontFamily: FONT_MONO, color: INK_SOFT }}>{fmtDate(r.lead_pool_at)}</td>
                  <td style={{ ...td, color: INK_FAINT }}>—</td>
                  <td style={{ ...td, color: INK_FAINT, textAlign: 'right' }}>—</td>
                  <td style={{ ...td, color: INK_SOFT }}>{r.lead_pool_reason || '—'}</td>
                  <td style={td}><PullStatusBadge status={r.pull_status} /></td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <PoolRowActions row={r} canApprove={canApprove} onRequestPull={onRequestPull} onAssign={onAssign} onReview={onReview} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ApprovalsTable({ rows, loading, profMap, profile, onSelectAccount, onApprove, onReject }) {
  return (
    <Card padded={false}>
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: INK_FAINT, fontFamily: FONT_BODY }}>Loading data…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon="inbox" title="No pull requests waiting for approval" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                <th style={th}>Account Code</th>
                <th style={th}>Type</th>
                <th style={th}>Company Name</th>
                <th style={th}>Requested By</th>
                <th style={th}>Requested On</th>
                <th style={th}>Reason</th>
                <th style={{ ...th, textAlign: 'right' }}>Estimated Value</th>
                <th style={{ ...th, width: 220 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const self = r.pull_requested_by === profile?.id;
                const requesterName = r.pull_requested_by ? (profMap[r.pull_requested_by] || '—') : '—';
                const tone = r.pull_requested_by ? avatarToneFor(r.pull_requested_by) : null;
                return (
                  <tr key={r.id} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${LINE_SOFT}` : 'none' }}>
                    <td style={{ ...td, fontFamily: FONT_MONO }}>{r.code || '—'}</td>
                    <td style={td}><Badge tone="neutral">{r.lifecycle_stage === 'free_agent' ? 'Customer' : 'Lead'}</Badge></td>
                    <td style={{ ...td, fontWeight: 600 }}><CompanyLink row={r} onSelectAccount={onSelectAccount} /></td>
                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {tone && (
                          <span style={{ width: 22, height: 22, borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_HEAD, flex: '0 0 22px' }}>
                            {requesterName !== '—' ? requesterName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?'}
                          </span>
                        )}
                        {requesterName}
                      </span>
                    </td>
                    <td style={{ ...td, fontFamily: FONT_MONO, color: INK_SOFT, whiteSpace: 'nowrap' }}>{fmtDate(r.pull_requested_at)}</td>
                    <td style={{ ...td, color: INK_SOFT, maxWidth: 280 }}>{r.pull_justification || '—'}</td>
                    <td style={{ ...td, fontFamily: FONT_MONO, textAlign: 'right' }}>{r.estimated_value != null ? fmtRp(r.estimated_value) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div title={self ? 'You cannot approve your own request' : undefined} style={{ display: 'inline-flex', gap: 8 }}>
                        <OutlineBtn size="sm" disabled={self} onClick={() => !self && onApprove(r)}>Approve</OutlineBtn>
                        <OutlineBtn size="sm" disabled={self} onClick={() => !self && onReject(r)}>Reject</OutlineBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
