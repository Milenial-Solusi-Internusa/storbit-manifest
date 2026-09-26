-- =============================================================================
-- a2-policy-catchup.sql -- PATCH PARITY STAGING (TD-279, Kelompok A2)
--
-- !!  S T A G I N G   S A J A  --  JANGAN DIJALANKAN DI PRODUCTION  !!
--     Ketujuh policy di bawah SUDAH begini di production. Tidak masuk doc 12.
--
-- Teks tiap policy DISALIN VERBATIM dari `pg_policies` production (dibaca
-- read-only 27 Sep 2026), lalu diumpankan kembali sebagai sumber. PostgreSQL
-- menulis ulang ekspresi policy dengan bentuk yang KANONIK, jadi memberi
-- kembali bentuk itu menghasilkan teks yang sama persis -- dan V1 di ekor
-- berkas membuktikannya, bukan mengandaikannya.
--
-- -- TIGA TEMUAN YANG MENENTUKAN ISI BERKAS INI ------------------------------
--
-- 1. prospects_read: staging BUKAN ketinggalan migrasi, staging DIMUNDURKAN.
--    20260912000004 (12 Sep) mengganti has_role('procurement') menjadi
--    is_procurement_functional(). Lalu doc 12 butir 15 menjalankan
--    20260910000001 di staging pada 25 Sep untuk membuka UAT -- berkas yang
--    DITULIS 10 Sep, sebelum fungsi itu ada, dan yang juga menulis ulang
--    prospects_read. Ia menimpa predikat yang lebih baru.
--    Di production urutannya benar (10 Sep lalu 12 Sep), jadi production utuh.
--    ** Menjalankan migrasi lama BELAKANGAN mengembalikan predikat lama --
--    diam-diam, dan hanya pada SATU dari empat policy yang disentuhnya.
--
-- 2. Tiga policy HRGA berbeda hanya pada CARA PostgreSQL menuliskan ulang
--    predikat yang sama:
--        staging     = ANY (ARRAY[('draft'::character varying)::text, ...])
--        production  = ANY ((ARRAY['draft'::character varying, ...])::text[])
--    Keduanya predikat yang identik perilakunya. Dugaan pertama "beda versi
--    server" DIUKUR DAN GUGUR: keduanya PostgreSQL 17.6 (170006). Jadi yang
--    berbeda SUMBER SQL pembuatnya, dan menyamakannya memang berarti menulis
--    ulang policy-nya -- bukan menunggu versi bertemu.
--    ⚠️ Nol perubahan perilaku dari ketiganya. Yang didapat: alat drift
--    berhenti melaporkan tiga baris yang tidak bisa ditindaklanjuti, dan
--    alat yang berisik adalah alat yang berhenti dibaca.
--
-- 3. dc_master + entity_bank_accounts: staging memang tertinggal
--    (20260902000007 dan 20260911000001 tidak pernah jalan di sana).
-- =============================================================================

BEGIN;

-- --- accounts.prospects_read (has_role -> is_procurement_functional)
ALTER POLICY prospects_read ON public.accounts
  USING ((is_super_admin() OR ((company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids)) AND (is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (has_role('operations'::text) AND ((account_status)::text = 'customer'::text)) OR ((has_role('finance'::text) OR has_role('finance_controller'::text)) AND ((account_status)::text = 'customer'::text)) OR is_procurement_functional()))));

-- --- hrga_request_items_insert (bentuk tulisan predikat)
ALTER POLICY hrga_request_items_insert ON public.hrga_request_items
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying])::text[])) AND (r.company_id = get_user_company_id())))));

-- --- hrga_request_items_update (bentuk tulisan predikat)
ALTER POLICY hrga_request_items_update ON public.hrga_request_items
  USING ((EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY['draft'::character varying, 'revision_requested'::character varying])::text[])) AND (r.company_id = get_user_company_id())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND (r.company_id = get_user_company_id())))));

-- --- hrga_requests_update_draft (bentuk tulisan predikat)
ALTER POLICY hrga_requests_update_draft ON public.hrga_requests
  USING (((deleted_at IS NULL) AND (company_id = get_user_company_id()) AND (requester_id = auth.uid()) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'revision_requested'::character varying])::text[]))))
  WITH CHECK (((company_id = get_user_company_id()) AND (requester_id = auth.uid())));

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

-- -- V1: BUKTI teks staging = teks production ---------------------------------
-- Yang dibandingkan TEKS `qual`/`with_check` apa adanya, bukan "kurang lebih
-- sama". Justru bentuk tulisannya yang jadi pokok soal di tiga policy HRGA,
-- jadi perbandingan yang longgar tidak akan membuktikan apa pun.
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
   WHERE schemaname='public' AND tablename='hrga_request_items' AND policyname='hrga_request_items_insert' AND cmd='INSERT';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1b GAGAL: policy hrga_request_items_insert tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1b GAGAL: qual hrga_request_items_insert berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY[''draft''::character varying, ''submitted''::character varying])::text[])) AND (r.company_id = get_user_company_id()))))' THEN
    RAISE EXCEPTION 'V1b GAGAL: with_check hrga_request_items_insert berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'V1b GAGAL: roles hrga_request_items_insert = %, harusnya authenticated.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='hrga_request_items' AND policyname='hrga_request_items_update' AND cmd='UPDATE';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1c GAGAL: policy hrga_request_items_update tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY[''draft''::character varying, ''revision_requested''::character varying])::text[])) AND (r.company_id = get_user_company_id()))))' THEN
    RAISE EXCEPTION 'V1c GAGAL: qual hrga_request_items_update berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND (r.company_id = get_user_company_id()))))' THEN
    RAISE EXCEPTION 'V1c GAGAL: with_check hrga_request_items_update berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'V1c GAGAL: roles hrga_request_items_update = %, harusnya authenticated.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='hrga_requests' AND policyname='hrga_requests_update_draft' AND cmd='UPDATE';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1d GAGAL: policy hrga_requests_update_draft tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '((deleted_at IS NULL) AND (company_id = get_user_company_id()) AND (requester_id = auth.uid()) AND ((status)::text = ANY ((ARRAY[''draft''::character varying, ''revision_requested''::character varying])::text[])))' THEN
    RAISE EXCEPTION 'V1d GAGAL: qual hrga_requests_update_draft berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '((company_id = get_user_company_id()) AND (requester_id = auth.uid()))' THEN
    RAISE EXCEPTION 'V1d GAGAL: with_check hrga_requests_update_draft berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'V1d GAGAL: roles hrga_requests_update_draft = %, harusnya authenticated.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='dc_master' AND policyname='dc_master_insert' AND cmd='INSERT';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1e GAGAL: policy dc_master_insert tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1e GAGAL: qual dc_master_insert berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(is_super_admin() OR (((company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))) AND (is_manager_or_above() OR has_role(''operations''::text))))' THEN
    RAISE EXCEPTION 'V1e GAGAL: with_check dc_master_insert berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'V1e GAGAL: roles dc_master_insert = %, harusnya public.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='dc_master' AND policyname='dc_master_update' AND cmd='UPDATE';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1f GAGAL: policy dc_master_update tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(is_super_admin() OR (((company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))) AND (is_manager_or_above() OR has_role(''operations''::text))))' THEN
    RAISE EXCEPTION 'V1f GAGAL: qual dc_master_update berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1f GAGAL: with_check dc_master_update berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'V1f GAGAL: roles dc_master_update = %, harusnya public.', v_r;
  END IF;
  n := n + 1;
  SELECT qual, with_check, COALESCE(array_to_string(roles,','),'')
    INTO v_q, v_w, v_r FROM pg_policies
   WHERE schemaname='public' AND tablename='entity_bank_accounts' AND policyname='entity_bank_accounts_read' AND cmd='SELECT';
  IF v_r IS NULL THEN RAISE EXCEPTION 'V1g GAGAL: policy entity_bank_accounts_read tidak ada.'; END IF;
  IF COALESCE(v_q,'(null)') IS DISTINCT FROM '(is_super_admin() OR (company_id = get_user_company_id()) OR (company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids)))' THEN
    RAISE EXCEPTION 'V1g GAGAL: qual entity_bank_accounts_read berbeda dari production. Dapat: %', COALESCE(v_q,'(null)');
  END IF;
  IF COALESCE(v_w,'(null)') IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1g GAGAL: with_check entity_bank_accounts_read berbeda dari production. Dapat: %', COALESCE(v_w,'(null)');
  END IF;
  IF v_r IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'V1g GAGAL: roles entity_bank_accounts_read = %, harusnya authenticated.', v_r;
  END IF;
  n := n + 1;
  IF n <> 7 THEN RAISE EXCEPTION 'V1 GAGAL: hanya % dari 7 policy diperiksa.', n; END IF;
  RAISE NOTICE 'A2 LOLOS: 7 policy teksnya sama persis dengan production.';
END
$v1$;

COMMIT;
