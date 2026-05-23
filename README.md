# Nexus by MSI

**Unified Business Core Platform**

---

## Project Overview

This repository is transitioning from **Storbit Manifest** into **Nexus by MSI** — an end-to-end ERP Core Platform for MSI Group.

Nexus by MSI is the unified internal business platform covering master data, transactions, workflows, approvals, operations, finance, reporting, audit trails, security, and future API integrations across multiple business entities.

---

## Business Entities

| Entity | Business Focus |
|--------|---------------|
| MSI | Freight Forwarding |
| JCI | PPJK / Customs Clearance |
| Storbit / SBI | General Trading |

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
| Hosting | Vercel | — |
| Source Control | GitHub | — |

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

### Branch Strategy

```
main          ← production-ready
  └─ staging  ← QA / UAT
       └─ dev ← active development
            └─ feature/{name}
            └─ fix/{name}
            └─ docs/{name}
```

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
- **Never expose the Supabase service role key** in frontend code
- MFA is required for Admin, BOD, Finance Controller, and Head Level roles
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

**Phase 0.1 — Documentation Foundation** (In Progress)

See `docs/architecture/implementation-roadmap.md` for the full roadmap.

---

## License

Private — MSI Group internal use only.
