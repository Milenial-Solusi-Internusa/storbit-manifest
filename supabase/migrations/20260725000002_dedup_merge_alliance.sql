-- ============================================================================
-- Dedup akun: merge 3 akun ALLIANCE (COSMETIC/COSMETICS/ALLIANC) → 1 customer.
-- SUDAH DIJALANKAN MANUAL 2026-07-25. Arsip — aman di-skip saat rebuild.
-- ============================================================================
DO $alliance$
DECLARE dangling int; n_del int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts
             WHERE id = '0982d559-6750-4b74-b22b-f287b5b5c47f' AND deleted_at IS NOT NULL) THEN
    RAISE NOTICE 'SKIP: merge ALLIANCE sudah dijalankan sebelumnya.';
    RETURN;
  END IF;

  SELECT
    (SELECT count(*) FROM public.inquiries  WHERE prospect_id IN ('0982d559-6750-4b74-b22b-f287b5b5c47f','379c3b4c-b1dc-424f-a5dc-01bef2affc79') OR customer_id IN ('0982d559-6750-4b74-b22b-f287b5b5c47f','379c3b4c-b1dc-424f-a5dc-01bef2affc79'))
  + (SELECT count(*) FROM public.quotations WHERE prospect_id IN ('0982d559-6750-4b74-b22b-f287b5b5c47f','379c3b4c-b1dc-424f-a5dc-01bef2affc79') OR customer_id IN ('0982d559-6750-4b74-b22b-f287b5b5c47f','379c3b4c-b1dc-424f-a5dc-01bef2affc79'))
  + (SELECT count(*) FROM public.activities WHERE account_id IN ('0982d559-6750-4b74-b22b-f287b5b5c47f','379c3b4c-b1dc-424f-a5dc-01bef2affc79'))
  INTO dangling;

  IF dangling <> 0 THEN RAISE EXCEPTION 'ROLLBACK: % pointer nyangkut', dangling; END IF;

  UPDATE public.accounts SET deleted_at = now()
  WHERE id IN ('0982d559-6750-4b74-b22b-f287b5b5c47f','379c3b4c-b1dc-424f-a5dc-01bef2affc79')
    AND deleted_at IS NULL;
  GET DIAGNOSTICS n_del = ROW_COUNT;

  IF n_del <> 2 THEN RAISE EXCEPTION 'ROLLBACK: del % (harusnya 2)', n_del; END IF;
  RAISE NOTICE 'ALLIANCE merge OK: del %', n_del;
END
$alliance$;
