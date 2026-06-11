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
| MSI (PT Milenial Solusi Internusa) | Freight Forwarding |
| JCI (PT Jago Custom Indonesia) | PPJK / Customs Clearance |
| SOA (PT Stuja Orbit Abadi) | General Trading (formerly SBI/Storbit) |

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

The project has transitioned from Storbit Manifest (localStorage prototype) into Nexus by MSI ERP.

**Stack (confirmed):**

- React 19 + Vite 8
- TailwindCSS 3
- Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- Vercel — auto-deploys from `main` → production at `storbitmanifest.dli.my.id`
- GitHub — `main` is the single integration + production branch

**Branch strategy (updated 2026-06-04):**

- `main` → production. Vercel deploys from `main`.
- Feature work committed directly to `main` (solo developer workflow).
- `fix/*` branches for hotfixes if needed, merged immediately to `main`.
- No long-lived feature branches. All phase-1 and phase-2 feature branches have been merged and deleted.

**Active modules (as of 2026-06-07):**

| Module | Status | Location |
|--------|--------|----------|
| Auth + RLS | ✅ Live | `src/contexts/`, `supabase/migrations/` |
| Master Data (Admin) | ✅ Live | `src/modules/admin/` |
| Products & Services | ✅ Live | `src/modules/admin/pages/ProductsPage.jsx` |
| Product Detail Modal | ✅ Live | `src/modules/admin/pages/ProductDetailPage.jsx` |
| Dashboard | ✅ Live | `src/modules/dashboard/` |
| App Launcher | ✅ Live | `src/modules/launcher/` |
| Asset Management | ✅ Live | `src/modules/assets/` |
| HRGA Request | ✅ Live | `src/modules/hrga/` |
| Logistics — Sales Order | ✅ Live | `src/modules/logistics/` |
| CRM — Pipeline, Inquiry, Quotation | ✅ Live | `src/modules/crm/` |
| CRM — Dashboard | ✅ Live (fully connected — KPI cards, Pipeline by Stage, Prospect Trend per week vs last month, Lead Source Distribution donut, Sales Performance table, Calendar Jadwal Visit — all from Supabase) | `src/modules/crm/CRMDashboardPage.jsx` |
| Inventory / Warehouse | ⚠️ Stok Barang live (fetches stock_summary + products + warehouses) | `src/modules/inventory/pages/StokBarangPage.jsx` |
| Inventory — Penerimaan Barang | ⚠️ Live (fetches products + warehouses + vendors; saves to stock_ledger) | `src/modules/inventory/pages/PenerimaanBarangPage.jsx` |

**Module structure (`src/modules/`):**

```
src/modules/
├── admin/        Master Data CRUD (Companies, Branches, Departments, Positions, Roles, Users, Products)
├── assets/       Asset Management (IT Equipment, Kendaraan, detail pages, useAssets hook)
├── crm/          CRM (Pipeline/Kanban, Inquiry, Quotation, Dashboard)
├── dashboard/    Command Center dashboard
├── hrga/         HRGA Request module (submit, approval, management)
├── launcher/     App Launcher (Odoo-style module grid)
└── logistics/    Sales Order list + SP Detail page
```

**Migration status (as of 2026-06-06):**

| Range | Scope | Staging | Production |
|-------|-------|---------|------------|
| 000–019 | Foundation, master data, RLS | ✅ Applied | ❌ Blocked |
| 020–024 | HRGA Request schema + seed | ✅ Applied | ❌ Blocked |
| 025–027 | Asset Management extensions | ✅ Applied | ❌ Blocked |
| 028 | New roles seed + role_permissions for all 13 roles | ⏳ Pending | ❌ Blocked |

Production execution is **BLOCKED** — requires explicit written approval from technical lead and product owner before any migration is applied to the production Supabase project.

**Important ongoing tech debt:**

- `src/App.jsx` is 3,900+ lines with 30+ inline components — needs decomposition.
- `PASTEL` design tokens duplicated in 22+ files — needs a single `src/lib/tokens.js`.
- `sp_items` has no `deleted_at` column — Delete SP currently hard-deletes.
- Legacy `can()` / `ROLES` hardcoded permission matrix in App.jsx — diverges from DB roles model.

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

### Phase 2.0A — HRGA Request Module (Service Management)

Output:
- `docs/modules/hrga-request-schema-plan.md` — full schema plan, 20 request types, approval matrix
- Migrations 020–024:
  - 020: schema (9 tables, RLS, GRANTs)
  - 021: seed (4 new roles, 20 request types × 3 companies, 108 approval configs)
  - 022: GRANT DML fix for CLI-created tables
  - 023: `increment_document_sequence` RPC, relaxed INSERT policy, HRG sequence seed
  - 024: hrga_request_items INSERT RLS fix (status IN draft/submitted)
- `src/hooks/useHrgaRequests.js` — useHrgaRequestTypes, useMyHrgaRequests, useHrgaRequestDetail, useAllHrgaRequests, submitHrgaRequest, cancelHrgaRequest
- `src/modules/hrga/HrgaShell.jsx` — module shell, sidebar (My Requests, Semua Request)
- `src/modules/hrga/pages/MyRequestsPage.jsx` — list request user sendiri, type picker, submit flow
- `src/modules/hrga/pages/AllRequestsPage.jsx` — semua request di company, view-only
- `src/modules/hrga/components/HrgaRequestForm.jsx` — form ATK dengan line items
- `src/modules/hrga/components/HrgaRequestDetail.jsx` — detail modal (info grid, items table, approval progress, trail)
- `src/App.jsx` — HrgaShell lazy import, render block, removed from PLANNED_MODULES

### Phase 2.0B — Asset Management (IT Equipment + Kendaraan)

Output:
- `src/modules/assets/AssetShell.jsx` — module shell, routes `assets-*` via App.jsx ModuleSidebar
- `src/modules/assets/pages/AssetDashboardPage.jsx` — stat cards + charts
- `src/modules/assets/pages/AssetITPage.jsx` — real Supabase data, server-side pagination, 2-step category filter
- `src/modules/assets/pages/AssetDetailPage.jsx` — Kendaraan detail (6 tabs: Info Dasar, Dokumen, Maintenance, Rute, BBM, History)
- `src/modules/assets/pages/AssetDetailITPage.jsx` — IT Equipment detail (7 tabs incl. Health Score, Software & Lisensi)
- `src/hooks/useAssets.js` — useITAssets (paginated), useAssetDetail, useFuelLogs, useITAssetDetail
- Migrations 025–027: asset_specifications, asset_network, asset_software_licenses, asset_maintenance_records, asset_fuel_logs; seeds 12 IT assets + 1 truck + 4 fuel logs

### Phase 2.0C — Logistics: Sales Order Module

Output:
- `src/modules/logistics/SalesOrderPage.jsx` — SP list, 4 KPI cards, tab pills (Semua/Pending/Manifest/History), filter bar, sortable table with customer pills + finance progress bar + action buttons, bulk select, pagination, Konfirmasi/Tolak modal
- `src/modules/logistics/SalesOrderDetailPage.jsx` — SP detail: header card, 3 pastel stat cards, 5-tab card (Overview/Items/Shipment/Dokumen/History), Finance Status table (INV/FP/SUB/KRM per-stage bars), item-cards with fin-pill badges, Edit Item Modal (full form, all sp_items fields, live auto-calc), Delete SP Modal (type-to-confirm)
- `src/App.jsx` — `selectedSpId` state, lazy imports for both pages, manifest block switches list↔detail, SPSidePanel suppressed when detail is open
- New menu structure: full ERP menu with 10 module groups, sub-section headers, 100+ planned menu items

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
| 1.0J+ | User Access — Add User form: Branch/Dept/Position/ERP Role fields; EF assigns user_roles with service role (cross-company RLS bypass) | ✅ Complete |
| 1.0J++ | User Access — Edit modal: remove Legacy Role dropdown, ERP Role only; ERP_CODE_TO_LEGACY map fixed (valid enum values); saveUserAccess auto-derives profiles.role | ✅ Complete |
| 1.0K+ | Permission migration Phase 2 — AuthContext fetches user_roles; role/erpRole derived from ERP codes; can() and menu guards migrated to 13 ERP roles | ✅ Complete |
| 1.0K++ | UserAccessPage role column — shows ERP role name from user_roles; legacy fallback shows "(legacy)" suffix | ✅ Complete |
| 1.0K | App Launcher + vertical sidebar per module (Option B layout) | ✅ Complete |
| 2.0A | HRGA Request Module — Schema, Seed, UI (ATK form, My Requests, Semua Request, Detail Modal) | ✅ Staging verified |
| 2.0B | Asset Management — IT Equipment + Kendaraan list/detail, useAssets hook, migrations 025–027 | ✅ Staging verified |
| 2.0C | Logistics — Sales Order list page + SP Detail page (real data, INV/FP/SUB/KRM) | ✅ Complete |
| 2.0C+ | Product Detail Modal — overlay modal, inline edit, toggle active, copy SKU, migration 028 | ✅ Complete |
| 2.0C++ | Inventory navigation — parent redirect to Stok Barang, remove Kategori & Master Item menu item | ✅ Complete |
| 2.0D | Stok Barang page — product catalog from Supabase, filters, KPI cards, skeleton loading, design from Claude Design handoff | ✅ Complete |
| 2.0D+ | StokBarangPage real fetch — stock_summary JOIN products + warehouses, group by product_id, qty_semper + qty_others columns | ✅ Complete |
| 2.0E | Penerimaan Barang page — goods receipt form, Supabase fetch products/vendors/warehouses, saves to stock_ledger, design from Claude Design handoff | ✅ Complete |
| 2.0E-hotfix | activeMenu persisted to localStorage (`nexus_last_menu`) — survives browser refresh; ProspectFormPage SOURCE options expanded to 10; profiles query fixed to `.eq('active', true)` | ✅ Complete |
| 2.0F | DB-driven permission gating — AuthContext fetches `role_permissions` → `hasPermission(module,action)` + `isCrossEntity(module)`; canSeeMenuItem upgraded to use DB permissions with role-array fallback; `module` field added to gated menu items; useAllHrgaRequests accepts `crossEntity` param | ✅ Complete |
| 2.0F+ | Permission gating fixes — AppLauncher cards filtered by `hasPermission(module,'view')` via `LAUNCHER_MODULE_MAP`; `hasPermission` passed to AppLauncher from App.jsx; AdminShell Sidebar gates Roles (admin/edit) and User Access (admin/view) via `permission` field on nav items | ✅ Complete |
| 2.0F++ | AppLauncher restricted popup — ganti dari "hide card" ke "show restricted modal"; semua cards tampil; restricted cards: opacity 0.6, cursor not-allowed, lock badge pojok kanan atas; klik restricted → modal "Akses Terbatas" dengan nama modul; fallback true saat permissions loading | ✅ Complete |
| 2.0F+3 | AuthContext additive — `menuPermissions` state + `fetchMenuPermissions` (fetch `user_menu_permissions` JOIN `menu_actions` JOIN `module_menus`) + `hasMenuPermission(menuKey, action)` exposed di context; super_admin selalu true; tidak mengubah `hasPermission`/`isCrossEntity` | ✅ Complete |
| 2.0F+5 | Sidebar gating migrasi ke `hasMenuPermission` — `MENU_KEY_MAP` (50+ menu ids → module_menus.key); `canSeeMenuItem` signature tambah `hasMenuPermission` param; priority: hasMenuPermission → hasPermission → item.role → true; `ModuleSidebar` + 3 call sites diupdate | ✅ Complete |
| 2.0F+4 | AppLauncher migrasi ke `hasMenuPermission` — `canAccess` prioritas `hasMenuPermission(mod,'view')`, fallback `hasPermission`, fallback `true`; `fetchMenuPermissions` query tambah `module_action_id` + `module_actions(modules(key))`; `hasMenuPermission` support module-level check via `module_actions.modules.key` | ✅ Complete |
| 2.0G | Permission Matrix tab di Edit User modal (UserAccessPage.jsx) — tab switcher Profile/Permissions; PermissionMatrix komponen inline (module rows navy, sub-menu rows white, checkboxes orange, collapsible, select-all per module, fixed action columns); fetch modules+module_menus+user_menu_permissions; diff-based save (DELETE removed, INSERT added); modal melebar ke 960px saat tab Permissions aktif | ✅ Complete |
| 2.0G-hotfix | fetchMenuPermissions FK hint fix — `module_actions(modules(id, key))` → `module_actions(modules!module_actions_module_id_fkey(id, key))` agar PostgREST resolve FK ambigu ke kolom `module_id` | ✅ Complete |
| 2.0G-hotfix2 | App.jsx — tambah `allMenuGroups = ERP_MENU_GROUPS` sebelum `visibleMenuGroups`; AppLauncher `moduleGroups` pakai `allMenuGroups` (semua grup, bukan filtered) | ✅ Complete |
| 2.0H+ | AppLauncher.jsx — GRID_POS update: Foundation melebar ke `gridColumn: '3 / 5'`; Portal & Integration pindah ke row 4 col 1; Reporting & Governance ke row 4 col 2; urutan row 4 sekarang Portal/Reporting/Foundation (wide) | ✅ Complete |
| 2.0H | AppLauncher.jsx redesign — solid colour cards per group (Logistics #144682, CRM #3B82F6, Procurement #F97316, Inventory #D97706, Finance #059669, HRGA #7C3AED, Workflow #0D9488, Portal #0891B2, Reporting #4F46E5, Foundation #6B7280); unified `ModuleCard` component; white text + icons; hover lift translateY(-4px); restricted overlay rgba(0,0,0,0.28) + LockBadge; Logistics card tall (gridRow 1/3) with ACTIVE badge + stats row; greeting heading MSI Navy; logic/props/LAUNCHER_MODULE_MAP/GRID_POS/canAccess/RestrictedModal unchanged | ✅ Complete |

| 2.0H++ | AppLauncher.jsx — GRID_POS fix: Foundation `gridColumn` diubah dari `'3 / 5'` ke `'2 / 4'` (span col 2–3 di row 4) | ✅ Complete |

| 2.0H+3 | AppLauncher.jsx — GRID_POS reset ke layout final 3-kolom: Portal col 1, Reporting col 2, Foundation col 3 di row 4 (tidak ada span); `...pos` spread sudah ada di ModuleCard style, tidak perlu tambahan | ✅ Complete |

| 2.0I | SalesOrderDetailPage — rename deadline→expired_date, deliveredDate→arrival_date (draft state + form labels); firstDeadline reads expired_date; BTB remarks: btbRemarks state, remarks input alongside BTB input, remarks shown per BTB row; db.js: spFromDb adds expired_date/arrival_date aliases, spToDb reads new field names with fallback, listSpBtbs+addSpBtb updated for remarks column | ✅ Complete |

| 2.0J | `src/lib/spCalc.js` dibuat sebagai single source of truth kalkulasi SP — `calcItem` + lightweight `groupBySP`; App.jsx: `calcRow` dihapus, import `calcItem`, `enrichedRows` + `groupBySP` pakai `calcItem`, `r.total` → `r.subtotal` di analytics; SalesOrderDetailPage: import `calcItem`, summary SP + `itemGrand` pakai `calcItem`; SalesOrderPage: import `calcItem`; Formula resmi (Opsi B, konfirmasi Koh Denny): subtotal=unitPrice×qty, ppnBase=subtotal+shippingPrice, ppn=round(ppnBase×0.11) (shipping KENA PPN), grandTotal=subtotal+shippingPrice+ppn | ✅ Complete |

| 2.0K | InputSPPage.jsx: `deadline`→`expired_date` (freshItem, header state, validation, save payload, deps, form label+binding, per-item label+binding); BTB rows: `['']`→`[{btb_no:'',remarks:''}]`, render tambah input remarks per row, counter pakai `r.btb_no?.trim()`, add button pakai object; db.js `bulkInsertSpBtbs`: accept `btbRows` array of string or `{btb_no,remarks}`, forward remarks ke insert | ✅ Complete |

| 2.0L | db.js: `spFromDb` baca `row.expired_date` (bukan `row.deadline`), backward compat alias tetap; App.jsx: `groupBySP` emit `expired_date`+`deadline` alias, `FormModal` state+label+binding→`expired_date`, CSV header+export→`expired_date`, import CSV→`expired_date`, SP list kolom header+cell+sort→`expired_date`, SP side panel label→`Expired Date`; SalesOrderPage: kolom header+cell+sort→`expired_date` | ✅ Complete |

| 2.0M | CRMDashboardPage fully connected ke Supabase — fetchDash expanded: single prospects query (pipeline_stage, name, created_at, source, assigned_to, profiles join) + lastMonth prospects + sales_visits (graceful fail if table absent) + salesPerf query; computed client-side: trendData (prospect count per week bulan ini vs bulan lalu), leadSourceData (count per source, sorted desc), salesPerfData (per salesperson: prospek/won/convRate), visitsData; PipelineTrend → count-based chart (bulanIni/bulanLalu dataKeys); LeadSourceDonut → accepts leadSourceData, generates colors from palette; SalesPerformance → accepts salesPerfData, status computed from convRate; DashCalendar → real calendar bulan ini, visits grouped by date, today highlight, status badge, "+Tambah Visit" button (disabled); LeadsBySource → uses leadSourceData for volume bars; semua mock constants dihapus (TREND, SOURCE_DIST, SALES, CAL_EVENTS, CAL_MONTH, CAL_SVC); build clean | ✅ Complete |

| 2.0N | Delete prospect — soft delete (`deleted_at`) untuk role manager ke atas (super_admin, admin, ceo, gm, manager); ProspectListPage: `erpRole` dari useAuth, `canDelete` check, `handleDelete` callback (soft delete + fetchProspects), tombol "Hapus" per row (e.stopPropagation, hanya tampil jika canDelete); ProspectFormPage: `erpRole` + `canDelete`, `useCallback` ditambah ke import, `handleDelete` (soft delete + onBack), tombol "Hapus Prospect" di footer (marginRight:auto, hanya tampil jika canDelete && isEdit); build clean | ✅ Complete |

| 2.0O | `src/components/ConfirmModal.jsx` — reusable confirm dialog (replaces all `window.confirm`); props: open, title, message, confirmLabel, cancelLabel, variant (danger/warning/info), onConfirm, onCancel; Escape key closes; centered modal, backdrop blur, alert icon, Montserrat title; 7 files updated: ProspectListPage, ProspectFormPage, BranchesPage, PositionsPage, DepartmentsPage, UserAccessPage, MyRequestsPage — each adds confirmState, showConfirm, closeConfirm helpers; handleDelete/handleArchive/handleToggleActive refactored to callback pattern; zero window.confirm remaining; build clean | ✅ Complete |

| 2.0P | CRMDashboardPage — AddVisitModal + Visit List; ICONS tambah `x` key; `AddVisitModal` komponen inline (before DashCalendar): form tanggal+waktu+salesperson+prospect+lokasi+status+notes, validasi client-side, insert ke `sales_visits`, refresh fetchDash setelah save; `DashCalendar` tambah prop `onAddVisit`, tombol Tambah Visit diaktifkan; Visit List section di bawah calendar grid (sorted by date+time, date badge, info row, status badge, past+scheduled highlight kuning); state di CRMDashboardPage: addVisitOpen/visitDraft/visitSaving/visitError/salesProfiles/prospectOptions; useEffect fetch profiles+prospects saat modal buka; handleSaveVisit via useCallback; render updated dengan fragment wrapper; build clean | ✅ Complete |

| 2.0Q | CRMDashboardPage — klik cell kalender pre-fill tanggal; DashCalendar tambah prop `onDayClick`; cell div tambah onClick (memanggil `onDayClick` dengan dateStr `YYYY-MM-DD`), cursor pointer, hover bg #F0F4FA (skip isToday); render DashCalendar: `onAddVisit` reset visit_date ke kosong sebelum buka, `onDayClick` set visit_date ke dateStr lalu buka modal; build clean | ✅ Complete |

| 2.0Q-hotfix | ProspectFormPage bug fix — `assigned_profile` (join result object dari ProspectListPage select) tidak ada di `STANDARD_COLUMNS.prospects`, menyebabkan object ikut masuk ke `customValues` dan dirender sebagai `[object Object]` di Additional Fields; fix: tambah `assigned_profile` ke STANDARD_COLUMNS.prospects sebagai join alias exclusion; `notes` dan semua field lain sudah masuk payload via `...form` spread — tidak ada bug lain; build clean | ✅ Complete |

| 2.0R | CRM Dashboard — Calendar Visit upgrade: (1) VISIT_STATUS 3 status (scheduled/completed/cancelled) label Bahasa Indonesia (Terjadwal/Selesai/Dibatalkan), hapus rescheduled; (2) AddVisitModal 3 field baru: point_of_meeting, mom, follow_up — masuk ke INSERT + UPDATE payload; (3) Edit mode di AddVisitModal (isEdit prop, title "Edit Kunjungan"); (4) handleSaveVisit handle UPDATE via editVisitId state; (5) VisitDetailModal (read-only): nama prospect, salesperson, tanggal+waktu, lokasi, status badge, notes, POM, MOM, tindak lanjut + tombol Edit; (6) Calendar cell events + visit list rows klik → buka VisitDetailModal; (7) DashCalendar prop onVisitClick; (8) SELECT query tambah point_of_meeting, mom, follow_up; (9) visitsData mapping tambah 3 field + prospect_id + salesperson_id untuk edit; build clean | ✅ Complete |

Current phase: **Phase 2.0R** ✅ Complete

Next recommended step: **Phase 2.0E+ — create stock_ledger + warehouses migration (staging), wire Stok Barang to real stock data**

### localStorage keys
| Key | Value | Written by |
|-----|-------|------------|
| `nexus_last_menu` | Last active menu ID (e.g. `dashboard`, `crm-pipeline`) | `App.jsx` useEffect on `activeMenu` change |

### Production Gate

**Production execution is BLOCKED** for all pending migrations (000–028 + 20260607000001).

All migrations are staging-verified. Production execution requires explicit written approval
from the technical lead and product owner before any migration is applied to the production
Supabase project.

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

### HRGA Request Module — Lessons Learned (2026-06-02)

Lessons from building the first Service Management module. Apply to all future modules.

---

#### 1. Tables created via Supabase CLI do NOT get auto-grants

**Symptom:** `permission denied for table <table>` even for super admin.

**Root cause:** Tables created via `supabase db push` (CLI) do not automatically receive
`SELECT/INSERT/UPDATE/DELETE` grants for the `authenticated` role — unlike tables created via
the Supabase Dashboard. PostgreSQL checks table-level privilege **before** evaluating RLS.
The result: every operation is denied before RLS is even reached.

**Fix:** Every migration that creates tables via CLI must include explicit GRANTs:

```sql
GRANT SELECT, INSERT, UPDATE ON <table> TO authenticated;
```

Add this immediately after `ENABLE ROW LEVEL SECURITY`, before the policy definitions.
Use INSERT-only for immutable audit tables (e.g. `hrga_request_approvals`).

**Verification:**
```sql
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS granted
FROM information_schema.role_table_grants
WHERE table_name = '<table>' AND grantee = 'authenticated'
  AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
GROUP BY table_name;
```

---

#### 2. hrga_approval_configs must always be filtered by company_id

**Symptom:** `Cannot coerce the result to a single JSON object` on submit.

**Root cause:** `hrga_approval_configs` is seeded once per company — the same `request_type_id`
has N rows (one per company). Querying with only `request_type_id + level` returns multiple rows;
`.single()` throws the coerce error.

**Rule:** Always include `.eq('company_id', profile.company_id)` on every
`hrga_approval_configs` query. Never filter by `request_type_id` alone.

```js
// WRONG — returns N rows across companies
supabase.from('hrga_approval_configs')
  .eq('request_type_id', id).eq('level', 1).single()

// CORRECT
supabase.from('hrga_approval_configs')
  .eq('company_id', profile.company_id)
  .eq('request_type_id', id).eq('level', 1).single()
```

Same applies to `hrga_request_types` in any query that expects a single row per type_code —
always scope by `company_id`.

---

#### 3. increment_document_sequence RPC must be created explicitly

**Symptom:** 404 on RPC call; fallback read-then-update hits 406 (no row) or 403 (RLS).

**Root cause:** The RPC `increment_document_sequence` was referenced in app code but never
defined in any migration. `document_sequences` INSERT was also restricted to `is_admin_or_above()`,
blocking non-admin staff from initialising a new sequence row.

**Fix (migration 023):**
1. Create `increment_document_sequence(company_id, document_type, department_code, year, month)`
   as `SECURITY DEFINER` — atomically increments, inserts row if missing, returns new integer.
2. Grant `EXECUTE` to `authenticated`.
3. Relax `document_sequences_insert` RLS from `is_admin_or_above()` to `company_id = get_user_company_id()`.
4. Seed initial rows for new document types before they are used.

**Template for any new document type:**
```sql
-- Seed sequence rows for a new document type across all active companies
INSERT INTO document_sequences (company_id, document_type, department_code, year, month, last_sequence)
SELECT id, '<CODE>', '<DEPT>', EXTRACT(YEAR FROM now())::int, 0, 0
FROM companies WHERE is_active = true
ON CONFLICT (company_id, document_type, department_code, year, month) DO NOTHING;
```

---

#### 4. useHrgaRequestTypes must be called with companyId

**Symptom:** Type picker shows every request type 3×.

**Root cause:** The hook `useHrgaRequestTypes()` fetched all rows without a `company_id` filter.
Types are seeded per company (20 types × 3 companies = 60 rows total).

**Fix:** Hook signature changed to `useHrgaRequestTypes(companyId)`. Always pass
`profile.company_id` from `useAuth()`. The hook skips the query if `companyId` is falsy.

```js
// WRONG
const { data: types } = useHrgaRequestTypes();

// CORRECT
const { profile } = useAuth();
const { data: types } = useHrgaRequestTypes(profile?.company_id);
```

---

#### 5. Supabase default query limit is 10 rows

**Symptom:** List page shows only 10 items even though the database has more (e.g. ProductsPage showed 10 MSI products, missing 5 JCI + 63 SOA).

**Root cause:** Supabase's PostgREST default page size is 10 rows. If no `.limit()` is set, the client silently returns the first 10 rows only — no error, no warning.

**Fix:** Always add `.limit(1000)` (or implement proper server-side pagination with `.range()`) on any list query.

```js
// WRONG — silently returns only 10 rows
supabase.from('products').select('*').is('deleted_at', null)

// CORRECT — explicit limit for small-medium catalogs
supabase.from('products').select('*').is('deleted_at', null).limit(1000)

// CORRECT — server-side pagination for large tables
supabase.from('products').select('*', { count: 'exact' }).range(from, to)
```

**Rule:** Every `.from().select()` query that doesn't use `.range()` pagination MUST have `.limit(N)` where N is comfortably above the expected maximum row count. For catalog/master data tables, `.limit(1000)` is the safe default.

---

#### 6. Products RLS — super_admin sees all companies

**Symptom:** ProductsPage company tabs showed 0 for JCI and SOA even after fixing the limit.

**Root cause:** Two issues combined:
1. PostgREST join (`companies(code, name)`) can return null if the FK relationship isn't auto-detected, causing all rows to map to the default company (`'MSI'`).
2. RLS policy on `products` table may scope by `company_id = get_user_company_id()`, blocking super_admin from seeing other companies' products.

**Fix applied:**
- Fetched `companies` table separately to build a reliable `{ uuid → code }` map.
- Used `product.company_id` with the map for lookup instead of relying on join.
- Verified super_admin RLS policy on `products` allows cross-company reads (`is_super_admin() OR company_id = get_user_company_id()`).

**Rule:** Never rely on PostgREST join (`table(col)`) for critical field mapping. For company code resolution, always fetch the companies table separately and build a UUID→code map.

---

#### 7. RLS INSERT policy must match the actual status at insert time

**Symptom:** 403 on `hrga_request_items` insert immediately after header insert.

**Root cause:** The INSERT policy checked `r.status = 'draft'`. The submit flow creates the
header with `status = 'submitted'` directly (no draft step in UI), then inserts items.
By the time items are inserted, the parent is already `submitted` → EXISTS returns false.

**Fix:** Expand INSERT policy to `status IN ('draft', 'submitted')`.

**Rule:** Before writing an RLS INSERT policy that checks a related row's status, trace the
exact sequence of operations in the application code. The policy must match the status value
that will be present *at the moment the INSERT occurs*, not the final desired status.

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

---

## Company & Department Master Data — 06 Jun 2026

### Companies
| Code | Name | Business Focus |
|------|------|----------------|
| MSI | PT Milenial Solusi Internusa | Freight Forwarding |
| JCI | PT Jago Custom Indonesia | PPJK / Customs Clearance |
| SOA | PT Stuja Orbit Abadi | General Trading |

### Departments (per entity — sesuai org chart)

| Code | Name | MSI | JCI | SOA |
|------|------|-----|-----|-----|
| BD | Business Development | ✅ | — | — |
| FIN | Finance | ✅ | — | — |
| GA | General Affairs | ✅ | — | — |
| HR | Human Resources | ✅ | — | — |
| IT | Information Technology | ✅ | — | — |
| LOG | Logistics / Operations | ✅ | — | — |
| MGMT | Management | ✅ | ✅ | ✅ |
| PPJK | PPJK / Customs Clearance | — | ✅ | — |
| PROC | Procurement | ✅ | — | ✅ |
| SLS | Sales | ✅ | — | ✅ |

Note: HR, IT, Finance untuk JCI & SOA dihandle oleh MSI (holding).

### Positions (per entity)

| Code | Name | Level | MSI | JCI | SOA |
|------|------|-------|-----|-----|-----|
| CEO | Chief Executive Officer | Director | ✅ | — | — |
| GM | General Manager | Director | ✅ | — | — |
| SR-MGR | Senior Manager | Manager | ✅ | — | — |
| MGR | Manager | Manager | ✅ | ✅ | ✅ |
| JR-MGR | Junior Manager | Manager | ✅ | — | — |
| SR-SPV | Senior Supervisor | Supervisor | ✅ | — | — |
| SPV | Supervisor | Supervisor | ✅ | — | — |
| SR-STAFF | Senior Staff | Staff | ✅ | — | — |
| STAFF | Staff | Staff | ✅ | ✅ | ✅ |
| OPR | Operator | Staff | ✅ | ✅ | ✅ |

---

## Brand System — MSI Brand Guideline v1.0 (updated 2026-06-05)

| Token | Hex | Usage |
|---|---|---|
| MSI Navy | `#144682` | Sidebar, header, dominant (30% of 60/30/10) |
| Navy Dark | `#0f3366` | Hover state navy, gradient end |
| Navy Light | `#1a5299` | Lighter navy variant |
| MSI Orange | `#E85A1E` | Accent, CTA, active item, highlight (10%) |
| Orange Dark | `#c44d18` | Hover state orange |
| White | `#FFFFFF` | Background utama |
| Light Gray | `#F7F7F8` | Card, secondary bg |
| Mid Gray | `#D9D9DC` | Border, divider |
| Dark Gray | `#3A3A3F` | Body text |

Font heading: `Montserrat` (Google Fonts)
Font body/UI: `Inter` (Google Fonts)

Sidebar: background `linear-gradient(165deg, #144682 0%, #0f3366 100%)`
Active item: `rgba(255,255,255,0.13)` bg, left-border `rgba(255,212,184,0.7)` (warm orange tint)
Active icon: `#FFB899` (warm orange tint on dark navy)
Primary button: `#E85A1E`, hover `#c44d18`
accentSoft bg (icon containers, hover highlights): `#FEF2EC`

**JANGAN pakai:**
- `#1a3a2a` (dark green lama) — sudah diganti `#144682`
- `#2d5a3d`, `#0F2A23`, `#173D34` — semua dark green variants sudah deprecated
- `#2F6B3F` — accent green lama, diganti `#E85A1E`
- `#E7EFE2` — accentSoft green lama, diganti `#FEF2EC`
- `Plus Jakarta Sans` — diganti `Inter` (body) + `Montserrat` (heading)

---

## CRM Module — Schema Notes (updated 2026-06-05)

### Tabel: prospects
- Gunakan kolom `name` bukan `company_name`
- Gunakan kolom `payment_terms_id` bukan `payment_term_id`
- Tidak ada kolom `company_name` — jangan pakai ini di query manapun

### Tabel: inquiries
- Kolom `deleted_at` sudah ada (ditambah via ALTER TABLE 2026-06-05)

### Tabel: quotations
- Kolom tambahan: `usd_rate numeric(15,2)` — kurs USD ke IDR, input manual per quotation
- `route text` — routing info e.g. "CHICAGO > SEMARANG", sudah ada di tabel

### Tabel: quotation_items
- Kolom lengkap: id, quotation_id, sort_order, description, qty, unit, unit_price, notes, group_name, currency, unit_label, exchange_rate, total
- Tidak ada kolom `total` yang GENERATED — total dihitung di frontend dan disimpan manual

### RLS & Permissions — PENTING
- Tabel CRM (prospects, inquiries, quotations, quotation_items) menggunakan GRANT ALL ke role authenticated
- RLS di-disable untuk keempat tabel ini untuk MVP
- Jangan tambahkan RLS policy berbasis get_user_company_id() untuk tabel CRM — akan menyebabkan permission denied
- Tabel baru yang dibuat via SQL Editor harus di-GRANT manual: `GRANT ALL ON TABLE nama_tabel TO anon, authenticated, service_role;`

### quotation_items — tambahan kolom (2026-06-05)
- `cost_price numeric(15,2)` — harga cost internal, tidak boleh muncul di print/PDF
- Gunakan CSS class `no-print` untuk semua elemen cost dan profit summary
- Total IDR di-hitung dari `unit_price × qty` (× kurs kalau USD) — bukan dari cost_price
- Gross profit = subtotal − total_cost, hanya tampil di sidebar internal (no-print)

### Print/PDF
- Gunakan class `no-print` untuk elemen yang tidak boleh muncul di PDF (cost price, margin, action buttons, sidebar, topbar)
- Gunakan class `print-only` untuk elemen yang hanya muncul saat print (logo, header quotation)
- PDF di-trigger via window.print() atau tombol Download PDF di QuotationDetailPage
- CSS print diinjeksi via `<style>` tag di dalam komponen (tidak perlu global CSS)

### PDF Generation
- Library: jspdf + html2canvas (sudah di-install, approval eksplisit 2026-06-05)
- Trigger: tombol "Download PDF" di QuotationDetailPage
- Print area: div#quotation-print-area — TIDAK boleh mengandung cost_price atau margin
- Customer details table: 2 kolom, label cell background #1a3a2a text putih, value cell background #f9f9f7
- Urutan konten print area: header logo → customer details table → notes → sections → summary → terms → Best Regards → footer
- creatorProfile di-fetch dari profiles JOIN positions, dipakai untuk nama & jabatan di Best Regards
- Field `terms` di tabel quotations: diisi sales di QuotationFormPage, muncul sebagai "• Above rates" di PDF
- Print area di-posisikan off-screen (`position: absolute; left: -9999px`) agar invisible di screen tapi tetap ada di DOM saat html2canvas dipanggil
- File output: {quotation_no}_rev{revision}.pdf
- jsPDF handle multi-page otomatis via loop heightLeft

### BTB Numbers — sp_btbs table
- Tabel: `sp_btbs` — id, sp_no, btb_no, created_at
- BTB No sekarang di SP-level, bukan item-level
- `btb_no` di `sp_items` sudah di-rename jadi `btb_no_deprecated` — jangan pakai lagi
- db.js functions: `listSpBtbs(spNo)`, `addSpBtb(spNo, btbNo)`, `deleteSpBtb(id)`, `bulkInsertSpBtbs(spNo, btbNos[])`
- UI: BTB Numbers section di SalesOrderDetailPage Overview tab + InputSPPage form card

### Dynamic Custom Fields
- Hook: `src/hooks/useCustomFields.js` — fetch via `get_table_columns` RPC, filter STANDARD_COLUMNS
- Component: `src/components/CustomFieldsSection.jsx` — renders inputs per data_type, supports readOnly mode
- STANDARD_COLUMNS exported dari hook — list kolom bawaan per tabel, kolom di luar list = custom field
- Custom fields di-save langsung ke kolom di tabel yang bersangkutan (tidak ada tabel terpisah)
- CustomerModal: customValues state, populate dari initial pada edit mode, merged ke save payload

### Schema Manager
- File: `src/modules/admin/pages/SchemaManagerPage.jsx`
- Hanya untuk role `'super'` atau `'super_admin'` — dual check karena legacy `'super'` masih di DB
- Memanggil Edge Function `manage-schema` dengan action `add_column`
- Fetch kolom existing via RPC `get_table_columns` (fallback dari information_schema view)
- Menu ID: `schema-manager` di Foundation > Master Data

### Mismatch yang sudah pernah terjadi — jangan ulangi
- prospects.company_name → SALAH, pakai `name`
- prospects.payment_term_id → SALAH, pakai `payment_terms_id`
- quotation_items.total GENERATED → SALAH, kolom ini sudah di-DROP dan diganti plain numeric
- inquiries.deleted_at → sudah ada, boleh dipakai
- profiles.is_active → SALAH, kolom namanya `active` (bukan `is_active`) — pakai `.eq('active', true)` saat query profiles
- Business process correctness

### ProspectFormPage — SOURCE options (updated 2026-06-07)
10 options: digital_marketing, sales_visit, referral, event, cold_call, exhibition, social_media, website, walk_in, other.
Assigned To: fetch dari `profiles` dengan filter `active = true` + `company_id` + `.limit(1000)`. Tidak filter by role — semua user aktif bisa di-assign.

---

## Master Data Status — 06 Jun 2026

| Tabel | Rows | UI Page | Status |
|-------|------|---------|--------|
| companies | 3 | CompaniesPage.jsx | ✅ Done |
| branches | 7 | BranchesPage.jsx | ✅ Done |
| departments | 25 | DepartmentsPage.jsx | ✅ Done |
| positions | 15 | PositionsPage.jsx | ✅ Done |
| roles | 48 | RolesPage.jsx | ✅ Done — editable matrix for super_admin, Nexus module labels, is_cross_entity toggle |
| document_types | 45 | DocumentTypesPage.jsx | ✅ Done |
| payment_terms | 18 | PaymentTermsPage.jsx | ✅ Done |
| taxes | 12 | TaxesPage.jsx | ✅ Done |
| status_catalog | 13 | StatusCatalogPage.jsx | ✅ Done |
| products | 78 (MSI:10, JCI:5, SOA:63) | ProductsPage.jsx | ✅ Done — grid/list, company tabs, Supabase live |
| customers | 2 | ProspectFormPage (partial) | ⚠️ Needs dedicated master page |
| vendors | 0 | ❌ No page yet | ⚠️ Needs UI + data |

---

## Roles & Permission Structure — 06 Jun 2026

Based on official org chart PT. Milenial Solusi Internusa Group (OD/HCGA-MSI/V/2026).
Same role structure applies across all 3 companies (MSI, JCI, SOA).

### Job Levels (from org chart)
1. Executive — CEO, C-level
2. GM/Senior GM — General Manager
3. Senior Manager
4. Manager
5. Junior Manager
6. Supervisor / Senior Supervisor
7. Staff
8. Operator — Driver, Office Boy, dll

### System Roles — 13 roles

| Code | Name | Level | Description |
|------|------|-------|-------------|
| super_admin | Super Admin | System | IT/Developer, full system access |
| ceo | CEO / Executive | 1 | Full view + final approve |
| gm | GM / Senior GM | 2 | Approve + report |
| manager | Manager | 4 | Manage department + approve |
| finance_controller | Finance Controller | 4 | Full finance access |
| finance | Finance Staff | 7 | Finance Jr. Manager + Staff |
| operations | Operations | 7 | Logistic, Console, Warehouse |
| sales | Sales / BD | 7 | BD, Sales Forwarding, Account Exec, Digital |
| procurement | Procurement | 7 | Direct + Indirect Procurement |
| hrga | HRGA | 7 | HRGA, Personnel, People Dev, GA |
| it | IT Staff | 7 | IT Developer + Helpdesk |
| supervisor | Supervisor | 6 | Cross-dept supervisor |
| viewer | Viewer | - | Read-only all modules |

### Permission Matrix

| Module | super_admin | ceo | gm | manager | finance_controller | finance | operations | sales | procurement | hrga | it | viewer |
|--------|-------------|-----|----|---------|--------------------|---------|------------|-------|-------------|------|----|--------|
| Master Data | CRUD | R | R | R | R | R | R | R | R | R | CRUD | - |
| CRM | CRUD | R | CRUD | CRUD | R | R | R | CRUD | R | - | R | R |
| Logistics | CRUD | R | CRUD | CRUD | R | R | CRUD | R | R | - | R | R |
| Finance | CRUD | R | R | R | CRUD | CRUD | R | R | R | - | R | R |
| HRGA | CRUD | R | R | CRUD | R | R | - | - | - | CRUD | R | R |
| Assets | CRUD | R | R | R | R | R | R | R | CRUD | R | CRUD | R |
| Admin | CRUD | - | - | - | - | - | - | - | - | - | CRUD | - |

### Migration Status — COMPLETED 06 Jun 2026
- ✅ 7 deprecated roles soft-deleted (finance_staff, operations_head, operations_staff, sales_head, sales_staff, procurement_head, procurement_staff)
- ✅ bod → ceo (CEO / Executive)
- ✅ supervisor → gm (GM / Senior GM)
- ✅ logistic — legacy frontend only, not in DB, dual-check added in SalesOrderDetailPage
- ✅ role_permissions seeded for all 13 roles across 3 companies
- ✅ Company codes: MSI, JCI, SOA (was SBI)
- ✅ JCI full name: Jago Custom Indonesia
- Active roles per company: super_admin, ceo, gm, admin, manager, finance_controller, finance, operations, sales, procurement, hrga, it, viewer (13 roles)

---

## CRM UI Status — 06 Jun 2026

| Page | Source | Status | Notes |
|------|--------|--------|-------|
| PipelineKanbanPage.jsx | Lovable JSX port | ✅ Live | Chevron headers (clip-path), MSI Navy, list/kanban toggle, drag-drop fade fix |
| CRMDashboardPage.jsx | Lovable design bundle | ✅ Live (fully real) | recharts Area/Bar/Pie all from Supabase; Prospect Trend, Lead Source, Sales Perf, Calendar Jadwal Visit connected; mock constants removed |
| InquiryListPage.jsx | Existing (2026-06-05) | ⚠️ Needs visual redesign | Functional, pending Lovable-style port to match MSI brand |
| ProspectFormPage.jsx | Existing (2026-06-05) | ⚠️ Needs visual redesign | Functional form, no MSI brand styling applied yet |
