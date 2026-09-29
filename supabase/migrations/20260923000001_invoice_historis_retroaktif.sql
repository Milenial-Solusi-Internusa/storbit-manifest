-- =====================================================================
-- Migrasi RETROAKTIF: penerbitan invoice historis (tanggal invoice eksplisit)
-- Tanggal kejadian : sekitar 23 Sep 2026 (sebelum impor invoice historis 23 sampai 24 Sep)
-- Tanggal dicatat  : 29 Sep 2026
-- Status           : LIVE (sudah berjalan di produksi, file ini hanya pencatatan)
-- JANGAN DIJALANKAN ULANG di produksi.
--
-- Bukti kejadian (dari data produksi, dibaca 29 Sep 2026):
--   23 Sep 2026: 95 invoice dibuat dengan tanggal invoice mundur (25 Sep 2025 s/d
--                25 Jun 2026) dan 27 invoice di-void lalu diterbitkan ulang.
--   24 Sep 2026: 373 invoice dibuat dengan tanggal invoice mundur (23 Jan s/d 17 Sep 2026).
--   Keduanya hanya mungkin dengan tiga perubahan di bawah. Snapshot 18 Sep 2026
--   masih memuat versi lama.
--
-- Isi:
--   1. create_invoice(uuid) diganti create_invoice(uuid, date DEFAULT NULL).
--      Overload lama satu argumen dihapus.
--   2. Fungsi baru create_invoice_for_sp(uuid, date DEFAULT NULL): tanggal invoice
--      default = tanggal tanda tangan Surat Jalan terakhir, jurnal dipecah per
--      Surat Jalan (sumber selisih pembulatan 1 rupiah di TD-294).
--   3. Constraint sp_invoice_one_per_sp UNIQUE (sp_order_id) dikonversi menjadi
--      partial unique index WHERE status <> 'void', supaya invoice yang di-void
--      tidak menghalangi penerbitan ulang.
--
-- Catatan ACL: kedua fungsi TIDAK punya GRANT/REVOKE eksplisit di produksi
-- (hak EXECUTE default ke PUBLIC). Dicatat apa adanya, belum mengikuti pola
-- ACL Fase 5 (REVOKE FROM PUBLIC + GRANT TO authenticated). Lihat temuan
-- terpisah, file ini tidak mengubah ACL.
-- Definisi fungsi diambil verbatim dari pg_get_functiondef produksi 29 Sep 2026.
-- =====================================================================

-- 1. Hapus overload lama satu argumen
DROP FUNCTION IF EXISTS public.create_invoice(uuid);

-- 1b. create_invoice dengan tanggal invoice opsional
CREATE OR REPLACE FUNCTION public.create_invoice(p_sp_order_id uuid, p_invoice_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text; v_entity_code text;
  v_year         int := extract(year from COALESCE(p_invoice_date, current_date))::int;
  v_month_roman  text;
  v_seq          int; v_invoice_no text; v_invoice_id uuid;
  v_ordered      int; v_shipped int;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
  v_total_ship   numeric(18,2);
  v_je_id        uuid;
  v_acc_ar       uuid;
  v_acc_rev      uuid;
  v_acc_ship     uuid;
  v_acc_ppn_out  uuid;
  c_code_ar      CONSTANT text := '1-1200';
  c_code_rev     CONSTANT text := '4-1000';
  c_code_ship    CONSTANT text := '4-1100';
  c_code_ppn_out CONSTANT text := '2-1200';
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin menerbitkan invoice.';
  END IF;

  SELECT company_id, customer_id, sp_no INTO v_company_id, v_customer_id, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;

  IF EXISTS (SELECT 1 FROM sp_invoices WHERE sp_order_id = p_sp_order_id AND status <> 'void') THEN
    RAISE EXCEPTION 'SP ini sudah punya invoice aktif.';
  END IF;

  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  IF v_ordered = 0 OR v_shipped <> v_ordered THEN
    RAISE EXCEPTION 'SP belum terkirim penuh (Σshipped=%, Σqty=%) — invoice tidak bisa diterbitkan.', v_shipped, v_ordered;
  END IF;

  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'INV', 'FIN', v_year, 0, 0);
  v_month_roman := CASE extract(month from COALESCE(p_invoice_date, current_date))::int
    WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX' WHEN 10 THEN 'X' WHEN 11 THEN 'XI' WHEN 12 THEN 'XII'
  END;
  v_invoice_no := v_entity_code || '-INV-' || v_month_roman || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_no, invoice_date, status, created_by)
  VALUES (v_company_id, p_sp_order_id, v_invoice_no, COALESCE(p_invoice_date, current_date), 'issued', v_uid)
  RETURNING id INTO v_invoice_id;

  INSERT INTO sp_invoice_lines (invoice_id, sp_order_item_id, dpp, ppn, qty, position)
  SELECT v_invoice_id, i.id,
         (i.unit_price * i.shipped_qty),
         ROUND((i.unit_price * i.shipped_qty + i.shipping_price) * 0.11),
         i.shipped_qty,
         row_number() OVER (ORDER BY i.created_at)
    FROM sp_order_items i WHERE i.sp_order_id = p_sp_order_id;

  SELECT COALESCE(SUM(dpp),0), COALESCE(SUM(ppn),0) INTO v_total_dpp, v_total_ppn
    FROM sp_invoice_lines WHERE invoice_id = v_invoice_id;
  SELECT v_total_dpp + v_total_ppn + COALESCE(SUM(shipping_price),0) INTO v_total_amount
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  UPDATE sp_invoices SET total_dpp = v_total_dpp, total_ppn = v_total_ppn, total_amount = v_total_amount
   WHERE id = v_invoice_id;

  SELECT COALESCE(SUM(shipping_price),0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  SELECT id INTO v_acc_ar FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_ar AND deleted_at IS NULL;
  IF v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ar;
  END IF;

  SELECT id INTO v_acc_rev FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_rev AND deleted_at IS NULL;
  IF v_acc_rev IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_rev;
  END IF;

  SELECT id INTO v_acc_ppn_out FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_ppn_out AND deleted_at IS NULL;
  IF v_acc_ppn_out IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ppn_out;
  END IF;

  IF v_total_ship > 0 THEN
    SELECT id INTO v_acc_ship FROM chart_of_accounts
     WHERE company_id = v_company_id AND code = c_code_ship AND deleted_at IS NULL;
    IF v_acc_ship IS NULL THEN
      RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ship;
    END IF;
  END IF;

  INSERT INTO journal_entries
    (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES
    (v_company_id, COALESCE(p_invoice_date, current_date), 'invoice_issued', v_invoice_id,
     'Penerbitan invoice ' || v_invoice_no || ' (SP ' || v_sp_no || ')', v_uid)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, v_total_amount, 0);

  IF v_total_dpp > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_rev, 0, v_total_dpp);
  END IF;

  IF v_total_ship > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_ship, 0, v_total_ship);
  END IF;

  IF v_total_ppn > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_ppn_out, 0, v_total_ppn);
  END IF;

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END; $function$;

-- 2. create_invoice_for_sp
CREATE OR REPLACE FUNCTION public.create_invoice_for_sp(p_sp_order_id uuid, p_invoice_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text; v_entity_code text;
  v_ordered      int; v_shipped int;
  v_invoice_date date;
  v_year         int; v_month_roman text;
  v_seq          int; v_invoice_no text; v_invoice_id uuid;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
  v_total_ship   numeric(18,2);
  v_acc_ar       uuid;
  v_acc_rev      uuid;
  v_acc_ship     uuid;
  v_acc_ppn_out  uuid;
  c_code_ar      CONSTANT text := '1-1200';
  c_code_rev     CONSTANT text := '4-1000';
  c_code_ship    CONSTANT text := '4-1100';
  c_code_ppn_out CONSTANT text := '2-1200';
  dn             RECORD;
  v_je_id        uuid;
  v_dpp_sj       numeric(18,2); v_ppn_sj numeric(18,2); v_ship_sj numeric(18,2); v_amount_sj numeric(18,2);
  v_dn_count     int;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin menerbitkan invoice.';
  END IF;

  SELECT company_id, customer_id, sp_no INTO v_company_id, v_customer_id, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;

  IF EXISTS (SELECT 1 FROM sp_invoices WHERE sp_order_id = p_sp_order_id AND status <> 'void') THEN
    RAISE EXCEPTION 'SP ini sudah punya invoice aktif.';
  END IF;

  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  IF v_ordered = 0 OR v_shipped <> v_ordered THEN
    RAISE EXCEPTION 'SP belum terkirim penuh (Sigma shipped=%, Sigma qty=%) - invoice tidak bisa diterbitkan.', v_shipped, v_ordered;
  END IF;

  SELECT count(*) INTO v_dn_count FROM delivery_notes
   WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  IF v_dn_count = 0 THEN
    RAISE EXCEPTION 'Belum ada Surat Jalan berstatus delivered dengan tanggal ditandatangani untuk SP ini.';
  END IF;

  v_invoice_date := p_invoice_date;
  IF v_invoice_date IS NULL THEN
    SELECT MAX(signed_date) INTO v_invoice_date FROM delivery_notes
     WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  END IF;
  v_year := extract(year from v_invoice_date)::int;

  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'INV', 'FIN', v_year, 0, 0);
  v_month_roman := CASE extract(month from v_invoice_date)::int
    WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX' WHEN 10 THEN 'X' WHEN 11 THEN 'XI' WHEN 12 THEN 'XII'
  END;
  v_invoice_no := v_entity_code || '-INV-' || v_month_roman || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_no, invoice_date, status, created_by)
  VALUES (v_company_id, p_sp_order_id, v_invoice_no, v_invoice_date, 'issued', v_uid)
  RETURNING id INTO v_invoice_id;

  INSERT INTO sp_invoice_lines (invoice_id, sp_order_item_id, dpp, ppn, qty, position)
  SELECT v_invoice_id, i.id,
         (i.unit_price * i.shipped_qty),
         ROUND((i.unit_price * i.shipped_qty + i.shipping_price) * 0.11),
         i.shipped_qty,
         row_number() OVER (ORDER BY i.created_at)
    FROM sp_order_items i WHERE i.sp_order_id = p_sp_order_id;

  SELECT COALESCE(SUM(dpp),0), COALESCE(SUM(ppn),0) INTO v_total_dpp, v_total_ppn
    FROM sp_invoice_lines WHERE invoice_id = v_invoice_id;
  SELECT COALESCE(SUM(shipping_price),0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  v_total_amount := v_total_dpp + v_total_ppn + v_total_ship;

  UPDATE sp_invoices SET total_dpp = v_total_dpp, total_ppn = v_total_ppn, total_amount = v_total_amount
   WHERE id = v_invoice_id;

  SELECT id INTO v_acc_ar FROM chart_of_accounts WHERE company_id = v_company_id AND code = c_code_ar AND deleted_at IS NULL;
  IF v_acc_ar IS NULL THEN RAISE EXCEPTION 'Akun [%] belum ada - hubungi Finance Controller.', c_code_ar; END IF;
  SELECT id INTO v_acc_rev FROM chart_of_accounts WHERE company_id = v_company_id AND code = c_code_rev AND deleted_at IS NULL;
  IF v_acc_rev IS NULL THEN RAISE EXCEPTION 'Akun [%] belum ada - hubungi Finance Controller.', c_code_rev; END IF;
  SELECT id INTO v_acc_ppn_out FROM chart_of_accounts WHERE company_id = v_company_id AND code = c_code_ppn_out AND deleted_at IS NULL;
  IF v_acc_ppn_out IS NULL THEN RAISE EXCEPTION 'Akun [%] belum ada - hubungi Finance Controller.', c_code_ppn_out; END IF;
  IF v_total_ship > 0 THEN
    SELECT id INTO v_acc_ship FROM chart_of_accounts WHERE company_id = v_company_id AND code = c_code_ship AND deleted_at IS NULL;
    IF v_acc_ship IS NULL THEN RAISE EXCEPTION 'Akun [%] belum ada - hubungi Finance Controller.', c_code_ship; END IF;
  END IF;

  -- Jurnal dipecah per Surat Jalan: ongkos kirim diproporsikan sesuai qty yang
  -- dikirim di Surat Jalan itu terhadap total qty barang itu di seluruh SP,
  -- biar tidak kehitung dobel kalau SP dikirim lewat lebih dari satu Surat Jalan.
  FOR dn IN
    SELECT d.id, d.do_no, d.signed_date
    FROM delivery_notes d
    WHERE d.sp_order_id = p_sp_order_id AND d.status = 'delivered' AND d.signed_date IS NOT NULL
    ORDER BY d.signed_date
  LOOP
    SELECT COALESCE(SUM(soi.unit_price * soi.shipped_qty * dni.qty::numeric / NULLIF(item_tot.total_qty,0)), 0),
           COALESCE(SUM(soi.shipping_price * dni.qty::numeric / NULLIF(item_tot.total_qty,0)), 0)
      INTO v_dpp_sj, v_ship_sj
      FROM delivery_note_items dni
      JOIN sp_order_items soi ON soi.id = dni.sp_order_item_id
      JOIN (
        SELECT dni2.sp_order_item_id, SUM(dni2.qty) AS total_qty
        FROM delivery_note_items dni2
        JOIN delivery_notes dn2 ON dn2.id = dni2.delivery_note_id
        WHERE dn2.sp_order_id = p_sp_order_id AND dn2.status = 'delivered' AND dn2.signed_date IS NOT NULL
        GROUP BY dni2.sp_order_item_id
      ) item_tot ON item_tot.sp_order_item_id = soi.id
     WHERE dni.delivery_note_id = dn.id;
    v_ppn_sj := ROUND((v_dpp_sj + v_ship_sj) * 0.11);
    v_amount_sj := v_dpp_sj + v_ppn_sj + v_ship_sj;

    IF v_amount_sj = 0 THEN CONTINUE; END IF;

    INSERT INTO journal_entries (company_id, entry_date, reference_type, reference_id, delivery_note_id, description, created_by)
    VALUES (v_company_id, dn.signed_date, 'invoice_issued', v_invoice_id, dn.id,
            'Penerbitan invoice ' || v_invoice_no || ' (SP ' || v_sp_no || ', porsi Surat Jalan ' || dn.do_no || ')', v_uid)
    RETURNING id INTO v_je_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_ar, v_amount_sj, 0);

    IF v_dpp_sj > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_rev, 0, v_dpp_sj);
    END IF;
    IF v_ship_sj > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_ship, 0, v_ship_sj);
    END IF;
    IF v_ppn_sj > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_ppn_out, 0, v_ppn_sj);
    END IF;
  END LOOP;

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END; $function$;

-- 3. Satu invoice aktif per SP (invoice void dikecualikan)
ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoice_one_per_sp;
CREATE UNIQUE INDEX IF NOT EXISTS sp_invoice_one_per_sp ON public.sp_invoices USING btree (sp_order_id) WHERE (status <> 'void'::text);
