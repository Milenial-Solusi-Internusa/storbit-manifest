-- 20260721000000_vendors_rls_overhaul.sql
-- Tanggal eksekusi manual: 2026-07-21.
--
-- FILE INI ADALAH REKAMAN. SQL di bawah SUDAH LIVE di database.
-- JANGAN jalankan ulang.
--
-- Menggantikan policy vendors dari 20260524000009_vendors_products_positions.sql
--
-- Alasan rombak:
--   1. vendors_select USING(true) tanpa TO -> bocor baca lintas entitas antar
--      user login. (anon tidak terdampak, tidak punya GRANT.)
--   2. vendors_insert WITH CHECK (auth.uid() IS NOT NULL) -> user login mana pun,
--      role apa pun, bisa insert vendor ke company mana pun.
--   3. vendors_update pakai role legacy procurement_head / procurement_staff (TD-47).
--   4. vendors_modify FOR ALL super-only, tumpang tindih dengan tiga di atas.

DROP POLICY IF EXISTS vendors_select ON public.vendors;
DROP POLICY IF EXISTS vendors_read   ON public.vendors;
DROP POLICY IF EXISTS vendors_insert ON public.vendors;
DROP POLICY IF EXISTS vendors_update ON public.vendors;
DROP POLICY IF EXISTS vendors_modify ON public.vendors;

CREATE POLICY vendors_select ON public.vendors
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND deleted_at IS NULL)
  );

CREATE POLICY vendors_insert ON public.vendors
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id()
        AND (is_manager_or_above() OR has_role('procurement')))
  );

CREATE POLICY vendors_update ON public.vendors
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND deleted_at IS NULL
        AND (is_manager_or_above() OR has_role('procurement')))
  )
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id()
        AND (is_manager_or_above() OR has_role('procurement')))
  );

CREATE POLICY vendors_delete ON public.vendors
  FOR DELETE TO authenticated
  USING (is_super_admin());
