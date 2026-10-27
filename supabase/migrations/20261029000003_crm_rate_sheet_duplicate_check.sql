-- =============================================================================
-- Migration: 20261029000003_crm_rate_sheet_duplicate_check
-- Inquiry Management Putaran 12 -- Butir 4: deteksi kemungkinan Rate Sheet
-- duplikat di server (RPC baru, read-only).
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- TANPA DROP -- fungsi baru, nol versi lama (nama belum pernah dipakai di
-- riwayat migrasi mana pun). Boleh dijalankan lewat connector Vir.
--
-- LATAR -- berbeda dari find_possible_duplicate_inquiries (rule 105,
-- 20261023000003) yang SENGAJA dilewati untuk inquiry_type='Rate Sheet
-- Request' (InquiryIntakeWizardPage.jsx:684-688, Keputusan Q1) -- mockup/
-- nexus-notes.js TIDAK punya rule tertulis untuk "Rate Sheet duplikat
-- berdasar validity overlap"; ini business logic BARU per tafsiran Vir
-- (disetujui Den 27 Okt 2026), BUKAN kodifikasi rule yang sudah ada.
--
-- KRITERIA MATCH (persis tafsiran yang disetujui):
--   1. inquiry_type = 'Rate Sheet Request' (TIDAK dibandingkan dengan
--      Single Shipment -- filter ini sudah menutupnya).
--   2. prospect_id SAMA (akun sama -- customer_id selalu NULL sejak
--      keputusan "satu akun gabungan", change_inquiry_account 20261027000007).
--   3. status NOT IN ('LOST','CANCELLED') -- Rate Sheet yang sudah mati tidak
--      dihitung sebagai konflik.
--   4. validity_from/validity_to BERIRISAN (standard interval overlap:
--      a.from <= b.to AND a.to >= b.from).
--   5. MINIMAL SATU pasangan lane (pol_location_id, pod_location_id) SAMA
--      dengan salah satu lane di p_lanes (EXISTS, bukan ALL -- "minimal
--      satu" per instruksi).
--
-- READ-ONLY, DIPANGGIL SAAT MENGISI FORM (SEBELUM submit) -- p_lanes/
-- validity bisa berupa draft yang belum lengkap; fungsi ini TIDAK RAISE
-- EXCEPTION untuk input tidak lengkap (beda dari RPC tulis), cukup
-- mengembalikan NOL baris -- UX "cek sambil mengisi", bukan validasi keras.
--
-- PERUBAHAN LAYAR (BUTIR 4) BELUM DIKERJAKAN -- Tahap A SAJA (migrasi +
-- skrip). Pemasangan RPC ini ke InquiryIntakeWizardPage.jsx (banner
-- peringatan non-blocking, pakai ulang state/komponen banner duplikat
-- Single Shipment yang sudah ada) dikerjakan di prompt BERIKUTNYA, sesudah
-- Vir review SQL ini dan Den menjalankannya di staging.
-- =============================================================================

BEGIN;

CREATE FUNCTION public.find_possible_duplicate_rate_sheets(
  p_company_id         uuid,
  p_prospect_id        uuid,
  p_validity_from      date,
  p_validity_to        date,
  p_lanes              jsonb,
  p_exclude_inquiry_id uuid DEFAULT NULL
) RETURNS TABLE (
  id            uuid,
  inquiry_no    text,
  validity_from date,
  validity_to   date
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas ini.';
  END IF;

  -- Input belum lengkap (draft form) -- kembalikan nol baris, bukan error.
  IF p_prospect_id IS NULL OR p_validity_from IS NULL OR p_validity_to IS NULL
     OR jsonb_typeof(p_lanes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lanes) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT i.id, i.inquiry_no, i.validity_from, i.validity_to
      FROM public.inquiries i
     WHERE i.company_id = p_company_id
       AND i.inquiry_type = 'Rate Sheet Request'
       AND i.prospect_id = p_prospect_id
       AND i.status NOT IN ('LOST', 'CANCELLED')
       AND i.deleted_at IS NULL
       AND (p_exclude_inquiry_id IS NULL OR i.id <> p_exclude_inquiry_id)
       AND i.validity_from IS NOT NULL AND i.validity_to IS NOT NULL
       AND i.validity_from <= p_validity_to
       AND i.validity_to   >= p_validity_from
       AND EXISTS (
         SELECT 1
           FROM public.inquiry_lanes il
           JOIN jsonb_array_elements(p_lanes) AS lane ON true
          WHERE il.inquiry_id = i.id
            AND il.pol_location_id = NULLIF(lane->>'pol_location_id', '')::uuid
            AND il.pod_location_id = NULLIF(lane->>'pod_location_id', '')::uuid
            AND il.pol_location_id IS NOT NULL
            AND il.pod_location_id IS NOT NULL
       )
     ORDER BY i.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.find_possible_duplicate_rate_sheets(uuid, uuid, date, date, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_possible_duplicate_rate_sheets(uuid, uuid, date, date, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.find_possible_duplicate_rate_sheets(uuid, uuid, date, date, jsonb, uuid) IS
  'Putaran 12 Butir 4: kemungkinan Rate Sheet duplikat -- akun sama, inquiry_type=Rate Sheet Request, status bukan LOST/CANCELLED, validity overlap, minimal satu pasangan lane (pol_location_id+pod_location_id) sama. TIDAK membandingkan dengan Single Shipment. Business logic baru (tafsiran Vir, disetujui Den 27 Okt 2026) -- bukan kodifikasi rule mockup yang sudah ada. Read-only, dipanggil saat mengisi form -- input tidak lengkap mengembalikan nol baris, bukan error.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='find_possible_duplicate_rate_sheets';
-- SELECT proacl FROM pg_proc WHERE proname='find_possible_duplicate_rate_sheets';
--  -- grantee hanya authenticated
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-12.sql untuk uji self-rollback.
--
-- Rollback (belum ada pemanggil FE yang bergantung padanya -- Tahap A):
--   DROP FUNCTION public.find_possible_duplicate_rate_sheets(uuid,uuid,date,date,jsonb,uuid);
-- =============================================================================
