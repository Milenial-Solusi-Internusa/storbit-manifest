# Nexus by MSI — Master Data Architecture

**Phase:** 1.0A — Architecture Plan  
**Date:** 2026-05-24  
**Branch:** `phase-1-master-data-architecture`  
**Status:** Planning only — no schema, no migration, no RLS, no frontend code in this phase

---

## Important Notice

> This document is a planning document only.  
> No database schema changes, no migrations, no RLS policies, and no source code changes are included in Phase 1.0A.  
> All schema changes require explicit approval before any migration is written or executed.  
> See Phase 1.0B for schema/migration drafts.

---

## 1. Purpose

This document defines the full master data architecture for Nexus by MSI. It covers all foundational data domains that every downstream transaction module depends on. Getting master data right before transactions is non-negotiable — a poorly designed foundation requires painful retroactive schema changes, RLS rewrites, and data migrations at the worst possible time.

---

## 2. ERP-Wide Master Data Principles

### 2.1 Multi-Company by Design

Every business-scoped record must carry `company_id`. Records from one company must never be accessible to another company through any normal query path. RLS enforces this at the database level.

| Company Code | Name | Business Focus |
|---|---|---|
| MSI | MSI Group | Freight Forwarding |
| JCI | JCI | PPJK / Customs Clearance |
| SBI | Storbit / SBI | General Trading |

### 2.2 Global vs Company-Owned Records

| Type | Definition | Examples |
|---|---|---|
| Global | Readable by all authenticated users, writable by Super Admin only | `currencies`, `status_catalog`, `permissions` |
| Company-Scoped | Readable and writable only within a company | `customers`, `vendors`, `products`, `chart_of_accounts` |

Global records have no `company_id`. Company-scoped records always have `company_id NOT NULL`.

### 2.3 Active / Inactive Lifecycle

All master data must support an `is_active` flag.

- `is_active = true` — visible in dropdowns, selectable in documents
- `is_active = false` — hidden from business flows, still visible to admin and audit

### 2.4 Soft Delete by Default

All business master data uses soft delete via `deleted_at timestamptz`. Hard DELETE is never permitted on business tables.

- Active records: `WHERE deleted_at IS NULL`
- All records including deleted: `WHERE TRUE` (admin/audit only)
- Only Super Admin can view or restore soft-deleted records

### 2.5 Audit Important Changes

All master data create, update, and soft-delete events must produce an audit log entry. Mandatory events:
- `create` — any new master data record
- `update` — any field change
- `soft_delete` — record deactivated
- `restore` — soft-deleted record restored
- `role_change` — user role assignment changed

Sensitive fields (`credit_limit`, `bank_account`) must be masked in `old_data` / `new_data` JSON.

### 2.6 Document Numbering Dependency

`document_types` and `document_sequences` must exist before any transaction document can be created. All numbers are generated from the sequence table — manual entry is forbidden.

### 2.7 Approval Matrix Dependency

`approval_rules` must be configured per document type before any approval-requiring document can be submitted. The approval engine is reusable across all modules.

### 2.8 Role-Permission Dependency

`roles`, `permissions`, `role_permissions`, and `user_roles` must be seeded before any permission check is meaningful. Users must have at least one role assigned before they can perform any module-specific action.

### 2.9 Server-Side Search and Pagination

All master data list queries must implement:
- Server-side pagination (default 25 rows, max 100)
- Server-side search on indexed columns only
- Debounced search inputs (min 300ms)
- `company_id` filter on every query
- `deleted_at IS NULL` filter on every query
- Only required columns selected — no `SELECT *`

### 2.10 Gradual Migration from Storbit Manifest

The existing application has limited master data:
- **Customers** — flat list in Supabase, no `company_id`, no `code`, no `credit_limit`
- **User Profiles** — `profiles` table with `role` (enum), `active`, `full_name`

Migration rules:
1. New ERP tables run in parallel with existing tables during transition
2. Existing data is migrated additively during Phase 1.0F — no destructive changes
3. Existing `customers` and `profiles` tables are extended, not dropped
4. A seeded `company_id` must exist before any migration can insert company-scoped data

---

## 3. Master Data Domain Overview

| # | Domain | Table(s) | Scope | Soft Delete | Audit | Migration Priority | UI Priority |
|---|---|---|---|---|---|---|---|
| 1 | Company / Entity | `companies` | Global | No | Yes | **P0 — First** | Super Admin |
| 2 | Branch / Site | `branches` | Company | Yes | Yes | **P0** | Admin |
| 3 | Department | `departments` | Company | Yes | Yes | **P0** | Admin |
| 4 | Position / Job Title | `positions` | Company | Yes | Yes | P1 | Admin |
| 5 | Employee / User Profile | `user_profiles` | Company | Yes | Yes | **P0 — Extend existing** | Admin |
| 6 | Role & Permission | `roles`, `permissions`, `role_permissions`, `user_roles` | Company/Global | Yes/No | Yes | **P0 — Seed first** | Admin |
| 7 | Customer | `customers` | Company | Yes | Yes | **P0 — Migrate existing** | Sales/Admin |
| 8 | Vendor | `vendors` | Company | Yes | Yes | P1 | Procurement/Admin |
| 9 | Product / Service | `products` | Company | Yes | Yes | P1 | Admin/Sales |
| 10 | Cost Center | `cost_centers` | Company | Yes | Yes | P2 | Finance/Admin |
| 11 | Chart of Accounts | `chart_of_accounts` | Company | Yes | Yes | P2 | Finance/Admin |
| 12 | Tax | `taxes` | Company | Yes | Yes | P1 | Finance/Admin |
| 13 | Payment Terms | `payment_terms` | Company | Yes | Yes | P1 | Finance/Admin |
| 14 | Currency & Exchange Rate | `currencies`, `exchange_rates` | Global/Company | No/No | Yes | P1 | Finance/Admin |
| 15 | Document Type & Sequence | `document_types`, `document_sequences` | Company | No | Yes | **P0 — Before any document** | Admin |
| 16 | Status Catalog | `status_catalog` | Global | No | Yes | **P0 — Seed first** | Admin (read-only) |
| 17 | Approval Rule & Matrix | `approval_rules`, `approval_logs`, `approval_delegations` | Company | No | Yes | P1 | Admin |
| 18 | Asset Category & Location | `asset_categories`, `asset_locations` | Company | Yes | Yes | P3 | Finance/Admin |
| 19 | Asset Master Reference | `assets` | Company | Yes | Yes | P3 | Finance/Admin |

---

## 4. Domain Definitions

---

### Domain 1 — Company / Entity

| Attribute | Value |
|---|---|
| **Purpose** | Root anchor for all company-scoped data. Defines each legal business entity within MSI Group. Every company-scoped record references this via `company_id`. |
| **Table Candidate** | `companies` |
| **Scope** | Global |
| **company_id required** | No (this IS the company record) |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `code`, `name`, `legal_name`, `business_focus`, `tax_id`, `address`, `phone`, `email`, `logo_url`, `is_active` |
| **Required Fields** | `code`, `name` |
| **Uniqueness Rules** | `code` globally unique (e.g. MSI, JCI, SBI) |
| **Soft Delete** | No — use `is_active = false` to decommission |
| **Audit Log** | Yes — all changes |
| **RLS Assumptions** | Super Admin only can create/edit. All authenticated users can read their own company. Cross-company read only for Super Admin. |
| **Seed Data Required** | Yes — seed MSI, JCI, SBI on first migration |
| **Dependent Modules** | Every table with `company_id` — must exist first |
| **Migration Priority** | **P0 — Very first migration** |
| **UI Priority** | Super Admin only, Phase 1.0E |
| **Risks / Notes** | Until this table is seeded, no other company-scoped data can be inserted. Entirely new — no equivalent exists in current Storbit Manifest. |

---

### Domain 2 — Branch / Site

| Attribute | Value |
|---|---|
| **Purpose** | Represents a physical or operational location of a company (e.g. Head Office Jakarta, Surabaya Branch). Used for location-based reporting, cost center assignment, and document routing. |
| **Table Candidate** | `branches` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `address`, `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company (`company_id + code`) |
| **Soft Delete** | Yes |
| **Audit Log** | Yes |
| **RLS Assumptions** | Admin and above can manage. All company users can read. |
| **Seed Data Required** | Yes — seed at least one branch per company (Head Office) |
| **Dependent Modules** | User Profiles, Document Types, Cost Centers, Asset Locations |
| **Migration Priority** | **P0 — Needed before user profiles are fully populated** |
| **UI Priority** | Admin only, Phase 1.0E |
| **Risks / Notes** | Some companies may only ever have one branch. Branch must be optional for users — do not require branch assignment for all operations. |

---

### Domain 3 — Department

| Attribute | Value |
|---|---|
| **Purpose** | Defines organizational units within a company. Used in approval routing (department-specific rules), document department codes (SP/MSI/SLS/2026/0001), cost center assignment, and HR structure. |
| **Table Candidate** | `departments` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No (but `parent_id` references `departments` for hierarchy) |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `parent_id`, `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company (`company_id + code`) |
| **Soft Delete** | Yes |
| **Audit Log** | Yes |
| **RLS Assumptions** | Admin and above can manage. All company users can read. |
| **Seed Data Required** | Yes — seed: SLS, LOG, FIN, PROC, IT, MGMT, HR (per Document Numbering standard) |
| **Dependent Modules** | Positions, User Profiles, Document Numbering (`dept_code` segment), Approval Rules, Cost Centers |
| **Migration Priority** | **P0 — Department codes feed into document numbers; must exist before document_types are seeded** |
| **UI Priority** | Admin only, Phase 1.0E |
| **Risks / Notes** | Department codes are embedded as strings in document numbers (`SP/MSI/SLS/2026/0001`). Changing a department code after documents are created has no effect on past documents — codes in document_no are immutable once assigned. `parent_id` hierarchy is optional. |

---

### Domain 4 — Position / Job Title

| Attribute | Value |
|---|---|
| **Purpose** | Defines job titles and seniority levels. Used for role assignment guidance, approval matrix threshold configuration, and HR reporting. |
| **Table Candidate** | `positions` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | Optional |
| **Key Fields** | `id`, `company_id`, `department_id`, `code`, `name`, `level` (Staff/Supervisor/Manager/Head/Director), `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes |
| **RLS Assumptions** | Admin and above can manage. All company users can read. |
| **Seed Data Required** | Yes — seed standard levels: Staff, Supervisor, Manager, Head, Director |
| **Dependent Modules** | User Profiles, Approval Matrix (position-level thresholds) |
| **Migration Priority** | **P1 — Not blocking for customer/vendor/document-type work** |
| **UI Priority** | Admin only, Phase 1.0E |
| **Risks / Notes** | Position level can drive approval thresholds (e.g. any Head-level can approve POs up to X). Not critical for Phase 1.0 first screens. |

---

### Domain 5 — Employee / User Profile

| Attribute | Value |
|---|---|
| **Purpose** | Master record for every system user. Extends Supabase Auth (`auth.users`) with business identity: company, branch, department, position. The existing `profiles` table must be migrated to this structure without breaking the current UserManagement UI. |
| **Table Candidate** | `user_profiles` (migrate/extend existing `profiles`) |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | Optional |
| **department_id required** | Optional |
| **Key Fields** | `id` (= auth.users.id), `company_id`, `branch_id`, `department_id`, `position_id`, `employee_id`, `full_name`, `email`, `phone`, `avatar_url`, `is_active`, `mfa_required`, `last_login_at`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `id`, `company_id`, `full_name`, `email` |
| **Uniqueness Rules** | `id` unique (1-to-1 with auth.users); `email` unique per company |
| **Soft Delete** | Yes — soft delete on termination; also disable Supabase Auth user |
| **Audit Log** | Yes — all changes, especially `is_active` and role-related changes |
| **RLS Assumptions** | User can read/edit their own profile. Admin can manage all in their company. Super Admin has cross-company access. |
| **Seed Data Required** | Yes — migrate existing `profiles` rows; assign SBI company_id initially |
| **Dependent Modules** | User Roles, Approval Rules, Audit Logs, `created_by`/`updated_by` on all tables |
| **Migration Priority** | **P0 — Must migrate early; existing UserManagement UI must not break** |
| **UI Priority** | Admin only (existing User Management page extended), Phase 1.0F |
| **Risks / Notes** | Existing `profiles` has: `id`, `full_name`, `role` (enum: super/logistic/procurement/finance/management), `active`. Migration adds: `company_id`, `branch_id`, `department_id`, `position_id`. The old `role` field is superseded by `user_roles` table but must remain during transition. Plan dual-mode operation: read from new `user_roles` if populated, fall back to legacy `role` field. Drop legacy field only after 1.0F is verified in production. |

---

### Domain 6 — Role & Permission

| Attribute | Value |
|---|---|
| **Purpose** | Granular role-permission model. Replaces the current hardcoded 5-value role enum in `profiles`. Roles are named permission sets; permissions are `{module}.{action}` codes. Users are assigned roles via `user_roles`. |
| **Table Candidates** | `roles`, `permissions`, `role_permissions`, `user_roles` |
| **Scope** | `permissions` = Global; `roles`, `role_permissions`, `user_roles` = Company-scoped |
| **company_id required** | `permissions`: No; all others: Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `roles`: code, name, is_system_role; `permissions`: module, action; `role_permissions`: role_id + permission_id; `user_roles`: user_id + role_id + company_id + valid_from + valid_until |
| **Required Fields** | `roles`: company_id, code, name; `permissions`: module, action; `user_roles`: user_id, role_id, company_id |
| **Uniqueness Rules** | `roles.code` unique per company; `permissions(module, action)` globally unique; `role_permissions(role_id, permission_id)` unique; `user_roles(user_id, role_id, company_id)` unique |
| **Soft Delete** | `roles`: Yes; `permissions`: No; `role_permissions`: No; `user_roles`: `is_active` flag |
| **Audit Log** | Yes — all role changes and permission assignments (`role_change`, `permission_change` events) |
| **RLS Assumptions** | Super Admin only can manage permissions globally. Admin can manage roles and assignments within their company. Users can read their own roles. |
| **Seed Data Required** | Yes — system roles: super_admin, admin, bod, finance_controller, finance_staff, operations_head, operations_staff, sales_head, sales_staff, procurement_head, procurement_staff, viewer |
| **Dependent Modules** | All modules — every permission check depends on this |
| **Migration Priority** | **P0 — Must seed before permission enforcement can work** |
| **UI Priority** | Admin only, Phase 1.0E |
| **Risks / Notes** | Existing role values must map to new codes: super → super_admin, logistic → operations_staff, procurement → procurement_staff, finance → finance_staff, management → viewer. New role model is significantly more granular than the 5-value enum. Keep the legacy `profiles.role` field during transition (Phase 1.0F), remove only after `user_roles` is verified working in production. |

---

### Domain 7 — Customer

| Attribute | Value |
|---|---|
| **Purpose** | Master record for all customers across each company. The existing Storbit Manifest already has a `customers` table — it must be migrated to full ERP-ready structure with `company_id`, `code`, `credit_limit`, and `payment_terms_id`. |
| **Table Candidate** | `customers` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `legal_name`, `customer_type`, `tax_id`, `address`, `city`, `country`, `phone`, `email`, `pic_name`, `pic_phone`, `pic_email`, `credit_limit`, `payment_terms_id`, `currency_code`, `notes`, `is_active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company (`company_id + code`) |
| **Soft Delete** | Yes |
| **Audit Log** | Yes — especially `credit_limit` and `payment_terms_id` changes (sensitive) |
| **RLS Assumptions** | All company users can read. Sales and Admin can create/edit. Finance Controller can edit `credit_limit`. Admin only can soft-delete. |
| **Seed Data Required** | Yes — migrate existing `customers` table; assign `company_id = SBI` initially |
| **Dependent Modules** | SP/Quotation/Job, Invoice, AR Tracker, Outstanding, Dashboard |
| **Migration Priority** | **P0 — Existing customer data must be migrated early; current SP module depends on it** |
| **UI Priority** | Sales/Admin, Phase 1.0F (integrate with existing Customer page) |
| **Risks / Notes** | Existing `customers` table likely has: id, name, and few other fields — no `company_id`, no `code`. Migration: add `company_id` (default SBI), generate `code` from existing names or sequence. Keep old columns until 1.0F is verified. `credit_limit` is a sensitive field — mask in non-Finance views. Additive migration only — no destructive column drops in Phase 1.0. |

---

### Domain 8 — Vendor

| Attribute | Value |
|---|---|
| **Purpose** | Master record for all external suppliers, shipping lines, truckers, sub-contractors, and service providers. New in the ERP layer — no equivalent exists in current Storbit Manifest. |
| **Table Candidate** | `vendors` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `legal_name`, `vendor_type`, `tax_id`, `address`, `city`, `country`, `phone`, `email`, `pic_name`, `pic_phone`, `bank_name`, `bank_account`, `bank_account_name`, `payment_terms_id`, `currency_code`, `notes`, `is_active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes — especially bank account changes |
| **RLS Assumptions** | Procurement and Admin can create/edit. Finance can view bank details. All company users can read basic vendor info. `bank_account` masked in non-Finance views (last 4 digits only). |
| **Seed Data Required** | No — no existing vendor data to migrate |
| **Dependent Modules** | Purchase Order, AP, Job Costs, Vendor Invoice |
| **Migration Priority** | **P1 — Needed before procurement module** |
| **UI Priority** | Procurement/Admin, Phase 1.0E |
| **Risks / Notes** | `vendor_type` suggested values: Shipping Line, Trucker, Customs Agent, Supplier, Sub-contractor. `bank_account` must be stored encrypted or masked — show only last 4 digits in display to all non-Finance roles. |

---

### Domain 9 — Product / Service Catalog

| Attribute | Value |
|---|---|
| **Purpose** | Defines sellable products and billable services. Used in quotations, SPs, invoices, and procurement. `is_service = true` for service items (most MSI/JCI transactions); `is_service = false` for physical goods (SBI trading). |
| **Table Candidate** | `products` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `category`, `unit`, `description`, `is_service`, `default_price`, `cogs_account_id` (nullable FK → future), `revenue_account_id` (nullable FK → future), `tax_id` (nullable FK → taxes), `is_active`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes — especially price changes |
| **RLS Assumptions** | Admin can manage. Sales and Operations can read. Finance can read. |
| **Seed Data Required** | No — each company configures their own catalog |
| **Dependent Modules** | Quotation, Sales Order, Invoice, Job Costing, Purchase Order |
| **Migration Priority** | **P1 — Needed before quotation module** |
| **UI Priority** | Admin/Sales, Phase 1.0E |
| **Risks / Notes** | `cogs_account_id` and `revenue_account_id` are nullable FKs to `chart_of_accounts` — leave null until Phase 2. `tax_id` FK to `taxes` table — leave null until taxes table is migrated. |

---

### Domain 10 — Cost Center

| Attribute | Value |
|---|---|
| **Purpose** | Defines budget and cost tracking units. Used in job costing, expense allocation, and management reporting. Typically mirrors departments or business units. |
| **Table Candidate** | `cost_centers` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | Optional |
| **department_id required** | Optional |
| **Key Fields** | `id`, `company_id`, `branch_id`, `department_id`, `code`, `name`, `description`, `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes |
| **RLS Assumptions** | Finance and Admin can manage. Management and Finance can read. |
| **Seed Data Required** | No |
| **Dependent Modules** | Journal Entry, Job Costing, Purchase Order, Budget (future) |
| **Migration Priority** | **P2 — Needed before job costing and journal entries (Phase 3)** |
| **UI Priority** | Finance/Admin, Phase 2.x |
| **Risks / Notes** | Not blocking any Phase 1.0 module. Define schema now, migrate in Phase 2 prep. |

---

### Domain 11 — Chart of Accounts

| Attribute | Value |
|---|---|
| **Purpose** | Full ledger account structure per company. Every financial transaction must reference a GL account. The COA structure determines how financial statements are generated. |
| **Table Candidate** | `chart_of_accounts` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `account_type` (asset/liability/equity/revenue/expense), `parent_id`, `level` (1–4), `is_header`, `normal_balance` (debit/credit), `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name`, `account_type` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes — only if no transactions reference the account |
| **Audit Log** | Yes — all COA changes |
| **RLS Assumptions** | Finance Controller and Admin only can manage. Finance Staff can read. Others cannot access COA. |
| **Seed Data Required** | Yes — seed standard Indonesian COA structure per company in Phase 1.0C |
| **Dependent Modules** | Journal Entry, Invoice, AP, AR, Job Costing, Product account mapping |
| **Migration Priority** | **P2 — Required before invoicing and accounting (Phase 3)** |
| **UI Priority** | Finance/Admin only, Phase 2.x |
| **Risks / Notes** | This is a Critical sensitivity domain. COA structure errors are expensive to fix after transactions exist. Finance Controller must review and approve COA before any accounting transaction is recorded. Consider seeding from a standard Indonesian chart of accounts template. |

---

### Domain 12 — Tax

| Attribute | Value |
|---|---|
| **Purpose** | Defines tax codes for invoices, purchase orders, and products. Indonesian context: PPN (11%), PPh23, PPh21, etc. |
| **Table Candidate** | `taxes` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `rate` (numeric 5,4), `tax_type`, `is_inclusive`, `gl_account_id` (nullable FK → chart_of_accounts), `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name`, `rate` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes — rate changes especially important |
| **RLS Assumptions** | Finance and Admin can manage. All company users can read (needed for invoice creation UI). |
| **Seed Data Required** | Yes — PPN 11%, PPh23 2% |
| **Dependent Modules** | Invoice, Purchase Order, Product Catalog |
| **Migration Priority** | **P1 — Needed before invoicing** |
| **UI Priority** | Finance/Admin, Phase 1.0E |
| **Risks / Notes** | Never change `rate` on a tax code that has been used in posted transactions — it would corrupt historical calculations. Instead, deactivate old code and create a new one with the updated rate. |

---

### Domain 13 — Payment Terms

| Attribute | Value |
|---|---|
| **Purpose** | Standard payment term templates (NET30, COD, 50%UP). Currently embedded as an integer `payment_terms` in customers and vendors. Must become a proper lookup table for consistent ERP display and AR/AP aging. |
| **Table Candidate** | `payment_terms` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `company_id`, `code`, `name`, `days_due`, `description`, `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `code`, `name`, `days_due` |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes |
| **RLS Assumptions** | Finance and Admin can manage. All company users can read. |
| **Seed Data Required** | Yes — COD (0), NET15, NET30, NET45, NET60, 50% UP |
| **Dependent Modules** | Customer, Vendor, Invoice, AR, AP |
| **Migration Priority** | **P1 — Before migrating customers/vendors with proper FK** |
| **UI Priority** | Finance/Admin, Phase 1.0E |
| **Risks / Notes** | Current `customers.payment_terms` is an integer (days). Phase 1.0F migration converts to `payment_terms_id` FK. Keep the integer column as fallback until FK migration is verified in production, then drop. |

---

### Domain 14 — Currency & Exchange Rate

| Attribute | Value |
|---|---|
| **Purpose** | `currencies` is a global ISO 4217 lookup. `exchange_rates` is company-scoped daily/monthly rates for multi-currency transactions. |
| **Table Candidates** | `currencies` (global), `exchange_rates` (company-scoped) |
| **Scope** | `currencies` = Global; `exchange_rates` = Company-scoped |
| **company_id required** | `currencies`: No; `exchange_rates`: Yes |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `currencies`: code (ISO 4217), name, symbol, decimal_places; `exchange_rates`: company_id, from_currency, to_currency, rate (numeric 18,6), effective_date |
| **Required Fields** | `currencies`: code, name; `exchange_rates`: company_id, from_currency, to_currency, rate, effective_date |
| **Uniqueness Rules** | `currencies.code` globally unique; `exchange_rates(company_id, from_currency, to_currency, effective_date)` unique |
| **Soft Delete** | No for either — never delete historical rates |
| **Audit Log** | Yes — rate changes |
| **RLS Assumptions** | `currencies`: all authenticated users can read; Super Admin can manage. `exchange_rates`: Finance and Admin can manage within company; all company users can read. |
| **Seed Data Required** | Yes — currencies: IDR, USD, SGD, EUR, JPY |
| **Dependent Modules** | Invoice, AP/AR, Purchase Order, any multi-currency document |
| **Migration Priority** | **P1 — Before any multi-currency transaction** |
| **UI Priority** | Finance/Admin, Phase 1.0E |
| **Risks / Notes** | For Phase 1.0, IDR-only operation is acceptable. Plan the table structure now so multi-currency can be added in Phase 2-3 without schema changes. |

---

### Domain 15 — Document Type & Sequence

| Attribute | Value |
|---|---|
| **Purpose** | `document_types` configures which document types exist per company, their numbering format, reset period, and approval requirement. `document_sequences` tracks the running counter per company/type/year. These two tables power the document numbering engine. |
| **Table Candidates** | `document_types`, `document_sequences` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | No (department code stored as varchar, not FK, to keep numbering independent of department table) |
| **Key Fields** | `document_types`: company_id, module, code, name, prefix_format, department_code, reset_period, approval_required, is_active; `document_sequences`: company_id, document_type, department_code, year, month, last_sequence |
| **Required Fields** | `document_types`: company_id, module, code, name; `document_sequences`: company_id, document_type, department_code, year |
| **Uniqueness Rules** | `document_types(company_id, code)` unique; `document_sequences(company_id, document_type, department_code, year, month)` unique |
| **Soft Delete** | No — deactivate via `is_active` only |
| **Audit Log** | Yes |
| **RLS Assumptions** | Admin can manage document types. Sequence increment (via atomic UPDATE) must be accessible to any authenticated user creating a document within their company. |
| **Seed Data Required** | Yes — seed all document type codes: QT, SP, SHP, CUS, TRD, PR, PO, GRN, INV, RCP, PV, JE, AST, TCK, HRG |
| **Dependent Modules** | All transaction modules — every document creation depends on this |
| **Migration Priority** | **P0 — Must be seeded before any document can be created** |
| **UI Priority** | Admin only, Phase 1.0E |
| **Risks / Notes** | The existing Storbit Manifest generates SP numbers manually. Migration must inspect the highest existing SP number and start the sequence from max+1. The `UPDATE ... RETURNING` atomic pattern is mandatory — never SELECT then UPDATE in separate statements (race condition). |

---

### Domain 16 — Status Catalog

| Attribute | Value |
|---|---|
| **Purpose** | Global registry of all valid status values used across all document types. Provides a single source of truth for status codes, display labels, and color classes. Prevents free-form status strings that break reporting consistency. |
| **Table Candidate** | `status_catalog` |
| **Scope** | Global |
| **company_id required** | No |
| **branch_id required** | No |
| **department_id required** | No |
| **Key Fields** | `id`, `code`, `label`, `description`, `color_class`, `applicable_modules` (jsonb), `is_terminal`, `is_active` |
| **Required Fields** | `code`, `label` |
| **Uniqueness Rules** | `code` globally unique |
| **Soft Delete** | No — use `is_active = false` |
| **Audit Log** | Yes |
| **RLS Assumptions** | All authenticated users can read. Super Admin only can manage. |
| **Seed Data Required** | Yes — seed all statuses from `docs/workflow/status-lifecycle.md`: draft, submitted, under_review, revision_requested, revised, approved, rejected, cancelled, in_progress, completed, archived, on_hold, overdue |
| **Dependent Modules** | All document modules, UI status badges, reporting filters |
| **Migration Priority** | **P0 — Seed before any transaction status is recorded** |
| **UI Priority** | Admin read-only display, Phase 1.0E |
| **Risks / Notes** | Status values are stored as `varchar(50)` in all document tables — NOT as FKs to this catalog. The catalog is a reference registry, not a constraint. This is intentional: flexibility to add statuses without schema migration on every document table. Existing Storbit Manifest uses free-form status strings — must map to catalog values during 1.0F. |

---

### Domain 17 — Approval Rule & Approval Matrix

| Attribute | Value |
|---|---|
| **Purpose** | `approval_rules` defines who must approve which documents and under what conditions (doc type, department, amount range, sequence level). `approval_logs` records every approval action immutably. `approval_delegations` handles temporary authority transfer. These three tables form the reusable Approval Engine. |
| **Table Candidates** | `approval_rules`, `approval_logs`, `approval_delegations` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | No |
| **department_id required** | Optional on `approval_rules` — scopes a rule to one department |
| **Key Fields** | `approval_rules`: company_id, document_type, department_id, min_amount, max_amount, approver_role_id, approver_user_id, backup_approver_id, sequence_order, deadline_hours; `approval_logs`: company_id, document_type, document_id, document_no, action, from_status, to_status, actor_id, notes, sequence_level; `approval_delegations`: delegator_id, delegate_id, document_types, valid_from, valid_until, approved_by |
| **Required Fields** | `approval_rules`: company_id, document_type, sequence_order, and at least one of approver_role_id / approver_user_id; `approval_logs`: company_id, document_type, document_id, action, actor_id |
| **Uniqueness Rules** | No strict uniqueness — multiple rules per document_type are valid (multi-level) |
| **Soft Delete** | `approval_rules`: No (deactivate via is_active); `approval_logs`: No (immutable); `approval_delegations`: No |
| **Audit Log** | `approval_logs` is itself an audit trail; also log rule changes to `audit_logs` |
| **RLS Assumptions** | Admin can manage approval_rules. Approvers can insert into approval_logs. All company users can read approval_logs for documents they submitted. Delegations require Admin approval. |
| **Seed Data Required** | No — each company configures rules per their workflow |
| **Dependent Modules** | All approval-requiring documents: Quotation, SP, Invoice, PR, PO, Journal Entry |
| **Migration Priority** | **P1 — Required before any approval-flow document can go live** |
| **UI Priority** | Admin only, Phase 1.0E |
| **Risks / Notes** | `document_type` on `approval_rules` is a varchar, NOT a FK to `document_types`. This keeps the engine flexible as new document types are added without coupling the approval engine to the document type registry. Amount-based rules require the document's total amount to be available at submit time. |

---

### Domain 18 — Asset Category & Location

| Attribute | Value |
|---|---|
| **Purpose** | `asset_categories` classifies assets (IT Equipment, Furniture, Vehicle, Building). `asset_locations` tracks physical placement. Both are needed by the Asset Management module in Phase 4. |
| **Table Candidates** | `asset_categories`, `asset_locations` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | `asset_locations`: Yes |
| **department_id required** | Optional |
| **Key Fields** | `asset_categories`: company_id, code, name, useful_life_years, depreciation_method (straight_line/double_declining); `asset_locations`: company_id, branch_id, code, name, description |
| **Required Fields** | Both: company_id, code, name |
| **Uniqueness Rules** | `code` unique per company |
| **Soft Delete** | Yes |
| **Audit Log** | Yes |
| **RLS Assumptions** | Finance and Admin can manage. All company users can read. |
| **Seed Data Required** | No — configure at Phase 4 start |
| **Dependent Modules** | Asset Register, Depreciation, Asset Disposal (Phase 4.2) |
| **Migration Priority** | **P3 — Phase 4 only** |
| **UI Priority** | Finance/Admin, Phase 4.x |
| **Risks / Notes** | Defined here for completeness. Include schema draft in Phase 1.0B so that `document_types` can be seeded with the AST document code. No migration or UI work needed until Phase 4. |

---

### Domain 19 — Asset Master Reference

| Attribute | Value |
|---|---|
| **Purpose** | Individual asset register records. Each asset has a category, location, acquisition details, depreciation schedule, and current book value. |
| **Table Candidate** | `assets` |
| **Scope** | Company-scoped |
| **company_id required** | Yes |
| **branch_id required** | Optional |
| **department_id required** | Optional |
| **Key Fields** | `id`, `company_id`, `asset_no` (document_no format: AST/MSI/IT/2026/0001), `name`, `category_id`, `location_id`, `purchase_date`, `purchase_price`, `useful_life_years`, `depreciation_method`, `accumulated_depreciation`, `book_value`, `status`, `assigned_to_user_id`, `is_active`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| **Required Fields** | `company_id`, `asset_no`, `name`, `category_id` |
| **Uniqueness Rules** | `asset_no` unique per company |
| **Soft Delete** | Yes — disposal via approval workflow, not hard delete |
| **Audit Log** | Yes — acquisition, disposal, value adjustments |
| **RLS Assumptions** | Finance and Admin can manage. IT can manage IT assets. All company users can read. |
| **Seed Data Required** | No |
| **Dependent Modules** | Asset Depreciation, Asset Disposal, Journal Entry (depreciation postings) |
| **Migration Priority** | **P3 — Phase 4.2** |
| **UI Priority** | Finance/Admin, Phase 4.2 |
| **Risks / Notes** | Reference entry only. The `AST` document type code is registered in `document_types` during Phase 1.0 seeding so the numbering format is pre-defined. Full asset implementation is Phase 4.2. |

---

## 5. Implementation Phases

### Phase 1.0A — Architecture Plan
**Status:** ✅ Complete (this document)  
**Output:** `docs/database/master-data-architecture.md`  
**Scope:** Architecture and planning only. Zero schema changes, zero migrations, zero RLS changes, zero source code changes.

---

### Phase 1.0B — Schema / Migration Draft Review
**Status:** Planned  
**Output:**
- Draft migration SQL in `/supabase/migrations/` for all P0 domains
- Schema additions in `docs/database/core-schema-draft.md` for new domains: `cost_centers`, `taxes`, `payment_terms`, `currencies`, `exchange_rates`, `status_catalog`, `chart_of_accounts`, `asset_categories`, `asset_locations`, `assets`
- Entity map additions to `docs/database/entity-map.md`
- Rollback SQL for every migration as a comment block

**Migration sequence within 1.0B (strict order):**
1. `companies` + seed (MSI, JCI, SBI)
2. `branches`, `departments` + seed (standard dept codes)
3. `status_catalog` + seed (all 13 status values)
4. `document_types`, `document_sequences` + seed (all 15 doc codes)
5. `roles`, `permissions`, `role_permissions` + seed
6. `taxes`, `payment_terms`, `currencies` + seed
7. Extend `user_profiles` / `profiles` — add company_id, branch_id, department_id
8. Extend `customers` — add company_id, code, payment_terms_id
9. `vendors`, `products`, `positions`
10. `approval_rules`, `approval_logs`, `approval_delegations`
11. `cost_centers`, `chart_of_accounts`
12. `asset_categories`, `asset_locations`, `assets` (schema only, no data)

---

### Phase 1.0C — Seed Strategy
**Status:** Planned  
**Output:**
- Seed SQL for all P0 and P1 domains
- MSI, JCI, SBI company records
- Standard departments: SLS, LOG, FIN, PROC, IT, MGMT, HR
- System roles and permissions (full permission matrix)
- All 15 document type codes
- All 13 status catalog values
- Currencies: IDR, USD, SGD, EUR, JPY
- Payment terms: COD, NET15, NET30, NET45, NET60, 50% UP

---

### Phase 1.0D — RLS Policy Draft
**Status:** Planned  
**Output:**
- RLS policies for all P0 and P1 tables
- Helper functions: `get_user_company_id()`, `get_user_role()`, `is_admin_or_above()`
- Test matrix: each policy tested with minimum 2 different roles in staging
- PR description includes before/after comparison for every policy

**Standard policy pattern for company-scoped tables:**
```sql
CREATE POLICY "{table}_company_isolation"
ON {table} FOR SELECT TO authenticated
USING (company_id = get_user_company_id());

CREATE POLICY "{table}_company_mutation"
ON {table} FOR ALL TO authenticated
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());
```

**Standard policy pattern for global tables:**
```sql
CREATE POLICY "{table}_read_all"
ON {table} FOR SELECT TO authenticated
USING (true);

CREATE POLICY "{table}_super_admin_write"
ON {table} FOR ALL TO authenticated
USING (get_user_role() = 'super_admin')
WITH CHECK (get_user_role() = 'super_admin');
```

---

### Phase 1.0E — First Admin UI Screens
**Status:** Planned  
**Prerequisites:** 1.0B + 1.0C + 1.0D complete and verified in staging  
**Output:** Admin screens for:
- Company settings (read-only for non-Super Admin)
- Department management
- Branch management
- Role & permission overview
- Document type configuration
- Status catalog (read-only display)
- Tax configuration
- Payment terms configuration

**All 1.0E screens must comply with:**
- Server-side pagination (25 rows default)
- Debounced search (300ms)
- `React.lazy()` code splitting
- `ErrorBoundary` wrapper
- Soft delete only (no hard delete in UI)
- Audit log on every create/update/delete

---

### Phase 1.0F — Integration with Existing Manifest Data
**Status:** Planned  
**Prerequisites:** 1.0D complete  
**Output:**
- Migrate existing `customers` → add `company_id`, `code`, `payment_terms_id`
- Migrate existing `profiles` → extend to full `user_profiles` schema
- Update `useCustomers` hook to include `company_id` filter
- Update `useSpItems` hook if SP data references customers by new FK
- Verify existing Customer page, SP manifest page, and AR Tracker all still work
- Map existing user `role` enum to `user_roles` table entries

**Migration rules for 1.0F:**
1. Additive only — do not drop existing columns during 1.0F
2. All existing customers → assign `company_id = SBI`
3. All existing profiles → assign `company_id = SBI`
4. Role mapping: super → super_admin, logistic → operations_staff, procurement → procurement_staff, finance → finance_staff, management → viewer
5. Smoke test every existing page after migration before dropping any legacy column

---

## 6. Migration Compatibility Map

| Existing Data | Current Structure | ERP Target | Migration Plan |
|---|---|---|---|
| `customers` table | id, name (few fields, no company_id) | `customers` with company_id, code, payment_terms_id | Phase 1.0F: additive, assign SBI company_id, auto-generate codes |
| `profiles` table | id, full_name, role (enum), active | `user_profiles` with company_id, branch_id, department_id | Phase 1.0F: additive, role mapping, assign SBI company_id |
| SP data (`sp_items`) | Existing SP manifest rows | No change in Phase 1.0 — depends on sales_orders (Phase 2) | Not touched in Phase 1 |
| AR data (`ttf`, btb) | Existing AR tracker rows | No change in Phase 1.0 — depends on ar_transactions (Phase 3) | Not touched in Phase 1 |
| User roles (enum field) | super / logistic / procurement / finance / management | `user_roles` table + granular permissions | Phase 1.0F: map enum to new role codes; keep old field until verified |

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `companies` table not seeded before other migrations run | High | Critical — all FK constraints fail | Enforce seed script order; gate all other P0 migrations on company existence check |
| Existing `customers` data loses association during migration | Medium | High — data inaccessible under RLS | Assign SBI company_id in migration script; verify with count query after |
| Existing `profiles.role` enum not mapped correctly to new roles | Medium | High — users lose access | Test all 5 enum values in staging before production migration |
| Document sequences start at 0 instead of continuing from existing SP numbers | High | Medium — duplicate document numbers | Inspect `MAX(sp_no)` before creating sequences; initialize `last_sequence` from max |
| COA structure wrong — expensive to fix after transactions posted | Low | Critical | Finance Controller must approve COA before any Phase 2 invoice is created |
| Tax rate changed on existing posted tax code | Medium | High — historical amounts corrupted | Policy: never edit `rate`; deactivate and create new code |
| Two users concurrently creating documents — race on sequence | Low | High — duplicate document number | Atomic `UPDATE ... RETURNING` on `document_sequences`; never SELECT-then-UPDATE |
| RLS too restrictive — legitimate users blocked | Medium | High — app unusable | Test every policy with minimum 2 roles in staging using anon Supabase client |
| RLS too permissive — cross-company data visible | Low | Critical | Test with two separate company test accounts in staging; verify company_id isolation |
| Payment terms FK migration drops integer column before conversion verified | Medium | Medium — customer records lose terms | Keep integer column until FK migration verified; two-step migration |

---

## 8. Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-05-24 | `payment_terms` as a standalone lookup table, not an integer in customers/vendors | Enables standardized terms, audit trail, and consistent display across documents |
| 2026-05-24 | `status_catalog` is global, not company-scoped | Status codes are system-wide standards; per-company status values would fragment reporting |
| 2026-05-24 | Asset domains defined in architecture now, full implementation deferred to Phase 4 | Define structure now so `document_types` can be seeded with AST code; defer full asset implementation |
| 2026-05-24 | Keep existing `profiles.role` enum during 1.0F, drop only after `user_roles` is verified | Zero-downtime migration — existing UserManagement UI must not break while new tables are being populated |
| 2026-05-24 | `document_sequences` uses `UPDATE ... RETURNING` not `SELECT + INSERT` | Atomic operation prevents duplicate document numbers under concurrent requests |
| 2026-05-24 | `chart_of_accounts` is P2 priority, not P0 | No invoicing or accounting in Phase 1; COA is complex and requires Finance Controller sign-off |
| 2026-05-24 | Currencies are global, exchange_rates are company-scoped | Currency codes follow ISO 4217 (global standard); exchange rates differ per company's business agreements |
| 2026-05-24 | `document_type` on `approval_rules` is varchar, not FK to `document_types` | Decouples the approval engine from the document type registry; allows new document types without modifying the approval engine |
| 2026-05-24 | Phase 1.0 migration is additive only — no column drops | Existing Storbit Manifest UI must remain functional throughout migration; dropping columns is deferred until 1.0F is verified in production |
