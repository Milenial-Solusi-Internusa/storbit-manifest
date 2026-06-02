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

### Phase 1.0D+ — Staging Execution Readiness Review ✅ Complete
**Branch:** `phase-1-master-data-staging-readiness`
**Output:**
- `docs/operations/staging-migration-readiness.md` — full staging readiness document:
  - Migration inventory 001–014 with dependency graph
  - Pre-execution checklist (environment, backup, schema pre-checks, reviewer sign-off)
  - Grouped execution order (A–F) with per-group verification queries
  - Rollback strategy per migration with risk levels
  - RLS test matrix: 9 test users × 20 tables × SELECT/INSERT/UPDATE/DELETE
  - Cross-company isolation tests (MSI vs SBI)
  - Security enforcement tests (actor_id, immutability, cross-company write)
  - Go/No-Go criteria and production execution gate
- Status: DOCUMENTATION ONLY — no migrations executed

### Phase 1.0D++ — Legacy App Baseline for Fresh Staging ✅ Complete
**Branch:** `phase-1-legacy-baseline-fresh-staging`
**Output:**
- `supabase/migrations/20260524000000_legacy_app_baseline.sql` — baseline migration for fresh Supabase projects:
  - `user_role_legacy` ENUM (management, logistic, procurement, finance, super)
  - `profiles` table with auth trigger (`on_auth_user_created` via `handle_new_user()`)
  - `customers` table (10 legacy columns derived from source code)
  - `sp_items` table (24 columns derived from `spFromDb`/`spToDb` in db.js)
  - `ar_ttfs` table (11 columns derived from `ttfFromDb`/`ttfToDb` in db.js)
  - `ar_btbs` table (8 columns, cascade-delete, no updated_at — rows always replaced)
  - `set_updated_at()` shared trigger function (CREATE OR REPLACE — safe for migration 001)
  - 12 verification queries in comments; full rollback block
  - No ERP columns from migrations 001–014; no RLS; no seed data
- `docs/operations/legacy-app-baseline-fresh-staging.md` — companion documentation:
  - Column derivation evidence from db.js, AuthContext.jsx, UserManagement.jsx
  - Design decisions with rationale (enum type, auth trigger, OR REPLACE, no RLS)
  - Pre-execution checklist, first user setup steps, known limitations
- `docs/operations/staging-migration-readiness.md` updated:
  - Migration 000 added to inventory (15 total migrations)
  - Section 2.1a added: fresh vs existing-data staging pre-check
  - Critical warning updated to note migration 000 must run first on fresh projects
- Status: DRAFT — migration must not be executed without explicit approval

### Phase 1.0D+++ — Staging Execution Verification ✅ Complete
**Branch:** `phase-1-staging-execution-verification`
**Output:**
- `docs/operations/staging-execution-verification-log.md` — full execution verification log:
  - Environment: Supabase staging project `untmpqceexwxzuhlmyrg`
  - All 15 migrations (000–014) applied successfully to fresh Supabase project
  - Seed data verified: 3 companies, 3 branches, 21 departments, 13 statuses, 45 doc types, 36 roles, 92 permissions, role_permissions matrix, 5 currencies, 12 taxes, 18 payment terms
  - Structural verification: all FKs, triggers, and RLS helper functions confirmed
  - First MSI super admin provisioned (Den Bagus M Jaelani, role: super_admin, company: MSI)
  - App smoke test: local login and dashboard load confirmed at localhost:5173
  - Constraint fix documented (migrations 009 and 011 via PR #9)
  - 12 known intentional gaps documented with resolution phases
  - Go/No-Go: staging GO, production NO-GO
- Status: COMPLETE — staging verified; production execution remains blocked

### Phase 1.0E — First Admin UI Screens ✅ Complete
**Branch:** `phase-1-admin-ui-foundation`
**Prerequisites:** 1.0D+++ staging execution verified ✅
**Output:**
- `useDebounce` hook — 300ms debounce utility shared across all admin hooks
- `useCompanies`, `useBranches`, `useDepartments`, `useRoles` — paginated + debounced hooks
- `useDocumentTypes`, `useStatusCatalog`, `useTaxes`, `usePaymentTerms` — paginated + debounced hooks
- `AdminShell.jsx` — lazy-loaded tab shell for all admin screens (8 tabs)
- Admin pages: CompaniesPage, BranchesPage, DepartmentsPage, RolesPage
- Admin pages: DocumentTypesPage, StatusCatalogPage, TaxesPage, PaymentTermsPage
- All screens: server-side pagination, 300ms debounced search, ErrorBoundary per tab
- `App.jsx` updated: `Database` icon, AdminShell lazy import, Master Data menu item (role: super)
- 0 new lint errors introduced; `npm run build` passes

### Phase 1.0F — Profiles & Customers RLS Transition ✅ Complete
**Branch:** `phase-1-profiles-customers-rls-transition` (plan) · `fix/customer-soft-delete-rls` (PR #13) · `fix/customer-company-id-rls-insert` (PR #14) · `phase-1-rls-transition-verification` (verification) · `fix/auth-profile-trigger-company-defaults` (PR #16) · `phase-1-cross-company-isolation-verification` (isolation)
**Prerequisites:** 1.0E admin UI merged ✅
**Output:**
- `supabase/migrations/20260524000015_profiles_customers_rls_transition.sql` — executed in staging (3 stages):
  - Stage 1: `profiles.company_id` backfilled (Den → MSI via Option B per-user); `customers.company_id` backfilled (SBI default — 0 rows affected, clean)
  - Stage 2: `profiles.company_id` and `customers.company_id` set NOT NULL
  - Stage 3: RLS enabled on profiles (2 policies) and customers (3 policies)
- `supabase/migrations/20260524000016_auth_profile_trigger_company_defaults.sql` — patched `handle_new_user()` with company resolution; defaults MSI/HO/IT; applied to staging
- `docs/operations/profiles-customers-rls-transition.md` — staged execution plan and blocker documentation
- `docs/operations/profiles-customers-rls-verification-log.md` — full verification log:
  - RLS enabled, all 5 policies active, all helper functions verified
  - profiles_count = 1, profiles_company_id_null_count = 0
  - customers_count = 0, customers_company_id_null_count = 0
  - App smoke tests: login, User Management, Customer list/add/delete — all pass
  - Migration 016 verified: new user creation succeeds post-NOT NULL constraint
  - Cross-company isolation test: SBI viewer sees 0 customers; MSI data confirmed intact — ✅ PASS
- Source code fixes applied before Stage 3:
  - `deleteCustomer()` → soft delete (`deleted_at` + `active = false`) — PR #13
  - `upsertCustomer()` INSERT → resolves and attaches `company_id` from profiles — PR #14
  - `listCustomers()` → explicit `.is('deleted_at', null)` filter
- Staging verdict: FULLY VERIFIED ✅
- Production gate: Pending formal technical lead and product owner sign-offs

### Phase 1.0G — User Access Management Foundation ✅ Complete
**Branch:** `phase-1-user-access-management`
**Prerequisites:** 1.0F complete and verified ✅
**Output:**
- `src/hooks/useUserAccess.js` — paginated list hook (profiles + company/branch/dept/position joins + user_roles 2-step merge); async helpers for cascading dropdown data; `saveUserAccess()` mutation (profile UPDATE + user_roles deactivate/upsert)
- `src/modules/admin/pages/UserAccessPage.jsx` — read + update user access page inside AdminShell:
  - Debounced search, server-side pagination (20/page)
  - Table: Name/ID, Company, Legacy Role, ERP Role, Active, MFA
  - Right-side edit drawer: company, branch, department, position (cascading), legacy role, ERP role, active toggle, MFA toggle
  - Company change clears and reloads branch/dept/position/ERP role dropdowns
  - ERP role assignment: deactivate existing active roles, upsert new role
  - Only updates ERP role if it changed (skips unnecessary user_roles writes)
  - Self-deactivation guard (cannot deactivate own account)
  - Clear error surfacing on RLS or save failures
- `src/modules/admin/AdminShell.jsx` — added "User Access" tab (9th tab)
- Auth user creation intentionally not supported: remains Supabase Dashboard only
- Known RLS constraint: user_roles insert/update scoped to current user's company_id; cross-company role assignment requires a future elevated policy

### Phase 1.0H — RLS Hardening for Remaining Public Tables ✅ Complete
**Branch:** `phase-1-rls-hardening-public-tables`
**Prerequisites:** 1.0G complete ✅
**Output:**
- `supabase/migrations/20260524000017_rls_hardening_public_tables.sql` — enables RLS on 8 tables flagged by Supabase Security Advisor (`rls_disabled_in_public`):
  - **Group A — Legacy operational tables** (`sp_items`, `ar_ttfs`, `ar_btbs`): no `company_id`; authenticated-only policies (`TO authenticated USING (true)`) block anonymous access while preserving all existing app behaviour; marked TRANSITIONAL
  - **Group B — Finance tables** (`cost_centers`, `chart_of_accounts`): company-scoped read; admin-level write; `chart_of_accounts` write restricted to `finance_controller` or `super_admin`; no DELETE policy
  - **Group C — Asset tables** (`asset_categories`, `asset_locations`, `assets`): company-scoped read; admin-level write; no DELETE policy
  - All policies idempotent (`DROP POLICY IF EXISTS` + `CREATE POLICY`); rollback SQL included
  - `ar_btbs` has SELECT, INSERT, DELETE (no UPDATE) — matches replace strategy in `updateTtf()`
- `docs/operations/rls-hardening-public-tables.md` — full decision log, policy rationale per table, source code usage confirmation, DBA verification checklist
- No source files modified; no UI changed; no `.env` files touched
- Status: STAGING VERIFIED ✅ — production execution blocked pending formal sign-off
- Verification log: `docs/operations/rls-hardening-verification-log.md`

### Phase 1.0I — Admin CRUD Foundation ✅ Complete
**Branch:** `phase-1-admin-crud-foundation`
**Prerequisites:** 1.0H complete ✅
**Output:**
- `src/hooks/useBranches.js` — extended with `createBranch`, `updateBranch`, `softDeleteBranch` async helpers
- `src/hooks/useDepartments.js` — extended with `createDepartment`, `updateDepartment`, `softDeleteDepartment`, `fetchParentDepartmentsForCompany` helpers
- `src/hooks/usePositions.js` — new hook: `usePositions` (paginated list), `createPosition`, `updatePosition`, `softDeletePosition`, `fetchDepartmentsForPositionForm`, `POSITION_LEVELS` constant
- `src/modules/admin/pages/BranchesPage.jsx` — upgraded to full CRUD: New Branch button, Edit button per row, right-side drawer with company/code/name/city/address/is_active fields, Archive (soft-delete) button, toast notifications, inline save error display
- `src/modules/admin/pages/DepartmentsPage.jsx` — upgraded to full CRUD: same drawer pattern, adds optional parent department dropdown (filtered to same company, excludes self)
- `src/modules/admin/pages/PositionsPage.jsx` — new page: paginated list with company/code/name/level badge/department/status columns; drawer with company/code/name/level (CHECK constraint values)/department (optional)/is_active
- `src/modules/admin/AdminShell.jsx` — Positions tab added (10th tab between Departments and Roles); phase badge updated to 1.0I; "Read-only" label updated to "CRUD enabled"
- No migrations, no RLS changes, no schema changes, no new dependencies
- Soft delete only — all three tables have `deleted_at`; no DELETE SQL is executed
- All saves require `is_admin_or_above()` at the RLS layer; RLS errors are surfaced to the drawer UI

---

### Phase 1.0J — User Access Management Upgrade ✅ Complete
**Branch:** `phase-1-admin-crud-foundation`
**Prerequisites:** 1.0I complete ✅
**Output:**
- `src/modules/admin/pages/UserAccessPage.jsx` — full rewrite: table layout (Avatar+Name, Company, Role, Status, Actions), centered `AdminFormModal` for Edit (replaces right-side drawer), `+ Add User` button → create-user Edge Function, Deactivate/Activate per-row action (disabled for own account)
- `src/hooks/useUserAccess.js` — added `toggleUserActive()`, `createUser()` (invokes Edge Function with error body extraction), improved `FunctionsHttpError` handling to surface actual error message instead of generic wrapper
- `supabase/functions/create-user/index.ts` — **new Edge Function**: verifies caller is `is_super_admin()` via RPC, calls `auth.admin.createUser()` with `user_metadata: { full_name }`, then `UPDATE profiles` with full_name/role/company_id. Service role key is injected by Supabase runtime — never exposed to frontend.
- `src/App.jsx` — removed `users` nav item (Org & Access Control), removed `UserManagement` lazy import, added redirect from `activeMenu === 'users'` → `admin` for stale state/bookmarks
- **Bug fix:** `full_name` not set via `user_metadata` on initial `createUser` call — trigger `handle_new_user()` was inserting empty name; fixed by passing `user_metadata: { full_name }` so trigger captures name on INSERT (UPDATE at step 4 is now defense-in-depth, not the only write path)
- Edge Function deployed to staging project `untmpqceexwxzuhlmyrg`

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
| 2026-05-24 | Phase 1.0D+ staging readiness review created before any migration execution | Migrations 001–014 must be verified end-to-end in staging with test matrix and go/no-go criteria before any production execution |
| 2026-05-24 | Production execution blocked until Phase 1.0E Admin UI is also ready | Running schema migrations without corresponding UI would leave unmanageable data in production |
| 2026-05-24 | Migration 000 created as baseline for fresh Supabase staging projects | Fresh Supabase has no public tables; migrations 007 and 008 would fail without pre-existing profiles and customers tables |
| 2026-05-24 | Migration 000 filename sorts before 001 (lexicographic: 000 < 001) | Ensures correct execution order without renaming existing migration files 001–014 |
| 2026-05-24 | All columns in migration 000 derived strictly from source code (db.js, AuthContext, UserManagement) | No guessed columns — every column traceable to spFromDb/spToDb, ttfFromDb/ttfToDb, customerFromDb/customerToDb, or profile field access |
| 2026-05-24 | `profiles.role` typed as `user_role_legacy` ENUM, not TEXT | Confirmed by `role::text` cast in migration 014 RLS and migration 007 comment "legacy profiles.role (enum)" |
| 2026-05-24 | `set_updated_at()` in migration 000 uses CREATE OR REPLACE | Migration 001 also defines the same function; OR REPLACE makes the second definition a safe no-op |
| 2026-05-24 | `handle_new_user()` auth trigger included in migration 000 | AuthContext.jsx requires `profile.active` before granting isAuthenticated; without the trigger, new auth users have no profile row and cannot log in |
| 2026-05-24 | `ar_btbs` has no `updated_at` column and no update trigger | db.js updateTtf() always deletes all btb rows then re-inserts — individual row updates never occur |
| 2026-05-24 | Table name is `ar_ttfs` not `ttfs` | Fresh staging pre-check listed `ttfs` as missing, but db.js consistently uses `ar_ttfs` throughout (lines 225, 234, 256, 266, 289, 298) |
| 2026-05-24 | No RLS policies in migration 000 | sp_items, ar_ttfs, ar_btbs get RLS in Phase 2+ transaction modules; profiles and customers RLS deferred to Phase 1.0F (company_id backfill required first) |
| 2026-05-24 | Fresh Supabase staging project created specifically for Nexus by MSI | Isolated from any existing Storbit Manifest data; clean environment for schema verification |
| 2026-05-24 | Migrations 000–014 applied to staging successfully | All 15 migrations executed in order on a fresh Supabase project with no prior public tables |
| 2026-05-24 | Constraint fix required for migrations 009 and 011 (PR #9) | PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS` syntax; replaced with `DO $$ IF NOT EXISTS pg_constraint $$` blocks |
| 2026-05-24 | First MSI super admin provisioned in staging | den.itnetwork@exportimportdept.com; profiles.role=super; user_roles role_code=super_admin; company=MSI; mfa_required=true |
| 2026-05-24 | Legacy operational tables remain RLS-deferred in staging | sp_items, ar_ttfs, ar_btbs are internal-only tables accessed by authenticated staff; deferral is safe for staging and Phase 1.0E development |
| 2026-05-24 | Phase 1.0E allowed to begin on staging only | Staging verified GO; production execution remains blocked until Phase 1.0F + full RLS test matrix + technical lead and product owner sign-off |
| 2026-05-24 | Production remains blocked after staging execution | profiles and customers RLS not yet active; backfill required; full cross-company isolation test matrix not yet run |
| 2026-05-25 | profiles and customers RLS enabled in staging — Phase 1.0F staging GO | Staged execution (backfill → NOT NULL → RLS activation) completed; all 5 policies verified; all smoke tests pass |
| 2026-05-25 | profiles.company_id backfill used Option B (per-user) rather than blanket SBI | Den's profile assigned to MSI explicitly; migration 007 blanket-SBI note was incorrect for this admin |
| 2026-05-25 | customers.company_id backfill ran as SBI default with 0 rows affected | No legacy customers existed at time of staging execution; constraint applied cleanly |
| 2026-05-25 | deleteCustomer() converted to soft delete before Stage 3 RLS activation | customers RLS has no DELETE policy by design; hard delete would fail silently after RLS enabled |
| 2026-05-25 | customer insert company_id resolved from profiles before Supabase call | customerToDb() never produced company_id; INSERT would fail RLS WITH CHECK without it |
| 2026-05-25 | Phase 1.0F cleared for staging; production gate remains blocked | Cross-company isolation test and technical/product sign-offs required before production execution |
| 2026-05-24 | Phase 1.0E completed: 8 admin read-only screens, 8 data hooks, AdminShell lazy chunk | All screens follow server-side pagination + debounced search pattern; no new lint errors; build passes |
| 2026-05-24 | Admin tab bar uses overflow-x-auto with flex-shrink-0 whitespace-nowrap on 8 tabs | Prevents overflow or collapse on narrower viewports without adding a new scroll library |
| 2026-05-24 | StatusCatalogPage uses COLOR_SWATCH hex lookup map instead of Tailwind bg tokens directly | color_class column stores Tailwind classes (e.g., bg-gray-100); inline styles require hex values — lookup map converts known tokens, falls back to neutral for unknown |
| 2026-05-24 | DocumentTypesPage uses MODULE_COLORS map with distinct PASTEL accent per module | Visual differentiation of document types by module (sales, operations, procurement, finance, etc.) without adding any new dependency |
| 2026-05-24 | Phase 1.0F migration uses staged execution (3 stages) rather than single atomic migration | Backfill, NOT NULL constraint, and RLS activation are each independently reversible; single-transaction approach would be unrecoverable if backfill has unexpected NULLs |
| 2026-05-25 | profiles backfill decision deferred to DBA: migration 007 note conflicts with staging admin being MSI | Migration 007 suggested SBI default but known super admin is MSI; blanket assignment would be incorrect — DBA must review profile rows before choosing Option A or B |
| 2026-05-25 | customers backfill hardcoded to SBI in migration 015 | Legacy Storbit Manifest was built for SBI (General Trading); all existing customers are SBI operational data — consistent with migration 008 note and app context |
| 2026-05-25 | deleteCustomer() hard-delete flagged as pre-Stage-3 blocker | No DELETE policy will be added to customers RLS; hard DELETE will fail after RLS activation — must migrate to soft-delete before enabling RLS |
| 2026-05-25 | listCustomers() SELECT * noted as safe post-RLS but flagged for Phase 1.0G refactor | RLS will filter rows to company scope so SELECT * is not a security risk; column-specific select is a performance improvement deferred to refactor phase |
| 2026-05-25 | handle_new_user() patched in migration 016 after profiles.company_id became NOT NULL | Auth trigger was inserting only 4 columns; NOT NULL constraint on company_id caused every new Auth user creation to fail with "Database error creating new user"; migration 016 resolves company_id/branch_id/department_id from master tables before inserting |
| 2026-05-25 | Cross-company isolation test confirmed PASS in staging — Phase 1.0F fully complete | SBI viewer (test.sbi.viewer@exportimportdept.com) sees 0 customers from MSI scope; MSI INDOMARCO customer confirmed intact; profiles_read policy correctly scopes by company_id; production gate moves from BLOCKED to Pending Formal Approval |
| 2026-05-26 | Auth user creation excluded from User Access UI — remains Supabase Dashboard only | Creating auth users requires service_role or Supabase Admin API; exposing either in frontend violates security baseline; Supabase Dashboard provides a safe, audited alternative for Phase 1.0G |
| 2026-05-26 | user_roles insert/update RLS limits Phase 1.0G to same-company role assignment | user_roles_insert policy requires company_id = get_user_company_id(); cross-company role writes need a future super_admin override policy; surfaced as a clear UI error rather than silently ignored |
| 2026-05-26 | user_roles fetched in a separate query and merged client-side (not nested select) | profiles.id → auth.users.id is a cross-schema FK; PostgREST cannot auto-join user_roles via auth schema; 2-step fetch (profiles then user_roles.in(profileIds)) is the correct pattern |
| 2026-05-28 | Legacy tables (sp_items, ar_ttfs, ar_btbs) given authenticated-only RLS rather than company-scoped | These tables have no company_id column; company-scoped policy is impossible without schema migration; authenticated-only policy achieves the Security Advisor goal (block anonymous access) without breaking any existing app behaviour |
| 2026-05-28 | ar_btbs given DELETE policy but no UPDATE policy | db.js updateTtf() explicitly calls supabase.from('ar_btbs').delete().eq('ttf_id', id) before re-inserting (replace strategy); a DELETE policy is mandatory or the explicit delete fails after RLS is enabled; no UPDATE policy is needed because ar_btbs rows are never individually updated |
| 2026-05-28 | chart_of_accounts write access restricted to finance_controller or super_admin (stricter than admin) | COA structure is a critical finance asset; incorrect modifications silently corrupt ledger entries; restricting to finance_controller prevents operational admins from accidentally restructuring accounts |
| 2026-05-28 | No DELETE policies on Phase 2+ and Phase 4.2 tables | Assets, COA entries, and cost centers must never be hard-deleted; application enforces soft-delete (deleted_at) and status transitions; absence of a DELETE policy is an intentional guardrail at the database level |
| 2026-05-28 | Phase 1.0H migration marked DRAFT — must not be executed without DBA sign-off | Legacy tables (sp_items, ar_ttfs, ar_btbs) are actively used by operational screens; any policy error or missing operation coverage would break running app features; DBA must run on dev Supabase first and verify all app screens before staging execution |
| 2026-05-30 | Phase 1.0I CRUD uses soft delete (UPDATE deleted_at) not SQL DELETE | branches/departments/positions have no DELETE RLS policy; soft delete via UPDATE is covered by the existing UPDATE policy; archived records disappear from list immediately because all list queries filter deleted_at IS NULL |
| 2026-05-30 | Company is locked after creation for branches/departments/positions | Changing company_id on an existing row would violate the unique constraint scope and confuse any FK references from profiles or approval rules; UI disables the field on edit to prevent accidental change |
| 2026-05-30 | Positions drawer clears department when company changes | department_id FK is scoped to the same company; a department from Company A is not a valid FK for a position in Company B; clearing on company change prevents a phantom FK that would pass client validation but fail at the DB level |
| 2026-05-30 | Departments page loads parent_id options excluding self on edit | self-referential parent would create a circular hierarchy; PostgREST does not enforce acyclicity, so the exclusion is enforced in fetchParentDepartmentsForCompany via .neq('id', excludeId) |
| 2026-05-28 | Migration 017 applied to staging and verified PASS — Phase 1.0H staging complete | All 8 target tables show rowsecurity=true and all expected policies present; all operational screens (SP Manifest, AR Tracker, Finance, Outstanding) smoke-tested and passing; verification recorded in docs/operations/rls-hardening-verification-log.md; production execution remains blocked pending formal technical lead and product owner sign-off |
| 2026-05-30 | Migration 018 adds is_super_admin() bypass to branches/departments/positions INSERT+UPDATE policies | Original policies gate on company_id = get_user_company_id(); a super_admin whose profiles.company_id = MSI cannot create rows for JCI; bypass allows cross-company writes for super_admin while keeping is_admin_or_above() company-scoped |
| 2026-05-30 | Migration 019 adds is_super_admin() read bypass to branches/departments/positions SELECT policies | UI helpers use insert(...).select().single() — after a cross-company INSERT succeeds (migration 018), the read-back fails because SELECT policy still gates on company_id = get_user_company_id(); super admin read bypass is required for the inserted row to be returned; non-super-admin read remains company-scoped and deleted_at IS NULL |
| 2026-06-02 | Add User flow uses Edge Function, not Supabase invite flow | auth.admin.createUser() requires service_role key which must never be exposed to frontend; Edge Function is the correct secure boundary; invite flow was rejected because it requires the user to set their own password via email, which is not suitable for internal admin-provisioned accounts |
| 2026-06-02 | Edge Function create-user passes full_name in user_metadata | handle_new_user() trigger reads raw_user_meta_data->>'full_name' on INSERT; without user_metadata the trigger inserts empty name and the subsequent UPDATE is the only write path — passing it in metadata makes the trigger the primary path and UPDATE a defense-in-depth fallback |
| 2026-06-02 | FunctionsHttpError body must be explicitly extracted to surface real error message | supabase.functions.invoke() wraps non-2xx responses in FunctionsHttpError with generic message "Edge Function returned a non-2xx status code"; actual body JSON is in error.context and must be read via error.context.json() — fixed in createUser() helper |
| 2026-06-02 | Org & Access Control nav item removed, old UserManagement component no longer loaded | UserAccessPage in AdminShell is the single source of truth for user management; duplicate entry was confusing and the old UserManagement component did not support ERP roles or multi-company; activeMenu=users redirects to admin to handle stale state |
