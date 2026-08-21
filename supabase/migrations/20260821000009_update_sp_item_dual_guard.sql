-- =============================================================================
-- Migration: 20260821000006_update_sp_item_dual_guard
-- Task 6 — tutup gap otorisasi update_sp_item_dual (Edit Item SP).
--
-- ⚠️ BELUM DIJALANKAN. Dijalankan manual di SQL Editor oleh Den.
--
-- MASALAH: RPC ini SECURITY DEFINER dengan NOL pengecekan otorisasi dan
--   GRANT ALL TO authenticated. Ia menulis qty / unit_price / shipping_price
--   ke sp_items DAN sp_order_items — qty adalah dasar perhitungan invoice
--   (guard Sigma-shipped=Sigma-qty di create_invoice), jadi setiap user login
--   bisa menggeser dasar tagihan.
--
-- SUMBER: body diambil TERPROGRAM dari schema_snapshot.sql. Perubahan = blok
--   guard + 1 var DECLARE + 1 SELECT (company_id belum tersedia di fungsi ini)
--   dan CREATE FUNCTION -> CREATE OR REPLACE FUNCTION.
--
-- CATATAN: sp_items.company_id dipakai sebagai sumber company (bukan hardcode),
--   jadi guard ini TIDAK menambah utang TD-178.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_sp_item_dual(p_id uuid, p_item jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_rec sp_items%ROWTYPE; v_company uuid;
BEGIN
  v_rec := jsonb_populate_record(null::sp_items, p_item);
  SELECT si.company_id INTO v_company FROM sp_items si WHERE si.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item SP tidak ditemukan.'; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah item SP ini';
  END IF;

  UPDATE sp_items SET
    sp_date = v_rec.sp_date, sp_no = v_rec.sp_no, customer_id = v_rec.customer_id,
    product_id = v_rec.product_id, product_name = v_rec.product_name, sku = v_rec.sku,
    qty = v_rec.qty, shipped_qty = v_rec.shipped_qty,
    exp_date = v_rec.exp_date, expired_date = v_rec.expired_date, dc = v_rec.dc,
    shipping_date = v_rec.shipping_date, sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date, arrival_date = v_rec.arrival_date,
    unit_price = v_rec.unit_price, shipping_price = v_rec.shipping_price,
    inv = v_rec.inv, fp = v_rec.fp, submit = v_rec.submit, kirim = v_rec.kirim,
    submit_date = v_rec.submit_date, email_status = v_rec.email_status, notes = v_rec.notes,
    updated_at = now()
  WHERE id = p_id;

  UPDATE sp_order_items SET
    qty = v_rec.qty,
    sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date,
    shipping_price = v_rec.shipping_price,
    notes = v_rec.notes,
    updated_at = now()
  WHERE legacy_sp_item_id = p_id;
END; $$;
