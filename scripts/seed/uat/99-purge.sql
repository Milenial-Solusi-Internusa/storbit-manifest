-- scripts/seed/uat/99-purge.sql
-- Mode HAPUS. Membersihkan SELURUH data dummy tanpa menyentuh data lain.
-- Penanda: sp_no LIKE '91%' - goods_receipts.reference_no LIKE 'GR-DUMMY-UAT-%'
--
-- STOP: URUTAN PENTING, dan dua pelajaran dari uji 25 Sep 2026:
--   1. session_replication_role TIDAK BISA diset dari koneksi non-superuser
--      (Supabase pooler menolak). Purge karena itu bersandar SEPENUHNYA pada
--      urutan FK anak->induk, bukan pada mematikan trigger.
--   2. stock_ledger WAJIB dihapus SEBELUM delivery_notes / picking_lists.
--      Kalau induknya hilang lebih dulu, baris ledger jadi YATIM dan tidak bisa
--      lagi dikenali lewat reference_id - stok tidak pulih. Uji pertama kena ini
--      (stok 29.700 bukan 30.000).
--
-- audit_logs SENGAJA TIDAK dihapus (keputusan Den Q5) - ia jejak, bukan data bisnis.
-- document_sequences TIDAK dibalik: deret monoton, seed ulang memberi nomor berbeda.

\i 00-guards.sql

DO $$
DECLARE v_uid uuid := 'd730c348-ceab-463d-bc3b-458126314373';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  CREATE TEMP TABLE _sp  ON COMMIT DROP AS SELECT id FROM sp_orders    WHERE sp_no LIKE '91%';
  CREATE TEMP TABLE _inv ON COMMIT DROP AS SELECT id FROM sp_invoices  WHERE sp_order_id IN (SELECT id FROM _sp);
  CREATE TEMP TABLE _pay ON COMMIT DROP AS SELECT id FROM sp_payments  WHERE invoice_id  IN (SELECT id FROM _inv);
  CREATE TEMP TABLE _dn  ON COMMIT DROP AS SELECT id FROM delivery_notes WHERE sp_no LIKE '91%';
  CREATE TEMP TABLE _pl  ON COMMIT DROP AS SELECT id FROM picking_lists  WHERE sp_no LIKE '91%';
  CREATE TEMP TABLE _gr  ON COMMIT DROP AS SELECT id FROM goods_receipts WHERE reference_no LIKE 'GR-DUMMY-UAT-%';

  -- 1. stock_ledger DULU (lihat catatan 2 di atas)
  DELETE FROM stock_ledger WHERE reference_type='delivery'      AND reference_id IN (SELECT id FROM _dn);
  DELETE FROM stock_ledger WHERE reference_type='picking'       AND reference_id IN (SELECT id FROM _pl);
  DELETE FROM stock_ledger WHERE reference_type='goods_receipt' AND reference_id IN (SELECT id FROM _gr);
  -- jaring pengaman: baris yatim dari run yang gagal di tengah
  DELETE FROM stock_ledger sl WHERE sl.reference_type='delivery' AND sl.reference_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM delivery_notes d WHERE d.id = sl.reference_id);
  DELETE FROM stock_ledger sl WHERE sl.reference_type='picking'  AND sl.reference_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM picking_lists p WHERE p.id = sl.reference_id);

  -- 2. jurnal + AR
  DELETE FROM journal_entry_lines WHERE journal_entry_id IN (
    SELECT id FROM journal_entries WHERE reference_id IN (SELECT id FROM _inv)
                                      OR reference_id IN (SELECT id FROM _pay));
  DELETE FROM journal_entries WHERE reference_id IN (SELECT id FROM _inv)
                                OR reference_id IN (SELECT id FROM _pay);
  DELETE FROM ar_ttfs         WHERE invoice_id IN (SELECT id FROM _inv) OR no_sp LIKE '91%';
  DELETE FROM sp_payments     WHERE invoice_id IN (SELECT id FROM _inv);
  DELETE FROM sp_invoice_lines WHERE invoice_id IN (SELECT id FROM _inv);
  DELETE FROM sp_invoices     WHERE id IN (SELECT id FROM _inv);

  -- 3. gudang / pengiriman
  DELETE FROM sp_btb              WHERE sp_order_id IN (SELECT id FROM _sp);
  DELETE FROM delivery_note_items WHERE delivery_note_id IN (SELECT id FROM _dn);
  DELETE FROM delivery_notes      WHERE id IN (SELECT id FROM _dn);
  DELETE FROM picking_list_materials WHERE picking_list_id IN (SELECT id FROM _pl);
  DELETE FROM picking_list_items     WHERE picking_list_id IN (SELECT id FROM _pl);
  DELETE FROM picking_lists          WHERE id IN (SELECT id FROM _pl);

  -- 4. SP (dua tabel: baru + legacy)
  DELETE FROM sp_order_items WHERE sp_order_id IN (SELECT id FROM _sp);
  DELETE FROM sp_orders      WHERE id IN (SELECT id FROM _sp);
  DELETE FROM sp_items       WHERE sp_no LIKE '91%';

  -- 5. penerimaan barang dummy
  DELETE FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT id FROM _gr);
  DELETE FROM goods_receipts      WHERE id IN (SELECT id FROM _gr);

  -- 6. fungsi bantu seed -- KETIGA-TIGANYA, kalau tidak ia meninggalkan objek
  -- permanen di staging yang tidak dipakai siapa pun.
  DROP FUNCTION IF EXISTS public.seed_uat_build(text,uuid,uuid,date,jsonb,text,jsonb);
  DROP FUNCTION IF EXISTS public.seed_uat_bill(text,uuid,date,text,jsonb);
  DROP FUNCTION IF EXISTS public.derive_status(int,int);
END $$;

-- verifikasi purge
SELECT (SELECT count(*) FROM sp_orders      WHERE sp_no LIKE '91%')                  AS sp_sisa,
       (SELECT count(*) FROM sp_items       WHERE sp_no LIKE '91%')                  AS sp_items_sisa,
       (SELECT count(*) FROM delivery_notes WHERE sp_no LIKE '91%')                  AS sj_sisa,
       (SELECT count(*) FROM picking_lists  WHERE sp_no LIKE '91%')                  AS picking_sisa,
       (SELECT count(*) FROM goods_receipts WHERE reference_no LIKE 'GR-DUMMY-UAT-%') AS gr_sisa,
       (SELECT count(*) FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
         WHERE o.sp_no LIKE '91%')                                                    AS invoice_sisa,
       (SELECT count(*) FROM ar_ttfs WHERE no_sp LIKE '91%')                          AS ttf_sisa,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname IN ('seed_uat_build','seed_uat_bill','derive_status'))
                                                                                      AS fungsi_sisa;

-- Stok WAJIB pulih ke keadaan sebelum seed. Kalau tidak 30.000 (dan 30.040 utk
-- PVC POP A6 yang punya 40 unit bawaan staging), ada baris stock_ledger yatim -
-- lihat catatan 2 di kepala berkas.
SELECT p.name, ss.on_hand, ss.reserved, ss.available
FROM stock_summary ss JOIN products p ON p.id = ss.product_id
WHERE ss.warehouse_id = '303c3d4c-570e-40a1-b738-6b0ed1cb5078'
ORDER BY p.name;
