-- ARSIP — dijalankan manual di Supabase SQL Editor, 27 Jul 2026.
-- Fase 3 modul Penawaran Vendor: 4 RPC transisi status PRF.
-- Alasan RPC SECURITY DEFINER (bukan longgarkan RLS): policy prf_update_status
-- mensyaratkan status='SUBMITTED', sehingga transisi keluar dari ACKNOWLEDGED
-- mustahil lewat UPDATE langsung (TD-109). RLS Postgres juga tidak bisa guard
-- per-kolom (TD-77), jadi melonggarkan policy akan membuka kolom lain.
-- Preseden: set_prospect_on_inquiry.
-- Transisi CANCELLED dan EXPIRED BELUM dibuat — sengaja ditunda.

CREATE OR REPLACE FUNCTION public.prf_claim(p_prf_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_ack     uuid;
BEGIN
  SELECT company_id, status, acknowledged_by
    INTO v_company, v_status, v_ack
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  IF NOT (is_super_admin() OR (v_company = get_user_company_id() AND has_role('procurement'))) THEN
    RAISE EXCEPTION 'Tidak berhak mengambil PRF ini';
  END IF;

  IF v_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'PRF harus berstatus SUBMITTED (sekarang: %)', v_status;
  END IF;

  IF v_ack IS NOT NULL THEN
    RAISE EXCEPTION 'PRF sudah diambil orang lain';
  END IF;

  UPDATE prf
  SET status = 'ACKNOWLEDGED', acknowledged_by = v_uid, acknowledged_at = now()
  WHERE id = p_prf_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.prf_mark_quoted(p_prf_id uuid, p_waiver_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_ack     uuid;
  v_offers  int;
  v_reason  text := NULLIF(TRIM(COALESCE(p_waiver_reason, '')), '');
BEGIN
  SELECT company_id, status, acknowledged_by
    INTO v_company, v_status, v_ack
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  IF NOT (is_super_admin() OR (v_company = get_user_company_id() AND v_ack = v_uid)) THEN
    RAISE EXCEPTION 'Hanya pemegang PRF yang boleh menyatakan penawaran siap';
  END IF;

  IF v_status <> 'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'PRF harus berstatus ACKNOWLEDGED (sekarang: %)', v_status;
  END IF;

  SELECT count(*) INTO v_offers
  FROM prf_vendor_offers
  WHERE prf_id = p_prf_id AND deleted_at IS NULL;

  IF v_offers < 1 THEN
    RAISE EXCEPTION 'Belum ada penawaran vendor sama sekali';
  END IF;

  IF v_offers < 3 AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Baru % penawaran. Minimum 3, atau isi alasan kenapa kurang', v_offers;
  END IF;

  UPDATE prf
  SET status = 'QUOTED',
      min_offers_waiver_reason = CASE WHEN v_offers < 3 THEN v_reason ELSE NULL END
  WHERE id = p_prf_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.prf_release(p_prf_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_ack     uuid;
BEGIN
  SELECT company_id, status, acknowledged_by
    INTO v_company, v_status, v_ack
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  IF v_status <> 'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'PRF tidak sedang dikerjakan siapa pun (status: %)', v_status;
  END IF;

  IF NOT (
    is_super_admin()
    OR (v_company = get_user_company_id() AND (v_ack = v_uid OR is_manager_or_above()))
  ) THEN
    RAISE EXCEPTION 'Hanya pemegang PRF atau manager yang boleh melepas';
  END IF;

  UPDATE prf
  SET status = 'SUBMITTED', acknowledged_by = NULL, acknowledged_at = NULL
  WHERE id = p_prf_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.prf_select_offer(p_prf_id uuid, p_offer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_owner   uuid;
  v_ok      boolean;
BEGIN
  SELECT company_id, status, created_by
    INTO v_company, v_status, v_owner
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  IF NOT (
    is_super_admin()
    OR (v_company = get_user_company_id() AND (v_owner = v_uid OR is_manager_or_above()))
  ) THEN
    RAISE EXCEPTION 'Hanya sales pemilik PRF atau manager yang boleh memilih penawaran';
  END IF;

  IF v_status <> 'QUOTED' THEN
    RAISE EXCEPTION 'Penawaran belum siap dipilih (status: %)', v_status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM prf_vendor_offers
    WHERE id = p_offer_id AND prf_id = p_prf_id AND deleted_at IS NULL
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Penawaran tidak ditemukan atau bukan milik PRF ini';
  END IF;

  UPDATE prf
  SET selected_offer_id = p_offer_id,
      selected_by = v_uid,
      selected_at = now()
  WHERE id = p_prf_id;
END;
$function$

GRANT EXECUTE ON FUNCTION public.prf_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prf_release(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prf_mark_quoted(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prf_select_offer(uuid, uuid) TO authenticated;
