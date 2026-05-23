# Nexus by MSI — Reporting Performance

**Last Updated:** 2026-05-23

---

## Overview

Reporting is one of the highest-risk performance areas. Reports often involve large datasets, complex aggregations, and multiple table joins. This document defines the strategy for keeping reports fast and the platform stable.

---

## 1. Core Rules

1. Never compute heavy reports entirely in frontend components
2. Never load all rows into memory for reporting
3. Use aggregate queries or materialized views for dashboard metrics
4. Use report snapshots for period-based financial reports
5. Large report generation must be async — do not block the UI
6. Export must be server-side or chunked — never load 10,000 rows to frontend then export
7. Report filters must be applied server-side, not client-side

---

## 2. Report Categories

### Category A: Dashboard Widgets (Real-time Aggregate)
- Small, single-metric widgets
- Revenue this month, open jobs, AR outstanding
- Use aggregate SQL queries via RPC
- Cache 5 minutes

### Category B: Operational List Reports (Paginated)
- Invoice list, job list, AR tracker
- Standard list view with filters
- Server-side pagination, filter, sort
- Max 100 rows per page

### Category C: Period Financial Reports (Snapshot)
- Monthly P&L, AR Aging, AP Aging, Trial Balance
- Generated on-demand or scheduled
- Stored as snapshots (not recomputed every view)
- Not suitable for real-time — use snapshot with timestamp

### Category D: Large Data Exports
- Full invoice export, full transaction export
- Restricted to Head Level roles
- Async generation — user gets notified when ready
- File stored in private storage, signed URL for download
- Auto-deleted after 24 hours

---

## 3. Dashboard Aggregate Pattern

```sql
-- Example: monthly revenue aggregate function
CREATE OR REPLACE FUNCTION get_dashboard_summary(
  p_company_id uuid,
  p_year integer,
  p_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'revenue_this_month',
    (
      SELECT COALESCE(SUM(total_amount), 0)
      FROM invoices
      WHERE company_id = p_company_id
        AND status = 'paid'
        AND EXTRACT(YEAR FROM created_at) = p_year
        AND EXTRACT(MONTH FROM created_at) = p_month
        AND deleted_at IS NULL
    ),
    'open_jobs',
    (
      SELECT COUNT(*)
      FROM jobs
      WHERE company_id = p_company_id
        AND status = 'in_progress'
        AND deleted_at IS NULL
    ),
    'ar_outstanding',
    (
      SELECT COALESCE(SUM(outstanding_amount), 0)
      FROM ar_transactions
      WHERE company_id = p_company_id
        AND status != 'cleared'
        AND deleted_at IS NULL
    )
  );
END;
$$;
```

Call from frontend:
```typescript
const { data } = await supabase.rpc('get_dashboard_summary', {
  p_company_id: companyId,
  p_year: currentYear,
  p_month: currentMonth,
});
```

---

## 4. AR Aging Report

AR Aging is a common finance report. It must be computed server-side:

```sql
-- AR Aging view (simplified)
CREATE OR REPLACE VIEW ar_aging_view AS
SELECT
  company_id,
  customer_id,
  c.name AS customer_name,
  invoice_id,
  document_no,
  total_amount,
  outstanding_amount,
  due_date,
  CURRENT_DATE - due_date AS days_overdue,
  CASE
    WHEN CURRENT_DATE <= due_date THEN 'current'
    WHEN CURRENT_DATE - due_date <= 30 THEN '1_30_days'
    WHEN CURRENT_DATE - due_date <= 60 THEN '31_60_days'
    WHEN CURRENT_DATE - due_date <= 90 THEN '61_90_days'
    ELSE 'over_90_days'
  END AS aging_bucket
FROM ar_transactions ar
JOIN customers c ON c.id = ar.customer_id
WHERE ar.status != 'cleared'
  AND ar.deleted_at IS NULL;
```

Served via RPC with company_id filter and pagination.

---

## 5. Report Snapshot Strategy

For period-based reports (monthly P&L, quarterly summary):

### Snapshot Table
```sql
report_snapshots (
  id              uuid PK
  company_id      uuid NOT NULL
  report_type     varchar(50) NOT NULL    -- e.g. monthly_pl, ar_aging, trial_balance
  period_year     integer NOT NULL
  period_month    integer
  generated_at    timestamptz NOT NULL
  generated_by    uuid NOT NULL
  data            jsonb NOT NULL          -- full report data
  row_count       integer
  file_url        text                    -- if exported to file
  is_current      boolean DEFAULT true   -- latest snapshot for period
  created_at      timestamptz DEFAULT now()
)
```

### Snapshot Rules
- A new snapshot is created each time the report is generated
- Only the latest snapshot per (company, report_type, period) is marked `is_current = true`
- Old snapshots are retained for audit purposes
- Snapshots can be scheduled (e.g. auto-generate AR aging at 8am daily)
- Snapshots are NOT recomputed on every view — serve from snapshot until regenerated

---

## 6. Large Export Strategy

For exports exceeding 1,000 rows:

```
1. User triggers export request
2. System creates export_job record (status: queued)
3. Background process (Edge Function / pg_cron):
   - Fetches data in batches of 500 rows
   - Generates CSV/Excel file
   - Uploads to private storage
   - Updates export_job status to: completed
4. User receives notification: "Your export is ready"
5. User downloads via signed URL (expires in 1 hour)
6. File auto-deleted from storage after 24 hours
```

Export jobs table:
```sql
export_jobs (
  id              uuid PK
  company_id      uuid NOT NULL
  module          varchar(50) NOT NULL
  filters         jsonb
  status          varchar(50) DEFAULT 'queued'  -- queued, processing, completed, failed
  row_count       integer
  file_url        text
  file_expires_at timestamptz
  requested_by    uuid NOT NULL
  created_at      timestamptz DEFAULT now()
  completed_at    timestamptz
)
```

---

## 7. Materialized Views (Future)

For extremely heavy aggregate queries that run frequently:

```sql
-- Example: company monthly revenue summary
CREATE MATERIALIZED VIEW company_monthly_revenue AS
SELECT
  company_id,
  EXTRACT(YEAR FROM created_at)::integer AS year,
  EXTRACT(MONTH FROM created_at)::integer AS month,
  SUM(total_amount) AS total_revenue,
  COUNT(*) AS invoice_count
FROM invoices
WHERE status = 'paid' AND deleted_at IS NULL
GROUP BY company_id, year, month;

-- Refresh strategy: refresh on demand or scheduled (not automatic)
REFRESH MATERIALIZED VIEW CONCURRENTLY company_monthly_revenue;
```

Use materialized views only when:
- The query is used frequently (multiple times per hour)
- The underlying data changes infrequently relative to query frequency
- The computation takes > 1 second

---

## 8. Indexes for Reporting

Key indexes that must exist before reports go live:

```sql
-- For AR aging queries
CREATE INDEX idx_ar_company_status_due ON ar_transactions(company_id, status, due_date);

-- For revenue aggregate
CREATE INDEX idx_invoices_company_status_created ON invoices(company_id, status, created_at);

-- For job count queries
CREATE INDEX idx_jobs_company_status ON jobs(company_id, status);

-- For period filtering
CREATE INDEX idx_invoices_company_period ON invoices(company_id, EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at))
  WHERE deleted_at IS NULL;
```
