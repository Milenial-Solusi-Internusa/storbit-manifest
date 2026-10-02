-- =============================================================================
-- Migration: 20261002000002_td300_default_privileges_revoke_execute
-- Status:    LIVE di STAGING DAN PRODUCTION — dijalankan MANUAL lewat Supabase
--            MCP (Claude) 2 Okt 2026, sesi yang sama di kedua lingkungan. File
--            ini CUMA REKAMAN (retroaktif); idempotent bila toh dijalankan
--            ulang (ALTER DEFAULT PRIVILEGES menimpa entri yang sama, bukan
--            menumpuk).
--
-- Isi:       Default privileges untuk fungsi BARU yang dibuat role `postgres`
--            di schema `public` tidak lagi otomatis memberi EXECUTE ke PUBLIC.
--
--              ALTER DEFAULT PRIVILEGES FOR ROLE postgres
--                REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--
--            (Ditulis sebagai REVOKE, bukan GRANT TO — PostgreSQL tidak
--            mengenal "default privileges kosong" secara eksplisit; REVOKE
--            atas default privileges mencabut hak PUBLIC implisit yang
--            diwarisi tiap fungsi baru sejak CREATE FUNCTION, sebelum ACL
--            manual apa pun ditambahkan.)
--
-- -- KENAPA INI, DAN KENAPA SEKARANG --------------------------------------------
-- TD-300 ("Group E", lihat 08_TECH_DEBT.md) menemukan 99 fungsi LAMA di
-- production (98 staging) masih ter-EXECUTE untuk anon dan/atau PUBLIC, badan
-- satu-per-satu belum dibaca — cakupannya besar, sengaja TIDAK digabung ke
-- paket TD-281 H1-H6, dan TETAP OPEN sesudah berkas ini (lihat bagian bawah).
--
-- Berkas INI bukan bagian penutupan TD-300 itu sendiri — ini COMPANION-nya:
-- menutup KERAN yang membuat celah serupa terus lahir. Tanpa ini, setiap
-- `CREATE FUNCTION` baru di schema public otomatis ter-EXECUTE PUBLIC (default
-- bawaan PostgreSQL) sampai seseorang INGAT menambahkan REVOKE/GRANT manual —
-- persis pola yang melahirkan TD-300 hari ini. Sesudah berkas ini, fungsi baru
-- LAHIR TERKUNCI; yang lupa memberi GRANT EXECUTE eksplisit akan menemukan
-- fungsinya TIDAK BISA DIPANGGIL aplikasi — gagal yang KELIHATAN, bukan celah
-- yang baru ketahuan bertahun-tahun kemudian.
--
-- -- PEMERIKSAAN SEBELUM DIPASANG: RANTAI AR TAHAP 1–3B TIDAK IKUT PATAH --------
-- Diperiksa 42 berkas migrasi di antrean doc 12 (AR Tahap 1/2/3/3b) satu per
-- satu: setiap fungsi BARU di rantai itu SUDAH punya salah satu dari —
--   (a) GRANT EXECUTE eksplisit ke `authenticated` (pola yang sudah berlaku
--       sejak AR Tahap 2, lihat mis. 20260928000001 dkk), atau
--   (b) sengaja TANPA grant ke `authenticated`/`anon` sama sekali karena
--       memang hanya dipanggil fungsi SECURITY DEFINER lain, bukan langsung
--       oleh aplikasi: `compute_payment_term_days`, `invoice_journal_projection`,
--       `post_invoice_journal`.
-- Fungsi yang disentuh lewat `CREATE OR REPLACE` (bukan `CREATE` baru)
-- MEWARISI ACL lamanya — default privileges baru TIDAK berlaku surut padanya.
-- Kesimpulan: aturan ini TIDAK mematahkan rilis 15 Oktober 2026.
--
-- -- BUKTI UJI (dilakukan Claude sebelum & sesudah, fungsi uji dibuang) --------
-- SEBELUM: fungsi uji baru -> anon BISA EXECUTE (default bawaan PostgreSQL).
-- SESUDAH: fungsi uji baru -> acl HANYA `postgres=X/postgres`; anon dan
--          authenticated SAMA-SAMA tidak ter-EXECUTE (harus di-GRANT manual).
-- Reproduksi persis ada di blok V-PRA/V-POST di bawah — fungsi ujinya dibuat
-- dan di-DROP dalam transaksi yang sama, nol sisa di skema.
--
-- -- YANG BERKAS INI TIDAK LAKUKAN ----------------------------------------------
-- 99 fungsi LAMA (TD-300) TIDAK disentuh sama sekali — default privileges
-- hanya berlaku untuk objek yang dibuat SESUDAH perubahan ini. TD-300 TETAP
-- OPEN, menunggu PLAN tersendiri (lihat 08_TECH_DEBT.md).
--
-- -- ATURAN BARU SEJAK BERKAS INI ------------------------------------------------
-- Setiap fungsi BARU di schema public WAJIB diberi `GRANT EXECUTE ... TO
-- <role pemanggil>` eksplisit (biasanya `authenticated`) di migrasi yang sama
-- dengan `CREATE FUNCTION`-nya — tanpa itu, fungsi itu TIDAK BISA DIPANGGIL
-- aplikasi sama sekali, oleh role mana pun selain `postgres`.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V-PRA — buktikan perilaku SEBELUM perubahan: fungsi baru ter-EXECUTE PUBLIC
-- secara default (perilaku bawaan PostgreSQL yang akan dicabut berkas ini).
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.td300_test_sebelum() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;

DO $pra$
DECLARE v_anon_boleh boolean;
BEGIN
  SELECT has_function_privilege('anon', 'public.td300_test_sebelum()', 'EXECUTE') INTO v_anon_boleh;
  IF NOT v_anon_boleh THEN
    RAISE EXCEPTION 'V-PRA GAGAL: fungsi uji SEBELUM perubahan seharusnya ter-EXECUTE anon (perilaku bawaan), tapi tidak.';
  END IF;
  RAISE NOTICE 'V-PRA LOLOS: fungsi baru SEBELUM perubahan ter-EXECUTE anon = %, sesuai dugaan (perilaku bawaan PostgreSQL).', v_anon_boleh;
END
$pra$;

DROP FUNCTION public.td300_test_sebelum();

-- ---------------------------------------------------------------------------
-- PERUBAHAN — default privileges fungsi baru milik role `postgres`.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- V-POST — buktikan perilaku SESUDAH: fungsi baru TIDAK lagi ter-EXECUTE
-- anon maupun authenticated sampai di-GRANT manual.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.td300_test_sesudah() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;

DO $post$
DECLARE
  v_anon_boleh boolean;
  v_auth_boleh boolean;
  v_acl        text;
BEGIN
  SELECT has_function_privilege('anon', 'public.td300_test_sesudah()', 'EXECUTE') INTO v_anon_boleh;
  SELECT has_function_privilege('authenticated', 'public.td300_test_sesudah()', 'EXECUTE') INTO v_auth_boleh;
  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(NULL = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'td300_test_sesudah';

  IF v_anon_boleh OR v_auth_boleh THEN
    RAISE EXCEPTION 'V-POST GAGAL: fungsi uji SESUDAH perubahan masih ter-EXECUTE (anon=%, authenticated=%). ACL: %',
      v_anon_boleh, v_auth_boleh, v_acl;
  END IF;
  RAISE NOTICE 'V-POST LOLOS: fungsi baru SESUDAH perubahan NOL ter-EXECUTE anon/authenticated. ACL: %', v_acl;
END
$post$;

DROP FUNCTION public.td300_test_sesudah();

-- ---------------------------------------------------------------------------
-- V1 — default privileges sungguh tercatat di pg_default_acl untuk postgres
-- di schema public, objek fungsi ('f'), dan tidak mengandung grant PUBLIC.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_n   int;
  v_acl text;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN pg_roles r ON r.oid = da.defacluser
   WHERE n.nspname = 'public' AND r.rolname = 'postgres' AND da.defaclobjtype = 'f';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'V1 GAGAL: diharapkan tepat 1 baris pg_default_acl (postgres, public, fungsi), ditemukan %.', v_n;
  END IF;

  SELECT COALESCE(array_to_string(da.defaclacl::text[], ','), '(kosong)') INTO v_acl
    FROM pg_default_acl da
    JOIN pg_namespace n ON n.oid = da.defaclnamespace
    JOIN pg_roles r ON r.oid = da.defacluser
   WHERE n.nspname = 'public' AND r.rolname = 'postgres' AND da.defaclobjtype = 'f';
  IF v_acl LIKE '%=X%' THEN
    RAISE EXCEPTION 'V1 GAGAL: default ACL masih memuat grantee kosong (PUBLIC). defaclacl: %', v_acl;
  END IF;

  RAISE NOTICE 'V1 LOLOS: default privileges fungsi baru postgres/public tercatat, tanpa PUBLIC. defaclacl: %', v_acl;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres
--     GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--
-- ⚠️ Ini membuka kembali celah yang jadi alasan TD-300 companion ini ada —
-- SETIAP fungsi baru yang lahir sesudah rollback akan kembali ter-EXECUTE
-- PUBLIC secara diam-diam. Jangan jalankan kecuali ada rilis yang benar-benar
-- patah karena ini, dan catat fungsi mana yang patah (itu fungsi yang lupa
-- diberi GRANT EXECUTE eksplisit saat ditulis, bukan sinyal aturan ini salah).
-- 99 fungsi lama TD-300 TIDAK terpengaruh rollback ini (dan tidak tersentuh
-- migrasi ini sejak awal).
-- =============================================================================
