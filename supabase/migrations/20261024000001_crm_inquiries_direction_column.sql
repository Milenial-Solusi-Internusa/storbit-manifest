-- =============================================================================
-- Migration: 20261024000001_crm_inquiries_direction_column
-- Inquiry Management Putaran 3 -- Tahap 3A, Lingkup B (Inquiry Classification)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual (connector) di staging.
-- Dependensi: tidak ada. Boleh jalan sendirian.
--
-- RINGKASAN
-- Kolom baru `inquiries.direction` -- dimensi klasifikasi "Import/Export/
-- Domestic" dari mockup Inquiry Management.dc.html (Matrix baris 815-816:
-- `mrows = ['Import', 'Export', 'Domestic', 'Not set'].map(...)`; Table
-- dropdown inline baris 199: options "Not set / Import / Export / Domestic").
-- NULL = "Not set" (bukan string literal) -- pola PERSIS pol_location_id/
-- pod_location_id (Irisan 6): NULL bermakna "belum diklasifikasi", bukan
-- nilai sentinel yang harus ditulis eksplisit.
--
-- Nol dampak ke baris yang sudah ada -- ADD COLUMN tanpa DEFAULT/NOT NULL,
-- seluruh inquiry lama otomatis NULL ("Not set"), konsisten dgn perilaku
-- Matrix mockup yang justru punya baris "Not set" sendiri untuk kasus ini.
-- =============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN direction text CHECK (direction IN ('Import', 'Export', 'Domestic'));

CREATE INDEX idx_inquiries_direction ON public.inquiries (direction);

COMMENT ON COLUMN public.inquiries.direction IS
  'Klasifikasi arah inquiry (Inquiry Classification, Putaran 3) -- Import/Export/Domestic. NULL = "Not set" (mockup Matrix baris "Not set"), BUKAN nilai sentinel -- konsisten pola pol_location_id/pod_location_id (Irisan 6). Diubah lewat UPDATE biasa (RLS inquiries_update) dari InquiryClassificationPage.jsx -- nol RPC, nol trigger. Hanya bisa diisi untuk inquiry berstatus OPEN/IN_REVIEW/QUOTED/NEGOTIATION (gate FE, bukan DB -- lihat catatan di InquiryClassificationPage.jsx).';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name='inquiries' AND column_name='direction';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.inquiries'::regclass AND conname LIKE '%direction%';
-- SELECT indexname FROM pg_indexes WHERE tablename='inquiries' AND indexname='idx_inquiries_direction';
--
-- Rollback (sebelum ada baris memakainya):
--   DROP INDEX public.idx_inquiries_direction;
--   ALTER TABLE public.inquiries DROP COLUMN direction;
-- =============================================================================
