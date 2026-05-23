# Nexus by MSI — Stability & Technical Debt Audit

**Phase:** 0.5A — Audit Only (no source code changes)
**Date:** 2026-05-23
**Branch:** `docs/nexus-erp-foundation`
**Author:** Claude (session handoff)

---

## 1. Current Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 0.0 | Initial Project Instructions | ✅ Complete |
| 0.1 | Documentation Foundation | ✅ Complete |
| 0.2 | Final CLAUDE.md | ✅ Complete |
| 0.3 | Claude Agents | ✅ Complete |
| 0.4A | Bundle Size Audit | ✅ Complete |
| 0.4B Step 1 | Vite Vendor Chunk Split | ✅ Complete |
| 0.4B Step 2 | Lazy Load UserManagement | ✅ Complete |
| 0.4B Step 3A | Extract Dashboard Module | ✅ Complete |
| 0.4B Step 3B | Lazy Load Dashboard | ✅ Complete |
| **0.5A** | **Stability & Tech Debt Audit** | ✅ **This document** |
| 0.5B | Remove Production Console Logs | ✅ Complete |
| 1.0 | Master Data Foundation | Planned |

**GitHub push status:** Commits exist locally on `docs/nexus-erp-foundation`. Branch has NOT been pushed to remote (network issue in prior session). Push required before any PR or deploy.

---

## 2. Build Status

**Command:** `npm run build`
**Result:** ✅ PASS — No warnings, no errors

```
vite v8.0.11 building client environment for production...
✓ 2340 modules transformed.
dist/index.html                             0.80 kB │ gzip:   0.38 kB
dist/assets/index-Dtb_zCIb.css             16.48 kB │ gzip:   4.21 kB
dist/assets/rolldown-runtime-S-ySWqyJ.js    0.69 kB │ gzip:   0.42 kB
dist/assets/UserManagement-CuYwPxFU.js      8.86 kB │ gzip:   2.97 kB
dist/assets/vendor-lucide-LJsMC_yj.js       9.26 kB │ gzip:   3.60 kB
dist/assets/Dashboard-DVMQJPnO.js          14.65 kB │ gzip:   3.84 kB
dist/assets/index-BCim19mA.js             122.41 kB │ gzip:  26.15 kB
dist/assets/vendor-react-YvL5Yovn.js      189.64 kB │ gzip:  59.65 kB
dist/assets/vendor-supabase-CDoftGUu.js   196.30 kB │ gzip:  50.02 kB
dist/assets/vendor-recharts-LsVsUfOu.js   386.98 kB │ gzip: 110.99 kB
✓ built in 628ms
```

**Startup JS (gzip):** 139.84 kB (down from 252.45 kB baseline — -44.6% from Phase 0.4B)
**Deferred chunks:** Dashboard (3.84 kB), UserManagement (2.97 kB), vendor-recharts (110.99 kB)

---

## 3. Lint Status

**Command:** `npm run lint`
**Result:** ❌ FAIL — **42 errors, 0 warnings**

> **Note:** The prior session documented "43 pre-existing errors." The actual current count is **42**. One error may have been resolved during Phase 0.4B (e.g., removing unused `Check`/`TrendingUp` icons from App.jsx during Dashboard extraction). This document uses the verified current count of **42**.

---

## 4. Lint Error Summary by Rule

| ESLint Rule | Count | Severity | Description |
|-------------|-------|----------|-------------|
| `no-unused-vars` | 25 | Medium | Variables, imports, and functions declared but never used |
| `react-hooks/set-state-in-effect` | 6 | High | `setState` called synchronously inside `useEffect` body — can cause cascading renders |
| `react-hooks/static-components` | 4 | High | Component (`SortIcon`) defined inside another component's render scope — resets state on every parent re-render |
| `no-undef` | 3 | High | References to undefined variables (`setRows`, `setCustomers`, `setArData`) — runtime errors if code path is hit |
| `no-useless-assignment` | 2 | Low | `status` variable assigned a value never used in subsequent statements |
| `react-hooks/purity` | 1 | Medium | `Date.now()` called during render in `useState` initializer — impure function in render |
| `react-refresh/only-export-components` | 1 | Low | `AuthContext.jsx` exports both a component and utility functions — breaks Fast Refresh in dev |
| **Total** | **42** | | |

---

## 5. Lint Error Summary by File

| File | Error Count | Top Issues |
|------|-------------|-----------|
| `src/App.jsx` | 29 | Dead code, orphaned legacy functions, undefined refs, SortIcon-in-render, setState-in-effect |
| `src/modules/dashboard/Dashboard.jsx` | 3 | Unused `React`, `LineChart`, `Line` imports |
| `src/components/UserManagement.jsx` | 3 | Unused `React`, two setState-in-effect |
| `src/contexts/AuthContext.jsx` | 2 | Unused `React`, mixed component+utility exports |
| `src/components/AuthGate.jsx` | 1 | Unused `React` |
| `src/components/Login.jsx` | 1 | Unused `React` |
| `src/hooks/useCustomers.js` | 1 | setState-in-effect |
| `src/hooks/useSpItems.js` | 1 | setState-in-effect |
| `src/hooks/useTtfs.js` | 1 | setState-in-effect |
| **Total** | **42** | |

### Detailed Error List — src/App.jsx (29 errors)

| Line | Rule | Detail |
|------|------|--------|
| 1:8 | no-unused-vars | `React` imported but unused (JSX transform handles it) |
| 5:41 | no-unused-vars | `Filter` lucide icon imported but unused |
| 43:7 | no-unused-vars | `SEED_DATA` defined but unused (dead seed data) |
| 268:7 | no-useless-assignment | `status` assigned but not subsequently used |
| 364:7 | no-useless-assignment | `status` assigned but not subsequently used |
| 403:7 | no-unused-vars | `SEED_CUSTOMERS` defined but unused |
| 411:7 | no-unused-vars | `SEED_AR` defined but unused |
| 474:16 | no-unused-vars | `dbResetData` — legacy function from pre-hook era, never called |
| 475:15 | no-unused-vars | `dbClearAll` — legacy function from pre-hook era, never called |
| 510:5 | react-hooks/set-state-in-effect | `setLoading(false)` called synchronously in `useEffect` body |
| 513:9 | no-unused-vars | `persist` — orphaned legacy persist function, never called |
| 514:5 | no-undef | `setRows` referenced but not defined (state moved to `useSpItems` hook) |
| 516:12 | no-unused-vars | `e` catch parameter unused |
| 519:9 | no-unused-vars | `persistCustomers` — orphaned legacy persist function, never called |
| 520:5 | no-undef | `setCustomers` referenced but not defined (state moved to `useCustomers` hook) |
| 522:12 | no-unused-vars | `e` catch parameter unused |
| 525:9 | no-unused-vars | `persistAR` — orphaned legacy persist function, never called |
| 526:5 | no-undef | `setArData` referenced but not defined (state moved to `useTtfs` hook) |
| 528:12 | no-unused-vars | `e` catch parameter unused |
| 586:9 | no-unused-vars | `filteredRows` computed with `useMemo` but result never consumed |
| 1267:17 | no-unused-vars | `allCount` computed but never used in render |
| 1328:69 | react-hooks/static-components | `SortIcon` component defined inside `Manifest` render — first usage |
| 1331:67 | react-hooks/static-components | `SortIcon` — second usage |
| 1340:70 | react-hooks/static-components | `SortIcon` — third usage |
| 1343:85 | react-hooks/static-components | `SortIcon` — fourth usage (all four point to the same definition at line 1230) |
| 1411:23 | no-unused-vars | `label` parameter defined but unused |
| 2349:43 | no-unused-vars | `dcList` computed with `useMemo` but result never consumed |
| 2548:9 | no-unused-vars | `lunasCount` computed but never used |
| 2874:25 | react-hooks/purity | `Date.now()` called during render in `useState` initializer inside `ARModal` |

---

## 6. Stability Risk Register

Risks that could cause app crashes or user-visible failures in production.

### STAB-01 — No ErrorBoundary Anywhere
**Severity: High**
**Location:** `src/App.jsx`, `src/main.jsx`

There is no `<ErrorBoundary>` wrapping any page or the entire application. If any component throws a JavaScript error during render (e.g., a null access on Supabase data, a failed JSON parse), React will unmount the entire app and display a blank white screen. Users cannot recover without a full page refresh, and no error is surfaced to the user.

**Risk trigger:** Supabase returns unexpected shape, network partial failure, malformed data from import.

---

### STAB-02 — Orphaned Legacy Functions with Undefined Variable References
**Severity: High**
**Location:** `src/App.jsx` lines 513–528

Three legacy persist functions (`persist`, `persistCustomers`, `persistAR`) remain in App.jsx. They reference `setRows`, `setCustomers`, and `setArData` — state setters that no longer exist in App.jsx scope (state was migrated to the custom hooks `useSpItems`, `useCustomers`, `useTtfs`). If these functions are ever called, they will throw `ReferenceError` at runtime, crashing the component.

Currently these functions are assigned to unused variables (caught by `no-unused-vars`), so they are unreachable dead code. But they represent dangerous dead code: any future developer could accidentally wire them up.

**Risk trigger:** Developer mistakenly uses these functions during a new feature or debug session.

---

### STAB-03 — SortIcon Component Defined Inside Render Function
**Severity: Medium-High**
**Location:** `src/App.jsx` line 1230 (inside `Manifest` component)

`SortIcon` is defined as an arrow function component inside `Manifest`'s render scope. React creates a new component identity on every render of `Manifest`. This means:
1. React will unmount and remount `SortIcon` on every parent re-render — any local state inside `SortIcon` would be lost
2. It is a persistent performance waste (new function allocation every render)
3. The `react-hooks/static-components` rule flags this correctly

Currently `SortIcon` has no local state, so the actual user-visible impact is low. But it is technically wrong and could cause subtle bugs if `SortIcon` is ever extended.

---

### STAB-04 — setState Called Synchronously in useEffect (6 locations)
**Severity: Medium**
**Locations:** App.jsx:510, UserManagement.jsx:69, UserManagement.jsx:334, useCustomers.js:27, useSpItems.js:43, useTtfs.js:41

The `react-hooks/set-state-in-effect` rule flags patterns where `setState` is called (directly or via a callback like `refresh()`) as the synchronous body of a `useEffect`. This can cause cascading render cycles. In the hooks (`useCustomers`, `useSpItems`, `useTtfs`), the pattern is `useEffect(() => { refresh(); }, [refresh])` where `refresh` is a `useCallback` that sets state. This is a common pattern but the linter flags it as potentially unsafe.

In practice with the current code, the impact is contained because `refresh` is stable via `useCallback`. However, the pattern is technically flagged and could behave unexpectedly if `refresh` identity changes.

---

### STAB-05 — App.jsx Monolith (3014 lines)
**Severity: Medium**
**Location:** `src/App.jsx`

App.jsx contains 35+ components in a single file (3014 lines). This creates:
1. Difficult debugging — errors in any component show as originating from App.jsx
2. No component-level ErrorBoundary possible without extraction
3. High merge conflict risk as team grows
4. Slow IDE performance for large file

This is a known planned issue (Phase 0.4B left remaining pages unextracted). Noted here as ongoing risk.

---

### STAB-06 — Dead useMemo Computations
**Severity: Low**
**Location:** `src/App.jsx` lines 545, 586, 1267, 2548

Four computed values (`dcList`, `filteredRows`, `allCount`, `lunasCount`) are computed via `useMemo` or plain variable assignment but their results are never consumed in render or passed to any component. These are dead computation waste: CPU time spent computing values that go nowhere. The `no-unused-vars` linter correctly flags these.

---

### STAB-07 — console.log Statements in Production db.js
**Severity: Low-Medium**
**Location:** `src/lib/db.js` lines 324, 328, 333, 338

`getMyProfile()` contains 4 `console.log` statements that will appear in production browser consoles. These expose session and user ID information in plaintext logs, which is a minor information disclosure risk and a release checklist violation (`npm run lint` passes only because these use `console.log` not the ESLint-checked pattern — but they should be removed before any push).

---

## 7. Performance Risk Register

Gaps between the current codebase and `docs/performance/performance-baseline.md` requirements.

### PERF-01 — No Server-Side Pagination on Any Page
**Severity: Critical**
**Locations:** `src/lib/db.js` — `listSpItems()`, `listCustomers()`, `listTtfs()`, `listProfiles()`

All four list query functions fetch **all rows** from the database with no `limit`, `range`, or pagination logic:

```js
// listSpItems — no limit
await supabase.from('sp_items').select('*, customers(name)').order('sp_date', ...);

// listCustomers — no limit
await supabase.from('customers').select('*').order('name');

// listTtfs — no limit
await supabase.from('ar_ttfs').select('*, customers(name), ar_btbs(*)').order(...);

// listProfiles — no limit
await supabase.from('profiles').select('*').order('created_at');
```

**Performance baseline requirement:** "All list/table pages must implement server-side pagination. Default page size: 25 rows."

This is acceptable at current data volume (~small) but is a mandatory Phase 0.5B target before transaction volume grows.

---

### PERF-02 — SELECT * on Three Tables
**Severity: High**
**Locations:** `src/lib/db.js` lines 145, 308, 336

- `listCustomers()` — `SELECT *` on `customers`
- `listProfiles()` — `SELECT *` on `profiles`
- `getMyProfile()` — `SELECT *` on `profiles`

**Performance baseline requirement:** "Must select only required columns — no `SELECT *` for list queries."

---

### PERF-03 — No Debounce on Search Inputs
**Severity: High**
**Location:** `src/App.jsx` (Manifest, ARTrackerPage, ShipmentPage — all with search/filter inputs)

Search/filter inputs trigger immediate `useMemo` recomputation on every keystroke. While the current implementation filters client-side (against in-memory rows) rather than firing a Supabase query on every keystroke, there is no debounce in place. When server-side search is added (PERF-01), these inputs will need debounce added simultaneously to prevent a query-per-keystroke.

**Performance baseline requirement:** "Search inputs must be debounced minimum 300ms."

---

### PERF-04 — Dashboard Stats Computed in Frontend
**Severity: Medium**
**Location:** `src/App.jsx` lines 594–627 (the `stats` useMemo)

Dashboard KPI values (total SP, totals by status, finance summaries) are computed in the frontend via a large `useMemo` over the full `rows` array. When `rows` grows to thousands, this computation runs in the browser on every re-render.

**Performance baseline requirement:** "Dashboard metrics must never be computed in the frontend component. Use RPC aggregate or database view."

This is acceptable at current scale but is a mandatory Phase 1.0 concern when transaction volume increases.

---

### PERF-05 — AR BTB Delete-All + Re-Insert Pattern
**Severity: Medium** (at scale)
**Location:** `src/lib/db.js` lines 271–285 (`updateTtf`)

When a TTF (AR invoice) is updated, the strategy is to delete all `ar_btbs` rows for that TTF and re-insert them fresh. This is safe and simple at low volume, but creates race conditions if multiple users edit the same TTF simultaneously, and causes unnecessary write amplification at higher volume.

**Impact:** Current scale (small team, small data) — Low. At Phase 3 volume — Medium.

---

### PERF-06 — No deleted_at Filter in Any Query
**Severity: Medium**
**Location:** `src/lib/db.js` — all list functions

None of the existing list queries include a `deleted_at IS NULL` filter. This is because soft delete has not been implemented in the database schema yet. However, once Phase 1.0 adds `deleted_at` columns, all existing queries will immediately return soft-deleted records unless updated.

**Performance baseline requirement:** "All list queries must filter `deleted_at IS NULL`."

---

### PERF-07 — No company_id Filter in Any Query
**Severity: Critical** (for multi-company)
**Location:** `src/lib/db.js` — all list functions

None of the list queries include a `company_id` filter. This is because the current app is single-company. If and when multi-company data is added to the same Supabase instance, all list queries will return data across all companies unless RLS policies enforce the filter at the database level.

**Risk:** Depends entirely on RLS policy correctness at the database level. If RLS is properly company-scoped, this is mitigated. If RLS is missing or incomplete, all company data would be exposed across companies.

**Required action before Phase 1.0:** Verify RLS enforces company_id scoping, then add company_id filters to all queries as belt-and-suspenders.

---

## 8. Security Risk Register

Items that require review before any multi-company or production usage.

### SEC-01 — Hard DELETE on Business Data (No Soft Delete)
**Severity: High**
**Locations:** `src/lib/db.js` — `deleteCustomer()` (line 169), `deleteSpItem()` (line 215), `deleteTtf()` (line 296–299)

All three delete functions use hard `DELETE` with no soft delete (no `deleted_at` timestamp set):

```js
// WRONG — violates "soft delete by default" rule
const { error } = await supabase.from('customers').delete().eq('id', id);
```

**Security baseline requirement:** "Use soft delete by default for business data. Important delete actions require approval."

This means deleted customers, SP items, and AR TTFs are permanently destroyed with no recovery path, no audit trail of the deletion, and no ability to restore.

---

### SEC-02 — No Audit Log Calls on Any Mutation
**Severity: High**
**Location:** `src/lib/db.js` — all insert, update, delete functions

None of the data mutation functions (`insertSpItem`, `updateSpItem`, `deleteSpItem`, `upsertCustomer`, `deleteCustomer`, `insertTtf`, `updateTtf`, `deleteTtf`, `updateProfile`) include any audit log call.

**Security baseline requirement:** Mandatory audit events include `create`, `update`, `delete`, `soft_delete`. All must be logged.

---

### SEC-03 — console.log Leaking Session Data in Production
**Severity: Medium**
**Location:** `src/lib/db.js` lines 324, 328, 333, 338

```js
console.log('[getMyProfile] starting...');
console.log('[getMyProfile] session:', session ? `user ${session.user.id}` : 'null');
console.log('[getMyProfile] querying profile...');
console.log('[getMyProfile] result:', data, 'err:', error);
```

The last log prints raw Supabase profile data (including all columns selected via `SELECT *`) to the browser console. This exposes user data to anyone with DevTools access. The `session.user.id` log also exposes the authenticated user's UUID in plaintext.

**Must be removed before any push to remote.**

**Phase 0.5B status:** ✅ Resolved. The unsafe production console logs in `getMyProfile()` were removed from `src/lib/db.js` without changing Supabase session/profile query behavior or return values.

---

### SEC-04 — company_id Not Enforced at Query Level
**Severity: Medium-High** (future risk)
**Location:** `src/lib/db.js` — all list queries

See PERF-07. The security implication: if RLS is misconfigured or not yet applied to a new table, client queries will return cross-company data. Belt-and-suspenders filtering at the query layer is a required defense.

**Action:** Verify Supabase RLS policies for all existing tables. Document findings. Add `company_id` filters to all queries in Phase 1.0.

---

### SEC-05 — MFA Not Verified in Codebase
**Severity: Medium** (per baseline requirement)
**Location:** `src/contexts/AuthContext.jsx`, `src/components/Login.jsx`

The security baseline requires MFA for admin, BOD, Finance Controller, and Head Level roles. The current codebase does not show any MFA enrollment or verification flow. This must be addressed before these roles are assigned in a production environment.

---

### SEC-06 — No User Inactivity Timeout
**Severity: Low-Medium**
**Location:** `src/contexts/AuthContext.jsx`

The security baseline requires inactive users to be blocked or logged out. No inactivity timer or session expiry check exists in the current codebase beyond Supabase's default session TTL.

---

## Phase 0.5B Completion Note

**Date:** 2026-05-23
**Scope:** Remove Production Console Logs

Phase 0.5B removed only the unsafe production logs from `src/lib/db.js`. No business logic, Supabase query behavior, auth/session behavior, schema, config, RLS policy, dependency, deployment, or unrelated lint issue was changed.

Removed logs:
- `console.log('[getMyProfile] starting...');`
- `console.log('[getMyProfile] session:', session ? \`user ${session.user.id}\` : 'null');`
- `console.log('[getMyProfile] querying profile...');`
- `console.log('[getMyProfile] result:', data, 'err:', error);`

Verification after Phase 0.5B:
- `rg -n "console\\.(log|debug|info)" src/lib/db.js` found no remaining `console.log`, `console.debug`, or `console.info` calls.
- `npm run build` ✅ PASS — production build completed with no errors and no 500 kB warning.
- `npm run lint` ❌ FAIL — 42 errors, 0 warnings. These are the documented pre-existing lint errors from Phase 0.5A and were intentionally not fixed during this phase.

Security impact:
- The P0 session/profile data exposure risk from production browser console logs is resolved.
- Existing broader security risks in this audit remain open until handled in their own approved phases.

---

## 9. Recommended Fix Order

Prioritized by severity and risk. All items in **P0** must be resolved before any GitHub push or production deploy.

### P0 — Must Fix Before GitHub Push

| ID | Item | Effort | Risk if Skipped |
|----|------|--------|-----------------|
| SEC-03 | Remove `console.log` statements from `db.js` | ✅ Done in Phase 0.5B | Resolved |
| STAB-02 | Remove orphaned legacy functions (`persist`, `persistCustomers`, `persistAR`) | Small (delete ~30 lines) | `no-undef` errors; dangerous dead code with undefined refs |
| STAB-06 | Remove dead `useMemo` and unused variables (SEED_DATA, SEED_CUSTOMERS, SEED_AR, `filteredRows`, `dcList`, `allCount`, `lunasCount`, `dbResetData`, `dbClearAll`) | Small | Noise in lint output, dead computation |

### P1 — Fix After Phase 0.5B (Separate Scope)

| ID | Item | Effort | Risk if Skipped |
|----|------|--------|-----------------|
| STAB-01 | Add `<ErrorBoundary>` wrapper to main app and each lazy page | Small | Entire app goes blank on any unhandled throw |
| STAB-03 | Move `SortIcon` outside `Manifest` render function | Tiny | State loss on every re-render (currently no state, but bad pattern) |
| STAB-04 | Review and fix `setState-in-effect` pattern in hooks | Medium | Cascading render cycles possible |
| SEC-01 | Implement soft delete for customers, sp_items, ar_ttfs | Medium | Permanent data loss on delete, no audit trail |
| PERF-03 | Add debounce (300ms) to all search inputs | Small | Prerequisite for server-side search |

### P2 — Fix in Phase 0.5C or Phase 1.0 Prep

| ID | Item | Effort | Risk if Skipped |
|----|------|--------|-----------------|
| PERF-01 | Add server-side pagination to all list queries | Medium | App becomes slow as data grows |
| PERF-02 | Replace `SELECT *` with column-specific selects | Small | Over-fetching, minor performance waste |
| SEC-02 | Add audit log calls to all mutation functions | Medium | No audit trail for create/update/delete |
| PERF-07 / SEC-04 | Add `company_id` filter to all queries | Small | Cross-company data exposure if RLS is incomplete |
| PERF-06 | Add `deleted_at IS NULL` filter to all queries | Small | Dead records returned after soft delete is added |

### P3 — Planned for Phase 1.0+

| ID | Item | Effort | Risk if Skipped |
|----|------|--------|-----------------|
| PERF-04 | Move Dashboard aggregates to Supabase RPC | Large | Frontend performance degrades at scale |
| PERF-05 | Replace BTB delete-all + re-insert with diff-based update | Medium | Race condition risk at higher volume |
| SEC-05 | Add MFA enforcement for admin/finance roles | Medium | Security baseline not met for privileged roles |
| SEC-06 | Add session inactivity timeout | Medium | Sessions never expire automatically |
| STAB-05 | Continue extracting page components from App.jsx | Large | Ongoing tech debt; see Phase 0.4B plan |

---

## 10. Post-0.5B Recommendation

**Phase 0.5B was intentionally limited to removing unsafe production console logs. Remaining stability, lint, and performance fixes should be handled in separate scoped phases.**

### Recommended Next Scope

**Commit 1 — Remaining P0 cleanup (lowest risk, zero behavior change):**
- Remove orphaned legacy functions (`persist`, `persistCustomers`, `persistAR`) and their dead seed arrays (`SEED_DATA`, `SEED_CUSTOMERS`, `SEED_AR`) from `src/App.jsx`
- Remove dead useMemo results (`filteredRows`, `dcList`, `allCount`, `lunasCount`, `dbResetData`, `dbClearAll`)
- Remove unused imports (`React` from JSX transform files, `Filter` icon, `LineChart`/`Line` from Dashboard.jsx)
- Expected: lint errors drop from 42 to ~15 (removing no-unused-vars, no-undef, no-useless-assignment categories)
- Risk: **Low** — deleting dead code only

**Commit 2 — ErrorBoundary (high safety value, low risk):**
- Create `src/components/ErrorBoundary.jsx` — simple class component wrapping the error UI
- Wrap the main app in `<ErrorBoundary>` in `src/main.jsx`
- Wrap each `<Suspense>` boundary in its own `<ErrorBoundary>` in `src/App.jsx`
- Risk: **Low** — additive change, no data flow impact

**Commit 3 — SortIcon extraction (low risk):**
- Move `SortIcon` definition from inside `Manifest` to module scope (above `Manifest` function, inside same file)
- Risk: **Low** — no behavior change, fixes static-components lint error

**Commit 4 — Debounce search inputs (prerequisite for PERF-01):**
- Add 300ms debounce to filter/search state in Manifest, ARTrackerPage, CustomersPage
- Currently filters client-side so no query reduction yet, but pattern is in place for when server-side search is added
- Risk: **Low-Medium** — UI behavior change (slight delay before filter applies)

### What The Next Scope Should NOT Include

- Server-side pagination (Phase 1.0 prep — needs careful RLS and schema coordination)
- Soft delete migration (requires schema change — needs explicit approval)
- Audit log implementation (requires new table — needs schema approval)
- `company_id` filter changes (needs RLS verification first)
- Further App.jsx page extraction (Phase 0.4B continuation — separate scope)

### Estimated Post-0.5B Lint Reduction

| After | Expected Lint Count |
|-------|---------------------|
| Current after Phase 0.5B | 42 errors |
| After remaining P0 cleanup | ~15 errors |
| After Commit 2 (ErrorBoundary) | ~15 errors (no lint change) |
| After Commit 3 (SortIcon) | ~11 errors |
| After Commit 4 (debounce) | ~11 errors (no lint change) |

Remaining ~11 errors after the proposed next cleanup would be: `react-hooks/set-state-in-effect` (6) + `react-refresh/only-export-components` (1) + any remaining `no-unused-vars` in AuthGate/Login/AuthContext/UserManagement.

---

## 11. Manual Smoke Test Checklist

Complete this checklist before any GitHub push or deploy. Run in a browser with DevTools open (Console + Network tab visible).

### Authentication
- [ ] App loads without blank screen or console error
- [ ] Login page appears for unauthenticated users
- [ ] Login with valid credentials succeeds and navigates to app
- [ ] Login with invalid credentials shows error, does not crash
- [ ] Logout works and returns to login
- [ ] Page refresh while logged in maintains session

### Navigation & Lazy Loading
- [ ] All menu items are visible based on role
- [ ] Clicking Dashboard loads without error; check Network tab — recharts chunk downloads only now
- [ ] Clicking Users loads without error; check Network tab — UserManagement chunk downloads only now
- [ ] Navigating back and forth between pages does not cause errors
- [ ] Suspense fallback ("Loading...") appears briefly on first lazy page load

### Manifest / SP Page
- [ ] SP list loads and displays records
- [ ] Filter by status works
- [ ] Filter by customer works
- [ ] Search input filters results (even if client-side)
- [ ] Sort by column header works
- [ ] SP side panel opens on row click and shows detail
- [ ] Edit SP opens form modal, save updates the row
- [ ] Delete SP removes the row (note: currently hard delete)
- [ ] New SP input form accepts and saves a new record

### Dashboard
- [ ] Dashboard page loads after first click
- [ ] KPI cards show values (not NaN or undefined)
- [ ] Charts render without error
- [ ] Month filter changes chart data

### AR Tracker
- [ ] AR Tracker list loads
- [ ] Aging buckets display correctly
- [ ] TTF side panel opens and shows BTB detail
- [ ] Add/edit TTF modal saves correctly

### Customers
- [ ] Customer list loads
- [ ] Add customer modal saves and appears in list
- [ ] Edit customer saves correctly
- [ ] Delete customer removes from list

### User Management (admin only)
- [ ] User list loads
- [ ] Role change saves
- [ ] Status change saves

### Console & Network Check
- [ ] No red errors in browser Console on any page
- [ ] No failed network requests in Network tab on any page
- [ ] `vendor-recharts` is NOT downloaded until Dashboard is visited
- [ ] `UserManagement` chunk is NOT downloaded until Users is visited

---

## 12. What Must Not Be Changed Before GitHub Push

The following items are blocking concerns. Resolve these before pushing `docs/nexus-erp-foundation` to remote:

### Required Before Push

1. **Remove `console.log` statements from `src/lib/db.js`** (SEC-03) — These expose user session data in browser console in production. The 4 `console.log` calls in `getMyProfile()` must be deleted.

2. **Verify no new lint errors were introduced during Phase 0.4B** — Confirmed: current lint count is 42 (all pre-existing). No new errors from Phase 0.4B work.

3. **Verify build passes** — Confirmed: `npm run build` PASS with no warnings.

### Acceptable Before Push (Do Not Block)

- The 42 pre-existing lint errors (do not block push, but document in PR)
- The `SortIcon` render-scope issue (functional, just incorrect pattern)
- Missing ErrorBoundary (functional, just unprotected)
- Missing pagination (functional, just unscalable at volume)

### Do Not Push or Deploy Without Separate Approval

- Any database schema change
- Any RLS policy change
- Any Supabase config change
- Any changes to production environment variables

---

## 13. Files Reviewed in This Audit

| File | Lines | Notes |
|------|-------|-------|
| `src/App.jsx` | 3014 | Main application, monolith |
| `src/lib/db.js` | 343 | Data access layer |
| `src/hooks/useSpItems.js` | 179 | SP items hook |
| `src/hooks/useCustomers.js` | 64 | Customers hook |
| `src/hooks/useTtfs.js` | (via lint output) | AR TTF hook |
| `src/modules/dashboard/Dashboard.jsx` | 441 | Extracted dashboard module |
| `src/components/UserManagement.jsx` | 375 | Lazy-loaded user management |
| `src/contexts/AuthContext.jsx` | (via lint output) | Auth context |
| `docs/performance/performance-baseline.md` | — | Performance requirements |
| `docs/operations/release-checklist.md` | — | Release requirements |
| `docs/performance/bundle-size-audit.md` | — | Phase 0.4B history |
| `docs/architecture/implementation-roadmap.md` | — | Phase plan |

---

## 14. Summary

| Category | Finding |
|----------|---------|
| Build | ✅ PASS — clean, no warnings |
| Lint | ❌ 42 errors (all pre-existing, none from Phase 0.4B) |
| ErrorBoundary | ❌ Missing — entire app crashes on any unhandled throw |
| Pagination | ❌ Missing — all queries fetch all rows |
| Soft Delete | ❌ Missing — hard DELETE on all business data |
| Audit Log | ❌ Missing — no audit events on any mutation |
| Debounce | ❌ Missing — no debounce on any search input |
| console.log in production | ⚠️ Present — must remove before push |
| Orphaned dead code | ⚠️ Present — orphaned legacy functions with undefined refs |
| Bundle startup size | ✅ 139.84 kB gzip (−44.6% from baseline) |
| Lazy loading | ✅ Dashboard + UserManagement deferred |
| Vendor chunk split | ✅ Parallel-cacheable chunks |

**Next recommended step:** Phase 0.5B — implement P0 and P1 fixes starting with the `console.log` removal and dead code cleanup, then ErrorBoundary addition.
