// src/hooks/useSpItems.js
// Custom hook untuk SP items — wrap Supabase calls dengan optimistic UI.
// API kompatibel dengan logic existing App.jsx (rows array + handlers).

import { useState, useEffect, useCallback } from 'react';
import {
  listSpItems,
  insertSpItem,
  bulkInsertSpItems,
  updateSpItem,
  deleteSpItem,
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

  // Delete all rows in a given SP (bulk delete by sp_no)
  const removeRowsBySp = useCallback(
    async (spNo) => {
      const targets = rows.filter((r) => r.spNo === spNo);
      if (targets.length === 0) return;

      // Optimistic: remove from state
      const remaining = rows.filter((r) => r.spNo !== spNo);
      setRows(remaining);

      // Delete one-by-one (Supabase doesn't bulk-delete by filter from client easily)
      const errors = [];
      for (const t of targets) {
        const { error: err } = await deleteSpItem(t.id);
        if (err) errors.push(err);
      }
      if (errors.length > 0) {
        console.error('[useSpItems] bulk delete errors:', errors);
        // Refresh from DB to recover from partial failure
        await refresh();
        throw errors[0];
      }
    },
    [rows, refresh]
  );

  // Bulk import (CSV)
  const bulkAdd = useCallback(
    async (importedRows) => {
      // Resolve customer names to IDs
      const payload = importedRows.map((r) => ({
        ...r,
        customerId: r.customerId || resolveCustomerId(r.customer),
      }));

      const { data: saved, error: err } = await bulkInsertSpItems(payload);
      if (err) {
        console.error('[useSpItems] bulk insert error:', err);
        throw err;
      }
      setRows((prev) => [...(saved || []), ...prev]);
      return saved;
    },
    [resolveCustomerId]
  );

  // Reset to seed (for handleResetData) — kita gak bisa "reset" Supabase data dari client
  // Jadi handler ini disabled, atau kasih warning ke admin.
  // Untuk Phase 5 awal, kita keep disabled. Bisa di-implement lewat Supabase Edge Function nanti.
  const resetData = useCallback(async () => {
    throw new Error('Reset data tidak tersedia di mode multi-user. Hubungi admin.');
  }, []);

  // Clear all — same reasoning
  const clearAll = useCallback(async () => {
    throw new Error('Clear all tidak tersedia di mode multi-user. Hubungi admin.');
  }, []);

  return {
    rows,
    loading,
    error,
    refresh,
    saveRow,
    removeRow,
    removeRowsBySp,
    bulkAdd,
    resetData,
    clearAll,
  };
}
