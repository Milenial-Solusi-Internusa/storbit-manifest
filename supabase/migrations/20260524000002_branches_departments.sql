-- =============================================================================
-- Migration: 20260524000002_branches_departments
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create branches and departments tables; seed standard departments.
--            Department codes feed directly into document numbers (e.g. SLS in
--            SP/MSI/SLS/2026/0001), so they must exist before document_types.
-- Depends:   20260524000001_companies
-- Run order: 2
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DELETE FROM departments WHERE code IN ('SLS','LOG','FIN','PROC','IT','MGMT','HR');
-- DELETE FROM branches WHERE code = 'HO';
-- DROP TABLE IF EXISTS departments;
-- DROP TABLE IF EXISTS branches;
-- =============================================================================

-- =============================================================================
-- TABLE: branches
-- Company-scoped. Soft delete via deleted_at.
-- =============================================================================
CREATE TABLE IF NOT EXISTS branches (
    id          uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code        varchar(20)  NOT NULL,
    name        varchar(100) NOT NULL,
    address     text,
    city        varchar(100),
    is_active   boolean      NOT NULL DEFAULT true,
    created_by  uuid         REFERENCES auth.users(id),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    deleted_at  timestamptz,

    CONSTRAINT branches_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  branches            IS 'Physical or operational locations of a company.';
COMMENT ON COLUMN branches.code       IS 'Short location identifier, unique per company, e.g. HO, SBY, MDN.';
COMMENT ON COLUMN branches.deleted_at IS 'Soft delete timestamp. NULL = active.';

CREATE TRIGGER trg_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_branches_company_id
    ON branches (company_id);
CREATE INDEX IF NOT EXISTS idx_branches_deleted_at
    ON branches (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: departments
-- Company-scoped. Supports parent_id hierarchy. Soft delete via deleted_at.
-- =============================================================================
CREATE TABLE IF NOT EXISTS departments (
    id          uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code        varchar(20)  NOT NULL,
    name        varchar(100) NOT NULL,
    parent_id   uuid         REFERENCES departments(id),   -- nullable: top-level dept has no parent
    is_active   boolean      NOT NULL DEFAULT true,
    created_by  uuid         REFERENCES auth.users(id),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    deleted_at  timestamptz,

    CONSTRAINT departments_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  departments            IS 'Organizational units. Codes appear as the {DEPT} segment in document numbers.';
COMMENT ON COLUMN departments.code       IS 'Short dept code matching the Document Numbering standard: SLS, LOG, FIN, PROC, IT, MGMT, HR.';
COMMENT ON COLUMN departments.parent_id  IS 'Self-referential parent department for hierarchy. NULL = top-level.';
COMMENT ON COLUMN departments.deleted_at IS 'Soft delete timestamp. NULL = active.';

CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_departments_company_id
    ON departments (company_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent_id
    ON departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_deleted_at
    ON departments (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- SEED: one Head Office branch per company
-- =============================================================================
INSERT INTO branches (company_id, code, name, city, is_active)
SELECT id, 'HO', 'Head Office', 'Jakarta', true
FROM   companies
WHERE  code IN ('MSI', 'JCI', 'SBI')
  AND  is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- SEED: standard departments for every active company
-- Codes match the Document Numbering standard (docs/workflow/document-numbering.md).
-- =============================================================================
INSERT INTO departments (company_id, code, name, is_active)
SELECT c.id, d.code, d.name, true
FROM   companies c
CROSS JOIN (
    VALUES
        ('SLS',  'Sales'),
        ('LOG',  'Logistics / Operations'),
        ('FIN',  'Finance'),
        ('PROC', 'Procurement'),
        ('IT',   'Information Technology'),
        ('MGMT', 'Management'),
        ('HR',   'Human Resources')
) AS d(code, name)
WHERE  c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT company_id, code, name FROM branches ORDER BY company_id, code;
-- SELECT company_id, code, name FROM departments ORDER BY company_id, code;
-- Expected: 3 branch rows (one per company) and 21 dept rows (7 per company).
-- =============================================================================
