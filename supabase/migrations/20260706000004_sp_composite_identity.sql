-- ============================================================================
-- SP identitas komposit (customer_id, sp_no) — BAGIAN B (FE + RPC + kolom)
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-06.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua blok di bawah SUDAH LIVE di database (dijalankan manual per-langkah di
--    Supabase SQL Editor, sudah terverifikasi via pg_proc + tes runtime). File ini
--    merekam SQL asli agar tercatat & reproducible.
--
-- TUJUAN: nomor SP kini diketik manual → bisa kembar antar customer. Identitas SP
--   yang benar = (customer_id, sp_no). Sebelumnya seluruh app + 3 RPC mengenali SP
--   dari sp_no saja → SP beda-customer bernomor sama tergabung / saling kontaminasi
--   (Konfirmasi/Picking/Surat Jalan mengenai SP customer lain). Blok di bawah men-scope
--   semuanya per-customer.
--
-- CATATAN backward-compat: RPC versi baru dibuat berdampingan versi lama dulu (beda
--   jumlah arg → tak ambigu), FE dipindah kirim customer_id, lalu versi lama di-DROP
--   (LANGKAH 5). DB-5 (cek data) konfirmasi 0 nomor SP kembar lintas-customer existing
--   → tak perlu migrasi data. Body RPC identik versi lama + klausa customer saja.
--
-- Entitas SOA/Storbit company_id = d2e5e565-5f67-4954-b8d9-5979a2a0c697.
-- Referensi: AUDIT_STATUS_PENOMORAN.md / AUDIT_REDUNDANSI_SP.md + PROGRESS.md 2026-07-06.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — picking_lists.customer_id (enabler) + backfill 2 lapis
-- ============================================================================
ALTER TABLE public.picking_lists
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.accounts(id);

-- Backfill utama — dari sp_orders (sumber unik komposit) via sp_order_id.
UPDATE public.picking_lists pl
SET    customer_id = o.customer_id
FROM   public.sp_orders o
WHERE  pl.sp_order_id = o.id
  AND  pl.customer_id IS NULL;

-- Backfill fallback (legacy) — picking tanpa sp_order_id: resolve dari sp_items via
-- sp_no. LIMIT 1 aman karena DB-5 memastikan tak ada sp_no kembar lintas-customer.
UPDATE public.picking_lists pl
SET    customer_id = (
         SELECT si.customer_id
         FROM   public.sp_items si
         WHERE  si.sp_no = pl.sp_no
           AND  si.customer_id IS NOT NULL
         LIMIT  1
       )
WHERE  pl.customer_id IS NULL;
-- Verifikasi live: 26 picking, 26 terisi, 0 null.


-- ============================================================================
-- LANGKAH 2 — set_sp_status: signature baru 4-arg (scoped customer_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid)
    RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count integer;
BEGIN
  IF p_status NOT IN ('draft','confirmed','cancelled') THEN
    RAISE EXCEPTION 'invalid sp_status: %', p_status;
  END IF;

  UPDATE public.sp_items
  SET sp_status     = p_status,
      confirmed_at  = CASE WHEN p_status = 'confirmed' THEN now()    ELSE confirmed_at  END,
      confirmed_by  = CASE WHEN p_status = 'confirmed' THEN v_uid    ELSE confirmed_by  END,
      cancelled_at  = CASE WHEN p_status = 'cancelled' THEN now()    ELSE cancelled_at  END,
      cancelled_by  = CASE WHEN p_status = 'cancelled' THEN v_uid    ELSE cancelled_by  END,
      cancel_reason = CASE WHEN p_status = 'cancelled' THEN p_reason ELSE cancel_reason END,
      updated_at    = now()
  WHERE sp_no = p_sp_no
    AND customer_id = p_customer_id;          -- ← scoping komposit

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sp_status(text,text,text,uuid) TO authenticated;


-- ============================================================================
-- LANGKAH 3 — generate_picking_from_sp: signature baru 3-arg (scoped + isi customer_id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
    RETURNS TABLE(picking_list_id uuid, picking_no text)
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

  RETURN QUERY SELECT v_pl_id, v_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_picking_from_sp(text,uuid,uuid) TO authenticated;


-- ============================================================================
-- LANGKAH 4 — generate_delivery_from_picking: resolve customer dari picking_lists dulu
--             (signature TETAP p_picking_list_id; CREATE OR REPLACE in-place)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_delivery_from_picking(p_picking_list_id uuid)
    RETURNS TABLE(delivery_note_id uuid, do_no text)
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
    FROM picking_lists WHERE id = p_picking_list_id;            -- ← ambil customer_id dari picking
  IF v_sp_no IS NULL THEN RAISE EXCEPTION 'Picking list tidak ditemukan'; END IF;
  IF v_pick_status <> 'done' THEN RAISE EXCEPTION 'Picking list belum selesai (status=%)', v_pick_status; END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id = p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan untuk picking ini sudah ada'; END IF;
  SELECT count(*) INTO v_item_count FROM picking_list_items
    WHERE picking_list_id = p_picking_list_id AND COALESCE(qty_picked,0) > 0;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'Tak ada item ter-pick untuk dikirim'; END IF;

  -- Fallback legacy: picking lama tanpa customer_id → resolve dari sp_items (LIMIT 1).
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

GRANT EXECUTE ON FUNCTION public.generate_delivery_from_picking(uuid) TO authenticated;


-- ============================================================================
-- LANGKAH 5 — DROP signature RPC lama (tak-scoped) setelah FE terverifikasi
-- ============================================================================
DROP FUNCTION IF EXISTS public.set_sp_status(text, text, text);
DROP FUNCTION IF EXISTS public.generate_picking_from_sp(text, uuid);
