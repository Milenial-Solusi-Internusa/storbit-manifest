// src/modules/assets/pages/AssetITPage.jsx
// IT Equipment list page — faithful implementation of assets-it.html design.
// Data from Supabase via useITAssets hook.
// Design: warm cream #F6EFE3 background, GLPI-dense table, company badges.

import { useState, useCallback } from 'react';
import {
  Search, Download, Plus, ChevronDown,
  ChevronLeft, ChevronRight, Eye, Pencil, MoreHorizontal, Shield,
  Laptop, Server, Printer, Users, X, Car, Wrench, Archive, ArrowRightLeft,
  Monitor, Network, Package, Plug,
} from 'lucide-react';
import {
  useITAssets, ASSETS_PAGE_SIZE, ASSET_STATUS_CONFIG,
} from '../../../hooks/useAssets';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../contexts/useAuth';

// ─────────────────────────────────────────────────────────────
// Design tokens (from design spec)
// ─────────────────────────────────────────────────────────────
const D = {
  bg:         '#F6EFE3',
  bgAlt:      '#EFE6D4',
  surface:    '#FFFDF8',
  surface2:   '#FBF6EC',
  ink:        '#23291E',
  inkSoft:    '#5E6553',
  inkFaint:   '#8A8E7C',
  line:       '#E7DCC8',
  lineSoft:   '#F0E7D6',
  accent:     '#E85A1E',
  accentInk:  '#235031',
  accentSoft: '#FEF2EC',
  ok:      '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:    '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:  '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:    '#2A5B8C', infoBg:'#E1ECF5', infoBd:'#BAD2E6',
  neutral: '#6B6F5E', neutralBg:'#EEE9DC', neutralBd:'#DDD3BE',
  msi:  '#E85A1E', msiBg:'#FEF2EC',
  jci:  '#2A5B8C', jciBg:'#E1ECF5',
  sbi:  '#9A5B2C', sbiBg:'#F4E7D8',
  shadow: '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm: '0 1px 2px rgba(40,34,18,.06)',
};

// ─────────────────────────────────────────────────────────────
// Avatar colours (consistent per name initial)
// ─────────────────────────────────────────────────────────────
const AV_COLORS = ['#E85A1E','#2A5B8C','#9A5B2C','#6B6F5E','#7A4E8C','#1F6B6B'];
const initials = (name) =>
  (name || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatarColor = (name) =>
  AV_COLORS[initials(name).charCodeAt(0) % AV_COLORS.length];

// ─────────────────────────────────────────────────────────────
// Subtype → icon component
// ─────────────────────────────────────────────────────────────
const SUBTYPE_ICON = {
  laptop:     Laptop,
  desktop:    Monitor,
  server:     Server,
  printer:    Printer,
  network:    Network,
  peripheral: Plug,
  other:      Package,
};

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────
const fmtRupiah = (n) => {
  if (!n) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
function CoBadge({ code }) {
  if (!code) return null;
  const co = code.toLowerCase();
  const cfg = {
    msi: [D.msiBg, D.msi],
    jci: [D.jciBg, D.jci],
    sbi: [D.sbiBg, D.sbi],
  };
  const [bg, color] = cfg[co] || [D.neutralBg, D.neutral];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 6, background: bg, color,
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '.3px',
    }}>
      {code.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = ASSET_STATUS_CONFIG[status] || { label: status, type: 'neutral' };
  const colorMap = {
    ok:      { bg: D.okBg,      color: D.ok,      bd: D.okBd      },
    warn:    { bg: D.warnBg,    color: D.warn,     bd: D.warnBd    },
    danger:  { bg: D.dangerBg,  color: D.danger,   bd: D.dangerBd  },
    info:    { bg: D.infoBg,    color: D.info,     bd: D.infoBd    },
    neutral: { bg: D.neutralBg, color: D.neutral,  bd: D.neutralBd },
  };
  const { bg, color, bd } = colorMap[cfg.type] || colorMap.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 600, padding: '3px 9px',
      borderRadius: 20, border: `1px solid ${bd}`,
      background: bg, color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  const toneMap = {
    ok:      { ic: { background: D.okBg,      color: D.ok      } },
    warn:    { ic: { background: D.warnBg,    color: D.warn    } },
    default: { ic: { background: D.accentSoft, color: D.accent } },
  };
  const icStyle = (toneMap[tone] || toneMap.default).ic;
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.line}`,
      borderRadius: 10, padding: '13px 15px', boxShadow: D.shadowSm,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600 }}>{label}</span>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', ...icStyle,
        }}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -1, lineHeight: 1, color: D.ink }}>
        {value}
      </div>
    </div>
  );
}

function Btn({ children, primary, small, onClick, disabled, icon: Icon, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: small ? 6 : 7,
        height: small ? 34 : 38, padding: small ? '0 11px' : '0 15px',
        borderRadius: small ? 8 : 9, fontSize: small ? 12.5 : 13,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap', fontFamily: 'inherit',
        border: `1px solid ${primary ? D.accent : danger ? D.dangerBd : D.line}`,
        background: primary ? D.accent : danger ? D.dangerBg : D.surface,
        color: primary ? '#fff' : danger ? D.danger : D.ink,
        opacity: disabled ? .45 : 1,
      }}
    >
      {Icon && <Icon size={small ? 14 : 16} strokeWidth={1.9} />}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Table header cell
// ─────────────────────────────────────────────────────────────
const TH = ({ children, right, style: s }) => (
  <th style={{
    textAlign: right ? 'right' : 'left',
    fontSize: 11, fontWeight: 700, letterSpacing: '.5px',
    textTransform: 'uppercase', color: D.inkFaint,
    padding: '10px 14px', borderBottom: `1px solid ${D.line}`,
    background: D.surface2, whiteSpace: 'nowrap',
    ...s,
  }}>
    {children}
  </th>
);

const TD = ({ children, style: s, right }) => (
  <td style={{
    padding: '9px 14px', borderBottom: `1px solid ${D.lineSoft}`,
    verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: 13,
    textAlign: right ? 'right' : 'left',
    ...s,
  }}>
    {children}
  </td>
);

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: null,       label: 'Semua Status' },
  { value: 'active',   label: 'Aktif'        },
  { value: 'in_repair',label: 'Maintenance'  },
  { value: 'retired',  label: 'Rusak'        },
  { value: 'disposed', label: 'Disposed'     },
];

// Category metadata — title, subtitle, stat card config
const CATEGORY_META = {
  'IT-EQP': {
    title:    'IT Equipment',
    crumb:    'IT Equipment',
    subtitle: (total) => `Komputer, laptop, server & periferal · ${total} aset terdaftar`,
    stats: (counts) => [
      { label: 'Laptop & Desktop',    value: counts.a, icon: Laptop  },
      { label: 'Server & Network',    value: counts.b, icon: Server  },
      { label: 'Printer & Periferal', value: counts.c, icon: Printer },
      { label: 'Garansi Akan Habis',  value: counts.d, icon: Shield, tone: 'warn' },
    ],
  },
  'VEH': {
    title:    'Kendaraan',
    crumb:    'Kendaraan',
    subtitle: (total) => `Armada kendaraan operasional · ${total} unit terdaftar`,
    stats: (counts) => [
      { label: 'Total Aktif',     value: counts.a, icon: Car              },
      { label: 'Maintenance',     value: counts.b, icon: Wrench, tone: 'warn' },
      { label: 'Rusak / Disposed',value: counts.c, icon: Archive          },
      { label: 'Dialihkan',       value: counts.d, icon: ArrowRightLeft   },
    ],
  },
  'FURN': {
    title:    'Furniture & Office',
    crumb:    'Furniture & Office',
    subtitle: (total) => `Furniture dan peralatan kantor · ${total} aset terdaftar`,
    stats: (counts) => [
      { label: 'Total Aktif',     value: counts.a, icon: Package           },
      { label: 'Maintenance',     value: counts.b, icon: Wrench, tone: 'warn' },
      { label: 'Rusak / Disposed',value: counts.c, icon: Archive           },
      { label: 'Dialihkan',       value: counts.d, icon: ArrowRightLeft    },
    ],
  },
  'BLDG': {
    title:    'Properti',
    crumb:    'Properti',
    subtitle: (total) => `Gedung, ruko, dan aset properti · ${total} aset terdaftar`,
    stats: (counts) => [
      { label: 'Total Aktif',     value: counts.a, icon: Package           },
      { label: 'Maintenance',     value: counts.b, icon: Wrench, tone: 'warn' },
      { label: 'Rusak / Disposed',value: counts.c, icon: Archive           },
      { label: 'Dialihkan',       value: counts.d, icon: ArrowRightLeft    },
    ],
  },
};

export default function AssetITPage({ onSelectAsset, onAddAsset, categoryCode = 'IT-EQP' }) {
  useAuth();

  const [rawSearch, setRawSearch]         = useState('');
  const [page, setPage]                   = useState(1);
  const [companyFilter, setCompanyFilter] = useState(null);
  const [statusFilter, setStatusFilter]   = useState(null);
  const [selected, setSelected]           = useState(new Set());
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  const [showCoDrop, setShowCoDrop]         = useState(false);

  const search = useDebounce(rawSearch, 300);

  const handleSearch = useCallback((v) => { setRawSearch(v); setPage(1); }, []);
  const handleCompany = useCallback((co) => { setCompanyFilter(co); setPage(1); setShowCoDrop(false); }, []);
  const handleStatus  = useCallback((s)  => { setStatusFilter(s);  setPage(1); setShowStatusDrop(false); }, []);

  const { data, total, counts, loading, error } = useITAssets({
    page, search, companyId: companyFilter, statusFilter, categoryCode,
  });

  const meta = CATEGORY_META[categoryCode] || CATEGORY_META['IT-EQP'];

  const totalPages = Math.ceil(total / ASSETS_PAGE_SIZE);

  // Selection
  const toggleRow = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    if (selected.size === data.length) setSelected(new Set());
    else setSelected(new Set(data.map(r => r.id)));
  }, [data, selected]);
  const clearSel = useCallback(() => setSelected(new Set()), []);

  // Company display for filter button
  const coLabel = companyFilter ? (data[0]?.companies?.code || 'Company') : 'Semua Company';

  const thStyle = { position: 'sticky', top: 0, zIndex: 1 };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: D.inkFaint, marginBottom: 9 }}>
            <span>Home</span>
            <span>›</span>
            <span>Assets</span>
            <span>›</span>
            <span style={{ color: D.inkSoft, fontWeight: 600 }}>{meta.crumb}</span>
          </nav>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.5px', margin: 0, lineHeight: 1.1 }}>
            {meta.title}
          </h1>
          <div style={{ color: D.inkSoft, fontSize: 13.5, marginTop: 4 }}>
            {meta.subtitle(total)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Btn icon={Download}>Export</Btn>
          <Btn icon={Plus} primary onClick={onAddAsset}>Tambah Aset</Btn>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        {meta.stats(counts).map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      {/* ── Main card ── */}
      <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 10, boxShadow: D.shadowSm }}>

        {/* Action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px', borderBottom: `1px solid ${D.lineSoft}`,
          flexWrap: 'wrap',
        }}>
          {/* Search */}
          <div style={{ position: 'relative', minWidth: 230 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: D.inkFaint }} />
            <input
              value={rawSearch}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Cari kode, nama, serial number…"
              style={{
                height: 36, width: '100%', borderRadius: 8,
                border: `1px solid ${D.line}`, background: D.surface2,
                padding: '0 11px 0 32px', fontSize: 13, fontFamily: 'inherit', color: D.ink,
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = D.accent}
              onBlur={e => e.target.style.borderColor = D.line}
            />
          </div>

          {/* Company filter */}
          <div style={{ position: 'relative' }}>
            <Btn small icon={ChevronDown} onClick={() => setShowCoDrop(v => !v)}>
              {companyFilter ? <CoBadge code={coLabel} /> : 'Semua Company'}
            </Btn>
            {showCoDrop && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                background: D.surface, border: `1px solid ${D.line}`, borderRadius: 10,
                boxShadow: D.shadow, minWidth: 160, overflow: 'hidden',
              }}>
                {[null, 'msi', 'jci', 'sbi'].map(co => (
                  <button
                    key={co || 'all'}
                    onClick={() => handleCompany(co === 'all' ? null : co)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '9px 14px', background: 'none', border: 0,
                      cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                      color: D.ink,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = D.bgAlt}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {co ? <CoBadge code={co.toUpperCase()} /> : 'Semua Company'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status filter */}
          <div style={{ position: 'relative' }}>
            <Btn small icon={ChevronDown} onClick={() => setShowStatusDrop(v => !v)}>
              {statusFilter ? ASSET_STATUS_CONFIG[statusFilter]?.label || statusFilter : 'Status: Semua'}
            </Btn>
            {showStatusDrop && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                background: D.surface, border: `1px solid ${D.line}`, borderRadius: 10,
                boxShadow: D.shadow, minWidth: 160, overflow: 'hidden',
              }}>
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value || 'all'}
                    onClick={() => handleStatus(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '9px 14px', background: 'none', border: 0,
                      cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                      color: D.ink,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = D.bgAlt}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    {opt.value ? <StatusBadge status={opt.value} /> : opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />
          {!loading && (
            <span style={{ fontSize: 12.5, color: D.inkFaint }}>
              Menampilkan {Math.min((page - 1) * ASSETS_PAGE_SIZE + 1, total)}–{Math.min(page * ASSETS_PAGE_SIZE, total)} dari {total}
            </span>
          )}
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            background: D.accentSoft, borderBottom: `1px solid ${D.okBd}`,
            fontSize: 13, color: D.accentInk, fontWeight: 600,
          }}>
            <span><b>{selected.size}</b> aset dipilih</span>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <Btn small icon={Users}>Assign</Btn>
              <Btn small icon={Download}>Export</Btn>
              <Btn small icon={X} onClick={clearSel} />
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          {loading && (
            <div style={{ padding: '3rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
              Memuat data…
            </div>
          )}
          {!loading && error && (
            <div style={{ padding: '2rem', textAlign: 'center', color: D.danger, fontSize: 13 }}>
              Gagal memuat data: {error.message}
            </div>
          )}
          {!loading && !error && data.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
              Tidak ada aset ditemukan.
            </div>
          )}
          {!loading && !error && data.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <TH style={{ ...thStyle, width: 34 }}>
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === data.length}
                      onChange={toggleAll}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: D.accent }}
                    />
                  </TH>
                  <TH style={thStyle}>Asset Code</TH>
                  <TH style={thStyle}>Name</TH>
                  <TH style={thStyle}>Model</TH>
                  <TH style={thStyle}>Serial Number</TH>
                  <TH style={thStyle}>Assigned To</TH>
                  <TH style={thStyle}>Lokasi</TH>
                  <TH style={thStyle}>Status</TH>
                  <TH style={{ ...thStyle, textAlign: 'right' }}>Nilai Perolehan</TH>
                  <TH style={thStyle}>Tgl Perolehan</TH>
                  <TH style={{ ...thStyle, width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const isSelected = selected.has(row.id);
                  const TypeIcon = SUBTYPE_ICON[row.asset_subtype] || Package;
                  return (
                    <tr
                      key={row.id}
                      style={{ background: isSelected ? D.accentSoft : 'transparent', cursor: 'pointer' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = D.surface2; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => onSelectAsset && onSelectAsset(row.id)}
                    >
                      <TD>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: D.accent }}
                          onClick={e => e.stopPropagation()}
                        />
                      </TD>
                      <TD>
                        <span style={{
                          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                          color: D.accentInk, fontWeight: 500,
                        }}>
                          {row.asset_code || row.asset_no}
                        </span>
                      </TD>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{
                            width: 30, height: 30, borderRadius: 7, background: D.bgAlt,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: D.inkSoft, flexShrink: 0,
                          }}>
                            <TypeIcon size={16} strokeWidth={1.7} />
                          </span>
                          <span style={{ fontWeight: 600, color: D.ink }}>{row.name}</span>
                        </div>
                      </TD>
                      <TD style={{ color: D.inkSoft }}>{row.model || '—'}</TD>
                      <TD style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12, color: D.inkFaint,
                      }}>
                        {row.serial_number || '—'}
                      </TD>
                      <TD>
                        {row.assigned_to_name ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: '#fff',
                              background: avatarColor(row.assigned_to_name),
                            }}>
                              {initials(row.assigned_to_name)}
                            </span>
                            <span style={{ color: D.inkSoft }}>{row.assigned_to_name}</span>
                          </div>
                        ) : '—'}
                      </TD>
                      <TD style={{ color: D.inkFaint, fontSize: 12 }}>
                        {row.asset_locations?.name || '—'}
                      </TD>
                      <TD><StatusBadge status={row.status} /></TD>
                      <TD right style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12.5,
                      }}>
                        {fmtRupiah(row.purchase_price)}
                      </TD>
                      <TD style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 12, color: D.inkFaint,
                      }}>
                        {fmtDate(row.purchase_date)}
                      </TD>
                      <TD>
                        {/* Row actions — appear on hover via parent tr */}
                        <div style={{ display: 'flex', gap: 2 }}>
                          {[
                            { Icon: Eye, title: 'Lihat' },
                            { Icon: Pencil, title: 'Edit' },
                            { Icon: MoreHorizontal, title: 'Lainnya' },
                          ].map(({ Icon, title }) => (
                            <button
                              key={title}
                              title={title}
                              style={{
                                width: 28, height: 28, borderRadius: 7, border: 0,
                                background: 'none', color: D.inkFaint,
                                cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = D.bgAlt; e.currentTarget.style.color = D.ink; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = D.inkFaint; }}
                              onClick={e => e.stopPropagation()}
                            >
                              <Icon size={15} strokeWidth={1.7} />
                            </button>
                          ))}
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 16px', fontSize: 12.5, color: D.inkSoft, flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Baris per halaman
              <select
                value={ASSETS_PAGE_SIZE}
                style={{
                  height: 32, borderRadius: 8, border: `1px solid ${D.line}`,
                  background: D.surface, padding: '0 8px',
                  fontFamily: 'inherit', fontSize: 12.5, color: D.ink,
                }}
              >
                <option>12</option>
                <option>25</option>
                <option>50</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  minWidth: 32, height: 32, borderRadius: 8, border: `1px solid ${D.line}`,
                  background: D.surface, color: D.inkSoft, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: page === 1 ? .4 : 1,
                }}
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  style={{
                    minWidth: 32, height: 32, borderRadius: 8,
                    border: `1px solid ${n === page ? D.accent : D.line}`,
                    background: n === page ? D.accent : D.surface,
                    color: n === page ? '#fff' : D.inkSoft,
                    cursor: 'pointer', fontWeight: 600, fontSize: 12.5,
                  }}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  minWidth: 32, height: 32, borderRadius: 8, border: `1px solid ${D.line}`,
                  background: D.surface, color: D.inkSoft, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: page === totalPages ? .4 : 1,
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
