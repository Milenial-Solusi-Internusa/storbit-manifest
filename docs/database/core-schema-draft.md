# Nexus by MSI — Core Schema Draft

**Last Updated:** 2026-05-24
**Phase 1.0B Status:** Migration draft SQL complete — `/supabase/migrations/` files 001–012 written. DRAFT — do NOT execute without explicit approval.

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

### `status_catalog`
```sql
-- Global. No company_id. Super Admin manages; all authenticated users read.
-- Status values are stored as varchar(50) in document tables — NOT as FK.
-- Source: docs/workflow/status-lifecycle.md | Migration: 20260524000003
id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4()
code               varchar(50) NOT NULL UNIQUE      -- draft, submitted, under_review, etc.
label              varchar(100) NOT NULL
description        text
color_class        varchar(100)                     -- Tailwind CSS badge classes
applicable_modules jsonb                            -- JSON array of module slugs, NULL = all
is_terminal        boolean NOT NULL DEFAULT false   -- true = no further transitions
sort_order         smallint NOT NULL DEFAULT 0
is_active          boolean NOT NULL DEFAULT true
created_at         timestamptz NOT NULL DEFAULT now()
updated_at         timestamptz NOT NULL DEFAULT now()
```

**Seeded status codes (13):** `draft`, `submitted`, `under_review`, `revision_requested`,
`revised`, `approved`, `rejected`, `cancelled`, `in_progress`, `completed`, `archived`,
`on_hold`, `overdue`

**Terminal statuses:** `rejected`, `cancelled`, `completed`, `archived`

---

### `document_types`
```sql
-- Company-scoped. Configures numbering and approval per doc type per company.
-- department_code is varchar — NOT FK to departments (decoupled intentionally).
-- Migration: 20260524000004
id                uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id        uuid NOT NULL REFERENCES companies(id)
module            varchar(50) NOT NULL              -- sales, operations, procurement, finance, etc.
code              varchar(20) NOT NULL              -- QT, SP, SHP, CUS, TRD, PR, PO, GRN, INV, RCP, PV, JE, AST, TCK, HRG
name              varchar(100) NOT NULL
prefix_format     varchar(100) NOT NULL DEFAULT '{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}'
department_code   varchar(20) NOT NULL              -- default dept segment: SLS, LOG, PROC, FIN, IT, HR
reset_period      varchar(10) NOT NULL DEFAULT 'yearly' CHECK (reset_period IN ('yearly','monthly'))
seq_padding       smallint NOT NULL DEFAULT 4       -- zero-padding width: 4 → 0001
approval_required boolean NOT NULL DEFAULT true
is_active         boolean NOT NULL DEFAULT true
created_by        uuid REFERENCES auth.users(id)
created_at        timestamptz NOT NULL DEFAULT now()
updated_at        timestamptz NOT NULL DEFAULT now()
UNIQUE (company_id, code)
```

**Seeded doc codes (15 × 3 companies = 45 rows):**
`QT`, `SP`, `SHP`, `CUS`, `TRD`, `PR`, `PO`, `GRN`, `INV`, `RCP`, `PV`, `JE`, `AST`, `TCK`, `HRG`

### `document_sequences`
```sql
-- Company-scoped. Running counter per (company, doc_type, dept, year, month).
-- CRITICAL: Increment using atomic UPDATE ... RETURNING — never SELECT then UPDATE.
-- Migration: 20260524000004
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
document_type   varchar(20) NOT NULL               -- by-convention FK to document_types.code
department_code varchar(20) NOT NULL
year            smallint NOT NULL
month           smallint NOT NULL DEFAULT 0        -- 0 = yearly reset, 1–12 = monthly
last_sequence   integer NOT NULL DEFAULT 0
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
UNIQUE (company_id, document_type, department_code, year, month)
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
-- Immutable. Append-only — never UPDATE or DELETE rows.
-- Migration: 20260524000010
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
document_type   varchar(20) NOT NULL
document_id     uuid NOT NULL
document_no     varchar(100)
action          varchar(30) NOT NULL              -- submit, approve, reject, revision_requested, revise, cancel, delegate, on_hold, resume
from_status     varchar(50) NOT NULL
to_status       varchar(50) NOT NULL
actor_id        uuid NOT NULL REFERENCES auth.users(id)
sequence_level  smallint NOT NULL DEFAULT 1
notes           text
acted_at        timestamptz NOT NULL DEFAULT now()
created_at      timestamptz NOT NULL DEFAULT now()
```

### `approval_delegations`
```sql
-- Company-scoped. Temporary approval authority transfer. Must be Admin-approved.
-- Migration: 20260524000010
id               uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id       uuid NOT NULL REFERENCES companies(id)
delegator_id     uuid NOT NULL REFERENCES auth.users(id)
delegate_id      uuid NOT NULL REFERENCES auth.users(id)
document_types   jsonb NOT NULL DEFAULT '[]'      -- [] = all, ["QT","SP"] = specific
valid_from       timestamptz NOT NULL
valid_until      timestamptz NOT NULL             -- CHECK valid_until > valid_from
reason           text
approved_by      uuid REFERENCES auth.users(id)
approved_at      timestamptz
is_active        boolean NOT NULL DEFAULT false   -- false until Admin approves
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
```

---

## Finance / Reference Tables

### `taxes`
```sql
-- Company-scoped. Indonesian context: PPN 11%, PPh23 2%, PPh21 5%.
-- NEVER change rate on a code used in posted transactions. Deactivate + create new.
-- Migration: 20260524000006
id             uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id     uuid NOT NULL REFERENCES companies(id)
code           varchar(20) NOT NULL               -- PPN11, PPH23, PPH21, TAXFREE
name           varchar(100) NOT NULL
rate           numeric(7,4) NOT NULL CHECK (rate >= 0)  -- 11.0000 = 11%
tax_type       varchar(30) NOT NULL DEFAULT 'percentage' -- percentage / fixed
is_inclusive   boolean NOT NULL DEFAULT false     -- true = tax included in price
gl_account_id  uuid REFERENCES chart_of_accounts(id)    -- nullable until Phase 3
is_active      boolean NOT NULL DEFAULT true
created_by     uuid REFERENCES auth.users(id)
created_at     timestamptz NOT NULL DEFAULT now()
updated_at     timestamptz NOT NULL DEFAULT now()
deleted_at     timestamptz
UNIQUE (company_id, code)
```

**Seeded tax codes (4 × 3 companies = 12 rows):** `PPN11` (11%), `PPH23` (2%), `PPH21` (5%), `TAXFREE` (0%)

### `payment_terms`
```sql
-- Company-scoped. Replaces raw integer payment_terms on customers/vendors.
-- Phase 1.0F: migrate customers.payment_terms (int) → payment_terms_id (FK).
-- Migration: 20260524000006
id          uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id  uuid NOT NULL REFERENCES companies(id)
code        varchar(20) NOT NULL                  -- COD, NET15, NET30, NET45, NET60, 50UP
name        varchar(100) NOT NULL
days_due    integer NOT NULL DEFAULT 0 CHECK (days_due >= 0)
description text
is_active   boolean NOT NULL DEFAULT true
created_by  uuid REFERENCES auth.users(id)
created_at  timestamptz NOT NULL DEFAULT now()
updated_at  timestamptz NOT NULL DEFAULT now()
deleted_at  timestamptz
UNIQUE (company_id, code)
```

**Seeded terms (6 × 3 companies = 18 rows):** `COD` (0d), `NET15`, `NET30`, `NET45`, `NET60`, `50UP`

### `currencies`
```sql
-- Global. ISO 4217. No company_id. Super Admin manages; all users read.
-- Migration: 20260524000006
code           varchar(3) PRIMARY KEY             -- IDR, USD, SGD, EUR, JPY
name           varchar(100) NOT NULL
symbol         varchar(10)
decimal_places smallint NOT NULL DEFAULT 2
is_active      boolean NOT NULL DEFAULT true
created_at     timestamptz NOT NULL DEFAULT now()
updated_at     timestamptz NOT NULL DEFAULT now()
```

**Seeded:** `IDR` (0 dp), `USD` (2 dp), `SGD` (2 dp), `EUR` (2 dp), `JPY` (0 dp)

### `exchange_rates`
```sql
-- Company-scoped. Daily/monthly rates. Never delete historical rates.
-- Most recent rate on or before transaction date is used for conversion.
-- Migration: 20260524000006
id               uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id       uuid NOT NULL REFERENCES companies(id)
from_currency    varchar(3) NOT NULL REFERENCES currencies(code)
to_currency      varchar(3) NOT NULL REFERENCES currencies(code)
rate             numeric(18,6) NOT NULL CHECK (rate > 0)
effective_date   date NOT NULL
notes            text
created_by       uuid REFERENCES auth.users(id)
created_at       timestamptz NOT NULL DEFAULT now()
updated_at       timestamptz NOT NULL DEFAULT now()
UNIQUE (company_id, from_currency, to_currency, effective_date)
CHECK (from_currency <> to_currency)
```

---

## Finance Accounting Tables

### `cost_centers`
```sql
-- Company-scoped. P2 priority — needed before Phase 3 job costing.
-- Migration: 20260524000011
id            uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id    uuid NOT NULL REFERENCES companies(id)
branch_id     uuid REFERENCES branches(id)        -- optional
department_id uuid REFERENCES departments(id)     -- optional
code          varchar(20) NOT NULL
name          varchar(100) NOT NULL
description   text
is_active     boolean NOT NULL DEFAULT true
created_by    uuid REFERENCES auth.users(id)
created_at    timestamptz NOT NULL DEFAULT now()
updated_at    timestamptz NOT NULL DEFAULT now()
deleted_at    timestamptz
UNIQUE (company_id, code)
```

### `chart_of_accounts`
```sql
-- Company-scoped. P2 priority — Finance Controller must approve before use.
-- Hierarchical: level 1=Type, 2=Group, 3=Sub-Group, 4=Detail (leaf only).
-- is_header=true: summary account, no direct journal postings allowed.
-- Migration: 20260524000011
id              uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id      uuid NOT NULL REFERENCES companies(id)
code            varchar(20) NOT NULL
name            varchar(150) NOT NULL
account_type    varchar(20) NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense'))
parent_id       uuid REFERENCES chart_of_accounts(id)
level           smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4)
is_header       boolean NOT NULL DEFAULT false    -- true = no direct postings
normal_balance  varchar(6) NOT NULL DEFAULT 'debit' CHECK (normal_balance IN ('debit','credit'))
description     text
is_active       boolean NOT NULL DEFAULT true
created_by      uuid REFERENCES auth.users(id)
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
deleted_at      timestamptz                       -- only if no transactions reference the account
UNIQUE (company_id, code)
```

---

## Asset Management Tables (P3 — Phase 4.2)

> Schema defined in Phase 1.0B for completeness. No seed data. No UI until Phase 4.2.

### `asset_categories`
```sql
-- Migration: 20260524000012
id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id           uuid NOT NULL REFERENCES companies(id)
code                 varchar(20) NOT NULL           -- IT-EQP, FURN, VEH, BLDG
name                 varchar(100) NOT NULL
useful_life_years    smallint CHECK (useful_life_years > 0)
depreciation_method  varchar(20) NOT NULL DEFAULT 'straight_line'
                     CHECK (depreciation_method IN ('straight_line','double_declining','none'))
is_active            boolean NOT NULL DEFAULT true
created_by           uuid REFERENCES auth.users(id)
created_at           timestamptz NOT NULL DEFAULT now()
updated_at           timestamptz NOT NULL DEFAULT now()
deleted_at           timestamptz
UNIQUE (company_id, code)
```

### `asset_locations`
```sql
-- Migration: 20260524000012
id          uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id  uuid NOT NULL REFERENCES companies(id)
branch_id   uuid NOT NULL REFERENCES branches(id) -- required: assets always at a branch
code        varchar(20) NOT NULL
name        varchar(100) NOT NULL
description text
is_active   boolean NOT NULL DEFAULT true
created_by  uuid REFERENCES auth.users(id)
created_at  timestamptz NOT NULL DEFAULT now()
updated_at  timestamptz NOT NULL DEFAULT now()
deleted_at  timestamptz
UNIQUE (company_id, code)
```

### `assets`
```sql
-- asset_no format: AST/{ENTITY}/{DEPT}/{YYYY}/{SEQ} e.g. AST/MSI/IT/2026/0001
-- Disposal via approval workflow — never hard delete.
-- Migration: 20260524000012
id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4()
company_id                  uuid NOT NULL REFERENCES companies(id)
asset_no                    varchar(50) NOT NULL                          -- doc number format
name                        varchar(150) NOT NULL
category_id                 uuid NOT NULL REFERENCES asset_categories(id)
location_id                 uuid REFERENCES asset_locations(id)
purchase_date               date
purchase_price              numeric(18,2) DEFAULT 0
useful_life_years           smallint                                      -- overrides category default
depreciation_method         varchar(20)                                   -- overrides category default
accumulated_depreciation    numeric(18,2) NOT NULL DEFAULT 0
book_value                  numeric(18,2) DEFAULT 0                       -- purchase_price - accumulated_depreciation
status                      varchar(30) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','disposed','in_repair','retired','transferred'))
assigned_to_user_id         uuid REFERENCES auth.users(id)
coa_asset_account_id        uuid REFERENCES chart_of_accounts(id)        -- nullable until Phase 3
coa_depreciation_account_id uuid REFERENCES chart_of_accounts(id)
coa_expense_account_id      uuid REFERENCES chart_of_accounts(id)
is_active                   boolean NOT NULL DEFAULT true
created_by                  uuid REFERENCES auth.users(id)
updated_by                  uuid REFERENCES auth.users(id)
created_at                  timestamptz NOT NULL DEFAULT now()
updated_at                  timestamptz NOT NULL DEFAULT now()
deleted_at                  timestamptz
UNIQUE (company_id, asset_no)
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
