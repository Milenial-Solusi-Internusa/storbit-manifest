-- =============================================================================
-- 20260928000007_invoice_post_issue_rpcs.sql  (Invoice lengkap, berkas 7 dari 9)
--
-- Empat RPC untuk kolom kelas (c): boleh diisi SESUDAH invoice terbit, lewat
-- jalur berjejak. Semuanya SECURITY DEFINER + REVOKE ALL FROM PUBLIC, dan
-- semuanya menulis `audit_logs`.
--
--   set_invoice_tax_info    faktur_no + coretax_tx_code
--   mark_invoice_printed    printed_at / printed_by / print_count
--   mark_invoice_emailed    emailed_at / emailed_by
--   link_replacement_invoice replaces_invoice_id
--
-- HAK (keputusan Den 27 Sep 2026 -- koreksi atas plan semula):
--   set_invoice_tax_info     : finance, finance_controller, super_admin.
--                              ⭐ `finance` POLOS IKUT, dan itu disengaja:
--                              staf Finance yang memegang Faktur Pajak.
--                              ISI SEKALI; mengubah yang sudah terisi hanya
--                              super_admin.
--   mark_invoice_printed     : siapa pun yang BOLEH MEMBACA invoice itu.
--   mark_invoice_emailed     : sama.
--   link_replacement_invoice : super_admin / manager+ / finance_controller
--                              (cermin canIssueInvoice -- menautkan pengganti
--                              adalah keputusan penerbitan).
--
-- ⚠️ DUPLIKASI YANG DISADARI, kelas TD-233.
-- `mark_invoice_printed` dan `mark_invoice_emailed` harus menegakkan "siapa pun
-- yang boleh MEMBACA". Fungsi SECURITY DEFINER tidak bisa menumpang RLS
-- pemanggilnya, jadi syarat baca policy `sp_invoices_read` DISALIN ke dalam
-- helper `invoice_dapat_dibaca()`. ⛔ Kalau policy itu berubah, helper ini
-- WAJIB ikut berubah -- kalau tidak, dua definisi "boleh membaca" akan
-- melenceng dan gagalnya senyap. Disalin, bukan dipanggil, karena memanggil
-- policy dari fungsi tidak mungkin.
--
-- ⚠️ "ISI SEKALI" ditegakkan DUA KALI: di IF, dan diulang di WHERE UPDATE.
-- Pola ini dari `set_delivery_signed_date` (20260926000001) -- tanpa
-- pengulangan di WHERE, dua panggilan berbarengan bisa sama-sama lolos IF.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_invoices' AND column_name='coretax_tx_code'
  ) THEN
    RAISE EXCEPTION 'PALANG: kolom kelas (c) belum ada -- jalankan 20260928000001 lebih dulu.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- HELPER VISIBILITAS -- salinan syarat policy sp_invoices_read. Lihat catatan
-- duplikasi di kepala berkas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_dapat_dibaca(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM sp_invoices i
     WHERE i.id = p_invoice_id
       AND i.deleted_at IS NULL
       AND (is_super_admin()
            OR i.company_id = get_user_company_id()
            OR i.company_id IN (SELECT get_user_company_ids()))
  );
$function$;

REVOKE ALL ON FUNCTION public.invoice_dapat_dibaca(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_dapat_dibaca(uuid) TO authenticated;

COMMENT ON FUNCTION public.invoice_dapat_dibaca(uuid) IS
  'SALINAN syarat policy sp_invoices_read, untuk dipakai fungsi SECURITY DEFINER yang tidak bisa menumpang RLS pemanggil. Kelas TD-233: kalau policy-nya berubah, fungsi ini WAJIB ikut. Berkas 7, 20260928000007.';

-- ---------------------------------------------------------------------------
-- 1. set_invoice_tax_info -- faktur_no + kode transaksi Coretax.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_invoice_tax_info(
  p_invoice_id       uuid,
  p_faktur_no        text DEFAULT NULL,
  p_coretax_tx_code  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_super boolean := is_super_admin();
  v_co uuid; v_no text; v_status text;
  v_faktur_lama text; v_coretax_lama text;
  v_faktur_baru text; v_coretax_baru text;
  v_n int;
BEGIN
  IF NOT (v_super OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mengisi data pajak invoice. Hanya Finance, Finance Controller, atau Super Admin.';
  END IF;

  SELECT company_id, invoice_no, status, faktur_no, coretax_tx_code
    INTO v_co, v_no, v_status, v_faktur_lama, v_coretax_lama
    FROM sp_invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
  IF v_co IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;

  IF NOT invoice_dapat_dibaca(p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice ini bukan milik entitas tempat kamu punya peran.';
  END IF;

  IF v_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void -- data pajaknya tidak bisa diubah.';
  END IF;

  v_faktur_baru  := NULLIF(btrim(COALESCE(p_faktur_no, '')), '');
  v_coretax_baru := NULLIF(btrim(COALESCE(p_coretax_tx_code, '')), '');

  IF v_faktur_baru IS NULL AND v_coretax_baru IS NULL THEN
    RAISE EXCEPTION 'Tidak ada yang diisi: kirim nomor Faktur Pajak, kode Coretax, atau keduanya.';
  END IF;

  -- ISI SEKALI. Mengubah yang sudah terisi hanya super_admin.
  IF v_faktur_baru IS NOT NULL AND v_faktur_lama IS NOT NULL
     AND v_faktur_lama <> v_faktur_baru AND NOT v_super THEN
    RAISE EXCEPTION 'Nomor Faktur Pajak sudah terisi (%). Hanya Super Admin yang boleh mengubahnya.', v_faktur_lama;
  END IF;
  IF v_coretax_baru IS NOT NULL AND v_coretax_lama IS NOT NULL
     AND v_coretax_lama <> v_coretax_baru AND NOT v_super THEN
    RAISE EXCEPTION 'Kode transaksi Coretax sudah terisi (%). Hanya Super Admin yang boleh mengubahnya.', v_coretax_lama;
  END IF;

  -- Syarat "isi sekali" DIULANG di WHERE: dua panggilan berbarengan tidak
  -- boleh sama-sama lolos IF di atas (pola set_delivery_signed_date).
  UPDATE sp_invoices
     SET faktur_no       = COALESCE(v_faktur_baru, faktur_no),
         coretax_tx_code = COALESCE(v_coretax_baru, coretax_tx_code),
         updated_at      = now()
   WHERE id = p_invoice_id
     AND deleted_at IS NULL
     AND status <> 'void'
     AND (v_super
          OR ((v_faktur_baru  IS NULL OR faktur_no       IS NULL OR faktur_no       = v_faktur_baru)
          AND (v_coretax_baru IS NULL OR coretax_tx_code IS NULL OR coretax_tx_code = v_coretax_baru)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Data pajak tidak jadi diubah -- kemungkinan diisi orang lain lebih dulu. Muat ulang halamannya.';
  END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data)
  VALUES (v_uid, v_co, 'SET_INVOICE_TAX_INFO', 'sp_invoices', p_invoice_id, v_no,
          jsonb_build_object('faktur_no', v_faktur_lama, 'coretax_tx_code', v_coretax_lama),
          jsonb_build_object('faktur_no', COALESCE(v_faktur_baru, v_faktur_lama),
                             'coretax_tx_code', COALESCE(v_coretax_baru, v_coretax_lama)));
END;
$function$;

REVOKE ALL ON FUNCTION public.set_invoice_tax_info(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_invoice_tax_info(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2 & 3. Penanda cetak dan kirim email -- siapa pun yang boleh MEMBACA.
-- Sengaja TANPA gate peran: mencetak dokumen yang sudah boleh dibaca bukan
-- kewenangan tambahan, dan menambah gate di sini akan membuat jejak cetaknya
-- bolong justru untuk orang yang paling sering mencetak.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_invoice_printed(p_invoice_id uuid, p_variant text DEFAULT 'download')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_co uuid; v_no text; v_n int;
BEGIN
  IF NOT invoice_dapat_dibaca(p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan atau tidak bisa dibaca dengan peran kamu.';
  END IF;
  SELECT company_id, invoice_no INTO v_co, v_no FROM sp_invoices WHERE id = p_invoice_id;

  UPDATE sp_invoices
     SET printed_at = now(), printed_by = v_uid, print_count = print_count + 1, updated_at = now()
   WHERE id = p_invoice_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, new_data)
  VALUES (v_uid, v_co, 'MARK_INVOICE_PRINTED', 'sp_invoices', p_invoice_id, v_no,
          jsonb_build_object('variant', COALESCE(p_variant, 'download')));
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_invoice_printed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_invoice_printed(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_invoice_emailed(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_co uuid; v_no text; v_n int;
BEGIN
  IF NOT invoice_dapat_dibaca(p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan atau tidak bisa dibaca dengan peran kamu.';
  END IF;
  SELECT company_id, invoice_no INTO v_co, v_no FROM sp_invoices WHERE id = p_invoice_id;

  UPDATE sp_invoices
     SET emailed_at = now(), emailed_by = v_uid, updated_at = now()
   WHERE id = p_invoice_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label)
  VALUES (v_uid, v_co, 'MARK_INVOICE_EMAILED', 'sp_invoices', p_invoice_id, v_no);
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_invoice_emailed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_invoice_emailed(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. link_replacement_invoice -- menautkan invoice pengganti ke yang digantikan.
-- Ini SEAM jalur koreksi "void + terbit ulang"; jalur itu sendiri belum ada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_replacement_invoice(
  p_new_invoice_id      uuid,
  p_replaced_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_co_baru uuid; v_no_baru text; v_lama_ref uuid;
  v_co_lama uuid; v_no_lama text; v_st_lama text;
  v_n int;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin menautkan invoice pengganti.';
  END IF;

  IF p_new_invoice_id = p_replaced_invoice_id THEN
    RAISE EXCEPTION 'Invoice tidak bisa menggantikan dirinya sendiri.';
  END IF;

  SELECT company_id, invoice_no, replaces_invoice_id
    INTO v_co_baru, v_no_baru, v_lama_ref
    FROM sp_invoices WHERE id = p_new_invoice_id AND deleted_at IS NULL;
  IF v_co_baru IS NULL THEN RAISE EXCEPTION 'Invoice pengganti tidak ditemukan.'; END IF;

  SELECT company_id, invoice_no, status
    INTO v_co_lama, v_no_lama, v_st_lama
    FROM sp_invoices WHERE id = p_replaced_invoice_id AND deleted_at IS NULL;
  IF v_co_lama IS NULL THEN RAISE EXCEPTION 'Invoice yang digantikan tidak ditemukan.'; END IF;

  IF v_co_baru <> v_co_lama THEN
    RAISE EXCEPTION 'Kedua invoice harus milik entitas yang sama.';
  END IF;
  IF v_st_lama <> 'void' THEN
    RAISE EXCEPTION 'Invoice % belum void (status %). Hanya invoice yang sudah void yang boleh digantikan.', v_no_lama, v_st_lama;
  END IF;
  IF v_lama_ref IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice % sudah menunjuk invoice pengganti lain. Tautan ini diisi sekali.', v_no_baru;
  END IF;
  IF EXISTS (SELECT 1 FROM sp_invoices WHERE replaces_invoice_id = p_replaced_invoice_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Invoice % sudah digantikan invoice lain.', v_no_lama;
  END IF;

  UPDATE sp_invoices
     SET replaces_invoice_id = p_replaced_invoice_id, updated_at = now()
   WHERE id = p_new_invoice_id AND deleted_at IS NULL AND replaces_invoice_id IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Tautan tidak jadi dibuat -- kemungkinan diisi orang lain lebih dulu.';
  END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, new_data)
  VALUES (v_uid, v_co_baru, 'LINK_REPLACEMENT_INVOICE', 'sp_invoices', p_new_invoice_id, v_no_baru,
          jsonb_build_object('replaces_invoice_id', p_replaced_invoice_id, 'replaces_invoice_no', v_no_lama));
END;
$function$;

REVOKE ALL ON FUNCTION public.link_replacement_invoice(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_replacement_invoice(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- V1 -- terpasang + ACL. Grantee KOSONG (berawalan '=') = PUBLIC, dan proacl
-- NULL juga = PUBLIC EXECUTE. Keduanya diperiksa (gotcha #40).
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE v_n int; v_pub int; v_auth int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('invoice_dapat_dibaca','set_invoice_tax_info','mark_invoice_printed','mark_invoice_emailed','link_replacement_invoice');
  IF v_n <> 5 THEN RAISE EXCEPTION 'V1a GAGAL: hanya % dari 5 fungsi terpasang.', v_n; END IF;

  SELECT count(*) INTO v_pub FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('invoice_dapat_dibaca','set_invoice_tax_info','mark_invoice_printed','mark_invoice_emailed','link_replacement_invoice')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  IF v_pub <> 0 THEN RAISE EXCEPTION 'V1b GAGAL: % fungsi masih ber-PUBLIC EXECUTE (grantee kosong atau proacl NULL).', v_pub; END IF;

  -- PEMBANDING: kalau X untuk authenticated juga hilang, V1b "lolos" karena
  -- fungsinya tak bisa dipanggil siapa pun -- hijau karena alasan yang salah.
  SELECT count(*) INTO v_auth FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('invoice_dapat_dibaca','set_invoice_tax_info','mark_invoice_printed','mark_invoice_emailed','link_replacement_invoice')
     AND EXISTS (SELECT 1 FROM unnest(p.proacl) a
                  WHERE a::text LIKE 'authenticated=%' AND split_part(a::text,'=',2) LIKE '%X%');
  IF v_auth <> 5 THEN RAISE EXCEPTION 'V1c GAGAL: hanya % dari 5 fungsi ber-EXECUTE untuk authenticated.', v_auth; END IF;

  RAISE NOTICE 'V1 LOLOS: 5 fungsi terpasang, 0 PUBLIC EXECUTE, 5 ber-EXECUTE untuk authenticated.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.link_replacement_invoice(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.mark_invoice_emailed(uuid);
--   DROP FUNCTION IF EXISTS public.mark_invoice_printed(uuid, text);
--   DROP FUNCTION IF EXISTS public.set_invoice_tax_info(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.invoice_dapat_dibaca(uuid);
-- ⚠️ Sesudah rollback, faktur_no TIDAK punya jalur tulis sama sekali (berkas 1
-- mencabut UPDATE langsungnya). Itu disengaja -- kalau butuh jalur sementara,
-- kembalikan grantnya secara sadar, jangan diam-diam.
-- =============================================================================
