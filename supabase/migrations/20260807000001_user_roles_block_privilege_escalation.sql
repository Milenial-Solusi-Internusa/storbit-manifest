-- ============================================================================
-- Fix CRITICAL: user_roles privilege escalation via admin biasa
-- ============================================================================
-- Tanggal eksekusi manual: 2026-08-07.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase
--    SQL Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli
--    agar tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: Audit RLS/RBAC (sesi 2026-08-07) menemukan CRITICAL — RLS
--   user_roles_insert/update hanya mensyaratkan company_id cocok + caller
--   is_admin_or_above() (role 'admin' ATAU 'super_admin'), TANPA PERNAH
--   memvalidasi role_id TUJUAN yang ditulis. Akibatnya: user dengan role
--   'admin' biasa (satu tingkat di bawah super_admin) bisa meng-INSERT/
--   UPDATE baris user_roles yang menetapkan role_id = super_admin untuk
--   dirinya sendiri atau siapa pun di company yang sama — privilege
--   escalation penuh, murni lewat RLS policy yang longgar, tanpa perlu bug
--   frontend sama sekali. Gate FE terpisah (UserEditPage.jsx, tombol Save
--   Changes + dropdown ERP Role) sudah dieksekusi sebelumnya di sesi yang
--   sama — tidak direkam di sini karena bukan perubahan DB.
--
-- FIX: helper function baru is_admin_tier_role(uuid) — SECURITY DEFINER
--   agar pengecekan role code TARGET independen dari RLS tabel roles milik
--   pemanggil (menghindari celah tepi: role_id lintas-company yang tak
--   terlihat admin biasa lewat RLS roles akan salah dianggap "bukan
--   admin-tier" kalau dicek inline tanpa SECURITY DEFINER). Lalu 2 ALTER
--   POLICY: admin biasa tetap bisa assign/ubah role APA PUN KECUALI
--   super_admin/admin — hanya super_admin yang boleh menulis baris
--   user_roles bertarget super_admin/admin. Predikat sama dipasang di
--   USING (bukan hanya WITH CHECK) untuk user_roles_update, sehingga admin
--   biasa juga tak bisa menyentuh (termasuk menonaktifkan/demote) baris
--   yang SUDAH bertarget super_admin/admin milik orang lain.
--
-- ISI:
--   Statement 1 — CREATE OR REPLACE is_admin_tier_role(uuid). Dollar-quote
--                 bernama $fn$.
--   Statement 2 — COMMENT ON FUNCTION is_admin_tier_role.
--   Statement 3 — ALTER POLICY user_roles_insert (tambah predikat target-role).
--   Statement 4 — ALTER POLICY user_roles_update (predikat sama di USING +
--                 WITH CHECK).
-- ============================================================================


-- STATEMENT 1: helper function is_admin_tier_role
CREATE OR REPLACE FUNCTION public.is_admin_tier_role(p_role_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = p_role_id
      AND r.code IN ('super_admin', 'admin')
  )
$fn$;

-- STATEMENT 2: comment
COMMENT ON FUNCTION public.is_admin_tier_role(uuid) IS
  'True if the given role_id resolves to super_admin or admin. SECURITY DEFINER so the check is independent of caller''s RLS visibility into roles. Used to gate user_roles writes — see user_roles_insert/update.';

-- STATEMENT 3: user_roles_insert — blokir admin biasa nulis role_id admin-tier
ALTER POLICY user_roles_insert ON public.user_roles
  WITH CHECK (
    (company_id = public.get_user_company_id())
    AND public.is_admin_or_above()
    AND (public.is_super_admin() OR NOT public.is_admin_tier_role(role_id))
  );

-- STATEMENT 4: user_roles_update — predikat sama di USING + WITH CHECK
ALTER POLICY user_roles_update ON public.user_roles
  USING (
    (company_id = public.get_user_company_id())
    AND public.is_admin_or_above()
    AND (public.is_super_admin() OR NOT public.is_admin_tier_role(role_id))
  )
  WITH CHECK (
    (company_id = public.get_user_company_id())
    AND public.is_admin_or_above()
    AND (public.is_super_admin() OR NOT public.is_admin_tier_role(role_id))
  );
