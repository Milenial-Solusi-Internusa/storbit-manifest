-- =============================================================================
-- c-generate-from-production.sql -- GENERATOR Kelompok C (TD-279).
--
-- !!  DIJALANKAN DI PRODUCTION, DAN 100% SELECT.  !!
--     Nol DDL, nol DML, nol GRANT. Ia hanya MENCETAK teks SQL.
--     Keluarannya-lah yang nanti dijalankan di STAGING.
--
-- -- KENAPA BENTUKNYA BEGINI ------------------------------------------------
-- Kelompok C harus menyamakan enam fungsi get_storbit_* di staging ke
-- production. Tiga jalan, dan dua di antaranya sudah gugur:
--
--   (a) jalankan berkas migrasi repo -- GUGUR, DAN INI DIUKUR, bukan dikira.
--       Teks di repo TIDAK sama dengan production:
--         get_storbit_outstanding_summary      4.979 byte (repo) vs 3.552 (prd)
--         get_storbit_product_report           4.495          vs 3.836
--         get_storbit_rekap_per_customer       4.398          vs 4.281
--         get_storbit_dashboard_stats          9.262          vs 9.245
--         get_storbit_product_sp_list          tidak ada di migrasi mana pun
--         get_storbit_top_outstanding_products tidak ada di migrasi mana pun
--       Menjalankannya akan menyamakan staging ke sesuatu yang BUKAN
--       production, lalu melaporkannya sebagai parity. Itu lebih buruk daripada
--       drift yang jujur.
--
--   (b) salin teks production dengan tangan -- bisa (itu pola Kelompok A), tapi
--       enam badan berjumlah 24.539 byte, dan satu byte geser membuat sidiknya
--       meleset. Yang lebih buruk: kelirunya tidak tampak sebagai keliru, ia
--       tampak sebagai DRIFT baru.
--
--   (c) production MENULIS SENDIRI DDL-nya lewat pg_get_functiondef. DIPILIH.
--       Ia mengembalikan CREATE OR REPLACE yang lengkap -- tipe kembali,
--       bahasa, volatilitas, SECURITY DEFINER, klausa SET, dan prosrc apa
--       adanya. Nol tangan menyentuh teksnya. Hak juga DITURUNKAN dari
--       aclexplode, bukan ditebak dari bentuk yang "biasanya benar".
--
-- ** Blok verifikasinya ikut digenerate, dengan sidik jari yang DIUKUR DI RUN
--    INI. ** Angka harapannya lahir di detik yang sama dengan DDL-nya, dari
--    baris yang sama, jadi tidak ada jalan bagi keduanya untuk tidak sinkron.
--    Bandingkan dengan kekeliruan 28 Sep: konstanta yang dihitung di luar SQL,
--    lalu dipakai menghakimi keadaan yang sebenarnya sudah benar.
--
-- -- PEMAKAIAN ---------------------------------------------------------------
--   psql "$PRD_DB_URL" -A -t -f c-generate-from-production.sql > c-apply.sql
--   psql "$STG_DB_URL" -f c-apply.sql
-- Keduanya dijalankan scripts/qa/out/jalankan-parity-c.sh, satu koneksi per DB.
--
-- Bentuknya SENGAJA cuma empat baris keluaran (empat bongkah teks), bukan
-- puluhan baris ber-nomor-urut: tidak ada server Postgres lokal untuk menguji
-- sintaksnya, jadi yang bisa dikurangi adalah jumlah tempat ia bisa salah.
-- =============================================================================

WITH f AS (
  SELECT p.oid,
         p.proname,
         'public.' || p.proname || '('
           || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS kunci,
         -- Rumus sidik jari SENGAJA sama dengan env-drift-check INVENTARIS_SQL.
         -- Kalau keduanya berbeda, "parity" di sini tidak berarti parity di sana.
         md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), '')) AS sidik,
         COALESCE(p.proacl, acldefault('f', p.proowner)) AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_storbit_dashboard_stats',
                       'get_storbit_outstanding_summary',
                       'get_storbit_product_report',
                       'get_storbit_product_sp_list',
                       'get_storbit_rekap_per_customer',
                       'get_storbit_top_outstanding_products')
), bongkah AS (

  -- 1. kepala + palang -------------------------------------------------------
  SELECT 1 AS urut,
         '-- BERKAS INI DIGENERATE oleh scripts/qa/parity/c-generate-from-production.sql.'
         || E'\n-- Jangan disunting; regenerate kalau perlu. Sumber: PRODUCTION,'
         || E'\n-- pg_get_functiondef + aclexplode, SELECT saja.'
         || E'\n-- Digenerate: ' || now()::text
         || E'\n-- Tujuan: STAGING saja (TD-279 Kelompok C).'
         || E'\n\nBEGIN;\n'
         || E'\n-- PALANG: berkas ini menyamakan STAGING ke production. Menjalankannya di'
         || E'\n-- production sendiri memang tidak mengubah apa-apa (CREATE OR REPLACE dengan'
         || E'\n-- teksnya sendiri), tapi tugas ini berjanji NOL TULIS ke production -- dan'
         || E'\n-- janji yang dijaga hanya oleh kehati-hatian bukan janji. Penandanya data'
         || E'\n-- seed UAT, yang hanya ada di staging.'
         || E'\nDO $palang$\nBEGIN'
         || E'\n  IF (SELECT count(*) FROM public.sp_orders'
         || E'\n       WHERE notes = ''DATA DUMMY UAT'') = 0 THEN'
         || E'\n    RAISE EXCEPTION ''PALANG: nol baris DATA DUMMY UAT -- ini bukan staging yang di-seed. DITOLAK.'';'
         || E'\n  END IF;\nEND\n$palang$;\n' AS teks

  -- 2. definisi + hak, verbatim dari production -------------------------------
  UNION ALL
  SELECT 2, string_agg(
           '-- ' || f.kunci || E'\n-- sidik production: ' || f.sidik
           || E'\n' || pg_get_functiondef(f.oid) || ';'
           -- REVOKE PUBLIC lebih dulu: fungsi yang BARU lahir punya proacl NULL,
           -- yang artinya PUBLIC EXECUTE. Tanpa baris ini kelima fungsi baru di
           -- staging jadi LEBIH TERBUKA daripada di production -- drift yang
           -- lahir dari memperbaiki drift.
           || E'\nREVOKE ALL ON FUNCTION ' || f.sig || ' FROM PUBLIC;'
           || E'\n' || COALESCE((
                SELECT string_agg('GRANT ' || a.privilege_type || ' ON FUNCTION '
                                  || f.sig || ' TO '
                                  || quote_ident(pg_get_userbyid(a.grantee)) || ';',
                                  E'\n' ORDER BY pg_get_userbyid(a.grantee), a.privilege_type)
                  FROM aclexplode(f.acl) a
                 WHERE a.grantee <> 0      -- 0 = PUBLIC, sudah dicabut di atas
              ), '-- (nol hak eksplisit selain PUBLIC di production)'),
           E'\n\n' ORDER BY f.proname)
    FROM f

  -- 3. verifikasi: sidik + proacl staging WAJIB = production run ini ---------
  -- Yang digenerate HANYA baris VALUES-nya; blok di sekelilingnya statis.
  -- Sengaja begitu: teks statis bisa dibaca sekali dan dipercaya, teks
  -- digenerate tidak, jadi yang digenerate dibuat sesempit mungkin.
  UNION ALL
  SELECT 3,
         E'\nDO $v$\nDECLARE r record; v_sidik text; v_acl text; v_gagal int := 0;\nBEGIN'
         || E'\n  FOR r IN SELECT * FROM (VALUES\n'
         || string_agg(format('    (%L, %L, %L)', kunci, sidik,
                              array_to_string(acl::text[], ',')),
                       E',\n' ORDER BY proname)
         || E'\n  ) AS t(kunci, sidik, acl) LOOP'
         || E'\n    SELECT md5(p.prosrc || ''|'' || p.prosecdef::text || ''|'' || p.provolatile::text'
         || E'\n               || ''|'' || COALESCE(array_to_string(p.proconfig, '',''), '''')),'
         || E'\n           COALESCE(array_to_string(p.proacl::text[], '',''), ''(null)'')'
         || E'\n      INTO v_sidik, v_acl'
         || E'\n      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace'
         || E'\n     WHERE n.nspname = ''public'''
         || E'\n       AND p.proname || ''('' || pg_get_function_identity_arguments(p.oid) || '')'' = r.kunci;'
         -- WARNING dulu, EXCEPTION sekali di akhir: berhenti di kegagalan
         -- PERTAMA menyembunyikan seberapa banyak yang salah, dan yang
         -- tersembunyi akan ditemukan satu per satu di putaran berikutnya.
         || E'\n    IF v_sidik IS NULL THEN'
         || E'\n      RAISE WARNING ''V GAGAL: % tidak ada sesudah dibuat.'', r.kunci;'
         || E'\n      v_gagal := v_gagal + 1;'
         || E'\n    ELSIF v_sidik IS DISTINCT FROM r.sidik THEN'
         || E'\n      RAISE WARNING ''V GAGAL: sidik % = %, harusnya % (production).'', r.kunci, v_sidik, r.sidik;'
         || E'\n      v_gagal := v_gagal + 1;'
         || E'\n    ELSIF v_acl IS DISTINCT FROM r.acl THEN'
         || E'\n      RAISE WARNING ''V GAGAL: proacl % = %, harusnya % (production).'', r.kunci, v_acl, r.acl;'
         || E'\n      v_gagal := v_gagal + 1;'
         || E'\n    ELSE'
         || E'\n      RAISE NOTICE ''C LOLOS: % sidik + proacl sama dengan production.'', r.kunci;'
         || E'\n    END IF;'
         || E'\n  END LOOP;'
         || E'\n  IF v_gagal > 0 THEN'
         || E'\n    RAISE EXCEPTION ''Kelompok C: % dari 6 fungsi TIDAK sama dengan production.'', v_gagal;'
         || E'\n  END IF;'
         || E'\n  RAISE NOTICE ''Kelompok C: 6 dari 6 fungsi sama dengan production.'';'
         || E'\nEND\n$v$;\n'
    FROM f

  -- 4. ekor ------------------------------------------------------------------
  UNION ALL
  SELECT 4,
         E'COMMIT;\n'
         || E'\n-- ROLLBACK (staging saja):'
         || E'\n--   DROP FUNCTION kelima fungsi yang BARU lahir di sini.'
         || E'\n--   get_storbit_dashboard_stats JANGAN di-DROP -- ia sudah ada di staging'
         || E'\n--   sebelum Kelompok C, hanya badannya yang berbeda; men-DROP-nya membuang'
         || E'\n--   versi lama tanpa ada yang bisa memulihkannya.'
)
SELECT teks FROM bongkah ORDER BY urut;
