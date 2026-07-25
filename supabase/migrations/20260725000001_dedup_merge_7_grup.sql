-- ============================================================================
-- Dedup akun: merge 7 grup duplikat identik-setelah-normalisasi (per-entitas MSI)
-- SUDAH DIJALANKAN MANUAL 2026-07-25. File ini ARSIP — aman di-skip saat rebuild.
-- Guard: hanya jalan kalau akun 'drop' masih aktif (belum ter-merge).
-- ============================================================================
DO $merge7$
DECLARE
  n_act int; n_inq_p int; n_inq_c int; n_quo_p int; n_quo_c int; n_ren int; n_del int; dangling int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.accounts
             WHERE id = '22223285-8ff9-42d2-85ef-f64d76a98ff0' AND deleted_at IS NOT NULL) THEN
    RAISE NOTICE 'SKIP: merge 7 grup sudah dijalankan sebelumnya.';
    RETURN;
  END IF;

  CREATE TEMP TABLE _map(drop_id uuid, keep_id uuid) ON COMMIT DROP;
  INSERT INTO _map(drop_id, keep_id) VALUES
    ('22223285-8ff9-42d2-85ef-f64d76a98ff0','aafb8b25-da55-498f-8787-cc094f890456'),
    ('ce58988f-761b-4ed1-81d3-088b1e6c48aa','ed7a3543-dc3a-48d3-9c34-4b59e875a78a'),
    ('e8e1a52f-eaad-4c6f-9b30-350333cffa1e','bb69c993-49b2-4a74-99d7-8bc5a9b3b887'),
    ('5f146335-4884-4477-aea6-cd95638f790c','02ed573f-5906-4b89-893a-4d2a0a05594a'),
    ('3e2ae05f-5bdb-4771-86c6-9e023692f9dc','96040e7d-c508-48f5-bbf4-6bc49603c7ec'),
    ('079c45bc-60de-48fe-a25c-3442401f2f9e','37e0eb5e-832d-41a9-a1eb-df41444a80e9'),
    ('d9c25c0d-43e1-4099-9fb8-293e209a3e89','147d7e40-e00c-4d8a-af21-5b974ba88004');

  UPDATE public.activities a SET account_id = m.keep_id FROM _map m WHERE a.account_id = m.drop_id;
  GET DIAGNOSTICS n_act = ROW_COUNT;
  UPDATE public.inquiries i SET prospect_id = m.keep_id FROM _map m WHERE i.prospect_id = m.drop_id;
  GET DIAGNOSTICS n_inq_p = ROW_COUNT;
  UPDATE public.inquiries i SET customer_id = m.keep_id FROM _map m WHERE i.customer_id = m.drop_id;
  GET DIAGNOSTICS n_inq_c = ROW_COUNT;
  UPDATE public.quotations q SET prospect_id = m.keep_id FROM _map m WHERE q.prospect_id = m.drop_id;
  GET DIAGNOSTICS n_quo_p = ROW_COUNT;
  UPDATE public.quotations q SET customer_id = m.keep_id FROM _map m WHERE q.customer_id = m.drop_id;
  GET DIAGNOSTICS n_quo_c = ROW_COUNT;

  UPDATE public.accounts SET name = 'HISAKA WORKS INDONESIA'
  WHERE id = 'bb69c993-49b2-4a74-99d7-8bc5a9b3b887' AND deleted_at IS NULL;
  GET DIAGNOSTICS n_ren = ROW_COUNT;

  UPDATE public.accounts SET deleted_at = now()
  WHERE id IN (SELECT drop_id FROM _map) AND deleted_at IS NULL;
  GET DIAGNOSTICS n_del = ROW_COUNT;

  SELECT (SELECT count(*) FROM public.inquiries  WHERE prospect_id IN (SELECT drop_id FROM _map) OR customer_id IN (SELECT drop_id FROM _map))
       + (SELECT count(*) FROM public.quotations WHERE prospect_id IN (SELECT drop_id FROM _map) OR customer_id IN (SELECT drop_id FROM _map))
       + (SELECT count(*) FROM public.activities WHERE account_id IN (SELECT drop_id FROM _map))
  INTO dangling;

  RAISE NOTICE 'act:%, inq p/c:%/%, quo p/c:%/%, rename:%, del:%, dangling:%',
    n_act, n_inq_p, n_inq_c, n_quo_p, n_quo_c, n_ren, n_del, dangling;

  IF dangling <> 0 THEN RAISE EXCEPTION 'ROLLBACK: % child nyangkut', dangling; END IF;
  IF n_del  <> 7 THEN RAISE EXCEPTION 'ROLLBACK: del % (harusnya 7)', n_del; END IF;
END
$merge7$;
