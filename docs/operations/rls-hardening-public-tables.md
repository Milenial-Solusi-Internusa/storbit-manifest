# RLS Hardening — Remaining Public Tables
**Phase:** 1.0H
**Migration:** `supabase/migrations/20260524000017_rls_hardening_public_tables.sql`
**Status:** Implemented — pending DBA apply to staging and production

---

## Overview

This document records the analysis, decisions, and policy strategy for enabling
Row Level Security on 8 public-schema tables that were flagged by the Supabase
Security Advisor as `rls_disabled_in_public` (critical severity).

All 8 tables previously had no RLS — any request using the `anon` or
`authenticated` PostgREST key could read or write them without restriction.
Migration 017 enables RLS on all 8 tables and adds the minimum required policies
to unblock the Security Advisor warning while preserving all existing app behaviour.

---

## Tables Covered

| # | Table | Group | company_id | deleted_at | Current UI Usage |
|---|-------|-------|-----------|-----------|-----------------|
| 1 | `sp_items` | A — Legacy | None | None | Active (SP Manifest) |
| 2 | `ar_ttfs` | A — Legacy | None | None | Active (AR Tracker) |
| 3 | `ar_btbs` | A — Legacy | None | None | Active (via ar_ttfs joins) |
| 4 | `cost_centers` | B — Finance | NOT NULL | Yes | None yet (Phase 2+) |
| 5 | `chart_of_accounts` | B — Finance | NOT NULL | Yes | None yet (Phase 2+) |
| 6 | `asset_categories` | C — Assets | NOT NULL | Yes | None yet (Phase 4.2) |
| 7 | `asset_locations` | C — Assets | NOT NULL | Yes | None yet (Phase 4.2) |
| 8 | `assets` | C — Assets | NOT NULL | Yes | None yet (Phase 4.2) |

---

## Helper Functions Used

All helper functions were defined in `20260524000014_rls_policy_draft.sql`:

| Function | Returns | Description |
|----------|---------|-------------|
| `get_user_company_id()` | `uuid` | company_id of the current session user (from profiles) |
| `is_super_admin()` | `bool` | true when `profiles.role = 'super_admin'` |
| `is_admin_or_above()` | `bool` | true when `profiles.role IN ('admin', 'super_admin')` |
| `has_role(text)` | `bool` | true when the user has an active `user_roles` entry with the named role |

---

## Group A — Legacy Tables (Authenticated-Only, Transitional)

### Problem

`sp_items`, `ar_ttfs`, and `ar_btbs` were created as part of the original Storbit
Manifest application before the Nexus multi-company schema was introduced.
They have **no `company_id` column**, so it is impossible to apply company-scoped
RLS without first migrating the data.

### Decision

Apply **authenticated-only** policies: `TO authenticated USING (true)`.

This achieves the security goal of the current phase — blocking unauthenticated
(anonymous key) access — without changing any existing application behaviour.
All existing SELECT/INSERT/UPDATE/DELETE operations performed by authenticated
users continue to work unchanged.

### Risk

**Low.** No query is rejected; only truly anonymous requests are now blocked.
The implicit behaviour before enabling RLS was identical (Supabase allows all
authenticated requests by default).

### Limitation

These policies do NOT provide user or company isolation. Any authenticated user
can read and write any row. This is a known and accepted limitation until Phase 2
adds `company_id` to these tables.

### Transitional Note

When Phase 2 adds `company_id` to `sp_items`, `ar_ttfs`, and `ar_btbs` and
backfills existing rows, these policies must be replaced with company-scoped
variants equivalent to the Group B/C pattern. A new migration (020 or later)
will handle that replacement.

### Policies Created

#### sp_items
```sql
CREATE POLICY "sp_items_read"   ON sp_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_items_insert" ON sp_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_items_update" ON sp_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sp_items_delete" ON sp_items FOR DELETE TO authenticated USING (true);
```
Source confirmed in `src/hooks/useSpItems.js`: SELECT, INSERT, UPDATE, DELETE (hard delete by id).

#### ar_ttfs
```sql
CREATE POLICY "ar_ttfs_read"   ON ar_ttfs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ar_ttfs_insert" ON ar_ttfs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ar_ttfs_update" ON ar_ttfs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ar_ttfs_delete" ON ar_ttfs FOR DELETE TO authenticated USING (true);
```
Source confirmed in `src/hooks/useTtfs.js` and `src/lib/db.js`: all 4 operations.
`ar_btbs` rows cascade-delete via FK when an `ar_ttfs` row is deleted.

#### ar_btbs
```sql
CREATE POLICY "ar_btbs_read"   ON ar_btbs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ar_btbs_insert" ON ar_btbs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ar_btbs_delete" ON ar_btbs FOR DELETE TO authenticated USING (true);
```
Source confirmed in `src/lib/db.js` (`updateTtf`): explicit `DELETE ... WHERE ttf_id = id`
is called before re-inserting, so a DELETE policy is mandatory. No UPDATE policy is
created — `ar_btbs` uses delete-then-insert (replace strategy), never UPDATE.

---

## Group B — Company-Scoped Finance Tables (Phase 2+)

### Policy Strategy

Both `cost_centers` and `chart_of_accounts` have `company_id NOT NULL`, enabling
full company-scoped isolation from day one:

- **Reads:** `company_id = get_user_company_id() OR is_super_admin()`
- **Writes:** `company_id = get_user_company_id() AND <role check>`
- **No DELETE policy:** hard deletes prohibited; use `deleted_at` soft-delete.

### cost_centers

Write access restricted to `is_admin_or_above()`. Cost center maintenance is an
administrative operation (org chart configuration), not day-to-day finance work.

### chart_of_accounts

Write access further restricted to `has_role('finance_controller') OR is_super_admin()`.
The chart of accounts structure is a critical finance asset; incorrect modifications
can silently corrupt ledger entries. Only the Finance Controller and super_admin
may create or modify COA records.

---

## Group C — Company-Scoped Asset Tables (Phase 4.2)

### Policy Strategy

`asset_categories`, `asset_locations`, and `assets` follow the same pattern as
Group B:

- **Reads:** `company_id = get_user_company_id() OR is_super_admin()`
- **Writes:** `company_id = get_user_company_id() AND is_admin_or_above()`
- **No DELETE policy:** assets are never hard-deleted. Use `status` transitions
  (e.g., `status = 'disposed'`) and `deleted_at` for soft-delete.

---

## What Was NOT Changed

- No existing RLS policies from migrations 014 or 015 were modified.
- No `.env` files were touched.
- No application source files were modified.
- No UI components were changed.
- RLS on `profiles` and `customers` remains unchanged (Phase 1.0F scope).
- No new npm dependencies were added.

---

## Verification Checklist (DBA)

Before applying to staging, verify:

- [ ] Helper functions `get_user_company_id()`, `is_super_admin()`, `is_admin_or_above()`, `has_role(text)` exist and are callable (migration 014 applied).
- [ ] Run migration on development Supabase first.
- [ ] Test SP Manifest (sp_items): list, create, update, delete — all succeed for authenticated user.
- [ ] Test AR Tracker (ar_ttfs / ar_btbs): list TTFs, create TTF with BTBs, update TTF (replace BTBs), delete TTF — all succeed.
- [ ] Verify anonymous key cannot read `sp_items` after migration.
- [ ] Verify `cost_centers` select works for admin user scoped to their company.
- [ ] Verify `cost_centers` select returns no rows for a different company's admin user.
- [ ] Verify `chart_of_accounts` insert rejected for non-finance_controller role.
- [ ] Verify `assets` insert rejected for user without `is_admin_or_above()`.
- [ ] Confirm Security Advisor no longer shows `rls_disabled_in_public` for these 8 tables.

---

## Related Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260524000017_rls_hardening_public_tables.sql` | Migration — RLS policies |
| `supabase/migrations/20260524000000_legacy_app_baseline.sql` | Source of sp_items, ar_ttfs, ar_btbs schema |
| `supabase/migrations/20260524000011_cost_centers_chart_of_accounts.sql` | Source of cost_centers, chart_of_accounts schema |
| `supabase/migrations/20260524000012_asset_management.sql` | Source of asset_categories, asset_locations, assets schema |
| `supabase/migrations/20260524000014_rls_policy_draft.sql` | Helper functions used by these policies |
| `src/hooks/useSpItems.js` | Confirms sp_items operations (SELECT/INSERT/UPDATE/DELETE) |
| `src/hooks/useTtfs.js` | Confirms ar_ttfs/ar_btbs operations |
| `src/lib/db.js` | Confirms explicit ar_btbs DELETE in updateTtf() |
| `docs/architecture/implementation-roadmap.md` | Phase 1.0H roadmap entry |
