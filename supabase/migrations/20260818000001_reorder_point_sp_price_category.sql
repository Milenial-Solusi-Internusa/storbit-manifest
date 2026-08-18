-- =============================================================================
-- Migration: 20260818000001_reorder_point_sp_price_category
-- Phase:     Fondasi data dashboard Storbit baru (Shipping Manifest + Warehouse)
--            — dua kolom nullable, aditif murni, nol perubahan data existing.
-- Depends:   FASE 0 (sp_orders/sp_order_items live) + TD-175 fix 8 Agu 2026
--            (table-level GRANT UPDATE pada sp_orders sudah DICABUT, diganti
--            24 GRANT UPDATE per-kolom) — konsekuensinya lihat section 4.
-- Status:    LIVE — dijalankan 18 Agu 2026, terverifikasi lewat
--            schema_snapshot.sql (kedua kolom + GRANT-nya ada di snapshot).
--            Snapshot sudah di-refresh; nol utang pg_dump untuk migrasi ini.
--            Urutan aslinya section 1 -> 4 berurutan di SQL Editor.
--
-- CATATAN DESAIN:
--   - products.reorder_point: STRUKTUR SAJA, sengaja TIDAK diisi migrasi ini.
--     Angkanya ditentukan Finance/Warehouse Controller lewat SOP Storbit,
--     belum ada saat migrasi ini ditulis. numeric (bukan integer) — konsisten
--     dgn usulan DESIGN_STOCK_OPNAME_SCHEMA.md §2. TERPISAH dari
--     products.min_order_qty (text bebas, mis. "10 pcs" — tak bisa dibanding
--     numerik, dipertahankan apa adanya, TIDAK disentuh migrasi ini).
--   - sp_orders.price_category: nama SENGAJA sama persis dgn
--     sp_order_items.price_category supaya relasinya jelas (header = tipe SP
--     keseluruhan, item = kategori harga per baris; boleh berbeda).
--     ⚠️ JANGAN tertukar dgn sp_orders.sp_category yang SUDAH ADA — itu
--     kategori PRODUK (reguler/loyang/trolly), makna beda sama sekali.
--   - CHECK ditulis persis sebentuk sp_order_items_price_category_check
--     (= ANY (ARRAY[...])). NULL LOLOS constraint ini (NULL = ANY(...)
--     menghasilkan NULL, bukan false) — itu memang yang diinginkan:
--     NULL = "Other"/belum ditentukan di dashboard.
--   - Kolom ini nullable & tanpa DEFAULT: 435 SP existing tetap NULL,
--     TIDAK di-backfill (tipe SP historis tak diketahui sistem; menebaknya
--     lebih buruk daripada mengakui tak tahu).
-- =============================================================================

-- 1. products.reorder_point — struktur saja, nullable, tanpa DEFAULT.
ALTER TABLE public.products ADD COLUMN reorder_point numeric;

COMMENT ON COLUMN public.products.reorder_point IS
  'Reorder point / ROP per produk (unit). Nullable = belum ditentukan. Diisi manual sesuai SOP Storbit (Finance/Warehouse Controller), bukan dihitung sistem. Terpisah dari min_order_qty (text bebas).';

-- 2. sp_orders.price_category — tipe SP di level header.
ALTER TABLE public.sp_orders ADD COLUMN price_category text;

ALTER TABLE public.sp_orders ADD CONSTRAINT sp_orders_price_category_check
  CHECK ((price_category = ANY (ARRAY['semester'::text, 'tahunan'::text, 'project'::text])));

-- ⚠️ Teks COMMENT di bawah DIPERBAIKI 18 Agu 2026 — versi pertama menjanjikan
--    NULL 'tampil "Other" di dashboard', padahal nol UI yang pernah merender
--    label itu (SP_TYPE_OPTIONS di StorbitDashboardPage.jsx cuma punya
--    "Semua tipe"/semester/tahunan/project). Klaim soal tampilan dibuang;
--    comment sekarang hanya menyatakan arti kolomnya.
--    Kalau migrasi ini SUDAH dijalankan dgn teks lama, jalankan ulang statement
--    COMMENT ini saja — idempoten & non-destruktif, cuma menimpa teks comment.
COMMENT ON COLUMN public.sp_orders.price_category IS
  'Tipe SP level header: semester/tahunan/project. NULL = belum/tidak dikategorikan. Sengaja senama dgn sp_order_items.price_category (kategori harga per item) — berhubungan tapi tidak wajib sama. BUKAN sp_orders.sp_category, yang artinya kategori produk (reguler/loyang/trolly).';

-- 3. products TIDAK perlu GRANT tambahan — sudah GRANT ALL ke authenticated
--    (schema_snapshot.sql:17754), privilege table-level otomatis mencakup
--    kolom baru. Dicek eksplisit, bukan diasumsikan.

-- 4. sp_orders WAJIB GRANT per-kolom. Sejak fix TD-175 (8 Agu 2026) tabel ini
--    TIDAK punya table-level GRANT UPDATE ke authenticated (hanya 24 GRANT
--    UPDATE(kolom) individual, status sengaja dikecualikan). Tanpa baris di
--    bawah, kolom baru ini MUSTAHIL ditulis lewat PostgREST dan wiring UI
--    TASK 2 akan gagal senyap/403 — persis pola TD-166 (GRANT kelewat).
--    INSERT tidak perlu apa-apa: table-level GRANT INSERT masih utuh dan
--    otomatis mencakup kolom baru.
GRANT UPDATE(price_category) ON TABLE public.sp_orders TO authenticated;

-- ─── VERIFIKASI (jalankan TERPISAH setelah 1-4) ──────────────────────────────
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='products' AND column_name='reorder_point';
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='sp_orders' AND column_name='price_category';
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname='sp_orders_price_category_check';
--   SELECT privilege_type, column_name FROM information_schema.column_privileges
--    WHERE table_name='sp_orders' AND column_name='price_category' AND grantee='authenticated';
--   -- harus ada baris UPDATE; kalau kosong, wiring UI TASK 2 pasti gagal.
--   SELECT COUNT(*) AS total, COUNT(price_category) AS terisi FROM public.sp_orders WHERE deleted_at IS NULL;
--   -- terisi = 0 tepat setelah migrasi (memang tidak di-backfill)
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.sp_orders DROP CONSTRAINT IF EXISTS sp_orders_price_category_check;
-- ALTER TABLE public.sp_orders DROP COLUMN IF EXISTS price_category;  -- GRANT ikut hilang
-- ALTER TABLE public.products  DROP COLUMN IF EXISTS reorder_point;
-- (deploy FE yang berhenti baca kolom DULU sebelum drop — aturan CLAUDE.md)
