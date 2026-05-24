# Nexus by MSI — Indexing Strategy

**Last Updated:** 2026-05-24

---

## Overview

Indexes are critical for performance at scale. This document defines the indexing strategy for all major tables in Nexus by MSI.

**Rule:** Every frequent filter column must have an index before going to production. Never paginate or filter on unindexed columns in large tables.

---

## Core Indexing Principles

1. All foreign keys must be indexed
2. All `company_id` columns must be indexed (RLS + filter)
3. All `deleted_at` columns must be indexed (soft delete filter)
4. All `status` columns in transaction tables must be indexed
5. All `created_at` columns in transaction tables must be indexed
6. All `document_no` columns must be indexed (unique lookup)
7. Composite indexes preferred over single-column when queries always filter by `company_id` first
8. Do not over-index write-heavy tables
9. Review `EXPLAIN ANALYZE` output before adding new indexes in production

---

## Foundation Table Indexes

### `companies`
```sql
-- Already unique: code
CREATE UNIQUE INDEX idx_companies_code ON companies(code);
```

### `branches`
```sql
CREATE INDEX idx_branches_company_id ON branches(company_id);
CREATE INDEX idx_branches_deleted_at ON branches(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `departments`
```sql
CREATE INDEX idx_departments_company_id ON departments(company_id);
CREATE INDEX idx_departments_parent_id ON departments(parent_id);
CREATE INDEX idx_departments_deleted_at ON departments(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `positions`
```sql
CREATE INDEX idx_positions_company_id ON positions(company_id);
CREATE INDEX idx_positions_department_id ON positions(department_id);
```

---

## Access Control Table Indexes

### `user_profiles`
```sql
CREATE INDEX idx_user_profiles_company_id ON user_profiles(company_id);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_is_active ON user_profiles(is_active);
CREATE INDEX idx_user_profiles_deleted_at ON user_profiles(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `user_roles`
```sql
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_company_id ON user_roles(company_id);
CREATE INDEX idx_user_roles_user_company ON user_roles(user_id, company_id);
```

### `role_permissions`
```sql
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
```

---

## Master Data Table Indexes

### `customers`
```sql
CREATE INDEX idx_customers_company_id ON customers(company_id);
CREATE INDEX idx_customers_company_active ON customers(company_id, is_active);
CREATE INDEX idx_customers_code ON customers(company_id, code);
CREATE INDEX idx_customers_name ON customers(company_id, name);
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `vendors`
```sql
CREATE INDEX idx_vendors_company_id ON vendors(company_id);
CREATE INDEX idx_vendors_company_active ON vendors(company_id, is_active);
CREATE INDEX idx_vendors_code ON vendors(company_id, code);
CREATE INDEX idx_vendors_name ON vendors(company_id, name);
CREATE INDEX idx_vendors_deleted_at ON vendors(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `products`
```sql
CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_company_active ON products(company_id, is_active);
CREATE INDEX idx_products_code ON products(company_id, code);
CREATE INDEX idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NOT NULL;
```

---

## Transaction Table Indexes (Mandatory Pattern)

Every transaction table must have this minimum index set:

```sql
-- Core filters
CREATE INDEX idx_{table}_company_id ON {table}(company_id);
CREATE INDEX idx_{table}_company_status ON {table}(company_id, status);
CREATE INDEX idx_{table}_company_created ON {table}(company_id, created_at DESC);
CREATE INDEX idx_{table}_document_no ON {table}(company_id, document_no);
CREATE INDEX idx_{table}_deleted_at ON {table}(deleted_at) WHERE deleted_at IS NOT NULL;

-- Entity references
CREATE INDEX idx_{table}_customer_id ON {table}(customer_id);   -- if applicable
CREATE INDEX idx_{table}_vendor_id ON {table}(vendor_id);       -- if applicable
CREATE INDEX idx_{table}_created_by ON {table}(created_by);
```

### Applied to Key Transaction Tables

#### `quotations`
```sql
CREATE INDEX idx_quotations_company_id ON quotations(company_id);
CREATE INDEX idx_quotations_company_status ON quotations(company_id, status);
CREATE INDEX idx_quotations_company_created ON quotations(company_id, created_at DESC);
CREATE INDEX idx_quotations_document_no ON quotations(company_id, document_no);
CREATE INDEX idx_quotations_customer_id ON quotations(customer_id);
CREATE INDEX idx_quotations_created_by ON quotations(created_by);
CREATE INDEX idx_quotations_deleted_at ON quotations(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### `sales_orders`
```sql
CREATE INDEX idx_sales_orders_company_id ON sales_orders(company_id);
CREATE INDEX idx_sales_orders_company_status ON sales_orders(company_id, status);
CREATE INDEX idx_sales_orders_company_created ON sales_orders(company_id, created_at DESC);
CREATE INDEX idx_sales_orders_document_no ON sales_orders(company_id, document_no);
CREATE INDEX idx_sales_orders_customer_id ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_quotation_id ON sales_orders(quotation_id);
CREATE INDEX idx_sales_orders_deleted_at ON sales_orders(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### `jobs`
```sql
CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_company_status ON jobs(company_id, status);
CREATE INDEX idx_jobs_company_created ON jobs(company_id, created_at DESC);
CREATE INDEX idx_jobs_document_no ON jobs(company_id, document_no);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_sales_order_id ON jobs(sales_order_id);
CREATE INDEX idx_jobs_deleted_at ON jobs(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### `invoices`
```sql
CREATE INDEX idx_invoices_company_id ON invoices(company_id);
CREATE INDEX idx_invoices_company_status ON invoices(company_id, status);
CREATE INDEX idx_invoices_company_created ON invoices(company_id, created_at DESC);
CREATE INDEX idx_invoices_document_no ON invoices(company_id, document_no);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX idx_invoices_due_date ON invoices(company_id, due_date);
CREATE INDEX idx_invoices_deleted_at ON invoices(deleted_at) WHERE deleted_at IS NOT NULL;
```

#### `ar_transactions`
```sql
CREATE INDEX idx_ar_company_id ON ar_transactions(company_id);
CREATE INDEX idx_ar_company_status ON ar_transactions(company_id, status);
CREATE INDEX idx_ar_customer_id ON ar_transactions(customer_id);
CREATE INDEX idx_ar_invoice_id ON ar_transactions(invoice_id);
CREATE INDEX idx_ar_due_date ON ar_transactions(company_id, due_date);
```

---

## Audit Log Indexes

```sql
-- audit_logs is append-only, indexes support lookup not filtering
CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_record ON audit_logs(record_type, record_id);
```

---

## Approval Log Indexes

```sql
CREATE INDEX idx_approval_logs_company_id ON approval_logs(company_id);
CREATE INDEX idx_approval_logs_document ON approval_logs(company_id, document_type, document_id);
CREATE INDEX idx_approval_logs_actor_id ON approval_logs(actor_id);
CREATE INDEX idx_approval_logs_acted_at ON approval_logs(company_id, acted_at DESC);
```

---

## Phase 1.0B — New Table Indexes

### `status_catalog`
```sql
CREATE INDEX idx_status_catalog_is_active ON status_catalog(is_active);
```

### `document_types`
```sql
CREATE INDEX idx_document_types_company_id ON document_types(company_id);
CREATE INDEX idx_document_types_company_code ON document_types(company_id, code);
```

### `document_sequences`
```sql
CREATE INDEX idx_document_sequences_company_id ON document_sequences(company_id);
CREATE INDEX idx_document_sequences_lookup ON document_sequences(company_id, document_type, department_code, year, month);
```

### `roles`
```sql
CREATE INDEX idx_roles_company_id ON roles(company_id);
CREATE INDEX idx_roles_deleted_at ON roles(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `role_permissions`
```sql
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
```

### `user_roles`
```sql
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_company_id ON user_roles(company_id);
-- Hot path: check active roles for a user in a company
CREATE INDEX idx_user_roles_user_company ON user_roles(user_id, company_id) WHERE is_active = true;
```

### `permissions`
```sql
CREATE INDEX idx_permissions_module ON permissions(module);
```

### `taxes`
```sql
CREATE INDEX idx_taxes_company_id ON taxes(company_id);
CREATE INDEX idx_taxes_deleted_at ON taxes(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `payment_terms`
```sql
CREATE INDEX idx_payment_terms_company_id ON payment_terms(company_id);
CREATE INDEX idx_payment_terms_deleted_at ON payment_terms(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `exchange_rates`
```sql
CREATE INDEX idx_exchange_rates_company_id ON exchange_rates(company_id);
-- Hot path: look up most recent rate for a currency pair
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(company_id, from_currency, to_currency, effective_date DESC);
```

### `vendors`
```sql
CREATE INDEX idx_vendors_company_id ON vendors(company_id);
CREATE INDEX idx_vendors_company_code ON vendors(company_id, code);
CREATE INDEX idx_vendors_deleted_at ON vendors(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `products`
```sql
CREATE INDEX idx_products_company_id ON products(company_id);
CREATE INDEX idx_products_company_code ON products(company_id, code);
CREATE INDEX idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `positions`
```sql
CREATE INDEX idx_positions_company_id ON positions(company_id);
CREATE INDEX idx_positions_deleted_at ON positions(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `approval_rules`
```sql
CREATE INDEX idx_approval_rules_company_id ON approval_rules(company_id);
-- Hot path: look up active rules for a company + doc type at submission
CREATE INDEX idx_approval_rules_company_doctype ON approval_rules(company_id, document_type) WHERE is_active = true;
```

### `approval_delegations`
```sql
CREATE INDEX idx_approval_delegations_company_id ON approval_delegations(company_id);
-- Hot path: check if a delegate has active authority for a date range
CREATE INDEX idx_approval_delegations_delegate ON approval_delegations(delegate_id, valid_from, valid_until) WHERE is_active = true;
CREATE INDEX idx_approval_delegations_delegator ON approval_delegations(delegator_id);
```

### `cost_centers`
```sql
CREATE INDEX idx_cost_centers_company_id ON cost_centers(company_id);
CREATE INDEX idx_cost_centers_deleted_at ON cost_centers(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `chart_of_accounts`
```sql
CREATE INDEX idx_coa_company_id ON chart_of_accounts(company_id);
CREATE INDEX idx_coa_parent_id ON chart_of_accounts(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_coa_account_type ON chart_of_accounts(company_id, account_type);
CREATE INDEX idx_coa_deleted_at ON chart_of_accounts(deleted_at) WHERE deleted_at IS NOT NULL;
```

### `asset_categories` / `asset_locations` / `assets`
```sql
CREATE INDEX idx_asset_categories_company_id ON asset_categories(company_id);
CREATE INDEX idx_asset_locations_company_id ON asset_locations(company_id);
CREATE INDEX idx_asset_locations_branch_id ON asset_locations(branch_id);
CREATE INDEX idx_assets_company_id ON assets(company_id);
CREATE INDEX idx_assets_category_id ON assets(category_id);
CREATE INDEX idx_assets_status ON assets(company_id, status);
CREATE INDEX idx_assets_deleted_at ON assets(deleted_at) WHERE deleted_at IS NOT NULL;
```

---

## Partial Indexes for Active Records

Use partial indexes to make active-record queries faster without including soft-deleted rows:

```sql
-- Only index non-deleted rows
CREATE INDEX idx_customers_active ON customers(company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_vendors_active ON vendors(company_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_jobs_open ON jobs(company_id, created_at DESC)
  WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled', 'archived');
```

---

## Index Review Process

Before adding any index in production:
1. Run `EXPLAIN ANALYZE` on the target query
2. Confirm the query uses a sequential scan that could be improved
3. Estimate table size and write frequency
4. Test the index in staging first
5. Monitor `pg_stat_user_indexes` to confirm index usage after 7 days
6. Drop unused indexes after 30 days

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| `SELECT *` on large tables | Too many columns loaded | Select only needed columns |
| Filter on unindexed column | Sequential scan | Add index |
| `LIKE '%search%'` on large table | Cannot use B-tree index | Use `pg_trgm` index or full-text search |
| Filter on `company_id` without index | Slow RLS + query | Always index `company_id` |
| No index on `deleted_at` filter | Full scan for soft-delete | Add partial index |
| Too many indexes on write-heavy table | Slow INSERT/UPDATE | Audit and remove unused indexes |
