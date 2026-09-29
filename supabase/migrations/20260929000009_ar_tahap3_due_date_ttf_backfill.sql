-- =============================================================================
-- 20260929000009_ar_tahap3_due_date_ttf_backfill.sql   (AR Tahap 3, berkas 6 dari 6)
--
-- ✔ SUDAH DIJALANKAN KE STAGING 29 Sep 2026, sesudah blok V0 di bawah
-- direview dan disetujui Den: 22 invoice tersentuh -- 8 karena sudah punya
-- TTF (due_date berubah basis dari invoice_date ke tanggal_ttf), 14 jadi
-- "Belum TTF" (kehilangan due_date lama). Untuk sesi eksekusi staging itu,
-- blok STOP KERAS (di bawah, lihat "-- STOP KERAS") DIHAPUS MANUAL sesaat
-- sesudah review -- BUKAN dengan menyunting berkas ini di repo.
--
-- ⛔⛔⛔ BERKAS INI DI REPO TETAP MEMUAT STOP KERAS-nya UTUH, dan itu
-- disengaja: PRODUCTION belum pernah menjalankan berkas ini, dan populasi
-- invoice-nya BEDA dari staging, jadi angka V0 wajib diukur ULANG dan
-- direview ULANG untuk production sebelum blok STOP-nya boleh dihapus lagi
-- -- di sesi eksekusi PRODUCTION itu sendiri, bukan di repo. JANGAN
-- DIJALANKAN (dan JANGAN hapus blok STOP-nya) sebelum query pengukuran
-- dampak (blok V0 di bawah, atau versi standalone di laporan sesi)
-- DIJALANKAN dan HASILNYA DIREVIEW DEN untuk lingkungan yang dituju. Blok
-- STOP itu WAJIB dihapus manual sebelum bagian backfill bisa jalan --
-- disengaja, supaya berkas ini tidak bisa tereksekusi utuh secara tidak
-- sengaja.
--
-- KENAPA INI BUKAN SEKADAR "isi yang NULL" (beda dari 20260927000001):
-- Backfill due_date SEBELUMNYA (20260927000001, AR Tahap 2) mengisi due_date
-- yang NULL dari invoice_date + termin. AR Tahap 3 memindahkan DASAR due_date
-- dari invoice_date ke tanggal_ttf (berkas 5) -- jadi nilai yang DIHASILKAN
-- backfill lama itu SALAH BASIS untuk invoice yang sudah punya due_date, dan
-- backfill ini WAJIB menimpanya, bukan cuma mengisi yang kosong.
--
-- ATURAN PER INVOICE (non-void, deleted_at IS NULL):
--   ADA TTF   -> due_date_baru = tanggal_ttf TERTUA + compute_payment_term_days(...)
--               (tanggal_ttf tertua -- SAMA dengan aturan mark_ttf_received/
--               getTtfStatus: ORDER BY created_at LIMIT 1)
--   NOL TTF   -> due_date_baru = NULL. Invoice ini akan tampil "Belum TTF" di
--               FE, BUKAN "lewat jatuh tempo" -- persis tujuan AR Tahap 3.
--               Kalau sebelumnya due_date-nya TERISI (dari basis invoice_date
--               lama), baris ini KEHILANGAN due_date -- itu perubahan
--               tampilan yang TERLIHAT, dan sudah DISETUJUI Den. Dua angka
--               JANGAN tertukar: laporan pengukuran PRODUCTION (read-only,
--               sebelum eksekusi apa pun) = 1 invoice; hasil EKSEKUSI
--               STAGING 29 Sep 2026 (lihat catatan di kepala berkas) = 14
--               invoice -- populasi kedua lingkungan berbeda.
--   VOID      -> TIDAK disentuh (konsisten K-3, 20260927000001): due_date
--               pada invoice batal tidak punya arti.
--
-- CADANGAN dibuat SEBELUM UPDATE, menyimpan due_date LAMA + tanggal_ttf yang
-- dipakai + due_date BARU -- pola sama dengan sp_invoices_due_date_backfill_20260927.
--
-- Status: LIVE STAGING 29 Sep 2026 (sesudah review V0 oleh Den) -- PRODUCTION
-- BELUM, MENUNGGU REVIEW V0 ULANG untuk data production saat launching
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V0 -- pengukuran dampak. AMAN dijalankan sendirian (READ-ONLY, tidak
-- mengubah apa pun) -- inilah yang WAJIB direview Den sebelum blok backfill
-- di bawahnya dibuka.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE
  v_ada_ttf int;
  v_berubah int;
  v_hilang_jadi_belum_ttf int;
  v_tetap_null int;
  v_total_live int;
  v_void int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='compute_payment_term_days'
  ) THEN
    RAISE EXCEPTION 'PALANG: compute_payment_term_days belum ada -- jalankan 20260929000004 lebih dulu.';
  END IF;

  CREATE TEMP TABLE t9_calon ON COMMIT DROP AS
  WITH ttf_pick AS (
    SELECT DISTINCT ON (invoice_id) invoice_id, tanggal_ttf
      FROM ar_ttfs
     WHERE invoice_id IS NOT NULL
     ORDER BY invoice_id, created_at ASC
  )
  SELECT i.id, i.invoice_no, i.status, i.due_date AS due_date_lama,
         t.tanggal_ttf,
         o.company_id, o.customer_id,
         CASE WHEN t.tanggal_ttf IS NOT NULL
              THEN t.tanggal_ttf + compute_payment_term_days(o.company_id, o.customer_id)
              ELSE NULL END AS due_date_baru
    FROM sp_invoices i
    JOIN sp_orders o ON o.id = i.sp_order_id
    LEFT JOIN ttf_pick t ON t.invoice_id = i.id
   WHERE i.deleted_at IS NULL AND i.status <> 'void';

  SELECT count(*) INTO v_total_live FROM t9_calon;
  SELECT count(*) INTO v_ada_ttf FROM t9_calon WHERE tanggal_ttf IS NOT NULL;
  SELECT count(*) INTO v_berubah FROM t9_calon
   WHERE tanggal_ttf IS NOT NULL AND due_date_lama IS DISTINCT FROM due_date_baru;
  SELECT count(*) INTO v_hilang_jadi_belum_ttf FROM t9_calon
   WHERE tanggal_ttf IS NULL AND due_date_lama IS NOT NULL;
  SELECT count(*) INTO v_tetap_null FROM t9_calon
   WHERE tanggal_ttf IS NULL AND due_date_lama IS NULL;
  SELECT count(*) INTO v_void FROM sp_invoices WHERE deleted_at IS NULL AND status = 'void';

  RAISE NOTICE '=== V0 PENGUKURAN DAMPAK (READ-ONLY) ===';
  RAISE NOTICE 'Invoice hidup non-void: %', v_total_live;
  RAISE NOTICE 'Ada TTF (due_date akan/tetap terisi dari tanggal_ttf): %', v_ada_ttf;
  RAISE NOTICE '  ...dari situ, due_date BERUBAH nilainya (basis lama invoice_date -> basis baru tanggal_ttf): %', v_berubah;
  RAISE NOTICE 'NOL TTF, due_date lama TERISI -> akan HILANG jadi NULL/"Belum TTF": %', v_hilang_jadi_belum_ttf;
  RAISE NOTICE 'NOL TTF, due_date lama sudah NULL -> tetap NULL (tidak berubah tampilan): %', v_tetap_null;
  RAISE NOTICE 'Invoice VOID (tidak disentuh sama sekali): %', v_void;
  RAISE NOTICE '=== AKHIR V0 -- REVIEW angka di atas dengan Den sebelum lanjut ke blok STOP di bawah ===';
END
$v0$;

-- =============================================================================
-- STOP KERAS. Baris RAISE EXCEPTION di bawah ini menghentikan transaksi
-- (dan membatalkan V0 juga, karena satu BEGIN...COMMIT yang sama) SAMPAI
-- seseorang menghapusnya secara MANUAL sesudah angka V0 di atas direview
-- Den. Ini bukan kelalaian -- ini satu-satunya cara membuat berkas ini
-- tidak bisa dieksekusi utuh secara tidak sengaja (mis. lewat "jalankan
-- semua migration yang belum jalan").
-- =============================================================================
DO $stop$
BEGIN
  RAISE EXCEPTION 'STOP: hapus blok DO $stop$ ini SETELAH angka V0 di atas direview dan disetujui Den. Backfill di bawah BELUM boleh jalan.';
END
$stop$;
-- ⛔ HAPUS BLOK "DO $stop$ ... $stop$;" DI ATAS INI SEBELUM MELANJUTKAN. ⛔

-- ---------------------------------------------------------------------------
-- CADANGAN -- dibuat SEBELUM UPDATE, satu-satunya jalan pulang.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sp_invoices_due_date_ttf_backfill_20260929 (
  invoice_id      uuid PRIMARY KEY,
  invoice_no      text,
  status_saat_itu text,
  tanggal_ttf     date,
  term_days       int,
  due_date_lama   date,
  due_date_baru   date,
  dicatat_pada    timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.sp_invoices_due_date_ttf_backfill_20260929 FROM PUBLIC;
REVOKE ALL ON TABLE public.sp_invoices_due_date_ttf_backfill_20260929 FROM authenticated;
REVOKE ALL ON TABLE public.sp_invoices_due_date_ttf_backfill_20260929 FROM anon;

WITH ttf_pick AS (
  SELECT DISTINCT ON (invoice_id) invoice_id, tanggal_ttf
    FROM ar_ttfs
   WHERE invoice_id IS NOT NULL
   ORDER BY invoice_id, created_at ASC
),
calon AS (
  SELECT i.id, i.invoice_no, i.status, i.due_date AS due_date_lama,
         t.tanggal_ttf,
         o.company_id, o.customer_id,
         CASE WHEN t.tanggal_ttf IS NOT NULL
              THEN compute_payment_term_days(o.company_id, o.customer_id)
              ELSE NULL END AS term_days
    FROM sp_invoices i
    JOIN sp_orders o ON o.id = i.sp_order_id
    LEFT JOIN ttf_pick t ON t.invoice_id = i.id
   WHERE i.deleted_at IS NULL AND i.status <> 'void'
)
INSERT INTO public.sp_invoices_due_date_ttf_backfill_20260929
  (invoice_id, invoice_no, status_saat_itu, tanggal_ttf, term_days, due_date_lama, due_date_baru)
SELECT c.id, c.invoice_no, c.status, c.tanggal_ttf, c.term_days, c.due_date_lama,
       CASE WHEN c.tanggal_ttf IS NOT NULL THEN c.tanggal_ttf + c.term_days ELSE NULL END
  FROM calon c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.sp_invoices_due_date_ttf_backfill_20260929 b WHERE b.invoice_id = c.id
 );

-- ---------------------------------------------------------------------------
-- BACKFILL -- membaca angkanya dari tabel cadangan, bukan menghitung ulang,
-- supaya jejak dan hasil DIJAMIN sama. WHERE ... IS DISTINCT FROM menjaga
-- idempotensi: baris yang due_date-nya sudah benar (sama dengan due_date_baru)
-- tidak disentuh dua kali.
-- ---------------------------------------------------------------------------
UPDATE sp_invoices i
   SET due_date = b.due_date_baru,
       updated_at = now()
  FROM public.sp_invoices_due_date_ttf_backfill_20260929 b
 WHERE b.invoice_id = i.id
   AND i.status <> 'void'
   AND i.deleted_at IS NULL
   AND i.due_date IS DISTINCT FROM b.due_date_baru;

-- ---------------------------------------------------------------------------
-- V1 -- sesudah.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_dicadangkan int;
  v_salah_hitung int;
  v_masih_beda int;
BEGIN
  SELECT count(*) INTO v_dicadangkan FROM public.sp_invoices_due_date_ttf_backfill_20260929;

  SELECT count(*) INTO v_salah_hitung
    FROM public.sp_invoices_due_date_ttf_backfill_20260929 b
   WHERE b.tanggal_ttf IS NOT NULL
     AND b.due_date_baru IS DISTINCT FROM (b.tanggal_ttf + b.term_days);
  IF v_salah_hitung > 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: % baris cadangan due_date_baru tidak sama dengan tanggal_ttf + term_days.', v_salah_hitung;
  END IF;

  SELECT count(*) INTO v_masih_beda
    FROM sp_invoices i
    JOIN public.sp_invoices_due_date_ttf_backfill_20260929 b ON b.invoice_id = i.id
   WHERE i.status <> 'void' AND i.deleted_at IS NULL
     AND i.due_date IS DISTINCT FROM b.due_date_baru;
  IF v_masih_beda > 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: % invoice due_date TIDAK sama dengan due_date_baru di cadangan sesudah UPDATE.', v_masih_beda;
  END IF;

  RAISE NOTICE 'V1 LOLOS: % baris dicadangkan, 0 salah hitung, 0 baris meleset dari due_date_baru sesudah UPDATE.', v_dicadangkan;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- syarat disengaja: hanya mengembalikan baris yang due_date-nya
-- MASIH SAMA dengan due_date_baru backfill ini. Kalau seseorang sudah
-- mengoreksi due_date sebuah invoice SESUDAH backfill, rollback ini TIDAK
-- akan menimpanya.
--
--   BEGIN;
--   UPDATE sp_invoices i SET due_date = b.due_date_lama, updated_at = now()
--     FROM public.sp_invoices_due_date_ttf_backfill_20260929 b
--    WHERE b.invoice_id = i.id AND i.due_date IS NOT DISTINCT FROM b.due_date_baru;
--   COMMIT;
--
-- Tabel cadangannya JANGAN di-DROP bersamaan rollback -- ia jejak kapan dan
-- dari mana angkanya datang (03_DATA_MODEL.md gotcha #10).
-- =============================================================================
