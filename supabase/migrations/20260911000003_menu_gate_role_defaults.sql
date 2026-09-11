-- =============================================================================
-- Migration: 20260911000003_menu_gate_role_defaults
-- Phase:     Satu rezim gate menu (DB-driven) — 16 menu yang masih memakai
--            array role hardcode di App.jsx dipindahkan ke katalog
--            module_menus/menu_actions + default izin role_menu_permissions.
--            Ini potongan PERTAMA Fase B3 (seeding role_menu_permissions) yang
--            sungguh berjalan; bukan B3 penuh (60 menu lain tetap per-user).
-- Depends:   katalog modules (key crm/procurement/service/reporting) dan tabel
--            roles yang sudah global (20260821000003). Nol DDL.
--
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 11 Sep 2026:
--              - STAGING  (oovmlhilhqzejnawqkvt): role_menu_permissions 6 -> 89 (+83)
--              - PRODUKSI (untmpqceexwxzuhlmyrg): role_menu_permissions 13 -> 96 (+83)
--            V1..V5 lolos di keduanya, hasil identik: 16 key, role per key persis
--            tabel di bawah, report_mom membawa sales+operations, NOL baris
--            super_admin/supervisor. Lapis 2 (browser) dijalankan di preview
--            branch refactor/unify-menu-gate SESUDAH FE-nya mendarat (lihat
--            "CATATAN SESUDAH EKSEKUSI"). Snapshot BELUM di-refresh (schema-only:
--            file ini satu-satunya rekaman DATA-nya di repo).
--
-- SIFAT: 3 INSERT idempoten (ON CONFLICT DO NOTHING), 100% DATA. Nol DDL,
--   nol GRANT/REVOKE, nol policy, nol RPC. Baris lama tak disentuh.
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   canSeeMenuItem (App.jsx) punya dua rezim gate yang tidak saling kenal:
--     1. ~54 key MENU_KEY_MAP -> hasMenuPermission(): DB-driven, memeriksa
--        SEMUA role aktif user di entitas aktif (union role_menu_permissions
--        + override user_menu_permissions).
--     2. 16 menu tanpa MENU_KEY_MAP -> fallback item.role.includes(role):
--        hanya ROLE UTAMA (pickPrimaryErpRole), tunggal.
--   Bug nyata rezim #2: user [manager, hrga] ber-role-utama 'manager'
--   kehilangan menu hrga-pending-approval walau ia pemegang role 'hrga'.
--   Blast radius di produksi 11 Sep 2026 (query baca-saja): 2 user dengan >1
--   role aktif di entitas yang sama — "akun test"@SOA (finance+operations+
--   procurement) MENDAPAT 5 menu (PRF, Forwarding MSI, SO Procurement, Vendor
--   List, MOM); Endang (manager+sales) nol perubahan.
--
-- ── KEPUTUSAN (Den, 11 Sep 2026) ───────────────────────────────────────────
--   - Yang berubah MEKANISME-nya saja, bukan SIAPA yang boleh: array role
--     disalin VERBATIM ke role_menu_permissions. Kebijakan akses tidak
--     disentuh (finance_controller tetap TIDAK di menu HRGA walau finance
--     ada — gotcha #33; sales tetap TIDAK di Approval Lead Pool; dst).
--   - super_admin TIDAK di-seed: bypass di hasMenuPermission (AuthContext)
--     menjaminnya, sama seperti rezim array lama; mengikuti preseden
--     20260809000001 dan 13 baris yang sudah ada. Array di bawah TETAP
--     menuliskannya supaya bisa diaudit baris-per-baris terhadap App.jsx;
--     pengecualiannya satu klausa `r.code <> 'super_admin'`.
--   - supervisor ada di 10 array tapi role-nya TIDAK EKSIS di tabel roles
--     (TD-106) -> JOIN menghasilkan nol baris, inert persis seperti hari ini.
--     ⚠️ CHECKLIST kalau TD-106 kelak membuat role 'supervisor': tambahkan
--     baris untuk crm_lead_pool, crm_calls, crm_activity_log,
--     crm_lead_pool_approval, proc_vendor_list, svc_hrga_semua_request,
--     svc_hrga_pending_approval, report_sales, report_indomarco_dashboard,
--     report_mom.
--   - Hanya aksi 'view' — satu-satunya aksi yang dicek canSeeMenuItem.
--
-- ── PENAMAAN KEY ───────────────────────────────────────────────────────────
--   key = <prefix katalog modul>_<id menu, '-' -> '_'>; prefix katalog yang
--   sudah dipakai: crm_ / proc_ / svc_ (modul `service`; TIDAK ADA modul hrga)
--   / report_. Dicek 11 Sep 2026 terhadap 64 key katalog produksi + 54 key
--   MENU_KEY_MAP: nol tabrakan. proc_vendor_list (baru, Master Vendor) SENGAJA
--   terpisah dari proc_vendor (lama, id 'vendors' "Vendor Management") — dua
--   menu, dua array.
--
-- ── URUTAN DEPLOY (penting) ────────────────────────────────────────────────
--   hasMenuPermission default-deny -> migrasi ini HARUS LIVE SEBELUM kode FE
--   yang mencabut fallback array mendarat; kalau terbalik, ke-16 menu hilang
--   untuk semua non-super_admin. Aman dijalankan lebih dulu: kode lama tidak
--   membaca key baru (efek samping cuma 16 baris tambahan di matriks
--   RoleDefaultsPage/UserEditPage). Rollback pun WAJIB berpasangan.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi, catat angkanya (dipakai V5).
--      Produksi 11 Sep 2026: 13. Staging: 6.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT count(*) AS sebelum FROM public.role_menu_permissions;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Katalog menu — 16 baris, idempoten (module_menus.key UNIQUE).
--    sort_order melanjutkan angka tertinggi tiap modul (hanya memengaruhi
--    urutan di matriks RoleDefaultsPage/UserEditPage).
INSERT INTO public.module_menus (module_id, key, label, sort_order, is_active)
SELECT m.id, v.key, v.label, v.sort_order, true
FROM (VALUES
  ('crm',         'crm_lead_pool',              'Lead Pool',                  7),
  ('crm',         'crm_sales_order',            'Sales Order (CRM)',          8),
  ('crm',         'crm_calls',                  'Jadwal & Tugas',             9),
  ('crm',         'crm_activity_log',           'Log Aktivitas',             10),
  ('crm',         'crm_riwayat_visit',          'Riwayat Visit',             11),
  ('crm',         'crm_lead_pool_approval',     'Approval Lead Pool',        12),
  ('crm',         'crm_rate_list',              'Rate List',                 13),
  ('procurement', 'proc_prf',                   'PRF',                        4),
  ('procurement', 'proc_inquiry_fwd_msi',       'Forwarding (MSI)',           5),
  ('procurement', 'proc_sales_order',           'Sales Order (Procurement)',  6),
  ('procurement', 'proc_vendor_list',           'Vendor List',                7),
  ('service',     'svc_hrga_semua_request',     'HRGA — Semua Request',      11),
  ('service',     'svc_hrga_pending_approval',  'HRGA — Pending Approval',   12),
  ('reporting',   'report_sales',               'Sales Report',               7),
  ('reporting',   'report_indomarco_dashboard', 'Indomarco Dashboard',        8),
  ('reporting',   'report_mom',                 'MOM',                        9)
) AS v(module_key, key, label, sort_order)
JOIN public.modules m ON m.key = v.module_key
ON CONFLICT (key) DO NOTHING;

-- 2. Aksi 'view' untuk ke-16 menu (UNIQUE (menu_id, action)).
INSERT INTO public.menu_actions (menu_id, action, is_active)
SELECT mm.id, 'view', true
FROM public.module_menus mm
WHERE mm.key IN (
  'crm_lead_pool','crm_sales_order','crm_calls','crm_activity_log',
  'crm_riwayat_visit','crm_lead_pool_approval','crm_rate_list',
  'proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list',
  'svc_hrga_semua_request','svc_hrga_pending_approval',
  'report_sales','report_indomarco_dashboard','report_mom')
ON CONFLICT (menu_id, action) DO NOTHING;

-- 3. Default izin per role — array disalin VERBATIM dari App.jsx (commit
--    c825121, sebelum array-nya dicabut), TERMASUK super_admin & supervisor
--    supaya bisa diaudit baris-per-baris. super_admin dikecualikan di WHERE
--    (bypass hasMenuPermission; preseden 20260809000001). supervisor gugur
--    sendiri: role-nya tak ada (TD-106).
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM (VALUES
  ('crm_lead_pool',              ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','supervisor','sales']),
  ('crm_sales_order',            ARRAY['sales','gm_bd','manager','ceo','admin','super_admin']),
  ('crm_calls',                  ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','supervisor','sales']),
  ('crm_activity_log',           ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','supervisor','sales']),
  ('crm_riwayat_visit',          ARRAY['super_admin','ceo','gm_bd']),
  ('crm_lead_pool_approval',     ARRAY['ceo','gm','gm_bd','manager','supervisor','admin','super_admin']),
  ('crm_rate_list',              ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','sales']),
  ('proc_prf',                   ARRAY['sales','gm_bd','procurement','manager','ceo','admin','super_admin']),
  ('proc_inquiry_fwd_msi',       ARRAY['sales','gm_bd','procurement','manager','ceo','admin','super_admin']),
  ('proc_sales_order',           ARRAY['procurement','manager','ceo','admin','super_admin']),
  ('proc_vendor_list',           ARRAY['procurement','manager','supervisor','gm','gm_bd','ceo','admin','super_admin']),
  ('svc_hrga_semua_request',     ARRAY['super_admin','admin','finance','it','hrga','supervisor']),
  ('svc_hrga_pending_approval',  ARRAY['super_admin','admin','finance','it','hrga','supervisor']),
  ('report_sales',               ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','supervisor']),
  ('report_indomarco_dashboard', ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','supervisor']),
  -- reporting-mom = MANAGER_OR_ABOVE + sales + operations — DIPERTAHANKAN PERSIS,
  -- bukan digeneralisasi jadi manager-ke-atas polos.
  ('report_mom',                 ARRAY['super_admin','admin','ceo','gm','gm_bd','manager','supervisor','sales','operations'])
) AS v(key, role_codes)
JOIN public.module_menus mm ON mm.key = v.key
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
JOIN public.roles r ON r.code::text = ANY(v.role_codes)
                   AND r.deleted_at IS NULL AND r.is_active = true
                   AND r.code <> 'super_admin'   -- hapus klausa ini kalau super_admin mau ikut di-seed (+16 baris)
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- Hasil 11 Sep 2026: V1..V5 LOLOS di staging dan produksi, identik.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — 16 menu terdaftar di modul yang benar.
--      DIHARAPKAN: 16 baris — crm 7, procurement 4, service 2, reporting 3.
SELECT m.key AS module, mm.key, mm.label, mm.sort_order
FROM   public.module_menus mm
JOIN   public.modules m ON m.id = mm.module_id
WHERE  mm.key IN (
  'crm_lead_pool','crm_sales_order','crm_calls','crm_activity_log',
  'crm_riwayat_visit','crm_lead_pool_approval','crm_rate_list',
  'proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list',
  'svc_hrga_semua_request','svc_hrga_pending_approval',
  'report_sales','report_indomarco_dashboard','report_mom')
ORDER  BY m.sort_order, mm.sort_order;

-- V2 — 16 aksi view.
--      DIHARAPKAN: 16.
SELECT count(*) AS n_view
FROM   public.menu_actions ma
JOIN   public.module_menus mm ON mm.id = ma.menu_id
WHERE  ma.action = 'view' AND mm.key IN (
  'crm_lead_pool','crm_sales_order','crm_calls','crm_activity_log',
  'crm_riwayat_visit','crm_lead_pool_approval','crm_rate_list',
  'proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list',
  'svc_hrga_semua_request','svc_hrga_pending_approval',
  'report_sales','report_indomarco_dashboard','report_mom');

-- V3 — izin per menu. DIHARAPKAN 16 baris, total n = 83:
--   crm_activity_log          6  admin,ceo,gm,gm_bd,manager,sales
--   crm_calls                 6  admin,ceo,gm,gm_bd,manager,sales
--   crm_lead_pool             6  admin,ceo,gm,gm_bd,manager,sales
--   crm_lead_pool_approval    5  admin,ceo,gm,gm_bd,manager
--   crm_rate_list             6  admin,ceo,gm,gm_bd,manager,sales
--   crm_riwayat_visit         2  ceo,gm_bd
--   crm_sales_order           5  admin,ceo,gm_bd,manager,sales
--   proc_inquiry_fwd_msi      6  admin,ceo,gm_bd,manager,procurement,sales
--   proc_prf                  6  admin,ceo,gm_bd,manager,procurement,sales
--   proc_sales_order          4  admin,ceo,manager,procurement
--   proc_vendor_list          6  admin,ceo,gm,gm_bd,manager,procurement
--   report_indomarco_dashboard 5 admin,ceo,gm,gm_bd,manager
--   report_mom                7  admin,ceo,gm,gm_bd,manager,operations,sales   <- sales+operations WAJIB ada
--   report_sales              5  admin,ceo,gm,gm_bd,manager
--   svc_hrga_pending_approval 4  admin,finance,hrga,it
--   svc_hrga_semua_request    4  admin,finance,hrga,it
SELECT mm.key, count(*) AS n, string_agg(r.code, ',' ORDER BY r.code) AS roles
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id AND ma.action = 'view'
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  mm.key IN (
  'crm_lead_pool','crm_sales_order','crm_calls','crm_activity_log',
  'crm_riwayat_visit','crm_lead_pool_approval','crm_rate_list',
  'proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list',
  'svc_hrga_semua_request','svc_hrga_pending_approval',
  'report_sales','report_indomarco_dashboard','report_mom')
GROUP  BY mm.key
ORDER  BY mm.key;

-- V4 — nol baris super_admin / supervisor nyangkut di 16 key.
--      DIHARAPKAN: 0.
SELECT count(*) AS nyangkut
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  r.code IN ('super_admin','supervisor')
  AND  mm.key IN (
  'crm_lead_pool','crm_sales_order','crm_calls','crm_activity_log',
  'crm_riwayat_visit','crm_lead_pool_approval','crm_rate_list',
  'proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list',
  'svc_hrga_semua_request','svc_hrga_pending_approval',
  'report_sales','report_indomarco_dashboard','report_mom');

-- V5 — baris lama tak tersentuh: total = V0 + 83 (produksi 96, staging 89),
--      dan empat key lama tetap (crm_dashboard 1, crm_pipeline 1,
--      logistics_picking 5, logistics_surat_jalan 5).
SELECT (SELECT count(*) FROM public.role_menu_permissions) AS total_sesudah,
       mm.key, count(*) AS n
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id
JOIN   public.module_menus mm ON mm.id = ma.menu_id
WHERE  mm.key IN ('crm_dashboard','crm_pipeline','logistics_picking','logistics_surat_jalan')
GROUP  BY mm.key ORDER BY mm.key;


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser, preview branch refactor/unify-menu-gate —
-- Vercel Preview menunjuk STAGING) — sesudah kode FE mendarat.
--
--   1. Akun procurement (murni tier-3, nol user_menu_permissions): sidebar
--      memuat PRF / Forwarding (MSI) / Sales Order (Procurement) / Vendor List;
--      buka deep-link ?menu=prf lalu hard-refresh -> tetap di PRF (jalur fix
--      permsLoaded 20 Agu, eksekusi nyata pertama).
--   2. Akun sales: Lead Pool, Jadwal & Tugas, Log Aktivitas, Rate List, Sales
--      Order (CRM), PRF, Forwarding (MSI), MOM terlihat; Approval Lead Pool &
--      Riwayat Visit TIDAK.
--   3. Akun hrga: Semua Request + Pending Approval terlihat.
--   4. "akun test" (finance+operations+procurement @SOA): MENDAPAT PRF,
--      Forwarding (MSI), Sales Order (Procurement), Vendor List, MOM — bukti
--      rezim baru menilai SEMUA role aktif, bukan role utama.
--   GAGAL khas: menu hilang untuk semua non-super_admin -> migrasi belum
--   mendarat di DB yang dipakai environment itu (cek V1 di DB tersebut).
-- =============================================================================


-- =============================================================================
-- CATATAN SESUDAH EKSEKUSI
--   1. Lapis 1 sudah LOLOS di kedua DB (11 Sep 2026). Lapis 2 menyusul di
--      preview; kalau ada yang gagal, jangan ubah data — periksa MENU_KEY_MAP.
--   2. Refresh schema_snapshot.sql tidak akan memuat perubahan ini (schema-only,
--      keputusan 6 Sep 2026) — file inilah rekamannya.
--   3. Sesudah ini, ke-16 menu bisa diatur per role di RoleDefaultsPage dan
--      di-override per user (grant/deny) di UserEditPage — itu tujuannya.
-- =============================================================================




















-- =============================================================================
-- =============================================================================
--
--                        ⛔  B A T A L K A N   —   JANGAN JALANKAN
--                            KECUALI MEMANG MAU MEMBALIKKAN
--
--   Dijauhkan dari alur baca verifikasi dengan sengaja; seluruhnya komentar.
--   ⚠️ WAJIB BERPASANGAN dengan revert kode FE (kembalikan array `role:` +
--   fallback canSeeMenuItem). Mencabut baris DB sendirian = ke-16 menu hilang
--   untuk semua non-super_admin.
--   ⚠️ CASCADE dari module_menus ikut menghapus override per-user
--   (user_menu_permissions) yang mungkin lahir SESUDAH migrasi ini untuk 16
--   key tersebut — periksa dulu:
--     SELECT count(*) FROM public.user_menu_permissions u
--     JOIN public.menu_actions ma ON ma.id = u.menu_action_id
--     JOIN public.module_menus mm ON mm.id = ma.menu_id
--     WHERE mm.key IN (<16 key>);
--
-- =============================================================================
-- =============================================================================
--
-- BEGIN;
-- DELETE FROM public.module_menus
--  WHERE key IN (
--   'crm_lead_pool','crm_sales_order','crm_calls','crm_activity_log',
--   'crm_riwayat_visit','crm_lead_pool_approval','crm_rate_list',
--   'proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list',
--   'svc_hrga_semua_request','svc_hrga_pending_approval',
--   'report_sales','report_indomarco_dashboard','report_mom');
-- -- CASCADE: menu_actions -> role_menu_permissions + user_menu_permissions.
-- COMMIT;
--
-- =============================================================================
