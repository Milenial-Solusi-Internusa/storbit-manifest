-- =============================================================================
-- 20260929000001_td281_h2_default_privileges.sql
--
-- TD-281 H2 -- tabel BARU di schema `public` berhenti lahir dengan empat hak
-- berbahaya untuk `anon` dan `authenticated`.
--
-- Status: BELUM DIJALANKAN di mana pun (ditulis 28 Sep 2026).
--         ⚠️ ARAH TERBALIK: targetnya PRODUCTION; staging dijalankan lebih
--         dulu sebagai UJI, bukan karena staging yang bermasalah.
--
-- -- APA YANG SALAH HARI INI ---------------------------------------------------
-- Diukur di production DAN staging 28 Sep 2026 (keduanya sama):
--
--   public | tabel | postgres | postgres=arwdDxtm , anon=Dxtm ,
--                               authenticated=Dxtm , service_role=Dxtm
--
-- `Dxtm` = TRUNCATE + REFERENCES + TRIGGER + MAINTAIN. Jadi setiap tabel baru
-- di `public` yang dibuat oleh `postgres` LAHIR memberikan keempatnya kepada
-- `anon` -- peran untuk permintaan TANPA LOGIN.
--
-- ⛔ `TRUNCATE` TIDAK TUNDUK PADA RLS. Policy seketat apa pun tidak
--    menghalanginya; yang menahannya hanya hak tabel ini.
--
-- ⭐ Ini bukan dugaan. Buktinya ada sebagai tabel hidup di production:
--      customers_backup_20260614 | anon=Dxtm , authenticated=Dxtm
--    Tabel itu lahir tanpa GRANT eksplisit, dan inilah yang ia bawa.
--    Bandingkan `goods_receipts` (lahir dari 20260914000002, yang mencabut
--    keempatnya DENGAN TANGAN): anon=Dxtm tersisa, authenticated=arm.
--    >> Pencabutan manual itulah yang berkas ini bakukan supaya tidak perlu
--       diulang -- dan tidak perlu diingat -- di setiap tabel berikutnya.
--
-- -- YANG BERKAS INI TIDAK LAKUKAN, DAN ITU PENTING ---------------------------
-- ⛔ `ALTER DEFAULT PRIVILEGES` TIDAK RETROAKTIF. Sesudah ini, 139+ tabel yang
--    SUDAH ADA tetap memberi TRUNCATE kepada `authenticated` (TD-230) dan
--    kepada `anon` di 111 tabel. ** Jangan baca "default privileges sudah
--    dibereskan" sebagai "TRUNCATE ditutup". ** Itu TD-281 H5, pekerjaan lain.
--    Justru sifat tidak-retroaktif inilah yang membuat berkas ini nol risiko
--    terhadap data dan aplikasi yang hidup sekarang.
--
-- -- TIGA KEPUTUSAN YANG HARUS TERBACA ----------------------------------------
-- (1) ** Yang dicabut HANYA empat, dan sesudahnya tabel baru lahir dengan NOL
--     hak untuk anon/authenticated. ** Tidak ada SELECT/INSERT/UPDATE/DELETE
--     yang "dipertahankan", karena default-nya memang tidak pernah memberikan
--     itu. Konsekuensinya: aturan repo "GRANT eksplisit setelah CREATE"
--     (CLAUDE.md) TIDAK berubah beratnya -- ia sudah wajib hari ini, dan
--     berkas ini tidak menambah satu pun kewajiban baru.
--
-- (2) ** service_role SENGAJA TIDAK DICABUT. ** Ia sudah mem-bypass RLS dan
--     memegang DML penuh di setiap tabel; siapa pun yang memegang kuncinya
--     bisa `DELETE FROM ... ` tanpa WHERE, jadi TRUNCATE bukan kelas kemampuan
--     baru baginya. Kuncinya juga tidak pernah dikirim ke browser, berbeda
--     dari anon key yang memang publik by design.
--     ⚠️ Yang tetap harus disebut: TRUNCATE MELEWATI trigger ON DELETE, jadi
--        penghancuran lewatnya lebih senyap daripada lewat DELETE. Bedanya
--        nyata walau kecil. Ini keputusan sadar (Den, 28 Sep), bukan kelalaian,
--        dan reversibel: satu baris. V-POST mengasersi ia MASIH `Dxtm` supaya
--        pergeseran diam-diam kelak ketahuan dari uji, bukan dari kebetulan.
--
-- (3) ** Entri milik `supabase_admin` TIDAK DISENTUH (keputusan Den). **
--     ⚠️⚠️ Dan ukurannya harus tertulis, bukan disebut "sisa risiko" begitu
--     saja: `public | tabel | supabase_admin` memberi **arwdDxtm PENUH**
--     kepada anon DAN authenticated -- jauh lebih longgar daripada entri
--     `postgres` yang berkas ini tambal. Setiap tabel `public` yang lahir
--     lewat jalur `supabase_admin` akan terbuka SEPENUHNYA untuk anon.
--     Yang menahannya hari ini: migrasi kita berjalan sebagai `postgres`,
--     bukan `supabase_admin`. Itu keadaan, bukan jaminan.
--     Entri itu milik platform Supabase; mengubahnya = keputusan terpisah.
--
-- Terkait: TD-281 (temuan a & b) · TD-230 · TD-112 · doc 12 butir 30.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- V-PRA -- bentuknya harus seperti yang diukur, DAN berkas ini harus aman
--          dijalankan dua kali.
-- -----------------------------------------------------------------------------
DO $pra$
DECLARE
  v_ada_empat  int;
  v_ada_dml    int;
  v_service    int;
BEGIN
  SELECT
    count(*) FILTER (WHERE a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
                       AND pg_get_userbyid(a.grantee) IN ('anon','authenticated')),
    count(*) FILTER (WHERE a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
                       AND pg_get_userbyid(a.grantee) IN ('anon','authenticated')),
    count(*) FILTER (WHERE pg_get_userbyid(a.grantee) = 'service_role')
    INTO v_ada_empat, v_ada_dml, v_service
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE n.nspname = 'public'
     AND d.defaclobjtype = 'r'
     AND pg_get_userbyid(d.defaclrole) = 'postgres'
     AND a.grantee <> 0;

  -- Kalau anon/authenticated ternyata punya DML di default, bentuknya BUKAN
  -- yang diukur 28 Sep -- berarti ada yang berubah sejak itu, dan mencabut
  -- empat hak saja akan menyisakan lubang yang jauh lebih besar tanpa ada
  -- yang menyadarinya. Berhenti, jangan tebak.
  IF v_ada_dml > 0 THEN
    RAISE EXCEPTION 'V-PRA GAGAL: default privileges public/r/postgres memberi % hak DML ke anon/authenticated. Bentuknya sudah BERUBAH sejak pengukuran 28 Sep -- ukur ulang sebelum melanjutkan.', v_ada_dml;
  END IF;

  IF v_ada_empat = 0 THEN
    RAISE NOTICE 'V-PRA: keempat hak sudah TIDAK ada -- berkas ini sudah pernah jalan di sini. Lanjut sebagai no-op.';
  ELSE
    RAISE NOTICE 'V-PRA LOLOS: % hak berbahaya terdaftar untuk anon/authenticated, siap dicabut.', v_ada_empat;
  END IF;
  RAISE NOTICE 'V-PRA: service_role memegang % hak di default ini (sengaja TIDAK disentuh).', v_service;
END
$pra$;

-- -----------------------------------------------------------------------------
-- Pencabutan. `FOR ROLE postgres` ditulis EKSPLISIT, bukan mengandalkan peran
-- yang kebetulan menjalankan berkas ini -- kalau kelak dijalankan oleh peran
-- lain, tanpa klausa ini ia akan membuat entri BARU dan membiarkan entri
-- `postgres` apa adanya, yaitu gagal sambil melaporkan sukses.
-- -----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- V-POST-1 -- keadaan entri default-nya sendiri.
-- -----------------------------------------------------------------------------
DO $post1$
DECLARE v_anon int; v_auth int; v_service text; v_owner text;
BEGIN
  SELECT
    count(*) FILTER (WHERE pg_get_userbyid(a.grantee) = 'anon'),
    count(*) FILTER (WHERE pg_get_userbyid(a.grantee) = 'authenticated'),
    string_agg(DISTINCT a.privilege_type, ',') FILTER (WHERE pg_get_userbyid(a.grantee) = 'service_role'),
    string_agg(DISTINCT a.privilege_type, ',') FILTER (WHERE pg_get_userbyid(a.grantee) = 'postgres')
    INTO v_anon, v_auth, v_service, v_owner
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE n.nspname = 'public'
     AND d.defaclobjtype = 'r'
     AND pg_get_userbyid(d.defaclrole) = 'postgres'
     AND a.grantee <> 0;

  IF v_anon > 0 OR v_auth > 0 THEN
    RAISE EXCEPTION 'V-POST-1 GAGAL: masih tersisa hak default (anon=%, authenticated=%).', v_anon, v_auth;
  END IF;
  IF v_service IS NULL THEN
    RAISE EXCEPTION 'V-POST-1 GAGAL: service_role kehilangan hak default -- ia SENGAJA dipertahankan, lihat keputusan (2).';
  END IF;
  RAISE NOTICE 'V-POST-1 LOLOS: anon 0, authenticated 0, service_role [%], pemilik [%].', v_service, v_owner;
END
$post1$;

-- -----------------------------------------------------------------------------
-- V-POST-2 -- PROBE: bikin tabel sungguhan, baca hak yang ia BAWA, lalu buang.
--
-- ⭐ Inilah gerbang yang sebenarnya. V-POST-1 hanya membuktikan "perintahnya
--    jalan"; probe ini membuktikan ** tabel berikutnya benar-benar lahir
--    sempit **. Menalar dari isi pg_default_acl bukan hal yang sama dengan
--    melihat hasilnya -- dan seluruh kelas cacat hari ini (42702, sidik jari
--    yang dikarang, asersi yang lolos karena prasyaratnya kosong) lahir dari
--    menalar di tempat yang seharusnya menjalankan.
-- -----------------------------------------------------------------------------
CREATE TABLE public.zzz_probe_h2_20260929 (id int);

DO $post2$
DECLARE v_anon int; v_auth int; v_service int;
BEGIN
  SELECT
    count(*) FILTER (WHERE pg_get_userbyid(a.grantee) = 'anon'),
    count(*) FILTER (WHERE pg_get_userbyid(a.grantee) = 'authenticated'),
    count(*) FILTER (WHERE pg_get_userbyid(a.grantee) = 'service_role')
    INTO v_anon, v_auth, v_service
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE n.nspname = 'public' AND c.relname = 'zzz_probe_h2_20260929'
     AND a.grantee <> 0;

  IF v_anon > 0 OR v_auth > 0 THEN
    RAISE EXCEPTION 'V-POST-2 GAGAL: tabel BARU masih lahir ber-hak (anon=%, authenticated=%). Default privileges tidak menutup jalur yang dipakai CREATE TABLE di sini -- periksa apakah ada entri pg_default_acl milik peran LAIN.', v_anon, v_auth;
  END IF;
  IF v_service = 0 THEN
    RAISE EXCEPTION 'V-POST-2 GAGAL: tabel baru lahir TANPA hak service_role -- itu di luar yang diputuskan, jangan lanjut.';
  END IF;
  RAISE NOTICE 'V-POST-2 LOLOS: tabel baru lahir dengan NOL hak anon/authenticated, service_role % hak.', v_service;
END
$post2$;

DROP TABLE public.zzz_probe_h2_20260929;

-- Sabuk pengaman: probe TIDAK BOLEH tertinggal, apa pun yang terjadi di atas.
DO $bersih$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname='public' AND c.relname='zzz_probe_h2_20260929') THEN
    RAISE EXCEPTION 'GAGAL: tabel probe masih ada. Jangan COMMIT.';
  END IF;
  RAISE NOTICE 'Probe bersih -- nol objek tertinggal.';
  RAISE NOTICE 'TD-281 H2 SELESAI. ⚠️ 139+ tabel LAMA tidak tersentuh (TD-230 / H5).';
END
$bersih$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated;
--   ⚠️ Memulihkannya berarti mengembalikan TRUNCATE untuk peran TANPA LOGIN
--      pada setiap tabel yang lahir sesudahnya. Ini rollback untuk KERUSAKAN,
--      bukan untuk ketidaksukaan.
-- =============================================================================
