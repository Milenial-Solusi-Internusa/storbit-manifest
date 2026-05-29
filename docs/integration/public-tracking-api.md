# Nexus by MSI — Public Tracking API

**Last Updated:** 2026-05-23

---

## Overview

The Public Tracking API allows customers and the public to track shipment or job status without logging in. It is designed to be lightweight, secure, and safe for public exposure.

---

## 1. Design Principles

1. No authentication required (public endpoint)
2. Never return internal IDs or sensitive data
3. Use tracking token instead of job/shipment ID
4. Return masked DTOs only
5. Rate-limited per IP
6. Log all access in audit_logs
7. Short-lived cache for performance

---

## 2. Endpoint

```
GET /api/public/tracking/{tracking_token}
```

### Request
| Parameter | Location | Description |
|-----------|----------|-------------|
| `tracking_token` | URL path | Unique public tracking reference |

No authentication headers required.

### Response (Success — 200)
```json
{
  "tracking_ref": "TRK-MSI-2026-A1B2C3D4",
  "status": "in_progress",
  "status_label": "In Transit",
  "service_type": "Sea Freight",
  "origin": "Jakarta, Indonesia",
  "destination": "Singapore",
  "etd": "2026-05-25",
  "eta": "2026-05-28",
  "vessel": "MV Ever Given",
  "voyage": "VY-001",
  "bl_number": "MSCUXXXXXXX",
  "last_update": "2026-05-23T14:30:00Z",
  "events": [
    {
      "date": "2026-05-23T10:00:00Z",
      "event": "Cargo Loaded",
      "location": "Tanjung Priok Port",
      "notes": null
    },
    {
      "date": "2026-05-22T08:00:00Z",
      "event": "Export Customs Cleared",
      "location": "Jakarta",
      "notes": null
    }
  ]
}
```

### Response (Not Found — 404)
```json
{
  "error": true,
  "code": "TRACKING_NOT_FOUND",
  "message": "Tracking reference not found or has expired."
}
```

### Response (Rate Limited — 429)
```json
{
  "error": true,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

---

## 3. Fields Explicitly Excluded from Response

The following data must NEVER appear in the tracking response:

| Excluded Field | Reason |
|---------------|--------|
| `job_id` (internal UUID) | Internal ID |
| `company_id` | Internal reference |
| Vendor names and costs | Commercially sensitive |
| Freight cost / disbursement | Commercially sensitive |
| Profit / margin | Commercially sensitive |
| Customer credit limit | Sensitive |
| Internal notes | Internal |
| Employee / PIC full names | Privacy |
| Employee phone numbers | Privacy |
| Approval history | Internal |
| Customer full address | Privacy |
| Customer tax ID | Privacy |

---

## 4. Tracking Token Design

### Token Format
```
TRK-{ENTITY}-{YEAR}-{RANDOM_HEX}
```
Example: `TRK-MSI-2026-A1B2C3D4E5F6`

### Token Table
```sql
tracking_tokens (
  id              uuid PK
  company_id      uuid NOT NULL
  job_id          uuid NOT NULL REFERENCES jobs(id)
  token           varchar(100) NOT NULL UNIQUE
  is_active       boolean DEFAULT true
  valid_until     timestamptz          -- null = no expiry
  access_count    integer DEFAULT 0
  last_accessed_at timestamptz
  created_by      uuid NOT NULL
  created_at      timestamptz DEFAULT now()
)
```

### Token Generation Rules
- Token is generated when a job is confirmed / approved
- One job can have multiple tokens (for different customers in the same shipment)
- Tokens can be deactivated without affecting the job
- Expired or inactive tokens return 404

---

## 5. Flow

```
Customer / Website
    │
    └─> GET /api/public/tracking/{token}
            │
            └─> Edge Function receives request
                    │
                    ├─> Rate limit check (IP-based)
                    │       └─> If exceeded → 429
                    │
                    ├─> Validate token
                    │       └─> If invalid/expired → 404
                    │
                    ├─> Fetch job public view (RPC)
                    │       └─> Only public-safe fields
                    │
                    ├─> Map to TrackingResponseDTO
                    │       └─> Mask all sensitive fields
                    │
                    ├─> Log access to audit_logs
                    │       └─> event: public_tracking_access
                    │           token (masked), ip, result
                    │
                    └─> Return DTO response
                            └─> Cache for 5 minutes (short TTL)
```

---

## 6. Rate Limiting

| Rule | Value |
|------|-------|
| Requests per minute per IP | 30 |
| Requests per hour per token | 100 |
| Burst limit | 10 requests/second |
| Response on limit exceeded | 429 with Retry-After header |

---

## 7. Caching

| Cache Target | TTL | Strategy |
|-------------|-----|---------|
| Tracking response per token | 5 minutes | Edge Function in-memory or Supabase cache |
| Token validity | 1 minute | Short cache, must re-validate |

Cache must be invalidated when:
- Job status changes
- Tracking events are added
- Token is deactivated

---

## 8. Future Extensions

| Feature | Description | Priority |
|---------|-------------|----------|
| Tracking page (frontend) | Public web page for tracking | Medium |
| QR code per tracking token | Printed on documents | Medium |
| Email notification on status change | Alert customer on milestone | Medium |
| Multiple shipment tracking | Track multiple refs in one request | Low |
| PPJK / Customs status tracking | JCI entity support | High |
| API webhook on status change | Push to customer system | Low |

---

## 9. Implementation Notes

- Implement as Supabase Edge Function (Deno)
- Use Supabase service role key ONLY inside Edge Function, never in frontend
- The Edge Function calls a PostgreSQL RPC function (`get_public_tracking_view`) that returns only the public-safe fields
- The RPC function handles all data masking at the database level
- Edge Function adds rate limiting logic, DTO mapping, and audit logging
