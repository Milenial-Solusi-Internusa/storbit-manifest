-- =============================================================================
-- Migration: 20260909000001_quotation_approval_columns
-- Phase:     Quotation versioning & approval (1/5) — kolom jejak audit.
-- Depends:   public.quotations, public.profiles
-- Status:    LIVE — staging 9 Sep 2026, produksi 9 Sep 2026.
--
-- ADITIF MURNI. Nol perubahan perilaku. Aman dijalankan kapan pun, termasuk
-- saat `main` masih melayani produksi: menambah kolom tidak mengganggu
-- .select() eksplisit mana pun (tak ada SELECT * di jalur quotations).
--
-- accepted_by -> profiles(id), MENGIKUTI created_by/updated_by yang sudah
-- ber-FK ke profiles (schema_snapshot.sql:15077, :15125). BUKAN auth.users.
--
-- GRANT: TIDAK diperlukan. `GRANT ALL ON TABLE public.quotations TO
-- authenticated` (:20864) sudah table-level, kolom baru ikut terwarisi.
-- Aturan "GRANT setelah CREATE" di CLAUDE.md berlaku untuk TABEL baru.
--
-- KENAPA accepted_by BUKAN "customer yang menyetujui"
--   Customer tidak punya akun Nexus. Yang tercatat di sini adalah SIAPA DI
--   INTERNAL yang MENCATAT jawaban customer — itulah jejak audit yang bisa
--   ditelusuri kalau kelak angka yang disetujui dipersoalkan.
-- =============================================================================

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS accepted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by      uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_accepted_by_fkey;
ALTER TABLE public.quotations
  ADD  CONSTRAINT quotations_accepted_by_fkey
       FOREIGN KEY (accepted_by) REFERENCES public.profiles(id);

-- Index yang SEHARUSNYA sudah ada sejak dulu: quotations.inquiry_id punya FK
-- (:15093) tapi TIDAK punya index. DealDetailPage memfilter .eq('inquiry_id')
-- setiap kali Detail Deal dibuka, dan alur revisi menambah pembaca lagi.
-- Partial: baris ber-inquiry_id NULL tak perlu diindeks.
CREATE INDEX IF NOT EXISTS idx_quotations_inquiry_id
  ON public.quotations USING btree (inquiry_id)
  WHERE inquiry_id IS NOT NULL;

COMMENT ON COLUMN public.quotations.accepted_at IS
  'Kapan customer menyetujui quotation ini. HANYA ditulis set_quotation_outcome().';
COMMENT ON COLUMN public.quotations.accepted_by IS
  'Siapa (user Nexus) yang MENCATAT persetujuan customer — bukan customer-nya. HANYA ditulis set_quotation_outcome().';
COMMENT ON COLUMN public.quotations.rejection_reason IS
  'Alasan customer menolak. WAJIB terisi saat status REJECTED. HANYA ditulis set_quotation_outcome().';

-- ─── VERIFIKASI ──────────────────────────────────────────────────────────────
--   -- a. Ketiga kolom + FK ada:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='quotations'
--     AND column_name IN ('accepted_at','accepted_by','rejection_reason');
--   -- HARUS 3 baris.
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid='public.quotations'::regclass AND conname='quotations_accepted_by_fkey';
--   -- HARUS 1 baris.
--
--   -- b. Index terpasang DAN terpakai:
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND indexname='idx_quotations_inquiry_id';
--   EXPLAIN SELECT id FROM public.quotations WHERE inquiry_id = '<UUID>'::uuid;
--   -- HARUS memuat Index Scan / Bitmap Index Scan pada idx_quotations_inquiry_id.
--
--   -- c. Nol regresi di `main` produksi: buka Detail Deal + Daftar Quotation.
--   --    Tak ada perubahan perilaku apa pun yang boleh terlihat.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS public.idx_quotations_inquiry_id;
--   ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_accepted_by_fkey;
--   ALTER TABLE public.quotations
--     DROP COLUMN IF EXISTS accepted_at,
--     DROP COLUMN IF EXISTS accepted_by,
--     DROP COLUMN IF EXISTS rejection_reason;
