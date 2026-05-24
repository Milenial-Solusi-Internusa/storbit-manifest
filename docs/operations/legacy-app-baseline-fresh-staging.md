# Nexus by MSI — Legacy App Baseline for Fresh Staging

**Phase:** 1.0D++  
**Last Updated:** 2026-05-24  
**Branch:** `phase-1-legacy-baseline-fresh-staging`  
**Status:** DRAFT — migration must not be executed without explicit approval  
**Migration file:** `supabase/migrations/20260524000000_legacy_app_baseline.sql`

---

## Overview

A fresh Supabase staging project has no public schema tables. The existing Storbit Manifest frontend requires certain legacy tables to be present before migrations 001–014 can run. This document defines why migration 000 exists, what it creates, how it was derived from the source code, and how to verify it is correct.

---

## 1. Why Migration 000 Is Needed

Migrations 007 and 008 use `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS` and `ALTER TABLE customers ADD COLUMN IF NOT EXISTS`. These statements require the tables to already exist. On a fresh Supabase project with no public tables, migrations 007 and 008 would fail with:

```
ERROR: relation "profiles" does not exist
ERROR: relation "customers" does not exist
```

Migration 000 creates the five legacy tables in their original form (as they exist in the working production application) before migration 001 runs.

---

## 2. Source Code Derivation

Every column in migration 000 was derived from reading the actual source code. No columns were guessed or assumed.

### 2.1 Tables and Source References

| Table | Source Files | Key Functions |
|-------|-------------|---------------|
| `profiles` | `src/contexts/AuthContext.jsx`, `src/components/UserManagement.jsx`, `src/lib/db.js` | `fetchProfileById()`, `listProfiles()`, `updateProfile()`, `getMyProfile()` |
| `customers` | `src/lib/db.js` | `customerFromDb()`, `customerToDb()`, `listCustomers()`, `upsertCustomer()`, `deleteCustomer()` |
| `sp_items` | `src/lib/db.js`, `src/hooks/useSpItems.js` | `spFromDb()`, `spToDb()`, `listSpItems()`, `insertSpItem()`, `updateSpItem()`, `deleteSpItem()`, `bulkInsertSpItems()` |
| `ar_ttfs` | `src/lib/db.js`, `src/hooks/useTtfs.js` | `ttfFromDb()`, `ttfToDb()`, `listTtfs()`, `insertTtf()`, `updateTtf()`, `deleteTtf()` |
| `ar_btbs` | `src/lib/db.js` | btbPayload construction inside `insertTtf()` and `updateTtf()` |

### 2.2 Column Derivation Evidence

**`profiles` columns — from `AuthContext.jsx` and `UserManagement.jsx`:**
```js
// AuthContext.jsx — fields read at login time:
profile.role, profile.active, profile.full_name, profile.id
isAuthenticated: !!session && !!profile && profile.active

// UserManagement.jsx — fields shown and written:
p.id, p.full_name, p.role, p.active
updateProfile(id, { role: newRole })     // role written
updateProfile(id, { active: newActive }) // active written
updateProfile(id, { full_name: newName }) // full_name written

// db.js listProfiles():
.select('*').order('created_at')         // created_at must exist
```

**`profiles.role` is an enum, not text** — confirmed by:
- `migration 014 RLS draft`: `role::text = 'super'` (explicit cast needed only for enum types)
- `migration 007 comment`: "The legacy profiles.role (enum)"
- `UserManagement.jsx ROLES`: exactly 5 values — `super`, `logistic`, `procurement`, `finance`, `management`

**`customers` columns — from `customerFromDb()` and `customerToDb()`:**
```js
// customerFromDb() reads (SELECT * result):
{ id, code, name, defaultDc: row.default_dc, picName: row.pic_name,
  picEmail: row.pic_email, active }

// customerToDb() writes (INSERT/UPDATE payload):
{ code, name, default_dc, pic_name, pic_email, active }

// migration 008 comment — confirms pre-existing legacy columns:
"Existing columns (id, name, payment_terms integer, active, created_at,
updated_at, and any others already present) are NOT touched."
```

`code`, `default_dc`, `pic_name`, `pic_email` are used by `customerToDb()` for writes, confirming they are pre-existing legacy columns (migration 008 adds them with `IF NOT EXISTS` precisely because they may already be there).

**`sp_items` columns — from `spFromDb()` and `spToDb()`:**
```js
// spFromDb() reads all these from DB row:
id, sp_date, sp_no, customer_id, (customers.name join),
product_name, sku, qty, shipped_qty, exp_date, deadline, dc,
shipping_date, btb_no, unit_price, shipping_price,
inv, fp, submit, kirim, submit_date, email_status, notes,
created_at, updated_at

// spToDb() writes all fields except id/created_at/updated_at
// Query: .select('*, customers(name)') confirms the customers join
// Query: .order('sp_date', { ascending: false, nullsFirst: false })
//        confirms sp_date is a date/timestamptz column
```

**`ar_ttfs` columns — from `ttfFromDb()` and `ttfToDb()`:**
```js
// ttfFromDb() reads:
id, no_ttf, tanggal_ttf, tanggal_menerima, no_inv, no_sp,
customer_id, tgl_pembayaran, notes, ar_btbs (joined)

// ttfToDb() writes (INSERT/UPDATE):
no_ttf, tanggal_ttf, tanggal_menerima, no_inv, no_sp,
customer_id, tgl_pembayaran, notes

// deleteTtf() comment: "ar_btbs cascade-delete via FK"
// → confirms ar_btbs.ttf_id FK must have ON DELETE CASCADE
```

**`ar_btbs` columns — from `btbPayload` construction in `db.js`:**
```js
// insertTtf() builds:
const btbPayload = (t.btbs || []).map((b, idx) => ({
    ttf_id: header.id,
    no_btb: b.noBTB || '',
    dpp_ppn: Number(b.dppPpn) || 0,
    pph: Number(b.pph) || 0,
    payment: Number(b.payment) || 0,
    position: idx,
}));

// ttfFromDb() reads btbs:
.sort((a, b) => (a.position || 0) - (b.position || 0))
.map(b => ({ id, noBTB: b.no_btb, dppPpn: b.dpp_ppn, pph, payment }))

// updateTtf() strategy: DELETE all btbs, then re-INSERT
// → no updated_at trigger needed on ar_btbs
```

### 2.3 Why `ar_ttfs` and not `ttfs`

The pre-execution check listed `ttfs` as missing. The actual Supabase table name used throughout `src/lib/db.js` is `ar_ttfs`:

```js
.from('ar_ttfs')  // lines 225, 234, 256, 266, 289, 298
.from('ar_btbs')  // lines 250, 272, 284
```

The pre-check was checking the wrong table name. The correct tables to create are `ar_ttfs` and `ar_btbs`.

---

## 3. Design Decisions

### 3.1 No RLS in Migration 000

RLS is not enabled on any table in this migration. Reasons:

- `profiles` and `customers`: RLS is blocked until Phase 1.0F backfill sets `company_id` for all rows. Enabling RLS before backfill locks all users out (NULL != any company_id). These policies are in commented blocks in migration 014.
- `sp_items`, `ar_ttfs`, `ar_btbs`: These are legacy transaction tables. Their RLS policies belong in Phase 2+ transaction modules (not yet designed).

The Supabase anon key in the frontend and Supabase Auth session enforcement provide the current security layer for these tables.

### 3.2 `user_role_legacy` Enum Type

The `profiles.role` column uses a PostgreSQL ENUM type rather than plain TEXT. Evidence:
- Migration 014 RLS uses `role::text = 'super'` — the `::text` cast is only necessary for enum types.
- Migration 007 refers to "the legacy profiles.role (enum)".

Using ENUM ensures invalid role values cannot be stored. The enum uses `CREATE TYPE ... DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` pattern for idempotency.

### 3.3 `set_updated_at()` Function Defined in Migration 000

Migration 001 also defines `set_updated_at()` using `CREATE OR REPLACE`. By defining it first in migration 000 with the same `CREATE OR REPLACE` pattern, both definitions are identical and the second is a no-op. This avoids a function-does-not-exist error if migration 000 tables needed the trigger before migration 001 runs.

### 3.4 `on_auth_user_created` Trigger

The trigger is necessary because:
- `AuthContext.jsx` checks `!!profile && profile.active` before granting `isAuthenticated = true`.
- Without a profile row, any user who logs in will have `profile = null` → `isAuthenticated = false` → redirect to login page.
- The trigger creates a profile row automatically for every new Supabase Auth user.

Default role is `'logistic'` (the safest non-super role). The first user must be manually elevated to `'super'` via SQL or the UserManagement page once another super user exists.

The trigger is declared `SECURITY DEFINER SET search_path = public` to prevent search_path hijacking (same pattern as the RLS helper functions in migration 014).

### 3.5 No Business Data Inserted

Migration 000 creates schema only. No INSERT statements. The legacy app shows empty lists when tables exist but have no data — this is correct behavior for fresh staging.

### 3.6 Columns NOT Included (handled by migrations 001–014)

The following fields appear in source code but are NOT in migration 000, because they are explicitly added by later migrations:

| Column | Table | Added by | Reason |
|--------|-------|----------|--------|
| `company_id` | `profiles` | migration 007 | Phase 1.0F ERP field |
| `branch_id` | `profiles` | migration 007 | Phase 1.0F ERP field |
| `department_id` | `profiles` | migration 007 | Phase 1.0F ERP field |
| `position_id` | `profiles` | migration 007 | Phase 1.0F ERP field |
| `last_login_at` | `profiles` | migration 007 | Phase 1.0F ERP field |
| `mfa_required` | `profiles` | migration 007 | Phase 1.0F ERP field |
| `company_id` | `customers` | migration 008 | Phase 1.0F ERP field |
| `legal_name` | `customers` | migration 008 | ERP extension |
| `credit_limit` | `customers` | migration 008 | ERP extension |
| `payment_terms_id` | `customers` | migration 008 | ERP extension (FK) |
| `deleted_at` | `customers` | migration 008 | ERP soft delete field |

---

## 4. Pre-Execution Checklist

Before running migration 000 on staging:

```
[ ] Fresh Supabase staging project confirmed (no public tables):
    SELECT tablename FROM pg_tables WHERE schemaname = 'public';
    -- Expected: 0 rows

[ ] auth.users confirmed empty:
    SELECT COUNT(*) FROM auth.users;
    -- Expected: 0

[ ] uuid-ossp extension available:
    SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp';
    -- Note: Supabase enables this by default; migration 000 also enables it.

[ ] Target environment is staging (NOT production)
    Verify VITE_SUPABASE_URL points to staging project

[ ] Migration file is identical to the reviewed version:
    wc -l supabase/migrations/20260524000000_legacy_app_baseline.sql
    git diff supabase/migrations/20260524000000_legacy_app_baseline.sql
    -- Expected: no uncommitted changes to the migration file
```

---

## 5. Execution Order

Migration 000 MUST be applied before migration 001. After migration 000 succeeds, proceed with the full execution order defined in `docs/operations/staging-migration-readiness.md`.

```
Step 0:  Apply 20260524000000_legacy_app_baseline.sql   ← THIS MIGRATION
Step 1:  Apply 20260524000001_companies.sql
Step 2:  Apply 20260524000002_branches_departments.sql
...
Step 14: Apply 20260524000014_rls_policy_draft.sql
```

---

## 6. Verification Queries

Run these in the Supabase SQL editor immediately after applying migration 000:

```sql
-- 1. All 5 tables created
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: ar_btbs, ar_ttfs, customers, profiles, sp_items

-- 2. profiles columns (6 legacy columns; migration 007 will add 6 more)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
-- Expected: id(uuid), full_name(text), role(USER-DEFINED/enum),
--           active(bool), created_at(timestamptz), updated_at(timestamptz)

-- 3. customers columns (10 legacy columns; migration 008 will add ~17 more)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'customers'
ORDER BY ordinal_position;
-- Expected: id, name, code, default_dc, pic_name, pic_email,
--           active, payment_terms, created_at, updated_at

-- 4. sp_items columns (all 22)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'sp_items'
ORDER BY ordinal_position;
-- Expected: id, sp_date, sp_no, customer_id, product_name, sku, qty,
--           shipped_qty, exp_date, deadline, dc, shipping_date, btb_no,
--           unit_price, shipping_price, inv, fp, submit, kirim,
--           submit_date, email_status, notes, created_at, updated_at

-- 5. ar_btbs FK has ON DELETE CASCADE
SELECT
    tc.constraint_name,
    tc.table_name,
    rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'ar_btbs'
  AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: delete_rule = CASCADE

-- 6. Auth trigger exists
SELECT trigger_name, event_object_schema, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Expected: 1 row (event_object_schema = auth)

-- 7. Helper function set_updated_at defined
SELECT proname, prosrc FROM pg_proc WHERE proname = 'set_updated_at';
-- Expected: 1 row

-- 8. handle_new_user defined and is SECURITY DEFINER
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'handle_new_user';
-- Expected: 1 row, prosecdef = true

-- 9. Enum type defined
SELECT typname, array_agg(enumlabel ORDER BY enumsortorder) AS values
FROM pg_type JOIN pg_enum ON pg_type.oid = pg_enum.enumtypid
WHERE typname = 'user_role_legacy'
GROUP BY typname;
-- Expected: values = {management, logistic, procurement, finance, super}

-- 10. Tables are empty (no data inserted)
SELECT
    (SELECT COUNT(*) FROM profiles)  AS profiles,
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM sp_items)  AS sp_items,
    (SELECT COUNT(*) FROM ar_ttfs)   AS ar_ttfs,
    (SELECT COUNT(*) FROM ar_btbs)   AS ar_btbs;
-- Expected: all 0

-- 11. All indexes created
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY indexname;
-- Expected includes: idx_ar_btbs_ttf_id, idx_ar_ttfs_customer_id,
--   idx_ar_ttfs_tanggal_ttf, idx_ar_ttfs_tgl_pembayaran,
--   idx_customers_active, idx_customers_name,
--   idx_sp_items_customer_id, idx_sp_items_sp_date, idx_sp_items_sp_no

-- 12. RLS NOT enabled (profiles, customers, sp_items, ar_ttfs, ar_btbs)
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('profiles','customers','sp_items','ar_ttfs','ar_btbs');
-- Expected: rowsecurity = false for ALL 5 tables
```

---

## 7. First User Setup (After Migration 000)

After migration 000 runs and before testing the application:

1. Create a user in Supabase Dashboard → Authentication → Users → Add User.
2. The `on_auth_user_created` trigger will automatically insert a profiles row with `role = 'logistic'`.
3. Set this user's role to `'super'` so they can access UserManagement:
   ```sql
   UPDATE profiles
   SET role = 'super'
   WHERE id = '<your_user_uuid>';
   ```
4. Log in to the application — should now see all menus including User Management.
5. Subsequent users can be invited via the Supabase Dashboard and their roles set via the UserManagement page.

---

## 8. Known Limitations of Migration 000

| Limitation | Impact | Resolution |
|------------|--------|-----------|
| No RLS on `sp_items`, `ar_ttfs`, `ar_btbs` | Any authenticated user can read/write any row | Acceptable for staging. Phase 2+ migration adds RLS with company scope. |
| No RLS on `profiles` | Any authenticated user can read all profiles | Acceptable for legacy app. Phase 1.0F enables profiles RLS after company_id backfill. |
| No RLS on `customers` | Any authenticated user can read all customers | Same as profiles — Phase 1.0F deferred. |
| `user_role_legacy` enum adds 5 fixed values | Cannot add new role values without an ALTER TYPE migration | Intentional — legacy roles are frozen. New roles go in the `roles` table (migration 005). |
| `on_auth_user_created` trigger default role is `logistic` | First user must manually be elevated to `super` | Documented above. Admin setup step. |

---

## 9. Rollback

To completely undo migration 000:

```sql
-- In reverse dependency order:
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS ar_btbs;
DROP TABLE IF EXISTS ar_ttfs;
DROP TABLE IF EXISTS sp_items;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS profiles;
DROP TYPE IF EXISTS user_role_legacy;
-- Note: set_updated_at() is NOT dropped here because migration 001
-- may have already defined or reused it. Only drop set_updated_at()
-- after migration 001 is also rolled back.
```

**Warning:** If business data has been entered in staging (customers, sp_items, ar records), all of it will be lost. Always back up staging data before rollback.

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-24 | Phase 1.0D++ | Initial document created |
