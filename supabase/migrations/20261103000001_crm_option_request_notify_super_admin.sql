-- =============================================================================
-- Migration: 20261103000001_crm_option_request_notify_super_admin
-- Phase:     Pasca-keputusan Den 23 Okt 2026 ("master data hanya ditambah
--            super admin lewat Admin Hub; role lain hanya memilih/mengajukan
--            lewat notifikasi ke super admin") -- halaman "Option Requests"
--            (approval UI, Irisan 5) DIHAPUS dari FE (unit kerja terpisah,
--            bukan migrasi ini). Jalur pengajuan sendiri (RequestNewOptionModal
--            + RPC submit_dropdown_option_request) TETAP HIDUP -- dipakai
--            Lead Management (CaptureLeadModal/MarkAsLostModal/LeadDetailPage),
--            lepas dari nasib halaman approval.
--
-- Status:    DITULIS UNTUK REVIEW, BELUM DIJALANKAN di staging maupun
--            production. Jalankan manual di SQL Editor SESUDAH Mas Den
--            membaca dan menyetujui isi file ini.
-- RELEASE-PACKAGE:  pra
-- DEPENDS-ON:       20261011000002_crm_lead_master_data_requests.sql,
--                   20261020000001_crm_option_requests_approve_note_and_notify.sql
--                   (keduanya WAJIB sudah live lebih dulu -- tabel
--                   dropdown_option_requests dan fungsi dasarnya lahir di
--                   sana; migrasi ini hanya CREATE OR REPLACE di atasnya).
-- PROBE:            SELECT COALESCE((SELECT prosrc LIKE '%rl.code = ''super_admin''%' FROM pg_proc WHERE proname='submit_dropdown_option_request' AND pronamespace='public'::regnamespace), false);
--
-- -- SATU PERUBAHAN, tidak lebih -------------------------------------------
-- Query penerima notifikasi SUBMIT di submit_dropdown_option_request berubah
-- dari `rl.level <= 6` (semua manager-ke-atas lintas entitas -- sisa desain
-- 20 Okt 2026, SEBELUM keputusan 23 Okt yang menyentralkan ke super admin)
-- menjadi `rl.code = 'super_admin'`, pola IDENTIK request_new_location
-- (migrasi 20261023000004:82): `ur.is_active = true`, `(ur.valid_until IS
-- NULL OR ur.valid_until >= CURRENT_DATE)`, `p.active = true`,
-- `ur.user_id <> auth.uid()` -- SEMUA klausa lain disalin apa adanya, tidak
-- ada yang ditambah/dikurangi.
--
-- Signature TETAP (text, text, text, uuid) -- CREATE OR REPLACE cukup, nol
-- DROP (gotcha #37 tidak berlaku di sini karena nol parameter berubah).
-- REVOKE/GRANT di bawah murni defensif/eksplisit mengikuti konvensi repo,
-- mempertahankan ACL yang sudah ada (authenticated EXECUTE, PUBLIC/anon
-- tidak).
--
-- TIDAK TERDAMPAK oleh migrasi ini: approve_dropdown_option_request/
-- reject_dropdown_option_request (badan, gate, ACL -- nol disentuh) dan
-- notifikasi event dropdown_option_request_approved/_rejected ke PENGAJU
-- (requested_by) -- keduanya tetap mengirim ke pengaju asli, tidak ikut
-- dipersempit ke super_admin. Hanya notifikasi event
-- dropdown_option_request_submitted (ke CALON PENYETUJU) yang berubah.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_dropdown_option_request(
  p_list_key text, p_label text, p_reason text DEFAULT NULL, p_company_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.dropdown_option_requests (list_key, label, reason, company_id, requested_by)
    VALUES (p_list_key, trim(p_label), p_reason, p_company_id, auth.uid())
    RETURNING id INTO v_id;
  BEGIN
    -- Penerima dipersempit ke super_admin AKTIF saja (keputusan Den 23 Okt
    -- 2026), pola IDENTIK request_new_location (20261023000004:82) --
    -- company_id PER-BARIS = company HOME penerima ITU SENDIRI (bukan satu
    -- nilai pengaju untuk semua baris -- tidak berubah dari versi lama).
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    SELECT DISTINCT p.company_id, ur.user_id, 'dropdown_option_request_submitted',
           'New option request',
           p_label || ' requested for ' || p_list_key,
           'dropdown_option_request', v_id
      FROM public.user_roles ur
      JOIN public.roles rl ON rl.id = ur.role_id
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE rl.code = 'super_admin'
       AND ur.is_active = true
       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       AND p.active = true
       AND ur.user_id <> auth.uid();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_dropdown_option_request(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_dropdown_option_request(text, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_dropdown_option_request(text, text, text, uuid) IS
  'Jalur "Request new option" (RequestNewOptionModal.jsx) untuk sales/non-manager -- CaptureLeadModal/MarkAsLostModal/LeadDetailPage (Industry/Lead Category/Lost Reason). Mengirim notifikasi HANYA ke role super_admin aktif (keputusan Den 23 Okt 2026, migrasi 20261103000001 -- sebelumnya seluruh manager-ke-atas level<=6, sisa desain 20 Okt sebelum keputusan itu). Approve/reject TETAP RPC terpisah (approve_dropdown_option_request/reject_dropdown_option_request, tidak diubah), notifikasi hasilnya ke pengaju TIDAK terdampak migrasi ini.';

-- =============================================================================
-- VERIFIKASI (baca-saja, jalankan TERPISAH setelah migrasi di atas -- untuk
-- Mas Den jalankan sendiri, SESI INI TIDAK MENJALANKAN SQL APA PUN)
-- =============================================================================
-- (a) Fungsi sudah versi baru:
-- SELECT prosrc LIKE '%rl.code = ''super_admin''%' AS versi_baru
--   FROM pg_proc WHERE proname = 'submit_dropdown_option_request' AND pronamespace = 'public'::regnamespace;
-- -- Diharapkan: true.
--
-- (b) ACL tidak berubah:
-- SELECT has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_boleh,
--        has_function_privilege('anon', oid, 'EXECUTE')          AS anon_boleh
--   FROM pg_proc WHERE proname = 'submit_dropdown_option_request' AND pronamespace = 'public'::regnamespace;
-- -- Diharapkan: authenticated_boleh=true, anon_boleh=false.
--
-- (c) Jumlah penerima potensial SEKARANG (super_admin aktif, per entitas):
-- SELECT p.company_id, count(DISTINCT ur.user_id) AS jumlah_super_admin_aktif
--   FROM public.user_roles ur
--   JOIN public.roles rl ON rl.id = ur.role_id
--   JOIN public.profiles p ON p.id = ur.user_id
--  WHERE rl.code = 'super_admin'
--    AND ur.is_active = true
--    AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--    AND p.active = true
--  GROUP BY p.company_id ORDER BY p.company_id;
--
-- (d) Pembanding versi lama vs baru (untuk melihat seberapa jauh menyempit):
-- SELECT
--   (SELECT count(DISTINCT ur.user_id) FROM public.user_roles ur JOIN public.roles rl ON rl.id=ur.role_id JOIN public.profiles p ON p.id=ur.user_id WHERE rl.level<=6 AND ur.is_active=true AND (ur.valid_until IS NULL OR ur.valid_until>=CURRENT_DATE) AND p.active=true) AS penerima_versi_lama,
--   (SELECT count(DISTINCT ur.user_id) FROM public.user_roles ur JOIN public.roles rl ON rl.id=ur.role_id JOIN public.profiles p ON p.id=ur.user_id WHERE rl.code='super_admin' AND ur.is_active=true AND (ur.valid_until IS NULL OR ur.valid_until>=CURRENT_DATE) AND p.active=true) AS penerima_versi_baru;
--
-- ROLLBACK (kembali ke versi 20261020000001 -- level<=6):
-- CREATE OR REPLACE FUNCTION public.submit_dropdown_option_request(
--   p_list_key text, p_label text, p_reason text DEFAULT NULL, p_company_id uuid DEFAULT NULL
-- ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
-- -- (tempel ulang badan versi 20261020000001:187-221 apa adanya)
-- $$;
-- =============================================================================
