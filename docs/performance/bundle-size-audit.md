# Bundle Size Audit — Nexus by MSI

**Date:** 2026-05-23
**Phase:** 0.4A — Bundle Size Warning Audit | 0.4B Steps 1–3B ✅
**Author:** Claude
**Status:** Phase 0.4B Step 3B complete. Dashboard lazy-loaded. Recharts fully deferred from startup. See Section 16 for latest results.

---

## 1. Current Build Result

```
$ npm run build

> storbit-manifest@0.0.0 build
> vite build

vite v8.0.11 building for production...
✓ 2338 modules transformed.
dist/index.html                        0.46 kB │ gzip:   0.30 kB
dist/assets/index-Dtb_zCIb.css       16.48 kB │ gzip:   4.21 kB
dist/assets/index-BOACoxLT.js        924.65 kB │ gzip: 252.45 kB

(!) Some chunks are larger than 500 kB after minification.
Use dynamic import() to code split the application.
Or use build.rolldownOptions.output.codeSplitting to split the bundle.
Or set build.chunkSizeWarningLimit to silence this warning.

✓ built in ~657ms
```

**Build status: PASS with warning.**
The build completes successfully. No errors. One warning: main JS chunk exceeds 500KB.

---

## 2. Current Bundle Size

| Asset | Raw Size | Gzipped |
|-------|----------|---------|
| `index-BOACoxLT.js` | 924.65 kB | 252.45 kB |
| `index-Dtb_zCIb.css` | 16.48 kB | 4.21 kB |
| `index.html` | 0.46 kB | 0.30 kB |
| **Total JS transfer** | — | **~252 kB** |

Gzipped size is 252 kB — within an acceptable range for a full SPA.  
However: the raw 924 kB single chunk means the browser must parse and execute ~925 kB of JavaScript before the app can render anything. No page can load until the entire bundle is parsed.

The 500 kB warning threshold is Vite's default. This project has deliberately chosen **not** to raise that limit — the warning is intentional and should be resolved by code splitting.

---

## 3. Root Cause Analysis

### Cause 1 — Recharts (~300 kB raw, ~80 kB gzipped)

**Location:** Top of `src/App.jsx` (lines ~1–20)

```js
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, AreaChart, Area
} from 'recharts';
```

**Impact:** Recharts is the single largest dependency in the bundle.  
**Problem:** Named imports allow tree-shaking per symbol, but Recharts' internal structure means most of the library is still bundled when multiple chart types are used. All 4 chart types (Pie, Bar, Line, Area) are used — this is a genuine full-library import in practice.  
**Usage scope:** Recharts is used **only in the Dashboard component** (lines ~470–750). It is not used on any other page.  
**Current state:** Because there is no code splitting, Recharts is bundled and loaded even when the user opens the Manifest page, Finance page, or any page other than Dashboard.

---

### Cause 2 — `@supabase/supabase-js` (~200 kB raw, ~70 kB gzipped)

**Location:** Imported in `src/hooks/useSupabase.js` and `src/context/AuthContext.jsx`

**Impact:** Second-largest dependency.  
**Problem:** The Supabase client is initialized at app startup and is included in the root bundle. This is unavoidable as long as authentication is required before any page renders.  
**Mitigability:** Low. Supabase is needed at startup for session/auth. Could theoretically be deferred but the risk would outweigh the benefit. Accept as permanent baseline cost.

---

### Cause 3 — App.jsx Monolith (3316 lines, 35+ components)

**Location:** `src/App.jsx`

**Full component inventory (all defined in one file):**

| Component | Type | Approx Lines | Notes |
|-----------|------|-------------|-------|
| `StorbitManifest` | App root / router | ~200 | Main state, all conditional page rendering |
| `Dashboard` | Page | ~280 | Uses all Recharts charts |
| `KPICard` | Display | ~20 | |
| `FinancialCard` | Display | ~30 | |
| `AlertCard` | Display | ~20 | |
| `ChartCard` | Display | ~30 | |
| `EmptyChart` | Display | ~10 | |
| `CustomTooltip` | Recharts plugin | ~15 | |
| `StatusBadge` | Display | ~20 | |
| `Manifest` | Page | ~350 | SP list + filters + sorting |
| `FilterPill` | UI utility | ~20 | |
| `SPSidePanel` | Side panel | ~250 | SP detail + line items |
| `SummaryStat` | Display | ~15 | |
| `MiniStat` | Display | ~15 | |
| `DocChip` | Display | ~15 | |
| `FinTile` | Display | ~15 | |
| `InputPage` | Page | ~300 | New SP form |
| `ActionCard` | Display | ~15 | |
| `ShipmentPage` | Page | ~200 | Shipment tracking |
| `FinancePage` | Page | ~200 | Finance status |
| `OutstandingPage` | Page | ~200 | Outstanding tracking |
| `ModalShell` | UI utility | ~30 | Modal wrapper |
| `FormModal` | Form | ~50 | SP edit form |
| `FormSection` | UI utility | ~15 | |
| `Input` | UI utility | ~20 | Input field wrapper |
| `Toggle` | UI utility | ~20 | Toggle button |
| `CalcRow` | Display | ~15 | |
| `ShipmentModal` | Modal | ~200 | Edit shipment details |
| `FinanceModal` | Modal | ~60 | Update finance status |
| `ImportModal` | Modal | ~170 | Bulk CSV/Excel import |
| `CustomersPage` | Page | ~90 | Customer master data |
| `CustRow` | Display | ~15 | |
| `CustomerModal` | Modal | ~100 | Add/edit customer |
| `ARTrackerPage` | Page | ~200 | AR tracker table + aging |
| `AgingBucket` | Display | ~15 | |
| `ARStatusBadge` | Display | ~25 | |
| `ARSidePanel` | Side panel | ~140 | TTF detail view |
| `ARModal` | Modal | ~150 | Add/edit TTF + BTB items |

**Problem:** All 35+ components are bundled into a single JS chunk. Every component must be downloaded, parsed, and compiled by the browser before the user sees anything — even if they only visit one page.

---

### Cause 4 — State-Based Navigation (No Router)

**Location:** `src/App.jsx` lines ~470+

```js
const [activeMenu, setActiveMenu] = useState('dashboard');
// ...
{activeMenu === 'manifest' && <Manifest ... />}
{activeMenu === 'input' && <InputPage ... />}
{activeMenu === 'shipment' && <ShipmentPage ... />}
// ...
```

**Problem:** The app uses `useState` for navigation instead of React Router. This means:
1. There are no URL routes — so no route-level code splitting is possible with `React.lazy()` without also splitting out page components first.
2. Pages are conditionally rendered (which means React does not mount them until needed), but JavaScript for ALL pages is still downloaded, parsed, and executed at startup.
3. Adding React Router would be an architectural change out of scope for Phase 0.4.

**Key insight:** `React.lazy()` can still be used **without a router**. The state-based conditional rendering `{activeMenu === 'x' && <Page />}` works correctly with lazy-loaded components — the import only triggers when the component first renders. The prerequisite is that each page must first be extracted into its own file.

---

### Cause 5 — No Code Splitting Configuration

**Location:** `vite.config.js` (7 lines, minimal config)

```js
export default defineConfig({
  plugins: [react()]
})
```

No `build.rollupOptions.output.manualChunks` configured.  
No `React.lazy()` used anywhere in the codebase.  
No `React.Suspense` boundary anywhere.

Result: Vite/Rollup bundles all code into a single chunk.

---

### Cause 6 — Lucide React (icons, ~40–60 kB)

**Location:** `src/App.jsx` line ~1

```js
import { X, Check, ChevronLeft, Search, Plus, ... } from 'lucide-react';
```

17 named imports. Lucide React supports full tree-shaking via named imports. This is the **correct** import pattern — only the 17 used icons are included in the bundle. No fix needed here.

---

### Cause 7 — Hardcoded Seed Data Arrays

**Location:** `src/App.jsx` lines ~70–260

```js
const SEED_DATA = [ /* ~200 lines of hardcoded SP items */ ];
const SEED_CUSTOMERS = [ /* ... */ ];
const SEED_AR = [ /* ... */ ];
```

These arrays are always bundled and parsed even for users who have already entered real data. Small individual impact (~10–20 kB), but represents dead weight once real data is in Supabase.

---

## 4. Bundle Size Breakdown (Estimated)

| Source | Estimated Raw Size | % of Total |
|--------|-------------------|-----------|
| Recharts | ~300 kB | ~32% |
| @supabase/supabase-js | ~200 kB | ~22% |
| React + React DOM | ~140 kB | ~15% |
| App.jsx components | ~150 kB | ~16% |
| Lucide React (17 icons) | ~50 kB | ~5% |
| Other (CSS-in-JS tokens, utils) | ~85 kB | ~9% |
| **Total** | **~925 kB** | 100% |

*Estimates based on known library sizes and code complexity. Exact breakdown requires a bundle analyzer tool (e.g. `rollup-plugin-visualizer`), which is not installed.*

---

## 5. Safe Code Splitting Candidates

### Tier 1 — Highest Impact, Lowest Risk

| Candidate | Strategy | Estimated Savings | Risk |
|-----------|----------|-----------------|------|
| Recharts (Dashboard charts) | Extract `Dashboard.jsx` → `React.lazy()` | ~300 kB deferred | Low-Medium |
| All page components | Extract each page → `React.lazy()` | ~150 kB total deferred | Medium |

### Tier 2 — Build Config Only (No Component Changes)

| Candidate | Strategy | Estimated Savings | Risk |
|-----------|----------|-----------------|------|
| Recharts vendor chunk | `manualChunks: { 'vendor-recharts': ['recharts'] }` | Parallel loading, better caching | Low |
| Supabase vendor chunk | `manualChunks: { 'vendor-supabase': ['@supabase/supabase-js'] }` | Parallel loading, better caching | Low |

> **Note on manualChunks:** Splitting into vendor chunks does NOT reduce total download size. It enables parallel downloads and better long-term browser caching (vendor chunks change less often than app code). It will silence the Vite warning but does not defer loading.

### Tier 3 — Requires Phase 0.5 or Later

| Candidate | Strategy | Risk | Reason for Deferral |
|-----------|----------|------|-------------------|
| Seed data removal | Move SEED_DATA to dev-only or remove after Supabase migration | Low | Depends on data migration status |
| React Router migration | Add react-router-dom for true route-level splitting | High | Architectural change, URL structure change |

---

## 6. Risk Analysis

### Risk 1 — Recharts isolation (Dashboard split)
**Severity: Low-Medium**
Dashboard uses Recharts exclusively. Extracting Dashboard into its own file and lazy-loading it would defer all ~300 kB of Recharts until the Dashboard menu item is clicked. The risk is in correctly passing all props (rows, arData, customers, etc.) to the extracted component — must not break data flow.

### Risk 2 — React.lazy() with state-based navigation
**Severity: Low**
`React.lazy()` works with the existing `{activeMenu === 'x' && <Page />}` pattern. When `activeMenu` first becomes `'dashboard'`, React triggers the lazy import. A `<Suspense fallback={<LoadingSpinner />}>` wrapper is required around the conditional rendering. No router needed.

### Risk 3 — Component extraction breaking prop chain
**Severity: Medium**
App.jsx passes many props down to page components. Extracting pages into separate files requires carefully auditing every prop passed to each component. If any prop or callback is missed during extraction, the page silently breaks. Must be done one component at a time with verification.

### Risk 4 — manualChunks cache invalidation
**Severity: Low**
Splitting into vendor chunks means vendor chunk filenames change only when vendor versions change — good for caching. But if `manualChunks` is misconfigured, Vite may produce circular dependencies. Test the build carefully after any chunk config change.

### Risk 5 — Pre-existing lint errors
**Severity: Low (pre-existing)**
`npm run lint` currently fails with pre-existing errors (unused variables, undefined references). These are not introduced by any Phase 0.4 work. They must be documented and tracked but do not block Phase 0.4B — the build still passes.

---

## 7. Recommended Phase 0.4B Implementation Plan

### Guiding Principles
- One concern per commit
- Build and lint must pass after each commit (lint: pre-existing errors only, no new errors)
- No business behavior changes
- No UI changes
- No data flow changes
- No Supabase query changes
- Verify each step manually before proceeding

---

### Step 1 — Vite Manual Chunks (Build Config Only)
**Risk: Low | Estimated commits: 1**

Edit `vite.config.js` to split vendor libraries into separate chunks:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-recharts': ['recharts'],
          'vendor-lucide': ['lucide-react'],
        }
      }
    }
  }
})
```

Expected result: 4–5 chunks, no single chunk exceeds 500 kB, Vite warning resolved.  
Verification: `npm run build` passes without warning. App behavior unchanged.

---

### Step 2 — Extract UserManagement (Already Partially Done)
**Risk: Low | Estimated commits: 0 (already separate file)**

`UserManagement` is already in its own file (`src/UserManagement.jsx`). Apply `React.lazy()`:

```js
// In App.jsx
const UserManagement = React.lazy(() => import('./UserManagement'));
```

Wrap the conditional rendering in `<Suspense>`:
```jsx
<Suspense fallback={<PageLoading />}>
  {activeMenu === 'users' && <UserManagement ... />}
</Suspense>
```

This is the lowest-risk lazy loading change — no component needs to be extracted first.

---

### Step 3 — Extract and Lazy-Load Dashboard
**Risk: Medium | Estimated commits: 2**

Dashboard is the highest-impact target. It uses all Recharts components.

**Commit 3a:** Extract `Dashboard` and its sub-components (`KPICard`, `FinancialCard`, `AlertCard`, `ChartCard`, `EmptyChart`, `CustomTooltip`) into `src/modules/dashboard/Dashboard.jsx`. Ensure all props are preserved exactly. Verify: `npm run build`, manual test Dashboard page.

**Commit 3b:** Apply `React.lazy()` to the Dashboard import in `App.jsx`. Add `<Suspense>`. Verify: Dashboard loads on first click, subsequent visits are instant (cached).

Expected result: Recharts (~300 kB) is deferred until Dashboard is first visited. All other pages now load without downloading Recharts.

---

### Step 4 — Extract and Lazy-Load Remaining Pages
**Risk: Medium | Estimated commits: 6–8 (one per page)**

Extract each page component in order of size (largest first):

| Priority | Component | Sub-components to extract together | Estimated commit |
|----------|-----------|-----------------------------------|-----------------|
| 1 | `Manifest` + `SPSidePanel` | `FilterPill`, `SummaryStat`, `MiniStat`, `DocChip`, `FinTile`, `FormModal` | 1 commit |
| 2 | `InputPage` | `ActionCard` | 1 commit |
| 3 | `ARTrackerPage` + `ARSidePanel` + `ARModal` | `AgingBucket`, `ARStatusBadge` | 1 commit |
| 4 | `ShipmentPage` + `ShipmentModal` | — | 1 commit |
| 5 | `FinancePage` + `FinanceModal` | — | 1 commit |
| 6 | `OutstandingPage` | — | 1 commit |
| 7 | `CustomersPage` + `CustomerModal` | `CustRow` | 1 commit |

After all extractions, `App.jsx` should contain only:
- `StorbitManifest` main component (state, navigation, Suspense wrapper)
- Shared utilities: `ModalShell`, `FormSection`, `Input`, `Toggle`, `CalcRow`
- Constants and formatters (or moved to `src/utils/` in Phase 0.5)
- SEED_DATA arrays (to be cleaned up in Phase 0.5)

---

### Step 5 — `ImportModal` Extraction
**Risk: Low | Estimated commits: 1**

`ImportModal` contains its own CSV parsing logic. Extract to `src/components/ImportModal.jsx` and apply lazy loading. No data flow changes.

---

## 8. Files Expected to Change in Phase 0.4B

| File | Change Type | Notes |
|------|------------|-------|
| `vite.config.js` | Edit | Add `build.rollupOptions.output.manualChunks` |
| `src/App.jsx` | Edit (shrink) | Remove extracted components, add `React.lazy()` imports |
| `src/modules/dashboard/Dashboard.jsx` | Create new | Extracted from App.jsx |
| `src/modules/manifest/Manifest.jsx` | Create new | Extracted from App.jsx |
| `src/modules/manifest/SPSidePanel.jsx` | Create new | Extracted from App.jsx |
| `src/modules/input/InputPage.jsx` | Create new | Extracted from App.jsx |
| `src/modules/shipment/ShipmentPage.jsx` | Create new | Extracted from App.jsx |
| `src/modules/finance/FinancePage.jsx` | Create new | Extracted from App.jsx |
| `src/modules/outstanding/OutstandingPage.jsx` | Create new | Extracted from App.jsx |
| `src/modules/ar/ARTrackerPage.jsx` | Create new | Extracted from App.jsx |
| `src/modules/ar/ARSidePanel.jsx` | Create new | Extracted from App.jsx |
| `src/modules/customers/CustomersPage.jsx` | Create new | Extracted from App.jsx |
| `src/components/ImportModal.jsx` | Create new | Extracted from App.jsx |

---

## 9. What Must Not Be Changed in Phase 0.4B

The following are explicitly out of scope for Phase 0.4B:

| Item | Reason |
|------|--------|
| Any Supabase queries or data fetching logic | Data layer is out of scope |
| Any RLS policies | Security — never touch without explicit approval |
| Any database schema or migration files | Out of scope |
| UI layout, colors, spacing, components | No UI redesign |
| Authentication flow (`AuthContext`, `AuthGate`) | Core security — do not touch |
| Business logic in any component | Refactor only structure, not behavior |
| `.env` files or environment config | Out of scope |
| SEED_DATA removal | Phase 0.5 cleanup task (depends on data migration) |
| React Router migration | Architectural change — Phase 1.0+ |
| New npm dependencies | Requires explicit approval |
| `npm run lint` error count | Pre-existing errors may remain; must not introduce new errors |

---

## 10. Verification Checklist

After each Phase 0.4B commit, verify:

### Build Verification
- [ ] `npm run build` — must PASS
- [ ] No new Vite warnings (the 500 kB warning should be gone after Step 1)
- [ ] Bundle size documented after each step (track progress)
- [ ] Chunk count and sizes reasonable

### Lint Verification
- [ ] `npm run lint` — must not introduce new errors (pre-existing errors acceptable)
- [ ] No new unused variable warnings from extracted components

### Functional Verification (manual)
- [ ] Dashboard loads and all charts render correctly
- [ ] KPI cards show correct values
- [ ] Manifest / SP list renders and filters work
- [ ] SP input form works end-to-end
- [ ] Shipment page renders and edit modal works
- [ ] Finance page renders and update modal works
- [ ] Outstanding page renders correctly
- [ ] AR Tracker loads, aging buckets correct, TTF detail panel works
- [ ] Customers page loads, add/edit/delete works
- [ ] Import modal parses CSV/Excel correctly
- [ ] User Management page loads and functions correctly
- [ ] Login / logout still works
- [ ] Role-based menu visibility still correct (admin sees all, viewer sees limited)
- [ ] No console errors in any page

### Performance Verification
- [ ] First load of Dashboard (lazy) takes < 3 seconds on slow connection
- [ ] Subsequent visits to Dashboard are instant (chunk cached)
- [ ] Network tab shows separate chunks loading (recharts chunk deferred)

---

## 11. Expected Outcome After Phase 0.4B

| Metric | Before | After (Expected) |
|--------|--------|-----------------|
| Vite 500 kB warning | ⚠️ Present | ✅ Resolved |
| JS chunks | 1 | 5–8 |
| Largest chunk | 924 kB | ~180–220 kB (app code) |
| Recharts load timing | At startup (always) | On first Dashboard visit only |
| Supabase load timing | At startup (always) | At startup (unchanged — needed for auth) |
| Total transfer size (gzipped) | ~252 kB | ~252 kB (same — just split differently) |
| Parse time at startup | All 924 kB parsed | Only non-lazy chunks parsed (~180–220 kB) |

> **Important:** Code splitting does NOT reduce total download size. The user will still download ~252 kB (gzipped) total. The benefit is:
> 1. Startup parse time is reduced (only non-lazy code is parsed immediately)
> 2. Pages not yet visited are not downloaded at all until first visit
> 3. Vendor chunks are cached separately — Recharts won't re-download on app code updates
> 4. Better Core Web Vitals (FCP, LCP, TTI)

---

## 12. Files Reviewed in This Audit

| File | Size |
|------|------|
| `src/App.jsx` | 3316 lines |
| `src/main.jsx` | 16 lines |
| `src/UserManagement.jsx` | (imported, not fully read — separate file) |
| `vite.config.js` | 7 lines |
| `package.json` | ~30 lines |

---

## Next Step

~~**Start Phase 0.4B with Step 1: Add `manualChunks` to `vite.config.js`.**~~ ✅ Done — see Section 13.

Next: Phase 0.4B Step 2 — apply `React.lazy()` to `UserManagement` (already a separate file, lowest-risk lazy loading target).

---

## 13. Phase 0.4B Step 1 — Actual Results (2026-05-23)

### What Changed
`vite.config.js` updated with `build.rolldownOptions.output.codeSplitting.groups`.

**API used:** Native Vite 8 / Rolldown `codeSplitting.groups` (not deprecated `manualChunks` object form).  
**Reason:** Rolldown only accepts `manualChunks` as a function (object form unsupported), and it is deprecated. The `codeSplitting.groups` API is the recommended Vite 8 path as indicated by the warning message itself.

### Build Result After Step 1

```
$ npm run build

> storbit-manifest@0.0.0 build
> vite build

vite v8.0.11 building client environment for production...
✓ 2338 modules transformed.

dist/index.html                             0.89 kB │ gzip:   0.40 kB
dist/assets/index-Dtb_zCIb.css             16.48 kB │ gzip:   4.21 kB
dist/assets/rolldown-runtime-S-ySWqyJ.js    0.69 kB │ gzip:   0.42 kB
dist/assets/vendor-lucide-LJsMC_yj.js       9.26 kB │ gzip:   3.60 kB
dist/assets/index-CuJ88kEb.js             141.40 kB │ gzip:  29.55 kB
dist/assets/vendor-react-YvL5Yovn.js      189.64 kB │ gzip:  59.65 kB
dist/assets/vendor-supabase-CG_3_vtU.js   196.30 kB │ gzip:  50.02 kB
dist/assets/vendor-recharts-BK9OrOl0.js   386.98 kB │ gzip: 110.99 kB

✓ built in 625ms
```

**No warnings. Build PASS. ✅**

### Before vs After Comparison

| Metric | Before (0.4A) | After (0.4B Step 1) |
|--------|--------------|---------------------|
| JS chunks | 1 | 7 (+ 1 CSS + html = 9 total assets) |
| Warning | ⚠️ 500 kB exceeded | ✅ No warning |
| Largest chunk | 924.65 kB | 386.98 kB (`vendor-recharts`) |
| App code chunk | 924.65 kB (mixed) | 141.40 kB (`index`) |
| Total JS gzipped | 252.45 kB | ~253.63 kB (+1.2 kB — rolldown-runtime overhead) |
| Build time | ~696ms | ~625ms |

### Chunk Breakdown

| Chunk | Raw Size | Gzipped | Notes |
|-------|----------|---------|-------|
| `rolldown-runtime` | 0.69 kB | 0.42 kB | New — Rolldown chunk coordinator runtime |
| `vendor-lucide` | 9.26 kB | 3.60 kB | Lucide icons (17 named) |
| `index` (app code) | 141.40 kB | 29.55 kB | All app components and business logic |
| `vendor-react` | 189.64 kB | 59.65 kB | React + React DOM |
| `vendor-supabase` | 196.30 kB | 50.02 kB | Supabase JS client |
| `vendor-recharts` | 386.98 kB | 110.99 kB | Recharts — largest, still below 500 kB |

### Important Caveat — Step 1 Benefit Scope

Step 1 (vendor chunks) provides **parallel download and better browser caching**, but does **not** defer loading. All 7 JS chunks are still downloaded and parsed on every initial page load. The total transferred bytes are essentially unchanged (~252–254 kB gzipped).

True deferred loading (Recharts not downloaded until Dashboard is visited) requires **Step 3 — React.lazy()** on the Dashboard component. That is the next high-impact step.

### Lint Verification
- `npm run lint` — 43 pre-existing errors (same as baseline). No new errors introduced. All errors are in source files (`src/hooks/`, `src/App.jsx`), not in `vite.config.js`.

### Files Changed in Step 1
- `vite.config.js` — added `build.rolldownOptions.output.codeSplitting.groups`
- `docs/performance/bundle-size-audit.md` — updated to record Step 1 results

---

## 14. Phase 0.4B Step 2 — Actual Results (2026-05-23)

### What Changed
`src/App.jsx` updated with three minimal edits — no other files touched.

1. **Line 1:** Added `Suspense, lazy` to existing React import
2. **Line 18:** Replaced static import with `React.lazy()` dynamic import
3. **Lines 1087–1094:** Wrapped `<UserManagement>` render in `<Suspense>` with inline fallback

### Exact Change

```js
// Line 1 — before:
import React, { useState, useEffect, useMemo } from 'react';
// Line 1 — after:
import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';

// Line 18 — before:
import UserManagement from './components/UserManagement';
// Line 18 — after:
const UserManagement = lazy(() => import('./components/UserManagement'));

// Lines 1087–1089 — before:
{activeMenu === 'users' && (
  <UserManagement currentUserId={profile?.id || null} />
)}
// Lines 1087–1094 — after:
{activeMenu === 'users' && (
  <Suspense fallback={
    <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
      Loading...
    </div>
  }>
    <UserManagement currentUserId={profile?.id || null} />
  </Suspense>
)}
```

### Build Result After Step 2

```
$ npm run build

> storbit-manifest@0.0.0 build
> vite build

vite v8.0.11 building client environment for production...
✓ 2339 modules transformed.

dist/index.html                             0.89 kB │ gzip:   0.40 kB
dist/assets/index-Dtb_zCIb.css             16.48 kB │ gzip:   4.21 kB
dist/assets/rolldown-runtime-S-ySWqyJ.js    0.69 kB │ gzip:   0.42 kB
dist/assets/UserManagement-F2o7WvBh.js      8.86 kB │ gzip:   2.97 kB
dist/assets/vendor-lucide-LJsMC_yj.js       9.26 kB │ gzip:   3.60 kB
dist/assets/index-DuhpD4Ev.js             134.44 kB │ gzip:  28.35 kB
dist/assets/vendor-react-YvL5Yovn.js      189.64 kB │ gzip:  59.65 kB
dist/assets/vendor-supabase-CG_3_vtU.js   196.30 kB │ gzip:  50.02 kB
dist/assets/vendor-recharts-BK9OrOl0.js   386.98 kB │ gzip: 110.99 kB

✓ built in 676ms
```

**No warnings. Build PASS. ✅**

### Before vs After Comparison (Step 1 → Step 2)

| Metric | After Step 1 | After Step 2 |
|--------|-------------|-------------|
| JS chunks | 7 | 8 |
| Warning | ✅ None | ✅ None |
| Largest chunk | 386.98 kB (`vendor-recharts`) | 386.98 kB (`vendor-recharts`) — unchanged |
| App code chunk | 141.40 kB | 134.44 kB (-6.96 kB) |
| UserManagement chunk | not separate | 8.86 kB / 2.97 kB gzipped — **deferred** ✅ |
| Vendor chunk hashes | stable | stable — **unchanged** ✅ |
| Build time | ~625ms | ~676ms |

### Key Observations

- `UserManagement-F2o7WvBh.js` now appears as a **separate lazy chunk** — only downloaded when a user first navigates to the Users page (`activeMenu === 'users'`).
- App code chunk (`index`) reduced: 141.40 kB → 134.44 kB (saved 6.96 kB raw / 1.2 kB gzipped).
- All vendor chunk hashes **unchanged** (`vendor-lucide`, `vendor-react`, `vendor-supabase`, `vendor-recharts` same hashes as Step 1) — confirms correct caching behavior; vendor updates don't bust app cache and vice versa.
- `Suspense` boundary is scoped tightly — only wraps `<UserManagement>` inside the `activeMenu === 'users'` conditional. Other pages are completely unaffected.
- Props are identical (`currentUserId={profile?.id || null}`). Behavior is unchanged.

### Lint Verification
- `npm run lint` — 43 pre-existing errors. **No new errors introduced.** Count unchanged from Step 1.

### Files Changed in Step 2
- `src/App.jsx` — 3 targeted edits (import line, lazy declaration, Suspense wrapper)
- `docs/performance/bundle-size-audit.md` — updated to record Step 2 results

---

## 15. Phase 0.4B Step 3A — Actual Results (2026-05-23)

### What Changed

`Dashboard` component and its exclusive sub-components extracted from `src/App.jsx` into `src/modules/dashboard/Dashboard.jsx`. Dashboard is still **statically imported** in this step — no lazy loading yet.

**Files created:**
- `src/modules/dashboard/Dashboard.jsx` — self-contained module (~300 lines)

**Files modified:**
- `src/App.jsx` — removed recharts import block, added static `import Dashboard from './modules/dashboard/Dashboard'`, removed `function Dashboard(...)`, `function FinancialCard(...)`, `function AlertCard(...)`, `function ChartCard(...)`, `function EmptyChart(...)`, `function CustomTooltip(...)`. Also removed `Check` and `TrendingUp` from lucide import (were only used by extracted components).

**Kept in App.jsx:** `KPICard`, `StatusBadge` (used by FinancePage, ARTrackerPage, Manifest, SPSidePanel, ShipmentPage — deduplication deferred to Phase 0.5).

### Key Design Decision — Self-Contained Dashboard.jsx

`Dashboard.jsx` does **not** import from `App.jsx`. It contains local copies of:
- `PASTEL` color tokens
- `formatRupiah`, `formatRupiahShort`, `formatNumber`, `formatDateID`, `monthLabel`
- `KPICard`, `StatusBadge`

This is intentional. If `Dashboard.jsx` imported from `App.jsx`, then `React.lazy(() => import('./modules/dashboard/Dashboard'))` in Step 3B would create a circular dependency and break the bundle. Self-containment is the prerequisite for Step 3B.

The duplicate copies of `KPICard`, `StatusBadge`, PASTEL, and formatters will be extracted to shared files in Phase 0.5.

### Build Result After Step 3A

```
$ npm run build

> storbit-manifest@0.0.0 build
> vite build

vite v8.0.11 building client environment for production...
✓ 2340 modules transformed.

dist/index.html                             0.89 kB │ gzip:   0.40 kB
dist/assets/index-Dtb_zCIb.css             16.48 kB │ gzip:   4.21 kB
dist/assets/rolldown-runtime-S-ySWqyJ.js    0.69 kB │ gzip:   0.42 kB
dist/assets/UserManagement-D7UmdP7A.js      8.86 kB │ gzip:   2.97 kB
dist/assets/vendor-lucide-LJsMC_yj.js       9.26 kB │ gzip:   3.60 kB
dist/assets/index-DByPstR4.js             136.69 kB │ gzip:  28.85 kB
dist/assets/vendor-react-YvL5Yovn.js      189.64 kB │ gzip:  59.65 kB
dist/assets/vendor-supabase-CDoftGUu.js   196.30 kB │ gzip:  50.02 kB
dist/assets/vendor-recharts-DGGvIi-s.js   386.98 kB │ gzip: 110.99 kB

✓ built in 596ms
```

**No warnings. Build PASS. ✅**

### Before vs After Comparison (Step 2 → Step 3A)

| Metric | After Step 2 | After Step 3A |
|--------|-------------|---------------|
| JS chunks | 8 | 8 (unchanged — Dashboard still static) |
| Warning | ✅ None | ✅ None |
| Modules transformed | 2339 | 2340 (+1 — new Dashboard.jsx module) |
| Largest chunk | 386.98 kB (`vendor-recharts`) | 386.98 kB (`vendor-recharts`) |
| App code chunk (`index`) | 134.44 kB | 136.69 kB (+2.25 kB — Dashboard.jsx local copies) |
| Recharts loaded | At startup | At startup (no change — static import) |
| `vendor-recharts` hash | `BK9OrOl0` | `DGGvIi-s` (changed — import graph moved) |

### Key Observations

- **Chunk count unchanged** — Dashboard is still statically imported, so it remains in the `index` bundle. No new split chunk appears. This is expected for Step 3A.
- **Index chunk slightly larger** (+2.25 kB raw) — Dashboard.jsx has local copies of PASTEL, formatters, KPICard, StatusBadge. These overlap with App.jsx. The duplication is ~2 kB and is intentional — it will be resolved in Phase 0.5 when shared utilities are extracted.
- **`vendor-recharts` hash changed** — Moving the recharts import from `App.jsx` to `Dashboard.jsx` altered the module dependency graph slightly, causing Rolldown to re-hash the vendor chunk. Content is identical; this is a one-time cache bust on first deploy.
- **Recharts still loads at startup** — This will be resolved in Step 3B when `React.lazy()` is applied to the Dashboard import. That is the step that actually defers the 110.99 kB recharts chunk.

### Lint Verification

`npm run lint` — 43 pre-existing errors. **No new errors.** Count unchanged.

Note: During extraction, `Check` and `TrendingUp` lucide icons became unused in `App.jsx` (they were only used by the extracted Dashboard sub-components). These were removed from the import — correctly reducing the count back to baseline.

### Files Changed in Step 3A

- `src/modules/dashboard/Dashboard.jsx` — **created** (~300 lines, self-contained)
- `src/App.jsx` — recharts imports removed, Dashboard static import added, 6 Dashboard sub-components removed, 2 unused lucide icons removed
- `docs/performance/bundle-size-audit.md` — updated to record Step 3A results

### Next Step: Step 3B — Apply React.lazy() to Dashboard

Step 3B is the **high-impact** step:
- Change `import Dashboard from './modules/dashboard/Dashboard'` to `const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'))`
- Wrap `{activeMenu === 'dashboard' && <Dashboard ... />}` in `<Suspense>`
- Expected result: `vendor-recharts` (110.99 kB gzipped) is **no longer downloaded at startup** — only when the user first visits the Dashboard page
- App code chunk should shrink ~50–80 kB (Dashboard.jsx code also deferred)
- Users who never visit the Dashboard page pay zero cost for Recharts

---

## 16. Phase 0.4B Step 3B — Actual Results (2026-05-23)

### What Changed

Two targeted edits to `src/App.jsx` only. `Dashboard.jsx` was not touched.

**Edit 1 — Convert static import to lazy dynamic import (line 13):**
```js
// Before:
import Dashboard from './modules/dashboard/Dashboard';

// After:
const Dashboard = lazy(() => import('./modules/dashboard/Dashboard'));
```

**Edit 2 — Wrap Dashboard render in Suspense (line 1024):**
```jsx
// Before:
{activeMenu === 'dashboard' && <Dashboard stats={stats} groupedSP={...} filterMonth={filterMonth}/>}

// After:
{activeMenu === 'dashboard' && (
  <Suspense fallback={
    <div style={{ padding: '3rem', textAlign: 'center', fontSize: '0.875rem', color: '#9C948D' }}>
      Loading...
    </div>
  }>
    <Dashboard stats={stats} groupedSP={...} filterMonth={filterMonth}/>
  </Suspense>
)}
```

`Suspense` and `lazy` were already imported from Step 2 — no import changes needed.

All Dashboard props (`stats`, `groupedSP`, `filterMonth`) are identical — prop contract unchanged.

### Build Result After Step 3B

```
$ npm run build

> storbit-manifest@0.0.0 build
> vite build

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

✓ built in 624ms
```

**No warnings. Build PASS. ✅**

### Initial HTML Verification

`dist/index.html` module preloads (what the browser downloads on every startup):

```html
<script type="module" src="/assets/index-BCim19mA.js"></script>
<link rel="modulepreload" href="/assets/rolldown-runtime-S-ySWqyJ.js">
<link rel="modulepreload" href="/assets/vendor-supabase-CDoftGUu.js">
<link rel="modulepreload" href="/assets/vendor-react-YvL5Yovn.js">
<link rel="modulepreload" href="/assets/vendor-lucide-LJsMC_yj.js">
```

**`vendor-recharts` is NOT in `index.html` — confirmed deferred. ✅**
**`Dashboard` chunk is NOT in `index.html` — confirmed deferred. ✅**

Both `Dashboard-DVMQJPnO.js` and `vendor-recharts-LsVsUfOu.js` are only downloaded when the user first clicks the Dashboard menu item.

### Before vs After Comparison (Step 3A → Step 3B)

| Metric | After Step 3A | After Step 3B |
|--------|--------------|---------------|
| JS chunks | 8 | 10 |
| Warning | ✅ None | ✅ None |
| Modules transformed | 2340 | 2340 (unchanged) |
| Largest chunk | 386.98 kB (`vendor-recharts`) | 386.98 kB (`vendor-recharts`) — deferred |
| App code chunk (`index`) | 136.69 kB / 28.85 kB gz | 122.41 kB / 26.15 kB gz (-14.28 kB raw, -2.70 kB gz) |
| Dashboard chunk | — (in index) | 14.65 kB / 3.84 kB gz — **deferred** ✅ |
| `vendor-recharts` in startup | ✅ Yes (static import) | ❌ No — **deferred with Dashboard** ✅ |
| `vendor-recharts` in index.html | Yes | **No** ✅ |

### Full Phase 0.4B Progress Summary

| Step | Action | Initial JS (gzip) | Largest Chunk | Warning |
|------|--------|------------------|--------------|---------|
| Baseline | No splitting | 252.45 kB | 924.65 kB | ⚠️ |
| Step 1 | Vendor chunk split | ~253.63 kB | 386.98 kB | ✅ |
| Step 2 | Lazy UserManagement | ~253.63 kB | 386.98 kB | ✅ |
| Step 3A | Extract Dashboard (static) | ~253.63 kB | 386.98 kB | ✅ |
| **Step 3B** | **Lazy Dashboard** | **~139.84 kB** | **386.98 kB (deferred)** | **✅** |

> Steps 1–3A focused on structure and caching correctness. **Step 3B delivers the actual startup performance win**: initial JS drops from ~253 kB to ~139 kB gzipped — a **-113 kB / -45% reduction** in startup download.

### Initial JS at Startup — Step 3B Breakdown

| Chunk | Gzipped | Loaded at startup |
|-------|---------|-------------------|
| `rolldown-runtime` | 0.42 kB | ✅ Always |
| `vendor-lucide` | 3.60 kB | ✅ Always |
| `index` (app code) | 26.15 kB | ✅ Always |
| `vendor-react` | 59.65 kB | ✅ Always |
| `vendor-supabase` | 50.02 kB | ✅ Always |
| **Total startup JS** | **139.84 kB** | |
| `Dashboard` | 3.84 kB | 🕐 On first Dashboard visit |
| `UserManagement` | 2.97 kB | 🕐 On first Users visit |
| `vendor-recharts` | 110.99 kB | 🕐 On first Dashboard visit |

### Lint Verification

`npm run lint` — 43 pre-existing errors. **No new errors introduced.** Count unchanged from Step 3A.

### Files Changed in Step 3B

- `src/App.jsx` — 2 targeted edits (static import → `lazy()`, Dashboard render wrapped in `<Suspense>`)
- `docs/performance/bundle-size-audit.md` — Section 16 added with Step 3B results

### Performance Impact

| Metric | Before Phase 0.4B | After Step 3B |
|--------|------------------|---------------|
| Initial JS download (gzip) | 252.45 kB | **139.84 kB** |
| Initial JS reduction | — | **-112.61 kB (-44.6%)** |
| Recharts load timing | Always at startup | First Dashboard visit only |
| Dashboard code load timing | Always at startup | First Dashboard visit only |
| Parse cost at startup | All 924 kB parsed | Only 122.41 kB (index) + vendor chunks parsed |
| Users who never visit Dashboard | Pay full Recharts cost | Pay **zero** Recharts cost |

### Security Impact

None. This change is purely a loading strategy change. No data access patterns, permissions, authentication, or RLS policies were modified. The lazy-loaded chunks are served from the same origin as the initial bundle.
