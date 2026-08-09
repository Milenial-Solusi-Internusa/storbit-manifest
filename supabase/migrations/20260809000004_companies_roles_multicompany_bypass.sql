-- ============================================================================
-- companies_read_own + roles_read: tambah bypass get_user_company_ids()
-- untuk user genuinely multi-company
-- ============================================================================
-- Tanggal eksekusi manual: 2026-08-09, dua commit refresh terpisah di dua
-- branch berbeda, kemudian merge:
--   - companies_read_own: ~22:41 WIB di branch main (commit refresh snapshot
--     1147a2e7bd307fcef94e3842efc2b9916d8e21be).
--   - roles_read: ~23:42 WIB di branch feat/company-switcher-topbar (commit
--     refresh snapshot c3bac1b4a9fc82e97cbc9395f0753308f7f255b7).
--   Kedua branch di-merge malam itu juga (commit 7d0ff5f, "refresh schema
--   snapshot pasca-merge" -- konflik cuma 2 baris token pg_dump \restrict/
--   \unrestrict, isi SQL substantif kedua sisi tergabung otomatis).
--   - roles_read, fix SUSULAN: klausa "deleted_at IS NULL" yang sempat
--     hilang total pasca-merge (lihat KONTEKS kedua di bawah) ditambal
--     balik DI SESI YANG SAMA. Belum ada commit hash tersendiri untuk fix
--     ini -- tertangkap di supabase/schema_snapshot.sql versi kerja saat
--     file migrasi ini ditulis, TAPI refresh snapshot itu sendiri belum
--     di-commit (`git status` menunjukkan schema_snapshot.sql modified,
--     bukan committed, per saat file ini ditulis).
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database. Definisi "current state"
--    diambil PERSIS dari supabase/schema_snapshot.sql (fresh, refresh
--    pasca-merge 10 Agu 2026). Definisi "before" di blok ROLLBACK diambil
--    dari git log -p -G'companies_read_own|roles_read' --
--    supabase/schema_snapshot.sql, commit 1147a2e (companies_read_own) dan
--    c3bac1b (roles_read). JANGAN jalankan ulang.
--
-- KONTEKS: ditemukan lewat testing runtime CompanySwitcher.jsx dengan user
--   multi-company ASLI (Elvira Nurhuda, Finance permanen di MSI+SOA
--   sekaligus, bukan data uji) -- dia cuma melihat 1 company di switcher
--   padahal myCompanyIds (AuthContext.jsx) benar berisi 2. Root cause BUKAN
--   di myCompanyIds/kode frontend (sempat jadi dugaan awal, terbukti salah
--   lewat query RLS-simulated live) -- root cause di RLS companies_read_own
--   yang cuma bypass get_user_company_id() (home company TUNGGAL), bukan
--   get_user_company_ids() (jamak, fungsi baru dari migration
--   20260809000002). roles_read punya gap struktural sama, ditemukan sesi
--   yang sama saat menyisir pemakaian get_user_company_id() lain.
--
-- ⚠️ REGRESI TRANSIEN pada roles_read -- DITEMUKAN DAN DITAMBAL BALIK di
--    sesi yang sama, SEBELUM file migrasi ini ditulis. Tidak pernah
--    dibiarkan terbuka, dan tidak pernah masuk sebagai file migrasi
--    tersendiri -- migration ini langsung mencatat qual FINAL (tahap 3 di
--    bawah) sebagai satu-satunya "current state" untuk Statement 2.
--    Kronologi, dari git log + verifikasi live schema_snapshot.sql:
--      1. SEBELUM sesi ini (commit c3bac1b, fix awal bypass jamak):
--         is_super_admin() OR (company_id = get_user_company_id() AND deleted_at IS NULL)
--      2. SEMPAT jadi (commit 7d0ff5f, "refresh pasca-merge" -- klausa
--         "deleted_at IS NULL" HILANG TOTAL saat is_super_admin() dipindah
--         top-level; kemungkinan besar efek samping tak sengaja saat
--         merge/restrukturisasi boolean, bukan keputusan sadar):
--         (company_id = get_user_company_id()) OR
--         (company_id IN (SELECT get_user_company_ids())) OR is_super_admin()
--         -- selama tahap ini, role SOFT-DELETED (roles.deleted_at IS NOT
--         NULL) bisa terbaca oleh SEMUA authenticated user yang
--         company_id-nya cocok, bukan cuma super_admin. Durasi jendela ini
--         tak diketahui pasti -- tak ada commit terpisah yang menandai
--         kapan tahap 3 di bawah terjadi.
--      3. DITAMBAL BALIK (live sekarang, lihat catatan commit-hash di
--         header di atas): deleted_at IS NULL dipasang lagi, kali ini
--         melingkupi KEDUA jalur company (home + jamak) sebelum digabung
--         is_super_admin() -- inilah qual yang dicatat Statement 2 di bawah.
--    Karena tahap 2 tak pernah ter-commit sebagai perubahan permanen dan
--    sudah ditambal sebelum dokumentasi ini ditulis, migration ini TIDAK
--    mencatatnya sebagai statement/versi antara -- rollback tetap menuju
--    tahap 1 (state sebelum sesi ini mulai), bukan tahap 2.
--
-- ISI:
--   Statement 1 -- ALTER POLICY companies_read_own (tambah bypass get_user_company_ids()).
--   Statement 2 -- ALTER POLICY roles_read (tambah bypass get_user_company_ids(),
--                  qual FINAL pasca-regresi-transien -- lihat KONTEKS kedua
--                  di atas untuk kronologi lengkap).
-- ============================================================================


-- STATEMENT 1: companies_read_own -- tambah bypass get_user_company_ids()
ALTER POLICY companies_read_own ON public.companies
  USING (
    (id = public.get_user_company_id())
    OR (id IN (SELECT public.get_user_company_ids()))
    OR public.is_super_admin()
  );

-- STATEMENT 2: roles_read -- tambah bypass get_user_company_ids(), deleted_at
-- IS NULL melingkupi KEDUA jalur company (qual final pasca-regresi-transien
-- -- lihat KONTEKS kedua di header untuk kronologi lengkap)
ALTER POLICY roles_read ON public.roles
  USING (
    (
      (
        (company_id = public.get_user_company_id())
        OR (company_id IN (SELECT public.get_user_company_ids()))
      )
      AND (deleted_at IS NULL)
    )
    OR public.is_super_admin()
  );


-- ============================================================================
-- ROLLBACK (jalankan urutan terbalik, statement 2 -> 1). Definisi "before"
-- diverifikasi dari git log -p -G'companies_read_own|roles_read' --
-- supabase/schema_snapshot.sql, commit 1147a2e7bd307fcef94e3842efc2b9916d8e21be
-- (companies_read_own -- unchanged sejak commit pembuatan 6382bf2, 17 Jun 2026)
-- dan c3bac1b4a9fc82e97cbc9395f0753308f7f255b7 (roles_read).
--
-- -- Rollback statement 2 (roles_read -> versi sebelum sesi ini, TERMASUK deleted_at IS NULL balik)
-- ALTER POLICY roles_read ON public.roles
--   USING (
--     public.is_super_admin()
--     OR ((company_id = public.get_user_company_id()) AND (deleted_at IS NULL))
--   );
--
-- -- Rollback statement 1 (companies_read_own -> nol bypass jamak, state asli sejak 17 Jun 2026)
-- ALTER POLICY companies_read_own ON public.companies
--   USING (
--     (id = public.get_user_company_id())
--     OR public.is_super_admin()
--   );
-- ============================================================================
