# Nexus by MSI — Implementation Roadmap

**Last Updated:** 2026-05-24

---

## Overview

This roadmap defines the phased implementation plan for Nexus by MSI. The strategy is incremental — foundation first, then transactions, then advanced features.

**Rule:** Do not build all ERP modules at once. Each phase must be stable before the next phase starts.

---

## Phase 0 — Foundation & Governance

### Phase 0.0 — Initial Project Instructions ✅ Complete
**Output:**
- CLAUDE.md with project identity, principles, safety rules, workflow
- No source code changes
- No database changes

### Phase 0.1 — Documentation Foundation ✅ Complete
**Output:**
- `docs/architecture/` — blueprint, module map, business process, feature registry, roadmap
- `docs/database/` — schema draft, entity map, indexing strategy
- `docs/security/` — baseline, permission matrix, audit policy, data retention
- `docs/workflow/` — approval engine, document numbering, status lifecycle
- `docs/integration/` — API strategy, public tracking API
- `docs/performance/` — baseline, caching, reporting
- `docs/operations/` — deployment, environments, release checklist, monitoring
- Updated README.md
- `.env.example`

### Phase 0.2 — Final CLAUDE.md ✅ Complete
**Output:**
- Update CLAUDE.md to reference docs/
- Define required reading before coding
- Define stricter workflow per task type

### Phase 0.3 — Claude Agents ✅ Complete
**Output:**
- `.claude/agents/` directory with 7 specialized agents
- Architecture auditor, Security reviewer, Performance reviewer
- Docs maintainer, QA/build tester, Refactor planner, React UI refactorer

### Phase 0.4A — Bundle Size Audit ✅ Complete
**Output:**
- Production bundle composition audited
- Large startup chunks and lazy-loading candidates identified

### Phase 0.4B — Bundle Split and Lazy Loading ✅ Complete
**Output:**
- Vite 8 / Rolldown vendor chunk split
- `UserManagement` lazy loaded
- Dashboard extracted to `src/modules/dashboard/Dashboard.jsx` and lazy loaded
- Recharts deferred into separate chunk
- 500 kB build warning eliminated

### Phase 0.5A — Stability, Lint, and Tech Debt Audit ✅ Complete
**Output:**
- `docs/operations/stability-and-tech-debt-audit.md`
- Lint baseline documented: 42 pre-existing errors
- P0 blocker identified and resolved (unsafe console.log in db.js)

### Phase 0.5B — Remove Production Console Logs ✅ Complete
**Output:**
- Unsafe `console.log` statements removed from `src/lib/db.js`

### Phase 0.5C — ErrorBoundary Baseline ✅ Complete
**Output:**
- `ErrorBoundary` component added
- Dashboard and UserManagement wrapped

### Phase 0.5D — Lint Baseline Cleanup ✅ Complete (Steps 1–6)
**Output:**
- All 42 lint errors resolved (0 errors remaining)
- Dead code removed, SortIcon moved to module scope
- Unused parameters removed, redundant assignments removed
- `Date.now()` purity fix via lazy useState initializer
- AuthContext split for Fast Refresh compliance
- `set-state-in-effect` violations replaced with inline `.then()` patterns

---

## Phase 1 — Master Data Foundation

### Phase 1.0 — Master Data Core
**Target completion:** Q3 2026  
**Prerequisites:** Phase 0.x complete ✅

**Output:**
- Company setup (multi-company scaffold)
- Branch, Department, Position
- Employee / User with role assignment
- Customer master (with credit limit, payment terms)
- Vendor master
- Product / Service catalog
- Document Type configuration
- Status catalog
- Approval Center (reusable engine)
- Chart of Accounts (per company)
- Currency and Exchange Rate

**Database changes required (approval needed before each):**
- `companies` table
- `branches`, `departments`, `positions` tables
- `user_profiles` extension
- `roles`, `permissions`, `role_permissions`, `user_roles` tables
- `customers` table (enhance existing)
- `vendors`, `products` tables
- `document_types`, `document_sequences` tables
- `status_catalog` table
- `taxes`, `payment_terms`, `currencies`, `exchange_rates` tables
- `approval_rules`, `approval_logs`, `approval_delegations` tables
- `chart_of_accounts`, `cost_centers` tables
- `asset_categories`, `asset_locations`, `assets` tables (schema only, Phase 4)

### Phase 1.0A — Master Data Architecture Plan ✅ Complete
**Branch:** `phase-1-master-data-architecture`
**Output:**
- `docs/database/master-data-architecture.md` — defines all 19 master data domains
- Architecture only — no schema changes, no migrations, no RLS, no source code changes

### Phase 1.0B — Schema / Migration Draft Review ✅ Complete
**Branch:** `phase-1-master-data-schema-draft`
**Output:**
- Draft migration SQL for all 12 P0/P1/P2/P3 domains in `/supabase/migrations/`
- Rollback SQL included as comment block in every migration file
- Schema additions to `docs/database/core-schema-draft.md`
- Entity map additions to `docs/database/entity-map.md`
- Index definitions added to `docs/database/indexing-strategy.md`
- Status: DRAFT — migrations must not be executed without explicit approval

### Phase 1.0C — Seed Strategy ✅ Complete
**Branch:** `phase-1-master-data-seed-strategy`
**Output:**
- `docs/database/seed-strategy.md` — full domain-by-domain seed review and verification checklist
- `supabase/migrations/20260524000013_role_permissions_seed.sql` — complete role-permissions matrix (all 12 roles)
- `docs/workflow/status-lifecycle.md` — corrected: `completed` added as terminal state
- `docs/security/permission-matrix.md` — legacy role mapping table and migration references added
- Confirmed: all existing seed rows in migrations 001–009 match source-of-truth docs
- Status: DRAFT — migrations must not be executed without explicit approval

### Phase 1.0D — RLS Policy Draft ✅ Complete
**Branch:** `phase-1-master-data-rls-draft`
**Output:**
- `supabase/migrations/20260524000014_rls_policy_draft.sql` — RLS policies for all 20 P0/P1 tables
- 5 helper functions: `get_user_company_id()`, `is_super_admin()`, `is_admin_or_above()`, `has_role()`, `has_permission()`
- `docs/security/rls-policy-draft.md` — full policy rationale, test matrix, pre-execution checklist, known gaps
- `profiles` and `customers` RLS blocks commented out (Phase 1.0F dependency — company_id NULL until backfill)
- Status: DRAFT — migrations must not be executed without explicit approval

### Phase 1.0E — First Admin UI Screens
**Status:** Planned
**Prerequisites:** 1.0B + 1.0C + 1.0D verified in staging
**Output:**
- Admin screens: Company, Branch, Department, Role, Document Type, Status, Tax, Payment Terms
- All screens: server-side pagination, debounced search, lazy loaded, ErrorBoundary wrapped

### Phase 1.0F — Integration with Existing Manifest Data
**Status:** Planned
**Output:**
- Migrate existing `customers` table (add company_id, code, payment_terms_id)
- Migrate existing `profiles` table (add company_id, branch_id, department_id; map role enum)
- Verify existing Customer page, SP manifest, AR Tracker all still work
- Additive migration only — no destructive changes

---

## Phase 2 — Sales & Operations

### Phase 2.0 — CRM & Quotation
**Prerequisites:** Phase 1.0 complete

**Output:**
- Customer Inquiry / Lead
- Quotation with approval flow
- Quotation to SP conversion
- Sales Order / Surat Pesanan with approval

### Phase 2.1 — Job / Operation Management
**Prerequisites:** Phase 2.0 complete

**Output:**
- Job Card creation from SP
- Job status tracking
- Freight Forwarding job specifics (MSI)
- PPJK job specifics (JCI)
- General Trading fulfillment (SBI)
- Public tracking token (PLAT-04)

---

## Phase 3 — Finance

### Phase 3.0 — Job Costing & Invoicing
**Prerequisites:** Phase 2.1 complete

**Output:**
- Cost input per job
- Revenue vs cost view
- Invoice generation from job
- Invoice approval flow

### Phase 3.1 — AR / AP
**Prerequisites:** Phase 3.0 complete

**Output:**
- AR tracking and aging
- AP tracking and aging
- Payment recording
- Cash / Bank register

### Phase 3.2 — Procurement
**Prerequisites:** Phase 1.0 complete (can run parallel to 3.x)

**Output:**
- Purchase Request with approval
- Purchase Order with vendor confirmation
- Goods Receipt
- Vendor Invoice matching

---

## Phase 4 — Advanced Modules

### Phase 4.0 — Accounting
**Prerequisites:** Phase 3.x complete

**Output:**
- Journal entries (auto + manual)
- Trial Balance
- Financial Statements
- Period closing

### Phase 4.1 — Inventory / Warehouse
**Prerequisites:** Phase 3.2 complete

**Output:**
- Stock management (SBI primary)
- Stock movement
- Stock valuation

### Phase 4.2 — Asset Management
**Prerequisites:** Phase 3.0 complete

**Output:**
- Asset register
- Depreciation
- Disposal workflow

### Phase 4.3 — HRGA & IT Service Management
**Prerequisites:** Phase 1.0 complete

**Output:**
- HRGA request forms
- IT ticketing

---

## Phase 5 — Platform & Integration

### Phase 5.0 — API & Integration Center
**Output:**
- Public REST API (tracking, portal)
- Webhook support
- API key management

### Phase 5.1 — Customer / Vendor Portal
**Output:**
- Customer self-service portal
- Vendor self-service portal
- Public tracking page

### Phase 5.2 — Reporting & Dashboard Advanced
**Output:**
- Executive KPI dashboard
- Report builder
- Scheduled reports
- Export center (restricted)

---

## Ongoing — Cross-Cutting Concerns

These are not phases but continuous requirements throughout all phases:

| Concern | Action |
|---------|--------|
| Audit Log | Every create/update/delete/approve must be logged |
| RLS | Every new table must have company-scoped RLS from day one |
| Soft Delete | All business tables must use `deleted_at` |
| Performance | Every list query must be paginated server-side |
| Security | No service role key in frontend, no RLS bypass |
| Documentation | Every new feature must update feature-registry.md |
| Testing | Build must pass before merging |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-23 | Start with documentation foundation before any code | Safety and alignment first |
| 2026-05-23 | Incremental migration from Storbit Manifest, not rewrite | Reduce risk, preserve working features |
| 2026-05-23 | Multi-company by design from Phase 1.0 | Future-proof, avoid costly rework later |
| 2026-05-23 | Approval engine as reusable platform, not per-module | Consistency and maintainability |
| 2026-05-24 | Phase 0.5D lint cleanup completed before Phase 1.0 starts | Clean baseline ensures lint errors introduced in Phase 1 are immediately visible |
| 2026-05-24 | Phase 1.0 split into sub-phases A–F | Architecture before schema, schema before RLS, RLS before UI, migration last — reduces risk at each step |
| 2026-05-24 | Phase 1.0B migrations written as DRAFT SQL files, not executed | Schema must be reviewed and approved before any migration runs against Supabase |
| 2026-05-24 | 12 migration files cover all 19 master data domains defined in Phase 1.0A | Every domain from companies through asset management has a draft migration with rollback SQL |
| 2026-05-24 | role_permissions seeded in migration 013, separate from role/permission definitions in 005 | Separates schema decisions (what roles/permissions exist) from grant decisions (which role gets which permission); 013 can be revised independently |
| 2026-05-24 | `completed` added as 4th terminal status alongside rejected/cancelled/archived | Completed documents should not transition further; status-lifecycle.md updated to match |
| 2026-05-24 | All 15 document types seeded as is_active=true for all 3 companies | Company admins deactivate inapplicable types post go-live; avoids conditional seed logic |
| 2026-05-24 | Phase 1.0F migration is additive only | Existing Storbit Manifest UI must remain functional throughout; destructive column drops deferred until 1.0F is verified |
| 2026-05-24 | 19 master data domains defined before any migration is written | Defining all domains upfront prevents discovery of missing entities mid-migration |
| 2026-05-24 | All RLS helper functions use SECURITY DEFINER + SET search_path = public | Resolves circular RLS dependency; search_path lock prevents hijacking |
| 2026-05-24 | is_super_admin() and is_admin_or_above() include legacy profiles.role fallback | New user_roles table is empty until Phase 1.0F; fallback ensures existing super users retain access during transition |
| 2026-05-24 | profiles and customers RLS blocks commented out in migration 014 | company_id is NULL for all existing rows; enabling RLS before backfill would lock out all users from Customer and User Management pages |
| 2026-05-24 | exchange_rates has INSERT-only policy, no UPDATE or DELETE | Historical rates are immutable — modifying past rates would corrupt historical document values |
| 2026-05-24 | approval_logs has INSERT-only policy, no UPDATE or DELETE | Approval history is a permanent tamper-proof audit trail |
| 2026-05-24 | document_sequences UPDATE allowed for all company users | Any staff member creating documents needs to atomically increment the sequence; application enforces UPDATE...RETURNING pattern |
