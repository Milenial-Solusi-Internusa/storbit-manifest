-- =============================================================================
-- Migration: 20261024000005_crm_list_possible_duplicate_inquiry_pairs
-- Inquiry Management Putaran 3 -- Tahap 3B, Lingkup D
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging.
-- Dependensi: find_possible_duplicate_inquiries(uuid,uuid,uuid,uuid,text[],uuid)
-- LIVE (20261023000003, Irisan 6 -- ID lokasi) · close_inquiry_as_duplicate
-- (20261022000002, Irisan 4) · is_manager_or_above_in(uuid) LIVE.
--
-- RINGKASAN
-- RPC pembaca untuk tab "Possible duplicates" halaman Inquiry Owner
-- Assignment (1.2.3). Aturan kecocokan SAMA PERSIS find_possible_duplicate_
-- inquiries LIVE (dibaca utuh sebelum menulis ini): kedua sisi status OPEN,
-- deleted_at IS NULL, company sama, customer sama (COALESCE(customer_id,
-- prospect_id)), pol_location_id & pod_location_id sama DAN keduanya NOT
-- NULL di kedua sisi, himpunan container_types identik setelah diurutkan.
-- DUA PERBEDAAN SENGAJA dari find_possible_duplicate_inquiries:
--   1. duplicate_of_id IS NULL ditambahkan di KEDUA sisi -- pasangan yang
--      salah satu sisinya SUDAH ditutup sebagai duplikat (close_inquiry_
--      as_duplicate) tak perlu lagi muncul sebagai "possible" (sudah
--      diputuskan). find_possible_duplicate_inquiries sendiri tak perlu
--      cek ini karena ia dipanggil dari form (calon baris BARU, belum
--      punya duplicate_of_id apa pun).
--   2. Jendela waktu diukur ANTAR PASANGAN (selisih created_at sisi
--      lebih-baru vs lebih-lama <= 30 hari), BUKAN terhadap now() seperti
--      find_possible_duplicate_inquiries (yang membandingkan formulir baru
--      yang SEDANG diisi SEKARANG, jadi now() = "sisi baru"-nya).
--
-- SISI "a"/"b": a = KEEP (LEBIH LAMA), b = DUPLICATE (LEBIH BARU). Urutan
-- ditentukan (a.created_at < b.created_at) OR (a.created_at = b.created_at
-- AND a.id < b.id) -- BUKAN a.id < b.id saja (uuid v4 acak, urutannya tidak
-- bermakna dan bisa membalik Keep/Duplicate kalau dipakai sendirian).
--
-- SATU inquiry bisa muncul di LEBIH DARI SATU pasangan (mis. tiga inquiry
-- X<Y<Z yang semuanya saling cocok menghasilkan TIGA baris (X,Y)/(X,Z)/
-- (Y,Z)) -- RPC ini melaporkan PASANGAN, bukan klaster; "tiap baris = satu
-- pasangan" sesuai instruksi, nol deduplikasi cluster.
--
-- pol/pod yang dikembalikan = milik sisi KEEP (a.pol/a.pod) -- teks bebas,
-- bisa secara teoretis berbeda redaksi dari sisi Duplicate walau
-- pol_location_id/pod_location_id-nya sama (mis. "Jakarta" vs "jakarta ").
-- Pilihan sisi KEEP sebagai sumber tampilan adalah pilihan deterministik,
-- bukan jaminan keduanya identik huruf demi huruf.
-- =============================================================================

BEGIN;

CREATE FUNCTION public.list_possible_duplicate_inquiry_pairs(p_company_id uuid)
  RETURNS TABLE (
    keep_id          uuid,
    keep_no          text,
    keep_created_at  timestamptz,
    keep_owner_name  text,
    dup_id           uuid,
    dup_no           text,
    dup_created_at   timestamptz,
    dup_owner_name   text,
    customer_name    text,
    pol              text,
    pod              text,
    container_types  text[]
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.is_manager_or_above_in(p_company_id)) THEN
    RAISE EXCEPTION 'Hanya Manager ke atas di entitas ini, atau Super Admin, yang boleh melihat possible duplicates.';
  END IF;

  RETURN QUERY
    SELECT
      a.id, a.inquiry_no, a.created_at, pa.full_name,
      b.id, b.inquiry_no, b.created_at, pb.full_name,
      COALESCE(ca.name, cp.name),
      a.pol, a.pod, a.container_types
      FROM public.inquiries a
      JOIN public.inquiries b
        ON b.id <> a.id
       AND b.company_id = a.company_id
       AND b.status = 'OPEN'
       AND b.deleted_at IS NULL
       AND b.duplicate_of_id IS NULL
       AND b.pol_location_id IS NOT NULL
       AND b.pod_location_id IS NOT NULL
       AND COALESCE(b.customer_id, b.prospect_id) = COALESCE(a.customer_id, a.prospect_id)
       AND b.pol_location_id = a.pol_location_id
       AND b.pod_location_id = a.pod_location_id
       AND (SELECT COALESCE(array_agg(e ORDER BY e), '{}') FROM unnest(b.container_types) e)
         = (SELECT COALESCE(array_agg(e ORDER BY e), '{}') FROM unnest(a.container_types) e)
       AND ((a.created_at < b.created_at) OR (a.created_at = b.created_at AND a.id < b.id))
       AND (b.created_at - a.created_at) <= interval '30 days'
      LEFT JOIN public.profiles pa ON pa.id = a.owner_id
      LEFT JOIN public.profiles pb ON pb.id = b.owner_id
      LEFT JOIN public.accounts  ca ON ca.id = a.customer_id
      LEFT JOIN public.accounts  cp ON cp.id = a.prospect_id
     WHERE a.company_id = p_company_id
       AND a.status = 'OPEN'
       AND a.deleted_at IS NULL
       AND a.duplicate_of_id IS NULL
       AND a.pol_location_id IS NOT NULL
       AND a.pod_location_id IS NOT NULL
     ORDER BY b.created_at DESC
     LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.list_possible_duplicate_inquiry_pairs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_possible_duplicate_inquiry_pairs(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_possible_duplicate_inquiry_pairs(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_possible_duplicate_inquiry_pairs(uuid) IS
  'Pasangan possible-duplicate OPEN di p_company_id -- aturan kecocokan sama persis find_possible_duplicate_inquiries (customer, kedua ID lokasi NOT NULL & sama, container_types identik setelah diurutkan) PLUS duplicate_of_id IS NULL di kedua sisi, jendela waktu antar-pasangan (bukan vs now()). Sisi a=keep (lebih lama, tiebreak id), b=dup (lebih baru). Gate: is_super_admin() ATAU is_manager_or_above_in(p_company_id) -- sales ditolak. Maks 200 pasangan, urut dup_created_at desc. Hasil dipakai langsung sebagai argumen close_inquiry_as_duplicate(dup_id, keep_id).';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='list_possible_duplicate_inquiry_pairs';
-- SELECT proacl FROM pg_proc WHERE proname='list_possible_duplicate_inquiry_pairs'; -- grantee hanya authenticated
--
-- Rollback:
--   DROP FUNCTION public.list_possible_duplicate_inquiry_pairs(uuid);
-- =============================================================================
