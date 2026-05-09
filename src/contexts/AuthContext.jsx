// src/contexts/AuthContext.jsx
// Global auth state — wrap App di main.jsx, akses via useAuth() di mana aja.

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// Helper: query profile pake user ID langsung (no auth call needed)
async function fetchProfileById(userId) {
  console.log('[fetchProfileById] querying for:', userId);
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId);
  console.log('[fetchProfileById] result:', data, 'err:', error);
  if (error) return { data: null, error };
  return { data: data?.[0] || null, error: null };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
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
          fetchProfileById(s.user.id).then(({ data, error }) => {
            if (!mounted) return;
            if (error) console.error('[Auth] profile error:', error);
            setProfile(data);
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
          fetchProfileById(s.user.id).then(({ data, error }) => {
            if (!mounted) return;
            if (error) console.error('[Auth] profile error:', error);
            setProfile(data);
          });
        }, 0);
      } else {
        setProfile(null);
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
    const { data } = await fetchProfileById(session.user.id);
    setProfile(data);
  };

  const value = {
    session,
    profile,
    loading,
    authError,
    isAuthenticated: !!session && !!profile && profile.active,
    role: profile?.role || null,
    user: session?.user || null,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
