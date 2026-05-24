-- =============================================================================
-- Migration: 20260524000015_profiles_customers_rls_transition
-- Phase:     1.0F — Profiles & Customers RLS Transition
-- Purpose:   Backfill company_id on legacy tables (profiles, customers),
--            then enable RLS on those tables.
--            This completes the RLS coverage deferred from migration 014.
-- Depends:   20260524000014_rls_policy_draft (helper functions must exist)
-- Run order: 15
-- Status:    DRAFT — do NOT execute without explicit approval
--            See docs/operations/profiles-customers-rls-transition.md for
--            full rationale, pre-execution checklist, and verification queries.
-- =============================================================================

-- =============================================================================
-- CRITICAL WARNING — READ BEFORE EXECUTING
-- =============================================================================
--
-- This migration must be executed in STAGES. Do NOT run it as a single
-- transaction against a live database. Follow the staged checklist in:
--   docs/operations/profiles-customers-rls-transition.md
--
-- Stage 1: Run STEP 1A + STEP 2A (backfill — safe, additive)
--          Verify: all rows have non-NULL company_id before proceeding
--
-- Stage 2: Run STEP 1B + STEP 2B (NOT NULL constraints — breaks if NULLs remain)
--          Verify: constraint in place, no regressions
--
-- Stage 3: Uncomment and run STEP 3A + STEP 3B (RLS enable + policies)
--          Verify: smoke test login, Customer page, UserManagement page
--
-- Do NOT skip stages. Enabling RLS before backfill is complete will
-- immediately lock out ALL users from the Customer page and UserManagement.
--
-- ROLLBACK (full, in reverse order):
--   ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE profiles  DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "customers_update" ON customers;
--   DROP POLICY IF EXISTS "customers_insert" ON customers;
--   DROP POLICY IF EXISTS "customers_read"   ON customers;
--   DROP POLICY IF EXISTS "profiles_update"  ON profiles;
--   DROP POLICY IF EXISTS "profiles_read"    ON profiles;
--   ALTER TABLE customers ALTER COLUMN company_id DROP NOT NULL;
--   ALTER TABLE profiles  ALTER COLUMN company_id DROP NOT NULL;
--   UPDATE customers SET company_id = NULL;   -- only if you need to re-run
--   UPDATE profiles  SET company_id = NULL;   -- only if you need to re-run
-- =============================================================================


-- =============================================================================
-- PRE-EXECUTION CHECKS
-- Run these queries BEFORE executing any step of this migration.
-- Expected results are noted per query.
-- =============================================================================

-- CHECK 1: Migrations 000–014 must all be applied.
-- Verify by confirming the following tables exist and have data:
--   SELECT COUNT(*) FROM companies;        -- Expected: 3
--   SELECT COUNT(*) FROM profiles;         -- Expected: >= 1
--   SELECT COUNT(*) FROM customers;        -- Expected: >= 0
--   SELECT COUNT(*) FROM roles;            -- Expected: >= 36
--   SELECT COUNT(*) FROM permissions;      -- Expected: >= 92

-- CHECK 2: Helper functions from migration 014 must exist.
--   SELECT proname FROM pg_proc
--   WHERE proname IN (
--     'get_user_company_id','is_super_admin','is_admin_or_above',
--     'has_role','has_permission'
--   );
--   Expected: 5 rows

-- CHECK 3: Current NULL count in profiles (should be non-zero before backfill).
--   SELECT COUNT(*) FROM profiles WHERE company_id IS NULL;
--   Expected: equals total profiles count (all NULL before this migration)

-- CHECK 4: Current NULL count in customers (should be non-zero before backfill).
--   SELECT COUNT(*) FROM customers WHERE company_id IS NULL;
--   Expected: equals total customers count (all NULL before this migration)

-- CHECK 5: Confirm company codes are present.
--   SELECT code, name FROM companies ORDER BY code;
--   Expected rows: JCI, MSI, SBI

-- CHECK 6: Review profile rows before deciding the backfill assignment.
--   SELECT id, full_name, role, company_id FROM profiles ORDER BY full_name;
--   Use this to decide Option A vs Option B in STEP 1A below.


-- =============================================================================
-- STEP 1A: Backfill profiles.company_id
-- =============================================================================
--
-- DECISION REQUIRED: Review each profile row before choosing an option.
-- See CHECK 6 above.
--
-- Background:
--   Migration 007 note suggested: "UPDATE profiles SET company_id = <SBI_uuid>"
--   assuming all legacy Storbit Manifest users belong to SBI (General Trading).
--
--   CONFLICT: The first super admin provisioned in staging
--   (den.itnetwork@exportimportdept.com) was assigned company=MSI, NOT SBI.
--   A blanket SBI assignment would set this user to the wrong company.
--
-- Choose ONE of the two options below. Do NOT run both.
--
-- ----------------------------------------------------------------------------
-- Option A: ALL profiles → SBI (original Storbit app entity)
--           Use only if ALL legacy users are confirmed SBI staff.
--           Manually correct any MSI/JCI admin accounts afterward.
--
-- UPDATE profiles
-- SET company_id = (SELECT id FROM companies WHERE code = 'SBI')
-- WHERE company_id IS NULL;
--
-- ----------------------------------------------------------------------------
-- Option B: Assign each user to their correct company (RECOMMENDED).
--           Identify each profile's intended company, then run per-company
--           batches. Remaining unknown rows default to SBI.
--
-- Example — assign known MSI admins:
-- UPDATE profiles
-- SET    company_id = (SELECT id FROM companies WHERE code = 'MSI')
-- WHERE  id IN (
--          -- Replace these placeholder UUIDs with actual profile IDs
--          -- from: SELECT id, full_name FROM profiles WHERE role = 'super';
--          '<msi_super_admin_uuid_1>'
--        )
--   AND  company_id IS NULL;
--
-- Example — assign remaining rows to SBI as default:
-- UPDATE profiles
-- SET    company_id = (SELECT id FROM companies WHERE code = 'SBI')
-- WHERE  company_id IS NULL;
--
-- ----------------------------------------------------------------------------
-- POST-STEP 1A VERIFICATION (run after whichever option you chose):
--   SELECT company_id, COUNT(*) FROM profiles GROUP BY company_id;
--   Expected: 0 rows with NULL company_id
--
--   SELECT c.code, COUNT(p.id) AS user_count
--   FROM   profiles p JOIN companies c ON p.company_id = c.id
--   GROUP  BY c.code ORDER BY c.code;
--   Review: confirm user counts make business sense per company.
-- =============================================================================


-- =============================================================================
-- STEP 2A: Backfill customers.company_id
-- =============================================================================
--
-- Customers are Storbit Manifest operational data from SBI (General Trading).
-- This is consistent with migration 008 note and the original app context.
-- If your staging/production customer list includes customers from other
-- entities, adjust accordingly before running.
--
-- Run this after STEP 1A is verified.

UPDATE customers
SET    company_id = (SELECT id FROM companies WHERE code = 'SBI')
WHERE  company_id IS NULL;

-- POST-STEP 2A VERIFICATION:
--   SELECT COUNT(*) FROM customers WHERE company_id IS NULL;
--   Expected: 0
--
--   SELECT c.code, COUNT(cu.id) AS customer_count
--   FROM   customers cu JOIN companies c ON cu.company_id = c.id
--   GROUP  BY c.code;
--   Expected: all customers under SBI (or your chosen distribution)
-- =============================================================================


-- =============================================================================
-- STEP 1B: Add NOT NULL constraint to profiles.company_id
-- =============================================================================
--
-- WARNING: Run this ONLY after STEP 1A is verified (no NULLs remain).
-- Pre-condition: SELECT COUNT(*) FROM profiles WHERE company_id IS NULL = 0
--
-- ALTER TABLE profiles
--     ALTER COLUMN company_id SET NOT NULL;
--
-- POST-STEP 1B VERIFICATION:
--   \d profiles
--   Confirm: company_id column shows "not null"
--
--   INSERT INTO profiles (id, full_name, role)
--   VALUES (gen_random_uuid(), 'Test', 'logistic');
--   Expected: ERROR — violates not-null constraint (company_id)
-- =============================================================================


-- =============================================================================
-- STEP 2B: Add NOT NULL constraint to customers.company_id
-- =============================================================================
--
-- WARNING: Run this ONLY after STEP 2A is verified (no NULLs remain).
-- Pre-condition: SELECT COUNT(*) FROM customers WHERE company_id IS NULL = 0
--
-- Also add the unique constraint on (company_id, code) as noted in migration 008.
-- Note: customers may not yet have unique codes assigned; skip the unique
-- constraint if customers.code is still NULL or non-unique.
--
-- ALTER TABLE customers
--     ALTER COLUMN company_id SET NOT NULL;
--
-- Optional (only after codes are assigned and verified unique per company):
-- ALTER TABLE customers
--     ADD CONSTRAINT customers_company_code_unique
--     UNIQUE (company_id, code);
--
-- POST-STEP 2B VERIFICATION:
--   \d customers
--   Confirm: company_id column shows "not null"
-- =============================================================================


-- =============================================================================
-- STEP 3A: Enable RLS on profiles
-- =============================================================================
--
-- WARNING: DO NOT uncomment and run until:
--   [ ] STEP 1A complete — company_id backfilled for all profiles
--   [ ] STEP 1B complete — company_id is NOT NULL
--   [ ] Login smoke test passed after backfill (before enabling RLS)
--   [ ] UserManagement smoke test passed
--   [ ] get_user_company_id() returns correct value for your test user
--       SELECT get_user_company_id();  -- run as authenticated test user
--
-- Pre-condition: COUNT(*) FROM profiles WHERE company_id IS NULL = 0
--
-- Policies are sourced from migration 014 Section 5B.
-- No INSERT policy — handled by Supabase Auth trigger (on_auth_user_created).
-- No DELETE policy — profiles are deactivated (active = false), never deleted.
--
-- Note: migration 014 Section 5B comment says "soft delete via is_active = false
-- + deleted_at" but profiles.is_active does not exist — profiles uses the legacy
-- `active` boolean column. The intent is active = false deactivation only.

/*  ── PHASE 1.0F STAGE 3: Uncomment and apply after verifying STEPS 1A + 1B ──

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read"   ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_read"
ON profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()                               -- always see own profile
  OR (
    company_id = get_user_company_id()          -- admin sees all in same company
    AND is_admin_or_above()
  )
  OR is_super_admin()                           -- super admin sees all companies
);

CREATE POLICY "profiles_update"
ON profiles FOR UPDATE
TO authenticated
USING (
  id = auth.uid()                               -- can update own profile
  OR (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  OR is_super_admin()
)
WITH CHECK (
  id = auth.uid()
  OR (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  OR is_super_admin()
);

-- No INSERT: handled by Supabase Auth trigger (on_auth_user_created)
-- No DELETE: deactivate via UPDATE active = false, never hard-delete profiles

────────────────────────────────────────────────────────────────────────────── */


-- =============================================================================
-- STEP 3B: Enable RLS on customers
-- =============================================================================
--
-- WARNING: DO NOT uncomment and run until:
--   [ ] STEP 2A complete — company_id backfilled for all customers
--   [ ] STEP 2B complete — company_id is NOT NULL
--   [ ] Customer page smoke test passed after backfill (before enabling RLS)
--   [ ] get_user_company_id() returns correct value for your test user
--       (same test as STEP 3A — one smoke test covers both)
--
-- Pre-condition: COUNT(*) FROM customers WHERE company_id IS NULL = 0
--
-- Policies are sourced from migration 014 Section 6B.
-- No DELETE policy — soft delete via UPDATE deleted_at. Hard DELETE via db.js
-- deleteCustomer() will be blocked by RLS once enabled; that function should be
-- migrated to soft-delete in a follow-up Phase 1.0F task.
--
-- IMPORTANT: listCustomers() in src/lib/db.js currently uses SELECT *
-- and has no company_id filter. After enabling customers RLS, the RLS
-- policy itself enforces company scoping. The SELECT * is safe post-RLS
-- because only company-matching rows will be returned. However, migrating
-- listCustomers() to select specific columns is recommended in Phase 1.0G
-- (refactor task, separate branch).

/*  ── PHASE 1.0F STAGE 3: Uncomment and apply after verifying STEPS 2A + 2B ──

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_read"   ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;

CREATE POLICY "customers_read"
ON customers FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "customers_insert"
ON customers FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    is_admin_or_above()
    OR has_role('sales_head')
    OR has_role('sales_staff')
  )
);

CREATE POLICY "customers_update"
ON customers FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
)
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    is_admin_or_above()
    OR has_role('sales_head')
    OR has_role('sales_staff')
    OR has_role('finance_controller')    -- for credit_limit updates
  )
);

-- No DELETE policy: soft delete via UPDATE deleted_at = now()
-- Note: src/lib/db.js deleteCustomer() currently hard-deletes (DELETE FROM).
-- This will fail after RLS is enabled with no DELETE policy.
-- Migrate deleteCustomer() to soft-delete before or immediately after Stage 3.

────────────────────────────────────────────────────────────────────────────── */


-- =============================================================================
-- POST-ACTIVATION SMOKE TESTS
-- Run these after STEP 3A and STEP 3B are applied.
-- =============================================================================

-- SMOKE TEST 1: Login as super admin (den.itnetwork@exportimportdept.com)
--   Expected: login succeeds, dashboard loads, no JS errors
--
-- SMOKE TEST 2: Navigate to User Management (legacy page)
--   Expected: profile list loads with at least 1 row (own profile)
--
-- SMOKE TEST 3: Navigate to Customer page
--   Expected: customer list loads (SBI-scoped customers visible)
--
-- SMOKE TEST 4: Open browser console after each test
--   Expected: no "permission denied for table" Supabase errors
--
-- SMOKE TEST 5: Login as a non-super user (create a test SBI user if needed)
--   Expected:
--     - Can see own profile only in User Management (unless admin)
--     - Can see SBI customers only
--     - Cannot see MSI or JCI customers
--
-- SMOKE TEST 6: Admin UI → Companies tab
--   Expected: AdminShell loads, Companies tab shows company list
--             (companies RLS already active from migration 014)


-- =============================================================================
-- GRANTS
-- =============================================================================
--
-- The `authenticated` role already has SELECT/INSERT/UPDATE grants on profiles
-- and customers from migration 000 (legacy baseline). No new grants needed here.
-- RLS policies will restrict row-level access on top of the existing grants.
--
-- Verify grants if needed:
--   SELECT grantee, table_name, privilege_type
--   FROM   information_schema.role_table_grants
--   WHERE  table_name IN ('profiles', 'customers')
--     AND  grantee = 'authenticated';


-- =============================================================================
-- END OF MIGRATION 015
-- Status: DRAFT — AWAITING STAGED EXECUTION APPROVAL
-- Next: docs/operations/profiles-customers-rls-transition.md
-- =============================================================================
