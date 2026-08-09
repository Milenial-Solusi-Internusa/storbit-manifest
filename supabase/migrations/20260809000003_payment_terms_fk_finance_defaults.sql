-- ============================================================================
-- Payment Terms FK di Entity Finance Settings + fix nesting bug payment_terms_read
-- ============================================================================
-- Tanggal eksekusi manual: 2026-08-09, ~14:32 WIB (commit refresh snapshot
-- 8390919995696f6496fc59e992259d1e95136378a).
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase
--    SQL Editor). Definisi "current state" diambil PERSIS dari
--    supabase/schema_snapshot.sql (fresh, refresh pasca-merge 10 Agu 2026).
--    Definisi "before" di blok ROLLBACK diambil dari git log -p -G
--    'payment_terms_read|default_payment_term_id' -- supabase/schema_snapshot.sql,
--    commit 8390919995696f6496fc59e992259d1e95136378a. JANGAN jalankan ulang.
--
-- KONTEKS (kolom): FinanceDefaultsPage.jsx field "Termin Pembayaran Default"
--   berubah dari input angka manual (default_payment_terms integer, kolom
--   lama TETAP ADA, tidak di-drop) jadi dropdown KitSelect isi payment_terms
--   AKTIF milik company yang sedang dibuka. Kolom baru nullable, ON DELETE
--   SET NULL -- payment term yang dihapus tidak boleh mem-block delete-nya
--   sendiri, cuma melepas rujukan.
--
-- ⚠️ KOREKSI PENTING vs asumsi awal task ini -- diverifikasi via git log,
--    BUKAN "menambahkan" bypass is_super_admin() ke payment_terms_read.
--    Bypass is_super_admin() SUDAH ADA sejak policy ini dibuat pertama kali
--    (commit 6382bf2, 17 Jun 2026) dan TIDAK disentuh oleh commit ba1c295
--    (refresh drift lama, 9 Agu pagi). Yang SEBENARNYA berubah di sini
--    adalah PEMINDAHAN posisi is_super_admin() -- bug KELAS SAMA dengan
--    TD-170/roles_insert-update di migration 20260809000002:
--      SEBELUM: (company_id = get_user_company_id()) AND
--               ((deleted_at IS NULL) OR is_super_admin())
--      -> is_super_admin() cuma melebarkan visibilitas SOFT-DELETED ROW,
--         TAPI super_admin TETAP terkunci company_id = get_user_company_id()
--         (home company sendiri) -- super_admin tak bisa lihat payment terms
--         company LAIN sama sekali, sama seperti bug roles_insert/update.
--      SESUDAH: ((company_id = get_user_company_id()) AND (deleted_at IS NULL))
--               OR is_super_admin()
--      -> is_super_admin() sekarang bypass TOP-LEVEL murni, super_admin lihat
--         SEMUA company (termasuk row soft-deleted).
--    Perubahan ini kemungkinan besar EFEK SAMPING dari kerja kolom FK di atas
--    (satu commit refresh yang sama, 8390919), bukan task RLS tersendiri --
--    tidak ada catatan sesi yang menyebutnya eksplisit sebelum ditemukan
--    lewat verifikasi git log untuk migration ini.
--
--    TD-180 (docs/Governance/08_TECH_DEBT.md) TETAP OPEN untuk policy ini --
--    fix di atas HANYA memperbaiki posisi is_super_admin(), BELUM menambahkan
--    bypass get_user_company_ids() (varian jamak, utk user non-admin yang
--    genuinely multi-company). payment_terms_read masih SATU-nya dari 3
--    policy yang diaudit sesi ini (companies_read_own/roles_read/
--    payment_terms_read) yang belum dapat bypass itu -- lihat migration
--    20260809000004 untuk 2 yang sudah.
--
-- ISI:
--   Statement 1 -- ALTER TABLE entity_finance_settings ADD COLUMN default_payment_term_id.
--   Statement 2 -- ALTER TABLE ... ADD CONSTRAINT ..._fkey (FK ke payment_terms, ON DELETE SET NULL).
--   Statement 3 -- ALTER POLICY payment_terms_read (pindah is_super_admin() ke top-level).
-- ============================================================================


-- STATEMENT 1: kolom baru, nullable, tanpa default
ALTER TABLE public.entity_finance_settings
  ADD COLUMN default_payment_term_id uuid;

-- STATEMENT 2: FK ke payment_terms, ON DELETE SET NULL (term dihapus -> kolom ini NULL, bukan block delete)
ALTER TABLE ONLY public.entity_finance_settings
  ADD CONSTRAINT entity_finance_settings_default_payment_term_id_fkey
  FOREIGN KEY (default_payment_term_id) REFERENCES public.payment_terms(id) ON DELETE SET NULL;

-- STATEMENT 3: payment_terms_read -- is_super_admin() jadi bypass top-level murni
-- (BUKAN "tambah" bypass -- klausanya sudah ada, cuma posisinya yang salah, lihat KONTEKS di atas)
ALTER POLICY payment_terms_read ON public.payment_terms
  USING (
    ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))
    OR public.is_super_admin()
  );


-- ============================================================================
-- ROLLBACK (jalankan urutan terbalik, statement 3 -> 1). Definisi "before"
-- diverifikasi dari git log -p -G'payment_terms_read|default_payment_term_id'
-- -- supabase/schema_snapshot.sql, commit 8390919995696f6496fc59e992259d1e95136378a
-- (state sebelumnya identik dari commit pembuatan 6382bf2, 17 Jun 2026 --
-- tak pernah diubah di antaranya).
--
-- -- Rollback statement 3 (payment_terms_read -> is_super_admin() nested di AND, bug lama)
-- ALTER POLICY payment_terms_read ON public.payment_terms
--   USING (
--     (company_id = public.get_user_company_id())
--     AND ((deleted_at IS NULL) OR public.is_super_admin())
--   );
--
-- -- Rollback statement 2 (drop FK constraint)
-- ALTER TABLE ONLY public.entity_finance_settings
--   DROP CONSTRAINT IF EXISTS entity_finance_settings_default_payment_term_id_fkey;
--
-- -- Rollback statement 1 (drop kolom -- otomatis ikut drop constraint di atas
-- -- kalau statement 2 di-skip, tapi ditulis eksplisit dulu demi kejelasan urutan)
-- ALTER TABLE public.entity_finance_settings
--   DROP COLUMN IF EXISTS default_payment_term_id;
-- ============================================================================
