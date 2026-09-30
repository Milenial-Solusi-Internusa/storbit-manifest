-- =============================================================================
-- 20260930000003_ar_tahap3b_approve_reject_invoice.sql
-- (AR Tahap 3 bagian kedua, berkas 3 dari 6)
--
-- Dua fungsi BARU: approve_invoice_issue (menyetujui) dan reject_invoice_issue
-- (menolak). approve_invoice_issue memindahkan PERSIS blok penomoran yang
-- dicabut dari create_invoice_for_sp di berkas 2 (bukan ditulis ulang dari
-- nol) -- v_entity_code/v_seq/v_month_roman/v_invoice_no, kemudian memanggil
-- post_invoice_journal() dan sp_recompute_status() yang SEBELUM berkas 2 juga
-- dipanggil create_invoice_for_sp di titik yang persis sama secara logis.
--
-- ⛔ TANGGAL JURNAL TIDAK IKUT PINDAH ke tanggal approve. post_invoice_journal
-- (20260928000003_invoice_issue_v2.sql:349-403) membaca entry_date dari
-- invoice_journal_projection(p_invoice_id) (berkas sama:92-227), dan fungsi
-- itu mengisi entry_date SELALU dari dn.signed_date -- tanggal Surat Jalan
-- ditandatangani (baris 142/147/205/212/220/226, loop `FOR dn IN SELECT
-- d.id, d.do_no, d.signed_date FROM delivery_notes d ... ORDER BY
-- d.signed_date`). NOL referensi ke now()/CURRENT_DATE/waktu approve di
-- kedua fungsi itu -- diverifikasi dengan membaca badannya, bukan diasumsikan.
-- Jadi memanggil post_invoice_journal LEBIH LAMBAT (saat approve, bukan saat
-- ajukan) tidak mengubah SATU PUN tanggal jurnal yang dihasilkannya.
--
-- Guard peran approve/reject SENGAJA TANPA is_manager_or_above() -- berbeda
-- dari create_invoice_for_sp/submit_invoice/mark_ttf_received. Approval bukan
-- "manajer mana pun", sesuai keputusan rapat 9/11/24 Sep 2026: penyetuju =
-- finance_controller, pengganti = Finance Controller lain atau CEO.
--
-- Guard "tidak boleh menyetujui/menolak pengajuan sendiri" (jawaban Den,
-- putaran approval PLAN ini): created_by = auth.uid() ditolak KECUALI
-- super_admin. Berlaku untuk approve DAN reject.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sp_invoices' AND column_name = 'approved_by'
  ) THEN
    RAISE EXCEPTION 'PALANG: kolom approved_by belum ada -- jalankan 20260930000001 lebih dulu.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp'
       AND oidvectortypes(p.proargtypes) = 'uuid, date'
       AND pg_get_functiondef(p.oid) LIKE '%''pending_approval''%'
  ) THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp belum versi pending_approval -- jalankan 20260930000002 lebih dulu.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'approve_invoice_issue'
  ) THEN
    RAISE EXCEPTION 'PALANG: approve_invoice_issue SUDAH ADA -- berkas ini kemungkinan sudah pernah dijalankan di DB ini.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: prasyarat berkas 1 dan 2 terpasang, approve_invoice_issue belum ada.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- approve_invoice_issue -- penomoran dipindah VERBATIM dari create_invoice_for_sp
-- versi 20260929000008 (v_entity_code/v_seq/v_month_roman/v_invoice_no), lalu
-- post_invoice_journal() + sp_recompute_status() -- keduanya dipanggil di
-- titik yang sama persis dengan yang dulu dipanggil create_invoice_for_sp.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_invoice_issue(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status       text; v_company_id uuid; v_sp_order_id uuid; v_invoice_date date;
  v_created_by   uuid;
  v_customer_id  uuid; v_sp_no text;
  v_entity_code  text; v_year int; v_month_roman text; v_seq int; v_invoice_no text;
  v_n            int;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller') OR has_role('ceo')) THEN
    RAISE EXCEPTION 'Tidak punya izin menyetujui invoice.';
  END IF;

  SELECT status, company_id, sp_order_id, invoice_date, created_by
    INTO v_status, v_company_id, v_sp_order_id, v_invoice_date, v_created_by
    FROM sp_invoices WHERE id = p_invoice_id AND deleted_at IS NULL
    FOR UPDATE;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma yang menunggu persetujuan yang bisa disetujui.', v_status;
  END IF;

  -- Tidak boleh menyetujui pengajuan sendiri, kecuali super_admin (jawaban
  -- Den, PLAN AR Tahap 3 bagian kedua).
  IF v_created_by = auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Tidak boleh menyetujui invoice yang diajukan sendiri.';
  END IF;

  SELECT customer_id, sp_no INTO v_customer_id, v_sp_no FROM sp_orders WHERE id = v_sp_order_id;
  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_year := extract(year from v_invoice_date)::int;
  v_seq  := increment_document_sequence(v_company_id, 'INV', 'FIN', v_year, 0, 0);
  v_month_roman := CASE extract(month from v_invoice_date)::int
    WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX' WHEN 10 THEN 'X' WHEN 11 THEN 'XI' WHEN 12 THEN 'XII'
  END;
  v_invoice_no := v_entity_code || '-INV-' || v_month_roman || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  UPDATE sp_invoices
     SET invoice_no = v_invoice_no, status = 'issued',
         approved_by = auth.uid(), approved_at = now(), updated_at = now()
   WHERE id = p_invoice_id AND status = 'pending_approval';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Invoice sudah diproses orang lain. Muat ulang halamannya.';
  END IF;

  -- post_invoice_journal membaca entry_date dari invoice_journal_projection,
  -- yang SELALU memakai delivery_notes.signed_date -- lihat catatan tanggal
  -- jurnal di kepala berkas. Memanggilnya di sini (bukan saat ajukan) TIDAK
  -- mengubah satu pun tanggal jurnal yang dihasilkan.
  PERFORM post_invoice_journal(p_invoice_id);
  PERFORM sp_recompute_status(v_customer_id, v_sp_no);

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data)
  VALUES (auth.uid(), v_company_id, 'SETUJUI_INVOICE', 'sp_invoices', p_invoice_id, v_invoice_no,
          jsonb_build_object('status', 'pending_approval'),
          jsonb_build_object('status', 'issued', 'invoice_no', v_invoice_no));
END;
$fn$;

REVOKE ALL ON FUNCTION public.approve_invoice_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_invoice_issue(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_invoice_issue(uuid) TO authenticated;

COMMENT ON FUNCTION public.approve_invoice_issue(uuid) IS
  'Menyetujui invoice pending_approval: lahirkan invoice_no, posting jurnal, sp_recompute_status. Peran: super_admin/finance_controller/ceo, TANPA is_manager_or_above (bukan manajer mana pun). Tidak boleh menyetujui pengajuan sendiri kecuali super_admin. AR Tahap 3 bagian kedua, 20260930000003.';

-- ---------------------------------------------------------------------------
-- reject_invoice_issue -- kembali ke draft + catatan wajib.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_invoice_issue(p_invoice_id uuid, p_rejection_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text; v_company_id uuid; v_created_by uuid; v_sp_no text; v_note text; v_n int;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller') OR has_role('ceo')) THEN
    RAISE EXCEPTION 'Tidak punya izin menolak invoice.';
  END IF;

  v_note := btrim(COALESCE(p_rejection_note, ''));
  IF v_note = '' THEN
    RAISE EXCEPTION 'Catatan penolakan wajib diisi.';
  END IF;

  SELECT i.status, i.company_id, i.created_by, o.sp_no
    INTO v_status, v_company_id, v_created_by, v_sp_no
    FROM sp_invoices i JOIN sp_orders o ON o.id = i.sp_order_id
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL
    FOR UPDATE OF i;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma yang menunggu persetujuan yang bisa ditolak.', v_status;
  END IF;

  -- Tidak boleh menolak pengajuan sendiri, kecuali super_admin -- syarat
  -- yang sama dengan approve_invoice_issue (jawaban Den).
  IF v_created_by = auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Tidak boleh menolak invoice yang diajukan sendiri.';
  END IF;

  UPDATE sp_invoices
     SET status = 'draft', rejected_by = auth.uid(), rejected_at = now(),
         rejection_note = v_note, updated_at = now()
   WHERE id = p_invoice_id AND status = 'pending_approval';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Invoice sudah diproses orang lain. Muat ulang halamannya.';
  END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_company_id, 'TOLAK_INVOICE', 'sp_invoices', p_invoice_id, v_sp_no,
          jsonb_build_object('status', 'pending_approval'),
          jsonb_build_object('status', 'draft', 'rejection_note', v_note),
          v_note);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reject_invoice_issue(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_invoice_issue(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_invoice_issue(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reject_invoice_issue(uuid, text) IS
  'Menolak invoice pending_approval: kembali ke draft + rejection_note wajib. Peran sama dengan approve_invoice_issue; tidak boleh menolak pengajuan sendiri kecuali super_admin. Baris draft ini arsip -- pengajuan ulang lahir sebagai baris BARU lewat create_invoice_for_sp. AR Tahap 3 bagian kedua, 20260930000003.';

COMMIT;

-- ---------------------------------------------------------------------------
-- V-POST
-- ---------------------------------------------------------------------------
DO $vpost$
DECLARE v_acl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'approve_invoice_issue' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'V-POST GAGAL: approve_invoice_issue tidak ada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reject_invoice_issue' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'V-POST GAGAL: reject_invoice_issue tidak ada.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p WHERE p.proname = 'approve_invoice_issue' AND p.pronamespace = 'public'::regnamespace;
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL approve_invoice_issue salah. ACL: %', v_acl;
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p WHERE p.proname = 'reject_invoice_issue' AND p.pronamespace = 'public'::regnamespace;
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL reject_invoice_issue salah. ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: approve_invoice_issue + reject_invoice_issue ada, ACL authenticated-only.';
END
$vpost$;

-- =============================================================================
-- ROLLBACK
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.approve_invoice_issue(uuid);
--   DROP FUNCTION IF EXISTS public.reject_invoice_issue(uuid, text);
--   COMMIT;
--
-- ⚠️ Aman hanya kalau nol baris pending_approval hidup butuh jalur ini --
-- kalau ada, baris itu akan macet permanen di pending_approval sampai fungsi
-- ini ditulis ulang.
-- =============================================================================
