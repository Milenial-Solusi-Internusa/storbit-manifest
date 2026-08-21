-- =============================================================================
-- Migration: 20260821000003_btb_guards
-- Task 3 — tutup gap otorisasi sp_issue_btb / sp_delete_btb.
--
-- ⚠️ BELUM DIJALANKAN. Dijalankan manual di SQL Editor oleh Den.
--
-- MASALAH: kedua RPC ini SECURITY DEFINER (RLS sp_btb DILEWATI) dengan NOL
--   pengecekan otorisasi di body, dan GRANT ALL TO authenticated. Setiap user
--   login bisa menerbitkan/menghapus BTB SP mana pun — dan BTB menggerakkan
--   sp_orders.status ke BTB_TERBIT lewat sp_recompute_status.
--
-- SUMBER: body diambil TERPROGRAM dari supabase/schema_snapshot.sql.
--   Satu-satunya perubahan = blok guard (+ pada sp_delete_btb: 1 var DECLARE
--   dan 1 kolom di SELECT, karena company_id belum tersedia di sana) dan
--   CREATE FUNCTION -> CREATE OR REPLACE FUNCTION. Sisanya byte-identik.
--
-- BENTUK GUARD: menyalin prf_claim (schema_snapshot.sql:1864), dengan satu
--   penyimpangan disengaja — get_user_company_ids() JAMAK, bukan singular
--   (prf_claim ditulis sebelum varian jamak ada; menyalin bentuk singular akan
--   melahirkan utang TD-180 baru).
--
-- CREATE OR REPLACE mempertahankan ACL, SECURITY DEFINER, dan SET search_path.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sp_issue_btb(p_customer_id uuid, p_sp_no text, p_btb_no text, p_qty integer DEFAULT NULL::integer, p_btb_date date DEFAULT NULL::date, p_delivery_note_id uuid DEFAULT NULL::uuid, p_remarks text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid; v_sp_order_id uuid; v_uid uuid := auth.uid();
  v_btb_id uuid; v_existing uuid;
BEGIN
  IF btrim(COALESCE(p_btb_no,'')) = '' THEN
    RAISE EXCEPTION 'Nomor BTB wajib diisi.'; END IF;
  SELECT id, company_id INTO v_sp_order_id, v_company
    FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak menerbitkan BTB untuk SP ini';
  END IF;
  IF p_delivery_note_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM delivery_notes
        WHERE id = p_delivery_note_id AND customer_id = p_customer_id AND sp_no = p_sp_no) THEN
    RAISE EXCEPTION 'Surat jalan bukan milik SP ini.'; END IF;
  SELECT id INTO v_existing FROM sp_btb
   WHERE customer_id = p_customer_id AND btb_no = btrim(p_btb_no) AND deleted_at IS NULL;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO sp_btb (company_id, sp_order_id, delivery_note_id, customer_id,
                      btb_no, btb_date, qty, received_at, received_by, remarks)
  VALUES (v_company, v_sp_order_id, p_delivery_note_id, p_customer_id,
          btrim(p_btb_no), p_btb_date, p_qty, now(), v_uid,
          NULLIF(btrim(COALESCE(p_remarks,'')),''))
  RETURNING id INTO v_btb_id;
  PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  RETURN v_btb_id;
END; $$;

CREATE OR REPLACE FUNCTION public.sp_delete_btb(p_btb_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_cust uuid; v_sp text; v_company uuid;
BEGIN
  SELECT b.customer_id, o.sp_no, o.company_id INTO v_cust, v_sp, v_company
    FROM sp_btb b JOIN sp_orders o ON o.id = b.sp_order_id
   WHERE b.id = p_btb_id AND b.deleted_at IS NULL;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'BTB tidak ditemukan atau sudah dihapus.'; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus BTB ini';
  END IF;
  UPDATE sp_btb SET deleted_at = now() WHERE id = p_btb_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;
