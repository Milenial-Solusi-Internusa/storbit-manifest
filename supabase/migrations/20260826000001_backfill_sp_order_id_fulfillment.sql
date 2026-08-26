-- =============================================================================
-- Migration: 20260826000001_backfill_sp_order_id_fulfillment
-- Phase:     Menghidupkan kolom mati picking_lists.sp_order_id &
--            delivery_notes.sp_order_id (backfill + isi sejak sekarang + index).
-- Depends:   sp_orders (FASE 0)
--            · 20260821000001_partial-picking-guard  (guard partial-picking)
--            · 20260821000007_picking_guards         (guard otorisasi)
-- Status:    LIVE — dijalankan 26 Agu 2026 di staging dan produksi, terverifikasi.
--
-- MASALAH: kedua kolom punya FK ke sp_orders sehingga TAMPAK sebagai jalur
--   join yang benar, padahal TIDAK PERNAH DIISI oleh RPC pembuatnya.
--
-- BASELINE PRODUKSI (26 Agu 2026):
--     picking_lists  : total 92, terisi 92 setelah backfill, tetap_null 0
--     delivery_notes : total 83, terisi 83 setelah backfill, tetap_null 0
--     customer_id NULL: 0 di kedua tabel · sp_no kembar antar customer: 0
--
-- ⚠️ KEPUTUSAN DEN 26 Agu 2026: FE TETAP memakai kunci komposit
--    (customer_id, sp_no), BUKAN sp_order_id — alasannya timing (spOrder.id
--    baru tersedia setelah fetch async), bukan kebersihan data.
-- =============================================================================

-- SECTION 1 — BACKFILL
UPDATE public.picking_lists pl
   SET sp_order_id = o.id
  FROM public.sp_orders o
 WHERE pl.sp_order_id IS NULL
   AND pl.customer_id IS NOT NULL
   AND o.customer_id  = pl.customer_id
   AND o.sp_no        = pl.sp_no
   AND o.deleted_at IS NULL;

UPDATE public.delivery_notes dn
   SET sp_order_id = o.id
  FROM public.sp_orders o
 WHERE dn.sp_order_id IS NULL
   AND dn.customer_id IS NOT NULL
   AND o.customer_id  = dn.customer_id
   AND o.sp_no        = dn.sp_no
   AND o.deleted_at IS NULL;

UPDATE public.delivery_notes dn
   SET sp_order_id = pl.sp_order_id
  FROM public.picking_lists pl
 WHERE dn.sp_order_id IS NULL
   AND dn.picking_list_id = pl.id
   AND pl.sp_order_id IS NOT NULL;

-- SECTION 2 — INDEX
CREATE INDEX IF NOT EXISTS idx_picking_lists_sp_order
  ON public.picking_lists (sp_order_id) WHERE sp_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_sp_order
  ON public.delivery_notes (sp_order_id) WHERE sp_order_id IS NOT NULL;

-- SECTION 3 — generate_picking_from_sp: isi sp_order_id sejak sekarang
CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid) RETURNS TABLE(picking_list_id uuid, picking_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_wh uuid := COALESCE(p_warehouse_id, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  v_entity text; v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_pl_id uuid; v_uid uuid := auth.uid(); v_outstanding int;
  v_sp_order_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no; END IF;
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

  SELECT id INTO v_sp_order_id FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;

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
END; $$;

-- SECTION 4 — generate_delivery_from_picking: isi sp_order_id sejak sekarang
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
  v_sp_order_id uuid;
BEGIN
  SELECT sp_no, status, customer_id, sp_order_id
    INTO v_sp_no, v_pick_status, v_customer, v_sp_order_id
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

  IF v_sp_order_id IS NULL AND v_customer IS NOT NULL THEN
    SELECT id INTO v_sp_order_id FROM sp_orders
     WHERE customer_id = v_customer AND sp_no = v_sp_no AND deleted_at IS NULL;
  END IF;

  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'SJ', 'WH', v_year, 0);
  v_no  := 'SJ/' || COALESCE(v_entity,'SOA') || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  INSERT INTO delivery_notes
    (company_id, do_no, sp_no, picking_list_id, customer_id, customer_name, destination_address, status, created_by, sp_order_id)
  VALUES (v_company_id, v_no, v_sp_no, p_picking_list_id, v_customer, v_cust_name, v_addr, 'draft', v_uid, v_sp_order_id)
  RETURNING id INTO v_dn_id;

  INSERT INTO delivery_note_items (delivery_note_id, picking_list_item_id, product_id, product_name, sku, qty)
  SELECT v_dn_id, pli.id, pli.product_id, pli.product_name, pli.sku, pli.qty_picked
  FROM picking_list_items pli
  WHERE pli.picking_list_id = p_picking_list_id AND COALESCE(pli.qty_picked,0) > 0;

  RETURN QUERY SELECT v_dn_id, v_no;
END;
$$;
