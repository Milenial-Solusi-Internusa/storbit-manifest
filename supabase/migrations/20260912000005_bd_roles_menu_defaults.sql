-- =============================================================================
-- Migration: 20260912000005_bd_roles_menu_defaults
-- Phase:     Pilot 3 pecah role per-posisi — Business Development (BD). Pola
--            pilot HCGA (20260912000001/000002) & Procurement (000003/000004).
--            Potongan A dari 2 (DATA): 5 role baru + 56 baris default izin MENU.
--            Potongan B (RLS: is_sales_functional() + 2 policy) menyusul
--            SESUDAH roster dipindah — belum ditulis saat file ini dibuat.
-- Depends:   - roles global (20260821000003) · roles.level + roles_level_check
--              (20260911000004) · roles_code_unique (20260911000006).
--            - Katalog module_menus + aksi 'view' untuk 14 key di bawah — dicek
--              12 Sep 2026: 14/14 ada di STAGING dan PRODUKSI.
--            - TIDAK bergantung pada 20260912000000 (retroaktif HCGA, belum
--              ditulis) — nomor 000005 dipilih supaya tidak bertabrakan.
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 12 Sep 2026, urutan
--            STAGING (oovmlhilhqzejnawqkvt) dulu lalu PRODUKSI
--            (untmpqceexwxzuhlmyrg). Diverifikasi ulang baca-saja dari kedua DB
--            saat header ini ditulis (hari yang sama):
--              - 5 role bd_* hidup: spv_console L6 · spv_forwarding L6 ·
--                account_executive L7 · digital_marketing_spv L7 · sales_executive L7
--              - role_menu_permissions STAGING 106 -> 162 · PRODUKSI 113 -> 169
--                (+56 persis; V4 nol — nol non-view / super_admin / DM nyangkut)
--              - 8 default 'sales' lama tetap (dormant).
--            Roster BELUM dipindah saat header ini ditulis — menunggu FE-1 live
--            di produksi (urutan A -> FE-1 -> roster -> B -> FE-2).
--            Snapshot BELUM di-refresh (schema-only: file ini satu-satunya
--            rekaman DATA-nya di repo).
--
-- SIFAT: 100% DATA, 2 INSERT idempoten (ON CONFLICT DO NOTHING). Nol DDL, nol
--   GRANT/REVOKE, nol policy, nol RPC. Baris lama role 'sales' (8 key) dan
--   seluruh override user_menu_permissions TIDAK disentuh.
--
-- ── LATAR & BUKTI (produksi, 12 Sep 2026) ──────────────────────────────────
--   Role tunggal 'sales' (level 7, 8 pemegang: 7 aktif + Gusti nonaktif) dipecah
--   jadi LIMA role per-posisi BD. Level dikunci Den 12 Sep 2026 sesudah
--   pengukuran — semua diputuskan dari bukti sistem, bukan warna org chart:
--
--     bd_sales_spv_console     6  Sales Supervisor tim Console
--     bd_sales_spv_forwarding  6  Sales Supervisor tim Forwarding (0 pemegang dulu, sengaja)
--     bd_account_executive     7  Account Executive
--     bd_digital_marketing_spv 7  Digital Marketing Supervisor
--     bd_sales_executive       7  gabungan Sales Executive Project/Storbit/Console/
--                                 Forwarding + Sales Staff
--
--   • SPV = 6 ("manager ke atas") DENGAN CATATAN: sistem TIDAK punya predikat
--     tim — profiles.reports_to ada (Suhana → Endang) tapi NOL policy/fungsi
--     memakainya. Level <= 6 berarti "lihat & kelola data sales SELURUH
--     entitas" (52 policy / 31 tabel + 13 fungsi, termasuk lintas modul yang
--     sama dengan role 'manager'), BUKAN "hanya timnya". Itu persis perlakuan
--     Endang hari ini (Supervisor Sales yang diberi role 'manager'); level 4 vs
--     6 nol beda di RLS. Kalau kelak dibutuhkan "hanya tim", itu predikat baru
--     berbasis reports_to di ±10 policy CRM — bukan pekerjaan pilot ini.
--   • bd_account_executive = 7 walau org chart mewarnainya "Manager" (grade):
--     Martin nol wewenang manajerial yang pernah dijalankan (approve lead pool
--     0 — semuanya Vendi 75/Den 2; approve TOP/handover 0; pilih penawaran PRF
--     0), nol bawahan di reports_to (ia lapor ke Vendi seperti 6 sales exec
--     lain), profil kerja = sales exec (24 akun, 40 inquiry, 18 quotation,
--     28 PRF), roster KAM sudah memuat 'sales'. Kasus yang sama dengan
--     finance_controller = 7 (20260911000004). Kalau kelak AE harus mengelola
--     akun orang lain: satu UPDATE roles SET level yang disadari.
--   • bd_digital_marketing_spv = 7 dan TANPA default menu: nol jejak transaksi
--     CRM/PRF/SO. Pemegangnya Muhammad faris el islami (Junior Manager BD, kini
--     role 'manager' level 4) → pindah ke role ini = PENYEMPITAN hak yang
--     disadari (kehilangan manager-ke-atas).
--   • bd_sales_executive gabungan: nol alasan sistem untuk dipecah per tim —
--     tak ada kolom tim/stream yang dibaca RLS, menu & gate identik.
--
-- ── KATALOG MENU (role_menu_permissions produksi, 12 Sep 2026) ─────────────
--   Default role 'sales' hanya 8 key, semua 'view': crm_activity_log ·
--   crm_calls · crm_lead_pool · crm_rate_list · crm_sales_order ·
--   proc_inquiry_fwd_msi · proc_prf · report_mom.
--   Menu CRM INTI (crm_dashboard / crm_pipeline / crm_prospects / crm_inquiry /
--   crm_quotation / crm_customers) di PRODUKSI bukan default role, melainkan
--   OVERRIDE PER-USER (36 baris × 7 user sales; default role hanya admin:view di
--   2 key). Staging berbeda ('sales' punya default 14 key) — drift seeding.
--   Keputusan Den (12 Sep 2026, #4): ke-6 key CRM inti di-seed sebagai DEFAULT
--   ROLE untuk 4 role penjual → produksi sejajar staging, tak lagi bergantung
--   override. Override yang ada tetap berlaku dan menang (termasuk 1 deny
--   Nurul crm_customers:create) — override milik ORANG, ikut pindah bersama
--   pemegangnya saat roster berganti.
--   Hanya aksi 'view' — satu-satunya aksi yang dievaluasi FE untuk key ini.
--
-- ── KEPUTUSAN LAIN (Den, 12 Sep 2026) ──────────────────────────────────────
--   - Pembuatan role DICATAT DI MIGRASI (Blok 0), pola Procurement.
--   - Role 'sales' lama dibiarkan DORMANT; 8 default lamanya tidak dicabut
--     (preseden 'hrga'/'procurement').
--   - super_admin tidak di-seed (bypass hasMenuPermission; preseden 20260809000001).
--   - Roster final (manual Den, sesudah A & FE-1): Endang → bd_sales_spv_console
--     (cabut 'manager') · Martin → bd_account_executive · Nurul/Rossy/Suhana/
--     Maria/Ayu/Gusti → bd_sales_executive · Faris → bd_digital_marketing_spv
--     (dari 'manager') · bd_sales_spv_forwarding 0 pemegang.
--
-- ── URUTAN DEPLOY (penting — 7 user aktif, alur harian) ────────────────────
--   A (file ini) → FE-1 (gate & konstanta, ADITIF: kode baru ditambah, 'sales'
--   dipertahankan sementara) → roster manual → B (helper + prf_insert &
--   sales_orders_insert) → FE-2 (roster CRM + TD-209, cabut 'sales' dari FE).
--   File ini aman kapan saja: efeknya 5 role di katalog + 56 baris di matriks
--   RoleDefaultsPage/UserEditPage; belum ada pemegang. FE-1 WAJIB sebelum
--   roster: tanpa itu pemegang role baru kehilangan mode "sales-only"
--   (ProspectFormPage berhenti meng-assign prospek baru ke diri sendiri) dan
--   tombol Buat PRF (canCreatePRF). B WAJIB sesudah roster: helper-nya tidak
--   memuat 'sales' → kalau mendahului, sales lama tak bisa membuat PRF/SO.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi, catat angkanya (dipakai V3).
--      Baca-saja 12 Sep 2026: PRODUKSI role_menu_permissions 113 · STAGING 106;
--      roles bd_* 0 di keduanya.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT (SELECT count(*) FROM public.role_menu_permissions) AS rmp_sebelum,
       (SELECT count(*) FROM public.roles WHERE code LIKE 'bd_%') AS roles_bd_sebelum;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Blok 0 — lima role baru. roles_code_unique → idempoten. company_id NULL
-- (roles global), is_system_role false, level WAJIB eksplisit.
INSERT INTO public.roles (code, name, description, is_system_role, is_active, company_id, level)
VALUES
  ('bd_sales_spv_console', 'Sales Supervisor Console',
   'BD — Sales Supervisor tim Sales Executive Console. Level 6 (manager ke atas) = lihat & kelola data '
   'sales SELURUH entitas, bukan per-tim (sistem tanpa predikat tim). Pilot 3 pecah role, migrasi 20260912000005.',
   false, true, NULL, 6),
  ('bd_sales_spv_forwarding', 'Sales Supervisor Forwarding',
   'BD — Sales Supervisor tim Sales Executive Forwarding. Level 6 (manager ke atas) = lihat & kelola data '
   'sales SELURUH entitas, bukan per-tim. Pilot 3 pecah role, migrasi 20260912000005.',
   false, true, NULL, 6),
  ('bd_account_executive', 'Account Executive',
   'BD — Account Executive. Level 7 (staf): grade "Manager" di org chart bukan kebutuhan sistem — nol '
   'wewenang manajerial di data (bukti 12 Sep 2026). Pilot 3 pecah role, migrasi 20260912000005.',
   false, true, NULL, 7),
  ('bd_digital_marketing_spv', 'Digital Marketing Supervisor',
   'BD — Digital Marketing Supervisor. Level 7, tanpa default menu CRM/PRF/SO (nol jejak transaksi). '
   'Pilot 3 pecah role, migrasi 20260912000005.',
   false, true, NULL, 7),
  ('bd_sales_executive', 'Sales Executive',
   'BD — gabungan Sales Executive Project/Storbit/Console/Forwarding + Sales Staff (staf tanpa supervisi). '
   'Level 7 = setara role sales lama (kini dormant). Pilot 3 pecah role, migrasi 20260912000005.',
   false, true, NULL, 7)
ON CONFLICT (code) DO NOTHING;

-- Blok 1 — 14 key × 4 role penjual, aksi 'view' → 56 baris.
--   8 key = default 'sales' hari ini · 6 key = CRM inti (keputusan #4).
--   bd_digital_marketing_spv SENGAJA tidak ada (keputusan #3).
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM (VALUES
  ('crm_activity_log'), ('crm_calls'), ('crm_lead_pool'), ('crm_rate_list'),
  ('crm_sales_order'), ('proc_inquiry_fwd_msi'), ('proc_prf'), ('report_mom'),
  ('crm_dashboard'), ('crm_pipeline'), ('crm_prospects'), ('crm_inquiry'),
  ('crm_quotation'), ('crm_customers')
) AS v(key)
JOIN public.module_menus mm ON mm.key = v.key
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
JOIN public.roles r ON r.code IN ('bd_sales_executive','bd_account_executive',
                                  'bd_sales_spv_console','bd_sales_spv_forwarding')
                   AND r.deleted_at IS NULL AND r.is_active = true
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — lima role baru. DIHARAPKAN: 2 × level 6 (spv_console, spv_forwarding),
--      3 × level 7 (account_executive, digital_marketing_spv, sales_executive);
--      semua is_active, company_id NULL, deleted_at NULL.
SELECT code, name, level, is_active, company_id, deleted_at
FROM   public.roles WHERE code LIKE 'bd_%' ORDER BY level, code;

-- V2 — izin per key untuk role bd_*. DIHARAPKAN 14 baris, n = 4 tiap key
--      (bd_account_executive,bd_sales_executive,bd_sales_spv_console,bd_sales_spv_forwarding),
--      total 56; bd_digital_marketing_spv tidak muncul di mana pun.
SELECT mm.key, count(*) AS n, string_agg(r.code::text, ',' ORDER BY r.code) AS roles
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id AND ma.action = 'view'
JOIN   public.module_menus mm ON mm.id = ma.menu_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  r.code LIKE 'bd_%'
GROUP  BY mm.key ORDER BY mm.key;

-- V3 — baris lama tak tersentuh: total = V0 + 56 (produksi 169, staging 162);
--      'sales' masih di 8 key lamanya (dormant, tidak dicabut).
SELECT (SELECT count(*) FROM public.role_menu_permissions) AS total_sesudah,
       (SELECT count(*) FROM public.role_menu_permissions p JOIN public.roles r ON r.id = p.role_id
         WHERE r.code = 'sales') AS sales_lama_tetap_8;

-- V4 — nol baris non-'view', nol baris super_admin, nol baris DM. DIHARAPKAN 0.
SELECT count(*) AS nyangkut
FROM   public.role_menu_permissions p
JOIN   public.menu_actions ma ON ma.id = p.menu_action_id
JOIN   public.roles r ON r.id = p.role_id
WHERE  (r.code LIKE 'bd_%' AND ma.action <> 'view')
   OR  r.code = 'bd_digital_marketing_spv'
   OR  (r.code = 'super_admin' AND ma.menu_id IN (
          SELECT id FROM public.module_menus WHERE key IN (
            'crm_activity_log','crm_calls','crm_lead_pool','crm_rate_list','crm_sales_order',
            'proc_inquiry_fwd_msi','proc_prf','report_mom','crm_dashboard','crm_pipeline',
            'crm_prospects','crm_inquiry','crm_quotation','crm_customers')));


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser) — sesudah FE-1 mendarat DAN roster dipindah:
--   1. Rossy (bd_sales_executive): sidebar CRM lengkap (Dashboard/Pipeline/
--      Prospek/Inquiry/Quotation/Customers/Lead Pool/Aktivitas/Rate List/
--      Sales Order + PRF/Forwarding MSI + MOM) — persis seperti saat 'sales'.
--      Buat prospek → assignee otomatis diri sendiri (isSalesOnly, FE-1).
--      Tombol Buat PRF terlihat (canCreatePRF, FE-1) — TULISNYA baru lolos
--      sesudah B (RLS prf_insert).
--   2. Endang (bd_sales_spv_console): CRM Dashboard mode TIM (bukan personal),
--      daftar prospek/inquiry semua sales + dropdown filter sales muncul.
--   3. Martin (bd_account_executive): mode PERSONAL — hanya miliknya.
--   4. Faris (bd_digital_marketing_spv): nol menu CRM dari role; override
--      per-user lamanya (service_asset) tetap.
--   5. RoleDefaultsPage: 4 role penjual × 14 centang view; DM kosong.
-- =============================================================================


-- =============================================================================
-- ROLLBACK (hanya bila diperlukan; sebelum roster dipindah) — urutan penting:
-- role_menu_permissions.role_id ON DELETE CASCADE, user_roles menahan DELETE roles.
-- =============================================================================
-- DELETE FROM public.role_menu_permissions p USING public.roles r
--   WHERE r.id = p.role_id AND r.code LIKE 'bd_%';
-- DELETE FROM public.roles WHERE code LIKE 'bd_%'
--   AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.role_id = roles.id);
