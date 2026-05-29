-- =============================================================================
-- Migration: 20260524000005_roles_permissions
-- Phase:     1.0B — Schema / Migration Draft Review
-- Purpose:   Create roles, permissions, role_permissions, and user_roles tables.
--            Seed the 12 system roles for every active company and the global
--            permission catalog. Role-permission assignments (role_permissions)
--            are left for Phase 1.0C — the full permission matrix seed.
--            This replaces the hardcoded 5-value role enum in profiles.role,
--            which MUST remain during transition until Phase 1.0F is verified.
-- Depends:   20260524000001_companies
-- Run order: 5
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK:
-- DELETE FROM user_roles;
-- DELETE FROM role_permissions;
-- DELETE FROM roles WHERE code IN (
--     'super_admin','admin','bod','finance_controller','finance_staff',
--     'operations_head','operations_staff','sales_head','sales_staff',
--     'procurement_head','procurement_staff','viewer'
-- );
-- DELETE FROM permissions;
-- DROP TABLE IF EXISTS user_roles;
-- DROP TABLE IF EXISTS role_permissions;
-- DROP TABLE IF EXISTS permissions;
-- DROP TABLE IF EXISTS roles;
-- =============================================================================

-- =============================================================================
-- TABLE: permissions
-- Global scope — no company_id.
-- Defines all available {module}.{action} permission codes in the system.
-- Super Admin manages globally; company Admins cannot add new permission codes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS permissions (
    id          uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    module      varchar(50)  NOT NULL,   -- companies, branches, customers, sales_orders, etc.
    action      varchar(50)  NOT NULL,   -- view, create, edit, delete, approve, submit, export, etc.
    description text,
    created_at  timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT permissions_module_action_unique UNIQUE (module, action)
);

COMMENT ON TABLE  permissions        IS 'Global permission catalog. Every {module}.{action} combination that can be granted to a role. Managed by Super Admin only.';
COMMENT ON COLUMN permissions.module IS 'Module slug, e.g. companies, customers, sales_orders, invoices, users.';
COMMENT ON COLUMN permissions.action IS 'Action code: view, create, edit, delete, restore, approve, submit, export, import, print, config.';

CREATE INDEX IF NOT EXISTS idx_permissions_module
    ON permissions (module);

-- =============================================================================
-- TABLE: roles
-- Company-scoped. System roles are pre-seeded; companies can add custom roles.
-- is_system_role = true → cannot be renamed or deleted by company Admin.
-- =============================================================================
CREATE TABLE IF NOT EXISTS roles (
    id             uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id     uuid         NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    code           varchar(50)  NOT NULL,
    name           varchar(100) NOT NULL,
    description    text,
    is_system_role boolean      NOT NULL DEFAULT false,
    is_active      boolean      NOT NULL DEFAULT true,
    created_by     uuid         REFERENCES auth.users(id),
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    deleted_at     timestamptz,

    CONSTRAINT roles_company_code_unique UNIQUE (company_id, code)
);

COMMENT ON TABLE  roles                IS 'Named permission sets, company-scoped. System roles are pre-seeded and cannot be modified by company Admins.';
COMMENT ON COLUMN roles.code           IS 'Role code slug: super_admin, admin, bod, finance_controller, etc. Unique per company.';
COMMENT ON COLUMN roles.is_system_role IS 'True = seeded by platform, cannot be renamed or deleted by company admin.';
COMMENT ON COLUMN roles.deleted_at     IS 'Soft delete. Custom roles only — system roles may not be deleted.';

CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_roles_company_id
    ON roles (company_id);
CREATE INDEX IF NOT EXISTS idx_roles_deleted_at
    ON roles (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- TABLE: role_permissions
-- Junction table. Links a role to the permissions it grants.
-- No soft delete — revoke by deleting the row.
-- =============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id            uuid  PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id       uuid  NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid  NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by    uuid  REFERENCES auth.users(id),
    granted_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)
);

COMMENT ON TABLE role_permissions IS 'Links roles to permissions. No soft delete — revoke by deleting the row. Full matrix seed in Phase 1.0C.';

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id
    ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id
    ON role_permissions (permission_id);

-- =============================================================================
-- TABLE: user_roles
-- Company-scoped. Assigns one or more roles to a user within a company.
-- Valid from/until supports time-bound role grants (e.g. temporary delegation).
-- is_active flag allows instant revocation without deleting the row (audit trail).
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id     uuid        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    valid_from  date,
    valid_until date,
    is_active   boolean     NOT NULL DEFAULT true,
    granted_by  uuid        REFERENCES auth.users(id),
    granted_at  timestamptz NOT NULL DEFAULT now(),
    revoked_by  uuid        REFERENCES auth.users(id),
    revoked_at  timestamptz,

    CONSTRAINT user_roles_unique UNIQUE (user_id, role_id, company_id)
);

COMMENT ON TABLE  user_roles             IS 'User-to-role assignments. A user may have multiple roles within one company. valid_from/until enables time-bound grants.';
COMMENT ON COLUMN user_roles.is_active   IS 'False = role revoked. Row is kept for audit history.';
COMMENT ON COLUMN user_roles.valid_until IS 'NULL = no expiry. If set, role should be checked against current date at permission evaluation.';

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
    ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id
    ON user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id
    ON user_roles (company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_company
    ON user_roles (user_id, company_id) WHERE is_active = true;

-- =============================================================================
-- SEED: 12 system roles for every active company.
-- Source: docs/security/permission-matrix.md
-- Legacy role mapping (profiles.role enum → new role code):
--   super       → super_admin
--   logistic    → operations_staff
--   procurement → procurement_staff
--   finance     → finance_staff
--   management  → viewer
-- =============================================================================
INSERT INTO roles
    (company_id, code, name, description, is_system_role, is_active)
SELECT
    c.id,
    r.code,
    r.name,
    r.description,
    true,
    true
FROM   companies c
CROSS JOIN (
    VALUES
        ('super_admin',       'Super Admin',          'Full platform access across all companies. Super Admin only.'),
        ('admin',             'Admin',                'Company-level administrator. Full access within company except super-admin functions.'),
        ('bod',               'BOD / Director',       'Board of Directors. Strategic view and final approval authority.'),
        ('finance_controller','Finance Controller',   'Full finance access including credit limit, COA, and financial approval.'),
        ('finance_staff',     'Finance Staff',        'Finance data entry and day-to-day finance operations.'),
        ('operations_head',   'Operations Head',      'Full operations access, approval authority for jobs and shipments.'),
        ('operations_staff',  'Operations Staff',     'Job and shipment data entry. Maps from legacy role: logistic.'),
        ('sales_head',        'Sales Head',           'Full sales access, approval authority for quotations and sales orders.'),
        ('sales_staff',       'Sales Staff',          'Quotation and sales order entry.'),
        ('procurement_head',  'Procurement Head',     'Full procurement access, approval authority for PR and PO.'),
        ('procurement_staff', 'Procurement Staff',    'Purchase request and PO data entry. Maps from legacy role: procurement.'),
        ('viewer',            'Viewer',               'Read-only access to permitted modules. Maps from legacy role: management.')
) AS r(code, name, description)
WHERE  c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- SEED: global permission catalog.
-- Format: module + action. Each row = one permission code.
-- Role-permission assignments (role_permissions) are seeded in Phase 1.0C
-- after the full permission matrix is reviewed and approved.
-- Source: docs/security/permission-matrix.md
-- =============================================================================
INSERT INTO permissions (module, action, description)
VALUES
    -- Master Data: Company
    ('companies',       'view',   'View company records'),
    ('companies',       'edit',   'Edit company settings'),

    -- Master Data: Branches
    ('branches',        'view',   'View branches'),
    ('branches',        'create', 'Create new branches'),
    ('branches',        'edit',   'Edit branches'),
    ('branches',        'delete', 'Soft-delete branches'),

    -- Master Data: Departments
    ('departments',     'view',   'View departments'),
    ('departments',     'create', 'Create departments'),
    ('departments',     'edit',   'Edit departments'),
    ('departments',     'delete', 'Soft-delete departments'),

    -- Master Data: Users
    ('users',           'view',   'View user profiles'),
    ('users',           'create', 'Create new users'),
    ('users',           'edit',   'Edit user profiles'),
    ('users',           'delete', 'Deactivate/soft-delete users'),
    ('users',           'export', 'Export user list'),

    -- Master Data: Roles & Permissions
    ('roles',           'view',   'View roles and permissions'),
    ('roles',           'create', 'Create custom roles'),
    ('roles',           'edit',   'Edit role permissions'),
    ('roles',           'delete', 'Delete custom roles'),

    -- Master Data: Customers
    ('customers',       'view',   'View customer records'),
    ('customers',       'create', 'Create new customers'),
    ('customers',       'edit',   'Edit customer records'),
    ('customers',       'delete', 'Soft-delete customers'),
    ('customers',       'export', 'Export customer list'),
    ('customers',       'config', 'Configure customer settings (credit limit)'),

    -- Master Data: Vendors
    ('vendors',         'view',   'View vendor records'),
    ('vendors',         'create', 'Create new vendors'),
    ('vendors',         'edit',   'Edit vendor records'),
    ('vendors',         'delete', 'Soft-delete vendors'),
    ('vendors',         'export', 'Export vendor list'),

    -- Master Data: Products
    ('products',        'view',   'View product/service catalog'),
    ('products',        'create', 'Add products/services'),
    ('products',        'edit',   'Edit products/services'),
    ('products',        'delete', 'Soft-delete products/services'),

    -- Sales: Quotation
    ('quotations',      'view',   'View quotations'),
    ('quotations',      'create', 'Create quotations'),
    ('quotations',      'edit',   'Edit draft quotations'),
    ('quotations',      'submit', 'Submit quotation for approval'),
    ('quotations',      'approve','Approve or reject quotations'),
    ('quotations',      'delete', 'Soft-delete quotations'),
    ('quotations',      'export', 'Export quotation data'),
    ('quotations',      'print',  'Print/download quotation PDF'),

    -- Sales: Sales Order / SP
    ('sales_orders',    'view',   'View sales orders (SP)'),
    ('sales_orders',    'create', 'Create sales orders'),
    ('sales_orders',    'edit',   'Edit draft sales orders'),
    ('sales_orders',    'submit', 'Submit sales order for approval'),
    ('sales_orders',    'approve','Approve or reject sales orders'),
    ('sales_orders',    'delete', 'Soft-delete sales orders'),
    ('sales_orders',    'export', 'Export sales order data'),

    -- Operations: Shipment / Job
    ('shipments',       'view',   'View shipment/job records'),
    ('shipments',       'create', 'Create shipment/job cards'),
    ('shipments',       'edit',   'Update shipment/job status and data'),
    ('shipments',       'delete', 'Soft-delete shipments'),
    ('shipments',       'export', 'Export shipment data'),

    -- Procurement: Purchase Request
    ('purchase_requests','view',  'View purchase requests'),
    ('purchase_requests','create','Create purchase requests'),
    ('purchase_requests','edit',  'Edit draft purchase requests'),
    ('purchase_requests','submit','Submit PR for approval'),
    ('purchase_requests','approve','Approve or reject purchase requests'),
    ('purchase_requests','delete','Soft-delete purchase requests'),

    -- Procurement: Purchase Order
    ('purchase_orders', 'view',   'View purchase orders'),
    ('purchase_orders', 'create', 'Create purchase orders'),
    ('purchase_orders', 'edit',   'Edit purchase orders'),
    ('purchase_orders', 'submit', 'Submit PO for approval'),
    ('purchase_orders', 'approve','Approve or reject purchase orders'),
    ('purchase_orders', 'delete', 'Soft-delete purchase orders'),
    ('purchase_orders', 'export', 'Export PO data'),

    -- Finance: Invoice
    ('invoices',        'view',   'View invoices'),
    ('invoices',        'create', 'Create invoices'),
    ('invoices',        'edit',   'Edit draft invoices'),
    ('invoices',        'submit', 'Submit invoice for approval'),
    ('invoices',        'approve','Approve invoices'),
    ('invoices',        'delete', 'Soft-delete invoices'),
    ('invoices',        'export', 'Export invoice data'),
    ('invoices',        'print',  'Print/download invoice PDF'),

    -- Finance: Payments
    ('payments',        'view',   'View payment records'),
    ('payments',        'create', 'Record payments'),
    ('payments',        'approve','Approve payment vouchers'),
    ('payments',        'export', 'Export payment data'),

    -- Finance: AR / AP
    ('ar',              'view',   'View AR tracker'),
    ('ar',              'export', 'Export AR data'),
    ('ap',              'view',   'View AP tracker'),
    ('ap',              'export', 'Export AP data'),

    -- Accounting: Journal Entry
    ('journal_entries', 'view',   'View journal entries'),
    ('journal_entries', 'create', 'Create journal entries'),
    ('journal_entries', 'approve','Approve journal entries'),
    ('journal_entries', 'export', 'Export journal data'),

    -- Reports & Dashboard
    ('reports',         'view',   'View reports and dashboards'),
    ('reports',         'export', 'Export report data'),

    -- Settings
    ('settings',        'view',   'View module settings'),
    ('settings',        'config', 'Configure system settings (Admin only)'),

    -- Audit Log
    ('audit_logs',      'view',   'View audit log (Admin and above)')

ON CONFLICT (module, action) DO NOTHING;

-- =============================================================================
-- NOTE: role_permissions (which role gets which permission) are intentionally
-- NOT seeded here. They will be seeded in Phase 1.0C after the full
-- permission matrix in docs/security/permission-matrix.md is reviewed.
-- user_roles assignments happen in Phase 1.0F during user migration.
-- =============================================================================

-- =============================================================================
-- VERIFICATION QUERIES:
-- SELECT c.code AS company, r.code, r.name FROM roles r
-- JOIN companies c ON c.id = r.company_id
-- ORDER BY c.code, r.code;
-- Expected: 36 rows (12 roles × 3 companies)
--
-- SELECT module, COUNT(*) FROM permissions GROUP BY module ORDER BY module;
-- Expected: ~17 modules, ~80+ permission rows total
-- =============================================================================
