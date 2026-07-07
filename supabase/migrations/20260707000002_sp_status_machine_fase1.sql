-- ============================================================================
-- Mesin status SP — FASE 1: sp_recompute_status + tahap darat bawah (DRAFT→PACKED)
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-07.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua blok di bawah SUDAH LIVE di database (dijalankan manual per-langkah di
--    Supabase SQL Editor, sudah terverifikasi: 438 SP di-recompute → CONFIRMED 367,
--    MENUNGGU_STOK 45, PACKED 22, PICKING 4). File ini merekam SQL asli agar tercatat
--    & reproducible.
--
-- TUJUAN: sp_orders.status (12-tahap) sebelumnya diam di DRAFT (tak ada recompute,
--   desync dengan sp_items.sp_status). FASE 1 dari AUDIT_MESIN_STATUS.md: bangun
--   sp_recompute_status + sambungkan tahap darat bawah (DRAFT→CONFIRMED→MENUNGGU_STOK→
--   PICKING→PACKED) + fix desync. Tahap DIKIRIM ke atas = kerangka (belum disambung).
--
-- 3 KEPUTUSAN BISNIS BAKU:
--   1. PACKED tercapai saat picking list status='done' (bukan langkah terpisah).
--   2. MENUNGGU_STOK ditampilkan sebagai status (confirmed tapi stok kurang).
--   3. Batal picking → status MUNDUR ke CONFIRMED, + flag overlay had_cancelled_picking
--      (permanen, tak reset — mirip is_disputed). Downgrade natural via recompute
--      fact-derived; guard hanya-naik hanya berlaku untuk tahap > PACKED.
--
-- Kunci recompute = KOMPOSIT (customer_id, sp_no) — bukan sp_order_id; picking_lists
--   sudah membawa customer_id + sp_no (BAGIAN B). Semua RPC yang diubah SIGNATURE TETAP
--   (CREATE OR REPLACE in-place, tanpa isu koeksistensi). Reader UI tetap baca sp_items.
--
-- Entitas SOA/Storbit company_id = d2e5e565-5f67-4954-b8d9-5979a2a0c697.
-- Referensi: AUDIT_MESIN_STATUS.md + DESIGN_SP_SCHEMA.md §1.3 + PROGRESS.md 2026-07-07.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — Flag overlay: pernah picking dibatalkan (keputusan #3)
-- ============================================================================
ALTER TABLE public.sp_orders ADD COLUMN IF NOT EXISTS had_cancelled_picking boolean NOT NULL DEFAULT false;


-- ============================================================================
-- LANGKAH 2 — sp_recompute_status(customer_id, sp_no) — headline dari fakta
--             (internal; REVOKE dari PUBLIC — dipanggil via PERFORM)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status = 'CANCELLED' THEN RETURN; END IF;
  IF v_status NOT IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED') THEN RETURN; END IF; -- >PACKED = fase lanjut

  v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
  v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
  v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
  v_short := EXISTS(
    SELECT 1 FROM sp_items si
     WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
       AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
       AND (si.qty - si.shipped_qty) > COALESCE(
             (SELECT SUM(ss.available) FROM stock_summary ss
               WHERE ss.company_id=v_company AND ss.product_id=si.product_id), 0));

  v_new := CASE
    WHEN v_has_done              THEN 'PACKED'
    WHEN v_has_active            THEN 'PICKING'
    WHEN v_confirmed AND v_short THEN 'MENUNGGU_STOK'
    WHEN v_confirmed             THEN 'CONFIRMED'
    ELSE 'DRAFT' END;

  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
  END IF;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.sp_recompute_status(uuid,text) FROM PUBLIC;


-- ============================================================================
-- LANGKAH 3 — set_sp_status (4-arg) — fix desync (sinkron sp_orders) + recompute
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid)
    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_count integer;
BEGIN
  IF p_status NOT IN ('draft','confirmed','cancelled') THEN RAISE EXCEPTION 'invalid sp_status: %', p_status; END IF;
  UPDATE public.sp_items
     SET sp_status=p_status,
         confirmed_at = CASE WHEN p_status='confirmed' THEN now()    ELSE confirmed_at  END,
         confirmed_by = CASE WHEN p_status='confirmed' THEN v_uid    ELSE confirmed_by  END,
         cancelled_at = CASE WHEN p_status='cancelled' THEN now()    ELSE cancelled_at  END,
         cancelled_by = CASE WHEN p_status='cancelled' THEN v_uid    ELSE cancelled_by  END,
         cancel_reason= CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
         updated_at   = now()
   WHERE sp_no = p_sp_no AND customer_id = p_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- FASE 1: sinkron sp_orders (fix desync) + recompute tahap dari fakta.
  IF p_status = 'cancelled' THEN
    UPDATE public.sp_orders
       SET status='CANCELLED', cancelled_at=now(), cancelled_by=v_uid, cancel_reason=p_reason, updated_at=now()
     WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
  ELSE
    IF p_status='confirmed' THEN
      UPDATE public.sp_orders
         SET confirmed_at=COALESCE(confirmed_at,now()), confirmed_by=COALESCE(confirmed_by,v_uid), updated_at=now()
       WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
    END IF;
    PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  END IF;

  RETURN v_count;
END; $fn$;


-- ============================================================================
-- LANGKAH 4 — generate_picking_from_sp (3-arg) — + recompute (→ PICKING)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
    RETURNS TABLE(picking_list_id uuid, picking_no text)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_wh uuid := COALESCE(p_warehouse_id, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  v_entity text; v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_pl_id uuid; v_uid uuid := auth.uid(); v_outstanding int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no; END IF;
  IF EXISTS (SELECT 1 FROM picking_lists WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Picking list untuk SP % sudah ada', p_sp_no; END IF;
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
           CASE WHEN product_id IS NULL THEN 0
                ELSE GREATEST(req - LEAST(req, avail), 0) END,
           (SELECT pwl.rack_location FROM product_warehouse_location pwl
             WHERE pwl.product_id = av.product_id AND pwl.warehouse_id = v_wh
             LIMIT 1)
    FROM av
    RETURNING 1
  )
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company_id, v_wh, product_id, 'reserved', LEAST(req, avail), 'picking', v_pl_id, v_no, v_uid
  FROM av
  WHERE product_id IS NOT NULL AND LEAST(req, avail) > 0;

  PERFORM sp_recompute_status(p_customer_id, p_sp_no);   -- FASE 1 → PICKING
  RETURN QUERY SELECT v_pl_id, v_no;
END; $fn$;

GRANT EXECUTE ON FUNCTION public.generate_picking_from_sp(text,uuid,uuid) TO authenticated;


-- ============================================================================
-- LANGKAH 5 — cancel_picking(uuid) — + flag overlay + recompute (mundur)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_picking(p_picking_list_id uuid)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM picking_lists WHERE id=p_picking_list_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa dibatalkan (status=%)', v_status; END IF;
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking' AND reference_id=p_picking_list_id AND movement_type='reserved';
  UPDATE picking_lists SET status='cancelled', cancelled_at=now() WHERE id=p_picking_list_id;

  -- FASE 1: flag overlay permanen + recompute (mundur ke CONFIRMED/MENUNGGU_STOK).
  UPDATE public.sp_orders SET had_cancelled_picking=true, updated_at=now()
    WHERE customer_id=v_cust AND sp_no=v_sp;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $fn$;


-- ============================================================================
-- LANGKAH 6 — complete_picking(uuid) BARU — set done + recompute (→ PACKED)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_picking(p_picking_list_id uuid)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM picking_lists WHERE id=p_picking_list_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa diselesaikan (status=%)', v_status; END IF;
  UPDATE picking_lists SET status='done', completed_at=now(), updated_at=now() WHERE id=p_picking_list_id;
  PERFORM sp_recompute_status(v_cust, v_sp);   -- FASE 1 → PACKED
END; $fn$;

GRANT EXECUTE ON FUNCTION public.complete_picking(uuid) TO authenticated;
