-- RPC: indomarco_dashboard_stats
-- Agregasi KPI dashboard Indomarco di DB (gantikan agregasi client-side yang
-- terpotong .limit(1000)). Dibuat manual di SQL Editor 2026-07-11, direkam
-- sebagai migrasi untuk jejak.

CREATE OR REPLACE FUNCTION public.indomarco_dashboard_stats(p_customer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  WITH base AS (
    SELECT
      sp_no,
      qty,
      shipped_qty,
      NULLIF(trim(dc), '') AS dc_trim,
      sp_date::date        AS sp_date
    FROM public.sp_items
    WHERE customer_id = p_customer_id
  ),
  kpi AS (
    SELECT
      COUNT(DISTINCT sp_no) FILTER (WHERE sp_no IS NOT NULL AND sp_no <> '') AS total_sp,
      COALESCE(SUM(qty), 0)         AS total_ordered,
      COALESCE(SUM(shipped_qty), 0) AS total_realized,
      COUNT(DISTINCT dc_trim)       AS dc_count,
      MIN(sp_date)                  AS period_min,
      MAX(sp_date)                  AS period_max
    FROM base
  ),
  dc_vol AS (
    SELECT dc_trim AS dc, COALESCE(SUM(qty), 0) AS volume
    FROM base
    WHERE dc_trim IS NOT NULL
    GROUP BY dc_trim
  ),
  monthly AS (
    SELECT to_char(sp_date, 'YYYY-MM') AS ym,
           COUNT(DISTINCT sp_no) FILTER (WHERE sp_no IS NOT NULL AND sp_no <> '') AS sp_count
    FROM base
    WHERE sp_date IS NOT NULL
    GROUP BY to_char(sp_date, 'YYYY-MM')
  )
  SELECT jsonb_build_object(
    'total_sp',       (SELECT total_sp       FROM kpi),
    'total_ordered',  (SELECT total_ordered  FROM kpi),
    'total_realized', (SELECT total_realized FROM kpi),
    'dc_count',       (SELECT dc_count       FROM kpi),
    'period_min',     (SELECT period_min     FROM kpi),
    'period_max',     (SELECT period_max     FROM kpi),
    'dc_volumes',     COALESCE((SELECT jsonb_agg(jsonb_build_object('dc', dc, 'volume', volume)) FROM dc_vol), '[]'::jsonb),
    'monthly',        COALESCE((SELECT jsonb_agg(jsonb_build_object('ym', ym, 'sp_count', sp_count)) FROM monthly), '[]'::jsonb)
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.indomarco_dashboard_stats(uuid) TO anon, authenticated, service_role;
