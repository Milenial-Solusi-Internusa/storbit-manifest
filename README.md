# Nexus by MSI

**Unified Business Core Platform**

---

## Project Overview

This repository is transitioning from **Storbit Manifest** into **Nexus by MSI** — an end-to-end ERP Core Platform for MSI Group.

Nexus by MSI is the unified internal business platform covering master data, transactions, workflows, approvals, operations, finance, reporting, audit trails, security, and future API integrations across multiple business entities.

---

## Business Entities

| Entity | Name | Business Focus |
|--------|------|---------------|
| MSI | PT Milenial Solusi Internusa | Freight Forwarding |
| JCI | PT Jago Custom Indonesia | PPJK / Customs Clearance |
| SOA | PT Stuja Orbit Abadi | General Trading (formerly SBI/Storbit) |

---

## Current Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 19.x |
| Build Tool | Vite | 8.x |
| CSS Framework | TailwindCSS | 3.x |
| Icons | Lucide React | 1.x |
| Charts | Recharts | 3.x |
| Backend / Database | Supabase (PostgreSQL) | 2.x |
| Auth | Supabase Auth | — |
| RLS | Supabase Row Level Security | — |
| Server logic | Supabase Edge Functions (Deno) | — |
| File storage | Supabase Storage (private + avatars) | — |
| Hosting | Vercel — auto-deploy from `main` → `nexus.msigroup.co.id` | — |
| Source Control | GitHub (`main` = production) | — |

---

## Architecture Highlights

- **Single master customer** — `accounts` is the unified master for both CRM and Storbit (SP/AR). Rows carry `account_status` (`prospect` / `customer` / `lost` / `free_agent` / `lead_pool`); a WON prospect auto-converts to `customer`. The legacy `prospects` and `customers` tables are retired.
- **Role via `user_roles`** — permissions are sourced purely from `user_roles` (13 ERP roles) and a hierarchical RBAC model (modules → menus → actions → `user_menu_permissions`). The legacy `profiles.role` column is deprecated and no longer read by the app.
- **Modular frontend** — feature modules under `src/modules/` (admin, assets, crm, dashboard, hrga, inventory, launcher, logistics); data-access layer in `src/lib/db.js`; lazy-loaded module shells.
- **RLS** — active and company/role-scoped on `accounts` and master/org tables; super_admin reads cross-company via top-level `is_super_admin()` bypass.
- **Responsive (mobile/desktop)** — below 1024px the shell stacks (mobile topbar + hamburger drawer for the module menu, App Launcher full-width), and dashboards/grids reflow via opt-in `@media (max-width: 1023px)` helpers in `index.css`. Desktop (≥1024px) is unchanged. DB schema source of truth: `supabase/schema_snapshot.sql` (see `CLAUDE.md` → DB Schema Reference).

## Active Modules

Auth + RLS · Master Data (Companies, Branches, Departments, Positions, Roles, Users, Products) · CRM (Pipeline, Inquiry, Quotation, Dashboard, Master Customer, Lead Pool, Sales Calls) · Logistics (Sales Order / SP) · Inventory (Dashboard, Stok Barang, Penerimaan) · Asset Management (IT/Kendaraan detail + inline edit) · HRGA Request · App Launcher.

### Indomarco Dashboard (cross-module: CRM + SP data)

Internal presentation dashboard for the Indomarco account (used by the MSI team when meeting Indomarco — **not** customer-accessible). Aggregates the `sp_items` table (filtered by Indomarco's `customer_id`) into four KPI cards (Total SP, Unit Dipesan, Volume Terealisasi, Jangkauan DC), a "DC Teratas" bar, a per-month SP trend area, and a per-region reach donut.

- **Page:** [`src/modules/crm/IndomarcoDashboardPage.jsx`](src/modules/crm/IndomarcoDashboardPage.jsx) · menu id `indomarco-dashboard` (under CRM).
- **Access:** manager-or-above only (`super_admin`, `admin`, `ceo`, `gm`, `manager`, `supervisor`) via the existing menu `role` gate + `canRenderPage`. Sales and customers have no access.
- **Data:** the four KPIs and all charts come from the DB RPC `indomarco_dashboard_stats(p_customer_id)` — aggregation (`COUNT DISTINCT` / `SUM`) runs in the database over `sp_items` scoped by `customer_id`, replacing the earlier client-side aggregation over raw rows that was capped at `.limit(1000)` (which silently understated totals above 1000 rows). The customer-selector dropdown still reads `sp_items` directly.
- **Deliberately hidden:** prices, margin, cost, on-time rate, and any % fulfillment. `shipped_qty` is shown only as an absolute "Volume Terealisasi".
- **Pending:** the region donut uses placeholder data until the free-text `dc` → region mapping is finalized (see `PROGRESS.md`).

---

## Setup

### Prerequisites
- Node.js 20+
- npm 10+
- Supabase project (development)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/storbit-manifest.git
cd storbit-manifest

# Install dependencies
npm install
```

### Environment Variables

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_ENV=development
VITE_SENTRY_DSN=
```

> **Never commit `.env.local` to git.**  
> Never use production credentials in development.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |

---

## Development Workflow

Follow this workflow for every task:

1. **Inspect first** — check git status, current branch, and relevant files
2. **Plan second** — explain intended changes, keep scope small
3. **Edit third** — modify only required files, prefer incremental changes
4. **Verify fourth** — run `npm run build` and `npm run lint`
5. **Summarize fifth** — list files changed, risk level, and next step

### Branch Strategy (updated 2026-06-04)

```
main          ← production (Vercel auto-deploys from here)
  └─ fix/{name}   ← hotfixes, merged immediately to main
```

Solo-developer workflow: feature work is committed directly to `main`. No long-lived
feature branches — all phase-1 / phase-2 feature branches have been merged and deleted.

---

## Documentation

All technical documentation lives in `docs/`:

```
docs/
├── architecture/
│   ├── nexus-master-blueprint.md     ← Start here
│   ├── module-map.md
│   ├── business-process-map.md
│   ├── feature-registry.md
│   └── implementation-roadmap.md
├── database/
│   ├── core-schema-draft.md
│   ├── entity-map.md
│   └── indexing-strategy.md
├── security/
│   ├── security-baseline.md
│   ├── permission-matrix.md
│   ├── audit-log-policy.md
│   └── data-retention-policy.md
├── workflow/
│   ├── approval-engine.md
│   ├── document-numbering.md
│   └── status-lifecycle.md
├── integration/
│   ├── api-strategy.md
│   └── public-tracking-api.md
├── performance/
│   ├── performance-baseline.md
│   ├── caching-strategy.md
│   └── reporting-performance.md
└── operations/
    ├── deployment-strategy.md
    ├── environment-strategy.md
    ├── release-checklist.md
    └── monitoring-strategy.md
```

**Required reading before writing any code:**
- `docs/architecture/nexus-master-blueprint.md`
- `docs/security/security-baseline.md`
- `docs/performance/performance-baseline.md`
- `CLAUDE.md`

---

## Performance Requirements

- All list pages must use **server-side pagination**
- All search must be **server-side** and **debounced** (min 300ms)
- Never use `SELECT *` for large list queries
- Never compute heavy reports in frontend components
- Use database indexes for all frequent filters
- Use lazy loading for large modules

See `docs/performance/performance-baseline.md` for full requirements.

---

## Security Requirements

- All business tables must have **Supabase RLS** enabled
- The `anon` role has **no access** to sensitive tables (financial / RBAC / user / CRM / inventory) — `anon` GRANT revoked as defense-in-depth alongside RLS (2026-06-15)
- **Never expose the Supabase service role key** in frontend code (service-role logic lives in Edge Functions only)
- Permissions are enforced via `user_roles` + hierarchical RBAC — never rely on frontend checks alone
- MFA is required for Admin, CEO/Executive, Finance Controller, and Head Level roles
- All important actions must be logged in the audit log
- Use **soft delete** — never hard-delete business data
- Use **private storage buckets** with signed URLs for attachments
- **Never weaken RLS** to make code work

See `docs/security/security-baseline.md` for full requirements.

---

## Production Warning

> This application handles real business data for MSI Group.  
> Do not push or deploy to production without explicit approval.  
> Do not change database schema or RLS policies without review.  
> Do not expose production credentials in any file, log, or message.

---

## Current Phase

**Phase 2.5A — Customers → accounts migration (single master customer)** ✅ Complete

`CLAUDE.md` is the authoritative source for phase history and detailed decision log.
See `docs/architecture/implementation-roadmap.md` for the full roadmap.

---

## License

Private — MSI Group internal use only.
