-- =============================================================================
-- Migration 027: Assets — IT Equipment specification tables
-- Branch: phase-2-asset-management
-- Created: 2026-06-03
-- Status: DRAFT — do NOT execute without explicit approval
-- =============================================================================
--
-- Creates 4 new tables for IT asset detail pages:
--   asset_specifications   — hardware specs (CPU, RAM, storage, display, OS, battery)
--   asset_network          — network identity (IP, MAC, hostname, VLAN)
--   asset_software_licenses — installed software + license tracking
--   asset_maintenance_records — maintenance history (preventif/korektif/upgrade)
--
-- Seeds spec + network + software + maintenance data for IT-LAP-0241 (Lenovo ThinkPad E14 G4)
-- which was seeded in migration 025 for UI testing.
--
-- Dependencies: migrations 001, 002, 012, 025
-- =============================================================================


-- =============================================================================
-- 1. asset_specifications — one row per asset, IT-specific hardware info
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_specifications (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        uuid          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id      uuid          NOT NULL REFERENCES companies(id),
  -- CPU
  cpu_model       varchar(150),
  cpu_cores       smallint,
  cpu_threads     smallint,
  cpu_base_ghz    numeric(4,2),
  cpu_turbo_ghz   numeric(4,2),
  cpu_cache_mb    smallint,
  -- RAM
  ram_gb          smallint,
  ram_type        varchar(20),
  ram_slots_used  smallint,
  ram_slots_total smallint,
  -- Storage
  storage_gb      int,
  storage_type    varchar(20)   CHECK (storage_type IN ('SSD','HDD','NVMe','eMMC','other')),
  storage_interface varchar(50),
  storage_used_pct smallint,
  -- Display
  display_size_inch numeric(4,1),
  display_resolution varchar(20),
  display_refresh_hz smallint,
  gpu_model       varchar(100),
  -- OS
  os_name         varchar(100),
  os_version      varchar(50),
  os_build        varchar(50),
  os_arch         varchar(10),
  os_license_type varchar(30),
  -- Battery (laptops)
  battery_capacity_wh numeric(5,1),
  battery_health_pct  smallint,
  battery_cycle_count int,
  -- Additional
  webcam_desc     varchar(100),
  keyboard_desc   varchar(100),
  ports_desc      text,
  wireless_desc   varchar(100),
  weight_kg       numeric(4,2),
  color           varchar(50),
  -- Audit
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT asset_specifications_asset_unique UNIQUE (asset_id)
);

CREATE TRIGGER trg_asset_specifications_updated_at
  BEFORE UPDATE ON asset_specifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_specifications_asset_id ON asset_specifications (asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_specifications_company_id ON asset_specifications (company_id);

ALTER TABLE asset_specifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY specs_select ON asset_specifications FOR SELECT USING (
  is_super_admin() OR company_id = get_user_company_id()
);
CREATE POLICY specs_insert ON asset_specifications FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY specs_update ON asset_specifications FOR UPDATE USING (company_id = get_user_company_id());

GRANT SELECT, INSERT, UPDATE ON asset_specifications TO authenticated;


-- =============================================================================
-- 2. asset_network — one row per asset
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_network (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        uuid          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id      uuid          NOT NULL REFERENCES companies(id),
  ip_address      varchar(50),
  ipv6_address    varchar(100),
  mac_wifi        varchar(20),
  mac_lan         varchar(20),
  hostname        varchar(100),
  gateway         varchar(50),
  dns_primary     varchar(50),
  dns_secondary   varchar(50),
  vlan            varchar(50),
  domain_workgroup varchar(100),
  last_seen_at    timestamptz,
  is_online       boolean       NOT NULL DEFAULT false,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT asset_network_asset_unique UNIQUE (asset_id)
);

CREATE TRIGGER trg_asset_network_updated_at
  BEFORE UPDATE ON asset_network
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_network_asset_id ON asset_network (asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_network_company_id ON asset_network (company_id);

ALTER TABLE asset_network ENABLE ROW LEVEL SECURITY;
CREATE POLICY network_select ON asset_network FOR SELECT USING (
  is_super_admin() OR company_id = get_user_company_id()
);
CREATE POLICY network_insert ON asset_network FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY network_update ON asset_network FOR UPDATE USING (company_id = get_user_company_id());

GRANT SELECT, INSERT, UPDATE ON asset_network TO authenticated;


-- =============================================================================
-- 3. asset_software_licenses — many per asset
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_software_licenses (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        uuid          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id      uuid          NOT NULL REFERENCES companies(id),
  software_name   varchar(150)  NOT NULL,
  version         varchar(50),
  category        varchar(50),  -- OS, Office, Security, Remote, Utility, etc.
  license_type    varchar(30)   NOT NULL DEFAULT 'OEM'
    CHECK (license_type IN ('OEM','Volume','Subscription','Open Source','Freeware','Trial')),
  license_key_masked varchar(100), -- masked form for display (e.g. XXXXX-····-VK7JM)
  expiry_date     date,
  status          varchar(20)   NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','soon','cancelled')),
  notes           text,
  created_by      uuid          REFERENCES auth.users(id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER trg_asset_software_updated_at
  BEFORE UPDATE ON asset_software_licenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_software_asset_id ON asset_software_licenses (asset_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_software_company_id ON asset_software_licenses (company_id) WHERE deleted_at IS NULL;

ALTER TABLE asset_software_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY software_select ON asset_software_licenses FOR SELECT USING (
  is_super_admin() OR company_id = get_user_company_id()
);
CREATE POLICY software_insert ON asset_software_licenses FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY software_update ON asset_software_licenses FOR UPDATE USING (company_id = get_user_company_id());

GRANT SELECT, INSERT, UPDATE ON asset_software_licenses TO authenticated;


-- =============================================================================
-- 4. asset_maintenance_records — many per asset
-- =============================================================================

CREATE TABLE IF NOT EXISTS asset_maintenance_records (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             uuid          NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id           uuid          NOT NULL REFERENCES companies(id),
  maintenance_date     date          NOT NULL,
  maintenance_type     varchar(20)   NOT NULL DEFAULT 'preventif'
    CHECK (maintenance_type IN ('preventif','korektif','upgrade','inspeksi')),
  description          text,
  technician_name      varchar(150),
  duration_minutes     int,
  cost                 numeric(14,2),
  status               varchar(20)   NOT NULL DEFAULT 'selesai'
    CHECK (status IN ('selesai','dalam_proses','dijadwalkan','dibatalkan')),
  next_scheduled_date  date,
  created_by           uuid          REFERENCES auth.users(id),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE TRIGGER trg_asset_maintenance_updated_at
  BEFORE UPDATE ON asset_maintenance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset_id ON asset_maintenance_records (asset_id, maintenance_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_company_id ON asset_maintenance_records (company_id) WHERE deleted_at IS NULL;

ALTER TABLE asset_maintenance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY maintenance_select ON asset_maintenance_records FOR SELECT USING (
  is_super_admin() OR company_id = get_user_company_id()
);
CREATE POLICY maintenance_insert ON asset_maintenance_records FOR INSERT WITH CHECK (company_id = get_user_company_id());
CREATE POLICY maintenance_update ON asset_maintenance_records FOR UPDATE USING (company_id = get_user_company_id());

GRANT SELECT, INSERT, UPDATE ON asset_maintenance_records TO authenticated;


-- =============================================================================
-- 5. Seed data for IT-LAP-0241 (Lenovo ThinkPad E14 G4 · JCI)
-- =============================================================================

DO $$
DECLARE
  v_jci_id   uuid;
  v_asset_id uuid;
BEGIN
  SELECT id INTO v_jci_id FROM companies WHERE code = 'JCI' LIMIT 1;

  -- Find IT-LAP-0241 by asset_code
  SELECT id INTO v_asset_id FROM assets WHERE asset_code = 'IT-LAP-0241' AND company_id = v_jci_id LIMIT 1;

  IF v_asset_id IS NULL THEN
    RAISE NOTICE 'IT-LAP-0241 not found, skipping seed';
    RETURN;
  END IF;

  -- Specs
  INSERT INTO asset_specifications (
    asset_id, company_id,
    cpu_model, cpu_cores, cpu_threads, cpu_base_ghz, cpu_turbo_ghz, cpu_cache_mb,
    ram_gb, ram_type, ram_slots_used, ram_slots_total,
    storage_gb, storage_type, storage_interface, storage_used_pct,
    display_size_inch, display_resolution, display_refresh_hz, gpu_model,
    os_name, os_version, os_build, os_arch, os_license_type,
    battery_capacity_wh, battery_health_pct, battery_cycle_count,
    webcam_desc, keyboard_desc, ports_desc, wireless_desc, weight_kg, color
  ) VALUES (
    v_asset_id, v_jci_id,
    'Intel Core i7-1255U', 10, 12, 1.7, 4.7, 12,
    16, 'DDR4-3200', 1, 2,
    512, 'NVMe', 'PCIe 4.0 ×4 M.2', 62,
    14.0, '1920×1080', 60, 'Intel Iris Xe',
    'Windows 11 Pro', '23H2', '22631', '64-bit', 'OEM',
    57.0, 87, 214,
    '720p HD · IR (Windows Hello)', 'Backlit · Layout US',
    '2× USB-C (TB4), 2× USB-A, HDMI 2.0, RJ-45',
    'Wi-Fi 6 AX201 · Bluetooth 5.1',
    1.64, 'Black'
  ) ON CONFLICT (asset_id) DO NOTHING;

  -- Network
  INSERT INTO asset_network (
    asset_id, company_id,
    ip_address, ipv6_address, mac_wifi, mac_lan,
    hostname, gateway, dns_primary, dns_secondary, vlan, domain_workgroup,
    last_seen_at, is_online
  ) VALUES (
    v_asset_id, v_jci_id,
    '10.20.3.41', 'fe80::1c4d:a7ff:fe92:3b41',
    'A4:C3:F0:92:3B:41', 'A4:C3:F0:92:3B:42',
    'JCI-LAP-0241', '10.20.3.1', '10.20.1.10', '10.20.1.11',
    'VLAN 30 · Office-Staff', 'MSIGROUP.LOCAL',
    now() - interval '2 hours', true
  ) ON CONFLICT (asset_id) DO NOTHING;

  -- Software licenses
  INSERT INTO asset_software_licenses (asset_id, company_id, software_name, version, category, license_type, license_key_masked, expiry_date, status)
  VALUES
    (v_asset_id, v_jci_id, 'Windows 11 Pro',       '23H2',   'OS',     'OEM',          'XXXXX-XXXXX-····-VK7JM', NULL,           'active'),
    (v_asset_id, v_jci_id, 'Microsoft 365 Business','2406',   'Office', 'Subscription', 'SUB-MSI-····-9921',      '2026-06-27',   'soon'),
    (v_asset_id, v_jci_id, 'Kaspersky Endpoint',    '12.4',   'Security','Volume',      'KES-VOL-····-4471',      '2027-03-15',   'active'),
    (v_asset_id, v_jci_id, 'Adobe Acrobat Pro',     '2024.2', 'Office', 'Subscription', 'ADB-VIP-····-3380',      '2026-11-09',   'active'),
    (v_asset_id, v_jci_id, 'AnyDesk Enterprise',    '8.0',    'Remote', 'Volume',       'AD-ENT-····-1290',       '2027-02-01',   'active'),
    (v_asset_id, v_jci_id, 'AutoCAD LT',            '2025',   'Design', 'Subscription', 'ACD-LT-····-7715',       '2026-05-18',   'expired'),
    (v_asset_id, v_jci_id, '7-Zip',                 '23.01',  'Utility','Open Source',  NULL,                     NULL,           'active');

  -- Maintenance records
  INSERT INTO asset_maintenance_records (asset_id, company_id, maintenance_date, maintenance_type, description, technician_name, duration_minutes, cost, status)
  VALUES
    (v_asset_id, v_jci_id, '2026-04-14', 'upgrade',   'Penambahan 1 keping SODIMM 8 GB DDR4-3200 untuk kebutuhan multitasking AutoCAD.', 'Rizki Hidayat · IT Support', 45, 620000, 'selesai'),
    (v_asset_id, v_jci_id, '2026-02-02', 'preventif', 'Pembersihan kipas & heatsink, penggantian thermal paste, update driver & BIOS.', 'Tim IT Support', 70, 150000, 'selesai'),
    (v_asset_id, v_jci_id, '2025-09-19', 'korektif',  'Baterai menggembung & cepat habis, diganti unit baru bergaransi 1 tahun.', 'Vendor · Metrodata Service', 2880, 1180000, 'selesai'),
    (v_asset_id, v_jci_id, '2024-05-14', 'preventif', 'Instalasi Windows 11 Pro, domain join, deploy standar software & antivirus.', 'Tim IT Infra', 60, 0, 'selesai');

END $$;


-- =============================================================================
-- ROLLBACK SQL
-- =============================================================================
-- DROP TABLE IF EXISTS asset_maintenance_records;
-- DROP TABLE IF EXISTS asset_software_licenses;
-- DROP TABLE IF EXISTS asset_network;
-- DROP TABLE IF EXISTS asset_specifications;
-- =============================================================================
