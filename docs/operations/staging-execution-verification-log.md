# Nexus by MSI — Staging Execution Verification Log

**Date:** 2026-05-24
**Phase:** 1.0D+++ — Staging Execution Verification
**Environment:** Supabase Staging
**Project ref:** untmpqceexwxzuhlmyrg
**Project URL:** https://untmpqceexwxzuhlmyrg.supabase.co
**Branch / source baseline:** `phase-5-supabase`
**Latest known merged commit:** `b3dca79`
**Migration scope:** 000–014 (15 migration files)
**Execution result:** SUCCESS
**App smoke test result:** SUCCESS — local login and dashboard load confirmed

---

## Critical Scope Notice

This is a **staging-only** execution log. No production changes have been made.

Production execution remains blocked. See Section 8 (Go/No-Go) for the production gate.

---

## 1. Environment Summary

| Item | Value |
|------|-------|
| Environment | Supabase Staging (fresh project) |
| Project ref | untmpqceexwxzuhlmyrg |
| Local app URL | http://localhost:5173 |
| Env file used | `.env.local` / `.env.staging` |
| Source branch | `phase-5-supabase` |
| Commit at execution | `b3dca79` (latest merged) |
| Execution date | 2026-05-24 |
| Executed by | Den Bagus M Jaelani |

---

## 2. Migration Execution Results

All 15 migrations applied in order on the fresh Supabase staging project. The project had no public schema tables prior to execution.

| # | File | Status | Notes |
|---|------|--------|-------|
| 000 | `20260524000000_legacy_app_baseline.sql` | ✅ Applied | Legacy tables + auth trigger |
| 001 | `20260524000001_companies.sql` | ✅ Applied | Companies + uuid-ossp extension |
| 002 | `20260524000002_branches_departments.sql` | ✅ Applied | Branches + departments |
| 003 | `20260524000003_status_catalog.sql` | ✅ Applied | Status catalog |
| 004 | `20260524000004_document_types_sequences.sql` | ✅ Applied | Document types + sequences |
| 005 | `20260524000005_roles_permissions.sql` | ✅ Applied | Roles, permissions, user_roles |
| 006 | `20260524000006_taxes_payment_terms_currencies.sql` | ✅ Applied | Currencies, taxes, payment terms |
| 007 | `20260524000007_profiles_extension.sql` | ✅ Applied | Additive ALTER on profiles |
| 008 | `20260524000008_customers_extension.sql` | ✅ Applied | Additive ALTER on customers |
| 009 | `20260524000009_vendors_products_positions.sql` | ✅ Applied | Vendors, products, positions |
| 010 | `20260524000010_approval_engine.sql` | ✅ Applied | Approval rules, logs, delegations |
| 011 | `20260524000011_cost_centers_chart_of_accounts.sql` | ✅ Applied | Cost centers, chart of accounts |
| 012 | `20260524000012_asset_management.sql` | ✅ Applied | Asset categories, locations, assets |
| 013 | `20260524000013_role_permissions_seed.sql` | ✅ Applied | Full role-permissions matrix seeded |
| 014 | `20260524000014_rls_policy_draft.sql` | ✅ Applied | 5 helper functions + RLS on 20 tables |

**Constraint fix note:** Migrations 009 and 011 had an `ADD CONSTRAINT IF NOT EXISTS` syntax issue that is not supported by PostgreSQL. This was resolved in a separate fix branch (`fix/migration-constraint-syntax`) and merged into `phase-5-supabase` via PR #9. The fix replaced the unsupported syntax with `DO $$ ... IF NOT EXISTS pg_constraint ...` blocks. The corrected files were applied successfully.

---

## 3. Tables Created

### Legacy App Tables (migration 000)

| Table | RLS Enabled | Notes |
|-------|-------------|-------|
| `profiles` | No — deferred | company_id NULL until Phase 1.0F backfill |
| `customers` | No — deferred | company_id NULL until Phase 1.0F backfill |
| `sp_items` | No — deferred | Phase 2+ transaction module scope |
| `ar_ttfs` | No — deferred | Phase 2+ transaction module scope |
| `ar_btbs` | No — deferred | Phase 2+ transaction module scope |

### ERP Tables (migrations 001–014)

| Table | RLS Enabled | Notes |
|-------|-------------|-------|
| `companies` | Yes | company-scoped |
| `branches` | Yes | company-scoped |
| `departments` | Yes | company-scoped |
| `status_catalog` | Yes | global; SELECT-only for all authenticated users |
| `document_types` | Yes | company-scoped |
| `document_sequences` | Yes | company-scoped; UPDATE allowed for all company users |
| `roles` | Yes | company-scoped |
| `permissions` | Yes | SELECT-only for authenticated users |
| `role_permissions` | Yes | SELECT-only for authenticated users |
| `user_roles` | Yes | company-scoped; user visible to self |
| `currencies` | Yes | global; SELECT-only for all authenticated users |
| `exchange_rates` | Yes | INSERT-only; no UPDATE or DELETE (immutable history) |
| `taxes` | Yes | company-scoped |
| `payment_terms` | Yes | company-scoped |
| `vendors` | Yes | company-scoped |
| `products` | Yes | company-scoped |
| `positions` | Yes | company-scoped |
| `approval_rules` | Yes | company-scoped |
| `approval_logs` | Yes | INSERT-only; no UPDATE or DELETE (tamper-proof audit) |
| `approval_delegations` | Yes | company-scoped |
| `cost_centers` | Yes | company-scoped |
| `chart_of_accounts` | Yes | company-scoped |
| `asset_categories` | Yes | company-scoped |
| `asset_locations` | Yes | company-scoped |
| `assets` | Yes | company-scoped |

**RLS active on 20 ERP tables.** `profiles` and `customers` RLS intentionally deferred.

### RLS Helper Functions Installed (migration 014)

| Function | Type | Purpose |
|----------|------|---------|
| `get_user_company_id()` | STABLE, SECURITY DEFINER | Returns calling user's company_id |
| `is_super_admin()` | STABLE, SECURITY DEFINER | True if user_roles super_admin OR profiles.role = 'super' (legacy fallback) |
| `is_admin_or_above()` | STABLE, SECURITY DEFINER | True if admin/super_admin OR profiles.role IN ('super', 'management') |
| `has_role(text)` | STABLE, SECURITY DEFINER | True if user has the named role_code in user_roles |
| `has_permission(text)` | STABLE, SECURITY DEFINER | True if user's roles include the named permission_code |

All functions use `SECURITY DEFINER SET search_path = public` to prevent circular RLS dependency and search_path hijacking.

---

## 4. Seed Data Verification

| Domain | Expected | Result |
|--------|----------|--------|
| Companies | 3 (MSI, JCI, SBI) | ✅ Confirmed |
| Branches | 3 (1 HO per company) | ✅ Confirmed |
| Departments | 21 (7 per company) | ✅ Confirmed |
| Status catalog | 13 global values | ✅ Confirmed |
| Document types | 15 per company (45 total) | ✅ Confirmed |
| Roles | 12 per company (36 total) | ✅ Confirmed |
| Permissions | 92 global codes | ✅ Confirmed |
| Role-permissions | Seeded for all 12 roles × 3 companies | ✅ Confirmed |
| Currencies | 5 global | ✅ Confirmed |
| Taxes | 4 per company (12 total) | ✅ Confirmed |
| Payment terms | 6 per company (18 total) | ✅ Confirmed |
| Exchange rates | 0 expected (no historical rates at staging) | ✅ Confirmed |
| Approval rules | 0 expected (configured post Phase 1.0E) | ✅ Confirmed |
| Approval logs | 0 expected | ✅ Confirmed |
| Cost centers | 0 expected (defined post Phase 1.0E) | ✅ Confirmed |
| Chart of accounts | 0 expected (defined post Phase 1.0E) | ✅ Confirmed |
| Vendors | 0 expected | ✅ Confirmed |
| Products | 0 expected | ✅ Confirmed |
| Assets | 0 expected | ✅ Confirmed |

---

## 5. Structural Verification

| Check | Result |
|-------|--------|
| Legacy tables exist (`profiles`, `customers`, `sp_items`, `ar_ttfs`, `ar_btbs`) | ✅ Confirmed |
| `user_role_legacy` ENUM created | ✅ Confirmed |
| `on_auth_user_created` auth trigger active | ✅ Confirmed |
| `set_updated_at()` trigger function installed | ✅ Confirmed |
| `handle_new_user()` function installed (SECURITY DEFINER) | ✅ Confirmed |
| FK: `profiles.company_id → companies.id` | ✅ Confirmed |
| FK: `profiles.branch_id → branches.id` | ✅ Confirmed |
| FK: `profiles.department_id → departments.id` | ✅ Confirmed |
| FK: `profiles.position_id → positions.id` | ✅ Confirmed |
| FK: `customers.company_id → companies.id` | ✅ Confirmed |
| FK: `sp_items.customer_id → customers.id ON DELETE SET NULL` | ✅ Confirmed |
| FK: `ar_ttfs.customer_id → customers.id ON DELETE SET NULL` | ✅ Confirmed |
| FK: `ar_btbs.ttf_id → ar_ttfs.id ON DELETE CASCADE` | ✅ Confirmed |
| FK: `products.coa_id → chart_of_accounts.id` (deferred via DO block) | ✅ Confirmed |
| FK: `taxes.coa_id → chart_of_accounts.id` (deferred via DO block) | ✅ Confirmed |
| RLS enabled on exactly 20 ERP tables | ✅ Confirmed |
| `profiles` RLS disabled (intentional — Phase 1.0F deferred) | ✅ Confirmed |
| `customers` RLS disabled (intentional — Phase 1.0F deferred) | ✅ Confirmed |

---

## 6. First Admin Provisioning

The first MSI super admin was provisioned manually after migrations completed.

| Field | Value |
|-------|-------|
| Email | den.itnetwork@exportimportdept.com |
| Full name | Den Bagus M Jaelani |
| Legacy profiles.role | `super` |
| Company | MSI |
| Branch | HO |
| Department | IT |
| user_roles role_code | `super_admin` |
| mfa_required | true |
| profiles.active | true |

**Verification queries confirmed:**
- `profiles` row exists with `role = 'super'` and `active = true`
- `user_roles` row exists with `role_code = 'super_admin'` and correct `company_id`
- `is_super_admin()` helper function returns `true` for this user
- `get_user_company_id()` returns MSI company UUID for this user

---

## 7. App Smoke Test

| Test | Result |
|------|--------|
| Local app starts at `localhost:5173` | ✅ Pass |
| Login with admin credentials | ✅ Pass |
| AuthContext reads `profiles` row correctly | ✅ Pass |
| `isAuthenticated` flag is `true` (`profile.active = true`) | ✅ Pass |
| Dashboard page loads without errors | ✅ Pass |
| No React ErrorBoundary triggered | ✅ Pass |
| No console errors on page load | ✅ Pass |
| Legacy app features (Customer page, SP Manifest, AR Tracker) | Not re-tested at this phase — deferred to Phase 1.0F |

---

## 8. Known Intentional Gaps

These are not defects. They are deferred by design with documented rationale.

| Gap | Reason | Resolution Phase |
|-----|--------|-----------------|
| `profiles` RLS not enabled | `company_id` is NULL for existing rows; enabling RLS now would lock out all users | Phase 1.0F — after company_id backfill |
| `customers` RLS not enabled | Same reason as profiles | Phase 1.0F — after company_id backfill |
| `sp_items` RLS not enabled | Transaction table scope belongs to Phase 2+ | Phase 2+ |
| `ar_ttfs` RLS not enabled | Transaction table scope belongs to Phase 2+ | Phase 2+ |
| `ar_btbs` RLS not enabled | Transaction table scope belongs to Phase 2+ | Phase 2+ |
| No production execution | Staging-only; production requires separate approval gate | After Phase 1.0F verified |
| No real operational data migrated | Existing Storbit Manifest data not migrated yet | Phase 1.0F |
| Full RLS test matrix not run | Test matrix in staging-migration-readiness.md requires test users that have not been created | Phase 1.0F — after multi-user test environment is set up |
| MFA not enforced in staging | MFA enforcement is a production-readiness concern; staging uses relaxed settings | Production only |
| exchange_rates has 0 rows | No historical rates — expected for fresh staging | On demand as needed |
| chart_of_accounts has 0 rows | CoA configuration is company-specific; to be configured in Phase 1.0E Admin UI | Phase 1.0E |
| cost_centers has 0 rows | Same as chart_of_accounts | Phase 1.0E |

---

## 9. Go/No-Go Assessment

### Staging

| Criterion | Status |
|-----------|--------|
| All 15 migrations applied without error | ✅ Pass |
| Seed data verified against expected counts | ✅ Pass |
| Legacy app tables exist and accessible | ✅ Pass |
| RLS active on 20 ERP tables | ✅ Pass |
| First admin provisioned and verified | ✅ Pass |
| Local login succeeds | ✅ Pass |
| Dashboard loads | ✅ Pass |
| No blocking errors observed | ✅ Pass |

**Staging verdict: GO — Phase 1.0E may begin on staging.**

### Production

| Criterion | Status |
|-----------|--------|
| Phase 1.0E Admin UI screens built and verified | ❌ Not started |
| Phase 1.0F backfill complete (profiles + customers company_id) | ❌ Not started |
| profiles RLS enabled post-backfill | ❌ Not started |
| customers RLS enabled post-backfill | ❌ Not started |
| Full RLS test matrix run (9 test roles × 20 tables) | ❌ Not run |
| Cross-company isolation verified | ❌ Not run |
| Technical lead sign-off | ❌ Pending |
| Product owner sign-off | ❌ Pending |

**Production verdict: NO-GO — production execution remains blocked.**

---

## 10. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| Legacy operational tables have no RLS | Medium | Acceptable for now — Supabase anon key not exposed to public; all users are internal authenticated staff |
| profiles and customers have no RLS | Medium | Same mitigation — no public access; Phase 1.0F will resolve |
| No cross-company isolation test run | Medium | Deferred to full RLS test matrix before production |
| No rollback has been tested | Low | Rollback SQL exists in every migration file; staging is safe to drop/recreate if needed |
| Staging data is not production-representative | Low | Expected — staging is for development and schema verification only |

**Overall staging risk:** Low — staging is safe for next development phase. No production risk introduced.

---

## 11. Next Phase

**Phase 1.0E — First Admin UI Screens**

Staging is cleared for Phase 1.0E development to begin.

**Scope of Phase 1.0E:**
- Build admin screens for:
  - Company
  - Branch
  - Department
  - Role
  - Document Type
  - Status Catalog
  - Tax
  - Payment Terms
- All screens must implement:
  - Server-side pagination
  - Debounced search (min 300ms)
  - Lazy loading via `React.lazy()`
  - `ErrorBoundary` wrapping
- Admin screens connect to the 20 ERP tables now present in staging
- Do not redesign the full legacy UI — keep within the ERP admin shell scope
- Do not enable RLS on `profiles` or `customers` during Phase 1.0E
- Do not perform Phase 1.0F backfill during Phase 1.0E

**After Phase 1.0E:**
- Phase 1.0F — Integration with Existing Manifest Data
  - Backfill `profiles.company_id` and `customers.company_id`
  - Enable RLS on `profiles` and `customers`
  - Verify Customer page, SP Manifest, AR Tracker remain functional
  - Initialize `document_sequences` from existing `sp_items` SP number data

---

*Document prepared by: Claude (Nexus by MSI development assistant)*
*Reviewed by: Den Bagus M Jaelani*
*Status: FINAL — staging execution confirmed*
