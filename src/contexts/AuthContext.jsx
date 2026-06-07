// src/contexts/AuthContext.jsx
// Global auth state — wrap App di main.jsx, akses via useAuth() di mana aja.

import { useState, useEffect } from 'react';
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
  console.log('[fetchProfileById] querying for:', userId);
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
  console.log('[fetchProfileById] result:', profileRes.data, 'err:', profileRes.error);
  if (profileRes.error) return { data: null, erpRoles: [], error: profileRes.error };
  return {
    data:     profileRes.data?.[0] || null,
    erpRoles: rolesRes.data || [],
    error:    null,
  };
}

export function AuthProvider({ children }) {
  const [session,   setSession]   = useState(null);
  const [profile,   setProfile]   = useState(null);
  const [erpRoles,  setErpRoles]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let mounted = true;
    console.log('[Auth] useEffect start');

    // Safety timeout
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Safety timeout (8s): forcing loading=false');
        setLoading(false);
      }
    }, 8000);

    // 1. Initial session check (no async/await chain — pake .then biar gak deadlock)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] getSession returned:', s ? 'session exists' : 'no session');
      if (!mounted) return;
      setSession(s);

      if (s?.user) {
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
      console.log('[Auth] onAuthStateChange:', event, s ? 'with session' : 'no session');
      if (!mounted) return;
      setSession(s);

      if (s?.user) {
        // Defer to next tick supaya gak block listener
        setTimeout(() => {
          if (!mounted) return;
          fetchProfileById(s.user.id).then(({ data, erpRoles: roles, error }) => {
            if (!mounted) return;
            if (error) console.error('[Auth] profile error:', error);
            setProfile(data);
            setErpRoles(roles || []);
          });
        }, 0);
      } else {
        setProfile(null);
        setErpRoles([]);
      }
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
    console.log('[Auth] signOut called');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[Auth] Sign out error:', error);
    }
  };

  // Manual refresh (kalau ada admin update profile dari panel lain)
  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data, erpRoles: roles } = await fetchProfileById(session.user.id);
    setProfile(data);
    setErpRoles(roles || []);
  };

  // Derive primary ERP role code; fall back to legacy profiles.role for users
  // not yet migrated to user_roles.
  const primaryErpRole = pickPrimaryErpRole(erpRoles);
  const erpRoleCode    = primaryErpRole?.roles?.code || profile?.role || null;

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
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

