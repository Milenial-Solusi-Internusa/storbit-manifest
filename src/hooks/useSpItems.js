// src/hooks/useSpItems.js
// Custom hook untuk SP items — wrap Supabase calls dengan optimistic UI.
// API kompatibel dengan logic existing App.jsx (rows array + handlers).

import { useState, useEffect, useCallback } from 'react';
import {
  listSpItems,
  insertSpItem,
  updateSpItem,
  deleteSpItem,
  deleteSpDual,
} from '../lib/db';

export function useSpItems({ customers = [] } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper: resolve customer name → customer_id pake list customers
  const resolveCustomerId = useCallback(
    (customerName) => {
      if (!customerName) return null;
      const found = customers.find((c) => c.name === customerName);
      return found?.id || null;
    },
    [customers]
  );

  // Initial load
  const refresh = useCallback(async () => {
    setError(null);
    const { data, error: err } = await listSpItems();
    if (err) {
      console.error('[useSpItems] list error:', err);
      setError(err);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    listSpItems().then(({ data, error: err }) => {
      if (err) {
        console.error('[useSpItems] list error:', err);
        setError(err);
      } else {
        setError(null);
        setRows(data || []);
      }
      setLoading(false);
    });
  }, []);

  // Add or update single row
  // App.jsx pass `data.customer` as name string. Kita resolve ke customer_id di sini.
  const saveRow = useCallback(
    async (data) => {
      const isUpdate = !!data.id && rows.some((r) => r.id === data.id);
      const customerId = data.customerId || resolveCustomerId(data.customer);

      const payload = { ...data, customerId };

      if (isUpdate) {
        // Optimistic: update state dulu, sync DB di belakang
        const optimistic = rows.map((r) =>
          r.id === data.id ? { ...r, ...payload } : r
        );
        setRows(optimistic);

        const { data: saved, error: err } = await updateSpItem(data.id, payload);
        if (err) {
          console.error('[useSpItems] update error:', err);
          // Rollback
          setRows(rows);
          throw err;
        }
        // Replace dengan canonical version dari DB (biar customer name field consistent)
        setRows((prev) =>
          prev.map((r) => (r.id === data.id ? saved : r))
        );
        return saved;
      } else {
        // Insert: append optimistic temp row, replace dengan saved
        const tempId = `temp-${Date.now()}`;
        const optimistic = [{ ...payload, id: tempId }, ...rows];
        setRows(optimistic);

        const { data: saved, error: err } = await insertSpItem(payload);
        if (err) {
          console.error('[useSpItems] insert error:', err);
          setRows(rows); // rollback
          throw err;
        }
        setRows((prev) => [saved, ...prev.filter((r) => r.id !== tempId)]);
        return saved;
      }
    },
    [rows, resolveCustomerId]
  );

  // Delete single row
  const removeRow = useCallback(
    async (id) => {
      const optimistic = rows.filter((r) => r.id !== id);
      setRows(optimistic);

      const { error: err } = await deleteSpItem(id);
      if (err) {
        console.error('[useSpItems] delete error:', err);
        setRows(rows); // rollback
        throw err;
      }
    },
    [rows]
  );

  // Delete entire SP — dual-table (sp_orders + sp_order_items + sp_items) atomik via
  // RPC delete_sp_dual, di-kunci komposit (customer_id, sp_no). Guard super_admin + DRAFT
  // ada di RPC. Pengganti loop deleteSpItem lama yang cuma hapus legacy + abai customer_id.
  const removeRowsBySp = useCallback(
    async (spNo, customerId) => {
      const targets = rows.filter((r) => r.spNo === spNo && r.customerId === customerId);
      if (targets.length === 0) return;

      // Optimistic: remove matching rows (composite identity)
      const remaining = rows.filter((r) => !(r.spNo === spNo && r.customerId === customerId));
      setRows(remaining);

      const { error: err } = await deleteSpDual(customerId, spNo);
      if (err) {
        console.error('[useSpItems] delete SP error:', err);
        await refresh(); // recover from failure (nothing deleted — RPC atomik)
        throw err;
      }
    },
    [rows, refresh]
  );

  return {
    rows,
    loading,
    error,
    refresh,
    saveRow,
    removeRow,
    removeRowsBySp,
  };
}
