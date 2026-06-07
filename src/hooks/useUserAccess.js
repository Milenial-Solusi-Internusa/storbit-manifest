// src/hooks/useUserAccess.js
// Server-side paginated + debounced-search list of user profiles with ERP context.
// Fetches profiles with company/branch/dept/position joins, then separately
// fetches user_roles (no direct public-schema FK from profiles → user_roles)
// and merges them client-side.
//
// RLS scope notes:
//   profiles_read:    super_admin reads all; admin reads same-company profiles.
//   user_roles_read:  own assignments, same-company admin, or super_admin.
//   user_roles_insert/update: company_id must equal get_user_company_id().
//     Cross-company role writes require a future elevated policy.
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const USER_ACCESS_PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// ERP role code → legacy profiles.role enum mapping.
// Must only produce values in user_role_legacy enum:
//   'super' | 'logistic' | 'procurement' | 'finance' | 'management'
// Shared with create-user Edge Function (kept in sync manually).
// ---------------------------------------------------------------------------
export const ERP_CODE_TO_LEGACY = {
  super_admin:        'super',
  ceo:                'management',
  gm:                 'management',
  admin:              'management',
  manager:            'management',
  hrga:               'management',
  viewer:             'management',
  supervisor:         'management',
  finance_controller: 'finance',
  finance:            'finance',
  sales:              'logistic',
  operations:         'logistic',
  it:                 'logistic',
  procurement:        'procurement',
};

export function erpCodeToLegacy(code) {
  return ERP_CODE_TO_LEGACY[code] ?? 'management';
}

export function useUserAccess({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * USER_ACCESS_PAGE_SIZE;
    const to = from + USER_ACCESS_PAGE_SIZE - 1;

    // Step 1: fetch profiles with dimension joins
    let profileQuery = supabase
      .from('profiles')
      .select(
        `id, full_name, role, active, mfa_required,
         company_id, branch_id, department_id, position_id,
         companies(id, code, name),
         branches(id, code, name),
         departments(id, code, name),
         positions(id, code, name)`,
        { count: 'exact' }
      )
      .range(from, to)
      .order('full_name', { ascending: true });

    if (search.trim()) {
      profileQuery = profileQuery.ilike('full_name', `%${search.trim()}%`);
    }

    profileQuery.then(({ data: profiles, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        console.error('[useUserAccess] profiles fetch error:', err);
        setError(err);
        setLoading(false);
        return;
      }

      const profileIds = (profiles || []).map((p) => p.id);

      // No results — no need to fetch user_roles
      if (profileIds.length === 0) {
        setData([]);
        setTotal(count ?? 0);
        setError(null);
        setLoading(false);
        return;
      }

      // Step 2: fetch active user_roles for this page's profiles
      // user_roles.user_id → auth.users.id; profiles.id = auth.users.id (same value)
      supabase
        .from('user_roles')
        .select('id, user_id, role_id, is_active, company_id, roles(id, code, name)')
        .in('user_id', profileIds)
        .then(({ data: userRoles, error: roleErr }) => {
          if (cancelled) return;

          if (roleErr) {
            // Non-fatal: show profiles with empty ERP role column
            console.warn('[useUserAccess] user_roles fetch warning:', roleErr);
          }

          // Index user_roles by user_id
          const rolesByUserId = {};
          (userRoles || []).forEach((ur) => {
            if (!rolesByUserId[ur.user_id]) rolesByUserId[ur.user_id] = [];
            rolesByUserId[ur.user_id].push(ur);
          });

          const merged = (profiles || []).map((p) => ({
            ...p,
            user_roles: rolesByUserId[p.id] || [],
          }));

          setData(merged);
          setTotal(count ?? 0);
          setError(null);
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, [page, search, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { data, total, loading, error, refresh, pageSize: USER_ACCESS_PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// toggleUserActive — quick activate / deactivate without touching ERP roles.
// ---------------------------------------------------------------------------
export async function toggleUserActive(profileId, active) {
  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', profileId);
  return { error };
}

// ---------------------------------------------------------------------------
// createUser — invokes the create-user Edge Function.
// The Edge Function uses service_role to:
//   - call auth.admin.createUser()
//   - update the profile row (full_name, company_id, branch_id, dept_id, pos_id, legacy role)
//   - upsert user_roles (service role bypasses cross-company RLS for super_admin)
// Returns { data: { id } } on success, { error } on failure.
// ---------------------------------------------------------------------------
export async function createUser({
  email, password, full_name, company_id,
  erp_role_id,
  branch_id     = null,
  department_id = null,
  position_id   = null,
}) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, password, full_name, company_id, erp_role_id, branch_id, department_id, position_id },
  });

  if (error) {
    // supabase.functions.invoke wraps non-2xx responses in a FunctionsHttpError.
    // error.message is always the generic "Edge Function returned a non-2xx status code".
    // The actual error body from our function (e.g. "Forbidden. Only super admin...")
    // is in error.context (the raw Response). Extract it so the UI shows a useful message.
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* response body not JSON-parseable — keep generic message */ }
    return { error: { message } };
  }

  if (data?.error) return { error: { message: data.error } };
  return { data };
}

// ---------------------------------------------------------------------------
// Edit form dropdown helpers — one-shot async fetchers (not hooks).
// Called on drawer open and on company change; never on every render.
// ---------------------------------------------------------------------------

export async function fetchAllCompanies() {
  const { data, error } = await supabase
    .from('companies')
    .select('id, code, name')
    .eq('is_active', true)
    .order('name');
  return { data: data || [], error };
}

export async function fetchBranchesForCompany(companyId) {
  if (!companyId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('branches')
    .select('id, code, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  return { data: data || [], error };
}

export async function fetchDepartmentsForCompany(companyId) {
  if (!companyId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  return { data: data || [], error };
}

export async function fetchPositionsForCompany(companyId) {
  if (!companyId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('positions')
    .select('id, code, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  return { data: data || [], error };
}

export async function fetchRolesForCompany(companyId) {
  if (!companyId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('roles')
    .select('id, code, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');
  return { data: data || [], error };
}

// ---------------------------------------------------------------------------
// saveUserAccess
//
// Atomically updates a user's profile fields and (optionally) their primary
// ERP role assignment.
//
// profilePatch:   partial profiles row to UPDATE
// newErpRoleId:   undefined = skip ERP role entirely (user didn't change it)
//                 null      = deactivate all active ERP roles, assign none
//                 <uuid>    = deactivate all, upsert this role as active
// companyId:      the target user's company_id (needed for user_roles INSERT RLS)
//
// RLS constraint: user_roles_insert/update requires
//   company_id = get_user_company_id()
// Cross-company role assignment will return an RLS policy error, which is
// surfaced to the UI. This is expected behavior for Phase 1.0G MVP.
//
// Partial failure: profile UPDATE in Step 1 commits before ERP role update
// in Step 2. If Step 2 fails, profile changes are persisted. The UI shows
// the error; the user can retry the save or correct the role separately.
// ---------------------------------------------------------------------------
export async function saveUserAccess({ profileId, profilePatch, newErpRoleId, companyId }) {
  // If ERP role changed, resolve its code and derive legacy profiles.role
  let patchWithRole = { ...profilePatch };
  if (newErpRoleId) {
    const { data: roleRow } = await supabase
      .from('roles')
      .select('code')
      .eq('id', newErpRoleId)
      .single();
    if (roleRow?.code) {
      patchWithRole.role = erpCodeToLegacy(roleRow.code);
    }
  }

  // Step 1: Update the profiles row
  const { error: profileErr } = await supabase
    .from('profiles')
    .update(patchWithRole)
    .eq('id', profileId);

  if (profileErr) return { error: profileErr };

  // Step 2: ERP role assignment — skip if caller passed undefined (no change)
  if (newErpRoleId === undefined) return { error: null };

  // Resolve current session user for audit fields (revoked_by / granted_by)
  const { data: { session } } = await supabase.auth.getSession();
  const currentUserId = session?.user?.id || null;
  const now = new Date().toISOString();

  // Deactivate all currently active user_roles for this user.
  // RLS: only affects rows where company_id = get_user_company_id().
  const { error: deactivateErr } = await supabase
    .from('user_roles')
    .update({ is_active: false, revoked_at: now, revoked_by: currentUserId })
    .eq('user_id', profileId)
    .eq('is_active', true);

  if (deactivateErr) return { error: deactivateErr };

  // Insert or reactivate the chosen ERP role (only if one was selected)
  if (newErpRoleId && companyId) {
    const { error: upsertErr } = await supabase
      .from('user_roles')
      .upsert(
        {
          user_id:    profileId,
          role_id:    newErpRoleId,
          company_id: companyId,
          is_active:  true,
          granted_at: now,
          granted_by: currentUserId,
        },
        { onConflict: 'user_id,role_id,company_id' }
      );
    if (upsertErr) return { error: upsertErr };
  }

  return { error: null };
}
