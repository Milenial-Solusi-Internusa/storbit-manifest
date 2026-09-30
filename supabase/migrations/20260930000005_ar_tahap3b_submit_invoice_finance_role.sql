-- =============================================================================
-- 20260930000005_ar_tahap3b_submit_invoice_finance_role.sql
-- (AR Tahap 3 bagian kedua, berkas 5 dari 6)
--
-- SATU baris berubah: guard peran + has_role('finance') (keputusan rapat
-- 24 Sep 2026). Status guard TIDAK disentuh -- sudah gaya allowlist
-- (`IF v_status <> 'issued'`), otomatis menolak 'pending_approval' tanpa
-- perubahan apa pun.
--
-- Basis: 20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql (satu-satunya
-- versi submit_invoice yang pernah ada sejak due_date dicabut).
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'submit_invoice' AND pronamespace = 'public'::regnamespace;
  IF v_def IS NULL THEN RAISE EXCEPTION 'PALANG: submit_invoice tidak ada.'; END IF;
  IF v_def NOT LIKE '%cuma invoice "issued" yang bisa di-submit%' THEN
    RAISE EXCEPTION 'PALANG: submit_invoice yang hidup bukan versi 20260929000008 yang diasumsikan.';
  END IF;
  IF v_def LIKE '%has_role(''finance'')%' THEN
    RAISE EXCEPTION 'PALANG: submit_invoice SUDAH memuat has_role(''finance'') -- berkas ini kemungkinan sudah pernah dijalankan.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: submit_invoice = versi 20260929000008, belum menyentuh peran finance.';
END
$palang$;

CREATE OR REPLACE FUNCTION public.submit_invoice(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sp_order_id uuid; v_customer_id uuid; v_sp_no text; v_status text;
  v_company_id uuid; v_invoice_date date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin submit invoice.';
  END IF;

  SELECT sp_order_id, status, company_id, invoice_date
    INTO v_sp_order_id, v_status, v_company_id, v_invoice_date
    FROM sp_invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma invoice "issued" yang bisa di-submit.', v_status;
  END IF;

  SELECT customer_id, sp_no INTO v_customer_id, v_sp_no FROM sp_orders WHERE id = v_sp_order_id;

  -- due_date TIDAK dihitung di sini lagi (AR Tahap 3) -- dasarnya tanggal
  -- TTF, bukan tanggal invoice, dan TTF belum tentu ada saat submit. Ia
  -- dihitung SEKALI oleh mark_ttf_received begitu TTF diterima. Sampai itu
  -- terjadi, due_date tetap NULL dan FE menampilkan "Belum TTF".
  UPDATE sp_invoices SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = p_invoice_id;

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
END; $$;

REVOKE ALL ON FUNCTION public.submit_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_invoice(uuid) IS
  'Versi 20260929000008 + peran finance (AR Tahap 3 bagian kedua, 20260930000005). Guard status TIDAK berubah -- allowlist "issued" saja, otomatis menolak pending_approval.';

COMMIT;

DO $vpost$
DECLARE v_def text; v_acl text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'submit_invoice' AND pronamespace = 'public'::regnamespace;
  IF v_def NOT LIKE '%has_role(''finance'')%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: submit_invoice belum memuat has_role(''finance'').';
  END IF;
  IF v_def LIKE '%v_due_date%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: submit_invoice tidak seharusnya memuat v_due_date.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p WHERE p.proname = 'submit_invoice' AND p.pronamespace = 'public'::regnamespace;
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL submit_invoice salah. ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: submit_invoice memuat peran finance, due_date tetap tidak dihitung, ACL authenticated-only.';
END
$vpost$;

-- =============================================================================
-- ROLLBACK -- tempel ulang badan dari 20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql,
-- REVOKE/GRANT ulang seperti pola di atas.
-- =============================================================================
