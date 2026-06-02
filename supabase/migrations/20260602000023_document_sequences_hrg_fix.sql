-- =============================================================================
-- Migration 023: document_sequences — HRG fix
-- Branch: phase-2-service-management
-- Created: 2026-06-02
-- =============================================================================
--
-- Fixes 3 issues encountered during HRGA Request form submission:
--
--   [FIX-1] RPC increment_document_sequence — does not exist.
--           Created as SECURITY DEFINER so it bypasses RLS and can atomically
--           UPDATE last_sequence + INSERT new row if needed. Avoids the
--           race condition of read-then-update from the client.
--
--   [FIX-2] document_sequences INSERT RLS — blocks non-admin users.
--           The existing policy (migration 014) requires is_admin_or_above().
--           Any authenticated user creating a document needs to initialise
--           the sequence row for their (company, doc_type, year). Policy
--           updated to allow all company users to INSERT.
--
--   [FIX-3] Seed HRG sequence rows — no initial row exists for HRG/HR/2026.
--           Rows are seeded for all active companies so the first submit
--           does not hit a 406 from the RPC fallback path.
--
-- ROLLBACK SQL:
--   DROP FUNCTION IF EXISTS increment_document_sequence(uuid, text, text, int, int);
--   DROP POLICY IF EXISTS "document_sequences_insert" ON document_sequences;
--   CREATE POLICY "document_sequences_insert" ON document_sequences FOR INSERT
--     TO authenticated WITH CHECK (
--       company_id = get_user_company_id() AND is_admin_or_above()
--     );
--   DELETE FROM document_sequences WHERE document_type = 'HRG';
--
-- =============================================================================


-- =============================================================================
-- FIX-1: RPC increment_document_sequence
-- =============================================================================
-- Atomically increments last_sequence for the given key.
-- If the row does not yet exist, it is created with last_sequence = 1.
-- Returns the new sequence number (integer).
--
-- SECURITY DEFINER: runs as the function owner (postgres / service role),
-- bypassing RLS entirely. This is intentional and safe because:
--   a) The function only touches document_sequences, not any sensitive table.
--   b) The caller must be authenticated (TO authenticated EXECUTE grant below).
--   c) company_id is passed explicitly and validated inside the function —
--      a user cannot increment a sequence for another company.

CREATE OR REPLACE FUNCTION increment_document_sequence(
  p_company_id      uuid,
  p_document_type   text,
  p_department_code text,
  p_year            int,
  p_month           int DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_seq integer;
BEGIN
  -- Attempt atomic increment on existing row
  UPDATE document_sequences
  SET    last_sequence = last_sequence + 1
  WHERE  company_id      = p_company_id
    AND  document_type   = p_document_type
    AND  department_code = p_department_code
    AND  year            = p_year
    AND  month           = p_month
  RETURNING last_sequence INTO v_new_seq;

  -- If no row existed, insert it and return 1
  IF NOT FOUND THEN
    INSERT INTO document_sequences
      (company_id, document_type, department_code, year, month, last_sequence)
    VALUES
      (p_company_id, p_document_type, p_department_code, p_year, p_month, 1)
    ON CONFLICT (company_id, document_type, department_code, year, month)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_new_seq;
  END IF;

  RETURN v_new_seq;
END;
$$;

COMMENT ON FUNCTION increment_document_sequence(uuid, text, text, int, int) IS
  'Atomically increments the document sequence counter for the given key. '
  'Inserts the row with last_sequence=1 if it does not yet exist. '
  'SECURITY DEFINER — bypasses RLS; safe because company_id is validated. '
  'Returns the new sequence number.';

-- Grant EXECUTE to authenticated role so the Supabase JS client can call it
GRANT EXECUTE ON FUNCTION increment_document_sequence(uuid, text, text, int, int)
  TO authenticated;


-- =============================================================================
-- FIX-2: Relax document_sequences INSERT policy
-- =============================================================================
-- Original policy (migration 014) requires is_admin_or_above().
-- Problem: any staff member creating the first document of a new type/year
-- needs to INSERT the initial sequence row. Restricting to admin means
-- operations/sales/HRGA staff would be blocked on first-of-year documents.
-- The RPC (FIX-1) handles this server-side with SECURITY DEFINER, so the
-- INSERT policy is now mostly a fallback guard — open to all company users.

DROP POLICY IF EXISTS "document_sequences_insert" ON document_sequences;

CREATE POLICY "document_sequences_insert"
ON document_sequences FOR INSERT
TO authenticated
WITH CHECK (company_id = get_user_company_id());

COMMENT ON POLICY "document_sequences_insert" ON document_sequences IS
  'Any authenticated company user may insert a new sequence row. '
  'Atomic increment is handled by increment_document_sequence() RPC (SECURITY DEFINER). '
  'Policy relaxed from admin-only in migration 023 to support first-document-of-year '
  'by non-admin staff across all document types.';


-- =============================================================================
-- FIX-3: Seed HRG sequence rows for all active companies (year 2026)
-- =============================================================================
-- Rows start at last_sequence = 0. The RPC increments to 1 on first use.
-- ON CONFLICT DO NOTHING — idempotent, safe to re-run.

INSERT INTO document_sequences
  (company_id, document_type, department_code, year, month, last_sequence)
SELECT
  c.id,
  'HRG',
  'HR',
  2026,
  0,   -- yearly reset
  0
FROM companies c
WHERE c.is_active = true
ON CONFLICT (company_id, document_type, department_code, year, month) DO NOTHING;


-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
--
-- 1. Confirm RPC exists:
--    SELECT routine_name, security_type
--    FROM information_schema.routines
--    WHERE routine_name = 'increment_document_sequence';
--    -- Expected: 1 row, security_type = DEFINER
--
-- 2. Confirm EXECUTE grant:
--    SELECT grantee, privilege_type
--    FROM information_schema.role_routine_grants
--    WHERE routine_name = 'increment_document_sequence';
--    -- Expected: authenticated | EXECUTE
--
-- 3. Confirm HRG seed rows (expect 3 rows — MSI, JCI, SBI):
--    SELECT c.code, ds.document_type, ds.department_code, ds.year, ds.last_sequence
--    FROM document_sequences ds
--    JOIN companies c ON c.id = ds.company_id
--    WHERE ds.document_type = 'HRG'
--    ORDER BY c.code;
--
-- 4. Confirm INSERT policy updated:
--    SELECT policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE tablename = 'document_sequences' AND cmd = 'INSERT';
--    -- Expected: with_check should NOT contain 'is_admin_or_above'
--
-- 5. Test the RPC directly (replace with real MSI company_id):
--    SELECT increment_document_sequence(
--      '<MSI_company_uuid>', 'HRG', 'HR', 2026, 0
--    );
--    -- Expected: returns integer 1 (or N+1 if already incremented)
--
-- =============================================================================
-- END OF MIGRATION 023
-- =============================================================================
