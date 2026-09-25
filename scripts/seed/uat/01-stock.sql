-- scripts/seed/uat/01-stock.sql
-- Stok awal lewat RPC resmi create_goods_receipt (tipe adjustment, nol vendor).
-- Prasyarat KERAS: tanpa ini sebagian besar SP jatuh ke MENUNGGU_STOK dan
-- skenario 2-3 tidak akan pernah terbentuk (rencana 2.1).
-- Idempoten: dilewati kalau GR-DUMMY-UAT-01 sudah ada.

\i 00-guards.sql

DO $$
DECLARE
  v_uid uuid := 'd730c348-ceab-463d-bc3b-458126314373';
  v_wh  uuid := '303c3d4c-570e-40a1-b738-6b0ed1cb5078';  -- Gudang Semper (SOA)
  v_id  uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  IF EXISTS (SELECT 1 FROM public.goods_receipts WHERE reference_no = 'GR-DUMMY-UAT-01') THEN
    RAISE NOTICE 'GR-DUMMY-UAT-01 sudah ada - dilewati (idempoten)';
    RETURN;
  END IF;

  -- LIMA produk. TROLLY HAND SENGAJA TIDAK diisi: ia yang membuat satu SP
  -- jatuh ke MENUNGGU_STOK lewat sp_recompute_status, bukan dipaksa UPDATE.
  -- receipt_date 20 April 2026: SENGAJA mendahului SP paling awal (9100019,
  -- sp_date 11 Mei 2026). Kalau stok "diterima" sesudah barangnya dikirim,
  -- datanya jadi tidak masuk akal untuk dibaca penguji UAT -- walaupun secara
  -- fungsional tidak menghalangi apa pun, karena stock_summary menjumlah
  -- seluruh baris ledger tanpa memandang tanggal.
  v_id := public.create_goods_receipt(
    'GR-DUMMY-UAT-01'::varchar, DATE '2026-04-20', v_wh, 'adjustment'::varchar,
    NULL::uuid, NULL::varchar, 'DATA DUMMY UAT',
    jsonb_build_array(
      jsonb_build_object('product_id','9777af85-08de-48fc-9a11-ad53d2f702a5','qty',30000),
      jsonb_build_object('product_id','29122cc0-cb2b-49c5-a7c5-4ca73ef26b53','qty',30000),
      jsonb_build_object('product_id','a48fe3ea-182f-4239-ae14-a6bd36b27e09','qty',30000),
      jsonb_build_object('product_id','6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3','qty',30000),
      jsonb_build_object('product_id','91f42e88-de59-49ef-b894-ab166819834e','qty',30000)));
  RAISE NOTICE 'goods_receipt dibuat: %', v_id;
END $$;
