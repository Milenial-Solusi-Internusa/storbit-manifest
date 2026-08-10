-- Layer 0 fondasi untuk Briefing Harian, BNF (akses diperluas), dan Meeting
-- Mingguan. Ditambahkan 10 Agu 2026, target demo Kamis. Enam bagian:
-- 1. bnf_authorized_users: daftar orang yang diizinkan akses BNF di luar
--    head/direktur/CEO (misal sedang diassessment kenaikan jabatan).
-- 2. is_bnf_authorized(): gate akses gabungan, SECURITY DEFINER supaya user
--    biasa bisa cek statusnya sendiri walau RLS bnf_authorized_users_read
--    dibatasi ke super_admin.
-- 3. bnf_reports: RLS select/insert diperketat, staff tidak lagi bisa akses
--    BNF sama sekali kecuali is_bnf_authorized().
-- 4. daily_report_items: tabel baru Briefing Harian, kategori
--    task/aktivitas/insiden, guard trigger membatasi siapa boleh ubah field
--    resolusi insiden.
-- 5. bnf_report_action_items: checklist tindak lanjut per laporan BNF,
--    assigned_to wajib diisi, RLS ikut home+scope divisi/departemen laporan.
-- 6. weekly_meetings + weekly_meeting_items: rollup mingguan dari tiga
--    sumber (task pending, insiden resolved_internal, laporan BNF).

-- ============================================================
-- 1. bnf_authorized_users
-- ============================================================
BEGIN;

CREATE TABLE bnf_authorized_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  reason text,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

ALTER TABLE bnf_authorized_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY bnf_authorized_users_read ON bnf_authorized_users
FOR SELECT USING (is_super_admin());

CREATE POLICY bnf_authorized_users_insert ON bnf_authorized_users
FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY bnf_authorized_users_update ON bnf_authorized_users
FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

GRANT ALL ON bnf_authorized_users TO authenticated;

COMMIT;

-- ============================================================
-- 2. is_bnf_authorized()
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION is_bnf_authorized()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $fn$
  SELECT is_super_admin()
    OR EXISTS (SELECT 1 FROM bnf_departments WHERE head_profile_id = auth.uid() AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM bnf_divisions WHERE director_profile_id = auth.uid() AND deleted_at IS NULL)
    OR EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true AND r.code = 'ceo'
    )
    OR EXISTS (
      SELECT 1 FROM bnf_authorized_users a
      WHERE a.profile_id = auth.uid()
        AND a.company_id = get_user_company_id()
        AND a.revoked_at IS NULL
    );
$fn$;

COMMIT;

-- ============================================================
-- 3. bnf_reports RLS diperketat
-- ============================================================
BEGIN;

DROP POLICY bnf_reports_select ON bnf_reports;
CREATE POLICY bnf_reports_select ON bnf_reports
FOR SELECT USING (
  is_super_admin()
  OR (company_id = get_user_company_id() AND deleted_at IS NULL AND is_bnf_authorized())
);

DROP POLICY bnf_reports_insert ON bnf_reports;
CREATE POLICY bnf_reports_insert ON bnf_reports
FOR INSERT WITH CHECK (
  company_id = get_user_company_id() AND created_by = auth.uid() AND is_bnf_authorized()
);

COMMIT;

-- ============================================================
-- 4. daily_report_items
-- ============================================================
BEGIN;

CREATE TABLE daily_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES bnf_departments(id) ON DELETE RESTRICT,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  category varchar(20) NOT NULL CHECK (category IN ('task','aktivitas','insiden')),
  description text NOT NULL,
  task_status varchar(20) CHECK (task_status IN ('pending','selesai')),
  carried_from_id uuid REFERENCES daily_report_items(id),
  insiden_resolution varchar(20) CHECK (insiden_resolution IN ('pending_review','resolved_internal','pulled_to_bnf')),
  pulled_to_bnf_report_id uuid REFERENCES bnf_reports(id),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_report_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_report_items_read ON daily_report_items
FOR SELECT USING (is_super_admin() OR company_id = get_user_company_id());

CREATE POLICY daily_report_items_insert ON daily_report_items
FOR INSERT WITH CHECK (
  is_super_admin() OR (company_id = get_user_company_id() AND created_by = auth.uid())
);

CREATE POLICY daily_report_items_update ON daily_report_items
FOR UPDATE USING (is_super_admin() OR company_id = get_user_company_id())
WITH CHECK (is_super_admin() OR company_id = get_user_company_id());

GRANT ALL ON daily_report_items TO authenticated;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION guard_daily_report_items_field_update()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT is_bnf_authorized() THEN
    IF NEW.insiden_resolution IS DISTINCT FROM OLD.insiden_resolution
       OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
       OR NEW.pulled_to_bnf_report_id IS DISTINCT FROM OLD.pulled_to_bnf_report_id THEN
      RAISE EXCEPTION 'hanya head atau orang yang diizinkan yang boleh mengubah resolusi insiden';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_guard_daily_report_items_field_update
BEFORE UPDATE ON daily_report_items
FOR EACH ROW EXECUTE FUNCTION guard_daily_report_items_field_update();

COMMIT;

-- ============================================================
-- 5. bnf_report_action_items
-- ============================================================
BEGIN;

CREATE TABLE bnf_report_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES bnf_reports(id) ON DELETE CASCADE,
  description text NOT NULL,
  assigned_to uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  is_done boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id)
);

ALTER TABLE bnf_report_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY bnf_report_action_items_read ON bnf_report_action_items
FOR SELECT USING (
  is_bnf_authorized() AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM bnf_reports r
      LEFT JOIN bnf_department_scopes deps ON deps.department_id = r.department_id AND deps.company_id = get_user_company_id()
      LEFT JOIN bnf_division_scopes divs ON divs.division_id = r.division_id AND divs.company_id = get_user_company_id()
      WHERE r.id = report_id AND r.deleted_at IS NULL
        AND (r.company_id = get_user_company_id() OR deps.id IS NOT NULL OR divs.id IS NOT NULL)
    )
  )
);

CREATE POLICY bnf_report_action_items_insert ON bnf_report_action_items
FOR INSERT WITH CHECK (
  is_bnf_authorized() AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM bnf_reports r
      LEFT JOIN bnf_department_scopes deps ON deps.department_id = r.department_id AND deps.company_id = get_user_company_id()
      LEFT JOIN bnf_division_scopes divs ON divs.division_id = r.division_id AND divs.company_id = get_user_company_id()
      WHERE r.id = report_id AND r.deleted_at IS NULL
        AND (r.company_id = get_user_company_id() OR deps.id IS NOT NULL OR divs.id IS NOT NULL)
    )
  )
);

CREATE POLICY bnf_report_action_items_update ON bnf_report_action_items
FOR UPDATE USING (
  is_bnf_authorized() AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM bnf_reports r
      LEFT JOIN bnf_department_scopes deps ON deps.department_id = r.department_id AND deps.company_id = get_user_company_id()
      LEFT JOIN bnf_division_scopes divs ON divs.division_id = r.division_id AND divs.company_id = get_user_company_id()
      WHERE r.id = report_id AND r.deleted_at IS NULL
        AND (r.company_id = get_user_company_id() OR deps.id IS NOT NULL OR divs.id IS NOT NULL)
    )
  )
)
WITH CHECK (
  is_bnf_authorized() AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM bnf_reports r
      LEFT JOIN bnf_department_scopes deps ON deps.department_id = r.department_id AND deps.company_id = get_user_company_id()
      LEFT JOIN bnf_division_scopes divs ON divs.division_id = r.division_id AND divs.company_id = get_user_company_id()
      WHERE r.id = report_id AND r.deleted_at IS NULL
        AND (r.company_id = get_user_company_id() OR deps.id IS NOT NULL OR divs.id IS NOT NULL)
    )
  )
);

GRANT ALL ON bnf_report_action_items TO authenticated;

COMMIT;

-- ============================================================
-- 6. weekly_meetings + weekly_meeting_items
-- ============================================================
BEGIN;

CREATE TABLE weekly_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES bnf_departments(id) ON DELETE RESTRICT,
  week_start_date date NOT NULL,
  meeting_date date,
  peserta text,
  keterangan text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE weekly_meeting_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_meeting_id uuid NOT NULL REFERENCES weekly_meetings(id) ON DELETE CASCADE,
  source_type varchar(20) NOT NULL CHECK (source_type IN ('task_pending','insiden_resolved','bnf_report')),
  daily_report_item_id uuid REFERENCES daily_report_items(id),
  bnf_report_id uuid REFERENCES bnf_reports(id),
  catatan_meeting text,
  action_plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE weekly_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_meeting_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_meetings_all ON weekly_meetings
FOR ALL USING (
  is_super_admin() OR (company_id = get_user_company_id() AND is_bnf_authorized())
)
WITH CHECK (
  is_super_admin() OR (company_id = get_user_company_id() AND is_bnf_authorized())
);

CREATE POLICY weekly_meeting_items_all ON weekly_meeting_items
FOR ALL USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM weekly_meetings m
    WHERE m.id = weekly_meeting_id AND m.company_id = get_user_company_id() AND is_bnf_authorized()
  )
)
WITH CHECK (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM weekly_meetings m
    WHERE m.id = weekly_meeting_id AND m.company_id = get_user_company_id() AND is_bnf_authorized()
  )
);

GRANT ALL ON weekly_meetings TO authenticated;
GRANT ALL ON weekly_meeting_items TO authenticated;

COMMIT;
