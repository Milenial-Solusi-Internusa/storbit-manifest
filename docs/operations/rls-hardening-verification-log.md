# RLS Hardening Verification Log — Phase 1.0H

**Phase:** 1.0H — RLS Hardening for Remaining Public Tables
**Migration:** `supabase/migrations/20260524000017_rls_hardening_public_tables.sql`
**Verified by:** Technical lead (manual staging query)
**Verification date:** 2026-05-28
**Staging project:** `untmpqceexwxzuhlmyrg`
**Overall result:** ✅ PASS — staging verified

---

## Purpose

This log records the manual staging verification of Migration 017, confirming that:

- RLS is enabled on all 8 target tables
- All expected policies are present
- No existing app behaviour was broken

The companion decision log and policy rationale are in
`docs/operations/rls-hardening-public-tables.md`.

---

## Tables Verified

### Group A — Legacy Operational Tables (authenticated-only, transitional)

These tables have no `company_id` column. Policies grant full read/write access to
any authenticated session. Anonymous (`anon` key) access is blocked.

| Table | RLS enabled | Policies present |
|---|---|---|
| `sp_items` | ✅ `rowsecurity = true` | `sp_items_read`, `sp_items_insert`, `sp_items_update`, `sp_items_delete` |
| `ar_ttfs` | ✅ `rowsecurity = true` | `ar_ttfs_read`, `ar_ttfs_insert`, `ar_ttfs_update`, `ar_ttfs_delete` |
| `ar_btbs` | ✅ `rowsecurity = true` | `ar_btbs_read`, `ar_btbs_insert`, `ar_btbs_delete` |

**Note — `ar_btbs` has no UPDATE policy.** This is intentional. `updateTtf()` in
`db.js` always deletes all `ar_btbs` rows for a given `ttf_id` then re-inserts
(replace strategy). No individual row update ever occurs. An UPDATE policy is not
needed and was deliberately omitted.

**Transitional notice.** Group A policies use `USING (true)` — they do not scope by
company because `sp_items`, `ar_ttfs`, and `ar_btbs` have no `company_id` column.
These policies must be replaced with company-scoped variants in Phase 2 when
`company_id` is added and existing rows are backfilled.

---

### Group B — Company-Scoped Finance Tables (Phase 2+)

| Table | RLS enabled | Policies present |
|---|---|---|
| `cost_centers` | ✅ `rowsecurity = true` | `cost_centers_read`, `cost_centers_insert`, `cost_centers_update` |
| `chart_of_accounts` | ✅ `rowsecurity = true` | `chart_of_accounts_read`, `chart_of_accounts_insert`, `chart_of_accounts_update` |

No DELETE policies — intentional. Hard deletes are prohibited on Phase 2+ finance
tables. Application enforces soft-delete (`deleted_at`).

`chart_of_accounts` write access is restricted to `finance_controller` or
`super_admin`. Operational admins cannot restructure the chart of accounts.

---

### Group C — Company-Scoped Asset Tables (Phase 4.2)

| Table | RLS enabled | Policies present |
|---|---|---|
| `asset_categories` | ✅ `rowsecurity = true` | `asset_categories_read`, `asset_categories_insert`, `asset_categories_update` |
| `asset_locations` | ✅ `rowsecurity = true` | `asset_locations_read`, `asset_locations_insert`, `asset_locations_update` |
| `assets` | ✅ `rowsecurity = true` | `assets_read`, `assets_insert`, `assets_update` |

No DELETE policies — intentional. Assets are never hard-deleted. Use status
transitions (`active → disposed/retired`) and `deleted_at` for soft-delete.

---

## App Smoke Tests (Post-Apply)

| Screen | Test | Result |
|---|---|---|
| SP Manifest | Load manifest list, create SP item, update SP item, delete SP item | ✅ PASS |
| AR Tracker | Load TTF list, create TTF with BTB rows, update TTF (replace BTBs), delete TTF | ✅ PASS |
| Finance, Outstanding | Read-only list views that join `sp_items` | ✅ PASS |
| Admin — all 9 tabs | Load all admin tabs (no Group B/C UI yet) | ✅ PASS |
| Login / session | Auth flow unaffected | ✅ PASS |

Group B and Group C tables have no UI in the current release. No smoke tests
apply to them beyond confirming no unexpected errors appear on page load.

---

## Risk Notes

| Risk | Status |
|---|---|
| Group A policies are transitional — not company-scoped | Accepted. Tracked. Must be tightened in Phase 2 when `company_id` is added. |
| No UI currently exercises Group B or Group C tables | Accepted. RLS protects against accidental exposure before Phase 2/4.2 modules ship. |
| Production execution not yet performed | Production remains blocked — see below. |

---

## Production Status

**Production execution is BLOCKED.**

Requires formal sign-off from:
- Technical lead
- Product owner

This gate was established in Phase 1.0F and applies to all pending migrations,
including Migration 017. No production schema changes may be executed without
explicit written approval from both parties.

---

## Conclusion

Phase 1.0H staging verification is **complete**.

Migration 017 (`20260524000017_rls_hardening_public_tables.sql`) has been applied to
the Nexus by MSI staging project (`untmpqceexwxzuhlmyrg`). All 8 target tables show
`rowsecurity = true` and all expected policies are present. All operational app
screens that use Group A tables continue to function correctly.

The Supabase Security Advisor `rls_disabled_in_public` critical warning for these
8 tables is resolved in staging. It will be resolved in production after formal
sign-off and production execution.

**Next step:** Phase 1.0I — Master Data CRUD (create/edit capability for admin
screens) or Vendors/Products read-only admin screens. See
`docs/architecture/implementation-roadmap.md` for the full phase plan.
