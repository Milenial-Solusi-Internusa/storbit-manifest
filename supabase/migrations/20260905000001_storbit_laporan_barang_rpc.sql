-- =============================================================================
-- Migration: 20260905000001_storbit_laporan_barang_rpc
-- Phase:     Laporan Per Barang (Dashboard Storbit) — 4 RPC baca-saja + 1 index.
-- Depends:   sp_orders, sp_items, sp_btb, sp_invoices, sp_payments,
--            products, stock_summary, accounts, dc_master
-- Status:    LIVE — dieksekusi di produksi 5 Sep 2026.
--
-- SIFAT: 100% BACA. Nol DDL pada tabel, nol perubahan RLS, nol backfill,
--   nol sentuhan ke get_storbit_dashboard_stats / get_storbit_sp_drilldown /
--   get_storbit_stock_drilldown. Satu-satunya objek non-fungsi yang dibuat
--   adalah index di sp_items(product_id).
--
-- SUMBER ANGKA: sp_items (BUKAN sp_order_items) — keputusan Den 5 Sep 2026.
--
--   ⚠️ KONSEKUENSI YANG DITERIMA SADAR: update_sp_item_dual menulis unit_price
--   dan shipped_qty ke sp_items TAPI TIDAK meneruskan keduanya ke
--   sp_order_items, sementara create_invoice justru membaca sp_order_items.
--   Untuk SP yang harganya pernah diedit lewat Edit Item, "Outstanding Tagih"
--   di sini bisa berbeda dari nilai invoice yang benar-benar terbit.
--
--   Diukur di produksi 5 Sep 2026 — divergensi HARI INI = 0 baris:
--     SELECT count(*) FROM sp_items si
--       JOIN sp_orders o ON o.customer_id=si.customer_id AND o.sp_no=si.sp_no
--                       AND o.deleted_at IS NULL
--       JOIN sp_order_items soi ON soi.sp_order_id=o.id
--                              AND soi.product_id=si.product_id
--      WHERE si.unit_price  IS DISTINCT FROM soi.unit_price
--         OR si.shipped_qty IS DISTINCT FROM soi.shipped_qty;   -- => 0
--   Jadi risikonya masih TEORETIS, bukan aktual. JANGAN "diperbaiki" di sini —
--   menyinkronkan dua tabel itu adalah pekerjaan tersendiri di luar scope.
--
-- LINGKUP BARIS — SAMA PERSIS di keempat fungsi (pelajaran TD-168):
--     sp_orders.deleted_at IS NULL AND status NOT IN ('CANCELLED','DRAFT')
--   Ditulis sebagai CTE bernama `sp` yang teksnya identik di keempatnya. Kalau
--   lingkupnya berubah, ubah DI EMPAT TEMPAT sekaligus — jangan sebagian.
--
--   SENGAJA TIDAK ada filter sp_items.sp_status='confirmed', walau
--   sp_recompute_status memakainya. Lingkup di atas adalah lingkup yang dipakai
--   saat memverifikasi angka acuan; menambah filter membuat laporan tak bisa
--   diadu dengannya.
--
-- OVER-SHIP — GREATEST(qty - shipped_qty, 0) DIPAKAI DI KEEMPAT FUNGSI.
--   Alasannya konsistensi, bukan kosmetik: 1c memfilter WHERE qty > shipped_qty
--   (supaya baris over-ship tak diam-diam mengurangi total), sementara 1a/1b/1d
--   tidak memfilter karena harus tetap menampilkan produk/SP yang sudah lunas
--   kirim. Tanpa GREATEST, satu baris shipped_qty > qty akan membuat angka 1a
--   lebih kecil dari 1c untuk data yang sama — beda tanpa sebab yang kelihatan
--   di layar. Dengan GREATEST di keempatnya, 1c = 1a + baris nol, jadi setara.
--
--   Diukur di produksi 5 Sep 2026: SELECT count(*) FROM sp_items
--     WHERE shipped_qty > qty;  -- => 0. Jadi ini murni jaga-jaga hari ini.
--
-- ANGKA ACUAN (diverifikasi di produksi 5 Sep 2026, SEBELUM migrasi ini ditulis
-- — formula di bawah sudah terbukti menghasilkannya):
--     kirim   = 86 SP  / Rp 1.887.625.632
--     piutang = 5 inv  / Rp 47.293.798
--     tagih   = 422 SP / Rp 6.273.578.117,31   (belum punya acuan sebelumnya)
--     produk unik di SP = 38
--
-- ROLLBACK: lihat blok di kaki file.
-- =============================================================================


-- ─── 0. INDEX ────────────────────────────────────────────────────────────────
-- sp_items hari ini hanya punya index di customer_id, sp_date, sp_no. Keempat
-- fungsi di bawah memfilter atau mengelompokkan product_id.
CREATE INDEX IF NOT EXISTS idx_sp_items_product_id
  ON public.sp_items USING btree (product_id);


-- ─── 1a. get_storbit_product_report ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_storbit_product_report(uuid, uuid, date, date);

CREATE FUNCTION public.get_storbit_product_report(
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
-- Stok WAJIB dijumlah lintas gudang: stock_summary bergranularitas
-- (product_id, warehouse_id, company_id). Pola sama dengan sp_recompute_status
-- dan get_storbit_stock_drilldown.
--
-- CATATAN: stok adalah angka SAAT INI — p_date_from/p_date_to TIDAK berlaku
-- untuknya. Membandingkan outstanding periode lama dengan stok hari ini memang
-- disengaja: itu justru pertanyaan yang mau dijawab ("cukup tidak stoknya
-- sekarang untuk menutup sisa kirim").
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
    'jml_customer',      (SELECT jml_customer      FROM sum_all)
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
SELURUH NILAI RUPIAH ADALAH DPP — BELUM TERMASUK PPN.
Sumber angka sp_items (bukan sp_order_items).
stok_tersedia = SUM(stock_summary.available) lintas gudang; angka SAAT INI,
tidak terpengaruh p_date_from/p_date_to.
per_customer tidak memfilter outstanding > 0 (customer lunas-kirim tetap muncul
dengan nilai 0).';


-- ─── 1b. get_storbit_product_sp_list ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_storbit_product_sp_list(uuid, uuid, date, date, int);

CREATE FUNCTION public.get_storbit_product_sp_list(
  p_product_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL,
  p_limit      int  DEFAULT 200
) RETURNS TABLE(
  sp_no         text,
  customer_id   uuid,
  customer_name text,
  dc_nama       text,
  sp_date       date,
  expired_date  date,
  status        text,
  qty           int,
  shipped_qty   int,
  sisa          int,
  nilai_sisa    numeric,
  umur_hari     int
)
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path = public
    AS $$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
-- LINGKUP BARIS BERSAMA — identik di 1a/1b/1c/1d.
sp AS (
  SELECT o.id, o.customer_id, o.sp_no, o.sp_date, o.dc_id, o.status
  FROM public.sp_orders o, scope
  WHERE o.deleted_at IS NULL
    AND o.company_id = scope.cid
    AND o.status NOT IN ('CANCELLED','DRAFT')
    AND (p_date_from IS NULL OR o.sp_date >= p_date_from)
    AND (p_date_to   IS NULL OR o.sp_date <= p_date_to)
),
-- Satu SP bisa memuat lebih dari satu baris produk yang sama -> diagregasi per
-- SP supaya tabelnya satu baris per SP.
agg AS (
  SELECT
    s.id, s.customer_id, s.sp_no, s.sp_date, s.dc_id, s.status,
    SUM(si.qty)::int                            AS qty,
    SUM(si.shipped_qty)::int                    AS shipped_qty,
    SUM(GREATEST(si.qty - si.shipped_qty, 0))::int AS sisa,
    SUM(GREATEST(si.qty - si.shipped_qty, 0) * si.unit_price)::numeric AS nilai_sisa
  FROM sp s
  JOIN public.sp_items si
    ON si.customer_id = s.customer_id
   AND si.sp_no       = s.sp_no
  WHERE si.product_id = p_product_id
  GROUP BY s.id, s.customer_id, s.sp_no, s.sp_date, s.dc_id, s.status
)
SELECT
  g.sp_no,
  -- customer_id ikut dikembalikan KHUSUS untuk navigasi ke Detail SP: jalur
  -- yang sudah ada memakai komposit {spNo, customerId} (App.jsx:3436-3439),
  -- BUKAN sp_orders.id. Jangan dicabut walau tak ditampilkan sebagai kolom.
  g.customer_id,
  COALESCE(a.name, '(Tanpa nama)') AS customer_name,
  dm.nama                          AS dc_nama,
  g.sp_date,
  -- Tenggat = MIN(sp_items.expired_date) SELURUH item SP itu (bukan hanya item
  -- produk yang sedang dilihat, dan BUKAN sp_orders.expired_date) — cermin
  -- get_storbit_dashboard_stats / get_storbit_sp_drilldown. sp_items adalah
  -- sumber kebenaran tenggat; sp_orders.expired_date bisa divergen (TD-201).
  (SELECT MIN(si2.expired_date)
     FROM public.sp_items si2
    WHERE si2.customer_id = g.customer_id
      AND si2.sp_no       = g.sp_no
      AND si2.expired_date IS NOT NULL) AS expired_date,
  g.status,
  g.qty,
  g.shipped_qty,
  g.sisa,
  g.nilai_sisa,
  (CURRENT_DATE - g.sp_date)::int AS umur_hari
FROM agg g
LEFT JOIN public.accounts  a  ON a.id  = g.customer_id
LEFT JOIN public.dc_master dm ON dm.id = g.dc_id
ORDER BY g.nilai_sisa DESC, g.sp_date DESC NULLS LAST, g.sp_no
LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$$;

COMMENT ON FUNCTION public.get_storbit_product_sp_list(uuid, uuid, date, date, int) IS
'Daftar SP yang memuat satu produk, satu baris per SP.
nilai_sisa DPP — BELUM TERMASUK PPN.
expired_date = MIN(sp_items.expired_date) SELURUH item SP tsb, bukan
sp_orders.expired_date.
customer_id dikembalikan untuk navigasi komposit {sp_no, customer_id} ke
Detail SP; jangan dicabut walau tak dipakai sebagai kolom tampilan.';


-- ─── 1c. get_storbit_outstanding_summary ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_storbit_outstanding_summary(uuid, uuid, text);

CREATE FUNCTION public.get_storbit_outstanding_summary(
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
-- ── KIRIM ───────────────────────────────────────────────────────────────────
-- Hanya baris yang benar-benar masih punya sisa. GREATEST + filter dipakai
-- BERSAMA (bukan salah satu): filter membuang baris nol/negatif dari hitungan
-- jml_sp, GREATEST menjaga agar seandainya ada baris over-ship yang lolos ia
-- tak mengurangi total. Keduanya bikin 1c setara dengan 1a — lihat blok
-- OVER-SHIP di kepala file.
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
--    tapi belum pernah dipakai (6 invoice, 1 void, 0 soft-delete per 5 Sep
--    2026). JANGAN "diperbaiki" dengan menambah deleted_at di sini tanpa
--    mengubah create_invoice lebih dulu — keduanya harus bergerak bersama.
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
-- Satu-satunya angka BRUTO di fungsi ini: total_amount sudah termasuk PPN.
--
-- JOIN ke CTE `sp` dipertahankan demi disiplin lingkup bersama. Diukur di
-- produksi 5 Sep 2026, versi dengan dan tanpa JOIN itu memberi hasil IDENTIK
-- (5 invoice / Rp 47.293.798): keenam invoice yang ada bergantung ke SP hidup
-- dan tak satu pun induknya CANCELLED/DRAFT. Kalau suatu saat angkanya turun
-- di bawah jumlah invoice hidup, inilah sebab pertama yang perlu diperiksa.
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
  'kirim',   jsonb_build_object('jml_sp',      (SELECT jml_sp      FROM kirim),
                                'nilai',       (SELECT nilai       FROM kirim)),
  'tagih',   jsonb_build_object('jml_sp',      (SELECT jml_sp      FROM tagih),
                                'nilai',       (SELECT nilai       FROM tagih)),
  'piutang', jsonb_build_object('jml_invoice', (SELECT jml_invoice FROM piutang),
                                'nilai',       (SELECT nilai       FROM piutang)),
  'generated_at', now()
);
$$;

COMMENT ON FUNCTION public.get_storbit_outstanding_summary(uuid, uuid, text) IS
'Tiga angka outstanding Storbit.
  kirim   = nilai barang belum dikirim, Sigma GREATEST(qty - shipped_qty,0) x
            unit_price. DPP — BELUM TERMASUK PPN.
  tagih   = nilai SP ber-BTB aktif yang belum punya invoice hidup,
            Sigma (shipped_qty x unit_price) + Sigma shipping_price.
            DPP — BELUM TERMASUK PPN. Syarat invoice sengaja hanya
            status <> void (tanpa deleted_at) agar identik dengan guard
            create_invoice.
  piutang = sisa tagihan invoice hidup,
            Sigma (total_amount - Sigma(amount + pph)).
            BRUTO — total_amount SUDAH TERMASUK PPN.
JANGAN menjumlahkan piutang dengan dua angka di atas: beda basis pajak.
Sumber angka sp_items (bukan sp_order_items).';


-- ─── 1d. get_storbit_top_outstanding_products ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_storbit_top_outstanding_products(uuid, int);

CREATE FUNCTION public.get_storbit_top_outstanding_products(
  p_company_id uuid DEFAULT NULL,
  p_limit      int  DEFAULT 10
) RETURNS TABLE(
  product_id        uuid,
  code              text,
  product_name      text,
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
SENGAJA tidak memfilter sisa > 0: dengan p_limit tinggi fungsi ini sekaligus
menjadi daftar SELURUH produk yang pernah muncul di SP, dan FE memakainya
sebagai sumber tunggal isi combobox produk.';


-- ─── 2. Hak akses — pola FASE 5 ──────────────────────────────────────────────
-- Default privileges Supabase meng-GRANT fungsi baru ke anon SECARA OTOMATIS,
-- jadi REVOKE di bawah bukan formalitas. WAJIB ikut dijalankan ulang setiap
-- kali fungsi di atas di-DROP+CREATE — DROP menghapus GRANT, dan gejalanya
-- "permission denied for function" di browser, bukan hasil kosong.
REVOKE ALL ON FUNCTION public.get_storbit_product_report(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_product_report(uuid, uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_storbit_product_sp_list(uuid, uuid, date, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_product_sp_list(uuid, uuid, date, date, int) TO authenticated;

REVOKE ALL ON FUNCTION public.get_storbit_outstanding_summary(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_outstanding_summary(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_storbit_top_outstanding_products(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storbit_top_outstanding_products(uuid, int) TO authenticated;


-- =============================================================================
-- VERIFIKASI — jalankan TERPISAH setelah section 0-2 selesai.
-- =============================================================================
--
-- a) Angka acuan. HARUS: kirim = 86 SP / 1.887.625.632
--                        piutang = 5 invoice / 47.293.798
--                        tagih = 422 SP / 6.273.578.117,31
--    SELECT public.get_storbit_outstanding_summary(
--             'd2e5e565-5f67-4954-b8d9-5979a2a0c697');
--
-- b) NOL baris untuk anon (harus 0 baris — kalau ada, REVOKE gagal):
--    SELECT p.proname, r.rolname
--      FROM pg_proc p
--      CROSS JOIN LATERAL aclexplode(p.proacl) a
--      JOIN pg_roles r ON r.oid = a.grantee
--     WHERE p.proname LIKE 'get_storbit_%' AND r.rolname = 'anon';
--
-- c) Konsistensi 1a vs 1b — dua angka ini HARUS sama untuk produk yang sama:
--    SELECT public.get_storbit_product_report(
--             '<product_uuid>','d2e5e565-5f67-4954-b8d9-5979a2a0c697')
--             ->'summary'->>'nilai_outstanding';
--    SELECT SUM(nilai_sisa) FROM public.get_storbit_product_sp_list(
--             '<product_uuid>','d2e5e565-5f67-4954-b8d9-5979a2a0c697',
--             NULL,NULL,100000);
--
-- d) Combobox dapat 38 produk:
--    SELECT count(*) FROM public.get_storbit_top_outstanding_products(
--             'd2e5e565-5f67-4954-b8d9-5979a2a0c697', 1000);   -- => 38
--
-- e) Index kepakai (cari "Index Scan using idx_sp_items_product_id"):
--    EXPLAIN ANALYZE SELECT * FROM public.get_storbit_product_sp_list(
--      (SELECT product_id FROM public.sp_items WHERE product_id IS NOT NULL LIMIT 1),
--      'd2e5e565-5f67-4954-b8d9-5979a2a0c697');
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.get_storbit_product_report(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS public.get_storbit_product_sp_list(uuid, uuid, date, date, int);
-- DROP FUNCTION IF EXISTS public.get_storbit_outstanding_summary(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS public.get_storbit_top_outstanding_products(uuid, int);
-- DROP INDEX IF EXISTS public.idx_sp_items_product_id;
