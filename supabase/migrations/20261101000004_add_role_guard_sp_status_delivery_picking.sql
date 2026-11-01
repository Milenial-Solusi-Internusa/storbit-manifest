-- =============================================================================
-- Migration: 20261101000004_add_role_guard_sp_status_delivery_picking
-- Phase:     Hardening keamanan -- tambah pengecekan peran ke 4 RPC SECURITY
--            DEFINER yang SAAT INI nol pengecekan peran sama sekali:
--            set_sp_status, cancel_delivery, cancel_picking, dispatch_delivery.
--            (Mas konfirmasi: ini BELUM SEMPAT dipasang, bukan desain sengaja.)
--
-- Purpose:   Keempat fungsi ini hari ini bisa dipanggil oleh SIAPA PUN yang
--            login (peran apa pun -- sales, finance, viewer, dst), karena
--            satu-satunya pagar yang tersisa sesudah migrasi
--            20261101000002/000003 (ACL) adalah "harus authenticated", BUKAN
--            "harus peran yang tepat". Guard yang ditambahkan di sini
--            MENIRU PERSIS pola yang sudah dipakai add_picking_material /
--            delete_picking_material / generate_picking_from_sp /
--            generate_delivery_from_picking / sp_issue_btb:
--              IF NOT (is_super_admin() OR (v_company IN
--                      (SELECT get_user_company_ids())
--                      AND (is_manager_or_above() OR has_role('operations'))))
--              THEN RAISE EXCEPTION '...';
--            Nol perbandingan langsung terhadap auth.uid()/variabel turunannya
--            -- seluruhnya lewat fungsi bantu (is_super_admin, is_manager_or_
--            above, has_role, get_user_company_ids), yang semuanya SELECT
--            EXISTS(...) dan karena itu selalu balik boolean definit (FALSE
--            utk pemanggil anonim), TIDAK PERNAH NULL -- tidak kena bug kelas
--            prf_release/prf_select_offer (lihat audit terpisah, bukan
--            bagian migrasi ini). Dibuktikan: utk auth.uid() NULL,
--            get_user_company_ids() mengembalikan himpunan KOSONG, dan
--            "x IN (<himpunan kosong>)" SELALU FALSE pasti (bukan NULL)
--            berapa pun nilai x -- jadi cabang
--            "v_company IN (...) AND (...)" pasti FALSE, OR dengan
--            is_super_admin()=FALSE tetap FALSE pasti, NOT FALSE = TRUE,
--            RAISE selalu menyala untuk pemanggil anonim.
--
--            Satu-satunya perubahan per fungsi: (a) ambil/pakai ulang
--            v_company, (b) sisipkan blok IF NOT (...) THEN RAISE di atas.
--            NOL baris logika bisnis yang sudah ada diubah/dihapus --
--            dibuktikan dengan diff (lihat bagian VERIFIKASI DIFF di bawah).
--
-- Basis badan fungsi (WAJIB dibaca sebelum menjalankan migrasi ini):
--   - set_sp_status  : identik schema_snapshot.sql DAN migrasi terakhirnya
--                       (20260814000001_notify_sp_milestone.sql) -- nol beda.
--   - cancel_picking : identik secara substansi schema_snapshot.sql DAN
--                       migrasi asalnya (20260707000002_sp_status_machine_
--                       fase1.sql) -- hanya 1 baris komentar developer yang
--                       hilang dari versi live, nol beda logika/statement.
--   - cancel_delivery DAN dispatch_delivery: ⛔ BEDA/BASI terhadap migrasi
--     asalnya (20260707000003_sp_fase2_pengiriman.sql). Versi LIVE (di
--     schema_snapshot.sql) punya blok TAMBAHAN "jembatan/reversal
--     shipped_qty ke sp_order_items" yang TIDAK ADA di migrasi manapun di
--     repo (di-grep: nol hit frasa itu di seluruh supabase/migrations/*.sql)
--     -- kelas "perubahan live tanpa jejak migrasi". Migrasi ini memakai
--     SCHEMA_SNAPSHOT.SQL sebagai basis untuk KEDUANYA, bukan berkas migrasi
--     7 Jul -- supaya blok sp_order_items yang sedang berjalan di produksi
--     TIDAK terhapus. Diusulkan TD terpisah untuk gap dokumentasi ini
--     (bukan bagian migrasi ini -- lihat laporan sesi).
--
-- ── MD5 CHECK (WAJIB dijalankan TERPISAH, SEBELUM menerapkan migrasi ini) ──
--   Membandingkan md5(prosrc) badan yang LIVE SEKARANG terhadap md5 badan
--   yang dipakai migrasi ini sebagai basis (dihitung dari schema_snapshot.sql
--   / migrasi terakhir, 1 Nov 2026). Kalau SALAH SATU baris di bawah
--   mismatch=true, BERHENTI -- badan live sudah bergeser lagi sejak basis
--   ini diambil, dan CREATE OR REPLACE di bawah akan diam-diam menimpa
--   perubahan yang belum tercatat (pola drift yang sama dengan temuan
--   cancel_delivery/dispatch_delivery di atas).
--
--   SELECT proname,
--          md5(prosrc) AS md5_live,
--          md5(prosrc) <> expected AS mismatch
--     FROM pg_proc, (VALUES
--       ('set_sp_status',     'd2626e9fcd5839083cf7eb6e644aaaf2'),
--       ('cancel_delivery',   '7d3ce25f47a65f7e8af85027824e6cf8'),
--       ('cancel_picking',    '1d8c4448997f85a63ca7b29e7928e5e4'),
--       ('dispatch_delivery', 'ede9f612f13f498748c42477c2a0ec36')
--     ) AS basis(fn, expected)
--    WHERE pronamespace = 'public'::regnamespace AND proname = basis.fn;
--   -- Diharapkan: 4 baris, mismatch = false di SEMUANYA.
--
-- Depends:   20261101000002/000003 (ACL) -- tidak wajib urutan eksekusi,
--            tapi guard ini jadi SATU-SATUNYA pagar peran selama ACL belum
--            diterapkan (anon/PUBLIC masih bisa memanggil tanpa ACL fix).
-- Status:    BELUM DIJALANKAN -- disiapkan untuk SQL Editor Mas (staging
--            dulu, jalankan checklist tes manual, baru produksi).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer; v_sp_id uuid; v_old_status text; v_company uuid;
BEGIN
  IF p_status NOT IN ('draft','confirmed','cancelled') THEN RAISE EXCEPTION 'invalid sp_status: %', p_status; END IF;
  SELECT company_id INTO v_company FROM public.sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_company IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah status SP ini';
  END IF;
  UPDATE public.sp_items
     SET sp_status=p_status,
         confirmed_at = CASE WHEN p_status='confirmed' THEN now()    ELSE confirmed_at  END,
         confirmed_by = CASE WHEN p_status='confirmed' THEN v_uid    ELSE confirmed_by  END,
         cancelled_at = CASE WHEN p_status='cancelled' THEN now()    ELSE cancelled_at  END,
         cancelled_by = CASE WHEN p_status='cancelled' THEN v_uid    ELSE cancelled_by  END,
         cancel_reason= CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
         updated_at   = now()
   WHERE sp_no = p_sp_no AND customer_id = p_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF p_status = 'cancelled' THEN
    SELECT id, status INTO v_sp_id, v_old_status
      FROM public.sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
    UPDATE public.sp_orders
       SET status='CANCELLED', cancelled_at=now(), cancelled_by=v_uid, cancel_reason=p_reason, updated_at=now()
     WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
    IF FOUND AND v_sp_id IS NOT NULL THEN
      PERFORM public.notify_sp_milestone(v_sp_id, 'CANCELLED', v_old_status, 'CANCELLED');
    END IF;
  ELSE
    IF p_status='confirmed' THEN
      UPDATE public.sp_orders
         SET confirmed_at=COALESCE(confirmed_at,now()), confirmed_by=COALESCE(confirmed_by,v_uid), updated_at=now()
       WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
    END IF;
    PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  END IF;
  RETURN v_count;
END; $$;

COMMENT ON FUNCTION public.set_sp_status(text, text, text, uuid) IS
  'Migrasi 20261101000004: ditambah guard is_super_admin() OR (v_company IN get_user_company_ids() AND (is_manager_or_above() OR has_role(''operations''))) -- sebelumnya NOL pengecekan peran. Sisa logika byte-identik.';


CREATE OR REPLACE FUNCTION public.cancel_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text; v_company uuid;
BEGIN
  SELECT status, customer_id, sp_no, company_id INTO v_status, v_cust, v_sp, v_company FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status='cancelled' THEN RAISE EXCEPTION 'Surat jalan sudah dibatalkan'; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membatalkan surat jalan ini';
  END IF;

  IF v_status IN ('in_transit','delivered') THEN
    INSERT INTO stock_ledger
      (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
    SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'delivery_cancel', reference_id, reference_no, v_uid
    FROM stock_ledger
    WHERE reference_type='delivery' AND reference_id=p_delivery_note_id AND movement_type='outbound';

    WITH agg AS (
      SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
      FROM delivery_note_items dni
      JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
      WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
      GROUP BY pli.sp_item_id
    )
    UPDATE sp_items si SET shipped_qty = GREATEST(si.shipped_qty - agg.qty, 0), updated_at = now()
    FROM agg WHERE si.id = agg.sp_item_id;

    -- ===== BARU: reversal shipped_qty ke sp_order_items (simetris) =====
    WITH agg AS (
      SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
      FROM delivery_note_items dni
      JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
      WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
      GROUP BY pli.sp_item_id
    )
    UPDATE sp_order_items soi SET shipped_qty = GREATEST(soi.shipped_qty - agg.qty, 0), updated_at = now()
    FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id;
  END IF;

  UPDATE delivery_notes SET status='cancelled', cancelled_at=now() WHERE id=p_delivery_note_id;

  IF v_cust IS NOT NULL AND v_sp IS NOT NULL THEN
    PERFORM sp_recompute_status(v_cust, v_sp);
  END IF;
END; $$;

COMMENT ON FUNCTION public.cancel_delivery(uuid) IS
  'Migrasi 20261101000004: ditambah guard is_super_admin() OR (v_company IN get_user_company_ids() AND (is_manager_or_above() OR has_role(''operations''))) -- sebelumnya NOL pengecekan peran. Basis badan = schema_snapshot.sql (memuat blok "reversal shipped_qty ke sp_order_items" yang TIDAK ADA di migrasi 20260707000003 -- lihat header migrasi ini). Sisa logika byte-identik.';


CREATE OR REPLACE FUNCTION public.cancel_picking(p_picking_list_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text; v_company uuid;
BEGIN
  SELECT status, customer_id, sp_no, company_id INTO v_status, v_cust, v_sp, v_company FROM picking_lists WHERE id=p_picking_list_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa dibatalkan (status=%)', v_status; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak membatalkan picking list ini';
  END IF;
  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking' AND reference_id=p_picking_list_id AND movement_type='reserved';
  UPDATE picking_lists SET status='cancelled', cancelled_at=now() WHERE id=p_picking_list_id;
  UPDATE public.sp_orders SET had_cancelled_picking=true, updated_at=now()
    WHERE customer_id=v_cust AND sp_no=v_sp;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;

COMMENT ON FUNCTION public.cancel_picking(uuid) IS
  'Migrasi 20261101000004: ditambah guard is_super_admin() OR (v_company IN get_user_company_ids() AND (is_manager_or_above() OR has_role(''operations''))) -- sebelumnya NOL pengecekan peran. Sisa logika byte-identik (1 baris komentar developer lama hilang sebelum migrasi ini, nol dampak logika -- lihat header migrasi ini).';


CREATE OR REPLACE FUNCTION public.dispatch_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
        v_status text; v_pick uuid; v_wh uuid; v_no text; v_uid uuid := auth.uid();
        v_cust uuid; v_sp text;
BEGIN
  SELECT status, picking_list_id, do_no, customer_id, sp_no
    INTO v_status, v_pick, v_no, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Hanya surat jalan draft yang bisa diberangkatkan (status=%)', v_status; END IF;
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak memberangkatkan surat jalan ini';
  END IF;
  SELECT warehouse_id INTO v_wh FROM picking_lists WHERE id=v_pick;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger
  WHERE reference_type='picking' AND reference_id=v_pick AND movement_type='reserved';

  INSERT INTO stock_ledger
    (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company, v_wh, dni.product_id, 'outbound', -abs(dni.qty), 'delivery', p_delivery_note_id, v_no, v_uid
  FROM delivery_note_items dni
  WHERE dni.delivery_note_id=p_delivery_note_id AND dni.product_id IS NOT NULL AND COALESCE(dni.qty,0) > 0;

  UPDATE delivery_notes SET status='in_transit', dispatched_at=now() WHERE id=p_delivery_note_id;

  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_items si SET shipped_qty = si.shipped_qty + agg.qty, updated_at = now()
  FROM agg WHERE si.id = agg.sp_item_id;

  -- ===== BARU: jembatan shipped_qty ke sp_order_items (kanonik skema baru) =====
  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_order_items soi SET shipped_qty = LEAST(soi.shipped_qty + agg.qty, soi.qty), updated_at = now()
  FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id;

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;

COMMENT ON FUNCTION public.dispatch_delivery(uuid) IS
  'Migrasi 20261101000004: ditambah guard is_super_admin() OR (v_company IN get_user_company_ids() AND (is_manager_or_above() OR has_role(''operations''))) -- sebelumnya NOL pengecekan peran. Basis badan = schema_snapshot.sql (memuat blok "jembatan shipped_qty ke sp_order_items" yang TIDAK ADA di migrasi 20260707000003 -- lihat header migrasi ini). Sisa logika byte-identik.';

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   -- (a) guard benar-benar terpasang di keempat fungsi:
--   SELECT proname,
--          prosrc LIKE '%is_manager_or_above() OR has_role(''operations'')%' AS pakai_guard
--     FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('set_sp_status','cancel_delivery','cancel_picking','dispatch_delivery');
--   -- Diharapkan: 4 baris, pakai_guard = true di semuanya.
--
--   -- (b) smoke test positif (role operations/manager/super_admin TETAP bisa) --
--   -- dan negatif (role lain DITOLAK) -- dijalankan Mas manual sesuai
--   -- checklist tes di laporan sesi, BUKAN di sini (RPC ini memodifikasi data
--   -- nyata, tidak aman untuk uji otomatis self-rollback di produksi).

-- ─── ROLLBACK (badan LAMA persis, verbatim dari schema_snapshot.sql / ─────────
--      migrasi asal 1 Nov 2026 -- lihat basis per fungsi di header atas) ──────
-- CREATE OR REPLACE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid) RETURNS integer
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE v_uid uuid := auth.uid(); v_count integer; v_sp_id uuid; v_old_status text;
-- BEGIN
--   IF p_status NOT IN ('draft','confirmed','cancelled') THEN RAISE EXCEPTION 'invalid sp_status: %', p_status; END IF;
--   UPDATE public.sp_items
--      SET sp_status=p_status,
--          confirmed_at = CASE WHEN p_status='confirmed' THEN now()    ELSE confirmed_at  END,
--          confirmed_by = CASE WHEN p_status='confirmed' THEN v_uid    ELSE confirmed_by  END,
--          cancelled_at = CASE WHEN p_status='cancelled' THEN now()    ELSE cancelled_at  END,
--          cancelled_by = CASE WHEN p_status='cancelled' THEN v_uid    ELSE cancelled_by  END,
--          cancel_reason= CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
--          updated_at   = now()
--    WHERE sp_no = p_sp_no AND customer_id = p_customer_id;
--   GET DIAGNOSTICS v_count = ROW_COUNT;
--   IF p_status = 'cancelled' THEN
--     SELECT id, status INTO v_sp_id, v_old_status
--       FROM public.sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
--     UPDATE public.sp_orders
--        SET status='CANCELLED', cancelled_at=now(), cancelled_by=v_uid, cancel_reason=p_reason, updated_at=now()
--      WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
--     IF FOUND AND v_sp_id IS NOT NULL THEN
--       PERFORM public.notify_sp_milestone(v_sp_id, 'CANCELLED', v_old_status, 'CANCELLED');
--     END IF;
--   ELSE
--     IF p_status='confirmed' THEN
--       UPDATE public.sp_orders
--          SET confirmed_at=COALESCE(confirmed_at,now()), confirmed_by=COALESCE(confirmed_by,v_uid), updated_at=now()
--        WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
--     END IF;
--     PERFORM sp_recompute_status(p_customer_id, p_sp_no);
--   END IF;
--   RETURN v_count;
-- END; $$;
--
-- CREATE OR REPLACE FUNCTION public.cancel_delivery(p_delivery_note_id uuid) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
-- BEGIN
--   SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM delivery_notes WHERE id=p_delivery_note_id;
--   IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
--   IF v_status='cancelled' THEN RAISE EXCEPTION 'Surat jalan sudah dibatalkan'; END IF;
--   IF v_status IN ('in_transit','delivered') THEN
--     INSERT INTO stock_ledger
--       (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
--     SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'delivery_cancel', reference_id, reference_no, v_uid
--     FROM stock_ledger
--     WHERE reference_type='delivery' AND reference_id=p_delivery_note_id AND movement_type='outbound';
--
--     WITH agg AS (
--       SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
--       FROM delivery_note_items dni
--       JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
--       WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
--       GROUP BY pli.sp_item_id
--     )
--     UPDATE sp_items si SET shipped_qty = GREATEST(si.shipped_qty - agg.qty, 0), updated_at = now()
--     FROM agg WHERE si.id = agg.sp_item_id;
--
--     -- ===== BARU: reversal shipped_qty ke sp_order_items (simetris) =====
--     WITH agg AS (
--       SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
--       FROM delivery_note_items dni
--       JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
--       WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
--       GROUP BY pli.sp_item_id
--     )
--     UPDATE sp_order_items soi SET shipped_qty = GREATEST(soi.shipped_qty - agg.qty, 0), updated_at = now()
--     FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id;
--   END IF;
--
--   UPDATE delivery_notes SET status='cancelled', cancelled_at=now() WHERE id=p_delivery_note_id;
--
--   IF v_cust IS NOT NULL AND v_sp IS NOT NULL THEN
--     PERFORM sp_recompute_status(v_cust, v_sp);
--   END IF;
-- END; $$;
--
-- CREATE OR REPLACE FUNCTION public.cancel_picking(p_picking_list_id uuid) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
-- BEGIN
--   SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM picking_lists WHERE id=p_picking_list_id;
--   IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
--   IF v_status NOT IN ('pending','in_progress') THEN
--     RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa dibatalkan (status=%)', v_status; END IF;
--   INSERT INTO stock_ledger
--     (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
--   SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
--   FROM stock_ledger
--   WHERE reference_type='picking' AND reference_id=p_picking_list_id AND movement_type='reserved';
--   UPDATE picking_lists SET status='cancelled', cancelled_at=now() WHERE id=p_picking_list_id;
--   UPDATE public.sp_orders SET had_cancelled_picking=true, updated_at=now()
--     WHERE customer_id=v_cust AND sp_no=v_sp;
--   PERFORM sp_recompute_status(v_cust, v_sp);
-- END; $$;
--
-- CREATE OR REPLACE FUNCTION public.dispatch_delivery(p_delivery_note_id uuid) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
--         v_status text; v_pick uuid; v_wh uuid; v_no text; v_uid uuid := auth.uid();
--         v_cust uuid; v_sp text;
-- BEGIN
--   SELECT status, picking_list_id, do_no, customer_id, sp_no
--     INTO v_status, v_pick, v_no, v_cust, v_sp
--     FROM delivery_notes WHERE id=p_delivery_note_id;
--   IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
--   IF v_status <> 'draft' THEN RAISE EXCEPTION 'Hanya surat jalan draft yang bisa diberangkatkan (status=%)', v_status; END IF;
--   SELECT warehouse_id INTO v_wh FROM picking_lists WHERE id=v_pick;
--   v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');
--
--   INSERT INTO stock_ledger
--     (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
--   SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
--   FROM stock_ledger
--   WHERE reference_type='picking' AND reference_id=v_pick AND movement_type='reserved';
--
--   INSERT INTO stock_ledger
--     (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
--   SELECT v_company, v_wh, dni.product_id, 'outbound', -abs(dni.qty), 'delivery', p_delivery_note_id, v_no, v_uid
--   FROM delivery_note_items dni
--   WHERE dni.delivery_note_id=p_delivery_note_id AND dni.product_id IS NOT NULL AND COALESCE(dni.qty,0) > 0;
--
--   UPDATE delivery_notes SET status='in_transit', dispatched_at=now() WHERE id=p_delivery_note_id;
--
--   WITH agg AS (
--     SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
--     FROM delivery_note_items dni
--     JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
--     WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
--     GROUP BY pli.sp_item_id
--   )
--   UPDATE sp_items si SET shipped_qty = si.shipped_qty + agg.qty, updated_at = now()
--   FROM agg WHERE si.id = agg.sp_item_id;
--
--   -- ===== BARU: jembatan shipped_qty ke sp_order_items (kanonik skema baru) =====
--   WITH agg AS (
--     SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
--     FROM delivery_note_items dni
--     JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
--     WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
--     GROUP BY pli.sp_item_id
--   )
--   UPDATE sp_order_items soi SET shipped_qty = LEAST(soi.shipped_qty + agg.qty, soi.qty), updated_at = now()
--   FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id;
--
--   PERFORM sp_recompute_status(v_cust, v_sp);
-- END; $$;
-- =============================================================================
