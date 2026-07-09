-- TD-52: last_activity_at tidak jujur di 817 dari 997 akun
--
-- Masalah: kolom accounts.last_activity_at ikut ter-backfill saat restrukturisasi
-- 25 Jun 2026, tapi tidak pernah punya trigger yang mengisinya dari aktivitas
-- nyata. Akibatnya 817 akun punya tanggal "aktivitas terakhir" padahal nol baris
-- di tabel `activities`.
--
-- Dampak: Edge Function aging-pipeline menghitung umur lead dari
-- MAX(stage_changed_at, last_activity_at). Tanggal palsu akan menyelamatkan lead
-- yang tak pernah disentuh.
--
-- Perbaikan: NULL-kan kolom untuk akun tanpa aktivitas. NULL jujur; tanggal palsu
-- menipu. Trigger pengisi otomatis dipasang di migrasi berikutnya.
--
-- Dijalankan manual 10 Jul 2026. Hasil: UPDATE 817.
-- Sebelum: 997 terisi, 0 NULL. Sesudah: 180 terisi, 817 NULL.

UPDATE accounts ac
SET last_activity_at = NULL
WHERE ac.deleted_at IS NULL
  AND ac.last_activity_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM activities a
    WHERE a.account_id = ac.id AND a.deleted_at IS NULL
  );

-- Verifikasi:
-- SELECT count(*) FILTER (WHERE last_activity_at IS NULL)      AS null_sekarang,
--        count(*) FILTER (WHERE last_activity_at IS NOT NULL)  AS masih_terisi
-- FROM accounts WHERE deleted_at IS NULL;
-- Harapan: 817 dan 180.
