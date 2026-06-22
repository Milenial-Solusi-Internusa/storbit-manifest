# Nexus by MSI — Development Progress
Last updated: 2026-06-04

## Overall Status

| Field | Value |
|-------|-------|
| Platform | React 19 + Vite 8 + Supabase + TailwindCSS |
| Production URL | https://nexus.dli.my.id |
| Repository | storbit-manifest |
| Default branch | `main` (Vercel auto-deploys from `main`) |
| Branch strategy | Direct commits to `main` — solo dev workflow |
| Build status | ✅ Passing |
| Lint status | ✅ Passing |

---

## Completed Modules

### Foundation (Phase 0–1) ✅

- [x] Auth + Supabase RLS + multi-company isolation (`company_id` on all tables)
- [x] App Launcher — Odoo-style module grid
- [x] Per-module vertical sidebar (Option B layout)
- [x] Master Data CRUD — Branches, Departments, Positions
- [x] User Access Management + Edge Function `create-user`
- [x] Admin pages: Companies, Roles, Document Types, Status Catalog, Taxes, Payment Terms (read-only)
- [x] ErrorBoundary baseline on all major routes
- [x] Bundle split + lazy loading for all module shells
- [x] Migrations 000–019 applied to staging

---

### Asset Management (Phase 2.0B) ✅

- [x] Asset dashboard + Analytics (stat cards, charts)
- [x] IT Equipment list page — real Supabase data, server-side pagination
- [x] IT Equipment detail page — 7 tabs (Info Dasar, Spesifikasi, Network, Health Score, Software & Lisensi, Maintenance, History)
- [x] Kendaraan detail page — 6 tabs (Info Dasar, Dokumen, Maintenance, Rute, BBM, History)
- [x] `useAssets.js` hook — `useITAssets`, `useAssetDetail`, `useFuelLogs`, `useITAssetDetail`
- [x] Migrations 025–027 applied to staging
- [ ] Kendaraan list page
- [ ] Tambah Aset step form
- [ ] Furniture & Office list + detail
- [ ] Properti list + detail
- [ ] Work Orders page
- [ ] Maintenance schedule page

---

### HRGA Request (Phase 2.0A) ✅

- [x] My Requests page — list + stat cards + cancel action
- [x] Buat Request — 3-step form (select type → fill items → review & submit)
- [x] Semua Request — manager/HRGA company-wide view
- [x] Pending Approval page
- [x] Arsip page
- [x] Detail Request — info grid, items table, approval progress, approval trail
- [x] Approval flow: submit → approve/reject with comment
- [x] `useHrgaRequests.js` hook — 6 exports, company-scoped
- [x] Migrations 020–024 applied to staging
- [ ] Kategori Request master data page
- [ ] SLA & Approval Flow configuration page
- [ ] IT Service Management module (tickets, access requests)

---

### Logistics — Sales Order (Phase 2.0C) ✅

- [x] Sales Order list page (`SalesOrderPage.jsx`)
  - [x] 4 KPI stat cards (Total SP, Pending Konfirmasi, Total Manifest, Outstanding)
  - [x] Tab pills: Semua SP / Pending Konfirmasi / Manifest / History
  - [x] Filter bar: search + customer + DC + overdue checkbox
  - [x] Sortable table: SP Date, No SP, Customer pill, Items, QTY, Outstanding, Status, DC, Deadline, Grand Total, Finance Progress bar
  - [x] Per-row action buttons: Konfirmasi / Tolak / Manifest / Detail
  - [x] Bulk select bar + bulk confirm + bulk export
  - [x] Client-side pagination (20/page)
  - [x] Konfirmasi / Tolak modal with reject-reason validation
- [x] SP Detail page (`SalesOrderDetailPage.jsx`)
  - [x] Header card: SP number, status badge, customer pill, item/qty count
  - [x] 3 pastel stat cards: SP Date (orange), Deadline (yellow), Finance Progress (purple)
  - [x] Overview tab: Financial Summary (left) + Finance Status table (right)
  - [x] Finance Status table: INV / FP / SUB / KRM per-stage progress bars
  - [x] Items tab: item-cards with 6-cell data grid + INV/FP/SUB/KRM pills + edit/delete
  - [x] Shipment tab: empty state (no shipment table yet)
  - [x] Dokumen tab: dropzone + empty state (no documents table yet)
  - [x] History tab: empty state (no audit log yet)
  - [x] Edit Item Modal: full controlled form, all `sp_items` fields, live auto-calc
  - [x] Delete SP Modal: type-to-confirm (`SP-NNN`), calls `dbRemoveRowsBySp`
  - [x] Danger Zone: visible to `super` / `logistic` roles only
- [ ] SP Detail: Konfirmasi/Tolak mutations persist to DB (needs `sp_items.status` migration)
- [ ] SP Detail: soft delete (needs `sp_items.deleted_at` migration)
- [ ] Input SP form
- [ ] General Trading sub-module
- [ ] Customer Storbit CRM
- [ ] Customer MSI CRM
- [ ] Customer JCI CRM
- [ ] Job Management (MSI Freight Forwarding)
- [ ] Freight Forwarding module
- [ ] Shipment Management
- [ ] JCI PPJK / Customs modules

---

## Planned Modules (Not Started)

- [ ] Commercial & CRM (Pipeline, Leads, Inquiry, Follow-up, Quotation)
- [ ] Procurement & Vendor (PR, PO, Vendor Management)
- [ ] Inventory / Warehouse
- [ ] Finance & Accounting (Job Costing, Billing, AR/AP, Cash/Bank, Accounting)
- [ ] Workflow & Document — Approval Center (reusable engine)
- [ ] Portal & Integration (Customer Portal, Vendor Portal, Public Tracking API)
- [ ] Reporting & Governance (Executive Dashboard, Audit Log, Compliance)

---

## Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| `src/App.jsx` 3,900+ lines, 30+ inline components | High | Needs incremental decomposition into `src/modules/` |
| `PASTEL` design tokens duplicated in 22+ files | Medium | Extract to `src/lib/tokens.js` |
| Legacy `can()` / `ROLES` hardcoded permission matrix | Medium | Replace with DB-driven role_permissions before RBAC work |
| `sp_items` has no `deleted_at` column | Medium | Add migration before SP delete goes to production |
| 6 Admin pages read-only (Companies, Roles, Taxes, etc.) | Low | Full CRUD deferred to Phase 1.0L |
| No test coverage | Low | No testing framework installed |
| `src/components/UserManagement.jsx` orphaned (383 lines) | Low | Not imported anywhere — safe to delete |
| `src/contexts/authCtx.js` stub (2 lines) | Low | Redundant — safe to delete |

---

## Branch Strategy

```
main  ←  production (Vercel auto-deploys)
         direct commits for solo dev workflow
fix/* ←  hotfixes merged immediately to main
```

All Phase 1 and Phase 2 feature branches have been merged and deleted as of 2026-06-04.
Repository is clean: only `main` on remote.

---

## Migration Status

| Range | Scope | Staging | Production |
|-------|-------|---------|------------|
| 000 | Legacy app baseline | ✅ | ❌ Blocked |
| 001–014 | Foundation schema (companies → RLS draft) | ✅ | ❌ Blocked |
| 015–019 | Profiles/customers RLS + auth trigger + RLS hardening + super admin | ✅ | ❌ Blocked |
| 020–024 | HRGA Request schema + seed + grants + RLS fixes | ✅ | ❌ Blocked |
| 025–027 | Asset Management extensions (IT, Kendaraan, specs) | ✅ | ❌ Blocked |

**Production gate:** All migrations require explicit written approval before execution on production Supabase project.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root shell, routing (state-driven, no React Router), global handlers |
| `src/lib/db.js` | Data access layer — all Supabase queries |
| `src/lib/supabase.js` | Supabase client singleton |
| `src/hooks/useSpItems.js` | SP items CRUD + optimistic UI |
| `src/hooks/useCustomers.js` | Customers CRUD |
| `src/hooks/useHrgaRequests.js` | HRGA request queries + mutations |
| `src/hooks/useAssets.js` | Asset list + detail + fuel logs |
| `src/modules/logistics/SalesOrderPage.jsx` | SP list page |
| `src/modules/logistics/SalesOrderDetailPage.jsx` | SP detail page |
| `src/modules/hrga/HrgaShell.jsx` | HRGA module shell + routing |
| `src/modules/assets/AssetShell.jsx` | Asset module shell + routing |
| `src/modules/admin/AdminShell.jsx` | Master Data / Admin shell |
| `supabase/functions/create-user/index.ts` | Edge Function: create user + profile |
