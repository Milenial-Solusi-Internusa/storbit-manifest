// src/hooks/useDocumentTypes.js
// Server-side paginated + debounced-search list of document types.
// Company-scoped. No deleted_at on this table.
// Joins companies(code, name) for the company column.
// Ordered by module then code for logical grouping.
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const DOCUMENT_TYPES_PAGE_SIZE = 20;

export function useDocumentTypes({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * DOCUMENT_TYPES_PAGE_SIZE;
    const to = from + DOCUMENT_TYPES_PAGE_SIZE - 1;

    let query = supabase
      .from('document_types')
      .select(
        'id, company_id, code, name, module, department_code, approval_required, is_active, companies(code, name)',
        { count: 'exact' }
      )
      .range(from, to)
      .order('module', { ascending: true })
      .order('code', { ascending: true });

    if (search.trim()) {
      query = query.or(`code.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%`);
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        console.error('[useDocumentTypes] fetch error:', err);
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
    pageSize: DOCUMENT_TYPES_PAGE_SIZE,
  };
}
