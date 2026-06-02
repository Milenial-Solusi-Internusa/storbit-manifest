-- ============================================================
-- Migration: 20260524000019_org_master_super_admin_read_bypass.sql
-- Phase:     1.0I — Admin CRUD Foundation
-- Purpose:   Allow is_super_admin() to SELECT org master rows
--            across all companies.
--            Without this, insert(...).select().single() fails
--            after a cross-company INSERT because the old SELECT
--            policy gates on company_id = get_user_company_id(),
--            which excludes the newly inserted row from read-back.
-- Depends:   20260524000014_rls_policy_draft.sql  (original policies)
--            20260524000018_org_master_crud_super_admin_rls.sql (write bypass)
-- Affects:   public.branches, public.departments, public.positions
--            SELECT policies only — INSERT/UPDATE/DELETE unchanged
-- Run order: Apply after 018; safe to re-run (idempotent)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- BRANCHES
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "branches_read" ON public.branches;
CREATE POLICY "branches_read"
ON public.branches FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id = public.get_user_company_id()
    AND deleted_at IS NULL
  )
);

-- ──────────────────────────────────────────────────────────────
-- DEPARTMENTS
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "departments_read" ON public.departments;
CREATE POLICY "departments_read"
ON public.departments FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id = public.get_user_company_id()
    AND deleted_at IS NULL
  )
);

-- ──────────────────────────────────────────────────────────────
-- POSITIONS
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "positions_read" ON public.positions;
CREATE POLICY "positions_read"
ON public.positions FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    company_id = public.get_user_company_id()
    AND deleted_at IS NULL
  )
);

-- ============================================================
-- ROLLBACK (run manually if needed — do not run automatically)
-- ============================================================
--
-- DROP POLICY IF EXISTS "branches_read" ON public.branches;
-- CREATE POLICY "branches_read"
-- ON public.branches FOR SELECT
-- TO authenticated
-- USING (
--   company_id = public.get_user_company_id()
--   AND (deleted_at IS NULL OR public.is_super_admin())
-- );
--
-- DROP POLICY IF EXISTS "departments_read" ON public.departments;
-- CREATE POLICY "departments_read"
-- ON public.departments FOR SELECT
-- TO authenticated
-- USING (
--   company_id = public.get_user_company_id()
--   AND (deleted_at IS NULL OR public.is_super_admin())
-- );
--
-- DROP POLICY IF EXISTS "positions_read" ON public.positions;
-- CREATE POLICY "positions_read"
-- ON public.positions FOR SELECT
-- TO authenticated
-- USING (
--   company_id = public.get_user_company_id()
--   AND (deleted_at IS NULL OR public.is_super_admin())
-- );
--
-- ============================================================
-- VERIFICATION QUERIES (run after applying in Supabase SQL editor)
-- ============================================================
--
-- 1. Confirm SELECT policies updated:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('branches', 'departments', 'positions')
--   AND cmd = 'SELECT'
-- ORDER BY tablename;
-- Expected: qual contains 'is_super_admin' at the top level (OR condition),
--           not nested inside the company_id = get_user_company_id() block.
--
-- 2. Functional test as MSI super admin — insert and read back a JCI branch:
-- INSERT INTO branches (company_id, code, name, is_active, created_by)
-- VALUES ('<jci_company_uuid>', 'TEST-SA', 'SA Cross Test', true, auth.uid())
-- RETURNING *;
-- Expected: row returned immediately (read-back succeeds via SELECT policy).
-- DELETE FROM branches WHERE code = 'TEST-SA'; -- cleanup after test
-- ============================================================
