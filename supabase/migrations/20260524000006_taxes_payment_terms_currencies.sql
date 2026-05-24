-- =============================================================================
-- Migration: 20260524000006_taxes_payment_terms_currencies
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create taxes, payment_terms, currencies, and exchange_rates tables.
--            Seed baseline data: PPN/PPh tax codes, standard payment terms,
--            and core ISO 4217 currencies.
--            currencies is global (no company_id).
--            taxes, payment_terms, exchange_rates are company-scoped.
-- Depends:   20260524000001_companies
-- Run order: 6
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DELETE FROM exchange_rates;
-- DELETE FROM payment_terms WHERE code IN ('COD','NET15','NET30','NET45','NET60','50UP');
-- DELETE FROM taxes WHERE code IN ('PPN11','PPH23','PPH21','TAXFREE');
-- DELETE FROM currencies WHERE code IN ('IDR','USD','SGD','EUR','JPY');
-- DROP TABLE IF EXISTS exchange_rates;
-- DROP TABLE IF EXISTS payment_terms;
-- DROP TABLE IF EXISTS taxes;
-- DROP TABLE IF EXISTS currencies;
-- =============================================================================

-- =============================================================================
-- TABLE: currencies
-- Global scope — no company_id.
-- ISO 4217 currency codes. Super Admin manages; all authenticated users read.
-- No soft delete — use is_active = false.
-- =============================================================================
CREATE TABLE IF NOT EXISTS currencies (
    code           varchar(3)   PRIMARY KEY,   -- ISO 4217, e.g. IDR, USD, SGD
    name           varchar(100) NOT NULL,
    symbol         varchar(10),
    decimal_places smallint     NOT NULL DEFAULT 2,
    is_active      boolean      NOT NULL DEFAULT true,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  currencies               IS 'Global ISO 4217 currency registry. Readable by all authenticated users; managed by Super Admin only.';
COMMENT ON COLUMN currencies.code          IS 'ISO 4217 three-letter currency code: IDR, USD, SGD, EUR, JPY.';
COMMENT ON COLUMN currencies.decimal_places IS 'Number of decimal places for display. IDR = 0, USD/EUR/SGD = 2, JPY = 0.';

CREATE TRIGGER trg_currencies_updated_at
    BEFORE UPDATE ON currencies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: exchange_rates
-- Company-scoped. Daily or monthly rates per company.
-- No soft delete — historical rates must never be removed (audit integrity).
-- Uniqueness: one rate per (company, from_currency, to_currency, effective_date).
-- =============================================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
    id               uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    from_currency    varchar(3)    NOT NULL REFERENCES currencies(code),
    to_currency      varchar(3)    NOT NULL REFERENCES currencies(code),
    rate             numeric(18,6) NOT NULL CHECK (rate > 0),
    effective_date   date          NOT NULL,
    notes            text,
    created_by       uuid          REFERENCES auth.users(id),
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT exchange_rates_unique
        UNIQUE (company_id, from_currency, to_currency, effective_date),
    CONSTRAINT exchange_rates_no_self_conversion
        CHECK (from_currency <> to_currency)
);

COMMENT ON TABLE  exchange_rates                IS 'Company-scoped exchange rate history. Never delete historical rates — deactivate via effective_date or add a new rate.';
COMMENT ON COLUMN exchange_rates.rate           IS 'Rate: 1 unit of from_currency = rate units of to_currency. Must be > 0.';
COMMENT ON COLUMN exchange_rates.effective_date IS 'The date from which this rate is valid. Use most recent rate on or before the transaction date.';

CREATE TRIGGER trg_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_exchange_rates_company_id
    ON exchange_rates (company_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
    ON exchange_rates (company_id, from_currency, to_currency, effective_date DESC);

-- =============================================================================
-- TABLE: taxes
-- Company-scoped. Indonesian tax context: PPN, PPh23, PPh21, etc.
-- Never change rate on a code used in posted transactions.
-- Deactivate old code and create new one with updated rate.
-- =============================================================================
CREATE TABLE IF NOT EXISTS taxes (
    id             uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code           varchar(20)   NOT NULL,
    name           varchar(100)  NOT NULL,
    rate           numeric(7,4)  NOT NULL CHECK (rate >= 0),  -- e.g. 11.0000 for PPN 11%
    tax_type       varchar(30)   NOT NULL DEFAULT 'percentage'
                   CHECK (tax_type IN ('percentage', 'fixed')),
    is_inclusive   boolean       NOT NULL DEFAULT false,      -- true = tax included in price
    gl_account_id  uuid,                                      -- nullable FK → chart_of_accounts (Phase 3)
    notes          text,
    is_active      boolean       NOT NULL DEFAULT true,
    created_by     uuid          REFERENCES auth.users(id),
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    deleted_at     timestamptz,

    CONSTRAINT taxes_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  taxes              IS 'Company-scoped tax code registry. Indonesian context: PPN (VAT), PPh23, PPh21. Never modify rate on a code used in posted transactions — deactivate and create new instead.';
COMMENT ON COLUMN taxes.rate         IS 'Tax rate as a percentage value: 11.0000 = 11%. For fixed type, this is the fixed amount per unit.';
COMMENT ON COLUMN taxes.is_inclusive IS 'True = tax is already included in the price (tax-inclusive). False = tax is added on top of the base price.';
COMMENT ON COLUMN taxes.gl_account_id IS 'Nullable FK to chart_of_accounts. Set during Phase 3 when COA is configured.';

CREATE TRIGGER trg_taxes_updated_at
    BEFORE UPDATE ON taxes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_taxes_company_id
    ON taxes (company_id);
CREATE INDEX IF NOT EXISTS idx_taxes_deleted_at
    ON taxes (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: payment_terms
-- Company-scoped. Standardizes payment terms used across customers, vendors,
-- and invoices. Replaces the raw integer payment_terms field on customers.
-- Phase 1.0F: migrate customers.payment_terms (int) → payment_terms_id (FK).
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_terms (
    id          uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code        varchar(20)  NOT NULL,
    name        varchar(100) NOT NULL,
    days_due    integer      NOT NULL DEFAULT 0 CHECK (days_due >= 0),
    description text,
    is_active   boolean      NOT NULL DEFAULT true,
    created_by  uuid         REFERENCES auth.users(id),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    deleted_at  timestamptz,

    CONSTRAINT payment_terms_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  payment_terms          IS 'Company-scoped payment term templates. Standardizes due-date calculation for customers, vendors, and invoices.';
COMMENT ON COLUMN payment_terms.days_due IS 'Number of days from invoice date until payment is due. 0 = COD (cash on delivery).';

CREATE TRIGGER trg_payment_terms_updated_at
    BEFORE UPDATE ON payment_terms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payment_terms_company_id
    ON payment_terms (company_id);
CREATE INDEX IF NOT EXISTS idx_payment_terms_deleted_at
    ON payment_terms (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- SEED: ISO 4217 currencies
-- Phase 1.0 focuses on IDR. USD, SGD, EUR, JPY included for multi-currency
-- readiness. Note: IDR uses 0 decimal places in Indonesian business context.
-- =============================================================================
INSERT INTO currencies (code, name, symbol, decimal_places, is_active)
VALUES
    ('IDR', 'Indonesian Rupiah',  'Rp',   0, true),
    ('USD', 'US Dollar',          '$',    2, true),
    ('SGD', 'Singapore Dollar',   'S$',   2, true),
    ('EUR', 'Euro',               '€',    2, true),
    ('JPY', 'Japanese Yen',       '¥',    0, true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SEED: standard tax codes for every active company
-- Indonesian tax context:
--   PPN11   = PPN (VAT) 11% — standard rate since April 2022
--   PPH23   = PPh Pasal 23 — 2% withholding on services
--   PPH21   = PPh Pasal 21 — 5%+ withholding on employment income (HR use)
--   TAXFREE = Tax exempt / non-taxable
-- =============================================================================
INSERT INTO taxes
    (company_id, code, name, rate, tax_type, is_inclusive, is_active)
SELECT
    c.id,
    t.code,
    t.name,
    t.rate,
    'percentage',
    false,
    true
FROM   companies c
CROSS JOIN (
    VALUES
        ('PPN11',   'PPN 11% (VAT)',            11.0000),
        ('PPH23',   'PPh Pasal 23 (2%)',          2.0000),
        ('PPH21',   'PPh Pasal 21 (5%)',           5.0000),
        ('TAXFREE', 'Non-Taxable / Tax Exempt',    0.0000)
) AS t(code, name, rate)
WHERE  c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- SEED: standard payment terms for every active company
-- 50UP = 50% Uang Muka (down payment), remainder on delivery
-- days_due for 50UP is 0 (terms are split — handled at invoice level)
-- =============================================================================
INSERT INTO payment_terms
    (company_id, code, name, days_due, description, is_active)
SELECT
    c.id,
    p.code,
    p.name,
    p.days_due,
    p.description,
    true
FROM   companies c
CROSS JOIN (
    VALUES
        ('COD',   'Cash on Delivery',      0,  'Payment due upon delivery or service completion'),
        ('NET15',  'Net 15 Days',          15, 'Full payment due within 15 days of invoice date'),
        ('NET30',  'Net 30 Days',          30, 'Full payment due within 30 days of invoice date'),
        ('NET45',  'Net 45 Days',          45, 'Full payment due within 45 days of invoice date'),
        ('NET60',  'Net 60 Days',          60, 'Full payment due within 60 days of invoice date'),
        ('50UP',   '50% Uang Muka',         0, '50% down payment before delivery; remainder due upon completion')
) AS p(code, name, days_due, description)
WHERE  c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT code, name, symbol, decimal_places FROM currencies ORDER BY code;
-- Expected: 5 currency rows (IDR, USD, SGD, EUR, JPY)
--
-- SELECT c.code AS company, t.code, t.name, t.rate FROM taxes t
-- JOIN companies c ON c.id = t.company_id ORDER BY c.code, t.code;
-- Expected: 12 rows (4 tax codes × 3 companies)
--
-- SELECT c.code AS company, p.code, p.name, p.days_due FROM payment_terms p
-- JOIN companies c ON c.id = p.company_id ORDER BY c.code, p.days_due;
-- Expected: 18 rows (6 terms × 3 companies)
-- =============================================================================
