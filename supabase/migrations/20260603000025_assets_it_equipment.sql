-- =============================================================================
-- Migration 025: Assets — IT Equipment extension + seed data
-- Branch: phase-2-asset-management
-- Created: 2026-06-03
-- Status: DRAFT — do NOT execute without explicit approval
-- =============================================================================
--
-- Extends the existing `assets` table (migration 012) with columns needed for
-- the IT Equipment list page:
--   - asset_code    : short display code, e.g. IT-LAP-0241
--   - serial_number : device serial number
--   - model         : brand + model string
--   - asset_subtype : laptop | desktop | server | printer | network | peripheral | other
--   - assigned_to_name : denormalized text name for display (FK is assigned_to_user_id)
--   - vendor_name   : supplier / vendor free text
--   - purchase_invoice_no : PO / invoice reference
--
-- Also:
--   - Seeds asset_categories for IT Equipment (MSI, JCI, SBI)
--   - Seeds asset_locations (offices + data centers) for all companies
--   - Seeds 12 IT asset records matching the design prototype
--
-- Status values used: active, in_repair, retired, disposed (existing CHECK constraint)
-- UI maps: active→Aktif, in_repair→Maintenance, retired→Rusak, disposed→Disposed
--
-- Dependencies: migrations 001, 002, 012
-- GRANTs: already applied (migration 017 / RLS baseline)
--
-- ROLLBACK SQL (at bottom of file)
-- =============================================================================


-- =============================================================================
-- 1. Extend assets table
-- =============================================================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS asset_code          varchar(30),
  ADD COLUMN IF NOT EXISTS serial_number       varchar(100),
  ADD COLUMN IF NOT EXISTS model               varchar(150),
  ADD COLUMN IF NOT EXISTS asset_subtype       varchar(20)
    CHECK (asset_subtype IN ('laptop','desktop','server','printer','network','peripheral','other')),
  ADD COLUMN IF NOT EXISTS assigned_to_name    varchar(150),
  ADD COLUMN IF NOT EXISTS vendor_name         varchar(150),
  ADD COLUMN IF NOT EXISTS purchase_invoice_no varchar(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_asset_code
  ON assets (company_id, asset_code)
  WHERE asset_code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assets_asset_subtype
  ON assets (company_id, asset_subtype)
  WHERE deleted_at IS NULL;


-- =============================================================================
-- 2. Seed asset_categories — IT Equipment per company
-- =============================================================================

INSERT INTO asset_categories (company_id, code, name, description, useful_life_years, depreciation_method, is_active)
SELECT
  c.id,
  'IT-EQP',
  'IT Equipment',
  'Komputer, laptop, server, printer, dan perangkat jaringan',
  4,
  'straight_line',
  true
FROM companies c
WHERE c.is_active = true
ON CONFLICT (company_id, code) DO NOTHING;


-- =============================================================================
-- 3. Seed asset_locations — offices + data centers per company
-- =============================================================================

DO $$
DECLARE
  v_msi_id uuid;
  v_jci_id uuid;
  v_sbi_id uuid;
  v_msi_ho uuid;  -- MSI HO branch
  v_jci_ho uuid;
  v_sbi_ho uuid;
BEGIN
  SELECT id INTO v_msi_id FROM companies WHERE code = 'MSI' LIMIT 1;
  SELECT id INTO v_jci_id FROM companies WHERE code = 'JCI' LIMIT 1;
  SELECT id INTO v_sbi_id FROM companies WHERE code = 'SBI' LIMIT 1;

  -- Use first active branch per company as HO branch reference
  SELECT id INTO v_msi_ho FROM branches WHERE company_id = v_msi_id AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_jci_ho FROM branches WHERE company_id = v_jci_id AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_sbi_ho FROM branches WHERE company_id = v_sbi_id AND is_active = true ORDER BY created_at LIMIT 1;

  -- MSI locations
  IF v_msi_id IS NOT NULL AND v_msi_ho IS NOT NULL THEN
    INSERT INTO asset_locations (company_id, branch_id, code, name, is_active)
    VALUES
      (v_msi_id, v_msi_ho, 'KPS-LT2', 'Kantor Pusat Sunter · Lt.2', true),
      (v_msi_id, v_msi_ho, 'KPS-LT3', 'Kantor Pusat Sunter · Lt.3', true),
      (v_msi_id, v_msi_ho, 'KPS-LT4', 'Kantor Pusat Sunter · Lt.4', true),
      (v_msi_id, v_msi_ho, 'KPS-LT5', 'Kantor Pusat Sunter · Lt.5', true),
      (v_msi_id, v_msi_ho, 'DC-MRND', 'Data Center Marunda',         true),
      (v_msi_id, v_msi_ho, 'GDG-MRND','Gudang Marunda',              true)
    ON CONFLICT (company_id, code) DO NOTHING;
  END IF;

  -- JCI locations (share same office building)
  IF v_jci_id IS NOT NULL AND v_jci_ho IS NOT NULL THEN
    INSERT INTO asset_locations (company_id, branch_id, code, name, is_active)
    VALUES
      (v_jci_id, v_jci_ho, 'KPS-LT2', 'Kantor Pusat Sunter · Lt.2', true),
      (v_jci_id, v_jci_ho, 'KPS-LT3', 'Kantor Pusat Sunter · Lt.3', true),
      (v_jci_id, v_jci_ho, 'DC-MRND', 'Data Center Marunda',         true),
      (v_jci_id, v_jci_ho, 'CBG-PRIOK','Cabang Tanjung Priok',       true)
    ON CONFLICT (company_id, code) DO NOTHING;
  END IF;

  -- SBI locations
  IF v_sbi_id IS NOT NULL AND v_sbi_ho IS NOT NULL THEN
    INSERT INTO asset_locations (company_id, branch_id, code, name, is_active)
    VALUES
      (v_sbi_id, v_sbi_ho, 'KPS-LT5', 'Kantor Pusat Sunter · Lt.5', true),
      (v_sbi_id, v_sbi_ho, 'CBG-PRIOK','Cabang Tanjung Priok',       true),
      (v_sbi_id, v_sbi_ho, 'GDG-MRND', 'Gudang Marunda',             true)
    ON CONFLICT (company_id, code) DO NOTHING;
  END IF;
END $$;


-- =============================================================================
-- 4. Seed IT asset records (12 items from design prototype)
-- =============================================================================

DO $$
DECLARE
  v_msi_id uuid;
  v_jci_id uuid;
  v_sbi_id uuid;
  v_msi_cat uuid;
  v_jci_cat uuid;
  v_sbi_cat uuid;
  -- locations
  v_kps3_msi uuid;  v_kps3_jci uuid;
  v_kps4_msi uuid;
  v_kps5_sbi uuid;
  v_kps2_jci uuid;
  v_dc_msi   uuid;  v_dc_jci   uuid;
  v_gdg_msi  uuid;  v_gdg_sbi  uuid;
  v_priok_jci uuid; v_priok_sbi uuid;
BEGIN
  SELECT id INTO v_msi_id FROM companies WHERE code = 'MSI' LIMIT 1;
  SELECT id INTO v_jci_id FROM companies WHERE code = 'JCI' LIMIT 1;
  SELECT id INTO v_sbi_id FROM companies WHERE code = 'SBI' LIMIT 1;

  SELECT id INTO v_msi_cat FROM asset_categories WHERE company_id = v_msi_id AND code = 'IT-EQP' LIMIT 1;
  SELECT id INTO v_jci_cat FROM asset_categories WHERE company_id = v_jci_id AND code = 'IT-EQP' LIMIT 1;
  SELECT id INTO v_sbi_cat FROM asset_categories WHERE company_id = v_sbi_id AND code = 'IT-EQP' LIMIT 1;

  SELECT id INTO v_kps3_msi FROM asset_locations WHERE company_id = v_msi_id AND code = 'KPS-LT3' LIMIT 1;
  SELECT id INTO v_kps4_msi FROM asset_locations WHERE company_id = v_msi_id AND code = 'KPS-LT4' LIMIT 1;
  SELECT id INTO v_dc_msi   FROM asset_locations WHERE company_id = v_msi_id AND code = 'DC-MRND' LIMIT 1;
  SELECT id INTO v_gdg_msi  FROM asset_locations WHERE company_id = v_msi_id AND code = 'GDG-MRND' LIMIT 1;
  SELECT id INTO v_kps2_jci FROM asset_locations WHERE company_id = v_jci_id AND code = 'KPS-LT2' LIMIT 1;
  SELECT id INTO v_kps3_jci FROM asset_locations WHERE company_id = v_jci_id AND code = 'KPS-LT3' LIMIT 1;
  SELECT id INTO v_dc_jci   FROM asset_locations WHERE company_id = v_jci_id AND code = 'DC-MRND' LIMIT 1;
  SELECT id INTO v_priok_jci FROM asset_locations WHERE company_id = v_jci_id AND code = 'CBG-PRIOK' LIMIT 1;
  SELECT id INTO v_kps5_sbi FROM asset_locations WHERE company_id = v_sbi_id AND code = 'KPS-LT5' LIMIT 1;
  SELECT id INTO v_priok_sbi FROM asset_locations WHERE company_id = v_sbi_id AND code = 'CBG-PRIOK' LIMIT 1;
  SELECT id INTO v_gdg_sbi  FROM asset_locations WHERE company_id = v_sbi_id AND code = 'GDG-MRND' LIMIT 1;

  -- Insert 12 IT assets
  INSERT INTO assets (
    company_id, asset_no, asset_code, name, category_id, location_id,
    serial_number, model, asset_subtype, assigned_to_name,
    purchase_date, purchase_price, status, is_active
  )
  VALUES
    -- 1. Laptop Operasional (JCI)
    (v_jci_id, 'IT-LAP-0241', 'IT-LAP-0241', 'Laptop Operasional', v_jci_cat, v_kps3_jci,
     'PF3K9R21', 'Lenovo ThinkPad E14 G4', 'laptop', 'Budi Santoso',
     '2024-03-12', 14250000, 'active', true),

    -- 2. Laptop Finance (MSI)
    (v_msi_id, 'IT-LAP-0238', 'IT-LAP-0238', 'Laptop Finance', v_msi_cat, v_kps4_msi,
     '9KJ2X07', 'Dell Latitude 5440', 'laptop', 'Siti Rahmawati',
     '2024-02-05', 16800000, 'active', true),

    -- 3. Server Aplikasi ERP (MSI)
    (v_msi_id, 'IT-SRV-0007', 'IT-SRV-0007', 'Server Aplikasi ERP', v_msi_cat, v_dc_msi,
     'CN78812K', 'Dell PowerEdge R650', 'server', 'Tim IT Infra',
     '2023-11-20', 189500000, 'in_repair', true),

    -- 4. Laptop Sales (SBI)
    (v_sbi_id, 'IT-LAP-0255', 'IT-LAP-0255', 'Laptop Sales', v_sbi_cat, v_priok_sbi,
     'M2A77L9', 'Asus ExpertBook B5', 'laptop', 'Rizki Hidayat',
     '2025-04-18', 13100000, 'active', true),

    -- 5. Desktop Admin (JCI)
    (v_jci_id, 'IT-DSK-0112', 'IT-DSK-0112', 'Desktop Admin', v_jci_cat, v_kps2_jci,
     'HP90X4421', 'HP ProDesk 400 G9', 'desktop', 'Dewi Lestari',
     '2024-09-09', 11450000, 'active', true),

    -- 6. Printer Multifungsi (MSI)
    (v_msi_id, 'IT-PRN-0031', 'IT-PRN-0031', 'Printer Multifungsi', v_msi_cat, v_kps3_msi,
     'EPC57901', 'Epson WorkForce WF-C5790', 'printer', 'Shared · Lt.3',
     '2024-01-14', 7900000, 'active', true),

    -- 7. Switch Core (MSI)
    (v_msi_id, 'IT-NET-0019', 'IT-NET-0019', 'Switch Core', v_msi_cat, v_dc_msi,
     'FCW2412', 'Cisco Catalyst 9300', 'network', 'Tim IT Infra',
     '2023-08-02', 78300000, 'active', true),

    -- 8. Laptop Direksi (SBI)
    (v_sbi_id, 'IT-LAP-0260', 'IT-LAP-0260', 'Laptop Direksi', v_sbi_cat, v_kps5_sbi,
     'C02FX9LM', 'MacBook Pro 14" M3', 'laptop', 'Agus Pratama',
     '2025-01-28', 34999000, 'active', true),

    -- 9. Laptop Operasional (JCI, Rusak)
    (v_jci_id, 'IT-LAP-0199', 'IT-LAP-0199', 'Laptop Operasional', v_jci_cat, v_priok_jci,
     'PF2H81Q4', 'Lenovo ThinkPad E14 G3', 'laptop', 'Nanda Pratiwi',
     '2023-06-11', 12900000, 'retired', true),

    -- 10. Printer Label (MSI)
    (v_msi_id, 'IT-PRN-0028', 'IT-PRN-0028', 'Printer Label', v_msi_cat, v_gdg_msi,
     'BRQ820N', 'Brother QL-820NWB', 'printer', 'Gudang Marunda',
     '2024-10-22', 3450000, 'active', true),

    -- 11. Server Backup NAS (JCI)
    (v_jci_id, 'IT-SRV-0009', 'IT-SRV-0009', 'Server Backup (NAS)', v_jci_cat, v_dc_jci,
     'SYN36212', 'Synology RS3621xs+', 'server', 'Tim IT Infra',
     '2023-12-15', 95700000, 'active', true),

    -- 12. Desktop Gudang (SBI, Disposed)
    (v_sbi_id, 'IT-DSK-0120', 'IT-DSK-0120', 'Desktop Gudang', v_sbi_cat, v_gdg_sbi,
     'ACV2710', 'Acer Veriton X2710G', 'desktop', 'Eko Saputra',
     '2022-03-03', 8200000, 'disposed', true)

  ON CONFLICT (company_id, asset_no) DO NOTHING;
END $$;


-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- 1. Confirm new columns exist:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'assets' AND column_name IN ('asset_code','serial_number','model','asset_subtype');
--    -- Expected: 4 rows
--
-- 2. Check seed asset count:
--    SELECT company_id, status, COUNT(*) FROM assets GROUP BY company_id, status ORDER BY company_id, status;
--    -- Expected: MSI=5, JCI=4, SBI=3 (total 12)
--
-- 3. Check categories seeded:
--    SELECT c.code AS company, ac.code, ac.name FROM asset_categories ac
--    JOIN companies c ON c.id = ac.company_id WHERE ac.code = 'IT-EQP';
--    -- Expected: 3 rows (MSI, JCI, SBI)
--
-- =============================================================================
-- ROLLBACK SQL
-- =============================================================================
-- ALTER TABLE assets DROP COLUMN IF EXISTS asset_code;
-- ALTER TABLE assets DROP COLUMN IF EXISTS serial_number;
-- ALTER TABLE assets DROP COLUMN IF EXISTS model;
-- ALTER TABLE assets DROP COLUMN IF EXISTS asset_subtype;
-- ALTER TABLE assets DROP COLUMN IF EXISTS assigned_to_name;
-- ALTER TABLE assets DROP COLUMN IF EXISTS vendor_name;
-- ALTER TABLE assets DROP COLUMN IF EXISTS purchase_invoice_no;
-- DELETE FROM assets WHERE asset_no LIKE 'IT-%';
-- DELETE FROM asset_locations WHERE code IN ('KPS-LT2','KPS-LT3','KPS-LT4','KPS-LT5','DC-MRND','GDG-MRND','CBG-PRIOK');
-- DELETE FROM asset_categories WHERE code = 'IT-EQP';
-- =============================================================================
