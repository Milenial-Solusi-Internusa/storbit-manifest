-- =============================================================================
-- Migration: 20260924000002_menu_skeleton_grant_template
-- Phase:     Kerangka menu Grand Design Bagian 1 — TEMPLATE pemberian izin
--            untuk menu key tab placeholder (`skel_*`).
-- Depends:   20260924000001_menu_skeleton_catalog (key-nya harus ada di katalog
--            lebih dulu; tanpa itu JOIN di bawah menghasilkan NOL baris dan
--            migrasi ini "berhasil" tanpa melakukan apa pun — periksa V1).
--
-- Status:    BELUM DIJALANKAN — dan MEMANG BELUM SIAP DIJALANKAN.
--            Blok VALUES-nya sengaja KOSONG. File ini bukan perubahan yang
--            menunggu giliran, melainkan cetakan yang diisi saat sebuah modul
--            Bagian 1 benar-benar dibangun.
--
-- -- KENAPA KOSONG ------------------------------------------------------------
--   Selama sebuah tab masih placeholder, satu-satunya yang boleh melihatnya
--   adalah super_admin. Itu bukan kebijakan yang ditulis di mana pun: ia
--   KONSEKUENSI dari key `skel_*` tidak punya baris role_menu_permissions,
--   digabung dengan bypass tier 1 di hasMenuPermission (AuthContext.jsx:365).
--   Menambahkan satu baris grant di sini akan membuat tab kosong itu muncul di
--   sidebar role yang bersangkutan. Jadi: isi file ini HANYA bersamaan dengan
--   halaman yang sungguh ada isinya.
--
-- -- CARA PAKAI ---------------------------------------------------------------
--   1. Isi blok VALUES: ('<menu key>', ARRAY['<role code>', ...]).
--      Menu key-nya bisa dilihat di src/routes/menu-skeleton.js (field
--      `menuKey`) atau di module_menus.label, yang memuat kode Bagian 1-nya.
--   2. Salin array role VERBATIM dari keputusan tertulis, jangan
--      digeneralisasi jadi "manager ke atas" (pelajaran 20260911000003).
--   3. super_admin SENGAJA tidak di-seed: bypass hasMenuPermission sudah
--      menjaminnya, dan itu preseden 20260809000001 + 20260911000003.
--   4. Jalankan V0 -> blok -> V1/V2, catat angkanya di PROGRESS.md.
--
-- SIFAT saat diisi: 1 INSERT idempoten, 100% DATA. Nol DDL, nol policy, nol RPC.
--   Tidak pernah menghapus baris — pencabutan izin adalah keputusan terpisah
--   dan ditulis sebagai migrasi tersendiri, bukan disisipkan di sini.
-- =============================================================================


-- =============================================================================
-- V0 -- jalankan SEBELUM blok eksekusi, catat angkanya.
-- =============================================================================
SELECT count(*) AS rmp_sebelum FROM public.role_menu_permissions;


-- =============================================================================
-- BLOK EKSEKUSI -- JANGAN dijalankan selama VALUES masih kosong.
-- =============================================================================

-- BEGIN;
--
-- INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
-- SELECT r.id, ma.id
-- FROM (VALUES
--   -- ('skel_1_3_1', ARRAY['super_admin','admin','manager','bd_sales_executive']),
--   -- ('skel_1_3_2', ARRAY['super_admin','admin','manager']),
-- ) AS v(key, role_codes)
-- JOIN public.module_menus mm ON mm.key = v.key
-- JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
-- JOIN public.roles r ON r.code::text = ANY(v.role_codes)
--                    AND r.deleted_at IS NULL AND r.is_active = true
--                    AND r.code <> 'super_admin'   -- bypass tier 1, lihat catatan 3
-- ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;
--
-- COMMIT;


-- =============================================================================
-- VERIFIKASI -- jalankan TERPISAH sesudah COMMIT.
-- =============================================================================

-- V1 -- key yang diberi izin beserta rolenya. DIHARAPKAN: persis daftar yang
--       diisi di blok VALUES, nol baris super_admin.
SELECT mm.key, r.code
FROM   public.role_menu_permissions rmp
JOIN   public.menu_actions ma ON ma.id = rmp.menu_action_id
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r         ON r.id  = rmp.role_id
WHERE  mm.key LIKE 'skel\_%'
ORDER  BY mm.key, r.code;

-- V2 -- sisa tab yang MASIH super_admin-only. Angka ini harus turun persis
--       sebanyak key yang baru diberi izin, tidak lebih.
SELECT count(*) AS masih_super_admin_only
FROM   public.module_menus mm
WHERE  mm.key LIKE 'skel\_%'
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.role_menu_permissions rmp
         JOIN   public.menu_actions ma ON ma.id = rmp.menu_action_id
         WHERE  ma.menu_id = mm.id
       );
