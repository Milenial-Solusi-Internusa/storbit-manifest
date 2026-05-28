// src/modules/admin/pages/UserAccessPage.jsx
// User Access Management — view and update existing user profiles and ERP role
// assignments. Auth user creation is NOT supported here; use Supabase Dashboard.
//
// Accessible only to super admin users (enforced at AdminShell / App.jsx level).
//
// Table: Full Name, Company, Legacy Role, ERP Role, Active, MFA, Edit button.
// Edit drawer: company, branch, department, position, legacy role, active,
//              mfa_required, ERP role.
//
// When company changes in the drawer, branch/dept/position/erp-role dropdowns
// are cleared and refetched for the new company.

import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, X, Check,
} from 'lucide-react';
import {
  useUserAccess,
  fetchAllCompanies,
  fetchBranchesForCompany,
  fetchDepartmentsForCompany,
  fetchPositionsForCompany,
  fetchRolesForCompany,
  saveUserAccess,
  USER_ACCESS_PAGE_SIZE,
} from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../contexts/useAuth';
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
  cream:        '#FAF6F0',
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
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
};

const LEGACY_ROLES = [
  { value: 'super',       label: 'Super Admin' },
  { value: 'logistic',    label: 'Admin Logistic' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'finance',     label: 'Finance' },
  { value: 'management',  label: 'Management' },
];

const LEGACY_ROLE_COLOR = {
  super:       PASTEL.peachDeep,
  logistic:    PASTEL.skyDeep,
  procurement: PASTEL.lavenderDeep,
  finance:     PASTEL.mintDeep,
  management:  PASTEL.butterDeep,
};

// Table column template — 7 columns
const GRID = '1fr 88px 116px 152px 64px 52px 44px';

// ─────────────────────────────────────────────────────────────
// Small display components
// ─────────────────────────────────────────────────────────────

function LegacyRoleBadge({ role }) {
  const color = LEGACY_ROLE_COLOR[role] || PASTEL.inkMute;
  const label = LEGACY_ROLES.find((r) => r.value === role)?.label || role;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

function ActiveBadge({ active }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
      style={
        active
          ? { background: PASTEL.mint, color: '#1A5C35' }
          : { background: PASTEL.lineSoft, color: PASTEL.inkMute }
      }
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: active ? PASTEL.mintDeep : PASTEL.inkMute }}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Drawer form primitives
// ─────────────────────────────────────────────────────────────

function FormLabel({ children }) {
  return (
    <div
      className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-1.5"
      style={{ color: PASTEL.inkMute }}
    >
      {children}
    </div>
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
      style={{ color: PASTEL.ink }}
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
        {checked ? 'Enabled' : 'Disabled'}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper: pick the first active ERP role from the user_roles array
// ─────────────────────────────────────────────────────────────

function getPrimaryErpRole(userRoles) {
  return (userRoles || []).find((ur) => ur.is_active) || null;
}

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────

export default function UserAccessPage() {
  const { profile: myProfile } = useAuth();

  // ── List state ──
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);

  const { data, total, loading, error, refresh } = useUserAccess({ page, search });

  const totalPages = Math.max(1, Math.ceil(total / USER_ACCESS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * USER_ACCESS_PAGE_SIZE + 1;
  const to = Math.min(page * USER_ACCESS_PAGE_SIZE, total);

  const handleSearch = useCallback((val) => {
    setSearchInput(val);
    setPage(1);
  }, []);

  // ── Drawer state ──
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toast, setToast] = useState(null);

  // Stable keys for the options-loading effect
  // editUserId: set when drawer opens, cleared on close
  // editCompanyId: updated when company changes in the form
  const [editUserId, setEditUserId] = useState(null);
  const [editCompanyId, setEditCompanyId] = useState('');

  const [formOptions, setFormOptions] = useState({
    companies: [], branches: [], departments: [], positions: [], erpRoles: [],
  });

  // Load/reload cascading form options when drawer opens or company changes.
  // All setState calls are inside .then() — matches project lint-safe pattern.
  useEffect(() => {
    if (!editUserId) return;
    let cancelled = false;

    Promise.all([
      fetchAllCompanies(),
      fetchBranchesForCompany(editCompanyId),
      fetchDepartmentsForCompany(editCompanyId),
      fetchPositionsForCompany(editCompanyId),
      fetchRolesForCompany(editCompanyId),
    ]).then(([companies, branches, depts, positions, erpRoles]) => {
      if (cancelled) return;
      setFormOptions({
        companies:   companies.data,
        branches:    branches.data,
        departments: depts.data,
        positions:   positions.data,
        erpRoles:    erpRoles.data,
      });
    });

    return () => { cancelled = true; };
  }, [editUserId, editCompanyId]);

  // ── Drawer actions ──

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const openEdit = useCallback((row) => {
    const primaryRole = getPrimaryErpRole(row.user_roles);
    setDraft({
      id:                 row.id,
      full_name:          row.full_name || '',
      company_id:         row.company_id || '',
      branch_id:          row.branch_id || '',
      department_id:      row.department_id || '',
      position_id:        row.position_id || '',
      role:               row.role || 'logistic',
      active:             row.active !== false,
      mfa_required:       !!row.mfa_required,
      erp_role_id:        primaryRole?.role_id || '',
      _originalErpRoleId: primaryRole?.role_id || '',
    });
    setEditUserId(row.id);
    setEditCompanyId(row.company_id || '');
    setSaveError(null);
  }, []);

  const closeEdit = useCallback(() => {
    setDraft(null);
    setEditUserId(null);
    setEditCompanyId('');
    setSaveError(null);
    setFormOptions({
      companies: [], branches: [], departments: [], positions: [], erpRoles: [],
    });
  }, []);

  // When company changes: clear dependent fields and trigger options reload
  const handleCompanyChange = useCallback((newCompanyId) => {
    setDraft((d) => ({
      ...d,
      company_id:    newCompanyId,
      branch_id:     '',
      department_id: '',
      position_id:   '',
      erp_role_id:   '',
    }));
    setEditCompanyId(newCompanyId);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;

    // Guard: cannot deactivate own account
    if (draft.id === myProfile?.id && !draft.active) {
      setSaveError('You cannot deactivate your own account.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    const profilePatch = {
      company_id:    draft.company_id    || null,
      branch_id:     draft.branch_id     || null,
      department_id: draft.department_id || null,
      position_id:   draft.position_id   || null,
      role:          draft.role,
      active:        draft.active,
      mfa_required:  draft.mfa_required,
    };

    // Only touch user_roles if the ERP role actually changed
    const erpRoleChanged = draft.erp_role_id !== draft._originalErpRoleId;
    const newErpRoleId   = erpRoleChanged ? (draft.erp_role_id || null) : undefined;

    const { error: saveErr } = await saveUserAccess({
      profileId:    draft.id,
      profilePatch,
      newErpRoleId,
      companyId:    draft.company_id || null,
    });

    setSaving(false);

    if (saveErr) {
      setSaveError(
        saveErr.message
          ? `Save failed: ${saveErr.message}`
          : 'Save failed. Check your permissions and try again.'
      );
      return;
    }

    closeEdit();
    refresh();
    showToast('User access updated.');
  }, [draft, myProfile?.id, closeEdit, refresh, showToast]);

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div>
      <AdminPageHeader
        title="User Access"
        subtitle="Manage company, role, and ERP access for existing users. Auth user creation is via Supabase Dashboard."
        count={loading ? undefined : total}
      />

      {/* Email notice */}
      <div
        className="mb-4 rounded-2xl p-3.5 flex gap-3 items-start text-sm"
        style={{ background: PASTEL.lineSoft, border: `1px solid ${PASTEL.line}` }}
      >
        <span
          className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
          style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
        >
          i
        </span>
        <div className="text-sm" style={{ color: PASTEL.inkSoft }}>
          <span style={{ color: PASTEL.ink, fontWeight: 600 }}>
            Email is managed in Supabase Auth
          </span>{' '}
          and is not stored in public profiles. To create a new auth user, open{' '}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: PASTEL.lavenderDeep, fontWeight: 600 }}
          >
            Supabase Dashboard
          </a>
          {' '}→ Authentication → Users → Add user.
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs px-3.5 py-2.5 rounded-xl border"
          style={{ background: 'white', borderColor: PASTEL.line }}
        >
          <Search size={14} style={{ color: PASTEL.inkMute }} />
          <input
            type="text"
            placeholder="Search by full name…"
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
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'white', borderColor: PASTEL.line }}
      >
        {/* Header row */}
        <div
          className="grid px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{
            gridTemplateColumns: GRID,
            borderColor: PASTEL.line,
            background: PASTEL.lineSoft,
            color: PASTEL.inkMute,
          }}
        >
          <div>Name</div>
          <div>Company</div>
          <div>Legacy Role</div>
          <div>ERP Role</div>
          <div className="text-center">Active</div>
          <div className="text-center">MFA</div>
          <div />
        </div>

        {/* Body */}
        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={8} />
        ) : data.length === 0 ? (
          <EmptyState
            message={
              search ? 'No users match your search.' : 'No user profiles found.'
            }
          />
        ) : (
          data.map((row) => {
            const primaryErpRole = getPrimaryErpRole(row.user_roles);
            return (
              <div
                key={row.id}
                className="grid px-4 py-3 border-b items-center text-sm transition-colors"
                style={{
                  gridTemplateColumns: GRID,
                  borderColor: PASTEL.line,
                  opacity: row.active ? 1 : 0.55,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Name + ID + branch/dept subtitle */}
                <div className="min-w-0 pr-2">
                  <div className="font-medium truncate" style={{ color: PASTEL.ink }}>
                    {row.full_name || (
                      <span style={{ color: PASTEL.inkMute }}>(unnamed)</span>
                    )}
                  </div>
                  <div
                    className="text-[10px] font-mono truncate mt-0.5"
                    style={{ color: PASTEL.inkMute }}
                  >
                    {row.id.slice(0, 14)}…
                  </div>
                  {(row.branches?.name || row.departments?.name) && (
                    <div
                      className="text-[11px] mt-0.5 truncate"
                      style={{ color: PASTEL.inkSoft }}
                    >
                      {[row.branches?.name, row.departments?.name]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>

                {/* Company badge */}
                <div>
                  {row.companies ? (
                    <span
                      className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                      style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
                    >
                      {row.companies.code}
                    </span>
                  ) : (
                    <span style={{ color: PASTEL.inkMute }}>—</span>
                  )}
                </div>

                {/* Legacy role badge */}
                <div>
                  <LegacyRoleBadge role={row.role} />
                </div>

                {/* ERP role */}
                <div className="min-w-0 pr-1">
                  {primaryErpRole?.roles ? (
                    <div>
                      <div
                        className="text-xs font-medium truncate"
                        style={{ color: PASTEL.ink }}
                      >
                        {primaryErpRole.roles.name}
                      </div>
                      <div className="text-[10px]" style={{ color: PASTEL.inkMute }}>
                        {primaryErpRole.roles.code}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px]" style={{ color: PASTEL.inkMute }}>
                      No role
                    </span>
                  )}
                </div>

                {/* Active badge */}
                <div className="flex justify-center">
                  <ActiveBadge active={row.active} />
                </div>

                {/* MFA indicator */}
                <div
                  className="text-center text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    color: row.mfa_required ? PASTEL.lavenderDeep : PASTEL.inkMute,
                  }}
                >
                  {row.mfa_required ? 'Req' : 'Off'}
                </div>

                {/* Edit button */}
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
            );
          })
        )}

        {/* Pagination footer */}
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
          Edit Drawer
      ───────────────────────────────────────────────────── */}
      {draft && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(45,42,40,0.22)' }}
            onClick={closeEdit}
          />

          {/* Panel */}
          <div
            className="fixed right-0 top-0 bottom-0 z-50 w-full flex flex-col"
            style={{
              maxWidth: 440,
              background: 'white',
              borderLeft: `1px solid ${PASTEL.line}`,
              boxShadow: '-6px 0 32px rgba(45,42,40,0.10)',
            }}
          >
            {/* Drawer header */}
            <div
              className="flex items-start justify-between gap-3 px-5 py-4 border-b flex-shrink-0"
              style={{ borderColor: PASTEL.line }}
            >
              <div className="min-w-0">
                <div
                  className="text-[10px] uppercase tracking-[0.20em] font-semibold mb-1"
                  style={{ color: PASTEL.inkMute }}
                >
                  Edit User Access
                </div>
                <div
                  className="font-display text-lg font-semibold truncate"
                  style={{ color: PASTEL.ink }}
                >
                  {draft.full_name || '(unnamed)'}
                </div>
                <div
                  className="text-[10px] font-mono mt-0.5 truncate"
                  style={{ color: PASTEL.inkMute }}
                >
                  {draft.id}
                </div>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                className="flex-shrink-0 p-2 rounded-xl transition-opacity hover:opacity-70"
                style={{ background: PASTEL.lineSoft }}
              >
                <X size={15} style={{ color: PASTEL.inkSoft }} />
              </button>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

              {/* ── Business Identity ── */}
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3"
                  style={{ color: PASTEL.lavenderDeep }}
                >
                  Business Identity
                </div>

                <div className="space-y-3">
                  {/* Company */}
                  <div>
                    <FormLabel>Company</FormLabel>
                    <FormSelect
                      value={draft.company_id}
                      onChange={handleCompanyChange}
                      disabled={saving}
                    >
                      <option value="">— Select company —</option>
                      {formOptions.companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </FormSelect>
                  </div>

                  {/* Branch */}
                  <div>
                    <FormLabel>Branch</FormLabel>
                    <FormSelect
                      value={draft.branch_id}
                      onChange={(v) => setDraft((d) => ({ ...d, branch_id: v }))}
                      disabled={saving || !draft.company_id}
                    >
                      <option value="">— None —</option>
                      {formOptions.branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} — {b.name}
                        </option>
                      ))}
                    </FormSelect>
                  </div>

                  {/* Department */}
                  <div>
                    <FormLabel>Department</FormLabel>
                    <FormSelect
                      value={draft.department_id}
                      onChange={(v) => setDraft((d) => ({ ...d, department_id: v }))}
                      disabled={saving || !draft.company_id}
                    >
                      <option value="">— None —</option>
                      {formOptions.departments.map((dep) => (
                        <option key={dep.id} value={dep.id}>
                          {dep.code} — {dep.name}
                        </option>
                      ))}
                    </FormSelect>
                  </div>

                  {/* Position */}
                  <div>
                    <FormLabel>Position</FormLabel>
                    <FormSelect
                      value={draft.position_id}
                      onChange={(v) => setDraft((d) => ({ ...d, position_id: v }))}
                      disabled={saving || !draft.company_id}
                    >
                      <option value="">— None —</option>
                      {formOptions.positions.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.code} — {pos.name}
                        </option>
                      ))}
                    </FormSelect>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${PASTEL.line}` }} />

              {/* ── Access Control ── */}
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3"
                  style={{ color: PASTEL.lavenderDeep }}
                >
                  Access Control
                </div>

                <div className="space-y-4">
                  {/* Legacy Role */}
                  <div>
                    <FormLabel>Legacy Role</FormLabel>
                    <FormSelect
                      value={draft.role}
                      onChange={(v) => setDraft((d) => ({ ...d, role: v }))}
                      disabled={saving}
                    >
                      {LEGACY_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </FormSelect>
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Legacy enum coexists with ERP role during Phase 1.0F transition.
                    </p>
                  </div>

                  {/* ERP Role */}
                  <div>
                    <FormLabel>ERP Role</FormLabel>
                    <FormSelect
                      value={draft.erp_role_id}
                      onChange={(v) => setDraft((d) => ({ ...d, erp_role_id: v }))}
                      disabled={saving || !draft.company_id}
                    >
                      <option value="">— No ERP role —</option>
                      {formOptions.erpRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                    </FormSelect>
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Role assignment is scoped to users in your company.
                      Cross-company assignment requires direct DB access.
                    </p>
                  </div>

                  {/* Account active */}
                  <div>
                    <FormLabel>Account Active</FormLabel>
                    <Toggle
                      checked={draft.active}
                      onChange={(v) => setDraft((d) => ({ ...d, active: v }))}
                      disabled={saving || draft.id === myProfile?.id}
                    />
                    {draft.id === myProfile?.id && (
                      <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                        You cannot deactivate your own account.
                      </p>
                    )}
                  </div>

                  {/* MFA required */}
                  <div>
                    <FormLabel>MFA Required</FormLabel>
                    <Toggle
                      checked={draft.mfa_required}
                      onChange={(v) => setDraft((d) => ({ ...d, mfa_required: v }))}
                      disabled={saving}
                    />
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Recommended for admin, finance controller, BOD, and head-level roles.
                    </p>
                  </div>
                </div>
              </div>

              {/* Save error */}
              {saveError && (
                <div
                  className="rounded-xl p-3.5"
                  style={{
                    background: PASTEL.rose,
                    border: `1px solid ${PASTEL.roseDeep}`,
                  }}
                >
                  <div
                    className="text-xs font-semibold mb-0.5"
                    style={{ color: PASTEL.ink }}
                  >
                    Save failed
                  </div>
                  <div className="text-xs" style={{ color: PASTEL.inkSoft }}>
                    {saveError}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-4 border-t flex-shrink-0"
              style={{ borderColor: PASTEL.line, background: PASTEL.lineSoft }}
            >
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
                style={{
                  background: 'white',
                  color: PASTEL.inkSoft,
                  border: `1px solid ${PASTEL.line}`,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
                style={{ background: PASTEL.ink, color: 'white' }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 z-[60]"
          style={{
            background: toast.type === 'error' ? PASTEL.rose : PASTEL.mint,
            color: PASTEL.ink,
            border: `1px solid ${
              toast.type === 'error' ? PASTEL.roseDeep : PASTEL.mintDeep
            }`,
          }}
        >
          {toast.type === 'error' ? <X size={14} /> : <Check size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
