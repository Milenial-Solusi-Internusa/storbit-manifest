-- =============================================================================
-- Migration: 20260907000002_storbit_nilai_per_status
-- Phase:     Dashboard Storbit — nilai rupiah pada kartu status Shipping Manifest.
-- Depends:   20260818000001 (get_storbit_dashboard_stats), 20260905000002
--            (get_storbit_outstanding_summary — sumber pola rumus di sini).
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- SIFAT: 1 CREATE OR REPLACE. Nol DDL tabel, nol perubahan RLS/policy, nol
--   kolom baru, nol backfill. MURNI BACA.
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   Keenam kartu status hanya menampilkan JUMLAH SP. "Pending 49" tak memberi
--   tahu apa pun soal prioritas — 49 SP kecil beda jauh dari 49 SP besar.
--   Yang sama berlaku untuk kedua kartu tenggat: "Lewat Tenggat Kirim: 3"
--   tidak menunjukkan seberapa gawat.
--
-- ── YANG DIUBAH ────────────────────────────────────────────────────────────
--   HANYA MENAMBAH kunci ber-sufiks `_value` ke objek `manifest`.
--   SELURUH CTE lama (scope/sp/sp_flag/manifest/stock/warehouse) disalin APA
--   ADANYA — nol perubahan filter, nol perubahan urutan, nol perubahan nama.
--   Ketiga belas kunci hitungan lama HARUS mengembalikan nilai identik; blok
--   verifikasi di bawah membuktikannya sebelum/sesudah.
--
--   Dua CTE baru (`it`, `manifest_value`) ditaruh SETELAH `manifest` supaya
--   diff terhadap versi lama terbaca sebagai sisipan, bukan penulisan ulang.
--
-- ── SUMBER ANGKA & BASIS PAJAK ─────────────────────────────────────────────
--   Sumber = `sp_items` di-join ke `sp_orders` lewat (customer_id, sp_no) —
--   pola PERSIS get_storbit_outstanding_summary, dan sejalan dengan keputusan
--   "sumber angka laporan = sp_items, bukan sp_order_items" (5 Sep 2026).
--
--   Seluruh nilai DPP, BELUM termasuk PPN, supaya sebanding dengan kartu
--   Outstanding Kirim yang memakai rumus yang sama persis.
--
--   ⚠️ `shipping_price` SENGAJA TIDAK diikutkan — cermin Outstanding KIRIM.
--      Konsekuensi yang disadari: `btb_terbit_value` TIDAK akan sama dengan
--      kartu Outstanding TAGIH, karena Tagih menambahkan SUM(shipping_price).
--      Itu selisih by design, bukan bug. Jangan "diselaraskan" tanpa memutuskan
--      lebih dulu basis mana yang jadi acuan halaman ini.
--
-- ── PEMBAGIAN PRA/PASCA-KIRIM (tujuh kunci) ────────────────────────────────
--   PRA-KIRIM  = GREATEST(qty - shipped_qty, 0) * unit_price
--     · pending_open       belum berangkat sama sekali
--     · expired            belum dikirim, tenggat lewat  -> nilai yang berisiko
--     · mendekati_expired  belum dikirim, tenggat bulan ini
--   PASCA-KIRIM = shipped_qty * unit_price
--     · shipped             nilai yang sedang di jalan
--     · delivered_belum_btb nilai sampai, BTB belum terbit
--     · btb_terbit          nilai siap difaktur
--     · finance             nilai yang sudah masuk tahap invoice
--
-- ── EMPAT KUNCI YANG SENGAJA TIDAK DIBERI `_value` ─────────────────────────
--   INI KEPUTUSAN SADAR (Den, 7 Sep 2026), BUKAN KELALAIAN.
--   JANGAN "melengkapinya" tanpa memikirkan ulang definisinya lebih dulu.
--
--   · cancelled — kategori ini HARI INI NOL SP. Rumus apa pun yang dipilih
--     sekarang tak punya satu baris pun untuk diuji, jadi kita akan menetapkan
--     definisi buta yang baru terlihat akibatnya berbulan-bulan kemudian.
--     Lagi pula "nilai SP batal" gampang terbaca sebagai KERUGIAN, padahal SP
--     batal yang belum dikirim sama sekali bukan kerugian — barangnya masih di
--     gudang. Kalau pembatalan mulai terjadi dan angkanya dibutuhkan,
--     definisinya diputuskan saat itu dengan data nyata di tangan.
--
--   · dispatch_eligible      penyebut rasio cakupan, bukan kategori status.
--   · dispatch_data_tersedia pembilang rasio cakupan, bukan kategori status.
--     Memberi rupiah pada penyebut/pembilang rasio tidak punya makna bisnis.
--
--   · total_sp — sudah punya kartu strip "Nilai Total SP" yang BRUTO (x1.11,
--     dari get_storbit_outstanding_summary). Menambah total_sp_value yang DPP
--     berarti dua angka BEDA BASIS dengan nama sama di halaman yang sama —
--     persis kelas salah-baca yang sedang ditutup sesi ini.
--
-- ── SIGNATURE & ACL ────────────────────────────────────────────────────────
--   Signature tidak berubah -> CREATE OR REPLACE, TANPA DROP.
--   Fungsi ini SECURITY INVOKER (tak pernah SECURITY DEFINER) — dipertahankan.
--   Blok ACL di bawah menyalin pola yang sudah dipakai fungsi ini apa adanya;
--   CREATE OR REPLACE sebetulnya mempertahankan ACL, blok itu idempoten dan
--   ditulis eksplisit supaya file ini bisa dijalankan ulang dengan aman.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- LANGKAH 1 — JALANKAN LEBIH DULU, SEBELUM CREATE OR REPLACE DI LANGKAH 2.
-- Merekam SELURUH kunci `manifest` versi lama untuk beberapa kombinasi
-- parameter (tanpa filter, per customer, per price_category) ke temp table.
-- Temp table hilang sendiri saat sesi ditutup.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _manifest_before AS
SELECT s.label, e.key, e.value
FROM (
  SELECT 'tanpa-filter'::text AS label, NULL::uuid AS cust, NULL::text AS pcat
  UNION ALL
  SELECT 'cust:' || c.customer_id, c.customer_id, NULL
  FROM (SELECT DISTINCT o.customer_id
          FROM public.sp_orders o
         WHERE o.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
           AND o.deleted_at IS NULL
           AND o.customer_id IS NOT NULL
         LIMIT 3) c
  UNION ALL
  SELECT 'pcat:' || p.price_category, NULL, p.price_category
  FROM (SELECT DISTINCT o.price_category
          FROM public.sp_orders o
         WHERE o.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
           AND o.deleted_at IS NULL
           AND o.price_category IS NOT NULL
         LIMIT 3) p
) s,
LATERAL jsonb_each(
  public.get_storbit_dashboard_stats(
    s.cust, s.pcat, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
  ) -> 'manifest'
) e;

-- Sanity: harus 13 kunci per skenario.
SELECT label, COUNT(*) AS jml_kunci FROM _manifest_before GROUP BY label ORDER BY label;


-- ─────────────────────────────────────────────────────────────────────────────
-- LANGKAH 2 — PERUBAHAN FUNGSI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_storbit_dashboard_stats(
  p_customer_id uuid DEFAULT NULL::uuid,
  p_price_category text DEFAULT NULL::text,
  p_company_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
sp AS (
  SELECT
    o.id,
    o.status,
    o.customer_id,
    o.sp_no,
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
  SELECT
    s.*,
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
       WHERE dn.customer_id = s.customer_id
         AND dn.sp_no       = s.sp_no
         AND dn.status <> 'cancelled'
         AND dn.dispatched_at IS NOT NULL
         AND s.expired_date IS NOT NULL
         AND (dn.dispatched_at AT TIME ZONE 'Asia/Jakarta')::date > s.expired_date
    ) AS late_dispatch,
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
       WHERE dn.customer_id = s.customer_id
         AND dn.sp_no       = s.sp_no
         AND dn.status <> 'cancelled'
         AND dn.dispatched_at IS NOT NULL
    ) AS has_dispatch_data
  FROM sp s
),
manifest AS (
  SELECT
    COUNT(*) FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')) AS pending_open,
    COUNT(*) FILTER (WHERE status IN ('DIKIRIM','SAMPAI','MENUNGGU_KONFIRMASI_DC'))            AS shipped,
    COUNT(*) FILTER (WHERE status IN ('SAMPAI','TERKIRIM_PENUH') AND NOT has_btb)               AS delivered_belum_btb,
    COUNT(*) FILTER (WHERE status = 'BTB_TERBIT')                                               AS btb_terbit,
    COUNT(*) FILTER (WHERE status = 'TERKIRIM_PENUH')                                           AS terkirim_penuh,
    COUNT(*) FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                       AND expired_date < CURRENT_DATE)                                         AS expired,
    COUNT(*) FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                       AND expired_date >= CURRENT_DATE
                       AND date_trunc('month', expired_date) = date_trunc('month', CURRENT_DATE))
                                                                                                AS mendekati_expired,
    COUNT(*) FILTER (WHERE late_dispatch AND status <> 'CANCELLED')                             AS pernah_risiko_pinalti,
    COUNT(*) FILTER (WHERE has_dispatch_data
                       AND status <> 'CANCELLED'
                       AND status IN ('DIKIRIM','SAMPAI','MENUNGGU_KONFIRMASI_DC',
                                      'BTB_TERBIT','TERKIRIM_PENUH',
                                      'INVOICED','SUBMITTED','LUNAS'))                          AS dispatch_data_tersedia,
    COUNT(*) FILTER (WHERE status <> 'CANCELLED'
                       AND status IN ('DIKIRIM','SAMPAI','MENUNGGU_KONFIRMASI_DC',
                                      'BTB_TERBIT','TERKIRIM_PENUH',
                                      'INVOICED','SUBMITTED','LUNAS'))                          AS dispatch_eligible,
    COUNT(*) FILTER (WHERE status IN ('INVOICED','SUBMITTED','LUNAS'))                          AS finance,
    COUNT(*) FILTER (WHERE status = 'CANCELLED')                                                AS cancelled,
    COUNT(*)                                                                                    AS total_sp
  FROM sp_flag
),
-- ── BARU ────────────────────────────────────────────────────────────────────
-- Item per SP. Join (customer_id, sp_no) = pola persis
-- get_storbit_outstanding_summary. Grain-nya ITEM, sengaja beda dari `manifest`
-- yang ber-grain SP — makanya ia CTE terpisah dan bukan kolom tambahan di sana.
it AS (
  SELECT
    f.status,
    f.expired_date,
    f.has_btb,
    si.qty,
    si.shipped_qty,
    si.unit_price
  FROM sp_flag f
  JOIN public.sp_items si
    ON si.customer_id = f.customer_id
   AND si.sp_no       = f.sp_no
),
-- FILTER tiap agregat di bawah WAJIB cermin persis pasangan hitungannya di CTE
-- `manifest`. Kalau salah satu filter di sana diubah, ubah pasangannya di sini
-- — kalau tidak, angka dan rupiah pada kartu yang sama akan bercerita beda.
manifest_value AS (
  SELECT
    -- PRA-KIRIM
    COALESCE(SUM(GREATEST(qty - shipped_qty, 0) * unit_price)
      FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')), 0)::numeric
                                                                          AS pending_open_value,
    COALESCE(SUM(GREATEST(qty - shipped_qty, 0) * unit_price)
      FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                AND expired_date < CURRENT_DATE), 0)::numeric              AS expired_value,
    COALESCE(SUM(GREATEST(qty - shipped_qty, 0) * unit_price)
      FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                AND expired_date >= CURRENT_DATE
                AND date_trunc('month', expired_date) = date_trunc('month', CURRENT_DATE)), 0)::numeric
                                                                          AS mendekati_expired_value,
    -- PASCA-KIRIM
    COALESCE(SUM(shipped_qty * unit_price)
      FILTER (WHERE status IN ('DIKIRIM','SAMPAI','MENUNGGU_KONFIRMASI_DC')), 0)::numeric
                                                                          AS shipped_value,
    COALESCE(SUM(shipped_qty * unit_price)
      FILTER (WHERE status IN ('SAMPAI','TERKIRIM_PENUH') AND NOT has_btb), 0)::numeric
                                                                          AS delivered_belum_btb_value,
    COALESCE(SUM(shipped_qty * unit_price)
      FILTER (WHERE status = 'BTB_TERBIT'), 0)::numeric                    AS btb_terbit_value,
    COALESCE(SUM(shipped_qty * unit_price)
      FILTER (WHERE status IN ('INVOICED','SUBMITTED','LUNAS')), 0)::numeric
                                                                          AS finance_value
  FROM it
),
-- ── AKHIR BAGIAN BARU ───────────────────────────────────────────────────────
stock AS (
  SELECT
    p.reorder_point,
    COALESCE((SELECT SUM(ss.available) FROM public.stock_summary ss
               WHERE ss.product_id = p.id
                 AND ss.company_id = p.company_id), 0) AS available
  FROM public.products p, scope
  WHERE p.deleted_at IS NULL
    AND p.company_id = scope.cid
    AND p.is_service = false
    AND p.is_active  = true
),
warehouse AS (
  SELECT
    COUNT(*) FILTER (WHERE reorder_point IS NOT NULL AND available < reorder_point) AS danger_stock,
    COUNT(*) FILTER (WHERE available <= 0)                                          AS zero_stock,
    COUNT(*) FILTER (WHERE reorder_point IS NULL)                                   AS rop_belum_diisi,
    COUNT(*)                                                                        AS total_produk
  FROM stock
)
SELECT jsonb_build_object(
  'manifest', jsonb_build_object(
    'pending_open',        (SELECT pending_open        FROM manifest),
    'shipped',             (SELECT shipped             FROM manifest),
    'delivered_belum_btb', (SELECT delivered_belum_btb FROM manifest),
    'btb_terbit',          (SELECT btb_terbit          FROM manifest),
    'terkirim_penuh',      (SELECT terkirim_penuh      FROM manifest),
    'expired',             (SELECT expired             FROM manifest),
    'mendekati_expired',   (SELECT mendekati_expired   FROM manifest),
    'pernah_risiko_pinalti',  (SELECT pernah_risiko_pinalti  FROM manifest),
    'dispatch_data_tersedia', (SELECT dispatch_data_tersedia FROM manifest),
    'dispatch_eligible',      (SELECT dispatch_eligible      FROM manifest),
    'finance',             (SELECT finance             FROM manifest),
    'cancelled',           (SELECT cancelled           FROM manifest),
    'total_sp',            (SELECT total_sp            FROM manifest),
    -- BARU — tujuh nilai DPP (tanpa PPN). Empat kunci lain sengaja tak punya
    -- pasangan `_value`; alasannya di kepala file, jangan dilengkapi diam-diam.
    'pending_open_value',        (SELECT pending_open_value        FROM manifest_value),
    'shipped_value',             (SELECT shipped_value             FROM manifest_value),
    'delivered_belum_btb_value', (SELECT delivered_belum_btb_value FROM manifest_value),
    'btb_terbit_value',          (SELECT btb_terbit_value          FROM manifest_value),
    'finance_value',             (SELECT finance_value             FROM manifest_value),
    'expired_value',             (SELECT expired_value             FROM manifest_value),
    'mendekati_expired_value',   (SELECT mendekati_expired_value   FROM manifest_value)
  ),
  'warehouse', jsonb_build_object(
    'danger_stock',    (SELECT danger_stock    FROM warehouse),
    'zero_stock',      (SELECT zero_stock      FROM warehouse),
    'rop_belum_diisi', (SELECT rop_belum_diisi FROM warehouse),
    'total_produk',    (SELECT total_produk    FROM warehouse)
  ),
  'generated_at', now()
);
$$;

-- ACL — pola yang sudah dipakai fungsi ini, apa adanya.
REVOKE ALL ON FUNCTION public.get_storbit_dashboard_stats(p_customer_id uuid, p_price_category text, p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_storbit_dashboard_stats(p_customer_id uuid, p_price_category text, p_company_id uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- LANGKAH 3 — JALANKAN SETELAH LANGKAH 2, DI SESI YANG SAMA.
-- Membandingkan SELURUH kunci hitungan lama sebelum vs sesudah.
--
-- YANG DIHARAPKAN:
--   · 13 kunci lama x jumlah skenario -> status 'sama' SEMUA.
--   · 7 kunci `_value` baru muncul dengan sebelum = NULL, status 'BARU'.
--   · NOL baris berstatus 'BERUBAH *** '.
-- Kalau ada satu saja 'BERUBAH', JANGAN pakai versi ini — rollback ke definisi
-- lama (ada di supabase/schema_snapshot.sql) dan selidiki dulu.
-- ─────────────────────────────────────────────────────────────────────────────
WITH after AS (
  SELECT s.label, e.key, e.value
  FROM (
    SELECT 'tanpa-filter'::text AS label, NULL::uuid AS cust, NULL::text AS pcat
    UNION ALL
    SELECT 'cust:' || c.customer_id, c.customer_id, NULL
    FROM (SELECT DISTINCT o.customer_id
            FROM public.sp_orders o
           WHERE o.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
             AND o.deleted_at IS NULL
             AND o.customer_id IS NOT NULL
           LIMIT 3) c
    UNION ALL
    SELECT 'pcat:' || p.price_category, NULL, p.price_category
    FROM (SELECT DISTINCT o.price_category
            FROM public.sp_orders o
           WHERE o.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
             AND o.deleted_at IS NULL
             AND o.price_category IS NOT NULL
           LIMIT 3) p
  ) s,
  LATERAL jsonb_each(
    public.get_storbit_dashboard_stats(
      s.cust, s.pcat, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
    ) -> 'manifest'
  ) e
)
SELECT
  COALESCE(b.label, a.label) AS skenario,
  COALESCE(b.key,   a.key)   AS kunci,
  b.value                    AS sebelum,
  a.value                    AS sesudah,
  CASE
    WHEN b.key IS NULL                      THEN 'BARU'
    WHEN b.value IS DISTINCT FROM a.value   THEN 'BERUBAH ***'
    ELSE 'sama'
  END AS status
FROM _manifest_before b
FULL JOIN after a
  ON a.label = b.label AND a.key = b.key
-- Urutan sengaja eksplisit: yang bermasalah HARUS di puncak. Mengurutkan
-- `status` secara alfabetis akan menaruh 'sama' di atas 'BERUBAH ***'.
ORDER BY CASE
           WHEN b.key IS NULL                    THEN 2   -- BARU
           WHEN b.value IS DISTINCT FROM a.value THEN 0   -- BERUBAH -> paling atas
           ELSE 1                                         -- sama
         END,
         skenario, kunci;

-- Ringkasan satu baris — inilah yang harus dibaca lebih dulu.
-- Harus mengembalikan: berubah = 0.
WITH after AS (
  SELECT s.label, e.key, e.value
  FROM (
    SELECT 'tanpa-filter'::text AS label, NULL::uuid AS cust, NULL::text AS pcat
    UNION ALL
    SELECT 'cust:' || c.customer_id, c.customer_id, NULL
    FROM (SELECT DISTINCT o.customer_id
            FROM public.sp_orders o
           WHERE o.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
             AND o.deleted_at IS NULL
             AND o.customer_id IS NOT NULL
           LIMIT 3) c
    UNION ALL
    SELECT 'pcat:' || p.price_category, NULL, p.price_category
    FROM (SELECT DISTINCT o.price_category
            FROM public.sp_orders o
           WHERE o.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
             AND o.deleted_at IS NULL
             AND o.price_category IS NOT NULL
           LIMIT 3) p
  ) s,
  LATERAL jsonb_each(
    public.get_storbit_dashboard_stats(
      s.cust, s.pcat, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid
    ) -> 'manifest'
  ) e
)
SELECT
  COUNT(*) FILTER (WHERE b.value IS DISTINCT FROM a.value AND b.key IS NOT NULL) AS berubah,
  COUNT(*) FILTER (WHERE b.key IS NULL)                                          AS kunci_baru,
  COUNT(*) FILTER (WHERE b.key IS NOT NULL AND b.value IS NOT DISTINCT FROM a.value) AS sama
FROM _manifest_before b
FULL JOIN after a
  ON a.label = b.label AND a.key = b.key;
