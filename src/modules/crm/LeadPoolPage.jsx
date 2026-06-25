// src/modules/crm/LeadPoolPage.jsx
// Lead Pool — prospect yang ter-aging masuk pool otomatis (Edge Function
// `aging-pipeline`, kolom accounts.is_in_lead_pool=true). Sales bisa request
// "Tarik ke Pipeline" dengan justifikasi → pull_status='pending' → menunggu
// approval manager (LeadPoolApprovalPage). Visibility per-sales via RLS.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Archive, ArrowRight, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

const C = {
  bg: '#F6EFE3', surface: '#FFFDF8', surface2: '#FBF6EC',
  ink: '#23291E', inkSoft: '#5E6553', inkFaint: '#8A8E7C',
  line: '#E7DCC8', lineSoft: '#F0E7D6', navy: '#144682',
  accent: '#E85A1E', accentSoft: '#FEF2EC',
};

// Stage label + previous-stage mapping (untuk target tarik ke pipeline).
const STAGE_LABEL = { NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', PROPOSAL: 'Proposal', NEGOTIATION: 'Negotiation', WON: 'Won', LOST: 'Lost' };
const PREV_STAGE = { CONTACTED: 'NEW', QUALIFIED: 'CONTACTED', PROPOSAL: 'QUALIFIED', NEGOTIATION: 'PROPOSAL' };
const prevStageOf = (s) => PREV_STAGE[String(s || '').toUpperCase()] || 'NEW';

// pull_status badge palette
const PULL_BADGE = {
  pending:  { bg: '#FBF0DD', fg: '#B45309', bd: '#E6CE94', label: 'Menunggu Approval' },
  approved: { bg: '#DEF0E4', fg: '#1F8B4D', bd: '#BFE0CC', label: 'Disetujui' },
  rejected: { bg: '#FBE3E3', fg: '#C0392B', bd: '#ECC2BA', label: 'Ditolak' },
};
function PullBadge({ status }) {
  if (!status) return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkFaint }}>Belum request</span>;
  const m = PULL_BADGE[status] || PULL_BADGE.pending;
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, border: `1px solid ${m.bd}`, background: m.bg, color: m.fg }}>{m.label}</span>;
}

const PAGE_SIZE = 25;
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`;
};

/* ---------- Pull request modal ---------- */
function PullModal({ account, onClose, onSubmit }) {
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  if (!account) return null;
  const target = STAGE_LABEL[prevStageOf(account.pipeline_stage)] || 'New';
  const valid = justification.trim().length >= 20;
  const labelStyle = { fontSize: 11.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, display: 'block' };

  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(19,35,59,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(500px, 100%)', boxShadow: '0 24px 64px rgba(19,35,59,0.28)', overflow: 'hidden' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: C.surface2 }}>
          <ArrowRight size={18} color={C.navy} />
          <h3 style={{ margin: 0, fontFamily: "'Montserrat',sans-serif", fontSize: 16, fontWeight: 700, color: C.ink, flex: 1 }}>Tarik ke Pipeline</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', padding: 4 }}><X size={18} /></button>
        </header>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><span style={labelStyle}>Prospect</span><div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{account.name}</div></div>
            <div><span style={labelStyle}>Stage Tujuan</span><div style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{target}</div></div>
          </div>
          <div>
            <span style={labelStyle}>Justifikasi <span style={{ color: C.accent }}>*</span></span>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={4}
              placeholder="Jelaskan alasan menarik prospect ini kembali ke pipeline (min 20 karakter)…"
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13.5, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', outline: 'none', resize: 'vertical' }}
            />
            <div style={{ fontSize: 11.5, color: valid ? C.inkFaint : C.accent, marginTop: 4 }}>{justification.trim().length}/20 karakter minimum</div>
          </div>
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: `1px solid ${C.line}`, background: C.surface2 }}>
          <button onClick={onClose} disabled={saving} style={{ height: 40, padding: '0 16px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.inkSoft, fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
          <button
            onClick={async () => { setSaving(true); const ok = await onSubmit(account, justification.trim()); setSaving(false); if (ok) onClose(); }}
            disabled={!valid || saving}
            style={{ height: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: (!valid || saving) ? '#C9BBA0' : C.accent, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13, fontWeight: 700, cursor: (!valid || saving) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={15} />}Kirim Request
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function LeadPoolPage({ showToast }) {
  const { profile, erpRole, user } = useAuth();
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly = ['sales', 'operations'].includes(erpRole);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pullTarget, setPullTarget] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    setLoading(true);
    let query = supabase
      .from('accounts')
      .select('id, name, pipeline_stage, lead_pool_reason, lead_pool_at, pull_status, pull_justification, assigned_to, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)')
      .eq('is_in_lead_pool', true)
      .is('deleted_at', null);
    if (!isAllEntities) query = query.eq('company_id', profile.company_id);
    if (isSalesOnly) query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);

    query.order('lead_pool_at', { ascending: false }).limit(1000).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { showToast?.('Gagal memuat lead pool: ' + error.message, 'error'); setRows([]); }
      else setRows(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, showToast, reloadKey]);

  useEffect(() => { setPage(0); }, [search]);

  const filtered = useMemo(() => rows.filter(r => {
    if (!search) return true;
    return [r.name, r.assigned_profile?.full_name].filter(Boolean).join(' ').toLowerCase().includes(search);
  }), [rows, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Notify manager/supervisor (via user_roles — profiles.role dormant). Best-effort.
  const notifyManagers = useCallback(async (account, justification) => {
    try {
      const { data: roleRows } = await supabase.from('roles').select('id').eq('company_id', profile.company_id).in('code', ['manager', 'supervisor']);
      const roleIds = (roleRows || []).map(r => r.id);
      if (!roleIds.length) return;
      const { data: urs } = await supabase.from('user_roles').select('user_id').eq('company_id', profile.company_id).in('role_id', roleIds).eq('is_active', true).is('revoked_at', null);
      const userIds = [...new Set((urs || []).map(u => u.user_id).filter(Boolean))];
      if (!userIds.length) return;
      const salesName = profile?.full_name || user?.email || 'Sales';
      const notifRows = userIds.map(uid => ({
        company_id: profile.company_id,
        user_id: uid,
        event_type: 'lead_pool_pull_request',
        title: 'Request Tarik Prospect dari Lead Pool',
        body: `${salesName} request tarik ${account.name} dari Lead Pool. Justifikasi: ${justification.slice(0, 50)}`,
        reference_type: 'lead_pool',
        reference_id: account.id,
      }));
      await supabase.from('notifications').insert(notifRows);
    } catch (e) {
      console.error('[lead-pool] notify managers failed:', e?.message || e);
    }
  }, [profile, user]);

  const submitPull = useCallback(async (account, justification) => {
    const { error } = await supabase.from('accounts').update({
      pull_justification: justification,
      pull_requested_at: new Date().toISOString(),
      pull_status: 'pending',
    }).eq('id', account.id);
    if (error) { showToast?.('Gagal mengirim request: ' + error.message, 'error'); return false; }
    await notifyManagers(account, justification);
    showToast?.(`Request tarik "${account.name}" dikirim ke manager`, 'success');
    refetch();
    return true;
  }, [showToast, notifyManagers, refetch]);

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Archive size={22} style={{ color: C.accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 24, fontWeight: 800, color: C.navy, margin: 0, letterSpacing: '-.4px' }}>Lead Pool</h1>
          <p style={{ fontSize: 13.5, color: C.inkSoft, margin: '4px 0 0' }}>Prospect ter-aging menunggu di-tarik kembali · {loading ? '…' : `${rows.length} prospect`}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Cari nama prospect / sales…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, fontSize: 13.5, color: C.ink, outline: 'none' }} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.inkFaint }}>
          {loading ? '' : `Menampilkan ${filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} dari ${filtered.length}`}
        </span>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['Nama Prospect', 'Stage Terakhir', 'Alasan', 'Tanggal Masuk Pool', 'Sales', 'Status Pull', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 6 ? 'right' : 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '48px 14px', textAlign: 'center', color: C.inkFaint }}>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} /> &nbsp;Memuat lead pool…
                </td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px 14px', textAlign: 'center', color: C.inkFaint }}>
                  {search ? 'Tidak ada prospect yang cocok.' : 'Belum ada prospect di lead pool.'}
                </td></tr>
              ) : pageRows.map(r => {
                const canPull = !r.pull_status || r.pull_status === 'rejected';
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: C.ink }}>{r.name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft }}>{STAGE_LABEL[String(r.pipeline_stage || '').toUpperCase()] || r.pipeline_stage || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft, maxWidth: 240 }}>{r.lead_pool_reason || '—'}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{fmtDate(r.lead_pool_at)}</td>
                    <td style={{ padding: '10px 14px', color: C.inkSoft }}>{r.assigned_profile?.full_name || '—'}</td>
                    <td style={{ padding: '10px 14px' }}><PullBadge status={r.pull_status} /></td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.pull_status === 'pending' ? (
                        <span style={{ fontSize: 12, color: C.inkFaint, fontStyle: 'italic' }}>Menunggu Approval</span>
                      ) : canPull ? (
                        <button onClick={() => setPullTarget(r)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: 'none', background: C.navy, color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                          <ArrowRight size={13} />Tarik ke Pipeline
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: C.inkFaint }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: `1px solid ${C.line}` }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={pgBtn(page === 0)}>‹ Prev</button>
            <span style={{ fontSize: 12.5, color: C.inkSoft }}>Hal {page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={pgBtn(page >= totalPages - 1)}>Next ›</button>
          </div>
        )}
      </div>

      <PullModal account={pullTarget} onClose={() => setPullTarget(null)} onSubmit={submitPull} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function pgBtn(disabled) {
  return {
    padding: '6px 12px', borderRadius: 8, border: '1px solid #E7DCC8',
    background: disabled ? '#F0E7D6' : '#FFFDF8', color: disabled ? '#B8AE99' : '#5E6553',
    fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
  };
}
