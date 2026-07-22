-- STATUS: SUDAH DIJALANKAN 22 Jul 2026. REKAMAN — JANGAN dijalankan ulang.
--
-- FASE 3 langkah F3-EX2 — LAHIR DI LUAR RENCANA (pasangan F3-EX1). Bukan bagian
-- dari urutan asli F3-0a/0b/0c → F3-1 → F3-2 → F3-3 → F3-4.
--
-- ⚠️ FILE INI MENGUBAH DATA PRODUKSI — satu-satunya di Fase 3 yang menghapus dan
-- menulis ulang baris nyata. Direkam justru karena itu: pembersihan data uji harus
-- berjejak, bukan hilang sebagai "ah, cuma data uji".
--
-- Prasyarat: 20260722000009 (revisi pemicu WON) SUDAH jalan lebih dulu. Backup
-- sales_orders sengaja diambil SESUDAH revisi trigger, bukan sebelum.
--
-- ── URUTAN DI FILE INI ──────────────────────────────────────────────────────
--   1. backup sales_orders
--   2. hapus 4 SO uji
--   3. kembalikan 3 inquiry ke OPEN
--   4. soft-delete 1 inquiry milik akun uji
--   5. kembalikan penomoran customer MSI
-- Karena backup diambil sebelum langkah 2, keempat baris SO uji MASIH ADA di dalam
-- tabel backup — itu jalan pulangnya kalau ternyata ada yang dibutuhkan. Verifikasi
-- klaim ini dengan query di bagian VERIFIKASI, jangan diandalkan buta.
--
-- ── KENAPA TIAP BARIS DIJALANKAN ────────────────────────────────────────────
-- (1) Empat SO (SO/MSI/2026/001..004) adalah DATA UJI PRA-RILIS. Dihapus atas
--     keputusan Den. Ini hard delete, bukan soft delete — barisnya memang tidak
--     pernah mewakili transaksi nyata.
-- (2) Tiga inquiry (183/184/185) dikembalikan ke OPEN karena status WON-nya lahir
--     dari ATURAN LAMA (WON begitu SO dibuat). Di bawah aturan baru (WON hanya
--     bila SO berstatus SENT) ketiganya tidak pernah menang. Membiarkannya WON =
--     tiga kemenangan palsu yang ikut menghitung win rate.
-- (3) INQ/MSI/2026/210 milik akun uji "ZZ UJI WON" yang akunnya sudah
--     di-soft-delete; inquiry-nya menyusul supaya tidak menggantung sebagai anak
--     yatim yang masih terbaca query.
-- (4) code_counters MSI-CUST 2026 dikembalikan ke 50 karena akun uji sempat
--     memakan nomor MSI/CUST/2026/LI. Tanpa ini, nomor itu hangus permanen.

CREATE TABLE public.sales_orders_backup_20260722 AS
SELECT * FROM public.sales_orders;

DELETE FROM public.sales_orders
WHERE so_no IN ('SO/MSI/2026/001','SO/MSI/2026/002','SO/MSI/2026/003','SO/MSI/2026/004');

UPDATE public.inquiries
SET status = 'OPEN', updated_at = now()
WHERE inquiry_no IN ('INQ/MSI/2026/183','INQ/MSI/2026/184','INQ/MSI/2026/185');

UPDATE public.inquiries
SET deleted_at = now()
WHERE inquiry_no = 'INQ/MSI/2026/210';

UPDATE public.code_counters
SET last_number = 50
WHERE entity = 'MSI-CUST' AND year = 2026;

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
-- Keempat SO uji harus ADA di backup (jalan pulang) dan HILANG dari tabel hidup:
--   SELECT count(*) FROM public.sales_orders_backup_20260722
--    WHERE so_no IN ('SO/MSI/2026/001','SO/MSI/2026/002','SO/MSI/2026/003','SO/MSI/2026/004');  -- 4
--   SELECT count(*) FROM public.sales_orders
--    WHERE so_no IN ('SO/MSI/2026/001','SO/MSI/2026/002','SO/MSI/2026/003','SO/MSI/2026/004');  -- 0
--
--   SELECT inquiry_no, status, deleted_at FROM public.inquiries
--    WHERE inquiry_no IN ('INQ/MSI/2026/183','INQ/MSI/2026/184','INQ/MSI/2026/185','INQ/MSI/2026/210')
--    ORDER BY inquiry_no;   -- 183/184/185 = OPEN & deleted_at NULL; 210 = deleted_at terisi
--
--   SELECT entity, year, last_number FROM public.code_counters
--    WHERE entity='MSI-CUST' AND year=2026;   -- 50
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Mengembalikan keempat SO dari backup (kolom mengikuti tabel apa adanya):
--   INSERT INTO public.sales_orders
--   SELECT * FROM public.sales_orders_backup_20260722
--   WHERE so_no IN ('SO/MSI/2026/001','SO/MSI/2026/002','SO/MSI/2026/003','SO/MSI/2026/004');
-- ⚠️ Memasukkannya kembali akan MENYALAKAN trg_inquiry_won bila status barisnya
-- 'SENT' → inquiry rujukannya ikut jadi WON lagi. Nonaktifkan triggernya dulu bila
-- itu tidak diinginkan. Status inquiry & counter TIDAK punya backup baris-per-baris;
-- nilai sebelum perubahan tercatat di kepala file ini (183/184/185 = WON,
-- 210 = deleted_at NULL).
