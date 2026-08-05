-- =============================================================================
-- Migration: 20260805000002_bnf_report_related_departments
-- Phase:     BNF module expansion — Fase G (Divisi/Dept Irisan jadi multi-select)
-- Purpose:   Ganti bnf_reports.related_department_id (FK tunggal) jadi tabel
--            junction many-to-many bnf_report_related_departments. Migrasi
--            data lama + drop kolom lama DALAM migrasi yang sama (bukan
--            langkah terpisah) — tidak ada jeda data hilang/dua sumber
--            kebenaran yang bisa drift.
-- Depends:   20260803000002_bnf_module_schema (bnf_reports/bnf_departments),
--            20260804000001_bnf_org_roles_and_report_field_guard (trigger
--            guard_bnf_reports_field_update yang direplace di sini)
-- Status:    DRAFT — do NOT execute without explicit approval
--
-- URUTAN PENTING: trigger DULU (hapus referensi related_department_id),
-- BARU drop kolom — supaya tidak ada jeda di mana trigger mereferensikan
-- kolom yang sudah tak ada (akan mematahkan SEMUA UPDATE ke bnf_reports:
-- ubah status, edit, hapus).
-- =============================================================================

-- ROLLBACK (manual review — bukan cuma DROP TABLE, kolom lama juga perlu
-- dikembalikan + trigger direvert + data dipindah balik):
-- 1. ALTER TABLE public.bnf_reports ADD COLUMN related_department_id uuid
--      REFERENCES public.bnf_departments(id) ON DELETE SET NULL;
-- 2. UPDATE public.bnf_reports r SET related_department_id = (
--      SELECT department_id FROM public.bnf_report_related_departments
--      WHERE report_id = r.id ORDER BY created_at LIMIT 1
--    ); -- CATATAN: kalau ada laporan dengan >1 department setelah Fase G
--       -- dipakai, rollback ini cuma ambil 1 (paling lama) — rollback bukan
--       -- operasi lossless kalau data multi-select sudah pernah dipakai.
-- 3. CREATE OR REPLACE FUNCTION guard_bnf_reports_field_update() — kembalikan
--      baris "OR NEW.related_department_id IS DISTINCT FROM OLD.related_department_id"
--      (lihat migrasi 20260804000001 utk versi lengkap sebelum Fase G).
-- 4. DROP TABLE public.bnf_report_related_departments;
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel junction baru
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bnf_report_related_departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id uuid NOT NULL,
    department_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bnf_report_related_departments_pkey PRIMARY KEY (id),
    CONSTRAINT bnf_report_related_departments_unique UNIQUE (report_id, department_id),
    CONSTRAINT bnf_report_related_departments_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.bnf_reports(id) ON DELETE CASCADE,
    CONSTRAINT bnf_report_related_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.bnf_departments(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bnf_report_related_departments_report ON public.bnf_report_related_departments(report_id);

ALTER TABLE public.bnf_report_related_departments ENABLE ROW LEVEL SECURITY;

-- SELECT: terbuka ke semua orang di company laporan induknya — meniru persis
-- bnf_report_logs_read, tidak ada pembatasan pelapor/admin (baca isi laporan
-- sudah terbuka company-wide, konsisten dengan bnf_reports_select).
CREATE POLICY bnf_report_related_departments_read ON public.bnf_report_related_departments FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.bnf_reports r
      WHERE r.id = bnf_report_related_departments.report_id
        AND r.company_id = public.get_user_company_id()
    )
  );

-- INSERT/DELETE: HANYA pelapor asli ATAU admin_or_above DARI COMPANY YANG
-- SAMA dengan laporan itu — mirror Tier 2 guard_bnf_reports_field_update,
-- tapi dengan company_id dicek eksplisit di sini (trigger asalnya tidak
-- perlu, karena sudah difilter RLS bnf_reports_update's USING clause di
-- LUAR-nya; tabel ini tidak punya lapisan terluar seperti itu, jadi harus
-- eksplisit sendiri supaya admin company lain tidak bisa insert/delete
-- baris utk laporan company lain).
CREATE POLICY bnf_report_related_departments_insert ON public.bnf_report_related_departments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.bnf_reports r
      WHERE r.id = bnf_report_related_departments.report_id
        AND r.company_id = public.get_user_company_id()
        AND (r.created_by = auth.uid() OR public.is_admin_or_above())
    )
  );

CREATE POLICY bnf_report_related_departments_delete ON public.bnf_report_related_departments FOR DELETE TO authenticated
  USING (
    public.is_super_admin() OR EXISTS (
      SELECT 1 FROM public.bnf_reports r
      WHERE r.id = bnf_report_related_departments.report_id
        AND r.company_id = public.get_user_company_id()
        AND (r.created_by = auth.uid() OR public.is_admin_or_above())
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Migrasi data lama — SEBELUM kolom lama di-drop
-- ----------------------------------------------------------------------------
INSERT INTO public.bnf_report_related_departments (report_id, department_id)
SELECT id, related_department_id
FROM public.bnf_reports
WHERE related_department_id IS NOT NULL
ON CONFLICT (report_id, department_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Perbaiki trigger — hapus referensi ke kolom yang akan di-drop.
--    SEBELUM DROP COLUMN (lihat catatan "URUTAN PENTING" di atas).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_bnf_reports_field_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id          IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.report_no  IS DISTINCT FROM OLD.report_no
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Field id/company_id/report_no/created_by/created_at bersifat permanen — tidak bisa diubah lewat UPDATE aplikasi. Perbaikan data harus lewat SQL Editor.';
  END IF;

  IF OLD.created_by = auth.uid() OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  IF NEW.division_id            IS DISTINCT FROM OLD.division_id
     OR NEW.department_id         IS DISTINCT FROM OLD.department_id
     OR NEW.description           IS DISTINCT FROM OLD.description
     OR NEW.root_cause            IS DISTINCT FROM OLD.root_cause
     OR NEW.solution              IS DISTINCT FROM OLD.solution
     OR NEW.target_date           IS DISTINCT FROM OLD.target_date
     OR NEW.escalation_level      IS DISTINCT FROM OLD.escalation_level
     OR NEW.deleted_at            IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'Hanya pelapor asli atau admin yang boleh mengubah field ini pada laporan BNF';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_bnf_reports_field_update() IS 'BEFORE UPDATE guard on bnf_reports, 4 tiers: (0) auth.uid() IS NULL (SQL Editor/migrations/service-role) bypasses everything; (1) id/company_id/report_no/created_by/created_at always locked, no exceptions; (2) created_by = auth.uid() or is_admin_or_above() may edit remaining report-content columns; (3) everyone else in the company (existing bnf_reports_update RLS row-scope, unchanged) may only edit status/updated_by/closed_at. Fase G (2026-08-05): related_department_id removed from Tier 2 list — moved to bnf_report_related_departments junction table with its own RLS.';

-- ----------------------------------------------------------------------------
-- 4. Drop kolom lama — SETELAH data dipindah + trigger diperbaiki.
--    DROP COLUMN otomatis membawa serta FK constraint-nya sendiri.
-- ----------------------------------------------------------------------------
ALTER TABLE public.bnf_reports DROP COLUMN IF EXISTS related_department_id;

-- Verifikasi:
-- SELECT COUNT(*) FROM public.bnf_report_related_departments; -- harus = jumlah baris lama yang related_department_id-nya terisi
-- SELECT column_name FROM information_schema.columns WHERE table_name='bnf_reports' AND column_name='related_department_id'; -- harus 0 baris
-- UPDATE public.bnf_reports SET status = status WHERE id = (SELECT id FROM public.bnf_reports LIMIT 1); -- sanity check trigger tidak error
