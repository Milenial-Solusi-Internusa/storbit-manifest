/* =========================================================================
   Overlay kit tunggal (Batch DS 1): Modal · SlideOver · Tooltip.
   Pindahan AdminKit; kontrak props sama (`open` `onClose` `title` `subtitle`
   `footer` `width`). Tambahan aditif: Escape menutup (`closeOnEscape`,
   default true — sejalan ConfirmModal bersama), `aria-modal`, tombol tutup =
   IconButton kit. Permukaan = CARD; input di dalamnya INPUT_BG (= BG) jadi
   tetap timbul. Bayangan hanya di sini (elemen melayang), bukan di kartu.
   ConfirmModal bersama (`src/components/ConfirmModal.jsx`) TIDAK di sini —
   ia di-restyle di Batch DS 4a dan tetap di tempatnya.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { CARD, INK, INK_SOFT, LINE, BG, BACKDROP, SHADOW_2, FONT_HEAD, FONT_BODY, RADIUS, Z, MOTION } from './tokens';

/* Mount/unmount bertahap supaya animasi keluar sempat jalan.
   `mounted` dinaikkan SAAT RENDER (pola "adjust state during render" React),
   bukan di dalam effect — menghindari setState sinkron di badan effect
   (aturan react-hooks/set-state-in-effect). Yang di effect hanya jadwal
   asinkron: rAF untuk `shown`, timeout untuk unmount. */
function useMounted(open, exitMs) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => setShown(false));
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [open, exitMs]);
  return [mounted, shown];
}

function useEscape(open, onClose, enabled) {
  useEffect(() => {
    if (!open || !enabled || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, enabled, onClose]);
}

function Head({ title, subtitle, onClose, sticky }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '22px 24px', borderBottom: `1px solid ${LINE}`,
      ...(sticky ? { position: 'sticky', top: 0, background: CARD, zIndex: 2 } : null),
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, color: INK, letterSpacing: -0.3 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 4, fontFamily: FONT_BODY }}>{subtitle}</div>}
      </div>
      <IconButton icon={<X size={18} />} label="Tutup" onClick={onClose} />
    </div>
  );
}

/* =========================================================================
   SLIDE-OVER — panel geser dari kanan, header & footer sticky
   ========================================================================= */
export function SlideOver({ open, onClose, title, subtitle, children, footer, width = 480, closeOnEscape = true }) {
  const [mounted, shown] = useMounted(open, 320);
  useEscape(open, onClose, closeOnEscape);
  if (!mounted) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: Z.slideOver }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: BACKDROP, opacity: shown ? 1 : 0, transition: `opacity ${MOTION.slow} ease`, backdropFilter: 'blur(1.5px)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="nk-scroll"
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width, maxWidth: '94vw', background: CARD, boxShadow: SHADOW_2,
          display: 'flex', flexDirection: 'column', transform: shown ? 'translateX(0)' : 'translateX(100%)',
          transition: `transform .34s ${MOTION.ease}`, overflowY: 'auto', fontFamily: FONT_BODY, color: INK,
        }}
      >
        <Head title={title} subtitle={subtitle} onClose={onClose} sticky />
        <div style={{ padding: 24, flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${LINE}`, position: 'sticky', bottom: 0, background: CARD, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   MODAL — dialog tengah, fade + scale
   ========================================================================= */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 540, closeOnEscape = true }) {
  const [mounted, shown] = useMounted(open, 240);
  useEscape(open, onClose, closeOnEscape);
  if (!mounted) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: Z.modal, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: BACKDROP, opacity: shown ? 1 : 0, transition: 'opacity .24s ease', backdropFilter: 'blur(2px)' }} />
      <div
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} className="nk-scroll"
        style={{
          position: 'relative', width, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', background: CARD, borderRadius: RADIUS.xl,
          boxShadow: SHADOW_2, opacity: shown ? 1 : 0, transform: shown ? 'scale(1)' : 'scale(.95)',
          transition: `opacity .24s ease, transform .24s ${MOTION.ease}`, fontFamily: FONT_BODY, color: INK,
        }}
      >
        <Head title={title} subtitle={subtitle} onClose={onClose} />
        <div style={{ padding: 24 }}>{children}</div>
        {footer && (
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${LINE}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   TOOLTIP — gelap (INK) berteks BG, delay 150 ms
   ========================================================================= */
export function Tooltip({ label, children, side = 'top' }) {
  const [show, setShow] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const pos = side === 'top'
    ? { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
    : { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => { t.current = setTimeout(() => setShow(true), 150); }}
      onMouseLeave={() => { clearTimeout(t.current); setShow(false); }}
      onFocus={() => setShow(true)} onBlur={() => setShow(false)}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: 'absolute', ...pos, background: INK, color: BG, fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 500,
          padding: '6px 10px', borderRadius: 8, whiteSpace: 'nowrap', maxWidth: 240, pointerEvents: 'none', zIndex: Z.tooltip,
          opacity: show ? 1 : 0,
          transform: pos.transform + (show ? ' translateY(0)' : side === 'top' ? ' translateY(4px)' : ' translateY(-4px)'),
          transition: 'opacity .15s ease, transform .15s ease', boxShadow: SHADOW_2,
        }}
      >
        {label}
      </span>
    </span>
  );
}
