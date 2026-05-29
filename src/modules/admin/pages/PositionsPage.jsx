// src/modules/admin/pages/PositionsPage.jsx
// Positions master data — paginated list with create / edit / soft-delete.
// Phase 1.0I: new page.

import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, X, Check, Plus,
} from 'lucide-react';
import {
  usePositions, POSITIONS_PAGE_SIZE, POSITION_LEVELS,
  createPosition, updatePosition, softDeletePosition,
  fetchDepartmentsForPositionForm,
} from '../../../hooks/usePositions';
import { fetchAllCompanies } from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import AdminPageHeader from '../components/AdminPageHeader';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

// ─────────────────────────────────────────────────────────────
// Constants
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

// Level badge colour mapping
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
// Small display components
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
// Drawer form primitives
// ─────────────────────────────────────────────────────────────

function FormLabel({ children, required }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-1.5" style={{ color: PASTEL.inkMute }}>
      {children}
      {required && <span style={{ color: PASTEL.roseDeep }}> *</span>}
    </div>
  );
}

function FormInput({ value, onChange, disabled, placeholder, maxLength }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors disabled:opacity-50"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    />
  );
}

function FormSelect({ value, onChange, disabled, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors disabled:opacity-50 cursor-pointer"
      style={{ borderColor: PASTEL.line, background: 'white', color: PASTEL.ink }}
    >
      {children}
    </select>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex items-center gap-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span
        className="w-10 h-5 rounded-full relative flex-shrink-0 transition-colors"
        style={{ background: checked ? PASTEL.mintDeep : PASTEL.line }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </span>
      <span style={{ color: checked ? '#1A5C35' : PASTEL.inkMute }}>
        {checked ? 'Active' : 'Inactive'}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  const { data, total, loading, error, refresh } = usePositions({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / POSITIONS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * POSITIONS_PAGE_SIZE + 1;
  const to = Math.min(page * POSITIONS_PAGE_SIZE, total);

  const handleSearch = (val) => {
    setSearchInput(val);
    setPage(1);
  };

  // ── Drawer state ──
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

  // Load companies on drawer open
  useEffect(() => {
    if (!draft) return;
    fetchAllCompanies().then(({ data: cos }) => setCompanies(cos || []));
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload departments when company changes
  useEffect(() => {
    if (!draft) return;
    fetchDepartmentsForPositionForm(draft.company_id).then(
      ({ data: depts }) => setDepartments(depts || [])
    );
  }, [draft?.company_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = useCallback(() => {
    setDraft({ ...EMPTY_DRAFT });
    setSaveError(null);
  }, []);

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

  const closeDrawer = useCallback(() => {
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

    const fields = {
      company_id:    draft.company_id,
      department_id: draft.department_id,
      code:          draft.code,
      name:          draft.name,
      level:         draft.level,
      is_active:     draft.is_active,
    };

    const { error: saveErr } = draft.id
      ? await updatePosition(draft.id, fields)
      : await createPosition(fields);

    setSaving(false);

    if (saveErr) {
      setSaveError(saveErr.message || 'Save failed. Check your permissions and try again.');
      return;
    }

    closeDrawer();
    refresh();
    showToast(draft.id ? 'Position updated.' : 'Position created.');
  }, [draft, closeDrawer, refresh, showToast]);

  const handleArchive = useCallback(async () => {
    if (!draft?.id) return;
    if (!window.confirm('Archive this position? It will no longer appear in active lists.')) return;

    setArchiving(true);
    setSaveError(null);

    const { error: archErr } = await softDeletePosition(draft.id);
    setArchiving(false);

    if (archErr) {
      setSaveError(archErr.message || 'Archive failed. Check your permissions.');
      return;
    }

    closeDrawer();
    refresh();
    showToast('Position archived.');
  }, [draft, closeDrawer, refresh, showToast]);

  const isCreate = !draft?.id;

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
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'white', borderColor: PASTEL.line }}
      >
        {/* Header */}
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

        {/* Body */}
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
              style={{
                gridTemplateColumns: '70px 80px 1fr 100px 1fr 80px 44px',
                borderColor: PASTEL.line,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div><CompanyBadge company={row.companies} /></div>
              <div>
                <span
                  className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                  style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
                >
                  {row.code}
                </span>
              </div>
              <div className="font-medium" style={{ color: PASTEL.ink }}>{row.name}</div>
              <div><LevelBadge level={row.level} /></div>
              <div className="text-sm" style={{ color: PASTEL.inkSoft }}>
                {row.departments
                  ? <span>{row.departments.code}</span>
                  : <span style={{ color: PASTEL.inkMute }}>—</span>}
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

        {/* Pagination */}
        {!error && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: `1px solid ${PASTEL.line}` }}
          >
            <span className="text-xs" style={{ color: PASTEL.inkMute }}>
              {total === 0
                ? 'No records'
                : `Showing ${from}–${to} of ${total.toLocaleString('id-ID')}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ background: PASTEL.lineSoft }}
              >
                <ChevronLeft size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
              <span className="px-3 text-xs font-medium" style={{ color: PASTEL.inkSoft }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1.5 rounded-lg transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ background: PASTEL.lineSoft }}
              >
                <ChevronRight size={14} style={{ color: PASTEL.inkSoft }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────
          Drawer
      ───────────────────────────────────────────────────── */}
      {draft && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(45,42,40,0.22)' }}
            onClick={closeDrawer}
          />
          <div
            className="fixed right-0 top-0 bottom-0 z-50 w-full flex flex-col"
            style={{
              maxWidth: 440,
              background: 'white',
              borderLeft: `1px solid ${PASTEL.line}`,
              boxShadow: '-6px 0 32px rgba(45,42,40,0.10)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-start justify-between gap-3 px-5 py-4 border-b flex-shrink-0"
              style={{ borderColor: PASTEL.line }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.20em] font-semibold mb-1" style={{ color: PASTEL.inkMute }}>
                  {isCreate ? 'New Position' : 'Edit Position'}
                </div>
                <div className="font-display text-lg font-semibold" style={{ color: PASTEL.ink }}>
                  {isCreate ? 'Create a position' : draft.name || '(unnamed)'}
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="flex-shrink-0 p-2 rounded-xl transition-opacity hover:opacity-70"
                style={{ background: PASTEL.lineSoft }}
              >
                <X size={15} style={{ color: PASTEL.inkSoft }} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: PASTEL.lavenderDeep }}>
                  Identity
                </div>
                <div className="space-y-3">

                  <div>
                    <FormLabel required>Company</FormLabel>
                    <FormSelect
                      value={draft.company_id}
                      onChange={(v) => setDraft((d) => ({ ...d, company_id: v, department_id: '' }))}
                      disabled={saving || !isCreate}
                    >
                      <option value="">— Select company —</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                      ))}
                    </FormSelect>
                    {!isCreate && (
                      <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                        Company cannot be changed after creation.
                      </p>
                    )}
                  </div>

                  <div>
                    <FormLabel required>Code</FormLabel>
                    <FormInput
                      value={draft.code}
                      onChange={(v) => setDraft((d) => ({ ...d, code: v }))}
                      disabled={saving}
                      placeholder="e.g. MGR, SPV, DIR"
                      maxLength={20}
                    />
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Short identifier, unique per company. Saved as uppercase.
                    </p>
                  </div>

                  <div>
                    <FormLabel required>Name</FormLabel>
                    <FormInput
                      value={draft.name}
                      onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
                      disabled={saving}
                      placeholder="e.g. Operations Manager"
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <FormLabel required>Seniority Level</FormLabel>
                    <FormSelect
                      value={draft.level}
                      onChange={(v) => setDraft((d) => ({ ...d, level: v }))}
                      disabled={saving}
                    >
                      {POSITION_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>{lvl}</option>
                      ))}
                    </FormSelect>
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Used for approval matrix thresholds.
                    </p>
                  </div>

                  <div>
                    <FormLabel>Department</FormLabel>
                    <FormSelect
                      value={draft.department_id}
                      onChange={(v) => setDraft((d) => ({ ...d, department_id: v }))}
                      disabled={saving || !draft.company_id}
                    >
                      <option value="">— All departments —</option>
                      {departments.map((dep) => (
                        <option key={dep.id} value={dep.id}>{dep.code} — {dep.name}</option>
                      ))}
                    </FormSelect>
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Optional. Leave blank if this position spans multiple departments.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${PASTEL.line}` }} />

              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: PASTEL.lavenderDeep }}>
                  Status
                </div>
                <FormLabel>Active</FormLabel>
                <Toggle
                  checked={draft.is_active}
                  onChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                  disabled={saving}
                />
              </div>

              {saveError && (
                <div
                  className="rounded-xl p-3.5"
                  style={{ background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}` }}
                >
                  <div className="text-xs font-semibold mb-0.5" style={{ color: PASTEL.ink }}>Save failed</div>
                  <div className="text-xs" style={{ color: PASTEL.inkSoft }}>{saveError}</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center gap-2 px-5 py-4 border-t flex-shrink-0"
              style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft }}
            >
              {!isCreate && (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={saving || archiving}
                  className="px-3 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40 mr-auto"
                  style={{ background: 'white', color: PASTEL.roseDeep, border: `1px solid ${PASTEL.roseDeep}44` }}
                >
                  {archiving ? 'Archiving…' : 'Archive'}
                </button>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                disabled={saving || archiving}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || archiving}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
                style={{ background: PASTEL.ink, color: 'white' }}
              >
                {saving ? (
                  <><RefreshCw size={13} className="animate-spin" /> Saving…</>
                ) : (
                  <><Check size={13} /> {isCreate ? 'Create' : 'Save changes'}</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

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
          {toast.type === 'error' ? <X size={14} /> : <Check size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
