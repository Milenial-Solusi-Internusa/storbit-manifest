# Nexus by MSI — Project Audit

Generated: 2026-06-03  
Branch audited: `phase-2-asset-management`  
Supabase project ref: `untmpqceexwxzuhlmyrg` (staging)

---

## 1. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | 19.2.5 |
| Build Tool | Vite | 8.0.10 |
| CSS Framework | TailwindCSS | 3.4.19 |
| Icons | Lucide React | 1.14.0 |
| Charts | Recharts | 3.8.1 |
| Backend / DB | Supabase (PostgreSQL) | @supabase/supabase-js 2.105.4 |
| Auth | Supabase Auth | — |
| RLS | Supabase Row Level Security | — |
| Linter | ESLint | 10.2.1 |
| Plugins | eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.2 |
| Hosting | Vercel | — |
| Source Control | GitHub | — |

**Key constraints noted in package.json:**
- No React Router — navigation is fully state-driven via `activeMenu` / `activeModule` in `App.jsx`
- No testing framework — zero test files exist in the repo
- No date library (dayjs, date-fns) — all date formatting is done inline with native `Date` APIs

---

## 2. Branch Structure

### Local + Remote Branches

| Branch | Status | Notes |
|---|---|---|
| `main` | Stable base | Last touched several merges ago; behind phase-5-supabase |
| `phase-5-supabase` | Integration base | Has PR #27 (HRGA) merged; ahead of main |
| `phase-2-asset-management` | **Active (current)** | Working branch; contains all uncommitted asset + HRGA work |
| `phase-2-service-management` | Merged (PR #27) | HRGA module — now in phase-5-supabase |
| `phase-1-admin-crud-foundation` | Merged | Branches, Departments, Positions CRUD + UserAccess |
| `phase-1-admin-ui-foundation` | Merged | Read-only admin screens (Phase 1.0E) |
| `phase-1-user-access-management` | Merged | User access foundation (Phase 1.0G) |
| `phase-1-rls-hardening-public-tables` | Merged | RLS for remaining tables (Phase 1.0H) |
| `phase-1-profiles-customers-rls-transition` | Merged | company_id backfill on profiles/customers (Phase 1.0F) |
| `phase-1-rls-transition-verification` | Merged | Verification only |
| `phase-1-cross-company-isolation-verification` | Merged | Verification only |
| `phase-1-staging-execution-verification` | Merged | Migrations 000–014 verification |
| `phase-1-legacy-baseline-fresh-staging` | Merged | Legacy app baseline migration |
| `fix/auth-profile-trigger-company-defaults` | Merged | Hotfix: auth trigger |
| `fix/customer-company-id-rls-insert` | Merged | Hotfix: customers RLS |
| `fix/customer-soft-delete-rls` | Merged | Hotfix: soft delete |
| `fix/migration-constraint-idempotency` | Merged | Hotfix: migration safety |
| `remotes/origin/phase-1-master-data-architecture` | Remote only | Likely merged into earlier branch |
| `remotes/origin/phase-1-master-data-rls-draft` | Remote only | Likely merged |
| `remotes/origin/phase-1-master-data-schema-draft` | Remote only | Likely merged |
| `remotes/origin/phase-1-master-data-seed-strategy` | Remote only | Likely merged |
| `remotes/origin/phase-1-master-data-staging-readiness` | Remote only | Likely merged |

### Current Working Tree State (phase-2-asset-management)

All asset management work and part of HRGA work is **uncommitted**:

**Staged (tracked, not committed):**
- `src/App.jsx` — modified (Logistics rename, HRGA routing)
- `src/hooks/useHrgaRequests.js` — new
- `src/modules/hrga/HrgaShell.jsx` — new
- `src/modules/hrga/components/HrgaRequestDetail.jsx` — new
- `src/modules/hrga/components/HrgaRequestForm.jsx` — new
- `src/modules/hrga/pages/AllRequestsPage.jsx` — new
- `src/modules/hrga/pages/MyRequestsPage.jsx` — new
- `src/modules/launcher/AppLauncher.jsx` — modified
- `supabase/migrations/20260602000020–024` — new

**Untracked (not yet staged):**
- `src/hooks/useAssets.js`
- `src/modules/assets/` (entire directory)
- `src/modules/hrga/HrgaShared.jsx`
- `src/modules/hrga/hrga-tokens.js`
- `src/modules/hrga/pages/ArsipPage.jsx`
- `src/modules/hrga/pages/BuatRequestPage.jsx`
- `src/modules/hrga/pages/HrgaDetailPage.jsx`
- `src/modules/hrga/pages/PendingApprovalPage.jsx`
- `supabase/migrations/20260603000025–027` — new asset migrations
- `docs/modules/hrga-request-schema-plan.md` — new

---

## 3. Module Inventory

### 3.1 Core / App Shell

| Item | Details |
|---|---|
| Entry point | `src/main.jsx` |
| Root component | `src/App.jsx` (3593 lines — monolithic legacy file) |
| Auth wrapper | `src/contexts/AuthContext.jsx` + `src/components/AuthGate.jsx` |
| Auth hook | `src/contexts/useAuth.js` |
| Supabase client | `src/lib/supabase.js` |
| Data access layer | `src/lib/db.js` (legacy SP/AR/Customer queries) |
| Navigation model | State-driven — `activeMenu` + `activeModule` states in App.jsx |
| No router | React Router is NOT installed |

---

### 3.2 Module: Dashboard

| Item | Details |
|---|---|
| Shell file | None — rendered inline in App.jsx |
| Component | `src/modules/dashboard/Dashboard.jsx` |
| Lazy loaded | Yes (`React.lazy`) |
| Hooks used | None directly — receives `stats`, `groupedSP`, `filterMonth` as props from App.jsx |
| Supabase tables | None directly — data flows from App.jsx (useSpItems, useTtfs, useCustomers) |
| Route | `activeMenu === 'dashboard'` |
| Status | **Live** — shows SP stats, customer distribution, monthly chart |
| Notes | PASTEL tokens are locally duplicated (dedup planned for Phase 0.5) |

---

### 3.3 Module: Master Data / Admin

| Item | Details |
|---|---|
| Shell file | `src/modules/admin/AdminShell.jsx` |
| Lazy loaded | Yes |
| Own sidebar | Yes — sections: Organization, Access Control, Configuration |
| Route | `activeMenu === 'admin'` |
| Status | **Partial** |

**Pages and their CRUD status:**

| Page | File | CRUD Status |
|---|---|---|
| Companies | `pages/CompaniesPage.jsx` | Read-only |
| Branches | `pages/BranchesPage.jsx` | Full CRUD |
| Departments | `pages/DepartmentsPage.jsx` | Full CRUD |
| Positions | `pages/PositionsPage.jsx` | Full CRUD |
| Roles | `pages/RolesPage.jsx` | Read-only |
| User Access | `pages/UserAccessPage.jsx` | List + Add User (Edge Function) |
| Document Types | `pages/DocumentTypesPage.jsx` | Read-only |
| Status Catalog | `pages/StatusCatalogPage.jsx` | Read-only |
| Taxes | `pages/TaxesPage.jsx` | Read-only |
| Payment Terms | `pages/PaymentTermsPage.jsx` | Read-only |

**Shared admin components:**
- `components/AdminFormModal.jsx` — reusable centered modal
- `components/AdminPageHeader.jsx` — page title + search bar
- `components/EmptyState.jsx`, `ErrorState.jsx`, `LoadingState.jsx` — micro states

**Hooks used:**
`useCompanies`, `useBranches`, `useDepartments`, `usePositions`, `useRoles`, `useDocumentTypes`, `useStatusCatalog`, `useTaxes`, `usePaymentTerms`, `useUserAccess`

**Supabase tables connected:**
`companies`, `branches`, `departments`, `positions`, `roles`, `permissions`, `role_permissions`, `user_roles`, `document_types`, `status_catalog`, `taxes`, `payment_terms`, `profiles`

---

### 3.4 Module: Asset Management

| Item | Details |
|---|---|
| Shell file | `src/modules/assets/AssetShell.jsx` |
| Lazy loaded | Yes |
| Own sidebar | No — uses App.jsx ModuleSidebar (dark green, with expandable children) |
| Routes | `activeMenu === 'assets'` or `activeMenu?.startsWith('assets-')` |
| Status | **Partial** |

**Pages:**

| Page | File | Status |
|---|---|---|
| Asset Dashboard | `pages/AssetDashboardPage.jsx` | Live (static design, no real data) |
| IT Equipment List | `pages/AssetITPage.jsx` | Live — real Supabase data via useITAssets |
| Asset Detail (Kendaraan) | `pages/AssetDetailPage.jsx` | Live — router, routes to IT or Kendaraan tabs |
| Asset Detail (IT Equipment) | `pages/AssetDetailITPage.jsx` | Live — 7 tabs, real data |
| Kendaraan List | routed via AssetITPage | Live (categoryCode='VEH') |
| Furniture / Properti | ComingSoon stub | Placeholder |
| All other assets-* routes | ComingSoon stubs | Placeholder |

**Hook: `src/hooks/useAssets.js`**

| Export | Purpose |
|---|---|
| `useITAssets` | Paginated list filtered by category_id (2-step query) |
| `useAssetDetail` | Single asset fetch with soft-delete mutation |
| `useFuelLogs` | Fuel log records for a vehicle asset |
| `useITAssetDetail` | Parallel fetch: specs + network + software + maintenance |
| `ASSET_STATUS_CONFIG` | Status → label/type map |

**Supabase tables connected:**
`assets`, `asset_categories`, `asset_locations`, `asset_fuel_logs`,
`asset_specifications`, `asset_network`, `asset_software_licenses`, `asset_maintenance_records`  
(tables from migrations 025–027)

---

### 3.5 Module: HRGA Request (Service Management)

| Item | Details |
|---|---|
| Shell file | `src/modules/hrga/HrgaShell.jsx` |
| Lazy loaded | Yes (all 6 pages lazy inside the shell) |
| Own sidebar | No — uses App.jsx ModuleSidebar |
| Routes | `activeMenu === 'hrga'` or `activeMenu?.startsWith('hrga-')` |
| Status | **Partial/Live** — all pages exist and connect to Supabase |

**Pages:**

| Page | File | Status |
|---|---|---|
| My Requests | `pages/MyRequestsPage.jsx` | Live |
| All Requests | `pages/AllRequestsPage.jsx` | Live |
| Buat Request | `pages/BuatRequestPage.jsx` | Live — 3-step form |
| Pending Approval | `pages/PendingApprovalPage.jsx` | Live — inline approve/reject |
| Arsip | `pages/ArsipPage.jsx` | Live |
| Detail | `pages/HrgaDetailPage.jsx` | Live — approval timeline + activity feed |

**Legacy components (may be unused by new pages):**
- `components/HrgaRequestDetail.jsx` — old read-only detail modal
- `components/HrgaRequestForm.jsx` — old ATK form modal

**Shared utilities:**
- `HrgaShared.jsx` — barrel: exports components + re-exports from hrga-tokens.js
- `hrga-tokens.js` — design tokens, type configs, formatters, HRGA_TABLE_CSS

**Hook: `src/hooks/useHrgaRequests.js`**

| Export | Purpose |
|---|---|
| `useHrgaRequestTypes` | Active request types for a company |
| `useMyHrgaRequests` | Paginated list of own requests |
| `useAllHrgaRequests` | Paginated list of all company requests |
| `useHrgaRequestDetail` | Single request with items + approval trail |
| `useHrgaStats` | Counts by status (total, pending, approved, rejected) |
| `usePendingApprovals` | Requests in submitted/in_progress state |
| `submitHrgaRequest` | Create request header + items + notification queue |
| `cancelHrgaRequest` | Soft-cancel a submitted request |
| `submitApproval` | Insert approval record + update request status |

**Supabase tables connected:**
`hrga_request_types`, `hrga_requests`, `hrga_request_items`, `hrga_request_approvals`,
`hrga_approval_configs`, `hrga_notification_queue`, `document_sequences`,
`companies`, `profiles`, `roles`, `user_roles`

---

### 3.6 Module: App Launcher

| Item | Details |
|---|---|
| File | `src/modules/launcher/AppLauncher.jsx` |
| Lazy loaded | Yes |
| Purpose | Module selection grid — shown when no activeModule is selected |
| Data source | `ERP_MENU_GROUPS` passed as props from App.jsx |
| Group accent colors | Defined in `GROUP_ACCENT` constant inside the file |
| Status | **Live** |

---

### 3.7 Legacy Modules (inline in App.jsx — not yet extracted)

These modules render directly inside `App.jsx` without a dedicated shell or module directory:

| Menu ID | Route condition | Description | Data source |
|---|---|---|---|
| `manifest` | `activeMenu === 'manifest'` | Sales Order / SP Manifest list | `useSpItems`, `useCustomers` |
| `input` | `activeMenu === 'input'` | Input SP form | `useSpItems`, `useCustomers` |
| `shipment` | `activeMenu === 'shipment'` | Shipment & Fulfillment | `useSpItems` |
| `finance` | `activeMenu === 'finance'` | Finance Docs | `useSpItems` |
| `outstanding` | `activeMenu === 'outstanding'` | Outstanding tracker | `useSpItems` |
| `ar` | `activeMenu === 'ar'` | AR Tracker (TTF/BTB) | `useTtfs`, `useCustomers` |
| `customers` | `activeMenu === 'customers'` | Customer Management | `useCustomers` |
| `users` | `activeMenu === 'users'` | User Management (old) | `UserManagement` component |

**Notes on legacy modules:**
- `manifest`, `input`, `shipment`, `finance`, `outstanding`: All in `Logistics` menu group. SP data stored in `sp_items` and `customers` tables (legacy schema from migration 000).
- `ar`: AR Tracker uses `ttfs` and `btbs` tables (legacy schema).
- `customers`: `CustomersPage` function is defined at line ~2915 of App.jsx. Breadcrumb now says `Logistics · Customers`.
- `users`: Links to `UserManagement` component from `src/components/UserManagement.jsx` — appears to be an older user management UI, separate from the newer `UserAccessPage` in AdminShell.

---

## 4. Current Menu Structure (as-is)

### App Launcher Groups and Item Counts

| Module Group | Items | Live? |
|---|---|---|
| Core | 1 (Command Center) | Live |
| Commercial & CRM | 2 (CRM & Inquiry, Quotation) | Placeholder |
| Logistics | 8 (Sales Order/SP, Customer Mgmt, Job, Freight, PPJK, Trading, Shipment, Input SP) | Mixed — SP/Customer/Shipment/Input are live (legacy); Job/Freight/PPJK/Trading are placeholders |
| Procurement & Vendor | 3 (Proc Request, Purchase Order, Vendor Mgmt) | All placeholder |
| Inventory & Asset | 2 (Inventory, Asset Management) | Inventory is placeholder; Asset Management is live (partial) |
| Finance & Accounting | 8 (Job Costing, Billing, AR, AP, Cash/Bank, Accounting, Finance Docs, Outstanding) | AR/Finance Docs/Outstanding are live (legacy); rest are placeholder |
| Service Management | 2 (HRGA Request, IT Service Mgmt) | HRGA is live; IT is placeholder |
| Workflow & Document | 2 (Approval Center, Document Management) | All placeholder |
| Portal & Integration | 4 (API Center, Public Tracking, Customer Portal, Vendor Portal) | All placeholder |
| Reporting & Governance | 3 (Reporting, Performance, Audit) | All placeholder |
| Foundation | 2 (Master Data, Admin Settings) | Master Data is live; Admin Settings is placeholder |

### Asset Management Sidebar (App.jsx ModuleSidebar)

```
Asset Management
├── Dashboard
├── Analytics & Reports
├── [section] Assets
│   ├── Kendaraan
│   ├── IT Equipment (badge: 128)
│   ├── Furniture & Office
│   └── Properti
├── [section] Maintenance
│   ├── Jadwal Maintenance
│   ├── History Maintenance
│   └── Work Orders (badge: 6)
├── [section] Dokumen
│   ├── Semua Dokumen
│   ├── Akan Expired (badge: 9)
│   └── Sudah Expired (badge: 4)
└── [section] Administration
    ├── Kategori Aset
    ├── Lokasi & Ruangan
    ├── Vendor & Supplier
    └── Settings
```
*Badges are hardcoded. Most items render `ComingSoon` stubs.*

### HRGA Request Sidebar (App.jsx ModuleSidebar with children)

```
Service Management
└── HRGA Request (expandable)
    ├── My Requests
    ├── Buat Request
    ├── [section] Management
    ├── Semua Request
    ├── Pending Approval (badge: empty string — placeholder)
    └── Arsip
```

### Admin / Master Data Sidebar (AdminShell own sidebar)

```
Master Data
├── [section] Organization
│   ├── Companies (read-only)
│   ├── Branches (CRUD)
│   ├── Departments (CRUD)
│   └── Positions (CRUD)
├── [section] Access Control
│   ├── Roles (read-only)
│   └── User Access (list + Add User)
└── [section] Configuration
    ├── Document Types (read-only)
    ├── Status Catalog (read-only)
    ├── Taxes (read-only)
    └── Payment Terms (read-only)
```

---

## 5. Supabase Migrations

### Applied to Staging (confirmed via `supabase migration list`)

| # | File | Phase | Description | Status on Staging |
|---|---|---|---|---|
| 000 | `20260524000000_legacy_app_baseline.sql` | 1.0D++ | Creates legacy sp_items, customers, ttfs, btbs tables | ✅ Applied |
| 001 | `20260524000001_companies.sql` | 1.0B | companies table | ✅ Applied |
| 002 | `20260524000002_branches_departments.sql` | 1.0B | branches, departments tables | ✅ Applied |
| 003 | `20260524000003_status_catalog.sql` | 1.0B | status_catalog table + seed | ✅ Applied |
| 004 | `20260524000004_document_types_sequences.sql` | 1.0B | document_types, document_sequences tables + seed | ✅ Applied |
| 005 | `20260524000005_roles_permissions.sql` | 1.0B | roles, permissions, role_permissions, user_roles | ✅ Applied |
| 006 | `20260524000006_taxes_payment_terms_currencies.sql` | 1.0B | taxes, payment_terms, currencies, exchange_rates | ✅ Applied |
| 007 | `20260524000007_profiles_extension.sql` | 1.0B | profiles extension (company_id, branch, dept, position) | ✅ Applied |
| 008 | `20260524000008_customers_extension.sql` | 1.0B | customers extension (company_id, RLS fields) | ✅ Applied |
| 009 | `20260524000009_vendors_products_positions.sql` | 1.0B | vendors, products, positions tables | ✅ Applied |
| 010 | `20260524000010_approval_engine.sql` | 1.0B | approval_requests, approval_steps, approval_configs | ✅ Applied |
| 011 | `20260524000011_cost_centers_chart_of_accounts.sql` | 1.0B | cost_centers, chart_of_accounts | ✅ Applied |
| 012 | `20260524000012_asset_management.sql` | 1.0B | asset_categories, asset_locations, assets (schema only) | ✅ Applied |
| 013 | `20260524000013_role_permissions_seed.sql` | 1.0C | Seeds role_permissions junction table | ✅ Applied |
| 014 | `20260524000014_rls_policy_draft.sql` | 1.0D | Enables RLS on all P0/P1 master data tables | ✅ Applied |
| 015 | `20260524000015_profiles_customers_rls_transition.sql` | 1.0F | Backfill company_id on profiles + customers; RLS transition | ✅ Applied |
| 016 | `20260524000016_auth_profile_trigger_company_defaults.sql` | 1.0F+ | Patches handle_new_user() trigger for company defaults | ✅ Applied |
| 017 | `20260524000017_rls_hardening_public_tables.sql` | 1.0H | RLS hardening for 8 remaining public tables | ✅ Applied |
| 018 | `20260524000018_org_master_crud_super_admin_rls.sql` | 1.0I | Super admin INSERT/UPDATE on org master tables | ✅ Applied |
| 019 | `20260524000019_org_master_super_admin_read_bypass.sql` | 1.0I | Super admin SELECT bypass (top-level OR) for org master | ✅ Applied |
| 020 | `20260602000020_hrga_request_schema.sql` | 2.0A | 9 HRGA tables: hrga_request_types, hrga_requests, hrga_request_items, hrga_request_approvals, hrga_request_attachments, hrga_notification_queue, hrga_approval_configs, hrga_offboarding_checklists, hrga_offboarding_items | ✅ Applied |
| 021 | `20260602000021_hrga_request_seed.sql` | 2.0A | Seeds 4 roles + 20 request types × 3 companies + 108 approval configs | ✅ Applied |
| 022 | `20260602000022_hrga_grants.sql` | 2.0A | GRANT DML to authenticated role on CLI-created HRGA tables | ✅ Applied |
| 023 | `20260602000023_document_sequences_hrg_fix.sql` | 2.0A | increment_document_sequence RPC + relaxed INSERT policy + HRG seed | ✅ Applied |
| 024 | `20260602000024_hrga_request_items_rls_fix.sql` | 2.0A | Fixes hrga_request_items INSERT RLS (status IN draft/submitted) | ✅ Applied |
| 025 | `20260603000025_assets_it_equipment.sql` | 2.x | Extends assets with IT columns; seeds asset_categories IT-EQP + locations + 12 IT assets | ✅ Applied |
| 026 | `20260603000026_assets_kendaraan.sql` | 2.x | Adds vehicle columns + asset_fuel_logs table; seeds VEH category + 1 truck + 4 fuel logs | ✅ Applied |
| 027 | `20260603000027_assets_it_specs.sql` | 2.x | Creates asset_specifications, asset_network, asset_software_licenses, asset_maintenance_records; seeds IT-LAP-0241 data | ❌ Not applied to staging |

**Note on migrations 020–024:** These were applied to staging directly (not via CLI push). The local migration file list in `supabase migration list` shows them without a matching remote version, which required a `supabase migration repair` step. The migrations are confirmed applied.

**Note on staging vs production:** Production execution is BLOCKED for all migrations. Only staging has been used for verification.

---

## 6. Known Issues / TODOs

### A. Uncommitted Work

The entire asset management module and several HRGA enhancements are uncommitted on `phase-2-asset-management`. There are no commits on this branch ahead of `phase-5-supabase`. Risk: work could be lost if branch is deleted or rebased carelessly.

### B. PLANNED_MODULES — All Placeholder (ComingSoon) Entries

The following `activeMenu` values render a `ComingSoonPage` component with no real functionality:

**Commercial & CRM:** `crm`, `quotation`

**Logistics (planned, no implementation):** `job`, `freight`, `ppjk`, `trading`

**Procurement & Vendor:** `procRequest`, `purchaseOrder`, `vendors`

**Inventory & Asset:** `inventory`

**Finance & Accounting:** `jobCosting`, `billing`, `ap`, `cashBank`, `accounting`

**Service Management:** `it`

**Workflow & Document:** `approvals`, `docMgmt`

**Portal & Integration:** `apiCenter`, `publicTracking`, `customerPortal`, `vendorPortal`

**Reporting & Governance:** `reports`, `performance`, `audit`

**Foundation:** `adminSettings`

### C. Asset Management — Hardcoded Badges

In `ERP_MENU_GROUPS`, asset sidebar items have hardcoded badges:
- `assets-it` → badge `'128'` (not from real data)
- `assets-workorders` → badge `'6'` (hardcoded)
- `assets-expiring` → badge `'9'` (hardcoded)
- `assets-expired` → badge `'4'` (hardcoded)
- `hrga-pending-approval` → badge `''` (empty string — visible but empty)

### D. Legacy Components Potentially Unused

- `src/modules/hrga/components/HrgaRequestDetail.jsx` — original detail modal, predates `HrgaDetailPage.jsx`. May no longer be imported anywhere.
- `src/modules/hrga/components/HrgaRequestForm.jsx` — original ATK form modal. May no longer be used if `BuatRequestPage.jsx` has replaced it.
- `src/components/UserManagement.jsx` — legacy user management page (accessed via `activeMenu === 'users'`). The newer `UserAccessPage.jsx` in AdminShell covers the same domain. The `users` menu item does not appear in `ERP_MENU_GROUPS` (it was likely a legacy route).

### E. App.jsx is Still Monolithic

`src/App.jsx` is 3593 lines. It contains:
- Global state management (customers, SP items, AR data)
- 7 legacy page components (Manifest, Input SP, Shipment, Finance, Outstanding, AR Tracker, Customers)
- Multiple inline functions (FormModal at ~line 2476, CustomersPage at ~line 2915, ARModal at ~line 3448, etc.)
- Component definitions (KPICard, StatusBadge, ComingSoonPage, SidebarItem, ModuleSidebar, etc.)
- Design token constants (PASTEL palette — also duplicated in Dashboard.jsx, Login.jsx, AuthGate.jsx, ErrorBoundary.jsx, UserManagement.jsx, AdminShell.jsx)

### F. PASTEL Design Token Duplication

The PASTEL color palette is defined independently in at least 7 files:
`App.jsx`, `Dashboard.jsx`, `Login.jsx`, `AuthGate.jsx`, `ErrorBoundary.jsx`, `UserManagement.jsx`, `AdminShell.jsx`

The Asset Management and HRGA modules use a different `D` design token object (`#F6EFE3` warm beige palette), which is also defined separately per file (AssetDashboardPage, AssetITPage, AssetDetailPage, AssetDetailITPage).

### G. Migration 027 Not Yet Applied to Staging

`asset_specifications`, `asset_network`, `asset_software_licenses`, `asset_maintenance_records` tables do not exist on staging. The `AssetDetailITPage.jsx` gracefully handles missing tables (returns null/empty when `error.code === '42P01'`), so the IT Equipment detail page works — but all Spesifikasi/Network/Software/Maintenance tabs show empty states.

### H. Master Data — Read-Only Gaps

These admin pages are read-only with no CRUD:
- Companies — no Create/Edit/Delete
- Roles — no Create/Edit/Delete
- Document Types — no Create/Edit/Delete
- Status Catalog — no Create/Edit/Delete
- Taxes — no Create/Edit/Delete
- Payment Terms — no Create/Edit/Delete

### I. No Test Coverage

Zero test files exist anywhere in the repository. No testing framework is installed.

### J. docs/ Directory Structure vs CLAUDE.md

CLAUDE.md references several files that do not exist in `docs/`:
- `docs/security/security-baseline.md` — does not exist (only `rls-policy-draft.md`)
- `docs/performance/performance-baseline.md` — does not exist
- `docs/workflow/approval-engine.md` — does not exist
- `docs/workflow/document-numbering.md` — does not exist
- `docs/workflow/status-lifecycle.md` — does not exist
- `docs/integration/api-strategy.md` — does not exist (only `api-strategy.md` in wrong location)
- `docs/operations/deployment-strategy.md` — does not exist
- `docs/operations/monitoring-strategy.md` — does not exist

Files that exist in `docs/` but not referenced by CLAUDE.md:
- `docs/database/master-data-architecture.md`
- `docs/database/seed-strategy.md`
- `docs/modules/hrga-request-schema-plan.md`
- Various operation logs in `docs/operations/`

---

## 7. Recommended Next Steps

Listed in priority order based on audit findings.

### Priority 1 — Commit Current Work

All asset management code and HRGA enhancements are uncommitted. This is the highest-risk item.
- Commit everything on `phase-2-asset-management` with appropriate commit messages
- Open PR against `phase-5-supabase`
- Apply migration 027 to staging before merging (IT specs tables)

### Priority 2 — Admin CRUD Gaps (Phase 1.0L)

Six admin pages are still read-only. The next logical step in the master data phase:
- Add Create/Edit/Delete to: **Companies, Roles, Taxes, Payment Terms**
- Document Types and Status Catalog can remain read-only (managed by migrations)
- These follow the exact same pattern as Branches/Departments/Positions (already working)

### Priority 3 — Asset Management Completeness

The asset module has significant placeholder coverage:
- Apply migration 027 to staging (IT specs tables)
- Build **Kendaraan list page** (currently routes to AssetITPage with categoryCode='VEH' — works but may need VEH-specific columns like plate_number in the table)
- Add **Tambah Aset** step-form modal (button exists in AssetITPage but is not wired)
- Wire **Edit / Clone / Delete** actions in AssetDetailPage and AssetDetailITPage
- Consider seeding Furniture (FURN) and Properti (BLDG) categories + assets for UI testing

### Priority 4 — HRGA Approval Flow Completion

The approval flow is partially implemented:
- `submitApproval` function exists and updates request status correctly
- Verify the approval config seeding (108 configs for 20 types × 3 companies) works end-to-end
- Test BuatRequestPage → submit → PendingApprovalPage → approve → verify status change
- Remove or repurpose legacy `HrgaRequestDetail.jsx` and `HrgaRequestForm.jsx` if unused

### Priority 5 — Logistics Module Build-Out

`job`, `freight`, `ppjk`, `trading` are placeholders but occupy the Logistics menu group alongside live legacy SP/Shipment pages:
- Job Management is a P1 priority per product direction
- Would require new schema (jobs table) and approval flow linkage
- Consolidating legacy SP flow (currently in App.jsx) into a proper module would reduce App.jsx size

### Priority 6 — App.jsx Modularization

App.jsx at 3593 lines is a maintenance risk. Extraction candidates:
- `CustomersPage` function → `src/modules/logistics/pages/CustomerManagementPage.jsx`
- `Manifest`-related rendering → `src/modules/logistics/pages/SalesOrderPage.jsx`
- `FormModal` (SP form) → `src/modules/logistics/components/SalesOrderForm.jsx`
- `PASTEL` palette → `src/styles/tokens.js` (shared constants)

This should be done incrementally — one component per PR with lint + build verification.

### Priority 7 — Documentation Alignment

Update `docs/` to match what actually exists:
- Create the missing security/performance/workflow docs referenced by CLAUDE.md, or update CLAUDE.md to point to actual doc paths
- Update `docs/architecture/implementation-roadmap.md` to reflect Phase 2.x asset work and current phase status
- Update CLAUDE.md "Current Phase" section (still says Phase 1.0K as current, but Phase 2.x work is active)
