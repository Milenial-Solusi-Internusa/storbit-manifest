-- ============================================================================
-- B4 — pensiunkan inquiries.commodity: backup + backfill 80 baris + DROP COLUMN.
-- SUDAH DIJALANKAN MANUAL 2026-07-25 (urutan persis di bawah). File ini ARSIP
-- — aman di-replay saat rebuild: backup skip kalau sudah ada, backfill skip
-- total kalau kolom commodity sudah tak ada, drop skip kalau kolom sudah tak
-- ada. Ketiga step masing-masing idempotent secara independen.
--
-- KONTEKS: commodity dipensiunkan dari sisi kode sejak batch B3 (commit
-- 260e9ae, 23 Jul 2026, "feat(inquiry): gabung goods_name + commodity jadi
-- nama barang tunggal") — form Inquiry berhenti baca/tulis commodity,
-- goods_name jadi satu-satunya field nama barang. Per AUDIT_B4_READINESS.md
-- (25 Jul 2026): nol pembaca inquiries.commodity tersisa di src/, Edge
-- Functions, maupun objek DB (view/function/trigger/index/FK/CHECK) — DROP
-- aman di sisi kode. Satu-satunya risiko nyata = data: baris yang commodity-
-- nya terisi tapi goods_name-nya kosong (STEP 2 menutup itu SEBELUM kolom
-- dihapus, supaya nama barang lama tak hilang percuma).
--
-- STEP 1 — backup penuh tabel inquiries SEBELUM apa pun disentuh.
-- STEP 2 — backfill: salin commodity → goods_name HANYA untuk baris yang
--   goods_name-nya masih kosong (fill-empty-only, tak menimpa goods_name yang
--   sudah terisi), dikecualikan status WON/CANCELLED (deal sudah selesai,
--   nama barang lama tak lagi relevan dibackfill) dan baris soft-deleted.
--   Hasil nyata saat dijalankan manual: 80 baris ter-update.
-- STEP 3 — drop kolom.
--
-- ⚠️ Tabel backup `backup_b4_inquiries_20260725` adalah JARING PENGAMAN —
--   JANGAN di-drop sendirian. Nasibnya diputuskan BERSAMA tabel-tabel backup
--   lain yang sudah menumpuk (lihat CLAUDE.md / TD-128) — drop semua sekaligus
--   saat sudah aman, lalu satu `pg_dump`; jangan dicicil.
--
-- ⚠️ OPEN ITEM (bukan bagian task ini): goods_name saat ini TIDAK wajib diisi
--   di form Inquiry (InquiryFormPage.jsx `validate()` tak mengeceknya) — per
--   audit, 19 inquiry aktif punya goods_name kosong. Keputusan apakah field
--   ini perlu diwajibkan adalah keputusan bisnis terpisah, belum dikerjakan.
-- ============================================================================

-- STEP 1 — backup penuh tabel inquiries sebelum backfill/drop.
CREATE TABLE IF NOT EXISTS public.backup_b4_inquiries_20260725 AS
SELECT * FROM public.inquiries;

-- STEP 2 — backfill goods_name dari commodity (fill-empty-only). Guard: skip
-- total kalau kolom commodity sudah tak ada (mis. file ini di-replay SETELAH
-- STEP 3 sudah jalan di sesi sebelumnya) — UPDATE dijalankan via EXECUTE
-- (dynamic SQL) supaya penyebutan kolom commodity di dalamnya baru di-parse
-- saat runtime, bukan saat DO block ini dikompilasi, sehingga guard di atas
-- benar-benar mencegah error "column does not exist" pada replay pasca-drop.
DO $b4_backfill$
DECLARE
  n_backfill int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inquiries' AND column_name = 'commodity'
  ) THEN
    RAISE NOTICE 'SKIP backfill: kolom inquiries.commodity sudah tidak ada (drop sudah jalan).';
    RETURN;
  END IF;

  EXECUTE $sql$
    UPDATE public.inquiries
    SET goods_name = NULLIF(TRIM(commodity), '')
    WHERE deleted_at IS NULL
      AND commodity IS NOT NULL AND TRIM(commodity) <> ''
      AND (goods_name IS NULL OR goods_name = '')
      AND COALESCE(status, '') NOT IN ('WON', 'CANCELLED')
  $sql$;
  GET DIAGNOSTICS n_backfill = ROW_COUNT;
  RAISE NOTICE 'Backfill goods_name dari commodity: % baris (hasil asli saat dijalankan manual 25 Jul 2026 = 80 baris).', n_backfill;
END
$b4_backfill$;

-- STEP 3 — drop kolom (idempotent native, aman di-replay).
ALTER TABLE public.inquiries DROP COLUMN IF EXISTS commodity;
