# Nexus by MSI — Core Schema Draft

**Last Updated:** 2026-05-23  
**Status:** Draft — No schema changes allowed without explicit approval

---

## Important Notice

> This is a planning document only.  
> Do NOT apply any of these schema changes to the database without explicit approval.  
> All schema changes must go through a review cycle: Draft → Review → Approved → Applied.

---

## Design Principles

1. All business tables must include `company_id` — RLS scoped by company
2. All business tables must include `created_by`, `updated_by`
3. All business tables must include `created_at`, `updated_at`
4. All business tables must include `deleted_at` (soft delete)
5. All business tables must include `is_active` where applicable
6. UUIDs for all primary keys (`uuid_generate_v4()`)
7. Status values from `status_catalog` or ENUM — no free-form strings
8. Document numbers from `document_numbering` sequence — never manual
9. All financial amounts in `numeric(18,4)` — never float
10. All timestamps in UTC

---

## Foundation Tables

### `companies`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
code            varchar(20) NOT NULL UNIQUE       -- e.g. MSI, JCI, SBI
name            varchar(100) NOT NULL
legal_name      varchar(200)
business_focus  varchar(100)                      -- e.g. Freight Forwarding
address         text
phone           varchar(50)
email           varchar(100)
tax_id          varchar(50)
logo_url        text
is_active       boolean DEFAULT true
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### `branches`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(20) NOT NULL
name            varchar(100) NOT NULL
address         text
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

### `departments`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(20) NOT NULL
name            varchar(100) NOT NULL
parent_id       uuid REFERENCES departments(id)   -- for nested departments
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

### `positions`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
department_id   uuid REFERENCES departments(id)
code            varchar(20) NOT NULL
name            varchar(100) NOT NULL
level           varchar(50)                       -- e.g. Staff, Supervisor, Manager, Head, Director
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

---

## Access Control Tables

### `roles`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(50) NOT NULL
name            varchar(100) NOT NULL
description     text
is_system_role  boolean DEFAULT false             -- system roles cannot be deleted
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

### `permissions`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
module          varchar(50) NOT NULL              -- e.g. customer, invoice, job
action          varchar(50) NOT NULL              -- e.g. view, create, edit, delete, approve, export
description     text
created_at      timestamptz DEFAULT now()
```

### `role_permissions`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
role_id         uuid NOT NULL REFERENCES roles(id)
permission_id   uuid NOT NULL REFERENCES permissions(id)
UNIQUE (role_id, permission_id)
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
```

### `user_profiles`
```sql
id              uuid PRIMARY KEY REFERENCES auth.users(id)
company_id      uuid NOT NULL REFERENCES companies(id)
branch_id       uuid REFERENCES branches(id)
department_id   uuid REFERENCES departments(id)
position_id     uuid REFERENCES positions(id)
employee_id     varchar(50)
full_name       varchar(200) NOT NULL
email           varchar(200) NOT NULL
phone           varchar(50)
avatar_url      text
is_active       boolean DEFAULT true
mfa_required    boolean DEFAULT false
last_login_at   timestamptz
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

### `user_roles`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
user_id         uuid NOT NULL REFERENCES auth.users(id)
role_id         uuid NOT NULL REFERENCES roles(id)
company_id      uuid NOT NULL REFERENCES companies(id)
assigned_by     uuid REFERENCES auth.users(id)
valid_from      date
valid_until     date
is_active       boolean DEFAULT true
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

---

## Master Data Tables

### `customers`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(50) NOT NULL
name            varchar(200) NOT NULL
legal_name      varchar(200)
customer_type   varchar(50)                       -- e.g. Individual, Corporate
tax_id          varchar(50)
address         text
city            varchar(100)
country         varchar(100) DEFAULT 'Indonesia'
phone           varchar(50)
email           varchar(100)
pic_name        varchar(200)
pic_phone       varchar(50)
pic_email       varchar(100)
credit_limit    numeric(18,4) DEFAULT 0
payment_terms   integer DEFAULT 30               -- days
currency_code   varchar(10) DEFAULT 'IDR'
notes           text
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
updated_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

### `vendors`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(50) NOT NULL
name            varchar(200) NOT NULL
legal_name      varchar(200)
vendor_type     varchar(50)                       -- e.g. Shipping Line, Trucker, Supplier
tax_id          varchar(50)
address         text
city            varchar(100)
country         varchar(100) DEFAULT 'Indonesia'
phone           varchar(50)
email           varchar(100)
pic_name        varchar(200)
pic_phone       varchar(50)
bank_name       varchar(100)
bank_account    varchar(100)
bank_account_name varchar(200)
payment_terms   integer DEFAULT 30
currency_code   varchar(10) DEFAULT 'IDR'
notes           text
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
updated_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

### `products`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(50) NOT NULL
name            varchar(200) NOT NULL
category        varchar(100)
unit            varchar(50)
description     text
is_service      boolean DEFAULT false
default_price   numeric(18,4) DEFAULT 0
cogs_account_id uuid                              -- FK to chart_of_accounts (future)
revenue_account_id uuid                           -- FK to chart_of_accounts (future)
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
updated_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
deleted_at      timestamptz
```

---

## Platform Tables

### `document_types`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
module          varchar(50) NOT NULL              -- e.g. sales, job, invoice
code            varchar(20) NOT NULL              -- e.g. QT, SP, SHP, INV
name            varchar(100) NOT NULL
prefix_format   varchar(100)                      -- e.g. {DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}
sequence_prefix varchar(50)
reset_period    varchar(20) DEFAULT 'yearly'      -- yearly, monthly, never
last_sequence   integer DEFAULT 0
department_code varchar(20)
approval_required boolean DEFAULT false
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### `approval_rules`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
document_type   varchar(50) NOT NULL
department_id   uuid REFERENCES departments(id)
min_amount      numeric(18,4)
max_amount      numeric(18,4)
approver_role_id uuid REFERENCES roles(id)
approver_user_id uuid REFERENCES auth.users(id)
backup_approver_id uuid REFERENCES auth.users(id)
sequence_order  integer DEFAULT 1
is_active       boolean DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### `approval_logs`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
document_type   varchar(50) NOT NULL
document_id     uuid NOT NULL
document_no     varchar(100)
action          varchar(50) NOT NULL              -- submitted, approved, rejected, revision_requested
from_status     varchar(50)
to_status       varchar(50)
actor_id        uuid NOT NULL REFERENCES auth.users(id)
notes           text
created_at      timestamptz DEFAULT now()
```

### `audit_logs`
```sql
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid REFERENCES companies(id)
user_id         uuid REFERENCES auth.users(id)
event_type      varchar(100) NOT NULL
module          varchar(50)
record_id       uuid
record_type     varchar(100)
old_data        jsonb
new_data        jsonb
ip_address      inet
user_agent      text
metadata        jsonb
created_at      timestamptz DEFAULT now()
```

---

## Indexes — See `docs/database/indexing-strategy.md`

---

## RLS Policy Requirements

Every table with `company_id` must have:
```sql
-- View: user can only see their company's data
CREATE POLICY "company_isolation"
ON {table_name}
FOR SELECT
USING (company_id = get_user_company_id());

-- Mutate: user can only modify their company's data
CREATE POLICY "company_mutation"
ON {table_name}
FOR ALL
USING (company_id = get_user_company_id());
```

Additional role-based policies are applied per module sensitivity level.

---

## Soft Delete Convention

All business tables must implement soft delete:
```sql
-- Soft delete
UPDATE {table_name} SET deleted_at = now(), updated_by = auth.uid() WHERE id = $1;

-- Active records filter
WHERE deleted_at IS NULL

-- All records including deleted (audit/admin only)
WHERE TRUE
```

Never use hard DELETE on business data.
