-- Jadwalkan Edge Function aging-pipeline harian via pg_cron
--
-- Sebelumnya EF ada sejak 25 Jun 2026 tapi TIDAK PERNAH dijadwalkan — pg_cron
-- belum terpasang. Akibatnya nol lead pernah masuk Lead Pool lewat mekanisme
-- aging (479 baris di pool seluruhnya hasil migrasi 13 Jun).
--
-- Jadwal: 18:00 UTC = 01:00 WIB, harian.
-- Service role key disimpan di Vault (nama: aging_pipeline_key), BUKAN hardcode
-- di cron.job — tabel itu bisa dibaca siapa pun yang punya akses schema cron.
--
-- Prasyarat yang sudah dipenuhi:
--   - pg_cron 1.6.4 + pg_net aktif
--   - EF di-deploy dengan verify_jwt=true (TD-60)
--   - companies.aging_enabled=true hanya untuk MSI
--   - GRANT SELECT ON companies TO service_role
--
-- Diverifikasi 10 Jul: net.http_post manual dengan ?dry_run=true → 200,
-- memenuhi_syarat 304.
--
-- Dijalankan manual 10 Jul 2026.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'aging-pipeline-harian',
  '0 18 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://untmpqceexwxzuhlmyrg.supabase.co/functions/v1/aging-pipeline',
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
-- WHERE jobname = 'aging-pipeline-harian';
--
-- Cek hasil eksekusi:
-- SELECT id, status_code, content::jsonb FROM net._http_response
-- ORDER BY id DESC LIMIT 5;
--
-- Matikan sementara:
-- SELECT cron.unschedule('aging-pipeline-harian');
