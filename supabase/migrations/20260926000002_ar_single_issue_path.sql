-- =============================================================================
-- Migration: 20260926000002_ar_single_issue_path
-- Phase:     AR Tahap 1 (2 dari 2) -- SATU jalur penerbitan invoice.
--
-- Status:    LIVE DI STAGING (25 Sep 2026) - BELUM DIJALANKAN DI PRODUCTION.
--
-- -- MASALAH ----------------------------------------------------------------
--   Ada DUA fungsi penerbit invoice yang hidup bersamaan:
--     create_invoice         (dipakai FE, 1 jurnal per invoice, nol guard BTB/SJ)
--     create_invoice_for_sp  (jurnal dipecah per Surat Jalan, tak pernah dipakai FE)
--   Keduanya menulis sp_invoices + sp_invoice_lines + journal_entries dengan
--   aturan yang BERBEDA. Selama dua-duanya ada, "bagaimana invoice dijurnal"
--   tidak punya satu jawaban.
--
-- -- ISI --------------------------------------------------------------------
--   a. create_invoice jadi pembungkus tipis -> create_invoice_for_sp.
--   b. due_date dihitung SAAT INVOICE TERBIT (sebelumnya hanya saat submit).
--   c. record_payment menolak invoice berstatus issued.
--   d. TIGA guard baru di create_invoice_for_sp (BTB - SJ belum delivered -
--      invariant debit piutang).
--   e. create_invoice + create_invoice_for_sp + submit_invoice:
--      REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO authenticated.
--   f. DROP overload mark_delivery_delivered(uuid).
--
-- -- ⛔ INI MENYEMPITKAN. RADIUS DAMPAK DI PRODUKSI (diukur 25 Sep 2026) -----
--   SP terkirim penuh belum ber-invoice                          62
--     -> LOLOS ketiga guard, masih bisa ditagih hari-1             5
--     -> tertahan HANYA karena signed_date kosong                  9   (dibuka 20260926000001)
--     -> tertahan karena BTB belum ada                            47
--     -> tertahan karena ada SJ belum delivered                    1
--   Jadi yang bisa ditagih menyempit 62 -> 5, lalu -> 14 setelah 9 tanggal
--   dilengkapi. 47 sisanya tertahan BTB, dan itu DITERIMA sebagai konsekuensi
--   aturan CEO (kirim penuh + BTB lengkap) -- pekerjaan gudang, bukan pekerjaan
--   Tahap 1 (keputusan Den D-17).
--
--   Pembayaran pada invoice berstatus issued: NOL baris di produksi.
--   Guard (c) karena itu nol blast radius.
--
-- -- PRASYARAT MENGIKAT -----------------------------------------------------
--   ⛔ 20260925000001 dan 20260925000002 WAJIB sudah jalan lebih dulu.
--   Invariant (d-iii) menuntut setiap Surat Jalan punya sp_order_item_id;
--   tanpa 20260925000001 setiap invoice baru nol jurnal dan invariant GAGAL
--   untuk semuanya. Urutan: 20260925000001 -> 000002 -> 20260926000001 -> ini.
--
--   ⛔ Badan create_invoice_for_sp di bawah disalin dari LIVE STAGING (kode
--   identik, md5 terverifikasi), BUKAN dari schema_snapshot.sql -- snapshot
--   18 Sep tidak memuat fungsi ini sama sekali. Guard sp_order_item_id dari
--   20260925000001 IKUT TERBAWA di dalamnya; jangan dihapus.
--
-- -- SIFAT ------------------------------------------------------------------
--   3 CREATE OR REPLACE (signature sama) + 3 blok ACL + 1 DROP FUNCTION.
--   Nol DDL tabel, nol policy, nol baris data diubah.
--   ⛔ JANGAN DROP lalu CREATE untuk ketiga fungsi -- itu mereset ACL.
--
-- -- TODO Tahap 3 (keputusan Den D-15) --------------------------------------
--   Sesudah butir (b), due_date dihitung di DUA tempat: create_invoice_for_sp
--   (saat terbit) dan submit_invoice (saat submit). SENGAJA dibiarkan: rantai
--   terminnya sama, jadi submit_invoice menulis nilai yang identik (idempoten).
--   Dirapikan saat submit_invoice ditulis ulang di Tahap 3 -- sampai itu,
--   mengubah rantai termin berarti menyentuh KEDUA fungsi.
--
--   Di luar cakupan (keputusan Den D-14): backfill due_date untuk 508 dari 509
--   invoice hidup yang due_date-nya NULL. Butir (b) hanya memperbaiki invoice
--   BARU. AR Aging nanti berbasis tanggal TTF, bukan due_date -- itu Tahap 2.
-- =============================================================================


-- =============================================================================
-- V0 -- jalankan SEBELUM blok eksekusi, catat angkanya.
-- =============================================================================
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS objek,
       md5(pg_get_functiondef(p.oid)) AS md5_functiondef,
       length(pg_get_functiondef(p.oid)) AS panjang,
       COALESCE(array_to_string(p.proacl,' | '),'(default) = PUBLIC EXECUTE') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname IN ('create_invoice','create_invoice_for_sp','record_payment','submit_invoice')
       OR (p.proname='mark_delivery_delivered'))
ORDER BY p.proname, p.pronargs;

-- Prasyarat: guard 20260925000001 HARUS sudah ada. Kalau false, BERHENTI.
SELECT (p.prosrc LIKE '%sp_order_item_id NULL%') AS prasyarat_20260925000001
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';

-- Prasyarat: index unik 20260925000002 HARUS ada.
SELECT count(*) AS prasyarat_20260925000002
FROM pg_class WHERE relname='sp_order_items_legacy_sp_item_id_key';


-- =============================================================================
-- PALANG -- menolak jalan kalau prasyarat belum terpasang.
-- Tanpa ini, migrasi "berhasil" lalu setiap invoice baru gagal di invariant.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='create_invoice_for_sp'
                    AND p.prosrc LIKE '%sp_order_item_id NULL%') THEN
    RAISE EXCEPTION 'PALANG: migrasi 20260925000001 belum jalan (guard sp_order_item_id tidak ada di create_invoice_for_sp). Invariant (d-iii) akan gagal untuk SEMUA invoice baru. Jalankan 20260925000001 lalu 20260925000002 lebih dulu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='sp_order_items_legacy_sp_item_id_key') THEN
    RAISE EXCEPTION 'PALANG: migrasi 20260925000002 belum jalan (index sp_order_items_legacy_sp_item_id_key tidak ada).';
  END IF;
END $$;


-- =============================================================================
-- d + b. create_invoice_for_sp -- tiga guard baru + due_date saat terbit
--
--   Badan dasar = LIVE staging (sudah memuat guard 20260925000001).
--   Yang BARU di berkas ini, dan hanya ini:
--     * v_term_days / v_due_date / v_je_count / v_debit_ar / v_toleransi
--     * GUARD (d-i)  BTB hidup           -- sebelum invoice dibuat
--     * GUARD (d-ii) SJ belum delivered  -- sebelum invoice dibuat
--     * due_date dihitung + ikut di-UPDATE bersama totals
--     * v_je_count dinaikkan di dalam loop
--     * GUARD (d-iii) invariant debit piutang -- di ekor, sebelum recompute
-- =============================================================================
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
  -- BARU di 20260926000002
  v_override_days int; v_term_days int; v_due_date date;
  v_sj_belum     text;
  v_je_count     int := 0;
  v_debit_ar     numeric(18,2);
  v_toleransi    numeric(18,2);
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

  -- GUARD (d-i) BARU -- tolak SP tanpa BTB hidup.
  -- Menutup temuan D-06 blueprint: 6 dari 10 invoice pernah terbit tanpa BTB.
  -- Aturan CEO: baru boleh ditagih kalau kirim penuh DAN BTB lengkap.
  IF NOT EXISTS (SELECT 1 FROM sp_btb b
                  WHERE b.sp_order_id = p_sp_order_id AND b.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'SP % belum punya BTB - invoice tidak bisa diterbitkan. Terbitkan BTB lebih dulu di Detail SP.', v_sp_no;
  END IF;

  -- GUARD (d-ii) BARU -- pra-terbang: tolak kalau ada Surat Jalan yang belum
  -- selesai. Tanpa ini, SP yang qty-nya sudah penuh tapi salah satu SJ-nya masih
  -- in_transit akan diinvoice dengan jurnal LEBIH KECIL dari total_amount -- dan
  -- itu justru akan tertangkap invariant (d-iii) di ekor, sesudah nomor invoice
  -- terpakai. Menolaknya di sini membuat nomor invoice tidak terbuang.
  SELECT string_agg(d.do_no || ' (' || d.status || ')', ', ' ORDER BY d.do_no)
    INTO v_sj_belum
    FROM delivery_notes d
   WHERE d.sp_order_id = p_sp_order_id
     AND d.status NOT IN ('delivered','cancelled');
  IF v_sj_belum IS NOT NULL THEN
    RAISE EXCEPTION 'SP % masih punya Surat Jalan yang belum selesai: %. Selesaikan atau batalkan dulu sebelum menerbitkan invoice.', v_sp_no, v_sj_belum;
  END IF;

  SELECT count(*) INTO v_dn_count FROM delivery_notes
   WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  IF v_dn_count = 0 THEN
    RAISE EXCEPTION 'Belum ada Surat Jalan berstatus delivered dengan tanggal ditandatangani untuk SP ini. Kalau Surat Jalannya sudah sampai tapi tanggalnya belum diisi, pakai Lengkapi Tanggal Ditandatangani.';
  END IF;

  v_invoice_date := p_invoice_date;
  IF v_invoice_date IS NULL THEN
    SELECT MAX(signed_date) INTO v_invoice_date FROM delivery_notes
     WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  END IF;
  v_year := extract(year from v_invoice_date)::int;

  -- (b) BARU -- due_date dihitung SAAT TERBIT. Rantai termin tiga tingkat, sama
  -- persis dengan submit_invoice: override akun -> entity_finance_settings ->
  -- hardcode 30. !! TODO Tahap 3: submit_invoice masih menghitung ini juga
  -- (idempoten, nilai sama). Mengubah rantai berarti menyentuh KEDUA fungsi.
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
    -- GUARD 20260925000001 -- JANGAN DIHAPUS. Tanpa ini, baris barang tanpa
    -- kaitan ke item SP membuat join di bawah kosong -> v_amount_sj = 0 ->
    -- CONTINUE, dan invoice terbit TANPA JURNAL tanpa error.
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

    v_je_count := v_je_count + 1;   -- BARU: penyebut toleransi invariant (d-iii)

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

  -- GUARD (d-iii) BARU -- invariant, lapis terakhir.
  -- Debit piutang di SELURUH jurnal invoice ini harus sama dengan total_amount.
  -- Toleransi = jumlah Surat Jalan BERJURNAL x Rp1, karena PPN dibulatkan
  -- SEKALI PER SURAT JALAN di loop di atas, terpisah dari pembulatan PPN
  -- per-baris yang membentuk total_amount. Selisih pembulatan maksimum karena
  -- itu Rp1 per Surat Jalan -- bukan angka yang dikira-kira: diukur di produksi
  -- 25 Sep 2026 atas 507 invoice berjurnal, 474 pas persis, 33 selisih tepat
  -- Rp1, NOL di atas Rp1, walau ada invoice dengan 5 Surat Jalan.
  --
  -- Lewat batas = RAISE, transaksi batal. Yang dilindungi bukan kerapian
  -- laporan: invoice yang jurnalnya tidak menutup akan membuat piutang di buku
  -- besar berbeda dari piutang di daftar invoice, dan selisih itu tidak akan
  -- pernah kelihatan dari salah satu sisi saja.
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


-- =============================================================================
-- a. create_invoice -- pembungkus tipis
--
--   Signature dan DEFAULT NULL DIPERTAHANKAN: FE memanggil
--   supabase.rpc('create_invoice', { p_sp_order_id }) tanpa tanggal
--   (src/lib/db.js createInvoiceRpc), dan panggilan itu harus tetap jalan
--   tanpa perubahan kode.
--
--   ⛔ PERUBAHAN PERILAKU, dan ini memang tujuannya: sejak berkas ini,
--   create_invoice memecah jurnal PER SURAT JALAN (sebelumnya satu jurnal per
--   invoice, ber-entry_date = invoice_date) DAN tunduk pada ketiga guard baru.
--   Radius dampaknya ada di kepala berkas: 62 -> 5 SP yang bisa ditagih hari-1.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_invoice(p_sp_order_id uuid, p_invoice_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Satu jalur penerbitan invoice. Nama ini dipertahankan HANYA supaya FE dan
  -- pemanggil lama tidak perlu berubah; seluruh aturannya hidup di
  -- create_invoice_for_sp. Jangan menambahkan logika apa pun di sini -- kalau
  -- ada dua badan lagi, masalah yang berkas ini tutup akan kembali.
  RETURN create_invoice_for_sp(p_sp_order_id, p_invoice_date);
END;
$function$;


-- =============================================================================
-- c. record_payment -- tolak invoice berstatus issued
--
--   Invoice harus di-submit dulu (dikirim ke customer) sebelum pembayarannya
--   dicatat. Sebelum ini, 'issued' diterima -- artinya pembayaran bisa tercatat
--   untuk invoice yang belum pernah sampai ke customer.
--   Blast radius di produksi: NOL baris (diukur 25 Sep 2026).
--
--   Badan disalin dari LIVE; satu-satunya perubahan adalah blok IF di bawah.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_reference text DEFAULT NULL::text, p_pph numeric DEFAULT 0, p_bukti_potong_url text DEFAULT NULL::text, p_bukti_potong_no text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_code_bank   CONSTANT text := '1-1101';
  c_code_ar     CONSTANT text := '1-1200';
  c_code_pph23  CONSTANT text := '1-1300';
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
  -- BARU di 20260926000002 (butir c)
  IF v_inv_status = 'issued' THEN
    RAISE EXCEPTION 'Invoice % belum di-submit ke customer - submit dulu sebelum mencatat pembayaran.', COALESCE(v_invoice_no, '(tanpa nomor)');
  END IF;

  SELECT id INTO v_acc_bank FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_bank AND deleted_at IS NULL;
  IF v_acc_bank IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini - hubungi Finance Controller.', c_code_bank;
  END IF;

  SELECT id INTO v_acc_ar FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_ar AND deleted_at IS NULL;
  IF v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini - hubungi Finance Controller.', c_code_ar;
  END IF;

  IF COALESCE(p_pph, 0) > 0 THEN
    SELECT id INTO v_acc_pph FROM chart_of_accounts
     WHERE company_id = v_company_id AND code = c_code_pph23 AND deleted_at IS NULL;
    IF v_acc_pph IS NULL THEN
      RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini - hubungi Finance Controller.', c_code_pph23;
    END IF;
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
    UPDATE sp_invoices
       SET status = v_new_status, updated_at = now()
     WHERE id = p_invoice_id;
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


-- =============================================================================
-- e. ACL -- cabut PUBLIC dari ketiga fungsi penerbit/pengubah invoice
--
--   Ketiganya ber-PUBLIC EXECUTE hari ini. Tidak eksploitatif lewat anon karena
--   auth.uid() NULL sehingga guard di dalam badan menolak -- tapi itu berarti
--   perlindungannya bersandar pada ISI FUNGSI, bukan pada IZIN (kelas TD-232).
--   submit_invoice IKUT dicabut (keputusan Den D-16).
-- =============================================================================
REVOKE ALL ON FUNCTION public.create_invoice(uuid, date)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, date)        TO authenticated;

REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_sp(uuid, date) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_invoice(uuid)              FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_invoice(uuid)              TO authenticated;


-- =============================================================================
-- f. DROP overload mark_delivery_delivered(uuid)
--
--   Diukur 25 Sep 2026: NOL pemanggil 1-argumen di mana pun -- FE hanya punya
--   satu titik panggil (src/lib/db.js setDeliveryStatus) dan ia SELALU mengirim
--   kedua argumen; nol fungsi/trigger DB di staging maupun produksi memanggilnya.
--
--   ⭐ Yang tidak langsung kelihatan: overload ini sebenarnya sudah TIDAK BISA
--   dipanggil. Versi 2-argumen ber-p_signed_date DEFAULT NULL, jadi setiap
--   panggilan 1-argumen cocok untuk KEDUA kandidat dan Postgres menolak dengan
--   42725 "function ... is not unique" -- terbukti di produksi lewat EXPLAIN.
--   Jadi DROP ini melakukan dua hal sekaligus:
--     1. MEMPERBAIKI pesan gagal. Sesudah DROP, mark_delivery_delivered(uuid)
--        sah kembali, jatuh ke versi 2-argumen, lalu ditolak guard
--        "signed_date wajib" -- pesan bisnis, bukan error resolusi fungsi.
--     2. Menutup lubang PUBLIC EXECUTE pada satu-satunya jalur yang bisa
--        menandai Surat Jalan terkirim TANPA tanggal.
--   Itu isi TD-263, dan berkas ini menutupnya.
--
--   ⛔ Cadangan badannya ada di P-2 (mark_delivery_delivered_1arg.sql,
--   md5 05d66875ebba901115196513f17261fb). Itu SATU-SATUNYA cadangan.
-- =============================================================================
DROP FUNCTION IF EXISTS public.mark_delivery_delivered(uuid);


-- =============================================================================
-- V1 -- VERIFIKASI sesudah eksekusi
-- =============================================================================

-- V1a  Kelima objek: signature, SECURITY, search_path, ACL.
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS objek,
       p.prosecdef AS secdef,
       COALESCE(array_to_string(p.proconfig,','),'-') AS config,
       COALESCE(array_to_string(p.proacl,' | '),'(default) = PUBLIC EXECUTE') AS acl,
       -- !! PUBLIC = entri ber-grantee KOSONG, jadi stringnya DIAWALI '='.
       -- JANGAN pakai LIKE '%=X/%': pola itu juga kena 'postgres=X/postgres' dan
       -- 'authenticated=X/postgres', sehingga selalu true dan tidak pernah
       -- membuktikan apa pun. Cacat itu ketemu 25 Sep 2026 saat V1b pertama
       -- dijalankan untuk 20260926000001.
       (p.proacl IS NULL
        OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%')) AS masih_public
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('create_invoice','create_invoice_for_sp','record_payment','submit_invoice','mark_delivery_delivered')
ORDER BY p.proname, p.pronargs;
-- HARAPAN: mark_delivery_delivered HANYA SATU baris (yang 2-argumen)
--          masih_public = false untuk create_invoice, create_invoice_for_sp,
--          submit_invoice, record_payment

-- V1b  create_invoice benar-benar tipis, dan guard 20260925000001 masih ada.
SELECT (SELECT length(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_invoice')             AS panjang_create_invoice,
       (SELECT prosrc LIKE '%create_invoice_for_sp%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_invoice')             AS memanggil_for_sp,
       (SELECT prosrc LIKE '%sp_order_item_id NULL%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_invoice_for_sp')      AS guard_20260925000001_masih_ada,
       (SELECT prosrc LIKE '%belum punya BTB%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_invoice_for_sp')      AS guard_btb_ada,
       (SELECT prosrc LIKE '%belum selesai%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_invoice_for_sp')      AS guard_sj_ada,
       (SELECT prosrc LIKE '%Invariant piutang gagal%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_invoice_for_sp')      AS invariant_ada,
       (SELECT prosrc LIKE '%belum di-submit ke customer%' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='record_payment')            AS guard_issued_ada;
-- HARAPAN: memanggil_for_sp true, kelima guard true, panjang_create_invoice < 600

-- V1c  Data tidak tersentuh oleh migrasi ini.
SELECT (SELECT count(*) FROM sp_invoices)     AS invoice,
       (SELECT count(*) FROM journal_entries) AS jurnal,
       (SELECT count(*) FROM sp_payments)     AS pembayaran;
-- HARAPAN: identik dengan V0 (migrasi ini nol mengubah data).


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Jalankan dari cadangan P-2 (md5 sudah dicocokkan ke produksi 25 Sep 2026):
--   create_invoice.sql                055cd7285bd953b71e224e70899bbba3
--   create_invoice_for_sp.sql         cb64397dcb97a1c208544b4251024466
--   record_payment.sql                d03f7539bcf589b9514f02dbe120f50a
--   submit_invoice.sql                b756591d88650309d4a4093b84700f75
--   mark_delivery_delivered_1arg.sql  05d66875ebba901115196513f17261fb
--
-- ⛔ Semuanya CREATE OR REPLACE. JANGAN DROP lalu CREATE (mereset ACL).
--
-- ⚠️ create_invoice_for_sp dari P-2 adalah versi PRODUKSI, yaitu TANPA guard
-- 20260925000001. Kalau 20260925000001 sudah jalan di environment itu,
-- memulihkan dari P-2 akan MENGHAPUS guard tersebut. Yang benar: pulihkan dari
-- P-2 lalu jalankan ulang 20260925000001 bagian 1 dan 3.
--
-- Untuk mengembalikan ACL PUBLIC (kalau butir e mau dibalik):
--   GRANT EXECUTE ON FUNCTION public.create_invoice(uuid, date)        TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.create_invoice_for_sp(uuid, date) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.submit_invoice(uuid)              TO PUBLIC;
--
-- due_date yang sudah terisi oleh butir (b) TIDAK dibalik: nilainya benar
-- menurut rantai termin, dan mengosongkannya kembali hanya membuang informasi.
