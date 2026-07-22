-- STATUS: SUDAH DIJALANKAN 22 Jul 2026, terverifikasi.
-- Bukti: constraint inquiries_status_check terpasang, terverifikasi via pg_constraint.
--
-- FASE 2 langkah 2 dari 3. Menjalankan ini SEBELUM backfill (20260722000002)
-- akan gagal — jalankan sesuai urutan nomor.
--
-- Mengunci kosakata inquiries.status. Sebelum ini kolomnya varchar bebas tanpa
-- CHECK, sama seperti accounts.pipeline_stage — dan itulah yang dulu membuat nilai
-- NURTURE bisa masuk lalu menggantung tanpa kolom Kanban (TD-61). Sumbu deal tidak
-- diulangi dengan cacat yang sama.
--
-- ── KEPUTUSAN DESAIN ────────────────────────────────────────────────────────
-- Kosakata nilai DB sengaja MEMPERTAHANKAN yang sudah dirender
-- InquiryListPage.jsx:41-48 (OPEN, IN_REVIEW, QUOTED, WON, LOST, CANCELLED);
-- yang ditambahkan HANYA 'NEGOTIATION'. Rename nilai enum pada kolom yang sudah
-- berisi data adalah backfill tambahan tanpa manfaat — yang perlu berubah cukup
-- LABELNYA di UI nanti: OPEN -> "Baru", IN_REVIEW -> "Menunggu harga".
-- Nilai di DB dan label di layar tidak harus sama.

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_status_check
  CHECK (status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION','WON','LOST','CANCELLED'));

-- ─── VERIFIKASI (jalankan TERPISAH setelah migrasi di atas) ───────────────────
-- Harus mengembalikan 1 baris berisi definisi CHECK dengan tujuh nilai di atas.
--
--   SELECT conname, pg_get_constraintdef(oid) AS definisi
--   FROM pg_constraint
--   WHERE conrelid = 'public.inquiries'::regclass
--     AND conname = 'inquiries_status_check';
