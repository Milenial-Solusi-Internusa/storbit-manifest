-- =============================================================================
-- Migration: 20260524000014_rls_policy_draft
-- Phase:     1.0D — RLS Policy Draft
-- Purpose:   Enable Row Level Security on all P0/P1 master data tables and
--            create all access policies. Includes helper functions used by
--            both RLS policies and application-layer permission checks.
-- Depends:   All prior migrations 001–013
-- Run order: 14
-- Status:    DRAFT — do NOT execute without explicit approval
--            See docs/security/rls-policy-draft.md for full rationale and
--            test matrix before applying.
-- =============================================================================

-- PRE-EXECUTION CHECKLIST (must be verified before applying):
-- [ ] Migrations 001–013 applied and verified
-- [ ] Staging environment only — never apply direct to production
-- [ ] All policies tested with minimum 2 roles per table (see test matrix)
-- [ ] profiles and customers RLS section: REQUIRES Phase 1.0F first — see below
-- [ ] RLS change review: compare before/after in PR description

-- ROLLBACK:
-- DROP POLICY IF EXISTS ...  (each policy individually — see section headers)
-- ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;
-- DROP FUNCTION IF EXISTS has_permission(text, text);
-- DROP FUNCTION IF EXISTS has_role(text);
-- DROP FUNCTION IF EXISTS is_admin_or_above();
-- DROP FUNCTION IF EXISTS is_super_admin();
-- DROP FUNCTION IF EXISTS get_user_company_id();
-- =============================================================================


-- =============================================================================
-- SECTION 1: HELPER FUNCTIONS
--
-- All functions use SECURITY DEFINER to bypass circular RLS dependency:
-- RLS policies call these functions; the functions read tables that are
-- themselves protected by RLS. SECURITY DEFINER allows the function to
-- run with the privileges of the function owner (the migration executor),
-- bypassing RLS for the specific lookup inside the function only.
--
-- SET search_path = public is MANDATORY on every SECURITY DEFINER function
-- to prevent search_path hijacking attacks.
--
-- All functions are STABLE (same inputs return same outputs within one
-- transaction) — correct because auth.uid() does not change mid-transaction.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- get_user_company_id()
-- Returns the company_id for the currently authenticated user.
-- Reads profiles.company_id which is populated in Phase 1.0F.
-- Returns NULL before Phase 1.0F backfill — this is intentional and safe
-- for new ERP tables (policies evaluate to false, denying access).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM   profiles
  WHERE  id = auth.uid()
$$;

COMMENT ON FUNCTION get_user_company_id() IS
  'Returns the company_id of the authenticated user from profiles. NULL before Phase 1.0F backfill. Used in all company-scoped RLS policies.';

-- ----------------------------------------------------------------------------
-- is_super_admin()
-- Returns true if the current user holds the super_admin role.
-- Includes a legacy fallback for profiles.role = ''super'' during transition
-- (before Phase 1.0F populates user_roles).
-- After Phase 1.0F, the OR clause becomes a no-op.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Target: check user_roles table (populated in Phase 1.0F)
    EXISTS (
      SELECT 1
      FROM   user_roles ur
      JOIN   roles       r  ON r.id  = ur.role_id
      WHERE  ur.user_id      = auth.uid()
        AND  ur.is_active     = true
        AND  r.code           = 'super_admin'
        AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
    )
    OR
    -- Legacy fallback: profiles.role enum (valid until Phase 1.0F drops the column)
    EXISTS (
      SELECT 1
      FROM   profiles
      WHERE  id     = auth.uid()
        AND  role::text = 'super'
        AND  active  = true
    )
$$;

COMMENT ON FUNCTION is_super_admin() IS
  'True if the current user holds super_admin role (new user_roles table) or legacy profiles.role=''super''. Legacy fallback removed after Phase 1.0F.';

-- ----------------------------------------------------------------------------
-- is_admin_or_above()
-- Returns true if the current user is admin or super_admin.
-- Includes the same legacy fallback for the transition period.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM   user_roles ur
      JOIN   roles       r  ON r.id  = ur.role_id
      WHERE  ur.user_id      = auth.uid()
        AND  ur.is_active     = true
        AND  r.code           IN ('super_admin', 'admin')
        AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
    )
    OR
    -- Legacy fallback: only 'super' maps to admin-or-above in the old enum
    EXISTS (
      SELECT 1
      FROM   profiles
      WHERE  id     = auth.uid()
        AND  role::text = 'super'
        AND  active  = true
    )
$$;

COMMENT ON FUNCTION is_admin_or_above() IS
  'True if current user is admin or super_admin. Includes legacy profiles.role=''super'' fallback for Phase 1.0D→1.0F transition.';

-- ----------------------------------------------------------------------------
-- has_role(role_code text)
-- Returns true if the current user holds the given role within any active
-- assignment. Used for finer-grained RLS on sensitive tables.
-- Does NOT fall back to legacy roles (only used for new ERP tables).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_role(role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r  ON r.id  = ur.role_id
    WHERE  ur.user_id      = auth.uid()
      AND  ur.is_active     = true
      AND  r.code           = role_code
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;

COMMENT ON FUNCTION has_role(text) IS
  'True if the current user holds the specified role code in any active user_roles assignment. Does not fall back to legacy roles.';

-- ----------------------------------------------------------------------------
-- has_permission(module_code text, action_code text)
-- Returns true if the current user has the given permission through any of
-- their active roles. Used for application-layer authorization checks and
-- finer-grained RLS where needed.
-- NOTE: This performs 3 JOINs per call — use sparingly in hot-path RLS.
-- Prefer is_admin_or_above() for bulk list queries; use has_permission()
-- for mutation policies on sensitive tables.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION has_permission(module_code text, action_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles     ur
    JOIN   roles           r   ON r.id  = ur.role_id
    JOIN   role_permissions rp ON rp.role_id = r.id
    JOIN   permissions      p  ON p.id  = rp.permission_id
    WHERE  ur.user_id      = auth.uid()
      AND  ur.is_active     = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  p.module         = module_code
      AND  p.action         = action_code
  )
$$;

COMMENT ON FUNCTION has_permission(text, text) IS
  'True if the current user holds the given {module}.{action} permission through any active role. Performs 3 JOINs — use for mutation checks, not bulk SELECT policies.';


-- =============================================================================
-- SECTION 2: GLOBAL READ TABLES
-- status_catalog, currencies, permissions
-- All authenticated users read; only super_admin can write.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- status_catalog
-- ----------------------------------------------------------------------------
ALTER TABLE status_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_catalog_read_all"        ON status_catalog;
DROP POLICY IF EXISTS "status_catalog_super_admin_write" ON status_catalog;

CREATE POLICY "status_catalog_read_all"
ON status_catalog FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "status_catalog_super_admin_write"
ON status_catalog FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- ----------------------------------------------------------------------------
-- currencies
-- ----------------------------------------------------------------------------
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "currencies_read_all"          ON currencies;
DROP POLICY IF EXISTS "currencies_super_admin_write" ON currencies;

CREATE POLICY "currencies_read_all"
ON currencies FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "currencies_super_admin_write"
ON currencies FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- ----------------------------------------------------------------------------
-- permissions
-- ----------------------------------------------------------------------------
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissions_read_all"          ON permissions;
DROP POLICY IF EXISTS "permissions_super_admin_write" ON permissions;

CREATE POLICY "permissions_read_all"
ON permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "permissions_super_admin_write"
ON permissions FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());


-- =============================================================================
-- SECTION 3: COMPANIES
-- Special case: all authenticated users can read their own company.
-- Super Admin can read all companies.
-- Only Super Admin can create or edit companies.
-- No DELETE policy (hard delete forbidden).
-- =============================================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_read_own"        ON companies;
DROP POLICY IF EXISTS "companies_super_admin_write" ON companies;

-- All users see only their own company record via company_id in profiles
CREATE POLICY "companies_read_own"
ON companies FOR SELECT
TO authenticated
USING (
  id = get_user_company_id()
  OR is_super_admin()
);

-- Only super_admin can create/update companies
CREATE POLICY "companies_super_admin_write"
ON companies FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());


-- =============================================================================
-- SECTION 4: ORGANIZATION TABLES
-- branches, departments, positions
-- All company users can read. Admin and above can create/update.
-- No DELETE policy (soft delete via UPDATE to deleted_at).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- branches
-- ----------------------------------------------------------------------------
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_read"   ON branches;
DROP POLICY IF EXISTS "branches_insert" ON branches;
DROP POLICY IF EXISTS "branches_update" ON branches;

CREATE POLICY "branches_read"
ON branches FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "branches_insert"
ON branches FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "branches_update"
ON branches FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id() AND is_admin_or_above())
WITH CHECK (company_id = get_user_company_id() AND is_admin_or_above());

-- ----------------------------------------------------------------------------
-- departments
-- ----------------------------------------------------------------------------
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_read"   ON departments;
DROP POLICY IF EXISTS "departments_insert" ON departments;
DROP POLICY IF EXISTS "departments_update" ON departments;

CREATE POLICY "departments_read"
ON departments FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "departments_insert"
ON departments FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "departments_update"
ON departments FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id() AND is_admin_or_above())
WITH CHECK (company_id = get_user_company_id() AND is_admin_or_above());

-- ----------------------------------------------------------------------------
-- positions
-- ----------------------------------------------------------------------------
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "positions_read"   ON positions;
DROP POLICY IF EXISTS "positions_insert" ON positions;
DROP POLICY IF EXISTS "positions_update" ON positions;

CREATE POLICY "positions_read"
ON positions FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "positions_insert"
ON positions FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "positions_update"
ON positions FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id() AND is_admin_or_above())
WITH CHECK (company_id = get_user_company_id() AND is_admin_or_above());


-- =============================================================================
-- SECTION 5: ACCESS CONTROL TABLES
-- roles, role_permissions, user_roles
-- =============================================================================

-- ----------------------------------------------------------------------------
-- roles
-- All company users can read roles (needed for UI role dropdowns).
-- Admins can create custom roles (system roles are already seeded).
-- is_system_role restriction enforced in application layer, not RLS.
-- ----------------------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_read"   ON roles;
DROP POLICY IF EXISTS "roles_insert" ON roles;
DROP POLICY IF EXISTS "roles_update" ON roles;

CREATE POLICY "roles_read"
ON roles FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "roles_insert"
ON roles FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "roles_update"
ON roles FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id() AND is_admin_or_above())
WITH CHECK (company_id = get_user_company_id() AND is_admin_or_above());

-- ----------------------------------------------------------------------------
-- role_permissions
-- All company users can read (needed by has_permission() calls in app layer).
-- Admin can manage (grant/revoke permissions from roles).
-- DELETE is allowed only for admins (revoking a permission is done by delete).
-- Scoped via role FK: must JOIN to roles to find company_id.
-- ----------------------------------------------------------------------------
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions_read"   ON role_permissions;
DROP POLICY IF EXISTS "role_permissions_insert" ON role_permissions;
DROP POLICY IF EXISTS "role_permissions_delete" ON role_permissions;

CREATE POLICY "role_permissions_read"
ON role_permissions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_id
      AND r.company_id = get_user_company_id()
  )
);

CREATE POLICY "role_permissions_insert"
ON role_permissions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_id
      AND r.company_id = get_user_company_id()
  )
  AND is_admin_or_above()
);

-- Revoking a permission = DELETE the role_permissions row (admin only)
CREATE POLICY "role_permissions_delete"
ON role_permissions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM roles r
    WHERE r.id = role_id
      AND r.company_id = get_user_company_id()
  )
  AND is_admin_or_above()
);

-- ----------------------------------------------------------------------------
-- user_roles
-- Users can read their own role assignments.
-- Admins can read and manage all assignments in their company.
-- No DELETE — revoke by setting is_active = false (UPDATE).
-- ----------------------------------------------------------------------------
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_read"   ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update" ON user_roles;

CREATE POLICY "user_roles_read"
ON user_roles FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()                          -- own assignments always visible
  OR (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  OR is_super_admin()
);

CREATE POLICY "user_roles_insert"
ON user_roles FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "user_roles_update"
ON user_roles FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND is_admin_or_above()
)
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);


-- =============================================================================
-- SECTION 5B: profiles — PHASE 1.0F DEPENDENCY
--
-- WARNING: DO NOT ENABLE profiles RLS until Phase 1.0F is complete.
--
-- Reason: profiles.company_id is NULL for all rows until Phase 1.0F backfill.
-- Enabling these policies before backfill would:
--   - Return empty results for all SELECT queries (NULL != anything)
--   - Lock out all users from UserManagement page
--   - Break the existing application immediately
--
-- Pre-condition: COUNT(*) FROM profiles WHERE company_id IS NULL = 0
-- Apply these policies ONLY after Phase 1.0F migration is verified.
--
-- The policies below are the TARGET state (post Phase 1.0F).
-- They are commented out and should be applied in a Phase 1.0F sub-step.
-- =============================================================================

/*  ── PHASE 1.0F: Uncomment and apply after company_id backfill ──────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read"   ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_read"
ON profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()                               -- always see own profile
  OR (
    company_id = get_user_company_id()          -- admin sees all in company
    AND is_admin_or_above()
  )
  OR is_super_admin()
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
-- No DELETE: soft delete via is_active = false + deleted_at

────────────────────────────────────────────────────────────────────────────── */


-- =============================================================================
-- SECTION 6: MASTER DATA TABLES
-- vendors, products (new tables — safe to enable now)
-- customers — PHASE 1.0F DEPENDENCY (see below)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- vendors (new table, no migration dependency)
-- All company users can read (needed for job creation, invoicing).
-- Procurement and admin can create/edit.
-- No DELETE — soft delete via deleted_at.
-- bank_account masking is enforced in APPLICATION LAYER, not RLS
-- (RLS cannot restrict individual column values, only rows).
-- ----------------------------------------------------------------------------
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_read"   ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;

CREATE POLICY "vendors_read"
ON vendors FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "vendors_insert"
ON vendors FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    is_admin_or_above()
    OR has_role('procurement_head')
    OR has_role('procurement_staff')
  )
);

CREATE POLICY "vendors_update"
ON vendors FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
)
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    is_admin_or_above()
    OR has_role('procurement_head')
    OR has_role('procurement_staff')
  )
);

-- ----------------------------------------------------------------------------
-- products (new table, no migration dependency)
-- All company users can read (needed for quotation, invoice, PR creation).
-- Admin can create/edit product catalog.
-- ----------------------------------------------------------------------------
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_read"   ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;

CREATE POLICY "products_read"
ON products FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "products_insert"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "products_update"
ON products FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
)
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);


-- =============================================================================
-- SECTION 6B: customers — PHASE 1.0F DEPENDENCY
--
-- WARNING: DO NOT ENABLE customers RLS until Phase 1.0F is complete.
-- Same reason as profiles: customers.company_id is NULL for all existing rows.
-- Enabling before backfill locks out ALL customer data.
--
-- Pre-condition: COUNT(*) FROM customers WHERE company_id IS NULL = 0
-- =============================================================================

/*  ── PHASE 1.0F: Uncomment and apply after company_id backfill ──────────────

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

-- No DELETE: soft delete via UPDATE to deleted_at

────────────────────────────────────────────────────────────────────────────── */


-- =============================================================================
-- SECTION 7: FINANCE REFERENCE TABLES
-- taxes, payment_terms, exchange_rates
-- All are new tables — safe to enable immediately.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- taxes
-- All company users can read (needed for invoice/PO creation UI).
-- Finance and admin can create/edit.
-- No DELETE — soft delete via deleted_at (rate integrity protection).
-- ----------------------------------------------------------------------------
ALTER TABLE taxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taxes_read"   ON taxes;
DROP POLICY IF EXISTS "taxes_insert" ON taxes;
DROP POLICY IF EXISTS "taxes_update" ON taxes;

CREATE POLICY "taxes_read"
ON taxes FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "taxes_insert"
ON taxes FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    is_admin_or_above()
    OR has_role('finance_controller')
  )
);

CREATE POLICY "taxes_update"
ON taxes FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
)
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    is_admin_or_above()
    OR has_role('finance_controller')
  )
);

-- ----------------------------------------------------------------------------
-- payment_terms
-- All company users read. Finance and admin manage.
-- ----------------------------------------------------------------------------
ALTER TABLE payment_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_terms_read"   ON payment_terms;
DROP POLICY IF EXISTS "payment_terms_insert" ON payment_terms;
DROP POLICY IF EXISTS "payment_terms_update" ON payment_terms;

CREATE POLICY "payment_terms_read"
ON payment_terms FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
);

CREATE POLICY "payment_terms_insert"
ON payment_terms FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND (is_admin_or_above() OR has_role('finance_controller'))
);

CREATE POLICY "payment_terms_update"
ON payment_terms FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (deleted_at IS NULL OR is_super_admin())
)
WITH CHECK (
  company_id = get_user_company_id()
  AND (is_admin_or_above() OR has_role('finance_controller'))
);

-- ----------------------------------------------------------------------------
-- exchange_rates
-- All company users read (needed for multi-currency display).
-- Finance and admin can insert rates (no UPDATE — never modify historical).
-- No UPDATE, no DELETE: historical rates are immutable.
-- ----------------------------------------------------------------------------
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exchange_rates_read"   ON exchange_rates;
DROP POLICY IF EXISTS "exchange_rates_insert" ON exchange_rates;

CREATE POLICY "exchange_rates_read"
ON exchange_rates FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "exchange_rates_insert"
ON exchange_rates FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND (is_admin_or_above() OR has_role('finance_controller'))
);

-- No UPDATE policy (historical rates must never be changed)
-- No DELETE policy (historical rates must never be removed)


-- =============================================================================
-- SECTION 8: DOCUMENT TABLES
-- document_types, document_sequences
-- =============================================================================

-- ----------------------------------------------------------------------------
-- document_types
-- All company users read (needed for document creation forms).
-- Admin manages document type configuration.
-- No DELETE — deactivate via is_active = false.
-- ----------------------------------------------------------------------------
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_types_read"   ON document_types;
DROP POLICY IF EXISTS "document_types_insert" ON document_types;
DROP POLICY IF EXISTS "document_types_update" ON document_types;

CREATE POLICY "document_types_read"
ON document_types FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "document_types_insert"
ON document_types FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "document_types_update"
ON document_types FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

-- ----------------------------------------------------------------------------
-- document_sequences
-- All company users can read sequences (needed to display current counters).
-- Any company user can UPDATE (increment) sequences — document creation
-- by operations/sales/finance staff requires atomic sequence increment.
-- Admin-only for INSERT (creating the initial sequence row).
-- No DELETE (sequence history must be preserved).
-- ----------------------------------------------------------------------------
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_sequences_read"      ON document_sequences;
DROP POLICY IF EXISTS "document_sequences_increment" ON document_sequences;
DROP POLICY IF EXISTS "document_sequences_insert"    ON document_sequences;

CREATE POLICY "document_sequences_read"
ON document_sequences FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

-- Any authenticated company user can increment (UPDATE) sequences.
-- This is required for atomic document number generation.
-- The application MUST use UPDATE ... RETURNING (never SELECT + UPDATE).
CREATE POLICY "document_sequences_increment"
ON document_sequences FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());

-- Only admin can insert new sequence rows (new document type / new year)
CREATE POLICY "document_sequences_insert"
ON document_sequences FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);


-- =============================================================================
-- SECTION 9: APPROVAL ENGINE TABLES
-- approval_rules, approval_logs, approval_delegations
-- =============================================================================

-- ----------------------------------------------------------------------------
-- approval_rules
-- All company users read (needed to know if a document requires approval).
-- Admin manages approval configuration.
-- No DELETE — deactivate via is_active = false.
-- ----------------------------------------------------------------------------
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_rules_read"   ON approval_rules;
DROP POLICY IF EXISTS "approval_rules_insert" ON approval_rules;
DROP POLICY IF EXISTS "approval_rules_update" ON approval_rules;

CREATE POLICY "approval_rules_read"
ON approval_rules FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "approval_rules_insert"
ON approval_rules FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

CREATE POLICY "approval_rules_update"
ON approval_rules FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()
);

-- ----------------------------------------------------------------------------
-- approval_logs (APPEND-ONLY)
-- All company users read (submitters track their document's approval status).
-- Any authenticated company user can INSERT (log their own action).
-- NO UPDATE policy — approval logs are immutable once written.
-- NO DELETE policy — approval logs are permanent audit trail.
-- ----------------------------------------------------------------------------
ALTER TABLE approval_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_logs_read"   ON approval_logs;
DROP POLICY IF EXISTS "approval_logs_insert" ON approval_logs;

CREATE POLICY "approval_logs_read"
ON approval_logs FOR SELECT
TO authenticated
USING (company_id = get_user_company_id());

-- INSERT: any company user can log an approval action (submit, approve, etc.)
-- Application layer validates actor_id = auth.uid() before inserting.
CREATE POLICY "approval_logs_insert"
ON approval_logs FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND actor_id = auth.uid()       -- users can only log actions as themselves
);

-- No UPDATE policy (immutable)
-- No DELETE policy (permanent audit trail)

-- ----------------------------------------------------------------------------
-- approval_delegations
-- Users can read delegations they are party to (as delegator or delegate).
-- Admin reads and manages all within company.
-- is_active is set to false (not true) by admin at creation; admin approves.
-- ----------------------------------------------------------------------------
ALTER TABLE approval_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_delegations_read"   ON approval_delegations;
DROP POLICY IF EXISTS "approval_delegations_insert" ON approval_delegations;
DROP POLICY IF EXISTS "approval_delegations_update" ON approval_delegations;

CREATE POLICY "approval_delegations_read"
ON approval_delegations FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND (
    delegator_id = auth.uid()        -- the user who delegated
    OR delegate_id = auth.uid()      -- the user receiving delegation
    OR is_admin_or_above()
  )
);

CREATE POLICY "approval_delegations_insert"
ON approval_delegations FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id()
  AND (
    delegator_id = auth.uid()        -- can only create on own behalf
    OR is_admin_or_above()
  )
);

CREATE POLICY "approval_delegations_update"
ON approval_delegations FOR UPDATE
TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (
  company_id = get_user_company_id()
  AND is_admin_or_above()            -- only admin can approve (set is_active = true)
);


-- =============================================================================
-- VERIFICATION QUERIES (run after applying in staging to confirm):
--
-- 1. Verify RLS is enabled on all target tables:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN (
--   'status_catalog','currencies','permissions','companies',
--   'branches','departments','positions',
--   'roles','role_permissions','user_roles',
--   'vendors','products','taxes','payment_terms','exchange_rates',
--   'document_types','document_sequences',
--   'approval_rules','approval_logs','approval_delegations'
-- )
-- ORDER BY tablename;
-- Expected: rowsecurity = true for all 20 tables
--
-- 2. Verify helper functions exist:
-- SELECT proname, prosecdef FROM pg_proc
-- WHERE proname IN (
--   'get_user_company_id','is_super_admin','is_admin_or_above',
--   'has_role','has_permission'
-- );
-- Expected: 5 rows, prosecdef = true for all (SECURITY DEFINER)
--
-- 3. Cross-company isolation test (run as MSI user, check SBI branches):
-- SET LOCAL role = 'authenticated';
-- SET LOCAL request.jwt.claims = '{"sub":"<msi_user_id>"}';
-- SELECT COUNT(*) FROM branches;  -- Must return MSI branches only
-- =============================================================================
