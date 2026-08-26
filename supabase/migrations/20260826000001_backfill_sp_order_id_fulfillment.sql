-- =============================================================================
-- Migration: 20260826000001_backfill_sp_order_id_fulfillment
-- Phase:     Menghidupkan kolom mati picking_lists.sp_order_id &
--            delivery_notes.sp_order_id (backfill + isi sejak sekarang + index).
-- Depends:   sp_orders (FASE 0)
--            · 20260821000001_partial-picking-guard  (guard partial-picking)
--            · 20260821000007_picking_guards         (guard otorisasi)
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- MASALAH
--   Kedua kolom punya FK ke sp_orders (picking_lists_sp_order_id_fkey,
--   delivery_notes_sp_order_id_fkey) sehingga TAMPAK sebagai jalur join yang
--   benar — padahal TIDAK PERNAH DIISI. Daftar kolom INSERT di kedua RPC
--   pembuatnya tak menyebut sp_order_id sama sekali:
--     generate_picking_from_sp       -> (company_id, picking_no, sp_no,
--                                        warehouse_id, status, created_by,
--                                        customer_id)
--     generate_delivery_from_picking -> (company_id, do_no, sp_no,
--                                        picking_list_id, customer_id,
--                                        customer_name, destination_address,
--                                        status, created_by)
--   Akibatnya query apa pun yang memakai .eq('sp_order_id', ...) pada kedua
--   tabel ini mengembalikan NOL BARIS TANPA ERROR — gagal senyap, kelas yang
--   sama dengan TD-207.
--
-- BASELINE — SUDAH DIKONFIRMASI BERSIH DI PRODUKSI (26 Agu 2026, oleh Den):
--     picking_lists  : total 92, bisa_dibackfill 74, tetap_null 0
--     delivery_notes : total 83, bisa_dibackfill 69, tetap_null 0
--     customer_id NULL: 0 di KEDUA tabel
--     sp_no kembar antar customer di sp_orders: 0
--     SP dengan >1 delivery_notes: 0 (partial delivery belum pernah dipakai
--       di data asli; strukturnya sudah siap — tak ada UNIQUE yang menghalangi)
--   => NOL baris yatim. Seluruh baris yang sp_order_id-nya NULL punya pasangan
--      sp_orders, jadi setelah SECTION 1 kolom ini terisi 100%.
--   Query baseline TIDAK diulang di file ini (sudah dijalankan; lihat plan).
--
-- ⚠️ SUMBER BODY SECTION 3 & 4: schema_snapshot.sql (versi LIVE).
--    Diverifikasi 26 Agu 2026 sebelum file ini ditulis: badan kedua fungsi di
--    snapshot BYTE-IDENTIK dengan versi di 20260821000007_picking_guards.sql
--    (dibuktikan via diff, komentar & whitespace dinormalisasi), DAN kedua
--    guard 21 Agu terbaca positif di dalamnya:
--      - otorisasi        : "is_manager_or_above() OR has_role('operations')"
--      - partial-picking  : "dn.dispatched_at IS NOT NULL" + pesan
--                           "berangkatkan dulu sebelum membuat picking baru"
--    Jadi file ini TIDAK menimpa guard yang lebih baru dengan yang lebih lama.
--    (Header 20260821000007 sendiri masih tertulis "BELUM DIJALANKAN" — header
--     ITU yang basi, bukan snapshot-nya.)
--
-- ⚠️ SETELAH migrasi ini, sp_order_id boleh dipercaya. TAPI keputusan Den
--    26 Agu 2026: FE TETAP memakai kunci komposit (customer_id, sp_no),
--    BUKAN sp_order_id. Alasannya bukan kebersihan data (sudah terbukti 0
--    orphan) melainkan TIMING: spOrder.id baru tersedia setelah fetch async,
--    sementara composite sudah ada sejak render pertama lewat props.
--    Nilai migrasi ini: menghapus jebakan FK-yang-tampak-hidup, menyiapkan
--    M13 (saat sp_items di-drop, sp_no kehilangan jangkar), dan meringkas
--    join di sisi server.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — BACKFILL
-- ═════════════════════════════════════════════════════════════════════════════
-- Urutan 1a -> 1b -> 1c WAJIB: 1c membaca pl.sp_order_id yang baru diisi 1a.
-- Angka harapan (dari baseline): 1a = UPDATE 74, 1b = UPDATE 69, 1c = UPDATE 0.
-- Kalau 1c > 0, artinya ada SJ ber-customer_id NULL yang tak terdeteksi
-- baseline — HENTIKAN dan periksa sebelum lanjut ke SECTION 2.

-- 1a. picking_lists via komposit (customer_id, sp_no).
UPDATE public.picking_lists pl
   SET sp_order_id = o.id
  FROM public.sp_orders o
 WHERE pl.sp_order_id IS NULL
   AND pl.customer_id IS NOT NULL
   AND o.customer_id  = pl.customer_id
   AND o.sp_no        = pl.sp_no
   AND o.deleted_at IS NULL;

-- 1b. delivery_notes via komposit (customer_id, sp_no).
UPDATE public.delivery_notes dn
   SET sp_order_id = o.id
  FROM public.sp_orders o
 WHERE dn.sp_order_id IS NULL
   AND dn.customer_id IS NOT NULL
   AND o.customer_id  = dn.customer_id
   AND o.sp_no        = dn.sp_no
   AND o.deleted_at IS NULL;

-- 1c. delivery_notes SISA — lewat picking induknya.
--     Menangkap SJ yang customer_id-nya NULL (kolom itu nullable dan sempat
--     tak ada) tapi picking_list_id-nya terisi. Baseline bilang 0 baris seperti
--     ini; blok tetap disertakan sebagai jaring pengaman, bukan pekerjaan sia-
--     sia — biayanya nol kalau memang tak ada yang cocok.
UPDATE public.delivery_notes dn
   SET sp_order_id = pl.sp_order_id
  FROM public.picking_lists pl
 WHERE dn.sp_order_id IS NULL
   AND dn.picking_list_id = pl.id
   AND pl.sp_order_id IS NOT NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — INDEX
-- ═════════════════════════════════════════════════════════════════════════════
-- Kedua tabel sudah punya idx_picking_lists_sp_no / idx_delivery_notes_sp_no,
-- tapi sp_order_id NOL index — mem-backfill lalu men-join lewatnya tanpa index
-- = seq scan. Partial (WHERE NOT NULL) karena baris tanpa header tak perlu
-- diindeks; hari ini 0 baris, tapi RPC di SECTION 3/4 sengaja membolehkan NULL.
CREATE INDEX IF NOT EXISTS idx_picking_lists_sp_order
  ON public.picking_lists (sp_order_id) WHERE sp_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_notes_sp_order
  ON public.delivery_notes (sp_order_id) WHERE sp_order_id IS NOT NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — generate_picking_from_sp: isi sp_order_id sejak sekarang
-- ═════════════════════════════════════════════════════════════════════════════
-- SUMBER BODY: schema_snapshot.sql:770-838 (versi live, sudah memuat guard
--   otorisasi 20260821000007 + guard partial-picking 20260821000001).
-- PERUBAHAN HANYA 3: +1 var DECLARE, +1 SELECT lookup, +1 kolom di INSERT.
--   Seluruh guard, CTE, stock_ledger, dan sp_recompute_status VERBATIM.
-- ⚠️ SENGAJA TIDAK RAISE kalau sp_orders tak ketemu (keputusan Den 26 Agu 2026):
--    memblokir pembuatan picking untuk SP legacy = perubahan perilaku
--    operasional di luar scope. Baris seperti itu tetap lahir dengan
--    sp_order_id NULL, persis seperti hari ini. Baseline: 0 kasus.
CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid) RETURNS TABLE(picking_list_id uuid, picking_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_wh uuid := COALESCE(p_warehouse_id, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
  v_entity text; v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_pl_id uuid; v_uid uuid := auth.uid(); v_outstanding int;
  v_sp_order_id uuid;                                   -- BARU 26 Agu 2026
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no; END IF;
  IF NOT (is_super_admin() OR (v_company_id IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membuat picking list untuk SP ini';
  END IF;
  IF EXISTS (SELECT 1 FROM picking_lists WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND status IN ('pending','in_progress')) THEN
    RAISE EXCEPTION 'Picking list untuk SP % sudah ada', p_sp_no; END IF;
  IF EXISTS (
    SELECT 1 FROM picking_lists pl
    WHERE pl.sp_no = p_sp_no AND pl.customer_id = p_customer_id
      AND pl.status = 'done'
      AND NOT EXISTS (
        SELECT 1 FROM delivery_notes dn
        WHERE dn.picking_list_id = pl.id
          AND dn.dispatched_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Picking list SP % sudah selesai tapi surat jalannya belum diberangkatkan - berangkatkan dulu sebelum membuat picking baru', p_sp_no; END IF;
  SELECT count(*) INTO v_outstanding FROM sp_items
    WHERE sp_no=p_sp_no AND customer_id=p_customer_id AND sp_status='confirmed' AND (qty - shipped_qty) > 0;
  IF v_outstanding = 0 THEN RAISE EXCEPTION 'SP % tidak punya item outstanding', p_sp_no; END IF;

  -- BARU 26 Agu 2026: resolusi header SP. NULL = SP legacy tanpa baris
  -- sp_orders; dibiarkan (TIDAK RAISE) supaya perilaku pembuatan picking
  -- tidak berubah untuk data lama.
  SELECT id INTO v_sp_order_id FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;

  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id,'PICK','WH',v_year,0);
  v_no  := 'PICK/'||COALESCE(v_entity,'SOA')||'/WH/'||v_year||'/'||lpad(v_seq::text,4,'0');
  INSERT INTO picking_lists (company_id, picking_no, sp_no, warehouse_id, status, created_by, customer_id, sp_order_id)
  VALUES (v_company_id, v_no, p_sp_no, v_wh, 'pending', v_uid, p_customer_id, v_sp_order_id)
  RETURNING id INTO v_pl_id;
  WITH src AS (
    SELECT si.id AS sp_item_id, si.product_id, si.product_name, si.sku,
           GREATEST(si.qty - si.shipped_qty, 0) AS req
    FROM sp_items si
    WHERE si.sp_no=p_sp_no AND si.customer_id=p_customer_id AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
  ),
  av AS (
    SELECT src.*,
           COALESCE((SELECT SUM(ss.available) FROM stock_summary ss
                     WHERE ss.company_id = v_company_id AND ss.product_id = src.product_id), 0) AS avail
    FROM src
  ),
  ins_items AS (
    INSERT INTO picking_list_items
      (picking_list_id, sp_item_id, product_id, product_name, sku, qty_requested, qty_short, location_detail)
    SELECT v_pl_id, sp_item_id, product_id, product_name, sku, req,
           CASE WHEN product_id IS NULL THEN 0 ELSE GREATEST(req - LEAST(req, avail), 0) END,
           (SELECT pwl.rack_location FROM product_warehouse_location pwl
             WHERE pwl.product_id = av.product_id AND pwl.warehouse_id = v_wh LIMIT 1)
    FROM av
    RETURNING 1
  )
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company_id, v_wh, product_id, 'reserved', LEAST(req, avail), 'picking', v_pl_id, v_no, v_uid
  FROM av
  WHERE product_id IS NOT NULL AND LEAST(req, avail) > 0;
  PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  RETURN QUERY SELECT v_pl_id, v_no;
END; $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — generate_delivery_from_picking: isi sp_order_id sejak sekarang
-- ═════════════════════════════════════════════════════════════════════════════
-- SUMBER BODY: schema_snapshot.sql:713-763 (versi live, sudah memuat guard
--   otorisasi 20260821000007).
-- PERUBAHAN HANYA 4: +1 var DECLARE, +1 kolom pada SELECT picking_lists yang
--   SUDAH ADA, +1 blok fallback, +1 kolom di INSERT. Sisanya VERBATIM.
-- Fallback dua lapis: ambil dari picking induk (pasca SECTION 1 hampir selalu
--   terisi); kalau NULL baru lookup komposit. Lookup itu SENGAJA ditaruh
--   SETELAH blok resolusi v_customer — kunci komposit butuh customer_id, dan
--   v_customer baru final setelah fallback sp_items di atasnya.
CREATE OR REPLACE FUNCTION public.generate_delivery_from_picking(p_picking_list_id uuid) RETURNS TABLE(delivery_note_id uuid, do_no text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_entity text;
  v_year int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq int; v_no text; v_dn_id uuid; v_uid uuid := auth.uid();
  v_sp_no text; v_pick_status text;
  v_customer uuid; v_cust_name text; v_addr text;
  v_item_count int;
  v_sp_order_id uuid;                                   -- BARU 26 Agu 2026
BEGIN
  SELECT sp_no, status, customer_id, sp_order_id
    INTO v_sp_no, v_pick_status, v_customer, v_sp_order_id   -- +sp_order_id
    FROM picking_lists WHERE id = p_picking_list_id;
  IF v_sp_no IS NULL THEN RAISE EXCEPTION 'Picking list tidak ditemukan'; END IF;
  IF v_pick_status <> 'done' THEN RAISE EXCEPTION 'Picking list belum selesai (status=%)', v_pick_status; END IF;
  IF NOT (is_super_admin() OR (v_company_id IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membuat surat jalan untuk picking ini';
  END IF;
  IF EXISTS (SELECT 1 FROM delivery_notes WHERE picking_list_id = p_picking_list_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Surat jalan untuk picking ini sudah ada'; END IF;
  SELECT count(*) INTO v_item_count FROM picking_list_items
    WHERE picking_list_id = p_picking_list_id AND COALESCE(qty_picked,0) > 0;
  IF v_item_count = 0 THEN RAISE EXCEPTION 'Tak ada item ter-pick untuk dikirim'; END IF;

  IF v_customer IS NULL THEN
    SELECT si.customer_id INTO v_customer FROM sp_items si WHERE si.sp_no = v_sp_no LIMIT 1;
  END IF;
  SELECT a.name, a.address INTO v_cust_name, v_addr FROM accounts a WHERE a.id = v_customer;

  -- BARU 26 Agu 2026: fallback kalau picking induknya belum ter-backfill
  -- (mis. picking lahir dari RPC versi lama sebelum SECTION 3 dijalankan).
  IF v_sp_order_id IS NULL AND v_customer IS NOT NULL THEN
    SELECT id INTO v_sp_order_id FROM sp_orders
     WHERE customer_id = v_customer AND sp_no = v_sp_no AND deleted_at IS NULL;
  END IF;

  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'SJ', 'WH', v_year, 0);
  v_no  := 'SJ/' || COALESCE(v_entity,'SOA') || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  INSERT INTO delivery_notes
    (company_id, do_no, sp_no, picking_list_id, customer_id, customer_name, destination_address, status, created_by, sp_order_id)
  VALUES (v_company_id, v_no, v_sp_no, p_picking_list_id, v_customer, v_cust_name, v_addr, 'draft', v_uid, v_sp_order_id)
  RETURNING id INTO v_dn_id;

  INSERT INTO delivery_note_items (delivery_note_id, picking_list_item_id, product_id, product_name, sku, qty)
  SELECT v_dn_id, pli.id, pli.product_id, pli.product_name, pli.sku, pli.qty_picked
  FROM picking_list_items pli
  WHERE pli.picking_list_id = p_picking_list_id AND COALESCE(pli.qty_picked,0) > 0;

  RETURN QUERY SELECT v_dn_id, v_no;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI (jalankan TERPISAH sesudahnya — jangan digabung ke atas)
-- ═════════════════════════════════════════════════════════════════════════════
--   -- a. Backfill lengkap. 'masih_null' HARUS 0 di kedua baris (baseline
--   --    sudah membuktikan tetap_null = 0).
--   SELECT 'picking_lists' AS tabel, count(*) AS total,
--          count(sp_order_id) AS terisi, count(*) - count(sp_order_id) AS masih_null
--     FROM public.picking_lists
--   UNION ALL
--   SELECT 'delivery_notes', count(*), count(sp_order_id),
--          count(*) - count(sp_order_id)
--     FROM public.delivery_notes;
--
--   -- b. Konsistensi: sp_order_id yang terisi HARUS cocok dgn komposit-nya.
--   --    Kedua angka HARUS 0.
--   SELECT
--     (SELECT count(*) FROM public.picking_lists pl
--        JOIN public.sp_orders o ON o.id = pl.sp_order_id
--       WHERE pl.customer_id IS NOT NULL
--         AND (o.customer_id <> pl.customer_id OR o.sp_no <> pl.sp_no)) AS picking_tidak_konsisten,
--     (SELECT count(*) FROM public.delivery_notes dn
--        JOIN public.sp_orders o ON o.id = dn.sp_order_id
--       WHERE dn.customer_id IS NOT NULL
--         AND (o.customer_id <> dn.customer_id OR o.sp_no <> dn.sp_no)) AS sj_tidak_konsisten;
--
--   -- c. RPC baru benar-benar mengisi kolomnya. Dibungkus ROLLBACK -> nol efek
--   --    permanen (nomor dokumen dari increment_document_sequence ikut kembali).
--   --    Ganti <SP_NO>/<CUST> dengan SP confirmed yang punya item outstanding.
--   BEGIN;
--     SELECT * FROM public.generate_picking_from_sp('<SP_NO>', '<CUST>'::uuid);
--     SELECT picking_no, sp_no, sp_order_id
--       FROM public.picking_lists ORDER BY created_at DESC LIMIT 1;
--     -- sp_order_id HARUS terisi dan cocok dgn sp_orders SP itu.
--   ROLLBACK;
--
--   -- d. Guard 21 Agu MASIH UTUH setelah CREATE OR REPLACE (regresi paling
--   --    mahal kalau sampai hilang). Ketiganya HARUS true.
--   SELECT
--     pg_get_functiondef('public.generate_picking_from_sp(text,uuid,uuid)'::regprocedure)
--       LIKE '%is_manager_or_above() OR has_role(''operations'')%'          AS guard_otorisasi,
--     pg_get_functiondef('public.generate_picking_from_sp(text,uuid,uuid)'::regprocedure)
--       LIKE '%dn.dispatched_at IS NOT NULL%'                               AS guard_partial_picking,
--     pg_get_functiondef('public.generate_delivery_from_picking(uuid)'::regprocedure)
--       LIKE '%Tidak berhak membuat surat jalan untuk picking ini%'         AS guard_sj;
--
--   -- e. Index terpakai (bukan seq scan).
--   EXPLAIN SELECT * FROM public.delivery_notes WHERE sp_order_id = '<UUID>';
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   ⚠️ UPDATE di bawah mengosongkan SELURUH kolom, termasuk nilai yang ditulis
--      RPC baru — bukan cuma hasil backfill. Tidak ada cara membedakannya.
--   UPDATE public.picking_lists  SET sp_order_id = NULL;
--   UPDATE public.delivery_notes SET sp_order_id = NULL;
--   DROP INDEX IF EXISTS public.idx_picking_lists_sp_order;
--   DROP INDEX IF EXISTS public.idx_delivery_notes_sp_order;
--   -- Kembalikan kedua fungsi ke schema_snapshot.sql:713-763 & :770-838
--   -- (versi pra-migrasi ini, yang guard 21 Agu-nya sudah lengkap).
