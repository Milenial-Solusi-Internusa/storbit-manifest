-- =============================================================================
-- Migration: 20260818000003_storbit_dashboard_drilldown_rpc
-- Phase:     Dashboard Storbit — 2 RPC drill-down (daftar baris di balik tiap
--            kartu KPI). Read-only, pendamping get_storbit_dashboard_stats.
-- Depends:   20260818000001 (kolom reorder_point + price_category) DAN
--            20260818000002 (RPC stats). Keduanya harus live lebih dulu.
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi. Jalankan section
--            1 -> 3 berurutan di SQL Editor, lalu refresh schema_snapshot.sql.
--
-- CATATAN DESAIN:
--   - KENAPA RPC, BUKAN QUERY POSTGREST BIASA. Empat kategori mustahil
--     dinyatakan lewat PostgREST: delivered_belum_btb (anti-join sp_btb),
--     expired & mendekati_expired (MIN(sp_items.expired_date) terkorelasi),
--     pernah_risiko_pinalti (join delivery_notes + konversi timezone).
--     Menulis ulang logikanya di JS = drift yang persis diperingatkan TD-168.
--
--   - KENAPA 9 KATEGORI, BUKAN CUMA 4 YANG SULIT. RPC-nya toh wajib ada untuk
--     yang 4; memperluasnya ke 9 nyaris nol biaya dan menghapus satu kelas bug:
--     angka di kartu dan isi tabelnya dijamin lahir dari CTE + WHERE yang SAMA.
--     Jalur campuran (5 lewat PostgREST, 4 lewat RPC) berarti dua bentuk baris,
--     dua tempat menulis filter company/customer/price_category, dan dua
--     kesempatan untuk menyimpang.
--
--   - CTE `sp`/`sp_flag` di bawah SENGAJA cerminan persis milik
--     get_storbit_dashboard_stats (20260818000002). Kalau salah satu diubah,
--     UBAH DUA-DUANYA — termasuk daftar status, klausa dn.status<>'cancelled',
--     dan konversi AT TIME ZONE 'Asia/Jakarta'. Alasan tiap klausa ditulis
--     lengkap di CATATAN DESAIN migrasi itu, tidak diulang di sini.
--
--   - Tabel produk SENGAJA TANPA kolom DC (keputusan 18 Agu 2026): `products`
--     bukan entitas per-DC, dan satu produk bisa punya stok di beberapa gudang.
--     Kolom DC hanya akan berisi tebakan, jadi dihilangkan — menyimpang sadar
--     dari 5 kolom mockup, jadi 4 kolom (SKU / Produk / Tersedia / ROP).
--
--   - p_limit default 200 (bukan 1000 seperti cap PostgREST): tabel ini dibaca
--     manusia di layar, bukan diekspor. GREATEST(...,1) mencegah LIMIT 0/negatif.
--
--   - SECURITY INVOKER + STABLE, GRANT pola FASE 5 (REVOKE FROM PUBLIC lalu
--     GRANT ke authenticated saja) — sama persis alasannya dgn 20260818000002.
-- =============================================================================

-- 1. Drill-down SP — 9 kategori, satu bentuk baris.
CREATE OR REPLACE FUNCTION public.get_storbit_sp_drilldown(
  p_category       text,
  p_customer_id    uuid DEFAULT NULL,
  p_price_category text DEFAULT NULL,
  p_company_id     uuid DEFAULT NULL,
  p_limit          int  DEFAULT 200
) RETURNS TABLE(
  sp_no         text,
  customer_name text,
  dc_nama       text,
  sp_date       date,
  status        text,
  expired_date  date
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $fn$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
sp AS (
  SELECT
    o.id, o.status, o.customer_id, o.sp_no, o.sp_date, o.dc_id,
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
)
SELECT
  f.sp_no,
  a.name    AS customer_name,
  dm.nama   AS dc_nama,
  f.sp_date,
  f.status,
  f.expired_date
FROM sp_flag f
LEFT JOIN public.accounts  a  ON a.id  = f.customer_id
LEFT JOIN public.dc_master dm ON dm.id = f.dc_id
WHERE CASE p_category
  WHEN 'pending_open'          THEN f.status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
  WHEN 'shipped'               THEN f.status IN ('DIKIRIM','SAMPAI')
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
  -- Kategori tak dikenal -> nol baris, BUKAN seluruh tabel. Salah ketik di FE
  -- harus tampil sebagai "tidak ada data", bukan membocorkan semua SP.
  ELSE false
END
ORDER BY f.sp_date DESC NULLS LAST, f.sp_no
LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$fn$;

-- 2. Drill-down stok — 3 kategori warehouse.
--    Digerakkan dari products (ber-RLS company-scoped), BUKAN dari
--    stock_summary: produk tanpa histori stock_ledger tidak muncul di view itu
--    sama sekali, dan justru produk-produk itulah mayoritas isi zero_stock.
CREATE OR REPLACE FUNCTION public.get_storbit_stock_drilldown(
  p_category   text,
  p_company_id uuid DEFAULT NULL,
  p_limit      int  DEFAULT 200
) RETURNS TABLE(
  sku           text,
  product_name  text,
  available     numeric,
  reorder_point numeric
)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $fn$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
stock AS (
  SELECT
    p.code::text AS sku,
    p.name::text AS product_name,
    p.reorder_point,
    COALESCE((SELECT SUM(ss.available) FROM public.stock_summary ss
               WHERE ss.product_id = p.id
                 AND ss.company_id = p.company_id), 0) AS available
  FROM public.products p, scope
  WHERE p.deleted_at IS NULL
    AND p.company_id = scope.cid
    AND p.is_service = false
    AND p.is_active  = true
)
SELECT s.sku, s.product_name, s.available, s.reorder_point
FROM stock s
WHERE CASE p_category
  WHEN 'danger_stock'    THEN s.reorder_point IS NOT NULL AND s.available < s.reorder_point
  WHEN 'zero_stock'      THEN s.available <= 0
  WHEN 'rop_belum_diisi' THEN s.reorder_point IS NULL
  ELSE false
END
ORDER BY s.available ASC, s.product_name
LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$fn$;

-- 3. Hak akses — pola FASE 5 (default privileges Supabase meng-GRANT fungsi
--    baru ke anon secara otomatis, jadi REVOKE di bawah bukan formalitas).
REVOKE ALL ON FUNCTION public.get_storbit_sp_drilldown(text, uuid, text, uuid, int) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.get_storbit_sp_drilldown(text, uuid, text, uuid, int) TO authenticated;

REVOKE ALL ON FUNCTION public.get_storbit_stock_drilldown(text, uuid, int) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.get_storbit_stock_drilldown(text, uuid, int) TO authenticated;

-- ─── VERIFIKASI (jalankan TERPISAH setelah 1-3) ──────────────────────────────
--   -- a. anon TIDAK boleh punya EXECUTE di kedua fungsi:
--   SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name IN ('get_storbit_sp_drilldown','get_storbit_stock_drilldown');
--
--   -- b. KONSISTENSI ANGKA — ini cek terpenting. Jumlah baris drill-down harus
--   --    PERSIS sama dengan angka kartu dari RPC stats, kategori per kategori
--   --    (selama hasilnya di bawah p_limit). Contoh utk btb_terbit:
--   SELECT
--     (SELECT COUNT(*) FROM public.get_storbit_sp_drilldown(
--        'btb_terbit', NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', 1000)) AS drilldown,
--     (public.get_storbit_dashboard_stats(
--        NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697') -> 'manifest' ->> 'btb_terbit')::int AS kartu;
--   -- Ulangi utk: pending_open, shipped, delivered_belum_btb, terkirim_penuh,
--   -- expired, mendekati_expired, pernah_risiko_pinalti, finance, cancelled.
--
--   -- c. Kategori ngawur harus mengembalikan NOL baris (bukan semua SP):
--   SELECT COUNT(*) FROM public.get_storbit_sp_drilldown('kategori-ngaco', NULL, NULL, NULL, 200);
--   -- harus 0
--
--   -- d. Idem utk stok:
--   SELECT COUNT(*) FROM public.get_storbit_stock_drilldown('zero_stock',
--            'd2e5e565-5f67-4954-b8d9-5979a2a0c697', 1000);
--   -- harus sama dgn warehouse->>'zero_stock' dari RPC stats
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_storbit_sp_drilldown(text, uuid, text, uuid, int);
-- DROP FUNCTION IF EXISTS public.get_storbit_stock_drilldown(text, uuid, int);
