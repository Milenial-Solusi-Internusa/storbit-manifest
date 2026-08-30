-- =============================================================================
-- Migration: 20260830000004_accounts_source_add_whatsapp
-- Batch:     CRM v3 — tambahan kecil, opsi sumber lead
-- Depends:   accounts (kolom source + constraint prospects_source_check)
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- ISI
--   Melebarkan CHECK constraint `prospects_source_check` pada tabel
--   `public.accounts` dari 11 nilai menjadi 12, dengan menambahkan 'whatsapp'.
--   WhatsApp adalah channel lead yang nyata dipakai tapi belum pernah masuk
--   daftar nilai yang sah.
--
-- ⚠️ NAMA CONSTRAINT-nya `prospects_*`, TABELNYA `accounts` — bukan salah ketik.
--   Warisan dari masa tabel ini masih bernama `prospects`; constraint-nya tak
--   pernah ikut di-rename. Nama itu DIPERTAHANKAN apa adanya di sini: mengganti
--   namanya bukan bagian dari tugas ini dan akan memutus rujukan lain yang
--   mungkin memakainya.
--
-- SUMBER DEFINISI LAMA (diverifikasi, bukan ditebak)
--   `grep prospects_source_check supabase/migrations/` = NOL hit — constraint ini
--   tak pernah disentuh migrasi mana pun. Satu-satunya definisi tercatat ada di
--   schema_snapshot.sql baris 3329. Kekhawatiran "snapshot basi untuk perubahan
--   setelah 27 Agu" TIDAK berlaku di sini justru karena nol migrasi mengubahnya.
--
--   Definisi lama, apa adanya:
--     CHECK (((source)::text = ANY (ARRAY[
--       'sales_visit'::text, 'cold_call'::text, 'referral'::text,
--       'existing_network'::text, 'exhibition'::text, 'instagram'::text,
--       'linkedin'::text, 'tiktok'::text, 'website'::text, 'walk_in'::text,
--       'other'::text])))
--
-- KEPUTUSAN BENTUK
--   • 'whatsapp' DITAMBAHKAN DI AKHIR array. Urutan 11 nilai lama tidak digeser
--     sedikit pun. Urutan di dalam ARRAY sebuah CHECK tidak punya makna
--     semantik, jadi menyisipkannya di tengah hanya akan memperbesar diff tanpa
--     manfaat. (Urutan TAMPILAN di dropdown diatur terpisah di FE, di mana
--     'whatsapp' memang disisipkan di antara tiktok dan website.)
--   • Bentuk ekspresinya dipertahankan persis — TANPA menambahkan
--     `source IS NULL OR ...`. NULL sudah lolos dengan sendirinya: pada CHECK,
--     ekspresi yang bernilai NULL dianggap lulus. Menambahkan guard NULL akan
--     mengubah teks constraint tanpa mengubah perilakunya.
--
-- IDEMPOTEN: DROP ... IF EXISTS lalu ADD. Aman dijalankan berulang.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PRA-CEK — pastikan tak ada baris yang akan menolak constraint baru
-- ═════════════════════════════════════════════════════════════════════════════
-- ADD CONSTRAINT memvalidasi seluruh baris yang ada. Secara teori ini selalu
-- lolos (12 nilai adalah superset dari 11 yang selama ini dipaksakan), tapi
-- murah untuk dipastikan — dan kalau ternyata ada baris menyimpang, lebih baik
-- ketahuan di sini daripada lewat pesan error ALTER TABLE.
--
-- SELECT source, COUNT(*)
-- FROM public.accounts
-- WHERE source IS NOT NULL
--   AND source NOT IN ('sales_visit','cold_call','referral','existing_network',
--                      'exhibition','instagram','linkedin','tiktok','website',
--                      'walk_in','other','whatsapp')
-- GROUP BY source;
--   HARAPAN: 0 baris.


-- ═════════════════════════════════════════════════════════════════════════════
-- PELEBARAN CONSTRAINT
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS prospects_source_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT prospects_source_check
  CHECK (((source)::text = ANY (ARRAY[
    'sales_visit'::text,
    'cold_call'::text,
    'referral'::text,
    'existing_network'::text,
    'exhibition'::text,
    'instagram'::text,
    'linkedin'::text,
    'tiktok'::text,
    'website'::text,
    'walk_in'::text,
    'other'::text,
    'whatsapp'::text        -- ← satu-satunya tambahan
  ])));

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — jalankan SESUDAHNYA
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Constraint sudah memuat 'whatsapp':
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.accounts'::regclass AND conname = 'prospects_source_check';
--
-- 2) Uji positif — HARUS BERHASIL (lalu di-rollback, tidak menyisakan data):
-- BEGIN;
--   UPDATE public.accounts SET source = 'whatsapp'
--   WHERE id = (SELECT id FROM public.accounts LIMIT 1);
-- ROLLBACK;
--
-- 3) Uji negatif — HARUS GAGAL (membuktikan constraint masih menjaga):
-- BEGIN;
--   UPDATE public.accounts SET source = 'telepati'
--   WHERE id = (SELECT id FROM public.accounts LIMIT 1);
-- ROLLBACK;
--
-- ROLLBACK migrasi ini (kembali ke 11 nilai):
--   ⚠️ Akan GAGAL kalau sudah ada baris ber-source 'whatsapp'. Kosongkan dulu
--   (mis. UPDATE ... SET source = 'other' WHERE source = 'whatsapp') baru jalankan:
--   BEGIN;
--   ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS prospects_source_check;
--   ALTER TABLE public.accounts ADD CONSTRAINT prospects_source_check
--     CHECK (((source)::text = ANY (ARRAY['sales_visit'::text,'cold_call'::text,
--       'referral'::text,'existing_network'::text,'exhibition'::text,
--       'instagram'::text,'linkedin'::text,'tiktok'::text,'website'::text,
--       'walk_in'::text,'other'::text])));
--   COMMIT;
