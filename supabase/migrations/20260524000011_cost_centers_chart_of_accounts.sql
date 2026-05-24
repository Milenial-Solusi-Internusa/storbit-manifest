-- =============================================================================
-- Migration: 20260524000011_cost_centers_chart_of_accounts
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create cost_centers and chart_of_accounts tables.
--            Both are P2 priority — required before Phase 3 (invoicing and
--            job costing) but not needed for Phase 1.0 master data screens.
--            Schema is defined now to:
--              - Enable FK references from products (cogs/revenue accounts)
--              - Enable FK references from taxes (gl_account_id)
--              - Allow AST and other document types to reference COA in Phase 3
--            No seed data: COA requires Finance Controller sign-off per company.
-- Depends:   20260524000001_companies, 20260524000002_branches_departments
-- Run order: 11
-- Status:    DRAFT — do NOT execute without explicit approval
--            COA structure must be approved by Finance Controller before
--            any accounting transaction is recorded.
-- =============================================================================

-- ROLLBACK:
-- DROP TABLE IF EXISTS chart_of_accounts;
-- DROP TABLE IF EXISTS cost_centers;
-- =============================================================================

-- =============================================================================
-- TABLE: cost_centers
-- Company-scoped. Budget and cost tracking units.
-- Typically mirrors departments or business units.
-- branch_id and department_id are optional — a cost center may span both.
-- =============================================================================
CREATE TABLE IF NOT EXISTS cost_centers (
    id            uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    branch_id     uuid         REFERENCES branches(id),
    department_id uuid         REFERENCES departments(id),
    code          varchar(20)  NOT NULL,
    name          varchar(100) NOT NULL,
    description   text,
    is_active     boolean      NOT NULL DEFAULT true,
    created_by    uuid         REFERENCES auth.users(id),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    deleted_at    timestamptz,

    CONSTRAINT cost_centers_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  cost_centers               IS 'Company-scoped budget and cost tracking units. Used in job costing, expense allocation, and management reporting.';
COMMENT ON COLUMN cost_centers.code          IS 'Cost center code, unique per company. e.g. CC-LOG-HO, CC-SLS-SBY.';
COMMENT ON COLUMN cost_centers.branch_id     IS 'Optional branch association. NULL = cost center spans all branches.';
COMMENT ON COLUMN cost_centers.department_id IS 'Optional department association. NULL = cost center spans all departments.';

CREATE TRIGGER trg_cost_centers_updated_at
    BEFORE UPDATE ON cost_centers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_cost_centers_company_id
    ON cost_centers (company_id);
CREATE INDEX IF NOT EXISTS idx_cost_centers_deleted_at
    ON cost_centers (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: chart_of_accounts
-- Company-scoped. Full GL account structure.
-- Hierarchical via parent_id (self-referential). level 1–4:
--   1 = Account Type (Asset, Liability, Equity, Revenue, Expense)
--   2 = Main Group (e.g. Current Assets, Fixed Assets)
--   3 = Sub Group  (e.g. Cash, Accounts Receivable)
--   4 = Detail     (e.g. Cash in Bank BCA, Petty Cash)
-- is_header = true: header/group account, no direct postings allowed.
-- is_header = false: leaf account, direct postings allowed.
--
-- CRITICAL: Finance Controller must approve COA structure before any
-- invoice or journal entry is posted. Structural errors in COA are
-- expensive to correct after transactions exist.
-- =============================================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id              uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code            varchar(20)  NOT NULL,
    name            varchar(150) NOT NULL,
    account_type    varchar(20)  NOT NULL
                    CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
    parent_id       uuid         REFERENCES chart_of_accounts(id),
    level           smallint     NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
    is_header       boolean      NOT NULL DEFAULT false,  -- true = group, no direct posting
    normal_balance  varchar(6)   NOT NULL DEFAULT 'debit'
                    CHECK (normal_balance IN ('debit','credit')),
    description     text,
    is_active       boolean      NOT NULL DEFAULT true,
    created_by      uuid         REFERENCES auth.users(id),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    deleted_at      timestamptz, -- only if no transactions reference this account

    CONSTRAINT chart_of_accounts_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  chart_of_accounts                IS 'Company-scoped general ledger account structure. Finance Controller must approve before any accounting transaction is recorded.';
COMMENT ON COLUMN chart_of_accounts.code           IS 'Account code, unique per company. Follows Indonesian standard COA numbering convention.';
COMMENT ON COLUMN chart_of_accounts.account_type   IS 'Fundamental account classification: asset, liability, equity, revenue, expense.';
COMMENT ON COLUMN chart_of_accounts.parent_id      IS 'Self-referential parent for hierarchy. NULL = top-level account type grouping.';
COMMENT ON COLUMN chart_of_accounts.level          IS '1=Type, 2=Group, 3=Sub-Group, 4=Detail. Only level 4 (leaf) accounts accept direct postings.';
COMMENT ON COLUMN chart_of_accounts.is_header      IS 'True = summary/header account. Direct journal postings to header accounts are not allowed.';
COMMENT ON COLUMN chart_of_accounts.normal_balance IS 'debit: increases with debit entries (assets, expenses). credit: increases with credit entries (liabilities, equity, revenue).';
COMMENT ON COLUMN chart_of_accounts.deleted_at     IS 'Soft delete only if no transactions reference this account. Finance Controller approval required before deleting any account.';

CREATE TRIGGER trg_chart_of_accounts_updated_at
    BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_coa_company_id
    ON chart_of_accounts (company_id);
CREATE INDEX IF NOT EXISTS idx_coa_parent_id
    ON chart_of_accounts (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coa_account_type
    ON chart_of_accounts (company_id, account_type);
CREATE INDEX IF NOT EXISTS idx_coa_deleted_at
    ON chart_of_accounts (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- NOW THAT chart_of_accounts EXISTS:
-- Add deferred FK constraints on products and taxes that reference it.
-- These were left as plain uuid columns in their respective migrations
-- because chart_of_accounts did not exist yet.
-- =============================================================================

ALTER TABLE products
    ADD CONSTRAINT IF NOT EXISTS fk_products_cogs_account
        FOREIGN KEY (cogs_account_id) REFERENCES chart_of_accounts(id),
    ADD CONSTRAINT IF NOT EXISTS fk_products_revenue_account
        FOREIGN KEY (revenue_account_id) REFERENCES chart_of_accounts(id);

ALTER TABLE taxes
    ADD CONSTRAINT IF NOT EXISTS fk_taxes_gl_account
        FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id);

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('cost_centers','chart_of_accounts');
-- Expected: 2 rows
--
-- -- Verify deferred FKs were added:
-- SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name AS ref_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage ccu
--   ON tc.constraint_name = ccu.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
-- AND ccu.table_name = 'chart_of_accounts';
-- Expected: fk_products_cogs_account, fk_products_revenue_account, fk_taxes_gl_account
-- =============================================================================
