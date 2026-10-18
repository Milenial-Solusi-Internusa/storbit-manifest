/* =========================================================================
   DropdownMenu — menu kebab generik: tombol pemicu (biasanya ikon "⋮") +
   daftar aksi kontekstual, tiap baris boleh disembunyikan lewat kondisi.
   Acuan mockup Inquiry Management.dc.html: kebab Inquiry (`mCreateQuo` dkk,
   baris ~863) dan kebab Quotation Management.dc.html (`detail`, baris 855) —
   keduanya array literal `[label, onClick, kondisiTampil]`, difilter SEBELUM
   dirender, bukan dirender lalu disembunyikan CSS.

   Posisi/portal/Escape mengikuti pola `MasterSelect.jsx` (TD-318 Irisan 3,
   sudah lolos tes Den untuk popover di dalam Modal yang scroll) — BUKAN
   `overlayStack` milik Modal/SlideOver di `Overlay.jsx` (itu modul-level
   privat, untuk overlay penuh-layar yang saling menumpuk; kebab menu adalah
   widget ringan di dalam satu overlay, bukan overlay baru yang ikut antre).
   ========================================================================= */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CARD, INK, LINE, ROW_HOVER, SEMANTIC, FONT_BODY, RADIUS, SP, SHADOW_1, Z } from './tokens';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.trigger                 - elemen pemicu (biasanya IconButton kebab)
 * @param {Array<{label:string, onClick:()=>void, show?:boolean, danger?:boolean}>} props.items
 */
export function DropdownMenu({ trigger, items = [] }) {
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const visible = items.filter((it) => it.show !== false);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Capture + stopImmediatePropagation -- Escape menutup HANYA menu ini,
  // tidak ikut menutup Modal pembungkus (pola persis MasterSelect.jsx).
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDownCapture(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.querySelector('button')?.focus();
    }
    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    function measure() {
      const t = triggerRef.current;
      if (!t) return;
      const tr = t.getBoundingClientRect();
      const vh = window.innerHeight;
      if (tr.bottom < 0 || tr.top > vh) { setOpen(false); return; }
      const panelH = popoverRef.current?.offsetHeight || 0;
      const spaceBelow = vh - tr.bottom;
      const openUp = panelH > 0 && spaceBelow < panelH + 4 && tr.top > panelH + 4;
      setPos({
        left: tr.right - 200, // lebar panel fixed 200 — menu kebab selalu rata-kanan ke tombolnya
        top: openUp ? tr.top - panelH - 4 : tr.bottom + 4,
      });
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [open]);

  return (
    <div ref={triggerRef} style={{ display: 'inline-flex', position: 'relative' }}>
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && pos && createPortal(
        <div
          ref={popoverRef} role="menu"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: 200, background: CARD,
            border: `1px solid ${LINE}`, borderRadius: RADIUS.md, boxShadow: SHADOW_1, padding: SP.s1,
            zIndex: Z.popover, display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {visible.map((it) => (
            <button
              key={it.label} type="button" role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 0, borderRadius: 8,
                background: 'transparent', textAlign: 'left', cursor: 'pointer',
                fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 400,
                color: it.danger ? SEMANTIC.danger.fg : INK,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = it.danger ? SEMANTIC.danger.bg : ROW_HOVER; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
