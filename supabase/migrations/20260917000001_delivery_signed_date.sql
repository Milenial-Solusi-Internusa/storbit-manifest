-- =============================================================================
-- Migration: 20260917000001_delivery_signed_date
-- Status:    LIVE DI PRODUCTION — sudah dijalankan MANUAL di SQL Editor produksi
--            17 Sep 2026. File ini CUMA REKAMAN (retroaktif); idempotent bila
--            toh dijalankan ulang. Staging BELUM (kolom signed_date & overload
--            2-argumen belum ada di sana).
-- Isi:       1. delivery_notes.signed_date — tanggal SJ ditandatangani customer/DC.
--            2. mark_delivery_delivered(uuid, date) — badan FINAL, disalin
--               verbatim dari pg_get_functiondef produksi 17 Sep 2026: guard
--               otorisasi (level<=6 / operations) + signed_date wajib, tidak
--               di masa depan, tidak sebelum dispatched_at (WIB).
--            3. ACL: REVOKE PUBLIC + GRANT authenticated (pola RPC repo).
-- Catatan:   Overload lama mark_delivery_delivered(uuid) SENGAJA tidak disentuh.
--            Pengecekan masa depan memakai current_date (UTC) — direkam apa adanya.
-- =============================================================================

-- 1. Kolom
ALTER TABLE delivery_notes ADD COLUMN IF NOT EXISTS signed_date date;

-- 2. RPC (verbatim produksi)
CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid, p_signed_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_cust uuid; v_sp text; v_dispatched_at timestamptz;
BEGIN
  SELECT status, customer_id, sp_no, dispatched_at INTO v_status, v_cust, v_sp, v_dispatched_at
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r ON r.id = ur.role_id
    WHERE  ur.user_id  = auth.uid()
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  (r.level <= 6 OR r.code = 'operations')
  ) THEN
    RAISE EXCEPTION 'Tidak berhak menandai surat jalan sebagai terkirim. Butuh level manager ke atas atau role operations.';
  END IF;

  IF p_signed_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal surat jalan ditandatangani wajib diisi'; END IF;
  IF p_signed_date > current_date THEN
    RAISE EXCEPTION 'Tanggal tanda tangan tidak boleh di masa depan'; END IF;
  IF v_dispatched_at IS NOT NULL
     AND p_signed_date < (v_dispatched_at AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal SJ ditandatangani tidak boleh sebelum tanggal berangkat'; END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now(), signed_date=p_signed_date WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $function$;

-- 3. ACL
REVOKE ALL ON FUNCTION public.mark_delivery_delivered(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_delivery_delivered(uuid, date) TO authenticated;
