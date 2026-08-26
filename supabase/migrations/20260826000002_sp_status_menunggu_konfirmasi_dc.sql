-- =============================================================================
-- Migration: 20260826000002_sp_status_menunggu_konfirmasi_dc
-- Phase:     Status SP tidak boleh loncat ke TERKIRIM_PENUH sebelum tim DC
--            customer mengonfirmasi barang sampai.
-- Depends:   sp_orders (FASE 0) · delivery_notes · mark_delivery_delivered
--            · 20260818000002/20260818000003 (RPC dashboard Storbit)
--            · has_role()/user_roles/roles · notify_sp_milestone()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- MASALAH
--   sp_recompute_status menaruh cabang TERKIRIM_PENUH (Σshipped >= Σqty) DI ATAS
--   cabang SAMPAI (v_has_delivered), sehingga status SP melompat ke
--   "Terkirim Penuh" begitu qty berangkat penuh — TANPA menunggu konfirmasi
--   siapa pun. Efek sampingnya cabang SAMPAI jadi DEAD CODE: v_has_delivered
--   tetap dihitung tapi tak pernah menang.
--   Akibat bisnisnya: tombol "Tandai Terkirim" (DeliveryNoteDetailPage.jsx:364,
--   RPC mark_delivery_delivered) memang mengubah delivery_notes.status jadi
--   'delivered', tapi status SP tidak bergerak sedikit pun — jadi konfirmasi
--   tim DC tidak pernah terlihat di layar SP.
--
-- PERBAIKAN — state baru MENUNGGU_KONFIRMASI_DC
--   Σqty penuh TAPI masih ada SJ 'in_transit'  -> MENUNGGU_KONFIRMASI_DC
--   Σqty penuh DAN semua SJ 'delivered'        -> TERKIRIM_PENUH
--   Σqty penuh DAN SP tak punya SJ sama sekali -> TERKIRIM_PENUH (lihat di bawah)
--
--   ⚠️ KLAUSA "OR NOT v_has_dispatch" SENGAJA ADA — JANGAN DIHAPUS.
--   Tanpa itu, SP hasil import lama yang tak pernah lewat picking->SJ (jml_sj=0)
--   akan nyangkut PERMANEN di MENUNGGU_KONFIRMASI_DC: tak ada satu pun SJ yang
--   bisa ditandai 'delivered' untuk melepaskannya.
--
-- DAMPAK KE DATA PRODUKSI (dikonfirmasi Den sebelum migrasi ini ditulis)
--   16 SP berstatus TERKIRIM_PENUH saat ini:
--     11 TETAP TERKIRIM_PENUH (SJ-nya sudah 'delivered')
--      1 TETAP TERKIRIM_PENUH (jml_sj = 0 — diselamatkan klausa di atas)
--      4 PINDAH ke MENUNGGU_KONFIRMASI_DC (SJ masih 'in_transit'):
--        2047557 · 2199132 · 2280528 · 2280686
--   Keempatnya di-recompute EKSPLISIT di STEP 6 — sp_recompute_status tidak
--   punya trigger, jadi tanpa blok itu perubahan baru terlihat saat ada aksi
--   berikutnya yang kebetulan menyentuh SP tersebut.
--
-- SUMBER BODY: schema_snapshot.sql (versi LIVE, di-refresh 26 Agu 2026).
--   Keempat fungsi diambil TERPROGRAM lalu di-diff — perubahan HANYA yang
--   disebut di tiap STEP, sisanya VERBATIM.
--
-- DI LUAR SCOPE (JANGAN disentuh di migrasi ini)
--   - create_invoice / canCreateInvoice: gate Σshipped=Σqty TIDAK diubah.
--     Invoice tetap bisa terbit saat qty penuh meski DC belum konfirmasi —
--     itu jalur terpisah (invoicing per-partial-delivery).
--   - delivered_belum_btb: kartu itu berarti "sudah SAMPAI tapi BTB belum
--     terbit". SP di MENUNGGU_KONFIRMASI_DC justru BELUM sampai, jadi
--     SENGAJA tidak ditambahkan — memasukkannya akan membuat kartu berbohong.
--   - pending_open / expired / mendekati_expired: murni status pra-pengiriman,
--     tidak tersentuh.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — CHECK constraint: 13 nilai -> 14
-- ═════════════════════════════════════════════════════════════════════════════
-- WAJIB DULUAN. Kalau STEP 2 jalan lebih dulu, sp_recompute_status akan gagal
-- saat mencoba menulis nilai yang belum diizinkan constraint.
ALTER TABLE public.sp_orders DROP CONSTRAINT sp_orders_status_check;

ALTER TABLE public.sp_orders ADD CONSTRAINT sp_orders_status_check
  CHECK (status = ANY (ARRAY[
    'DRAFT'::text, 'CONFIRMED'::text, 'MENUNGGU_STOK'::text, 'PICKING'::text,
    'PACKED'::text, 'DIKIRIM'::text, 'SAMPAI'::text,
    'MENUNGGU_KONFIRMASI_DC'::text,                      -- BARU 26 Agu 2026
    'BTB_TERBIT'::text, 'TERKIRIM_PENUH'::text,
    'INVOICED'::text, 'SUBMITTED'::text, 'LUNAS'::text, 'CANCELLED'::text]));


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — sp_recompute_status: +2 var DECLARE, +2 assignment, 4 baris CASE,
--          + MENUNGGU_KONFIRMASI_DC di daftar pemicu notify_sp_milestone
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
  v_in_transit bool; v_all_delivered bool;   -- BARU 26 Agu 2026
  v_has_btb bool; v_has_invoice bool; v_submitted bool;
  v_paid bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status IN ('CANCELLED','LUNAS') THEN RETURN; END IF;
  v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
  v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
  v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
  v_short := EXISTS(
    SELECT 1 FROM sp_items si
     WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
       AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
       AND (si.qty - si.shipped_qty) > COALESCE(
             (SELECT SUM(ss.available) FROM stock_summary ss
               WHERE ss.company_id=v_company AND ss.product_id=si.product_id), 0));
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');
  -- BARU 26 Agu 2026: bedakan "ada yang sampai" dari "SEMUA sudah sampai".
  -- SJ 'cancelled'/'draft' SENGAJA diabaikan: cancel_delivery sudah membalik
  -- shipped_qty, dan SJ draft belum menaikkannya sama sekali.
  v_in_transit    := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='in_transit');
  v_all_delivered := v_has_delivered AND NOT v_in_transit;
  v_has_btb     := EXISTS(SELECT 1 FROM sp_btb      WHERE sp_order_id=v_id AND deleted_at IS NULL);
  v_has_invoice := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status <> 'void');
  v_submitted   := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND submitted_at IS NOT NULL AND status <> 'void');
  v_paid        := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status='paid');
  v_new := CASE
    WHEN v_paid                                   THEN 'LUNAS'
    WHEN v_submitted                              THEN 'SUBMITTED'
    WHEN v_has_invoice                            THEN 'INVOICED'
    WHEN v_has_btb                                THEN 'BTB_TERBIT'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered
         AND (v_all_delivered OR NOT v_has_dispatch) THEN 'TERKIRIM_PENUH'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered    THEN 'MENUNGGU_KONFIRMASI_DC'
    WHEN v_all_delivered                             THEN 'SAMPAI'
    WHEN v_has_dispatch                              THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;
  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
    IF FOUND AND v_new IN ('CONFIRMED','MENUNGGU_KONFIRMASI_DC','BTB_TERBIT','SUBMITTED') THEN
      PERFORM public.notify_sp_milestone(v_id, v_new, v_status, v_new);
    END IF;
  END IF;
END; $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — get_storbit_dashboard_stats: 3 IN-list +MENUNGGU_KONFIRMASI_DC
--   (1) shipped                — supaya SP di state baru tidak HILANG dari
--       funnel. Ini juga menjaga donut "Distribusi Status SP" tetap utuh:
--       6 slice-nya harus mutually exclusive DAN menjumlah persis total_sp
--       (lihat DONUT_STATUS_SLICES, src/lib/spStatusConstants.js).
--   (2) dispatch_data_tersedia — penyebut metrik pinalti
--   (3) dispatch_eligible      — penyebut metrik pinalti
--   delivered_belum_btb SENGAJA TIDAK diubah (lihat DI LUAR SCOPE di header).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_storbit_dashboard_stats(p_customer_id uuid DEFAULT NULL::uuid, p_price_category text DEFAULT NULL::text, p_company_id uuid DEFAULT NULL::uuid) RETURNS jsonb
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
    'total_sp',            (SELECT total_sp            FROM manifest)
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

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 4 — get_storbit_sp_drilldown: kategori 'shipped' (mirror STEP 3)
--   Tanpa ini, angka kartu dan isi drill-down saat diklik akan berbeda.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_storbit_sp_drilldown(p_category text, p_customer_id uuid DEFAULT NULL::uuid, p_price_category text DEFAULT NULL::text, p_company_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200) RETURNS TABLE(sp_no text, customer_id uuid, customer_name text, dc_nama text, sp_date date, status text, expired_date date)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
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
  f.customer_id,
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
  ELSE false
END
ORDER BY f.sp_date DESC NULLS LAST, f.sp_no
LIMIT GREATEST(COALESCE(p_limit, 200), 1);
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 — mark_delivery_delivered: + guard otorisasi
-- ═════════════════════════════════════════════════════════════════════════════
-- Sebelum migrasi ini RPC tsb SECURITY DEFINER dengan NOL pengecekan role dan
-- GRANT ALL TO authenticated — setiap user login bisa memanggilnya langsung
-- lewat PostgREST, melewati satu-satunya penjaga yang ada (gate FE
-- canWarehouseOps). Sesudah STEP 2, RPC ini jadi PENENTU status SP, jadi
-- celahnya naik bobot: siapa pun bisa menyatakan barang sudah sampai.
-- Daftar role di bawah MIRROR PERSIS gate FE, bukan daftar baru.
CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;

  -- BARU 26 Agu 2026: guard otorisasi. Daftar role MIRROR PERSIS gate FE
  -- canWarehouseOps (src/modules/logistics/DeliveryNoteDetailPage.jsx:80-82) --
  -- 8 kode, disalin apa adanya, BUKAN daftar baru. Kondisi is_active /
  -- valid_until mengikuti has_role() (schema_snapshot.sql:2545) supaya
  -- semantiknya identik; ditulis sebagai SATU EXISTS, bukan 8 panggilan
  -- has_role() berturut-turut.
  -- Sengaja TANPA company-scope: gate FE-nya pun membaca seluruh erpRoles
  -- lintas entitas. Menambah scope di sini akan membuat DB lebih ketat
  -- daripada UI -- perbedaan yang harus jadi keputusan sadar, bukan efek
  -- samping mirroring.
  IF NOT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r ON r.id = ur.role_id
    WHERE  ur.user_id  = auth.uid()
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  r.code = ANY (ARRAY['super_admin','admin','ceo','gm','gm_bd',
                               'manager','supervisor','operations'])
  ) THEN
    RAISE EXCEPTION 'Tidak berhak menandai surat jalan sebagai terkirim. Butuh salah satu role: super_admin, admin, ceo, gm, gm_bd, manager, supervisor, atau operations.';
  END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 6 — Recompute EKSPLISIT 4 SP yang sudah diketahui akan berubah
-- ═════════════════════════════════════════════════════════════════════════════
-- sp_recompute_status TIDAK punya trigger — ia hanya dipanggil eksplisit oleh
-- RPC lain (dispatch_delivery, mark_delivery_delivered, sp_issue_btb, dst).
-- Artinya STEP 2 saja tidak mengubah satu baris pun; SP lama baru bergerak saat
-- ada aksi berikutnya yang kebetulan menyentuhnya. Blok ini memaksa keempat SP
-- yang sudah diidentifikasi pindah sekarang juga, supaya hasilnya langsung
-- terlihat dan bisa diverifikasi.
-- customer_id sama untuk keempatnya: a18fad3c-75ee-4fc6-b3d2-5c5dfa810661
DO $$
DECLARE
  v_cust uuid := 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661';
  v_sp   text;
BEGIN
  FOREACH v_sp IN ARRAY ARRAY['2047557','2199132','2280528','2280686'] LOOP
    PERFORM public.sp_recompute_status(v_cust, v_sp);
  END LOOP;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI (jalankan TERPISAH sesudahnya — jangan digabung ke atas)
-- ═════════════════════════════════════════════════════════════════════════════
--   -- a. Constraint sudah memuat 14 nilai:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'sp_orders_status_check';
--
--   -- b. Keempat SP sudah pindah (HARUS MENUNGGU_KONFIRMASI_DC):
--   SELECT sp_no, status FROM public.sp_orders
--    WHERE customer_id = 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
--      AND sp_no IN ('2047557','2199132','2280528','2280686')
--    ORDER BY sp_no;
--
--   -- c. Sebaran status TERKIRIM_PENUH sesudahnya (HARUS 12: 11 + 1 tanpa SJ):
--   SELECT status, count(*) FROM public.sp_orders
--    WHERE deleted_at IS NULL AND status IN ('TERKIRIM_PENUH','MENUNGGU_KONFIRMASI_DC')
--    GROUP BY status;
--
--   -- d. SP tanpa SJ TIDAK nyangkut (klausa OR NOT v_has_dispatch bekerja):
--   SELECT o.sp_no, o.status, count(dn.id) AS jml_sj
--     FROM public.sp_orders o
--     LEFT JOIN public.delivery_notes dn
--       ON dn.customer_id = o.customer_id AND dn.sp_no = o.sp_no
--    WHERE o.deleted_at IS NULL AND o.status = 'MENUNGGU_KONFIRMASI_DC'
--    GROUP BY o.id, o.sp_no, o.status
--   HAVING count(dn.id) = 0;   -- HARUS 0 baris
--
--   -- e. Guard mark_delivery_delivered aktif — uji dgn user TANPA role gudang,
--   --    HARUS gagal dengan pesan 'Tidak berhak menandai surat jalan...'.
--
--   -- f. Alur lengkap, dibungkus ROLLBACK (nol efek permanen).
--   --    Ganti <DN_ID> dengan surat jalan berstatus 'in_transit'.
--   BEGIN;
--     SELECT o.sp_no, o.status FROM public.sp_orders o
--       JOIN public.delivery_notes dn
--         ON dn.customer_id=o.customer_id AND dn.sp_no=o.sp_no
--      WHERE dn.id='<DN_ID>';                       -- sebelum: MENUNGGU_KONFIRMASI_DC
--     SELECT public.mark_delivery_delivered('<DN_ID>'::uuid);
--     SELECT o.sp_no, o.status FROM public.sp_orders o
--       JOIN public.delivery_notes dn
--         ON dn.customer_id=o.customer_id AND dn.sp_no=o.sp_no
--      WHERE dn.id='<DN_ID>';                       -- sesudah: TERKIRIM_PENUH
--   ROLLBACK;
--
--   -- g. Dashboard tidak kehilangan SP: shipped + dispatch_* sudah menghitung
--   --    state baru.
--   SELECT public.get_storbit_dashboard_stats();
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   ⚠️ URUTAN TERBALIK dari STEP. Fungsi dikembalikan DULU, constraint TERAKHIR
--      — kalau constraint dikembalikan lebih dulu sementara masih ada baris
--      ber-status MENUNGGU_KONFIRMASI_DC, ALTER-nya akan DITOLAK.
--
--   -- 1. Kembalikan keempat fungsi ke versi pra-migrasi (schema_snapshot.sql):
--   --      sp_recompute_status            :2957-3012
--   --      get_storbit_dashboard_stats    :789-906
--   --      get_storbit_sp_drilldown       :1011-1076
--   --      mark_delivery_delivered        :1851-1864
--   -- 2. Kosongkan status baru sebelum constraint dikembalikan:
--   --    UPDATE public.sp_orders SET status='TERKIRIM_PENUH'
--   --     WHERE status='MENUNGGU_KONFIRMASI_DC';
--   -- 3. ALTER TABLE public.sp_orders DROP CONSTRAINT sp_orders_status_check;
--   --    ALTER TABLE public.sp_orders ADD CONSTRAINT sp_orders_status_check
--   --      CHECK (status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text,
--   --        'MENUNGGU_STOK'::text, 'PICKING'::text, 'PACKED'::text,
--   --        'DIKIRIM'::text, 'SAMPAI'::text, 'BTB_TERBIT'::text,
--   --        'TERKIRIM_PENUH'::text, 'INVOICED'::text, 'SUBMITTED'::text,
--   --        'LUNAS'::text, 'CANCELLED'::text]));
