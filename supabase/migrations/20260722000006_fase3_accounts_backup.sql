-- STATUS: SUDAH DIJALANKAN 22 Jul 2026. REKAMAN — JANGAN dijalankan ulang.
-- Bukti: public.accounts_fase3_backup_20260722 berisi 1100 baris — seluruh kolom,
-- seluruh baris, TERMASUK yang deleted_at NOT NULL (baris yang sudah soft-delete
-- ikut disalin; snapshot mentah, bukan pilihan baris).
--
-- FASE 3 langkah F3-1 (backup). Prasyarat langkah-langkah berikutnya:
-- 20260722000007 (tiga kolom deal di inquiries), 20260722000008 (fungsi + trigger
-- set_customer_on_inquiry_won). Konvensi penomoran F3-N milik Den: F3-0a/0b/0c
-- persiapan, F3-1 backup, F3-2 kolom, F3-3 trigger baru, F3-4 uji H4.
--
-- Kenapa accounts yang di-backup, bukan inquiries: Fase 3 memindahkan sumbu deal
-- KELUAR dari accounts.pipeline_stage. Yang berisiko hilang/bergeser adalah baris
-- accounts, jadi itu yang disalin utuh sebelum ada satu pun perubahan dijalankan.
--
-- CATATAN: tabel ini ikut terbawa ke schema_snapshot.sql pada refresh berikutnya
-- (pola sama inquiries_status_backup_20260722 dan accounts_dedup_backup_20260722).
-- Setelah beberapa hari aman dan Fase 3 tuntas, ketiganya kandidat DROP — dan
-- snapshot perlu di-refresh sekali lagi sesudah di-drop.

CREATE TABLE public.accounts_fase3_backup_20260722 AS
SELECT * FROM public.accounts;

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
--   SELECT count(*) FROM public.accounts_fase3_backup_20260722;   -- harus 1100
--   SELECT count(*) FROM public.accounts_fase3_backup_20260722
--     WHERE deleted_at IS NOT NULL;                               -- >0 = soft-delete ikut
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Membuang backup-nya saja (BUKAN mengembalikan data):
--   DROP TABLE IF EXISTS public.accounts_fase3_backup_20260722;
