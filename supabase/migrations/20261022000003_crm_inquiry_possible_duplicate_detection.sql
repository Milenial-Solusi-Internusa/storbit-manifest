-- =============================================================================
-- Migration: 20261022000003_crm_inquiry_possible_duplicate_detection
-- Inquiry Management Irisan 4 -- Lingkup C (Possible Duplicates -- deteksi +
-- peringatan saat create; daftar/tab UI SENGAJA TIDAK dibangun di irisan ini
-- -- lihat laporan akhir, ditunda ke Irisan 8 / Owner Assignment).
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging.
-- Dependensi: TIDAK ADA secara FUNGSIONAL terhadap 20261022000001/…000002 --
-- RPC di bawah hanya membaca kolom inquiries yang sudah ada sebelum Irisan 4
-- (customer_id, prospect_id, pol, pod, container_types, status, created_at).
-- Diurutkan SESUDAH keduanya hanya karena mengikuti urutan penulisan A->B->C,
-- bukan karena ketergantungan. Boleh dijalankan sendirian kapan pun.
--
-- RINGKASAN DETEKSI (rule 105 nexus-notes.js + C.dupPairs/C.lane/C.DUP_DAYS
-- di design-handoff/mockup/crm-metrics.js -- dikutip langsung, bukan
-- diusulkan): dua inquiry dianggap kemungkinan duplikat kalau SATU customer
-- (COALESCE(customer_id, prospect_id) -- lihat catatan di bawah),
-- "lane" yang sama (pol + pod + tipe kontainer -- Nexus belum punya mode
-- transportasi selain Ocean, jadi segmen 'Ocean' mockup tidak relevan), dan
-- dibuat dalam jendela 30 hari. Deteksi ini hanya berlaku untuk inquiry
-- berstatus OPEN (mockup: C.dupPairs hanya memasangkan baris OPEN).
--
-- ⚠️ `customer_id` vs `prospect_id`: InquiryFormPage.jsx (create) SELALU
-- menulis akun ke `prospect_id`, `customer_id` SELALU NULL pada baris baru
-- (diverifikasi grep langsung ke kode, bukan tebakan) -- apa pun tipe
-- akunnya. Maka pembanding akun di bawah memakai COALESCE(customer_id,
-- prospect_id) supaya tetap benar untuk kedua kemungkinan.
--
-- ⚠️ Perbandingan "lane" memakai TEKS pol/pod polos (kolom inquiries.pol/
-- .pod hari ini adalah free-text) -- begitu Location Master (rencana Irisan
-- 6) berjalan dan pol/pod punya ID lokasi baku, GANTI pembanding ini ke ID
-- lokasi, BUKAN tambahkan pembanding teks sebagai lapis kedua (teks akan
-- selalu punya variasi penulisan yang lolos dari pembanding ID).
--
-- SECURITY DEFINER + guard entitas: RLS inquiries_read yang berlaku untuk
-- sales biasa (non-manager, non-procurement) HANYA meloloskan baris milik
-- SENDIRI (owner_id=auth.uid()) -- lihat 20260830000003_inquiries_rls_
-- owner_based.sql. Kalau fungsi ini SECURITY INVOKER biasa, sales A TIDAK
-- AKAN PERNAH melihat inquiry duplikat milik sales B lewat RLS -- padahal
-- justru pasangan LINTAS-SALES itulah yang paling perlu dideteksi. Karena
-- itu fungsi ini WAJIB SECURITY DEFINER (membaca seluruh inquiries di
-- entitas itu terlepas dari siapa ownernya), dengan guard eksplisit sendiri
-- (bukan RLS) sbg pengganti: company_id yang diminta HARUS salah satu
-- entitas aktif pemanggil (get_user_company_ids()) atau pemanggil
-- super_admin -- pola identik guard increment_document_sequence().
-- =============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN duplicate_warning_reason text;

COMMENT ON COLUMN public.inquiries.duplicate_warning_reason IS
  'Diisi FE saat user memilih "Continue as separate shipment" setelah peringatan possible-duplicate ditampilkan (mockup Inquiry Management.dc.html, modal mDup). Wajib terisi untuk melanjutkan; NULL = tidak pernah muncul peringatan, atau fitur belum dipakai untuk baris lama.';

CREATE FUNCTION public.find_possible_duplicate_inquiries(
  p_company_id       uuid,
  p_customer_id      uuid,
  p_pol              text,
  p_pod              text,
  p_container_types   text[] DEFAULT '{}',
  p_exclude_id        uuid DEFAULT NULL
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

  IF p_customer_id IS NULL THEN
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
       AND COALESCE(i.pol, '') = COALESCE(p_pol, '')
       AND COALESCE(i.pod, '') = COALESCE(p_pod, '')
       AND (SELECT COALESCE(array_agg(e ORDER BY e), '{}') FROM unnest(i.container_types) e)
         = (SELECT COALESCE(array_agg(e ORDER BY e), '{}') FROM unnest(p_container_types) e)
       AND i.created_at >= now() - interval '30 days'
     ORDER BY i.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, text, text, text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, text, text, text[], uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, text, text, text[], uuid) TO authenticated;

COMMENT ON FUNCTION public.find_possible_duplicate_inquiries(uuid, uuid, text, text, text[], uuid) IS
  'Cari inquiry OPEN di company_id yang sama, akun sama (COALESCE(customer_id,prospect_id)), lane sama (pol+pod+tipe kontainer, perbandingan TEKS -- ganti ke ID lokasi begitu Location Master/Irisan 6 ada), dibuat <=30 hari lalu (rule 105 + C.DUP_DAYS mockup). SECURITY DEFINER dengan guard entitas sendiri (BUKAN RLS inquiries_read yang owner-scoped untuk sales biasa) -- supaya pasangan lintas-sales ikut terdeteksi. p_exclude_id disediakan untuk kemungkinan pemakaian dari halaman edit di masa depan; satu-satunya pemanggil hari ini (InquiryFormPage create) selalu mengirim NULL.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name='inquiries' AND column_name='duplicate_warning_reason';
-- SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='find_possible_duplicate_inquiries';
--
-- Rollback:
--   DROP FUNCTION public.find_possible_duplicate_inquiries(uuid,uuid,text,text,text[],uuid);
--   ALTER TABLE public.inquiries DROP COLUMN duplicate_warning_reason;
-- =============================================================================
