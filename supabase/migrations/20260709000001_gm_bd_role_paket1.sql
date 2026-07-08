-- ============================================================================
-- PAKET 1 — Role gm_bd (GM Business Development): fondasi DB (single-entity MSI)
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-09.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase
--    SQL Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli
--    agar tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: Setup role baru `gm_bd` (GM Business Development), posisi hierarki
--   setara/dekat `gm` (ceo > gm/gm_bd > manager). Paket 1 = single-entity MSI,
--   FULL CRM + Reporting + Approval (Lead Pool + MOM), TUTUP logistics/finance,
--   HRGA skip. Cross-entity (lintas 3 entitas) = Paket 2, BELUM (butuh custom
--   RLS — checkbox CROSS ENTITY di UI Roles bersifat display-only/inert). Sisi
--   KODE (frontend: ERP_ROLE_PRIORITY, ROLES, gate menu/approval, MOM guards)
--   dikerjakan terpisah di branch yang sama. Rujukan analisis: AUDIT.md.
--
-- ISI:
--   Statement 1 — INSERT roles gm_bd (MSI) → role id
--                 627ab7be-5ebe-424b-ae62-9914da0dcc52. ON CONFLICT DO NOTHING
--                 (idempoten via UNIQUE (company_id, code)).
--   Statement 2 — grant 7 permission crm.* (view/create/edit/delete/approve/
--                 export/print) ke role gm_bd. Modul 'crm' MEMANG ada di katalog
--                 `permissions` (bukan granular customers/quotations). ON
--                 CONFLICT DO NOTHING.
--   Statement 3 — CREATE OR REPLACE is_manager_or_above() + 'gm_bd' ke daftar
--                 code (agar gm_bd lihat CRM se-company via RLS, bukan hanya
--                 baris own). Dollar-quote bernama $fn$.
-- ============================================================================


-- STATEMENT 1: INSERT role gm_bd (MSI)
INSERT INTO roles (company_id, code, name, is_system_role, is_active)
VALUES ('0e1840d8-e6fb-4190-bd09-88338e68b492', 'gm_bd', 'GM Business Development', true, true)
ON CONFLICT (company_id, code) DO NOTHING
RETURNING id, company_id, code, name;
-- hasil: role id = 627ab7be-5ebe-424b-ae62-9914da0dcc52

-- STATEMENT 2: grant 7 permission crm ke gm_bd
INSERT INTO role_permissions (role_id, permission_id)
VALUES
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', '40dfbcae-c652-4ae8-9621-daefcb9169d1'),  -- crm.view
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', '0e010751-bd8f-4bb2-ab55-d29ef69cde0d'),  -- crm.create
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', 'c5274a9e-0872-4f66-aa0e-e8324ee31eb8'),  -- crm.edit
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', '7f88cbfc-e06f-4568-9861-58d78f505615'),  -- crm.delete
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', '2f4583c8-3393-49fc-88bf-7f527431d930'),  -- crm.approve
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', '8bfe8dac-fcf9-471d-88cb-042d7da56b0f'),  -- crm.export
  ('627ab7be-5ebe-424b-ae62-9914da0dcc52', '394fb750-0825-4fcd-a14b-19974d58ddd3')   -- crm.print
ON CONFLICT DO NOTHING
RETURNING role_id, permission_id;

-- STATEMENT 3: CREATE OR REPLACE is_manager_or_above (+gm_bd)
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$fn$;
