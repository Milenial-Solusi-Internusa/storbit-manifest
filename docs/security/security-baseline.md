# Nexus by MSI — Security Baseline

**Last Updated:** 2026-09-30
**Owner:** Den (solo developer/maintainer)
**Review cadence:** on completion of each security hardening package (e.g. TD-281 H1-H6), and at least every 90 days regardless — see **Ownership & Review** at the end.

---

## Overview

Security is a first-class requirement in Nexus by MSI. This document is a **summary of current status**, not an implementation manual — full detail, evidence, and remediation plans live in `docs/Governance/08_TECH_DEBT.md` (search by TD number) and `docs/Governance/12_ANTREAN_MIGRASI_PRODUCTION.md`.

⚠️ **This repository is public** (Vercel free-tier constraint) as of 2026-09-30, and will stay that way until upgraded to a paid plan. Anything written here is visible to anyone. Known, still-open gaps are referenced by TD number only — the technical detail (which tables, which functions, exact queries) lives in `docs/Governance/`, which is also part of this public repo but is not the document a casual reader opens first.

---

## 1. Authentication

- All authentication goes through Supabase Auth; there is no custom implementation.
- Session expiry (access/refresh token lifetime) is a Supabase project setting — not independently verified in this document.
- **MFA is not enforced today.** A `profiles.mfa_required` flag and a settings-page toggle exist but are not wired to Supabase Auth's MFA API in any way — setting the flag changes nothing about login behavior. Not yet scheduled — **TD-302** (LOW).
- **Deactivated users could still authenticate and use existing sessions, until 2026-09-30.** Found during a security audit and remediated in production the same day (affected accounts blocked at the Auth layer, active sessions revoked). The underlying gap — deactivating a user in the app does not block their Supabase Auth login or invalidate sessions already issued to them — has **not** been permanently closed; a code-level fix plus a database-level safeguard are both still required. **TD-301** (HIGH).

## 2. Authorization

- Roles and their hierarchy are defined in the `roles` table / `src/lib/roles.js` — that file is the single source of truth and is not duplicated here, since it changes as the org does and a second copy would drift out of date. Note: HR/org-chart job-title levels (`positions.level`) are a separate concept from security roles — do not conflate the two.
- Permission gating is menu-key based (`role_menu_permissions` / `user_menu_permissions`), enforced through RLS and RPC guards — not a generic `{module}.{action}` scheme, and never through frontend checks alone.
- RLS is enabled on nearly all business tables. A tracked subset still has non-scoping (`USING(true)`) policies — **TD-173** (CRITICAL, OPEN; the table list is intentionally not repeated here — see the TD entry).
- A handful of reference tables (`roles`, `departments`, `positions`, `branches`) are intentionally global rather than company-scoped — a deliberate design choice, not a gap.
- The Supabase service role key is never used in frontend code; server-side logic lives in Edge Functions only.

## 3. Data Security

- Sensitive fields (vendor cost, margins, credit limits, bank details, etc.) are expected to be masked or role-restricted — **this has not yet been audited end-to-end**. Tracked as open follow-up work, not yet assigned a TD number.
- Business attachments use a private Storage bucket with signed URLs.
- Soft delete (`deleted_at`) is the default for business data. A small number of tables intentionally lack it — tracked in `08_TECH_DEBT.md`, not enumerated here.
- Restoring a soft-deleted record is not a general capability across all tables — do not assume it without checking.
- There is no approval workflow today for deleting customer/vendor/invoice records.
- Data export is not currently logged to `audit_logs`, and no export path is rate-limited.

## 4. API Security

- All internal API access (Supabase PostgREST) requires a JWT; RLS applies automatically.
- The anon key is meant to be public and safe to ship — but "safe" rests on two separate layers: RLS (row visibility) and table/function grants (whether an operation is reachable at all). As of 2026-09-30, **`anon` holds zero table-level rights on any table in the `public` schema** (verified directly in production). Function-level `EXECUTE` hardening for `anon`/`PUBLIC` is still in progress — **TD-300**.
- No public-facing API exists yet; any prior "Public API (Future)" requirements are aspirational and tracked separately, not restated here.

## 5. Environment Security

- Two environments exist as two separate Supabase projects: staging and production. There is no separate "development" project — local development points at staging.
- Feature work goes through staging before production. Cross-cutting security hardening is a deliberate exception and may land in staging and production the same day, or production first, when the exposure itself is in production (see `12_ANTREAN_MIGRASI_PRODUCTION.md`).
- Required frontend env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (not `VITE_SUPABASE_ANON_KEY` — corrected 2026-09-30). Never committed to source control (`.env*` is gitignored; `.env.example` with empty values is the only env file tracked).

## 6. Error Monitoring

- Sentry is live (since 2026-09-21), gated on `VITE_SENTRY_DSN` being set; `sendDefaultPii: false`, query strings stripped from breadcrumbs.
- Source maps: no explicit build setting exists, so the bundler's default (off) applies — none are generated for production builds today.
- Supabase's built-in query logs exist and should be reviewed for anomalies; failed-auth and RLS-violation monitoring is not independently verified here.

## 7. Security Checklist per Feature

Before any feature ships, verify: RLS policy in place and tested · server-side permission check (not frontend-only) · sensitive fields masked or excluded · attachments private + signed URL · soft delete (or a documented exception) · audit log event for important actions · export restricted and logged · no service role key in frontend · no raw rows returned to a public API · input validated.

## 8. Mandatory Audit Events

The intended event list (login, logout, create, update, soft_delete, restore, submit, approve, reject, revise, export, import, attachment_upload, attachment_delete, role_change, permission_change, api_request, public_tracking_access) is not fully met today — `export` is a known gap (§3), and coverage of the remainder has not been re-verified line-by-line recently. Treat this list as the target, not a completed guarantee.

---

## Ownership & Review

- **Owner:** Den (solo developer/maintainer) — there is no dedicated security team.
- **Last Updated:** 2026-09-30.
- **Review triggers** (whichever comes first):
  - Every time a security hardening package (TD-281 H1-H6, or a successor) completes — re-read this file against the new state in the same session.
  - Every 90 days of calendar time regardless of other triggers.
  - The moment a claim here is cited in a decision and turns out wrong — fix it as part of that same unit of work, don't defer it.
- This file is a baseline snapshot, not a changelog. Dated history belongs in `PROGRESS.md`/`CLAUDE.md`; this file states what's true *right now*, with a TD number for anything not yet true.
