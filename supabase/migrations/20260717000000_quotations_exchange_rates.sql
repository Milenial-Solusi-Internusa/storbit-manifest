-- ============================================================================
-- Quotation — tabel kurs manual per-quotation: kolom quotations.exchange_rates
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-17.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: header quotation = TABEL KURS manual per-quotation (bukan "pilih satu
--   currency"). Baris item tetap multi-currency; kurs baris jadi READ-ONLY,
--   turunan dari tabel kurs header (satu sumber kebenaran). Kurs diketik manual
--   per-quotation (kurs gerak tiap hari) — TIDAK ada lookup FX otomatis.
--   Object map: {"USD":16200,"SGD":12000}. IDR implisit = 1 (tidak disimpan).
--
-- ⚠️ TABRAKAN NAMA (lihat TD-74c): ada TABEL dorman `public.exchange_rates`
--    (master FX + effective_date, 0 query di src/) yang namanya SAMA PERSIS
--    dengan kolom ini. Bukan konflik teknis (beda namespace), tapi jebakan
--    salah-baca. Nasib tabel dorman itu belum diputuskan.
--
-- CATATAN: `quotation_items.exchange_rate` TETAP disimpan per-baris sebagai
--   salinan materialized (write-through dari header) — dibaca QuotationDetailPage
--   & QuotationPDF, sehingga keduanya tak perlu diubah.
--
-- STEP 2 (RPC save_quotation memetakan kolom ini) direkam terpisah di
--   20260717000001_save_quotation_exchange_rates.sql — urutan wajib 1 lalu 2.
--
-- VERIFIKASI (saat eksekusi manual):
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema='public' and table_name='quotations' and column_name='exchange_rates';
--   → Hasil: jsonb | NO | '{}'::jsonb  ✅
-- ============================================================================

-- Tabel kurs manual per-quotation (Level: currency multi-baris).
-- Object map: {"USD":16200,"SGD":12000}. IDR implisit = 1 (TIDAK disimpan di sini).
-- Input manual per-quotation; tidak ada lookup FX, tidak ada master data.
alter table public.quotations
  add column if not exists exchange_rates jsonb not null default '{}'::jsonb;

comment on column public.quotations.exchange_rates is
  'Tabel kurs manual per-quotation: {"USD":16200,"SGD":12000}. IDR implisit = 1 (tak disimpan). Sumber kebenaran kurs; quotation_items.exchange_rate = salinan materialized (write-through) yang dibaca Detail & PDF. Input manual, tanpa lookup FX.';
