-- =============================================================================
-- 20261016000004_lead_pool_assign_reason.sql
--
-- TD-318 Irisan 2 (Reassign) -- lead_pool_assign versi BARU dengan
-- p_reason text DEFAULT NULL, DROP versi 2-argumen lama DI MIGRASI YANG
-- SAMA (keputusan Den, 08_TECH_DEBT.md "Keputusan eksekusi tambahan
-- 13 Okt 2026" poin 2). Field "Reason" sudah ADA di modal Reassign
-- (mockup + ReassignModal.jsx) tapi tak pernah tersimpan untuk baris
-- POOL -- RPC lama tak punya parameter untuk itu.
--
-- Signature BERUBAH (2 argumen -> 3), BUKAN overload baru berdampingan --
-- DROP versi lama di migrasi yang sama supaya PostgREST tidak pernah
-- punya 2 kandidat lead_pool_assign sekaligus (kedua pemanggil nyata --
-- ReassignModal.jsx, AssignToSalesModal.jsx -- memanggil dengan argumen
-- BERNAMA, yang ambigu kalau dua overload hidup berdampingan). p_reason
-- DEFAULT NULL supaya KEDUA pemanggil itu tetap jalan TANPA DIUBAH --
-- mereka memanggil p_reason implisit NULL (ReassignModal.jsx diubah di
-- irisan ini juga untuk MENGISI p_reason -- lihat file itu; perubahan FE
-- itu dan DEFAULT NULL di sini independen, bukan saling bergantung).
--
-- Badan disalin VERBATIM dari LIVE (20261012000006_crm_lead_pool_
-- notifications.sql, satu-satunya definisi, dicek -- tidak ada migrasi
-- lain yang meredefinisinya; dikonfirmasi Vir identik di staging). SATU
-- parameter ditambah + SATU kolom di INSERT account_pool_history
-- (reason) + SATU nilai (p_reason). Nol baris lain diubah.
-- account_pool_history.event_type CHECK SUDAH memuat 'assign' (dilebarkan
-- di file 6 itu sendiri) -- nol perubahan constraint. Kolom
-- account_pool_history.reason SUDAH ADA (dikonfirmasi Vir di staging).
--
-- ACL diajukan ulang utk signature baru (REVOKE ALL FROM PUBLIC, GRANT
-- EXECUTE TO authenticated) -- grant versi lama TIDAK ikut pindah
-- otomatis (arity beda = objek beda bagi Postgres).
--
-- Status: BELUM DIJALANKAN -- draft, menunggu Vir menjalankan di
-- STAGING di awal Irisan 2 (ANTREAN_MIGRASI butir 62, bagian rilis
-- November, sesudah 20261012000006).
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.lead_pool_assign(uuid, uuid);

CREATE FUNCTION public.lead_pool_assign(p_account_id uuid, p_user_id uuid, p_reason text DEFAULT NULL) RETURNS void
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

  INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, new_owner, reason)
    VALUES (p_account_id, v_account.company_id, 'assign', auth.uid(), p_user_id, p_reason);
END $$;

COMMENT ON FUNCTION public.lead_pool_assign(uuid, uuid, text) IS 'Tetapkan akun Lead Pool langsung ke p_user_id (approval-holder memilih, bukan menunggu/menyetujui pull request). Gerbang crm_lead_pool_approval di entitas akun; target harus profil aktif ber-peran aktif di entitas itu; tidak boleh menetapkan ke diri sendiri. Efek sama dengan approve_pull. Pull pending dari user LAIN ditutup + dinotifikasi; target dinotifikasi menerima akun baru -- keduanya best-effort. p_reason (BARU, Irisan 2 TD-318) tersimpan ke account_pool_history.reason -- opsional, NULL kalau pemanggil tak mengirimnya (pemanggil existing tetap jalan tanpa diubah).';

REVOKE ALL ON FUNCTION public.lead_pool_assign(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_assign(uuid, uuid, text) TO authenticated;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT proname, oidvectortypes(proargtypes) FROM pg_proc WHERE proname = 'lead_pool_assign';
-- -- Harap SATU baris: oidvectortypes = 'uuid, uuid, text' -- versi 2-argumen
-- -- lama TIDAK ADA lagi (gotcha #44: pakai oidvectortypes, BUKAN
-- -- pg_get_function_identity_arguments yang ikut mencetak nama parameter).
--
-- -- Pemanggilan existing TANPA p_reason masih jalan (kompatibel):
-- -- SELECT lead_pool_assign('<account_id pool>', '<user_id target>');
--
-- -- Pemanggilan BARU dengan p_reason tersimpan:
-- -- SELECT lead_pool_assign('<account_id pool>', '<user_id target>', 'Alasan uji');
-- -- SELECT reason FROM account_pool_history WHERE account_id = '<account_id pool>' ORDER BY occurred_at DESC LIMIT 1;
-- -- Harap 'Alasan uji'.
--
-- Rollback:
-- DROP FUNCTION IF EXISTS public.lead_pool_assign(uuid, uuid, text);
-- CREATE FUNCTION public.lead_pool_assign(p_account_id uuid, p_user_id uuid) RETURNS void
--   LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ ... $$;
-- -- (badan identik versi lama, lihat 20261012000006_crm_lead_pool_notifications.sql)
-- REVOKE ALL ON FUNCTION public.lead_pool_assign(uuid, uuid) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.lead_pool_assign(uuid, uuid) TO authenticated;
-- =============================================================================
