# Nexus by MSI — Implementation Roadmap

**Last Updated:** 2026-05-23

---

## Overview

This roadmap defines the phased implementation plan for Nexus by MSI. The strategy is incremental — foundation first, then transactions, then advanced features.

**Rule:** Do not build all ERP modules at once. Each phase must be stable before the next phase starts.

---

## Phase 0 — Foundation & Governance

### Phase 0.0 — Initial Project Instructions ✅ Complete
**Output:**
- CLAUDE.md with project identity, principles, safety rules, workflow
- No source code changes
- No database changes

### Phase 0.1 — Documentation Foundation 🔄 In Progress
**Output:**
- `docs/architecture/` — blueprint, module map, business process, feature registry, roadmap
- `docs/database/` — schema draft, entity map, indexing strategy
- `docs/security/` — baseline, permission matrix, audit policy, data retention
- `docs/workflow/` — approval engine, document numbering, status lifecycle
- `docs/integration/` — API strategy, public tracking API
- `docs/performance/` — baseline, caching, reporting
- `docs/operations/` — deployment, environments, release checklist, monitoring
- Updated README.md
- `.env.example`

### Phase 0.2 — Final CLAUDE.md
**Output:**
- Update CLAUDE.md to reference docs/
- Define required reading before coding
- Define stricter workflow per task type

### Phase 0.3 — Claude Agents
**Output:**
- `.claude/agents/` directory
- Architecture auditor agent
- Security reviewer agent
- Performance reviewer agent
- Docs maintainer agent
- QA/build tester agent
- Refactor planner agent
- React UI refactorer agent

### Phase 0.4 — Low-Risk Refactor
**Output:**
- Extract constants (no behavior change)
- Extract formatting utilities
- Extract calculation utilities
- No UI change, no schema change

### Phase 0.5 — Stability & Performance Audit
**Output:**
- Add ErrorBoundary to critical pages
- Audit data fetching patterns
- Identify missing pagination / search / indexing
- Identify inactive user flow gaps
- Document technical debt register

---

## Phase 1 — Master Data Foundation

### Phase 1.0 — Master Data Core
**Target completion:** Q3 2026  
**Prerequisites:** Phase 0.x complete

**Output:**
- Company setup (multi-company scaffold)
- Branch, Department, Position
- Employee / User with role assignment
- Customer master (with credit limit, payment terms)
- Vendor master
- Product / Service catalog
- Document Type configuration
- Status catalog
- Approval Center (reusable engine)
- Chart of Accounts (per company)
- Currency and Exchange Rate

**Database changes required (approval needed before each):**
- `companies` table
- `branches` table
- `departments` table
- `positions` table
- `employees` / `users` extension
- `customers` table (enhance existing)
- `vendors` table
- `products` table
- `document_types` table
- `status_catalog` table
- `approval_rules` table
- `approval_logs` table
- `chart_of_accounts` table
- `currencies` table
- `exchange_rates` table

---

## Phase 2 — Sales & Operations

### Phase 2.0 — CRM & Quotation
**Prerequisites:** Phase 1.0 complete

**Output:**
- Customer Inquiry / Lead
- Quotation with approval flow
- Quotation to SP conversion
- Sales Order / Surat Pesanan with approval

### Phase 2.1 — Job / Operation Management
**Prerequisites:** Phase 2.0 complete

**Output:**
- Job Card creation from SP
- Job status tracking
- Freight Forwarding job specifics (MSI)
- PPJK job specifics (JCI)
- General Trading fulfillment (SBI)
- Public tracking token (PLAT-04)

---

## Phase 3 — Finance

### Phase 3.0 — Job Costing & Invoicing
**Prerequisites:** Phase 2.1 complete

**Output:**
- Cost input per job
- Revenue vs cost view
- Invoice generation from job
- Invoice approval flow

### Phase 3.1 — AR / AP
**Prerequisites:** Phase 3.0 complete

**Output:**
- AR tracking and aging
- AP tracking and aging
- Payment recording
- Cash / Bank register

### Phase 3.2 — Procurement
**Prerequisites:** Phase 1.0 complete (can run parallel to 3.x)

**Output:**
- Purchase Request with approval
- Purchase Order with vendor confirmation
- Goods Receipt
- Vendor Invoice matching

---

## Phase 4 — Advanced Modules

### Phase 4.0 — Accounting
**Prerequisites:** Phase 3.x complete

**Output:**
- Journal entries (auto + manual)
- Trial Balance
- Financial Statements
- Period closing

### Phase 4.1 — Inventory / Warehouse
**Prerequisites:** Phase 3.2 complete

**Output:**
- Stock management (SBI primary)
- Stock movement
- Stock valuation

### Phase 4.2 — Asset Management
**Prerequisites:** Phase 3.0 complete

**Output:**
- Asset register
- Depreciation
- Disposal workflow

### Phase 4.3 — HRGA & IT Service Management
**Prerequisites:** Phase 1.0 complete

**Output:**
- HRGA request forms
- IT ticketing

---

## Phase 5 — Platform & Integration

### Phase 5.0 — API & Integration Center
**Output:**
- Public REST API (tracking, portal)
- Webhook support
- API key management

### Phase 5.1 — Customer / Vendor Portal
**Output:**
- Customer self-service portal
- Vendor self-service portal
- Public tracking page

### Phase 5.2 — Reporting & Dashboard Advanced
**Output:**
- Executive KPI dashboard
- Report builder
- Scheduled reports
- Export center (restricted)

---

## Ongoing — Cross-Cutting Concerns

These are not phases but continuous requirements throughout all phases:

| Concern | Action |
|---------|--------|
| Audit Log | Every create/update/delete/approve must be logged |
| RLS | Every new table must have company-scoped RLS from day one |
| Soft Delete | All business tables must use `deleted_at` |
| Performance | Every list query must be paginated server-side |
| Security | No service role key in frontend, no RLS bypass |
| Documentation | Every new feature must update feature-registry.md |
| Testing | Build must pass before merging |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-23 | Start with documentation foundation before any code | Safety and alignment first |
| 2026-05-23 | Incremental migration from Storbit Manifest, not rewrite | Reduce risk, preserve working features |
| 2026-05-23 | Multi-company by design from Phase 1.0 | Future-proof, avoid costly rework later |
| 2026-05-23 | Approval engine as reusable platform, not per-module | Consistency and maintainability |
