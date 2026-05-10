// src/hooks/useCustomers.js
// Custom hook untuk customers — wrap Supabase calls jadi shape yang
// kompatibel dengan logic existing App.jsx (array + setter).

import { useState, useEffect, useCallback } from 'react';
import { listCustomers, upsertCustomer, deleteCustomer as dbDeleteCustomer } from '../lib/db';

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setError(null);
    const { data, error: err } = await listCustomers();
    if (err) {
      console.error('[useCustomers] list error:', err);
      setError(err);
    } else {
      setCustomers(data || []);
    }
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Add or update — DB returns row with real UUID, kita merge ke state
  const saveCustomer = useCallback(async (data) => {
    const { data: saved, error: err } = await upsertCustomer(data);
    if (err) {
      console.error('[useCustomers] save error:', err);
      throw err;
    }
    setCustomers((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists
        ? prev.map((c) => (c.id === saved.id ? saved : c))
        : [...prev, saved];
    });
    return saved;
  }, []);

  // Delete by id
  const removeCustomer = useCallback(async (id) => {
    const { error: err } = await dbDeleteCustomer(id);
    if (err) {
      console.error('[useCustomers] delete error:', err);
      throw err;
    }
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    customers,
    loading,
    error,
    refresh,
    saveCustomer,
    removeCustomer,
  };
}
