// src/modules/assets/pages/AssetDetailPage.jsx
// Asset Detail — router + Kendaraan view.
// Routes to the correct detail page based on asset_categories.code:
//   IT-EQP  → AssetDetailITPage
//   VEH / * → this file (Kendaraan tabs)
//
// Design: asset-detail.html from the Nexus by MSI design bundle.
// No separate sidebar — AssetShell owns layout.
// Tabs: Info Dasar | Dokumen | Maintenance | Rute | BBM | History

import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  ChevronRight, Pencil, Copy, Trash2, MapPin, Users, Gauge,
  Car, Info, FileText, Wrench, Route, Fuel, History,
  AlertTriangle, FileX, CheckCircle2, Wallet,
  ArrowLeft, Cpu, Network, Package2, FileSignature,
} from 'lucide-react';
import { useAssetDetail, useFuelLogs, ASSET_STATUS_CONFIG } from '../../../hooks/useAssets';

const AssetDetailITPage = lazy(() => import('./AssetDetailITPage'));

// ─────────────────────────────────────────────────────────────
// Design tokens — matches existing AssetITPage / AssetDashboardPage
// ─────────────────────────────────────────────────────────────
const D = {
  bg:          '#F6EFE3',
  bgAlt:       '#EFE6D4',
  surface:     '#FFFDF8',
  surface2:    '#FBF6EC',
  ink:         '#23291E',
  inkSoft:     '#5E6553',
  inkFaint:    '#8A8E7C',
  line:        '#E7DCC8',
  lineSoft:    '#F0E7D6',
  accent:      '#2F6B3F',
  accentInk:   '#235031',
  accentSoft:  '#E7EFE2',
  ok:          '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:        '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:      '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:        '#2A5B8C', infoBg:'#E1ECF5', infoBd:'#BAD2E6',
  neutral:     '#6B6F5E', neutralBg:'#EEE9DC', neutralBd:'#DDD3BE',
  msi:         '#2F6B3F', msiBg:'#E7EFE2',
  jci:         '#2A5B8C', jciBg:'#E1ECF5',
  sbi:         '#9A5B2C', sbiBg:'#F4E7D8',
  shadow:      '0 2px 8px rgba(40,34,18,.07), 0 1px 2px rgba(40,34,18,.05)',
  shadowSm:    '0 1px 2px rgba(40,34,18,.06)',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const fmtRupiah = (n) => {
  if (n == null || n === '') return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const fmtDateShort = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtKm = (n) => {
  if (!n) return '—';
  return Number(n).toLocaleString('id-ID') + ' km';
};
const initials = (name) =>
  (name || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const AV_COLORS = ['#2F6B3F','#2A5B8C','#9A5B2C','#6B6F5E','#7A4E8C','#1F6B6B'];
const avatarColor = (name) =>
  AV_COLORS[(initials(name).charCodeAt(0) || 0) % AV_COLORS.length];

// ─────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = ASSET_STATUS_CONFIG[status] || { label: status, type: 'neutral' };
  const map = {
    ok:      { bg: D.okBg,      color: D.ok,      bd: D.okBd      },
    warn:    { bg: D.warnBg,    color: D.warn,     bd: D.warnBd    },
    danger:  { bg: D.dangerBg,  color: D.danger,   bd: D.dangerBd  },
    info:    { bg: D.infoBg,    color: D.info,     bd: D.infoBd    },
    neutral: { bg: D.neutralBg, color: D.neutral,  bd: D.neutralBd },
  };
  const { bg, color, bd } = map[cfg.type] || map.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 600, padding: '3px 9px',
      borderRadius: 20, border: `1px solid ${bd}`, background: bg, color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// CoBadge
// ─────────────────────────────────────────────────────────────
function CoBadge({ code, name }) {
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
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 700, padding: '3px 9px',
      borderRadius: 6, background: bg, color,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {code.toUpperCase()}{name ? <span style={{ fontFamily: 'inherit', fontWeight: 500 }}>· {name}</span> : null}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Pill badge (location, user, km)
// ─────────────────────────────────────────────────────────────
function Pill({ icon: Icon, children, mono }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12.5, fontWeight: 500, padding: '3px 9px',
      borderRadius: 6, background: D.neutralBg, color: D.neutral,
      border: `1px solid ${D.neutralBd}`,
      fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
    }}>
      {Icon && <Icon size={13} strokeWidth={1.8} />}
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Card wrapper
// ─────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: D.surface, border: `1px solid ${D.line}`,
      borderRadius: 10, boxShadow: D.shadowSm, ...style,
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Action button
// ─────────────────────────────────────────────────────────────
function Btn({ icon: Icon, children, danger, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    height: 36, padding: '0 14px', borderRadius: 8, fontSize: 13,
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${danger ? D.dangerBd : D.line}`,
    background: danger
      ? (hover ? D.dangerBg : D.surface)
      : (hover ? D.bgAlt : D.surface),
    color: danger ? D.danger : D.inkSoft,
    opacity: disabled ? .5 : 1,
    transition: 'background .12s',
    fontFamily: 'inherit',
  };
  return (
    <button style={base} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {Icon && <Icon size={14} strokeWidth={1.8} />}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Def-list row
// ─────────────────────────────────────────────────────────────
function Def({ label, value, mono, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 1fr',
      padding: '8px 0', borderBottom: `1px solid ${D.lineSoft}`,
      alignItems: 'start', gap: 12,
    }}>
      <dt style={{ fontSize: 12.5, color: D.inkFaint, fontWeight: 600, paddingTop: 1 }}>{label}</dt>
      <dd style={{
        margin: 0, fontSize: 13.5, color: D.ink, fontWeight: 500,
        fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
      }}>
        {children ?? (value ?? '—')}
      </dd>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '.6px', color: D.inkFaint, padding: '14px 0 6px',
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Photo placeholder
// ─────────────────────────────────────────────────────────────
function PhotoPlaceholder() {
  return (
    <div style={{
      width: 104, height: 74, borderRadius: 11, flexShrink: 0,
      background: D.bgAlt, border: `1px solid ${D.line}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <svg viewBox="0 0 100 70" width="104" height="74">
        <defs>
          <pattern id="pg" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" stroke="#d9cbb1" strokeWidth="3" />
          </pattern>
        </defs>
        <rect width="100" height="70" fill="url(#pg)" opacity=".5" />
        <Car x="35" y="22" width="30" height="26" color="#b0a894" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stat card (BBM tab)
// ─────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub, mono }) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600 }}>{label}</span>
        <span style={{
          width: 30, height: 30, borderRadius: 8, background: D.accentSoft,
          color: D.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {Icon && <Icon size={15} strokeWidth={1.8} />}
        </span>
      </div>
      <div style={{
        fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: D.ink,
        fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: D.inkFaint, marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline item (Maintenance + History)
// ─────────────────────────────────────────────────────────────
function TlItem({ title, date, desc, meta, warn, muted }) {
  const dotColor = warn ? D.warn : (muted ? D.neutralBd : D.accent);
  return (
    <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
      {/* vertical line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
          background: dotColor, border: `2px solid ${D.surface}`,
          boxShadow: `0 0 0 2px ${dotColor}`,
        }} />
        <div style={{ flex: 1, width: 1, background: D.lineSoft, minHeight: 14 }} />
      </div>
      <div style={{
        flex: 1, background: D.surface2, border: `1px solid ${D.lineSoft}`,
        borderRadius: 8, padding: '10px 12px', marginBottom: 10,
        opacity: muted ? .75 : 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: D.ink }}>{title}</span>
          <span style={{ fontSize: 11.5, color: D.inkFaint, whiteSpace: 'nowrap' }}>{date}</span>
        </div>
        {desc && <div style={{ fontSize: 12.5, color: D.inkSoft, lineHeight: 1.55 }}>{desc}</div>}
        {meta && (
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            {meta.map((m, i) => (
              <span key={i} style={{ fontSize: 12, color: D.inkFaint }}>{m}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Document card (Dokumen tab)
// ─────────────────────────────────────────────────────────────
function DocCard({ title, docNo, status, rows, tone }) {
  const toneMap = {
    ok:      { bg: D.okBg,      bd: D.okBd,      ic: D.ok,      IconC: CheckCircle2 },
    warn:    { bg: D.warnBg,    bd: D.warnBd,    ic: D.warn,    IconC: AlertTriangle },
    danger:  { bg: D.dangerBg,  bd: D.dangerBd,  ic: D.danger,  IconC: FileX        },
    neutral: { bg: D.neutralBg, bd: D.neutralBd, ic: D.neutral, IconC: FileText      },
  };
  const t = toneMap[tone] || toneMap.neutral;
  const badgeCfg = {
    ok:      { bg: D.okBg,      color: D.ok,      bd: D.okBd      },
    warn:    { bg: D.warnBg,    color: D.warn,     bd: D.warnBd    },
    danger:  { bg: D.dangerBg,  color: D.danger,   bd: D.dangerBd  },
    neutral: { bg: D.neutralBg, color: D.neutral,  bd: D.neutralBd },
  };
  const bc = badgeCfg[tone] || badgeCfg.neutral;
  return (
    <Card style={{ overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
        borderBottom: `1px solid ${D.lineSoft}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: t.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <t.IconC size={17} strokeWidth={1.8} color={t.ic} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: D.ink }}>{title}</div>
          <div style={{ fontSize: 11.5, color: D.inkFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{docNo}</div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
          border: `1px solid ${bc.bd}`, background: bc.bg, color: bc.color,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: bc.color }} />
          {status}
        </span>
      </div>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
            <span style={{ color: D.inkFaint }}>{r.k}</span>
            <span style={{ color: r.accent ? D.accent : D.ink, fontWeight: 500, textAlign: 'right' }}>{r.v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Banner (warning / info strip)
// ─────────────────────────────────────────────────────────────
function Banner({ tone = 'warn', icon: Icon = AlertTriangle, children }) {
  const map = {
    warn:   { bg: D.warnBg, bd: D.warnBd, ic: D.warn },
    danger: { bg: D.dangerBg, bd: D.dangerBd, ic: D.danger },
    info:   { bg: D.infoBg, bd: D.infoBd, ic: D.info },
  };
  const t = map[tone] || map.warn;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 8,
      background: t.bg, border: `1px solid ${t.bd}`,
      fontSize: 13, color: D.ink,
    }}>
      <Icon size={15} strokeWidth={2} color={t.ic} style={{ marginTop: 1, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────
function Skeleton({ h = 16, w = '100%', style }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6,
      background: `linear-gradient(90deg, ${D.bgAlt} 25%, ${D.lineSoft} 50%, ${D.bgAlt} 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
      ...style,
    }} />
  );
}

// ─────────────────────────────────────────────────────────────
// TABS — per-category configuration
// ─────────────────────────────────────────────────────────────
const TABS_BY_CATEGORY = {
  'VEH': [
    { id: 'info',  label: 'Info Dasar',  icon: Info     },
    { id: 'dok',   label: 'Dokumen',     icon: FileText },
    { id: 'mtc',   label: 'Maintenance', icon: Wrench   },
    { id: 'rute',  label: 'Rute',        icon: Route    },
    { id: 'bbm',   label: 'BBM',         icon: Fuel     },
    { id: 'hist',  label: 'History',     icon: History  },
  ],
  'IT-EQP': [
    { id: 'info',     label: 'Info Dasar',   icon: Info     },
    { id: 'spec',     label: 'Spesifikasi',  icon: Cpu      },
    { id: 'network',  label: 'Network',      icon: Network  },
    { id: 'software', label: 'Software',     icon: Package2 },
    { id: 'mtc',      label: 'Maintenance',  icon: Wrench   },
    { id: 'hist',     label: 'History',      icon: History  },
  ],
  'FURN': [
    { id: 'info', label: 'Info Dasar',  icon: Info     },
    { id: 'dok',  label: 'Dokumen',     icon: FileText },
    { id: 'mtc',  label: 'Maintenance', icon: Wrench   },
    { id: 'hist', label: 'History',     icon: History  },
  ],
  'BLDG': [
    { id: 'info',    label: 'Info Dasar',  icon: Info          },
    { id: 'dok',     label: 'Dokumen',     icon: FileText      },
    { id: 'kontrak', label: 'Kontrak',     icon: FileSignature },
    { id: 'mtc',     label: 'Maintenance', icon: Wrench        },
    { id: 'hist',    label: 'History',     icon: History       },
  ],
  // default — used for unknown/uncategorised assets
  '_default': [
    { id: 'info', label: 'Info Dasar',  icon: Info     },
    { id: 'dok',  label: 'Dokumen',     icon: FileText },
    { id: 'mtc',  label: 'Maintenance', icon: Wrench   },
    { id: 'hist', label: 'History',     icon: History  },
  ],
};

// ─────────────────────────────────────────────────────────────
// BBM tab helpers — compute stats from fuel log rows
// ─────────────────────────────────────────────────────────────
function computeFuelStats(logs) {
  if (!logs.length) return { avgKmPerL: null, totalLiters: 0, totalCost: 0 };
  const totalLiters = logs.reduce((s, r) => s + Number(r.liters), 0);
  const totalCost   = logs.reduce((s, r) => s + Number(r.total_cost || (r.liters * r.price_per_liter)), 0);

  // Average consumption: use odometer delta between consecutive fills
  const sorted = [...logs].sort((a, b) => new Date(a.fill_date) - new Date(b.fill_date));
  let kmTotal = 0, filledLiters = 0;
  for (let i = 1; i < sorted.length; i++) {
    const km = sorted[i].odometer - sorted[i - 1].odometer;
    if (km > 0) {
      kmTotal     += km;
      filledLiters += Number(sorted[i].liters);
    }
  }
  const avgKmPerL = filledLiters > 0 ? (kmTotal / filledLiters).toFixed(1) : null;
  return { avgKmPerL, totalLiters: Math.round(totalLiters), totalCost };
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function AssetDetailPage({ id, onBack }) {
  const [activeTab, setActiveTab] = useState('info');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: asset, loading, error, softDelete } = useAssetDetail({ id });
  const { data: fuelLogs, loading: fuelLoading } = useFuelLogs({ assetId: id });

  // Derive tab set from asset's category code; reset to 'info' when asset changes.
  const catCode = asset?.asset_categories?.code || '_default';
  const tabs = TABS_BY_CATEGORY[catCode] || TABS_BY_CATEGORY['_default'];

  useEffect(() => {
    Promise.resolve().then(() => setActiveTab('info'));
  }, [catCode]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    const { error: err } = await softDelete();
    if (!err && onBack) onBack();
    setDeleteConfirm(false);
  }, [deleteConfirm, softDelete, onBack]);

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton h={14} w={280} />
          <Skeleton h={28} w={200} />
        </div>
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
            <Skeleton h={74} w={104} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skeleton h={22} w={220} />
              <Skeleton h={16} w={340} />
              <Skeleton h={14} w={280} />
            </div>
            <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <Skeleton h={12} w={90} />
              <Skeleton h={28} w={150} />
              <Skeleton h={12} w={110} />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Error state ──
  if (error || !asset) {
    return (
      <div style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        padding: '3rem', textAlign: 'center', color: D.danger, fontSize: 14,
      }}>
        {error ? `Gagal memuat aset: ${error.message}` : 'Aset tidak ditemukan.'}
      </div>
    );
  }

  // ── Route IT-EQP assets to dedicated IT detail page ──
  if (asset.asset_categories?.code === 'IT-EQP') {
    return (
      <Suspense fallback={
        <div style={{ padding: '3rem', textAlign: 'center', color: '#9C948D', fontSize: 13 }}>Loading…</div>
      }>
        <AssetDetailITPage id={id} asset={asset} onBack={onBack} />
      </Suspense>
    );
  }

  const coName = asset.companies?.name;
  const fuelStats = computeFuelStats(fuelLogs);

  // Compute book value fallback: purchase_price - accumulated_depreciation
  const bookValue = asset.book_value ?? (asset.purchase_price - (asset.accumulated_depreciation || 0));

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: D.ink }}>
      <style>{`
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .ad-tab{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:none;
          background:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;
          color:#5E6553;border-bottom:2px solid transparent;transition:color .12s;white-space:nowrap}
        .ad-tab:hover{color:#23291E}
        .ad-tab.active{color:#2F6B3F;border-bottom-color:#2F6B3F}
        .ad-tbl th{text-align:left;padding:9px 12px;font-size:11.5px;font-weight:700;
          text-transform:uppercase;letter-spacing:.4px;color:#8A8E7C;
          border-bottom:1px solid #E7DCC8;background:#FFFDF8;white-space:nowrap}
        .ad-tbl td{padding:9px 12px;font-size:13px;border-bottom:1px solid #F0E7D6;color:#23291E}
        .ad-tbl tr:last-child td{border-bottom:none}
        .ad-tbl tr:hover td{background:#FBF6EC}
        .col-r{text-align:right}
      `}</style>

      {/* ── Breadcrumb + actions ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: D.inkFaint, marginBottom: 8 }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: D.inkFaint, fontFamily: 'inherit', fontSize: 12.5, padding: 0,
                }}
              >
                <ArrowLeft size={13} />
              </button>
            )}
            <span style={{ cursor: 'pointer', color: D.inkFaint }}>Home</span>
            <ChevronRight size={12} />
            <span style={{ cursor: 'pointer', color: D.inkFaint }}>Assets</span>
            <ChevronRight size={12} />
            <span style={{ cursor: 'pointer', color: D.inkFaint }}>Kendaraan</span>
            <ChevronRight size={12} />
            <span style={{ color: D.inkSoft, fontWeight: 600 }}>
              {asset.plate_number || asset.asset_code || asset.asset_no}
            </span>
          </nav>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', margin: 0, lineHeight: 1.1 }}>
            Detail Kendaraan
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn icon={Pencil}>Edit</Btn>
          <Btn icon={Copy}>Clone</Btn>
          <Btn icon={Trash2} danger onClick={handleDelete}>
            {deleteConfirm ? 'Yakin hapus?' : 'Delete'}
          </Btn>
          {deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(false)}
              style={{
                height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${D.line}`,
                background: D.surface, cursor: 'pointer', fontSize: 12, color: D.inkSoft,
                fontFamily: 'inherit',
              }}
            >
              Batal
            </button>
          )}
        </div>
      </div>

      {/* ── Header card ── */}
      <Card style={{ marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <PhotoPlaceholder />

            <div style={{ flex: 1, minWidth: 220 }}>
              {/* Plate + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 18,
                  fontWeight: 700, color: D.ink, letterSpacing: '.5px',
                }}>
                  {asset.plate_number || asset.asset_code || asset.asset_no}
                </span>
                <StatusBadge status={asset.status} />
              </div>

              {/* Name */}
              <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: D.ink }}>
                {asset.name}
                {asset.model && asset.model !== asset.name && (
                  <span style={{ fontWeight: 500, color: D.inkSoft }}> · {asset.model}</span>
                )}
              </h2>

              {/* Type / year / color tags */}
              {(asset.asset_categories?.name || asset.manufacture_year || asset.color) && (
                <div style={{ fontSize: 13, color: D.inkSoft, marginBottom: 10 }}>
                  {[
                    asset.asset_categories?.name,
                    asset.manufacture_year && `Tahun ${asset.manufacture_year}`,
                    asset.color && `Warna ${asset.color}`,
                  ].filter(Boolean).join(' · ')}
                </div>
              )}

              {/* Badges row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {asset.companies?.code && (
                  <CoBadge code={asset.companies.code} name={coName} />
                )}
                {asset.asset_locations?.name && (
                  <Pill icon={MapPin}>{asset.asset_locations.name}</Pill>
                )}
                {asset.assigned_to_name && (
                  <Pill icon={Users}>{asset.assigned_to_name}</Pill>
                )}
                {asset.km_odometer != null && (
                  <Pill icon={Gauge} mono>
                    {Number(asset.km_odometer).toLocaleString('id-ID')} km
                  </Pill>
                )}
              </div>
            </div>

            {/* Nilai Perolehan */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.5px', color: D.inkFaint, marginBottom: 3,
              }}>
                Nilai Perolehan
              </div>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 22,
                fontWeight: 600, letterSpacing: '-.5px', color: D.ink,
                whiteSpace: 'nowrap',
              }}>
                {fmtRupiah(asset.purchase_price)}
              </div>
              {asset.purchase_date && (
                <div style={{ fontSize: 12, color: D.inkFaint, marginTop: 2 }}>
                  Diperoleh {fmtDate(asset.purchase_date)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ borderTop: `1px solid ${D.lineSoft}`, overflowX: 'auto' }}>
          <div style={{ display: 'flex', padding: '0 20px', gap: 2 }}>
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  className={`ad-tab${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  <Icon size={14} strokeWidth={1.8} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ── Tab panels ── */}

      {/* INFO DASAR */}
      {activeTab === 'info' && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <dl style={{ margin: 0 }}>
            <SectionLabel>Identitas Kendaraan</SectionLabel>
            <Def label="Nama Aset" value={asset.name} />
            {asset.model && <Def label="Model / Tipe" value={asset.model} />}
            {asset.manufacture_year && <Def label="Tahun Pembuatan" value={asset.manufacture_year} />}
            {asset.plate_number && <Def label="Plat Nomor" value={asset.plate_number} mono />}
            {asset.color && <Def label="Warna" value={asset.color} />}
            {asset.fuel_type && <Def label="Jenis BBM" value={asset.fuel_type} />}
            {asset.vin && <Def label="Nomor Rangka (VIN)" value={asset.vin} mono />}
            {asset.engine_number && <Def label="Nomor Mesin" value={asset.engine_number} mono />}
            {asset.km_odometer != null && <Def label="KM Terakhir" value={fmtKm(asset.km_odometer)} mono />}

            <SectionLabel>Penugasan &amp; Lokasi</SectionLabel>
            {asset.assigned_to_name && (
              <Def label="Assigned To">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: avatarColor(asset.assigned_to_name),
                    color: '#fff', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 10, fontWeight: 700,
                  }}>
                    {initials(asset.assigned_to_name)}
                  </span>
                  {asset.assigned_to_name}
                </span>
              </Def>
            )}
            <Def label="Lokasi" value={asset.asset_locations?.name || '—'} />
            <Def label="Company">
              {asset.companies?.code ? <CoBadge code={asset.companies.code} /> : '—'}
            </Def>
            <Def label="Kategori Aset" value={asset.asset_categories?.name || '—'} />

            <SectionLabel>Pengadaan &amp; Nilai</SectionLabel>
            <Def label="Nilai Perolehan" value={fmtRupiah(asset.purchase_price)} mono />
            <Def label="Tanggal Perolehan" value={fmtDate(asset.purchase_date)} mono />
            <Def label="Vendor / Supplier" value={asset.vendor_name || '—'} />
            <Def label="Nomor PO / Faktur" value={asset.purchase_invoice_no || '—'} mono />
            <Def label="Metode Penyusutan">
              {[
                asset.depreciation_method === 'straight_line' ? 'Garis Lurus' :
                asset.depreciation_method === 'double_declining' ? 'Double Declining' : asset.depreciation_method,
                asset.useful_life_years && `${asset.useful_life_years} tahun`,
              ].filter(Boolean).join(' · ') || '—'}
            </Def>
            <Def label="Nilai Buku (sekarang)" value={fmtRupiah(bookValue)} mono />
            <Def label="Akumulasi Penyusutan" value={fmtRupiah(asset.accumulated_depreciation)} mono />
            {asset.asset_code && <Def label="Kode Aset" value={asset.asset_code} mono />}
            <Def label="Nomor Dokumen" value={asset.asset_no} mono />
          </dl>
        </Card>
      )}

      {/* DOKUMEN */}
      {activeTab === 'dok' && (
        <div>
          <Banner tone="warn" icon={AlertTriangle}>
            <span>Dokumen kendaraan belum terhubung ke sistem. Tab ini akan aktif setelah modul Dokumen diimplementasi.</span>
          </Banner>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            <DocCard
              title="STNK"
              docNo={asset.plate_number || '—'}
              status="Belum data"
              tone="neutral"
              rows={[
                { k: 'Berlaku s/d', v: '—' },
                { k: 'Pajak Tahunan', v: '—' },
              ]}
            />
            <DocCard
              title="BPKB"
              docNo="—"
              status="Belum data"
              tone="neutral"
              rows={[
                { k: 'Status', v: '—' },
                { k: 'Atas Nama', v: '—' },
              ]}
            />
            <DocCard
              title="KIR / Uji Berkala"
              docNo="—"
              status="Belum data"
              tone="neutral"
              rows={[
                { k: 'Berlaku s/d', v: '—' },
                { k: 'Status', v: '—' },
              ]}
            />
            <DocCard
              title="Asuransi"
              docNo="—"
              status="Belum data"
              tone="neutral"
              rows={[
                { k: 'Berlaku s/d', v: '—' },
                { k: 'Penjamin', v: '—' },
              ]}
            />
          </div>
        </div>
      )}

      {/* MAINTENANCE */}
      {activeTab === 'mtc' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignItems: 'start' }}>
          <Card>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Riwayat Service</span>
              <button style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 32, padding: '0 12px', borderRadius: 8,
                background: D.accent, color: '#fff', border: 'none',
                cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              }}>
                + Catat Service
              </button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ color: D.inkFaint, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                Data maintenance akan tampil di sini setelah modul Maintenance diimplementasi.
              </div>
            </div>
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600, marginBottom: 4 }}>Total Biaya Maintenance</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: D.ink }}>—</div>
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600, marginBottom: 8 }}>Jadwal Berikutnya</div>
              <div style={{ color: D.inkFaint, fontSize: 13 }}>Belum ada jadwal.</div>
            </Card>
          </div>
        </div>
      )}

      {/* RUTE */}
      {activeTab === 'rute' && (
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Rute Perjalanan</span>
            <span style={{ fontSize: 12.5, color: D.inkFaint }}>Data rute akan tersedia setelah modul Rute diimplementasi.</span>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
            Belum ada data rute perjalanan.
          </div>
        </Card>
      )}

      {/* BBM */}
      {activeTab === 'bbm' && (
        <div>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
            <StatCard
              label="Konsumsi Rata-rata"
              icon={Fuel}
              value={fuelStats.avgKmPerL ? <>{fuelStats.avgKmPerL} <small style={{ fontWeight: 500, fontSize: 14 }}>km/L</small></> : '—'}
            />
            <StatCard
              label="Total BBM"
              icon={Fuel}
              value={fuelStats.totalLiters ? <>{fuelStats.totalLiters} <small style={{ fontWeight: 500, fontSize: 14 }}>Liter</small></> : '—'}
            />
            <StatCard
              label="Total Biaya BBM"
              icon={Wallet}
              value={fuelStats.totalCost ? fmtRupiah(fuelStats.totalCost) : '—'}
              mono
            />
          </div>

          {/* Fuel log table */}
          <Card>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Riwayat Pengisian BBM</span>
              <span style={{ fontSize: 12.5, color: D.inkFaint }}>
                {asset.fuel_type ? asset.fuel_type.charAt(0).toUpperCase() + asset.fuel_type.slice(1) : 'Solar / Bio Solar'}
              </span>
            </div>
            {fuelLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>
            ) : fuelLogs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
                Belum ada data pengisian BBM.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="ad-tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>SPBU</th>
                      <th className="col-r">Liter</th>
                      <th className="col-r">Harga/L</th>
                      <th className="col-r">Total</th>
                      <th className="col-r">Odometer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkSoft }}>
                          {fmtDateShort(log.fill_date)}
                        </td>
                        <td>{log.spbu || '—'}</td>
                        <td className="col-r" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
                          {log.liters} L
                        </td>
                        <td className="col-r" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkSoft }}>
                          {Number(log.price_per_liter).toLocaleString('id-ID')}
                        </td>
                        <td className="col-r" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>
                          {fmtRupiah(log.total_cost || (log.liters * log.price_per_liter))}
                        </td>
                        <td className="col-r" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkSoft }}>
                          {log.odometer ? Number(log.odometer).toLocaleString('id-ID') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* HISTORY */}
      {activeTab === 'hist' && (
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Log Aktivitas Aset</span>
            <span style={{ fontSize: 12.5, color: D.inkFaint }}>Audit trail</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <TlItem
              title="Aset dibuat"
              date={asset.created_at ? fmtDateShort(asset.created_at) : '—'}
              desc={`Nilai perolehan ${fmtRupiah(asset.purchase_price)}.`}
            />
            {asset.updated_at && asset.updated_at !== asset.created_at && (
              <TlItem
                title="Aset diperbarui"
                date={fmtDateShort(asset.updated_at)}
                desc="Data aset diubah."
                muted
              />
            )}
            <div style={{ color: D.inkFaint, fontSize: 12.5, textAlign: 'center', paddingTop: 6 }}>
              Audit log lengkap akan tersedia setelah modul History diimplementasi.
            </div>
          </div>
        </Card>
      )}

      {/* SPESIFIKASI — IT Equipment */}
      {activeTab === 'spec' && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <dl style={{ margin: 0 }}>
            <SectionLabel>Spesifikasi Hardware</SectionLabel>
            <Def label="Tipe Perangkat" value={asset.asset_subtype || '—'} />
            <Def label="Model" value={asset.model || '—'} />
            <Def label="Serial Number" value={asset.serial_number || '—'} mono />
            <Def label="Nomor Aset" value={asset.asset_code || asset.asset_no} mono />
            <SectionLabel>Detail Teknis</SectionLabel>
            <Def label="Prosesor" value="—" />
            <Def label="RAM" value="—" />
            <Def label="Storage" value="—" />
            <Def label="OS" value="—" />
            <Def label="Garansi s/d" value="—" />
          </dl>
          <div style={{
            marginTop: 14, padding: '10px 12px', borderRadius: 8,
            background: D.infoBg, border: `1px solid ${D.infoBd}`,
            fontSize: 12.5, color: D.info,
          }}>
            Kolom spesifikasi teknis (CPU, RAM, Storage, OS) akan ditambahkan pada migration berikutnya.
          </div>
        </Card>
      )}

      {/* NETWORK — IT Equipment */}
      {activeTab === 'network' && (
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Konfigurasi Network</span>
          </div>
          <div style={{ padding: '4px 20px 16px' }}>
            <dl style={{ margin: 0 }}>
              <SectionLabel>Identitas Jaringan</SectionLabel>
              <Def label="Hostname" value="—" mono />
              <Def label="IP Address" value="—" mono />
              <Def label="MAC Address" value="—" mono />
              <Def label="VLAN" value="—" />
              <Def label="Domain / Workgroup" value="—" />
            </dl>
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 8,
              background: D.infoBg, border: `1px solid ${D.infoBd}`,
              fontSize: 12.5, color: D.info,
            }}>
              Data network (IP, MAC, VLAN) akan diisi setelah schema Network diimplementasi.
            </div>
          </div>
        </Card>
      )}

      {/* SOFTWARE — IT Equipment */}
      {activeTab === 'software' && (
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Software &amp; Lisensi</span>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px', borderRadius: 8,
              background: D.accent, color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            }}>
              + Tambah Lisensi
            </button>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
            Belum ada data software &amp; lisensi. Modul Software Lisensi akan diimplementasi berikutnya.
          </div>
        </Card>
      )}

      {/* KONTRAK — Properti */}
      {activeTab === 'kontrak' && (
        <Card>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}`,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Kontrak &amp; Sewa</span>
            <button style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px', borderRadius: 8,
              background: D.accent, color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            }}>
              + Tambah Kontrak
            </button>
          </div>
          <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
            Belum ada data kontrak. Modul Kontrak Sewa akan diimplementasi berikutnya.
          </div>
        </Card>
      )}
    </div>
  );
}
