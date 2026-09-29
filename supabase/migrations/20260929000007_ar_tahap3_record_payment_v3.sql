-- =============================================================================
-- 20260929000007_ar_tahap3_record_payment_v3.sql   (AR Tahap 3, berkas 4 dari 6)
--
-- record_payment v3 -- TD-285 (batas total pembayaran), TD-286 (batas PPh),
-- TD-287 (kolom potongan lain + jurnal). Dasar badan: v2 (20260927000003,
-- get_mapped_account + penolakan status 'issued'), BUKAN v1 produksi
-- (20260817000001, kode akun hardcode) -- sesuai keputusan Den: Tahap 3 naik
-- BERSAMA Tahap 1+2, jadi ditulis di atas apa yang akan sudah ada saat itu.
--
-- Tanda tangan BERTAMBAH 2 parameter (p_potongan_lain, p_potongan_keterangan)
-- -> INI FUNGSI BARU bagi Postgres (gotcha #37), bukan CREATE OR REPLACE atas
-- yang lama. DROP eksplisit signature lama WAJIB sebelum CREATE yang baru --
-- membiarkan keduanya hidup bersama membuat panggilan dengan 7 argumen
-- (bentuk lama) AMBIGU begitu ada dua fungsi bernama sama dengan argumen
-- berbeda (kelas insiden mark_delivery_delivered, 17 Sep 2026).
--
-- TIGA PERUBAHAN LOGIKA vs v2:
--   1. FOR UPDATE saat mengunci baris sp_invoices -- sp_payments NOL GRANT
--      INSERT ke authenticated (satu-satunya jalur tulis = RPC ini), jadi
--      mengunci baris invoice cukup menyerialkan dua panggilan record_payment
--      untuk invoice yang sama. TD-285 (concurrency).
--   2. v_settled_sebelum dihitung SEBELUM insert (bukan sesudah seperti v2),
--      dipakai untuk DUA guard baru sebelum baris pembayaran ditulis:
--        a. PPh sendirian > sisa tagihan -> ditolak, pesan spesifik (TD-286).
--        b. total (amount+pph+potongan_lain) > sisa tagihan -> ditolak,
--           pesan umum (TD-285). Toleransi c_tolerance=1 -- SAMA dengan yang
--           sudah dipakai menentukan status 'paid' (TD-294: pembulatan PPN
--           per Surat Jalan bisa menyisakan selisih 1 rupiah) -- BUKAN angka
--           baru untuk menutupi potongan TTF (~2.900), itu jalurnya sendiri.
--   3. potongan_lain ikut v_settled (jadi ikut menentukan status 'paid') dan
--      ikut kredit Piutang Usaha; kalau > 0, dijurnal debit ke peran akun
--      potongan_pelanggan (akun 4-1900, kontra-pendapatan -- 20260929000005)
--      DAN keterangannya WAJIB diisi (guard di RPC, dicerminkan di form FE).
--
-- Status: LIVE DI STAGING 29 Sep 2026 -- dijalankan DENGAN perbaikan palang
-- tanda tangan di bawah (oidvectortypes(proargtypes), bukan
-- pg_get_function_identity_arguments(), yang ikut mencetak nama parameter --
-- ditemukan saat berkas ini dijalankan pertama kali; lihat gotcha baru di
-- CLAUDE.md/03_DATA_MODEL.md). PRODUCTION BELUM.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V-PRA -- badan yang HIDUP harus versi v2 (get_mapped_account, menolak
-- 'issued') SEBELUM diganti. Kalau tidak, berhenti -- jangan timpa buta
-- badan yang sudah bergerak sejak PLAN ini ditulis (gotcha #35).
-- ---------------------------------------------------------------------------
DO $prapalang$
DECLARE v_def text;
BEGIN
  -- oidvectortypes(proargtypes), BUKAN pg_get_function_identity_arguments():
  -- yang kedua ikut mencetak NAMA parameter ('p_invoice_id uuid, ...'), jadi
  -- perbandingan string ke daftar tipe polos tidak akan pernah cocok --
  -- ketahuan saat berkas ini dijalankan ke staging 29 Sep 2026. Gotcha baru,
  -- lihat CLAUDE.md/03_DATA_MODEL.md.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_payment'
     AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PALANG: record_payment(uuid, numeric, date, text, numeric, text, text) tidak ditemukan -- signature lama sudah berubah dari yang diharapkan.';
  END IF;
  IF v_def NOT LIKE '%get_mapped_account%' THEN
    RAISE EXCEPTION 'PALANG: record_payment yang hidup BUKAN versi v2 (get_mapped_account) -- ini v1 produksi (kode akun hardcode). Baca ulang sebelum melanjutkan; berkas ini ditulis di atas v2.';
  END IF;
  IF v_def NOT LIKE '%Invoice % belum di-submit%' THEN
    RAISE EXCEPTION 'PALANG: record_payment yang hidup tidak menolak status issued -- bukan versi v2 yang diharapkan.';
  END IF;
  IF v_def LIKE '%potongan_lain%' THEN
    RAISE EXCEPTION 'PALANG: record_payment SUDAH memuat potongan_lain -- migrasi ini sudah pernah jalan di lingkungan ini.';
  END IF;

  RAISE NOTICE 'V-PRA LOLOS: record_payment(7 argumen) = versi v2 (get_mapped_account, menolak issued), belum menyentuh potongan_lain.';
END
$prapalang$;

DO $v0kolom$
DECLARE v_ada boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_payments' AND column_name='potongan_lain'
  ) INTO v_ada;
  IF NOT v_ada THEN
    RAISE EXCEPTION 'PALANG: sp_payments.potongan_lain belum ada -- jalankan 20260929000006 lebih dulu.';
  END IF;
END
$v0kolom$;

-- ---------------------------------------------------------------------------
-- DROP signature LAMA secara eksplisit (gotcha #37) -- lihat header berkas.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_payment(uuid, numeric, date, text, numeric, text, text);

CREATE FUNCTION public.record_payment(
  p_invoice_id         uuid,
  p_amount             numeric,
  p_payment_date       date DEFAULT CURRENT_DATE,
  p_reference          text DEFAULT NULL::text,
  p_pph                numeric DEFAULT 0,
  p_bukti_potong_url   text DEFAULT NULL::text,
  p_bukti_potong_no    text DEFAULT NULL::text,
  p_potongan_lain      numeric DEFAULT 0,
  p_potongan_keterangan text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_tolerance       CONSTANT numeric := 1;
  v_uid             uuid := auth.uid();
  v_company_id      uuid;
  v_sp_order_id     uuid;
  v_total           numeric(18,2);
  v_inv_status      text;
  v_invoice_no      text;
  v_customer_id     uuid;
  v_sp_no           text;
  v_payment_id      uuid;
  v_settled_sebelum numeric(18,2);
  v_sisa_sebelum    numeric(18,2);
  v_bayar_ini       numeric(18,2);
  v_settled_baru    numeric(18,2);
  v_new_status      text;
  v_je_id           uuid;
  v_acc_bank        uuid;
  v_acc_ar          uuid;
  v_acc_pph         uuid;
  v_acc_potongan    uuid;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat pembayaran.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih besar dari nol.';
  END IF;
  IF COALESCE(p_pph, 0) < 0 THEN
    RAISE EXCEPTION 'PPh tidak boleh negatif.';
  END IF;
  IF COALESCE(p_potongan_lain, 0) < 0 THEN
    RAISE EXCEPTION 'Potongan lain tidak boleh negatif.';
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 AND COALESCE(btrim(p_potongan_keterangan), '') = '' THEN
    RAISE EXCEPTION 'Keterangan potongan wajib diisi kalau ada potongan lain.';
  END IF;

  -- Kunci baris invoice SEBELUM membaca total pembayaran yang sudah ada.
  -- sp_payments NOL GRANT INSERT ke authenticated -- record_payment satu-
  -- satunya jalur tulis -- jadi FOR UPDATE di sini cukup menyerialkan dua
  -- panggilan untuk invoice yang sama: panggilan kedua menunggu sampai yang
  -- pertama commit/rollback, baru membaca SUM(sp_payments) yang sudah
  -- termasuk pembayaran pertama. TD-285.
  SELECT i.company_id, i.sp_order_id, i.total_amount, i.status, i.invoice_no
    INTO v_company_id, v_sp_order_id, v_total, v_inv_status, v_invoice_no
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL
   FOR UPDATE;

  IF v_company_id IS NULL  THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_inv_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void - pembayaran tidak bisa dicatat.';
  END IF;
  IF v_inv_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft - terbitkan dulu sebelum mencatat pembayaran.';
  END IF;
  IF v_inv_status = 'issued' THEN
    RAISE EXCEPTION 'Invoice % belum di-submit ke customer - submit dulu sebelum mencatat pembayaran.', COALESCE(v_invoice_no, '(tanpa nomor)');
  END IF;

  SELECT COALESCE(SUM(amount),0) + COALESCE(SUM(pph),0) + COALESCE(SUM(potongan_lain),0)
    INTO v_settled_sebelum
    FROM sp_payments WHERE invoice_id = p_invoice_id;

  v_sisa_sebelum := v_total - v_settled_sebelum;
  v_bayar_ini    := p_amount + COALESCE(p_pph,0) + COALESCE(p_potongan_lain,0);

  -- TD-286: PPh sendirian tidak boleh melebihi sisa tagihan -- diperiksa
  -- LEBIH DULU supaya pesannya menuduh PPh secara spesifik, bukan pesan
  -- umum di bawah. Ini bukan aturan terpisah dari TD-285: kalau PPh sendiri
  -- sudah melebihi sisa, guard total di bawah PASTI juga menolaknya (amount
  -- selalu > 0 menambah lebih jauh) -- guard ini murni supaya PESANNYA lebih
  -- tepat, bukan supaya ada pembatas kedua yang independen.
  IF COALESCE(p_pph,0) > v_sisa_sebelum + c_tolerance THEN
    RAISE EXCEPTION 'PPh 23 (Rp %) melebihi sisa tagihan invoice % (Rp %).',
      p_pph, COALESCE(v_invoice_no,'(tanpa nomor)'), GREATEST(v_sisa_sebelum, 0);
  END IF;

  -- TD-285: total pembayaran (kas + PPh + potongan lain) tidak boleh
  -- melebihi sisa tagihan. Toleransi = c_tolerance, SAMA dengan yang dipakai
  -- menentukan status 'paid' di bawah (TD-294) -- BUKAN angka baru untuk
  -- menutup potongan TTF (~2.900): itu jalur eksplisit p_potongan_lain,
  -- bukan toleransi yang diperlebar.
  IF v_bayar_ini > v_sisa_sebelum + c_tolerance THEN
    RAISE EXCEPTION 'Total pembayaran (Rp %) melebihi sisa tagihan invoice % (Rp %, toleransi Rp %).',
      v_bayar_ini, COALESCE(v_invoice_no,'(tanpa nomor)'), GREATEST(v_sisa_sebelum, 0), c_tolerance;
  END IF;

  -- AKUN lewat PERAN. PPh dan potongan hanya dicari kalau memang dipakai --
  -- pola sama dengan sebelumnya, supaya entitas tanpa peran itu tidak
  -- diblokir untuk pembayaran yang tidak memakainya.
  v_acc_bank := get_mapped_account(v_company_id, 'kas_bank');
  v_acc_ar   := get_mapped_account(v_company_id, 'piutang_usaha');
  IF COALESCE(p_pph, 0) > 0 THEN
    v_acc_pph := get_mapped_account(v_company_id, 'pph23_dibayar_dimuka');
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 THEN
    v_acc_potongan := get_mapped_account(v_company_id, 'potongan_pelanggan');
  END IF;

  INSERT INTO sp_payments
    (invoice_id, payment_date, amount, pph, potongan_lain, potongan_keterangan,
     reference, bukti_potong_url, bukti_potong_no, created_by)
  VALUES
    (p_invoice_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount,
     COALESCE(p_pph, 0), COALESCE(p_potongan_lain, 0), NULLIF(btrim(p_potongan_keterangan), ''),
     p_reference, p_bukti_potong_url, p_bukti_potong_no, v_uid)
  RETURNING id INTO v_payment_id;

  v_settled_baru := v_settled_sebelum + v_bayar_ini;

  v_new_status := CASE
    WHEN v_settled_baru >= (v_total - c_tolerance) THEN 'paid'
    WHEN v_settled_baru > 0                        THEN 'partial'
    ELSE v_inv_status END;

  IF v_new_status IS DISTINCT FROM v_inv_status THEN
    UPDATE sp_invoices SET status = v_new_status, updated_at = now() WHERE id = p_invoice_id;
  END IF;

  INSERT INTO journal_entries
    (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES
    (v_company_id, COALESCE(p_payment_date, CURRENT_DATE), 'payment_received', v_payment_id,
     'Penerimaan pembayaran invoice ' || COALESCE(v_invoice_no, '(tanpa nomor)'), v_uid)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_bank, p_amount, 0);
  IF COALESCE(p_pph, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_pph, p_pph, 0);
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_potongan, p_potongan_lain, 0);
  END IF;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, 0, p_amount + COALESCE(p_pph, 0) + COALESCE(p_potongan_lain, 0));

  IF v_new_status = 'paid' THEN
    SELECT customer_id, sp_no INTO v_customer_id, v_sp_no
      FROM sp_orders WHERE id = v_sp_order_id AND deleted_at IS NULL;
    IF v_customer_id IS NOT NULL THEN
      PERFORM sp_recompute_status(v_customer_id, v_sp_no);
    END IF;
  END IF;

  RETURN v_payment_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- ACL -- DROP+CREATE TIDAK mewarisi hak (beda dari CREATE OR REPLACE atas
-- signature yang sama). Pulihkan PERSIS pola v1/v2: REVOKE dari PUBLIC dan
-- anon, GRANT EXECUTE ke authenticated. Ini BUKAN pekerjaan H4 -- ini
-- menjaga supaya fungsi baru ini TIDAK mundur menjadi PUBLIC EXECUTE.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) IS
  'v3 -- TD-285 (cap total pembayaran vs sisa tagihan, dikunci FOR UPDATE), TD-286 (cap PPh vs sisa tagihan), TD-287 (potongan lain -> peran akun potongan_pelanggan, keterangan wajib). Dasar badan: v2 (20260927000003, get_mapped_account). AR Tahap 3, 20260929000007.';

-- ---------------------------------------------------------------------------
-- V-POST -- ACL benar, signature lama sungguh hilang, fungsi bisa dipanggil
-- dengan bentuk lama (potongan default 0) tanpa ambiguitas (gotcha #37).
-- ---------------------------------------------------------------------------
DO $vpost$
DECLARE
  v_acl text;
  v_lama_ada boolean;
  v_n_overload int;
BEGIN
  -- oidvectortypes(proargtypes), bukan pg_get_function_identity_arguments()
  -- -- pola sama dengan V-PRA di atas (gotcha: nama parameter ikut tercetak).
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'record_payment'
       AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text'
  ) INTO v_lama_ada;
  IF v_lama_ada THEN
    RAISE EXCEPTION 'V-POST GAGAL: signature lama record_payment(7 argumen) masih ada -- DROP tidak berhasil, risiko ambigu (gotcha #37).';
  END IF;

  SELECT count(*) INTO v_n_overload
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_payment';
  IF v_n_overload <> 1 THEN
    RAISE EXCEPTION 'V-POST GAGAL: seharusnya tepat 1 overload record_payment, ditemukan %.', v_n_overload;
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_payment';

  -- gotcha #40: proacl NULL ATAU entri berawalan '=' (grantee kosong) sama-
  -- sama berarti PUBLIC EXECUTE. Diperiksa terpisah dari anon/authenticated
  -- supaya "authenticated=X ada" tidak menyembunyikan "PUBLIC=X juga ada".
  IF v_acl = '(null = PUBLIC EXECUTE)' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment PUBLIC EXECUTE (proacl NULL). ACL: %', v_acl;
  END IF;
  IF v_acl LIKE '=%' OR v_acl LIKE '%,=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment punya entri PUBLIC eksplisit (grantee kosong sebelum "="). ACL: %', v_acl;
  END IF;
  IF v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment masih ber-GRANT ke anon. ACL: %', v_acl;
  END IF;
  IF v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment tidak punya GRANT EXECUTE untuk authenticated. ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: 1 overload record_payment (9 argumen), signature lama hilang, ACL = %.', v_acl;
END
$vpost$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- mengembalikan v2 (get_mapped_account, tanpa potongan/cap).
-- Badan v2 LENGKAP ada di supabase/migrations/20260927000003_journal_account_roles_and_readiness.sql
-- (fungsi record_payment, signature 7 argumen). Urutan:
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text);
--   -- (tempel ulang CREATE OR REPLACE FUNCTION record_payment(...) dari
--   --  20260927000003, signature 7 argumen)
--   REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text) FROM PUBLIC;
--   GRANT ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text) TO authenticated;
--   COMMIT;
--
-- ⚠️ Rollback ini kehilangan cap TD-285/286 dan potongan TD-287 -- hanya
-- lakukan kalau memang ada yang patah dan perlu dibalik SEMENTARA.
-- =============================================================================
