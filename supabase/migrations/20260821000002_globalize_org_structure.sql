-- Globalisasi struktur organisasi: departments, positions, branches
-- jadi cross-entity (company_id nullable, NULL = berlaku Group-wide).
-- Termasuk: merge duplikat per-company, gabung GA+HR ke HCGA, fix
-- anomali data (Gigih/Dery/Camellia), fix branch Semper duplikat,
-- backfill job_title dari data resmi HCGA.
-- Dijalankan manual 21 Agu 2026 oleh Den di Supabase SQL Editor.

BEGIN;

ALTER TABLE public.departments ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.positions ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.departments DROP CONSTRAINT IF EXISTS departments_company_code_unique;
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_company_code_unique;

CREATE UNIQUE INDEX IF NOT EXISTS departments_company_code_active_uidx
  ON public.departments (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS positions_company_code_active_uidx
  ON public.positions (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE deleted_at IS NULL;

CREATE POLICY departments_select_global ON public.departments
  FOR SELECT TO authenticated
  USING (company_id IS NULL AND deleted_at IS NULL);

CREATE POLICY positions_select_global ON public.positions
  FOR SELECT TO authenticated
  USING (company_id IS NULL AND deleted_at IS NULL);

CREATE OR REPLACE FUNCTION pg_temp.merge_departments(p_code text, p_survivor_company_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_survivor_id uuid;
  v_dup_id uuid;
BEGIN
  SELECT d.id INTO v_survivor_id
  FROM departments d JOIN companies c ON c.id = d.company_id
  WHERE d.code = p_code AND c.code = p_survivor_company_code AND d.deleted_at IS NULL;

  IF v_survivor_id IS NULL THEN
    RAISE EXCEPTION 'Survivor department tidak ketemu: code=%, company=%', p_code, p_survivor_company_code;
  END IF;

  FOR v_dup_id IN
    SELECT id FROM departments WHERE code = p_code AND deleted_at IS NULL AND id <> v_survivor_id
  LOOP
    UPDATE profiles SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE positions SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE assets SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE approval_rules SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE cost_centers SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE hrga_requests SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE departments SET parent_id = v_survivor_id WHERE parent_id = v_dup_id;
    UPDATE departments SET deleted_at = now(), updated_at = now() WHERE id = v_dup_id;
  END LOOP;

  UPDATE departments SET company_id = NULL, updated_at = now() WHERE id = v_survivor_id;
END $$;

SELECT pg_temp.merge_departments('MGMT', 'MSI');
SELECT pg_temp.merge_departments('PROC', 'MSI');
SELECT pg_temp.merge_departments('SLS', 'MSI');
SELECT pg_temp.merge_departments('PPJK', 'MSI');

DO $$
DECLARE
  v_survivor_id uuid;
  v_dup_id uuid;
BEGIN
  SELECT id INTO v_survivor_id FROM departments WHERE code = 'HCGA' AND deleted_at IS NULL;

  FOR v_dup_id IN SELECT id FROM departments WHERE code IN ('GA','HR') AND deleted_at IS NULL LOOP
    UPDATE profiles SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE positions SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE assets SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE approval_rules SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE cost_centers SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE hrga_requests SET department_id = v_survivor_id, updated_at = now() WHERE department_id = v_dup_id;
    UPDATE departments SET deleted_at = now(), updated_at = now() WHERE id = v_dup_id;
  END LOOP;
END $$;

UPDATE departments
SET company_id = NULL, updated_at = now()
WHERE code IN ('BD','CONSOLE','FIN','HCGA','IT','LOG')
  AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION pg_temp.merge_positions(p_code text, p_survivor_company_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_survivor_id uuid;
  v_dup_id uuid;
BEGIN
  SELECT p.id INTO v_survivor_id
  FROM positions p JOIN companies c ON c.id = p.company_id
  WHERE p.code = p_code AND c.code = p_survivor_company_code AND p.deleted_at IS NULL;

  IF v_survivor_id IS NULL THEN
    RAISE EXCEPTION 'Survivor position tidak ketemu: code=%, company=%', p_code, p_survivor_company_code;
  END IF;

  FOR v_dup_id IN
    SELECT id FROM positions WHERE code = p_code AND deleted_at IS NULL AND id <> v_survivor_id
  LOOP
    UPDATE profiles SET position_id = v_survivor_id, updated_at = now() WHERE position_id = v_dup_id;
    UPDATE positions SET deleted_at = now(), updated_at = now() WHERE id = v_dup_id;
  END LOOP;

  UPDATE positions SET company_id = NULL, updated_at = now() WHERE id = v_survivor_id;
END $$;

SELECT pg_temp.merge_positions('MGR', 'MSI');
SELECT pg_temp.merge_positions('OPR', 'MSI');
SELECT pg_temp.merge_positions('STAFF', 'MSI');

UPDATE positions
SET company_id = NULL, updated_at = now()
WHERE code IN ('CEO','GM','JR-MGR','SR-MGR','SR-STAFF','SR-SPV','SPV')
  AND deleted_at IS NULL;

DO $$
DECLARE
  v_survivor_id uuid;
  v_dup_id uuid;
BEGIN
  SELECT id INTO v_survivor_id FROM branches WHERE code = 'SEMPER' AND deleted_at IS NULL;
  SELECT id INTO v_dup_id FROM branches WHERE code = 'HO SEMP' AND deleted_at IS NULL;

  IF v_dup_id IS NOT NULL THEN
    UPDATE profiles SET branch_id = v_survivor_id, updated_at = now() WHERE branch_id = v_dup_id;
    UPDATE branches SET deleted_at = now(), updated_at = now() WHERE id = v_dup_id;
  END IF;
END $$;

UPDATE profiles SET company_id = (SELECT id FROM companies WHERE code = 'SOA'), updated_at = now()
WHERE email = 'dery.prahasto@msigroup.co.id';

UPDATE profiles SET company_id = (SELECT id FROM companies WHERE code = 'SOA'), updated_at = now()
WHERE email = 'camelia.martina@msigroup.co.id';

UPDATE profiles p
SET department_id = (SELECT id FROM departments WHERE code = 'LOG' AND deleted_at IS NULL),
    position_id   = (SELECT id FROM positions WHERE code = 'STAFF' AND deleted_at IS NULL),
    branch_id     = (SELECT b.id FROM branches b JOIN companies c ON c.id = b.company_id
                      WHERE c.code = 'SOA' AND b.code = 'HO' AND b.deleted_at IS NULL),
    updated_at = now()
WHERE p.email = 'gigih@storbitindonesia.com';

UPDATE user_roles ur
SET company_id = (SELECT id FROM companies WHERE code = 'SOA')
FROM roles r, profiles p
WHERE ur.role_id = r.id
  AND ur.user_id = p.id
  AND p.email = 'gigih@storbitindonesia.com'
  AND r.code = 'operations';

UPDATE profiles SET job_title = 'Personnel', updated_at = now() WHERE email = 'araswati.syifa@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Human Capital & General Affairs Manager', updated_at = now() WHERE email = 'info.hrga@exportimportdept.com' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Direct Procurement', updated_at = now() WHERE email = 'camelia.martina@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Procurement Manager', updated_at = now() WHERE email = 'dery.prahasto@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Account Receivable', updated_at = now() WHERE email = 'elvira@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Customer Service Logistic', updated_at = now() WHERE email = 'ilma.kamaliyah@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'IT Support', updated_at = now() WHERE email = 'lerry.gunawan@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Finance Junior Manager', updated_at = now() WHERE email = 'rini.andriyani@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Business Development General Manager', updated_at = now() WHERE email = 'vendi.sjahlendra@msigroup.co.id' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Sales Executive Console', updated_at = now() WHERE email = 'hana@exportimportdept.com' AND (job_title IS NULL OR job_title = '');
UPDATE profiles SET job_title = 'Logistic Manager', updated_at = now() WHERE email = 'denyt@msigroup.co.id' AND (job_title IS NULL OR job_title = '');

DROP FUNCTION IF EXISTS pg_temp.merge_departments(text, text);
DROP FUNCTION IF EXISTS pg_temp.merge_positions(text, text);

COMMIT;
