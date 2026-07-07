-- ============================================================================
-- Mesin status SP — FASE 2 (2A+2B): jembatan pengiriman shipped_qty + recompute
--   tahap DIKIRIM / SAMPAI / TERKIRIM_PENUH
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-07.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua blok di bawah SUDAH LIVE di database (dijalankan manual per-langkah di
--    Supabase SQL Editor, sudah terverifikasi: 438 SP di-recompute → TERKIRIM_PENUH 346,
--    MENUNGGU_STOK 45, CONFIRMED 20, DIKIRIM 14, SAMPAI 9, PICKING 4). File ini merekam
--    SQL asli agar tercatat & reproducible.
--
-- TUJUAN: temuan G-1 — dispatch_delivery memberangkatkan surat jalan (in_transit +
--   stock_ledger unreserve+outbound) TAPI tak pernah menulis shipped_qty → fulfillment
--   beku, sp_recompute_status (FASE 1) mentok PACKED. FASE 2:
--   • 2A: dispatch mengisi sp_items.shipped_qty (akumulatif) + cancel mengembalikannya
--         (sepaket, biar batal DN tak korup). Jalur identitas: delivery_note_items
--         .picking_list_item_id → picking_list_items.sp_item_id → sp_items.id, agregasi
--         PER sp_item_id (bukan product_id → hindari kontaminasi antar-item). Idempoten
--         karena dispatch hanya jalan sekali (guard status='draft').
--   • 2B: perluas sp_recompute_status mengenali tahap pengiriman di ATAS band FASE 1.
--
-- KEPUTUSAN BAKU: TERKIRIM_PENUH diturunkan MURNI dari Σshipped_qty ≥ Σqty (item
--   confirmed, dari sp_items), APA PUN SUMBERNYA (dispatch Nexus ATAU migrasi awal).
--   554 item historis ber-shipped_qty=qty penuh dari migrasi TANPA surat jalan HARUS
--   tampil TERKIRIM_PENUH (jujur ke fakta, boleh lompat tahap tanpa jejak DIKIRIM/SAMPAI).
--
-- CATATAN SCOPE: sp_order_items.shipped_qty (kanonik) BELUM di-sync di 2A (ditunda ke 2D);
--   reader + recompute pakai sp_items.shipped_qty. Transisi 'delivered' via RPC = 2C
--   (belum). Logika stock_ledger & guard DN/picking TAK diubah (hanya +baris shipped_qty).
--
-- Entitas SOA/Storbit company_id = d2e5e565-5f67-4954-b8d9-5979a2a0c697.
-- Referensi: AUDIT_FASE2_PENGIRIMAN.md + AUDIT_MESIN_STATUS.md + PROGRESS.md 2026-07-07.
-- ============================================================================


-- ============================================================================
-- LANGKAH 2A-1 — dispatch_delivery: + jembatan shipped_qty (akumulatif) + recompute
--   (reproduksi body existing UTUH; logika stock_ledger unreserve/outbound TAK diubah)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dispatch_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
        v_status text; v_pick uuid; v_wh uuid; v_no text; v_uid uuid := auth.uid();
        v_cust uuid; v_sp text;
BEGIN
  SELECT status, picking_list_id, do_no, customer_id, sp_no
    INTO v_status, v_pick, v_no, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Hanya surat jalan draft yang bisa diberangkatkan (status=%)', v_status; END IF;
  SELECT warehouse_id INTO v_wh FROM picking_lists WHERE id=v_pick;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');

  -- (unreserve picking + outbound delivery — TAK DIUBAH) --
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

  -- ===== FASE 2A: jembatan shipped_qty (akumulatif, per sp_item_id via picking link) =====
  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_items si SET shipped_qty = si.shipped_qty + agg.qty, updated_at = now()
  FROM agg WHERE si.id = agg.sp_item_id;

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $fn$;


-- ============================================================================
-- LANGKAH 2A-2 — cancel_delivery: + reversal shipped_qty (GREATEST) + recompute
--   (hanya bila DN in_transit/delivered; draft = belum dispatch → tak ada yang dibalik.
--    logika inbound reversal stock_ledger TAK diubah)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status='cancelled' THEN RAISE EXCEPTION 'Surat jalan sudah dibatalkan'; END IF;
  IF v_status IN ('in_transit','delivered') THEN
    -- (inbound reversal stock_ledger — TAK DIUBAH) --
    INSERT INTO stock_ledger
      (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
    SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'delivery_cancel', reference_id, reference_no, v_uid
    FROM stock_ledger
    WHERE reference_type='delivery' AND reference_id=p_delivery_note_id AND movement_type='outbound';

    -- ===== FASE 2A: kembalikan shipped_qty (hanya bila sudah dispatched) =====
    WITH agg AS (
      SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
      FROM delivery_note_items dni
      JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
      WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
      GROUP BY pli.sp_item_id
    )
    UPDATE sp_items si SET shipped_qty = GREATEST(si.shipped_qty - agg.qty, 0), updated_at = now()
    FROM agg WHERE si.id = agg.sp_item_id;
  END IF;

  UPDATE delivery_notes SET status='cancelled', cancelled_at=now() WHERE id=p_delivery_note_id;

  IF v_cust IS NOT NULL AND v_sp IS NOT NULL THEN
    PERFORM sp_recompute_status(v_cust, v_sp);
  END IF;
END; $fn$;


-- ============================================================================
-- LANGKAH 2B — sp_recompute_status: perluas tier pengiriman di ATAS band FASE 1
--   TERKIRIM_PENUH > SAMPAI > DIKIRIM > (PACKED > PICKING > MENUNGGU_STOK > CONFIRMED > DRAFT)
--   guard: CANCELLED terminal + tahap ≥ BTB_TERBIT/INVOICED+ tak disentuh (fase lanjut)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  -- Terminal + tahap di atas TERKIRIM_PENUH (fase lanjut) tak disentuh.
  -- (BTB_TERBIT ikut di-guard: FASE 3 belum ada penulis, cegah downgrade tak sengaja; 0 SP saat ini.)
  IF v_status IN ('CANCELLED','BTB_TERBIT','INVOICED','SUBMITTED','LUNAS') THEN RETURN; END IF;

  -- ===== Fakta band FASE 1 (TAK DIUBAH) =====
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

  -- ===== FASE 2: fakta pengiriman =====
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');

  v_new := CASE
    WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'  -- murni shipped_qty, apa pun sumbernya
    WHEN v_has_delivered                          THEN 'SAMPAI'
    WHEN v_has_dispatch                           THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;

  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
  END IF;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.sp_recompute_status(uuid,text) FROM PUBLIC;
