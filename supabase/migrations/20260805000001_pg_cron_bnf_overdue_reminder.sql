-- =============================================================================
-- Migration: 20260805000001_pg_cron_bnf_overdue_reminder
-- Phase:     BNF module expansion — Fase E (reminder overdue otomatis harian)
-- Purpose:   Jadwalkan Edge Function bnf-overdue-reminder via pg_cron, meniru
--            persis pola 20260710000009_pg_cron_aging_pipeline.sql.
-- Depends:   Edge Function bnf-overdue-reminder harus SUDAH di-deploy dulu
--            (supabase functions deploy bnf-overdue-reminder) sebelum
--            migrasi ini dijalankan, kalau tidak net.http_post akan gagal
--            connect ke URL yang belum ada.
-- Status:    DRAFT — do NOT execute without explicit approval
--
-- CATATAN SECRET VAULT: query di bawah reuse secret 'aging_pipeline_key' yang
-- sudah ada (dibuat manual lewat Dashboard utk aging-pipeline) — isinya cuma
-- service role key, tidak spesifik-teknis ke aging-pipeline, jadi aman dipakai
-- ulang di sini. Penamaan agak menyesatkan (historis), BUKAN salah copy-paste.
-- Kalau Anda lebih suka secret baru dgn nama generik (mis. 'service_role_key'),
-- buat dulu manual lewat Dashboard (Project Settings > Vault) SEBELUM
-- menjalankan migrasi ini, lalu ganti nama secret di WHERE clause di bawah.
-- =============================================================================

-- ROLLBACK:
-- SELECT cron.unschedule('bnf-overdue-reminder-harian');
-- (GRANT SELECT dan CREATE EXTENSION IF NOT EXISTS sengaja tidak di-rollback
-- di sini — keduanya aman/idempotent untuk tetap ada meski cron job dimatikan)
-- =============================================================================

-- Sudah aktif dari migrasi aging-pipeline (20260710000009) — IF NOT EXISTS
-- di sini murni defensif/replay-safety, bukan asumsi belum pernah dibuat.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- service_role TIDAK otomatis punya SELECT di semua tabel (TD-62/TD-63) —
-- bnf_reports/bnf_departments/profiles kemungkinan besar belum pernah
-- di-grant karena belum ada yang butuh service-role access ke sini
-- sebelumnya. Preseden: 20260710000008_aging_per_entitas.sql baris GRANT
-- untuk companies. Idempotent, aman diulang kalau ternyata sudah ada.
GRANT SELECT ON public.bnf_reports TO service_role;
GRANT SELECT ON public.bnf_departments TO service_role;
GRANT SELECT ON public.profiles TO service_role;

SELECT cron.schedule(
  'bnf-overdue-reminder-harian',
  '0 0 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://untmpqceexwxzuhlmyrg.supabase.co/functions/v1/bnf-overdue-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'aging_pipeline_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Verifikasi:
-- SELECT jobid, jobname, schedule, active FROM cron.job
-- WHERE jobname = 'bnf-overdue-reminder-harian';
--
-- Cek hasil eksekusi (setelah cron jalan, atau test manual net.http_post):
-- SELECT id, status_code, content::jsonb FROM net._http_response
-- ORDER BY id DESC LIMIT 5;
--
-- Test manual sebelum menunggu jadwal (dry run, tidak kirim email):
-- curl -X POST 'https://untmpqceexwxzuhlmyrg.supabase.co/functions/v1/bnf-overdue-reminder?dry_run=true' \
--   -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
--
-- Matikan sementara:
-- SELECT cron.unschedule('bnf-overdue-reminder-harian');
