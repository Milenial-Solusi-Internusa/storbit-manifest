-- =============================================================================
-- Migration: 20261027000006_prf_remind_and_cancel_request
-- Putaran 10, D-83/D-84 -- dua RPC BARU (nama baru, TANPA menggantikan atau
-- menghapus fungsi lama): prf_remind_procurement, prf_cancel_request.
-- Mockup Inquiry Management.dc.html, Detail/Procurement rReqs[] -- tombol
-- "Remind Procurement" / "Cancel Request" per rate request.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun
-- production. Dijalankan Mas sendiri di SQL Editor staging -- sesi ini
-- tidak menjalankan SQL apa pun.
--
-- RAISE EXCEPTION, judul, dan isi notifikasi di KEDUA RPC baru ini memakai
-- Bahasa Inggris (beda dari mark_inquiry_won/revert_manual_win yang
-- Indonesia) -- keduanya fungsi BARU lahir di Putaran 10, tanpa riwayat
-- bahasa yang harus diseragamkan ke badan lama.
--
-- Kolom yang dipakai (prf; semuanya SUDAH ADA, nol ALTER TABLE di migrasi
-- ini): company_id, status, created_by, acknowledged_by, prf_no. Gate kedua
-- RPC: created_by = auth.uid() ATAU is_manager_or_above_in(company_id)
-- ATAU is_super_admin() -- pembuat PRF (sales yang mengajukan) atau
-- manajerial DI ENTITAS PRF itu, pola sama mark_inquiry_won. Status wajib
-- SUBMITTED/ACKNOWLEDGED untuk KEDUANYA (mockup q.active) -- gerbang FE
-- (DealDetailPage.jsx, canActOnPrf/isPrfRequestActive) HARUS sinkron
-- dengan ini.
--
-- prf_remind_procurement: jika PRF sudah di-claim (acknowledged_by terisi)
-- -> notifikasi ke staff itu saja; jika belum -> broadcast ke SELURUH
-- pemegang role proc_manager/proc_staff di entitas PRF. Nol efek ke tabel
-- prf/inquiries -- hanya INSERT ke notifications + audit_logs. Cooldown
-- SATU JAM per PRF (kolom waktu audit_logs = created_at, diverifikasi ke
-- schema_snapshot.sql CREATE TABLE public.audit_logs sebelum menulis cek
-- ini -- bukan ditebak) supaya tombolnya tidak bisa diklik berulang jadi
-- spam notifikasi.
--
-- prf_cancel_request: SUBMITTED/ACKNOWLEDGED -> CANCELLED. PRF yang sudah
-- QUOTED (punya penawaran vendor tersimpan di prf_vendor_offers/
-- prf_cost_items) DITOLAK KERAS -- jalur ini bukan untuk membatalkan
-- request yang sudah dijawab Procurement; CANCELLED/EXPIRED/DRAFT juga
-- ditolak (bukan transisi yang sah dari sini). TIDAK menyentuh
-- inquiries.status (butir 9, instruksi Mas). p_reason OPSIONAL (mockup
-- tidak punya field/modal alasan untuk tombol ini -- nol
-- data-screen-label="Modal/Cancel*" di file sumber), hanya tersimpan di
-- audit_logs.notes -- TIDAK ADA kolom baru di tabel prf.
-- =============================================================================

BEGIN;

CREATE FUNCTION public.prf_remind_procurement(p_prf_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company_id uuid; v_status text; v_created_by uuid; v_ack uuid; v_prf_no text;
  v_user_email text; v_user_full_name text; v_user_role text;
  v_notified_count int := 0;
BEGIN
  SELECT company_id, status, created_by, acknowledged_by, prf_no
    INTO v_company_id, v_status, v_created_by, v_ack, v_prf_no
  FROM public.prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF not found.';
  END IF;

  IF v_status NOT IN ('SUBMITTED','ACKNOWLEDGED') THEN
    RAISE EXCEPTION 'PRF with status % cannot be reminded -- only PRFs still awaiting Procurement (Submitted/Acknowledged).', v_status;
  END IF;

  IF NOT (
    v_created_by = auth.uid()
    OR public.is_manager_or_above_in(v_company_id)
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Only the PRF creator, a Manager or above in this entity, or a Super Admin can send a reminder.';
  END IF;

  -- Cooldown 1 jam per PRF, kolom waktu = audit_logs.created_at (diverifikasi
  -- ke schema_snapshot.sql, bukan ditebak -- audit_logs tidak punya kolom
  -- "logged_at"/"changed_at").
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'PRF_REMIND_PROCUREMENT' AND entity_type = 'PRF' AND entity_id = p_prf_id
      AND created_at > now() - interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'A reminder for this PRF was already sent less than an hour ago.';
  END IF;

  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  BEGIN
    IF v_ack IS NOT NULL THEN
      -- Sudah di-claim satu staff -- kirim ke dia saja.
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      SELECT p.company_id, p.id, 'prf_reminder', 'Reminder: PRF awaiting your answer',
             COALESCE(v_user_full_name, v_user_email) || ' reminded you that PRF ' || v_prf_no || ' is still awaiting your answer.',
             'prf', p_prf_id
      FROM public.profiles p WHERE p.id = v_ack AND p.active = true;
      GET DIAGNOSTICS v_notified_count = ROW_COUNT;
    ELSE
      -- Belum di-claim siapa pun -- broadcast ke seluruh staff procurement
      -- (proc_manager/proc_staff) di entitas PRF ini.
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      SELECT p.company_id, p.id, 'prf_reminder', 'Reminder: PRF awaiting answer',
             COALESCE(v_user_full_name, v_user_email) || ' reminded Procurement that PRF ' || v_prf_no || ' is still awaiting an answer.',
             'prf', p_prf_id
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.profiles p ON p.id = ur.user_id AND p.active = true
      WHERE ur.company_id = v_company_id AND ur.is_active = true
        AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
        AND r.code IN ('proc_manager','proc_staff');
      GET DIAGNOSTICS v_notified_count = ROW_COUNT;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_notified_count := -1; -- best-effort, jangan gagalkan RPC
  END;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'PRF_REMIND_PROCUREMENT', 'PRF', p_prf_id, v_prf_no,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', v_status, 'notified_count', v_notified_count),
          NULL);
END; $$;

REVOKE ALL ON FUNCTION public.prf_remind_procurement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prf_remind_procurement(uuid) TO authenticated;

COMMENT ON FUNCTION public.prf_remind_procurement(uuid) IS
  'Send a Procurement reminder notification for one PRF (NEW function, Putaran 10, D-83). Gate: created_by = auth.uid() OR is_manager_or_above_in(company_id) OR is_super_admin(). Status must be SUBMITTED/ACKNOWLEDGED. Cooldown: rejected if a PRF_REMIND_PROCUREMENT audit_logs row for this prf_id exists within the last hour. If acknowledged_by is set, notify that staff only; otherwise broadcast to every proc_manager/proc_staff in the PRF entity. Best-effort notification, never mutates table prf.';

CREATE FUNCTION public.prf_cancel_request(p_prf_id uuid, p_reason text DEFAULT NULL) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company_id uuid; v_status text; v_created_by uuid; v_ack uuid; v_prf_no text;
  v_user_email text; v_user_full_name text; v_user_role text;
BEGIN
  SELECT company_id, status, created_by, acknowledged_by, prf_no
    INTO v_company_id, v_status, v_created_by, v_ack, v_prf_no
  FROM public.prf WHERE id = p_prf_id AND deleted_at IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF not found.';
  END IF;

  -- Sudah diproses Procurement (ada penawaran vendor) -- tidak bisa
  -- dibatalkan lewat jalur ini. CANCELLED/EXPIRED/DRAFT juga ditolak (bukan
  -- transisi yang sah dari sini).
  IF v_status NOT IN ('SUBMITTED','ACKNOWLEDGED') THEN
    RAISE EXCEPTION 'PRF with status % cannot be cancelled this way -- only PRFs still awaiting an answer (Submitted/Acknowledged). A Quoted PRF already has vendor offers on record.', v_status;
  END IF;

  IF NOT (
    v_created_by = auth.uid()
    OR public.is_manager_or_above_in(v_company_id)
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Only the PRF creator, a Manager or above in this entity, or a Super Admin can cancel this request.';
  END IF;

  UPDATE public.prf
  SET status = 'CANCELLED', updated_by = auth.uid(), updated_at = now()
  WHERE id = p_prf_id;

  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'PRF_CANCEL_REQUEST', 'PRF', p_prf_id, v_prf_no,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'CANCELLED'),
          p_reason);

  -- Best-effort: beri tahu staff yang sudah claim (kalau ada) bahwa
  -- permintaannya dibatalkan sales. Belum di-claim -> nol penerima
  -- spesifik, nol notifikasi (bukan broadcast -- beda dari Remind).
  IF v_ack IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      SELECT p.company_id, p.id, 'prf_cancelled', 'PRF cancelled',
             COALESCE(v_user_full_name, v_user_email) || ' cancelled PRF ' || v_prf_no ||
             COALESCE('. Reason: ' || p_reason, '.'),
             'prf', p_prf_id
      FROM public.profiles p WHERE p.id = v_ack AND p.active = true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.prf_cancel_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prf_cancel_request(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.prf_cancel_request(uuid, text) IS
  'Cancel a PRF still awaiting an answer (NEW function, Putaran 10, D-84). SUBMITTED/ACKNOWLEDGED -> CANCELLED. Same gate as prf_remind_procurement. A Quoted/Cancelled/Expired/Draft PRF is rejected. p_reason is optional (the mockup has no reason field/modal for this button) and is stored ONLY in audit_logs.notes -- no new column on table prf. Does not touch inquiries.status. Best-effort notification to acknowledged_by, if set.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA:
--
--   SELECT proname, oidvectortypes(proargtypes), prosecdef FROM pg_proc
--    WHERE proname IN ('prf_remind_procurement','prf_cancel_request');
--   -- HARAP: 2 baris baru, prosecdef=true keduanya.
--
--   -- Uji negatif prf_cancel_request: panggil pada PRF status QUOTED ->
--   -- HARAP RAISE EXCEPTION. Panggil sebagai user bukan created_by/bukan
--   -- manager di entitas PRF -> HARAP RAISE EXCEPTION.
--   -- Uji negatif prf_remind_procurement: panggil dua kali berturut-turut
--   -- pada PRF yang sama dalam 1 jam -> panggilan kedua HARAP RAISE
--   -- EXCEPTION 'A reminder for this PRF was already sent less than an
--   -- hour ago.'
--   -- Uji positif: acknowledged_by terisi -> 1 baris notifications ke staff
--   -- itu; acknowledged_by NULL -> N baris ke proc_manager/proc_staff
--   -- entitas PRF.
-- =============================================================================

-- =============================================================================
-- ROLLBACK -- hapus kedua fungsi (urutan terbalik):
--
--   REVOKE ALL ON FUNCTION public.prf_cancel_request(uuid, text) FROM authenticated;
--   -- hapus fungsi public.prf_cancel_request(uuid, text)
--   REVOKE ALL ON FUNCTION public.prf_remind_procurement(uuid) FROM authenticated;
--   -- hapus fungsi public.prf_remind_procurement(uuid)
--
--   Nol dampak ke tabel prf -- kedua fungsi baru tidak membawa kolom baru
--   dan tidak mengubah fungsi/trigger yang sudah ada.
-- =============================================================================
