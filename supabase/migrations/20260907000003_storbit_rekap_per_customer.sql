-- =============================================================================
-- Migration: 20260907000003_storbit_rekap_per_customer
-- Phase:     Dashboard Storbit — rekap SP per customer (permintaan CEO).
-- Depends:   20260818000002 (get_storbit_sp_drilldown — CASE kategorinya
--            dicermin persis di sini), 20260907000002 (get_storbit_dashboard_stats
--            — rumus nilai disalin dari CTE manifest_value-nya).
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- SIFAT: 1 CREATE OR REPLACE fungsi BARU. Nol DDL tabel, nol perubahan RLS,
--   nol sentuhan ke RPC mana pun yang sudah ada. MURNI BACA.
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   "Total SP dan nilai outstanding per customer, beserta daftar nomor SP-nya
--   dan barang apa saja di tiap SP." Tak satu pun RPC bisa menjawab itu:
--     · get_storbit_sp_drilldown   — punya customer per baris, NOL nilai, NOL produk
--     · get_storbit_product_report — punya rincian per customer, tapi SATU produk saja
--     · get_storbit_dashboard_stats— agregat total, tidak dipecah per customer
--
-- ── SATU BARIS PER SP ──────────────────────────────────────────────────────
--   sp_items di-join lewat (customer_id, sp_no) lalu di-GROUP BY per SP. Itu
--   yang menjamin SP ber-banyak-item tetap SATU baris: nilainya SUM() atas
--   item, nama produknya string_agg(DISTINCT ...). Nol dedup di client.
--
--   `DISTINCT` pada string_agg menuntut ORDER BY atas ekspresi yang SAMA
--   PERSIS, jadi keduanya memakai NULLIF(btrim(product_name),'') — sekaligus
--   membuang nama berspasi-kosong (jebakan yang sudah tercatat di sesi laporan
--   barang: ada produk ber-kolom teks string kosong).
--
-- ── NILAI: DPP, TANPA PPN, TANPA shipping_price ────────────────────────────
--   Rumus DISALIN dari get_storbit_dashboard_stats (migrasi 20260907000002,
--   CTE `manifest_value` baris 221-248) — bukan disusun ulang:
--     PRA-KIRIM  = GREATEST(qty - shipped_qty, 0) * unit_price
--       · pending_open        (baris 224-226)
--       · expired             (baris 227-229)
--       · mendekati_expired   (baris 230-234)
--     PASCA-KIRIM = shipped_qty * unit_price
--       · shipped             (baris 236-238)
--       · delivered_belum_btb (baris 239-241)
--       · btb_terbit          (baris 242-243)
--       · finance             (baris 244-246)
--
-- ── TIGA KATEGORI SENGAJA TANPA NILAI (NULL, BUKAN NOL) ────────────────────
--   INI SATU POLA, BUKAN TIGA KELALAIAN TERPISAH. `manifest_value` hanya
--   mendefinisikan TUJUH nilai, sedangkan get_storbit_sp_drilldown menerima
--   SEPULUH kategori. Ketiga sisanya tak punya rumus untuk disalin, dan
--   mengarangnya di sini = menetapkan definisi yang tak pernah diuji:
--
--     · terkirim_penuh        basisnya belum pernah ditetapkan siapa pun.
--     · pernah_risiko_pinalti MEMBENTANG lintas status pra- DAN pasca-kirim
--       (late_dispatch AND status <> 'CANCELLED'), jadi "basisnya apa" adalah
--       pertanyaan BISNIS, bukan pilihan teknis.
--     · cancelled             mengikuti keputusan 7 Sep 2026 di migrasi
--       20260907000002: kategori ini nol SP, jadi rumus apa pun tak punya data
--       untuk diuji; lagi pula "nilai SP batal" gampang terbaca sebagai
--       KERUGIAN, padahal barang yang belum dikirim masih di gudang.
--
--   Barisnya TETAP dikembalikan lengkap (SP, DC, tanggal, produk) — yang NULL
--   hanya kolom nilainya. Menghilangkan barisnya berarti membuang informasi
--   yang benar cuma karena satu kolom belum berdefinisi.
--
--   ⚠️ JANGAN mengoersi NULL ini jadi 0 di mana pun — di baris TOTAL sheet
--   Excel, di PDF, maupun di layar. "Belum didefinisikan" dan "tidak ada
--   nilainya" dua hal berbeda, dan SUM()/reduce() dua-duanya diam-diam
--   memperlakukan NULL sebagai nol kalau tidak dijaga.
--
-- ── URUTAN PARAMETER ───────────────────────────────────────────────────────
--   Sengaja BERBARIS PERSIS dengan get_storbit_sp_drilldown
--   (p_category, p_customer_id, p_price_category, p_company_id, p_limit).
--   Urutan yang "mirip tapi tidak sama" antar dua fungsi bersaudara adalah
--   jebakan; pemanggilan dari db.js bernama, jadi ini murni soal keterbacaan.
--
-- ── SIGNATURE & ACL ────────────────────────────────────────────────────────
--   LANGUAGE sql STABLE, SECURITY INVOKER (default — JANGAN dijadikan DEFINER),
--   SET search_path = public. ACL mengikuti pola SELURUH RPC Storbit lain:
--   REVOKE ALL FROM PUBLIC + GRANT ALL TO authenticated. (Untuk fungsi, ALL dan
--   EXECUTE memberi hak identik; yang dipilih di sini adalah yang seragam
--   dengan tetangganya, supaya penyisiran ACL nanti tak melewatkannya.)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- LANGKAH 1 — FUNGSI BARU
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_storbit_rekap_per_customer(
  p_category       text,
  p_customer_id    uuid    DEFAULT NULL::uuid,
  p_price_category text    DEFAULT NULL::text,
  p_company_id     uuid    DEFAULT NULL::uuid,
  p_limit          integer DEFAULT 500
) RETURNS TABLE(
  customer_id       uuid,
  customer_name     text,
  sp_no             text,
  dc_nama           text,
  sp_date           date,
  expired_date      date,
  status            text,
  nilai_outstanding numeric,
  produk            text
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
-- CTE `sp` & `sp_flag` disalin dari get_storbit_sp_drilldown supaya himpunan SP
-- yang dipilih di sini MUSTAHIL melenceng dari tabel drilldown di layar.
sp AS (
  SELECT
    o.id, o.status, o.customer_id, o.sp_no, o.sp_date, o.dc_id,
    -- MIN(sp_items.expired_date), BUKAN sp_orders.expired_date: kolom header
    -- itu bisa divergen (TD-201), dan seluruh RPC halaman ini memakai MIN.
    (SELECT MIN(si.expired_date)
       FROM public.sp_items si
      WHERE si.customer_id = o.customer_id
        AND si.sp_no       = o.sp_no
        AND si.expired_date IS NOT NULL) AS expired_date,
    EXISTS (SELECT 1 FROM public.sp_btb b
             WHERE b.sp_order_id = o.id AND b.deleted_at IS NULL) AS has_btb
  FROM public.sp_orders o, scope
  WHERE o.deleted_at IS NULL
    AND o.company_id = scope.cid
    AND (p_customer_id    IS NULL OR o.customer_id    = p_customer_id)
    AND (p_price_category IS NULL OR o.price_category = p_price_category)
),
sp_flag AS (
  SELECT s.*,
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
       WHERE dn.customer_id = s.customer_id
         AND dn.sp_no       = s.sp_no
         AND dn.status <> 'cancelled'
         AND dn.dispatched_at IS NOT NULL
         AND s.expired_date IS NOT NULL
         AND (dn.dispatched_at AT TIME ZONE 'Asia/Jakarta')::date > s.expired_date
    ) AS late_dispatch
  FROM sp s
),
pilih AS (
  SELECT f.*
  FROM sp_flag f
  -- CERMIN PERSIS CASE di get_storbit_sp_drilldown. Kalau CASE di sana berubah,
  -- ubah di sini juga — kalau tidak, rekap dan tabel drilldown akan memuat
  -- himpunan SP yang berbeda untuk kategori yang sama.
  WHERE CASE p_category
    WHEN 'pending_open'          THEN f.status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
    WHEN 'shipped'               THEN f.status IN ('DIKIRIM','SAMPAI','MENUNGGU_KONFIRMASI_DC')
    WHEN 'delivered_belum_btb'   THEN f.status IN ('SAMPAI','TERKIRIM_PENUH') AND NOT f.has_btb
    WHEN 'btb_terbit'            THEN f.status = 'BTB_TERBIT'
    WHEN 'terkirim_penuh'        THEN f.status = 'TERKIRIM_PENUH'
    WHEN 'expired'               THEN f.status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                                      AND f.expired_date < CURRENT_DATE
    WHEN 'mendekati_expired'     THEN f.status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                                      AND f.expired_date >= CURRENT_DATE
                                      AND date_trunc('month', f.expired_date) = date_trunc('month', CURRENT_DATE)
    WHEN 'pernah_risiko_pinalti' THEN f.late_dispatch AND f.status <> 'CANCELLED'
    WHEN 'finance'               THEN f.status IN ('INVOICED','SUBMITTED','LUNAS')
    WHEN 'cancelled'             THEN f.status = 'CANCELLED'
    -- Kategori tak dikenal -> NOL BARIS TANPA ERROR. Sifat ini SENGAJA
    -- dipertahankan, sama seperti get_storbit_sp_drilldown; jangan diubah jadi
    -- melempar exception.
    ELSE false
  END
),
agg AS (
  -- GROUP BY per SP = penjamin "satu SP satu baris" walau item-nya banyak.
  SELECT
    p.customer_id, p.sp_no, p.dc_id, p.sp_date, p.expired_date, p.status,
    CASE
      WHEN p_category IN ('pending_open','expired','mendekati_expired')
        THEN SUM(GREATEST(si.qty - si.shipped_qty, 0) * si.unit_price)
      WHEN p_category IN ('shipped','delivered_belum_btb','btb_terbit','finance')
        THEN SUM(si.shipped_qty * si.unit_price)
      -- terkirim_penuh / pernah_risiko_pinalti / cancelled: NULL disengaja,
      -- alasannya di kepala file. JANGAN diganti 0.
      ELSE NULL
    END AS nilai_outstanding,
    string_agg(DISTINCT NULLIF(btrim(si.product_name), ''), ', '
               ORDER BY NULLIF(btrim(si.product_name), '')) AS produk
  FROM pilih p
  JOIN public.sp_items si
    ON si.customer_id = p.customer_id
   AND si.sp_no       = p.sp_no
  GROUP BY p.customer_id, p.sp_no, p.dc_id, p.sp_date, p.expired_date, p.status
)
SELECT
  g.customer_id,
  a.name    AS customer_name,
  g.sp_no,
  dm.nama   AS dc_nama,
  g.sp_date,
  g.expired_date,
  g.status,
  g.nilai_outstanding,
  g.produk
FROM agg g
LEFT JOIN public.accounts  a  ON a.id  = g.customer_id
LEFT JOIN public.dc_master dm ON dm.id = g.dc_id
ORDER BY a.name, g.nilai_outstanding DESC NULLS LAST, g.sp_no
LIMIT GREATEST(COALESCE(p_limit, 500), 1);
$$;

COMMENT ON FUNCTION public.get_storbit_rekap_per_customer(text, uuid, text, uuid, integer) IS
  'Rekap SP per customer untuk SATU kategori status. Satu baris per SP (sp_items '
  'di-GROUP BY per SP; produk digabung string_agg DISTINCT). nilai_outstanding = '
  'DPP, BELUM termasuk PPN, TANPA shipping_price — rumus pra/pasca-kirim disalin '
  'dari get_storbit_dashboard_stats. NULL untuk terkirim_penuh, '
  'pernah_risiko_pinalti, dan cancelled: basisnya sengaja belum ditetapkan, '
  'jangan dikoersi jadi 0. Kategori tak dikenal mengembalikan nol baris.';

-- ACL — pola SELURUH RPC Storbit lain, apa adanya.
REVOKE ALL ON FUNCTION public.get_storbit_rekap_per_customer(text, uuid, text, uuid, integer) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.get_storbit_rekap_per_customer(text, uuid, text, uuid, integer) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- LANGKAH 2 — VERIFIKASI. Jalankan SETELAH langkah 1.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. ANGKA UTAMA: total rekap `pending_open` HARUS sama persis dengan
--     pending_open_value di get_storbit_dashboard_stats.
--     Acuan manual 7 Sep 2026 (SOA): 44 SP · Rp 1.205.069.395.
WITH rekap AS (
  SELECT COUNT(*)::int AS jml_sp, SUM(nilai_outstanding) AS nilai
  FROM public.get_storbit_rekap_per_customer(
    'pending_open', NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid, 100000)
),
kartu AS (
  SELECT (public.get_storbit_dashboard_stats(
            NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid)
          -> 'manifest' ->> 'pending_open_value')::numeric AS nilai,
         (public.get_storbit_dashboard_stats(
            NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid)
          -> 'manifest' ->> 'pending_open')::int AS jml_sp
)
SELECT
  r.jml_sp AS rekap_sp,   k.jml_sp AS kartu_sp,
  r.nilai  AS rekap_nilai, k.nilai AS kartu_nilai,
  CASE WHEN r.nilai IS NOT DISTINCT FROM k.nilai
        AND r.jml_sp = k.jml_sp THEN 'COCOK' ELSE 'MELESET ***' END AS hasil
FROM rekap r, kartu k;

-- 2b. PECAHAN PER CUSTOMER — bandingkan dengan acuan manual:
--     PT. Indomarco Prismatama : 40 SP · Rp 1.129.019.395
--     CK - Central Kitchen     :  4 SP · Rp    76.050.000
SELECT customer_name, COUNT(*)::int AS jml_sp, SUM(nilai_outstanding) AS nilai
FROM public.get_storbit_rekap_per_customer(
  'pending_open', NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid, 100000)
GROUP BY customer_name
ORDER BY nilai DESC NULLS LAST;

-- 2c. SATU SP SATU BARIS — harus mengembalikan NOL baris.
SELECT sp_no, COUNT(*) AS baris
FROM public.get_storbit_rekap_per_customer(
  'pending_open', NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid, 100000)
GROUP BY sp_no HAVING COUNT(*) > 1;

-- 2d. TIGA KATEGORI TANPA NILAI — `nilai` HARUS NULL, bukan 0.
--     Kalau ada yang mengembalikan 0, berarti NULL-nya terkoersi di suatu tempat.
SELECT k.kategori,
       COUNT(r.sp_no)::int    AS jml_sp,
       SUM(r.nilai_outstanding) AS nilai,
       CASE WHEN SUM(r.nilai_outstanding) IS NULL THEN 'NULL (benar)'
            ELSE 'BUKAN NULL ***' END AS hasil
FROM (VALUES ('terkirim_penuh'), ('pernah_risiko_pinalti'), ('cancelled')) AS k(kategori)
LEFT JOIN LATERAL public.get_storbit_rekap_per_customer(
  k.kategori, NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid, 100000) r ON true
GROUP BY k.kategori
ORDER BY k.kategori;

-- 2e. KATEGORI TAK DIKENAL — harus NOL BARIS, bukan error.
SELECT COUNT(*)::int AS harus_nol
FROM public.get_storbit_rekap_per_customer(
  'kategori_ngawur', NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid, 100);
