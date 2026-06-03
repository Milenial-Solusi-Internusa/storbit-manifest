-- =============================================================================
-- Migration 026: Assets — Kendaraan extension + fuel logs table
-- Branch: phase-2-asset-management
-- Created: 2026-06-03
-- Status: DRAFT — do NOT execute without explicit approval
-- =============================================================================
--
-- Extends the `assets` table with vehicle-specific columns:
--   plate_number, color, manufacture_year, fuel_type, vin, engine_number, km_odometer
--
-- Adds new table: asset_fuel_logs
--   Tracks individual fuel fill-ups per vehicle asset.
--
-- Dependencies: migrations 001, 002, 012, 025
-- =============================================================================


-- =============================================================================
-- 1. Extend assets table with Kendaraan fields
-- =============================================================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS plate_number      varchar(20),
  ADD COLUMN IF NOT EXISTS color             varchar(50),
  ADD COLUMN IF NOT EXISTS manufacture_year  smallint,
  ADD COLUMN IF NOT EXISTS fuel_type         varchar(20)
    CHECK (fuel_type IN ('solar','bensin','pertamax','pertalite','listrik','other')),
  ADD COLUMN IF NOT EXISTS vin               varchar(30),
  ADD COLUMN IF NOT EXISTS engine_number     varchar(30),
  ADD COLUMN IF NOT EXISTS km_odometer       integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_assets_plate_number
  ON assets (company_id, plate_number)
  WHERE plate_number IS NOT NULL AND deleted_at IS NULL;


-- =============================================================================
-- 2. asset_fuel_logs — per-vehicle fuel fill-up records
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_fuel_logs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id        uuid          NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  fill_date       date          NOT NULL,
  spbu            varchar(150),
  liters          numeric(8,2)  NOT NULL CHECK (liters > 0),
  price_per_liter numeric(10,2) NOT NULL CHECK (price_per_liter > 0),
  total_cost      numeric(12,2) GENERATED ALWAYS AS (liters * price_per_liter) STORED,
  odometer        integer,
  notes           text,
  created_by      uuid          REFERENCES auth.users(id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER trg_asset_fuel_logs_updated_at
  BEFORE UPDATE ON asset_fuel_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_fuel_logs_asset_id
  ON asset_fuel_logs (asset_id, fill_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_fuel_logs_company_id
  ON asset_fuel_logs (company_id)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE asset_fuel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY fuel_logs_select ON asset_fuel_logs
  FOR SELECT USING (
    is_super_admin()
    OR company_id = get_user_company_id()
  );

CREATE POLICY fuel_logs_insert ON asset_fuel_logs
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id()
  );

CREATE POLICY fuel_logs_update ON asset_fuel_logs
  FOR UPDATE USING (
    company_id = get_user_company_id()
  );


-- =============================================================================
-- 3. Seed one Kendaraan asset (MSI) for UI testing
-- =============================================================================

DO $$
DECLARE
  v_msi_id   uuid;
  v_msi_cat  uuid;
  v_loc_id   uuid;
  v_asset_id uuid;
BEGIN
  SELECT id INTO v_msi_id FROM companies WHERE code = 'MSI' LIMIT 1;

  -- Ensure VEH category exists
  INSERT INTO asset_categories (company_id, code, name, useful_life_years, depreciation_method, is_active)
  VALUES (v_msi_id, 'VEH', 'Kendaraan', 8, 'straight_line', true)
  ON CONFLICT (company_id, code) DO NOTHING;

  SELECT id INTO v_msi_cat FROM asset_categories WHERE company_id = v_msi_id AND code = 'VEH' LIMIT 1;
  SELECT id INTO v_loc_id  FROM asset_locations  WHERE company_id = v_msi_id AND code = 'GDG-MRND' LIMIT 1;

  INSERT INTO assets (
    company_id, asset_no, asset_code, name, category_id, location_id,
    plate_number, color, manufacture_year, fuel_type, vin, engine_number,
    km_odometer, assigned_to_name, vendor_name, purchase_invoice_no,
    purchase_date, purchase_price, useful_life_years, depreciation_method,
    accumulated_depreciation, book_value, status, is_active
  )
  VALUES (
    v_msi_id,
    'AST/MSI/OPS/2022/0001',
    'VH-TRK-0001',
    'Mitsubishi Fuso Canter FE 74 HD',
    v_msi_cat,
    v_loc_id,
    'B 9123 KXD',
    'Putih',
    2022,
    'solar',
    'MHKA3CB1JNK009123',
    '4D34TKJ-99123',
    84210,
    'Budi Santoso',
    'PT Dipo Internasional Pahala Otomotif',
    'PO-2022-0314 / FK-88213',
    '2022-03-14',
    385000000,
    8,
    'straight_line',
    144375000,   -- 4.25 years × (385jt/8)
    240625000,
    'active',
    true
  )
  ON CONFLICT (company_id, asset_no) DO NOTHING
  RETURNING id INTO v_asset_id;

  -- Seed fuel logs for VH-TRK-0001
  IF v_asset_id IS NOT NULL THEN
    INSERT INTO asset_fuel_logs (company_id, asset_id, fill_date, spbu, liters, price_per_liter, odometer)
    VALUES
      (v_msi_id, v_asset_id, '2026-05-27', 'SPBU Pertamina Cilincing', 98,  6800, 84120),
      (v_msi_id, v_asset_id, '2026-05-20', 'SPBU Shell Marunda',       105, 7150, 83480),
      (v_msi_id, v_asset_id, '2026-05-14', 'SPBU Pertamina Cakung',    110, 6800, 82760),
      (v_msi_id, v_asset_id, '2026-05-07', 'SPBU Pertamina Cilincing', 99,  6800, 82010);
  END IF;
END $$;


-- =============================================================================
-- ROLLBACK SQL
-- =============================================================================
-- DROP TABLE IF EXISTS asset_fuel_logs;
-- ALTER TABLE assets
--   DROP COLUMN IF EXISTS plate_number,
--   DROP COLUMN IF EXISTS color,
--   DROP COLUMN IF EXISTS manufacture_year,
--   DROP COLUMN IF EXISTS fuel_type,
--   DROP COLUMN IF EXISTS vin,
--   DROP COLUMN IF EXISTS engine_number,
--   DROP COLUMN IF EXISTS km_odometer;
-- DELETE FROM asset_categories WHERE code = 'VEH';
-- DELETE FROM assets WHERE asset_code = 'VH-TRK-0001';
-- =============================================================================
