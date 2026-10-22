-- =============================================================================
-- Migration: 20261023000003_crm_find_possible_duplicate_inquiries_location_ids
-- Inquiry Management Irisan 6 -- Lingkup A (lane dibandingkan via ID lokasi)
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging.
-- Dependensi: 20261023000002 (kolom pol_location_id/pod_location_id harus
-- ada di inquiries). Di staging, fungsi lama (format TEKS, migrasi
-- 20261022000003) sudah live -- DROP di bawah menargetkan signature itu.
-- Di production, 20261022000003 BELUM live, jadi DROP FUNCTION IF EXISTS
-- di bawah tidak menemukan apa pun dan lanjut aman ke CREATE.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP FUNCTION -- WAJIB DIJALANKAN MAS LANGSUNG DI
-- SQL EDITOR, BUKAN lewat connector Vir (connector membatalkan/menolak
-- statement DROP sebagai pengaman). Ini bukan prosedur baru -- sama dengan
-- catatan TD-318 soal lead_pool_assign (17 Okt 2026) yang juga butuh
-- DROP FUNCTION.
--
-- RINGKASAN: menutup kewajiban yang ditinggalkan Irisan 4 -- deteksi
-- possible-duplicate (rule 105) kini membandingkan ID lokasi (pol_
-- location_id/pod_location_id), BUKAN teks pol/pod. Verifikasi badan LIVE
-- lebih dulu (aturan "RPC yang pernah ditambal"): grep
-- find_possible_duplicate_inquiries ke schema_snapshot.sql = NOL HIT --
-- fungsi ini belum pernah jalan di production, satu-satunya badan yang
-- pernah ada hanyalah migrasi 20261022000003 (Irisan 4). Nol pemanggil
-- production -> aman DROP+CREATE signature baru tanpa menjaga overload
-- lama berdampingan.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.find_possible_duplicate_inquiries(uuid, uuid, text, text, text[], uuid);

CREATE FUNCTION public.find_possible_duplicate_inquiries(
  p_company_id       uuid,
  p_customer_id      uuid,
  p_pol_location_id  uuid,
  p_pod_location_id  uuid,
  p_container_types  text[] DEFAULT '{}',
  p_exclude_id       uuid DEFAULT NULL
) RETURNS TABLE (
  id          uuid,
  inquiry_no  text,
  created_at  timestamptz,
  owner_name  text
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas ini.';
  END IF;

  -- Lane tak bisa dibandingkan tanpa kedua ID lokasi -- baris lama yang
  -- belum terpetakan (pol_location_id/pod_location_id NULL) otomatis TIDAK
  -- PERNAH cocok lewat perbandingan `=` di bawah (NULL = apa pun selalu
  -- UNKNOWN, bukan TRUE) -- BUKAN dikoersi ke pembanding teks sebagai lapis
  -- kedua (dilarang eksplisit, kewajiban yang ditutup migrasi ini).
  IF p_customer_id IS NULL OR p_pol_location_id IS NULL OR p_pod_location_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT i.id, i.inquiry_no, i.created_at, p.full_name
      FROM public.inquiries i
      LEFT JOIN public.profiles p ON p.id = i.owner_id
     WHERE i.company_id = p_company_id
       AND i.status = 'OPEN'
       AND i.deleted_at IS NULL
       AND (p_exclude_id IS NULL OR i.id <> p_exclude_id)
       AND COALESCE(i.customer_id, i.prospect_id) = p_customer_id
       AND i.pol_location_id = p_pol_location_id
       AND i.pod_location_id = p_pod_location_id
       AND (SELECT COALESCE(array_agg(e ORDER BY e), '{}') FROM unnest(i.container_types) e)
         = (SELECT COALESCE(array_agg(e ORDER BY e), '{}') FROM unnest(p_container_types) e)
       AND i.created_at >= now() - interval '30 days'
     ORDER BY i.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, uuid, uuid, text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, uuid, uuid, text[], uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, uuid, uuid, text[], uuid) TO authenticated;

COMMENT ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, uuid, uuid, text[], uuid) IS
  'Irisan 6: lane dibandingkan via ID lokasi (pol_location_id/pod_location_id), bukan teks pol/pod -- menutup kewajiban yang ditinggalkan Irisan 4 (migrasi 20261022000003). Baris ber-ID NULL (belum terpetakan, lihat backfill-inquiry-locations.sql) otomatis tidak pernah cocok -- sengaja, bukan fallback ke teks.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='find_possible_duplicate_inquiries';
-- SELECT proacl FROM pg_proc WHERE proname='find_possible_duplicate_inquiries'; -- proacl TIDAK NULL, grantee hanya authenticated
--
-- Rollback (sebelum ada pemanggil baru yang bergantung signature ID):
--   DROP FUNCTION public.find_possible_duplicate_inquiries(uuid,uuid,uuid,uuid,text[],uuid);
--   -- lalu CREATE FUNCTION ulang dengan badan versi 20261022000003 (signature teks)
--   -- kalau memang perlu kembali -- TIDAK direkomendasikan, FE sudah ikut berubah.
-- =============================================================================
