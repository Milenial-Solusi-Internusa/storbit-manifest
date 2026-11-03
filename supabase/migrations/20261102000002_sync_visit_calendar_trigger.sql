-- =============================================================================
-- Migration: 20261102000002_sync_visit_calendar_trigger
-- Phase:     Integrasi 2 (Kalender Kunjungan Sales), Fase 3 -- trigger DB
--            yang memicu Edge Function sync-visit-calendar (Fase 2a+2b, SUDAH
--            ADA & teruji manual; TIDAK disentuh sama sekali di migrasi ini)
--            setiap kali sebuah kunjungan (activities.type='visit') lahir
--            atau berubah pada kolom/field yang relevan ke Google Calendar.
--
-- Depends:   - supabase/migrations/20261102000001_visit_calendar_sync_table.sql
--              (tabel public.visit_calendar_sync, SUDAH ADA -- TIDAK disentuh
--              di sini). Migrasi ini TIDAK memvalidasi keberadaannya lewat
--              DDL apa pun -- kalau tabel itu belum ada saat trigger
--              menyala, Edge Function yang akan gagal menulisnya, bukan
--              trigger ini (trigger ini sendiri TIDAK PERNAH menyentuh
--              visit_calendar_sync sama sekali -- lihat fungsi di bawah).
--            - supabase/functions/sync-visit-calendar/index.ts (SUDAH ADA,
--              TIDAK diubah logikanya di sini). Kontrak yang diasumsikan
--              tetap: menerima HANYA POST dgn body {"activity_id": "<uuid>"},
--              mewajibkan klaim JWT role pemanggil persis sama dengan role
--              yang dipakai pemanggilan server-to-server proyek ini (dicek
--              index.ts sendiri via decodeJwtRole -- bukan diverifikasi di
--              sini), dan fungsi itu SENDIRI membaca ulang seluruh data
--              kunjungan dari DB berdasarkan activity_id -- trigger ini
--              TIDAK PERNAH mengirim field lain selain activity_id.
--
-- Saklar (kill switch): secret vault BARU bernama
--   `visit_calendar_sync_enabled`, TERPISAH dari secret `edge_fn_base_url`/
--   `edge_fn_service_key` yang sudah dipakai notify_prf_submitted (migrasi
--   20261101000005). Fungsi HANYA melanjutkan ke net.http_post kalau nilai
--   secret ini PERSIS string 'true' -- nilai lain apa pun (termasuk 'TRUE',
--   'True', '1', string kosong) dianggap MATI, sama dengan secret yang sama
--   sekali tidak ada. SECRET INI BELUM DIBUAT OLEH MIGRASI MANA PUN --
--   vault.create_secret adalah langkah manual Mas, terpisah dari migrasi ini
--   (lihat laporan sesi untuk SQL-nya). Konsekuensinya DISENGAJA: PRODUKSI
--   DEFAULT MATI begitu migrasi ini dijalankan -- trigger akan terpasang dan
--   menyala pada setiap INSERT/UPDATE kunjungan yang relevan, TAPI fungsinya
--   RETURN NEW seketika tanpa pernah memanggil Google, tanpa menulis apa
--   pun, sampai Mas SENGAJA membuat secret itu dan mengisinya 'true'. Begitu
--   saklar menyala, fungsi masih memeriksa `edge_fn_base_url`/
--   `edge_fn_service_key` (dipakai BERSAMA notify_prf_submitted) -- kalau
--   salah satu kosong, tetap diam juga.
--
-- Keterbatasan yang DITERIMA (bukan dikerjakan di migrasi ini):
--   (1) Transisi KELUAR dari visit (mis. sebuah kunjungan diubah type-nya
--       dari 'visit' ke 'call'/'meeting'/dll lewat form edit activities
--       generik) TIDAK memicu apa pun di sini. Event Google yang sudah ada
--       untuk activity itu TIDAK dihapus oleh trigger ini -- hanya transisi
--       MASUK ke visit (OLD.type bukan 'visit', NEW.type = 'visit') yang
--       ditangani trigger UPDATE di bawah.
--   (2) Hard-delete baris activities (RLS activities_delete mengizinkannya
--       utk manager-ke-atas/pembuat baris, bukan cuma super_admin, walau UI
--       hari ini nol pemakai jalur itu) TIDAK ditangani trigger BEFORE
--       DELETE apa pun. FK visit_calendar_sync.activity_id ON DELETE CASCADE
--       (sudah ditulis di 20261102000001) berarti baris pelacakan ikut
--       lenyap SEKETIKA bersama baris activities-nya, SEBELUM ada kesempatan
--       menghapus event Google-nya -- event itu akan tertinggal di kalender
--       sales tanpa jejak sinkron apa pun. Diterima sebagai risiko kecil
--       mengingat jalur hard-delete ini hari ini nol pemakai UI.
--
-- Nol risiko loop/rekursi: Edge Function sync-visit-calendar (index.ts)
--   TIDAK PERNAH menulis balik ke tabel activities -- satu-satunya tabel
--   yang ditulisnya adalah visit_calendar_sync (diverifikasi membaca
--   seluruh berkas, bukan diasumsikan). Trigger di migrasi ini HANYA
--   menempel di activities, jadi trigger ini dan Edge Function tidak akan
--   pernah saling memicu satu sama lain.
--
-- Pembungkus net.http_post: pola PERSIS notify_prf_submitted (migrasi
--   20261101000005) -- SECURITY DEFINER, SET search_path eksplisit, SELURUH
--   badan dibungkus SATU EXCEPTION WHEN OTHERS di level fungsi. Kegagalan
--   apa pun (saklar mati, vault kosong, pg_net belum terpasang, jaringan
--   gagal) TIDAK PERNAH melempar ke pemanggil -- menyimpan/mengubah
--   kunjungan selalu lanjut normal. timeout_milliseconds di-set 30000
--   (bukan default pg_net 5000) karena satu panggilan ke Edge Function ini
--   bisa melibatkan beberapa panggilan Google Calendar berurutan (GET lalu
--   INSERT/PUT/DELETE, kadang dua identitas penuh utk rute reassign).
--
-- Status:    BELUM DIJALANKAN -- disiapkan untuk SQL Editor Mas (staging
--             dulu, ikuti rencana tes di laporan sesi, baru produksi).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_visit_calendar_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_enabled     text;
  v_base_url    text;
  v_service_key text;
BEGIN
  SELECT decrypted_secret INTO v_enabled
    FROM vault.decrypted_secrets WHERE name = 'visit_calendar_sync_enabled';

  -- Saklar: HANYA nilai 'true' (persis, case-sensitive) yang melanjutkan.
  -- Secret tidak ada (v_enabled NULL) ATAU nilainya apa pun selain 'true'
  -- -> diam total, nol net.http_post, nol penulisan ke tabel mana pun.
  -- Ini membuat PRODUKSI default MATI sampai Mas sengaja membuat secret ini
  -- dan mengisinya 'true' -- lihat header migrasi di atas.
  IF v_enabled IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'edge_fn_base_url';
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'edge_fn_service_key';

  IF v_base_url IS NULL OR v_service_key IS NULL THEN
    -- Saklar menyala tapi dua secret dasar ini (dipakai bersama fungsi
    -- notify_prf_submitted) belum/tak lagi ada -- diam juga, bukan error.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_base_url || '/sync-visit-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('activity_id', NEW.id),
    timeout_milliseconds := 30000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_visit_calendar_sync] gagal memicu sinkron utk activity % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_visit_calendar_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_visit_calendar_sync() TO service_role;

COMMENT ON FUNCTION public.notify_visit_calendar_sync() IS
  'Trigger function (bukan RPC -- tidak pernah dipanggil langsung oleh klien). Memicu sync-visit-calendar via net.http_post saat baris kunjungan (activities.type=''visit'') baru lahir, atau berubah pada field yang relevan ke Google Calendar. Diam total (no-op) kecuali secret vault visit_calendar_sync_enabled bernilai persis ''true'' DAN edge_fn_base_url/edge_fn_service_key terisi -- default PRODUKSI MATI sampai saklar dibuat. Seluruh kegagalan tertangkap EXCEPTION WHEN OTHERS -- tidak pernah menggagalkan penyimpanan baris activities itu sendiri. Migrasi 20261102000002.';

-- ── Trigger INSERT: kunjungan baru ──────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_z_notify_visit_calendar_sync_ins ON public.activities;
CREATE TRIGGER trg_z_notify_visit_calendar_sync_ins
  AFTER INSERT ON public.activities
  FOR EACH ROW
  WHEN (NEW.type = 'visit')
  EXECUTE FUNCTION public.notify_visit_calendar_sync();

-- ── Trigger UPDATE: HANYA field yang relevan ke Google Calendar ─────────────
-- Perubahan lain (MOM, notes, alasan batal, status todo->done, dll) TIDAK
-- boleh memicu -- seluruh pengecekan NULL-safe lewat IS DISTINCT FROM.
DROP TRIGGER IF EXISTS trg_z_notify_visit_calendar_sync_upd ON public.activities;
CREATE TRIGGER trg_z_notify_visit_calendar_sync_upd
  AFTER UPDATE ON public.activities
  FOR EACH ROW
  WHEN (
    NEW.type = 'visit'
    AND (
      -- Transisi MASUK ke visit lewat UPDATE (mis. activity bertipe lain
      -- diedit jadi type='visit') -- disamakan dgn "kunjungan baru".
      -- Transisi KELUAR dari visit SENGAJA TIDAK ditangani (lihat header).
      OLD.type IS DISTINCT FROM 'visit'
      OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
      OR NEW.activity_time IS DISTINCT FROM OLD.activity_time
      OR NEW.assigned_to   IS DISTINCT FROM OLD.assigned_to
      OR NEW.account_id    IS DISTINCT FROM OLD.account_id
      OR NEW.deleted_at    IS DISTINCT FROM OLD.deleted_at
      -- status berpindah KE 'cancelled' (dari status lain)...
      OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
      -- ...ATAU berpindah DARI 'cancelled' (ke status lain). Transisi
      -- todo<->done TIDAK match salah satu dari dua baris ini -- SENGAJA.
      OR (OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled')
      -- Tiga key details yang relevan Google Calendar. `mom` SENGAJA
      -- TIDAK dibandingkan -- mengubah MOM saja tidak boleh memicu sync.
      OR (NEW.details ->> 'location')        IS DISTINCT FROM (OLD.details ->> 'location')
      OR (NEW.details ->> 'visit_type')       IS DISTINCT FROM (OLD.details ->> 'visit_type')
      OR (NEW.details ->> 'point_of_meeting') IS DISTINCT FROM (OLD.details ->> 'point_of_meeting')
    )
  )
  EXECUTE FUNCTION public.notify_visit_calendar_sync();

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   -- (a) fungsi + ACL benar (anon/authenticated HARUS false; pemilik
--   -- fungsi/owner postgres implisit boleh muncul, bukan dari GRANT ini):
--   SELECT proname, prosecdef,
--          has_function_privilege('anon', oid, 'EXECUTE')          AS anon_boleh,
--          has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_boleh
--     FROM pg_proc WHERE proname = 'notify_visit_calendar_sync' AND pronamespace = 'public'::regnamespace;
--   -- Diharapkan: prosecdef=true, anon_boleh=false, authenticated_boleh=false.
--
--   -- (b) kedua trigger terpasang dengan WHEN yang benar:
--   SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
--     FROM pg_trigger
--    WHERE tgrelid = 'public.activities'::regclass AND tgname LIKE 'trg_z_notify_visit_calendar_sync%';
--   -- Diharapkan: 2 baris.
--
--   -- (c) kasus pemicu/non-pemicu lengkap (saklar ada/tidak, tiap kondisi
--   -- WHEN satu-satu, diukur lewat net.http_request_queue) -- skrip
--   -- lengkapnya DIKIRIM TERPISAH di laporan sesi, bukan di berkas ini,
--   -- supaya jelas Mas yang menjalankan lewat SQL Editor, bukan migrasi.

-- ─── ROLLBACK ─────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_z_notify_visit_calendar_sync_ins ON public.activities;
-- DROP TRIGGER IF EXISTS trg_z_notify_visit_calendar_sync_upd ON public.activities;
-- DROP FUNCTION IF EXISTS public.notify_visit_calendar_sync();
-- =============================================================================
