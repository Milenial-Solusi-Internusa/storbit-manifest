// src/hooks/useSalesTargets.js
// Server-side paginated list of sales targets (per salesperson per month).
// Joins companies(code, name) for the company column; nama salesperson diambil
// lewat query `profiles` TERPISAH, bukan embed FK.
//
// ⚠️ Kenapa nama salesperson TIDAK di-embed: embed `… → profiles` lewat
// PostgREST sudah pernah gagal di repo ini dengan "Could not find a relationship
// … in the schema cache" meski FK-nya ada dan schema cache sudah di-reload
// (30 Agu 2026, inquiries.owner_id). Pola dua-query dengan id di-dedup adalah
// jalan yang sudah terbukti dan dipakai PipelineKanbanPage + CRMDashboardPage.
// Embed `companies(...)` DIPERTAHANKAN karena itu pola yang memang jalan di
// useDepartments/useBranches.
//
// Struktur file ini klon useDepartments.js: semua setState di dalam .then(),
// tidak pernah sinkron di badan effect (aturan lint set-state-in-effect).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const SALES_TARGETS_PAGE_SIZE = 20;

export function useSalesTargets({ page = 1, year = null, userId = '' } = {}) {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * SALES_TARGETS_PAGE_SIZE;
    const to = from + SALES_TARGETS_PAGE_SIZE - 1;

    let query = supabase
      .from('sales_targets')
      .select(
        'id, company_id, user_id, period_year, period_month, target_value, target_deals, notes, is_active, created_at, companies(code, name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .range(from, to)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });

    if (year) query = query.eq('period_year', year);
    if (userId) query = query.eq('user_id', userId);

    query.then(({ data: rows, count, error: err }) => {
      if (cancelled) return;
      if (err) { setError(err); setLoading(false); return; }

      const list = rows || [];
      const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))];
      if (!ids.length) {
        setData(list);
        setTotal(count ?? 0);
        setError(null);
        setLoading(false);
        return;
      }

      // Query kedua — satu kali untuk seluruh halaman, id sudah di-dedup.
      // Jumlah query tidak tumbuh mengikuti jumlah baris (nol N+1).
      supabase.from('profiles').select('id, full_name').in('id', ids).limit(1000)
        .then(({ data: profs }) => {
          if (cancelled) return;
          const nameById = {};
          (profs || []).forEach((p) => { nameById[p.id] = p.full_name; });
          setData(list.map((r) => ({ ...r, user_name: nameById[r.user_id] || null })));
          setTotal(count ?? 0);
          setError(null);
          setLoading(false);
        });
    });

    return () => { cancelled = true; };
  }, [page, year, userId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { data, total, loading, error, refresh, pageSize: SALES_TARGETS_PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// Mutation helpers
// RLS: INSERT/UPDATE menuntut is_manager_or_above() + company_id ∈
// get_user_company_ids(), atau is_super_admin(). Lihat migrasi 20260830000005.
// ---------------------------------------------------------------------------

// Kosong ('' atau null) → NULL, BUKAN 0. "Belum ditetapkan" harus tetap bisa
// dibedakan dari "target nol": attainment atas target NULL wajib tampil "—",
// sedangkan target 0 adalah pernyataan bisnis lain sekaligus pembagi nol.
function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createSalesTarget({
  company_id, user_id, period_year, period_month, target_value, target_deals, notes, is_active,
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  const { error } = await supabase.from('sales_targets').insert({
    company_id,
    user_id,
    period_year:  Number(period_year),
    period_month: Number(period_month),
    target_value: numOrNull(target_value),
    target_deals: numOrNull(target_deals),
    notes: notes?.trim() || null,
    is_active: is_active !== false,
    created_by: userId,
  });
  return { error };
}

export async function updateSalesTarget(id, {
  period_year, period_month, target_value, target_deals, notes, is_active,
}) {
  const { error } = await supabase
    .from('sales_targets')
    .update({
      period_year:  Number(period_year),
      period_month: Number(period_month),
      target_value: numOrNull(target_value),
      target_deals: numOrNull(target_deals),
      notes: notes?.trim() || null,
      is_active: is_active !== false,
    })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}

export async function softDeleteSalesTarget(id) {
  const { error } = await supabase
    .from('sales_targets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null);
  return { error };
}
