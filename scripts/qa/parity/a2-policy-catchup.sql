-- =============================================================================
-- a2-policy-catchup.sql -- PATCH PARITY STAGING (TD-279, Kelompok A2)
--
-- !!  S T A G I N G   S A J A  --  JANGAN DIJALANKAN DI PRODUCTION  !!
--     Keempat policy di bawah SUDAH begini di production. Tidak masuk doc 12.
--
-- Teks tiap policy DISALIN VERBATIM dari `pg_policies` production (dibaca
-- read-only 27 Sep 2026), lalu diumpankan kembali sebagai sumber, dan V1 di
-- ekor berkas membuktikan hasilnya sama persis.
--
-- -- TIGA POLICY HRGA DIKELUARKAN DARI BERKAS INI (28 Sep 2026) --------------
-- Versi pertama berkas ini juga menyamakan hrga_request_items_insert,
-- hrga_request_items_update, dan hrga_requests_update_draft. Ia GAGAL di V1b,
-- dan kegagalannya menjawab pertanyaan yang sedang kita ajukan:
--
--   sumber yang diberikan  = teks production apa adanya
--   hasil deparse staging  = bentuk STAGING, bukan bentuk production
--
-- Artinya bentuk production TIDAK dihasilkan oleh parser 17.6 -- ia parse tree
-- lama yang tersimpan apa adanya sejak policy itu dibuat di versi server yang
-- lebih tua. Tidak ada teks sumber yang bisa kita tulis hari ini yang
-- menghasilkannya kembali.
--
-- ** Dan itu sekaligus membuktikan hal yang lebih penting: begitu policy-nya
-- dipasang dari teks production, PERILAKUNYA memang sudah sama. Yang berbeda
-- cuma cara ia dicetak. Memaksanya berarti mengejar string, bukan perilaku.
--
-- Ketiganya dipindah ke kelas SELAMANYA dengan alasan "setara makna, beda
-- bentuk deparse", sesudah kesetaraannya diuji atas seluruh nilai status
-- termasuk NULL (scripts/qa/out/probe-hrga-deparse.sql).
--
-- -- SISA ISI BERKAS ---------------------------------------------------------
-- 1. prospects_read: staging BUKAN ketinggalan migrasi, staging DIMUNDURKAN.
--    20260912000004 (12 Sep) mengganti has_role('procurement') menjadi
--    is_procurement_functional(). Lalu doc 12 butir 15 menjalankan
--    20260910000001 di staging pada 25 Sep -- berkas yang DITULIS 10 Sep,
--    sebelum fungsi itu ada, dan yang juga menulis ulang prospects_read. Ia
--    menimpa predikat yang lebih baru. Di production urutannya benar.
--    ** Menjalankan migrasi lama BELAKANGAN mengembalikan predikat lama.
-- 2. dc_master + entity_bank_accounts: staging memang tertinggal
--    (20260902000007 dan 20260911000001 tidak pernah jalan di sana).
-- =============================================================================

BEGIN;

-- --- accounts.prospects_read (has_role -> is_procurement_functional)
ALTER POLICY prospects_read ON public.accounts
  USING ((is_super_admin() OR ((company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids)) AND (is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (has_role('operations'::text) AND ((account_status)::text = 'customer'::text)) OR ((has_role('finance'::text) OR has_role('finance_controller'::text)) AND ((account_status)::text = 'customer'::text)) OR is_procurement_functional()))));

-- --- dc_master_insert (TD-180: tambah varian jamak)
ALTER POLICY dc_master_insert ON public.dc_master
  WITH CHECK ((is_super_admin() OR (((company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))) AND (is_manager_or_above() OR has_role('operations'::text)))));

-- --- dc_master_update (TD-180: tambah varian jamak)
ALTER POLICY dc_master_update ON public.dc_master
  USING ((is_super_admin() OR (((company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))) AND (is_manager_or_above() OR has_role('operations'::text)))));

-- --- entity_bank_accounts_read (TIDAK ADA di staging -- CREATE, bukan ALTER)
-- Inilah policy yang dulu membuat rekening tampil "belum diatur" untuk
-- Finance. Ia lahir 11 Sep di production; staging tidak pernah dapat.
DROP POLICY IF EXISTS entity_bank_accounts_read ON public.entity_bank_accounts;
CREATE POLICY entity_bank_accounts_read ON public.entity_bank_accounts
  FOR SELECT TO authenticated
  USING ((is_super_admin() OR (company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))));

-- --- V1: BUKTI teks staging = teks production -------------------------------
DO $v1$
DECLARE v_q text; v_w text; v_r text; n int := 0;
BEGIN
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='accounts' AND policyname='prospects_read' AND cmd='SELECT';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1a GAGAL: policy prospects_read tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(is_super_admin() OR ((company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids)) AND (is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (has_role(''operations''::text) AND ((account_status)::text = ''customer''::text)) OR ((has_role(''finance''::text) OR has_role(''finance_controller''::text)) AND ((account_status)::text = ''customer''::text)) OR is_procurement_functional())))' THEN
    RAISE EXCEPTION 'V1a GAGAL: qual prospects_read berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1a GAGAL: with_check prospects_read berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'V1a GAGAL: roles prospects_read = %, harusnya public.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='dc_master' AND policyname='dc_master_insert' AND cmd='INSERT';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1b GAGAL: policy dc_master_insert tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1b GAGAL: qual dc_master_insert berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(is_super_admin() OR (((company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))) AND (is_manager_or_above() OR has_role(''operations''::text))))' THEN
    RAISE EXCEPTION 'V1b GAGAL: with_check dc_master_insert berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'V1b GAGAL: roles dc_master_insert = %, harusnya public.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='dc_master' AND policyname='dc_master_update' AND cmd='UPDATE';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1c GAGAL: policy dc_master_update tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(is_super_admin() OR (((company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))) AND (is_manager_or_above() OR has_role(''operations''::text))))' THEN
    RAISE EXCEPTION 'V1c GAGAL: qual dc_master_update berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1c GAGAL: with_check dc_master_update berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'V1c GAGAL: roles dc_master_update = %, harusnya public.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='entity_bank_accounts' AND policyname='entity_bank_accounts_read' AND cmd='SELECT';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1d GAGAL: policy entity_bank_accounts_read tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(is_super_admin() OR (company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids)))' THEN
    RAISE EXCEPTION 'V1d GAGAL: qual entity_bank_accounts_read berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1d GAGAL: with_check entity_bank_accounts_read berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'V1d GAGAL: roles entity_bank_accounts_read = %, harusnya authenticated.', v_r;
  END IF;
  n := n + 1;
  IF n <> 4 THEN RAISE EXCEPTION 'V1 GAGAL: hanya % dari 4 policy diperiksa.', n; END IF;
  RAISE NOTICE 'A2 LOLOS: 4 policy teksnya sama persis dengan production.';
END
$v1$;

COMMIT;
