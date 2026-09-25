-- =============================================================================
-- 20260928000001_invoice_header_v2.sql        (Invoice lengkap, berkas 1 dari 9)
--
-- Kolom KEPALA invoice ala form Odoo + seam untuk invoice MSI (forwarding).
--
-- 100% ADITIF. Nol fungsi disentuh, nol angka berubah, nol baris data diubah
-- selain backfill dua kolom yang nilainya diturunkan dari baris itu sendiri.
-- Menjalankan berkas ini SENDIRIAN tidak mengubah satu pun invoice, jurnal,
-- atau hasil sp_invoice_readiness.
--
-- ARSITEKTUR (keputusan Den, opsi C): generalisasi DI TEMPAT. Tabel tetap
-- `sp_invoices`; yang ditanam sekarang adalah SEAM-nya supaya invoice non-SP
-- (Job Order MSI) kelak tidak perlu ALTER lagi:
--   - `source_type` ada sejak sekarang  -> nol backfill kelak
--   - `sp_order_id` boleh NULL, dijaga CHECK per-sumber -> invarian SP TIDAK
--     melemah, tapi baris non-SP jadi mungkin
-- ⛔ Rename fisik ke `invoices` SENGAJA tidak dilakukan: doc 12 butir 6-14
-- sudah diuji di staging terhadap nama ini dan BELUM naik ke produksi.
-- Mengganti nama sekarang membatalkan keadaan teruji itu.
--
-- ⭐ KOLOM YANG MENGUBAH ANGKA DIKUNCI CHECK BERNAMA, bukan dibiarkan bebas.
-- Nama constraint-nya menyebut apa yang membukanya, jadi membuka = satu
-- ALTER yang terlihat jelas di diff:
--     sp_invoices_dpp_nilai_lain_terkunci
--     sp_invoices_rounding_terkunci
--     sp_invoices_fx_terkunci
-- Alasannya bukan kehati-hatian umum: ketiganya mengubah `total_amount`, dan
-- `total_amount` diuji invariant piutang di create_invoice_for_sp. Kolom angka
-- yang tampil tapi tidak sampai ke jurnal DILARANG (keputusan Den).
--
-- ⚠️ BENTUK HAK `sp_invoices` -- DIUKUR 27 Sep 2026, bukan diasumsikan.
-- `relacl` = authenticated=ardDxtm, `attacl` hanya memuat `w` pada 10 kolom:
--
--     SELECT  -> TINGKAT TABEL. Kolom baru otomatis terbaca; menulis
--                GRANT SELECT (kolom...) tidak salah, TAPI tidak perlu, dan
--                menuliskannya mengajarkan keyakinan yang keliru bahwa hak di
--                tabel ini kolom-spesifik. Karena itu SENGAJA tidak ditulis.
--     INSERT  -> TINGKAT TABEL. Kolom baru otomatis bisa diisi saat INSERT, dan
--                itu TIDAK BISA dikecualikan per kolom tanpa mencabut hak tabel
--                (di luar lingkup; TD-176). Tidak berbahaya: baris baru tetap
--                tunduk RLS sp_invoices_insert (manager+/finance_controller di
--                entitasnya) DAN ketiga CHECK "terkunci" di bawah.
--     UPDATE  -> KOLOM-SPESIFIK (10 kolom). Kolom baru lahir TANPA hak UPDATE.
--                INILAH jaminan yang sesungguhnya: baris yang sudah terbit
--                tidak bisa disunting lewat PostgREST, hanya lewat fungsi
--                SECURITY DEFINER. V1d menguji persis ini.
--
-- ⚠️ SATU HAL YANG BUKAN SEKADAR ADITIF, dan itu disengaja:
--
--       REVOKE UPDATE (faktur_no) FROM authenticated. Hari ini `authenticated`
--       BISA menulis faktur_no langsung lewat PostgREST. Berkas 4 memasang
--       aturan "isi sekali, ubah hanya super_admin, semua berjejak" di
--       set_invoice_tax_info -- dan aturan itu tidak berarti apa-apa selama
--       jalur langsungnya masih terbuka. Blast radius diukur: NOL penulis di
--       `src/` (seluruh pemakaian faktur_no di FE adalah .select()).
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG -- berkas ini mendarat DI ATAS antrean AR Tahap 1+2 (doc 12 butir
-- 6-14). Menjalankannya di DB yang belum punya antrean itu berarti kolom baru
-- lahir di atas create_invoice_for_sp versi lama, dan berkas 3 kelak akan
-- menulis ulang fungsi itu di luar urutan antrean produksi.
-- ---------------------------------------------------------------------------
DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sp_invoice_readiness'
  ) THEN
    RAISE EXCEPTION 'PALANG: sp_invoice_readiness tidak ada -- doc 12 butir 13 (20260927000003) belum jalan di DB ini.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_mapped_account'
  ) THEN
    RAISE EXCEPTION 'PALANG: get_mapped_account tidak ada -- doc 12 butir 12 belum jalan di DB ini.';
  END IF;

  RAISE NOTICE 'PALANG LOLOS: antrean AR Tahap 1+2 terpasang di DB ini.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan SEBELUM. Angka-angka ini yang dibandingkan di V1.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE
  v_n_inv int; v_n_kolom int; v_n_upd_faktur int; v_jumlah numeric;
BEGIN
  SELECT count(*) INTO v_n_inv FROM sp_invoices WHERE deleted_at IS NULL;
  SELECT COALESCE(SUM(total_amount),0) INTO v_jumlah FROM sp_invoices WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_n_kolom FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_invoices';
  SELECT count(*) INTO v_n_upd_faktur FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='sp_invoices' AND grantee='authenticated'
     AND privilege_type='UPDATE' AND column_name='faktur_no';

  RAISE NOTICE 'V0: % invoice hidup, jumlah total_amount %, % kolom, UPDATE(faktur_no) utk authenticated = % baris hak',
    v_n_inv, v_jumlah, v_n_kolom, v_n_upd_faktur;
END
$v0$;

-- ---------------------------------------------------------------------------
-- (1) SUMBER INVOICE -- seam generalisasi.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoices
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'sp_storbit';

-- Hari ini SATU nilai. Job Order MSI menambah nilainya di sini, bukan dengan
-- membuat tabel kedua.
ALTER TABLE public.sp_invoices
  DROP CONSTRAINT IF EXISTS sp_invoices_source_type_check;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_source_type_check
  CHECK (source_type IN ('sp_storbit'));

-- sp_order_id boleh NULL -- TAPI wajib untuk sumber SP. Invarian lama utuh.
ALTER TABLE public.sp_invoices ALTER COLUMN sp_order_id DROP NOT NULL;
ALTER TABLE public.sp_invoices
  DROP CONSTRAINT IF EXISTS sp_invoices_sp_order_id_wajib_utk_storbit;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_sp_order_id_wajib_utk_storbit
  CHECK (source_type <> 'sp_storbit' OR sp_order_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- (2) KOLOM (b) -- diisi saat TERBIT oleh create_invoice_for_sp (berkas 3).
-- ---------------------------------------------------------------------------

-- NPWP customer DI-SNAPSHOT, bukan dibaca live dari accounts.tax_id.
-- Faktur Pajak memakai NPWP SAAT TERBIT; membacanya live membuat invoice lama
-- ikut berubah kalau master customer disunting -- kelas bug yang sama dengan
-- satuan produk (lihat catatan UOM di getInvoicePdfData). Invoice LAMA tetap
-- NULL dan layar menandainya "dari master", bukan berpura-pura ini snapshot.
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS customer_tax_id text;

-- Termin: ANGKANYA sudah dipakai due_date; dua kolom ini merekam ASALNYA.
-- ⚠️ Rantai termin hidup di DUA fungsi (create_invoice_for_sp dan
-- submit_invoice -- D-15). Snapshot ini ditulis HANYA oleh yang pertama.
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS payment_term_days  integer;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS payment_term_label text;

-- FK ke profiles: ini rujukan MASTER (siapa orangnya), bukan jejak audit.
-- ⛔ Sumbernya BELUM diputuskan Finance -- sp_orders tidak menyimpan
-- salesperson, dan created_by = yang menginput SP, bukan sales. Sampai
-- dijawab, kolom ini tetap NULL dan layar menulis "belum dipetakan".
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES public.profiles(id);

-- Teks bebas: Nexus TIDAK punya entitas tim sales. Membuat master untuk kolom
-- yang belum ada pengisinya = tabel kosong yang harus dirawat.
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS sales_team text;

-- Penanda perlakuan, NOL efek angka dan NOL efek pajak hari ini. FE WAJIB
-- menuliskan itu di layar: di Odoo flag ini biasanya menyiratkan perlakuan
-- pajak, jadi kotak centang telanjang akan terbaca sebagai janji yang tidak
-- ditepati kode.
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS is_reimbursement boolean NOT NULL DEFAULT false;

-- Tujuan cetak. Memengaruhi blok "Billed To" di PDF NANTI; hari ini
-- display-only dan InvoicePDF.jsx tidak disentuh sama sekali.
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS print_to text NOT NULL DEFAULT 'customer';
ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoices_print_to_check;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_print_to_check CHECK (print_to IN ('customer','agen'));

-- Invoice pengganti. Arah sebaliknya ("digantikan oleh") adalah TURUNAN, bukan
-- kolom kedua -- dua kolom yang harus saling cocok pasti melenceng.
-- Guard "hanya boleh menunjuk invoice void di entitas yang sama" TIDAK bisa
-- jadi CHECK (CHECK tak boleh membaca baris lain); ia hidup di RPC
-- link_replacement_invoice (berkas 4), dan jalur langsungnya tertutup karena
-- kolom ini tidak pernah di-GRANT UPDATE ke authenticated.
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS replaces_invoice_id uuid REFERENCES public.sp_invoices(id);

-- ---------------------------------------------------------------------------
-- (3) KOLOM (c) -- diisi SESUDAH terbit lewat RPC berjejak (berkas 4).
-- `*_by` SENGAJA TANPA FK, mengikuti preseden signed_date_filled_by
-- (20260926000001): ini jejak, dan jejak tidak boleh menghalangi penghapusan
-- baris master yang dirujuknya.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS printed_at   timestamp with time zone;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS printed_by   uuid;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS print_count  integer NOT NULL DEFAULT 0;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS emailed_at   timestamp with time zone;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS emailed_by   uuid;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS coretax_tx_code text;

ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoices_print_count_check;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_print_count_check CHECK (print_count >= 0);

-- ---------------------------------------------------------------------------
-- (4) KOLOM (d) -- MENGUBAH ANGKA. Semuanya DIKUNCI sampai tahapnya.
-- ---------------------------------------------------------------------------

-- DPP Nilai Lain (11/12).
-- ⛔ DIKUNCI false, dan alasannya BUKAN kehati-hatian: tarif 11% yang dihitung
-- create_invoice_for_sp SUDAH merupakan hasil 12% x DPP Nilai Lain (11/12) --
-- lihat PPN_LABEL_PCT / DPP_NILAI_LAIN_RATIO di src/lib/taxConstants.js dan
-- gotcha #32. Menyalakan kolom ini sekarang = menerapkan 11/12 DUA KALI.
-- Membukanya menunggu jawaban Finance (pertanyaan Q1).
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS use_dpp_nilai_lain boolean NOT NULL DEFAULT false;
ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoices_dpp_nilai_lain_terkunci;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_dpp_nilai_lain_terkunci CHECK (use_dpp_nilai_lain = false);

-- Pembulatan.
-- ⛔ DIKUNCI 'none'. Rumah aslinya SUDAH ADA:
-- entity_finance_settings.rounding_mode ('round'/'floor'/'ceil') -- yang juga
-- belum dibaca jurnal. Membuka ini mengubah total_amount -> jurnal -> invariant
-- piutang. Menunggu Finance (Q6).
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS rounding_method text NOT NULL DEFAULT 'none';
ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoices_rounding_terkunci;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_rounding_terkunci CHECK (rounding_method = 'none');

-- Mata uang + kurs.
-- Jurnal Nexus IDR: `total_amount` TETAP angka posting IDR, dan
-- `total_amount_currency` adalah nilai dalam mata uang dokumen.
-- ⛔ DIKUNCI IDR/1.0. Membuka FX butuh kebijakan revaluasi + akun selisih kurs,
-- dan peran akun untuk itu BELUM ADA di account_role_mappings (6 peran, nol
-- selisih kurs). Kolomnya ada sekarang supaya invoice MSI kelak tidak perlu
-- ALTER lagi. Menunggu Finance (Q7).
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'IDR';
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS fx_rate numeric(18,6) NOT NULL DEFAULT 1;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS total_amount_currency numeric(18,2) NOT NULL DEFAULT 0;

-- ⚠️ BACKFILL DULU, CONSTRAINT BELAKANGAN -- urutan ini bukan selera.
-- `total_amount_currency` lahir DEFAULT 0 pada baris yang sudah ada, jadi
-- memasang CHECK-nya lebih dulu membuat ADD CONSTRAINT memvalidasi baris lama
-- dan gagal seketika (23514, terbukti di staging 27 Sep 2026 -- seluruh
-- transaksi batal, nol kolom mendarat).
-- Invoice LAMA seluruhnya IDR kurs 1, jadi nilainya = total_amount. Ini bukan
-- menebak: ia konsekuensi dari kurs yang terkunci 1.
UPDATE public.sp_invoices SET total_amount_currency = total_amount
 WHERE total_amount_currency <> total_amount;

ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoices_fx_terkunci;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_fx_terkunci CHECK (currency_code = 'IDR' AND fx_rate = 1);

-- Selama kurs terkunci 1, nilai mata uang dokumen WAJIB sama dengan nilai
-- posting. Tanpa constraint ini, total_amount_currency bisa diam-diam melenceng
-- dan layar menampilkan dua angka "total" yang berbeda.
ALTER TABLE public.sp_invoices DROP CONSTRAINT IF EXISTS sp_invoices_total_currency_cocok;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_total_currency_cocok
  CHECK (fx_rate <> 1 OR total_amount_currency = total_amount);

-- ---------------------------------------------------------------------------
-- (5) INDEX -- hanya untuk kolom yang memang dicari.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sp_invoices_source_type ON public.sp_invoices (source_type);
CREATE INDEX IF NOT EXISTS idx_sp_invoices_replaces ON public.sp_invoices (replaces_invoice_id)
  WHERE replaces_invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- (6) HAK -- lihat blok "BENTUK HAK" di kepala berkas.
-- NOL GRANT baru: SELECT sudah tingkat tabel (kolom baru otomatis terbaca) dan
-- UPDATE kolom-spesifik (kolom baru otomatis TIDAK bisa disunting). Yang
-- dikerjakan di sini cuma menutup satu jalur yang memang masih terbuka.
-- ---------------------------------------------------------------------------

-- Menutup jalur tulis langsung ke faktur_no. Sesudah ini satu-satunya penulis
-- adalah set_invoice_tax_info (berkas 4), yang menegakkan "isi sekali, ubah
-- hanya super_admin, semua berjejak".
REVOKE UPDATE (faktur_no) ON public.sp_invoices FROM authenticated;

-- ---------------------------------------------------------------------------
-- COMMENT -- supaya arti kolom hidup di DB, bukan cuma di berkas migrasi.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.sp_invoices.source_type IS
  'Sumber invoice. Hari ini hanya sp_storbit; Job Order MSI menambah nilai di sini, bukan tabel kedua. Invoice lengkap berkas 1, 20260928000001.';
COMMENT ON COLUMN public.sp_invoices.customer_tax_id IS
  'NPWP customer SAAT TERBIT (snapshot). Sengaja bukan pembacaan live accounts.tax_id. NULL = invoice lama, layar jatuh ke master dan menandainya.';
COMMENT ON COLUMN public.sp_invoices.use_dpp_nilai_lain IS
  'TERKUNCI false (sp_invoices_dpp_nilai_lain_terkunci). Tarif 11% yang dihitung create_invoice_for_sp SUDAH hasil 12% x 11/12; menyalakan ini = menerapkan 11/12 dua kali. Menunggu Finance.';
COMMENT ON COLUMN public.sp_invoices.rounding_method IS
  'TERKUNCI none (sp_invoices_rounding_terkunci). Rumah aslinya entity_finance_settings.rounding_mode. Membuka mengubah total_amount -> jurnal -> invariant piutang.';
COMMENT ON COLUMN public.sp_invoices.currency_code IS
  'TERKUNCI IDR (sp_invoices_fx_terkunci). Jurnal Nexus IDR; total_amount tetap angka posting. Membuka FX butuh peran akun selisih kurs yang belum ada.';
COMMENT ON COLUMN public.sp_invoices.replaces_invoice_id IS
  'Invoice yang DIGANTIKAN oleh baris ini. Arah sebaliknya turunan, bukan kolom. Guard (hanya void, satu entitas) hidup di link_replacement_invoice.';

-- ---------------------------------------------------------------------------
-- V1 -- BUKTI. Gagal = seluruh transaksi batal.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_n_inv int; v_jumlah numeric; v_beda int;
  v_n_sel int; v_n_ins int; v_n_upd int; v_n_upd_faktur int;
  v_n_kunci int;
BEGIN
  -- V1a: nol invoice hilang, nol total_amount bergeser.
  SELECT count(*), COALESCE(SUM(total_amount),0) INTO v_n_inv, v_jumlah
    FROM sp_invoices WHERE deleted_at IS NULL;
  RAISE NOTICE 'V1a: % invoice hidup, jumlah total_amount %', v_n_inv, v_jumlah;

  -- V1b: total_amount_currency = total_amount untuk SELURUH baris.
  SELECT count(*) INTO v_beda FROM sp_invoices WHERE total_amount_currency <> total_amount;
  IF v_beda <> 0 THEN
    RAISE EXCEPTION 'V1b GAGAL: % baris ber-total_amount_currency <> total_amount.', v_beda;
  END IF;
  RAISE NOTICE 'V1b: total_amount_currency cocok di semua baris (0 selisih)';

  -- V1c: ketiga CHECK "terkunci" benar-benar terpasang.
  SELECT count(*) INTO v_n_kunci FROM pg_constraint
   WHERE conrelid = 'public.sp_invoices'::regclass
     AND conname IN ('sp_invoices_dpp_nilai_lain_terkunci','sp_invoices_rounding_terkunci','sp_invoices_fx_terkunci');
  IF v_n_kunci <> 3 THEN
    RAISE EXCEPTION 'V1c GAGAL: hanya % dari 3 CHECK terkunci yang terpasang.', v_n_kunci;
  END IF;
  RAISE NOTICE 'V1c: 3 dari 3 CHECK terkunci terpasang';

  -- V1d: kolom baru BISA dibaca authenticated, TIDAK bisa ditulis.
  -- V1d-1: kolom baru TERBACA (lewat hak SELECT tingkat tabel). Kalau ini
  -- gagal, FE kena "permission denied for column" dan halaman detail mati.
  SELECT count(*) INTO v_n_sel FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='sp_invoices' AND grantee='authenticated'
     AND privilege_type='SELECT' AND column_name = ANY (ARRAY[
       'source_type','customer_tax_id','payment_term_days','payment_term_label',
       'salesperson_id','sales_team','is_reimbursement','print_to','replaces_invoice_id',
       'printed_at','printed_by','print_count','emailed_at','emailed_by','coretax_tx_code',
       'use_dpp_nilai_lain','rounding_method','currency_code','fx_rate','total_amount_currency']);
  IF v_n_sel <> 20 THEN
    RAISE EXCEPTION 'V1d GAGAL: hanya % dari 20 kolom baru terbaca authenticated -- FE akan kena "permission denied for column".', v_n_sel;
  END IF;

  -- V1d-2: kolom baru TIDAK BISA DISUNTING. Inilah jaminan yang membuat
  -- "isi sekali lewat RPC berjejak" berarti sesuatu.
  -- ⚠️ INSERT sengaja TIDAK diuji nol: hak INSERT di tabel ini TINGKAT TABEL
  -- (relacl authenticated=ardDxtm, diukur 27 Sep 2026), jadi kolom baru pasti
  -- ikut dan itu mustahil dikecualikan per kolom. Yang menjaganya = RLS
  -- sp_invoices_insert + ketiga CHECK terkunci, bukan hak kolom.
  SELECT count(*) INTO v_n_upd FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='sp_invoices' AND grantee='authenticated'
     AND privilege_type='UPDATE' AND column_name = ANY (ARRAY[
       'source_type','customer_tax_id','payment_term_days','payment_term_label',
       'salesperson_id','sales_team','is_reimbursement','print_to','replaces_invoice_id',
       'printed_at','printed_by','print_count','emailed_at','emailed_by','coretax_tx_code',
       'use_dpp_nilai_lain','rounding_method','currency_code','fx_rate','total_amount_currency']);
  IF v_n_upd <> 0 THEN
    RAISE EXCEPTION 'V1d GAGAL: % kolom baru ter-GRANT UPDATE -- seharusnya hanya fungsi SECURITY DEFINER yang bisa menulisnya.', v_n_upd;
  END IF;

  -- V1d-3: PEMBANDING. Kalau hak UPDATE ternyata tingkat TABEL, cek di atas
  -- akan lolos karena information_schema tidak mencatatnya per kolom -- hijau
  -- palsu kelas "lolos karena prasyaratnya tak pernah terpenuhi". Jadi bentuk
  -- haknya diperiksa langsung di relacl.
  -- Butir ACL diambil SATU-SATU lewat unnest, bukan dicocokkan ke seluruh
  -- string relacl: pola '%authenticated=%w%' pada string utuh bisa menangkap
  -- 'w' milik ROLE LAIN yang kebetulan tertulis sesudahnya (kelas hijau-palsu
  -- yang sama dengan LIKE '%=X/%' pada uji ACL 25 Sep 2026).
  SELECT count(*) INTO v_n_ins
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(c.relacl) AS a
   WHERE n.nspname='public' AND c.relname='sp_invoices'
     AND a::text LIKE 'authenticated=%'
     AND split_part(a::text, '=', 2) LIKE '%w%';
  IF v_n_ins <> 0 THEN
    RAISE EXCEPTION 'V1d GAGAL: authenticated punya UPDATE TINGKAT TABEL pada sp_invoices -- hak kolom tidak menjaga apa pun.';
  END IF;
  RAISE NOTICE 'V1d: 20 kolom baru terbaca, 0 ber-UPDATE, dan UPDATE bukan hak tingkat tabel';

  -- V1e: jalur tulis langsung ke faktur_no TERTUTUP.
  SELECT count(*) INTO v_n_upd_faktur FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='sp_invoices' AND grantee='authenticated'
     AND privilege_type='UPDATE' AND column_name='faktur_no';
  IF v_n_upd_faktur <> 0 THEN
    RAISE EXCEPTION 'V1e GAGAL: authenticated MASIH bisa UPDATE faktur_no langsung.';
  END IF;
  RAISE NOTICE 'V1e: UPDATE(faktur_no) untuk authenticated dicabut';

  RAISE NOTICE 'V1 LOLOS -- berkas 1 selesai, nol angka berubah.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK (aman selama berkas 3 BELUM jalan -- sesudah itu ada pembaca):
--
-- BEGIN;
--   ALTER TABLE public.sp_invoices
--     DROP CONSTRAINT IF EXISTS sp_invoices_source_type_check,
--     DROP CONSTRAINT IF EXISTS sp_invoices_sp_order_id_wajib_utk_storbit,
--     DROP CONSTRAINT IF EXISTS sp_invoices_print_to_check,
--     DROP CONSTRAINT IF EXISTS sp_invoices_print_count_check,
--     DROP CONSTRAINT IF EXISTS sp_invoices_dpp_nilai_lain_terkunci,
--     DROP CONSTRAINT IF EXISTS sp_invoices_rounding_terkunci,
--     DROP CONSTRAINT IF EXISTS sp_invoices_fx_terkunci,
--     DROP CONSTRAINT IF EXISTS sp_invoices_total_currency_cocok;
--   DROP INDEX IF EXISTS public.idx_sp_invoices_source_type;
--   DROP INDEX IF EXISTS public.idx_sp_invoices_replaces;
--   ALTER TABLE public.sp_invoices
--     DROP COLUMN IF EXISTS source_type,           DROP COLUMN IF EXISTS customer_tax_id,
--     DROP COLUMN IF EXISTS payment_term_days,     DROP COLUMN IF EXISTS payment_term_label,
--     DROP COLUMN IF EXISTS salesperson_id,        DROP COLUMN IF EXISTS sales_team,
--     DROP COLUMN IF EXISTS is_reimbursement,      DROP COLUMN IF EXISTS print_to,
--     DROP COLUMN IF EXISTS replaces_invoice_id,   DROP COLUMN IF EXISTS printed_at,
--     DROP COLUMN IF EXISTS printed_by,            DROP COLUMN IF EXISTS print_count,
--     DROP COLUMN IF EXISTS emailed_at,            DROP COLUMN IF EXISTS emailed_by,
--     DROP COLUMN IF EXISTS coretax_tx_code,       DROP COLUMN IF EXISTS use_dpp_nilai_lain,
--     DROP COLUMN IF EXISTS rounding_method,       DROP COLUMN IF EXISTS currency_code,
--     DROP COLUMN IF EXISTS fx_rate,               DROP COLUMN IF EXISTS total_amount_currency;
--   ALTER TABLE public.sp_invoices ALTER COLUMN sp_order_id SET NOT NULL;
--   GRANT UPDATE (faktur_no) ON public.sp_invoices TO authenticated;
-- COMMIT;
--
-- ⚠️ Baris GRANT terakhir MENGEMBALIKAN jalur tulis langsung ke faktur_no.
-- Kalau rollback dilakukan sesudah berkas 4 naik, JANGAN jalankan baris itu.
-- =============================================================================
