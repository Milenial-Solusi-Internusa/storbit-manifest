-- =============================================================================
-- 20261012000006_crm_lead_pool_notifications.sql
--
-- Batch DS 3 Lead Management, irisan 9 Paket 2 -- notifikasi RPC + RPC
-- lead_pool_assign + pengerasan lead_pool_release + dua trigger baru
-- (auto-release akun pool yang jadi Lost/Archived; blokir inquiry baru
-- untuk akun yang sedang di pool). Bergantung pada migrasi 20261012000001
-- (kolom accounts/companies, account_pool_history, has_menu_permission_in,
-- lead_pool_approvers) dan 20261012000002 (empat RPC asli, badan dasar
-- disalin dari versi yang LIVE di staging -- lihat catatan per fungsi).
--
-- Status: BELUM DIJALANKAN.
--
-- =============================================================================
-- RINGKASAN PERUBAHAN
-- =============================================================================
-- 1. account_pool_history.event_type CHECK dilebarkan +'assign' +'auto_release'.
-- 2. lead_pool_request_pull / lead_pool_approve_pull / lead_pool_reject_pull
--    -- CREATE OR REPLACE, badan dasar SAMA PERSIS dengan 20261012000002,
--    hanya DITAMBAH insert notifikasi (best-effort, EXCEPTION-wrapped).
--    Tanda tangan TIDAK berubah -- ACL (REVOKE PUBLIC/GRANT authenticated
--    dari file 2) TIDAK disentuh ulang di sini, CREATE OR REPLACE
--    mempertahankannya.
-- 3. lead_pool_release -- CREATE OR REPLACE, +4 guard baru (sudah di pool /
--    tanpa pemilik / bukan lead-mql / masih ada inquiry-quotation terbuka).
--    Tanda tangan TIDAK berubah, ACL TIDAK disentuh ulang.
-- 4. lead_pool_assign(uuid, uuid) -- RPC BARU, efek sama dengan
--    approve_pull tapi target ditentukan pemanggil (bukan pull_requested_by).
-- 5. Trigger BARU trg_b_lead_pool_auto_release BEFORE UPDATE ON accounts --
--    saat akun yang SEDANG di pool berpindah ke lifecycle_stage='lost' atau
--    di-soft-delete, keluarkan dari pool + tutup pull pending + catat
--    riwayat 'auto_release'. Nama 'trg_b_' SENGAJA (lihat §Urutan Trigger).
-- 6. Trigger BARU trg_block_inquiry_for_pooled_account BEFORE INSERT ON
--    inquiries -- tolak INSERT kalau akun rujukannya (prospect_id/
--    customer_id) sedang is_in_lead_pool=true.
--
-- =============================================================================
-- KEDUA FUNGSI TRIGGER BARU WAJIB SECURITY DEFINER (keputusan Den, irisan 9)
-- =============================================================================
-- trg_fn_lead_pool_auto_release -- menulis account_pool_history (authenticated
--   HANYA punya SELECT di tabel itu, lihat migrasi 20261012000001 §account_
--   pool_history -- "nol policy tulis untuk authenticated") dan notifications.
--   Sebagai invoker, INSERT account_pool_history akan ditolak RLS untuk
--   SETIAP pemanggil non-service_role -- trigger akan GAGAL tepat saat
--   paling dibutuhkan (user biasa menandai Lost/Archive lewat UI).
-- trg_fn_block_inquiry_for_pooled_account -- MEMBACA accounts. Sebagai
--   invoker, RLS accounts bisa menyembunyikan baris akun dari pemanggil
--   (mis. akun di pool yang assigned_to-nya NULL, kalau RLS SELECT
--   men-scope ke assigned_to=auth.uid() OR company match tertentu) --
--   lookup kosong lalu guard "kalau ketemu dan is_in_lead_pool, tolak"
--   LOLOS DIAM-DIAM karena baris dianggap "tidak ada", bukan "ada tapi
--   tak boleh dipakai". SECURITY DEFINER menjamin trigger selalu melihat
--   baris akun yang sebenarnya, terlepas dari RLS SELECT pemanggil.
-- Keduanya REVOKE EXECUTE FROM PUBLIC -- trigger tetap menyala lewat
-- mekanisme trigger Postgres (bukan dipanggil sebagai fungsi biasa oleh
-- role mana pun), jadi REVOKE tidak mematikannya.
--
-- =============================================================================
-- URUTAN TRIGGER BEFORE UPDATE DI accounts (keputusan Den, laporan di akhir
-- sesi juga mengutip ini) -- Postgres menjalankan trigger timing yang SAMA
-- berurutan ALFABETIS per nama. BEFORE UPDATE yang sudah ada (schema_
-- snapshot.sql, diverifikasi):
--   trg_a_sync_lifecycle_columns   (sync_lifecycle_columns)
--   trg_z_gen_customer_code_upd    (generate_customer_code, kondisional)
--   trg_z_track_stage_change       (track_stage_change)
-- Trigger baru bernama trg_b_lead_pool_auto_release -- 'b' > 'a' dan < 'z',
-- sehingga urutan FINAL:
--   1. trg_a_sync_lifecycle_columns
--   2. trg_b_lead_pool_auto_release   <-- BARU
--   3. trg_z_gen_customer_code_upd
--   4. trg_z_track_stage_change
-- Trigger baru WAJIB menyala SESUDAH (1): account_status (kolom lama,
-- "dipensiunkan" tapi masih dual-write) bisa ditulis TANPA menyentuh
-- lifecycle_stage secara eksplisit -- trg_a_sync_lifecycle_columns yang
-- menyalin account_status ke NEW.lifecycle_stage SEBELUM WHEN clause
-- trigger baru dievaluasi. Tanpa urutan ini, update yang hanya mengisi
-- account_status='lost' tidak akan tertangkap. Urutan terhadap (3)/(4)
-- tidak relevan -- trigger baru tidak membaca/menulis code atau
-- stage_changed_at.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Lebarkan account_pool_history.event_type: +'assign' +'auto_release'.
--    Nama constraint = default Postgres untuk CHECK kolom tunggal tanpa nama
--    eksplisit di migrasi 20261012000001 ({table}_{column}_check).
-- -----------------------------------------------------------------------------
ALTER TABLE public.account_pool_history DROP CONSTRAINT account_pool_history_event_type_check;
ALTER TABLE public.account_pool_history ADD CONSTRAINT account_pool_history_event_type_check
  CHECK (event_type IN ('enter_pool', 'release', 'request_pull', 'approve_pull', 'reject_pull', 'owner_cleared', 'assign', 'auto_release'));

-- -----------------------------------------------------------------------------
-- 2a. lead_pool_request_pull -- badan dasar PERSIS 20261012000002, +notifikasi.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_pool_request_pull(p_account_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account public.accounts;
  v_requester_name text;
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

  -- BARU: notifikasi ke seluruh lead_pool_approvers(company) KECUALI pengaju
  -- sendiri. EXCEPTION-wrapped (best-effort) -- disetujui Den sebagai Risiko
  -- #5 irisan sebelumnya, supaya gagal kirim notifikasi TIDAK membatalkan
  -- pengajuan tarikan itu sendiri.
  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();
  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    SELECT v_account.company_id, approver_id, 'lead_pool_pull_request',
           'Request to Claim Prospect from Lead Pool',
           coalesce(v_requester_name, 'Someone') || ' requested to claim ' || v_account.name ||
             ' from the Lead Pool. Justification: ' || substr(p_reason, 1, 50),
           'lead_pool', p_account_id
    FROM public.lead_pool_approvers(v_account.company_id) AS approver_id
    WHERE approver_id <> auth.uid();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

COMMENT ON FUNCTION public.lead_pool_request_pull(uuid, text) IS 'Ajukan klaim atas akun di Lead Pool. Siapa pun yang authenticated boleh mengajukan (nol gerbang peran). Syarat: akun di pool, nol permintaan pending/approved aktif. Alasan wajib, minimal 20 karakter. Notifikasi ke lead_pool_approvers(company) kecuali pengaju, best-effort.';

-- -----------------------------------------------------------------------------
-- 2b. lead_pool_approve_pull -- badan dasar PERSIS 20261012000002, +notifikasi.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_pool_approve_pull(p_account_id uuid) RETURNS void
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

  -- BARU: notifikasi ke pengaju (pull_requested_by DIBACA SEBELUM UPDATE
  -- mengosongkannya -- v_account adalah snapshot lokal, tidak ikut berubah).
  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_account.company_id, v_account.pull_requested_by, 'lead_pool_pull_result',
      'Pull Request Approved',
      'Pull request for ' || v_account.name || ' has been approved. The prospect is now assigned to you.',
      'lead_pool', p_account_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

COMMENT ON FUNCTION public.lead_pool_approve_pull(uuid) IS 'Setujui tarikan: assigned_to -> pull_requested_by, akun keluar pool. Pemegang izin crm_lead_pool_approval di entitas akun, BUKAN pengaju sendiri. free_agent -> customer kalau relevan; pipeline_stage dan account_status (dipensiunkan) TIDAK disentuh. Notifikasi ke pengaju, best-effort.';

-- -----------------------------------------------------------------------------
-- 2c. lead_pool_reject_pull -- badan dasar PERSIS 20261012000002, +notifikasi.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_pool_reject_pull(p_account_id uuid, p_reason text) RETURNS void
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

  -- BARU: notifikasi ke pengaju, menyertakan alasan penolakan (instruksi Den).
  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_account.company_id, v_account.pull_requested_by, 'lead_pool_pull_result',
      'Pull Request Rejected',
      'Pull request for ' || v_account.name || ' was rejected. Reason: ' || p_reason,
      'lead_pool', p_account_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

COMMENT ON FUNCTION public.lead_pool_reject_pull(uuid, text) IS 'Tolak tarikan: pull_status -> rejected, pull_rejection_reason terisi (pull_justification/alasan pengajuan asli TIDAK disentuh). Gerbang sama dengan approve (izin + bukan pengaju sendiri). Alasan wajib. Akun TETAP di pool. Notifikasi ke pengaju menyertakan alasan, best-effort.';

-- -----------------------------------------------------------------------------
-- 3. lead_pool_release -- badan dasar PERSIS 20261012000002, +4 guard baru
--    (Task A, keputusan Den irisan 9) sesudah authorization check yang sudah
--    ada, SEBELUM UPDATE. Urutan check lama TIDAK diubah, hanya ditambah.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_pool_release(p_account_id uuid, p_reason text) RETURNS void
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

  -- BARU (1): sudah di pool -- tanpa guard ini lead_pool_last_owner akan
  -- tertimpa NULL (assigned_to akun yang sudah di pool memang NULL) dan
  -- jejak pemilik SEBELUM pool hilang.
  IF v_account.is_in_lead_pool THEN
    RAISE EXCEPTION 'Akun sudah di Lead Pool';
  END IF;
  -- BARU (2): tanpa pemilik.
  IF v_account.assigned_to IS NULL THEN
    RAISE EXCEPTION 'Akun tidak memiliki pemilik untuk dilepas';
  END IF;
  -- BARU (3): hanya lead/mql -- customer/prospect/sql pakai Reassign,
  -- lost/free_agent bukan sasaran pelepasan sama sekali.
  IF v_account.lifecycle_stage NOT IN ('lead', 'mql') THEN
    RAISE EXCEPTION 'Hanya akun Lead/MQL yang bisa dilepas ke Lead Pool -- gunakan Reassign untuk akun %', v_account.lifecycle_stage;
  END IF;
  -- BARU (4): inquiry/quotation terbuka -- predikat SAMA dengan Kasus 1
  -- lead_pool_sweep_deactivated_owner, disalin bukan diturunkan ulang.
  IF EXISTS (
    SELECT 1 FROM public.inquiries i
    WHERE (i.prospect_id = v_account.id OR i.customer_id = v_account.id)
      AND i.deleted_at IS NULL
      AND i.status NOT IN ('WON', 'LOST', 'CANCELLED')
  ) OR EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE (q.prospect_id = v_account.id OR q.customer_id = v_account.id)
      AND q.deleted_at IS NULL
      AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'Akun masih punya inquiry/quotation terbuka -- selesaikan dulu sebelum dilepas ke Lead Pool';
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

COMMENT ON FUNCTION public.lead_pool_release(uuid, text) IS 'Lepas akun ke Lead Pool: assigned_to dikosongkan, lead_pool_last_owner mencatat pemilik lama. Pemilik sendiri atau pemegang izin crm_lead_pool_approval di entitas akun. Alasan wajib. Ditolak kalau: sudah di pool, tanpa pemilik, bukan lead/mql, atau masih ada inquiry/quotation terbuka (irisan 9).';

-- -----------------------------------------------------------------------------
-- 4. lead_pool_assign -- RPC BARU (Task B). Efek SAMA dengan approve_pull,
--    tapi target ditentukan pemanggil (approval-holder), bukan pull_requested_by.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.lead_pool_assign(p_account_id uuid, p_user_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account public.accounts;
  v_candidate_ok boolean;
BEGIN
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id AND deleted_at IS NULL;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;
  IF NOT public.has_menu_permission_in(v_account.company_id, 'crm_lead_pool_approval', 'view') THEN
    RAISE EXCEPTION 'Tidak punya izin menetapkan pemilik Lead Pool di entitas ini';
  END IF;
  IF NOT v_account.is_in_lead_pool THEN
    RAISE EXCEPTION 'Akun tidak sedang di Lead Pool';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Tidak boleh menetapkan akun kepada diri sendiri lewat jalur ini';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = p_user_id
      AND ur.company_id = v_account.company_id
      AND ur.is_active = true
      AND ur.valid_until IS NULL
      AND p.active = true
  ) INTO v_candidate_ok;
  IF NOT v_candidate_ok THEN
    RAISE EXCEPTION 'Target bukan profil aktif dengan peran aktif di entitas akun ini';
  END IF;

  UPDATE public.accounts SET
    assigned_to            = p_user_id,
    is_in_lead_pool         = false,
    last_activity_at        = now(),
    is_stale                = false,
    stale_flagged_at        = NULL,
    pull_justification      = NULL,
    pull_requested_at       = NULL,
    pull_requested_by       = NULL,
    pull_status             = NULL,
    pull_rejection_reason   = NULL,
    pull_approved_by        = auth.uid(),
    pull_approved_at        = now(),
    lifecycle_stage         = CASE WHEN lifecycle_stage = 'free_agent' THEN 'customer' ELSE lifecycle_stage END
  WHERE id = p_account_id;

  -- Kalau ada pull pending dari user LAIN, tutup + beri tahu pengajunya
  -- (best-effort). Pull pending dari p_user_id SENDIRI tidak perlu "ditutup
  -- dengan pemberitahuan" terpisah -- ia justru yang mendapat akunnya.
  IF v_account.pull_status = 'pending' AND v_account.pull_requested_by IS NOT NULL
     AND v_account.pull_requested_by <> p_user_id THEN
    BEGIN
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      VALUES (v_account.company_id, v_account.pull_requested_by, 'lead_pool_pull_result',
        'Pull Request Closed',
        'Your pull request for ' || v_account.name || ' was closed because the account was assigned directly.',
        'lead_pool', p_account_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_account.company_id, p_user_id, 'lead_pool_pull_result',
      'Prospect Assigned to You',
      'You have been assigned ' || v_account.name || ' from the Lead Pool.',
      'lead_pool', p_account_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, new_owner)
    VALUES (p_account_id, v_account.company_id, 'assign', auth.uid(), p_user_id);
END $$;

COMMENT ON FUNCTION public.lead_pool_assign(uuid, uuid) IS 'Tetapkan akun Lead Pool langsung ke p_user_id (approval-holder memilih, bukan menunggu/menyetujui pull request). Gerbang crm_lead_pool_approval di entitas akun; target harus profil aktif ber-peran aktif di entitas itu; tidak boleh menetapkan ke diri sendiri. Efek sama dengan approve_pull. Pull pending dari user LAIN ditutup + dinotifikasi; target dinotifikasi menerima akun baru -- keduanya best-effort.';

REVOKE ALL ON FUNCTION public.lead_pool_assign(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_assign(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Trigger BARU: auto-release akun pool yang jadi Lost atau di-Archive
--    (C.2/C.4, satu mekanisme untuk kedua kasus). BEFORE UPDATE, memodifikasi
--    NEW langsung (pola sama trg_a_sync_lifecycle_columns) -- TIDAK ada
--    UPDATE bersarang pada accounts, jadi nol risiko rekursi trigger.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.trg_fn_lead_pool_auto_release() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_reason text;
BEGIN
  v_reason := CASE
    WHEN NEW.lifecycle_stage = 'lost' AND OLD.lifecycle_stage IS DISTINCT FROM 'lost' THEN 'Marked as Lost'
    ELSE 'Archived'
  END;

  IF OLD.pull_status = 'pending' AND OLD.pull_requested_by IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      VALUES (
        OLD.company_id, OLD.pull_requested_by, 'lead_pool_pull_result', 'Pull Request Closed',
        'Your pull request for ' || OLD.name || ' was closed because the account was ' || lower(v_reason) || '.',
        'lead_pool', OLD.id
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
    VALUES (OLD.id, OLD.company_id, 'auto_release', auth.uid(), OLD.lead_pool_last_owner, v_reason);

  NEW.is_in_lead_pool       := false;
  NEW.pull_status           := NULL;
  NEW.pull_justification    := NULL;
  NEW.pull_requested_at     := NULL;
  NEW.pull_requested_by     := NULL;
  NEW.pull_approved_by      := NULL;
  NEW.pull_approved_at      := NULL;
  NEW.pull_rejection_reason := NULL;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.trg_fn_lead_pool_auto_release() IS 'Trigger BEFORE UPDATE ON accounts. Saat akun yang sedang di Lead Pool berpindah ke lifecycle_stage=lost atau di-soft-delete (deleted_at terisi), keluarkan dari pool (is_in_lead_pool=false, seluruh pull_* dikosongkan), tutup pull pending dengan notifikasi ke pengaju (best-effort), dan catat account_pool_history event_type=auto_release. SECURITY DEFINER -- lihat catatan header migrasi.';

CREATE TRIGGER trg_b_lead_pool_auto_release
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  WHEN (
    OLD.is_in_lead_pool = true
    AND (
      (NEW.lifecycle_stage = 'lost' AND OLD.lifecycle_stage IS DISTINCT FROM 'lost')
      OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    )
  )
  EXECUTE FUNCTION public.trg_fn_lead_pool_auto_release();

REVOKE ALL ON FUNCTION public.trg_fn_lead_pool_auto_release() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 6. Trigger BARU: tolak inquiry baru untuk akun yang sedang di pool (C.3,
--    guard DB -- pelengkap guard UI di InquiryFormPage/CustomerDetailPage).
--    prospect_id/customer_id SELALU salah satu NULL (CHECK accounts
--    inquiries sudah menegakkan XOR di tempat lain) -- COALESCE aman.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.trg_fn_block_inquiry_for_pooled_account() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_account_id uuid := COALESCE(NEW.prospect_id, NEW.customer_id);
  v_pooled boolean;
BEGIN
  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT is_in_lead_pool INTO v_pooled FROM public.accounts WHERE id = v_account_id;
  IF v_pooled THEN
    RAISE EXCEPTION 'Akun ini sedang di Lead Pool -- harus ditetapkan pemiliknya dulu sebelum inquiry baru dibuat';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.trg_fn_block_inquiry_for_pooled_account() IS 'Trigger BEFORE INSERT ON inquiries. Menolak INSERT kalau akun rujukan (prospect_id/customer_id) sedang is_in_lead_pool=true. SECURITY DEFINER -- lihat catatan header migrasi (RLS accounts bisa menyembunyikan baris dari pemanggil sebagai invoker, membuat guard lolos diam-diam).';

CREATE TRIGGER trg_block_inquiry_for_pooled_account
  BEFORE INSERT ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_block_inquiry_for_pooled_account();

REVOKE ALL ON FUNCTION public.trg_fn_block_inquiry_for_pooled_account() FROM PUBLIC;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.account_pool_history'::regclass
--    AND conname = 'account_pool_history_event_type_check';
-- -- Harap: delapan nilai, termasuk 'assign' dan 'auto_release'.
--
-- SELECT proname, prosecdef FROM pg_proc
--  WHERE proname IN ('lead_pool_request_pull','lead_pool_approve_pull',
--                     'lead_pool_reject_pull','lead_pool_release',
--                     'lead_pool_assign','trg_fn_lead_pool_auto_release',
--                     'trg_fn_block_inquiry_for_pooled_account')
--  ORDER BY proname;
-- -- Harap: 7 baris, prosecdef = true (SECURITY DEFINER) di SEMUANYA.
--
-- SELECT proname, proacl FROM pg_proc WHERE proname = 'lead_pool_assign';
-- -- Harap: proacl memuat authenticated=X, TANPA PUBLIC.
--
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('trg_fn_lead_pool_auto_release','trg_fn_block_inquiry_for_pooled_account');
-- -- Harap: proacl grantee KOSONG berawalan '=' (REVOKE ALL FROM PUBLIC,
-- --        nol GRANT ke siapa pun -- trigger tetap menyala lewat mekanisme
-- --        trigger, bukan EXECUTE langsung).
--
-- SELECT tgname, tgrelid::regclass, tgtype FROM pg_trigger
--  WHERE tgname IN ('trg_b_lead_pool_auto_release','trg_block_inquiry_for_pooled_account');
-- -- Harap: 2 baris, tgrelid accounts & inquiries.
--
-- -- Urutan trigger BEFORE UPDATE di accounts (harap 4 baris, alfabetis):
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid = 'public.accounts'::regclass AND tgtype & 18 = 18 -- BEFORE(2^1) + ROW(2^0), bukan EVENT UPDATE spesifik -- lihat catatan
--  ORDER BY tgname;
-- -- (Kalau query tgtype di atas tidak presisi di Postgres versi ini, cek
-- --  manual: trg_a_sync_lifecycle_columns, trg_b_lead_pool_auto_release,
-- --  trg_z_gen_customer_code_upd, trg_z_track_stage_change -- urutan ini.)
--
-- -- Uji end-to-end (staging, akun uji -- lewat token user sungguhan):
-- -- 1. Tandai sebuah akun lead/mql Lost SAAT is_in_lead_pool=true dan ada
-- --    pull_status='pending' -- harap sesudahnya is_in_lead_pool=false,
-- --    seluruh pull_* NULL, account_pool_history +1 baris event_type=
-- --    'auto_release', notifications +1 baris ke pull_requested_by lama.
-- -- 2. lead_pool_assign(<id akun di pool>, <id user lain>) sebagai pemegang
-- --    crm_lead_pool_approval -- harap sukses, assigned_to = user itu.
-- -- 3. lead_pool_assign(<id akun>, auth.uid() sendiri) -- harap GAGAL
-- --    "Tidak boleh menetapkan akun kepada diri sendiri lewat jalur ini".
-- -- 4. INSERT INTO inquiries(...) dengan prospect_id = akun yang sedang
-- --    is_in_lead_pool=true -- harap GAGAL "Akun ini sedang di Lead Pool...".
-- -- 5. lead_pool_release pada akun customer/prospect/sql -- harap GAGAL
-- --    "Hanya akun Lead/MQL...". Pada akun lead/mql yang masih punya inquiry
-- --    OPEN -- harap GAGAL "...inquiry/quotation terbuka...".
-- =============================================================================

-- =============================================================================
-- ROLLBACK (urutan WAJIB: DROP trigger dulu, baru fungsi trigger, baru
-- lead_pool_assign, baru kembalikan lead_pool_release/request_pull/
-- approve_pull/reject_pull ke badan 20261012000002, baru persempit CHECK --
-- mempersempit CHECK sebelum baris 'assign'/'auto_release' dihapus akan
-- GAGAL kalau sudah ada baris ditulis via RPC/trigger baru):
--
--   DROP TRIGGER trg_block_inquiry_for_pooled_account ON public.inquiries;
--   DROP FUNCTION public.trg_fn_block_inquiry_for_pooled_account();
--   DROP TRIGGER trg_b_lead_pool_auto_release ON public.accounts;
--   DROP FUNCTION public.trg_fn_lead_pool_auto_release();
--   DROP FUNCTION public.lead_pool_assign(uuid, uuid);
--
--   -- Kembalikan lead_pool_release ke badan TANPA 4 guard baru (20261012000002):
--   CREATE OR REPLACE FUNCTION public.lead_pool_release(p_account_id uuid, p_reason text) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   DECLARE
--     v_account public.accounts;
--   BEGIN
--     IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
--       RAISE EXCEPTION 'Alasan pelepasan wajib diisi';
--     END IF;
--     SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id AND deleted_at IS NULL;
--     IF v_account.id IS NULL THEN
--       RAISE EXCEPTION 'Akun tidak ditemukan';
--     END IF;
--     IF NOT (v_account.assigned_to = auth.uid()
--             OR public.has_menu_permission_in(v_account.company_id, 'crm_lead_pool_approval', 'view')) THEN
--       RAISE EXCEPTION 'Hanya pemilik atau pemegang izin persetujuan Lead Pool di entitas ini yang boleh melepas akun';
--     END IF;
--     UPDATE public.accounts SET
--       is_in_lead_pool = true, lead_pool_last_owner = v_account.assigned_to, assigned_to = NULL,
--       lead_pool_reason = p_reason, lead_pool_at = now(), pull_justification = NULL,
--       pull_requested_at = NULL, pull_requested_by = NULL, pull_approved_by = NULL,
--       pull_approved_at = NULL, pull_status = NULL, pull_rejection_reason = NULL,
--       is_stale = false, stale_flagged_at = NULL
--     WHERE id = p_account_id;
--     INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, new_owner, reason)
--       VALUES (p_account_id, v_account.company_id, 'release', auth.uid(), v_account.assigned_to, NULL, p_reason);
--   END $$;
--
--   -- request_pull/approve_pull/reject_pull: kembalikan ke badan TANPA blok
--   -- notifikasi -- salin persis isi 20261012000002 untuk ketiganya.
--
--   ALTER TABLE public.account_pool_history DROP CONSTRAINT account_pool_history_event_type_check;
--   ALTER TABLE public.account_pool_history ADD CONSTRAINT account_pool_history_event_type_check
--     CHECK (event_type IN ('enter_pool', 'release', 'request_pull', 'approve_pull', 'reject_pull', 'owner_cleared'));
-- =============================================================================
