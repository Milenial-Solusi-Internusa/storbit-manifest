// src/modules/crm/RiwayatVisitPage.jsx
// Riwayat Visit — semua historical visit sales (activities type='visit'), lintas bulan.
// Data: activities (scheduled_for/assigned_to/account_id/status/details.mom). Nama sales
// di-resolve via fetch profiles terpisah (assigned_to tak punya FK). RLS activities_select
// otomatis scope: super_admin=semua, manager/ceo=company, sales=own.
// Visual: mengikuti redesign SalesOrderPage (cool/navy, no-zebra, header abu, hairline).

import { useState, useEffect, useMemo, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Search, ChevronRight, X, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import VisitHistoryPDF from './VisitHistoryPDF';

// ─── Brand tokens (cool/navy — konsisten SalesOrderPage) ─────────────────────
const C = {
  navy:     '#1B4D8A',
  orange:   '#E8703D',
  bg:       '#FFFFFF',
  headBg:   '#F4F6F9',
  hover:    '#F7F9FC',
  line:     '#E7EAF0',
  lineSoft: '#EEF1F5',
  ink:      '#2A3340',
  mute:     '#6B7686',
  faint:    '#9AA3B2',
  navyBg:   '#EAF0F8',
  greenT:   '#2E8B57', greenBg: '#E7F4ED',
  amberT:   '#B5772A', amberBg: '#FBEEDD',
  redT:     '#C0392B', redBg: '#FBEAE8',
};

// activities.status → visit status vocab (mirror CRMDashboardPage ACT_TO_VISIT_STATUS)
const ACT_TO_VISIT = { todo: 'scheduled', done: 'completed', cancelled: 'cancelled' };
const STATUS_META = {
  scheduled: { label: 'Terjadwal',  t: C.amberT, bg: C.amberBg },
  completed: { label: 'Selesai',    t: C.greenT, bg: C.greenBg },
  cancelled: { label: 'Dibatalkan', t: C.redT,   bg: C.redBg   },
};
const STATUS_ORDER = ['scheduled', 'completed', 'cancelled'];

const PAGE_SIZE = 25;

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateTime(iso, time) {
  const base = fmtDate(iso);
  return time ? `${base} · ${String(time).slice(0, 5)}` : base;
}

function Pill({ st }) {
  const m = STATUS_META[st] || STATUS_META.scheduled;
  return (
    <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em', color: m.t, background: m.bg, padding: '3px 11px', borderRadius: 20, whiteSpace: 'nowrap' }}>{m.label}</span>
  );
}

const selStyle = {
  width: '100%', height: 40, border: `1px solid ${C.line}`, borderRadius: 9,
  background: C.bg, padding: '0 12px', fontSize: 13, color: C.ink,
  cursor: 'pointer', outline: 'none', fontFamily: "'Inter', sans-serif",
};
const dateStyle = {
  flex: 1, minWidth: 0, height: 40, border: `1px solid ${C.line}`, borderRadius: 9,
  background: C.bg, padding: '0 10px', fontSize: 12.5, color: C.ink,
  outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box',
};
function FilterField({ label, wide, children }) {
  return (
    <div style={{ flex: wide ? 1.4 : 1, minWidth: 150 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Detail modal (self-contained — VisitDetailModal di CRMDashboard tak di-export) ──
function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
      <span style={{ fontSize: 12.5, color: C.mute, fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.ink, textAlign: 'right', fontFamily: mono ? "'IBM Plex Mono', monospace" : 'inherit', whiteSpace: 'pre-wrap' }}>{value || '—'}</span>
    </div>
  );
}
function VisitDetail({ v, onClose }) {
  if (!v) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,45,.42)', backdropFilter: 'blur(2px)', zIndex: 80 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 81, width: '100%', maxWidth: 520, margin: '0 16px', maxHeight: '88vh', overflowY: 'auto', background: C.bg, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 12px 34px rgba(20,30,45,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 12px', borderBottom: `1px solid ${C.lineSoft}` }}>
          <div>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 16, fontWeight: 800, color: C.ink }}>Detail Visit</div>
            <div style={{ marginTop: 4 }}><Pill st={v.status} /></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.mute, padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '6px 20px 18px' }}>
          <DetailRow label="Tanggal" value={fmtDateTime(v.date, v.time)} />
          <DetailRow label="Sales" value={v.salesName} />
          <DetailRow label="Customer / Prospek" value={v.customer} />
          <DetailRow label="Entitas" value={v.entity} mono />
          <DetailRow label="Jenis Kunjungan" value={v.visit_type} />
          <DetailRow label="Lokasi" value={v.location} />
          <DetailRow label="Point of Meeting" value={v.point_of_meeting} />
          <DetailRow label="Tindak Lanjut" value={v.next_action} />
          <DetailRow label="Catatan" value={v.notes} />
          {/* MOM — lengkap */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Minute of Meeting (MOM)</div>
            <div style={{ fontSize: 13, color: v.mom ? C.ink : C.faint, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: C.headBg, border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 14px' }}>
              {v.mom || 'Belum ada MOM (visit ini belum diisi / belum completed).'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RiwayatVisitPage({ showToast }) {
  const { erpRole } = useAuth();
  const isSuper = erpRole === 'super_admin';

  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [search, setSearch]           = useState('');
  const [filterSales, setFilterSales] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [filterFrom, setFilterFrom]   = useState('');
  const [filterTo, setFilterTo]       = useState('');
  const [onlyMom, setOnlyMom]         = useState(false);
  const [page, setPage]               = useState(1);
  const [detail, setDetail]           = useState(null);
  const [exporting, setExporting]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('activities')
        .select('id, scheduled_for, activity_time, status, assigned_to, account_id, prospect_name, notes, next_action, outcome, completed_at, details, account:accounts!activities_account_id_fkey(name), company:companies!activities_company_id_fkey(code)')
        .eq('type', 'visit')
        .is('deleted_at', null)
        .order('scheduled_for', { ascending: false })
        .limit(1000);
      if (err) throw err;
      const list = data || [];
      // Resolve sales names (assigned_to → profiles; no FK, fetch terpisah + map)
      const ids = [...new Set(list.map(a => a.assigned_to).filter(Boolean))];
      let nameMap = {};
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        nameMap = Object.fromEntries((profs || []).map(p => [p.id, p.full_name]));
      }
      const mapped = list.map(a => ({
        id:               a.id,
        date:             a.scheduled_for,
        time:             a.activity_time,
        status:           ACT_TO_VISIT[a.status] || 'scheduled',
        salesName:        nameMap[a.assigned_to] || '—',
        assigned_to:      a.assigned_to || '',
        customer:         a.account?.name || a.prospect_name || '—',
        entity:           a.company?.code || '—',
        mom:              a.details?.mom || '',
        visit_type:       a.details?.visit_type || '',
        location:         a.details?.location || '',
        point_of_meeting: a.details?.point_of_meeting || '',
        next_action:      a.next_action || '',
        notes:            a.notes || '',
        outcome:          a.outcome || '',
      }));
      setRows(mapped);
    } catch (err) {
      setError(err.message || 'Gagal memuat riwayat visit.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Filter options (distinct)
  const salesOptions    = useMemo(() => [...new Set(rows.map(r => r.salesName).filter(n => n && n !== '—'))].sort(), [rows]);
  const customerOptions = useMemo(() => [...new Set(rows.map(r => r.customer).filter(c => c && c !== '—'))].sort(), [rows]);
  const entityOptions   = useMemo(() => [...new Set(rows.map(r => r.entity).filter(e => e && e !== '—'))].sort(), [rows]);

  // Filtered (client-side, gabungable)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !(
        (r.customer || '').toLowerCase().includes(q) ||
        (r.salesName || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        (r.mom || '').toLowerCase().includes(q)
      )) return false;
      if (filterSales !== 'all' && r.salesName !== filterSales) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterCustomer !== 'all' && r.customer !== filterCustomer) return false;
      if (isSuper && filterEntity !== 'all' && r.entity !== filterEntity) return false;
      if (onlyMom && !r.mom.trim()) return false;
      if (filterFrom || filterTo) {
        const d = r.date ? String(r.date).slice(0, 10) : '';
        if (!d) return false;
        if (filterFrom && d < filterFrom) return false;
        if (filterTo && d > filterTo) return false;
      }
      return true;
    });
  }, [rows, search, filterSales, filterStatus, filterCustomer, filterEntity, onlyMom, filterFrom, filterTo, isSuper]);

  // Pagination (client-side, pola SalesOrderPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetFilters = useCallback(() => {
    setSearch(''); setFilterSales('all'); setFilterStatus('all'); setFilterCustomer('all');
    setFilterEntity('all'); setFilterFrom(''); setFilterTo(''); setOnlyMom(false); setPage(1);
  }, []);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const summary = {
        total:     filtered.length,
        scheduled: filtered.filter(r => r.status === 'scheduled').length,
        completed: filtered.filter(r => r.status === 'completed').length,
        cancelled: filtered.filter(r => r.status === 'cancelled').length,
      };
      const periodLabel = (filterFrom || filterTo)
        ? `${filterFrom ? fmtDate(filterFrom) : '…'} — ${filterTo ? fmtDate(filterTo) : '…'}`
        : 'Semua Periode';
      const meta = {
        periodLabel,
        salesLabel: filterSales !== 'all' ? filterSales : 'Semua Sales',
        generatedAt: new Date().toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      };
      const pdfRows = filtered.map(r => ({
        id: r.id, scheduled_for: r.date, activity_time: r.time,
        salesName: r.salesName, customer: r.customer, status: r.status,
        entity: r.entity, mom: r.mom,
      }));
      const blob = await pdf(<VisitHistoryPDF meta={meta} summary={summary} rows={pdfRows} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename dinamis sesuai konteks: Riwayat-Visit_[periode]_[sales]_[tgl-generate].pdf
      const sanitize = (s) => String(s || '').trim().replace(/[^\w]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'x';
      const monthYear = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${MONTHS[d.getMonth()]}-${d.getFullYear()}`; };
      let periodSlug;
      if (!filterFrom && !filterTo) periodSlug = 'Semua-Periode';
      else if (filterFrom && filterTo) {
        const df = new Date(filterFrom), dt = new Date(filterTo);
        periodSlug = (!isNaN(df.getTime()) && !isNaN(dt.getTime()) && df.getFullYear() === dt.getFullYear())
          ? `${MONTHS[df.getMonth()]}-${MONTHS[dt.getMonth()]}-${df.getFullYear()}`
          : `${monthYear(filterFrom)}_${monthYear(filterTo)}`;
      } else if (filterFrom) periodSlug = `Sejak-${monthYear(filterFrom)}`;
      else periodSlug = `Sampai-${monthYear(filterTo)}`;
      const salesSlug = filterSales !== 'all' ? sanitize(filterSales) : 'Semua-Sales';
      const genDate = new Date().toISOString().slice(0, 10);
      a.download = `Riwayat-Visit_${periodSlug}_${salesSlug}_${genDate}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast?.('Gagal membuat PDF: ' + (err?.message || err), 'error');
    } finally {
      setExporting(false);
    }
  }, [exporting, filtered, filterFrom, filterTo, filterSales, showToast]);

  const th = { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.mute, padding: '0 18px', height: 44, textAlign: 'left', whiteSpace: 'nowrap', background: C.headBg, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` };
  const td = { padding: '0 18px', height: 52, fontSize: 13.5, color: C.ink, borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: 'middle' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: "'Inter', sans-serif", color: C.ink }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: C.orange, fontWeight: 600 }}>Reporting</span>
            <ChevronRight size={13} style={{ color: C.faint, flexShrink: 0 }} />
            <span style={{ color: C.mute }}>Riwayat Visit</span>
          </nav>
          <h1 style={{ margin: 0, fontFamily: "'Montserrat', 'Inter', sans-serif", fontSize: 25, fontWeight: 700, letterSpacing: '-.01em', color: C.ink, lineHeight: 1.15 }}>Riwayat Visit</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: C.mute }}>Semua historical kunjungan sales — lintas bulan</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || filtered.length === 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.navy, color: '#fff', border: 'none', padding: '0 18px', height: 40, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: (exporting || filtered.length === 0) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: (exporting || filtered.length === 0) ? 0.6 : 1 }}>
          <FileText size={15} /> {exporting ? 'Menyiapkan…' : 'Export PDF'}
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', padding: '18px 20px', background: C.headBg, border: `1px solid ${C.line}`, borderRadius: 12 }}>
        <FilterField label="Sales" wide>
          <select value={filterSales} onChange={e => { setFilterSales(e.target.value); setPage(1); }} style={selStyle}>
            <option value="all">Semua Sales</option>
            {salesOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </FilterField>
        <FilterField label="Customer" wide>
          <select value={filterCustomer} onChange={e => { setFilterCustomer(e.target.value); setPage(1); }} style={selStyle}>
            <option value="all">Semua Customer</option>
            {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={selStyle}>
            <option value="all">Semua Status</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </FilterField>
        {isSuper && (
          <FilterField label="Entitas">
            <select value={filterEntity} onChange={e => { setFilterEntity(e.target.value); setPage(1); }} style={selStyle}>
              <option value="all">Semua Entitas</option>
              {entityOptions.map(en => <option key={en} value={en}>{en}</option>)}
            </select>
          </FilterField>
        )}
        <FilterField label="Periode (Tanggal Visit)" wide>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value={filterFrom} max={filterTo || undefined} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} style={dateStyle} />
            <span style={{ color: C.faint, fontSize: 13 }}>–</span>
            <input type="date" value={filterTo} min={filterFrom || undefined} onChange={e => { setFilterTo(e.target.value); setPage(1); }} style={dateStyle} />
          </div>
        </FilterField>
        <button onClick={resetFilters} style={{ height: 40, background: C.navyBg, color: C.navy, border: `1px solid #CFDDF0`, borderRadius: 9, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
      </div>

      {/* Toolbar: search + ada MOM */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.faint, pointerEvents: 'none' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Cari customer, sales, catatan, MOM…"
            style={{ width: '100%', height: 38, padding: '0 12px 0 34px', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 9, background: C.bg, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.mute, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={onlyMom} onChange={e => { setOnlyMom(e.target.checked); setPage(1); }} style={{ accentColor: C.orange, width: 15, height: 15, cursor: 'pointer' }} />
          Ada MOM
        </label>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: C.redBg, border: `1px solid #F0C7C2`, color: C.redT, fontSize: 13 }}>{error}</div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={th}>Tanggal</th>
              <th style={th}>Sales</th>
              <th style={th}>Customer / Prospek</th>
              <th style={th}>Status</th>
              <th style={th}>Entitas</th>
              <th style={{ ...th, textAlign: 'center' }}>MOM</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.faint, height: 120 }}>Memuat…</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.faint, height: 120 }}>Tidak ada visit yang cocok dengan filter ini</td></tr>
            ) : paged.map(v => (
              <tr key={v.id}
                onClick={() => setDetail(v)}
                style={{ background: C.bg, transition: 'background .1s', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = C.hover; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.bg; }}>
                <td style={{ ...td, color: C.mute, whiteSpace: 'nowrap' }}>{fmtDateTime(v.date, v.time)}</td>
                <td style={td}>{v.salesName}</td>
                <td style={td}>{v.customer}</td>
                <td style={td}><Pill st={v.status} /></td>
                <td style={{ ...td, color: C.mute, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{v.entity}</td>
                <td style={{ ...td, textAlign: 'center' }}>
                  {v.mom.trim()
                    ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.greenT, background: C.greenBg, padding: '3px 10px', borderRadius: 20 }}>Ada</span>
                    : <span style={{ color: C.faint }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer / pager */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: C.mute }}>
            Menampilkan <strong style={{ color: C.ink }}>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> dari <strong style={{ color: C.ink }}>{filtered.length}</strong> visit
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <PagerBtn disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>‹</PagerBtn>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => (
              <PagerBtn key={i + 1} active={i + 1 === safePage} onClick={() => setPage(i + 1)}>{i + 1}</PagerBtn>
            ))}
            {totalPages > 5 && safePage < totalPages && (
              <>
                <span style={{ padding: '0 4px', color: C.faint }}>…</span>
                <PagerBtn active={safePage === totalPages} onClick={() => setPage(totalPages)}>{totalPages}</PagerBtn>
              </>
            )}
            <PagerBtn disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>›</PagerBtn>
          </div>
        </div>
      )}

      <VisitDetail v={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function PagerBtn({ children, active, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8, border: active ? 'none' : `1px solid ${C.line}`, background: active ? C.navy : C.bg, color: active ? '#fff' : disabled ? C.faint : C.mute, fontSize: 13, fontWeight: active ? 700 : 400, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1, fontFamily: 'inherit' }}>
      {children}
    </button>
  );
}
