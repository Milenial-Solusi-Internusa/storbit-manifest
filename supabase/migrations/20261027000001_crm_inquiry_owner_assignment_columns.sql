-- =============================================================================
-- Migration: 20261027000001_crm_inquiry_owner_assignment_columns
-- Inquiry Management Putaran 8 -- Owner Assignment, L-13
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
-- MEMUAT DROP: TIDAK. Migrasi ini boleh dijalankan lewat connector/Claude
-- Code seperti biasa (ADD COLUMN murni, idempoten).
-- URUTAN: migrasi PERTAMA dari blok Putaran 8 (001 -> 002 -> 003 -> 004).
-- WAJIB jalan SEBELUM 20261027000003 (RPC yang menulis kolom ini) dan
-- SEBELUM 20261027000004 (trigger yang menjaga kolom ini) -- kalau tidak,
-- CREATE FUNCTION/CREATE TRIGGER di kedua berkas itu akan gagal dgn error
-- "column does not exist".
--
-- RINGKASAN
-- Menambah 3 kolom "penugasan terakhir" di inquiries -- menjawab L-13
-- (tab "Assigned to Me" halaman Inquiry Owner Assignment, 1.2.3, Sales-only)
-- yang mockup-nya (baris 230-236) menuntut kolom Assigned By/Assigned
-- On/Reason, tapi satu-satunya sumber data saat ini (audit_logs, action
-- REASSIGN_INQUIRY_OWNER) RLS-nya `read = is_admin_or_above()` -- Sales
-- (satu-satunya penonton tab itu) tidak akan pernah bisa membacanya sendiri
-- lewat jalur itu. Menaruh datanya di inquiries sendiri menyelesaikannya:
-- RLS `inquiries_read` SUDAH membolehkan Sales membaca baris miliknya.
--
-- BACKFILL: SENGAJA TIDAK ADA (keputusan Mas, 26 Okt 2026) -- ~950 inquiry
-- lama yang sudah ber-owner TIDAK diisi assigned_by/assigned_at/
-- assign_reason secara retroaktif. Ketiganya tetap NULL untuk baris lama,
-- tampil "Not set" di UI -- sama seperti fallback `assignReason || 'Not
-- set'` mockup sendiri (baris 979). Hanya reassignment BARU sesudah
-- migrasi 20261027000003 live yang mengisi ketiganya.
--
-- Kolom ini dijaga trg_z_guard_inquiries_protected_columns (diperluas
-- 20261027000004) -- hanya boleh berubah lewat reassign_inquiry_owner v2
-- (20261027000003), bukan PATCH langsung.
-- =============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assign_reason text;

COMMENT ON COLUMN public.inquiries.assigned_by IS
  'Profil yang melakukan penugasan/reassignment owner terakhir. Diisi HANYA oleh reassign_inquiry_owner RPC (20261027000003). NULL utk inquiry lama yang belum di-reassign sejak migrasi ini (keputusan Mas 26 Okt 2026: tidak dibackfill) -- tampil "Not set" di UI.';

COMMENT ON COLUMN public.inquiries.assigned_at IS
  'Timestamp penugasan/reassignment owner terakhir. Diisi HANYA oleh reassign_inquiry_owner RPC. NULL utk baris lama (tidak dibackfill) -- tampil "Not set" di UI. Dipakai juga utk badge "New" (<=3 hari, Putaran 8) di tab Assigned to Me.';

COMMENT ON COLUMN public.inquiries.assign_reason IS
  'Alasan penugasan/reassignment terakhir (opsional, free text). NULL = "Not set" di UI, sama seperti fallback mockup sendiri. UI penangkap alasan belum ada sampai modal Reassign Putaran 11 -- RPC reassign_inquiry_owner sudah menerima parameter p_reason sejak 20261027000003, dua pemanggil existing (InquiryOwnerAssignmentPage.jsx/DealDetailPage.jsx) belum mengirimnya.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Ketiga kolom ada dgn tipe yang benar:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='inquiries'
--    AND column_name IN ('assigned_by','assigned_at','assign_reason');
--
-- 2) Nol baris terisi (backfill sengaja tidak dijalankan):
-- SELECT count(*) FILTER (WHERE assigned_by IS NOT NULL) AS n_assigned_by,
--        count(*) FILTER (WHERE assigned_at IS NOT NULL) AS n_assigned_at,
--        count(*) FILTER (WHERE assign_reason IS NOT NULL) AS n_assign_reason
--   FROM public.inquiries; -- HARAP: ketiganya 0 sampai ada reassignment baru.
-- =============================================================================

-- =============================================================================
-- ROLLBACK:
--   BEGIN;
--   ALTER TABLE public.inquiries
--     DROP COLUMN IF EXISTS assigned_by,
--     DROP COLUMN IF EXISTS assigned_at,
--     DROP COLUMN IF EXISTS assign_reason;
--   COMMIT;
-- =============================================================================
