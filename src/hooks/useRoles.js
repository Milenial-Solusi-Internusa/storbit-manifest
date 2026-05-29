// src/hooks/useRoles.js
// Server-side paginated + debounced-search list of ERP roles.
// Joins companies(code, name) for the company column.
// Filters deleted_at IS NULL (soft delete).
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const ROLES_PAGE_SIZE = 20;

export function useRoles({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * ROLES_PAGE_SIZE;
    const to = from + ROLES_PAGE_SIZE - 1;

    let query = supabase
      .from('roles')
      .select(
        'id, company_id, code, name, description, is_system_role, is_active, created_at, companies(code, name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .range(from, to)
      .order('name', { ascending: true });

    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        console.error('[useRoles] fetch error:', err);
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
    pageSize: ROLES_PAGE_SIZE,
  };
}
