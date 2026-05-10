// src/hooks/useTtfs.js
// Custom hook untuk AR Tracker (TTF + nested BTBs).
// Handle nested update: 1 TTF punya multiple BTBs.

import { useState, useEffect, useCallback } from 'react';
import {
  listTtfs,
  insertTtf,
  updateTtf,
  deleteTtf,
} from '../lib/db';

export function useTtfs({ customers = [] } = {}) {
  const [arData, setArData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper: resolve customer name → customer_id
  const resolveCustomerId = useCallback(
    (customerName) => {
      if (!customerName) return null;
      const found = customers.find((c) => c.name === customerName);
      return found?.id || null;
    },
    [customers]
  );

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error: err } = await listTtfs();
    if (err) {
      console.error('[useTtfs] list error:', err);
      setError(err);
    } else {
      setArData(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveTtf = useCallback(
    async (data) => {
      const isUpdate = !!data.id && arData.some((a) => a.id === data.id);
      const customerId = data.customerId || resolveCustomerId(data.customer);
      const payload = { ...data, customerId };

      try {
        if (isUpdate) {
          const { data: saved, error: err } = await updateTtf(data.id, payload);
          if (err) throw err;
          setArData((prev) => prev.map((a) => (a.id === data.id ? saved : a)));
          return saved;
        } else {
          const { data: saved, error: err } = await insertTtf(payload);
          if (err) throw err;
          setArData((prev) => [saved, ...prev]);
          return saved;
        }
      } catch (err) {
        console.error('[useTtfs] save error:', err);
        throw err;
      }
    },
    [arData, resolveCustomerId]
  );

  const removeTtf = useCallback(
    async (id) => {
      const optimistic = arData.filter((a) => a.id !== id);
      setArData(optimistic);
      const { error: err } = await deleteTtf(id);
      if (err) {
        console.error('[useTtfs] delete error:', err);
        setArData(arData); // rollback
        throw err;
      }
    },
    [arData]
  );

  return {
    arData,
    loading,
    error,
    refresh,
    saveTtf,
    removeTtf,
  };
}
