-- =============================================================================
-- Migration: 20260804000001_bnf_org_roles_and_report_field_guard
-- Phase:     BNF module expansion — Fase A (fondasi DB, 1/7 fase; semua fase
--            berikutnya bergantung pada ini)
-- Purpose:   (1) Tambah bnf_departments.head_profile_id +
--            bnf_divisions.director_profile_id untuk notifikasi/eskalasi.
--            (2) Restriksi kolom pada UPDATE bnf_reports via BEFORE UPDATE
--            trigger — Postgres RLS tidak bisa membatasi kolom individual
--            dalam satu UPDATE policy, jadi trigger adalah mekanisme
--            tambahan DI LUAR RLS (policy bnf_reports_update sendiri TIDAK
--            diubah oleh migrasi ini).
-- Depends:   20260803000002_bnf_module_schema (bnf_reports/bnf_departments/
--            bnf_divisions harus sudah ada)
-- Status:    DRAFT — do NOT execute without explicit approval
--
-- NOTE: bnf_division_recipients TIDAK di-drop di migrasi ini (ditunda ke
-- fase yang juga merombak notifyDivisionRecipients() di BNFListPage.jsx ke
-- head_profile_id/director_profile_id — tabel ini masih dipakai aktif,
-- lihat investigasi 2026-08-04).
-- =============================================================================

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_guard_bnf_reports_update ON public.bnf_reports;
-- DROP FUNCTION IF EXISTS public.guard_bnf_reports_field_update();
-- ALTER TABLE public.bnf_divisions DROP COLUMN IF EXISTS director_profile_id;
-- ALTER TABLE public.bnf_departments DROP COLUMN IF EXISTS head_profile_id;
-- =============================================================================


-- ============================================================================
-- 1. bnf_departments.head_profile_id — kepala departemen, notifikasi dasar
--    tiap laporan baru masuk ke department ini.
-- ============================================================================
ALTER TABLE public.bnf_departments
  ADD COLUMN head_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. bnf_divisions.director_profile_id — direktur divisi, dipakai saat
--    eskalasi (escalation_level = 'direktur_divisi').
-- ============================================================================
ALTER TABLE public.bnf_divisions
  ADD COLUMN director_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Catatan: bnf_departments_update / bnf_divisions_update yang sudah ada
-- (schema_snapshot.sql) sudah admin_or_above-only untuk SELURUH baris, tanpa
-- carve-out kolom seperti bnf_reports — jadi tidak perlu trigger tambahan
-- untuk 2 kolom baru ini. RLS kedua tabel ini tidak disentuh migrasi ini.


-- ============================================================================
-- 3. bnf_reports — restriksi kolom via trigger (RLS bnf_reports_update
--    sendiri TIDAK diubah; tetap company_id-scope seperti sekarang).
--
--    3 tier, dicek berurutan:
--
--    Tier 0 — auth.uid() IS NULL (SQL Editor / migrasi / service-role):
--      bypass PENUH, termasuk field identitas di Tier 1. SQL Editor dan
--      service-role sudah bypass RLS secara default di Supabase, tapi
--      trigger BEFORE UPDATE tetap jalan terlepas dari bypass RLS itu — jadi
--      harus diizinkan eksplisit di sini, atau perbaikan manual Anda sendiri
--      lewat SQL Editor ikut ketolak. Detail keamanan mekanisme ini dibahas
--      di chat 2026-08-04 (poin 2) — intinya: hanya dicapai lewat akses
--      langsung ke Postgres (SQL Editor/psql/migrasi) atau SUPABASE_SERVICE_
--      ROLE_KEY (dipakai bare, tanpa forward JWT user) — dua-duanya sudah
--      setara "punya akses DB penuh", bukan sesuatu yang bisa dicapai user
--      app biasa lewat browser/PostgREST.
--
--    Tier 1 — id, company_id, report_no, created_by, created_at: TERKUNCI
--      TOTAL, TIDAK ADA pengecualian untuk pelapor maupun admin. Ini field
--      identitas/provenance record (bukan "isi" yang wajar direvisi) — kalau
--      benar-benar perlu dikoreksi, lakukan lewat SQL Editor (Tier 0), bukan
--      UPDATE aplikasi biasa. Direvisi dari draft awal (semula digabung ke
--      Tier 2) per klarifikasi chat 2026-08-04 poin 1 — tidak ada UI apa pun
--      di app ini yang butuh admin mengubah field-field ini, jadi tidak ada
--      downside menguncinya total.
--
--    Tier 2 — pelapor asli (created_by = auth.uid()) ATAU is_admin_or_above():
--      bebas mengubah sisa field isi laporan (division_id, department_id,
--      related_department_id, description, root_cause, solution,
--      target_date, escalation_level, deleted_at — 9 field di keputusan #5).
--
--    Tier 3 — semua orang lain di 1 company (RLS row-scope sudah izinkan
--      UPDATE baris ini): HANYA boleh ubah status, updated_by, closed_at —
--      persis field yang dikirim handleStatusChange() di BNFListPage.jsx,
--      tidak berubah dari perilaku sekarang.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_bnf_reports_field_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Tier 0
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Tier 1 — terkunci total, dicek SEBELUM pengecualian pelapor/admin di
  -- bawah supaya admin pun tidak bisa mengubah field identitas ini.
  IF NEW.id          IS DISTINCT FROM OLD.id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.report_no  IS DISTINCT FROM OLD.report_no
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Field id/company_id/report_no/created_by/created_at bersifat permanen — tidak bisa diubah lewat UPDATE aplikasi. Perbaikan data harus lewat SQL Editor.';
  END IF;

  -- Tier 2
  IF OLD.created_by = auth.uid() OR public.is_admin_or_above() THEN
    RETURN NEW;
  END IF;

  -- Tier 3
  IF NEW.division_id            IS DISTINCT FROM OLD.division_id
     OR NEW.department_id         IS DISTINCT FROM OLD.department_id
     OR NEW.related_department_id IS DISTINCT FROM OLD.related_department_id
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

COMMENT ON FUNCTION public.guard_bnf_reports_field_update() IS 'BEFORE UPDATE guard on bnf_reports, 4 tiers: (0) auth.uid() IS NULL (SQL Editor/migrations/service-role) bypasses everything; (1) id/company_id/report_no/created_by/created_at always locked, no exceptions; (2) created_by = auth.uid() or is_admin_or_above() may edit remaining report-content columns; (3) everyone else in the company (existing bnf_reports_update RLS row-scope, unchanged) may only edit status/updated_by/closed_at.';

CREATE TRIGGER trg_guard_bnf_reports_update
  BEFORE UPDATE ON public.bnf_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_bnf_reports_field_update();
