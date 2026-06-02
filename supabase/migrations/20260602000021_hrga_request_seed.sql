-- =============================================================================
-- Migration 021: HRGA Request Module — Seed Data
-- Branch: phase-2-service-management
-- Created: 2026-06-02
-- Status: DRAFT — do NOT execute without explicit approval
-- =============================================================================
--
-- This migration seeds:
--   Part A: 4 new roles (hrga, it, finance, supervisor) for all active companies
--   Part B: 19 hrga_request_types for all active companies
--   Part C: hrga_approval_configs — 1-3 levels per request type, per company
--
-- MUST run AFTER migration 020 (hrga_request_schema).
-- MUST run AFTER migration 013 (role_permissions_seed) for role context.
--
-- Dependencies:
--   - companies table must have MSI, JCI, SBI seeded (migration 001)
--   - roles table must exist (migration 005)
--   - hrga_request_types table must exist (migration 020)
--   - hrga_approval_configs table must exist (migration 020)
--
-- Idempotent: all inserts use ON CONFLICT DO NOTHING.
--
-- =============================================================================


-- =============================================================================
-- PART A: New Roles — hrga, it, finance, supervisor
-- =============================================================================
-- These 4 roles are NOT in migration 005 seed (which covers operational/finance
-- roles for freight/trading/procurement). They are HRGA-specific roles required
-- by the approval matrix and has_role() RLS checks in migration 020.
--
-- has_role('hrga') → True for users assigned role_code='hrga'
-- has_role('it')   → True for IT department users
-- has_role('finance') → True for general finance users (distinct from finance_controller)
-- has_role('supervisor') → True for direct supervisors (line managers)
-- =============================================================================

INSERT INTO roles (company_id, code, name, description, is_system_role, is_active)
SELECT
  c.id,
  r.code,
  r.name,
  r.description,
  true,   -- is_system_role
  true    -- is_active
FROM companies c
CROSS JOIN (
  VALUES
    ('hrga',       'HRGA Staff',    'Human Resources & General Affairs. Handles admin documents, assets, facilities, and HR operations.'),
    ('it',         'IT Staff',      'Information Technology. Handles IT assets, system access, and technical support.'),
    ('finance',    'Finance',       'General Finance staff. Handles reimbursement approval, petty cash, and travel finance approvals.'),
    ('supervisor', 'Supervisor',    'Direct line manager / supervisor. First-level approval for subordinate requests.')
) AS r(code, name, description)
WHERE c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;


-- =============================================================================
-- PART B: HRGA Request Types — 19 types, 6 categories
-- =============================================================================
-- One set of request types per active company. All is_active = true by default.
-- Company admins can deactivate types that don't apply to their entity post go-live.
--
-- approval_levels: matches the approval matrix in hrga-request-schema-plan.md
-- requires_amount: true for TRV and FIN categories (amount wajib saat submit)
-- requires_date_range: true for travel and room/vehicle booking
-- requires_attachment: true for reimbursement (bukti kwitansi) and legalisir
-- =============================================================================

INSERT INTO hrga_request_types (
  company_id,
  category_code,
  category_name,
  type_code,
  type_name,
  description,
  requires_attachment,
  requires_amount,
  requires_date_range,
  approval_levels,
  is_active,
  sort_order
)
SELECT
  c.id,
  t.category_code,
  t.category_name,
  t.type_code,
  t.type_name,
  t.description,
  t.requires_attachment,
  t.requires_amount,
  t.requires_date_range,
  t.approval_levels,
  true,
  t.sort_order
FROM companies c
CROSS JOIN (
  VALUES
    -- -----------------------------------------------------------------------
    -- ADM — Administrasi & Dokumen  (approval: HRGA only = 1 level)
    -- -----------------------------------------------------------------------
    ('ADM', 'Administrasi & Dokumen', 'ADM_SKK',  'Surat Keterangan Kerja',
     'Permohonan surat keterangan bahwa karyawan masih aktif bekerja.',
     false, false, false, 1, 10),

    ('ADM', 'Administrasi & Dokumen', 'ADM_SKP',  'Surat Keterangan Penghasilan',
     'Permohonan surat keterangan gaji/penghasilan untuk keperluan KPR, BPJS, dll.',
     false, false, false, 1, 20),

    ('ADM', 'Administrasi & Dokumen', 'ADM_SKR',  'Surat Referensi',
     'Permohonan surat referensi karyawan dari perusahaan.',
     false, false, false, 1, 30),

    ('ADM', 'Administrasi & Dokumen', 'ADM_SLIP', 'Slip Gaji Ulang',
     'Permintaan cetak ulang slip gaji bulan tertentu.',
     false, false, false, 1, 40),

    ('ADM', 'Administrasi & Dokumen', 'ADM_LEG',  'Legalisir Dokumen',
     'Permintaan legalisir dokumen perusahaan (ijazah, SK, dll).',
     true,  false, false, 1, 50),

    -- -----------------------------------------------------------------------
    -- AST — Aset & Perlengkapan
    -- -----------------------------------------------------------------------
    ('AST', 'Aset & Perlengkapan',    'AST_ATK',  'ATK / Office Supplies',
     'Permintaan alat tulis kantor dan perlengkapan operasional.',
     false, false, false, 2, 60),
    -- approval: Supervisor → HRGA (2 levels)

    ('AST', 'Aset & Perlengkapan',    'AST_UNF',  'Seragam / ID Card / Name Tag',
     'Permintaan pengadaan seragam, ID card, atau name tag karyawan.',
     false, false, false, 1, 70),
    -- approval: HRGA only

    ('AST', 'Aset & Perlengkapan',    'AST_CARD', 'Kartu Nama',
     'Permintaan cetak kartu nama karyawan.',
     false, false, false, 1, 80),
    -- approval: HRGA only

    ('AST', 'Aset & Perlengkapan',    'AST_LAPP', 'Peminjaman Laptop',
     'Permohonan peminjaman laptop/perangkat IT untuk kebutuhan kerja.',
     false, false, true,  2, 90),
    -- approval: IT → HRGA (2 levels)

    ('AST', 'Aset & Perlengkapan',    'AST_VHCL', 'Peminjaman Kendaraan',
     'Permohonan peminjaman kendaraan operasional perusahaan.',
     false, false, true,  1, 100),
    -- approval: HRGA only

    ('AST', 'Aset & Perlengkapan',    'AST_SIM',  'SIM Card / Nomor Dinas',
     'Permintaan pengadaan SIM card atau nomor telepon dinas.',
     false, false, false, 2, 110),
    -- approval: HRGA → IT (2 levels)

    -- -----------------------------------------------------------------------
    -- FAC — Fasilitas & Operasional
    -- -----------------------------------------------------------------------
    ('FAC', 'Fasilitas & Operasional', 'FAC_ACC',  'Akses Gedung',
     'Permohonan akses kartu/PIN gedung, ruangan server, atau area tertentu.',
     false, false, false, 2, 120),
    -- approval: HRGA → IT (2 levels)

    ('FAC', 'Fasilitas & Operasional', 'FAC_MEET', 'Booking Ruang Meeting',
     'Pemesanan ruang meeting untuk kebutuhan internal atau eksternal.',
     false, false, true,  1, 130),
    -- approval: HRGA only

    ('FAC', 'Fasilitas & Operasional', 'FAC_REP',  'Perbaikan Ruangan',
     'Permintaan perbaikan, pemeliharaan, atau renovasi fasilitas ruangan.',
     true,  false, false, 2, 140),
    -- approval: HRGA → Finance (2 levels)

    -- -----------------------------------------------------------------------
    -- TRV — Perjalanan Dinas
    -- -----------------------------------------------------------------------
    ('TRV', 'Perjalanan Dinas',        'TRV_TRIP', 'Pengajuan Perjalanan Dinas',
     'Pengajuan perjalanan dinas termasuk booking transportasi dan akomodasi.',
     false, true,  true,  3, 150),
    -- approval: Supervisor → HRGA → Finance (3 levels)

    ('TRV', 'Perjalanan Dinas',        'TRV_REIM', 'Reimbursement Perjalanan Dinas',
     'Pengajuan penggantian biaya perjalanan dinas yang sudah dikeluarkan.',
     true,  true,  true,  3, 160),
    -- approval: Supervisor → HRGA → Finance (3 levels)

    -- -----------------------------------------------------------------------
    -- FIN — Keuangan & Reimbursement
    -- -----------------------------------------------------------------------
    ('FIN', 'Keuangan & Reimbursement','FIN_ROPS', 'Reimbursement Operasional',
     'Penggantian biaya operasional yang dikeluarkan karyawan (transport, dll).',
     true,  true,  false, 3, 170),
    -- approval: Supervisor → HRGA → Finance (3 levels)

    ('FIN', 'Keuangan & Reimbursement','FIN_RMED', 'Reimbursement Kesehatan',
     'Penggantian biaya pengobatan/kesehatan sesuai plafon yang berlaku.',
     true,  true,  false, 3, 180),
    -- approval: Supervisor → HRGA → Finance (3 levels)

    ('FIN', 'Keuangan & Reimbursement','FIN_CASH', 'Petty Cash / Uang Muka Kerja',
     'Pengajuan uang muka atau kas kecil untuk kebutuhan operasional.',
     false, true,  false, 2, 190),
    -- approval: Supervisor → Finance (2 levels)

    -- -----------------------------------------------------------------------
    -- OFF — Offboarding
    -- -----------------------------------------------------------------------
    ('OFF', 'Offboarding',             'OFF_EXIT', 'Offboarding Checklist',
     'Proses checklist offboarding karyawan yang mengundurkan diri atau berakhir kontrak.',
     false, false, false, 3, 200)
    -- approval: HRGA → IT → Finance (3 levels)

) AS t(
  category_code, category_name, type_code, type_name, description,
  requires_attachment, requires_amount, requires_date_range, approval_levels, sort_order
)
WHERE c.is_active = true
ON CONFLICT (company_id, type_code) DO NOTHING;


-- =============================================================================
-- PART C: hrga_approval_configs — chain per type, per company
-- =============================================================================
-- Approval matrix reference (from schema plan Section 2):
--
--  ADM_SKK/SKP/SKR/SLIP/LEG   → Level 1: hrga
--  AST_UNF/CARD/VHCL          → Level 1: hrga
--  AST_ATK                    → Level 1: supervisor,  Level 2: hrga
--  AST_LAPP                   → Level 1: it,          Level 2: hrga
--  AST_SIM, FAC_ACC            → Level 1: hrga,        Level 2: it
--  FAC_MEET                   → Level 1: hrga
--  FAC_REP                    → Level 1: hrga,        Level 2: finance
--  TRV_TRIP, TRV_REIM         → Level 1: supervisor,  Level 2: hrga,     Level 3: finance
--  FIN_ROPS, FIN_RMED         → Level 1: supervisor,  Level 2: hrga,     Level 3: finance
--  FIN_CASH                   → Level 1: supervisor,  Level 2: finance
--  OFF_EXIT                   → Level 1: hrga,        Level 2: it,       Level 3: finance
--
-- Note: approver_user_id is NULL (role-based, not specific-user) for all seed configs.
-- =============================================================================

-- -------------------------
-- 1-level: HRGA only
-- ADM_SKK, ADM_SKP, ADM_SKR, ADM_SLIP, ADM_LEG, AST_UNF, AST_CARD, AST_VHCL, FAC_MEET
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'hrga', true
FROM companies c
JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true
  AND rt.type_code IN (
    'ADM_SKK','ADM_SKP','ADM_SKR','ADM_SLIP','ADM_LEG',
    'AST_UNF','AST_CARD','AST_VHCL','FAC_MEET'
  )
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 2-level: Supervisor (L1) → HRGA (L2) — AST_ATK
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'supervisor', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'AST_ATK'
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'hrga', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'AST_ATK'
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 2-level: IT (L1) → HRGA (L2) — AST_LAPP
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'it', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'AST_LAPP'
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'hrga', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'AST_LAPP'
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 2-level: HRGA (L1) → IT (L2) — AST_SIM, FAC_ACC
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'hrga', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code IN ('AST_SIM','FAC_ACC')
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'it', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code IN ('AST_SIM','FAC_ACC')
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 2-level: HRGA (L1) → Finance (L2) — FAC_REP
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'hrga', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'FAC_REP'
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'finance', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'FAC_REP'
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 2-level: Supervisor (L1) → Finance (L2) — FIN_CASH
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'supervisor', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'FIN_CASH'
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'finance', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'FIN_CASH'
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 3-level: Supervisor (L1) → HRGA (L2) → Finance (L3)
-- TRV_TRIP, TRV_REIM, FIN_ROPS, FIN_RMED
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'supervisor', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code IN ('TRV_TRIP','TRV_REIM','FIN_ROPS','FIN_RMED')
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'hrga', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code IN ('TRV_TRIP','TRV_REIM','FIN_ROPS','FIN_RMED')
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 3, 'finance', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code IN ('TRV_TRIP','TRV_REIM','FIN_ROPS','FIN_RMED')
ON CONFLICT (request_type_id, level) DO NOTHING;

-- -------------------------
-- 3-level: HRGA (L1) → IT (L2) → Finance (L3) — OFF_EXIT
-- -------------------------
INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 1, 'hrga', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'OFF_EXIT'
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 2, 'it', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'OFF_EXIT'
ON CONFLICT (request_type_id, level) DO NOTHING;

INSERT INTO hrga_approval_configs (company_id, request_type_id, level, approver_role, is_active)
SELECT c.id, rt.id, 3, 'finance', true
FROM companies c JOIN hrga_request_types rt ON rt.company_id = c.id
WHERE c.is_active = true AND rt.type_code = 'OFF_EXIT'
ON CONFLICT (request_type_id, level) DO NOTHING;


-- =============================================================================
-- VERIFICATION QUERIES (run after applying this migration)
-- =============================================================================
--
-- 1. Check new roles seeded (expect 4 rows × 3 companies = 12):
--    SELECT c.code, r.code, r.name FROM roles r
--    JOIN companies c ON c.id = r.company_id
--    WHERE r.code IN ('hrga','it','finance','supervisor')
--    ORDER BY c.code, r.code;
--
-- 2. Check request types (expect 19 rows × 3 companies = 57):
--    SELECT c.code, rt.category_code, rt.type_code, rt.approval_levels
--    FROM hrga_request_types rt
--    JOIN companies c ON c.id = rt.company_id
--    ORDER BY c.code, rt.sort_order;
--
-- 3. Check approval configs (expect 36 configs × 3 companies = 108 rows):
--    SELECT c.code, rt.type_code, ac.level, ac.approver_role
--    FROM hrga_approval_configs ac
--    JOIN hrga_request_types rt ON rt.id = ac.request_type_id
--    JOIN companies c ON c.id = ac.company_id
--    ORDER BY c.code, rt.sort_order, ac.level;
--
-- 4. Spot-check TRV_TRIP has 3 levels:
--    SELECT rt.type_code, ac.level, ac.approver_role
--    FROM hrga_approval_configs ac
--    JOIN hrga_request_types rt ON rt.id = ac.request_type_id
--    WHERE rt.type_code = 'TRV_TRIP'
--    ORDER BY ac.level;
--    -- Expected: level 1 = supervisor, level 2 = hrga, level 3 = finance
--
-- 5. Confirm approval_levels on request_type matches config count:
--    SELECT rt.type_code, rt.approval_levels,
--           COUNT(ac.id) AS config_count
--    FROM hrga_request_types rt
--    LEFT JOIN hrga_approval_configs ac ON ac.request_type_id = rt.id
--    GROUP BY rt.type_code, rt.approval_levels
--    HAVING rt.approval_levels != COUNT(ac.id) / (SELECT COUNT(*) FROM companies WHERE is_active=true);
--    -- Should return 0 rows (all match)
--
-- =============================================================================
-- ROLLBACK SQL
-- =============================================================================
--
-- DELETE FROM hrga_approval_configs WHERE company_id IN (
--   SELECT id FROM companies WHERE is_active = true
-- );
-- DELETE FROM hrga_request_types WHERE company_id IN (
--   SELECT id FROM companies WHERE is_active = true
-- ) AND type_code IN (
--   'ADM_SKK','ADM_SKP','ADM_SKR','ADM_SLIP','ADM_LEG',
--   'AST_ATK','AST_UNF','AST_CARD','AST_LAPP','AST_VHCL','AST_SIM',
--   'FAC_ACC','FAC_MEET','FAC_REP',
--   'TRV_TRIP','TRV_REIM',
--   'FIN_ROPS','FIN_RMED','FIN_CASH',
--   'OFF_EXIT'
-- );
-- DELETE FROM roles WHERE code IN ('hrga','it','finance','supervisor');
--
-- =============================================================================
-- END OF MIGRATION 021
-- =============================================================================
