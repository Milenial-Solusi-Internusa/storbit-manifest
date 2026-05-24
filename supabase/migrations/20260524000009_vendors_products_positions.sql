-- =============================================================================
-- Migration: 20260524000009_vendors_products_positions
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create three new master data tables:
--            - vendors: external supplier/service provider registry
--            - products: product and service catalog
--            - positions: job titles and seniority levels
--            All three are company-scoped with soft delete.
--            No seed data for vendors or products (company-specific).
--            positions seeds 5 standard seniority levels per company.
-- Depends:   20260524000001_companies, 20260524000002_branches_departments
--            20260524000006_taxes_payment_terms_currencies
-- Run order: 9
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DELETE FROM positions WHERE code IN ('STAFF','SPV','MGR','HEAD','DIR');
-- DROP TABLE IF EXISTS positions;
-- DROP TABLE IF EXISTS products;
-- DROP TABLE IF EXISTS vendors;
-- =============================================================================

-- =============================================================================
-- TABLE: vendors
-- Company-scoped. External suppliers, shipping lines, truckers, sub-contractors.
-- bank_account is sensitive — display masked (last 4 digits) to non-Finance roles.
-- No equivalent in current Storbit Manifest — entirely new table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendors (
    id                  uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code                varchar(20)  NOT NULL,
    name                varchar(100) NOT NULL,
    legal_name          varchar(200),
    vendor_type         varchar(50),   -- Shipping Line / Trucker / Customs Agent / Supplier / Sub-contractor
    tax_id              varchar(50),   -- NPWP
    address             text,
    city                varchar(100),
    country             varchar(100)  DEFAULT 'Indonesia',
    phone               varchar(50),
    email               varchar(100),
    pic_name            varchar(100),
    pic_phone           varchar(50),
    bank_name           varchar(100),
    bank_account        varchar(50),   -- SENSITIVE: display last 4 digits only to non-Finance roles
    bank_account_name   varchar(100),
    payment_terms_id    uuid          REFERENCES payment_terms(id),
    currency_code       varchar(3)    REFERENCES currencies(code) DEFAULT 'IDR',
    notes               text,
    is_active           boolean       NOT NULL DEFAULT true,
    created_by          uuid          REFERENCES auth.users(id),
    updated_by          uuid          REFERENCES auth.users(id),
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    deleted_at          timestamptz,

    CONSTRAINT vendors_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  vendors              IS 'Company-scoped vendor master. Covers suppliers, shipping lines, truckers, customs agents, and sub-contractors.';
COMMENT ON COLUMN vendors.code         IS 'Vendor code, unique per company. e.g. VND-0001.';
COMMENT ON COLUMN vendors.vendor_type  IS 'Classification: Shipping Line, Trucker, Customs Agent, Supplier, Sub-contractor, General.';
COMMENT ON COLUMN vendors.bank_account IS 'SENSITIVE: Display only last 4 digits to non-Finance roles. Full value stored for AP payment processing.';

CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_vendors_company_id
    ON vendors (company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_company_code
    ON vendors (company_id, code);
CREATE INDEX IF NOT EXISTS idx_vendors_deleted_at
    ON vendors (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: products
-- Company-scoped. Sellable products and billable services.
-- is_service = true: service items (most MSI/JCI transactions)
-- is_service = false: physical goods (SBI trading)
-- cogs_account_id and revenue_account_id are nullable FKs to chart_of_accounts
-- — set to NULL until COA is configured in Phase 3.
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
    id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code                varchar(20)   NOT NULL,
    name                varchar(100)  NOT NULL,
    category            varchar(50),
    unit                varchar(20),  -- pcs, kg, m3, CBM, lot, trip, etc.
    description         text,
    is_service          boolean       NOT NULL DEFAULT true,  -- true = service, false = physical goods
    default_price       numeric(18,2) DEFAULT 0,
    tax_id              uuid          REFERENCES taxes(id),   -- default tax applied to this product
    cogs_account_id     uuid,                                 -- nullable FK → chart_of_accounts (Phase 3)
    revenue_account_id  uuid,                                 -- nullable FK → chart_of_accounts (Phase 3)
    is_active           boolean       NOT NULL DEFAULT true,
    created_by          uuid          REFERENCES auth.users(id),
    updated_by          uuid          REFERENCES auth.users(id),
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    deleted_at          timestamptz,

    CONSTRAINT products_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  products                    IS 'Company-scoped product and service catalog. Used in quotations, sales orders, invoices, and purchase orders.';
COMMENT ON COLUMN products.code               IS 'Product/service code, unique per company. e.g. SRV-0001 for services, PRD-0001 for goods.';
COMMENT ON COLUMN products.is_service         IS 'True = billable service (most MSI/JCI items). False = physical goods (SBI trading).';
COMMENT ON COLUMN products.default_price      IS 'Default unit price. Overridable at transaction level.';
COMMENT ON COLUMN products.cogs_account_id    IS 'Nullable FK to chart_of_accounts for COGS mapping. Set in Phase 3 when COA is configured.';
COMMENT ON COLUMN products.revenue_account_id IS 'Nullable FK to chart_of_accounts for revenue mapping. Set in Phase 3 when COA is configured.';

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_company_id
    ON products (company_id);
CREATE INDEX IF NOT EXISTS idx_products_company_code
    ON products (company_id, code);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at
    ON products (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: positions
-- Company-scoped. Job titles and seniority levels.
-- Used for approval matrix threshold configuration and HR reporting.
-- department_id is optional: a position may span multiple departments.
-- =============================================================================
CREATE TABLE IF NOT EXISTS positions (
    id            uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id uuid         REFERENCES departments(id),
    code          varchar(20)  NOT NULL,
    name          varchar(100) NOT NULL,
    level         varchar(20)  NOT NULL DEFAULT 'Staff'
                  CHECK (level IN ('Staff', 'Supervisor', 'Manager', 'Head', 'Director')),
    is_active     boolean      NOT NULL DEFAULT true,
    created_by    uuid         REFERENCES auth.users(id),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    deleted_at    timestamptz,

    CONSTRAINT positions_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  positions               IS 'Company-scoped job position registry. Levels drive approval matrix thresholds.';
COMMENT ON COLUMN positions.code          IS 'Position code, unique per company. e.g. STAFF, SPV, MGR, HEAD, DIR.';
COMMENT ON COLUMN positions.level         IS 'Seniority level: Staff, Supervisor, Manager, Head, Director. Used for approval threshold matching.';
COMMENT ON COLUMN positions.department_id IS 'Optional department assignment. NULL = position spans multiple departments.';

CREATE TRIGGER trg_positions_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_positions_company_id
    ON positions (company_id);
CREATE INDEX IF NOT EXISTS idx_positions_deleted_at
    ON positions (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- LINK: profiles.position_id → positions.id
-- Now that positions table exists, add the FK constraint that was deferred
-- in migration 7 (profiles_extension.sql).
-- =============================================================================
ALTER TABLE profiles
    ADD CONSTRAINT IF NOT EXISTS fk_profiles_position_id
    FOREIGN KEY (position_id) REFERENCES positions(id);

-- =============================================================================
-- SEED: 5 standard seniority levels for every active company
-- These are generic level codes — companies add actual job titles separately.
-- =============================================================================
INSERT INTO positions
    (company_id, code, name, level, is_active)
SELECT
    c.id,
    p.code,
    p.name,
    p.level,
    true
FROM   companies c
CROSS JOIN (
    VALUES
        ('STAFF', 'Staff',              'Staff'),
        ('SPV',   'Supervisor',         'Supervisor'),
        ('MGR',   'Manager',            'Manager'),
        ('HEAD',  'Head / Department Head', 'Head'),
        ('DIR',   'Director / BOD',     'Director')
) AS p(code, name, level)
WHERE  c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT c.code AS company, p.code, p.name, p.level FROM positions p
-- JOIN companies c ON c.id = p.company_id ORDER BY c.code, p.level;
-- Expected: 15 rows (5 levels × 3 companies)
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('vendors','products','positions');
-- Expected: 3 rows
-- =============================================================================
