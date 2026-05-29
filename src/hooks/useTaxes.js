// src/hooks/useTaxes.js
// Server-side paginated + debounced-search list of tax codes.
// Company-scoped. Has deleted_at (soft delete).
// Joins companies(code, name) for the company column.
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const TAXES_PAGE_SIZE = 20;

export function useTaxes({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * TAXES_PAGE_SIZE;
    const to = from + TAXES_PAGE_SIZE - 1;

    let query = supabase
      .from('taxes')
      .select(
        'id, company_id, code, name, rate, tax_type, is_inclusive, is_active, companies(code, name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .range(from, to)
      .order('name', { ascending: true });

    if (search.trim()) {
      query = query.or(`code.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%`);
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        console.error('[useTaxes] fetch error:', err);
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
    pageSize: TAXES_PAGE_SIZE,
  };
}
