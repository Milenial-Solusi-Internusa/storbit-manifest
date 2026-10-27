-- =============================================================================
-- Migration: 20261027000005_mark_inquiry_won_evidence_exists_check
-- Putaran 10 -- menutup kelemahan mark_inquiry_won yang sudah dicatat
-- eksplisit di header migrasi 20261026000004 (K1d, set_quotation_outcome):
-- path bukti yang "berawalan benar" tidak pernah diverifikasi benar-benar
-- ADA di storage.objects. Pola IDENTIK K1d -- EXISTS-check sebelum UPDATE.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun
-- production. Dijalankan Mas sendiri di SQL Editor staging -- sesi ini
-- tidak menjalankan SQL apa pun.
--
-- TIDAK menambah parameter -- signature TETAP 4 argumen (uuid,text,text,
-- text), jadi CREATE OR REPLACE FUNCTION cukup, tanpa menghapus fungsi
-- lama lebih dulu. CREATE OR REPLACE mempertahankan ACL yang sudah ada;
-- REVOKE/GRANT di bawah murni defensif/eksplisit mengikuti konvensi repo
-- (tiap migrasi yang menyentuh fungsi ini menyatakan ACL sendiri).
--
-- BEDA DARI K1d yang dirujuk: mark_inquiry_won SECURITY DEFINER (bukan
-- INVOKER). EXISTS-check berjalan sebagai OWNER fungsi (postgres, ber-
-- BYPASSRLS di Supabase) -- membaca keberadaan baris storage.objects yang
-- sesungguhnya, TIDAK bergantung pada kebenaran policy
-- inquiry_won_evidence_read seperti catatan K1d (20261026000004:138-143)
-- untuk set_quotation_outcome.
--
-- Pesan RAISE EXCEPTION baru ("File bukti tidak ditemukan di penyimpanan.")
-- SENGAJA tetap Bahasa Indonesia -- seragam dengan seluruh pesan lain di
-- fungsi ini (badan 20261021000001 100% Indonesia). Beda dari migrasi
-- 20261027000006 (dua RPC BARU, bahasa Inggris) karena fungsi ini BUKAN
-- fungsi baru, hanya menambal satu fungsi lama yang sudah berbahasa
-- Indonesia dari awal.
--
-- PRASYARAT URUTAN: 20261021000001 (lahir mark_inquiry_won 4-argumen +
-- bucket inquiry-won-evidence) WAJIB SUDAH LIVE di environment yang sama
-- lebih dulu. Staging: SUDAH (21 Okt 2026). Production: BELUM (terikat
-- gerbang launching Lead Management, 12_ANTREAN_MIGRASI_PRODUCTION.md butir
-- 65/66) -- migrasi ini WAJIB antre SESUDAHNYA di production, bukan
-- berdiri sendiri.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.mark_inquiry_won(
  p_inquiry_id uuid, p_reason text, p_evidence_path text, p_notes text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text; v_owner_id uuid; v_company_id uuid; v_inquiry_no text;
  v_user_email text; v_user_full_name text; v_user_role text; v_supervisor_id uuid;
  v_object_exists boolean;
BEGIN
  SELECT status, owner_id, company_id, inquiry_no
    INTO v_status, v_owner_id, v_company_id, v_inquiry_no
  FROM public.inquiries WHERE id = p_inquiry_id AND deleted_at IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  IF v_status NOT IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION') THEN
    RAISE EXCEPTION 'Status inquiry (%) tidak bisa ditandai Won secara manual.', v_status;
  END IF;

  IF NOT (
    v_owner_id = auth.uid()
    OR public.is_manager_or_above_in(v_company_id)
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Hanya pemilik inquiry, Manager ke atas di entitas ini, atau Super Admin yang bisa menandai Won.';
  END IF;

  IF p_reason NOT IN ('Quoted outside Nexus','Repeat order under existing agreement','Verbal confirmation','Legacy data') THEN
    RAISE EXCEPTION 'Alasan Won manual tidak dikenali: %', p_reason;
  END IF;

  IF COALESCE(btrim(p_evidence_path), '') = '' THEN
    RAISE EXCEPTION 'Bukti wajib dilampirkan untuk Won manual.';
  END IF;
  IF p_evidence_path NOT LIKE (v_company_id::text || '/' || p_inquiry_id::text || '/%') THEN
    RAISE EXCEPTION 'Path bukti tidak sesuai inquiry ini.';
  END IF;

  -- BARU (Putaran 10) -- pola IDENTIK set_quotation_outcome (20261026000004,
  -- K1d): path berawalan benar tidak cukup, berkasnya harus BENAR-BENAR ada.
  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'inquiry-won-evidence' AND name = p_evidence_path
  ) INTO v_object_exists;
  IF NOT v_object_exists THEN
    RAISE EXCEPTION 'File bukti tidak ditemukan di penyimpanan.';
  END IF;

  UPDATE public.inquiries
  SET status = 'WON', won_reason = p_reason, won_evidence_path = p_evidence_path, updated_at = now()
  WHERE id = p_inquiry_id;

  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'MARK_INQUIRY_WON', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'WON', 'won_reason', p_reason),
          p_notes);

  -- Notifikasi atasan: company_id = profiles.company_id milik PENERIMA
  -- (reports_to), BUKAN company_id pengaju. Penerima harus active=true.
  -- Best-effort -- Mark Won TIDAK BOLEH gagal karena notifikasi gagal.
  SELECT reports_to INTO v_supervisor_id FROM public.profiles WHERE id = auth.uid();
  IF v_supervisor_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      SELECT p.company_id, p.id, 'inquiry_manual_win', 'Manual win recorded',
             COALESCE(v_user_full_name, v_user_email) || ' marked ' || v_inquiry_no || ' as Won manually. Reason: ' || p_reason || '.',
             'inquiry', p_inquiry_id
      FROM public.profiles p
      WHERE p.id = v_supervisor_id AND p.active = true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.mark_inquiry_won(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_won(uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.mark_inquiry_won(uuid,text,text,text) IS
  'Tandai inquiry WON manual. Gate: owner_id auth.uid() ATAU is_manager_or_above_in(company_id) ATAU is_super_admin(). Status asal wajib OPEN/IN_REVIEW/QUOTED/NEGOTIATION. 4 alasan whitelist, bukti wajib: path berawalan company_id/inquiry_id/ DAN benar-benar ada di storage.objects bucket inquiry-won-evidence (EXISTS-check, Putaran 10 -- pola set_quotation_outcome/K1d). Notifikasi best-effort ke profiles.reports_to milik pemanggil. Menulis inquiries.won_reason -- dibaca trg_fn_quotation_auto_close_on_inquiry_closed untuk men-supersede quotation sibling.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA:
--
--   SELECT p.proname, oidvectortypes(p.proargtypes) AS arg_types, p.prosecdef
--     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname='mark_inquiry_won';
--   -- HARAP: 1 baris, arg_types='uuid, text, text, text', prosecdef=true.
--
--   -- Uji negatif (pola skrip self-rollback, verify-inquiry-won-revert.sql):
--   -- panggil mark_inquiry_won dengan p_evidence_path berawalan benar
--   -- (company_id/inquiry_id/uuid-palsu.pdf) TANPA pernah di-upload --
--   -- HARAP RAISE EXCEPTION 'File bukti tidak ditemukan di penyimpanan.'
--   -- Uji positif (regresi): jalur app normal (markInquiryWonWithEvidence,
--   -- upload dulu baru RPC) HARUS tetap sukses seperti sebelumnya.
-- =============================================================================

-- =============================================================================
-- ROLLBACK -- hapus blok EXISTS-check, kembalikan ke badan 20261021000001:
--
--   CREATE OR REPLACE FUNCTION public.mark_inquiry_won(
--     p_inquiry_id uuid, p_reason text, p_evidence_path text, p_notes text DEFAULT NULL
--   ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   -- (badan IDENTIK migrasi 20261021000001:113-185, TANPA blok EXISTS-check)
--   $$;
-- =============================================================================
