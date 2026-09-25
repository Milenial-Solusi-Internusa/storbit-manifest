-- =============================================================================
-- 20260928000003_invoice_issue_v2.sql         (Invoice lengkap, berkas 3 dari 9)
--
-- Penerbitan invoice mengisi kolom baru, membuat baris ongkir, dan menjurnal
-- lewat AKUN PER BARIS -- bukan satu akun untuk seluruh invoice.
--
-- ⭐ BENTUK PEMBUKTIANNYA ADALAH DESAIN, BUKAN LAMPIRAN.
-- Aritmetika jurnal dipindah ke SATU fungsi BACA-SAJA:
--
--     invoice_journal_projection(invoice_id) -> baris jurnal yang SEHARUSNYA
--
-- `post_invoice_journal()` tidak menghitung apa pun; ia MENULIS apa yang
-- dikembalikan proyeksi itu. Konsekuensinya: bukti "identik" di bawah menguji
-- KODE YANG SAMA dengan yang kelak menulis, bukan salinan kedua dari rumus yang
-- ditulis khusus untuk uji. Salinan kedua adalah cara paling umum sebuah bukti
-- identitas menjadi hijau-palsu.
--
-- URUTAN DI DALAM BERKAS INI DISENGAJA:
--   1. proyeksi dibuat
--   2. proyeksi DIBANDINGKAN dengan 23 jurnal yang SUDAH ADA (dibuat kode lama)
--      -- DUA ARAH: nol baris proyeksi yang tak ada di jurnal, DAN nol baris
--      jurnal yang tak ada di proyeksi
--   3. baru sesudah itu create_invoice_for_sp diganti
-- Kalau langkah 2 meleset satu rupiah pun, seluruh transaksi batal dan fungsi
-- penerbitan TIDAK PERNAH tersentuh.
--
-- ============================================================================
-- YANG BERUBAH DI JURNAL, DAN KENAPA HASILNYA TETAP IDENTIK HARI INI
--
--   Dulu : satu baris kredit pendapatan barang per Surat Jalan, akunnya dari
--          peran `pendapatan_barang` milik entitas.
--   Kini : kredit DIKELOMPOKKAN per `sp_invoice_lines.account_id`, dengan
--          COALESCE ke peran yang sama kalau baris tidak punya akun.
--
--   Hari ini SELURUH baris invoice berakun sama (backfill berkas 2 mengisinya
--   dari peran itu juga), jadi jumlah kelompok = 1 dan keluarannya sama persis.
--   Yang berubah bukan angkanya, melainkan DARI MANA akunnya datang -- dan
--   itulah yang membuat kolom "Account" di baris invoice bukan hiasan.
--
-- ⚠️ PEMBULATAN: `v_dpp_sj` sekarang dihitung sebagai JUMLAH dari kelompok yang
-- MASING-MASING sudah dibulatkan 2 desimal, bukan pembulatan atas jumlahnya.
-- Dengan satu kelompok keduanya bilangan yang sama (terbukti di bukti langkah
-- 2). Dengan banyak kelompok, hanya bentuk inilah yang menjamin
-- debit = SUM(kredit) persis -- membulatkan totalnya saja akan meninggalkan
-- selisih sen yang langsung ditangkap invariant piutang.
-- ============================================================================
--
-- TIDAK DISENTUH: sp_invoice_readiness, submit_invoice, record_payment,
-- guard peran, urutan guard, teks pesan, penomoran invoice, rantai termin,
-- dan toleransi invariant (n_SJ x Rp1).
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
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_invoice_lines' AND column_name='line_amount'
  ) THEN
    RAISE EXCEPTION 'PALANG: sp_invoice_lines.line_amount tidak ada -- jalankan 20260928000002 lebih dulu.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_invoice_for_sp';

  IF v_def IS NULL OR v_def NOT LIKE '%sp_invoice_readiness%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp yang hidup BUKAN versi AR Tahap 2 (butir 13). Berkas ini menulis ulang fungsi itu; menjalankannya di atas versi lain akan memasang guard di luar urutan antrean produksi.';
  END IF;

  RAISE NOTICE 'PALANG LOLOS.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- (1) PROYEKSI JURNAL -- satu-satunya tempat aritmetika jurnal invoice hidup.
--
-- BACA-SAJA (STABLE, nol INSERT/UPDATE). SECURITY DEFINER dengan alasan yang
-- sama seperti sp_invoice_readiness: ia harus memberi jawaban yang SAMA lewat
-- dua jalur -- dipanggil pembuktian/uji, dan dipanggil post_invoice_journal
-- (yang DEFINER, jadi melihat semua baris). Kalau INVOKER, Surat Jalan yang
-- disembunyikan RLS dari pemanggil akan hilang dari proyeksi dan jurnalnya
-- diam-diam kurang.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_journal_projection(p_invoice_id uuid)
RETURNS TABLE (
  delivery_note_id uuid,
  entry_date       date,
  description      text,
  account_id       uuid,
  debit            numeric(18,2),
  credit           numeric(18,2),
  peran            text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid; v_sp_order_id uuid; v_invoice_no text; v_sp_no text;
  v_acc_ar uuid; v_acc_rev uuid; v_acc_ppn_out uuid; v_acc_ship uuid; v_acc_ship_line uuid;
  v_total_ship numeric(18,2);
  dn RECORD;
  v_accs uuid[]; v_amts numeric[];
  v_dpp_sj numeric(18,2); v_ship_sj numeric(18,2); v_ppn_sj numeric(18,2); v_amount_sj numeric(18,2);
  v_desc text; i int;
BEGIN
  SELECT i2.company_id, i2.sp_order_id, i2.invoice_no, o.sp_no
    INTO v_company_id, v_sp_order_id, v_invoice_no, v_sp_no
    FROM sp_invoices i2
    JOIN sp_orders o ON o.id = i2.sp_order_id
   WHERE i2.id = p_invoice_id;
  IF v_company_id IS NULL THEN RETURN; END IF;

  -- Akun lewat PERAN. get_mapped_account sendiri yang melempar kalau belum
  -- dipetakan, jadi tidak ada IF NULL di sini (sama seperti butir 13).
  v_acc_ar      := get_mapped_account(v_company_id, 'piutang_usaha');
  v_acc_rev     := get_mapped_account(v_company_id, 'pendapatan_barang');
  v_acc_ppn_out := get_mapped_account(v_company_id, 'ppn_keluaran');

  SELECT COALESCE(SUM(shipping_price), 0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = v_sp_order_id;
  IF v_total_ship > 0 THEN
    v_acc_ship := get_mapped_account(v_company_id, 'pendapatan_jasa_kirim');
    -- Baris ongkir boleh punya akunnya sendiri; kalau tidak, jatuh ke peran.
    SELECT sl.account_id INTO v_acc_ship_line
      FROM sp_invoice_lines sl
     WHERE sl.invoice_id = p_invoice_id AND sl.line_type = 'shipping'
     LIMIT 1;
    v_acc_ship := COALESCE(v_acc_ship_line, v_acc_ship);
  END IF;

  FOR dn IN
    SELECT d.id, d.do_no, d.signed_date
      FROM delivery_notes d
     WHERE d.sp_order_id = v_sp_order_id
       AND d.status = 'delivered'
       AND d.signed_date IS NOT NULL
     ORDER BY d.signed_date
  LOOP
    IF EXISTS (SELECT 1 FROM delivery_note_items dni
                WHERE dni.delivery_note_id = dn.id AND dni.sp_order_item_id IS NULL) THEN
      RAISE EXCEPTION 'Surat Jalan % punya baris barang tanpa kaitan ke item SP (sp_order_item_id NULL) - jurnal tidak bisa dihitung. Jalankan migrasi 20260925000001 (backfill) lebih dulu.', dn.do_no;
    END IF;

    -- Kelompok kredit pendapatan, SATU per akun. Tiap kelompok dibulatkan
    -- lebih dulu; v_dpp_sj lahir dari JUMLAH kelompok yang sudah dibulatkan
    -- (lihat catatan PEMBULATAN di kepala berkas).
    SELECT COALESCE(array_agg(q.acc ORDER BY q.acc), ARRAY[]::uuid[]),
           COALESCE(array_agg(q.dpp ORDER BY q.acc), ARRAY[]::numeric[])
      INTO v_accs, v_amts
      FROM (
        SELECT COALESCE(sil.account_id, v_acc_rev) AS acc,
               ROUND(COALESCE(SUM(soi.unit_price * soi.shipped_qty * dni.qty::numeric
                                  / NULLIF(item_tot.total_qty, 0)), 0), 2) AS dpp
          FROM delivery_note_items dni
          JOIN sp_order_items soi ON soi.id = dni.sp_order_item_id
          LEFT JOIN sp_invoice_lines sil
                 ON sil.invoice_id = p_invoice_id AND sil.sp_order_item_id = soi.id
          JOIN (
            SELECT dni2.sp_order_item_id, SUM(dni2.qty) AS total_qty
              FROM delivery_note_items dni2
              JOIN delivery_notes dn2 ON dn2.id = dni2.delivery_note_id
             WHERE dn2.sp_order_id = v_sp_order_id
               AND dn2.status = 'delivered'
               AND dn2.signed_date IS NOT NULL
             GROUP BY dni2.sp_order_item_id
          ) item_tot ON item_tot.sp_order_item_id = soi.id
         WHERE dni.delivery_note_id = dn.id
         GROUP BY COALESCE(sil.account_id, v_acc_rev)
      ) q;

    SELECT COALESCE(SUM(x), 0) INTO v_dpp_sj FROM unnest(v_amts) x;

    SELECT COALESCE(SUM(soi.shipping_price * dni.qty::numeric / NULLIF(item_tot.total_qty, 0)), 0)
      INTO v_ship_sj
      FROM delivery_note_items dni
      JOIN sp_order_items soi ON soi.id = dni.sp_order_item_id
      JOIN (
        SELECT dni2.sp_order_item_id, SUM(dni2.qty) AS total_qty
          FROM delivery_note_items dni2
          JOIN delivery_notes dn2 ON dn2.id = dni2.delivery_note_id
         WHERE dn2.sp_order_id = v_sp_order_id
           AND dn2.status = 'delivered'
           AND dn2.signed_date IS NOT NULL
         GROUP BY dni2.sp_order_item_id
      ) item_tot ON item_tot.sp_order_item_id = soi.id
     WHERE dni.delivery_note_id = dn.id;

    v_ppn_sj    := ROUND((v_dpp_sj + v_ship_sj) * 0.11);
    v_amount_sj := v_dpp_sj + v_ppn_sj + v_ship_sj;

    IF v_amount_sj = 0 THEN CONTINUE; END IF;

    v_desc := 'Penerbitan invoice ' || v_invoice_no || ' (SP ' || v_sp_no || ', porsi Surat Jalan ' || dn.do_no || ')';

    delivery_note_id := dn.id; entry_date := dn.signed_date; description := v_desc;
    account_id := v_acc_ar; debit := v_amount_sj; credit := 0; peran := 'piutang_usaha';
    RETURN NEXT;

    IF v_accs IS NOT NULL THEN
      FOR i IN 1 .. COALESCE(array_length(v_accs, 1), 0) LOOP
        IF v_amts[i] > 0 THEN
          delivery_note_id := dn.id; entry_date := dn.signed_date; description := v_desc;
          account_id := v_accs[i]; debit := 0; credit := v_amts[i]; peran := 'pendapatan_barang';
          RETURN NEXT;
        END IF;
      END LOOP;
    END IF;

    IF v_ship_sj > 0 THEN
      delivery_note_id := dn.id; entry_date := dn.signed_date; description := v_desc;
      account_id := v_acc_ship; debit := 0; credit := v_ship_sj; peran := 'pendapatan_jasa_kirim';
      RETURN NEXT;
    END IF;

    IF v_ppn_sj > 0 THEN
      delivery_note_id := dn.id; entry_date := dn.signed_date; description := v_desc;
      account_id := v_acc_ppn_out; debit := 0; credit := v_ppn_sj; peran := 'ppn_keluaran';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.invoice_journal_projection(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.invoice_journal_projection(uuid) IS
  'Baris jurnal yang SEHARUSNYA untuk satu invoice. BACA-SAJA. Satu-satunya tempat aritmetika jurnal invoice hidup: post_invoice_journal hanya menuliskan hasilnya, dan bukti identitas menguji fungsi ini -- bukan salinan rumus. Invoice lengkap berkas 3, 20260928000003.';

-- ---------------------------------------------------------------------------
-- (2) BUKTI -- proyeksi vs jurnal yang SUDAH ADA, DUA ARAH.
--
-- Dijalankan SEBELUM create_invoice_for_sp diganti. Jurnal yang ada dibuat
-- kode LAMA; kalau proyeksi cocok sempurna dengannya, kode BARU (yang menulis
-- dari proyeksi) menghasilkan jurnal yang sama.
--
-- Dibandingkan sebagai MULTISET (jumlah baris identik per kombinasi), bukan
-- sebagai himpunan: dua baris kredit bernilai sama pada satu entri adalah
-- keadaan yang sah, dan EXCEPT biasa akan menyamakannya jadi satu lalu
-- melaporkan "cocok" padahal jumlahnya berbeda.
-- ---------------------------------------------------------------------------
DO $bukti$
DECLARE
  v_inv          RECORD;
  v_n_invoice    int := 0;
  v_n_proyeksi   int := 0;
  v_n_aktual     int := 0;
  v_hilang       int := 0;   -- ada di AKTUAL, tidak diproduksi proyeksi
  v_berlebih     int := 0;   -- diproduksi proyeksi, tidak ada di AKTUAL
  v_beda_entri   int := 0;
BEGIN
  CREATE TEMP TABLE _proy (
    invoice_id uuid, delivery_note_id uuid, entry_date date, description text,
    account_id uuid, debit numeric(18,2), credit numeric(18,2)
  ) ON COMMIT DROP;

  FOR v_inv IN
    SELECT DISTINCT je.reference_id AS id
      FROM journal_entries je
     WHERE je.reference_type = 'invoice_issued'
  LOOP
    v_n_invoice := v_n_invoice + 1;
    INSERT INTO _proy
    SELECT v_inv.id, p.delivery_note_id, p.entry_date, p.description, p.account_id, p.debit, p.credit
      FROM invoice_journal_projection(v_inv.id) p;
  END LOOP;

  SELECT count(*) INTO v_n_proyeksi FROM _proy;

  SELECT count(*) INTO v_n_aktual
    FROM journal_entries je
    JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
   WHERE je.reference_type = 'invoice_issued';

  -- Arah 1: baris AKTUAL yang tidak diproduksi proyeksi.
  WITH aktual AS (
    SELECT je.reference_id AS invoice_id, je.delivery_note_id, je.entry_date, je.description,
           jl.account_id, jl.debit, jl.credit, count(*) AS n
      FROM journal_entries je
      JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
     WHERE je.reference_type = 'invoice_issued'
     GROUP BY 1,2,3,4,5,6,7
  ), proy AS (
    SELECT invoice_id, delivery_note_id, entry_date, description, account_id, debit, credit, count(*) AS n
      FROM _proy GROUP BY 1,2,3,4,5,6,7
  )
  SELECT COALESCE(SUM(GREATEST(a.n - COALESCE(p.n, 0), 0)), 0) INTO v_hilang
    FROM aktual a
    LEFT JOIN proy p USING (invoice_id, delivery_note_id, entry_date, description, account_id, debit, credit);

  -- Arah 2: baris PROYEKSI yang tidak ada di aktual.
  WITH aktual AS (
    SELECT je.reference_id AS invoice_id, je.delivery_note_id, je.entry_date, je.description,
           jl.account_id, jl.debit, jl.credit, count(*) AS n
      FROM journal_entries je
      JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
     WHERE je.reference_type = 'invoice_issued'
     GROUP BY 1,2,3,4,5,6,7
  ), proy AS (
    SELECT invoice_id, delivery_note_id, entry_date, description, account_id, debit, credit, count(*) AS n
      FROM _proy GROUP BY 1,2,3,4,5,6,7
  )
  SELECT COALESCE(SUM(GREATEST(p.n - COALESCE(a.n, 0), 0)), 0) INTO v_berlebih
    FROM proy p
    LEFT JOIN aktual a USING (invoice_id, delivery_note_id, entry_date, description, account_id, debit, credit);

  -- Jumlah ENTRI (bukan baris) per invoice juga harus sama.
  SELECT count(*) INTO v_beda_entri FROM (
    SELECT je.reference_id AS id, count(DISTINCT je.id) AS n_aktual,
           (SELECT count(DISTINCT pr.delivery_note_id) FROM _proy pr WHERE pr.invoice_id = je.reference_id) AS n_proy
      FROM journal_entries je WHERE je.reference_type='invoice_issued'
     GROUP BY je.reference_id
    HAVING count(DISTINCT je.id) <> (SELECT count(DISTINCT pr.delivery_note_id) FROM _proy pr WHERE pr.invoice_id = je.reference_id)
  ) z;

  RAISE NOTICE 'BUKTI: % invoice, % baris proyeksi vs % baris aktual; hilang %, berlebih %, entri beda %',
    v_n_invoice, v_n_proyeksi, v_n_aktual, v_hilang, v_berlebih, v_beda_entri;

  IF v_hilang <> 0 OR v_berlebih <> 0 OR v_beda_entri <> 0 OR v_n_proyeksi <> v_n_aktual THEN
    RAISE EXCEPTION 'BUKTI GAGAL: proyeksi TIDAK identik dengan jurnal yang ada (hilang %, berlebih %, entri beda %, % vs % baris). create_invoice_for_sp TIDAK diganti.',
      v_hilang, v_berlebih, v_beda_entri, v_n_proyeksi, v_n_aktual;
  END IF;

  -- PEMBANDING: bukti di atas tak berarti apa-apa kalau proyeksinya kosong
  -- (0 = 0 selalu cocok). Kelas hijau-palsu "lolos karena prasyaratnya tak
  -- pernah terpenuhi" -- 25 Sep 2026, tiga kali dalam satu hari.
  IF v_n_proyeksi = 0 OR v_n_invoice = 0 THEN
    RAISE EXCEPTION 'BUKTI GAGAL: proyeksi menghasilkan NOL baris untuk NOL invoice -- tidak ada yang dibuktikan.';
  END IF;

  RAISE NOTICE 'BUKTI LOLOS: identik dua arah, 0 selisih.';
END
$bukti$;

-- ---------------------------------------------------------------------------
-- (3) PENULIS JURNAL -- tidak menghitung apa pun, hanya menuliskan proyeksi.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_invoice_journal(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id uuid; v_total_amount numeric(18,2); v_sp_no text; v_uid uuid := auth.uid();
  v_acc_ar uuid; v_je_count int := 0; v_je_id uuid;
  v_debit_ar numeric(18,2); v_toleransi numeric(18,2);
  dn RECORD; r RECORD;
BEGIN
  SELECT i.company_id, i.total_amount, o.sp_no
    INTO v_company_id, v_total_amount, v_sp_no
    FROM sp_invoices i JOIN sp_orders o ON o.id = i.sp_order_id
   WHERE i.id = p_invoice_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;

  v_acc_ar := get_mapped_account(v_company_id, 'piutang_usaha');

  -- Satu journal_entry per Surat Jalan yang muncul di proyeksi.
  FOR dn IN
    SELECT DISTINCT p.delivery_note_id, p.entry_date, p.description
      FROM invoice_journal_projection(p_invoice_id) p
     ORDER BY p.entry_date, p.delivery_note_id
  LOOP
    INSERT INTO journal_entries (company_id, entry_date, reference_type, reference_id,
                                 delivery_note_id, description, created_by)
    VALUES (v_company_id, dn.entry_date, 'invoice_issued', p_invoice_id,
            dn.delivery_note_id, dn.description, v_uid)
    RETURNING id INTO v_je_id;

    v_je_count := v_je_count + 1;

    FOR r IN
      SELECT p.account_id, p.debit, p.credit
        FROM invoice_journal_projection(p_invoice_id) p
       WHERE p.delivery_note_id = dn.delivery_note_id
    LOOP
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, r.account_id, r.debit, r.credit);
    END LOOP;
  END LOOP;

  -- INVARIANT PIUTANG -- toleransi PERSIS seperti AR Tahap 1: n_SJ x Rp1.
  SELECT COALESCE(SUM(jl.debit), 0) INTO v_debit_ar
    FROM journal_entries je
    JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
   WHERE je.reference_type = 'invoice_issued' AND je.reference_id = p_invoice_id
     AND jl.account_id = v_acc_ar;

  v_toleransi := GREATEST(v_je_count, 1) * 1;

  IF abs(v_debit_ar - v_total_amount) > v_toleransi THEN
    RAISE EXCEPTION 'Invariant piutang gagal untuk SP %: debit piutang % tidak sama dengan total invoice % (selisih %, toleransi % untuk % Surat Jalan berjurnal). Invoice DIBATALKAN.',
      v_sp_no, v_debit_ar, v_total_amount, abs(v_debit_ar - v_total_amount), v_toleransi, v_je_count;
  END IF;

  RETURN v_je_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.post_invoice_journal(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.post_invoice_journal(uuid) IS
  'Menulis jurnal penerbitan dari invoice_journal_projection + menguji invariant piutang. NOL aritmetika sendiri. Dipanggil create_invoice_for_sp; penerbit invoice MSI kelak memanggil fungsi yang SAMA, bukan menyalinnya. Berkas 3, 20260928000003.';

-- ---------------------------------------------------------------------------
-- (4) create_invoice_for_sp v3.
-- Guard, urutan guard, teks pesan, penomoran, dan rantai termin DISALIN
-- VERBATIM dari versi butir 13. Yang berubah hanya: kolom baru diisi, baris
-- ongkir dibuat, total diturunkan dari baris, dan jurnal lewat helper.
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
  v_override_days int; v_term_days int; v_due_date date;
  v_term_label   text;
  v_cust_npwp    text;
  v_acc_rev      uuid; v_acc_ship uuid;
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

  -- NPWP DI-SNAPSHOT di sini, bukan dibaca live saat mencetak.
  SELECT btrim(COALESCE(tax_id, '')) INTO v_cust_npwp FROM accounts WHERE id = v_customer_id;

  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_no, invoice_date, status, created_by,
                           source_type, customer_tax_id, payment_term_days, payment_term_label)
  VALUES (v_company_id, p_sp_order_id, v_invoice_no, v_invoice_date, 'issued', v_uid,
          'sp_storbit', NULLIF(v_cust_npwp, ''), v_term_days, v_term_label)
  RETURNING id INTO v_invoice_id;

  v_acc_rev := get_mapped_account(v_company_id, 'pendapatan_barang');

  -- BARIS BARANG -- kini membawa snapshot produk, harga, satuan, dan akun.
  -- `dpp` tetap basis pajak barang; `line_amount` = nilai baris di dokumen.
  INSERT INTO sp_invoice_lines (
    invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
    line_type, product_id, product_name, sku, uom, unit_price, line_amount, account_id, tax_rate)
  SELECT v_invoice_id, i.id,
         (i.unit_price * i.shipped_qty),
         ROUND((i.unit_price * i.shipped_qty + i.shipping_price) * 0.11),
         i.shipped_qty,
         row_number() OVER (ORDER BY i.created_at),
         'item', i.product_id, i.product_name, COALESCE(i.sku, ''),
         COALESCE(NULLIF(btrim(p.unit), ''), NULLIF(btrim(p.uom), ''), ''),
         i.unit_price,
         ROUND(i.unit_price * i.shipped_qty, 2),
         v_acc_rev, 0.11
    FROM sp_order_items i
    LEFT JOIN products p ON p.id = i.product_id
   WHERE i.sp_order_id = p_sp_order_id;

  SELECT COALESCE(SUM(shipping_price), 0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  -- BARIS ONGKIR -- angkanya sama dengan yang dulu langsung ditambahkan ke
  -- total tanpa punya baris. dpp/ppn 0: PPN ongkir sudah ada di baris barang.
  IF v_total_ship > 0 THEN
    v_acc_ship := get_mapped_account(v_company_id, 'pendapatan_jasa_kirim');
    INSERT INTO sp_invoice_lines (
      invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
      line_type, product_name, sku, uom, unit_price, line_amount, account_id, tax_rate)
    SELECT v_invoice_id, NULL, 0, 0, 1,
           -- "position" DIKUTIP: POSITION adalah kata kunci SQL (position(x in y)),
           -- dan MAX(position) tanpa kutip bisa gagal parse.
           (SELECT COALESCE(MAX(sl2."position"), 0) + 1 FROM sp_invoice_lines sl2 WHERE sl2.invoice_id = v_invoice_id),
           'shipping', 'Ongkos kirim', '', 'LOT', v_total_ship, v_total_ship, v_acc_ship, 0.11;
  END IF;

  -- TOTAL DITURUNKAN DARI BARIS. Identitasnya sama dengan rumus lama:
  -- SUM(line_amount) = SUM(dpp) + ongkir, jadi SUM(line_amount) + SUM(ppn)
  -- = SUM(dpp) + SUM(ppn) + ongkir.
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

-- ---------------------------------------------------------------------------
-- V1 -- fungsi terpasang & ACL benar.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_n int; v_pub int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('invoice_journal_projection','post_invoice_journal');
  IF v_n <> 2 THEN RAISE EXCEPTION 'V1 GAGAL: hanya % dari 2 fungsi baru terpasang.', v_n; END IF;

  -- ACL: grantee KOSONG (berawalan '=') berarti PUBLIC. proacl NULL juga
  -- berarti PUBLIC EXECUTE -- keduanya diperiksa (gotcha #40).
  SELECT count(*) INTO v_pub
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('invoice_journal_projection','post_invoice_journal')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  IF v_pub <> 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: % fungsi baru masih ber-PUBLIC EXECUTE.', v_pub;
  END IF;

  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_invoice_for_sp') NOT LIKE '%post_invoice_journal%' THEN
    RAISE EXCEPTION 'V1 GAGAL: create_invoice_for_sp tidak memanggil post_invoice_journal.';
  END IF;

  RAISE NOTICE 'V1 LOLOS: 2 fungsi baru terpasang, nol PUBLIC EXECUTE, create_invoice_for_sp memakai helper.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   create_invoice_for_sp dikembalikan dengan menjalankan ulang blok (A3)
--   20260927000003_journal_account_roles_and_readiness.sql (md5 versi yang
--   digantikan berkas ini di staging: b45e5e4892718c8e47466937ddf446c3), lalu:
--     DROP FUNCTION IF EXISTS public.post_invoice_journal(uuid);
--     DROP FUNCTION IF EXISTS public.invoice_journal_projection(uuid);
--
-- ⚠️ Rollback TIDAK membatalkan invoice yang sudah terbit dengan versi baru.
-- Baris & kolomnya tetap terisi -- dan itu benar: isinya bukan hasil versi
-- fungsi, melainkan fakta dokumen.
-- =============================================================================
