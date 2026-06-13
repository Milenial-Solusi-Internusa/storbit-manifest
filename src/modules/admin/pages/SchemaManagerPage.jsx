// src/modules/admin/pages/SchemaManagerPage.jsx
// Super-admin only — add columns to existing tables via manage-schema Edge Function.
// SECURITY: hidden from non-super users in App.jsx routing.
import { useState, useEffect, useCallback } from 'react';
import { Database, AlertTriangle, Plus, RefreshCw, ChevronRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/useAuth';

// ─── Design tokens ────────────────────────────────────────────────────────
const C = {
  surface:    '#FFFDF8',
  surface2:   '#FBF6EC',
  ink:        '#23291E',
  inkSoft:    '#5E6553',
  inkFaint:   '#8A8E7C',
  line:       '#E7DCC8',
  lineSoft:   '#F0E7D6',
  navy:       '#144682',
  navyLight:  '#1a5299',
  accent:     '#E85A1E',
  accentSoft: '#FEF2EC',
  ok:         '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  danger:     '#B23227', dangerBg: '#F6E0DB', dangerBd: '#E6BBB2',
  warn:       '#9A6B0E', warnBg: '#FEF3C7', warnBd: '#F5D87B',
  neutral:    '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
};

// ─── Tables available for schema management ───────────────────────────────
const TABLE_GROUPS = [
  {
    section: 'MASTER DATA',
    tables: ['customers', 'vendors', 'products', 'branches', 'departments', 'positions'],
  },
  {
    section: 'CRM',
    tables: ['accounts', 'inquiries', 'quotations'],
  },
  {
    section: 'ASSETS',
    tables: ['assets'],
  },
];

// System / reserved columns — marked with "system" badge, cannot be removed
const SYSTEM_COLS = new Set([
  'id', 'created_at', 'updated_at', 'deleted_at',
  'created_by', 'updated_by', 'company_id', 'is_active', 'active',
]);

// Postgres type mapping
const TYPE_OPTIONS = [
  { label: 'Text',     value: 'text'        },
  { label: 'Number',   value: 'integer'     },
  { label: 'Decimal',  value: 'numeric'     },
  { label: 'Boolean',  value: 'boolean'     },
  { label: 'Date',     value: 'date'        },
  { label: 'DateTime', value: 'timestamptz' },
  { label: 'JSON',     value: 'jsonb'       },
];

// ─── Helpers ──────────────────────────────────────────────────────────────
function toSnakeCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '');
}

const inpStyle = (extra = {}) => ({
  width: '100%', height: 38, borderRadius: 8,
  border: `1px solid ${C.line}`, background: C.surface,
  padding: '0 11px', fontSize: 13.5, color: C.ink,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color .14s',
  ...extra,
});

// ─── Column list table ────────────────────────────────────────────────────
function ColTable({ columns, loading }) {
  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: C.inkFaint, fontSize: 13 }}>Memuat kolom…</div>;
  }
  if (!columns.length) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: C.inkFaint, fontSize: 13 }}>Pilih tabel untuk melihat kolom</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
            {['#', 'Column Name', 'Data Type', 'Notes'].map(h => (
              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => {
            const isSys = SYSTEM_COLS.has(col.column_name);
            return (
              <tr key={col.column_name} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                <td style={{ padding: '8px 12px', color: C.inkFaint, fontSize: 12 }}>{i + 1}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600, color: C.ink }}>{col.column_name}</td>
                <td style={{ padding: '8px 12px', color: C.inkSoft, fontSize: 12.5 }}>{col.data_type}</td>
                <td style={{ padding: '8px 12px' }}>
                  {isSys && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: C.neutralBg, color: C.neutral, border: `1px solid ${C.neutralBd}`,
                      letterSpacing: '.3px',
                    }}>system</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function SchemaManagerPage({ showToast }) {
  const { erpRole } = useAuth();
  const role = erpRole;

  // Guard — only super_admin
  const isAllowed = role === 'super_admin';

  const [selectedTable, setSelectedTable] = useState('customers');
  const [columns,       setColumns]       = useState([]);
  const [colLoading,    setColLoading]    = useState(false);

  // Form state
  const [fieldLabel,    setFieldLabel]    = useState('');
  const [fieldKey,      setFieldKey]      = useState('');
  const [dataType,      setDataType]      = useState('text');
  const [defaultValue,  setDefaultValue]  = useState('');
  const [submitting,    setSubmitting]    = useState(false);

  // Auto-derive fieldKey from fieldLabel
  useEffect(() => {
    setFieldKey(toSnakeCase(fieldLabel));
  }, [fieldLabel]);

  // Fetch columns whenever selectedTable changes.
  // Uses the get_table_columns RPC directly (same as useCustomFields) — returns
  // rows of { column_name, data_type, ... }. The old information_schema view
  // probe was removed: that view doesn't exist in the DB and always 404'd.
  const fetchColumns = useCallback(async (table) => {
    if (!table) return;
    setColLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_table_columns', { p_table: table });
      if (error) throw error;
      setColumns(data || []);
    } catch (err) {
      showToast?.('Gagal fetch kolom: ' + err.message, 'error');
      setColumns([]);
    } finally {
      setColLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchColumns(selectedTable);
  }, [selectedTable, fetchColumns]);

  // Submit — call Edge Function
  const handleSubmit = async () => {
    if (!fieldKey || !dataType) return;
    if (!isAllowed) { showToast?.('Akses ditolak', 'error'); return; }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session tidak ditemukan — silakan login ulang.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-schema`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apiKey':        import.meta.env.VITE_SUPABASE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action:        'add_column',
          table:         selectedTable,
          column:        fieldKey,
          type:          dataType,
          default_value: defaultValue || undefined,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.message || result?.error || `HTTP ${res.status}`);
      }

      showToast?.(`Kolom "${fieldKey}" berhasil ditambahkan ke tabel ${selectedTable} ✨`);

      // Clear form & refresh
      setFieldLabel('');
      setFieldKey('');
      setDataType('text');
      setDefaultValue('');
      await fetchColumns(selectedTable);
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Access denied ────────────────────────────────────────────────────────
  if (!isAllowed) {
    return (
      <div style={{ fontFamily: 'Inter, sans-serif', padding: '3rem', textAlign: 'center' }}>
        <AlertTriangle size={40} color={C.danger} style={{ marginBottom: 16 }} />
        <h2 style={{ color: C.danger, margin: '0 0 8px' }}>Akses Ditolak</h2>
        <p style={{ color: C.inkSoft }}>Halaman ini hanya bisa diakses oleh Super Admin.</p>
      </div>
    );
  }

  const canSubmit = fieldKey.trim().length > 0 && dataType && !submitting;

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EEF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Database size={20} color={C.navy} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Schema Manager</h1>
          <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>Tambah kolom ke tabel existing — Super Admin only</p>
        </div>
      </div>

      {/* Warning banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        background: C.dangerBg, border: `1px solid ${C.dangerBd}`,
        borderRadius: 10, padding: '14px 18px', marginBottom: 24,
      }}>
        <AlertTriangle size={18} color={C.danger} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: C.danger, fontSize: 13 }}>
            ⚠️ Perubahan schema bersifat permanen dan tidak bisa di-undo.
          </p>
          <p style={{ margin: '4px 0 0', color: C.danger, fontSize: 12.5, opacity: .85 }}>
            Pastikan nama field sudah benar sebelum submit. Salah nama kolom akan tetap tersimpan di database.
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* LEFT — Table sidebar */}
        <div style={{ flex: '0 0 200px', background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(35,41,30,.05)' }}>
          {TABLE_GROUPS.map(group => (
            <div key={group.section}>
              <div style={{
                padding: '8px 14px 4px',
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.7px', color: C.inkFaint,
              }}>
                {group.section}
              </div>
              {group.tables.map(table => {
                const active = selectedTable === table;
                return (
                  <button
                    key={table}
                    onClick={() => setSelectedTable(table)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: active ? '#EEF3FB' : 'transparent',
                      color: active ? C.navy : C.inkSoft,
                      fontWeight: active ? 700 : 400,
                      fontSize: 13,
                      borderLeft: active ? `3px solid ${C.navy}` : '3px solid transparent',
                      transition: 'background .1s',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.surface2; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{table}</span>
                    {active && <ChevronRight size={13} color={C.navy} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* RIGHT — Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Existing columns */}
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(35,41,30,.05)' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: C.navy }}>{selectedTable}</span>
                <span style={{ fontSize: 12, color: C.inkFaint, marginLeft: 10 }}>{columns.length} kolom</span>
              </div>
              <button
                onClick={() => fetchColumns(selectedTable)}
                disabled={colLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: `1px solid ${C.line}`, background: C.surface2, color: C.inkSoft, fontSize: 12, cursor: colLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                <RefreshCw size={12} style={{ animation: colLoading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
              </button>
            </div>
            <ColTable columns={columns} loading={colLoading} />
          </div>

          {/* Add column form */}
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, padding: 22, boxShadow: '0 1px 4px rgba(35,41,30,.05)' }}>
            <p style={{ margin: '0 0 18px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft }}>
              Tambah Kolom Baru ke <span style={{ fontFamily: 'monospace', color: C.navy }}>{selectedTable}</span>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>

              {/* Field Label */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
                  Field Label <span style={{ color: C.danger }}>*</span>
                </label>
                <input
                  value={fieldLabel}
                  onChange={e => setFieldLabel(e.target.value)}
                  placeholder="cth: Nomor Kontrak"
                  style={inpStyle()}
                />
                <span style={{ fontSize: 11, color: C.inkFaint }}>Nama yang ditampilkan di UI</span>
              </div>

              {/* Field Key (auto-generated) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
                  Field Key (column name) <span style={{ color: C.danger }}>*</span>
                </label>
                <input
                  value={fieldKey}
                  onChange={e => setFieldKey(toSnakeCase(e.target.value))}
                  placeholder="auto-generate dari label"
                  style={inpStyle({ fontFamily: 'monospace', background: fieldKey ? C.surface : C.surface2 })}
                />
                <span style={{ fontSize: 11, color: C.inkFaint }}>snake_case — nama kolom di database</span>
              </div>

              {/* Data Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
                  Data Type <span style={{ color: C.danger }}>*</span>
                </label>
                <select
                  value={dataType}
                  onChange={e => setDataType(e.target.value)}
                  style={inpStyle({ padding: '0 10px', cursor: 'pointer' })}
                >
                  {TYPE_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label} ({t.value})</option>
                  ))}
                </select>
              </div>

              {/* Default Value */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: C.inkSoft }}>
                  Default Value <span style={{ color: C.inkFaint, fontWeight: 400, textTransform: 'none' }}>(opsional)</span>
                </label>
                <input
                  value={defaultValue}
                  onChange={e => setDefaultValue(e.target.value)}
                  placeholder="cth: '' atau 0 atau null"
                  style={inpStyle()}
                />
                <span style={{ fontSize: 11, color: C.inkFaint }}>Kosongkan jika tidak ada default</span>
              </div>
            </div>

            {/* Preview */}
            {fieldKey && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#EEF3FB', border: `1px solid ${C.navyLight}20`, fontSize: 12.5, color: C.navy, fontFamily: 'monospace' }}>
                ALTER TABLE <strong>{selectedTable}</strong> ADD COLUMN <strong>{fieldKey}</strong> {dataType}{defaultValue ? ` DEFAULT '${defaultValue}'` : ''};
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.lineSoft}` }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 22px', borderRadius: 9, border: 'none',
                  background: canSubmit ? C.navy : C.neutralBg,
                  color: canSubmit ? '#fff' : C.neutral,
                  fontSize: 13.5, fontWeight: 700,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'background .14s',
                  boxShadow: canSubmit ? '0 2px 8px rgba(20,70,130,.25)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                <Plus size={15} />
                {submitting ? 'Menambahkan…' : '+ Tambah Field'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
