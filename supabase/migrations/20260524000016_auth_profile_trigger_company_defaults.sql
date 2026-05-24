-- =============================================================================
-- Migration: 20260524000016_auth_profile_trigger_company_defaults
-- Phase:     1.0F follow-up — Auth trigger company defaults
-- Purpose:   Patch public.handle_new_user() so new Auth users can be created
--            safely after profiles.company_id became NOT NULL in Phase 1.0F.
--
-- Root cause:
--   Migration 000 defined handle_new_user() inserting only:
--     (id, full_name, role, active)
--   After Phase 1.0F set profiles.company_id NOT NULL, every new Auth user
--   creation fails with:
--     "Database error creating new user"
--   because the trigger INSERT violates the NOT NULL constraint on company_id.
--
-- Fix:
--   Replace handle_new_user() with a version that reads optional metadata from
--   NEW.raw_user_meta_data and resolves company_id, branch_id, department_id
--   from the companies/branches/departments tables before inserting.
--
-- Defaults when metadata is absent:
--   company_code   = 'MSI'      (can override via raw_user_meta_data)
--   branch_code    = 'HO'       (can override via raw_user_meta_data)
--   department_code = 'IT'      (can override via raw_user_meta_data)
--   role           = 'logistic' (first super admin must be set manually)
--   active         = true
--   mfa_required   = false
--
-- Trigger is NOT recreated: CREATE OR REPLACE FUNCTION replaces the function
-- body in-place. The existing on_auth_user_created trigger continues to fire
-- the same function name and will use the new body automatically.
--
-- Depends:   Migration 000 (profiles table + trigger),
--            Migration 001 (companies table),
--            Migration 002 (branches, departments tables),
--            Migration 007 (company_id, branch_id, department_id, mfa_required
--                           columns on profiles)
-- Run order: 16 — must run AFTER Phase 1.0F execution (migration 015)
-- Status:    DRAFT — do NOT execute without explicit approval
--            Apply in Supabase SQL editor after code review.
-- =============================================================================

-- ROLLBACK:
-- The previous function body is in migration 000. To roll back, re-run the
-- handle_new_user() definition from migration 000:
--
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- AS $$
-- BEGIN
--     INSERT INTO public.profiles (id, full_name, role, active)
--     VALUES (
--         NEW.id,
--         COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
--         'logistic',
--         true
--     )
--     ON CONFLICT (id) DO NOTHING;
--     RETURN NEW;
-- END;
-- $$;
--
-- NOTE: Rolling back will break Auth user creation again while profiles.company_id
-- is NOT NULL. A rollback here implies also rolling back the NOT NULL constraint
-- (migration 015 Stage 2). Do not roll back this migration in isolation.
-- =============================================================================


-- =============================================================================
-- PRE-EXECUTION CHECKS
-- Run these before applying. All must pass.
-- =============================================================================

-- CHECK 1: Migration 015 (Phase 1.0F) must already be applied.
--   SELECT column_name, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name = 'company_id';
--   Expected: is_nullable = 'NO' (NOT NULL constraint in place)

-- CHECK 2: Confirm company codes match the defaults used in this migration.
--   SELECT code FROM companies ORDER BY code;
--   Expected: includes 'MSI', 'JCI', 'SBI'

-- CHECK 3: Confirm HO branch and IT department exist for MSI.
--   SELECT b.code AS branch, d.code AS dept
--   FROM branches b, departments d, companies c
--   WHERE b.company_id = c.id AND d.company_id = c.id
--     AND c.code = 'MSI' AND b.code = 'HO' AND d.code = 'IT';
--   Expected: 1 row

-- CHECK 4: Confirm current (broken) function body does not include company_id.
--   SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
--   Expected: INSERT without company_id (confirms this migration is needed)

-- CHECK 5: Confirm trigger still exists before replacing function.
--   SELECT trigger_name, event_manipulation, action_statement
--   FROM information_schema.triggers
--   WHERE trigger_name = 'on_auth_user_created';
--   Expected: 1 row pointing to handle_new_user


-- =============================================================================
-- PATCHED FUNCTION: handle_new_user()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name       text;
    v_company_code    text;
    v_branch_code     text;
    v_department_code text;
    v_company_id      uuid;
    v_branch_id       uuid;
    v_department_id   uuid;
BEGIN
    -- -------------------------------------------------------------------------
    -- Step 1: Read metadata with safe defaults.
    -- Supabase Dashboard "Add user" does not pass raw_user_meta_data by default.
    -- All COALESCE defaults ensure a valid profile row can always be created.
    -- Callers can override by passing metadata, e.g. via the Supabase Admin API:
    --   { "data": { "company_code": "SBI", "branch_code": "HO",
    --               "department_code": "SLS", "full_name": "Jane Doe" } }
    -- -------------------------------------------------------------------------
    v_full_name       := COALESCE(NEW.raw_user_meta_data->>'full_name',       '');
    v_company_code    := COALESCE(NEW.raw_user_meta_data->>'company_code',    'MSI');
    v_branch_code     := COALESCE(NEW.raw_user_meta_data->>'branch_code',     'HO');
    v_department_code := COALESCE(NEW.raw_user_meta_data->>'department_code', 'IT');

    -- -------------------------------------------------------------------------
    -- Step 2: Resolve company_id — REQUIRED.
    -- Raises a clear exception if the company code is invalid or missing.
    -- This prevents silent profile creation with a NULL company_id,
    -- which would violate the NOT NULL constraint and obscure the root cause.
    -- -------------------------------------------------------------------------
    SELECT id
      INTO v_company_id
      FROM public.companies
     WHERE code = v_company_code;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION
            'handle_new_user: company not found for code "%". '
            'Ensure the company exists in public.companies before creating '
            'auth users for that entity. Valid codes: MSI, JCI, SBI.',
            v_company_code;
    END IF;

    -- -------------------------------------------------------------------------
    -- Step 3: Resolve branch_id — optional.
    -- NULL if the branch_code is not found for this company.
    -- Does not raise an exception — branch is not required for profile creation.
    -- -------------------------------------------------------------------------
    SELECT id
      INTO v_branch_id
      FROM public.branches
     WHERE company_id = v_company_id
       AND code       = v_branch_code;
    -- v_branch_id remains NULL if not found — acceptable

    -- -------------------------------------------------------------------------
    -- Step 4: Resolve department_id — optional.
    -- NULL if the department_code is not found for this company.
    -- Does not raise an exception — department is not required for profile creation.
    -- -------------------------------------------------------------------------
    SELECT id
      INTO v_department_id
      FROM public.departments
     WHERE company_id = v_company_id
       AND code       = v_department_code;
    -- v_department_id remains NULL if not found — acceptable

    -- -------------------------------------------------------------------------
    -- Step 5: Insert profile row.
    -- ON CONFLICT (id) DO NOTHING: safe to re-trigger (e.g. on manual re-run).
    -- Default role = 'logistic'. First super admin must be set manually via
    -- User Management page or Supabase SQL editor.
    -- Default mfa_required = false. Set true for admin/finance roles manually.
    -- -------------------------------------------------------------------------
    INSERT INTO public.profiles (
        id,
        full_name,
        role,
        active,
        company_id,
        branch_id,
        department_id,
        mfa_required
    )
    VALUES (
        NEW.id,
        v_full_name,
        'logistic',      -- user_role_legacy ENUM default
        true,
        v_company_id,    -- NOT NULL satisfied
        v_branch_id,     -- nullable — NULL if branch not resolved
        v_department_id, -- nullable — NULL if department not resolved
        false            -- MFA not required by default; set manually for privileged roles
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
    'Auth trigger: creates a profiles row when a new Supabase Auth user is created. '
    'Reads company_code, branch_code, department_code from raw_user_meta_data '
    'with defaults MSI / HO / IT. Resolves company_id (required), branch_id '
    'and department_id (optional) from master data tables before inserting. '
    'Raises an exception if company_code is not found in public.companies. '
    'ON CONFLICT (id) DO NOTHING makes it safe to re-run. '
    'SECURITY DEFINER + SET search_path = public prevents hijacking. '
    'Patched in migration 016 after profiles.company_id became NOT NULL (Phase 1.0F).';


-- =============================================================================
-- NOTE: TRIGGER NOT RECREATED
-- =============================================================================
-- The on_auth_user_created trigger already points to public.handle_new_user().
-- CREATE OR REPLACE FUNCTION replaces the body in-place — the trigger
-- automatically uses the new body on its next firing.
-- No DROP/CREATE TRIGGER is needed.
--
-- Verify the trigger still exists after applying:
--   SELECT trigger_name, event_manipulation, action_statement
--   FROM information_schema.triggers
--   WHERE trigger_name = 'on_auth_user_created';
--   Expected: 1 row — AFTER INSERT, EXECUTE FUNCTION handle_new_user()


-- =============================================================================
-- POST-EXECUTION VERIFICATION QUERIES
-- Run these after applying to confirm the patch is live.
-- =============================================================================

-- VERIFY 1: Confirm new function body includes company_id in the INSERT.
--   SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
--   Expected: function body contains 'company_id' and 'v_company_id'

-- VERIFY 2: Confirm trigger still exists and is wired correctly.
--   SELECT trigger_name, event_manipulation, event_object_table,
--          action_timing, action_statement
--   FROM information_schema.triggers
--   WHERE trigger_name = 'on_auth_user_created';
--   Expected: 1 row
--   event_object_table = 'users'
--   action_timing      = 'AFTER'
--   action_statement   = 'EXECUTE FUNCTION handle_new_user()'

-- VERIFY 3: Smoke test — create a new Auth user via Supabase Dashboard.
--   Authentication → Users → Add user → Create new user
--   (no metadata required — defaults to MSI / HO / IT / logistic / active)
--   Then verify:
--   SELECT id, full_name, role, active, company_id, branch_id, department_id, mfa_required
--   FROM public.profiles
--   ORDER BY created_at DESC
--   LIMIT 1;
--   Expected: new row with company_id = MSI UUID, role = 'logistic', active = true,
--             mfa_required = false, branch_id = HO UUID, department_id = IT UUID

-- VERIFY 4: Smoke test — create a new Auth user with explicit SBI metadata.
--   Use Supabase Admin API or SQL editor to insert a test user with:
--   raw_user_meta_data = '{"company_code": "SBI", "branch_code": "HO",
--                          "department_code": "SLS", "full_name": "SBI Test"}'
--   Expected: profile row with company_id = SBI UUID, department_id = SLS UUID

-- VERIFY 5: Confirm cross-company isolation test user can now be created.
--   Create test.sbi.viewer@exportimportdept.com (or equivalent SBI test user)
--   via Supabase Dashboard — should succeed with SBI defaults if metadata is
--   passed, or create under MSI default if no metadata.
--   Then manually UPDATE the profile to set company_id = SBI UUID if needed
--   for the cross-company isolation test.
-- =============================================================================
