-- =============================================================================
-- Migration: 20261024000002_crm_duplicate_of_inquiry_no_reader
-- Inquiry Management Putaran 3 -- Tahap 3A, Lingkup E
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual (connector) di staging.
-- Dependensi: `inquiries.duplicate_of_id` (Irisan 4, migrasi 20261022000002,
-- SUDAH di develop); kebijakan `inquiries_read` LIVE (20260912000004 +
-- 20260830000003, SUDAH di staging & production sejak 18 Sep 2026); fungsi
-- is_super_admin()/is_manager_or_above()/is_procurement_functional()/
-- get_user_company_ids() (semua sudah ada).
--
-- RINGKASAN
-- Menutup gap di DealDetailPage.jsx:616-628 -- fetch terpisah `inquiry_no`
-- milik inquiry yang dipertahankan (duplicate_of_id target) gagal SENYAP
-- (bukan error, baris disaring RLS) untuk sales yang bukan owner inquiry
-- target, dan bukan pula owner/manager di company itu. Teks yang tampil
-- jatuh ke "--" (DealDetailPage.jsx:2064). Komentar yang SUDAH ADA di kode
-- (:2042-2055, :2054-2055) sudah menyebut persis solusi ini: "RPC pembaca
-- sendiri (pola SECURITY DEFINER ala find_possible_duplicate_inquiries)".
--
-- GERBANG AKSES -- replika PERSIS isi kebijakan inquiries_read yang LIVE
-- (sama di staging & production, diverifikasi terhadap migrasi 20260830000003
-- baris 91-111, yang headernya sendiri mengonfirmasi badan itu "disalin
-- BYTE-PER-BYTE dari policy yang berlaku SESUDAH 20260912000004"):
--   is_super_admin() OR (company_id IN (SELECT get_user_company_ids())
--     AND (is_manager_or_above() OR owner_id = auth.uid()
--          OR (is_procurement_functional() AND EXISTS (
--                SELECT 1 FROM prf p WHERE p.inquiry_id = inquiries.id
--                  AND p.company_id = inquiries.company_id
--                  AND p.deleted_at IS NULL))))
-- Direplikasi di sini (bukan dipanggil sebagai policy langsung, karena
-- RLS tidak bisa "ditanya" untuk satu baris spesifik dari dalam fungsi
-- SECURITY DEFINER yang sudah membypass RLS) supaya fungsi ini TIDAK
-- membuka akses baca lebih luas dari yang inquiries_read sendiri sudah
-- izinkan untuk BARIS p_inquiry_id itu -- hanya kolom TARGET (inquiry_no
-- milik duplicate_of_id) yang keluar dari sini, bukan baris p_inquiry_id
-- itu sendiri (pemanggil wajib sudah memuatnya lewat jalur normal).
--
-- p_inquiry_id BUKAN id inquiry yang ditunjuk duplicate_of_id -- ia id
-- inquiry YANG PEMANGGIL SUDAH BOLEH LIHAT (biasanya inquiry Duplicate
-- miliknya sendiri). Fungsi mencari SENDIRI target duplicate_of_id-nya,
-- bukan menerima target itu sbg parameter -- mencegah pemanggil memasukkan
-- ID sembarang untuk memancing inquiry_no inquiry lain yang tak terkait.
--
-- Nol EXCEPTION WHEN OTHERS -- gerbang gagal = RETURN NULL (bacaan normal
-- "tidak ada apa-apa buat kamu"), bukan exception yang perlu ditelan.
-- =============================================================================

BEGIN;

CREATE FUNCTION public.get_duplicate_of_inquiry_no(p_inquiry_id uuid)
  RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_duplicate_of_id uuid;
  v_target_no        text;
BEGIN
  SELECT i.duplicate_of_id INTO v_duplicate_of_id
    FROM public.inquiries i
   WHERE i.id = p_inquiry_id
     AND (
       public.is_super_admin()
       OR (
         i.company_id IN (SELECT public.get_user_company_ids())
         AND (
           public.is_manager_or_above()
           OR i.owner_id = auth.uid()
           OR (
             public.is_procurement_functional()
             AND EXISTS (
               SELECT 1 FROM public.prf p
                WHERE p.inquiry_id = i.id
                  AND p.company_id = i.company_id
                  AND p.deleted_at IS NULL
             )
           )
         )
       )
     );

  IF v_duplicate_of_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT i2.inquiry_no INTO v_target_no
    FROM public.inquiries i2
   WHERE i2.id = v_duplicate_of_id;

  RETURN v_target_no;
END;
$$;

REVOKE ALL ON FUNCTION public.get_duplicate_of_inquiry_no(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_duplicate_of_inquiry_no(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_duplicate_of_inquiry_no(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_duplicate_of_inquiry_no(uuid) IS
  'Mengembalikan HANYA inquiry_no milik inquiry yang ditunjuk duplicate_of_id dari p_inquiry_id, kalau pemanggil boleh lihat p_inquiry_id (gerbang = replika persis USING inquiries_read LIVE, lihat header migrasi). NULL bila gerbang gagal ATAU duplicate_of_id NULL ATAU target tak ditemukan -- nol kolom lain pernah keluar dari fungsi ini. Menggantikan query langsung di DealDetailPage.jsx (sebelumnya: supabase.from(''inquiries'').select(''inquiry_no'').eq(''id'', duplicate_of_id), gagal senyap untuk sales yang bukan owner target).';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef, p.provolatile, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='get_duplicate_of_inquiry_no';
-- SELECT proacl FROM pg_proc WHERE proname='get_duplicate_of_inquiry_no'; -- grantee hanya authenticated
--
-- Rollback:
--   DROP FUNCTION public.get_duplicate_of_inquiry_no(uuid);
-- =============================================================================
