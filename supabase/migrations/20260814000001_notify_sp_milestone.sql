-- =============================================================================
-- Migration: 20260814000001_notify_sp_milestone
-- Phase:     Notifikasi email 4 milestone status SP (internal-only)
-- Purpose:   Suntik pemicu notifikasi event-driven ke sp_recompute_status
--            (CONFIRMED/BTB_TERBIT/SUBMITTED) + set_sp_status (CANCELLED),
--            via net.http_post ke Edge Function baru notify-sp-milestone
--            (relay Resend langsung, pola sama bnf-overdue-reminder — bukan
--            lewat send-email/index.ts yang butuh sesi user login, dan
--            bukan lewat notification_rules yang nol consumer di project
--            ini per audit 14 Agu 2026).
-- Depends:   Edge Function notify-sp-milestone harus SUDAH di-deploy dulu
--            (supabase functions deploy notify-sp-milestone) sebelum
--            migrasi ini dijalankan, kalau tidak net.http_post akan gagal
--            connect ke URL yang belum ada.
-- Status:    SUDAH DIJALANKAN 14 Agu 2026 (termasuk fix timeout_milliseconds
--            susulan, lihat catatan di notify_sp_milestone di bawah).
--            REKAMAN — JANGAN dijalankan ulang begitu saja tanpa cek dulu
--            apakah masih match dengan yang live (pg_get_functiondef).
--
-- CATATAN SECRET VAULT: reuse secret 'aging_pipeline_key' yang sudah ada
-- (service role key, dipakai jg oleh aging-pipeline & bnf-overdue-reminder)
-- — sama seperti kedua migrasi itu, penamaan historis, bukan salah copas.
--
-- CATATAN SCOPE: HANYA 4 milestone (CONFIRMED/BTB_TERBIT/SUBMITTED/
-- CANCELLED) yang memicu notifikasi. LUNAS TIDAK bisa disuntik di migrasi
-- ini — Fase 5 (payment) belum dibangun, tak ada kode yang pernah menulis
-- status='LUNAS' ke sp_orders sama sekali (dikonfirmasi 13 Agu 2026).
-- Notifikasi customer/DC (contacts) SENGAJA ditahan — tabel contacts nol
-- data usable utk 45 DC Storbit (dikonfirmasi 14 Agu 2026, lihat sesi
-- investigasi tanggal yang sama).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- service_role TIDAK otomatis punya SELECT di semua tabel (TD-62/TD-63,
-- pola sama persis 20260805000001_pg_cron_bnf_overdue_reminder.sql) —
-- notify-sp-milestone/index.ts pakai SUPABASE_SERVICE_ROLE_KEY utk baca
-- sp_orders/dc_master/sp_order_items/sp_btb/sp_invoices/roles. accounts/
-- profiles/user_roles SUDAH ter-grant dari migrasi sebelumnya (dikonfirmasi
-- 14 Agu 2026 via has_table_privilege) — tetap diulang di sini idempotent,
-- bukan asumsi belum pernah di-grant.
-- [KOREKSI 14 Agu 2026 — ditambahkan SETELAH deploy pertama, saat test aman
-- (BTB_TERBIT, nol recipient) memicu "permission denied for table sp_orders"
-- persis krn 6 tabel ini belum ter-grant. Baris di bawah adalah fix-nya,
-- bukan rencana awal.]
GRANT SELECT ON public.sp_orders TO service_role;
GRANT SELECT ON public.dc_master TO service_role;
GRANT SELECT ON public.sp_order_items TO service_role;
GRANT SELECT ON public.sp_btb TO service_role;
GRANT SELECT ON public.sp_invoices TO service_role;
GRANT SELECT ON public.roles TO service_role;
GRANT SELECT ON public.accounts TO service_role;
GRANT SELECT ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO service_role;

-- ─── FUNGSI BARU: notify_sp_milestone ───────────────────────────────────────
-- Internal-only (TIDAK di-GRANT ke authenticated/anon) — satu-satunya
-- pemanggil adalah sp_recompute_status & set_sp_status di bawah, via
-- PERFORM. EXCEPTION WHEN OTHERS di dalam sini (bukan di caller) supaya
-- kedua fungsi kritis itu tak perlu masing-masing membungkus try/catch
-- sendiri — gagal kirim notifikasi TIDAK PERNAH boleh menggagalkan
-- perubahan status SP yang sudah tercatat.
CREATE OR REPLACE FUNCTION public.notify_sp_milestone(
  p_sp_order_id uuid, p_milestone text, p_old_status text, p_new_status text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://untmpqceexwxzuhlmyrg.supabase.co/functions/v1/notify-sp-milestone',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'aging_pipeline_key'
      )
    ),
    body := jsonb_build_object(
      'sp_order_id', p_sp_order_id,
      'milestone', p_milestone,
      'old_status', p_old_status,
      'new_status', p_new_status
    ),
    -- [KOREKSI 14 Agu 2026, ditambahkan SETELAH test end-to-end pertama]
    -- default pg_net 5000ms sempat timeout saat resolve recipient beneran
    -- (CONFIRMED, 2 recipient, 3.36s warm run via curl langsung — diduga
    -- cold start pertama lebih lambat dari itu). Dinaikkan supaya ada
    -- headroom, bukan angka yang diuji presisi.
    timeout_milliseconds := 15000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_sp_milestone] gagal enqueue notifikasi utk sp_order % (%->%): %',
    p_sp_order_id, p_old_status, p_new_status, SQLERRM;
END;
$$;

-- ─── sp_recompute_status: CREATE OR REPLACE, hanya blok IF terakhir yang
-- berubah (3 baris baru: FOUND-guard + IN(...) + PERFORM). Semua baris di
-- atasnya byte-identical dgn versi live sebelum migrasi ini. ─────────────────
CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
  v_has_btb bool; v_has_invoice bool; v_submitted bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status IN ('CANCELLED','LUNAS') THEN RETURN; END IF;
  v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
  v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
  v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
  v_short := EXISTS(
    SELECT 1 FROM sp_items si
     WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
       AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
       AND (si.qty - si.shipped_qty) > COALESCE(
             (SELECT SUM(ss.available) FROM stock_summary ss
               WHERE ss.company_id=v_company AND ss.product_id=si.product_id), 0));
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');
  v_has_btb     := EXISTS(SELECT 1 FROM sp_btb      WHERE sp_order_id=v_id AND deleted_at IS NULL);
  v_has_invoice := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status <> 'void');
  v_submitted   := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status='submitted');
  v_new := CASE
    WHEN v_submitted                              THEN 'SUBMITTED'
    WHEN v_has_invoice                            THEN 'INVOICED'
    WHEN v_has_btb                                THEN 'BTB_TERBIT'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
    WHEN v_has_delivered                          THEN 'SAMPAI'
    WHEN v_has_dispatch                           THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;
  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
    IF FOUND AND v_new IN ('CONFIRMED','BTB_TERBIT','SUBMITTED') THEN
      PERFORM public.notify_sp_milestone(v_id, v_new, v_status, v_new);
    END IF;
  END IF;
END; $$;

-- ─── set_sp_status: CREATE OR REPLACE. DECLARE +2 var (v_sp_id/v_old_status,
-- dibutuhkan krn fungsi ini SEBELUMNYA tak pernah resolve id/status lama SP
-- sebelum UPDATE). Cabang p_status='cancelled' dapat SELECT+notify baru;
-- cabang p_status='confirmed'/ELSE PERSIS tak berubah. ───────────────────────
CREATE OR REPLACE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer; v_sp_id uuid; v_old_status text;
BEGIN
  IF p_status NOT IN ('draft','confirmed','cancelled') THEN RAISE EXCEPTION 'invalid sp_status: %', p_status; END IF;
  UPDATE public.sp_items
     SET sp_status=p_status,
         confirmed_at = CASE WHEN p_status='confirmed' THEN now()    ELSE confirmed_at  END,
         confirmed_by = CASE WHEN p_status='confirmed' THEN v_uid    ELSE confirmed_by  END,
         cancelled_at = CASE WHEN p_status='cancelled' THEN now()    ELSE cancelled_at  END,
         cancelled_by = CASE WHEN p_status='cancelled' THEN v_uid    ELSE cancelled_by  END,
         cancel_reason= CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
         updated_at   = now()
   WHERE sp_no = p_sp_no AND customer_id = p_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF p_status = 'cancelled' THEN
    SELECT id, status INTO v_sp_id, v_old_status
      FROM public.sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
    UPDATE public.sp_orders
       SET status='CANCELLED', cancelled_at=now(), cancelled_by=v_uid, cancel_reason=p_reason, updated_at=now()
     WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
    IF FOUND AND v_sp_id IS NOT NULL THEN
      PERFORM public.notify_sp_milestone(v_sp_id, 'CANCELLED', v_old_status, 'CANCELLED');
    END IF;
  ELSE
    IF p_status='confirmed' THEN
      UPDATE public.sp_orders
         SET confirmed_at=COALESCE(confirmed_at,now()), confirmed_by=COALESCE(confirmed_by,v_uid), updated_at=now()
       WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
    END IF;
    PERFORM sp_recompute_status(p_customer_id, p_sp_no);
  END IF;
  RETURN v_count;
END; $$;

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE proname IN ('notify_sp_milestone','sp_recompute_status','set_sp_status');
--   -- ketiganya prosecdef=true
--
--   -- Test aman TANPA kirim email nyata (finance_controller nol user aktif
--   -- di ketiga entitas per 14 Agu 2026 — pakai BTB_TERBIT + SP nyata):
--   SELECT notify_sp_milestone('<sp_order_id nyata>', 'BTB_TERBIT', 'PICKING', 'BTB_TERBIT');
--   -- respons Edge Function seharusnya {"dikirim":0,"alasan":"no recipients resolved"}
--
--   SELECT id, status_code, content::jsonb FROM net._http_response ORDER BY id DESC LIMIT 3;
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Kembalikan sp_recompute_status & set_sp_status ke body PERSIS sebelum
-- migrasi ini (hapus 3 baris notify di masing-masing), lalu drop helper:
--
-- CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
-- DECLARE
--   v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
--   v_id uuid; v_status text; v_new text;
--   v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
--   v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
--   v_has_btb bool; v_has_invoice bool; v_submitted bool;
-- BEGIN
--   SELECT id, status INTO v_id, v_status
--     FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
--   IF v_id IS NULL THEN RETURN; END IF;
--   IF v_status IN ('CANCELLED','LUNAS') THEN RETURN; END IF;
--   v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
--   v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
--   v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
--   v_short := EXISTS(
--     SELECT 1 FROM sp_items si
--      WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
--        AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
--        AND (si.qty - si.shipped_qty) > COALESCE(
--              (SELECT SUM(ss.available) FROM stock_summary ss
--                WHERE ss.company_id=v_company AND ss.product_id=si.product_id), 0));
--   SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
--     FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
--   v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
--   v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');
--   v_has_btb     := EXISTS(SELECT 1 FROM sp_btb      WHERE sp_order_id=v_id AND deleted_at IS NULL);
--   v_has_invoice := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status <> 'void');
--   v_submitted   := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status='submitted');
--   v_new := CASE
--     WHEN v_submitted                              THEN 'SUBMITTED'
--     WHEN v_has_invoice                            THEN 'INVOICED'
--     WHEN v_has_btb                                THEN 'BTB_TERBIT'
--     WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
--     WHEN v_has_delivered                          THEN 'SAMPAI'
--     WHEN v_has_dispatch                           THEN 'DIKIRIM'
--     WHEN v_has_done                               THEN 'PACKED'
--     WHEN v_has_active                             THEN 'PICKING'
--     WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
--     WHEN v_confirmed                              THEN 'CONFIRMED'
--     ELSE 'DRAFT' END;
--   IF v_new IS DISTINCT FROM v_status THEN
--     UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
--   END IF;
-- END; $$;
--
-- CREATE OR REPLACE FUNCTION public.set_sp_status(p_sp_no text, p_status text, p_reason text, p_customer_id uuid) RETURNS integer
--     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
-- DECLARE v_uid uuid := auth.uid(); v_count integer;
-- BEGIN
--   IF p_status NOT IN ('draft','confirmed','cancelled') THEN RAISE EXCEPTION 'invalid sp_status: %', p_status; END IF;
--   UPDATE public.sp_items
--      SET sp_status=p_status,
--          confirmed_at = CASE WHEN p_status='confirmed' THEN now()    ELSE confirmed_at  END,
--          confirmed_by = CASE WHEN p_status='confirmed' THEN v_uid    ELSE confirmed_by  END,
--          cancelled_at = CASE WHEN p_status='cancelled' THEN now()    ELSE cancelled_at  END,
--          cancelled_by = CASE WHEN p_status='cancelled' THEN v_uid    ELSE cancelled_by  END,
--          cancel_reason= CASE WHEN p_status='cancelled' THEN p_reason ELSE cancel_reason END,
--          updated_at   = now()
--    WHERE sp_no = p_sp_no AND customer_id = p_customer_id;
--   GET DIAGNOSTICS v_count = ROW_COUNT;
--   IF p_status = 'cancelled' THEN
--     UPDATE public.sp_orders
--        SET status='CANCELLED', cancelled_at=now(), cancelled_by=v_uid, cancel_reason=p_reason, updated_at=now()
--      WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
--   ELSE
--     IF p_status='confirmed' THEN
--       UPDATE public.sp_orders
--          SET confirmed_at=COALESCE(confirmed_at,now()), confirmed_by=COALESCE(confirmed_by,v_uid), updated_at=now()
--        WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status <> 'CANCELLED';
--     END IF;
--     PERFORM sp_recompute_status(p_customer_id, p_sp_no);
--   END IF;
--   RETURN v_count;
-- END; $$;
--
-- DROP FUNCTION IF EXISTS public.notify_sp_milestone(uuid, text, text, text);
