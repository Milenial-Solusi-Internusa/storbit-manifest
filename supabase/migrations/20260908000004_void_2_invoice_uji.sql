-- =============================================================================
-- Migration: 20260908000004_void_2_invoice_uji
-- Phase:     Pengembalian data — 2 invoice uji dikembalikan ke BTB_TERBIT.
-- Status:    LIVE (retroaktif) — dieksekusi manual di Supabase SQL Editor
--            7 Sep 2026; FILE INI DITULIS SESUDAHNYA (8 Sep 2026).
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    ⚠️ Ditulis retroaktif: rekonstruksi setia, BUKAN salinan byte-exact dari
--    SQL Editor. Sumber kebenaran = produksi + `PROGRESS.md` 2026-09-07.
--
-- ── KONTEKS ────────────────────────────────────────────────────────────────
--   Dua invoice dibuat saat menguji alur invoice, lalu perlu dikembalikan:
--     SOA-INV-IX-2026-0012  -> SP 2280686
--     SOA-INV-IX-2026-0013  -> SP 2273234
--
-- ── KENAPA VOID, BUKAN DELETE ──────────────────────────────────────────────
--   Mengikuti praktik yang sudah ada di modul ini: invoice di-`void`, tidak
--   dihapus. Nomor dokumen yang sudah terbit tidak boleh menghilang tanpa
--   jejak — itu yang membedakan pembatalan dari penghapusan.
--   ⚠️ KONSEKUENSI YANG DISENGAJA: nomor 0012 dan 0013 TERPAKAI PERMANEN.
--   Invoice berikutnya mulai dari 0014. Ini bukan kelalaian penomoran.
--
-- ── KENAPA JURNAL AR JUSTRU DIHAPUS PERMANEN ───────────────────────────────
--   `journal_entries` TIDAK punya kolom `deleted_at`, jadi soft delete bukan
--   pilihan yang tersedia di sana. Membiarkan jurnalnya hidup untuk invoice
--   yang sudah void akan membuat AR ganda. Jadi dua perlakuan berbeda dalam
--   satu operasi — invoice di-void, jurnalnya di-DELETE — dan itu disengaja,
--   bukan tidak konsisten.
--
-- ── STATUS SP KEMBALI SENDIRI ──────────────────────────────────────────────
--   Status SP TIDAK di-UPDATE manual. `sp_recompute_status` dipanggil, dan
--   keduanya kembali ke BTB_TERBIT dengan sendirinya — mesin statusnya bekerja
--   sesuai rancangan. Menyetel status dengan tangan justru akan memutus
--   kesesuaian antara status dan fakta turunannya.
-- =============================================================================

BEGIN;

-- 1. Void invoice (BUKAN delete — nomornya tetap tercatat).
UPDATE public.sp_invoices
   SET status = 'void'
 WHERE invoice_no IN ('SOA-INV-IX-2026-0012', 'SOA-INV-IX-2026-0013');

-- 2. Hapus jurnal AR-nya. Permanen, karena journal_entries tak punya deleted_at.
--    Penautnya `reference_type`/`reference_id` (BUKAN source_*), dan nilainya
--    'invoice_issued' — persis yang ditulis create_invoice saat menerbitkan.
DELETE FROM public.journal_entry_lines
 WHERE journal_entry_id IN (
   SELECT je.id FROM public.journal_entries je
    WHERE je.reference_type = 'invoice_issued'
      AND je.reference_id IN (SELECT id FROM public.sp_invoices
                               WHERE invoice_no IN ('SOA-INV-IX-2026-0012','SOA-INV-IX-2026-0013'))
 );

DELETE FROM public.journal_entries je
 WHERE je.reference_type = 'invoice_issued'
   AND je.reference_id IN (SELECT id FROM public.sp_invoices
                            WHERE invoice_no IN ('SOA-INV-IX-2026-0012','SOA-INV-IX-2026-0013'));

COMMIT;

-- 3. Biarkan mesin status yang menentukan, jangan set manual.
--    Signature-nya (p_customer_id, p_sp_no) — bukan id SP.
SELECT public.sp_recompute_status(o.customer_id, o.sp_no)
FROM public.sp_orders o
WHERE o.sp_no IN ('2280686', '2273234');


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFIKASI (dijalankan 7 Sep 2026, hasilnya sudah dikonfirmasi)
-- ─────────────────────────────────────────────────────────────────────────────

-- Kedua SP HARUS kembali ke BTB_TERBIT.
SELECT sp_no, status
FROM public.sp_orders
WHERE sp_no IN ('2280686', '2273234');

-- Kedua invoice HARUS ada dan ber-status void (bukan hilang).
SELECT invoice_no, status
FROM public.sp_invoices
WHERE invoice_no IN ('SOA-INV-IX-2026-0012', 'SOA-INV-IX-2026-0013');

-- Nol jurnal AR tersisa untuk keduanya.
SELECT COUNT(*) AS jurnal_tersisa
FROM public.journal_entries je
WHERE je.reference_type = 'invoice_issued'
  AND je.reference_id IN (SELECT id FROM public.sp_invoices
                           WHERE invoice_no IN ('SOA-INV-IX-2026-0012','SOA-INV-IX-2026-0013'));
