-- =============================================================================
-- Migration: 20260925000001_dni_sp_order_item_link
-- Phase:     Perbaikan bug laten: delivery_note_items.sp_order_item_id tidak
--            pernah diisi oleh jalur aplikasi, sehingga create_invoice_for_sp
--            menerbitkan invoice TANPA JURNAL, tanpa error.
--
-- Status:    LIVE DI STAGING (25 Sep 2026) - BELUM DIJALANKAN DI PRODUCTION.
--
-- -- SEBAB ------------------------------------------------------------------
--   generate_delivery_from_picking menyisipkan delivery_note_items TANPA kolom
--   sp_order_item_id (kolomnya ada, dibiarkan NULL). create_invoice_for_sp
--   menghitung jurnal per Surat Jalan lewat
--     JOIN sp_order_items soi ON soi.id = dni.sp_order_item_id
--   Dengan NULL, join itu kosong -> v_dpp_sj = 0 -> v_amount_sj = 0 ->
--   "IF v_amount_sj = 0 THEN CONTINUE" -> NOL jurnal, NOL error.
--
-- -- BUKTI (diukur 25 Sep 2026) ---------------------------------------------
--   Kedua fungsi BYTE-IDENTIK di staging dan produksi:
--     generate_delivery_from_picking  md5 2ef1ea771dfdda0221c2eb161469f500 (3115)
--     create_invoice_for_sp           md5 cb64397dcb97a1c208544b4251024466 (7678)
--   Jadi migrasi ini portabel: badan dasarnya sama di kedua environment.
--
--   Produksi: delivery_note_items 1070 total, 1070 terisi, 0 NULL - TAPI 237
--   baris dari picking terisi oleh BACKFILL rekonsiliasi 22-23 Sep, bukan oleh
--   fungsi; dan belum ada Surat Jalan baru dari picking sejak 22 Sep 15:50 UTC.
--   ⛔ Artinya ini BUG LATEN di produksi: Surat Jalan berikutnya dari UI akan
--   NULL, dan begitu AR Tahap 1 mengalihkan penerbitan ke create_invoice_for_sp,
--   invoicenya terbit tanpa jurnal - senyap.
--
--   Di staging terbukti runtime 25 Sep 2026: satu SP diuji rantai penuh, invoice
--   SOA-INV-VII-2026-0001 total_amount 9.490.500 terbit dengan n_jurnal = 0 dan
--   debit piutang NULL. Data ujinya sudah dihapus.
--
-- -- ISI --------------------------------------------------------------------
--   1. generate_delivery_from_picking: mengisi sp_order_item_id lewat rantai
--      picking_list_items.sp_item_id -> sp_order_items.legacy_sp_item_id.
--      Signature, RETURNS, SECURITY DEFINER, search_path, dan ACL IDENTIK.
--   2. Backfill idempoten untuk baris yang sudah NULL, rantai yang sama.
--   3. create_invoice_for_sp: guard BARU yang menolak keras (RAISE EXCEPTION,
--      menyebut nomor Surat Jalan) kalau ada baris tanpa kaitan. Jalur senyap
--      v_amount_sj = 0 -> CONTINUE DIPERTAHANKAN hanya untuk Surat Jalan yang
--      nilainya memang nol, bukan untuk kaitan yang hilang.
--
-- -- SIFAT ------------------------------------------------------------------
--   Idempoten. 2 CREATE OR REPLACE (signature sama) + 1 UPDATE ber-WHERE NULL.
--   Nol DDL tabel, nol GRANT/REVOKE, nol policy, nol baris dihapus.
--   ⛔ JANGAN DROP lalu CREATE: itu mereset ACL. generate_delivery_from_picking
--      punya ACL eksplisit (=X/postgres | postgres=X/postgres | authenticated=X/postgres);
--      create_invoice_for_sp memakai default. CREATE OR REPLACE menjaga keduanya.
--
-- -- TIDAK DIKERJAKAN DI SINI (sengaja) --------------------------------------
--   Keunikan sp_order_items.legacy_sp_item_id TIDAK dijamin constraint apa pun;
--   satu-satunya index di tabel itu adalah sp_order_items_pkey (diukur di
--   produksi 25 Sep 2026). Yang menjaga rantai ini hari ini adalah DATA, bukan
--   skema. Index unik parsial
--     CREATE UNIQUE INDEX ... ON sp_order_items (legacy_sp_item_id)
--       WHERE legacy_sp_item_id IS NOT NULL;
--   akan menjadikannya jaminan skema, dan datanya hari ini bersih sehingga ia
--   akan lolos - tapi itu DDL tabel di luar cakupan berkas ini, jadi diajukan
--   sebagai keputusan terpisah, bukan diselipkan. Sampai diputuskan, yang
--   melindungi adalah dua hal di berkas ini: subquery skalar (butir 1) dan
--   guard pra-terbang (butir 2).
--
-- -- KETERKAITAN DENGAN RENCANA AR TAHAP 1 -----------------------------------
--   Rencana AR Tahap 1 (<TGL>0003_ar_single_issue_path) akan menambah TIGA guard
--   ke create_invoice_for_sp: (a) tolak SP tanpa BTB hidup, (b) pra-terbang tolak
--   SP yang masih punya Surat Jalan selain delivered/cancelled, (c) invariant
--   debit piutang = total_amount dengan toleransi Rp1 per Surat Jalan.
--   Guard di berkas ini adalah YANG KEEMPAT dan TIDAK bentrok:
--     - (a) dan (b) dinilai SEBELUM loop jurnal; guard ini DI DALAM loop.
--     - (c) invariant di ekor fungsi hanya bisa lolos kalau guard ini sudah
--       memastikan tiap Surat Jalan punya kaitan - tanpa berkas ini, (c) akan
--       GAGAL untuk setiap invoice baru. Jadi berkas ini PRASYARAT untuk (c).
--   ⛔ Kalau AR Tahap 1 disusun setelah berkas ini jalan, salin badan fungsi dari
--   LIVE (pg_get_functiondef), jangan dari snapshot - supaya guard ini tidak
--   hilang tertimpa.
-- =============================================================================


-- =============================================================================
-- V0 -- jalankan SEBELUM blok eksekusi, catat angkanya.
-- =============================================================================
SELECT 'dni total'                AS metrik, count(*)::text AS nilai FROM delivery_note_items
UNION ALL SELECT 'dni sp_order_item_id NULL', count(*)::text FROM delivery_note_items WHERE sp_order_item_id IS NULL
UNION ALL SELECT 'md5 generate_delivery_from_picking',
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='generate_delivery_from_picking')
UNION ALL SELECT 'md5 create_invoice_for_sp',
  (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_invoice_for_sp')
UNION ALL SELECT 'acl generate_delivery_from_picking',
  (SELECT COALESCE(array_to_string(p.proacl,' | '),'(default)') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='generate_delivery_from_picking')
UNION ALL SELECT 'acl create_invoice_for_sp',
  (SELECT COALESCE(array_to_string(p.proacl,' | '),'(default)') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='create_invoice_for_sp');


-- =============================================================================
-- 1. generate_delivery_from_picking -- mengisi sp_order_item_id
--    Badan disalin VERBATIM dari LIVE (md5 2ef1ea77..., identik staging+produksi).
--    SATU-SATUNYA perubahan: INSERT delivery_note_items di ekor fungsi.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_delivery_from_picking(p_picking_list_id uuid)
 RETURNS TABLE(delivery_note_id uuid, do_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_entity text;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_dn_id uuid; v_uid uuid := auth.uid();
  v_sp_no text; v_pick_status text;
  v_customer uuid; v_cust_name text; v_addr text;
  v_item_count int;
  v_sp_order_id uuid;
BEGIN
  SELECT sp_no, status, customer_id, sp_order_id
    INTO v_sp_no, v_pick_status, v_customer, v_sp_order_id
    FROM picking_lists WHERE id = p_picking_list_id;
  IF v_sp_no IS NULL THEN RAISE EXCEPTION 'Picking list tidak ditemukan'; END IF;
  IF v_pick_status <> 'done' THEN RAISE EXCEPTION 'Picking list belum selesai (status=%)', v_pick_status; END IF;
  IF NOT (is_super_admin() OR (v_company_id IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membuat surat jalan untuk picking ini';
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id = p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan untuk picking ini sudah ada'; END IF;
  SELECT count(*) INTO v_item_count FROM picking_list_items
    WHERE picking_list_id = p_picking_list_id AND COALESCE(qty_picked,0) > 0;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'Tak ada item ter-pick untuk dikirim'; END IF;
  IF v_customer IS NULL THEN
    SELECT si.customer_id INTO v_customer FROM sp_items si WHERE si.sp_no = v_sp_no LIMIT 1;
  END IF;
  SELECT a.name INTO v_cust_name FROM accounts a WHERE a.id = v_customer;
  IF v_sp_order_id IS NULL AND v_customer IS NOT NULL THEN
    SELECT id INTO v_sp_order_id FROM sp_orders
     WHERE customer_id = v_customer AND sp_no = v_sp_no AND deleted_at IS NULL;
  END IF;
  IF v_sp_order_id IS NOT NULL THEN
    SELECT NULLIF(btrim(dc.alamat), '')
      INTO v_addr
      FROM sp_orders so
      JOIN dc_master dc ON dc.id = so.dc_id
     WHERE so.id = v_sp_order_id;
  END IF;
  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'SJ', 'WH', v_year, 0);
  v_no  := 'SJ/' || COALESCE(v_entity,'SOA') || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');
  INSERT INTO delivery_notes
    (company_id, do_no, sp_no, picking_list_id, customer_id, customer_name, destination_address, status, created_by, sp_order_id)
  VALUES (v_company_id, v_no, v_sp_no, p_picking_list_id, v_customer, v_cust_name, v_addr, 'draft', v_uid, v_sp_order_id)
  RETURNING id INTO v_dn_id;

  -- PERUBAHAN 25 Sep 2026: sp_order_item_id IKUT diisi.
  -- Rantainya picking_list_items.sp_item_id -> sp_order_items.legacy_sp_item_id
  -- (sp_items tabel lama; picking dibangun dari sana, sementara jurnal invoice
  -- dihitung dari sp_order_items).
  --
  -- ⭐ SENGAJA subquery SKALAR, bukan LEFT JOIN. Bukan selera: keunikan
  -- legacy_sp_item_id TIDAK dijamin constraint apa pun (sp_order_items hanya
  -- punya sp_order_items_pkey - diukur di produksi 25 Sep 2026). Dengan JOIN,
  -- satu duplikat saja membuat baris Surat Jalan BERANAK, dan Surat Jalan itu
  -- kertas yang dipegang customer. Subquery skalar paling buruk memilih satu;
  -- ia tidak bisa menambah baris. Ambiguitasnya (kalau kelak ada) ditangkap
  -- guard invariant AR Tahap 1, bukan dibiarkan merusak dokumen.
  --
  -- Hasil NULL DIBIARKAN lahir (bukan INNER JOIN yang membuang barisnya):
  -- barang tetap tercetak di Surat Jalan, dan create_invoice_for_sp yang
  -- menolak keras - supaya pemetaan gagal tidak MENGHILANGKAN barang.
  -- v_sp_order_id NULL (SP lama tanpa baris sp_orders) juga menghasilkan NULL,
  -- dan itu benar: SP tanpa sp_orders memang tak pernah bisa di-invoice.
  INSERT INTO delivery_note_items (delivery_note_id, picking_list_item_id, product_id, product_name, sku, qty, sp_order_item_id)
  SELECT v_dn_id, pli.id, pli.product_id, pli.product_name, pli.sku, pli.qty_picked,
         (SELECT soi.id FROM sp_order_items soi
           WHERE soi.legacy_sp_item_id = pli.sp_item_id
             AND soi.sp_order_id = v_sp_order_id
           ORDER BY soi.created_at, soi.id
           LIMIT 1)
  FROM picking_list_items pli
  WHERE pli.picking_list_id = p_picking_list_id AND COALESCE(pli.qty_picked,0) > 0;

  RETURN QUERY SELECT v_dn_id, v_no;
END;
$function$;


-- =============================================================================
-- 2. Backfill idempoten -- rantai yang sama, hanya baris yang masih NULL.
-- =============================================================================

-- PRA-TERBANG: UPDATE ... FROM dengan lebih dari satu kandidat TIDAK error di
-- Postgres, ia memilih satu sembarangan - senyap. Karena keunikan
-- legacy_sp_item_id tidak dijamin constraint, ambiguitasnya diperiksa di sini
-- dan migrasi MENOLAK jalan kalau ada. Diukur 25 Sep 2026: produksi 974 item,
-- nol duplikat, nol yang dipakai lintas SP; staging 6 item, nol duplikat.
DO $$
DECLARE v_dup int;
BEGIN
  SELECT count(*) INTO v_dup FROM (
    SELECT sp_order_id, legacy_sp_item_id
    FROM sp_order_items
    WHERE legacy_sp_item_id IS NOT NULL
    GROUP BY 1,2 HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'sp_order_items punya % pasangan (sp_order_id, legacy_sp_item_id) duplikat - backfill akan memilih kandidat sembarangan. Selesaikan duplikatnya dulu.', v_dup;
  END IF;
END $$;

-- Bentuknya daftar FROM + syarat di WHERE, BUKAN JOIN ... ON: dalam
-- UPDATE ... FROM, kondisi JOIN tidak boleh merujuk tabel target (dni) ->
-- Postgres menolak dengan 42P01 "invalid reference to FROM-clause entry".
UPDATE delivery_note_items dni
   SET sp_order_item_id = soi.id
  FROM picking_list_items pli,
       delivery_notes dn,
       sp_order_items soi
 WHERE dni.sp_order_item_id IS NULL
   AND pli.id = dni.picking_list_item_id
   AND dn.id  = dni.delivery_note_id
   AND soi.legacy_sp_item_id = pli.sp_item_id
   AND soi.sp_order_id = dn.sp_order_id;


-- =============================================================================
-- 3. create_invoice_for_sp -- guard BARU di dalam loop jurnal.
--    Badan disalin VERBATIM dari LIVE (md5 cb64397d..., identik staging+produksi).
--    SATU-SATUNYA perubahan: blok IF EXISTS ... RAISE EXCEPTION sesudah FOR dn LOOP.
--    Signature (termasuk DEFAULT NULL), RETURNS uuid, SECURITY DEFINER,
--    search_path, dan ACL default DIPERTAHANKAN.
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
    -- GUARD 25 Sep 2026: tolak keras kalau ada baris barang tanpa kaitan ke item
    -- SP. Tanpa ini, join di bawah kosong -> v_amount_sj = 0 -> CONTINUE, dan
    -- invoice terbit TANPA JURNAL tanpa error. Jalur CONTINUE di bawah
    -- DIPERTAHANKAN hanya untuk Surat Jalan yang nilainya memang nol.
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
END;
$function$;


-- =============================================================================
-- V1 -- VERIFIKASI sesudah eksekusi
-- =============================================================================

-- V1a  Baris yang tidak bisa dipetakan. HARAPAN: 0 di produksi.
--
-- ⚠️ HASIL STAGING 25 Sep 2026 = 5, dan itu BUKAN kegagalan migrasi ini.
-- Kelima baris milik SP uji lama ZZZTEST-SP-0001 (SJ/SOA/WH/2026/0001 & 0002,
-- dibuat 24-26 Agu 2026) yang dual-write-nya tidak pernah lengkap: sisi lama
-- punya 5 baris sp_items yang dikirim lewat 2 Surat Jalan, sementara sisi baru
-- hanya punya SATU baris sp_order_items dengan legacy_sp_item_id = NULL dan
-- shipped_qty = 0. Tidak ada kandidat untuk dipetakan - bukan pemetaan yang
-- gagal, melainkan pasangannya yang tidak pernah dibuat.
--
-- Kelima baris itu SENGAJA dibiarkan (data uji milik orang lain, bukan sampah
-- sesi ini) dan TIDAK berbahaya: SP-nya tak akan pernah mencapai guard, karena
-- create_invoice_for_sp sudah menolaknya lebih dulu di cek "terkirim penuh"
-- (Sigma shipped 0 <> Sigma qty 10).
--
-- Di PRODUKSI angka ini harus 0 (1070/1070 sudah terisi per 25 Sep 2026).
-- Kalau > 0 di produksi, JANGAN terbitkan invoice untuk SP-nya sebelum V1b
-- diselidiki.
SELECT count(*) AS dni_masih_null_setelah_backfill
FROM delivery_note_items WHERE sp_order_item_id IS NULL;

-- V1b  Kalau V1a > 0, INI daftarnya - sebab pemetaan gagal, harus diselidiki
--      sebelum invoice apa pun diterbitkan untuk SP-nya.
SELECT dn.do_no, dn.sp_no, dni.product_name, dni.qty,
       pli.sp_item_id,
       (SELECT count(*) FROM sp_order_items s
         WHERE s.legacy_sp_item_id = pli.sp_item_id AND s.sp_order_id = dn.sp_order_id) AS kandidat_soi
FROM delivery_note_items dni
JOIN delivery_notes dn      ON dn.id = dni.delivery_note_id
LEFT JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
WHERE dni.sp_order_item_id IS NULL
ORDER BY dn.do_no;

-- V1c  Identity + ACL kedua fungsi TIDAK berubah. Bandingkan dengan V0.
SELECT p.proname,
       pg_get_function_arguments(p.oid) AS args_dgn_default,
       pg_get_function_result(p.oid)    AS ret,
       p.prosecdef                      AS security_definer,
       COALESCE(array_to_string(p.proconfig,','),'-') AS config,
       COALESCE(array_to_string(p.proacl,' | '),'(default)') AS acl,
       (p.prosrc LIKE '%sp_order_item_id NULL%') AS guard_terpasang
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('generate_delivery_from_picking','create_invoice_for_sp')
ORDER BY p.proname;
-- HARAPAN: generate_delivery_from_picking ACL '=X/postgres | postgres=X/postgres | authenticated=X/postgres'
--          create_invoice_for_sp ACL '(default)' dan guard_terpasang = true
--          args_dgn_default create_invoice_for_sp memuat 'DEFAULT NULL::date'


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Kedua fungsi: CREATE OR REPLACE dengan badan LIVE sebelum migrasi ini.
--   generate_delivery_from_picking  md5 2ef1ea771dfdda0221c2eb161469f500
--   create_invoice_for_sp           md5 cb64397dcb97a1c208544b4251024466
-- SIMPAN pg_get_functiondef kedua fungsi ke berkas SEBELUM menjalankan migrasi.
-- schema_snapshot.sql (18 Sep) TIDAK memuat create_invoice_for_sp sama sekali,
-- jadi ia BUKAN cadangan.
--
-- Backfill (butir 2) TIDAK dibalik: ia mengisi kolom yang seharusnya memang
-- terisi, dan mengosongkannya kembali hanya menghidupkan lagi bug-nya. Kalau
-- benar-benar perlu, catat dulu daftar id yang tersentuh dari V0/V1a.
