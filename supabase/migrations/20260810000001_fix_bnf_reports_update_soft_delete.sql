-- Fix: bnf_reports_update RLS policy tidak ikut cek deleted_at IS NULL,
-- beda dari bnf_reports_select. Efeknya baris yang sudah soft-deleted
-- masih bisa kena UPDATE oleh user company yang sama. Belum kepikiran
-- pas policy awal dibuat, ditemukan lewat audit BNF 10 Agu 2026.

BEGIN;

DROP POLICY bnf_reports_update ON bnf_reports;

CREATE POLICY bnf_reports_update ON bnf_reports
FOR UPDATE
USING (
  (company_id = get_user_company_id() AND deleted_at IS NULL)
  OR is_super_admin()
)
WITH CHECK (
  (company_id = get_user_company_id() AND deleted_at IS NULL)
  OR is_super_admin()
);

COMMIT;
