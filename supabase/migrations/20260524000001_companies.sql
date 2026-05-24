-- =============================================================================
-- Migration: 20260524000001_companies
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create companies table (root anchor for all company-scoped data)
--            and seed the three MSI Group entities.
-- Depends:   uuid-ossp extension
-- Run order: 1 — must be first; every other P0 migration depends on this
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK (run these in reverse order before rolling back):
-- DELETE FROM companies WHERE code IN ('MSI', 'JCI', 'SBI');
-- DROP TABLE IF EXISTS companies;
-- =============================================================================

-- Ensure uuid-ossp is available (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLE: companies
-- Global scope — no company_id column (this IS the company record).
-- No soft delete — use is_active = false to decommission.
-- No created_by / updated_by — this is a super-admin-only table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS companies (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            varchar(20)  NOT NULL,
    name            varchar(100) NOT NULL,
    legal_name      varchar(200),
    business_focus  varchar(100),          -- e.g. Freight Forwarding
    address         text,
    city            varchar(100),
    country         varchar(100) DEFAULT 'Indonesia',
    phone           varchar(50),
    email           varchar(100),
    tax_id          varchar(50),           -- NPWP
    logo_url        text,
    is_active       boolean      NOT NULL DEFAULT true,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT companies_code_unique UNIQUE (code)
);

COMMENT ON TABLE  companies                IS 'Root anchor for all company-scoped data. One row per MSI Group legal entity.';
COMMENT ON COLUMN companies.code           IS 'Short identifier: MSI, JCI, SBI. Used as the {ENTITY} segment in document numbers.';
COMMENT ON COLUMN companies.business_focus IS 'Human-readable description: Freight Forwarding, PPJK, General Trading.';
COMMENT ON COLUMN companies.tax_id         IS 'NPWP — Indonesian tax registration number.';

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_code
    ON companies (code);

CREATE INDEX IF NOT EXISTS idx_companies_is_active
    ON companies (is_active);

-- =============================================================================
-- TRIGGER: keep updated_at current on every UPDATE
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SEED: MSI Group entities
-- Uses ON CONFLICT (code) DO NOTHING to make this idempotent.
-- =============================================================================
INSERT INTO companies (code, name, legal_name, business_focus, country, is_active)
VALUES
    ('MSI', 'MSI Group',      'PT MSI Group',         'Freight Forwarding',         'Indonesia', true),
    ('JCI', 'JCI',            'PT JCI',               'PPJK / Customs Clearance',   'Indonesia', true),
    ('SBI', 'Storbit / SBI',  'PT Storbit Indonesia', 'General Trading',            'Indonesia', true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERY (run after applying to confirm):
-- SELECT code, name, business_focus, is_active FROM companies ORDER BY code;
-- Expected: 3 rows — JCI, MSI, SBI
-- =============================================================================
