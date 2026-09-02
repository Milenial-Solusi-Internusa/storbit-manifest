-- =============================================================================
-- Migration: 20260902000001_sp_item_writer_guard
-- Phase:     FASE 0 — persempit izin TULIS item SP.
--            Keputusan Den 2 Sep 2026: ceo/gm/gm_bd turun jadi VIEW-ONLY untuk
--            edit item SP. Manager & Operations TETAP full CRUD. Super Admin
--            tidak berubah.
-- Depends:   20260825000001 (badan update_sp_item_dual yang berlaku sekarang)
--            · get_user_company_ids() · is_super_admin()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- ⚠️ is_manager_or_above() SENGAJA TIDAK DISENTUH. Fungsi itu dipakai gate lain
--    di luar Logistics (approval HRGA, BNF, create_invoice, mark_ttf_received)
--    yang memang berhak memuat ceo/gm/gm_bd. Mengubahnya = blast radius lintas
--    modul yang tidak diminta. Sebagai gantinya dibuat is_sp_item_writer()
--    yang HANYA dipakai di konteks tulis item SP.
--
-- DASAR MATRIX (04_ROLE_PERMISSION_MATRIX.md baris "Logistics"):
--    ceo = R (read-only)  ->  selama ini BISA menulis lewat is_manager_or_above()
--    gm_bd = tanpa akses Logistics "by design" (catatan baris 62)
--                         ->  selama ini BISA menulis lewat is_manager_or_above()
--    Migrasi ini menutup kedua divergensi itu.
--
-- CAKUPAN NYATA (sensus user_roles aktif, 2 Sep 2026):
--    ceo 0 user · gm 0 user · admin 0 user · gm_bd 1 user
--    -> hanya 1 user yang benar-benar kehilangan izin tulis.
--
-- 'supervisor' SENGAJA TIDAK DIMASUKKAN: role itu TIDAK ADA di tabel roles
--    (14 kode: super_admin, admin, ceo, gm, gm_bd, manager, operations,
--    finance, finance_controller, procurement, sales, hrga, it, viewer) —
--    lihat TD-106. Memasukkannya berarti siapa pun yang kelak membuat role
--    bernama 'supervisor' langsung dapat izin tulis tanpa keputusan baru.
--
-- YANG SENGAJA TIDAK DILAKUKAN
--    - TIDAK menyentuh sp_orders_update / sp_order_items_update (keduanya
--      masih is_manager_or_above()). Keputusan Den hanya menyebut EDIT ITEM SP.
--      Menyeragamkannya sekarang = memperluas scope tanpa diminta.
--    - TIDAK menyentuh guard finance (create_invoice / record_payment /
--      mark_ttf_received) — beda modul, beda baris matrix.
--    - TIDAK menyentuh is_manager_or_above(), is_admin_or_above(), has_role().
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_sp_item_writer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','manager','operations')
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$$;

ALTER FUNCTION public.is_sp_item_writer() OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.is_sp_item_writer() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_sp_item_writer() TO authenticated;

COMMENT ON FUNCTION public.is_sp_item_writer() IS
  'Izin TULIS baris item SP (sp_items/sp_order_items). Sengaja TIDAK memakai '
  'is_manager_or_above(): ceo/gm/gm_bd VIEW-ONLY di konteks ini (keputusan Den '
  '2 Sep 2026, sejalan 04_ROLE_PERMISSION_MATRIX baris Logistics: ceo=R, '
  'gm_bd=tanpa akses). Jangan tambah role tanpa memperbarui matrix itu juga.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Guard update_sp_item_dual: is_manager_or_above() -> is_sp_item_writer()
--
-- Badan fungsi disalin UTUH dari schema_snapshot.sql (hasil 20260825000001).
-- SATU-SATUNYA perubahan ada di baris IF NOT (...) di bawah. Daftar SET
-- dipertahankan apa adanya — pencabutan 6 kolom finance adalah FASE 1
-- (migrasi 20260902000005), bukan file ini.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_sp_item_dual(p_id uuid, p_item jsonb)
  RETURNS void
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

  -- DIUBAH 2 Sep 2026: is_manager_or_above() OR has_role('operations')
  --                 -> is_sp_item_writer()
  -- ceo/gm/gm_bd tak lagi lolos. JANGAN dikembalikan ke is_manager_or_above()
  -- tanpa mencabut keputusan Den 2 Sep 2026 lebih dulu.
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND is_sp_item_writer())) THEN
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
--   -- a. ACL benar (authenticated saja, nol anon/public):
--   SELECT proname, proacl FROM pg_proc WHERE proname = 'is_sp_item_writer';
--
--   -- b. Fungsi mengembalikan nilai yang benar untuk user yang sedang login:
--   SELECT public.is_sp_item_writer();
--   --    manager / operations / admin / super_admin -> HARUS true
--   --    gm_bd / ceo / gm / sales / finance          -> HARUS false
--
--   -- c. Daftar user yang KEHILANGAN izin akibat migrasi ini (harus cocok
--   --    dengan ekspektasi: 0 ceo, 0 gm, 1 gm_bd, 0 admin):
--   SELECT p.email, r.code
--     FROM user_roles ur
--     JOIN roles r    ON r.id = ur.role_id
--     JOIN profiles p ON p.id = ur.user_id
--    WHERE ur.is_active = true
--      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--      AND r.code IN ('ceo','gm','gm_bd')
--      AND NOT EXISTS (
--            SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
--             WHERE ur2.user_id = ur.user_id AND ur2.is_active = true
--               AND r2.code IN ('super_admin','admin','manager','operations'));
--
--   -- d. Uji hidup Edit Item (bungkus ROLLBACK). Ganti <ITEM_ID>.
--   --    Login sbg manager -> HARUS sukses. Login sbg gm_bd -> HARUS gagal
--   --    'Tidak berhak mengubah item SP ini'.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   Jalankan ulang CREATE OR REPLACE update_sp_item_dual di atas dengan baris
--   guard dikembalikan menjadi:
--       AND (is_manager_or_above() OR has_role('operations'))
--   lalu:  DROP FUNCTION IF EXISTS public.is_sp_item_writer();
--   ⚠️ DROP fungsi itu HARUS sesudah guard dikembalikan — kalau tidak,
--      update_sp_item_dual dan sp_items_delete (20260902000002) langsung rusak.
