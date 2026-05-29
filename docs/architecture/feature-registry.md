# Nexus by MSI — Feature Registry

**Last Updated:** 2026-05-23

---

## Overview

The Feature Registry is the single source of truth for all planned features in Nexus by MSI. Every feature must be registered here before development begins.

---

## Registry Schema

Each feature entry must capture the following fields:

| Field | Description |
|-------|-------------|
| Feature ID | Unique ID, format: `{MODULE}-F{SEQ}` e.g. `FOUND-F001` |
| Module | Parent module |
| Feature Name | Short descriptive name |
| Business Purpose | Why this feature exists |
| User Roles | Who uses this feature |
| Input | What data or trigger starts this feature |
| Output | What this feature produces |
| Status Flow | Applicable status transitions |
| Approval Required | Yes / No / Conditional |
| Related Data | Master data or entities involved |
| Related Documents | Documents produced or consumed |
| Finance Impact | Finance tables affected (if any) |
| Audit Required | Yes / No |
| API Required | Yes / No / Future |
| Report Impact | Reports affected |
| Performance Concern | Known performance risks |
| Security Concern | Known security risks |
| Caching Rule | Cache strategy for this feature's data |
| Priority | Critical / High / Medium / Low |
| Phase | Target implementation phase |
| Notes | Additional notes |

---

## Foundation Core (FOUND-01)

| Feature ID | Feature Name | Business Purpose | User Roles | Approval | Finance Impact | Audit | Priority | Phase |
|------------|-------------|-----------------|-----------|----------|----------------|-------|----------|-------|
| FOUND-F001 | Company Management | Manage MSI Group entities | Super Admin | Yes | None | Yes | Critical | 1.0 |
| FOUND-F002 | Branch Management | Manage branches per company | Admin | Yes | None | Yes | High | 1.0 |
| FOUND-F003 | Department Management | Manage departments | Admin | Yes | None | Yes | High | 1.0 |
| FOUND-F004 | Position Management | Manage job positions | Admin | Yes | None | Yes | High | 1.0 |
| FOUND-F005 | Document Type Config | Configure document types and numbering | Super Admin | Yes | None | Yes | Critical | 1.0 |
| FOUND-F006 | Status Catalog | Manage system-wide status values | Super Admin | No | None | Yes | High | 1.0 |
| FOUND-F007 | System Settings | Global platform settings | Super Admin | Yes | None | Yes | Critical | 1.0 |

---

## Organization & Access Control (FOUND-02)

| Feature ID | Feature Name | Business Purpose | User Roles | Approval | Finance Impact | Audit | Priority | Phase |
|------------|-------------|-----------------|-----------|----------|----------------|-------|----------|-------|
| ORG-F001 | User Management | Create and manage user accounts | Admin | Yes | None | Yes | Critical | 1.0 |
| ORG-F002 | Role Management | Define roles and permissions | Super Admin | Yes | None | Yes | Critical | 1.0 |
| ORG-F003 | Permission Matrix | Assign permissions to roles | Super Admin | Yes | None | Yes | Critical | 1.0 |
| ORG-F004 | User Role Assignment | Assign roles to users | Admin | Yes | None | Yes | Critical | 1.0 |
| ORG-F005 | MFA Enforcement | Enforce MFA for sensitive roles | Super Admin | No | None | Yes | Critical | 1.0 |
| ORG-F006 | Inactive User Blocking | Block inactive/terminated users | System | No | None | Yes | Critical | 1.0 |
| ORG-F007 | Delegation | Delegate approval rights temporarily | Manager | Yes | None | Yes | High | 2.0 |

---

## Master Data Management (FOUND-03)

| Feature ID | Feature Name | Business Purpose | User Roles | Approval | Finance Impact | Audit | Priority | Phase |
|------------|-------------|-----------------|-----------|----------|----------------|-------|----------|-------|
| MDM-F001 | Customer Master | Manage customer records | Sales, Admin | Conditional | AR, Credit Limit | Yes | Critical | 1.0 |
| MDM-F002 | Vendor Master | Manage vendor records | Procurement, Admin | Conditional | AP | Yes | Critical | 1.0 |
| MDM-F003 | Product / Service Catalog | Manage product and service definitions | Admin | Yes | COGS, Revenue | Yes | Critical | 1.0 |
| MDM-F004 | Price List | Manage selling and cost price lists | Sales, Finance | Yes | Revenue, COGS | Yes | High | 1.0 |
| MDM-F005 | Port / Airport Master | Manage port and airport data | Operations | No | None | Yes | High | 1.0 |
| MDM-F006 | Carrier Master | Manage carrier (shipping line, airline) | Operations | No | None | Yes | High | 1.0 |
| MDM-F007 | Currency & Exchange Rate | Manage currency rates | Finance | Yes | All Finance | Yes | Critical | 1.0 |
| MDM-F008 | Chart of Accounts | Define GL accounts per company | Finance | Yes | All Finance | Yes | Critical | 1.0 |

---

## Approval Center (PLAT-01)

| Feature ID | Feature Name | Business Purpose | User Roles | Approval | Finance Impact | Audit | Priority | Phase |
|------------|-------------|-----------------|-----------|----------|----------------|-------|----------|-------|
| APPR-F001 | Approval Rule Config | Define approval rules per doc type | Super Admin | Yes | None | Yes | Critical | 1.0 |
| APPR-F002 | Submit for Approval | Trigger approval workflow | Any | N/A | None | Yes | Critical | 1.0 |
| APPR-F003 | Approve Document | Approve submitted document | Approver | N/A | None | Yes | Critical | 1.0 |
| APPR-F004 | Reject Document | Reject with reason | Approver | N/A | None | Yes | Critical | 1.0 |
| APPR-F005 | Request Revision | Send back for revision | Approver | N/A | None | Yes | Critical | 1.0 |
| APPR-F006 | Approval History | View full approval trail | All | N/A | None | Yes | High | 1.0 |
| APPR-F007 | Delegation | Temporary delegation of approval rights | Manager | Yes | None | Yes | High | 2.0 |
| APPR-F008 | Backup Approver | Configure backup when approver is absent | Admin | Yes | None | Yes | High | 2.0 |

---

## Reporting & Dashboard (PLAT-06)

| Feature ID | Feature Name | Business Purpose | User Roles | Approval | Finance Impact | Audit | Priority | Phase |
|------------|-------------|-----------------|-----------|----------|----------------|-------|----------|-------|
| RPT-F001 | Executive Dashboard | KPI overview for BOD | BOD, Director | No | Yes | Yes | High | 2.0 |
| RPT-F002 | AR Aging Report | Outstanding receivables | Finance, Head | No | AR | Yes | Critical | 1.0 |
| RPT-F003 | AP Aging Report | Outstanding payables | Finance, Head | No | AP | Yes | Critical | 2.0 |
| RPT-F004 | Job Performance Report | Revenue and cost per job | Operations, Finance | No | Yes | Yes | High | 2.0 |
| RPT-F005 | Export to Excel | Export report data | Head Level only | No | None | Yes | High | 2.0 |
| RPT-F006 | Report Snapshot | Scheduled report snapshots | System | No | None | Yes | Medium | 3.0 |

---

## Performance Concerns by Feature Type

| Feature Type | Performance Concern | Strategy |
|-------------|---------------------|----------|
| List / Table views | Full scan if no pagination | Server-side pagination mandatory |
| Search / Filter | Slow query without index | Indexed columns, debounced input |
| Dashboard aggregates | Heavy computation | Aggregate queries, short cache |
| Reports | Massive row computation | Snapshot or materialized view |
| Attachment list | Many signed URL calls | Lazy load, batch sign |
| Public tracking | High traffic | Rate limit, short cache, DTO masking |

---

## Security Concerns by Feature Type

| Feature Type | Security Concern | Strategy |
|-------------|-----------------|----------|
| Master data edit | Unauthorized change | RLS + permission check |
| Finance data view | Sensitive exposure | Role-based access + RLS |
| Export | Bulk data leak | Restricted to Head Level |
| Approval | Bypass | Server-side approval state check |
| Public API | Internal data leak | DTO masking, no raw rows |
| Attachments | Direct URL access | Private bucket + signed URL |
| User management | Role escalation | Audit + approval for role change |
