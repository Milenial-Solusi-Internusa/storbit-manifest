// src/hooks/useAssets.js
// Data layer for Asset Management module.
//
// Exports:
//   useITAssets({ page, search, companyId, statusFilter, subtypeFilter })
//     — paginated IT equipment list with joins to companies + locations
//
// Patterns:
//   - All setState in .then() chains (never synchronous in effect)
//   - deleted_at IS NULL on all list queries
//   - company_id RLS enforced server-side; client passes companyId for filter
//   - No SELECT * — only required columns selected

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const ASSETS_PAGE_SIZE = 12;

// Status → display label + badge type
export const ASSET_STATUS_CONFIG = {
  active:      { label: 'Aktif',       type: 'ok'      },
  in_repair:   { label: 'Maintenance', type: 'warn'    },
  retired:     { label: 'Rusak',       type: 'danger'  },
  disposed:    { label: 'Disposed',    type: 'neutral' },
  transferred: { label: 'Dialihkan',   type: 'info'    },
};

// Asset subtype → Lucide icon name hint (used by UI)
export const ASSET_SUBTYPE_ICON = {
  laptop:     'laptop',
  desktop:    'monitor',
  server:     'server',
  printer:    'printer',
  network:    'network',
  peripheral: 'plug',
  other:      'package',
};

// ─────────────────────────────────────────────────────────────
// useITAssets
// Paginated asset list, filtered by category code.
// categoryCode: 'IT-EQP' | 'VEH' | 'FURN' | 'BLDG' | null
//   null = all assets (no category filter, legacy fallback)
// companyId: null = all companies visible to user (RLS scoped)
// statusFilter: null | 'active' | 'in_repair' | 'retired' | 'disposed'
// subtypeFilter: null | 'laptop' | 'desktop' | 'server' | ... (IT only)
// ─────────────────────────────────────────────────────────────
export function useITAssets({
  page = 1, search = '', companyId = null,
  statusFilter = null, subtypeFilter = null,
  categoryCode = null,
} = {}) {
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [counts, setCounts]   = useState({ a: 0, b: 0, c: 0, d: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const from = (page - 1) * ASSETS_PAGE_SIZE;
    const to   = from + ASSETS_PAGE_SIZE - 1;

    async function run() {
      // Step 1 — resolve category_id list for the given code.
      // Filtering via category_id IN (...) is more reliable than PostgREST
      // embedded resource filtering (asset_categories.code = X).
      let categoryIds = null;
      if (categoryCode) {
        const { data: cats, error: catErr } = await supabase
          .from('asset_categories')
          .select('id')
          .eq('code', categoryCode)
          .is('deleted_at', null);

        if (catErr || !cats || cats.length === 0) {
          if (!cancelled) { setData([]); setTotal(0); setLoading(false); }
          return;
        }
        categoryIds = cats.map(c => c.id);
      }

      // Step 2 — build list + counts queries
      let listQ = supabase
        .from('assets')
        .select(
          'id, asset_code, asset_no, name, model, serial_number, asset_subtype, ' +
          'assigned_to_name, status, purchase_price, purchase_date, ' +
          'plate_number, km_odometer, ' +
          'company_id, location_id, category_id, ' +
          'companies(code, name), ' +
          'asset_locations(name), ' +
          'asset_categories(name, code)',
          { count: 'exact' }
        )
        .is('deleted_at', null)
        .order('asset_code', { ascending: true })
        .range(from, to);

      let cntQ = supabase
        .from('assets')
        .select('asset_subtype, status')
        .is('deleted_at', null);

      if (categoryIds) { listQ = listQ.in('category_id', categoryIds); cntQ = cntQ.in('category_id', categoryIds); }
      if (companyId)   { listQ = listQ.eq('company_id', companyId);    cntQ = cntQ.eq('company_id', companyId); }
      if (statusFilter)  listQ = listQ.eq('status', statusFilter);
      if (subtypeFilter) listQ = listQ.eq('asset_subtype', subtypeFilter);

      if (search.trim()) {
        const s = search.trim();
        listQ = listQ.or(
          `asset_code.ilike.%${s}%,` +
          `asset_no.ilike.%${s}%,` +
          `name.ilike.%${s}%,` +
          `model.ilike.%${s}%,` +
          `serial_number.ilike.%${s}%,` +
          `assigned_to_name.ilike.%${s}%,` +
          `plate_number.ilike.%${s}%`
        );
      }

      const [listRes, cntRes] = await Promise.all([listQ, cntQ]);
      if (cancelled) return;

      if (listRes.error) { setError(listRes.error); setLoading(false); return; }

      setData(listRes.data || []);
      setTotal(listRes.count ?? 0);
      setError(null);

      if (cntRes.data) {
        const rows = cntRes.data;
        if (categoryCode === 'IT-EQP' || !categoryCode) {
          setCounts({
            a: rows.filter(r => r.asset_subtype === 'laptop' || r.asset_subtype === 'desktop').length,
            b: rows.filter(r => r.asset_subtype === 'server' || r.asset_subtype === 'network').length,
            c: rows.filter(r => r.asset_subtype === 'printer' || r.asset_subtype === 'peripheral').length,
            d: 0,
          });
        } else {
          setCounts({
            a: rows.filter(r => r.status === 'active').length,
            b: rows.filter(r => r.status === 'in_repair').length,
            c: rows.filter(r => r.status === 'retired' || r.status === 'disposed').length,
            d: rows.filter(r => r.status === 'transferred').length,
          });
        }
      }

      setLoading(false);
    }

    run();
    return () => { cancelled = true; };
  }, [page, search, companyId, statusFilter, subtypeFilter, categoryCode, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { data, total, counts, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────
// useAssetDetail
// Fetches a single asset by id, with all related tables.
// Handles gracefully if vehicle-specific columns (migration 026)
// are not yet applied (they'll just return null).
// ─────────────────────────────────────────────────────────────
export function useAssetDetail({ id } = {}) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!id) {
      Promise.resolve().then(() => { if (!cancelled) setLoading(false); });
      let cancelled = false;
      return () => { cancelled = true; };
    }
    let cancelled = false;

    supabase
      .from('assets')
      .select(
        'id, asset_code, asset_no, name, description, model, asset_subtype, ' +
        'status, purchase_price, purchase_date, useful_life_years, depreciation_method, ' +
        'accumulated_depreciation, book_value, assigned_to_name, vendor_name, ' +
        'purchase_invoice_no, is_active, created_at, updated_at, ' +
        // vehicle-specific (migration 026) — null-safe
        'plate_number, color, manufacture_year, fuel_type, vin, engine_number, km_odometer, ' +
        'company_id, location_id, category_id, ' +
        'companies(code, name), ' +
        'asset_locations(name, code), ' +
        'asset_categories(name, code)'
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single()
      .then(({ data: row, error: err }) => {
        if (cancelled) return;
        setData(row || null);
        setError(err || null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Soft-delete: sets deleted_at = now()
  const softDelete = useCallback(async () => {
    if (!id) return { error: new Error('No asset id') };
    const { error: err } = await supabase
      .from('assets')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', id);
    if (!err) refresh();
    return { error: err };
  }, [id, refresh]);

  return { data, loading, error, refresh, softDelete };
}

// ─────────────────────────────────────────────────────────────
// useFuelLogs
// Fetches fuel fill-up records for a given asset.
// Returns empty array gracefully if table doesn't exist yet.
// ─────────────────────────────────────────────────────────────
export function useFuelLogs({ assetId } = {}) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;

    supabase
      .from('asset_fuel_logs')
      .select('id, fill_date, spbu, liters, price_per_liter, total_cost, odometer')
      .eq('asset_id', assetId)
      .is('deleted_at', null)
      .order('fill_date', { ascending: false })
      .limit(50)
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        // If table doesn't exist yet, treat as empty (not an error for the user)
        setData(rows || []);
        setError(err?.code === '42P01' ? null : (err || null));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [assetId]);

  return { data, loading, error };
}

// ─────────────────────────────────────────────────────────────
// useITAssetDetail
// Fetches all IT-specific related tables for an asset in parallel.
// Tables are gracefully skipped if migration 027 has not been applied yet
// (returns null/empty instead of erroring).
//
// Returns:
//   specs       — asset_specifications row (or null)
//   network     — asset_network row (or null)
//   software    — asset_software_licenses[] sorted by name
//   maintenance — asset_maintenance_records[] sorted by date desc
//   loading     — true while any query is in-flight
//   error       — first non-table-missing error (or null)
//   refresh     — force re-fetch
// ─────────────────────────────────────────────────────────────
export function useITAssetDetail({ assetId } = {}) {
  const [specs,       setSpecs]       = useState(null);
  const [network,     setNetwork]     = useState(null);
  const [software,    setSoftware]    = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!assetId) {
      Promise.resolve().then(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }

    async function run() {
      const [specsRes, netRes, swRes, mtnRes] = await Promise.all([
        supabase.from('asset_specifications').select('*').eq('asset_id', assetId).maybeSingle(),
        supabase.from('asset_network').select('*').eq('asset_id', assetId).maybeSingle(),
        supabase.from('asset_software_licenses')
          .select('id, software_name, version, category, license_type, license_key_masked, expiry_date, status')
          .eq('asset_id', assetId).is('deleted_at', null).order('software_name'),
        supabase.from('asset_maintenance_records')
          .select('id, maintenance_date, maintenance_type, description, technician_name, duration_minutes, cost, status, next_scheduled_date')
          .eq('asset_id', assetId).is('deleted_at', null)
          .order('maintenance_date', { ascending: false }),
      ]);

      if (cancelled) return;

      // 42P01 = table does not exist → gracefully treat as empty/null
      const notFound = (r) => r.error?.code === '42P01';
      setSpecs(notFound(specsRes)       ? null : (specsRes.data   || null));
      setNetwork(notFound(netRes)       ? null : (netRes.data     || null));
      setSoftware(notFound(swRes)       ? []   : (swRes.data      || []));
      setMaintenance(notFound(mtnRes)   ? []   : (mtnRes.data     || []));

      // Surface first real error (ignore table-not-found)
      const firstErr = [specsRes, netRes, swRes, mtnRes]
        .find(r => r.error && !notFound(r))?.error || null;
      setError(firstErr);
      setLoading(false);
    }

    run();
    return () => { cancelled = true; };
  }, [assetId, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return { specs, network, software, maintenance, loading, error, refresh };
}
