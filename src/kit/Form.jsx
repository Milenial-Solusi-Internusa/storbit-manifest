/* =========================================================================
   Kontrol form kit tunggal (Batch DS 1) — pindahan AdminKit + input search v3.

   FloatingInput / FloatingSelect (56px) · Select ringkas (44px) · Textarea ·
   SearchInput · Toggle · NumberStepper · Segmented · PillToggle · EntitySwitcher.

   Yang beda dari AdminKit, semuanya ADITIF (celah TD-14 §17.9 ditutup di sini):
   `FloatingSelect` punya `disabled`; `FloatingInput` punya `maxLength`,
   `error`, `readOnly`; semua kontrol punya gaya fokus (ring INK_SOFT) —
   input v3 dulu tak punya. Latar input = INPUT_BG (= BG) supaya timbul di
   atas kartu; border LINE (kebijakan A.1) — ⚠️ LINE hanya 1,2:1 terhadap
   kartu, di bawah ambang non-teks 3:1; batas input yang lolos = keadaan
   fokus (border INK_SOFT + ring). Konsekuensi palet, dicatat di laporan.

   Alias `KitSelect` (= Select) di bawah = kompatibilitas, dicabut Batch DS 7.
   ========================================================================= */

import { useState } from 'react';
import { Check, ChevronDown, Lock, Minus, Plus, Search } from 'lucide-react';
import Icon from './Icon';
import { ENTITIES } from '../lib/entities';
import {
  ACCENT, ACCENT_HOVER, INK, INK_SOFT, INK_FAINT, LINE, HEAD_BG, ROW_HOVER, INPUT_BG,
  DISABLED_BG, DISABLED_INK, FOCUS_RING, SHADOW_1, SEMANTIC,
  FONT_HEAD, FONT_BODY, FONT_MONO, RADIUS, SIZE, MOTION,
} from './tokens';

const flexOf = (full, half, third) =>
  (full ? '1 1 100%' : third ? '1 1 calc(33.333% - 11px)' : half ? '1 1 calc(50% - 8px)' : '1 1 calc(50% - 8px)');
const optVal = (o) => (typeof o === 'string' ? o : o.value);
const optLabel = (o) => (typeof o === 'string' ? o : o.label);
const renderIcon = (icon, size) => (typeof icon === 'string' ? <Icon name={icon} size={size} /> : icon);

/* Baris keterangan di bawah kontrol: error mengalahkan hint. Teks pendukung
   memakai INK_SOFT (5:1), BUKAN INK_FAINT — hint itu informasi, bukan hiasan. */
function Note({ hint, error }) {
  if (!hint && !error) return null;
  return (
    <div style={{ fontSize: 11, color: error ? SEMANTIC.danger.fg : INK_SOFT, marginTop: 5, marginLeft: 3, fontFamily: FONT_BODY }}>
      {error || hint}
    </div>
  );
}

const borderOf = (focus, error, disabled) =>
  `1px solid ${error ? SEMANTIC.danger.fg : focus ? INK_SOFT : disabled ? DISABLED_BG : LINE}`;

/* =========================================================================
   FLOATING-LABEL INPUT (56px)
   ========================================================================= */
export function FloatingInput({
  label, value, onChange, mono, type = 'text', full, half, third, disabled, readOnly,
  placeholder, hint, error, maxLength, id, name, onBlur, onKeyDown, autoFocus, inputMode, style,
}) {
  const [focus, setFocus] = useState(false);
  const floated = focus || (value !== undefined && value !== null && String(value).length > 0);
  return (
    <div style={{ position: 'relative', flex: flexOf(full, half, third), minWidth: 0, ...style }}>
      <label htmlFor={id} style={{
        position: 'absolute', left: 14, pointerEvents: 'none', fontFamily: FONT_BODY,
        transition: `all ${MOTION.base} ${MOTION.ease}`,
        top: floated ? 7 : 18, fontSize: floated ? 11 : 13.5, fontWeight: floated ? 600 : 400,
        color: error ? SEMANTIC.danger.fg : focus ? INK : INK_SOFT,
      }}>
        {label}
      </label>
      <input
        id={id} name={name} className="nk-input" type={type} value={value ?? ''} disabled={disabled} readOnly={readOnly}
        maxLength={maxLength} autoFocus={autoFocus} inputMode={inputMode}
        placeholder={focus ? placeholder : ''}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={(e) => { setFocus(false); onBlur?.(e); }} onKeyDown={onKeyDown}
        style={{
          width: '100%', height: SIZE.inputFloating, borderRadius: RADIUS.md, border: borderOf(focus, error, disabled),
          background: disabled ? DISABLED_BG : INPUT_BG, padding: '20px 14px 7px',
          fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: mono ? 13.5 : 14, fontWeight: 500,
          color: disabled ? DISABLED_INK : INK, letterSpacing: mono ? 0.3 : 0,
          boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      <Note hint={hint} error={error} />
    </div>
  );
}

/* ---------- floating-label SELECT (56px) ---------- */
export function FloatingSelect({ label, value, onChange, options = [], half, third, full, disabled, hint, error, id, name, style }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative', flex: flexOf(full, half, third), minWidth: 0, ...style }}>
      <label htmlFor={id} style={{
        position: 'absolute', left: 14, top: 7, pointerEvents: 'none', fontFamily: FONT_BODY,
        fontSize: 11, fontWeight: 600, color: error ? SEMANTIC.danger.fg : focus ? INK : INK_SOFT, transition: `color ${MOTION.base}`,
      }}>
        {label}
      </label>
      <select
        id={id} name={name} className="nk-select" value={value ?? ''} disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', height: SIZE.inputFloating, borderRadius: RADIUS.md, border: borderOf(focus, error, disabled),
          background: disabled ? DISABLED_BG : INPUT_BG, padding: '20px 38px 7px 14px',
          fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: disabled ? DISABLED_INK : INK,
          appearance: 'none', WebkitAppearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
        }}
      >
        {options.map((o) => <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 14, top: 20, color: INK_SOFT, pointerEvents: 'none' }}><ChevronDown size={16} /></span>
      <Note hint={hint} error={error} />
    </div>
  );
}

/* ---------- SELECT ringkas 44px (filter / baris setelan) — pengganti KitSelect ---------- */
export function Select({ value, onChange, options = [], width = 220, full, icon, disabled, id, name, style, ariaLabel }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative', width: full ? '100%' : width, ...style }}>
      {icon && (
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: INK_SOFT, pointerEvents: 'none', display: 'inline-flex' }}>
          {renderIcon(icon, 15)}
        </span>
      )}
      <select
        id={id} name={name} className="nk-select" value={value ?? ''} disabled={disabled} aria-label={ariaLabel}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', height: SIZE.input, borderRadius: RADIUS.md, border: borderOf(focus, false, disabled),
          background: disabled ? DISABLED_BG : INPUT_BG, padding: icon ? '0 34px 0 36px' : '0 34px 0 14px',
          fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500, color: disabled ? DISABLED_INK : INK,
          appearance: 'none', WebkitAppearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
        }}
      >
        {options.map((o) => <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: INK_SOFT, pointerEvents: 'none', display: 'inline-flex' }}>
        <ChevronDown size={15} />
      </span>
    </div>
  );
}

/* ---------- TEXTAREA ---------- */
export function Textarea({
  label, value, onChange, rows = 3, placeholder, hint, error, maxLength, disabled, readOnly,
  mono, full = true, half, id, name, style, resize = 'vertical',
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: flexOf(full && !half, half, false), minWidth: 0, ...style }}>
      {label && (
        <label htmlFor={id} style={{ display: 'block', fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: error ? SEMANTIC.danger.fg : INK_SOFT, marginBottom: 6 }}>
          {label}
        </label>
      )}
      <textarea
        id={id} name={name} className="nk-area" value={value ?? ''} rows={rows} placeholder={placeholder}
        maxLength={maxLength} disabled={disabled} readOnly={readOnly} aria-invalid={error ? true : undefined}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: RADIUS.md, border: borderOf(focus, error, disabled),
          background: disabled ? DISABLED_BG : INPUT_BG, fontFamily: mono ? FONT_MONO : FONT_BODY, fontSize: 13.5,
          lineHeight: 1.5, color: disabled ? DISABLED_INK : INK, resize,
          boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      <Note hint={hint} error={error} />
    </div>
  );
}

/* ---------- SEARCH INPUT (pindahan FilterBar v3, kini bergaya fokus) ---------- */
export function SearchInput({ value, onChange, placeholder = 'Cari…', width, style, id, ariaLabel = 'Search', autoFocus }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: 'relative', flex: width ? undefined : '1 1 240px', width, minWidth: 200, ...style }}>
      <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: INK_FAINT, pointerEvents: 'none' }} />
      <input
        id={id} className="nk-input" type="search" value={value || ''} placeholder={placeholder} aria-label={ariaLabel} autoFocus={autoFocus}
        onChange={(e) => onChange?.(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px 0 32px', borderRadius: RADIUS.md,
          border: borderOf(focus, false, false), background: INPUT_BG,
          fontFamily: FONT_BODY, fontSize: 13.5, color: INK,
          boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
        }}
      />
    </div>
  );
}

/* =========================================================================
   TOGGLE — 44×25. OFF: track LINE + knob terang berbingkai · ON: track
   ACCENT_HOVER + knob INK (5,98:1). Pembeda ON/OFF = posisi + warna knob,
   bukan hanya warna track (aksen vs kartu cuma 1,6:1).
   ========================================================================= */
export function Toggle({ on, onChange, disabled, label }) {
  return (
    <button
      type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} className="nk-focus"
      onClick={() => !disabled && onChange && onChange(!on)}
      style={{
        width: 44, height: 25, borderRadius: RADIUS.pill, border: 'none', padding: 0, position: 'relative', flex: '0 0 44px',
        cursor: disabled ? 'not-allowed' : 'pointer', background: on ? ACCENT_HOVER : LINE,
        opacity: disabled ? 0.5 : 1, transition: `background .25s ease`,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: 3, width: 19, height: 19, borderRadius: '50%', boxSizing: 'border-box',
        background: on ? INK : INPUT_BG, border: on ? 'none' : `1px solid ${INK_FAINT}`,
        boxShadow: SHADOW_1, transform: on ? 'translateX(19px)' : 'translateX(0)',
        transition: `transform .25s ${MOTION.ease}, background .25s ease`,
      }} />
    </button>
  );
}

/* =========================================================================
   NUMBER STEPPER — tombol ± muncul saat hover/fokus, sufiks opsional
   ========================================================================= */
export function NumberStepper({ value, onChange, suffix, min = 0, max = 9999, step = 1, width = 150, disabled, id, ariaLabel }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hot, setHot] = useState(0); // -1 | 0 | 1 — tombol yang sedang di-hover
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const show = (hover || focus) && !disabled;
  const stepBtn = (dir) => (
    <button
      type="button" tabIndex={-1} aria-label={dir > 0 ? 'Tambah' : 'Kurang'}
      onMouseEnter={() => setHot(dir)} onMouseLeave={() => setHot(0)}
      onClick={() => onChange(clamp((Number(value) || 0) + dir * step))}
      style={{
        width: 30, height: '100%', border: 'none', borderLeft: dir > 0 ? `1px solid ${LINE}` : 'none', borderRight: dir < 0 ? `1px solid ${LINE}` : 'none',
        background: hot === dir ? ACCENT : 'transparent', color: hot === dir ? INK : INK_SOFT, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
      }}
    >
      {dir > 0 ? <Plus size={14} /> : <Minus size={14} />}
    </button>
  );
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setHot(0); }}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 46, width, borderRadius: RADIUS.md, border: borderOf(focus, false, disabled),
        background: disabled ? DISABLED_BG : INPUT_BG, overflow: 'hidden', boxShadow: focus ? FOCUS_RING : 'none',
        transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
      }}
    >
      <div style={{ width: 30, height: '100%', transition: 'opacity .18s', opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}>{show && stepBtn(-1)}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
        <input
          id={id} aria-label={ariaLabel} value={value ?? ''} disabled={disabled} inputMode="decimal"
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); onChange(v === '' ? '' : clamp(Number(v))); }}
          style={{ width: 54, border: 'none', background: 'transparent', textAlign: 'center', fontFamily: FONT_MONO, fontSize: 16, fontWeight: 600, color: disabled ? DISABLED_INK : INK, outline: 'none' }}
        />
        {suffix && <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: INK_SOFT }}>{suffix}</span>}
      </div>
      <div style={{ width: 30, height: '100%', transition: 'opacity .18s', opacity: show ? 1 : 0, pointerEvents: show ? 'auto' : 'none' }}>{show && stepBtn(1)}</div>
    </div>
  );
}

/* =========================================================================
   SEGMENTED — thumb geser di atas track HEAD_BG
   ========================================================================= */
export function Segmented({ options = [], value, onChange, full, ariaLabel }) {
  const idx = options.findIndex((o) => optVal(o) === value);
  const n = options.length || 1;
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{
      display: full ? 'flex' : 'inline-flex', position: 'relative', background: HEAD_BG, border: `1px solid ${LINE}`,
      borderRadius: RADIUS.md, padding: 4, width: full ? '100%' : 'auto', boxSizing: 'border-box',
    }}>
      <div style={{
        position: 'absolute', top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${n})`,
        transform: `translateX(${idx < 0 ? 0 : idx * 100}%)`, background: INPUT_BG, border: `1px solid ${LINE}`,
        borderRadius: 8, boxShadow: SHADOW_1, transition: `transform .28s ${MOTION.ease}`, opacity: idx < 0 ? 0 : 1,
      }} />
      {options.map((o) => {
        const val = optVal(o);
        const active = val === value;
        const icon = typeof o === 'object' ? o.icon : null;
        return (
          <button
            key={val} type="button" role="radio" aria-checked={active} onClick={() => onChange(val)} className="nk-focus"
            style={{
              position: 'relative', zIndex: 1, flex: 1, height: 38, border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600, color: active ? INK : INK_SOFT,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'color .25s', whiteSpace: 'nowrap', padding: '0 14px',
              borderRadius: 8,
            }}
          >
            {icon && renderIcon(icon, 15)}
            {optLabel(o)}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- PILL TOGGLE (chip pilih-ganda) ---------- */
export function PillToggle({ label, active, onClick, locked, disabled }) {
  const [h, setH] = useState(false);
  const off = locked || disabled;
  return (
    <button
      type="button" aria-pressed={!!active} onClick={() => !off && onClick && onClick()} className="nk-focus"
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: RADIUS.pill,
        border: `1px solid ${active ? ACCENT_HOVER : LINE}`, background: active ? ACCENT : h && !off ? ROW_HOVER : INPUT_BG,
        color: active ? INK : INK_SOFT, fontFamily: FONT_HEAD, fontSize: 13, fontWeight: 600,
        cursor: off ? 'not-allowed' : 'pointer', transition: `all ${MOTION.base}`, opacity: disabled ? 0.6 : locked ? 0.85 : 1,
      }}
    >
      {active && <Check size={14} />}
      {label}
      {locked && <Lock size={12} color={INK_FAINT} />}
    </button>
  );
}

/* =========================================================================
   ENTITY SWITCHER — pil geser MSI | JCI | SOA (single-select).
   Sumber daftar = `src/lib/entities.js`; `value`/`onChange` memakai KODE
   ("MSI"), sama seperti pemanggil AdminKit — yang dulu membandingkan `e.id`
   (kode) kini `e.code`, karena `id` di daftar tunggal = UUID.
   ========================================================================= */
export function EntitySwitcher({ value, onChange, ariaLabel = 'Entitas' }) {
  const idx = ENTITIES.findIndex((e) => e.code === value);
  const n = ENTITIES.length;
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'inline-flex', position: 'relative', background: HEAD_BG, border: `1px solid ${LINE}`, borderRadius: 12, padding: 4 }}>
      <div style={{
        position: 'absolute', top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${n})`,
        transform: `translateX(${idx < 0 ? 0 : idx * 100}%)`, background: ACCENT, border: `1px solid ${ACCENT_HOVER}`,
        borderRadius: 9, boxSizing: 'border-box', transition: `transform .32s ${MOTION.ease}`, opacity: idx < 0 ? 0 : 1,
      }} />
      {ENTITIES.map((e) => {
        const active = e.code === value;
        return (
          <button
            key={e.code} type="button" role="radio" aria-checked={active} onClick={() => onChange(e.code)} title={e.name} className="nk-focus"
            style={{
              position: 'relative', zIndex: 1, minWidth: 64, height: 34, padding: '0 16px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 13, letterSpacing: 0.3,
              color: active ? INK : INK_SOFT, transition: 'color .25s', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9,
            }}
          >
            {e.code}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- ALIAS kompatibilitas (dicabut Batch DS 7) ---------- */
export function KitSelect(props) { return <Select {...props} />; }
