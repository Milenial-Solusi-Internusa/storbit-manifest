-- Add day-level scoping to increment_document_sequence, needed for BNF's
-- BNF-YYYYMMDD-NNN format (resets per calendar day, unlike PRF/QUO/INQ/MOM
-- which reset per year or per month). DEFAULT 0 on the new column + widened
-- unique constraint keep all 4 existing callers (PRFFormPage, QuotationFormPage,
-- InquiryFormPage, MOMFormPage) byte-for-byte unaffected — they never pass
-- p_day, so PostgREST falls back to the SQL-side default exactly as it
-- already does today for p_month on QUO/INQ/MOM.
--
-- ⚠️ RETROFIT (2026-08-03, after first production run of this file): the
-- CREATE OR REPLACE FUNCTION below does NOT actually replace the pre-existing
-- 5-parameter increment_document_sequence — in Postgres, function identity is
-- name + parameter TYPE LIST, so adding p_day here creates a SEPARATE,
-- ADDITIONAL overload instead of replacing anything. The original (old)
-- 5-parameter function was left behind unchanged, and its own
-- `ON CONFLICT (company_id, document_type, department_code, year, month)`
-- clause broke the moment the unique constraint below was widened to 6
-- columns — every pre-existing caller (PRF/QUO/INQ/MOM, plus HRGA Request and
-- Sales Order Doc which weren't in the original caller audit) started failing
-- with "function ... is not unique" / "no unique or exclusion constraint
-- matching ON CONFLICT" in production. Fixed manually via
-- `DROP FUNCTION IF EXISTS public.increment_document_sequence(uuid, text, text, integer, integer);`
-- (recorded separately as 20260803000003, applied to production before this
-- retrofit). The explicit DROP below is added so that REPLAYING THIS FILE
-- FROM SCRATCH on a fresh environment is self-correcting and never creates
-- the overload in the first place — it does not depend on 20260803000003
-- running afterward to clean up. General lesson for any future RPC migration
-- that changes an existing function's parameter list: DROP FUNCTION the old
-- exact signature explicitly BEFORE CREATE OR REPLACE — never assume REPLACE
-- alone removes a differently-shaped prior version.
--
-- Status: DRAFT — do NOT execute without explicit approval (Nexus schema-change
-- workflow, AGENTS.md "Database Schema Change"). See docs/architecture plan
-- for BNF module (bagian "Migrasi RPC increment_document_sequence").

ALTER TABLE public.document_sequences ADD COLUMN day smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.document_sequences.day IS '0 = not day-scoped (yearly/monthly reset, all pre-existing callers). 1-31 = daily reset (BNF).';

ALTER TABLE public.document_sequences DROP CONSTRAINT document_sequences_unique;

ALTER TABLE public.document_sequences
  ADD CONSTRAINT document_sequences_unique UNIQUE (company_id, document_type, department_code, year, month, day);

-- Explicit drop of the OLD 5-parameter signature FIRST — CREATE OR REPLACE
-- below has a different parameter list (adds p_day) and would otherwise leave
-- this old overload behind, broken, coexisting alongside the new one. See the
-- RETROFIT note at the top of this file for the incident this prevents.
DROP FUNCTION IF EXISTS public.increment_document_sequence(uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.increment_document_sequence(
  p_company_id uuid,
  p_document_type text,
  p_department_code text,
  p_year integer,
  p_month integer DEFAULT 0,
  p_day integer DEFAULT 0
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    AND  day             = p_day
  RETURNING last_sequence INTO v_new_seq;

  -- If no row existed, insert it and return 1
  IF NOT FOUND THEN
    INSERT INTO document_sequences
      (company_id, document_type, department_code, year, month, day, last_sequence)
    VALUES
      (p_company_id, p_document_type, p_department_code, p_year, p_month, p_day, 1)
    ON CONFLICT (company_id, document_type, department_code, year, month, day)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_new_seq;
  END IF;

  RETURN v_new_seq;
END;
$$;
