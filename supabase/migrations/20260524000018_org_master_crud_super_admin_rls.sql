-- ============================================================
-- Migration: 20260524000018_org_master_crud_super_admin_rls.sql
-- Phase:     1.0I — Admin CRUD Foundation
-- Purpose:   Allow is_super_admin() to INSERT/UPDATE org master
--            data across companies while is_admin_or_above()
--            remains scoped to their own company_id.
-- Depends:   20260524000014_rls_policy_draft.sql
--            (defines is_super_admin, is_admin_or_above, get_user_company_id)
-- Affects:   public.branches, public.departments, public.positions
--            INSERT + UPDATE policies only — SELECT/DELETE unchanged
-- Run order: Apply after 014; safe to re-run (idempotent)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- BRANCHES
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "branches_insert" ON public.branches;
CREATE POLICY "branches_insert"
ON public.branches FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
);

DROP POLICY IF EXISTS "branches_update" ON public.branches;
CREATE POLICY "branches_update"
ON public.branches FOR UPDATE
USING (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
);

-- ──────────────────────────────────────────────────────────────
-- DEPARTMENTS
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "departments_insert" ON public.departments;
CREATE POLICY "departments_insert"
ON public.departments FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
);

DROP POLICY IF EXISTS "departments_update" ON public.departments;
CREATE POLICY "departments_update"
ON public.departments FOR UPDATE
USING (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
);

-- ──────────────────────────────────────────────────────────────
-- POSITIONS
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "positions_insert" ON public.positions;
CREATE POLICY "positions_insert"
ON public.positions FOR INSERT
WITH CHECK (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
);

DROP POLICY IF EXISTS "positions_update" ON public.positions;
CREATE POLICY "positions_update"
ON public.positions FOR UPDATE
USING (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    public.is_admin_or_above()
    AND company_id = public.get_user_company_id()
  )
);

-- ============================================================
-- ROLLBACK (run manually if needed — do not run automatically)
-- ============================================================
--
-- DROP POLICY IF EXISTS "branches_insert"    ON public.branches;
-- CREATE POLICY "branches_insert"
-- ON public.branches FOR INSERT
-- WITH CHECK (company_id = public.get_user_company_id() AND public.is_admin_or_above());
--
-- DROP POLICY IF EXISTS "branches_update"    ON public.branches;
-- CREATE POLICY "branches_update"
-- ON public.branches FOR UPDATE
-- USING    (company_id = public.get_user_company_id() AND public.is_admin_or_above())
-- WITH CHECK (company_id = public.get_user_company_id() AND public.is_admin_or_above());
--
-- DROP POLICY IF EXISTS "departments_insert" ON public.departments;
-- CREATE POLICY "departments_insert"
-- ON public.departments FOR INSERT
-- WITH CHECK (company_id = public.get_user_company_id() AND public.is_admin_or_above());
--
-- DROP POLICY IF EXISTS "departments_update" ON public.departments;
-- CREATE POLICY "departments_update"
-- ON public.departments FOR UPDATE
-- USING    (company_id = public.get_user_company_id() AND public.is_admin_or_above())
-- WITH CHECK (company_id = public.get_user_company_id() AND public.is_admin_or_above());
--
-- DROP POLICY IF EXISTS "positions_insert"   ON public.positions;
-- CREATE POLICY "positions_insert"
-- ON public.positions FOR INSERT
-- WITH CHECK (company_id = public.get_user_company_id() AND public.is_admin_or_above());
--
-- DROP POLICY IF EXISTS "positions_update"   ON public.positions;
-- CREATE POLICY "positions_update"
-- ON public.positions FOR UPDATE
-- USING    (company_id = public.get_user_company_id() AND public.is_admin_or_above())
-- WITH CHECK (company_id = public.get_user_company_id() AND public.is_admin_or_above());
--
-- ============================================================
-- VERIFICATION QUERIES (run after applying — check in Supabase SQL editor)
-- ============================================================
--
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('branches', 'departments', 'positions')
--   AND cmd IN ('INSERT', 'UPDATE')
-- ORDER BY tablename, cmd;
--
-- Expected: each INSERT/UPDATE policy contains 'is_super_admin' in qual/with_check.
-- ============================================================
