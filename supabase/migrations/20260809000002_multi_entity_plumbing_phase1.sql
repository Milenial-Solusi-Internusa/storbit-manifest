-- ============================================================================
-- Fase 1 Multi-Entity Plumbing: get_user_company_ids() + restrukturisasi
-- bypass super_admin di 4 policy roles/user_roles
-- ============================================================================
-- Tanggal eksekusi manual: 2026-08-09, ~02:51 WIB (commit refresh snapshot
-- ba1c2950e145e52c22f7a636f3406334f9c22c0d).
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase
--    SQL Editor). Definisi "current state" diambil PERSIS dari
--    supabase/schema_snapshot.sql (fresh, refresh pasca-merge 10 Agu 2026,
--    commit 7d0ff5f). Definisi "before" di blok ROLLBACK di bawah diambil
--    dari git log -p -- supabase/schema_snapshot.sql (bukan diasumsikan),
--    commit ba1c295 (roles_insert/roles_update) dan 87620fe (user_roles_insert/
--    update, migration 20260807000001 -- TD-170). JANGAN jalankan ulang.
--
-- KONTEKS: Fase 1 multi-entity plumbing (activeCompanyId di AuthContext.jsx)
--   butuh fungsi baru get_user_company_ids() -- versi JAMAK dari
--   get_user_company_id() yang cuma baca home company tunggal
--   (profiles.company_id). Dipakai sebagai bypass tambahan di RLS supaya
--   user yang genuinely multi-company (>1 baris user_roles aktif di company
--   berbeda) tidak tersaring keluar dari data company lain tempat dia juga
--   berperan -- lihat migration 20260809000004 untuk pemakaiannya di
--   companies_read_own/roles_read.
--
--   Statement 4-5 (roles_insert/roles_update) MENAMBAHKAN bypass
--   is_super_admin() top-level yang SEBELUMNYA TIDAK ADA SAMA SEKALI di
--   kedua policy ini -- diverifikasi via git log: dari commit pembuatan
--   awal (6382bf2, 17 Jun 2026) sampai tepat sebelum ba1c295, keduanya cuma
--   "company_id = get_user_company_id() AND is_admin_or_above()", TANPA
--   jalur super_admin sama sekali (super_admin pun terkunci home company
--   sendiri untuk insert/update roles).
--
--   Statement 6-7 (user_roles_insert/user_roles_update) MEMPERBAIKI bug
--   kelas SAMA dengan TD-170 (migration 20260807000001) -- fix TD-170
--   menaruh bypass is_super_admin() DI DALAM klausa AND ("... AND
--   (is_super_admin() OR NOT is_admin_tier_role(role_id))"), yang berarti
--   bahkan super_admin TETAP terkunci ke company_id = get_user_company_id()
--   miliknya sendiri -- ditemukan lewat audit akses sesi 9 Agu 2026
--   (super_admin ternyata tak bisa assign/ubah role user di company lain,
--   padahal UI UserEditPage tak membatasi dropdown company). Statement ini
--   memindahkan is_super_admin() jadi bypass TOP-LEVEL murni; klausa
--   is_admin_tier_role dari TD-170 tetap utuh, cuma posisinya yang berubah.
--
-- ISI:
--   Statement 1 -- CREATE FUNCTION get_user_company_ids().
--   Statement 2 -- COMMENT ON FUNCTION get_user_company_ids().
--   Statement 3 -- GRANT ALL ON FUNCTION get_user_company_ids() TO authenticated.
--   Statement 4 -- ALTER POLICY roles_insert (tambah bypass super_admin).
--   Statement 5 -- ALTER POLICY roles_update (tambah bypass super_admin).
--   Statement 6 -- ALTER POLICY user_roles_insert (pindah super_admin ke top-level).
--   Statement 7 -- ALTER POLICY user_roles_update (pindah super_admin ke top-level).
-- ============================================================================


-- STATEMENT 1: fungsi get_user_company_ids() -- versi jamak get_user_company_id()
CREATE FUNCTION public.get_user_company_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  SELECT DISTINCT company_id
  FROM user_roles
  WHERE user_id = auth.uid() AND is_active = true
$fn$;

-- STATEMENT 2: comment
COMMENT ON FUNCTION public.get_user_company_ids() IS
  'Returns every company_id where the authenticated user holds an active role (user_roles.is_active = true). Multi-company counterpart to get_user_company_id(), which returns only the home company (profiles.company_id) — keep using that one for policies that must stay single-value (e.g. user_login_logs).';

-- STATEMENT 3: grant
GRANT ALL ON FUNCTION public.get_user_company_ids() TO authenticated;

-- STATEMENT 4: roles_insert -- tambah bypass super_admin top-level (sebelumnya nol bypass)
ALTER POLICY roles_insert ON public.roles
  WITH CHECK (
    public.is_super_admin()
    OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above())
  );

-- STATEMENT 5: roles_update -- sama, USING + WITH CHECK
ALTER POLICY roles_update ON public.roles
  USING (
    public.is_super_admin()
    OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above())
  )
  WITH CHECK (
    public.is_super_admin()
    OR ((company_id = public.get_user_company_id()) AND public.is_admin_or_above())
  );

-- STATEMENT 6: user_roles_insert -- pindah is_super_admin() ke top-level (fix kelas TD-170)
ALTER POLICY user_roles_insert ON public.user_roles
  WITH CHECK (
    public.is_super_admin()
    OR (
      (company_id = public.get_user_company_id())
      AND public.is_admin_or_above()
      AND (NOT public.is_admin_tier_role(role_id))
    )
  );

-- STATEMENT 7: user_roles_update -- sama, USING + WITH CHECK
ALTER POLICY user_roles_update ON public.user_roles
  USING (
    public.is_super_admin()
    OR (
      (company_id = public.get_user_company_id())
      AND public.is_admin_or_above()
      AND (NOT public.is_admin_tier_role(role_id))
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      (company_id = public.get_user_company_id())
      AND public.is_admin_or_above()
      AND (NOT public.is_admin_tier_role(role_id))
    )
  );


-- ============================================================================
-- ROLLBACK (jalankan urutan terbalik, statement 7 -> 1). Definisi "before"
-- diverifikasi dari git log -p -G'roles_insert|roles_update' -- \
--   supabase/schema_snapshot.sql: commit ba1c2950e145e52c22f7a636f3406334f9c22c0d
--   (state roles_insert/roles_update sebelum ba1c295 = state asli sejak
--   commit pembuatan 6382bf24e8b6026c765b424d1fa00597b6afc9d7, 17 Jun 2026 --
--   tak pernah diubah di antaranya) dan commit
--   87620fe8b6097de95f7393bb1fd7bf42c707c8dc (state user_roles_insert/update
--   versi TD-170, migration 20260807000001, tepat sebelum ba1c295).
--
-- ⚠️ Jalankan rollback migration 20260809000004 (companies_read_own/
--    roles_read) LEBIH DULU kalau itu juga sudah live -- keduanya
--    referensi get_user_company_ids(), drop function di bawah akan
--    mem-break policy itu kalau urutan rollback kebalik.
--
-- -- Rollback statement 7 (user_roles_update -> versi TD-170, is_super_admin nested di AND)
-- ALTER POLICY user_roles_update ON public.user_roles
--   USING (
--     (company_id = public.get_user_company_id())
--     AND public.is_admin_or_above()
--     AND (public.is_super_admin() OR (NOT public.is_admin_tier_role(role_id)))
--   )
--   WITH CHECK (
--     (company_id = public.get_user_company_id())
--     AND public.is_admin_or_above()
--     AND (public.is_super_admin() OR (NOT public.is_admin_tier_role(role_id)))
--   );
--
-- -- Rollback statement 6 (user_roles_insert -> versi TD-170, is_super_admin nested di AND)
-- ALTER POLICY user_roles_insert ON public.user_roles
--   WITH CHECK (
--     (company_id = public.get_user_company_id())
--     AND public.is_admin_or_above()
--     AND (public.is_super_admin() OR (NOT public.is_admin_tier_role(role_id)))
--   );
--
-- -- Rollback statement 5 (roles_update -> nol bypass super_admin, state asli sejak 17 Jun 2026)
-- ALTER POLICY roles_update ON public.roles
--   USING ((company_id = public.get_user_company_id()) AND public.is_admin_or_above())
--   WITH CHECK ((company_id = public.get_user_company_id()) AND public.is_admin_or_above());
--
-- -- Rollback statement 4 (roles_insert -> nol bypass super_admin, state asli sejak 17 Jun 2026)
-- ALTER POLICY roles_insert ON public.roles
--   WITH CHECK ((company_id = public.get_user_company_id()) AND public.is_admin_or_above());
--
-- -- Rollback statement 1-3 (function + comment + grant)
-- DROP FUNCTION IF EXISTS public.get_user_company_ids();
-- ============================================================================
