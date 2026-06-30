// src/modules/reporting/MOMListPage.jsx
// MOM list — all MOMs for the user's company. Manager+ see all; sales/staff see
// only their own (created_by = self). Slate/white design (momConstants tokens).
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Eye, Pencil, Download, Trash2, Loader2, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';
import ConfirmModal from '../../components/ConfirmModal';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../lib/auditLogger';
import { C, MOM_TYPES, MOM_STATUS_META, momTypeLabel, fmtDate } from './momConstants';

const SEE_ALL_ROLES = ['super_admin', 'admin', 'ceo', 'gm', 'manager', 'supervisor'];
const PAGE_SIZE = 25;

function StatusBadge({ status }) {
  const m = MOM_STATUS_META[status] || MOM_STATUS_META.draft;
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: m.color + '18', color: m.color, border: `1px solid ${m.color}40` }}>{m.label}</span>;
}

export default function MOMListPage({ onCreateMom, onViewMom, onEditMom, showToast }) {
  const { profile, erpRole, user } = useAuth();
  const seeAll = SEE_ALL_ROLES.includes(erpRole);
  const isSuperAdmin = erpRole === 'super_admin';

  const [rows, setRows] = useState([]);
  const [nameById, setNameById] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [page, setPage] = useState(0);
  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300); return () => clearTimeout(t); }, [searchInput]);

  const fetchMoms = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    let q = supabase.from('meeting_moms')
      .select('id, mom_no, mom_type, divisi, meeting_date, status, notulis_id, created_by, created_at')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false }).limit(1000);
    if (!seeAll) q = q.eq('created_by', profile.id);
    const { data, error } = await q;
    if (error) { showToast?.('Gagal memuat MOM: ' + error.message, 'error'); setRows([]); setLoading(false); return; }
    const list = data || [];
    const ids = [...new Set(list.map(r => r.notulis_id).filter(Boolean))];
    const map = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids).limit(1000);
      (profs || []).forEach(p => { map[p.id] = p.full_name; });
    }
    setNameById(map);
    setRows(list);
    setLoading(false);
  }, [profile?.id, profile?.company_id, seeAll, showToast]);

  useEffect(() => { fetchMoms(); }, [fetchMoms]);
  useEffect(() => { setPage(0); }, [search, statusF, typeF]);

  const handleDelete = useCallback(async () => {
    if (!delTarget) return;
    setDeleting(true);
    const { id, mom_no } = delTarget;
    const { error } = await supabase.from('meeting_moms').delete().eq('id', id);
    setDeleting(false);
    if (error) { showToast?.('Gagal menghapus MOM: ' + error.message, 'error'); return; }
    logAudit(supabase, {
      action: ACTION_TYPES.DELETE_MOM,
      entityType: ENTITY_TYPES.MOM,
      entityId: id,
      entityLabel: mom_no || null,
    }, { id: profile?.id, email: user?.email, role: erpRole, companyId: profile?.company_id });
    setDelTarget(null);
    showToast?.(`MOM ${mom_no || ''} berhasil dihapus`, 'success');
    fetchMoms();
  }, [delTarget, showToast, fetchMoms, profile?.id, profile?.company_id, user?.email, erpRole]);

  const filtered = useMemo(() => rows.filter(r => {
    if (statusF && r.status !== statusF) return false;
    if (typeF && r.mom_type !== typeF) return false;
    if (search) {
      const hay = [r.divisi, nameById[r.notulis_id], r.mom_no].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }), [rows, statusF, typeF, search, nameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const selStyle = { height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', padding: '0 12px', fontSize: 13.5, color: C.text, cursor: 'pointer', outline: 'none' };

  return (
    <div style={{ fontFamily: "'Inter',system-ui,sans-serif", color: C.text }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.navySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BookOpen size={22} style={{ color: C.navy }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 24, fontWeight: 800, color: C.navy, margin: 0, letterSpacing: '-.4px' }}>Minutes of Meeting</h1>
          <p style={{ fontSize: 13.5, color: C.sub, margin: '4px 0 0' }}>Dokumentasi meeting resmi · {loading ? '…' : `${rows.length} MOM`}</p>
        </div>
        <button type="button" onClick={onCreateMom} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: C.orange, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} />Buat MOM
        </button>
      </div>

      {/* filter bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Cari divisi / notulis / no…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', fontSize: 13.5, color: C.text, outline: 'none' }} />
        </div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={selStyle}>
          <option value="">Semua Status</option>
          {Object.entries(MOM_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>
        <select value={typeF} onChange={e => setTypeF(e.target.value)} style={selStyle}>
          <option value="">Semua Jenis</option>
          {MOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted }}>
          {loading ? '' : `Menampilkan ${filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} dari ${filtered.length}`}
        </span>
      </div>

      {/* table */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#F1F5F9', borderBottom: `1px solid ${C.border}` }}>
                {['No', 'MOM No', 'Jenis Meeting', 'Divisi', 'Tanggal', 'Notulis', 'Status', 'Aksi'].map((h, i) => (
                  <th key={h} style={{ textAlign: (i === 0 || i === 7) ? 'center' : 'left', minWidth: i === 0 ? 48 : undefined, padding: '11px 14px', fontSize: 11, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center', color: C.muted }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} /> &nbsp;Memuat MOM…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '48px 14px', textAlign: 'center', color: C.muted }}>{(search || statusF || typeF) ? 'Tidak ada MOM yang cocok.' : 'Belum ada MOM.'}</td></tr>
              ) : pageRows.map((r, i) => {
                const canEdit = r.status === 'draft' || r.status === 'rejected';
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: C.muted, minWidth: 48 }}>{page * PAGE_SIZE + i + 1}</td>
                    <td style={{ padding: '11px 14px', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 12.5, color: C.navy, whiteSpace: 'nowrap' }}>{r.mom_no || '—'}</td>
                    <td style={{ padding: '11px 14px', color: C.sub }}>{momTypeLabel(r.mom_type)}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{r.divisi || '—'}</td>
                    <td style={{ padding: '11px 14px', color: C.sub, whiteSpace: 'nowrap' }}>{fmtDate(r.meeting_date)}</td>
                    <td style={{ padding: '11px 14px', color: C.sub }}>{nameById[r.notulis_id] || '—'}</td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={r.status} /></td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <button type="button" title="Lihat" onClick={() => onViewMom?.(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.navy, padding: 6, display: 'inline-flex' }}><Eye size={16} /></button>
                        <button type="button" title={canEdit ? 'Edit' : 'Hanya draft/rejected bisa diedit'} onClick={() => canEdit && onEditMom?.(r.id)} disabled={!canEdit} style={{ background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'not-allowed', color: canEdit ? C.navy : C.muted, opacity: canEdit ? 1 : 0.4, padding: 6, display: 'inline-flex' }}><Pencil size={16} /></button>
                        <button type="button" title="Download (segera hadir)" onClick={() => showToast?.('Download PDF — segera hadir', 'info')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 6, display: 'inline-flex' }}><Download size={16} /></button>
                        {isSuperAdmin && (
                          <button type="button" title="Hapus" onClick={() => setDelTarget(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'inline-flex' }}><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={pgBtn(page === 0)}>‹ Prev</button>
            <span style={{ fontSize: 12.5, color: C.sub }}>Hal {page + 1} / {totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={pgBtn(page >= totalPages - 1)}>Next ›</button>
          </div>
        )}
      </div>
      <ConfirmModal
        open={!!delTarget}
        title="Hapus MOM"
        message={`Hapus MOM ${delTarget?.mom_no || ''}? Tindakan ini tidak bisa dibatalkan dan akan menghapus semua data terkait (action plan, progress update, issue, improvement).`}
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

function pgBtn(disabled) {
  return { padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: disabled ? '#F1F5F9' : '#fff', color: disabled ? '#94A3B8' : '#475569', fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'default' : 'pointer' };
}
