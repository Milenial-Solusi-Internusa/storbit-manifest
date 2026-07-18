// src/modules/sales-order/SalesOrderDocListPage.jsx
// SO (Sales Order) list — dua varian via prop `variant`:
//   'crm'         → pintu Sales: ada tombol "Buat SO".
//   'procurement' → pintu Procurement: read-only, tanpa tombol buat.
// Scope visibilitas = RLS `sales_orders_select` apa adanya (jangan dilonggarkan).
import { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, ClipboardList, BadgeCheck } from 'lucide-react';
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
  navy:      '#144682',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  info:      '#2A5B8C', infoBg: '#E1ECF5', infoBd: '#BAD2E6',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
};

const STATUS_META = {
  DRAFT: { label: 'Draft', bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  SENT:  { label: 'Sent',  bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const m = STATUS_META[String(status).toUpperCase()] || STATUS_META.DRAFT;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px', border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

export default function SalesOrderDocListPage({ variant = 'crm', onCreate, onSelect, showToast }) {
  const { profile, erpRole } = useAuth();
  const isAllEntities = ['super_admin'].includes(erpRole);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Fetch inline (setState hanya di jalur async) — initial loading dari useState(true);
  // refetch saat filter/search berubah. cancelled-guard cegah race antar-fetch.
  useEffect(() => {
    if (!profile?.id) return undefined;
    if (!isAllEntities && !profile?.company_id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let query = supabase
          .from('sales_orders')
          .select(`
            id, so_no, status, signed, created_at,
            account:accounts!sales_orders_account_id_fkey(name),
            inquiry:inquiries!sales_orders_inquiry_id_fkey(inquiry_no)
          `)
          .is('deleted_at', null);
        // Entity scope (RLS enforces row-level; company filter mirrors it + trims payload).
        if (!isAllEntities) query = query.eq('company_id', profile.company_id);
        query = query.order('created_at', { ascending: false }).limit(200);
        if (filterStatus !== 'all') query = query.eq('status', filterStatus);
        if (search.trim()) query = query.ilike('so_no', `%${search.trim()}%`);
        const { data, error } = await query;
        if (cancelled) return;
        if (error) throw error;
        setRows(data || []);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        showToast?.('Gagal memuat SO: ' + err.message, 'error');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.company_id, isAllEntities, filterStatus, search, showToast]);

  const selStyle = { height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, padding: '0 10px', fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      <style>{`@media (max-width: 1023px) { .so-list-table { min-width: 760px; } }`}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={20} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Sales Order</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>
              {rows.length} SO{variant === 'procurement' ? ' diterima (read-only)' : ' terdaftar'}
            </p>
          </div>
        </div>
        {variant === 'crm' && (
          <button onClick={onCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(232,90,30,.25)' }}>
            <Plus size={16} /> Buat SO
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nomor SO…"
            style={{ width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">Semua Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="so-list-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['SO No', 'Tanggal', 'Customer', 'Inquiry Asal', 'Status', 'Sign', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Belum ada SO</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} onClick={() => onSelect(r)}
                  style={{ borderBottom: i < rows.length - 1 ? `1px solid ${C.lineSoft}` : 'none', cursor: 'pointer', transition: 'background .12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, color: C.navy }}>{r.so_no || '—'}</td>
                  <td style={{ padding: '12px 14px', color: C.inkFaint, fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: C.ink }}>{r.account?.name || '—'}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: C.inkSoft }}>{r.inquiry?.inquiry_no || '—'}</td>
                  <td style={{ padding: '12px 14px' }}><StatusBadge status={r.status} /></td>
                  <td style={{ padding: '12px 14px' }}>
                    {r.signed
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.navy, fontSize: 12, fontWeight: 700 }}><BadgeCheck size={15} />Signed</span>
                      : <span style={{ color: C.inkFaint }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 10px' }}><ChevronRight size={15} color={C.inkFaint} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
