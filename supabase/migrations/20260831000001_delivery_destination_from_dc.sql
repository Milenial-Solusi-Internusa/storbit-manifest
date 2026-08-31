-- 20260831000001_delivery_destination_from_dc.sql
--
-- Sumber `delivery_notes.destination_address` dipindah:
--   SEBELUM : accounts.address   -> alamat HQ/kantor pusat customer
--   SESUDAH : dc_master.alamat   -> alamat DC tujuan kiriman yang sebenarnya
--
-- Jalur datanya: picking_lists.sp_order_id -> sp_orders.dc_id -> dc_master.alamat.
-- Diverifikasi 31 Agu 2026: 85/85 delivery_notes punya sp_order_id (nol NULL),
-- dan 46 dari 47 DC sudah punya alamat — jadi jalur ini memang terisi.
--
-- Kenapa ini bukan sekadar koreksi kosmetik: sebelum migrasi ini, 67 dari 85
-- Surat Jalan (79%) tercetak dengan Alamat Tujuan KOSONG, karena
-- accounts.address memang mayoritas NULL.
--
-- NON-DESTRUKTIF: hanya mengganti body RPC. Nol perubahan data — baris
-- delivery_notes yang sudah ada TIDAK ikut berubah (lihat migrasi
-- 20260831000002 untuk backfill baris aktif, yang dijalankan terpisah).

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

  -- HANYA nama yang diambil dari accounts. accounts.address SENGAJA tidak
  -- dipakai lagi: itu alamat HQ customer, bukan tujuan kiriman.
  SELECT a.name INTO v_cust_name FROM accounts a WHERE a.id = v_customer;

  IF v_sp_order_id IS NULL AND v_customer IS NOT NULL THEN
    SELECT id INTO v_sp_order_id FROM sp_orders
     WHERE customer_id = v_customer AND sp_no = v_sp_no AND deleted_at IS NULL;
  END IF;

  -- Alamat tujuan = alamat DC pada SP-nya. WAJIB dibaca SETELAH blok di atas,
  -- karena dc_id cuma hidup di sp_orders. Bila DC belum punya alamat, biarkan
  -- NULL — JANGAN jatuh balik ke accounts.address, itu bug yang sedang dihapus.
  IF v_sp_order_id IS NOT NULL THEN
    SELECT NULLIF(btrim(dc.alamat), '')
      INTO v_addr
      FROM sp_orders so
      JOIN dc_master dc ON dc.id = so.dc_id
     WHERE so.id = v_sp_order_id;
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
