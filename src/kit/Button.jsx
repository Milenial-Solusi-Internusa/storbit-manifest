/* =========================================================================
   Button · SaveButton · IconButton — tombol kit tunggal (Batch DS 1).

   Menggantikan `PrimaryBtn`/`OutlineBtn` dua kit lama + `ghostBtn` Chatter.
   Pola lama "solid navy/oranye + teks putih" TIDAK dibawa: putih di atas aksen
   sage gagal AA (1,5–1,95:1), jadi semua varian berisi teks `INK` di atas latar
   aksen (keputusan #2). Ukuran: md 40 · sm 32 · xs 28 · radius 10 (keputusan #7).

   `SaveButton` dibangun benar sejak awal (keputusan #5 → menutup TD-270 di
   sisi kode baru): ia MENUNGGU `onSave` selesai sebelum menampilkan
   "Tersimpan!", dan menampilkan keadaan GAGAL bila `onSave` melempar atau
   mengembalikan `{ error }` (bentuk hasil supabase-js). Versi AdminKit lama
   memakai setTimeout 950 ms dan selalu "sukses" apa pun hasil server.

   Alias `PrimaryBtn`/`OutlineBtn` di bawah = kompatibilitas migrasi, dicabut
   Batch DS 7.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Loader } from 'lucide-react';
import Icon from './Icon';
import {
  ACCENT, ACCENT_HOVER, ACCENT_2, ACCENT_2_HOVER, INK, INK_SOFT, INK_FAINT,
  ROW_HOVER, INPUT_BG, LINE, DISABLED_BG, DISABLED_INK, SEMANTIC,
  FONT_HEAD, RADIUS, SIZE, MOTION,
} from './tokens';

const SIZES = {
  md: { h: SIZE.btnMd, px: 16, font: 13.5, icon: 16, gap: 8 },
  sm: { h: SIZE.btnSm, px: 12, font: 12.5, icon: 14, gap: 6 },
  xs: { h: SIZE.btnXs, px: 10, font: 11.5, icon: 12, gap: 5 },
};

/* fg SELALU INK di atas aksen — INK_SOFT pun gagal AA di sana (3,79:1). */
const VARIANTS = {
  primary:   { bg: ACCENT,   bgHover: ACCENT_HOVER,   fg: INK,      fgHover: INK, bd: ACCENT,      bdHover: ACCENT_HOVER },
  secondary: { bg: ACCENT_2, bgHover: ACCENT_2_HOVER, fg: INK,      fgHover: INK, bd: ACCENT_2,    bdHover: ACCENT_2_HOVER },
  /* border INK_FAINT (3,2:1 di BG) bukan LINE (1,27:1): batas tombol outline
     harus lolos ambang non-teks 3:1, LINE tidak. */
  outline:   { bg: 'transparent', bgHover: ROW_HOVER, fg: INK,      fgHover: INK, bd: INK_FAINT,   bdHover: INK_SOFT },
  ghost:     { bg: 'transparent', bgHover: ROW_HOVER, fg: INK_SOFT, fgHover: INK, bd: 'transparent', bdHover: 'transparent' },
  /* danger = tint status (kelas STATUS/DATA), bukan merah solid + putih. */
  danger:    { bg: SEMANTIC.danger.bg, bgHover: SEMANTIC.danger.bg, fg: SEMANTIC.danger.fg, fgHover: SEMANTIC.danger.fg, bd: SEMANTIC.danger.bd, bdHover: SEMANTIC.danger.fg },
};

/* `icon` boleh node Lucide (pola v3) ATAU nama registri (pola AdminKit). */
const renderIcon = (icon, size) => (typeof icon === 'string' ? <Icon name={icon} size={size} /> : icon);

/**
 * @param {Object}  props
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'} [props.variant='primary']
 * @param {'md'|'sm'|'xs'} [props.size='md']
 * @param {Node|string} [props.icon]      - ikon kiri (node Lucide atau nama registri)
 * @param {Node|string} [props.iconRight]
 * @param {boolean} [props.loading]       - spinner + nonaktif, label tetap
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.full]          - lebar 100%
 * @param {string}  [props.type='button']
 */
export function Button({
  variant = 'primary', size = 'md', icon, iconRight, loading = false, disabled = false,
  full = false, type = 'button', onClick, style, children, ...rest
}) {
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const off = disabled || loading;
  const bg = off && variant !== 'ghost' ? DISABLED_BG : hover && !off ? v.bgHover : v.bg;
  const fg = off ? DISABLED_INK : hover ? v.fgHover : v.fg;
  const bd = off && variant !== 'ghost' ? DISABLED_BG : hover && !off ? v.bdHover : v.bd;
  return (
    <button
      type={type} onClick={off ? undefined : onClick} disabled={off} aria-busy={loading || undefined}
      className="nk-focus"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)} onMouseUp={() => setDown(false)}
      style={{
        display: full ? 'flex' : 'inline-flex', width: full ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: s.gap,
        height: s.h, padding: `0 ${s.px}px`, borderRadius: RADIUS.md,
        border: `1px solid ${bd}`, background: bg, color: fg,
        fontFamily: FONT_HEAD, fontSize: s.font, fontWeight: 600, lineHeight: 1,
        cursor: off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        transition: `background ${MOTION.base}, border-color ${MOTION.base}, color ${MOTION.base}, transform ${MOTION.fast}`,
        transform: down && !off ? 'scale(.97)' : 'none',
        ...style,
      }}
      {...rest}
    >
      {loading
        ? <span className="nk-spin" style={{ display: 'inline-flex' }}><Loader size={s.icon} /></span>
        : renderIcon(icon, s.icon)}
      {children}
      {renderIcon(iconRight, s.icon)}
    </button>
  );
}

/**
 * SaveButton — idle → saving → saved | error → idle.
 *
 * KONTRAK `onSave` (pemanggil dicek satu per satu di Batch DS 2):
 *   - mengembalikan Promise → tombol menunggu sampai selesai (WAJIB untuk
 *     panggilan server; nilai sinkron dianggap selesai seketika — "sukses
 *     instan" persis risiko yang dicatat A.4.5);
 *   - melempar (reject) → keadaan GAGAL + `onError(err)`;
 *   - resolve `{ error }` dengan `error` truthy (hasil supabase-js) → GAGAL;
 *   - resolve `false` → kembali ke idle TANPA "Tersimpan!" (validasi halaman
 *     gagal; halaman yang menampilkan pesannya);
 *   - resolve apa pun selain itu → "Tersimpan!".
 *
 * @param {Object}   props
 * @param {Function} props.onSave
 * @param {Function} [props.onError]     - (err) => void, dipanggil saat gagal
 * @param {string}   [props.label='Simpan']
 * @param {string}   [props.savingLabel='Menyimpan…']
 * @param {string}   [props.savedLabel='Tersimpan!']
 * @param {string}   [props.errorLabel='Gagal menyimpan']
 * @param {'primary'|'secondary'} [props.variant='primary']
 * @param {number}   [props.resetAfter=2000] - ms sebelum kembali ke idle
 */
export function SaveButton({
  onSave, onError, label = 'Simpan', savingLabel = 'Menyimpan…', savedLabel = 'Tersimpan!',
  errorLabel = 'Gagal menyimpan', variant = 'primary', size = 'md', disabled = false,
  resetAfter = 2000, style, ...rest
}) {
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [hover, setHover] = useState(false);
  const alive = useRef(true);
  const timer = useRef(null);
  /* `alive` dinaikkan lagi di badan effect, bukan cuma di-set di useRef:
     StrictMode menjalankan cleanup lalu memasang ulang effect — tanpa baris
     `alive.current = true` tombol akan mengira dirinya sudah unmount dan
     macet di "Menyimpan…" (terjadi saat uji etalase 20 Sep 2026). */
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, []);

  async function go() {
    if (state !== 'idle' || disabled) return;
    setState('saving');
    let failed = null;
    let skipped = false;
    try {
      const res = await Promise.resolve(onSave?.());
      if (res && typeof res === 'object' && res.error) failed = res.error;
      else if (res === false) skipped = true;
    } catch (err) {
      failed = err ?? new Error('save failed');
    }
    if (!alive.current) return;
    if (failed) {
      setState('error');
      onError?.(failed);
      timer.current = setTimeout(() => alive.current && setState('idle'), Math.max(resetAfter, 2600));
      return;
    }
    if (skipped) { setState('idle'); return; }
    setState('saved');
    timer.current = setTimeout(() => alive.current && setState('idle'), resetAfter);
  }

  const s = SIZES[size] || SIZES.md;
  const v = variant === 'secondary' ? VARIANTS.secondary : VARIANTS.primary;
  const look = state === 'saved'
    ? { bg: SEMANTIC.ok.bg, fg: SEMANTIC.ok.fg, bd: SEMANTIC.ok.bd }
    : state === 'error'
      ? { bg: SEMANTIC.danger.bg, fg: SEMANTIC.danger.fg, bd: SEMANTIC.danger.bd }
      : disabled
        ? { bg: DISABLED_BG, fg: DISABLED_INK, bd: DISABLED_BG }
        : { bg: hover && state === 'idle' ? v.bgHover : v.bg, fg: INK, bd: hover && state === 'idle' ? v.bdHover : v.bd };

  return (
    <button
      type="button" onClick={go} disabled={disabled} aria-busy={state === 'saving' || undefined}
      aria-live="polite" className="nk-focus"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
        height: s.h, minWidth: 138, padding: `0 ${s.px + 4}px`, borderRadius: RADIUS.md,
        border: `1px solid ${look.bd}`, background: look.bg, color: look.fg,
        fontFamily: FONT_HEAD, fontSize: s.font, fontWeight: 600, lineHeight: 1,
        cursor: state === 'idle' && !disabled ? 'pointer' : 'default', whiteSpace: 'nowrap',
        transition: `background ${MOTION.slow}, border-color ${MOTION.base}, color ${MOTION.base}`,
        ...style,
      }}
      {...rest}
    >
      {state === 'idle' && <><Check size={s.icon} />{label}</>}
      {state === 'saving' && <><span className="nk-spin" style={{ display: 'inline-flex' }}><Loader size={s.icon} /></span>{savingLabel}</>}
      {state === 'saved' && <span className="nk-pop" style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap }}><CheckCircle2 size={s.icon + 1} />{savedLabel}</span>}
      {state === 'error' && <span className="nk-pop" style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap }}><AlertTriangle size={s.icon + 1} />{errorLabel}</span>}
    </button>
  );
}

const ICON_SIZES = { md: { box: 36, icon: 18 }, sm: { box: 32, icon: 16 }, xs: { box: 28, icon: 14 } };

/**
 * IconButton — tombol ikon persegi (tutup modal, back, aksi baris).
 * @param {Object}  props
 * @param {Node|string} props.icon
 * @param {string}  props.label     - WAJIB: aria-label + title (ikon tanpa teks)
 * @param {'md'|'sm'|'xs'} [props.size='md']
 * @param {'outline'|'ghost'} [props.variant='outline']
 * @param {boolean} [props.active]  - latar ACCENT (mis. toggle tampilan)
 * @param {boolean} [props.danger]
 */
export function IconButton({
  icon, label, size = 'md', variant = 'outline', active = false, danger = false,
  disabled = false, onClick, style, ...rest
}) {
  const [hover, setHover] = useState(false);
  const s = ICON_SIZES[size] || ICON_SIZES.md;
  const fg = disabled ? DISABLED_INK : danger ? SEMANTIC.danger.fg : hover || active ? INK : INK_SOFT;
  const bg = disabled ? (variant === 'ghost' ? 'transparent' : DISABLED_BG)
    : active ? ACCENT : hover ? (danger ? SEMANTIC.danger.bg : ROW_HOVER) : variant === 'ghost' ? 'transparent' : INPUT_BG;
  const bd = variant === 'ghost' && !active ? 'transparent' : active ? ACCENT_HOVER : danger && hover ? SEMANTIC.danger.bd : LINE;
  return (
    <button
      type="button" onClick={disabled ? undefined : onClick} disabled={disabled}
      aria-label={label} title={label} aria-pressed={active || undefined} className="nk-focus"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: s.box, height: s.box, flex: `0 0 ${s.box}px`, borderRadius: size === 'xs' ? RADIUS.sm : RADIUS.md,
        border: `1px solid ${bd}`, background: bg, color: fg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `background ${MOTION.base}, color ${MOTION.base}, border-color ${MOTION.base}`,
        ...style,
      }}
      {...rest}
    >
      {renderIcon(icon, s.icon)}
    </button>
  );
}

/* ---------- ALIAS kompatibilitas (dicabut Batch DS 7) ----------
   AdminKit: `<PrimaryBtn icon="plus">`, `<OutlineBtn danger>` · v3: ikon node,
   `disabled`. Keduanya jatuh ke Button; tinggi 44 (AdminKit) → 40 (kit). */
export function PrimaryBtn(props) { return <Button variant="primary" {...props} />; }
export function OutlineBtn({ danger, ...props }) { return <Button variant={danger ? 'danger' : 'outline'} {...props} />; }
