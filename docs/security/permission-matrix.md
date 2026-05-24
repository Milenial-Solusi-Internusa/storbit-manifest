# Nexus by MSI — Permission Matrix

**Last Updated:** 2026-05-24

---

## Overview

This document defines the permission matrix for all roles in Nexus by MSI. Permissions are granular per module and action.

---

## Role Definitions

| Role Code | Role Name | Description |
|-----------|----------|-------------|
| `super_admin` | Super Admin | Full platform access, all companies |
| `admin` | Admin | Company-level admin, all modules except Super Admin |
| `bod` | BOD / Director | Strategic view, approval authority |
| `finance_controller` | Finance Controller | Full finance access, approval |
| `finance_staff` | Finance Staff | Finance data entry and operations |
| `operations_head` | Operations Head | Full operations access, approval |
| `operations_staff` | Operations Staff | Job and shipment data entry |
| `sales_head` | Sales Head | Full sales access, approval |
| `sales_staff` | Sales Staff | Quotation and sales order entry |
| `procurement_head` | Procurement Head | Full procurement access, approval |
| `procurement_staff` | Procurement Staff | PR and PO data entry |
| `viewer` | Viewer | Read-only access to permitted modules |

---

## Permission Actions

| Action | Description |
|--------|-------------|
| `view` | Read / list records |
| `create` | Create new records |
| `edit` | Modify existing records |
| `delete` | Soft delete records |
| `restore` | Restore soft-deleted records |
| `approve` | Approve submitted documents |
| `submit` | Submit document for approval |
| `export` | Export data to file |
| `import` | Import data from file |
| `print` | Print / generate PDF |
| `config` | Configure module settings |

---

## Permission Matrix by Module

Legend: ✅ Allowed | ❌ Not Allowed | ⚠️ Conditional

### Master Data — Customer

| Action | super_admin | admin | bod | fin_ctrl | fin_staff | ops_head | ops_staff | sales_head | sales_staff | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:---------:|:--------:|:---------:|:----------:|:-----------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| edit | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| config | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Master Data — Vendor

| Action | super_admin | admin | bod | fin_ctrl | fin_staff | ops_head | ops_staff | proc_head | proc_staff | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:---------:|:--------:|:---------:|:---------:|:----------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| edit | ✅ | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

### Sales — Quotation

| Action | super_admin | admin | bod | fin_ctrl | fin_staff | ops_head | sales_head | sales_staff | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:---------:|:--------:|:----------:|:-----------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| create | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| edit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| submit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| approve | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |

### Sales — Sales Order / SP

| Action | super_admin | admin | bod | fin_ctrl | ops_head | sales_head | sales_staff | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:--------:|:----------:|:-----------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| create | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| edit | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| submit | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| approve | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| delete | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

### Operations — Job / Shipment

| Action | super_admin | admin | bod | fin_ctrl | ops_head | ops_staff | sales_head | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:--------:|:---------:|:----------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| create | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| edit | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| submit | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| approve | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| delete | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### Finance — Invoice

| Action | super_admin | admin | bod | fin_ctrl | fin_staff | ops_head | sales_head | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:---------:|:--------:|:----------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| create | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| edit | ✅ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| submit | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| approve | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| delete | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| print | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

### Finance — AR / AP

| Action | super_admin | admin | bod | fin_ctrl | fin_staff | ops_head | viewer |
|--------|:-----------:|:-----:|:---:|:--------:|:---------:|:--------:|:------:|
| view | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| create | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| edit | ✅ | ✅ | ❌ | ✅ | ⚠️ | ❌ | ❌ |
| approve | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| export | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

### User Management

| Action | super_admin | admin | bod | others |
|--------|:-----------:|:-----:|:---:|:------:|
| view | ✅ | ✅ | ⚠️ | ❌ |
| create | ✅ | ✅ | ❌ | ❌ |
| edit | ✅ | ✅ | ❌ | ❌ |
| role_change | ✅ | ✅ | ❌ | ❌ |
| deactivate | ✅ | ✅ | ❌ | ❌ |
| config | ✅ | ❌ | ❌ | ❌ |

---

## Legacy Role Mapping

During Phase 1.0F, the existing `profiles.role` enum is migrated to `user_roles` entries:

| Old `profiles.role` value | New `roles.code` | Notes |
|---------------------------|-----------------|-------|
| `super` | `super_admin` | Direct mapping |
| `logistic` | `operations_staff` | Renamed for clarity |
| `procurement` | `procurement_staff` | Renamed for clarity |
| `finance` | `finance_staff` | Renamed for clarity |
| `management` | `viewer` | Downgraded to read-only |

**Important:** The legacy `profiles.role` column must NOT be dropped until Phase 1.0F migration is verified in production. Both old and new role systems run in parallel during transition.

---

## Migration Reference

- Roles seeded in: `supabase/migrations/20260524000005_roles_permissions.sql`
- Permissions seeded in: `supabase/migrations/20260524000005_roles_permissions.sql`
- Role-permission assignments seeded in: `supabase/migrations/20260524000013_role_permissions_seed.sql`
- Full seed strategy: `docs/database/seed-strategy.md`

---

## Notes

- ⚠️ Conditional = allowed only for their own records or within their department
- Role assignment must be stored in `user_roles` table
- All role changes must be logged in `audit_logs`
- Frontend permission checks are UX helpers only — server-side RLS is the real enforcer
- This matrix will expand as new modules are added — update this file accordingly
