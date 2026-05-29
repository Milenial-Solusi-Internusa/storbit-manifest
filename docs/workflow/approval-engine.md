# Nexus by MSI — Approval Engine

**Last Updated:** 2026-05-23

---

## Overview

The Approval Engine is a reusable, configurable platform component. It is NOT hardcoded per module. Every document type that requires approval uses the same engine.

**Rule:** Never hardcode approval logic inside a specific module. Always use the Approval Engine.

---

## 1. Design Principles

1. One engine, many document types
2. Company-based rules
3. Department-based rules
4. Document-type-based rules
5. Amount-based threshold rules
6. Role-based approvers
7. Specific user approvers
8. Backup approvers for absence
9. Delegation support
10. Multi-level sequential approval
11. Comment and note on every approval action
12. Full approval history per document
13. Revision cycle support
14. Audit log for every approval action

---

## 2. Status Lifecycle

```
draft
  └─> submitted
        └─> under_review
              ├─> revision_requested
              │     └─> revised
              │           └─> submitted (re-submit)
              ├─> rejected (terminal)
              └─> approved
                    └─> [module-specific next state]
                          └─> completed
                                └─> archived
```

Additional terminal states:
- `cancelled` — withdrawn by submitter before approval
- `expired` — approval not actioned within deadline

---

## 3. Database Tables

### `approval_rules`
Defines the rules for each document type.

```sql
id                uuid PK
company_id        uuid NOT NULL
document_type     varchar(50) NOT NULL   -- e.g. quotation, sales_order, invoice
department_id     uuid                   -- null = applies to all departments
min_amount        numeric(18,4)          -- null = applies regardless of amount
max_amount        numeric(18,4)          -- null = applies regardless of amount
approver_role_id  uuid                   -- role-based approver
approver_user_id  uuid                   -- specific user approver
backup_approver_id uuid                  -- backup when primary is absent
sequence_order    integer DEFAULT 1      -- for multi-level approval
deadline_hours    integer                -- null = no deadline
is_active         boolean DEFAULT true
```

### `approval_logs`
Records every approval action.

```sql
id              uuid PK
company_id      uuid NOT NULL
document_type   varchar(50) NOT NULL
document_id     uuid NOT NULL
document_no     varchar(100)
action          varchar(50) NOT NULL   -- submitted, approved, rejected, revision_requested, revised, cancelled
from_status     varchar(50)
to_status       varchar(50)
actor_id        uuid NOT NULL          -- who performed the action
notes           text                   -- required for reject and revision_requested
sequence_level  integer                -- which approval level this was
created_at      timestamptz DEFAULT now()
```

---

## 4. Approval Rule Configuration Examples

### Single-level approval for all Quotations
```
document_type: quotation
department_id: NULL (all departments)
min_amount: NULL
approver_role_id: sales_head role
sequence_order: 1
```

### Two-level approval for Sales Orders above 500 million IDR
```
-- Level 1: Sales Head
document_type: sales_order
min_amount: 500000000
approver_role_id: sales_head role
sequence_order: 1

-- Level 2: Director
document_type: sales_order
min_amount: 500000000
approver_role_id: bod role
sequence_order: 2
```

### Department-specific approval for IT Purchase Requests
```
document_type: purchase_request
department_id: IT department ID
approver_role_id: operations_head role
sequence_order: 1
```

---

## 5. Approval Flow Logic

### Submit
```
1. Validate document is in draft or revised status
2. Validate all required fields are filled
3. Find matching approval rules for:
   - document_type
   - company_id
   - department_id (if applicable)
   - amount range (if applicable)
4. If no rules found → auto-approve or reject with config error
5. Set document status to submitted
6. Create approval_log entry (action: submitted)
7. Notify first approver(s) in sequence_order = 1
```

### Approve (each level)
```
1. Validate actor has approver role or is the specified approver_user_id
2. Set approval_log entry (action: approved, sequence_level)
3. Check if this was the final approval level
   - If yes → set document status to approved
   - If no → set status to under_review, notify next level approvers
4. Audit log event: approve
```

### Reject
```
1. Validate actor has approver role
2. Require rejection reason (notes field mandatory)
3. Set document status to rejected
4. Create approval_log entry (action: rejected, notes = reason)
5. Notify submitter
6. Audit log event: reject
```

### Request Revision
```
1. Validate actor has approver role
2. Require revision notes (mandatory)
3. Set document status to revision_requested
4. Create approval_log entry (action: revision_requested, notes)
5. Notify submitter
6. Audit log event: revise
```

### Revise and Resubmit
```
1. Validate actor is original submitter
2. Validate document is in revision_requested status
3. Make allowed changes to document
4. Set document status to revised
5. Create approval_log entry (action: revised)
6. Auto-resubmit → status becomes submitted again
7. Audit log event: revised
```

### Cancel
```
1. Validate actor is submitter or has cancel permission
2. Validate document is in submitted or under_review status
3. Set document status to cancelled
4. Create approval_log entry (action: cancelled)
5. Audit log event: cancel
```

---

## 6. Delegation

When an approver is absent, approval authority can be delegated:

```sql
approval_delegations (
  id              uuid PK
  company_id      uuid NOT NULL
  delegator_id    uuid NOT NULL    -- original approver
  delegate_id     uuid NOT NULL    -- temporary approver
  document_types  varchar[]        -- which document types (null = all)
  valid_from      date NOT NULL
  valid_until     date NOT NULL
  reason          text
  approved_by     uuid NOT NULL    -- admin who approved delegation
  is_active       boolean DEFAULT true
  created_at      timestamptz DEFAULT now()
)
```

Delegation rules:
- Delegation requires Admin approval
- Delegation is time-bounded
- Delegation is logged in audit log
- Delegated approvals are marked clearly in approval_log

---

## 7. Multi-Company Approval

Each company can have its own approval rules. Rules are always scoped by `company_id`. A user who belongs to Company A cannot approve documents for Company B.

---

## 8. Frontend Integration Pattern

```typescript
// hooks/useApproval.ts
export function useApproval(documentType: string, documentId: string) {
  const submitForApproval = async () => { ... }
  const approveDocument = async (notes?: string) => { ... }
  const rejectDocument = async (reason: string) => { ... }
  const requestRevision = async (notes: string) => { ... }
  const cancelDocument = async () => { ... }
  const getApprovalHistory = async () => { ... }

  return { submitForApproval, approveDocument, rejectDocument, requestRevision, cancelDocument, getApprovalHistory }
}
```

All approval actions must go through this hook — never call approval directly from component logic.

---

## 9. Notification Strategy

Approval events must trigger notifications to:
- Approver: when a document is submitted for their approval
- Submitter: when document is approved, rejected, or revision requested
- Backup approver: when primary approver is absent beyond deadline

Notification channels (planned):
- In-app notification
- Email (via Supabase Edge Function + email provider)
