// src/modules/inventory/pages/StokBarangPage.jsx
// Stok Barang — Inventory stock monitoring page for Nexus by MSI
// Fetches from stock_summary (joined products + warehouses) for SOA company.
// Rows grouped by product_id: qty_semper + qty_others per product.
//
// Design reference: /tmp/nexus-by-msi/project/StokBarangPage.jsx (Claude Design handoff)
// Adapted: real Supabase fetch, inline styles, Nexus patterns.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

/* ── brand tokens ──────────────────────────────────────────────────────────── */
const NAVY   = '#144682';
const ORANGE = '#E85A1E';

/* ── inline icon paths ─────────────────────────────────────────────────────── */
const ICONS = {
  search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  chevdown:  '<path d="m6 9 6 6 6-6"/>',
  plus:      '<path d="M5 12h14"/><path d="M12 5v14"/>',
  package:   '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  boxes:     '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/>',
  mappin:    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  refresh:   '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  inbox:     '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  info:      '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alertcircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
};

function Icon({ name, size = 18, color, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color || 'currentColor'} strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.info }}
    />
  );
}

/* ── constants ─────────────────────────────────────────────────────────────── */
const WAREHOUSES = [
  { id: 'all',    label: 'Semua Gudang' },
  { id: 'semper', label: 'Gudang Semper' },
  { id: 'others', label: 'Gudang Others' },
];

const STATUS_META = {
  Match:   { label: 'Match',   pill: { background: '#EAF0F8', color: '#144682' }, rowBg: '#FFFFFF' },
  Surplus: { label: 'Surplus', pill: { background: '#DEF0E4', color: '#1F8B4D' }, rowBg: '#F0FDF4' },
  Deficit: { label: 'Deficit', pill: { background: '#FEE2E2', color: '#DC2626' }, rowBg: '#FEF2F2' },
};

/* ── style tokens (matches design spec exactly) ────────────────────────────── */
const S = {
  root:       { fontFamily: "'Inter', system-ui, sans-serif", background: '#F7F7F8', minHeight: '100%', padding: '26px 28px 48px', boxSizing: 'border-box', color: '#3A3A3F' },
  wrap:       { maxWidth: 1340, margin: '0 auto' },

  /* header */
  topRow:     { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 22, flexWrap: 'wrap' },
  title:      { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: -0.4, color: '#16243A', margin: 0 },
  sub:        { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#7A828E', marginTop: 6 },
  syncDot:    { width: 6, height: 6, borderRadius: '50%', background: '#1F8B4D', flex: '0 0 6px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 17px', borderRadius: 11, border: '1px solid ' + NAVY, background: NAVY, color: '#fff', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(20,70,130,.22), 0 6px 16px rgba(20,70,130,.14)', transition: 'filter .15s ease, transform .15s ease' },

  /* KPI cards */
  kpiRow:     { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 20 },
  kpiCard:    { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, padding: '17px 18px', boxShadow: '0 1px 2px rgba(20,40,70,.04)' },
  kpiTop:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  kpiIco:     { width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 40px' },
  kpiVal:     { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 30, fontWeight: 800, color: '#16243A', letterSpacing: -1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  kpiLbl:     { fontSize: 12, fontWeight: 600, color: '#7A828E', marginTop: 8, letterSpacing: 0.1 },

  /* filter bar */
  filterCard: { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, padding: 12, marginBottom: 14, boxShadow: '0 1px 2px rgba(20,40,70,.04)' },
  filterRow:  { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchWrap: { position: 'relative', flex: '1 1 280px', minWidth: 220 },
  searchIco:  { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' },
  searchInput:{ width: '100%', height: 40, borderRadius: 10, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 14px 0 40px', fontFamily: 'inherit', fontSize: 13.5, color: '#3A3A3F', boxSizing: 'border-box', outline: 'none' },
  selectWrap: { position: 'relative', flex: '0 0 auto' },
  select:     { height: 40, borderRadius: 10, border: '1px solid #E3E5EA', background: '#FCFCFD', padding: '0 36px 0 14px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#16243A', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', outline: 'none' },
  selectIco:  { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA0AC', pointerEvents: 'none' },
  ghostBtn:   { display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #E3E5EA', background: '#fff', color: '#5A626E', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },

  /* count / error */
  countLine:  { fontSize: 12.5, color: '#7A828E', margin: '0 2px 14px', fontWeight: 500 },
  countStrong:{ color: NAVY, fontWeight: 700 },
  errorBar:   { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, marginBottom: 14 },

  /* table */
  tableCard:  { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,40,70,.04)' },
  tableScroll:{ overflowX: 'auto' },
  table:      { width: '100%', borderCollapse: 'collapse', minWidth: 980 },
  th:         { fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: '#9AA0AC', background: '#FAFBFC', borderBottom: '1px solid #F0F1F4', padding: '11px 16px', textAlign: 'left', whiteSpace: 'nowrap' },
  thNum:      { textAlign: 'right' },
  td:         { padding: '12px 16px', borderBottom: '1px solid #F4F5F7', fontSize: 12.5, verticalAlign: 'middle', whiteSpace: 'nowrap' },

  /* cell styles */
  skuCell:    { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, fontSize: 12, color: NAVY, letterSpacing: 0.1 },
  nameCell:   { fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600, fontSize: 13, color: '#16243A', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  groupPill:  { display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F0F2F5', padding: '3px 8px', borderRadius: 6, letterSpacing: 0.2, whiteSpace: 'nowrap' },
  classPill:  { display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 600, color: NAVY, background: '#EAF0F8', padding: '3px 8px', borderRadius: 6, letterSpacing: 0.2, whiteSpace: 'nowrap' },
  qtyCell:    { fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontWeight: 600, fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  uomCell:    { fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: '#9AA0AC' },
  statusPill: { display: 'inline-flex', alignItems: 'center', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' },
  lastCell:   { fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, color: '#9AA0AC' },

  /* empty / loading */
  empty:      { background: '#fff', border: '1px solid #ECEDF1', borderRadius: 14, padding: '64px 28px', textAlign: 'center', boxShadow: '0 1px 2px rgba(20,40,70,.04)' },
  emptyIco:   { color: '#D9D9DC', display: 'inline-flex', marginBottom: 18 },
  emptyTitle: { fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 16, fontWeight: 700, color: '#3A3A3F' },
  emptySub:   { fontSize: 13, color: '#9AA0AC', marginTop: 8, lineHeight: 1.5 },
  outlineBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid ' + NAVY, background: '#fff', color: NAVY, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 22 },

  /* skeleton */
  skelRow:    { height: 52, borderBottom: '1px solid #F4F5F7', background: 'linear-gradient(90deg, #F2F4F7 25%, #E8EBF0 50%, #F2F4F7 75%)', backgroundSize: '400% 100%', animation: 'sb-shimmer 1.4s ease infinite' },
};

/* ── number formatter ──────────────────────────────────────────────────────── */
const nf = (n) => (n ?? 0).toLocaleString('id-ID');

/* ── date helpers ──────────────────────────────────────────────────────────── */
function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
// Convert ISO date (YYYY-MM-DD or full ISO string) → DD/MM/YYYY
function fmtDate(iso) {
  if (!iso) return todayLabel();
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

/* ── KPI card ──────────────────────────────────────────────────────────────── */
function KpiCard({ icon, value, label, accent }) {
  const tint = accent === 'orange'
    ? { bg: '#FBE6DA', fg: '#C8521B' }
    : { bg: '#EAF0F8', fg: NAVY };
  return (
    <div style={S.kpiCard}>
      <div style={S.kpiTop}>
        <span style={{ ...S.kpiIco, background: tint.bg, color: tint.fg }}>
          <Icon name={icon} size={21}/>
        </span>
      </div>
      <div style={S.kpiVal}>{value}</div>
      <div style={S.kpiLbl}>{label}</div>
    </div>
  );
}

/* ── table row ─────────────────────────────────────────────────────────────── */
function StockRow({ r, showSemper, showOthers }) {
  const [hover, setHover] = useState(false);
  const total  = (r.qty_semper ?? 0) + (r.qty_others ?? 0);
  const isZero = total === 0;
  const st     = STATUS_META[r.status] || STATUS_META.Match;
  const dim    = isZero ? '#9AA0AC' : null;

  let bg = st.rowBg;
  if (isZero) bg = '#F9FAFB';
  if (hover && !isZero) bg = '#F8FAFC';

  return (
    <tr onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: bg, transition: 'background .12s ease' }}>
      <td style={S.td}><span style={{ ...S.skuCell, color: dim || NAVY }}>{r.sku}</span></td>
      <td style={S.td}><div style={{ ...S.nameCell, color: dim || '#16243A' }} title={r.name}>{r.name}</div></td>
      <td style={S.td}><span style={S.groupPill}>{r.group || '–'}</span></td>
      <td style={S.td}><span style={S.classPill}>{r.cls || '–'}</span></td>
      {showSemper && <td style={{ ...S.td, ...S.qtyCell, color: dim || '#16243A' }}>{nf(r.qty_semper)}</td>}
      {showOthers && <td style={{ ...S.td, ...S.qtyCell, color: dim || (r.qty_others > 0 ? '#C8521B' : '#16243A') }}>{nf(r.qty_others)}</td>}
      <td style={{ ...S.td, ...S.qtyCell, color: dim || NAVY, fontWeight: 700 }}>{nf(total)}</td>
      <td style={{ ...S.td, ...S.uomCell, color: dim || '#9AA0AC' }}>{r.uom || '–'}</td>
      <td style={S.td}><span style={{ ...S.statusPill, ...st.pill }}>{st.label}</span></td>
      <td style={{ ...S.td, ...S.lastCell, color: dim || '#9AA0AC' }}>{r.last}</td>
    </tr>
  );
}

/* ── main component ─────────────────────────────────────────────────────────── */
export default function StokBarangPage({ setActiveMenu }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [lastSync, setLastSync] = useState(todayLabel());

  /* filter state */
  const [search,  setSearch]  = useState('');
  const [gudang,  setGudang]  = useState('all');
  const [cls,     setCls]     = useState('all');
  const [status,  setStatus]  = useState('all');

  /* debounce search */
  const searchRef = useRef('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    searchRef.current = search;
    const t = setTimeout(() => { setDebouncedSearch(searchRef.current); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  /* inventory classes derived from data */
  const invClasses = useMemo(() => {
    const seen = new Set(rows.map(r => r.cls).filter(Boolean));
    return [...seen].sort();
  }, [rows]);

  /* ── fetch from stock_summary + products + warehouses ───────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Resolve SOA company_id
      const { data: companies, error: coErr } = await supabase
        .from('companies')
        .select('id, code')
        .eq('is_active', true);
      if (coErr) throw coErr;
      const soaId = (companies || []).find(c => c.code === 'SOA')?.id;
      if (!soaId) throw new Error('Company SOA tidak ditemukan.');

      // Fetch stock_summary rows with product + warehouse detail
      const { data, error: stockErr } = await supabase
        .from('stock_summary')
        .select(`
          product_id, warehouse_id, company_id,
          on_hand, reserved, available, last_count_date,
          products (
            code, name, category, unit,
            inventory_class, main_group, uom
          ),
          warehouses (code, name, city)
        `)
        .eq('company_id', soaId)
        .limit(1000);
      if (stockErr) throw stockErr;

      // Group by product_id — one row per product combining all warehouses
      const grouped = {};
      for (const row of (data || [])) {
        const pid = row.product_id;
        if (!grouped[pid]) {
          grouped[pid] = {
            product_id: pid,
            sku:        row.products?.code || '–',
            name:       row.products?.name || '–',
            group:      row.products?.main_group || row.products?.category || '–',
            cls:        row.products?.inventory_class || '–',
            uom:        row.products?.uom || row.products?.unit || '–',
            qty_semper: 0,
            qty_others: 0,
            lastRaw:    null,
          };
        }
        // Route qty to semper vs others by warehouse code/name
        const wCode = (row.warehouses?.code || row.warehouses?.name || '').toUpperCase();
        const isSemper = wCode.includes('SEMPER');
        if (isSemper) {
          grouped[pid].qty_semper += (row.on_hand ?? 0);
        } else {
          grouped[pid].qty_others += (row.on_hand ?? 0);
        }
        // Keep the latest last_count_date across warehouses
        if (row.last_count_date) {
          if (!grouped[pid].lastRaw || row.last_count_date > grouped[pid].lastRaw) {
            grouped[pid].lastRaw = row.last_count_date;
          }
        }
      }

      // Build final rows array, compute status
      const today = todayLabel();
      const mapped = Object.values(grouped).map(r => {
        const total = r.qty_semper + r.qty_others;
        // Status: Surplus/Deficit logic will use min_stock when available.
        // For now: any stock = Match, no stock = still Match (neutral).
        const status = 'Match';
        return {
          sku:        r.sku,
          name:       r.name,
          group:      r.group,
          cls:        r.cls,
          uom:        r.uom,
          qty_semper: r.qty_semper,
          qty_others: r.qty_others,
          status,
          last:       r.lastRaw ? fmtDate(r.lastRaw) : today,
        };
      });

      // Sort by SKU
      mapped.sort((a, b) => a.sku.localeCompare(b.sku));

      setRows(mapped);
      setLastSync(today);
    } catch (err) {
      console.error('[StokBarangPage] fetch error:', err);
      setError(err.message || 'Gagal memuat data stok.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── derived filter state ──────────────────────────────────────────────── */
  const showSemper   = gudang !== 'others';
  const showOthers   = gudang !== 'semper';
  const filterActive = debouncedSearch.trim() !== '' || gudang !== 'all' || cls !== 'all' || status !== 'all';

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return rows.filter(r => {
      if (gudang === 'semper' && r.qty_semper === 0) return false;
      if (gudang === 'others' && r.qty_others === 0) return false;
      if (cls    !== 'all' && r.cls    !== cls)      return false;
      if (status !== 'all' && r.status !== status)   return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q);
    });
  }, [rows, debouncedSearch, gudang, cls, status]);

  /* ── KPI computations ──────────────────────────────────────────────────── */
  const totalSkuActive = rows.length;
  const totalOnHand    = rows.reduce((s, r) => s + (r.qty_semper ?? 0) + (r.qty_others ?? 0), 0);
  const totalSemper    = rows.reduce((s, r) => s + (r.qty_semper ?? 0), 0);
  const totalOthers    = rows.reduce((s, r) => s + (r.qty_others ?? 0), 0);

  /* ── render ────────────────────────────────────────────────────────────── */
  return (
    <div style={S.root}>
      <style>{`
        @keyframes sb-shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
        .sb-primary:hover { filter:brightness(1.06); transform:translateY(-1px); }
        .sb-ghost:hover   { border-color:#C7CBD4; color:#3A3A3F; background:#FAFBFC; }
        .sb-outline:hover { background:#F3F7FC; }
        .sb-search:focus,.sb-select:focus { border-color:${NAVY}; box-shadow:0 0 0 3px rgba(20,70,130,.10); background:#fff; }
        @media (max-width:900px) { .sb-kpi { grid-template-columns:repeat(2,minmax(0,1fr)) !important; } }
        @media (max-width:560px) { .sb-kpi { grid-template-columns:1fr !important; } }
      `}</style>

      <div style={S.wrap}>

        {/* ── header ── */}
        <div style={S.topRow}>
          <div>
            <h1 style={S.title}>Stok Barang</h1>
            <div style={S.sub}>
              <span>Monitoring stok real-time per gudang</span>
              <span style={{ color: '#D9D9DC' }}>·</span>
              <span style={S.syncDot}/>
              <span>Last sync: {lastSync}</span>
            </div>
          </div>
          <button type="button" className="sb-primary" style={S.primaryBtn}
            onClick={() => setActiveMenu?.('inventory-penerimaan')}>
            <Icon name="plus" size={17}/>Input Penerimaan
          </button>
        </div>

        {/* ── KPI cards ── */}
        <div style={S.kpiRow} className="sb-kpi">
          <KpiCard icon="package"   value={loading ? '–' : nf(totalSkuActive)} label="Total SKU Aktif"  accent="navy"/>
          <KpiCard icon="boxes"     value={loading ? '–' : nf(totalOnHand)}    label="Total On-Hand"    accent="navy"/>
          <KpiCard icon="warehouse" value={loading ? '–' : nf(totalSemper)}    label="Gudang Semper"    accent="navy"/>
          <KpiCard icon="mappin"    value={loading ? '–' : nf(totalOthers)}    label="Gudang Others"    accent="orange"/>
        </div>

        {/* ── filter bar ── */}
        <div style={S.filterCard}>
          <div style={S.filterRow}>
            <div style={S.searchWrap}>
              <span style={S.searchIco}><Icon name="search" size={17}/></span>
              <input
                className="sb-search"
                style={S.searchInput}
                placeholder="Cari nama produk atau SKU..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div style={S.selectWrap}>
              <select className="sb-select" style={S.select} value={gudang} onChange={e => setGudang(e.target.value)}>
                {WAREHOUSES.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
              <span style={S.selectIco}><Icon name="chevdown" size={15}/></span>
            </div>

            <div style={S.selectWrap}>
              <select className="sb-select" style={S.select} value={cls} onChange={e => setCls(e.target.value)}>
                <option value="all">Semua Kelas</option>
                {invClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={S.selectIco}><Icon name="chevdown" size={15}/></span>
            </div>

            <div style={S.selectWrap}>
              <select className="sb-select" style={S.select} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="all">Semua Status</option>
                <option value="Match">Match</option>
                <option value="Surplus">Surplus</option>
                <option value="Deficit">Deficit</option>
              </select>
              <span style={S.selectIco}><Icon name="chevdown" size={15}/></span>
            </div>

            <div style={{ flex: 1 }}/>

            <button type="button" className="sb-ghost" style={S.ghostBtn} onClick={fetchData}>
              <Icon name="refresh" size={15}/>Refresh
            </button>
          </div>
        </div>

        {/* ── error bar ── */}
        {error && (
          <div style={S.errorBar}>
            <Icon name="alertcircle" size={16}/>
            {error}
          </div>
        )}

        {/* ── result count ── */}
        {filterActive && !loading && !error && (
          <div style={S.countLine}>
            <span style={S.countStrong}>{filtered.length}</span> hasil ditemukan
          </div>
        )}

        {/* ── content ── */}
        {loading ? (
          /* skeleton rows */
          <div style={S.tableCard}>
            <div style={S.tableScroll}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['SKU','Nama Produk','Group','Inv. Class','Qty Semper','Qty Others','Total Qty','UOM','Status','Last Count'].map(h => (
                      <th key={h} style={{ ...S.th, ...(h.startsWith('Qty') || h === 'Total Qty' ? S.thNum : {}) }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} style={{ ...S.td, padding: 0 }}>
                        <div style={S.skelRow}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          /* empty state */
          <div style={S.empty}>
            <div style={S.emptyIco}><Icon name="warehouse" size={48}/></div>
            <div style={S.emptyTitle}>
              {filterActive ? 'Tidak ada hasil' : 'Belum ada data stok'}
            </div>
            <div style={S.emptySub}>
              {filterActive
                ? 'Coba ubah filter pencarian'
                : 'Mulai dengan input penerimaan barang pertama'}
            </div>
            {filterActive ? (
              <button type="button" className="sb-outline" style={S.outlineBtn}
                onClick={() => { setSearch(''); setGudang('all'); setCls('all'); setStatus('all'); }}>
                <Icon name="refresh" size={16}/>Reset Filter
              </button>
            ) : (
              <button type="button" className="sb-outline" style={S.outlineBtn}
                onClick={() => setActiveMenu?.('inventory-penerimaan')}>
                <Icon name="plus" size={16}/>Input Penerimaan
              </button>
            )}
          </div>
        ) : (
          /* data table */
          <div style={S.tableCard}>
            <div style={S.tableScroll}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>SKU</th>
                    <th style={S.th}>Nama Produk</th>
                    <th style={S.th}>Group</th>
                    <th style={S.th}>Inv. Class</th>
                    {showSemper && <th style={{ ...S.th, ...S.thNum }}>Qty Semper</th>}
                    {showOthers && <th style={{ ...S.th, ...S.thNum }}>Qty Others</th>}
                    <th style={{ ...S.th, ...S.thNum }}>Total Qty</th>
                    <th style={S.th}>UOM</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th}>Last Count</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <StockRow key={r.sku} r={r} showSemper={showSemper} showOthers={showOthers}/>
                  ))}
                </tbody>
              </table>
            </div>
            {/* row count footer */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid #F0F1F4', fontSize: 11.5, color: '#9AA0AC', fontWeight: 500 }}>
              {nf(filtered.length)} produk ditampilkan
              {filterActive && rows.length !== filtered.length && ` dari ${nf(rows.length)} total`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
