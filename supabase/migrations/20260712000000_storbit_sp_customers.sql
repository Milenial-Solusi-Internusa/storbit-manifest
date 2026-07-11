-- RPC: storbit_sp_customers
-- Daftar customer Storbit (SOA) yang punya SP, untuk dropdown dashboard.
-- DISTINCT customer dari sp_items join accounts, difilter company SOA eksplisit,
-- urut alfabet. Gantikan Query A (sp_items .limit(5000) + Set) + Query B
-- (accounts resolve nama) di frontend. Dibuat manual di SQL Editor 2026-07-12.

CREATE OR REPLACE FUNCTION public.storbit_sp_customers()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('customer_id', customer_id, 'name', name)
      ORDER BY name
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT a.id AS customer_id, a.name AS name
    FROM public.sp_items s
    JOIN public.accounts a ON a.id = s.customer_id
    WHERE s.customer_id IS NOT NULL
      AND a.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'
  ) t;
$fn$;

GRANT EXECUTE ON FUNCTION public.storbit_sp_customers() TO anon, authenticated, service_role;
