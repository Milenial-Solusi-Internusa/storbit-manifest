-- ============================================================================
-- PRF Fase 1 (Q1) — tambah kolom prf.inquiry_id (link ke inquiries)
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-10.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: PRF Fase 1, keputusan Q1 — saat customer_source='inquiry', form PRF
--   memilih dari tabel `inquiries` dan menautkannya via `prf.inquiry_id` (lalu
--   auto-isi account_id dari customer/prospect inquiry itu). Fase 0
--   (20260710000001_prf_fase0.sql) membuat tabel `prf` TANPA kolom ini; kolom
--   ditambah menyusul di sesi yang sama.
--
-- VERIFIKASI (saat eksekusi manual): kolom `inquiry_id` ada; jumlah FK pada
--   tabel prf naik 5 → 6 (tambahan prf_inquiry_id_fkey → inquiries(id)).
--
-- ⚠️ PENTING: `PRFFormPage.jsx` meng-INSERT `inquiry_id` saat sumber=inquiry —
--    kolom ini WAJIB ada, kalau tidak insert PRF sumber=inquiry akan gagal.
-- ============================================================================

ALTER TABLE public.prf
  ADD COLUMN inquiry_id uuid,
  ADD CONSTRAINT prf_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id);
