-- =============================================================================
-- Migration: 20260902000002_sp_item_delete_dual
-- Phase:     FASE 0 — tutup DUA lubang pada HAPUS satu baris item SP.
-- Depends:   20260902000001 (is_sp_item_writer) · get_user_company_ids()
--            · is_super_admin() · sp_recompute_status()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- =============================================================================
-- LUBANG 1 — OTORISASI (CRITICAL)
-- =============================================================================
--   Tombol Hapus di tab Items (SalesOrderDetailPage.jsx:2198-2206) TIDAK
--   DIGATE SAMA SEKALI — berbeda dari tombol Edit tepat di sebelahnya yang
--   dibungkus canWarehouseOps. Jalur tulisnya deleteSpItem() (db.js:336) =
--   .delete() PostgREST langsung, dan RLS-nya:
--       CREATE POLICY sp_items_delete ... FOR DELETE TO authenticated USING (true)
--   Dikonfirmasi Den 2 Sep 2026: `authenticated` MEMANG punya GRANT DELETE.
--   Hasilnya: SETIAP user yang bisa login (sales, viewer, hrga, finance, it)
--   bisa menghapus baris item SP mana pun. Melanggar AGENTS.md rule #13
--   ("Do not hard-delete business data") sekaligus rule #14.
--
-- =============================================================================
-- LUBANG 2 — ORPHAN yang MERUSAK INVOICE PERMANEN (CRITICAL)
-- =============================================================================
--   deleteSpItem() hanya menghapus sp_items. Kembarannya di sp_order_items
--   TERTINGGAL, karena legacy_sp_item_id TIDAK punya foreign key (FK yang ada
--   di tabel itu cuma company_id, product_id, sp_order_id).
--
--   create_invoice menghitung guard terkirim-penuh dari sp_order_items:
--       SELECT SUM(qty), SUM(shipped_qty) FROM sp_order_items WHERE sp_order_id = ...
--       IF v_shipped <> v_ordered THEN RAISE EXCEPTION 'SP belum terkirim penuh'
--   Baris hantu itu menyumbang qty yang TAK AKAN PERNAH punya shipped_qty,
--   sehingga Sigma-shipped = Sigma-qty menjadi MUSTAHIL tercapai
--   -> SP tersebut TIDAK BISA DIINVOICE SELAMANYA, tanpa pesan yang menjelaskan.
--
--   Dikonfirmasi Den 2 Sep 2026: query orphan mengembalikan 0 baris, jadi
--   belum ada korban warisan. Migrasi ini menutup jalurnya sebelum ada.
--
-- =============================================================================
-- TETAP HARD DELETE — soft delete DITUNDA, bukan dilupakan
-- =============================================================================
--   sp_items belum punya kolom deleted_at, dan NOL konsumennya memfilter
--   kolom itu. Menambahkannya menuntut penyisiran serentak atas ~7 titik
--   query FE (db.js:294/303/313/329/337/384/470) DAN ~15 titik di fungsi DB
--   (cancel_delivery, delete_sp_dual, dispatch_delivery,
--   generate_delivery_from_picking, generate_picking_from_sp x3,
--   get_storbit_dashboard_stats, get_storbit_sp_drilldown,
--   indomarco_dashboard_stats, set_sp_expired_date x2, sp_recompute_status x3,
--   update_sp_item_dual). Melewatkan satu saja = baris "terhapus" muncul lagi
--   di dashboard/picking/invoice. Terlalu besar untuk fase prasyarat.
--   Dijadwalkan ke M13, bersama drop exp_date & btb_no_deprecated.
--
--   Preseden hard-delete dual-table sudah ada: delete_sp_dual() menghapus
--   sp_orders (+sp_order_items via CASCADE) DAN sp_items. Fungsi di bawah
--   adalah versi satu-baris dari pola yang sama.
--
-- GUARD STATUS (penambahan yang TIDAK diminta eksplisit — lihat catatan Den):
--   Hanya SP yang belum bergerak yang boleh kehilangan baris. Setelah picking
--   atau surat jalan terbit, qty sudah jadi dasar dokumen fisik & reservasi
--   stok; menghapusnya membuat dokumen cetak dan stok ledger berbohong.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_sp_item_dual(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid; v_status text; v_cust uuid; v_sp text;
BEGIN
  -- Header = sumber identitas, company, DAN status. Pola identik sp_issue_btb
  -- / update_sp_item_dual (sesudah fix 20260825000001).
  SELECT o.company_id, o.status, si.customer_id, si.sp_no
    INTO v_company, v_status, v_cust, v_sp
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
          AND is_sp_item_writer())) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus item SP ini';
  END IF;

  IF v_status NOT IN ('DRAFT','CONFIRMED','MENUNGGU_STOK') THEN
    RAISE EXCEPTION 'SP sudah berjalan (status %) — baris item tidak bisa dihapus.', v_status;
  END IF;

  IF (SELECT count(*) FROM sp_items
       WHERE customer_id = v_cust AND sp_no = v_sp) <= 1 THEN
    RAISE EXCEPTION 'Ini baris terakhir SP — hapus SP-nya lewat Danger Zone, bukan per item.';
  END IF;

  -- Kembaran DULU, baru induknya. Urutan ini bukan kosmetik: kalau sp_items
  -- dihapus lebih dulu lalu statement kedua gagal, kita kembali persis ke
  -- LUBANG 2. Satu fungsi = satu transaksi = keduanya hilang atau tak satu pun.
  DELETE FROM sp_order_items WHERE legacy_sp_item_id = p_id;
  DELETE FROM sp_items       WHERE id = p_id;

  -- qty total SP berubah -> mesin status 12-tahap bisa bergeser (mis. SP yang
  -- outstanding-nya jadi 0 setelah baris sisanya dihapus). Pola sama
  -- sp_delete_btb / set_sp_status.
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;

ALTER FUNCTION public.delete_sp_item_dual(uuid) OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.delete_sp_item_dual(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_sp_item_dual(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_sp_item_dual(uuid) IS
  'Satu-satunya jalur sah menghapus SATU baris item SP. Menghapus sp_items DAN '
  'kembarannya di sp_order_items (legacy_sp_item_id TANPA FK) dalam satu '
  'transaksi — mencegah baris hantu yang membuat guard Sigma-shipped=Sigma-qty '
  'create_invoice mustahil terpenuhi. Hapus SP UTUH pakai delete_sp_dual().';

-- ─────────────────────────────────────────────────────────────────────────────
-- Tutup jalur DELETE langsung lewat PostgREST
--
-- delete_sp_item_dual() dan delete_sp_dual() keduanya SECURITY DEFINER
-- (berjalan sebagai owner), jadi TIDAK terpengaruh REVOKE ini.
-- ⚠️ Sesudah REVOKE ini, db.js deleteSpItem() versi LAMA (.delete() langsung)
--    akan gagal. FE penggantinya sudah di-commit di branch
--    feat/edit-item-inline-redesign dan HARUS di-deploy sesudah migrasi ini.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE DELETE ON public.sp_items FROM authenticated;

DROP POLICY IF EXISTS sp_items_delete ON public.sp_items;
CREATE POLICY sp_items_delete ON public.sp_items FOR DELETE TO authenticated
  USING (is_super_admin() OR is_sp_item_writer());
-- Defense-in-depth: REVOKE di atas sudah menutup jalurnya. Policy ini
-- mendokumentasikan niatnya DAN tetap menahan kalau GRANT kelak dilonggarkan
-- lagi tanpa sengaja. Sengaja TIDAK memakai USING(true) lagi.

-- ─── VERIFIKASI (jalankan TERPISAH sesudahnya) ───────────────────────────────
--   -- a. GRANT sudah tercabut (kolom 'D' HARUS hilang dari baris authenticated):
--   \dp public.sp_items
--   --    atau:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'sp_items' AND privilege_type = 'DELETE';
--
--   -- b. Policy terpasang benar:
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy WHERE polrelid = 'public.sp_items'::regclass AND polcmd = 'd';
--
--   -- c. ACL fungsi (authenticated saja, nol anon/public):
--   SELECT proname, proacl FROM pg_proc WHERE proname = 'delete_sp_item_dual';
--
--   -- d. NOL orphan (dikonfirmasi 0 sebelum migrasi — HARUS tetap 0 sesudahnya):
--   SELECT count(*) FROM sp_order_items soi
--    WHERE soi.legacy_sp_item_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM sp_items si WHERE si.id = soi.legacy_sp_item_id);
--
--   -- e. Uji hidup + rollback. Ganti <ITEM_ID> dgn item milik SP ber-status
--   --    DRAFT/CONFIRMED/MENUNGGU_STOK yang punya >= 2 baris.
--   BEGIN;
--     SELECT count(*) FROM sp_items       WHERE id = '<ITEM_ID>';                  -- 1
--     SELECT count(*) FROM sp_order_items WHERE legacy_sp_item_id = '<ITEM_ID>';   -- 1
--     SELECT public.delete_sp_item_dual('<ITEM_ID>'::uuid);
--     SELECT count(*) FROM sp_items       WHERE id = '<ITEM_ID>';                  -- HARUS 0
--     SELECT count(*) FROM sp_order_items WHERE legacy_sp_item_id = '<ITEM_ID>';   -- HARUS 0
--   ROLLBACK;
--
--   -- f. Guard status HARUS menolak SP yang sudah berjalan:
--   BEGIN;
--     SELECT public.delete_sp_item_dual('<ITEM_ID_SP_BTB_TERBIT>'::uuid);
--     -- HARUS: 'SP sudah berjalan (status BTB_TERBIT) — baris item tidak bisa dihapus.'
--   ROLLBACK;
--
--   -- g. Guard baris terakhir HARUS menolak:
--   BEGIN;
--     SELECT public.delete_sp_item_dual('<ITEM_ID_SP_SATU_BARIS>'::uuid);
--     -- HARUS: 'Ini baris terakhir SP — hapus SP-nya lewat Danger Zone, bukan per item.'
--   ROLLBACK;
--
--   -- h. Guard otorisasi: impersonasi user 'sales' / 'finance' / 'gm_bd'
--   --    HARUS gagal 'Tidak berhak menghapus item SP ini'.
--
--   -- i. DELETE langsung lewat PostgREST HARUS ditolak (uji dari browser,
--   --    bukan SQL Editor — auth.uid() NULL di SQL Editor).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   GRANT DELETE ON public.sp_items TO authenticated;
--   DROP POLICY IF EXISTS sp_items_delete ON public.sp_items;
--   CREATE POLICY sp_items_delete ON public.sp_items
--     FOR DELETE TO authenticated USING (true);
--   DROP FUNCTION IF EXISTS public.delete_sp_item_dual(uuid);
--   ⚠️ Rollback ini MENGEMBALIKAN kedua lubang CRITICAL di atas. Lakukan hanya
--      kalau FE lama (deleteSpItem versi .delete()) terlanjur ter-deploy dan
--      perlu tetap hidup sementara.
