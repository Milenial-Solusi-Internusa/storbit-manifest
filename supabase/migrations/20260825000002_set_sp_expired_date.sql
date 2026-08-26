-- =============================================================================
-- Migration: 20260825000002_set_sp_expired_date
-- Status:    LIVE — dijalankan 25 Agu 2026 di staging dan produksi, terverifikasi.
--
-- FREEZE: HANYA 'CANCELLED' (keputusan Den, 25 Agu 2026). SP LUNAS SENGAJA
--   TETAP BOLEH dikoreksi tenggatnya — dibutuhkan untuk audit pinalti historis.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_sp_expired_date(
  p_customer_id  uuid,
  p_sp_no        text,
  p_expired_date date
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sp_order_id uuid; v_company uuid; v_status text;
BEGIN
  IF p_expired_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal expired wajib diisi.';
  END IF;
  SELECT id, company_id, status
    INTO v_sp_order_id, v_company, v_status
    FROM sp_orders
   WHERE customer_id = p_customer_id
     AND sp_no       = p_sp_no
     AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no;
  END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah tenggat SP ini';
  END IF;
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'SP sudah dibatalkan — tenggat tidak bisa diubah.';
  END IF;
  UPDATE sp_orders
     SET expired_date = p_expired_date, updated_at = now()
   WHERE id = v_sp_order_id;
  UPDATE sp_items
     SET expired_date = p_expired_date, updated_at = now()
   WHERE customer_id = p_customer_id
     AND sp_no       = p_sp_no;
END; $$;
ALTER FUNCTION public.set_sp_expired_date(uuid, text, date) OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.set_sp_expired_date(uuid, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_sp_expired_date(uuid, text, date) TO authenticated;
