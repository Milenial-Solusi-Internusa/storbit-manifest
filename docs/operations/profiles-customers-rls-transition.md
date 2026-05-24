# Nexus by MSI — Profiles & Customers RLS Transition

**Phase:** 1.0F  
**Last Updated:** 2026-05-25  
**Status:** DRAFT — awaiting staged execution approval  
**Migration file:** `supabase/migrations/20260524000015_profiles_customers_rls_transition.sql`  
**Branch:** `phase-1-profiles-customers-rls-transition`

---

## 1. Purpose

This document describes the plan and verification checklist for enabling Row Level Security on the two legacy tables that were excluded from migration 014:

- `profiles` — the legacy user profile table (from `supabase/migrations/20260524000000_legacy_app_baseline.sql`)
- `customers` — the legacy customer table (from the original Storbit Manifest app)

Both tables require a **company_id backfill** before RLS can be safely enabled. Until all rows have a non-NULL `company_id`, enabling RLS would return empty results for every query — immediately locking out all users from the Customer page and User Management.

---

## 2. Why Was RLS Deferred from Migration 014?

Migration 014 (`20260524000014_rls_policy_draft.sql`) enabled RLS on all 20 new ERP master data tables. It deliberately **did not** enable RLS on `profiles` or `customers` because:

| Table | Blocker |
|-------|---------|
| `profiles` | `company_id` is NULL for all rows. Added as nullable column in migration 007. No backfill has run. |
| `customers` | `company_id` is NULL for all rows. Added as nullable column in migration 008. No backfill has run. |

The RLS helper function `get_user_company_id()` reads `profiles.company_id`. If `company_id` is NULL for all profiles, then `get_user_company_id()` returns NULL for every user. Every company-scoped RLS policy would then evaluate `NULL = get_user_company_id()` → false → no rows returned.

Enabling RLS before backfill would break the app immediately:
- User Management page: empty list (can't read own profile)
- Customer page: empty list (can't read any customer)
- Login: would succeed at Auth layer, but profile read would return nothing — breaking `AuthContext.jsx` which reads `profile.active` before setting `isAuthenticated = true`

---

## 3. Current Staging State

| Item | Status |
|------|--------|
| Staging Supabase project | `untmpqceexwxzuhlmyrg` |
| Migrations 000–014 applied | ✅ Yes |
| profiles RLS | ❌ Not enabled |
| customers RLS | ❌ Not enabled |
| profiles.company_id | NULL for all rows |
| customers.company_id | NULL for all rows |
| First admin provisioned | den.itnetwork@exportimportdept.com (MSI, super_admin) |
| Legacy app working | ✅ Yes — login, dashboard, Customer page, SP manifest all functional |

---

## 4. Backfill Strategy

### 4.1 profiles.company_id

#### The Decision

Migration 007 note suggested:

```
UPDATE profiles SET company_id = <SBI_uuid> WHERE company_id IS NULL;
```

This assumed all legacy Storbit Manifest users belong to SBI (General Trading).

**CONFLICT:** The first super admin provisioned in staging (`den.itnetwork@exportimportdept.com`) was assigned `company = MSI`, not SBI. A blanket SBI assignment would be incorrect for this user.

#### Resolution

Before running the backfill, the DBA must:

1. Run the review query:
   ```sql
   SELECT id, full_name, role, company_id FROM profiles ORDER BY full_name;
   ```

2. Determine the correct company for each user based on their business context.

3. Choose an approach:

**Option A — All to SBI (simple, use only if all legacy users are confirmed SBI staff):**
```sql
UPDATE profiles
SET company_id = (SELECT id FROM companies WHERE code = 'SBI')
WHERE company_id IS NULL;
-- Then manually fix any MSI/JCI admin accounts:
UPDATE profiles
SET company_id = (SELECT id FROM companies WHERE code = 'MSI')
WHERE id = '<msi_admin_profile_uuid>';
```

**Option B — Per-user assignment (recommended for correctness):**
```sql
-- Step 1: MSI admins (super_admin tier, known MSI staff)
UPDATE profiles
SET    company_id = (SELECT id FROM companies WHERE code = 'MSI')
WHERE  id IN (
         -- list of profile UUIDs for known MSI users
         '<den_profile_uuid>'
       )
  AND  company_id IS NULL;

-- Step 2: Remaining rows default to SBI
UPDATE profiles
SET    company_id = (SELECT id FROM companies WHERE code = 'SBI')
WHERE  company_id IS NULL;
```

#### Verification After Backfill
```sql
-- Must be 0 before proceeding to NOT NULL constraint
SELECT COUNT(*) FROM profiles WHERE company_id IS NULL;

-- Sanity check: user count per company
SELECT c.code, COUNT(p.id) AS user_count
FROM   profiles p JOIN companies c ON p.company_id = c.id
GROUP  BY c.code ORDER BY c.code;
```

---

### 4.2 customers.company_id

#### Rationale

Storbit Manifest was built for SBI (Storbit / General Trading). All existing customers in the `customers` table are SBI's operational customers. This is consistent with migration 008 note.

#### Backfill SQL (included as live SQL in migration 015)

```sql
UPDATE customers
SET    company_id = (SELECT id FROM companies WHERE code = 'SBI')
WHERE  company_id IS NULL;
```

This statement is **not commented out** in migration 015 — it is safe to run against legacy data and has a clear business justification.

#### Verification After Backfill
```sql
-- Must be 0 before proceeding to NOT NULL constraint
SELECT COUNT(*) FROM customers WHERE company_id IS NULL;

-- Sanity check
SELECT c.code, COUNT(cu.id) AS customer_count
FROM   customers cu JOIN companies c ON cu.company_id = c.id
GROUP  BY c.code;
-- Expected: all under SBI
```

---

## 5. RLS Activation Strategy

RLS is enabled in **Stage 3** of the migration, after the backfill and NOT NULL constraints are verified. The RLS blocks are commented out in migration 015 and must be executed manually.

### 5.1 profiles RLS Policies

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `profiles_read` | SELECT | Own profile, OR same company + admin_or_above, OR super_admin |
| `profiles_update` | UPDATE | Own profile, OR same company + admin_or_above, OR super_admin |
| No INSERT | — | Handled by `on_auth_user_created` Auth trigger |
| No DELETE | — | Deactivate via `active = false`, never hard-delete |

**Design note:** The `is_super_admin()` helper includes a legacy fallback: `profiles.role::text = 'super'`. During the Phase 1.0D → 1.0F transition, `user_roles` may be empty for legacy users. The fallback ensures existing super users retain access via the legacy role enum column.

### 5.2 customers RLS Policies

| Policy | Operation | Condition |
|--------|-----------|-----------|
| `customers_read` | SELECT | Same company + not soft-deleted, OR super_admin |
| `customers_insert` | INSERT | Same company + (admin_or_above OR sales_head OR sales_staff) |
| `customers_update` | UPDATE | Same company + not soft-deleted + (admin_or_above OR sales roles OR finance_controller for credit_limit) |
| No DELETE | — | Soft delete via `deleted_at`, no hard DELETE |

**Important:** `src/lib/db.js deleteCustomer()` currently performs a hard `DELETE FROM customers`. This function will be blocked by RLS once enabled (no DELETE policy). **Migrate `deleteCustomer()` to soft-delete before or immediately after Stage 3.** This is a required follow-up task.

---

## 6. Staged Execution Checklist

Execute in order. Do NOT skip stages.

### Stage 1: Backfill

- [ ] Supabase staging environment confirmed
- [ ] Run pre-execution CHECK queries 1–6 (see migration 015 comments)
- [ ] Review `SELECT id, full_name, role FROM profiles` — decide Option A or B for profiles
- [ ] Run STEP 1A (profiles backfill — Option A or B as decided)
- [ ] Verify: `SELECT COUNT(*) FROM profiles WHERE company_id IS NULL` = 0
- [ ] Run STEP 2A (customers backfill — SBI default)
- [ ] Verify: `SELECT COUNT(*) FROM customers WHERE company_id IS NULL` = 0
- [ ] Run app smoke test: login, dashboard, Customer page — all functional

### Stage 2: NOT NULL Constraints

- [ ] Stage 1 complete and verified
- [ ] Run STEP 1B: `ALTER TABLE profiles ALTER COLUMN company_id SET NOT NULL`
- [ ] Verify: `\d profiles` — company_id shows `not null`
- [ ] Run STEP 2B: `ALTER TABLE customers ALTER COLUMN company_id SET NOT NULL`
- [ ] Verify: `\d customers` — company_id shows `not null`
- [ ] Run app smoke test: login, dashboard, Customer page — all functional (RLS not yet active)

### Stage 3: Enable RLS

- [ ] Stage 2 complete and verified
- [ ] Confirm `get_user_company_id()` returns correct UUID for test user:
  ```sql
  SELECT get_user_company_id();  -- run as authenticated user via API or SQL editor with set role
  ```
- [ ] Uncomment and run STEP 3A (profiles RLS + policies)
- [ ] Smoke test: login → User Management shows own profile (and company profiles for admins)
- [ ] Uncomment and run STEP 3B (customers RLS + policies)
- [ ] Smoke test: Customer page shows SBI customers for SBI user
- [ ] Smoke test: no `permission denied for table` errors in browser console
- [ ] Plan and schedule `deleteCustomer()` soft-delete migration (follow-up task)

---

## 7. Known Issues and Deferred Items

### 7.1 deleteCustomer() Hard Delete

`src/lib/db.js deleteCustomer()` uses `DELETE FROM customers WHERE id = ?`. Once customers RLS is active with no DELETE policy, this will fail with "permission denied for table customers".

**Mitigation:** Before Stage 3, update `deleteCustomer()` to a soft-delete:
```js
// Replace hard delete:
const { error } = await supabase.from('customers').delete().eq('id', id);

// With soft delete:
const { error } = await supabase
  .from('customers')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', id);
```

This is a Phase 1.0F follow-up task. Track in a separate branch.

### 7.2 listCustomers() SELECT *

`src/lib/db.js listCustomers()` uses `SELECT *`. After RLS is active, this is safe (RLS filters rows to company scope), but selecting only required columns is recommended for performance. Track as a Phase 1.0G refactor task.

### 7.3 listCustomers() Missing deleted_at Filter

After customers RLS is active, soft-deleted customers will be hidden by the `deleted_at IS NULL` RLS condition. However, the current `listCustomers()` query does not filter `deleted_at` explicitly — it will appear to work but relies on RLS. Once ERP features start reading customers, add an explicit `deleted_at IS NULL` filter to the query for clarity and defense in depth.

### 7.4 profiles.is_active vs profiles.active

The `profiles` table uses `active` (legacy boolean column), not `is_active`. Do NOT add `is_active` to profiles unless intentionally migrating away from the legacy column. The RLS policies in migration 015 use no active/is_active filter — profile visibility is scoped by company_id and auth.uid() only.

### 7.5 user_roles Transition

After Phase 1.0F, `user_roles` should be populated to match existing `profiles.role` values. The `is_super_admin()` and `is_admin_or_above()` helper functions include a legacy fallback for `profiles.role = 'super'` which covers the transition period. Once user_roles is populated:
- The legacy fallback becomes a no-op
- `profiles.role` enum column can eventually be dropped (separate phase, separate approval)

---

## 8. Rollback Plan

If any stage introduces regressions, roll back in reverse order:

### Roll back Stage 3 (RLS disable)
```sql
-- Disable customers RLS
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_update" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_read"   ON customers;

-- Disable profiles RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_read"   ON profiles;
```

### Roll back Stage 2 (NOT NULL constraints)
```sql
ALTER TABLE customers ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE profiles  ALTER COLUMN company_id DROP NOT NULL;
```

### Roll back Stage 1 (backfill — only if full rollback needed)
```sql
-- Only if re-running the backfill with different values
UPDATE customers SET company_id = NULL;
UPDATE profiles  SET company_id = NULL;
```

---

## 9. Go / No-Go Criteria

### Go for Staging Stage 3 (RLS activation)
- [ ] All 3 stages pass with no errors
- [ ] Login smoke test passes
- [ ] UserManagement loads and shows correct profiles
- [ ] Customer page loads and shows correct customers
- [ ] No `permission denied` errors in browser console
- [ ] deleteCustomer() soft-delete migration is in place (or feature is disabled)

### No-Go (block Stage 3 if any of these are true)
- [ ] Any profile row still has NULL company_id
- [ ] Any customer row still has NULL company_id
- [ ] get_user_company_id() returns NULL for authenticated test user
- [ ] deleteCustomer() still uses hard DELETE (would break on next delete attempt)
- [ ] App smoke test shows any Supabase errors after Stages 1–2

### Production Execution Gate (remains BLOCKED)
Production execution requires all staging Go criteria to pass plus:
- [ ] Technical lead sign-off
- [ ] Product owner sign-off
- [ ] Full cross-company isolation test matrix run (MSI user cannot see SBI customers)
- [ ] at least one non-super test user created and verified

---

## 10. Related Files

| File | Role |
|------|------|
| `supabase/migrations/20260524000015_profiles_customers_rls_transition.sql` | The migration draft (this phase) |
| `supabase/migrations/20260524000014_rls_policy_draft.sql` | Section 5B + 6B — original policy definitions (source of policies in 015) |
| `supabase/migrations/20260524000007_profiles_extension.sql` | Added company_id column to profiles |
| `supabase/migrations/20260524000008_customers_extension.sql` | Added company_id column to customers |
| `supabase/migrations/20260524000000_legacy_app_baseline.sql` | Legacy profiles/customers table definitions |
| `src/contexts/AuthContext.jsx` | Reads `profile.active` — must continue working after RLS |
| `src/components/UserManagement.jsx` | Reads profiles via listProfiles() — must continue working |
| `src/hooks/useCustomers.js` | Reads customers via listCustomers() — must continue working |
| `src/lib/db.js` | `deleteCustomer()` hard-delete — must be migrated before Stage 3 |
| `docs/security/rls-policy-draft.md` | Full RLS rationale and helper function design |
| `docs/operations/staging-execution-verification-log.md` | Staging state as of Phase 1.0D+++ |
