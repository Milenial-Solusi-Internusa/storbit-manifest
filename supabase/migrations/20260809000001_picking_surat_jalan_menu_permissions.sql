-- Task 3 (batch Segera, Access Control): daftarkan Picking List & Surat Jalan
-- ke sistem permission granular (module_menus/menu_actions/role_menu_permissions).
-- Dijalankan manual di SQL Editor 9 Agu 2026. Replikasi akses yang berlaku
-- sebelumnya lewat array role hardcode (super_admin,admin,ceo,gm,manager,operations)
-- ke role_menu_permissions, agar MENU_KEY_MAP bisa disambungkan tanpa regresi akses.

INSERT INTO module_menus (module_id, key, label, sort_order, is_active)
SELECT id, 'logistics_picking', 'Picking List', 0, true FROM modules WHERE key = 'logistics'
ON CONFLICT (key) DO NOTHING;

INSERT INTO module_menus (module_id, key, label, sort_order, is_active)
SELECT id, 'logistics_surat_jalan', 'Surat Jalan', 0, true FROM modules WHERE key = 'logistics'
ON CONFLICT (key) DO NOTHING;

INSERT INTO menu_actions (menu_id, action, is_active)
SELECT id, 'view', true FROM module_menus WHERE key = 'logistics_picking'
ON CONFLICT (menu_id, action) DO NOTHING;

INSERT INTO menu_actions (menu_id, action, is_active)
SELECT id, 'view', true FROM module_menus WHERE key = 'logistics_surat_jalan'
ON CONFLICT (menu_id, action) DO NOTHING;

INSERT INTO role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM roles r
JOIN menu_actions ma ON true
JOIN module_menus mm ON mm.id = ma.menu_id
WHERE r.code IN ('admin','ceo','gm','manager','operations')
  AND r.deleted_at IS NULL AND r.is_active = true
  AND mm.key IN ('logistics_picking','logistics_surat_jalan')
  AND ma.action = 'view'
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;
