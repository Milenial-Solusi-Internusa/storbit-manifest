-- =============================================================================
-- Skrip uji transaksi-aman untuk Inquiry Management Putaran 4, Tahap 4A
-- (inquiry_lanes, migrasi 20261025000001; kolom baru inquiries, migrasi
-- 20261025000002; dropdown lane_mode/lane_unit, migrasi 20261025000003;
-- dropdown service_type/importer_of_record, migrasi 20261025000004; RPC
-- create_inquiry_with_lanes, migrasi 20261025000005). TIDAK DIJALANKAN oleh
-- siapa pun di sesi penulisan ini -- hanya ditulis untuk Vir eksekusi manual
-- di staging SESUDAH kelima migrasi jalan, dalam urutan nomornya.
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-3b.sql. Blok (k)/(n) murni introspeksi/idempotensi
-- -- RAISE EXCEPTION di akhirnya tidak membatalkan apa pun yang berarti,
-- dipertahankan hanya demi bentuk yang seragam.
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (angka yang dicek,
-- bukan hanya "OK"/"FAIL").
--
-- Fixture lokasi (locations) TIDAK ADA data seed di DB (migrasi
-- 20261023000001 sengaja tidak mengisinya) -- setiap blok yang butuh lane
-- membuat baris locations throwaway SENDIRI di dalam transaksinya, kode
-- unik per huruf uji supaya tidak bertabrakan kalau dua blok kebetulan
-- dijalankan berdekatan sebelum salah satu commit/rollback (locations_code_key
-- UNIQUE).
--
-- Identitas akun uji staging (semuanya perusahaan MSI, DIBERIKAN di
-- instruksi tugas -- dipakai ulang dari skrip Putaran 3):
--   manager/supervisor (level 6)    : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (non-manager)           : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (non-manager, lain)     : 6739c239-e2ff-48ff-97ed-23059f749218
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
-- company_id SOA = d2e5e565-5f67-4954-b8d9-5979a2a0c697 (CLAUDE.md) -- dipakai
-- di uji (h) sebagai "company lain"; user aktifnya dicari dinamis (lihat (h)).
-- =============================================================================


-- ===== (a) 1 lane -- inquiry + 1 baris inquiry_lanes, pol/pod/*_location_id
--           inquiries = lane utama =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_loc_pol uuid;
  v_loc_pod uuid;
  v_new_id  uuid;
  v_new_no  text;
  v_lane_count int;
  v_inq_pol text;
  v_inq_pod text;
  v_inq_pol_loc uuid;
  v_inq_pod_loc uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- nol akun fixture di company MSI';
  END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES
    ('ZZZTEST-A-POL', 'Uji Putaran4 A POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES
    ('ZZZTEST-A-POD', 'Uji Putaran4 A POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id   := v_company,
    p_prospect_id  := v_account,
    p_service_type := 'freight_forwarding',
    p_direction    := 'Export',
    p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object(
      'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
      'pol', 'Uji Putaran4 A POL', 'pod', 'Uji Putaran4 A POD',
      'mode', 'Sea LCL', 'load_unit', 'CBM'
    ))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  SELECT pol, pod, pol_location_id, pod_location_id INTO v_inq_pol, v_inq_pod, v_inq_pol_loc, v_inq_pod_loc
    FROM public.inquiries WHERE id = v_new_id;

  RAISE NOTICE '(a) inquiry %, lane_count=%, inquiries.pol=%/pod=%, pol_loc=%/pod_loc=%',
    v_new_no, v_lane_count, v_inq_pol, v_inq_pod, v_inq_pol_loc, v_inq_pod_loc;

  IF v_lane_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- seharusnya TEPAT 1 baris inquiry_lanes, dapat %', v_lane_count;
  END IF;
  IF v_inq_pol_loc IS DISTINCT FROM v_loc_pol OR v_inq_pod_loc IS DISTINCT FROM v_loc_pod THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- inquiries.pol_location_id/pod_location_id harus = lane utama';
  END IF;
  IF v_inq_pol IS DISTINCT FROM 'Uji Putaran4 A POL' OR v_inq_pod IS DISTINCT FROM 'Uji Putaran4 A POD' THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- inquiries.pol/pod teks harus = lane utama';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (a)';
END $$;


-- ===== (b) 3 lane -- 3 baris inquiry_lanes, inquiries.pol/pod tetap dari
--           lane sort_order=0 saja =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_new_id uuid; v_new_no text;
  v_lane_count int;
  v_inq_pol text; v_inq_pod text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (b) -- nol akun fixture'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-B-1', 'Uji B 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-B-2', 'Uji B 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-B-3', 'Uji B 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-B-4', 'Uji B 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji B 1', 'pod', 'Uji B 2', 'mode', 'Sea LCL', 'load_unit', 'CBM'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc2, 'pol', 'Uji B 3', 'pod', 'Uji B 2', 'mode', 'Sea FCL', 'load_unit', 'Container'),
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc4, 'pol', 'Uji B 1', 'pod', 'Uji B 4', 'mode', 'Air', 'load_unit', 'KG')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  SELECT pol, pod INTO v_inq_pol, v_inq_pod FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(b) lane_count=%, inquiries.pol=%/pod=% (harus = baris pertama "Uji B 1"/"Uji B 2")', v_lane_count, v_inq_pol, v_inq_pod;

  IF v_lane_count <> 3 THEN RAISE EXCEPTION 'UJI GAGAL (b) -- seharusnya TEPAT 3 baris, dapat %', v_lane_count; END IF;
  IF v_inq_pol <> 'Uji B 1' OR v_inq_pod <> 'Uji B 2' THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- inquiries.pol/pod harus dari lane pertama (sort_order=0), dapat %/%', v_inq_pol, v_inq_pod;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (b)';
END $$;


-- ===== (c) owner_id diisi ke kandidat valid oleh manager -- sukses =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_new_no text; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (c) -- nol akun fixture'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = v_sales_a AND ur.company_id = v_company AND ur.is_active = true
       AND r.code IN ('bd_sales_executive','bd_account_executive','bd_sales_spv_console','bd_sales_spv_forwarding','gm_bd')
  ) THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- fixture v_sales_a bukan kandidat OPERATIONAL_ROSTER_ROLES aktif di MSI, uji perlu diperbaiki';
  END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-C-1', 'Uji C 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-C-2', 'Uji C 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := v_sales_a,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji C 1', 'pod', 'Uji C 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(c) owner_id=% (harus = v_sales_a %)', v_owner, v_sales_a;
  IF v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- owner seharusnya v_sales_a, dapat %', COALESCE(v_owner::text, '<NULL>');
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (c)';
END $$;


-- ===== (d) owner_id diisi ke kandidat TIDAK valid (manager itu sendiri,
--           role di luar OPERATIONAL_ROSTER_ROLES) -- exception =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (d) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-D-1', 'Uji D 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-D-2', 'Uji D 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := v_manager, -- manager, bukan OPERATIONAL_ROSTER_ROLES
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji D 1', 'pod', 'Uji D 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(d) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- seharusnya ditolak (owner bukan kandidat OPERATIONAL_ROSTER_ROLES)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (d)';
END $$;


-- ===== (e) owner_id NULL (dari manager) -- sukses, Unassigned =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (e) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-E-1', 'Uji E 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-E-2', 'Uji E 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := NULL,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji E 1', 'pod', 'Uji E 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(e) owner_id=% (harus NULL)', COALESCE(v_owner::text, '<NULL>');
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (e) -- owner seharusnya NULL, dapat %', v_owner; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (e)';
END $$;


-- ===== (f) akun is_in_lead_pool=true dipakai sebagai prospect_id --
--           exception trigger trg_block_inquiry_for_pooled_account =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_pooled_account uuid;
  v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  -- Akun throwaway sendiri -- tidak bergantung ada/tidaknya akun pooled existing.
  INSERT INTO public.accounts (company_id, name, is_in_lead_pool, lifecycle_stage)
    VALUES (v_company, 'ZZZTEST Pooled Account (f)', true, 'lead')
    RETURNING id INTO v_pooled_account;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-F-1', 'Uji F 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-F-2', 'Uji F 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_pooled_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji F 1', 'pod', 'Uji F 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(f) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (f) -- seharusnya ditolak trg_block_inquiry_for_pooled_account';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (f)';
END $$;


-- ===== (g) n_containers/cargo_ready_date tersimpan dan terbaca balik =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_n_containers int; v_cargo_ready date;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (g) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-G-1', 'Uji G 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-G-2', 'Uji G 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_n_containers := 3, p_cargo_ready_date := '2026-12-01'::date,
    p_container_types := ARRAY['FCL 20'],
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji G 1', 'pod', 'Uji G 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT n_containers, cargo_ready_date INTO v_n_containers, v_cargo_ready FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(g) n_containers=%, cargo_ready_date=%', v_n_containers, v_cargo_ready;
  IF v_n_containers <> 3 OR v_cargo_ready <> '2026-12-01'::date THEN
    RAISE EXCEPTION 'UJI GAGAL (g) -- nilai tidak cocok';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (g)';
END $$;


-- ===== (h) RLS: user company LAIN (SOA) coba SELECT inquiry_lanes milik
--           inquiry company MSI -- nol baris =====
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_other_user uuid;
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_count int;
BEGIN
  SELECT ur.user_id INTO v_other_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND ur.user_id NOT IN (v_sales_a) -- pastikan bukan fixture MSI yg kebetulan juga di SOA
   LIMIT 1;
  IF v_other_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- nol user fixture aktif di company SOA, uji perlu akun lain';
  END IF;

  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (h) -- nol akun fixture MSI'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-H-1', 'Uji H 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-H-2', 'Uji H 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji H 1', 'pod', 'Uji H 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(h) user SOA % melihat % baris lane milik inquiry MSI (harus 0)', v_other_user, v_count;
  IF v_count <> 0 THEN RAISE EXCEPTION 'UJI GAGAL (h) -- seharusnya 0 baris, dapat %', v_count; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (h)';
END $$;


-- ===== (i) Sales (non-manager) memanggil RPC dengan p_owner_id = user LAIN
--           -- tersimpan owner_id = auth.uid() milik Sales itu sendiri,
--           BUKAN nilai yang dikirim (membuktikan paksaan §F.2, bukan sekadar
--           tolak) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (i) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-I-1', 'Uji I 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-I-2', 'Uji I 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true); -- caller = sales_a (non-manager)
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_owner_id := v_sales_b, -- sales_a mencoba mengirim owner = sales_b
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji I 1', 'pod', 'Uji I 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(i) owner_id=% (harus = sales_a %, BUKAN sales_b %, meski dikirim)', v_owner, v_sales_a, v_sales_b;
  IF v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- owner seharusnya DIPAKSA sales_a, dapat %', COALESCE(v_owner::text, '<NULL>');
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (i)';
END $$;


-- ===== (j) Manager memanggil dengan p_owner_id = NULL -- sukses, Unassigned
--           (duplikat uji (e) dengan framing berbeda -- manager EKSPLISIT
--           memilih "Leave unassigned", bukan non-manager yang tak punya
--           kontrol ini sama sekali) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (j) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-J-1', 'Uji J 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-J-2', 'Uji J 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'customs',
    p_direction := 'Export', p_customer_role := 'Consignee', p_owner_id := NULL,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji J 1', 'pod', 'Uji J 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(j) manager memilih Unassigned -- owner_id=% (harus NULL)', COALESCE(v_owner::text, '<NULL>');
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (j) -- owner seharusnya NULL, dapat %', v_owner; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (j)';
END $$;


-- ===== (k) Whitelist -- fungsi TIDAK PUNYA parameter utk status/inquiry_no/
--           created_by/duplicate_of_id/customer_id, DAN baris yang
--           dihasilkan selalu status='OPEN', created_by=caller, customer_id
--           NULL (introspeksi signature + assersi hasil) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_new_no text;
  v_args text;
  v_status text; v_created_by uuid; v_customer_id uuid;
BEGIN
  SELECT pg_get_function_arguments(p.oid) INTO v_args
    FROM pg_proc p WHERE p.proname = 'create_inquiry_with_lanes';
  RAISE NOTICE '(k) signature: %', v_args;
  IF v_args ~* 'p_status|p_inquiry_no|p_created_by|p_duplicate_of_id|p_customer_id\b' THEN
    RAISE EXCEPTION 'UJI GAGAL (k) -- signature MEMUAT parameter yang seharusnya tidak ada';
  END IF;

  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (k) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K-1', 'Uji K 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K-2', 'Uji K 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji K 1', 'pod', 'Uji K 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT status, created_by, customer_id INTO v_status, v_created_by, v_customer_id FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(k) inquiry_no=%, status=%, created_by=% (harus sales_a), customer_id=% (harus NULL)', v_new_no, v_status, v_created_by, COALESCE(v_customer_id::text,'<NULL>');
  IF v_status <> 'OPEN' THEN RAISE EXCEPTION 'UJI GAGAL (k) -- status seharusnya OPEN, dapat %', v_status; END IF;
  IF v_created_by IS DISTINCT FROM v_sales_a THEN RAISE EXCEPTION 'UJI GAGAL (k) -- created_by seharusnya caller, dapat %', v_created_by; END IF;
  IF v_customer_id IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (k) -- customer_id seharusnya NULL'; END IF;
  IF v_new_no IS NULL OR v_new_no NOT LIKE '%-INQ-%' THEN RAISE EXCEPTION 'UJI GAGAL (k) -- inquiry_no tidak berformat otoritatif, dapat %', v_new_no; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (k)';
END $$;


-- ===== (l) inquiry_type='Rate Sheet Request' dengan validity_from/to/
--           monthly_volume_cbm NULL -- exception dari RPC sebelum CHECK DB
--           terpanggil =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (l) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-L-1', 'Uji L 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-L-2', 'Uji L 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_inquiry_type := 'Rate Sheet Request', -- validity_from/to/monthly_volume_cbm SEMUANYA NULL (default)
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji L 1', 'pod', 'Uji L 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(l) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (l) -- seharusnya ditolak (validity/volume kosong)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (l)';
END $$;


-- ===== (m) undername_import=true (kondisi Import+Customs terpenuhi,
--           importer_of_record+duties_and_taxes valid) TAPI
--           supporting_docs_received=false -- ditolak CHECK DB
--           inquiries_undername_docs_check =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (m) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-M-1', 'Uji M 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-M-2', 'Uji M 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'customs',
      p_direction := 'Import', p_customer_role := 'Consignee',
      p_undername_import := true,
      p_importer_of_record := 'PT Mitra Niaga Sejahtera',
      p_duties_and_taxes := 'Included in price',
      p_supporting_docs_received := false, -- SENGAJA false
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji M 1', 'pod', 'Uji M 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(m) ditolak sesuai ekspektasi (CHECK inquiries_undername_docs_check): %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (m) -- seharusnya ditolak CHECK inquiries_undername_docs_check'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (m)';
END $$;


-- ===== (n) Idempotensi seed service_type -- re-run INSERT migrasi
--           20261025000004, nol baris tambahan =====
DO $$
DECLARE
  v_before int;
  v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.dropdown_options WHERE list_key = 'service_type' AND company_id IS NULL;

  INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
    ('crm', 'service_type', 'Freight Forwarding',  'freight_forwarding', 1, NULL),
    ('crm', 'service_type', 'Customs Clearance',   'customs',            2, NULL),
    ('crm', 'service_type', 'Door to Door',        'door_to_door',       3, NULL),
    ('crm', 'service_type', 'Trucking',            'trucking',           4, NULL),
    ('crm', 'service_type', 'General Trading',     'trading',            5, NULL),
    ('crm', 'service_type', 'Warehousing',         'warehousing',        6, NULL)
  ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

  SELECT count(*) INTO v_after FROM public.dropdown_options WHERE list_key = 'service_type' AND company_id IS NULL;
  RAISE NOTICE '(n) service_type baris sebelum=%, sesudah re-run seed=% (harus SAMA)', v_before, v_after;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'UJI GAGAL (n) -- seed BUKAN idempoten, baris bertambah % -> %', v_before, v_after;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja, nol baris benar2 berubah) (n)';
END $$;


-- ===== (o) Sales B (company SAMA, bukan owner/manager/procurement-ber-PRF)
--           TIDAK bisa SELECT lane dari inquiry milik Sales A; manager BISA
--           -- membuktikan inquiry_lanes_read mereplika inquiries_read
--           (owner/manager/procurement), bukan company-scope polos =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_count_b int; v_count_mgr int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (o) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-O-1', 'Uji O 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-O-2', 'Uji O 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true); -- owner = sales_a (caller, non-manager)
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji O 1', 'pod', 'Uji O 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  -- Sales B: company sama, bukan owner, bukan manager, bukan procurement-ber-PRF.
  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count_b FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  EXECUTE 'RESET ROLE';

  -- Manager: is_manager_or_above() -> selalu lolos, company sama.
  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count_mgr FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(o) sales_b melihat % baris (harus 0), manager melihat % baris (harus 1)', v_count_b, v_count_mgr;
  IF v_count_b <> 0 THEN RAISE EXCEPTION 'UJI GAGAL (o) -- sales_b seharusnya 0 baris, dapat %', v_count_b; END IF;
  IF v_count_mgr <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (o) -- manager seharusnya 1 baris, dapat %', v_count_mgr; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (o)';
END $$;


-- ===== (p) direction='Export' dengan undername_import=true dari klien --
--           tersimpan undername_import=false dan klaster NULL (koreksi 3a --
--           kondisi mensyaratkan Import, Export saja sudah menggugurkannya
--           apa pun service_type-nya) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid;
  v_under boolean; v_ior text; v_duties text; v_docs boolean;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (p) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P-1', 'Uji P 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P-2', 'Uji P 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'customs',
    p_direction := 'Export', -- BUKAN Import
    p_customer_role := 'Consignee',
    p_undername_import := true, -- klien mencoba memaksa true
    p_importer_of_record := 'PT Mitra Niaga Sejahtera',
    p_duties_and_taxes := 'Included in price',
    p_supporting_docs_received := true,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji P 1', 'pod', 'Uji P 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT undername_import, importer_of_record, duties_and_taxes, supporting_docs_received
    INTO v_under, v_ior, v_duties, v_docs FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(p) undername_import=% (harus false), importer_of_record=% (harus NULL), duties_and_taxes=% (harus NULL), supporting_docs_received=% (harus false)',
    v_under, COALESCE(v_ior,'<NULL>'), COALESCE(v_duties,'<NULL>'), v_docs;

  IF v_under <> false OR v_ior IS NOT NULL OR v_duties IS NOT NULL OR v_docs <> false THEN
    RAISE EXCEPTION 'UJI GAGAL (p) -- klaster undername seharusnya dinormalisasi kosong untuk direction=Export';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (p)';
END $$;


-- ===== (q) importer_of_record di luar dropdown_options aktif -- exception =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (q) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Q-1', 'Uji Q 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Q-2', 'Uji Q 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'customs',
      p_direction := 'Import', p_customer_role := 'Consignee',
      p_undername_import := true,
      p_importer_of_record := 'PT Tidak Terdaftar Di Dropdown',
      p_duties_and_taxes := 'Included in price', p_supporting_docs_received := true,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji Q 1', 'pod', 'Uji Q 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(q) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (q) -- seharusnya ditolak (importer_of_record tidak ada di dropdown_options)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (q)';
END $$;


-- ===== (r) inquiry_type='Rate Sheet Request' dengan container_types
--           terisi -- tersimpan kosong (koreksi 3c) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_cont text[]; v_inco text[]; v_ncont int; v_cargo date; v_pickup text; v_delivery text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (r) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-R-1', 'Uji R 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-R-2', 'Uji R 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-11-01'::date, p_validity_to := '2027-01-31'::date, p_monthly_volume_cbm := 20,
    p_container_types := ARRAY['FCL 20'], -- SENGAJA diisi, seharusnya dinormalisasi kosong
    p_incoterms := ARRAY['FOB'], p_n_containers := 2, p_cargo_ready_date := '2026-11-15'::date,
    p_pickup_address := 'Jl. Uji R', p_delivery_address := 'Jl. Uji R Tujuan',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji R 1', 'pod', 'Uji R 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT container_types, incoterms, n_containers, cargo_ready_date, pickup_address, delivery_address
    INTO v_cont, v_inco, v_ncont, v_cargo, v_pickup, v_delivery
    FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(r) container_types=% incoterms=% n_containers=% cargo_ready_date=% pickup=% delivery=% (SEMUA harus NULL)',
    v_cont, v_inco, v_ncont, v_cargo, v_pickup, v_delivery;

  IF v_cont IS NOT NULL OR v_inco IS NOT NULL OR v_ncont IS NOT NULL OR v_cargo IS NOT NULL
     OR v_pickup IS NOT NULL OR v_delivery IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (r) -- field Single-Shipment-only seharusnya dinormalisasi NULL untuk Rate Sheet Request';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (r)';
END $$;


-- ===== (s) authenticated TIDAK bisa INSERT langsung ke inquiry_lanes
--           (ditolak -- nol GRANT INSERT, nol policy INSERT) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_fake_inquiry uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (s) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-S-1', 'Uji S 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-S-2', 'Uji S 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  -- Inquiry nyata dulu (lewat RPC, sah) supaya FK inquiry_id valid --
  -- percobaan yang diuji adalah INSERT LANGSUNG ke inquiry_lanes, bukan ini.
  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_fake_inquiry FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji S 1', 'pod', 'Uji S 2'))
  ) AS t;

  BEGIN
    INSERT INTO public.inquiry_lanes (inquiry_id, sort_order, pol_location_id, pod_location_id, pol, pod)
      VALUES (v_fake_inquiry, 99, v_loc1, v_loc2, 'Langsung', 'Ditolak');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(s) INSERT langsung ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (s) -- INSERT langsung ke inquiry_lanes seharusnya DITOLAK (nol GRANT/policy INSERT)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (s)';
END $$;
