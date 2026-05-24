// src/hooks/useStatusCatalog.js
// Server-side paginated + debounced-search list of status catalog entries.
// Global table — no company_id, no deleted_at.
// Ordered by sort_order (the intended display sequence).
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const STATUS_CATALOG_PAGE_SIZE = 20;

export function useStatusCatalog({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * STATUS_CATALOG_PAGE_SIZE;
    const to = from + STATUS_CATALOG_PAGE_SIZE - 1;

    let query = supabase
      .from('status_catalog')
      .select(
        'id, code, label, description, color_class, is_terminal, sort_order, is_active',
        { count: 'exact' }
      )
      .range(from, to)
      .order('sort_order', { ascending: true });

    if (search.trim()) {
      query = query.or(`code.ilike.%${search.trim()}%,label.ilike.%${search.trim()}%`);
    }

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) {
        console.error('[useStatusCatalog] fetch error:', err);
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
    pageSize: STATUS_CATALOG_PAGE_SIZE,
  };
}
