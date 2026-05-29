# Nexus by MSI — Master Blueprint

**Product:** Nexus by MSI  
**Tagline:** Unified Business Core Platform  
**Version:** 0.1 (Documentation Foundation)  
**Last Updated:** 2026-05-23

---

## 1. Product Identity

Nexus by MSI is the unified internal business platform for MSI Group. It is being built as an end-to-end ERP Core Platform that covers the full lifecycle of business operations across multiple legal entities.

This platform transitions from the existing Storbit Manifest application into a production-grade, multi-company ERP system.

---

## 2. Business Entities

| Entity | Legal Name | Business Focus | Status |
|--------|-----------|---------------|--------|
| MSI | MSI Group (parent) | Freight Forwarding | Active |
| JCI | JCI | PPJK / Customs Clearance | Active |
| SBI | Storbit / SBI | General Trading | Active |

All entities share the same platform but operate with isolated data scoped by `company_id`. Group-level consolidated reporting is permitted where explicitly configured.

---

## 3. Strategic Direction

### 3.1 Core Mission
Build a secure, performant, auditable, multi-company ERP platform that supports MSI Group's end-to-end business operations — from lead generation to cash collection, from procurement to payment, from freight booking to customs clearance.

### 3.2 Transition Strategy
- **Do not rewrite all at once.** Migrate incrementally from Storbit Manifest.
- **Stabilize existing modules first** before adding new ERP layers.
- **Master Data is the foundation.** All transaction modules depend on it.
- **Approval Engine is the second foundation.** All document flows depend on it.

### 3.3 Architecture Principles
1. Multi-company by design — all tables scoped by `company_id`
2. Master data first — no transactions without clean master data
3. End-to-end business process mapping before coding
4. Approval-driven workflow — no mutation without a traceable state change
5. Standard document numbering — `{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}`
6. Audit everything important — immutable audit log
7. Soft delete by default — no permanent deletion of business data
8. Granular role-permission — beyond just admin/user
9. API-ready architecture — all domain logic exposed via clean service layer
10. Finance impact ready — all cost/revenue events traceable
11. Reporting-ready data structure — no retroactive aggregation pain
12. Dev / staging / production separation — strict environment isolation
13. Modular frontend — domain-based components, no monolithic pages
14. Domain-based service and data layer — one domain = one hook/service
15. Server-side pagination and search — no full table scans in UI
16. Performance-first data fetching — indexes, column selection, aggregation
17. Safe caching strategy — cache master data, never cache sensitive finance data carelessly
18. Secure by default — RLS, MFA, signed URLs, no service role key in frontend
19. Observable and monitorable — Sentry, Supabase logs, performance tracking
20. Smooth incremental migration from existing Storbit Manifest

---

## 4. Full ERP Scope

The target platform covers the following modules (long-term):

### Foundation
- Foundation Core
- Organization & Access Control
- Master Data Management

### Sales & CRM
- CRM & Customer Inquiry
- Quotation Management
- Sales Order / Surat Pesanan

### Operations
- Job / Operation Management
- Freight Forwarding
- PPJK / Customs Clearance
- General Trading

### Procurement
- Procurement
- Purchase Order
- Inventory / Warehouse
- Vendor Management

### Finance
- Job Costing
- Billing / Invoice
- AR / Collection
- AP / Vendor Invoice
- Cash / Bank
- Accounting

### Support Modules
- Asset Management
- HRGA Request
- IT Service Management

### Platform
- Approval Center
- Document Management
- API & Integration Center
- Public Tracking API
- Customer / Vendor Portal
- Reporting & Dashboard
- Performance & Cache Layer
- Audit & Compliance

---

## 5. Technology Stack

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
| Error Monitoring | Sentry (planned) | — |

---

## 6. Non-Negotiable Safety Rules

The following actions are prohibited unless explicitly instructed:

1. Do not rewrite the entire application
2. Do not rewrite App.jsx in one large change
3. Do not change database schema without explicit approval
4. Do not change Supabase RLS policies without explicit approval
5. Do not weaken RLS to make something work
6. Do not expose secrets
7. Do not expose Supabase service role keys in frontend code
8. Do not install new dependencies without explicit approval
9. Do not redesign the UI unless the task specifically asks for UI work
10. Do not change production deployment settings without explicit approval
11. Do not push or deploy unless explicitly instructed
12. Do not remove existing working features unless explicitly instructed
13. Do not hard-delete business data
14. Do not bypass permission checks
15. Do not create public API endpoints that return raw internal database rows

---

## 7. Phase Roadmap Summary

| Phase | Name | Status |
|-------|------|--------|
| 0.0 | Initial Project Instructions | ✅ Complete |
| 0.1 | Documentation Foundation | 🔄 In Progress |
| 0.2 | Final CLAUDE.md | Planned |
| 0.3 | Claude Agents | Planned |
| 0.4 | Low-Risk Refactor | Planned |
| 0.5 | Stability & Performance Audit | Planned |
| 1.0 | Master Data Foundation | Planned |

---

## 8. Related Documents

- [Module Map](./module-map.md)
- [Business Process Map](./business-process-map.md)
- [Feature Registry](./feature-registry.md)
- [Implementation Roadmap](./implementation-roadmap.md)
- [Core Schema Draft](../database/core-schema-draft.md)
- [Security Baseline](../security/security-baseline.md)
- [Performance Baseline](../performance/performance-baseline.md)
- [Approval Engine](../workflow/approval-engine.md)
