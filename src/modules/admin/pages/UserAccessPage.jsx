// src/modules/admin/pages/UserAccessPage.jsx
// User Access Management — table list + Add User modal.
//
// Table columns: Avatar+Name | Company | Role | Status | Actions
// Actions per row: Edit (→ full-page UserEditPage via onEditUser) | Activate/Deactivate (direct)
//
// Add User: centered modal → calls create-user Edge Function
//   Fields: Full Name, Email, Password, Company, ERP Role, Branch/Dept/Position
//   Email lives in Supabase Auth (auth.users) — not stored in public.profiles.
//
// Edit is now a full page (state-swap in AdminShell) — see UserEditPage.jsx.
// Deactivate/Activate: per-row direct action with confirm dialog.
//   Disabled for the logged-in user's own row.
//
// Props:
//   showToast(msg, type) — shell-level toast (AdminShell owns the toast UI)
//   onEditUser(row)      — navigate to the full-page editor for this user

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
  toggleUserActive,
  createUser,
  USER_ACCESS_PAGE_SIZE,
} from '../../../hooks/useUserAccess';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../contexts/useAuth';
import { supabase } from '../../../lib/supabase';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../../../lib/auditLogger';
import AdminPageHeader from '../components/AdminPageHeader';
import AdminFormModal from '../components/AdminFormModal';
import LoadingState from '../components/LoadingState';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import ConfirmModal from '../../../components/ConfirmModal';
import { PASTEL, getPrimaryErpRole, EMAIL_RE } from './userAccessTokens';
import {
  Avatar, RoleBadge, StatusBadge,
  FieldLabel, FieldInput, FieldSelect,
  SectionLabel, Divider, SaveError,
} from './userAccessShared';

// Avatar+Name | Company | Role | Status | Actions
const GRID = '1fr 80px 180px 80px 148px';

const EMPTY_ADD = {
  full_name:    '',
  email:        '',
  password:     '',
  company_id:   '',
  erp_role_id:  '',
  branch_id:    '',
  department_id:'',
  position_id:  '',
};

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────

export default function UserAccessPage({ showToast, onEditUser }) {
  const { profile: myProfile, erpRole, user } = useAuth();

  // Fallback toast if rendered without a shell-level showToast (defensive).
  const [localToast, setLocalToast] = useState(null);
  const toast = useCallback((msg, type = 'success') => {
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    setLocalToast({ msg, type });
    setTimeout(() => setLocalToast(null), 3500);
  }, [showToast]);

  // ── List state ──────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setConfirmState({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirmState(s => ({ ...s, open: false, onConfirm: null }));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const { data, total, loading, error, refresh } = useUserAccess({ page, search });
  const totalPages = Math.max(1, Math.ceil(total / USER_ACCESS_PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * USER_ACCESS_PAGE_SIZE + 1;
  const to = Math.min(page * USER_ACCESS_PAGE_SIZE, total);
  const handleSearch = useCallback((val) => { setSearchInput(val); setPage(1); }, []);

  // ── Row toggle (activate/deactivate) ─────────────────────────
  const [togglingId, setTogglingId] = useState(null);

  const handleToggleActive = useCallback((row) => {
    const action = row.active ? 'deactivate' : 'activate';
    showConfirm(
      action === 'deactivate' ? 'Deactivate User' : 'Activate User',
      `${action === 'deactivate' ? 'Deactivate' : 'Activate'} ${row.full_name || 'this user'}?`,
      async () => {
        closeConfirm();
        setTogglingId(row.id);
        const { error: toggleErr } = await toggleUserActive(row.id, !row.active);
        setTogglingId(null);
        if (toggleErr) {
          toast(toggleErr.message || `Failed to ${action} user.`, 'error');
          return;
        }
        if (action === 'deactivate') {
          logAudit(supabase, {
            action: ACTION_TYPES.DEACTIVATE_USER,
            entityType: ENTITY_TYPES.USER,
            entityId: row.id,
            entityLabel: row.full_name || null,
          }, { id: myProfile?.id, email: user?.email, role: erpRole, companyId: myProfile?.company_id });
        }
        refresh();
        toast(`User ${action === 'deactivate' ? 'deactivated' : 'activated'}.`);
      }
    );
  }, [refresh, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add User modal state ─────────────────────────────────────
  const [addOpen, setAddOpen]           = useState(false);
  const [addDraft, setAddDraft]         = useState({ ...EMPTY_ADD });
  const [addSaving, setAddSaving]       = useState(false);
  const [addError, setAddError]         = useState(null);
  const [addCompanies, setAddCompanies] = useState([]);
  const [addCompanyId, setAddCompanyId] = useState('');   // tracks cascade source
  const [addBranches,     setAddBranches]     = useState([]);
  const [addDepartments,  setAddDepartments]  = useState([]);
  const [addPositions,    setAddPositions]    = useState([]);
  const [addErpRoles,     setAddErpRoles]     = useState([]);

  // Fetch companies once when modal opens
  useEffect(() => {
    if (!addOpen) return;
    fetchAllCompanies().then(({ data: cos }) => setAddCompanies(cos || []));
  }, [addOpen]);

  // Cascade: fetch branches / departments / positions / ERP roles when company changes
  useEffect(() => {
    if (!addOpen || !addCompanyId) {
      setAddBranches([]); setAddDepartments([]); setAddPositions([]); setAddErpRoles([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchBranchesForCompany(addCompanyId),
      fetchDepartmentsForCompany(addCompanyId),
      fetchPositionsForCompany(addCompanyId),
      fetchRolesForCompany(addCompanyId),
    ]).then(([branches, depts, positions, roles]) => {
      if (cancelled) return;
      setAddBranches(branches.data || []);
      setAddDepartments(depts.data || []);
      setAddPositions(positions.data || []);
      setAddErpRoles(roles.data || []);
    });
    return () => { cancelled = true; };
  }, [addOpen, addCompanyId]);

  const openAdd = useCallback(() => {
    setAddDraft({ ...EMPTY_ADD });
    setAddError(null);
    setAddCompanyId('');
    setAddOpen(true);
  }, []);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setAddError(null);
    setAddCompanies([]);
    setAddCompanyId('');
    setAddBranches([]); setAddDepartments([]); setAddPositions([]); setAddErpRoles([]);
  }, []);

  // Reset dependent fields when company changes in add form
  const handleAddCompanyChange = useCallback((newCoId) => {
    setAddDraft(d => ({ ...d, company_id: newCoId, branch_id: '', department_id: '', position_id: '', erp_role_id: '' }));
    setAddCompanyId(newCoId);
  }, []);

  const handleAddSave = useCallback(async () => {
    const { full_name, email, password, company_id, erp_role_id,
            branch_id, department_id, position_id } = addDraft;
    if (!full_name.trim())             { setAddError('Full name is required.'); return; }
    if (!email.trim())                 { setAddError('Email is required.'); return; }
    if (!EMAIL_RE.test(email.trim()))  { setAddError('Invalid email format.'); return; }
    if (!password)                     { setAddError('Password is required.'); return; }
    if (password.length < 8)          { setAddError('Password must be at least 8 characters.'); return; }
    if (!company_id)                   { setAddError('Company is required.'); return; }
    if (!erp_role_id)                  { setAddError('ERP Role is required.'); return; }

    setAddSaving(true);
    setAddError(null);

    const { data: result, error: createErr } = await createUser({
      email:        email.trim(),
      password,
      full_name:    full_name.trim(),
      company_id,
      erp_role_id,
      branch_id:    branch_id    || null,
      department_id:department_id|| null,
      position_id:  position_id  || null,
    });

    setAddSaving(false);

    if (createErr) {
      setAddError(createErr.message || 'Failed to create user. Check the Edge Function logs.');
      return;
    }

    logAudit(supabase, {
      action: ACTION_TYPES.CREATE_USER,
      entityType: ENTITY_TYPES.USER,
      entityId: result?.user?.id ?? result?.id ?? null,
      entityLabel: full_name.trim() || email.trim(),
    }, { id: myProfile?.id, email: user?.email, role: erpRole, companyId: myProfile?.company_id });
    closeAdd();
    refresh();
    toast(result?.warning ? `User created (with warning: ${result.warning})` : 'User created successfully.');
  }, [addDraft, closeAdd, refresh, toast, myProfile, erpRole, user]);

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
                  <Avatar name={row.full_name} avatarUrl={row.avatar_url} />
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
                    onClick={() => onEditUser?.(row)}
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

              {/* Company + ERP Role — 2 col */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Company</FieldLabel>
                  <FieldSelect
                    value={addDraft.company_id}
                    onChange={handleAddCompanyChange}
                    disabled={addSaving}
                  >
                    <option value="">— Select company —</option>
                    {addCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </FieldSelect>
                </div>
                <div>
                  <FieldLabel required>ERP Role</FieldLabel>
                  <FieldSelect
                    value={addDraft.erp_role_id}
                    onChange={(v) => setAddDraft((d) => ({ ...d, erp_role_id: v }))}
                    disabled={addSaving || !addDraft.company_id}
                  >
                    <option value="">— Select role —</option>
                    {addErpRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                    ))}
                  </FieldSelect>
                  {!addDraft.company_id && (
                    <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                      Select a company first.
                    </p>
                  )}
                </div>
              </div>

              {/* Branch + Department — 2 col, optional */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Branch</FieldLabel>
                  <FieldSelect
                    value={addDraft.branch_id}
                    onChange={(v) => setAddDraft((d) => ({ ...d, branch_id: v }))}
                    disabled={addSaving || !addDraft.company_id}
                  >
                    <option value="">— None —</option>
                    {addBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                    ))}
                  </FieldSelect>
                </div>
                <div>
                  <FieldLabel>Department</FieldLabel>
                  <FieldSelect
                    value={addDraft.department_id}
                    onChange={(v) => setAddDraft((d) => ({ ...d, department_id: v }))}
                    disabled={addSaving || !addDraft.company_id}
                  >
                    <option value="">— None —</option>
                    {addDepartments.map((dep) => (
                      <option key={dep.id} value={dep.id}>{dep.code} — {dep.name}</option>
                    ))}
                  </FieldSelect>
                </div>
              </div>

              {/* Position — full width, optional */}
              <div>
                <FieldLabel>Position</FieldLabel>
                <FieldSelect
                  value={addDraft.position_id}
                  onChange={(v) => setAddDraft((d) => ({ ...d, position_id: v }))}
                  disabled={addSaving || !addDraft.company_id}
                >
                  <option value="">— None —</option>
                  {addPositions.map((pos) => (
                    <option key={pos.id} value={pos.id}>{pos.code} — {pos.name}</option>
                  ))}
                </FieldSelect>
              </div>
            </div>
          </div>

          <SaveError message={addError} />
        </div>
      </AdminFormModal>

      {/* Local fallback toast (only used if no shell-level showToast was provided) */}
      {localToast && (
        <div
          className="fixed bottom-6 right-6 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg flex items-center gap-2 z-[60]"
          style={{
            background: localToast.type === 'error' ? PASTEL.rose : PASTEL.mint,
            color: PASTEL.ink,
            border: `1px solid ${localToast.type === 'error' ? PASTEL.roseDeep : PASTEL.mintDeep}`,
          }}
        >
          <Check size={14} />
          {localToast.msg}
        </div>
      )}

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel="Ya, Lanjutkan"
        cancelLabel="Batal"
        variant="warning"
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
