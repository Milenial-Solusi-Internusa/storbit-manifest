-- =============================================================================
-- Migration: 20260825000002_set_sp_expired_date
-- Phase:     Konsolidasi expired_date jadi atribut level SP/header.
--            Menutup TD-201 (sp_orders.expired_date tak pernah di-update
--            setelah create, sementara SELURUH UI membaca versi item).
-- Depends:   20260825000001 (WAJIB LEBIH DULU — lihat di bawah) · sp_orders
--            (FASE 0) · get_user_company_ids() · is_manager_or_above()
--            · has_role() · is_super_admin()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- ⚠️ URUTAN: jalankan SETELAH 20260825000001. File itu yang mengeluarkan
--    expired_date dari daftar UPDATE update_sp_item_dual; kalau file ini jalan
--    lebih dulu, ada jendela waktu di mana DUA penulis expired_date aktif
--    bersamaan (RPC ini + jalur item) — persis divergensi yang sedang
--    dihilangkan. File ini TIDAK menyentuh update_sp_item_dual sama sekali.
--
-- KENAPA RPC, BUKAN DUA UPDATE DARI FE
--   Tenggat harus tertulis di DUA tempat sekaligus:
--     - sp_orders.expired_date  -> sumber kebenaran kanonik (skema baru)
--     - sp_items.expired_date   -> yang SEBENARNYA dibaca semua konsumen hari
--                                  ini (badge Overdue spCalc.js:34, kolom
--                                  Expired SalesOrderPage.jsx:689, kartu
--                                  Detail SP, RPC dashboard Storbit)
--   Dua UPDATE dari FE bisa sukses separuh: RLS sp_items_update = USING(true)
--   (lolos siapa pun) sementara sp_orders_update role-gated. Hasilnya item
--   berubah tapi header tidak. Satu fungsi = satu transaksi = mustahil separuh.
--
-- FREEZE: HANYA 'CANCELLED' (keputusan Den, 25 Agu 2026).
--   SP berstatus LUNAS SENGAJA TETAP BOLEH dikoreksi tenggatnya — dibutuhkan
--   untuk audit pinalti historis (mis. merekonsiliasi klausa PKS terhadap
--   tanggal berangkat nyata setelah pembayaran selesai). Ini PENYIMPANGAN
--   DISENGAJA dari daftar freeze sp_recompute_status yang memakai
--   ('CANCELLED','LUNAS') — jangan "diseragamkan" tanpa membaca alasan ini.
--   Tenggat bukan status: mengoreksinya tidak menggerakkan mesin status
--   satu tahap pun.
--
-- YANG SENGAJA TIDAK DILAKUKAN
--   - TIDAK memanggil sp_recompute_status: mesin status 12-tahap sama sekali
--     tidak membaca expired_date (dicek: hanya membaca sp_status,
--     picking_lists, delivery_notes, sp_btb, sp_invoices). Memanggilnya =
--     kerja sia-sia + risiko efek samping.
--   - TIDAK menyentuh sp_order_items: kolomnya memang tidak ada di sana, dan
--     itu keputusan desain yang benar (DESIGN_SP_SCHEMA.md:106).
--   - TIDAK mem-backfill/menormalkan data lama: sudah dikonfirmasi ke data
--     produksi (481 SP) bahwa NOL SP punya expired_date beda antar item.
--   - TIDAK menulis audit log: nol RPC Storbit lain yang beraudit hari ini,
--     menambahkannya di sini jadi preseden tunggal. Dicatat sebagai
--     follow-up, bukan bagian plan ini.
--
-- ACL: pola FASE 5 (REVOKE FROM PUBLIC + GRANT authenticated, NOL anon).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_sp_expired_date(
  p_customer_id  uuid,
  p_sp_no        text,
  p_expired_date date
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sp_order_id uuid; v_company uuid; v_status text;
BEGIN
  IF p_expired_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal expired wajib diisi.';
  END IF;

  -- Header = sumber identitas & company. Pola identik sp_issue_btb.
  SELECT id, company_id, status
    INTO v_sp_order_id, v_company, v_status
    FROM sp_orders
   WHERE customer_id = p_customer_id
     AND sp_no       = p_sp_no
     AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no;
  END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (is_manager_or_above() OR has_role('operations')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah tenggat SP ini';
  END IF;

  -- Freeze HANYA CANCELLED — lihat blok FREEZE di header file ini.
  -- LUNAS sengaja TIDAK termasuk (koreksi audit pinalti historis).
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'SP sudah dibatalkan — tenggat tidak bisa diubah.';
  END IF;

  UPDATE sp_orders
     SET expired_date = p_expired_date, updated_at = now()
   WHERE id = v_sp_order_id;

  -- Seluruh baris item se-SP disamakan. Inilah yang menghilangkan divergensi
  -- secara struktural: digabung dengan 20260825000001 (expired_date keluar
  -- dari update_sp_item_dual), tak ada lagi jalan menulis nilai berbeda
  -- per item lewat aplikasi.
  UPDATE sp_items
     SET expired_date = p_expired_date, updated_at = now()
   WHERE customer_id = p_customer_id
     AND sp_no       = p_sp_no;
END; $$;

ALTER FUNCTION public.set_sp_expired_date(uuid, text, date) OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.set_sp_expired_date(uuid, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_sp_expired_date(uuid, text, date) TO authenticated;

-- ─── VERIFIKASI (jalankan TERPISAH sesudahnya) ───────────────────────────────
--   -- a. ACL benar (authenticated saja, nol anon/public):
--   SELECT proname, proacl FROM pg_proc WHERE proname = 'set_sp_expired_date';
--
--   -- b. Uji hidup + rollback. Ganti <CUST>/<SPNO>.
--   BEGIN;
--     SELECT expired_date FROM sp_orders WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--     SELECT DISTINCT expired_date FROM sp_items
--      WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--     SELECT public.set_sp_expired_date('<CUST>'::uuid, '<SPNO>', DATE '2026-12-31');
--     SELECT expired_date FROM sp_orders WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--     -- HARUS 2026-12-31, dan sp_items HARUS mengembalikan TEPAT 1 baris:
--     SELECT DISTINCT expired_date FROM sp_items
--      WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--   ROLLBACK;
--
--   -- c. Freeze: SP CANCELLED HARUS ditolak; SP LUNAS HARUS LOLOS.
--   BEGIN;
--     SELECT public.set_sp_expired_date('<CUST_CANCELLED>'::uuid, '<SPNO>', DATE '2026-12-31');
--     -- HARUS: 'SP sudah dibatalkan — tenggat tidak bisa diubah.'
--   ROLLBACK;
--   BEGIN;
--     SELECT public.set_sp_expired_date('<CUST_LUNAS>'::uuid, '<SPNO>', DATE '2026-01-01');
--     -- HARUS SUKSES (tanggal mundur pun boleh — tak ada guard min).
--   ROLLBACK;
--
--   -- d. Guard otorisasi menolak role tak berhak (impersonasi 'sales'):
--   --    HARUS gagal 'Tidak berhak mengubah tenggat SP ini'.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.set_sp_expired_date(uuid, text, date);
--   ⚠️ Setelah 20260825000001 jalan, men-DROP fungsi ini membuat expired_date
--      TIDAK BISA DIUBAH SAMA SEKALI lewat aplikasi (jalur item sudah ditutup).
--      Kalau perlu rollback penuh, rollback 20260825000001 juga.
