# Nexus by MSI — Module Map

**Last Updated:** 2026-05-23

---

## Overview

This document maps all planned modules in Nexus by MSI, their ownership, dependencies, and current status.

---

## Module Hierarchy

```
Nexus by MSI
├── Foundation
│   ├── Foundation Core
│   ├── Organization & Access Control
│   └── Master Data Management
├── Sales & CRM
│   ├── CRM & Customer Inquiry
│   ├── Quotation Management
│   └── Sales Order / Surat Pesanan
├── Operations
│   ├── Job / Operation Management
│   ├── Freight Forwarding (MSI)
│   ├── PPJK / Customs Clearance (JCI)
│   └── General Trading (SBI)
├── Procurement
│   ├── Procurement
│   ├── Purchase Order
│   ├── Inventory / Warehouse
│   └── Vendor Management
├── Finance
│   ├── Job Costing
│   ├── Billing / Invoice
│   ├── AR / Collection
│   ├── AP / Vendor Invoice
│   ├── Cash / Bank
│   └── Accounting
├── Support Modules
│   ├── Asset Management
│   ├── HRGA Request
│   └── IT Service Management
└── Platform
    ├── Approval Center
    ├── Document Management
    ├── API & Integration Center
    ├── Public Tracking API
    ├── Customer / Vendor Portal
    ├── Reporting & Dashboard
    ├── Performance & Cache Layer
    └── Audit & Compliance
```

---

## Module Detail Table

| Module ID | Module Name | Entity Scope | Depends On | Phase | Priority | Status |
|-----------|-------------|-------------|-----------|-------|----------|--------|
| FOUND-01 | Foundation Core | All | — | 0.x | Critical | In Progress |
| FOUND-02 | Organization & Access Control | All | FOUND-01 | 1.0 | Critical | Planned |
| FOUND-03 | Master Data Management | All | FOUND-01, FOUND-02 | 1.0 | Critical | Planned |
| CRM-01 | CRM & Customer Inquiry | All | FOUND-03 | 2.0 | High | Planned |
| SALES-01 | Quotation Management | All | CRM-01 | 2.0 | High | Planned |
| SALES-02 | Sales Order / Surat Pesanan | All | SALES-01 | 2.0 | High | Planned |
| OPS-01 | Job / Operation Management | All | SALES-02 | 2.0 | High | Planned |
| OPS-02 | Freight Forwarding | MSI | OPS-01 | 2.0 | High | Partial (Storbit Manifest) |
| OPS-03 | PPJK / Customs Clearance | JCI | OPS-01 | 2.0 | High | Planned |
| OPS-04 | General Trading | SBI | OPS-01 | 2.0 | High | Planned |
| PROC-01 | Procurement | All | FOUND-03 | 3.0 | Medium | Planned |
| PROC-02 | Purchase Order | All | PROC-01 | 3.0 | Medium | Planned |
| PROC-03 | Inventory / Warehouse | SBI, MSI | PROC-02 | 3.0 | Medium | Planned |
| PROC-04 | Vendor Management | All | FOUND-03 | 1.0 | High | Planned |
| FIN-01 | Job Costing | All | OPS-01 | 3.0 | High | Planned |
| FIN-02 | Billing / Invoice | All | FIN-01 | 3.0 | Critical | Planned |
| FIN-03 | AR / Collection | All | FIN-02 | 3.0 | Critical | Partial (Storbit Manifest) |
| FIN-04 | AP / Vendor Invoice | All | PROC-02 | 3.0 | Critical | Planned |
| FIN-05 | Cash / Bank | All | FIN-03, FIN-04 | 3.0 | Critical | Planned |
| FIN-06 | Accounting | All | FIN-05 | 4.0 | Critical | Planned |
| SUPP-01 | Asset Management | All | FOUND-03 | 4.0 | Low | Planned |
| SUPP-02 | HRGA Request | All | FOUND-02 | 4.0 | Low | Planned |
| SUPP-03 | IT Service Management | All | FOUND-02 | 4.0 | Low | Planned |
| PLAT-01 | Approval Center | All | FOUND-02 | 1.0 | Critical | Planned |
| PLAT-02 | Document Management | All | FOUND-01 | 2.0 | Medium | Planned |
| PLAT-03 | API & Integration Center | All | All Modules | 4.0 | Medium | Planned |
| PLAT-04 | Public Tracking API | MSI, JCI | OPS-01 | 3.0 | Medium | Planned |
| PLAT-05 | Customer / Vendor Portal | All | PLAT-04 | 4.0 | Low | Planned |
| PLAT-06 | Reporting & Dashboard | All | All Modules | 3.0 | High | Partial (Storbit Manifest) |
| PLAT-07 | Performance & Cache Layer | All | All Modules | Ongoing | Critical | Ongoing |
| PLAT-08 | Audit & Compliance | All | All Modules | Ongoing | Critical | Ongoing |

---

## Existing Storbit Manifest Modules

The following modules currently exist in the Storbit Manifest app and need to be migrated or stabilized into the Nexus architecture:

| Existing Module | Target Nexus Module | Migration Status |
|----------------|---------------------|-----------------|
| Dashboard | PLAT-06 Reporting & Dashboard | Partial |
| Manifest / SP | OPS-02 Freight Forwarding | Partial |
| Shipment | OPS-01 Job / Operation Management | Partial |
| Finance | FIN-02 Billing / Invoice | Partial |
| Outstanding | FIN-03 AR / Collection | Partial |
| AR Tracker | FIN-03 AR / Collection | Migrated to Supabase |
| Customer | FOUND-03 Master Data (Customer) | Migrated to Supabase |
| User Management | FOUND-02 Organization & Access Control | Partial |

---

## Notes

- Phase 1.0 must complete Foundation before any transaction module starts.
- Approval Center (PLAT-01) must be built before any document submission flow.
- All modules must implement RLS company-scope from day one.
- Performance & Audit are cross-cutting concerns, not standalone phases.
