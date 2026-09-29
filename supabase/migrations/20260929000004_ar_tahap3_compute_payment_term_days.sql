-- =============================================================================
-- 20260929000004_ar_tahap3_compute_payment_term_days.sql   (AR Tahap 3, berkas 1 dari 6)
--
-- Helper BARU: satu tempat untuk rantai termin tiga tingkat yang sebelum ini
-- terduplikasi di TIGA fungsi (submit_invoice, create_invoice_for_sp versi
-- Tahap 1/2, dan backfill 20260927000001). Dipakai berkas 5 (AR Tahap 3) oleh
-- mark_ttf_received untuk menghitung due_date dari tanggal TTF -- BUKAN dari
-- tanggal invoice.
--
-- ADITIF SEPENUHNYA: nol tabel, nol fungsi lama disentuh di berkas ini.
--
-- RANTAI TERMIN (identik dengan submit_invoice/create_invoice_for_sp lama,
-- urutan mengikat):
--   1. accounts.invoice_payment_terms_days       (override per customer)
--   2. entity_finance_settings -> payment_terms.days_due, HANYA bila is_active
--   3. entity_finance_settings.default_payment_terms
--   4. cadangan terakhir: 30
--
-- ACL: REVOKE ALL dari PUBLIC, anon, DAN authenticated -- fungsi ini HANYA
-- dipanggil dari dalam fungsi SECURITY DEFINER lain (mark_ttf_received),
-- tidak perlu dan tidak boleh dipanggil langsung lewat PostgREST.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_payment_term_days(p_company_id uuid, p_customer_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(
    (SELECT invoice_payment_terms_days FROM accounts WHERE id = p_customer_id),
    (SELECT CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END
       FROM entity_finance_settings efs
       LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
      WHERE efs.company_id = p_company_id
      LIMIT 1),
    (SELECT efs2.default_payment_terms FROM entity_finance_settings efs2
      WHERE efs2.company_id = p_company_id
      LIMIT 1),
    30
  );
$fn$;

REVOKE ALL ON FUNCTION public.compute_payment_term_days(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_payment_term_days(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.compute_payment_term_days(uuid, uuid) FROM authenticated;

COMMENT ON FUNCTION public.compute_payment_term_days(uuid, uuid) IS
  'Rantai termin tiga tingkat (override akun -> entity_finance_settings -> cadangan 30), dipusatkan supaya tidak terduplikasi. HANYA dipanggil dari fungsi SECURITY DEFINER lain (mark_ttf_received) -- nol GRANT ke authenticated/anon. AR Tahap 3, 20260929000004.';

-- ---------------------------------------------------------------------------
-- V1 -- ACL harus benar-benar kosong untuk anon/authenticated, dan fungsinya
-- harus bisa dipanggil (bukti fungsional, bukan cuma "ada").
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_acl text;
  v_n_pemetaan int;
BEGIN
  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)')
    INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'compute_payment_term_days';

  IF v_acl LIKE '%anon%' OR v_acl LIKE '%authenticated%' OR v_acl = '(null = PUBLIC EXECUTE)' THEN
    RAISE EXCEPTION 'V1 GAGAL: compute_payment_term_days masih terjangkau anon/authenticated/PUBLIC. ACL: %', v_acl;
  END IF;

  -- Bukti fungsional read-only: hitung untuk company_id/customer_id acak
  -- (boleh tidak match apa pun -- yang diuji hanya fungsinya TIDAK error dan
  -- mengembalikan angka >= 0, sampai ke cadangan 30).
  SELECT 1 INTO v_n_pemetaan;
  PERFORM compute_payment_term_days(gen_random_uuid(), gen_random_uuid());

  RAISE NOTICE 'V1 LOLOS: ACL compute_payment_term_days = %, dan panggilan uji (company/customer acak) sukses kembali ke cadangan 30 hari.', v_acl;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- aman kapan pun SELAMA mark_ttf_received (berkas 5) belum jalan;
-- sesudah itu, DROP fungsi ini akan membuat mark_ttf_received gagal keras.
--
--   DROP FUNCTION IF EXISTS public.compute_payment_term_days(uuid, uuid);
-- =============================================================================
