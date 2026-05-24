// src/hooks/useCompanies.js
// Server-side paginated + debounced-search list of companies.
// Columns selected: only what the list view needs — no SELECT *.
// companies table has no deleted_at (companies are not soft-deleted).
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const COMPANIES_PAGE_SIZE = 20;

export function useCompanies({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * COMPANIES_PAGE_SIZE;
    const to = from + COMPANIES_PAGE_SIZE - 1;

    let query = supabase
      .from('companies')
      .select('id, code, name, business_focus, is_active, created_at', { count: 'exact' })
      .range(from, to)
      .order('name', { ascending: true });

    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        console.error('[useCompanies] fetch error:', err);
        setError(err);
      } else {
        setData(rows || []);
        setTotal(count ?? 0);
        setError(null);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [page, search, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return {
    data,
    total,
    loading,
    error,
    refresh,
    pageSize: COMPANIES_PAGE_SIZE,
  };
}
