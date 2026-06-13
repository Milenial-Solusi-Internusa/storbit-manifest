// src/hooks/useCustomFields.js
// Fetch "extra" columns that exist in a table but are not part of the standard column set.
// Used to render dynamic custom field inputs in forms (e.g. CustomerModal).
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Standard column lists per table ─────────────────────────────────────
// Any column NOT in this list is treated as a custom/extra field.
export const STANDARD_COLUMNS = {
  customers: [
    'id', 'name', 'code', 'default_dc', 'pic_name', 'pic_email', 'pic_phone',
    'active', 'payment_terms', 'created_at', 'updated_at', 'company_id',
    'legal_name', 'customer_type', 'tax_id', 'address', 'city', 'country',
    'phone', 'email', 'credit_limit', 'payment_terms_id', 'currency_code',
    'notes', 'deleted_at', 'created_by', 'updated_by',
    // legacy app aliases used in the modal
    'defaultDC', 'picName', 'picEmail',
  ],
  // `prospects` table renamed → `accounts` (Batch 1). account_status segments
  // prospect / customer / lost / free_agent within one table.
  accounts: [
    'id', 'company_id', 'name', 'legal_name', 'customer_type', 'tax_id',
    'address', 'city', 'country', 'phone', 'email', 'pic_name', 'pic_phone',
    'pic_email', 'source', 'assigned_to', 'pipeline_stage', 'lost_reason',
    'won_reason', 'converted_at', 'converted_to', 'payment_terms_id', 'currency_code',
    'credit_limit', 'notes', 'is_active', 'created_by', 'updated_by',
    'created_at', 'updated_at', 'deleted_at',
    // BANT qualification scorecard
    'bant_commodity', 'bant_origin', 'bant_destination', 'bant_frequency',
    'bant_current_vendor', 'bant_payment', 'bant_decision_maker', 'bant_score',
    // accounts model columns (rename batch)
    'account_status', 'owner_company_id', 'tier', 'code', 'nomor_kontrak',
    'default_dc', 'last_activity_at', 'became_customer_at',
    // join result aliases — not real DB columns, must be excluded from custom fields
    'assigned_profile',
    // company prefix (PT/CV/Mr./Mrs./Ms.) — stored separately from name
    'company_prefix',
  ],
};

/**
 * Fetch custom (non-standard) columns for a given table.
 * @param {string} tableName - e.g. 'customers'
 * @returns {{ customFields: Array<{column_name, data_type}>, loading: boolean, error: string|null }}
 */
export function useCustomFields(tableName) {
  const [customFields, setCustomFields] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (!tableName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc('get_table_columns', { p_table: tableName })
      .then(({ data, error: rpcErr }) => {
        if (cancelled) return;
        if (rpcErr) {
          setError(rpcErr.message);
          setCustomFields([]);
          setLoading(false);
          return;
        }

        const standard = new Set(STANDARD_COLUMNS[tableName] || []);
        const extras = (data || []).filter(col => !standard.has(col.column_name));
        setCustomFields(extras);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [tableName]);

  return { customFields, loading, error };
}
