-- =============================================================================
-- Migration: 20260524000013_role_permissions_seed
-- Phase:     1.0C — Seed Strategy
-- Purpose:   Seed the role_permissions junction table with the full permission
--            matrix for all 12 system roles. This was explicitly deferred from
--            migration 005 to allow the permission matrix to be reviewed and
--            approved separately from the role and permission definitions.
--            Source: docs/security/permission-matrix.md
--            Companion: docs/database/seed-strategy.md section 3.8
-- Depends:   20260524000005_roles_permissions (roles and permissions must exist)
-- Run order: 13
-- Status:    DRAFT — do NOT execute without explicit approval
-- =============================================================================

-- ROLLBACK NOTE — MANUAL REVIEW REQUIRED:
-- This migration seeds role_permissions and uses ON CONFLICT DO NOTHING.
-- Do NOT run a blanket DELETE FROM role_permissions in production.
-- Before rollback, confirm which assignments were introduced by this migration.
-- Suggested manual rollback pattern, only after verification and approval:
-- DELETE FROM role_permissions rp
-- USING roles r
-- WHERE rp.role_id = r.id
--   AND r.code IN (
--     'super_admin','admin','bod','finance_controller','finance_staff',
--     'operations_head','operations_staff','sales_head','sales_staff',
--     'procurement_head','procurement_staff','viewer'
--   );
-- =============================================================================

-- =============================================================================
-- APPROACH:
-- Each INSERT block uses a subquery that:
--   1. Selects all role rows matching the given code (one per company — 3 rows)
--   2. Joins to the permissions table by (module, action) pair
--   3. Uses ON CONFLICT (role_id, permission_id) DO NOTHING for idempotency
--
-- Run order within this file: super_admin first (broadest), then narrow roles.
-- =============================================================================

-- =============================================================================
-- ROLE: super_admin
-- Full platform access — all permissions granted.
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON true
WHERE  r.code = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: admin
-- Company-level administrator. All permissions EXCEPT:
--   - companies.edit  (Super Admin only — company settings are global)
--   - settings.config (Super Admin only — platform configuration)
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) NOT IN (
    ('companies', 'edit'),
    ('settings',  'config')
)
WHERE  r.code = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: bod (BOD / Director)
-- Strategic view and final approval authority.
-- Can view everything relevant to business performance.
-- Can approve key documents (quotations, SPs, invoices, POs, journal entries).
-- Cannot create or edit documents — that is operations' responsibility.
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    -- Organization (view only)
    ('companies',        'view'),
    ('branches',         'view'),
    ('departments',      'view'),
    ('users',            'view'),
    -- Master data (view + export)
    ('customers',        'view'),
    ('customers',        'export'),
    ('vendors',          'view'),
    ('vendors',          'export'),
    ('products',         'view'),
    -- Sales (view + approve + export)
    ('quotations',       'view'),
    ('quotations',       'approve'),
    ('quotations',       'export'),
    ('quotations',       'print'),
    ('sales_orders',     'view'),
    ('sales_orders',     'approve'),
    ('sales_orders',     'export'),
    -- Operations (view + approve + export)
    ('shipments',        'view'),
    ('shipments',        'approve'),
    ('shipments',        'export'),
    -- Procurement (view + approve + export)
    ('purchase_requests','view'),
    ('purchase_requests','approve'),
    ('purchase_orders',  'view'),
    ('purchase_orders',  'approve'),
    ('purchase_orders',  'export'),
    -- Finance (view + approve + export + print)
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
    -- Accounting (view + approve + export)
    ('journal_entries',  'view'),
    ('journal_entries',  'approve'),
    ('journal_entries',  'export'),
    -- Platform
    ('reports',          'view'),
    ('reports',          'export'),
    ('settings',         'view')
)
WHERE  r.code = 'bod'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: finance_controller
-- Full finance access. Approval authority for invoices, payments, journal entries.
-- Can view all business modules (needed for full financial picture).
-- Can manage credit limits (customers.config).
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    -- Organization (view)
    ('companies',        'view'),
    ('branches',         'view'),
    ('departments',      'view'),
    -- Master data
    ('customers',        'view'),
    ('customers',        'export'),
    ('customers',        'config'),   -- credit limit management
    ('vendors',          'view'),
    ('vendors',          'export'),
    ('products',         'view'),
    -- Sales (view + export — cannot create/approve sales docs)
    ('quotations',       'view'),
    ('quotations',       'export'),
    ('sales_orders',     'view'),
    ('sales_orders',     'export'),
    -- Operations (view + export)
    ('shipments',        'view'),
    ('shipments',        'export'),
    -- Procurement (view + export)
    ('purchase_requests','view'),
    ('purchase_orders',  'view'),
    ('purchase_orders',  'export'),
    -- Finance — FULL ACCESS
    ('invoices',         'view'),
    ('invoices',         'create'),
    ('invoices',         'edit'),
    ('invoices',         'submit'),
    ('invoices',         'approve'),
    ('invoices',         'delete'),
    ('invoices',         'export'),
    ('invoices',         'print'),
    ('payments',         'view'),
    ('payments',         'create'),
    ('payments',         'approve'),
    ('payments',         'export'),
    ('ar',               'view'),
    ('ar',               'export'),
    ('ap',               'view'),
    ('ap',               'export'),
    -- Accounting — full access
    ('journal_entries',  'view'),
    ('journal_entries',  'create'),
    ('journal_entries',  'approve'),
    ('journal_entries',  'export'),
    -- Platform
    ('reports',          'view'),
    ('reports',          'export'),
    ('settings',         'view'),
    ('audit_logs',       'view')
)
WHERE  r.code = 'finance_controller'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: finance_staff
-- Finance data entry. Can create/edit invoices and record payments.
-- Cannot approve — approval authority belongs to finance_controller.
-- Cannot view cost-sensitive vendor bank details or credit limits (role check in app).
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',       'view'),
    ('customers',       'view'),
    ('vendors',         'view'),
    ('products',        'view'),
    -- Sales (view only — needed to create invoices from orders)
    ('sales_orders',    'view'),
    ('shipments',       'view'),
    -- Finance — create/edit/submit but NOT approve
    ('invoices',        'view'),
    ('invoices',        'create'),
    ('invoices',        'edit'),
    ('invoices',        'submit'),
    ('invoices',        'export'),
    ('invoices',        'print'),
    ('payments',        'view'),
    ('payments',        'create'),
    ('payments',        'export'),
    ('ar',              'view'),
    ('ar',              'export'),
    ('ap',              'view'),
    ('ap',              'export'),
    ('journal_entries', 'view'),
    -- Platform
    ('reports',         'view')
)
WHERE  r.code = 'finance_staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: operations_head
-- Full operations access. Approval authority for shipments and sales orders.
-- Can view and export finance docs (job-level P&L awareness).
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    ('branches',         'view'),
    ('departments',      'view'),
    -- Master data
    ('customers',        'view'),
    ('vendors',          'view'),
    ('products',         'view'),
    -- Sales (view + approve — needed to move SP to in_progress)
    ('quotations',       'view'),
    ('quotations',       'approve'),
    ('quotations',       'export'),
    ('quotations',       'print'),
    ('sales_orders',     'view'),
    ('sales_orders',     'approve'),
    ('sales_orders',     'export'),
    -- Operations — FULL ACCESS
    ('shipments',        'view'),
    ('shipments',        'create'),
    ('shipments',        'edit'),
    ('shipments',        'delete'),
    ('shipments',        'export'),
    -- Procurement (view — operations needs visibility into POs)
    ('purchase_orders',  'view'),
    ('purchase_orders',  'export'),
    -- Finance (view + print — job-level P&L; no edit/approve)
    ('invoices',         'view'),
    ('invoices',         'print'),
    ('ar',               'view'),
    -- Platform
    ('reports',          'view'),
    ('reports',          'export')
)
WHERE  r.code = 'operations_head'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: operations_staff (legacy: logistic)
-- Operations data entry. Creates and updates shipment/job cards.
-- View-only on customers, sales orders (needed for job creation context).
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    ('customers',    'view'),
    ('vendors',      'view'),
    ('products',     'view'),
    -- Sales (view only — needs SP context for job creation)
    ('sales_orders', 'view'),
    -- Operations — create/edit but NOT approve or delete
    ('shipments',    'view'),
    ('shipments',    'create'),
    ('shipments',    'edit'),
    -- Platform
    ('reports',      'view')
)
WHERE  r.code = 'operations_staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: sales_head
-- Full sales access. Approval authority for quotations and sales orders.
-- Can manage customers (create/edit/delete/export).
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    -- Master data — customer management
    ('customers',        'view'),
    ('customers',        'create'),
    ('customers',        'edit'),
    ('customers',        'delete'),
    ('customers',        'export'),
    ('vendors',          'view'),
    ('products',         'view'),
    -- Quotations — FULL ACCESS
    ('quotations',       'view'),
    ('quotations',       'create'),
    ('quotations',       'edit'),
    ('quotations',       'submit'),
    ('quotations',       'approve'),
    ('quotations',       'delete'),
    ('quotations',       'export'),
    ('quotations',       'print'),
    -- Sales Orders — FULL ACCESS
    ('sales_orders',     'view'),
    ('sales_orders',     'create'),
    ('sales_orders',     'edit'),
    ('sales_orders',     'submit'),
    ('sales_orders',     'approve'),
    ('sales_orders',     'delete'),
    ('sales_orders',     'export'),
    -- Operations (view — needs visibility into shipment status)
    ('shipments',        'view'),
    -- Finance (view + print — invoice status, AR aging)
    ('invoices',         'view'),
    ('invoices',         'print'),
    ('ar',               'view'),
    -- Platform
    ('reports',          'view'),
    ('reports',          'export')
)
WHERE  r.code = 'sales_head'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: sales_staff
-- Quotation and SP creation and submission. Limited customer management.
-- Cannot approve documents — approval belongs to sales_head or above.
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    -- Customers — can create and edit, not delete (protect master data)
    ('customers',    'view'),
    ('customers',    'create'),
    ('customers',    'edit'),
    ('products',     'view'),
    -- Quotations — create/submit but NOT approve
    ('quotations',   'view'),
    ('quotations',   'create'),
    ('quotations',   'submit'),
    ('quotations',   'print'),
    -- Sales Orders — create/submit but NOT approve
    ('sales_orders', 'view'),
    ('sales_orders', 'create'),
    ('sales_orders', 'submit'),
    -- Operations (view only)
    ('shipments',    'view'),
    -- Platform
    ('reports',      'view')
)
WHERE  r.code = 'sales_staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: procurement_head
-- Full procurement access. Approval authority for PRs and POs.
-- Can manage vendors (create/edit/delete/export).
-- =============================================================================
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
    ('products',         'view'),
    -- Purchase Requests — FULL ACCESS
    ('purchase_requests','view'),
    ('purchase_requests','create'),
    ('purchase_requests','edit'),
    ('purchase_requests','submit'),
    ('purchase_requests','approve'),
    ('purchase_requests','delete'),
    -- Purchase Orders — FULL ACCESS
    ('purchase_orders',  'view'),
    ('purchase_orders',  'create'),
    ('purchase_orders',  'edit'),
    ('purchase_orders',  'submit'),
    ('purchase_orders',  'approve'),
    ('purchase_orders',  'delete'),
    ('purchase_orders',  'export'),
    -- Finance (view only — AP tracking, vendor payment status)
    ('ap',               'view'),
    -- Platform
    ('reports',          'view'),
    ('reports',          'export')
)
WHERE  r.code = 'procurement_head'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: procurement_staff (legacy: procurement)
-- Purchase request and PO data entry. Can create and edit vendor records.
-- Cannot approve — approval belongs to procurement_head or above.
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',        'view'),
    -- Vendors — create/edit but NOT delete (protect master data)
    ('vendors',          'view'),
    ('vendors',          'create'),
    ('vendors',          'edit'),
    ('products',         'view'),
    -- Purchase Requests — create/edit/submit but NOT approve
    ('purchase_requests','view'),
    ('purchase_requests','create'),
    ('purchase_requests','edit'),
    ('purchase_requests','submit'),
    -- Purchase Orders — create/submit but NOT approve or delete
    ('purchase_orders',  'view'),
    ('purchase_orders',  'create'),
    ('purchase_orders',  'submit'),
    -- Platform
    ('reports',          'view')
)
WHERE  r.code = 'procurement_staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- ROLE: viewer (legacy: management)
-- Read-only access to business data for general management visibility.
-- Cannot create, edit, approve, or export any data.
-- =============================================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permissions p ON (p.module, p.action) IN (VALUES
    ('companies',    'view'),
    ('customers',    'view'),
    ('vendors',      'view'),
    ('products',     'view'),
    ('quotations',   'view'),
    ('sales_orders', 'view'),
    ('shipments',    'view'),
    ('reports',      'view')
)
WHERE  r.code = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES:
--
-- Row counts per role (for MSI company):
-- SELECT r.code, COUNT(rp.id) AS perm_count
-- FROM roles r
-- LEFT JOIN role_permissions rp ON rp.role_id = r.id
-- JOIN companies c ON c.id = r.company_id AND c.code = 'MSI'
-- GROUP BY r.code
-- ORDER BY perm_count DESC;
--
-- Expected ordering (highest to lowest permission count):
--   super_admin     → all (~80)
--   admin           → all except 2 (~78)
--   finance_controller → ~42
--   bod             → ~41
--   sales_head      → ~33
--   procurement_head → ~27
--   operations_head → ~27
--   finance_staff   → ~22
--   sales_staff     → ~15
--   operations_staff → ~10
--   procurement_staff → ~12
--   viewer          → ~8
--
-- Spot check — super_admin should have all permissions:
-- SELECT COUNT(*) FROM permissions p
-- WHERE NOT EXISTS (
--     SELECT 1 FROM role_permissions rp
--     JOIN roles r ON r.id = rp.role_id
--     JOIN companies c ON c.id = r.company_id
--     WHERE r.code = 'super_admin' AND c.code = 'MSI'
--     AND rp.permission_id = p.id
-- );
-- Expected: 0 (no permissions missing for super_admin)
-- =============================================================================
