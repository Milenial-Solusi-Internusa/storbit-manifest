-- =============================================================================
-- 20260928000006_invoice_line_tax_link.sql    (Invoice lengkap, berkas 6 dari 9)
--
-- Menautkan `sp_invoice_lines.tax_id` ke master pajak entitasnya.
--
-- AMAN UNTUK PRODUKSI (beda dari berkas 5 yang staging-only): produksi SUDAH
-- punya master `taxes` sejak 24 Mei / 23 Jun 2026, jadi berkas ini menemukan
-- yang dicarinya di kedua lingkungan.
--
-- ⭐ PENAUTAN LEWAT KODE + TARIF, BUKAN LEWAT ID.
--   Pencarian memakai (company_id, code = 'VAT_FULL', deleted_at IS NULL), lalu
--   MEMERIKSA bahwa tarif baris master itu benar-benar sama dengan
--   `sp_invoice_lines.tax_rate`. Menuliskan id-nya langsung akan "berhasil" di
--   staging dan diam-diam menunjuk baris yang salah kalau produksi punya id
--   lain -- kelas kegagalan yang tidak berbunyi.
--
--   Kalau tarifnya TIDAK cocok, berkas ini GAGAL dan tidak menautkan apa pun.
--   Itu disengaja: baris invoice yang menunjuk pajak bertarif berbeda dari
--   tarif yang dipakai menghitungnya adalah dokumen yang berbohong tentang
--   dirinya sendiri.
--
-- ⚠️ `tax_id` MURNI RUJUKAN NAMA. Angka yang menghitung tetap `tax_rate`
-- (terkunci 0.11, berkas 2) dan `ppn` per baris. Menautkan/mencabut tautan ini
-- TIDAK mengubah satu pun total -- V1 membuktikannya.
--
-- Entitas yang master pajaknya belum punya VAT_FULL: barisnya dibiarkan NULL
-- dan layar menampilkan tarifnya saja. NULL = "belum ada master", bukan galat.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_invoice_lines' AND column_name='tax_id'
  ) THEN
    RAISE EXCEPTION 'PALANG: sp_invoice_lines.tax_id tidak ada -- jalankan 20260928000002 lebih dulu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxes WHERE code='VAT_FULL' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'PALANG: nol baris taxes ber-code VAT_FULL yang hidup. Di staging jalankan 20260928000005 lebih dulu; di produksi periksa master pajaknya.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 + PEMERIKSAAN TARIF (sebelum menulis apa pun).
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE v_beda int; v_kosong int; v_total numeric;
BEGIN
  SELECT count(*) INTO v_beda
    FROM sp_invoice_lines sl
    JOIN sp_invoices i ON i.id = sl.invoice_id
    JOIN taxes t ON t.company_id = i.company_id AND t.code = 'VAT_FULL' AND t.deleted_at IS NULL
   WHERE t.rate <> sl.tax_rate;
  IF v_beda <> 0 THEN
    RAISE EXCEPTION 'PALANG TARIF: % baris invoice ber-tax_rate berbeda dari rate VAT_FULL entitasnya. Nol baris ditautkan.', v_beda;
  END IF;

  SELECT count(*) INTO v_kosong FROM sp_invoice_lines WHERE tax_id IS NULL;
  SELECT COALESCE(SUM(total_amount),0) INTO v_total FROM sp_invoices WHERE deleted_at IS NULL;
  RAISE NOTICE 'V0: % baris ber-tax_id NULL; SUM(total_amount) %', v_kosong, v_total;
END
$v0$;

-- ---------------------------------------------------------------------------
-- PENAUTAN
-- ---------------------------------------------------------------------------
UPDATE public.sp_invoice_lines sl
   SET tax_id = t.id
  FROM public.sp_invoices i, public.taxes t
 WHERE i.id = sl.invoice_id
   AND t.company_id = i.company_id
   AND t.code = 'VAT_FULL'
   AND t.deleted_at IS NULL
   AND t.rate = sl.tax_rate
   AND sl.tax_id IS DISTINCT FROM t.id;

COMMENT ON COLUMN public.sp_invoice_lines.tax_id IS
  'Rujukan ke master taxes (VAT_FULL entitas). MURNI NAMA -- angka yang menghitung tetap tax_rate + ppn. NULL = entitas belum punya master pajaknya. Invoice lengkap berkas 6, 20260928000006.';

-- ---------------------------------------------------------------------------
-- V1 -- tertaut, dan NOL angka bergerak.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_tertaut int; v_null int; v_salah int; v_beda_amt int; v_total numeric;
BEGIN
  SELECT count(*) FILTER (WHERE tax_id IS NOT NULL), count(*) FILTER (WHERE tax_id IS NULL)
    INTO v_tertaut, v_null FROM sp_invoice_lines;

  -- V1a: tiap tautan menunjuk VAT_FULL entitas yang BENAR, bertarif cocok.
  SELECT count(*) INTO v_salah
    FROM sp_invoice_lines sl
    JOIN sp_invoices i ON i.id = sl.invoice_id
    JOIN taxes t ON t.id = sl.tax_id
   WHERE sl.tax_id IS NOT NULL
     AND (t.company_id <> i.company_id OR t.code <> 'VAT_FULL'
          OR t.deleted_at IS NOT NULL OR t.rate <> sl.tax_rate);
  IF v_salah <> 0 THEN
    RAISE EXCEPTION 'V1a GAGAL: % baris tertaut ke pajak yang salah entitas/kode/tarif.', v_salah;
  END IF;

  -- V1b: PEMBANDING -- kalau NOL baris tertaut, V1a lolos tanpa menguji apa pun.
  IF v_tertaut = 0 THEN
    RAISE EXCEPTION 'V1b GAGAL: nol baris tertaut -- tidak ada yang dibuktikan.';
  END IF;

  -- V1c: identitas angka dari berkas 2 TIDAK bergerak.
  SELECT count(*) INTO v_beda_amt FROM (
    SELECT i.id FROM sp_invoices i LEFT JOIN sp_invoice_lines sl ON sl.invoice_id = i.id
     WHERE i.deleted_at IS NULL
     GROUP BY i.id, i.total_amount
    HAVING COALESCE(SUM(sl.line_amount),0) + COALESCE(SUM(sl.ppn),0) <> i.total_amount) z;
  IF v_beda_amt <> 0 THEN
    RAISE EXCEPTION 'V1c GAGAL: % invoice identitas totalnya bergeser.', v_beda_amt;
  END IF;

  SELECT COALESCE(SUM(total_amount),0) INTO v_total FROM sp_invoices WHERE deleted_at IS NULL;
  RAISE NOTICE 'V1 LOLOS: % baris tertaut, % masih NULL, 0 salah taut, identitas total utuh (SUM %).',
    v_tertaut, v_null, v_total;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   UPDATE public.sp_invoice_lines SET tax_id = NULL;
-- Nol dampak angka -- tax_id tidak pernah ikut perhitungan.
-- =============================================================================
