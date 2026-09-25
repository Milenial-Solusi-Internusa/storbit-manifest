-- =============================================================================
-- 20260928000010_invoice_issue_tax_link.sql (Invoice lengkap, berkas 10 dari 10)
--
-- create_invoice_for_sp MENGISI `sp_invoice_lines.tax_id` saat terbit.
--
-- ⭐ KENAPA BERKAS INI ADA -- cacat yang ditemukan seed, bukan review.
-- Berkas 6 (20260928000006) menautkan tax_id untuk baris yang SUDAH ADA. Itu
-- backfill: ia berjalan sekali. `create_invoice_for_sp` versi berkas 3 mengisi
-- `tax_rate` tapi TIDAK `tax_id`, jadi setiap invoice yang terbit SESUDAH
-- backfill lahir dengan tautan pajak kosong.
--
-- Tidak terlihat sampai seed UAT dijalankan ulang penuh: purge menghapus 25
-- baris hasil backfill, seed menerbitkan 22 invoice baru lewat RPC, dan V12h
-- berbunyi 25 baris tanpa tax_id. Kelas kegagalan yang sama dengan
-- `delivery_note_items.sp_order_item_id` (25 Sep 2026): kolom yang TAMPAK
-- terisi karena pernah di-backfill, padahal jalur yang mengisinya tidak ada.
--
-- ⛔ Berkas 3 SENGAJA TIDAK DISUNTING. Ia sudah tercatat dijalankan di staging;
-- mengubah isinya membuat berkas di repo berhenti menggambarkan apa yang
-- benar-benar jalan. Perbaikan punya nomornya sendiri.
--
-- `tax_id` tetap MURNI RUJUKAN NAMA -- angka yang menghitung tetap `tax_rate`
-- dan `ppn`. V1 membuktikan nol total bergerak.
--
-- Pencariannya memakai (company_id, code='VAT_FULL', deleted_at IS NULL) DAN
-- tarif yang cocok, sama persis dengan berkas 6. Entitas tanpa master pajak
-- mendapat NULL, bukan galat: nol master bukan alasan menolak menerbitkan
-- invoice.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_invoice_for_sp'
       AND pg_get_functiondef(p.oid) LIKE '%post_invoice_journal%'
  ) THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp bukan versi berkas 3 -- jalankan 20260928000003 lebih dulu.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS.';
END
$palang$;

CREATE OR REPLACE FUNCTION public.create_invoice_for_sp(p_sp_order_id uuid, p_invoice_date date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text; v_entity_code text;
  v_invoice_date date;
  v_year         int; v_month_roman text;
  v_seq          int; v_invoice_no text; v_invoice_id uuid;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
  v_total_ship   numeric(18,2);
  v_override_days int; v_term_days int; v_due_date date;
  v_term_label   text;
  v_cust_npwp    text;
  v_acc_rev      uuid; v_acc_ship uuid; v_tax_id uuid;
  v_siap         boolean; v_alasan_kode text; v_alasan_teks text;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin menerbitkan invoice.';
  END IF;

  SELECT company_id, customer_id, sp_no INTO v_company_id, v_customer_id, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;

  SELECT r.siap, r.alasan_kode, r.alasan_teks
    INTO v_siap, v_alasan_kode, v_alasan_teks
    FROM public.sp_invoice_readiness(p_sp_order_id) r;

  IF NOT v_siap THEN
    RAISE EXCEPTION '%', v_alasan_teks;
  END IF;

  v_invoice_date := p_invoice_date;
  IF v_invoice_date IS NULL THEN
    SELECT MAX(signed_date) INTO v_invoice_date FROM delivery_notes
     WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  END IF;
  v_year := extract(year from v_invoice_date)::int;

  SELECT invoice_payment_terms_days INTO v_override_days FROM accounts WHERE id = v_customer_id;
  IF v_override_days IS NOT NULL THEN
    v_term_days  := v_override_days;
    v_term_label := 'Override customer';
  ELSE
    SELECT (CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END),
           (CASE WHEN pt.is_active THEN pt.name    ELSE NULL END)
      INTO v_term_days, v_term_label
      FROM entity_finance_settings efs
      LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
      WHERE efs.company_id = v_company_id;
    IF v_term_days IS NULL THEN
      SELECT default_payment_terms INTO v_term_days FROM entity_finance_settings WHERE company_id = v_company_id;
      v_term_label := 'Default entitas';
    END IF;
    IF v_term_days IS NULL THEN
      v_term_label := 'Bawaan sistem';
    END IF;
    v_term_days := COALESCE(v_term_days, 30);
  END IF;
  v_due_date := v_invoice_date + v_term_days;

  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'INV', 'FIN', v_year, 0, 0);
  v_month_roman := CASE extract(month from v_invoice_date)::int
    WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX' WHEN 10 THEN 'X' WHEN 11 THEN 'XI' WHEN 12 THEN 'XII'
  END;
  v_invoice_no := v_entity_code || '-INV-' || v_month_roman || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  SELECT btrim(COALESCE(tax_id, '')) INTO v_cust_npwp FROM accounts WHERE id = v_customer_id;

  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_no, invoice_date, status, created_by,
                           source_type, customer_tax_id, payment_term_days, payment_term_label)
  VALUES (v_company_id, p_sp_order_id, v_invoice_no, v_invoice_date, 'issued', v_uid,
          'sp_storbit', NULLIF(v_cust_npwp, ''), v_term_days, v_term_label)
  RETURNING id INTO v_invoice_id;

  v_acc_rev := get_mapped_account(v_company_id, 'pendapatan_barang');

  -- Rujukan master pajak. Dicari lewat KODE + TARIF, sama persis dengan
  -- backfill berkas 6 -- kalau master entitas ini tidak punya VAT_FULL bertarif
  -- 0.11, hasilnya NULL dan layar menampilkan tarifnya saja. Nol master bukan
  -- alasan menolak menerbitkan invoice.
  SELECT t.id INTO v_tax_id
    FROM taxes t
   WHERE t.company_id = v_company_id AND t.code = 'VAT_FULL'
     AND t.deleted_at IS NULL AND t.rate = 0.11
   LIMIT 1;

  INSERT INTO sp_invoice_lines (
    invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
    line_type, product_id, product_name, sku, uom, unit_price, line_amount,
    account_id, tax_rate, tax_id)
  SELECT v_invoice_id, i.id,
         (i.unit_price * i.shipped_qty),
         ROUND((i.unit_price * i.shipped_qty + i.shipping_price) * 0.11),
         i.shipped_qty,
         row_number() OVER (ORDER BY i.created_at),
         'item', i.product_id, i.product_name, COALESCE(i.sku, ''),
         COALESCE(NULLIF(btrim(p.unit), ''), NULLIF(btrim(p.uom), ''), ''),
         i.unit_price,
         ROUND(i.unit_price * i.shipped_qty, 2),
         v_acc_rev, 0.11, v_tax_id
    FROM sp_order_items i
    LEFT JOIN products p ON p.id = i.product_id
   WHERE i.sp_order_id = p_sp_order_id;

  SELECT COALESCE(SUM(shipping_price), 0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  IF v_total_ship > 0 THEN
    v_acc_ship := get_mapped_account(v_company_id, 'pendapatan_jasa_kirim');
    INSERT INTO sp_invoice_lines (
      invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
      line_type, product_name, sku, uom, unit_price, line_amount,
      account_id, tax_rate, tax_id)
    SELECT v_invoice_id, NULL, 0, 0, 1,
           (SELECT COALESCE(MAX(sl2."position"), 0) + 1 FROM sp_invoice_lines sl2 WHERE sl2.invoice_id = v_invoice_id),
           'shipping', 'Ongkos kirim', '', 'LOT', v_total_ship, v_total_ship,
           v_acc_ship, 0.11, v_tax_id;
  END IF;

  SELECT COALESCE(SUM(dpp), 0), COALESCE(SUM(ppn), 0), COALESCE(SUM(line_amount), 0) + COALESCE(SUM(ppn), 0)
    INTO v_total_dpp, v_total_ppn, v_total_amount
    FROM sp_invoice_lines WHERE invoice_id = v_invoice_id;

  UPDATE sp_invoices
     SET total_dpp = v_total_dpp, total_ppn = v_total_ppn,
         total_amount = v_total_amount, total_amount_currency = v_total_amount,
         due_date = v_due_date
   WHERE id = v_invoice_id;

  PERFORM post_invoice_journal(v_invoice_id);

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END;
$function$;

-- Menyusulkan baris yang sudah terlanjur terbit tanpa tautan. Logikanya
-- IDENTIK dengan berkas 6; ia idempoten dan aman dijalankan berapa kali pun.
UPDATE public.sp_invoice_lines sl
   SET tax_id = t.id
  FROM public.sp_invoices i, public.taxes t
 WHERE i.id = sl.invoice_id
   AND t.company_id = i.company_id
   AND t.code = 'VAT_FULL'
   AND t.deleted_at IS NULL
   AND t.rate = sl.tax_rate
   AND sl.tax_id IS DISTINCT FROM t.id;

DO $v1$
DECLARE v_null int; v_salah int; v_beda int; v_total numeric;
BEGIN
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_invoice_for_sp') NOT LIKE '%v_tax_id%' THEN
    RAISE EXCEPTION 'V1a GAGAL: create_invoice_for_sp tidak mengisi tax_id.';
  END IF;

  SELECT count(*) INTO v_null FROM sp_invoice_lines sl JOIN sp_invoices i ON i.id=sl.invoice_id
   WHERE sl.tax_id IS NULL
     AND EXISTS (SELECT 1 FROM taxes t WHERE t.company_id=i.company_id AND t.code='VAT_FULL'
                   AND t.deleted_at IS NULL AND t.rate=sl.tax_rate);
  IF v_null <> 0 THEN
    RAISE EXCEPTION 'V1b GAGAL: % baris masih tanpa tax_id padahal entitasnya punya VAT_FULL.', v_null;
  END IF;

  SELECT count(*) INTO v_salah FROM sp_invoice_lines sl JOIN sp_invoices i ON i.id=sl.invoice_id
    JOIN taxes t ON t.id=sl.tax_id
   WHERE t.company_id<>i.company_id OR t.code<>'VAT_FULL' OR t.deleted_at IS NOT NULL OR t.rate<>sl.tax_rate;
  IF v_salah <> 0 THEN RAISE EXCEPTION 'V1c GAGAL: % baris salah taut.', v_salah; END IF;

  SELECT count(*) INTO v_beda FROM (
    SELECT i.id FROM sp_invoices i LEFT JOIN sp_invoice_lines sl ON sl.invoice_id=i.id
     WHERE i.deleted_at IS NULL GROUP BY i.id, i.total_amount
    HAVING COALESCE(SUM(sl.line_amount),0)+COALESCE(SUM(sl.ppn),0) <> i.total_amount) z;
  IF v_beda <> 0 THEN RAISE EXCEPTION 'V1d GAGAL: % invoice identitas totalnya bergeser.', v_beda; END IF;

  SELECT COALESCE(SUM(total_amount),0) INTO v_total FROM sp_invoices WHERE deleted_at IS NULL;
  RAISE NOTICE 'V1 LOLOS: create_invoice_for_sp mengisi tax_id; 0 baris tertinggal; 0 salah taut; SUM(total_amount) % (tak bergerak).', v_total;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK: jalankan ulang blok (4) 20260928000003 untuk mengembalikan
-- create_invoice_for_sp tanpa pengisian tax_id, lalu opsional:
--   UPDATE public.sp_invoice_lines SET tax_id = NULL;
-- Nol dampak angka -- tax_id tidak pernah ikut perhitungan.
-- =============================================================================
