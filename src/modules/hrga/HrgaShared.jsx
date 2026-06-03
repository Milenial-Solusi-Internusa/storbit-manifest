/* eslint-disable react-refresh/only-export-components */
// src/modules/hrga/HrgaShared.jsx
// Barrel: exports shared components + re-exports design tokens from hrga-tokens.js.

import { useState } from 'react';
import {
  Search, ChevronDown, ChevronLeft, ChevronRight, RefreshCw,
  FileText, Briefcase, Wrench, Wallet, Map, Tag,
} from 'lucide-react';
import { D, STATUS_HRGA, CATEGORY_CONFIG_DATA } from './hrga-tokens';

// Re-export everything from hrga-tokens for convenience
export { D, STATUS_HRGA, CATEGORY_CONFIG_DATA };
export {
  fmtDate, fmtDateLong, fmtRupiah, daysUntil, initials, avatarBg, HRGA_TABLE_CSS,
} from './hrga-tokens';

// ─────────────────────────────────────────────────────────────
// CATEGORY_CONFIG — merges data + icons
// ─────────────────────────────────────────────────────────────
const CATEGORY_ICONS = {
  ADM: FileText,
  AST: Tag,
  FAC: Wrench,
  FIN: Wallet,
  TRV: Map,
  HRD: Briefcase,
};

export const CATEGORY_CONFIG = Object.fromEntries(
  Object.entries(CATEGORY_CONFIG_DATA).map(([k, v]) => [k, { ...v, icon: CATEGORY_ICONS[k] || Tag }])
);

// ─────────────────────────────────────────────────────────────
// Status color map
// ─────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  ok:      { bg: D.okBg,      color: D.ok,      bd: D.okBd      },
  warn:    { bg: D.warnBg,    color: D.warn,     bd: D.warnBd    },
  danger:  { bg: D.dangerBg,  color: D.danger,   bd: D.dangerBd  },
  info:    { bg: D.infoBg,    color: D.info,     bd: D.infoBd    },
  neutral: { bg: D.neutralBg, color: D.neutral,  bd: D.neutralBd },
};

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

export function Card({ children, style }) {
  return (
    <div style={{ background:D.surface, border:`1px solid ${D.line}`,
      borderRadius:10, boxShadow:D.shadowSm, ...style }}>
      {children}
    </div>
  );
}

export function HrgaStatusBadge({ status }) {
  const cfg = STATUS_HRGA[status] || { label:status, type:'neutral' };
  const { bg, color, bd } = STATUS_COLOR[cfg.type] || STATUS_COLOR.neutral;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5,
      fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:20,
      border:`1px solid ${bd}`, background:bg, color, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:color }} />
      {cfg.label}
    </span>
  );
}

export function TypePill({ categoryCode, typeName }) {
  const cfg = CATEGORY_CONFIG[categoryCode] || { label:categoryCode, bg:D.neutralBg, color:D.neutral, bd:D.neutralBd, icon:Tag };
  const Icon = cfg.icon;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6,
      fontSize:11.5, fontWeight:600, padding:'3px 9px', borderRadius:6,
      border:`1px solid ${cfg.bd}`, background:cfg.bg, color:cfg.color, whiteSpace:'nowrap' }}>
      <Icon size={12} strokeWidth={1.9} />
      {typeName || cfg.label}
    </span>
  );
}

export function CoBadge({ code }) {
  if (!code) return null;
  const co = code.toLowerCase();
  const cfg = { msi:[D.msiBg,D.msi], jci:[D.jciBg,D.jci], sbi:[D.sbiBg,D.sbi] };
  const [bg, color] = cfg[co] || [D.neutralBg, D.neutral];
  return (
    <span style={{ display:'inline-flex', fontSize:11.5, fontWeight:700, padding:'2px 8px',
      borderRadius:6, background:bg, color, fontFamily:"'IBM Plex Mono', monospace" }}>
      {code.toUpperCase()}
    </span>
  );
}

const AV_COLORS_AVATAR = ['#2F6B3F','#2A5B8C','#9A5B2C','#6B6F5E','#7A4E8C','#1F6B6B','#8C6B1A'];
export function Avatar({ name, size = 28 }) {
  if (!name) return null;
  const init = (name || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const bg = AV_COLORS_AVATAR[(init.charCodeAt(0) || 0) % AV_COLORS_AVATAR.length];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:7 }}>
      <span style={{ width:size, height:size, borderRadius:'50%', flexShrink:0,
        background:bg, color:'#fff', display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:size*0.38, fontWeight:700 }}>
        {init}
      </span>
      <span style={{ fontSize:13, fontWeight:500 }}>{name}</span>
    </span>
  );
}

export function Btn({ icon: Icon, children, danger, primary, small, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display:'inline-flex', alignItems:'center', gap:7,
        height:small?32:36, padding:`0 ${small?10:14}px`, borderRadius:8,
        fontSize:small?12.5:13, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
        border:`1px solid ${danger?D.dangerBd:primary?D.accent:D.line}`,
        background: primary?(hover?D.accentInk:D.accent):danger?(hover?D.dangerBg:D.surface):(hover?D.bgAlt:D.surface),
        color: primary?'#fff':danger?D.danger:D.inkSoft,
        opacity:disabled?.5:1, transition:'background .12s', fontFamily:'inherit' }}>
      {Icon && <Icon size={small?13:14} strokeWidth={1.8} />}{children}
    </button>
  );
}

export function Banner({ tone = 'warn', icon: Icon, children }) {
  const map = { warn:{bg:D.warnBg,bd:D.warnBd,ic:D.warn}, danger:{bg:D.dangerBg,bd:D.dangerBd,ic:D.danger}, info:{bg:D.infoBg,bd:D.infoBd,ic:D.info}, ok:{bg:D.okBg,bd:D.okBd,ic:D.ok} };
  const t = map[tone] || map.warn;
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px',
      borderRadius:8, background:t.bg, border:`1px solid ${t.bd}`, fontSize:13, color:D.ink, marginBottom:14 }}>
      {Icon && <Icon size={15} strokeWidth={2} color={t.ic} style={{ marginTop:1, flexShrink:0 }} />}
      <span>{children}</span>
    </div>
  );
}

export function FilterBar({ search, onSearch, placeholder = 'Cari…', children, onRefresh }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px',
      borderBottom:`1px solid ${D.lineSoft}`, flexWrap:'wrap' }}>
      <div style={{ position:'relative', minWidth:220 }}>
        <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:D.inkFaint }} />
        <input value={search} onChange={e => onSearch(e.target.value)}
          placeholder={placeholder}
          style={{ height:34, width:'100%', borderRadius:8, border:`1px solid ${D.line}`,
            background:D.surface2, padding:'0 10px 0 30px', fontSize:13, fontFamily:'inherit',
            color:D.ink, outline:'none', boxSizing:'border-box' }}
          onFocus={e => e.target.style.borderColor=D.accent}
          onBlur={e => e.target.style.borderColor=D.line} />
      </div>
      {children}
      <div style={{ flex:1 }} />
      {onRefresh && (
        <button onClick={onRefresh} title="Refresh"
          style={{ width:34, height:34, borderRadius:8, border:`1px solid ${D.line}`,
            background:D.surface, cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', color:D.inkSoft }}>
          <RefreshCw size={14} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total || 1);
  const to   = Math.min(page * pageSize, total);
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'12px 16px', borderTop:`1px solid ${D.lineSoft}`, gap:10, flexWrap:'wrap' }}>
      <span style={{ fontSize:12.5, color:D.inkFaint }}>
        Menampilkan <b style={{ color:D.ink }}>{from}–{to}</b> dari <b style={{ color:D.ink }}>{total || 0}</b>
      </span>
      <div style={{ display:'flex', gap:4 }}>
        <button onClick={() => onPage(Math.max(1,page-1))} disabled={page===1}
          style={{ width:32, height:32, borderRadius:8, border:`1px solid ${D.line}`,
            background:D.surface, cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', opacity:page===1?.4:1, color:D.inkSoft }}>
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_,i) => i+1).map(n => (
          <button key={n} onClick={() => onPage(n)}
            style={{ minWidth:32, height:32, borderRadius:8, fontWeight:600, fontSize:12.5,
              border:`1px solid ${n===page?D.accent:D.line}`,
              background:n===page?D.accent:D.surface,
              color:n===page?'#fff':D.inkSoft, cursor:'pointer' }}>
            {n}
          </button>
        ))}
        <button onClick={() => onPage(Math.min(totalPages,page+1))} disabled={page===totalPages}
          style={{ width:32, height:32, borderRadius:8, border:`1px solid ${D.line}`,
            background:D.surface, cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', opacity:page===totalPages?.4:1, color:D.inkSoft }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, sub, tone }) {
  const toneStyle = {
    ok:     { bg:D.okBg,      bd:D.okBd,      ic:{bg:D.okBg,     color:D.ok}   },
    warn:   { bg:D.warnBg,    bd:D.warnBd,    ic:{bg:D.warnBg,   color:D.warn} },
    danger: { bg:D.dangerBg,  bd:D.dangerBd,  ic:{bg:D.dangerBg, color:D.danger}},
    default:{ bg:D.surface,   bd:D.line,      ic:{bg:D.accentSoft,color:D.accent}},
  };
  const t = toneStyle[tone] || toneStyle.default;
  return (
    <div style={{ background:t.bg, border:`1px solid ${t.bd}`, borderRadius:10,
      padding:'13px 15px', boxShadow:D.shadowSm }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:12, color:D.inkSoft, fontWeight:600 }}>{label}</span>
        <span style={{ width:30, height:30, borderRadius:8, display:'flex', alignItems:'center',
          justifyContent:'center', ...t.ic }}>
          {Icon && <Icon size={15} strokeWidth={1.8} />}
        </span>
      </div>
      <div style={{ fontSize:24, fontWeight:800, letterSpacing:-1, color:D.ink }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize:11.5, color:D.inkFaint, marginTop:3 }}>{sub}</div>}
    </div>
  );
}

export function EmptyRow({ colspan, message = 'Tidak ada data.' }) {
  return (
    <tr>
      <td colSpan={colspan} style={{ padding:'2.5rem', textAlign:'center', color:D.inkFaint, fontSize:13 }}>
        {message}
      </td>
    </tr>
  );
}

export function LoadingRow({ colspan }) {
  return (
    <tr>
      <td colSpan={colspan} style={{ padding:'2.5rem', textAlign:'center', color:D.inkFaint, fontSize:13 }}>
        Memuat data…
      </td>
    </tr>
  );
}

export function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display:'inline-flex', alignItems:'center', gap:6, height:34, padding:'0 10px',
          borderRadius:8, border:`1px solid ${D.line}`, background:D.surface, cursor:'pointer',
          fontSize:12.5, fontWeight:600, color:D.inkSoft, fontFamily:'inherit', whiteSpace:'nowrap' }}>
        {selected?.label || label}
        <ChevronDown size={13} />
      </button>
      {open && (
        <>
          <div style={{ position:'fixed', inset:0, zIndex:40 }} onClick={() => setOpen(false)} />
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50,
            background:D.surface, border:`1px solid ${D.line}`, borderRadius:10,
            boxShadow:D.shadow, minWidth:170, overflow:'hidden' }}>
            {options.map(opt => (
              <button key={String(opt.value ?? 'all')} onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:0,
                  cursor:'pointer', fontSize:13, textAlign:'left', fontFamily:'inherit',
                  color: opt.value === value ? D.accent : D.ink, fontWeight: opt.value === value ? 700 : 500 }}
                onMouseEnter={e => e.currentTarget.style.background=D.bgAlt}
                onMouseLeave={e => e.currentTarget.style.background='none'}>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
