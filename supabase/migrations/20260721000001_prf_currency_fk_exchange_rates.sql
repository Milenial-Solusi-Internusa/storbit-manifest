-- 20260721000001_prf_currency_fk_exchange_rates.sql
-- Tanggal eksekusi manual: 2026-07-21.
--
-- FILE INI ADALAH REKAMAN. SQL di bawah SUDAH LIVE di database.
-- JANGAN jalankan ulang.
--
-- KONTEKS: sisa yang dipertahankan dari percobaan batch multi-vendor 21 Jul.
-- Kolom vendor_id / item_group / is_awarded / exchange_rate sempat ditambahkan
-- lalu di-DROP kembali karena urutan salah (DB duluan sebelum kode + RPC siap).
-- Dua perubahan di bawah TIDAK ikut di-drop dan memang layak dipertahankan.
--
-- 1. FK currency: menutup free-text di prf_cost_items.currency (sebelumnya
--    NOT NULL default 'IDR' tanpa CHECK tanpa FK, menerima 'usd' / 'IDR ').
--    Meniru pola vendors.currency_code -> currencies(code).
--    quotation_items.currency SENGAJA belum dikunci (data sudah banyak),
--    dicatat sebagai TD terpisah.
--
-- 2. prf.exchange_rates: meniru pola quotations.exchange_rates (20260717000000).
--    Tabel kurs manual per-dokumen, object map {"USD":16200}, IDR implisit = 1
--    tidak disimpan. Belum dibaca kode mana pun; aktif dipakai saat batch
--    multi-vendor + currency PRF dijalankan.

ALTER TABLE public.prf_cost_items
  ADD CONSTRAINT prf_cost_items_currency_fkey
    FOREIGN KEY (currency) REFERENCES public.currencies(code);

ALTER TABLE public.prf
  ADD COLUMN IF NOT EXISTS exchange_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.prf.exchange_rates IS
  'Tabel kurs manual per-PRF: {"USD":16200}. IDR implisit = 1 (tak disimpan). Meniru pola quotations.exchange_rates. Sumber kebenaran kurs; salinan per-baris menyusul di batch multi-vendor.';
