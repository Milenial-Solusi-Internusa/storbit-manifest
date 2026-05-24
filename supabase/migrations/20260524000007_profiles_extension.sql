-- =============================================================================
-- Migration: 20260524000007_profiles_extension
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Additive extension of the existing profiles table to support
--            ERP business identity fields (company_id, branch_id,
--            department_id, position_id) alongside the existing UserManagement
--            UI columns. NO existing columns are dropped or renamed.
--            The legacy profiles.role (enum) and profiles.active (boolean)
--            columns MUST remain until Phase 1.0F is fully verified.
--            New columns are all nullable initially.
-- Depends:   20260524000001_companies, 20260524000002_branches_departments
--            20260524000005_roles_permissions
-- Run order: 7
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK NOTE — MANUAL REVIEW REQUIRED:
-- This migration is additive and uses ADD COLUMN IF NOT EXISTS.
-- Before running any rollback command, confirm the column was actually introduced
-- by this migration and did not exist before Phase 1.0B.
-- Do NOT run rollback in production without a metadata backup and explicit approval.
-- Suggested manual rollback commands, only after verification:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS mfa_required;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS last_login_at;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS position_id;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS department_id;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS branch_id;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS company_id;
-- DROP INDEX IF EXISTS idx_profiles_department_id;
-- DROP INDEX IF EXISTS idx_profiles_branch_id;
-- DROP INDEX IF EXISTS idx_profiles_company_id;
-- =============================================================================

-- =============================================================================
-- ADDITIVE COLUMNS: extend profiles to carry ERP business identity.
-- All new columns are nullable. company_id will be backfilled in Phase 1.0F.
-- Existing UserManagement UI reads profiles.id, profiles.full_name,
-- profiles.role, profiles.active — none of these are touched here.
-- =============================================================================

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS company_id     uuid    REFERENCES companies(id),
    ADD COLUMN IF NOT EXISTS branch_id      uuid    REFERENCES branches(id),
    ADD COLUMN IF NOT EXISTS department_id  uuid    REFERENCES departments(id),
    ADD COLUMN IF NOT EXISTS position_id    uuid,   -- FK to positions added when positions table exists (migration 9)
    ADD COLUMN IF NOT EXISTS last_login_at  timestamptz,
    ADD COLUMN IF NOT EXISTS mfa_required   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.company_id    IS 'ERP business entity this user belongs to. NULL until Phase 1.0F migration assigns company_id.';
COMMENT ON COLUMN profiles.branch_id     IS 'Branch assignment. Optional. NULL = no branch restriction.';
COMMENT ON COLUMN profiles.department_id IS 'Department assignment. Optional. NULL = no department restriction.';
COMMENT ON COLUMN profiles.position_id   IS 'Job position. Nullable FK to positions (added in migration 9). NULL = no position assigned.';
COMMENT ON COLUMN profiles.last_login_at IS 'Timestamp of most recent successful login. Updated by auth trigger or application layer.';
COMMENT ON COLUMN profiles.mfa_required  IS 'True = MFA is mandatory for this user. Enforced by auth policy. Default false; set true for finance_controller, bod, admin, super_admin.';

-- =============================================================================
-- INDEXES: only on nullable FK columns; partial where sensible
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_company_id
    ON profiles (company_id) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch_id
    ON profiles (branch_id) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
    ON profiles (department_id) WHERE department_id IS NOT NULL;

-- =============================================================================
-- NOTES ON PHASE 1.0F MIGRATION:
-- When Phase 1.0F runs:
--   1. UPDATE profiles SET company_id = <SBI_uuid> WHERE company_id IS NULL;
--   2. Alter company_id to NOT NULL after backfill.
--   3. Insert into user_roles: map profiles.role enum to new role codes:
--        super       → super_admin
--        logistic    → operations_staff
--        procurement → procurement_staff
--        finance     → finance_staff
--        management  → viewer
--   4. Set mfa_required = true for users with super_admin/admin/finance_controller/bod
--   5. Only AFTER user_roles is verified: drop legacy profiles.role and profiles.active
--      (deferred to Phase 1.0F completion — DO NOT drop here).
-- =============================================================================

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'profiles'
-- ORDER BY ordinal_position;
-- Expected: existing columns unchanged + 6 new nullable columns visible
--
-- SELECT COUNT(*) FROM profiles WHERE company_id IS NULL;
-- Expected: equals total profiles count (all null until 1.0F backfill)
-- =============================================================================
