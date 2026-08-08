// src/hooks/useDcMaster.js
// Server-side paginated + debounced-search list of DC (Distribution Center)
// master records. Joins companies(code, name) + accounts(name) for the
// company/customer columns. Filters deleted_at IS NULL (soft delete).
// Optional customerId param filters to DCs tied to one specific customer.
//
// Mutation helpers (createDcMaster, updateDcMaster) are exported as plain
// async functions — call them from event handlers, not inside effects.
// No delete/archive helper — out of scope for this page (is_active toggle,
// exposed inside updateDcMaster, is the only deactivation mechanism asked for).
//
// Pattern: all setState calls are inside .then() — never synchronously in the
// effect body. Matches the set-state-in-effect lint rule enforced project-wide.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const DC_MASTER_PAGE_SIZE = 20;

export function useDcMaster({ page = 1, search = '', customerId = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * DC_MASTER_PAGE_SIZE;
    const to = from + DC_MASTER_PAGE_SIZE - 1;

    let query = supabase
      .from('dc_master')
      .select(
        'id, company_id, customer_id, kode, nama, wilayah, alamat, is_active, created_at, accounts(name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .range(from, to)
      .order('nama', { ascending: true });

    if (search.trim()) {
      query = query.or(`nama.ilike.%${search.trim()}%,kode.ilike.%${search.trim()}%`);
    }
    if (customerId) {
      query = query.eq('customer_id', customerId);
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
  }, [page, search, customerId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return {
    data,
    total,
    loading,
    error,
    refresh,
    pageSize: DC_MASTER_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Mutation helpers — plain async functions, not hooks.
// RLS: dc_master_insert/update require authenticated (see schema_snapshot.sql
// dc_master policies) — no extra role gate enforced here beyond that.
// ---------------------------------------------------------------------------

export async function createDcMaster({ company_id, customer_id, kode, nama, wilayah, alamat, is_active }) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  const { error } = await supabase.from('dc_master').insert({
    company_id,
    customer_id: customer_id || null,
    kode: kode?.trim() || null,
    nama: nama.trim(),
    wilayah: wilayah || null,
    alamat: alamat?.trim() || null,
    is_active: is_active !== false,
    created_by: userId,
  });
  return { error };
}

export async function updateDcMaster(id, { customer_id, kode, nama, wilayah, alamat, is_active }) {
  const { error } = await supabase
    .from('dc_master')
    .update({
      customer_id: customer_id || null,
      kode: kode?.trim() || null,
      nama: nama.trim(),
      wilayah: wilayah || null,
      alamat: alamat?.trim() || null,
      is_active: is_active !== false,
    })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}
