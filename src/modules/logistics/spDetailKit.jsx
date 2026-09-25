// src/modules/logistics/spDetailKit.jsx
// Komponen kecil keluarga ungu/serif Storbit, diangkat dari
// SalesOrderDetailPage.jsx saat AR Tahap 2 memindahkan panel Invoice ke modul
// Finance. Diangkat, bukan disalin -- kedua pemakainya mengimpor dari sini.
import { C, blurOnWheel } from './spDetailTokens.js';

function Badge({ bg, color, bd, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: bg, color, border: `1px solid ${bd}`,
      // Rounded-rect tipis, BUKAN pill — semua badge di halaman ini lewat komponen
      // ini, jadi satu perubahan di sini berlaku konsisten ke seluruh badge.
      fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 3, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function ModalField({ label, req, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
        {label}{req && <span style={{ color: C.danger }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ModalInp({ readOnly, mono, ...rest }) {
  return (
    <input
      readOnly={readOnly}
      {...rest}
      onWheel={blurOnWheel}
      style={{
        height: 38, padding: '0 11px', border: `1px solid ${C.line}`, borderRadius: 8,
        background: readOnly ? C.surface2 : C.surface, fontSize: 13, color: C.ink,
        outline: 'none', fontFamily: mono ? "'IBM Plex Mono',monospace" : 'inherit',
        cursor: readOnly ? 'not-allowed' : 'text', width: '100%', boxSizing: 'border-box',
        ...rest.style,
      }}
    />
  );
}

function ModalGrid({ cols, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px 16px' }}>
      {children}
    </div>
  );
}

export { Badge, ModalField, ModalInp, ModalGrid };
