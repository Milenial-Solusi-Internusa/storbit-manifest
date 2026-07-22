-- STATUS: SUDAH DIJALANKAN 22 Jul 2026, terverifikasi.
-- Bukti: information_schema.columns -> external_ref & booking_no ada, data_type
-- text, is_nullable YES, column_default NULL. schema_snapshot.sql sudah di-refresh.
--
-- Dua kolom referensi eksternal pada sales_orders. Keduanya NULLABLE, tanpa
-- DEFAULT, dan SENGAJA belum dipakai UI mana pun.
--
-- Alasan menambah kolom yang belum dipakai: rantai dokumen berhenti di SO —
-- operasional masih di Odoo dan sambungannya memang sengaja putus. Menambah
-- kolom kosong sekarang gratis; mencari padanan ratusan SO dengan Odoo tahun
-- depan itu kerjaan berminggu-minggu. Refund/deposit juga menempel ke shipment
-- fisik, bukan ke deal — tanpa kunci sambungan, deposit tidak bisa ditelusuri
-- balik ke penawaran yang menjanjikannya.
--
-- Aman terhadap yang sudah ada (diverifikasi sebelum ditulis):
--   * 4 policy RLS sales_orders (schema_snapshot.sql:12150/12157/12164/12171)
--     tidak menyebut daftar kolom — hanya company_id, created_by, deleted_at.
--   * Satu-satunya trigger = set_sales_orders_updated_at (:7344) -> set_updated_at(),
--     generik, hanya menyetel NEW.updated_at.
--   * Nol fungsi/RPC di DB menyentuh tabel ini.
--   * Di src/: satu-satunya INSERT (SalesOrderDocFormPage.jsx:83) memakai object
--     literal eksplisit; semua SELECT memakai daftar kolom eksplisit. Nol select('*').

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS booking_no   text;

COMMENT ON COLUMN public.sales_orders.external_ref IS
  'Nomor referensi SO ini di sistem operasional (Odoo). Nullable, belum dipakai UI mana pun — kunci sambungan disiapkan lebih dulu supaya rekonsiliasi tidak perlu mencari padanan manual nanti.';

COMMENT ON COLUMN public.sales_orders.booking_no IS
  'Nomor booking ke carrier. Nullable, belum dipakai UI mana pun.';

-- ─── VERIFIKASI (jalankan TERPISAH setelah migrasi di atas) ───────────────────
-- Harus mengembalikan TEPAT 2 baris, keduanya data_type=text, is_nullable=YES,
-- column_default NULL. Kalau kurang dari 2 baris: migrasi tidak jalan.
--
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'sales_orders'
--   AND column_name IN ('external_ref', 'booking_no')
-- ORDER BY column_name;
