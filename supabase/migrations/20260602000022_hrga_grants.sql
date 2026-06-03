-- =============================================================================
-- Migration 022: HRGA Tables — GRANT DML to authenticated role
-- Branch: phase-2-service-management
-- Created: 2026-06-02
-- =============================================================================
--
-- Root cause:
--   Migrations 000–019 were applied to a Supabase project that auto-grants
--   SELECT/INSERT/UPDATE/DELETE on public tables to the `authenticated` role
--   (Supabase default behaviour for tables created via the Dashboard or older
--   CLI versions).
--
--   Migration 020 was pushed via the Supabase CLI to a project where the
--   default grants are NOT automatically applied — only TRUNCATE, REFERENCES,
--   and TRIGGER were granted. RLS policies are syntactically correct but
--   unreachable: Postgres checks table-level GRANT before evaluating RLS.
--   Result: "permission denied for table hrga_requests" for all users including
--   super_admin, because the privilege check fails before RLS is even evaluated.
--
-- Fix: explicitly GRANT the required DML privileges on all 9 HRGA tables.
--
-- Privilege scope per table (mirrors RLS policy intent):
--   hrga_request_types          — SELECT (all auth), INSERT/UPDATE (admin/hrga)
--   hrga_approval_configs       — SELECT/INSERT/UPDATE (admin/hrga)
--   hrga_requests               — SELECT/INSERT/UPDATE (requester + approvers)
--   hrga_request_items          — SELECT/INSERT/UPDATE (requester during draft)
--   hrga_request_approvals      — SELECT/INSERT (approvers, INSERT-only for approvals)
--   hrga_request_attachments    — SELECT/INSERT/UPDATE (upload + soft-delete)
--   hrga_notification_queue     — SELECT/INSERT/UPDATE (app + admin)
--   hrga_offboarding_checklists — SELECT/INSERT/UPDATE (admin/hrga)
--   hrga_offboarding_items      — SELECT/INSERT/UPDATE (system + approvers)
--
-- Note: GRANT is at the table level — RLS policies enforce the actual row and
-- operation restrictions. Granting UPDATE here does not bypass RLS; it only
-- allows the authenticated role to attempt the operation (RLS still gates it).
--
-- ROLLBACK SQL:
--   REVOKE SELECT, INSERT, UPDATE, DELETE ON
--     hrga_request_types, hrga_approval_configs, hrga_requests,
--     hrga_request_items, hrga_request_approvals, hrga_request_attachments,
--     hrga_notification_queue, hrga_offboarding_checklists, hrga_offboarding_items
--   FROM authenticated;
--
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON hrga_request_types          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_approval_configs       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_requests               TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_request_items          TO authenticated;
GRANT SELECT, INSERT         ON hrga_request_approvals      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_request_attachments    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_notification_queue     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_offboarding_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_offboarding_items      TO authenticated;

-- Also add this pattern to migration 020 header note for future reference
-- (No hard FK to roles.role_code — approver_role is varchar, validated by app)

-- =============================================================================
-- END OF MIGRATION 022
-- =============================================================================
