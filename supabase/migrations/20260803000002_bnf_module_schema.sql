-- BNF (Bad News First) module — cross-division incident reporting, migrated
-- from a standalone Google Apps Script app (old data NOT migrated, clean start).
-- 5 new tables: bnf_divisions, bnf_departments (master data, mirrors
-- `departments` conventions), bnf_reports (transactional, mirrors
-- `hrga_requests` conventions), bnf_division_recipients (notification
-- routing, many-to-many), bnf_report_logs (append-only status history,
-- mirrors `activity_logs`).
--
-- Status: DRAFT — do NOT execute without explicit approval (Nexus schema-change
-- workflow, AGENTS.md "Database Schema Change"). See docs/architecture plan
-- for BNF module for full design rationale + RLS precedent citations.

-- ============================================================================
-- 1. bnf_divisions (master data)
-- ============================================================================
CREATE TABLE public.bnf_divisions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    code varchar(20) NOT NULL,
    name varchar(100) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT bnf_divisions_pkey PRIMARY KEY (id),
    CONSTRAINT bnf_divisions_company_code_unique UNIQUE (company_id, code),
    CONSTRAINT bnf_divisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
    CONSTRAINT bnf_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

ALTER TABLE public.bnf_divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY bnf_divisions_read ON public.bnf_divisions FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id() AND deleted_at IS NULL));

CREATE POLICY bnf_divisions_insert ON public.bnf_divisions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_above() AND company_id = public.get_user_company_id()));

CREATE POLICY bnf_divisions_update ON public.bnf_divisions FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_above() AND company_id = public.get_user_company_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_above() AND company_id = public.get_user_company_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bnf_divisions TO authenticated;

-- ============================================================================
-- 2. bnf_departments (master data, child of bnf_divisions)
-- ============================================================================
CREATE TABLE public.bnf_departments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    division_id uuid NOT NULL,
    code varchar(20) NOT NULL,
    name varchar(100) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT bnf_departments_pkey PRIMARY KEY (id),
    CONSTRAINT bnf_departments_division_code_unique UNIQUE (division_id, code),
    CONSTRAINT bnf_departments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
    CONSTRAINT bnf_departments_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.bnf_divisions(id) ON DELETE RESTRICT,
    CONSTRAINT bnf_departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE INDEX idx_bnf_departments_division ON public.bnf_departments(division_id);

ALTER TABLE public.bnf_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bnf_departments_read ON public.bnf_departments FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id() AND deleted_at IS NULL));

CREATE POLICY bnf_departments_insert ON public.bnf_departments FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_above() AND company_id = public.get_user_company_id()));

CREATE POLICY bnf_departments_update ON public.bnf_departments FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_above() AND company_id = public.get_user_company_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_above() AND company_id = public.get_user_company_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bnf_departments TO authenticated;

-- ============================================================================
-- 3. bnf_reports (transactional — main table)
-- ============================================================================
CREATE TABLE public.bnf_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    report_no varchar(30) NOT NULL,
    division_id uuid NOT NULL,
    department_id uuid NOT NULL,
    related_department_id uuid,
    description text NOT NULL,
    root_cause text,
    solution text,
    target_date date NOT NULL,
    escalation_level varchar(20),
    status varchar(20) NOT NULL DEFAULT 'Open',
    closed_at timestamptz,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT bnf_reports_pkey PRIMARY KEY (id),
    CONSTRAINT bnf_reports_company_report_no_unique UNIQUE (company_id, report_no),
    CONSTRAINT bnf_reports_escalation_level_check CHECK (escalation_level IS NULL OR escalation_level IN ('manager_direct','direktur_divisi','ceo')),
    CONSTRAINT bnf_reports_status_check CHECK (status IN ('Open','In Progress','Escalated','Closed')),
    CONSTRAINT bnf_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
    CONSTRAINT bnf_reports_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.bnf_divisions(id) ON DELETE RESTRICT,
    CONSTRAINT bnf_reports_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.bnf_departments(id) ON DELETE RESTRICT,
    CONSTRAINT bnf_reports_related_department_id_fkey FOREIGN KEY (related_department_id) REFERENCES public.bnf_departments(id) ON DELETE SET NULL,
    CONSTRAINT bnf_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
    CONSTRAINT bnf_reports_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);

CREATE INDEX idx_bnf_reports_company_status ON public.bnf_reports(company_id, status);
CREATE INDEX idx_bnf_reports_division ON public.bnf_reports(division_id);
CREATE INDEX idx_bnf_reports_created_by ON public.bnf_reports(created_by);

COMMENT ON COLUMN public.bnf_reports.status IS 'Title Case by design (Open/In Progress/Escalated/Closed) — mirrors App.jsx StatusBadge value convention, unlike lowercase status on activities/hrga_requests.';

ALTER TABLE public.bnf_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: everyone in the same company can see every non-deleted report (no
-- creator/role gate) — mirrors the old GAS app's openness. deleted_at filter
-- added for consistency with bnf_divisions_read/bnf_departments_read above
-- (this table's first draft omitted it — inconsistent with its own siblings
-- in this same migration, not a deliberate choice).
CREATE POLICY bnf_reports_select ON public.bnf_reports FOR SELECT TO authenticated
  USING ((company_id = public.get_user_company_id() AND deleted_at IS NULL) OR public.is_super_admin());

-- INSERT: any authenticated user, for their own company, as themselves —
-- mirrors hrga_requests_insert (schema_snapshot.sql:12377).
CREATE POLICY bnf_reports_insert ON public.bnf_reports FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id() AND created_by = auth.uid());

-- UPDATE: deliberately loose — anyone in the company may change status/remark,
-- no created_by/role gate. Precedent: customers_update, 5x asset_*_update,
-- document_sequences_increment (all USING (company_id = get_user_company_id())
-- with no further restriction) — this is an established Nexus pattern, not a
-- new exception.
CREATE POLICY bnf_reports_update ON public.bnf_reports FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id() OR public.is_super_admin())
  WITH CHECK (company_id = public.get_user_company_id() OR public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bnf_reports TO authenticated;

-- ============================================================================
-- 4. bnf_division_recipients (notification routing, many-to-many)
-- ============================================================================
CREATE TABLE public.bnf_division_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    division_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bnf_division_recipients_pkey PRIMARY KEY (id),
    CONSTRAINT bnf_division_recipients_unique UNIQUE (division_id, profile_id),
    CONSTRAINT bnf_division_recipients_division_id_fkey FOREIGN KEY (division_id) REFERENCES public.bnf_divisions(id) ON DELETE CASCADE,
    CONSTRAINT bnf_division_recipients_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT bnf_division_recipients_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE INDEX idx_bnf_division_recipients_division ON public.bnf_division_recipients(division_id);

ALTER TABLE public.bnf_division_recipients ENABLE ROW LEVEL SECURITY;

-- SELECT open (company-scoped via parent join) — the submitting user's browser
-- needs to read this table client-side to resolve who to email (same shape as
-- InquiryChatter.jsx resolving `profiles.email` before calling send-email).
CREATE POLICY bnf_division_recipients_read ON public.bnf_division_recipients FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.bnf_divisions d
      WHERE d.id = bnf_division_recipients.division_id
        AND d.company_id = public.get_user_company_id()
    )
  );

-- Write (who receives notifications) is a different trust boundary from the
-- report content itself — restricted to admin-or-above, NOT part of BNF's
-- general openness (see plan doc, investigation point #3).
CREATE POLICY bnf_division_recipients_insert ON public.bnf_division_recipients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR (
      public.is_admin_or_above() AND EXISTS (
        SELECT 1 FROM public.bnf_divisions d
        WHERE d.id = bnf_division_recipients.division_id
          AND d.company_id = public.get_user_company_id()
      )
    )
  );

CREATE POLICY bnf_division_recipients_update ON public.bnf_division_recipients FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR (
      public.is_admin_or_above() AND EXISTS (
        SELECT 1 FROM public.bnf_divisions d
        WHERE d.id = bnf_division_recipients.division_id
          AND d.company_id = public.get_user_company_id()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin() OR (
      public.is_admin_or_above() AND EXISTS (
        SELECT 1 FROM public.bnf_divisions d
        WHERE d.id = bnf_division_recipients.division_id
          AND d.company_id = public.get_user_company_id()
      )
    )
  );

CREATE POLICY bnf_division_recipients_delete ON public.bnf_division_recipients FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR (
      public.is_admin_or_above() AND EXISTS (
        SELECT 1 FROM public.bnf_divisions d
        WHERE d.id = bnf_division_recipients.division_id
          AND d.company_id = public.get_user_company_id()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bnf_division_recipients TO authenticated;

-- ============================================================================
-- 5. bnf_report_logs (append-only status history — mirrors activity_logs)
-- ============================================================================
CREATE TABLE public.bnf_report_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    from_status varchar(20),
    to_status varchar(20) NOT NULL,
    note text,
    changed_by uuid NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bnf_report_logs_pkey PRIMARY KEY (id),
    CONSTRAINT bnf_report_logs_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.bnf_reports(id) ON DELETE CASCADE,
    CONSTRAINT bnf_report_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);

CREATE INDEX idx_bnf_report_logs_report ON public.bnf_report_logs(report_id);

ALTER TABLE public.bnf_report_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY bnf_report_logs_read ON public.bnf_report_logs FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.bnf_reports r
      WHERE r.id = bnf_report_logs.report_id
        AND r.company_id = public.get_user_company_id()
    )
  );

-- Insert follows the same openness as bnf_reports_update (logging a status
-- change is intrinsically tied to making one) — no creator/role gate beyond
-- company scoping.
CREATE POLICY bnf_report_logs_insert ON public.bnf_report_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.bnf_reports r
      WHERE r.id = bnf_report_logs.report_id
        AND r.company_id = public.get_user_company_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bnf_report_logs TO authenticated;

-- ============================================================================
-- Seed data — bnf_divisions + bnf_departments, all 3 companies (MSI/JCI/SOA).
-- Uses entity UUIDs directly (not `code`) to sidestep the pre-existing
-- SBI-vs-SOA naming discrepancy between schema comments and docs (see plan
-- doc, investigation point #4) — not something this migration fixes.
-- ON CONFLICT DO NOTHING mirrors 20260524000002_branches_departments.sql for
-- replay-safety.
-- ============================================================================
INSERT INTO public.bnf_divisions (company_id, code, name)
SELECT c.id, d.code, d.name
FROM (
  VALUES
    ('0e1840d8-e6fb-4190-bd09-88338e68b492'::uuid), -- MSI
    ('42569e7c-531b-4d2b-832a-d5a7268c455b'::uuid), -- JCI
    ('d2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid)  -- SOA/SBI
) AS c(id)
CROSS JOIN (
  VALUES
    ('SCM',  'Supply Chain Management'),
    ('BD',   'Business Development'),
    ('FAT',  'Finance, Accounting & Tax'),
    ('HCGA', 'Human Capital & General Affair')
) AS d(code, name)
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO public.bnf_departments (company_id, division_id, code, name)
SELECT d.company_id, d.id, dep.code, dep.name
FROM public.bnf_divisions d
JOIN (
  VALUES
    ('SCM',  'LOG',     'Logistic'),
    ('SCM',  'CONSOLE', 'Console'),
    ('SCM',  'PROC',    'Procurement'),
    ('SCM',  'PPJK',    'PPJK'),
    ('BD',   'SALES',   'Sales'),
    ('BD',   'AE',      'AE'),
    ('BD',   'DIGIMKT', 'Digital Marketing'),
    ('FAT',  'AP',      'AP'),
    ('FAT',  'AR',      'AR'),
    ('FAT',  'CM',      'CM'),
    ('FAT',  'ACC',     'Accounting'),
    ('HCGA', 'HC',      'Human Capital'),
    ('HCGA', 'GA',      'General Affair'),
    ('HCGA', 'LEGAL',   'Legal')
) AS dep(division_code, code, name) ON dep.division_code = d.code
ON CONFLICT (division_id, code) DO NOTHING;
