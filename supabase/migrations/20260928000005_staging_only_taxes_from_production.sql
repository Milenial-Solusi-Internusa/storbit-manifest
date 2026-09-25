-- =============================================================================
-- 20260928000005_staging_only_taxes_from_production.sql
--
--        !!!  S T A G I N G   O N L Y  --  JANGAN DIJALANKAN DI PRODUCTION  !!!
--
-- Berkas ini BUKAN bagian dari antrean migrasi produksi. Di
-- 12_ANTREAN_MIGRASI_PRODUCTION.md ia tercatat sebagai butir ARAH TERBALIK:
-- sesuatu yang hidup di staging dan HARUS TIDAK IKUT naik.
--
-- KENAPA ADA
--   Master `taxes` di PRODUKSI berisi 21 baris (7 kode x 3 entitas); di STAGING
--   NOL baris. Akibatnya kolom `sp_invoice_lines.tax_id` (berkas 2) tidak punya
--   apa pun untuk ditunjuk, dan tab Pajak hanya bisa menampilkan tarif telanjang
--   tanpa nama pajaknya.
--
--   Berkas ini menyalin master itu APA ADANYA -- id IDENTIK, termasuk dua kode
--   yang sudah soft-delete (PPN11 dan VAT_0, dihapus 23 Jun 2026). Id yang
--   identik itu bukan kerapian: ia yang membuat `tax_id` hasil backfill di
--   staging menunjuk baris yang SAMA dengan yang kelak ditunjuk di produksi,
--   sehingga perbandingan antar-lingkungan tetap berarti.
--
-- ⛔ ISI MASTER TIDAK DIUBAH SEDIKIT PUN (keputusan Den). Termasuk satu
-- ketidakkonsistenan yang SENGAJA dibiarkan dan jangan "dirapikan" di sini:
--       PPH21   rate = 5.0000   (persen sebagai bilangan bulat)
--       PPH23   rate = 2.0000
--       PPN11   rate = 11.0000  (soft-deleted)
--       VAT_FULL rate = 0.1100  (pecahan)
--       VAT_11   rate = 0.0110  (pecahan)
--   Dua konvensi hidup berdampingan di master yang sama. Yang dipakai
--   `sp_invoice_lines.tax_rate` adalah konvensi PECAHAN (0.11), jadi VAT_FULL
--   cocok. Merapikan konvensinya adalah keputusan Finance, bukan pekerjaan ini.
--
-- Diukur di produksi 27 Sep 2026 (SELECT saja, nol tulis):
--   21 baris - created_by SELURUHNYA NULL - gl_account_id SELURUHNYA NULL -
--   notes SELURUHNYA NULL. Karena itu penyalinan ini TIDAK membawa satu pun
--   kunci asing ke profil atau akun yang mungkin tidak ada di staging.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG BERBENTUK DATA.
-- Ref project tidak terlihat dari dalam SQL, jadi palangnya memakai fakta yang
-- MEMBEDAKAN kedua lingkungan: produksi punya 21 baris taxes, staging nol.
-- Menjalankan berkas ini di produksi akan berhenti di sini.
-- ---------------------------------------------------------------------------
DO $palang$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.taxes;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PALANG: tabel taxes sudah berisi % baris. Berkas ini HANYA untuk DB yang master pajaknya KOSONG (staging). Di produksi ia tidak pernah boleh jalan.', v_n;
  END IF;
  RAISE NOTICE 'PALANG LOLOS: taxes kosong -- ini staging.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- SALINAN VERBATIM -- 21 baris, id identik dengan produksi.
-- ---------------------------------------------------------------------------
INSERT INTO public.taxes
  (id, company_id, code, name, rate, tax_type, is_inclusive, gl_account_id, notes,
   is_active, created_by, created_at, updated_at, deleted_at)
VALUES
-- MSI
('d4104a1e-049c-4e79-8f65-7d1c226b3bdf','0e1840d8-e6fb-4190-bd09-88338e68b492','PPH21','PPh Pasal 21 (5%)',5.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('43b3fb47-0ddb-4e36-88c3-f4eb2010dd8b','0e1840d8-e6fb-4190-bd09-88338e68b492','PPH23','PPh Pasal 23 (2%)',2.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('41110f79-b899-44e6-84c2-f0c1f0fd8927','0e1840d8-e6fb-4190-bd09-88338e68b492','PPN11','PPN 11% (VAT)',11.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-06-23T19:25:10.559809+00','2026-06-23T19:25:10.559809+00'),
('44d937c8-f8fe-4f85-95a3-3d5c9952f4cb','0e1840d8-e6fb-4190-bd09-88338e68b492','TAXFREE','Non-Taxable / Tax Exempt',0.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('94327261-4dbc-4165-9a94-913783e53b6d','0e1840d8-e6fb-4190-bd09-88338e68b492','VAT_0','Bebas PPN',0.0000,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:25:10.559809+00','2026-06-23T19:25:10.559809+00'),
('eed23f21-0dbd-43f8-988a-dfc2276154aa','0e1840d8-e6fb-4190-bd09-88338e68b492','VAT_11','PPN 1,1%',0.0110,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:18:16.285234+00',NULL),
('6476d2e8-cb60-4387-82d6-72e0b4043182','0e1840d8-e6fb-4190-bd09-88338e68b492','VAT_FULL','PPN 11%',0.1100,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:18:16.285234+00',NULL),
-- JCI
('788dafa9-f9cb-4a1e-8948-2ba7464c6fce','42569e7c-531b-4d2b-832a-d5a7268c455b','PPH21','PPh Pasal 21 (5%)',5.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('2cea3f8a-7605-418b-8ca4-00ec834c8034','42569e7c-531b-4d2b-832a-d5a7268c455b','PPH23','PPh Pasal 23 (2%)',2.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('aab69d6c-d430-4062-a656-0791de9d7b84','42569e7c-531b-4d2b-832a-d5a7268c455b','PPN11','PPN 11% (VAT)',11.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-06-23T19:25:10.559809+00','2026-06-23T19:25:10.559809+00'),
('d03f7410-d745-4388-81bc-314006e91c92','42569e7c-531b-4d2b-832a-d5a7268c455b','TAXFREE','Non-Taxable / Tax Exempt',0.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('433713d4-c1db-413e-8527-a2ee7ea1be5f','42569e7c-531b-4d2b-832a-d5a7268c455b','VAT_0','Bebas PPN',0.0000,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:25:10.559809+00','2026-06-23T19:25:10.559809+00'),
('fb546414-a2a9-4843-90a3-74e5c5abae5d','42569e7c-531b-4d2b-832a-d5a7268c455b','VAT_11','PPN 1,1%',0.0110,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:18:16.285234+00',NULL),
('36c1efd1-f57b-4d95-adf4-0c2b0502a964','42569e7c-531b-4d2b-832a-d5a7268c455b','VAT_FULL','PPN 11%',0.1100,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:18:16.285234+00',NULL),
-- SOA
('ed0a92a3-aba3-4a13-8d8b-f88a2f54fb5b','d2e5e565-5f67-4954-b8d9-5979a2a0c697','PPH21','PPh Pasal 21 (5%)',5.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('88db8f4a-bfb1-4486-9974-3c97b128b826','d2e5e565-5f67-4954-b8d9-5979a2a0c697','PPH23','PPh Pasal 23 (2%)',2.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('e705997e-b382-46db-a34b-f512e43162b8','d2e5e565-5f67-4954-b8d9-5979a2a0c697','PPN11','PPN 11% (VAT)',11.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-06-23T19:25:10.559809+00','2026-06-23T19:25:10.559809+00'),
('70c26974-8a9e-4cc9-b0b7-851419f17e63','d2e5e565-5f67-4954-b8d9-5979a2a0c697','TAXFREE','Non-Taxable / Tax Exempt',0.0000,'percentage',false,NULL,NULL,true,NULL,'2026-05-24T17:13:20.169399+00','2026-05-24T17:13:20.169399+00',NULL),
('5e33e114-87bd-487d-9e15-9416c8000ae2','d2e5e565-5f67-4954-b8d9-5979a2a0c697','VAT_0','Bebas PPN',0.0000,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:25:10.559809+00','2026-06-23T19:25:10.559809+00'),
('64e3e60d-fc36-4856-892a-44fdea1c89df','d2e5e565-5f67-4954-b8d9-5979a2a0c697','VAT_11','PPN 1,1%',0.0110,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:18:16.285234+00',NULL),
('52e2ebb7-0628-4540-af5b-5b7cd96f6dd5','d2e5e565-5f67-4954-b8d9-5979a2a0c697','VAT_FULL','PPN 11%',0.1100,'percentage',false,NULL,NULL,true,NULL,'2026-06-23T19:18:16.285234+00','2026-06-23T19:18:16.285234+00',NULL);

-- ---------------------------------------------------------------------------
-- V1
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE v_n int; v_hapus int; v_entitas int; v_vf int; v_rate numeric;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE deleted_at IS NOT NULL), count(DISTINCT company_id)
    INTO v_n, v_hapus, v_entitas FROM public.taxes;
  IF v_n <> 21 THEN RAISE EXCEPTION 'V1a GAGAL: % baris, harusnya 21.', v_n; END IF;
  IF v_hapus <> 6 THEN RAISE EXCEPTION 'V1b GAGAL: % baris soft-delete, harusnya 6 (PPN11 + VAT_0 x 3 entitas).', v_hapus; END IF;
  IF v_entitas <> 3 THEN RAISE EXCEPTION 'V1c GAGAL: % entitas, harusnya 3.', v_entitas; END IF;

  SELECT count(*) INTO v_vf FROM public.taxes WHERE code='VAT_FULL' AND deleted_at IS NULL;
  IF v_vf <> 3 THEN RAISE EXCEPTION 'V1d GAGAL: VAT_FULL hidup % baris, harusnya 3.', v_vf; END IF;

  -- V1e: tarif VAT_FULL WAJIB cocok dengan konvensi sp_invoice_lines.tax_rate
  -- (0.11). Kalau tidak, berkas 6 akan menautkan baris invoice ke pajak yang
  -- angkanya berbeda dari yang dipakai menghitung -- kebohongan tertulis.
  SELECT DISTINCT rate INTO v_rate FROM public.taxes WHERE code='VAT_FULL' AND deleted_at IS NULL;
  IF v_rate <> 0.11 THEN
    RAISE EXCEPTION 'V1e GAGAL: rate VAT_FULL = %, sementara sp_invoice_lines.tax_rate memakai 0.11.', v_rate;
  END IF;

  RAISE NOTICE 'V1 LOLOS: 21 baris (6 soft-delete) di 3 entitas; VAT_FULL hidup 3 baris ber-rate 0.11.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK (staging saja):
--   DELETE FROM public.taxes
--    WHERE id IN (...21 id di atas...);
--   -- atau, kalau staging memang tidak punya pajak lain:
--   -- DELETE FROM public.taxes;
-- ⚠️ Jalankan berkas 6 mundur DULU (tax_id -> NULL), kalau tidak FK menahan.
-- =============================================================================
