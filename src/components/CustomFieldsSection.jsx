// src/components/CustomFieldsSection.jsx
// Renders dynamic input fields for custom (non-standard) DB columns.
// Props:
//   customFields — array of { column_name, data_type } from useCustomFields()
//   values       — object { column_name: value }
//   onChange     — (key, value) => void
//   readOnly     — boolean (default false) — render as text display instead of inputs
import { useId } from 'react';

// ─── Design tokens (matches Inter/MSI brand system) ───────────────────────
const C = {
  surface:    '#FFFDF8',
  surface2:   '#FBF6EC',
  ink:        '#23291E',
  inkSoft:    '#5E6553',
  inkFaint:   '#8A8E7C',
  line:       '#E7DCC8',
  lineSoft:   '#F0E7D6',
  navy:       '#144682',
  navySoft:   '#EEF3FB',
  accent:     '#E85A1E',
  accentSoft: '#FEF2EC',
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function toTitleCase(snake) {
  return snake
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isNumericType(dt) {
  return ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision', 'float'].includes(dt);
}

function isBooleanType(dt) {
  return dt === 'boolean';
}

function isDateType(dt) {
  return dt === 'date';
}

function isDateTimeType(dt) {
  return ['timestamp', 'timestamp without time zone', 'timestamp with time zone', 'timestamptz'].includes(dt);
}

function isJsonType(dt) {
  return dt === 'jsonb' || dt === 'json';
}

// ─── Single field renderer ─────────────────────────────────────────────────
function FieldInput({ col, value, onChange }) {
  const baseInp = {
    width: '100%', height: 36, borderRadius: 8,
    border: `1px solid ${C.line}`, background: C.surface,
    padding: '0 10px', fontSize: 13, color: C.ink,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const dt = col.data_type;

  if (isBooleanType(dt)) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.ink }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(col.column_name, e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: C.navy }}
        />
        {value ? 'Ya' : 'Tidak'}
      </label>
    );
  }

  if (isDateTimeType(dt)) {
    return (
      <input
        type="datetime-local"
        value={value || ''}
        onChange={e => onChange(col.column_name, e.target.value)}
        style={baseInp}
      />
    );
  }

  if (isDateType(dt)) {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(col.column_name, e.target.value)}
        style={baseInp}
      />
    );
  }

  if (isNumericType(dt)) {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(col.column_name, e.target.value === '' ? '' : Number(e.target.value))}
        onFocus={e => e.target.select()}
        style={{ ...baseInp, textAlign: 'right' }}
      />
    );
  }

  if (isJsonType(dt)) {
    return (
      <textarea
        value={typeof value === 'object' ? JSON.stringify(value, null, 2) : (value || '')}
        onChange={e => {
          try {
            onChange(col.column_name, JSON.parse(e.target.value));
          } catch {
            onChange(col.column_name, e.target.value);
          }
        }}
        rows={3}
        style={{ ...baseInp, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
      />
    );
  }

  // Default: text
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(col.column_name, e.target.value)}
      style={baseInp}
    />
  );
}

// ─── Read-only display ────────────────────────────────────────────────────
function FieldDisplay({ col, value }) {
  const dt = col.data_type;
  let display = value ?? '—';

  if (isBooleanType(dt)) display = value ? 'Ya' : 'Tidak';
  else if (isJsonType(dt) && typeof value === 'object') display = JSON.stringify(value);
  else if (value === null || value === undefined || value === '') display = '—';

  return (
    <span style={{ fontSize: 13, color: value !== null && value !== undefined && value !== '' ? C.ink : C.inkFaint }}>
      {String(display)}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function CustomFieldsSection({ customFields, values = {}, onChange, readOnly = false }) {
  // Don't render anything if no custom fields exist
  if (!customFields || customFields.length === 0) return null;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px',
          color: C.navy, background: C.navySoft,
          padding: '2px 8px', borderRadius: 99, border: `1px solid ${C.navy}20`,
        }}>
          Additional Fields
        </span>
        <span style={{ fontSize: 11, color: C.inkFaint }}>{customFields.length} custom field</span>
      </div>

      {/* Fields grid */}
      <div style={{ display: 'grid', gridTemplateColumns: customFields.length === 1 ? '1fr' : '1fr 1fr', gap: '12px 18px' }}>
        {customFields.map(col => (
          <div key={col.column_name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
              {toTitleCase(col.column_name)}
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: C.inkFaint, marginLeft: 4 }}>
                ({col.data_type})
              </span>
            </label>
            {readOnly
              ? <FieldDisplay col={col} value={values[col.column_name]} />
              : <FieldInput  col={col} value={values[col.column_name]} onChange={onChange} />
            }
          </div>
        ))}
      </div>
    </div>
  );
}
