// src/components/ProductPicker.jsx
// Searchable product combobox (portal dropdown, filter by name/code, flip-up).
// Extracted verbatim from QuotationFormPage's ProductDescInput so it can be
// reused (Quotation line items + Surat Jalan "Tambah Item"). Colors inlined to
// the exact hex QuotationFormPage used → its rendering is unchanged (net-zero).
// The input base style is caller-controlled via `inputStyle`; only the dropdown
// menu chrome is internal. `placeholder` defaults to 'Deskripsi…' (Quotation).
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const C = {
  surface:  '#FFFDF8',
  surface2: '#FBF6EC',
  ink:      '#23291E',
  inkFaint: '#8A8E7C',
  line:     '#E7DCC8',
  lineSoft: '#F0E7D6',
};

export default function ProductPicker({ value, products, inputStyle, onChangeText, onPick, placeholder = 'Deskripsi…' }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);   // { top, left, width } from input rect (viewport coords)
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const q = (value || '').trim().toLowerCase();
  const matches = q.length >= 1
    ? (products || []).filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
      ).slice(0, 10)
    : [];
  const showDrop = open && q.length >= 1;

  // Position the portalled dropdown from the input's bounding rect, and keep it
  // anchored on scroll/resize. position:fixed → viewport coords (no scroll offset).
  // Flip above the input when there isn't enough room below but there is above.
  useEffect(() => {
    if (!showDrop) return undefined;
    const update = () => {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dropdownHeight = 240; // matches the dropdown max-height
      const spaceBelow = window.innerHeight - r.bottom;
      const flipUp = spaceBelow < dropdownHeight && r.top > dropdownHeight;
      const top = flipUp ? r.top - dropdownHeight : r.bottom;
      setCoords({ top, left: r.left, width: r.width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true); // capture: also catch scroll inside the table container
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showDrop]);

  // Close on outside click — both the input wrapper and the portalled menu count as "inside".
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // Auto-grow the textarea so long descriptions wrap and stay fully visible.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
        onFocus={() => { if ((value || '').trim().length >= 1) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        style={{ ...inputStyle, height: 'auto', minHeight: 34, padding: '6px 8px', lineHeight: 1.4, resize: 'none', overflow: 'hidden', whiteSpace: 'pre-wrap' }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDrop && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: coords.top, left: coords.left, width: coords.width, marginTop: 2,
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8,
            boxShadow: '0 6px 20px rgba(35,41,30,.16)', zIndex: 9999,
            maxHeight: 240, overflowY: 'auto', minWidth: 240,
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: C.inkFaint }}>Tidak ada produk yang cocok</div>
          ) : matches.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(p); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', background: 'none', border: 'none',
                borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.surface2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.ink }}>
                <span style={{ color: '#1B4D8A', fontWeight: 700 }}>[{p.code}]</span> {p.name}
              </span>
              {p.category && (
                <span style={{
                  flex: '0 0 auto', fontSize: 10.5, fontWeight: 600, color: '#1B4D8A',
                  background: '#EAF0F8', borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
                }}>
                  {p.category}
                </span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
