// src/components/CodeNamePicker.jsx
// Searchable code+name combobox (portal dropdown, filter by name/code, flip-up,
// single-line input, optional category badge per row — e.g. "[SCM] Logistic").
// Sibling of ProductPicker.jsx / AccountPicker.jsx / InquiryPicker.jsx — same
// portal/positioning/outside-click pattern, copied rather than parameterized.
// This matches the established practice in this codebase: ProductPicker (7
// consumers) and AccountPicker are both explicitly left untouched whenever a
// new entity needs a similar picker — see the "Deliberate divergences" note
// in AccountPicker.jsx. Built for BNF's Divisi/Departemen/Divisi-Dept-Irisan
// pickers; generic enough (items just need {id, name, code?, category?}) to
// reuse elsewhere for any short, browsable code+name list.
//
// Divergence from ProductPicker/AccountPicker: minChars defaults to 0 (shows
// the full list on focus before typing) rather than 1 — appropriate for short,
// fully-enumerable lists like divisions/departments, unlike Product's much
// larger catalog where an unfiltered list wouldn't be useful.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const C = {
  surface:  '#FFFFFF',
  surface2: '#F1F5F9',
  ink:      '#0F172A',
  inkFaint: '#94A3B8',
  line:     '#E2E8F0',
  lineSoft: '#F1F5F9',
  navy:     '#0F3A66',
  navyBg:   '#EAF0F8',
};

export default function CodeNamePicker({
  value, items, inputStyle, inputClassName, onChangeText, onPick,
  placeholder = 'Cari…', emptyText = 'Tidak ada yang cocok',
  disabled = false, minChars = 0, maxResults = 20,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null); // { top, left, width } from input rect (viewport coords)
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const q = (value || '').trim().toLowerCase();
  const matches = !disabled && q.length >= minChars
    ? (items || []).filter((it) =>
        (it.name && it.name.toLowerCase().includes(q)) ||
        (it.code && it.code.toLowerCase().includes(q))
      ).slice(0, maxResults)
    : [];
  const showDrop = !disabled && open && q.length >= minChars;

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
    window.addEventListener('scroll', update, true); // capture: also catch scroll inside a scroll container
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

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
        onFocus={() => { if (!disabled && (value || '').trim().length >= minChars) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className={inputClassName}
        style={{ ...inputStyle, ...(disabled ? { opacity: 0.6, cursor: 'not-allowed', background: '#F1F5F9' } : {}) }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDrop && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: coords.top, left: coords.left, width: coords.width, marginTop: 2,
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8,
            boxShadow: '0 6px 20px rgba(15,23,42,.16)', zIndex: 9999,
            maxHeight: 240, overflowY: 'auto', minWidth: 240,
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: C.inkFaint }}>{emptyText}</div>
          ) : matches.map((it) => (
            <button
              key={it.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', background: 'none', border: 'none',
                borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer',
                textAlign: 'left', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.surface2)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.code && <span style={{ color: C.navy, fontWeight: 700 }}>[{it.code}] </span>}
                {it.name}
              </span>
              {it.category && (
                <span style={{
                  flex: '0 0 auto', fontSize: 10.5, fontWeight: 600, color: C.navy,
                  background: C.navyBg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
                }}>
                  {it.category}
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
