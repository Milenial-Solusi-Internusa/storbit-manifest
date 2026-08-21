-- =============================================================================
-- Migration: 20260821000001_partial-picking-guard
-- Phase:     Storbit SP fulfillment — buka partial picking (Task 1 dari 4;
--            Task 2-4 murni frontend, tanpa perubahan DB).
-- Depends:   generate_picking_from_sp (live), picking_lists, delivery_notes
--            (kolom dispatched_at), cancel_picking, dispatch_delivery,
--            cancel_delivery — semuanya sudah live sejak Fase 2/2E.
--
-- Status: LIVE. Dijalankan manual di SQL Editor oleh Den pada 21 Agustus 2026.
--
-- SUMBER ISI FILE INI:
--   Body fungsi di bawah diambil TERPROGRAM dari `supabase/schema_snapshot.sql`
--   (bukan diketik ulang). Satu-satunya perubahan terhadap teks snapshot adalah
--   blok guard idempotensi (2 baris -> 2 blok IF) dan `CREATE FUNCTION` ->
--   `CREATE OR REPLACE FUNCTION`. Sisa fungsi byte-identik: numbering,
--   CTE src/av/ins_items, insert stock_ledger 'reserved', PERFORM
--   sp_recompute_status.
--
-- APA YANG BERUBAH
--   SEBELUM: satu picking non-cancelled per SP, PERMANEN. Picking 'done'
--            memblokir generate berikutnya selamanya -> partial picking mustahil.
--   SESUDAH: (1) picking pending/in_progress tetap memblokir (pesan error
--                dipertahankan VERBATIM);
--            (2) picking 'done' hanya memblokir selama surat jalannya belum
--                pernah diberangkatkan -> mencegah dobel-reservasi stok yang
--                sama, karena reservasi picking baru dilepas saat dispatch.
--
-- KONSEKUENSI YANG DISENGAJA (bukan bug, lihat 08_TECH_DEBT.md):
--   Picking berstatus 'done' yang surat jalannya tidak pernah dibuat menjadi
--   jalan buntu: cancel_picking menolak status selain pending/in_progress,
--   jadi SP itu terkunci dari generate picking baru sampai SJ dibuat DAN
--   diberangkatkan. Belum ada escape hatch — keputusan terbuka.
--
-- CREATE OR REPLACE mempertahankan ACL, SECURITY DEFINER, dan SET search_path
-- milik fungsi yang sudah ada.
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
