-- =============================================================================
-- Migration: 20260825000001_fix_update_sp_item_dual_company
-- Phase:     (1) Hotfix — update_sp_item_dual merujuk kolom yang TIDAK ADA.
--            (2) Konsolidasi expired_date ke level SP/header (Opsi B).
-- Depends:   20260821000009_update_sp_item_dual_guard (migrasi yang memasukkan
--            bug #1) · sp_orders (FASE 0) · get_user_company_ids()
--            · is_manager_or_above() · has_role() · is_super_admin()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- ⚠️ SATU CREATE OR REPLACE, DUA PERBAIKAN — DISENGAJA.
--    Keduanya menyentuh fungsi yang sama. Memecahnya jadi dua file =
--    dua CREATE OR REPLACE berurutan atas fungsi yang sama, dengan file kedua
--    harus menyalin ulang badan file pertama. Itu persis kelas hazard urutan
--    yang sudah diperingatkan proyek ini sendiri di header
--    20260821000007_picking_guards.sql:5-13 ("kalau file ini dijalankan lebih
--    dulu ... TIDAK BOLEH dijalankan sesudahnya"). Digabung supaya tidak ada
--    urutan yang bisa salah.
--
-- =============================================================================
-- PERBAIKAN 1 — SUMBER company_id (BUG LIVE, BLOCKING)
-- =============================================================================
--   Guard otorisasi yang ditambahkan 21 Agu 2026 mengambil company dari
--   `sp_items.company_id`. Kolom itu TIDAK PERNAH ADA di sp_items (39 kolom;
--   yang ada `customer_id` — lihat schema_snapshot.sql:7318-7358). Akibatnya
--   SETIAP pemanggilan RPC ini gagal dengan
--       ERROR: column si.company_id does not exist
--   -> Edit Item SP (EditItemModal), ShipmentModal, dan FinanceModal RUSAK
--   TOTAL sejak migrasi itu dijalankan.
--
--   Lolos review karena pg_dump menyetel check_function_bodies = false dan
--   PL/pgSQL tidak me-resolve nama kolom saat CREATE FUNCTION — errornya baru
--   muncul saat dieksekusi. Konsisten dengan catatan "NOL tes runtime" pada
--   Gelombang 1.5 di CLAUDE.md.
--
--   FIX: sumber company dipindah ke `sp_orders`, lewat komposit
--   (customer_id, sp_no) milik baris sp_items yang bersangkutan. Ini POLA YANG
--   SUDAH DIPAKAI di migrasi kembarannya 20260821000006_btb_guards.sql:35-37
--   (sp_issue_btb) — bukan pola baru.
--
--   Fallback ke accounts.company_id SENGAJA TIDAK dipakai: kalau baris
--   sp_orders tak ada, RPC harus MENOLAK, bukan menebak (keputusan Den,
--   sejalan dengan sp_issue_btb). Baris seperti itu adalah jejak dual-write
--   yang gagal saat create dan perlu direkonsiliasi, bukan diakomodasi.
--
-- =============================================================================
-- PERBAIKAN 2 — expired_date DIKELUARKAN dari daftar UPDATE (Opsi B)
-- =============================================================================
--   expired_date = tenggat SP harus DIKIRIM (risiko pinalti dari customer) —
--   secara konsep atribut HEADER, bukan item. Skema kanonik baru sudah
--   memutuskan itu: sp_orders punya kolomnya, sp_order_items TIDAK
--   (DESIGN_SP_SCHEMA.md:106 "twin exp_date DIHAPUS", :119 kolom deprecated).
--
--   RPC ini memakai jsonb_populate_record + UPDATE SELURUH kolom, sehingga
--   field apa pun yang absen dari payload tertulis NULL. Selama expired_date
--   masih ada di daftar UPDATE, SETIAP simpan dari TIGA titik UI
--   (EditItemModal, ShipmentModal App.jsx:4049, FinanceModal App.jsx:4050)
--   bisa menggeser atau meng-NULL-kan tenggat SP secara senyap — dan
--   kolom itulah yang dibaca badge Overdue (spCalc.js:34), kolom Expired
--   SP Manifest (SalesOrderPage.jsx:689), kartu Detail SP, serta kedua RPC
--   dashboard Storbit (MIN(si.expired_date)).
--
--   Mengeluarkannya dari daftar UPDATE membuat kolom itu MUSTAHIL ditulis
--   lewat jalur item — proteksi struktural di level DB, bukan kesepakatan di
--   level FE yang bisa hilang saat refactor berikutnya. Penulis sahnya tinggal
--   dua: INSERT saat create SP, dan set_sp_expired_date (file 20260825000002).
--
--   ⚠️ exp_date SENGAJA TETAP DI DAFTAR UPDATE. Kolom itu isu terpisah
--      (dead column, dijadwalkan drop di M13, DESIGN_SP_SCHEMA.md:419) dan
--      DI LUAR SCOPE pekerjaan ini. HANYA expired_date yang dikeluarkan.
--
-- SUMBER BODY: schema_snapshot.sql:3145-3178. Perubahan = 1 statement SELECT
--   (sumber company), pesan error, dan 1 kolom dihapus dari daftar SET.
--   Seluruh sisanya VERBATIM.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_sp_item_dual(p_id uuid, p_item jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_rec sp_items%ROWTYPE; v_company uuid;
BEGIN
  v_rec := jsonb_populate_record(null::sp_items, p_item);

  -- FIX 25 Agu 2026 (1/2): company diambil dari sp_orders (header), BUKAN
  -- sp_items.company_id yang tidak pernah ada. Pola = sp_issue_btb.
  SELECT o.company_id INTO v_company
    FROM sp_items si
    JOIN sp_orders o
      ON o.customer_id = si.customer_id
     AND o.sp_no       = si.sp_no
     AND o.deleted_at IS NULL
   WHERE si.id = p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Item SP tidak ditemukan, atau SP induknya belum ada di sp_orders.';
  END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah item SP ini';
  END IF;

  -- FIX 25 Agu 2026 (2/2): expired_date TIDAK ADA di daftar SET ini — sengaja.
  -- Tenggat SP adalah atribut HEADER; satu-satunya penulis sahnya adalah
  -- set_sp_expired_date(). JANGAN dikembalikan ke sini: itu membuka lagi
  -- jalur senyap yang bisa menggeser/meng-NULL-kan tenggat dari tiga modal
  -- item. exp_date DIPERTAHANKAN (isu terpisah, milik M13).
  UPDATE sp_items SET
    sp_date = v_rec.sp_date, sp_no = v_rec.sp_no, customer_id = v_rec.customer_id,
    product_id = v_rec.product_id, product_name = v_rec.product_name, sku = v_rec.sku,
    qty = v_rec.qty, shipped_qty = v_rec.shipped_qty,
    exp_date = v_rec.exp_date, dc = v_rec.dc,
    shipping_date = v_rec.shipping_date, sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date, arrival_date = v_rec.arrival_date,
    unit_price = v_rec.unit_price, shipping_price = v_rec.shipping_price,
    inv = v_rec.inv, fp = v_rec.fp, submit = v_rec.submit, kirim = v_rec.kirim,
    submit_date = v_rec.submit_date, email_status = v_rec.email_status, notes = v_rec.notes,
    updated_at = now()
  WHERE id = p_id;

  UPDATE sp_order_items SET
    qty = v_rec.qty,
    sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date,
    shipping_price = v_rec.shipping_price,
    notes = v_rec.notes,
    updated_at = now()
  WHERE legacy_sp_item_id = p_id;
END; $$;

-- ─── VERIFIKASI (jalankan TERPISAH sesudahnya) ───────────────────────────────
--   -- a. Kedua perbaikan masuk, exp_date TIDAK ikut terbuang:
--   SELECT
--     pg_get_functiondef(f) LIKE '%si.company_id%'              AS masih_bug_1,   -- HARUS false
--     pg_get_functiondef(f) LIKE '%expired_date = v_rec%'       AS masih_bug_2,   -- HARUS false
--     pg_get_functiondef(f) LIKE '%exp_date = v_rec.exp_date%'  AS exp_date_utuh  -- HARUS true
--   FROM (SELECT 'public.update_sp_item_dual(uuid,jsonb)'::regprocedure AS f) t;
--
--   -- b. Uji hidup, dibungkus ROLLBACK (nol efek permanen).
--   --    Ganti <ITEM_ID> dengan id sp_items yang SP induknya ada di sp_orders.
--   BEGIN;
--     SELECT set_config('request.jwt.claims',
--            json_build_object('sub', (SELECT id::text FROM profiles
--                                       WHERE email = '<email-super-admin>' LIMIT 1),
--                              'role','authenticated')::text, true);
--     SET LOCAL ROLE authenticated;
--     SELECT expired_date AS sebelum FROM sp_items WHERE id = '<ITEM_ID>';
--     -- kirim payload dgn expired_date SENGAJA NULL -> HARUS diabaikan:
--     SELECT public.update_sp_item_dual(
--       '<ITEM_ID>'::uuid,
--       (SELECT to_jsonb(si) - 'expired_date' FROM sp_items si WHERE si.id = '<ITEM_ID>')
--     );
--     SELECT expired_date AS sesudah FROM sp_items WHERE id = '<ITEM_ID>';
--     -- sebelum == sesudah, dan TIDAK NULL. Sebelum fix: ERROR si.company_id.
--   ROLLBACK;
--
--   -- c. Guard menolak role tak berhak (impersonasi user ber-role 'sales'):
--   --    HARUS gagal 'Tidak berhak mengubah item SP ini'.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   Kembalikan badan fungsi persis seperti schema_snapshot.sql:3145-3178.
--   ⚠️ Rollback mengembalikan RPC ke kondisi RUSAK TOTAL (perbaikan 1) sekaligus
--      membuka lagi jalur tulis expired_date dari item (perbaikan 2). Lakukan
--      hanya kalau perbaikan ini terbukti menimbulkan masalah yang lebih besar.
