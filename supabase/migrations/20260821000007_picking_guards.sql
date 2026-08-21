-- =============================================================================
-- Migration: 20260821000004_picking_guards
-- Task 4 — tutup gap otorisasi rantai picking/surat jalan (4 RPC).
--
-- ⚠️⚠️ URUTAN WAJIB: file ini HARUS dijalankan SETELAH
--      20260821000001_partial-picking-guard.sql.
--      Body generate_picking_from_sp di bawah diambil dari file migrasi ITU
--      (bukan dari schema_snapshot.sql, yang masih memuat guard lama), jadi
--      guard partial-picking IKUT TERBAWA di sini. Kalau file ini dijalankan
--      lebih dulu, hasil akhirnya tetap benar untuk kedua guard — tapi
--      20260821000001 menjadi usang dan TIDAK BOLEH dijalankan sesudahnya
--      (ia akan menghapus guard otorisasi). Jalankan sesuai nomor.
--
-- ⚠️ BELUM DIJALANKAN. Dijalankan manual di SQL Editor oleh Den.
--
-- MASALAH: keempat RPC SECURITY DEFINER (RLS DILEWATI) dengan NOL pengecekan
--   otorisasi, GRANT ALL TO authenticated. generate_picking_from_sp bahkan
--   MERESERVASI STOK. Tabel picking_lists/_items/_materials + delivery_notes
--   semuanya ber-RLS USING(true), jadi tak ada lapisan lain yang menahan.
--
-- SUMBER: generate_picking_from_sp dari migrasi 20260821000001; tiga sisanya
--   dari schema_snapshot.sql. Diambil TERPROGRAM. Perubahan = blok guard saja
--   (+ pada delete_picking_material: 1 var DECLARE dan 1 SELECT, karena
--   company_id belum tersedia di sana) dan CREATE FUNCTION -> CREATE OR REPLACE.
--
-- CATATAN TD-178: v_company_id/v_company pada RPC picking adalah UUID SOA yang
--   di-hardcode, bukan diturunkan dari baris. Guard tetap benar, tapi maknanya
--   "user punya role aktif di SOA". TD-178 SENGAJA tidak diperbaiki di sini.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid) RETURNS TABLE(picking_list_id uuid, picking_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_wh uuid := COALESCE(p_warehouse_id, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  v_entity text; v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_pl_id uuid; v_uid uuid := auth.uid(); v_outstanding int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no; END IF;
  IF NOT (is_super_admin() OR (v_company_id IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membuat picking list untuk SP ini';
  END IF;
  -- (1) Picking masih AKTIF (pending/in_progress) -> blokir. Perilaku lama.
  IF EXISTS (SELECT 1 FROM picking_lists WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND status IN ('pending','in_progress')) THEN
    RAISE EXCEPTION 'Picking list untuk SP % sudah ada', p_sp_no; END IF;
  -- (2) Picking DONE yang reservasi stoknya BELUM dilepas -> blokir.
  --     Reservasi picking hanya dilepas di dua tempat, keduanya satu arah:
  --     cancel_picking (picking -> cancelled) dan dispatch_delivery (SJ berangkat).
  --     Dipakai `dispatched_at IS NOT NULL`, BUKAN status IN ('in_transit','delivered'),
  --     karena yang ditanya di sini "PERNAH berangkat" bukan "sedang berangkat":
  --     cancel_delivery membalik shipped_qty + mengembalikan stok tapi TIDAK
  --     me-reserve ulang picking-nya, dan tidak pernah me-reset dispatched_at.
  --     Pola yang sama sudah dipakai get_storbit_dashboard_stats (pernah_risiko_pinalti).
  IF EXISTS (
    SELECT 1 FROM picking_lists pl
    WHERE pl.sp_no = p_sp_no AND pl.customer_id = p_customer_id
      AND pl.status = 'done'
      AND NOT EXISTS (
        SELECT 1 FROM delivery_notes dn
        WHERE dn.picking_list_id = pl.id
          AND dn.dispatched_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Picking list SP % sudah selesai tapi surat jalannya belum diberangkatkan - berangkatkan dulu sebelum membuat picking baru', p_sp_no; END IF;
  SELECT count(*) INTO v_outstanding FROM sp_items
    WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed' AND (qty - shipped_qty) > 0;
  IF v_outstanding = 0 THEN RAISE EXCEPTION 'SP % tidak punya item outstanding', p_sp_no; END IF;
  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id,'PICK','WH',v_year,0);
  v_no  := 'PICK/'||COALESCE(v_entity,'SOA')||'/WH/'||v_year||'/'||lpad(v_seq::text,4,'0');
  INSERT INTO picking_lists (company_id, picking_no, sp_no, warehouse_id, status, created_by, customer_id)
  VALUES (v_company_id, v_no, p_sp_no, v_wh, 'pending', v_uid, p_customer_id)
  RETURNING id INTO v_pl_id;
  WITH src AS (
    SELECT si.id AS sp_item_id, si.product_id, si.product_name, si.sku,
           GREATEST(si.qty - si.shipped_qty, 0) AS req
    FROM sp_items si
    WHERE si.sp_no=p_sp_no AND si.customer_id=p_customer_id AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
  ),
  av AS (
    SELECT src.*,
           COALESCE((SELECT SUM(ss.available) FROM stock_summary ss
                     WHERE ss.company_id = v_company_id AND ss.product_id = src.product_id), 0) AS avail
    FROM src
  ),
  ins_items AS (
    INSERT INTO picking_list_items
      (picking_list_id, sp_item_id, product_id, product_name, sku, qty_requested, qty_short, location_detail)
    SELECT v_pl_id, sp_item_id, product_id, product_name, sku, req,
           CASE WHEN product_id IS NULL THEN 0 ELSE GREATEST(req - LEAST(req, avail), 0) END,
           (SELECT pwl.rack_location FROM product_warehouse_location pwl
             WHERE pwl.product_id = av.product_id AND pwl.warehouse_id = v_wh LIMIT 1)
    FROM av
    RETURNING 1
  )
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company_id, v_wh, product_id, 'reserved', LEAST(req, avail), 'picking', v_pl_id, v_no, v_uid
  FROM av
  WHERE product_id IS NOT NULL AND LEAST(req, avail) > 0;
  PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  RETURN QUERY SELECT v_pl_id, v_no;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_delivery_from_picking(p_picking_list_id uuid) RETURNS TABLE(delivery_note_id uuid, do_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_entity text;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_dn_id uuid; v_uid uuid := auth.uid();
  v_sp_no text; v_pick_status text;
  v_customer uuid; v_cust_name text; v_addr text;
  v_item_count int;
BEGIN
  SELECT sp_no, status, customer_id INTO v_sp_no, v_pick_status, v_customer
    FROM picking_lists WHERE id = p_picking_list_id;
  IF v_sp_no IS NULL THEN RAISE EXCEPTION 'Picking list tidak ditemukan'; END IF;
  IF v_pick_status <> 'done' THEN RAISE EXCEPTION 'Picking list belum selesai (status=%)', v_pick_status; END IF;
  IF NOT (is_super_admin() OR (v_company_id IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membuat surat jalan untuk picking ini';
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id = p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan untuk picking ini sudah ada'; END IF;
  SELECT count(*) INTO v_item_count FROM picking_list_items
    WHERE picking_list_id = p_picking_list_id AND COALESCE(qty_picked,0) > 0;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'Tak ada item ter-pick untuk dikirim'; END IF;

  IF v_customer IS NULL THEN
    SELECT si.customer_id INTO v_customer FROM sp_items si WHERE si.sp_no = v_sp_no LIMIT 1;
  END IF;
  SELECT a.name, a.address INTO v_cust_name, v_addr FROM accounts a WHERE a.id = v_customer;

  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'SJ', 'WH', v_year, 0);
  v_no  := 'SJ/' || COALESCE(v_entity,'SOA') || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  INSERT INTO delivery_notes
    (company_id, do_no, sp_no, picking_list_id, customer_id, customer_name, destination_address, status, created_by)
  VALUES (v_company_id, v_no, v_sp_no, p_picking_list_id, v_customer, v_cust_name, v_addr, 'draft', v_uid)
  RETURNING id INTO v_dn_id;

  INSERT INTO delivery_note_items (delivery_note_id, picking_list_item_id, product_id, product_name, sku, qty)
  SELECT v_dn_id, pli.id, pli.product_id, pli.product_name, pli.sku, pli.qty_picked
  FROM picking_list_items pli
  WHERE pli.picking_list_id = p_picking_list_id AND COALESCE(pli.qty_picked,0) > 0;

  RETURN QUERY SELECT v_dn_id, v_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_picking_material(p_picking_list_id uuid, p_product_id uuid, p_qty integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
        v_wh uuid; v_status text; v_no text; v_uid uuid := auth.uid();
        v_pname text; v_sku text; v_mid uuid;
BEGIN
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id wajib'; END IF;
  IF COALESCE(p_qty,0) <= 0 THEN RAISE EXCEPTION 'qty harus > 0'; END IF;
  SELECT status, warehouse_id, picking_no INTO v_status, v_wh, v_no FROM picking_lists WHERE id=p_picking_list_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status <> 'done' THEN RAISE EXCEPTION 'Material hanya bisa dicatat saat picking selesai (status=%)', v_status; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mencatat material packing';
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id=p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan sudah dibuat — material tak bisa ditambah lagi'; END IF;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  SELECT name, code INTO v_pname, v_sku FROM products WHERE id=p_product_id;
  IF v_pname IS NULL THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  INSERT INTO picking_list_materials (picking_list_id, product_id, product_name, sku, qty, created_by)
  VALUES (p_picking_list_id, p_product_id, v_pname, COALESCE(v_sku,''), p_qty, v_uid)
  RETURNING id INTO v_mid;

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  VALUES (v_company, v_wh, p_product_id, 'outbound', -abs(p_qty), 'picking_material', v_mid, v_no, v_uid);

  RETURN v_mid;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_picking_material(p_material_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_pick uuid; v_uid uuid := auth.uid(); v_company uuid;
BEGIN
  SELECT picking_list_id INTO v_pick FROM picking_list_materials WHERE id=p_material_id;
  IF v_pick IS NULL THEN RAISE EXCEPTION 'Material tidak ditemukan'; END IF;
  SELECT company_id INTO v_company FROM picking_lists WHERE id = v_pick;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus material packing';
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id=v_pick AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Tak bisa hapus material: surat jalan sudah dibuat'; END IF;
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'material_reverse', p_material_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking_material' AND reference_id=p_material_id AND movement_type='outbound';
  DELETE FROM public.picking_list_materials WHERE id=p_material_id;
END; $$;
