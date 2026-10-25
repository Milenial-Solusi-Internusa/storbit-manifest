-- =============================================================================
-- Migration: 20261026000003_locations_super_admin_only_write
-- Inquiry Management Putaran 5 K1c -- Audit K1a: locations_insert/
-- locations_update mengizinkan Manager-ke-atas GLOBAL (nol pembedaan
-- entitas -- mockup rule 108 "A Manager or above adds and edits locations",
-- diterapkan 20261023000001_crm_locations_master.sql). Keputusan Den
-- (Entri 031 butir 7, direvisi dari rule 108): tulis Location Master
-- dipersempit ke super_admin SAJA.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- ⛔ BERKAS INI TIDAK MEMUAT DROP -- memakai ALTER POLICY, BOLEH dijalankan
-- Vir lewat connector.
--
-- ISI -- is_super_admin() OR is_manager_or_above() menjadi HANYA
-- is_super_admin() pada KEDUA policy. locations_select (FOR SELECT, USING
-- true) TIDAK disentuh -- baca tetap terbuka untuk semua authenticated,
-- hanya tulis yang dipersempit. Nol policy DELETE (tetap, mockup
-- "no Delete, only Deactivate" -- di luar scope perubahan ini).
-- =============================================================================

BEGIN;

ALTER POLICY locations_insert ON public.locations
  WITH CHECK (public.is_super_admin());

ALTER POLICY locations_update ON public.locations
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Kedua policy sekarang HANYA is_super_admin(), nol is_manager_or_above():
-- SELECT polname,
--        pg_get_expr(polqual,      polrelid) AS using_expr,
--        pg_get_expr(polwithcheck, polrelid) AS with_check_expr
-- FROM pg_policy
-- WHERE polrelid = 'public.locations'::regclass AND polname IN ('locations_insert','locations_update')
-- ORDER BY polname;
--   HARAP: keduanya PERSIS "is_super_admin()", nol "is_manager_or_above" tersisa.
--
-- 2) locations_select tidak tersentuh:
-- SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
--  WHERE polrelid='public.locations'::regclass AND polname='locations_select';
--   HARAP: tetap "true", byte-identik sebelum migrasi ini.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (mengembalikan ke Manager-ke-atas GLOBAL, verbatim
-- 20261023000001):
--
--   BEGIN;
--   ALTER POLICY locations_insert ON public.locations
--     WITH CHECK (public.is_super_admin() OR public.is_manager_or_above());
--   ALTER POLICY locations_update ON public.locations
--     USING (public.is_super_admin() OR public.is_manager_or_above())
--     WITH CHECK (public.is_super_admin() OR public.is_manager_or_above());
--   COMMIT;
-- =============================================================================
