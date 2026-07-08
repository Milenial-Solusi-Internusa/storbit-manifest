> ⚠️ SUPERSEDED — draft desain pra-Phase 1.0B (24 Mei 2026). Skema live = schema_snapshot.sql + docs/Governance/03_DATA_MODEL.md. Jangan dijadikan acuan.

# Nexus by MSI — Entity Map

**Last Updated:** 2026-05-24

---

## Overview

This document maps all major data entities in Nexus by MSI, their relationships, ownership, and data sensitivity.

---

## Entity Relationship Overview

```
companies
├── branches
├── departments
│   └── positions
├── user_profiles (via auth.users)
│   └── user_roles → roles → role_permissions → permissions
├── customers
├── vendors
├── products
├── document_types
├── chart_of_accounts
├── currencies
└── exchange_rates

companies → [transaction tables]
├── quotations → quotation_items
├── sales_orders → sales_order_items
├── jobs → job_costs → job_revenues
├── invoices → invoice_items
├── ar_transactions
├── ap_transactions
├── payments
├── purchase_orders → purchase_order_items
├── goods_receipts → goods_receipt_items
└── journal_entries → journal_entry_lines

[platform tables]
├── approval_rules
├── approval_logs
└── audit_logs
```

---

## Entity Catalog

### Foundation Entities

| Entity | Table Name | Scope | Sensitivity | Soft Delete | Approval |
|--------|-----------|-------|-------------|-------------|---------|
| Company | `companies` | Global | Medium | No | Yes |
| Branch | `branches` | Company | Low | Yes | No |
| Department | `departments` | Company | Low | Yes | No |
| Position | `positions` | Company | Low | Yes | No |
| User Profile | `user_profiles` | Company | High | Yes | Yes |
| Role | `roles` | Company | High | Yes | Yes |
| Permission | `permissions` | Global | High | No | Yes |
| Role Permission | `role_permissions` | Company | High | No | Yes |
| User Role | `user_roles` | Company | High | No | Yes |

### Master Data Entities

| Entity | Table Name | Scope | Sensitivity | Soft Delete | Approval |
|--------|-----------|-------|-------------|-------------|---------|
| Customer | `customers` | Company | Medium | Yes | Conditional |
| Vendor | `vendors` | Company | Medium | Yes | Conditional |
| Product / Service | `products` | Company | Low | Yes | No |
| Price List | `price_lists` | Company | Medium | Yes | Yes |
| Price List Item | `price_list_items` | Company | Medium | Yes | No |
| Currency | `currencies` | Global | Low | No | No |
| Exchange Rate | `exchange_rates` | Company | Medium | No | Yes |
| Tax | `taxes` | Company | Medium | Yes | No |
| Payment Terms | `payment_terms` | Company | Low | Yes | No |
| Chart of Accounts | `chart_of_accounts` | Company | High | Yes | Yes |
| Cost Center | `cost_centers` | Company | Medium | Yes | No |
| Document Type | `document_types` | Company | Medium | No | Yes |
| Status Catalog | `status_catalog` | Global | Low | No | No |
| Position / Job Title | `positions` | Company | Low | Yes | No |
| Port / Airport | `ports` | Global | Low | Yes | No |
| Carrier | `carriers` | Company | Low | Yes | No |

### Transaction Entities (Planned)

| Entity | Table Name | Scope | Sensitivity | Soft Delete | Approval |
|--------|-----------|-------|-------------|-------------|---------|
| Customer Inquiry | `inquiries` | Company | Low | Yes | No |
| Quotation | `quotations` | Company | Medium | Yes | Yes |
| Quotation Item | `quotation_items` | Company | Medium | Yes | No |
| Sales Order | `sales_orders` | Company | Medium | Yes | Yes |
| Sales Order Item | `sales_order_items` | Company | Medium | Yes | No |
| Job / Operation | `jobs` | Company | Medium | Yes | Yes |
| Job Cost | `job_costs` | Company | High | Yes | Conditional |
| Job Revenue | `job_revenues` | Company | High | Yes | No |
| Invoice | `invoices` | Company | High | Yes | Yes |
| Invoice Item | `invoice_items` | Company | High | Yes | No |
| AR Transaction | `ar_transactions` | Company | High | Yes | Yes |
| Payment Receipt | `payment_receipts` | Company | High | Yes | Yes |
| Purchase Request | `purchase_requests` | Company | Medium | Yes | Yes |
| Purchase Order | `purchase_orders` | Company | Medium | Yes | Yes |
| Goods Receipt | `goods_receipts` | Company | Medium | Yes | No |
| Vendor Invoice | `vendor_invoices` | Company | High | Yes | Yes |
| AP Transaction | `ap_transactions` | Company | High | Yes | Yes |
| Payment Voucher | `payment_vouchers` | Company | High | Yes | Yes |
| Journal Entry | `journal_entries` | Company | Critical | Yes | Yes |
| Journal Entry Line | `journal_entry_lines` | Company | Critical | No | No |
| Asset Category | `asset_categories` | Company | Low | Yes | No |
| Asset Location | `asset_locations` | Company | Low | Yes | No |
| Asset | `assets` | Company | Medium | Yes | Yes |
| Asset Depreciation | `asset_depreciations` | Company | High | No | No |
| IT Ticket | `it_tickets` | Company | Low | Yes | No |
| HRGA Request | `hrga_requests` | Company | Medium | Yes | Yes |

### Platform Entities

| Entity | Table Name | Scope | Sensitivity | Soft Delete | Approval |
|--------|-----------|-------|-------------|-------------|---------|
| Approval Rule | `approval_rules` | Company | High | No | Yes |
| Approval Log | `approval_logs` | Company | High | No | No |
| Approval Delegation | `approval_delegations` | Company | High | No | Yes |
| Audit Log | `audit_logs` | Company | Critical | No | No |
| Document Number Seq | `document_sequences` | Company | Medium | No | No |
| Attachment | `attachments` | Company | Medium | Yes | No |
| Notification | `notifications` | User | Low | Yes | No |
| Public Tracking Token | `tracking_tokens` | Company | Medium | No | No |

---

## Sensitivity Classification

| Level | Description | Access Rule |
|-------|-------------|-------------|
| Low | Non-sensitive reference data | All authenticated users in company |
| Medium | Business data — restricted to relevant roles | Role-based access |
| High | Financial data, credit limits, cost data | Finance, Head, Director only |
| Critical | Accounting, audit logs, system config | Finance Controller, Super Admin only |

---

## Multi-Company Data Isolation

All entities marked as `Company` scope must:
1. Have `company_id` column
2. Have RLS policy enforcing `company_id = get_user_company_id()`
3. Never be accessible across companies in any query without explicit super-admin grant

Global scope entities (currencies, permissions, ports) have no `company_id` and are readable by all authenticated users but only writable by Super Admin.

---

## Naming Conventions

| Convention | Rule | Example |
|-----------|------|---------|
| Table name | snake_case, plural | `sales_orders` |
| Column name | snake_case | `company_id`, `created_at` |
| Primary key | `id` uuid | `id uuid PRIMARY KEY` |
| Foreign key | `{entity}_id` | `customer_id`, `company_id` |
| Timestamps | `_at` suffix | `created_at`, `deleted_at` |
| Boolean flags | `is_` prefix | `is_active`, `is_service` |
| Status | `status` varchar | `status varchar(50)` |
| Amount | `numeric(18,4)` | `amount numeric(18,4)` |
| Document number | `document_no` | `document_no varchar(100)` |
