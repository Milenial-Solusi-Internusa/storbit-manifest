// src/hooks/usePositions.js
// Server-side paginated + debounced-search list of positions.
// Joins companies(code, name) and departments(code, name).
// Filters deleted_at IS NULL (soft delete).
//
// Mutation helpers (createPosition, updatePosition, softDeletePosition) and a
// form helper (fetchDepartmentsForPositionForm) are exported as plain async
// functions — call from event handlers, not inside effects.
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const POSITIONS_PAGE_SIZE = 20;

export const POSITION_LEVELS = [
  'Staff',
  'Supervisor',
  'Manager',
  'Head',
  'Director',
];

export function usePositions({ page = 1, search = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * POSITIONS_PAGE_SIZE;
    const to = from + POSITIONS_PAGE_SIZE - 1;

    let query = supabase
      .from('positions')
      .select(
        'id, company_id, department_id, code, name, level, is_active, created_at, companies(code, name), departments(code, name)',
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
    pageSize: POSITIONS_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Form helper — fetch active departments for the position form's optional
// department dropdown. Filtered to the selected company.
// ---------------------------------------------------------------------------

export async function fetchDepartmentsForPositionForm(companyId) {
  if (!companyId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name');

  return { data: data || [], error };
}

// ---------------------------------------------------------------------------
// Mutation helpers
// RLS: INSERT/UPDATE require is_admin_or_above() and company_id = get_user_company_id().
// level must be one of the 5 CHECK constraint values (enforced at DB level).
// ---------------------------------------------------------------------------

export async function createPosition({ company_id, department_id, code, name, level, is_active }) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  const { error } = await supabase.from('positions').insert({
    company_id,
    department_id: department_id || null,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    level: level || 'Staff',
    is_active: is_active !== false,
    created_by: userId,
  });
  return { error };
}

export async function updatePosition(id, { department_id, code, name, level, is_active }) {
  const { error } = await supabase
    .from('positions')
    .update({
      department_id: department_id || null,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      level: level || 'Staff',
      is_active: is_active !== false,
    })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}

export async function softDeletePosition(id) {
  const { error } = await supabase
    .from('positions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}
