# CLAUDE.md

## Project Identity

Product Name: Nexus by MSI  
Tagline: Unified Business Core Platform

This project is transitioning from the existing Storbit Manifest application into Nexus by MSI, an end-to-end ERP Core Platform for MSI Group.

Nexus by MSI is designed to become the unified internal business platform for MSI Group, covering master data, transactions, workflows, approvals, operations, finance, reporting, audit trails, performance, security, and future API integrations across multiple entities.

---

## Business Entities

The platform must support multi-company and multi-entity operations from the beginning.

| Entity | Business Focus |
|---|---|
| MSI | Freight Forwarding |
| JCI | PPJK / Customs Clearance |
| Storbit / SBI | General Trading |

Each entity may have different business processes, but the system must support connected group-level operations and consolidated reporting where permitted.

---

## Long-Term Product Direction

Nexus by MSI is intended to become an end-to-end ERP Core Platform covering:

- Foundation Core
- Organization & Access Control
- Master Data Management
- CRM & Customer Inquiry
- Quotation Management
- Sales Order / Surat Pesanan
- Job / Operation Management
- Freight Forwarding
- PPJK / Customs Clearance
- General Trading
- Procurement
- Purchase Order
- Inventory / Warehouse
- Vendor Management
- Job Costing
- Billing / Invoice
- AR / Collection
- AP / Vendor Invoice
- Cash / Bank
- Accounting
- Asset Management
- HRGA Request
- IT Service Management
- Approval Center
- Document Management
- API & Integration Center
- Public Tracking API
- Customer / Vendor Portal
- Reporting & Dashboard
- Performance & Cache Layer
- Audit & Compliance

The first foundation module to prioritize is Master Data.

---

## Current Project Context

The existing application started as Storbit Manifest.

Current assumed stack:

- React
- Vite
- TailwindCSS
- Supabase
- Supabase Auth
- Supabase RLS
- Vercel deployment
- GitHub source control

Existing project may already include modules such as:

- Dashboard
- Manifest / SP
- Shipment
- Finance
- Outstanding
- AR Tracker
- Customer
- User Management

Important existing risks:

- App.jsx may still be monolithic.
- Current data layer may not yet be fully modular.
- Current documentation may be incomplete.
- Audit log may exist but may not be fully implemented.
- Testing and deployment readiness may still need improvement.

Do not perform a big-bang rewrite.

---

## Core Engineering Principles

All work on this project must follow these principles:

1. Multi-company by design
2. Master data first
3. End-to-end business process mapping
4. Approval-driven workflow
5. Document numbering standard
6. Audit everything important
7. Soft delete by default
8. Granular role-permission
9. API-ready architecture
10. Finance impact ready
11. Reporting-ready data structure
12. Dev / staging / production separation
13. Modular frontend
14. Domain-based service and data layer
15. Server-side pagination and search
16. Performance-first data fetching
17. Safe caching strategy
18. Secure by default
19. Observable and monitorable
20. Smooth incremental migration from existing Storbit Manifest

---

## Non-Negotiable Safety Rules

Do not do any of the following unless explicitly instructed:

1. Do not rewrite the entire application.
2. Do not rewrite App.jsx in one large change.
3. Do not change database schema without explicit approval.
4. Do not change Supabase RLS policies without explicit approval.
5. Do not weaken RLS to make something work.
6. Do not expose secrets.
7. Do not expose Supabase service role keys in frontend code.
8. Do not install new dependencies without explicit approval.
9. Do not redesign the UI unless the task specifically asks for UI work.
10. Do not change production deployment settings without explicit approval.
11. Do not push or deploy unless explicitly instructed.
12. Do not remove existing working features unless explicitly instructed.
13. Do not hard-delete business data.
14. Do not bypass permission checks.
15. Do not create public API endpoints that return raw internal database rows.

---

## Development Workflow

For every task, follow this workflow:

1. Inspect first
   - Check current branch.
   - Check git status.
   - Inspect relevant files.
   - Understand existing structure before editing.

2. Plan second
   - Explain intended changes.
   - Keep scope small and phase-based.
   - Avoid large multi-purpose changes.

3. Edit third
   - Modify only files required by the task.
   - Prefer incremental, low-risk changes.
   - Do not change unrelated code.

4. Verify fourth
   - Run available build/test/lint commands.
   - If a command is not available, state that clearly.
   - If a command fails, explain the exact failure and likely cause.

5. Summarize fifth
   - Summarize what changed.
   - List files changed.
   - Explain verification result.
   - Explain risk level.
   - Recommend the next step.

---

## Standard Output Format After Every Task

After completing any task, respond using this format:

Summary:
- ...

Files changed:
- ...

Verification:
- ...

Risk level:
- Low / Medium / High

What was intentionally not changed:
- ...

Next recommended step:
- ...

---

## Performance Requirements

Performance is a first-class requirement.

Rules:

1. Do not fetch all rows for large list pages.
2. Use server-side pagination for large tables.
3. Use server-side search, filter, and sort.
4. Use debounce for search inputs.
5. Avoid select * for large list queries.
6. Select only required columns where possible.
7. Use proper database indexes for frequent filters.
8. Use lazy loading / code splitting for large modules.
9. Use aggregate queries or materialized views for heavy dashboards.
10. Do not compute heavy reports entirely in frontend components.
11. Do not render thousands of table rows directly.
12. Use private storage and signed URLs for attachments.
13. Public API responses must be lightweight and masked.
14. Cache only where safe.
15. Never cache sensitive data carelessly.

Recommended important indexes for future transaction tables:

- company_id
- company_id + status
- company_id + created_at
- company_id + document_no
- customer_id
- vendor_id
- created_by
- deleted_at
- status

---

## Caching Strategy

Caching must be used carefully.

| Data Type | Caching Rule |
|---|---|
| Master data | Safe short-to-medium cache |
| Dashboard aggregate | Short cache |
| Transaction list | Short cache or refetch |
| Finance data | Very careful, avoid long cache |
| Audit log | Do not cache carelessly |
| Public tracking status | Short public-safe cache |
| Attachment signed URL | Short expiry |
| Permission/session data | Short cache, refetch on login/role change |

---

## Security Requirements

Security is mandatory.

Rules:

1. Use Supabase Auth.
2. MFA is required for admin, BOD, Finance Controller, and Head Level roles.
3. RLS must be company-scoped and role-aware.
4. Permission must be granular.
5. Do not rely only on frontend permission checks.
6. Audit all important actions.
7. Use soft delete by default for business data.
8. Important delete actions require approval.
9. Export must be restricted to Head Level and explicitly allowed roles.
10. Attachments must use private buckets and signed URLs.
11. Public APIs must use data masking and rate limiting.
12. API keys must be stored securely and must be rotatable.
13. Never expose service role keys in frontend code.
14. Never weaken RLS just to make code work.
15. Inactive users must be blocked or logged out.
16. Dev, staging, and production environments must be separated.
17. Error monitoring must be included in the strategy.
18. RLS must be reviewed before production changes.

Mandatory audit events:

- login
- logout
- create
- update
- delete
- soft_delete
- restore
- submit
- approve
- reject
- revise
- export
- import
- attachment_upload
- attachment_delete
- role_change
- permission_change
- api_request
- public_tracking_access

---

## Public API Rules

Nexus may later provide APIs for website tracking, customer portal, vendor portal, and integrations.

Public API must never expose internal raw rows.

Public API must not expose:

- vendor cost
- profit
- margin
- finance notes
- internal notes
- PIC internal
- customer credit limit
- audit logs
- private attachments
- internal approval history

Use DTOs for public response.

Example future public tracking flow:

Website
→ GET /api/public/tracking/{tracking_token}
→ Nexus API / Edge Function
→ validate token
→ fetch shipment public view
→ return masked DTO
→ log request

---

## Document Numbering Direction

Default document numbering format:

{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}

Examples:

- QT/MSI/SLS/2026/0001
- SP/MSI/SLS/2026/0001
- SHP/MSI/LOG/2026/0001
- CUS/JCI/PPJK/2026/0001
- PR/MSI/IT/2026/0001
- PO/STB/PROC/2026/0001
- INV/JCI/FIN/2026/0001
- RMB/MSI/FIN/2026/0001
- AST/MSI/IT/2026/0001
- TCK/MSI/IT/2026/0001

---

## Approval Direction

Approval must be designed as a reusable engine, not hardcoded per module.

Approval should support:

- Company-based rules
- Department-based rules
- Document-type-based rules
- Amount-based rules
- Role-based rules
- Specific user approvers
- Backup approvers
- Delegation
- Revision after submit
- Comment history
- Approval history

Default status lifecycle:

- draft
- submitted
- under_review
- revision_requested
- revised
- approved
- rejected
- cancelled
- completed
- archived

---

## Documentation Direction

Technical documentation should live in the repo under docs/.

Target documentation structure:

docs/
├── architecture/
├── database/
├── security/
├── workflow/
├── integration/
├── performance/
└── operations/

Business workflow documents may also be maintained in Google Docs for management review, but the technical source of truth should be in the repo.

---

## Phase Roadmap

### Phase 0.0 — Initial Project Instructions

Output:
- Initial CLAUDE.md
- No source code changes
- No database changes

### Phase 0.1 — Documentation Foundation

Output:
- docs/architecture/
- docs/database/
- docs/security/
- docs/workflow/
- docs/integration/
- docs/performance/
- docs/operations/
- README update
- .env.example

### Phase 0.2 — Final CLAUDE.md

Output:
- Update CLAUDE.md to reference created docs.
- Define required reading before coding.
- Define stricter workflow per task type.

### Phase 0.3 — Claude Agents

Output:
- .claude/agents/
- Architecture auditor
- Security reviewer
- Performance reviewer
- Docs maintainer
- QA/build tester
- Refactor planner
- React UI refactorer

### Phase 0.4 — Low-Risk Refactor

Output:
- Extract constants
- Extract formatting utils
- Extract calculation utils
- No behavior change

### Phase 0.5 — Stability & Performance Audit

Output:
- ErrorBoundary
- Data fetching audit
- Pagination/search/indexing risk
- Inactive user flow check

### Phase 1.0 — Master Data Foundation

Output:
- Company
- Branch
- Department
- Position
- Employee/User
- Customer
- Vendor
- Product/Service
- Document Type
- Status Catalog

---

## Current Phase

Current phase:

Phase 0.0 — Initial Project Instructions

The next recommended step after this file is created:

Phase 0.1 — Documentation Foundation

---

## Final Reminder

This project must be evolved carefully.

Do not build all ERP modules at once.

Plan end-to-end, but build foundation first.

Always prioritize:

- Security
- Performance
- Auditability
- Scalability
- Maintainability
- Business process correctness
