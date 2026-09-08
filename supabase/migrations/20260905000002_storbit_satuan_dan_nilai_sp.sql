-- =============================================================================
-- Migration: 20260905000002_storbit_satuan_dan_nilai_sp
-- Phase:     Laporan Per Barang — tambah satuan produk + nilai total SP.
-- Depends:   20260905000001_storbit_laporan_barang_rpc (ketiga fungsi di bawah
--            HARUS sudah ada; migrasi ini hanya mengubahnya).
-- Status:    LIVE — dieksekusi di produksi 5 Sep 2026.
--
-- SIFAT: 100% BACA. Nol DDL tabel, nol perubahan RLS, nol index baru.
--   Tiga fungsi disentuh; get_storbit_product_sp_list dan create_invoice
--   SENGAJA TIDAK.
--
-- ── KOLOM SATUAN: `unit` PRIMER, `uom` FALLBACK ─────────────────────────────
--   products punya DUA kolom mirip. Diukur di produksi 5 Sep 2026 (80 produk):
--       unit terisi non-kosong : 78  (97,5%)
--       uom  terisi non-kosong : 38  (47,5%)
--       dua-duanya kosong      : 0
--       KONFLIK NILAI ASLI     : 0
--   Setiap baris yang dua-duanya benar-benar terisi SELALU sepakat:
--   PCS/PCS (30 produk) dan SET/SET (6 produk). Query naif
--   `WHERE unit IS NOT NULL AND uom IS NOT NULL AND unit <> uom` melaporkan 2
--   baris, tapi keduanya `unit = ''` (STRING KOSONG, bukan NULL) vs uom='PCS'
--   — produk FG.GFP.TRY.0001 dan FG.GFP.TRY.0002. Artefak data, bukan konflik.
--
--   Karena itu ekspresinya WAJIB memakai NULLIF(btrim(...),''), bukan COALESCE
--   polos: COALESCE(unit, uom) akan mengembalikan string kosong untuk kedua
--   produk itu dan satuannya hilang dari layar tanpa penjelasan.
--   Ekspresi di bawah menutup 80 dari 80 produk.
--
--   ⚠️ Master data belum seragam kapitalisasinya ('PCS' 38 vs 'Pcs' 10, 'BOX'
--   vs 'Box'). SENGAJA tidak dinormalisasi di sini — laporan menampilkan apa
--   adanya dari master. Merapikannya = pekerjaan master-data tersendiri.
--
-- ── PPN 11%: 1.11 LITERAL, MENCERMINKAN create_invoice ──────────────────────
--   create_invoice menghitung PPN sebagai
--       ROUND((unit_price * shipped_qty + shipping_price) * 0.11)
--   yaitu rate 0.11 atas basis (subtotal + ONGKIR). Angka 1.11 di bawah
--   (= basis + 11%) SENGAJA mencerminkan itu, literal dan bukan konstanta,
--   PERSIS seperti create_invoice menulis 0.11 literal di body-nya.
--   Kalau rate PPN berubah, DUA tempat ini harus bergerak bersama.
--
--   BEDA yang disengaja dari create_invoice: di sini basisnya `qty` (nilai
--   PESANAN penuh), bukan `shipped_qty` (nilai yang layak ditagih). Kartu ini
--   menjawab "berapa nilai kontrak SP-nya", bukan "berapa yang bisa difaktur".
--
-- ── ANGKA YANG TIDAK BOLEH BERUBAH ──────────────────────────────────────────
--   kirim   = 86 SP  / Rp 1.887.625.632
--   tagih   = 422 SP / Rp 6.273.578.117,31
--   piutang = 5 inv  / Rp 47.293.798
--   Ketiganya HANYA ditambahi kunci keempat; kalau salah satu bergeser setelah
--   migrasi ini, ada yang salah. Lihat blok verifikasi di kaki file.
--
-- ROLLBACK: jalankan ulang 20260905000001 apa adanya (ia DROP+CREATE keempat
--   fungsi dan memasang ACL-nya kembali).
-- =============================================================================


-- ─── 2a. get_storbit_product_report — +uom, +nilai_total_sp ──────────────────
-- Signature TIDAK berubah -> CREATE OR REPLACE (bukan DROP).
CREATE OR REPLACE FUNCTION public.get_storbit_product_report(
  p_product_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path = public
    AS $$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
-- LINGKUP BARIS BERSAMA — identik di 1a/1b/1c/1d.
sp AS (
  SELECT o.id, o.customer_id, o.sp_no, o.sp_date
  FROM public.sp_orders o, scope
  WHERE o.deleted_at IS NULL
    AND o.company_id = scope.cid
    AND o.status NOT IN ('CANCELLED','DRAFT')
    AND (p_date_from IS NULL OR o.sp_date >= p_date_from)
    AND (p_date_to   IS NULL OR o.sp_date <= p_date_to)
),
it AS (
  SELECT s.id AS sp_id, s.customer_id,
         si.qty, si.shipped_qty, si.unit_price
  FROM sp s
  JOIN public.sp_items si
    ON si.customer_id = s.customer_id
   AND si.sp_no       = s.sp_no
  WHERE si.product_id = p_product_id
),
-- Satuan produk. CTE dinamai `satuan`, BUKAN `uom`, supaya tak bertabrakan
-- dengan kolom products.uom di dalamnya. Lihat blok KOLOM SATUAN di kepala.
satuan AS (
  SELECT COALESCE(NULLIF(btrim(p.unit), ''), NULLIF(btrim(p.uom), '')) AS s
  FROM public.products p
  WHERE p.id = p_product_id
),
-- Nilai PENUH tiap SP yang memuat produk ini — SELURUH itemnya, bukan hanya
-- baris produk yang sedang dilihat. Dihitung per SP lalu dijumlah.
sp_total AS (
  SELECT s.id,
         COALESCE(SUM((si.qty * si.unit_price) + si.shipping_price), 0) * 1.11 AS nilai
  FROM (SELECT DISTINCT it.sp_id FROM it) d
  JOIN sp s ON s.id = d.sp_id
  JOIN public.sp_items si
    ON si.customer_id = s.customer_id
   AND si.sp_no       = s.sp_no
  GROUP BY s.id
),
-- Stok WAJIB dijumlah lintas gudang: stock_summary bergranularitas
-- (product_id, warehouse_id, company_id). Angka SAAT INI — p_date_from/
-- p_date_to TIDAK berlaku untuknya, dan itu disengaja.
stok AS (
  SELECT COALESCE(ROUND(SUM(ss.available)), 0)::int AS tersedia
  FROM public.stock_summary ss, scope
  WHERE ss.product_id = p_product_id
    AND ss.company_id = scope.cid
),
sum_all AS (
  SELECT
    COALESCE(SUM(it.qty), 0)::int                            AS qty_ordered,
    COALESCE(SUM(it.shipped_qty), 0)::int                    AS qty_shipped,
    COALESCE(SUM(GREATEST(it.qty - it.shipped_qty, 0)), 0)::int AS qty_outstanding,
    COALESCE(SUM(GREATEST(it.qty - it.shipped_qty, 0) * it.unit_price), 0)::numeric
                                                             AS nilai_outstanding,
    COUNT(DISTINCT it.sp_id)::int                            AS jml_sp,
    COUNT(DISTINCT it.customer_id)::int                      AS jml_customer
  FROM it
),
-- per_customer SENGAJA tidak memfilter outstanding > 0: daftar ini menjawab
-- "siapa saja yang memesan produk ini", dan customer yang sudah lunas kirim
-- tetap perlu terlihat (nilainya 0, jadi ia turun sendiri ke dasar urutan).
per_cust AS (
  SELECT
    it.customer_id,
    COALESCE(a.name, '(Tanpa nama)')                            AS customer_name,
    COALESCE(SUM(GREATEST(it.qty - it.shipped_qty, 0)), 0)::int AS qty_outstanding,
    COALESCE(SUM(GREATEST(it.qty - it.shipped_qty, 0) * it.unit_price), 0)::numeric
                                                                AS nilai_outstanding,
    COUNT(DISTINCT it.sp_id)::int                               AS jml_sp
  FROM it
  LEFT JOIN public.accounts a ON a.id = it.customer_id
  GROUP BY it.customer_id, a.name
)
SELECT jsonb_build_object(
  'summary', jsonb_build_object(
    'qty_ordered',       (SELECT qty_ordered       FROM sum_all),
    'qty_shipped',       (SELECT qty_shipped       FROM sum_all),
    'qty_outstanding',   (SELECT qty_outstanding   FROM sum_all),
    'nilai_outstanding', (SELECT nilai_outstanding FROM sum_all),
    'stok_tersedia',     (SELECT tersedia          FROM stok),
    'defisit',           GREATEST((SELECT qty_outstanding FROM sum_all)
                               - (SELECT tersedia         FROM stok), 0),
    'jml_sp',            (SELECT jml_sp            FROM sum_all),
    'jml_customer',      (SELECT jml_customer      FROM sum_all),
    -- ── baru 5 Sep 2026 ──
    'uom',               (SELECT s FROM satuan),
    'nilai_total_sp',    COALESCE((SELECT ROUND(SUM(t.nilai), 2) FROM sp_total t), 0)
  ),
  'per_customer', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'customer_id',       pc.customer_id,
             'customer_name',     pc.customer_name,
             'qty_outstanding',   pc.qty_outstanding,
             'nilai_outstanding', pc.nilai_outstanding,
             'jml_sp',            pc.jml_sp
           ) ORDER BY pc.nilai_outstanding DESC, pc.customer_name)
    FROM per_cust pc
  ), '[]'::jsonb),
  'generated_at', now()
);
$$;

COMMENT ON FUNCTION public.get_storbit_product_report(uuid, uuid, date, date) IS
'Laporan satu produk: ringkasan + rincian per customer.
BASIS PAJAK CAMPURAN — baca per kunci:
  nilai_outstanding = DPP, BELUM termasuk PPN.
  nilai_total_sp    = BRUTO, SUDAH termasuk PPN (x1.11 mencerminkan
                      create_invoice); nilai PENUH seluruh SP yang memuat
                      produk ini, basis qty (pesanan), bukan shipped_qty.
uom = COALESCE(NULLIF(btrim(products.unit),''), NULLIF(btrim(products.uom),'')).
Sumber angka sp_items (bukan sp_order_items).
stok_tersedia = SUM(stock_summary.available) lintas gudang; angka SAAT INI,
tidak terpengaruh p_date_from/p_date_to.
per_customer tidak memfilter outstanding > 0 (customer lunas-kirim tetap muncul
dengan nilai 0).';

-- ACL diulang: CREATE OR REPLACE mempertahankan GRANT, tapi blok ini WAJIB ada
-- supaya file ini aman dijalankan ulang dan tak bergantung pada state sebelumnya.
REVOKE ALL ON FUNCTION public.get_storbit_product_report(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_product_report(uuid, uuid, date, date) TO authenticated;


-- ─── 2b. get_storbit_top_outstanding_products — +kolom uom ───────────────────
-- ⚠️ RETURNS TABLE BERUBAH (kolom baru) -> CREATE OR REPLACE akan DITOLAK
--    ("cannot change return type of existing function"). Harus DROP dulu.
--    DROP menghapus GRANT, jadi blok ACL di bawahnya BUKAN formalitas.
DROP FUNCTION IF EXISTS public.get_storbit_top_outstanding_products(uuid, int);

CREATE FUNCTION public.get_storbit_top_outstanding_products(
  p_company_id uuid DEFAULT NULL,
  p_limit      int  DEFAULT 10
) RETURNS TABLE(
  product_id        uuid,
  code              text,
  product_name      text,
  uom               text,
  qty_outstanding   int,
  nilai_outstanding numeric,
  stok_tersedia     int,
  jml_sp            int
)
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path = public
    AS $$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
-- LINGKUP BARIS BERSAMA — identik di 1a/1b/1c/1d.
sp AS (
  SELECT o.id, o.customer_id, o.sp_no
  FROM public.sp_orders o, scope
  WHERE o.deleted_at IS NULL
    AND o.company_id = scope.cid
    AND o.status NOT IN ('CANCELLED','DRAFT')
),
-- SENGAJA TANPA filter "sisa > 0": daftar ini juga menjadi sumber tunggal isi
-- combobox produk di FE (produk yang pernah muncul di SP — 38 per 5 Sep 2026).
-- Produk yang sudah terkirim penuh tetap harus bisa dipilih dan dilaporkan; ia
-- cuma turun ke dasar urutan. Memfilternya di sini akan menghilangkannya dari
-- dropdown juga, dan halaman kehilangan produk tanpa penjelasan apa pun.
agg AS (
  SELECT
    si.product_id,
    SUM(GREATEST(si.qty - si.shipped_qty, 0))::int AS qty_outstanding,
    SUM(GREATEST(si.qty - si.shipped_qty, 0) * si.unit_price)::numeric AS nilai_outstanding,
    COUNT(DISTINCT s.id)::int                      AS jml_sp
  FROM sp s
  JOIN public.sp_items si
    ON si.customer_id = s.customer_id
   AND si.sp_no       = s.sp_no
  WHERE si.product_id IS NOT NULL
  GROUP BY si.product_id
)
SELECT
  g.product_id,
  -- products.code (varchar) — tabel products TIDAK punya kolom `sku`.
  -- sp_items.sku hanya salinan teks, bukan kolom yang sama, jadi join produk
  -- WAJIB lewat product_id.
  p.code::text AS code,
  p.name::text AS product_name,
  -- Referensi SELALU diqualify (p.unit / p.uom) supaya tak bertabrakan dengan
  -- kolom keluaran bernama `uom` di RETURNS TABLE.
  COALESCE(NULLIF(btrim(p.unit), ''), NULLIF(btrim(p.uom), ''))::text AS uom,
  g.qty_outstanding,
  g.nilai_outstanding,
  COALESCE((SELECT ROUND(SUM(ss.available))::int
              FROM public.stock_summary ss, scope
             WHERE ss.product_id = g.product_id
               AND ss.company_id = scope.cid), 0) AS stok_tersedia,
  g.jml_sp
FROM agg g
LEFT JOIN public.products p ON p.id = g.product_id
ORDER BY g.nilai_outstanding DESC, p.name
LIMIT GREATEST(COALESCE(p_limit, 10), 1);
$$;

COMMENT ON FUNCTION public.get_storbit_top_outstanding_products(uuid, int) IS
'Produk dengan nilai outstanding terbesar.
nilai_outstanding DPP — BELUM TERMASUK PPN.
uom = COALESCE(NULLIF(btrim(products.unit),''''), NULLIF(btrim(products.uom),'''')).
SENGAJA tidak memfilter sisa > 0: dengan p_limit tinggi fungsi ini sekaligus
menjadi daftar SELURUH produk yang pernah muncul di SP, dan FE memakainya
sebagai sumber tunggal isi combobox produk.';

REVOKE ALL ON FUNCTION public.get_storbit_top_outstanding_products(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_top_outstanding_products(uuid, int) TO authenticated;


-- ─── 2c. get_storbit_outstanding_summary — +kunci total_sp ───────────────────
-- Signature TIDAK berubah -> CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.get_storbit_outstanding_summary(
  p_company_id     uuid DEFAULT NULL,
  p_customer_id    uuid DEFAULT NULL,
  p_price_category text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path = public
    AS $$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
-- LINGKUP BARIS BERSAMA — identik di 1a/1b/1c/1d.
sp AS (
  SELECT o.id, o.customer_id, o.sp_no
  FROM public.sp_orders o, scope
  WHERE o.deleted_at IS NULL
    AND o.company_id = scope.cid
    AND o.status NOT IN ('CANCELLED','DRAFT')
    AND (p_customer_id    IS NULL OR o.customer_id    = p_customer_id)
    AND (p_price_category IS NULL OR o.price_category = p_price_category)
),
it AS (
  SELECT s.id AS sp_id,
         si.qty, si.shipped_qty, si.unit_price, si.shipping_price
  FROM sp s
  JOIN public.sp_items si
    ON si.customer_id = s.customer_id
   AND si.sp_no       = s.sp_no
),
-- ── TOTAL SP (baru 5 Sep 2026) ──────────────────────────────────────────────
-- Nilai kontrak SELURUH SP dalam lingkup, bukan hanya yang masih outstanding.
-- BRUTO: x1.11 mencerminkan create_invoice (lihat blok PPN di kepala file).
-- Basisnya `qty`, bukan `shipped_qty` — ini nilai PESANAN, bukan nilai yang
-- layak difaktur.
sp_total AS (
  SELECT it.sp_id,
         COALESCE(SUM((it.qty * it.unit_price) + it.shipping_price), 0) * 1.11 AS nilai
  FROM it
  GROUP BY it.sp_id
),
total_sp AS (
  SELECT COUNT(*)::int                                AS jml_sp,
         COALESCE(ROUND(SUM(t.nilai), 2), 0)::numeric AS nilai
  FROM sp_total t
),
-- ── KIRIM ───────────────────────────────────────────────────────────────────
-- Hanya baris yang benar-benar masih punya sisa. GREATEST + filter dipakai
-- BERSAMA (bukan salah satu): filter membuang baris nol/negatif dari hitungan
-- jml_sp, GREATEST menjaga agar seandainya ada baris over-ship yang lolos ia
-- tak mengurangi total. Keduanya bikin 1c setara dengan 1a.
kirim AS (
  SELECT COUNT(DISTINCT it.sp_id)::int AS jml_sp,
         COALESCE(SUM(GREATEST(it.qty - it.shipped_qty, 0) * it.unit_price), 0)::numeric AS nilai
  FROM it
  WHERE it.qty > it.shipped_qty
),
-- ── TAGIH ───────────────────────────────────────────────────────────────────
-- SP yang sudah punya BTB aktif tapi belum punya invoice hidup.
--
-- ⚠️ Syarat invoice SENGAJA hanya `status <> 'void'`, TANPA `deleted_at IS
--    NULL`. Ini cermin PERSIS guard di create_invoice:
--
--        IF EXISTS (SELECT 1 FROM sp_invoices
--                    WHERE sp_order_id = p_sp_order_id AND status <> 'void')
--        THEN RAISE EXCEPTION 'SP ini sudah punya invoice aktif.';
--
--    Kalau di sini ditambahkan `deleted_at IS NULL`, kartu akan menghitung SP
--    yang punya invoice ter-soft-delete sebagai "siap ditagih" — padahal
--    create_invoice tetap MENOLAKNYA. Kartu tidak boleh menjanjikan angka yang
--    sistemnya sendiri akan tolak saat tombolnya ditekan.
--
--    Praktiknya invoice dibatalkan lewat status 'void'; kolom deleted_at ada
--    tapi belum pernah dipakai. JANGAN "diperbaiki" dengan menambah deleted_at
--    di sini tanpa mengubah create_invoice lebih dulu — keduanya harus
--    bergerak bersama.
tagih_sp AS (
  SELECT s.id
  FROM sp s
  WHERE EXISTS (SELECT 1 FROM public.sp_btb b
                 WHERE b.sp_order_id = s.id AND b.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.sp_invoices inv
                     WHERE inv.sp_order_id = s.id AND inv.status <> 'void')
),
tagih AS (
  SELECT COUNT(DISTINCT t.id)::int AS jml_sp,
         (COALESCE(SUM(it.shipped_qty * it.unit_price), 0)
        + COALESCE(SUM(it.shipping_price), 0))::numeric AS nilai
  FROM tagih_sp t
  JOIN it ON it.sp_id = t.id
),
-- ── PIUTANG ─────────────────────────────────────────────────────────────────
-- JOIN ke CTE `sp` dipertahankan demi disiplin lingkup bersama. Diukur di
-- produksi 5 Sep 2026, versi dengan dan tanpa JOIN itu memberi hasil IDENTIK
-- (5 invoice / Rp 47.293.798). Kalau suatu saat angkanya turun di bawah jumlah
-- invoice hidup, inilah sebab pertama yang perlu diperiksa.
piutang AS (
  SELECT COUNT(*)::int AS jml_invoice,
         COALESCE(SUM(inv.total_amount - COALESCE(pay.dibayar, 0)), 0)::numeric AS nilai
  FROM public.sp_invoices inv
  JOIN sp s ON s.id = inv.sp_order_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount + p.pph), 0) AS dibayar
    FROM public.sp_payments p
    WHERE p.invoice_id = inv.id
  ) pay ON true
  WHERE inv.deleted_at IS NULL
    AND inv.status <> 'void'
)
SELECT jsonb_build_object(
  'total_sp', jsonb_build_object('jml_sp',      (SELECT jml_sp      FROM total_sp),
                                 'nilai',       (SELECT nilai       FROM total_sp)),
  'kirim',    jsonb_build_object('jml_sp',      (SELECT jml_sp      FROM kirim),
                                 'nilai',       (SELECT nilai       FROM kirim)),
  'tagih',    jsonb_build_object('jml_sp',      (SELECT jml_sp      FROM tagih),
                                 'nilai',       (SELECT nilai       FROM tagih)),
  'piutang',  jsonb_build_object('jml_invoice', (SELECT jml_invoice FROM piutang),
                                 'nilai',       (SELECT nilai       FROM piutang)),
  'generated_at', now()
);
$$;

COMMENT ON FUNCTION public.get_storbit_outstanding_summary(uuid, uuid, text) IS
'Empat angka Storbit. DUA BRUTO, DUA DPP — jangan dijumlahkan lintas basis.

  BRUTO (sudah termasuk PPN):
    total_sp = nilai kontrak SELURUH SP dalam lingkup,
               Sigma per SP dari ((qty x unit_price) + shipping_price) x 1.11.
               Basis qty (pesanan), BUKAN shipped_qty. Faktor 1.11 sengaja
               mencerminkan rate 0.11 di create_invoice.
    piutang  = sisa tagihan invoice hidup,
               Sigma (total_amount - Sigma(amount + pph)).

  DPP (BELUM termasuk PPN):
    kirim = nilai barang belum dikirim,
            Sigma GREATEST(qty - shipped_qty,0) x unit_price.
    tagih = nilai SP ber-BTB aktif yang belum punya invoice hidup,
            Sigma (shipped_qty x unit_price) + Sigma shipping_price.
            Syarat invoice sengaja hanya status <> void (tanpa deleted_at)
            agar identik dengan guard create_invoice.

Sumber angka sp_items (bukan sp_order_items).';

REVOKE ALL ON FUNCTION public.get_storbit_outstanding_summary(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_outstanding_summary(uuid, uuid, text) TO authenticated;


-- =============================================================================
-- VERIFIKASI — jalankan TERPISAH setelah 2a-2c selesai.
-- =============================================================================
--
-- a) REGRESI — ketiga angka lama HARUS PERSIS SAMA seperti sebelum migrasi ini:
--        kirim   = 86 SP  / 1887625632
--        tagih   = 422 SP / 6273578117.31
--        piutang = 5 inv  / 47293798
--    Kalau salah satu bergeser, migrasi ini menyentuh sesuatu yang tak
--    seharusnya — JANGAN diteruskan ke FE sebelum sebabnya ketemu.
--    SELECT public.get_storbit_outstanding_summary(
--             'd2e5e565-5f67-4954-b8d9-5979a2a0c697');
--
-- b) Kunci keempat ada dan bruto (total_sp.nilai harus > kirim.nilai):
--    SELECT (public.get_storbit_outstanding_summary(
--              'd2e5e565-5f67-4954-b8d9-5979a2a0c697')->'total_sp');
--
-- c) Satuan tembus ke 1a dan 1d, dan NOL produk kehilangan satuannya:
--    SELECT public.get_storbit_product_report(
--             '29122cc0-cb2b-49c5-a7c5-4ca73ef26b53',
--             'd2e5e565-5f67-4954-b8d9-5979a2a0c697')->'summary'->>'uom';
--    SELECT count(*) FILTER (WHERE uom IS NULL OR btrim(uom)='') AS tanpa_satuan
--      FROM public.get_storbit_top_outstanding_products(
--             'd2e5e565-5f67-4954-b8d9-5979a2a0c697', 1000);   -- harus 0
--
-- d) Jumlah produk di combobox tetap 38 (kolom baru tak menggeser baris):
--    SELECT count(*) FROM public.get_storbit_top_outstanding_products(
--             'd2e5e565-5f67-4954-b8d9-5979a2a0c697', 1000);   -- => 38
--
-- e) NOL baris untuk anon — WAJIB dicek ulang karena 2b memakai DROP+CREATE
--    (DROP menghapus GRANT lama, dan Supabase meng-GRANT fungsi baru ke anon
--    secara otomatis):
--    SELECT p.proname, r.rolname
--      FROM pg_proc p
--      CROSS JOIN LATERAL aclexplode(p.proacl) a
--      JOIN pg_roles r ON r.oid = a.grantee
--     WHERE p.proname LIKE 'get_storbit_%' AND r.rolname = 'anon';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Jalankan ulang seluruh isi 20260905000001_storbit_laporan_barang_rpc.sql —
-- ia DROP+CREATE keempat fungsi ke bentuk sebelum migrasi ini dan memasang
-- kembali seluruh ACL-nya.
