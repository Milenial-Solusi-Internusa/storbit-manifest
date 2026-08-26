-- =============================================================================
-- Migration: 20260825000001_fix_update_sp_item_dual_company
-- Status:    LIVE — dijalankan 25 Agu 2026 di staging dan produksi, terverifikasi.
--
-- PERBAIKAN 1 — SUMBER company_id (BUG LIVE, BLOCKING)
--   Guard otorisasi 21 Agu 2026 mengambil company dari sp_items.company_id,
--   kolom yang TIDAK PERNAH ADA di sp_items. Akibatnya Edit Item SP,
--   ShipmentModal, dan FinanceModal RUSAK TOTAL. FIX: sumber company dipindah
--   ke sp_orders lewat komposit (customer_id, sp_no), pola sp_issue_btb.
--
-- PERBAIKAN 2 — expired_date DIKELUARKAN dari daftar UPDATE (Opsi B)
--   expired_date = atribut HEADER (tenggat SP harus dikirim), bukan item.
--   Penulis sahnya tinggal INSERT saat create SP, dan set_sp_expired_date
--   (file 20260825000002). exp_date SENGAJA TETAP ADA (isu terpisah, M13).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_sp_item_dual(p_id uuid, p_item jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_rec sp_items%ROWTYPE; v_company uuid;
BEGIN
  v_rec := jsonb_populate_record(null::sp_items, p_item);
  SELECT o.company_id INTO v_company
    FROM sp_items si
    JOIN sp_orders o
      ON o.customer_id = si.customer_id
     AND o.sp_no       = si.sp_no
     AND o.deleted_at IS NULL
   WHERE si.id = p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Item SP tidak ditemukan, atau SP induknya belum ada di sp_orders.';
  END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah item SP ini';
  END IF;
  UPDATE sp_items SET
    sp_date = v_rec.sp_date, sp_no = v_rec.sp_no, customer_id = v_rec.customer_id,
    product_id = v_rec.product_id, product_name = v_rec.product_name, sku = v_rec.sku,
    qty = v_rec.qty, shipped_qty = v_rec.shipped_qty,
    exp_date = v_rec.exp_date, dc = v_rec.dc,
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
