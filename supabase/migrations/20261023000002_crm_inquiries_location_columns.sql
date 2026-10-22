-- =============================================================================
-- Migration: 20261023000002_crm_inquiries_location_columns
-- Inquiry Management Irisan 6 -- Lingkup A (kolom ID lokasi di inquiries)
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging.
-- Dependensi: 20261023000001 (tabel locations harus ada -- target FK).
--
-- Lingkup DIPERSEMPIT secara eksplisit (koreksi #1 PLAN Irisan 6): HANYA
-- pol/pod TUNGGAL yang sudah ada di inquiries hari ini. Model lane jamak
-- (array lanes[] di mockup Intake Form) MENYUSUL di Putaran 4 bersama
-- wizard Intake Form -- TIDAK ada tabel inquiry_lanes di migrasi ini.
--
-- Kolom teks lama inquiries.pol/.pod/.route TIDAK diubah/dihapus -- FE
-- menulis keduanya (teks + ID) bersamaan saat picker dipakai (lihat
-- InquiryFormPage.jsx/DealDetailPage.jsx) supaya seluruh pembaca lama
-- (list, PDF, RouteStrip, dsb) tidak patah. route TIDAK terkait lokasi
-- sama sekali (tetap free-text independen).
--
-- NOL kolom via-port (pod_via_location_id) -- dicabut dari draf per
-- koreksi #2 PLAN Irisan 6; "Via" di lane tetap isian bebas, urusan
-- Putaran 4.
-- =============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN pol_location_id uuid REFERENCES public.locations(id),
  ADD COLUMN pod_location_id uuid REFERENCES public.locations(id);

COMMENT ON COLUMN public.inquiries.pol_location_id IS 'Irisan 6 -- FK ke locations untuk Port of Loading. inquiries.pol (teks) TETAP ada & tetap sumber tampilan lama -- FE menulis dua-duanya bersamaan dari LocationPicker.onChange. NULL = belum dipetakan (baris lama sebelum Irisan 6, atau belum dipilih dari master -- lihat backfill-inquiry-locations.sql).';
COMMENT ON COLUMN public.inquiries.pod_location_id IS 'Irisan 6 -- FK ke locations untuk Port of Discharge/City. Lihat komentar pol_location_id -- pola identik.';

CREATE INDEX inquiries_pol_location_idx ON public.inquiries (pol_location_id);
CREATE INDEX inquiries_pod_location_idx ON public.inquiries (pod_location_id);

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name='inquiries' AND column_name IN ('pol_location_id','pod_location_id');
-- SELECT indexname FROM pg_indexes WHERE tablename='inquiries' AND indexname LIKE 'inquiries_po%_location_idx';
--
-- Rollback (sebelum ada baris memakainya):
--   DROP INDEX public.inquiries_pol_location_idx;
--   DROP INDEX public.inquiries_pod_location_idx;
--   ALTER TABLE public.inquiries DROP COLUMN pol_location_id, DROP COLUMN pod_location_id;
-- =============================================================================
