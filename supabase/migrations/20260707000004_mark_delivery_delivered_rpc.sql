-- ============================================================================
-- RPC mark_delivery_delivered — FASE 2C: transisi 'delivered' → status SP SAMPAI
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-07.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    RPC ini SUDAH LIVE di database (dibuat manual di Supabase SQL Editor,
--    terverifikasi via pg_proc + runtime: SP 2204884 DIKIRIM → SAMPAI lalu
--    dikembalikan ke kondisi semula). File ini merekam SQL asli agar tercatat
--    & reproducible.
--
-- TUJUAN: transisi "delivered" (surat jalan sampai) sebelumnya pakai plain
--   UPDATE di FE (setDeliveryStatus) → TAK memicu sp_recompute_status → status SP
--   tak naik ke SAMPAI otomatis. RPC ini menyetel delivered + delivered_at DAN
--   memanggil sp_recompute_status supaya sp_orders.status ikut naik (SAMPAI, bila
--   belum TERKIRIM_PENUH — TERKIRIM_PENUH rank lebih tinggi). Pola persis complete_picking.
--
-- Guard transisi: hanya surat jalan status='in_transit' yang boleh jadi delivered
--   (tolak draft/cancelled/sudah-delivered). FE db.js:setDeliveryStatus cabang
--   'delivered' → supabase.rpc('mark_delivery_delivered', {p_delivery_note_id}).
--
-- Referensi: AUDIT_FASE2_PENGIRIMAN.md (2C) + PROGRESS.md 2026-07-07.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);   -- FASE 2 → SAMPAI (bila belum TERKIRIM_PENUH)
END; $fn$;

GRANT EXECUTE ON FUNCTION public.mark_delivery_delivered(uuid) TO authenticated;
