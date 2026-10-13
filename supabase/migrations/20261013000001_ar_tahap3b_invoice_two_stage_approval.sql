-- =============================================================================
-- 20261013000001_ar_tahap3b_invoice_two_stage_approval.sql
-- (AR Tahap 3 bagian kedua, lanjutan -- persetujuan invoice DUA TAHAP)
--
-- Keputusan verbal Den 7 Okt 2026, ditulis jadi PLAN lalu DIEKSEKUSI sesudah
-- revisi Den 13 Okt 2026: invoice yang diajukan (create_invoice_for_sp) kini
-- menunggu endorsement Finance Manager (Rini Andriyani @ SOA) LEBIH DULU,
-- sebelum sampai ke persetujuan akhir Finance Controller/CEO yang sudah ada
-- (approve_invoice_issue, TIDAK DISENTUH berkas ini).
--
-- SATU status baru, DUA RPC baru, SATU RPC dilebarkan, DUA RPC dapat guard
-- tambahan, SATU role baru. Urutan rantai:
--
--   create_invoice_for_sp      draft/tidak ada  -> pending_manager_approval
--   endorse_invoice_issue      pending_manager_approval -> pending_approval
--   skip_invoice_endorsement   pending_manager_approval -> pending_approval
--                              (melompati endorse, alasan WAJIB, peran = peran
--                               approve_invoice_issue -- BUKAN finance_manager)
--   approve_invoice_issue      pending_approval -> issued      (TIDAK DISENTUH)
--   reject_invoice_issue       pending_manager_approval ATAU pending_approval
--                              -> draft (DILEBARKAN -- dulu cuma pending_approval)
--
-- ⛔ APPROVE_INVOICE_ISSUE TIDAK DISENTUH SAMA SEKALI (keputusan Den, PUTARAN
-- REVISI 13 Okt 2026): ia tetap HANYA menerima status pending_approval. Jalan
-- pintas "lompat tahap 1" BUKAN melebarkan fungsi itu -- itu aksi TERPISAH
-- (skip_invoice_endorsement, di bawah), supaya endorse/approve/skip masing-
-- masing punya jejak audit_logs sendiri yang jelas aksi mana yang terjadi,
-- bukan satu fungsi yang diam-diam menerima dua jalur masuk berbeda.
--
-- Dasar badan TIAP fungsi yang diubah = file migrasi TERAKHIR yang sungguh
-- mendefinisikannya (bukan schema_snapshot.sql, yang nol hit untuk
-- approve_invoice_issue/reject_invoice_issue dan ketinggalan revisi
-- create_invoice_for_sp -- diverifikasi grep sebelum menulis berkas ini):
--   - create_invoice_for_sp  <- 20260930000002 (SATU-satunya & TERAKHIR yang
--     mendefinisikannya -- diverifikasi grep seluruh 2026092*/2026093*.sql)
--   - reject_invoice_issue   <- 20260930000003 (SATU-satunya definisi)
--   - record_payment         <- 20260930000004 (SATU-satunya definisi v3)
--   - mark_ttf_received      <- 20260930000004 (SATU-satunya definisi versi
--     "isi sekali")
-- Diffnya terhadap basis masing-masing dijelaskan per blok di bawah.
--
-- KENAPA record_payment & mark_ttf_received IKUT DISENTUH, padahal tidak
-- disebut eksplisit di instruksi Den: keduanya memakai guard status gaya
-- SATU-PER-SATU (`IF v_inv_status = 'pending_approval' THEN RAISE
-- EXCEPTION`), BUKAN allowlist. Tanpa cabang baru di sini, invoice yang masih
-- pending_manager_approval (TAHAP PALING AWAL, bahkan sebelum invoice_no
-- lahir) akan LOLOS menerima pembayaran/TTF -- bug kelas yang sama dengan
-- yang TD-285/TD-286 catat soal record_payment, dan justru kenapa berkas
-- 20260930000004 lahir (menutup lubang yang sama untuk pending_approval).
-- submit_invoice (20260930000005) TIDAK perlu disentuh: guard-nya allowlist
-- (`IF v_status <> 'issued'`), otomatis menolak status baru ini juga.
-- sp_invoice_readiness/sp_invoice_readiness_all/sp_invoice_one_per_sp
-- (20260930000002) JUGA TIDAK perlu disentuh: ketiganya memakai
-- `status NOT IN ('draft','void')` -- pending_manager_approval otomatis
-- terhitung "invoice aktif" tanpa perubahan apa pun.
--
-- Peran finance_manager: level 7 (SAMA dengan finance_controller/finance/
-- ceo=1/gm=2/manager=4 -- lihat roles_level_check), BUKAN <= 6 (manager-ke-
-- atas) -- pola yang SAMA dengan finance_controller: wewenangnya datang dari
-- has_role('finance_manager') eksplisit di RPC, bukan dari sumbu
-- is_manager_or_above() yang lintas departemen (TD-297). company_id NULL
-- (roles global, 20260821000003).
--
-- ⛔ TIDAK ADA notifikasi di badan skip_invoice_endorsement. Disisir dulu:
-- NOL migrasi di seluruh repo yang pernah INSERT INTO notifications dari
-- badan RPC -- tabel itu SELALU diisi dari FRONTEND sesudah RPC-nya sukses
-- (pola LeadPoolPage.jsx: fetch role id -> fetch user_roles aktif di company
-- itu -> susun baris -> insert, best-effort). Menaruhnya di RPC akan jadi
-- SATU-SATUNYA penyimpangan dari konvensi itu. Fan-out notifikasi "semua
-- pemegang finance_manager di entitas itu, alasan dilompati" dibangun di FE
-- BERSAMAAN tombol Lompat Tahap -- yang MENUNGGU mockup Invoice Management
-- final (Den, revisi #2). Dicatat di LAPORAN, bukan diputuskan sendiri di
-- sini.
--
-- TAMPILAN (badge/label baru, tombol Endorse, tombol Lompat Tahap, filter)
-- SENGAJA TIDAK DIBANGUN di berkas ini -- menunggu mockup Invoice Management
-- diperbarui (keputusan Den, revisi #2). Frontend yang disentuh HANYA
-- src/lib/roles.js (dua fungsi gate baru, canEndorseInvoice/
-- canSkipInvoiceEndorsement -- siap dipakai, belum dipanggil dari UI apa
-- pun) dan src/modules/finance/invoiceStatus.js (label/tag/dueDateText/
-- invoiceNoLabel untuk status baru, supaya halaman yang ADA tidak menampilkan
-- teks mentah/kosong -- bukan desain baru).
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG -- pastikan basis yang diasumsikan masih hidup, dan berkas ini belum
-- pernah dijalankan di DB ini.
-- ---------------------------------------------------------------------------
DO $palang$
DECLARE v_def text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'sp_invoices' AND c.conname = 'sp_invoices_status_check'
       AND pg_get_constraintdef(c.oid) LIKE '%pending_manager_approval%'
  ) THEN
    RAISE EXCEPTION 'PALANG: sp_invoices_status_check SUDAH memuat pending_manager_approval -- berkas ini kemungkinan sudah pernah dijalankan.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'endorse_invoice_issue' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PALANG: endorse_invoice_issue SUDAH ADA.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'skip_invoice_endorsement' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PALANG: skip_invoice_endorsement SUDAH ADA.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp'
     AND oidvectortypes(p.proargtypes) = 'uuid, date';
  IF v_def IS NULL OR v_def NOT LIKE '%''pending_approval''%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp bukan versi 20260930000002 (pending_approval) yang diasumsikan berkas ini.';
  END IF;
  IF v_def LIKE '%''pending_manager_approval''%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp SUDAH menyebut pending_manager_approval -- berkas ini kemungkinan sudah pernah dijalankan.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'reject_invoice_issue' AND p.pronamespace = 'public'::regnamespace;
  IF v_def IS NULL OR v_def NOT LIKE '%v_status <> ''pending_approval''%' THEN
    RAISE EXCEPTION 'PALANG: reject_invoice_issue bukan versi 20260930000003 (guard tunggal pending_approval) yang diasumsikan berkas ini.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'record_payment' AND p.pronamespace = 'public'::regnamespace
     AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text, numeric, text';
  IF v_def IS NULL OR v_def LIKE '%pending_manager_approval%' THEN
    RAISE EXCEPTION 'PALANG: record_payment tidak ada atau SUDAH menyebut pending_manager_approval.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'mark_ttf_received' AND p.pronamespace = 'public'::regnamespace
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';
  IF v_def IS NULL OR v_def LIKE '%pending_manager_approval%' THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received tidak ada atau SUDAH menyebut pending_manager_approval.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.roles WHERE code = 'finance_manager') THEN
    RAISE EXCEPTION 'PALANG: role finance_manager SUDAH ADA.';
  END IF;

  RAISE NOTICE 'PALANG LOLOS: basis sesuai asumsi, berkas ini belum pernah dijalankan di DB ini.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan SEBELUM.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE v_n_pending_approval int; v_n_rmp int;
BEGIN
  SELECT count(*) INTO v_n_pending_approval FROM sp_invoices WHERE status = 'pending_approval' AND deleted_at IS NULL;
  SELECT count(*) INTO v_n_rmp FROM role_menu_permissions;
  RAISE NOTICE 'V0: % invoice hidup berstatus pending_approval hari ini (baris LAMA -- tetap di tahap itu, TIDAK dipindah mundur ke pending_manager_approval); role_menu_permissions=% baris.',
    v_n_pending_approval, v_n_rmp;
END
$v0$;

-- ---------------------------------------------------------------------------
-- (1) Status baru di CHECK constraint. Array SEBELUM (20260930000001): draft,
-- pending_approval, issued, submitted, partial, paid, void. SESUDAH: +
-- pending_manager_approval, disisipkan SEBELUM pending_approval (mencerminkan
-- urutan tahap, bukan sekadar ditempel di ekor).
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoices DROP CONSTRAINT sp_invoices_status_check;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'pending_manager_approval'::text,
                              'pending_approval'::text, 'issued'::text,
                              'submitted'::text, 'partial'::text, 'paid'::text,
                              'void'::text]));

-- ---------------------------------------------------------------------------
-- (2) create_invoice_for_sp -- SATU-SATUNYA perubahan: status INSERT
-- 'pending_approval' -> 'pending_manager_approval'. Guard peran, readiness
-- check, rantai termin, baris item/ongkir, hitung total -- SEGALANYA LAIN
-- byte-identik dengan 20260930000002.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_for_sp(p_sp_order_id uuid, p_invoice_date date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text;
  v_invoice_date date;
  v_invoice_id   uuid;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
  v_total_ship   numeric(18,2);
  v_override_days int; v_term_days int;
  v_term_label   text;
  v_cust_npwp    text;
  v_acc_rev      uuid; v_acc_ship uuid; v_tax_id uuid;
  v_siap         boolean; v_alasan_kode text; v_alasan_teks text;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mengajukan invoice.';
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

  SELECT btrim(COALESCE(tax_id, '')) INTO v_cust_npwp FROM accounts WHERE id = v_customer_id;

  -- invoice_no TIDAK diisi di sini -- lahir hanya saat approve_invoice_issue()
  -- (tahap akhir). status 'pending_manager_approval' (AR Tahap 3b lanjutan dua
  -- tahap, 20261013000001) -- menunggu endorsement Finance Manager LEBIH DULU,
  -- baru menunggu persetujuan akhir (pending_approval, lewat
  -- endorse_invoice_issue ATAU skip_invoice_endorsement), baru terbit.
  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_date, status, created_by,
                           source_type, customer_tax_id, payment_term_days, payment_term_label)
  VALUES (v_company_id, p_sp_order_id, v_invoice_date, 'pending_manager_approval', v_uid,
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

  -- post_invoice_journal() dan sp_recompute_status() TIDAK dipanggil di sini --
  -- keduanya tetap di approve_invoice_issue() (tahap akhir, TIDAK DISENTUH).
  -- Sampai disetujui tahap akhir, nol jurnal, nol perubahan status SP.
  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, new_data)
  VALUES (v_uid, v_company_id, 'AJUKAN_INVOICE', 'sp_invoices', v_invoice_id, v_sp_no,
          jsonb_build_object('sp_order_id', p_sp_order_id, 'total_amount', v_total_amount));

  RETURN v_invoice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_sp(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.create_invoice_for_sp(uuid, date) IS
  'Tahap PENGAJUAN saja -- menghasilkan baris pending_manager_approval TANPA invoice_no/jurnal (AR Tahap 3b lanjutan dua tahap, 20261013000001). Menunggu endorse_invoice_issue/skip_invoice_endorsement (-> pending_approval) lalu approve_invoice_issue (-> issued, penomoran + jurnal). Dipanggil dari create_invoice(uuid,date), TIDAK disentuh.';

-- ---------------------------------------------------------------------------
-- (3) endorse_invoice_issue -- BARU. Tahap 1: pending_manager_approval ->
-- pending_approval. Peran finance_manager (BARU, lihat blok (8)) atau
-- super_admin. Nol penomoran, nol jurnal -- keduanya tetap eksklusif milik
-- approve_invoice_issue (TIDAK DISENTUH berkas ini). Struktur guard/lock/
-- audit meniru approve_invoice_issue (20260930000003) sepanjang relevan.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.endorse_invoice_issue(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text; v_company_id uuid; v_created_by uuid; v_sp_no text; v_n int;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_manager')) THEN
    RAISE EXCEPTION 'Tidak punya izin meng-endorse invoice.';
  END IF;

  SELECT i.status, i.company_id, i.created_by, o.sp_no
    INTO v_status, v_company_id, v_created_by, v_sp_no
    FROM sp_invoices i JOIN sp_orders o ON o.id = i.sp_order_id
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL
    FOR UPDATE OF i;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status <> 'pending_manager_approval' THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma yang menunggu endorsement manager yang bisa di-endorse.', v_status;
  END IF;

  -- Tidak boleh meng-endorse pengajuan sendiri, kecuali super_admin -- syarat
  -- yang sama dengan approve_invoice_issue/reject_invoice_issue (jawaban Den).
  IF v_created_by = auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Tidak boleh meng-endorse invoice yang diajukan sendiri.';
  END IF;

  UPDATE sp_invoices
     SET status = 'pending_approval', updated_at = now()
   WHERE id = p_invoice_id AND status = 'pending_manager_approval';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Invoice sudah diproses orang lain. Muat ulang halamannya.';
  END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data)
  VALUES (auth.uid(), v_company_id, 'ENDORSE_INVOICE', 'sp_invoices', p_invoice_id, v_sp_no,
          jsonb_build_object('status', 'pending_manager_approval'),
          jsonb_build_object('status', 'pending_approval'));
END;
$fn$;

REVOKE ALL ON FUNCTION public.endorse_invoice_issue(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.endorse_invoice_issue(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.endorse_invoice_issue(uuid) TO authenticated;

COMMENT ON FUNCTION public.endorse_invoice_issue(uuid) IS
  'Tahap 1 (endorsement): pending_manager_approval -> pending_approval. Peran: super_admin/finance_manager. Nol penomoran/jurnal (tetap di approve_invoice_issue). Tidak boleh meng-endorse pengajuan sendiri kecuali super_admin. AR Tahap 3b lanjutan dua tahap, 20261013000001.';

-- ---------------------------------------------------------------------------
-- (4) skip_invoice_endorsement -- BARU. Jalan pintas melompati tahap 1:
-- pending_manager_approval -> pending_approval LANGSUNG, tanpa menunggu
-- finance_manager. Peran SAMA dengan approve_invoice_issue (finance_
-- controller/ceo/super_admin) -- BUKAN finance_manager (keputusan Den,
-- revisi #1: melompati endorsement adalah wewenang tahap akhir). p_reason
-- WAJIB. ⛔ NOL notifikasi di sini -- lihat catatan konvensi di kepala
-- berkas; fan-out ke pemegang finance_manager dibangun di FE bersamaan
-- tombolnya.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.skip_invoice_endorsement(p_invoice_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text; v_company_id uuid; v_created_by uuid; v_sp_no text; v_reason text; v_n int;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller') OR has_role('ceo')) THEN
    RAISE EXCEPTION 'Tidak punya izin melompati endorsement invoice.';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Alasan melompati endorsement wajib diisi.';
  END IF;

  SELECT i.status, i.company_id, i.created_by, o.sp_no
    INTO v_status, v_company_id, v_created_by, v_sp_no
    FROM sp_invoices i JOIN sp_orders o ON o.id = i.sp_order_id
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL
    FOR UPDATE OF i;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status <> 'pending_manager_approval' THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma yang menunggu endorsement manager yang bisa dilompati.', v_status;
  END IF;

  -- Larangan menyetujui/melompati pengajuan sendiri tetap berlaku, kecuali
  -- super_admin (jawaban Den, sama dengan approve/reject/endorse).
  IF v_created_by = auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Tidak boleh melompati endorsement invoice yang diajukan sendiri.';
  END IF;

  UPDATE sp_invoices
     SET status = 'pending_approval', updated_at = now()
   WHERE id = p_invoice_id AND status = 'pending_manager_approval';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Invoice sudah diproses orang lain. Muat ulang halamannya.';
  END IF;

  -- Aksi KHUSUS (LOMPATI_ENDORSEMENT, bukan ENDORSE_INVOICE) + alasan di
  -- jsonb DAN kolom notes -- pola yang sama dengan reject_invoice_issue
  -- (rejection_note), supaya alasannya mudah dicari tanpa membongkar jsonb.
  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_company_id, 'LOMPATI_ENDORSEMENT', 'sp_invoices', p_invoice_id, v_sp_no,
          jsonb_build_object('status', 'pending_manager_approval'),
          jsonb_build_object('status', 'pending_approval', 'reason', v_reason),
          v_reason);
END;
$fn$;

REVOKE ALL ON FUNCTION public.skip_invoice_endorsement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_invoice_endorsement(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.skip_invoice_endorsement(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.skip_invoice_endorsement(uuid, text) IS
  'Melompati tahap 1: pending_manager_approval -> pending_approval LANGSUNG, tanpa finance_manager. Peran SAMA dengan approve_invoice_issue (super_admin/finance_controller/ceo) -- BUKAN finance_manager. p_reason WAJIB, dicatat di audit_logs (aksi LOMPATI_ENDORSEMENT) + kolom notes. Notifikasi ke pemegang finance_manager dibangun di FE, bukan di sini -- lihat catatan konvensi di kepala berkas migrasi. AR Tahap 3b lanjutan dua tahap, 20261013000001.';

-- ---------------------------------------------------------------------------
-- (5) reject_invoice_issue -- DILEBARKAN ke dua status sumber. SATU-SATUNYA
-- perubahan: guard status (sebelumnya cuma pending_approval) + WHERE UPDATE
-- memakai v_status yang sudah dikunci (bukan literal 'pending_approval')
-- supaya optimistic-lock-nya benar untuk KEDUA tahap. Peran, guard "tidak
-- boleh menolak pengajuan sendiri", dan p_rejection_note WAJIB -- TIDAK
-- berubah (byte-identik 20260930000003).
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
  -- DILEBARKAN (AR Tahap 3b lanjutan dua tahap, 20261013000001): boleh
  -- menolak dari KEDUA tahap menunggu -- pending_manager_approval (tahap 1)
  -- ATAU pending_approval (tahap 2). Dulu cuma pending_approval.
  IF v_status NOT IN ('pending_manager_approval', 'pending_approval') THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma yang masih menunggu persetujuan (tahap manapun) yang bisa ditolak.', v_status;
  END IF;

  -- Tidak boleh menolak pengajuan sendiri, kecuali super_admin -- syarat
  -- yang sama dengan approve_invoice_issue (jawaban Den). TIDAK berubah.
  IF v_created_by = auth.uid() AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Tidak boleh menolak invoice yang diajukan sendiri.';
  END IF;

  -- WHERE memakai v_status (bukan literal) -- benar untuk KEDUA tahap
  -- sumber, dan tetap berfungsi sebagai optimistic lock yang sama ketat:
  -- v_status dibaca di baris yang SAMA yang baru dikunci FOR UPDATE di atas.
  UPDATE sp_invoices
     SET status = 'draft', rejected_by = auth.uid(), rejected_at = now(),
         rejection_note = v_note, updated_at = now()
   WHERE id = p_invoice_id AND status = v_status;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Invoice sudah diproses orang lain. Muat ulang halamannya.';
  END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_company_id, 'TOLAK_INVOICE', 'sp_invoices', p_invoice_id, v_sp_no,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'draft', 'rejection_note', v_note),
          v_note);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reject_invoice_issue(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_invoice_issue(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_invoice_issue(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reject_invoice_issue(uuid, text) IS
  'Menolak invoice dari TAHAP MANAPUN yang masih menunggu (pending_manager_approval ATAU pending_approval): kembali ke draft + rejection_note wajib (DILEBARKAN, AR Tahap 3b lanjutan dua tahap, 20261013000001 -- dulu cuma pending_approval). Peran TIDAK berubah; tidak boleh menolak pengajuan sendiri kecuali super_admin. Baris draft ini arsip -- pengajuan ulang lahir sebagai baris BARU lewat create_invoice_for_sp.';

-- ---------------------------------------------------------------------------
-- (6) record_payment -- SATU cabang guard status BARU disisip SEBELUM cabang
-- pending_approval yang sudah ada. SEGALANYA LAIN byte-identik 20260930000004
-- (v3 + guard pending_approval + peran finance).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id         uuid,
  p_amount             numeric,
  p_payment_date       date DEFAULT CURRENT_DATE,
  p_reference          text DEFAULT NULL::text,
  p_pph                numeric DEFAULT 0,
  p_bukti_potong_url   text DEFAULT NULL::text,
  p_bukti_potong_no    text DEFAULT NULL::text,
  p_potongan_lain      numeric DEFAULT 0,
  p_potongan_keterangan text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_tolerance       CONSTANT numeric := 1;
  v_uid             uuid := auth.uid();
  v_company_id      uuid;
  v_sp_order_id     uuid;
  v_total           numeric(18,2);
  v_inv_status      text;
  v_invoice_no      text;
  v_customer_id     uuid;
  v_sp_no           text;
  v_payment_id      uuid;
  v_settled_sebelum numeric(18,2);
  v_sisa_sebelum    numeric(18,2);
  v_bayar_ini       numeric(18,2);
  v_settled_baru    numeric(18,2);
  v_new_status      text;
  v_je_id           uuid;
  v_acc_bank        uuid;
  v_acc_ar          uuid;
  v_acc_pph         uuid;
  v_acc_potongan    uuid;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat pembayaran.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih besar dari nol.';
  END IF;
  IF COALESCE(p_pph, 0) < 0 THEN
    RAISE EXCEPTION 'PPh tidak boleh negatif.';
  END IF;
  IF COALESCE(p_potongan_lain, 0) < 0 THEN
    RAISE EXCEPTION 'Potongan lain tidak boleh negatif.';
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 AND COALESCE(btrim(p_potongan_keterangan), '') = '' THEN
    RAISE EXCEPTION 'Keterangan potongan wajib diisi kalau ada potongan lain.';
  END IF;

  -- Kunci baris invoice SEBELUM membaca total pembayaran yang sudah ada.
  -- sp_payments NOL GRANT INSERT ke authenticated -- record_payment satu-
  -- satunya jalur tulis -- jadi FOR UPDATE di sini cukup menyerialkan dua
  -- panggilan untuk invoice yang sama: panggilan kedua menunggu sampai yang
  -- pertama commit/rollback, baru membaca SUM(sp_payments) yang sudah
  -- termasuk pembayaran pertama. TD-285.
  SELECT i.company_id, i.sp_order_id, i.total_amount, i.status, i.invoice_no
    INTO v_company_id, v_sp_order_id, v_total, v_inv_status, v_invoice_no
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL
   FOR UPDATE;

  IF v_company_id IS NULL  THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_inv_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void - pembayaran tidak bisa dicatat.';
  END IF;
  IF v_inv_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft - terbitkan dulu sebelum mencatat pembayaran.';
  END IF;
  -- BARU (AR Tahap 3b lanjutan dua tahap, 20261013000001): tahap PALING AWAL
  -- -- bahkan sebelum menunggu persetujuan akhir -- juga belum bisa dibayar.
  -- Tanpa cabang ini, guard di bawah (gaya satu-per-satu, bukan allowlist)
  -- akan MELOLOSKAN status baru ini begitu saja.
  IF v_inv_status = 'pending_manager_approval' THEN
    RAISE EXCEPTION 'Invoice masih menunggu endorsement manager - belum bisa dicatat pembayarannya.';
  END IF;
  IF v_inv_status = 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice masih menunggu persetujuan - belum bisa dicatat pembayarannya.';
  END IF;
  IF v_inv_status = 'issued' THEN
    RAISE EXCEPTION 'Invoice % belum di-submit ke customer - submit dulu sebelum mencatat pembayaran.', COALESCE(v_invoice_no, '(tanpa nomor)');
  END IF;

  SELECT COALESCE(SUM(amount),0) + COALESCE(SUM(pph),0) + COALESCE(SUM(potongan_lain),0)
    INTO v_settled_sebelum
    FROM sp_payments WHERE invoice_id = p_invoice_id;

  v_sisa_sebelum := v_total - v_settled_sebelum;
  v_bayar_ini    := p_amount + COALESCE(p_pph,0) + COALESCE(p_potongan_lain,0);

  -- TD-286: PPh sendirian tidak boleh melebihi sisa tagihan -- diperiksa
  -- LEBIH DULU supaya pesannya menuduh PPh secara spesifik, bukan pesan
  -- umum di bawah. Ini bukan aturan terpisah dari TD-285: kalau PPh sendiri
  -- sudah melebihi sisa, guard total di bawah PASTI juga menolaknya (amount
  -- selalu > 0 menambah lebih jauh) -- guard ini murni supaya PESANNYA lebih
  -- tepat, bukan supaya ada pembatas kedua yang independen.
  IF COALESCE(p_pph,0) > v_sisa_sebelum + c_tolerance THEN
    RAISE EXCEPTION 'PPh 23 (Rp %) melebihi sisa tagihan invoice % (Rp %).',
      p_pph, COALESCE(v_invoice_no,'(tanpa nomor)'), GREATEST(v_sisa_sebelum, 0);
  END IF;

  -- TD-285: total pembayaran (kas + PPh + potongan lain) tidak boleh
  -- melebihi sisa tagihan. Toleransi = c_tolerance, SAMA dengan yang dipakai
  -- menentukan status 'paid' di bawah (TD-294) -- BUKAN angka baru untuk
  -- menutup potongan TTF (~2.900): itu jalur eksplisit p_potongan_lain,
  -- bukan toleransi yang diperlebar.
  IF v_bayar_ini > v_sisa_sebelum + c_tolerance THEN
    RAISE EXCEPTION 'Total pembayaran (Rp %) melebihi sisa tagihan invoice % (Rp %, toleransi Rp %).',
      v_bayar_ini, COALESCE(v_invoice_no,'(tanpa nomor)'), GREATEST(v_sisa_sebelum, 0), c_tolerance;
  END IF;

  -- AKUN lewat PERAN. PPh dan potongan hanya dicari kalau memang dipakai --
  -- pola sama dengan sebelumnya, supaya entitas tanpa peran itu tidak
  -- diblokir untuk pembayaran yang tidak memakainya.
  v_acc_bank := get_mapped_account(v_company_id, 'kas_bank');
  v_acc_ar   := get_mapped_account(v_company_id, 'piutang_usaha');
  IF COALESCE(p_pph, 0) > 0 THEN
    v_acc_pph := get_mapped_account(v_company_id, 'pph23_dibayar_dimuka');
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 THEN
    v_acc_potongan := get_mapped_account(v_company_id, 'potongan_pelanggan');
  END IF;

  INSERT INTO sp_payments
    (invoice_id, payment_date, amount, pph, potongan_lain, potongan_keterangan,
     reference, bukti_potong_url, bukti_potong_no, created_by)
  VALUES
    (p_invoice_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount,
     COALESCE(p_pph, 0), COALESCE(p_potongan_lain, 0), NULLIF(btrim(p_potongan_keterangan), ''),
     p_reference, p_bukti_potong_url, p_bukti_potong_no, v_uid)
  RETURNING id INTO v_payment_id;

  v_settled_baru := v_settled_sebelum + v_bayar_ini;

  v_new_status := CASE
    WHEN v_settled_baru >= (v_total - c_tolerance) THEN 'paid'
    WHEN v_settled_baru > 0                        THEN 'partial'
    ELSE v_inv_status END;

  IF v_new_status IS DISTINCT FROM v_inv_status THEN
    UPDATE sp_invoices SET status = v_new_status, updated_at = now() WHERE id = p_invoice_id;
  END IF;

  INSERT INTO journal_entries
    (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES
    (v_company_id, COALESCE(p_payment_date, CURRENT_DATE), 'payment_received', v_payment_id,
     'Penerimaan pembayaran invoice ' || COALESCE(v_invoice_no, '(tanpa nomor)'), v_uid)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_bank, p_amount, 0);
  IF COALESCE(p_pph, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_pph, p_pph, 0);
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_potongan, p_potongan_lain, 0);
  END IF;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, 0, p_amount + COALESCE(p_pph, 0) + COALESCE(p_potongan_lain, 0));

  IF v_new_status = 'paid' THEN
    SELECT customer_id, sp_no INTO v_customer_id, v_sp_no
      FROM sp_orders WHERE id = v_sp_order_id AND deleted_at IS NULL;
    IF v_customer_id IS NOT NULL THEN
      PERFORM sp_recompute_status(v_customer_id, v_sp_no);
    END IF;
  END IF;

  RETURN v_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) IS
  'v3 + guard pending_manager_approval + guard pending_approval + peran finance (AR Tahap 3b lanjutan dua tahap, 20261013000001). Badan SELAIN dua guard itu byte-identik dengan 20260930000004.';

-- ---------------------------------------------------------------------------
-- (7) mark_ttf_received -- SATU cabang guard status BARU, pola yang sama
-- dengan record_payment. SEGALANYA LAIN byte-identik 20260930000004.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_ttf_received(
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
  v_status        text;
  v_invoice_no    text;
  v_sp_order_id   uuid;
  v_customer_id   uuid;
  v_sp_no         text;
  v_company_id    uuid;
  v_ttf_id        uuid;
  v_ttf_lama      date;
  v_no_ttf_lama   text;
  v_diterima_lama text;
  v_notes_lama    text;
  v_no_ttf_baru   text;
  v_notes_baru    text;
  v_term_days     int;
  v_due_date      date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller') OR has_role('finance')) THEN
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
  -- BARU (AR Tahap 3b lanjutan dua tahap, 20261013000001) -- lihat alasan
  -- yang sama di record_payment di atas.
  IF v_status = 'pending_manager_approval' THEN
    RAISE EXCEPTION 'Invoice masih menunggu endorsement manager — TTF hanya bisa dicatat sesudah invoice terbit.';
  END IF;
  IF v_status = 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice masih menunggu persetujuan — TTF hanya bisa dicatat sesudah invoice terbit.';
  END IF;

  SELECT o.customer_id, o.sp_no, o.company_id INTO v_customer_id, v_sp_no, v_company_id
    FROM sp_orders o WHERE o.id = v_sp_order_id AND o.deleted_at IS NULL;

  SELECT t.id, t.tanggal_ttf, t.no_ttf, t.diterima_oleh, t.notes
    INTO v_ttf_id, v_ttf_lama, v_no_ttf_lama, v_diterima_lama, v_notes_lama
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
    -- tanggal_menerima SENGAJA TIDAK ADA di sini lagi (AR Tahap 3, koreksi
    -- UAT 20260929000010) -- ia "isi sekali" di cabang INSERT di atas.
    -- Mengedit TTF (tanggal_ttf/No. TTF/nama penerima/catatan) TIDAK boleh
    -- menimpa kapan TTF PERTAMA KALI dicatat.
    v_no_ttf_baru := COALESCE(NULLIF(btrim(p_ttf_no), ''), v_no_ttf_lama);
    v_notes_baru  := COALESCE(NULLIF(btrim(p_notes),  ''), v_notes_lama);

    UPDATE ar_ttfs SET
      tanggal_ttf      = p_ttf_date,
      diterima_oleh    = btrim(p_received_by),
      no_ttf = v_no_ttf_baru,
      notes  = v_notes_baru,
      sp_order_id = COALESCE(sp_order_id, v_sp_order_id),
      customer_id = COALESCE(customer_id, v_customer_id),
      no_inv = CASE WHEN no_inv = '' THEN COALESCE(v_invoice_no, '') ELSE no_inv END,
      no_sp  = CASE WHEN no_sp  = '' THEN COALESCE(v_sp_no, '')      ELSE no_sp  END
     WHERE id = v_ttf_id;

    -- AR Tahap 3 bagian kedua (TASK 3): jejak koreksi TTF, HANYA kalau
    -- sungguh ada yang berubah -- bukan setiap klik Simpan (kelas set_
    -- invoice_tax_info: audit_logs mencatat AKSI, bukan setiap panggilan).
    IF v_ttf_lama IS DISTINCT FROM p_ttf_date
       OR v_no_ttf_lama IS DISTINCT FROM v_no_ttf_baru
       OR v_diterima_lama IS DISTINCT FROM btrim(p_received_by)
       OR v_notes_lama IS DISTINCT FROM v_notes_baru
    THEN
      INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data)
      VALUES (auth.uid(), v_company_id, 'KOREKSI_TTF', 'ar_ttfs', v_ttf_id, v_invoice_no,
              jsonb_build_object('tanggal_ttf', v_ttf_lama, 'no_ttf', v_no_ttf_lama,
                                  'diterima_oleh', v_diterima_lama, 'notes', v_notes_lama),
              jsonb_build_object('tanggal_ttf', p_ttf_date, 'no_ttf', v_no_ttf_baru,
                                  'diterima_oleh', btrim(p_received_by), 'notes', v_notes_baru));
    END IF;
  END IF;

  -- due_date HANYA lahir dari tanggal_ttf, dan HANYA dihitung ulang kalau
  -- tanggal_ttf sungguh berubah (insert baru -> v_ttf_lama NULL; koreksi
  -- eksplisit -> nilainya beda). Mengedit No. TTF/nama penerima/catatan SAJA
  -- tidak menyentuh due_date. "due_date dihitung sekali lalu permanen"
  -- (rapat 13 Agu 2026) tetap berlaku -- yang berubah cuma PEMICUnya: TTF,
  -- bukan lagi submit/terbit. TIDAK DISENTUH unit kerja ini.
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
  'Versi 20260929000010 + guard pending_manager_approval + guard pending_approval + peran finance + jejak audit_logs KOREKSI_TTF (AR Tahap 3b lanjutan dua tahap, 20261013000001). is_manager_or_above() TETAP lintas departemen -- lihat TD-297.';

-- ---------------------------------------------------------------------------
-- (8) Role BARU finance_manager. Level 7 -- SAMA dengan finance_controller/
-- finance (BUKAN <= 6/manager-ke-atas): wewenangnya datang dari
-- has_role('finance_manager') eksplisit di endorse_invoice_issue, bukan dari
-- is_manager_or_above() lintas departemen (pola yang sama persis dengan
-- alasan finance_controller berada di level 7, bukan di tangga manajer).
-- company_id NULL (roles global, 20260821000003). ON CONFLICT (code) DO
-- NOTHING -- roles_code_unique (20260911000006).
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (code, name, description, is_system_role, is_active, company_id, level)
VALUES (
  'finance_manager', 'Finance Manager',
  'Tahap 1 persetujuan invoice dua tahap (endorsement) -- AR Tahap 3b lanjutan, '
  '20261013000001. Level 7, SAMA dengan finance_controller/finance: wewenangnya '
  'datang dari has_role(''finance_manager'') eksplisit di endorse_invoice_issue, '
  'bukan dari is_manager_or_above() lintas departemen. Role ini TIDAK diberikan ke '
  'siapa pun oleh migrasi -- Den menambahkannya ke akun Rini Andriyani @ SOA lewat '
  'Admin Settings sesudah migrasi ini LIVE (lihat Naskah Eksekusi 12_ANTREAN).',
  false, true, NULL, 7
)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (9) Izin menu fin_invoice untuk finance_manager -- tanpa ini, Rini tidak
-- akan melihat halaman Invoice Management sama sekali begitu role-nya
-- diberikan (pola sama dengan 20260927000004_menu_grant_fin_invoice -- key
-- `fin_invoice` + aksi `view` SUDAH ada, nol key/aksi baru lahir di sini).
-- Idempoten (ON CONFLICT DO NOTHING) -- aman dijalankan sebelum ATAU sesudah
-- role-nya diberikan ke siapa pun (hari ini: NOL pemegang, baris ini hanya
-- memastikan begitu Den memberikan role-nya, izin menunya sudah menunggu).
-- ---------------------------------------------------------------------------
DO $palang_menu$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_actions ma JOIN module_menus mm ON mm.id = ma.menu_id
     WHERE mm.key = 'fin_invoice' AND ma.action = 'view'
  ) THEN
    RAISE EXCEPTION 'PALANG: aksi `view` untuk fin_invoice tidak ada di menu_actions -- periksa katalog lebih dulu, jangan membuatnya di sini.';
  END IF;
END
$palang_menu$;

INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM public.module_menus mm
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
JOIN public.roles r ON r.code = 'finance_manager' AND r.deleted_at IS NULL AND r.is_active = true
WHERE mm.key = 'fin_invoice'
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

COMMIT;

-- =============================================================================
-- V-POST
-- =============================================================================
DO $vpost$
DECLARE v_def text; v_acl text; v_n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'sp_invoices' AND c.conname = 'sp_invoices_status_check'
       AND pg_get_constraintdef(c.oid) LIKE '%pending_manager_approval%'
  ) THEN
    RAISE EXCEPTION 'V-POST GAGAL: sp_invoices_status_check belum memuat pending_manager_approval.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp'
     AND oidvectortypes(p.proargtypes) = 'uuid, date';
  IF v_def NOT LIKE '%''pending_manager_approval''%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp belum meng-INSERT status pending_manager_approval.';
  END IF;
  IF v_def LIKE '%PERFORM post_invoice_journal%' OR v_def LIKE '%PERFORM sp_recompute_status%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp memanggil penomoran/jurnal -- seharusnya tetap eksklusif approve_invoice_issue.';
  END IF;

  -- approve_invoice_issue TIDAK DISENTUH -- pastikan masih persis badan
  -- 20260930000003 (guard tunggal pending_approval, nol pending_manager_approval).
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'approve_invoice_issue' AND p.pronamespace = 'public'::regnamespace;
  IF v_def LIKE '%pending_manager_approval%' OR v_def NOT LIKE '%v_status <> ''pending_approval''%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: approve_invoice_issue berubah -- seharusnya TIDAK DISENTUH berkas ini.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'endorse_invoice_issue' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'V-POST GAGAL: endorse_invoice_issue tidak ada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'skip_invoice_endorsement' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'V-POST GAGAL: skip_invoice_endorsement tidak ada.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'reject_invoice_issue' AND p.pronamespace = 'public'::regnamespace;
  IF v_def NOT LIKE '%v_status NOT IN (''pending_manager_approval'', ''pending_approval'')%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: reject_invoice_issue belum dilebarkan ke dua status.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'record_payment' AND p.pronamespace = 'public'::regnamespace
     AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text, numeric, text';
  IF v_def NOT LIKE '%pending_manager_approval%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment belum memuat guard pending_manager_approval.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.proname = 'mark_ttf_received' AND p.pronamespace = 'public'::regnamespace
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';
  IF v_def NOT LIKE '%pending_manager_approval%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: mark_ttf_received belum memuat guard pending_manager_approval.';
  END IF;

  -- ACL keempat fungsi yang diubah/baru -- authenticated-only.
  FOR v_def IN SELECT unnest(ARRAY['endorse_invoice_issue','skip_invoice_endorsement']) LOOP
    SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
      FROM pg_proc p WHERE p.proname = v_def AND p.pronamespace = 'public'::regnamespace;
    IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
       OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
      RAISE EXCEPTION 'V-POST GAGAL: ACL % salah. ACL: %', v_def, v_acl;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE code = 'finance_manager' AND is_active = true AND company_id IS NULL AND level = 7) THEN
    RAISE EXCEPTION 'V-POST GAGAL: role finance_manager tidak ada / salah bentuk (harus aktif, company_id NULL, level 7).';
  END IF;

  SELECT count(*) INTO v_n
    FROM role_menu_permissions rmp
    JOIN menu_actions ma ON ma.id = rmp.menu_action_id
    JOIN module_menus mm ON mm.id = ma.menu_id
    JOIN roles r ON r.id = rmp.role_id
   WHERE mm.key = 'fin_invoice' AND r.code = 'finance_manager';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'V-POST GAGAL: grant fin_invoice untuk finance_manager = % baris, diharapkan tepat 1.', v_n;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: status baru + 2 RPC baru + 3 RPC dilebarkan/ditambah guard + role finance_manager + grant fin_invoice -- semua sesuai asersi.';
END
$vpost$;

-- =============================================================================
-- ROLLBACK -- HANYA aman kalau NOL baris sp_invoices berstatus
-- pending_manager_approval hidup (kalau ada, baris itu akan macet permanen --
-- status itu lenyap dari CHECK constraint dan dari jalur approve manapun).
-- Periksa dulu:
--
--   SELECT count(*) FROM sp_invoices WHERE status = 'pending_manager_approval';
--   -- harus 0 sebelum rollback di bawah.
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.endorse_invoice_issue(uuid);
--   DROP FUNCTION IF EXISTS public.skip_invoice_endorsement(uuid, text);
--   DELETE FROM public.role_menu_permissions rmp
--    USING public.menu_actions ma, public.module_menus mm, public.roles r
--    WHERE ma.id = rmp.menu_action_id AND mm.id = ma.menu_id AND r.id = rmp.role_id
--      AND mm.key = 'fin_invoice' AND r.code = 'finance_manager' AND ma.action = 'view';
--   -- JANGAN DELETE FROM roles WHERE code='finance_manager' kalau role itu
--   -- sudah diberikan ke user mana pun (Admin Settings) -- cek user_roles
--   -- dulu; kalau nol pemegang, DELETE FROM roles WHERE code='finance_manager'
--   -- aman.
--   -- (tempel ulang CREATE OR REPLACE FUNCTION reject_invoice_issue dari
--   --  20260930000003_ar_tahap3b_approve_reject_invoice.sql -- guard tunggal
--   --  pending_approval)
--   -- (tempel ulang CREATE OR REPLACE FUNCTION record_payment +
--   --  mark_ttf_received dari 20260930000004_ar_tahap3b_record_payment_ttf_pending_guard.sql)
--   -- (tempel ulang CREATE OR REPLACE FUNCTION create_invoice_for_sp dari
--   --  20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate.sql --
--   --  status INSERT kembali 'pending_approval')
--   ALTER TABLE public.sp_invoices DROP CONSTRAINT sp_invoices_status_check;
--   ALTER TABLE public.sp_invoices
--     ADD CONSTRAINT sp_invoices_status_check
--     CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'issued'::text,
--                                 'submitted'::text, 'partial'::text, 'paid'::text, 'void'::text]));
--   COMMIT;
-- =============================================================================
