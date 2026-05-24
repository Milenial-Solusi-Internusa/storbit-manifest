# Nexus by MSI — RLS Policy Draft

**Phase:** 1.0D  
**Last Updated:** 2026-05-24  
**Status:** DRAFT — do NOT execute migration without explicit approval  
**Migration file:** `supabase/migrations/20260524000014_rls_policy_draft.sql`

---

## Overview

This document describes the Row Level Security (RLS) policy design for all P0/P1 master data tables in Nexus by MSI. It covers:

1. Helper function design and security rationale
2. Policy decisions per table
3. Tables deferred to Phase 1.0F and why
4. Test matrix (roles × tables)
5. Known gaps and deferred items
6. Pre-execution checklist

RLS is the authoritative security boundary for all data access. Frontend permission checks are UX helpers only — every query is enforced at the database level.

---

## 1. Helper Functions

Five SECURITY DEFINER functions are defined before any policies. All policies call these functions rather than embedding logic directly in USING clauses.

### 1.1 Why SECURITY DEFINER?

RLS policies call helper functions that need to read tables (`profiles`, `user_roles`, `roles`) that are themselves protected by RLS. Without SECURITY DEFINER, this creates a circular dependency: the policy reads a table whose policy requires the function that reads the table.

SECURITY DEFINER resolves this by executing the function with the privileges of the function owner (the migration executor / postgres superuser), bypassing RLS for the specific internal lookup only.

**`SET search_path = public` is mandatory on every SECURITY DEFINER function** to prevent search_path hijacking: a malicious user could create a schema that shadows public tables if search_path is not pinned.

All functions are declared `STABLE` — they return the same result for the same inputs within one transaction. This is correct because `auth.uid()` does not change mid-transaction, allowing PostgreSQL to cache the result per transaction rather than re-executing on every row.

### 1.2 Function Reference

| Function | Signature | Description |
|----------|-----------|-------------|
| `get_user_company_id()` | `() → uuid` | Returns `profiles.company_id` for `auth.uid()`. NULL before Phase 1.0F backfill. |
| `is_super_admin()` | `() → boolean` | True if user has `super_admin` role in `user_roles` OR legacy `profiles.role = 'super'`. |
| `is_admin_or_above()` | `() → boolean` | True if user has `admin` or `super_admin` role OR legacy `profiles.role = 'super'`. |
| `has_role(text)` | `(role_code) → boolean` | True if user has the given role code in `user_roles`. No legacy fallback. |
| `has_permission(text, text)` | `(module, action) → boolean` | True if user has the given permission through any active role. Uses 3-JOIN path. |

### 1.3 Legacy Fallback Design

`is_super_admin()` and `is_admin_or_above()` include an OR clause checking `profiles.role::text = 'super'`. This is intentional for the Phase 1.0D → Phase 1.0F transition period:

- Before Phase 1.0F: `user_roles` is empty. The OR clause allows existing admin users to access data via the legacy role column.
- After Phase 1.0F: `user_roles` is populated. The OR clause matches no rows (old role enum will eventually be dropped), becoming a no-op.

`has_role()` does NOT include a legacy fallback because it is only used for new ERP tables that did not exist under the legacy role system.

`has_permission()` performs 3 JOINs (`user_roles → roles → role_permissions → permissions`). This is intentionally used only in mutation policies (INSERT/UPDATE checks on sensitive tables), not in bulk SELECT USING clauses where it would be called per-row.

---

## 2. Policy Decisions per Table Group

### 2.1 Global Read Tables: `status_catalog`, `currencies`, `permissions`

**Decision:** All authenticated users can SELECT. Super Admin only for INSERT/UPDATE.

**Rationale:** These are reference tables with no company-sensitive data. Every authenticated user in every company needs to read status codes, currency codes, and permission definitions for UI rendering and application-layer authorization checks.

**Note:** `permissions` global read does not expose any sensitive data — the table only contains permission code strings (e.g., `quotations.approve`), not role assignments or user data.

---

### 2.2 Companies

**Decision:** Users read only their own company (`id = get_user_company_id()`). Super Admin reads all. Super Admin only for write.

**Rationale:** Company records are multi-tenant isolation boundaries. A finance staff member at MSI must never be able to read JCI or SBI company details (bank accounts, credit settings, legal info). Only Super Admin — who operates at the platform level — needs cross-company visibility.

**Note:** `get_user_company_id()` returns NULL before Phase 1.0F. For the `companies` table, this means users cannot read any company record until their `profiles.company_id` is backfilled. This is acceptable because the admin screens that show company data are not yet built.

---

### 2.3 Organization Tables: `branches`, `departments`, `positions`

**Decision:** All company users can SELECT (excluding soft-deleted rows). Super Admin sees soft-deleted rows. Admin and above can INSERT and UPDATE.

**Rationale:**
- Any staff member may need to see the branch list (for routing decisions, contact information) or department structure (for document routing, approval chains).
- Position data is needed for user profiles and HR forms.
- Soft-deleted organization records are hidden from regular users but visible to Super Admin for data recovery.
- No DELETE policy: deletion is done by setting `deleted_at` (soft delete via UPDATE).

---

### 2.4 Access Control Tables: `roles`, `role_permissions`, `user_roles`

**`roles`:**
- All company users read (needed for role dropdowns in User Management UI).
- Admin INSERT/UPDATE (custom roles only — system role protection is application-layer).
- No DELETE: soft delete via `deleted_at`.

**`role_permissions`:**
- All company users read (needed for client-side permission checks via `has_permission()`).
- Admin INSERT/DELETE (granting and revoking permissions from roles).
- No UPDATE (grant = INSERT a new row, revoke = DELETE the row).
- Scoped via JOIN to `roles` since `role_permissions` has no direct `company_id` column.

**`user_roles`:**
- Users always read their own assignments (for permission loading on login).
- Admin reads and manages all assignments in their company.
- Super Admin reads all.
- No DELETE: revocation is done by UPDATE `is_active = false`.

---

### 2.5 profiles — DEFERRED TO PHASE 1.0F

**Decision:** RLS policies for `profiles` are written in migration 014 but commented out.

**Reason:** `profiles.company_id` is NULL for all existing rows until Phase 1.0F backfill completes. Enabling company-scoped RLS before this would:
1. Return 0 rows for all SELECT queries (NULL ≠ any company_id).
2. Lock out the existing UserManagement page completely.
3. Break the existing application immediately.

**Pre-condition before enabling:** `SELECT COUNT(*) FROM profiles WHERE company_id IS NULL` must return 0.

**Target policies (Phase 1.0F):**
- Own profile: always visible.
- Admin sees all profiles in their company.
- Super Admin sees all profiles across all companies.
- UPDATE allowed for own profile or by admin within company.
- No INSERT (handled by Supabase Auth trigger).
- No DELETE (deactivate via `is_active = false` + `deleted_at`).

---

### 2.6 Master Data: `vendors`, `products`

**`vendors`:**
- All company users read (needed for job creation, invoicing, PO creation).
- Procurement (head + staff) and Admin can INSERT/UPDATE.
- No DELETE: soft delete via `deleted_at`.
- **Important:** `bank_account` column masking is enforced in the application layer, not RLS. RLS cannot restrict individual columns — it is row-level. The application must mask `bank_account` to last 4 digits for non-Finance roles.

**`products`:**
- All company users read (needed for quotation, invoice, PR forms).
- Admin manages the product/service catalog.
- No DELETE: soft delete via `deleted_at`.

---

### 2.7 customers — DEFERRED TO PHASE 1.0F

**Decision:** Same as `profiles` — commented out in migration 014.

**Reason:** `customers.company_id` is NULL for all existing rows (migrated from Storbit Manifest). Enabling RLS before Phase 1.0F backfill would lock out the existing Customer page and SP Manifest page.

**Pre-condition before enabling:** `SELECT COUNT(*) FROM customers WHERE company_id IS NULL` must return 0.

**Target policies (Phase 1.0F):**
- All company users read their company's customers.
- Sales (head + staff) and admin can INSERT.
- Sales (head + staff), finance_controller, and admin can UPDATE (finance_controller for credit_limit updates only — enforced in application layer).
- No DELETE: soft delete via `deleted_at`.

---

### 2.8 Finance Reference Tables: `taxes`, `payment_terms`, `exchange_rates`

**`taxes` and `payment_terms`:**
- All company users read (needed for document creation forms).
- Finance Controller and Admin manage.
- No DELETE: soft delete via `deleted_at` (rate history must be preserved for historical document integrity).

**`exchange_rates`:**
- All company users read (needed for multi-currency document display).
- Finance Controller and Admin can INSERT new rates.
- **No UPDATE policy.** Historical exchange rates must never be modified — they affect past document values. To update a rate: insert a new row with a later `effective_date`.
- **No DELETE policy.** Same reason — historical rate integrity.

---

### 2.9 Document Tables: `document_types`, `document_sequences`

**`document_types`:**
- All company users read (needed for document creation and validation).
- Admin manages document type configuration.
- No DELETE: deactivate via `is_active = false`.

**`document_sequences`:**
- All company users read (for showing current sequence counters).
- **Any company user can UPDATE** (increment the sequence counter). This is required because any staff member with permission to create a document (sales_staff creating SP, finance_staff creating invoice) needs to atomically increment the sequence.
- Admin-only for INSERT (setting up new sequence rows for a new doc type or new year).
- **No DELETE** (sequence history is permanent).
- **Critical:** The application MUST use `UPDATE ... SET last_sequence = last_sequence + 1 ... RETURNING last_sequence`. Never SELECT then UPDATE — that creates a race condition with concurrent document creation.

---

### 2.10 Approval Engine: `approval_rules`, `approval_logs`, `approval_delegations`

**`approval_rules`:**
- All company users read (needed to know approval requirements before submitting).
- Admin manages approval configuration.
- No DELETE: deactivate via `is_active = false`.

**`approval_logs` (append-only):**
- All company users read (submitters track their documents; approvers see action history).
- Any company user can INSERT — but only as themselves: `WITH CHECK (actor_id = auth.uid())`.
- **No UPDATE policy** — approval log entries are immutable once written.
- **No DELETE policy** — approval logs are a permanent audit trail.

**`approval_delegations`:**
- Parties to the delegation (delegator + delegate) can read their own delegations.
- Admin reads all within company.
- A user can INSERT a delegation request on their own behalf (`delegator_id = auth.uid()`). Admin can insert on behalf of others.
- UPDATE restricted to admin only — admin is the only party who can approve (set `is_active = true`) a delegation request.

---

## 3. Tables Not Covered in Migration 014

The following tables exist in migrations 001–013 but do not have RLS policies in migration 014. They must have policies added before Phase 1.0E or Phase 2.x work begins, whichever comes first.

| Table | Migration | Reason Deferred |
|-------|-----------|-----------------|
| `companies` (write) | 001 | Write policy added in 014 (super_admin only) ✅ |
| `cost_centers` | 011 | P2 — not yet used; add policy before Phase 3 |
| `chart_of_accounts` | 011 | P2 — Finance Controller approval required; add before Phase 3 |
| `asset_categories` | 012 | P3 — Phase 4.2; add before asset management module |
| `asset_locations` | 012 | P3 — Phase 4.2 |
| `assets` | 012 | P3 — Phase 4.2 |

**Rule:** Any Phase 2+ migration that creates a new table must include RLS policies in the same migration file. Never leave a new table without RLS.

---

## 4. Test Matrix

This matrix covers the minimum required test scenarios for each table group. Tests must be run in staging before applying policies to production.

### 4.1 Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Should succeed — returns expected rows |
| ❌ | Should fail — 0 rows returned or error |
| ⚠️ | Partial — succeeds with filtering applied |

### 4.2 Roles Used in Test

| Role | Test User Setup |
|------|----------------|
| `super_admin` | user_roles: super_admin for any company |
| `admin` (MSI) | user_roles: admin, company = MSI |
| `finance_staff` (MSI) | user_roles: finance_staff, company = MSI |
| `operations_staff` (MSI) | user_roles: operations_staff, company = MSI |
| `sales_staff` (MSI) | user_roles: sales_staff, company = MSI |
| `viewer` (MSI) | user_roles: viewer, company = MSI |
| `admin` (SBI) | user_roles: admin, company = SBI |

### 4.3 SELECT Tests

| Table | super_admin | admin (MSI) | finance_staff (MSI) | ops_staff (MSI) | viewer (MSI) | admin (SBI) — cross-co |
|-------|:-----------:|:-----------:|:-------------------:|:---------------:|:------------:|:---:|
| `status_catalog` | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows |
| `currencies` | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows |
| `permissions` | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows | ✅ all rows |
| `companies` | ✅ all 3 | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `branches` | ✅ all (incl. deleted) | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `departments` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `positions` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `roles` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `role_permissions` | ✅ all | ⚠️ MSI roles only | ⚠️ MSI roles only | ⚠️ MSI roles only | ⚠️ MSI roles only | ❌ SBI roles only |
| `user_roles` | ✅ all | ⚠️ MSI users only | ⚠️ own row only | ⚠️ own row only | ⚠️ own row only | ❌ SBI users only |
| `vendors` | ✅ all | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ❌ SBI only |
| `products` | ✅ all | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ❌ SBI only |
| `taxes` | ✅ all | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ❌ SBI only |
| `payment_terms` | ✅ all | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ⚠️ MSI non-deleted | ❌ SBI only |
| `exchange_rates` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `document_types` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `document_sequences` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `approval_rules` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `approval_logs` | ✅ all | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ⚠️ MSI only | ❌ SBI only |
| `approval_delegations` | ✅ all | ⚠️ MSI own/admin | ⚠️ own only | ⚠️ own only | ⚠️ own only | ❌ SBI only |

### 4.4 INSERT Tests

| Table | super_admin | admin (MSI) | finance_staff | ops_staff | sales_staff | viewer |
|-------|:-----------:|:-----------:|:-------------:|:---------:|:-----------:|:------:|
| `branches` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `departments` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `positions` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `roles` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `role_permissions` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `user_roles` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `vendors` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `products` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `taxes` | ✅ | ✅ | ❌ (not finance_controller) | ❌ | ❌ | ❌ |
| `payment_terms` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `exchange_rates` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `document_types` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `document_sequences` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `approval_rules` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `approval_logs` | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) |
| `approval_delegations` | ✅ | ✅ (admin) | ❌ (not delegator) | ❌ | ❌ | ❌ |

Note for `approval_logs`: The WITH CHECK enforces `actor_id = auth.uid()`. A test inserting with a different actor_id should fail even for admin.

Note for `taxes` / `payment_terms`: `finance_controller` (not `finance_staff`) can INSERT — the permission requires `has_role('finance_controller')`.

Note for `vendors`: `procurement_head` and `procurement_staff` can INSERT — tested separately from admin.

### 4.5 UPDATE Tests

| Table | super_admin | admin (MSI) | finance_staff | ops_staff | viewer | Notes |
|-------|:-----------:|:-----------:|:-------------:|:---------:|:------:|-------|
| `branches` | ✅ | ✅ | ❌ | ❌ | ❌ | |
| `roles` | ✅ | ✅ | ❌ | ❌ | ❌ | |
| `user_roles` | ✅ | ✅ | ❌ | ❌ | ❌ | Revoke = UPDATE is_active = false |
| `vendors` | ✅ | ✅ | ❌ | ❌ | ❌ | proc_head/staff can also UPDATE |
| `exchange_rates` | ❌ | ❌ | ❌ | ❌ | ❌ | Immutable — no UPDATE policy exists |
| `document_sequences` | ✅ | ✅ | ✅ | ✅ | ✅ | Any company user can increment |
| `approval_logs` | ❌ | ❌ | ❌ | ❌ | ❌ | Immutable — no UPDATE policy |
| `approval_delegations` | ✅ (admin) | ✅ (admin) | ❌ | ❌ | ❌ | Only admin can approve delegation |

### 4.6 Cross-Company Isolation Test (Critical)

This is the most important test. An MSI user must not be able to see SBI data regardless of role.

```sql
-- Setup: two test users
-- msi_user: user_roles = admin, company = MSI
-- sbi_user: user_roles = admin, company = SBI

-- As msi_user:
SELECT COUNT(*) FROM branches;         -- Must = MSI branch count
SELECT COUNT(*) FROM vendors;          -- Must = MSI vendor count
SELECT COUNT(*) FROM taxes;            -- Must = MSI tax count

-- As sbi_user:
SELECT COUNT(*) FROM branches;         -- Must = SBI branch count
SELECT COUNT(*) FROM vendors;          -- Must = SBI vendor count

-- Attempt to read SBI data as MSI user (must return 0):
SELECT * FROM branches WHERE company_id = '<sbi_company_id>';  -- 0 rows
SELECT * FROM vendors  WHERE company_id = '<sbi_company_id>';  -- 0 rows
```

---

## 5. Pre-Execution Checklist

Before applying migration 014 to any environment:

```
[ ] All prior migrations 001–013 applied and verified on target environment
[ ] Staging only — never apply direct to production first
[ ] profiles.company_id backfill status:
    SELECT COUNT(*) FROM profiles WHERE company_id IS NULL;
    -- If > 0: profiles/customers RLS sections remain commented out (correct)
    -- If = 0: Phase 1.0F complete — uncomment and apply those sections separately
[ ] Test matrix executed for minimum super_admin and finance_staff roles per table
[ ] Cross-company isolation test executed (MSI admin cannot read SBI branches)
[ ] approval_logs actor_id enforcement tested (insert with actor_id ≠ auth.uid() must fail)
[ ] exchange_rates UPDATE test (must fail — no UPDATE policy)
[ ] Helper functions verified:
    SELECT proname, prosecdef FROM pg_proc WHERE proname IN (
      'get_user_company_id','is_super_admin','is_admin_or_above',
      'has_role','has_permission'
    );
    -- Expected: 5 rows, prosecdef = true for all
[ ] RLS enabled on 20 tables verified:
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = true;
[ ] PR description includes before/after comparison of affected tables
[ ] A second reviewer has approved the migration before staging apply
```

---

## 6. Known Gaps and Deferred Items

| Item | Gap | Action Required |
|------|-----|-----------------|
| `profiles` RLS | Commented out — Phase 1.0F dependency | Enable after `company_id` backfill in Phase 1.0F |
| `customers` RLS | Commented out — Phase 1.0F dependency | Enable after `company_id` backfill in Phase 1.0F |
| `cost_centers` RLS | Not in migration 014 — P2 table | Add RLS policy before Phase 3.x |
| `chart_of_accounts` RLS | Not in migration 014 — P2 table | Add RLS policy before Phase 3.x |
| `asset_categories` RLS | Not in migration 014 — P3 table | Add RLS policy before Phase 4.2 |
| `asset_locations` RLS | Not in migration 014 — P3 table | Add RLS policy before Phase 4.2 |
| `assets` RLS | Not in migration 014 — P3 table | Add RLS policy before Phase 4.2 |
| Column-level masking for `vendors.bank_account` | RLS cannot mask columns | Application layer must mask to last 4 digits for non-Finance roles. NOT enforced in DB. |
| `finance_controller` tax/payment_terms INSERT | Only `has_role('finance_controller')` allowed, not `finance_staff` | Application must surface error if finance_staff attempts to create tax records |
| `approval_logs` — super_admin can still INSERT as another actor | `actor_id = auth.uid()` not enforced for super_admin | Acceptable. Super Admin data corrections should be rare and audited separately |
| Legacy `profiles.role` removal | Column must remain until Phase 1.0F | DO NOT DROP until Phase 1.0F migration is verified in production |

---

## 7. After Phase 1.0F — Additional Steps

When Phase 1.0F backfill is complete (all profiles and customers have company_id):

1. Verify: `SELECT COUNT(*) FROM profiles WHERE company_id IS NULL` = 0
2. Verify: `SELECT COUNT(*) FROM customers WHERE company_id IS NULL` = 0
3. Write a new Phase 1.0F migration that:
   - Uncomments and applies the `profiles` RLS block (Section 5B from migration 014)
   - Uncomments and applies the `customers` RLS block (Section 6B from migration 014)
   - Does NOT change any other existing policies
4. Test UserManagement page still works
5. Test Customer page and SP Manifest page still work
6. After Phase 1.0F is verified in production, plan removal of legacy `profiles.role` enum column (separate migration, separate approval)

---

## 8. Security Notes

- **No hard deletes:** No DELETE policy exists on any business table. Deletion is done via `UPDATE ... SET deleted_at = now()`.
- **No anonymous access:** All policies are scoped to `TO authenticated`. No public/anon access to any business data.
- **No service role key in frontend:** The application uses the `anon` key; RLS policies enforce data isolation. The service role key must never appear in frontend code.
- **Soft-deleted row visibility:** Soft-deleted rows are hidden from regular users via `AND (deleted_at IS NULL OR is_super_admin())`. Super Admin can see all records including deleted ones for data recovery.
- **exchange_rates immutability:** The absence of UPDATE/DELETE policies is intentional. There is no way to modify a historical rate through the API — only new INSERT is allowed.
- **approval_logs immutability:** The absence of UPDATE/DELETE policies is intentional. Approval history is a tamper-proof audit trail.
