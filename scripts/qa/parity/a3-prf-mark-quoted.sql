-- =============================================================================
-- a3-prf-mark-quoted.sql -- PATCH PARITY STAGING (TD-279, Kelompok A3)
--
-- !!  S T A G I N G   S A J A  --  JANGAN DIJALANKAN DI PRODUCTION  !!
--
-- !! BERKAS 20260907000001 SENGAJA TIDAK DIJALANKAN, dan ini alasannya.
--    Berkas itu mengganti EMPAT RPC PRF sekaligus: prf_claim, prf_release,
--    prf_mark_quoted, prf_select_offer. Tapi 20260912000004 kemudian MENGGANTI
--    prf_claim lagi. Hari ini hanya prf_mark_quoted yang berbeda antara
--    staging dan production -- ketiga saudaranya sudah sama.
--
--    Menjalankan 20260907000001 di staging akan memperbaiki satu objek sambil
--    MEMUNDURKAN prf_claim ke versi 7 Sep: drift baru, lahir dari upaya
--    menutup drift. Berkas migrasi di repo adalah KLAIM tentang production,
--    bukan cerminnya -- dan klaim itu basi begitu migrasi berikutnya menimpa
--    objek yang sama.
--
-- Bedanya dengan staging tepat satu baris -- guard company tunggal jadi jamak
-- (TD-180):
--     staging     v_company =  get_user_company_id()
--     production  v_company IN (SELECT get_user_company_ids())
-- Akibatnya nyata: procurement yang home-nya bukan entitas PRF itu DITOLAK
-- KERAS di staging, dan diterima di production.
--
-- ACL production: =X/postgres,postgres=X/postgres,authenticated=X/postgres
-- Perhatikan entri BERAWALAN '=' -- itu PUBLIC EXECUTE, dan staging sudah
-- punya bentuk yang sama. Karena itu berkas ini TIDAK mengeluarkan GRANT atau
-- REVOKE apa pun: menambahkannya justru MENGUBAH ACL staging sehingga berbeda
-- dari production. Di sini, menyamakan berarti tidak menyentuh.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.prf_mark_quoted(p_prf_id uuid, p_waiver_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
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

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids()) AND v_ack = v_uid)) THEN
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
$fn$;

-- --- V1: BUKTI badan staging = badan production -----------------------------
DO $v1$
DECLARE v_md5 text; v_acl text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='prf_mark_quoted';
  IF v_md5 IS DISTINCT FROM 'e37ee35b051b7bdd9a88184ebfb267e4' THEN
    RAISE EXCEPTION 'V1a GAGAL: badan prf_mark_quoted tidak sama dengan production (md5 %).', v_md5;
  END IF;

  -- ACL diperiksa TETAP SAMA, bukan diperketat: kalau entri PUBLIC hilang,
  -- staging berbeda dari production ke arah yang lain -- tetap drift.
  SELECT COALESCE(array_to_string(proacl::text[], ','), '(null)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='prf_mark_quoted';
  IF v_acl IS DISTINCT FROM '=X/postgres,postgres=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'V1b GAGAL: ACL prf_mark_quoted = %, harusnya sama dengan production.', v_acl;
  END IF;

  RAISE NOTICE 'A3 LOLOS: prf_mark_quoted sama dengan production, ACL tidak bergeser.';
END
$v1$;

COMMIT;
