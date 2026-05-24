-- =============================================================================
-- Migration: 20260524000012_asset_management
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create asset management tables (P3 / Phase 4.2):
--            - asset_categories: classifies assets by type and depreciation
--            - asset_locations: tracks where assets are physically located
--            - assets: individual asset register records
--            Schema is defined now so that:
--              1. The AST document type code (seeded in migration 4) has a
--                 corresponding table structure ready for Phase 4.2.
--              2. No schema migration will be needed when Phase 4.2 starts.
--            No seed data. No UI work. Implementation deferred to Phase 4.2.
--            These tables should NOT be included in Phase 1.0E admin screens.
-- Depends:   20260524000001_companies, 20260524000002_branches_departments
--            20260524000005_roles_permissions
--            20260524000011_cost_centers_chart_of_accounts
-- Run order: 12
-- Status:    DRAFT — do NOT execute without explicit approval
--            Full implementation: Phase 4.2
-- =============================================================================

-- ROLLBACK:
-- DROP TABLE IF EXISTS assets;
-- DROP TABLE IF EXISTS asset_locations;
-- DROP TABLE IF EXISTS asset_categories;
-- =============================================================================

-- =============================================================================
-- TABLE: asset_categories
-- Company-scoped. Classifies assets: IT Equipment, Furniture, Vehicle, etc.
-- Defines useful life and depreciation method at the category level.
-- =============================================================================
CREATE TABLE IF NOT EXISTS asset_categories (
    id                   uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id           uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code                 varchar(20)  NOT NULL,
    name                 varchar(100) NOT NULL,
    description          text,
    useful_life_years    smallint     CHECK (useful_life_years > 0),
    depreciation_method  varchar(20)  NOT NULL DEFAULT 'straight_line'
                         CHECK (depreciation_method IN ('straight_line', 'double_declining', 'none')),
    is_active            boolean      NOT NULL DEFAULT true,
    created_by           uuid         REFERENCES auth.users(id),
    created_at           timestamptz  NOT NULL DEFAULT now(),
    updated_at           timestamptz  NOT NULL DEFAULT now(),
    deleted_at           timestamptz,

    CONSTRAINT asset_categories_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  asset_categories                     IS 'P3 — Phase 4.2 only. Asset classification with depreciation parameters. Schema defined in Phase 1.0B for completeness.';
COMMENT ON COLUMN asset_categories.code                IS 'Category code, unique per company. e.g. IT-EQP, FURN, VEH, BLDG.';
COMMENT ON COLUMN asset_categories.useful_life_years   IS 'Expected useful life in years. Drives depreciation schedule calculation.';
COMMENT ON COLUMN asset_categories.depreciation_method IS 'straight_line: equal annual depreciation. double_declining: accelerated. none: non-depreciable assets (land).';

CREATE TRIGGER trg_asset_categories_updated_at
    BEFORE UPDATE ON asset_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_categories_company_id
    ON asset_categories (company_id);
CREATE INDEX IF NOT EXISTS idx_asset_categories_deleted_at
    ON asset_categories (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: asset_locations
-- Company-scoped. Tracks physical placement of assets.
-- Must reference a branch — assets are always at a branch location.
-- =============================================================================
CREATE TABLE IF NOT EXISTS asset_locations (
    id          uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    branch_id   uuid         NOT NULL REFERENCES branches(id),
    code        varchar(20)  NOT NULL,
    name        varchar(100) NOT NULL,
    description text,
    is_active   boolean      NOT NULL DEFAULT true,
    created_by  uuid         REFERENCES auth.users(id),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    deleted_at  timestamptz,

    CONSTRAINT asset_locations_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  asset_locations           IS 'P3 — Phase 4.2 only. Physical asset placement registry per branch. Schema defined in Phase 1.0B for completeness.';
COMMENT ON COLUMN asset_locations.branch_id IS 'Branch where this location exists. Required — assets are always at a branch.';
COMMENT ON COLUMN asset_locations.code      IS 'Location code, unique per company. e.g. HO-IT-ROOM, HO-FIN-DESK.';

CREATE TRIGGER trg_asset_locations_updated_at
    BEFORE UPDATE ON asset_locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_locations_company_id
    ON asset_locations (company_id);
CREATE INDEX IF NOT EXISTS idx_asset_locations_branch_id
    ON asset_locations (branch_id);
CREATE INDEX IF NOT EXISTS idx_asset_locations_deleted_at
    ON asset_locations (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: assets
-- Company-scoped. Individual fixed asset register records.
-- asset_no follows document numbering format: AST/{ENTITY}/{DEPT}/{YYYY}/{SEQ}
-- e.g. AST/MSI/IT/2026/0001
-- Disposal via approval workflow — never hard delete.
-- =============================================================================
CREATE TABLE IF NOT EXISTS assets (
    id                         uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id                 uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    asset_no                   varchar(50)   NOT NULL,   -- document_no format: AST/MSI/IT/2026/0001
    name                       varchar(150)  NOT NULL,
    description                text,
    category_id                uuid          NOT NULL REFERENCES asset_categories(id),
    location_id                uuid          REFERENCES asset_locations(id),
    purchase_date              date,
    purchase_price             numeric(18,2) DEFAULT 0,
    useful_life_years          smallint,     -- overrides category default if set
    depreciation_method        varchar(20)
                               CHECK (depreciation_method IN ('straight_line', 'double_declining', 'none')),
    accumulated_depreciation   numeric(18,2) NOT NULL DEFAULT 0,
    book_value                 numeric(18,2) DEFAULT 0,  -- purchase_price - accumulated_depreciation
    status                     varchar(30)   NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','disposed','in_repair','retired','transferred')),
    assigned_to_user_id        uuid          REFERENCES auth.users(id),
    disposal_date              date,
    disposal_notes             text,
    coa_asset_account_id       uuid          REFERENCES chart_of_accounts(id),   -- asset account
    coa_depreciation_account_id uuid         REFERENCES chart_of_accounts(id),   -- accumulated depreciation account
    coa_expense_account_id     uuid          REFERENCES chart_of_accounts(id),   -- depreciation expense account
    is_active                  boolean       NOT NULL DEFAULT true,
    created_by                 uuid          REFERENCES auth.users(id),
    updated_by                 uuid          REFERENCES auth.users(id),
    created_at                 timestamptz   NOT NULL DEFAULT now(),
    updated_at                 timestamptz   NOT NULL DEFAULT now(),
    deleted_at                 timestamptz,

    CONSTRAINT assets_company_no_unique UNIQUE (company_id, asset_no)
);

COMMENT ON TABLE  assets                              IS 'P3 — Phase 4.2 only. Fixed asset register. Disposal requires approval workflow — never hard delete. Schema defined in Phase 1.0B for completeness.';
COMMENT ON COLUMN assets.asset_no                    IS 'Document number in standard format: AST/{ENTITY}/{DEPT}/{YYYY}/{SEQ}. Generated via document_sequences.';
COMMENT ON COLUMN assets.book_value                  IS 'Current book value = purchase_price - accumulated_depreciation. Updated each depreciation run.';
COMMENT ON COLUMN assets.status                      IS 'Asset lifecycle status: active, disposed, in_repair, retired, transferred.';
COMMENT ON COLUMN assets.useful_life_years           IS 'Overrides the category default if set. Otherwise inherits from asset_categories.useful_life_years.';
COMMENT ON COLUMN assets.coa_asset_account_id        IS 'Nullable FK to chart_of_accounts. Asset acquisition posting account. Set when COA is configured in Phase 3.';
COMMENT ON COLUMN assets.coa_depreciation_account_id IS 'Nullable FK to chart_of_accounts. Accumulated depreciation contra-asset account.';
COMMENT ON COLUMN assets.coa_expense_account_id      IS 'Nullable FK to chart_of_accounts. Depreciation expense posting account.';

CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_assets_company_id
    ON assets (company_id);
CREATE INDEX IF NOT EXISTS idx_assets_category_id
    ON assets (category_id);
CREATE INDEX IF NOT EXISTS idx_assets_status
    ON assets (company_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_deleted_at
    ON assets (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('asset_categories','asset_locations','assets');
-- Expected: 3 rows
--
-- NOTE: No data is expected — these tables are schema-only for Phase 1.0B.
-- Full implementation, seeding, and UI are deferred to Phase 4.2.
-- =============================================================================
