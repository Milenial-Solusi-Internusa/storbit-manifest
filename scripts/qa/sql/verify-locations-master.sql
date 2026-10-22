-- =============================================================================
-- Skrip uji transaksi-aman untuk Inquiry Management Irisan 6 (tabel
-- `locations` + RLS/GRANT, migrasi 20261023000001; FK inquiries.pol_
-- location_id/pod_location_id, migrasi 20261023000002; find_possible_
-- duplicate_inquiries versi ID lokasi, migrasi 20261023000003; RPC
-- request_new_location, migrasi 20261023000004). TIDAK DIJALANKAN oleh
-- siapa pun di sesi penulisan ini -- hanya ditulis untuk Mas eksekusi
-- manual di staging SESUDAH keempat migrasi jalan, dalam urutan itu.
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri (bukan di-select-all sekaligus satu transaksi
-- besar). Setiap blok SELALU berakhir RAISE EXCEPTION, baik lulus ("UJI
-- LULUS (dibatalkan sengaja)") maupun gagal ("UJI GAGAL -- ..."), jadi nol
-- baris tersisa di DB dalam KEDUA kasus. Pola identik verify-inquiry-
-- numbering-and-duplicate.sql / verify-inquiry-won-revert.sql.
--
-- Identitas akun uji staging (semuanya perusahaan MSI, dikonfirmasi Den
-- untuk Irisan sebelumnya, dipakai ulang di sini):
--   manager (level 6)               : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (pemilik, non-manager)  : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (lain, non-manager)     : 6739c239-e2ff-48ff-97ed-23059f749218
-- Tidak ada UUID akun ber-role `viewer` di antara ketiga fixture di atas --
-- uji (f) "semua role termasuk viewer bisa SELECT" didemonstrasikan dengan
-- sales A/B (non-manager) membaca baris yang dibuat manager. Ini representatif
-- karena locations_select = USING(true), kebal peran apa pun (bukan daftar
-- role tertentu) -- kalau non-manager tanpa privilege istimewa pun bisa
-- membaca, viewer (privilege lebih rendah lagi) pasti juga bisa.
--
-- Dua kebutuhan sesi untuk blok yang memanggil RPC/menulis tabel RLS sebagai
-- akun TERTENTU:
--   1. set_config('request.jwt.claim.sub', <uuid>, true) -- auth.uid() resolve.
--   2. EXECUTE 'SET LOCAL ROLE authenticated' -- RLS (TO authenticated)
--      benar-benar dievaluasi; tanpa ini SQL Editor berjalan sebagai postgres
--      yang melewati RLS sepenuhnya.
-- Blok yang SENGAJA menguji "tanpa login" (uji i2) justru TIDAK memakai
-- kedua baris di atas -- itulah yang mau dibuktikan.
--
-- `notifications_read`/`locations_select` dkk ber-RLS `user_id = auth.uid()`
-- / tidak -- membaca notifikasi milik PENERIMA (bukan aktor yang memanggil
-- RPC) WAJIB sesudah `EXECUTE 'RESET ROLE'` (kembali ke postgres, melewati
-- RLS) -- lihat uji (i1).
--
-- Kode/nama lokasi uji dipagari prefiks `ZZTEST` + potongan gen_random_uuid()
-- supaya unik tiap kali dijalankan dan tidak pernah bertabrakan dengan data
-- asli -- sama konvensi `ZZZTEST-*` akun uji (lihat CLAUDE.md).
-- =============================================================================

-- =====================================================================
-- (a) Manager bisa INSERT lokasi; non-manager (sales) DITOLAK RLS.
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales   uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_code text := 'ZZTEST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_id uuid;
  v_caught boolean := false;
BEGIN
  -- Manager: sukses.
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.locations (code, name, country, type)
    VALUES (v_code, 'Uji Manager Insert', 'Indonesia', 'Seaport')
    RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- manager tidak bisa INSERT locations (seharusnya sukses)';
  END IF;
  RAISE NOTICE 'Manager insert sukses, id=%', v_id;

  -- Sales (non-manager): ditolak RLS.
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.locations (code, name, country, type)
      VALUES (v_code || 'B', 'Uji Sales Insert', 'Indonesia', 'Seaport');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE 'Sales insert ditolak, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- non-manager (sales) seharusnya DITOLAK insert locations tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (b) UPDATE toggle active oleh manager -- sukses, nilai benar-benar
-- berubah. Non-manager (sales) UPDATE ditolak RLS.
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales   uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_code text := 'ZZTEST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_id uuid;
  v_active boolean;
  v_caught boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.locations (code, name, country, type, active)
    VALUES (v_code, 'Uji Toggle Active', 'Indonesia', 'Airport', true)
    RETURNING id INTO v_id;

  UPDATE public.locations SET active = false WHERE id = v_id;
  SELECT active INTO v_active FROM public.locations WHERE id = v_id;
  IF v_active <> false THEN
    RAISE EXCEPTION 'UJI GAGAL -- toggle Deactivate tidak mengubah active jadi false';
  END IF;
  RAISE NOTICE 'Toggle manager sukses, active=%', v_active;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.locations SET active = true WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE 'Sales update ditolak, pesan: %', SQLERRM;
  END;
  -- RLS UPDATE tanpa izin bisa gagal DIAM (0 baris terkena, nol exception)
  -- ATAU melempar exception, bergantung bentuk policy -- keduanya sah
  -- sebagai "ditolak", jadi periksa DUA kemungkinan: exception TERTANGKAP,
  -- ATAU baris tetap TIDAK berubah.
  SELECT active INTO v_active FROM public.locations WHERE id = v_id;
  IF NOT v_caught AND v_active <> false THEN
    RAISE EXCEPTION 'UJI GAGAL -- non-manager (sales) seharusnya DITOLAK update locations tapi baris berubah';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (c) Code dipaksa UPPERCASE oleh trigger, dan duplikat beda huruf
-- besar/kecil DITOLAK (unique index locations_code_key dievaluasi SESUDAH
-- trigger menormalkan -- 'idtpp' dan 'IDTPP' jadi baris yang sama).
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_suffix text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_code_lower text;
  v_stored_code text;
  v_caught boolean := false;
BEGIN
  v_code_lower := lower('zztest' || v_suffix);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.locations (code, name, country, type)
    VALUES (v_code_lower, 'Uji Normalisasi Code', 'Indonesia', 'City')
    RETURNING code INTO v_stored_code;
  IF v_stored_code <> upper(v_code_lower) THEN
    RAISE EXCEPTION 'UJI GAGAL -- code tersimpan "%" (diharapkan UPPERCASE "%")', v_stored_code, upper(v_code_lower);
  END IF;
  RAISE NOTICE 'Code dikirim "%", tersimpan "%"', v_code_lower, v_stored_code;

  BEGIN
    INSERT INTO public.locations (code, name, country, type)
      VALUES (upper(v_code_lower), 'Uji Duplikat Code', 'Indonesia', 'City');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
    RAISE NOTICE 'Duplikat code (huruf beda) ditolak, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- code "%" (lower) vs "%" (UPPER) seharusnya dianggap duplikat tapi lolos', v_code_lower, upper(v_code_lower);
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (d) Type di luar 4 nilai kanonik (Seaport/Airport/City/FTZ) DITOLAK
-- CHECK constraint locations_type_check.
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_code text := 'ZZTEST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_caught boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.locations (code, name, country, type)
      VALUES (v_code, 'Uji Type Tidak Valid', 'Indonesia', 'Highway');
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
    RAISE NOTICE 'Type "Highway" ditolak CHECK, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- type "Highway" (di luar 4 nilai kanonik) seharusnya ditolak CHECK tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (e) Tidak ada policy DELETE -- DELETE oleh manager (atau role mana pun)
-- mengenai NOL baris (RLS default-deny untuk command tanpa policy, bukan
-- exception), baris tetap ada sesudahnya.
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_code text := 'ZZTEST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_id uuid;
  v_deleted_count int;
  v_still_exists boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.locations (code, name, country, type)
    VALUES (v_code, 'Uji Nol Delete Policy', 'Indonesia', 'FTZ')
    RETURNING id INTO v_id;

  DELETE FROM public.locations WHERE id = v_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  EXECUTE 'RESET ROLE';
  SELECT EXISTS(SELECT 1 FROM public.locations WHERE id = v_id) INTO v_still_exists;

  RAISE NOTICE 'DELETE terkena % baris, baris masih ada=%', v_deleted_count, v_still_exists;
  IF v_deleted_count <> 0 OR NOT v_still_exists THEN
    RAISE EXCEPTION 'UJI GAGAL -- DELETE seharusnya mengenai NOL baris (nol policy DELETE) tapi baris terhapus';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (f) Semua role (termasuk non-manager) bisa SELECT -- locations_select
-- = USING(true), kebal peran. Didemonstrasikan: manager insert, lalu
-- SALES (non-manager) membaca baris yang sama.
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_code text := 'ZZTEST' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_id uuid;
  v_seen_by_sales boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.locations (code, name, country, type)
    VALUES (v_code, 'Uji Select Lintas Role', 'Indonesia', 'Seaport')
    RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT EXISTS(SELECT 1 FROM public.locations WHERE id = v_id) INTO v_seen_by_sales;

  RAISE NOTICE 'Sales (non-manager) melihat baris manager=%', v_seen_by_sales;
  IF NOT v_seen_by_sales THEN
    RAISE EXCEPTION 'UJI GAGAL -- non-manager seharusnya bisa SELECT baris locations (USING(true)) tapi tidak terlihat';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (g) find_possible_duplicate_inquiries versi ID lokasi -- (g1) kedua ID
-- sama DITEMUKAN, (g2) salah satu ID pod BEDA TIDAK ditemukan, (g3) salah
-- satu parameter ID NULL -> NOL baris (tanpa fallback ke teks).
-- Fixture: 2 lokasi ad-hoc (manager) + 2 inquiry ad-hoc (sales pemilik,
-- company MSI, customer_id = akun aktif is_in_lead_pool=false AND
-- deleted_at IS NULL).
-- =====================================================================
DO $$
DECLARE
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales   uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_company_id uuid;
  v_customer_id uuid;
  v_loc_pol uuid;
  v_loc_pod_a uuid;
  v_loc_pod_b uuid;
  v_inq1 uuid;
  v_inq2 uuid;
  v_found_same int;
  v_found_diff int;
  v_found_null int;
BEGIN
  v_company_id := (SELECT company_id FROM public.profiles WHERE id = v_uuid_manager);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'UJI TIDAK BISA DIJALANKAN -- profiles.company_id manager fixture tidak ditemukan';
  END IF;
  v_customer_id := (
    SELECT id FROM public.accounts
     WHERE company_id = v_company_id AND deleted_at IS NULL AND is_in_lead_pool = false
     LIMIT 1
  );
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'UJI TIDAK BISA DIJALANKAN -- nol akun fixture (deleted_at IS NULL AND is_in_lead_pool=false) di company manager';
  END IF;

  -- Fixture lokasi (manager).
  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.locations (code, name, country, type)
    VALUES ('ZZTESTPOL' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4), 'Uji POL Dupcheck', 'Indonesia', 'Seaport')
    RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type)
    VALUES ('ZZTESTPDA' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4), 'Uji POD Dupcheck A', 'Indonesia', 'Seaport')
    RETURNING id INTO v_loc_pod_a;
  INSERT INTO public.locations (code, name, country, type)
    VALUES ('ZZTESTPDB' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4), 'Uji POD Dupcheck B', 'Indonesia', 'Seaport')
    RETURNING id INTO v_loc_pod_b;

  -- Fixture inquiry (sales pemilik) -- inq1 = pol/pod A, inq2 = pol/pod B.
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.inquiries (company_id, inquiry_no, customer_id, status, owner_id, pol_location_id, pod_location_id, container_types)
    VALUES (v_company_id, 'NILAI-AKAN-DIBUANG-1', v_customer_id, 'OPEN', v_uuid_sales, v_loc_pol, v_loc_pod_a, '{}')
    RETURNING id INTO v_inq1;
  INSERT INTO public.inquiries (company_id, inquiry_no, customer_id, status, owner_id, pol_location_id, pod_location_id, container_types)
    VALUES (v_company_id, 'NILAI-AKAN-DIBUANG-2', v_customer_id, 'OPEN', v_uuid_sales, v_loc_pol, v_loc_pod_b, '{}')
    RETURNING id INTO v_inq2;

  -- (g1) Query dengan pol/pod SAMA dgn inq1 -- harus menemukan inq1 (exclude dirinya sendiri lewat p_exclude_id NULL disini -- jadi kita exclude inq2 dan lihat apakah inq1 ketemu lewat parameter query yang IDENTIK pol/pod inq1).
  SELECT count(*) INTO v_found_same
    FROM public.find_possible_duplicate_inquiries(v_company_id, v_customer_id, v_loc_pol, v_loc_pod_a, '{}', v_inq2);
  IF v_found_same <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL -- pol/pod sama persis dgn inq1 seharusnya DITEMUKAN (1 baris), didapat %', v_found_same;
  END IF;
  RAISE NOTICE '(g1) pol/pod sama -> ditemukan % baris', v_found_same;

  -- (g2) Query dengan pod BEDA (v_loc_pod_b, bukan punya inq1) -- inq1 tidak boleh ikut ketemu lewat pembanding ini (akan cocok ke inq2 sendiri, exclude inq2 lewat p_exclude_id).
  SELECT count(*) INTO v_found_diff
    FROM public.find_possible_duplicate_inquiries(v_company_id, v_customer_id, v_loc_pol, v_loc_pod_b, '{}', v_inq2);
  IF v_found_diff <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL -- pod berbeda (dibandingkan ke diri sendiri, di-exclude) seharusnya NOL baris, didapat %', v_found_diff;
  END IF;
  RAISE NOTICE '(g2) pod beda (exclude diri sendiri) -> ditemukan % baris', v_found_diff;

  -- (g3) p_pod_location_id NULL -> NOL baris, tanpa fallback ke teks.
  SELECT count(*) INTO v_found_null
    FROM public.find_possible_duplicate_inquiries(v_company_id, v_customer_id, v_loc_pol, NULL, '{}', NULL);
  IF v_found_null <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL -- p_pod_location_id NULL seharusnya NOL baris (early return), didapat %', v_found_null;
  END IF;
  RAISE NOTICE '(g3) pod NULL -> ditemukan % baris', v_found_null;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (h) FK ke lokasi yang TIDAK ADA -- INSERT inquiries dgn pol_location_id
-- acak (bukan baris locations manapun) DITOLAK foreign_key_violation.
-- =====================================================================
DO $$
DECLARE
  v_uuid_sales uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_company_id uuid;
  v_customer_id uuid;
  v_fake_location_id uuid := gen_random_uuid(); -- hampir pasti bukan id locations asli
  v_caught boolean := false;
BEGIN
  v_company_id := (SELECT company_id FROM public.profiles WHERE id = v_uuid_sales);
  v_customer_id := (
    SELECT id FROM public.accounts
     WHERE company_id = v_company_id AND deleted_at IS NULL AND is_in_lead_pool = false
     LIMIT 1
  );
  IF v_company_id IS NULL OR v_customer_id IS NULL THEN
    RAISE EXCEPTION 'UJI TIDAK BISA DIJALANKAN -- company/account fixture tidak ditemukan';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.inquiries (company_id, inquiry_no, customer_id, status, owner_id, pol_location_id)
      VALUES (v_company_id, 'NILAI-AKAN-DIBUANG-FK', v_customer_id, 'OPEN', v_uuid_sales, v_fake_location_id);
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := true;
    RAISE NOTICE 'FK ke lokasi fiktif ditolak, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- pol_location_id acak (bukan locations.id asli) seharusnya ditolak FK tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (i1) request_new_location -- mengirim notifikasi ke manager-ke-atas
-- (termasuk manager fixture), company_id tiap baris = company PENERIMA.
-- Dibaca sesudah RESET ROLE (RLS notifications_read = user_id=auth.uid(),
-- aktor pengirim bukan pemiliknya).
-- =====================================================================
DO $$
DECLARE
  v_uuid_sales uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_uuid_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_marker text := 'ZZTESTLOC-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_notif_to_manager int;
  v_notif_company uuid;
  v_manager_company uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.request_new_location(v_marker, 'catatan uji otomatis');

  EXECUTE 'RESET ROLE';
  SELECT count(*), max(company_id) INTO v_notif_to_manager, v_notif_company
    FROM public.notifications
   WHERE user_id = v_uuid_manager
     AND event_type = 'location_requested'
     AND body LIKE '%' || v_marker || '%';
  v_manager_company := (SELECT company_id FROM public.profiles WHERE id = v_uuid_manager);

  RAISE NOTICE 'Notifikasi ke manager=%, company_id notifikasi=%, company_id manager=%', v_notif_to_manager, v_notif_company, v_manager_company;
  IF v_notif_to_manager <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL -- manager seharusnya menerima TEPAT 1 notifikasi location_requested, didapat %', v_notif_to_manager;
  END IF;
  IF v_notif_company IS DISTINCT FROM v_manager_company THEN
    RAISE EXCEPTION 'UJI GAGAL -- company_id notifikasi (%) seharusnya = company_id PENERIMA (%)', v_notif_company, v_manager_company;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (i2) request_new_location TANPA LOGIN (auth.uid() NULL) -- DITOLAK.
-- Sengaja TIDAK memanggil set_config/SET LOCAL ROLE -- itulah yang mau
-- dibuktikan (sesi SQL Editor polos, auth.uid() = NULL).
-- =====================================================================
DO $$
DECLARE
  v_caught boolean := false;
BEGIN
  BEGIN
    PERFORM public.request_new_location('Uji tanpa login', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE 'Panggilan tanpa login ditolak, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- request_new_location tanpa login (auth.uid() NULL) seharusnya ditolak tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;
