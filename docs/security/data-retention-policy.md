# Nexus by MSI — Data Retention Policy

**Last Updated:** 2026-05-23

---

## Overview

This document defines how long different types of data are retained in Nexus by MSI, when data is archived, and when it may be deleted.

**Key Principle:** Business and financial data must never be permanently deleted by users. Deletion is controlled by retention policy only, and only after required holding periods.

---

## 1. Retention Tiers

| Tier | Description | Storage |
|------|-------------|---------|
| Active | Immediately accessible, in main database | Supabase PostgreSQL |
| Archived | No longer active but retained for compliance | Cold storage / separate table |
| Deleted | Permanently removed after retention period | N/A |

---

## 2. Business Data Retention

### Master Data

| Data Type | Active Period | Archive After | Delete After | Notes |
|-----------|--------------|---------------|--------------|-------|
| Company | Forever | Never | Never | Core platform data |
| Customer (active) | While is_active = true | On deactivation | Never | Soft delete only |
| Customer (deleted) | — | On soft delete | 7 years | |
| Vendor (active) | While is_active = true | On deactivation | Never | |
| Vendor (deleted) | — | On soft delete | 7 years | |
| Product | While is_active = true | On deactivation | Never | |
| User Profile | While is_active = true | On deactivation | 5 years after deactivation | |
| Chart of Accounts | While in use | On deactivation | Never | |
| Exchange Rates | Forever | Never | Never | Historical rates needed for reporting |

### Transaction Data

| Data Type | Active Period | Archive After | Delete After | Notes |
|-----------|--------------|---------------|--------------|-------|
| Quotation | 2 years | 2 years | 7 years | |
| Sales Order | 5 years | 5 years | 10 years | |
| Job / Shipment | 5 years | 5 years | 10 years | |
| Invoice | 10 years | 5 years | 10 years | Indonesian tax law requires 10 years |
| AR Transaction | 10 years | 5 years | 10 years | |
| AP Transaction | 10 years | 5 years | 10 years | |
| Payment Record | 10 years | 5 years | 10 years | |
| Journal Entry | 10 years | 5 years | 10 years | Indonesian accounting regulation |
| Purchase Order | 5 years | 5 years | 10 years | |
| Goods Receipt | 5 years | 5 years | 10 years | |

---

## 3. Audit Log Retention

| Log Type | Delete After | Notes |
|----------|-------------|-------|
| Auth events (login/logout) | 2 years | |
| Data create/update | 5 years | |
| Approval events | 7 years | |
| Finance events | 10 years | |
| Export events | 2 years | |
| Role/Permission changes | 7 years | |
| Public API events | 90 days | High volume, short retention |
| Failed login events | 90 days | Security investigation window |

---

## 4. Attachment / File Retention

| File Type | Retention Period | Storage |
|-----------|-----------------|---------|
| Invoice PDF | 10 years | Private Supabase Storage |
| Customs documents (PIB/PEB) | 10 years | Private Supabase Storage |
| Shipping documents (BL, AWB) | 7 years | Private Supabase Storage |
| Purchase documents | 7 years | Private Supabase Storage |
| HR documents | 5 years after employee exit | Private Supabase Storage |
| Profile photos | While user is active | Private Supabase Storage |
| Temporary uploads | 7 days | Auto-delete |

---

## 5. Signed URL Policy

| Context | URL Expiry |
|---------|-----------|
| Business document access | 15 minutes |
| Profile photo | 1 hour |
| Bulk export download | 5 minutes |
| Public tracking attachment | Not allowed (no public attachment URLs) |

---

## 6. Soft Delete vs Archive vs Permanent Delete

### Soft Delete (`deleted_at IS NOT NULL`)
- Applied immediately when user initiates deletion
- Record remains in main table
- Invisible to normal queries
- Recoverable by Admin

### Archive
- Record moved to archive table or flagged as `is_archived = true`
- Accessible only via admin/compliance interface
- Not modifiable

### Permanent Delete
- Only executed by automated retention jobs
- Never by human user action
- Must be logged in a compliance deletion log
- Irreversible

---

## 7. Regulatory Compliance Notes

For Indonesian legal entities (MSI, JCI, SBI), the following regulations apply:

| Regulation | Requirement |
|-----------|-------------|
| UU Pajak (Tax Law) | Financial records minimum 10 years |
| Peraturan BI / OJK | Transaction records as specified per industry |
| KUHD (Commercial Code) | Commercial documents minimum 10 years |
| PIB/PEB (Customs) | Customs documents 10 years |

**Note:** Retention periods in this document are minimum guidelines. Legal counsel must be consulted for final determination per entity and document type.

---

## 8. Data Deletion Request Process

If a customer or employee requests data deletion (GDPR-style, if applicable):

1. Verify legal basis — Indonesian law may not require full deletion for regulated business data
2. Check if any open financial obligations exist (outstanding invoices, pending approvals)
3. If deletion is permitted: anonymize PII fields, retain financial transaction records
4. Log the deletion request and outcome in audit log
5. Do not delete records that are required for financial or legal compliance

---

## 9. Responsibilities

| Role | Responsibility |
|------|---------------|
| Super Admin | Monitor retention jobs, approve exceptions |
| Finance Controller | Verify finance record retention compliance |
| IT / DevOps | Implement automated retention jobs |
| Legal / Compliance | Define retention periods per regulation |
