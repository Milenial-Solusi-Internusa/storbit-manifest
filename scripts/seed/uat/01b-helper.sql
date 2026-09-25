-- =============================================================================
-- 01b-helper.sql -- fungsi pembangun satu SP dari hulu ke hilir
--
-- Dipanggil 02/03/04-scenario-*.sql. Dijatuhkan lagi oleh 99-purge.sql, jadi ia
-- TIDAK meninggalkan objek permanen di staging.
--
-- !! Berkas ini TIDAK ada di daftar berkas rencana (par.10) -- ia lahir saat
-- pelaksanaan, karena ketiga skrip skenario memanggil rantai langkah yang sama
-- dan menuliskannya tiga kali akan melahirkan tiga salinan yang pasti melenceng.
-- Dinomori 01b supaya urutan berkas rencana lainnya tidak bergeser.
--
-- Prasyarat: nol untuk berkas ini (palangnya dipanggil sendiri di bawah).
-- Yang memakai fungsinya (02/03/04) butuh 01-stock.sql sudah mengisi stok.
-- =============================================================================

-- Palang + impersonasi. DI SETIAP BERKAS, bukan sekali di awal rangkaian:
-- seed.sh menjalankan tiap berkas sebagai proses psql SENDIRI, jadi tiap berkas
-- adalah SESI sendiri dan tidak mewarisi GUC dari berkas sebelumnya.
-- Berpasangan dengan --single-transaction di seed.sh -- lihat README, bagian
-- "seed.sh wajib bisa jalan lewat psql".
\i 00-guards.sql

-- =============================================================================
-- derive_status -- cermin derivePickingItemStatus (src/lib/db.js:658)
--
-- !! picking_list_items_status_check hanya menerima 'pending', 'picked',
-- 'short'. Nilai 'partial' TIDAK sah -- ia sempat dipakai di versi awal helper
-- ini dan langsung ditolak constraint saat skenario partial pertama dijalankan
-- (25 Sep 2026). Bug itu tidak terlihat lebih awal karena probe sebelumnya
-- hanya memakai pick 100%.
--
-- Status diturunkan dari ANGKANYA, tidak pernah dikirim terpisah, supaya qty
-- dan status mustahil melenceng -- aturan yang sama dengan FE.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.derive_status(p_picked int, p_requested int)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE WHEN COALESCE(p_picked,0) <= 0 THEN 'pending'
              WHEN p_picked >= p_requested  THEN 'picked'
              ELSE 'short' END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_uat_build(
  p_sp_no  text,     -- nomor SP, deret 91xxxxx (penanda HAPUS)
  p_cust   uuid,
  p_dc     uuid,
  p_spdate date,
  p_items  jsonb,    -- [{p:product_id, q:qty, u:unit_price, s:shipping_price}]
  p_stage  text,     -- DRAFT | CONFIRMED | PICKING | LEGS
  p_legs   jsonb     -- [{pct, disp, sign, btb, deliver}] satu objek per Surat Jalan
) RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_soa  uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_wh   uuid := '303c3d4c-570e-40a1-b738-6b0ed1cb5078';
  v_exp  date := p_spdate + 45;
  v_spo  uuid; v_it jsonb; v_ids uuid[] := '{}'; v_one uuid;
  v_dual jsonb := '[]'::jsonb; v_i int := 0;
  v_pl uuid; v_dn uuid; v_leg jsonb; v_n int := 0;
  v_disp date; v_sign date; v_btb date; v_pct int;
BEGIN
  -- IDEMPOTEN: SP yang sudah ada dilewati seluruh rantainya, bukan diduplikasi.
  SELECT id INTO v_spo FROM sp_orders WHERE customer_id=p_cust AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_spo IS NOT NULL THEN RETURN v_spo; END IF;

  -- LANGKAH 1a: sp_items (tiruan bulkInsertSpItems + spToDb, db.js:58-88).
  -- Ini SATU dari empat tulisan langsung yang disengaja: FE memang menulis
  -- tabel lama ini sendiri, di luar RPC.
  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO sp_items (sp_date, sp_no, customer_id, product_id, product_name, sku,
      qty, shipped_qty, expired_date, dc, unit_price, shipping_price,
      inv, fp, submit, kirim, notes)
    SELECT p_spdate, p_sp_no, p_cust, pr.id, pr.name, COALESCE(pr.code,''),
      (v_it->>'q')::int, 0, v_exp, COALESCE(d.nama,''),
      (v_it->>'u')::numeric, COALESCE((v_it->>'s')::numeric,0),
      false,false,false,false, 'DATA DUMMY UAT'
    FROM products pr LEFT JOIN dc_master d ON d.id=p_dc
    WHERE pr.id = (v_it->>'p')::uuid
    RETURNING id INTO v_one;
    v_ids := v_ids || v_one;
  END LOOP;

  -- LANGKAH 1b: RPC create_sp_order_dual (sp_orders + sp_order_items).
  -- legacy_sp_item_id menyambungkan baris baru ke baris lama langkah 1a; itulah
  -- rantai yang dipakai migrasi 20260925000001 untuk mengisi
  -- delivery_note_items.sp_order_item_id.
  FOR v_it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_i := v_i + 1;
    v_dual := v_dual || jsonb_build_array(jsonb_build_object(
      'product_id', v_it->>'p',
      'product_name', (SELECT name FROM products WHERE id=(v_it->>'p')::uuid),
      'sku', COALESCE((SELECT code FROM products WHERE id=(v_it->>'p')::uuid),''),
      'qty', (v_it->>'q')::int, 'unit_price', (v_it->>'u')::numeric,
      'price_category', NULL, 'shipping_price', COALESCE((v_it->>'s')::numeric,0),
      'legacy_sp_item_id', v_ids[v_i]));
  END LOOP;
  v_spo := create_sp_order_dual(v_soa, p_cust, p_sp_no, p_spdate, p_dc, 'DRAFT', v_exp,
                                'DATA DUMMY UAT', v_dual);
  IF p_stage = 'DRAFT' THEN RETURN v_spo; END IF;

  -- LANGKAH 2: Konfirmasi
  PERFORM set_sp_status(p_sp_no, 'confirmed', NULL, p_cust);
  IF p_stage = 'CONFIRMED' THEN RETURN v_spo; END IF;

  -- LANGKAH 3-4: picking dibuat, qty diisi sebagian, TIDAK diselesaikan
  IF p_stage = 'PICKING' THEN
    SELECT picking_list_id INTO v_pl FROM generate_picking_from_sp(p_sp_no, p_cust, v_wh);
    UPDATE picking_list_items
       SET qty_picked = GREATEST(1, qty_requested/2),
           status = derive_status(GREATEST(1, qty_requested/2), qty_requested)
     WHERE picking_list_id = v_pl;
    RETURN v_spo;
  END IF;

  -- LANGKAH 3..9 per kaki pengiriman
  FOR v_leg IN SELECT * FROM jsonb_array_elements(p_legs) LOOP
    v_n := v_n + 1;
    v_pct  := (v_leg->>'pct')::int;
    v_disp := (v_leg->>'disp')::date;
    v_sign := NULLIF(v_leg->>'sign','')::date;
    v_btb  := NULLIF(v_leg->>'btb','')::date;

    SELECT picking_list_id INTO v_pl FROM generate_picking_from_sp(p_sp_no, p_cust, v_wh);
    -- tiruan setPickingItemPicked (db.js:652) - UPDATE langsung, bukan RPC
    -- Status DITURUNKAN dari angkanya, tidak dikirim terpisah -- cermin
    -- derivePickingItemStatus (db.js:658). !! 'partial' BUKAN nilai yang sah:
    -- picking_list_items_status_check hanya menerima pending/picked/short.
    UPDATE picking_list_items
       SET qty_picked = LEAST(qty_requested, GREATEST(1, CEIL(qty_requested * v_pct / 100.0)::int)),
           status = derive_status(
                      LEAST(qty_requested, GREATEST(1, CEIL(qty_requested * v_pct / 100.0)::int)),
                      qty_requested)
     WHERE picking_list_id = v_pl;
    PERFORM complete_picking(v_pl);
    SELECT delivery_note_id INTO v_dn FROM generate_delivery_from_picking(v_pl);
    PERFORM dispatch_delivery(v_dn);

    -- STOP: GESER DULU, BARU tandai terkirim. mark_delivery_delivered menuntut
    -- signed_date >= dispatched_at (WIB). dispatch_delivery mengisi dispatched_at
    -- dengan now(), jadi mengirim signed_date historis tanpa menggeser ini lebih
    -- dulu akan DITOLAK guard. Urutan kebalikannya (kirim tanggal hari ini lalu
    -- geser signed_date) akan MELEWATI guard tanpa pernah mengujinya.
    UPDATE delivery_notes SET dispatched_at = v_disp::timestamptz + interval '9 hours',
           ship_date = v_disp, updated_at = v_disp::timestamptz + interval '9 hours'
     WHERE id = v_dn;

    IF COALESCE((v_leg->>'deliver')::boolean, false) THEN
      IF v_sign IS NOT NULL THEN
        PERFORM mark_delivery_delivered(v_dn, v_sign);
        UPDATE delivery_notes SET delivered_at = v_sign::timestamptz + interval '10 hours' WHERE id = v_dn;
      ELSE
        -- Keadaan "delivered TANPA signed_date". Nyata di produksi: 106 dari 698
        -- Surat Jalan delivered berkolom NULL (diukur 25 Sep 2026), yang terakhir
        -- 15 Sep 2026 -- yaitu sebelum signed_date jadi wajib pada 17 Sep.
        --
        -- !! TIDAK bisa lewat overload 1-argumen. PERFORM mark_delivery_delivered(v_dn)
        -- DITOLAK Postgres dengan 42725 "function ... is not unique": overload
        -- 2-argumen punya p_signed_date date DEFAULT NULL, sehingga panggilan
        -- 1-argumen cocok untuk KEDUA kandidat. Terbukti runtime 25 Sep 2026.
        -- Konsekuensinya bagi TD-263: jalan pintas "tandai terkirim tanpa tanggal"
        -- lewat overload lama itu TERKUNCI oleh ambiguitas, bukan terbuka --
        -- tapi ambiguitas itu sendiri membuat panggilan 1-argumen mana pun gagal.
        --
        -- Jadi keadaannya dicapai lewat RPC 2-argumen (guard tanggal tetap diuji)
        -- lalu kolomnya dikosongkan. Ini tulisan langsung KELIMA yang disengaja,
        -- dan satu-satunya yang tidak punya jalur aplikasi sama sekali.
        PERFORM mark_delivery_delivered(v_dn, v_disp);
        UPDATE delivery_notes SET signed_date = NULL,
               delivered_at = v_disp::timestamptz + interval '34 hours' WHERE id = v_dn;
      END IF;
    END IF;

    IF v_btb IS NOT NULL THEN
      PERFORM sp_issue_btb(p_cust, p_sp_no, 'BTB-' || p_sp_no || '-' || v_n::text,
                           NULL::int, v_btb, v_dn, 'DATA DUMMY UAT');
      UPDATE sp_btb SET received_at = v_btb::timestamptz + interval '11 hours'
       WHERE sp_order_id = v_spo AND btb_no = 'BTB-' || p_sp_no || '-' || v_n::text;
    END IF;
  END LOOP;

  -- jejak waktu kosmetik (kolom yang diisi now() oleh RPC, bukan tanggal dokumen)
  UPDATE sp_orders SET created_at = p_spdate::timestamptz + interval '8 hours',
         updated_at = p_spdate::timestamptz + interval '8 hours' WHERE id = v_spo;
  UPDATE sp_order_items SET created_at = p_spdate::timestamptz + interval '8 hours' WHERE sp_order_id = v_spo;
  UPDATE sp_items SET created_at = p_spdate::timestamptz + interval '8 hours',
         updated_at = p_spdate::timestamptz + interval '8 hours'
   WHERE customer_id = p_cust AND sp_no = p_sp_no;
  UPDATE picking_lists SET created_at = p_spdate::timestamptz + interval '8 hours'
   WHERE customer_id = p_cust AND sp_no = p_sp_no;
  RETURN v_spo;
END $function$;


-- =============================================================================
-- seed_uat_bill -- langkah 10..14: invoice, submit, bayar, void
--
-- Dipisah dari seed_uat_build karena SP siap-tagih (skenario 2) sengaja BERHENTI
-- sebelum langkah 10. Memaksanya jadi satu fungsi akan menuntut satu parameter
-- lagi yang artinya "jangan lakukan separuh isi fungsi ini".
--
-- p_mode : ISSUED | SUBMITTED | PARTIAL | PAID | VOID
-- p_pays : [{amt, date, pph}] satu objek per pembayaran
--
-- !! Fakta RPC yang membentuk fungsi ini (dibaca dari pg_proc, bukan diasumsikan):
--   * create_invoice_for_sp: invoice_date dari PARAMETER, nomor invoice pun
--     diturunkan darinya -> keduanya TIDAK perlu digeser.
--   * submit_invoice: due_date = invoice_date + termin. Termin diambil berurutan
--     dari accounts.invoice_payment_terms_days, lalu entity_finance_settings,
--     lalu hardcode 30. Indomarco punya override 30 (tingkat 1); tiga customer
--     lain NULL sehingga jatuh ke hardcode (tingkat 3). Dua jalur berbeda,
--     hasilnya sama-sama 30.
--   * record_payment: guard HANYA super_admin / finance_controller -- BUKAN
--     is_manager_or_above. entry_date jurnal = p_payment_date (tidak digeser).
--     Lunas dinilai dari SUM(amount) + SUM(pph) >= total_amount - 1, jadi PPh
--     IKUT menutup piutang; kalau pph dikirim tanpa mengurangi amount, invoice
--     jadi kelebihan bayar.
--   * Nol RPC untuk void -> UPDATE langsung + hapus jurnalnya (pola migrasi
--     20260908000004). Itu satu dari empat tulisan langsung yang disengaja.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.seed_uat_bill(
  p_sp_no   text,
  p_cust    uuid,
  p_invdate date,
  p_mode    text,
  p_pays    jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_spo uuid; v_inv uuid; v_pay jsonb; v_pid uuid; v_n int := 0;
  v_total numeric(18,2); v_dpp numeric(18,2); v_settled numeric(18,2);
  v_pph numeric(18,2); v_amt numeric(18,2); v_invdate date;
BEGIN
  SELECT id INTO v_spo FROM sp_orders
   WHERE customer_id = p_cust AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_spo IS NULL THEN
    RAISE EXCEPTION 'seed_uat_bill: SP % tidak ditemukan - jalankan skrip skenarionya dulu', p_sp_no;
  END IF;

  -- IDEMPOTEN: invoice hidup sudah ada -> lewati seluruh rantai penagihan.
  SELECT id INTO v_inv FROM sp_invoices
   WHERE sp_order_id = v_spo AND status <> 'void' AND deleted_at IS NULL;
  IF v_inv IS NOT NULL THEN RETURN v_inv; END IF;

  -- LANGKAH 10
  v_inv := create_invoice_for_sp(v_spo, p_invdate);

  -- !! Tanggal untuk pergeseran kosmetik dibaca BALIK dari barisnya, bukan dari
  -- p_invdate. Katalog memang mengirim NULL supaya create_invoice_for_sp
  -- memilih sendiri MAX(signed_date) -- jalur yang dipakai aplikasi. Memakai
  -- p_invdate di sini membuat created_at jadi NULL dan ditolak NOT NULL
  -- (terjadi 25 Sep 2026).
  SELECT invoice_date INTO v_invdate FROM sp_invoices WHERE id = v_inv;

  UPDATE sp_invoices SET created_at = v_invdate::timestamptz + interval '9 hours',
         updated_at = v_invdate::timestamptz + interval '9 hours' WHERE id = v_inv;
  UPDATE journal_entries SET created_at = entry_date::timestamptz + interval '9 hours'
   WHERE reference_type = 'invoice_issued' AND reference_id = v_inv;

  IF p_mode = 'ISSUED' THEN RETURN v_inv; END IF;

  IF p_mode = 'VOID' THEN
    -- Nol RPC. Jurnalnya DIHAPUS, bukan dibalik -- itulah sebabnya V4
    -- (invariant debit piutang) WAJIB mengecualikan invoice void.
    DELETE FROM journal_entry_lines WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE reference_type='invoice_issued' AND reference_id=v_inv);
    DELETE FROM journal_entries WHERE reference_type='invoice_issued' AND reference_id=v_inv;
    UPDATE sp_invoices SET status='void', updated_at = v_invdate::timestamptz + interval '9 hours'
     WHERE id = v_inv;
    RETURN v_inv;
  END IF;

  -- LANGKAH 11: submit. PARTIAL dan PAID IKUT melewatinya -- kalau tidak,
  -- due_date mereka NULL dan AR Aging tidak teruji untuk 12 dari 22 invoice.
  PERFORM submit_invoice(v_inv);
  UPDATE sp_invoices SET submitted_at = v_invdate::timestamptz + interval '30 hours',
         updated_at = v_invdate::timestamptz + interval '30 hours' WHERE id = v_inv;
  IF p_mode = 'SUBMITTED' THEN RETURN v_inv; END IF;

  -- LANGKAH 12: pembayaran
  --
  -- !! p_pays memakai PORSI KUMULATIF (frac), bukan nominal. total_amount
  -- dihitung oleh create_invoice_for_sp dari harga x qty terkirim + ongkos +
  -- PPN, jadi nominalnya tidak bisa ditulis di katalog tanpa menduplikasi
  -- perhitungan RPC -- dan duplikasi itu pasti melenceng begitu ada pembulatan.
  --
  -- frac = porsi total yang SUDAH terbayar SESUDAH pembayaran ini.
  --   [{frac:1}]              -> lunas sekali bayar
  --   [{frac:0.4},{frac:1}]   -> dua kali bayar, lunas di yang kedua
  --   [{frac:0.35}]           -> partial, berhenti di 35%
  -- Nominalnya diturunkan: round(total*frac) - yang_sudah_terbayar - pph.
  -- Dengan frac=1 hasilnya settled = total PERSIS, jadi ambang 'paid'
  -- (settled >= total - 1) terpenuhi tanpa bersandar pada toleransi Rp1.
  --
  -- pph23=true -> pph = 2% dari total_dpp (pola produksi), dan amount DIKURANGI
  -- sebesar itu. Kalau pph dikirim tanpa mengurangi amount, settled melewati
  -- total dan invoice jadi kelebihan bayar.
  SELECT total_amount, total_dpp INTO v_total, v_dpp FROM sp_invoices WHERE id = v_inv;
  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_pays) LOOP
    v_n := v_n + 1;
    SELECT COALESCE(SUM(amount),0) + COALESCE(SUM(pph),0) INTO v_settled
      FROM sp_payments WHERE invoice_id = v_inv;
    v_pph := CASE WHEN COALESCE((v_pay->>'pph23')::boolean, false)
                  THEN round(v_dpp * 0.02) ELSE 0 END;
    v_amt := round(v_total * (v_pay->>'frac')::numeric) - v_settled - v_pph;
    IF v_amt <= 0 THEN
      RAISE EXCEPTION 'seed_uat_bill %: nominal pembayaran ke-% jadi % (frac %, total %, sudah %, pph %) - periksa katalognya',
        p_sp_no, v_n, v_amt, v_pay->>'frac', v_total, v_settled, v_pph;
    END IF;
    v_pid := record_payment(v_inv, v_amt, (v_pay->>'date')::date,
               'TRF-DUMMY-UAT-' || p_sp_no || '-' || v_n::text, v_pph, NULL, NULL);
    UPDATE sp_payments SET created_at = (v_pay->>'date')::timestamptz + interval '10 hours'
     WHERE id = v_pid;
    UPDATE journal_entries SET created_at = entry_date::timestamptz + interval '10 hours'
     WHERE reference_type = 'payment_received' AND reference_id = v_pid;
  END LOOP;

  RETURN v_inv;
END $function$;
