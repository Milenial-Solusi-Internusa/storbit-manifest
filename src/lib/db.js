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
    // SP lifecycle status (confirm/cancel) — mutated only via set_sp_status RPC.
    spStatus: row.sp_status || 'draft',
    confirmedAt: row.confirmed_at || '',
    cancelledAt: row.cancelled_at || '',
    cancelReason: row.cancel_reason || '',
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
  // Migrated to `accounts` (Phase 2.5A). Storbit SP/AR only picks rows that are
  // already customers — filter by account_status. accounts has every customers
  // column plus extras (account_status, owner_company_id, …) which customerFromDb
  // passes through harmlessly as custom fields.
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('account_status', 'customer')
    .is('deleted_at', null)
    .order('name');
  return { data: (data || []).map(customerFromDb), error };
}

export async function upsertCustomer(c) {
  const payload = customerToDb(c);

  if (c.id) {
    // UPDATE — customerToDb() does not include company_id/account_status, so the
    // existing row values are preserved. Migrated to `accounts` (Phase 2.5A).
    const { data, error } = await supabase
      .from('accounts')
      .update(payload)
      .eq('id', c.id)
      .select()
      .single();
    return { data: customerFromDb(data), error };
  }

  // INSERT — resolve company_id (RLS WITH CHECK requires it). customerToDb()
  // does not produce company_id, so we resolve it here.
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

  // Storbit can create a customer directly into `accounts`. Such a row is born
  // a customer (not a prospect): stamp account_status, owner entity, and the
  // became_customer_at timestamp.
  payload.account_status = 'customer';
  payload.owner_company_id = payload.company_id;
  payload.became_customer_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('accounts')
    .insert(payload)
    .select()
    .single();
  return { data: customerFromDb(data), error };
}

export async function deleteCustomer(id) {
  // Soft delete on `accounts` (Phase 2.5A): set deleted_at to exclude the row
  // from all future reads. `active` is not set here — accounts uses
  // account_status, not the legacy `active` flag.
  const { error } = await supabase
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

// ============================================================
// SP ITEMS
// ============================================================
export async function listSpItems() {
  const { data, error } = await supabase
    .from('sp_items')
    .select('*, customers:accounts!sp_items_customer_id_fkey(name)')
    .order('sp_date', { ascending: false, nullsFirst: false });
  return { data: (data || []).map(spFromDb), error };
}

export async function insertSpItem(item) {
  const payload = spToDb(item);
  const { data, error } = await supabase
    .from('sp_items')
    .insert(payload)
    .select('*, customers:accounts!sp_items_customer_id_fkey(name)')
    .single();
  return { data: spFromDb(data), error };
}

export async function bulkInsertSpItems(items) {
  const payload = items.map(spToDb);
  const { data, error } = await supabase
    .from('sp_items')
    .insert(payload)
    .select('*, customers:accounts!sp_items_customer_id_fkey(name)');
  return { data: (data || []).map(spFromDb), error };
}

export async function updateSpItem(id, item) {
  const payload = spToDb(item);
  const { data, error } = await supabase
    .from('sp_items')
    .update(payload)
    .eq('id', id)
    .select('*, customers:accounts!sp_items_customer_id_fkey(name)')
    .single();
  return { data: spFromDb(data), error };
}

export async function deleteSpItem(id) {
  const { error } = await supabase.from('sp_items').delete().eq('id', id);
  return { error };
}

// Set SP lifecycle status (confirm/cancel) atomically across all line items
// sharing the same sp_no. Backed by RPC set_sp_status (SECURITY DEFINER).
// status: 'draft' | 'confirmed' | 'cancelled'. reason optional (for cancel).
export async function setSpStatus(spNo, status, reason = null) {
  const { data, error } = await supabase.rpc('set_sp_status', {
    p_sp_no: spNo,
    p_status: status,
    p_reason: reason,
  });
  return { data, error }; // data = jumlah baris ter-update
}

// ============================================================
// PICKING LIST (Fase 2 — fulfillment gudang)
// ============================================================

// Generate a picking list from a CONFIRMED SP. Atomic via RPC
// generate_picking_from_sp (validates sp_status='confirmed', idempotency guard,
// numbering, header + items in one transaction).
// Returns { data: { picking_list_id, picking_no } | null, error }.
export async function generatePickingFromSp(spNo, warehouseId = null) {
  const { data, error } = await supabase.rpc('generate_picking_from_sp', {
    p_sp_no: spNo,
    p_warehouse_id: warehouseId,
  });
  // RPC RETURNS TABLE → array of rows; unwrap the single row.
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row || null, error };
}

// List picking lists (newest first) with warehouse name embedded.
export async function listPickingLists() {
  const { data, error } = await supabase
    .from('picking_lists')
    .select('*, warehouses(name, code)')
    .order('created_at', { ascending: false, nullsFirst: false });
  return { data: data || [], error };
}

// Fetch one picking list + its items + resolved customer name (via sp_no → SP).
// Returns { data: { ...header, warehouse_name, customer_name, items }, error }.
export async function getPickingListDetail(pickingListId) {
  const { data: header, error: hErr } = await supabase
    .from('picking_lists')
    .select('*, warehouses(name, code)')
    .eq('id', pickingListId)
    .single();
  if (hErr) return { data: null, error: hErr };

  const { data: items, error: iErr } = await supabase
    .from('picking_list_items')
    .select('*')
    .eq('picking_list_id', pickingListId)
    .order('created_at', { ascending: true, nullsFirst: false });
  if (iErr) return { data: null, error: iErr };

  // Customer isn't stored on picking_lists (sp_no is free text) — resolve from SP.
  const { data: spRow } = await supabase
    .from('sp_items')
    .select('customers:accounts!sp_items_customer_id_fkey(name)')
    .eq('sp_no', header.sp_no)
    .limit(1)
    .maybeSingle();

  return {
    data: {
      ...header,
      warehouse_name: header.warehouses?.name || null,
      customer_name: spRow?.customers?.name || null,
      items: items || [],
    },
    error: null,
  };
}

// Toggle a single picking_list_items row picked/unpicked. When picked, qty_picked
// snaps to qty_requested; when unpicked, back to 0.
export async function setPickingItemPicked(itemId, picked, qtyRequested) {
  const { data, error } = await supabase
    .from('picking_list_items')
    .update({
      status: picked ? 'picked' : 'pending',
      qty_picked: picked ? qtyRequested : 0,
    })
    .eq('id', itemId)
    .select('*')
    .single();
  return { data, error };
}

// Start picking: pending → in_progress (+ started_at).
export async function startPicking(pickingListId) {
  const { data, error } = await supabase
    .from('picking_lists')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', pickingListId)
    .select('*')
    .single();
  return { data, error };
}

// Complete picking: in_progress → done (+ completed_at).
export async function completePicking(pickingListId) {
  const { data, error } = await supabase
    .from('picking_lists')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', pickingListId)
    .select('*')
    .single();
  return { data, error };
}

// ============================================================
// AR TTF + BTB (header + nested items)
// ============================================================
export async function listTtfs() {
  const { data, error } = await supabase
    .from('ar_ttfs')
    .select('*, customers:accounts!ar_ttfs_customer_id_fkey(name), ar_btbs(*)')
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
    .select('*, customers:accounts!ar_ttfs_customer_id_fkey(name), ar_btbs(*)')
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
    .select('*, customers:accounts!ar_ttfs_customer_id_fkey(name), ar_btbs(*)')
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
