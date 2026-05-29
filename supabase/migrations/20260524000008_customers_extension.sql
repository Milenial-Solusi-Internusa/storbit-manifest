-- =============================================================================
-- Migration: 20260524000008_customers_extension
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Additive extension of the existing customers table to support
--            ERP-grade fields: company_id, code, payment_terms_id, credit_limit,
--            and other missing fields. NO existing columns are dropped.
--            The existing Customer page and AR Tracker must continue working.
--            All new columns are nullable initially.
--            Phase 1.0F will backfill company_id and make it NOT NULL.
-- Depends:   20260524000001_companies, 20260524000006_taxes_payment_terms_currencies
-- Run order: 8
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK NOTE — MANUAL REVIEW REQUIRED:
-- This migration is additive and uses ADD COLUMN IF NOT EXISTS.
-- Some columns such as address, phone, email, notes, deleted_at, created_by,
-- or updated_by may already exist in the current customers table.
-- Before running any rollback command, confirm the column was actually introduced
-- by this migration and did not exist before Phase 1.0B.
-- Do NOT run rollback in production without a metadata backup and explicit approval.
-- Suggested manual rollback commands, only after verification:
-- ALTER TABLE customers DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE customers DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE customers DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE customers DROP COLUMN IF EXISTS notes;
-- ALTER TABLE customers DROP COLUMN IF EXISTS currency_code;
-- ALTER TABLE customers DROP COLUMN IF EXISTS payment_terms_id;
-- ALTER TABLE customers DROP COLUMN IF EXISTS credit_limit;
-- ALTER TABLE customers DROP COLUMN IF EXISTS pic_email;
-- ALTER TABLE customers DROP COLUMN IF EXISTS pic_phone;
-- ALTER TABLE customers DROP COLUMN IF EXISTS pic_name;
-- ALTER TABLE customers DROP COLUMN IF EXISTS email;
-- ALTER TABLE customers DROP COLUMN IF EXISTS phone;
-- ALTER TABLE customers DROP COLUMN IF EXISTS country;
-- ALTER TABLE customers DROP COLUMN IF EXISTS city;
-- ALTER TABLE customers DROP COLUMN IF EXISTS address;
-- ALTER TABLE customers DROP COLUMN IF EXISTS tax_id;
-- ALTER TABLE customers DROP COLUMN IF EXISTS customer_type;
-- ALTER TABLE customers DROP COLUMN IF EXISTS legal_name;
-- ALTER TABLE customers DROP COLUMN IF EXISTS code;
-- ALTER TABLE customers DROP COLUMN IF EXISTS company_id;
-- DROP INDEX IF EXISTS idx_customers_deleted_at;
-- DROP INDEX IF EXISTS idx_customers_company_code;
-- DROP INDEX IF EXISTS idx_customers_company_id;
-- =============================================================================

-- =============================================================================
-- ADDITIVE COLUMNS: extend customers with ERP business fields.
-- Existing columns (id, name, payment_terms integer, active, created_at,
-- updated_at, and any others already present) are NOT touched.
--
-- IMPORTANT: existing customers.payment_terms (integer days) is NOT renamed
-- or dropped. The new payment_terms_id (FK) runs alongside it until Phase 1.0F
-- migration converts and verifies all records, then the integer column is dropped.
-- =============================================================================

-- Core ERP identity fields
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS company_id      uuid          REFERENCES companies(id),
    ADD COLUMN IF NOT EXISTS code            varchar(20),  -- unique per company, e.g. CST-0001
    ADD COLUMN IF NOT EXISTS legal_name      varchar(200),
    ADD COLUMN IF NOT EXISTS customer_type   varchar(50),  -- Individual / Company / Government / etc.
    ADD COLUMN IF NOT EXISTS tax_id          varchar(50);  -- NPWP

-- Address and contact
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS address         text,
    ADD COLUMN IF NOT EXISTS city            varchar(100),
    ADD COLUMN IF NOT EXISTS country         varchar(100) DEFAULT 'Indonesia',
    ADD COLUMN IF NOT EXISTS phone           varchar(50),
    ADD COLUMN IF NOT EXISTS email           varchar(100),
    ADD COLUMN IF NOT EXISTS pic_name        varchar(100),
    ADD COLUMN IF NOT EXISTS pic_phone       varchar(50),
    ADD COLUMN IF NOT EXISTS pic_email       varchar(100);

-- Finance fields (sensitive — credit_limit masked for non-Finance roles)
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS credit_limit    numeric(18,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_terms_id uuid         REFERENCES payment_terms(id),
    ADD COLUMN IF NOT EXISTS currency_code   varchar(3)    REFERENCES currencies(code) DEFAULT 'IDR';

-- Metadata
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS notes           text,
    ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,  -- soft delete (existing table may already have this — ADD IF NOT EXISTS is safe)
    ADD COLUMN IF NOT EXISTS created_by      uuid          REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS updated_by      uuid          REFERENCES auth.users(id);

-- Column comments
COMMENT ON COLUMN customers.company_id       IS 'ERP company scope. NULL until Phase 1.0F backfill. Will become NOT NULL after 1.0F.';
COMMENT ON COLUMN customers.code             IS 'Customer code, unique per company. Auto-generated or manually assigned. e.g. CST-0001.';
COMMENT ON COLUMN customers.customer_type    IS 'Customer classification: Individual, Company, Government, Freight Agent, etc.';
COMMENT ON COLUMN customers.tax_id           IS 'NPWP (Indonesian tax ID) or equivalent for non-Indonesian customers.';
COMMENT ON COLUMN customers.credit_limit     IS 'Maximum outstanding AR allowed. Sensitive — mask in non-Finance role views.';
COMMENT ON COLUMN customers.payment_terms_id IS 'FK to payment_terms. New ERP field running alongside legacy payment_terms (integer). Phase 1.0F migrates and removes the integer.';
COMMENT ON COLUMN customers.currency_code    IS 'Default billing currency for this customer. Default IDR.';
COMMENT ON COLUMN customers.deleted_at       IS 'Soft delete timestamp. NULL = active. If column already exists, ADD IF NOT EXISTS is safe.';
COMMENT ON COLUMN customers.updated_by       IS 'User who last updated this record.';

-- =============================================================================
-- INDEXES: company_id is the primary filter in all ERP queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_customers_company_id
    ON customers (company_id) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_company_code
    ON customers (company_id, code) WHERE company_id IS NOT NULL AND code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_deleted_at
    ON customers (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- NOTES ON PHASE 1.0F MIGRATION:
-- When Phase 1.0F runs:
--   1. UPDATE customers SET company_id = <SBI_uuid> WHERE company_id IS NULL;
--   2. Generate code for each customer: 'CST-' || LPAD(ROW_NUMBER()...::text, 4, '0')
--   3. Set payment_terms_id by matching existing payment_terms (int days) to
--      the payment_terms table (COD=0, NET15=15, NET30=30, NET45=45, NET60=60)
--   4. ALTER TABLE customers ALTER COLUMN company_id SET NOT NULL
--      (only after step 1 is verified with COUNT(*) WHERE company_id IS NULL = 0)
--   5. ADD UNIQUE CONSTRAINT on (company_id, code) after all codes are assigned
--   6. Drop customers.payment_terms (int) ONLY after payment_terms_id FK is verified
--   7. Smoke test Customer page, SP manifest, AR Tracker all still work
--
-- DO NOT execute any of steps 4–6 in this migration.
-- =============================================================================

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'customers'
-- ORDER BY ordinal_position;
-- Expected: existing columns + new ERP columns visible
--
-- SELECT COUNT(*) FROM customers WHERE company_id IS NULL;
-- Expected: equals total customer count (all null until 1.0F backfill)
-- =============================================================================
