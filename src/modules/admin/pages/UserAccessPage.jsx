// src/modules/admin/pages/UserAccessPage.jsx
// User Access Management — table list + Edit modal + Add User modal.
//
// Table columns: Avatar+Name | Company | Role | Status | Actions
// Actions per row: Edit (full profile + access modal) | Activate/Deactivate (direct)
//
// Add User: centered modal → calls create-user Edge Function
//   Fields: Full Name, Email, Password, Legacy Role, Company
//   Email lives in Supabase Auth (auth.users) — not stored in public.profiles.
//   It is accepted here for auth user creation only and not displayed in the table.
//
// Edit: centered AdminFormModal — same pattern as BranchesPage.
//   Sections: Business Identity (company/branch/dept/position)
//             Access Control (legacy role / ERP role / active / MFA)
//
// Deactivate/Activate: per-row direct action with confirm dialog.
//   Disabled for the logged-in user's own row.

import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, Check, Plus,
  RefreshCw as Spinner,
} from 'lucide-react';
import {
  useUserAccess,
  fetchAllCompanies,
  fetchBranchesForCompany,
  fetchDepartmentsForCompany,
  fetchPositionsForCompany,
  fetchRolesForCompany,
  saveUserAccess,
  toggleUserActive,
  createUser,
  USER_ACCESS_PAGE_SIZE,
} from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../contexts/useAuth';
import AdminPageHeader from '../components/AdminPageHeader';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

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
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
};

const LEGACY_ROLES = [
  { value: 'super',       label: 'Super Admin' },
  { value: 'operations',  label: 'Operations' },      // renamed from 'logistic'
  { value: 'logistic',    label: 'Admin Logistic (legacy)' }, // keep during DB transition
  { value: 'procurement', label: 'Procurement' },
  { value: 'finance',     label: 'Finance' },
  { value: 'management',  label: 'Management' },
];

const LEGACY_ROLE_COLOR = {
  super:       PASTEL.peachDeep,
  operations:  PASTEL.skyDeep,    // renamed from 'logistic'
  logistic:    PASTEL.skyDeep,    // legacy alias
  procurement: PASTEL.lavenderDeep,
  finance:     PASTEL.mintDeep,
  management:  PASTEL.butterDeep,
};

// Avatar+Name | Company | Role | Status | Actions
const GRID = '1fr 80px 180px 80px 148px';

const EMPTY_ADD = {
  full_name:  '',
  email:      '',
  password:   '',
  role:       'operations',   // renamed from 'logistic'
  company_id: '',
};

// ─────────────────────────────────────────────────────────────
// Small display components
// ─────────────────────────────────────────────────────────────

function Avatar({ name }) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 text-xs font-bold select-none"
      style={{ background: PASTEL.lavender, color: PASTEL.lavenderDeep }}
    >
      {initials}
    </span>
  );
}

function RoleBadge({ erpRole, legacyRole }) {
  if (erpRole?.roles) {
    return (
      <div>
        <div className="text-xs font-medium truncate" style={{ color: PASTEL.ink }}>
          {erpRole.roles.name}
        </div>
        <div className="text-[10px]" style={{ color: PASTEL.inkMute }}>
          {erpRole.roles.code}
        </div>
      </div>
    );
  }
  const color = LEGACY_ROLE_COLOR[legacyRole] || PASTEL.inkMute;
  const label = LEGACY_ROLES.find((r) => r.value === legacyRole)?.label || legacyRole;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold whitespace-nowrap"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

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

// ─────────────────────────────────────────────────────────────
// Modal form primitives (shared by both Edit and Add modals)
// ─────────────────────────────────────────────────────────────

function FieldLabel({ children, required }) {
  return (
    <div className="text-[11px] font-semibold mb-1.5 uppercase tracking-[0.14em]" style={{ color: PASTEL.inkMute }}>
      {children}
      {required && <span style={{ color: PASTEL.roseDeep }}> *</span>}
    </div>
  );
}

function FieldInput({ type = 'text', value, onChange, disabled, placeholder, maxLength }) {
  return (
    <input
      type={type}
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

function FieldToggle({ label, helpText, checked, onChange, disabled }) {
  return (
    <div>
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
          {label ?? (checked ? 'Enabled' : 'Disabled')}
        </span>
      </button>
      {helpText && (
        <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>{helpText}</p>
      )}
    </div>
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

function SaveError({ message }) {
  if (!message) return null;
  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{ background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}` }}
    >
      <div className="text-xs font-semibold mb-0.5" style={{ color: PASTEL.ink }}>Save failed</div>
      <div className="text-xs" style={{ color: PASTEL.inkSoft }}>{message}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getPrimaryErpRole(userRoles) {
  return (userRoles || []).find((ur) => ur.is_active) || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────

export default function UserAccessPage() {
  const { profile: myProfile } = useAuth();

  // ── List state ──────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const { data, total, loading, error, refresh } = useUserAccess({ page, search });
  const totalPages = Math.max(1, Math.ceil(total / USER_ACCESS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * USER_ACCESS_PAGE_SIZE + 1;
  const to = Math.min(page * USER_ACCESS_PAGE_SIZE, total);
  const handleSearch = useCallback((val) => { setSearchInput(val); setPage(1); }, []);

  // ── Toast ────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Row toggle (activate/deactivate) ─────────────────────────
  const [togglingId, setTogglingId] = useState(null);

  const handleToggleActive = useCallback(async (row) => {
    const action = row.active ? 'deactivate' : 'activate';
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Activate'} ${row.full_name || 'this user'}?`)) return;
    setTogglingId(row.id);
    const { error: toggleErr } = await toggleUserActive(row.id, !row.active);
    setTogglingId(null);
    if (toggleErr) {
      showToast(toggleErr.message || `Failed to ${action} user.`, 'error');
      return;
    }
    refresh();
    showToast(`User ${action === 'deactivate' ? 'deactivated' : 'activated'}.`);
  }, [refresh, showToast]);

  // ── Edit modal state ─────────────────────────────────────────
  const [editDraft, setEditDraft] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editUserId, setEditUserId] = useState(null);
  const [editCompanyId, setEditCompanyId] = useState('');
  const [formOptions, setFormOptions] = useState({
    companies: [], branches: [], departments: [], positions: [], erpRoles: [],
  });

  // Load / cascade form options when edit modal opens or company changes
  useEffect(() => {
    if (!editUserId) return;
    let cancelled = false;
    Promise.all([
      fetchAllCompanies(),
      fetchBranchesForCompany(editCompanyId),
      fetchDepartmentsForCompany(editCompanyId),
      fetchPositionsForCompany(editCompanyId),
      fetchRolesForCompany(editCompanyId),
    ]).then(([cos, branches, depts, positions, erpRoles]) => {
      if (cancelled) return;
      setFormOptions({
        companies:   cos.data,
        branches:    branches.data,
        departments: depts.data,
        positions:   positions.data,
        erpRoles:    erpRoles.data,
      });
    });
    return () => { cancelled = true; };
  }, [editUserId, editCompanyId]);

  const openEdit = useCallback((row) => {
    const primary = getPrimaryErpRole(row.user_roles);
    setEditDraft({
      id:                 row.id,
      full_name:          row.full_name || '',
      company_id:         row.company_id || '',
      branch_id:          row.branch_id || '',
      department_id:      row.department_id || '',
      position_id:        row.position_id || '',
      role:               row.role || 'operations',  // renamed from 'logistic'
      active:             row.active !== false,
      mfa_required:       !!row.mfa_required,
      erp_role_id:        primary?.role_id || '',
      _originalErpRoleId: primary?.role_id || '',
    });
    setEditUserId(row.id);
    setEditCompanyId(row.company_id || '');
    setEditError(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditDraft(null);
    setEditUserId(null);
    setEditCompanyId('');
    setEditError(null);
    setFormOptions({ companies: [], branches: [], departments: [], positions: [], erpRoles: [] });
  }, []);

  const handleEditCompanyChange = useCallback((newCo) => {
    setEditDraft((d) => ({ ...d, company_id: newCo, branch_id: '', department_id: '', position_id: '', erp_role_id: '' }));
    setEditCompanyId(newCo);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editDraft) return;
    if (editDraft.id === myProfile?.id && !editDraft.active) {
      setEditError('You cannot deactivate your own account.');
      return;
    }
    setEditSaving(true);
    setEditError(null);

    const erpRoleChanged = editDraft.erp_role_id !== editDraft._originalErpRoleId;
    const { error: saveErr } = await saveUserAccess({
      profileId:    editDraft.id,
      profilePatch: {
        company_id:    editDraft.company_id    || null,
        branch_id:     editDraft.branch_id     || null,
        department_id: editDraft.department_id || null,
        position_id:   editDraft.position_id   || null,
        role:          editDraft.role,
        active:        editDraft.active,
        mfa_required:  editDraft.mfa_required,
      },
      newErpRoleId: erpRoleChanged ? (editDraft.erp_role_id || null) : undefined,
      companyId:    editDraft.company_id || null,
    });

    setEditSaving(false);
    if (saveErr) {
      setEditError(saveErr.message ? `Save failed: ${saveErr.message}` : 'Save failed. Check your permissions.');
      return;
    }
    closeEdit();
    refresh();
    showToast('User updated.');
  }, [editDraft, myProfile?.id, closeEdit, refresh, showToast]);

  // ── Add User modal state ─────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({ ...EMPTY_ADD });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addCompanies, setAddCompanies] = useState([]);

  useEffect(() => {
    if (!addOpen) return;
    fetchAllCompanies().then(({ data: cos }) => setAddCompanies(cos || []));
  }, [addOpen]);

  const openAdd = useCallback(() => {
    setAddDraft({ ...EMPTY_ADD });
    setAddError(null);
    setAddOpen(true);
  }, []);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setAddError(null);
    setAddCompanies([]);
  }, []);

  const handleAddSave = useCallback(async () => {
    const { full_name, email, password, role, company_id } = addDraft;
    if (!full_name.trim())              { setAddError('Full name is required.'); return; }
    if (!email.trim())                  { setAddError('Email is required.'); return; }
    if (!EMAIL_RE.test(email.trim()))   { setAddError('Invalid email format.'); return; }
    if (!password)                      { setAddError('Password is required.'); return; }
    if (password.length < 8)           { setAddError('Password must be at least 8 characters.'); return; }
    if (!role)                          { setAddError('Role is required.'); return; }
    if (!company_id)                    { setAddError('Company is required.'); return; }

    setAddSaving(true);
    setAddError(null);

    const { data: result, error: createErr } = await createUser({
      email: email.trim(),
      password,
      full_name: full_name.trim(),
      role,
      company_id,
    });

    setAddSaving(false);

    if (createErr) {
      setAddError(createErr.message || 'Failed to create user. Check the Edge Function logs.');
      return;
    }

    closeAdd();
    refresh();
    showToast(result?.warning ? `User created (with warning: ${result.warning})` : 'User created successfully.');
  }, [addDraft, closeAdd, refresh, showToast]);

  // ── Modal footers ─────────────────────────────────────────────
  const editFooter = (
    <div className="flex items-center gap-3">
      <div className="flex-1" />
      <button
        type="button" onClick={closeEdit} disabled={editSaving}
        className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
        style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
      >
        Cancel
      </button>
      <button
        type="button" onClick={handleEditSave} disabled={editSaving}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
        style={{ background: PASTEL.ink, color: 'white' }}
      >
        {editSaving
          ? <><Spinner size={13} className="animate-spin" /> Saving…</>
          : <><Check size={13} /> Save Changes</>}
      </button>
    </div>
  );

  const addFooter = (
    <div className="flex items-center gap-3">
      <div className="flex-1" />
      <button
        type="button" onClick={closeAdd} disabled={addSaving}
        className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-50"
        style={{ background: 'white', color: PASTEL.inkSoft, border: `1px solid ${PASTEL.line}` }}
      >
        Cancel
      </button>
      <button
        type="button" onClick={handleAddSave} disabled={addSaving}
        className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
        style={{ background: PASTEL.ink, color: 'white' }}
      >
        {addSaving
          ? <><Spinner size={13} className="animate-spin" /> Creating…</>
          : <><Check size={13} /> Create User</>}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div>
      <AdminPageHeader
        title="User Access"
        subtitle="Manage roles, company assignments, and access status for platform users."
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
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[#9C948D]"
            style={{ color: PASTEL.ink }}
          />
        </div>
        <button
          type="button" onClick={refresh}
          className="p-2.5 rounded-xl border transition-opacity hover:opacity-70"
          style={{ background: 'white', borderColor: PASTEL.line }}
          title="Refresh"
        >
          <RefreshCw size={14} style={{ color: PASTEL.inkSoft }} />
        </button>
        <button
          type="button" onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ background: PASTEL.ink, color: 'white' }}
        >
          <Plus size={14} />
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'white', borderColor: PASTEL.line }}>

        {/* Header */}
        <div
          className="grid px-4 py-3 border-b text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ gridTemplateColumns: GRID, borderColor: PASTEL.line, background: PASTEL.lineSoft, color: PASTEL.inkMute }}
        >
          <div>Name</div>
          <div>Company</div>
          <div>Role</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>

        {/* Body */}
        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : loading ? (
          <LoadingState rows={8} />
        ) : data.length === 0 ? (
          <EmptyState message={search ? 'No users match your search.' : 'No user profiles found.'} />
        ) : (
          data.map((row) => {
            const primaryErpRole = getPrimaryErpRole(row.user_roles);
            const isSelf = row.id === myProfile?.id;
            const isToggling = togglingId === row.id;
            return (
              <div
                key={row.id}
                className="grid px-4 py-3.5 border-b items-center text-sm transition-colors"
                style={{ gridTemplateColumns: GRID, borderColor: PASTEL.line, opacity: row.active ? 1 : 0.6 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = PASTEL.lineSoft)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <Avatar name={row.full_name} />
                  <div className="min-w-0">
                    <div className="font-medium truncate" style={{ color: PASTEL.ink }}>
                      {row.full_name || <span style={{ color: PASTEL.inkMute }}>(unnamed)</span>}
                    </div>
                    {(row.branches?.name || row.departments?.name) && (
                      <div className="text-[11px] truncate mt-0.5" style={{ color: PASTEL.inkSoft }}>
                        {[row.branches?.name, row.departments?.name].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Company */}
                <div>
                  {row.companies ? (
                    <span
                      className="font-mono text-[11px] px-2 py-0.5 rounded-lg font-semibold"
                      style={{ background: PASTEL.sky, color: PASTEL.skyDeep }}
                    >
                      {row.companies.code}
                    </span>
                  ) : (
                    <span style={{ color: PASTEL.inkMute }}>—</span>
                  )}
                </div>

                {/* Role */}
                <div className="min-w-0 pr-2">
                  <RoleBadge erpRole={primaryErpRole} legacyRole={row.role} />
                </div>

                {/* Status */}
                <div>
                  <StatusBadge active={row.active} />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ background: PASTEL.lineSoft, color: PASTEL.inkSoft }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(row)}
                    disabled={isSelf || isToggling}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                    style={
                      row.active
                        ? { background: `${PASTEL.roseDeep}18`, color: PASTEL.roseDeep }
                        : { background: `${PASTEL.mintDeep}18`, color: PASTEL.mintDeep }
                    }
                    title={isSelf ? 'Cannot change your own status' : undefined}
                  >
                    {isToggling
                      ? <Spinner size={11} className="animate-spin" />
                      : row.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Pagination */}
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

      {/* ── Edit User Modal ── */}
      <AdminFormModal
        open={!!editDraft}
        eyebrow="Edit User"
        title={editDraft?.full_name || '(unnamed)'}
        subtitle="Update company assignment, role, and access settings."
        onClose={closeEdit}
        footer={editFooter}
        maxWidth="680px"
      >
        {editDraft && (
          <div className="space-y-6">

            {/* Business Identity */}
            <div>
              <SectionLabel>Business Identity</SectionLabel>
              <div className="space-y-4">

                {/* Company */}
                <div>
                  <FieldLabel>Company</FieldLabel>
                  <FieldSelect value={editDraft.company_id} onChange={handleEditCompanyChange} disabled={editSaving}>
                    <option value="">— Select company —</option>
                    {formOptions.companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </FieldSelect>
                </div>

                {/* Branch + Department — 2 col */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Branch</FieldLabel>
                    <FieldSelect value={editDraft.branch_id} onChange={(v) => setEditDraft((d) => ({ ...d, branch_id: v }))} disabled={editSaving || !editDraft.company_id}>
                      <option value="">— None —</option>
                      {formOptions.branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                      ))}
                    </FieldSelect>
                  </div>
                  <div>
                    <FieldLabel>Department</FieldLabel>
                    <FieldSelect value={editDraft.department_id} onChange={(v) => setEditDraft((d) => ({ ...d, department_id: v }))} disabled={editSaving || !editDraft.company_id}>
                      <option value="">— None —</option>
                      {formOptions.departments.map((dep) => (
                        <option key={dep.id} value={dep.id}>{dep.code} — {dep.name}</option>
                      ))}
                    </FieldSelect>
                  </div>
                </div>

                {/* Position */}
                <div>
                  <FieldLabel>Position</FieldLabel>
                  <FieldSelect value={editDraft.position_id} onChange={(v) => setEditDraft((d) => ({ ...d, position_id: v }))} disabled={editSaving || !editDraft.company_id}>
                    <option value="">— None —</option>
                    {formOptions.positions.map((pos) => (
                      <option key={pos.id} value={pos.id}>{pos.code} — {pos.name}</option>
                    ))}
                  </FieldSelect>
                </div>
              </div>
            </div>

            <Divider />

            {/* Access Control */}
            <div>
              <SectionLabel>Access Control</SectionLabel>
              <div className="space-y-5">

                {/* Legacy Role + ERP Role — 2 col */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>Legacy Role</FieldLabel>
                    <FieldSelect value={editDraft.role} onChange={(v) => setEditDraft((d) => ({ ...d, role: v }))} disabled={editSaving}>
                      {LEGACY_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </FieldSelect>
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Coexists with ERP role during transition.
                    </p>
                  </div>
                  <div>
                    <FieldLabel>ERP Role</FieldLabel>
                    <FieldSelect value={editDraft.erp_role_id} onChange={(v) => setEditDraft((d) => ({ ...d, erp_role_id: v }))} disabled={editSaving || !editDraft.company_id}>
                      <option value="">— No ERP role —</option>
                      {formOptions.erpRoles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                      ))}
                    </FieldSelect>
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Scoped to selected company.
                    </p>
                  </div>
                </div>

                {/* Account Active */}
                <FieldToggle
                  label={editDraft.active ? 'Account active' : 'Account inactive'}
                  checked={editDraft.active}
                  onChange={(v) => setEditDraft((d) => ({ ...d, active: v }))}
                  disabled={editSaving || editDraft.id === myProfile?.id}
                  helpText={editDraft.id === myProfile?.id ? 'You cannot deactivate your own account.' : undefined}
                />

                {/* MFA Required */}
                <FieldToggle
                  label={editDraft.mfa_required ? 'MFA required' : 'MFA not required'}
                  checked={editDraft.mfa_required}
                  onChange={(v) => setEditDraft((d) => ({ ...d, mfa_required: v }))}
                  disabled={editSaving}
                  helpText="Recommended for admin, finance controller, BOD, and head-level roles."
                />
              </div>
            </div>

            <SaveError message={editError} />
          </div>
        )}
      </AdminFormModal>

      {/* ── Add User Modal ── */}
      <AdminFormModal
        open={addOpen}
        eyebrow="New User"
        title="Create User"
        subtitle="Creates a Supabase Auth account and sets up the user profile."
        onClose={closeAdd}
        footer={addFooter}
      >
        <div className="space-y-6">

          {/* Identity */}
          <div>
            <SectionLabel>Identity</SectionLabel>
            <div className="space-y-4">
              <div>
                <FieldLabel required>Full Name</FieldLabel>
                <FieldInput
                  value={addDraft.full_name}
                  onChange={(v) => setAddDraft((d) => ({ ...d, full_name: v }))}
                  disabled={addSaving}
                  placeholder="e.g. Budi Santoso"
                  maxLength={100}
                />
              </div>

              {/* Email + Password — 2 col */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Email</FieldLabel>
                  <FieldInput
                    type="email"
                    value={addDraft.email}
                    onChange={(v) => setAddDraft((d) => ({ ...d, email: v }))}
                    disabled={addSaving}
                    placeholder="user@company.com"
                  />
                  <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                    Used for login. Stored in Supabase Auth only.
                  </p>
                </div>
                <div>
                  <FieldLabel required>Password</FieldLabel>
                  <FieldInput
                    type="password"
                    value={addDraft.password}
                    onChange={(v) => setAddDraft((d) => ({ ...d, password: v }))}
                    disabled={addSaving}
                    placeholder="Min. 8 characters"
                  />
                  <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                    User should change this on first login.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Divider />

          {/* Access */}
          <div>
            <SectionLabel>Access</SectionLabel>
            <div className="space-y-4">

              {/* Company + Role — 2 col */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Company</FieldLabel>
                  <FieldSelect
                    value={addDraft.company_id}
                    onChange={(v) => setAddDraft((d) => ({ ...d, company_id: v }))}
                    disabled={addSaving}
                  >
                    <option value="">— Select company —</option>
                    {addCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </FieldSelect>
                </div>
                <div>
                  <FieldLabel required>Role</FieldLabel>
                  <FieldSelect
                    value={addDraft.role}
                    onChange={(v) => setAddDraft((d) => ({ ...d, role: v }))}
                    disabled={addSaving}
                  >
                    {LEGACY_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </FieldSelect>
                  <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                    ERP role can be assigned after creation via Edit.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <SaveError message={addError} />
        </div>
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
    </div>
  );
}
