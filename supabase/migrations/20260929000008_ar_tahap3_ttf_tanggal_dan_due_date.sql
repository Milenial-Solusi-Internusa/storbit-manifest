-- =============================================================================
-- 20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql   (AR Tahap 3, berkas 5 dari 6)
--
-- Jatuh tempo pindah pemicu: dari "invoice_date + termin, dihitung saat
-- terbit/submit" menjadi "tanggal_ttf + termin, dihitung SEKALI saat TTF
-- diterima". Sebelum berkas ini bisa ditulis, SEMUA fungsi yang menulis
-- due_date di badan yang hidup di staging harus diketahui -- daftar di
-- bawah adalah hasil pencarian itu (bukan tebakan dari PLAN semula, yang
-- keliru mengira hanya submit_invoice yang menghitungnya).
--
-- ┌─ DAFTAR FUNGSI YANG MENULIS due_date (versi TERAKHIR per fungsi,
-- │  backfill sekali-jalan 20260927000001 TIDAK termasuk -- itu bukan
-- │  fungsi yang dipanggil ulang, sudah selesai tugasnya) ──────────────────
-- │
-- │  1. submit_invoice(uuid)
-- │     Definisi TERAKHIR & SATU-SATUNYA: 20260814000003_invoice_due_date.sql
-- │     (baris 48-90 badan fungsi; due_date di UPDATE baris 90). Tidak pernah
-- │     didefinisikan ulang sesudahnya -- versi produksi = versi staging.
-- │
-- │  2. create_invoice_for_sp(uuid, date)
-- │     Ditulis ulang 5 KALI. Urutan lahirnya due_date-nya:
-- │       20260923000001_invoice_historis_retroaktif.sql -- BELUM ada due_date
-- │       20260925000001_dni_sp_order_item_link.sql      -- belum disentuh baris ini
-- │       20260926000002_ar_single_issue_path.sql        -- due_date LAHIR di sini
-- │         (baris 207-224 hitung, baris 254 UPDATE), komentar baris 59
-- │         eksplisit: "Dirapikan saat submit_invoice ditulis ulang di
-- │         Tahap 3 -- sampai itu, submit_invoice masih menghitung ini juga"
-- │       20260927000003_journal_account_roles_and_readiness.sql -- due_date
-- │         DIBAWA APA ADANYA (baris 283,330,360), yang diganti hanya lookup
-- │         akun (kode hardcode -> get_mapped_account)
-- │       20260928000003_invoice_issue_v2.sql -- due_date DIBAWA APA ADANYA
-- │         lagi (baris 436,490,558), di atas kolom v2 penuh
-- │       20260928000010_invoice_issue_tax_link.sql -- due_date DIBAWA APA
-- │         ADANYA (baris 62,111,182) -- INI VERSI TERAKHIR yang hidup di
-- │         staging hari ini, bukan 20260928000003. Palang berkas ini sendiri
-- │         (LIKE '%post_invoice_journal%') membuktikan ia dibangun DI ATAS
-- │         20260928000003, bukan menggantikannya secara independen.
-- │
-- │     ⛔ PLAN AR Tahap 3 semula menyebut 20260928000003 sebagai "versi
-- │     terakhir" create_invoice_for_sp. Itu SALAH -- 20260928000010 lahir
-- │     belakangan (butir 25, doc 12) dan menutup cacat "tax_id kosong" di
-- │     atas badan yang SAMA. Badan yang diganti CREATE OR REPLACE di berkas
-- │     ini disalin dari 20260928000010, bukan 003.
-- │
-- │  3. create_invoice(uuid, date) -- WRAPPER, bukan _for_sp
-- │     Definisi TERAKHIR: 20260926000002_ar_single_issue_path.sql. Diperiksa
-- │     PENUH (awk atas rentang CREATE OR REPLACE FUNCTION create_invoice(
-- │     s/d $function$;) -- NOL kemunculan due_date. Ia hanya memanggil
-- │     create_invoice_for_sp per Surat Jalan; tidak menyentuh due_date
-- │     sendiri. TIDAK disentuh berkas ini.
-- │
-- └───────────────────────────────────────────────────────────────────────
--
-- CEK FRONTEND (diminta, dilaporkan apa adanya, TIDAK diubah -- di luar
-- scope): src/ NOL menulis due_date secara langsung. Empat kemunculan di
-- src/lib/db.js (baris ~1359, ~1693, ~1711, ~1769) semuanya BACA (mapper
-- getInvoicePdfData / listInvoices / dst.), begitu pula InvoiceListPage.jsx,
-- InvoiceDetailPage.jsx, invoiceStatus.js, InvoicePDF.jsx -- seluruhnya
-- tampilan/kalkulasi lokal (isOverdue, fmtDate), bukan tulis. Satu-satunya
-- jalur tulis SELALU RPC (submit_invoice dulu; submit_invoice + mark_ttf_
-- received sesudah berkas ini), konsisten dengan sp_invoices yang memang
-- nol GRANT UPDATE(due_date) ke authenticated sejak 20260814000003.
--
-- ISI BERKAS INI (ketiga fungsi diubah dalam SATU migrasi, supaya nol
-- jendela dua sumber due_date hidup bersamaan):
--   A. mark_ttf_received -- BERTAMBAH parameter p_ttf_date (tanggal TTF
--      SUNGGUHAN, sebelum ini hardcode CURRENT_DATE dan tidak bisa diisi
--      dari UI). due_date dihitung SEKALI dari tanggal_ttf + termin --
--      HANYA saat tanggal_ttf sungguh berubah (insert baru, atau koreksi
--      eksplisit). -> FUNGSI BARU bagi Postgres (parameter bertambah,
--      gotcha #37) -- DROP signature lama eksplisit.
--   B. submit_invoice -- dilucuti seluruh blok hitung due_date. Tanda
--      tangan TIDAK berubah -> CREATE OR REPLACE, badan disalin dari
--      20260814000003 (satu-satunya versi yang pernah ada).
--   C. create_invoice_for_sp -- dilucuti blok hitung due_date. Tanda tangan
--      TIDAK berubah -> CREATE OR REPLACE, badan disalin dari
--      20260928000010 (versi TERAKHIR, lihat catatan di atas).
--
-- Diff B dan C dibatasi HANYA: deklarasi v_due_date (dan v_override_days/
-- v_term_days di B, karena di sana ketiganya cuma dipakai due_date; di C
-- v_override_days/v_term_days TETAP DIPAKAI mengisi kolom header
-- payment_term_days/payment_term_label, jadi HANYA v_due_date yang hilang),
-- baris hitung v_due_date, dan kolom due_date di UPDATE. Nol baris lain
-- berubah -- diverifikasi manual line-by-line terhadap sumbernya sebelum
-- berkas ini ditulis.
--
-- Status: LIVE DI STAGING 29 Sep 2026 -- dijalankan DENGAN perbaikan palang
-- tanda tangan di bawah (oidvectortypes(proargtypes), bukan
-- pg_get_function_identity_arguments(), yang ikut mencetak nama parameter --
-- ditemukan saat berkas ini dijalankan pertama kali; lihat gotcha baru di
-- CLAUDE.md/03_DATA_MODEL.md). PRODUCTION BELUM.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V-PRA -- ketiga fungsi harus dalam bentuk yang PERSIS diharapkan sebelum
-- diganti. Kalau salah satu sudah bergerak sejak catatan di atas ditulis,
-- BERHENTI -- jangan timpa buta (gotcha #35).
-- ---------------------------------------------------------------------------
DO $prapalang$
DECLARE v_def text;
BEGIN
  -- mark_ttf_received: signature lama (4 argumen) harus ada, versi baru
  -- (p_ttf_date) belum. oidvectortypes(proargtypes) untuk cocokkan TIPE --
  -- pg_get_function_identity_arguments() ikut mencetak nama parameter
  -- ('p_invoice_id uuid, ...'), jadi perbandingan ke daftar tipe polos tidak
  -- akan pernah cocok (ketahuan saat berkas ini dijalankan ke staging 29 Sep
  -- 2026 -- gotcha baru, lihat CLAUDE.md/03_DATA_MODEL.md). Baris di bawah
  -- (LIKE '%p_ttf_date%') SENGAJA TETAP pg_get_function_identity_arguments()
  -- -- di situ nama parameter memang yang dicari, bukan tipenya.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='mark_ttf_received'
       AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text'
  ) THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received(uuid, text, text, text) tidak ditemukan.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='mark_ttf_received'
       AND pg_get_function_identity_arguments(p.oid) LIKE '%p_ttf_date%'
  ) THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received sudah punya p_ttf_date -- migrasi ini sudah pernah jalan.';
  END IF;

  -- submit_invoice: badan hidup harus masih menghitung due_date dari
  -- invoice_date (bentuk lama), belum dilucuti.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='submit_invoice';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PALANG: submit_invoice(uuid) tidak ditemukan.';
  END IF;
  IF v_def NOT LIKE '%v_due_date := v_invoice_date + v_term_days%' THEN
    RAISE EXCEPTION 'PALANG: submit_invoice tidak lagi menghitung due_date dari invoice_date -- badan sudah berubah dari yang diharapkan (atau berkas ini sudah pernah jalan).';
  END IF;

  -- create_invoice_for_sp: badan hidup harus versi 20260928000010 (punya
  -- tax_id DAN masih menghitung due_date dari invoice_date).
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp(uuid, date) tidak ditemukan.';
  END IF;
  IF v_def NOT LIKE '%v_tax_id%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp bukan versi 20260928000010 (tidak memuat v_tax_id) -- jalankan 20260928000010 lebih dulu, atau badan sudah berubah dari yang diharapkan.';
  END IF;
  IF v_def NOT LIKE '%v_due_date := v_invoice_date + v_term_days%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp tidak lagi menghitung due_date dari invoice_date -- berkas ini sudah pernah jalan, atau badan berubah dari yang diharapkan.';
  END IF;

  -- compute_payment_term_days (berkas 1) harus sudah ada -- dipakai mark_ttf_received.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='compute_payment_term_days'
  ) THEN
    RAISE EXCEPTION 'PALANG: compute_payment_term_days belum ada -- jalankan 20260929000004 lebih dulu.';
  END IF;

  RAISE NOTICE 'V-PRA LOLOS: ketiga fungsi (mark_ttf_received 4-argumen, submit_invoice, create_invoice_for_sp versi 20260928000010) dalam bentuk yang diharapkan.';
END
$prapalang$;

-- =============================================================================
-- A. mark_ttf_received -- BERTAMBAH p_ttf_date -> FUNGSI BARU bagi Postgres
--    (gotcha #37). DROP signature lama eksplisit sebelum CREATE yang baru.
-- =============================================================================
DROP FUNCTION IF EXISTS public.mark_ttf_received(uuid, text, text, text);

CREATE FUNCTION public.mark_ttf_received(
  p_invoice_id  uuid,
  p_received_by text,
  p_ttf_no      text DEFAULT NULL::text,
  p_notes       text DEFAULT NULL::text,
  p_ttf_date    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status      text;
  v_invoice_no  text;
  v_sp_order_id uuid;
  v_customer_id uuid;
  v_sp_no       text;
  v_company_id  uuid;
  v_ttf_id      uuid;
  v_ttf_lama    date;
  v_term_days   int;
  v_due_date    date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat penerimaan TTF.';
  END IF;

  IF p_received_by IS NULL OR btrim(p_received_by) = '' THEN
    RAISE EXCEPTION 'Nama penerima wajib diisi.';
  END IF;

  IF p_ttf_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal TTF wajib diisi.';
  END IF;

  SELECT i.status, i.invoice_no, i.sp_order_id
    INTO v_status, v_invoice_no, v_sp_order_id
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL;

  IF v_status IS NULL   THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status = 'void'  THEN RAISE EXCEPTION 'Invoice sudah void.';      END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft — terbitkan dulu sebelum menandai TTF diterima.';
  END IF;

  SELECT o.customer_id, o.sp_no, o.company_id INTO v_customer_id, v_sp_no, v_company_id
    FROM sp_orders o WHERE o.id = v_sp_order_id AND o.deleted_at IS NULL;

  SELECT t.id, t.tanggal_ttf INTO v_ttf_id, v_ttf_lama
    FROM ar_ttfs t
   WHERE t.invoice_id = p_invoice_id
   ORDER BY t.created_at
   LIMIT 1;

  IF v_ttf_id IS NULL THEN
    INSERT INTO ar_ttfs (
      no_ttf, tanggal_ttf, tanggal_menerima, no_inv, no_sp,
      customer_id, notes, sp_order_id, invoice_id, diterima_oleh
    ) VALUES (
      COALESCE(NULLIF(btrim(p_ttf_no), ''), ''),
      p_ttf_date,
      CURRENT_DATE,
      COALESCE(v_invoice_no, ''),
      COALESCE(v_sp_no, ''),
      v_customer_id,
      COALESCE(NULLIF(btrim(p_notes), ''), ''),
      v_sp_order_id,
      p_invoice_id,
      btrim(p_received_by)
    )
    RETURNING id INTO v_ttf_id;
  ELSE
    UPDATE ar_ttfs SET
      tanggal_menerima = CURRENT_DATE,
      tanggal_ttf      = p_ttf_date,
      diterima_oleh    = btrim(p_received_by),
      no_ttf = COALESCE(NULLIF(btrim(p_ttf_no), ''), no_ttf),
      notes  = COALESCE(NULLIF(btrim(p_notes),  ''), notes),
      sp_order_id = COALESCE(sp_order_id, v_sp_order_id),
      customer_id = COALESCE(customer_id, v_customer_id),
      no_inv = CASE WHEN no_inv = '' THEN COALESCE(v_invoice_no, '') ELSE no_inv END,
      no_sp  = CASE WHEN no_sp  = '' THEN COALESCE(v_sp_no, '')      ELSE no_sp  END
     WHERE id = v_ttf_id;
  END IF;

  -- due_date HANYA lahir dari tanggal_ttf, dan HANYA dihitung ulang kalau
  -- tanggal_ttf sungguh berubah (insert baru -> v_ttf_lama NULL; koreksi
  -- eksplisit -> nilainya beda). Mengedit No. TTF/nama penerima/catatan SAJA
  -- tidak menyentuh due_date. "due_date dihitung sekali lalu permanen"
  -- (rapat 13 Agu 2026) tetap berlaku -- yang berubah cuma PEMICUnya: TTF,
  -- bukan lagi submit/terbit.
  IF v_ttf_lama IS DISTINCT FROM p_ttf_date THEN
    v_term_days := compute_payment_term_days(v_company_id, v_customer_id);
    v_due_date  := p_ttf_date + v_term_days;
    UPDATE sp_invoices SET due_date = v_due_date, updated_at = now() WHERE id = p_invoice_id;
  END IF;

  RETURN v_ttf_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) TO authenticated;

COMMENT ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) IS
  'Menerima p_ttf_date (tanggal TTF sungguhan, default CURRENT_DATE untuk kompatibilitas). Menghitung due_date = tanggal_ttf + termin SEKALI, hanya saat tanggal_ttf berubah. AR Tahap 3, 20260929000008.';

-- =============================================================================
-- B. submit_invoice -- dilucuti blok hitung due_date. Tanda tangan TIDAK
--    berubah -> CREATE OR REPLACE (mewarisi ACL yang sudah ada).
--    Badan sumber: 20260814000003_invoice_due_date.sql (satu-satunya versi).
--    Diff terhadap sumber itu: HANYA deklarasi v_override_days/v_term_days/
--    v_due_date dan blok hitungnya dicabut, dan "due_date = v_due_date"
--    dicabut dari UPDATE. v_company_id/v_invoice_date SENGAJA DIBIARKAN
--    tetap di-SELECT walau kini tidak dipakai -- keduanya bagian dari SELECT
--    yang SAMA yang juga mengambil sp_order_id/status (dipakai), dan
--    memangkas SELECT itu bukan "blok hitung due_date".
-- =============================================================================
CREATE OR REPLACE FUNCTION public.submit_invoice(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sp_order_id uuid; v_customer_id uuid; v_sp_no text; v_status text;
  v_company_id uuid; v_invoice_date date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
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
GRANT EXECUTE ON FUNCTION public.submit_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_invoice(uuid) IS
  'Dilucuti perhitungan due_date (AR Tahap 3, 20260929000008) -- due_date sekarang HANYA lahir dari mark_ttf_received. Menutup D-15 (due_date dulu dihitung di dua tempat).';

-- =============================================================================
-- C. create_invoice_for_sp -- dilucuti blok hitung due_date. Tanda tangan
--    TIDAK berubah -> CREATE OR REPLACE (mewarisi ACL yang sudah ada).
--    Badan sumber: 20260928000010_invoice_issue_tax_link.sql (versi
--    TERAKHIR -- lihat catatan di kepala berkas). Diff terhadap sumber itu:
--    HANYA "v_due_date date" dicabut dari deklarasi, baris
--    "v_due_date := v_invoice_date + v_term_days;" dicabut, dan
--    "due_date = v_due_date" dicabut dari UPDATE. v_override_days/
--    v_term_days/v_term_label TETAP ADA dan TETAP DIPAKAI -- keduanya
--    mengisi kolom header payment_term_days/payment_term_label yang TIDAK
--    ada hubungannya dengan due_date.
-- =============================================================================
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
  v_override_days int; v_term_days int;
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
         total_amount = v_total_amount, total_amount_currency = v_total_amount
   WHERE id = v_invoice_id;

  PERFORM post_invoice_journal(v_invoice_id);

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_sp(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.create_invoice_for_sp(uuid, date) IS
  'Dilucuti perhitungan due_date (AR Tahap 3, 20260929000008) -- due_date sekarang HANYA lahir dari mark_ttf_received, tidak lagi distempel di saat terbit. payment_term_days/payment_term_label TETAP diisi di sini (metadata termin, terpisah dari due_date). Dasar badan: 20260928000010 (versi terakhir per audit berkas ini).';

-- ---------------------------------------------------------------------------
-- V-POST -- ketiga fungsi: due_date sungguh hilang dari badan (kecuali
-- sebagai nama kolom yang di-COALESCE/dibaca, bukan ditulis), ACL benar,
-- dan mark_ttf_received signature lama sungguh hilang.
-- ---------------------------------------------------------------------------
DO $vpost$
DECLARE
  v_def  text;
  v_acl  text;
  v_lama_ada boolean;
BEGIN
  -- mark_ttf_received: signature lama hilang, ACL baru benar.
  -- oidvectortypes(proargtypes), bukan pg_get_function_identity_arguments()
  -- -- pola sama dengan V-PRA di atas (gotcha: nama parameter ikut tercetak).
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='mark_ttf_received'
       AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text'
  ) INTO v_lama_ada;
  IF v_lama_ada THEN
    RAISE EXCEPTION 'V-POST GAGAL: signature lama mark_ttf_received(4 argumen) masih ada.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='mark_ttf_received';
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL mark_ttf_received tidak sesuai (harus authenticated saja). ACL: %', v_acl;
  END IF;

  -- submit_invoice: due_date tidak lagi DITULIS -- satu-satunya kemunculan
  -- 'due_date' yang sah sekarang adalah di komentar (sudah dicek manual di
  -- atas); di sini cukup pastikan pola PENULISANnya hilang.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='submit_invoice';
  IF v_def LIKE '%v_due_date%' OR v_def LIKE '%due_date = %' THEN
    RAISE EXCEPTION 'V-POST GAGAL: submit_invoice masih memuat perhitungan/penulisan due_date.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='submit_invoice';
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL submit_invoice tidak sesuai (harus authenticated saja). ACL: %', v_acl;
  END IF;

  -- create_invoice_for_sp: due_date tidak lagi ditulis, tapi payment_term_days/
  -- payment_term_label TETAP diisi (v_term_days/v_term_label harus tetap ada).
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';
  IF v_def LIKE '%v_due_date%' OR v_def LIKE '%due_date = v_%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp masih memuat perhitungan/penulisan due_date.';
  END IF;
  IF v_def NOT LIKE '%payment_term_days%' OR v_def NOT LIKE '%v_term_days%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp kehilangan pengisian payment_term_days/v_term_days -- seharusnya TETAP ada.';
  END IF;
  IF v_def NOT LIKE '%v_tax_id%' OR v_def NOT LIKE '%post_invoice_journal%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp kehilangan bagian tax_id/post_invoice_journal -- diff seharusnya HANYA due_date.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL create_invoice_for_sp tidak sesuai (harus authenticated saja). ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: mark_ttf_received (signature baru, ACL benar), submit_invoice (due_date hilang, ACL benar), create_invoice_for_sp (due_date hilang, payment_term_days/tax_id/post_invoice_journal utuh, ACL benar).';
END
$vpost$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.mark_ttf_received(uuid, text, text, text, date);
--   -- (tempel ulang CREATE OR REPLACE FUNCTION mark_ttf_received(...) 4 argumen
--   --  dari 20260817000001_fase5_jurnal_ar_payments_ttf.sql)
--   REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text) FROM PUBLIC;
--   GRANT ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text) TO authenticated;
--
--   -- (tempel ulang CREATE OR REPLACE FUNCTION submit_invoice(uuid) dari
--   --  20260814000003_invoice_due_date.sql -- ACL tidak perlu disentuh,
--   --  CREATE OR REPLACE mewarisi)
--
--   -- (tempel ulang CREATE OR REPLACE FUNCTION create_invoice_for_sp(uuid, date)
--   --  dari 20260928000010_invoice_issue_tax_link.sql -- ACL tidak perlu
--   --  disentuh, CREATE OR REPLACE mewarisi)
--   COMMIT;
--
-- ⚠️ Rollback ini mengembalikan due_date ke basis invoice_date/submit --
-- hanya lakukan kalau memang ada yang patah dan perlu dibalik SEMENTARA.
-- =============================================================================
