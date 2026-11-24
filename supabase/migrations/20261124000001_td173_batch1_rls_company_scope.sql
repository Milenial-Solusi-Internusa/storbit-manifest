-- =============================================================================
-- Migration: 20261124000001_td173_batch1_rls_company_scope
-- Phase:     TD-173 (08_TECH_DEBT.md) -- 19 tabel RLS USING(true) yang
--            ditemukan 7 Agu 2026. Diukur ulang 24 Nov 2026 langsung ke
--            pg_policies production: 10 dari 19 sudah dibenahi pekerjaan
--            lain sejak itu (TD-281, TD-301, dkk) -- sisanya 11 tabel yang
--            genuinely masih USING(true)/setara jadi scope BATCH 1 ini.
--
--            Dikeluarkan dari batch ini (keputusan Den 24 Nov 2026):
--            - audit_logs: 723 baris company_id NULL belum diinvestigasi,
--              butuh PLAN kecil terpisah.
--            - warehouses, rate_sheets: follow-up terpisah, belum sekarang.
--
-- Status:    LIVE staging DAN production (24 Nov 2026) -- 11 tabel, tiap tabel
--            diapply sebagai transaksi terpisah, diverifikasi satu-satu via
--            pg_policies sesudahnya (produksi), plus V-PRA/V-POST rollback-test
--            penuh di staging sebelum apply sungguhan. Nol kegagalan.
-- RELEASE-PACKAGE:  pra (sudah dieksekusi manual kedua lingkungan)
-- DEPENDS-ON:       tidak ada
-- PROBE:            SELECT COALESCE((SELECT qual LIKE '%get_user_company_ids%' FROM pg_policies WHERE schemaname='public' AND tablename='sp_items' AND policyname='sp_items_read'), false);
--
-- -- Pola yang dipakai (lihat PLAN TD-173 yang direview Den 24 Nov 2026) ----
-- READ   : is_super_admin() OR company_id IN (SELECT get_user_company_ids())
--          -- untuk tabel tanpa company_id langsung: EXISTS ke parent yang
--          -- company_id-nya dicek di dalam EXISTS.
-- WRITE  : is_super_admin() OR (is_sp_item_writer() AND <company scope>)
--          -- is_sp_item_writer() dipakai KONSISTEN di seluruh rantai
--          -- Storbit SP/Fulfillment (BUKAN is_manager_or_above()) karena
--          -- ia sengaja mengecualikan ceo/gm/gm_bd sebagai view-only
--          -- (keputusan Den 2 Sep 2026, sudah dipakai sp_items_delete).
-- DELETE : is_super_admin() saja (pola sp_orders/sp_order_items/sp_btb).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. sp_items (1.131 baris, live) -- TIDAK punya company_id langsung,
--    company scope lewat customer_id -> accounts.company_id
-- =============================================================================
DROP POLICY IF EXISTS sp_items_read ON sp_items;
CREATE POLICY sp_items_read ON sp_items FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM accounts a WHERE a.id = sp_items.customer_id
      AND a.company_id IN (SELECT get_user_company_ids())
  )
);

DROP POLICY IF EXISTS sp_items_insert ON sp_items;
CREATE POLICY sp_items_insert ON sp_items FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = sp_items.customer_id
        AND a.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS sp_items_update ON sp_items;
CREATE POLICY sp_items_update ON sp_items FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = sp_items.customer_id
        AND a.company_id IN (SELECT get_user_company_ids())
    )
  )
)
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = sp_items.customer_id
        AND a.company_id IN (SELECT get_user_company_ids())
    )
  )
);
-- sp_items_delete TIDAK disentuh -- sudah is_super_admin() OR is_sp_item_writer().

-- =============================================================================
-- 2. sp_btbs (JAMAK -- 206 baris, MATI sejak 8 Jul 2026, TD-306 kandidat
--    DROP). Nol FK, nol penulis aktif -- dikunci penuh, bukan didesain ulang.
-- =============================================================================
DROP POLICY IF EXISTS sp_btbs_read ON sp_btbs;
CREATE POLICY sp_btbs_read ON sp_btbs FOR SELECT TO authenticated
USING (is_super_admin());

DROP POLICY IF EXISTS sp_btbs_insert ON sp_btbs;
CREATE POLICY sp_btbs_insert ON sp_btbs FOR INSERT TO authenticated
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS sp_btbs_update ON sp_btbs;
CREATE POLICY sp_btbs_update ON sp_btbs FOR UPDATE TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS sp_btbs_delete ON sp_btbs;
CREATE POLICY sp_btbs_delete ON sp_btbs FOR DELETE TO authenticated
USING (is_super_admin());

-- =============================================================================
-- 3. picking_lists (862 baris, live; company_id langsung, 0 NULL)
-- =============================================================================
DROP POLICY IF EXISTS picking_lists_read ON picking_lists;
CREATE POLICY picking_lists_read ON picking_lists FOR SELECT TO authenticated
USING (is_super_admin() OR company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS picking_lists_insert ON picking_lists;
CREATE POLICY picking_lists_insert ON picking_lists FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS picking_lists_update ON picking_lists;
CREATE POLICY picking_lists_update ON picking_lists FOR UPDATE TO authenticated
USING (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())))
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS picking_lists_delete ON picking_lists;
CREATE POLICY picking_lists_delete ON picking_lists FOR DELETE TO authenticated
USING (is_super_admin());

-- =============================================================================
-- 4. picking_list_items (1.305 baris, live; anak picking_lists)
-- =============================================================================
DROP POLICY IF EXISTS pli_read ON picking_list_items;
CREATE POLICY pli_read ON picking_list_items FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_items.picking_list_id
      AND pl.company_id IN (SELECT get_user_company_ids())
  )
);

DROP POLICY IF EXISTS pli_insert ON picking_list_items;
CREATE POLICY pli_insert ON picking_list_items FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_items.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS pli_update ON picking_list_items;
CREATE POLICY pli_update ON picking_list_items FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_items.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
)
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_items.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS pli_delete ON picking_list_items;
CREATE POLICY pli_delete ON picking_list_items FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_items.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
);

-- =============================================================================
-- 5. picking_list_materials (0 baris, fitur belum pernah dipakai; anak
--    picking_lists -- pola identik picking_list_items)
-- =============================================================================
DROP POLICY IF EXISTS plm_read ON picking_list_materials;
CREATE POLICY plm_read ON picking_list_materials FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_materials.picking_list_id
      AND pl.company_id IN (SELECT get_user_company_ids())
  )
);

DROP POLICY IF EXISTS plm_insert ON picking_list_materials;
CREATE POLICY plm_insert ON picking_list_materials FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_materials.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS plm_update ON picking_list_materials;
CREATE POLICY plm_update ON picking_list_materials FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_materials.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
)
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_materials.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS plm_delete ON picking_list_materials;
CREATE POLICY plm_delete ON picking_list_materials FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM picking_lists pl WHERE pl.id = picking_list_materials.picking_list_id
        AND pl.company_id IN (SELECT get_user_company_ids())
    )
  )
);

-- =============================================================================
-- 6. delivery_notes (862 baris, live; company_id langsung, 0 NULL)
-- =============================================================================
DROP POLICY IF EXISTS dn_read ON delivery_notes;
CREATE POLICY dn_read ON delivery_notes FOR SELECT TO authenticated
USING (is_super_admin() OR company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS dn_insert ON delivery_notes;
CREATE POLICY dn_insert ON delivery_notes FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS dn_update ON delivery_notes;
CREATE POLICY dn_update ON delivery_notes FOR UPDATE TO authenticated
USING (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())))
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS dn_delete ON delivery_notes;
CREATE POLICY dn_delete ON delivery_notes FOR DELETE TO authenticated
USING (is_super_admin());

-- =============================================================================
-- 7. delivery_note_items (1.297 baris, live; anak delivery_notes)
-- =============================================================================
DROP POLICY IF EXISTS dni_read ON delivery_note_items;
CREATE POLICY dni_read ON delivery_note_items FOR SELECT TO authenticated
USING (
  is_super_admin()
  OR EXISTS (
    SELECT 1 FROM delivery_notes dn WHERE dn.id = delivery_note_items.delivery_note_id
      AND dn.company_id IN (SELECT get_user_company_ids())
  )
);

DROP POLICY IF EXISTS dni_insert ON delivery_note_items;
CREATE POLICY dni_insert ON delivery_note_items FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM delivery_notes dn WHERE dn.id = delivery_note_items.delivery_note_id
        AND dn.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS dni_update ON delivery_note_items;
CREATE POLICY dni_update ON delivery_note_items FOR UPDATE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM delivery_notes dn WHERE dn.id = delivery_note_items.delivery_note_id
        AND dn.company_id IN (SELECT get_user_company_ids())
    )
  )
)
WITH CHECK (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM delivery_notes dn WHERE dn.id = delivery_note_items.delivery_note_id
        AND dn.company_id IN (SELECT get_user_company_ids())
    )
  )
);

DROP POLICY IF EXISTS dni_delete ON delivery_note_items;
CREATE POLICY dni_delete ON delivery_note_items FOR DELETE TO authenticated
USING (
  is_super_admin()
  OR (
    is_sp_item_writer()
    AND EXISTS (
      SELECT 1 FROM delivery_notes dn WHERE dn.id = delivery_note_items.delivery_note_id
        AND dn.company_id IN (SELECT get_user_company_ids())
    )
  )
);

-- =============================================================================
-- 8. product_warehouse_location (0 baris, fitur belum pernah dipakai;
--    company_id langsung, 0 NULL)
-- =============================================================================
DROP POLICY IF EXISTS pwl_read ON product_warehouse_location;
CREATE POLICY pwl_read ON product_warehouse_location FOR SELECT TO authenticated
USING (is_super_admin() OR company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS pwl_insert ON product_warehouse_location;
CREATE POLICY pwl_insert ON product_warehouse_location FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS pwl_update ON product_warehouse_location;
CREATE POLICY pwl_update ON product_warehouse_location FOR UPDATE TO authenticated
USING (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())))
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS pwl_delete ON product_warehouse_location;
CREATE POLICY pwl_delete ON product_warehouse_location FOR DELETE TO authenticated
USING (is_super_admin());

-- =============================================================================
-- 9. stock_ledger (1.367 baris, live; company_id langsung, 0 NULL).
--    stock_ledger_modify (UPDATE) TIDAK disentuh -- sudah is_super_admin()
--    only, benar.
-- =============================================================================
DROP POLICY IF EXISTS stock_ledger_select ON stock_ledger;
CREATE POLICY stock_ledger_select ON stock_ledger FOR SELECT TO authenticated
USING (is_super_admin() OR company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS stock_ledger_insert ON stock_ledger;
CREATE POLICY stock_ledger_insert ON stock_ledger FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (is_sp_item_writer() AND company_id IN (SELECT get_user_company_ids())));

-- =============================================================================
-- 10. contacts (1.020 baris, live; SUDAH punya company_id sendiri, 0 NULL).
--     contacts_delete (is_super_admin() saja) TIDAK disentuh -- sudah benar.
--     INSERT ditambah pengecekan company_id KONSISTEN dengan accounts induk
--     (menutup persis celah yang disebut TD-173: EXISTS-to-parent tanpa cek
--     company_id di dalamnya).
-- =============================================================================
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT TO authenticated
USING (is_super_admin() OR company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin()
  OR (
    company_id IN (SELECT get_user_company_ids())
    AND EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = contacts.account_id
        AND a.company_id = contacts.company_id
    )
  )
);

DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts FOR UPDATE TO authenticated
USING (is_super_admin() OR company_id IN (SELECT get_user_company_ids()));

-- =============================================================================
-- 11. app_settings (0 baris, role-gated tapi tanpa cek company sama sekali)
-- =============================================================================
DROP POLICY IF EXISTS app_settings_read ON app_settings;
CREATE POLICY app_settings_read ON app_settings FOR SELECT TO authenticated
USING (is_super_admin() OR (is_admin_or_above() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS app_settings_write ON app_settings;
CREATE POLICY app_settings_write ON app_settings FOR INSERT TO authenticated
WITH CHECK (is_super_admin() OR (is_admin_or_above() AND company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS app_settings_update ON app_settings;
CREATE POLICY app_settings_update ON app_settings FOR UPDATE TO authenticated
USING (is_super_admin() OR (is_admin_or_above() AND company_id IN (SELECT get_user_company_ids())));

COMMIT;
