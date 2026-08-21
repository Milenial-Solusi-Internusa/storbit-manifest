-- Globalisasi roles: company_id nullable (NULL = berlaku Group-wide),
-- merge 3 baris per-company jadi 1 baris global untuk 14 kode role.
-- Dijalankan manual 21 Agu 2026 oleh Den di Supabase SQL Editor.

BEGIN;

ALTER TABLE public.roles ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_company_code_unique;

CREATE UNIQUE INDEX IF NOT EXISTS roles_company_code_active_uidx
  ON public.roles (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE deleted_at IS NULL;

CREATE POLICY roles_select_global ON public.roles
  FOR SELECT TO authenticated
  USING (company_id IS NULL AND deleted_at IS NULL);

CREATE OR REPLACE FUNCTION pg_temp.merge_roles(p_code text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_survivor_id uuid;
  v_dup_id uuid;
BEGIN
  SELECT r.id INTO v_survivor_id
  FROM roles r JOIN companies c ON c.id = r.company_id
  WHERE r.code = p_code AND c.code = 'MSI' AND r.deleted_at IS NULL;

  IF v_survivor_id IS NULL THEN
    SELECT id INTO v_survivor_id FROM roles
    WHERE code = p_code AND deleted_at IS NULL AND company_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_survivor_id IS NULL THEN
    RAISE EXCEPTION 'Survivor role tidak ketemu buat code=%', p_code;
  END IF;

  FOR v_dup_id IN
    SELECT id FROM roles WHERE code = p_code AND deleted_at IS NULL AND id <> v_survivor_id
  LOOP
    DELETE FROM user_roles dup
    WHERE dup.role_id = v_dup_id
      AND EXISTS (
        SELECT 1 FROM user_roles sv
        WHERE sv.role_id = v_survivor_id
          AND sv.user_id = dup.user_id
          AND sv.company_id = dup.company_id
      );
    UPDATE user_roles SET role_id = v_survivor_id WHERE role_id = v_dup_id;

    DELETE FROM role_permissions dup
    WHERE dup.role_id = v_dup_id
      AND EXISTS (
        SELECT 1 FROM role_permissions sv
        WHERE sv.role_id = v_survivor_id AND sv.permission_id = dup.permission_id
      );
    UPDATE role_permissions SET role_id = v_survivor_id WHERE role_id = v_dup_id;

    DELETE FROM role_permission_templates dup
    WHERE dup.role_id = v_dup_id
      AND EXISTS (
        SELECT 1 FROM role_permission_templates sv
        WHERE sv.role_id = v_survivor_id AND sv.menu_action_id = dup.menu_action_id
      );
    UPDATE role_permission_templates SET role_id = v_survivor_id WHERE role_id = v_dup_id;

    DELETE FROM role_menu_permissions dup
    WHERE dup.role_id = v_dup_id
      AND (
        (dup.menu_action_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM role_menu_permissions sv
          WHERE sv.role_id = v_survivor_id AND sv.menu_action_id = dup.menu_action_id
        ))
        OR
        (dup.module_action_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM role_menu_permissions sv
          WHERE sv.role_id = v_survivor_id AND sv.module_action_id = dup.module_action_id
        ))
      );
    UPDATE role_menu_permissions SET role_id = v_survivor_id WHERE role_id = v_dup_id;

    UPDATE approval_rules SET approver_role_id = v_survivor_id WHERE approver_role_id = v_dup_id;

    UPDATE roles SET deleted_at = now(), updated_at = now() WHERE id = v_dup_id;
  END LOOP;

  UPDATE roles SET company_id = NULL, updated_at = now() WHERE id = v_survivor_id;
END $$;

SELECT pg_temp.merge_roles(code)
FROM (VALUES ('super_admin'),('admin'),('ceo'),('gm'),('gm_bd'),('manager'),
             ('operations'),('finance'),('finance_controller'),
             ('procurement'),('sales'),('hrga'),('it'),('viewer')) AS t(code);

DROP FUNCTION IF EXISTS pg_temp.merge_roles(text);

COMMIT;
