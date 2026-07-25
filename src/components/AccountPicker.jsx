// src/components/AccountPicker.jsx
// Searchable account combobox (portal dropdown, filter by name, flip-up).
// Reuses the ProductPicker *pattern* (portal menu, realtime filter, flip-up,
// outside-click close) but is shaped for CRM accounts — {id, name, account_status}
// — instead of products: filters on `name` only (accounts have no code), renders
// name + a status badge (e.g. "AROMA SCENTS" + "Prospect"), and single-selects.
// Deliberate divergences from ProductPicker: a single-line <input> (this is a
// single-select field, not a multi-line description) and no auto-grow.
// ProductPicker + its 7 consumers are untouched.
//
// Colors match InquiryFormPage's slate/white palette (navy #1B4D8A) so the picker
// blends with the surrounding form. The #1B4D8A vs brand #144682 drift is TD-93,
// resolved form-wide later — not here.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const C = {
  surface:  '#FFFFFF',
  surface2: '#F1F5F9',   // row hover
  ink:      '#0F172A',
  inkFaint: '#94A3B8',
  line:     '#E2E8F0',
  lineSoft: '#F1F5F9',
  navy:     '#1B4D8A',
  navyBg:   '#EAF0F8',
};

export default function AccountPicker({
  value,
  accounts,
  inputStyle,
  onChangeText,
  onPick,
  placeholder = 'Cari akun…',
  emptyText = 'Tidak ada akun yang cocok',
  statusLabel,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);   // { top, left, width } from input rect (viewport coords)
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const q = (value || '').trim().toLowerCase();
  const matches = q.length >= 1
    ? (accounts || []).filter(a => a.name && a.name.toLowerCase().includes(q)).slice(0, 10)
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
        onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
        onFocus={() => { if ((value || '').trim().length >= 1) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        style={inputStyle}
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
          ) : matches.map((a) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(a); setOpen(false); }}
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
                {a.name}
              </span>
              {a.account_status && (
                <span style={{
                  flex: '0 0 auto', fontSize: 10.5, fontWeight: 600, color: C.navy,
                  background: C.navyBg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
                }}>
                  {statusLabel ? statusLabel(a.account_status) : a.account_status}
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
