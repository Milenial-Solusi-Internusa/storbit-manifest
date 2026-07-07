-- ============================================================================
-- RPC create_sp_order_dual — dual-write InputSPPage ke skema SP baru (TASK 2)
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-06.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    RPC ini SUDAH LIVE di database (dibuat manual di Supabase SQL Editor,
--    sudah terverifikasi jalan). File ini merekam SQL asli agar tercatat &
--    reproducible.
--
-- TUJUAN: dual-write (D2-A, approach iii). Saat InputSPPage menyimpan SP, jalur
--   frontend menulis ke `sp_items` lama (tak berubah, sekaligus sumber
--   `legacy_sp_item_id`) LALU memanggil RPC ini untuk menulis header + items ke
--   skema BARU (`sp_orders` + `sp_order_items`) secara ATOMIK dalam satu transaksi.
--   Pembaca lama (Manifest/Detail/Pengiriman/Finance) TETAP baca `sp_items`.
--
-- SECURITY INVOKER — RLS berlaku; role `operations` SOA sudah punya hak insert
--   (policy sp_orders_insert / sp_order_items_insert: has_role('operations')).
-- Duplikat (customer_id, sp_no) — constraint sp_orders_no_unique → RPC menangkap
--   unique_violation dan RAISE pesan jelas (bukan gagal senyap).
--
-- Referensi: CLAUDE.md (Recent — dual-write D2-A) + PROGRESS.md 2026-07-06.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_sp_order_dual(
  p_company_id   uuid,
  p_customer_id  uuid,
  p_sp_no        text,
  p_sp_date      date,
  p_dc_id        uuid,
  p_status       text,
  p_expired_date date,
  p_notes        text,
  p_items        jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.sp_orders
    (company_id, customer_id, sp_no, sp_date, dc_id, status, expired_date, notes, created_by)
  VALUES
    (p_company_id, p_customer_id, p_sp_no, p_sp_date, p_dc_id,
     COALESCE(NULLIF(p_status,''),'DRAFT'), p_expired_date, p_notes, auth.uid())
  RETURNING id INTO v_order_id;

  INSERT INTO public.sp_order_items
    (sp_order_id, company_id, product_id, product_name, sku, qty, shipped_qty,
     unit_price, price_category, shipping_price, legacy_sp_item_id)
  SELECT
    v_order_id, p_company_id,
    (e->>'product_id')::uuid,
    COALESCE(e->>'product_name',''),
    COALESCE(e->>'sku',''),
    (e->>'qty')::int,
    0,
    COALESCE((e->>'unit_price')::numeric, 0),
    NULLIF(e->>'price_category',''),
    COALESCE((e->>'shipping_price')::numeric, 0),
    NULLIF(e->>'legacy_sp_item_id','')::uuid
  FROM jsonb_array_elements(p_items) AS e;

  RETURN v_order_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SP % sudah ada untuk customer ini (duplikat)', p_sp_no
      USING ERRCODE = 'unique_violation';
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_sp_order_dual(uuid,uuid,text,date,uuid,text,date,text,jsonb) TO authenticated;
