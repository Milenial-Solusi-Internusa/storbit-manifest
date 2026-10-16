-- =============================================================================
-- 20261016000002_bd_digital_marketing_manager_role.sql
--
-- Peran baru "Digital Marketing Manager" (level 4) untuk Faris -- manager
-- umum (level 4) membawa akses lintas divisi yang tidak relevan dan tidak
-- punya menu CRM yang dipakai Faris. bd_digital_marketing_spv (level 6,
-- "Digital Marketing Supervisor") TETAP ADA di tabel roles -- tidak dihapus.
--
-- Level 4 TIDAK menambah wewenang RLS dibanding level 6 yang Faris pegang
-- hari ini -- is_manager_or_above()/isManagerOrAbove() keduanya level <=
-- MANAGER_LEVEL_MAX (6), jadi 4 dan 6 lolos sama-sama; satu-satunya yang
-- berubah adalah baris izin menu yang disalin eksplisit di bawah.
--
-- §1 peran baru (company_id NULL, pola manager/proc_manager).
-- §2 salin role_menu_permissions dari bd_digital_marketing_spv (lewat
--    query, bukan daftar ketik tangan). ON CONFLICT DO NOTHING TANPA
--    target kolom -- baris campur menu_action_id/module_action_id, dua
--    partial unique index berbeda; bentuk tanpa target memeriksa semua
--    constraint unique sekaligus.
-- §3 salin role_permissions (legacy TD-204, nol pembaca FE -- disalin
--    tetap karena diminta eksplisit).
-- §4 tambah crm_lead_pool_approval/view EKSPLISIT, terpisah dari §2 --
--    key ini SUDAH ADA di module_menus production (dicek Vir 16 Okt 2026),
--    tapi §2 saja tidak menjaminnya kalau baris grant bd_digital_marketing_spv
--    untuk key ini kebetulan belum ada di environment tempat migrasi ini
--    jalan. Guard dipertahankan apa adanya (RAISE NOTICE kalau key tidak
--    ditemukan) sebagai jaga-jaga murah, bukan karena keynya diragukan ada.
-- §5 resolve Faris via email, tambah peran baru + cabut
--    bd_digital_marketing_spv di MSI (pola pencabutan 12 Sep 2026 --
--    useUserAccess.js:385, is_active=false + revoked_at, BUKAN hard
--    delete) + job_title. Profil tak ditemukan (mis. staging) -> RAISE
--    NOTICE, lewati tanpa error.
--
-- Constraint diverifikasi Vir langsung ke DB (16 Okt 2026): roles
-- UNIQUE(code), role_permissions UNIQUE(role_id, permission_id),
-- user_roles UNIQUE(user_id, role_id, company_id), FK role_id ON DELETE
-- CASCADE di user_roles/role_permissions/role_menu_permissions -- SQL dan
-- rollback di bawah sudah dicocokkan ke constraint nyata ini.
--
-- Status: SIAP DIJALANKAN Vir via connector -- STAGING dulu, lalu
--         PRODUCTION dengan SQL identik. Belum dijalankan di mana pun
--         pada saat commit ini. TANPA hotfix branch -- kode FE tidak
--         wajib berubah untuk peran baru ini bekerja benar (fetch role
--         AuthContext.jsx generik, isManagerOrAbove/hasMenuPermission
--         level-based atau data-driven, nol allow-list kode role yang
--         bisa menolak kode baru). Baris ERP_ROLE_PRIORITY (kosmetik,
--         bukan prasyarat keamanan) ikut develop di commit yang sama
--         dengan file ini.
-- =============================================================================

BEGIN;

-- §1 -- buat peran baru.
INSERT INTO public.roles (company_id, code, name, description, is_system_role, is_active, level)
VALUES (
  NULL,
  'bd_digital_marketing_manager',
  'Digital Marketing Manager',
  'BD -- Digital Marketing Manager. Level 4, akses = salinan persis izin bd_digital_marketing_spv '
  '(level 6) ditambah crm_lead_pool_approval. Dibuat karena peran manager umum (level 4) membawa '
  'akses lintas divisi yang tidak relevan dan tidak punya menu CRM yang dipakai pemegang peran ini. '
  'TIDAK termasuk BD_SALES_ROLES/is_sales_functional/PRF creator/SALES_ONLY_ROLES -- sama seperti '
  'bd_digital_marketing_spv. Migrasi 20261016000002.',
  false, true, 4
)
ON CONFLICT (code) DO NOTHING;

-- §2 -- salin role_menu_permissions dari bd_digital_marketing_spv.
INSERT INTO public.role_menu_permissions (role_id, menu_action_id, module_action_id)
SELECT new_r.id, rmp.menu_action_id, rmp.module_action_id
FROM public.role_menu_permissions rmp
JOIN public.roles old_r ON old_r.id = rmp.role_id
JOIN public.roles new_r ON new_r.code = 'bd_digital_marketing_manager'
WHERE old_r.code = 'bd_digital_marketing_spv'
  AND old_r.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- §3 -- salin role_permissions (legacy, TD-204) dari bd_digital_marketing_spv.
INSERT INTO public.role_permissions (role_id, permission_id, is_cross_entity)
SELECT new_r.id, rp.permission_id, rp.is_cross_entity
FROM public.role_permissions rp
JOIN public.roles old_r ON old_r.id = rp.role_id
JOIN public.roles new_r ON new_r.code = 'bd_digital_marketing_manager'
WHERE old_r.code = 'bd_digital_marketing_spv'
  AND old_r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- §4 -- tambah crm_lead_pool_approval/view secara eksplisit, guarded.
-- Key ini SUDAH ADA di module_menus production (dicek Vir 16 Okt 2026) --
-- guard di bawah murni jaga-jaga murah, bukan ekspektasi bahwa key-nya tak
-- ada.
DO $$
DECLARE
  v_menu_action_id uuid;
BEGIN
  SELECT ma.id INTO v_menu_action_id
  FROM public.menu_actions ma
  JOIN public.module_menus mm ON mm.id = ma.menu_id
  WHERE mm.key = 'crm_lead_pool_approval' AND ma.action = 'view';

  IF v_menu_action_id IS NULL THEN
    RAISE NOTICE 'crm_lead_pool_approval/view tidak ditemukan di module_menus/menu_actions environment ini -- dilewati.';
  ELSE
    INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
    SELECT r.id, v_menu_action_id
    FROM public.roles r
    WHERE r.code = 'bd_digital_marketing_manager'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- §5 -- pindahkan Faris di MSI, guarded (profil mungkin tak ada di staging).
DO $$
DECLARE
  v_profile_id uuid;
  v_msi_id uuid;
  v_old_role_id uuid;
  v_new_role_id uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE email = 'faris.el@exportimportdept.com';
  IF v_profile_id IS NULL THEN
    RAISE NOTICE 'Profil faris.el@exportimportdept.com tidak ditemukan di environment ini -- dilewati.';
    RETURN;
  END IF;

  SELECT id INTO v_msi_id FROM public.companies WHERE code = 'MSI';
  SELECT id INTO v_old_role_id FROM public.roles WHERE code = 'bd_digital_marketing_spv' AND deleted_at IS NULL;
  SELECT id INTO v_new_role_id FROM public.roles WHERE code = 'bd_digital_marketing_manager' AND deleted_at IS NULL;

  -- Tambah peran baru (pola useUserAccess.js -- reaktivasi kalau baris
  -- sudah ada tapi nonaktif, INSERT kalau belum pernah ada sama sekali).
  UPDATE public.user_roles
     SET is_active = true, valid_until = NULL, revoked_at = NULL, revoked_by = NULL
   WHERE user_id = v_profile_id AND role_id = v_new_role_id AND company_id = v_msi_id;
  IF NOT FOUND THEN
    INSERT INTO public.user_roles (user_id, role_id, company_id, is_active)
    VALUES (v_profile_id, v_new_role_id, v_msi_id, true);
  END IF;

  -- Cabut bd_digital_marketing_spv (pola pencabutan 12 Sep 2026 --
  -- useUserAccess.js:385 -- soft, is_active=false + jejak revoked_at;
  -- revoked_by NULL karena auth.uid() NULL di konteks migrasi/connector).
  UPDATE public.user_roles
     SET is_active = false, revoked_at = now(), revoked_by = NULL
   WHERE user_id = v_profile_id AND role_id = v_old_role_id AND company_id = v_msi_id
     AND is_active = true;

  -- job_title.
  UPDATE public.profiles SET job_title = 'Digital Marketing Manager' WHERE id = v_profile_id;
END $$;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT count(*) FROM public.role_menu_permissions WHERE role_id =
--   (SELECT id FROM public.roles WHERE code = 'bd_digital_marketing_manager');
-- -- Harap = jumlah baris bd_digital_marketing_spv + 1 (crm_lead_pool_approval
-- --    -- key ini sudah ada di production per 16 Okt 2026, jadi +1 selalu
-- --    berlaku kecuali SPV sendiri ternyata belum punya baris itu).
--
-- SELECT count(*) FROM public.user_roles WHERE user_id =
--   (SELECT id FROM public.profiles WHERE email = 'faris.el@exportimportdept.com')
--   AND company_id = (SELECT id FROM public.companies WHERE code = 'MSI')
--   AND is_active = true;
-- -- Harap = 1.
--
-- Rollback:
-- DELETE FROM public.roles WHERE code = 'bd_digital_marketing_manager';
-- -- FK role_id ON DELETE CASCADE di user_roles/role_permissions/
-- -- role_menu_permissions mencabut baris turunannya otomatis. Reaktivasi
-- -- manual baris bd_digital_marketing_spv Faris sesudahnya kalau perlu:
-- -- UPDATE public.user_roles SET is_active = true, revoked_at = NULL
-- --   WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'faris.el@exportimportdept.com')
-- --     AND role_id = (SELECT id FROM public.roles WHERE code = 'bd_digital_marketing_spv')
-- --     AND company_id = (SELECT id FROM public.companies WHERE code = 'MSI');
-- =============================================================================
