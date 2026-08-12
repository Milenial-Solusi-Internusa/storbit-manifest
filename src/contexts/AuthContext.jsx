// src/contexts/AuthContext.jsx
// Global auth state — wrap App di main.jsx, akses via useAuth() di mana aja.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { logAudit, ACTION_TYPES, ENTITY_TYPES } from '../lib/auditLogger';
import { AuthContext } from './authCtx';

// ERP role priority — highest privilege wins when user has multiple active roles
const ERP_ROLE_PRIORITY = [
  'super_admin','admin','ceo','gm','gm_bd','manager','supervisor',
  'finance_controller','finance','operations',
  'sales','procurement','hrga','it','viewer',
];

// activeCompanyId-aware: only roles held IN the active company are eligible.
// Today every user's roles all share one company_id (their home company), so
// this filter is a no-op vs the old unfiltered version — see AuthContext's
// activeCompanyId comment for why.
function pickPrimaryErpRole(userRoles, activeCompanyId) {
  const scoped = (userRoles || []).filter(r => r.company_id === activeCompanyId);
  if (!scoped.length) return null;
  // Sort by priority index (lower = higher privilege)
  const sorted = [...scoped].sort((a, b) => {
    const ai = ERP_ROLE_PRIORITY.indexOf(a.roles?.code ?? '');
    const bi = ERP_ROLE_PRIORITY.indexOf(b.roles?.code ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return sorted[0];
}

// matchesMenuAction — shared predicate for user_menu_permissions and
// role_menu_permissions rows (same nested-embed shape): does this row cover
// the given menuKey+action, at either menu-level (module_menus.key) or
// module-level (modules.key)?
function matchesMenuAction(row, menuKey, action) {
  if (row.menu_actions?.module_menus?.key === menuKey &&
      row.menu_actions?.action === action) return true;
  if (row.module_actions?.modules?.key === menuKey &&
      row.module_actions?.action === action) return true;
  return false;
}

// Helper: fetch profile + active ERP roles for a user
async function fetchProfileById(userId) {
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId),
    supabase
      .from('user_roles')
      .select('id, role_id, company_id, roles(id, code, name)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('valid_until', null)
      .limit(10),
  ]);
  if (profileRes.error) return { data: null, erpRoles: [], error: profileRes.error };
  return {
    data:     profileRes.data?.[0] || null,
    erpRoles: rolesRes.data || [],
    error:    null,
  };
}

export function AuthProvider({ children }) {
  const [session,          setSession]          = useState(null);
  const [profile,          setProfile]          = useState(null);
  const [erpRoles,         setErpRoles]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [authError,        setAuthError]        = useState(null);
  const [userPermissions,  setUserPermissions]  = useState([]); // role_permissions rows for primary ERP role
  const [menuPermissions,  setMenuPermissions]  = useState([]); // user_menu_permissions rows for this user
  const [roleMenuPermissions, setRoleMenuPermissions] = useState([]); // role_menu_permissions rows for all active roles (role-level default)
  const [permissionsLoading, setPermissionsLoading] = useState(true); // true while per-user menu permissions are loading
  const [isBnfAuthorized, setIsBnfAuthorized] = useState(false); // is_bnf_authorized() RPC result — gates the 'bnf' menu item (see App.jsx canSeeMenuItem)
  const [bnfAuthLoading,  setBnfAuthLoading]  = useState(true);  // true while is_bnf_authorized() is loading — same defer-until-loaded discipline as permissionsLoading
  // null = no override, "active company" follows profile.company_id (home).
  // Not set by any UI yet (multi-entity switcher is a separate phase) — exposed
  // as activeCompanyId/setActiveCompanyId in `value` below for that future work.
  const [activeCompanyIdOverride, setActiveCompanyId] = useState(null);

  // Tracks the last authenticated user id. Distinguishes a genuine user change
  // (first sign-in, or user B replacing user A) from a redundant 'SIGNED_IN' /
  // 'TOKEN_REFRESHED' re-emit that Supabase fires on every tab refocus, token
  // refresh, and cross-tab BroadcastChannel message. Only a genuine change may
  // setLoading(true) — that unmounts <App/> via AuthGate and wipes in-progress
  // form state (local useState).
  const previousUserIdRef = useRef(null);

  // activeCompanyId: home company by default, or the explicit override once a
  // future multi-entity switcher calls setActiveCompanyId. Computed inline
  // (not synced via a separate effect) so it's always consistent with
  // `profile` in the same render — no one-render-stale window.
  const activeCompanyId = activeCompanyIdOverride ?? profile?.company_id ?? null;
  // Distinct companies where the user holds an active role — raw material for
  // a future company switcher UI (not consumed anywhere yet in this phase).
  const myCompanyIds = [...new Set(erpRoles.map(r => r.company_id).filter(Boolean))];

  useEffect(() => {
    let mounted = true;

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 8000);

    // 1. Initial session check (no async/await chain — pake .then biar gak deadlock)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);

      if (s?.user) {
        previousUserIdRef.current = s.user.id;
        // Defer profile fetch ke next tick (avoid deadlock with onAuthStateChange)
        setTimeout(() => {
          if (!mounted) return;
          fetchProfileById(s.user.id).then(({ data, erpRoles: roles }) => {
            if (!mounted) return;
            setProfile(data);
            setErpRoles(roles || []);
            setLoading(false);
            clearTimeout(safetyTimeout);
          });
        }, 0);
      } else {
        previousUserIdRef.current = null;
        setLoading(false);
        clearTimeout(safetyTimeout);
      }
    }).catch(() => {
      if (mounted) {
        setLoading(false);
        clearTimeout(safetyTimeout);
      }
    });

    // 2. Subscribe ke auth state changes — JANGAN pake async/await di callback
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;

      const newUserId = s?.user?.id ?? null;

      // ── No session (SIGNED_OUT / session expired) → clear everything ─────────
      if (!newUserId) {
        previousUserIdRef.current = null;
        setSession(s);
        setProfile(null);
        setErpRoles([]);
        setActiveCompanyId(null); // clear any override so it can't leak to the next login
        return;
      }

      // ── Same-user re-emit (tab refocus / token refresh / cross-tab broadcast) ─
      // Supabase re-emits 'SIGNED_IN' every time the tab regains visibility
      // (internal visibilitychange + BroadcastChannel) and 'TOKEN_REFRESHED' on
      // background refresh. These are NOT real logins. Skip setLoading(true) and
      // the profile re-fetch — otherwise AuthGate unmounts <App/> and wipes any
      // in-progress form (local useState). Keep the token fresh, but only swap
      // the session reference when access_token actually changed, to avoid
      // needlessly re-running useEffect([session]) → fetchMenuPermissions.
      if (newUserId === previousUserIdRef.current) {
        setSession(prev => (prev?.access_token === s?.access_token ? prev : s));
        return;
      }

      // ── Genuine user change: first sign-in this tab, or user B replacing A ───
      previousUserIdRef.current = newUserId;
      setSession(s);
      setActiveCompanyId(null); // user B must not inherit user A's override
      // On in-tab SIGNED_IN (user B logs in without a refresh), hold `loading`
      // until the new profile is ready — same gating as the getSession path —
      // so App doesn't render against the previous user's context (Fix 2.3E).
      // Only for SIGNED_IN: do NOT toggle loading on INITIAL_SESSION /
      // USER_UPDATED (would flash the loading screen).
      if (event === 'SIGNED_IN') setLoading(true);
      // Defer to next tick supaya gak block listener
      setTimeout(() => {
        if (!mounted) return;
        fetchProfileById(s.user.id).then(({ data, erpRoles: roles }) => {
          if (!mounted) return;
          setProfile(data);
          setErpRoles(roles || []);
          if (event === 'SIGNED_IN') setLoading(false);
        }).catch(() => {
          if (mounted && event === 'SIGNED_IN') setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      return { ok: false, error };
    }
    // Audit: real login only (signInWithPassword success). Role/company not yet
    // loaded at this point — logged best-effort (email + user id).
    logAudit(supabase, {
      action: ACTION_TYPES.LOGIN,
      entityType: ENTITY_TYPES.USER,
      entityId: data?.user?.id ?? null,
      entityLabel: data?.user?.email ?? null,
    }, { id: data?.user?.id, email: data?.user?.email, role: null, companyId: null });
    return { ok: true, data };
  };

  const signOut = async () => {
    // Audit: log LOGOUT BEFORE signing out (and await) so the insert still runs
    // while authenticated (audit_logs insert requires authenticated).
    const primary = pickPrimaryErpRole(erpRoles, activeCompanyId);
    await logAudit(supabase, {
      action: ACTION_TYPES.LOGOUT,
      entityType: ENTITY_TYPES.USER,
      entityId: session?.user?.id ?? null,
      entityLabel: session?.user?.email ?? null,
    }, { id: session?.user?.id, email: session?.user?.email, role: primary?.roles?.code ?? null, companyId: profile?.company_id ?? null });
    // Clear user-specific app state so the next user in this browser doesn't
    // inherit the previous user's last menu/module (these keys are not scoped
    // by user id and survive logout otherwise).
    localStorage.removeItem('nexus_last_menu');
    localStorage.removeItem('nexus_last_module');
    await supabase.auth.signOut();
  };

  // ── Fetch permissions for the primary ERP role ─────────────────────────────
  const fetchPermissionsForRoleId = useCallback(async (roleId) => {
    if (!roleId) { setUserPermissions([]); return; }
    const { data } = await supabase
      .from('role_permissions')
      .select('id, is_cross_entity, permissions(id, module, action)')
      .eq('role_id', roleId)
      .limit(1000);
    setUserPermissions(data || []);
  }, []);

  // Manual refresh (kalau ada admin update profile dari panel lain)
  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data, erpRoles: roles } = await fetchProfileById(session.user.id);
    setProfile(data);
    setErpRoles(roles || []);
  };

  const refreshPermissions = useCallback(() => {
    const primary = pickPrimaryErpRole(erpRoles, activeCompanyId);
    fetchPermissionsForRoleId(primary?.role_id);
  }, [erpRoles, activeCompanyId, fetchPermissionsForRoleId]);

  // Primary ERP role code, sourced solely from user_roles (legacy profiles.role
  // fallback removed — that column is being deprecated). Scoped to the active
  // company — see pickPrimaryErpRole.
  const primaryErpRole = pickPrimaryErpRole(erpRoles, activeCompanyId);
  const erpRoleCode    = primaryErpRole?.roles?.code || null;

  // hasPermission — returns true if user has the given module+action in their role_permissions.
  // super_admin always returns true.
  const hasPermission = useCallback((module, action) => {
    if (erpRoleCode === 'super_admin') return true;
    return userPermissions.some(p =>
      p.permissions?.module === module &&
      p.permissions?.action === action
    );
  }, [userPermissions, erpRoleCode]);

  // ── Fetch per-user + role-level menu permissions ────────────────────────────
  // 3-tier resolution (see hasMenuPermission below): user_menu_permissions row
  // wins outright, grant or deny → role_menu_permissions union across ALL
  // active roles (role-level default, grant-only, no deny concept there) →
  // deny. erpRoles is read from closure (dep array below) rather than passed
  // in, so the role_menu_permissions query always uses the latest active-role
  // list without changing this function's call sites.
  const fetchMenuPermissions = useCallback(async (userId) => {
    if (!userId) {
      setMenuPermissions([]);
      setRoleMenuPermissions([]);
      setPermissionsLoading(false);
      return;
    }
    setPermissionsLoading(true);
    try {
      // Only roles held in the active company feed the tier-3 (role default)
      // union — see activeCompanyId above.
      const roleIds = erpRoles
        .filter(r => r.company_id === activeCompanyId)
        .map(r => r.role_id)
        .filter(Boolean);
      const [userRes, roleRes] = await Promise.all([
        supabase
          .from('user_menu_permissions')
          .select('id, effect, is_cross_entity, module_action_id, menu_actions(id, action, menu_id, module_menus(id, key)), module_actions(id, action, module_id, modules!module_actions_module_id_fkey(id, key))')
          .eq('user_id', userId)
          .limit(1000),
        roleIds.length
          ? supabase
              .from('role_menu_permissions')
              .select('id, menu_action_id, module_action_id, menu_actions(id, action, menu_id, module_menus(id, key)), module_actions(id, action, module_id, modules!module_actions_module_id_fkey(id, key))')
              .in('role_id', roleIds)
              .limit(1000)
          : Promise.resolve({ data: [] }),
      ]);
      setMenuPermissions(userRes.data || []);
      setRoleMenuPermissions(roleRes.data || []);
    } finally {
      setPermissionsLoading(false);
    }
  }, [erpRoles, activeCompanyId]);

  // Re-fetch per-user + role-level menu permissions whenever session changes.
  // Also reacts to erpRoles/activeCompanyId changing: fetchMenuPermissions
  // depends on both (for the role_menu_permissions query), so its identity
  // changes whenever either does, which re-runs this effect transitively —
  // neither needs to be listed here directly.
  // permissionsLoading is managed inside fetchMenuPermissions (async — not the
  // effect body) so menu-gated UI can wait for it before allowing clicks.
  useEffect(() => {
    fetchMenuPermissions(session?.user?.id || null);
  }, [session, fetchMenuPermissions]);

  // ── Fetch is_bnf_authorized() once per session ──────────────────────────────
  // Gates the 'bnf' menu item (App.jsx canSeeMenuItem special-case). Kept
  // separate from BriefingHarianPage.jsx's own page-internal call to the same
  // RPC (that one gates its Overview tab content, not the sidebar, and can't
  // run before a page mounts) — accepted trade-off, not consolidated. The RPC
  // reads only auth.uid()/get_user_company_id() server-side, so no erpRoles/
  // activeCompanyId dependency is needed here, unlike fetchMenuPermissions.
  const fetchBnfAuthorized = useCallback(async (userId) => {
    if (!userId) {
      setIsBnfAuthorized(false);
      setBnfAuthLoading(false);
      return;
    }
    setBnfAuthLoading(true);
    try {
      const { data, error } = await supabase.rpc('is_bnf_authorized');
      if (error) {
        console.error('[AuthContext] is_bnf_authorized failed:', error.message);
        setIsBnfAuthorized(false);
        return;
      }
      setIsBnfAuthorized(!!data);
    } finally {
      setBnfAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    // Same accepted fetch-on-session-change shape as fetchMenuPermissions
    // immediately above (also flagged by this rule, left as-is there too) —
    // not a new pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBnfAuthorized(session?.user?.id || null);
  }, [session, fetchBnfAuthorized]);

  // hasMenuPermission — 3-tier resolution:
  //   1. super_admin → always true.
  //   2. user_menu_permissions row matches → wins outright, effect decides
  //      (grant → true, deny → false). Does NOT fall through to step 3.
  //   3. No user-level match → role_menu_permissions union across ALL active
  //      roles (not just the primary/highest one — a match on ANY active role
  //      grants access). Role-level rows are grant-only.
  //   4. No match anywhere → false (default-deny).
  const hasMenuPermission = useCallback((menuKey, action) => {
    if (erpRoleCode === 'super_admin') return true;

    const userMatch = menuPermissions.find(p => matchesMenuAction(p, menuKey, action));
    if (userMatch) return userMatch.effect !== 'deny';

    return roleMenuPermissions.some(p => matchesMenuAction(p, menuKey, action));
  }, [menuPermissions, roleMenuPermissions, erpRoleCode]);

  // isCrossEntity — returns true if the role has cross-entity access for this module.
  // super_admin always returns true.
  const isCrossEntity = useCallback((module) => {
    if (erpRoleCode === 'super_admin') return true;
    return userPermissions.some(p =>
      p.permissions?.module === module &&
      p.is_cross_entity === true
    );
  }, [userPermissions, erpRoleCode]);

  const value = {
    session,
    profile,
    loading,
    authError,
    isAuthenticated: !!session && !!profile && profile.active,
    // erpRoles: full list of active ERP role assignments
    erpRoles,
    // erpRole: primary ERP role code (highest-privilege), e.g. 'super_admin'
    erpRole: erpRoleCode,
    // role: backward-compat alias for erpRole — used throughout App.jsx
    role: erpRoleCode,
    user: session?.user || null,
    // activeCompanyId: home company by default, or an explicit override once a
    // future multi-entity switcher calls setActiveCompanyId (not called by any
    // UI yet). myCompanyIds: distinct companies where the user holds a role.
    activeCompanyId,
    setActiveCompanyId,
    myCompanyIds,
    // Permission helpers
    userPermissions,
    hasPermission,
    isCrossEntity,
    refreshPermissions,
    // Per-user + role-level menu permission helpers
    menuPermissions,
    roleMenuPermissions,
    permissionsLoading,
    hasMenuPermission,
    // is_bnf_authorized() RPC result — see fetchBnfAuthorized above.
    isBnfAuthorized,
    bnfAuthLoading,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

