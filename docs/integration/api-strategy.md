# Nexus by MSI — API Strategy

**Last Updated:** 2026-05-23

---

## Overview

This document defines the API strategy for Nexus by MSI — how internal and external systems interact with the platform, and the principles that govern all API design.

---

## 1. API Layers

Nexus by MSI operates with two distinct API layers:

### 1.1 Internal API (Supabase PostgREST)
- Used by the Nexus frontend (React)
- Authenticated via Supabase JWT
- Protected by Row Level Security (RLS)
- Returns full business data within the user's company scope
- Never exposed publicly without auth

### 1.2 External / Public API (Supabase Edge Functions)
- Used by external consumers: customer portal, vendor portal, public tracking, third-party integrations
- Authenticated via API key or tracking token
- Must return masked DTOs — never raw database rows
- Rate-limited
- Logged via audit events

---

## 2. Internal API Principles

### 2.1 Supabase PostgREST
All internal CRUD operations use Supabase PostgREST:
```
GET    /rest/v1/{table}        → list with filters
GET    /rest/v1/{table}?id=eq.{id} → single record
POST   /rest/v1/{table}        → create
PATCH  /rest/v1/{table}?id=eq.{id} → update
DELETE /rest/v1/{table}?id=eq.{id} → soft delete (via trigger or RLS)
```

### 2.2 Supabase RPC (Database Functions)
Complex operations that require:
- Atomic multi-table writes
- Sequence number generation
- Approval state transitions
- Financial calculations

Must be implemented as Supabase RPC functions:
```
POST /rest/v1/rpc/{function_name}
```

### 2.3 Column Selection
Always select only required columns. Never use `select *` for list queries:
```typescript
const { data } = await supabase
  .from('invoices')
  .select('id, document_no, customer:customers(id, name), total_amount, status, due_date')
  .eq('company_id', companyId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .range(from, to);
```

---

## 3. External API Principles

### 3.1 Endpoint Structure
```
/api/public/{resource}        → public, no auth
/api/tracking/{token}         → tracking token auth
/api/v1/{resource}            → API key auth (future integrations)
```

### 3.2 Data Transfer Objects (DTOs)
All external API responses must use DTOs — purpose-built response shapes that:
- Exclude internal IDs (use public tokens instead)
- Exclude financial data (cost, margin, profit)
- Exclude internal notes
- Exclude PIC personal data
- Exclude approval history details
- Include only customer-safe, public-safe information

Example DTO for public tracking:
```typescript
interface TrackingResponseDTO {
  tracking_ref: string;       // public token, not internal ID
  status: string;             // simplified status
  status_label: string;
  origin: string;
  destination: string;
  etd: string | null;
  eta: string | null;
  last_update: string;
  events: TrackingEventDTO[];
}

// What is NOT included:
// - internal job_id
// - vendor names and costs
// - profit margin
// - internal notes
// - employee names
// - customer credit limit
```

### 3.3 Rate Limiting
All public API endpoints must be rate-limited:
- Public tracking: 30 requests/minute per IP
- API key endpoints: configurable per key
- Burst protection: 429 Too Many Requests with Retry-After header

---

## 4. API Authentication

### Internal (Frontend)
- Supabase anon key + JWT (handled by Supabase Auth client)
- JWT refreshed automatically by Supabase client library

### Public Tracking
- Tracking token (UUID, single-use or time-limited)
- No user authentication required
- Token validates via database lookup
- Token access logged in audit_logs

### Partner API (Future)
- API key in header: `X-API-Key: {key}`
- API keys stored hashed in database
- Keys are rotatable without downtime
- Keys scoped to allowed endpoints and companies
- Keys have expiry date

---

## 5. API Error Responses

Standard error response format:
```json
{
  "error": true,
  "code": "VALIDATION_ERROR",
  "message": "Human-readable error message",
  "details": {}
}
```

Standard HTTP status codes:
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized |
| 403 | Forbidden (RLS / permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 422 | Unprocessable Entity |
| 429 | Rate Limit Exceeded |
| 500 | Internal Server Error |

---

## 6. Edge Functions

Supabase Edge Functions (Deno) are used for:
- Public tracking endpoint
- Email notifications
- Webhook delivery
- Scheduled jobs (report snapshots, retention cleanup)
- API key validation
- Complex business logic that requires server trust (no RLS bypass in frontend)

Edge Functions must:
- Validate all inputs
- Never use service role key unnecessarily
- Return DTOs, not raw rows
- Log important events to audit_logs

---

## 7. Versioning

External APIs must be versioned:
- URL versioning: `/api/v1/`, `/api/v2/`
- Breaking changes require a new version
- Old versions maintained for minimum 6 months after new version release
- Deprecation communicated via response headers: `Deprecation: true`

Internal PostgREST API does not need versioning — it's managed via schema migrations.

---

## 8. Future Integration Targets

| Integration | Type | Priority | Phase |
|-------------|------|----------|-------|
| Email (invoice, notifications) | Outbound | High | 2.0 |
| Customs EDI (INSW / Beacukai) | Outbound | High (JCI) | 2.1 |
| Carrier tracking API | Inbound | Medium (MSI) | 3.0 |
| Accounting software (if needed) | Bidirectional | Low | 4.0 |
| Customer portal | Outbound | Medium | 4.0 |
| Vendor portal | Outbound | Low | 4.0 |
| WhatsApp / notification | Outbound | Medium | 3.0 |
| Bank reconciliation API | Inbound | Medium | 4.0 |
