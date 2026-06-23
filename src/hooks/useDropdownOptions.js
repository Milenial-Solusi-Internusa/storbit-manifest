// src/hooks/useDropdownOptions.js
// Reusable fetch of active options for ONE dropdown list_key from the
// `dropdown_options` table (DB-driven dropdowns managed in Admin Settings →
// General Preferences → Dropdown Management).
//
// Returns { options: [{ id, label, value }], loading, error }.
// Falls back to the provided `fallback` array when the fetch errors OR returns
// no rows, so consuming forms always have something to render.
//
// Pattern: setState only inside .then() (matches the project-wide
// set-state-in-effect lint rule). Uses the shared supabase client.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useDropdownOptions(listKey, fallback = []) {
  const [options, setOptions] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!listKey) { setOptions(fallback); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    supabase
      .from('dropdown_options')
      .select('id, label, value')
      .eq('list_key', listKey)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .limit(1000)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data || data.length === 0) {
          setError(err || null);
          setOptions(fallback);        // fallback on error OR empty result
        } else {
          setOptions(data);
          setError(null);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
    // `fallback` intentionally excluded — callers pass a literal/const array;
    // re-running on its identity would loop. Re-fetch only when listKey changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  return { options, loading, error };
}
