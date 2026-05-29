# Nexus by MSI — Status Lifecycle

**Last Updated:** 2026-05-24

---

## Overview

This document defines the standard status lifecycle for all document types in Nexus by MSI. Status values are consistent across modules to reduce complexity and enable unified reporting.

---

## 1. Standard Status Set

| Status | Display Label | Description |
|--------|--------------|-------------|
| `draft` | Draft | Document is being prepared, not yet submitted |
| `submitted` | Submitted | Submitted for approval, awaiting review |
| `under_review` | Under Review | Being reviewed by approver (multi-level) |
| `revision_requested` | Revision Requested | Returned to submitter for correction |
| `revised` | Revised | Submitter has made corrections, ready to re-submit |
| `approved` | Approved | Approved by all required approvers |
| `rejected` | Rejected | Definitively rejected, no further action |
| `cancelled` | Cancelled | Cancelled by submitter or admin |
| `in_progress` | In Progress | Execution has started (operations) |
| `completed` | Completed | Fully executed and closed |
| `archived` | Archived | Closed and archived, read-only |
| `on_hold` | On Hold | Temporarily paused |
| `overdue` | Overdue | Past due date without completion |

---

## 2. Status Transition Rules

### General Rules
1. Status can only move forward in the defined lifecycle
2. Backward transitions are only allowed for: `revision_requested` → `revised` → `submitted`
3. Terminal states (`rejected`, `cancelled`, `completed`, `archived`) cannot transition further
4. Status changes must be logged in `approval_logs` (for approval states) and `audit_logs` (all states)
5. Only authorized roles can trigger each transition

---

## 3. Status by Document Type

### Quotation

```
draft → submitted → under_review → approved → [converted to SP] → archived
                 ↘ revision_requested → revised → submitted (loop)
                 ↘ rejected
                 ↘ cancelled
```

| Transition | Actor |
|-----------|-------|
| draft → submitted | Sales Staff, Sales Head |
| submitted → under_review | Approver |
| under_review → revision_requested | Approver |
| revised → submitted | Sales Staff, Sales Head |
| under_review → approved | Approver |
| under_review → rejected | Approver |
| Any → cancelled | Submitter (before approval), Admin |
| approved → archived | System (after SP created) |

---

### Sales Order / Surat Pesanan

```
draft → submitted → under_review → approved → in_progress → completed → archived
                 ↘ revision_requested → revised → submitted (loop)
                 ↘ rejected
                 ↘ cancelled
```

| Transition | Actor |
|-----------|-------|
| draft → submitted | Sales Staff, Sales Head |
| approved → in_progress | Operations (on job creation) |
| in_progress → completed | Operations Head |
| completed → archived | System / Admin |

---

### Job / Operation

```
draft → submitted → approved → in_progress → completed → archived
                             ↘ on_hold → in_progress
                             ↘ cancelled
```

Additional operations-specific transitions:
- `in_progress` can have sub-statuses (managed inside the job, not as document status)

---

### Invoice

```
draft → submitted → approved → sent → partial_paid → paid → archived
                 ↘ revision_requested → revised → submitted
                 ↘ rejected
                 ↘ cancelled
                 ↘ overdue (system-triggered on due date)
```

| Transition | Actor |
|-----------|-------|
| approved → sent | Finance Staff |
| sent → partial_paid | System (on payment receipt) |
| partial_paid → paid | System (on full payment) |
| sent → overdue | System (automated on due date) |
| paid → archived | System |

---

### Purchase Request

```
draft → submitted → under_review → approved → [PO created] → completed → archived
                 ↘ revision_requested → revised → submitted
                 ↘ rejected
                 ↘ cancelled
```

---

### Purchase Order

```
draft → submitted → approved → sent_to_vendor → partially_received → received → completed → archived
                 ↘ revision_requested → revised → submitted
                 ↘ rejected
                 ↘ cancelled
```

---

### Payment (AR / AP)

```
pending → approved → processed → reconciled → archived
        ↘ rejected
        ↘ cancelled
```

---

### IT Ticket

```
open → in_progress → resolved → closed → archived
     ↘ on_hold → in_progress
     ↘ cancelled
```

---

### HRGA Request

```
draft → submitted → approved → processed → completed
      ↘ revision_requested → revised → submitted
      ↘ rejected
      ↘ cancelled
```

---

## 4. Status Color Convention (UI)

| Status | Color | Tailwind Class |
|--------|-------|---------------|
| `draft` | Gray | `bg-gray-100 text-gray-700` |
| `submitted` | Blue | `bg-blue-100 text-blue-700` |
| `under_review` | Indigo | `bg-indigo-100 text-indigo-700` |
| `revision_requested` | Orange | `bg-orange-100 text-orange-700` |
| `revised` | Amber | `bg-amber-100 text-amber-700` |
| `approved` | Green | `bg-green-100 text-green-700` |
| `rejected` | Red | `bg-red-100 text-red-700` |
| `cancelled` | Gray | `bg-gray-200 text-gray-500` |
| `in_progress` | Cyan | `bg-cyan-100 text-cyan-700` |
| `completed` | Emerald | `bg-emerald-100 text-emerald-700` |
| `archived` | Slate | `bg-slate-100 text-slate-500` |
| `on_hold` | Yellow | `bg-yellow-100 text-yellow-700` |
| `overdue` | Rose | `bg-rose-100 text-rose-700` |
| `paid` | Green | `bg-green-100 text-green-700` |
| `partial_paid` | Lime | `bg-lime-100 text-lime-700` |

---

## 5. Status in Database

Status is stored as `varchar(50)` in all document tables. Do not use integers or ENUM types for status — varchar allows flexibility to add new statuses without schema migration.

Status values must match exactly the codes defined above. They are case-sensitive (always lowercase with underscores).

---

## 6. Status Reporting

All transaction list queries must support filtering by status:

```typescript
// Example: server-side filter
const { data } = await supabase
  .from('invoices')
  .select('id, document_no, customer_id, total_amount, status, due_date')
  .eq('company_id', companyId)
  .eq('status', selectedStatus) // server-side filter
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .range(from, to); // server-side pagination
```

Never filter status on the frontend from a full dataset.
