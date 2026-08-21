-- =============================================================================
-- Migration: 20260821000002_hrga_submit_approval
-- Task 1 — tutup gap otorisasi ganda pada approve/reject HRGA.
--
-- ⚠️ BELUM DIJALANKAN. Dijalankan manual di SQL Editor oleh Den.
--
-- MASALAH YANG DITUTUP (tiga, dua di antaranya bukan sekadar gap izin):
--   1. OTORISASI — approve/reject dilakukan FE lewat INSERT + UPDATE langsung
--      (useHrgaRequests.js submitApproval), tanpa memeriksa apakah pemanggil
--      adalah approver yang ditunjuk untuk (request_type_id, current_level).
--      RLS hrga_requests_update_status pun meloloskan hrga/it/finance/admin
--      se-company untuk mengubah status request MANA PUN, dan mengizinkan
--      requester menyetel status apa pun selama company cocok (self-approval
--      lewat PostgREST).
--   2. BUG NOT NULL — hrga_request_approvals.approver_role NOT NULL tanpa
--      DEFAULT dan tanpa trigger, sementara FE mengirim null. Setiap INSERT
--      approval seharusnya GAGAL. RPC ini mengisinya dari
--      hrga_approval_configs.approver_role.
--   3. BUG CHECK CONSTRAINT — FE menyetel status 'in_progress' untuk approval
--      bertingkat, padahal hrga_requests_status_check TIDAK memuat nilai itu.
--      Nilai sah yang dimaksud adalah 'under_review' (dipakai label
--      HrgaRequestDetail.jsx dan komentar App.jsx). RPC memakai 'under_review'.
--
-- ALUR STATUS: menyalin submitApproval() (src/hooks/useHrgaRequests.js:694-716)
--   apa adanya, HANYA mengganti 'in_progress' -> 'under_review'.
--
-- KENAPA RLS, BUKAN GRANT KOLOM: GRANT bekerja pada KOLOM, bukan NILAI. Ia
--   tidak bisa mengizinkan status -> 'cancelled' sambil melarang -> 'approved'.
--   Karena itu policy permisif hrga_requests_update_status DIGANTI policy
--   sempit yang hanya melayani "requester membatalkan pengajuannya sendiri"
--   (USING melihat baris LAMA, WITH CHECK melihat baris BARU). Jalur approve
--   tidak butuh policy karena RPC di bawah SECURITY DEFINER.
--   GRANT table-level hrga_requests SENGAJA tidak disentuh.
--
-- BLAST RADIUS: hrga/it/finance/admin kehilangan UPDATE langsung ke
--   hrga_requests. Disisir di src/: nol jalur tulis lain selain submitApproval
--   (pindah ke RPC ini), cancelHrgaRequest (ditampung policy baru), dan
--   hrga_requests_update_draft (tidak disentuh).
-- =============================================================================

-- ── STEP 1 — RPC approve/reject ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hrga_submit_approval(
  p_request_id uuid,
  p_action     text,
  p_comment    text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_status   text; v_level int; v_total int;
  v_company  uuid; v_type uuid;
  v_cfg_role text; v_cfg_user uuid;
  v_action   text; v_new_status text;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Aksi tidak valid: % (hanya approve/reject).', p_action;
  END IF;
  v_action := CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  SELECT status, current_level, total_levels, company_id, request_type_id
    INTO v_status, v_level, v_total, v_company, v_type
    FROM hrga_requests
   WHERE id = p_request_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Request tidak ditemukan.';
  END IF;
  IF v_status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Request sudah tidak bisa di-approve/reject (status=%).', v_status;
  END IF;

  -- Lookup ini melayani DUA hal sekaligus: sumber otorisasi DAN sumber
  -- approver_role yang NOT NULL di hrga_request_approvals.
  SELECT approver_role, approver_user_id
    INTO v_cfg_role, v_cfg_user
    FROM hrga_approval_configs
   WHERE request_type_id = v_type
     AND level           = v_level
     AND company_id      = v_company
     AND is_active       = true
   LIMIT 1;

  IF v_cfg_role IS NULL THEN
    RAISE EXCEPTION 'Belum ada konfigurasi approver untuk tipe request ini di level %.', v_level;
  END IF;

  IF NOT (is_super_admin()
          OR has_role(v_cfg_role)
          OR (v_cfg_user IS NOT NULL AND v_cfg_user = v_uid)) THEN
    RAISE EXCEPTION 'Anda bukan approver untuk request ini di level %.', v_level;
  END IF;

  INSERT INTO hrga_request_approvals
    (request_id, level, approver_id, approver_role, action, comment, actioned_at)
  VALUES
    (p_request_id, v_level, v_uid, v_cfg_role, v_action,
     NULLIF(btrim(COALESCE(p_comment, '')), ''), now());

  IF v_action = 'rejected' THEN
    v_new_status := 'rejected';
  ELSIF v_level >= v_total THEN
    v_new_status := 'approved';
  ELSE
    v_new_status := 'under_review';
  END IF;

  UPDATE hrga_requests SET
    status        = v_new_status,
    updated_by    = v_uid,
    approved_at   = CASE WHEN v_new_status = 'approved'     THEN now()      ELSE approved_at   END,
    rejected_at   = CASE WHEN v_new_status = 'rejected'     THEN now()      ELSE rejected_at   END,
    current_level = CASE WHEN v_new_status = 'under_review' THEN v_level + 1 ELSE current_level END
  WHERE id = p_request_id;
END; $$;

REVOKE ALL ON FUNCTION public.hrga_submit_approval(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hrga_submit_approval(uuid, text, text) TO authenticated;

-- ── STEP 2 — persempit RLS UPDATE hrga_requests ─────────────────────────────
DROP POLICY IF EXISTS hrga_requests_update_status ON public.hrga_requests;

CREATE POLICY hrga_requests_cancel_own ON public.hrga_requests
  FOR UPDATE TO authenticated
  USING      (requester_id = auth.uid() AND status = 'submitted')
  WITH CHECK (requester_id = auth.uid() AND status = 'cancelled');
