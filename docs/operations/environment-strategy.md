# Nexus by MSI — Environment Strategy

**Last Updated:** 2026-05-23

---

## Overview

Nexus by MSI requires strict separation between development, staging, and production environments. Mixing environments is a critical security and data integrity risk.

---

## 1. Environment Summary

| Environment | Purpose | Data | Access |
|-------------|---------|------|--------|
| `development` | Local development and feature work | Seed / test data only | Dev team |
| `staging` | QA, integration testing, UAT | Sanitized copy or test data | Dev team + QA + PM |
| `production` | Live business operations | Real business data | Authorized users only |

---

## 2. Environment Variables

### Required Variables

```bash
# Supabase
VITE_SUPABASE_URL=         # Supabase project URL (different per environment)
VITE_SUPABASE_ANON_KEY=    # Supabase anon key (different per environment)

# App
VITE_APP_ENV=              # development | staging | production

# Monitoring
VITE_SENTRY_DSN=           # Sentry DSN (different per environment, empty for dev)
```

### Environment Variable Rules

1. `.env.local` — local development values, never committed to git
2. `.env.example` — template with empty values, committed to git
3. `.env.staging` — staging values, stored in CI/CD secrets (not in git)
4. `.env.production` — production values, stored in CI/CD secrets (not in git)
5. Never commit any file containing real Supabase credentials to git
6. Rotate credentials immediately if accidentally committed

### Vercel Environment Variable Management

| Variable | Development | Staging | Production |
|----------|------------|---------|------------|
| `VITE_SUPABASE_URL` | Dev project URL | Staging project URL | Prod project URL |
| `VITE_SUPABASE_ANON_KEY` | Dev anon key | Staging anon key | Prod anon key |
| `VITE_APP_ENV` | `development` | `staging` | `production` |
| `VITE_SENTRY_DSN` | (empty) | Staging Sentry DSN | Prod Sentry DSN |

---

## 3. Supabase Project Separation

Each environment has its own Supabase project:

### Development Project (`nexus-dev`)
- Used for local development
- Data: seed data, test customers, test jobs
- Schema migrations applied here first
- RLS tested here
- No real business data
- Credentials stored in `.env.local` only

### Staging Project (`nexus-staging`)
- Mirror of production schema
- Data: sanitized export from production OR generated test data
- Used for UAT and QA before production deploy
- Staging migrations must be identical to production migrations
- Access: dev team, QA, PM

### Production Project (`nexus-prod`)
- Live business data
- Only authorized personnel have Supabase dashboard access
- Service role key stored only in Supabase Edge Function secrets
- Never use production project for development or testing

---

## 4. Data Sanitization for Staging

When copying production data to staging:

Fields that must be anonymized:
- Customer email → `test_{id}@example.com`
- Customer phone → `+62-XXX-XXXX-XXXX`
- Employee email → `employee_{id}@example.com`
- Bank account numbers → `XXXXXXXXXXXX`
- Tax IDs → `000000000000000`
- Names: may be kept or replaced with test names

Financial amounts: may be kept (amounts are not PII).

**Never copy production Supabase Auth users to staging.** Create separate test users in staging.

---

## 5. Feature Flags (Future)

Feature flags can be used to control feature rollout between environments:

```typescript
const FEATURES = {
  approval_engine: process.env.VITE_APP_ENV !== 'development', // staging + prod only
  public_tracking: process.env.VITE_APP_ENV === 'production',  // prod only
  new_dashboard: true, // all envs
};
```

---

## 6. Environment Indicators

The application must clearly indicate which environment is active:

```typescript
// Show environment badge in non-production
if (import.meta.env.VITE_APP_ENV !== 'production') {
  // Show banner: "STAGING ENVIRONMENT - Not for real business use"
}
```

Staging should have a visible banner so users don't mistake it for production.

---

## 7. Secrets Management

| Secret | Storage |
|--------|---------|
| Supabase anon key (dev) | `.env.local` (local only) |
| Supabase anon key (staging) | Vercel environment variables |
| Supabase anon key (production) | Vercel environment variables |
| Supabase service role key | Supabase Edge Function secrets ONLY |
| Sentry DSN | Vercel environment variables |
| Third-party API keys | Supabase Edge Function secrets |

**The Supabase service role key must NEVER be stored in Vercel environment variables or any frontend-accessible location.**

---

## 8. Environment Checklist

Before promoting to a new environment:

### Dev → Staging
- [ ] Feature branch merged to `dev`
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Migration tested on dev Supabase
- [ ] PR reviewed and approved
- [ ] Merge to `staging` branch
- [ ] Migration applied to staging Supabase
- [ ] Staging deployment verified

### Staging → Production
- [ ] All staging tests passed
- [ ] UAT completed by PM / business stakeholder
- [ ] No critical bugs open
- [ ] Migration applied to staging and tested for 1 business day
- [ ] Production deployment explicitly approved by Tech Lead + Project Owner
- [ ] Migration applied to production Supabase
- [ ] Monitoring active (Sentry, Supabase logs)
- [ ] Rollback plan ready
