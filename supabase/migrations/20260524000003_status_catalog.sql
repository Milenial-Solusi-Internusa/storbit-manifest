-- =============================================================================
-- Migration: 20260524000003_status_catalog
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create the global status_catalog table and seed all 13 standard
--            status values used across all document types in Nexus by MSI.
--            Status values are stored as varchar(50) in document tables —
--            NOT as foreign keys to this catalog. The catalog is a reference
--            registry, not a constraint. This preserves flexibility to add
--            statuses without schema migration on every document table.
-- Depends:   20260524000001_companies (for set_updated_at function)
-- Run order: 3
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DELETE FROM status_catalog WHERE code IN (
--     'draft','submitted','under_review','revision_requested','revised',
--     'approved','rejected','cancelled','in_progress','completed',
--     'archived','on_hold','overdue'
-- );
-- DROP TABLE IF EXISTS status_catalog;
-- =============================================================================

-- =============================================================================
-- TABLE: status_catalog
-- Global scope — no company_id.
-- No soft delete — use is_active = false to retire a status value.
-- Source of truth: docs/workflow/status-lifecycle.md
-- =============================================================================
CREATE TABLE IF NOT EXISTS status_catalog (
    id                 uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    code               varchar(50)  NOT NULL,
    label              varchar(100) NOT NULL,
    description        text,
    color_class        varchar(100),           -- Tailwind CSS classes for UI status badges
    applicable_modules jsonb,                  -- JSON array of module slugs, NULL = applies to all
    is_terminal        boolean      NOT NULL DEFAULT false,  -- true = no further transitions allowed
    sort_order         smallint     NOT NULL DEFAULT 0,
    is_active          boolean      NOT NULL DEFAULT true,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT status_catalog_code_unique UNIQUE (code)
);

COMMENT ON TABLE  status_catalog                    IS 'Global registry of all valid status values. Reference only — document tables store status as varchar, not as FK. See docs/workflow/status-lifecycle.md.';
COMMENT ON COLUMN status_catalog.code               IS 'Snake_case status code, e.g. draft, submitted, under_review. Globally unique.';
COMMENT ON COLUMN status_catalog.color_class        IS 'Tailwind CSS class string for UI badges, e.g. bg-yellow-100 text-yellow-800.';
COMMENT ON COLUMN status_catalog.applicable_modules IS 'JSON array of module slugs this status applies to. NULL means applicable to all modules.';
COMMENT ON COLUMN status_catalog.is_terminal        IS 'If true, no further status transition is allowed from this state (rejected, cancelled, archived, completed).';

CREATE TRIGGER trg_status_catalog_updated_at
    BEFORE UPDATE ON status_catalog
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_status_catalog_is_active
    ON status_catalog (is_active);

-- =============================================================================
-- SEED: all 13 standard status values
-- Source: docs/workflow/status-lifecycle.md
-- Color classes use Tailwind CSS convention (badge pattern: bg-* text-*).
-- sort_order controls display order in status filters and dropdowns.
-- =============================================================================
INSERT INTO status_catalog
    (code, label, description, color_class, is_terminal, sort_order, is_active)
VALUES
    ('draft',
     'Draft',
     'Document is being prepared, not yet submitted for approval.',
     'bg-gray-100 text-gray-600',
     false, 1, true),

    ('submitted',
     'Submitted',
     'Submitted for approval, awaiting first-level review.',
     'bg-blue-100 text-blue-700',
     false, 2, true),

    ('under_review',
     'Under Review',
     'Being actively reviewed by an approver (may be in multi-level approval chain).',
     'bg-indigo-100 text-indigo-700',
     false, 3, true),

    ('revision_requested',
     'Revision Requested',
     'Returned to the submitter for correction before re-submission.',
     'bg-orange-100 text-orange-700',
     false, 4, true),

    ('revised',
     'Revised',
     'Submitter has made corrections and the document is ready to be re-submitted.',
     'bg-yellow-100 text-yellow-700',
     false, 5, true),

    ('approved',
     'Approved',
     'Approved by all required approvers. Ready for execution.',
     'bg-green-100 text-green-700',
     false, 6, true),

    ('rejected',
     'Rejected',
     'Definitively rejected — no further action is permitted on this document.',
     'bg-red-100 text-red-700',
     true, 7, true),

    ('cancelled',
     'Cancelled',
     'Cancelled by the submitter or an admin before or after approval.',
     'bg-red-50 text-red-500',
     true, 8, true),

    ('in_progress',
     'In Progress',
     'Execution has started (operational stage — job/shipment is active).',
     'bg-sky-100 text-sky-700',
     false, 9, true),

    ('completed',
     'Completed',
     'Fully executed and closed. No further updates expected.',
     'bg-emerald-100 text-emerald-700',
     true, 10, true),

    ('archived',
     'Archived',
     'Closed and archived. Read-only — no transitions or edits permitted.',
     'bg-slate-100 text-slate-500',
     true, 11, true),

    ('on_hold',
     'On Hold',
     'Temporarily paused, typically pending an external dependency or decision.',
     'bg-amber-100 text-amber-700',
     false, 12, true),

    ('overdue',
     'Overdue',
     'Past the required completion or response date without resolution. May trigger escalation.',
     'bg-rose-100 text-rose-700',
     false, 13, true)

ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT code, label, is_terminal, sort_order FROM status_catalog ORDER BY sort_order;
-- Expected: 13 rows
-- Terminal statuses (is_terminal = true): rejected, cancelled, completed, archived
-- =============================================================================
