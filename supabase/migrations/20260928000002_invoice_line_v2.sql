-- =============================================================================
-- 20260928000002_invoice_line_v2.sql          (Invoice lengkap, berkas 2 dari 9)
--
-- Kolom BARIS invoice ala form Odoo: produk, deskripsi, akun, satuan, harga,
-- diskon, pajak, subtotal -- plus baris ONGKOS KIRIM yang selama ini ada di
-- total tapi tidak punya baris.
--
-- ADITIF + satu backfill yang nilainya DITURUNKAN dari baris itu sendiri.
-- ⭐ NOL angka kepala berubah: total_dpp, total_ppn, dan total_amount tidak
-- disentuh sama sekali, dan V1 membuktikannya untuk SELURUH invoice hidup.
--
-- ============================================================================
-- KENAPA ADA KOLOM `line_amount` DI SAMPING `dpp` -- baca ini sebelum menyatukan
-- keduanya, karena "merapikan"-nya akan menggeser total.
--
--   `dpp` hari ini = BASIS PAJAK BARANG, dan `ppn` per baris dihitung
--   create_invoice_for_sp sebagai ROUND((unit_price*shipped_qty + shipping_price)
--   * 0.11) -- jadi PPN baris barang SUDAH MEMUAT porsi ongkir item itu.
--   Diukur di staging 27 Sep 2026: rumus itu cocok 23 dari 23 baris.
--
--   Akibatnya baris ongkir TIDAK BOLEH menambah PPN lagi (dobel), dan nilainya
--   TIDAK BOLEH masuk `dpp` (total_dpp akan bergeser). Karena itu:
--
--     baris 'item'     -> line_amount = dpp,  ppn = ppn (apa adanya)
--     baris 'shipping' -> line_amount = ongkir, dpp = 0, ppn = 0
--
--   Tiga identitas yang dijaga, semuanya diuji di V1:
--     SUM(dpp)                    = total_dpp      (tak berubah)
--     SUM(ppn)                    = total_ppn      (tak berubah)
--     SUM(line_amount) + SUM(ppn) = total_amount   (identitas BARU yang
--                                                   sebelumnya mustahil ada,
--                                                   karena baris tak punya uang)
-- ============================================================================
--
-- ⭐ SEAM DISKON: rumus `line_amount = ROUND(unit_price * qty * (1 -
-- discount_pct/100), 2)` dipasang SEKARANG sebagai CHECK, dengan diskon
-- DIKUNCI 0. Dengan diskon 0 hasilnya persis nilai hari ini; saat diskon
-- dibuka, NOL tempat lain yang perlu berubah. Diskon hari ini hidup di harga SP
-- (hulu), bukan di invoice.
--
-- KOLOM TERKUNCI (CHECK bernama, membuka = satu ALTER yang terlihat di diff):
--   sp_invoice_lines_diskon_terkunci      discount_pct = 0
--   sp_invoice_lines_tarif_pajak_terkunci tax_rate     = 0.11
--   sp_invoice_lines_days_terkunci        days IS NULL
--
-- `days` dikunci NULL karena aturan Den: untuk penyimpanan/demurrage tagihannya
-- hari x tarif, yaitu `qty`. Kalau `days` terisi tapi total tetap dari `qty`,
-- layar memperlihatkan angka yang tidak sampai ke jurnal. Saat Job Order lahir,
-- membukanya = satu ALTER.
--
-- `line_type` sengaja HANYA ('item','shipping'). 'stamp_fee' BELUM diizinkan:
-- Odoo memakai 6030022 Beban materai (expense = ditanggung penerbit), sementara
-- baris di invoice customer biasanya MENAGIHKAN-nya (menambah piutang). Dua
-- perlakuan itu jurnalnya berbeda -- menunggu Finance (Q2).
--
-- ⚠️ BENTUK HAK `sp_invoice_lines` -- DIUKUR 27 Sep 2026, dan BERBEDA dari
-- sp_invoices: relacl = authenticated=arwdDxtm, yaitu SELECT, INSERT, DAN
-- UPDATE semuanya TINGKAT TABEL. Konsekuensinya jujur-jujuran:
--
--   * GRANT SELECT untuk kolom baru TIDAK PERLU -- sudah tercakup hak tabel.
--   * Kolom baru OTOMATIS bisa di-UPDATE `authenticated`. Itu TIDAK BISA
--     dicegah per kolom tanpa mencabut hak tabel, dan itu di luar lingkup
--     (TD-176, yang memang menyebut sp_invoice_lines sebagai salah satu tabel
--     yang sengaja belum dikeraskan).
--   ⛔ Jadi JANGAN menulis "kolom baris baru baca-saja" di mana pun -- tidak
--     benar. Yang menjaga angkanya di sini adalah CHECK rumus + RLS
--     (sp_invoice_lines_update: manager+/finance_controller di entitasnya),
--     BUKAN hak kolom. Berkas ini tidak memperburuk keadaan itu dan juga tidak
--     memperbaikinya.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG -- berkas 1 wajib lebih dulu.
-- ---------------------------------------------------------------------------
DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_invoices' AND column_name='source_type'
  ) THEN
    RAISE EXCEPTION 'PALANG: sp_invoices.source_type tidak ada -- jalankan 20260928000001 lebih dulu.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: berkas 1 terpasang.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan SEBELUM.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE v_n int; v_dpp numeric; v_ppn numeric; v_amt numeric; v_ship int;
BEGIN
  SELECT count(*) INTO v_n FROM sp_invoice_lines sl
    JOIN sp_invoices i ON i.id = sl.invoice_id WHERE i.deleted_at IS NULL;
  SELECT COALESCE(SUM(total_dpp),0), COALESCE(SUM(total_ppn),0), COALESCE(SUM(total_amount),0)
    INTO v_dpp, v_ppn, v_amt FROM sp_invoices WHERE deleted_at IS NULL;
  SELECT count(*) INTO v_ship FROM (
    SELECT i.id FROM sp_invoices i JOIN sp_order_items soi ON soi.sp_order_id = i.sp_order_id
     WHERE i.deleted_at IS NULL GROUP BY i.id HAVING COALESCE(SUM(soi.shipping_price),0) > 0) z;
  RAISE NOTICE 'V0: % baris; kepala SUM(dpp/ppn/amount) = % / % / %; % invoice akan dapat baris ongkir',
    v_n, v_dpp, v_ppn, v_amt, v_ship;
END
$v0$;

-- ---------------------------------------------------------------------------
-- (1) qty: integer -> numeric(18,4).
-- Forwarding menagih 1,5 ton / 20,5 hari. Cast implisit, nol nilai berubah
-- (seluruh qty hari ini bulat).
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoice_lines ALTER COLUMN qty TYPE numeric(18,4);

-- ---------------------------------------------------------------------------
-- (2) KOLOM BARIS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'item';

-- Snapshot produk DI BARIS. Hari ini nama & satuan dibaca live lewat
-- sp_order_items -> products, sehingga invoice LAMA ikut berubah kalau master
-- produk disunting. Kolom-kolom ini menutup drift itu.
-- FK ON DELETE SET NULL: snapshot tidak boleh menghalangi penghapusan master,
-- tapi selama produknya ada, kaitannya dijaga DB.
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT '';
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS sku          text NOT NULL DEFAULT '';
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS uom          text NOT NULL DEFAULT '';
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS description  text;
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS unit_price   numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS line_amount  numeric(18,2) NOT NULL DEFAULT 0;

-- Akun pendapatan per baris. IKUT JURNAL sejak berkas 3 (kredit dikelompokkan
-- per akun di dalam loop Surat Jalan). Nullable: entitas tanpa CoA belum punya
-- pemetaan, dan NULL berarti "jatuh ke peran", bukan "hilang".
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.chart_of_accounts(id);

-- Pajak. Master `taxes` SUDAH ADA (per entitas, rate, gl_account_id) dan
-- diadministrasi dari Admin Settings -- tidak perlu tabel baru.
-- ⚠️ Di staging tabel itu masih 0 baris, jadi tax_id tetap NULL dan layar
-- menampilkan tarifnya saja. Menyeed master pajak = pekerjaan terpisah.
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS tax_id   uuid REFERENCES public.taxes(id);
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4) NOT NULL DEFAULT 0.11;

-- Diskon -- rumusnya aktif, nilainya dikunci 0 (lihat kepala berkas).
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) NOT NULL DEFAULT 0;

-- Dimensi analitik. SENGAJA teks, bukan FK: tabel Job Order belum ada, dan
-- memilih bentuknya sekarang = menebak apakah dimensinya Job Order, cost
-- center, atau vessel/voyage.
-- ⛔ Saat Job Order lahir ia menambah `job_order_id uuid` sebagai KOLOM SENDIRI.
-- JANGAN mendaur ulang analytic_ref jadi kunci asing -- itu backfill yang pasti
-- kotor.
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS analytic_ref   text;
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS analytic_label text;

-- Days -- dikunci NULL (lihat kepala berkas).
ALTER TABLE public.sp_invoice_lines ADD COLUMN IF NOT EXISTS days numeric(10,2);

-- ---------------------------------------------------------------------------
-- (3) BACKFILL baris lama -- seluruhnya diturunkan, nol nilai dikarang.
-- ⚠️ account_id lewat LEFT JOIN account_role_mappings, BUKAN get_mapped_account():
-- fungsi itu MELEMPAR kalau perannya belum dipetakan, dan di backfill itu
-- berarti satu entitas tanpa CoA membatalkan seluruh migrasi. NULL = "belum
-- dipetakan", jawaban yang benar untuk entitas yang memang belum punya CoA.
-- ---------------------------------------------------------------------------
-- ⚠️ Akun diambil lewat SUBQUERY SKALAR, bukan dengan menarik sp_invoices ke
-- dalam FROM: pada UPDATE ... FROM, tabel TARGET (`sl`) tidak boleh dirujuk dari
-- kondisi JOIN di daftar FROM (42P01). `sl` hanya sah di WHERE dan di dalam
-- subquery terkorelasi.
UPDATE public.sp_invoice_lines sl
   SET product_id   = soi.product_id,
       product_name = COALESCE(soi.product_name, ''),
       sku          = COALESCE(soi.sku, ''),
       uom          = COALESCE(NULLIF(btrim(p.unit), ''), NULLIF(btrim(p.uom), ''), ''),
       unit_price   = soi.unit_price,
       line_amount  = sl.dpp,
       account_id   = (SELECT arm.account_id
                         FROM sp_invoices i2
                         LEFT JOIN account_role_mappings arm
                                ON arm.company_id = i2.company_id
                               AND arm.role_key = 'pendapatan_barang'
                        WHERE i2.id = sl.invoice_id)
  FROM sp_order_items soi
       LEFT JOIN products p ON p.id = soi.product_id
 WHERE soi.id = sl.sp_order_item_id
   AND sl.line_type = 'item';

-- ---------------------------------------------------------------------------
-- (4) BARIS ONGKOS KIRIM.
-- Angkanya PERSIS yang hari ini sudah masuk total_amount tanpa punya baris
-- (SUM sp_order_items.shipping_price). Total tidak bergerak; yang berubah cuma
-- dokumen jadi menjelaskan dirinya sendiri.
-- dpp = 0 dan ppn = 0: PPN ongkir SUDAH ada di baris barang (lihat kepala).
-- ---------------------------------------------------------------------------
INSERT INTO public.sp_invoice_lines
  (invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
   line_type, product_name, sku, uom, description, unit_price, line_amount, account_id, tax_rate)
SELECT z.invoice_id, NULL, 0, 0, 1, z.pos_berikut,
       'shipping', 'Ongkos kirim', '', 'LOT', NULL, z.ship, z.ship, arm.account_id, 0.11
  FROM (
    SELECT i.id AS invoice_id, i.company_id,
           COALESCE(SUM(soi.shipping_price), 0) AS ship,
           (SELECT COALESCE(MAX(sl2."position"), 0) + 1 FROM sp_invoice_lines sl2 WHERE sl2.invoice_id = i.id) AS pos_berikut
      FROM sp_invoices i
      JOIN sp_order_items soi ON soi.sp_order_id = i.sp_order_id
     WHERE i.deleted_at IS NULL
     GROUP BY i.id, i.company_id
    HAVING COALESCE(SUM(soi.shipping_price), 0) > 0
  ) z
  LEFT JOIN account_role_mappings arm
         ON arm.company_id = z.company_id AND arm.role_key = 'pendapatan_jasa_kirim'
 WHERE NOT EXISTS (
   SELECT 1 FROM sp_invoice_lines sl3 WHERE sl3.invoice_id = z.invoice_id AND sl3.line_type = 'shipping'
 );

-- ---------------------------------------------------------------------------
-- (5) CONSTRAINT -- dipasang SESUDAH backfill, supaya kegagalannya menunjuk
-- data yang salah, bukan urutan yang salah.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoice_lines DROP CONSTRAINT IF EXISTS sp_invoice_lines_line_type_check;
ALTER TABLE public.sp_invoice_lines
  ADD CONSTRAINT sp_invoice_lines_line_type_check CHECK (line_type IN ('item','shipping'));

ALTER TABLE public.sp_invoice_lines DROP CONSTRAINT IF EXISTS sp_invoice_lines_diskon_terkunci;
ALTER TABLE public.sp_invoice_lines
  ADD CONSTRAINT sp_invoice_lines_diskon_terkunci CHECK (discount_pct = 0);

ALTER TABLE public.sp_invoice_lines DROP CONSTRAINT IF EXISTS sp_invoice_lines_tarif_pajak_terkunci;
ALTER TABLE public.sp_invoice_lines
  ADD CONSTRAINT sp_invoice_lines_tarif_pajak_terkunci CHECK (tax_rate = 0.11);

ALTER TABLE public.sp_invoice_lines DROP CONSTRAINT IF EXISTS sp_invoice_lines_days_terkunci;
ALTER TABLE public.sp_invoice_lines
  ADD CONSTRAINT sp_invoice_lines_days_terkunci CHECK (days IS NULL);

-- Rumus nilai baris. Satu CHECK menutup baris barang DAN baris ongkir:
-- ongkir disimpan sebagai qty 1 x unit_price ongkir.
ALTER TABLE public.sp_invoice_lines DROP CONSTRAINT IF EXISTS sp_invoice_lines_amount_rumus;
ALTER TABLE public.sp_invoice_lines
  ADD CONSTRAINT sp_invoice_lines_amount_rumus
  CHECK (line_amount = ROUND(unit_price * COALESCE(qty, 0) * (1 - discount_pct / 100), 2));

-- Baris ongkir tidak ikut basis pajak barang (PPN-nya sudah di baris barang).
ALTER TABLE public.sp_invoice_lines DROP CONSTRAINT IF EXISTS sp_invoice_lines_shipping_bukan_basis_pajak;
ALTER TABLE public.sp_invoice_lines
  ADD CONSTRAINT sp_invoice_lines_shipping_bukan_basis_pajak
  CHECK (line_type <> 'shipping' OR (dpp = 0 AND ppn = 0));

CREATE INDEX IF NOT EXISTS idx_sp_invoice_lines_invoice ON public.sp_invoice_lines (invoice_id);

-- ---------------------------------------------------------------------------
-- (6) HAK -- NOL GRANT baru. SELECT sudah tingkat tabel di sini (lihat blok
-- "BENTUK HAK" di kepala berkas), jadi menuliskannya cuma mengajarkan
-- keyakinan yang keliru tentang bentuk hak tabel ini.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.sp_invoice_lines.line_amount IS
  'Nilai baris di DOKUMEN, pra-pajak. Untuk baris item = dpp; untuk baris shipping = ongkir (dpp 0). SUM(line_amount)+SUM(ppn) = total_amount. Invoice lengkap berkas 2, 20260928000002.';
COMMENT ON COLUMN public.sp_invoice_lines.dpp IS
  'BASIS PAJAK BARANG. Sengaja TIDAK memuat ongkir, dan ppn baris barang sudah memuat porsi ongkirnya. Jangan disatukan dengan line_amount.';
COMMENT ON COLUMN public.sp_invoice_lines.discount_pct IS
  'TERKUNCI 0 (sp_invoice_lines_diskon_terkunci). Rumus line_amount sudah memperhitungkannya, jadi membuka = satu ALTER tanpa perubahan lain.';
COMMENT ON COLUMN public.sp_invoice_lines.days IS
  'TERKUNCI NULL (sp_invoice_lines_days_terkunci). Tagihan berbasis hari memakai qty; days yang terisi tanpa ikut total = angka yang tidak sampai ke jurnal.';
COMMENT ON COLUMN public.sp_invoice_lines.analytic_ref IS
  'Dimensi analitik, TEKS. Job Order kelak menambah job_order_id sebagai kolom SENDIRI -- jangan daur ulang kolom ini jadi kunci asing.';

-- ---------------------------------------------------------------------------
-- V1 -- BUKTI IDENTITAS. Gagal = seluruh transaksi batal.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_beda_dpp int; v_beda_ppn int; v_beda_amt int;
  v_n_item int; v_n_ship int; v_kosong int; v_n_sel int; v_n_kunci int;
  v_dpp numeric; v_ppn numeric; v_amt numeric;
BEGIN
  -- V1a: SUM(dpp) = total_dpp -- identitas LAMA, wajib tak bergerak.
  SELECT count(*) INTO v_beda_dpp FROM (
    SELECT i.id FROM sp_invoices i LEFT JOIN sp_invoice_lines sl ON sl.invoice_id = i.id
     WHERE i.deleted_at IS NULL
     GROUP BY i.id, i.total_dpp HAVING COALESCE(SUM(sl.dpp),0) <> i.total_dpp) z;

  -- V1b: SUM(ppn) = total_ppn -- identitas LAMA.
  SELECT count(*) INTO v_beda_ppn FROM (
    SELECT i.id FROM sp_invoices i LEFT JOIN sp_invoice_lines sl ON sl.invoice_id = i.id
     WHERE i.deleted_at IS NULL
     GROUP BY i.id, i.total_ppn HAVING COALESCE(SUM(sl.ppn),0) <> i.total_ppn) z;

  -- V1c: SUM(line_amount) + SUM(ppn) = total_amount -- identitas BARU.
  SELECT count(*) INTO v_beda_amt FROM (
    SELECT i.id FROM sp_invoices i LEFT JOIN sp_invoice_lines sl ON sl.invoice_id = i.id
     WHERE i.deleted_at IS NULL
     GROUP BY i.id, i.total_amount
    HAVING COALESCE(SUM(sl.line_amount),0) + COALESCE(SUM(sl.ppn),0) <> i.total_amount) z;

  IF v_beda_dpp <> 0 OR v_beda_ppn <> 0 OR v_beda_amt <> 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: identitas baris<->kepala meleset (dpp % invoice, ppn % invoice, amount % invoice).',
      v_beda_dpp, v_beda_ppn, v_beda_amt;
  END IF;

  SELECT count(*) FILTER (WHERE sl.line_type='item'), count(*) FILTER (WHERE sl.line_type='shipping')
    INTO v_n_item, v_n_ship
    FROM sp_invoice_lines sl JOIN sp_invoices i ON i.id = sl.invoice_id WHERE i.deleted_at IS NULL;

  -- V1d: backfill benar-benar mengisi, bukan meninggalkan default kosong.
  SELECT count(*) INTO v_kosong
    FROM sp_invoice_lines sl JOIN sp_invoices i ON i.id = sl.invoice_id
   WHERE i.deleted_at IS NULL AND sl.line_type = 'item'
     AND (sl.product_name = '' OR sl.unit_price = 0);
  IF v_kosong <> 0 THEN
    RAISE EXCEPTION 'V1d GAGAL: % baris item masih kosong product_name/unit_price sesudah backfill.', v_kosong;
  END IF;

  -- V1e: kolom baru TERBACA authenticated. Kalau tidak, FE kena "permission
  -- denied for column" dan tab Baris Invoice mati.
  SELECT count(*) INTO v_n_sel FROM information_schema.column_privileges
   WHERE table_schema='public' AND table_name='sp_invoice_lines' AND grantee='authenticated'
     AND privilege_type='SELECT' AND column_name = ANY (ARRAY[
       'line_type','product_id','product_name','sku','uom','description','unit_price',
       'line_amount','account_id','tax_id','tax_rate','discount_pct','analytic_ref',
       'analytic_label','days']);
  IF v_n_sel <> 15 THEN
    RAISE EXCEPTION 'V1e GAGAL: hanya % dari 15 kolom baris baru terbaca authenticated.', v_n_sel;
  END IF;

  -- V1f: keempat CHECK "terkunci"/rumus benar-benar terpasang. Tanpa cek ini,
  -- kegagalan memasang salah satunya lewat tanpa suara dan kolom yang
  -- SEHARUSNYA terkunci jadi bebas diisi.
  SELECT count(*) INTO v_n_kunci FROM pg_constraint
   WHERE conrelid = 'public.sp_invoice_lines'::regclass
     AND conname IN ('sp_invoice_lines_diskon_terkunci','sp_invoice_lines_tarif_pajak_terkunci',
                     'sp_invoice_lines_days_terkunci','sp_invoice_lines_amount_rumus',
                     'sp_invoice_lines_shipping_bukan_basis_pajak');
  IF v_n_kunci <> 5 THEN
    RAISE EXCEPTION 'V1f GAGAL: hanya % dari 5 CHECK baris yang terpasang.', v_n_kunci;
  END IF;

  SELECT COALESCE(SUM(total_dpp),0), COALESCE(SUM(total_ppn),0), COALESCE(SUM(total_amount),0)
    INTO v_dpp, v_ppn, v_amt FROM sp_invoices WHERE deleted_at IS NULL;

  RAISE NOTICE 'V1 LOLOS: % baris item + % baris ongkir; identitas dpp/ppn/amount 0 selisih; 5 CHECK terpasang; kepala SUM = % / % / % (tak berubah)',
    v_n_item, v_n_ship, v_dpp, v_ppn, v_amt;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK (aman selama berkas 3 BELUM jalan):
--
-- BEGIN;
--   ALTER TABLE public.sp_invoice_lines
--     DROP CONSTRAINT IF EXISTS sp_invoice_lines_line_type_check,
--     DROP CONSTRAINT IF EXISTS sp_invoice_lines_diskon_terkunci,
--     DROP CONSTRAINT IF EXISTS sp_invoice_lines_tarif_pajak_terkunci,
--     DROP CONSTRAINT IF EXISTS sp_invoice_lines_days_terkunci,
--     DROP CONSTRAINT IF EXISTS sp_invoice_lines_amount_rumus,
--     DROP CONSTRAINT IF EXISTS sp_invoice_lines_shipping_bukan_basis_pajak;
--   DELETE FROM public.sp_invoice_lines WHERE line_type = 'shipping';
--   DROP INDEX IF EXISTS public.idx_sp_invoice_lines_invoice;
--   ALTER TABLE public.sp_invoice_lines
--     DROP COLUMN IF EXISTS line_type,    DROP COLUMN IF EXISTS product_id,
--     DROP COLUMN IF EXISTS product_name, DROP COLUMN IF EXISTS sku,
--     DROP COLUMN IF EXISTS uom,          DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS unit_price,   DROP COLUMN IF EXISTS line_amount,
--     DROP COLUMN IF EXISTS account_id,   DROP COLUMN IF EXISTS tax_id,
--     DROP COLUMN IF EXISTS tax_rate,     DROP COLUMN IF EXISTS discount_pct,
--     DROP COLUMN IF EXISTS analytic_ref, DROP COLUMN IF EXISTS analytic_label,
--     DROP COLUMN IF EXISTS days;
--   ALTER TABLE public.sp_invoice_lines ALTER COLUMN qty TYPE integer;
-- COMMIT;
--
-- ⚠️ Baris `qty TYPE integer` GAGAL kalau sudah ada qty pecahan. Rollback ini
-- hanya sah selama belum ada invoice non-SP. Urutan DELETE sebelum DROP COLUMN
-- WAJIB: sesudah kolom line_type hilang, baris ongkir tak bisa dikenali lagi.
-- =============================================================================
