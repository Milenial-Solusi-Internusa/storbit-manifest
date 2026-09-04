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
    externalUrl: row.external_url || '',   // Fase 0.3 — link dokumen SP (Drive dll)
    productId: row.product_id || null,     // Fase 0.2 — link ke katalog produk
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
    product_id: item.productId || null,
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
    active:    row.is_active !== false,   // accounts uses `is_active` (default true), not `active`
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
  // Start with the known standard field mapping.
  // pic_name/pic_email SENGAJA TIDAK ditulis lagi (batch "kunci pic_*" 26 Jul
  // 2026) — kelola kontak lewat tab Kontak (tabel contacts). customerFromDb()
  // masih memetakan picName/picEmail (dipakai CustomerModal untuk menampilkan
  // nilai lama di field yang kini read-only), tapi arah tulis ini berhenti di sini.
  const payload = {
    code:      c.code,
    name:      c.name,
    default_dc:c.defaultDC || c.defaultDc || '',
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
    // Tautan ke chain SP baru (Fase 4/5). Aditif — ttfToDb() sengaja TIDAK
    // menulis balik kedua kolom ini; tautan hanya dibuat dari sisi SP/invoice.
    // Dipakai ARModal untuk mengunci baris BTB (nilai uang pindah ke
    // sp_invoice_lines/sp_payments — DESIGN_SP_SCHEMA.md §2.5).
    invoiceId: row.invoice_id || null,
    spOrderId: row.sp_order_id || null,
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
    .select('*, contacts(id, name, email, phone, is_primary, deleted_at)')
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

// Dual-write via RPC update_sp_item_dual (SECURITY DEFINER): sinkron sp_items
// PENUH + 5 field overlap (qty/sla_days/estimated_delivery_date/shipping_price/
// notes) ke sp_order_items lewat legacy_sp_item_id, satu transaksi. RPC RETURNS
// void → 2 round-trip (RPC lalu SELECT) supaya bentuk return persis sama
// seperti sebelumnya (caller di useSpItems.js tak perlu berubah).
export async function updateSpItem(id, item) {
  const payload = spToDb(item);
  const { error: rpcErr } = await supabase.rpc('update_sp_item_dual', { p_id: id, p_item: payload });
  if (rpcErr) return { data: null, error: rpcErr };
  const { data, error } = await supabase
    .from('sp_items')
    .select('*, customers:accounts!sp_items_customer_id_fkey(name)')
    .eq('id', id)
    .single();
  return { data: spFromDb(data), error };
}

// Hapus SATU baris item SP via RPC delete_sp_item_dual (SECURITY DEFINER,
// migrasi 20260902000002). Nama & signature ekspor SENGAJA tidak berubah supaya
// useSpItems.removeRow tak perlu disentuh — pola sama seperti updateSpItem
// yang dipindah ke RPC pada 25 Agu 2026.
//
// SENGAJA BUKAN .delete() langsung lagi. Dua alasan, keduanya nyata:
//   1. OTORISASI — RLS sp_items_delete dulu USING(true) dan `authenticated`
//      memang punya GRANT DELETE, jadi setiap user yang bisa login (sales,
//      viewer, hrga, finance) bisa menghapus baris item SP. Migrasi itu
//      mencabut GRANT-nya; .delete() langsung kini PASTI gagal.
//   2. ORPHAN — .delete() hanya menghapus sp_items. Kembarannya di
//      sp_order_items tertinggal (legacy_sp_item_id TANPA FK), dan
//      create_invoice menghitung Σqty dari sp_order_items → baris hantu itu
//      membuat Σshipped=Σqty mustahil tercapai → SP TAK BISA DIINVOICE
//      SELAMANYA. RPC menghapus kedua tabel dalam satu transaksi.
//
// Guard di RPC: is_sp_item_writer() + status ∈ (DRAFT, CONFIRMED,
// MENUNGGU_STOK) + tolak baris terakhir. Pesan RAISE-nya sudah manusiawi &
// berbahasa Indonesia → teruskan apa adanya ke user, jangan dibungkus generik.
export async function deleteSpItem(id) {
  const { error } = await supabase.rpc('delete_sp_item_dual', { p_id: id });
  return { error };
}

// Delete SELURUH SP secara atomik & konsisten (dual-table) via RPC delete_sp_dual
// (SECURITY DEFINER): hapus sp_orders (+ sp_order_items via FK CASCADE) DAN sp_items,
// di-kunci komposit (customer_id, sp_no). Guard di RPC: super_admin only + status DRAFT.
export async function deleteSpDual(customerId, spNo) {
  const { error } = await supabase.rpc('delete_sp_dual', { p_customer_id: customerId, p_sp_no: spNo });
  return { error };
}

// Set SP lifecycle status (confirm/cancel) atomically across all line items
// sharing the same sp_no. Backed by RPC set_sp_status (SECURITY DEFINER).
// status: 'draft' | 'confirmed' | 'cancelled'. reason optional (for cancel).
export async function setSpStatus(spNo, status, reason = null, customerId) {
  const { data, error } = await supabase.rpc('set_sp_status', {
    p_sp_no: spNo,
    p_status: status,
    p_reason: reason,
    p_customer_id: customerId,   // identitas komposit (customer_id, sp_no)
  });
  return { data, error }; // data = jumlah baris ter-update
}

// Set tenggat kirim SP (expired_date) di level HEADER. Backed by RPC
// set_sp_expired_date (SECURITY DEFINER, migrasi 20260825000002): satu
// transaksi menulis sp_orders.expired_date DAN semua baris sp_items.expired_date
// se-SP.
// SENGAJA RPC, bukan dua .update() dari sini: RLS kedua tabel beda ketat —
// sp_items_update = USING(true) (lolos siapa pun) sementara sp_orders_update
// role-gated, jadi dua panggilan terpisah bisa SUKSES SEPARUH (item berubah,
// header tidak) → persis divergensi header-vs-item yang sedang dihilangkan.
// Guard otorisasi + freeze status CANCELLED ada di dalam RPC.
export async function setSpExpiredDate(customerId, spNo, expiredDate) {
  const { error } = await supabase.rpc('set_sp_expired_date', {
    p_customer_id:  customerId,
    p_sp_no:        spNo,        // identitas komposit (customer_id, sp_no)
    p_expired_date: expiredDate || null,
  });
  return { error };
}

// Set status dokumen finance SP (inv/fp/submit/kirim/submit_date/email_status)
// di level HEADER. Backed by RPC set_sp_finance_docs (SECURITY DEFINER,
// migrasi 20260902000004): satu transaksi menulis sp_orders DAN semua baris
// sp_items se-SP. Alasan RPC-nya sama persis dengan setSpExpiredDate di atas —
// RLS sp_items_update = USING(true) sementara sp_orders_update role-gated,
// jadi dua .update() terpisah bisa SUKSES SEPARUH.
//
// BUKAN partial patch: keenam nilai WAJIB dikirim tiap panggilan. UI mengirim
// seluruh isi kartu tiap Simpan, jadi NULL pada submitDate/emailStatus berarti
// BENAR-BENAR dikosongkan, bukan "jangan ubah".
//
// Guard di RPC = sumbu FINANCE (super_admin / finance_controller / finance),
// SENGAJA tanpa is_manager_or_above() — matrix baris Finance menaruh manager
// di R, bukan CRUD. Berbeda dari canWarehouseOps maupun canWriteSpItem.
export async function setSpFinanceDocs(customerId, spNo, docs = {}) {
  const { error } = await supabase.rpc('set_sp_finance_docs', {
    p_customer_id:  customerId,
    p_sp_no:        spNo,        // identitas komposit (customer_id, sp_no)
    p_inv:          !!docs.inv,
    p_fp:           !!docs.fp,
    p_submit:       !!docs.submit,
    p_kirim:        !!docs.kirim,
    p_submit_date:  docs.submitDate || null,
    p_email_status: docs.emailStatus || null,
  });
  return { error };
}

// Set the SP document link (Fase 0.3) across all line items sharing sp_no.
// external_url is per-SP conceptually; sp_items is line-level → update all rows.
export async function setSpExternalUrl(spNo, url) {
  const { error } = await supabase
    .from('sp_items')
    .update({ external_url: url || null })
    .eq('sp_no', spNo);
  return { error };
}

// ============================================================
// PICKING LIST (Fase 2 — fulfillment gudang)
// ============================================================

// Generate a picking list from a CONFIRMED SP. Atomic via RPC
// generate_picking_from_sp (validates sp_status='confirmed', idempotency guard,
// numbering, header + items in one transaction).
// Returns { data: { picking_list_id, picking_no } | null, error }.
export async function generatePickingFromSp(spNo, customerId, warehouseId = null) {
  const { data, error } = await supabase.rpc('generate_picking_from_sp', {
    p_sp_no: spNo,
    p_customer_id: customerId,   // identitas komposit (customer_id, sp_no)
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

// Identitas cetak dokumen gudang (Picking List + Surat Jalan): entitas
// penerbit + nama DC tujuan. Dipakai dua loader di bawah supaya komponen PDF
// tetap murni presentasi.
//
// company_id dibaca DARI BARIS dokumennya, BUKAN konstanta SOA — pola yang
// sama dengan getInvoicePdfData, supaya tetap benar kalau modul ini kelak
// dipakai entitas lain (hari ini praktis selalu SOA karena default kolomnya).
//
// dc_id cuma hidup di sp_orders, jadi DC ditempuh lewat sp_order_id. Kolom itu
// nullable (di-backfill migrasi 20260826000001, dan diisi generate_picking_
// from_sp / generate_delivery_from_picking untuk baris baru) — kalau kosong,
// dc_name jatuh ke null dan PDF menampilkan '—', bukan gagal.
async function getPrintIdentity(companyId, spOrderId) {
  const [companyRes, spRes] = await Promise.all([
    companyId
      ? supabase.from('companies')
        .select('name, legal_name, address, address_2, city, province, postal_code')
        .eq('id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    spOrderId
      ? supabase.from('sp_orders').select('dc_id').eq('id', spOrderId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  let dcName = null;
  if (spRes.data?.dc_id) {
    const { data: dc } = await supabase
      .from('dc_master').select('nama').eq('id', spRes.data.dc_id).maybeSingle();
    dcName = dc?.nama || null;
  }
  return { company: companyRes.data || {}, dc_name: dcName };
}

// Fetch one picking list + its items + resolved customer name (via sp_no → SP).
// Returns { data: { ...header, warehouse_name, customer_name, company, dc_name,
// items, materials }, error }.
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

  // Material packing rows (Fase 3.x) + editable-window flag (locked once a
  // non-cancelled delivery note exists for this picking).
  const { data: materials } = await supabase
    .from('picking_list_materials')
    .select('*')
    .eq('picking_list_id', pickingListId)
    .order('created_at', { ascending: true, nullsFirst: false });
  const { count: dnCount } = await supabase
    .from('delivery_notes')
    .select('id', { count: 'exact', head: true })
    .eq('picking_list_id', pickingListId)
    .neq('status', 'cancelled');

  const { company, dc_name } = await getPrintIdentity(header.company_id, header.sp_order_id);

  return {
    data: {
      ...header,
      warehouse_name: header.warehouses?.name || null,
      customer_name: spRow?.customers?.name || null,
      company,
      dc_name,
      items: items || [],
      materials: materials || [],
      has_delivery: (dnCount || 0) > 0,
    },
    error: null,
  };
}

// Dokumen fulfillment satu SP: picking list(s) + surat jalan(s), untuk tab
// Shipment & Dokumen di Detail SP.
//
// KUNCI KOMPOSIT (customer_id, sp_no) — SENGAJA BUKAN sp_order_id, walau kolom
// itu sudah di-backfill 100% oleh migrasi 20260826000001. Alasannya TIMING,
// bukan kebersihan data: di SalesOrderDetailPage, customerId + spNo datang dari
// props (tersedia sejak render pertama), sementara spOrder.id baru ada setelah
// fetch async getSpOrderStatus selesai. Memakai sp_order_id berarti tab tak
// bisa memuat apa pun sampai fetch itu tuntas.
// ⚠️ customer_id WAJIB ikut difilter: sp_no adalah teks bebas dari customer dan
// bisa kembar antar customer — itu sebabnya sp_orders punya
// UNIQUE (customer_id, sp_no). Memfilter sp_no saja = mencampur SP milik
// customer lain.
//
// BTB & Invoice SENGAJA TIDAK di sini — keduanya sudah di-fetch komponen lewat
// listSpBtbNew(spOrderId) / getSpInvoice(spOrderId) dan sudah ada di state.
export async function getSpFulfillmentDocs(customerId, spNo) {
  if (!customerId || !spNo) return { data: { pickings: [], deliveries: [] }, error: null };
  const [pRes, dRes] = await Promise.all([
    supabase
      .from('picking_lists')
      .select('id, picking_no, status, created_at, completed_at, cancelled_at, warehouses(name, code)')
      .eq('customer_id', customerId)
      .eq('sp_no', spNo)
      .order('created_at', { ascending: true })
      .limit(1000),
    supabase
      .from('delivery_notes')
      .select('id, do_no, status, picking_list_id, ship_date, driver_name, vehicle_no, total_koli, dispatched_at, delivered_at, cancelled_at, delivery_note_items(qty)')
      .eq('customer_id', customerId)
      .eq('sp_no', spNo)
      .order('created_at', { ascending: true })
      .limit(1000),
  ]);
  if (pRes.error) return { data: null, error: pRes.error };
  if (dRes.error) return { data: null, error: dRes.error };
  // Qty per surat jalan dijumlahkan di klien dari baris embed — nol RPC baru,
  // nol view baru. Baris SJ selalu sedikit (1-3 per SP), jadi murah.
  const deliveries = (dRes.data || []).map(d => ({
    ...d,
    total_qty: (d.delivery_note_items || []).reduce((sum, i) => sum + (Number(i.qty) || 0), 0),
  }));
  return { data: { pickings: pRes.data || [], deliveries }, error: null };
}

// Rincian qty terkirim PER BARIS sp_items, dipecah menurut status surat jalannya.
// Dipakai tab Items di Detail SP untuk membedakan "sudah sampai" dari "masih di
// jalan" — sp_items.shipped_qty saja TIDAK bisa membedakannya: kolom itu naik
// saat dispatch_delivery (SJ berangkat), bukan saat mark_delivery_delivered
// (DC konfirmasi sampai). Tanpa pemecahan ini, baris yang qty-nya penuh tapi
// SJ-nya masih di jalan tampil "Shipped" — persis kebohongan yang diperbaiki
// state MENUNGGU_KONFIRMASI_DC di level header SP (migrasi 20260826000002).
//
// KUNCI KOMPOSIT (customer_id, sp_no) lewat embed delivery_notes — alasan sama
// persis dengan getSpFulfillmentDocs di atas (timing props vs fetch async, dan
// sp_no bisa kembar antar customer). Keduanya sengaja pakai kunci yang sama.
//
// JALUR JOIN: delivery_note_items.picking_list_item_id -> picking_list_items
// .sp_item_id. SENGAJA BUKAN delivery_note_items.sp_order_item_id — kolom itu
// menunjuk sp_order_items (skema SP baru), sedangkan tab Items dirender dari
// sp_items (skema lama) dan kunci peta ini harus cocok dengan item.id di sana.
//
// SJ 'draft' & 'cancelled' DIABAIKAN, konsisten dengan sp_recompute_status:
// draft belum menaikkan shipped_qty sama sekali, dan cancel_delivery sudah
// membalikkannya. Menghitung keduanya = dobel/hantu.
export async function getSpItemDeliveryBreakdown(customerId, spNo) {
  if (!customerId || !spNo) return { data: {}, error: null };
  const { data, error } = await supabase
    .from('delivery_note_items')
    .select('qty, picking_list_items!inner(sp_item_id), delivery_notes!inner(status)')
    .eq('delivery_notes.customer_id', customerId)
    .eq('delivery_notes.sp_no', spNo)
    .in('delivery_notes.status', ['in_transit', 'delivered'])
    .limit(1000);
  if (error) return { data: null, error };
  // Agregasi di klien: baris SJ per SP selalu sedikit (1-3 SJ x beberapa item),
  // jadi tak perlu RPC/view baru — pola sama seperti total_qty di atas.
  const map = {};
  (data || []).forEach((r) => {
    // sp_item_id NULLABLE (FK-nya ON DELETE SET NULL), jadi !inner di atas hanya
    // menjamin baris picking-nya ada — bukan bahwa ia masih menunjuk sp_items.
    // Baris yatim begitu tak bisa diatribusikan ke item mana pun; dilewati.
    const spItemId = r.picking_list_items?.sp_item_id;
    if (!spItemId) return;
    if (!map[spItemId]) map[spItemId] = { qtyDelivered: 0, qtyInTransit: 0 };
    const qty = Number(r.qty) || 0;
    if (r.delivery_notes?.status === 'delivered') map[spItemId].qtyDelivered += qty;
    else map[spItemId].qtyInTransit += qty;
  });
  return { data: map, error: null };
}

// Set qty_picked satu baris picking_list_items (partial picking). Status
// DITURUNKAN dari angkanya, tidak pernah dikirim terpisah, supaya qty dan status
// mustahil melenceng: 0 -> 'pending' · 0 < n < requested -> 'short' ·
// n = requested -> 'picked'. Nilai 'short' inilah satu-satunya penulis enum
// picking_list_items_status_check yang sebelumnya nol pemakai.
// qty di-clamp ke 0..qtyRequested + dibulatkan; input non-numerik jadi 0.
export function derivePickingItemStatus(qtyPicked, qtyRequested) {
  if (qtyPicked <= 0) return 'pending';
  if (qtyPicked >= qtyRequested) return 'picked';
  return 'short';
}

export async function setPickingItemPicked(itemId, qtyPicked, qtyRequested) {
  const req = Math.max(0, Math.floor(Number(qtyRequested) || 0));
  const qty = Math.min(Math.max(0, Math.floor(Number(qtyPicked) || 0)), req);
  const { data, error } = await supabase
    .from('picking_list_items')
    .update({
      status: derivePickingItemStatus(qty, req),
      qty_picked: qty,
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
// FASE 1: picking selesai → RPC complete_picking (set done + PERFORM sp_recompute_status
// → sp_orders.status jadi PACKED). Server-side supaya status header ikut sinkron.
export async function completePicking(pickingListId) {
  const { error } = await supabase.rpc('complete_picking', { p_picking_list_id: pickingListId });
  return { data: null, error };
}

// FASE 1: status headline SP (sp_orders 12-tahap) + flag pernah picking dibatalkan,
// untuk badge Detail SP. Kunci komposit (customer_id, sp_no). Read-only.
//
// `dc_id` + embed `dc_master(nama, alamat)` ikut di sini SENGAJA, bukan lewat
// fungsi terpisah: DC adalah atribut HEADER sp_orders, sekelas status/
// expired_date yang sudah diambil fungsi ini, jadi embed lewat FK
// sp_orders_dc_id_fkey nol round-trip tambahan. Konsumennya TUNGGAL: kartu
// "DC Tujuan" di tab Overview Detail SP. (EditItemModal sempat ikut memakainya
// sebagai field read-only, lalu field itu DIHAPUS — DC atribut level SP, bukan
// level item.) Pola resolusi DC-nya sama dengan getPrintIdentity di atas.
// inv/fp/submit/kirim/submit_date/email_status ikut di sini sejak promosi
// 2 Sep 2026 (migrasi 20260902000003): keenamnya kini atribut level SP, sumber
// kebenarannya sp_orders. Konsumennya kartu "Finance & Dokumen" tab Overview.
// Versi sp_items masih ada dan tetap disinkronkan turun oleh
// set_sp_finance_docs() — itu yang menjaga groupBySP/financePct, KPI
// FinancePage, chip OutstandingPage, dan export CSV tetap benar tanpa diubah.
// ⚠️ dc_master_read = `is_super_admin() OR company_id = get_user_company_id()`
// (varian TUNGGAL). User multi-entitas yang home-nya bukan SOA bisa dapat
// embed null walau SP-nya terbaca — semua konsumen WAJIB degrade ke '—',
// jangan asumsikan selalu terisi. Ini gejala TD-180, bukan bug fungsi ini.
export async function getSpOrderStatus(customerId, spNo) {
  const { data, error } = await supabase
    .from('sp_orders')
    .select('id, status, had_cancelled_picking, expired_date, dc_id, dc_master(nama, alamat), inv, fp, submit, kirim, submit_date, email_status')
    .eq('customer_id', customerId)
    .eq('sp_no', spNo)
    .is('deleted_at', null)
    .maybeSingle();
  return { data, error };
}

// FASE 2E (LANGKAH 0 plumbing): status headline sp_orders (12-tahap) + flag untuk
// SEMUA SP, di-merge ke groupedSP via kunci komposit (customer_id, sp_no). RLS-scoped.
export async function listSpOrderStatuses() {
  const { data, error } = await supabase
    .from('sp_orders')
    .select('customer_id, sp_no, status, had_cancelled_picking')
    .is('deleted_at', null)
    .limit(2000);
  return { data: data || [], error };
}

// Cancel picking: pending/in_progress → cancelled (+ cancelled_at).
// The SP stays eligible for a fresh generate_picking_from_sp afterwards
// (its idempotency guard ignores 'cancelled' rows) — by design.
export async function cancelPicking(pickingListId) {
  // RPC cancel_picking: set cancelled + release reservation (unreserved) atomically.
  const { error } = await supabase.rpc('cancel_picking', { p_picking_list_id: pickingListId });
  return { error };
}

// Record a packing material (kardus/lakban/etc — inventory_class='Inventory') on a
// picking list. RPC add_picking_material inserts the row + posts an 'outbound'
// stock_ledger movement (deducts stock) atomically. Returns { data: newId, error }.
export async function addPickingMaterial(pickingListId, productId, qty) {
  const { data, error } = await supabase.rpc('add_picking_material', {
    p_picking_list_id: pickingListId,
    p_product_id: productId,
    p_qty: qty,
  });
  const id = Array.isArray(data) ? data[0] : data;
  return { data: id || null, error };
}

// Remove a recorded packing material. RPC delete_picking_material deletes the row +
// reverses the stock movement (inbound, reference_type 'material_reverse') atomically.
export async function deletePickingMaterial(materialId) {
  const { error } = await supabase.rpc('delete_picking_material', { p_material_id: materialId });
  return { error };
}

// ============================================================
// DELIVERY NOTE / SURAT JALAN (Fase 3)
// ============================================================

// Generate a delivery note (surat jalan) from a DONE picking list. Atomic via
// RPC generate_delivery_from_picking (validates picking done, idempotency guard,
// numbering SJ/…, header + items copied from picked qty).
export async function generateDeliveryFromPicking(pickingListId) {
  const { data, error } = await supabase.rpc('generate_delivery_from_picking', {
    p_picking_list_id: pickingListId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return { data: row || null, error };
}

export async function listDeliveryNotes() {
  const { data, error } = await supabase
    .from('delivery_notes')
    .select('*')
    .order('created_at', { ascending: false, nullsFirst: false });
  return { data: data || [], error };
}

// Header + items. customer_name is snapshotted on delivery_notes at generate
// time (by the SECURITY DEFINER RPC) → read directly, RLS-proof (no live
// accounts query that the operations role can't pass).
export async function getDeliveryNoteDetail(deliveryNoteId) {
  const { data: header, error: hErr } = await supabase
    .from('delivery_notes').select('*').eq('id', deliveryNoteId).single();
  if (hErr) return { data: null, error: hErr };
  const { data: items, error: iErr } = await supabase
    .from('delivery_note_items').select('*')
    .eq('delivery_note_id', deliveryNoteId)
    .order('created_at', { ascending: true, nullsFirst: false });
  if (iErr) return { data: null, error: iErr };
  const { company, dc_name } = await getPrintIdentity(header.company_id, header.sp_order_id);
  return { data: { ...header, company, dc_name, items: items || [] }, error: null };
}

// Update armada + packing + destination fields (partial patch object).
export async function updateDeliveryArmada(deliveryNoteId, fields) {
  const { data, error } = await supabase
    .from('delivery_notes').update(fields).eq('id', deliveryNoteId).select('*').single();
  return { data, error };
}

// Status transition: draft → in_transit (dispatched_at) → delivered (delivered_at).
export async function setDeliveryStatus(deliveryNoteId, status) {
  // in_transit → RPC dispatch_delivery (release reservation + post outbound atomically).
  if (status === 'in_transit') {
    const { error } = await supabase.rpc('dispatch_delivery', { p_delivery_note_id: deliveryNoteId });
    return { error };
  }
  // delivered → RPC mark_delivery_delivered (FASE 2C: set delivered + delivered_at +
  // PERFORM sp_recompute_status → status SP naik ke SAMPAI). Guard in_transit-only di RPC.
  if (status === 'delivered') {
    const { error } = await supabase.rpc('mark_delivery_delivered', { p_delivery_note_id: deliveryNoteId });
    return { error };
  }
  // status lain (tak dipakai saat ini) → plain update sebagai fallback.
  const { error } = await supabase
    .from('delivery_notes').update({ status }).eq('id', deliveryNoteId);
  return { error };
}

// Cancel delivery note (draft/in_transit → cancelled + cancelled_at).
export async function cancelDelivery(deliveryNoteId) {
  // RPC cancel_delivery: cancel + reverse outbound (inbound) if already dispatched.
  const { error } = await supabase.rpc('cancel_delivery', { p_delivery_note_id: deliveryNoteId });
  return { error };
}

// Company-level stock for a set of products (aggregate across ALL warehouses).
// Returns map product_id -> { on_hand, reserved, available }.
export async function getStockForProducts(productIds) {
  const ids = (productIds || []).filter(Boolean);
  if (ids.length === 0) return { data: {}, error: null };
  const { data, error } = await supabase
    .from('stock_summary')
    .select('product_id, on_hand, reserved, available')
    .eq('company_id', 'd2e5e565-5f67-4954-b8d9-5979a2a0c697')
    .in('product_id', ids);
  if (error) return { data: {}, error };
  const map = {};
  (data || []).forEach((r) => {
    const m = map[r.product_id] || { on_hand: 0, reserved: 0, available: 0 };
    m.on_hand   += Number(r.on_hand)   || 0;   // SUM across warehouses (company-level)
    m.reserved  += Number(r.reserved)  || 0;
    m.available += Number(r.available) || 0;
    map[r.product_id] = m;
  });
  return { data: map, error: null };
}

// ============================================================
// RACK LOCATION (product_warehouse_location) — per (product × warehouse)
// ============================================================
const SOA_COMPANY_ID = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';

// All rack locations for Storbit/SOA. Returns a map keyed by
// `${product_id}|${warehouse_id}` -> rack_location string.
export async function getProductRackLocations() {
  const { data, error } = await supabase
    .from('product_warehouse_location')
    .select('product_id, warehouse_id, rack_location')
    .eq('company_id', SOA_COMPANY_ID)
    .limit(1000);
  if (error) return { data: {}, error };
  const map = {};
  (data || []).forEach((r) => {
    map[`${r.product_id}|${r.warehouse_id}`] = r.rack_location || '';
  });
  return { data: map, error: null };
}

// Upsert one rack location (conflict target: product_id + warehouse_id).
export async function upsertProductRackLocation({ productId, warehouseId, rackLocation, companyId, userId }) {
  const { data, error } = await supabase
    .from('product_warehouse_location')
    .upsert(
      {
        company_id: companyId,
        product_id: productId,
        warehouse_id: warehouseId,
        rack_location: rackLocation,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id,warehouse_id' },
    )
    .select('*')
    .single();
  return { data, error };
}

// --- Delivery note item edits (Fase 3 / Opsi C) — only while DN is 'draft' (gated in UI) ---
export async function updateDeliveryItemQty(itemId, qty) {
  const { data, error } = await supabase
    .from('delivery_note_items')
    .update({ qty: Number(qty) || 0 })
    .eq('id', itemId).select('*').single();
  return { data, error };
}

export async function deleteDeliveryItem(itemId) {
  const { error } = await supabase.from('delivery_note_items').delete().eq('id', itemId);
  return { error };
}

// Add an extra item (di luar picking) — product_id snapshot + name/sku; picking_list_item_id NULL.
export async function addDeliveryItem(deliveryNoteId, { product_id = null, product_name = '', sku = '', qty = 0 }) {
  const { data, error } = await supabase
    .from('delivery_note_items')
    .insert({ delivery_note_id: deliveryNoteId, product_id, product_name, sku, qty: Number(qty) || 0 })
    .select('*').single();
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

  // Insert btbs — tanpa guard invoice_id (beda dengan updateTtf): ttfToDb()
  // tak pernah menulis invoice_id, jadi TTF baru selalu lahir belum tertaut.
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
  // .select('invoice_id') menumpang pada UPDATE yang memang sudah jalan —
  // nilainya dipakai sebagai guard di bawah, tanpa roundtrip tambahan.
  const { data: header, error: headerErr } = await supabase
    .from('ar_ttfs')
    .update(headerPayload)
    .eq('id', id)
    .select('invoice_id')
    .single();
  if (headerErr) return { data: null, error: headerErr };

  // Jaring pengaman anti double-entry: begitu TTF tertaut ke sebuah invoice,
  // seluruh sisi uang dikelola di sp_invoice_lines/sp_payments lewat Detail SP
  // (DESIGN_SP_SCHEMA.md §2.5). Blok DELETE + re-INSERT ar_btbs di bawah
  // di-skip SELURUHNYA — bukan sebagian — sejalan dengan ARModal yang
  // merender baris BTB sebagai read-only untuk TTF yang sama.
  // Guard sengaja dibaca dari DB, bukan dari state klien yang bisa basi.
  // Header (No. TTF, tanggal, No. INV/SP, customer, notes) tetap tersimpan.
  const btbLocked = !!header?.invoice_id;

  if (!btbLocked) {
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

// ─── sp_btb — BTB entitas (FASE 3) ───────────────────────────────────────
// Tabel benar (FK sp_order_id/delivery_note_id/customer_id, qty, RLS scoped).
// Ditulis/dihapus via RPC (sp_issue_btb/sp_delete_btb) yang set fakta +
// PERFORM sp_recompute_status → BTB_TERBIT (rank tertinggi, kalahkan
// TERKIRIM_PENUH). Menggantikan jalur sp_btbs legacy (helper lama ditahan
// sampai cutover Step E/F).

/** Terbitkan BTB untuk sebuah SP via RPC (idempoten per btb_no hidup). Returns { data: btb_id, error }. */
export async function issueSpBtb({ customerId, spNo, btbNo, qty = null, btbDate = null, deliveryNoteId = null, remarks = null }) {
  const { data, error } = await supabase.rpc('sp_issue_btb', {
    p_customer_id: customerId,   // identitas komposit (customer_id, sp_no)
    p_sp_no: spNo,
    p_btb_no: btbNo,
    p_qty: qty,
    p_btb_date: btbDate,
    p_delivery_note_id: deliveryNoteId,
    p_remarks: remarks,
  });
  return { data, error }; // data = uuid baris sp_btb (baru atau existing bila idempoten)
}

/** Soft-delete BTB by row id via RPC (+recompute mundur). Returns { error }. */
export async function deleteSpBtbNew(id) {
  const { error } = await supabase.rpc('sp_delete_btb', { p_btb_id: id });
  return { error };
}

/** Fetch BTB hidup untuk sebuah SP (via sp_order_id). Returns { data: [], error }. */
export async function listSpBtbNew(spOrderId) {
  const { data, error } = await supabase
    .from('sp_btb')
    .select('id, btb_no, qty, btb_date, remarks, created_at')
    .eq('sp_order_id', spOrderId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}

// FASE 4 (Invoice) — sp_invoices dibaca via sp_order_id, ditulis lewat RPC
// create_invoice/submit_invoice saja (kolom status/invoice_no/total_* di-GRANT
// kolom-spesifik, tak bisa ditulis langsung — lihat migrasi Fase 4).

/** Fetch invoice aktif untuk sebuah SP (via sp_order_id). Returns { data: row|null, error }. */
export async function getSpInvoice(spOrderId) {
  const { data, error } = await supabase
    .from('sp_invoices')
    .select('id, invoice_no, invoice_date, due_date, status, total_dpp, total_ppn, total_amount')
    .eq('sp_order_id', spOrderId)
    .is('deleted_at', null)
    .maybeSingle();
  return { data, error };
}

/** Terbitkan invoice via RPC (guard Σshipped=Σqty di server). Returns { data: invoice_id, error }. */
export async function createInvoiceRpc(spOrderId) {
  const { data, error } = await supabase.rpc('create_invoice', { p_sp_order_id: spOrderId });
  return { data, error };
}

/** Submit invoice via RPC (submitted_at terisi otomatis server-side). Returns { error }. */
export async function submitInvoiceRpc(invoiceId) {
  const { error } = await supabase.rpc('submit_invoice', { p_invoice_id: invoiceId });
  return { error };
}

// ============================================================
// FASE 5 — Pembayaran & TTF (konsumer RPC record_payment / mark_ttf_received)
// Keduanya SECURITY DEFINER dgn guard peran di dalam fungsi; pesan RAISE-nya
// sudah berbahasa Indonesia & manusiawi, jadi caller cukup meneruskan
// error.message apa adanya ke toast (jangan dibungkus pesan generik).
// ============================================================

/** Catat pembayaran invoice via RPC record_payment. Returns { data: paymentId, error }. */
export async function recordPayment({
  invoiceId, amount, paymentDate = null, reference = null,
  pph = 0, buktiPotongUrl = null, buktiPotongNo = null,
}) {
  const { data, error } = await supabase.rpc('record_payment', {
    p_invoice_id:       invoiceId,
    p_amount:           Number(amount) || 0,
    p_payment_date:     paymentDate || null,
    p_reference:        reference || null,
    p_pph:              Number(pph) || 0,
    p_bukti_potong_url: buktiPotongUrl || null,
    p_bukti_potong_no:  buktiPotongNo || null,
  });
  return { data, error };
}

/** Tandai TTF diterima customer via RPC mark_ttf_received. Returns { data: ttfId, error }. */
export async function markTtfReceived({ invoiceId, receivedBy, ttfNo = null, notes = null }) {
  const { data, error } = await supabase.rpc('mark_ttf_received', {
    p_invoice_id:  invoiceId,
    p_received_by: receivedBy,
    p_ttf_no:      ttfNo || null,
    p_notes:       notes || null,
  });
  return { data, error };
}

/** Riwayat pembayaran satu invoice, terbaru dulu. */
export async function getPaymentHistory(invoiceId) {
  const { data, error } = await supabase
    .from('sp_payments')
    .select('id, payment_date, amount, pph, reference, bukti_potong_url, bukti_potong_no, created_at')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  return { data: data || [], error };
}

// Status TTF satu invoice. `ar_ttfs` TIDAK punya UNIQUE di invoice_id, jadi
// secara teori bisa >1 baris — ambil yang tertua, PERSIS sama dengan baris yang
// dipilih RPC mark_ttf_received di dalamnya (ORDER BY created_at LIMIT 1).
export async function getTtfStatus(invoiceId) {
  const { data, error } = await supabase
    .from('ar_ttfs')
    .select('id, no_ttf, tanggal_menerima, diterima_oleh, notes')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { data: data || null, error };
}

// Kop surat entitas untuk preview dokumen on-screen (bukan PDF) — subset kolom
// yang sama dengan yang dipakai getInvoicePdfData di bawah, tanpa join apa pun.
// Dipakai panel "Dokumen & Invoice" di SalesOrderDetailPage.
export async function getCompanyHeader(companyId) {
  if (!companyId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('companies')
    .select('name, legal_name, address, address_2, city, province, postal_code')
    .eq('id', companyId)
    .maybeSingle();
  return { data: data || null, error };
}

// Kumpulkan SEMUA data buat cetak InvoicePDF dalam satu panggilan — mirror
// pola pl/dn (PickingListPDF/DeliveryNotePDF): satu objek flat, semua query
// di sini biar InvoicePDF.jsx murni presentasi. company_id diambil dari baris
// sp_orders yang bersangkutan (bukan hardcode SOA_COMPANY_ID di sini) supaya
// tetap benar kalau modul ini kelak dipakai entitas lain.
export async function getInvoicePdfData(invoiceId) {
  const { data: inv, error: invErr } = await supabase
    .from('sp_invoices')
    .select('id, invoice_no, invoice_date, due_date, faktur_no, status, total_dpp, total_ppn, total_amount, sp_order_id, sp_orders(sp_no, customer_id, dc_id, company_id)')
    .eq('id', invoiceId)
    .single();
  if (invErr) return { data: null, error: invErr };

  const spOrder = inv.sp_orders || {};
  const companyId = spOrder.company_id || null;

  const [linesRes, customerRes, dcRes, companyRes, bankRes, shippingRes] = await Promise.all([
    supabase
      .from('sp_invoice_lines')
      .select('id, dpp, ppn, qty, position, sp_order_items(product_name, sku, unit_price)')
      .eq('invoice_id', invoiceId)
      .order('position', { ascending: true }),
    spOrder.customer_id
      ? supabase.from('accounts').select('name').eq('id', spOrder.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    spOrder.dc_id
      ? supabase.from('dc_master').select('nama').eq('id', spOrder.dc_id).maybeSingle()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase.from('companies').select('legal_name, address, address_2, city, province, postal_code, tax_id').eq('id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase.from('entity_bank_accounts').select('bank_name, account_number, account_holder, branch').eq('company_id', companyId).eq('is_default', true).eq('is_active', true).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('sp_order_items').select('shipping_price').eq('sp_order_id', inv.sp_order_id),
  ]);

  const firstError = linesRes.error || customerRes.error || dcRes.error || companyRes.error || bankRes.error || shippingRes.error || null;
  const totalShipping = (shippingRes.data || []).reduce((sum, r) => sum + (Number(r.shipping_price) || 0), 0);

  return {
    data: {
      id: inv.id,
      invoice_no: inv.invoice_no,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      faktur_no: inv.faktur_no,
      status: inv.status,
      total_dpp: inv.total_dpp,
      total_ppn: inv.total_ppn,
      total_amount: inv.total_amount,
      total_shipping: totalShipping,
      sp_no: spOrder.sp_no || '',
      customer_name: customerRes.data?.name || '',
      dc_name: dcRes.data?.nama || '',
      company: companyRes.data || {},
      bank: bankRes.data || null,
      lines: (linesRes.data || []).map((l) => ({
        id: l.id,
        product_name: l.sp_order_items?.product_name || '',
        sku: l.sp_order_items?.sku || '',
        unit_price: Number(l.sp_order_items?.unit_price) || 0,
        qty: l.qty,
        dpp: Number(l.dpp) || 0,
      })),
    },
    error: firstError,
  };
}

// Dual-write (Fase 0 lanjutan, D2-A): tulis header + items ke skema SP BARU
// (sp_orders + sp_order_items) secara atomik via RPC create_sp_order_dual.
// Dipanggil SETELAH bulkInsertSpItems (yang tetap sumber sp_items lama) agar
// legacy_sp_item_id bisa menunjuk ke baris sp_items yang bersesuaian.
// `items` = array of { product_id, product_name, sku, qty, unit_price,
//   price_category (null|'semester'|'tahunan'|'project'), shipping_price,
//   legacy_sp_item_id }. Duplikat (customer_id, sp_no) → RPC RAISE unique_violation.
export async function createSpOrderDual({
  companyId, customerId, spNo, spDate, dcId, status, expiredDate, notes, items,
}) {
  const { data, error } = await supabase.rpc('create_sp_order_dual', {
    p_company_id:   companyId,
    p_customer_id:  customerId,
    p_sp_no:        spNo,
    p_sp_date:      spDate || null,
    p_dc_id:        dcId,
    p_status:       status || 'DRAFT',
    p_expired_date: expiredDate || null,
    p_notes:        notes || null,
    p_items:        items,
  });
  return { data, error };
}

// Tipe SP level header (sp_orders.price_category) — ditulis UPDATE TERPISAH
// setelah create_sp_order_dual, bukan lewat parameter RPC: signature RPC tak
// bisa ditambah tanpa DROP+CREATE atas jalur tulis SP yang paling ramai.
// Aman karena RLS sp_orders_update syaratnya IDENTIK dgn sp_orders_insert
// (company + is_manager_or_above() OR has_role('operations'), bypass super_admin)
// — yang lolos membuat SP pasti lolos meng-update-nya. Prasyarat satu-satunya:
// GRANT UPDATE(price_category) (migrasi 20260818000001), karena sp_orders tak
// punya table-level GRANT UPDATE sejak fix TD-175.
/** Set tipe SP (header). cat = 'semester'|'tahunan'|'project'|null. Returns { error }. */
export async function setSpOrderPriceCategory(orderId, cat) {
  const { error } = await supabase
    .from('sp_orders')
    .update({ price_category: cat || null })
    .eq('id', orderId);
  return { error };
}

// ─── Dashboard Storbit — agregasi read-only ──────────────────────────────────
// Satu panggilan RPC untuk SELURUH angka kartu (9 Shipping Manifest + 4
// Warehouse), bukan belasan round-trip atau agregasi client-side. Agregasi
// sengaja di DB: pola yang sama dipakai indomarco_dashboard_stats untuk lepas
// dari potong-diam-diam .limit(1000) — masalah yang masih hidup di
// InventoryDashboardPage (stock_ledger 12 minggu, dihitung di client).
//
// RPC-nya SECURITY INVOKER + STABLE, jadi RLS pemanggil tetap berlaku.
// companyId WAJIB dikirim eksplisit: RLS sp_orders_read/products_read
// meloloskan SEMUA entitas untuk super_admin, dan stock_ledger_select =
// USING(true) (TD-173) membuat view stock_summary nol isolasi entitas. Kalau
// null, RPC fallback ke get_user_company_id() di sisi DB.
//
// ⚠️ KOREKSI 18 Agu 2026 — komentar lama di sini menulis companyId datang dari
// AuthContext.activeCompanyId "bukan hardcode UUID SOA, jadi tidak menambah
// kasus TD-178". Itu SUDAH TIDAK BENAR, dan kebalikannya yang berlaku:
// activeCompanyId dicoba lebih dulu dan GAGAL — seluruh kartu menampilkan 0
// karena activeCompanyId = home company user (bisa MSI/JCI) sementara seluruh
// data Storbit ada di SOA, dan gagalnya senyap (agregat tetap mengembalikan
// satu baris berisi nol → error null → nol toast). Satu-satunya pemanggil,
// StorbitDashboardPage.jsx, kini HARDCODE SOA_COMPANY_ID → ini MEMANG kasus
// TD-178 di FE. Parameter companyId di sini tetap dipertahankan karena ia
// jalan keluarnya saat TD-178 dibereskan (cukup ubah pemanggil, bukan wrapper
// ini), dengan syarat disertai empty-state untuk entitas non-SOA.
//
// Bentuk return: { manifest: {...11 angka}, warehouse: {...4 angka}, generated_at }.
// Daftar status di balik angka-angka itu: src/lib/spStatusConstants.js.
//
// ⛔ manifest.pernah_risiko_pinalti TIDAK BOLEH dirender sendirian — WAJIB
// berpasangan dgn manifest.dispatch_data_tersedia sbg penyebut. Cakupan data
// pengiriman baru 16,2% (69/425 SP, 18 Agu 2026), jadi angka pinalti yang kecil
// bukan berarti aman — datanya yang belum ada. Lihat PENALTY_METRIC_PAIR di
// spStatusConstants.js.
/**
 * Ambil agregat Dashboard Storbit. Semua argumen opsional (null = tanpa filter).
 * @param {string|null} customerId    - filter satu customer
 * @param {string|null} priceCategory - 'semester'|'tahunan'|'project'
 * @param {string|null} companyId     - entitas aktif; null = home company pemanggil
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function getStorbitDashboardStats(customerId = null, priceCategory = null, companyId = null) {
  const { data, error } = await supabase.rpc('get_storbit_dashboard_stats', {
    p_customer_id:    customerId    || null,
    p_price_category: priceCategory || null,
    p_company_id:     companyId     || null,
  });
  return { data, error };
}

// Drill-down — daftar baris di balik tiap kartu. SENGAJA lewat RPC untuk
// SEMUA kategori, termasuk yang sebenarnya bisa dilayani PostgREST: empat
// kategori (delivered_belum_btb, expired, mendekati_expired,
// pernah_risiko_pinalti) memang mustahil dinyatakan lewat PostgREST, dan
// menjalankan sisanya lewat jalur berbeda berarti dua bentuk baris + dua
// tempat filter scope yang harus dijaga sinkron. Satu jalur = angka kartu dan
// isi tabel dijamin lahir dari CTE + WHERE yang sama (migrasi 20260818000003).
// Kategori tak dikenal mengembalikan nol baris, bukan seluruh tabel.
/**
 * Baris SP untuk satu kategori kartu Shipping Manifest.
 * @param {string} category - salah satu kunci di STATUS_GROUPS + terkirim_penuh /
 *                            expired / mendekati_expired / pernah_risiko_pinalti
 * @returns {Promise<{data: Array, error: object|null}>}
 */
export async function getStorbitSpDrilldown(category, { customerId = null, priceCategory = null, companyId = null, limit = 200 } = {}) {
  const { data, error } = await supabase.rpc('get_storbit_sp_drilldown', {
    p_category:       category,
    p_customer_id:    customerId    || null,
    p_price_category: priceCategory || null,
    p_company_id:     companyId     || null,
    p_limit:          limit,
  });
  return { data: data || [], error };
}

/**
 * Baris produk untuk satu kategori kartu Warehouse.
 * @param {string} category - 'danger_stock' | 'zero_stock' | 'rop_belum_diisi'
 * @returns {Promise<{data: Array, error: object|null}>}
 */
export async function getStorbitStockDrilldown(category, { companyId = null, limit = 200 } = {}) {
  const { data, error } = await supabase.rpc('get_storbit_stock_drilldown', {
    p_category:   category,
    p_company_id: companyId || null,
    p_limit:      limit,
  });
  return { data: data || [], error };
}

// ── Laporan Per Barang (Dashboard Storbit) ──────────────────────────────────
// Empat RPC dari migrasi 20260905000001. Lingkup barisnya SAMA PERSIS di
// keempatnya (sp_orders.deleted_at IS NULL AND status NOT IN
// ('CANCELLED','DRAFT')) dan ditulis sebagai CTE bersama di SQL — jadi angka
// kartu, tabel, dan file export mustahil drift satu sama lain.
//
// ⚠️ SELURUH nilai rupiah dari ketiganya (kecuali `piutang` di
// getStorbitOutstandingSummary) adalah DPP — BELUM termasuk PPN. Label di UI
// wajib menyatakan itu; lihat COMMENT ON FUNCTION di migrasinya.

/**
 * Laporan satu produk: ringkasan + rincian per customer.
 * @param {string} productId
 * @returns {Promise<{data: object|null, error: object|null}>}
 *          data = { summary: {...}, per_customer: [...], generated_at }
 */
export async function getStorbitProductReport(productId, { companyId = null, dateFrom = null, dateTo = null } = {}) {
  const { data, error } = await supabase.rpc('get_storbit_product_report', {
    p_product_id: productId,
    p_company_id: companyId || null,
    p_date_from:  dateFrom  || null,
    p_date_to:    dateTo    || null,
  });
  return { data: data || null, error };
}

/**
 * Daftar SP yang memuat satu produk, satu baris per SP.
 *
 * `limit` sengaja dibuka sebagai parameter: layar memakai 200, export memakai
 * angka jauh lebih tinggi supaya file tak terpotong diam-diam. Pemanggil WAJIB
 * membandingkan panjang hasil dengan limit yang dikirim — kalau menyentuh
 * limit, peringatkan user SEBELUM file dibuat.
 *
 * @returns {Promise<{data: Array, error: object|null}>}
 */
export async function getStorbitProductSpList(productId, { companyId = null, dateFrom = null, dateTo = null, limit = 200 } = {}) {
  const { data, error } = await supabase.rpc('get_storbit_product_sp_list', {
    p_product_id: productId,
    p_company_id: companyId || null,
    p_date_from:  dateFrom  || null,
    p_date_to:    dateTo    || null,
    p_limit:      limit,
  });
  return { data: data || [], error };
}

/**
 * Tiga angka outstanding: kirim / tagih / piutang.
 * kirim & tagih DPP tanpa PPN; piutang BRUTO (total_amount sudah termasuk PPN).
 * Ketiganya JANGAN dijumlahkan — beda basis pajak.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function getStorbitOutstandingSummary({ companyId = null, customerId = null, priceCategory = null } = {}) {
  const { data, error } = await supabase.rpc('get_storbit_outstanding_summary', {
    p_company_id:     companyId     || null,
    p_customer_id:    customerId    || null,
    p_price_category: priceCategory || null,
  });
  return { data: data || null, error };
}

/**
 * Produk dengan nilai outstanding terbesar.
 *
 * RPC-nya SENGAJA tidak memfilter sisa > 0, jadi dengan `limit` tinggi fungsi
 * ini sekaligus mengembalikan SELURUH produk yang pernah muncul di SP (38 per
 * 5 Sep 2026). Halaman dashboard memakainya untuk DUA hal dari SATU panggilan:
 * isi combobox produk (semua baris) dan tabel Top 10 (10 baris pertama, sudah
 * urut nilai DESC). Satu sumber = mustahil drift antara dropdown dan tabel.
 *
 * @returns {Promise<{data: Array, error: object|null}>}
 */
export async function getStorbitTopOutstandingProducts({ companyId = null, limit = 10 } = {}) {
  const { data, error } = await supabase.rpc('get_storbit_top_outstanding_products', {
    p_company_id: companyId || null,
    p_limit:      limit,
  });
  return { data: data || [], error };
}
