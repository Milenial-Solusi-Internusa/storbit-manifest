// src/modules/logistics/SalesOrderPage.jsx
// Design source: nexus-by-msi/project/sales-order.html + storbit.css
// Real data: groupedSP from App.jsx (groupBySP + calcItem over sp_items)
//
// NOTE — Konfirmasi / Tolak now PERSIST to sp_items.sp_status via the
// set_sp_status RPC (all line items of an sp_no updated atomically), then
// onRefresh() re-fetches. Manifest action still shows toast only (manifest
// state is derived from qty/shipped_qty, not from sp_status).

import { useState, useMemo, useCallback } from 'react';
import { calcItem } from '../../lib/spCalc'; // eslint-disable-line no-unused-vars
import { setSpStatus } from '../../lib/db';
import {
  Search, Download, Plus, Check, X, Truck, ChevronRight,
  AlertTriangle, Clock, Receipt, Eye,
} from 'lucide-react';

// ─── Design tokens (aligned with App.jsx PASTEL + storbit.css) ──────────────
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
};

// ─── Customer pill — deterministic color from name hash ───────────────────
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
  if (!name) return { bg: C.neutralBg, ink: C.neutral };
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % CUST_PALETTE.length;
  return CUST_PALETTE[h];
}

// ─── Status model ──────────────────────────────────────────────────────────
// Design uses: OPEN → CONFIRMED → MANIFEST → CLOSED / CANCELLED
// Two signals combined, precedence high→low:
//   1. spStatus 'cancelled'  → CANCELLED (overrides everything)
//   2. qty-derived 'Closed'  → CLOSED
//   3. qty-derived 'Partial' → MANIFEST (shipping in progress)
//   4. spStatus 'confirmed'  → CONFIRMED (confirmed, not yet shipped)
//   5. otherwise             → OPEN (draft / belum dikonfirmasi)
function toDesignStatus(g) {
  if (g.spStatus === 'cancelled') return 'CANCELLED';
  if (g.status === 'Closed')      return 'CLOSED';
  if (g.status === 'Partial')     return 'MANIFEST';
  if (g.spStatus === 'confirmed') return 'CONFIRMED';
  return 'OPEN';
}

const STATUS_META = {
  OPEN:      { label: 'Open',      bg: C.infoBg,    color: C.info,    bd: C.infoBd    },
  CONFIRMED: { label: 'Confirmed', bg: C.okBg,      color: C.ok,      bd: C.okBd      },
  MANIFEST:  { label: 'Manifest',  bg: C.purpleBg,  color: C.purple,  bd: C.purpleBd  },
  CLOSED:    { label: 'Closed',    bg: C.neutralBg, color: C.neutral, bd: C.neutralBd },
  CANCELLED: { label: 'Cancelled', bg: C.dangerBg,  color: C.danger,  bd: C.dangerBd  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const rp = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysFromToday(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

const PAGE_SIZE = 20;

// ─── Atoms ─────────────────────────────────────────────────────────────────

function StatusBadge({ st }) {
  const m = STATUS_META[st] || STATUS_META.OPEN;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: m.bg, color: m.color, border: `1px solid ${m.bd}`,
      fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }}/>
      {m.label}
    </span>
  );
}

function CustPill({ name }) {
  if (!name) return <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;
  const { bg, ink } = custColor(name);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
      padding: '2px 9px', borderRadius: 6, background: bg, color: ink,
      border: '1px solid transparent', whiteSpace: 'nowrap', letterSpacing: '.2px',
    }}>{name}</span>
  );
}

function FinBar({ pct }) {
  const color = pct < 30 ? C.danger : pct <= 70 ? C.warn : C.ok;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 118 }}>
      <div style={{ width: 74, height: 7, borderRadius: 4, background: C.lineSoft, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }}/>
      </div>
      <span style={{
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 600,
        width: 34, textAlign: 'right', color, flexShrink: 0,
      }}>{pct}%</span>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, sub, badge }) {
  const tones = {
    default: { bg: C.surface,    bd: C.line,      lc: C.inkFaint,  ic: C.lineSoft,  icc: C.inkFaint  },
    warn:    { bg: C.warnBg,     bd: C.warnBd,    lc: C.warn,      ic: C.warnBg,    icc: C.warn      },
    info:    { bg: C.infoBg,     bd: C.infoBd,    lc: C.info,      ic: C.infoBg,    icc: C.info      },
    danger:  { bg: C.dangerBg,   bd: C.dangerBd,  lc: C.danger,    ic: C.dangerBg,  icc: C.danger    },
  };
  const t = tones[tone] || tones.default;
  return (
    <div style={{
      background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 12,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11.5, fontWeight: 700, color: t.lc,
          textTransform: 'uppercase', letterSpacing: '.5px',
        }}>{label}</span>
        <span style={{
          width: 34, height: 34, borderRadius: 9, background: tone ? t.bg : C.lineSoft,
          color: t.icc, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, border: `1px solid ${t.bd}`,
        }}>
          <Icon size={17} strokeWidth={1.8}/>
        </span>
      </div>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 34, fontWeight: 800, color: C.ink, letterSpacing: '-1px', lineHeight: 1,
      }}>{value}</div>
      <div style={{ fontSize: 12, color: t.lc }}>
        {badge ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: tone ? t.bg : C.lineSoft, color: t.icc,
            border: `1px solid ${t.bd}`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.icc, flexShrink: 0 }}/>
            {badge}
          </span>
        ) : <span>{sub}</span>}
      </div>
    </div>
  );
}

function Th({ children, k, sortK, sortDir, onClick, right, sx }) {
  const active = sortK === k;
  return (
    <th
      onClick={onClick}
      style={{
        padding: '11px 14px', textAlign: right ? 'right' : 'left',
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
        color: active ? C.accent : C.inkFaint,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap', userSelect: 'none', background: C.surface2,
        ...sx,
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
      onClick={oc}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 32, padding: '0 11px', borderRadius: 9, border: `1px solid ${bd || 'transparent'}`,
        background: bg || 'transparent', color: color || C.inkSoft,
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
      }}
    >
      <Icon size={13}/>{label}
    </button>
  );
}

function AksiCell({ dstatus, onConfirm, onReject, onManifest, onDetail }) {
  if (dstatus === 'OPEN') return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <AksiBtn label="Konfirmasi" icon={Check}  bg={C.accent}  color="#fff"     bd={C.accent}    onClick={onConfirm}/>
      <AksiBtn label="Tolak"      icon={X}      bg={C.surface} color={C.danger} bd={C.dangerBd}  onClick={onReject}/>
    </div>
  );
  if (dstatus === 'MANIFEST') return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <AksiBtn label="Manifest" icon={Truck} bg={C.purple} color="#fff"     bd={C.purple} onClick={onManifest}/>
      <AksiBtn label="Detail"   icon={Eye}   bg="transparent" color={C.inkSoft}           onClick={onDetail}/>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <AksiBtn label="Detail" icon={Eye} bg="transparent" color={C.inkSoft} onClick={onDetail}/>
    </div>
  );
}

function PagerBtn({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 32, height: 32, padding: '0 8px', borderRadius: 8,
        border: `1px solid ${active ? C.accent : C.line}`,
        background: active ? C.accent : C.surface2,
        color: active ? '#fff' : disabled ? C.inkFaint : C.inkSoft,
        fontSize: 13, fontWeight: active ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .45 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function ConfirmModal({ modal, rejectReason, setRejectReason, rejectErr, onClose, onConfirm, busy }) {
  const ok = modal.action === 'confirm';
  const g = modal.group;
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(28,24,14,.42)', backdropFilter: 'blur(2px)', zIndex: 80 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 81, width: '100%', maxWidth: 440, margin: '0 16px',
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
        boxShadow: '0 12px 34px rgba(40,34,18,.18)', overflow: 'hidden',
      }}>
        {/* Head */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '20px 22px 14px' }}>
          <span style={{
            width: 42, height: 42, borderRadius: 11, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: ok ? C.okBg : C.dangerBg, color: ok ? C.accent : C.danger,
          }}>
            {ok ? <Check size={21}/> : <X size={21}/>}
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.25 }}>
              {ok ? 'Konfirmasi ' : 'Tolak '}{modal.no} dari {g.customer}?
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.inkSoft, lineHeight: 1.45 }}>
              {ok
                ? 'SP akan berpindah ke status Confirmed dan siap dibuatkan manifest pengiriman.'
                : 'SP akan ditolak dan dipindahkan ke status Cancelled. Tindakan ini dicatat di history.'}
            </p>
          </div>
        </div>
        {/* Body */}
        <div style={{ padding: '0 22px 4px' }}>
          <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 10, background: C.surface2, overflow: 'hidden' }}>
            {[
              { k: 'Customer',    v: <CustPill name={g.customer}/> },
              { k: 'Jumlah Item', v: `${g.itemCount} produk · ${(g.totalQty || 0).toLocaleString('id-ID')} qty` },
              { k: 'Grand Total', v: rp(g.grandTotal) },
            ].map(({ k, v }, i, arr) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 12, padding: '10px 14px', fontSize: 12.5,
                borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
              }}>
                <span style={{ color: C.inkFaint, fontWeight: 600 }}>{k}</span>
                <span style={{
                  fontWeight: 700, textAlign: 'right',
                  fontFamily: typeof v === 'string' && v.startsWith('Rp') ? "'IBM Plex Mono', monospace" : 'inherit',
                }}>{v}</span>
              </div>
            ))}
          </div>
          {!ok && (
            <div style={{ marginTop: 14, marginBottom: 4 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, display: 'block', marginBottom: 6 }}>
                Alasan Penolakan <span style={{ color: C.danger }}>*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => { setRejectReason(e.target.value); }}
                placeholder="cth: Stok tidak tersedia, harga tidak sesuai PO, dsb…"
                style={{
                  width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 9,
                  border: `1px solid ${rejectErr ? C.danger : C.line}`,
                  background: C.surface, fontSize: 13, color: C.ink,
                  resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              {rejectErr && (
                <span style={{ fontSize: 12, color: C.danger, display: 'block', marginTop: 4 }}>
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
              border: `1px solid ${C.line}`, background: C.surface2,
              color: C.inkSoft, fontSize: 13, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1,
            }}
          >Batal</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, border: 'none',
              background: ok ? C.accent : C.danger, color: '#fff',
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
  const [filterOverdue, setFilterOverdue]   = useState(false);
  const [sortK, setSortK]                   = useState('spDate');
  const [sortDir, setSortDir]               = useState(-1);   // -1 desc, 1 asc
  const [selectedNos, setSelectedNos]       = useState(new Set());
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

  // Stats cards
  const stats = useMemo(() => ({
    total:       augmented.length,
    pending:     augmented.filter(g => g.dstatus === 'OPEN').length,
    manifest:    augmented.filter(g => g.dstatus === 'MANIFEST').length,
    outstanding: augmented.filter(g => g.totalOutstanding > 0).length,
  }), [augmented]);

  // Tab filter
  const tabFiltered = useMemo(() => {
    if (tab === 'pending')  return augmented.filter(g => g.dstatus === 'OPEN');
    if (tab === 'manifest') return augmented.filter(g => g.dstatus === 'MANIFEST');
    if (tab === 'history')  return augmented.filter(g => g.dstatus === 'CLOSED' || g.dstatus === 'CANCELLED');
    return augmented;
  }, [augmented, tab]);

  // Search + filter
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
      if (filterOverdue && !g.isOverdue) return false;
      return true;
    });
  }, [tabFiltered, search, filterCustomer, filterDC, filterOverdue]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av, bv;
      if      (sortK === 'spDate' || sortK === 'deadline' || sortK === 'expired_date') {
        av = a[sortK] ? new Date(a[sortK]).getTime() : 0;
        bv = b[sortK] ? new Date(b[sortK]).getTime() : 0;
      }
      else if (sortK === 'totalQty')     { av = a.totalQty;       bv = b.totalQty; }
      else if (sortK === 'outstanding')  { av = a.totalOutstanding; bv = b.totalOutstanding; }
      else if (sortK === 'grandTotal')   { av = a.grandTotal;     bv = b.grandTotal; }
      else { av = String(a[sortK] || ''); bv = String(b[sortK] || ''); }
      return av > bv ? sortDir : av < bv ? -sortDir : 0;
    });
    return copy;
  }, [filtered, sortK, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const doSetTab = useCallback((t) => { setTab(t); setPage(1); setSelectedNos(new Set()); }, []);

  const toggleSort = useCallback((k) => {
    setSortK(prev => { if (prev === k) { setSortDir(d => d * -1); return k; } setSortDir(-1); return k; });
  }, []);

  // Selection
  const toggleRow = (no) => setSelectedNos(prev => {
    const n = new Set(prev); if (n.has(no)) n.delete(no); else n.add(no); return n;
  });
  const toggleAll = (checked) =>
    setSelectedNos(checked ? new Set(paged.map(g => g.spNo)) : new Set());
  const allChecked = paged.length > 0 && paged.every(g => selectedNos.has(g.spNo));

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.inkFaint, marginBottom: 6 }}>
            <span>Logistics</span>
            <ChevronRight size={12} style={{ flexShrink: 0 }}/>
            <span style={{ color: C.ink, fontWeight: 600 }}>Sales Order / SP</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', lineHeight: 1.15 }}>
            Sales Order / SP
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: C.inkSoft }}>
            Kelola surat pesanan masuk dari customer Storbit
          </p>
        </div>
        <button
          onClick={onAddSP}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: C.accent, color: '#fff', border: 'none',
            padding: '0 18px', height: 40, borderRadius: 10,
            fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 1px 3px rgba(40,34,18,.14)',
          }}
        >
          <Plus size={16}/> Input SP
        </button>
      </div>

      {/* ── Stats (4 cards) ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard label="Total SP"            value={stats.total}       icon={Receipt}      sub="sepanjang 2026"/>
        <StatCard label="Pending Konfirmasi"  value={stats.pending}     icon={Clock}        tone="warn"   badge="perlu tindakan"/>
        <StatCard label="Total Manifest"      value={stats.manifest}    icon={Truck}        tone="info"   badge="dalam pengiriman"/>
        <StatCard label="Outstanding"         value={stats.outstanding} icon={AlertTriangle} tone="danger" badge="belum terkirim penuh"/>
      </div>

      {/* ── Main card ─────────────────────────────────────────────────── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
        overflow: 'hidden', boxShadow: '0 2px 8px rgba(40,34,18,.06)',
      }}>

        {/* Tab pills */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.lineSoft}`, padding: '0 6px', overflowX: 'auto', flexShrink: 0 }}>
          {[
            { k: 'all',      l: 'Semua SP' },
            { k: 'pending',  l: 'Pending Konfirmasi' },
            { k: 'manifest', l: 'Manifest' },
            { k: 'history',  l: 'History' },
          ].map(({ k, l }) => (
            <button
              key={k}
              onClick={() => doSetTab(k)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '14px 16px', fontSize: 13, fontWeight: tab === k ? 700 : 500,
                color: tab === k ? C.accent : C.inkSoft,
                borderBottom: tab === k ? `2.5px solid ${C.accent}` : '2.5px solid transparent',
                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7,
                marginBottom: -1,
              }}
            >
              {l}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 22, height: 20, borderRadius: 20, padding: '0 6px',
                fontSize: 11, fontWeight: 700,
                background: tab === k ? C.accentSoft : C.lineSoft,
                color: tab === k ? C.accent : C.inkFaint,
              }}>{counts[k]}</span>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          flexWrap: 'wrap', borderBottom: `1px solid ${C.lineSoft}`,
        }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint, pointerEvents: 'none' }}/>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Cari SP, customer, produk…"
              style={{
                width: '100%', height: 36, paddingLeft: 34, paddingRight: 12, boxSizing: 'border-box',
                border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface2,
                fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
          <select
            value={filterCustomer}
            onChange={e => { setFilterCustomer(e.target.value); setPage(1); }}
            style={{ height: 36, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface2, fontSize: 13, color: C.ink, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
          >
            <option value="all">Semua Customer</option>
            {customerNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select
            value={filterDC}
            onChange={e => { setFilterDC(e.target.value); setPage(1); }}
            style={{ height: 36, padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface2, fontSize: 13, color: C.ink, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
          >
            <option value="all">Semua DC</option>
            {dcList.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.inkSoft, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={filterOverdue}
              onChange={e => { setFilterOverdue(e.target.checked); setPage(1); }}
              style={{ accentColor: C.danger, cursor: 'pointer' }}
            />
            Overdue only
          </label>
          <div style={{ flex: 1 }}/>
          <button
            onClick={onExport}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px',
              border: `1px solid ${C.line}`, borderRadius: 8, background: C.surface2,
              fontSize: 13, fontWeight: 600, color: C.inkSoft, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Download size={14}/> Export CSV
          </button>
        </div>

        {/* Bulk bar */}
        {selectedNos.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
            background: C.accentSoft, borderBottom: `1px solid ${C.okBd}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              <b>{selectedNos.size}</b> SP dipilih
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  const n = selectedNos.size;
                  setSelectedNos(new Set());
                  // TODO: needs sp_items.status migration
                  showToast(`Konfirmasi ${n} SP terpilih ✓`, 'success');
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Check size={14}/> Konfirmasi Selected
              </button>
              <button
                onClick={onExport}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Download size={14}/> Export
              </button>
              <button
                onClick={() => setSelectedNos(new Set())}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.inkFaint, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <X size={14}/>
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '11px 14px', background: C.surface2, width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={e => toggleAll(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <Th k="spDate"      sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('spDate')}>SP Date</Th>
                <Th>No SP</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th k="totalQty"    sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('totalQty')} right>Total QTY</Th>
                <Th k="outstanding" sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('outstanding')} right>Outstanding</Th>
                <Th>Status</Th>
                <Th>DC</Th>
                <Th k="expired_date" sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('expired_date')}>Expired Date</Th>
                <Th k="grandTotal"  sortK={sortK} sortDir={sortDir} onClick={() => toggleSort('grandTotal')} right>Grand Total</Th>
                <Th>Finance Progress</Th>
                <Th sx={{ width: 160, textAlign: 'right' }}>Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '56px 24px', color: C.inkFaint, fontSize: 13 }}>
                    Tidak ada SP yang cocok dengan filter ini
                  </td>
                </tr>
              )}
              {paged.map(g => {
                const days    = daysFromToday(g.expired_date || g.deadline);
                const dueSoon = days !== null && days < 2;
                return (
                  <tr
                    key={g.spNo}
                    style={{ borderTop: `1px solid ${C.lineSoft}`, background: g.isOverdue ? '#FFF0EE' : C.surface }}
                    onMouseEnter={e => { if (!g.isOverdue) e.currentTarget.style.background = C.surface2; }}
                    onMouseLeave={e => { e.currentTarget.style.background = g.isOverdue ? '#FFF0EE' : C.surface; }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '12px 14px', width: 40 }}>
                      <input
                        type="checkbox"
                        checked={selectedNos.has(g.spNo)}
                        onChange={() => toggleRow(g.spNo)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    {/* SP Date */}
                    <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.inkSoft, whiteSpace: 'nowrap' }}>
                      {fmtDate(g.spDate)}
                    </td>
                    {/* No SP — clickable */}
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => onSelectSP(g.spNo)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 700,
                          color: C.accent, textDecoration: 'underline', textDecorationStyle: 'dotted',
                          textDecorationColor: C.okBd,
                        }}
                      >
                        {g.spNo}
                      </button>
                    </td>
                    {/* Customer */}
                    <td style={{ padding: '12px 14px' }}><CustPill name={g.customer}/></td>
                    {/* Items */}
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: C.inkSoft }}>
                      {g.itemCount} produk
                    </td>
                    {/* Total QTY */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {(g.totalQty || 0).toLocaleString('id-ID')}
                    </td>
                    {/* Outstanding */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: g.totalOutstanding > 0 ? C.danger : C.inkFaint }}>
                      {g.totalOutstanding > 0
                        ? g.totalOutstanding.toLocaleString('id-ID')
                        : <span style={{ color: C.inkFaint, fontWeight: 400 }}>0</span>}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}><StatusBadge st={g.dstatus}/></td>
                    {/* DC */}
                    <td style={{ padding: '12px 14px', fontSize: 12.5, color: C.inkSoft }}>
                      {g.dc || '—'}
                    </td>
                    {/* Expired Date */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {(g.expired_date || g.deadline)
                        ? <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: dueSoon ? 700 : 400, color: dueSoon ? C.danger : C.inkSoft }}>{fmtDate(g.expired_date || g.deadline)}</span>
                        : <span style={{ color: C.inkFaint }}>—</span>}
                    </td>
                    {/* Grand Total */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {rp(g.grandTotal)}
                    </td>
                    {/* Finance Progress */}
                    <td style={{ padding: '12px 14px' }}>
                      <FinBar pct={Math.round(g.financePct || 0)}/>
                    </td>
                    {/* Aksi */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AksiCell
                        dstatus={g.dstatus}
                        onConfirm={() => openModal(g.spNo, 'confirm')}
                        onReject={() => openModal(g.spNo, 'reject')}
                        onManifest={() => handleManifest(g.spNo)}
                        onDetail={() => onSelectSP(g.spNo)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        {sorted.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: `1px solid ${C.lineSoft}`,
            fontSize: 13, color: C.inkSoft, flexWrap: 'wrap', gap: 10,
          }}>
            <span>
              Menampilkan{' '}
              <b style={{ color: C.ink }}>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)}</b>
              {' '}dari <b style={{ color: C.ink }}>{sorted.length}</b> SP
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <PagerBtn disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>‹</PagerBtn>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => (
                <PagerBtn key={i + 1} active={i + 1 === safePage} onClick={() => setPage(i + 1)}>{i + 1}</PagerBtn>
              ))}
              {totalPages > 5 && safePage < totalPages && (
                <>
                  <span style={{ padding: '0 4px', color: C.inkFaint }}>…</span>
                  <PagerBtn active={safePage === totalPages} onClick={() => setPage(totalPages)}>{totalPages}</PagerBtn>
                </>
              )}
              <PagerBtn disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>›</PagerBtn>
            </div>
          </div>
        )}
      </div>

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
