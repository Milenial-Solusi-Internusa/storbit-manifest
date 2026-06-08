// src/lib/db.js
// Data Access Layer — semua query Supabase ditaro di sini biar App.jsx tetep clean.
// Pattern: tiap fungsi kembaliin { data, error } supaya UI bisa handle error consistent.

import { supabase } from './supabase';

// ============================================================
// CONVERTERS — DB row (snake_case) ↔ App row (camelCase)
// App.jsx sekarang pake camelCase (spDate, spNo, productName, dll)
// jadi kita translate di layer ini biar gak perlu rombak App.jsx total.
// ============================================================

// SP item: db → app
export function spFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    spDate: row.sp_date || '',
    spNo: row.sp_no || '',
    customerId: row.customer_id || null,
    customer: row.customers?.name || '',          // joined field
    productName: row.product_name || '',
    sku: row.sku || '',
    qty: row.qty ?? 0,
    shippedQty: row.shipped_qty ?? 0,
    expDate: row.exp_date || '',
    expired_date: row.expired_date || '',
    deadline: row.expired_date || '', // backward compat alias
    dc: row.dc || '',
    shippingDate: row.shipping_date || '',
    slaDays: row.sla_days ?? '',
    estimatedDeliveryDate: row.estimated_delivery_date || '',
    deliveredDate: row.arrival_date || '',
    arrival_date: row.arrival_date || '',
    btbNo: '',  // btb_no moved to sp_btbs table (btb_no_deprecated in sp_items)
    unitPrice: Number(row.unit_price ?? 0),
    shippingPrice: Number(row.shipping_price ?? 0),
    inv: !!row.inv,
    fp: !!row.fp,
    submit: !!row.submit,
    kirim: !!row.kirim,
    submitDate: row.submit_date || '',
    emailStatus: row.email_status || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// SP item: app → db (untuk insert/update)
export function spToDb(item) {
  // Helper: empty string → null untuk DATE columns (Postgres tolak '')
  const d = (v) => (v === '' || v == null ? null : v);
  return {
    sp_date: d(item.spDate),
    sp_no: item.spNo || '',
    customer_id: item.customerId || null,
    product_name: item.productName || '',
    sku: item.sku || '',
    qty: Number(item.qty) || 0,
    shipped_qty: Number(item.shippedQty) || 0,
    exp_date: d(item.expDate),
    expired_date: d(item.expired_date ?? item.deadline),
    dc: item.dc || '',
    shipping_date: d(item.shippingDate),
    sla_days: item.slaDays === '' || item.slaDays == null ? null : Number(item.slaDays),
    estimated_delivery_date: d(item.estimatedDeliveryDate),
    arrival_date: d(item.arrival_date ?? item.deliveredDate),
    // btb_no removed — column renamed to btb_no_deprecated in sp_items; use sp_btbs table
    unit_price: Number(item.unitPrice) || 0,
    shipping_price: Number(item.shippingPrice) || 0,
    inv: !!item.inv,
    fp: !!item.fp,
    submit: !!item.submit,
    kirim: !!item.kirim,
    submit_date: d(item.submitDate),
    email_status: d(item.emailStatus),
    notes: item.notes || '',
  };
}

// Customer: db → app
// Standard DB columns — used to separate legacy camelCase mapping from custom fields
const CUSTOMER_STANDARD_DB_COLS = new Set([
  'id', 'code', 'name', 'default_dc', 'pic_name', 'pic_email', 'active',
  'company_id', 'deleted_at', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'legal_name', 'customer_type', 'tax_id', 'address', 'city', 'country',
  'phone', 'email', 'payment_terms', 'payment_terms_id', 'credit_limit', 'currency_code', 'notes',
]);

export function customerFromDb(row) {
  if (!row) return null;
  // Map standard fields with legacy camelCase aliases kept for backward compat
  const base = {
    id:        row.id,
    code:      row.code,
    name:      row.name,
    defaultDC: row.default_dc || '',   // legacy alias used in CustomerModal
    defaultDc: row.default_dc || '',   // alternative alias
    picName:   row.pic_name   || '',
    picEmail:  row.pic_email  || '',
    active:    !!row.active,
  };
  // Pass through all custom (non-standard) columns unchanged
  for (const [k, v] of Object.entries(row)) {
    if (!CUSTOMER_STANDARD_DB_COLS.has(k) && !(k in base)) {
      base[k] = v;
    }
  }
  return base;
}

export function customerToDb(c) {
  // Start with the known standard field mapping
  const payload = {
    code:      c.code,
    name:      c.name,
    default_dc:c.defaultDC || c.defaultDc || '',
    pic_name:  c.picName   || '',
    pic_email: c.picEmail  || '',
    active:    c.active !== false,
  };
  // Append any custom fields — columns that are not in the standard app-level keys
  const standardAppKeys = new Set([
    'id', 'code', 'name', 'defaultDC', 'defaultDc', 'picName', 'picEmail', 'active',
    'company_id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by',
  ]);
  for (const [k, v] of Object.entries(c)) {
    if (!standardAppKeys.has(k) && !(k in payload)) {
      payload[k] = v;
    }
  }
  return payload;
}

// AR TTF: db → app (with btbs sub-array)
export function ttfFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    noTTF: row.no_ttf || '',
    tanggalTTF: row.tanggal_ttf || '',
    tanggalMenerima: row.tanggal_menerima || '',
    noINV: row.no_inv || '',
    noSP: row.no_sp || '',
    customerId: row.customer_id || null,
    customer: row.customers?.name || '',
    tglPembayaran: row.tgl_pembayaran || '',
    notes: row.notes || '',
    btbs: (row.ar_btbs || [])
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((b) => ({
        id: b.id,
        noBTB: b.no_btb || '',
        dppPpn: Number(b.dpp_ppn ?? 0),
        pph: Number(b.pph ?? 0),
        payment: Number(b.payment ?? 0),
      })),
  };
}

export function ttfToDb(t) {
  const d = (v) => (v === '' || v == null ? null : v);
  return {
    no_ttf: t.noTTF || '',
    tanggal_ttf: d(t.tanggalTTF),
    tanggal_menerima: d(t.tanggalMenerima),
    no_inv: t.noINV || '',
    no_sp: t.noSP || '',
    customer_id: t.customerId || null,
    tgl_pembayaran: d(t.tglPembayaran),
    notes: t.notes || '',
  };
}

// ============================================================
// CUSTOMERS
// ============================================================

// Private helper: resolves the current user's company_id from profiles.
// Called only on the INSERT path of upsertCustomer() when no company_id
// is present on the input object.
//
// Uses getSession() (cache read) rather than getUser() (network call) to
// stay consistent with getMyProfile() — getUser() has known latency issues
// in this codebase. The subsequent profiles SELECT validates the user exists.
async function getCurrentUserCompanyId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    throw new Error('Unable to create customer: not authenticated.');
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', session.user.id)
    .single();
  if (error) throw error;
  if (!data?.company_id) {
    throw new Error('Unable to create customer: current user has no company assigned.');
  }
  return data.company_id;
}

export async function listCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  return { data: (data || []).map(customerFromDb), error };
}

export async function upsertCustomer(c) {
  const payload = customerToDb(c);

  if (c.id) {
    // UPDATE — customerToDb() does not include company_id, so the existing
    // row value is preserved. RLS customers_update USING checks the row's
    // existing company_id against get_user_company_id().
    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', c.id)
      .select()
      .single();
    return { data: customerFromDb(data), error };
  }

  // INSERT — customers_insert RLS WITH CHECK requires
  // company_id = get_user_company_id(). customerToDb() does not produce
  // company_id, so we resolve it here.
  // Honor an explicit company_id on the input object (forward-compatibility);
  // otherwise fetch from the current user's profile.
  if (c.company_id) {
    payload.company_id = c.company_id;
  } else {
    try {
      payload.company_id = await getCurrentUserCompanyId();
    } catch (err) {
      return { data: null, error: err };
    }
  }

  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select()
    .single();
  return { data: customerFromDb(data), error };
}

export async function deleteCustomer(id) {
  // Soft delete: customers RLS has no DELETE policy (by design).
  // Set deleted_at to exclude the row from all future reads,
  // and active = false so legacy active-filter logic is consistent.
  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq('id', id);
  return { error };
}

// ============================================================
// SP ITEMS
// ============================================================
export async function listSpItems() {
  const { data, error } = await supabase
    .from('sp_items')
    .select('*, customers(name)')
    .order('sp_date', { ascending: false, nullsFirst: false });
  return { data: (data || []).map(spFromDb), error };
}

export async function insertSpItem(item) {
  const payload = spToDb(item);
  const { data, error } = await supabase
    .from('sp_items')
    .insert(payload)
    .select('*, customers(name)')
    .single();
  return { data: spFromDb(data), error };
}

export async function bulkInsertSpItems(items) {
  const payload = items.map(spToDb);
  const { data, error } = await supabase
    .from('sp_items')
    .insert(payload)
    .select('*, customers(name)');
  return { data: (data || []).map(spFromDb), error };
}

export async function updateSpItem(id, item) {
  const payload = spToDb(item);
  const { data, error } = await supabase
    .from('sp_items')
    .update(payload)
    .eq('id', id)
    .select('*, customers(name)')
    .single();
  return { data: spFromDb(data), error };
}

export async function deleteSpItem(id) {
  const { error } = await supabase.from('sp_items').delete().eq('id', id);
  return { error };
}

// ============================================================
// AR TTF + BTB (header + nested items)
// ============================================================
export async function listTtfs() {
  const { data, error } = await supabase
    .from('ar_ttfs')
    .select('*, customers(name), ar_btbs(*)')
    .order('tanggal_ttf', { ascending: false, nullsFirst: false });
  return { data: (data || []).map(ttfFromDb), error };
}

export async function insertTtf(t) {
  const headerPayload = ttfToDb(t);
  const { data: header, error: headerErr } = await supabase
    .from('ar_ttfs')
    .insert(headerPayload)
    .select()
    .single();
  if (headerErr) return { data: null, error: headerErr };

  // Insert btbs
  const btbPayload = (t.btbs || []).map((b, idx) => ({
    ttf_id: header.id,
    no_btb: b.noBTB || '',
    dpp_ppn: Number(b.dppPpn) || 0,
    pph: Number(b.pph) || 0,
    payment: Number(b.payment) || 0,
    position: idx,
  }));
  if (btbPayload.length) {
    const { error: btbErr } = await supabase.from('ar_btbs').insert(btbPayload);
    if (btbErr) return { data: null, error: btbErr };
  }

  // Re-fetch with joins
  const { data: full, error: fetchErr } = await supabase
    .from('ar_ttfs')
    .select('*, customers(name), ar_btbs(*)')
    .eq('id', header.id)
    .single();
  return { data: ttfFromDb(full), error: fetchErr };
}

export async function updateTtf(id, t) {
  const headerPayload = ttfToDb(t);
  const { error: headerErr } = await supabase
    .from('ar_ttfs')
    .update(headerPayload)
    .eq('id', id);
  if (headerErr) return { data: null, error: headerErr };

  // Strategy: hapus semua btbs lama, insert ulang. Simple, aman buat skala kecil.
  const { error: delErr } = await supabase.from('ar_btbs').delete().eq('ttf_id', id);
  if (delErr) return { data: null, error: delErr };

  const btbPayload = (t.btbs || []).map((b, idx) => ({
    ttf_id: id,
    no_btb: b.noBTB || '',
    dpp_ppn: Number(b.dppPpn) || 0,
    pph: Number(b.pph) || 0,
    payment: Number(b.payment) || 0,
    position: idx,
  }));
  if (btbPayload.length) {
    const { error: btbErr } = await supabase.from('ar_btbs').insert(btbPayload);
    if (btbErr) return { data: null, error: btbErr };
  }

  const { data: full, error: fetchErr } = await supabase
    .from('ar_ttfs')
    .select('*, customers(name), ar_btbs(*)')
    .eq('id', id)
    .single();
  return { data: ttfFromDb(full), error: fetchErr };
}

export async function deleteTtf(id) {
  // ar_btbs cascade-delete via FK
  const { error } = await supabase.from('ar_ttfs').delete().eq('id', id);
  return { error };
}

// ============================================================
// PROFILES (for user management)
// ============================================================
export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at');
  return { data: data || [], error };
}

export async function updateProfile(id, patch) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

export async function getMyProfile() {
  // Pake getSession() (read from cache) instead of getUser() (network call yang sering hang)
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id);

  if (error) return { data: null, error };
  return { data: data?.[0] || null, error: null };
}

// ─── sp_btbs — BTB Numbers per SP ────────────────────────────────────────
// Table: id, sp_no, btb_no, remarks, created_at
// BTB No is now SP-level (not item-level). btb_no in sp_items is deprecated.

/** Fetch all BTB numbers for a given SP */
export async function listSpBtbs(spNo) {
  const { data, error } = await supabase
    .from('sp_btbs')
    .select('id, sp_no, btb_no, remarks, created_at')
    .eq('sp_no', spNo)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}

/** Add a BTB number (with optional remarks) to an SP */
export async function addSpBtb(spNo, btbNo, remarks) {
  const row = { sp_no: spNo, btb_no: btbNo.trim() };
  if (remarks && remarks.trim()) row.remarks = remarks.trim();
  const { data, error } = await supabase
    .from('sp_btbs')
    .insert(row)
    .select()
    .single();
  return { data, error };
}

/** Delete a BTB number by row id */
export async function deleteSpBtb(id) {
  const { error } = await supabase
    .from('sp_btbs')
    .delete()
    .eq('id', id);
  return { error };
}

/** Bulk insert BTB numbers (with optional remarks) for a new SP — used by InputSPPage */
export async function bulkInsertSpBtbs(spNo, btbRows) {
  const rows = btbRows
    .filter(r => (typeof r === 'string' ? r.trim() : r?.btb_no?.trim()))
    .map(r => {
      const btb_no  = typeof r === 'string' ? r.trim() : r.btb_no.trim();
      const remarks = typeof r === 'string' ? null : (r.remarks?.trim() || null);
      return { sp_no: spNo, btb_no, ...(remarks ? { remarks } : {}) };
    });
  if (!rows.length) return { error: null };
  const { error } = await supabase.from('sp_btbs').insert(rows);
  return { error };
}
