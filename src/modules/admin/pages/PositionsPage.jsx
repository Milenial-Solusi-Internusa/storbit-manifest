// src/modules/admin/pages/PositionsPage.jsx
// Positions master data — paginated list with create / edit / soft-delete.
// Phase 1.0I: CRUD via centered AdminFormModal.

import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, Check, Plus, RefreshCw as Spinner,
} from 'lucide-react';
import {
  usePositions, POSITIONS_PAGE_SIZE, POSITION_LEVELS,
  createPosition, updatePosition, softDeletePosition,
  fetchDepartmentsForPositionForm,
} from '../../../hooks/usePositions';
import { fetchAllCompanies } from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import AdminPageHeader from '../components/AdminPageHeader';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ConfirmModal from '../../../components/ConfirmModal';

// ─────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────

const PASTEL = {
  ink:          '#2D2A28',
  inkSoft:      '#5C5550',
  inkMute:      '#9C948D',
  line:         '#EDE6DC',
  lineSoft:     '#F5EFE5',
  mint:         '#C8EFD9',
  mintDeep:     '#7FC9A0',
  rose:         '#F5C8D5',
  roseDeep:     '#D89AB0',
  lavender:     '#D8C5F0',
  lavenderDeep: '#A98FD8',
  sky:          '#C8E4F5',
  skyDeep:      '#8FBCD8',
  peach:        '#FFD4B8',
  peachDeep:    '#F5A78F',
};

const LEVEL_STYLE = {
  Staff:      { bg: PASTEL.lineSoft,  color: PASTEL.inkMute },
  Supervisor: { bg: PASTEL.sky,       color: PASTEL.skyDeep },
  Manager:    { bg: PASTEL.lavender,  color: PASTEL.lavenderDeep },
  Head:       { bg: PASTEL.peach,     color: '#C4611E' },
  Director:   { bg: '#F0E0FF',        color: '#7B3FA0' },
};

const EMPTY_DRAFT = {
  id: null,
  company_id: '',
  department_id: '',
  code: '',
  name: '',
  level: 'Staff',
  is_active: true,
};

// ─────────────────────────────────────────────────────────────
// Table badge components
// ─────────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={
        active
          ? { background: PASTEL.mint, color: '#1A5C35' }
          : { background: PASTEL.lineSoft, color: PASTEL.inkMute }
      }
    >
      <span className="w-1 h-1 rounded-full" style={{ background: active ? PASTEL.mintDeep : PASTEL.inkMute }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function CompanyBadge({ company }) {
  if (!company) return <span style={{ color: PASTEL.inkMute }}>—</span>;
  return (
    <span
      className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
      style={{ background: PASTEL.sky, color: PASTEL.skyDeep }}
    >
      {company.code}
    </span>
  );
}

function LevelBadge({ level }) {
  const style = LEVEL_STYLE[level] || { bg: PASTEL.lineSoft, color: PASTEL.inkMute };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {level}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Form field primitives
// ─────────────────────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <div className="text-[11px] font-semibold mb-1.5 uppercase tracking-[0.14em]" style={{ color: PASTEL.inkMute }}>
      {children}
      {required && <span style={{ color: PASTEL.roseDeep }}> *</span>}
    </div>
  );
}

function FieldInput({ value, onChange, disabled, placeholder, maxLength }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 placeholder:text-[#B8AEA6]"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    />
  );
}

function FieldSelect({ value, onChange, disabled, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50 cursor-pointer"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    >
      {children}
    </select>
  );
}

function FieldToggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors"
        style={{ background: checked ? PASTEL.mintDeep : PASTEL.line }}
      >
        <span
          className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </span>
      <span className="text-sm font-medium" style={{ color: checked ? '#1A5C35' : PASTEL.inkSoft }}>
        {checked ? 'Active' : 'Inactive'}
      </span>
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-4" style={{ color: PASTEL.lavenderDeep }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-6" style={{ borderTop: `1px solid ${PASTEL.line}` }} />;
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false, onConfirm: null }));
  const search = useDebounce(searchInput, 300);

  const { data, total, loading, error, refresh } = usePositions({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / POSITIONS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * POSITIONS_PAGE_SIZE + 1;
  const to = Math.min(page * POSITIONS_PAGE_SIZE, total);

  const handleSearch = (val) => { setSearchInput(val); setPage(1); };

  // ── Modal state ──
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!draft) return;
    fetchAllCompanies().then(({ data: cos }) => setCompanies(cos || []));
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draft) return;
    fetchDepartmentsForPositionForm(draft.company_id).then(
      ({ data: depts }) => setDepartments(depts || [])
    );
  }, [draft?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = useCallback(() => { setDraft({ ...EMPTY_DRAFT }); setSaveError(null); }, []);

  const openEdit = useCallback((row) => {
    setDraft({
      id:            row.id,
      company_id:    row.company_id || '',
      department_id: row.department_id || '',
      code:          row.code || '',
      name:          row.name || '',
      level:         row.level || 'Staff',
      is_active:     row.is_active !== false,
    });
    setSaveError(null);
  }, []);

  const closeModal = useCallback(() => {
    setDraft(null);
    setSaveError(null);
    setArchiving(false);
    setCompanies([]);
    setDepartments([]);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.company_id) { setSaveError('Company is required.'); return; }
    if (!draft.code.trim()) { setSaveError('Code is required.'); return; }
    if (!draft.name.trim()) { setSaveError('Name is required.'); return; }
    if (!draft.level)       { setSaveError('Level is required.'); return; }

    setSaving(true);
    setSaveError(null);

    const { error: saveErr } = draft.id
      ? await updatePosition(draft.id, draft)
      : await createPosition(draft);

    setSaving(false);
    if (saveErr) { setSaveError(saveErr.message || 'Save failed. Check your permissions.'); return; }

    closeModal();
    refresh();
    showToast(draft.id ? 'Position updated.' : 'Position created.');
  }, [draft, closeModal, refresh, showToast]);

  const handleArchive = useCallback(() => {
    if (!draft?.id) return;
    showConfirm(
      'Archive Position',
      'Archive this position? It will no longer appear in active lists.',
      async () => {
        closeConfirm();
        setArchiving(true);
        setSaveError(null);
        const { error: archErr } = await softDeletePosition(draft.id);
        setArchiving(false);
        if (archErr) { setSaveError(archErr.message || 'Archive failed. Check your permissions.'); return; }
        closeModal();
        refresh();
        showToast('Position archived.');
      }
    );
  }, [draft, closeModal, refresh, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCreate = !draft?.id;

  const modalFooter = (
    <div className="flex items-center gap-3">
      {!isCreate && (
        <button
          type="button"
          onClick={handleArchive}
          disabled={saving || archiving}
          className="px-4 py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ background: 'white', color: PASTEL.roseDeep, border: `1px solid ${PASTEL.roseDeep}55` }}
        >
          {archiving ? 'Archiving…' : 'Archive'}
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={closeModal}
        disabled={saving || archiving}
        className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
        style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || archiving}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
        style={{ background: PASTEL.ink, color: 'white' }}
      >
        {saving
          ? <><Spinner size={13} className="animate-spin" /> Saving…</>
          : <><Check size={13} /> {isCreate ? 'Create Position' : 'Save Changes'}</>}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div>
      <AdminPageHeader
        title="Positions"
        subtitle="Job titles and seniority levels. Levels drive approval matrix thresholds."
        count={loading ? undefined : total}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border text-sm"
          style={{ background: 'white', borderColor: PASTEL.line }}
        >
          <Search size={14} style={{ color: PASTEL.inkMute }} />
          <input
            type="text"
            placeholder="Search by name or code…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#9C948D]"
            style={{ color: PASTEL.ink }}
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: 'white', borderColor: PASTEL.line }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: PASTEL.inkSoft }} />
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: PASTEL.ink, color: 'white' }}
        >
          <Plus size={14} />
          New Position
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{
            gridTemplateColumns: '70px 80px 1fr 100px 1fr 80px 44px',
            borderColor: PASTEL.line,
            background: PASTEL.lineSoft,
            color: PASTEL.inkMute,
          }}
        >
          <div>Company</div>
          <div>Code</div>
          <div>Name</div>
          <div>Level</div>
          <div>Department</div>
          <div className="text-right">Status</div>
          <div />
        </div>

        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState message={search ? 'No positions match your search.' : 'No positions found.'} />
        ) : (
          data.map((row) => (
            <div
              key={row.id}
              className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
              style={{ gridTemplateColumns: '70px 80px 1fr 100px 1fr 80px 44px', borderColor: PASTEL.line }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div><CompanyBadge company={row.companies} /></div>
              <div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}>
                  {row.code}
                </span>
              </div>
              <div className="font-medium" style={{ color: PASTEL.ink }}>{row.name}</div>
              <div><LevelBadge level={row.level} /></div>
              <div style={{ color: PASTEL.inkSoft }}>
                {row.departments ? row.departments.code : <span style={{ color: PASTEL.inkMute }}>—</span>}
              </div>
              <div className="flex justify-end"><StatusBadge active={row.is_active} /></div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                  style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}

        {!error && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${PASTEL.line}` }}>
            <span className="text-xs" style={{ color: PASTEL.inkMute }}>
              {total === 0 ? 'No records' : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: PASTEL.lineSoft }}>
                <ChevronLeft size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: PASTEL.inkSoft }}>{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70" style={{ background: PASTEL.lineSoft }}>
                <ChevronRight size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Centered modal form ── */}
      <AdminFormModal
        open={!!draft}
        eyebrow={isCreate ? 'New Position' : 'Edit Position'}
        title={isCreate ? 'Create Position' : draft?.name || 'Edit Position'}
        subtitle="Define job title, seniority level, and optional department assignment."
        onClose={closeModal}
        footer={modalFooter}
      >
        {draft && (
          <div className="space-y-6">

            {/* ── Identity ── */}
            <div>
              <SectionLabel>Identity</SectionLabel>
              <div className="space-y-4">

                <div>
                  <FieldLabel required>Company</FieldLabel>
                  {isCreate ? (
                    <FieldSelect
                      value={draft.company_id}
                      onChange={(v) => setDraft((d) => ({ ...d, company_id: v, department_id: '' }))}
                      disabled={saving}
                    >
                      <option value="">— Select company —</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                      ))}
                    </FieldSelect>
                  ) : (
                    <div
                      className="rounded-2xl border px-4 py-3 text-sm"
                      style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                    >
                      {companies.find((c) => c.id === draft.company_id)
                        ? `${companies.find((c) => c.id === draft.company_id).code} — ${companies.find((c) => c.id === draft.company_id).name}`
                        : 'Loading…'}
                      <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: PASTEL.inkMute }}>(locked)</span>
                    </div>
                  )}
                </div>

                {/* Code + Name — 2 col */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Code</FieldLabel>
                    <FieldInput
                      value={draft.code}
                      onChange={(v) => setDraft((d) => ({ ...d, code: v }))}
                      disabled={saving}
                      placeholder="e.g. MGR, SPV"
                      maxLength={20}
                    />
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>Saved uppercase. Unique per company.</p>
                  </div>
                  <div>
                    <FieldLabel required>Name</FieldLabel>
                    <FieldInput
                      value={draft.name}
                      onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
                      disabled={saving}
                      placeholder="e.g. Operations Manager"
                      maxLength={100}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* ── Organization ── */}
            <div>
              <SectionLabel>Organization</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Seniority Level</FieldLabel>
                  <FieldSelect
                    value={draft.level}
                    onChange={(v) => setDraft((d) => ({ ...d, level: v }))}
                    disabled={saving}
                  >
                    {POSITION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>{lvl}</option>
                    ))}
                  </FieldSelect>
                  <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>Used for approval thresholds.</p>
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <FieldSelect
                    value={draft.department_id}
                    onChange={(v) => setDraft((d) => ({ ...d, department_id: v }))}
                    disabled={saving || !draft.company_id}
                  >
                    <option value="">— All departments —</option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>{dep.code} — {dep.name}</option>
                    ))}
                  </FieldSelect>
                  <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>Optional. Leave blank if cross-department.</p>
                </div>
              </div>
            </div>

            <Divider />

            {/* ── Status ── */}
            <div>
              <SectionLabel>Status</SectionLabel>
              <FieldToggle
                checked={draft.is_active}
                onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                disabled={saving}
              />
            </div>

            {saveError && (
              <div
                className="rounded-2xl px-4 py-3.5"
                style={{ background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}` }}
              >
                <div className="text-xs font-semibold mb-0.5" style={{ color: PASTEL.ink }}>Save failed</div>
                <div className="text-xs" style={{ color: PASTEL.inkSoft }}>{saveError}</div>
              </div>
            )}
          </div>
        )}
      </AdminFormModal>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 z-[60]"
          style={{
            background: toast.type === 'error' ? PASTEL.rose : PASTEL.mint,
            color: PASTEL.ink,
            border: `1px solid ${toast.type === 'error' ? PASTEL.roseDeep : PASTEL.mintDeep}`,
          }}
        >
          <Check size={14} />
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
