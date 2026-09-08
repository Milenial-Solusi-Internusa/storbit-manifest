-- =============================================================================
-- Migration: 20260902000005_trim_update_sp_item_dual
-- Phase:     FASE 1 (3/3) — cabut keenam kolom dokumen finance dari daftar SET
--            update_sp_item_dual, supaya set_sp_finance_docs() jadi SATU-
--            SATUNYA penulisnya.
-- Depends:   20260902000001 (guard is_sp_item_writer, badan yang berlaku)
--            · 20260902000003 (kolom header) · 20260902000004 (RPC pengganti)
-- Status:    BELUM DIJALANKAN.
--
-- =============================================================================
-- 🛑 JANGAN JALANKAN SEKARANG — INI FILE TERAKHIR, DAN URUTANNYA MENGIKAT
-- =============================================================================
--   PRASYARAT MUTLAK: FE Fase 1 HARUS SUDAH LIVE DI PRODUKSI lebih dulu.
--
--   Selama FE lama masih mengirim keenam kolom itu lewat EditItemModal /
--   ShipmentModal / FinanceModal, mencabutnya dari daftar SET membuat toggle
--   GAGAL SENYAP: UI bilang tersimpan, DB mengabaikannya. Itu lebih buruk
--   daripada keadaan hari ini (yang setidaknya melempar error jelas).
--
--   Ini persis alasan urutan yang sama sudah dipakai 25 Agu 2026: header
--   20260825000002 memperingatkan bahwa menjalankan file-nya lebih dulu
--   membuka jendela dgn DUA penulis aktif. Di sini masalahnya kebalikan —
--   NOL penulis efektif — tapi akarnya sama: jalur tulis dan UI harus
--   berpindah bersamaan.
--
--   URUTAN YANG BENAR:
--     1. 20260902000003  (kolom + backfill)          <- boleh sekarang
--     2. 20260902000004  (RPC set_sp_finance_docs)   <- boleh sekarang
--     3. deploy FE Fase 1 ke produksi                <- push/merge
--     4. KONFIRMASI FE live & kartu Finance berfungsi
--     5. FILE INI                                     <- baru boleh
--
-- =============================================================================
-- APA YANG BERUBAH
-- =============================================================================
--   Badan fungsi disalin UTUH dari hasil 20260902000001. SATU-SATUNYA
--   perubahan: enam kolom di bawah DIHAPUS dari daftar SET pada UPDATE
--   sp_items —
--       inv, fp, submit, kirim, submit_date, email_status
--   Guard is_sp_item_writer() DIPERTAHANKAN apa adanya. UPDATE sp_order_items
--   tidak disentuh (keenam kolom itu memang tak ada di sana).
--
--   Pola identik pencabutan expired_date pada 20260825000001: proteksi
--   struktural di DB, menutup KETIGA modal item sekaligus — bukan tambalan
--   FE per-permukaan yang harus diulang tiap kali ada modal baru.
--
--   Sesudah ini, payload FE yang masih memuat keenam key itu (spToDb selalu
--   memancarkan seluruh 23 kolom, dan itu TIDAK diubah) akan DIABAIKAN DB —
--   sama persis nasib expired_date sejak 25 Agu. Itu aman dan disengaja.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_sp_item_dual(p_id uuid, p_item jsonb)
  RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_rec sp_items%ROWTYPE; v_company uuid;
BEGIN
  v_rec := jsonb_populate_record(null::sp_items, p_item);
  -- FIX 25 Agu 2026: company dari sp_orders (header), BUKAN sp_items.company_id
  -- yang tidak pernah ada. Pola = sp_issue_btb.
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

  -- Guard sumbu LOGISTICS (20260902000001). ceo/gm/gm_bd tidak lolos.
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND is_sp_item_writer())) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah item SP ini';
  END IF;

  -- TIGA KELOMPOK KOLOM SENGAJA TIDAK ADA di daftar SET ini:
  --   1. expired_date  (25 Agu 2026) -> set_sp_expired_date()
  --   2. inv, fp, submit, kirim, submit_date, email_status  (2 Sep 2026,
  --      file ini) -> set_sp_finance_docs(). Keenamnya atribut level SP milik
  --      sumbu FINANCE; menulisnya dari sini membuka lagi jalur senyap yang
  --      bisa membuat item berbeda-beda dari headernya.
  --   exp_date DIPERTAHANKAN — kolom mati dgn isu terpisah, milik M13.
  -- JANGAN kembalikan satu pun ke sini.
  UPDATE sp_items SET
    sp_date = v_rec.sp_date, sp_no = v_rec.sp_no, customer_id = v_rec.customer_id,
    product_id = v_rec.product_id, product_name = v_rec.product_name, sku = v_rec.sku,
    qty = v_rec.qty, shipped_qty = v_rec.shipped_qty,
    exp_date = v_rec.exp_date, dc = v_rec.dc,
    shipping_date = v_rec.shipping_date, sla_days = v_rec.sla_days,
    estimated_delivery_date = v_rec.estimated_delivery_date, arrival_date = v_rec.arrival_date,
    unit_price = v_rec.unit_price, shipping_price = v_rec.shipping_price,
    notes = v_rec.notes,
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
--   -- a. Keenam kolom benar-benar hilang dari badan fungsi (HARUS 0 hit):
--   SELECT count(*) FROM pg_proc
--    WHERE proname = 'update_sp_item_dual'
--      AND prosrc ~ 'inv\s*=\s*v_rec\.inv';
--
--   -- b. Kolom logistics MASIH ditulis (HARUS 1):
--   SELECT count(*) FROM pg_proc
--    WHERE proname = 'update_sp_item_dual'
--      AND prosrc ~ 'qty\s*=\s*v_rec\.qty';
--
--   -- c. Edit Item (qty/notes) MASIH berfungsi utk manager/operations —
--   --    uji dari browser, bukan SQL Editor.
--
--   -- d. Toggle dokumen dari kartu Finance level SP MASIH berfungsi utk
--   --    finance/finance_controller (set_sp_finance_docs tak terpengaruh).
--
--   -- e. Bukti jalur ganda tertutup: simpan Edit Item dengan payload yang
--   --    memuat inv=true pada SP ber-inv=false -> nilai HARUS tetap false.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   Jalankan ulang isi 20260902000001 (badan fungsi yang masih memuat keenam
--   kolom itu di daftar SET). Fungsi is_sp_item_writer() tidak perlu disentuh.
--   ⚠️ Rollback ini mengembalikan DUA penulis aktif untuk keenam kolom —
--      lakukan hanya kalau FE Fase 1 harus di-revert juga.
