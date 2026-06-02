# CLAUDE.md

## Project Identity

Product Name: Nexus by MSI  
Tagline: Unified Business Core Platform

This project is transitioning from the existing Storbit Manifest application into Nexus by MSI, an end-to-end ERP Core Platform for MSI Group.

Nexus by MSI is designed to become the unified internal business platform for MSI Group, covering master data, transactions, workflows, approvals, operations, finance, reporting, audit trails, performance, security, and future API integrations across multiple entities.

---

## Business Entities

The platform must support multi-company and multi-entity operations from the beginning.

| Entity | Business Focus |
|---|---|
| MSI | Freight Forwarding |
| JCI | PPJK / Customs Clearance |
| Storbit / SBI | General Trading |

Each entity may have different business processes, but the system must support connected group-level operations and consolidated reporting where permitted.

---

## Long-Term Product Direction

Nexus by MSI is intended to become an end-to-end ERP Core Platform covering:

- Foundation Core
- Organization & Access Control
- Master Data Management
- CRM & Customer Inquiry
- Quotation Management
- Sales Order / Surat Pesanan
- Job / Operation Management
- Freight Forwarding
- PPJK / Customs Clearance
- General Trading
- Procurement
- Purchase Order
- Inventory / Warehouse
- Vendor Management
- Job Costing
- Billing / Invoice
- AR / Collection
- AP / Vendor Invoice
- Cash / Bank
- Accounting
- Asset Management
- HRGA Request
- IT Service Management
- Approval Center
- Document Management
- API & Integration Center
- Public Tracking API
- Customer / Vendor Portal
- Reporting & Dashboard
- Performance & Cache Layer
- Audit & Compliance

The first foundation module to prioritize is Master Data.

---

## Current Project Context

The existing application started as Storbit Manifest.

Current assumed stack:

- React
- Vite
- TailwindCSS
- Supabase
- Supabase Auth
- Supabase RLS
- Vercel deployment
- GitHub source control

Existing project may already include modules such as:

- Dashboard
- Manifest / SP
- Shipment
- Finance
- Outstanding
- AR Tracker
- Customer
- User Management

Important existing risks:

- App.jsx may still be monolithic.
- Current data layer may not yet be fully modular.
- Current documentation may be incomplete.
- Audit log may exist but may not be fully implemented.
- Testing and deployment readiness may still need improvement.

Do not perform a big-bang rewrite.

---

## Core Engineering Principles

All work on this project must follow these principles:

1. Multi-company by design
2. Master data first
3. End-to-end business process mapping
4. Approval-driven workflow
5. Document numbering standard
6. Audit everything important
7. Soft delete by default
8. Granular role-permission
9. API-ready architecture
10. Finance impact ready
11. Reporting-ready data structure
12. Dev / staging / production separation
13. Modular frontend
14. Domain-based service and data layer
15. Server-side pagination and search
16. Performance-first data fetching
17. Safe caching strategy
18. Secure by default
19. Observable and monitorable
20. Smooth incremental migration from existing Storbit Manifest

---

## Non-Negotiable Safety Rules

Do not do any of the following unless explicitly instructed:

1. Do not rewrite the entire application.
2. Do not rewrite App.jsx in one large change.
3. Do not change database schema without explicit approval.
4. Do not change Supabase RLS policies without explicit approval.
5. Do not weaken RLS to make something work.
6. Do not expose secrets.
7. Do not expose Supabase service role keys in frontend code.
8. Do not install new dependencies without explicit approval.
9. Do not redesign the UI unless the task specifically asks for UI work.
10. Do not change production deployment settings without explicit approval.
11. Do not push or deploy unless explicitly instructed.
12. Do not remove existing working features unless explicitly instructed.
13. Do not hard-delete business data.
14. Do not bypass permission checks.
15. Do not create public API endpoints that return raw internal database rows.

---

## Required Reading Before Coding

Before writing or changing any code, you must have read and understood:

1. `CLAUDE.md` — this file (project identity, principles, safety rules)
2. `docs/architecture/nexus-master-blueprint.md` — product direction, tech stack, non-negotiable rules
3. `docs/security/security-baseline.md` — security rules, RLS requirements, MFA policy
4. `docs/performance/performance-baseline.md` — pagination, search, caching, indexing rules

Before working on a specific area, also read:

| Task Area | Additional Required Reading |
|-----------|----------------------------|
| Any new feature | `docs/architecture/feature-registry.md` |
| Database / schema work | `docs/database/core-schema-draft.md`, `docs/database/indexing-strategy.md` |
| Approval / document flow | `docs/workflow/approval-engine.md`, `docs/workflow/status-lifecycle.md` |
| Finance module | `docs/security/permission-matrix.md`, `docs/performance/reporting-performance.md` |
| Public API / integration | `docs/integration/api-strategy.md`, `docs/integration/public-tracking-api.md` |
| Deployment / release | `docs/operations/deployment-strategy.md`, `docs/operations/release-checklist.md` |
| Caching implementation | `docs/performance/caching-strategy.md` |
| Audit logging | `docs/security/audit-log-policy.md` |

---

## Development Workflow

For every task, follow this workflow:

1. Inspect first
   - Check current branch.
   - Check git status.
   - Inspect relevant files.
   - Understand existing structure before editing.

2. Plan second
   - Explain intended changes.
   - Keep scope small and phase-based.
   - Avoid large multi-purpose changes.

3. Edit third
   - Modify only files required by the task.
   - Prefer incremental, low-risk changes.
   - Do not change unrelated code.

4. Verify fourth
   - Run available build/test/lint commands.
   - If a command is not available, state that clearly.
   - If a command fails, explain the exact failure and likely cause.

5. Summarize fifth
   - Summarize what changed.
   - List files changed.
   - Explain verification result.
   - Explain risk level.
   - Recommend the next step.

---

## Stricter Workflow Per Task Type

Different task types carry different risk levels. Follow the stricter workflow below on top of the general workflow above.

---

### Task Type: New Feature Development

Required reading: `docs/architecture/feature-registry.md`, `docs/security/security-baseline.md`, `docs/performance/performance-baseline.md`

Before coding:
- Confirm the feature is in the feature registry or add it first
- Confirm the target phase is current or approved
- Confirm no database schema change is needed (if yes, follow schema change workflow)
- Confirm no new dependencies are needed (if yes, get explicit approval)

During coding:
- Add server-side pagination to all new list views
- Add debounce to all new search inputs
- Select only required columns in all queries
- Add `deleted_at IS NULL` filter to all queries
- Add `company_id` filter to all queries
- Add audit log call for all create / update / delete actions
- Do not add hardcoded user IDs, company IDs, or role values
- Do not add `SELECT *` queries

After coding:
- Run `npm run build` — must pass
- Run `npm run lint` — must pass or explain pre-existing errors
- Manually verify the feature works end-to-end

---

### Task Type: Database Schema Change

> High risk. Requires explicit approval before execution.

Required reading: `docs/database/core-schema-draft.md`, `docs/database/entity-map.md`, `docs/database/indexing-strategy.md`

Before making any schema change:
1. State clearly: what table is being added or changed
2. State clearly: why this change is needed
3. State clearly: which existing data or queries are affected
4. Wait for explicit approval — do not proceed without it

When approved:
- Write migration SQL in `/supabase/migrations/{timestamp}_{description}.sql`
- Include rollback SQL as a comment or separate file
- Add `company_id` column with NOT NULL if it is a business table
- Add `deleted_at timestamptz` if it is a business table
- Add `created_by`, `updated_by` if it is a business table
- Add `created_at`, `updated_at` with `DEFAULT now()` if it is a business table
- Add minimum required indexes (see `docs/database/indexing-strategy.md`)
- Write RLS policy for new table immediately — never leave a table without RLS
- Test migration on development Supabase before staging

---

### Task Type: RLS Policy Change

> Critical risk. Requires explicit approval before execution.

Required reading: `docs/security/security-baseline.md`, `docs/database/core-schema-draft.md`

Rules:
- Never weaken RLS to make code work — fix the code instead
- Never disable RLS on a table that has business data
- All RLS policies must scope by `company_id`
- Test every RLS change with at least two different roles before applying to staging
- RLS changes must be documented in the PR description with before/after comparison
- Wait for explicit approval — do not proceed without it

---

### Task Type: UI / Frontend Change

Required reading: `docs/performance/performance-baseline.md`, `docs/performance/caching-strategy.md`

Rules:
- Do not redesign UI unless the task specifically asks for it
- Do not change unrelated UI components
- Do not add new npm packages without explicit approval
- All new list views must have server-side pagination
- All new search inputs must be debounced (min 300ms)
- All new large modules must use `React.lazy()` code splitting
- Do not compute aggregates or run heavy logic inside render functions
- Do not add `useEffect` that calls `setState` directly inside it unnecessarily
- Wrap new major page sections in `ErrorBoundary`

---

### Task Type: Refactor

Required reading: `docs/architecture/nexus-master-blueprint.md`

Rules:
- Refactor must not change any visible behavior
- Refactor must not change any data flow or business logic
- Scope must be small — one concern at a time (constants, utils, types)
- Run `npm run build` and `npm run lint` before and after — both must pass
- Do not rename database columns or table names as part of a frontend refactor
- Do not move files that are imported in many places without updating all imports

---

### Task Type: Documentation Update

Rules:
- Update the relevant `docs/` file when a feature, rule, or decision changes
- Update `docs/architecture/feature-registry.md` when a new feature is added
- Update `docs/architecture/implementation-roadmap.md` when phase status changes
- Update `CLAUDE.md` when a new standing rule or workflow is established
- Documentation changes do not require `npm run build` but should not break any imports

---

### Task Type: Hotfix (Production Emergency)

> Critical. Fast-track but still requires review.

Rules:
- Create `hotfix/{description}` branch from `main`
- Fix must be minimal — address only the critical issue
- Requires at least one reviewer even for fast-track
- Deploy to staging first, verify, then production
- Merge hotfix back to both `main` and `dev`
- Post-mortem required within 48 hours for any P1 issue

See `docs/operations/release-checklist.md` for full emergency process.

---

## Standard Output Format After Every Task

After completing any task, respond using this format:

Summary:
- ...

Files changed:
- ...

Verification:
- ...

Risk level:
- Low / Medium / High

What was intentionally not changed:
- ...

Next recommended step:
- ...

---

## Performance Requirements

Performance is a first-class requirement.

Rules:

1. Do not fetch all rows for large list pages.
2. Use server-side pagination for large tables.
3. Use server-side search, filter, and sort.
4. Use debounce for search inputs.
5. Avoid select * for large list queries.
6. Select only required columns where possible.
7. Use proper database indexes for frequent filters.
8. Use lazy loading / code splitting for large modules.
9. Use aggregate queries or materialized views for heavy dashboards.
10. Do not compute heavy reports entirely in frontend components.
11. Do not render thousands of table rows directly.
12. Use private storage and signed URLs for attachments.
13. Public API responses must be lightweight and masked.
14. Cache only where safe.
15. Never cache sensitive data carelessly.

Recommended important indexes for future transaction tables:

- company_id
- company_id + status
- company_id + created_at
- company_id + document_no
- customer_id
- vendor_id
- created_by
- deleted_at
- status

---

## Caching Strategy

Caching must be used carefully.

| Data Type | Caching Rule |
|---|---|
| Master data | Safe short-to-medium cache |
| Dashboard aggregate | Short cache |
| Transaction list | Short cache or refetch |
| Finance data | Very careful, avoid long cache |
| Audit log | Do not cache carelessly |
| Public tracking status | Short public-safe cache |
| Attachment signed URL | Short expiry |
| Permission/session data | Short cache, refetch on login/role change |

---

## Security Requirements

Security is mandatory.

Rules:

1. Use Supabase Auth.
2. MFA is required for admin, BOD, Finance Controller, and Head Level roles.
3. RLS must be company-scoped and role-aware.
4. Permission must be granular.
5. Do not rely only on frontend permission checks.
6. Audit all important actions.
7. Use soft delete by default for business data.
8. Important delete actions require approval.
9. Export must be restricted to Head Level and explicitly allowed roles.
10. Attachments must use private buckets and signed URLs.
11. Public APIs must use data masking and rate limiting.
12. API keys must be stored securely and must be rotatable.
13. Never expose service role keys in frontend code.
14. Never weaken RLS just to make code work.
15. Inactive users must be blocked or logged out.
16. Dev, staging, and production environments must be separated.
17. Error monitoring must be included in the strategy.
18. RLS must be reviewed before production changes.

Mandatory audit events:

- login
- logout
- create
- update
- delete
- soft_delete
- restore
- submit
- approve
- reject
- revise
- export
- import
- attachment_upload
- attachment_delete
- role_change
- permission_change
- api_request
- public_tracking_access

---

## Public API Rules

Nexus may later provide APIs for website tracking, customer portal, vendor portal, and integrations.

Public API must never expose internal raw rows.

Public API must not expose:

- vendor cost
- profit
- margin
- finance notes
- internal notes
- PIC internal
- customer credit limit
- audit logs
- private attachments
- internal approval history

Use DTOs for public response.

Example future public tracking flow:

Website
→ GET /api/public/tracking/{tracking_token}
→ Nexus API / Edge Function
→ validate token
→ fetch shipment public view
→ return masked DTO
→ log request

---

## Document Numbering Direction

Default document numbering format:

{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}

Examples:

- QT/MSI/SLS/2026/0001
- SP/MSI/SLS/2026/0001
- SHP/MSI/LOG/2026/0001
- CUS/JCI/PPJK/2026/0001
- PR/MSI/IT/2026/0001
- PO/STB/PROC/2026/0001
- INV/JCI/FIN/2026/0001
- RMB/MSI/FIN/2026/0001
- AST/MSI/IT/2026/0001
- TCK/MSI/IT/2026/0001

---

## Approval Direction

Approval must be designed as a reusable engine, not hardcoded per module.

Approval should support:

- Company-based rules
- Department-based rules
- Document-type-based rules
- Amount-based rules
- Role-based rules
- Specific user approvers
- Backup approvers
- Delegation
- Revision after submit
- Comment history
- Approval history

Default status lifecycle:

- draft
- submitted
- under_review
- revision_requested
- revised
- approved
- rejected
- cancelled
- completed
- archived

---

## Documentation

Technical documentation lives in the repo under `docs/`. This is the source of truth.

```
docs/
├── architecture/
│   ├── nexus-master-blueprint.md     ← Product identity, principles, tech stack
│   ├── module-map.md                 ← All modules, dependencies, status
│   ├── business-process-map.md       ← End-to-end process flows per entity
│   ├── feature-registry.md           ← Feature catalog with full metadata
│   └── implementation-roadmap.md     ← Phase-by-phase build plan
├── database/
│   ├── core-schema-draft.md          ← Table definitions, conventions, RLS patterns
│   ├── entity-map.md                 ← Entity relationships and sensitivity
│   └── indexing-strategy.md          ← Mandatory indexes per table type
├── security/
│   ├── security-baseline.md          ← Full security rules and checklist
│   ├── permission-matrix.md          ← Role-permission matrix per module
│   ├── audit-log-policy.md           ← Mandatory audit events and RLS
│   └── data-retention-policy.md      ← Retention periods and compliance
├── workflow/
│   ├── approval-engine.md            ← Reusable approval engine design
│   ├── document-numbering.md         ← Numbering format, sequences, rules
│   └── status-lifecycle.md           ← Status values and transitions per doc type
├── integration/
│   ├── api-strategy.md               ← Internal and external API principles
│   └── public-tracking-api.md        ← Public tracking endpoint design
├── performance/
│   ├── performance-baseline.md       ← Mandatory performance rules
│   ├── caching-strategy.md           ← Caching rules per data type
│   └── reporting-performance.md      ← Report and dashboard performance strategy
└── operations/
    ├── deployment-strategy.md        ← Branch strategy, deploy process, rollback
    ├── environment-strategy.md       ← Dev/staging/prod separation and secrets
    ├── release-checklist.md          ← Pre-release and release checklist
    └── monitoring-strategy.md        ← Sentry, Supabase logs, alerting
```

Business workflow documents may also be maintained in Google Docs for management review, but the technical source of truth must always be in the repo.

---

## Phase Roadmap

### Phase 0.0 — Initial Project Instructions

Output:
- Initial CLAUDE.md
- No source code changes
- No database changes

### Phase 0.1 — Documentation Foundation

Output:
- docs/architecture/
- docs/database/
- docs/security/
- docs/workflow/
- docs/integration/
- docs/performance/
- docs/operations/
- README update
- .env.example

### Phase 0.2 — Final CLAUDE.md

Output:
- Update CLAUDE.md to reference created docs.
- Define required reading before coding.
- Define stricter workflow per task type.

### Phase 0.3 — Claude Agents

Output:
- .claude/agents/
- Architecture auditor
- Security reviewer
- Performance reviewer
- Docs maintainer
- QA/build tester
- Refactor planner
- React UI refactorer

### Phase 0.4 — Low-Risk Refactor

Output:
- Extract constants
- Extract formatting utils
- Extract calculation utils
- No behavior change

### Phase 0.5 — Stability & Performance Audit

Output:
- ErrorBoundary
- Data fetching audit
- Pagination/search/indexing risk
- Inactive user flow check

### Phase 1.0 — Master Data Foundation

Output:
- Company
- Branch
- Department
- Position
- Employee/User
- Customer
- Vendor
- Product/Service
- Document Type
- Status Catalog

---

## Current Phase

> **Source of truth for phase status:** `docs/architecture/implementation-roadmap.md`
> This table is a summary. Always defer to the roadmap for the authoritative phase history,
> sub-phase details, decision log, and accurate completion dates.

| Phase | Name | Status |
|-------|------|--------|
| 0.0 | Initial Project Instructions | ✅ Complete |
| 0.1 | Documentation Foundation | ✅ Complete |
| 0.2 | Final CLAUDE.md | ✅ Complete |
| 0.3 | Claude Agents | ✅ Complete |
| 0.4A | Bundle Size Audit | ✅ Complete |
| 0.4B | Bundle Split and Lazy Loading | ✅ Complete |
| 0.5A | Stability, Lint, and Tech Debt Audit | ✅ Complete |
| 0.5B | Remove Production Console Logs | ✅ Complete |
| 0.5C | ErrorBoundary Baseline | ✅ Complete |
| 0.5D | Lint Baseline Cleanup | ✅ Complete |
| 1.0A | Master Data Architecture Plan | ✅ Complete |
| 1.0B | Schema / Migration Draft Review | ✅ Complete |
| 1.0C | Seed Strategy | ✅ Complete |
| 1.0D | RLS Policy Draft | ✅ Complete |
| 1.0D+ | Staging Execution Readiness Review | ✅ Complete |
| 1.0D++ | Legacy App Baseline for Fresh Staging | ✅ Complete |
| 1.0D+++ | Staging Execution Verification (migrations 000–014) | ✅ Complete |
| 1.0E | First Admin UI Screens (8 read-only tabs) | ✅ Complete |
| 1.0F | Profiles & Customers RLS Transition | ✅ Complete |
| 1.0G | User Access Management Foundation | ✅ Complete |
| 1.0H | RLS Hardening — Remaining Public Tables | ✅ Staging verified |
| 1.0I | Master Data CRUD / Vendors / Products screens | ✅ Complete |
| 1.0J | User Access Management — table layout + Add User + Edge Function | ✅ Complete |

Current phase: **Phase 1.0J** ✅ Complete

Next recommended step: **Phase 1.0K — Vendors / Products admin CRUD, or remaining read-only tabs (Companies, Roles, Taxes, Payment Terms)**

### Production Gate

**Production execution is BLOCKED** for all pending migrations, including Migration 017
(`20260524000017_rls_hardening_public_tables.sql`).

Migration 017 is staging-verified as of 2026-05-28. Production execution requires explicit
written approval from the technical lead and product owner before any migration may be applied
to the production Supabase project.

Verification log: `docs/operations/rls-hardening-verification-log.md`

---

## Debugging Field Notes

Lessons learned from real debugging sessions on this project. Read before diagnosing RLS or staging issues.

---

### RLS Policy Not Applied to Staging (2026-06-02)

**Symptom:**
Super admin user (Den Bagus) could only see MSI branches. JCI branches were not visible despite the UI correctly showing the "SUPER ADMIN" role label.

**Root cause:**
Migration 019 (`20260524000019_org_master_super_admin_read_bypass.sql`) was not applied to staging. The active `branches_read` policy was still the migration 014 shape:

```sql
-- Migration 014 — WRONG for super admin cross-company reads
(company_id = get_user_company_id()) AND ((deleted_at IS NULL) OR is_super_admin())
```

`is_super_admin()` is nested inside the `company_id` condition. It only bypasses `deleted_at` — the company scope filter is never bypassed regardless of role.

The correct shape (migration 019):

```sql
-- Migration 019 — CORRECT
is_super_admin() OR (company_id = get_user_company_id() AND deleted_at IS NULL)
```

`is_super_admin()` is a top-level OR — when true, the entire company scope filter is bypassed.

**Fix applied:**
Manually ran migration 019 SQL in Supabase SQL Editor on staging.

**Key lesson — always verify active policy before debugging frontend:**

```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'branches' AND cmd = 'SELECT';
```

Check `qual` — confirm `is_super_admin()` is the outermost condition, not nested inside `company_id`.

---

### RLS Debugging Protocol

Follow this order before assuming a frontend bug when data is missing or filtered unexpectedly:

1. **Check `pg_policies`** — confirm the active policy shape matches the expected migration.
   Use: `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = '<table>' AND cmd = 'SELECT';`

2. **Test `is_super_admin()` from the browser session** — add a temporary `console.debug` in the relevant page component (not Dashboard — it is purely presentational and does not import supabase):

   ```js
   // Temporary — remove after debug
   useEffect(() => {
     supabase.auth.getSession().then(({ data: { session } }) => {
       console.debug('[debug] uid =', session?.user?.id);
     });
     supabase.rpc('is_super_admin').then(({ data }) => {
       console.debug('[debug] is_super_admin =', data);
     });
     supabase.rpc('get_user_company_id').then(({ data }) => {
       console.debug('[debug] get_user_company_id =', data);
     });
   }, []);
   ```

3. **Do not test RLS in the SQL Editor as a substitute for browser session testing.**
   `auth.uid()` always returns NULL in the SQL Editor — it runs as service role, not as the authenticated user. `is_super_admin()` and `get_user_company_id()` will always return false/null in that context.

4. **Do not test RPC from DevTools console directly.**
   The Supabase client is not exposed on the `window` object. Temporary `console.debug` calls inside the page component are the correct approach.

5. **Never assume a migration was applied** — always verify with `pg_policies` or `information_schema`. Migrations applied to one environment (dev/staging/production) are independent. A migration committed to the repo is not automatically applied anywhere.

---

## Final Reminder

This project must be evolved carefully.

Do not build all ERP modules at once.

Plan end-to-end, but build foundation first.

Always prioritize:

- Security
- Performance
- Auditability
- Scalability
- Maintainability
- Business process correctness
