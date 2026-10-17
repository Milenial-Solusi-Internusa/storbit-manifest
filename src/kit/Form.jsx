/* =========================================================================
   Kontrol form kit tunggal (Batch DS 1) — pindahan AdminKit + input search v3.

   FloatingInput / FloatingSelect (44px, label di atas kotak sejak 13 Okt
   2026 -- lihat FieldLabel) · Select ringkas (44px) · Textarea ·
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

import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';
import { Check, ChevronDown, Lock, Minus, Plus, Search } from 'lucide-react';
import Icon from './Icon';
import { ENTITIES } from '../lib/entities';
import {
  ACCENT, ACCENT_HOVER, INK, INK_SOFT, INK_FAINT, LINE, HEAD_BG, ROW_HOVER, INPUT_BG, CARD,
  DISABLED_BG, DISABLED_INK, FOCUS_RING, SHADOW_1, SEMANTIC,
  FONT_HEAD, FONT_BODY, FONT_MONO, RADIUS, SIZE, SP, MOTION,
} from './tokens';

const flexOf = (full, half, third) =>
  (full ? '1 1 100%' : third ? '1 1 calc(33.333% - 11px)' : half ? '1 1 calc(50% - 8px)' : '1 1 calc(50% - 8px)');
const optVal = (o) => (typeof o === 'string' ? o : o.value);
const optLabel = (o) => (typeof o === 'string' ? o : o.label);
const renderIcon = (icon, size) => (typeof icon === 'string' ? <Icon name={icon} size={size} /> : icon);

/* Baris keterangan di bawah kontrol: error mengalahkan hint. Teks pendukung
   memakai INK_SOFT (5:1), BUKAN INK_FAINT — hint itu informasi, bukan hiasan.
   Warna error = SEMANTIC.warn (amber #8E620D), BUKAN SEMANTIC.danger (TD-318
   Irisan 3, REVISI 2) — persis warna span "X is required" di seluruh mockup
   Lead Management (MarkAsLost/RequestPull/RejectRequest/RequestNewOption,
   JUGA MasterSelect.dc.html `invalid`). Diubah di SINI (bukan disalin ke
   pemakai) karena nol pemakai `error` FloatingInput/FloatingSelect/Textarea
   hari ini (diverifikasi grep sebelum diubah) -- nol blast radius ke
   pemakai non-CRM manapun. */
function Note({ hint, error }) {
  if (!hint && !error) return null;
  return (
    <div style={{ fontSize: 11, color: error ? SEMANTIC.warn.fg : INK_SOFT, marginTop: 5, marginLeft: 3, fontFamily: FONT_BODY }}>
      {error || hint}
    </div>
  );
}

/* Label field DI ATAS kotak isian (13 Okt 2026, menggantikan floating label
   Batch DS 1 -- keputusan Den, mengikuti mockup Lead/Inquiry/Customer/
   Quotation Management: KEEMPAT sepakat persis `font:600 12px Inter`,
   `color:#5C6B52`, jarak 8px ke kotak -- diverifikasi grep ke keempat file
   .dc.html, bukan ditebak dari satu mockup. Dipakai bersama oleh
   FloatingInput/FloatingSelect/Textarea supaya ketiganya SATU sumber
   kebenaran tata letak label, bukan tiga salinan yang bisa melenceng.
   DIEKSPOR (bukan lagi lokal file ini) supaya `MasterSelect.jsx` ikut
   memakainya -- tanpa itu `CaptureLeadModal.jsx` (satu-satunya pemakai
   MasterSelect hari ini, field Industry + Lead Category) akan punya DUA
   gaya label dalam satu modal, berdampingan dengan field lain (Entity/
   Source/Priority) yang lewat kontrol di file ini.
   Token: fontSize 12 + fontWeight 600 + FONT_BODY (Inter) = spesifikasi
   mockup persis; color INK_SOFT = #5C6B52 persis (lihat komentar token-nya
   sendiri: "label, subtitle, teks redup") -- NOL hex baru. `focus` dipakai
   SAMA seperti floating label lama (INK saat fokus, INK_SOFT saat tidak) --
   satu-satunya nuansa interaktif lama yang dipertahankan, cuma pindah dari
   label yang melayang ke label yang diam.
   Tanda bintang `required` -- markup mockup persis: `<span>Name <span
   style="color:#8E620D">*</span></span>` di dalam baris flex gap:8px --
   `#8E620D` = SEMANTIC.warn.fg (lihat tokens.js, Keputusan #62) -- NOL hex
   baru di sini juga. Warna label saat `error` JUGA SEMANTIC.warn.fg (TD-318
   Irisan 3) -- disamakan dgn `Note`/`borderOf` di bawah supaya satu keadaan
   invalid tidak terlihat sbg tiga sinyal warna berbeda (label/border/pesan).

   Kata `optional` (TD-318 Irisan 3, tes Den #3) -- markup mockup persis:
   `<span>Notes <span style="font-weight:400;color:#838E7A">Optional</span></span>`
   (Lead Management.dc.html :389, dan "Owner" Import Leads :353) -- SATU
   baris dengan label, BUKAN hint di bawah kotak (ImportLeadsModal.jsx
   sebelumnya sudah membangun ini manual lewat JSX `label={<>...}`; prop
   ini menggantikannya supaya satu sumber kebenaran). `#838E7A` = INK_FAINT. */
export function FieldLabel({ label, required, optional, error, focus, htmlFor }) {
  if (!label) return null;
  return (
    <label htmlFor={htmlFor} style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
      fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600,
      color: error ? SEMANTIC.warn.fg : focus ? INK : INK_SOFT,
    }}>
      {label}
      {required && <span style={{ color: SEMANTIC.warn.fg }}>*</span>}
      {optional && <span style={{ fontWeight: 400, color: INK_FAINT }}>Optional</span>}
    </label>
  );
}

const borderOf = (focus, error, disabled) =>
  `1px solid ${error ? SEMANTIC.warn.bd : focus ? INK_SOFT : disabled ? DISABLED_BG : LINE}`;

/* =========================================================================
   INPUT (44px) — label DI ATAS kotak (13 Okt 2026, lihat FieldLabel di atas
   untuk alasan + spesifikasi). Tinggi kotak turun dari SIZE.inputFloating
   (56, utk ruang label melayang) ke SIZE.input (44, SUDAH ADA, persis
   height:44px mockup) -- nol token baru. `placeholder` kini SELALU tampil
   saat kosong (dulu `focus ? placeholder : ''` -- disembunyikan saat tidak
   fokus supaya tak tumpang-tindih dengan label besar yang belum melayang;
   alasan itu hilang begitu label pindah keluar kotak, dan mockup sendiri
   menulis placeholder sebagai atribut polos, nol logika kondisional).
   ========================================================================= */
export function FloatingInput({
  label, value, onChange, mono, type = 'text', full, half, third, disabled, readOnly, required, optional,
  placeholder, hint, error, maxLength, id, name, onBlur, onKeyDown, autoFocus, inputMode, style,
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: flexOf(full, half, third), minWidth: 0, ...style }}>
      <FieldLabel label={label} required={required} optional={optional} error={error} focus={focus} htmlFor={id} />
      <input
        id={id} name={name} className="nk-input" type={type} value={value ?? ''} disabled={disabled} readOnly={readOnly}
        maxLength={maxLength} autoFocus={autoFocus} inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={(e) => { setFocus(false); onBlur?.(e); }} onKeyDown={onKeyDown}
        style={{
          width: '100%', height: SIZE.input, borderRadius: RADIUS.md, border: borderOf(focus, error, disabled),
          background: disabled ? DISABLED_BG : INPUT_BG, padding: '0 14px',
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

/* ---------- SELECT (44px) — label DI ATAS kotak, pola sama FloatingInput ---------- */
export function FloatingSelect({ label, value, onChange, options = [], half, third, full, disabled, required, optional, hint, error, id, name, style }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: flexOf(full, half, third), minWidth: 0, ...style }}>
      <FieldLabel label={label} required={required} optional={optional} error={error} focus={focus} htmlFor={id} />
      <div style={{ position: 'relative' }}>
        <select
          id={id} name={name} className="nk-select" value={value ?? ''} disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            width: '100%', height: SIZE.input, borderRadius: RADIUS.md, border: borderOf(focus, error, disabled),
            background: disabled ? DISABLED_BG : INPUT_BG, padding: '0 38px 0 14px',
            fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: disabled ? DISABLED_INK : INK,
            appearance: 'none', WebkitAppearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: focus ? FOCUS_RING : 'none', transition: `border-color ${MOTION.base}, box-shadow ${MOTION.base}`,
          }}
        >
          {/* Placeholder kosong SAAT `value` belum ada nilai yang cocok DAN
              `options` sendiri belum punya opsi value="" -- tanpa guard
              pertama, <select> terkontrol dengan value="" yang tak punya opsi
              value="" menampilkan opsi PERTAMA secara visual (kuirk HTML
              native) padahal React state-nya tetap kosong, sehingga memilih
              ulang opsi yang "sudah terlihat terpilih" itu tidak memicu
              onChange sama sekali -- kebuntuan yang ditemukan di
              CaptureLeadModal (field Source). Pola sama dengan
              MasterSelect.jsx. Guard KEDUA (`!options.some(...)`) ditambahkan
              setelah audit menemukan 8 dari 17 pemakai FloatingSelect sudah
              menyertakan opsi value="" miliknya sendiri (mis. "— Pilih
              entitas —") -- tanpa guard kedua, placeholder di sini jadi OPSI
              KOSONG KEDUA yang tak berlabel, duplikat yang terlihat di
              dropdown. Dua guard sekaligus = aman untuk pemakai yang SUDAH
              menjaga sendiri maupun yang BELUM. */}
          {!value && !options.some((o) => optVal(o) === '') && <option value="" />}
          {options.map((o) => <option key={optVal(o)} value={optVal(o)}>{optLabel(o)}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: INK_SOFT, pointerEvents: 'none' }}><ChevronDown size={16} /></span>
      </div>
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

/* ---------- TEXTAREA — label lewat FieldLabel yang sama (13 Okt 2026) ----------
   Sudah "label di atas" sejak awal; yang berubah cuma menyatukannya dengan
   FloatingInput/FloatingSelect (fontSize 12.5→12, marginBottom 6→8, persis
   mockup) + `required` + warna label jadi reaktif-fokus juga (dulu HANYA
   error/INK_SOFT, TIDAK ada cabang fokus -- sekarang konsisten dgn kedua
   kontrol lain). */
export function Textarea({
  label, value, onChange, rows = 3, placeholder, hint, error, maxLength, disabled, readOnly,
  mono, full = true, half, required, optional, id, name, style, resize = 'vertical',
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ flex: flexOf(full && !half, half, false), minWidth: 0, ...style }}>
      <FieldLabel label={label} required={required} optional={optional} error={error} focus={focus} htmlFor={id} />
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
          // TD-318 Irisan Kit, N2: 44px persis mockup (Lead Management.dc.html
          // :60, kotak field 44px) -- bukan 36px. Baris filter yang
          // menyandingkan SearchInput dgn Select/<input type="date"> (kedua
          // SUDAH 44px, SIZE.input) sebelumnya punya label tidak sejajar
          // karena kotak Search lebih pendek 8px.
          width: '100%', boxSizing: 'border-box', height: SIZE.input, padding: '0 12px 0 32px', borderRadius: RADIUS.md,
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
   SLIDER — <input type="range"> bertoken, dua-baris label (judul kiri · nilai
   kini kanan, sama persis susunan "Estimated Value, up to / Rp 600 million"
   mockup Lead Management). `formatValue` memformat nilai mentah utk baris
   kanan (default: angka polos); `accentColor` CSS native dipakai utk mewarnai
   track/thumb -- lolos Chrome/Edge/Firefox terkini, satu-satunya cara
   mewarnai <input type="range"> tanpa membangun ulang thumb custom.
   ========================================================================= */
export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, formatValue, full, half, id, ariaLabel }) {
  const shown = formatValue ? formatValue(value) : value;
  return (
    <div style={{ flex: flexOf(full, half, false), minWidth: 160 }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: SP.s2, marginBottom: 8 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: INK_SOFT }}>{label}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{shown}</span>
        </div>
      )}
      <input
        type="range" id={id} aria-label={ariaLabel || label} min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: INK_SOFT, cursor: 'pointer', height: 20 }}
      />
    </div>
  );
}

/* =========================================================================
   SEGMENTED — thumb geser di atas track HEAD_BG
   Kotak sorot mengikuti posisi/lebar NYATA tombol aktif (ref offsetLeft/
   offsetWidth), BUKAN lagi lebar rata calc((100%-8px)/n) -- tombol sendiri
   TIDAK selalu rata (lebarnya ikut panjang label tiap pemakai berbeda-beda,
   terlihat jelas di LeadAssignmentPage), jadi kotak rata lama meleset dari
   tulisan. Diukur ulang lewat useLayoutEffect TANPA larik dependensi
   (jalan tiap render, sebelum paint) -- aman dari render-loop karena
   setHighlight functional-updater mengembalikan STATE LAMA persis kalau
   left/width/visible tidak berubah (React membatalkan render berikutnya).
   Pola ini otomatis menangkap tiga pemicu yang diminta: idx berubah, teks
   label berubah (opsi array selalu baru di pemanggil), DAN ResizeObserver
   terpisah menangkap resize viewport/container. Prop `full` tidak diubah
   perilakunya (tombol tetap flex:1, dibagi rata) -- yang berubah hanya
   CARA kotak sorot mengukur, bukan cara tombol disusun.

   TD-318 Irisan 4 (tes token-per-token vs TIGA pemakaian pola segmented-pill
   di mockup Lead Management.dc.html -- My Leads/All Leads di Capture [seg()
   helper, :668] DAN Qualification [:154], Pool/FAC/Approvals di Lead
   Assignment [poolOpts, :811] -- ketiganya SEPAKAT persis, sumber yang
   SAMA (helper `seg()`): kotak sorot aktif SELALU putih `#FFFFFF`
   (bukan INPUT_BG/BG sage-tinted), TEKS tombol SELALU INK (aktif maupun
   tidak -- mockup tak punya cabang warna teks sama sekali), tinggi tombol
   32px (bukan 38), font 13.5px (bukan 13). Diperbaiki DI KIT karena
   seluruh mockup yang memakai pola ini sepakat -- bukan satu halaman yang
   menyimpang. Dampak visual ke pemakai LAIN (6 halaman Admin/Foundation,
   di luar lingkup Lead Management): DocumentSettingsPage, ApprovalWorkflowsPage,
   IntegrationsPage, FinanceDefaultsPage, SecurityPolicyPage,
   GeneralPreferencesPage -- tab aktifnya akan tampak PUTIH POLOS (bukan
   lagi off-white sage) dan tab TIDAK aktif teksnya akan lebih gelap
   (INK, bukan INK_SOFT yang diredam). Dilaporkan eksplisit di laporan
   Irisan 4, bukan disembunyikan sebagai efek samping.
   ========================================================================= */
export function Segmented({ options = [], value, onChange, full, ariaLabel }) {
  const idx = options.findIndex((o) => optVal(o) === value);
  const containerRef = useRef(null);
  const btnRefs = useRef([]);
  const [highlight, setHighlight] = useState({ left: 4, width: 0, visible: false });

  const measure = useCallback(() => {
    const btn = btnRefs.current[idx];
    if (!btn) {
      setHighlight((h) => (h.visible ? { ...h, visible: false } : h));
      return;
    }
    const left = btn.offsetLeft, width = btn.offsetWidth;
    setHighlight((h) => (h.left === left && h.width === width && h.visible ? h : { left, width, visible: true }));
  }, [idx]);

  // Tanpa larik dependensi -- jalan sesudah TIAP commit (termasuk saat
  // hanya teks label berubah, yang tak punya sinyal lain utk dipantau),
  // sebelum browser paint (useLayoutEffect, bukan useEffect) supaya
  // posisi baru tak pernah sempat ter-flash di posisi lama.
  useLayoutEffect(() => { measure(); });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={containerRef} role="radiogroup" aria-label={ariaLabel} style={{
      display: full ? 'flex' : 'inline-flex', position: 'relative', background: HEAD_BG, border: `1px solid ${LINE}`,
      borderRadius: RADIUS.md, padding: 4, width: full ? '100%' : 'auto', boxSizing: 'border-box',
    }}>
      <div style={{
        position: 'absolute', top: 4, bottom: 4, left: highlight.left, width: highlight.width,
        background: CARD, border: `1px solid ${LINE}`,
        borderRadius: 8, boxShadow: SHADOW_1, transition: `left .28s ${MOTION.ease}, width .28s ${MOTION.ease}`, opacity: highlight.visible ? 1 : 0,
      }} />
      {options.map((o, i) => {
        const val = optVal(o);
        const active = val === value;
        const icon = typeof o === 'object' ? o.icon : null;
        // `count` ADITIF (TD-318 Irisan 4, item D) -- persis mockup
        // Lead Management.dc.html :106/:811 (`o.hasCount`/`o.count`): badge
        // tampil HANYA kalau opsi ini membawa `count` (bukan undefined),
        // nol dampak ke 9 konsumen lain yang opsinya tak punya field ini.
        const hasCount = typeof o === 'object' && o.count !== undefined;
        return (
          <button
            key={val} ref={(el) => { btnRefs.current[i] = el; }}
            type="button" role="radio" aria-checked={active} onClick={() => onChange(val)} className="nk-focus"
            style={{
              position: 'relative', zIndex: 1, flex: 1, height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: FONT_HEAD, fontSize: 13.5, fontWeight: 600, color: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'color .25s', whiteSpace: 'nowrap', padding: '0 14px',
              borderRadius: 8,
            }}
          >
            {icon && renderIcon(icon, 15)}
            {optLabel(o)}
            {hasCount && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: RADIUS.sm,
                border: `1px solid ${SEMANTIC.warn.bd}`, background: SEMANTIC.warn.bg, color: SEMANTIC.warn.fg,
                fontFamily: FONT_HEAD, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                {o.count}
              </span>
            )}
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
