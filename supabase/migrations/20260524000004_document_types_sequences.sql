-- =============================================================================
-- Migration: 20260524000004_document_types_sequences
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create document_types and document_sequences tables; seed all
--            15 standard document type codes for every active company.
--            These two tables power the document numbering engine:
--              {DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}
--            document_sequences uses atomic UPDATE ... RETURNING to prevent
--            race conditions under concurrent document creation.
-- Depends:   20260524000001_companies, 20260524000002_branches_departments
-- Run order: 4
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DELETE FROM document_sequences;
-- DELETE FROM document_types WHERE code IN (
--     'QT','SP','SHP','CUS','TRD','PR','PO','GRN',
--     'INV','RCP','PV','JE','AST','TCK','HRG'
-- );
-- DROP TABLE IF EXISTS document_sequences;
-- DROP TABLE IF EXISTS document_types;
-- =============================================================================

-- =============================================================================
-- TABLE: document_types
-- Company-scoped. Configures numbering rules and approval requirements per
-- document type per company.
-- No soft delete — deactivate via is_active = false.
-- IMPORTANT: department_code is stored as varchar, NOT as FK to departments.
-- This keeps the numbering engine independent of department table changes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_types (
    id                  uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    module              varchar(50)  NOT NULL,             -- sales / operations / procurement / finance / etc.
    code                varchar(20)  NOT NULL,             -- QT, SP, SHP, INV, etc.
    name                varchar(100) NOT NULL,
    prefix_format       varchar(100) NOT NULL              -- '{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}'
                        DEFAULT '{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}',
    department_code     varchar(20)  NOT NULL,             -- Default dept segment in the number (SLS, FIN, LOG …)
    reset_period        varchar(10)  NOT NULL DEFAULT 'yearly'   -- yearly / monthly
                        CHECK (reset_period IN ('yearly', 'monthly')),
    seq_padding         smallint     NOT NULL DEFAULT 4,   -- zero-padding width, e.g. 4 → 0001
    approval_required   boolean      NOT NULL DEFAULT true,
    notes               text,
    is_active           boolean      NOT NULL DEFAULT true,
    created_by          uuid         REFERENCES auth.users(id),
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT document_types_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  document_types                  IS 'Document type registry per company. Defines numbering format, approval requirement, and department segment for each document code.';
COMMENT ON COLUMN document_types.code             IS 'Short document code: QT, SP, SHP, CUS, TRD, PR, PO, GRN, INV, RCP, PV, JE, AST, TCK, HRG.';
COMMENT ON COLUMN document_types.department_code  IS 'Default department code used in the document number segment. Stored as varchar — NOT a FK to departments. See docs/workflow/document-numbering.md.';
COMMENT ON COLUMN document_types.prefix_format    IS 'Numbering format template. Supported tokens: {DOC}, {ENTITY}, {DEPT}, {YYYY}, {MM}, {SEQ}.';
COMMENT ON COLUMN document_types.reset_period     IS 'Sequence reset period: yearly (most common) or monthly.';
COMMENT ON COLUMN document_types.seq_padding      IS 'Zero-padding width for the sequence segment. Default 4 produces 0001, 0042, 1234.';

CREATE TRIGGER trg_document_types_updated_at
    BEFORE UPDATE ON document_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_document_types_company_id
    ON document_types (company_id);
CREATE INDEX IF NOT EXISTS idx_document_types_company_code
    ON document_types (company_id, code);

-- =============================================================================
-- TABLE: document_sequences
-- Company-scoped. Tracks the running counter per (company, doc_type, dept, year,
-- month). Sequences are created on first use and incremented atomically.
--
-- CRITICAL: The sequence increment MUST use atomic UPDATE ... RETURNING:
--   UPDATE document_sequences
--   SET last_sequence = last_sequence + 1
--   WHERE company_id = $1 AND document_type = $2
--     AND department_code = $3 AND year = $4 AND month = $5
--   RETURNING last_sequence;
-- Never SELECT-then-UPDATE — race condition risk under concurrent requests.
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_sequences (
    id              uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    document_type   varchar(20)  NOT NULL,    -- FK-by-convention to document_types.code (not hard FK)
    department_code varchar(20)  NOT NULL,
    year            smallint     NOT NULL,
    month           smallint     NOT NULL DEFAULT 0,  -- 0 = yearly reset, 1–12 = monthly reset
    last_sequence   integer      NOT NULL DEFAULT 0,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT document_sequences_unique
        UNIQUE (company_id, document_type, department_code, year, month)
);

COMMENT ON TABLE  document_sequences               IS 'Running sequence counter per (company, document_type, department_code, year, month). Incremented atomically via UPDATE ... RETURNING. See docs/workflow/document-numbering.md.';
COMMENT ON COLUMN document_sequences.month         IS '0 = yearly reset (most common). 1–12 = monthly reset. Matches reset_period in document_types.';
COMMENT ON COLUMN document_sequences.last_sequence IS 'The last assigned sequence number. Increment atomically: UPDATE ... SET last_sequence = last_sequence + 1 ... RETURNING last_sequence. Never SELECT then UPDATE.';

CREATE TRIGGER trg_document_sequences_updated_at
    BEFORE UPDATE ON document_sequences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_document_sequences_company_id
    ON document_sequences (company_id);
CREATE INDEX IF NOT EXISTS idx_document_sequences_lookup
    ON document_sequences (company_id, document_type, department_code, year, month);

-- =============================================================================
-- SEED: all 15 document type codes for every active company.
-- Source: docs/workflow/document-numbering.md
--
-- Department code mapping (default dept for numbering segment):
--   QT, SP            → SLS  (Sales)
--   SHP, CUS, TRD     → LOG  (Logistics / Operations)
--   PR, PO, GRN       → PROC (Procurement)
--   INV, RCP, PV, JE  → FIN  (Finance)
--   AST, TCK           → IT   (Information Technology)
--   HRG               → HR   (Human Resources)
--
-- NOTE ON EXISTING SP DATA:
--   Before going live, inspect the highest existing SP number:
--     SELECT MAX(sp_no) FROM sp_items;
--   Then manually initialize document_sequences for SP/SBI/SLS/<current_year>
--   with last_sequence = <max_existing_number> to avoid duplicate numbers.
-- =============================================================================
INSERT INTO document_types
    (company_id, module, code, name, prefix_format, department_code,
     reset_period, seq_padding, approval_required, is_active)
SELECT
    c.id,
    d.module,
    d.code,
    d.name,
    '{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}',
    d.department_code,
    'yearly',
    4,
    d.approval_required,
    true
FROM   companies c
CROSS JOIN (
    VALUES
        -- Sales
        ('sales',       'QT',  'Quotation',                    'SLS',  true),
        ('sales',       'SP',  'Surat Pesanan / Sales Order',  'SLS',  true),
        -- Operations
        ('operations',  'SHP', 'Shipment / Job Card (Freight)','LOG',  false),
        ('operations',  'CUS', 'Customs Job Card (PPJK)',      'LOG',  false),
        ('operations',  'TRD', 'Trading Order',                'LOG',  true),
        -- Procurement
        ('procurement', 'PR',  'Purchase Request',             'PROC', true),
        ('procurement', 'PO',  'Purchase Order',               'PROC', true),
        ('procurement', 'GRN', 'Goods Receipt Note',           'PROC', false),
        -- Finance
        ('finance',     'INV', 'Invoice',                      'FIN',  true),
        ('finance',     'RCP', 'Payment Receipt',              'FIN',  false),
        ('finance',     'PV',  'Payment Voucher',              'FIN',  true),
        -- Accounting
        ('accounting',  'JE',  'Journal Entry',                'FIN',  true),
        -- Asset Management
        ('assets',      'AST', 'Asset Register',               'IT',   true),
        -- IT & HR
        ('it',          'TCK', 'IT Service Ticket',            'IT',   false),
        ('hrga',        'HRG', 'HRGA Request',                 'HR',   true)
) AS d(module, code, name, department_code, approval_required)
WHERE  c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- NOTE: document_sequences rows are created on first document creation,
-- not pre-seeded here. Exception: the SP sequence for existing data must be
-- initialized manually from MAX(sp_items.sp_no) during Phase 1.0F.
-- =============================================================================

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT c.code AS company, dt.code, dt.name, dt.department_code, dt.approval_required
-- FROM document_types dt
-- JOIN companies c ON c.id = dt.company_id
-- ORDER BY c.code, dt.module, dt.code;
-- Expected: 45 rows (15 doc types × 3 companies)
-- =============================================================================
