// src/contexts/AuthContext.jsx
// Global auth state — wrap App di main.jsx, akses via useAuth() di mana aja.

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './authCtx';

// ERP role priority — highest privilege wins when user has multiple active roles
const ERP_ROLE_PRIORITY = [
  'super_admin','admin','ceo','gm','manager',
  'finance_controller','finance','operations',
  'sales','procurement','hrga','it','viewer',
];

function pickPrimaryErpRole(userRoles) {
  if (!userRoles?.length) return null;
  // Sort by priority index (lower = higher privilege)
  const sorted = [...userRoles].sort((a, b) => {
    const ai = ERP_ROLE_PRIORITY.indexOf(a.roles?.code ?? '');
    const bi = ERP_ROLE_PRIORITY.indexOf(b.roles?.code ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return sorted[0];
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
  const [permissionsLoading, setPermissionsLoading] = useState(true); // true while per-user menu permissions are loading

  // Tracks the last authenticated user id. Distinguishes a genuine user change
  // (first sign-in, or user B replacing user A) from a redundant 'SIGNED_IN' /
  // 'TOKEN_REFRESHED' re-emit that Supabase fires on every tab refocus, token
  // refresh, and cross-tab BroadcastChannel message. Only a genuine change may
  // setLoading(true) — that unmounts <App/> via AuthGate and wipes in-progress
  // form state (local useState).
  const previousUserIdRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Safety timeout (8s): forcing loading=false');
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
          fetchProfileById(s.user.id).then(({ data, erpRoles: roles, error }) => {
            if (!mounted) return;
            if (error) console.error('[Auth] profile error:', error);
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
    }).catch((err) => {
      console.error('[Auth] getSession error:', err);
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
      // On in-tab SIGNED_IN (user B logs in without a refresh), hold `loading`
      // until the new profile is ready — same gating as the getSession path —
      // so App doesn't render against the previous user's context (Fix 2.3E).
      // Only for SIGNED_IN: do NOT toggle loading on INITIAL_SESSION /
      // USER_UPDATED (would flash the loading screen).
      if (event === 'SIGNED_IN') setLoading(true);
      // Defer to next tick supaya gak block listener
      setTimeout(() => {
        if (!mounted) return;
        fetchProfileById(s.user.id).then(({ data, erpRoles: roles, error }) => {
          if (!mounted) return;
          if (error) console.error('[Auth] profile error:', error);
          setProfile(data);
          setErpRoles(roles || []);
          if (event === 'SIGNED_IN') setLoading(false);
        }).catch((err) => {
          console.error('[Auth] profile fetch failed:', err);
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
    return { ok: true, data };
  };

  const signOut = async () => {
    // Clear user-specific app state so the next user in this browser doesn't
    // inherit the previous user's last menu/module (these keys are not scoped
    // by user id and survive logout otherwise).
    localStorage.removeItem('nexus_last_menu');
    localStorage.removeItem('nexus_last_module');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Auth] Sign out error:', error);
    }
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

  // Re-fetch permissions whenever erpRoles changes (login / role change)
  useEffect(() => {
    const primary = pickPrimaryErpRole(erpRoles);
    const roleId  = primary?.role_id;
    fetchPermissionsForRoleId(roleId);
  }, [erpRoles, fetchPermissionsForRoleId]);

  // Manual refresh (kalau ada admin update profile dari panel lain)
  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data, erpRoles: roles } = await fetchProfileById(session.user.id);
    setProfile(data);
    setErpRoles(roles || []);
  };

  const refreshPermissions = useCallback(() => {
    const primary = pickPrimaryErpRole(erpRoles);
    fetchPermissionsForRoleId(primary?.role_id);
  }, [erpRoles, fetchPermissionsForRoleId]);

  // Primary ERP role code, sourced solely from user_roles (legacy profiles.role
  // fallback removed — that column is being deprecated).
  const primaryErpRole = pickPrimaryErpRole(erpRoles);
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

  // ── Fetch per-user menu permissions ───────────────────────────────────────
  const fetchMenuPermissions = useCallback(async (userId) => {
    if (!userId) { setMenuPermissions([]); setPermissionsLoading(false); return; }
    setPermissionsLoading(true);
    try {
      const { data } = await supabase
        .from('user_menu_permissions')
        .select('id, is_cross_entity, module_action_id, menu_actions(id, action, menu_id, module_menus(id, key)), module_actions(id, action, module_id, modules!module_actions_module_id_fkey(id, key))')
        .eq('user_id', userId)
        .limit(1000);
      setMenuPermissions(data || []);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  // Re-fetch per-user menu permissions whenever the session changes.
  // permissionsLoading is managed inside fetchMenuPermissions (async — not the
  // effect body) so menu-gated UI can wait for it before allowing clicks.
  useEffect(() => {
    fetchMenuPermissions(session?.user?.id || null);
  }, [session, fetchMenuPermissions]);

  // hasMenuPermission — check per-user menu permission via user_menu_permissions table.
  // Supports both menu-level (module_menus.key) and module-level (modules.key) checks.
  // super_admin always returns true.
  const hasMenuPermission = useCallback((menuKey, action) => {
    if (erpRoleCode === 'super_admin') return true;
    return menuPermissions.some(p => {
      // menu-level check
      if (p.menu_actions?.module_menus?.key === menuKey &&
          p.menu_actions?.action === action) return true;
      // module-level check
      if (p.module_actions?.modules?.key === menuKey &&
          p.module_actions?.action === action) return true;
      return false;
    });
  }, [menuPermissions, erpRoleCode]);

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
    // Permission helpers
    userPermissions,
    hasPermission,
    isCrossEntity,
    refreshPermissions,
    // Per-user menu permission helpers
    menuPermissions,
    permissionsLoading,
    hasMenuPermission,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

