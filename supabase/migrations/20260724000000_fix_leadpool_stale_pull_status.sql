-- ============================================================================
-- Fix: bebaskan 27 akun korban "stale pull_status" trap di Lead Pool
-- Tanggal: 2026-07-24
-- ============================================================================
-- KONTEKS:
-- Akun yang pernah di-approve (pull_status='approved') lalu ter-aging ULANG oleh
-- Edge Function aging-pipeline membawa cap 'approved' basi dari siklus sebelumnya.
-- Cap basi mengunci akun: tombol "Tarik ke Pipeline" tak dirender (LeadPoolPage:
-- canPull = !pull_status || pull_status==='rejected') dan Approval page tak
-- melihatnya (filter pull_status='pending'). Akun buntu total di UI.
--
-- AKAR sudah diperbaiki di Edge Function aging-pipeline (deploy 2026-07-24): saat
-- mem-pool, EF kini me-reset kelima kolom pull_* ke null sehingga trap tak terisi
-- ulang. Migrasi ini membersihkan 27 korban LAMA yang terlanjur nyangkut sebelum
-- fix EF ter-deploy. Hanya reset flag parkir + kolom pull_*; pipeline_stage dan
-- account_status SENGAJA tidak disentuh (bukan bagian dari bug).
--
-- CATATAN: SQL ini SUDAH dijalankan manual 2026-07-24; file ini rekaman jejak.
-- Idempotent — replay aman (0 baris kena karena tak ada lagi approved+di pool).
-- BACKUP 27 baris ada di public.backup_leadpool_trap_20260724.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.backup_leadpool_trap_20260724 AS
SELECT * FROM public.accounts
WHERE is_in_lead_pool = true
  AND pull_status = 'approved'
  AND deleted_at IS NULL;

UPDATE public.accounts
SET
  is_in_lead_pool    = false,
  pull_status        = null,
  pull_requested_at  = null,
  pull_justification = null,
  pull_approved_at   = null,
  pull_approved_by   = null,
  lead_pool_at       = null,
  lead_pool_reason   = null,
  updated_at         = now()
WHERE is_in_lead_pool = true
  AND pull_status = 'approved'
  AND deleted_at IS NULL;
