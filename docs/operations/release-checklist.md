# Nexus by MSI — Release Checklist

**Last Updated:** 2026-05-23

---

## Overview

This checklist must be completed before every release to staging and production. Do not skip steps.

---

## Pre-Release: Development Verification

- [ ] Feature branch is up to date with `dev`
- [ ] All related tasks/issues are closed
- [ ] `npm run build` passes without errors
- [ ] `npm run lint` passes with zero errors (warnings acceptable)
- [ ] No `console.log` left in production code (except intentional debug mode)
- [ ] No hardcoded credentials, API keys, or secrets in code
- [ ] No `TODO` / `FIXME` comments that block the release
- [ ] All new features have been manually tested by the developer
- [ ] PR description is complete and clear

---

## Code Review Checklist

Before approving any PR:

### General
- [ ] Code follows existing conventions and style
- [ ] No unnecessary dependencies added
- [ ] No large files or binary files committed
- [ ] No commented-out code blocks left

### Security
- [ ] No service role key exposed in frontend code
- [ ] No hardcoded passwords or tokens
- [ ] All new database tables have RLS policy
- [ ] RLS policies are company-scoped
- [ ] No RLS bypass (`security definer` used appropriately only)
- [ ] Input validation present for user-submitted data
- [ ] Sensitive fields excluded from responses / logs
- [ ] Export restricted to authorized roles

### Performance
- [ ] No `SELECT *` on large table list queries
- [ ] All list views use server-side pagination
- [ ] Search inputs are debounced
- [ ] No heavy computation in frontend components
- [ ] New columns added to appropriate indexes (or indexing task created)

### Database Changes
- [ ] Migration file created with correct naming convention
- [ ] Rollback SQL documented
- [ ] Migration tested on development Supabase
- [ ] No irreversible data changes without approval
- [ ] No RLS weakening

### Audit & Compliance
- [ ] New features log appropriate audit events
- [ ] Approval flow respected for documents that require it
- [ ] Soft delete used (no hard DELETE)

---

## Release to Staging

- [ ] PR merged to `dev` branch
- [ ] `dev` branch merged to `staging` branch
- [ ] Migration applied to staging Supabase project
- [ ] Staging deployment verified on Vercel
- [ ] Core flows tested on staging:
  - [ ] Login / logout works
  - [ ] New feature works end-to-end
  - [ ] Existing features not broken (regression check)
  - [ ] RLS working (test with multiple roles)
- [ ] Staging environment banner visible (not showing as production)

---

## UAT Sign-off (Staging → Production Gate)

- [ ] PM / Business stakeholder has reviewed on staging
- [ ] UAT scenarios documented and passed
- [ ] No blocking bugs open
- [ ] Known issues documented and accepted (or deferred)
- [ ] Staging tested for minimum 1 business day for significant releases

---

## Release to Production

### Pre-Deployment
- [ ] Production release explicitly approved by Tech Lead + Project Owner
- [ ] Rollback plan documented (which previous Vercel deployment to use)
- [ ] Migration rollback SQL ready
- [ ] Deployment scheduled during low-traffic window (preferred: after business hours)
- [ ] Team notified of scheduled deployment
- [ ] Sentry monitoring active

### Deployment Steps
1. [ ] Apply migration to production Supabase (if any)
2. [ ] Verify migration applied successfully
3. [ ] Trigger production deployment on Vercel
4. [ ] Verify Vercel deployment successful (green build)
5. [ ] Smoke test production immediately after deploy:
   - [ ] App loads without error
   - [ ] Login works
   - [ ] Core feature works
   - [ ] No Sentry errors firing
6. [ ] Monitor production for 30 minutes after deployment

### Post-Deployment
- [ ] Deployment logged in release notes (git tag or GitHub release)
- [ ] Team notified of successful deployment
- [ ] PM notified if user-facing changes
- [ ] Close related issues/tasks

---

## Emergency Hotfix Process

For critical production bugs only:

1. [ ] Create `hotfix/{description}` branch from `main`
2. [ ] Fix is minimal — only address the critical bug
3. [ ] Fast-track review (still requires 1 reviewer)
4. [ ] Deploy to staging and quick verify
5. [ ] Deploy to production with explicit approval
6. [ ] Merge hotfix branch back to both `main` and `dev`
7. [ ] Post-mortem document created within 48 hours

---

## Release Notes Template

For each production release, create a brief release note:

```
## Release vX.X — YYYY-MM-DD

### What's New
- ...

### Bug Fixes
- ...

### Database Changes
- ...

### Known Issues
- ...

### Deployed by
- Tech Lead: [name]
- Approved by: [name]
```
