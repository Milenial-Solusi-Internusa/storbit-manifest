-- =============================================================================
-- ar-role-visibility-check.sql -- berapa baris yang SUNGGUH terlihat tiap akun
-- di halaman Invoice Management. 100% BACA.
--
-- Menggantikan uji peran AR Tahap 2 yang pertama, yang GAGAL menangkap bug
-- nyata pada 25 Sep 2026. Sebabnya layak dibaca sebelum menyentuh berkas ini:
--
--   Uji lama memakai impersonasi GUC (request.jwt.claim.sub) supaya guard
--   is_super_admin()/has_role() lolos, TAPI sesinya tetap role `postgres` yang
--   punya rolbypassrls = true. Jadi setiap SELECT di dalamnya melihat SEMUA
--   baris, dan uji itu membuktikan guard PERAN bekerja sambil tidak pernah
--   menguji RLS sama sekali. Akibatnya lima policy staging yang masih
--   home-company-only lolos tanpa terdeteksi, dan halaman Siap Ditagih tampil
--   0/0 untuk dua akun finance.
--
--   Kelas yang sama dengan pelajaran hijau-palsu lain di repo ini: asersi yang
--   lolos karena PRASYARATNYA tak pernah terpenuhi (scripts/qa/README.md).
--
-- ⭐ PALANG YANG MEMBUATNYA TIDAK BISA TERULANG: sesudah SET ROLE, skrip
-- memeriksa rolbypassrls dari role yang SEDANG dipakai mengukur. Kalau ia
-- true, skrip BERHENTI. Palangnya diperiksa pada sesi PENGUKUR, bukan pada
-- sesi luar -- sesi luar memang harus privileged supaya boleh SET ROLE.
--
-- Cara jalan: psql "$STG_DB_URL" -f scripts/qa/ar-role-visibility-check.sql
--             (atau salin isinya ke SQL Editor staging)
--
-- ⚠️ STAGING SAJA. Angka harapannya terikat pada 40 SP dummy seed
-- (scripts/seed/uat/). Di produksi angkanya lain dan uji ini tidak berarti.
-- =============================================================================

DO $uji$
DECLARE
  r record;
  v_siap int; v_daftar int; v_bypass boolean;
  v_h_siap int; v_h_daftar int;
  v_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_gagal int := 0; v_total int := 0;
BEGIN
  CREATE TEMP TABLE _hasil (
    akun text, entitas text, siap int, siap_harapan int,
    daftar int, daftar_harapan int, hasil text
  ) ON COMMIT DROP;
  -- Sejak 28 Sep 2026 tabel ini memuat TIGA jenis baris, bukan satu:
  --   <entitas>              -> Siap Ditagih / Daftar Invoice (bagian 1)
  --   <entitas> lampiran     -> invoice_attachments terlihat (bagian 2)
  --   <entitas> catatan      -> invoice_notes terlihat       (bagian 2)
  --   <entitas> helper=RLS   -> invoice_dapat_dibaca vs RLS  (bagian 3)
  -- Kolom yang tidak relevan untuk sebuah baris sengaja NULL, bukan 0 --
  -- supaya "tidak diukur" tidak terbaca sebagai "diukur dan nol".

  FOR r IN
    -- Tiap akun uji DI TIAP ENTITAS yang benar-benar bisa ia pilih di
    -- CompanySwitcher (= entitas tempat ia punya role aktif). Menguji entitas
    -- yang tidak bisa dipilih berarti menguji keadaan yang tak pernah terjadi.
    SELECT p.id AS uid, p.email, c.id AS company_id, c.code AS entitas
      FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true
      JOIN companies c   ON c.id = ur.company_id
     WHERE p.email LIKE 'zzztest.%@msi.com' OR p.email = 'test@msi.com'
     GROUP BY p.id, p.email, c.id, c.code
     ORDER BY p.email, c.code
  LOOP
    -- HARAPAN: seluruh data seed milik SOA, jadi entitas lain HARUS nol.
    IF r.company_id = v_soa THEN
      -- 13 = 19 SP tanpa invoice aktif MINUS 6 yang belum terkirim penuh
      -- (cakupan halaman = tiga alasan penagihan, keputusan Den K-10).
      -- 22 = seluruh invoice seed, termasuk satu yang void.
      v_h_siap := 13; v_h_daftar := 22;
    ELSE
      v_h_siap := 0;  v_h_daftar := 0;
    END IF;

    -- viewer tanpa izin menu tidak akan pernah membuka halamannya; yang diuji
    -- di sini murni APA YANG TERLIHAT kalau ia sampai ke sana.
    PERFORM set_config('request.jwt.claim.sub', r.uid::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT rolbypassrls INTO v_bypass FROM pg_roles WHERE rolname = current_user;
    IF v_bypass IS NOT TRUE THEN
      NULL;  -- beres: sesi pengukur tunduk RLS
    ELSE
      PERFORM set_config('role', 'postgres', true);
      RAISE EXCEPTION 'PALANG: sesi pengukur (%) punya rolbypassrls = true, jadi RLS DI-BYPASS dan uji ini tidak mengukur apa pun. Inilah cacat yang membuat uji peran 25 Sep 2026 lolos padahal lima policy staging salah.', current_user;
    END IF;

    SELECT count(*) INTO v_siap   FROM sp_invoice_readiness_all(r.company_id);
    SELECT count(*) INTO v_daftar FROM sp_invoices
     WHERE deleted_at IS NULL AND company_id = r.company_id;

    PERFORM set_config('role', 'postgres', true);

    v_total := v_total + 1;
    IF v_siap = v_h_siap AND v_daftar = v_h_daftar THEN
      INSERT INTO _hasil VALUES (r.email, r.entitas, v_siap, v_h_siap, v_daftar, v_h_daftar, 'LOLOS');
    ELSE
      v_gagal := v_gagal + 1;
      INSERT INTO _hasil VALUES (r.email, r.entitas, v_siap, v_h_siap, v_daftar, v_h_daftar, 'GAGAL');
    END IF;
  END LOOP;

  -- ===========================================================================
  -- BAGIAN 2 -- dua TABEL BARU (invoice_attachments, invoice_notes) pada dua
  -- akun Finance di SOA. Tanpa blok ini kedua tabel itu tidak pernah diuji
  -- RLS-nya sama sekali; V12i cuma menghitungnya sebagai `postgres`, yang
  -- melihat semuanya.
  -- Harapan = jumlah fixture 07-fixture-invoice-v2.sql: 2 lampiran, 3 catatan.
  -- ===========================================================================
  FOR r IN
    SELECT p.id AS uid, p.email, c.id AS company_id, c.code AS entitas
      FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true
      JOIN companies c   ON c.id = ur.company_id
     WHERE p.email IN ('zzztest.finance@msi.com','zzztest.controller@msi.com')
       AND c.id = v_soa
     GROUP BY p.id, p.email, c.id, c.code
     ORDER BY p.email
  LOOP
    PERFORM set_config('request.jwt.claim.sub', r.uid::text, true);
    PERFORM set_config('role', 'authenticated', true);
    SELECT count(*) INTO v_siap   FROM invoice_attachments WHERE deleted_at IS NULL;
    SELECT count(*) INTO v_daftar FROM invoice_notes       WHERE deleted_at IS NULL;
    PERFORM set_config('role', 'postgres', true);

    v_total := v_total + 1;
    IF v_siap = 2 THEN
      INSERT INTO _hasil VALUES (r.email, r.entitas || ' lampiran', v_siap, 2, NULL, NULL, 'LOLOS');
    ELSE
      v_gagal := v_gagal + 1;
      INSERT INTO _hasil VALUES (r.email, r.entitas || ' lampiran', v_siap, 2, NULL, NULL, 'GAGAL');
    END IF;

    v_total := v_total + 1;
    IF v_daftar = 3 THEN
      INSERT INTO _hasil VALUES (r.email, r.entitas || ' catatan', NULL, NULL, v_daftar, 3, 'LOLOS');
    ELSE
      v_gagal := v_gagal + 1;
      INSERT INTO _hasil VALUES (r.email, r.entitas || ' catatan', NULL, NULL, v_daftar, 3, 'GAGAL');
    END IF;
  END LOOP;

  -- ===========================================================================
  -- BAGIAN 3 -- invoice_dapat_dibaca() HARUS sepakat dengan policy
  -- sp_invoices_read.
  --
  -- Fungsi itu adalah SALINAN syarat policy (berkas 7, 20260928000007), dibuat
  -- karena fungsi SECURITY DEFINER tidak bisa menumpang RLS pemanggilnya.
  -- Salinan yang tidak pernah dibandingkan dengan aslinya adalah divergensi
  -- yang menunggu waktu -- kelas TD-233, dan gagalnya SENYAP: pemakai yang
  -- seharusnya boleh menandai cetak / menulis catatan akan ditolak, atau
  -- sebaliknya, tanpa satu pun error.
  --
  -- Dibandingkan sebagai ANGKA di sesi user asli: berapa invoice yang lolos
  -- fungsi itu vs berapa yang sungguh terlihat lewat RLS.
  -- ===========================================================================
  FOR r IN
    SELECT p.id AS uid, p.email, c.id AS company_id, c.code AS entitas
      FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true
      JOIN companies c   ON c.id = ur.company_id
     WHERE p.email LIKE 'zzztest.%@msi.com' OR p.email = 'test@msi.com'
     GROUP BY p.id, p.email, c.id, c.code
     ORDER BY p.email, c.code
  LOOP
    PERFORM set_config('request.jwt.claim.sub', r.uid::text, true);
    PERFORM set_config('role', 'authenticated', true);
    -- Terlihat lewat RLS.
    SELECT count(*) INTO v_daftar FROM sp_invoices WHERE deleted_at IS NULL;
    -- Lolos helper. Dihitung atas SELURUH invoice yang terlihat sesi ini --
    -- helper-nya SECURITY DEFINER, jadi ia menjawab untuk id apa pun.
    SELECT count(*) INTO v_siap
      FROM (SELECT id FROM sp_invoices WHERE deleted_at IS NULL) z
     WHERE invoice_dapat_dibaca(z.id);
    PERFORM set_config('role', 'postgres', true);

    v_total := v_total + 1;
    IF v_siap = v_daftar THEN
      INSERT INTO _hasil VALUES (r.email, r.entitas || ' helper=RLS', v_siap, v_daftar, NULL, NULL, 'LOLOS');
    ELSE
      v_gagal := v_gagal + 1;
      INSERT INTO _hasil VALUES (r.email, r.entitas || ' helper=RLS', v_siap, v_daftar, NULL, NULL, 'GAGAL');
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE '--- ar-role-visibility-check: % baris diuji, % GAGAL ---', v_total, v_gagal;
  FOR r IN SELECT * FROM _hasil ORDER BY akun, entitas LOOP
    RAISE NOTICE '% @ % : siap %/% , daftar %/% -> %',
      r.akun, r.entitas, r.siap, r.siap_harapan, r.daftar, r.daftar_harapan, r.hasil;
  END LOOP;

  IF v_gagal > 0 THEN
    RAISE EXCEPTION 'UJI GAGAL: % dari % baris tidak sesuai harapan. Kalau seluruh baris SOA bernilai 0, curigai RLS home-company-only lebih dulu (lihat 12_ANTREAN_MIGRASI_PRODUCTION.md butir 15).', v_gagal, v_total;
  END IF;
END
$uji$;
