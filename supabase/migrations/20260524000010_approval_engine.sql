-- =============================================================================
-- Migration: 20260524000010_approval_engine
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create the reusable Approval Engine tables:
--            - approval_rules: who must approve which documents and when
--            - approval_logs: immutable record of every approval action
--            - approval_delegations: temporary authority transfer
--            This engine is module-agnostic — all document types use it.
--            No seed data: each company configures rules per their workflow.
--            IMPORTANT: document_type on approval_rules is varchar (NOT FK to
--            document_types). This decouples the engine from doc type registry.
-- Depends:   20260524000001_companies, 20260524000002_branches_departments
--            20260524000005_roles_permissions
-- Run order: 10
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DROP TABLE IF EXISTS approval_delegations;
-- DROP TABLE IF EXISTS approval_logs;
-- DROP TABLE IF EXISTS approval_rules;
-- =============================================================================

-- =============================================================================
-- TABLE: approval_rules
-- Company-scoped. Defines who must approve which documents and under what
-- conditions. Multi-level approval is supported via sequence_order.
-- Amount-based rules: min_amount / max_amount define the bracket.
-- Either approver_role_id OR approver_user_id must be set (or both).
-- =============================================================================
CREATE TABLE IF NOT EXISTS approval_rules (
    id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    document_type       varchar(20)   NOT NULL,    -- e.g. QT, SP, PO, INV — varchar, NOT FK
    department_id       uuid          REFERENCES departments(id),  -- NULL = applies to all depts
    min_amount          numeric(18,2) DEFAULT 0,   -- NULL or 0 = no minimum
    max_amount          numeric(18,2),              -- NULL = no upper limit
    approver_role_id    uuid          REFERENCES roles(id),        -- role-based approver
    approver_user_id    uuid          REFERENCES auth.users(id),   -- specific user approver
    backup_approver_id  uuid          REFERENCES auth.users(id),   -- fallback if primary unavailable
    sequence_order      smallint      NOT NULL DEFAULT 1,          -- 1 = first approver, 2 = second, etc.
    deadline_hours      smallint,                                   -- hours to respond; NULL = no deadline
    notes               text,
    is_active           boolean       NOT NULL DEFAULT true,
    created_by          uuid          REFERENCES auth.users(id),
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT approval_rules_approver_required
        CHECK (approver_role_id IS NOT NULL OR approver_user_id IS NOT NULL)
);

COMMENT ON TABLE  approval_rules                  IS 'Reusable approval engine rules. Company-scoped, module-agnostic. Multi-level supported via sequence_order. See docs/workflow/approval-engine.md.';
COMMENT ON COLUMN approval_rules.document_type    IS 'Document type code (e.g. QT, SP, PO). Stored as varchar — NOT a FK to document_types to keep the engine decoupled.';
COMMENT ON COLUMN approval_rules.department_id    IS 'If set, rule applies only to documents from this department. NULL = applies to all departments.';
COMMENT ON COLUMN approval_rules.min_amount       IS 'Minimum document amount this rule applies to. 0 or NULL = no lower bound.';
COMMENT ON COLUMN approval_rules.max_amount       IS 'Maximum document amount this rule applies to. NULL = no upper limit.';
COMMENT ON COLUMN approval_rules.sequence_order   IS 'Approval level sequence. Level 1 must complete before Level 2 is triggered.';
COMMENT ON COLUMN approval_rules.deadline_hours   IS 'Hours within which the approver must act. NULL = no deadline. Enables escalation on overdue.';

CREATE TRIGGER trg_approval_rules_updated_at
    BEFORE UPDATE ON approval_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_approval_rules_company_id
    ON approval_rules (company_id);
CREATE INDEX IF NOT EXISTS idx_approval_rules_company_doctype
    ON approval_rules (company_id, document_type) WHERE is_active = true;

-- =============================================================================
-- TABLE: approval_logs
-- Company-scoped. Immutable record of every approval action.
-- Never UPDATE or DELETE rows — this is the approval audit trail.
-- Inserted only — no trigger for updated_at (rows are append-only).
-- from_status and to_status track the status transition at each action.
-- =============================================================================
CREATE TABLE IF NOT EXISTS approval_logs (
    id             uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    document_type  varchar(20)  NOT NULL,   -- e.g. QT, SP, PO
    document_id    uuid         NOT NULL,   -- references the specific document row
    document_no    varchar(100),            -- human-readable doc number for fast display
    action         varchar(30)  NOT NULL    -- submit / approve / reject / revise / cancel / delegate
                   CHECK (action IN ('submit','approve','reject','revision_requested',
                                     'revise','cancel','delegate','on_hold','resume')),
    from_status    varchar(50)  NOT NULL,   -- status before this action
    to_status      varchar(50)  NOT NULL,   -- status after this action
    actor_id       uuid         NOT NULL REFERENCES auth.users(id),
    sequence_level smallint     NOT NULL DEFAULT 1,  -- which approval level this action belongs to
    notes          text,                             -- approver comment / revision notes
    acted_at       timestamptz  NOT NULL DEFAULT now(),
    created_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  approval_logs               IS 'Immutable approval action audit trail. Append-only — never UPDATE or DELETE rows. One row per approval action.';
COMMENT ON COLUMN approval_logs.document_id   IS 'UUID of the document row in its own table (quotations.id, sales_orders.id, etc.). Not a hard FK — keeps the engine module-agnostic.';
COMMENT ON COLUMN approval_logs.document_no   IS 'Human-readable document number (e.g. QT/MSI/SLS/2026/0001). Stored for fast display without a join.';
COMMENT ON COLUMN approval_logs.action        IS 'What happened: submit, approve, reject, revision_requested, revise, cancel, delegate, on_hold, resume.';
COMMENT ON COLUMN approval_logs.sequence_level IS 'Which approval level was actioned (1 = first approver, 2 = second, etc.).';

-- No updated_at on approval_logs — rows are append-only, never updated.
CREATE INDEX IF NOT EXISTS idx_approval_logs_company_id
    ON approval_logs (company_id);
CREATE INDEX IF NOT EXISTS idx_approval_logs_document
    ON approval_logs (company_id, document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_approval_logs_actor_id
    ON approval_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_approval_logs_acted_at
    ON approval_logs (company_id, acted_at DESC);

-- =============================================================================
-- TABLE: approval_delegations
-- Company-scoped. Records temporary authority transfers between users.
-- Must be approved by Admin before taking effect.
-- =============================================================================
CREATE TABLE IF NOT EXISTS approval_delegations (
    id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    delegator_id     uuid        NOT NULL REFERENCES auth.users(id),   -- user granting authority
    delegate_id      uuid        NOT NULL REFERENCES auth.users(id),   -- user receiving authority
    document_types   jsonb       NOT NULL DEFAULT '[]'::jsonb,          -- [] = all doc types; ["QT","SP"] = specific
    valid_from       timestamptz NOT NULL,
    valid_until      timestamptz NOT NULL,
    reason           text,
    approved_by      uuid        REFERENCES auth.users(id),            -- Admin who approved this delegation
    approved_at      timestamptz,
    is_active        boolean     NOT NULL DEFAULT false,               -- false until Admin approves
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT approval_delegations_dates_valid
        CHECK (valid_until > valid_from),
    CONSTRAINT approval_delegations_no_self_delegate
        CHECK (delegator_id <> delegate_id)
);

COMMENT ON TABLE  approval_delegations                IS 'Temporary approval authority delegation. Must be approved by Admin before taking effect.';
COMMENT ON COLUMN approval_delegations.delegator_id   IS 'The user who is delegating their approval authority (e.g. a manager going on leave).';
COMMENT ON COLUMN approval_delegations.delegate_id    IS 'The user receiving temporary approval authority.';
COMMENT ON COLUMN approval_delegations.document_types IS 'JSON array of document type codes this delegation covers. Empty array [] = all types.';
COMMENT ON COLUMN approval_delegations.is_active      IS 'False = pending Admin approval. True = delegation is in effect. Auto-expires at valid_until.';

CREATE TRIGGER trg_approval_delegations_updated_at
    BEFORE UPDATE ON approval_delegations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_approval_delegations_company_id
    ON approval_delegations (company_id);
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegate
    ON approval_delegations (delegate_id, valid_from, valid_until)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_approval_delegations_delegator
    ON approval_delegations (delegator_id);

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('approval_rules','approval_logs','approval_delegations');
-- Expected: 3 rows
-- =============================================================================
