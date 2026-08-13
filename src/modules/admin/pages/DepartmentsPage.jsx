// src/modules/admin/pages/DepartmentsPage.jsx
// Departments master data — paginated list with create / edit / soft-delete.
// Phase 1.0I: CRUD via centered AdminFormModal.
//
// Migrated to the official admin-settings kit/tokens (2026-08-13) — same
// migration as BranchesPage.jsx (this page is a structural clone of it).
// AdminFormModal itself (shared by 6 other pages) is NOT touched — only the
// content rendered inside it. Fetch/save/CRUD logic unchanged.

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, RefreshCw as Spinner } from 'lucide-react';
import {
  useDepartments, DEPARTMENTS_PAGE_SIZE,
  createDepartment, updateDepartment, softDeleteDepartment,
  fetchParentDepartmentsForCompany,
} from '../../../hooks/useDepartments';
import { fetchAllCompanies } from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  Icon, PageHeader, KitStyles, FloatingInput, FloatingSelect, Toggle,
  PrimaryBtn, OutlineBtn, SectionLabel,
} from '../../../pages/foundation/admin-settings/kit';
import {
  NAVY, CREAM, SURFACE, LINE, ROW_HOVER, INK, INK_SOFT, MUTED, DANGER, GREEN,
  FONT_HEAD, FONT_BODY, FONT_MONO,
} from '../../../pages/foundation/admin-settings/tokens';

const EMPTY_DRAFT = {
  id: null,
  company_id: '',
  code: '',
  name: '',
  parent_id: '',
  is_active: true,
};

// ─────────────────────────────────────────────────────────────
// Table badges
// ─────────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wide"
      style={{
        fontFamily: FONT_HEAD, fontWeight: 700,
        background: active ? `${GREEN}1A` : CREAM,
        color: active ? GREEN : MUTED,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: active ? GREEN : MUTED }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function CompanyBadge({ company }) {
  if (!company) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ fontFamily: FONT_MONO, background: `${NAVY}1A`, color: NAVY }}
    >
      {company.code}
    </span>
  );
}

function CodeBadge({ children }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ fontFamily: FONT_MONO, background: `${NAVY}1A`, color: NAVY }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Local helper (Divider — no kit equivalent)
// ─────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ borderTop: '1px solid ' + LINE, margin: '24px 0' }} />;
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function DepartmentsPage({ onHome }) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false, onConfirm: null }));
  const search = useDebounce(searchInput, 300);

  const { data, total, loading, error, refresh } = useDepartments({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / DEPARTMENTS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * DEPARTMENTS_PAGE_SIZE + 1;
  const to = Math.min(page * DEPARTMENTS_PAGE_SIZE, total);

  const handleSearch = (val) => { setSearchInput(val); setPage(1); };

  // ── Modal state ──
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [parentDepts, setParentDepts] = useState([]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load companies on modal open
  useEffect(() => {
    if (!draft) return;
    fetchAllCompanies().then(({ data: cos }) => setCompanies(cos || []));
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload parent departments when company changes
  useEffect(() => {
    if (!draft) return;
    fetchParentDepartmentsForCompany(draft.company_id, draft.id).then(
      ({ data: depts }) => setParentDepts(depts || [])
    );
  }, [draft?.company_id, draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = useCallback(() => { setDraft({ ...EMPTY_DRAFT }); setSaveError(null); }, []);

  const openEdit = useCallback((row) => {
    setDraft({
      id:         row.id,
      company_id: row.company_id || '',
      code:       row.code || '',
      name:       row.name || '',
      parent_id:  row.parent_id || '',
      is_active:  row.is_active !== false,
    });
    setSaveError(null);
  }, []);

  const closeModal = useCallback(() => {
    setDraft(null);
    setSaveError(null);
    setArchiving(false);
    setCompanies([]);
    setParentDepts([]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.company_id) { setSaveError('Company is required.'); return; }
    if (!draft.code.trim()) { setSaveError('Code is required.'); return; }
    if (!draft.name.trim()) { setSaveError('Name is required.'); return; }

    setSaving(true);
    setSaveError(null);

    const { error: saveErr } = draft.id
      ? await updateDepartment(draft.id, draft)
      : await createDepartment(draft);

    setSaving(false);
    if (saveErr) { setSaveError(saveErr.message || 'Save failed. Check your permissions.'); return; }

    closeModal();
    refresh();
    showToast(draft.id ? 'Department updated.' : 'Department created.');
  }, [draft, closeModal, refresh, showToast]);

  const handleArchive = useCallback(() => {
    if (!draft?.id) return;
    showConfirm(
      'Archive Department',
      'Archive this department? It will no longer appear in active lists.',
      async () => {
        closeConfirm();
        setArchiving(true);
        setSaveError(null);
        const { error: archErr } = await softDeleteDepartment(draft.id);
        setArchiving(false);
        if (archErr) { setSaveError(archErr.message || 'Archive failed. Check your permissions.'); return; }
        closeModal();
        refresh();
        showToast('Department archived.');
      }
    );
  }, [draft, closeModal, refresh, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCreate = !draft?.id;
  const lockFields = saving; // matches pre-migration behavior: only `saving` disables fields, not `archiving`

  // ── Modal footer ── Cancel/Archive use OutlineBtn, which has no `disabled`
  // prop in the kit — the guard lives in the onClick handler instead so the
  // no-double-submit-while-saving behavior is preserved even though the
  // button won't visually dim during that window.
  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
      {!isCreate && (
        <OutlineBtn danger icon="trash" onClick={() => { if (!saving && !archiving) handleArchive(); }}>
          {archiving ? 'Archiving…' : 'Archive'}
        </OutlineBtn>
      )}
      <div style={{ flex: 1 }} />
      <OutlineBtn onClick={() => { if (!saving && !archiving) closeModal(); }}>Cancel</OutlineBtn>
      <PrimaryBtn disabled={saving || archiving} onClick={handleSave}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {saving ? <Spinner size={15} className="animate-spin" /> : <Icon name="check" size={16} />}
          {saving ? 'Saving…' : (isCreate ? 'Create Department' : 'Save Changes')}
        </span>
      </PrimaryBtn>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: FONT_BODY, color: INK }}>
      <KitStyles />
      <PageHeader
        crumbs={[{ label: 'Foundation' }, { label: 'Master Data & Admin Settings', onClick: onHome }, { label: 'Departments' }]}
        title="Departments"
        subtitle="Organizational units. Department codes appear in document numbers."
        onBack={onHome}
        right={!loading && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 14px', borderRadius: 20, background: `${NAVY}1A`, color: NAVY, fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 700 }}>
            {total.toLocaleString('id-ID')}
          </span>
        )}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm transition-shadow"
          style={{ background: SURFACE, borderColor: searchFocus ? NAVY : LINE, boxShadow: searchFocus ? `0 0 0 3px ${NAVY}29` : 'none' }}
        >
          <Search size={14} style={{ color: MUTED }} />
          <input
            type="text"
            placeholder="Search by name or code…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: INK }}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: SURFACE, borderColor: LINE }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: INK_SOFT }} />
        </button>
        <PrimaryBtn icon="plus" onClick={openCreate}>New Department</PrimaryBtn>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: SURFACE, borderColor: LINE }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{
            gridTemplateColumns: '70px 80px 1fr 80px 44px',
            borderColor: LINE,
            background: CREAM,
            color: MUTED,
          }}
        >
          <div>Company</div>
          <div>Code</div>
          <div>Name</div>
          <div className="text-right">Status</div>
          <div />
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState message={search ? 'No departments match your search.' : 'No departments found.'} />
        ) : (
          data.map((row, i) => {
            const zebra = i % 2 === 1 ? `${CREAM}80` : SURFACE;
            return (
              <div
                key={row.id}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: '70px 80px 1fr 80px 44px', borderColor: LINE, background: zebra }}
                onMouseEnter={(e) => (e.currentTarget.style.background = ROW_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.background = zebra)}
              >
                <div><CompanyBadge company={row.companies} /></div>
                <div><CodeBadge>{row.code}</CodeBadge></div>
                <div className="font-medium" style={{ color: INK }}>{row.name}</div>
                <div className="flex justify-end"><StatusBadge active={row.is_active} /></div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ background: CREAM, color: INK_SOFT }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })
        )}

        {!error && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
            <span className="text-xs" style={{ color: MUTED }}>
              {total === 0 ? 'No records' : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: CREAM }}>
                <ChevronLeft size={14} style={{ color: INK_SOFT }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: INK_SOFT }}>{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: CREAM }}>
                <ChevronRight size={14} style={{ color: INK_SOFT }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Centered modal form (container = AdminFormModal, untouched) ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'New Department' : 'Edit Department'}
        title={isCreate ? 'Create Department' : draft?.name || 'Edit Department'}
        subtitle="Fill in department identity and organizational hierarchy."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div>
            {/* ── Identity ── */}
            <SectionLabel style={{ marginBottom: 16 }}>Identity</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {isCreate ? (
                <div style={{ flex: '1 1 100%', opacity: lockFields ? 0.55 : 1, pointerEvents: lockFields ? 'none' : 'auto', transition: 'opacity .2s' }}>
                  <FloatingSelect full label="Company *"
                    value={draft.company_id}
                    onChange={(v) => setDraft((d) => ({ ...d, company_id: v, parent_id: '' }))}
                    options={[{ value: '', label: '— Select company —' }, ...companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))]}
                  />
                </div>
              ) : (
                <div style={{ flex: '1 1 100%' }}>
                  <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, color: NAVY, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Company</div>
                  <div style={{ borderRadius: 11, border: '1px solid ' + LINE, background: CREAM, padding: '16px 14px', fontFamily: FONT_BODY, fontSize: 14, color: INK_SOFT }}>
                    {companies.find((c) => c.id === draft.company_id)
                      ? `${companies.find((c) => c.id === draft.company_id).code} — ${companies.find((c) => c.id === draft.company_id).name}`
                      : 'Loading…'}
                    <span style={{ marginLeft: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED }}>(locked)</span>
                  </div>
                </div>
              )}

              <FloatingInput half label="Code *" value={draft.code}
                onChange={(v) => setDraft((d) => ({ ...d, code: v.slice(0, 20) }))}
                disabled={saving} placeholder="e.g. SLS, FIN, IT" hint="Appears in document numbers. Saved uppercase." />
              <FloatingInput half label="Name *" value={draft.name}
                onChange={(v) => setDraft((d) => ({ ...d, name: v.slice(0, 100) }))}
                disabled={saving} placeholder="e.g. Sales, Finance" />
            </div>

            <Divider />

            {/* ── Organization ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Organization</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '1 1 100%', opacity: (lockFields || !draft.company_id) ? 0.55 : 1, pointerEvents: (lockFields || !draft.company_id) ? 'none' : 'auto', transition: 'opacity .2s' }}>
                <FloatingSelect full label="Parent Department"
                  value={draft.parent_id}
                  onChange={(v) => setDraft((d) => ({ ...d, parent_id: v }))}
                  options={[{ value: '', label: '— None (top-level) —' }, ...parentDepts.map((dep) => ({ value: dep.id, label: `${dep.code} — ${dep.name}` }))]}
                />
              </div>
            </div>
            <p style={{ fontFamily: FONT_BODY, fontSize: 10.5, color: MUTED, marginTop: 8 }}>
              Optional. Leave blank for top-level departments.
            </p>

            <Divider />

            {/* ── Status ── */}
            <SectionLabel style={{ marginBottom: 14 }}>Status</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Toggle on={draft.is_active} onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} disabled={saving} />
              <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: draft.is_active ? GREEN : INK_SOFT }}>
                {draft.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {saveError && (
              <div style={{ marginTop: 24, borderRadius: 14, padding: '14px 16px', background: `${DANGER}0F`, border: `1px solid ${DANGER}40` }}>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 2 }}>Save failed</div>
                <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: INK_SOFT }}>{saveError}</div>
              </div>
            )}
          </div>
        )}
      </AdminFormModal>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', right: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 10,
          background: INK, color: '#fff', padding: '13px 18px', borderRadius: 12,
          fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 14px 34px rgba(10,20,40,.3)', zIndex: 200,
        }}>
          <Icon name={toast.type === 'error' ? 'alert' : 'checkcircle'} size={18} color={toast.type === 'error' ? '#FF9B9B' : '#7FD6A0'} />
          {toast.msg}
        </div>
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Ya, Archive"
        cancelLabel="Batal"
        variant="warning"
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
