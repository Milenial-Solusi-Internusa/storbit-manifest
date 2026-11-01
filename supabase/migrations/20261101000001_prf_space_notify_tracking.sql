-- =============================================================================
-- Migration: 20261101000001_prf_space_notify_tracking
-- Phase:     Integrasi 1 (PRF -> Google Space) -- Fase A1, kolom tracking saja
-- Purpose:   Tambah 2 kolom aditif ke public.prf untuk mencatat status kirim
--            notifikasi Card Google Space saat PRF disubmit. Ditulis oleh Edge
--            Function notify-prf-space (Fase A2, berkas terpisah). Trigger DB
--            yang memicu pemanggilannya (Fase A3) BELUM ditulis -- bukan
--            bagian migrasi ini.
-- Depends:   Tidak ada. Murni DDL aditif (ADD COLUMN IF NOT EXISTS, nullable,
--            tanpa default) -- aman dijalankan sendiri, nol dampak ke baris
--            atau pembaca existing.
-- Status:    BELUM DIJALANKAN -- disiapkan untuk dijalankan Mas di SQL Editor.
-- =============================================================================

ALTER TABLE public.prf
  ADD COLUMN IF NOT EXISTS space_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS space_notify_error text;

COMMENT ON COLUMN public.prf.space_notified_at IS
  'Diisi oleh Edge Function notify-prf-space saat kartu notifikasi PRF submit berhasil dikirim ke Google Space. NULL = belum pernah berhasil terkirim (dipakai juga sebagai penjaga idempoten -- function menolak kirim ulang kalau kolom ini sudah terisi).';

COMMENT ON COLUMN public.prf.space_notify_error IS
  'Diisi oleh Edge Function notify-prf-space saat pengiriman ke Google Space gagal (teks singkat generik, TIDAK PERNAH memuat nilai secret/webhook URL). Dikosongkan lagi (NULL) begitu pengiriman berikutnya berhasil.';

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'prf'
--      AND column_name IN ('space_notified_at', 'space_notify_error')
--    ORDER BY column_name;
--   -- Diharapkan 2 baris:
--   --   space_notified_at | timestamp with time zone | YES | (null)
--   --   space_notify_error | text                     | YES | (null)

-- ─── ROLLBACK ─────────────────────────────────────────────────────────────────
-- ALTER TABLE public.prf
--   DROP COLUMN IF EXISTS space_notified_at,
--   DROP COLUMN IF EXISTS space_notify_error;
-- =============================================================================
