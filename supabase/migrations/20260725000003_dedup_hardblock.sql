-- ============================================================================
-- Hard-block dedup: pg_trgm + normalize_account_name + UNIQUE index per-entitas.
-- Idempotent (IF NOT EXISTS / OR REPLACE) — aman di-replay saat rebuild.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.normalize_account_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT lower(regexp_replace(
           regexp_replace(coalesce(p_name,''), '\y(PT|CV|TBK)\y\.?', '', 'gi'),
           '[^a-zA-Z0-9]', '', 'g'));
$fn$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_norm_name_per_entitas
ON public.accounts (company_id, public.normalize_account_name(name))
WHERE deleted_at IS NULL;
