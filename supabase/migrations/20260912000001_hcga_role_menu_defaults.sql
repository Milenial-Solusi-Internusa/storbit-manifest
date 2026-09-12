-- =============================================================================
-- Migration: 20260912000001_hcga_role_menu_defaults
-- Phase:     Pilot role per-posisi HCGA (Pekerjaan 4) — potongan 1 dari 2:
--            default izin MENU (role_menu_permissions) untuk 4 role baru
--            hcga_manager / hcga_ga / hcga_personel / hcga_peopledev.
--            Potongan 2 (RLS): 20260912000002_is_hcga_functional.
-- Depends:   - 4 role hcga_* di tabel roles — dibuat MANUAL oleh Den 11-12 Sep
--              2026 di STAGING & PRODUKSI, belum ada migrasi yang merekamnya
--              (kandidat rekam retroaktif, pola b4ee8e2). Diverifikasi baca-saja
--              12 Sep 2026 di kedua DB: hcga_manager level 4 · hcga_ga /
--              hcga_personel / hcga_peopledev level 7 (semula 6, diturunkan
--              Den 12 Sep — alasan di KEPUTUSAN) · semuanya is_active,
--              company_id NULL (roles global, 20260821000003).
--            - Katalog module_menus: svc_hrga_semua_request &
--              svc_hrga_pending_approval (20260911000003) · service_asset
--              (lama). Ketiganya + aksi 'view' ada di kedua DB (dicek 12 Sep).
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 12 Sep 2026, urutan
--            STAGING (oovmlhilhqzejnawqkvt) dulu lalu PRODUKSI
--            (untmpqceexwxzuhlmyrg), V1-V3 lolos di keduanya:
--              - STAGING : role_menu_permissions 89 -> 98 (+9, persis plan)
--              - PRODUKSI: role_menu_permissions 96 -> 105 (+9, hasil identik)
--            Snapshot BELUM di-refresh (schema-only: file ini satu-satunya
--            rekaman DATA-nya di repo — sama seperti 20260911000003).
--
-- SIFAT: 100% DATA, 1 INSERT idempoten (ON CONFLICT DO NOTHING) — pola persis
--   20260911000003. Nol DDL, nol GRANT/REVOKE, nol policy, nol RPC. Baris lama
--   (default admin,finance,hrga,it di dua key svc_hrga_*) TIDAK disentuh.
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   Araswati Nurul Syifa dipindah hrga -> hcga_personel dan Ayun Ngainurrohmah
--   manager -> hcga_manager (produksi, 11 Sep 2026 17:10 UTC). role_menu_
--   permissions untuk keempat role hcga_* = 0 baris, dan keduanya nol override
--   HRGA/Asset di user_menu_permissions (dicek 12 Sep). Akibat: Araswati
--   KEHILANGAN menu "Semua Request" + "Pending Approval" (dulu lewat default
--   role hrga); Ayun tak pernah punya (manager memang tidak ada di default
--   svc_hrga_*). My Requests / Buat Request / Arsip tetap terlihat karena
--   ketiganya `public: true` di App.jsx — tidak butuh baris apa pun.
--
-- ── KEY YANG DIPAKAI (MENU_KEY_MAP App.jsx + katalog produksi, 12 Sep 2026) ─
--   Menu              | id item                 | key katalog                 | aksi tersedia
--   My Requests       | hrga                    | hrga_request (YATIM: tidak  | -   (public:true,
--                     |                         | ada di module_menus)        |    key tak dievaluasi)
--   Buat Request      | hrga-buat-request       | (tidak ada di MENU_KEY_MAP) | -   (public:true)
--   Semua Request     | hrga-semua-request      | svc_hrga_semua_request      | view
--   Pending Approval  | hrga-pending-approval   | svc_hrga_pending_approval   | view
--   Arsip             | hrga-arsip              | (tidak ada di MENU_KEY_MAP) | -   (public:true)
--   Asset (+9 sub)    | assets                  | service_asset               | view,create,edit,delete
--   Sub-halaman assets-* tidak ber-gate sendiri -> mewarisi visibilitas modul
--   (navChildGate null). Baris katalog yatim svc_hrga / svc_it / inv_asset
--   (7 aksi, tak dirujuk MENU_KEY_MAP) SENGAJA tidak dipakai — inert.
--
-- ── KEPUTUSAN (Den, 12 Sep 2026) ───────────────────────────────────────────
--   - Tabel izin yang disepakati:
--       hcga_manager : semua kolom, semua aksi
--       hcga_ga      : My/Buat=isi · Semua=lihat · Approval=- · Arsip=lihat · Asset=isi+setujui
--       hcga_personel: My/Buat=isi · Semua=lihat · Approval=isi+setujui · Arsip=lihat · Asset=lihat
--       hcga_peopledev: My/Buat=isi · Semua=lihat · Approval=- · Arsip=lihat · Asset=-
--   - HANYA aksi 'view' yang di-seed. FE hanya pernah memeriksa 'view' untuk
--     key HRGA/Asset (grep hasMenuPermission( 12 Sep 2026: semua 'view',
--     kecuali export/print logistics_sp). "Isi"/"setujui" nyata dijaga RLS
--     (hrga_requests_insert = requester sendiri) dan hrga_approval_configs.
--     approver_role (RPC hrga_submit_approval + hook useMyApproverScope) —
--     BUKAN oleh baris role_menu_permissions. Aksi 'approve' bahkan tidak
--     ada di katalog kedua key svc_hrga_* maupun service_asset.
--   - Blok dokumenter Asset (create/edit/delete utk hcga_manager, create/
--     edit utk hcga_ga) SENGAJA DI-SKIP: nol efek runtime, dan RLS assets_
--     insert/assets_update masih is_admin_or_above() (admin/super_admin) —
--     matriks akan menampilkan izin yang DB-nya menolak. RLS assets_* =
--     task terpisah di luar pilot ini.
--   - super_admin tidak di-seed (bypass hasMenuPermission; preseden
--     20260809000001 & 20260911000003).
--   - Level 3 role staf HCGA diturunkan 6 -> 7 oleh Den (12 Sep, kedua DB):
--     level<=6 = is_manager_or_above() = 52 policy / 31 tabel + 13 fungsi
--     lintas modul bisnis yang bukan domain HCGA — kasus yang sama dengan
--     finance_controller=7 (20260911000004). Tidak memengaruhi file ini
--     (izin menu berbasis kode role), tapi memengaruhi 20260912000002.
--   - Role hrga (0 pemegang aktif sejak 11 Sep) DIBIARKAN ADA, tidak dihapus;
--     default lamanya di svc_hrga_* juga dibiarkan.
--
-- ── URUTAN DEPLOY ──────────────────────────────────────────────────────────
--   Tidak ada kode FE yang harus mendarat lebih dulu — MENU_KEY_MAP sudah
--   memuat ketiga key. Aman dijalankan kapan saja; efek = 9 baris baru di
--   matriks RoleDefaultsPage/UserEditPage + 3 menu muncul utk pemegang role.
--   Rollback: DELETE 9 baris (query di bagian ROLLBACK).
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi, catat angkanya (dipakai V2).
--      Baca-saja 12 Sep 2026: PRODUKSI 96 · STAGING 89.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT count(*) AS sebelum FROM public.role_menu_permissions;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Blok 1 — aksi 'view' (satu-satunya yang dievaluasi FE) -> 9 baris:
--   svc_hrga_semua_request    : hcga_manager, hcga_ga, hcga_personel, hcga_peopledev
--   svc_hrga_pending_approval : hcga_manager, hcga_personel
--   service_asset             : hcga_manager, hcga_ga, hcga_personel
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM (VALUES
  ('svc_hrga_semua_request',    'view', ARRAY['hcga_manager','hcga_ga','hcga_personel','hcga_peopledev']),
  ('svc_hrga_pending_approval', 'view', ARRAY['hcga_manager','hcga_personel']),
  ('service_asset',             'view', ARRAY['hcga_manager','hcga_ga','hcga_personel'])
) AS v(key, action, role_codes)
JOIN public.module_menus mm ON mm.key = v.key
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = v.action
JOIN public.roles r ON r.code::text = ANY(v.role_codes)
                   AND r.deleted_at IS NULL AND r.is_active = true
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — izin per key/aksi untuk role hcga_*. DIHARAPKAN 3 baris, total n = 9:
--   service_asset             view 3  hcga_ga,hcga_manager,hcga_personel
--   svc_hrga_pending_approval view 2  hcga_manager,hcga_personel
--   svc_hrga_semua_request    view 4  hcga_ga,hcga_manager,hcga_peopledev,hcga_personel
SELECT mm.key, ma.action, count(*) AS n,
       string_agg(r.code::text, ',' ORDER BY r.code) AS roles
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  r.code LIKE 'hcga_%'
GROUP  BY mm.key, ma.action
ORDER  BY mm.key, ma.action;

-- V2 — baris lama tak tersentuh: total = V0 + 9 (produksi 105, staging 98),
--      dan default lama dua key svc_hrga_* tetap admin,finance,hrga,it (+ hcga).
SELECT (SELECT count(*) FROM public.role_menu_permissions) AS total_sesudah,
       mm.key, string_agg(r.code::text, ',' ORDER BY r.code) AS roles
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id AND ma.action = 'view'
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  mm.key IN ('svc_hrga_semua_request','svc_hrga_pending_approval','service_asset')
GROUP  BY mm.key ORDER BY mm.key;

-- V3 — nol baris non-'view' utk role hcga_* (Blok 2 memang di-skip). DIHARAPKAN 0.
SELECT count(*) AS non_view
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  r.code LIKE 'hcga_%' AND ma.action <> 'view';


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser) — staging cukup untuk visibilitas menu (katalog
-- 3 key paritas; staging TIDAK punya data HRGA: 0 tipe, 0 config, 0 request,
-- jadi daftarnya kosong — itu bukan kegagalan).
--   1. Akun hcga_personel (Araswati di produksi; di staging pakai akun uji
--      ber-role itu): sidebar HRGA memuat My Requests, Buat Request, Semua
--      Request, Pending Approval, Arsip; modul Asset terlihat. Deep-link
--      ?menu=hrga-pending-approval lalu hard-refresh -> tetap mendarat
--      (jalur fix permsLoaded 20 Agu).
--   2. Akun hcga_manager (Ayun): sama seperti #1.
--   3. Akun hcga_ga / hcga_peopledev (belum ada pemegang — keduanya sengaja,
--      belum ada orangnya di roster): tes lewat RoleDefaultsPage saja —
--      matriks menampilkan centang view sesuai V1.
-- =============================================================================


-- =============================================================================
-- ROLLBACK (hanya bila diperlukan) — hapus persis 9 baris yang dibuat file ini.
-- =============================================================================
-- DELETE FROM public.role_menu_permissions p
-- USING  public.menu_actions ma, public.module_menus mm, public.roles r
-- WHERE  ma.id = p.menu_action_id AND mm.id = ma.menu_id AND r.id = p.role_id
--   AND  r.code LIKE 'hcga_%' AND ma.action = 'view'
--   AND  mm.key IN ('svc_hrga_semua_request','svc_hrga_pending_approval','service_asset');
