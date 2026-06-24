// src/modules/crm/LeadPoolPage.jsx
// Lead Pool — archived leads (accounts.account_status = 'lead_pool') waiting to be
// re-worked. List/table view (data is large, 500+). Visibility is enforced by RLS
// (sales see their assigned leads, managers see their entity, super sees all) — so
// we do NOT add a per-user filter here.
//
// Primary action: "Tarik ke Pipeline" → flips account_status to 'prospect' and stamps
// last_activity_at, moving the lead into the active Pipeline. RLS UPDATE already allows
// the owning sales (assigned_to = self) + managers/super.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Archive, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import ConfirmModal from '../../components/ConfirmModal';

// Warm-beige token palette — shared visual language with the other CRM list pages.
const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  navy:      '#144682',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
};

const CUSTOMER_TYPE_LABELS = { freight: 'Freight', customs: 'Customs', trading: 'Trading', mixed: 'Mixed' };
const CUSTOMER_TYPE_META = {
  freight: { bg: '#E1ECF7', color: '#2563EB', bd: '#BBD3EE' },
  customs: { bg: '#FBE6DA', color: '#C8521B', bd: '#F0C3A8' },
  trading: { bg: '#DEF0E4', color: '#1F8B4D', bd: '#BFE0CC' },
  mixed:   { bg: '#EEE9DC', color: '#6B6F5E', bd: '#DDD3BE' },
};

// 11 source values — kept in sync with ProspectFormPage / PipelineKanbanPage.
const SOURCE_LABELS = {
  sales_visit: 'Sales Visit', cold_call: 'Cold Call', referral: 'Referral',
  existing_network: 'Existing Network', exhibition: 'Exhibition', instagram: 'Instagram',
  linkedin: 'LinkedIn', tiktok: 'TikTok', website: 'Website', walk_in: 'Walk-in', other: 'Lainnya',
};

const PAGE_SIZE = 25;

function TypeBadge({ type }) {
  if (!type) return <span style={{ color: '#D1D5DB' }}>—</span>;
  const meta = CUSTOMER_TYPE_META[type] || CUSTOMER_TYPE_META.mixed;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99,
      fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px',
      border: `1px solid ${meta.bd}`, background: meta.bg, color: meta.color,
    }}>
      {CUSTOMER_TYPE_LABELS[type] || type}
    </span>
  );
}

function SourceBadge({ source }) {
  if (!source) return <span style={{ color: '#D1D5DB' }}>—</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99,
      fontSize: 11.5, fontWeight: 600,
      border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft,
    }}>
      {SOURCE_LABELS[source] || source}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ flex: '1 1 200px', background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 6px rgba(35,41,30,.05)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</div>
    </div>
  );
}

export default function LeadPoolPage({ showToast }) {
  const { profile, erpRole, user } = useAuth();
  const myId = profile?.id || null;
  // Visibility scope by role (mirrors RLS on `accounts` + ProspectListPage):
  //  • super_admin        → all entities (no company filter)
  //  • sales / operations → only leads assigned to / created by them
  //  • everyone else (admin, manager, ceo, gm, …) → their own entity
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [typeFilter, setTypeFilter]      = useState('');
  const [page, setPage] = useState(0);

  const [confirmLead, setConfirmLead] = useState(null); // lead pending "Tarik ke Pipeline"
  const [pullingId, setPullingId]     = useState(null);

  // Debounce search input (min 300ms) before it drives filtering.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch lead_pool accounts. Frontend belt (mirrors ProspectListPage) on top of
  // RLS: company-scoped for all but super_admin; sales see only their own leads.
  useEffect(() => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    let cancelled = false;
    setLoading(true);
    let query = supabase
      .from('accounts')
      .select('*, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)')
      .eq('account_status', 'lead_pool');

    // Role-aware scope (see flags above)
    if (!isAllEntities) query = query.eq('company_id', profile.company_id);
    if (isSalesOnly)    query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);

    query
      .order('name')
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          showToast?.('Gagal memuat lead pool: ' + error.message, 'error');
          setRows([]);
        } else {
          setRows(data || []);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, showToast]);

  // Reset to first page whenever filters change.
  useEffect(() => { setPage(0); }, [search, sourceFilter, typeFilter]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (typeFilter && r.customer_type !== typeFilter) return false;
      if (search) {
        const hay = [r.name, r.pic_name, r.city, r.phone].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }, [rows, search, sourceFilter, typeFilter]);

  const myCount = useMemo(() => rows.filter(r => myId && r.assigned_to === myId).length, [rows, myId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const handlePull = useCallback(async () => {
    const lead = confirmLead;
    if (!lead) return;
    setConfirmLead(null);
    setPullingId(lead.id);
    const { error } = await supabase
      .from('accounts')
      .update({ account_status: 'prospect', last_activity_at: new Date().toISOString() })
      .eq('id', lead.id);
    setPullingId(null);
    if (error) {
      showToast?.('Gagal menarik lead: ' + error.message, 'error');
      return;
    }
    logAudit(supabase, {
      action: ACTION_TYPES.CONVERT_LEAD,
      entityType: ENTITY_TYPES.LEAD,
      entityId: lead.id,
      entityLabel: lead.name,
      notes: 'lead_pool → prospect',
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    // Lead leaves the pool → drop it from the local list immediately.
    setRows(prev => prev.filter(r => r.id !== lead.id));
    showToast?.(`"${lead.name}" ditarik ke pipeline`, 'success');
  }, [confirmLead, showToast, profile, erpRole, user]);

  const resetFilters = () => { setSearchInput(''); setSourceFilter(''); setTypeFilter(''); };
  const hasFilters = search || sourceFilter || typeFilter;

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Archive size={22} style={{ color: C.accent }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 24, fontWeight: 800, color: C.navy, margin: 0, letterSpacing: '-.4px' }}>Lead Pool</h1>
          <p style={{ fontSize: 13.5, color: C.inkSoft, margin: '4px 0 0' }}>
            Arsip lead untuk digarap ulang · {loading ? '…' : `${rows.length} lead`}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard label="Total Lead Pool" value={loading ? '…' : rows.length} accent={C.navy} />
        <StatCard label="Lead Saya" value={loading ? '…' : myCount} accent={C.accent} />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Cari nama, PIC, kota, telepon…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, fontSize: 13.5, color: C.ink, outline: 'none' }}
          />
        </div>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={selStyle}>
          <option value="">Semua Source</option>
          {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle}>
          <option value="">Semua Type</option>
          {Object.entries(CUSTOMER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {hasFilters && (
          <button onClick={resetFilters} style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.inkFaint }}>
          {loading ? '' : `Menampilkan ${filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} dari ${filtered.length}`}
        </span>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['Nama Perusahaan', 'PIC', 'Telepon', 'Kota', 'Type', 'Source', 'Assigned To', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 7 ? 'right' : 'left', padding: '11px 14px', fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center', color: C.inkFaint }}>
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} /> &nbsp;Memuat lead…
                </td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center', color: C.inkFaint }}>
                  {hasFilters ? 'Tidak ada lead yang cocok dengan filter.' : 'Belum ada lead di pool.'}
                </td></tr>
              ) : pageRows.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: C.ink }}>{r.name || '—'}</td>
                  <td style={{ padding: '10px 14px', color: C.inkSoft }}>{r.pic_name || '—'}</td>
                  <td style={{ padding: '10px 14px', color: C.inkSoft, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5 }}>{r.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', color: C.inkSoft }}>{r.city || '—'}</td>
                  <td style={{ padding: '10px 14px' }}><TypeBadge type={r.customer_type} /></td>
                  <td style={{ padding: '10px 14px' }}><SourceBadge source={r.source} /></td>
                  <td style={{ padding: '10px 14px', color: C.inkSoft }}>{r.assigned_profile?.full_name || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setConfirmLead(r)}
                      disabled={pullingId === r.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 9, border: 'none',
                        background: C.navy, color: 'white', fontSize: 12.5, fontWeight: 600,
                        cursor: pullingId === r.id ? 'wait' : 'pointer', opacity: pullingId === r.id ? 0.6 : 1,
                      }}
                    >
                      {pullingId === r.id
                        ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        : <ArrowRight size={13} />}
                      Tarik ke Pipeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: `1px solid ${C.line}` }}>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={pgBtn(page === 0)}>‹ Prev</button>
            <span style={{ fontSize: 12.5, color: C.inkSoft }}>Hal {page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={pgBtn(page >= totalPages - 1)}>Next ›</button>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmLead}
        title="Tarik ke Pipeline"
        message={confirmLead ? `Tarik "${confirmLead.name}" ke pipeline aktif? Lead akan pindah dari Lead Pool ke Pipeline (status prospect).` : ''}
        confirmLabel="Ya, Tarik"
        cancelLabel="Batal"
        variant="info"
        onConfirm={handlePull}
        onCancel={() => setConfirmLead(null)}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const selStyle = {
  padding: '9px 12px', borderRadius: 10, border: '1px solid #E7DCC8',
  background: '#FFFDF8', fontSize: 13.5, color: '#23291E', cursor: 'pointer', outline: 'none',
};
function pgBtn(disabled) {
  return {
    padding: '6px 12px', borderRadius: 8, border: '1px solid #E7DCC8',
    background: disabled ? '#F0E7D6' : '#FFFDF8', color: disabled ? '#B8AE99' : '#5E6553',
    fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
  };
}
