// src/modules/crm/QuotationListPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, ChevronRight, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

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
  danger:    '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
};

const STATUS_META = {
  DRAFT:     { label: 'Draft',    bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  SENT:      { label: 'Sent',     bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  ACCEPTED:  { label: 'Accepted', bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  REJECTED:  { label: 'Rejected', bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
  SUBMITTED: { label: 'Submitted',bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
};

const SERVICE_TYPE_LABELS = {
  freight_forwarding: 'Freight',
  customs:            'Customs',
  trading:            'Trading',
};

const PAGE_SIZE = 20;

// SLA target hours per service_type (BD-05, SOP MSI)
const SLA_HOURS = { freight_forwarding: 6, customs: 8, trading: 8 };

const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

// SLA badge for the list row — On Time / Late / Pending / —
function SlaBadge({ q }) {
  const targetMs = (SLA_HOURS[q.service_type] || 6) * 3600000;
  const sentStatus = q.status === 'SENT' || q.status === 'ACCEPTED' || q.status === 'REJECTED';
  if (sentStatus && q.pricing_done_at && q.quote_sent_at) {
    const dur = new Date(q.quote_sent_at).getTime() - new Date(q.pricing_done_at).getTime();
    const onTime = dur <= targetMs;
    const m = onTime
      ? { label: '✓ On Time', bg: C.okBg, color: C.ok, bd: C.okBd }
      : { label: '✗ Late', bg: C.dangerBg, color: C.danger, bd: C.dangerBd };
    return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>{m.label}</span>;
  }
  if (q.status === 'SUBMITTED' && q.pricing_done_at) {
    return <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, border: '1px solid #E6CE94', background: '#F8ECCF', color: '#9A6B0E' }}>⏱ Pending</span>;
  }
  return <span style={{ color: C.inkFaint }}>—</span>;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.DRAFT;
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

export default function QuotationListPage({ onAddQuotation, onSelectQuotation, showToast }) {
  const { profile } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page,       setPage]       = useState(0);
  const [total,      setTotal]      = useState(0);

  const fetchQuotations = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from('quotations')
        .select(`
          id, quotation_no, service_type, route, status,
          valid_until, total_amount, created_at, pricing_done_at, quote_sent_at,
          prospect:accounts!quotations_prospect_id_fkey(name),
          customer:accounts!quotations_customer_id_fkey(name)
        `, { count: 'exact' })
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filterStatus !== 'all') query = query.eq('status', filterStatus);
      if (search.trim()) {
        query = query.or(
          `quotation_no.ilike.%${search.trim()}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setQuotations(data || []);
      setTotal(count || 0);
    } catch (err) {
      showToast?.('Gagal memuat quotation: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id, page, filterStatus, search, showToast]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);
  useEffect(() => { setPage(0); }, [filterStatus, search]);

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
            <Receipt size={20} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Quotation List</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>{total} quotation terdaftar</p>
          </div>
        </div>
        <button
          onClick={onAddQuotation}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(47,107,63,.25)',
          }}
        >
          <Plus size={16} /> Buat Quotation
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nomor quotation…"
            style={{
              width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`,
              background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13,
              color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">Semua Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
              {['Quotation No', 'Prospect / Customer', 'Service', 'Routing', 'Status', 'SLA', 'Valid Until', 'Grand Total', 'Created At', ''].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
            ) : quotations.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Belum ada quotation</td></tr>
            ) : quotations.map((q, i) => (
              <tr
                key={q.id}
                onClick={() => onSelectQuotation(q)}
                style={{
                  borderBottom: i < quotations.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
                  cursor: 'pointer', transition: 'background .12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: C.accent }}>{q.quotation_no || '—'}</td>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: C.ink }}>
                  {q.prospect?.name || q.customer?.name || '—'}
                </td>
                <td style={{ padding: '12px 14px', color: C.inkSoft, fontSize: 12.5 }}>
                  {SERVICE_TYPE_LABELS[q.service_type] || q.service_type || '—'}
                </td>
                <td style={{ padding: '12px 14px', color: C.inkSoft, fontSize: 12.5, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.route || '—'}
                </td>
                <td style={{ padding: '12px 14px' }}><StatusBadge status={q.status} /></td>
                <td style={{ padding: '12px 14px' }}><SlaBadge q={q} /></td>
                <td style={{ padding: '12px 14px', color: C.inkFaint, fontSize: 12.5 }}>{fmtDate(q.valid_until)}</td>
                <td style={{ padding: '12px 14px', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{rp(q.total_amount)}</td>
                <td style={{ padding: '12px 14px', color: C.inkFaint, fontSize: 12.5 }}>{fmtDate(q.created_at)}</td>
                <td style={{ padding: '12px 10px' }}><ChevronRight size={15} color={C.inkFaint} /></td>
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
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? C.inkFaint : C.ink, fontSize: 13 }}>
              ← Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? C.inkFaint : C.ink, fontSize: 13 }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
