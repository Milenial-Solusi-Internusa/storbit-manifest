-- =============================================================================
-- Migration: 20260912000003_proc_roles_menu_defaults
-- Phase:     Pilot 2 pecah role per-posisi — SCM Procurement (pola pilot HCGA
--            feat/hcga-role-pilot, 20260912000001/000002). Potongan A dari 2:
--            2 role baru (proc_manager / proc_staff) + 8 baris default izin
--            MENU. Potongan B (RLS + RPC): 20260912000004_is_procurement_functional.
-- Depends:   - roles global (20260821000003) · roles.level + roles_level_check
--              (20260911000004) · roles_code_unique (20260911000006) — ketiganya
--              LIVE di STAGING & PRODUKSI (dicek 12 Sep 2026).
--            - Katalog module_menus proc_prf / proc_inquiry_fwd_msi /
--              proc_sales_order / proc_vendor_list + aksi 'view'
--              (20260911000003, LIVE kedua DB).
--            - TIDAK bergantung pada 20260912000001/000002 (branch HCGA) maupun
--              20260912000000 (retroaktif HCGA, belum ditulis) — nomor 000003
--              dipilih supaya tidak bertabrakan dengan ketiganya saat merge.
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 12 Sep 2026, urutan
--            STAGING (oovmlhilhqzejnawqkvt) dulu lalu PRODUKSI
--            (untmpqceexwxzuhlmyrg). Diverifikasi ulang baca-saja dari kedua DB
--            saat header ini ditulis (hari yang sama):
--              - roles proc_manager L4 · proc_staff L7 terpasang di keduanya
--              - role_menu_permissions STAGING 98 -> 106 · PRODUKSI 105 -> 113
--                (+8 persis, 2 baris tiap key)
--            Roster PRODUKSI sudah dipindah Den sesudahnya: Dery proc_manager
--            @MSI/JCI/SOA · Camelia proc_staff @MSI/JCI/SOA (sekaligus memulihkan
--            JCI/SOA yang salah tercabut 11 Sep) · Dwi & Iman proc_staff @MSI.
--            Sisa pemegang 'procurement': SCM Master@MSI (nonaktif) & akun
--            test@SOA — dormant. Staging: nol pemegang proc_* (roster uji).
--            Snapshot BELUM di-refresh (schema-only: file ini satu-satunya
--            rekaman DATA-nya di repo).
--
-- SIFAT: 100% DATA, 2 INSERT idempoten (ON CONFLICT DO NOTHING). Nol DDL, nol
--   GRANT/REVOKE, nol policy, nol RPC. Baris lama role 'procurement' TIDAK
--   disentuh (keputusan Den, lihat bawah).
--
-- ── LATAR ──────────────────────────────────────────────────────────────────
--   Struktur SCM Procurement dua tingkat: Procurement Manager lapor langsung
--   ke SCM GM; staf Direct/Indirect Procurement semuanya level Staff tanpa
--   Supervisor di antaranya. Role tunggal 'procurement' (level 7) dipecah
--   jadi DUA (bukan empat seperti HCGA):
--     proc_manager  level 4  — setara 'manager'. ALASAN BEDA DARI HCGA:
--                              Procurement Manager bukan support function;
--                              ia pemegang wewenang PRF/vendor yang memang
--                              butuh manager-ke-atas. Diukur 12 Sep 2026
--                              (produksi): dengan level 7 Dery Agung Prahasto
--                              kehilangan PERSIS dua hal — melepas PRF yang
--                              dipegang stafnya (prf_release: 99 PRF Camelia +
--                              148 PRF Dwi terkunci pada pemegangnya) dan
--                              memilih penawaran vendor (prf_select_offer) —
--                              dan TIDAK ADA jalur lain: kedua RPC level-based
--                              sejak 20260911000005, pengecualiannya hanya
--                              super_admin. Harga level 4 = cakupan role
--                              'manager' persis (52 policy / 31 tabel + 13
--                              fungsi + 8 gate FE isManagerOrAbove), yang
--                              sudah dipegang 4 user 'manager' hari ini.
--     proc_staff    level 7  — setara 'procurement' lama (Staff, tanpa
--                              wewenang manager-ke-atas).
--   Level dikunci Den 12 Sep 2026 sesudah pengukuran di atas.
--
-- ── KEY MENU (MENU_KEY_MAP App.jsx + role_menu_permissions produksi) ───────
--   'procurement' hari ini hanya ada di 4 key, semua aksi 'view', dan keenam
--   pemegangnya NOL override user_menu_permissions (dicek 12 Sep 2026):
--     proc_prf             : admin,ceo,gm_bd,manager,procurement,sales
--     proc_inquiry_fwd_msi : admin,ceo,gm_bd,manager,procurement,sales
--     proc_sales_order     : admin,ceo,manager,procurement
--     proc_vendor_list     : admin,ceo,gm,gm_bd,manager,procurement
--   Kedua role baru mendapat 4 key yang sama (staff butuh akses persis seperti
--   sekarang, hanya kodenya berganti). Hanya 'view' — satu-satunya aksi yang
--   dievaluasi FE untuk key ini.
--
-- ── KEPUTUSAN (Den, 12 Sep 2026) ───────────────────────────────────────────
--   - Pembuatan role DICATAT DI MIGRASI (Blok 0), bukan manual seperti HCGA —
--     supaya tidak menambah utang rekam retroaktif.
--   - Default lama role 'procurement' (4 baris) DIBIARKAN, tidak dicabut;
--     role 'procurement' sendiri dibiarkan dormant (preseden 'hrga', pilot 1).
--   - super_admin tidak di-seed (bypass hasMenuPermission; preseden
--     20260809000001 / 20260911000003 / 20260912000001).
--   - Home company Dery & Camelia TIDAK dipindah (tetap SOA); pemulihan role
--     di 3 entitas dikerjakan Den saat roster dipindah ke role baru — bagian
--     dari perbaikan insiden dedup Pekerjaan 1 (11 Sep 09:53 UTC, kelas bug
--     yang sama dengan kasus Elvira), BUKAN bagian file ini.
--
-- ── URUTAN DEPLOY ──────────────────────────────────────────────────────────
--   A (file ini) → roster dipindah manual oleh Den (proc_manager / proc_staff,
--   termasuk pemulihan 3 entitas Dery/Camelia) → B (20260912000004). B WAJIB
--   sesudah roster: helper is_procurement_functional() SENGAJA tidak memuat
--   kode 'procurement', jadi kalau B mendahului roster, pemegang lama
--   kehilangan tulis PRF. File ini sendiri aman kapan saja: efeknya cuma 2
--   role baru di katalog + 8 baris di matriks RoleDefaultsPage/UserEditPage.
--   FE (PRFDetailPage canEdit / SalesOrderDocDetailPage prfDefinitive /
--   ERP_ROLE_PRIORITY) belum kenal kode baru — commit terpisah, idealnya
--   mendarat sebelum roster pindah supaya pemegang role baru langsung dapat
--   tombol/gate edit di UI (RLS-nya diurus B).
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi, catat angkanya (dipakai V3).
--      Baca-saja 12 Sep 2026: PRODUKSI role_menu_permissions 105 · STAGING 98;
--      roles proc_manager/proc_staff belum ada di keduanya (0).
-- ═════════════════════════════════════════════════════════════════════════════
SELECT (SELECT count(*) FROM public.role_menu_permissions) AS rmp_sebelum,
       (SELECT count(*) FROM public.roles WHERE code IN ('proc_manager','proc_staff')) AS roles_sebelum;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Blok 0 — dua role baru. roles_code_unique → idempoten. company_id NULL (roles
-- global), is_system_role false (mengikuti hcga_*), level WAJIB eksplisit
-- (NOT NULL tanpa default, 20260911000004).
INSERT INTO public.roles (code, name, description, is_system_role, is_active, company_id, level)
VALUES
  ('proc_manager', 'Procurement Manager',
   'SCM Procurement — Procurement Manager, lapor langsung ke SCM GM. Level 4 (manager ke atas): '
   'pemegang wewenang prf_release / prf_select_offer. Pilot 2 pecah role, migrasi 20260912000003.',
   false, true, NULL, 4),
  ('proc_staff',   'Procurement Staff',
   'SCM Procurement — staf Direct/Indirect Procurement, tanpa tingkat supervisor. Level 7 = setara '
   'role procurement lama (kini dormant). Pilot 2 pecah role, migrasi 20260912000003.',
   false, true, NULL, 7)
ON CONFLICT (code) DO NOTHING;

-- Blok 1 — 4 key × 2 role, aksi 'view' → 8 baris.
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM (VALUES ('proc_prf'), ('proc_inquiry_fwd_msi'), ('proc_sales_order'), ('proc_vendor_list')) AS v(key)
JOIN public.module_menus mm ON mm.key = v.key
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
JOIN public.roles r ON r.code IN ('proc_manager','proc_staff')
                   AND r.deleted_at IS NULL AND r.is_active = true
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — dua role baru. DIHARAPKAN: proc_manager level 4 · proc_staff level 7,
--      keduanya is_active, company_id NULL, deleted_at NULL.
SELECT code, name, level, is_active, company_id, deleted_at
FROM   public.roles
WHERE  code IN ('proc_manager','proc_staff')
ORDER  BY level;

-- V2 — izin per key untuk kedua role. DIHARAPKAN 4 baris, n = 2 tiap key
--      (proc_manager,proc_staff), total 8.
SELECT mm.key, count(*) AS n, string_agg(r.code::text, ',' ORDER BY r.code) AS roles
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id AND ma.action = 'view'
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  r.code IN ('proc_manager','proc_staff')
GROUP  BY mm.key ORDER BY mm.key;

-- V3 — baris lama tak tersentuh: total = V0 + 8 (produksi 113, staging 106),
--      dan 'procurement' masih ada di keempat key (dibiarkan dormant).
SELECT (SELECT count(*) FROM public.role_menu_permissions) AS total_sesudah,
       mm.key, string_agg(r.code::text, ',' ORDER BY r.code) AS roles
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id AND ma.action = 'view'
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  mm.key IN ('proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list')
GROUP  BY mm.key ORDER BY mm.key;

-- V4 — nol baris non-'view' & nol baris super_admin untuk kedua role. DIHARAPKAN 0.
SELECT count(*) AS nyangkut
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  (r.code IN ('proc_manager','proc_staff') AND ma.action <> 'view')
   OR  (r.code = 'super_admin' AND ma.menu_id IN (SELECT id FROM public.module_menus
                                                   WHERE key IN ('proc_prf','proc_inquiry_fwd_msi','proc_sales_order','proc_vendor_list')));


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser) — sesudah roster dipindah (dan idealnya FE
-- yang mengenal kode baru sudah mendarat):
--   1. Akun proc_staff (Dwi, home MSI): sidebar Procurement memuat PRF /
--      Forwarding (MSI) / Sales Order / Vendor List — persis seperti saat
--      masih 'procurement'. Deep-link ?menu=prf + hard-refresh → tetap di PRF.
--   2. Akun proc_manager (Dery) & Camelia: menu yang sama — dengan catatan
--      home company keduanya SOA: menu baru terlihat bila role baru juga
--      diberikan @SOA (pemulihan 3 entitas), karena activeCompanyId default =
--      home dan CompanySwitcher statis saat role hanya di satu entitas.
--   3. RoleDefaultsPage: kedua role tampil dengan 4 centang view.
-- =============================================================================


-- =============================================================================
-- ROLLBACK (hanya bila diperlukan) — kebalikan persis; urutan penting karena
-- role_menu_permissions.role_id ON DELETE CASCADE ke roles.
-- =============================================================================
-- DELETE FROM public.role_menu_permissions p USING public.roles r
--   WHERE r.id = p.role_id AND r.code IN ('proc_manager','proc_staff');
-- DELETE FROM public.roles WHERE code IN ('proc_manager','proc_staff')
--   AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role_id = roles.id);
