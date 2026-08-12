-- Perluas is_bnf_authorized(): role manager ke atas (ceo, gm, gm_bd,
-- manager, finance_controller) sekarang otomatis lolos gate BNF, tidak
-- perlu diassign manual sebagai head_profile_id/director_profile_id atau
-- lewat bnf_authorized_users. Keputusan: semua orang sudah dikasih SOP
-- pakai BNF mulai besok, gate berbasis assignment struktural satu-satu
-- terlalu sempit untuk itu. Role hrga/it/operations/procurement/sales/
-- finance SENGAJA tidak dimasukkan -- itu tag departemen/fungsi, bukan
-- level jabatan, berpotensi nempel ke staff junior juga.

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
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
        AND r.code IN ('ceo', 'gm', 'gm_bd', 'manager', 'finance_controller')
    )
    OR EXISTS (
      SELECT 1 FROM bnf_authorized_users a
      WHERE a.profile_id = auth.uid()
        AND a.company_id = get_user_company_id()
        AND a.revoked_at IS NULL
    );
$fn$;

COMMIT;
