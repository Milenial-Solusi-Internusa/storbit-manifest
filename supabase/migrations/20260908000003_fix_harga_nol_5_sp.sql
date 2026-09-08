-- =============================================================================
-- Migration: 20260908000003_fix_harga_nol_5_sp
-- Phase:     Koreksi data — 5 SP ber-`unit_price` = 0 dari impor 2 Juli 2026.
-- Status:    LIVE (retroaktif) — dieksekusi manual di Supabase SQL Editor
--            7 Sep 2026; FILE INI DITULIS SESUDAHNYA (8 Sep 2026).
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di produksi. Ia direkam di sini karena mengubah
--    NILAI UANG yang masuk ke laporan CEO — jejaknya harus ada di tempat orang
--    mencari (`supabase/migrations/`), bukan cuma di `PROGRESS.md`.
--    ⚠️ Ditulis retroaktif: bentuknya rekonstruksi setia dari yang dijalankan,
--    BUKAN salinan byte-exact dari SQL Editor. Kalau butuh yang persis, sumber
--    kebenarannya produksi + `PROGRESS.md` 2026-09-07, bukan file ini.
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   Lima SP lolos dari impor 2 Juli 2026 (batch 690 baris / 405 SP, 99,3%
--   berhasil) dengan `unit_price` = 0. Qty-nya normal, jadi kelimanya menghitung
--   nilai Rp 0 di setiap kartu dan laporan — termasuk Outstanding Tagih yang
--   dibaca CEO.
--
-- ── DARI MANA ANGKA Rp 5.148 ────────────────────────────────────────────────
--   BUKAN taksiran. Dipastikan dari invoice Finance yang SUDAH LUNAS:
--     JKT-260119 · JKT-260120 · JKT-260123 · JKT-260134 · JKT-260135
--   masing-masing Rp 5.714.280, dan 1.000 x 5.148 x 1,11 = 5.714.280 tepat
--   (qty 1.000, harga satuan 5.148, PPN 11%). Jadi harga satuannya terbaca
--   balik dari nilai yang benar-benar ditagih dan dibayar.
--
-- ── SIFAT ──────────────────────────────────────────────────────────────────
--   UPDATE data, nol DDL. Dijalankan dalam SATU transaksi karena `sp_items` dan
--   `sp_order_items` harus bergerak bersama — divergensi antar keduanya adalah
--   kelas bug tersendiri yang sudah diawasi. Divergensi diverifikasi tetap 0
--   sesudahnya.
--
--   Dampak terukur: Outstanding Tagih +Rp 25.740.000 (5 x 1.000 x 5.148, DPP).
-- =============================================================================

BEGIN;

UPDATE public.sp_items
   SET unit_price = 5148
 WHERE sp_no IN ('2016828','2016880','2016895','2016989','2017000')
   AND unit_price = 0;

UPDATE public.sp_order_items soi
   SET unit_price = 5148
  FROM public.sp_orders o
 WHERE o.id = soi.sp_order_id
   AND o.sp_no IN ('2016828','2016880','2016895','2016989','2017000')
   AND soi.unit_price = 0;

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFIKASI (dijalankan 7 Sep 2026, hasilnya sudah dikonfirmasi)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Nol baris tersisa ber-harga nol di kelima SP.
SELECT sp_no, COUNT(*) AS baris_harga_nol
FROM public.sp_items
WHERE sp_no IN ('2016828','2016880','2016895','2016989','2017000')
  AND unit_price = 0
GROUP BY sp_no;

-- 2. Divergensi sp_items vs sp_order_items HARUS tetap 0.
SELECT COUNT(*) AS divergensi
FROM public.sp_items si
JOIN public.sp_orders o       ON o.sp_no = si.sp_no AND o.customer_id = si.customer_id
JOIN public.sp_order_items soi ON soi.sp_order_id = o.id
WHERE o.sp_no IN ('2016828','2016880','2016895','2016989','2017000')
  AND si.unit_price IS DISTINCT FROM soi.unit_price;
