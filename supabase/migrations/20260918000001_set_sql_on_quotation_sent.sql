-- =============================================================================
-- 20260918000001_set_sql_on_quotation_sent.sql
--
-- !!  M I G R A S I   R E T R O A K T I F  --  BACA SEBELUM MENJALANKAN  !!
--
--   Isi berkas ini SUDAH LIVE DI PRODUCTION sejak 18 September 2026,
--   dijalankan langsung di SQL Editor sebagai
--   "auto_promote_account_to_sql_on_quotation_sent". Berkas migrasinya tidak
--   pernah dibuat: sampai 27 Sep 2026 objek ini NOL JEJAK di repo -- nol hit
--   di supabase/, src/, maupun docs/, kecuali catatan TD-279 sendiri.
--
--   !! JANGAN DIJALANKAN DI PRODUCTION. Di sana ia sudah ada, dan menjalankan
--      ulang CREATE OR REPLACE memang tidak merusak -- tapi berkas ini bukan
--      perubahan yang menunggu naik. Ia REKAMAN.
--   !! TIDAK MASUK ANTREAN doc 12. Antrean itu daftar yang harus dinaikkan;
--      memasukkannya ke sana membuat daftar itu berbohong.
--   >> DIJALANKAN DI STAGING saja, supaya staging berhenti berbeda dari
--      production (TD-279, Kelompok A4).
--
-- -- APA YANG DILAKUKANNYA ---------------------------------------------------
-- Trigger pada `quotations`: begitu sebuah quotation berstatus SENT, akun yang
-- ditunjuknya dinaikkan ke tahap `sql` -- hanya kalau ia masih di
-- lead/mql/prospect, jadi akun yang sudah lebih jauh tidak pernah dimundurkan.
--
-- ** Ia menulis DUA kolom sekaligus, `account_status` DAN `lifecycle_stage`,
-- dan menjaga syaratnya pada KEDUANYA. Itu bentuk yang lahir di masa transisi
-- dua sumbu (CRM v3). Siapa pun yang kelak mencabut salah satu kolom harus
-- ikut menyentuh fungsi ini -- dan tanpa berkas ini, tidak ada yang akan
-- menemukannya lewat grep di repo.
--
-- -- DUA HAL YANG DISALIN APA ADANYA, BUKAN "DIPERBAIKI" ---------------------
-- 1. ACL-nya `proacl NULL` = PUBLIC EXECUTE. Berkas ini SENGAJA tidak
--    mengeluarkan GRANT/REVOKE apa pun: satu perintah saja akan memunculkan
--    proacl eksplisit dan membuat staging BERBEDA dari production. Kalau
--    PUBLIC EXECUTE-nya memang perlu dicabut, itu keputusan untuk KEDUA
--    lingkungan dan berkasnya sendiri, bukan efek samping penyamaan.
-- 2. Nama triggernya `trg_set_sql_...`, bukan berawalan `trg_z_` seperti
--    konvensi urutan trigger di repo ini. Disalin apa adanya -- mengganti nama
--    di staging saja justru melahirkan drift baru.
--
-- Status: LIVE DI PRODUCTION sejak 18 Sep 2026 (pelaku tidak tercatat).
--         Direkam retroaktif + dijalankan di STAGING 27 Sep 2026.
-- =============================================================================

BEGIN;

-- !! SECURITY DEFINER WAJIB ADA. Versi pertama berkas ini melewatkannya, dan
--    A4a tetap melaporkan "sama persis" karena blok V-nya hanya memeriksa
--    md5(prosrc) + ACL + definisi trigger -- tiga hal yang memang sama.
--    Yang berbeda prosecdef, dan itu BUKAN kosmetik: fungsi trigger ini
--    meng-UPDATE public.accounts. Sebagai SECURITY DEFINER ia berjalan sebagai
--    pemiliknya dan menembus RLS; sebagai INVOKER ia berjalan sebagai pemanggil
--    dan bisa GAGAL MENAIKKAN TAHAP AKUN tanpa satu pun error -- UPDATE yang
--    tersaring RLS mengembalikan nol baris, bukan exception.
CREATE OR REPLACE FUNCTION public.set_sql_on_quotation_sent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
BEGIN
  IF NEW.status = 'SENT' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SENT') THEN
    UPDATE public.accounts
    SET account_status  = 'sql',
        lifecycle_stage = 'sql'
    WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
      AND lifecycle_stage IN ('lead','mql','prospect')
      AND account_status  IN ('lead','mql','prospect');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_sql_on_quotation_sent ON public.quotations;
CREATE TRIGGER trg_set_sql_on_quotation_sent AFTER INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION set_sql_on_quotation_sent();

-- -- V1: badan + ACL + trigger sama dengan production ------------------------
-- !! SIDIK JARI YANG DIPERIKSA = SIDIK JARI env-drift-check, bukan md5(prosrc)
--    saja. Versi pertama V1 ini memeriksa badan + ACL + trigger, ketiganya
--    cocok, dan ia melaporkan LOLOS -- sementara env-drift-check tetap
--    melaporkan BEDA ISI karena ia juga menimbang prosecdef, provolatile, dan
--    proconfig.
--    ** Blok verifikasi yang lebih longgar daripada alat yang memeriksanya
--    bukan verifikasi; ia jaminan palsu.
--
-- !! DAN SEKALI LAGI, DENGAN CARA YANG BERLAWANAN (28 Sep 2026). Versi KEDUA V1
--    ini memeriksa sidik jari penuh -- rumusnya benar, tapi angka harapannya
--    DIHITUNG DI LUAR SQL dengan anggapan prosecdef::text menghasilkan 't'.
--    Ia menghasilkan 'true'; 't' cuma cara psql MENAMPILKAN boolean. Akibatnya
--    V1a2 berbunyi atas keadaan yang SUDAH BENAR, dan pesan gagalnya mencetak
--    sidik jari production sendiri sebagai angka "yang salah".
--    ** Angka harapan tidak boleh dihitung; ia harus diukur. Yang dipakai di
--    bawah sekarang berasal dari inventaris production yang diukur 27 Sep
--    (scripts/qa/parity/inventaris-production-20260927.json), dan penjaganya
--    scripts/qa/cek-sidik-parity.mjs menolak angka yang bukan angka ukur.
--    Rumusnya sendiri kini satu konstanta bersama di env-drift-check.mjs
--    (EKSPRESI_SIDIK_FUNGSI), jadi ia tidak bisa lagi berbeda tanpa ketahuan.
DO $v1$
DECLARE v_sidik text; v_acl text; v_def text; v_md5 text;
BEGIN
  SELECT md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), '')),
         md5(p.prosrc),
         COALESCE(array_to_string(p.proacl::text[], ','), '(null)')
    INTO v_sidik, v_md5, v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='set_sql_on_quotation_sent';
  IF v_md5 IS DISTINCT FROM '6f28f42a8b597ec35eac6df37356285a' THEN
    RAISE EXCEPTION 'V1a GAGAL: badan set_sql_on_quotation_sent tidak sama dengan production (md5 %).', v_md5;
  END IF;
  IF v_sidik IS DISTINCT FROM 'cca33b7ddc056b9992103c092d17da39' THEN
    RAISE EXCEPTION 'V1a2 GAGAL: sidik jari fungsi (badan+secdef+volatile+config) = %, harusnya cca33b7ddc056b9992103c092d17da39 seperti production.', v_sidik;
  END IF;
  -- proacl WAJIB tetap NULL: itulah bentuk production. Kalau ia sudah tidak
  -- NULL, ada GRANT/REVOKE yang tidak diminta dan staging jadi berbeda lagi.
  IF v_acl IS DISTINCT FROM '(null)' THEN
    RAISE EXCEPTION 'V1b GAGAL: proacl set_sql_on_quotation_sent = %, harusnya NULL seperti production.', v_acl;
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO v_def
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname='trg_set_sql_on_quotation_sent';
  IF v_def IS DISTINCT FROM 'CREATE TRIGGER trg_set_sql_on_quotation_sent AFTER INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION set_sql_on_quotation_sent()' THEN
    RAISE EXCEPTION 'V1c GAGAL: definisi trigger berbeda dari production. Dapat: %', COALESCE(v_def,'(tidak ada)');
  END IF;

  RAISE NOTICE 'A4a LOLOS: fungsi + trigger + ACL sama persis dengan production.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK (staging saja):
--   DROP TRIGGER IF EXISTS trg_set_sql_on_quotation_sent ON public.quotations;
--   DROP FUNCTION IF EXISTS public.set_sql_on_quotation_sent();
-- =============================================================================
