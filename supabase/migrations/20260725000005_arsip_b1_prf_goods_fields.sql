-- ============================================================================
-- Arsip B1 — 3 kolom baru di prf: goods_name, un_number, imo_class.
-- SUDAH DIJALANKAN MANUAL 2026-07-23 (bersamaan commit 1235f4a). File migrasi
-- ini dibuat menyusul 2026-07-25 — SQL-nya sendiri sudah lama live di produksi.
-- Idempotent (ADD COLUMN IF NOT EXISTS) — aman di-replay saat rebuild.
--
-- KONTEKS: commit 1235f4a "feat(prf): batch 1 field PRF — nama barang + DG
-- detail + enum kargo + kewajiban" menambah 6 perubahan di PRFFormPage.jsx
-- (Nama Barang prefill dari inquiries.goods_name, UN Number + IMO Class saat
-- commodity=dg, +4 opsi enum commodity, Cargo Ready jadi opsional, Incoterm
-- jadi wajib saat Submit, Volume Air jadi opsional) — SQL di bawah adalah
-- prasyarat DB-nya (tanpa ini Submit/Draft PRF gagal). Ketiga kolom NULLABLE,
-- tanpa default, tanpa CHECK constraint.
-- ============================================================================

ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS goods_name text;
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS un_number  text;
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS imo_class  text;
