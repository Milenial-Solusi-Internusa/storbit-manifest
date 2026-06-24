// src/hooks/useProducts.js
// Company-scoped fetch of the products/services catalog (`products` table),
// used to power autocomplete/prefill in forms (e.g. Quotation line items).
//
// useProducts({ activeOnly = true }) → { products, loading, error, refetch }
//   - scope: company_id = profile.company_id (from useAuth), deleted_at IS NULL
//   - activeOnly: also filter is_active = true (default true)
//   - .limit(1000), ordered by name
//
// groupProductsByCategory(products) → { [category]: Product[] } grouped by the
//   `category` column (null/empty → 'Uncategorized').
//
// Pattern: setState only inside .then() (project set-state-in-effect lint rule).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';

export function useProducts({ activeOnly = true } = {}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id || null;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!companyId) { setProducts([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('products')
      .select('id, company_id, code, name, category, unit, uom, default_price, is_service, is_active')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(1000);
    if (activeOnly) query = query.eq('is_active', true);

    query.then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) { setError(err); setProducts([]); }
      else { setProducts(data || []); setError(null); }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [companyId, activeOnly, refreshKey]);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { products, loading, error, refetch };
}

export function groupProductsByCategory(products) {
  const out = {};
  (products || []).forEach((p) => {
    const cat = p.category || 'Uncategorized';
    if (!out[cat]) out[cat] = [];
    out[cat].push(p);
  });
  return out;
}

export default useProducts;
