# Bundle Size Audit — Nexus by MSI

**Date:** 2026-05-23
**Phase:** 0.4A — Bundle Size Warning Audit
**Author:** Claude (audit only — no source code changes made)
**Status:** Audit complete. Phase 0.4B implementation plan included below.

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

**Start Phase 0.4B with Step 1: Add `manualChunks` to `vite.config.js`.**  
This is the lowest-risk change, requires editing only one config file, and immediately resolves the Vite 500 kB warning. Verify with `npm run build`.  
Then proceed to Step 2 (UserManagement lazy) and Step 3 (Dashboard extraction + lazy) in subsequent commits.
