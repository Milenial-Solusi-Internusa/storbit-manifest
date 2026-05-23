# Nexus by MSI — Performance Baseline

**Last Updated:** 2026-05-23

---

## Overview

Performance is a first-class requirement in Nexus by MSI. This document defines the mandatory performance baseline that every feature must meet.

---

## 1. Core Performance Rules

| Rule | Requirement |
|------|-------------|
| List pages | Must use server-side pagination — no full table load |
| Search / filter | Must be server-side — no frontend filter on full dataset |
| Sort | Must be server-side — no frontend sort on full dataset |
| Search input | Must be debounced (minimum 300ms) before triggering query |
| Column selection | Must select only required columns — no `SELECT *` for list queries |
| Dashboard aggregates | Must use aggregate queries or materialized views |
| Reports | Must not compute heavy data in frontend components |
| Large row rendering | Must not render more than 100 rows at a time without virtualization |
| Attachments | Must use lazy loading and signed URLs |
| Public API | Must return lightweight DTOs |
| Code splitting | Large modules must use lazy loading / dynamic import |

---

## 2. Server-Side Pagination

### Requirements
- All list/table pages must implement server-side pagination
- Default page size: 25 rows
- Maximum page size: 100 rows
- Pagination must work with all active filters and sort options

### Implementation Pattern
```typescript
// hooks/usePaginatedList.ts
interface PaginatedListOptions {
  table: string;
  columns: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortAscending?: boolean;
  pageSize?: number;
}

export function usePaginatedList({
  table,
  columns,
  filters = {},
  sortBy = 'created_at',
  sortAscending = false,
  pageSize = 25,
}: PaginatedListOptions) {
  const [page, setPage] = useState(0);

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const query = supabase
    .from(table)
    .select(columns, { count: 'exact' })
    .is('deleted_at', null)
    .order(sortBy, { ascending: sortAscending })
    .range(from, to);

  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.eq(key, value);
    }
  });

  // ... useEffect, loading, error state
}
```

---

## 3. Server-Side Search

### Requirements
- Search must execute on the server, not client
- Search must be debounced minimum 300ms
- Search must target indexed columns only
- Use `ilike` for case-insensitive text search on short columns
- Use `tsquery` / `tsvector` for full-text search on large text fields (future)

### Implementation Pattern
```typescript
// hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// In list component
const debouncedSearch = useDebounce(searchInput, 300);

useEffect(() => {
  if (debouncedSearch) {
    // Trigger server search
    refetch({ search: debouncedSearch });
  }
}, [debouncedSearch]);
```

---

## 4. Column Selection

Always specify exact columns needed. Never use `*` for large list queries:

```typescript
// WRONG — loads all columns
const { data } = await supabase.from('invoices').select('*');

// CORRECT — only what the table needs
const { data } = await supabase
  .from('invoices')
  .select(`
    id,
    document_no,
    customer:customers(id, name),
    total_amount,
    status,
    due_date,
    created_at
  `);
```

---

## 5. Database Query Guidelines

| Pattern | Rule |
|---------|------|
| List query | Always filter `deleted_at IS NULL` + `company_id = ?` |
| Sort by date | Always sort on indexed column (`created_at`, `due_date`) |
| Count for pagination | Use `{ count: 'exact' }` only when pagination UI needs it |
| Join related data | Use PostgREST embed (`customer:customers(id, name)`) not a second query |
| Aggregate | Use Supabase RPC or database views for aggregates |
| `LIKE` search | Use `ilike` on indexed columns, avoid `%search%` pattern on large tables |

---

## 6. Frontend Performance

### Code Splitting
All large modules must use React lazy loading:
```typescript
// App.jsx or router
const FinanceModule = React.lazy(() => import('./modules/finance/Finance'));
const ShipmentModule = React.lazy(() => import('./modules/shipment/Shipment'));

// Wrap with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <FinanceModule />
</Suspense>
```

### Avoid Re-renders
- Use `useMemo` for expensive computed values
- Use `useCallback` for stable function references passed to children
- Use `React.memo` for pure display components that receive unchanged props

### Large Lists
- Never render more than 100 rows without row virtualization
- Consider `react-window` or similar for very large lists (1000+ rows)

---

## 7. Dashboard Performance

Dashboard metrics must never be computed in the frontend component:

```typescript
// WRONG — fetching all jobs and computing in frontend
const { data: allJobs } = await supabase.from('jobs').select('*');
const totalRevenue = allJobs.reduce((sum, j) => sum + j.revenue, 0);

// CORRECT — use RPC aggregate or database view
const { data } = await supabase.rpc('get_dashboard_summary', {
  p_company_id: companyId,
  p_period: 'this_month',
});
```

Dashboard queries must use short cache (5 minutes) and not re-fetch on every render.

---

## 8. Attachment Performance

- Attachments must not load on page mount — lazy load when user expands the section
- Signed URLs must be generated on demand, not pre-generated for all records in a list
- Use a short signed URL expiry (15 minutes) — regenerate if expired

---

## 9. Performance Targets

| Metric | Target |
|--------|--------|
| Initial page load (TTI) | < 3 seconds on 4G |
| List page load (data) | < 1 second for first page |
| Search response | < 500ms after debounce |
| Dashboard load | < 2 seconds |
| Report generation | < 5 seconds (or async with progress) |
| API response (simple) | < 200ms |
| API response (complex aggregate) | < 1 second |

---

## 10. Performance Monitoring

- Measure and log slow queries (> 500ms) in Supabase logs
- Monitor bundle size — alert if main bundle exceeds 500KB gzipped
- Track Core Web Vitals via Vercel Analytics or equivalent
- Monitor error rate via Sentry
- Review `pg_stat_statements` monthly to identify slow queries
