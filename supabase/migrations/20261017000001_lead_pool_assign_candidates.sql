-- Migration: 20261017000001_lead_pool_assign_candidates
-- TD-318 Irisan 4 (tes Den + review Vir), item G.
-- Status: BELUM DIJALANKAN -- rilis November 2026, SESUDAH 20261016000004.
-- ReassignModal.jsx (cabang allUnassigned) bergantung pada fungsi ini --
-- WAJIB jalan SEBELUM atau BERSAMAAN dengan kode Irisan 4 naik ke main.
--
-- Alasan: RLS user_roles_read hanya mengizinkan baris sendiri, atau
-- company_id = get_user_company_id() AND is_manager_or_above(), atau super
-- admin. Approver Lead Pool lintas entitas (contoh staging: peran ceo di
-- SOA punya crm_lead_pool_approval) akan mendapat daftar kandidat kosong
-- saat ReassignModal query user_roles+profiles langsung. SECURITY DEFINER
-- di bawah menembus RLS itu, digerbang SYARAT PERSIS SAMA dengan
-- lead_pool_assign sendiri (has_menu_permission_in crm_lead_pool_approval).

BEGIN;

CREATE OR REPLACE FUNCTION public.lead_pool_assign_candidates(p_company_id uuid)
RETURNS TABLE (id uuid, full_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_menu_permission_in(p_company_id, 'crm_lead_pool_approval', 'view') THEN
    RAISE EXCEPTION 'Tidak punya izin menetapkan pemilik Lead Pool di entitas ini';
  END IF;
  RETURN QUERY
  SELECT DISTINCT p.id, p.full_name::text
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.company_id = p_company_id
    AND ur.is_active = true
    AND ur.valid_until IS NULL
    AND p.active = true
    AND p.id <> auth.uid()
  ORDER BY p.full_name::text;
END $$;

COMMENT ON FUNCTION public.lead_pool_assign_candidates(uuid) IS 'Daftar kandidat pemilik untuk lead_pool_assign: profil aktif dengan peran aktif di entitas akun, tanpa diri sendiri. Syarat persis sama dengan guard lead_pool_assign, gerbang crm_lead_pool_approval di entitas itu. SECURITY DEFINER supaya approver lintas entitas tidak terhalang RLS user_roles_read. TD-318 Irisan 4.';

REVOKE ALL ON FUNCTION public.lead_pool_assign_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_assign_candidates(uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
