# Nexus by MSI — Deployment Strategy

**Last Updated:** 2026-05-23

---

## Overview

This document defines the deployment strategy for Nexus by MSI. The strategy prioritizes safety, traceability, and zero-downtime deployments.

---

## 1. Deployment Principles

1. Never deploy directly to production without going through staging
2. Every deployment must be traceable to a git commit and PR
3. All schema migrations must be reviewed and applied separately from code deployments
4. Deployments to production require explicit team approval
5. Rollback plan must exist for every production deployment
6. Do not push or deploy unless explicitly instructed

---

## 2. Deployment Stack

| Layer | Technology | Service |
|-------|-----------|---------|
| Frontend | React + Vite | Vercel |
| Backend / DB | PostgreSQL | Supabase |
| Auth | Supabase Auth | Supabase |
| Storage | Supabase Storage | Supabase |
| Edge Functions | Deno | Supabase Edge Functions |
| Error Monitoring | Sentry | Sentry (planned) |
| Source Control | Git | GitHub |
| CI/CD | GitHub Actions (future) | GitHub |

---

## 3. Branch Strategy

```
main                  ← production-ready code
  └─ staging          ← staging/QA branch
       └─ dev         ← active development branch
            └─ feature/{name}   ← feature branches
            └─ fix/{name}       ← bugfix branches
            └─ docs/{name}      ← documentation branches
            └─ refactor/{name}  ← refactoring branches
```

### Branch Rules
- `main` is protected — no direct push
- `staging` is protected — only merge from `dev` after QA
- `main` is only updated via merge from `staging` after production approval
- Feature branches are created from `dev`
- Hotfixes to production branch from a `hotfix/{name}` branch

---

## 4. Vercel Deployment Configuration

| Environment | Branch | URL | Auto-Deploy |
|-------------|--------|-----|-------------|
| Production | `main` | `nexus.msigroup.id` (future) | No — manual trigger only |
| Staging | `staging` | `staging.nexus.msigroup.id` | Yes — on merge to staging |
| Preview | `feature/*` | Auto-generated preview URL | Yes — on PR open |

**Production auto-deploy is disabled.** Production deployments must be manually triggered after explicit approval.

---

## 5. Supabase Environment Separation

Three separate Supabase projects must be maintained:

| Environment | Supabase Project | Data |
|-------------|-----------------|------|
| Production | `nexus-prod` | Real business data |
| Staging | `nexus-staging` | Sanitized copy or test data |
| Development | `nexus-dev` | Dev/seed data only |

**Never use production credentials in development or staging.**  
**Never connect staging or dev frontend to production Supabase.**

---

## 6. Database Migration Process

Database schema changes follow a strict process:

```
1. Write migration SQL in /supabase/migrations/{timestamp}_{description}.sql
2. Test migration on development Supabase project
3. Review migration in PR — must be approved by Senior Dev
4. Apply migration to staging
5. Test on staging for minimum 1 business day
6. Apply migration to production during low-traffic window
7. Monitor production for 30 minutes after migration
```

Migration naming convention:
```
20260523_001_create_companies_table.sql
20260523_002_add_rls_companies.sql
20260523_003_create_customers_table.sql
```

---

## 7. RLS Policy Deployment

RLS policy changes are even more sensitive than schema changes:

1. **Never weaken RLS** to make code work
2. RLS changes require a dedicated review step separate from code review
3. Test RLS with multiple user roles before deploying
4. Monitor for `403 Forbidden` errors after RLS change deployment

---

## 8. Frontend Build Process

```bash
# Local development
npm run dev

# Production build (verify before deploy)
npm run build

# Lint check (must pass)
npm run lint

# Preview production build locally
npm run preview
```

Build must pass before any merge to `staging` or `main`.

---

## 9. Deployment Checklist

See full checklist in `docs/operations/release-checklist.md`.

Quick summary:
- [ ] All tests pass (when available)
- [ ] `npm run build` passes
- [ ] `npm run lint` passes with no errors
- [ ] Migration applied to staging and tested
- [ ] RLS policies reviewed
- [ ] Environment variables verified for target environment
- [ ] Sentry DSN configured
- [ ] Rollback plan documented

---

## 10. Rollback Strategy

### Frontend Rollback
Vercel supports instant rollback to any previous deployment:
1. Go to Vercel dashboard
2. Find previous successful deployment
3. Click "Promote to Production"
4. Verify rollback

### Database Rollback
Every migration must have a corresponding rollback SQL:
```sql
-- Migration: 20260523_001_create_customers_table.sql
CREATE TABLE customers (...);

-- Rollback: 20260523_001_rollback.sql
DROP TABLE IF EXISTS customers;
```

**Note:** Data migrations (UPDATE, INSERT) are harder to rollback. Plan data migrations carefully and test on staging.

---

## 11. Production Access Control

| Action | Who Can Approve |
|--------|----------------|
| Deploy to production | Tech Lead + Project Owner |
| Apply DB migration to production | Tech Lead only |
| Change production env variables | Tech Lead only |
| Rollback production | Tech Lead |
| Emergency hotfix | Tech Lead (with post-mortem required) |
