// src/modules/logistics/SalesOrderPage.jsx
// Design source: SalesOrderClean.jsx mockup (Nexus cool/navy palette, clean table).
// Real data: groupedSP from App.jsx (groupBySP + calcItem over sp_items).
//
// NOTE — Konfirmasi / Tolak PERSIST to sp_items.sp_status via the set_sp_status RPC
// (all line items of an sp_no updated atomically), then onRefresh() re-fetches.
// Manifest action still shows toast only (manifest state derived from qty/shipped_qty).

import { useState, useMemo, useCallback } from 'react';
import { calcItem } from '../../lib/spCalc'; // eslint-disable-line no-unused-vars
import { setSpStatus } from '../../lib/db';
import {
  Search, Download, Plus, Check, X, Truck, ChevronRight,
} from 'lucide-react';

// ─── Brand tokens (Nexus by MSI — cool/navy, from SalesOrderClean mockup) ─────
const C = {
  navy:     '#1B4D8A',
  navyDark: '#143C6E',
  orange:   '#E8703D',
  bg:       '#FFFFFF',
  headBg:   '#F4F6F9',   // header shade
  hover:    '#F7F9FC',   // row hover
  line:     '#E7EAF0',
  lineSoft: '#EEF1F5',
  ink:      '#2A3340',
  mute:     '#6B7686',
  faint:    '#9AA3B2',
  // status pill tones (calm)
  navyBg:   '#EAF0F8',
  greenT:   '#2E8B57', greenBg: '#E7F4ED',   // Closed
  amberT:   '#B5772A', amberBg: '#FBEEDD',   // Open / Expired overdue
  indigoT:  '#5A5B9A', indigoBg: '#ECEDF8',  // Manifest
  redT:     '#C0392B', redBg: '#FBEAE8',     // Cancelled
  red:      '#DC2626',                       // Outstanding overdue
};

// ─── Customer pill (dipakai di modal konfirmasi saja) ─────────────────────────
const CUST_PALETTE = [
  { bg: '#E1ECF5', ink: '#2A5B8C' },
  { bg: '#F6E0DB', ink: '#B23227' },
  { bg: '#DCEBEA', ink: '#1F6B6B' },
  { bg: '#ECE3F4', ink: '#6E4B8C' },
  { bg: '#F6E8D6', ink: '#A45A22' },
  { bg: '#FEF2EC', ink: '#E85A1E' },
  { bg: '#ECE1D2', ink: '#6B4A2C' },
  { bg: '#EDE3F0', ink: '#7A4E8C' },
  { bg: '#DCEAE6', ink: '#3C6E66' },
  { bg: '#F4E7D8', ink: '#9A5B2C' },
];
function custColor(name) {
  if (!name) return { bg: C.lineSoft, ink: C.mute };
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % CUST_PALETTE.length;
  return CUST_PALETTE[h];
}
function CustPill({ name }) {
  if (!name) return <span style={{ color: C.faint, fontSize: 12 }}>—</span>;
  const { bg, ink } = custColor(name);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
      padding: '2px 9px', borderRadius: 6, background: bg, color: ink,
      border: '1px solid transparent', whiteSpace: 'nowrap',
    }}>{name}</span>
  );
}

// ─── Status model ──────────────────────────────────────────────────────────
// Precedence high→low: cancelled > Closed > Partial(Manifest) > confirmed > open.
function toDesignStatus(g) {
  if (g.spStatus === 'cancelled') return 'CANCELLED';
  if (g.status === 'Closed')      return 'CLOSED';
  if (g.status === 'Partial')     return 'MANIFEST';
  if (g.spStatus === 'confirmed') return 'CONFIRMED';
  return 'OPEN';
}

const STATUS_META = {
  OPEN:      { label: 'Open',      t: C.amberT,  bg: C.amberBg  },
  CONFIRMED: { label: 'Confirmed', t: C.navy,    bg: C.navyBg   },
  MANIFEST:  { label: 'Manifest',  t: C.indigoT, bg: C.indigoBg },
  CLOSED:    { label: 'Closed',    t: C.greenT,  bg: C.greenBg  },
  CANCELLED: { label: 'Cancelled', t: C.redT,    bg: C.redBg    },
};
const STATUS_ORDER = ['OPEN', 'CONFIRMED', 'MANIFEST', 'CLOSED', 'CANCELLED'];

function Pill({ st }) {
  const m = STATUS_META[st] || STATUS_META.OPEN;
  return (
    <span style={{
      display: 'inline-block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em',
      color: m.t, background: m.bg, padding: '3px 11px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>{m.label}</span>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const nf = (n) => (Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PAGE_SIZE = 20;

// ─── Atoms ─────────────────────────────────────────────────────────────────

function Th({ children, k, sortK, sortDir, onClick, right, center }) {
  const active = sortK === k;
  return (
    <th
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
        color: active ? C.navy : C.mute, padding: '0 18px', height: 44,
        textAlign: right ? 'right' : center ? 'center' : 'left', whiteSpace: 'nowrap',
        background: C.headBg, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      {children}
      {onClick && (
        <span style={{ marginLeft: 4, opacity: active ? 1 : .4, fontSize: 10 }}>
          {active ? (sortDir > 0 ? '↑' : '↓') : '⇅'}
        </span>
      )}
    </th>
  );
}

function AksiBtn({ label, icon: Icon, bg, color, bd, onClick: oc }) {
  return (
    <button
      // stopPropagation: klik tombol aksi TIDAK ikut men-trigger onClick baris (buka Detail).
      onClick={(e) => { e.stopPropagation(); oc?.(e); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 30, padding: '0 11px', borderRadius: 7, border: `1px solid ${bd || 'transparent'}`,
        background: bg || 'transparent', color: color || C.navy,
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
      }}
    >
      <Icon size={13}/>{label}
    </button>
  );
}

// Kolom Aksi = hanya tombol operasional. Detail dibuang karena seluruh baris clickable.
function AksiCell({ dstatus, onConfirm, onReject, onManifest }) {
  if (dstatus === 'OPEN') return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      <AksiBtn label="Konfirmasi" icon={Check} bg={C.orange} color="#fff"    bd={C.orange} onClick={onConfirm}/>
      <AksiBtn label="Tolak"      icon={X}     bg={C.bg}     color={C.redT}   bd={C.line}   onClick={onReject}/>
    </div>
  );
  if (dstatus === 'MANIFEST') return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
      <AksiBtn label="Manifest" icon={Truck} bg={C.navy} color="#fff" bd={C.navy} onClick={onManifest}/>
    </div>
  );
  // Confirmed / Closed / Cancelled → tak ada aksi operasional (baris tetap clickable ke Detail).
  return <span style={{ color: C.faint }}>—</span>;
}

function PagerBtn({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8,
        border: active ? 'none' : `1px solid ${C.line}`,
        background: active ? C.navy : C.bg,
        color: active ? '#fff' : disabled ? C.faint : C.mute,
        fontSize: 13, fontWeight: active ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

// Labelled filter control (select / date range) — mockup FilterField style
function FilterField({ label, wide, children }) {
  return (
    <div style={{ flex: wide ? 1.4 : 1, minWidth: 150 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.mute, marginBottom: 7 }}>{label}</label>
      {children}
    </div>
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

function ConfirmModal({ modal, rejectReason, setRejectReason, rejectErr, onClose, onConfirm, busy }) {
  const ok = modal.action === 'confirm';
  const g = modal.group;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,45,.42)', backdropFilter: 'blur(2px)', zIndex: 80 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 81, width: '100%', maxWidth: 440, margin: '0 16px',
        background: C.bg, border: `1px solid ${C.line}`, borderRadius: 14,
        boxShadow: '0 12px 34px rgba(20,30,45,.18)', overflow: 'hidden',
      }}>
        {/* Head */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '20px 22px 14px' }}>
          <span style={{
            width: 42, height: 42, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: ok ? C.greenBg : C.redBg, color: ok ? C.orange : C.redT,
          }}>
            {ok ? <Check size={21}/> : <X size={21}/>}
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.25, color: C.ink }}>
              {ok ? 'Konfirmasi ' : 'Tolak '}{modal.no} dari {g.customer}?
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.mute, lineHeight: 1.45 }}>
              {ok
                ? 'SP akan berpindah ke status Confirmed dan siap dibuatkan manifest pengiriman.'
                : 'SP akan ditolak dan dipindahkan ke status Cancelled. Tindakan ini dicatat di history.'}
            </p>
          </div>
        </div>
        {/* Body */}
        <div style={{ padding: '0 22px 4px' }}>
          <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, background: C.headBg, overflow: 'hidden' }}>
            {[
              { k: 'Customer',    v: <CustPill name={g.customer}/> },
              { k: 'Jumlah Item', v: `${g.itemCount} produk · ${nf(g.totalQty)} qty` },
              { k: 'Grand Total', v: rp(g.grandTotal) },
            ].map(({ k, v }, i, arr) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 12, padding: '10px 14px', fontSize: 12.5,
                borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
              }}>
                <span style={{ color: C.mute, fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 700, textAlign: 'right', color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
          {!ok && (
            <div style={{ marginTop: 14, marginBottom: 4 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: C.mute, display: 'block', marginBottom: 6 }}>
                Alasan Penolakan <span style={{ color: C.red }}>*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); }}
                placeholder="cth: Stok tidak tersedia, harga tidak sesuai PO, dsb…"
                style={{
                  width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 9,
                  border: `1px solid ${rejectErr ? C.red : C.line}`,
                  background: C.bg, fontSize: 13, color: C.ink,
                  resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              {rejectErr && (
                <span style={{ fontSize: 12, color: C.red, display: 'block', marginTop: 4 }}>
                  Alasan wajib diisi untuk menolak SP.
                </span>
              )}
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '18px 22px 20px' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              height: 38, padding: '0 16px', borderRadius: 9,
              border: `1px solid ${C.line}`, background: C.bg,
              color: C.mute, fontSize: 13, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1,
            }}
          >Batal</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, border: 'none',
              background: ok ? C.orange : C.red, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 7, opacity: busy ? .7 : 1,
            }}
          >
            {ok ? <Check size={15}/> : <X size={15}/>}
            {busy ? 'Menyimpan…' : ok ? 'Ya, Konfirmasi' : 'Ya, Tolak'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function SalesOrderPage({
  groupedSP = [],
  dcList = [],
  onSelectSP,
  onAddSP,
  onExport,
  onRefresh,
  showToast,
}) {
  const [tab, setTab]                       = useState('all');
  const [search, setSearch]                 = useState('');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [filterDC, setFilterDC]             = useState('all');
  const [filterStatus, setFilterStatus]     = useState('all');
  const [filterFrom, setFilterFrom]         = useState('');   // Periode: SP Date dari
  const [filterTo, setFilterTo]             = useState('');   // Periode: SP Date sampai
  const [filterOverdue, setFilterOverdue]   = useState(false);
  const [sortK, setSortK]                   = useState('spDate');
  const [sortDir, setSortDir]               = useState(-1);   // -1 desc, 1 asc
  const [page, setPage]                     = useState(1);
  const [modal, setModal]                   = useState(null); // { no, action, group }
  const [rejectReason, setRejectReason]     = useState('');
  const [rejectErr, setRejectErr]           = useState(false);

  // Augment with design status
  const augmented = useMemo(
    () => groupedSP.map(g => ({ ...g, dstatus: toDesignStatus(g) })),
    [groupedSP],
  );

  // Tab counts
  const counts = useMemo(() => ({
    all:      augmented.length,
    pending:  augmented.filter(g => g.dstatus === 'OPEN').length,
    manifest: augmented.filter(g => g.dstatus === 'MANIFEST').length,
    history:  augmented.filter(g => g.dstatus === 'CLOSED' || g.dstatus === 'CANCELLED').length,
  }), [augmented]);

  // Status filter options — only values that actually exist in the data
  const statusOptions = useMemo(() => {
    const present = new Set(augmented.map(g => g.dstatus));
    return STATUS_ORDER.filter(s => present.has(s));
  }, [augmented]);

  // Tab filter
  const tabFiltered = useMemo(() => {
    if (tab === 'pending')  return augmented.filter(g => g.dstatus === 'OPEN');
    if (tab === 'manifest') return augmented.filter(g => g.dstatus === 'MANIFEST');
    if (tab === 'history')  return augmented.filter(g => g.dstatus === 'CLOSED' || g.dstatus === 'CANCELLED');
    return augmented;
  }, [augmented, tab]);

  // Search + filter (client-side — Customer/DC/Overdue existing + Status/Periode baru)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tabFiltered.filter(g => {
      if (q && !(
        g.spNo.toLowerCase().includes(q) ||
        (g.customer || '').toLowerCase().includes(q) ||
        (g.dc || '').toLowerCase().includes(q)
      )) return false;
      if (filterCustomer !== 'all' && g.customer !== filterCustomer) return false;
      if (filterDC !== 'all' && g.dc !== filterDC) return false;
      if (filterStatus !== 'all' && g.dstatus !== filterStatus) return false;
      if (filterOverdue && !g.isOverdue) return false;
      // Periode berdasarkan SP Date (normalisasi ke YYYY-MM-DD)
      if (filterFrom || filterTo) {
        const d = g.spDate ? String(g.spDate).slice(0, 10) : '';
        if (!d) return false;
        if (filterFrom && d < filterFrom) return false;
        if (filterTo && d > filterTo) return false;
      }
      return true;
    });
  }, [tabFiltered, search, filterCustomer, filterDC, filterStatus, filterFrom, filterTo, filterOverdue]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av, bv;
      if      (sortK === 'spDate' || sortK === 'deadline' || sortK === 'expired_date') {
        av = a[sortK] ? new Date(a[sortK]).getTime() : 0;
        bv = b[sortK] ? new Date(b[sortK]).getTime() : 0;
      }
      else if (sortK === 'totalQty')     { av = a.totalQty;         bv = b.totalQty; }
      else if (sortK === 'outstanding')  { av = a.totalOutstanding; bv = b.totalOutstanding; }
      else if (sortK === 'grandTotal')   { av = a.grandTotal;       bv = b.grandTotal; }
      else { av = String(a[sortK] || ''); bv = String(b[sortK] || ''); }
      return av > bv ? sortDir : av < bv ? -sortDir : 0;
    });
    return copy;
  }, [filtered, sortK, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const doSetTab = useCallback((t) => { setTab(t); setPage(1); }, []);

  const toggleSort = useCallback((k) => {
    setSortK(prev => { if (prev === k) { setSortDir(d => d * -1); return k; } setSortDir(-1); return k; });
  }, []);

  const resetFilters = useCallback(() => {
    setFilterCustomer('all'); setFilterDC('all'); setFilterStatus('all');
    setFilterFrom(''); setFilterTo(''); setFilterOverdue(false); setSearch('');
    setPage(1);
  }, []);

  // Modal
  const openModal = (no, action) => {
    const group = augmented.find(g => g.spNo === no);
    if (!group) return;
    setModal({ no, action, group });
    setRejectReason('');
    setRejectErr(false);
  };
  const closeModal   = () => setModal(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const confirmModal = async () => {
    if (modal.action === 'reject' && !rejectReason.trim()) {
      setRejectErr(true); return;
    }
    const no      = modal.no;
    const action  = modal.action;
    const status  = action === 'confirm' ? 'confirmed' : 'cancelled';
    const reason  = action === 'reject' ? rejectReason.trim() : null;
    setStatusBusy(true);
    const { error } = await setSpStatus(no, status, reason);
    setStatusBusy(false);
    if (error) {
      showToast(`Gagal memperbarui status SP ${no}: ${error.message || error}`, 'error');
      return;
    }
    closeModal();
    await onRefresh?.();
    showToast(
      action === 'confirm'
        ? `SP ${no} dikonfirmasi ✓`
        : `SP ${no} dibatalkan`,
      'success',
    );
  };
  const handleManifest = (no) => {
    // TODO: needs sp_items.status migration
    showToast(`Manifest ${no} dibuat ✓`, 'success');
  };

  // Unique customer names for filter dropdown
  const customerNames = useMemo(
    () => [...new Set(augmented.map(g => g.customer).filter(Boolean))].sort(),
    [augmented],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: "'Inter', sans-serif", color: C.ink }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
            <span style={{ color: C.orange, fontWeight: 600 }}>Logistics</span>
            <ChevronRight size={13} style={{ color: C.faint, flexShrink: 0 }}/>
            <span style={{ color: C.mute }}>Sales Order / SP</span>
          </nav>
          <h1 style={{ margin: 0, fontFamily: "'Montserrat', 'Inter', sans-serif", fontSize: 25, fontWeight: 700, letterSpacing: '-.01em', color: C.ink, lineHeight: 1.15 }}>
            Sales Order / SP
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: C.mute }}>
            Kelola surat pesanan masuk dari customer Storbit
          </p>
        </div>
        <button
          onClick={onAddSP}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: C.orange, color: '#fff', border: 'none',
            padding: '0 18px', height: 40, borderRadius: 9,
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Plus size={16}/> Input SP
        </button>
      </div>

      {/* ── Filter bar (card) ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap',
        padding: '18px 20px', background: C.headBg, border: `1px solid ${C.line}`, borderRadius: 12,
      }}>
        <FilterField label="Customer" wide>
          <select value={filterCustomer} onChange={e => { setFilterCustomer(e.target.value); setPage(1); }} style={selStyle}>
            <option value="all">Semua Customer</option>
            {customerNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </FilterField>
        <FilterField label="DC Tujuan" wide>
          <select value={filterDC} onChange={e => { setFilterDC(e.target.value); setPage(1); }} style={selStyle}>
            <option value="all">Semua DC</option>
            {dcList.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={selStyle}>
            <option value="all">Semua Status</option>
            {statusOptions.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </FilterField>
        <FilterField label="Periode (SP Date)" wide>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" value={filterFrom} max={filterTo || undefined} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} style={dateStyle}/>
            <span style={{ color: C.faint, fontSize: 13 }}>–</span>
            <input type="date" value={filterTo} min={filterFrom || undefined} onChange={e => { setFilterTo(e.target.value); setPage(1); }} style={dateStyle}/>
          </div>
        </FilterField>
        <button
          onClick={resetFilters}
          style={{
            height: 40, background: C.navyBg, color: C.navy, border: `1px solid #CFDDF0`,
            borderRadius: 9, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Reset</button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.line}` }}>
        {[
          { k: 'all',      l: 'Semua SP' },
          { k: 'pending',  l: 'Pending Konfirmasi' },
          { k: 'manifest', l: 'Manifest' },
          { k: 'history',  l: 'History' },
        ].map(({ k, l }) => {
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => doSetTab(k)}
              style={{
                position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '11px 16px', fontSize: 13.5, fontWeight: active ? 600 : 500,
                color: active ? C.navy : C.mute,
                display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
              }}
            >
              {l}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                background: active ? C.navyBg : C.lineSoft, color: active ? C.navy : C.faint,
              }}>{counts[k]}</span>
              {active && <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2.5, background: C.navy, borderRadius: 2 }}/>}
            </button>
          );
        })}
      </div>

      {/* ── Toolbar: search + export + overdue ────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260, maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.faint, pointerEvents: 'none' }}/>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari SP, customer, produk…"
            style={{
              width: '100%', height: 38, padding: '0 12px 0 34px', boxSizing: 'border-box',
              border: `1px solid ${C.line}`, borderRadius: 9, background: C.bg,
              fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          onClick={onExport}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 14px',
            border: `1px solid ${C.line}`, borderRadius: 9, background: C.bg,
            fontSize: 13, fontWeight: 500, color: C.ink, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Download size={14} style={{ color: C.mute }}/> Export CSV
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.mute, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={e => { setFilterOverdue(e.target.checked); setPage(1); }}
            style={{ accentColor: C.orange, width: 15, height: 15, cursor: 'pointer' }}
          />
          Overdue only
        </label>
      </div>

      {/* ── Table (clean: no zebra, shaded header, hairline rows) ──────── */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr>
              <Th k="spDate"       sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('spDate')}>Tanggal</Th>
              <Th>No SP</Th>
              <Th>Customer</Th>
              <Th k="totalQty"     sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('totalQty')} right>Total Qty</Th>
              <Th k="outstanding"  sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('outstanding')} right>Outstanding</Th>
              <Th>Status</Th>
              <Th>DC Tujuan</Th>
              <Th k="expired_date" sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('expired_date')}>Expired</Th>
              <Th k="grandTotal"   sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('grandTotal')} right>Grand Total</Th>
              <Th center>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '56px 24px', color: C.faint, fontSize: 13, borderBottom: `1px solid ${C.lineSoft}` }}>
                  Tidak ada SP yang cocok dengan filter ini
                </td>
              </tr>
            )}
            {paged.map(g => {
              const td = { padding: '0 18px', height: 54, fontSize: 13.5, color: C.ink, borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: 'middle' };
              return (
                <tr
                  key={g.spNo}
                  onClick={() => onSelectSP(g.spNo)}
                  style={{ background: C.bg, transition: 'background .1s', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.hover; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.bg; }}
                >
                  {/* Tanggal */}
                  <td style={{ ...td, color: C.mute, whiteSpace: 'nowrap' }}>{fmtDate(g.spDate)}</td>
                  {/* No SP — #angka navy + subteks · N produk (clickable → detail) */}
                  <td style={td}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onSelectSP(g.spNo); }}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelectSP(g.spNo); } }}
                      style={{ cursor: 'pointer', fontWeight: 700, color: C.navy, fontSize: 14, fontVariantNumeric: 'tabular-nums', letterSpacing: '.01em', whiteSpace: 'nowrap' }}
                    >
                      <span style={{ color: C.faint, fontWeight: 400, marginRight: 1 }}>#</span>{g.spNo}
                    </span>
                    <span style={{ fontSize: 11.5, color: C.faint, marginLeft: 8, whiteSpace: 'nowrap' }}>· {g.itemCount} produk</span>
                  </td>
                  {/* Customer — teks polos */}
                  <td style={td}><span style={{ fontSize: 13, color: C.ink }}>{g.customer || '—'}</span></td>
                  {/* Total Qty */}
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{nf(g.totalQty)}</td>
                  {/* Outstanding — merah HANYA jika overdue */}
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: g.isOverdue ? C.red : C.ink, fontWeight: g.isOverdue ? 600 : 400 }}>
                    {nf(g.totalOutstanding)}
                  </td>
                  {/* Status */}
                  <td style={td}><Pill st={g.dstatus}/></td>
                  {/* DC Tujuan */}
                  <td style={{ ...td, color: C.mute, whiteSpace: 'nowrap' }}>{g.dc || '—'}</td>
                  {/* Expired — amber HANYA jika overdue */}
                  <td style={{ ...td, whiteSpace: 'nowrap', color: g.isOverdue ? C.amberT : C.mute, fontWeight: g.isOverdue ? 600 : 400 }}>
                    {(g.expired_date || g.deadline) ? fmtDate(g.expired_date || g.deadline) : '—'}
                  </td>
                  {/* Grand Total — Inter (non-mono), Rp faint */}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: C.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    <span style={{ color: C.faint, fontWeight: 400, fontSize: 12, marginRight: 3 }}>Rp</span>{nf(g.grandTotal)}
                  </td>
                  {/* Aksi */}
                  <td style={{ ...td, textAlign: 'center' }}>
                    <AksiCell
                      dstatus={g.dstatus}
                      onConfirm={() => openModal(g.spNo, 'confirm')}
                      onReject={() => openModal(g.spNo, 'reject')}
                      onManifest={() => handleManifest(g.spNo)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer / pager ────────────────────────────────────────────── */}
      {sorted.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: C.mute }}>
            Menampilkan{' '}
            <strong style={{ color: C.ink }}>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)}</strong>
            {' '}dari <strong style={{ color: C.ink }}>{sorted.length}</strong> SP
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

      {/* ── Confirm / Reject Modal ────────────────────────────────────── */}
      {modal && (
        <ConfirmModal
          modal={modal}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          rejectErr={rejectErr}
          onClose={closeModal}
          onConfirm={confirmModal}
          busy={statusBusy}
        />
      )}
    </div>
  );
}
