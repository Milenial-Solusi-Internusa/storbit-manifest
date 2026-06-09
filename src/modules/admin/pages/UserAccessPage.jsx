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
  RefreshCw as Spinner, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
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
  butter:       '#FFE9B8',
  butterDeep:   '#E8C168',
};

const NAVY   = '#144682';
const ORANGE = '#E85A1E';

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
  const baseLabel = LEGACY_ROLES.find((r) => r.value === legacyRole)?.label || legacyRole;
  const label = legacyRole ? `${baseLabel} (legacy)` : '—';
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
// Permission Matrix — inline component for Edit User tab
// ─────────────────────────────────────────────────────────────

const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print'];

function PermissionMatrix({ matrixModules, matrixActions, permDraft, onToggle, loading, saving, onSave, onCancel, permError }) {
  const [collapsed, setCollapsed] = useState({});

  const totalGranted = Object.values(permDraft).filter(Boolean).length;

  const toggleCollapse = (modId) =>
    setCollapsed(prev => ({ ...prev, [modId]: !prev[modId] }));

  const modAllKeys = (mod) => {
    const keys = [];
    (mod.module_actions || []).forEach(a => keys.push(`ma_${a.id}`));
    (mod.menus || []).forEach(m => (m.menu_actions || []).forEach(a => keys.push(`mea_${a.id}`)));
    return keys;
  };

  const isFullySelected = (mod) => {
    const keys = modAllKeys(mod);
    return keys.length > 0 && keys.every(k => permDraft[k]);
  };

  const handleSelectAll = (mod, select) => {
    const updates = {};
    modAllKeys(mod).forEach(k => { updates[k] = select; });
    onToggle(updates);
  };

  const colW = 52; // px per action column

  const headerStyle = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: PASTEL.inkMute,
    width: colW, textAlign: 'center',
  };

  if (loading) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: PASTEL.inkMute, fontSize: 13 }}>
        Memuat permission matrix…
      </div>
    );
  }

  if (matrixModules.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: PASTEL.inkMute, fontSize: 13 }}>
        Belum ada modules. Tambahkan data ke tabel <code>modules</code> terlebih dahulu.
      </div>
    );
  }

  return (
    <div>
      {/* Column header row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '6px 16px 6px 48px',
        background: PASTEL.lineSoft,
        borderRadius: '10px 10px 0 0',
        border: `1px solid ${PASTEL.line}`,
        borderBottom: 'none',
      }}>
        <span style={{ flex: 1, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: PASTEL.inkMute }}>
          Module / Menu
        </span>
        <div style={{ display: 'flex', gap: 0 }}>
          {matrixActions.map(act => (
            <span key={act} style={headerStyle}>{act}</span>
          ))}
        </div>
        <span style={{ width: 84 }} />
      </div>

      {/* Module + menu rows */}
      <div style={{ border: `1px solid ${PASTEL.line}`, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        {matrixModules.map((mod, idx) => {
          const isCollapsed = collapsed[mod.id];
          const allSelected = isFullySelected(mod);
          const hasMenus = (mod.menus || []).length > 0;

          return (
            <div key={mod.id} style={{ borderBottom: idx < matrixModules.length - 1 ? `1px solid ${PASTEL.line}` : 'none' }}>
              {/* Module row */}
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '9px 16px',
                background: '#F0F4FA',
                borderLeft: `3px solid ${NAVY}`,
              }}>
                {/* Chevron */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(mod.id)}
                  style={{ background: 'none', border: 'none', cursor: hasMenus ? 'pointer' : 'default', padding: '0 6px 0 0', color: PASTEL.inkSoft, display: 'flex', flexShrink: 0, opacity: hasMenus ? 1 : 0 }}
                  tabIndex={hasMenus ? 0 : -1}
                >
                  {isCollapsed ? <ChevronDown size={13}/> : <ChevronUp size={13}/>}
                </button>

                {/* Module label */}
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: NAVY }}>
                  {mod.label || mod.key}
                </span>

                {/* Module-level action checkboxes */}
                <div style={{ display: 'flex', gap: 0 }}>
                  {matrixActions.map(act => {
                    const ma = (mod.module_actions || []).find(a => a.action === act);
                    return (
                      <div key={act} style={{ width: colW, display: 'flex', justifyContent: 'center' }}>
                        {ma ? (
                          <input
                            type="checkbox"
                            checked={!!permDraft[`ma_${ma.id}`]}
                            onChange={e => onToggle({ [`ma_${ma.id}`]: e.target.checked })}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: ORANGE }}
                          />
                        ) : (
                          <span style={{ fontSize: 10, color: PASTEL.line }}>—</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Select / Deselect all */}
                <button
                  type="button"
                  onClick={() => handleSelectAll(mod, !allSelected)}
                  style={{
                    width: 84, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: allSelected ? `${NAVY}18` : `${ORANGE}14`,
                    color: allSelected ? NAVY : ORANGE,
                    border: 'none', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {/* Menu rows */}
              {!isCollapsed && (mod.menus || []).map(menu => (
                <div
                  key={menu.id}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '7px 16px 7px 43px',
                    background: 'white',
                    borderTop: `1px solid ${PASTEL.lineSoft}`,
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F7F7F8'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                >
                  <span style={{ flex: 1, fontSize: 12.5, color: PASTEL.inkSoft }}>
                    {menu.label || menu.key}
                  </span>
                  <div style={{ display: 'flex', gap: 0 }}>
                    {matrixActions.map(act => {
                      const mea = (menu.menu_actions || []).find(a => a.action === act);
                      return (
                        <div key={act} style={{ width: colW, display: 'flex', justifyContent: 'center' }}>
                          {mea ? (
                            <input
                              type="checkbox"
                              checked={!!permDraft[`mea_${mea.id}`]}
                              onChange={e => onToggle({ [`mea_${mea.id}`]: e.target.checked })}
                              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: ORANGE }}
                            />
                          ) : (
                            <span style={{ fontSize: 10, color: PASTEL.line }}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span style={{ width: 84 }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Error */}
      {permError && (
        <div style={{ marginTop: 12, padding: '10px 16px', borderRadius: 10, background: PASTEL.rose, border: `1px solid ${PASTEL.roseDeep}`, fontSize: 12, color: PASTEL.inkSoft }}>
          {permError}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 20, gap: 10 }}>
        <span style={{ flex: 1, fontSize: 12, color: PASTEL.inkMute }}>
          {totalGranted} permission{totalGranted !== 1 ? 's' : ''} granted
        </span>
        <button
          type="button" onClick={onCancel} disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: 12,
            border: `1px solid ${PASTEL.line}`, background: 'white',
            color: PASTEL.inkSoft, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button" onClick={onSave} disabled={saving}
          style={{
            padding: '8px 20px', borderRadius: 12, border: 'none',
            background: NAVY, color: 'white', fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {saving ? <><Spinner size={13} className="animate-spin"/> Saving…</> : 'Save Permissions'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────

export default function UserAccessPage() {
  const { profile: myProfile } = useAuth();

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

  // ── Toast ────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

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
          showToast(toggleErr.message || `Failed to ${action} user.`, 'error');
          return;
        }
        refresh();
        showToast(`User ${action === 'deactivate' ? 'deactivated' : 'activated'}.`);
      }
    );
  }, [refresh, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit modal state ─────────────────────────────────────────
  const [editDraft, setEditDraft] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editUserId, setEditUserId] = useState(null);
  const [editCompanyId, setEditCompanyId] = useState('');
  const [editTab, setEditTab] = useState('profile'); // 'profile' | 'permissions'

  // Permission matrix state
  const [matrixModules, setMatrixModules] = useState([]);
  const [matrixActions, setMatrixActions] = useState([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [permDraft, setPermDraft] = useState({});
  const [originalPerms, setOriginalPerms] = useState([]);
  const [permSaving, setPermSaving] = useState(false);
  const [permError, setPermError] = useState(null);
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
      active:             row.active !== false,
      mfa_required:       !!row.mfa_required,
      erp_role_id:        primary?.role_id || '',
      _originalErpRoleId: primary?.role_id || '',
    });
    setEditUserId(row.id);
    setEditCompanyId(row.company_id || '');
    setEditError(null);
    setEditTab('profile');
    setPermDraft({});
    setOriginalPerms([]);
    setPermError(null);
    setMatrixModules([]);
    setMatrixActions([]);
  }, []);

  const closeEdit = useCallback(() => {
    setEditDraft(null);
    setEditUserId(null);
    setEditCompanyId('');
    setEditError(null);
    setFormOptions({ companies: [], branches: [], departments: [], positions: [], erpRoles: [] });
    setEditTab('profile');
    setMatrixModules([]);
    setMatrixActions([]);
    setPermDraft({});
    setOriginalPerms([]);
    setPermError(null);
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

  // ── Permission matrix data ───────────────────────────────────
  const fetchMatrixData = useCallback(async (userId, companyId) => {
    setMatrixLoading(true);
    const [modsRes, menusRes, existingRes] = await Promise.all([
      supabase.from('modules')
        .select('id, key, label, sort_order, module_actions(id, action)')
        .eq('is_active', true).order('sort_order').limit(100),
      supabase.from('module_menus')
        .select('id, key, label, sort_order, module_id, menu_actions(id, action)')
        .eq('is_active', true).order('sort_order').limit(1000),
      supabase.from('user_menu_permissions')
        .select('id, module_action_id, menu_action_id')
        .eq('user_id', userId).eq('company_id', companyId).limit(1000),
    ]);

    const mods     = modsRes.data  || [];
    const menus    = menusRes.data || [];
    const existing = existingRes.data || [];

    // Collect unique action names and sort by preferred order
    const actionSet = new Set();
    mods.forEach(m  => (m.module_actions || []).forEach(a => actionSet.add(a.action)));
    menus.forEach(m => (m.menu_actions   || []).forEach(a => actionSet.add(a.action)));
    const sorted = ACTION_ORDER.filter(a => actionSet.has(a))
      .concat([...actionSet].filter(a => !ACTION_ORDER.includes(a)).sort());
    setMatrixActions(sorted);

    // Group menus by module_id
    const menusByMod = {};
    menus.forEach(m => {
      if (!menusByMod[m.module_id]) menusByMod[m.module_id] = [];
      menusByMod[m.module_id].push(m);
    });
    setMatrixModules(mods.map(mod => ({ ...mod, menus: menusByMod[mod.id] || [] })));

    // Persist original rows for diffing on save
    setOriginalPerms(existing);

    // Build draft from existing grants
    const draft = {};
    existing.forEach(p => {
      if (p.module_action_id) draft[`ma_${p.module_action_id}`]   = true;
      if (p.menu_action_id)   draft[`mea_${p.menu_action_id}`]    = true;
    });
    setPermDraft(draft);
    setMatrixLoading(false);
  }, []);

  // Trigger fetch when switching to Permissions tab
  useEffect(() => {
    if (editTab === 'permissions' && editDraft?.id && editDraft?.company_id) {
      fetchMatrixData(editDraft.id, editDraft.company_id);
    }
  }, [editTab, editDraft?.id, editDraft?.company_id, fetchMatrixData]);

  const handlePermToggle = useCallback((updates) => {
    setPermDraft(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSavePermissions = useCallback(async () => {
    if (!editDraft) return;
    setPermSaving(true);
    setPermError(null);

    // Build key→id map from original rows
    const originalKeys = new Set();
    const keyToRowId = {};
    originalPerms.forEach(p => {
      if (p.module_action_id) {
        const k = `ma_${p.module_action_id}`;
        originalKeys.add(k);
        keyToRowId[k] = p.id;
      }
      if (p.menu_action_id) {
        const k = `mea_${p.menu_action_id}`;
        originalKeys.add(k);
        keyToRowId[k] = p.id;
      }
    });

    const newKeys = new Set(Object.entries(permDraft).filter(([, v]) => v).map(([k]) => k));
    const addedKeys   = [...newKeys].filter(k => !originalKeys.has(k));
    const removedKeys = [...originalKeys].filter(k => !newKeys.has(k));

    // DELETE removed
    if (removedKeys.length) {
      const ids = removedKeys.map(k => keyToRowId[k]).filter(Boolean);
      if (ids.length) {
        const { error: delErr } = await supabase.from('user_menu_permissions').delete().in('id', ids);
        if (delErr) { setPermError(`Delete failed: ${delErr.message}`); setPermSaving(false); return; }
      }
    }

    // INSERT added
    if (addedKeys.length) {
      const rows = addedKeys.map(k => {
        const row = { user_id: editDraft.id, company_id: editDraft.company_id };
        if (k.startsWith('ma_'))  row.module_action_id = k.slice(3);
        else                      row.menu_action_id   = k.slice(4);
        return row;
      });
      const { error: insErr } = await supabase.from('user_menu_permissions').insert(rows);
      if (insErr) { setPermError(`Insert failed: ${insErr.message}`); setPermSaving(false); return; }
    }

    setPermSaving(false);
    showToast('Permissions updated.');
    closeEdit();
  }, [editDraft, originalPerms, permDraft, showToast, closeEdit]);

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

    closeAdd();
    refresh();
    showToast(result?.warning ? `User created (with warning: ${result.warning})` : 'User created successfully.');
  }, [addDraft, closeAdd, refresh, showToast]);

  // ── Modal footers ─────────────────────────────────────────────
  // Permissions tab manages its own footer inside PermissionMatrix; pass null here.
  const editFooter = editTab === 'permissions' ? null : (
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
        maxWidth={editTab === 'permissions' ? '960px' : '680px'}
      >
        {editDraft && (
          <div>
            {/* ── Tab switcher ── */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${PASTEL.line}` }}>
              {['profile', 'permissions'].map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditTab(tab)}
                  style={{
                    padding: '8px 18px',
                    border: 'none', borderBottom: editTab === tab ? `2px solid ${NAVY}` : '2px solid transparent',
                    background: 'transparent',
                    color: editTab === tab ? NAVY : PASTEL.inkSoft,
                    fontSize: 13, fontWeight: editTab === tab ? 700 : 400,
                    cursor: 'pointer', marginBottom: -1,
                    transition: 'color .12s',
                  }}
                >
                  {tab === 'profile' ? 'Profile' : 'Permissions'}
                </button>
              ))}
            </div>

            {/* ── Profile tab ── */}
            {editTab === 'profile' && (
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

                    {/* ERP Role — full width */}
                    <div>
                      <FieldLabel>ERP Role</FieldLabel>
                      <FieldSelect value={editDraft.erp_role_id} onChange={(v) => setEditDraft((d) => ({ ...d, erp_role_id: v }))} disabled={editSaving || !editDraft.company_id}>
                        <option value="">— No ERP role —</option>
                        {formOptions.erpRoles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                        ))}
                      </FieldSelect>
                      {!editDraft.company_id && (
                        <p className="text-[10px] mt-1.5" style={{ color: PASTEL.inkMute }}>
                          Select a company first.
                        </p>
                      )}
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

            {/* ── Permissions tab ── */}
            {editTab === 'permissions' && (
              <PermissionMatrix
                matrixModules={matrixModules}
                matrixActions={matrixActions}
                permDraft={permDraft}
                onToggle={handlePermToggle}
                loading={matrixLoading}
                saving={permSaving}
                onSave={handleSavePermissions}
                onCancel={closeEdit}
                permError={permError}
              />
            )}
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
        confirmLabel="Ya, Lanjutkan"
        cancelLabel="Batal"
        variant="warning"
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
