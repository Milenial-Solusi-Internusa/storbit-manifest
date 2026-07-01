// src/modules/assets/pages/AssetDetailITPage.jsx
// IT Equipment Asset Detail — faithful implementation of asset-detail-it.html design.
// Receives `asset` (preloaded) + `id` from AssetDetailPage router.
// Fetches IT-specific tables (specs, network, software, maintenance) via useITAssetDetail.
//
// Tabs: Info Dasar | Spesifikasi | Network | Health Score | Software & Lisensi | Maintenance | History

import { useState, useCallback, useEffect } from 'react';
import {
  ChevronRight, Pencil, Copy, Trash2, MapPin, Users, Tag,
  Info, Cpu, Network, Gauge, Package, Wrench, History,
  AlertTriangle, CheckCircle2, XCircle, ArrowLeft,
  Laptop, Monitor, Server, Printer, Plug,
  HardDrive, MemoryStick, Globe, Shield, Clock,
  Eye, EyeOff, Plus, Download, Save, X,
} from 'lucide-react';
import { useITAssetDetail, ASSET_STATUS_CONFIG } from '../../../hooks/useAssets';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/useAuth';

// ─────────────────────────────────────────────────────────────
// Design tokens
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
  accent:      '#E85A1E',
  accentInk:   '#235031',
  accentSoft:  '#FEF2EC',
  ok:          '#2E7D4F', okBg:  '#E4F0E5', okBd:  '#BFDDC4',
  warn:        '#9A6B0E', warnBg:'#F8ECCF', warnBd:'#E6CE94',
  danger:      '#B23227', dangerBg:'#F6E0DB', dangerBd:'#E6BBB2',
  info:        '#2A5B8C', infoBg:'#E1ECF5', infoBd:'#BAD2E6',
  neutral:     '#6B6F5E', neutralBg:'#EEE9DC', neutralBd:'#DDD3BE',
  purple:      '#6B3FA0', purpleBg:'#F0E8FA', purpleBd:'#CEBAE8',
  msi:         '#E85A1E', msiBg:'#FEF2EC',
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
const initials = (name) =>
  (name || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
const AV_COLORS = ['#E85A1E','#2A5B8C','#9A5B2C','#6B6F5E','#7A4E8C','#1F6B6B'];
const avatarColor = (name) =>
  AV_COLORS[(initials(name).charCodeAt(0) || 0) % AV_COLORS.length];

// Days until a date (negative = past)
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
};

// ─────────────────────────────────────────────────────────────
// Health score computation (client-side from available data)
// ─────────────────────────────────────────────────────────────
function computeHealthScore(asset, specs, software) {
  // Physical / condition (25 pts)
  const physical = asset.status === 'active' ? 22 : asset.status === 'in_repair' ? 12 : 5;

  // Hardware (25 pts) — battery health if available
  const hardware = specs?.battery_health_pct != null
    ? Math.round(specs.battery_health_pct / 4)
    : (asset.status === 'active' ? 20 : 10);

  // Software & security (25 pts)
  let security = 20;
  if (software.length > 0) {
    const expired = software.filter(s => s.status === 'expired').length;
    const soon    = software.filter(s => s.status === 'soon').length;
    security = Math.max(0, 25 - expired * 6 - soon * 2);
  }

  // Availability (25 pts)
  const availability = asset.status === 'active' ? 22 : 10;

  const total = Math.min(100, physical + hardware + security + availability);
  const label = total >= 71 ? 'Good' : total >= 41 ? 'Fair' : 'Poor';
  const tone  = total >= 71 ? 'ok' : total >= 41 ? 'warn' : 'danger';
  return { total, physical, hardware, security, availability, label, tone };
}

// ─────────────────────────────────────────────────────────────
// Shared micro-components
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

function CoBadge({ code, name }) {
  if (!code) return null;
  const co = code.toLowerCase();
  const cfg = { msi: [D.msiBg, D.msi], jci: [D.jciBg, D.jci], sbi: [D.sbiBg, D.sbi] };
  const [bg, color] = cfg[co] || [D.neutralBg, D.neutral];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 700, padding: '3px 9px',
      borderRadius: 6, background: bg, color,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {code.toUpperCase()}{name && <span style={{ fontFamily: 'inherit', fontWeight: 500 }}>· {name}</span>}
    </span>
  );
}

function Pill({ icon: Icon, children, mono }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5,
      fontWeight: 500, padding: '3px 9px', borderRadius: 6,
      background: D.neutralBg, color: D.neutral, border: `1px solid ${D.neutralBd}`,
      fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined,
    }}>
      {Icon && <Icon size={13} strokeWidth={1.8} />}{children}
    </span>
  );
}

function Btn({ icon: Icon, children, danger, primary, small, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        height: small ? 32 : 36, padding: `0 ${small ? 12 : 14}px`,
        borderRadius: 8, fontSize: small ? 12.5 : 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${danger ? D.dangerBd : primary ? D.accent : D.line}`,
        background: primary ? (hover ? D.accentInk : D.accent)
          : danger ? (hover ? D.dangerBg : D.surface)
          : (hover ? D.bgAlt : D.surface),
        color: primary ? '#fff' : danger ? D.danger : D.inkSoft,
        opacity: disabled ? .5 : 1, transition: 'background .12s', fontFamily: 'inherit',
      }}
    >
      {Icon && <Icon size={small ? 13 : 14} strokeWidth={1.8} />}{children}
    </button>
  );
}

function Def({ label, value, mono, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 1fr',
      padding: '8px 0', borderBottom: `1px solid ${D.lineSoft}`,
      alignItems: 'start', gap: 12,
    }}>
      <dt style={{ fontSize: 12.5, color: D.inkFaint, fontWeight: 600, paddingTop: 1 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13.5, color: D.ink, fontWeight: 500,
        fontFamily: mono ? "'IBM Plex Mono', monospace" : undefined }}>
        {children ?? (value ?? '—')}
      </dd>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '.6px', color: D.inkFaint, padding: '14px 0 6px' }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline-edit primitives (match Def grid / brand style)
// ─────────────────────────────────────────────────────────────
const editInpStyle = {
  width: '100%', height: 34, padding: '0 10px', borderRadius: 7,
  border: `1px solid ${D.line}`, background: D.surface, color: D.ink,
  fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

// Field row — label (180px) + control, mirrors <Def>
function ERow({ label, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', padding: '7px 0',
      borderBottom: `1px solid ${D.lineSoft}`, alignItems: 'center', gap: 12 }}>
      <label style={{ fontSize: 12.5, color: D.inkFaint, fontWeight: 600 }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}
function EText({ value, onChange, mono, placeholder, type = 'text' }) {
  return (
    <input type={type} value={value ?? ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ ...editInpStyle, fontFamily: mono ? "'IBM Plex Mono', monospace" : 'inherit' }} />
  );
}
function ENum({ value, onChange, step }) {
  return (
    <input type="number" value={value ?? ''} step={step || 'any'}
      onChange={e => onChange(e.target.value)}
      style={{ ...editInpStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
  );
}
function ESelect({ value, onChange, options, placeholder = '— Pilih —' }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)}
      style={{ ...editInpStyle, cursor: 'pointer' }}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function EArea({ value, onChange, placeholder }) {
  return (
    <textarea value={value ?? ''} placeholder={placeholder} rows={3}
      onChange={e => onChange(e.target.value)}
      style={{ ...editInpStyle, height: 'auto', minHeight: 64, padding: '8px 10px', resize: 'vertical', lineHeight: 1.5 }} />
  );
}

// Constraint-bound option sets (labels cakep, value PERSIS sesuai CHECK constraint DB)
const STATUS_OPTS = [
  { value: 'active',      label: 'Aktif' },
  { value: 'in_repair',   label: 'Dalam Perbaikan' },
  { value: 'retired',     label: 'Rusak / Retired' },
  { value: 'disposed',    label: 'Disposed' },
  { value: 'transferred', label: 'Dialihkan' },
];
const SUBTYPE_OPTS = [
  { value: 'laptop', label: 'Laptop' }, { value: 'desktop', label: 'Desktop' },
  { value: 'server', label: 'Server' }, { value: 'printer', label: 'Printer' },
  { value: 'network', label: 'Network Device' }, { value: 'peripheral', label: 'Peripheral' },
  { value: 'other', label: 'Other' },
];
const STORAGE_TYPE_OPTS = [
  { value: 'SSD', label: 'SSD' }, { value: 'HDD', label: 'HDD' },
  { value: 'NVMe', label: 'NVMe' }, { value: 'eMMC', label: 'eMMC' }, { value: 'other', label: 'Other' },
];
const DEPR_OPTS = [
  { value: 'straight_line', label: 'Garis Lurus' },
  { value: 'double_declining', label: 'Saldo Menurun Ganda' },
  { value: 'none', label: 'Tidak Disusutkan' },
];
const ONLINE_OPTS = [
  { value: 'true', label: 'Online' },
  { value: 'false', label: 'Offline' },
];
// Condition — saran (datalist), tapi fleksibel (tidak ada CHECK constraint di DB)
const CONDITION_OPTS = ['Baik', 'Tidak Baik', 'Tidak Diketahui'];

// '' / null → NULL; otherwise Number(...) (kosong tidak disimpan 0 / '')
const numOrNull = (v) => (v === '' || v == null) ? null : Number(v);
const txtOrNull = (v) => { const s = (v ?? '').toString().trim(); return s === '' ? null : s; };
// true if any value in an object is meaningfully filled
const hasAnyValue = (obj) => Object.values(obj).some(v => v !== '' && v != null && v !== false);

function Banner({ tone = 'warn', icon: Icon = AlertTriangle, children }) {
  const map = {
    warn:   { bg: D.warnBg, bd: D.warnBd, ic: D.warn },
    danger: { bg: D.dangerBg, bd: D.dangerBd, ic: D.danger },
    info:   { bg: D.infoBg, bd: D.infoBd, ic: D.info },
    ok:     { bg: D.okBg, bd: D.okBd, ic: D.ok },
  };
  const t = map[tone] || map.warn;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
      borderRadius: 8, background: t.bg, border: `1px solid ${t.bd}`, fontSize: 13, color: D.ink,
    }}>
      <Icon size={15} strokeWidth={2} color={t.ic} style={{ marginTop: 1, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}

// Progress bar meter
function Meter({ pct, color }) {
  return (
    <div style={{ height: 8, borderRadius: 6, background: D.bgAlt, overflow: 'hidden', marginTop: 2 }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: color || D.accent }} />
    </div>
  );
}

// Subtype → icon
const SUBTYPE_ICON = { laptop: Laptop, desktop: Monitor, server: Server, printer: Printer, peripheral: Plug, network: Globe, other: Package };
const subtypeLabel = (s) => ({ laptop:'Laptop', desktop:'Desktop', server:'Server', printer:'Printer', peripheral:'Peripheral', network:'Network Device', other:'Other' }[s] || s);

// License status badge
function LicenseBadge({ status, expiryDate }) {
  const days = daysUntil(expiryDate);
  if (status === 'expired' || (days !== null && days < 0)) {
    return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:20, border:`1px solid ${D.dangerBd}`, background:D.dangerBg, color:D.danger, whiteSpace:'nowrap' }}><span style={{width:5,height:5,borderRadius:'50%',background:D.danger}}/>Expired</span>;
  }
  if (status === 'soon' || (days !== null && days <= 30)) {
    return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:20, border:`1px solid ${D.warnBd}`, background:D.warnBg, color:D.warn, whiteSpace:'nowrap' }}><span style={{width:5,height:5,borderRadius:'50%',background:D.warn}}/>{days} hari</span>;
  }
  if (!expiryDate) {
    return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:20, border:`1px solid ${D.okBd}`, background:D.okBg, color:D.ok, whiteSpace:'nowrap' }}><span style={{width:5,height:5,borderRadius:'50%',background:D.ok}}/>Perpetual</span>;
  }
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:20, border:`1px solid ${D.okBd}`, background:D.okBg, color:D.ok, whiteSpace:'nowrap' }}><span style={{width:5,height:5,borderRadius:'50%',background:D.ok}}/>Aktif</span>;
}

// Maintenance type badge
function MtcTypeBadge({ type }) {
  const map = {
    preventif: { bg: D.infoBg,   color: D.info,   bd: D.infoBd,   label: 'Preventif' },
    korektif:  { bg: D.warnBg,   color: D.warn,   bd: D.warnBd,   label: 'Korektif' },
    upgrade:   { bg: D.purpleBg, color: D.purple, bd: D.purpleBd, label: 'Upgrade' },
    inspeksi:  { bg: D.neutralBg,color: D.neutral,bd: D.neutralBd,label: 'Inspeksi' },
  };
  const t = map[type] || map.inspeksi;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:20, border:`1px solid ${t.bd}`, background:t.bg, color:t.color }}>
      {t.label}
    </span>
  );
}

// Timeline item
function TlItem({ title, date, desc, meta, warn, muted, children }) {
  const dotColor = warn ? D.warn : (muted ? D.neutralBd : D.accent);
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0,
          background: dotColor, border: `2px solid ${D.surface}`, boxShadow: `0 0 0 2px ${dotColor}` }} />
        <div style={{ flex: 1, width: 1, background: D.lineSoft, minHeight: 14 }} />
      </div>
      <div style={{ flex: 1, background: D.surface2, border: `1px solid ${D.lineSoft}`,
        borderRadius: 8, padding: '10px 12px', marginBottom: 10, opacity: muted ? .75 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: D.ink }}>{title}</span>
          <span style={{ fontSize: 11.5, color: D.inkFaint, whiteSpace: 'nowrap' }}>{date}</span>
        </div>
        {desc && <div style={{ fontSize: 12.5, color: D.inkSoft, lineHeight: 1.55 }}>{desc}</div>}
        {meta && (
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            {meta.map((m, i) => <span key={i} style={{ fontSize: 12, color: D.inkFaint }}>{m}</span>)}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Spec card (Spesifikasi tab)
function SpecCard({ icon: Icon, label, value, sub, rows }) {
  return (
    <Card style={{ padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: D.accentSoft, color: D.accent }}>
          {Icon && <Icon size={18} strokeWidth={1.8} />}
        </div>
        <span style={{ fontSize: 11, color: D.inkFaint, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.3px', lineHeight: 1.15, color: D.ink }}>
        {value}{sub && <small style={{ fontSize: 12.5, fontWeight: 600, color: D.inkFaint, letterSpacing: 0 }}> {sub}</small>}
      </div>
      {rows && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: `1px solid ${D.lineSoft}`, paddingTop: 10 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span style={{ color: D.inkFaint, fontWeight: 600 }}>{r.k}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: r.color || D.ink, textAlign: 'right' }}>{r.v || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Health Score SVG gauge
function HealthGauge({ score, label, tone }) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const strokeColor = tone === 'ok' ? D.ok : tone === 'warn' ? D.warn : D.danger;
  const labelColor  = tone === 'ok' ? D.ok : tone === 'warn' ? D.warn : D.danger;
  const labelBg     = tone === 'ok' ? D.okBg : tone === 'warn' ? D.warnBg : D.dangerBg;
  const labelBd     = tone === 'ok' ? D.okBd : tone === 'warn' ? D.warnBd : D.dangerBd;
  return (
    <div style={{ position: 'relative', width: 184, height: 184, flexShrink: 0 }}>
      <svg viewBox="0 0 160 160" width={184} height={184} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={80} cy={80} r={radius} fill="none" stroke={D.bgAlt} strokeWidth={14} />
        <circle cx={80} cy={80} r={radius} fill="none" stroke={strokeColor} strokeWidth={14}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <b style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 48, fontWeight: 800, letterSpacing: -2, lineHeight: .95 }}>{score}</b>
        <span style={{ fontSize: 13, color: D.inkFaint, fontWeight: 600, marginTop: 1 }}>/ 100</span>
        <span style={{ marginTop: 8, fontSize: 12, fontWeight: 700, padding: '2px 13px', borderRadius: 20,
          color: labelColor, background: labelBg, border: `1px solid ${labelBd}` }}>{label}</span>
      </div>
    </div>
  );
}

// Health category card
function HCatCard({ icon: Icon, title, score, maxScore, items }) {
  const pct = Math.round((score / maxScore) * 100);
  const barColor = pct >= 80 ? D.ok : pct >= 56 ? D.warn : D.danger;
  return (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: D.accentSoft, color: D.accent }}>
          {Icon && <Icon size={18} strokeWidth={1.8} />}
        </div>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: '-.2px' }}>{title}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 17, fontWeight: 700, letterSpacing: '-.5px' }}>
          {score}<small style={{ fontSize: 11, color: D.inkFaint, fontWeight: 600 }}>/{maxScore}</small>
        </span>
      </div>
      <Meter pct={pct} color={barColor} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 13 }}>
        {items.map((item, i) => {
          const Ic = item.ok ? CheckCircle2 : item.warn ? AlertTriangle : XCircle;
          const ic = item.ok ? { bg: D.okBg, c: D.ok } : item.warn ? { bg: D.warnBg, c: D.warn } : { bg: D.dangerBg, c: D.danger };
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 19, height: 19, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ic.bg }}>
                <Ic size={12} strokeWidth={2.6} color={ic.c} />
              </div>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: D.inkSoft }}>{item.text}</span>
              {item.pts && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 600, color: D.inkFaint }}>{item.pts}</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Photo placeholder (IT variant — shows subtype icon)
function PhotoPlaceholder({ assetSubtype }) {
  const Icon = SUBTYPE_ICON[assetSubtype] || Laptop;
  return (
    <div style={{ width: 96, height: 96, borderRadius: 11, flexShrink: 0, position: 'relative',
      background: D.bgAlt, border: `1px solid ${D.line}`, display: 'flex', alignItems: 'center',
      justifyContent: 'center', overflow: 'hidden' }}>
      <svg viewBox="0 0 100 100" width={96} height={96} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <pattern id="pg-it" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="9" stroke="#d9cbb1" strokeWidth="3" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#pg-it)" opacity=".5" />
      </svg>
      <Icon size={34} color="#b0a894" strokeWidth={1.5} style={{ position: 'relative' }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tabs configuration for IT Equipment
// ─────────────────────────────────────────────────────────────
const IT_TABS = [
  { id: 'info',   label: 'Info Dasar',       icon: Info    },
  { id: 'spec',   label: 'Spesifikasi',      icon: Cpu     },
  { id: 'net',    label: 'Network',          icon: Network },
  { id: 'health', label: 'Health Score',     icon: Gauge   },
  { id: 'sw',     label: 'Software & Lisensi', icon: Package },
  { id: 'mtc',    label: 'Maintenance',      icon: Wrench  },
  { id: 'hist',   label: 'History',          icon: History },
];

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function AssetDetailITPage({ id, asset, onBack, onSaved }) {
  const { profile } = useAuth();
  const [activeTab,      setActiveTab]      = useState('info');
  const [deleteConfirm,  setDeleteConfirm]  = useState(false);
  const [revealedKeys,   setRevealedKeys]   = useState(new Set());

  // ── Inline-edit state (cross-tab: one Edit toggles editing on all 3 tabs) ──
  const [editing,   setEditing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [form,      setForm]      = useState(null);  // { asset, spec, net } snapshot
  const [opts,      setOpts]      = useState({ categories: [], locations: [], users: [], departments: [] });
  const [toast,     setToast]     = useState({ show: false, msg: '', tone: 'ok' });

  const { specs, network, software, maintenance, loading: itLoading, refresh: refreshIT } = useITAssetDetail({ assetId: id });

  // Reset tab + exit edit when asset changes
  useEffect(() => { Promise.resolve().then(() => { setActiveTab('info'); setEditing(false); setForm(null); setSaveError(null); }); }, [id]);

  const showToast = useCallback((msg, tone = 'ok') => {
    setToast({ show: true, msg, tone });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2600);
  }, []);

  // Field setters per table-group
  const setA = useCallback((k, v) => setForm(f => ({ ...f, asset: { ...f.asset, [k]: v } })), []);
  const setS = useCallback((k, v) => setForm(f => ({ ...f, spec:  { ...f.spec,  [k]: v } })), []);
  const setN = useCallback((k, v) => setForm(f => ({ ...f, net:   { ...f.net,   [k]: v } })), []);

  // Enter edit mode — snapshot current data into form + fetch dropdown options
  const enterEdit = useCallback(async () => {
    if (!asset) return;
    const dateOnly = (d) => (d ? String(d).slice(0, 10) : '');
    setForm({
      asset: {
        name: asset.name ?? '', model: asset.model ?? '', serial_number: asset.serial_number ?? '',
        asset_subtype: asset.asset_subtype ?? '', status: asset.status ?? 'active',
        description: asset.description ?? '', purchase_price: asset.purchase_price ?? '',
        purchase_date: dateOnly(asset.purchase_date), vendor_name: asset.vendor_name ?? '',
        purchase_invoice_no: asset.purchase_invoice_no ?? '', useful_life_years: asset.useful_life_years ?? '',
        depreciation_method: asset.depreciation_method ?? '', category_id: asset.category_id ?? '',
        location_id: asset.location_id ?? '', assigned_to_user_id: asset.assigned_to_user_id ?? '',
        brand: asset.brand ?? '', condition: asset.condition ?? '', department_id: asset.department_id ?? '',
      },
      spec: {
        cpu_model: specs?.cpu_model ?? '', cpu_cores: specs?.cpu_cores ?? '', cpu_threads: specs?.cpu_threads ?? '',
        cpu_base_ghz: specs?.cpu_base_ghz ?? '', cpu_turbo_ghz: specs?.cpu_turbo_ghz ?? '', cpu_cache_mb: specs?.cpu_cache_mb ?? '',
        ram_gb: specs?.ram_gb ?? '', ram_type: specs?.ram_type ?? '', ram_slots_used: specs?.ram_slots_used ?? '', ram_slots_total: specs?.ram_slots_total ?? '',
        storage_gb: specs?.storage_gb ?? '', storage_type: specs?.storage_type ?? '', storage_interface: specs?.storage_interface ?? '', storage_used_pct: specs?.storage_used_pct ?? '',
        display_size_inch: specs?.display_size_inch ?? '', display_resolution: specs?.display_resolution ?? '', display_refresh_hz: specs?.display_refresh_hz ?? '', gpu_model: specs?.gpu_model ?? '',
        os_name: specs?.os_name ?? '', os_version: specs?.os_version ?? '', os_build: specs?.os_build ?? '', os_arch: specs?.os_arch ?? '', os_license_type: specs?.os_license_type ?? '',
        battery_capacity_wh: specs?.battery_capacity_wh ?? '', battery_health_pct: specs?.battery_health_pct ?? '', battery_cycle_count: specs?.battery_cycle_count ?? '',
        webcam_desc: specs?.webcam_desc ?? '', keyboard_desc: specs?.keyboard_desc ?? '', ports_desc: specs?.ports_desc ?? '', wireless_desc: specs?.wireless_desc ?? '',
        weight_kg: specs?.weight_kg ?? '', color: specs?.color ?? '',
      },
      net: {
        ip_address: network?.ip_address ?? '', ipv6_address: network?.ipv6_address ?? '',
        mac_wifi: network?.mac_wifi ?? '', mac_lan: network?.mac_lan ?? '', hostname: network?.hostname ?? '',
        gateway: network?.gateway ?? '', dns_primary: network?.dns_primary ?? '', dns_secondary: network?.dns_secondary ?? '',
        vlan: network?.vlan ?? '', domain_workgroup: network?.domain_workgroup ?? '',
        is_online: network?.is_online ? 'true' : 'false',
      },
    });
    setSaveError(null);
    setEditing(true);

    // Dropdown options (category list global; location/user/department scoped to asset company)
    const cid = asset.company_id;
    const [catRes, locRes, usrRes, deptRes] = await Promise.all([
      supabase.from('asset_categories').select('id, name, code').is('deleted_at', null).order('name').limit(1000),
      supabase.from('asset_locations').select('id, name').eq('company_id', cid).is('deleted_at', null).order('name').limit(1000),
      supabase.from('profiles').select('id, full_name').eq('company_id', cid).eq('active', true).order('full_name').limit(1000),
      supabase.from('departments').select('id, code, name').eq('company_id', cid).is('deleted_at', null).order('code').limit(1000),
    ]);
    setOpts({ categories: catRes.data || [], locations: locRes.data || [], users: usrRes.data || [], departments: deptRes.data || [] });
  }, [asset, specs, network]);

  const cancelEdit = useCallback(() => { setEditing(false); setForm(null); setSaveError(null); }, []);

  // Save across 3 tables: update assets → upsert specs → upsert network.
  // Plain function (only used as an onClick) — avoids a React-compiler
  // "memoization could not be preserved" on this large async closure.
  const handleSave = async () => {
    if (!form || !asset) return;
    setSaving(true);
    setSaveError(null);
    try {
      const a = form.asset;
      // assets — name/category_id are NOT NULL → keep existing if blank.
      // Assignment: pick a user → checked_out + name; clear → available + null.
      const assignedId = a.assigned_to_user_id || null;
      const assignedName = assignedId
        ? (opts.users.find(u => u.id === assignedId)?.full_name || asset.assigned_to_name || null)
        : null;
      const assignmentStatus = assignedId ? 'checked_out' : 'available';
      const assetsPatch = {
        name: (a.name ?? '').trim() || asset.name,
        model: txtOrNull(a.model),
        serial_number: txtOrNull(a.serial_number),
        asset_subtype: txtOrNull(a.asset_subtype),
        status: a.status || 'active',
        description: txtOrNull(a.description),
        brand: txtOrNull(a.brand),
        condition: txtOrNull(a.condition),
        department_id: a.department_id || null,
        purchase_price: numOrNull(a.purchase_price),
        purchase_date: txtOrNull(a.purchase_date),
        vendor_name: txtOrNull(a.vendor_name),
        purchase_invoice_no: txtOrNull(a.purchase_invoice_no),
        useful_life_years: numOrNull(a.useful_life_years),
        depreciation_method: txtOrNull(a.depreciation_method),
        category_id: a.category_id || asset.category_id,
        location_id: a.location_id || null,
        assigned_to_user_id: assignedId,
        assigned_to_name: assignedName,
        assignment_status: assignmentStatus,
        updated_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      };
      const { error: aErr } = await supabase.from('assets').update(assetsPatch).eq('id', id);
      if (aErr) throw new Error(`Info Dasar (assets) gagal: ${aErr.message}`);

      // asset_specifications — upsert by asset_id (skip when nothing to write)
      const s = form.spec;
      if (specs || hasAnyValue(s)) {
        const specPatch = {
          asset_id: id, company_id: asset.company_id,
          cpu_model: txtOrNull(s.cpu_model), cpu_cores: numOrNull(s.cpu_cores), cpu_threads: numOrNull(s.cpu_threads),
          cpu_base_ghz: numOrNull(s.cpu_base_ghz), cpu_turbo_ghz: numOrNull(s.cpu_turbo_ghz), cpu_cache_mb: numOrNull(s.cpu_cache_mb),
          ram_gb: numOrNull(s.ram_gb), ram_type: txtOrNull(s.ram_type), ram_slots_used: numOrNull(s.ram_slots_used), ram_slots_total: numOrNull(s.ram_slots_total),
          storage_gb: numOrNull(s.storage_gb), storage_type: txtOrNull(s.storage_type), storage_interface: txtOrNull(s.storage_interface), storage_used_pct: numOrNull(s.storage_used_pct),
          display_size_inch: numOrNull(s.display_size_inch), display_resolution: txtOrNull(s.display_resolution), display_refresh_hz: numOrNull(s.display_refresh_hz), gpu_model: txtOrNull(s.gpu_model),
          os_name: txtOrNull(s.os_name), os_version: txtOrNull(s.os_version), os_build: txtOrNull(s.os_build), os_arch: txtOrNull(s.os_arch), os_license_type: txtOrNull(s.os_license_type),
          battery_capacity_wh: numOrNull(s.battery_capacity_wh), battery_health_pct: numOrNull(s.battery_health_pct), battery_cycle_count: numOrNull(s.battery_cycle_count),
          webcam_desc: txtOrNull(s.webcam_desc), keyboard_desc: txtOrNull(s.keyboard_desc), ports_desc: txtOrNull(s.ports_desc), wireless_desc: txtOrNull(s.wireless_desc),
          weight_kg: numOrNull(s.weight_kg), color: txtOrNull(s.color),
          updated_at: new Date().toISOString(),
        };
        const { error: sErr } = await supabase.from('asset_specifications').upsert(specPatch, { onConflict: 'asset_id' });
        if (sErr) throw new Error(`Spesifikasi gagal: ${sErr.message}`);
      }

      // asset_network — upsert by asset_id (skip when nothing to write)
      const n = form.net;
      if (network || hasAnyValue({ ...n, is_online: n.is_online === 'true' })) {
        const netPatch = {
          asset_id: id, company_id: asset.company_id,
          ip_address: txtOrNull(n.ip_address), ipv6_address: txtOrNull(n.ipv6_address),
          mac_wifi: txtOrNull(n.mac_wifi), mac_lan: txtOrNull(n.mac_lan), hostname: txtOrNull(n.hostname),
          gateway: txtOrNull(n.gateway), dns_primary: txtOrNull(n.dns_primary), dns_secondary: txtOrNull(n.dns_secondary),
          vlan: txtOrNull(n.vlan), domain_workgroup: txtOrNull(n.domain_workgroup),
          is_online: n.is_online === 'true',
          updated_at: new Date().toISOString(),
        };
        const { error: nErr } = await supabase.from('asset_network').upsert(netPatch, { onConflict: 'asset_id' });
        if (nErr) throw new Error(`Network gagal: ${nErr.message}`);
      }

      // All good — refetch both layers, exit edit
      refreshIT();
      onSaved?.();
      setEditing(false);
      setForm(null);
      showToast('Perubahan tersimpan', 'ok');
    } catch (e) {
      setSaveError(e.message || 'Gagal menyimpan perubahan.');
    } finally {
      setSaving(false);
    }
  };

  const toggleKeyReveal = useCallback((swId) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      next.has(swId) ? next.delete(swId) : next.add(swId);
      return next;
    });
  }, []);

  if (!asset) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif",
        padding: '3rem', textAlign: 'center', color: D.danger, fontSize: 14 }}>
        Asset tidak ditemukan.
      </div>
    );
  }

  const coCode  = asset.companies?.code;
  const coName  = asset.companies?.name;
  const health  = computeHealthScore(asset, specs, software);
  const totalMtcCost = maintenance.reduce((s, r) => s + Number(r.cost || 0), 0);

  // Software alerts
  const expiredCount = software.filter(s => s.status === 'expired').length;
  const soonCount    = software.filter(s => s.status === 'soon' || (daysUntil(s.expiry_date) !== null && daysUntil(s.expiry_date) > 0 && daysUntil(s.expiry_date) <= 30)).length;

  // Next maintenance
  const nextMtc = maintenance.find(m => m.next_scheduled_date);

  // Network online status
  const isOnline = network?.is_online;
  const lastSeen = network?.last_seen_at;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: D.ink }}>
      <style>{`
        .ait-tab { display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:none;
          background:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;
          color:#5E6553;border-bottom:2px solid transparent;transition:color .12s;white-space:nowrap }
        .ait-tab:hover { color:#23291E }
        .ait-tab.active { color:#E85A1E;border-bottom-color:#E85A1E }
        .ait-tbl th { text-align:left;padding:9px 12px;font-size:11.5px;font-weight:700;
          text-transform:uppercase;letter-spacing:.4px;color:#8A8E7C;
          border-bottom:1px solid #E7DCC8;background:#FFFDF8;white-space:nowrap }
        .ait-tbl td { padding:9px 12px;font-size:13px;border-bottom:1px solid #F0E7D6;color:#23291E }
        .ait-tbl tr:last-child td { border-bottom:none }
        .ait-tbl tr:hover td { background:#FBF6EC }
        .col-r { text-align:right }
        .spec-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:14px }
        @media(max-width:1080px) { .spec-grid { grid-template-columns:repeat(2,1fr) } }
        @media(max-width:680px)  { .spec-grid { grid-template-columns:1fr } }
        .hcat-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:14px }
        @media(max-width:980px) { .hcat-grid { grid-template-columns:1fr } }
      `}</style>

      {/* ── Breadcrumb + actions ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: D.inkFaint, marginBottom: 8 }}>
            {onBack && (
              <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer', color: D.inkFaint,
                fontFamily: 'inherit', fontSize: 12.5, padding: 0 }}>
                <ArrowLeft size={13} />
              </button>
            )}
            <span>Home</span><ChevronRight size={12} />
            <span>Assets</span><ChevronRight size={12} />
            <span>IT Equipment</span><ChevronRight size={12} />
            <span style={{ color: D.inkSoft, fontWeight: 600 }}>
              {asset.asset_code || asset.asset_no}
            </span>
          </nav>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', margin: 0, lineHeight: 1.1 }}>
            Detail IT Equipment
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {editing ? (
            <>
              <Btn icon={Save} primary onClick={handleSave} disabled={saving}>
                {saving ? 'Menyimpan…' : 'Save'}
              </Btn>
              <Btn icon={X} onClick={cancelEdit} disabled={saving}>Cancel</Btn>
            </>
          ) : (
            <>
              <Btn icon={Pencil} onClick={enterEdit} disabled={itLoading}>Edit</Btn>
              <Btn icon={Copy}>Clone</Btn>
              <Btn icon={Trash2} danger onClick={() => setDeleteConfirm(v => !v)}>
                {deleteConfirm ? 'Yakin hapus?' : 'Delete'}
              </Btn>
              {deleteConfirm && (
                <button onClick={() => setDeleteConfirm(false)} style={{
                  height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${D.line}`,
                  background: D.surface, cursor: 'pointer', fontSize: 12, color: D.inkSoft, fontFamily: 'inherit',
                }}>Batal</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Save error / edit-mode banner */}
      {editing && saveError && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="danger" icon={AlertTriangle}>{saveError}</Banner>
        </div>
      )}
      {editing && !saveError && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info" icon={Pencil}>
            Mode edit aktif — ubah field di tab Info Dasar, Spesifikasi, dan Network. Pindah tab tidak menghilangkan perubahan. Health Score, Software, dan Maintenance tidak diedit di sini.
          </Banner>
        </div>
      )}

      {/* ── Header card ── */}
      <Card style={{ marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <PhotoPlaceholder assetSubtype={asset.asset_subtype} />

            <div style={{ flex: 1, minWidth: 220 }}>
              {/* Code + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18,
                  fontWeight: 700, color: D.ink, letterSpacing: '.5px' }}>
                  {asset.asset_code || asset.asset_no}
                </span>
                <StatusBadge status={asset.status} />
              </div>

              {/* Name + model */}
              <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: D.ink }}>
                {asset.name}
                {asset.model && asset.model !== asset.name && (
                  <span style={{ fontWeight: 500, color: D.inkSoft }}> · {asset.model}</span>
                )}
              </h2>

              {/* Tags */}
              <div style={{ fontSize: 13, color: D.inkSoft, marginBottom: 10 }}>
                {[
                  asset.asset_subtype && subtypeLabel(asset.asset_subtype),
                  asset.manufacture_year && `Tahun ${asset.manufacture_year}`,
                  specs?.os_name,
                ].filter(Boolean).join(' · ')}
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {coCode && <CoBadge code={coCode} name={coName} />}
                {asset.asset_locations?.name && <Pill icon={MapPin}>{asset.asset_locations.name}</Pill>}
                {asset.assigned_to_name && (
                  <Pill icon={Users}>{asset.assigned_to_name}</Pill>
                )}
                {asset.serial_number && (
                  <Pill icon={Tag} mono>SN {asset.serial_number}</Pill>
                )}
              </div>
            </div>

            {/* Nilai Perolehan */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.5px', color: D.inkFaint, marginBottom: 3 }}>
                Nilai Perolehan
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22,
                fontWeight: 600, letterSpacing: '-.5px', color: D.ink, whiteSpace: 'nowrap' }}>
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
            {IT_TABS.map(t => {
              const Icon = t.icon;
              const badge = t.id === 'sw' && software.length > 0 ? software.length : null;
              const mtcBadge = t.id === 'mtc' && maintenance.length > 0 ? maintenance.length : null;
              return (
                <button key={t.id} className={`ait-tab${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}>
                  <Icon size={14} strokeWidth={1.8} />
                  {t.label}
                  {(badge || mtcBadge) && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9,
                      background: D.bgAlt, color: D.inkFaint, display: 'inline-flex', alignItems: 'center',
                      justifyContent: 'center', padding: '0 5px' }}>
                      {badge || mtcBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ════════════════════════════════════
          TAB PANELS
      ════════════════════════════════════ */}

      {/* INFO DASAR — view */}
      {activeTab === 'info' && !editing && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <dl style={{ margin: 0 }}>
            <SectionLabel>Identitas</SectionLabel>
            <Def label="Nama Aset"     value={asset.name} />
            <Def label="Asset Code"    value={asset.asset_code || asset.asset_no} mono />
            <Def label="Serial Number" value={asset.serial_number || '—'} mono />
            <Def label="Brand"         value={asset.brand || '—'} />
            <Def label="Model"         value={asset.model || '—'} />
            <Def label="Subtype"       value={asset.asset_subtype ? subtypeLabel(asset.asset_subtype) : '—'} />
            <Def label="Status">       <StatusBadge status={asset.status} /></Def>
            <Def label="Kondisi">
              {asset.condition
                ? <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600,
                    padding: '3px 9px', borderRadius: 20, border: `1px solid ${D.neutralBd}`, background: D.neutralBg, color: D.neutral }}>{asset.condition}</span>
                : '—'}
            </Def>
            {asset.manufacture_year && <Def label="Tahun Pembuatan" value={asset.manufacture_year} />}

            <SectionLabel>Penugasan &amp; Lokasi</SectionLabel>
            {asset.assigned_to_name ? (
              <Def label="Assigned To">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: avatarColor(asset.assigned_to_name),
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                    {initials(asset.assigned_to_name)}
                  </span>
                  {asset.assigned_to_name}
                </span>
              </Def>
            ) : <Def label="Assigned To" value="—" />}
            <Def label="Status Assignment">
              {(() => {
                const cs = asset.assignment_status;
                const isOut = cs === 'checked_out';
                const lbl = isOut ? 'Checked out' : cs === 'available' ? 'Available' : (cs || '—');
                if (!cs) return '—';
                const tone = isOut ? { bg: D.infoBg, color: D.info, bd: D.infoBd } : { bg: D.okBg, color: D.ok, bd: D.okBd };
                return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
                  padding: '3px 9px', borderRadius: 20, border: `1px solid ${tone.bd}`, background: tone.bg, color: tone.color }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.color }} />{lbl}</span>;
              })()}
            </Def>
            <Def label="Department"     value={asset.departments ? `${asset.departments.code} - ${asset.departments.name}` : '—'} />
            <Def label="Lokasi"         value={asset.asset_locations?.name || '—'} />
            <Def label="Company">       {coCode ? <CoBadge code={coCode} /> : '—'}</Def>
            <Def label="Kategori"       value={asset.asset_categories?.name || '—'} />

            <SectionLabel>Pengadaan</SectionLabel>
            <Def label="Nilai Perolehan"   value={fmtRupiah(asset.purchase_price)} mono />
            <Def label="Tanggal Perolehan" value={fmtDate(asset.purchase_date)} mono />
            <Def label="Vendor / Supplier" value={asset.vendor_name || '—'} />
            <Def label="Nomor PO / Faktur" value={asset.purchase_invoice_no || '—'} mono />
            {specs?.os_name && (
              <Def label="Garansi Sampai">
                {(() => {
                  if (!asset.purchase_date || !asset.useful_life_years) return '—';
                  const d = new Date(asset.purchase_date);
                  d.setFullYear(d.getFullYear() + (asset.useful_life_years || 0));
                  const days = daysUntil(d.toISOString().slice(0, 10));
                  const label = fmtDate(d.toISOString().slice(0, 10));
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{label}</span>
                      {days !== null && days <= 30 && days >= 0 && (
                        <span style={{ display:'inline-flex',alignItems:'center',gap:4,fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${D.warnBd}`,background:D.warnBg,color:D.warn }}>{days} hari</span>
                      )}
                      {days !== null && days < 0 && (
                        <span style={{ display:'inline-flex',alignItems:'center',gap:4,fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${D.dangerBd}`,background:D.dangerBg,color:D.danger }}>Expired</span>
                      )}
                    </span>
                  );
                })()}
              </Def>
            )}
            <Def label="Metode Penyusutan">
              {[
                asset.depreciation_method === 'straight_line' ? 'Garis Lurus' : asset.depreciation_method,
                asset.useful_life_years && `${asset.useful_life_years} tahun`,
              ].filter(Boolean).join(' · ') || '—'}
            </Def>
          </dl>
        </Card>
      )}

      {/* INFO DASAR — edit */}
      {activeTab === 'info' && editing && form && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <SectionLabel>Identitas</SectionLabel>
          <ERow label="Nama Aset"><EText value={form.asset.name} onChange={v => setA('name', v)} /></ERow>
          <ERow label="Serial Number"><EText value={form.asset.serial_number} onChange={v => setA('serial_number', v)} mono /></ERow>
          <ERow label="Brand"><EText value={form.asset.brand} onChange={v => setA('brand', v)} placeholder="mis. Dell, HP, Lenovo" /></ERow>
          <ERow label="Model"><EText value={form.asset.model} onChange={v => setA('model', v)} /></ERow>
          <ERow label="Subtype"><ESelect value={form.asset.asset_subtype} onChange={v => setA('asset_subtype', v)} options={SUBTYPE_OPTS} /></ERow>
          <ERow label="Status"><ESelect value={form.asset.status} onChange={v => setA('status', v)} options={STATUS_OPTS} placeholder="— Pilih status —" /></ERow>
          <ERow label="Kondisi">
            {/* flexible: datalist suggestions, but free text (no DB constraint) */}
            <input list="ait-condition-list" value={form.asset.condition ?? ''} onChange={e => setA('condition', e.target.value)}
              placeholder="mis. Baik" style={editInpStyle} />
            <datalist id="ait-condition-list">
              {CONDITION_OPTS.map(c => <option key={c} value={c} />)}
            </datalist>
          </ERow>
          <ERow label="Deskripsi"><EArea value={form.asset.description} onChange={v => setA('description', v)} /></ERow>

          <SectionLabel>Penugasan &amp; Lokasi</SectionLabel>
          <ERow label="Assigned To">
            <ESelect value={form.asset.assigned_to_user_id} onChange={v => setA('assigned_to_user_id', v)}
              options={opts.users.map(u => ({ value: u.id, label: u.full_name }))} placeholder="— Belum di-assign —" />
          </ERow>
          <ERow label="Department">
            <ESelect value={form.asset.department_id} onChange={v => setA('department_id', v)}
              options={opts.departments.map(d => ({ value: d.id, label: `${d.code} - ${d.name}` }))} placeholder="— Tidak ada department —" />
          </ERow>
          <ERow label="Lokasi">
            <ESelect value={form.asset.location_id} onChange={v => setA('location_id', v)}
              options={opts.locations.map(l => ({ value: l.id, label: l.name }))} placeholder="— Tidak ada lokasi —" />
          </ERow>
          <ERow label="Kategori">
            <ESelect value={form.asset.category_id} onChange={v => setA('category_id', v)}
              options={opts.categories.map(c => ({ value: c.id, label: c.name }))} placeholder="— Pilih kategori —" />
          </ERow>

          <SectionLabel>Pengadaan</SectionLabel>
          <ERow label="Nilai Perolehan (Rp)"><ENum value={form.asset.purchase_price} onChange={v => setA('purchase_price', v)} /></ERow>
          <ERow label="Tanggal Perolehan"><EText type="date" value={form.asset.purchase_date} onChange={v => setA('purchase_date', v)} mono /></ERow>
          <ERow label="Vendor / Supplier"><EText value={form.asset.vendor_name} onChange={v => setA('vendor_name', v)} /></ERow>
          <ERow label="Nomor PO / Faktur"><EText value={form.asset.purchase_invoice_no} onChange={v => setA('purchase_invoice_no', v)} mono /></ERow>
          <ERow label="Umur Manfaat (tahun)"><ENum value={form.asset.useful_life_years} onChange={v => setA('useful_life_years', v)} step="1" /></ERow>
          <ERow label="Metode Penyusutan"><ESelect value={form.asset.depreciation_method} onChange={v => setA('depreciation_method', v)} options={DEPR_OPTS} placeholder="— Tidak diset —" /></ERow>
        </Card>
      )}

      {/* SPESIFIKASI — view */}
      {activeTab === 'spec' && !editing && (
        <div>
          {itLoading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>Memuat spesifikasi…</div>
          )}
          {!itLoading && !specs && (
            <Banner tone="info" icon={Cpu}>
              Data spesifikasi belum tersedia untuk aset ini. Spesifikasi dapat diisi melalui tombol Edit.
            </Banner>
          )}
          {!itLoading && specs && (
            <>
              <div className="spec-grid">
                <SpecCard icon={Cpu} label="Processor" value={specs.cpu_model || '—'} rows={[
                  { k: 'Cores / Threads', v: specs.cpu_cores && specs.cpu_threads ? `${specs.cpu_cores}C / ${specs.cpu_threads}T` : null },
                  { k: 'Base / Turbo',    v: specs.cpu_base_ghz && specs.cpu_turbo_ghz ? `${specs.cpu_base_ghz} / ${specs.cpu_turbo_ghz} GHz` : null },
                  { k: 'Cache',           v: specs.cpu_cache_mb ? `${specs.cpu_cache_mb} MB` : null },
                ]} />
                <SpecCard icon={MemoryStick} label="Memory (RAM)"
                  value={specs.ram_gb ? `${specs.ram_gb} GB` : '—'}
                  sub={specs.ram_type}
                  rows={[
                    { k: 'Konfigurasi',    v: specs.ram_slots_used ? `${specs.ram_slots_used} keping SODIMM` : null },
                    { k: 'Slot Terpakai',  v: specs.ram_slots_used && specs.ram_slots_total ? `${specs.ram_slots_used} / ${specs.ram_slots_total}` : null },
                  ]} />
                <SpecCard icon={HardDrive} label="Storage"
                  value={specs.storage_gb ? `${specs.storage_gb} GB` : '—'}
                  sub={specs.storage_type ? `${specs.storage_type} ${specs.storage_interface || ''}`.trim() : undefined}
                  rows={[
                    { k: 'Terpakai', v: specs.storage_used_pct ? `${specs.storage_used_pct}%` : null },
                    { k: 'Interface', v: specs.storage_interface },
                  ]} />
                {specs.display_size_inch && (
                  <SpecCard icon={Monitor} label="Display"
                    value={`${specs.display_size_inch}"`}
                    sub={specs.display_resolution ? `· ${specs.display_resolution}` : undefined}
                    rows={[
                      { k: 'Resolusi',     v: specs.display_resolution },
                      { k: 'Refresh Rate', v: specs.display_refresh_hz ? `${specs.display_refresh_hz} Hz` : null },
                      { k: 'GPU',          v: specs.gpu_model },
                    ]} />
                )}
                <SpecCard icon={Laptop} label="Operating System"
                  value={specs.os_name || '—'}
                  rows={[
                    { k: 'Versi / Build', v: specs.os_version && specs.os_build ? `${specs.os_version} · ${specs.os_build}` : (specs.os_version || null) },
                    { k: 'Arsitektur',    v: specs.os_arch },
                    { k: 'Lisensi',       v: specs.os_license_type },
                  ]} />
                {specs.battery_health_pct != null && (
                  <Card style={{ padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', background: D.accentSoft, color: D.accent }}>
                        <Gauge size={18} strokeWidth={1.8} />
                      </div>
                      <span style={{ fontSize: 11, color: D.inkFaint, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>Battery Health</span>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: D.ink }}>
                      {specs.battery_health_pct}%
                      <small style={{ fontSize: 12.5, fontWeight: 600, color: D.inkFaint }}>
                        {specs.battery_capacity_wh ? ` · ${specs.battery_capacity_wh} Wh` : ''}
                      </small>
                    </div>
                    <Meter pct={specs.battery_health_pct} color={specs.battery_health_pct >= 70 ? D.ok : specs.battery_health_pct >= 40 ? D.warn : D.danger} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: `1px solid ${D.lineSoft}`, paddingTop: 10 }}>
                      {specs.battery_cycle_count != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                          <span style={{ color: D.inkFaint, fontWeight: 600 }}>Cycle Count</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600 }}>{specs.battery_cycle_count}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>

              {/* Additional specs */}
              {(specs.webcam_desc || specs.keyboard_desc || specs.ports_desc || specs.wireless_desc || specs.weight_kg || specs.color) && (
                <Card style={{ marginTop: 14 }}>
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}` }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Spesifikasi Tambahan</span>
                  </div>
                  <dl style={{ margin: 0, padding: '4px 20px 16px' }}>
                    {specs.webcam_desc   && <Def label="Webcam"   value={specs.webcam_desc} />}
                    {specs.keyboard_desc && <Def label="Keyboard" value={specs.keyboard_desc} />}
                    {specs.ports_desc    && <Def label="Port"     value={specs.ports_desc} />}
                    {specs.wireless_desc && <Def label="Wireless" value={specs.wireless_desc} />}
                    {specs.weight_kg     && <Def label="Berat"    value={`${specs.weight_kg} kg`} />}
                    {specs.color         && <Def label="Warna"    value={specs.color} />}
                  </dl>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* SPESIFIKASI — edit */}
      {activeTab === 'spec' && editing && form && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <SectionLabel>Processor</SectionLabel>
          <ERow label="CPU Model"><EText value={form.spec.cpu_model} onChange={v => setS('cpu_model', v)} /></ERow>
          <ERow label="Cores"><ENum value={form.spec.cpu_cores} onChange={v => setS('cpu_cores', v)} step="1" /></ERow>
          <ERow label="Threads"><ENum value={form.spec.cpu_threads} onChange={v => setS('cpu_threads', v)} step="1" /></ERow>
          <ERow label="Base Clock (GHz)"><ENum value={form.spec.cpu_base_ghz} onChange={v => setS('cpu_base_ghz', v)} /></ERow>
          <ERow label="Turbo Clock (GHz)"><ENum value={form.spec.cpu_turbo_ghz} onChange={v => setS('cpu_turbo_ghz', v)} /></ERow>
          <ERow label="Cache (MB)"><ENum value={form.spec.cpu_cache_mb} onChange={v => setS('cpu_cache_mb', v)} step="1" /></ERow>

          <SectionLabel>Memory (RAM)</SectionLabel>
          <ERow label="RAM (GB)"><ENum value={form.spec.ram_gb} onChange={v => setS('ram_gb', v)} step="1" /></ERow>
          <ERow label="Tipe RAM"><EText value={form.spec.ram_type} onChange={v => setS('ram_type', v)} placeholder="mis. DDR4, DDR5" /></ERow>
          <ERow label="Slot Terpakai"><ENum value={form.spec.ram_slots_used} onChange={v => setS('ram_slots_used', v)} step="1" /></ERow>
          <ERow label="Total Slot"><ENum value={form.spec.ram_slots_total} onChange={v => setS('ram_slots_total', v)} step="1" /></ERow>

          <SectionLabel>Storage</SectionLabel>
          <ERow label="Kapasitas (GB)"><ENum value={form.spec.storage_gb} onChange={v => setS('storage_gb', v)} step="1" /></ERow>
          <ERow label="Tipe Storage"><ESelect value={form.spec.storage_type} onChange={v => setS('storage_type', v)} options={STORAGE_TYPE_OPTS} /></ERow>
          <ERow label="Interface"><EText value={form.spec.storage_interface} onChange={v => setS('storage_interface', v)} placeholder="mis. PCIe 4.0, SATA III" /></ERow>
          <ERow label="Terpakai (%)"><ENum value={form.spec.storage_used_pct} onChange={v => setS('storage_used_pct', v)} step="1" /></ERow>

          <SectionLabel>Display &amp; GPU</SectionLabel>
          <ERow label="Ukuran Layar (inch)"><ENum value={form.spec.display_size_inch} onChange={v => setS('display_size_inch', v)} /></ERow>
          <ERow label="Resolusi"><EText value={form.spec.display_resolution} onChange={v => setS('display_resolution', v)} placeholder="mis. 1920x1080" /></ERow>
          <ERow label="Refresh Rate (Hz)"><ENum value={form.spec.display_refresh_hz} onChange={v => setS('display_refresh_hz', v)} step="1" /></ERow>
          <ERow label="GPU Model"><EText value={form.spec.gpu_model} onChange={v => setS('gpu_model', v)} /></ERow>

          <SectionLabel>Operating System</SectionLabel>
          <ERow label="Nama OS"><EText value={form.spec.os_name} onChange={v => setS('os_name', v)} /></ERow>
          <ERow label="Versi"><EText value={form.spec.os_version} onChange={v => setS('os_version', v)} /></ERow>
          <ERow label="Build"><EText value={form.spec.os_build} onChange={v => setS('os_build', v)} mono /></ERow>
          <ERow label="Arsitektur"><EText value={form.spec.os_arch} onChange={v => setS('os_arch', v)} placeholder="mis. x64, ARM64" /></ERow>
          <ERow label="Tipe Lisensi"><EText value={form.spec.os_license_type} onChange={v => setS('os_license_type', v)} /></ERow>

          <SectionLabel>Battery</SectionLabel>
          <ERow label="Kapasitas (Wh)"><ENum value={form.spec.battery_capacity_wh} onChange={v => setS('battery_capacity_wh', v)} /></ERow>
          <ERow label="Health (%)"><ENum value={form.spec.battery_health_pct} onChange={v => setS('battery_health_pct', v)} step="1" /></ERow>
          <ERow label="Cycle Count"><ENum value={form.spec.battery_cycle_count} onChange={v => setS('battery_cycle_count', v)} step="1" /></ERow>

          <SectionLabel>Spesifikasi Tambahan</SectionLabel>
          <ERow label="Webcam"><EText value={form.spec.webcam_desc} onChange={v => setS('webcam_desc', v)} /></ERow>
          <ERow label="Keyboard"><EText value={form.spec.keyboard_desc} onChange={v => setS('keyboard_desc', v)} /></ERow>
          <ERow label="Port"><EText value={form.spec.ports_desc} onChange={v => setS('ports_desc', v)} /></ERow>
          <ERow label="Wireless"><EText value={form.spec.wireless_desc} onChange={v => setS('wireless_desc', v)} /></ERow>
          <ERow label="Berat (kg)"><ENum value={form.spec.weight_kg} onChange={v => setS('weight_kg', v)} /></ERow>
          <ERow label="Warna"><EText value={form.spec.color} onChange={v => setS('color', v)} /></ERow>
        </Card>
      )}

      {/* NETWORK — view */}
      {activeTab === 'net' && !editing && (
        <div>
          {itLoading && <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>}
          {!itLoading && !network && (
            <Banner tone="info" icon={Network}>Data network belum tersedia untuk aset ini.</Banner>
          )}
          {!itLoading && network && (
            <>
              {/* Stat cards */}
              <div className="nx-grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
                {[
                  { label: 'IPv4 Address', val: network.ip_address, sub: 'DHCP · Lease 24j', mono: true },
                  { label: 'Hostname',     val: network.hostname,   sub: null, mono: true },
                  { label: 'Domain',       val: network.domain_workgroup, sub: null, mono: true },
                  { label: 'Status Jaringan', val: isOnline ? 'Online' : 'Offline',
                    sub: lastSeen ? `${fmtDateShort(lastSeen)}` : null,
                    ok: isOnline },
                ].map((c, i) => (
                  <Card key={i} style={{ padding: '13px 15px' }}>
                    <div style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
                    <div style={{ fontSize: c.mono ? 17 : 18, fontWeight: 700,
                      fontFamily: c.mono ? "'IBM Plex Mono', monospace" : undefined,
                      color: c.ok === true ? D.ok : c.ok === false ? D.danger : D.ink, letterSpacing: '-.3px' }}>
                      {c.val || '—'}
                    </div>
                    {c.sub && <div style={{ fontSize: 11.5, color: D.inkFaint, marginTop: 3 }}>{c.sub}</div>}
                  </Card>
                ))}
              </div>

              {/* Network identity deflist */}
              <Card style={{ marginBottom: 14 }}>
                <dl style={{ margin: 0, padding: '4px 20px 16px' }}>
                  <SectionLabel>Identitas Jaringan</SectionLabel>
                  {network.ip_address    && <Def label="IPv4 Address"       value={network.ip_address} mono />}
                  {network.ipv6_address  && <Def label="IPv6 Address"       value={network.ipv6_address} mono />}
                  {network.mac_wifi      && <Def label="MAC Address (Wi-Fi)"value={network.mac_wifi} mono />}
                  {network.mac_lan       && <Def label="MAC Address (LAN)"  value={network.mac_lan} mono />}
                  {network.gateway       && <Def label="Gateway"            value={network.gateway} mono />}
                  {(network.dns_primary || network.dns_secondary) && (
                    <Def label="DNS" mono>
                      {[network.dns_primary, network.dns_secondary].filter(Boolean).join(' · ')}
                    </Def>
                  )}
                  {network.vlan             && <Def label="VLAN"             value={network.vlan} mono />}
                  {network.domain_workgroup && <Def label="Domain/Workgroup" value={network.domain_workgroup} />}
                </dl>
              </Card>

              {/* Interfaces table */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}` }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Network Interfaces</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="ait-tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr><th>Interface</th><th>MAC Address</th><th>IP Address</th><th>Tipe</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {network.mac_wifi && (
                        <tr>
                          <td style={{ fontWeight: 600 }}>Wi-Fi {specs?.wireless_desc ? `(${specs.wireless_desc.split(' ')[0]} ${specs.wireless_desc.split(' ')[1]})` : ''}</td>
                          <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkSoft }}>{network.mac_wifi}</td>
                          <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>{network.ip_address || '—'}</td>
                          <td style={{ color: D.inkSoft }}>Wireless · Wi-Fi 6</td>
                          <td>
                            <span style={{ display:'inline-flex',alignItems:'center',gap:5,fontSize:11.5,fontWeight:600,padding:'3px 9px',borderRadius:20,border:`1px solid ${isOnline ? D.okBd : D.neutralBd}`,background:isOnline ? D.okBg : D.neutralBg,color:isOnline ? D.ok : D.neutral }}>
                              <span style={{ width:5,height:5,borderRadius:'50%',background:isOnline ? D.ok : D.neutral }} />
                              {isOnline ? 'Connected' : 'Disconnected'}
                            </span>
                          </td>
                        </tr>
                      )}
                      {network.mac_lan && (
                        <tr>
                          <td style={{ fontWeight: 600 }}>Ethernet (RJ-45)</td>
                          <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkSoft }}>{network.mac_lan}</td>
                          <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkFaint }}>—</td>
                          <td style={{ color: D.inkSoft }}>Gigabit LAN</td>
                          <td>
                            <span style={{ display:'inline-flex',alignItems:'center',gap:5,fontSize:11.5,fontWeight:600,padding:'3px 9px',borderRadius:20,border:`1px solid ${D.neutralBd}`,background:D.neutralBg,color:D.neutral }}>
                              <span style={{ width:5,height:5,borderRadius:'50%',background:D.neutral }} />Disconnected
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* NETWORK — edit */}
      {activeTab === 'net' && editing && form && (
        <Card style={{ padding: '4px 20px 16px' }}>
          <SectionLabel>Identitas Jaringan</SectionLabel>
          <ERow label="IPv4 Address"><EText value={form.net.ip_address} onChange={v => setN('ip_address', v)} mono placeholder="mis. 192.168.1.20" /></ERow>
          <ERow label="IPv6 Address"><EText value={form.net.ipv6_address} onChange={v => setN('ipv6_address', v)} mono /></ERow>
          <ERow label="MAC Address (Wi-Fi)"><EText value={form.net.mac_wifi} onChange={v => setN('mac_wifi', v)} mono /></ERow>
          <ERow label="MAC Address (LAN)"><EText value={form.net.mac_lan} onChange={v => setN('mac_lan', v)} mono /></ERow>
          <ERow label="Hostname"><EText value={form.net.hostname} onChange={v => setN('hostname', v)} mono /></ERow>
          <ERow label="Gateway"><EText value={form.net.gateway} onChange={v => setN('gateway', v)} mono /></ERow>
          <ERow label="DNS Primary"><EText value={form.net.dns_primary} onChange={v => setN('dns_primary', v)} mono /></ERow>
          <ERow label="DNS Secondary"><EText value={form.net.dns_secondary} onChange={v => setN('dns_secondary', v)} mono /></ERow>
          <ERow label="VLAN"><EText value={form.net.vlan} onChange={v => setN('vlan', v)} mono /></ERow>
          <ERow label="Domain / Workgroup"><EText value={form.net.domain_workgroup} onChange={v => setN('domain_workgroup', v)} /></ERow>
          <ERow label="Status Jaringan"><ESelect value={form.net.is_online} onChange={v => setN('is_online', v)} options={ONLINE_OPTS} placeholder="— Pilih —" /></ERow>
        </Card>
      )}

      {/* HEALTH SCORE */}
      {activeTab === 'health' && (
        <div>
          {/* Overview */}
          <Card style={{ marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 26,
              alignItems: 'center', padding: '22px 24px' }}>
              <HealthGauge score={health.total} label={health.label} tone={health.tone} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, letterSpacing: '-.4px' }}>
                  Device Health Score
                </h3>
                <div style={{ fontSize: 13, color: D.inkSoft }}>
                  Skor kesehatan berdasarkan 4 parameter utama · {asset.asset_code}
                </div>
                <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 16 }}>
                  {[
                    { k: 'Status',   v: health.label, color: health.tone === 'ok' ? D.ok : health.tone === 'warn' ? D.warn : D.danger },
                    { k: 'Kondisi Fisik', v: `${health.physical}/25` },
                    { k: 'Hardware',      v: `${health.hardware}/25` },
                    { k: 'Software',      v: `${health.security}/25` },
                    { k: 'Ketersediaan',  v: `${health.availability}/25` },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px', color: D.inkFaint, fontWeight: 700 }}>{s.k}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: s.color || D.ink }}>{s.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: `1px solid ${D.lineSoft}` }}>
                  {[
                    { color: D.danger, label: '0–40 · Poor' },
                    { color: D.warn,   label: '41–70 · Fair' },
                    { color: D.ok,     label: '71–100 · Good' },
                  ].map((l, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: D.inkSoft, fontWeight: 600 }}>
                      <div style={{ width: 11, height: 11, borderRadius: 3, background: l.color }} />{l.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Category breakdown */}
          <div className="hcat-grid">
            <HCatCard icon={Laptop} title="Kondisi Fisik" score={health.physical} maxScore={25}
              items={[
                { ok: asset.status === 'active', warn: asset.status === 'in_repair', text: `Status aset: ${asset.status === 'active' ? 'Aktif' : asset.status}`, pts: `${Math.min(health.physical, 20)}/20` },
              ]} />
            <HCatCard icon={Cpu} title="Performa Hardware" score={health.hardware} maxScore={25}
              items={[
                specs?.battery_health_pct != null
                  ? { ok: specs.battery_health_pct >= 70, warn: specs.battery_health_pct >= 40 && specs.battery_health_pct < 70, text: `Battery health: ${specs.battery_health_pct}%`, pts: `${health.hardware}/25` }
                  : { ok: true, text: 'Data hardware belum tersedia', pts: `${health.hardware}/25` },
              ]} />
            <HCatCard icon={Shield} title="Software & Keamanan" score={health.security} maxScore={25}
              items={[
                { ok: expiredCount === 0, warn: expiredCount === 0 && soonCount > 0, text: expiredCount > 0 ? `${expiredCount} lisensi expired` : soonCount > 0 ? `${soonCount} lisensi akan habis` : 'Semua lisensi aktif' },
                { ok: software.length > 0, text: `${software.length} software terdaftar` },
              ]} />
            <HCatCard icon={Clock} title="Utilisasi & Ketersediaan" score={health.availability} maxScore={25}
              items={[
                { ok: asset.status === 'active', text: `Status: ${asset.status === 'active' ? 'Aktif & digunakan' : asset.status}`, pts: `${health.availability}/25` },
                { ok: !!asset.assigned_to_name, text: asset.assigned_to_name ? `Assigned: ${asset.assigned_to_name}` : 'Belum di-assign' },
              ]} />
          </div>
        </div>
      )}

      {/* SOFTWARE & LISENSI */}
      {/* TODO(asset-edit): Software & Lisensi + Maintenance adalah list multi-row —
          inline-edit per baris (add/edit/delete) dikerjakan terpisah, di luar scope
          inline-edit Info/Spec/Network ini. Tab ini tetap read-only saat edit mode. */}
      {activeTab === 'sw' && (
        <div>
          {itLoading && <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>}
          {!itLoading && (
            <>
              {(expiredCount > 0 || soonCount > 0) && (
                <div style={{ marginBottom: 14 }}>
                  <Banner tone={expiredCount > 0 ? 'danger' : 'warn'} icon={AlertTriangle}>
                    {expiredCount > 0 && <><b>{expiredCount} lisensi expired.</b> Perlu perpanjangan segera. </>}
                    {soonCount > 0 && <><b>{soonCount} lisensi akan kedaluwarsa</b> dalam 30 hari ke depan.</>}
                  </Banner>
                </div>
              )}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  borderBottom: `1px solid ${D.lineSoft}`, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Software &amp; Lisensi</span>
                  <div style={{ flex: 1 }} />
                  <Btn icon={Plus} primary small>Tambah Software</Btn>
                  <Btn icon={Download} small>Export</Btn>
                </div>
                {software.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>
                    Belum ada data software &amp; lisensi.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="ait-tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr><th>Software</th><th>Versi</th><th>Tipe Lisensi</th><th>License Key</th><th>Expiry</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {software.map(sw => {
                          const revealed = revealedKeys.has(sw.id);
                          return (
                            <tr key={sw.id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                  <span style={{ width: 28, height: 28, borderRadius: 7, background: D.bgAlt,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Package size={14} color={D.inkSoft} strokeWidth={1.8} />
                                  </span>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{sw.software_name}</div>
                                    {sw.category && <div style={{ fontSize: 11.5, color: D.inkFaint }}>{sw.category}</div>}
                                  </div>
                                </div>
                              </td>
                              <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: D.inkSoft }}>
                                {sw.version || '—'}
                              </td>
                              <td>{sw.license_type}</td>
                              <td>
                                {sw.license_key_masked ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: '.5px' }}>
                                    {revealed ? sw.license_key_masked : sw.license_key_masked.replace(/[A-Z0-9]/g, '·')}
                                    <button onClick={() => toggleKeyReveal(sw.id)} style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none',
                                      border: 'none', cursor: 'pointer', color: D.accent, fontFamily: "'Inter', sans-serif",
                                      fontSize: 11.5, fontWeight: 600, padding: 0 }}>
                                      {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                    </button>
                                  </span>
                                ) : (
                                  <span style={{ color: D.inkFaint }}>—</span>
                                )}
                              </td>
                              <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
                                color: sw.status === 'expired' ? D.danger : D.inkSoft }}>
                                {sw.expiry_date ? fmtDateShort(sw.expiry_date) : (sw.license_type === 'Open Source' || sw.license_type === 'Freeware' ? 'Free' : 'Perpetual')}
                              </td>
                              <td><LicenseBadge status={sw.status} expiryDate={sw.expiry_date} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* MAINTENANCE */}
      {activeTab === 'mtc' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignItems: 'start' }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}` }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Riwayat Maintenance</span>
              <Btn icon={Plus} primary small>Tambah Maintenance</Btn>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {itLoading && <div style={{ textAlign: 'center', color: D.inkFaint, fontSize: 13 }}>Memuat…</div>}
              {!itLoading && maintenance.length === 0 && (
                <div style={{ textAlign: 'center', color: D.inkFaint, fontSize: 13, padding: '24px 0' }}>
                  Belum ada data maintenance.
                </div>
              )}
              {!itLoading && maintenance.map((m, i) => (
                <TlItem
                  key={m.id}
                  title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {m.description?.substring(0, 50) || 'Maintenance'}
                    <MtcTypeBadge type={m.maintenance_type} />
                  </span>}
                  date={fmtDateShort(m.maintenance_date)}
                  desc={m.description}
                  warn={m.maintenance_type === 'korektif'}
                  muted={i >= 2}
                  meta={[
                    m.technician_name && `👤 ${m.technician_name}`,
                    m.duration_minutes && `⏱ ${m.duration_minutes >= 60 ? `${Math.floor(m.duration_minutes / 60)}j ${m.duration_minutes % 60 > 0 ? m.duration_minutes % 60 + 'm' : ''}`.trim() : `${m.duration_minutes} mnt`}`,
                    m.cost && `💰 ${fmtRupiah(m.cost)}`,
                  ].filter(Boolean)}
                />
              ))}
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600, marginBottom: 4 }}>Total Biaya Maintenance</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: D.ink }}>
                {totalMtcCost > 0 ? fmtRupiah(totalMtcCost) : '—'}
              </div>
              {maintenance.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: `1px solid ${D.lineSoft}`, marginTop: 12, paddingTop: 12 }}>
                  {['upgrade','korektif','preventif','inspeksi'].map(type => {
                    const total = maintenance.filter(m => m.maintenance_type === type).reduce((s, m) => s + Number(m.cost || 0), 0);
                    if (!total) return null;
                    return (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                        <span style={{ color: D.inkSoft }}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600 }}>{fmtRupiah(total)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            {nextMtc && (
              <Card style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: D.inkSoft, fontWeight: 600, marginBottom: 8 }}>Jadwal Berikutnya</div>
                <Banner tone="warn" icon={Clock}>
                  <span style={{ fontWeight: 700 }}>Maintenance Terjadwal</span>
                  <br /><span style={{ fontWeight: 500, fontSize: 12 }}>
                    {fmtDate(nextMtc.next_scheduled_date)}
                  </span>
                </Banner>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {activeTab === 'hist' && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: `1px solid ${D.lineSoft}` }}>
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

      {/* Save feedback toast */}
      {toast.show && (
        <div style={{
          position: 'fixed', right: 24, bottom: 24, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 9,
          background: toast.tone === 'ok' ? '#1B4D8A' : D.danger, color: '#fff',
          padding: '11px 15px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: '0 12px 30px rgba(10,20,40,.28)',
        }}>
          {toast.tone === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
