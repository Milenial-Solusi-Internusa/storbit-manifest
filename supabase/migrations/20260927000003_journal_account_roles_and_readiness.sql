-- =============================================================================
-- 20260927000003_journal_account_roles_and_readiness.sql
--                                              (AR Tahap 2, butir 3 dari 3)
--
-- DUA perubahan, satu berkas, karena keduanya menulis ulang fungsi yang SAMA dan
-- memecahnya jadi dua migrasi berarti create_invoice_for_sp ditulis ulang dua
-- kali berturut-turut -- dua kali kesempatan salah transkripsi, bukan satu.
--
--   (A) Jurnal berhenti mencari akun lewat KODE. Enam lookup
--       `SELECT id FROM chart_of_accounts WHERE code = '...'` di
--       create_invoice_for_sp dan record_payment diganti get_mapped_account().
--
--   (B) Alasan "SP ini belum bisa ditagih" punya SATU implementasi.
--       Fungsi baru sp_invoice_readiness() memegang aturannya, dan
--       create_invoice_for_sp MEMANGGILNYA -- bukan menyalinnya. FE dan DB tidak
--       "disamakan"; mereka memang satu kode.
--
-- ⛔ PALANG: berkas ini menolak jalan kalau 20260927000002 belum jalan, DAN
-- kalau create_invoice_for_sp yang hidup belum versi AR Tahap 1. Yang kedua
-- penting untuk PRODUKSI: di sana Tahap 1 belum naik, dan menulis ulang fungsi
-- dari berkas ini akan diam-diam MEMASANG guard Tahap 1 di luar urutan antrean.
--
-- URUTAN GUARD DIPERTAHANKAN PERSIS (keputusan Den K-2):
--   1. sudah punya invoice aktif
--   2. belum terkirim penuh
--   3. belum ada BTB
--   4. ada Surat Jalan yang belum selesai
--   5. belum ada Surat Jalan delivered ber-tanggal ditandatangani
-- sp_invoice_readiness mengembalikan kegagalan PERTAMA menurut urutan itu, jadi
-- pesan yang dilempar create_invoice_for_sp = pesan yang dilemparnya hari ini.
-- Teks pesannya disalin verbatim; yang berubah hanya TEMPAT teks itu dirakit.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG
-- ---------------------------------------------------------------------------
DO $palang$
DECLARE v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'account_role_mappings'
  ) THEN
    RAISE EXCEPTION 'PALANG: tabel account_role_mappings tidak ada -- jalankan 20260927000002 lebih dulu.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_mapped_account'
  ) THEN
    RAISE EXCEPTION 'PALANG: fungsi get_mapped_account tidak ada -- jalankan 20260927000002 lebih dulu.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp tidak ada di DB ini.';
  END IF;

  IF v_def NOT LIKE '%Invariant piutang gagal%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp yang hidup BUKAN versi AR Tahap 1 (penanda invariant piutang tidak ditemukan). Jalankan 20260926000002 lebih dulu -- kalau tidak, berkas ini akan memasang guard Tahap 1 di luar urutan antrean produksi.';
  END IF;

  RAISE NOTICE 'PALANG LOLOS: 20260927000002 terpasang, create_invoice_for_sp = versi AR Tahap 1.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan sebelum.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE
  v_n_peta int;
  v_kode_inv int;
  v_kode_bayar int;
BEGIN
  SELECT count(*) INTO v_n_peta FROM account_role_mappings;

  SELECT count(*) INTO v_kode_inv FROM regexp_matches(
    (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_invoice_for_sp'), '''[1-9]-[0-9]{4}''', 'g');

  SELECT count(*) INTO v_kode_bayar FROM regexp_matches(
    (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='record_payment'), '''[1-9]-[0-9]{4}''', 'g');

  RAISE NOTICE 'V0: pemetaan peran akun % baris; kode akun hardcode -> create_invoice_for_sp %, record_payment %',
    v_n_peta, v_kode_inv, v_kode_bayar;

  IF v_n_peta = 0 THEN
    RAISE EXCEPTION 'PALANG: account_role_mappings KOSONG. Menjalankan berkas ini sekarang membuat setiap penerbitan invoice gagal keras. Isi pemetaannya lebih dulu.';
  END IF;
END
$v0$;

-- ---------------------------------------------------------------------------
-- (B1) sp_invoice_readiness -- SATU sumber aturan "boleh ditagih atau belum".
--
-- 100% BACA. Tidak menulis apa pun, tidak memanggil apa pun yang menulis.
--
-- SECURITY DEFINER, dan itu keputusan sadar: fungsi ini harus memberi jawaban
-- yang SAMA lewat dua jalur -- dipanggil FE (halaman Siap Ditagih) dan dipanggil
-- create_invoice_for_sp (yang DEFINER, jadi melihat semua baris). Kalau ia
-- INVOKER, FE bisa melewatkan Surat Jalan yang RLS sembunyikan dari pemakainya
-- lalu melaporkan "siap" untuk SP yang sebenarnya ditolak guard -- persis
-- divergensi yang fungsi ini ada untuk mencegahnya.
-- Yang dibocorkannya kecil dan terukur: satu boolean + satu alasan, untuk SP
-- yang id-nya sudah harus diketahui pemanggil.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_invoice_readiness(p_sp_order_id uuid)
RETURNS TABLE (siap boolean, alasan_kode text, alasan_teks text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sp_no     text;
  v_ordered   int;
  v_shipped   int;
  v_sj_belum  text;
  v_dn_count  int;
BEGIN
  SELECT o.sp_no INTO v_sp_no
    FROM sp_orders o WHERE o.id = p_sp_order_id AND o.deleted_at IS NULL;

  IF v_sp_no IS NULL THEN
    RETURN QUERY SELECT false, 'SP_TIDAK_DITEMUKAN', 'SP tidak ditemukan.';
    RETURN;
  END IF;

  -- 1. invoice aktif
  IF EXISTS (SELECT 1 FROM sp_invoices WHERE sp_order_id = p_sp_order_id AND status <> 'void') THEN
    RETURN QUERY SELECT false, 'SUDAH_ADA_INVOICE', 'SP ini sudah punya invoice aktif.';
    RETURN;
  END IF;

  -- 2. terkirim penuh
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  IF v_ordered = 0 OR v_shipped <> v_ordered THEN
    RETURN QUERY SELECT false, 'BELUM_TERKIRIM_PENUH',
      format('SP belum terkirim penuh (Sigma shipped=%s, Sigma qty=%s) - invoice tidak bisa diterbitkan.', v_shipped, v_ordered);
    RETURN;
  END IF;

  -- 3. BTB hidup
  IF NOT EXISTS (SELECT 1 FROM sp_btb b
                  WHERE b.sp_order_id = p_sp_order_id AND b.deleted_at IS NULL) THEN
    RETURN QUERY SELECT false, 'BELUM_ADA_BTB',
      format('SP %s belum punya BTB - invoice tidak bisa diterbitkan. Terbitkan BTB lebih dulu di Detail SP.', v_sp_no);
    RETURN;
  END IF;

  -- 4. Surat Jalan yang belum selesai
  SELECT string_agg(d.do_no || ' (' || d.status || ')', ', ' ORDER BY d.do_no)
    INTO v_sj_belum
    FROM delivery_notes d
   WHERE d.sp_order_id = p_sp_order_id
     AND d.status NOT IN ('delivered','cancelled');
  IF v_sj_belum IS NOT NULL THEN
    RETURN QUERY SELECT false, 'SJ_BELUM_SELESAI',
      format('SP %s masih punya Surat Jalan yang belum selesai: %s. Selesaikan atau batalkan dulu sebelum menerbitkan invoice.', v_sp_no, v_sj_belum);
    RETURN;
  END IF;

  -- 5. Surat Jalan delivered ber-tanggal ditandatangani
  SELECT count(*) INTO v_dn_count FROM delivery_notes
   WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  IF v_dn_count = 0 THEN
    RETURN QUERY SELECT false, 'SJ_TANPA_TANGGAL_TTD',
      'Belum ada Surat Jalan berstatus delivered dengan tanggal ditandatangani untuk SP ini. Kalau Surat Jalannya sudah sampai tapi tanggalnya belum diisi, pakai Lengkapi Tanggal Ditandatangani.';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'SIAP', 'Siap ditagih.';
END;
$fn$;

REVOKE ALL ON FUNCTION public.sp_invoice_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_invoice_readiness(uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_invoice_readiness(uuid) IS
  'SATU sumber aturan "SP boleh ditagih atau belum". 100% BACA. Dipanggil FE (halaman Siap Ditagih) DAN create_invoice_for_sp, supaya alasan yang ditampilkan tidak pernah menyimpang dari guard yang menolak. AR Tahap 2, 20260927000003.';

-- ---------------------------------------------------------------------------
-- (B2) sp_invoice_readiness_all -- daftar untuk halaman Siap Ditagih.
--
-- SECURITY INVOKER, dan perbedaannya dengan (B1) disengaja:
--   SP mana yang BOLEH DILIHAT seseorang = urusan RLS  -> INVOKER
--   KENAPA sebuah SP tertahan                = urusan guard -> DEFINER (B1)
-- Dengan begitu daftarnya tidak pernah menampilkan SP milik entitas yang tak
-- boleh dibuka pemakainya, sementara alasannya tetap dihitung dari aturan yang
-- sama dengan yang menolak di DB.
--
-- Cakupan baris = SP terkirim penuh yang belum punya invoice aktif. Dua alasan
-- pertama sp_invoice_readiness (SUDAH_ADA_INVOICE, BELUM_TERKIRIM_PENUH) karena
-- itu tidak akan pernah muncul di sini -- itu BUKAN duplikasi aturan, melainkan
-- definisi "kandidat" halaman ini.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_invoice_readiness_all(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  sp_order_id  uuid,
  sp_no        text,
  customer_id  uuid,
  sp_date      date,
  n_sj         int,
  n_btb        int,
  siap         boolean,
  alasan_kode  text,
  alasan_teks  text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH kandidat AS (
    SELECT o.id, o.sp_no, o.customer_id, o.sp_date
      FROM sp_orders o
     WHERE o.deleted_at IS NULL
       AND (p_company_id IS NULL OR o.company_id = p_company_id)
       AND NOT EXISTS (
         SELECT 1 FROM sp_invoices i
          WHERE i.sp_order_id = o.id AND i.status <> 'void' AND i.deleted_at IS NULL
       )
       AND (SELECT COALESCE(SUM(soi.qty),0) FROM sp_order_items soi WHERE soi.sp_order_id = o.id) > 0
       AND (SELECT COALESCE(SUM(soi.qty),0) FROM sp_order_items soi WHERE soi.sp_order_id = o.id)
         = (SELECT COALESCE(SUM(soi.shipped_qty),0) FROM sp_order_items soi WHERE soi.sp_order_id = o.id)
  )
  SELECT k.id, k.sp_no, k.customer_id, k.sp_date,
         (SELECT count(*)::int FROM delivery_notes d
           WHERE d.sp_order_id = k.id AND d.status <> 'cancelled'),
         (SELECT count(*)::int FROM sp_btb b
           WHERE b.sp_order_id = k.id AND b.deleted_at IS NULL),
         r.siap, r.alasan_kode, r.alasan_teks
    FROM kandidat k
    CROSS JOIN LATERAL public.sp_invoice_readiness(k.id) r
   ORDER BY k.sp_date, k.sp_no;
$fn$;

REVOKE ALL ON FUNCTION public.sp_invoice_readiness_all(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_invoice_readiness_all(uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_invoice_readiness_all(uuid) IS
  'Daftar SP terkirim penuh belum ber-invoice beserta kesiapannya, untuk halaman Siap Ditagih. SECURITY INVOKER (RLS menentukan SP mana yang terlihat); alasannya dihitung sp_invoice_readiness. AR Tahap 2, 20260927000003.';

-- ---------------------------------------------------------------------------
-- (A1 + B3) create_invoice_for_sp
--
-- Yang berubah dari versi AR Tahap 1, dan HANYA ini:
--   * lima blok guard diganti satu panggilan sp_invoice_readiness
--   * empat lookup kode akun diganti get_mapped_account
-- Sisanya -- penomoran, sp_invoice_lines, pembagian per Surat Jalan, invariant,
-- sp_recompute_status -- disalin apa adanya.
-- ---------------------------------------------------------------------------
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
  v_acc_ar       uuid;
  v_acc_rev      uuid;
  v_acc_ship     uuid;
  v_acc_ppn_out  uuid;
  dn             RECORD;
  v_je_id        uuid;
  v_dpp_sj       numeric(18,2); v_ppn_sj numeric(18,2); v_ship_sj numeric(18,2); v_amount_sj numeric(18,2);
  v_override_days int; v_term_days int; v_due_date date;
  v_je_count     int := 0;
  v_debit_ar     numeric(18,2);
  v_toleransi    numeric(18,2);
  v_siap         boolean; v_alasan_kode text; v_alasan_teks text;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin menerbitkan invoice.';
  END IF;

  SELECT company_id, customer_id, sp_no INTO v_company_id, v_customer_id, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;

  -- GUARD -- SATU sumber. Urutan pemeriksaan hidup di sp_invoice_readiness;
  -- jangan menambah guard di sini, tambahkan DI SANA supaya FE ikut tahu.
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

  -- Rantai termin tiga tingkat, sama persis dengan submit_invoice.
  -- !! TODO Tahap 3: submit_invoice masih menghitung ini juga (idempoten, nilai
  -- sama). Mengubah rantai berarti menyentuh KEDUA fungsi.
  SELECT invoice_payment_terms_days INTO v_override_days FROM accounts WHERE id = v_customer_id;
  IF v_override_days IS NOT NULL THEN
    v_term_days := v_override_days;
  ELSE
    SELECT (CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END) INTO v_term_days
      FROM entity_finance_settings efs
      LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
      WHERE efs.company_id = v_company_id;
    IF v_term_days IS NULL THEN
      SELECT default_payment_terms INTO v_term_days FROM entity_finance_settings WHERE company_id = v_company_id;
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

  UPDATE sp_invoices SET total_dpp = v_total_dpp, total_ppn = v_total_ppn,
         total_amount = v_total_amount, due_date = v_due_date
   WHERE id = v_invoice_id;

  -- AKUN -- lewat PERAN, bukan kode. get_mapped_account sendiri yang melempar
  -- pesan kalau perannya belum dipetakan, jadi tidak ada IF NULL di sini.
  v_acc_ar      := get_mapped_account(v_company_id, 'piutang_usaha');
  v_acc_rev     := get_mapped_account(v_company_id, 'pendapatan_barang');
  v_acc_ppn_out := get_mapped_account(v_company_id, 'ppn_keluaran');
  IF v_total_ship > 0 THEN
    v_acc_ship  := get_mapped_account(v_company_id, 'pendapatan_jasa_kirim');
  END IF;

  FOR dn IN
    SELECT d.id, d.do_no, d.signed_date
    FROM delivery_notes d
    WHERE d.sp_order_id = p_sp_order_id AND d.status = 'delivered' AND d.signed_date IS NOT NULL
    ORDER BY d.signed_date
  LOOP
    IF EXISTS (SELECT 1 FROM delivery_note_items dni
                WHERE dni.delivery_note_id = dn.id AND dni.sp_order_item_id IS NULL) THEN
      RAISE EXCEPTION 'Surat Jalan % punya baris barang tanpa kaitan ke item SP (sp_order_item_id NULL) - jurnal tidak bisa dihitung. Jalankan migrasi 20260925000001 (backfill) lebih dulu.', dn.do_no;
    END IF;

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

    v_je_count := v_je_count + 1;

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

  SELECT COALESCE(SUM(jl.debit),0) INTO v_debit_ar
    FROM journal_entries je
    JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
   WHERE je.reference_type = 'invoice_issued' AND je.reference_id = v_invoice_id
     AND jl.account_id = v_acc_ar;

  v_toleransi := GREATEST(v_je_count, 1) * 1;

  IF abs(v_debit_ar - v_total_amount) > v_toleransi THEN
    RAISE EXCEPTION 'Invariant piutang gagal untuk SP %: debit piutang % tidak sama dengan total invoice % (selisih %, toleransi % untuk % Surat Jalan berjurnal). Invoice DIBATALKAN.',
      v_sp_no, v_debit_ar, v_total_amount, abs(v_debit_ar - v_total_amount), v_toleransi, v_je_count;
  END IF;

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- (A2) record_payment -- tiga lookup kode akun diganti get_mapped_account.
-- Sisanya disalin apa adanya dari versi AR Tahap 1, termasuk guard peran
-- (super_admin / finance_controller) dan penolakan invoice `issued`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_reference text DEFAULT NULL::text, p_pph numeric DEFAULT 0, p_bukti_potong_url text DEFAULT NULL::text, p_bukti_potong_no text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_tolerance   CONSTANT numeric := 1;
  v_uid         uuid := auth.uid();
  v_company_id  uuid;
  v_sp_order_id uuid;
  v_total       numeric(18,2);
  v_inv_status  text;
  v_invoice_no  text;
  v_customer_id uuid;
  v_sp_no       text;
  v_payment_id  uuid;
  v_settled     numeric(18,2);
  v_new_status  text;
  v_je_id       uuid;
  v_acc_bank    uuid;
  v_acc_ar      uuid;
  v_acc_pph     uuid;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat pembayaran.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih besar dari nol.';
  END IF;
  IF COALESCE(p_pph, 0) < 0 THEN
    RAISE EXCEPTION 'PPh tidak boleh negatif.';
  END IF;

  SELECT i.company_id, i.sp_order_id, i.total_amount, i.status, i.invoice_no
    INTO v_company_id, v_sp_order_id, v_total, v_inv_status, v_invoice_no
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL;

  IF v_company_id IS NULL  THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_inv_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void - pembayaran tidak bisa dicatat.';
  END IF;
  IF v_inv_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft - terbitkan dulu sebelum mencatat pembayaran.';
  END IF;
  IF v_inv_status = 'issued' THEN
    RAISE EXCEPTION 'Invoice % belum di-submit ke customer - submit dulu sebelum mencatat pembayaran.', COALESCE(v_invoice_no, '(tanpa nomor)');
  END IF;

  -- AKUN lewat PERAN. PPh hanya dicari kalau memang ada potongannya -- pola yang
  -- sama dengan sebelumnya, supaya entitas tanpa peran pph23 tidak diblokir
  -- untuk pembayaran yang tidak memakainya.
  v_acc_bank := get_mapped_account(v_company_id, 'kas_bank');
  v_acc_ar   := get_mapped_account(v_company_id, 'piutang_usaha');
  IF COALESCE(p_pph, 0) > 0 THEN
    v_acc_pph := get_mapped_account(v_company_id, 'pph23_dibayar_dimuka');
  END IF;

  INSERT INTO sp_payments
    (invoice_id, payment_date, amount, pph, reference, bukti_potong_url, bukti_potong_no, created_by)
  VALUES
    (p_invoice_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount,
     COALESCE(p_pph, 0), p_reference, p_bukti_potong_url, p_bukti_potong_no, v_uid)
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) + COALESCE(SUM(pph), 0)
    INTO v_settled
    FROM sp_payments WHERE invoice_id = p_invoice_id;

  v_new_status := CASE
    WHEN v_settled >= (v_total - c_tolerance) THEN 'paid'
    WHEN v_settled > 0                        THEN 'partial'
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
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, 0, p_amount + COALESCE(p_pph, 0));

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

-- ---------------------------------------------------------------------------
-- V1 -- sesudah.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_kode_inv   int;
  v_kode_bayar int;
  v_pakai_inv  boolean;
  v_pakai_byr  boolean;
  v_pakai_rdy  boolean;
  v_acl_rdy    text;
  v_acl_all    text;
BEGIN
  SELECT count(*) INTO v_kode_inv FROM regexp_matches(
    (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_invoice_for_sp'), '''[1-9]-[0-9]{4}''', 'g');

  SELECT count(*) INTO v_kode_bayar FROM regexp_matches(
    (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='record_payment'), '''[1-9]-[0-9]{4}''', 'g');

  SELECT p.prosrc LIKE '%get_mapped_account%' INTO v_pakai_inv
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';

  SELECT p.prosrc LIKE '%get_mapped_account%' INTO v_pakai_byr
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='record_payment';

  SELECT p.prosrc LIKE '%sp_invoice_readiness%' INTO v_pakai_rdy
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';

  IF v_kode_inv > 0 OR v_kode_bayar > 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: masih ada kode akun hardcode (create_invoice_for_sp=%, record_payment=%).', v_kode_inv, v_kode_bayar;
  END IF;

  IF NOT v_pakai_inv OR NOT v_pakai_byr THEN
    RAISE EXCEPTION 'V1 GAGAL: get_mapped_account belum dipakai (invoice=%, bayar=%).', v_pakai_inv, v_pakai_byr;
  END IF;

  IF NOT v_pakai_rdy THEN
    RAISE EXCEPTION 'V1 GAGAL: create_invoice_for_sp tidak memanggil sp_invoice_readiness -- guard-nya masih salinan.';
  END IF;

  -- Invariant Tahap 1 WAJIB masih ada. Kalau hilang, berkas ini diam-diam
  -- mencabut lapis terakhir yang menjaga jurnal tidak timpang.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='create_invoice_for_sp'
       AND p.prosrc LIKE '%Invariant piutang gagal%'
  ) THEN
    RAISE EXCEPTION 'V1 GAGAL: invariant piutang AR Tahap 1 hilang dari create_invoice_for_sp.';
  END IF;

  -- ACL dua fungsi baru: PUBLIC harus TERCABUT. PUBLIC diwakili grantee KOSONG
  -- berawalan '=' (gotcha #40); proacl NULL berarti PUBLIC EXECUTE.
  SELECT COALESCE(array_to_string(p.proacl::text[], ' | '), '(NULL)') INTO v_acl_rdy
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='sp_invoice_readiness';

  SELECT COALESCE(array_to_string(p.proacl::text[], ' | '), '(NULL)') INTO v_acl_all
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='sp_invoice_readiness_all';

  IF v_acl_rdy = '(NULL)' OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
              unnest(p.proacl::text[]) AS a
     WHERE n.nspname='public' AND p.proname='sp_invoice_readiness' AND a LIKE '=%'
  ) THEN
    RAISE EXCEPTION 'V1 GAGAL: sp_invoice_readiness masih ber-PUBLIC EXECUTE (acl=%).', v_acl_rdy;
  END IF;

  IF v_acl_all = '(NULL)' OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
              unnest(p.proacl::text[]) AS a
     WHERE n.nspname='public' AND p.proname='sp_invoice_readiness_all' AND a LIKE '=%'
  ) THEN
    RAISE EXCEPTION 'V1 GAGAL: sp_invoice_readiness_all masih ber-PUBLIC EXECUTE (acl=%).', v_acl_all;
  END IF;

  RAISE NOTICE 'V1 LOLOS: nol kode akun hardcode; get_mapped_account dipakai dua fungsi; guard lewat sp_invoice_readiness; invariant Tahap 1 utuh; ACL readiness=% / readiness_all=%',
    v_acl_rdy, v_acl_all;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Pulihkan badan create_invoice_for_sp dan record_payment dari cadangan yang
-- diambil SEBELUM berkas ini jalan, dan pakai cadangan yang cocok dengan
-- LINGKUNGANNYA (staging dan produksi berbeda -- Tahap 1 sudah jalan di staging).
--
--   DROP FUNCTION IF EXISTS public.sp_invoice_readiness_all(uuid);
--   DROP FUNCTION IF EXISTS public.sp_invoice_readiness(uuid);
--
-- ⛔ Kalau readiness di-DROP, FE ReadyToInvoicePage berhenti bekerja (RPC-nya
-- hilang). Kalau readiness DIBIARKAN hidup tapi create_invoice_for_sp dipulihkan
-- ke salinan guard-nya sendiri, keduanya bisa menyimpang -- dan itu justru
-- keadaan yang Tahap 2 ada untuk mencegahnya. Rollback FE-nya sekalian.
--
-- ⛔ JANGAN DROP FUNCTION lalu CREATE untuk create_invoice_for_sp/record_payment
-- -- itu mereset ACL. Cadangannya CREATE OR REPLACE, jalankan apa adanya.
-- =============================================================================
