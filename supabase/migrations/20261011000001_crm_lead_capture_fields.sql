-- =============================================================================
-- 20261011000001_crm_lead_capture_fields.sql
--
-- Batch DS 3 giliran Lead Management, Paket 1 irisan 1 (bagian A/2) --
-- kolom baru untuk Capture Lead + Detail Lead (Overview/Contacts) sesuai
-- mockup design-handoff/crm-2026-10-11/Lead Management.dc.html. Aditif
-- murni -- nol kolom diubah/di-drop, nol tabel baru di file ini.
--
-- Status: BELUM DIJALANKAN -- ditulis 11 Okt 2026, menunggu dijalankan Den
--         di staging dulu.
--
-- -- accounts --------------------------------------------------------------
-- industry, lead_category, priority, website, description, qualified_reason,
-- qualified_at, competitor_name, competitor_price -- sembilan kolom baru,
-- semuanya nullable, nol DEFAULT yang mengunci nilai bisnis apa pun.
--
-- qualified_at adalah sumbu status "Qualified" di layar baru (lihat plan
-- Lead Management): lifecycle_stage IN ('lead','mql') AND qualified_at IS
-- NULL = Raw; qualified_at IS NOT NULL = Qualified. Diisi lewat aksi "Mark
-- Qualified" di halaman, bukan trigger DB -- qualified_reason menyusul
-- sebagai edit terpisah sesudahnya (pola mockup: tandai dulu, alasan
-- menyusul), jadi kolom ini SENGAJA tanpa syarat qualified_reason terisi.
--
-- competitor_name/competitor_price meniru persis nama dan tipe kolom yang
-- sudah ada di inquiries.competitor_name/inquiries.competitor_price
-- (schema_snapshot.sql) -- pola penamaan disalin, bukan dikarang baru.
-- Keduanya relevan untuk Mark as Lost SEBELUM lead sempat jadi inquiry,
-- jadi butuh salinannya sendiri di accounts, bukan menunggu inquiries ada.
--
-- -- contacts --------------------------------------------------------------
-- whatsapp, preferred_channel -- dua kolom baru untuk kartu kontak primer
-- di Capture Lead dan tab Contacts Detail Lead. preferred_channel dipagari
-- CHECK tiga nilai (whatsapp/call/email) persis tiga opsi di mockup.
--
-- Tidak ada perubahan GRANT di file ini -- accounts dan contacts sudah
-- punya GRANT table-level (SELECT/INSERT/UPDATE ke authenticated) dari
-- migrasi lama; kolom baru otomatis ikut cakupan GRANT yang sudah ada
-- (Postgres tidak punya column-level privilege di sini, grant selalu
-- table-level di seluruh skema ini).
-- =============================================================================

BEGIN;

ALTER TABLE public.accounts
  ADD COLUMN industry text,
  ADD COLUMN lead_category text,
  ADD COLUMN priority text,
  ADD COLUMN website text,
  ADD COLUMN description text,
  ADD COLUMN qualified_reason text,
  ADD COLUMN qualified_at timestamptz,
  ADD COLUMN competitor_name text,
  ADD COLUMN competitor_price numeric;

COMMENT ON COLUMN public.accounts.priority IS 'Prioritas lead: High/Medium/Low (teks bebas, bukan enum -- cermin dropdown mockup). Default "Medium" diisi FE saat Capture Lead, BUKAN DEFAULT kolom, supaya nilainya selalu eksplisit per baris, bukan diam-diam.';
COMMENT ON COLUMN public.accounts.qualified_at IS 'Diisi saat sales/manager menekan "Mark Qualified" di Detail Lead (status Raw -> Qualified). NULL = belum di-qualify. Sumbu status layar: lihat plan Lead Management bagian "Pemetaan Status Final".';
COMMENT ON COLUMN public.accounts.competitor_name IS 'Hanya relevan saat lost_reason menunjuk kompetitor. Pola kolom sama persis inquiries.competitor_name/inquiries.competitor_price -- disalin, bukan tabel/relasi baru.';
COMMENT ON COLUMN public.accounts.lead_category IS 'Nilai dari dropdown_options (list_key=lead_category), dikelola lewat migrasi 20261011000002. Tabel ini SENGAJA belum diisi seed -- daftar kategori menunggu konfirmasi Den.';

ALTER TABLE public.contacts
  ADD COLUMN whatsapp text,
  ADD COLUMN preferred_channel text,
  ADD CONSTRAINT contacts_preferred_channel_check
    CHECK (preferred_channel IS NULL OR preferred_channel IN ('whatsapp', 'call', 'email'));

COMMENT ON COLUMN public.contacts.preferred_channel IS 'Kanal yang disukai kontak ini: whatsapp/call/email. Field baru Capture Lead + tab Contacts Detail Lead, mockup design-handoff/crm-2026-10-11/Lead Management.dc.html.';

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'accounts'
--    AND column_name IN ('industry','lead_category','priority','website',
--                         'description','qualified_reason','qualified_at',
--                         'competitor_name','competitor_price')
--  ORDER BY column_name;
-- -- Harap: 9 baris, semuanya is_nullable = 'YES'.
--
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'contacts'
--    AND column_name IN ('whatsapp','preferred_channel')
--  ORDER BY column_name;
-- -- Harap: 2 baris.
--
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.contacts'::regclass
--    AND conname = 'contacts_preferred_channel_check';
-- -- Harap: 1 baris.
--
-- -- Sanity check nol dampak ke GRANT yang sudah ada:
-- SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name IN ('accounts','contacts')
--    AND grantee IN ('authenticated','anon')
--  GROUP BY grantee, table_name;
-- =============================================================================

-- =============================================================================
-- ROLLBACK (kalau perlu dibatalkan sebelum ada baris terisi):
--   ALTER TABLE public.contacts DROP CONSTRAINT contacts_preferred_channel_check;
--   ALTER TABLE public.contacts DROP COLUMN whatsapp, DROP COLUMN preferred_channel;
--   ALTER TABLE public.accounts
--     DROP COLUMN industry, DROP COLUMN lead_category, DROP COLUMN priority,
--     DROP COLUMN website, DROP COLUMN description, DROP COLUMN qualified_reason,
--     DROP COLUMN qualified_at, DROP COLUMN competitor_name, DROP COLUMN competitor_price;
-- =============================================================================
