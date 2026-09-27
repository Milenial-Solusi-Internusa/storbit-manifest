-- =============================================================================
-- b1-sp-orders-finance.sql -- PATCH PARITY STAGING (TD-279, Kelompok B)
--
-- !!  S T A G I N G   S A J A  --  JANGAN DIJALANKAN DI PRODUCTION  !!
--     Seluruh isi berkas ini SUDAH hidup di production. Tidak masuk doc 12.
--
-- -- AUDIT URUTAN 20260902000003/4/5 (diminta sebelum B dijalankan) ----------
-- Ketiganya SALING BERGANTUNG, dan urutannya mengikat:
--   000003  ALTER TABLE sp_orders + 6 kolom finance, lalu DUA UPDATE backfill
--   000004  CREATE set_sp_finance_docs  -- MENULIS keenam kolom itu, jadi ia
--           tidak bisa dibuat sebelum kolomnya ada
--   000005  CREATE OR REPLACE update_sp_item_dual -- MENCABUT tulis finance
--           dari fungsi lama, jadi ia tidak boleh jalan sebelum 000004 ada
--           penggantinya; kalau dibalik, ada jendela tanpa satu pun jalur
--           tulis kolom finance
--
-- ** DUA UPDATE BACKFILL 000003 SENGAJA TIDAK DIJALANKAN DI SINI.
-- Keduanya menyalin nilai finance dari sp_items ke sp_orders lalu menyerempakkan
-- arah baliknya -- itu PERBAIKAN DATA, bukan bentuk skema. env-drift-check
-- membandingkan skema, jadi backfill tidak dibutuhkan untuk parity; dan data
-- staging adalah seed UAT, bukan data yang sama dengan production. Menjalankan
-- backfill di sini akan menyentuh 40 SP seed tanpa satu pun alasan parity.
-- Akibat yang diterima: keenam kolom lahir dengan nilai bawaannya (false/NULL),
-- dan panel dokumen Finance di Detail SP akan tampil kosong sampai diisi lewat
-- set_sp_finance_docs. Itu keadaan yang BISA DIUJI -- sebelumnya panel itu
-- tidak bisa diuji sama sekali karena RPC dan kolomnya memang tidak ada.
--
-- Definisi kolom dan badan fungsi DISALIN DARI PRODUCTION (read-only 27 Sep
-- 2026), bukan dari berkas migrasinya -- alasannya di README folder ini.
-- =============================================================================

BEGIN;

-- --- 1. enam kolom finance di sp_orders -------------------------------------
-- Tipe, nullability, dan default disalin persis dari information_schema
-- production. IF NOT EXISTS supaya berkas ini aman diulang.
ALTER TABLE public.sp_orders
  ADD COLUMN IF NOT EXISTS inv          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fp           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submit       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kirim        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submit_date  date,
  ADD COLUMN IF NOT EXISTS email_status text;

-- --- 2. set_sp_finance_docs -- satu-satunya penulis keenam kolom ------------
CREATE OR REPLACE FUNCTION public.set_sp_finance_docs(p_customer_id uuid, p_sp_no text, p_inv boolean, p_fp boolean, p_submit boolean, p_kirim boolean, p_submit_date date, p_email_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_sp_order_id uuid; v_company uuid; v_status text;
BEGIN
  SELECT id, company_id, status
    INTO v_sp_order_id, v_company, v_status
    FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no;
  END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (has_role('finance_controller') OR has_role('finance')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah status dokumen SP ini';
  END IF;

  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'SP sudah dibatalkan — status dokumen tidak bisa diubah.';
  END IF;

  UPDATE sp_orders
     SET inv = p_inv, fp = p_fp, submit = p_submit, kirim = p_kirim,
         submit_date = p_submit_date,
         email_status = NULLIF(btrim(p_email_status), ''),
         updated_at = now()
   WHERE id = v_sp_order_id;

  UPDATE sp_items
     SET inv = p_inv, fp = p_fp, submit = p_submit, kirim = p_kirim,
         submit_date = p_submit_date,
         email_status = NULLIF(btrim(p_email_status), ''),
         updated_at = now()
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no;
END; $fn$;

-- ACL production: postgres=X/postgres,authenticated=X/postgres -- TANPA PUBLIC.
REVOKE ALL     ON FUNCTION public.set_sp_finance_docs(uuid,text,boolean,boolean,boolean,boolean,date,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_sp_finance_docs(uuid,text,boolean,boolean,boolean,boolean,date,text) TO authenticated;

-- --- 3. update_sp_item_dual -- versi yang SUDAH di-trim ---------------------
-- Staging memegang versi PRA-trim (lebih panjang): ia masih ikut menulis kolom
-- finance. Sesudah langkah 2, jalur itu punya rumahnya sendiri.
-- !! ACL production memuat entri berawalan '=' = PUBLIC EXECUTE, dan staging
--    sudah sama. Karena itu NOL GRANT/REVOKE di sini: menambahkannya justru
--    menggeser ACL staging menjauh dari production.
CREATE OR REPLACE FUNCTION public.update_sp_item_dual(p_id uuid, p_item jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE v_rec sp_items%ROWTYPE; v_company uuid;
BEGIN
  v_rec := jsonb_populate_record(null::sp_items, p_item);
  SELECT o.company_id INTO v_company
    FROM sp_items si
    JOIN sp_orders o
      ON o.customer_id = si.customer_id
     AND o.sp_no       = si.sp_no
     AND o.deleted_at IS NULL
   WHERE si.id = p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Item SP tidak ditemukan, atau SP induknya belum ada di sp_orders.';
  END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND is_sp_item_writer())) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah item SP ini';
  END IF;

  UPDATE sp_items SET
    sp_date = v_rec.sp_date, sp_no = v_rec.sp_no, customer_id = v_rec.customer_id,
    product_id = v_rec.product_id, product_name = v_rec.product_name, sku = v_rec.sku,
    qty = v_rec.qty, shipped_qty = v_rec.shipped_qty,
    exp_date = v_rec.exp_date, dc = v_rec.dc,
    shipping_date = v_rec.shipping_date, sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date, arrival_date = v_rec.arrival_date,
    unit_price = v_rec.unit_price, shipping_price = v_rec.shipping_price,
    notes = v_rec.notes,
    updated_at = now()
  WHERE id = p_id;

  UPDATE sp_order_items SET
    qty = v_rec.qty,
    sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date,
    shipping_price = v_rec.shipping_price,
    notes = v_rec.notes,
    updated_at = now()
  WHERE legacy_sp_item_id = p_id;
END; $fn$;

-- --- V1: BUKTI -- sidik jari yang SAMA dengan env-drift-check ---------------
-- Bukan md5(prosrc) saja. Pelajaran 28 Sep 2026: V1 20260918000001 memeriksa
-- badan + ACL + trigger, ketiganya cocok, dan melaporkan LOLOS -- sementara
-- alat drift tetap melaporkan BEDA ISI karena SECURITY DEFINER-nya tertinggal.
-- Blok verifikasi yang lebih longgar daripada alat yang memeriksanya bukan
-- verifikasi, melainkan jaminan palsu.
DO $v1$
DECLARE v_sidik text; v_acl text; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_orders'
     AND column_name IN ('inv','fp','submit','kirim','submit_date','email_status');
  IF v_n <> 6 THEN RAISE EXCEPTION 'V1a GAGAL: hanya % dari 6 kolom finance ada di sp_orders.', v_n; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_orders'
     AND ((column_name IN ('inv','fp','submit','kirim')
           AND data_type='boolean' AND is_nullable='NO' AND column_default='false')
       OR (column_name='submit_date'  AND data_type='date' AND is_nullable='YES' AND column_default IS NULL)
       OR (column_name='email_status' AND data_type='text' AND is_nullable='YES' AND column_default IS NULL));
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'V1b GAGAL: hanya % dari 6 kolom yang tipe/nullable/default-nya sama dengan production.', v_n;
  END IF;

  SELECT md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), ''))
    INTO v_sidik FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='set_sp_finance_docs';
  IF v_sidik IS DISTINCT FROM '07e0866e91278ab923447cefc33f52ed' THEN
    RAISE EXCEPTION 'V1c GAGAL: sidik jari set_sp_finance_docs = %, harusnya sama dengan production.', v_sidik;
  END IF;

  SELECT COALESCE(array_to_string(proacl::text[], ','), '(null)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='set_sp_finance_docs';
  IF v_acl IS DISTINCT FROM 'postgres=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'V1d GAGAL: ACL set_sp_finance_docs = %, harusnya sama dengan production.', v_acl;
  END IF;

  SELECT md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), ''))
    INTO v_sidik FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='update_sp_item_dual';
  IF v_sidik IS DISTINCT FROM '948d1e1d3d2fecc850ccbaf20f2056d0' THEN
    RAISE EXCEPTION 'V1e GAGAL: sidik jari update_sp_item_dual = %, harusnya sama dengan production.', v_sidik;
  END IF;

  SELECT COALESCE(array_to_string(proacl::text[], ','), '(null)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='update_sp_item_dual';
  IF v_acl IS DISTINCT FROM '=X/postgres,postgres=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'V1f GAGAL: ACL update_sp_item_dual = %, harusnya sama dengan production (termasuk entri PUBLIC).', v_acl;
  END IF;

  RAISE NOTICE 'B LOLOS: 6 kolom + 2 fungsi sama persis dengan production.';
END
$v1$;

COMMIT;
