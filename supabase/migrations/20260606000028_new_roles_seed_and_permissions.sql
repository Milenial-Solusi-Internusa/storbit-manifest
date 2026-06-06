-- =============================================================================
-- Migration: 20260606000028_new_roles_seed_and_permissions
-- Phase:     Post-2.0C — Role restructure permissions seed
-- Purpose:   1. Ensure all 13 current active roles exist in the roles table
--               for all 3 companies (ceo, gm, manager, finance, operations,
--               sales, procurement, hrga, it — new codes from June 2026 restructure).
--            2. Seed role_permissions for roles that have 0 permissions.
-- Depends:   20260524000005_roles_permissions, 20260524000013_role_permissions_seed
-- Run order: 28
-- Safe:      ON CONFLICT DO NOTHING throughout — fully idempotent.
-- =============================================================================

-- ROLLBACK NOTE:
-- To undo permission grants for these roles only:
-- DELETE FROM role_permissions rp
-- USING roles r
-- WHERE rp.role_id = r.id
--   AND r.code IN ('ceo','gm','manager','finance','operations','sales','procurement','hrga','it');
-- To undo role rows (only if no users assigned):
-- UPDATE roles SET deleted_at = now()
-- WHERE code IN ('ceo','gm','manager','finance','operations','sales','procurement','hrga','it')
--   AND deleted_at IS NULL;
-- =============================================================================

-- =============================================================================
-- STEP 1: Ensure role rows exist for all 3 companies
-- Covers: ceo, gm, manager, finance, operations, sales, procurement, hrga, it
-- (super_admin, admin, finance_controller, viewer already seeded in migration 005)
-- =============================================================================
INSERT INTO roles (company_id, code, name, description, is_system_role, is_active)
SELECT
    c.id,
    r.code,
    r.name,
    r.description,
    true,
    true
FROM companies c
CROSS JOIN (VALUES
    ('ceo',         'CEO / Executive',      'Board of Directors and C-level. Strategic view and final approval authority.'),
    ('gm',          'GM / Senior GM',       'General Manager. Approve and report across departments.'),
    ('manager',     'Manager',              'Department Manager. Manage team operations and approve documents.'),
    ('finance',     'Finance Staff',        'Finance data entry and day-to-day finance operations.'),
    ('operations',  'Operations',           'Logistics and operations staff. Job and shipment management.'),
    ('sales',       'Sales / BD',           'Sales and Business Development. Quotation and customer management.'),
    ('procurement', 'Procurement',          'Procurement staff. Purchase request and PO data entry.'),
    ('hrga',        'HRGA',                 'Human Resources and General Affairs staff.'),
    ('it',          'IT Staff',             'IT Developer and Helpdesk. System and access management.')
) AS r(code, name, description)
WHERE c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;

-- =============================================================================
-- STEP 2: Seed role_permissions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ROLE: ceo (replaces bod — same permission set)
-- Strategic view and final approval authority.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    ('branches',         'view'),
    ('departments',      'view'),
    ('users',            'view'),
    ('customers',        'view'),
    ('customers',        'export'),
    ('vendors',          'view'),
    ('vendors',          'export'),
    ('products',         'view'),
    ('quotations',       'view'),
    ('quotations',       'approve'),
    ('quotations',       'export'),
    ('quotations',       'print'),
    ('sales_orders',     'view'),
    ('sales_orders',     'approve'),
    ('sales_orders',     'export'),
    ('shipments',        'view'),
    ('shipments',        'approve'),
    ('shipments',        'export'),
    ('purchase_requests','view'),
    ('purchase_requests','approve'),
    ('purchase_orders',  'view'),
    ('purchase_orders',  'approve'),
    ('purchase_orders',  'export'),
    ('invoices',         'view'),
    ('invoices',         'approve'),
    ('invoices',         'export'),
    ('invoices',         'print'),
    ('payments',         'view'),
    ('payments',         'approve'),
    ('payments',         'export'),
    ('ar',               'view'),
    ('ar',               'export'),
    ('ap',               'view'),
    ('ap',               'export'),
    ('journal_entries',  'view'),
    ('journal_entries',  'approve'),
    ('journal_entries',  'export'),
    ('reports',          'view'),
    ('reports',          'export'),
    ('settings',         'view')
)
WHERE r.code = 'ceo'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: gm (GM / Senior GM)
-- View all modules. Approve key documents.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    ('branches',         'view'),
    ('departments',      'view'),
    ('users',            'view'),
    ('customers',        'view'),
    ('customers',        'export'),
    ('vendors',          'view'),
    ('vendors',          'export'),
    ('products',         'view'),
    ('quotations',       'view'),
    ('quotations',       'approve'),
    ('quotations',       'export'),
    ('quotations',       'print'),
    ('sales_orders',     'view'),
    ('sales_orders',     'approve'),
    ('sales_orders',     'export'),
    ('shipments',        'view'),
    ('shipments',        'export'),
    ('purchase_requests','view'),
    ('purchase_requests','approve'),
    ('purchase_orders',  'view'),
    ('purchase_orders',  'approve'),
    ('purchase_orders',  'export'),
    ('invoices',         'view'),
    ('invoices',         'approve'),
    ('invoices',         'export'),
    ('invoices',         'print'),
    ('payments',         'view'),
    ('payments',         'approve'),
    ('payments',         'export'),
    ('ar',               'view'),
    ('ar',               'export'),
    ('ap',               'view'),
    ('ap',               'export'),
    ('journal_entries',  'view'),
    ('journal_entries',  'approve'),
    ('journal_entries',  'export'),
    ('reports',          'view'),
    ('reports',          'export'),
    ('settings',         'view')
)
WHERE r.code = 'gm'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: manager
-- View+create+edit on sales_orders, shipments, quotations, customers,
-- purchase_requests. View only on others.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    ('branches',         'view'),
    ('departments',      'view'),
    ('users',            'view'),
    -- Customers — manage
    ('customers',        'view'),
    ('customers',        'create'),
    ('customers',        'edit'),
    ('customers',        'export'),
    ('vendors',          'view'),
    ('products',         'view'),
    -- Quotations — create/edit/submit
    ('quotations',       'view'),
    ('quotations',       'create'),
    ('quotations',       'edit'),
    ('quotations',       'submit'),
    ('quotations',       'export'),
    ('quotations',       'print'),
    -- Sales Orders — create/edit/submit
    ('sales_orders',     'view'),
    ('sales_orders',     'create'),
    ('sales_orders',     'edit'),
    ('sales_orders',     'submit'),
    ('sales_orders',     'export'),
    -- Shipments — create/edit
    ('shipments',        'view'),
    ('shipments',        'create'),
    ('shipments',        'edit'),
    ('shipments',        'export'),
    -- Purchase Requests — create/edit/submit
    ('purchase_requests','view'),
    ('purchase_requests','create'),
    ('purchase_requests','edit'),
    ('purchase_requests','submit'),
    -- Purchase Orders — view
    ('purchase_orders',  'view'),
    -- Finance — view only
    ('invoices',         'view'),
    ('invoices',         'print'),
    ('payments',         'view'),
    ('ar',               'view'),
    ('ap',               'view'),
    ('journal_entries',  'view'),
    ('reports',          'view'),
    ('reports',          'export')
)
WHERE r.code = 'manager'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: finance (maps to finance_staff behavior)
-- Full access: invoices, payments, ar, ap, journal_entries.
-- View only on other modules.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    ('customers',        'view'),
    ('vendors',          'view'),
    ('products',         'view'),
    ('sales_orders',     'view'),
    ('shipments',        'view'),
    -- Finance — FULL ACCESS (no approve — that's finance_controller)
    ('invoices',         'view'),
    ('invoices',         'create'),
    ('invoices',         'edit'),
    ('invoices',         'submit'),
    ('invoices',         'export'),
    ('invoices',         'print'),
    ('payments',         'view'),
    ('payments',         'create'),
    ('payments',         'export'),
    ('ar',               'view'),
    ('ar',               'export'),
    ('ap',               'view'),
    ('ap',               'export'),
    ('journal_entries',  'view'),
    ('journal_entries',  'create'),
    ('journal_entries',  'export'),
    ('reports',          'view')
)
WHERE r.code = 'finance'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: operations (maps to operations_staff behavior)
-- Full access: sales_orders, shipments.
-- View only on others.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    ('customers',    'view'),
    ('vendors',      'view'),
    ('products',     'view'),
    -- Sales Orders — FULL ACCESS
    ('sales_orders', 'view'),
    ('sales_orders', 'create'),
    ('sales_orders', 'edit'),
    ('sales_orders', 'submit'),
    ('sales_orders', 'export'),
    -- Shipments — FULL ACCESS
    ('shipments',    'view'),
    ('shipments',    'create'),
    ('shipments',    'edit'),
    ('shipments',    'delete'),
    ('shipments',    'export'),
    -- Finance (view only — job-level context)
    ('invoices',     'view'),
    ('ar',           'view'),
    ('reports',      'view')
)
WHERE r.code = 'operations'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: sales (maps to sales_staff behavior)
-- Full access: quotations, customers.
-- View only: sales_orders, shipments, others.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    -- Customers — create/edit (not delete — protect master data)
    ('customers',    'view'),
    ('customers',    'create'),
    ('customers',    'edit'),
    ('customers',    'export'),
    ('vendors',      'view'),
    ('products',     'view'),
    -- Quotations — FULL ACCESS (no approve)
    ('quotations',   'view'),
    ('quotations',   'create'),
    ('quotations',   'edit'),
    ('quotations',   'submit'),
    ('quotations',   'delete'),
    ('quotations',   'export'),
    ('quotations',   'print'),
    -- Sales Orders — view + create + submit
    ('sales_orders', 'view'),
    ('sales_orders', 'create'),
    ('sales_orders', 'submit'),
    -- Shipments — view only
    ('shipments',    'view'),
    ('invoices',     'view'),
    ('invoices',     'print'),
    ('ar',           'view'),
    ('reports',      'view')
)
WHERE r.code = 'sales'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: procurement (maps to procurement_staff behavior)
-- Full access: purchase_orders, purchase_requests, vendors, products.
-- View only on others.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    ('customers',        'view'),
    -- Vendors — FULL ACCESS
    ('vendors',          'view'),
    ('vendors',          'create'),
    ('vendors',          'edit'),
    ('vendors',          'delete'),
    ('vendors',          'export'),
    -- Products — FULL ACCESS
    ('products',         'view'),
    ('products',         'create'),
    ('products',         'edit'),
    ('products',         'delete'),
    -- Purchase Requests — FULL ACCESS (no approve)
    ('purchase_requests','view'),
    ('purchase_requests','create'),
    ('purchase_requests','edit'),
    ('purchase_requests','submit'),
    ('purchase_requests','delete'),
    -- Purchase Orders — FULL ACCESS (no approve)
    ('purchase_orders',  'view'),
    ('purchase_orders',  'create'),
    ('purchase_orders',  'edit'),
    ('purchase_orders',  'submit'),
    ('purchase_orders',  'delete'),
    ('purchase_orders',  'export'),
    ('ap',               'view'),
    ('reports',          'view')
)
WHERE r.code = 'procurement'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: hrga
-- Full access: users.
-- View only on others (needs org visibility for HR processes).
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    ('branches',     'view'),
    ('departments',  'view'),
    -- Users — FULL ACCESS
    ('users',        'view'),
    ('users',        'create'),
    ('users',        'edit'),
    ('users',        'delete'),
    ('users',        'export'),
    -- Roles — view only (to assign users to roles)
    ('roles',        'view'),
    ('customers',    'view'),
    ('vendors',      'view'),
    ('reports',      'view')
)
WHERE r.code = 'hrga'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE: it
-- Full access: roles, settings, users, audit_logs.
-- View only on others.
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    ('branches',     'view'),
    ('departments',  'view'),
    -- Users — FULL ACCESS (system support)
    ('users',        'view'),
    ('users',        'create'),
    ('users',        'edit'),
    ('users',        'delete'),
    ('users',        'export'),
    -- Roles — FULL ACCESS
    ('roles',        'view'),
    ('roles',        'create'),
    ('roles',        'edit'),
    ('roles',        'delete'),
    -- Settings — FULL ACCESS
    ('settings',     'view'),
    ('settings',     'config'),
    -- Audit Logs — view
    ('audit_logs',   'view'),
    ('customers',    'view'),
    ('vendors',      'view'),
    ('products',     'view'),
    ('reports',      'view')
)
WHERE r.code = 'it'
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- GRANTS: ensure authenticated role can read/write role_permissions
-- (tables created via CLI may not have auto-grants)
-- =============================================================================
GRANT SELECT, INSERT, DELETE ON role_permissions TO authenticated;
GRANT SELECT ON permissions TO authenticated;
GRANT SELECT ON roles TO authenticated;

-- =============================================================================
-- VERIFICATION:
-- SELECT r.code, COUNT(rp.id) AS perm_count
-- FROM roles r
-- LEFT JOIN role_permissions rp ON rp.role_id = r.id
-- JOIN companies c ON c.id = r.company_id AND c.code = 'MSI'
-- WHERE r.deleted_at IS NULL
-- GROUP BY r.code
-- ORDER BY perm_count DESC;
-- =============================================================================
