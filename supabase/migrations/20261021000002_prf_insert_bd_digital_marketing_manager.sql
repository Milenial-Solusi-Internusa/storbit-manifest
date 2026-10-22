-- =============================================================================
-- 20261021000002_prf_insert_bd_digital_marketing_manager.sql
--
-- Membalik keputusan #3 (12 Sep 2026, migrasi 20260912000006) secara SADAR:
-- bd_digital_marketing_manager (Faris, level 4, MSI) kini boleh membuat PRF.
--
-- Keputusan lama yang dibalik: `is_sales_functional()` (20260912000006)
-- sengaja mengecualikan bd_digital_marketing_spv dari daftar role penjual
-- ("DM dan legacy 'sales' sengaja tidak dimasukkan" -- COMMENT ON FUNCTION
-- is_sales_functional()); checklist tes manual migrasi yang sama mencatat
-- hasil "Faris (bd_digital_marketing_spv): TIDAK bisa membuat PRF/SO --
-- by design (keputusan #3), bukan kegagalan." Migrasi
-- 20261016000002_bd_digital_marketing_manager_role.sql (16 Okt 2026) ikut
-- menegaskan ulang: role barunya "TIDAK termasuk BD_SALES_ROLES/
-- is_sales_functional/PRF creator/SALES_ONLY_ROLES -- sama seperti
-- bd_digital_marketing_spv."
--
-- Keputusan Den/Mas 21 Okt 2026: Faris kini Business Process Owner modul
-- CRM -- perannya berubah, dan ia butuh membuat PRF. `is_sales_functional()`
-- itu sendiri TIDAK diubah (role ini tetap di luar definisinya) --
-- penambahan dilakukan via `has_role()` eksplisit, pola yang SAMA dengan
-- `gm_bd` yang sudah ada di policy ini.
--
-- `sales_orders_insert` (migrasi yang sama, 20260912000006) SENGAJA TIDAK
-- disentuh -- keputusan terpisah, di luar scope hotfix ini. Faris bisa
-- membuat PRF tapi belum Sales Order.
--
-- Status: SUDAH DIJALANKAN MANUAL DI PRODUCTION 21 Okt 2026 (SQL Editor,
-- Mas). Staging menyusul.
-- =============================================================================

BEGIN;

-- Policy SEBELUM (schema_snapshot.sql:19797, migrasi asal 20260912000006):
--   CREATE POLICY prf_insert ON public.prf FOR INSERT WITH CHECK (
--     is_super_admin() OR (
--       company_id IN (SELECT get_user_company_ids())
--       AND created_by = auth.uid()
--       AND (is_sales_functional() OR has_role('gm_bd'::text))
--     )
--   );
DROP POLICY prf_insert ON public.prf;

CREATE POLICY prf_insert ON public.prf FOR INSERT WITH CHECK (
  is_super_admin() OR (
    company_id IN (SELECT get_user_company_ids())
    AND created_by = auth.uid()
    AND (is_sales_functional() OR has_role('gm_bd'::text) OR has_role('bd_digital_marketing_manager'::text))
  )
);

COMMIT;

-- =============================================================================
-- VERIFIKASI (jalankan terpisah sesudah commit):
--
-- SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
--   WHERE polname = 'prf_insert' AND polrelid = 'public.prf'::regclass;
-- -- Harap memuat has_role('bd_digital_marketing_manager'::text).
--
-- SELECT count(*) FROM public.prf
--   WHERE created_by = (SELECT id FROM public.profiles WHERE email = 'faris.el@exportimportdept.com');
-- -- Baseline sebelum rilis FE -- bandingkan lagi sesudah Faris mulai memakai PRF.
--
-- =============================================================================
-- ROLLBACK:
--
-- DROP POLICY prf_insert ON public.prf;
-- CREATE POLICY prf_insert ON public.prf FOR INSERT WITH CHECK (
--   is_super_admin() OR (
--     company_id IN (SELECT get_user_company_ids())
--     AND created_by = auth.uid()
--     AND (is_sales_functional() OR has_role('gm_bd'::text))
--   )
-- );
-- =============================================================================
