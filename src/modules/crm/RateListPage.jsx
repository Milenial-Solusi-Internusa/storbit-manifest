// src/modules/crm/RateListPage.jsx
// Rate Sheet (rate_sheets) — list + dynamic table editor + PDF download.
// Each sheet has free-form columns (jsonb string[]) and rows (jsonb string[][]).
// A sheet whose valid_until has passed is EXPIRED → read-only (RLS also blocks the
// update server-side). RLS scopes visibility (sales see own; manager+ see all) —
// the FE does NOT add a created_by filter.
import { useState, useEffect, useCallback } from 'react';
import { pdf } from '@react-pdf/renderer';
import { Search, Plus, Pencil, Eye, Trash2, Download, X, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ConfirmModal from '../../components/ConfirmModal';
import RateSheetPDF from './RateSheetPDF';

const C = {
  bg:        '#F6EFE3',
  surface:   '#FFFDF8',
  surface2:  '#FBF6EC',
  ink:       '#23291E',
  inkSoft:   '#5E6553',
  inkFaint:  '#8A8E7C',
  line:      '#E7DCC8',
  lineSoft:  '#F0E7D6',
  accent:    '#E85A1E',
  accentSoft:'#FEF2EC',
  navy:      '#144682',
  navySoft:  '#EAF0F8',
  ok:        '#2E7D4F', okBg: '#E4F0E5', okBd: '#BFDDC4',
  neutral:   '#6B6F5E', neutralBg: '#EEE9DC', neutralBd: '#DDD3BE',
  danger:    '#B23227',
};

const DEFAULT_COLUMNS = ['POL', 'POD', 'O/F', 'CFS', 'OTHERS', 'REMARKS'];

const INP = {
  height: 40, borderRadius: 9, border: `1px solid ${C.line}`,
  background: C.surface, padding: '0 12px', fontSize: 13.5, color: C.ink,
  outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
};

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isExpired(validUntil) {
  return !!validUntil && validUntil < todayYMD();
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ expired }) {
  const m = expired
    ? { label: 'Expired', bg: C.neutralBg, color: C.neutral, bd: C.neutralBd }
    : { label: 'Aktif',   bg: C.okBg,      color: C.ok,      bd: C.okBd };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, letterSpacing: '.3px', border: `1px solid ${m.bd}`, background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

// ─── Dynamic table editor ────────────────────────────────────────────────────
function RateEditor({ initial, onBack, onSaved, showToast }) {
  const { profile } = useAuth();
  const sheetId = initial?.id || null;
  const expired = isExpired(initial?.valid_until);
  const readOnly = expired;

  const [rateName,   setRateName]   = useState(initial?.rate_name || '');
  const [validUntil, setValidUntil] = useState(initial?.valid_until || '');
  const [note,       setNote]       = useState(initial?.note || '');
  const [columns,    setColumns]    = useState(
    Array.isArray(initial?.columns) && initial.columns.length ? initial.columns : DEFAULT_COLUMNS
  );
  const [rows,       setRows]       = useState(
    Array.isArray(initial?.rows) && initial.rows.length
      ? initial.rows
      : [Array((Array.isArray(initial?.columns) && initial.columns.length ? initial.columns : DEFAULT_COLUMNS).length).fill('')]
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // ── Column ops ──
  const addColumn = () => {
    setColumns(c => [...c, `Kolom ${c.length + 1}`]);
    setRows(rs => rs.map(r => [...r, '']));
  };
  const removeColumn = (ci) => {
    if (columns.length <= 1) { showToast?.('Minimal 1 kolom', 'error'); return; }
    setColumns(c => c.filter((_, i) => i !== ci));
    setRows(rs => rs.map(r => r.filter((_, i) => i !== ci)));
  };
  const renameColumn = (ci, val) => setColumns(c => c.map((h, i) => i === ci ? val : h));

  // ── Row ops ──
  const addRow = () => setRows(rs => [...rs, Array(columns.length).fill('')]);
  const removeRow = (ri) => {
    if (rows.length <= 1) { showToast?.('Minimal 1 baris', 'error'); return; }
    setRows(rs => rs.filter((_, i) => i !== ri));
  };
  const setCell = (ri, ci, val) => setRows(rs => rs.map((r, i) => i === ri ? r.map((c, j) => j === ci ? val : c) : r));

  const handleSave = async () => {
    const e = {};
    if (!rateName.trim()) e.rateName = 'Wajib diisi';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!profile?.company_id) { showToast?.('Company tidak ditemukan untuk user ini', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        rate_name:   rateName.trim(),
        valid_until: validUntil || null,
        columns,
        rows,
        note:        note || null,
      };
      let error;
      if (sheetId) {
        ({ error } = await supabase.from('rate_sheets').update(payload).eq('id', sheetId));
      } else {
        payload.company_id = profile.company_id;
        payload.created_by = profile.id;
        ({ error } = await supabase.from('rate_sheets').insert(payload));
      }
      if (error) throw error;
      showToast?.(sheetId ? 'Rate sheet berhasil diupdate' : 'Rate sheet berhasil dibuat', 'success');
      onSaved?.();
    } catch (err) {
      showToast?.('Gagal menyimpan rate sheet: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cellInp = (extra = {}) => ({
    width: '100%', minWidth: 120, height: 34, borderRadius: 7, border: `1px solid ${C.line}`,
    background: readOnly ? C.surface2 : '#fff', padding: '0 8px', fontSize: 12.5, color: C.ink,
    outline: 'none', fontFamily: "'IBM Plex Mono', monospace", boxSizing: 'border-box', ...extra,
  });

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: C.inkSoft, cursor: 'pointer' }}>
            <ArrowLeft size={15} /> Kembali
          </button>
          <h1 style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", fontSize: 20, fontWeight: 800, color: C.navy }}>
            {readOnly ? 'Lihat Rate Sheet' : (sheetId ? 'Edit Rate Sheet' : 'Buat Rate Sheet')}
          </h1>
        </div>
        {!readOnly && (
          <button onClick={handleSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: C.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Menyimpan…' : (sheetId ? 'Simpan Perubahan' : 'Simpan Rate')}
          </button>
        )}
      </div>

      {readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.neutralBg, border: `1px solid ${C.neutralBd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 13, color: C.neutral, fontWeight: 600 }}>
          Rate ini sudah kedaluwarsa, buat rate baru untuk update.
        </div>
      )}

      {/* Meta fields */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px 16px' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Nama Rate <span style={{ color: C.accent }}>*</span></div>
            <input value={rateName} onChange={e => setRateName(e.target.value)} disabled={readOnly} placeholder="cth: LCL Console Import — Juni 2026" style={{ ...INP, borderColor: errors.rateName ? C.danger : C.line, background: readOnly ? C.surface2 : C.surface }} />
            {errors.rateName && <span style={{ fontSize: 11.5, color: C.danger, marginTop: 3, display: 'block' }}>{errors.rateName}</span>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Berlaku Sampai</div>
            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} disabled={readOnly} style={{ ...INP, background: readOnly ? C.surface2 : C.surface }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Note</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} disabled={readOnly} rows={2} placeholder="Catatan / disclaimer rate…" style={{ ...INP, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5, background: readOnly ? C.surface2 : C.surface }} />
          </div>
        </div>
      </div>

      {/* Dynamic table editor */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.line}`, background: C.surface2, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '.5px' }}>Tabel Rate</span>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addColumn} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.navySoft, color: C.navy, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Plus size={14} /> Kolom</button>
              <button onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.accentSoft, color: C.accent, border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}><Plus size={14} /> Baris</button>
            </div>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: C.surface2 }}>
                {!readOnly && <th style={{ width: 34, borderBottom: `1px solid ${C.line}` }} />}
                {columns.map((h, ci) => (
                  <th key={ci} style={{ padding: '8px 8px', borderBottom: `2px solid ${C.navy}`, textAlign: 'left', minWidth: 130 }}>
                    {readOnly ? (
                      <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11.5, color: C.navy }}>{h}</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input value={h} onChange={e => renameColumn(ci, e.target.value)} placeholder="Header…" style={{ ...cellInp(), fontFamily: "'Montserrat', sans-serif", fontWeight: 700, color: C.navy, minWidth: 100 }} />
                        <button onClick={() => removeColumn(ci)} title="Hapus kolom" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 2, display: 'inline-flex', flexShrink: 0 }}><X size={14} /></button>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 ? C.surface2 : '#fff' }}>
                  {!readOnly && (
                    <td style={{ padding: '6px 4px', textAlign: 'center', borderBottom: `1px solid ${C.lineSoft}` }}>
                      <button onClick={() => removeRow(ri)} title="Hapus baris" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 4, display: 'inline-flex' }}><Trash2 size={14} /></button>
                    </td>
                  )}
                  {columns.map((_, ci) => (
                    <td key={ci} style={{ padding: '5px 6px', borderBottom: `1px solid ${C.lineSoft}` }}>
                      <input value={row[ci] ?? ''} onChange={e => setCell(ri, ci, e.target.value)} readOnly={readOnly} placeholder={readOnly ? '' : 'cth: USD 15/CBM (MIN 2) / FREE'} style={cellInp()} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── List page ───────────────────────────────────────────────────────────────
export default function RateListPage({ showToast }) {
  const { profile } = useAuth();
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('list');     // 'list' | 'editor'
  const [editing, setEditing] = useState(null);  // sheet row being edited/viewed
  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState(null);

  const fetchSheets = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    // RLS scopes rows (own created_by for sales; all for manager+). No FE filter.
    const { data, error } = await supabase
      .from('rate_sheets')
      .select(`
        id, rate_name, valid_until, columns, rows, note, created_at, company_id, created_by,
        company:companies!rate_sheets_company_id_fkey(name, code)
      `)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) { showToast?.('Gagal memuat rate sheet: ' + error.message, 'error'); setSheets([]); setLoading(false); return; }
    setSheets(data || []);
    setLoading(false);
  }, [profile?.id, showToast]);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  const filtered = sheets.filter(s => {
    if (!search.trim()) return true;
    return (s.rate_name || '').toLowerCase().includes(search.trim().toLowerCase());
  });

  const handleDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('rate_sheets').delete().eq('id', delTarget.id);
    setDeleting(false);
    if (error) { showToast?.('Gagal menghapus rate sheet: ' + error.message, 'error'); return; }
    setDelTarget(null);
    showToast?.('Rate sheet berhasil dihapus', 'success');
    fetchSheets();
  };

  const handleDownload = async (sheet) => {
    setPdfBusyId(sheet.id);
    try {
      // Creator profile lives behind an auth.users FK (not embeddable) → fetch here.
      const { data: creator } = await supabase
        .from('profiles')
        .select('full_name, phone, email, positions(name)')
        .eq('id', sheet.created_by)
        .maybeSingle();
      const blob = await pdf(
        <RateSheetPDF sheet={sheet} company={sheet.company || null} creator={creator || null} />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RateList-${(sheet.rate_name || 'rate').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast?.('Gagal membuat PDF: ' + err.message, 'error');
    } finally {
      setPdfBusyId(null);
    }
  };

  if (mode === 'editor') {
    return (
      <RateEditor
        initial={editing}
        onBack={() => { setMode('list'); setEditing(null); }}
        onSaved={() => { setMode('list'); setEditing(null); fetchSheets(); }}
        showToast={showToast}
      />
    );
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: C.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Download size={20} color={C.accent} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Rate List</h1>
            <p style={{ margin: 0, fontSize: 13, color: C.inkSoft }}>{loading ? '…' : `${sheets.length} rate sheet`}</p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setMode('editor'); }} style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(232,90,30,.25)' }}>
          <Plus size={16} /> Buat Rate Baru
        </button>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.inkFaint }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama rate…" style={{ width: '100%', height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, paddingLeft: 32, paddingRight: 10, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(35,41,30,.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
                {['Nama Rate', 'Berlaku Sampai', 'Status', 'Dibuat', 'Baris', 'Aksi'].map((h, i) => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: (i === 4 || i === 5) ? 'center' : 'left', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: C.inkSoft, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>Memuat data…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: C.inkFaint }}>{search ? 'Tidak ada rate yang cocok.' : 'Belum ada rate sheet.'}</td></tr>
              ) : filtered.map((s, i) => {
                const expired = isExpired(s.valid_until);
                const rowCount = Array.isArray(s.rows) ? s.rows.length : 0;
                const busy = pdfBusyId === s.id;
                return (
                  <tr key={s.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.lineSoft}` : 'none' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: C.navy }}>{s.rate_name || '—'}</td>
                    <td style={{ padding: '12px 14px', color: expired ? C.neutral : C.inkSoft, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>{s.valid_until ? fmtDate(s.valid_until) : '—'}</td>
                    <td style={{ padding: '12px 14px' }}><StatusBadge expired={expired} /></td>
                    <td style={{ padding: '12px 14px', color: C.inkFaint, fontSize: 12.5 }}>{fmtDate(s.created_at)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: C.inkSoft, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>{rowCount}</td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <button type="button" title={expired ? 'Lihat (read-only)' : 'Edit'} onClick={() => { setEditing(s); setMode('editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, padding: 6, display: 'inline-flex' }}>
                          {expired ? <Eye size={16} /> : <Pencil size={16} />}
                        </button>
                        <button type="button" title="Download PDF" onClick={() => handleDownload(s)} disabled={busy} style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', color: C.accent, padding: 6, display: 'inline-flex', opacity: busy ? 0.5 : 1 }}>
                          {busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />}
                        </button>
                        <button type="button" title="Hapus" onClick={() => setDelTarget(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.danger, padding: 6, display: 'inline-flex' }}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!delTarget}
        title="Hapus Rate Sheet"
        message={`Hapus rate "${delTarget?.rate_name || ''}"? Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel={deleting ? 'Menghapus…' : 'Hapus'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setDelTarget(null); }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
