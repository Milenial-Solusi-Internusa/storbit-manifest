-- =============================================================================
-- Migration: 20260524000017_rls_hardening_public_tables.sql
-- Phase: 1.0H — RLS Hardening for Remaining Public Tables
-- Date: 2026-05-24
-- Author: Nexus by MSI Engineering
--
-- PURPOSE
-- Enables Row Level Security on 8 public-schema tables that triggered the
-- Supabase Security Advisor "rls_disabled_in_public" critical warning.
--
-- TABLES COVERED
-- Group A — Legacy operational tables (no company_id, authenticated-only):
--   1. sp_items
--   2. ar_ttfs
--   3. ar_btbs
--
-- Group B — Company-scoped Phase 2+ finance tables:
--   4. cost_centers
--   5. chart_of_accounts
--
-- Group C — Company-scoped Phase 4.2 asset tables:
--   6. asset_categories
--   7. asset_locations
--   8. assets
--
-- HELPER FUNCTIONS (defined in migration 014):
--   get_user_company_id()  → uuid  — company_id of the current session user
--   is_super_admin()       → bool  — true if profiles.role = 'super_admin'
--   is_admin_or_above()    → bool  — true if role IN ('admin', 'super_admin')
--
-- POLICY STRATEGY OVERVIEW
-- Group A  — No company_id column exists.  Policies are authenticated-only
--            (TO authenticated USING (true)).  This blocks anonymous / public
--            access while preserving all existing app behaviour unchanged.
--            Marked as TRANSITIONAL; company_id migration planned for Phase 2.
--
-- Group B/C — Tables have company_id NOT NULL.  Policies are company-scoped.
--             Reads:  company_id = get_user_company_id() OR is_super_admin()
--             Writes: company_id = get_user_company_id() AND is_admin_or_above()
--             (chart_of_accounts writes restricted to finance_controller role.)
--             No DELETE policies for any Phase 2+/4.2 table — deletions must
--             go through soft-delete (deleted_at) handled by application logic.
--
-- IDEMPOTENCY
-- Every policy block uses DROP POLICY IF EXISTS before CREATE POLICY so this
-- migration is safe to run more than once (e.g., after a rollback + re-run).
--
-- ROLLBACK
-- See rollback section at the bottom of this file.
-- =============================================================================


-- =============================================================================
-- GROUP A: LEGACY OPERATIONAL TABLES (authenticated-only, transitional)
-- =============================================================================
-- These tables pre-date the Nexus multi-company schema.  They do NOT have a
-- company_id column.  The safest policy is "any authenticated user may read
-- and write" — identical to the current implicit behaviour (no RLS = allow
-- all authenticated requests via anon key, block nothing).
--
-- Risk: low.  No existing query is rejected; only truly unauthenticated
-- (anonymous) requests are now blocked, which is the desired outcome.
--
-- Transitional note: when Phase 2 adds company_id to these tables and
-- migrates existing rows, these policies must be replaced with company-scoped
-- variants (migration 020 or later).
-- =============================================================================

-- ------------------------------------------------------------
-- 1. sp_items  (SP Manifest / Sales Pipeline items)
-- ------------------------------------------------------------
-- Used by: src/hooks/useSpItems.js
-- Operations confirmed: SELECT, INSERT, UPDATE, DELETE (hard delete by id)
-- No company_id.  No deleted_at.
-- ------------------------------------------------------------

ALTER TABLE sp_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sp_items_read"   ON sp_items;
DROP POLICY IF EXISTS "sp_items_insert" ON sp_items;
DROP POLICY IF EXISTS "sp_items_update" ON sp_items;
DROP POLICY IF EXISTS "sp_items_delete" ON sp_items;

CREATE POLICY "sp_items_read"
  ON sp_items
  FOR SELECT
  TO authenticated
  USING (true);
-- TRANSITIONAL: replace with company-scoped USING (company_id = get_user_company_id() OR is_super_admin())
-- once Phase 2 adds company_id to sp_items and backfills existing rows.

CREATE POLICY "sp_items_insert"
  ON sp_items
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
-- TRANSITIONAL: tighten to WITH CHECK (company_id = get_user_company_id()) in Phase 2.

CREATE POLICY "sp_items_update"
  ON sp_items
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
-- TRANSITIONAL: tighten in Phase 2.

CREATE POLICY "sp_items_delete"
  ON sp_items
  FOR DELETE
  TO authenticated
  USING (true);
-- Hard-delete used by deleteSpItem() in useSpItems.js.
-- TRANSITIONAL: tighten to company-scoped delete in Phase 2.


-- ------------------------------------------------------------
-- 2. ar_ttfs  (AR Tracker — TTF documents)
-- ------------------------------------------------------------
-- Used by: src/hooks/useTtfs.js, src/lib/db.js
-- Operations confirmed: SELECT, INSERT, UPDATE, DELETE (hard delete — ar_btbs
--   rows cascade-delete via FK when ar_ttfs row is deleted).
-- No company_id.  No deleted_at.
-- ------------------------------------------------------------

ALTER TABLE ar_ttfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ar_ttfs_read"   ON ar_ttfs;
DROP POLICY IF EXISTS "ar_ttfs_insert" ON ar_ttfs;
DROP POLICY IF EXISTS "ar_ttfs_update" ON ar_ttfs;
DROP POLICY IF EXISTS "ar_ttfs_delete" ON ar_ttfs;

CREATE POLICY "ar_ttfs_read"
  ON ar_ttfs
  FOR SELECT
  TO authenticated
  USING (true);
-- TRANSITIONAL: replace with company-scoped policy in Phase 2.

CREATE POLICY "ar_ttfs_insert"
  ON ar_ttfs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
-- TRANSITIONAL.

CREATE POLICY "ar_ttfs_update"
  ON ar_ttfs
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
-- TRANSITIONAL.

CREATE POLICY "ar_ttfs_delete"
  ON ar_ttfs
  FOR DELETE
  TO authenticated
  USING (true);
-- Required: deleteTtf() in useTtfs.js calls DELETE on ar_ttfs by id.
-- ar_btbs rows cascade-delete automatically via FK (ON DELETE CASCADE).
-- TRANSITIONAL.


-- ------------------------------------------------------------
-- 3. ar_btbs  (AR Tracker — BTB line items)
-- ------------------------------------------------------------
-- Used by: src/hooks/useTtfs.js (read via JOIN on ar_ttfs), src/lib/db.js
-- Operations confirmed:
--   SELECT  — read via ar_ttfs join in listTtfs()
--   INSERT  — insertTtf() inserts new btb rows after inserting the ttf parent
--   DELETE  — updateTtf() explicitly deletes btb rows by ttf_id before
--             re-inserting (replace strategy).  Also cascade from ar_ttfs.
--   UPDATE  — NOT used (replace strategy means delete + insert, not UPDATE).
-- No company_id.  No updated_at (by design — append-only ledger rows).
-- ------------------------------------------------------------

ALTER TABLE ar_btbs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ar_btbs_read"   ON ar_btbs;
DROP POLICY IF EXISTS "ar_btbs_insert" ON ar_btbs;
DROP POLICY IF EXISTS "ar_btbs_delete" ON ar_btbs;

CREATE POLICY "ar_btbs_read"
  ON ar_btbs
  FOR SELECT
  TO authenticated
  USING (true);
-- TRANSITIONAL.

CREATE POLICY "ar_btbs_insert"
  ON ar_btbs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
-- TRANSITIONAL.

CREATE POLICY "ar_btbs_delete"
  ON ar_btbs
  FOR DELETE
  TO authenticated
  USING (true);
-- Required: updateTtf() calls supabase.from('ar_btbs').delete().eq('ttf_id', id)
-- explicitly (not relying solely on FK cascade).  A DELETE policy is mandatory
-- for this operation to succeed after RLS is enabled.
-- TRANSITIONAL.
-- NOTE: No UPDATE policy created — ar_btbs uses delete+insert (replace strategy).


-- =============================================================================
-- GROUP B: COMPANY-SCOPED FINANCE TABLES (Phase 2+)
-- =============================================================================
-- These tables were created in migration 011.  No UI currently uses them.
-- RLS is enabled now to prevent accidental unrestricted access before
-- the Phase 2 finance module ships.
--
-- Write access (INSERT/UPDATE) is restricted to is_admin_or_above() for
-- cost_centers.  chart_of_accounts writes are further restricted to users
-- with has_role('finance_controller') OR is_super_admin(), reflecting the
-- sensitivity of the chart of accounts structure.
--
-- No DELETE policies: hard deletes are prohibited on Phase 2+ tables.
-- Use deleted_at IS NULL soft-delete pattern enforced by the application.
-- =============================================================================

-- ------------------------------------------------------------
-- 4. cost_centers
-- ------------------------------------------------------------
-- Columns: id, company_id NOT NULL, branch_id, department_id,
--          code, name, description, is_active, created_by,
--          created_at, updated_at, deleted_at
-- ------------------------------------------------------------

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_centers_read"   ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_insert" ON cost_centers;
DROP POLICY IF EXISTS "cost_centers_update" ON cost_centers;

CREATE POLICY "cost_centers_read"
  ON cost_centers
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    OR is_super_admin()
  );

CREATE POLICY "cost_centers_insert"
  ON cost_centers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );

CREATE POLICY "cost_centers_update"
  ON cost_centers
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );
-- No DELETE policy: soft-delete only (set deleted_at).


-- ------------------------------------------------------------
-- 5. chart_of_accounts
-- ------------------------------------------------------------
-- Columns: id, company_id NOT NULL, code, name, account_type,
--          parent_id (self-ref), level (1-4), is_header,
--          normal_balance, description, is_active, created_by,
--          created_at, updated_at, deleted_at
-- Write access intentionally restricted to finance_controller
-- or super_admin — COA structure is a critical finance asset.
-- ------------------------------------------------------------

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chart_of_accounts_read"   ON chart_of_accounts;
DROP POLICY IF EXISTS "chart_of_accounts_insert" ON chart_of_accounts;
DROP POLICY IF EXISTS "chart_of_accounts_update" ON chart_of_accounts;

CREATE POLICY "chart_of_accounts_read"
  ON chart_of_accounts
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    OR is_super_admin()
  );

CREATE POLICY "chart_of_accounts_insert"
  ON chart_of_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND (has_role('finance_controller') OR is_super_admin())
  );

CREATE POLICY "chart_of_accounts_update"
  ON chart_of_accounts
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND (has_role('finance_controller') OR is_super_admin())
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND (has_role('finance_controller') OR is_super_admin())
  );
-- No DELETE policy: soft-delete only (set deleted_at).


-- =============================================================================
-- GROUP C: COMPANY-SCOPED ASSET TABLES (Phase 4.2)
-- =============================================================================
-- These tables were created in migration 012.  No UI currently uses them.
-- Company-scoped policies are created now so the tables are never exposed
-- without RLS, regardless of when the Phase 4.2 module ships.
--
-- No DELETE policies: assets are never hard-deleted.  Use status transitions
-- (active → disposed/retired) and deleted_at soft-delete.
-- =============================================================================

-- ------------------------------------------------------------
-- 6. asset_categories
-- ------------------------------------------------------------
-- Columns: id, company_id NOT NULL, code, name, description,
--          useful_life_years, depreciation_method, is_active,
--          created_by, created_at, updated_at, deleted_at
-- ------------------------------------------------------------

ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_categories_read"   ON asset_categories;
DROP POLICY IF EXISTS "asset_categories_insert" ON asset_categories;
DROP POLICY IF EXISTS "asset_categories_update" ON asset_categories;

CREATE POLICY "asset_categories_read"
  ON asset_categories
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    OR is_super_admin()
  );

CREATE POLICY "asset_categories_insert"
  ON asset_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );

CREATE POLICY "asset_categories_update"
  ON asset_categories
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );
-- No DELETE policy: soft-delete only (set deleted_at).


-- ------------------------------------------------------------
-- 7. asset_locations
-- ------------------------------------------------------------
-- Columns: id, company_id NOT NULL, branch_id NOT NULL, code,
--          name, description, is_active, created_by,
--          created_at, updated_at, deleted_at
-- ------------------------------------------------------------

ALTER TABLE asset_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_locations_read"   ON asset_locations;
DROP POLICY IF EXISTS "asset_locations_insert" ON asset_locations;
DROP POLICY IF EXISTS "asset_locations_update" ON asset_locations;

CREATE POLICY "asset_locations_read"
  ON asset_locations
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    OR is_super_admin()
  );

CREATE POLICY "asset_locations_insert"
  ON asset_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );

CREATE POLICY "asset_locations_update"
  ON asset_locations
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );
-- No DELETE policy: soft-delete only (set deleted_at).


-- ------------------------------------------------------------
-- 8. assets
-- ------------------------------------------------------------
-- Columns: id, company_id NOT NULL, asset_no, name, description,
--          category_id NOT NULL, location_id, purchase_date,
--          purchase_price, useful_life_years, depreciation_method,
--          accumulated_depreciation, book_value,
--          status (active/disposed/in_repair/retired/transferred),
--          assigned_to_user_id, disposal_date, disposal_notes,
--          coa_asset_id, coa_depreciation_id, coa_accumulated_id,
--          is_active, created_by, updated_by, created_at, updated_at,
--          deleted_at
-- ------------------------------------------------------------

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_read"   ON assets;
DROP POLICY IF EXISTS "assets_insert" ON assets;
DROP POLICY IF EXISTS "assets_update" ON assets;

CREATE POLICY "assets_read"
  ON assets
  FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id()
    OR is_super_admin()
  );

CREATE POLICY "assets_insert"
  ON assets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );

CREATE POLICY "assets_update"
  ON assets
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_admin_or_above()
  );
-- No DELETE policy: assets are never hard-deleted.
-- Use status transitions (e.g., status = 'disposed') and set deleted_at
-- for soft-delete via application logic.


-- =============================================================================
-- ROLLBACK
-- To undo this migration, run the following SQL:
--
-- ALTER TABLE sp_items       DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE ar_ttfs        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE ar_btbs        DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE cost_centers   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE chart_of_accounts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE asset_categories  DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE asset_locations   DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE assets            DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "sp_items_read"              ON sp_items;
-- DROP POLICY IF EXISTS "sp_items_insert"            ON sp_items;
-- DROP POLICY IF EXISTS "sp_items_update"            ON sp_items;
-- DROP POLICY IF EXISTS "sp_items_delete"            ON sp_items;
-- DROP POLICY IF EXISTS "ar_ttfs_read"               ON ar_ttfs;
-- DROP POLICY IF EXISTS "ar_ttfs_insert"             ON ar_ttfs;
-- DROP POLICY IF EXISTS "ar_ttfs_update"             ON ar_ttfs;
-- DROP POLICY IF EXISTS "ar_ttfs_delete"             ON ar_ttfs;
-- DROP POLICY IF EXISTS "ar_btbs_read"               ON ar_btbs;
-- DROP POLICY IF EXISTS "ar_btbs_insert"             ON ar_btbs;
-- DROP POLICY IF EXISTS "ar_btbs_delete"             ON ar_btbs;
-- DROP POLICY IF EXISTS "cost_centers_read"          ON cost_centers;
-- DROP POLICY IF EXISTS "cost_centers_insert"        ON cost_centers;
-- DROP POLICY IF EXISTS "cost_centers_update"        ON cost_centers;
-- DROP POLICY IF EXISTS "chart_of_accounts_read"     ON chart_of_accounts;
-- DROP POLICY IF EXISTS "chart_of_accounts_insert"   ON chart_of_accounts;
-- DROP POLICY IF EXISTS "chart_of_accounts_update"   ON chart_of_accounts;
-- DROP POLICY IF EXISTS "asset_categories_read"      ON asset_categories;
-- DROP POLICY IF EXISTS "asset_categories_insert"    ON asset_categories;
-- DROP POLICY IF EXISTS "asset_categories_update"    ON asset_categories;
-- DROP POLICY IF EXISTS "asset_locations_read"       ON asset_locations;
-- DROP POLICY IF EXISTS "asset_locations_insert"     ON asset_locations;
-- DROP POLICY IF EXISTS "asset_locations_update"     ON asset_locations;
-- DROP POLICY IF EXISTS "assets_read"                ON assets;
-- DROP POLICY IF EXISTS "assets_insert"              ON assets;
-- DROP POLICY IF EXISTS "assets_update"              ON assets;
-- =============================================================================
