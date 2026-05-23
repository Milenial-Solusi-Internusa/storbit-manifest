# Nexus by MSI — Security Baseline

**Last Updated:** 2026-05-23

---

## Overview

Security is a non-negotiable first-class requirement in Nexus by MSI. This document defines the minimum security baseline that must be met across all modules, environments, and deployments.

---

## 1. Authentication

### 1.1 Supabase Auth
- All authentication is handled via Supabase Auth
- No custom auth implementation is permitted
- JWT tokens issued by Supabase are used for all API calls
- Session expiry must be configured (default: 1 hour access token, 7 day refresh token)

### 1.2 Multi-Factor Authentication (MFA)
MFA is **mandatory** for the following roles:

| Role | MFA Required | Enforcement |
|------|-------------|-------------|
| Super Admin | Yes | Hard-enforced at login |
| Admin | Yes | Hard-enforced at login |
| BOD / Director | Yes | Hard-enforced at login |
| Finance Controller | Yes | Hard-enforced at login |
| Head Level | Yes | Hard-enforced at login |
| Finance Staff | Recommended | Soft-enforce (reminder) |
| Operations Staff | Optional | No enforcement |

MFA enforcement must be server-side — frontend MFA check alone is insufficient.

### 1.3 Inactive User Blocking
- Users terminated or inactive must be blocked immediately
- `is_active = false` in `user_profiles` must block all access
- Supabase Auth user must also be disabled on termination
- Session invalidation must trigger on `is_active` change

---

## 2. Authorization

### 2.1 Row Level Security (RLS)
- RLS must be enabled on ALL business tables
- All RLS policies must scope by `company_id`
- RLS must never be disabled to make code work
- RLS must be reviewed before every schema change
- Use `auth.uid()` and helper functions — never hardcode user IDs

### 2.2 Role-Permission Model
- Authorization must be granular per module and action
- Roles: Super Admin, Admin, BOD, Director, Manager, Head, Finance Controller, Finance Staff, Operations, Sales, Viewer
- Permissions: `{module}.{action}` — e.g. `invoice.create`, `customer.export`, `user.role_change`
- Frontend permission checks are UX only — server must enforce via RLS + DB functions
- Do not rely on frontend-only permission checks for sensitive operations

### 2.3 Service Role Key
- The Supabase service role key must NEVER be used in frontend code
- Service role key is only for trusted server-side processes (Edge Functions, migration scripts)
- If service role is needed in frontend, the architecture is wrong — redesign

---

## 3. Data Security

### 3.1 Sensitive Data
Never expose the following in public APIs, frontend views without permission, or logs:
- Vendor cost and purchase price
- Job profit / margin
- Customer credit limit (except to Finance/Head roles)
- Finance notes and internal notes
- Personal employee data beyond what is needed
- Bank account details (mask except last 4 digits for display)

### 3.2 Attachments
- All file attachments must use **private Supabase Storage buckets**
- Never use public buckets for business documents
- Attachment access must use signed URLs with short expiry (15 minutes default)
- Signed URL generation must be role-gated

### 3.3 Soft Delete
- All business data must use soft delete (`deleted_at` timestamp)
- Hard DELETE is prohibited on business tables
- Soft-deleted records are invisible to normal queries (`WHERE deleted_at IS NULL`)
- Only Super Admin can view or restore soft-deleted records
- Important delete actions (customers, vendors, invoices) require approval

### 3.4 Export Restrictions
- Data export to Excel / CSV is restricted to:
  - Head Level and above
  - Roles explicitly granted `{module}.export` permission
- Export actions must be logged in audit log
- Bulk export endpoints must be rate-limited

---

## 4. API Security

### 4.1 Internal API (Supabase PostgREST)
- All requests authenticated via JWT
- RLS enforced automatically
- No raw internal table rows in public-facing responses
- Supabase anon key is safe in frontend (RLS protects it)
- Service role key is server-only

### 4.2 Public API (Future)
- Public endpoints must use data masking (DTOs)
- Public endpoints must NEVER return:
  - Internal IDs (use tracking tokens instead)
  - Cost / margin / financial data
  - Internal notes
  - Employee / PIC personal data
- Rate limiting is mandatory on all public endpoints
- API keys must be stored securely and rotatable
- Public API requests must be logged (`public_tracking_access` event)

---

## 5. Environment Security

### 5.1 Environment Separation
- Development, Staging, and Production must be completely separated
- Separate Supabase projects per environment
- Separate environment variables per environment
- Never use production credentials in development
- Never deploy directly to production without going through staging

### 5.2 Environment Variables
Required environment variables:
```
VITE_SUPABASE_URL=         # Supabase project URL (per environment)
VITE_SUPABASE_ANON_KEY=    # Supabase anon key (per environment)
VITE_APP_ENV=              # development / staging / production
VITE_SENTRY_DSN=           # Error monitoring DSN
```

Never commit `.env.local` or `.env.production` to source control.
`.env.example` with empty values is the only env file in source control.

---

## 6. Error Monitoring

### 6.1 Sentry Integration (Planned)
- Sentry must be integrated for production error monitoring
- Source maps must NOT be exposed publicly (upload to Sentry, delete from build)
- Error events must never include sensitive user data (PII, financial data)
- Sentry DSN is stored in environment variables

### 6.2 Supabase Logs
- Supabase provides built-in query logs — review regularly for anomalies
- Failed auth attempts must be monitored
- RLS policy violations should be monitored

---

## 7. Security Checklist per Feature

Before any feature goes to production, verify:

- [ ] RLS policy in place and tested
- [ ] Permission check on server side (not only frontend)
- [ ] Sensitive fields masked or excluded from public response
- [ ] Attachments use private bucket + signed URL
- [ ] Soft delete implemented (no hard DELETE)
- [ ] Audit log event triggered for important actions
- [ ] Export restricted to authorized roles
- [ ] No service role key used in frontend
- [ ] No raw database rows returned to public API
- [ ] Input validation on all user-supplied data

---

## 8. Mandatory Audit Events

The following events must always be logged regardless of module:

| Event | Trigger |
|-------|---------|
| `login` | User signs in |
| `logout` | User signs out |
| `create` | Any business record created |
| `update` | Any business record updated |
| `soft_delete` | Any business record soft deleted |
| `restore` | Soft-deleted record restored |
| `submit` | Document submitted for approval |
| `approve` | Document approved |
| `reject` | Document rejected |
| `revise` | Document sent for revision |
| `export` | Data exported |
| `import` | Data imported |
| `attachment_upload` | File attached to record |
| `attachment_delete` | Attachment removed |
| `role_change` | User role added or removed |
| `permission_change` | Role permission modified |
| `api_request` | External API call received |
| `public_tracking_access` | Public tracking endpoint accessed |

See full policy in `docs/security/audit-log-policy.md`.
