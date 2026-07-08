-- ============================================================================
-- FASE 3 — BTB (Bukti Terima Barang): fondasi DB (Step A + B + C)
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-08.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dibuat manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- KEPUTUSAN BISNIS: BTB_TERBIT = rank TERTINGGI di band terkelola (puncak
--   SEBELUM masuk finance/invoice). Begitu BTB terbit untuk sebuah SP, status
--   jadi BTB_TERBIT — MENGALAHKAN TERKIRIM_PENUH — karena invoice ditagih atas
--   BTB bertandatangan Indomarco. Ini mengubah urutan lama (yang menaruh
--   BTB_TERBIT di bawah TERKIRIM_PENUH): rank ditentukan urutan cabang CASE di
--   sp_recompute_status (cabang BTB paling atas), BUKAN urutan enum.
--
-- ISI:
--   Step A — GRANT sp_btb + ganti UNIQUE(customer_id,btb_no) → partial UNIQUE
--            INDEX (hanya baris hidup / deleted_at IS NULL), supaya re-issue
--            nomor BTB yang pernah di-soft-delete tak kena unique_violation.
--   Step B — CREATE OR REPLACE sp_recompute_status: reproduksi FASE 2B UTUH +
--            fakta v_has_btb (EXISTS sp_btb non-deleted by sp_order_id) sebagai
--            cabang CASE TERTINGGI + BTB_TERBIT DICABUT dari guard freeze (kini
--            bisa naik/turun mengikuti fakta BTB; INVOICED+/CANCELLED tetap beku)
--            + REVOKE EXECUTE FROM PUBLIC (dipanggil internal via PERFORM).
--   Step C — RPC sp_issue_btb (7 arg; resolve sp_order_id via customer_id+sp_no,
--            validasi DN milik SP, idempoten via btb_no hidup, insert sp_btb +
--            recompute) + sp_delete_btb (soft delete + recompute mundur) + GRANT.
--
-- VERIFIKASI (runtime, terverifikasi): SP 2038213 — issue BTB → status jadi
--   BTB_TERBIT (mengalahkan TERKIRIM_PENUH); panggil ulang nomor sama → idempoten
--   (tak duplikat); delete BTB → status mundur ke TERKIRIM_PENUH.
-- ============================================================================


-- ─── Step A — GRANT + DROP CONSTRAINT + partial UNIQUE INDEX ─────────────────

GRANT SELECT, INSERT, UPDATE ON public.sp_btb TO authenticated;
ALTER TABLE public.sp_btb DROP CONSTRAINT sp_btb_no_unique;
CREATE UNIQUE INDEX sp_btb_no_unique_live
  ON public.sp_btb (customer_id, btb_no) WHERE deleted_at IS NULL;


-- ─── Step B — sp_recompute_status (cabang BTB rank tertinggi + REVOKE) ───────

CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
  v_has_btb bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS') THEN RETURN; END IF;
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
  v_has_btb := EXISTS(SELECT 1 FROM sp_btb WHERE sp_order_id=v_id AND deleted_at IS NULL);
  v_new := CASE
    WHEN v_has_btb                                THEN 'BTB_TERBIT'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
    WHEN v_has_delivered                          THEN 'SAMPAI'
    WHEN v_has_dispatch                           THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;
  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
  END IF;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.sp_recompute_status(uuid,text) FROM PUBLIC;


-- ─── Step C — sp_issue_btb + sp_delete_btb + GRANT ──────────────────────────

CREATE OR REPLACE FUNCTION public.sp_issue_btb(
  p_customer_id      uuid,
  p_sp_no            text,
  p_btb_no           text,
  p_qty              integer DEFAULT NULL,
  p_btb_date         date    DEFAULT NULL,
  p_delivery_note_id uuid    DEFAULT NULL,
  p_remarks          text    DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_company uuid; v_sp_order_id uuid; v_uid uuid := auth.uid();
  v_btb_id uuid; v_existing uuid;
BEGIN
  IF btrim(COALESCE(p_btb_no,'')) = '' THEN
    RAISE EXCEPTION 'Nomor BTB wajib diisi.'; END IF;
  SELECT id, company_id INTO v_sp_order_id, v_company
    FROM sp_orders
   WHERE customer_id = p_customer_id AND sp_no = p_sp_no AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no; END IF;
  IF p_delivery_note_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM delivery_notes
        WHERE id = p_delivery_note_id AND customer_id = p_customer_id AND sp_no = p_sp_no) THEN
    RAISE EXCEPTION 'Surat jalan bukan milik SP ini.'; END IF;
  SELECT id INTO v_existing FROM sp_btb
   WHERE customer_id = p_customer_id AND btb_no = btrim(p_btb_no) AND deleted_at IS NULL;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO sp_btb (company_id, sp_order_id, delivery_note_id, customer_id,
                      btb_no, btb_date, qty, received_at, received_by, remarks)
  VALUES (v_company, v_sp_order_id, p_delivery_note_id, p_customer_id,
          btrim(p_btb_no), p_btb_date, p_qty, now(), v_uid,
          NULLIF(btrim(COALESCE(p_remarks,'')),''))
  RETURNING id INTO v_btb_id;
  PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  RETURN v_btb_id;
END; $fn$;

CREATE OR REPLACE FUNCTION public.sp_delete_btb(p_btb_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_cust uuid; v_sp text;
BEGIN
  SELECT b.customer_id, o.sp_no INTO v_cust, v_sp
    FROM sp_btb b JOIN sp_orders o ON o.id = b.sp_order_id
   WHERE b.id = p_btb_id AND b.deleted_at IS NULL;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'BTB tidak ditemukan atau sudah dihapus.'; END IF;
  UPDATE sp_btb SET deleted_at = now() WHERE id = p_btb_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $fn$;

GRANT EXECUTE ON FUNCTION public.sp_issue_btb(uuid, text, text, integer, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_delete_btb(uuid) TO authenticated;
