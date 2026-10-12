-- =============================================================================
-- 20261012000002_crm_lead_pool_rpc.sql
--
-- Batch DS 3 Lead Management, irisan 7 Bagian 2 (Paket 2) -- file 2/4
-- (RPC). Bergantung pada file 1 (kolom accounts/companies,
-- account_pool_history, has_menu_permission_in).
--
-- Status: BELUM DIJALANKAN.
--
-- Empat RPC siklus pool, semua SECURITY DEFINER, SET search_path public,
-- REVOKE ALL FROM PUBLIC, GRANT EXECUTE TO authenticated, menulis riwayat
-- ke account_pool_history. Gerbang izin SEMUANYA lewat
-- has_menu_permission_in(company_id, 'crm_lead_pool_approval', 'view') --
-- BUKAN level peran -- supaya Finance (manager/finance_controller, level
-- <= 6) tidak ikut meski level-nya tinggi. Pola precondition-di-WHERE-
-- UPDATE (bukan FOR UPDATE eksplisit) mengikuti
-- approve_dropdown_option_request/reject_dropdown_option_request
-- (20261011000002) -- panggilan ganda yang balapan gagal natural lewat
-- 0-baris-terupdate, bukan lewat lock.
--
-- lead_pool_release(p_account_id, p_reason)
--   Pemilik (assigned_to=auth.uid()) ATAU pemegang izin persetujuan di
--   entitas akun. Alasan wajib (non-kosong). Efek: is_in_lead_pool=true,
--   lead_pool_last_owner=pemilik lama, assigned_to=NULL,
--   lead_pool_reason/lead_pool_at terisi, SEMUA kolom pull_* direset
--   (bukan cuma sebagian -- release = siklus pool yang benar-benar baru).
--
-- lead_pool_request_pull(p_account_id, p_reason)
--   Siapa pun yang authenticated (nol gerbang peran -- siapa saja yang
--   melihat pool boleh mengajukan, sejalan crm_lead_pool yang sudah luas
--   diizinkan). Akun harus is_in_lead_pool=true DAN pull_status NULL atau
--   'rejected' (retry sesudah ditolak). Alasan wajib, MINIMAL 20 karakter
--   (instruksi eksplisit). pull_rejection_reason ikut dikosongkan saat
--   mengajukan ulang -- bukan instruksi eksplisit, tapi konsekuensi wajar
--   "retry sesudah ditolak" (alasan penolakan LAMA tak relevan lagi untuk
--   pengajuan BARU).
--
-- lead_pool_approve_pull(p_account_id)
--   Pemegang izin persetujuan di entitas akun DAN BUKAN pengaju sendiri
--   (guard self-approval). Syarat: pull_status='pending'. Efek:
--   assigned_to=pull_requested_by, is_in_lead_pool=false,
--   last_activity_at=now(), is_stale dikosongkan, kolom pull_* request
--   direset TAPI pull_approved_by/pull_approved_at DIISI (bukan direset --
--   itu rekaman "siapa/kapan tarikan terakhir disetujui", bertahan lepas
--   dari pull_status kembali NULL). lifecycle_stage free_agent -> customer
--   (satu-satunya transisi tahap di sini); account_status SENGAJA TIDAK
--   disentuh -- kolom itu "DIPENSIUNKAN sejak 7 Sep 2026" (komentar
--   kolomnya sendiri) dan pola PALING BARU yang menyentuh lifecycle
--   (set_prospect_on_inquiry, migrasi 20260908000002) sudah berhenti
--   dual-write ke sana; mengikuti pola lama set_sql_on_quotation_sent
--   yang MASIH dual-write di sini akan jadi langkah mundur. pipeline_stage
--   TIDAK disentuh (instruksi eksplisit).
--
-- lead_pool_reject_pull(p_account_id, p_reason)
--   Gerbang sama dengan approve (izin + bukan pengaju sendiri). Alasan
--   wajib. Efek: pull_status='rejected', pull_rejection_reason=alasan --
--   pull_justification (alasan PENGAJUAN asli) TIDAK disentuh, persis
--   instruksi.
--
-- -- lead_pool_sweep_deactivated_owner(p_user_id) -- RANCANGAN, service_role ONLY
-- Dipanggil Edge Function set-user-status SAAT user dinonaktifkan (irisan
-- BERIKUTNYA yang mengubah kode Edge Function-nya -- lihat laporan akhir
-- untuk rancangan perubahannya). Fungsi DB-nya sendiri CUKUP SEDERHANA
-- untuk ditulis sekarang (instruksi eksplisit):
--   - Akun milik p_user_id TANPA inquiry terbuka (status NOT IN
--     ('WON','LOST','CANCELLED')) DAN TANPA quotation terbuka (status NOT
--     IN ('ACCEPTED','REJECTED','SUPERSEDED')) -> MASUK POOL (pemilik
--     dikosongkan, pemilik terakhir dicatat, riwayat enter_pool).
--   - Akun dengan inquiry/quotation terbuka -> TIDAK dipool, dikembalikan
--     sebagai baris 'needs_reassignment' di hasil (tabel) supaya pemanggil
--     (Edge Function) bisa melaporkannya ke supervisor -- TIDAK ada
--     penyimpanan "daftar perlu dialihkan" yang persisten di file ini;
--     tabel hasil RETURNS TABLE cukup untuk satu panggilan sinkron.
--   - Cakupan lifecycle_stage: SEMUA akun milik user itu KECUALI 'lost'
--     dan 'free_agent' -- SATU keputusan desain YANG BUKAN instruksi
--     eksplisit, ditandai jelas di komentar fungsi + laporan akhir supaya
--     Den bisa mengoreksi sebelum Edge Function benar-benar memanggilnya.
--     'lost': lead mati, memasukkannya ke pool tak berguna untuk siapa
--     pun. 'free_agent': sudah berada di jalur dormansi customer
--     tersendiri (belum dibangun, irisan 8+) -- menyeretnya ke mekanisme
--     pool lead berisiko tabrakan dengan mekanisme itu nanti.
--
-- !! BAHAYA GRANT: fungsi ini TIDAK memeriksa auth.uid() sama sekali --
--    ia percaya p_user_id dari pemanggil (Edge Function, sesudah Edge
--    Function sendiri memverifikasi hak admin). Kalau GRANT EXECUTE
--    sampai ke `authenticated`, SIAPA PUN yang login bisa memaksa akun
--    siapa pun masuk pool dengan memanggil RPC ini langsung dengan
--    p_user_id sembarang -- eskalasi privilege. GRANT HANYA ke
--    service_role, REVOKE ALL FROM PUBLIC (otomatis mencakup
--    authenticated -- tidak ada GRANT terpisah ke authenticated di sini,
--    beda dari 4 RPC di atas).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.lead_pool_release(p_account_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account public.accounts;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Alasan pelepasan wajib diisi';
  END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;

  IF NOT (v_account.assigned_to = auth.uid()
          OR public.has_menu_permission_in(v_account.company_id, 'crm_lead_pool_approval', 'view')) THEN
    RAISE EXCEPTION 'Hanya pemilik atau pemegang izin persetujuan Lead Pool di entitas ini yang boleh melepas akun';
  END IF;

  UPDATE public.accounts SET
    is_in_lead_pool       = true,
    lead_pool_last_owner  = v_account.assigned_to,
    assigned_to           = NULL,
    lead_pool_reason      = p_reason,
    lead_pool_at          = now(),
    pull_justification    = NULL,
    pull_requested_at     = NULL,
    pull_requested_by     = NULL,
    pull_approved_by      = NULL,
    pull_approved_at      = NULL,
    pull_status           = NULL,
    pull_rejection_reason = NULL,
    is_stale              = false,
    stale_flagged_at      = NULL
  WHERE id = p_account_id;

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, new_owner, reason)
    VALUES (p_account_id, v_account.company_id, 'release', auth.uid(), v_account.assigned_to, NULL, p_reason);
END $$;

COMMENT ON FUNCTION public.lead_pool_release(uuid, text) IS 'Lepas akun ke Lead Pool: assigned_to dikosongkan, lead_pool_last_owner mencatat pemilik lama. Pemilik sendiri atau pemegang izin crm_lead_pool_approval di entitas akun. Alasan wajib.';

CREATE FUNCTION public.lead_pool_request_pull(p_account_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account public.accounts;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'Alasan tarikan wajib diisi, minimal 20 karakter';
  END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;
  IF NOT v_account.is_in_lead_pool THEN
    RAISE EXCEPTION 'Akun tidak sedang di Lead Pool';
  END IF;
  IF v_account.pull_status IS NOT NULL AND v_account.pull_status <> 'rejected' THEN
    RAISE EXCEPTION 'Sudah ada permintaan tarikan aktif untuk akun ini';
  END IF;

  UPDATE public.accounts SET
    pull_status           = 'pending',
    pull_requested_at     = now(),
    pull_requested_by     = auth.uid(),
    pull_justification    = p_reason,
    pull_rejection_reason = NULL
  WHERE id = p_account_id;

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, reason)
    VALUES (p_account_id, v_account.company_id, 'request_pull', auth.uid(), p_reason);
END $$;

COMMENT ON FUNCTION public.lead_pool_request_pull(uuid, text) IS 'Ajukan klaim atas akun di Lead Pool. Siapa pun yang authenticated boleh mengajukan (nol gerbang peran). Syarat: akun di pool, nol permintaan pending/approved aktif. Alasan wajib, minimal 20 karakter.';

CREATE FUNCTION public.lead_pool_approve_pull(p_account_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account public.accounts;
BEGIN
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;
  IF NOT public.has_menu_permission_in(v_account.company_id, 'crm_lead_pool_approval', 'view') THEN
    RAISE EXCEPTION 'Tidak punya izin menyetujui tarikan Lead Pool di entitas ini';
  END IF;
  IF v_account.pull_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Tidak ada permintaan tarikan yang menunggu untuk akun ini';
  END IF;
  IF v_account.pull_requested_by = auth.uid() THEN
    RAISE EXCEPTION 'Pengaju tidak boleh menyetujui permintaannya sendiri';
  END IF;

  UPDATE public.accounts SET
    assigned_to           = v_account.pull_requested_by,
    is_in_lead_pool        = false,
    last_activity_at       = now(),
    is_stale               = false,
    stale_flagged_at       = NULL,
    pull_justification     = NULL,
    pull_requested_at      = NULL,
    pull_requested_by      = NULL,
    pull_status            = NULL,
    pull_rejection_reason  = NULL,
    pull_approved_by       = auth.uid(),
    pull_approved_at       = now(),
    lifecycle_stage        = CASE WHEN lifecycle_stage = 'free_agent' THEN 'customer' ELSE lifecycle_stage END
  WHERE id = p_account_id;

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, new_owner)
    VALUES (p_account_id, v_account.company_id, 'approve_pull', auth.uid(), v_account.pull_requested_by);
END $$;

COMMENT ON FUNCTION public.lead_pool_approve_pull(uuid) IS 'Setujui tarikan: assigned_to -> pull_requested_by, akun keluar pool. Pemegang izin crm_lead_pool_approval di entitas akun, BUKAN pengaju sendiri. free_agent -> customer kalau relevan; pipeline_stage dan account_status (dipensiunkan) TIDAK disentuh.';

CREATE FUNCTION public.lead_pool_reject_pull(p_account_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account public.accounts;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;

  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;
  IF NOT public.has_menu_permission_in(v_account.company_id, 'crm_lead_pool_approval', 'view') THEN
    RAISE EXCEPTION 'Tidak punya izin menolak tarikan Lead Pool di entitas ini';
  END IF;
  IF v_account.pull_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Tidak ada permintaan tarikan yang menunggu untuk akun ini';
  END IF;
  IF v_account.pull_requested_by = auth.uid() THEN
    RAISE EXCEPTION 'Pengaju tidak boleh menolak permintaannya sendiri';
  END IF;

  UPDATE public.accounts SET
    pull_status           = 'rejected',
    pull_rejection_reason = p_reason
  WHERE id = p_account_id;

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, reason)
    VALUES (p_account_id, v_account.company_id, 'reject_pull', auth.uid(), p_reason);
END $$;

COMMENT ON FUNCTION public.lead_pool_reject_pull(uuid, text) IS 'Tolak tarikan: pull_status -> rejected, pull_rejection_reason terisi (pull_justification/alasan pengajuan asli TIDAK disentuh). Gerbang sama dengan approve (izin + bukan pengaju sendiri). Alasan wajib. Akun TETAP di pool -- pengaju lain (atau yang sama, lewat request_pull ulang) masih bisa mencoba.';

REVOKE ALL ON FUNCTION public.lead_pool_release(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_pool_request_pull(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_pool_approve_pull(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_pool_reject_pull(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_release(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_pool_request_pull(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_pool_approve_pull(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_pool_reject_pull(uuid, text) TO authenticated;

-- =============================================================================
-- lead_pool_sweep_deactivated_owner -- RANCANGAN, service_role ONLY. Lihat
-- peringatan GRANT di header berkas.
-- =============================================================================
CREATE FUNCTION public.lead_pool_sweep_deactivated_owner(p_user_id uuid)
  RETURNS TABLE(account_id uuid, action text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.id, a.company_id, a.assigned_to
    FROM public.accounts a
    WHERE a.assigned_to = p_user_id
      AND a.deleted_at IS NULL
      AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
      AND NOT EXISTS (
        SELECT 1 FROM public.inquiries i
        WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
          AND i.deleted_at IS NULL
          AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.quotations q
        WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
          AND q.deleted_at IS NULL
          AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
      )
  LOOP
    UPDATE public.accounts SET
      is_in_lead_pool      = true,
      lead_pool_last_owner = p_user_id,
      assigned_to          = NULL,
      lead_pool_reason     = 'Owner account deactivated',
      lead_pool_at         = now()
    WHERE id = r.id;

    INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
      VALUES (r.id, r.company_id, 'enter_pool', p_user_id, p_user_id, 'Owner account deactivated');

    account_id := r.id; action := 'pooled';
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT a.id
    FROM public.accounts a
    WHERE a.assigned_to = p_user_id
      AND a.deleted_at IS NULL
      AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
      AND (
        EXISTS (
          SELECT 1 FROM public.inquiries i
          WHERE (i.prospect_id = a.id OR i.customer_id = a.id)
            AND i.deleted_at IS NULL
            AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
        )
        OR EXISTS (
          SELECT 1 FROM public.quotations q
          WHERE (q.prospect_id = a.id OR q.customer_id = a.id)
            AND q.deleted_at IS NULL
            AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
        )
      )
  LOOP
    account_id := r.id; action := 'needs_reassignment';
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) IS 'RANCANGAN -- dipanggil Edge Function set-user-status (perubahan kodenya irisan BERIKUTNYA) saat user dinonaktifkan. Akun tanpa inquiry/quotation TERBUKA masuk pool (dicatat enter_pool); akun dengan inquiry/quotation terbuka dikembalikan sebagai ''needs_reassignment'' (TIDAK dipool). Cakupan lifecycle_stage: SEMUA KECUALI lost/free_agent -- keputusan desain sendiri, BUKAN instruksi eksplisit, lihat laporan akhir. !! GRANT HANYA service_role -- fungsi ini TIDAK memeriksa auth.uid(), percaya p_user_id dari pemanggil. GRANT ke authenticated = eskalasi privilege.';

REVOKE ALL ON FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) TO service_role;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('lead_pool_release','lead_pool_request_pull',
--                     'lead_pool_approve_pull','lead_pool_reject_pull',
--                     'lead_pool_sweep_deactivated_owner')
--  ORDER BY proname;
-- -- Harap: 5 baris. Keempat RPC pertama: proacl memuat authenticated=X,
-- --        TANPA PUBLIC. lead_pool_sweep_deactivated_owner: proacl memuat
-- --        service_role=X, TANPA authenticated DAN TANPA PUBLIC -- kalau
-- --        authenticated muncul di sini, STOP, GRANT salah (lihat
-- --        peringatan header).
--
-- -- Uji alur (JANGAN dijalankan di produksi tanpa akun uji -- staging,
-- -- lewat token user sungguhan, bukan SQL Editor service_role yang nol
-- -- auth.uid()):
-- -- 1. lead_pool_release(<id akun milik sendiri>, 'uji pelepasan') sebagai
-- --    pemiliknya -- harap sukses, is_in_lead_pool true, assigned_to NULL.
-- -- 2. lead_pool_request_pull(<id akun di atas>, '<reason minimal 20
-- --    karakter>') sebagai user LAIN -- harap sukses, pull_status pending.
-- -- 3. lead_pool_approve_pull(<id akun>) sebagai PENGAJU SENDIRI -- harap
-- --    GAGAL "Pengaju tidak boleh menyetujui permintaannya sendiri".
-- -- 4. lead_pool_approve_pull(<id akun>) sebagai pemegang izin
-- --    crm_lead_pool_approval (BUKAN pengaju) -- harap sukses, assigned_to
-- --    = pengaju, is_in_lead_pool false.
-- -- 5. SELECT event_type, actor_id, previous_owner, new_owner FROM
-- --    public.account_pool_history WHERE account_id=<id akun> ORDER BY
-- --    occurred_at;
-- -- -- Harap 3 baris: release, request_pull, approve_pull -- new_owner
-- --    baris approve_pull = pengaju langkah 2.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (kalau perlu dibatalkan sebelum ada baris ditulis via RPC ini):
--   DROP FUNCTION public.lead_pool_sweep_deactivated_owner(uuid);
--   DROP FUNCTION public.lead_pool_reject_pull(uuid, text);
--   DROP FUNCTION public.lead_pool_approve_pull(uuid);
--   DROP FUNCTION public.lead_pool_request_pull(uuid, text);
--   DROP FUNCTION public.lead_pool_release(uuid, text);
-- =============================================================================
