-- =============================================================================
-- Migration: 20261024000003_crm_inquiry_classification_menu
-- Inquiry Management Putaran 3 -- Tahap 3A, Lingkup B (Inquiry Classification)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual (connector) di staging.
-- Dependensi: baris `module_menus`/`menu_actions`/`role_menu_permissions`
-- milik key `crm_inquiry` HARUS SUDAH ADA di database tempat migrasi ini
-- dijalankan (sudah ada sejak jauh sebelumnya -- halaman List/Detail Inquiry
-- yang sudah live). Boleh jalan kapan pun setelah itu.
--
-- RINGKASAN
-- Mendaftarkan menu BARU `crm_inquiry_classification` (halaman Inquiry
-- Classification, 1.2.2) dengan MENYALIN module_id + sort_order + label dari
-- baris `crm_inquiry` yang SUDAH ADA, menyalin SET action yang sama (menu_actions),
-- dan menyalin SEMUA pasangan (role, action) yang dimiliki `crm_inquiry` di
-- role_menu_permissions -- DINAMIS dari isi tabel saat migrasi ini dijalankan,
-- BUKAN array role yang ditulis manual di sini. Alasan (instruksi eksplisit):
-- daftar role yang memegang `crm_inquiry` BISA BERBEDA antara staging dan
-- production (akun uji, pilot role, dll) -- menulis array manual akan diam-diam
-- menyimpang dari salah satu environment.
--
-- Konsekuensi yang disengaja: label `module_menus` untuk baris baru ini akan
-- SAMA PERSIS dengan label `crm_inquiry` saat ini (disalin verbatim, bukan
-- ditulis ulang "Inquiry Classification") -- field ini HANYA dipakai di
-- matriks admin (RoleDefaultsPage/UserEditPage), BUKAN label sidebar yang
-- dilihat user (itu sudah benar "Inquiry Classification" di
-- menu-skeleton.js, independen dari kolom ini). Kalau Vir/Den ingin label
-- matriks admin berbeda dari "Inquiry" (atau apa pun isi crm_inquiry.label
-- saat ini), itu langkah UPDATE terpisah sesudah migrasi ini -- lihat
-- Pertanyaan Terbuka di laporan.
--
-- Idempoten: INSERT 1 & 2 pakai ON CONFLICT DO NOTHING (kolom UNIQUE asli:
-- module_menus.key, menu_actions(menu_id, action) -- keduanya UNIQUE
-- CONSTRAINT biasa, bukan partial, aman utk ON CONFLICT). INSERT 3 pakai
-- WHERE NOT EXISTS (bukan ON CONFLICT) karena satu-satunya UNIQUE index di
-- role_menu_permissions(role_id, menu_action_id) adalah PARTIAL (WHERE
-- menu_action_id IS NOT NULL) -- ON CONFLICT (role_id, menu_action_id) TANPA
-- predikat WHERE yang sama tidak akan dikenali Postgres sebagai target
-- inference untuk index partial; WHERE NOT EXISTS menghindari ambiguitas itu
-- sama sekali.
--
-- Bukan DROP FUNCTION -- murni DML (INSERT ... SELECT).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. module_menus -- salin module_id, sort_order, label dari baris crm_inquiry.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.module_menus (module_id, key, label, sort_order, is_active)
SELECT mm.module_id, 'crm_inquiry_classification', mm.label, mm.sort_order, true
  FROM public.module_menus mm
 WHERE mm.key = 'crm_inquiry'
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. menu_actions -- salin SET action yang sama jenisnya dgn crm_inquiry
--    (apa pun isinya di database ini -- tidak diasumsikan hanya 'view').
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.menu_actions (menu_id, action, is_active)
SELECT new_menu.id, old_ma.action, old_ma.is_active
  FROM public.menu_actions old_ma
  JOIN public.module_menus old_menu ON old_menu.id = old_ma.menu_id AND old_menu.key = 'crm_inquiry'
  JOIN public.module_menus new_menu ON new_menu.key = 'crm_inquiry_classification'
ON CONFLICT (menu_id, action) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. role_menu_permissions -- salin SEMUA pasangan (role, action) yang
--    dimiliki crm_inquiry SAAT INI di database ini -- dinamis, bukan daftar
--    role manual. WHERE NOT EXISTS (bukan ON CONFLICT, lihat catatan header).
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT old_rmp.role_id, new_ma.id
  FROM public.role_menu_permissions old_rmp
  JOIN public.menu_actions old_ma   ON old_ma.id = old_rmp.menu_action_id
  JOIN public.module_menus old_menu ON old_menu.id = old_ma.menu_id AND old_menu.key = 'crm_inquiry'
  JOIN public.menu_actions new_ma   ON new_ma.action = old_ma.action
  JOIN public.module_menus new_menu ON new_menu.id = new_ma.menu_id AND new_menu.key = 'crm_inquiry_classification'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_menu_permissions x
    WHERE x.role_id = old_rmp.role_id AND x.menu_action_id = new_ma.id
 );

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- -- Baris menu + action baru terdaftar:
-- SELECT key, label, sort_order FROM public.module_menus WHERE key = 'crm_inquiry_classification';
-- SELECT action FROM public.menu_actions ma JOIN public.module_menus mm ON mm.id=ma.menu_id WHERE mm.key='crm_inquiry_classification';
--
-- -- Set (role, action) baru HARUS SAMA PERSIS dengan crm_inquiry (uji 3d
-- -- skrip verify-inquiry-putaran-3a.sql menegaskan ini juga):
-- SELECT r.code, ma.action
--   FROM public.role_menu_permissions rmp
--   JOIN public.menu_actions ma ON ma.id = rmp.menu_action_id
--   JOIN public.module_menus mm ON mm.id = ma.menu_id
--   JOIN public.roles r ON r.id = rmp.role_id
--  WHERE mm.key = 'crm_inquiry_classification'
-- EXCEPT
-- SELECT r.code, ma.action
--   FROM public.role_menu_permissions rmp
--   JOIN public.menu_actions ma ON ma.id = rmp.menu_action_id
--   JOIN public.module_menus mm ON mm.id = ma.menu_id
--   JOIN public.roles r ON r.id = rmp.role_id
--  WHERE mm.key = 'crm_inquiry';
-- -- HARUS NOL BARIS, dan query terbalik (crm_inquiry EXCEPT crm_inquiry_classification) JUGA HARUS NOL BARIS.
--
-- Rollback (sebelum ada user yang terdampak perubahan izin):
--   DELETE FROM public.role_menu_permissions rmp USING public.menu_actions ma, public.module_menus mm
--     WHERE rmp.menu_action_id = ma.id AND ma.menu_id = mm.id AND mm.key = 'crm_inquiry_classification';
--   DELETE FROM public.menu_actions ma USING public.module_menus mm WHERE ma.menu_id = mm.id AND mm.key = 'crm_inquiry_classification';
--   DELETE FROM public.module_menus WHERE key = 'crm_inquiry_classification';
-- =============================================================================
