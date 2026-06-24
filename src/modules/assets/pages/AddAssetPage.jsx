// src/modules/assets/pages/AddAssetPage.jsx
// Asset Management — Tambah Aset (multi-step intake wizard)
// Ported from the Claude Design bundle. Steps + fields are driven entirely by
// the pre-selected category (AddAssetData.js → AA_CATS[categoryCode]).
//
// Props: { categoryCode, onBack, onSuccess }
//   categoryCode : "IT-EQP" | "VEH" | "FURN" | "BLDG"  (default IT-EQP)
//   onBack       : () => void   — invoked when user leaves the form
//   onSuccess    : () => void   — invoked after a successful (simulated) save
//
// Self-contained within the assets module: local brand tokens, a lucide-react
// Icon wrapper, Toggle, and a page-local style block. "Simpan Aset" inserts a
// real row into `assets` (+ asset_specifications / asset_network for IT-EQP),
// then calls onSuccess(). category_id is resolved by looking up asset_categories
// (company_id + code = categoryCode). Constrained columns (asset_subtype /
// status / fuel_type) are mapped from the Indonesian form labels to the DB
// CHECK values; unmappable values fall back to a safe default.

import React, { useState, useEffect } from 'react';
import {
  Monitor, Car, Sofa, Building2, Cpu, MemoryStick, HardDrive, Zap, Disc,
  Battery, Box, Network, Gauge, Tag, Layers, Wallet, MapPin, Globe2, FileText,
  Shield, ChevronRight, ChevronDown, ChevronUp, Calendar, Check, X, ArrowLeft,
  ArrowRight, AlertTriangle, Info, Lock, Pencil, Loader, CheckCircle2,
} from 'lucide-react';
import { AA_CATS, AA_VEH_DOCS, AA_STATUS_TONE } from '../AddAssetData';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/useAuth';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../../lib/auditLogger';

/* ---------- brand tokens (MSI Brand Guideline v1.0) ---------- */
const NAVY = '#144682', ORANGE = '#E85A1E', ORANGE_DK = '#D14E18',
  CREAM = '#F6EFE3', SURFACE = '#FFFDF8', LINE = '#E5E0D8', LINE_SOFT = '#EFE9DD',
  INK = '#16243A', INK_SOFT = '#4A5360', MUTED = '#6B7280', FAINT = '#9CA3AF',
  DANGER = '#DC2626', GREEN = '#1F8B4D';
const FONT_HEAD = "'Montserrat', system-ui, sans-serif";
const FONT_BODY = "'Inter', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ---------- lucide-backed Icon (name → component) ---------- */
const ICONS = {
  monitor: Monitor, car: Car, sofa: Sofa, building: Building2, cpu: Cpu,
  memory: MemoryStick, harddrive: HardDrive, gpu: Zap, disc: Disc, battery: Battery,
  box: Box, network: Network, gauge: Gauge, tag: Tag, layers: Layers, wallet: Wallet,
  mappin: MapPin, globe2: Globe2, filetext: FileText, shield: Shield,
  chevright: ChevronRight, chevdown: ChevronDown, chevup: ChevronUp, calendar: Calendar,
  check: Check, x: X, arrowleft: ArrowLeft, arrowright: ArrowRight, alert: AlertTriangle,
  info: Info, lock: Lock, pencil: Pencil, loader: Loader, checkcircle: CheckCircle2,
};
function Icon({ name, size = 18, color, style, strokeWidth = 1.7 }) {
  const Cmp = ICONS[name] || Info;
  return <Cmp size={size} color={color || 'currentColor'} strokeWidth={strokeWidth} style={{ display: 'block', flex: '0 0 auto', ...style }} />;
}

/* ---------- toggle (sliding, orange when on) ---------- */
function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!on)}
      style={{ width: 44, height: 25, borderRadius: 20, border: 'none', padding: 0, position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', background: on ? ORANGE : '#CFC8BA', opacity: disabled ? 0.5 : 1, transition: 'background .25s ease', flex: '0 0 44px' }}>
      <span style={{ position: 'absolute', top: 3, left: 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transform: on ? 'translateX(19px)' : 'translateX(0)', transition: 'transform .25s cubic-bezier(.22,1,.36,1)' }} />
    </button>
  );
}

/* ---------- formatters ---------- */
const AA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function aaFmtDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return Number(p[2]) + ' ' + (AA_MONTHS[Number(p[1]) - 1] || p[1]) + ' ' + p[0];
}
const aaDigits = (s) => String(s == null ? '' : s).replace(/[^0-9]/g, '');
const aaGroup = (s) => { const d = aaDigits(s); return d ? Number(d).toLocaleString('id-ID') : ''; };

/* ---------- DB value coercion (form → insert payload) ---------- */
// empty / whitespace → null (so we send NULL, never an empty string)
const aaTxt = (v) => { const s = v == null ? '' : String(v).trim(); return s === '' ? null : s; };
const aaNum = (v) => { const s = aaTxt(v); if (s == null) return null; const n = Number(s); return isNaN(n) ? null : n; };
const aaInt = (v) => { const n = aaNum(v); return n == null ? null : Math.trunc(n); };

// Map Indonesian form labels → DB CHECK-constraint values (assets table).
const AA_SUBTYPE_MAP = {
  'Laptop': 'laptop', 'Desktop/PC': 'desktop', 'Server': 'server',
  'Printer': 'printer', 'Network Device': 'network', 'Peripheral': 'peripheral',
};
const aaMapSubtype = (v) => { const s = aaTxt(v); return s == null ? null : (AA_SUBTYPE_MAP[s] || 'other'); };
const AA_STATUS_MAP = {
  'Aktif': 'active', 'Dalam Perbaikan': 'in_repair', 'Dalam Renovasi': 'in_repair',
  'Rusak': 'in_repair', 'Tidak Aktif': 'retired',
};
const aaMapStatus = (v) => { const s = aaTxt(v); return s == null ? 'active' : (AA_STATUS_MAP[s] || 'active'); };
const AA_FUEL_MAP = { 'Bensin': 'bensin', 'Solar': 'solar', 'Listrik': 'listrik', 'Hybrid': 'other' };
const aaMapFuel = (v) => { const s = aaTxt(v); return s == null ? null : (AA_FUEL_MAP[s] || 'other'); };

/* ---------- focus-ring helpers ---------- */
const AA_RING = '0 0 0 3px rgba(20,70,130,.16)';
function aaBorder(focus, err) { return '1px solid ' + (err ? DANGER : focus ? NAVY : LINE); }

/* =========================================================================
   PAGE-LOCAL STYLE BLOCK
   ========================================================================= */
function AAStyles() {
  return (
    <style>{`
      @keyframes aa-fade { 0% { transform: translateY(8px); } 100% { transform: translateY(0); } }
      @keyframes aa-prog { 0% { transform: translateY(4px) scale(.96); } 100% { transform: translateY(0) scale(1); } }
      @keyframes ak-spin { to { transform: rotate(360deg); } }
      @keyframes ak-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
      @media (prefers-reduced-motion: no-preference) {
        .aa-fade { animation: aa-fade .34s cubic-bezier(.22,1,.36,1) both; }
        .aa-prog { animation: aa-prog .3s ease both; }
      }
      .ak-spin { animation: ak-spin .8s linear infinite; }
      .aa-range { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 6px; background: ${LINE}; outline: none; cursor: pointer; }
      .aa-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid ${NAVY}; box-shadow: 0 1px 4px rgba(20,40,70,.3); cursor: pointer; transition: transform .12s; }
      .aa-range::-webkit-slider-thumb:active { transform: scale(1.12); }
      .aa-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid ${NAVY}; box-shadow: 0 1px 4px rgba(20,40,70,.3); cursor: pointer; }
      .aa-input::placeholder, .aa-area::placeholder { color: ${FAINT}; opacity: 1; }
      .aa-input:focus, .aa-area:focus, .aa-select:focus { outline: none; }
    `}</style>
  );
}

/* =========================================================================
   FIELD SHELL — label + required mark + control + error
   ========================================================================= */
function AAFieldShell({ field, error, children }) {
  const w = field.w || 'half';
  const flex = w === 'full' ? '1 1 100%' : w === 'third' ? '1 1 calc(33.333% - 11px)' : '1 1 calc(50% - 8px)';
  const minW = w === 'full' ? 0 : w === 'third' ? 170 : 210;
  return (
    <div style={{ flex, minWidth: minW, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
        {field.label}
        {field.req && <span style={{ color: ORANGE, fontWeight: 700 }}>*</span>}
        {field.unit && <span style={{ marginLeft: 'auto', fontFamily: FONT_MONO, fontSize: 11, color: FAINT, fontWeight: 500 }}>{field.unit}</span>}
      </label>
      {children}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: DANGER, fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 500 }}>
          <Icon name="x" size={12} color={DANGER} strokeWidth={2.6} />{error}
        </div>
      )}
      {field.hint && !error && (
        <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: FAINT }}>{field.hint}</div>
      )}
    </div>
  );
}

/* ---------- text / mono input ---------- */
function AATextInput({ field, value, err, onChange }) {
  const [f, setF] = useState(false);
  const mono = field.type === 'mono';
  return (
    <input className="aa-input" value={value || ''} placeholder={field.ph || ''}
      onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ width: '100%', height: 44, borderRadius: 11, border: aaBorder(f, err),
        background: mono ? 'rgba(246,239,227,.55)' : SURFACE, padding: '0 13px',
        fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: mono ? 13.5 : 14, fontWeight: 500,
        letterSpacing: mono ? 0.3 : 0, color: INK, boxShadow: f ? AA_RING : 'none',
        transition: 'border-color .18s, box-shadow .18s' }} />
  );
}

/* ---------- select ---------- */
function AASelect({ field, value, err, onChange }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <select className="aa-select" value={value || ''} onChange={(e) => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: '100%', height: 44, borderRadius: 11, border: aaBorder(f, err), background: SURFACE,
          padding: '0 36px 0 13px', fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500,
          color: value ? INK : FAINT, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer',
          boxShadow: f ? AA_RING : 'none', transition: 'border-color .18s, box-shadow .18s' }}>
        <option value="" disabled>Pilih…</option>
        {field.options.map((o) => <option key={o} value={o} style={{ color: INK }}>{o}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }}>
        <Icon name="chevdown" size={16} />
      </span>
    </div>
  );
}

/* ---------- date ---------- */
function AADate({ value, err, onChange }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: '100%', height: 44, borderRadius: 11, border: aaBorder(f, err), background: SURFACE,
          padding: '0 38px 0 13px', fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500,
          color: value ? INK : FAINT, boxShadow: f ? AA_RING : 'none', colorScheme: 'light',
          transition: 'border-color .18s, box-shadow .18s' }} />
      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }}>
        <Icon name="calendar" size={16} />
      </span>
    </div>
  );
}

/* ---------- money (Rp, live thousand separators) ---------- */
function AAMoney({ value, err, onChange }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 44, borderRadius: 11,
      border: aaBorder(f, err), background: SURFACE, boxShadow: f ? AA_RING : 'none',
      transition: 'border-color .18s, box-shadow .18s', overflow: 'hidden' }}>
      <span style={{ paddingLeft: 13, paddingRight: 9, fontFamily: FONT_MONO, fontSize: 13.5, fontWeight: 600, color: f ? NAVY : MUTED, borderRight: '1px solid ' + LINE, alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>Rp</span>
      <input value={aaGroup(value)} placeholder="0" inputMode="numeric"
        onChange={(e) => onChange(aaDigits(e.target.value))} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', padding: '0 13px',
          fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600, color: INK, outline: 'none', textAlign: 'right' }} />
    </div>
  );
}

/* ---------- number spinner button (hoisted to avoid per-render component) ---------- */
function AASpinBtn({ dir, onBump }) {
  const [h, setH] = useState(false);
  return (
    <button type="button" tabIndex={-1} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onBump}
      style={{ flex: 1, width: 26, border: 'none', borderLeft: '1px solid ' + LINE, background: h ? NAVY : 'transparent',
        color: h ? '#fff' : MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .14s' }}>
      <Icon name={dir > 0 ? 'chevup' : 'chevdown'} size={13} strokeWidth={2.4} />
    </button>
  );
}

/* ---------- number with hover +/- spinner ---------- */
function AANumber({ field, value, err, onChange }) {
  const [f, setF] = useState(false);
  const [hov, setHov] = useState(false);
  const min = field.min != null ? field.min : 0;
  const max = field.max != null ? field.max : 9999999;
  const step = field.type === 'dec' ? (field.step || 0.1) : 1;
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const cur = value === '' || value == null ? '' : value;
  const bump = (d) => { const base = cur === '' ? (field.min != null ? field.min : 0) : Number(cur); onChange(String(clamp(+(base + d * step).toFixed(2)))); };
  const show = hov || f;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'stretch', height: 44, borderRadius: 11, border: aaBorder(f, err),
        background: SURFACE, boxShadow: f ? AA_RING : 'none', overflow: 'hidden', transition: 'border-color .18s, box-shadow .18s' }}>
      <input value={cur} placeholder="0" inputMode={field.type === 'dec' ? 'decimal' : 'numeric'}
        onChange={(e) => { const raw = e.target.value.replace(field.type === 'dec' ? /[^0-9.]/g : /[^0-9]/g, ''); onChange(raw); }}
        onFocus={() => setF(true)} onBlur={() => { setF(false); if (cur !== '' && !isNaN(Number(cur))) onChange(String(clamp(Number(cur)))); }}
        style={{ flex: 1, minWidth: 0, height: '100%', border: 'none', background: 'transparent', padding: '0 13px',
          fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600, color: INK, outline: 'none' }} />
      <div style={{ display: 'flex', flexDirection: 'column', width: show ? 26 : 0, opacity: show ? 1 : 0,
        transition: 'width .16s, opacity .16s', pointerEvents: show ? 'auto' : 'none' }}>
        {show && <><AASpinBtn dir={1} onBump={() => bump(1)} /><AASpinBtn dir={-1} onBump={() => bump(-1)} /></>}
      </div>
    </div>
  );
}

/* ---------- slider (0–100 %) ---------- */
function AASlider({ value, onChange }) {
  const v = value === '' || value == null ? 0 : Number(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 44, padding: '0 14px', borderRadius: 11, border: '1px solid ' + LINE, background: SURFACE }}>
      <input type="range" min={0} max={100} value={v} className="aa-range"
        onChange={(e) => onChange(e.target.value)}
        style={{ background: `linear-gradient(90deg, ${NAVY} 0%, ${NAVY} ${v}%, ${LINE} ${v}%, ${LINE} 100%)` }} />
      <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: NAVY, minWidth: 46, textAlign: 'right' }}>{v}%</span>
    </div>
  );
}

/* ---------- textarea ---------- */
function AATextarea({ field, value, err, onChange }) {
  const [f, setF] = useState(false);
  return (
    <textarea className="aa-area" value={value || ''} placeholder={field.ph || ''} rows={3}
      onChange={(e) => onChange(e.target.value)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ width: '100%', minHeight: 84, resize: 'vertical', borderRadius: 11, border: aaBorder(f, err),
        background: SURFACE, padding: '11px 13px', fontFamily: FONT_BODY, fontSize: 14, lineHeight: 1.55,
        color: INK, boxShadow: f ? AA_RING : 'none', transition: 'border-color .18s, box-shadow .18s' }} />
  );
}

/* ---------- radio pills (status / fuel) ---------- */
function AARadioPills({ field, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
      {field.options.map((o) => {
        const active = value === o;
        const tone = AA_STATUS_TONE[o];
        const toneColor = tone === 'ok' ? GREEN : tone === 'warn' ? '#B45309' : tone === 'danger' ? DANGER : MUTED;
        return (
          <button key={o} type="button" onClick={() => onChange(o)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 11,
              border: '1.5px solid ' + (active ? NAVY : LINE), background: active ? NAVY : SURFACE,
              color: active ? '#fff' : INK_SOFT, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all .16s' }}>
            {tone && <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : toneColor }} />}
            {o}
            {active && !tone && <Icon name="check" size={15} />}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- toggle row ---------- */
function AAToggleRow({ field, value, onChange }) {
  const on = !!value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 12, border: '1px solid ' + LINE, background: on ? 'rgba(232,90,30,.06)' : CREAM, transition: 'background .2s' }}>
      <Toggle on={on} onChange={(v) => onChange(v)} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: on ? ORANGE_DK : INK_SOFT }}>{on ? (field.onLabel || 'Online') : (field.offLabel || 'Offline')}</div>
        {field.help && <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: FAINT, marginTop: 2 }}>{field.help}</div>}
      </div>
    </div>
  );
}

/* ---------- field dispatcher ---------- */
function AAField({ field, value, error, onChange }) {
  let control;
  switch (field.type) {
    case 'select':   control = <AASelect field={field} value={value} err={error} onChange={onChange} />; break;
    case 'date':     control = <AADate field={field} value={value} err={error} onChange={onChange} />; break;
    case 'money':    control = <AAMoney field={field} value={value} err={error} onChange={onChange} />; break;
    case 'int': case 'dec': control = <AANumber field={field} value={value} err={error} onChange={onChange} />; break;
    case 'slider':   control = <AASlider field={field} value={value} onChange={onChange} />; break;
    case 'textarea': control = <AATextarea field={field} value={value} err={error} onChange={onChange} />; break;
    case 'radio':    control = <AARadioPills field={field} value={value} onChange={onChange} />; break;
    case 'toggle':   control = <AAToggleRow field={field} value={value} onChange={onChange} />; break;
    default:         control = <AATextInput field={field} value={value} err={error} onChange={onChange} />;
  }
  if (field.type === 'toggle') {
    return <div style={{ flex: '1 1 100%', minWidth: 0 }}>{control}</div>;
  }
  return <AAFieldShell field={field} error={error}>{control}</AAFieldShell>;
}

/* =========================================================================
   COLLAPSIBLE SECTION
   ========================================================================= */
function AASectionCard({ section, form, errors, onChange, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const fields = section.fields;
  return (
    <div style={{ background: SURFACE, border: '1px solid ' + LINE, borderRadius: 14, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px',
          background: 'transparent', border: 'none', borderBottom: open ? '1px solid ' + LINE_SOFT : 'none',
          cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: '#EAF0F8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 32px' }}>
          <Icon name={section.icon} size={17} />
        </span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: NAVY, flex: 1 }}>{section.title}</span>
        <span style={{ color: MUTED, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }}>
          <Icon name="chevdown" size={17} />
        </span>
      </button>
      {open && (
        <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {fields.map((fl) => (
            <AAField key={fl.k} field={fl} value={form[fl.k]} error={errors[fl.k]} onChange={(v) => onChange(fl.k, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   STEPPER
   ========================================================================= */
function AAStepper({ steps, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
      {steps.map((s, i) => {
        const done = i < current, active = i === current;
        const circleBg = done ? NAVY : active ? ORANGE : SURFACE;
        const circleBd = done ? NAVY : active ? ORANGE : LINE;
        const numColor = done || active ? '#fff' : FAINT;
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: '0 0 auto', width: 92, textAlign: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid ' + circleBd, background: circleBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 36px',
                boxShadow: active ? '0 0 0 4px rgba(232,90,30,.15)' : 'none', transition: 'all .25s' }}>
                {done ? <Icon name="check" size={18} color="#fff" strokeWidth={2.6} />
                  : <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: numColor }}>{i + 1}</span>}
              </div>
              <div style={{ fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 600, lineHeight: 1.25,
                color: active ? NAVY : done ? INK_SOFT : FAINT }}>{s.short || s.title}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, borderRadius: 2, marginTop: 17, minWidth: 18,
                background: i < current ? NAVY : LINE, transition: 'background .3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* =========================================================================
   DOCUMENT CARD (VEH step 2 — upload locked, expiry editable)
   ========================================================================= */
function AADocCard({ doc, form, onChange }) {
  return (
    <div style={{ flex: '1 1 calc(50% - 8px)', minWidth: 250, border: '1px solid ' + LINE, borderRadius: 13, overflow: 'hidden', background: SURFACE }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '14px 15px', borderBottom: '1px solid ' + LINE_SOFT }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: '#EAF0F8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 38px' }}>
          <Icon name={doc.icon} size={19} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 14.5, fontWeight: 700, color: INK }}>{doc.name}</div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: MUTED, marginTop: 1 }}>{doc.desc}</div>
        </div>
      </div>
      <div style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {doc.company && (
          <AAField field={{ k: doc.k + '_company', label: 'Perusahaan Asuransi', type: 'text', w: 'full', ph: 'cth: Asuransi Astra' }}
            value={form[doc.k + '_company']} onChange={(v) => onChange(doc.k + '_company', v)} />
        )}
        {doc.expiry ? (
          <AAField field={{ k: doc.k + '_exp', label: 'Tanggal Kadaluarsa', type: 'date', w: 'full' }}
            value={form[doc.k + '_exp']} onChange={(v) => onChange(doc.k + '_exp', v)} />
        ) : (
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: FAINT, display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
            <Icon name="info" size={13} color={FAINT} />Tidak memiliki masa berlaku
          </div>
        )}
        <button type="button" disabled
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 10,
            border: '1px dashed ' + LINE, background: CREAM, color: FAINT, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600,
            cursor: 'not-allowed', width: '100%' }}>
          <Icon name="lock" size={14} />Upload Dokumen
          <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, fontWeight: 600, background: '#E7E0D2', color: MUTED, padding: '2px 7px', borderRadius: 20 }}>Segera Hadir</span>
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   REVIEW — summary grouped by section, empty = "—", Edit jumps to step
   ========================================================================= */
function aaDisplay(field, val) {
  if (val === '' || val == null) return null;
  switch (field.type) {
    case 'money':  return 'Rp ' + aaGroup(val);
    case 'date':   return aaFmtDate(val);
    case 'slider': return val + '%';
    case 'toggle': return val ? (field.onLabel || 'Online') : (field.offLabel || 'Offline');
    case 'int': case 'dec': return field.unit ? val + ' ' + field.unit : String(val);
    default:       return String(val);
  }
}

function AAReviewRow({ field, val }) {
  const shown = aaDisplay(field, val);
  const empty = shown == null;
  const mono = field.type === 'mono' || field.type === 'money' || field.type === 'int' || field.type === 'dec' || field.type === 'date';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 16px', borderRight: '1px solid ' + LINE_SOFT, borderBottom: '1px solid ' + LINE_SOFT }}>
      <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', color: FAINT }}>{field.label}</span>
      <span style={{ fontFamily: mono && !empty ? FONT_MONO : FONT_BODY, fontSize: 13.5, fontWeight: 600, color: empty ? '#C3BCAE' : INK, wordBreak: 'break-word' }}>
        {empty ? '—' : shown}
      </span>
    </div>
  );
}

function AAReviewSection({ title, icon, onEdit, children }) {
  return (
    <div style={{ border: '1px solid ' + LINE, borderRadius: 14, overflow: 'hidden', background: SURFACE }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(246,239,227,.6)', borderBottom: '1px solid ' + LINE_SOFT }}>
        <Icon name={icon} size={16} color={NAVY} />
        <span style={{ fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: INK_SOFT, flex: 1 }}>{title}</span>
        {onEdit && (
          <button type="button" onClick={onEdit}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 8,
              border: '1px solid ' + LINE, background: SURFACE, color: NAVY, fontFamily: FONT_HEAD, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EAF0F8'; e.currentTarget.style.borderColor = NAVY; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = SURFACE; e.currentTarget.style.borderColor = LINE; }}>
            <Icon name="pencil" size={13} />Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function AAReview({ cat, form, onEditStep, visibleSections }) {
  const formSteps = cat.steps.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'form');
  const docStep = cat.steps.map((s, i) => ({ s, i })).find((x) => x.s.kind === 'docs');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {formSteps.map(({ s, i }) => {
        const secs = s.sections.filter((sec) => visibleSections(sec));
        const fields = secs.reduce((acc, sec) => acc.concat(sec.fields), []);
        return (
          <AAReviewSection key={s.id} title={s.title} icon={s.sections[0].icon} onEdit={() => onEditStep(i)}>
            <div className="nx-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: 'none' }}>
              {fields.map((f) => <AAReviewRow key={f.k} field={f} val={form[f.k]} />)}
            </div>
          </AAReviewSection>
        );
      })}
      {docStep && (
        <AAReviewSection title="Dokumen Kendaraan" icon="filetext" onEdit={() => onEditStep(docStep.i)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {AA_VEH_DOCS.map((d) => (
              <AAReviewRow key={d.k} field={{ label: d.name + (d.expiry ? ' · Kadaluarsa' : ''), type: 'date' }}
                val={d.expiry ? form[d.k + '_exp'] : ''} />
            ))}
          </div>
        </AAReviewSection>
      )}
    </div>
  );
}

/* =========================================================================
   SAVE BUTTON — spinner → real DB insert → success → onSuccess()
   onSave: async () => boolean   (true = inserted OK, false = failed)
   ========================================================================= */
function AASaveButton({ onSave, onSuccess, full }) {
  const [state, setState] = useState('idle');
  const [h, setH] = useState(false);
  async function go() {
    if (state !== 'idle') return;
    setState('saving');
    let ok = false;
    try { ok = await onSave(); } catch (e) { ok = false; }
    if (ok) {
      setState('saved');
      onSuccess && onSuccess();
    } else {
      setState('idle');
    }
  }
  const bg = state === 'saved' ? GREEN : h && state === 'idle' ? ORANGE_DK : ORANGE;
  return (
    <button type="button" onClick={go} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 44, minWidth: 168,
        width: full ? '100%' : 'auto', padding: '0 22px', borderRadius: 11, border: 'none', background: bg, color: '#fff',
        fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: state === 'idle' ? 'pointer' : 'default',
        boxShadow: state === 'saved' ? '0 6px 16px rgba(31,139,77,.28)' : '0 1px 2px rgba(232,90,30,.3), 0 8px 18px rgba(232,90,30,.2)',
        transition: 'background .25s' }}>
      {state === 'idle' && <><Icon name="check" size={17} />Simpan Aset</>}
      {state === 'saving' && <><span className="ak-spin" style={{ display: 'inline-flex' }}><Icon name="loader" size={17} /></span>Menyimpan…</>}
      {state === 'saved' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, animation: 'ak-pop .4s ease both' }}><Icon name="checkcircle" size={18} />Tersimpan!</span>}
    </button>
  );
}

/* =========================================================================
   MAIN PAGE
   ========================================================================= */
function aaBuildInitial(cat) {
  const out = {};
  cat.steps.forEach((st) => {
    if (st.kind !== 'form') return;
    st.sections.forEach((sec) => sec.fields.forEach((f) => {
      if (f.k === 'code') out[f.k] = cat.prefix;
      else if (f.type === 'radio') out[f.k] = f.options[0];
      else if (f.type === 'toggle') out[f.k] = false;
      else if (f.type === 'slider') out[f.k] = '';
      else if (f.k === 'jumlah') out[f.k] = '1';
      else out[f.k] = '';
    }));
  });
  return out;
}

export default function AddAssetPage({ categoryCode = 'IT-EQP', onBack, onSuccess }) {
  const { profile, erpRole, user } = useAuth();
  const cat = AA_CATS[categoryCode] || AA_CATS['IT-EQP'];
  const [form, setForm] = useState(() => aaBuildInitial(cat));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => { setForm(aaBuildInitial(cat)); setStep(0); setErrors({}); setDirty(false); setConfirmBack(false); }, [categoryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = cat.steps;
  const stepDef = steps[step];
  const isVisibleSection = (sec) => !sec.showIf || sec.showIf(form);

  function change(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }

  function validateStep() {
    if (stepDef.kind !== 'form') return {};
    const errs = {};
    steps[step].sections.filter(isVisibleSection).forEach((sec) => sec.fields.forEach((f) => {
      if (f.req && (form[f.k] == null || String(form[f.k]).trim() === '')) errs[f.k] = 'Wajib diisi';
    }));
    return errs;
  }

  function next() {
    const errs = validateStep();
    if (Object.keys(errs).length) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors({});
    setStep((s) => Math.min(steps.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function jumpTo(i) { setStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function handleLeave() { if (dirty) setConfirmBack(true); else onBack && onBack(); }

  // Real DB save. Returns true on success (assets row inserted), false otherwise.
  // asset_specifications / asset_network (IT-EQP) are best-effort: a failure
  // there is logged but does NOT block success — the main asset is already saved.
  async function handleSave() {
    setSaveError(null);
    const f = form;
    const companyId = profile?.company_id ?? null;
    if (!companyId) { setSaveError('Company tidak ditemukan pada sesi Anda. Silakan login ulang.'); return false; }

    const name = aaTxt(f.nama);
    const audUser = { id: profile?.id, email: user?.email, role: erpRole, companyId };
    try {
      // Resolve category_id (NOT NULL + FK). Category code === wizard categoryCode.
      const { data: catRow, error: catErr } = await supabase
        .from('asset_categories')
        .select('id')
        .eq('company_id', companyId)
        .eq('code', categoryCode)
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (catErr) { setSaveError('Gagal memuat kategori: ' + catErr.message); return false; }
      if (!catRow?.id) { setSaveError('Kategori "' + categoryCode + '" belum tersedia untuk entitas ini. Hubungi admin untuk seed kategori aset.'); return false; }

      const row = {
        company_id: companyId,
        created_by: user?.id ?? null,
        asset_no: aaTxt(f.code) || ('AST-' + Date.now()),
        name,
        category_id: catRow.id,
        asset_subtype: aaMapSubtype(f.subtype),
        serial_number: aaTxt(f.serial),
        model: aaTxt(f.model) || aaTxt(f.merkModel),
        brand: aaTxt(f.merkModel),
        vendor_name: aaTxt(f.vendor),
        purchase_date: aaTxt(f.tglBeli),
        purchase_invoice_no: aaTxt(f.invoice),
        purchase_price: aaNum(f.harga),
        assigned_to_name: aaTxt(f.assignedTo),
        description: aaTxt(f.keterangan),
        status: aaMapStatus(f.status),
        assignment_status: 'available',
        plate_number: aaTxt(f.noPol),
        color: aaTxt(f.warna),
        manufacture_year: aaInt(f.tahun),
        fuel_type: aaMapFuel(f.bbm),
        vin: aaTxt(f.vin),
        engine_number: aaTxt(f.noMesin),
        km_odometer: aaInt(f.odometer),
      };

      const { data: asset, error } = await supabase
        .from('assets')
        .insert(row)
        .select('id, name')
        .single();
      if (error) { setSaveError('Gagal menyimpan aset: ' + error.message); return false; }

      // Audit (fire-and-forget) — after assets insert succeeds.
      logAudit(supabase, {
        action: ACTION_TYPES.CREATE_ASSET,
        entityType: ENTITY_TYPES.ASSET,
        entityId: asset?.id ?? null,
        entityLabel: asset?.name ?? name,
      }, audUser);

      // IT-EQP extras — best-effort, non-blocking.
      if (categoryCode === 'IT-EQP' && asset?.id) {
        const spec = {
          asset_id: asset.id,
          company_id: companyId,
          cpu_model: aaTxt(f.cpuModel),
          ram_gb: aaInt(f.ramGb),
          storage_gb: aaInt(f.stoGb),
          storage_type: aaTxt(f.stoType),
          display_size_inch: aaNum(f.dispSize),
          gpu_model: aaTxt(f.gpuModel),
          os_name: aaTxt(f.osName),
          os_version: aaTxt(f.osVersion),
          battery_capacity_wh: aaNum(f.batWh),
          webcam_desc: aaTxt(f.webcam),
          keyboard_desc: aaTxt(f.keyboard),
          ports_desc: aaTxt(f.ports),
          wireless_desc: aaTxt(f.wireless),
          weight_kg: aaNum(f.weight),
          color: aaTxt(f.color),
        };
        const { error: specErr } = await supabase.from('asset_specifications').insert(spec);
        if (specErr) console.error('[asset] asset_specifications insert failed:', specErr.message);

        // Network row only when there's actual network data (ip or hostname).
        if (aaTxt(f.ip) || aaTxt(f.hostname)) {
          const net = {
            asset_id: asset.id,
            company_id: companyId,
            ip_address: aaTxt(f.ip),
            ipv6_address: aaTxt(f.ipv6),
            mac_wifi: aaTxt(f.macWifi),
            mac_lan: aaTxt(f.macLan),
            hostname: aaTxt(f.hostname),
            gateway: aaTxt(f.gateway),
            dns_primary: aaTxt(f.dns1),
            dns_secondary: aaTxt(f.dns2),
            vlan: aaTxt(f.vlan),
            domain_workgroup: aaTxt(f.domain),
          };
          const { error: netErr } = await supabase.from('asset_network').insert(net);
          if (netErr) console.error('[asset] asset_network insert failed:', netErr.message);
        }
      }

      return true;
    } catch (e) {
      setSaveError('Gagal menyimpan aset: ' + (e?.message || e));
      return false;
    }
  }

  const errorCount = Object.values(errors).filter(Boolean).length;
  const assetName = form[cat.titleField];

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK, maxWidth: 860, margin: '0 auto' }}>
      <AAStyles />

      {/* ---------- breadcrumb + title ---------- */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT_BODY, fontSize: 12.5, color: FAINT, marginBottom: 12, flexWrap: 'wrap' }}>
        <span>Service Management</span>
        <Icon name="chevright" size={13} color={FAINT} />
        <button type="button" onClick={handleLeave} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 12.5, color: FAINT }}
          onMouseEnter={(e) => (e.currentTarget.style.color = NAVY)} onMouseLeave={(e) => (e.currentTarget.style.color = FAINT)}>{cat.crumb}</button>
        <Icon name="chevright" size={13} color={FAINT} />
        <span style={{ color: INK_SOFT, fontWeight: 600 }}>Tambah Aset</span>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <button type="button" onClick={handleLeave}
          style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid ' + LINE, background: SURFACE, color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: '0 0 42px', transition: 'all .2s' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = CREAM)} onMouseLeave={(e) => (e.currentTarget.style.background = SURFACE)}>
          <Icon name="arrowleft" size={19} />
        </button>
        <span style={{ width: 46, height: 46, borderRadius: 13, background: '#EAF0F8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 46px' }}>
          <Icon name={cat.icon} size={24} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: FONT_HEAD, fontSize: 23, fontWeight: 700, letterSpacing: -0.4, color: NAVY, margin: 0, lineHeight: 1.1 }}>Tambah Aset Baru</h1>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: MUTED, marginTop: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
            Kategori
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px', borderRadius: 7, background: '#EAF0F8', color: NAVY, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>
              {cat.code}
            </span>
            <span style={{ color: INK_SOFT, fontWeight: 600 }}>{cat.label}</span>
          </div>
        </div>
      </div>

      {/* ---------- unsaved-changes confirmation banner ---------- */}
      {confirmBack && (
        <div className="aa-fade" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', marginBottom: 18, borderRadius: 12, background: '#FBE9D9', border: '1px solid #F0C9A8' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: '#F7D9BE', color: ORANGE_DK, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 34px' }}>
            <Icon name="alert" size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 700, color: '#9A4A12' }}>Perubahan belum disimpan</div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: '#A9692F' }}>Data yang sudah Anda isi akan hilang jika keluar sekarang.</div>
          </div>
          <button type="button" onClick={() => setConfirmBack(false)}
            style={{ height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid ' + LINE, background: SURFACE, color: INK_SOFT, fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Tetap di sini</button>
          <button type="button" onClick={() => onBack && onBack()}
            style={{ height: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: ORANGE, color: '#fff', fontFamily: FONT_HEAD, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Keluar tanpa simpan</button>
        </div>
      )}

      {/* ---------- stepper ---------- */}
      <div style={{ background: SURFACE, border: '1px solid ' + LINE, borderRadius: 16, padding: '18px 20px 14px', marginBottom: 18 }}>
        <AAStepper steps={steps} current={step} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          <span key={step} className="aa-prog" style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: NAVY, background: '#EAF0F8', padding: '3px 11px', borderRadius: 20 }}>
            Langkah {step + 1} dari {steps.length}
          </span>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: MUTED }}>· {stepDef.title}{stepDef.optional ? ' (opsional)' : ''}</span>
        </div>
      </div>

      {/* ---------- validation summary ---------- */}
      {errorCount > 0 && (
        <div className="aa-fade" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', marginBottom: 18, borderRadius: 12, background: '#FBE3DF', border: '1px solid #ECC2BA' }}>
          <Icon name="alert" size={17} color={DANGER} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: '#9B2C22' }}>
            {errorCount} field wajib belum terisi. Periksa kolom yang ditandai merah.
          </span>
        </div>
      )}

      {/* ---------- save error banner ---------- */}
      {saveError && (
        <div className="aa-fade" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', marginBottom: 18, borderRadius: 12, background: '#FBE3DF', border: '1px solid #ECC2BA' }}>
          <Icon name="alert" size={17} color={DANGER} />
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: '#9B2C22' }}>{saveError}</span>
        </div>
      )}

      {/* ---------- step content ---------- */}
      <div key={step} className="aa-fade" data-aa-scroll>
        {stepDef.kind === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {stepDef.sections.filter(isVisibleSection).map((sec) => (
              <AASectionCard key={sec.id} section={sec} form={form} errors={errors} onChange={change} />
            ))}
          </div>
        )}

        {stepDef.kind === 'docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', borderRadius: 12, background: '#EAF0F8', border: '1px solid #CFE0F2' }}>
              <Icon name="info" size={17} color={NAVY} />
              <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 500, color: '#1B4E86' }}>
                Upload dokumen akan tersedia setelah fitur <b>Dokumen Aset</b> aktif. Untuk sekarang, Anda dapat mencatat tanggal kadaluarsa.
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {AA_VEH_DOCS.map((d) => <AADocCard key={d.k} doc={d} form={form} onChange={change} />)}
            </div>
          </div>
        )}

        {stepDef.kind === 'review' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: '#E7F3EC', border: '1px solid #C2E2CE' }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: '#CDEAD7', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 36px' }}>
                <Icon name="checkcircle" size={19} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 700, color: '#176B3C' }}>Siap disimpan</div>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: '#3C7A55' }}>
                  Tinjau ringkasan di bawah. Kolom kosong ditampilkan sebagai “—”. {assetName ? <>Aset <b>{assetName}</b> akan ditambahkan ke modul {cat.label}.</> : null}
                </div>
              </div>
            </div>
            <AAReview cat={cat} form={form} onEditStep={jumpTo} visibleSections={isVisibleSection} />
          </div>
        )}
      </div>

      {/* ---------- footer nav ---------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 24, paddingTop: 20, borderTop: '1px solid ' + LINE, flexWrap: 'wrap' }}>
        <button type="button" onClick={step === 0 ? handleLeave : back}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 18px', borderRadius: 11, border: '2px solid ' + NAVY, background: 'transparent', color: NAVY, fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'background .2s' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(20,70,130,.05)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <Icon name="arrowleft" size={16} />{step === 0 ? 'Batal' : 'Kembali'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }}>
          {stepDef.kind === 'review' ? (
            <AASaveButton onSave={handleSave} onSuccess={onSuccess} />
          ) : (
            <button type="button" onClick={next}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px', borderRadius: 11, border: 'none', background: ORANGE, color: '#fff', fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 2px rgba(232,90,30,.3), 0 8px 18px rgba(232,90,30,.18)', transition: 'background .2s, transform .12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = ORANGE_DK; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ORANGE; e.currentTarget.style.transform = 'none'; }}>
              Lanjut<Icon name="arrowright" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
