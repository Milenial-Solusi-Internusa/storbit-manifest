// src/modules/crm/ProspectListPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, ChevronRight, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ConfirmModal from '../../components/ConfirmModal';

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  warn:      '#9A6B0E', warnBg: '#F8ECCF', warnBd: '#E6CE94',
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
  purple:    '#6E4B8C', purpleBg: '#ECE3F4', purpleBd: '#D6C6E4',
  teal:      '#1F6B6B', tealBg: '#DCEBEA', tealBd: '#B2D4D3',
  orange:    '#A45A22', orangeBg: '#F6E8D6', orangeBd: '#E7CDA9',
};

const STAGE_META = {
  NEW:         { label: 'New',         bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  CONTACTED:   { label: 'Contacted',   bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  QUALIFIED:   { label: 'Qualified',   bg: C.tealBg,    color: C.teal,    bd: C.tealBd    },
  PROPOSAL:    { label: 'Proposal',    bg: C.warnBg,    color: C.warn,    bd: C.warnBd    },
  NEGOTIATION: { label: 'Negotiation', bg: C.orangeBg,  color: C.orange,  bd: C.orangeBd  },
  WON:         { label: 'Won',         bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  LOST:        { label: 'Lost',        bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
  NURTURE:     { label: 'Nurture',     bg: C.purpleBg,  color: C.purple,  bd: C.purpleBd  },
};

const SOURCE_LABELS = {
  digital_marketing: 'Digital Marketing',
  sales_visit:       'Sales Visit',
  referral:          'Referral',
  event:             'Event',
};

const PAGE_SIZE = 20;

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StageBadge({ stage }) {
  const m = STAGE_META[stage] || STAGE_META.NEW;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      letterSpacing: '.3px', border: `1px solid ${m.bd}`,
      background: m.bg, color: m.color,
    }}>
      {m.label}
    </span>
  );
}

function SourceBadge({ source }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: C.surface2, color: C.inkSoft, border: `1px solid ${C.line}`,
    }}>
      {SOURCE_LABELS[source] || source || '—'}
    </span>
  );
}

export default function ProspectListPage({ onAddProspect, onEditProspect, showToast }) {
  const { profile, erpRole } = useAuth();
  const canDelete = ['super_admin', 'admin', 'ceo', 'gm', 'manager'].includes(erpRole);
  // Visibility scope by role (mirrors RLS on `accounts` + CRMDashboard):
  //  • super_admin / admin → all entities (no company filter)
  //  • sales / operations  → only prospects assigned to / created by them
  //  • everyone else (manager, ceo, gm, …) → their own entity
  const isAllEntities = ['super_admin'].includes(erpRole);
  const isSalesOnly   = ['sales', 'operations'].includes(erpRole);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false, onConfirm: null }));
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchProspects = useCallback(async () => {
    if (!profile?.id) return;
    if (!isAllEntities && !profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('accounts')
        .select(`
          id, name, legal_name, customer_type, source,
          pic_name, pipeline_stage, created_at,
          assigned_profile:profiles!prospects_assigned_to_fkey(full_name)
        `, { count: 'exact' })
        .eq('account_status', 'prospect')
        .is('deleted_at', null);

      // Role-aware scope (see flags above)
      if (!isAllEntities) query = query.eq('company_id', profile.company_id);
      if (isSalesOnly)    query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`);

      query = query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStage !== 'all') query = query.eq('pipeline_stage', filterStage);
      if (filterSource !== 'all') query = query.eq('source', filterSource);
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      setProspects(data || []);
      setTotal(count || 0);
    } catch (err) {
      showToast?.('Gagal memuat prospect: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id, isAllEntities, isSalesOnly, page, filterStage, filterSource, search, showToast]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  const handleDelete = useCallback((prospect) => {
    showConfirm(
      'Hapus Prospect',
      `Hapus prospect "${prospect.name}"? Tindakan ini tidak dapat dibatalkan.`,
      async () => {
        closeConfirm();
        try {
          const { error } = await supabase
            .from('accounts')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', prospect.id);
          if (error) throw error;
          showToast?.('Prospect berhasil dihapus.', 'success');
          fetchProspects();
        } catch (err) {
          showToast?.('Gagal hapus prospect: ' + err.message, 'error');
        }
      }
    );
  }, [fetchProspects, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset page on filter/search change
  useEffect(() => { setPage(0); }, [filterStage, filterSource, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const selStyle = {
    height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.surface, padding: '0 10px', fontSize: 13, color: C.ink,
    outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={20} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>Customer Prospect</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>{total} prospect terdaftar</p>
          </div>
        </div>
        <button
          onClick={onAddProspect}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(47,107,63,.25)',
          }}
        >
          <Plus size={16} /> Tambah Prospect
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama perusahaan…"
            style={{
              width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
              background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13,
              color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={selStyle}>
          <option value="all">Semua Stage</option>
          {Object.entries(STAGE_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selStyle}>
          <option value="all">Semua Source</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
              {['Nama Perusahaan', 'PIC', 'Source', 'Pipeline Stage', 'Assigned To', 'Created At', ''].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
            ) : prospects.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Belum ada prospect</td></tr>
            ) : prospects.map((p, i) => (
              <tr
                key={p.id}
                onClick={() => onEditProspect(p)}
                style={{
                  borderBottom: i < prospects.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
                  cursor: 'pointer', transition: 'background .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '12px 14px', fontWeight: 700, color: C.ink }}>{p.name || '—'}</td>
                <td style={{ padding: '12px 14px', color: C.inkSoft }}>{p.pic_name || '—'}</td>
                <td style={{ padding: '12px 14px' }}><SourceBadge source={p.source} /></td>
                <td style={{ padding: '12px 14px' }}><StageBadge stage={p.pipeline_stage} /></td>
                <td style={{ padding: '12px 14px' }}>
                  {p.assigned_profile?.full_name
                    ? <span style={{ color: C.inkSoft }}>{p.assigned_profile.full_name}</span>
                    : <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: C.accentSoft, color: C.accent }}>Belum di-assign</span>}
                </td>
                <td style={{ padding: '12px 14px', color: C.inkFaint, fontSize: 12.5 }}>{fmtDate(p.created_at)}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {canDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Hapus
                      </button>
                    )}
                    <ChevronRight size={15} color={C.inkFaint} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: C.inkSoft }}>
          <span>Halaman {page + 1} dari {totalPages} ({total} total)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? C.inkFaint : C.ink, fontSize: 13 }}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? C.inkFaint : C.ink, fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
