// src/hooks/useBranches.js
// Server-side paginated + debounced-search list of branches.
// Joins companies(code, name) for the company column.
// Filters deleted_at IS NULL (soft delete).
//
// Mutation helpers (createBranch, updateBranch, softDeleteBranch) are exported
// as plain async functions — call them from event handlers, not inside effects.
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const BRANCHES_PAGE_SIZE = 20;

export function useBranches({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * BRANCHES_PAGE_SIZE;
    const to = from + BRANCHES_PAGE_SIZE - 1;

    let query = supabase
      .from('branches')
      .select(
        'id, company_id, code, name, city, is_active, created_at, companies(code, name)',
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
    pageSize: BRANCHES_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Mutation helpers — plain async functions, not hooks.
// RLS constraint: INSERT/UPDATE require is_admin_or_above() and
//   company_id = get_user_company_id(). Cross-company writes will fail with
//   an RLS policy error surfaced to the UI.
// ---------------------------------------------------------------------------

export async function createBranch({ company_id, code, name, city, address, is_active }) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  const { error } = await supabase.from('branches').insert({
    company_id,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    city: city?.trim() || null,
    address: address?.trim() || null,
    is_active: is_active !== false,
    created_by: userId,
  });
  return { error };
}

export async function updateBranch(id, { code, name, city, address, is_active }) {
  const { error } = await supabase
    .from('branches')
    .update({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      city: city?.trim() || null,
      address: address?.trim() || null,
      is_active: is_active !== false,
    })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}

export async function softDeleteBranch(id) {
  const { error } = await supabase
    .from('branches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}
