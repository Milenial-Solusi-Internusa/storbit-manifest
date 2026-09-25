-- =============================================================================
-- 20260925000003_staging_only_notify_sp_milestone_noop.sql
--
--        !!!  S T A G I N G   O N L Y  --  JANGAN DIJALANKAN DI PRODUCTION  !!!
--
-- Berkas ini BUKAN bagian dari antrean migrasi produksi. Ia tidak pernah boleh
-- muncul di 12_ANTREAN_MIGRASI_PRODUCTION.md sebagai butir yang dijalankan ke
-- produksi -- di sana ia tercatat justru sebagai butir ARAH TERBALIK: sesuatu
-- yang hidup di staging dan HARUS TIDAK IKUT naik.
--
-- Menjalankannya di produksi akan MEMATIKAN notifikasi milestone SP untuk
-- seluruh pengguna, tanpa satu pun error -- karena pemanggilnya memakai
-- PERFORM dan badan pengganti ini memang sengaja diam.
--
-- -----------------------------------------------------------------------------
-- KENAPA ADA
-- -----------------------------------------------------------------------------
-- Badan produksi notify_sp_milestone memanggil Edge Function PRODUKSI lewat URL
-- yang DI-HARDCODE di dalam badan fungsi (net.http_post ke
-- '<ref-produksi>.supabase.co/functions/v1/notify-sp-milestone'; tokennya sendiri
-- sudah diambil dari vault, URL-nya tidak -- lihat TD-274).
--
-- Akibatnya, selama staging membawa badan produksi, setiap perubahan status SP
-- DI STAGING menyuruh PRODUKSI mengirim notifikasi. Itu bukan risiko teoretis:
-- seed data dummy UAT (scripts/seed/uat/) memanggil sp_recompute_status RATUSAN
-- kali dalam satu run.
--
-- Karena itu fungsinya dijadikan NO-OP di staging pada 25 September 2026 --
-- perubahan itu dilakukan MANUAL, di luar berkas migrasi mana pun, sehingga
-- nol jejak di git. Berkas ini merekamnya secara retroaktif supaya:
--   (a) keadaan staging punya sumber tertulis, bukan cuma ingatan; dan
--   (b) ia bisa DIPASANG ULANG dengan satu langkah setiap kali staging
--       di-refresh/di-restore dari produksi dan membawa badan produksi lagi.
--
-- Keadaan no-op ini PERMANEN selama staging bukan produksi.
--
-- -----------------------------------------------------------------------------
-- HUBUNGAN DENGAN PALANG SEED
-- -----------------------------------------------------------------------------
-- Seluruh skrip di scripts/seed/uat/ menolak jalan kalau badan fungsi ini masih
-- memuat 'net.http' atau ref produksi (uji V10 di 06-verify.sql). Jadi kalau
-- seed tiba-tiba menolak jalan sesudah staging di-refresh, berkas INILAH
-- jawabannya -- jalankan ini, jangan melemahkan palangnya.
--
-- -----------------------------------------------------------------------------
-- PALANG
-- -----------------------------------------------------------------------------
-- Tidak ada cara yang benar-benar dapat diandalkan untuk "mendeteksi produksi"
-- dari dalam SQL: staging yang baru di-restore dari produksi berisi data yang
-- sama persis, jadi penanda berbasis data justru akan menolak tepat pada saat
-- berkas ini paling dibutuhkan. Maka palangnya berupa REM TANGAN EKSPLISIT:
-- operator harus menyatakan niatnya di sesi yang sama.
--
--   SET nexus.izin_staging_only = 'ya-ini-staging';
--   \i supabase/migrations/20260925000003_staging_only_notify_sp_milestone_noop.sql
--
-- Tanpa baris SET itu, berkas ini berhenti dan tidak mengubah apa pun.
--
-- Status: LIVE DI STAGING (25 Sep 2026, dipasang manual; berkas ini rekaman
--         retroaktifnya). PRODUKSI: TIDAK PERNAH, DAN TIDAK BOLEH.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG 1 -- rem tangan operator.
-- ---------------------------------------------------------------------------
DO $palang$
BEGIN
  IF COALESCE(current_setting('nexus.izin_staging_only', true), '') <> 'ya-ini-staging' THEN
    RAISE EXCEPTION
      'PALANG: berkas ini KHUSUS STAGING dan akan mematikan notifikasi milestone SP. Kalau ini memang staging, jalankan dulu di sesi yang sama:  SET nexus.izin_staging_only = ''ya-ini-staging'';  Kalau ini PRODUKSI: berhenti di sini.';
  END IF;
END
$palang$;

-- ---------------------------------------------------------------------------
-- PALANG 2 -- fungsinya harus ada dengan tanda tangan yang diharapkan.
-- Kalau tanda tangannya berubah, CREATE OR REPLACE di bawah akan membuat
-- overload BARU alih-alih mengganti yang lama, dan badan produksi tetap hidup
-- berdampingan (kelas gotcha #37/#39). Lebih baik berhenti.
-- ---------------------------------------------------------------------------
DO $sig$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'notify_sp_milestone';

  IF v_n = 0 THEN
    RAISE EXCEPTION 'PALANG: public.notify_sp_milestone tidak ada di DB ini. Periksa dulu -- jangan membuat fungsi baru dari berkas staging.';
  END IF;

  IF v_n > 1 THEN
    RAISE EXCEPTION 'PALANG: ada % overload public.notify_sp_milestone. Berkas ini hanya mengenal satu tanda tangan (uuid, text, text, text); selesaikan overloadnya dulu.', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'notify_sp_milestone'
       AND pg_get_function_identity_arguments(p.oid)
           = 'p_sp_order_id uuid, p_milestone text, p_old_status text, p_new_status text'
  ) THEN
    RAISE EXCEPTION 'PALANG: tanda tangan public.notify_sp_milestone bukan (p_sp_order_id uuid, p_milestone text, p_old_status text, p_new_status text). Berhenti.';
  END IF;
END
$sig$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan SEBELUM. Dicetak supaya jejaknya ada di log eksekusi.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE r record;
BEGIN
  SELECT p.prosrc LIKE '%net.http%'   AS ada_net_http,
         p.prosrc LIKE '%supabase.co%' AS ada_url_supabase,
         length(p.prosrc)             AS panjang,
         md5(p.prosrc)                AS md5_src
    INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'notify_sp_milestone';

  RAISE NOTICE 'V0 SEBELUM: net.http=% url_supabase=% panjang=% md5=%',
    r.ada_net_http, r.ada_url_supabase, r.panjang, r.md5_src;

  IF NOT r.ada_net_http THEN
    RAISE NOTICE 'V0: badan fungsi SUDAH tidak memanggil net.http -- berkas ini idempoten, teruskan saja.';
  END IF;
END
$v0$;

-- ---------------------------------------------------------------------------
-- BADAN NO-OP
--
-- Tiga sifat yang WAJIB dipertahankan kalau badan ini kelak disunting:
--   1. TIDAK BOLEH melempar error -- pemanggilnya (set_sp_status,
--      sp_recompute_status) memakai PERFORM tanpa penangkap, jadi error di
--      sini akan menggagalkan perubahan status SP.
--   2. TIDAK BOLEH memuat string 'net.http' maupun ref proyek produksi --
--      palang di seluruh skrip seed memeriksa persis itu.
--   3. Atribut fungsi disalin apa adanya dari keadaan hidup: SECURITY DEFINER,
--      SET search_path = public, RETURNS void, VOLATILE. CREATE OR REPLACE
--      mempertahankan ACL; ACL-nya sendiri NULL (= PUBLIC EXECUTE), sama
--      seperti di produksi -- berkas ini sengaja TIDAK mengubahnya supaya
--      satu-satunya perbedaan staging vs produksi tetap badan fungsinya.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_sp_milestone(
  p_sp_order_id uuid,
  p_milestone   text,
  p_old_status  text,
  p_new_status  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Dinonaktifkan sengaja di lingkungan non-produksi (staging).
  -- Versi produksi memanggil Edge Function produksi lewat URL yang di-hardcode;
  -- jangan salin badan produksi ke sini. Tidak boleh melempar error karena
  -- pemanggilnya (set_sp_status, sp_recompute_status) memakai PERFORM.
  RAISE NOTICE '[notify_sp_milestone] dinonaktifkan di staging (sp_order=%, milestone=%, % -> %)',
    p_sp_order_id, p_milestone, p_old_status, p_new_status;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- V1 -- keadaan SESUDAH. Asersinya sengaja memeriksa SIFAT (tidak ada panggilan
-- keluar), bukan md5 badan fungsi: md5 akan berubah oleh spasi dan itu akan
-- membuat verifikasi ini berbunyi karena alasan yang salah.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE r record;
BEGIN
  SELECT p.prosrc LIKE '%net.http%'    AS ada_net_http,
         p.prosrc LIKE '%supabase.co%' AS ada_url_supabase,
         p.prosecdef                   AS security_definer,
         array_to_string(p.proconfig, ',') AS cfg
    INTO r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'notify_sp_milestone';

  IF r.ada_net_http OR r.ada_url_supabase THEN
    RAISE EXCEPTION 'V1 GAGAL: badan fungsi masih memuat panggilan keluar (net.http=%, url=%).',
      r.ada_net_http, r.ada_url_supabase;
  END IF;

  IF NOT r.security_definer THEN
    RAISE EXCEPTION 'V1 GAGAL: fungsi kehilangan SECURITY DEFINER.';
  END IF;

  IF COALESCE(r.cfg, '') <> 'search_path=public' THEN
    RAISE EXCEPTION 'V1 GAGAL: proconfig bukan search_path=public (dapat: %).', COALESCE(r.cfg, '(kosong)');
  END IF;

  RAISE NOTICE 'V1 LOLOS: notify_sp_milestone no-op, tanpa panggilan keluar, atribut utuh.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- "Rollback" di sini berarti MENGEMBALIKAN BADAN PRODUKSI ke staging, dan itu
-- hampir selalu SALAH: begitu badan produksi hidup di staging, perubahan status
-- SP di staging akan menyuruh produksi mengirim notifikasi lagi, dan seluruh
-- skrip seed akan menolak jalan (uji V10).
--
-- Kalau toh perlu (mis. menguji jalur notifikasi dengan Edge Function STAGING),
-- yang benar BUKAN menyalin badan produksi apa adanya, melainkan menulis badan
-- yang menunjuk proyek STAGING -- dan itu pekerjaan tersendiri yang mestinya
-- sekalian menutup TD-274 (URL dibaca dari konfigurasi, bukan hardcode;
-- tokennya sudah dari vault, jadi tinggal URL-nya).
--
-- Badan produksi TIDAK disalin ke berkas ini dengan sengaja: menaruhnya di sini
-- membuatnya mudah ter-copy-paste ke staging, persis hal yang berkas ini cegah.
-- Sumbernya ada di produksi sendiri (pg_proc.prosrc) dan itu satu-satunya
-- tempat ia perlu hidup.
-- =============================================================================
