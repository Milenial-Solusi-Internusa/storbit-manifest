-- =============================================================================
-- Migration: 20261024000006_crm_inquiry_owner_assignment_menu
-- Inquiry Management Putaran 3 -- Tahap 3B, Lingkup C
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging.
-- Dependensi: baris `module_menus`/`menu_actions`/`role_menu_permissions`
-- milik key `crm_inquiry` HARUS SUDAH ADA (sudah ada sejak jauh sebelumnya).
-- Pola PERSIS 20261024000003_crm_inquiry_classification_menu (Tahap 3A) --
-- lihat header migrasi itu untuk penjelasan lengkap tiap pilihan (ON
-- CONFLICT vs WHERE NOT EXISTS, konsekuensi label disalin verbatim, dst),
-- tidak diulang di sini.
--
-- RINGKASAN
-- Mendaftarkan menu BARU `crm_inquiry_owner_assignment` (halaman Inquiry
-- Owner Assignment, 1.2.3) dengan menyalin module_id + sort_order + label
-- dari baris `crm_inquiry`, menyalin SET action yang sama, dan menyalin
-- SEMUA pasangan (role, action) milik `crm_inquiry` SAAT INI di database
-- tempat migrasi dijalankan -- DINAMIS, bukan array role manual (alasan
-- sama persis 20261024000003: daftar role bisa berbeda staging vs
-- production). Bukan DROP FUNCTION -- murni DML.
-- =============================================================================

BEGIN;

INSERT INTO public.module_menus (module_id, key, label, sort_order, is_active)
SELECT mm.module_id, 'crm_inquiry_owner_assignment', mm.label, mm.sort_order, true
  FROM public.module_menus mm
 WHERE mm.key = 'crm_inquiry'
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.menu_actions (menu_id, action, is_active)
SELECT new_menu.id, old_ma.action, old_ma.is_active
  FROM public.menu_actions old_ma
  JOIN public.module_menus old_menu ON old_menu.id = old_ma.menu_id AND old_menu.key = 'crm_inquiry'
  JOIN public.module_menus new_menu ON new_menu.key = 'crm_inquiry_owner_assignment'
ON CONFLICT (menu_id, action) DO NOTHING;

INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT old_rmp.role_id, new_ma.id
  FROM public.role_menu_permissions old_rmp
  JOIN public.menu_actions old_ma   ON old_ma.id = old_rmp.menu_action_id
  JOIN public.module_menus old_menu ON old_menu.id = old_ma.menu_id AND old_menu.key = 'crm_inquiry'
  JOIN public.menu_actions new_ma   ON new_ma.action = old_ma.action
  JOIN public.module_menus new_menu ON new_menu.id = new_ma.menu_id AND new_menu.key = 'crm_inquiry_owner_assignment'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_menu_permissions x
    WHERE x.role_id = old_rmp.role_id AND x.menu_action_id = new_ma.id
 );

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT key, label, sort_order FROM public.module_menus WHERE key = 'crm_inquiry_owner_assignment';
-- SELECT action FROM public.menu_actions ma JOIN public.module_menus mm ON mm.id=ma.menu_id WHERE mm.key='crm_inquiry_owner_assignment';
--
-- Set (role, action) baru HARUS SAMA PERSIS dengan crm_inquiry (uji (j)
-- skrip verify-inquiry-putaran-3b.sql menegaskan ini juga):
-- SELECT r.code, ma.action
--   FROM public.role_menu_permissions rmp
--   JOIN public.menu_actions ma ON ma.id = rmp.menu_action_id
--   JOIN public.module_menus mm ON mm.id = ma.menu_id
--   JOIN public.roles r ON r.id = rmp.role_id
--  WHERE mm.key = 'crm_inquiry_owner_assignment'
-- EXCEPT
-- SELECT r.code, ma.action
--   FROM public.role_menu_permissions rmp
--   JOIN public.menu_actions ma ON ma.id = rmp.menu_action_id
--   JOIN public.module_menus mm ON mm.id = ma.menu_id
--   JOIN public.roles r ON r.id = rmp.role_id
--  WHERE mm.key = 'crm_inquiry';
-- -- HARUS NOL BARIS, dan query terbalik (crm_inquiry EXCEPT crm_inquiry_owner_assignment) JUGA HARUS NOL BARIS.
--
-- Rollback (sebelum ada user yang terdampak perubahan izin):
--   DELETE FROM public.role_menu_permissions rmp USING public.menu_actions ma, public.module_menus mm
--     WHERE rmp.menu_action_id = ma.id AND ma.menu_id = mm.id AND mm.key = 'crm_inquiry_owner_assignment';
--   DELETE FROM public.menu_actions ma USING public.module_menus mm WHERE ma.menu_id = mm.id AND mm.key = 'crm_inquiry_owner_assignment';
--   DELETE FROM public.module_menus WHERE key = 'crm_inquiry_owner_assignment';
-- =============================================================================
