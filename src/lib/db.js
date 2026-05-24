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
    deadline: row.deadline || '',
    dc: row.dc || '',
    shippingDate: row.shipping_date || '',
    btbNo: row.btb_no || '',
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
    deadline: d(item.deadline),
    dc: item.dc || '',
    shipping_date: d(item.shippingDate),
    btb_no: item.btbNo || '',
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
export function customerFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    defaultDc: row.default_dc || '',
    picName: row.pic_name || '',
    picEmail: row.pic_email || '',
    active: !!row.active,
  };
}

export function customerToDb(c) {
  return {
    code: c.code,
    name: c.name,
    default_dc: c.defaultDc || '',
    pic_name: c.picName || '',
    pic_email: c.picEmail || '',
    active: c.active !== false,
  };
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
    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', c.id)
      .select()
      .single();
    return { data: customerFromDb(data), error };
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
