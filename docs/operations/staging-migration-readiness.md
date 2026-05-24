# Nexus by MSI — Staging Migration Readiness

**Phase:** 1.0D+  
**Last Updated:** 2026-05-24  
**Branch:** `phase-1-master-data-staging-readiness`  
**Status:** REVIEW DOCUMENT — no migration has been executed

---

## Critical Warning

> **Production execution is NOT permitted at this stage.**
>
> Migrations 001–014 are all marked `DRAFT`. They must pass the full staging
> verification cycle defined in this document before any production execution
> is considered. A separate approval gate exists before production: see
> Section 9 (Go / No-Go Criteria).
>
> Do not run `supabase db push`, `supabase migration up`, or any equivalent
> command against production until that gate is explicitly cleared.

---

## 1. Migration Inventory

All 14 draft migration files are in `supabase/migrations/`. Each is marked
`Status: DRAFT — do NOT execute without explicit approval`.

| # | File | Phase | Purpose | Seed data | Depends on |
|---|------|-------|---------|-----------|-----------|
| 001 | `20260524000001_companies.sql` | 1.0B | `companies` table + uuid-ossp extension | MSI, JCI, SBI (3 rows) | — |
| 002 | `20260524000002_branches_departments.sql` | 1.0B | `branches`, `departments` tables | 1 HO branch × 3 companies; 7 departments × 3 companies | 001 |
| 003 | `20260524000003_status_catalog.sql` | 1.0B | `status_catalog` table (global) | 13 status values | 001 (shared trigger) |
| 004 | `20260524000004_document_types_sequences.sql` | 1.0B | `document_types`, `document_sequences` tables | 15 doc types × 3 companies = 45 rows; no initial sequences | 001, 002 |
| 005 | `20260524000005_roles_permissions.sql` | 1.0B | `roles`, `permissions`, `role_permissions`, `user_roles` tables | 12 roles × 3 companies = 36 rows; ~80 permission codes | 001 |
| 006 | `20260524000006_taxes_payment_terms_currencies.sql` | 1.0B | `currencies`, `exchange_rates`, `taxes`, `payment_terms` tables | 5 currencies; 4 taxes × 3 = 12 rows; 6 payment terms × 3 = 18 rows | 001 |
| 007 | `20260524000007_profiles_extension.sql` | 1.0B | Additive `ALTER TABLE profiles ADD COLUMN` (6 new columns) | None — schema only | 001, 002 |
| 008 | `20260524000008_customers_extension.sql` | 1.0B | Additive `ALTER TABLE customers ADD COLUMN` (~17 new columns) | None — schema only | 001, 006 |
| 009 | `20260524000009_vendors_products_positions.sql` | 1.0B | `vendors`, `products`, `positions` tables + FK to positions from profiles | 5 positions × 3 companies = 15 rows | 001, 002 |
| 010 | `20260524000010_approval_engine.sql` | 1.0B | `approval_rules`, `approval_logs`, `approval_delegations` tables | None — schema only | 001, 002 |
| 011 | `20260524000011_cost_centers_chart_of_accounts.sql` | 1.0B | `cost_centers`, `chart_of_accounts` tables + deferred FK constraints on `products` and `taxes` | None — schema only | 001, 002 |
| 012 | `20260524000012_asset_management.sql` | 1.0B | `asset_categories`, `asset_locations`, `assets` tables | None — schema only | 001, 002 |
| 013 | `20260524000013_role_permissions_seed.sql` | 1.0C | Seeds `role_permissions` junction — full permission matrix for all 12 roles | All role-permission grants (depends on 005) | 005 |
| 014 | `20260524000014_rls_policy_draft.sql` | 1.0D | 5 helper functions + RLS enabled on 20 tables; `profiles` and `customers` blocks commented out (Phase 1.0F) | None — policy only | 001–013 |

**Total active tables created:** 22 new tables  
**Total tables modified (additive):** 2 existing tables (`profiles`, `customers`)  
**Total tables with RLS enabled in migration 014:** 20 (`profiles` and `customers` deferred to Phase 1.0F)

---

## 2. Pre-Execution Checklist

Complete every item on this checklist before applying the first migration to staging. Check off in order — do not skip items.

### 2.1 Environment Verification

```
[ ] Target environment is staging Supabase project (NOT production)
[ ] VITE_SUPABASE_URL in use points to the staging project URL
[ ] VITE_SUPABASE_ANON_KEY in use is the staging anon key
[ ] Verified in Supabase dashboard: project name matches expected staging project
[ ] Supabase service role key is available securely (not in any frontend code)
[ ] Migration runner has postgres-level access (Supabase SQL editor or psql with connection string)
```

### 2.2 Backup and Snapshot

```
[ ] Staging database backup/snapshot taken before first migration
[ ] Backup includes: schema + data (pg_dump or Supabase point-in-time backup)
[ ] Backup location and restore procedure documented and tested
[ ] Existing table list documented (pre-migration):
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
    -- Record the full list for before/after comparison
[ ] Existing profiles row count documented:
    SELECT COUNT(*) FROM profiles;
    -- This is the baseline before migration 007 adds columns
[ ] Existing customers row count documented:
    SELECT COUNT(*) FROM customers;
    -- This is the baseline before migration 008 adds columns
```

### 2.3 Pre-Migration Schema Checks

Run these before applying any migration. They confirm the existing state matches assumptions.

```sql
-- Confirm uuid-ossp extension is available (migration 001 requires it):
SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp';
-- Expected: 1 row

-- Confirm profiles table exists (migrations 007 are additive — table must exist):
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'profiles';
-- Expected: 1

-- Confirm customers table exists (migration 008 is additive):
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'customers';
-- Expected: 1

-- Confirm companies table does NOT yet exist (migration 001 creates it):
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'companies';
-- Expected: 0 (if applying from scratch)
-- If > 0: migration 001 was previously applied — review state before proceeding.

-- Confirm set_updated_at trigger function does NOT yet exist:
SELECT COUNT(*) FROM pg_proc WHERE proname = 'set_updated_at';
-- Expected: 0 (if applying from scratch)
```

### 2.4 Code and Branch Verification

```
[ ] Confirmed working branch is phase-1-master-data-staging-readiness (or staging branch)
[ ] All 14 migration files are present and unmodified from code review:
    ls supabase/migrations/ | wc -l
    -- Expected: 14
[ ] No migration file has been accidentally modified:
    git diff supabase/migrations/
    -- Expected: empty (no uncommitted changes to migration files)
[ ] Lint passes on current codebase:
    npm run lint
    -- Expected: 0 errors
[ ] Build passes on current codebase:
    npm run build
    -- Expected: no errors, no 500kB bundle warnings
```

### 2.5 Second Reviewer Sign-Off

```
[ ] A second developer (not the author) has reviewed migrations 001–014
[ ] Reviewer has checked:
    - Each migration's ROLLBACK block is correct and reversible
    - No migration executes against production credentials
    - Migration 007 and 008 use ADD COLUMN IF NOT EXISTS (additive-only)
    - Migration 014 profiles/customers RLS blocks are fully inside /* */ comments
[ ] This staging-migration-readiness.md has been reviewed and signed off
[ ] PR for the staging branch has been approved
```

---

## 3. Staging Execution Order

Migrations must be applied in strict numerical order. Never skip. Never apply N+1 before N succeeds.

Apply one migration at a time. Verify each group before proceeding to the next.

### Group A — Core Foundation (Migrations 001–002)

```
1. Apply 20260524000001_companies.sql
   → Verify: SELECT COUNT(*) FROM companies;   -- Expected: 3

2. Apply 20260524000002_branches_departments.sql
   → Verify: SELECT COUNT(*) FROM branches;    -- Expected: 3
   → Verify: SELECT COUNT(*) FROM departments; -- Expected: 21
```

### Group B — Reference Data (Migrations 003–006)

```
3. Apply 20260524000003_status_catalog.sql
   → Verify: SELECT COUNT(*) FROM status_catalog;                      -- Expected: 13
   → Verify: SELECT COUNT(*) FROM status_catalog WHERE is_terminal=true; -- Expected: 4

4. Apply 20260524000004_document_types_sequences.sql
   → Verify: SELECT COUNT(*) FROM document_types; -- Expected: 45

5. Apply 20260524000005_roles_permissions.sql
   → Verify: SELECT COUNT(*) FROM roles;       -- Expected: 36
   → Verify: SELECT COUNT(*) FROM permissions; -- Expected: ≥ 80

6. Apply 20260524000006_taxes_payment_terms_currencies.sql
   → Verify: SELECT COUNT(*) FROM currencies;     -- Expected: 5
   → Verify: SELECT COUNT(*) FROM taxes;          -- Expected: 12
   → Verify: SELECT COUNT(*) FROM payment_terms;  -- Expected: 18
```

### Group C — Existing Table Extensions (Migrations 007–008)

**Extra care required.** These modify existing tables. Confirm existing column state first.

```
7. Apply 20260524000007_profiles_extension.sql
   ⚠ BEFORE applying: confirm baseline profiles column list:
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'profiles' ORDER BY ordinal_position;
   → Apply migration
   → Verify new columns exist:
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'profiles'
         AND column_name IN ('company_id','branch_id','department_id',
                             'position_id','last_login_at','mfa_required');
       -- Expected: 6 rows
   → Verify existing columns untouched:
       SELECT id, full_name, role, active FROM profiles LIMIT 5;
       -- All existing rows must return without error

8. Apply 20260524000008_customers_extension.sql
   ⚠ BEFORE applying: confirm baseline customers column list:
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'customers' ORDER BY ordinal_position;
   → Apply migration
   → Verify key new columns exist:
       SELECT column_name FROM information_schema.columns
       WHERE table_name = 'customers'
         AND column_name IN ('company_id','code','credit_limit','payment_terms_id',
                             'currency_code','deleted_at');
       -- Expected: 6 rows
   → Verify existing data intact:
       SELECT COUNT(*) FROM customers; -- Must match pre-migration baseline count
```

### Group D — New Master Data Tables (Migrations 009–012)

```
9. Apply 20260524000009_vendors_products_positions.sql
   → Verify: SELECT COUNT(*) FROM positions; -- Expected: 15
   → Verify FK added to profiles:
       SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'profiles' AND constraint_name = 'fk_profiles_position_id';
       -- Expected: 1 row

10. Apply 20260524000010_approval_engine.sql
    → Verify tables exist:
        SELECT tablename FROM pg_tables
        WHERE tablename IN ('approval_rules','approval_logs','approval_delegations');
        -- Expected: 3 rows

11. Apply 20260524000011_cost_centers_chart_of_accounts.sql
    → Verify tables exist:
        SELECT tablename FROM pg_tables
        WHERE tablename IN ('cost_centers','chart_of_accounts');
        -- Expected: 2 rows
    → Verify deferred FK constraints added to products and taxes:
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name IN ('products','taxes')
          AND constraint_name LIKE 'fk_%';
        -- Expected: ≥ 3 rows

12. Apply 20260524000012_asset_management.sql
    → Verify tables exist:
        SELECT tablename FROM pg_tables
        WHERE tablename IN ('asset_categories','asset_locations','assets');
        -- Expected: 3 rows
```

### Group E — Permission Seed (Migration 013)

```
13. Apply 20260524000013_role_permissions_seed.sql
    → Verify role_permissions total:
        SELECT COUNT(*) FROM role_permissions; -- Expected: ≥ 300
    → Verify super_admin gets all permissions:
        SELECT COUNT(*) FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN companies c ON c.id = r.company_id
        WHERE r.code = 'super_admin' AND c.code = 'MSI';
        -- Expected: matches total permissions count (≥ 80)
    → Verify viewer gets fewer permissions than admin:
        SELECT r.code, COUNT(rp.id) perm_count
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        JOIN companies c ON c.id = r.company_id
        WHERE c.code = 'MSI'
        GROUP BY r.code ORDER BY perm_count DESC;
        -- viewer must have the lowest non-zero count
```

### Group F — RLS Policies (Migration 014)

**This is the highest-risk migration. Apply last. Run the full RLS test matrix (Section 7) after applying.**

```
14. Apply 20260524000014_rls_policy_draft.sql
    → Verify helper functions created:
        SELECT proname, prosecdef FROM pg_proc
        WHERE proname IN ('get_user_company_id','is_super_admin',
                          'is_admin_or_above','has_role','has_permission');
        -- Expected: 5 rows, prosecdef = true for all
    → Verify RLS enabled on 20 active tables:
        SELECT tablename, rowsecurity FROM pg_tables
        WHERE schemaname = 'public' AND rowsecurity = true
        ORDER BY tablename;
        -- Expected: 20 rows
        -- profiles and customers MUST NOT appear in this list yet
    → Confirm profiles and customers do NOT have RLS enabled:
        SELECT tablename, rowsecurity FROM pg_tables
        WHERE tablename IN ('profiles','customers');
        -- Expected: rowsecurity = false for both
```

---

## 4. Required Backups Before Execution

### 4.1 Pre-Migration Backup

Before applying any migration to staging:

```bash
# Option A: Supabase dashboard
# Project → Settings → Database → Backups → Create a manual backup

# Option B: pg_dump (if psql access is available)
pg_dump \
  --schema=public \
  --no-owner \
  --no-acl \
  --file=staging_backup_pre_migrations_$(date +%Y%m%d_%H%M%S).sql \
  "postgresql://postgres:[password]@[host]/postgres"
```

### 4.2 What Must Be in the Backup

The backup must include:

- All current `public` schema table definitions
- All existing data in `profiles` (user accounts — critical)
- All existing data in `customers` (business-critical existing data)
- All existing data in any other existing tables (sp_items, shipments, etc.)

### 4.3 Backup Retention

Keep the pre-migration backup for a minimum of 30 days or until the staging run is confirmed fully successful and approved for production.

### 4.4 After Each Group

After Groups C, E, and F (migrations 007–008, 013, 014), take a checkpoint snapshot before continuing. These are the highest-risk operations.

---

## 5. Known Deferred Risks

These risks are documented, understood, and intentionally deferred. They must be resolved before the corresponding Phase 1.0F step.

### 5.1 profiles RLS Deferred (Phase 1.0F)

**Risk:** `profiles.company_id` is NULL for all existing rows. Enabling company-scoped RLS on `profiles` before Phase 1.0F backfill would lock all users out of the UserManagement page.

**Current state:** The RLS policies for `profiles` are inside `/* */` comment block in migration 014. They will NOT be applied when migration 014 runs.

**Resolution path:**
1. Phase 1.0F migration adds `company_id` to all existing profiles rows (backfill).
2. Verify: `SELECT COUNT(*) FROM profiles WHERE company_id IS NULL` = 0.
3. A Phase 1.0F sub-migration uncomments and applies the `profiles` RLS block.
4. Test UserManagement page still works after enabling.

**Risk if ignored:** Without profiles RLS, any authenticated user can theoretically query the profiles table without company filtering — but only via direct SQL/PostgREST, not via the application (which applies its own filters). The application UI already scopes profile views. This is acceptable for Phase 1.0D staging but NOT acceptable for production Phase 1.0F+.

### 5.2 customers RLS Deferred (Phase 1.0F)

**Risk:** Same as profiles — `customers.company_id` is NULL for all existing rows. Enabling company-scoped RLS before backfill would lock out the Customer page and SP Manifest page.

**Current state:** The RLS policies for `customers` are inside `/* */` comment block in migration 014. They will NOT be applied when migration 014 runs.

**Resolution path:** Same as 5.1 — Phase 1.0F backfill, then verify, then apply.

**Risk if ignored:** Without customers RLS, existing customer data is accessible to any authenticated user (same company isolation not enforced at DB level). Existing application-layer filtering in the Customer page provides partial protection during this transition period only.

### 5.3 company_id Backfill Not Performed

**Risk:** All new ERP tables (branches, vendors, products, etc.) require a `company_id` value. The existing application users (`profiles`) have no `company_id` value yet, which means `get_user_company_id()` returns NULL for all current users.

**Impact:** After applying migration 014 RLS policies:
- Current users cannot read `branches`, `departments`, `vendors`, `products`, `taxes`, etc.
- This is correct and expected — these are new tables with no data yet.
- The existing Customer, SP Manifest, and AR Tracker pages operate on `customers` and `profiles` tables which do NOT have RLS enabled yet (deferred).
- Therefore, **the existing application continues to work normally** after migrations 001–014.

**Resolution:** Phase 1.0F backfill will set `profiles.company_id` for all users, after which `get_user_company_id()` returns a valid value and new tables become accessible.

### 5.4 role_permissions Dependency on roles and permissions

**Risk:** Migration 013 inserts into `role_permissions` by JOINing to `roles` and `permissions`. If migrations 001–005 were not applied first, migration 013 would insert 0 rows silently (ON CONFLICT DO NOTHING and JOINs return empty sets).

**Mitigation:** Always apply migrations in strict numerical order. Run the verification query for migration 013 immediately after applying (see Section 3, Group E) — a count of 0 indicates a dependency failure.

### 5.5 document_sequences Not Yet Initialized from Existing SP Data

**Risk:** Migration 004 seeds `document_sequences` with initial rows (last_sequence = 0). The existing `sp_items` table contains real SP documents with an existing SP number series. When Phase 1.0F document numbering is enabled, starting from sequence 0 would produce duplicate document numbers.

**Resolution (before enabling document numbering in Phase 1.0F):**
```sql
-- Inspect current maximum SP number in existing data:
SELECT MAX(sp_no) FROM sp_items;
-- Then initialize the MSI SP sequence to that maximum value:
UPDATE document_sequences
SET last_sequence = [max_value_from_above]
WHERE document_type = 'SP'
  AND company_id = (SELECT id FROM companies WHERE code = 'MSI');
```

**This step is mandatory before enabling automatic document numbering for SP documents.** Document numbering must NOT be enabled until this is done.

### 5.6 COA (Chart of Accounts) Not Seeded

**Risk:** `chart_of_accounts` is empty after migrations. This means:
- `taxes.gl_account_id` FK references will be NULL (allowed — it is nullable).
- `products.cogs_account_id` and `products.revenue_account_id` FK references will be NULL.
- This is acceptable for Phase 1.0 — COA requires Finance Controller sign-off per company.

**Resolution:** Finance Controller seeds COA for each company in Phase 3 setup, before job costing and invoicing modules are activated.

### 5.7 Exchange Rates Not Seeded

**Risk:** `exchange_rates` table is empty after migrations. Any multi-currency document or report will fail to find conversion rates.

**Resolution:** Finance staff manually enters exchange rates before any multi-currency transactions are created. This is by design — seeding rates would seed a stale value.

---

## 6. Manual Verification Queries Per Migration Group

Run these queries in the Supabase SQL editor (staging) immediately after each group is applied.

### Group A: Core Foundation (after migrations 001–002)

```sql
-- Companies seeded
SELECT code, name, is_active FROM companies ORDER BY code;
-- Expected: JCI, MSI, SBI — all is_active = true

-- Branches seeded (1 HO per company)
SELECT c.code company, b.code branch, b.name FROM branches b
JOIN companies c ON c.id = b.company_id ORDER BY c.code;
-- Expected: 3 rows — JCI/HO, MSI/HO, SBI/HO

-- Departments seeded (7 per company)
SELECT c.code company, d.code dept FROM departments d
JOIN companies c ON c.id = d.company_id ORDER BY c.code, d.code;
-- Expected: 21 rows (SLS, LOG, FIN, PROC, IT, MGMT, HR for each company)

-- Trigger function exists
SELECT proname FROM pg_proc WHERE proname = 'set_updated_at';
-- Expected: 1 row
```

### Group B: Reference Data (after migrations 003–006)

```sql
-- Status catalog complete
SELECT code, label, is_terminal, sort_order FROM status_catalog ORDER BY sort_order;
-- Expected: 13 rows; is_terminal = true for: archived, cancelled, completed, rejected

-- Document types per company
SELECT dt.code, c.code company, dt.is_active FROM document_types dt
JOIN companies c ON c.id = dt.company_id ORDER BY dt.code, c.code;
-- Expected: 45 rows (15 codes × 3 companies), all is_active = true

-- Roles: 12 roles × 3 companies
SELECT r.code, c.code company, r.is_system_role FROM roles r
JOIN companies c ON c.id = r.company_id ORDER BY c.code, r.code;
-- Expected: 36 rows

-- Permission count
SELECT COUNT(*) FROM permissions;
-- Expected: ≥ 80

-- Finance reference data
SELECT code, rate, is_active FROM taxes ORDER BY code;
-- Expected: 12 rows (PPN11, PPH23, PPH21, TAXFREE × 3 companies)

SELECT code, net_days, is_active FROM payment_terms ORDER BY code;
-- Expected: 18 rows (COD, NET15, NET30, NET45, NET60, 50UP × 3 companies)

SELECT code, name FROM currencies ORDER BY code;
-- Expected: 5 rows (EUR, IDR, JPY, SGD, USD)
```

### Group C: Existing Table Extensions (after migrations 007–008)

```sql
-- profiles: all 6 new columns present, no data loss
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('company_id','branch_id','department_id',
                      'position_id','last_login_at','mfa_required')
ORDER BY column_name;
-- Expected: 6 rows

-- profiles: all new columns are NULL for existing rows (expected)
SELECT
  COUNT(*) total_profiles,
  COUNT(company_id) with_company_id
FROM profiles;
-- Expected: with_company_id = 0 (all NULL — backfill is Phase 1.0F)

-- profiles: existing columns and data still intact
SELECT id, full_name, role, active FROM profiles LIMIT 3;
-- Expected: data as before migration

-- customers: key new columns present
SELECT column_name FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN ('company_id','code','credit_limit','payment_terms_id',
                      'currency_code','deleted_at','legal_name')
ORDER BY column_name;
-- Expected: 7 rows

-- customers: no data loss
SELECT COUNT(*) FROM customers;
-- Expected: same count as pre-migration baseline
```

### Group D: New Master Data Tables (after migrations 009–012)

```sql
-- Positions seeded
SELECT code, title, c.code company FROM positions p
JOIN companies c ON c.id = p.company_id ORDER BY c.code, p.level_rank;
-- Expected: 15 rows (STAFF, SPV, MGR, HEAD, DIR × 3 companies)

-- FK from profiles to positions was added
SELECT tc.constraint_name, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'profiles' AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: fk_profiles_position_id appears in results

-- All new tables exist and are empty (expected — no seed in these migrations)
SELECT tablename FROM pg_tables
WHERE tablename IN (
  'vendors','products','positions',
  'approval_rules','approval_logs','approval_delegations',
  'cost_centers','chart_of_accounts',
  'asset_categories','asset_locations','assets'
)
ORDER BY tablename;
-- Expected: 11 rows

-- Deferred FK constraints on products added by migration 011
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'products' AND constraint_type = 'FOREIGN KEY';
-- Expected: fk_products_cogs_account and fk_products_revenue_account
```

### Group E: Permission Seed (after migration 013)

```sql
-- Total role_permissions (all 3 companies × each role's permission set)
SELECT COUNT(*) FROM role_permissions;
-- Expected: high — multiply per-role counts × 3 companies
-- super_admin gets all permissions, so ≥ 80 × 3 = 240 for super_admin alone

-- Per-role permission count for MSI (spot check)
SELECT r.code, COUNT(rp.id) perm_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
JOIN companies c ON c.id = r.company_id
WHERE c.code = 'MSI'
GROUP BY r.code
ORDER BY perm_count DESC;
-- Expected ordering: super_admin > admin > [heads] > [staff] > viewer
-- viewer should have the lowest count
-- No role should have 0 (all roles have at least view permissions)

-- Confirm super_admin can approve quotations (spot-check a critical permission)
SELECT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  JOIN companies c ON c.id = r.company_id
  WHERE r.code = 'super_admin' AND c.code = 'MSI'
    AND p.module = 'quotations' AND p.action = 'approve'
);
-- Expected: true

-- Confirm viewer cannot approve quotations
SELECT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  JOIN companies c ON c.id = r.company_id
  WHERE r.code = 'viewer' AND c.code = 'MSI'
    AND p.module = 'quotations' AND p.action = 'approve'
);
-- Expected: false
```

### Group F: RLS Policies (after migration 014)

```sql
-- Helper functions exist and are SECURITY DEFINER
SELECT proname, prosecdef, provolatile
FROM pg_proc
WHERE proname IN ('get_user_company_id','is_super_admin',
                  'is_admin_or_above','has_role','has_permission');
-- Expected: 5 rows, prosecdef = true (all), provolatile = 's' (STABLE, all)

-- RLS enabled on exactly 20 active tables
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;
-- Expected: 20 rows
-- Must include: approval_delegations, approval_logs, approval_rules,
--              branches, companies, currencies, departments, document_sequences,
--              document_types, exchange_rates, payment_terms, permissions,
--              positions, products, role_permissions, roles, status_catalog,
--              taxes, user_roles, vendors

-- profiles and customers must NOT have RLS enabled yet
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('profiles','customers');
-- Expected: rowsecurity = false for BOTH

-- Policy count per table (spot check)
SELECT tablename, COUNT(*) policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
-- Cross-reference against migration 014 — total should be 59 CREATE POLICY statements
-- (22 in active sections + commented-out profiles/customers blocks not counted)
```

---

## 7. RLS Test Matrix

Execute this test matrix after migration 014 is applied to staging. Requires test user accounts to be set up for each role.

### 7.1 Test User Setup

Before running tests, create the following test users in staging Supabase Auth:

| Test User | Email | role in user_roles | company | Notes |
|-----------|-------|--------------------|---------|-------|
| `test_super_admin` | test-super@staging.local | super_admin | MSI | Cross-company access |
| `test_admin_msi` | test-admin-msi@staging.local | admin | MSI | Company-scoped admin |
| `test_finance_msi` | test-finance@staging.local | finance_staff | MSI | Finance staff |
| `test_ops_msi` | test-ops@staging.local | operations_staff | MSI | Ops staff |
| `test_sales_msi` | test-sales@staging.local | sales_staff | MSI | Sales staff |
| `test_viewer_msi` | test-viewer@staging.local | viewer | MSI | Read-only |
| `test_admin_sbi` | test-admin-sbi@staging.local | admin | SBI | Cross-company isolation |
| `test_procurement` | test-proc@staging.local | procurement_staff | MSI | Vendor write access |
| `test_fin_ctrl` | test-finctrl@staging.local | finance_controller | MSI | Tax/rate write access |

Profiles for each test user must have `company_id` set to the appropriate company. **This requires manual INSERT into profiles after the user is created in Supabase Auth**, since Phase 1.0F backfill is not yet done:

```sql
-- Example: set company_id for test_admin_msi
UPDATE profiles
SET company_id = (SELECT id FROM companies WHERE code = 'MSI')
WHERE id = '[auth_uid_of_test_admin_msi]';
```

### 7.2 SELECT Access Matrix

Test each user can read only their expected rows. Run as the test user via PostgREST / Supabase JS client (not via service role).

| Table | super_admin | admin (MSI) | finance_staff (MSI) | ops_staff (MSI) | viewer (MSI) | admin (SBI) |
|-------|:-----------:|:-----------:|:-------------------:|:---------------:|:------------:|:-----------:|
| `status_catalog` | ✅ all 13 | ✅ all 13 | ✅ all 13 | ✅ all 13 | ✅ all 13 | ✅ all 13 |
| `currencies` | ✅ all 5 | ✅ all 5 | ✅ all 5 | ✅ all 5 | ✅ all 5 | ✅ all 5 |
| `permissions` | ✅ all | ✅ all | ✅ all | ✅ all | ✅ all | ✅ all |
| `companies` | ✅ all 3 | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `branches` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `departments` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `positions` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `roles` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `role_permissions` | ✅ all | ✅ MSI roles | ✅ MSI roles | ✅ MSI roles | ✅ MSI roles | ✅ SBI roles |
| `user_roles` | ✅ all | ✅ MSI all | ✅ own only | ✅ own only | ✅ own only | ✅ SBI only |
| `vendors` | ✅ all | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ SBI only |
| `products` | ✅ all | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ SBI only |
| `taxes` | ✅ all | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ SBI only |
| `payment_terms` | ✅ all | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ MSI active | ✅ SBI only |
| `exchange_rates` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `document_types` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `document_sequences` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `approval_rules` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `approval_logs` | ✅ all | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ MSI only | ✅ SBI only |
| `approval_delegations` | ✅ all | ✅ MSI (admin) | ✅ own only | ✅ own only | ✅ own only | ✅ SBI only |

### 7.3 INSERT Access Matrix

| Table | super_admin | admin (MSI) | finance_staff | fin_controller | procurement_staff | ops_staff | viewer |
|-------|:-----------:|:-----------:|:-------------:|:--------------:|:-----------------:|:---------:|:------:|
| `branches` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `roles` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `user_roles` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `vendors` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `products` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `taxes` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `payment_terms` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `exchange_rates` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `document_types` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `document_sequences` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `approval_rules` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `approval_logs` | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) | ✅ (as self) |
| `approval_delegations` | ✅ | ✅ (admin) | ❌ (not delegator) | ❌ | ❌ | ❌ | ❌ |

### 7.4 UPDATE / DELETE Matrix

| Table | super_admin | admin (MSI) | All staff roles | Notes |
|-------|:-----------:|:-----------:|:---------------:|-------|
| `exchange_rates` UPDATE | ❌ | ❌ | ❌ | No UPDATE policy — immutable |
| `exchange_rates` DELETE | ❌ | ❌ | ❌ | No DELETE policy — immutable |
| `approval_logs` UPDATE | ❌ | ❌ | ❌ | No UPDATE policy — append-only |
| `approval_logs` DELETE | ❌ | ❌ | ❌ | No DELETE policy — append-only |
| `document_sequences` UPDATE | ✅ | ✅ | ✅ | Any company user can increment |
| `approval_delegations` UPDATE | ✅ (admin) | ✅ (admin) | ❌ | Only admin can approve delegation |

### 7.5 Cross-Company Isolation Test (Critical)

This is the most important test. Failure here is a critical security defect — do not proceed to production if this fails.

```
Test: As admin (MSI), attempt to read SBI branches
  1. Log in as test_admin_msi
  2. SELECT * FROM branches;
  3. Expected: only MSI branches returned (0 SBI rows)
  4. SELECT COUNT(*) FROM branches WHERE company_id = '[sbi_company_id]';
  5. Expected: 0

Test: As finance_staff (MSI), attempt to read SBI vendors
  1. Log in as test_finance_msi
  2. SELECT * FROM vendors WHERE company_id = '[sbi_company_id]';
  3. Expected: 0 rows

Test: As admin (SBI), confirm MSI branches are not visible
  1. Log in as test_admin_sbi
  2. SELECT COUNT(*) FROM branches;
  3. Expected: only SBI branch count (not MSI + SBI)

Test: As operations_staff (MSI), attempt to modify SBI document_types
  1. Log in as test_ops_msi
  2. UPDATE document_types SET name = 'hacked' WHERE company_id = '[sbi_company_id]';
  3. Expected: 0 rows updated (policy denies cross-company UPDATE)
```

### 7.6 Security Enforcement Tests

```
Test: approval_logs actor_id enforcement
  1. Log in as test_finance_msi (uid = X)
  2. INSERT INTO approval_logs (..., actor_id = '[uid_of_test_admin_msi]', ...)
  3. Expected: INSERT rejected (actor_id must equal auth.uid())

Test: exchange_rates immutability
  1. Log in as test_admin_msi
  2. UPDATE exchange_rates SET rate = 999 WHERE company_id = '[msi_company_id]';
  3. Expected: 0 rows updated (no UPDATE policy)

Test: approval_logs tamper-proof
  1. Log in as test_admin_msi
  2. DELETE FROM approval_logs WHERE company_id = '[msi_company_id]';
  3. Expected: 0 rows deleted (no DELETE policy)

Test: viewer cannot write vendors
  1. Log in as test_viewer_msi
  2. INSERT INTO vendors (company_id, name, ...) VALUES ('[msi_id]', 'Test', ...);
  3. Expected: INSERT rejected

Test: cross-company write rejection
  1. Log in as test_admin_msi
  2. INSERT INTO branches (company_id, code, name) VALUES ('[sbi_company_id]', 'HACK', 'Test');
  3. Expected: INSERT rejected (company_id must = get_user_company_id())
```

---

## 8. Rollback Strategy

### 8.1 Rollback Decision Criteria

Initiate rollback if any of the following occur during staging execution:

- A migration fails with an SQL error
- A verification query returns unexpected results
- Cross-company isolation test fails (any row from wrong company returned)
- Existing application pages (Customer, SP Manifest, AR Tracker) stop working after migrations 007 or 008
- profiles or customers row count changes unexpectedly (data loss)

### 8.2 Rollback Order

Always roll back in reverse migration order (014 → 013 → ... → 001). Never skip.

| Migration | Rollback SQL Reference | Risk Level |
|-----------|----------------------|-----------|
| 014 (RLS) | DROP POLICY IF EXISTS per table + ALTER TABLE DISABLE ROW LEVEL SECURITY + DROP FUNCTION × 5 | Low (no data) |
| 013 (seed) | DELETE FROM role_permissions USING roles WHERE role code IN (...) | Low (seed only) |
| 012 (assets) | DROP TABLE IF EXISTS assets, asset_locations, asset_categories | Low (new tables, no data) |
| 011 (COA) | DROP TABLE IF EXISTS chart_of_accounts, cost_centers + DROP CONSTRAINT on products/taxes | Low (new tables, no data) |
| 010 (approval) | DROP TABLE IF EXISTS approval_delegations, approval_logs, approval_rules | Low (new tables, no data) |
| 009 (vendors) | DROP TABLE IF EXISTS positions, products, vendors + DROP CONSTRAINT fk_profiles_position_id | Low (new tables, no data) |
| 008 (customers ext) | ALTER TABLE customers DROP COLUMN IF EXISTS [each new column] — MANUAL REVIEW FIRST | **High — existing table — verify column pre-existence before dropping** |
| 007 (profiles ext) | ALTER TABLE profiles DROP COLUMN IF EXISTS [each new column] — MANUAL REVIEW FIRST | **High — existing table — verify column pre-existence before dropping** |
| 006 (finance) | DELETE seeds + DROP TABLE currencies, exchange_rates, taxes, payment_terms | Low (new tables) |
| 005 (roles) | DELETE seeds + DROP TABLE user_roles, role_permissions, roles, permissions | Low (new tables) |
| 004 (doc types) | DELETE seeds + DROP TABLE document_sequences, document_types | Low (new tables) |
| 003 (status) | DELETE seeds + DROP TABLE status_catalog | Low (new tables) |
| 002 (branches) | DELETE seeds + DROP TABLE departments, branches | Low (new tables) |
| 001 (companies) | DELETE seeds + DROP TABLE companies | Low (new tables) |

### 8.3 Migration 007 and 008 Rollback Warning

**These are the only migrations that modify existing tables.** Before rolling back columns from `profiles` or `customers`:

1. Confirm the column was actually added by this migration (not pre-existing).
2. Check `information_schema.columns` timestamp if available.
3. Restore from pre-migration backup if there is any doubt.
4. Never drop a column from `profiles` or `customers` in production without explicit approval.

### 8.4 After Rollback

After any rollback:

1. Document what failed and why.
2. Fix the underlying issue in the migration SQL.
3. Restore from pre-migration backup (do not attempt to re-run on partially migrated state).
4. Start the staging execution from scratch on a fresh restore.

---

## 9. Go / No-Go Criteria

### 9.1 Go Criteria for Staging Completion

All of the following must be true before staging is considered complete:

```
[ ] All 14 migrations applied without SQL errors
[ ] All verification queries in Section 6 return expected row counts
[ ] All SELECT access tests in Section 7.2 pass
[ ] All INSERT access tests in Section 7.3 pass
[ ] All UPDATE/DELETE tests in Section 7.4 pass (especially immutability tests)
[ ] Cross-company isolation test (Section 7.5) passes for all test cases
[ ] Security enforcement tests (Section 7.6) all pass
[ ] Existing application pages still work after migration:
    - Customer page: loads, data visible, search works
    - SP Manifest page: loads, data visible
    - AR Tracker page: loads, data visible
    - UserManagement page: loads, user list visible
[ ] Second reviewer has verified the staging test results
[ ] All test results documented with screenshots or SQL output
```

### 9.2 No-Go Conditions

Do NOT proceed to production if any of the following:

```
[ ] Any migration failed during staging execution
[ ] Any cross-company isolation test returned rows from the wrong company
[ ] Any existing application page is broken after migration
[ ] profiles or customers data is missing or corrupted
[ ] approval_logs accepted an INSERT with actor_id ≠ auth.uid()
[ ] exchange_rates accepted an UPDATE or DELETE
[ ] Any helper function is missing or has prosecdef = false
[ ] Second reviewer sign-off is missing
```

### 9.3 Production Execution Gate

**Production execution requires:**

1. Staging Go criteria (Section 9.1) fully met and documented
2. Explicit sign-off from: Technical Lead + Product Owner
3. Scheduled maintenance window communicated to users (even if brief — additive migrations should be non-disruptive)
4. Production database backup taken in the 1 hour before execution
5. On-call person available for 2 hours after production execution
6. Post-execution verification run within 30 minutes of completion

**Production execution is NOT allowed until all Phase 1.0E (Admin UI Screens) prerequisites are also confirmed ready.** Running migrations 001–014 in production before the Admin UI is ready would leave the database in a state with no way to manage the new data through the application.

---

## 10. Post-Staging Next Steps

After staging migration is successfully completed and verified:

1. **Phase 1.0E — First Admin UI Screens**
   - Build Admin screens for: Company, Branch, Department, Role, Document Type, Status, Tax, Payment Terms
   - All screens must use server-side pagination, debounced search, lazy loading, ErrorBoundary wrapping
   - Phase 1.0E depends on migrations being applied and tested in staging

2. **Phase 1.0F — Integration with Existing Manifest Data**
   - Backfill `profiles.company_id` for all existing users
   - Backfill `customers.company_id` for all existing customers
   - Enable `profiles` and `customers` RLS blocks (from commented sections in migration 014)
   - Initialize `document_sequences` from existing SP data (see Section 5.5)
   - Verify Customer page, SP Manifest, AR Tracker all still work

3. **Production Execution**
   - Only after Phase 1.0E screens are functional in staging
   - Only after Phase 1.0F backfill strategy is tested and verified
   - Follow production execution gate in Section 9.3

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-24 | Phase 1.0D+ | Initial document created for staging readiness review |
