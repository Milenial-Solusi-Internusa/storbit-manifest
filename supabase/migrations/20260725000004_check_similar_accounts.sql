-- ============================================================================
-- Fungsi fuzzy pre-check nama akun (lapisan UX di atas hard-block).
-- SECURITY DEFINER: menembus RLS accounts agar pre-check lintas-pemilik dalam
-- satu entitas. Hanya mengembalikan id+name+skor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_similar_accounts(p_name text, p_company_id uuid)
 RETURNS TABLE(id uuid, name text, similarity real)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH param AS (
    SELECT public.normalize_account_name(p_name) AS norm, 0.6::real AS ambang
  )
  SELECT a.id, a.name,
         public.similarity(public.normalize_account_name(a.name), p.norm) AS similarity
  FROM public.accounts a CROSS JOIN param p
  WHERE a.company_id = p_company_id AND a.deleted_at IS NULL AND p.norm <> ''
    AND public.similarity(public.normalize_account_name(a.name), p.norm) >= p.ambang
  ORDER BY 3 DESC, a.name LIMIT 5;
$fn$;

GRANT EXECUTE ON FUNCTION public.check_similar_accounts(text, uuid) TO authenticated;
