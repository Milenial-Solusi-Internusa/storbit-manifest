// src/components/DcPicker.jsx
// Searchable Distribution Center combobox (portal dropdown, filter by kode/nama,
// flip-up). Reuses the AccountPicker *pattern* (portal menu, realtime filter,
// flip-up, outside-click close) but is shaped for dc_master — {id, kode, nama,
// wilayah} — instead of CRM accounts: filters on `nama` OR `kode`, renders the
// same "KODE · Nama" label the native <select> it replaces used to show (falls
// back to `nama` alone when `kode` is null), single-selects. AccountPicker.jsx
// itself is untouched — this is a new sibling, not a reuse (shape mismatch: no
// account_status, has kode).
//
// Deliberate divergence from AccountPicker: AccountPicker hides its dropdown
// until 1+ chars are typed. DcPicker shows the full list on focus even with
// empty text, matching the native <select> it replaces (which always showed
// every option with no typing required) — the caller is expected to pass an
// already-filtered, already-alphabetical `dcOptions` list (see InputSPPage's
// dc_master fetch), so an empty query just means "show all of them".
//
// Colors match AccountPicker/InputSPPage's navy (#1B4D8A) so the picker blends
// with the surrounding form.
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

const dcLabel = (o) => (o.kode ? `${o.kode} · ${o.nama}` : o.nama);

export default function DcPicker({
  value,
  dcOptions,
  inputStyle,
  onChangeText,
  onPick,
  placeholder = 'Cari DC…',
  emptyText = 'Tidak ada DC yang cocok',
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);   // { top, left, width } from input rect (viewport coords)
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const q = (value || '').trim().toLowerCase();
  const matches = q.length >= 1
    ? (dcOptions || []).filter(o =>
        (o.nama && o.nama.toLowerCase().includes(q)) ||
        (o.kode && o.kode.toLowerCase().includes(q))
      ).slice(0, 30)
    : (dcOptions || []);   // empty query → full (already customer-filtered, already alphabetical) list
  const showDrop = open;

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
        onFocus={() => setOpen(true)}
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
          ) : matches.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(o); setOpen(false); }}
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
                {dcLabel(o)}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
