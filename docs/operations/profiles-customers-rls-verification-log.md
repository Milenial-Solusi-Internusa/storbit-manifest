# Nexus by MSI — Profiles & Customers RLS Verification Log

**Phase:** 1.0F — Profiles & Customers RLS Transition  
**Last Updated:** 2026-05-25  
**Status:** ✅ FULLY VERIFIED — staging complete, cross-company isolation PASS
**Branch:** `phase-1-rls-transition-verification` / `phase-1-cross-company-isolation-verification`
**Staging project:** `untmpqceexwxzuhlmyrg`

---

## 1. Purpose and Scope

This document records the verified outcome of Phase 1.0F: the backfill and RLS activation of the `profiles` and `customers` tables in the Nexus by MSI staging environment.

Phase 1.0F was deferred from migration 014 because `company_id` was NULL for all existing rows on both tables. Enabling RLS without a backfill would have returned empty results for every query — locking out all users from the Customer page, User Management, and login flow.

**Scope of this document:**
- Staged execution outcome (backfill → NOT NULL constraint → RLS activation)
- RLS policy and helper function confirmation
- App smoke test results
- Source code blockers resolved during Phase 1.0F
- Go/No-Go conclusion
- Remaining risks before production execution

**Out of scope:**
- Production execution (requires formal sign-off — see Section 10)
- User roles migration (`profiles.role` → `user_roles` table)

**Previously out of scope — now included:**
- Cross-company isolation test: ✅ completed (see Section 7.2)

---

## 2. Executed Transition Summary

Phase 1.0F was executed in staging following the staged plan in  
`docs/operations/profiles-customers-rls-transition.md`.

### Stage 1 — Backfill

| Step | Action | Result |
|------|--------|--------|
| 1A | `profiles.company_id` backfill | ✅ Den's profile assigned to MSI company |
| 1A | Branch used (`department_code = IT`, `branch_code = HO`) | ✅ Confirmed in profile row |
| 2A | `customers.company_id` backfill → SBI | ✅ Applied (0 existing customer rows — no rows to backfill, constraint clean) |

**profiles backfill decision:** Option B (per-user). The super admin  
(`den.itnetwork@exportimportdept.com`) was assigned to MSI explicitly,  
not SBI. No remaining NULL rows.

**customers backfill decision:** SBI default (consistent with migration 008 note  
and the original Storbit Manifest app context). Zero pre-existing customer rows  
were present at time of execution — backfill was a no-op but the UPDATE ran  
cleanly with `rows affected = 0`.

### Stage 2 — NOT NULL Constraints

| Step | Action | Result |
|------|--------|--------|
| 1B | `ALTER TABLE profiles ALTER COLUMN company_id SET NOT NULL` | ✅ Applied |
| 2B | `ALTER TABLE customers ALTER COLUMN company_id SET NOT NULL` | ✅ Applied |

### Stage 3 — RLS Activation

| Step | Action | Result |
|------|--------|--------|
| 3A | `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY` | ✅ Applied |
| 3A | `profiles_read` policy created | ✅ Active |
| 3A | `profiles_update` policy created | ✅ Active |
| 3B | `ALTER TABLE customers ENABLE ROW LEVEL SECURITY` | ✅ Applied |
| 3B | `customers_read` policy created | ✅ Active |
| 3B | `customers_insert` policy created | ✅ Active |
| 3B | `customers_update` policy created | ✅ Active |

---

## 3. Verification Evidence Checklist

### 3.1 Row Count Verification

| Check | Query | Result |
|-------|-------|--------|
| Profiles total | `SELECT COUNT(*) FROM profiles` | 1 |
| Profiles NULL company_id | `SELECT COUNT(*) FROM profiles WHERE company_id IS NULL` | 0 ✅ |
| Customers total | `SELECT COUNT(*) FROM customers` | 0 |
| Customers NULL company_id | `SELECT COUNT(*) FROM customers WHERE company_id IS NULL` | 0 ✅ |

### 3.2 Admin Profile Verification

| Field | Value |
|-------|-------|
| email | den.itnetwork@exportimportdept.com |
| full_name | Den Bagus M Jaelani |
| legacy role (`profiles.role`) | `super` |
| company_code | MSI |
| branch_code | HO |
| department_code | IT |
| mfa_required | true |
| company_id | (MSI UUID — non-NULL ✅) |

### 3.3 NOT NULL Constraint Verification

| Table | Column | Constraint |
|-------|--------|------------|
| `profiles` | `company_id` | NOT NULL ✅ |
| `customers` | `company_id` | NOT NULL ✅ |

---

## 4. RLS Enabled Confirmation

| Table | RLS Enabled |
|-------|-------------|
| `profiles` | ✅ Yes |
| `customers` | ✅ Yes |

All other ERP master data tables (companies, branches, departments, roles, etc.)  
had RLS enabled in migration 014 and remain unchanged.

---

## 5. Policy Confirmation

### 5.1 profiles Policies

| Policy Name | Operation | USING / WITH CHECK | Status |
|-------------|-----------|-------------------|--------|
| `profiles_read` | SELECT | `id = auth.uid()` OR `(company_id = get_user_company_id() AND is_admin_or_above())` OR `is_super_admin()` | ✅ Active |
| `profiles_update` | UPDATE | Same as above (both USING and WITH CHECK) | ✅ Active |
| INSERT | — | No policy — handled by `on_auth_user_created` trigger | ✅ By design |
| DELETE | — | No policy — deactivate via `active = false` only | ✅ By design |

### 5.2 customers Policies

| Policy Name | Operation | Key Condition | Status |
|-------------|-----------|---------------|--------|
| `customers_read` | SELECT | `company_id = get_user_company_id() AND (deleted_at IS NULL OR is_super_admin())` | ✅ Active |
| `customers_insert` | INSERT | `company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('sales_head') OR has_role('sales_staff'))` | ✅ Active |
| `customers_update` | UPDATE | `company_id = get_user_company_id()` + same role check + `has_role('finance_controller')` for credit_limit | ✅ Active |
| DELETE | — | No policy — soft delete via `deleted_at` only | ✅ By design |

---

## 6. Helper Function Confirmation

All five SECURITY DEFINER helper functions from migration 014 were confirmed active  
and returning correct values for the authenticated test user (Den, MSI, super_admin):

| Function | Return Type | Verified Result |
|----------|-------------|-----------------|
| `get_user_company_id()` | uuid | MSI company UUID ✅ |
| `is_super_admin()` | boolean | `true` ✅ (via legacy `profiles.role = 'super'` fallback) |
| `is_admin_or_above()` | boolean | `true` ✅ (via same fallback) |
| `has_role(text)` | boolean | `true` for `'super_admin'` ✅ |
| `has_permission(text, text)` | boolean | Not directly tested in this phase — used only in mutation policies |

**Note on `is_super_admin()` fallback:** The function checks both `user_roles` (new  
system) and `profiles.role::text = 'super'` (legacy). Since `user_roles` has  
`super_admin` seeded for Den, the new-system check fires first. The legacy fallback  
will be a no-op for this user but remains in place for any users not yet migrated  
to `user_roles`.

---

## 7. App Smoke Test Results

### 7.1 MSI Super Admin Smoke Tests

All smoke tests performed as `den.itnetwork@exportimportdept.com` in the staging
environment against the locally running app (localhost:5173).

| Test | Expected | Result |
|------|----------|--------|
| Login | Succeeds, dashboard loads | ✅ Pass |
| User Management page | Profile list loads, own profile visible | ✅ Pass |
| Customer list (empty) | Empty state renders, no RLS error | ✅ Pass |
| Add new customer (`INDOMARCO`, code `IM`) | Customer saved with `company_id = MSI UUID` | ✅ Pass |
| Customer appears in list | Row visible after add | ✅ Pass |
| Delete customer | Soft-delete updates `deleted_at` + `active = false` | ✅ Pass |
| Deleted customer hidden | Customer disappears from list after delete | ✅ Pass |
| Admin UI (Master Data) | AdminShell loads, all 8 tabs render | ✅ Pass |
| No console errors | No `permission denied for table` errors | ✅ Pass |

### 7.2 Cross-Company Isolation Test — ✅ PASS

**Test user:** `test.sbi.viewer@exportimportdept.com`

**Provisioned profile:**

| Field | Value |
|-------|-------|
| full_name | SBI Viewer Test |
| legacy role (`profiles.role`) | `management` |
| company_code | SBI |
| role_code (user_roles) | `viewer` |
| user_role_active | true |
| mfa_required | false |

**App smoke test as SBI Viewer:**

| Test | Expected | Result |
|------|----------|--------|
| Login | Succeeds | ✅ Pass |
| Sidebar menus | Limited — viewer-accessible menus only | ✅ Pass |
| User card | Displays "SBI Viewer Test / MANAGEMENT" | ✅ Pass |
| No unexpected admin menus | Master Data tab not visible | ✅ Pass |

**RLS customer isolation SQL verification:**

```sql
-- As authenticated SBI viewer:
SELECT COUNT(*) FROM customers;
-- Expected: 0 (SBI has no customers yet)
-- Result:   0 ✅

-- Confirm MSI customer INDOMARCO still exists in DB (not deleted):
SELECT name, code, deleted_at FROM customers WHERE code = 'IM';
-- Expected: row exists with deleted_at IS NULL
-- Result:   INDOMARCO / IM / deleted_at = null ✅
```

**Isolation conclusion:** SBI viewer receives 0 rows from `customers` SELECT — the
`customers_read` RLS policy (`company_id = get_user_company_id()`) correctly returns
only rows matching the authenticated user's company. The MSI customer `INDOMARCO`
is visible to MSI users but invisible to the SBI viewer.

**Cross-company isolation verdict: ✅ PASS**

---

## 8. Resolved Blockers

Two source code blockers were identified and resolved during Phase 1.0F before  
Stage 3 (RLS activation) could proceed.

### 8.1 deleteCustomer() Hard Delete → Soft Delete

**Blocker:** `src/lib/db.js deleteCustomer()` used `DELETE FROM customers`.  
Customers RLS has no DELETE policy by design. Hard delete would fail after  
RLS activation with `permission denied for table customers`.

**Resolution (PR #13, branch `fix/customer-soft-delete-rls`):**

```js
// Before:
const { error } = await supabase.from('customers').delete().eq('id', id);

// After:
const { error } = await supabase
  .from('customers')
  .update({ deleted_at: new Date().toISOString(), active: false })
  .eq('id', id);
```

Both `deleted_at` and `active = false` are set:
- `deleted_at` — excluded by `customers_read` RLS and explicit `listCustomers()` filter
- `active = false` — keeps legacy in-memory `c.active !== false` filter consistent (App.jsx SP dropdown)

`listCustomers()` also updated to add `.is('deleted_at', null)` explicitly.

**Verified:** ✅ Delete smoke test passes; deleted rows remain in DB with `deleted_at` set.

### 8.2 Customer Insert Missing company_id

**Blocker:** `customerToDb()` never produced `company_id`. Every INSERT payload  
had `company_id = NULL`. The `customers_insert` WITH CHECK  
(`company_id = get_user_company_id()`) evaluated `NULL = MSI_uuid` → false →  
RLS rejection: `new row violates row-level security policy for table "customers"`.

**Resolution (PR #14, branch `fix/customer-company-id-rls-insert`):**

Added private `getCurrentUserCompanyId()` helper that reads `company_id` from  
`profiles` for the authenticated session user. Called in the INSERT path of  
`upsertCustomer()`:

```js
// INSERT path — resolve company_id before Supabase call
if (c.company_id) {
  payload.company_id = c.company_id;
} else {
  try {
    payload.company_id = await getCurrentUserCompanyId();
  } catch (err) {
    return { data: null, error: err };
  }
}
```

If `profiles.company_id` is NULL for the current user, a clear error is returned:  
`"Unable to create customer: current user has no company assigned."`

**Verified:** ✅ Add customer smoke test passes; new row has `company_id = MSI UUID`.

---

## 9. Remaining Notes and Risks

### 9.1 listCustomers() SELECT *

`listCustomers()` still uses `SELECT *`. This is safe post-RLS (only company-scoped  
rows are returned). Performance improvement (select specific columns) is deferred  
to a Phase 1.0G refactor task.

### 9.2 user_roles Not Yet Fully Populated

`user_roles` has one row (Den → super_admin). All other `user_roles` mappings from  
legacy `profiles.role` enum are not yet created. The `is_super_admin()` and  
`is_admin_or_above()` helpers include the legacy `profiles.role = 'super'` fallback  
which covers the transition. This fallback must remain until all users are migrated.

**Risk:** If a new user is created via Supabase Auth (without a `user_roles` row  
and with `profiles.role` not matching the legacy enum), they will get zero RLS  
access. Acceptable for staging; must be documented before production go-live.

### 9.3 Auth Trigger Broken After profiles.company_id NOT NULL — ✅ Resolved (Migration 016)

**Found after Phase 1.0F execution:** `public.handle_new_user()` (defined in migration 000)
inserts only `(id, full_name, role, active)`. After Phase 1.0F set `profiles.company_id NOT NULL`,
any new Supabase Auth user creation (via Dashboard "Add user" or Auth API) failed with:

```
Database error creating new user
```

**Resolution:** Migration 016
(`supabase/migrations/20260524000016_auth_profile_trigger_company_defaults.sql`)
applied in staging SQL editor. The patched `handle_new_user()`:
- Reads `company_code`, `branch_code`, `department_code`, `full_name` from `raw_user_meta_data`
- Defaults: `company_code = 'MSI'`, `branch_code = 'HO'`, `department_code = 'IT'`
- Resolves `company_id` from `companies` — raises exception if not found
- Resolves `branch_id` and `department_id` — nullable, no exception if missing
- Inserts all required fields: `id, full_name, role, active, company_id, branch_id, department_id, mfa_required`

**Verified:** `test.sbi.viewer@exportimportdept.com` was created successfully via
Supabase Dashboard after migration 016 was applied. Profile row confirmed with
`company_id = SBI UUID`, `role = management`, `active = true`. ✅

### 9.4 Cross-Company Isolation — ✅ PASS

The cross-company isolation test has been completed. See Section 7.2 for full evidence.

**Summary:** SBI viewer (`test.sbi.viewer@exportimportdept.com`) returns 0 customers
from `SELECT * FROM customers` while the MSI customer `INDOMARCO` (code `IM`,
`deleted_at = NULL`) remains visible to MSI users. RLS policy `customers_read` is
correctly enforcing company-scoped isolation.

This was a **production execution gate requirement** — it is now satisfied for staging.

### 9.5 profiles.role Enum Column Not Dropped

`profiles.role` (legacy `user_role_legacy` ENUM) is still present and still used  
by `UserManagement.jsx` for display and editing. Column drop is deferred until  
Phase 1.0F is verified in production and all users are on `user_roles`.

### 9.6 sp_items / ar_ttfs / ar_btbs RLS Not Enabled

These legacy transaction tables remain without RLS. They are accessed by  
authenticated staff only and are internal-use tables with no company_id scoping  
today. RLS for transaction tables is deferred to Phase 2+ when the transaction  
modules are built with proper company_id columns.

### 9.7 deleteCustomer() Leaves Orphaned sp_items References

`sp_items.customer_id` is a FK to `customers` with `ON DELETE SET NULL`. After  
soft-delete, the customer row remains in the DB (deleted_at set), so the FK  
remains valid. SP items referencing a soft-deleted customer will show a blank  
customer name in the join result (`customers?.name` will still resolve since the  
row exists). This is acceptable — it is the same behavior as if the customer were  
deactivated (`active = false`).

---

## 10. Go / No-Go Conclusion

### Staging — ✅ FULLY VERIFIED

| Criterion | Status |
|-----------|--------|
| All profiles rows have non-NULL company_id | ✅ |
| All customers rows have non-NULL company_id | ✅ |
| profiles RLS enabled | ✅ |
| customers RLS enabled | ✅ |
| All 5 policies active | ✅ |
| get_user_company_id() returns correct UUID | ✅ |
| is_super_admin() returns true for super admin | ✅ |
| Login smoke test (MSI super admin) | ✅ |
| User Management smoke test | ✅ |
| Customer list smoke test | ✅ |
| Add customer smoke test | ✅ |
| Delete customer smoke test | ✅ |
| Admin UI smoke test | ✅ |
| No permission denied console errors | ✅ |
| deleteCustomer() soft-delete in place | ✅ |
| customer insert sends company_id | ✅ |
| Migration 016 applied (auth trigger company defaults) | ✅ |
| New Auth user creation verified post-migration 016 | ✅ (SBI Viewer Test user created) |
| Cross-company isolation test (SBI viewer vs MSI customers) | ✅ PASS |

**Staging verdict: FULLY VERIFIED ✅** — all Phase 1.0F staging gates cleared.

### Production — Pending Formal Approval ⚠️

Staging verification is complete. Production execution requires the following
before applying Phase 1.0F (migrations 015 + 016) to the production environment:

| Gate | Status |
|------|--------|
| Cross-company isolation test | ✅ Passed in staging |
| Migration 016 verified in staging | ✅ Verified |
| Technical lead sign-off | ⚠️ Pending |
| Product owner sign-off | ⚠️ Pending |
| Production backfill strategy confirmed (profiles: MSI vs SBI per user) | ⚠️ Pending review |
| `deleteCustomer()` soft-delete behavior communicated to ops team | ⚠️ Soft-delete — rows not erased, visible in Supabase table editor |
| Confirm no production profiles/customers rows have NULL company_id before applying Stage 2 | ⚠️ Must verify on production DB |
| Production smoke test plan documented | ⚠️ Pending |

---

## 11. Related Files

| File | Role |
|------|------|
| `supabase/migrations/20260524000015_profiles_customers_rls_transition.sql` | The executed migration (Stages 1–3) |
| `docs/operations/profiles-customers-rls-transition.md` | Staged execution plan and backfill strategy |
| `docs/operations/staging-execution-verification-log.md` | Phase 1.0D+++ — prior staging verification |
| `src/lib/db.js` | Fixed: soft-delete, company_id on insert, deleted_at filter |
| `src/contexts/AuthContext.jsx` | Reads `profile.active` — verified working under profiles RLS |
| `src/components/UserManagement.jsx` | Reads profiles via `listProfiles()` — verified working |
| `src/hooks/useCustomers.js` | Calls `upsertCustomer()` / `deleteCustomer()` — verified working |
