-- =============================================================================
-- 20261012000008_crm_lead_pool_sweep_notify.sql
--
-- lead_pool_sweep_deactivated_owner(p_user_id) sudah LIVE di staging (migrasi
-- 20261012000002, versi commit e77b928) -- badan dasarnya DISALIN VERBATIM di
-- sini (kedua loop TIDAK diubah satu baris pun), tanda tangan dan
-- RETURNS TABLE(account_id uuid, action text) TIDAK berubah, GRANT TETAP
-- service_role ONLY. Satu-satunya tambahan: notifikasi ringkasan per company
-- sesudah kedua loop selesai, dan pemanggilnya di Edge Function
-- set-user-status (langkah 4d, sesudah 4a/4b/4c -- berkas itu diubah
-- terpisah, DI LUAR migrasi SQL ini) + dua cabang navigasi baru di App.jsx.
--
-- Status: BELUM DIJALANKAN.
--
-- =============================================================================
-- RINGKASAN PERUBAHAN
-- =============================================================================
-- 1. CREATE OR REPLACE lead_pool_sweep_deactivated_owner -- sesudah Kasus 1
--    (pooled) dan Kasus 2 (owner_cleared) selesai, kirim MAKSIMAL DUA
--    notifikasi per company yang tersentuh sweep ini, ke setiap user dari
--    lead_pool_approvers(company_id) (dipanggil dari dalam fungsi ini yang
--    SECURITY DEFINER -- nol GRANT tambahan, sama seperti lead_pool_request_
--    pull memanggilnya di migrasi 20261012000006):
--
--    a. Kalau pooled_count > 0 -- event_type 'lead_pool_sweep_summary',
--       reference_type 'lead_pool' (cabang navigasi yang SUDAH ADA di
--       App.jsx -> crm-lead-pool / LeadAssignmentPage). Isi: nama user yang
--       dinonaktifkan + jumlah lead yang masuk Lead Pool.
--
--    b. Kalau owner_cleared_count > 0 -- event_type 'lead_pool_sweep_summary',
--       reference_type BARU: 'unowned_customers' kalau di antara akun
--       owner_cleared company itu ADA yang lifecycle_stage = 'customer'
--       (tujuan paling berguna = Customer Master, crm-customers -- halaman
--       itu HANYA menampilkan lifecycle_stage IN ('customer','free_agent'),
--       CustomerListPage.jsx:615/:628); SELAIN itu 'unowned_leads' (tujuan =
--       daftar Lead, crm-prospects, LeadCapturePage.jsx). Isi: jumlah
--       customer DAN jumlah akun lain (lead/mql/prospect/sql) yang butuh
--       pemilik baru -- disebut TERPISAH -- + jumlah inquiry terbuka
--       (status NOT IN WON/LOST/CANCELLED, deleted_at IS NULL) dengan
--       owner_id = user itu di company tersebut, + petunjuk pakai filter
--       "Tanpa pemilik".
--
--    ⛔ KOREKSI atas rancangan awal (approved Den): notifikasi 'pooled' TIDAK
--    diarahkan ke crm-prospects. Filter "Tanpa pemilik" LeadCapturePage
--    SENGAJA predikat assigned_to IS NULL AND is_in_lead_pool = false
--    (irisan 7, LeadCapturePage.jsx:45/:205) -- akun pooled (is_in_lead_pool
--    = true) tidak pernah lolos filter itu. 'lead_pool' (cabang existing,
--    LeadAssignmentPage) adalah satu-satunya tujuan yang benar utk pooled.
--
--    Company dengan pooled_count=0 DAN owner_cleared_count=0 TIDAK PERNAH
--    diiterasi sama sekali -- baris agregat di bawah hanya lahir dari
--    account_pool_history yang BARU ditulis kedua loop di atas, jadi company
--    semacam itu otomatis tak pernah muncul (bukan dicek lewat IF terpisah).
--
--    Dibedakan dari pemanggilan lain lewat jendela waktu v_started_at :=
--    now() (dibekukan di awal fungsi -- SATU nilai sepanjang transaksi ini,
--    sama dgn default occurred_at = now() pada INSERT account_pool_history
--    di kedua loop), difilter occurred_at >= v_started_at saat agregasi.
--
--    Kedua notifikasi (a) dan (b) di-EXCEPTION-wrap TERPISAH (pola migrasi
--    20261012000006, mis. lead_pool_assign yang mengirim 2 notifikasi
--    independen dlm satu fungsi) -- gagal kirim salah satu TIDAK menghalangi
--    yang lain, dan keduanya TIDAK PERNAH membatalkan hasil sweep yang sudah
--    di-RETURN NEXT.
--
-- 2. src/App.jsx handleNotifClick -- DUA cabang navigasi BARU ditambahkan ke
--    ternary `dest` yang sudah ada (file ini TIDAK memuat diff App.jsx --
--    perubahan kode FE dicatat di commit yang sama, bukan di berkas SQL):
--      reference_type 'unowned_customers' -> 'crm-customers'
--      reference_type 'unowned_leads'     -> 'crm-prospects'
--    Cabang 'lead_pool'/'account' -> 'crm-lead-pool' yang SUDAH ADA TIDAK
--    disentuh.
--
-- 3. supabase/functions/set-user-status/index.ts -- langkah 4d BARU (dicatat
--    di sini, bukan di berkas SQL): hanya saat active=false, SESUDAH 4a/4b/4c
--    (urutan + alasan: lihat plan, intinya lead_pool_approvers() menyaring
--    profiles.active=true, jadi sweep harus jalan SESUDAH profiles.active
--    di-set false supaya user yang baru dinonaktifkan tidak ikut menerima
--    notifikasi soal penonaktifan dirinya sendiri kalau dia juga approver).
--    Kegagalan sweep TIDAK menggagalkan penonaktifan (RPC error ditangkap,
--    direkam di steps.lead_pool, fungsi tetap lanjut ke response). steps.
--    lead_pool ikut menentukan flag `partial` (sejajar steps.roles/auth_ban).
--    Reactivate TIDAK memanggil RPC ini sama sekali.
--
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lead_pool_sweep_deactivated_owner(p_user_id uuid)
  RETURNS TABLE(account_id uuid, action text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r                        record;
  v_started_at             timestamptz;
  v_user_name              text;
  v_summary                record;
  v_open_inquiries         int;
  v_reference_type         text;
BEGIN
  v_started_at := now();

  -- Kasus 1 -- lead/mql TANPA inquiry/quotation terbuka -> masuk pool
  -- (efek PERSIS lead_pool_release()).
  FOR r IN
    SELECT a.id, a.company_id
    FROM public.accounts a
    WHERE a.assigned_to = p_user_id
      AND a.deleted_at IS NULL
      AND a.lifecycle_stage IN ('lead', 'mql')
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
      VALUES (r.id, r.company_id, 'enter_pool', NULL, p_user_id, 'Owner account deactivated');

    account_id := r.id; action := 'pooled';
    RETURN NEXT;
  END LOOP;

  -- Kasus 2 -- SISA akun milik user itu: prospect/sql/customer (lifecycle
  -- di luar lead/mql sama sekali), ATAU lead/mql yang MASIH punya
  -- inquiry/quotation terbuka (kondisi kasus 1 dikecualikan eksplisit di
  -- NOT (...) supaya satu akun tak pernah masuk DUA action). lost/
  -- free_agent TIDAK disentuh sama sekali (tak muncul di kasus 1 maupun
  -- 2). Pemilik dikosongkan TANPA masuk pool -- lifecycle_stage dan
  -- is_in_lead_pool TIDAK berubah; deal yang masih berjalan dioper
  -- manual oleh supervisor lewat fitur ganti pemilik deal yang sudah ada.
  FOR r IN
    SELECT a.id, a.company_id
    FROM public.accounts a
    WHERE a.assigned_to = p_user_id
      AND a.deleted_at IS NULL
      AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
      AND NOT (
        a.lifecycle_stage IN ('lead', 'mql')
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
      )
  LOOP
    UPDATE public.accounts SET
      assigned_to          = NULL,
      lead_pool_last_owner = p_user_id
    WHERE id = r.id;

    INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
      VALUES (r.id, r.company_id, 'owner_cleared', NULL, p_user_id, 'Owner account deactivated');

    account_id := r.id; action := 'owner_cleared';
    RETURN NEXT;
  END LOOP;

  -- ───────────────────────────────────────────────────────────────────────
  -- BARU -- notifikasi ringkasan per company yang tersentuh sweep ini,
  -- maksimal DUA per company (lihat RINGKASAN PERUBAHAN #1 di header).
  -- Best-effort: masing-masing INSERT di EXCEPTION-wrap SENDIRI-SENDIRI,
  -- gagal satu tidak menghalangi yang lain, dan keduanya tidak pernah
  -- membatalkan RETURN NEXT di atas (sudah selesai sebelum blok ini jalan).
  -- ───────────────────────────────────────────────────────────────────────
  SELECT full_name INTO v_user_name FROM public.profiles WHERE id = p_user_id;

  FOR v_summary IN
    SELECT h.company_id,
           count(*) FILTER (WHERE h.event_type = 'enter_pool')                                      AS pooled_count,
           count(*) FILTER (WHERE h.event_type = 'owner_cleared')                                   AS cleared_count,
           count(*) FILTER (WHERE h.event_type = 'owner_cleared' AND a.lifecycle_stage = 'customer') AS cleared_customer_count
    FROM public.account_pool_history h
    JOIN public.accounts a ON a.id = h.account_id
    WHERE h.previous_owner = p_user_id
      AND h.actor_id IS NULL
      AND h.occurred_at >= v_started_at
    GROUP BY h.company_id
  LOOP
    -- (a) Pooled -- reference_type 'lead_pool' (cabang navigasi existing).
    IF v_summary.pooled_count > 0 THEN
      BEGIN
        INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
        SELECT v_summary.company_id, approver_id, 'lead_pool_sweep_summary',
               'Lead Pool Sweep: ' || coalesce(v_user_name, 'A user') || ' deactivated',
               coalesce(v_user_name, 'A user') || ' was deactivated. ' ||
                 v_summary.pooled_count || ' lead(s) entered the Lead Pool.',
               'lead_pool', NULL
        FROM public.lead_pool_approvers(v_summary.company_id) AS approver_id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- (b) owner_cleared -- reference_type BARU, dipilih per company dari
    -- keberadaan akun lifecycle_stage='customer' di antara yang
    -- owner_cleared company itu dalam sweep ini.
    IF v_summary.cleared_count > 0 THEN
      SELECT count(*) INTO v_open_inquiries
      FROM public.inquiries
      WHERE owner_id = p_user_id
        AND company_id = v_summary.company_id
        AND status NOT IN ('WON', 'LOST', 'CANCELLED')
        AND deleted_at IS NULL;

      v_reference_type := CASE WHEN v_summary.cleared_customer_count > 0
        THEN 'unowned_customers' ELSE 'unowned_leads' END;

      BEGIN
        INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
        SELECT v_summary.company_id, approver_id, 'lead_pool_sweep_summary',
               'Lead Pool Sweep: ' || coalesce(v_user_name, 'A user') || ' deactivated',
               coalesce(v_user_name, 'A user') || ' was deactivated. ' ||
                 v_summary.cleared_customer_count || ' customer(s) and ' ||
                 (v_summary.cleared_count - v_summary.cleared_customer_count) ||
                 ' other account(s) (lead/prospect) need a new owner. ' ||
                 v_open_inquiries || ' open inquiry(ies) still list them as owner. ' ||
                 'Use the "Tanpa pemilik" filter to find them.',
               v_reference_type, NULL
        FROM public.lead_pool_approvers(v_summary.company_id) AS approver_id;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

ALTER FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) IS 'Dipanggil Edge Function set-user-status (langkah 4d) saat user dinonaktifkan. Kasus 1: lead/mql TANPA inquiry/quotation terbuka -> masuk pool (action ''pooled'', riwayat enter_pool). Kasus 2: SISA akun (prospect/sql/customer, atau lead/mql dengan inquiry/quotation terbuka) -> pemilik dikosongkan TANPA masuk pool, lifecycle_stage TIDAK diubah (action ''owner_cleared'', riwayat owner_cleared). lost/free_agent TIDAK disentuh sama sekali. Sesudah kedua kasus, kirim maksimal 2 notifikasi ringkasan per company ke lead_pool_approvers(company_id): pooled->reference_type ''lead_pool''; owner_cleared->''unowned_customers''/''unowned_leads'' tergantung ada/tiada lifecycle_stage=customer di antaranya. Kedua notifikasi best-effort (EXCEPTION-wrapped terpisah). actor_id NULL (sistem), previous_owner = p_user_id. !! GRANT HANYA service_role -- fungsi ini TIDAK memeriksa auth.uid(), percaya p_user_id dari pemanggil. GRANT ke authenticated = eskalasi privilege.';

REVOKE ALL ON FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_sweep_deactivated_owner(uuid) TO service_role;

COMMIT;

-- =============================================================================
-- VERIFIKASI
-- =============================================================================
-- SELECT proname, prosecdef, proacl FROM pg_proc WHERE proname = 'lead_pool_sweep_deactivated_owner';
-- -- Harap: prosecdef = true, proacl memuat service_role=X, TANPA authenticated/PUBLIC.
--
-- -- Siapkan user uji dgn: 1 lead/mql tanpa inquiry/quotation terbuka (->
-- -- pooled), 1 lead/mql DENGAN inquiry terbuka (-> owner_cleared, non-
-- -- customer), 1 customer-stage (-> owner_cleared, customer), 1 inquiry
-- -- owner_id=user itu status OPEN. Lalu di SQL Editor (service_role context,
-- -- atau via Edge Function):
-- --   SELECT * FROM public.lead_pool_sweep_deactivated_owner('<user uji>');
-- -- Harap 3 baris: 1 pooled, 2 owner_cleared.
--
-- SELECT event_type, title, body, reference_type, reference_id, company_id, user_id
--  FROM public.notifications
--  WHERE event_type = 'lead_pool_sweep_summary'
--  ORDER BY created_at DESC LIMIT 10;
-- -- Harap: SATU baris per (company, approver) utk reference_type 'lead_pool'
-- -- (body menyebut 1 lead), SATU baris per (company, approver) utk
-- -- reference_type 'unowned_customers' (karena ada 1 customer owner_cleared;
-- -- body menyebut "1 customer(s) and 1 other account(s)" + jumlah inquiry
-- -- terbuka + petunjuk filter).
--
-- SELECT account_id, action FROM public.account_pool_history
--  WHERE previous_owner = '<user uji>' AND actor_id IS NULL
--  ORDER BY occurred_at DESC LIMIT 10;
-- -- Harap cocok dgn hasil RETURN NEXT di atas.
--
-- -- Uji company nol-nol: user tanpa akun ter-assign sama sekali -> RPC
-- -- mengembalikan 0 baris -> nol baris account_pool_history baru -> loop
-- -- notifikasi nol iterasi -> nol baris notifications baru.
-- =============================================================================

-- =============================================================================
-- ROLLBACK -- kembalikan ke badan TANPA blok notifikasi (20261012000002,
-- commit e77b928; signature/GRANT identik, jadi CREATE OR REPLACE cukup):
--
--   CREATE OR REPLACE FUNCTION public.lead_pool_sweep_deactivated_owner(p_user_id uuid)
--     RETURNS TABLE(account_id uuid, action text)
--     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
--   DECLARE
--     r record;
--   BEGIN
--     FOR r IN
--       SELECT a.id, a.company_id FROM public.accounts a
--       WHERE a.assigned_to = p_user_id AND a.deleted_at IS NULL
--         AND a.lifecycle_stage IN ('lead', 'mql')
--         AND NOT EXISTS (SELECT 1 FROM public.inquiries i
--           WHERE (i.prospect_id = a.id OR i.customer_id = a.id) AND i.deleted_at IS NULL
--             AND i.status NOT IN ('WON', 'LOST', 'CANCELLED'))
--         AND NOT EXISTS (SELECT 1 FROM public.quotations q
--           WHERE (q.prospect_id = a.id OR q.customer_id = a.id) AND q.deleted_at IS NULL
--             AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED'))
--     LOOP
--       UPDATE public.accounts SET is_in_lead_pool = true, lead_pool_last_owner = p_user_id,
--         assigned_to = NULL, lead_pool_reason = 'Owner account deactivated', lead_pool_at = now()
--       WHERE id = r.id;
--       INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
--         VALUES (r.id, r.company_id, 'enter_pool', NULL, p_user_id, 'Owner account deactivated');
--       account_id := r.id; action := 'pooled'; RETURN NEXT;
--     END LOOP;
--     FOR r IN
--       SELECT a.id, a.company_id FROM public.accounts a
--       WHERE a.assigned_to = p_user_id AND a.deleted_at IS NULL
--         AND a.lifecycle_stage NOT IN ('lost', 'free_agent')
--         AND NOT (a.lifecycle_stage IN ('lead', 'mql')
--           AND NOT EXISTS (SELECT 1 FROM public.inquiries i
--             WHERE (i.prospect_id = a.id OR i.customer_id = a.id) AND i.deleted_at IS NULL
--               AND i.status NOT IN ('WON', 'LOST', 'CANCELLED'))
--           AND NOT EXISTS (SELECT 1 FROM public.quotations q
--             WHERE (q.prospect_id = a.id OR q.customer_id = a.id) AND q.deleted_at IS NULL
--               AND q.status NOT IN ('ACCEPTED', 'REJECTED', 'SUPERSEDED')))
--     LOOP
--       UPDATE public.accounts SET assigned_to = NULL, lead_pool_last_owner = p_user_id WHERE id = r.id;
--       INSERT INTO public.account_pool_history (account_id, company_id, event_type, actor_id, previous_owner, reason)
--         VALUES (r.id, r.company_id, 'owner_cleared', NULL, p_user_id, 'Owner account deactivated');
--       account_id := r.id; action := 'owner_cleared'; RETURN NEXT;
--     END LOOP;
--   END $$;
-- =============================================================================
