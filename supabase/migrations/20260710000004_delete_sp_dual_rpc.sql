-- ============================================================================
-- Hapus SP konsisten — RPC delete_sp_dual (dual-table + 2 guard)
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-10.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: Bug hapus SP — jalur delete lama CUMA menghapus sp_items (legacy),
--   sedangkan sp_orders (kanonik) + sp_order_items nyangkut → tak bisa bikin
--   ulang SP nomor sama (UNIQUE customer_id,sp_no). Selain itu delete lama tak
--   pakai customer_id → bisa menghapus sp_items customer LAIN yang bernomor
--   sama (CRITICAL). RPC ini menghapus DUAL-TABLE atomik, di-kunci komposit
--   (customer_id, sp_no), dengan 2 guard:
--     (1) is_super_admin()  — hanya super_admin (bukan pintu belakang; RPC
--         SECURITY DEFINER bypass RLS sp_orders_delete yang super-only, TAPI
--         guard ini tetap membatasi pemanggil).
--     (2) status = 'DRAFT'  — SP jalan/selesai tak boleh dihapus (pakai
--         CANCELLED via set_sp_status). Strict: row kanonik tak ada ATAU
--         status != DRAFT → RAISE.
--   sp_order_items ikut terhapus via FK sp_order_items_sp_order_id_fkey
--   ON DELETE CASCADE.
--
-- VERIFIKASI (saat eksekusi manual): pg_get_functiondef memuat is_super_admin
--   (pos 256) + DRAFT (pos 383); prosecdef = true.
--
-- ⚠️ schema_snapshot.sql STALE setelah eksekusi ini (belum memuat RPC
--    delete_sp_dual). Refresh via pg_dump.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_sp_dual(p_customer_id uuid, p_sp_no text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_status text;
BEGIN
  -- Guard 1: hanya super_admin (jangan pintu belakang)
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Hanya super_admin yang boleh menghapus SP';
  END IF;

  -- Guard 2 (STRICT): hanya DRAFT. Row kanonik tak ada ATAU status != DRAFT → tolak.
  SELECT status INTO v_status
  FROM sp_orders
  WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;

  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'SP % hanya bisa dihapus saat DRAFT (status: %)',
      p_sp_no, COALESCE(v_status, 'TIDAK ADA');
  END IF;

  -- Kanonik (sp_order_items ikut via FK ON DELETE CASCADE) + legacy.
  DELETE FROM sp_orders WHERE customer_id = p_customer_id AND sp_no = p_sp_no;
  DELETE FROM sp_items  WHERE customer_id = p_customer_id AND sp_no = p_sp_no;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.delete_sp_dual(uuid, text) TO authenticated;
