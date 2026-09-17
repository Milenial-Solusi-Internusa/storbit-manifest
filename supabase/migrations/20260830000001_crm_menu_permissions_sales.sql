-- =============================================================================
-- Migration: 20260830000001_crm_menu_permissions_sales
-- Batch:     CRM v3 — Batch Dashboard, temuan tes Vercel Preview
-- Depends:   modules · module_menus · menu_actions · roles · role_menu_permissions
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- MASALAH
--   Akun role `sales` tidak melihat menu Dashboard, Pipeline, Inquiry,
--   Quotation, Customer, dan tab Prospects di CRM. Bukan bug frontend.
--
--   `canSeeMenuItem` (App.jsx) memeriksa MENU_KEY_MAP LEBIH DULU daripada
--   `item.role`, jadi menu yang punya menuKey SEPENUHNYA ditentukan oleh
--   `hasMenuPermission(key,'view')` — array role-nya tidak pernah dilihat.
--   `hasMenuPermission` (AuthContext.jsx) berakhir DEFAULT-DENY: super_admin
--   bypass → user_menu_permissions → role_menu_permissions → false.
--
--   Enam menuKey CRM granular itu tak punya baris `role_menu_permissions`
--   untuk role `sales`, jadi keenamnya ditolak. Menu CRM lain (Lead Pool,
--   Sales Order, Aktivitas) TIDAK punya menuKey sehingga jatuh ke array role
--   yang memang memuat 'sales' — itulah kenapa hanya sebagian menu yang hilang,
--   dan sekaligus bukti bahwa role akunnya sudah benar.
--
-- SCOPE — SENGAJA `sales` SAJA (keputusan Den 30 Agu 2026)
--   ⚠️ Ini BUKAN berarti role lain sudah beres. Kalau manager/ceo/gm/supervisor
--   juga belum punya baris untuk keenam key ini, mereka mengalami hal yang sama
--   dan belum ketahuan karena pengujian sehari-hari memakai super_admin yang
--   selalu bypass. Perluasan ke role lain = keputusan terpisah, jangan
--   ditambahkan diam-diam di sini.
--
-- POLA: disalin dari 20260809000001_picking_surat_jalan_menu_permissions.sql —
--   satu-satunya seed permission granular di repo ini yang sudah terbukti jalan.
--   `roles` TIDAK difilter company_id: sejak globalisasi 21 Agu 2026 baris role
--   global ber-company_id NULL, memfilternya mengembalikan NOL baris tanpa error
--   (03_DATA_MODEL.md gotcha #18).
--
-- IDEMPOTEN: seluruh INSERT memakai ON CONFLICT DO NOTHING, aman dijalankan
--   berulang. Tidak ada UPDATE/DELETE — migrasi ini hanya menambah grant.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PRA-CEK — jalankan DULU, hasilnya menentukan apakah BAGIAN A perlu
-- ═════════════════════════════════════════════════════════════════════════════
-- SELECT mm.key, mm.label, ma.action, ma.is_active
-- FROM module_menus mm
-- LEFT JOIN menu_actions ma ON ma.menu_id = mm.id
-- WHERE mm.key IN ('crm_dashboard','crm_pipeline','crm_prospects',
--                  'crm_inquiry','crm_quotation','crm_customers')
-- ORDER BY mm.key, ma.action;
--
--   • 6 key hadir + action 'view'  → LEWATI BAGIAN A, langsung BAGIAN B.
--   • ada key yang hilang          → jalankan BAGIAN A lebih dulu.


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN A — katalog menu (HANYA kalau pra-cek menunjukkan ada key yang hilang)
-- ═════════════════════════════════════════════════════════════════════════════
-- module_id diturunkan dari menu crm_* yang SUDAH ada supaya tidak perlu menebak
-- nilai `modules.key`. Kalau belum ada satu pun menu crm_*, sub-select pertama
-- NULL dan jatuh ke `modules.key = 'crm'`; kalau ITU pun tak cocok, INSERT ini
-- menyisipkan NOL baris (bukan error) — periksa `SELECT id, key, label FROM
-- modules;` lalu sesuaikan.
WITH crm_module AS (
  SELECT COALESCE(
    (SELECT module_id FROM module_menus WHERE key LIKE 'crm\_%' LIMIT 1),
    (SELECT id FROM modules WHERE key = 'crm' LIMIT 1)
  ) AS id
)
INSERT INTO module_menus (module_id, key, label, sort_order, is_active)
SELECT cm.id, v.key, v.label, 0, true
FROM crm_module cm
CROSS JOIN (VALUES
  ('crm_dashboard', 'Dashboard'),
  ('crm_pipeline',  'Pipeline'),
  ('crm_prospects', 'Prospects'),
  ('crm_inquiry',   'Inquiry'),
  ('crm_quotation', 'Quotation'),
  ('crm_customers', 'Customer')
) AS v(key, label)
WHERE cm.id IS NOT NULL
ON CONFLICT (key) DO NOTHING;

INSERT INTO menu_actions (menu_id, action, is_active)
SELECT mm.id, 'view', true
FROM module_menus mm
WHERE mm.key IN ('crm_dashboard','crm_pipeline','crm_prospects',
                 'crm_inquiry','crm_quotation','crm_customers')
ON CONFLICT (menu_id, action) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN B — grant 'view' keenam menu CRM ke role `sales`  ← INTI PERBAIKAN
-- ═════════════════════════════════════════════════════════════════════════════
-- ON CONFLICT menyebut predikat WHERE-nya karena unique index-nya PARSIAL
-- (role_menu_permissions_role_menu_action_unique ... WHERE menu_action_id IS NOT NULL).
-- Tanpa predikat itu Postgres menolak dengan "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
INSERT INTO role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM roles r
JOIN menu_actions ma ON ma.action = 'view' AND ma.is_active = true
JOIN module_menus mm ON mm.id = ma.menu_id AND mm.is_active = true
WHERE r.code = 'sales'
  AND r.deleted_at IS NULL
  AND r.is_active = true
  AND mm.key IN ('crm_dashboard','crm_pipeline','crm_prospects',
                 'crm_inquiry','crm_quotation','crm_customers')
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — jalankan SESUDAHNYA
-- ═════════════════════════════════════════════════════════════════════════════
-- SELECT mm.key, ma.action, r.code
-- FROM role_menu_permissions rmp
-- JOIN roles r         ON r.id  = rmp.role_id
-- JOIN menu_actions ma ON ma.id = rmp.menu_action_id
-- JOIN module_menus mm ON mm.id = ma.menu_id
-- WHERE r.code = 'sales' AND mm.key LIKE 'crm\_%'
-- ORDER BY mm.key;
--   HARAPAN: 6 baris (crm_customers, crm_dashboard, crm_inquiry, crm_pipeline,
--            crm_prospects, crm_quotation) — semuanya action 'view'.
--
-- ⚠️ Sesudah ini, LOGOUT-LOGIN akun sales: roleMenuPermissions dibaca sekali
--    saat AuthContext memuat sesi, jadi refresh halaman saja belum tentu cukup.
--
-- ROLLBACK (kalau perlu dibalik):
--   DELETE FROM role_menu_permissions rmp
--   USING roles r, menu_actions ma, module_menus mm
--   WHERE rmp.role_id = r.id AND rmp.menu_action_id = ma.id AND ma.menu_id = mm.id
--     AND r.code = 'sales'
--     AND mm.key IN ('crm_dashboard','crm_pipeline','crm_prospects',
--                    'crm_inquiry','crm_quotation','crm_customers');
