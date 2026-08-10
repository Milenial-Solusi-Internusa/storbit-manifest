-- Tambah model home+scope untuk bnf_divisions/bnf_departments.
-- Home tetap company_id yang sudah ada di masing-masing tabel. Scope adalah
-- company TAMBAHAN di luar home yang laporannya juga masuk ke divisi/
-- departemen itu (kasus posisi group-wide seperti BD GM: home MSI, scope
-- JCI+SOA). Home tidak perlu ditulis ulang di tabel scope, dijaga trigger.
-- Ditambahkan 10 Agu 2026, menggantikan pendekatan sebelumnya (tombol
-- "Salin ke entity lain" di BNFOrgRolesPage.jsx, dicabut di commit terkait)
-- yang mengasumsikan 1 posisi = banyak row terpisah per company.

BEGIN;

CREATE TABLE bnf_division_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL REFERENCES bnf_divisions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, company_id)
);

CREATE TABLE bnf_department_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES bnf_departments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, company_id)
);

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION guard_bnf_division_scope_not_home()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bnf_divisions
    WHERE id = NEW.division_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'company_id % adalah home company divisi %, tidak perlu ditulis di scope', NEW.company_id, NEW.division_id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_guard_bnf_division_scope_not_home
BEFORE INSERT OR UPDATE ON bnf_division_scopes
FOR EACH ROW EXECUTE FUNCTION guard_bnf_division_scope_not_home();

CREATE OR REPLACE FUNCTION guard_bnf_department_scope_not_home()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bnf_departments
    WHERE id = NEW.department_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'company_id % adalah home company departemen %, tidak perlu ditulis di scope', NEW.company_id, NEW.department_id;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_guard_bnf_department_scope_not_home
BEFORE INSERT OR UPDATE ON bnf_department_scopes
FOR EACH ROW EXECUTE FUNCTION guard_bnf_department_scope_not_home();

COMMIT;

BEGIN;

ALTER TABLE bnf_division_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bnf_department_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY bnf_division_scopes_read ON bnf_division_scopes
FOR SELECT
USING (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY bnf_division_scopes_write ON bnf_division_scopes
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY bnf_department_scopes_read ON bnf_department_scopes
FOR SELECT
USING (company_id = get_user_company_id() OR is_super_admin());

CREATE POLICY bnf_department_scopes_write ON bnf_department_scopes
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

GRANT ALL ON bnf_division_scopes TO authenticated;
GRANT ALL ON bnf_department_scopes TO authenticated;

COMMIT;

BEGIN;

DROP POLICY bnf_divisions_read ON bnf_divisions;

CREATE POLICY bnf_divisions_read ON bnf_divisions
FOR SELECT
USING (
  is_super_admin()
  OR (company_id = get_user_company_id() AND deleted_at IS NULL)
  OR (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM bnf_division_scopes s
    WHERE s.division_id = bnf_divisions.id
      AND s.company_id = get_user_company_id()
  ))
);

DROP POLICY bnf_departments_read ON bnf_departments;

CREATE POLICY bnf_departments_read ON bnf_departments
FOR SELECT
USING (
  is_super_admin()
  OR (company_id = get_user_company_id() AND deleted_at IS NULL)
  OR (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM bnf_department_scopes s
    WHERE s.department_id = bnf_departments.id
      AND s.company_id = get_user_company_id()
  ))
);

COMMIT;
