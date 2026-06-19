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

| 2.0S | CRM Dashboard — Visit stepper redesign: (1) `VISIT_STATUS` warna update ke spec (scheduled #3B82F6, completed #22C55E, cancelled #EF4444) + tambah `dot` token + `VISIT_STAGES` array; (2) `VisitStepper` komponen shared (3 lingkaran bernomor, garis penghubung, label, klik=ganti status, read-only jika onStageClick=null); (3) `AddVisitModal` redesign — stepper di atas, context hint per stage, field conditional: COMPLETED→mom+follow_up, CANCELLED→notes wajib isi, hapus dropdown status, field diurut ulang (prospect+salesperson grid, tanggal+waktu grid, lokasi, agenda); (4) `VisitDetailModal` redesign — stepper read-only, conditional content per status, history section fetch sales_visit_logs + timeline vertikal + logLabel helper; (5) `handleSaveVisit` — validasi notes wajib saat cancelled, INSERT return id via .select().single(), fire-and-forget log ke sales_visit_logs (from_status/to_status/notes), log null→scheduled saat CREATE; build clean | ✅ Complete |

| 2.0S-hotfix | AddVisitModal field structure fix — Stage 1 (scheduled): Agenda/POM textarea editable; Stage 2 (completed) & Stage 3 (cancelled): POM diganti readonly info card abu-abu ("Agenda yang direncanakan", italic jika kosong) + stage-specific fields di bawahnya (MOM+TL untuk completed, Alasan Pembatalan untuk cancelled); build clean | ✅ Complete |

| 2.0T | PL1+I1 — Click-to-detail di Pipeline dan Inquiry: (1) PipelineKanbanPage SELECT diperluas (tambah legal_name, customer_type, phone, email, city, address, pic_phone, pic_email, lost_reason, estimated_closing_date, payment_terms_id, notes, assigned_to, assigned_profile join); deal mapping tambah `raw: p`; DealCard+ListRow tambah onClick+onEdit props; isDragging ref agar drag tidak trigger click; `ProspectDetailModal` baru (header+badge stage+customer_type, grid 2-col sections: Informasi Perusahaan, PIC, Pipeline & Sales, Finansial, Notes, tombol Edit→setEditingProspect+setShowProspectForm+setActiveMenu); (2) InquiryListPage SELECT tambah commodity+estimated_volume+notes; row `<tr>` cursor pointer + onClick→setDetailInquiry; `InquiryDetailModal` baru (IBM Plex Mono inquiry_no, status badge, sections: Informasi Inquiry, Customer/Prospect, Detail Kargo, Notes); kolom origin/destination/cargo_type/quantity/weight/assigned_to tidak ada di DB — di-skip; build clean | ✅ Complete |

| 2.0T | PL1+I1 — Click-to-detail di Pipeline dan Inquiry: (1) PipelineKanbanPage SELECT diperluas (tambah legal_name, customer_type, phone, email, city, address, pic_phone, pic_email, lost_reason, estimated_closing_date, payment_terms_id, notes, assigned_to, assigned_profile join); deal mapping tambah `raw: p`; DealCard+ListRow tambah onClick+onEdit props; isDragging ref agar drag tidak trigger click; `ProspectDetailModal` baru (header+badge stage+customer_type, grid 2-col sections: Informasi Perusahaan, PIC, Pipeline & Sales, Finansial, Notes, tombol Edit→setEditingProspect+setShowProspectForm+setActiveMenu); (2) InquiryListPage SELECT tambah commodity+estimated_volume+notes; row `<tr>` cursor pointer + onClick→setDetailInquiry; `InquiryDetailModal` baru (IBM Plex Mono inquiry_no, status badge, sections: Informasi Inquiry, Customer/Prospect, Detail Kargo, Notes); kolom origin/destination/cargo_type/quantity/weight/assigned_to tidak ada di DB — di-skip; build clean | ✅ Complete |

| 2.0U | Master Customer page — `src/modules/crm/CustomerMasterPage.jsx` baru; list tabel dengan 10 kolom (code IBM Plex Mono, nama, legal name, entitas badge, PIC, tier badge A/B/C, status badge, assigned to, dibuat, eye button); 4 stat cards; filter bar (search debounce 300ms, status/entitas/tier dropdown, reset button); CustomerDetailModal 4-tab (Info Dasar, Komersial, History Visit, Notes); CustomerFormModal dengan duplicate name check onBlur + warning inline; INSERT payload company_id+source_company_id+created_by; fallback query tanpa join jika FK columns belum ada di DB; CRM sidebar tambah "Master Customer" icon Building2 setelah Quotation; lazy import + ErrorBoundary + MENU_KEY_MAP entry di App.jsx; TODO DB kolom belum ada: assigned_to, source_company_id, tier, cust_status; build clean | ✅ Complete |

| 2.0U-hotfix | CustomerMasterPage.jsx — global rename `cust_status` → `status` (8 lokasi: comment TODO, CustomerDetailModal statusKey, CustomerFormModal state init, payload INSERT/UPDATE, form select binding, filter logic, stat card count, tabel row statusKey); build clean | ✅ Complete |

| 2.0V | Logistics sidebar cleanup — hapus Customer MSI (3 sub-menu) dan Customer JCI (3 sub-menu) total dari sidebar; Customer Storbit diganti jadi item tunggal `id: 'crm-customers'` label "Master Customer" icon Building2 note "Di CRM" (navigateTo('crm-customers') otomatis resolve ke CRM module via ERP_MENU_GROUPS lookup); SidebarItem regular-item render ditambah `item.note` block italic abu-abu; build clean | ✅ Complete |

| 2.0W | R2+P1 — (1) Cancel visit role gate: CRMDashboardPage destructure `erpRole` dari useAuth(), `canCancel = ['super_admin','admin','ceo','gm','manager'].includes(erpRole)`; AddVisitModal tambah props `canCancel`+`onCancelBlocked`; VisitStepper onStageClick di AddVisitModal intercept `s==='cancelled' && !canCancel` → fire `onCancelBlocked` (showToast error "Hanya Manager ke atas yang dapat membatalkan kunjungan"); (2) Prospect prefix: `company_prefix` ditambah ke STANDARD_COLUMNS.prospects (useCustomFields.js) agar tidak muncul di Additional Fields; ProspectFormPage state+editMode populate+payload include `company_prefix`; Field "Nama Perusahaan" diganti flex row: select 100px (—/PT/CV/Mr./Mrs./Ms.) + input flex-1; TODO DB: `ALTER TABLE prospects ADD COLUMN company_prefix text;`; build clean | ✅ Complete |

| 2.0X | BD-02 + BD-07 — (1) **Win/Loss capture** (`src/modules/crm/WinLossModal.jsx` baru, shared): modal muncul saat prospect dipindah ke stage WON/LOST. WON → textarea "Alasan Won" wajib + input "Produk/Service yang di-close" opsional (di-append ke won_reason); LOST → dropdown kategori wajib (Harga tidak kompetitif/Kalah dari kompetitor/Customer tidak jadi butuh/Tidak ada response/Budget cut/Lainnya) + textarea detail (wajib jika kategori=Lainnya). Modal hanya collect+compose reason string, caller yang write DB. Reset via remount (`key` prop) bukan useEffect → lint clean. PipelineKanbanPage: import WinLossModal, fetchProspects select tambah `won_reason`, `handleDropStage` intercept WON/LOST (optimistic move + buka modal, tidak langsung update DB), `handleWinLossCancel` (revert optimistic, no DB), `handleWinLossSave` (update pipeline_stage+reason+converted_at utk won, optimistic raw update, rollback on error), ProspectDetailModal tampil "Alasan Won"/"Alasan Lost" di section Pipeline & Sales. ProspectFormPage: import WinLossModal, form tambah won_reason/lost_reason, `handleStageChange` intercept WON/LOST (buka modal, form.pipeline_stage baru di-set saat save → cancel auto-revert via controlled select), `handleWinLossSave` set stage+reason, handleSave stamp `converted_at` saat WON. `won_reason` ditambah ke STANDARD_COLUMNS.prospects (useCustomFields.js). (2) **Visit type** (BD-07): CRMDashboardPage `VISIT_TYPES` (discovery/solution_presentation/qbr/problem_solving/routine_touch) + `VISIT_TYPE_MAP`; AddVisitModal dropdown "Jenis Kunjungan" wajib (setelah stage hint, sebelum Prospect) + deskripsi output di bawah pilihan; `visitDraft`+`EMPTY_DRAFT`+onEdit mapping tambah `visit_type`; handleSaveVisit validasi wajib + payload `visit_type`; fetchDash select + visitsData mapping tambah `visit_type`; VisitDetailModal tampil "Jenis Kunjungan" (label+desc+output); onAddVisit/onDayClick reset ke `{ ...EMPTY_DRAFT }` (fix stale carry-over). **TODO DB (staging, belum dibuat — perlu approval):** `ALTER TABLE prospects ADD COLUMN IF NOT EXISTS won_reason text;` dan `ALTER TABLE sales_visits ADD COLUMN IF NOT EXISTS visit_type text;` — `lost_reason` & `converted_at` sudah ada di prospects. Sampai kolom dibuat, save prospect & save visit akan error "column does not exist". build clean | ✅ Complete |

| 2.0Y | R1 + BD-01 — (1) **Duplicate check nama prospect (R1)**: ProspectFormPage `nameWarning` state + `checkDuplicateName(val)` dipanggil `onBlur` input nama; query `prospects` `ilike(name)` + `company_id` + `deleted_at IS NULL` `limit(1)`; warning oranye non-blocking di bawah field (tidak block submit); skip saat `isEdit`. (2) **BANT Scorecard (BD-01)**: helper baru `src/modules/crm/bant.js` (BANT_FREQUENCY_OPTIONS, BANT_PAYMENT_OPTIONS, BANT_SCORE_FIELDS, BANT_MAX_SCORE, calcBantScore, bantScoreMeta) + komponen `src/modules/crm/BantScoreBar.jsx` (score bar warna: 0-3 merah / 4-5 oranye / 6-7 hijau). ProspectFormPage: 8 field BANT (bant_commodity/origin/destination/frequency/current_vendor/payment/decision_maker + bant_score) di form state + edit-populate (score di-recompute via calcBantScore); section "BANT Qualification" setelah Notes sebelum Additional Fields (grid 2-kolom, 7 input + score bar); `setBant(k)` handler update field + recompute bant_score sinkron (bukan useEffect → no lint error); payload otomatis via `...form`. PipelineKanbanPage: SELECT tambah 8 kolom bant_*; ProspectDetailModal section "BANT Qualification" (score bar + 7 field read-only) setelah Pipeline & Sales; **refactor sampingan**: `Field`/`Section` di-hoist dari dalam ProspectDetailModal ke module scope (pure presentational, no closure) → hilangkan `react-hooks/static-components` errors. 8 kolom bant_* ditambah ke STANDARD_COLUMNS.prospects (useCustomFields.js). Kolom DB bant_* sudah ada (dikonfirmasi sebelum task). Lint repo 148→128 (net −20). build clean | ✅ Complete |

| 2.0Z | **Activity & Calls (Sales Calls) page** — file baru `src/modules/crm/SalesCallsPage.jsx` (default export `({ showToast })`, pakai `useAuth()` utk profile). Pattern visual ikut InquiryListPage (C tokens warm-beige, badge maps, detail modal, pagination client-side PAGE_SIZE 20). Header "Activity & Calls" + tombol "Catat Call" navy #144682. 4 stat cards (current month, computed via useMemo): Total Call Bulan Ini, Connected, Follow-up Pending (next_action_date>=today & result≠null), Rata-rata Durasi (menit). Filter bar: search (prospect/contact, client-side), call_type, result, tanggal (Bulan Ini default / Semua). Tabel: Tanggal&Waktu (IBM Plex Mono), Prospect (join), Contact, Type badge, Durasi, BANT x/6, Result badge, Next Action Date, Salesperson (join), eye→detail. Fetch `sales_calls` `.limit(1000)` join `prospects` + `profiles` (FK hint `sales_calls_prospect_id_fkey` / `sales_calls_salesperson_id_fkey`), graceful error via showToast. CallDetailModal (Info Call/Contact/Klasifikasi/Notes/Tindak Lanjut + tombol Edit). CallFormModal add/edit: prospect (opsional), contact_name (req), contact_phone, call_date (req, default today), call_time, duration, call_type, result (req), bant_collected (slider 0-6), notes, next_action, next_action_date, salesperson (default user login). INSERT set company_id+created_by+salesperson_id fallback profile.id. **Badge:** call_type discovery(biru)/follow_up(orange)/closing(hijau); result connected(hijau)/no_answer(abu)/callback(biru)/wrong_number(merah). App.jsx: import `PhoneCall`, lazy `SalesCallsPage`, menu `crm-calls` "Activity & Calls" (icon PhoneCall) setelah Master Customer di grup CRM, routing block `activeMenu==='crm-calls'`. **TIDAK** ditambah ke MENU_KEY_MAP (tanpa role/module → `canSeeMenuItem` fallback true = semua role bisa lihat). Lint: +3 errors di SalesCallsPage (semua mirror pola InquiryListPage: fetch useCallback + fetch effect + setPage(0) effect); App.jsx 0 net-new. **TODO DB (staging — perlu approval, tabel belum ada):** lihat SQL di bawah. build clean | ✅ Complete |

| 2.0Z-hotfix | SalesCallsPage.jsx — fix column mismatch `duration` → `duration_minutes` agar match kolom DB `sales_calls.duration_minutes`. Diganti di 7 lokasi: DField detail display, `EMPTY_CALL` state, input form, stats calc (`Number(c.duration_minutes)`), openEdit mapping, payload INSERT/UPDATE, table cell. Audit konfirmasi 12 field lain sudah match nama DB & semua 13 field form sudah masuk payload (tidak ada yang ketinggalan). Local var `durations`/`avgDuration` + label "Durasi" tidak diubah (bukan kolom DB). build clean | ✅ Complete |

| 2.1A | BD-05 + BD-06 (Quotation) — (1) **Quote SLA Indicator (BD-05)**: SLA dihitung `pricing_done_at` → `quote_sent_at`, target per service_type `SLA_HOURS = { freight_forwarding: 6, customs: 8, trading: 8 }` (default 6 jam). QuotationFormPage: field "Pricing Selesai" (datetime-local, `pricing_done_at`) setelah Valid Until + masuk payload INSERT/UPDATE. QuotationDetailPage: tombol **"Kirim ke Customer"** (navy, icon Send, hanya saat status `SUBMITTED`) → ConfirmModal → update status `SENT` + `quote_sent_at=now()` + optimistic `setQuot` refresh; `SlaCard` (module-level) di bawah action bar — 3 state: belum ada pricing (abu) / pricing ada & belum kirim (kuning "⏱…sudah X jam Y menit", merah "⚠️ SLA Terlewat" jika > target) / sudah kirim (hijau "✓ dikirim dalam X (target N jam)", merah jika lewat). QuotationListPage: kolom "SLA" setelah Status (`SlaBadge`: ✓ On Time / ✗ Late untuk SENT/ACCEPTED/REJECTED, ⏱ Pending untuk SUBMITTED) + `pricing_done_at`/`quote_sent_at` di SELECT. (2) **Pricing Authority Matrix (BD-06)**: QuotationFormPage field "Diskon (%)" (number 0-100 step 0.1, `discount_pct`) setelah Pricing Selesai + masuk payload; recalc `discountAmount=round(subtotal×pct/100)`, `tax=round((subtotal−discountAmount)×VAT_RATE)`, `grandTotal=(subtotal−discountAmount)+tax` — **VAT_RATE tetap 0.011 (1.1%, existing); tidak diubah ke 0.11** (formula task "×0.11" ilustratif). `pricingAuthority(pct, erpRole)` indicator non-blocking di bawah field diskon (hijau/orange/merah sesuai matrix: 0%→no approval, ≤5%→Sales SPV, ≤10%→Manager, ≤15%→BD GM, ≤20%→CEO, >20%→CEO+FinCtrl+BoD). Summary form + detail + PDF print-area: baris "Diskon (X%): −Rp X" antara Subtotal & PPN (hanya jika pct>0); InfoRow "Diskon" di header detail. `erpRole` dari useAuth. **TODO DB (staging — perlu approval, 3 kolom belum ada di `quotations`):** `ALTER TABLE quotations ADD COLUMN IF NOT EXISTS pricing_done_at timestamptz, ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz, ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) DEFAULT 0;` — `valid_until`/`service_type` sudah ada. Sampai kolom dibuat, save quotation & detail fetch akan error "column does not exist". Lint: net-zero new error di 3 file (QuotationDetailPage tetap 1 error pre-existing setLoading-in-effect). build clean | ✅ Complete |

| 2.1B | S2 — **Dashboard per role di CRMDashboardPage** — `isSalesOnly = ['sales','operations'].includes(erpRole)` dipakai konsisten di fetchDash, KPI cards, section visibility, subtitle. **fetchDash:** helper `ownProspects(q)` (`.or('assigned_to.eq.{uid},created_by.eq.{uid}')`), `ownBySales(q)` (`.eq('salesperson_id',uid)`), `ownByCreator(q)` (`.eq('created_by',uid)`) — diterapkan ke 3 query prospects + sales_visits calendar saat isSalesOnly; 3 query baru ditambah ke Promise.all: A `sales_calls` minggu ini (startOfWeek=Senin ISO via `(getDay()+6)%7`), B `sales_visits` minggu ini, C `quotations` bulan ini. Computed: `callsThisWeek`/`visitsThisWeek`/`quotationsThisMonth` (length), `sqlThisMonth` (prospects created bulan ini stage∈QUALIFIED/PROPOSAL/NEGOTIATION/WON, dari array prospects yg sudah user-scoped). Semua graceful (`(res.data||[]).length`) → table absen = 0, tidak throw. deps fetchDash + `profile?.id, isSalesOnly`. **KpiCard:** tambah dukungan `data.subtitle` + `data.progress {pct,color}` (bar bawah 4px absolute). **KPI per role:** `kpiCards = isSalesOnly ? kpisSales : kpisReal`; kpisSales 4 card personal (Call/60 hijau≥60 kuning≥30 merah, Visit/5 ≥5/≥3, Quotation/20 ≥20/≥10, Win Rate Personal tanpa progress). **`ActivitySaya`+`ActivityItem`** (module-level) — section "Aktivitas Saya — Minggu Ini & Bulan Ini" grid 2×2 (Call/60, Visit/5, Quotation/20, SQL/15 sublabel "Qualified Lead"), warna ≥100% hijau/≥50% kuning/<50% merah, status "On Track"/"Perlu ditingkatkan"/"Di bawah target"; tampil hanya sales view di bawah KPI sebelum PipelineTrend. **Visibility:** SalesPerformance+LeadsBySource (tablesRow) di-hide saat isSalesOnly; ActivitySaya hide saat manager. **Subtitle:** sales="Dashboard personal · {full_name}", manager="Dashboard tim · semua data". Icon 'phone' tak ada di ICONS → Call card pakai 'target'. Lint CRMDashboardPage 7→7 (net-zero). build clean. **Catatan DB:** KPI "Call Minggu Ini" butuh tabel `sales_calls` (pending staging 2.0Z) — sampai ada, callsThisWeek=0 (graceful). | ✅ Complete |

| 2.1C | **Master Customer refactor: list page + dedicated detail page** (mirror pola AssetITPage→AssetDetailPage, state-swap bukan route). `CustomerMasterPage.jsx` (modal-based) di-`git mv` → `CustomerMasterPage.legacy.jsx` + komentar baris-1 `// LEGACY — replaced by CustomerListPage + CustomerDetailPage` (isi tidak diubah, disimpan sbg referensi). **`CustomerListPage.jsx`** (baru, default export `({ showToast, onSelectCustomer })`): list + stat cards + filter bar (search debounce 300ms, status/entitas/tier) + tabel; row klik & tombol Eye → `onSelectCustomer(c.id)` (bukan modal lagi); `CustomerFormModal` (add/edit) di-**export named** utk dipakai ulang detail page; helper `FG`/`FieldLabel` di-hoist ke module scope (hilangkan 19 static-components error). **`CustomerDetailPage.jsx`** (baru, `({ id, onBack, showToast })`): breadcrumb (CRM › Master Customer › nama, back→onBack) + header card (avatar initials navy, nama, legal, badge entitas/tier/status) + tombol Edit + Hapus (Hapus hanya `super_admin/admin/manager`, soft delete `deleted_at`); **5 tab** — Info Dasar (Identitas/Kontak/PIC), Komersial (tier/status/entitas owner/assigned/payment/credit/currency/Nomor Kontrak/Last Activity), History Visit (fetch `sales_visits` by `prospect_id`, `VisitRow` expandable: tanggal+type badge+status badge+salesperson+lokasi+POM preview 100char → expand MOM/follow_up/notes), BANT & Pipeline (`BantScoreBar` + 7 field BANT read-only + pipeline_stage, fetch prospect linked; null→"Belum ada data pipeline"), Notes (read-only + tombol "Edit Notes" inline edit→save). Reuse `BantScoreBar`+`calcBantScore`+`ConfirmModal`+`CustomerFormModal`. **App.jsx:** lazy `CustomerListPage`+`CustomerDetailPage` (ganti `CustomerMasterPage`); state `activeCustomerId`+`prevCustomerMenu`; `navigateToCustomerDetail(id)` (set prev menu, set id, activeMenu='customer-detail') + `backFromCustomerDetail`; `crm-customers`→CustomerListPage(onSelectCustomer), block baru `customer-detail`→CustomerDetailPage. Sidebar/menu item tidak diubah (crm-customers tetap). Lint: List 1 + Detail 3 (semua fetch-in-effect set-state-in-effect, pola baseline); App.jsx 4→4 net-zero. build clean. **Catatan DB:** kolom `contract_no` & `last_activity_at` (tab Komersial) kemungkinan belum ada di tabel `customers` → tampil "—" (pakai `select('*')`, tidak error). Kolom `tier`/`status`/`assigned_to`/`source_company_id` sesuai catatan 2.0U (fallback query tanpa join jika FK belum ada). | ✅ Complete |

| 2.1D | **Master Customer — 4 sub-menu per entitas** (App.jsx + CustomerListPage.jsx). Menu `crm-customers` (flat) → **parent + 4 children**: `crm-customers-msi/jci/soa/free` (icon Building2 ×3, `UserX` utk Free Agent — import baru). MENU_KEY_MAP: 4 child → `crm_customers` (parent tetap). Routing: `crm-customers` (default, backward-compat) + 4 block entitas → `<CustomerListPage entityFilter="MSI"/"JCI"/"SOA"/"FREE_AGENT" .../>` + block `customer-detail` (sudah ada dari 2.1C). **⚠️ Sidebar renderer non-rekursif:** `SidebarItem` cuma render 2 level (parent→children flat), padahal `crm-customers` kini level-3 (cucu). **Wajib di-extend (dalam App.jsx, in-scope):** (1) `childActive` deteksi cucu (`c.children?.some(gc=>activeMenu===gc.id)`) agar grup CRM tetap expanded saat cucu aktif; (2) child-map tambah cabang `if (child.children)` → render sub-grup expandable (sub-parent klik→navigate ke cucu pertama, ChevronDown, grandchild buttons indent); (3) `navigateTo` group-lookup tambah level cucu (deep-link safety). Tanpa ini, 4 sub-menu invisible + menu CRM collapse. **CustomerListPage:** prop baru `entityFilter`; `entityLocked=!!entityFilter`; filter: FREE_AGENT→`status==='free_agent'`, MSI/JCI/SOA→`source_company.code===entityFilter` (langsung di `filtered`, bukan init state); dropdown entitas di-hide saat locked; `ENTITY_HEADER` map → title+subtitle per entitas (MSI "Customer freight forwarding MSI", JCI "customs & PPJK", SOA "trading Storbit", FREE_AGENT "tidak terikat entitas"); default (no prop) tetap "Master Customer" + count line (backward compatible). Lint App.jsx 4→4, CustomerListPage 1→1 (net-zero). build clean. **Catatan:** stat cards (Total/Active/Inactive/Tier A) tetap global semua customer (bukan per-entitas) — di luar scope task; subtitle entitas pakai `filtered.length`. | ✅ Complete |
| 2.1D-hotfix | CustomerListPage.jsx — stat cards (Total Customer/Active/Inactive/Tier A) sekarang dihitung dari `filtered` (bukan `customers` raw) agar konsisten dgn entityFilter + search/status/tier filter. Diubah inline di array stat cards saja (value: `filtered.length` / `filtered.filter(...)`); `activeCount`/`inactiveCount` (dipakai subtitle default view) **tidak diubah** → subtitle behavior tetap. Lint 1→1 (net-zero), build clean. | ✅ Complete |

| 2.1E | **CustomerDetailPage rebuild — clone visual AssetDetailPage** (overwrite penuh). Struktur & komponen dikloning dari `AssetDetailPage.jsx`: tokens `D` warm-cream, helper `Card`/`Btn`/`Def`/`SectionLabel`, breadcrumb `← Kembali  CRM › Master Customer › [nama]` (ArrowLeft + ChevronRight), actions row kanan-atas (Edit + Hapus `Btn danger` role-gated super_admin/admin/manager), **header `Card`** (avatar bulat navy #144682 + initials putih, nama besar Montserrat + code badge, legal name sub, badges row CoBadge/TierBadge/StatusBadge) dengan **tab bar di dalam card** (borderTop, class `.ad-tab` underline orange aktif — bukan pill). Tab content pakai `<dl>`+`Def`(grid 180px/1fr)+`SectionLabel`: **Info Dasar** (Identitas/Kontak/PIC), **Komersial** (Tier/Status badge inline, Entitas Owner, Assigned, Payment Terms, Credit Limit Rupiah mono, Currency, Nomor Kontrak, Last Activity), **History Visit** (Card + `VisitRow` expandable: tanggal blok, salesperson, visit_type badge, status badge, lokasi+POM preview 100char → expand Def MOM/follow_up/notes; empty "Customer belum terhubung ke prospect"), **BANT & Pipeline** (`BantScoreBar` + 7 Def field + pipeline stage; empty "Belum ada data pipeline"), **Notes** (read-only + Edit Notes inline textarea Simpan/Batal). **Fetch** diperluas: join `prospect:prospects!customers_prospect_id_fkey(id,name,pipeline_stage,bant_*)` → BANT baca dari join (hapus effect fetch prospect terpisah → lint 3→2); fallback `select('*')`. Visits tetap fetch terpisah `sales_visits` by prospect_id. Props `{ id, onBack, showToast }` (tetap). Reuse `BantScoreBar`+`calcBantScore`+`ConfirmModal`+`CustomerFormModal`(named import). **App.jsx:** MENU_KEY_MAP tambah `'customer-detail':'crm_customers'`; block `customer-detail` (sudah ada) — catatan: ComingSoonPage di-gate `PLANNED_MODULES[activeMenu]` (bukan true catch-all) & `customer-detail` tak ada di map, jadi urutan aman. Lint CustomerDetailPage 2 (fetch+visits effect, pola baseline), App.jsx 4→4. build clean. | ✅ Complete |

| 2.1F | **CustomerListPage — port visual Lovable design** (handoff `claude.ai/design`, file `CustomerListPage.jsx` assets-it style). Overwrite penuh: ambil HANYA visual/layout, **semua logic Supabase existing dipertahankan**. Visual baru: header (breadcrumb chevron inline-icon, title Montserrat 25px, Export outline-btn + "Tambah Customer" orange primary), **4 stat cards** (StatCard: label + rounded icon container + value Montserrat 30px + hint) = Total/Active/Tier A/Free Agent (semua dari `filtered`), **filter bar di dalam table card** (search + Tier + Status + Entitas[hanya !entityLocked] + count "Menampilkan X dari Y"), **tabel** kolom Code(mono)/Nama(avatar navy 34px initials + Montserrat)/Legal/PIC(avatar bulat 24px warna hash + nama)/Tier(pill+dot)/Status(pill+dot)/Payment Terms(mono)/Last Activity(mono)/aksi(eye+pencil), zebra + hover via `CustomerRow` (hover state). Inline lucide `Ico`/`ICONS` (self-contained), `TIER_CFG`/`STATUS_CFG`/`PIC_COLORS`, helper `initials`(strip PT/CV)/`colorFor`/`statusOf`. **Logic dipertahankan 100%:** props `{ entityFilter, showToast, onSelectCustomer }`; fetch `customers` join assigned_profile/source_company/payment_term + fallback `select('*')`; entityFilter (MSI/JCI/SOA→source_company.code, FREE_AGENT→status) + client-side filter (search debounce 300ms, +pic_name ke search per design); row klik & eye → `onSelectCustomer(c.id)`, pencil → edit; `CustomerFormModal` **byte-for-byte dipertahankan** (named export, dipakai CustomerDetailPage); `ENTITY_HEADER`. **Tambahan kecil:** Export button → real CSV client-side dari `filtered` (bukan dummy). **Tidak diambil dari design:** checkbox/bulk-bar (hindari fitur bulk-delete baru), pagination footer (existing tanpa paginasi), full-page CREAM bg + maxWidth wrap (konsisten app shell). Last Activity = `last_activity_at || updated_at || created_at`. Lint 1→1 (fetch effect, net-zero). build clean. | ✅ Complete |

| 2.1G | **CustomerDetailPage — port visual Lovable design + Health Score tab** (overwrite penuh, `claude.ai/design` handoff asset-detail-it style). Ambil visual/layout, **semua logic existing dipertahankan**. Visual baru: page head (back btn + breadcrumb + title "Detail Customer" + Edit/Hapus outline+danger btn role-gated), **header card** grid 3-col (avatar bulat navy 76px initials, plate=code mono + status badge dot, nama Montserrat 23px, sub=legal_name/customer_type, badge row [navy entitas + tier gold award + PIC pill avatar], box kanan **"Credit Limit"** [repurpose dari design "Tier Value" → data real `credit_limit`] + "Customer sejak {created_at}"), **tab bar underline** (Montserrat, aktif orange border-bottom) **6 tab**: Info Dasar/Komersial/History Visit(count)/BANT & Pipeline/**Health Score**/Notes. Info & Komersial pakai `GridSection`+`GridField` (card head navy + grid 2-kolom label-on-top, border logic idx/total). History Visit: `VisitRow` (date mono + visit_type badge + status badge + point + meta[salesperson avatar/lokasi/jam] + expand MOM/follow_up). BANT: `BantScoreBar` (komponen project, **dipertahankan**) di card + 7 kriteria grid (icon+label+value) + Pipeline Stage card (WON→badge hijau). **Health Score (BARU):** karena tak ada data health di DB → `computeHealth()` **heuristik dari sinyal real** (Engagement Visit 30% dari visit count, BANT Qualification 30% dari bant_score, Pipeline Status 20% dari stage, Kelengkapan Profil 10%, Status Kontrak 10%); gauge ring SVG + status badge HEALTHY/MONITOR/AT-RISK + breakdown 5 komponen progress bar + rekomendasi card; **banner kuning "skor sementara/heuristik"** + `// TODO(health-score)` comment; **TIDAK buat kolom DB baru**, bukan dummy. Notes: read-only + Edit Notes inline (notesDraft/saveNotes existing). **Logic dipertahankan 100%:** props `{ id, onBack, showToast }`; fetch customers join assigned_profile/source_company/payment_term/prospect(bant_*) + fallback `select('*')`; fetch sales_visits by prospect_id (sekali saat prospect_id ready, serve visit+health tab); ConfirmModal delete role-gated (super_admin/admin/manager); inline notes edit. Inline `Icon`/`ICONS` self-contained. **Tidak diambil:** Clone btn, full-page CREAM bg + maxWidth wrap (konsisten app shell). CustomerListPage/CustomerFormModal **tidak disentuh**. Lint 2 (fetch+visits effect, net-zero vs 2.1E). build clean. | ✅ Complete |

| 2.1G-hotfix | App.jsx — fix bug catch-all ComingSoonPage (Block B, ~baris 1896-1906) ikut ter-render bareng CustomerDetailPage saat `activeMenu === 'customer-detail'`. Penyebab: guard `startsWith('crm-')` tidak menangkap prefix `customer-` (id `customer-detail`), dan `customer-detail` tidak ada di exclusion array → semua sub-kondisi true → ComingSoonPage "Coming Soon" stack di atas detail page. Fix: tambah `&& !activeMenu?.startsWith('customer-')` ke kondisi Block B (future-proof utk semua id `customer-*`). 1 baris diubah, tidak ada perubahan lain. Lint App.jsx 4→4 (net-zero). build clean. **Catatan:** klaim 2.1E "urutan aman" hanya cover Block A (`PLANNED_MODULES[activeMenu]`); Block B (catch-all) terlewat. | ✅ Complete |

| 2.2A | **Accounts rename — Batch 1 (Pipeline & Prospect pages)**. Tabel `prospects` → `accounts` di DB (kolom baru: `account_status` prospect/customer/lost/free_agent, `owner_company_id`, `tier`, `code`, `nomor_kontrak`, `default_dc`, `last_activity_at`, `became_customer_at`). **FK decision (KONTEKS):** rename tabel TIDAK rename constraint → embed `profiles!prospects_assigned_to_fkey` & `inquiries_prospect_id_fkey` dll **TETAP pakai nama constraint `prospects_*`** (hanya nama tabel target yg diubah). Tidak bisa test live di env ini; pilih opsi yg dijamin valid per aturan rename. **PipelineKanbanPage:** fetchProspects `.from('accounts')` + `.eq('account_status','prospect')` (embed constraint tetap); handleDropStage UPDATE → accounts; handleWinLossSave UPDATE → accounts + **WON auto-convert** (`account_status='customer'`, `became_customer_at=now()`, `converted_at=now()`), LOST → `account_status='lost'`. **ProspectListPage:** list SELECT → accounts + filter prospect; soft-delete UPDATE → accounts. **ProspectFormPage:** handleDelete + checkDuplicateName(+filter prospect) + UPDATE + INSERT → accounts; INSERT payload tambah `account_status='prospect'`, `owner_company_id=company_id`, `last_activity_at=now()`; consumer `useCustomFields('accounts')` + `STANDARD_COLUMNS.accounts`. **CRMDashboardPage:** 3 query prospects (full/lastMonth/salesPerf) + AddVisitModal options → accounts + `.eq('account_status','prospect')` (embed constraint tetap); sales_visits embed `prospects(name)` → **`prospects:accounts(name)`** (alias agar consumer `v.prospects?.name` tetap jalan tanpa diubah). **useCustomFields.js:** key `STANDARD_COLUMNS.prospects` → `accounts` + 8 kolom baru ditambah. **SchemaManagerPage:** tables list `'prospects'` → `'accounts'`. **TIDAK disentuh (Batch 2/3):** SalesCallsPage, InquiryListPage/InquiryFormPage, QuotationFormPage (masih `.from('prospects')`), CustomerListPage/CustomerDetailPage (masih `.from('customers')`). Lint semua file net-zero (edit mekanikal). build clean. **⚠️ Verifikasi runtime:** karena embed pakai constraint `prospects_*_fkey`, kalau ternyata DBA me-rename constraint ke `accounts_*`, embed akan error → ganti nama constraint di embed. | ✅ Complete |

| 2.2B | **Accounts rename — Batch 2 (Inquiry, Calls, Quotation embeds)**. Constraint FK dikonfirmasi TIDAK berubah (pg_constraint) → embed pakai nama constraint lama `prospects_*`/`*_prospect_id_fkey`, hanya nama tabel target `prospects`→`accounts`. **InquiryListPage** L153 embed `prospect:prospects!inquiries_prospect_id_fkey` → `prospect:accounts!inquiries_prospect_id_fkey`. **InquiryFormPage** L86 `.from('prospects')` → `.from('accounts')` + `.eq('account_status','prospect')`. **SalesCallsPage** L351 embed → `accounts!sales_calls_prospect_id_fkey`, L374 `.from('accounts')` + filter prospect. **QuotationFormPage** L291 embed → `accounts!inquiries_prospect_id_fkey`. Constraint names di-PRESERVE semua. Lint net-zero (string swap). build clean. **⚠️ GAP DITEMUKAN (di luar daftar task, belum di-fix):** `QuotationListPage.jsx:102` + `QuotationDetailPage.jsx:168` masih `prospect:prospects!quotations_prospect_id_fkey(...)` — modul Quotation yg sama, BROKEN setelah rename (tabel `prospects` sudah tidak ada), tapi tidak ada di daftar file Batch 2. Perlu fix sama: `prospects`→`accounts` (constraint `quotations_prospect_id_fkey` tetap). Sisa ref `prospects` di repo: 2 file Quotation ini + `CustomerDetailPage.jsx:413` (`customers_prospect_id_fkey` — Batch 3). | ✅ Complete |

| 2.2B-fix | **Accounts rename — Batch 2 gap fix (2 embed Quotation yg terlewat).** `QuotationListPage.jsx:102` embed `prospect:prospects!quotations_prospect_id_fkey(name)` → `prospect:accounts!...`; `QuotationDetailPage.jsx:168` embed `prospect:prospects!quotations_prospect_id_fkey(name, address, city, pic_name, pic_email, pic_phone)` → `prospect:accounts!...`. Constraint `quotations_prospect_id_fkey` di-PRESERVE; alias `prospect:` tetap → consumer `q.prospect?.name`/`quot.prospect?.…` tidak diubah. Lint net-zero (string swap). build clean. **Sisa ref `prospects` di repo sekarang HANYA `CustomerDetailPage.jsx:413` (`customers_prospect_id_fkey` — Batch 3).** | ✅ Complete |

| 2.2C | **Accounts rename — Batch 3 (CustomerListPage & CustomerDetailPage: `customers` → `accounts WHERE account_status='customer'`)**. Mapping: customers.status='active'→account_status='customer'; source_company_id→owner_company_id (filter entitas); tier/code/assigned_to/payment_terms_id/credit_limit tetap. **Embed join diubah (constraint accounts pakai prefix lama `prospects_*`):** `profiles!customers_assigned_to_fkey`→`profiles!prospects_assigned_to_fkey`; `companies!customers_source_company_id_fkey(name,code)`→`companies!prospects_owner_company_id_fkey(name,code)` (**alias `source_company` DIPERTAHANKAN** → consumer `c.source_company?.code` tidak diubah); `payment_terms!customers_payment_terms_id_fkey`→`payment_terms!prospects_payment_terms_id_fkey`. **CustomerListPage:** fetchCustomers `.from('accounts')` + `.eq('account_status', entityFilter==='FREE_AGENT'?'free_agent':'customer')` + fallback, deps `[entityFilter]`; dup-check + UPDATE + INSERT → accounts; INSERT payload `account_status='customer'`, `owner_company_id=company_id`, `became_customer_at=now()` (hapus `source_company_id`+`active`); form `status` spread → `account_status` mapping (free_agent→free_agent, else customer); `statusOf`=`account_status`; STATUS_CFG +customer/prospect/lost; stat "Active" = count account_status='customer'. **CustomerDetailPage:** fetchCustomer `.from('accounts')` + 3 embed constraint swap + **HAPUS embed `prospect:prospects!customers_prospect_id_fkey`** (BANT ada langsung di row account); `const prospect = customer` → semua `prospect.bant_*`/`pipeline_stage`/`name` baca dari row account; `hasBant` guard (`BANT_FIELD_DEFS`); visits `.eq('prospect_id', id)` (account.id = sales_visits.prospect_id, fetch by `id` bukan customer.prospect_id, hapus guard "belum terhubung"); notes + delete UPDATE → accounts; statusOf/STATUS_CFG sama; label "Prospect:"→"Account:". Lint net-zero (List 1→1, Detail 2→2). build clean. **✅ Repo: 0 ref tabel `prospects` tersisa.** ⚠️ **GAP (di luar scope, BELUM di-fix):** embed `customer:customers!*_customer_id_fkey` di InquiryListPage L154/InquiryFormPage L88(`.from('customers')`)/QuotationListPage L103/QuotationDetailPage L169/QuotationFormPage L291 masih ke tabel `customers`. Tidak rusak oleh rename prospects→accounts (tabel customers belum disentuh), TAPI kalau `customers` di-deprecate jadi accounts, embed `customer_id` ini perlu diputuskan (tetap ke customers? atau ke accounts?). db.js + CustomerMasterPage.legacy.jsx = Storbit legacy, abaikan. | ✅ Complete |

| 2.2C-hotfix | CustomerListPage.jsx — fix status filter dropdown agar match `account_status`. Konstanta baru `STATUS_FILTERS` ([{customer,'Customer'},{free_agent,'Free Agent'}]) khusus filter bar (terpisah dari `CUST_STATUSES` yg masih dipakai form add/edit — **form TIDAK diubah**). Dropdown filter: opsi "Semua Status" / Customer / Free Agent (ganti dari active/inactive); pakai `STATUS_FILTERS.map`. Filter logic `statusOf(c) !== filterStatus` sudah baca `account_status` (dari 2.2C) → tidak diubah, sekarang match. Dropdown di-hide saat `entityFilter === 'FREE_AGENT'` (sudah ter-lock). Lint 1→1 (net-zero), build clean. | ✅ Complete |

| 2.2C-sidebar | App.jsx — fix sidebar saat `activeMenu==='customer-detail'` (CRM menu collapse + tidak ada highlight). **FIX 1** `navigateToCustomerDetail`: tambah defensif `setActiveModule(group.label)` (cari ERP_MENU_GROUPS yg punya item/child/grandchild `crm-customers`/`crm-customers-*`) sebelum set activeMenu — mirror `navigateToAssetDetail`, robust utk deep-link/refresh. **FIX 2** `SidebarItem`: tambah `isCustomerDetailContext = activeMenu==='customer-detail'` + helper `isCustomersNode(n)` (id `crm-customers` atau punya children `crm-customers-*`); `childActive` parent CRM + `subActive` sub-grup Master Customer dianggap aktif saat customer-detail context → menu "CRM & Inquiry" tetap expanded & "Master Customer" tetap highlight/expand di detail page. Hanya 2 lokasi diubah, tidak menyentuh modul lain (isCustomersNode hanya match node crm-customers). Lint App.jsx 4→4 (net-zero). build clean. | ✅ Complete |

| 2.3A | **User Access — Edge Functions delete-user + reset-password (Tahap 1, backend only — UI belum disentuh)**. Dua EF baru mirror PERSIS pattern `create-user` (CORS const, `json()` helper, two-client: `callerClient` ANON_KEY+Authorization utk `rpc('is_super_admin')` gate, `adminClient` SERVICE_ROLE_KEY utk operasi privileged; Deno std http `serve`). **`supabase/functions/delete-user/index.ts`:** body `{ user_id }`; validasi user_id; gate super_admin→403; **SAFETY** ambil caller id via `callerClient.auth.getUser()`, jika `user_id===caller.id`→400 "Tidak bisa menghapus akun sendiri"; adminClient hapus berurutan `user_roles.delete().eq('user_id')` → `profiles.delete().eq('id')` (manual, jaga kalau tak ada FK cascade) → `auth.admin.deleteUser(user_id)`; return `{success:true}` (200). **`supabase/functions/reset-password/index.ts`:** body `{ user_id, new_password }`; validasi user_id + new_password min 8 char→400; gate super_admin→403; adminClient `auth.admin.updateUserById(user_id, { password: new_password })`; return `{success:true}` (200). **`src/hooks/useUserAccess.js`:** 2 helper baru di-export, mirror `createUser` (unwrap `error.context.json()` utk surface pesan asli dari EF) — `deleteUser(userId)` invoke 'delete-user' body `{user_id}`; `resetUserPassword(userId, newPassword)` invoke 'reset-password' body `{user_id, new_password}`. `create-user` TIDAK diubah. Lint useUserAccess.js clean, build clean. **Catatan deploy:** EF perlu `supabase functions deploy delete-user reset-password` (belum di-deploy). | ✅ Complete |

| 2.3B | **User Access — UI Tahap 2: Edit modal→full page + Hapus User + Ubah Password**. (1) **Edit jadi full page** (state-swap di AdminShell, mirror AssetDetailPage): `AdminShell` tambah state `editUserId`+`editUserRow` + shell-level toast (`showToast` di-pass ke UserAccessPage & UserEditPage agar toast survive navigasi state-swap, mis. "User berhasil dihapus" setelah balik ke list); `handleSelect` (ganti `setActiveTab`) reset edit sub-page saat pindah tab sidebar; `'user-access'` dikeluarkan dari `PAGE_MAP`, di-special-case render `UserAccessPage` (props) / `UserEditPage` saat `editUserId`; activeTab tetap `'user-access'` saat edit → sidebar highlight bertahan. (2) **Refactor anti-duplikasi:** ekstrak primitives ke 2 file baru — `userAccessTokens.js` (PASTEL/NAVY/ORANGE/RED, LEGACY_ROLES, LEGACY_ROLE_COLOR, getPrimaryErpRole, EMAIL_RE, ACTION_ORDER — **plain .js** agar `userAccessShared.jsx` cuma export komponen → patuhi react-refresh, pola sama `bant.js`/`BantScoreBar.jsx`) + `userAccessShared.jsx` (Avatar+param `size`, RoleBadge, StatusBadge, Field*, SectionLabel, Divider, SaveError, **PermissionMatrix**). UserAccessPage & UserEditPage import dari kedua file. (3) **`UserAccessPage.jsx`:** Edit modal + semua state/logic edit & permission matrix DIHAPUS (pindah ke UserEditPage); props `{ showToast, onEditUser }`; tombol Edit row → `onEditUser(row)`; toast pakai prop (fallback lokal jika prop absen); Add User + activate/deactivate + ConfirmModal + search/pagination **dipertahankan**. (4) **`UserEditPage.jsx` (baru, `{ userId, initialRow, onBack, showToast }`):** action bar (← Kembali + breadcrumb Admin›User Access›nama + tombol Ubah Password/Hapus User/Save Changes) + header card (Avatar 56px, nama, id/email mono IBM Plex Mono, RoleBadge+StatusBadge+company code) + tab Profile/Permissions (logic `saveUserAccess` + PermissionMatrix diff-save **verbatim** dari modal lama; init draft dari `initialRow`, fallback fetch profiles+user_roles jika absen); **Hapus User** (merah, super_admin only & **disembunyikan utk akun sendiri** `userId===myProfile.id`) → ConfirmModal variant danger → `deleteUser(userId)` → showToast + onBack; **Ubah Password** (super_admin only) → `ChangePasswordModal` (key-based remount utk reset field, no effect → lint clean): Password Baru + Konfirmasi, validasi sama+min 8 → `resetUserPassword`. super_admin check: `erpRole==='super_admin' || profile?.role==='super'`. **Catatan:** `profiles` tak punya kolom `email` (ada di auth.users) → header tampil user id (mono) sbg fallback. Self-protection deactivate (toggle disabled utk diri sendiri) dipertahankan. Lint set-state-in-effect 2→2 net-zero (matrix effect pindah dari UserAccessPage ke UserEditPage; add-cascade tetap di UserAccessPage). build clean. | ✅ Complete |

| 2.3C | **User Access — Avatar upload di UserEditPage**. Kolom `profiles.avatar_url` (TEXT) + bucket Storage `avatars` (public, max 2MB, image only) + policy sudah ada (di luar repo). (1) **`userAccessShared.jsx` `Avatar`:** tambah prop `avatarUrl` — jika ada render `<img>` (rounded-full, object-cover, bg lineSoft), else inisial fallback (existing). (2) **`useUserAccess.js`:** select list profiles tambah `avatar_url` → row list bawa foto. (3) **`UserAccessPage.jsx`:** Avatar row kolom nama `avatarUrl={row.avatar_url}`. (4) **`UserEditPage.jsx`:** const module `AVATAR_TYPES` ({png,jpeg→jpg,webp}) + `AVATAR_MAX_BYTES` (2MB); state `avatarUrl`(init `initialRow?.avatar_url`)/`uploading`/`fileInputRef`(useRef); fallback fetch select tambah `avatar_url`+`setAvatarUrl`. Header card avatar diganti: kolom flex — tombol bulat 56px (`group relative overflow-hidden`, onClick→`handlePickFile`→trigger hidden `<input type=file accept=image/png,jpeg,webp>`) berisi `Avatar avatarUrl` + overlay (`opacity-0 group-hover:opacity-100`, bg navy rgba(20,70,130,0.55), icon **Camera** putih; saat uploading overlay `opacity-100` + **Spinner**); di bawahnya tombol **"Hapus Foto"** (icon Trash2, merah RED) hanya jika `avatarUrl && !uploading`. `handleFileChange`: validasi type via AVATAR_TYPES (else toast "Format foto harus PNG, JPEG, atau WEBP") + size ≤2MB (else toast "maksimal 2MB") → `supabase.storage.from('avatars').upload(`${userId}-${Date.now()}.${ext}`, file, {upsert:true, contentType})` → `getPublicUrl` → `profiles.update({avatar_url}).eq('id',userId)` → `setAvatarUrl` + toast "Foto berhasil diupload"; error di tiap step → toast error + reset uploading. `handleRemoveAvatar`: `profiles.update({avatar_url:null})` → `setAvatarUrl(null)` + toast "Foto dihapus" (objek storage TIDAK dihapus — hanya unset URL, di luar scope). filename pakai `Date.now()` → URL selalu baru → no cache stale. Tidak ada role-gate khusus (siapa pun yg bisa buka halaman bisa ubah foto). Fitur lain (delete user/change password/save/permission) tidak disentuh. Lint 2→2 err + 1 warn net-zero (sama baseline 2.3B, 0 isu baru dari avatar). build clean. | ✅ Complete |

| 2.3D | **Auth lifecycle hardening — Fix A (logout localStorage cleanup) + Fix B (validasi restored activeMenu)**. Dari audit auth lifecycle (Fix C content-gate & Fix D permissionsLoading flag TIDAK dikerjakan — tahap berikut; RLS tidak disentuh). **FIX A — `AuthContext.jsx` `signOut`:** sebelum `supabase.auth.signOut()`, tambah `localStorage.removeItem('nexus_last_menu')` + `removeItem('nexus_last_module')` → user berikutnya di browser sama tidak mewarisi menu/module user sebelumnya (key ini tidak user-scoped & survive logout). **FIX B — `App.jsx` validasi restored activeMenu:** `activeMenu` di-init dari localStorage (bisa milik user lama). Tambah: (1) helper module-scope `collectMenuIds(nodes, acc)` — rekursif kumpulkan SEMUA id navigable (items → children → grandchildren, skip section) karena `visibleMenus` (flat) cuma cover level atas → grandchild spt `crm-customers-msi` & child `input` TIDAK ada di visibleMenus (kalau pakai `visibleMenus.some` polos → salah redirect). (2) destructure `useAuth()` tambah `userPermissions, menuPermissions`. (3) `useEffect` baru (ditaruh di antara effect top-level SEBELUM early-return `if(loading)` di ~1535 — rules-of-hooks; hitung visible tree DI DALAM effect dari `ERP_MENU_GROUPS`+`canSeeMenuItem`, bukan dari const `visibleMenus` yg ada setelah early-return): guard `if(!profile)return`; **permsLoaded** (`role==='super_admin' || profile.role==='super' || userPermissions.length || menuPermissions.length`) → skip kalau belum load (cegah salah-redirect saat refresh di halaman gated valid, window fetch permission pasca-login — ini hanya MEN-TIME redirect, bukan Fix D); skip SYNTHETIC `['home','customer-detail','assets-detail','product-detail','user-edit']` + prefix `customer-`/`assets-`/`product-` (di-navigate programmatic); build `visGroups`/`visFlat`, `if(visFlat.length===0)return`; `accessibleIds=collectMenuIds(visGroups.flatMap(items))`; kalau `!accessibleIds.has(activeMenu)` → `setActiveMenu(visFlat[0]?.id||'home')` (redirect self-terminating, no loop — di-`eslint-disable-next-line react-hooks/set-state-in-effect` + komentar). deps `[profile, role, hasPermission, hasMenuPermission, userPermissions, menuPermissions, activeMenu]`. **Catatan struktur:** `visibleMenus` = flat list item non-section level atas (punya `.id`); menu tree 3 level (group.items → children → grandchildren); makanya pakai collectMenuIds rekursif. **Verifikasi skenario:** klik menu/grandchild normal → tetap; refresh di halaman gated valid (non-super) → permsLoaded false dulu (no redirect) lalu perms load → tetap di halaman; user B warisi menu CRM user A tanpa akses → redirect ke dashboard; detail/synthetic → skip. Lint net-zero (App.jsx 3→3, AuthContext 2→2; 1 set-state baru di-suppress dgn directive yg terpakai → no unused-directive warning; isCrossEntity-unused & 2 set-state lama + 1 exhaustive-deps warning semua pre-existing). build clean. | ✅ Complete |

| 2.3E | **Fix "klik modul tidak responsif setelah login user baru sampai refresh" + Fix D (permissionsLoading)**. Akar masalah (dari audit): `enterModule` punya stale closure (deps `[role]` saja → tak refresh saat permission load) + auth listener tak set `loading` saat login in-tab → App mount sebelum menuPermissions (query join berat) selesai → klik CRM no-op diam permanen sampai refresh. **FIX 1 — `App.jsx` `enterModule` (~1219):** deps jadi `[role, hasPermission, hasMenuPermission]` (closure refresh saat perms load); rewrite pakai `findFirstVisible(items)` rekursif (traverse children/grandchildren) karena grup CRM = 1 parent wrapper (`crm-dashboard`) yg membungkus semua page sbg children — `group.items.find` lama cuma cek wrapper (yg ada di MENU_KEY_MAP → gated) → `first` undefined saat perms kosong → early-return no-op. Sekarang cari leaf visible pertama; kalau parent visible tapi tak ada child visible, fallback ke parent. **FIX 2 — `AuthContext.jsx` listener `onAuthStateChange` (~106):** saat `event==='SIGNED_IN'` → `setLoading(true)` sebelum fetch profile, `setLoading(false)` di `.then` + `.catch` (mirror getSession path) → login in-tab tahan App sampai profile ready (sama spt refresh). **HANYA** untuk SIGNED_IN (TOKEN_REFRESHED/INITIAL_SESSION/USER_UPDATED tidak di-toggle → cegah flash loading screen tiap token auto-refresh). **FIX 3 (Fix D) — `permissionsLoading` flag:** state baru `permissionsLoading` init true; di-manage DI DALAM `fetchMenuPermissions` (async: `setPermissionsLoading(true)` di awal, `false` di `finally`) — bukan di body effect → tidak nambah set-state-in-effect lint; effect menuPermissions disederhanakan jadi `fetchMenuPermissions(session?.user?.id || null)` (hilangkan `else setMenuPermissions([])` sinkron, tapi tetap 1 error di line itu krn call sync setState di dalam fn). Expose `permissionsLoading` di context value. `App.jsx`: destructure `permissionsLoading`, pass ke AppLauncher sbg `permissionsLoading={permissionsLoading && !(role==='super_admin'||profile?.role==='super')}` (super tak pernah di-block). `AppLauncher.jsx`: prop `permissionsLoading`, import `Loader2`, subtitle jadi "Memuat izin akses…" + spinner saat loading, grid `aria-busy` + `opacity:0.55` + `pointerEvents:'none'` saat loading (klik di-block, tidak no-op diam), `@keyframes spin` ditambah. **Verifikasi mental:** login in-tab B → SIGNED_IN setLoading(true) spinner → profile ready loading false App mount → permissionsLoading true → launcher dim+blocked "Memuat izin akses…" → perms load setPermissionsLoading(false) + hasMenuPermission identity ganti → enterModule recreate (deps) → klik CRM traverse children → navigate TANPA refresh ✓; super_admin tak pernah ke-block ✓; refresh flow tetap ✓; token refresh tak flash ✓. RLS tidak disentuh. Lint net-zero (App.jsx 3→3 err + **warning exhaustive-deps enterModule lama HILANG** krn deps di-fix; AuthContext 2→2 err [2 effect sama: fetchPermissionsForRoleId & menuPermissions]; AppLauncher 0). build clean. | ✅ Complete |

| 2.3F | **Fix C — content-level access gate (defense-in-depth)**. Sebelumnya konten di-render `{activeMenu==='id' && <Page/>}` TANPA cek permission (sidebar sudah ter-gate `canSeeMenuItem`, konten tidak) → celah data exposure, terutama CRM (RLS disabled). **(1)** Komponen module-scope baru `AccessDeniedPage({ onGoHome })` (setelah `collectMenuIds`): card putih, icon `Shield` navy #144682, judul "Akses Ditolak", pesan "Anda tidak memiliki izin untuk mengakses halaman ini.", tombol "Kembali ke Beranda" (`ChevronLeft`). Pakai icon yg SUDAH di-import (Shield, ChevronLeft) — no import baru. **(2)** Helper `canAccessActiveMenu` — **plain const** (BUKAN useMemo, krn berada setelah early-return `if(loading)` → rules-of-hooks; juga butuh `visibleMenuGroups` yg dihitung tepat di atasnya): super_admin/super → true; SYNTHETIC `['home','customer-detail','assets-detail','product-detail','user-edit']` + prefix `customer-`/`assets-`/`product-` → true; else cek `activeMenu` ada di `accessibleIds` (rekursif `collectMenuIds` atas `visibleMenuGroups`, reuse helper Fix B). **(3)** Gate konten: di dalam `<div className="nexus-main-surface" style={{display: activeModule?undefined:'none'}}>` (div yg menampung SELURUH chain `{activeMenu===...}`), bungkus isi: `{!canAccessActiveMenu && !permissionsLoading ? <AccessDeniedPage onGoHome={()=>{setActiveModule(null);setActiveMenu('home')}}/> : (<>…chain…</>)}`. **TIDAK** membungkus AppLauncher (block terpisah, home selalu allowed). Sidebar di luar wrap → user tetap bisa navigasi saat Access Denied. **(4) Loading:** pakai RAW `permissionsLoading` di kondisi — saat true, ternary false → render konten normal (BUKAN Access Denied) → tidak ada false-deny saat permission belum load. super_admin tak pernah kena (canAccessActiveMenu true duluan). **Sinergi:** Fix B (2.3D) redirect restored activeMenu inaccessible → visibleMenus[0] setelah perms load; Fix D (2.3E) block klik launcher saat loading → praktis saat masuk modul perms sudah load. Fix C = backstop untuk window singkat/edge. **Catatan:** ini frontend defense-in-depth — idealnya RLS CRM di-enable juga (belum, di luar scope). Lint App.jsx 3→3 (isCrossEntity-unused + 2 set-state lama, semua pre-existing; AccessDeniedPage & canAccessActiveMenu 0 isu baru). build clean. | ✅ Complete |

| 2.3G | **Hapus legacy `profiles.role` — Tahap 2 (Edge Functions).** Bagian dari deprecate `profiles.role` (DB functions get_user_role_code/handle_new_user sudah dibersihkan di luar repo; drop kolom = Tahap 4, BELUM). **(1) `manage-schema/index.ts` (KRITIS — fail-closed):** gate super-admin lama baca `profiles.role` via `dbSelect` + `SUPER_ADMIN_ROLES=['super','super_admin']` → setelah kolom di-drop `profile.role=undefined` → SEMUA 403. **Fix:** import `createClient` (esm.sh), buat `callerClient` dari `SUPABASE_ANON_KEY` + `Authorization` header user, panggil `callerClient.rpc('is_super_admin')` → `if (roleErr || !isSuper) 403` (mirror pattern create-user). is_super_admin() pakai `auth.uid()` caller (BUKAN service role). Hapus `SUPER_ADMIN_ROLES`, `decodeJwtPayload`, `dbSelect` (dead). `serviceKey` (`MSI_DB_KEY`) + `dbExecSql` TETAP untuk operasi ALTER TABLE (butuh elevated). **(2) `create-user/index.ts`:** hapus `ERP_CODE_TO_LEGACY` map (14 entri), hapus fetch `roles.code`→`legacyRole`, hapus `profilePatch.role`. profilePatch sekarang update `full_name/company_id/branch_id/department_id/position_id` TANPA role. `user_roles` upsert (`role_id: erp_role_id`) + gate `is_super_admin` TIDAK diubah — itu sistem role yg benar. Doc comment flow diupdate (step 4 tanpa role, catatan role di user_roles saja). **TIDAK disentuh:** delete-user, reset-password. **Catatan:** Edge Functions (Deno) tidak masuk Vite build/lint — syntax diverifikasi via brace/paren balance (OK both); typecheck asli saat deploy. **Kedua function HARUS di-deploy manual** (`supabase functions deploy manage-schema create-user`) — belum di-deploy. **Prasyarat runtime:** `SUPABASE_ANON_KEY` harus tersedia di env edge manage-schema (create-user sudah pakai); kalau project pakai env non-standar (manage-schema pakai `MSI_DB_KEY` utk service), pastikan ANON_KEY ter-set sebelum deploy. **Frontend (useUserAccess saveUserAccess, UserManagement, profile selects) yg masih baca/tulis profiles.role = Tahap 3, BELUM.** build (Vite) clean — tidak ada file frontend diubah. | ✅ Complete |

| 2.3H | **Hapus legacy `profiles.role` — Tahap 3 (frontend `src/`).** Role sekarang MURNI dari `user_roles` (erpRole/role di context). Drop kolom = Tahap 4 (BELUM). **(1) `AuthContext.jsx`:** `erpRoleCode` hapus fallback `|| profile?.role` → `primaryErpRole?.roles?.code || null`; 3 super-check (`hasPermission`/`hasMenuPermission`/`isCrossEntity`) hapus `|| profile?.role === 'super'` → `erpRoleCode === 'super_admin'`; 3 dep array hapus `profile?.role`; comment diupdate. **(2) `App.jsx`:** permsLoaded (Fix B) hapus `profile.role === 'super'`; `canAccessActiveMenu` (Fix C) hapus `profile?.role === 'super'` (TETAP `role === 'super'` krn itu context role); AppLauncher permissionsLoading flag hapus `profile?.role === 'super'`. **(3) `UserEditPage.jsx`:** `isSuperAdmin` hapus `|| myProfile?.role === 'super'`; fallback-fetch select hapus kolom `role`; RoleBadge `legacyRole={rowMeta?.role || draft?.role}` → `legacyRole={null}` (ERP role satu-satunya sumber; `myProfile` masih dipakai utk `.id`). **(4) `RolesPage.jsx`:** `viewerRole={erpRole ?? profile?.role}` → `{erpRole}`; `profile` di-drop dari `useAuth()` destructure (jadi unused). **(5) `SchemaManagerPage.jsx`:** `const role = erpRole ?? profile?.role` → `erpRole`; drop `profile` + `user` (keduanya unused) dari destructure → `const { erpRole }`. **(6) `useUserAccess.js`:** hapus `ERP_CODE_TO_LEGACY` + `erpCodeToLegacy` (cuma dipakai di sini), hapus penulisan `patchWithRole.role` di `saveUserAccess` (sekarang update `profilePatch` langsung, TANPA role — role hanya via user_roles Step 2), hapus kolom `role` dari list select. **(7) `UserManagement.jsx`** — TIDAK di-import/route manapun (dead) → `git mv` ke `UserManagement.legacy.jsx` + header comment "LEGACY, do not wire back, masih baca/tulis profiles.role". **(8) Non-breaking left as-is:** `ROLES`/`PERMISSIONS`/`can()` di App.jsx (legacy keys masih ada, dipakai can()), dead branch `'super'`/`'logistic'` di SalesOrderDetailPage (baca context `role`, bukan profile.role — aman). **Verifikasi:** 0 ref `profile.role`/`myProfile.role` tersisa di src live (excl .legacy); 0 ref ERP_CODE_TO_LEGACY; 0 profiles-select pull `role`. super_admin tetap berfungsi via user_roles (erpRoleCode='super_admin'). Lint net-zero (AuthContext 2→2, App 3→3, UserEditPage 1→1, RolesPage 1→1, useUserAccess 0→0; SchemaManagerPage 3→2 = hapus unused `user` pre-existing). build clean. **Catatan:** user TANPA entry user_roles kini fallback ke `role='management'` (App.jsx `authRole||'management'`), bukan profile.role — OK krn semua user sudah punya user_roles. **Tahap 4 (drop kolom + enum user_role_legacy) BELUM — perlu approval + verifikasi semua super_admin ada di user_roles.** | ✅ Complete |

| 2.3I | **SchemaManagerPage.jsx — hilangkan 404 noise `information_schema_columns_view`.** `fetchColumns()` lama coba query view `information_schema_columns_view` dulu (`.from(...).select('column_name, data_type, ordinal_position').eq('table_name'...).eq('table_schema','public')`) → view itu TIDAK ada di DB → 404 di console tiap ganti tabel → baru fallback ke RPC `get_table_columns` (yg berhasil). Fix: hapus percobaan view, langsung `supabase.rpc('get_table_columns', { p_table: table })` (pola sama `useCustomFields.js:59`), pertahankan `setColumns(data||[])` + error toast "Gagal fetch kolom" + `finally setColLoading(false)`. **Shape OK tanpa mapping:** `ColTable` render cuma pakai `col.column_name` (line 105) + `col.data_type` (106); kolom `#` pakai index map `i` (bukan `ordinal_position`); RPC sebelumnya sudah jadi fallback yg `setColumns(rpcData)` & render benar → terbukti kompatibel (RPC return `{column_name, data_type, ...}`, dikonfirmasi useCustomFields/CustomFieldsSection). `ordinal_position` tidak dipakai di render → aman dihapus dari select. **Catatan:** `get_table_columns` & view tidak ada di repo migrations (DB ad-hoc); RPC ini jalur kanonik (useCustomFields pakai eksklusif). Tidak ada perubahan lain. Lint SchemaManagerPage 2→2 (set-state-in-effect pre-existing, net-zero). build clean. | ✅ Complete |

| 2.4A | **CRM Lead Pool — menu + halaman list**. `accounts.account_status='lead_pool'` = arsip lead untuk di-cycle (506 lead hasil import, ter-assign ke sales). RLS aktif (sales lihat assigned_to=dia, manager se-entitas, super semua; UPDATE diizinkan utk owner sales). **(1) `App.jsx`:** menu `{ id:'crm-lead-pool', label:'Lead Pool', icon: Archive }` ditambah di grup CRM (children crm-dashboard) SETELAH `crm-pipeline`; `Archive` sudah ter-import. **TIDAK ditambah ke MENU_KEY_MAP** — mirror pola `crm-calls` (tanpa entry → `canSeeMenuItem` fallback `true` → semua role lihat; RLS yg scope data). Lazy import `LeadPoolPage`; routing block `activeMenu==='crm-lead-pool'` → `<LeadPoolPage showToast={showToast}/>` (ErrorBoundary+Suspense, mirror crm-calls). **(2) `src/modules/crm/LeadPoolPage.jsx` (baru, `({ showToast })`):** list/tabel (bukan kanban krn 500+). Token palette warm-beige `C` (mirror SalesCallsPage), navy #144682 + orange #E85A1E. Header (icon Archive + title + subtitle "Arsip lead untuk digarap ulang · {count} lead"); 2 stat card (Total Lead Pool, Lead Saya = `assigned_to===profile.id`); filter bar (search debounce 300ms atas nama/PIC/kota/telepon + dropdown Source 11 nilai + dropdown Customer Type freight/customs/trading/mixed + Reset); tabel kolom Nama(bold)/PIC/Telepon(mono)/Kota/Type(badge)/Source(badge)/Assigned To/aksi; **pagination client-side PAGE_SIZE 25** (hindari render 500 row langsung). **Query:** `.from('accounts').select('*, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)').eq('account_status','lead_pool').order('name').limit(1000)` — RLS auto-scope, TIDAK ada filter owner manual. **Aksi "Tarik ke Pipeline"** per row → ConfirmModal (variant info) → `.update({ account_status:'prospect', last_activity_at: now }).eq('id', leadId)` → sukses: drop dari list lokal (setRows filter) + toast "ditarik ke pipeline"; error RLS → toast error. Bulk select TIDAK dibuat (per-row saja, per opsi task). Pipeline (account_status='prospect') TIDAK disentuh. **Lint:** LeadPoolPage 2 err (set-state-in-effect: fetch effect + setPage(0) reset — pola baseline sama SalesCallsPage/InquiryListPage); App.jsx 3→3 net-zero. build clean. **Catatan:** kolom `last_activity_at` diasumsikan ada di accounts (dari rename 2.2A). Embed pakai constraint lama `prospects_assigned_to_fkey` (konsisten CRM lain pasca-rename). | ✅ Complete |

| 2.5A | **Customers → accounts migration (kode) — Storbit SP/AR + CRM Inquiry/Quotation pakai `accounts`**. KONTEKS: migrasi DB SELESAI — INDOMARCO ada di `accounts` (owner=SOA/Storbit, account_status=customer, id sama); 5 FK (sp_items, ar_ttfs, inquiries, quotations, accounts.converted_to) sudah di-repoint ke `accounts`; tabel `customers` lama masih ada tapi dipensiunkan (TIDAK dihapus). **BAGIAN A — `db.js` (Storbit SP/AR):** (1) `listCustomers()` `.from('customers')`→`.from('accounts')` + `.eq('account_status','customer')` (SP cuma pilih yg sudah customer); select `*` + `customerFromDb` tidak diubah (accounts superset kolom customers, kolom ekstra lewat sbg custom field). (2) `upsertCustomer()` UPDATE & INSERT `.from('customers')`→`.from('accounts')`; INSERT baru (Storbit create langsung) stamp `account_status='customer'`, `owner_company_id=company_id`, `became_customer_at=now()`. (3) `deleteCustomer()` `.from('customers')`→`.from('accounts')`, soft delete set `deleted_at` saja (HAPUS `active:false` — accounts pakai account_status, bukan flag `active`). (4) **Embeds SP/AR pakai ALIAS** biar mapper TIDAK berubah: sp_items 4× `'*, customers(name)'`→`'*, customers:accounts!sp_items_customer_id_fkey(name)'`; ar_ttfs 3× `'*, customers(name), ar_btbs(*)'`→`'*, customers:accounts!ar_ttfs_customer_id_fkey(name), ar_btbs(*)'`. Alias key tetap `customers` → `spFromDb`/`ttfFromDb` baca `row.customers?.name` tanpa diubah. **BAGIAN B — CRM:** (5) `InquiryFormPage.jsx` dropdown Customer `.from('customers')`→`.from('accounts')`+`.eq('account_status','customer')`; payload: `prospect_id` = pilihan (prospect ATAU customer), `customer_id=null` (konsisten link CRM via prospect_id). (6) Embeds CRM `customer:customers!..._customer_id_fkey`→`customer:accounts!..._customer_id_fkey` (constraint sudah ke accounts, alias `customer:` dipertahankan → konsumen tidak berubah): InquiryListPage L154 (`inquiries_customer_id_fkey`), QuotationListPage L103 + QuotationDetailPage L169 (`quotations_customer_id_fkey`), QuotationFormPage L291 (`inquiries_customer_id_fkey`, embed bersarang). **TIDAK disentuh:** CustomerMasterPage.legacy.jsx & UserManagement.legacy.jsx (dead); tabel `customers` (dipensiunkan, tidak dihapus). **✅ Repo: 0 ref tabel `customers` di file live (hanya .legacy tersisa).** Lint net-zero, build clean. **⚠️ Verifikasi runtime staging:** embed pakai constraint `sp_items_customer_id_fkey`/`ar_ttfs_customer_id_fkey`/`inquiries_customer_id_fkey`/`quotations_customer_id_fkey` — kalau DBA me-rename constraint pasca-repoint, update bagian `!constraint`. Test: SP list tampilkan nama customer dari accounts; create customer dari Storbit → muncul di accounts (account_status=customer, owner_company_id); inquiry dgn sumber Customer → tersimpan di prospect_id. | ✅ Complete |

| 2.6A | **Admin Settings pages (Foundation) — port desain Lovable, UI-only (Supabase belum disambung)**. Handoff Claude Design (`AdminSettingsHub.jsx` + AdminKit). Semua file baru di `src/pages/foundation/admin-settings/`. **Files (6):** (1) `tokens.js` — brand tokens MSI (NAVY #144682/ORANGE #E85A1E/CREAM/…), FONT_*, `ENTITIES` (MSI/JCI/SOA dgn nama PT Nexus yg benar — dikoreksi dari placeholder desain: JCI=PT Jago Custom Indonesia, SOA=PT Stuja Orbit Abadi), `fmtRp`/`fmtNum`. Plain `.js` (Fast-Refresh friendly, pola `bant.js`). (2) `kit.jsx` — shared AdminKit: `Icon` (wrapper **lucide-react**, name→component map, GANTI inline-SVG desain sesuai aturan project), KitStyles, PageHeader, SectionLabel, EntitySwitcher, Tabs, FloatingInput/Select, Toggle, NumberStepper, Segmented, PrimaryBtn/OutlineBtn/SaveButton, Tooltip, SlideOver, Modal, DropZone, UploadBox, useToast, Skel, Card, PillToggle. (3) `AdminSettingsHub.jsx` (`{ onOpen }`) — card grid 2 grup (Konfigurasi Inti 3 card available: Entity/Document/Finance; Roadmap 6 card disabled + tooltip "Segera hadir"). (4) `EntitySettingsPage.jsx` (`{ onHome }`) — EntitySwitcher + 3 tab (Company Profile form+logo+dirty banner, Bank Accounts tabel+slide-over+inline delete confirm, Signatories card grid+modal+upload). (5) `DocumentSettingsPage.jsx` (`{ onHome }`) — 2 tab (Numbering Schemes tabel inline-edit + live preview animasi; Document Templates accordion + auto-resize textarea + per-item save). (6) `FinanceDefaultsPage.jsx` (`{ onHome }`) — 2 kolom: form (Pajak/Mata Uang/Termin: RadioCard, NumberStepper, PillToggle, SearchableSelect incoterm) + sticky LiveSummary kalkulasi PPN exclusive/inclusive + sticky save bar saat dirty. **Semua data DUMMY statis** (no Supabase) — disambung terpisah. **Routing App.jsx (activeMenu-based, app ini TIDAK pakai react-router):** lazy import 4 page; blok render `admin-settings` (hub, `onOpen`→map entity/document/finance ke `admin-settings-entity`/`-documents`/`-finance`) + `admin-settings-entity`/`-documents`/`-finance` (`onHome`→`setActiveMenu('admin-settings')`), semua ErrorBoundary+Suspense (pola crm-calls). Catch-all ComingSoon (Block B) ditambah exclusion `!activeMenu?.startsWith('admin-settings')` (wajib, biar tidak stack "Coming Soon" di atas halaman). **Sidebar/top bar/layout TIDAK diubah** (per ketentuan) — entry point programmatic via `setActiveMenu('admin-settings')`; menu sidebar + permission-gate (Fix B/Fix C) menyusul saat wiring Supabase. **Verifikasi:** `npm run build` clean (4 page + `kit` ter-code-split). Lint: 9 error kategori baseline repo (set-state-in-effect utk animasi Modal/SlideOver + react-refresh `kit.jsx` ekspor hook `useToast` bareng komponen) — sama pola yg sudah ditoleransi di codebase; build tidak terpengaruh. **TODO lanjut:** sambung Supabase (entity_profiles/bank_accounts/signatories/document_numbering/document_templates/finance_defaults), tambah menu sidebar Foundation, gate super_admin/admin. | ✅ Complete |

| 2.6A-verify | **EntitySettingsPage — re-sync vs bundle desain terbaru (Claude Design `iChMot2NQUOrQNCmcDXdJQ`)**. Diminta overwrite `src/pages/foundation/admin-settings/EntitySettingsPage.jsx` dgn desain terbaru. Hasil diff: file bundle **identik secara fungsional** dengan yang sudah di-ship di 2.6A — TIDAK ada perubahan visual/struktur baru. Beda hanya adaptasi yang memang sengaja: (1) import dari `./kit` + `./tokens` + `export default` (bundle pakai global scope + `window.EntitySettingsPage`); (2) nama entitas dikoreksi sesuai CLAUDE.md (JCI=PT Jago Custom Indonesia, SOA=PT Stuja Orbit Abadi) — bundle masih placeholder lama (PT Jaya Cargo Internusa/PT Samudra Optima Abadi), revert = regresi → DIPERTAHANKAN; (3) urutan helper (IconBtn/EmptyState). Kesimpulan: file sudah faithful port dari desain ini → tidak ada churn (overwrite byte-identik = no-op). Tidak ada file lain disentuh (App.jsx/kit.jsx/tokens.js/sidebar). `npm run build` clean. | ✅ Complete |

| 2.6B | **Admin Settings — sidebar entry + DocumentSettingsPage re-sync (bundle `F-6zHXvilkGtJKyHF8eayg`)**. **TASK 1 — sidebar entry (App.jsx):** item Foundation > Admin Settings sebelumnya ber-id `adminSettings` (TIDAK match route `admin-settings` dari 2.6A → klik = ComingSoon). Fix: id `adminSettings`→`admin-settings` (label "Admin Settings", icon `Settings`, `module:'admin'`, `role:['super_admin','admin']`, posisi paling bawah Foundation setelah Schema Manager, di bawah section header "Admin Settings"). Supaya sub-page berfungsi utk role `admin` (bukan cuma super yg auto-allow): tambah `activeMenu?.startsWith('admin-settings-')` (trailing hyphen — hanya sub-page `-entity/-documents/-finance`, BUKAN parent hub) ke **Fix B** (redirect-guard restored menu, ~L1342) + **Fix C** (`canAccessActiveMenu` content gate, ~L1678) — mirror precedent `customer-`/`assets-`/`product-`. Parent `admin-settings` tetap ter-gate via accessibleIds (cuma super_admin/admin yg punya item menu-nya). Tidak ada menu/module lain disentuh. **TASK 2 — DocumentSettingsPage.jsx:** overwrite dgn desain bundle terbaru — **identik fungsional** dgn versi 2.6A (numbering schemes inline-edit + live preview animasi char-by-char; document templates accordion + auto-resize textarea + per-item save). Adaptasi dipertahankan: import dari `./kit` + `./tokens`, `export default`, `<KitStyles/>`; entitas dari `tokens.ENTITIES` (MSI/JCI=PT Jago Custom Indonesia/SOA=PT Stuja Orbit Abadi). Data dummy/statis. `npm run build` clean. | ✅ Complete |

| 2.6C | **Admin Settings — sambung Supabase (EntitySettingsPage + FinanceDefaultsPage).** Data layer only, UI/layout TIDAK diubah; `kit.jsx`/`tokens.js`/`App.jsx`/sidebar tidak disentuh. Import `supabase` dari `../../../lib/supabase`. Const `ENTITY_IDS` (MSI/JCI/SOA → company UUID) di kedua file. **EntitySettingsPage:** (1) **Company Profile** ← `companies` (`SELECT * eq id=ENTITY_IDS[entity] .single()`); mapper `companyToForm`/`formToCompany` (legal_name↔legal, name↔brand, tax_id↔npwp, nib, website, address↔addr1, address_2↔addr2, city, province, postal_code↔postal, country, phone, email, default_currency↔currency, fiscal_year_start↔fiscal [int 1-12 ⇄ nama bulan ID via MONTHS], timezone↔tz); Save = `UPDATE companies SET … eq id`; `pristine` state utk tombol Buang; loading→`ProfileSkeleton`, error→`ErrorState` (komponen baru page-local, pakai Card/OutlineBtn/Icon — bukan ubah kit). (2) **Bank Accounts** ← `entity_bank_accounts` (`eq company_id .order(created_at) .limit(1000)`); `bankToRow`; add=INSERT (is_default = rows.length===0), toggle active=UPDATE is_active, set default=UPDATE is_default=false utk same company_id+currency lalu true utk row ini, delete=DELETE; refetch via `reload` counter tiap mutasi; loading=`ListSkeleton`. **Tombol Edit (pencil) per row tetap no-op** (desain memang no-op; tidak menambah UI edit → patuh "jangan ubah UI"). (3) **Signatories** ← `entity_signatories` (`eq company_id .limit(1000)`); `signerToRow` (document_types↔types, signature_url↔sig, stamp_url↔stamp, is_active↔active); add=INSERT lalu upload aset jika ada, edit=UPDATE, delete=DELETE, toggle active=UPDATE; **upload TTD/stempel** → `supabase.storage.from('assets').upload('signatories/{companyId}/{signerId}-signature.png' | '-stamp.png', blob, {upsert:true})` → `getPublicUrl` → simpan ke `signature_url`/`stamp_url`; helper `uploadSignerAsset` (dataURL→blob via fetch). Logo Company Profile TIDAK dipersist (tak ada kolom di task) → tetap state lokal. **FinanceDefaultsPage:** ← `entity_finance_settings` (`eq company_id .limit(1000).maybeSingle()`; row null = first-time → fallback `FIN_SEED`); mapper `finToForm`/`formToFin` (ppn_rate↔ppnRate, ppn_formula opsi_a/opsi_b↔A/B, pph_rate↔pphRate, tax_mode↔taxMode, supported_currencies↔currencies, rate_input_mode↔rateMode, default_payment_terms↔paymentTerms, quotation_validity_days↔quotationValidity, default_incoterm↔incoterm, rounding_mode↔rounding); Save = `.upsert(payload, { onConflict: 'company_id' })`; `pristine` utk Buang; fake-timer loading diganti fetch-state loading→`FinSkeleton`/error→`ErrorState`. Entity switcher ganti → refetch otomatis (effect dep `[entity, reload]`). **Catatan mapping (sesuai spek task):** `companies.name` di-map ke field "Nama Brand" → Save profil menulis ulang `companies.name` dgn nilai brand (pre-filled dari name, aman jika tak diubah). **Prasyarat DB (staging):** tabel `entity_bank_accounts`, `entity_signatories`, `entity_finance_settings` (unique `company_id` utk upsert) + bucket Storage `assets` + kolom tambahan di `companies` (legal_name/nib/address_2/province/postal_code/country/default_currency/fiscal_year_start/timezone/website/tax_id/phone/email) — jika kolom/tabel belum ada, fetch→ErrorState & save→toast error (graceful). build clean. Lint: 4 err set-state-in-effect (setState('loading') awal fetch — pola baseline SalesCalls/LeadPool) + 1 warn exhaustive-deps `onDirtyChange` (pre-existing). | ✅ Complete |

| 2.6D | **Admin Settings — sambung Supabase (DocumentSettingsPage).** Data layer only, UI/layout TIDAK diubah; `kit.jsx`/`tokens.js`/`App.jsx`/sidebar tidak disentuh. Import `supabase` dari `../../../lib/supabase` + `OutlineBtn` (kit, utk ErrorState retry) + `DANGER` (tokens). Const `ENTITY_IDS` (MSI/JCI/SOA → company UUID). **NumberingTab** ← `document_numbering` (`SELECT * eq company_id .limit(1000)`); mapper `numToRow` (document_type→id [key DOC_META], prefix, suffix, padding_digits→padding, separator, reset_cadence→reset, is_active→active, last_sequence/current_sequence/current_number→lastSeq [display-only], simpan `dbId`=uuid utk WHERE); Edit/Save row = `UPDATE … SET prefix, suffix, padding_digits, separator, reset_cadence, is_active WHERE id=dbId`; toggle active = `UPDATE is_active WHERE id=dbId`; live preview tetap dari form state (tidak ke DB); refetch via `reload` counter tiap save/toggle; loading→`TableSkeleton`, error→`ErrorState`, 0 row→`EmptyState` (icon hash, tanpa CTA — penomoran di-seed admin, tak ada flow "tambah" di desain). `NumberingRow` meta diberi `FALLBACK_META` (guard kalau document_type di luar 6 key DOC_META → tidak crash). **TemplatesTab** ← `document_templates` (`SELECT * eq company_id .limit(1000)`); mapper `tplToData` (header_text→header, footer_text→footer, terms_and_conditions→tc, footnote, logo_position→logoPos, show_stamp→stamp, show_signature→sign, updated_at→saved); accordion tetap render utk SEMUA 6 DOC_META key — type tanpa row DB pakai `BLANK_TPL` (field kosong + "Terakhir disimpan: —") = empty-state per dokumen (tanpa ubah layout); Save per accordion = `.upsert({…}, { onConflict: 'company_id,document_type' })` (header_text/footer_text/terms_and_conditions/footnote/logo_position/show_stamp/show_signature); refetch tiap save; `TemplateAccordion` signature ganti `fireToast`→`onSave` prop (SaveButton `onSave={onSave}`); loading→`TemplatesSkeleton` (baru), error→`ErrorState`. Refetch otomatis saat entity switch (effect dep `[entity, reload]` di kedua tab). Page shell tidak diubah (fake-timer initial + TableSkeleton tetap, tiap tab fetch sendiri). **Prasyarat DB (staging):** tabel `document_numbering` (kolom: company_id, document_type [nilai cocok DOC_META key: SP/Inquiry/Quotation/Invoice/ARTTF/PO], prefix, suffix, padding_digits, separator, reset_cadence, is_active, + sequence col opsional) & `document_templates` (company_id, document_type, header_text, footer_text, terms_and_conditions, footnote, logo_position, show_stamp, show_signature, updated_at; unique `(company_id, document_type)` utk upsert). Jika tabel/kolom belum ada → fetch ErrorState & save toast error (graceful). build clean. Lint: 2 err set-state-in-effect (setState('loading') awal fetch tiap tab — pola baseline SalesCalls/LeadPool/2.6C). | ✅ Complete |

| 2.6E | **Admin Settings — ApprovalWorkflowsPage + NotificationsPage (port desain Lovable, UI-only/dummy).** Bundle Claude Design `59YCY2WgHZcOx5eCywA5oQ`. 2 file baru di `src/pages/foundation/admin-settings/`, import komponen dari `./kit` + token dari `./tokens` (tidak redefine, kit.jsx/tokens.js TIDAK diubah). **ApprovalWorkflowsPage** (`{ onHome }`): EntitySwitcher + 2 tab — (A) Dokumen Bisnis: workflow cards (numbered approval steps + threshold + toggle aktif), filter pills per doc type, SlideOver editor (FloatingInput/Select, reorderable StepEditor, add/remove step), delete confirm inline, empty state; (B) HRGA Request: approver matrix per kategori (accordion, MiniSelect L1/L2/L3 per jenis request, SaveButton per kategori). **NotificationsPage** (`{ onHome }`): EntitySwitcher + 2 tab — (A) In-App: rules grouped (SP/Approval/CRM/HRGA), toggle + edit via Modal (channel cards, recipient pills, template subject/body, role select); (B) Email: layout sama tapi locked overlay "Coming Soon (SMTP)". Semua data dummy/statis (WF_SEED, HRGA_CATS, NOTIF_GROUPS), no Supabase. **Icon handling:** glyph yang TIDAK ada di registry `kit.jsx` Icon di-import langsung dari `lucide-react` (lib yg sama dipakai kit) — `User`, `ArrowUp`, `ArrowDown` (ApprovalWorkflows: badge tipe approver + reorder step), `User`/`Users`/`ExternalLink` (Notifications: recipient badge, CRM group icon via `GroupIcon` helper, link SMTP); `clipboardlist` → pakai `clipboard` (kit alias = ClipboardList, sama). Step-editor Segmented opsi "User" pakai icon `building2` (kit Icon name-based, tak bisa terima komponen) — kompromi minor. Tiap page render `<KitStyles/>` (animasi ak-rise/ak-scroll). **Routing App.jsx:** lazy import 2 page; `AdminSettingsHub onOpen` mapping diperluas (`approval`→`admin-settings-approvals`, `notif`→`admin-settings-notifications`); 2 blok render baru (ErrorBoundary+Suspense, `onHome`→`setActiveMenu('admin-settings')`). Catch-all ComingSoon exclusion `startsWith('admin-settings')` + Fix B/Fix C whitelist `admin-settings-` (dari 2.6B) sudah cover sub-route baru → reachable utk admin. **AdminSettingsHub.jsx:** card `approval` + `notif` dipindah dari grup "Roadmap" ke "Konfigurasi Inti" dgn `status:'available'` (clickable, badge Tersedia); Roadmap tinggal 4 card. Sidebar/top bar/kit/tokens TIDAK disentuh. `npm run build` clean. Lint: sisa baseline set-state-in-effect + exhaustive-deps pada `useEffect(()=>{if(open)setForm(draft)},[open,draft&&draft.id])` (pola desain SlideOver/Modal), unused-var (`Card`, `_isNew`) sudah dibersihkan. **TODO lanjut:** sambung Supabase (approval_workflows + steps, hrga_approval matrix, notification_rules) — saat ini dummy. | ✅ Complete |

| 2.6E-verify | **NotificationsPage — re-sync vs bundle desain terbaru (Claude Design `aN-pS9TFzlLR8y0qshGWHA`)**. Diminta overwrite `NotificationsPage.jsx` dgn desain terbaru. Hasil diff: file bundle **identik secara fungsional** dgn yg sudah di-ship di 2.6E — TIDAK ada perubahan visual/struktur baru. Beda hanya adaptasi yg memang sengaja & wajib dipertahankan: (1) import dari `./kit`+`./tokens` + `export default` (bundle pakai global scope + `window.NotificationsPage`); (2) glyph yg tak ada di kit Icon registry di-import langsung dari `lucide-react` (`User`/`Users`/`ExternalLink`) + helper `GroupIcon` utk icon grup CRM 'users'; (3) `clipboardlist`→`clipboard` (kit alias = ClipboardList); (4) `<KitStyles/>` di-render; (5) cleanup lint `_isNew` (delete pattern) + dep `[value, minH]`. Revert ke bentuk bundle = regresi + build break (global NAVY/Icon bukan import). Kesimpulan: file sudah faithful port dari desain ini → tidak ada churn (overwrite = no-op fungsional). Routing/koneksi (App.jsx admin-settings-notifications, AdminSettingsHub card) tidak disentuh. File lain tidak diubah. `npm run build` clean. | ✅ Complete |

| 2.6F | **Admin Settings — sambung Supabase (ApprovalWorkflowsPage + NotificationsPage).** Data layer only, UI/layout TIDAK diubah; kit.jsx/tokens.js/App.jsx/sidebar tidak disentuh. Import `supabase` dari `../../../lib/supabase` + `ENTITY_IDS` (MSI/JCI/SOA). **ApprovalWorkflowsPage** — **Tab Dokumen Bisnis** ← `approval_workflows` + `approval_workflow_steps`: fetch `select('*, approval_workflow_steps(*)').eq(company_id).order(document_type).limit(1000)`, `wfToUi` (document_type→doc, amount_threshold_min/max→min/max string, steps sort by step_order: approver_type→type, approver_role→role, approver_user_id→user, timeout_hours→timeout, is_required→required); toggle=UPDATE is_active; delete=DELETE (steps cascade); save=INSERT/UPDATE workflow lalu (edit) DELETE steps WHERE workflow_id + INSERT ulang semua steps (step_order=index+1); refetch tiap mutasi; loading→CardsSkeleton, error→ErrorState. **Tab HRGA Request** ← `hrga_request_types` (eq company_id, deleted_at null, order category_code+sort_order) + `hrga_approval_configs` (eq company_id, is_active=true); group by category_code → cats {code,name,types}, rows per type {id,code=type_code,name=type_name,levels=approval_levels,l1/l2/l3 dari configs per level, active}; Simpan Semua per kategori = batch `.upsert(payload, { onConflict: 'request_type_id,level' })` (UNIQUE constraint dikonfirmasi `hrga_approval_configs_type_level_unique (request_type_id, level)`); CategoryAccordion `fireToast` prop → `onSave`; loading→HrgaSkeleton, error→ErrorState, empty→card. **NotificationsPage** — **Tab In-App** ← `notification_rules` (eq company_id, order event_scope+event_type, limit 1000); GROUP_META map event_scope→UI group (DB `general`=Approval; sp/crm/hrga 1:1), EVENT_LABELS map event_type→label ramah (DB tak punya kolom label), `ruleToUi` (event_type→code, recipient_type→recipient, recipient_role→role, template_subject/body→subject/body, is_active→active); NCodeBadge pakai `rule.code`/`form.code` (bukan id uuid); toggle=UPDATE is_active; save edit=UPDATE channel/recipient_type/recipient_role/recipient_user_id(null)/template_subject/template_body/is_active; add=INSERT (event_type=code, event_scope=scopeOf(group)); refetch tiap mutasi. **Tab Email** tetap "Coming Soon" overlay (tanpa DB). Kedua page: refetch saat ganti entitas (effect dep `[entity, reload]`); page-shell fake-timer lama diganti fetch-state (Approval shell tetap pakai timer + per-tab fetch — mirror 2.6C; Notifications shell full fetch-state). **Catatan mapping:** approval step `approver_user_id` (uuid) di-isi dari text field UI "Cari User" apa adanya — kalau user ketik non-uuid & simpan step type=user → INSERT error (graceful toast), realistis pakai type=role; user-picker asli = future. HRGA row `active` toggle disimpan ke configs `is_active` saat Simpan Semua; fetch filter is_active=true → toggle-off tidak round-trip terlihat (limitation kecil, sesuai spek fetch). **Prasyarat DB (staging):** tabel `approval_workflows`, `approval_workflow_steps` (FK workflow_id ON DELETE CASCADE), `notification_rules`; `hrga_request_types`+`hrga_approval_configs` sudah ada (migration 020). Kalau tabel belum ada → fetch ErrorState & mutasi toast error (graceful). build clean. Lint: sisa baseline set-state-in-effect (setState('loading') awal fetch + SlideOver/Modal form-sync) + exhaustive-deps — sama pola repo, 0 unused-var/no-undef baru. | ✅ Complete |

| 2.7A | **Pindah Asset Management dari grup "Inventory & Asset" ke grup "Service Management" (App.jsx, menu only).** (1) Grup `Inventory & Asset` → rename label jadi **`Inventory`** (+ comment header); section `Asset Management` + item `assets` (beserta semua children `assets-*`) DIHAPUS dari grup ini → grup Inventory kini hanya berisi Inventory / Warehouse. (2) Grup `Service Management`: tambah `{ section: 'Asset Management' }` + item `assets` PERSIS SAMA (id `assets` + 17 children `assets-*` identik) SETELAH item `it` (IT Service Mgmt). (3) `MENU_KEY_MAP`: `'assets': 'inv_asset'` → `'assets': 'service_asset'`. (4) Semua id `assets-*` TIDAK berubah; routing/logic assets (AssetShell render block, `navigateToAssetDetail`, group-lookup di ~L1220 yg cari grup berisi `assets` secara dinamis) TIDAK disentuh → auto-adapt ke grup Service Management. (5) Cek `inv_asset`: hanya 1 ref (MENU_KEY_MAP) → 0 tersisa. **App Launcher (point 4):** AppLauncher pakai `moduleGroups = ERP_MENU_GROUPS`, jadi rename label 'Inventory' + Asset Management masuk children Service Management OTOMATIS ter-refleksi (label grup & drill-in dari ERP_MENU_GROUPS). **⚠️ Side effect (TIDAK di-fix — `AppLauncher.jsx` di luar scope "hanya App.jsx"):** `AppLauncher.jsx` punya 3 map yg di-key by label literal `'Inventory & Asset'` — `MODULE_CFG` (icon Package/warna #D97706/desc), `LAUNCHER_MODULE_MAP` ('inventory' utk gating), `GRID_POS` (col2/row2). Karena label grup kini 'Inventory', ketiga lookup miss → card launcher "Inventory" fallback ke default (icon Database, warna abu #6B7280, tanpa grid-pos tetap, gating fallback). Bukan crash (spread `{...undefined}` no-op). **Follow-up disarankan (1 file, 3 key):** di `AppLauncher.jsx` rename key `'Inventory & Asset'`→`'Inventory'` di MODULE_CFG + LAUNCHER_MODULE_MAP + GRID_POS. Service Management card tidak berubah (label sama). build clean. Tidak ada file lain diubah. | ✅ Complete |

| 2.7A-fix | **AppLauncher.jsx — rename key `'Inventory & Asset'` → `'Inventory'` (follow-up 2.7A side effect).** Tiga map yg di-key by label grup: `MODULE_CFG` (L21, Icon Package/warna #D97706/desc), `LAUNCHER_MODULE_MAP` (L179, → 'inventory' gating), `GRID_POS` (L194, col2/row2). Setelah grup ERP_MENU_GROUPS di-rename ke 'Inventory' (2.7A), ketiga lookup `group.label` cocok lagi → card launcher "Inventory" balik pakai icon/warna/grid-pos/gating yg benar (bukan fallback abu Database). Hanya key string yg diubah (3 occurrence, value/whitespace lain tidak disentuh). 0 ref `'Inventory & Asset'` tersisa. build clean. Tidak ada file lain diubah. | ✅ Complete |

| 2.7B | **AssetDashboardPage — wire ke Supabase (hapus semua dummy).** Hanya `src/modules/assets/pages/AssetDashboardPage.jsx` diubah (useAssets.js/AssetShell/App.jsx/sidebar TIDAK disentuh). Import `supabase` dari `../../../lib/supabase` + react hooks. **`fetchDashboardStats()`** (module-scope, async): `Promise.all([asset_categories select id,code (deleted_at null, limit 1000); assets select category_id,company_id,status,purchase_price (deleted_at null, limit 5000)])` → agregasi client-side (13–422 row, ringan). Const `COMPANIES` (3 id→{key,label,sub,color}: MSI/JCI/SOA; 'soa' ditambah ke `CoBadge` cfg reuse warna sbi) + `CATS` (VEH/IT-EQP/FURN/BLDG → label/warna/icon). **Data nyata:** Row1 stat (count per kategori VEH/IT-EQP/FURN/BLDG), Row2 (active/in_repair/disposed + Dokumen Expired=0 hardcoded krn `asset_documents` belum ada, delta "Modul dokumen belum aktif"; Dalam Maintenance delta "0 work order aktif"), Total Nilai (SUM purchase_price + breakdown per kategori %+amount), Nilai per Company (SUM+count group company_id, bar relatif ke max), Donut Aset per Kategori (count per code, conic-gradient dinamis), CompanyValueChart (Miliar per company). Helper format `fmtShortRp` (M/Jt) + `fmtBigRp` (Miliar/Juta) lokal (tak ada shared util di module). **Komponen UI dipertahankan:** Card/CardHead/StatCard/CoBadge/Badge/Btn; `DonutChart`+`CompanyValueChart` di-parameterize (terima props, bukan const internal). **Loading** → `DashboardSkeleton` (grey block sesuai tema warm); **Error** → card + tombol "Coba Lagi" (retry `load()`). **Empty state "Fitur segera hadir":** Timeline Expiry Dokumen + tabel Dokumen Akan Expired (krn `asset_documents` belum ada) — `ExpiryBarsChart`/`EXPIRY_ROWS`/`URGENCY_LABEL` dummy dihapus. Header subtitle fake-timestamp "Per 2 Juni 2026" → "semua entitas"; tombol header (Periode/Export/Tambah Aset) tetap (UI statis). build clean. Lint: 1 error baseline `set-state-in-effect` (`load()` set state saat dipanggil di effect — pola sama semua fetch page repo). | ✅ Complete |

| 2.7B-fix | **Hapus badge angka hardcoded di ERP_MENU_GROUPS (App.jsx).** Audit semua `badge:` di ERP_MENU_GROUPS → 5 occurrence. Dihapus 4 badge angka statis (dummy, tak terhubung DB): `assets-it` `badge: '128'`, `assets-workorders` `badge: '6'`, `assets-expiring` `badge: '9'`, `assets-expired` `badge: '4'`. Dipertahankan: `hrga-pending-approval` `badge: ''` (string kosong, untuk dynamic count nanti). Hanya property `badge` yg dihapus (rest baris item tidak diubah). Tidak ada file lain disentuh. build clean. **Catatan:** badge sidebar kini bersih dari angka palsu; kalau mau badge dinamis (mis. count Work Orders / Akan Expired) → isi via data DB nanti, bukan hardcode. | ✅ Complete |

| 2.7C | **AddAssetPage — multi-step wizard "Tambah Aset" (port desain Lovable, dummy/no-backend).** Bundle Claude Design `zwMmOq7LtHxKnfq5wIp8gQ` (file: AddAssetData.jsx + AddAssetPage.jsx). 2 file baru di assets module + 2 file di-wire; TIDAK menyentuh App.jsx/sidebar/file di luar `src/modules/assets/`. **Files:** (1) `src/modules/assets/AddAssetData.js` — schema per-kategori (AA_CATS: IT-EQP/VEH/FURN/BLDG → steps/sections/fields; AA_VEH_DOCS; AA_STATUS_TONE), pure data `.js` (Fast-Refresh friendly). (2) `src/modules/assets/pages/AddAssetPage.jsx` (`{ categoryCode, onBack, onSuccess }`) — wizard schema-driven: stepper, collapsible section cards, field renderers (text/mono/select/date/money[Rp live-group]/int·dec[hover ±spinner]/slider/radio-pills/textarea/toggle), conditional sections via `showIf(form)` (IT: Display hidden utk Server/Network/Storage, Battery hanya Laptop), per-step required-validation, VEH docs step (upload locked "Segera Hadir", expiry editable), Review step (ringkasan + Edit→jump), Save button simulate ~1.5s → `onSuccess()`, unsaved-changes guard. **Self-contained** (per ketentuan "hanya src/modules/assets/"): token brand lokal (NAVY #144682 dst.), `Icon` wrapper **lucide-react** (34 nama dimap, ganti inline-SVG desain & AdminKit Icon — desain aslinya "shares AdminKit scope", TIDAK di-import supaya tak coupling ke `src/pages/foundation/admin-settings/`), `Toggle` lokal, `AAStyles` (keyframes aa-fade/aa-prog + ak-spin/ak-pop sendiri, tak butuh AdminKit KitStyles). **Integrasi (`AssetShell.jsx`):** state lokal `addCategory`; `renderPage` kirim `onAddAsset={() => setAddCategory(categoryCode)}` ke AssetITPage; saat `addCategory` set → render `<AddAssetPage categoryCode onBack={()=>setAddCategory(null)} onSuccess={()=>setAddCategory(null)}>` (overlay, di atas list); `useEffect([activePage])` reset overlay saat sidebar pindah; onSuccess balik ke list → AssetITPage remount → `useITAssets` refetch (refresh). **`AssetITPage.jsx`:** prop `onAddAsset`, tombol "+ Tambah Aset" `onClick={onAddAsset}` → buka wizard dgn categoryCode list aktif (IT-EQP/VEH/FURN/BLDG sesuai `PAGE_CATEGORY`). **Catatan:** styling inline-style (konsisten modul assets & desain) — bukan Tailwind; "Tailwind CSS only" di brief bertentangan dgn modul (inline) & medium desain (inline AdminKit) → pilih inline demi faithful + konsistensi (di-flag). Tombol "Tambah Aset" di AssetDashboardPage header (generic, tanpa kategori) TIDAK di-wire (di luar scope list-page). Data dummy; save belum ke Supabase. build clean. Lint: 2 baseline set-state-in-effect (reset-on-prop effect di AssetShell + AddAssetPage) — pola repo; unused-var/nested-component sudah dibersihkan. | ✅ Complete |

| 2.7C-verify | **AddAssetPage — re-sync vs bundle desain terbaru (Claude Design `emnmMHnbi26rFmsTApkQSw`)**. Diminta overwrite `AddAssetPage.jsx` dgn desain terbaru. Hasil `diff` bundle baru vs bundle 2.7C (`zwMmOq7LtHxKnfq5wIp8gQ`): **byte-identik** (AddAssetPage.jsx & AddAssetData.jsx EXIT=0, 0 perubahan). File `src/modules/assets/pages/AddAssetPage.jsx` yg sudah di-ship 2.7C = faithful module-port dari desain ini. Beda hanya adaptasi wajib (self-contained: token lokal, `Icon` lucide-react, `Toggle` lokal, `AAStyles`, `export default`, import `../AddAssetData`, hoist `AASpinBtn`, drop unused `field`) — revert ke bentuk bundle (global scope + AdminKit `NAVY`/`Icon`/`Toggle` + `window.AddAssetPage`) = build break + langgar "self-contained, jangan import admin-settings kit". Kesimpulan: tidak ada churn (overwrite = no-op fungsional). AssetShell integrasi (addCategory/onAddAsset/onBack/onSuccess) + AddAssetData.js + props `{ categoryCode, onBack, onSuccess }` tidak disentuh. `npm run build` clean. | ✅ Complete |

| 2.8A | **MyProfilePage — "Profil Saya" full-page overlay (port desain Lovable + sambung Supabase).** Bundle Claude Design `gWZiEYDrGZ-RDsbGROrFug` (orchestrator MyProfilePage.jsx + app/{icon,data,ui,tab-profil,tab-keamanan,tab-notifikasi,tab-preferensi}.jsx — desain Tailwind-CDN dgn theme token custom navy/cream/line/surface yg TIDAK ada di tailwind.config app). **File baru `src/pages/profile/MyProfilePage.jsx`** (`{ onClose }`) — **self-contained inline-style** (token brand lokal, `Icon` lucide-react 39 nama, primitives lokal: Card/SectionHeader/Btn/Field[floating-label JS]/TextArea/RadioPills/Toggle/Badge/Select/PasswordInput/ConfirmModal/DirtyBar/Toast/TabBar/Skeleton/ErrorState; tak import admin-settings kit). 4 tab: **Profil** (IdentityCard sticky + AvatarUpload + form Informasi Pribadi + Kontak Darurat + DirtyBar), **Keamanan** (ChangePassword + 2FA "Segera Hadir" overlay + Sesi Aktif), **Notifikasi** (toggle grouped SP/Approval/CRM/HRGA), **Preferensi** (Bahasa/Timezone/Format/Landing/Sidebar/Density). Loading→Skeleton, error→ErrorState+retry. **Supabase:** `loadProfile()` = `auth.getUser()` (email, last_sign_in_at) + `profiles.select('*').maybeSingle()` + `user_roles.select('roles(name)')` + `companies.name`; fallback aman semua field (`|| ''`). Save Profil = `UPDATE profiles SET full_name/job_title/employee_id/phone/date_of_birth/gender/bio/address/emergency_contact_* WHERE id`; Avatar = `storage.from('avatars').upload('${uid}/avatar.${ext}', {upsert:true})` → getPublicUrl → `profiles.avatar_url`; Password = `auth.updateUser({ password })`; Notifikasi save = `profiles.notification_preferences` (JSONB); Preferensi save = `profiles.display_preferences` (JSONB); "Keluar Semua Sesi" = `auth.signOut({ scope:'global' })`. Error → toast (graceful). **App.jsx wiring** (hanya tambah, tak ubah routing): lazy import `MyProfilePage`; state `showProfile`; dropdown topbar "My Profile" action → `setShowProfile(true)`; overlay full-page `position:fixed inset:0 z-index:9999` (ErrorBoundary+Suspense) render setelah `</header>`, `onClose`→`setShowProfile(false)`. Sidebar/routing/modul lain TIDAK disentuh. **Keputusan:** (1) styling inline (bukan Tailwind) krn theme token desain tak ada di config + konsisten approach modul lain; (2) tab Notifikasi simpan ke `profiles.notification_preferences` (personal override) — TIDAK mutate `notification_rules.is_active` global (semantik "My Profile" = personal, hindari user non-admin flip rule global); fetch notification_rules tidak dilakukan, pakai grup statis (10 event) seed dari prefs. **Prasyarat DB (staging, perlu approval kalau belum ada):** kolom `profiles`: phone, bio, job_title, employee_id, date_of_birth, gender, address, emergency_contact_name, emergency_contact_phone, mfa_required, `notification_preferences jsonb`, `display_preferences jsonb` (+ opsional last_login_at); bucket Storage `avatars` (public). Tanpa kolom → fetch tetap jalan (select * + fallback), tapi Save → toast error (graceful). build clean. Lint: 1 baseline set-state-in-effect (load() fetch); App.jsx net-zero. | ✅ Complete |

| 2.8B | **Fix E — form state hilang saat switch antar browser tab (Auth lifecycle, lanjutan 2.3D/E/F).** Akar masalah (diaudit): Supabase `@supabase/auth-js` v2.105.4 me-**re-emit `'SIGNED_IN'`** setiap tab kembali visible (internal `visibilitychange` listener + `_recoverAndRefresh` di GoTrueClient + cross-tab `BroadcastChannel` yg mem-broadcast event ke tab lain). `AuthContext.onAuthStateChange` menangani `'SIGNED_IN'` dgn `setLoading(true)` (Fix 2.3E) → `AuthGate` (gate `if(loading) return <LoadingScreen>`) meng-**unmount `<App/>`** → semua form state (useState lokal: AddVisitModal/AddAssetPage wizard/Inquiry/Quotation/MyProfile) hilang. Tidak ada listener visibility buatan sendiri di kode (dipastikan grep nihil) — pemicu murni dari library + jalur `SIGNED_IN→setLoading→AuthGate`. **Fix (Opsi A, HANYA `src/contexts/AuthContext.jsx`; AuthGate.jsx TIDAK disentuh):** (1) import `useRef`; `previousUserIdRef = useRef(null)` track user id terakhir. (2) getSession path: set `previousUserIdRef.current = s.user.id` (atau `null` jika no session). (3) `onAuthStateChange` di-restrukturisasi jadi 3 cabang: **(a) no session** (`newUserId` null — SIGNED_OUT/expired) → ref=null, setSession(s), clear profile/erpRoles; **(b) same-user re-emit** (`newUserId === previousUserIdRef.current` — refocus/token refresh/broadcast) → SKIP `setLoading(true)` + SKIP re-fetch profile (cegah unmount); hanya `setSession(prev => prev?.access_token === s?.access_token ? prev : s)` — swap referensi session HANYA bila access_token berubah (token refresh valid tetap ter-update; hindari re-run `useEffect([session])`→`fetchMenuPermissions` berlebih saat TOKEN_REFRESHED tanpa ganti token); **(c) genuine user change** (first sign-in atau user B ganti user A — `newUserId !== ref`) → set ref, setSession(s), `if(event==='SIGNED_IN') setLoading(true)` lalu fetch profile + `setLoading(false)` (Fix 2.3E TETAP utuh). **Mental test (semua ✓):** fresh load (getSession set ref → INITIAL_SESSION same-user skip), login pertama (ref null → genuine → setLoading), tab refocus 1 tab & 2 tab (same-user → no remount, form utuh — FIXED), token refresh (same-user, token berubah → setSession, no remount, token fresh), logout (no-session → clear, Login screen), user switch A→logout→B (genuine → re-gate). **Tidak ada file lain diubah.** Lint AuthContext 2→2 (2 set-state-in-effect pre-existing di fetchPermissionsForRoleId & fetchMenuPermissions effect — net-zero, 0 error baru). build clean. | ✅ Complete |

| 2.8C | **CRM Prospect/Pipeline — fix visibility super-admin/manager/sales + tampilkan Assigned To + auto-assign sales.** Audit menemukan: (a) `ProspectListPage.jsx` & `PipelineKanbanPage.jsx` keduanya hardcode `.eq('company_id', profile.company_id)` utk SEMUA role → super_admin/admin tidak bisa lihat prospect lintas-entitas (gejala "KOSONG" saat company_id Den ≠ company_id prospect); RLS pada `accounts` sendiri SUDAH benar (terbukti `LeadPoolPage` fetch tanpa company filter & ter-scope per role — super semua, manager se-entitas, sales assigned) → **root cause = frontend filter, BUKAN RLS**. (b) Kolom Assigned To list tampil `|| '—'` (NULL tak terbedakan). (c) Tak ada auto-assign saat sales create → prospect bisa NULL (mis. Pelangi dibuat Martin/manager, form assigned_to kosong → NULL). **FIX 1 (role-aware scope, mirror pola `CRMDashboard` isSalesOnly):** kedua page tambah `isAllEntities=['super_admin','admin']` + `isSalesOnly=['sales','operations']`; query: `if(!isAllEntities) .eq('company_id',…)`, `if(isSalesOnly) .or('assigned_to.eq.{id},created_by.eq.{id}')`; guard `if(!profile?.id) return; if(!isAllEntities && !profile?.company_id) return;`; deps useCallback tambah `profile?.id, isAllEntities, isSalesOnly`. Hasil: super_admin/admin lihat SEMUA entitas, manager/ceo/gm se-entitas, sales hanya milik sendiri. **FIX 2 (Assigned To):** ProspectList cell → nama PIC atau badge pill "Belum di-assign" (C.accentSoft/C.accent oranye); Pipeline tambah `assigned: p.assigned_profile?.full_name||null` ke deal mapping + render di DealCard (baris user-icon, oranye "Belum di-assign" jika null) & ListRow (sub-baris bawah nama); ICONS tambah glyph `user`. Detail modal Pipeline sudah tampil Assigned To (tidak diubah). **FIX 3 (auto-assign):** ProspectFormPage `isSalesCreator=['sales','operations']`; handleSave `effectiveAssignedTo = (!isEdit && isSalesCreator) ? profile.id : (form.assigned_to||null)`; field "Assigned To" → sales-on-create lihat info box "Otomatis di-assign ke Anda — {nama}" (dropdown disembunyikan), manager/admin/super lihat dropdown + warning "⚠ Prospect belum di-assign ke sales" saat kosong. **TIDAK** memperbaiki data NULL existing (Pelangi) via kode (di-assign manual via UI oleh user). **CRMDashboard tidak diubah** (NULL attribution 3-vs-4 = perilaku benar: prospect tanpa assigned_to tak bisa di-attribute; sembuh setelah Pelangi di-assign). **RLS accounts tidak diubah** (audit: sudah benar; SQL verifikasi disediakan ke user, tak dijalankan). FK embed tetap `prospects_assigned_to_fkey` (constraint lama, tidak ikut rename — konsisten LeadPool). Lint net-zero per file (ProspectList 4→4, Pipeline 5→5, ProspectForm 3→3 — semua baseline set-state-in-effect/unused-directive). build clean. | ✅ Complete |

| 2.8D | **Fix Edit Prospect — dropdown Assigned To kosong padahal sudah ter-assign (ProspectFormPage.jsx, file ini saja).** Audit menemukan DUA penyebab: (1) **`assigned_to` UUID tidak ikut ke form** — `ProspectListPage` select (post-2.8C) hanya ambil `assigned_profile:...(full_name)`, TANPA kolom `assigned_to`; saat row di-klik → `onEditProspect(p)` → `prospect.assigned_to` = `undefined` → `form.assigned_to = '' ` (big setForm effect L167 `prospect.assigned_to || ''`) → dropdown "— Pilih sales —". (Dari Pipeline UUID ada, jadi hanya bug saat buka dari list.) (2) **Opsi dropdown company-scoped** — list sales di-fetch `.eq('company_id', profile.company_id).eq('active', true)`; assignee bisa lintas-entitas (super_admin/admin lihat prospect entitas lain via 2.8C) atau non-aktif → value UUID tak match `<option>` mana pun → kosong. **Bahaya tambahan:** sebelum fix, buka-edit-dari-list lalu Save → `effectiveAssignedTo = form.assigned_to || null = null` (handleSave 2.8C) → **assignee ke-WIPE diam-diam**. Fix mencegah ini. **FIX (ProspectFormPage.jsx only):** (a) import `useMemo`; (b) state `fetchedAssignee` (di-set HANYA di async callback → tidak nambah `set-state-in-effect`); (c) effect edit-mode: jika `isEdit && prospect?.id && !prospect.assigned_to` → fetch `accounts.select('assigned_to, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)').eq('id').maybeSingle()` → `setForm(f => f.assigned_to ? f : {...f, assigned_to: data.assigned_to})` (guard anti-clobber pilihan user saat fetch in-flight) + `setFetchedAssignee({id, full_name})`; cleanup `cancelled` flag; (d) `assigneeOptions = useMemo`: `profiles` + opsi sintetis utk `form.assigned_to` saat tidak ada di `profiles` (nama dari `prospect.assigned_profile.full_name` [Pipeline] / `fetchedAssignee.full_name` [list] / fallback 'Sales ter-assign'); keyed ke `form.assigned_to` → tak ada stale option; (e) dropdown render `assigneeOptions.map` (ganti `profiles.map`). **FIX 3 (auto-assign create sales) TIDAK tersentuh:** effect fetch di-guard `isEdit`; render info-box tetap di cabang `!isEdit && isSalesCreator`; edit selalu masuk cabang dropdown. handleSave edit kini pakai `form.assigned_to` yg sudah benar (preserve assignee). **File lain tidak diubah** (assigned_to sengaja TIDAK ditambah ke ProspectListPage select — di luar scope "jangan ubah file lain"; di-resolve via fetch di form). Lint ProspectFormPage 3→3 (net-zero, baseline set-state-in-effect + unused-directive). build clean. | ✅ Complete |

| 2.8E | **QuotationFormPage.jsx — perluas `UNIT_LABELS` (line ~63).** Array opsi unit label item quotation diperluas dari 8 → 13 nilai: `Per CBM, Per KG, Per Ton, Per 20Ft, Per 40Ft, Per Container, Per BL, Per Shipment, Per Trip, Per Day, Per Document, Per Receipt, Lumpsum` (tambah CBM/KG/Ton/Shipment/Trip; urutan ditata ulang). **Default `unit_label: 'Per 20Ft'` di `freshRow` TIDAK diubah** (tetap, dan masih ada di array). Fallback `row.unit_label || 'Per 20Ft'` saat fetch (L342) tidak disentuh. Hanya 1 array konstanta diubah; tidak ada perubahan lain. build clean. | ✅ Complete |

| 2.8F | **Pipeline Kanban — soft stage gating (PROPOSAL butuh Inquiry, WON butuh Quotation).** `PipelineKanbanPage.jsx` saja. Soft gate = konfirmasi, BUKAN blok keras (user selalu bisa lanjut). Import `ConfirmModal` (`../../components/ConfirmModal`). State baru `stageGate {open, stageId, id, type, prospectName}`. **Refactor `handleDropStage`:** logika perpindahan diekstrak ke `applyStageMove(stageId, id, prospect)` (useCallback, deps `[profile?.id, showToast]`) — berisi VERBATIM flow lama: WON/LOST → optimistic move + buka `WinLossModal`; stage lain → optimistic update + DB update + rollback on error. `handleDropStage` (deps `[prospects, applyStageMove]`) sekarang: clear dragging+dropStage, guard no-prospect/same-stage, lalu **gating SEBELUM optimistic/sebelum WinLossModal**: jika `newStage==='PROPOSAL'` → `inquiries` `.select('id',{count:'exact',head:true}).eq('prospect_id',id)`; jika `count` 0 → `setStageGate({type:'proposal'})` + return (tahan). Jika `newStage==='WON'` → cek `quotations` sama; `count` 0 → `setStageGate({type:'won'})` + return. Selain itu (atau count>0) → `applyStageMove` langsung. **`handleStageGateConfirm`** ("Ya, Lanjut"/"Ya, Tandai WON") → tutup gate + `applyStageMove` (PROPOSAL: update biasa; WON: lanjut buka WinLossModal seperti biasa). **`handleStageGateCancel`** ("Batal") → tutup gate; card tetap di stage semula (belum ada optimistic update → tak perlu rollback). **Render `ConfirmModal`** variant warning setelah WinLossModal: judul/pesan/confirmLabel kondisional per `stageGate.type` (won: "Belum Ada Quotation" / "…Tetap tandai sebagai WON?" / "Ya, Tandai WON"; proposal: "Belum Ada Inquiry" / "…Tetap lanjut ke Proposal?" / "Ya, Lanjut"). **Tidak merusak:** WinLossModal flow (WON/LOST reason) utuh; optimistic+rollback utuh (pindah ke applyStageMove); LOST & stage lain tak di-gate. Catatan: jika query count error/RLS (count undefined) → gate tetap muncul (soft, aman). Lint 5→5 (net-zero, semua baseline pre-existing: setDetailDeal no-undef, memoization-skip, set-state-in-effect, `_` unused/empty-block di drag handler — none di kode baru). build clean. | ✅ Complete |

| 2.8G | **CRMDashboard — WON count/Win Rate/Sales Performance ikut hitung deal yang sudah auto-convert jadi customer (Cara 1).** `CRMDashboardPage.jsx` saja. Bug: saat prospect digeser WON, PipelineKanban auto-set `account_status='customer'` + `became_customer_at` → account keluar dari semua query dashboard yg filter `.eq('account_status','prospect')` → WON=0, Win Rate=0%, Sales Perf WON=0 (mis. Indochem/Ayumurni). **Fix:** (1) **Query baru** di `Promise.all` (`wonCustomersRes`, di-wrap `ownProspects` → role+company scope sama spt query prospect): `.from('accounts').select('id, pipeline_stage, assigned_to, created_at, account_status, became_customer_at, profiles!prospects_assigned_to_fkey(full_name)').eq('company_id',cid).eq('account_status','customer').eq('pipeline_stage','WON').not('became_customer_at','is',null).is('deleted_at',null).limit(1000)` — isolasi customer HASIL konversi WON (bukan customer input manual). (2) **wonCount/winRate**: `wonCustomers = wonCustomersRes.data||[]`; `wonProspects` = prospect aktif stage WON (tetap dihitung, walau jarang); `wonCount = wonProspects + wonCustomers.length`; `totalDeals = totalProspects + wonCustomers.length`; `winRate = totalDeals>0 ? round(wonCount/totalDeals*100) : 0`. **`totalProspects` card TIDAK diubah** (tetap `prospects.length` = prospect aktif saja). (3) **Sales Performance**: `salesMap` tambah field `wonCust`; loop `wonCustomers` → `salesMap[id].won++` + `wonCust++` (assigned_to→profiles.full_name dari join); output `convRate = deals>0 ? round(won/deals*100) : 0` dgn `deals = prospek + wonCust` (samakan definisi dgn win rate global); output object eksplisit `{name,prospek,won,convRate}` (tak spread `wonCust` keluar). **TIDAK diubah:** Stage breakdown (Pipeline by Stage), Lead source, Prospect trend, recentActivity, S2 personal KPI, visits — semua tetap basis prospect aktif. Graceful: `wonCustomersRes` tidak di-`throw` (hanya `prospectsRes` yg throw); error → `.data||[]` → 0. Lint 7→7 (net-zero, baseline). build clean. | ✅ Complete |

| 2.8H | **CRMDashboard — fix chart kosong (Prospect Trend + bar chart) karena `useWidth` race.** `CRMDashboardPage.jsx` saja, hook `useWidth` (~L132). Bug: hook lama pakai `useRef` + `useEffect([])` → effect jalan sekali di first render saat container chart masih conditional (`!isEmpty`/belum ada data) → `ref.current` null → `return` tanpa observe; ketika data datang & div muncul, effect TIDAK jalan lagi (deps `[]`) → ResizeObserver tak terpasang → `w` tetap 0 → chart di-skip oleh guard `areaW > 0` (hanya legend tampil). **Fix:** ganti ke **callback ref** — `const ref = useCallback((node) => {...}, [])`: disconnect observer lama (`roRef`), jika `node` null (unmount) return, else `setW(node.clientWidth)` + pasang `ResizeObserver(update)` + simpan di `roRef`. Callback ref dipanggil React tiap elemen mount/unmount → pengukuran selalu terjadi saat div benar-benar ada (termasuk muncul belakangan pasca data-load). Return signature TETAP `[ref, w]` → call sites `PipelineTrend` (L309) & bar chart (L383) `const [areaRef, areaW] = useWidth()` + `<div ref={areaRef}>` tidak diubah (callback ref kompatibel dgn prop `ref`). ResizeObserver tetap utk responsif resize. `useRef`/`useCallback` sudah ter-import; `useRef` masih dipakai di tempat lain (L1328) → import tak berubah. Verifikasi mental: data load → div muncul → callback ref → width>0 → chart render; resize → observer → width update; unmount → disconnect (no leak). Lint 7→7 (net-zero baseline). build clean. | ✅ Complete |

| 2.8I | **CRMDashboard — polish visual chart (styling only, data/perhitungan TIDAK disentuh).** `CRMDashboardPage.jsx` saja. **(1) PipelineTrend (AreaChart) garis "Bulan Ini" jadi gradient horizontal:** `<defs>` tambah `<linearGradient id="lineGradIni" x1=0 y1=0 x2=1 y2=0>` (kiri→kanan) stops `#7C3AED`(0%)→`#D946A6`(35%)→`#3B82F6`(70%)→`#60A5FA`(100%); `<Area dataKey="bulanIni">` `stroke="url(#lineGradIni)"`, dot `#8B5CF6`; fill `areaIni` diselaraskan jadi ungu `#8B5CF6` opacity 0.18→0.02 (sebelumnya NAVY). **(2) Garis "Bulan Lalu" jadi abu netral:** stroke+dot `ORANGE`→`#CBD5E1` (tetap `strokeDasharray="6 5"`); fill `areaLalu` jadi abu `#CBD5E1` opacity 0.08→0.01 (sebelumnya ORANGE). Legend swatch + tooltip `AreaTip` swatch (dot Bulan Ini→`#8B5CF6`, Bulan Lalu→`#CBD5E1`) diselaraskan (warna TEKS tidak diubah). **(3) Pie Lead Source — fix crop + pastel:** crop bawah diperbaiki dgn beri ruang vertikal: `D.donutWrap` height 150→160, `PieChart height` 150→160, `Pie cy` 75→80, `outerRadius` 72→70, `innerRadius` 48→46 (donut UTUH, margin atas/bawah ~10px simetris); `SOURCE_PALETTE` (HANYA dipakai pie ini, terverifikasi 1 konsumen) diganti palet pastel `#8B7DD8`/`#E89BC4`/`#7FB5E6`/`#A8C5E0`/`#C9B8E0` (cycle `i % len`); legend pie pakai `s.color` → ikut pastel, teks/angka tidak diubah. **TIDAK disentuh:** bar "Pipeline by Stage" (tetap `url(#navyBar)`/won-hijau/lost-merah — `NAVY`/`ORANGE` masih dipakai di sana, tidak di-rename), `LeadsBySource`, chart lain, semua query/agregasi. Lint 7→7 (net-zero baseline). build clean. | ✅ Complete |
| 2.8J | **Fix quotation duplikat — ROOT CAUSE: RLS policy DELETE hilang di `quotation_items` (DB/RLS, bukan kode).** QuotationFormPage edit pakai pola delete-then-insert (`.from('quotation_items').delete().eq('quotation_id', …)` lalu `.insert`); TANPA policy `FOR DELETE`, `.delete()` "sukses" **0-row tanpa error** (RLS filter senyap) → item lama tak terhapus → insert numpuk → item & total DOBEL. **Solusi:** `CREATE POLICY quotation_items_delete ON quotation_items FOR DELETE …` (scope company, samakan pola INSERT/UPDATE existing). Kode QuotationFormPage TIDAK diubah (pola delete-then-insert sudah benar — yang kurang policy DB-nya). **Pelajaran:** RLS-missing-DELETE = silent 0-row, tak terdeteksi `error`-check; verifikasi via `count` atau pastikan CRUD policy lengkap. Lihat juga **Roadmap → audit DELETE policy SEMUA tabel**. | ✅ Complete |
| 2.8K | **Data cleanup sesi 15 Jun (DB, bukan kode).** (1) **Indochem dedup:** 2 record — HAPUS `64ee0492…` (account_status=customer, stage NEW, kosong, tanpa inquiry/quotation), PERTAHANKAN `79c3562b…` (stage WON, ada inquiry+quotation). (2) **Indochem konversi customer:** `account_status='customer'`, `code='IJL'`, `became_customer_at` di-stamp. (3) **Konfirmasi auto-convert WON→customer SUDAH ADA** di `PipelineKanbanPage` (`became_customer_at`); Indochem cuma korban timing (di-WON sebelum logika konversi jalan). (4) **Payment term baru** "Cash Before Delivery" (`code='CBD'`) ditambah ke 3 entity (MSI/JCI/SOA). | ✅ Complete |
| 2.8L | **Security — cabut GRANT `anon` di 29 tabel sensitif (DB, defense-in-depth).** `REVOKE` akses `anon` di **3 tabel finansial** (`accounts`, `quotations`, `quotation_items`) + **26 tabel** (finance / RBAC / user / CRM / inventory). RLS tetap aktif sbg lapisan kedua → anon ke-block di level **GRANT DAN RLS**. GRANT `authenticated` diverifikasi **lengkap SEBELUM** revoke (app tidak putus). **Belum dicabut (backlog, tidak urgent):** tabel kategori REFERENCES/TRIGGER/TRUNCATE-only (`companies`, `payment_terms`, `assets`, dll) — tidak beri akses baca/tulis data. Detail di section **Security Hardening — 15 Jun 2026**. | ✅ Complete |

| 2.8M | **PDF quotation — fix section header ke-potong + box border Notes/Above rates (`QuotationDetailPage.jsx` saja, render PDF + styling).** **Masalah 1 (header ke-potong antar halaman):** section header dulu `<div>` di LUAR `<table>` tanpa proteksi → page-break bisa jatuh tepat di header → ke-potong separuh. **Fix (opsi b — paling robust):** section header dipindah jadi baris pertama di DALAM `<thead>` tabel: `<tr className="pdf-no-break"><th colSpan={6} style={navy header}>{sec.name}</th></tr>` sebelum baris kolom-header. Sekarang header (a) double-protected (`tr` + `.pdf-no-break`) → tak pernah di-slice, (b) menempel ke tabel + ikut cascade page-break engine (line ~288: break digeser ke `pos.top-2`, dan karena thead rows contiguous, shift meng-cascade ke atas → header + kolom-header + baris pertama tak terpisah). **SENGAJA TIDAK** membungkus seluruh section dgn pdf-no-break (kalau section > 1 halaman A4 → blank/gagal render). Tabel panjang tetap boleh mengalir ke halaman berikut (tiap `tr` baris data sudah di-handle no-break). Wrapper `<div style={marginBottom:16}>` dihapus → `marginBottom:16px` pindah ke `<table>`. **Masalah 2 (border Notes & Above rates):** Notes → box `border:1px solid #E5E7EB` + `borderLeft:4px solid #144682` (navy), bg `#F8FAFC`, radius 4px, padding 10/12, judul "Notes" bold navy, isi `whiteSpace:pre-line`. Above rates/Terms → box sama tapi `borderLeft:4px solid #E85A1E` (orange), bg cream `#FBF8F2`, judul "Above rates :" bold orange. Keduanya `pdf-no-break` (Notes BARU ditambah; Terms sudah ada). Border solid (no shadow → aman html2canvas); tanpa hijau/emoji. Logika perhitungan/data TIDAK diubah. Lint 1→1 (net-zero, baseline pre-existing setLoading-in-effect). build clean. | ✅ Complete |

| 2.8N | **InventoryDashboardPage — port desain Lovable + sambung Supabase (modul Inventory).** File baru `src/modules/inventory/pages/InventoryDashboardPage.jsx` (visual port handoff Claude Design `WC3WxmwjYDLcXrfwAmfDVg`). Ambil visual/layout, **buang semua mock**, sambung data real. **Layout (4 row):** header (breadcrumb + title Montserrat + segmented period This Month/Quarter/Year) → 4 KPI card → MovementTrend (AreaChart inbound/outbound) + CategoryDonut (Pie) → Top10 by Value (custom bar) + StockPerWarehouse (share bar) → Low Stock Alert table. **Brand modul: TEAL `#0D9488`** (pembeda dari navy CRM), chart pastel (teal `#5EEAD4`/sky `#7FB5E6`/amber `#F5C97A`/lavender `#C9B8E0`), IBM Plex Mono utk angka/SKU, Montserrat heading + Inter body; no emoji, no green (teal OK), Lucide-style inline icons. **Data (role-aware + company-scoped, mirror CRMDashboard):** `useAuth()` → `isAllEntities=['super_admin','admin']`; query `stock_summary` join `products(code,name,category,unit,uom,unit_cost,default_price)`+`warehouses(code,name,city)` + `stock_ledger` (lookback 12 minggu) — `if(!isAllEntities) .eq('company_id', profile.company_id)` (super/admin lihat semua, RLS scope sisanya), **`.limit(1000)`** di kedua query, **TIDAK hardcode company_id** (StokBarang lama hardcode SOA — ini tidak). **KPI:** Total SKU (distinct product punya stock_summary), Total Nilai (`Σ on_hand×unit_cost` → Juta), Total On-Hand (`Σ on_hand`), Stok Menipis (`on_hand<10`, THRESHOLD tetap krn belum ada min_stock). **Derived client-side:** group by product_id (gabung gudang), kategori dinamis dari `products.category` + palet pastel cycle, top10 `on_hand×unit_cost` desc, warehouse qty+share% (TIDAK fabrikasi kapasitas — bar=share total, bukan util palsu), movement weekly bucket dari stock_ledger (`movement_type` startsWith 'out'→keluar else masuk; outbound belum ada data → flat, normal). **Period control** genuinely slice trailing N minggu (4/8/12) dari ledger teragregasi (efek real, single fetch). **`useWidth` pakai callback ref** (bukan useRef+useEffect[] yg buggy — chart kosong saat container mount pasca data load; sesuai fix 2.8H). **KPI trend pill DIHAPUS** (tak ada data period-over-period real → tak fabrikasi). **State loading/empty/error** lengkap (skeleton "Memuat…", empty "Belum ada data stok", error + tombol Coba lagi). **Wiring App.jsx:** lazy import `InventoryDashboardPage`, routing block `activeMenu==='inventory-dashboard'` (ErrorBoundary+Suspense) sebelum block Stok Barang; menu `inventory-dashboard` (label "Dashboard Inventory") + MENU_KEY_MAP `inv_dashboard` sudah ada; catch-all ComingSoon sudah exclude prefix `inventory-`. **Hanya** App.jsx + file baru disentuh. Lint file baru 2 err (memoization-skip + set-state-in-effect — baseline kategori sama spt CRMDashboard/Pipeline; `React`-unused import dibuang), App.jsx 3→3 net-zero. build clean. **Catatan DB:** kolom `products.unit_cost`/`default_price`/`uom` & `stock_ledger.movement_type`/`qty`/`created_at` diasumsikan ada (dipakai PenerimaanBarang/StokBarang existing); ledger error → movement kosong (graceful). | ✅ Complete |

| 2.8N-fix | **InventoryDashboardPage — ganti basis harga nilai inventory dari `unit_cost` → `default_price` (harga jual).** Alasan: `products.unit_cost` semua NULL, `default_price` ada isi. `InventoryDashboardPage.jsx` saja. (1) Query `stock_summary→products` select: `unit_cost, default_price` → **`default_price`** (drop unit_cost). (2) `prodMap.cost = Number(row.products?.default_price) || 0` (was `unit_cost`); `Number(...)||0` = COALESCE(default_price,0) → no NaN utk produk tanpa harga. (3) KPI "Total Nilai Inventory" note `"On-hand × harga modal"` → **`"Berdasarkan harga jual"`** (jujur ke user). (4) Top 10 subtitle `(on-hand × harga modal)` → `(on-hand × harga jual)` utk konsistensi. **TIDAK diubah:** Total On-Hand/SKU/Stok Menipis (qty), chart kategori (qty-based), tren pergerakan, low stock table. `totalValue` + `topByValue` otomatis pakai `default_price` via `p.cost`. Lint 2→2 (baseline), build clean. | ✅ Complete |

| 2.8O | **CRMDashboard — AddVisitModal dropdown Prospect ikut tampilkan customer (mantan WON).** `CRMDashboardPage.jsx` saja. Bug: dropdown opsi visit hanya `.eq('account_status','prospect')` → customer hasil konversi WON (mis. Indochem) tak muncul, sales tak bisa jadwalkan visit ke customer existing. **Fix:** (1) query opsi dropdown (useEffect "fetch options for AddVisitModal", ~L1645): `.eq('account_status','prospect')` → **`.in('account_status', ['prospect','customer'])`** (filter `company_id`/`deleted_at`/`order('name')`/`limit(200)` tetap). (2) Label field di AddVisitModal (~L865): `lbl('Prospect')` → `lbl('Prospect / Customer')` + comment diselaraskan. **TIDAK diubah:** 3 query KPI/salesPerf (`prospectsRes`/lastMonth/salesPerf, L1404/1426/1437) TETAP `account_status='prospect'` (basis pipeline/win rate harus prospect-only). Lint 7→7 (net-zero baseline). build clean. | ✅ Complete |

| 2.8P | **AssetDetailITPage — inline edit lintas 3 tabel (Info/Spec/Network).** Aktifkan tombol Edit jadi INLINE edit (bukan modal/route baru): klik Edit → field di tab Info Dasar/Spesifikasi/Network jadi input in-place, Save/Cancel di header, pindah tab tak hilangkan perubahan. **State:** `editing`/`saving`/`saveError`/`form{asset,spec,net}`/`opts{categories,locations,users}`/`toast`; `enterEdit` snapshot data + fetch dropdown options (asset_categories all, asset_locations + profiles scoped `asset.company_id`, `active=true`, `.limit(1000)`); `cancelEdit` buang form; setter `setA/setS/setN`. View tab di-gate `&& !editing`, form tab `&& editing && form` (Health/SW/Mtc/Hist tetap read-only). **Save lintas tabel + error handling:** `update assets` → `upsert asset_specifications {onConflict:'asset_id'}` (skip jika specs null & semua kosong) → `upsert asset_network {onConflict:'asset_id'}` (sama); tiap step cek error → `throw` pesan jelas per-tabel → `saveError` Banner danger; sukses → `refreshIT()` (specs/network) + `onSaved()` (parent asset refresh) + exit edit + toast navy. `updated_by=profile.id`, `updated_at=now()`. Numerik kosong → NULL (`numOrNull`), text kosong → NULL (`txtOrNull`); `name`/`category_id` NOT NULL → fallback nilai lama jika dikosongkan. **Assigned To** = dropdown user (profiles company-scoped): set `assigned_to_user_id`+`assigned_to_name` (lookup opts.users); kosong → keduanya null. **Dropdown ber-constraint (value PERSIS):** status (active/in_repair/retired/disposed/transferred), asset_subtype (laptop/desktop/server/printer/network/peripheral/other), storage_type (SSD/HDD/NVMe/eMMC/other), depreciation_method (straight_line/double_declining/none), is_online (true/false) — label cakep, value sesuai CHECK; field lain text/number bebas. **⚠️ Field di task yg TIDAK ADA kolomnya di `assets` → SENGAJA di-skip (tulis = save gagal; tambah kolom butuh approval schema): `brand`, `condition`, `department_id`, `assignment_status`** (jadi assignment_status TIDAK di-set; assigned cukup user_id+name). **Software & Lisensi + Maintenance** sengaja TIDAK inline-edit (list multi-row, per-row terpisah) — TODO comment ditambah. **Files:** `AssetDetailITPage.jsx` (edit primitives ERow/EText/ENum/ESelect/EArea + option sets + state/save + 3 form block + toast); `AssetDetailPage.jsx` (destructure `refresh` dari useAssetDetail + pass `onSaved={refresh}`); `useAssets.js` TIDAK diubah (`useITAssetDetail` sudah expose `refresh`). `handleSave` plain function (bukan useCallback) supaya bersih dari React-compiler "memoization could not be preserved". Lint ITPage 0→0 (clean, net-zero), AssetDetailPage clean. build clean. Tidak ada permission/role check baru (RBAC existing). | ✅ Complete |

| 2.8P-fix | **AssetDetailITPage — aktifkan 4 field yg sebelumnya di-skip (brand/condition/department_id/assignment_status).** KOREKSI 2.8P: keempat kolom TERNYATA ADA di tabel `assets` (ditambah via SQL Editor ALTER TABLE, belum ter-pull ke migrasi — diverifikasi via information_schema: `assignment_status` varchar, `brand` varchar, `condition` varchar, `department_id` uuid FK departments). Backlog `db pull` terpisah. **(1) Info edit form:** `brand` (text bebas), `condition` (input + `<datalist id=ait-condition-list>` saran `CONDITION_OPTS=['Baik','Tidak Baik','Tidak Diketahui']` tapi free-text — tak ada CHECK), `department_id` (ESelect dari `opts.departments`, label `"{code} - {name}"`). enterEdit fetch `departments` (id,code,name; `.eq('company_id',cid)`, deleted_at null, order code, limit 1000) → `opts.departments`; snapshot form.asset tambah brand/condition/department_id; `opts` init tambah `departments:[]`. **(2) Assignment status logic (handleSave):** `assignmentStatus = assignedId ? 'checked_out' : 'available'`; assetsPatch tambah `assignment_status` + `brand`/`condition` (txtOrNull) + `department_id` (|| null). **(3) View mode Info Dasar:** Brand (Identitas), Kondisi (badge neutral), Status Assignment (badge: checked_out=info "Checked out" / available=ok "Available"), Department (`{code} - {name}` dari embed). **(4) `useAssets.js` `useAssetDetail` select:** tambah `brand, condition, assignment_status, department_id` + embed `departments(code, name)` + **`assigned_to_user_id`** (sebelumnya TAK di-select → edit dropdown Assigned To tak pre-fill assignee; sekarang ter-fix). Shared dgn vehicle detail — kolom null-safe, embed FK departments unambiguous (1 FK). **Files:** AssetDetailITPage.jsx + useAssets.js (select). build clean; lint ITPage/useAssets/AssetDetailPage semua clean (net-zero). | ✅ Complete |

| 2.8Q | **Fix RLS `quotations_update` — sales tak bisa edit quotation sendiri (DB/RLS via SQL Editor).** Policy lama `USING is_admin_or_above()` → sales (creator) ke-block saat edit/submit quotation miliknya. Diubah: `USING ((company_id = get_user_company_id() AND (is_manager_or_above() OR created_by = auth.uid())) OR is_super_admin())` + `WITH CHECK` sama. Sekarang sales bisa edit quotation miliknya (`created_by`), manager se-entitas, super semua. Kode TIDAK diubah. **Pola berulang** (lihat Roadmap → audit CRUD policy): UPDATE admin-only nyangkut owner-edit. | ✅ Complete |

| 2.8R | **Asset MSI — schema + master data + bulk 24 laptop (DB via SQL Editor; detail di section khusus).** (1) **`assets` ALTER ADD 4 kolom:** `condition` varchar, `department_id` uuid FK departments, `brand` varchar, `assignment_status` varchar DEFAULT 'available' (dipakai inline edit 2.8P-fix). (2) **Master data seed:** `asset_locations` "Head Office BSD" (`341d9dda…`, branch_id MSI HO `ef2594db…` — kolom `branch_id` NOT NULL); `departments` MSI 3 baru HCGA (`a4d59e17…`), PPJK (`cb4f6190…`), CONSOLE (`9c7fb915…`). (3) **Bulk insert 24 laptop MSI** (IT-EQP) ke 3 tabel `assets` + `asset_specifications` + `asset_network`; `assigned_to` dikosongkan (data lama, di-update setelah re-audit), `assignment_status` all 'available'. ⚠️ **Kolom & schema via SQL Editor BELUM ter-pull migrasi** — 2× jadi penghambat hari ini (Claude Code sempat skip 4 assets cols & `unit_cost` karena tak terlihat di file migrasi). Detail + check-constraint reference di section **Master Data & Schema Changes via SQL Editor — 16 Jun 2026**. | ✅ Complete |

| 2.8S | **Fix bug layout mobile — konten BLANK di mobile (App.jsx, 1 baris).** Container layout utama `<div className="flex min-h-screen">` (L1743) bikin konten blank di mobile. Akar masalah: `flex` (row) + `min-h-screen` → mobile topbar (`header lg:hidden`) ke-stretch tingginya mengikuti main content (`align-items:stretch` default) sampai ~2389px → menutupi seluruh konten di belakangnya. Sidebar sudah `hidden lg:flex` (benar), tapi flex row tak pernah jadi column di mobile → header & main berdampingan + ke-stretch. **Fix:** class jadi `flex flex-col lg:flex-row min-h-screen` — mobile (flex-col) header+main bertumpuk vertikal normal; desktop (lg:flex-row) sidebar+konten berdampingan (tidak berubah). Hanya 1 baris diubah, tidak ada perubahan lain. build clean. | ✅ Complete |

| 2.8T | **Responsive mobile — sisir grid/layout fixed di halaman utama (opt-in via className, desktop ≥1024px tetap identik).** Lanjutan 2.8S (layout shell flex-col). Akar masalah: banyak grid pakai **inline style** `gridTemplateColumns: repeat(4/3,...)` / `minmax(0,1.55fr) ...` (tanpa breakpoint) → dipaksa multi-kolom di mobile → kartu kepotong/penyok. **Pendekatan (konsisten, minim-risiko):** util class di `src/index.css` yang OVERRIDE `grid-template-columns` HANYA via `@media (max-width:1023px)` + `!important` → desktop ≥1024 tak ada @media → inline style menang → **pixel-identik**. Class: `.nx-grid-kpi` (4/3-col KPI → tablet 2, mobile 1), `.nx-grid-3` (3-col → tablet 2, mobile 1), `.nx-grid-2` (2-col/chart → tablet & mobile 1), `.nx-page-pad` (padding horizontal mengecil di <640), `.nx-stack` (flex 2-kolom dgn sidebar fixed → column + full-width + unsticky di <1024). Ditempel **alongside** inline style (style tak diubah). **Files (className saja, 0 logic):** `index.css` (util baru) + CRMDashboardPage (kpi/charts/tables/skeleton/root-pad + 2 modal form `1fr 1fr`), InventoryDashboardPage (kpi/charts×2/root-pad), AssetDashboardPage (statRow×2 `gridStyle(4)` + value `gridStyle(2)`), AssetITPage (stat repeat4), AssetDetailITPage (network repeat4; spec-grid/hcat-grid SUDAH `@media` sendiri), AssetDetailPage (vehicle repeat3), AddAssetPage (repeat3), SalesOrderDetailPage (`1fr 1fr`×2 + finance repeat4), InputSPPage (form repeat3×2 + item 4-col), QuotationDetailPage (`.nx-stack` 2-col on-screen + header repeat3 InfoRows; **print-area `#quotation-print-area` TIDAK disentuh**), QuotationFormPage (`.nx-stack` 60/40), FinanceDefaultsPage (2-col×2). **SUDAH responsive (tidak diubah, diverifikasi):** StokBarang/CustomerList/Products/PenerimaanBarang (punya `@media` sendiri), SalesOrderPage (`auto-fit`), Dashboard command-center (no fixed grid), AppLauncher (bento `@media`). Tabel lebar prioritas sudah ada `overflowX:auto`. **Desktop ≥1024px tidak berubah** (semua override @media <1024). Brand tetap. build clean (lint: hanya baseline pre-existing, className-add lint-neutral). | ✅ Complete |

| 2.8U | **Navigasi mobile (<1024px) setara desktop — hamburger + drawer + App Launcher (App.jsx).** Lanjutan 2.8S/2.8T. Sebelumnya mobile topbar tampilkan menu module sbg pills flat (iterasi `visibleMenus`) — tak proper, tanpa App Launcher/cara balik. **Desain (konsisten desktop "Option B"):** belum pilih module → App Launcher bento full-width tampil (topbar: logo + Logout, TANPA hamburger); di dalam module → topbar tampil **hamburger (lucide `Menu`)** + logo + Logout, tap → **drawer slide-in dari kiri** berisi menu module aktif + tombol "Apps". **Reuse `ModuleSidebar` (DRY, bukan sidebar baru):** tambah props `asDrawer`/`isOpen`/`onClose`. Desktop (default): `hidden lg:flex` static sticky (TIDAK berubah). Drawer: `lg:hidden flex fixed top-0 left-0 h-screen w-[280px] max-w-[85vw] z-50` + `transform translateX(0/-100%)` transition 300ms + shadow; `navigate`/`backToApps` di-wrap → panggil `onClose()` (item klik & Apps → navigate + tutup drawer). **State** `mobileDrawerOpen` (default false); `goToLauncher` reset ke false (anti stale-open). **Render layout:** setelah desktop sidebar, blok `{activeModule && <>overlay + <ModuleSidebar asDrawer/></>}`; overlay `lg:hidden fixed inset-0 z-40 bg rgba(0,0,0,.42)` opacity+pointerEvents per `mobileDrawerOpen`, klik overlay → tutup. **Topbar mobile:** hamburger button (kiri, sebelum logo, **hanya saat `activeModule`**) → `setMobileDrawerOpen(true)`; **nav pills flat `visibleMenus.map` DIHAPUS** (menu kini via drawer). `visibleMenus` tetap dipakai di `activeMenuItem` (no unused-var). **App Launcher** (`{!activeModule && <AppLauncher/>}` dlm `<main flex-1 w-full>`) sudah full-width di mobile (sidebar tak render saat !activeModule; `nexus-main-surface` display:none) — flex-col shell (2.8S) sudah cegah topbar nutupi. **Desktop ≥1024px TIDAK berubah:** drawer+overlay `lg:hidden`, hamburger di header `lg:hidden`, sidebar static tetap `hidden lg:flex`. Brand navy gradient dipertahankan, Lucide icon, no emoji. Lint App.jsx 3→3 (net-zero baseline). build clean. | ✅ Complete |

| 2.8V | **Fix kalender CRM Dashboard "plenger" di mobile — scroll horizontal (Opsi A).** `DashCalendar` (CRMDashboardPage.jsx) pakai 2 grid `repeat(7,1fr)` (`calGridHead` + `calGrid`) → di <640px kolom kepotong/meluber. **Fix:** bungkus [calGridHead + calGrid] dalam SATU wrapper `<div className="nx-cal-scroll">` (header hari & grid tanggal dalam wrapper yg sama). **`src/index.css`** util baru (pola sama util responsive lain — mobile-only): `@media (max-width:1023px){ .nx-cal-scroll{ overflow-x:auto; -webkit-overflow-scrolling:touch } .nx-cal-scroll > *{ min-width:640px } }`. `> *` kena KEDUA grid → min-width 640px sama → 7 kolom (~91px) **header & tanggal tetap align** saat scroll. Desktop ≥1024px: tak ada @media → kalender full-width 7 kolom tanpa scroll (TIDAK berubah). Event dalam cell sudah truncate (`calEventProspect` overflow:hidden+ellipsis+nowrap) → nama panjang (mis. "PELANGI ENGINEERING INDONESIA") clip di cell, tak memaksa lebar. Hanya tambah 1 wrapper div + 1 util CSS; logika kalender tidak diubah. Lint CRMDashboard 7→7 (net-zero baseline). build clean. | ✅ Complete |

| 2.8W | **Kalender CRM Dashboard — pola "dot + tap detail" di mobile (ganti scroll horizontal 2.8V).** `DashCalendar` (CRMDashboardPage.jsx). **Desktop ≥1024px TIDAK berubah:** event text di cell (prospect/jam/sales), cell besar, 7 kolom full-width. **Mobile <1024px:** 7 kolom MUAT tanpa scroll (cell mengecil), event jadi **dot pastel** di bawah angka tanggal; tap tanggal ber-visit → **bottom-sheet** list visit hari itu + "Tambah Visit". **Deteksi mobile = HYBRID:** (a) **visuals CSS-driven** (no flash) — event-text wrapper `className="hidden lg:block"`, dot-row `className="lg:hidden"` (Tailwind breakpoint lg); cell sizing via `index.css` `@media(max-width:1023px){ .nx-cal-cell{min-height:50px;padding:4px 2px !important} .nx-cal-dow{padding:6px 2px;font-size:9.5px !important} }`. (b) **tap behavior = JS** `useIsMobile(1023)` (matchMedia, initial dari `.matches` → no flash, listener `change`, cleanup; TIDAK perlu krn beda AKSI bukan cuma visual) — desktop tap-day tetap `onDayClick` (AddVisit prefilled), mobile tap-day-ber-visit → `setDayPopup`. **Dot pastel** (`VISIT_DOT_PASTEL`, BUKAN navy/orange): scheduled `#A5C8E8`(sky)/completed `#7FD8C4`(teal)/cancelled `#F5C9A8`(peach), 6px, maks 3 dot lalu "+N". **Bottom-sheet** (`dayPopup` state lokal): overlay rgba(0,0,0,.42) z-120, card bawah radius-atas, judul tanggal + tombol close (Icon `x`), list visit (dot+nama ellipsis+jam IBM Plex Mono+sales+status badge) → tap = `onVisitClick(v)` (reuse VisitDetailModal) + tutup; tombol "Tambah Visit" (navy, Icon `plus`) → `onDayClick(dateKey)` (reuse, AddVisit prefilled tanggal) + tutup; tap overlay = tutup. **Reuse handler existing** (onDayClick/onVisitClick/onAddVisit) — tak bikin sistem baru. **Cleanup:** wrapper `.nx-cal-scroll` + util CSS-nya (2.8V) DIHAPUS total (0 ref tersisa). Lint CRMDashboard 7→7 (net-zero; `useIsMobile` effect pakai listener, bukan sync setState). build clean. | ✅ Complete |

| 2.8X | **Recent Activity CRM Dashboard — reflow mobile (timestamp+badge pindah ke bawah nama).** `RecentActivity` (CRMDashboardPage.jsx). Bug: tiap `actRow` flex-row 4 sibling sejajar [icon][teks flex:1][actTime][userBadge] → di <1024px nama panjang (mis. "SINAR METRINDO PERKASA") wrap & timestamp/badge overlap teks. **Fix (struktur + @media, desktop tak berubah):** (1) bungkus [text-block + meta] dalam satu `<div className="nx-act-content" style={flex:1,minWidth:0,display:flex,align:center,gap:14}>`, dan [actTime + userBadge] dalam `<div className="nx-act-meta" style={display:flex,align:center,gap:14,flexShrink:0}>`. Spasi desktop IDENTIK (semua gap 14: icon↔content, text↔meta, time↔badge sama spt sebelumnya icon↔text↔time↔badge). (2) `nx-act-row` ditambah ke outer div. (3) **`index.css` `@media(max-width:1023px)`:** `.nx-act-row{align-items:flex-start}` (icon ke atas), `.nx-act-content{flex-direction:column;align-items:stretch;gap:3px}` (text di atas, meta turun ke bawah), `.nx-act-meta{flex-wrap:wrap;margin-top:2px}` (time·badge satu baris kecil, boleh wrap, tak overlap nama). **Desktop ≥1024px:** tak ada @media match → inline style `nx-act-content`/`nx-act-meta` (row, gap14) menang → **semua sejajar horizontal persis seperti sekarang** (icon|teks|timestamp|badge). Pola @media konsisten dgn util responsive lain (nx-cal-cell dst). Brand tetap, no emoji. Lint CRMDashboard 7→7 (net-zero; restructure JSX + className lint-neutral). build clean. | ✅ Complete |

| 2.8Y | **CEO unblock — `profiles_read` RLS dilonggarkan (DB change via SQL Editor, BUKAN di repo).** Akar masalah: fungsi `is_admin_or_above()` TIDAK mengenal role `ceo` → CEO ke-block baca `profiles` (nama assignee/sales muncul kosong di banyak page). **Fix DB:** policy `profiles_read` di-DROP & dibuat ulang `USING (true)` → semua `authenticated` bisa baca `profiles`; `profiles_update` **TIDAK disentuh** (tetap ketat). **Aman untuk sekarang:** `profiles` tidak menyimpan data sensitif (bukan HRIS — hanya nama/role/avatar/company). **⚠️ WAJIB ditinjau ulang saat modul HRIS masuk** (kalau ada gaji/data pribadi, `USING(true)` jadi tidak aman). Bagian dari masalah lebih besar (RLS role hardcode tak sinkron RBAC) → lihat section **Backlog — Migrasi RLS Proper (RBAC-driven)**. Tidak ada kode/repo diubah — catat sebagai known DB change. | ✅ Complete (DB) |

| 2.8Z | **Bersihkan console.log leak data + fix empty catch (3 file kode + CLAUDE.md).** **TASK 1:** hapus **6 `console.log` debug** di `AuthContext.jsx` (termasuk yg mem-leak SELURUH row profile user di `fetchProfileById`) + **3 `console.log`** data produk/company map di `ProductsPage.jsx`. `console.error` (5×) + `console.warn` safety-timeout (1×) di AuthContext **DIPERTAHANKAN** (error handling beneran, bukan debug). **TASK 2:** `PipelineKanbanPage.jsx` empty `catch (_) {}` (drag `dataTransfer.setData`) → diisi `console.warn` + komentar — operasi **OPSIONAL** (drag pakai `dragId.current` sbg source of truth; `setData` boleh gagal di edge-case browser, non-fatal, **tak di-surface ke user**); sekaligus hilangkan lint `no-empty` + `_` unused-var. **TASK 3:** refresh angka basi di Roadmap 🟢 — `App.jsx` 4.618→**4.667**, `CRMDashboardPage` 1.850→**1.996** (aktual `wc -l`). build clean (2629 modules, 1.12s); lint AuthContext 2→2 / ProductsPage 1→1 / **PipelineKanban 5→3** (net-improve). Catatan: build clean ≠ jaminan fitur jalan (perlu tes manual: console bersih saat login & Products, drag Pipeline normal). | ✅ Complete |

| 2.9A | **CRM Batch 1 — fix correctness frontend (hasil AUDIT_CRM.md, 8 file, niru pola existing).** **TASK 1 (nomor dokumen):** `InquiryFormPage.generateInquiryNo` & `QuotationFormPage.generateQuotationNo` — HAPUS fallback diam-diam `Date.now().slice(-4)` (rawan tabrakan/non-sekuensial); RPC gagal → `throw new Error('Gagal generate nomor dokumen, coba lagi.')`. `generateXNo` di-await SEBELUM insert di dalam `handleSave` try/catch existing → throw otomatis batalkan simpan + `showToast(err.message,'error')`. TIDAK ada nomor non-sekuensial ter-generate. **TASK 2:** `InquiryFormPage` dropdown account (prospect+customer) tambah `.limit(1000)` (sebelumnya default-10 → account ke-11+ tak bisa dipilih); `QuotationListPage` fetch tambah `.is('deleted_at', null)` (sebelumnya quotation soft-deleted muncul). **TASK 3 (role-aware visibility — TIRU PERSIS pola `ProspectListPage.jsx:89-90,103-104,118-119`):** `InquiryListPage`/`QuotationListPage`/`SalesCallsPage` tambah `isAllEntities=['super_admin','admin']` + `isSalesOnly=['sales','operations']`; guard `if(!profile?.id)return; if(!isAllEntities&&!profile?.company_id)return;`; `if(!isAllEntities) .eq('company_id',…)`; sales-own filter MENGIKUTI kolom RLS tiap tabel (bukan copy `assigned_to` buta — inquiries/quotations TAK punya assigned_to): inquiries/quotations `.eq('created_by',profile.id)`, sales_calls `.or('salesperson_id.eq.{id},created_by.eq.{id}')`; deps useCallback tambah `profile?.id,isAllEntities,isSalesOnly`. Super_admin kini lihat SEMUA entitas; sales hanya miliknya (RLS lapis kedua). **TASK 4 (`.single()`→`.maybeSingle()`):** `QuotationDetailPage` (3×: quotation by id [render sudah guard `if(!quot)` → "Quotation tidak ditemukan", lebih bersih dari toast coerce], payment_terms, creator profile), `CustomerDetailPage` (2×: join + fallback), `QuotationFormPage` (companies, `companyRow?.code||'MSI'` null-safe), `InquiryFormPage` (companies, null-safe). **TASK 5 (catch jangan nelan):** `CustomerDetailPage:425` & `CustomerListPage:551` — `catch {}` → `catch(err)` + `console.error` konteks + cek `fbErr` query fallback (`if(fbErr) console.error`). **DB TIDAK disentuh** (fix RLS `inquiries_update` admin-only & UNIQUE accounts = batch DB terpisah). build clean (2629 modules, 1.46s); lint **net-zero per file** (8 file baseline==after). Catatan: build clean ≠ jaminan fitur jalan (perlu tes manual: inquiry nomor sekuensial, dropdown >10, quotation deleted hilang, super_admin lihat MSI+JCI+SOA, sales tak bocor, detail data minim tak crash). | ✅ Complete |

| 2.9B | **DB-only (via SQL Editor, dokumentasi) — WON→customer trigger + tabel `activities`.** Tidak ada kode/DB diubah dari sesi ini; mencatat 2 perubahan DB 17 Jun yang sudah masuk `schema_snapshot.sql` (refresh → **70 tabel, ~8.313 baris**). **(1) Fix WON→customer:** backfill record `pipeline_stage='WON' AND account_status<>'customer'` + trigger `trg_set_customer_on_won` (function `set_customer_on_won`, `BEFORE INSERT OR UPDATE ON accounts`) → menutup SEMUA jalur (drag/edit-form/import), DB jadi sumber kebenaran tunggal (frontend `WinLossModal` jadi redundan, dibiarkan). Akar masalah & jalur lihat `CRM_FLOW.md` + audit TOKO DAMRAH. **(2) Tabel `public.activities`:** menyatukan & akan menggantikan `sales_calls`+`sales_visits` — multi-tipe (`type` call/visit/meeting/prospecting/followup), `status` todo/done/cancelled, anchor `account_id`/`inquiry_id`/`quotation_id` (FK lengkap), `details jsonb` per-tipe, `migrated_from`, RLS role-aware niru accounts, 6 index. Data lama dimigrasi (0 calls + 2 visits). **`sales_calls`/`sales_visits` DORMANT (belum di-drop)** — frontend masih pakai tabel lama. Detail di section **DB Changes via SQL Editor — 17 Jun 2026**. Backlog: repoint frontend call/visit → activities, lalu drop tabel lama. | ✅ Complete |

| 2.9C | **DB-only (via SQL Editor, dokumentasi) — tabel `activity_logs`.** Tidak ada kode/DB diubah dari sesi ini; mencatat 1 perubahan DB 17 Jun (snapshot refresh → **71 tabel, ~8.395 baris**). Tabel baru `public.activity_logs` = audit log perubahan status untuk `activities` (`activity_id`→activities ON DELETE CASCADE, `changed_by`, `changed_at`, `from_status`, `to_status`, `notes`; 1 index; **RLS scope via parent activity** pakai `EXISTS` ke `activities`, bukan `company_id` langsung). **Menggantikan `sales_visit_logs`**; data lama dimigrasi (2 log). **`sales_visit_logs` DORMANT (belum di-drop)** — `CRMDashboardPage` VisitDetailModal masih pakai tabel lama; drop bareng `sales_calls`/`sales_visits` setelah frontend dipindah. Detail di section **DB Changes via SQL Editor — 17 Jun 2026** (#3). | ✅ Complete |

| 2.9D | **Activity cutover Phase 2A — pindahkan SEMUA baca/tulis frontend call/visit dari `sales_calls`/`sales_visits`/`sales_visit_logs` → `activities`/`activity_logs` (data-layer only, UX & tampilan TIDAK berubah) + fix dropdown sales (#3).** 3 file: **SalesCallsPage.jsx** (CRUD call → `activities` type='call' status='done'; read remap activities→bentuk call lama, write payload + `details jsonb` {call_type,duration_minutes,bant_collected}; embed account via `accounts!activities_account_id_fkey`), **CRMDashboardPage.jsx** (kalender visit + 2 KPI mingguan read → `activities` type='visit'/'call'; `handleSaveVisit` write → `activities` type='visit' + `details` {visit_type,location,point_of_meeting,mom}, `follow_up`→`next_action`; log write+read VisitDetailModal → `activity_logs` `activity_id`; `ownBySales` pakai `assigned_to`), **CustomerDetailPage.jsx** (History Visit + Health → `activities` `.eq('account_id',id).eq('type','visit')` — **visit only**, call tidak digabung). **Mapping kolom:** prospect_id→account_id, salesperson_id→assigned_to, call_date/visit_date→scheduled_for, call_time/visit_time→activity_time, result→outcome, follow_up→next_action; status visit (scheduled/completed/cancelled) ⇄ activities (todo/done/cancelled) via `VISIT_TO_ACT_STATUS`/`ACT_TO_VISIT_STATUS`; **`activity_logs` simpan vocab visit** (scheduled/completed/cancelled) agar konsisten dgn data migrasi + lookup `VISIT_STATUS`. **Nama sales/log-author:** `activities.assigned_to` & `activity_logs.changed_by` TIDAK punya FK ke `profiles` (DB tak diubah) → resolve via **client-side id→full_name map** (fetch SEMUA profiles by id, **tanpa** filter active → nama sales nonaktif/lama tetap kebaca). Account name tetap embed (FK `activities_account_id_fkey` ada). **Fix #3 dropdown sales (Task 5):** helper `fetchSalesProfiles(companyId)` di 2 file (RBAC: `roles.code='sales'` per-company → `user_roles` `is_active=true`+`revoked_at IS NULL`+`company_id` → `profiles` active) — **tak ada hardcode role_id uuid**; ganti query bocor CRMDashboard (`profiles active limit 100` tanpa company filter) + konsistenkan SalesCallsPage. Default salesperson = user login dibiarkan apa adanya. **Verifikasi:** `grep sales_calls|sales_visits|sales_visit_logs` di `src/` = **0 di luar `*.legacy`**; `npm run build` clean (2629 modules, 886ms). `CustomerMasterPage.legacy.jsx` (dead) TIDAK disentuh; tabel lama TIDAK di-drop (masih DORMANT, backlog). | ✅ Complete |

| 2.9E | **Activity module Phase 2B — `ActivitiesPage` (halaman aktivitas terpadu) GANTIKAN `SalesCallsPage` di route `crm-calls`.** File baru `src/modules/crm/ActivitiesPage.jsx` (mirror visual SalesCallsPage: tokens warm-beige `C`, badge, detail modal, pagination client-side PAGE_SIZE 20, helper `fetchSalesProfiles` RBAC sales-only di-copy). **Fitur:** (A) LIST semua tipe activity (call/visit/meeting/prospecting/followup) dari `activities` — role-aware (sales→`assigned_to`/`created_by`; manager ke atas→se-entitas; super/admin→semua), embed account `accounts!activities_account_id_fkey(name)`, nama sales via client-side id→full_name map (no FK profiles, fetch tanpa filter active). Kolom: Tanggal, Tipe, Status, Customer/Prospek, Sales, Catatan/Outcome, Aksi. (B) FILTER: tipe, status (todo/done/cancelled), tanggal (hari ini/minggu ini[ISO Senin]/bulan ini/custom range/semua), sales dropdown (RBAC sales-only). (C) TAMBAH TASK modal: tipe+tanggal+salesperson wajib; field kondisional (call/prospecting→contact_name+phone; prospecting→+prospect_name; visit/meeting→location→`details.location`); notes/next_action/next_action_date/account_id (opsional); `status='todo'` default (tak ada field status di form). (D) CENTANG SELESAI per row todo → `status='done'`+`completed_at=now()`; jika `type='prospecting'` → `ConfirmModal` "Buat Prospek?" [Ya]→buka `ProspectFormPage` CREATE prefilled `{name:prospect_name, pic_name:contact_name, pic_phone:contact_phone}` via `setActiveMenu('crm-prospects')`+`setShowProspectForm`+`setEditingProspect` (pola PipelineKanban), [Nanti saja]→mark done saja. (E) Badge: status todo(abu outline)/done(hijau)/cancelled(merah outline); tipe call(biru)/visit(ungu)/meeting(navy)/prospecting(orange)/followup(amber). **Option A — `ProspectFormPage.jsx` tweak (enabler prefill-create):** `isEdit = !!prospect` → `!!prospect?.id` (objek prefill tanpa id = CREATE, handleSave tetap INSERT) + effect baru seed name/pic_name/pic_phone dari prefill. **App.jsx:** lazy import `ActivitiesPage`; menu `crm-calls` label 'Activity & Calls'→'Activities', icon `PhoneCall`→`Activity` (import `PhoneCall` dihapus krn jadi unused, `Activity` ditambah); route render `SalesCallsPage`→`ActivitiesPage` (+3 props prospect-form-trigger); **menu key `crm-calls` TIDAK diubah** (urusan RBAC, out of scope). **`SalesCallsPage.jsx` TIDAK dihapus** (import sengaja dibiarkan di App.jsx per instruksi → 1 lint unused-var di-terima). Build clean (2630 modules, 1.00s). Lint baseline-category: ActivitiesPage 4 (2 set-state-in-effect + 2 memoization-skip, sama pola SalesCallsPage), ProspectFormPage 2→3 (+1 set-state-in-effect dari prefill effect). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9F | **CRM role-scoping hardening (hasil audit role akses).** **(1) LeadPoolPage frontend belt:** sebelumnya fetch lead_pool TANPA `company_id`/owner filter (satu-satunya penjaga = RLS, single point of failure). Tambah pola ProspectListPage: `erpRole` dari useAuth + `isAllEntities=['super_admin']` + `isSalesOnly=['sales','operations']`; guard `if(!profile?.id)return; if(!isAllEntities&&!profile?.company_id)return;`; fetch `if(!isAllEntities) .eq('company_id',…)` + `if(isSalesOnly) .or('assigned_to.eq.{uid},created_by.eq.{uid}')`; deps effect ditambah `profile?.id/company_id/isAllEntities/isSalesOnly`. Tampilan/fitur/filter UI TIDAK diubah. **(2) Admin role alignment:** frontend `isAllEntities` dulu `['super_admin','admin']` padahal RLS cuma kasih cross-entity ke `is_super_admin()` → admin intent all-entities tapi RLS batasi own-entity (silent mismatch, fails closed). Fix: turunkan ke `['super_admin']` only di 7 file CRM (Prospect/Inquiry/Quotation/PipelineKanban/Activities/SalesCalls/LeadPool) → admin kini single-entity di frontend, konsisten dgn RLS. super_admin tetap lintas entitas; sales tetap own-only. Build clean (2630 modules, 1.07s); grep verifikasi semua `isAllEntities=['super_admin']`. Lint LeadPool 2 set-state-in-effect (baseline, sama pola sibling). **Belum: tes manual runtime** (sales→LeadPool own-only, admin→single-entity tetap jalan, super_admin→lintas entitas). | ✅ Complete |

| 2.9G | **Activity module Phase 2C — edit activity + history tab CustomerDetail + daily activity report dashboard.** **TASK 1 (ActivitiesPage.jsx):** `ActivityDetailModal` [:151] diberi mode view/edit (BUKAN modal baru) — tombol "Edit" di header (view mode) muncul hanya jika `canEdit`; klik → form inline di modal sama. `canEditDetail = isManagerOrAbove || detail.assigned_to===profile.id`; `isManagerOrAbove = ['super_admin','admin','ceo','gm','manager','sales_head']` (selaras `is_manager_or_above()` DB, incl. sales_head). Field editable: type/scheduled_for/activity_time/assigned_to/account_id, prospect_name (prospecting), contact_name/phone (call|prospecting), outcome, notes, next_action, next_action_date, details.location (visit|meeting). **Status TIDAK diedit via form** (hanya via centang). `handleEditSave` UPDATE activities, payload = handleSave minus status/company_id/created_by; **`details` MERGE-PRESERVE** (`{...prevDetails, location}`) → tidak menghapus key tersembunyi (call_type/visit_type/mom/dst). Helper `actToDraft` reverse-map row→draft; import `Pencil`. **TASK 2 (CustomerDetailPage.jsx):** tab baru **"Aktivitas"** setelah tab 'visit' [:546]; fetch SEMUA tipe (`account_id=customer`, tanpa filter type, deleted_at null, order scheduled_for desc, nameMap salesperson, limit 200); kolom Tanggal/Tipe/Status/Sales/Catatan-Outcome; badge `ACT_TYPE_META`+`ACT_STATUS_META`+`ActBadge` (copy warna ActivitiesPage, nama beda dari `Badge({cfg})` existing); count badge = activities.length. Tab 'visit' TIDAK diubah. **TASK 3 (CRMDashboardPage.jsx):** tab ketiga **"Aktivitas"** di DASH_TABS setelah Calendar (icon `activity`); komponen module-scope `ActivityReportTab` (+ `ART_TYPE_META`/`ART_STATUS_META`/`ArtBadge`/`artTodayStr`/`artFmtDate`/`artBounds`). Fetch sendiri dari activities (company_id selalu, assigned_to=uid jika sales, embed account name, nameMap, limit 1000, filter client-side). **SALES:** ringkasan hari ini (todo/done + done per tipe) + tabel detail (filter tanggal today/this_week/this_month/custom; tanpa filter sales). **MANAGER+:** ringkasan per-sales hari ini (Sales/Todo/Done/Call/Visit/Meeting/Prospecting/Followup) + dropdown sales (reuse module `fetchSalesProfiles` RBAC) + filter tanggal + tabel detail (+kolom Sales). Tab Overview & Calendar TIDAK diubah (ternary `calendar ? : activity ? : summary`). DB tidak diubah. Build clean (2630 modules, 1.18s). Lint net +1 set-state-in-effect per file (fetch/reset effect, baseline category — sama pola semua fetch component); "Cannot create components during render" di CRMDashboard pre-existing (line shift). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9H | **ActivitiesPage — aksi dari dalam ActivityDetailModal (view mode): Tandai Selesai + Batalkan Aktivitas.** Footer button bar ditambah di view-mode modal (setelah DSection "Tindak Lanjut"), muncul hanya saat `act.status === 'todo'`. **Tombol "Tandai Selesai"** (primary navy, icon Check, kiri) → `onMarkDone` → parent `handleCheck(detail)` (reuse — sudah handle prospecting flow `setConfirmProspect` + mark done); tampil saat status todo (tanpa gate canEdit, konsisten centang list row). **Tombol "Batalkan Aktivitas"** (outline danger: border+teks `C.danger`/`C.dangerBd`, bg transparent, kanan) → `onCancel` → parent `handleCancelActivity(id)`: `UPDATE activities SET status='cancelled' WHERE id` + toast "Aktivitas dibatalkan" + `setDetail(null)` + `fetchActivities()`; tampil saat `status==='todo' && canEdit` (canEdit = isManagerOrAbove || assigned_to===self, dari 2.9G). **handleCheck** ditambah `setDetail(null)` setelah `fetchActivities()` (unconditional — no-op saat dipanggil dari list row krn detail sudah null, null→null bail-out, jadi tak perlu `detail` di deps / tak ada stale-closure) → modal auto-tutup setelah mark-done dari modal; popup "Buat Prospek?" (state `confirmProspect` terpisah) tetap muncul utk prospecting. Modal signature +2 prop (`onCancel`, `onMarkDone`); mount di-wire `() => detail && handleCheck(detail)` / `() => detail && handleCancelActivity(detail.id)`. `Check` sudah ter-import. Status done/cancelled → kedua tombol tak muncul. Build clean (2630 modules, 1.07s); lint ActivitiesPage 5→5 (net-zero, baseline set-state-in-effect/memoization). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9I | **ActivitiesPage — delete (super_admin) + fix popup "Buat Prospek?" dari modal.** **TASK 1 (delete):** tombol **"Hapus"** (outline danger, `marginRight:auto` → paling kiri) di footer view-mode modal (dalam blok `status==='todo'` existing), muncul hanya jika prop `isSuperAdmin`. Parent: state `deleteConfirm`; `handleDeleteActivity(id)` = **soft delete** `UPDATE activities SET deleted_at=now() WHERE id` → toast "Aktivitas dihapus" + `setDetail(null)` + `setDeleteConfirm(null)` + `fetchActivities()`. Flow: tombol Hapus → `setDeleteConfirm(detail)` + `setDetail(null)` (tutup modal dulu) → `ConfirmModal` variant="danger" title="Hapus Aktivitas?" msg="Aktivitas ini akan dihapus permanen." (di-render setelah ConfirmModal prospek) → confirm → `handleDeleteActivity(deleteConfirm.id)`. Mount: `isSuperAdmin={erpRole==='super_admin'}` + `onDelete={() => { setDeleteConfirm(detail); setDetail(null); }}`. Modal signature +2 prop (`isSuperAdmin`, `onDelete`). Role non-super: tombol tak muncul. **TASK 2 (fix popup prospek):** `handleCheck` urutan diperbaiki → UPDATE → `fetchActivities()` → `if prospecting setConfirmProspect(row)` → `setDetail(null)` TERAKHIR (sebelumnya `setConfirmProspect` dipanggil sebelum `fetchActivities` & `setDetail`). ConfirmModal prospek `open={!!confirmProspect}` dikonfirmasi masih benar (tak berubah dari edit sebelumnya). Popup prospek (state `confirmProspect` terpisah dari `detail`) kini muncul saat "Tandai Selesai" type=prospecting dari modal. Build clean (2630 modules, 1.22s); lint ActivitiesPage 5→5 (net-zero baseline). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9J | **ActivitiesPage — fix footer modal: gate per-tombol (Hapus tampil di activity done/cancelled untuk super_admin).** Sebelumnya seluruh footer view-mode dikurung `{act.status === 'todo' && …}` → tombol Hapus (super_admin) & Batalkan tak muncul utk activity non-todo. Restruktur: wrapper jadi `{(act.status === 'todo' || isSuperAdmin) && …}` (render hanya jika minimal 1 tombol visible → tak ada bar kosong), tiap tombol gate sendiri: **Tandai Selesai** `{act.status === 'todo' && …}`, **Batalkan Aktivitas** `{act.status === 'todo' && canEdit && …}`, **Hapus** `{isSuperAdmin && …}` (apapun status, paling kiri `marginRight:auto`). Handler (handleCheck/handleCancelActivity/handleDeleteActivity) TIDAK diubah. Kasus: todo+non-super → Tandai Selesai(+Batalkan jk canEdit); done+super → hanya Hapus; done+non-super → footer tak render (no empty bar); cancelled+super → hanya Hapus. Build clean (2630 modules, 1.13s); lint ActivitiesPage 5→5 (net-zero). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9K | **ActivitiesPage — set tipe final (6) + convert-to-prospect jadi aksi list + delete list (super_admin).** **(1) Tipe (ActivitiesPage.jsx):** `TYPE_META`+`TYPE_FORM` hapus `prospecting`, jadi 6: call(biru)/whatsapp(hijau #2E7D4F)/visit(ungu)/meeting(navy)/email(amber)/followup(slate #51607A) — no dark green. `activities.type` TIDAK punya CHECK constraint (dikonfirmasi schema_snapshot) → whatsapp/email aman tanpa ubah DB. Field kondisional add+edit: contact_name/contact_phone utk `call|whatsapp`; details.location utk `visit|meeting`; email/followup → notes saja. **Field `prospect_name` dihapus dari form** (add+edit input, `EMPTY_TASK`, `actToDraft`, payload insert+update); legacy read (display DField/search/accountLabel/fetch-map) dipertahankan utk data lama. **(2) Hapus flow prospecting dari centang:** `handleCheck` blok `if(type==='prospecting') setConfirmProspect` DIHAPUS → centang selesai tak lagi munculkan popup prospek. **(3) Convert-to-Prospect = aksi LIST:** tombol icon `UserPlus` (tooltip "Jadikan Prospek") di kolom Aksi tiap row, muncul HANYA jika `!row.account_id` → buka ConfirmModal (reuse state `confirmProspect`, wording baru "Jadikan Prospek?" / "Buat prospek baru dari kontak aktivitas ini?") → [Ya] `openProspectFromActivity(row)`. Prefill diubah: `{ name: contact_name, pic_name: contact_name, pic_phone: contact_phone }` (activity tak punya nama perusahaan terpisah → pakai contact_name; ProspectFormPage tak wajibkan company-name terpisah, `name` required diisi user kalau contact kosong → tak perlu STOP). Activity TIDAK berubah saat convert (tak link balik). **(4) Delete list (super_admin):** tombol icon `Trash2` (danger) di kolom Aksi tiap row, muncul HANYA `erpRole==='super_admin'` (status apapun) → reuse `deleteConfirm` + ConfirmModal danger existing (2.9I) → `handleDeleteActivity(row.id)` soft delete. Import `UserPlus`,`Trash2`. Footer modal "Hapus" (2.9J) tetap ada (coexist). Build clean (2630 modules, 1.16s); lint ActivitiesPage 5→5 (net-zero baseline). **Belum: tes manual runtime + migrasi data lama `type='prospecting'` (lihat SQL Task 4 di bawah, BELUM dijalankan).** | ✅ Complete |

| 2.9L | **Unified activity feed + halaman Activity Log + lengkapi Recent Activity dashboard.** **(1) `src/modules/crm/activityFeed.js` (BARU, shared logic):** `fetchActivityFeed({companyId, uid, isAllEntities, isSalesOnly})` — merge 4 sumber jadi feed kronologis (newest first), tiap event shape `{ id, timestamp, type, actType, title, subtitle, user_id, user_name, icon }`. Sumber: accounts (`account_status='prospect'` → "Prospect baru"), inquiries ("Inquiry baru — {no} — {customer/prospect}"), quotations ("Quotation baru — {no} — …"), activities (label per tipe call/whatsapp/visit/meeting/email/followup). Scoping role-aware: `company_id` selalu kecuali `isAllEntities`; sales (`isSalesOnly`) → accounts/activities `or(assigned_to,created_by)`, inquiries/quotations `created_by`. Nama user via nameMap profiles (no FK, fetch tanpa active filter). Tiap sumber `.limit(1000)`, merge + sort desc client-side. Helper `feedTimeAgo`/`feedFmtDate`/`FEED_ACT_LABEL` di-export. **Icon Lucide per tipe** (UserPlus/FileText/FileCheck + Phone/MessageCircle/MapPin/Users/Mail/CornerUpRight). **⚠️ Embed FK names diverifikasi vs schema_snapshot.sql (byte-identik dgn list page live):** `inquiries_prospect_id_fkey`, `inquiries_customer_id_fkey`, `quotations_prospect_id_fkey`, `quotations_customer_id_fkey`, `activities_account_id_fkey` — semua FK pakai prefix tabel sendiri (BUKAN legacy `prospects_*`/`customers_*`). Tak pernah throw (sumber gagal → kosong). **(2) `src/modules/crm/ActivityLogPage.jsx` (BARU):** halaman feed penuh — `isAllEntities=erpRole==='super_admin'` (super cross-entity, lain company-scoped), `isSalesOnly` own-only. List newest-first (icon chip Lucide + title + subtitle + nama user + relatif "X lalu" + tanggal). Filter tipe (semua/prospect/inquiry/quotation/activity) + tanggal (today/this_week[ISO Senin]/this_month/custom/semua); manager+ → dropdown sales (`fetchSalesProfiles` RBAC copy lokal); sales → tanpa filter sales. Pagination client-side PAGE_SIZE 25. **(3) App.jsx:** lucide import +`History`; menu item BARU `{ id:'crm-activity-log', label:'Activity Log', icon:History }` PERSIS setelah `crm-calls` di grup CRM (item lain tak disentuh); **TIDAK** di MENU_KEY_MAP (pola crm-calls → semua role lihat, scoping via feed); lazy import + route block `activeMenu==='crm-activity-log'` (ErrorBoundary+Suspense). **(4) CRMDashboardPage.jsx (Task 3):** import `fetchActivityFeed`; `fetchDash` start `feedPromise = fetchActivityFeed({companyId:cid, uid, isAllEntities:false, isSalesOnly})` paralel (dashboard widget **SELALU single-entity** termasuk super_admin — konsisten fetchDash); `recentActivity` diganti `feedEvents.slice(0,7).map(→ {type,text,co,time,user})` (ganti dari prospects-only); `ACT_META` +key `activity`; subtitle RecentActivity (2×) → "Prospect, inquiry, quotation & aktivitas terbaru". Render widget tak berubah (sudah icon+title+subtitle+user+time via `type`→ACT_META). **DB tidak diubah (read-only).** Build clean (2632 modules, 1.33s); lint net-zero (activityFeed 0, ActivityLogPage 3 baseline set-state-in-effect, CRMDashboard 8→8, App 4→4). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9M | **Unified feed — sumber ke-5: login dari `user_login_logs`.** Tabel `user_login_logs` BARU (kolom id, user_id, session_id, logged_in_at, ip, user_agent, created_at; **belum masuk schema_snapshot.sql**; RLS sudah gating manager+/super_admin/own). **(1) activityFeed.js:** fetch ke-5 `from('user_login_logs').select('*').order('logged_in_at',desc).limit(1000)` — **TANPA filter company_id/owner** (tabel tak punya company_id; andelin RLS). Map → event `{ id:'login-'+id, timestamp:logged_in_at, type:'login', title:'Login', subtitle:nama user, user_id, user_name, icon:'LogIn' }`; subtitle diisi dari nameMap (di loop resolve, `user_name||'Pengguna'`); user_id login ikut koleksi nameMap. Tambah `login` ke `FEED_ACT_LABEL`('Login') + `FEED_ACT_ICON`('LogIn'). Merge+sort desc existing. **(2) ActivityLogPage.jsx:** filter tipe +opsi "Login"; `ICONS` +`LogIn` (import lucide); `TYPE_TONE.login` slate (`bg #EEF0F3`/`fg #51607A`, no dark green); render konsisten. **(3) CRMDashboardPage.jsx:** widget pakai feed sama → login auto ikut top-7; `ICONS` registry +SVG `login` (lucide log-in path) + `ACT_META.login` (icon 'login', slate) biar tak fallback ke info. **DB tak diubah.** **Scoping note (FYI, bukan bug):** widget dashboard (`isAllEntities:false`) untuk sumber login tetap andelin RLS → super_admin lihat login semua entitas (minor, hanya super_admin; tidak dipaksa single-entity). Login `select('*')` tanpa embed → tak ada risiko 400 FK. Build clean (2632 modules, 1.14s); lint net-zero (activityFeed 0, ActivityLogPage 3→3, CRMDashboard 8→8). **Belum: tes manual runtime.** | ✅ Complete |

| 2.9N | **CustomerListPage — fix "Menampilkan X dari Y" (Y per-entitas, bukan global).** Y dulu pakai `customers.length` (total global semua entitas) → halaman MSI/SOA sama-sama "X dari 5". Fix: turunan baru `entityCount` = jumlah customer yang lolos filter ENTITAS saja (mirror logika baris ~578: FREE_AGENT→`statusOf==='free_agent'`, MSI/JCI/SOA→`source_company.code===entityFilter`, no entityFilter→semua), SEBELUM filter search/tier/status; render `Menampilkan {total} dari {entityCount}`. X (`total=filtered.length`) TIDAK diubah; logika filter entitas TIDAK disentuh. Hanya CustomerListPage.jsx. Build clean (2632 modules, 1.14s). **Belum: tes manual runtime** (MSI "X dari 3", SOA "X dari 1", JCI "X dari 0"; X tetap berubah ikut search/tier/status). | ✅ Complete |

| 2.9O | **Quotation save hardening — RPC atomik + fix silent-fail + internal_notes + per-item notes + quote_date.** (Prasyarat DB sudah dibuat via SQL Editor, BELUM di snapshot: `quotations.internal_notes text`, `quotations.quote_date date`, RPC `public.save_quotation(p_quotation_id uuid, p_header jsonb, p_items jsonb)` atomik+RAISE-on-RLS, RLS `quotation_items` diperbaiki.) **QuotationDetailPage.jsx:** (1) detail `select` diperluas +`inquiry_id, prospect_id, customer_id, internal_notes, quote_date, currency_code, margin_floor` (form edit baca prop ini — tanpa ini RPC kirim null/default → nimpa data); (2) blok **"Catatan Internal (Sales)"** (`quot.internal_notes`) di on-screen detail, `className="no-print"` + **TIDAK** di `#quotation-print-area` → tak pernah ke PDF customer; (3) "Kirim ke Customer" `handleSendToCustomer` +`.select('id')` + cek `!data.length` → error asli (bukan sukses palsu). **QuotationFormPage.jsx:** (1) **EDIT path** ganti update→delete→insert terpisah jadi 1 `supabase.rpc('save_quotation',{p_quotation_id,p_header,p_items})`; `rpcError`→throw pesan asli. `p_header` keys match RPC (quotation_no/quote_date/inquiry_id/prospect_id/customer_id/service_type/valid_until/pricing_done_at/payment_terms_id/currency_code/notes/terms/internal_notes/subtotal/tax_amount/total_amount/status/usd_rate/route/discount_pct/margin_floor); **inquiry_id/prospect_id/customer_id kini IKUT** (dulu ketinggalan); prospect/customer **fallback ke prop** `quotation.*` kalau user tak ganti inquiry (selectedInquiry null saat edit); **internal_notes/currency_code/margin_floor dibaca dari prop real** (bukan default form '' /0/'IDR') biar tak nimpa. `p_items`=`baseItemRows()` (tanpa quotation_id). (2) **CREATE path** tetap insert tapi +`.select('id').single()` + guard `!quot?.id`→error asli; items map `+quotation_id`; +`quote_date`/`internal_notes` di payload. (3) **quote_date** ganti field-hantu `tanggal` (state+init dari `quote_date||created_at`+input bind `setH('quote_date')`); field tak-persist lama dihapus. (4) **internal_notes** textarea "Catatan Internal (Sales)" di form (after Terms, gaya merah). (5) **Per-item notes** (kolom `quotation_items.notes` yg dulu orphaned) → input baris-expand (`<Fragment>`+`<tr colSpan=8>` di bawah tiap item, BUKAN kolom ke-9 → tabel tak melebar), kebawa ke `p_items`; tetap customer-facing (sudah render di PDF). Hanya 2 file + docs. Build clean (2632 modules, 1.18s); lint net-zero (QuotationFormPage 4→4, QuotationDetailPage 1→1, semua pre-existing baseline). **Belum: tes manual runtime + refresh schema_snapshot** (kolom+RPC baru belum ke-pull). | ✅ Complete |

| 2.9P | **Quotation line item — QTY tanpa spinner + izinkan desimal; HAPUS per-item notes (input + tampilan).** 2 file (`QuotationFormPage.jsx` + `QuotationDetailPage.jsx`), tanpa sentuh DB/RPC. **TASK 1 (QTY):** input QTY di `SectionCard` → `min="1"`→`min="0"`, `step="any"` (hilangkan warning browser "valid values are 4 and 5" → qty desimal mis. 4.1 valid), `className="qty-input"`. Spinner panah dihilangkan via CSS di `<style>` tag existing (line ~599, gabung dgn `.no-print`): `.qty-input::-webkit-(inner|outer)-spin-button { -webkit-appearance:none; margin:0 }` + `.qty-input { -moz-appearance:textfield }` — **scoped ke class `.qty-input`** (TIDAK ngefek input number lain spt cost_price/unit_price). Logika `calcRowTotal`/subtotal TIDAK diubah (regex strip leading-zero `^0+(?=\d)` aman utk desimal). **TASK 2 (hapus per-item notes — kebalikan 2.9O poin 5):** (a) `QuotationFormPage`: hapus `<tr colSpan=8>` input "Catatan item" + collapse `<Fragment>` jadi `<tr key={row.id} borderBottom>` (border pindah ke main row, tak ninggalin baris kosong); hapus import `Fragment` (jadi unused); hapus field `notes` dari `freshRow`, dari rekonstruksi edit-mode, dan dari `baseItemRows()` payload → form **tak lagi kirim** `notes` per item (RPC insert null, aman — kolom `quotation_items.notes` dibiarkan ada). (b) `QuotationDetailPage`: hapus render `row.notes` di tabel detail on-screen DAN di `#quotation-print-area` (PDF customer). **TIDAK disentuh:** header `notes` (per-quotation) & `internal_notes` (sales-only) — keduanya tetap jalan; DB & RPC `save_quotation` apa adanya. Select query masih sertakan kolom `notes` (harmless, tak dirender). Build clean (2632 modules, 1.0s). **Belum: tes manual runtime** (QTY tanpa panah + 4.1 tanpa warning + total bener; baris item tanpa field notes; PDF customer tanpa notes per item, header notes muncul, internal notes tetap tak muncul di PDF). | ✅ Complete |

| 2.9Q | **Quotation line item — tabel full-width (form) + alignment kolom konsisten + header row coral.** MURNI layout/styling, 2 file (`QuotationFormPage.jsx` + `QuotationDetailPage.jsx`), tanpa sentuh DB/RPC/perhitungan. **TASK 1 (full-width, FORM saja):** layout `.nx-stack` (1 baris: kiri 60% header+sections+button, kanan 40% summary sticky) di-restruktur jadi **2 baris** — Baris 1 `.nx-stack` (kiri 60% header card [notes/terms/internal notes], kanan 40% summary sticky) TIDAK berubah; **Baris 2 (baru, di bawah `.nx-stack`)** = `sections.map(SectionCard)` + tombol "Tambah Section" full-width. Responsive aman: `.nx-stack` sudah collapse ke column+full-width+unsticky di `<1024px` (index.css:44), Baris 2 natural full-width di desktop & stack di bawah header/summary di mobile (drawer/ModuleSidebar/`flex-col lg:flex-row` tak disentuh). **Tradeoff disepakati (opsi "two-row, summary on top"):** summary sticky kini di Baris 1 → scroll lewat saat masuk dalam tabel (tiap SectionCard tetap punya "Section total"; grand total di atas). **TASK 2 (alignment, KEDUA file on-screen):** header `<th>` + cell diset: Description=left · Cost Price=right · Currency=center · Sell Price=right · Unit Label=center · Qty=center · Total IDR=right (header ikut alignment isinya). Form: qty input right→center, select currency/unit +`textAlign:'center'`; Detail: header cost left→right, currency/unit header+cell →center. **TASK 3 (header coral, KEDUA file on-screen):** baris header kolom `background:'#F08C7D'` (coral) + teks `color:'#144682'` (navy, kontras kebaca — bukan cream/putih). Bar judul section ("ORIGIN CHARGES", cream) TIDAK diubah. **PDF `#quotation-print-area` TIDAK disentuh** (opsi "on-screen only" — dokumen customer tetap brand navy, tak ada kolom Cost Price). Angka/total/subtotal/margin/grand total tak berubah (cuma posisi). Build clean (2632 modules, 1.22s). **Belum: tes manual runtime** (form tabel full-width di desktop + rapih di mobile; alignment sesuai spec & sama di form+detail; header coral+navy kebaca; angka tak berubah). | ✅ Complete |

| 2.9R | **Quotation mobile fix — list scroll horizontal + box tabel item (form) muat konten.** MURNI mobile styling (`@media max-width:1023px`, DESKTOP pixel-identik), 2 file (`QuotationListPage.jsx` + `QuotationFormPage.jsx`), tanpa DB/perhitungan/alignment/header-coral. **TASK 1 (QuotationListPage):** tabel di card `overflow:hidden` ke-clip di mobile (kolom Service kanan tak terjangkau). Fix: tambah `<style>` tag in-component (pola sama QuotationFormPage) `@media(max-width:1023px){ .q-list-table{ min-width:920px } }`; bungkus `<table>` dgn `<div style={{overflowX:'auto'}}>` + className `q-list-table`. Desktop: `@media` mobile-only + table `width:100%` → tak terpengaruh (pixel-identik). **TASK 2 (QuotationFormPage SectionCard):** UNIT LABEL ("Per CBM"/"Per Shipment") & QTY desimal ("4,1") ke-clip karena kolom nge-squeeze. Fix di `<style>` tag existing, blok `@media(max-width:1023px)` baru: `.q-item-table{ min-width:800px }` (tabel tak squeeze → wrapper `overflowX:auto` [sudah ada] scroll), `.q-unit-select{ appearance:none (+webkit/moz) ; min-width:116px }` (panah dropdown hilang HANYA di mobile → reclaim ruang, select tetap tappable buka native picker), `.qty-input{ min-width:54px }` ("4,1" muat). Tambah className `q-item-table` ke `<table>`, `q-unit-select` ke select unit (qty input sudah `qty-input` dari 2.9P). Semua min-width ≤ lebar kolom desktop + `@media` mobile-only → DESKTOP tak berubah (full-width 2.9Q, alignment, header coral, panah unit desktop tetap ada). Build clean (2632 modules, 1.19s). **Belum: tes manual runtime mobile** (list geser samping → Service kebaca penuh; form "Per CBM"/"Per Shipment" muat + qty "4,1" lengkap + panah unit hilang + tabel scroll horizontal; desktop tak berubah). | ✅ Complete |

| 2.9S | **Struktur Organisasi (Org Chart) — port desain Lovable + sambung Supabase (modul Foundation).** File baru `src/modules/foundation/OrgStructurePage.jsx` (port handoff Claude Design `OrgChartPage.jsx` via Option A — paste manual, MCP `claude_design` tak bisa auth di sesi token-pinned `CLAUDE_CODE_OAUTH_TOKEN`). Top-down vertical tree dari `profiles.reports_to` (kolom + index `idx_profiles_reports_to` + FK `profiles_reports_to_fkey→profiles(id)` dikonfirmasi ada di snapshot). **Data (ganti dummy → Supabase):** fetch `profiles` `.eq('active', true)` (profiles TAK punya `deleted_at` → pakai `active`, per CLAUDE.md) embed `position:positions(name)` (FK `fk_profiles_position_id`) + `department:departments(name)` (FK `profiles_department_id_fkey`) + `reports_to` + `company_id`; `.order('full_name').limit(1000)`. **company_id per spec dari `user_roles`** (query terpisah krn `user_roles.user_id→auth.users`, BUKAN profiles → tak bisa embed): `.in('user_id', ids).eq('is_active',true).is('revoked_at',null).order('granted_at')`, ambil **pertama** per user; **fallback ke `profiles.company_id`** kalau tak ada role aktif terlihat (RLS `user_roles_read` batasi non-super ke company sendiri — fallback jaga node tetap berwarna). **Warna node by company_id (brand):** MSI `0e1840d8…492`→navy #144682, JCI `42569e7c…c455b`→orange #E85A1E, SOA `d2e5e565…697`→coral #F08C7D (badge + avatar + border-left + focus ring); unknown→abu fallback. **Edit modal "Atur Atasan":** `supabase.from('profiles').update({ reports_to: value }).eq('id', nodeId)`, value null = root; cycle-guard (`subtreeIds` exclude self+descendants dari opsi); async save + `saving`/`saveError` state + **re-fetch tree** setelah sukses. **Adaptasi shell:** desain `height:100vh` → `calc(100vh-120px)` card (AdminShell render normal-flow, bukan full-screen) + toolbar flex:0 + chart `overflow:auto` (scroll H+V internal); loading/error(+retry)/empty/no-root states ditambah (desain tak punya). **Brand/ikon:** company colors sudah PERSIS brand (navy/orange/coral), primary btn navy, font Montserrat/Inter (sudah di desain); emoji/glyph `×` + inline SVG search → **Lucide** `X`/`Search`; select chevron tetap CSS data-URI (SVG, bukan emoji); no dark green. CSS connector pseudo-element di `<style>` scoped `.ocp`. **Sidebar:** `AdminShell.jsx` import `GitBranch` + `OrgStructurePage`; nav item `{ id:'org-structure', label:'Struktur Organisasi', icon:GitBranch }` SETELAH Positions di section Organization; PAGE_MAP entry (ErrorBoundary). Hanya 2 file (page baru + AdminShell). Build clean (2633 modules, 1.21s). **Belum: tes manual runtime** (tree render dari data nyata; warna per entitas; search dim/highlight; klik node → modal → ganti atasan → save → tree re-fetch & re-parent; set "tanpa atasan" → jadi root). **Catatan RLS:** non-super admin → embed positions/departments lintas-entitas bisa null (tampil "—") & company_id sebagian dari fallback profiles; idealnya dilihat super_admin untuk org grup penuh. | ✅ Complete |

Current phase: **Phase 2.9S** ✅ Complete

> **⚠️ DB — migrasi data lama `activities.type='prospecting'` (Phase 2.9K — JALANKAN MANUAL, belum dieksekusi):**
> ```sql
> -- Cek jumlah dulu:
> SELECT count(*) FROM activities WHERE type = 'prospecting';
> -- Pilih SALAH SATU migrasi (prospecting bukan lagi tipe valid di UI):
> UPDATE activities SET type = 'whatsapp' WHERE type = 'prospecting';   -- opsi A
> UPDATE activities SET type = 'followup' WHERE type = 'prospecting';   -- opsi B
> ```
> Sampai dimigrasi, row lama `type='prospecting'` → badge `TYPE_META['prospecting']` undefined → tampil "—" di list/modal (tidak crash; `Badge meta=undefined` fallback).

---

## Security Hardening — 15 Jun 2026

> Defense-in-depth: cabut akses `anon` di tabel sensitif. RLS tetap lapisan kedua.

**Dikerjakan (DB — sudah dieksekusi):**
- `REVOKE` privilege `anon` di **29 tabel sensitif**:
  - **3 tabel finansial:** `accounts`, `quotations`, `quotation_items`
  - **26 tabel:** finance / RBAC / user / CRM / inventory
- RLS tetap aktif → anon ke-block di **dua lapis** (level GRANT **dan** RLS).
- GRANT `authenticated` diverifikasi **lengkap sebelum** revoke → app tidak putus.

**Belum dicabut (backlog kebersihan, tidak urgent):**
- Tabel kategori **REFERENCES / TRIGGER / TRUNCATE only** (`companies`, `payment_terms`, `assets`, dll) — privilege ini tidak memberi akses baca/tulis data, jadi bukan risiko eksposur. Masuk backlog.

---

## Master Data & Schema Changes via SQL Editor — 16 Jun 2026

> Perubahan DB dijalankan via Supabase SQL Editor — **BELUM ter-pull ke file migrasi**.
> 2× jadi penghambat hari ini (4 kolom `assets` baru + `products.unit_cost` tak terlihat
> Claude Code di file migrasi → sempat skip field) → mempertegas urgensi `supabase db pull` (Roadmap 🔴).

**Schema (DDL):**
- `assets` ALTER ADD: `condition` varchar, `department_id` uuid (FK → `departments`), `brand` varchar, `assignment_status` varchar DEFAULT 'available'.

**Master data (seed):**
- `asset_locations`: "Head Office BSD" (`341d9dda-9ef1-48ad-b59d-51ae7f35941a`), `branch_id` = MSI HO (`ef2594db…`). Catatan: `asset_locations.branch_id` **NOT NULL**.
- `departments` MSI: 3 baru — HCGA (`a4d59e17…`), PPJK (`cb4f6190…`), CONSOLE (`9c7fb915…`).
- `assets`: bulk insert **24 laptop MSI** (IT-EQP) + baris terkait di `asset_specifications` + `asset_network`; `assigned_to` kosong (di-update setelah re-audit), `assignment_status` all 'available'.

**Check constraints `assets`/`asset_specifications` (referensi insert/edit — value PERSIS):**
- `asset_subtype`: `laptop`, `desktop`, `server`, `printer`, `network`, `peripheral`, `other` (lowercase)
- `storage_type`: `SSD`, `HDD`, `NVMe`, `eMMC`, `other`
- `status`: `active`, `disposed`, `in_repair`, `retired`, `transferred`
- `depreciation_method`: `straight_line`, `double_declining`, `none`
- `condition` & `ram_type` → **tidak ada CHECK** (free text).

---

## DB Changes via SQL Editor — 17 Jun 2026

> Perubahan DB dijalankan via Supabase SQL Editor. **Sudah masuk `supabase/schema_snapshot.sql`** (di-refresh 17 Jun → **71 tabel, ~8.395 baris**). Belum ter-pull ke file migrasi formal.

### 1. WON → customer — fix konversi (trigger DB = sumber kebenaran tunggal)

**Masalah (hasil audit, lihat `CRM_FLOW.md`):** deal yang pindah ke `pipeline_stage='WON'` **tidak selalu** jadi `account_status='customer'`. Konversi cuma jalan di **satu jalur** (drag Kanban → `WinLossModal` → `handleWinLossSave`, [PipelineKanbanPage.jsx:561-568](src/modules/crm/PipelineKanbanPage.jsx#L561)). Jalur **edit form manual** ([ProspectFormPage.jsx:320-323](src/modules/crm/ProspectFormPage.jsx#L320)) & **import/seed** TIDAK mengkonversi → muncul account `pipeline_stage='WON'` tapi `account_status='prospect'` (gejala nyata: TOKO DAMRAH, `created_by` null = jejak import).

**Fix DB (2 langkah):**
1. **Backfill:** semua account `pipeline_stage='WON' AND account_status<>'customer'` di-set `account_status='customer'` + stamp `became_customer_at`/`converted_at`.
2. **Trigger `trg_set_customer_on_won`** — `BEFORE INSERT OR UPDATE ON public.accounts FOR EACH ROW` (snapshot baris 4999), function `public.set_customer_on_won()` (baris 356):
   ```sql
   IF NEW.pipeline_stage = 'WON' AND COALESCE(NEW.account_status,'') <> 'customer' THEN
     NEW.account_status     := 'customer';
     NEW.became_customer_at := COALESCE(NEW.became_customer_at, now());
     NEW.converted_at       := COALESCE(NEW.converted_at, now());
   END IF;
   ```

**Dampak:** trigger menutup **SEMUA jalur** (drag, edit form, import, RPC apa pun) → DB jadi **sumber kebenaran tunggal** untuk konversi WON→customer. Logika frontend di `WinLossModal`/`PipelineKanban` jadi redundan (tidak salah, hanya tak lagi satu-satunya) — tetap dibiarkan, tidak perlu dicabut. `set_customer_on_won` ber-LANGUAGE plpgsql, **bukan** SECURITY DEFINER (jalan dalam konteks user, aman karena hanya menulis kolom di NEW row yang sama).

### 2. Tabel `public.activities` — Phase 1 modul Activity/Task

Tabel baru yang **menyatukan & akan menggantikan** `sales_calls` + `sales_visits`. Anchor lengkap ke seluruh CRM (menjawab titik-putus di `CRM_FLOW.md`: aktivitas kini bisa nempel ke account/inquiry/quotation, bukan cuma `prospect_id` opsional).

**Struktur (snapshot — CREATE TABLE public.activities):**
- **Anchor (semua FK ada):** `account_id` → accounts (`activities_account_id_fkey`, baris 5042), `inquiry_id` → inquiries (5058), `quotation_id` → quotations (5066), `company_id` → companies (5050), `assigned_to`/`created_by` (profiles).
- **Multi-tipe:** `type text NOT NULL` (call / visit / meeting / prospecting / followup), `status text DEFAULT 'todo'` (todo / done / cancelled).
- **Jadwal:** `scheduled_for date`, `activity_time time`, `completed_at`.
- **Konten:** `prospect_name`, `contact_name`, `contact_phone`, `outcome`, `notes`, `next_action`, `next_action_date`.
- **`details jsonb DEFAULT '{}'`** — data khas per tipe (mis. `duration_minutes`/`bant_collected` utk call; `point_of_meeting`/`mom`/`follow_up` utk visit).
- **`migrated_from text`** — jejak asal data lama (`sales_calls`/`sales_visits`).
- Standard: `created_at`/`updated_at`/`deleted_at`.
- **Index:** account, assigned, company, scheduled_for, status, type (baris 3890-3928).
- **RLS role-aware** (niru `accounts`): SELECT/UPDATE/DELETE = `company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to = auth.uid() OR created_by = auth.uid()) OR is_super_admin()`; INSERT = `company_id = get_user_company_id() OR is_super_admin()` (baris 6658-6682).

**Migrasi data lama:** 0 `sales_calls` + 2 `sales_visits` → dipindah ke `activities` (`migrated_from` di-set).

**⚠️ `sales_calls` & `sales_visits` DIBIARKAN DORMANT (belum di-drop).** Frontend (`SalesCallsPage`, `CRMDashboardPage` AddVisitModal) **masih** menulis/membaca ke tabel lama. Penggantian → lihat **Backlog**.

### 3. Tabel `public.activity_logs` — audit log status untuk `activities`

Tabel baru: audit trail perubahan status untuk row `activities` (padanan `sales_visit_logs` di model lama). **Menggantikan `sales_visit_logs`.**

**Struktur (snapshot — CREATE TABLE public.activity_logs):**
- `id`, `activity_id uuid NOT NULL` → activities(id) **ON DELETE CASCADE** (`activity_logs_activity_id_fkey`, snapshot baris 5104), `changed_by uuid`, `changed_at timestamptz DEFAULT now()`, `from_status text`, `to_status text`, `notes text`.
- **Index:** `idx_activity_logs_activity` (activity_id, baris 3958).
- **RLS scope via parent activity** (bukan `company_id` langsung): SELECT/INSERT/UPDATE/DELETE pakai `EXISTS (SELECT 1 FROM activities ... )` — hak akses log mengikuti hak akses activity induknya (baris 6730-6760).

**Migrasi data lama:** 2 row `sales_visit_logs` → dipindah ke `activity_logs`.

**⚠️ `sales_visit_logs` DIBIARKAN DORMANT (belum di-drop).** `CRMDashboardPage` VisitDetailModal masih baca/tulis tabel lama ([CRMDashboardPage.jsx:1006](src/modules/crm/CRMDashboardPage.jsx#L1006) read, [:1795](src/modules/crm/CRMDashboardPage.jsx#L1795) write). Drop bareng `sales_calls`/`sales_visits` setelah frontend dipindah → **Backlog**.

---

## DB Schema Reference

> **Sumber kebenaran terkini untuk struktur DB = `supabase/schema_snapshot.sql`** (bukan file migrasi).

**File:** `supabase/schema_snapshot.sql` — full schema dump (`pg_dump --schema-only --schema=public`), **71 tabel, ~8.395 baris** (refresh 17 Jun), merefleksikan kondisi DB **ASLI per 17 Jun 2026**, termasuk SEMUA perubahan via SQL Editor yang TIDAK masuk file migrasi: 4 kolom `assets` baru (`condition`/`department_id`/`brand`/`assignment_status`), `accounts` unified (master customer tunggal), RBAC 6 tabel (`modules`/`module_menus`/`module_actions`/`menu_actions`/`user_menu_permissions`/dst.), RLS `quotations`, **trigger `trg_set_customer_on_won` + tabel baru `activities` & `activity_logs`** (lihat **DB Changes via SQL Editor — 17 Jun 2026**), dll.

**⚠️ INSTRUKSI WAJIB (sesi mendatang):** untuk struktur tabel/kolom/constraint yang **AKURAT**, baca **`supabase/schema_snapshot.sql`** — **JANGAN hanya mengandalkan `supabase/migrations/`**. File migrasi **BERHENTI 3 Jun 2026** (`...026_assets_kendaraan.sql`) dan TIDAK mencakup perubahan SQL-Editor 4–17 Jun → ini sudah **2× menyebabkan salah-baca schema** (skip 4 kolom `assets` baru, salah baca `products.unit_cost`). Migrasi lama tetap valid untuk **histori**, tapi **snapshot = sumber kebenaran struktur terkini**.

**Refresh snapshot (untuk update ke depan):**
```bash
pg_dump "postgresql://postgres.untmpqceexwxzuhlmyrg@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" \
  --schema-only --schema=public --no-owner --no-privileges \
  > supabase/schema_snapshot.sql
```
Pakai `pg_dump` dari libpq (butuh DB password, di-prompt / via `PGPASSWORD`). **Docker TIDAK diperlukan** — `supabase db pull` butuh Docker yang belum terinstall, jadi pakai `pg_dump` langsung.

---

## Roadmap Menuju Production-Grade (hasil audit 15 Jun 2026)

> Dari audit menyeluruh aplikasi (arsitektur / keamanan / maintainability / reliability / performance), 15 Jun 2026. Dikelompokkan 3 tier; `[x]` = selesai.

### 🔴 SEGERA (keamanan & integritas data)
- [x] Cabut akses `anon` tabel sensitif (29 tabel) — lihat **Security Hardening — 15 Jun 2026** (Phase 2.8L)
- [x] **Schema ke version control (via `pg_dump` snapshot, 17 Jun)** — `supabase/schema_snapshot.sql` (full dump, **69 tabel**) jadi sumber kebenaran struktur terkini; mencakup ~18+ tabel & kolom yg sebelumnya cuma di SQL Editor (4 kolom `assets` baru [condition/department_id/brand/assignment_status], `accounts` unified, RBAC, **`products.unit_cost`**, dll). Pakai `pg_dump` langsung — bukan `supabase db pull` (Docker belum terinstall). Lihat **DB Schema Reference**. _(Pending: jadikan migrasi formal kalau Docker tersedia.)_
- [ ] Audit **CRUD policy lintas tabel** — pola BERULANG: (a) "UPDATE admin-only" nyangkut owner-edit (`quotations_update` → fixed Phase 2.8Q), (b) over-filter `account_status` (dashboard/visit dropdown/visibility). Sisir `.from('accounts').eq('account_status', …)` + policy UPDATE/DELETE **semua tabel** (DELETE: hanya ~4 dari ~50 punya — `quotation_items` fixed Phase 2.8J)
- [ ] **Migrasi RLS proper (RBAC-driven)** — RLS pakai cek role hardcode (`is_admin_or_above()`, ~51 policy) yg tak sinkron RBAC granular UI & tak kenal sebagian role (mis. `ceo` → memicu Phase 2.8Y CEO unblock); `has_permission()` BROKEN. **BESAR + risiko tinggi, eksekusi sesi fresh, prasyarat HRIS** — detail & rencana 4 fase di section **Backlog — Migrasi RLS Proper (RBAC-driven)**
- [ ] Write quotation **atomik** (bungkus update→delete→insert ke RPC transaksi tunggal)

### 🟡 JANGKA PENDEK
- [ ] Setup **Vitest + RTL** (mulai dari util murni: `spCalc`, `bant`, format)
- [ ] Pasang **Sentry** + ErrorBoundary report
- [ ] Implement **`audit_logs` + `logAudit()`** (AGENTS.md wajibkan 19 event; saat ini 0 call di kode)
- [ ] Total quotation via **DB trigger** (hapus ketergantungan hitung di frontend)
- [ ] `.single()` → `.maybeSingle()` di tempat bisa 0-row
- [ ] Tambah `.limit()` ke **~97 query** tanpa limit
- [ ] Refactor **LOW-risk App.jsx**: ekstrak `PASTEL`→`lib/tokens.js`, `ENTITY_IDS`→`config/entities.js`, helper `isSuperAdmin()`; hapus **1.206 baris dead code** (`*.legacy.jsx`)
- [ ] Ganti **5 hijau terlarang** + emoji UI ke token brand + ikon Lucide
- [x] **Modul Activity/Task — repoint frontend `sales_calls`/`sales_visits`/`sales_visit_logs` → `activities`/`activity_logs`** — **DONE Phase 2.9D** (cutover data-layer, 0 ref tabel lama di `src/` luar `*.legacy`). SalesCallsPage + CRMDashboard (kalender/visit/log/KPI) + CustomerDetail history/health semua baca-tulis `activities`/`activity_logs`. Anchor `inquiry_id`/`quotation_id` belum dipakai UI (tersedia utk fitur lanjutan, bukan kebutuhan cutover).
- [ ] **Drop `sales_calls` + `sales_visits` + `sales_visit_logs`** — frontend SUDAH dipindah (2.9D); tinggal **verifikasi manual runtime** (lihat checklist di PROGRESS.md) lalu drop. Data lama sudah dimigrasi (`migrated_from` di activities, 2 log di activity_logs). Saat ini DORMANT, jangan drop sebelum verifikasi.

### 🟢 JANGKA PANJANG
- [ ] Pecah **`App.jsx`** (4.667 baris god-file) — **SETELAH ada test**. Urutan aman: konstanta → komponen presentasional → modul Storbit → layout → registry routing
- [ ] Pecah file **>1.000 baris** (`CRMDashboardPage` 1.996, `AssetDetailITPage`, `SalesOrderDetailPage`)
- [ ] Ekstrak shared: `useRoleScopedQuery`, `DataTablePage`, `Badge`, `Modal`, `lib/format.js`
- [ ] Satukan paradigma styling (**75 inline vs 50 Tailwind**)
- [ ] **Field Registry Level 1** (custom field via JSONB — nunggu keputusan desain: struktur metadata, field core 2a/2b, pilot form)
- [ ] **CI pipeline** (build + lint + test gate sebelum deploy `main`)

---

## Status Nggantung (per 17 Jun 2026)

- **Migrasi RLS proper (RBAC-driven) — BESAR, risiko tinggi:** RLS role hardcode tak sinkron RBAC; `has_permission()` broken; prasyarat HRIS. Eksekusi **sesi fresh** — lihat section **Backlog — Migrasi RLS Proper (RBAC-driven)**.
- **CEO unblock review (Phase 2.8Y):** `profiles_read` di-set `USING(true)` agar CEO bisa baca `profiles`. Aman sekarang (bukan HRIS), tapi **WAJIB diperketat ulang saat modul HRIS masuk** (data pribadi/gaji).
- **Modul Activity/Task — frontend SUDAH cutover ke `activities`/`activity_logs` (Phase 2.9D):** SalesCallsPage + CRMDashboard (kalender/visit/log/KPI) + CustomerDetail history/health semua pakai tabel baru; build clean, 0 ref tabel lama di `src/`. **Tinggal: verifikasi manual runtime** (log call baru, tambah visit+timeline, history customer, dropdown sales se-entitas, KPI angka) lalu **drop `sales_calls`/`sales_visits`/`sales_visit_logs`** (masih DORMANT). ⚠️ **Catatan #3 dropdown:** default salesperson = user login sengaja dibiarkan — kalau user login bukan role `sales`, dropdown (sales-only) tak memuat dirinya → tampil kosong sampai dipilih (bukan bug cutover, perilaku default lama dipertahankan). Inventory UI di `ACTIVITY_UI_MAP.md`.
- **WON→customer sekarang dijamin DB (Phase 2.9B):** trigger `trg_set_customer_on_won` menutup semua jalur → tak perlu lagi andalkan `WinLossModal` (frontend redundan, dibiarkan). Backfill sudah jalan untuk record lama yang stuck (mis. TOKO DAMRAH).
- **Mobile polish — verifikasi visual per-halaman:** util responsive (2.8T) + nav drawer (2.8U) sudah diterapkan, tapi halaman selain CRM Dashboard (Inventory / Asset / Logistics / Quotation) **belum dicek satu-satu di mobile** → backlog: sisir visual tiap halaman di <1024px.
- **Warning React minor:** beberapa input read-only tampil "form field value without onChange handler" (terpisah dari responsive) — bisa dibersihkan (tambah `readOnly` atau `onChange` no-op).
- **24 laptop MSI — `assigned_to` kosong:** di-update setelah re-audit (bulk insert 2.8R sengaja tanpa assignee, `assignment_status` all 'available').
- **Office "Semper" — 2 branch duplikat di JCI** (`SEMPER` + `HO SEMP`): **BUKAN sampah, office asli MSI Group** (hampir salah hapus) → perlu **dedup + tentukan ownership** entitas.
- **Inline edit tab Software & Lisensi + Maintenance (AssetDetailITPage):** sengaja di-skip (list multi-row, edit per-row terpisah) — ada `TODO(asset-edit)` comment di kode.
- **UI list Asset:** pastikan menampilkan field baru (`condition`, `brand`, `department`, `assignment_status`) bila belum.
- **Quotation Hisaka (`QUO/MSI/2026/004`):** items sudah di-wipe bersih, total di-reset 0 → **PERLU input ulang via UI**.
- **Field Registry Level 1:** disepakati, nunggu **4 keputusan desain** (struktur metadata, field core 2a/2b, custom field JSONB, pilot form Prospect).
- **Tabel kategori A (REFERENCES/TRIGGER/TRUNCATE only):** backlog cabut `anon` untuk kebersihan (tidak urgent — lihat Security Hardening).

---

## Backlog — Migrasi RLS Proper (RBAC-driven) — direncanakan 17 Jun 2026

> Item **BESAR & berisiko tinggi**. **Eksekusi harus sesi fresh** (jangan disambi). Disiapkan sebagai prasyarat modul **HRIS**.

**Masalah:** RLS saat ini pakai cek role **hardcode** (mis. `is_admin_or_above()`), TIDAK sinkron dengan RBAC granular yang dipakai UI (modules → menus → actions → `user_menu_permissions`). Fungsi role-check juga tak kenal sebagian role — mis. `ceo` ke-block baca `profiles` (lihat Phase 2.8Y CEO unblock).

**Audit policy (173 total):**
- **~51** pakai `is_admin_or_above()` → **target migrasi utama**.
- **70** pakai `super_admin` (bypass top-level — OK, dipertahankan).
- **130** pakai `company_id` (entity scope — OK, dipertahankan).
- Fungsi `has_permission()` **BROKEN** — query tabel `permissions`/`role_permissions` yang TIDAK ADA di DB sekarang.

**Struktur cross-entity sudah ada:** kolom `is_cross_entity` di `role_permission_templates` & `user_menu_permissions`.

**Rencana 4 fase** (level enforcement = **entity boundary + RBAC-driven**):
1. Perbaiki/relink `has_permission()` ke tabel RBAC yang benar (atau fungsi baru yang baca `user_menu_permissions`).
2. Ganti `is_admin_or_above()` (~51 policy) → cek RBAC granular + entity boundary.
3. Verifikasi cross-entity (`is_cross_entity`) per role/menu.
4. Test lintas role (super/ceo/gm/manager/sales/finance/hrga) sebelum staging → produksi.

**Pemicu nyata:** CEO ke-block baca `profiles` (Phase 2.8Y), dan pola berulang "UPDATE admin-only nyangkut owner-edit" (Phase 2.8Q `quotations_update`).

---

## Asset Management — Deep Audit (15 Jun 2026, audit-only, 0 file diubah)

Audit modul `src/modules/assets/` + hook `src/hooks/useAssets.js` vs DB.

### FILES AUDIT
| File | Status | Tabel / sumber |
|------|--------|----------------|
| `hooks/useAssets.js` | ✅ Supabase | `assets` (+join `companies`,`asset_locations`,`asset_categories`), `asset_categories`, `asset_specifications`, `asset_network`, `asset_software_licenses`, `asset_maintenance_records`, `asset_fuel_logs`. 4 hook: useITAssets (list paginated), useAssetDetail, useFuelLogs, useITAssetDetail. Query rapi (deleted_at IS NULL, no SELECT *, graceful 42P01). |
| `AssetShell.jsx` | ✅ Router | Routing only; non-implemented page → `<ComingSoon>` stub. |
| `AssetITPage.jsx` | ✅ Supabase | `useITAssets({ categoryCode })` — dipakai utk **IT-EQP / VEH / FURN / BLDG** (4 list page generik). Real data, server pagination, filter, search debounce. |
| `AssetDetailPage.jsx` | ⚠️ Partial | `useAssetDetail`+`useFuelLogs`. Tab **Info Dasar** & **BBM** = real. Tab **Dokumen/Maintenance/Rute/History** = placeholder ("akan tampil setelah modul … diimplementasi"). IT-EQP didelegasikan ke AssetDetailITPage. Tab spec/network/software di file ini = dead-code placeholder (tak terjangkau krn IT delegate). |
| `AssetDetailITPage.jsx` | ✅ Supabase | `useITAssetDetail` — specs/network/software/maintenance semua real; Health Score dihitung client-side dari data real. |
| `AssetDashboardPage.jsx` | ✅ Supabase (Phase 2.7B) | `assets` + `asset_categories` (aggregate client-side). Dulu 100% dummy → sekarang real. |

### TABEL MISSING (dibutuhkan UI, BELUM ada di DB)
1. **`asset_documents`** (+ expiry) — KRITIS. Dipakai: tab Dokumen (STNK/BPKB/KIR/Asuransi di AssetDetailPage), sidebar `assets-docs`/`assets-expiring`/`assets-expired`, dashboard expiry chart + tabel. Semua placeholder/dummy krn tak ada tabel.
2. **`asset_work_orders`** — sidebar `assets-workorders` + dashboard "6 work order aktif" (badge dummy).
3. **`asset_routes`/`asset_trips`** — tab Rute kendaraan (placeholder).
   (Vendor & Supplier: tabel global `vendors` SUDAH ADA (migration 009) tapi belum ada page/link aset; `asset_categories` & `asset_locations` SUDAH ADA tapi belum ada management page.)

### FIELD MISMATCHES
**TIDAK ADA.** Semua kolom yg di-query terverifikasi ada di DB: `assets` (012 base + 025 IT cols: asset_code/serial_number/model/asset_subtype/assigned_to_name/vendor_name/purchase_invoice_no + 026 vehicle cols: plate_number/color/manufacture_year/fuel_type/vin/engine_number/km_odometer), serta kolom eksplisit di software_licenses/maintenance_records/fuel_logs/specifications/network semua cocok. Hook pakai graceful 42P01 → tabel absen tidak crash.

### DUMMY DATA INVENTORY (semua di `AssetDashboardPage.jsx`)
- StatCards baris 1: Total Kendaraan `64`, IT `128`, Furniture `212`, Properti `18` (hardcoded).
- StatCards baris 2: Total Aktif `384`, Dalam Maintenance `21`, Dokumen Expired `4`, Disposed `13`.
- `DonutChart` — legend Furniture/IT/Kendaraan/Properti + center `422`.
- Total Nilai `Rp 42,82 Miliar` + breakdown per kelas; `CompanyValueChart` bars (msi/jci/sbi).
- `ExpiryBarsChart` — `months` array hardcoded.
- `EXPIRY_ROWS` — 7 baris dokumen expiry hardcoded; `URGENCY_LABEL`.
- Header "Per 2 Juni 2026, 09:14 WIB" statis.
- **Plus badge sidebar hardcoded di App.jsx ERP_MENU_GROUPS:** `assets-it` badge `128`, `assets-workorders` `6`, `assets-expiring` `9`, `assets-expired` `4`.
- Placeholder (bukan dummy data, tapi tab belum tersambung) di AssetDetailPage: Dokumen, Rute, History (parsial), **Maintenance** (catatan: tabel `asset_maintenance_records` SUDAH ADA & sudah dipakai AssetDetailITPage — tab Maintenance kendaraan tinggal di-wire, low-hanging fruit).

### MISSING PAGES (sidebar → ComingSoon stub di AssetShell)
11 item belum ada implementasi (render `<ComingSoon>` "sedang dalam pengembangan"): `assets-analytics`, `assets-maint` (Jadwal Maintenance), `assets-hist` (History Maintenance), `assets-workorders`, `assets-docs`, `assets-expiring`, `assets-expired`, `assets-kategori`, `assets-lokasi`, `assets-vendor`, `assets-settings`.
Sudah ada page: `assets` (Dashboard — dummy), `assets-it`/`-kendaraan`/`-furniture`/`-properti` (AssetITPage — real), `assets-detail` (AssetDetailPage/AssetDetailITPage — real/partial).

### REKOMENDASI PRIORITAS
1. **Wire AssetDashboardPage ke Supabase** (aggregate dari `assets`: count per kategori, per status, total book_value, per company) — ganti semua dummy. Badge sidebar idealnya dinamis (tapi itu App.jsx).
2. **Wire tab Maintenance kendaraan** di AssetDetailPage ke `asset_maintenance_records` (tabel sudah ada, pola sudah dipakai di AssetDetailITPage).
3. **Buat `asset_documents`** (+ expiry) → aktifkan tab Dokumen, page Semua/Akan/Sudah Expired, dashboard expiry. (perlu approval skema)
4. Page management `assets-kategori` & `assets-lokasi` (tabel sudah ada), `assets-vendor` (pakai `vendors`).
5. `asset_work_orders` + page Work Orders; `asset_routes` + tab Rute (perlu approval skema).

---

> **⚠️ DB columns required for Phase 2.1A (`quotations` — buat di staging, butuh approval):**
> ```sql
> ALTER TABLE quotations
>   ADD COLUMN IF NOT EXISTS pricing_done_at timestamptz,
>   ADD COLUMN IF NOT EXISTS quote_sent_at   timestamptz,
>   ADD COLUMN IF NOT EXISTS discount_pct    numeric(5,2) DEFAULT 0;
> ```
> Sampai kolom dibuat: simpan quotation (form) & buka detail akan error "column … does not exist".

> **⚠️ DB table for Phase 2.0Z (`sales_calls`) — kolom durasi bernama `duration_minutes` (bukan `duration`). Buat di staging jika belum ada (butuh approval):**
> ```sql
> CREATE TABLE IF NOT EXISTS sales_calls (
>   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
>   company_id uuid NOT NULL,
>   prospect_id uuid REFERENCES prospects(id),
>   salesperson_id uuid REFERENCES profiles(id),
>   contact_name text NOT NULL,
>   contact_phone text,
>   call_date date NOT NULL,
>   call_time time,
>   duration_minutes integer,         -- menit (kolom DB = duration_minutes, BUKAN duration)
>   call_type text,                   -- discovery | follow_up | closing
>   result text,                      -- connected | no_answer | callback | wrong_number
>   bant_collected integer DEFAULT 0, -- 0..6
>   notes text,
>   next_action text,
>   next_action_date date,
>   created_by uuid,
>   created_at timestamptz DEFAULT now(),
>   updated_at timestamptz DEFAULT now()
> );
> GRANT ALL ON TABLE sales_calls TO anon, authenticated, service_role;
> -- FK names harus cocok dgn PostgREST hint di query:
> --   sales_calls_prospect_id_fkey, sales_calls_salesperson_id_fkey (default Postgres naming = aman)
> ```
> Sampai tabel dibuat, halaman tampil tapi fetch gagal → toast "Gagal memuat data call" + tabel kosong.

Next recommended step: **(1) Runtime-verify SELURUH migrasi accounts di staging: Pipeline/Prospect/Dashboard/Inquiry/Calls/Quotation/Master Customer (per-entitas + Free Agent) + Customer Detail (BANT dari row account, visit by id, Health Score). Kalau DBA rename constraint ke `accounts_*`, SEMUA embed `prospects_*`/`*_prospect_id_fkey`/`prospects_owner_company_id_fkey` error → update `!constraint`. Test: drag WON → account_status='customer' & muncul di Master Customer; tambah customer → account_status='customer'+owner_company_id. (2) ✅ Tabel `customers`→`accounts` SELESAI di kode (Phase 2.5A) — runtime-verify staging: SP list nama customer dari accounts, create customer dari Storbit (account_status=customer + owner_company_id), inquiry sumber Customer tersimpan di prospect_id; kalau constraint di-rename pasca-repoint, update embed `!constraint` (sp_items/ar_ttfs/inquiries/quotations_customer_id_fkey). Tabel `customers` lama tinggal di-drop setelah verifikasi (perlu approval). (3) Cleanup: status-filter dropdown CustomerListPage (active/inactive degenerate). Pending lain: verify 2.1F/2.1G UI, staging `sales_calls`/quotation cols.**

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

### Tabel: prospects → RENAMED jadi `accounts` (Phase 2.2A, Batch 1)
- ⚠️ Tabel `prospects` sudah di-rename jadi **`accounts`**. Query CRM Batch 1 (Pipeline/Prospect/Dashboard) sudah pakai `.from('accounts')` + `.eq('account_status', 'prospect')`.
- **Sudah dimigrasi (prospects→accounts SELESAI semua):** Batch 1 (Pipeline/Prospect/Dashboard/useCustomFields/SchemaManager — 2.2A); Batch 2 (Inquiry/Calls/Quotation embeds — 2.2B & 2.2B-fix); Batch 3 (CustomerListPage/CustomerDetailPage → accounts WHERE account_status='customer' — 2.2C). **Repo: 0 ref tabel `prospects`.**
- **✅ SELESAI (Phase 2.5A) — tabel `customers` → `accounts`:** migrasi DB selesai (5 FK sp_items/ar_ttfs/inquiries/quotations/accounts.converted_to sudah repoint ke `accounts`; INDOMARCO pindah, id sama). Kode sudah ikut: **db.js** (Storbit SP/AR — listCustomers/upsertCustomer/deleteCustomer + embed SP/AR pakai alias `customers:accounts!<constraint>(name)`) + **CRM** (InquiryFormPage dropdown → accounts WHERE account_status='customer', simpan ke prospect_id; embed InquiryListPage/QuotationListPage/QuotationDetailPage/QuotationFormPage `customer:accounts!*_customer_id_fkey`). **Repo: 0 ref tabel `customers` di file live.** Tabel `customers` lama MASIH ADA (dipensiunkan, jangan dihapus). CustomerMasterPage.legacy.jsx & UserManagement.legacy.jsx = dead, abaikan.
- `account_status`: 'prospect' / 'customer' / 'lost' / 'free_agent'. Pipeline = `account_status='prospect'`; Master Customer = `account_status='customer'`.
- Kolom accounts: + `owner_company_id`, `tier`, `code`, `nomor_kontrak`, `default_dc`, `last_activity_at`, `became_customer_at`.
- **FK constraint TIDAK ikut berubah** saat rename tabel → embed tetap pakai nama constraint lama `prospects_assigned_to_fkey`, `inquiries_prospect_id_fkey`, dll (hanya nama tabel target yang `prospects`→`accounts`). Kalau DBA me-rename constraint, update bagian `!constraint` di embed.
- WON di pipeline → auto set `account_status='customer'` + `became_customer_at`.
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

### ProspectFormPage — SOURCE options (updated 2026-06-12)
11 options (value): sales_visit, cold_call, referral, existing_network, exhibition, instagram, linkedin, tiktok, website, walk_in, other. Default `source: 'sales_visit'`.
Labels: Sales Visit, Cold Call, Referral, Existing Network, Exhibition / Pameran, Instagram, LinkedIn, TikTok, Website, Walk-in, Lainnya.
**Sync:** `SOURCE_LABELS_KP` di PipelineKanbanPage.jsx harus pakai value yang sama (label boleh beda — KP pakai 'Exhibition' tanpa '/ Pameran'). Removed dari versi lama: digital_marketing, event, social_media (jangan dipakai lagi).
**`sourceToSvc` (PipelineKanbanPage.jsx) — badge grouping per source (cover 11 value):** sales_visit/cold_call/referral/existing_network/walk_in/other → `'forwarding'`; exhibition → `'trading'`; instagram/linkedin/tiktok/website → `'digital'`. Fallback `'forwarding'`. Map `SVC` (warna badge) punya semua key: `forwarding` (label 'Forwarding', bg #EEF2FF, fg #144682), `trading` (label 'Trading', bg #FEF3EE, fg #E85A1E), `digital`, plus 5 lama (sea/air/land/customs/wh/project). Catatan: entri SVC pakai key `fg` untuk warna teks (bukan `color`) — konsumen baca `svc.fg` di DealCard & ListRow.
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
