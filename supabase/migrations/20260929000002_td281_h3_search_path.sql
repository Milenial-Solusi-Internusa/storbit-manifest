-- =============================================================================
-- 20260929000002_td281_h3_search_path.sql
--
-- TD-281 H3 -- delapan fungsi SECURITY DEFINER terakhir yang belum mengunci
-- `search_path` ikut dikunci ke 'public'.
--
-- Status: BELUM DIJALANKAN di mana pun (ditulis 28 Sep 2026).
--         ⚠️ ARAH TERBALIK: targetnya PRODUCTION; staging dijalankan lebih
--         dulu sebagai UJI.
--
-- -- KENAPA INI PENTING --------------------------------------------------------
-- Fungsi `SECURITY DEFINER` berjalan sebagai PEMILIKNYA. Tanpa `search_path`
-- terkunci, ia memakai search_path si PEMANGGIL -- jadi pemanggil bisa
-- mengatur agar acuan tak berkualifikasi di dalam badan fungsi menunjuk ke
-- objek MILIKNYA SENDIRI, lalu objek itu dipakai dengan hak si pemilik.
--
-- Dari 76 SECURITY DEFINER di `public` (diukur production 28 Sep 2026),
-- ** 66 sudah mengunci ** search_path. Berkas ini menyamakan delapan yang
-- tertinggal; ia tidak memperkenalkan kebijakan baru, ia menuntaskan yang
-- sudah jadi kebiasaan.
--
-- -- BENTUK BUKTINYA ADALAH ALASAN MENGERJAKANNYA BEGINI ----------------------
-- `ALTER FUNCTION ... SET search_path` TIDAK menyentuh `prosrc`. Jadi
-- ** md5(prosrc) WAJIB identik sebelum dan sesudah ** untuk kedelapannya, dan
-- yang bergerak hanya `proconfig`. Klaim "nol badan berubah" di sini bukan
-- janji -- ia diasersi. Bentuk yang sama dipakai H1 lapis 1.
--
-- -- KEDELAPAN BADAN SUDAH DIBACA DARI PRODUCTION, BUKAN DARI REPO ------------
-- (TD-282: teks repo bisa berbeda dari production.) Disisir untuk acuan TAK
-- BERKUALIFIKASI ke objek di luar `public`, karena mengunci search_path
-- MENGUBAH RESOLUSI NAMA -- dan matinya akan muncul saat RUNTIME, bukan saat
-- ALTER. Itu persis kelas cacat 42702: cacat yang LAHIR dari perbaikannya.
--
-- Hasil sisiran (28 Sep 2026, badan production):
--   exec_sql               badannya cuma `EXECUTE sql` -- NOL acuan sendiri.
--                          Yang terpengaruh adalah SQL yang DIKIRIM pemanggil.
--                          Satu-satunya pemanggil = EF `manage-schema`, dan ia
--                          mengirim `ALTER TABLE public.<t> ADD COLUMN ...`
--                          -- nama tabel SUDAH ber-skema, tipe dari daftar
--                          bawaan (resolve lewat pg_catalog, selalu implisit).
--                          >> aman untuk pemanggil yang ada. ⚠️ Kalau kelak
--                          ada pemanggil baru yang mengirim acuan tak
--                          berkualifikasi ke luar public, ia akan patah.
--   get_linked_bnf_status  daily_report_items, bnf_reports, is_bnf_authorized()
--                          -> semuanya public. auth.uid() sudah ber-skema.
--   get_table_columns      information_schema.columns -- SUDAH ber-skema, dan
--                          acuan ber-skema bekerja tanpa perlu skema itu ada
--                          di search_path.
--   get_user_role_code     user_roles, roles -> public. auth.uid() ber-skema.
--   handle_new_user        ⭐ public.companies / public.branches /
--                          public.departments / public.profiles -- KEEMPATNYA
--                          SUDAH BER-SKEMA. NEW adalah record trigger, bukan
--                          acuan skema. >> 'public, auth' TIDAK DIPERLUKAN;
--                          syarat bersyarat di rencana tidak terpicu.
--   is_admin_or_above      user_roles, roles -> public.
--   is_bnf_authorized      bnf_* , user_roles, roles, is_super_admin(),
--                          get_user_company_id() -> semuanya public. (TD-231)
--   is_super_admin         user_roles, roles -> public.
--
-- ⚠️ BATAS YANG DISENGAJA: nilainya 'public' SAJA, bukan 'public, pg_temp'.
--    Kalau `pg_temp` tidak disebut, PostgreSQL tetap mencarinya LEBIH DULU
--    untuk nama RELASI -- jadi secara teori pemanggil yang bisa membuat tabel
--    temporer masih bisa membayangi `user_roles`. Itu tidak terjangkau lewat
--    PostgREST (ia tidak mengizinkan DDL), dan 66 fungsi lain memakai bentuk
--    yang sama. Keseragaman di sini berharga: `config_bentuk` ikut jadi sidik
--    jari `env-drift-check`, jadi bentuk yang berbeda akan tampil sebagai
--    drift selamanya. Menyapu ke 'public, pg_temp' = keputusan terpisah untuk
--    SELURUH 74, bukan untuk delapan ini sendirian.
--
-- ⛔ YANG BERKAS INI TIDAK LAKUKAN: ia TIDAK menyentuh hak akses. ENAM dari
--    delapan fungsi ini ber-`proacl NULL` = ** PUBLIC EXECUTE ** hari ini, dan
--    itu tetap begitu sesudah berkas ini. Lihat catatan H4.
--
-- Terkait: TD-281 · TD-231 (bagian search_path-nya tertutup di sini, bagian
--          company_id singular TIDAK) · doc 12 butir 31.
-- =============================================================================

BEGIN;

-- Potret SEBELUM. Dipakai V-POST untuk membandingkan terhadap keadaan nyata,
-- bukan terhadap angka yang diketik ulang.
CREATE TEMP TABLE zzz_h3_sebelum ON COMMIT DROP AS
SELECT p.oid,
       p.proname,
       md5(p.prosrc)                                   AS md5_badan,
       COALESCE(p.proacl::text, '(NULL)')              AS acl,
       COALESCE(array_to_string(p.proconfig, ','), '') AS config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('exec_sql','get_linked_bnf_status','get_table_columns',
                     'get_user_role_code','handle_new_user','is_admin_or_above',
                     'is_bnf_authorized','is_super_admin');

-- -----------------------------------------------------------------------------
-- V-PRA-1 -- delapan nama, tepat satu tanda tangan masing-masing.
-- Kalau sebuah nama punya overload, `ALTER FUNCTION` per-oid tetap benar, tapi
-- daftar rencana ini dibuat untuk delapan FUNGSI, bukan delapan NAMA -- dan
-- perbedaan itu persis yang membuat 17 Sep melahirkan fungsi kembar (gotcha #37).
-- -----------------------------------------------------------------------------
DO $pra1$
DECLARE v_baris int; v_nama int;
BEGIN
  SELECT count(*), count(DISTINCT proname) INTO v_baris, v_nama FROM zzz_h3_sebelum;
  IF v_nama <> 8 THEN
    RAISE EXCEPTION 'V-PRA-1 GAGAL: ketemu % nama, harus 8. Daftar rencana tidak menggambarkan DB ini.', v_nama;
  END IF;
  IF v_baris <> 8 THEN
    RAISE EXCEPTION 'V-PRA-1 GAGAL: % tanda tangan untuk 8 nama -- ada overload. Berhenti dan putuskan per-oid.', v_baris;
  END IF;
  RAISE NOTICE 'V-PRA-1 LOLOS: 8 nama, 8 tanda tangan.';
END
$pra1$;

-- -----------------------------------------------------------------------------
-- V-PRA-2 -- badannya harus PERSIS yang sudah dibaca dan disisir.
-- Angka-angka ini DIUKUR dari production 28 Sep 2026 (dan dikonfirmasi identik
-- di staging), bukan dihitung dari teks repo. Kalau sebuah badan bergerak sejak
-- itu, sisiran acuan tak-berkualifikasi di kepala berkas ini tidak lagi berlaku
-- untuknya -- dan mengunci search_path tanpa sisiran adalah tebakan.
-- -----------------------------------------------------------------------------
DO $pra2$
DECLARE r record; v_beda int := 0;
BEGIN
  FOR r IN
    SELECT s.proname, s.md5_badan, h.md5_harap
      FROM zzz_h3_sebelum s
      JOIN (VALUES
        ('exec_sql',              'c58f3acc54e4a44f8e8c1ac29e283c60'),
        ('get_linked_bnf_status', 'f55bff2e6c3238f08f855560f4608458'),
        ('get_table_columns',     '13acef68d392d5ed1a42bc716180794b'),
        ('get_user_role_code',    '9db97e9cf18e18998e42a0561034e496'),
        ('handle_new_user',       'beecbea81d839e47b5002547e38d19d4'),
        ('is_admin_or_above',     '068a9eb5b9670fc465b7cc5de2ffb1a2'),
        ('is_bnf_authorized',     '4ab2ddd8a431cf36f7de24ec09d5af15'),
        ('is_super_admin',        '5756a71c6828ce690a7574475a8934ac')
      ) AS h(proname, md5_harap) ON h.proname = s.proname
  LOOP
    IF r.md5_badan <> r.md5_harap THEN
      RAISE WARNING 'V-PRA-2: % badan % (diharap %)', r.proname, r.md5_badan, r.md5_harap;
      v_beda := v_beda + 1;
    END IF;
  END LOOP;
  IF v_beda > 0 THEN
    RAISE EXCEPTION 'V-PRA-2 GAGAL: % badan berbeda dari yang dibaca & disisir 28 Sep. Baca ulang badannya, sisir acuan tak berkualifikasinya, baru jalankan.', v_beda;
  END IF;
  RAISE NOTICE 'V-PRA-2 LOLOS: kedelapan badan persis yang sudah disisir.';
END
$pra2$;

-- -----------------------------------------------------------------------------
-- V-PRA-3 -- belum ada yang mengunci search_path (atau sudah, dan ini no-op).
-- -----------------------------------------------------------------------------
DO $pra3$
DECLARE v_sudah int;
BEGIN
  SELECT count(*) INTO v_sudah FROM zzz_h3_sebelum WHERE config LIKE '%search_path=%';
  IF v_sudah = 8 THEN
    RAISE NOTICE 'V-PRA-3: kedelapannya SUDAH terkunci -- berkas ini sudah pernah jalan di sini. Lanjut sebagai no-op.';
  ELSIF v_sudah > 0 THEN
    RAISE NOTICE 'V-PRA-3: % dari 8 sudah terkunci -- sisanya dikunci sekarang.', v_sudah;
  ELSE
    RAISE NOTICE 'V-PRA-3 LOLOS: nol yang terkunci, kedelapannya dikunci sekarang.';
  END IF;
END
$pra3$;

-- -----------------------------------------------------------------------------
-- Pengunciannya. Tanda tangan diambil dari `oid::regprocedure`, TIDAK PERNAH
-- diketik ulang -- mengetik ulang tanda tangan adalah cara paling mudah
-- mengenai fungsi yang salah, atau melahirkan yang baru.
-- -----------------------------------------------------------------------------
DO $alter$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid, proname FROM zzz_h3_sebelum ORDER BY proname LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO %L',
                   r.oid::regprocedure, 'public');
    RAISE NOTICE '  terkunci: %', r.oid::regprocedure;
  END LOOP;
END
$alter$;

-- -----------------------------------------------------------------------------
-- V-POST -- tiga asersi, dan yang pertama yang paling berarti.
-- -----------------------------------------------------------------------------
DO $post$
DECLARE r record; v_badan int := 0; v_acl int := 0; v_config int := 0;
BEGIN
  FOR r IN
    SELECT s.proname,
           s.md5_badan                                   AS md5_lama,
           md5(p.prosrc)                                 AS md5_baru,
           s.acl                                         AS acl_lama,
           COALESCE(p.proacl::text, '(NULL)')            AS acl_baru,
           COALESCE(array_to_string(p.proconfig, ','), '') AS config_baru
      FROM zzz_h3_sebelum s JOIN pg_proc p ON p.oid = s.oid
  LOOP
    -- (1) BADAN TIDAK BOLEH BERGERAK. Inilah isi janji berkas ini.
    IF r.md5_baru <> r.md5_lama THEN
      RAISE WARNING 'V-POST: % BADAN BERUBAH % -> %', r.proname, r.md5_lama, r.md5_baru;
      v_badan := v_badan + 1;
    END IF;
    -- (2) HAK tidak boleh ikut bergeser -- ALTER ... SET memang tidak
    --     menyentuhnya, dan asersi ini yang membuktikan bahwa memang begitu.
    IF r.acl_baru <> r.acl_lama THEN
      RAISE WARNING 'V-POST: % ACL BERGESER [%] -> [%]', r.proname, r.acl_lama, r.acl_baru;
      v_acl := v_acl + 1;
    END IF;
    -- (3) dan yang memang harus berubah, berubah.
    IF r.config_baru NOT LIKE '%search_path=public%' THEN
      RAISE WARNING 'V-POST: % proconfig tidak memuat search_path=public (isi: %)', r.proname, r.config_baru;
      v_config := v_config + 1;
    END IF;
  END LOOP;

  IF v_badan > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: % badan berubah. ALTER ... SET seharusnya TIDAK menyentuh prosrc -- ada hal lain yang terjadi.', v_badan;
  END IF;
  IF v_acl > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: % ACL bergeser.', v_acl;
  END IF;
  IF v_config > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: % fungsi tidak terkunci.', v_config;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: 8/8 terkunci, md5(prosrc) IDENTIK 8/8, ACL tidak bergeser.';
  RAISE NOTICE '⚠️ Hak akses TIDAK disentuh: enam dari delapan masih PUBLIC EXECUTE (H4).';
END
$post$;

COMMIT;

-- =============================================================================
-- ROLLBACK (per fungsi, tanda tangan persis):
--   ALTER FUNCTION public.exec_sql(text)                        RESET search_path;
--   ALTER FUNCTION public.get_linked_bnf_status(uuid)           RESET search_path;
--   ALTER FUNCTION public.get_table_columns(text)               RESET search_path;
--   ALTER FUNCTION public.get_user_role_code()                  RESET search_path;
--   ALTER FUNCTION public.handle_new_user()                     RESET search_path;
--   ALTER FUNCTION public.is_admin_or_above()                   RESET search_path;
--   ALTER FUNCTION public.is_bnf_authorized()                   RESET search_path;
--   ALTER FUNCTION public.is_super_admin()                      RESET search_path;
--   Nol badan tersentuh, jadi rollback-nya pun nol badan tersentuh.
-- =============================================================================
