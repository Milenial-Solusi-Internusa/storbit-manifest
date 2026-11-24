-- =============================================================================
-- Migration: 20261124000002_td173_batch2_rpc_company_scope
-- Phase:     TD-173 lanjutan -- 3 RPC SECURITY DEFINER (dispatch_delivery,
--            generate_picking_from_sp, mark_delivery_delivered dua overload)
--            ditemukan memakai company_id HARDCODE (dua yang pertama) atau
--            NOL cek company sama sekali (mark_delivery_delivered) -- bypass
--            total RLS tabel yang sudah dibenahi Batch 1
--            (20261124000001_td173_batch1_rls_company_scope.sql).
--
--            mark_delivery_delivered genuinely exploitable hari ini oleh
--            4 user nyata (manager/operations level, nol role aktif di SOA):
--            faried.prasetyo@msigroup.co.id, faris.el@msigroup.co.id,
--            kahfi.wabula@msigroup.co.id, rini.andriyani@msigroup.co.id.
--
-- Status:    LIVE staging DAN production (24 Nov 2026). ⚠️ Staging hanya 3 fungsi
--            (dispatch_delivery, generate_picking_from_sp, mark_delivery_delivered
--            2-arg) -- staging TIDAK punya overload mark_delivery_delivered(uuid)
--            1-arg (sudah di-DROP sebelumnya, TD-263). Production LIVE keempat
--            fungsi termasuk overload 1-arg itu (masih ada di production).
--            V-PRA/V-POST rollback-test penuh di staging dulu, lalu diverifikasi
--            read-only di production (prosrc: nol hardcode SOA, ada is_super_admin()
--            + get_user_company_ids()). Nol kegagalan.
-- RELEASE-PACKAGE:  pra (sudah dieksekusi manual kedua lingkungan)
-- DEPENDS-ON:       20261124000001_td173_batch1_rls_company_scope.sql (tidak wajib,
--                   tapi satu rangkaian kerja yang sama)
-- PROBE:            SELECT COALESCE((SELECT prosrc NOT LIKE '%d2e5e565-5f67-4954-b8d9-5979a2a0c697%' FROM pg_proc WHERE proname='generate_picking_from_sp' AND pronamespace='public'::regnamespace), false);
--
-- -- Pola yang dipakai -------------------------------------------------------
-- company_id dibaca dari baris sumber (delivery_notes.company_id untuk
-- dispatch_delivery/mark_delivery_delivered; sp_orders.company_id untuk
-- generate_picking_from_sp), lalu dicek is_super_admin() OR (v_company
-- IN (SELECT get_user_company_ids()) AND (is_manager_or_above() OR
-- has_role('operations'))) -- pola identik cancel_picking/set_sp_expired_date
-- yang sudah terbukti benar. Nol perubahan logika bisnis lain.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_delivery(p_delivery_note_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_status text; v_pick uuid; v_wh uuid; v_no text; v_uid uuid := auth.uid();
        v_cust uuid; v_sp text;
BEGIN
  SELECT status, picking_list_id, do_no, customer_id, sp_no, company_id
    INTO v_status, v_pick, v_no, v_cust, v_sp, v_company
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Hanya surat jalan draft yang bisa diberangkatkan (status=%)', v_status; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak memberangkatkan surat jalan ini';
  END IF;
  SELECT warehouse_id INTO v_wh FROM picking_lists WHERE id=v_pick;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking' AND reference_id=v_pick AND movement_type='reserved';

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company, v_wh, dni.product_id, 'outbound', -abs(dni.qty), 'delivery', p_delivery_note_id, v_no, v_uid
  FROM delivery_note_items dni
  WHERE dni.delivery_note_id=p_delivery_note_id AND dni.product_id IS NOT NULL AND COALESCE(dni.qty,0) > 0;

  UPDATE delivery_notes SET status='in_transit', dispatched_at=now() WHERE id=p_delivery_note_id;

  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_items si SET shipped_qty = si.shipped_qty + agg.qty, updated_at = now()
  FROM agg WHERE si.id = agg.sp_item_id;

  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_order_items soi SET shipped_qty = LEAST(soi.shipped_qty + agg.qty, soi.qty), updated_at = now()
  FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id;

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $function$;

CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(picking_list_id uuid, picking_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_wh uuid := COALESCE(p_warehouse_id, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  v_entity text; v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_pl_id uuid; v_uid uuid := auth.uid(); v_outstanding int;
  v_sp_order_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no; END IF;

  SELECT id, company_id INTO v_sp_order_id, v_company_id
    FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % belum punya data di sp_orders — hubungi admin untuk backfill sebelum generate picking', p_sp_no;
  END IF;

  IF NOT (is_super_admin() OR (v_company_id IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membuat picking list untuk SP ini';
  END IF;
  IF EXISTS (SELECT 1 FROM picking_lists WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND status IN ('pending','in_progress')) THEN
    RAISE EXCEPTION 'Picking list untuk SP % sudah ada', p_sp_no; END IF;
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
  INSERT INTO picking_lists (company_id, picking_no, sp_no, warehouse_id, status, created_by, customer_id, sp_order_id)
  VALUES (v_company_id, v_no, p_sp_no, v_wh, 'pending', v_uid, p_customer_id, v_sp_order_id)
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
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_cust uuid; v_sp text; v_company uuid;
BEGIN
  SELECT status, customer_id, sp_no, company_id INTO v_status, v_cust, v_sp, v_company
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak menandai surat jalan sebagai terkirim. Butuh level manager ke atas atau role operations di entitas surat jalan ini.';
  END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid, p_signed_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_cust uuid; v_sp text; v_dispatched_at timestamptz; v_company uuid;
BEGIN
  SELECT status, customer_id, sp_no, dispatched_at, company_id
    INTO v_status, v_cust, v_sp, v_dispatched_at, v_company
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak menandai surat jalan sebagai terkirim. Butuh level manager ke atas atau role operations di entitas surat jalan ini.';
  END IF;

  IF p_signed_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal surat jalan ditandatangani wajib diisi'; END IF;
  IF p_signed_date > current_date THEN
    RAISE EXCEPTION 'Tanggal tanda tangan tidak boleh di masa depan'; END IF;
  IF v_dispatched_at IS NOT NULL
     AND p_signed_date < (v_dispatched_at AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal SJ ditandatangani tidak boleh sebelum tanggal berangkat'; END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now(), signed_date=p_signed_date WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $function$;

COMMIT;
