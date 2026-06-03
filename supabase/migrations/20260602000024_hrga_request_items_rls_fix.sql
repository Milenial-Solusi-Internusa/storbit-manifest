-- =============================================================================
-- Migration 024: hrga_request_items — fix INSERT RLS policy
-- Branch: phase-2-service-management
-- Created: 2026-06-02
-- =============================================================================
--
-- Root cause:
--   submitHrgaRequest() inserts hrga_requests with status='submitted' immediately
--   (no draft step in the current UI flow), then inserts hrga_request_items.
--   The INSERT policy from migration 020 checks r.status = 'draft' — this
--   subquery returns false when the parent request is already 'submitted',
--   blocking the items insert with a 403.
--
-- Fix:
--   Expand INSERT WITH CHECK to allow items when parent status is
--   'draft' OR 'submitted'. Items are always created atomically with the
--   header in the same submit call — they are never inserted after approval
--   has started. The status guard still prevents inserting items onto
--   requests that are under_review, approved, or completed.
--
-- ROLLBACK SQL:
--   DROP POLICY IF EXISTS hrga_request_items_insert ON hrga_request_items;
--   CREATE POLICY hrga_request_items_insert ON hrga_request_items
--     FOR INSERT TO authenticated WITH CHECK (
--       EXISTS (
--         SELECT 1 FROM hrga_requests r
--         WHERE r.id = hrga_request_items.request_id
--           AND r.requester_id = auth.uid()
--           AND r.status = 'draft'
--           AND r.company_id = get_user_company_id()
--       )
--     );
--
-- =============================================================================

DROP POLICY IF EXISTS hrga_request_items_insert ON hrga_request_items;

CREATE POLICY hrga_request_items_insert ON hrga_request_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id        = hrga_request_items.request_id
        AND r.requester_id = auth.uid()
        AND r.status    IN ('draft', 'submitted')
        AND r.company_id   = get_user_company_id()
    )
  );

COMMENT ON POLICY hrga_request_items_insert ON hrga_request_items IS
  'Requester can insert line items while parent request is draft or submitted. '
  'Items are created atomically with the header in submitHrgaRequest(). '
  'Status guard prevents adding items to requests already under_review or approved.';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Confirm new policy:
--   SELECT policyname, with_check
--   FROM pg_policies
--   WHERE tablename = 'hrga_request_items' AND cmd = 'INSERT';
--   -- Expected: with_check contains status IN ('draft', 'submitted')
--
-- =============================================================================
-- END OF MIGRATION 024
-- =============================================================================
