> ⚠️ SUPERSEDED — draft desain pra-Phase 1.0B (24 Mei 2026). Skema live = schema_snapshot.sql + docs/Governance/03_DATA_MODEL.md. Jangan dijadikan acuan.

# Nexus by MSI — Seed Strategy

**Phase:** 1.0C — Seed Strategy Review
**Date:** 2026-05-24
**Branch:** `phase-1-master-data-seed-strategy`
**Status:** Draft — no seed SQL executed against any database

---

## Important Notice

> This document defines the seed strategy only.
> No migration or seed SQL is executed against Supabase in Phase 1.0C.
> All migrations remain in DRAFT status until explicitly approved and applied.
> See Phase 1.0D for RLS policy drafts before any migration is executed.

---

## 1. Purpose

Seed data is the baseline dataset that must exist in the database before any user can log in, create documents, or use any module. Without seeds:
- Company-scoped queries return empty (no `company_id` to filter on)
- Status badge rendering fails (no `status_catalog` rows)
- Document number generation fails (no `document_types` rows)
- Permission checks fail (no `roles` or `permissions` rows)

This document defines exactly what data is seeded, in what order, and why.

---

## 2. Seed Execution Order

Seed data is embedded in the migration files (not separate seed files). This ensures that the database is always in a valid state after running migrations in order. The order follows foreign key dependencies strictly.

| Order | Migration File | What is seeded |
|-------|---------------|----------------|
| 1 | `20260524000001_companies.sql` | MSI, JCI, SBI companies |
| 2 | `20260524000002_branches_departments.sql` | 1 HO branch per company; 7 departments per company |
| 3 | `20260524000003_status_catalog.sql` | 13 global status values |
| 4 | `20260524000004_document_types_sequences.sql` | 15 document types per company (45 rows total) |
| 5 | `20260524000005_roles_permissions.sql` | 12 system roles per company (36 rows); global permission catalog (~80 rows) |
| 6 | `20260524000006_taxes_payment_terms_currencies.sql` | 4 taxes × 3 companies; 6 payment terms × 3 companies; 5 currencies |
| 7 | `20260524000007_profiles_extension.sql` | Schema only — no seed data |
| 8 | `20260524000008_customers_extension.sql` | Schema only — no seed data |
| 9 | `20260524000009_vendors_products_positions.sql` | 5 position levels × 3 companies (15 rows) |
| 10 | `20260524000010_approval_engine.sql` | Schema only — no seed data |
| 11 | `20260524000011_cost_centers_chart_of_accounts.sql` | Schema only — no seed data |
| 12 | `20260524000012_asset_management.sql` | Schema only — no seed data |
| **13** | **`20260524000013_role_permissions_seed.sql`** | **role_permissions junction — full permission matrix** |

**Rule:** Migrations must always be applied in numerical order. Never skip a migration. Never apply migration N+1 before migration N completes without error.

---

## 3. Domain-by-Domain Seed Review

---

### 3.1 Companies

**Migration:** `20260524000001_companies.sql`
**Seed method:** `INSERT ... ON CONFLICT (code) DO NOTHING` — idempotent

| code | name | legal_name | business_focus |
|------|------|-----------|----------------|
| `MSI` | MSI Group | PT MSI Group | Freight Forwarding |
| `JCI` | JCI | PT JCI | PPJK / Customs Clearance |
| `SBI` | Storbit / SBI | PT Storbit Indonesia | General Trading |

**Verification:**
```sql
SELECT code, name, business_focus, is_active FROM companies ORDER BY code;
-- Expected: 3 rows — JCI, MSI, SBI (all is_active = true)
```

**Notes:**
- These are the only 3 entities in MSI Group as of Phase 1.0.
- Any future entity expansion requires a new migration row, not manual insertion.

---

### 3.2 Branches

**Migration:** `20260524000002_branches_departments.sql`
**Seed method:** `INSERT ... ON CONFLICT (company_id, code) DO NOTHING` — idempotent

| company | code | name | city |
|---------|------|------|------|
| MSI | HO | Head Office | Jakarta |
| JCI | HO | Head Office | Jakarta |
| SBI | HO | Head Office | Jakarta |

**Verification:**
```sql
SELECT c.code AS company, b.code, b.name, b.city
FROM branches b JOIN companies c ON c.id = b.company_id
ORDER BY c.code;
-- Expected: 3 rows
```

**Notes:**
- Only one branch seeded per company (Head Office Jakarta).
- Sub-branches (Surabaya, Medan, etc.) are configured by company admins after go-live, not seeded.

---

### 3.3 Departments

**Migration:** `20260524000002_branches_departments.sql`
**Seed method:** CROSS JOIN + `ON CONFLICT (company_id, code) DO NOTHING` — idempotent

| code | name | Role in document numbering |
|------|------|-----------------------------|
| `SLS` | Sales | Quotation, Sales Order — `QT/MSI/SLS/2026/0001` |
| `LOG` | Logistics / Operations | Shipment, Customs, Trading — `SHP/MSI/LOG/2026/0001` |
| `FIN` | Finance | Invoice, Payment, Journal Entry — `INV/MSI/FIN/2026/0001` |
| `PROC` | Procurement | PR, PO, GRN — `PO/MSI/PROC/2026/0001` |
| `IT` | Information Technology | Asset, IT Ticket — `AST/MSI/IT/2026/0001` |
| `MGMT` | Management | General management — `{DOC}/MSI/MGMT/2026/0001` |
| `HR` | Human Resources | HRGA Request — `HRG/MSI/HR/2026/0001` |

**Total seed rows:** 7 departments × 3 companies = **21 rows**

**Verification:**
```sql
SELECT c.code AS company, d.code, d.name
FROM departments d JOIN companies c ON c.id = d.company_id
ORDER BY c.code, d.code;
-- Expected: 21 rows
```

**Notes:**
- Department codes appear verbatim in document numbers. They are immutable after go-live — changing a code has no effect on past document numbers (those are stored strings).
- `parent_id` is NULL for all seeded rows (flat structure). Hierarchy is optional and admin-configured.

---

### 3.4 Status Catalog

**Migration:** `20260524000003_status_catalog.sql`
**Seed method:** `ON CONFLICT (code) DO NOTHING` — idempotent
**Source:** `docs/workflow/status-lifecycle.md`

| code | label | is_terminal | color_class |
|------|-------|:-----------:|-------------|
| `draft` | Draft | false | `bg-gray-100 text-gray-600` |
| `submitted` | Submitted | false | `bg-blue-100 text-blue-700` |
| `under_review` | Under Review | false | `bg-indigo-100 text-indigo-700` |
| `revision_requested` | Revision Requested | false | `bg-orange-100 text-orange-700` |
| `revised` | Revised | false | `bg-yellow-100 text-yellow-700` |
| `approved` | Approved | false | `bg-green-100 text-green-700` |
| `rejected` | Rejected | **true** | `bg-red-100 text-red-700` |
| `cancelled` | Cancelled | **true** | `bg-red-50 text-red-500` |
| `in_progress` | In Progress | false | `bg-sky-100 text-sky-700` |
| `completed` | Completed | **true** | `bg-emerald-100 text-emerald-700` |
| `archived` | Archived | **true** | `bg-slate-100 text-slate-500` |
| `on_hold` | On Hold | false | `bg-amber-100 text-amber-700` |
| `overdue` | Overdue | false | `bg-rose-100 text-rose-700` |

**Total seed rows:** 13 (global — no company_id)

**Verification:**
```sql
SELECT code, label, is_terminal, sort_order FROM status_catalog ORDER BY sort_order;
-- Expected: 13 rows
SELECT COUNT(*) FROM status_catalog WHERE is_terminal = true;
-- Expected: 4 (rejected, cancelled, completed, archived)
```

**Discrepancy note:** `docs/workflow/status-lifecycle.md` section 2.1 lists terminal states as `rejected, cancelled, archived` (3 values). The migration also marks `completed` as terminal (4 values). This is intentional — a completed document should not transition further. The status-lifecycle doc should be updated to include `completed` as terminal. See decision log entry 2026-05-24.

---

### 3.5 Document Types

**Migration:** `20260524000004_document_types_sequences.sql`
**Seed method:** CROSS JOIN + `ON CONFLICT (company_id, code) DO NOTHING` — idempotent
**Source:** `docs/workflow/document-numbering.md`

| code | name | module | dept_code | approval_required |
|------|------|--------|-----------|:-----------------:|
| `QT` | Quotation | sales | SLS | ✅ |
| `SP` | Surat Pesanan / Sales Order | sales | SLS | ✅ |
| `SHP` | Shipment / Job Card (Freight) | operations | LOG | ❌ |
| `CUS` | Customs Job Card (PPJK) | operations | LOG | ❌ |
| `TRD` | Trading Order | operations | LOG | ✅ |
| `PR` | Purchase Request | procurement | PROC | ✅ |
| `PO` | Purchase Order | procurement | PROC | ✅ |
| `GRN` | Goods Receipt Note | procurement | PROC | ❌ |
| `INV` | Invoice | finance | FIN | ✅ |
| `RCP` | Payment Receipt | finance | FIN | ❌ |
| `PV` | Payment Voucher | finance | FIN | ✅ |
| `JE` | Journal Entry | accounting | FIN | ✅ |
| `AST` | Asset Register | assets | IT | ✅ |
| `TCK` | IT Service Ticket | it | IT | ❌ |
| `HRG` | HRGA Request | hrga | HR | ✅ |

**Total seed rows:** 15 document types × 3 companies = **45 rows**

**Company-specific notes:**

| doc_code | MSI | JCI | SBI | Rationale |
|----------|:---:|:---:|:---:|-----------|
| `QT`, `SP` | ✅ | ✅ | ✅ | All companies quote and sell |
| `SHP` | ✅ primary | ⚠️ secondary | ⚠️ secondary | Freight job card — MSI primary; JCI/SBI may use |
| `CUS` | ⚠️ secondary | ✅ primary | ⚠️ secondary | PPJK customs job — JCI primary |
| `TRD` | ⚠️ secondary | ⚠️ secondary | ✅ primary | Trading order — SBI primary |
| All procurement | ✅ | ✅ | ✅ | All companies procure |
| All finance | ✅ | ✅ | ✅ | All companies invoice/pay |
| `AST`, `TCK`, `HRG` | ✅ | ✅ | ✅ | Cross-company operational |

**Seed decision:** All 15 types seeded as `is_active = true` for all 3 companies. Company admins set `is_active = false` for doc types that don't apply to their operations. This avoids conditional seeding logic while preserving flexibility.

**SP sequence initialization (critical):**
```sql
-- BEFORE enabling document number generation for SP:
-- 1. Inspect current max SP number from existing data:
--    SELECT MAX(sp_no) FROM sp_items;
-- 2. Manually insert or update the sequence row:
--    INSERT INTO document_sequences
--        (company_id, document_type, department_code, year, last_sequence)
--    SELECT id, 'SP', 'SLS', EXTRACT(YEAR FROM NOW())::smallint, <max_sp_no>
--    FROM companies WHERE code = 'SBI'
--    ON CONFLICT (company_id, document_type, department_code, year, month) DO UPDATE
--    SET last_sequence = EXCLUDED.last_sequence;
-- This prevents duplicate SP numbers when the new numbering engine goes live.
```

**Verification:**
```sql
SELECT c.code AS company, dt.code, dt.name, dt.department_code, dt.approval_required
FROM document_types dt JOIN companies c ON c.id = dt.company_id
ORDER BY c.code, dt.module, dt.code;
-- Expected: 45 rows (15 × 3 companies)
```

---

### 3.6 Roles

**Migration:** `20260524000005_roles_permissions.sql`
**Seed method:** CROSS JOIN + `ON CONFLICT (company_id, code) DO NOTHING` — idempotent
**Source:** `docs/security/permission-matrix.md`

| code | name | is_system_role | Legacy mapping |
|------|------|:--------------:|----------------|
| `super_admin` | Super Admin | ✅ | `super` |
| `admin` | Admin | ✅ | — (new) |
| `bod` | BOD / Director | ✅ | — (new) |
| `finance_controller` | Finance Controller | ✅ | — (new) |
| `finance_staff` | Finance Staff | ✅ | `finance` |
| `operations_head` | Operations Head | ✅ | — (new) |
| `operations_staff` | Operations Staff | ✅ | `logistic` |
| `sales_head` | Sales Head | ✅ | — (new) |
| `sales_staff` | Sales Staff | ✅ | — (new) |
| `procurement_head` | Procurement Head | ✅ | — (new) |
| `procurement_staff` | Procurement Staff | ✅ | `procurement` |
| `viewer` | Viewer | ✅ | `management` |

**Total seed rows:** 12 roles × 3 companies = **36 rows**

**Legacy role mapping (Phase 1.0F):**

```
profiles.role (old enum)  →  user_roles.role_id (new)
────────────────────────────────────────────────────
super                     →  super_admin
logistic                  →  operations_staff
procurement               →  procurement_staff
finance                   →  finance_staff
management                →  viewer
```

**Rule:** The legacy `profiles.role` enum column is NOT removed in Phase 1.0B or 1.0C. It remains until Phase 1.0F migration is verified in production. See migration 007 notes.

**Verification:**
```sql
SELECT c.code AS company, r.code, r.name, r.is_system_role
FROM roles r JOIN companies c ON c.id = r.company_id
ORDER BY c.code, r.code;
-- Expected: 36 rows
```

---

### 3.7 Permissions

**Migration:** `20260524000005_roles_permissions.sql`
**Seed method:** `ON CONFLICT (module, action) DO NOTHING` — idempotent
**Scope:** Global — no company_id

**Module groups and permission counts:**

| Module Group | Modules | Approx. Permissions |
|---|---|---|
| Organization | companies, branches, departments, users, roles | 18 |
| Master Data | customers, vendors, products | 17 |
| Sales | quotations, sales_orders | 15 |
| Operations | shipments | 5 |
| Procurement | purchase_requests, purchase_orders | 12 |
| Finance | invoices, payments, ar, ap | 16 |
| Accounting | journal_entries | 4 |
| Platform | reports, settings, audit_logs | 5 |

**Verification:**
```sql
SELECT module, COUNT(*) AS permission_count FROM permissions GROUP BY module ORDER BY module;
SELECT COUNT(*) FROM permissions;
-- Expected: ~80 rows across 17+ modules
```

---

### 3.8 Role-Permissions Matrix

**Migration:** `20260524000013_role_permissions_seed.sql` ← **Phase 1.0C deliverable**
**Seed method:** Subquery joins + `ON CONFLICT (role_id, permission_id) DO NOTHING` — idempotent

This is the main deliverable of Phase 1.0C. The full permission matrix is defined in migration 013.

**Matrix summary:**

| Role | Scope | Permission level |
|------|-------|-----------------|
| `super_admin` | All modules | Full — all permissions |
| `admin` | All modules | Full — except `companies.edit`, `settings.config` |
| `bod` | View + approve | Strategic view and final approval on key docs |
| `finance_controller` | Finance + view | Full finance CRUD, view all, approve finance docs |
| `finance_staff` | Finance entry | Finance data entry, limited approve |
| `operations_head` | Operations + view | Full operations, approve shipments and SPs |
| `operations_staff` | Operations entry | Shipment create/edit, view customers/sales |
| `sales_head` | Sales + view | Full sales CRUD, approve quotations and SPs |
| `sales_staff` | Sales entry | Quotation and SP create/submit |
| `procurement_head` | Procurement + view | Full procurement CRUD, approve PR/PO |
| `procurement_staff` | Procurement entry | PR and PO create/submit, vendor CRUD |
| `viewer` | Read-only | View customers, vendors, sales, shipments, reports |

**Verification:**
```sql
SELECT r.code, COUNT(rp.id) AS permission_count
FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
JOIN companies c ON c.id = r.company_id WHERE c.code = 'MSI'
GROUP BY r.code ORDER BY permission_count DESC;
-- Expected: super_admin has most (all ~80), viewer has fewest (~8)
```

---

### 3.9 Taxes

**Migration:** `20260524000006_taxes_payment_terms_currencies.sql`
**Seed method:** CROSS JOIN + `ON CONFLICT (company_id, code) DO NOTHING` — idempotent

| code | name | rate | notes |
|------|------|-----:|-------|
| `PPN11` | PPN 11% (VAT) | 11.0000% | Standard PPN since April 2022 |
| `PPH23` | PPh Pasal 23 (2%) | 2.0000% | Withholding on services |
| `PPH21` | PPh Pasal 21 (5%) | 5.0000% | Withholding on employment income |
| `TAXFREE` | Non-Taxable / Tax Exempt | 0.0000% | For non-taxable items |

**Total seed rows:** 4 taxes × 3 companies = **12 rows**

**Important rules:**
- Never modify `rate` on a code that has been used in a posted transaction. Corrupt historical amounts.
- To update a rate: deactivate old code, create new code with updated rate.

---

### 3.10 Payment Terms

**Migration:** `20260524000006_taxes_payment_terms_currencies.sql`
**Seed method:** CROSS JOIN + `ON CONFLICT (company_id, code) DO NOTHING` — idempotent

| code | name | days_due |
|------|------|:--------:|
| `COD` | Cash on Delivery | 0 |
| `NET15` | Net 15 Days | 15 |
| `NET30` | Net 30 Days | 30 |
| `NET45` | Net 45 Days | 45 |
| `NET60` | Net 60 Days | 60 |
| `50UP` | 50% Uang Muka | 0 |

**Total seed rows:** 6 terms × 3 companies = **18 rows**

**Notes:**
- `50UP` has `days_due = 0` because it is a split-payment arrangement handled at invoice level, not a simple due-day offset.
- The existing `customers.payment_terms` (integer) column is preserved alongside `payment_terms_id` (FK) until Phase 1.0F migration converts and verifies all records.

---

### 3.11 Currencies

**Migration:** `20260524000006_taxes_payment_terms_currencies.sql`
**Seed method:** `ON CONFLICT (code) DO NOTHING` — idempotent
**Scope:** Global — ISO 4217

| code | name | symbol | decimal_places |
|------|------|:------:|:--------------:|
| `IDR` | Indonesian Rupiah | Rp | 0 |
| `USD` | US Dollar | $ | 2 |
| `SGD` | Singapore Dollar | S$ | 2 |
| `EUR` | Euro | € | 2 |
| `JPY` | Japanese Yen | ¥ | 0 |

**Total seed rows:** 5 (global)

**Notes:**
- IDR uses 0 decimal places in Indonesian business context (amounts always in whole Rupiah).
- Phase 1.0 operations are IDR-only. USD/SGD/EUR/JPY are seeded for multi-currency readiness in Phase 2–3.
- Exchange rates are NOT seeded — they are company-specific and change daily. Finance Admin enters live rates manually after go-live.

---

### 3.12 Exchange Rates

**No seed data.** Exchange rates must be entered manually by Finance Admin after go-live.

**Guidance for initial entry:**
```sql
-- Example: USD/IDR rate for MSI, effective 2026-05-24
INSERT INTO exchange_rates (company_id, from_currency, to_currency, rate, effective_date, notes)
SELECT id, 'USD', 'IDR', 16250.000000, '2026-05-24', 'Initial rate at go-live'
FROM companies WHERE code = 'MSI';
```

**Convention:** Rate is expressed as `1 unit of from_currency = rate units of to_currency`. Example: `from=USD, to=IDR, rate=16250` means 1 USD = 16250 IDR.

---

### 3.13 Positions

**Migration:** `20260524000009_vendors_products_positions.sql`
**Seed method:** CROSS JOIN + `ON CONFLICT (company_id, code) DO NOTHING` — idempotent

| code | name | level |
|------|------|-------|
| `STAFF` | Staff | Staff |
| `SPV` | Supervisor | Supervisor |
| `MGR` | Manager | Manager |
| `HEAD` | Head / Department Head | Head |
| `DIR` | Director / BOD | Director |

**Total seed rows:** 5 positions × 3 companies = **15 rows**

**Notes:**
- These are generic seniority levels. Actual job titles (e.g., "Export Documentation Staff", "Finance Manager") are added by company admins after go-live.
- The `level` field is used by the approval engine for threshold-based approval rules (e.g., any `Head`-level can approve invoices up to X).

---

### 3.14 What is NOT seeded in Phase 1.0C

The following domains require human input or Finance Controller approval before data can be seeded. They are created as empty tables in Phase 1.0B and filled post-go-live.

| Domain | Reason not seeded |
|--------|------------------|
| Customers | Existing data migrated in Phase 1.0F; new data entered by sales team |
| Vendors | No existing data; entered by procurement team after go-live |
| Products | Company-specific catalog; entered by admin after go-live |
| Chart of Accounts | Requires Finance Controller approval per company; complex Indonesian COA |
| Cost Centers | Defined after COA is approved |
| Exchange Rates | Live rates; daily entry by Finance Admin |
| Approval Rules | Configured per company workflow by company Admin |
| User Roles | Mapped from legacy profiles.role in Phase 1.0F |

---

## 4. Idempotency Guarantee

All seed inserts use `ON CONFLICT ... DO NOTHING`. This means:
- Running a migration twice produces the same result as running it once.
- Re-applying migrations to a clean dev database is safe.
- No seed insert will fail if the row already exists.

**Exceptions (require manual handling):**
- Exchange rates: no unique constraint check on re-insert; check manually before inserting.
- SP sequence: must inspect `MAX(sp_no)` before initializing the sequence — see section 3.5.

---

## 5. Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-24 | Seed data embedded in migration files, not separate seed files | Ensures atomic migration + seed; prevents state where schema exists but required data is missing |
| 2026-05-24 | All 15 document types seeded as `is_active = true` for all 3 companies | Avoids conditional seeding; company admins deactivate inapplicable types |
| 2026-05-24 | Exchange rates not seeded | Daily rates must be accurate at go-live; a stale seeded rate would corrupt financial calculations |
| 2026-05-24 | COA not seeded | Requires Finance Controller sign-off per company; complex Indonesian chart structure; not blocking Phase 1.0 |
| 2026-05-24 | `completed` marked as terminal in status_catalog despite status-lifecycle.md listing only 3 terminal states | Completed documents should not transition further; status-lifecycle.md to be updated in follow-up |
| 2026-05-24 | role_permissions seeded in separate migration 013 (not in migration 005) | Separates schema-and-role definition (005) from permission grant decisions (013); 013 can be revised without touching role definitions |

---

## 6. Verification Checklist (run after applying all migrations)

```sql
-- 1. Companies
SELECT COUNT(*) FROM companies;                              -- Expected: 3

-- 2. Branches
SELECT COUNT(*) FROM branches;                              -- Expected: 3

-- 3. Departments
SELECT COUNT(*) FROM departments;                           -- Expected: 21

-- 4. Status Catalog
SELECT COUNT(*) FROM status_catalog;                        -- Expected: 13
SELECT COUNT(*) FROM status_catalog WHERE is_terminal=true; -- Expected: 4

-- 5. Document Types
SELECT COUNT(*) FROM document_types;                        -- Expected: 45

-- 6. Roles
SELECT COUNT(*) FROM roles;                                 -- Expected: 36

-- 7. Permissions
SELECT COUNT(*) FROM permissions;                           -- Expected: ≥ 80

-- 8. Role-Permission assignments (per company)
SELECT r.code, COUNT(rp.id) perm_count
FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id
JOIN companies c ON c.id=r.company_id WHERE c.code='MSI'
GROUP BY r.code ORDER BY perm_count DESC;

-- 9. Taxes
SELECT COUNT(*) FROM taxes;                                 -- Expected: 12

-- 10. Payment Terms
SELECT COUNT(*) FROM payment_terms;                         -- Expected: 18

-- 11. Currencies
SELECT COUNT(*) FROM currencies;                            -- Expected: 5

-- 12. Positions
SELECT COUNT(*) FROM positions;                             -- Expected: 15
```
