# Nexus by MSI — Caching Strategy

**Last Updated:** 2026-05-23

---

## Overview

Caching must be used carefully. The goal is to reduce unnecessary database calls without risking stale or incorrect data in sensitive contexts.

**Rule:** When in doubt, do not cache. Cache only what is safe to cache.

---

## 1. Caching Tiers

| Tier | Location | Mechanism |
|------|----------|-----------|
| Browser Memory | React state / context | `useState`, `useContext` |
| React Query Cache | In-memory per session | `TanStack Query` (future) |
| Service Worker | Browser persistent | For offline support (future) |
| Edge Cache | CDN / Edge Function | Vercel Edge Cache |
| Database Cache | Materialized Views | PostgreSQL |

Current implementation uses React `useState` and `useEffect`. React Query should be adopted when refactoring data fetching.

---

## 2. Caching Rules by Data Type

### Master Data — Safe to Cache (Short to Medium)

| Data | Cache TTL | Invalidate On |
|------|----------|---------------|
| Company list | 30 minutes | Company create/update |
| Branch list | 30 minutes | Branch create/update |
| Department list | 30 minutes | Department create/update |
| Customer list (dropdown) | 10 minutes | Customer create/update |
| Vendor list (dropdown) | 10 minutes | Vendor create/update |
| Product list (dropdown) | 10 minutes | Product create/update |
| Currency list | 1 hour | Currency update |
| Exchange rates | 1 hour | Rate update |
| Chart of accounts | 15 minutes | COA update |
| Document types | 30 minutes | Config change |
| Status catalog | 1 hour | Rarely changes |

### Dashboard Aggregates — Short Cache Only

| Data | Cache TTL | Invalidate On |
|------|----------|---------------|
| Revenue this month | 5 minutes | Invoice approve / job complete |
| AR outstanding total | 5 minutes | Payment received |
| Job count by status | 5 minutes | Job status change |
| Top customers | 10 minutes | — |

### Transaction Lists — Short Cache or No Cache

| Data | Cache TTL | Strategy |
|------|----------|---------|
| Invoice list | 2 minutes or no cache | Refetch on tab focus |
| Job list | 2 minutes or no cache | Refetch on tab focus |
| AR tracker | No cache | Always fresh |
| Approval queue | No cache | Always fresh |
| Audit logs | No cache | Always fresh |

### Finance Data — Very Short or No Cache

| Data | Cache TTL | Notes |
|------|----------|-------|
| Invoice amounts | No cache | Live accuracy required |
| Payment balances | No cache | Must reflect real-time |
| AR aging | 5 minutes max | Acceptable for reporting |
| AP aging | 5 minutes max | Acceptable for reporting |

### Sensitive / Security Data — No Cache or Minimal

| Data | Cache TTL | Notes |
|------|----------|-------|
| User permissions | 5 minutes | Refetch on login / role change |
| Session data | Per Supabase session | Managed by Supabase Auth |
| Audit logs | No cache | Compliance — must be live |
| Signed URLs | 15 minutes max | Short expiry, matches URL TTL |

### Public Tracking — Short Cache

| Data | Cache TTL | Notes |
|------|----------|-------|
| Tracking status response | 5 minutes | Safe for public |
| Token validity | 1 minute | Must re-validate frequently |

---

## 3. Cache Invalidation Rules

Cache must be invalidated when:

| Event | Invalidate |
|-------|-----------|
| User creates a customer | Customer list cache |
| User updates vendor | Vendor list cache, vendor detail cache |
| Invoice approved | AR aggregate, dashboard cache |
| Payment recorded | AR cache, dashboard cache |
| Role changed | User permission cache (immediate) |
| User logs out | All user-specific caches |
| User profile updated | User profile cache |
| Exchange rate updated | Exchange rate cache, any cached amounts |

---

## 4. What Must NOT Be Cached

| Data | Reason |
|------|--------|
| Audit logs | Compliance — must always reflect live state |
| Approval queue | Actions depend on live state |
| Financial balances (AR/AP/Cash) | Must reflect real-time |
| Password / auth tokens | Never cache, let Supabase handle |
| Signed URLs past their expiry | Will result in 403 errors |
| User permission data past role change | Security risk |
| Sensitive PII without encryption | Privacy risk |

---

## 5. Implementation Patterns

### Simple In-Component Cache (Current Pattern)
```typescript
const [customers, setCustomers] = useState<Customer[]>([]);
const [loadedAt, setLoadedAt] = useState<Date | null>(null);
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

useEffect(() => {
  const now = new Date();
  if (loadedAt && (now.getTime() - loadedAt.getTime()) < CACHE_TTL) {
    return; // Use existing data
  }
  fetchCustomers();
}, []);
```

### React Query Pattern (Recommended for Refactor)
```typescript
import { useQuery } from '@tanstack/react-query';

export function useCustomers() {
  return useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => fetchCustomers(companyId),
    staleTime: 10 * 60 * 1000,    // 10 minutes — data considered fresh
    gcTime: 30 * 60 * 1000,        // 30 minutes — keep in cache even when stale
    refetchOnWindowFocus: false,   // do not refetch on tab switch for master data
  });
}

// Finance data — shorter stale time
export function useARSummary() {
  return useQuery({
    queryKey: ['ar-summary', companyId],
    queryFn: () => fetchARSummary(companyId),
    staleTime: 2 * 60 * 1000,     // 2 minutes
    refetchOnWindowFocus: true,    // refetch when user returns to tab
  });
}
```

### Permission Cache — Invalidate on Auth Change
```typescript
// Clear permission cache on login / logout / role change
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    queryClient.invalidateQueries({ queryKey: ['user-profile'] });
  }
});
```

---

## 6. Edge Cache (Public API)

For the Public Tracking API (Edge Function):
```typescript
// Return with cache headers
return new Response(JSON.stringify(dto), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300', // 5 minutes
    'Vary': 'Accept-Encoding',
  },
});
```

Private / authenticated responses must never include `Cache-Control: public`.

---

## 7. Anti-Patterns

| Anti-Pattern | Problem |
|-------------|---------|
| Cache finance balances for long periods | Stale data causes incorrect decisions |
| Cache approval queue | User may miss pending documents |
| Cache audit logs | Compliance data must be live |
| Cache signed URLs past expiry | 403 errors on file access |
| Share cache between companies | Multi-company data leak risk |
| Cache permissions without invalidating on role change | Privilege escalation risk |
| Cache all master data forever | Changes never reflected |
