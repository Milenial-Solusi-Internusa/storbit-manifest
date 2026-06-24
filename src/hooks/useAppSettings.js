// src/hooks/useAppSettings.js
// DB-backed settings store (replaces the old localStorage settings).
// Reads/writes the `app_settings` table, scoped by (company_id, category, key)
// with a UNIQUE(company_id, category, key) constraint. RLS read+write =
// is_admin_or_above().
//
// Values are stored as jsonb wrapped in { v: <value> } so primitives, objects,
// and arrays all round-trip uniformly; getVal() unwraps `.v`.
//
// Usage:
//   const { getVal, saveSetting, saveSettings, loading } = useAppSettings('general_prefs', companyId);
//   const lang = getVal('lang', 'id');                 // read (with fallback)
//   await saveSetting('lang', 'en');                   // upsert one key
//   await saveSettings({ lang: 'en', tz: 'wib' });     // upsert many keys
//
// `companyId` is optional — defaults to the signed-in user's company. Pass an
// explicit company UUID for per-entity pages (EntitySwitcher).
//
// Pattern: setState only inside .then()/await callbacks (project lint rule).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';

export default function useAppSettings(category, companyIdArg) {
  const { profile } = useAuth();
  const companyId = companyIdArg || profile?.company_id || null;

  const [settings, setSettings] = useState({});   // key -> jsonb value ({ v: ... })
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!category || !companyId) { setSettings({}); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase
      .from('app_settings')
      .select('key, value')
      .eq('category', category)
      .eq('company_id', companyId)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err);
          setSettings({});
        } else {
          const map = {};
          (data || []).forEach((r) => { map[r.key] = r.value; });
          setSettings(map);
          setError(null);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [category, companyId, refreshKey]);

  // getVal — unwrap { v: ... }; return defaultValue when missing.
  const getVal = useCallback((key, defaultValue) => {
    const row = settings[key];
    if (row == null) return defaultValue;
    return (typeof row === 'object' && row !== null && 'v' in row) ? row.v : row;
  }, [settings]);

  // saveSetting — upsert one key.
  const saveSetting = useCallback(async (key, value) => {
    if (!category || !companyId) return { error: new Error('No company scope') };
    const payload = {
      company_id: companyId, category, key,
      value: { v: value },
      updated_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'company_id,category,key' });
    if (err) { setError(err); return { error: err }; }
    setSettings((prev) => ({ ...prev, [key]: { v: value } }));
    return { error: null };
  }, [category, companyId, profile?.id]);

  // saveSettings — batch upsert many keys from an object.
  const saveSettings = useCallback(async (obj) => {
    if (!category || !companyId) return { error: new Error('No company scope') };
    const entries = Object.entries(obj || {});
    if (!entries.length) return { error: null };
    const rows = entries.map(([key, value]) => ({
      company_id: companyId, category, key,
      value: { v: value },
      updated_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error: err } = await supabase
      .from('app_settings')
      .upsert(rows, { onConflict: 'company_id,category,key' });
    if (err) { setError(err); return { error: err }; }
    setSettings((prev) => {
      const next = { ...prev };
      rows.forEach((r) => { next[r.key] = r.value; });
      return next;
    });
    return { error: null };
  }, [category, companyId, profile?.id]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { settings, loading, error, getVal, saveSetting, saveSettings, refresh };
}
