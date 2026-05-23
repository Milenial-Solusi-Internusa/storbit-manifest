# Nexus by MSI — Audit Log Policy

**Last Updated:** 2026-05-23

---

## Overview

The audit log is an immutable record of all important events in Nexus by MSI. It provides traceability, accountability, and compliance evidence.

**Rule:** Audit logs must never be deleted or modified. They are append-only.

---

## 1. Audit Log Table

```sql
audit_logs (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    uuid REFERENCES companies(id),
  user_id       uuid REFERENCES auth.users(id),
  event_type    varchar(100) NOT NULL,
  module        varchar(50),
  record_id     uuid,
  record_type   varchar(100),
  old_data      jsonb,
  new_data      jsonb,
  ip_address    inet,
  user_agent    text,
  metadata      jsonb,
  created_at    timestamptz DEFAULT now()
)
```

**No `updated_at`, no `deleted_at`.** Audit logs are never modified after insert.

---

## 2. Mandatory Audit Events

### Authentication Events

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `login` | Successful user login | user_id, ip, user_agent, timestamp |
| `login_failed` | Failed login attempt | email attempted, ip, user_agent |
| `logout` | User signs out | user_id, session duration |
| `mfa_required` | MFA challenge triggered | user_id |
| `mfa_success` | MFA passed | user_id |
| `mfa_failed` | MFA failed | user_id, ip |
| `session_expired` | Session expired and invalidated | user_id |

### Data Events (all business modules)

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `create` | New record created | record_type, record_id, new_data (masked) |
| `update` | Record modified | record_type, record_id, old_data, new_data (diff) |
| `soft_delete` | Record soft deleted | record_type, record_id |
| `restore` | Soft-deleted record restored | record_type, record_id |
| `view_sensitive` | Sensitive field accessed (e.g. credit limit) | record_type, record_id, field name |

### Approval Events

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `submit` | Document submitted for approval | doc_type, doc_id, doc_no, submitted_by |
| `approve` | Document approved | doc_type, doc_id, approver, notes |
| `reject` | Document rejected | doc_type, doc_id, approver, reason |
| `revise` | Revision requested | doc_type, doc_id, approver, notes |
| `revised` | Document revised and resubmitted | doc_type, doc_id, revised_by |
| `cancel` | Document cancelled | doc_type, doc_id, cancelled_by, reason |

### Data Transfer Events

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `export` | Data exported | module, filter params, row count, exported_by |
| `import` | Data imported | module, file name, row count, imported_by |
| `print` | Document printed/PDF generated | doc_type, doc_id, generated_by |

### File Events

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `attachment_upload` | File attached to record | record_type, record_id, file_name, file_size |
| `attachment_delete` | Attachment removed | record_type, record_id, file_name |
| `attachment_access` | Signed URL generated (file accessed) | record_type, record_id, file_name |

### Access Control Events

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `role_change` | User role added or removed | target_user_id, role, action (add/remove) |
| `permission_change` | Role permission modified | role_id, permission, action |
| `user_activated` | User account activated | target_user_id |
| `user_deactivated` | User account deactivated | target_user_id, reason |
| `mfa_enforced` | MFA requirement set on user/role | target, set_by |

### Public API Events

| Event Type | Trigger | Data Captured |
|-----------|---------|---------------|
| `api_request` | External API call received | endpoint, api_key_id, ip, status_code |
| `public_tracking_access` | Public tracking endpoint accessed | tracking_token (masked), ip, result |

---

## 3. What Must NOT Be Stored in Audit Logs

To protect privacy and security:
- **Do not store** raw passwords or tokens in any form
- **Do not store** full credit card numbers
- **Do not store** MFA codes or backup codes
- **Do not store** Supabase service role keys
- **Do not store** complete financial data in old_data/new_data for high-volume events
- **Mask** sensitive fields (credit limit, bank account) in stored JSON — use `***` or hash

---

## 4. Audit Log Data Retention

| Log Type | Retention Period | Action After |
|----------|-----------------|--------------|
| Auth events | 2 years | Archive to cold storage |
| Data create/update | 5 years | Archive to cold storage |
| Approval events | 7 years | Archive to cold storage |
| Finance events | 10 years | Archive to cold storage |
| Export events | 2 years | Archive to cold storage |
| Public API events | 90 days | Delete after 90 days |
| Failed login events | 90 days | Delete after 90 days |

See full retention policy in `docs/security/data-retention-policy.md`.

---

## 5. Audit Log Access

| Role | Access Level |
|------|-------------|
| Super Admin | Full read access to all audit logs |
| Admin | Read access to company-scoped audit logs |
| Finance Controller | Read access to finance-related audit logs |
| BOD / Director | Read access to summary audit events |
| Others | No direct audit log access |

**Audit logs must never be modified or deleted by any role including Super Admin.**  
Deletion is only permitted by automated data retention jobs, not by human actors.

---

## 6. Implementation Pattern

### Audit Log Helper (TypeScript)

```typescript
// services/auditLog.ts
export async function logAuditEvent({
  companyId,
  userId,
  eventType,
  module,
  recordId,
  recordType,
  oldData,
  newData,
  metadata,
}: AuditLogPayload) {
  const { error } = await supabase.from('audit_logs').insert({
    company_id: companyId,
    user_id: userId,
    event_type: eventType,
    module,
    record_id: recordId,
    record_type: recordType,
    old_data: maskSensitiveFields(oldData),
    new_data: maskSensitiveFields(newData),
    metadata,
  });

  if (error) {
    // Never throw — audit log failure must not break business flow
    console.error('[AuditLog] Failed to write audit event:', error);
  }
}
```

**Rule:** Audit log failure must not block the main business operation. Log errors separately but do not throw.

---

## 7. Audit Log RLS Policy

Audit logs must have RLS that:
- Allows INSERT for all authenticated users (needed for logging)
- Restricts SELECT to Admin and above within the same company
- Denies UPDATE and DELETE for all users

```sql
-- Allow insert for all authenticated users (logging)
CREATE POLICY "audit_log_insert"
ON audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow select for admin and above only
CREATE POLICY "audit_log_select"
ON audit_logs FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id()
  AND get_user_role() IN ('super_admin', 'admin', 'finance_controller', 'bod')
);

-- No update or delete allowed
-- (no UPDATE or DELETE policies = denied by default)
```
