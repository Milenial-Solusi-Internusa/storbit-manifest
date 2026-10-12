-- =============================================================================
-- 20261012000004_crm_lead_pool_approval_roles.sql
--
-- Batch DS 3 Lead Management, irisan 7 Bagian 2 (Paket 2) -- file 4/4
-- (izin role_menu_permissions, IDEMPOTEN). Nol dependensi pada file 1-3 --
-- murni data role_menu_permissions/roles, bisa berjalan sendiri.
--
-- Status: JALAN DI STAGING 12 Okt 2026. BELUM DI PRODUCTION.
--         Sebelum migrasi ini jalan, staging sudah punya SEBAGIAN
--         (info Den 12 Okt 2026, dikerjakan manual, TIDAK diulang di sini
--         sebagai migrasi terpisah -- file ini menulis ULANG hasil akhir
--         yang SAMA secara idempoten supaya production ikut saat Paket 2
--         rilis, dan supaya menjalankannya lagi di staging AMAN/no-op):
--           1. Staging: izin view crm_lead_pool_approval ditambahkan
--              untuk bd_sales_spv_console, bd_sales_spv_forwarding,
--              bd_digital_marketing_spv; level bd_digital_marketing_spv
--              di staging disamakan dengan production jadi 6.
--           2. Production DAN staging: izin view crm_lead_pool ditambahkan
--              untuk bd_digital_marketing_spv (TIDAK disentuh file ini --
--              sudah LIVE KEDUA environment, nol yang perlu dikerjakan;
--              lihat §3 di bawah).
--
-- -- §1: TAMBAH 3 peran supervisor ke crm_lead_pool_approval -------------
-- bd_sales_spv_console, bd_sales_spv_forwarding, bd_digital_marketing_spv.
-- Pola INSERT...ON CONFLICT DO NOTHING persis 20260911000003 (role_id,
-- menu_action_id, predikat parsial menu_action_id IS NOT NULL) -- aman
-- dijalankan ulang di staging (baris sudah ada -> no-op) maupun pertama
-- kali di production (baris belum ada -> terpasang).
--
-- -- §2: CABUT peran 'manager' (umum) dari crm_lead_pool_approval --------
-- Sesuai mockup aturan 2 ("supervisor sales ke atas", BUKAN "manager
-- generik ke atas") -- keputusan Den irisan ini. Peran yang TETAP:
-- ceo, gm_bd, gm, admin, dan ketiga peran supervisor di atas. DELETE
-- biasa (idempoten secara alami -- baris tak ada = nol baris terhapus,
-- nol error). 'supervisor' (role_code yang pernah muncul di seed lama,
-- TD-106 -- tak eksis di tabel roles) TIDAK perlu dicabut di sini --
-- baris role_menu_permissions untuknya memang tak pernah ada (JOIN roles
-- r ON r.code=... pada 20260911000003 otomatis nol baris untuk kode yang
-- tak ada), tidak ada yang perlu dihapus.
--
-- -- §3: crm_lead_pool (BUKAN _approval) untuk bd_digital_marketing_spv --
-- SUDAH LIVE di KEDUA environment per info Den -- file ini SENGAJA TIDAK
-- menyentuhnya (menulis ulang sesuatu yang sudah identik di kedua sisi
-- cuma menambah baris yang tak melakukan apa pun untuk dibaca ulang nanti).
--
-- -- §4: level bd_digital_marketing_spv = 6, idempoten --------------------
-- Role ini LAHIR dengan level=7 (20260912000005_bd_roles_menu_defaults.sql)
-- -- staging sudah disamakan ke 6 oleh Den (manual, 12 Okt 2026) SUPAYA
-- COCOK DENGAN PRODUCTION, yang menyiratkan production SUDAH 6 lewat
-- perubahan manual lain yang tak tercatat di migrasi manapun (diperiksa:
-- nol file menyentuh roles.level untuk kode ini sesudah 20260912000005).
-- UPDATE...WHERE level <> 6 di sini CUKUP untuk membawa environment mana
-- pun (yang masih 7 ATAU sudah 6) ke keadaan yang sama -- idempoten tanpa
-- perlu tahu keadaan awalnya.
-- =============================================================================

BEGIN;

-- §1 -- tambah 3 peran supervisor.
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM public.module_menus mm
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
JOIN public.roles r ON r.code IN ('bd_sales_spv_console', 'bd_sales_spv_forwarding', 'bd_digital_marketing_spv')
                    AND r.deleted_at IS NULL AND r.is_active = true
WHERE mm.key = 'crm_lead_pool_approval'
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

-- §2 -- cabut peran 'manager' (umum).
DELETE FROM public.role_menu_permissions rmp
USING public.roles r, public.menu_actions ma, public.module_menus mm
WHERE rmp.role_id = r.id
  AND rmp.menu_action_id = ma.id
  AND ma.menu_id = mm.id
  AND mm.key = 'crm_lead_pool_approval'
  AND ma.action = 'view'
  AND r.code = 'manager';

-- §4 -- level bd_digital_marketing_spv = 6, idempoten.
UPDATE public.roles
   SET level = 6
 WHERE code = 'bd_digital_marketing_spv'
   AND level <> 6;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT r.code, r.level
--   FROM public.role_menu_permissions rmp
--   JOIN public.roles r ON r.id = rmp.role_id
--   JOIN public.menu_actions ma ON ma.id = rmp.menu_action_id
--   JOIN public.module_menus mm ON mm.id = ma.menu_id
--  WHERE mm.key = 'crm_lead_pool_approval' AND ma.action = 'view'
--  ORDER BY r.code;
-- -- Harap PERSIS 7 baris, tanpa 'manager' dan tanpa 'supervisor' (kode
-- --    yang tak eksis di tabel roles, TD-106):
-- --   admin, bd_digital_marketing_spv, bd_sales_spv_console,
-- --   bd_sales_spv_forwarding, ceo, gm, gm_bd
-- -- (super_admin SENGAJA tidak baris sendiri -- bypass lewat is_super_admin()
-- --  di dalam has_menu_permission_in, pola yang sama dengan seed 20260911000003)
--
-- SELECT code, level FROM public.roles WHERE code = 'bd_digital_marketing_spv';
-- -- Harap: level = 6.
--
-- -- Sanity 'manager' benar-benar tercabut:
-- SELECT count(*) FROM public.role_menu_permissions rmp
--   JOIN public.roles r ON r.id = rmp.role_id
--   JOIN public.menu_actions ma ON ma.id = rmp.menu_action_id
--   JOIN public.module_menus mm ON mm.id = ma.menu_id
--  WHERE mm.key = 'crm_lead_pool_approval' AND ma.action = 'view' AND r.code = 'manager';
-- -- Harap: 0.
-- =============================================================================

-- =============================================================================
-- ROLLBACK:
--   INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
--   SELECT r.id, ma.id FROM public.module_menus mm
--   JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
--   JOIN public.roles r ON r.code = 'manager' AND r.deleted_at IS NULL AND r.is_active = true
--   WHERE mm.key = 'crm_lead_pool_approval'
--   ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;
--
--   DELETE FROM public.role_menu_permissions rmp
--   USING public.roles r, public.menu_actions ma, public.module_menus mm
--   WHERE rmp.role_id = r.id AND rmp.menu_action_id = ma.id AND ma.menu_id = mm.id
--     AND mm.key = 'crm_lead_pool_approval' AND ma.action = 'view'
--     AND r.code IN ('bd_sales_spv_console','bd_sales_spv_forwarding','bd_digital_marketing_spv');
--
--   -- level bd_digital_marketing_spv: TIDAK DIROLLBACK ke 7 -- staging dan
--   -- (diduga) production SUDAH 6 sebelum file ini berjalan; mengembalikan
--   -- ke 7 akan MERUSAK keadaan yang sudah benar. Kalau rollback penuh
--   -- sungguh diperlukan, konfirmasi dulu level SEBELUM file ini jalan di
--   -- environment itu (lihat §4 catatan di atas).
-- =============================================================================
