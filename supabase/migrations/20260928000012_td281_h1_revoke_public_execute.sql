-- =============================================================================
-- 20260928000012_td281_h1_revoke_public_execute.sql
--
-- TD-281 H1 LAPIS 1 -- menutup enam fungsi SECURITY DEFINER yang hari ini bisa
-- dipanggil SIAPA PUN DI INTERNET.
--
-- Status: BELUM DIJALANKAN di mana pun (ditulis 28 Sep 2026).
--
-- !!  ARAH TERBALIK DARI KEBIASAAN  !!
--     Paparannya ADA DI PRODUCTION, jadi urutannya: uji di staging -> jalankan
--     di PRODUCTION -> samakan staging. Staging di sini berperan sebagai TEMPAT
--     UJI, bukan sebagai gerbang rilis. Lihat doc 12 butir TD-281 H1.
--
-- -- KENAPA INI MENDESAK -------------------------------------------------------
-- Keenam fungsi di bawah `SECURITY DEFINER` dan ter-EXECUTE oleh PUBLIC (untuk
-- sebagian, lewat `proacl NULL` yang artinya PUBLIC EXECUTE -- gotcha #40).
-- PUBLIC mencakup `anon`, dan ** kunci anon memang publik: ia ikut ter-bundle ke
-- browser **. Jadi "bisa dipanggil anon" berarti "bisa dipanggil siapa pun di
-- internet" lewat POST /rest/v1/rpc/<nama>. Karena SECURITY DEFINER berjalan
-- sebagai pemiliknya, ** RLS tidak melindungi apa pun di dalamnya **.
--
-- Yang paling mudah dieksploitasi BUKAN yang paling menakutkan namanya:
--   increment_document_sequence  seluruh parameternya bisa ditebak (UUID entitas
--                                ada di CLAUDE.md DAN di bundle FE) -> penomoran
--                                dokumen bisa dibakar tanpa batas, dan itu
--                                PERMANEN (preseden: nomor invoice 0012 & 0013
--                                terpakai permanen, PROGRESS 2026-09-07).
--   notify_sp_milestone          net.http_post memakai vault secret, isi pesan
--                                dari penyerang -> notifikasi palsu ke staf.
--   check_similar_accounts       mengembalikan NAMA CUSTOMER yang mirip; p_company_id
--                                publik -> daftar akun bisa dipanen.
--   complete_picking             UPDATE picking_lists + sp_recompute_status.
--   attach_price_contract_info   UPDATE product_price_history.
--   is_admin_tier_role           baca-saja; bocorkan apakah sebuah role id admin.
--
-- -- APA YANG BERKAS INI LAKUKAN, DAN APA YANG TIDAK ---------------------------
-- HANYA ACL. ** NOL sentuhan badan fungsi. ** md5(prosrc) sebelum dan sesudah
-- dibandingkan di V-POST-1; kalau ada satu byte badan yang bergerak, migrasi ini
-- membatalkan dirinya sendiri. Guard peran DI DALAM badan adalah H1 LAPIS 2,
-- berkas terpisah, dan menunggu pengukuran audit_logs 60 hari (keputusan Den).
--
-- -- DUA KOREKSI ATAS RENCANA YANG SUDAH DISETUJUI ----------------------------
-- Rencana awal berbunyi: "notify_sp_milestone dan is_admin_tier_role nol
-- pemanggil FE -> REVOKE tanpa GRANT". Itu SALAH untuk yang kedua.
--
-- (1) ** is_admin_tier_role DIPAKAI DI DALAM DUA RLS POLICY ** --
--     user_roles_insert dan user_roles_update, keduanya TO authenticated.
--     Ekspresi policy dievaluasi SEBAGAI PEMANGGIL, dan hak EXECUTE fungsi IKUT
--     DIPERIKSA di sana. Mencabut dari PUBLIC tanpa memberi ke authenticated
--     akan membuat admin GAGAL menetapkan role -- dan kedua policy itu justru
--     yang menutup privilege escalation TD-170. Jadi ia TETAP di-GRANT.
--     >> Pelajaran: "nol pemanggil FE" BUKAN "nol pemanggil". Sebuah fungsi bisa
--        terjangkau lewat RLS policy tanpa satu baris frontend pun menyebutnya.
--
-- (2) Survei pemanggil dari repo TIDAK LENGKAP: parser hanya membaca 83 dari 106
--     `CREATE FUNCTION` di schema_snapshot.sql, dan snapshot itu sendiri
--     tertanggal 18 Sep. Karena itu kesimpulan "nol pemanggil INVOKER" TIDAK
--     dipakai sebagai asumsi -- ia dijadikan GERBANG yang diperiksa LIVE di
--     V-PRA-2 dan V-PRA-3 di bawah. Kalau ternyata ada, migrasi ini BERHENTI.
--
-- -- YANG SUDAH DIUKUR DAN MENJADI DASAR MATRIKS DI BAWAH ---------------------
--   pemanggil FE (grep src/): increment_document_sequence 8 berkas ·
--     check_similar_accounts 3 · complete_picking 2 · attach_price_contract_info 1 ·
--     notify_sp_milestone 0 · is_admin_tier_role 0
--   pemanggil Edge Function: NOL untuk keenamnya (EF hanya memanggil
--     is_super_admin dan exec_sql) -> service_role TIDAK diberi GRANT di sini.
--     ** Konsekuensi yang diterima: kalau kelak ada otomasi yang memanggil
--     keenam RPC ini dengan service key, ia akan ditolak. **
--   scripts/seed/uat/01b-helper.sql memanggil complete_picking, tapi seed
--     berjalan sebagai `postgres` (pemilik) -> tidak terdampak.
--
-- -- ROLLBACK ------------------------------------------------------------------
-- Ada di ekor berkas. Skrip runner MENYIMPAN proacl sebelum perubahan ke berkas
-- lebih dulu; pulihkan dari berkas itu, bukan dari ingatan.
-- =============================================================================

BEGIN;

-- Rekam keadaan SEBELUM. Dipakai V-POST-1 untuk membuktikan badan tidak
-- bergerak, dan dicetak sebagai jejak rollback.
CREATE TEMP TABLE td281_h1_sebelum ON COMMIT DROP AS
SELECT p.oid,
       p.proname::text                                   AS nama,
       p.oid::regprocedure::text                         AS tanda_tangan,
       md5(p.prosrc)                                     AS md5_badan,
       COALESCE(array_to_string(p.proacl::text[], ','), '(NULL = PUBLIC EXECUTE)') AS acl_sebelum
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('increment_document_sequence','check_similar_accounts',
                     'complete_picking','attach_price_contract_info',
                     'is_admin_tier_role','notify_sp_milestone');

DO $h1$
DECLARE
  r        record;
  v_sig    text;
  v_n      int;
  v_nama   text[] := ARRAY['increment_document_sequence','check_similar_accounts',
                           'complete_picking','attach_price_contract_info',
                           'is_admin_tier_role','notify_sp_milestone'];
  v_pola   text;
BEGIN
  -- Pola "nama diikuti kurung buka", dipakai tiga gerbang di bawah.
  v_pola := '(^|[^a-zA-Z0-9_])(' || array_to_string(v_nama, '|') || ')[[:space:]]*\(';

  -- ---- V-PRA-1: tepat SATU tanda tangan per nama ---------------------------
  -- Overload berarti REVOKE bisa mengenai tanda tangan yang salah dan
  -- meninggalkan yang berbahaya tetap terbuka -- gagal yang tampak berhasil.
  FOR r IN SELECT unnest(v_nama) AS nama LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nama;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'V-PRA-1 GAGAL: % ditemukan % kali di public (harus tepat 1).', r.nama, v_n;
    END IF;
  END LOOP;
  RAISE NOTICE 'V-PRA-1 LOLOS: keenam nama punya tepat satu tanda tangan.';

  -- ---- V-PRA-2: nol pemanggil SECURITY INVOKER -----------------------------
  -- Fungsi INVOKER menjalankan pemeriksaan hak SEBAGAI PEMANGGIL, jadi kalau ada
  -- yang memanggil keenam fungsi ini, pencabutan akan mematahkannya untuk
  -- authenticated. Fungsi DEFINER aman: ia berjalan sebagai pemiliknya.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND NOT p.prosecdef
     AND p.proname <> ALL (v_nama)
     AND p.prosrc ~ v_pola;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'V-PRA-2 GAGAL: % fungsi SECURITY INVOKER memanggil salah satu dari keenam fungsi. Pencabutan akan mematahkannya -- BERHENTI dan lapor.', v_n;
  END IF;
  RAISE NOTICE 'V-PRA-2 LOLOS: nol pemanggil SECURITY INVOKER.';

  -- ---- V-PRA-3: pemakaian di RLS policy hanya yang sudah diketahui ---------
  -- Ekspresi policy dievaluasi sebagai pemanggil -> hak EXECUTE ikut diperiksa.
  -- Yang DIKETAHUI: user_roles_insert + user_roles_update memakai
  -- is_admin_tier_role. Kalau ada yang lain, matriks GRANT di bawah kurang.
  SELECT count(*) INTO v_n
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~ v_pola
     AND policyname NOT IN ('user_roles_insert', 'user_roles_update');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'V-PRA-3 GAGAL: % policy DI LUAR user_roles_insert/update memakai salah satu dari keenam fungsi. Matriks GRANT kurang -- BERHENTI dan lapor.', v_n;
  END IF;
  RAISE NOTICE 'V-PRA-3 LOLOS: pemakaian di policy hanya yang sudah diketahui.';

  -- ---- PERUBAHAN ACL -------------------------------------------------------
  -- Tanda tangan diambil dari katalog lewat oid::regprocedure, BUKAN diketik
  -- ulang. Enam tanda tangan panjang yang disalin tangan adalah enam peluang
  -- salah ketik, dan salah ketik di sini berarti REVOKE yang tidak mengenai apa
  -- pun -- kelas TD-282.
  FOR r IN
    SELECT * FROM (VALUES
      ('increment_document_sequence', true,  '8 pemanggil FE'),
      ('check_similar_accounts',      true,  '3 pemanggil FE'),
      ('complete_picking',            true,  '2 pemanggil FE'),
      ('attach_price_contract_info',  true,  '1 pemanggil FE'),
      ('is_admin_tier_role',          true,  'KOREKSI: dipakai 2 RLS policy TO authenticated'),
      ('notify_sp_milestone',         false, 'nol FE, nol policy, pemanggil DEFINER -> nol GRANT')
    ) AS t(nama, beri_authenticated, alasan)
  LOOP
    SELECT p.oid::regprocedure::text INTO v_sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nama;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   v_sig);
    IF r.beri_authenticated THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    END IF;
    RAISE NOTICE 'ACL diubah: % -- % (%)', r.nama,
      CASE WHEN r.beri_authenticated THEN 'PUBLIC+anon dicabut, authenticated diberi'
           ELSE 'PUBLIC+anon dicabut, NOL grant' END, r.alasan;
  END LOOP;
END
$h1$;

-- -- V-POST --------------------------------------------------------------------
DO $v$
DECLARE
  r       record;
  v_gagal int := 0;
  v_pub   int;
  v_anon  int;
  v_auth  int;
  v_md5   text;
BEGIN
  FOR r IN SELECT * FROM td281_h1_sebelum ORDER BY nama LOOP

    -- V-POST-1: badan TIDAK bergerak. Berkas ini hanya menyentuh ACL; kalau md5
    -- berubah, ada CREATE OR REPLACE yang tidak seharusnya ada di sini.
    SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p WHERE p.oid = r.oid;
    IF v_md5 IS DISTINCT FROM r.md5_badan THEN
      RAISE WARNING 'V-POST-1 GAGAL: badan % berubah (% -> %). Berkas ini TIDAK boleh menyentuh badan.',
        r.nama, r.md5_badan, v_md5;
      v_gagal := v_gagal + 1;
    END IF;

    -- V-POST-2: nol PUBLIC, nol anon. grantee = 0 adalah PUBLIC; memeriksanya
    -- lewat aclexplode, BUKAN lewat LIKE '%=X/%' -- pola itu juga kena
    -- postgres=X/postgres sehingga SELALU true (gotcha #40).
    SELECT count(*) FILTER (WHERE a.grantee = 0),
           count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'anon'),
           count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'authenticated')
      INTO v_pub, v_anon, v_auth
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = r.oid AND a.privilege_type = 'EXECUTE';

    IF v_pub > 0 OR v_anon > 0 THEN
      RAISE WARNING 'V-POST-2 GAGAL: % masih ter-EXECUTE PUBLIC=% anon=%.', r.nama, v_pub, v_anon;
      v_gagal := v_gagal + 1;
    END IF;

    -- V-POST-3: authenticated ADA untuk lima, TIDAK ADA untuk notify.
    IF r.nama = 'notify_sp_milestone' THEN
      IF v_auth > 0 THEN
        RAISE WARNING 'V-POST-3 GAGAL: notify_sp_milestone seharusnya NOL grant, tapi authenticated ada.';
        v_gagal := v_gagal + 1;
      END IF;
    ELSE
      IF v_auth = 0 THEN
        RAISE WARNING 'V-POST-3 GAGAL: % kehilangan EXECUTE untuk authenticated -- aplikasi akan patah.', r.nama;
        v_gagal := v_gagal + 1;
      END IF;
    END IF;

    RAISE NOTICE 'ACL % : SEBELUM [%] -> SESUDAH [%]', r.nama, r.acl_sebelum,
      (SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(NULL)') FROM pg_proc p WHERE p.oid = r.oid);
  END LOOP;

  -- WARNING dulu, EXCEPTION sekali di akhir: berhenti di kegagalan PERTAMA
  -- menyembunyikan seberapa banyak yang salah.
  IF v_gagal > 0 THEN
    RAISE EXCEPTION 'TD-281 H1: % pemeriksaan GAGAL. Transaksi dibatalkan, nol perubahan.', v_gagal;
  END IF;
  RAISE NOTICE 'TD-281 H1 LOLOS: enam fungsi tertutup dari PUBLIC dan anon, badan nol perubahan.';
END
$v$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Pulihkan dari berkas `acl-sebelum.txt` yang DISIMPAN RUNNER sebelum migrasi
-- ini jalan -- bukan dari ingatan, dan bukan dari asumsi "dulu pasti NULL".
--
-- Kalau sebelumnya proacl NULL (PUBLIC EXECUTE implisit), bentuk pemulihannya:
--   GRANT EXECUTE ON FUNCTION public.increment_document_sequence(uuid, text, text, integer, integer, integer) TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.check_similar_accounts(text, uuid)                                       TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.complete_picking(uuid)                                                   TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.attach_price_contract_info(uuid, text, date, date)                       TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.is_admin_tier_role(uuid)                                                 TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.notify_sp_milestone(uuid, text, text, text)                              TO PUBLIC;
-- lalu cabut grant eksplisit yang ditambahkan berkas ini:
--   REVOKE EXECUTE ON FUNCTION ... FROM authenticated;   (lima fungsi)
--
-- !! Memberi kembali ke PUBLIC berarti MEMBUKA KEMBALI paparannya. Lakukan hanya
--    kalau ada yang benar-benar patah, dan catat apa yang patah -- karena itulah
--    pemanggil yang tidak terdaftar, dan ia temuan tersendiri.
-- =============================================================================
