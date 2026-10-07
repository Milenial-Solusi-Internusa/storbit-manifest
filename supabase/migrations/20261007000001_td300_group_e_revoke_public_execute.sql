-- =============================================================================
-- 20261007000001_td300_group_e_revoke_public_execute.sql
--
-- TD-300 "Group E" -- cabut EXECUTE anon+PUBLIC dari SELURUH fungsi `public`
-- yang hari ini masih terjangkau tanpa login. Kelanjutan langsung TD-281 H1
-- (yang baru menutup 6 fungsi spesifik) dan H4 (3 penerbit invoice) -- fungsi
-- LAIN (terukur 30 Sep 2026: 99 di production, 98 di staging -- 28 trigger,
-- 33 SECURITY DEFINER non-trigger, sisanya SECURITY INVOKER) belum tersentuh
-- SAMA SEKALI oleh pekerjaan manapun sejauh ini.
--
-- Companion WAJIB sudah LIVE lebih dulu: `20261002000002_td300_default_privileges_
-- revoke_execute.sql` (ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS
-- FROM PUBLIC) -- itu hanya mengunci fungsi BARU. Berkas INI menutup fungsi LAMA
-- yang lahir SEBELUM companion itu ada.
--
-- Rancangan: `08_TECH_DEBT.md` TD-300 (a)-(f), PLAN disetujui Den 30 Sep 2026.
-- Ditulis 7 Okt 2026, sesudah Den mengonfirmasi lewat Dashboard Supabase:
-- ** NOL Auth Hook custom di KEDUA lingkungan (staging dan production). **
-- Karena itu berkas ini TIDAK memuat pengecualian GRANT ... TO supabase_auth_admin
-- sama sekali. ⛔ Kalau Auth Hook ditambahkan KEMUDIAN HARI, berkas ini WAJIB
-- dibaca ulang dan diberi pengecualian SEBELUM dijalankan lagi di lingkungan
-- mana pun -- ia tidak mendeteksi Auth Hook sendiri (repo tidak punya
-- visibilitas ke Dashboard Supabase).
--
-- -- SENGAJA TIDAK HARDCODE DAFTAR NAMA FUNGSI ---------------------------------
-- Angka 99/98 adalah pengukuran SAAT ITU (30 Sep 2026) -- bisa sudah berubah:
-- AR Tahap 1-3b (berkas 6-44) menambah banyak fungsi baru, dan yang baru itu
-- SUDAH ber-GRANT eksplisit ('authenticated'-only) di berkasnya masing-masing,
-- jadi diharapkan TIDAK ikut ditemukan V-PRA-1 di bawah. Yang ditemukan adalah
-- keadaan SEBENARNYA pada saat migrasi ini dijalankan, bukan daftar yang dibuat
-- sebelumnya -- ini SESUAI rancangan TD-300 sendiri (V-PRA-1), bukan keterbatasan.
--
-- -- STATUS: BELUM DIJALANKAN DI MANA PUN ---------------------------------------
-- Urutan WAJIB: STAGING dulu, lolos SEMUA langkah di "LANGKAH UJI STAGING" di
-- ekor berkas ini (termasuk DUA uji nyata yang tidak bisa digantikan pembacaan
-- kode) -- baru PRODUCTION. TD-300 Group E BUKAN bagian rantai AR Tahap 1-3b
-- atau rilis 14-15 Okt 2026 -- ia pemblokir keamanan TERPISAH dengan keputusan
-- go/no-go SENDIRI (lihat `12_ANTREAN_MIGRASI_PRODUCTION.md` §Naskah Eksekusi
-- Malam Rilis, penutup). JANGAN digabung ke jendela rilis itu.
--
-- -- SIFAT ----------------------------------------------------------------------
-- HANYA hak (GRANT/REVOKE EXECUTE). NOL DDL tabel/fungsi bisnis, NOL badan
-- fungsi disentuh (dibuktikan V-POST lewat md5(prosrc) sebelum/sesudah), NOL
-- baris data bisnis disentuh. DUA tabel BARU lahir, keduanya murni jejak audit
-- migrasi ini sendiri (snapshot "sebelum" + dipakai basis rollback).
--
-- -- KENAPA TIDAK DIGABUNG KE PAKET TD-281/H5 ------------------------------------
-- Cakupannya (puluhan fungsi, badan BELUM dibaca satu-per-satu untuk masing-
-- masing) jauh lebih besar dan lebih berisiko daripada Group A/B H5 yang
-- terbukti aman lewat bukti kode+log 7 hari. Pantas jadi unit kerja sendiri.
--
-- -- STRUKTUR (pola H1 -- GRANT authenticated DULU, baru REVOKE PUBLIC+anon) ---
--   V-PRA-1  temukan SEMUA fungsi public yang EXECUTE-nya masih PUBLIC dan/atau
--            anon HARI INI (proacl IS NULL = default PUBLIC, gotcha #40, ATAU
--            aclexplode menunjukkan grantee=PUBLIC/anon) -> simpan ke tabel
--            snapshot (proname, argtypes via oidvectortypes -- gotcha #44,
--            signature, is_trigger, prosecdef, md5 badan, acl SEBELUM).
--   V-PRA-2  scan pg_policies.qual/with_check untuk SETIAP nama yang ditemukan
--            V-PRA-1 -- kalau ada policy yang BERLAKU untuk anon/public (bukan
--            cuma authenticated) memakai salah satunya, BERHENTI: mencabut EXECUTE
--            anon dari fungsi itu akan mematahkan policy itu untuk pemanggil anon.
--   V-PRA-3  scan fungsi SECURITY INVOKER lain (di luar yang ditemukan V-PRA-1)
--            yang memanggil salah satu nama itu -- pola H1, pengecualian
--            `seed_uat_%` (staging-only, dijalankan sebagai postgres, dicetak
--            namanya, BUKAN disembunyikan).
--   LOOP     per fungsi: GRANT EXECUTE ... TO authenticated, LALU REVOKE EXECUTE
--            ... FROM PUBLIC, REVOKE ... FROM anon (dua REVOKE terpisah --
--            gotcha #45: REVOKE dari anon TIDAK menghapus grant PUBLIC).
--   V-POST   nol EXECUTE anon/PUBLIC tersisa di himpunan yang diproses,
--            authenticated ADA untuk seluruhnya, badan (md5) nol berubah.
-- =============================================================================

BEGIN;

-- ---- 0. Tabel snapshot "SEBELUM" --------------------------------------------
-- Nama di-suffix tanggal supaya staging & production masing-masing punya
-- jejaknya sendiri tanpa tabrakan kalau berkas ini terpaksa dijalankan ulang.
-- Dikunci dari luar (REVOKE ALL) -- ini jejak audit migrasi, bukan data aplikasi.
CREATE TABLE IF NOT EXISTS public.td300_group_e_before_20261007 (
  proname      text    NOT NULL,
  argtypes     text    NOT NULL,   -- oidvectortypes(proargtypes) -- gotcha #44
  signature    text    NOT NULL,   -- oid::regprocedure::text, dipakai GRANT/REVOKE & rollback
  is_trigger   boolean NOT NULL,
  prosecdef    boolean NOT NULL,
  md5_before   text    NOT NULL,
  acl_before   text    NOT NULL,   -- '(NULL = default/PUBLIC EXECUTE)' atau teks proacl apa adanya
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proname, argtypes)
);
REVOKE ALL ON TABLE public.td300_group_e_before_20261007 FROM PUBLIC, anon, authenticated;

DO $td300$
DECLARE
  r         record;
  v_n       int;
  v_daftar  text;
  v_pola    text;
  v_jumlah  int;
  v_trig    int;
  v_definer int;
  v_invoker int;
BEGIN
  -- ---- V-PRA-1: temukan & simpan ---------------------------------------------
  -- aclexplode(COALESCE(proacl, acldefault('f', proowner))) adalah bentuk yang
  -- SAMA dengan V-POST-2 H1 (20260928000012) -- grantee=0 berarti PUBLIC;
  -- COALESCE ke acldefault menangani proacl IS NULL (gotcha #40) dengan cara
  -- yang sama dengan membaca ACL eksplisit, bukan sebagai kasus terpisah.
  INSERT INTO public.td300_group_e_before_20261007
    (proname, argtypes, signature, is_trigger, prosecdef, md5_before, acl_before)
  SELECT p.proname,
         oidvectortypes(p.proargtypes),
         p.oid::regprocedure::text,
         (p.prorettype = 'trigger'::regtype),
         p.prosecdef,
         md5(p.prosrc),
         COALESCE(array_to_string(p.proacl::text[], ','), '(NULL = default/PUBLIC EXECUTE)')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND EXISTS (
           SELECT 1
             FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
            WHERE a.privilege_type = 'EXECUTE'
              AND (a.grantee = 0 OR pg_get_userbyid(a.grantee) = 'anon')
         )
  ON CONFLICT (proname, argtypes) DO NOTHING;

  SELECT count(*), count(*) FILTER (WHERE is_trigger), count(*) FILTER (WHERE prosecdef AND NOT is_trigger),
         count(*) FILTER (WHERE NOT prosecdef AND NOT is_trigger)
    INTO v_jumlah, v_trig, v_definer, v_invoker
    FROM public.td300_group_e_before_20261007;

  RAISE NOTICE 'V-PRA-1: % fungsi ditemukan masih EXECUTE anon/PUBLIC (% trigger, % SECURITY DEFINER non-trigger, % SECURITY INVOKER non-trigger).',
    v_jumlah, v_trig, v_definer, v_invoker;

  IF v_jumlah = 0 THEN
    RAISE EXCEPTION 'V-PRA-1: NOL fungsi ditemukan. Ini TIDAK diharapkan (pengukuran 30 Sep 2026 = 99/98) -- periksa apakah lingkungan ini sudah pernah ditambal, atau apakah query V-PRA-1 salah sasaran, SEBELUM menganggap migrasi ini selesai tanpa kerja.';
  END IF;
  IF v_jumlah > 250 THEN
    RAISE EXCEPTION 'V-PRA-1: % fungsi ditemukan -- jauh di atas perkiraan (99/98 pada 30 Sep 2026). Periksa manual sebelum lanjut; query mungkin menangkap sesuatu yang tidak dimaksud.', v_jumlah;
  END IF;

  -- Pola "nama diikuti kurung buka", dibangun dari SELURUH nama yang ditemukan.
  SELECT '(^|[^a-zA-Z0-9_])(' || string_agg(DISTINCT proname, '|') || ')[[:space:]]*\('
    INTO v_pola
    FROM public.td300_group_e_before_20261007;

  -- ---- V-PRA-2: pemakaian di RLS policy yang berlaku untuk anon/public ------
  -- Policy yang HANYA berlaku `TO authenticated` aman: loop di bawah selalu
  -- memberi authenticated EXECUTE. Yang berbahaya adalah policy yang berlaku
  -- untuk `anon` (eksplisit) atau `public`/kosong (berarti SEMUA role,
  -- termasuk anon) -- mencabut EXECUTE anon dari fungsi yang dipakainya akan
  -- mematahkan policy itu untuk pemanggil anon.
  SELECT count(*), COALESCE(string_agg(DISTINCT policyname || ' on ' || tablename, ', '), '')
    INTO v_n, v_daftar
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) ~ v_pola
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'V-PRA-2 GAGAL: % policy yang berlaku untuk anon/public memakai salah satu fungsi yang akan dicabut dari anon (%). Periksa manual -- fungsi itu perlu dikecualikan dari REVOKE anon, atau policy-nya perlu ditinjau ulang. BERHENTI, nol perubahan.', v_n, v_daftar;
  END IF;
  RAISE NOTICE 'V-PRA-2 LOLOS: nol policy anon/public memakai fungsi yang akan dicabut.';

  -- ---- V-PRA-3: pemanggil SECURITY INVOKER lain, pola H1 ---------------------
  SELECT count(*), COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '')
    INTO v_n, v_daftar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND NOT p.prosecdef
     AND p.proname NOT IN (SELECT proname FROM public.td300_group_e_before_20261007)
     AND p.proname LIKE 'seed\_uat\_%'
     AND p.prosrc ~ v_pola;
  IF v_n > 0 THEN
    RAISE NOTICE 'V-PRA-3 pengecualian (staging-only, dijalankan sebagai postgres): % fungsi -- %', v_n, v_daftar;
    RAISE NOTICE '  >> kalau ini PRODUCTION, BERHENTI: helper seed tidak boleh ada di production.';
  END IF;

  SELECT count(*), COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '')
    INTO v_n, v_daftar
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND NOT p.prosecdef
     AND p.proname NOT IN (SELECT proname FROM public.td300_group_e_before_20261007)
     AND p.proname NOT LIKE 'seed\_uat\_%'
     AND p.prosrc ~ v_pola;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'V-PRA-3 GAGAL: % fungsi SECURITY INVOKER lain memanggil salah satu fungsi yang akan dicabut (%). Kalau pemanggil itu sendiri terjangkau anon/authenticated, pencabutan EXECUTE anon di dalamnya bisa mematahkannya. BERHENTI dan lapor.', v_n, v_daftar;
  END IF;
  RAISE NOTICE 'V-PRA-3 LOLOS: nol pemanggil SECURITY INVOKER di luar pengecualian seed_uat_.';

  -- ---- LOOP: GRANT authenticated DULU, baru REVOKE PUBLIC+anon ---------------
  FOR r IN SELECT signature FROM public.td300_group_e_before_20261007 ORDER BY proname LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.signature);
  END LOOP;
  RAISE NOTICE 'ACL diubah untuk % fungsi: PUBLIC+anon dicabut, authenticated diberi.', v_jumlah;
END
$td300$;

-- -- V-POST ----------------------------------------------------------------------
DO $v$
DECLARE
  r       record;
  v_gagal int := 0;
  v_pub   int;
  v_anon  int;
  v_auth  int;
  v_md5   text;
BEGIN
  FOR r IN SELECT * FROM public.td300_group_e_before_20261007 ORDER BY proname LOOP

    -- V-POST-1: badan tidak bergerak -- berkas ini hanya menyentuh ACL.
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(r.signature);
    IF v_md5 IS DISTINCT FROM r.md5_before THEN
      RAISE WARNING 'V-POST-1 GAGAL: badan % berubah sejak snapshot. Berkas ini TIDAK boleh menyentuh badan.', r.signature;
      v_gagal := v_gagal + 1;
    END IF;

    -- V-POST-2: nol PUBLIC, nol anon -- grantee=0 lewat aclexplode, BUKAN
    -- LIKE '%=X/%' (pola itu juga kena postgres=X/postgres -- gotcha #40).
    SELECT count(*) FILTER (WHERE a.grantee = 0),
           count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'anon'),
           count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'authenticated')
      INTO v_pub, v_anon, v_auth
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(r.signature) AND a.privilege_type = 'EXECUTE';

    IF v_pub > 0 OR v_anon > 0 THEN
      RAISE WARNING 'V-POST-2 GAGAL: % masih ter-EXECUTE PUBLIC=% anon=%.', r.signature, v_pub, v_anon;
      v_gagal := v_gagal + 1;
    END IF;

    -- V-POST-3: authenticated ADA untuk SEMUA (beda dari H1 yang punya satu
    -- pengecualian nol-grant -- Group E tidak punya kasus seperti itu).
    IF v_auth = 0 THEN
      RAISE WARNING 'V-POST-3 GAGAL: % kehilangan EXECUTE untuk authenticated -- aplikasi akan patah.', r.signature;
      v_gagal := v_gagal + 1;
    END IF;
  END LOOP;

  IF v_gagal > 0 THEN
    RAISE EXCEPTION 'TD-300 Group E: % pemeriksaan GAGAL. Transaksi dibatalkan, nol perubahan.', v_gagal;
  END IF;
  RAISE NOTICE 'TD-300 Group E LOLOS: seluruh fungsi yang diproses tertutup dari PUBLIC dan anon, authenticated tetap ada, badan nol berubah.';
END
$v$;

COMMIT;

-- =============================================================================
-- ROLLBACK (jalankan manual, TIDAK otomatis -- transaksi terpisah)
--
-- Membaca `td300_group_e_before_20261007` (tabel ini TIDAK dihapus oleh
-- COMMIT di atas -- ia sengaja dipertahankan sebagai jejak rollback).
--
-- Jalur OTOMATIS hanya untuk kasus MAYORITAS: fungsi yang sebelumnya ber-
-- `acl_before = '(NULL = default/PUBLIC EXECUTE)'` (proacl NULL, artinya
-- hardwired default). Untuk kasus itu, mengembalikannya berarti GRANT ulang
-- ke PUBLIC dan mencabut grant authenticated yang ditambahkan migrasi ini.
--
-- Fungsi yang SEBELUMNYA sudah punya ACL eksplisit (bukan NULL) tapi masih
-- memuat PUBLIC/anon -- kasus LEBIH JARANG, mis. ada grant lain yang menumpang
-- di baris ACL yang sama -- SENGAJA TIDAK dipulihkan otomatis: parsing ulang
-- bentuk aclitem yang arbitrer berisiko salah re-apply. Baris itu dicetak
-- sebagai NOTICE, baca `acl_before`-nya dan GRANT manual sesuai teks itu.
--
-- !! Memberi kembali ke PUBLIC berarti MEMBUKA KEMBALI paparan yang migrasi
--    ini tutup. Lakukan HANYA kalau ada yang benar-benar patah, dan catat apa
--    yang patah -- itulah pemanggil yang tidak terdaftar di V-PRA-2/V-PRA-3,
--    dan ia temuan tersendiri, bukan sekadar "rollback selesai".
--
-- DO $$
-- DECLARE r record; v_sig text;
-- BEGIN
--   FOR r IN SELECT * FROM public.td300_group_e_before_20261007 LOOP
--     v_sig := to_regprocedure(r.signature);
--     IF v_sig IS NULL THEN
--       RAISE NOTICE 'skip % -- fungsi sudah tidak ada (ganti nama/DROP sejak migrasi ini)', r.signature;
--       CONTINUE;
--     END IF;
--     IF r.acl_before = '(NULL = default/PUBLIC EXECUTE)' THEN
--       EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', r.signature);
--       EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.signature);
--       RAISE NOTICE 'dipulihkan otomatis: %', r.signature;
--     ELSE
--       RAISE NOTICE 'PULIHKAN MANUAL % -- acl_before: %', r.signature, r.acl_before;
--     END IF;
--   END LOOP;
-- END $$;
-- =============================================================================

-- =============================================================================
-- LANGKAH UJI STAGING (jalankan manual, SESUDAH migrasi ini COMMIT di staging)
--
-- Migrasi ini TIDAK BOLEH naik ke production sebelum SEMUA langkah di bawah
-- lolos di staging. Dua yang pertama adalah uji NYATA -- tidak bisa
-- digantikan dengan membaca kode, karena keduanya menjawab pertanyaan yang
-- TD-300 sendiri tandai sebagai "diyakini, BELUM dibuktikan lewat eksekusi":
-- apakah firing trigger benar-benar tidak diperiksa EXECUTE-nya.
--
-- 1. SIGNUP USER BARU lewat anon key (via EF `create-user`, atau langsung
--    `/auth/v1/signup` dengan anon key staging). Konfirmasi:
--      - signup berhasil (tidak error di sisi Auth);
--      - baris `profiles` baru TERBENTUK OTOMATIS (lewat trigger
--        `handle_new_user` pada `auth.users`), dengan `company_id`/`branch_id`
--        default yang benar.
--    Kalau baris `profiles` TIDAK terbentuk: migrasi ini mematahkan
--    pendaftaran user baru -- ROLLBACK (lihat blok di atas) dan laporkan,
--    JANGAN lanjut ke production.
--
-- 2. SATU DML NYATA sebagai user `authenticated` BIASA (bukan postgres/
--    service_role) pada tabel yang punya trigger dari himpunan yang baru
--    dicabut -- pilih SATU nama dari:
--      select proname from public.td300_group_e_before_20261007 where is_trigger;
--    lalu cari tabel yang triggernya memanggil fungsi itu, lakukan INSERT/
--    UPDATE yang sah sebagai user biasa, dan konfirmasi efek sampingnya
--    (kolom turunan, baris lain yang seharusnya muncul) BENAR-BENAR terjadi.
--    Gagal diam-diam di sini (DML sukses tapi efek sampingnya TIDAK muncul)
--    adalah tanda paling berbahaya -- bukan error yang berisik.
--
-- 3. Uji runtime lewat PostgREST (bukan psql, pola H1) untuk SAMPEL -- bukan
--    seluruhnya -- dari himpunan yang diproses: panggil 5-10 fungsi dengan
--    anon key, harapkan 401/403; panggil fungsi yang sama sebagai user asli
--    (authenticated), harapkan 2xx atau penolakan BISNIS (bukan penolakan
--    hak). Prioritaskan sampel dari SECURITY DEFINER non-trigger (33 di
--    production per pengukuran 30 Sep) -- itu kelas yang paling berbahaya
--    kalau tertinggal terbuka (RLS tidak melindungi apa pun di dalamnya).
--
-- 4. `node scripts/qa/env-drift-check.mjs --hak-detail` sesudahnya -- harapkan
--    staging berubah (wajar, ANTRE sampai production menyusul), BUKAN error.
--
-- 5. Baca NOTICE V-PRA-1 (jumlah + rincian trigger/DEFINER/INVOKER) dan
--    tunjukkan ke Den SEBELUM memutuskan jadwal naik ke production -- angka
--    ini adalah pengukuran SEGAR, bisa berbeda dari 99/98 (30 Sep 2026).
-- =============================================================================
