-- =============================================================================
-- Migration: 20261101000005_notify_prf_submitted_trigger
-- Phase:     Integrasi 1 (PRF -> Google Space), Fase A3 -- trigger DB yang
--            memicu Edge Function notify-prf-space (Fase A2, sudah ada &
--            teruji di staging; TIDAK disentuh di migrasi ini).
--
-- Purpose:   Memicu notify-prf-space TEPAT SEKALI setiap kali sebuah PRF
--            baru masuk status SUBMITTED:
--              (a) INSERT dengan status SUBMITTED langsung, ATAU
--              (b) UPDATE OF status dari DRAFT ke SUBMITTED.
--            TIDAK memicu untuk transisi lain yang juga menyentuh status --
--            paling penting: prf_release (ACKNOWLEDGED -> SUBMITTED),
--            prf_claim (SUBMITTED -> ACKNOWLEDGED), prf_cancel_request
--            (-> CANCELLED). DUA trigger terpisah (bukan satu) karena WHEN
--            pada trigger AFTER INSERT tidak boleh mereferensi OLD --
--            Postgres menolaknya saat CREATE TRIGGER kalau event-nya
--            mencakup INSERT.
--
-- Kenapa tidak menembak ulang saat Edge Function menulis balik:
--   notify-prf-space/index.ts (SUDAH ADA, TIDAK diubah logikanya di sini)
--   hanya pernah melakukan UPDATE prf SET space_notified_at=...,
--   space_notify_error=... -- NOL baris menyebut kolom `status` di SET
--   clause mana pun. Trigger (b) di bawah ber-"AFTER UPDATE OF status" --
--   trigger kolom-spesifik PostgreSQL HANYA menyala kalau `status`
--   DISEBUT di SET clause UPDATE, terlepas dari apakah nilainya berubah.
--   Karena penulisan balik itu tidak pernah menyebut `status`, trigger ini
--   tidak pernah menyala dari situ -- baik jalur sukses maupun gagal.
--   Pola identik dengan yang sudah dibuktikan untuk trg_inquiry_review
--   (AFTER INSERT OR UPDATE OF status ON prf, SUDAH ADA, TIDAK disentuh di
--   sini) pada laporan audit ACL sebelumnya -- keduanya independen, nol
--   baca/tulis state yang sama, dan menyala BERSAMAAN (bukan saling
--   mengganti) pada event SUBMIT yang sama: trg_inquiry_review memindahkan
--   inquiry ke IN_REVIEW, trigger baru ini mengirim kartu Space.
--
-- Pembungkus net.http_post: SECURITY DEFINER, SET search_path eksplisit,
--   SELURUH badan dibungkus SATU EXCEPTION WHEN OTHERS di level fungsi --
--   kegagalan apa pun (vault kosong, pg_net belum terpasang, jaringan
--   gagal) TIDAK PERNAH melempar ke pemanggil; submit PRF selalu lanjut.
--   URL dasar Edge Function DAN token service-role DIBACA DARI VAULT, BUKAN
--   di-hardcode (notify_sp_milestone meng-hardcode URL -- itu TD-274;
--   SENGAJA TIDAK ditiru di sini). Nama secret vault:
--     - edge_fn_base_url     : base URL functions proyek ini, contoh
--                              https://<ref>.supabase.co/functions/v1
--     - edge_fn_service_key  : service-role key proyek ini
--   ⚠️ edge_fn_service_key HARUS berupa service role key BENTUK JWT (string
--   panjang berawalan "eyJ..."), BUKAN format kunci model baru
--   ("sb_secret_...") -- Authorization: Bearer di bawah mengasumsikan JWT.
--   ⚠️ Kalau service role key proyek ini pernah DIROTASI, edge_fn_service_key
--   WAJIB diperbarui manual di vault pada saat yang sama -- tidak ada
--   mekanisme sinkron otomatis antara keduanya.
--
-- Aman dijalankan walau pg_net BELUM terpasang: CREATE FUNCTION di PL/pgSQL
--   TIDAK memvalidasi keberadaan skema/fungsi yang dipanggil di badannya --
--   resolusi `net.http_post` baru terjadi saat fungsi DIEKSEKUSI, bukan
--   saat dibuat. Migrasi ini AMAN di-CREATE kapan pun. Kalau fungsi
--   benar-benar dieksekusi (ada yang submit PRF) SEBELUM pg_net terpasang,
--   PERFORM net.http_post(...) akan melempar error "schema net does not
--   exist" -- langsung tertangkap EXCEPTION WHEN OTHERS, submit PRF tetap
--   sukses, space_notify_error terisi pesan generik.
--
-- Depends:   Tidak ada ketergantungan EKSEKUSI (lihat paragraf di atas).
--            TIDAK membuat extension pg_net, TIDAK membuat secret vault --
--            keduanya LANGKAH MANUAL Mas, terpisah dari migrasi ini:
--              1. CREATE EXTENSION IF NOT EXISTS pg_net;  (SQL Editor)
--              2. SELECT vault.create_secret('<base url proyek>', 'edge_fn_base_url');
--              3. SELECT vault.create_secret('<service role key JWT proyek>', 'edge_fn_service_key');
--            Sebelum kedua secret itu ada, fungsi diam (no-op) -- lihat
--            badan fungsi di bawah -- submit PRF tetap jalan, kartu belum
--            terkirim sampai secret diisi.
-- Status:    BELUM DIJALANKAN -- disiapkan untuk SQL Editor Mas (staging
--            dulu, ikuti checklist tes manual di laporan sesi, baru
--            produksi).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_prf_submitted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base_url    text;
  v_service_key text;
BEGIN
  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'edge_fn_base_url';
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'edge_fn_service_key';

  IF v_base_url IS NULL OR v_service_key IS NULL THEN
    -- Secret vault belum diisi -- diam, submit PRF tetap jalan. Catat
    -- singkat supaya Mas tahu PRF ini belum pernah "dicoba" dinotifikasi.
    UPDATE public.prf SET space_notify_error = 'Notifikasi belum dikonfigurasi (vault secret kosong).'
     WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_base_url || '/notify-prf-space',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('prf_id', NEW.id),
    timeout_milliseconds := 15000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_prf_submitted] gagal memicu notifikasi utk prf % : %', NEW.id, SQLERRM;
  BEGIN
    UPDATE public.prf SET space_notify_error = 'Gagal memicu notifikasi (lihat log server).'
     WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- bahkan penulisan error pun gagal -- tetap jangan gagalkan submit.
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_prf_submitted() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_prf_submitted() TO service_role;

COMMENT ON FUNCTION public.notify_prf_submitted() IS
  'Trigger function (bukan RPC -- tidak pernah dipanggil langsung). Memicu notify-prf-space via net.http_post saat PRF INSERT langsung berstatus SUBMITTED, atau UPDATE OF status dari DRAFT ke SUBMITTED. URL dasar + service key dibaca dari vault (edge_fn_base_url/edge_fn_service_key), bukan hardcode. Seluruh kegagalan tertangkap EXCEPTION WHEN OTHERS -- tidak pernah menggagalkan submit PRF. Migrasi 20261101000005.';

DROP TRIGGER IF EXISTS trg_z_notify_prf_submitted_ins ON public.prf;
CREATE TRIGGER trg_z_notify_prf_submitted_ins
  AFTER INSERT ON public.prf
  FOR EACH ROW
  WHEN (NEW.status = 'SUBMITTED')
  EXECUTE FUNCTION public.notify_prf_submitted();

DROP TRIGGER IF EXISTS trg_z_notify_prf_submitted_upd ON public.prf;
CREATE TRIGGER trg_z_notify_prf_submitted_upd
  AFTER UPDATE OF status ON public.prf
  FOR EACH ROW
  WHEN (OLD.status = 'DRAFT' AND NEW.status = 'SUBMITTED')
  EXECUTE FUNCTION public.notify_prf_submitted();

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   -- (a) fungsi + ACL benar:
--   SELECT proname, prosecdef,
--          has_function_privilege('anon', oid, 'EXECUTE')          AS anon_boleh,
--          has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_boleh,
--          has_function_privilege('service_role', oid, 'EXECUTE')  AS service_role_boleh
--     FROM pg_proc WHERE proname = 'notify_prf_submitted' AND pronamespace = 'public'::regnamespace;
--   -- Diharapkan: prosecdef=true, anon_boleh=false, authenticated_boleh=false, service_role_boleh=true.
--
--   -- (b) kedua trigger terpasang dengan WHEN yang benar:
--   SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
--     FROM pg_trigger
--    WHERE tgrelid = 'public.prf'::regclass AND tgname LIKE 'trg_z_notify_prf_submitted%';
--   -- Diharapkan: 2 baris.
--
--   -- (c) smoke test TANPA pg_net/vault terpasang (aman -- RAISE WARNING
--   -- tertangkap, baris tetap ter-INSERT/UPDATE, dijalankan dalam transaksi
--   -- yang di-ROLLBACK, nol dampak data):
--   BEGIN;
--     -- (isi dengan satu baris prf uji, atau UPDATE baris DRAFT uji ke SUBMITTED)
--     -- cek: SELECT space_notify_error FROM prf WHERE id = '<id uji>';
--     -- diharapkan terisi pesan "Notifikasi belum dikonfigurasi..." atau
--     -- "Gagal memicu notifikasi..." (bukan error yang menggagalkan transaksi).
--   ROLLBACK;

-- ─── ROLLBACK ─────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_z_notify_prf_submitted_ins ON public.prf;
-- DROP TRIGGER IF EXISTS trg_z_notify_prf_submitted_upd ON public.prf;
-- DROP FUNCTION IF EXISTS public.notify_prf_submitted();
-- =============================================================================
