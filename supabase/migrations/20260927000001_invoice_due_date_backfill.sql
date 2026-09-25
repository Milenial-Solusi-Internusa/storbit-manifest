-- =============================================================================
-- 20260927000001_invoice_due_date_backfill.sql   (AR Tahap 2, butir 1 dari 3)
--
-- Mengisi sp_invoices.due_date yang NULL untuk invoice NON-VOID, memakai rantai
-- termin yang PERSIS SAMA dengan create_invoice_for_sp.
--
-- KENAPA ADA
--   AR Tahap 1 butir (b) menghitung due_date SAAT INVOICE TERBIT, jadi ia hanya
--   memperbaiki invoice BARU. Invoice lama tetap NULL: di produksi 538 dari 539
--   invoice hidup (508 non-void + 30 void). Backfill sengaja BUKAN Tahap 1
--   (keputusan Den D-14) supaya Tahap 1 tetap satu perubahan yang bisa dibaca.
--
-- CAKUPAN -- dan yang SENGAJA di luar cakupan
--   Yang diisi : due_date IS NULL, status <> 'void', deleted_at IS NULL
--   TIDAK diisi: invoice VOID (keputusan Den K-3) -- due_date pada invoice yang
--                dibatalkan tidak punya arti; mengisinya cuma menambah angka
--                yang kelihatan resmi tapi tidak pernah dipakai.
--   TIDAK diubah: invoice yang due_date-nya SUDAH terisi. Sekali pun nilainya
--                tampak "salah", ia mungkin nomor yang sudah beredar -- kalau
--                perlu dikoreksi, itu keputusan akuntansi, bukan backfill.
--
-- RANTAI TERMIN (tiga tingkat, urutan mengikat)
--   1. accounts.invoice_payment_terms_days  (override per customer)
--   2. entity_finance_settings -> payment_terms.days_due, HANYA bila is_active
--   3. entity_finance_settings.default_payment_terms
--   4. cadangan terakhir: 30
--
--   !! Di produksi, 538 dari 538 terjawab di TINGKAT 1 (satu customer,
--   Indomarco, invoice_payment_terms_days terisi). Tingkat 2 dan 3 TIDAK akan
--   tersentuh di sana -- yang mengujinya hanya seed staging (tiga customer
--   ber-NULL turun ke cadangan 30). Jangan baca "backfill lolos di produksi"
--   sebagai "rantai terminnya teruji".
--
--   !! Bentuknya COALESCE berantai, bukan IF/ELSE seperti di PL/pgSQL. Keduanya
--   ekuivalen untuk keempat kasus di atas; yang TIDAK ekuivalen cuma satu hal:
--   subquery skalar akan GAGAL kalau satu company punya lebih dari satu baris
--   entity_finance_settings, sementara SELECT INTO di PL/pgSQL diam-diam
--   mengambil baris pertama. Karena itu V0 memeriksanya lebih dulu, dan
--   subquery-nya tetap memakai LIMIT 1 supaya tidak meledak di tengah UPDATE.
--
-- ROLLBACK: lihat blok di ekor berkas. Tabel cadangan dibuat SEBELUM UPDATE.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan sebelum + palang.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE
  v_total      int;
  v_null_live  int;
  v_null_void  int;
  v_efs_dobel  int;
BEGIN
  SELECT count(*) INTO v_total FROM sp_invoices WHERE deleted_at IS NULL;

  SELECT count(*) INTO v_null_live
    FROM sp_invoices WHERE deleted_at IS NULL AND due_date IS NULL AND status <> 'void';

  SELECT count(*) INTO v_null_void
    FROM sp_invoices WHERE deleted_at IS NULL AND due_date IS NULL AND status = 'void';

  SELECT count(*) INTO v_efs_dobel FROM (
    SELECT company_id FROM entity_finance_settings GROUP BY company_id HAVING count(*) > 1
  ) t;

  RAISE NOTICE 'V0: invoice hidup=%, due_date NULL non-void=% (akan diisi), due_date NULL void=% (SENGAJA dibiarkan)',
    v_total, v_null_live, v_null_void;

  IF v_efs_dobel > 0 THEN
    RAISE EXCEPTION 'PALANG: % company punya lebih dari satu baris entity_finance_settings. Subquery termin di bawah akan gagal, dan sebelum itu terjadi lebih baik manusia memutuskan baris mana yang benar.', v_efs_dobel;
  END IF;

  IF v_null_live = 0 THEN
    RAISE NOTICE 'V0: nol invoice non-void ber-due_date NULL -- migrasi ini idempoten, teruskan saja (tidak ada yang akan berubah).';
  END IF;
END
$v0$;

-- ---------------------------------------------------------------------------
-- CADANGAN -- dibuat SEBELUM UPDATE, dan inilah satu-satunya jalan pulang.
-- Menyimpan due_date LAMA (selalu NULL untuk baris yang disentuh) plus bahan
-- hitungannya, supaya kalau angkanya kelak dipersoalkan, jejaknya ada tanpa
-- perlu menghitung ulang rantai termin yang mungkin sudah berubah.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_invoices_due_date_backfill_20260927 (
  invoice_id      uuid PRIMARY KEY,
  invoice_no      text,
  status_saat_itu text,
  invoice_date    date,
  due_date_lama   date,
  term_days       int,
  due_date_baru   date,
  sumber_term     text,
  dicatat_pada    timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.sp_invoices_due_date_backfill_20260927 FROM PUBLIC;
REVOKE ALL ON TABLE public.sp_invoices_due_date_backfill_20260927 FROM authenticated;
REVOKE ALL ON TABLE public.sp_invoices_due_date_backfill_20260927 FROM anon;

WITH calon AS (
  SELECT i.id, i.invoice_no, i.status, i.invoice_date,
         o.company_id, o.customer_id,
         a.invoice_payment_terms_days AS t1,
         (SELECT CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END
            FROM entity_finance_settings efs
            LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
           WHERE efs.company_id = o.company_id
           LIMIT 1) AS t2,
         (SELECT efs2.default_payment_terms
            FROM entity_finance_settings efs2
           WHERE efs2.company_id = o.company_id
           LIMIT 1) AS t3
    FROM sp_invoices i
    JOIN sp_orders o ON o.id = i.sp_order_id
    LEFT JOIN accounts a ON a.id = o.customer_id
   WHERE i.deleted_at IS NULL
     AND i.due_date IS NULL
     AND i.status <> 'void'
)
INSERT INTO public.sp_invoices_due_date_backfill_20260927
  (invoice_id, invoice_no, status_saat_itu, invoice_date, due_date_lama, term_days, due_date_baru, sumber_term)
SELECT c.id, c.invoice_no, c.status, c.invoice_date, NULL,
       COALESCE(c.t1, c.t2, c.t3, 30),
       c.invoice_date + COALESCE(c.t1, c.t2, c.t3, 30),
       CASE WHEN c.t1 IS NOT NULL THEN 'akun (invoice_payment_terms_days)'
            WHEN c.t2 IS NOT NULL THEN 'entity_finance_settings -> payment_terms'
            WHEN c.t3 IS NOT NULL THEN 'entity_finance_settings.default_payment_terms'
            ELSE 'cadangan 30' END
  FROM calon c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.sp_invoices_due_date_backfill_20260927 b WHERE b.invoice_id = c.id
 );

-- ---------------------------------------------------------------------------
-- BACKFILL -- membaca angkanya dari tabel cadangan, bukan menghitung ulang.
-- Dengan begitu yang tersimpan sebagai jejak dan yang mendarat di sp_invoices
-- DIJAMIN sama; menghitung dua kali membuka celah keduanya berbeda.
-- ---------------------------------------------------------------------------
UPDATE sp_invoices i
   SET due_date = b.due_date_baru,
       updated_at = now()
  FROM public.sp_invoices_due_date_backfill_20260927 b
 WHERE b.invoice_id = i.id
   AND i.due_date IS NULL
   AND i.status <> 'void'
   AND i.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- V1 -- sesudah.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_sisa_null   int;
  v_void_null   int;
  v_salah_hitung int;
  v_dicadangkan int;
BEGIN
  SELECT count(*) INTO v_sisa_null
    FROM sp_invoices WHERE deleted_at IS NULL AND due_date IS NULL AND status <> 'void';

  SELECT count(*) INTO v_void_null
    FROM sp_invoices WHERE deleted_at IS NULL AND due_date IS NULL AND status = 'void';

  SELECT count(*) INTO v_dicadangkan FROM public.sp_invoices_due_date_backfill_20260927;

  -- Setiap baris yang disentuh HARUS sama dengan invoice_date + term_days.
  SELECT count(*) INTO v_salah_hitung
    FROM sp_invoices i
    JOIN public.sp_invoices_due_date_backfill_20260927 b ON b.invoice_id = i.id
   WHERE i.due_date IS DISTINCT FROM (i.invoice_date + b.term_days);

  IF v_sisa_null > 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: masih ada % invoice non-void ber-due_date NULL.', v_sisa_null;
  END IF;

  IF v_salah_hitung > 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: % baris ber-due_date yang tidak sama dengan invoice_date + term_days.', v_salah_hitung;
  END IF;

  RAISE NOTICE 'V1 LOLOS: non-void ber-due_date NULL=0, dicadangkan=% baris, void ber-due_date NULL=% (sengaja dibiarkan, K-3).',
    v_dicadangkan, v_void_null;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
--   BEGIN;
--   UPDATE sp_invoices i SET due_date = b.due_date_lama, updated_at = now()
--     FROM public.sp_invoices_due_date_backfill_20260927 b
--    WHERE b.invoice_id = i.id AND i.due_date = b.due_date_baru;
--   COMMIT;
--
-- Syarat `i.due_date = b.due_date_baru` disengaja: kalau seseorang sudah
-- mengoreksi due_date sebuah invoice SESUDAH backfill, rollback ini TIDAK akan
-- menimpanya. Memulihkan buta akan menghapus koreksi manusia tanpa jejak.
--
-- Tabel cadangannya JANGAN di-DROP bersamaan rollback -- ia jejak kapan dan dari
-- mana angkanya datang. Drop-nya belakangan, bersama tabel *_backup_* lain
-- (03_DATA_MODEL.md gotcha #10).
-- =============================================================================
