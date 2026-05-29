# Nexus by MSI — Business Process Map

**Last Updated:** 2026-05-23

---

## Overview

This document maps the key end-to-end business processes that Nexus by MSI must support across all entities (MSI, JCI, SBI).

---

## 1. Lead to Cash (Sales Cycle)

```
Customer Inquiry / Lead
    └─> Quotation
        └─> Quotation Approved
            └─> Sales Order / Surat Pesanan
                └─> Job / Operation Created
                    ├─> Job Execution (per entity type)
                    │   ├─> Freight Forwarding Job (MSI)
                    │   ├─> Customs Clearance Job (JCI)
                    │   └─> Trading Fulfillment (SBI)
                    └─> Job Costing
                        └─> Invoice / Billing
                            └─> AR Collection
                                └─> Payment Receipt
                                    └─> Bank Reconciliation
                                        └─> Accounting Journal
```

**Entities:** All (MSI, JCI, SBI)  
**Key Documents:** Quotation, Sales Order, Invoice, Payment Receipt  
**Finance Impact:** Revenue recognition, AR balance, cash flow  
**Approval Required:** Quotation, Sales Order, Invoice

---

## 2. Procure to Pay (Procurement Cycle)

```
Purchase Requisition (PR)
    └─> PR Approved
        └─> Purchase Order (PO)
            └─> PO Approved
                └─> Goods / Service Receipt
                    └─> Vendor Invoice
                        └─> AP Verification
                            └─> Payment Approval
                                └─> Payment Processing
                                    └─> Bank Reconciliation
                                        └─> Accounting Journal
```

**Entities:** All  
**Key Documents:** PR, PO, Vendor Invoice, Payment Voucher  
**Finance Impact:** COGS, AP balance, cash outflow  
**Approval Required:** PR, PO, Vendor Invoice, Payment

---

## 3. Freight Forwarding Operations (MSI)

```
Customer Inquiry (Freight)
    └─> Quotation (Freight Rate)
        └─> Booking Confirmation
            └─> Shipment / Job Created
                ├─> Pre-Shipment
                │   ├─> Document Collection (BL, Packing List, Invoice)
                │   └─> Customs Export Notification
                ├─> Execution
                │   ├─> Cargo Booking
                │   ├─> Port Handling
                │   └─> Vessel / Flight Departure
                └─> Post-Shipment
                    ├─> BL / AWB Issuance
                    └─> Arrival Confirmation
                        └─> Job Costing
                            └─> Invoice
                                └─> AR Collection
```

**Entity:** MSI  
**Key Documents:** BL, AWB, Packing List, Commercial Invoice, Shipping Instruction  
**Finance Impact:** Revenue, Disbursement cost, Job margin  
**Approval Required:** Quotation, Invoice, Cost > threshold

---

## 4. PPJK / Customs Clearance (JCI)

```
Customer Instruction (Customs Job)
    └─> Document Review
        ├─> Import / Export Classification
        └─> Duty Calculation
            └─> Customs Declaration (PIB/PEB)
                └─> Customs Inspection (if triggered)
                    └─> Duty Payment
                        └─> Release / Surat Jalan
                            └─> Job Completion
                                └─> Job Costing
                                    └─> Invoice
                                        └─> AR Collection
```

**Entity:** JCI  
**Key Documents:** PIB, PEB, Airway Bill, Bill of Lading, SPPB  
**Finance Impact:** Revenue, Disbursement, Duty cost pass-through  
**Approval Required:** Duty payment above threshold, Invoice

---

## 5. General Trading (SBI)

```
Customer Order (Trading)
    └─> Quotation / Price Approval
        └─> Sales Order Confirmed
            └─> Procurement Triggered (if non-stock)
                └─> Inventory Check / Reservation
                    └─> Delivery Order
                        └─> Goods Delivery
                            └─> Proof of Delivery
                                └─> Invoice
                                    └─> AR Collection
```

**Entity:** SBI  
**Key Documents:** Sales Order, Delivery Order, Invoice, Proof of Delivery  
**Finance Impact:** Revenue, COGS, Inventory movement, GP margin  
**Approval Required:** Quotation discount above threshold, Sales Order, Invoice

---

## 6. Asset Lifecycle

```
Asset Request
    └─> Request Approved
        └─> Procurement (if new purchase)
            └─> Asset Receipt & Registration
                └─> Asset Assigned to Department
                    ├─> Maintenance (periodic)
                    ├─> Relocation (optional)
                    └─> Disposal (end of life)
                        └─> Disposal Approved
                            └─> Asset Written Off
                                └─> Accounting Journal
```

**Entities:** All  
**Finance Impact:** Capex, depreciation, book value  
**Approval Required:** Procurement, Disposal

---

## 7. IT Service Management

```
User Submits IT Ticket
    └─> Ticket Triaged (IT Team)
        ├─> Resolved Immediately
        └─> Escalated
            ├─> Hardware Procurement Request
            │   └─> Procurement Flow
            └─> Software / Access Request
                └─> Access Approval
                    └─> Access Granted / Revoked
                        └─> Audit Log
```

**Entities:** All  
**Finance Impact:** IT Opex  
**Approval Required:** Hardware purchase, Software license, Admin access

---

## 8. HRGA Request

```
Employee Submits HRGA Request
(Leave, Reimbursement, Overtime, Transport, etc.)
    └─> Request Approved (Line Manager)
        └─> Request Approved (HRD if threshold)
            └─> Request Processed
                ├─> Payroll Impact (if applicable)
                └─> Finance Disbursement (if applicable)
                    └─> Accounting Journal
```

**Entities:** All  
**Finance Impact:** Payroll, Reimbursement, Operational expense  
**Approval Required:** Depends on request type and amount

---

## 9. Finance AR / AP Cycle

### AR
```
Invoice Issued → AR Balance Created → Collection Follow-up
→ Payment Received → Receipt Matched → AR Cleared → Bank Reconciled
```

### AP
```
Vendor Invoice Received → AP Balance Created → Approval
→ Payment Released → AP Cleared → Bank Reconciled
```

**Entities:** All  
**Finance Impact:** Cash flow, outstanding balance, aging  
**Approval Required:** Payment above threshold

---

## 10. Accounting Close

```
Monthly:
- All AR/AP must be reconciled
- Bank reconciliation completed
- Cost allocation finalized
- Depreciation entry posted
- Accruals posted
- Month-end journal reviewed and approved
- Trial balance reviewed
- P&L and Balance Sheet exported
```

**Entities:** Per company  
**Finance Impact:** Full financial statement impact  
**Approval Required:** Finance Controller / CFO sign-off

---

## Cross-Cutting Concerns

All business processes above share these platform concerns:

| Concern | Implementation |
|---------|---------------|
| Document Numbering | Standard format: `{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}` |
| Approval Flow | Reusable Approval Engine |
| Audit Trail | Every state change logged |
| Multi-company Scope | All data scoped by `company_id` |
| Status Lifecycle | Standard status set per document type |
| Finance Impact | Every transaction traceable to journal |
| Performance | Server-side pagination, indexed queries |
| Security | RLS, role-permission, MFA for sensitive roles |
