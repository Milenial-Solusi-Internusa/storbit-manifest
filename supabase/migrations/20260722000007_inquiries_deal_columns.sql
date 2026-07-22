-- STATUS: SUDAH DIJALANKAN 22 Jul 2026, terverifikasi via information_schema.columns
-- (ketiganya ada, nullable, tanpa default). REKAMAN — JANGAN dijalankan ulang.
--
-- FASE 3 langkah F3-2. Prasyarat: 20260722000006 (backup accounts) sudah jalan.
--
-- Tiga kolom deal pindah ke inquiries. Sebelum ini won_reason/lost_reason/
-- estimated_value HANYA ada di accounts — padahal satu akun bisa punya banyak
-- inquiry, sehingga "alasan menang/kalah" dan "nilai deal" yang tunggal per akun
-- tidak bisa mewakili deal yang berbeda-beda. Lihat AUDIT_STAGE_MOVE.md §Kolom.
--
-- ── KEPUTUSAN DESAIN ────────────────────────────────────────────────────────
-- (1) estimated_value SENGAJA nullable TANPA default — berbeda dari
--     accounts.estimated_value yang DEFAULT 0. Alasannya: di sini "belum diisi"
--     harus bisa dibedakan dari "nol". DEFAULT 0 membuat keduanya tampak sama dan
--     ikut mencemari rata-rata/total nilai pipeline.
-- (2) Aditif murni: nol pembaca saat dijalankan, nol baris tersentuh, jadi aman
--     dijalankan kapan pun sebelum kodenya siap. Penulis FE pertama menyusul di
--     batch 3B-1 ("Tandai Kalah" mengisi lost_reason).
-- (3) Kolom lama di accounts TIDAK di-drop dan TIDAK di-backfill hari ini —
--     pemangkasan sumbu lama adalah batch 3C.

ALTER TABLE public.inquiries
  ADD COLUMN won_reason      text,
  ADD COLUMN lost_reason     text,
  ADD COLUMN estimated_value numeric;

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
-- Harus 3 baris, is_nullable=YES, column_default NULL:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='inquiries'
--     AND column_name IN ('won_reason','lost_reason','estimated_value')
--   ORDER BY column_name;
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.inquiries
--     DROP COLUMN IF EXISTS won_reason,
--     DROP COLUMN IF EXISTS lost_reason,
--     DROP COLUMN IF EXISTS estimated_value;
