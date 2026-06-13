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

Current phase: **Phase 2.3I** ✅ Complete

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

Next recommended step: **(1) Runtime-verify SELURUH migrasi accounts di staging: Pipeline/Prospect/Dashboard/Inquiry/Calls/Quotation/Master Customer (per-entitas + Free Agent) + Customer Detail (BANT dari row account, visit by id, Health Score). Kalau DBA rename constraint ke `accounts_*`, SEMUA embed `prospects_*`/`*_prospect_id_fkey`/`prospects_owner_company_id_fkey` error → update `!constraint`. Test: drag WON → account_status='customer' & muncul di Master Customer; tambah customer → account_status='customer'+owner_company_id. (2) Putuskan tabel `customers`: deprecate → accounts? kalau ya, Batch 4 untuk embed `customer:customers!*_customer_id_fkey` (Inquiry/Quotation) + InquiryFormPage `.from('customers')`. (3) Cleanup: status-filter dropdown CustomerListPage (active/inactive degenerate). Pending lain: verify 2.1F/2.1G UI, staging `sales_calls`/quotation cols.**

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
- **Belum diputuskan — tabel `customers` (terpisah dari rename prospects):** embed `customer:customers!*_customer_id_fkey` di InquiryListPage/InquiryFormPage/QuotationListPage/QuotationDetailPage/QuotationFormPage masih ke tabel `customers`. Kalau `customers` di-deprecate → accounts, perlu Batch 4 (putuskan: inquiries/quotations.customer_id tetap FK ke customers, atau pindah ke accounts). db.js (Storbit SP/AR) pakai customers sendiri — legacy.
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
