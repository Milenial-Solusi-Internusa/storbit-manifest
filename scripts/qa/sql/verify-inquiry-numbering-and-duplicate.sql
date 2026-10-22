-- =============================================================================
-- Skrip uji transaksi-aman untuk Inquiry Management Irisan 4 (penomoran
-- server-side + Close as Duplicate + deteksi Possible Duplicate), migrasi
-- 20261022000001 / …000002 / …000003. TIDAK DIJALANKAN oleh siapa pun di
-- sesi penulisan ini -- hanya ditulis untuk Mas eksekusi manual di staging
-- SESUDAH ketiga migrasi jalan.
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri (bukan di-select-all sekaligus satu transaksi
-- besar). Setiap blok SELALU berakhir RAISE EXCEPTION, baik lulus ("UJI
-- LULUS (dibatalkan sengaja)") maupun gagal ("UJI GAGAL -- ...") -- nol baris
-- tersisa di DB dalam kedua kasus. Pola identik verify-inquiry-won-revert.sql.
--
-- Identitas akun uji staging dipakai ulang dari skrip Irisan 3 (semuanya
-- perusahaan MSI, dikonfirmasi Den):
--   manager (level 6)             : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales pemilik                 : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales lain (bukan pemilik,
--     bukan manager)              : 6739c239-e2ff-48ff-97ed-23059f749218
--
-- Company setiap blok DITURUNKAN dari profiles.company_id milik akun yang
-- dipakai (BUKAN "company pertama" -- pelajaran keras Irisan 3).
--
-- Dua kebutuhan sesi untuk blok yang memanggil close_inquiry_as_duplicate /
-- find_possible_duplicate_inquiries / UPDATE langsung sebagai akun TERTENTU:
--   1. set_config('request.jwt.claim.sub', <uuid>, true) -- auth.uid() resolve.
--   2. EXECUTE 'SET LOCAL ROLE authenticated' -- RLS (TO authenticated)
--      benar-benar dievaluasi; tanpa ini SQL Editor berjalan sebagai postgres
--      yang melewati RLS sepenuhnya.
-- Blok yang SENGAJA menguji "tanpa login" (uji h) justru TIDAK memakai
-- kedua baris di atas -- itulah yang mau dibuktikan.
-- =============================================================================

-- =====================================================================
-- (a) Penomoran: unik & berurutan per entitas/tahun, format baru benar.
-- Actor: sales pemilik (insert inquiry biasa, trigger yang menomori).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_code text; v_account_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_id1 uuid; v_id2 uuid; v_no1 text; v_no2 text;
  v_seq1 int; v_seq2 int;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_code       := (SELECT code FROM companies WHERE id = v_company_id);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);
  IF v_company_id IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'UJI TIDAK BISA DIJALANKAN -- company/account fixture tidak ditemukan';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'NILAI-INI-AKAN-DIBUANG', v_account_id, 'OPEN', v_uuid_sales_owner)
  RETURNING id, inquiry_no INTO v_id1, v_no1;

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'NILAI-INI-JUGA-DIBUANG', v_account_id, 'OPEN', v_uuid_sales_owner)
  RETURNING id, inquiry_no INTO v_id2, v_no2;

  RAISE NOTICE 'Nomor pertama=%, kedua=%', v_no1, v_no2;

  IF v_no1 NOT LIKE (v_code || '-INQ-%') OR v_no2 NOT LIKE (v_code || '-INQ-%') THEN
    RAISE EXCEPTION 'UJI GAGAL -- format nomor tidak sesuai {ENTITY}-INQ-...: % / %', v_no1, v_no2;
  END IF;
  IF v_no1 = v_no2 THEN
    RAISE EXCEPTION 'UJI GAGAL -- dua insert berurutan menghasilkan nomor SAMA: %', v_no1;
  END IF;

  v_seq1 := split_part(v_no1, '-', 4)::int;
  v_seq2 := split_part(v_no2, '-', 4)::int;
  IF v_seq2 <> v_seq1 + 1 THEN
    RAISE EXCEPTION 'UJI GAGAL -- urutan tidak naik tepat 1 (% -> %)', v_seq1, v_seq2;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- % lalu %', v_no1, v_no2;
END $$;

-- =====================================================================
-- (b) Nilai inquiry_no dari client SELALU ditimpa, tidak pernah dipakai --
-- bahkan kalau client mengirim string yang KEBETULAN sudah berformat baru
-- yang sah untuk urutan lain.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_id uuid; v_no text;
  v_palsu text := 'MSI-INQ-XII-1999-9999';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, v_palsu, v_account_id, 'OPEN', v_uuid_sales_owner)
  RETURNING id, inquiry_no INTO v_id, v_no;

  IF v_no = v_palsu THEN
    RAISE EXCEPTION 'UJI GAGAL -- nomor dari client TIDAK ditimpa: %', v_no;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- client kirim %, DB simpan %', v_palsu, v_no;
END $$;

-- =====================================================================
-- (d) Close as Duplicate -- sukses. Actor: manager (level 6) di entitas
-- yang sama. Fixture: dua inquiry (kept lebih tua, closed lebih baru) +
-- satu quotation DRAFT milik inquiry yang ditutup -- harus ikut SUPERSEDED.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid;
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_keep_id uuid; v_close_id uuid; v_keep_no text; v_quo_id uuid;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_manager);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '2 days')
  RETURNING id, inquiry_no INTO v_keep_id, v_keep_no;

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'QUOTED', v_uuid_sales_owner, now())
  RETURNING id INTO v_close_id;

  INSERT INTO quotations (company_id, quotation_no, inquiry_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, v_close_id, 'DRAFT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  -- Close as Duplicate dieksekusi oleh MANAGER, bukan sales pemilik.
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM close_inquiry_as_duplicate(v_close_id, v_keep_id);

  IF (SELECT status FROM inquiries WHERE id = v_close_id) <> 'CANCELLED' THEN
    RAISE EXCEPTION 'UJI GAGAL -- status tidak jadi CANCELLED';
  END IF;
  IF (SELECT duplicate_of_id FROM inquiries WHERE id = v_close_id) <> v_keep_id THEN
    RAISE EXCEPTION 'UJI GAGAL -- duplicate_of_id tidak tersimpan dengan benar';
  END IF;
  IF (SELECT status FROM quotations WHERE id = v_quo_id) <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'UJI GAGAL -- quotation anak seharusnya SUPERSEDED, dapat %', (SELECT status FROM quotations WHERE id = v_quo_id);
  END IF;
  IF (SELECT rejection_reason FROM quotations WHERE id = v_quo_id) NOT LIKE '%duplikat%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- rejection_reason quotation tidak menyebut duplikat: %', (SELECT rejection_reason FROM quotations WHERE id = v_quo_id);
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- % ditutup sebagai duplikat %', v_close_id, v_keep_no;
END $$;

-- =====================================================================
-- (e) Close as Duplicate -- ditolak untuk non-manager/non-owner-authority.
-- Actor: sales lain (bukan manager, bukan pemanggil owner inquiry).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_uuid_sales_lain uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_keep_id uuid; v_close_id uuid;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '1 day')
  RETURNING id INTO v_keep_id;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now())
  RETURNING id INTO v_close_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_lain::text, true);
  BEGIN
    PERFORM close_inquiry_as_duplicate(v_close_id, v_keep_id);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- sales lain (non-manager, non-owner) seharusnya ditolak';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- pesan: %', v_msg;
END $$;

-- =====================================================================
-- (f1) Close as Duplicate -- rantai ditolak: kept yang diajukan SUDAH
-- menjadi duplikat inquiry lain.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_a uuid; v_b uuid; v_c uuid;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_manager);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- A (tertua) <- B (duplikat A) <- coba jadikan B kept untuk C -- harus GAGAL.
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '3 days') RETURNING id INTO v_a;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '2 days') RETURNING id INTO v_b;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '1 day') RETURNING id INTO v_c;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM close_inquiry_as_duplicate(v_b, v_a); -- B jadi duplikat A, sah.

  BEGIN
    PERFORM close_inquiry_as_duplicate(v_c, v_b); -- B (sudah duplikat) coba jadi kept -- harus gagal.
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- menjadikan inquiry yang sudah duplikat sebagai kept seharusnya ditolak';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- pesan: %', v_msg;
END $$;

-- =====================================================================
-- (f2) Close as Duplicate -- rantai ditolak: inquiry yang mau ditutup
-- SEDANG menjadi acuan (kept) bagi duplikat lain.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_a uuid; v_b uuid; v_c uuid;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_manager);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- A (tertua, akan jadi kept B) -- lalu coba tutup A sebagai duplikat C.
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '3 days') RETURNING id INTO v_a;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '2 days') RETURNING id INTO v_b;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '4 days') RETURNING id INTO v_c;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM close_inquiry_as_duplicate(v_b, v_a); -- A kini "kept" bagi B.

  BEGIN
    PERFORM close_inquiry_as_duplicate(v_a, v_c); -- A (sedang jadi kept) coba ditutup -- harus gagal.
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- menutup inquiry yang sedang jadi acuan (kept) seharusnya ditolak';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- pesan: %', v_msg;
END $$;

-- =====================================================================
-- (g) Possible Duplicate -- deteksi menemukan pasangan lane+customer+
-- waktu yang cocok, dan TIDAK menemukan yang lane-nya berbeda.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_existing_id uuid; v_hits int;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, pol, pod, container_types, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, 'UJI-POL', 'UJI-POD', ARRAY['FCL 20'''], now() - interval '3 days')
  RETURNING id INTO v_existing_id;

  SELECT count(*) INTO v_hits FROM find_possible_duplicate_inquiries(
    v_company_id, v_account_id, 'UJI-POL', 'UJI-POD', ARRAY['FCL 20'''], NULL);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL -- lane sama seharusnya ditemukan 1, dapat %', v_hits;
  END IF;

  SELECT count(*) INTO v_hits FROM find_possible_duplicate_inquiries(
    v_company_id, v_account_id, 'UJI-POL-LAIN', 'UJI-POD', ARRAY['FCL 20'''], NULL);
  IF v_hits <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL -- lane berbeda seharusnya nol hasil, dapat %', v_hits;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (h) Penomoran bekerja TANPA LOGIN -- role postgres, auth.uid() NULL.
-- JANGAN set_config/SET LOCAL ROLE di blok ini -- itu justru yang diuji.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_id uuid; v_no text;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner)
  RETURNING id, inquiry_no INTO v_id, v_no;

  IF v_no IS NULL OR v_no = 'X' OR v_no !~ '-INQ-' THEN
    RAISE EXCEPTION 'UJI GAGAL -- insert tanpa login tidak mendapat nomor format baru: %', v_no;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- nomor tanpa login: %', v_no;
END $$;

-- =====================================================================
-- (i) UPDATE langsung ke duplicate_of_id (bukan lewat RPC) ditolak --
-- bahkan oleh owner inquiri itu sendiri (yang lolos RLS inquiries_update).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_a uuid; v_b uuid;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '1 day') RETURNING id INTO v_a;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now()) RETURNING id INTO v_b;

  BEGIN
    UPDATE inquiries SET duplicate_of_id = v_a WHERE id = v_b; -- owner, lolos RLS -- tapi trigger guard harus menolak.
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- UPDATE langsung ke duplicate_of_id seharusnya ditolak trigger guard';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- pesan: %', v_msg;
END $$;

-- =====================================================================
-- (j) Close as Duplicate -- kept LEBIH MUDA dari yang ditutup ditolak.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_older uuid; v_younger uuid;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_manager);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now() - interval '5 days') RETURNING id INTO v_older;
  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id, created_at)
  VALUES (v_company_id, 'X', v_account_id, 'OPEN', v_uuid_sales_owner, now()) RETURNING id INTO v_younger;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  BEGIN
    -- v_younger diajukan sbg KEPT untuk v_older yang lebih tua -- harus gagal.
    PERFORM close_inquiry_as_duplicate(v_older, v_younger);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- kept yang lebih muda dari yang ditutup seharusnya ditolak';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- pesan: %', v_msg;
END $$;

-- =====================================================================
-- (k) find_possible_duplicate_inquiries dengan p_company_id entitas lain
-- (bukan entitas aktif pemanggil) ditolak.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_other_company_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_sales_lain uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_dummy int;
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_lain);
  v_other_company_id := (SELECT id FROM companies WHERE id <> v_company_id LIMIT 1);
  IF v_other_company_id IS NULL THEN
    RAISE EXCEPTION 'UJI TIDAK BISA DIJALANKAN -- butuh minimal 2 baris companies untuk uji ini';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_lain::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    SELECT count(*) INTO v_dummy FROM find_possible_duplicate_inquiries(
      v_other_company_id, gen_random_uuid(), 'X', 'X', ARRAY[]::text[], NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- mencari possible-duplicate di entitas lain seharusnya ditolak';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- pesan: %', v_msg;
END $$;

-- =============================================================================
-- CATATAN: uji "insert bersamaan tidak menghasilkan duplikat" SENGAJA TIDAK
-- ditulis sebagai blok terpisah -- dua koneksi paralel sungguhan tidak bisa
-- direproduksi dalam satu skrip SQL Editor linear. Keamanannya berasal dari
-- UPDATE...RETURNING / INSERT...ON CONFLICT DO UPDATE di assign_inquiry_no()
-- (identik badan increment_document_sequence() yang sudah dipakai produksi
-- bertahun-tahun) -- UPDATE baris document_sequences mengunci baris itu
-- untuk transaksi lain sampai commit, sehingga dua INSERT ke inquiries yang
-- benar-benar berbarengan akan berurutan (serialized) pada baris counter
-- yang sama, bukan balapan membaca nilai yang sama.
-- =============================================================================
