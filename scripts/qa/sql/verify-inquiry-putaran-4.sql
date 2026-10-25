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
--   super admin (ZZZTEST Admin)     : d730c348-ceab-463d-bc3b-458126314373
--     -- BARU di blok (x)-(ll) (ronde "Lane Editor") -- fixed, BUKAN dicari
--     -- dinamis seperti (o)/(u); dipakai apa adanya sesuai yang diberikan.
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
-- company_id SOA = d2e5e565-5f67-4954-b8d9-5979a2a0c697 (CLAUDE.md) -- dipakai
-- di uji (h) sebagai "company lain"; user aktifnya dicari dinamis (lihat (h)).
--
-- Lokasi REAL (bukan throwaway ZZZTEST-*) DIBERIKAN untuk blok (ll) --
-- khusus mensimulasikan inquiry LAMA (pra-Putaran 4A) yang alamat POL/PODnya
-- sudah menunjuk ke master data lokasi sungguhan, bukan baris uji:
--   IDJKT (Jakarta, Seaport)  : 6997148d-4603-4401-ac1f-c3a9ef780b34
--   SGSIN (Singapore, Seaport): 1ab1059b-2fa3-48c0-b26d-1c206a614348
-- =============================================================================
--
-- =============================================================================
-- RONDE "LANE EDITOR" -- uji RPC update_inquiry_lanes (migrasi 20261025000006)
-- Blok (x)-(ll), 15 skenario. Pola/konvensi IDENTIK blok (a)-(w) di atas
-- (DO-block self-rollback, SET LOCAL ROLE authenticated + set_config
-- request.jwt.claim.sub, RAISE EXCEPTION 'UJI LULUS/GAGAL (<huruf>)').
-- Dijalankan Vir di staging SESUDAH migrasi 20261025000006 jalan, sebagai
-- bagian TAHAP A ronde Lane Editor (sebelum TAHAP B/kode FE dimulai).
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
  -- Koreksi Mas (gagal palsu ditemukan di blok (bb)/(ii)): LIMIT 1 tanpa
  -- ORDER BY + hanya NOT IN (v_sales_a) bisa memilih user yang KEBETULAN
  -- juga super admin atau punya peran aktif di MSI (mis. ZZZTEST Admin) --
  -- user semacam itu akan LOLOS gerbang company/peran, membuat uji "harus
  -- ditolak/harus 0 baris" ini gagal untuk alasan yang salah. Sekarang:
  -- aktif di SOA, NOL peran aktif di MSI mana pun, NOL role super_admin
  -- aktif, ORDER BY user_id supaya hasilnya deterministik antar-run.
  SELECT ur.user_id INTO v_other_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_msi
        WHERE ur_msi.user_id = ur.user_id AND ur_msi.company_id = v_company_msi AND ur_msi.is_active = true
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_other_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- nol user fixture aktif di company SOA TANPA peran MSI/super_admin, uji perlu akun lain';
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
--           TIDAK bisa SELECT lane dari inquiry milik Sales A; manager BISA;
--           super admin BISA -- membuktikan inquiry_lanes_read (EXISTS
--           POLOS ke inquiries, tanpa AND apa pun -- koreksi Den/Vir)
--           mewarisi RLS inquiries_read milik pemanggil lewat CASCADING,
--           bukan replika kondisi yang disalin manual =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_super_admin uuid;
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_count_b int; v_count_mgr int; v_count_super int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (o) -- nol akun fixture'; END IF;

  SELECT ur.user_id INTO v_super_admin
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE r.code = 'super_admin' AND ur.is_active = true AND r.deleted_at IS NULL
   LIMIT 1;
  IF v_super_admin IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (o) -- nol user fixture ber-role super_admin aktif, uji perlu akun lain';
  END IF;

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
  -- Terhalang lewat RLS inquiries_read milik sales_b sendiri (cascading dari
  -- EXISTS polos, bukan AND eksplisit di policy inquiry_lanes_read).
  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count_b FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  EXECUTE 'RESET ROLE';

  -- Manager: inquiries_read mengizinkan lewat is_manager_or_above(), company sama.
  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count_mgr FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  EXECUTE 'RESET ROLE';

  -- Super admin: inquiries_read mengizinkan lewat is_super_admin(), lintas-company.
  PERFORM set_config('request.jwt.claim.sub', v_super_admin::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count_super FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(o) sales_b melihat % baris (harus 0), manager melihat % baris (harus 1), super_admin melihat % baris (harus 1)',
    v_count_b, v_count_mgr, v_count_super;
  IF v_count_b <> 0 THEN RAISE EXCEPTION 'UJI GAGAL (o) -- sales_b seharusnya 0 baris, dapat %', v_count_b; END IF;
  IF v_count_mgr <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (o) -- manager seharusnya 1 baris, dapat %', v_count_mgr; END IF;
  IF v_count_super <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (o) -- super_admin seharusnya 1 baris, dapat %', v_count_super; END IF;

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


-- =============================================================================
-- Tambahan sesudah review Vir -- perbaikan RPC migrasi 20261025000005
-- (NULL-safety undername, gerbang manager super_admin, validasi
-- service_type, lane pol/pod='' ) -- (t)-(w).
-- =============================================================================


-- ===== (t) p_direction NULL dengan undername_import=true + IOR/duties/
--           docs lengkap, service customs -- tersimpan undername_import=
--           false dan klaster NULL (koreksi 1 -- sebelumnya BYPASS diam-diam
--           karena NOT(NULL AND true)=NULL) =====
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
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (t) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-T-1', 'Uji T 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-T-2', 'Uji T 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'customs',
    p_direction := NULL, -- SENGAJA NULL, bukan 'Export'/'Import'
    p_customer_role := 'Consignee',
    p_undername_import := true,
    p_importer_of_record := 'PT Mitra Niaga Sejahtera',
    p_duties_and_taxes := 'Included in price',
    p_supporting_docs_received := true,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji T 1', 'pod', 'Uji T 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT undername_import, importer_of_record, duties_and_taxes, supporting_docs_received
    INTO v_under, v_ior, v_duties, v_docs FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(t) direction NULL -- undername_import=% (harus false), importer_of_record=% (harus NULL), duties_and_taxes=% (harus NULL), supporting_docs_received=% (harus false)',
    v_under, COALESCE(v_ior,'<NULL>'), COALESCE(v_duties,'<NULL>'), v_docs;

  IF v_under <> false OR v_ior IS NOT NULL OR v_duties IS NOT NULL OR v_docs <> false THEN
    RAISE EXCEPTION 'UJI GAGAL (t) -- klaster undername seharusnya dinormalisasi kosong untuk direction NULL (bug NOT(NULL AND..)=NULL seharusnya sudah diperbaiki)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (t)';
END $$;


-- ===== (u) Caller super_admin TANPA baris user_roles aktif di company
--           target -- p_owner_id=NULL -> Unassigned; p_owner_id=kandidat
--           valid -> owner_id=kandidat itu (koreksi 2 -- sebelumnya
--           is_manager_or_above_in SAJA bisa false utk super_admin
--           semacam ini, memaksanya owner_id=auth.uid() milik dirinya
--           sendiri) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_super_no_role uuid;
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_new_id uuid; v_owner uuid;
BEGIN
  -- Fixture dicari DINAMIS: super_admin aktif TANPA satu pun baris
  -- user_roles aktif di company MSI. Kalau tidak ada, blok ini mencatat
  -- "TIDAK TERUJI" dengan jelas (RAISE NOTICE + RAISE EXCEPTION berlabel
  -- beda) -- bukan lulus palsu.
  SELECT ur.user_id INTO v_super_no_role
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE r.code = 'super_admin' AND ur.is_active = true AND r.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = ur.user_id AND ur2.company_id = v_company AND ur2.is_active = true
     )
   LIMIT 1;

  IF v_super_no_role IS NULL THEN
    RAISE NOTICE '(u) TIDAK TERUJI -- nol fixture super_admin aktif yang benar2 tanpa baris user_roles aktif di company MSI di staging hari ini. Uji ini TIDAK membuktikan apa pun, bukan lulus.';
    RAISE EXCEPTION 'UJI TIDAK TERUJI (dibatalkan, nol baris ditulis) (u)';
  END IF;

  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (u) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-U-1', 'Uji U 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-U-2', 'Uji U 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-U-3', 'Uji U 3', 'Singapore', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-U-4', 'Uji U 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  -- Skenario 1: p_owner_id = NULL -> Unassigned.
  PERFORM set_config('request.jwt.claim.sub', v_super_no_role::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := NULL,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji U 1', 'pod', 'Uji U 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';
  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(u.1) super_admin tanpa role di MSI, p_owner_id=NULL -> owner_id=% (harus NULL)', COALESCE(v_owner::text, '<NULL>');
  IF v_owner IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (u.1) -- owner seharusnya NULL (Unassigned), dapat % -- is_manager_or_above_in SAJA mungkin masih dipakai', v_owner;
  END IF;

  -- Skenario 2: p_owner_id = kandidat valid (sales_a) -> owner_id=sales_a.
  PERFORM set_config('request.jwt.claim.sub', v_super_no_role::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := v_sales_a,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji U 3', 'pod', 'Uji U 4'))
  ) AS t;
  EXECUTE 'RESET ROLE';
  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(u.2) super_admin tanpa role di MSI, p_owner_id=sales_a -> owner_id=% (harus = sales_a %)', v_owner, v_sales_a;
  IF v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (u.2) -- owner seharusnya sales_a, dapat % -- super_admin seharusnya dianggap manager di entitas manapun', COALESCE(v_owner::text, '<NULL>');
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (u)';
END $$;


-- ===== (v) p_service_type = 'xyz_tidak_ada' -- exception (koreksi 3) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (v) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-V-1', 'Uji V 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-V-2', 'Uji V 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'xyz_tidak_ada',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji V 1', 'pod', 'Uji V 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(v) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (v) -- seharusnya ditolak (service_type tidak ada di dropdown_options)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (v)';
END $$;


-- ===== (w) lane dengan pol_location_id='' -- exception ramah (koreksi 4,
--           BUKAN error cast uuid mentah) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc2 uuid;
  v_caught boolean := false;
  v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (w) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-W-2', 'Uji W 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', '', 'pod_location_id', v_loc2, 'pol', 'Uji W 1', 'pod', 'Uji W 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
    RAISE NOTICE '(w) ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (w) -- seharusnya ditolak (pol_location_id string kosong)'; END IF;
  IF v_msg ILIKE '%invalid input syntax for type uuid%' THEN
    RAISE EXCEPTION 'UJI GAGAL (w) -- ditolak TAPI dengan error cast uuid MENTAH (%), bukan pesan ramah -- perbaikan NULLIF belum efektif', v_msg;
  END IF;
  IF v_msg NOT ILIKE '%Port of Loading%' THEN
    RAISE EXCEPTION 'UJI GAGAL (w) -- pesan error tidak sesuai ekspektasi ("Setiap lane wajib punya Port of Loading..."), dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (w)';
END $$;


-- ===== (x) Owner (non-manager) update lane inquiry miliknya sendiri --
--           sukses, replace-all, inquiries.pol/pod/*_location_id mengikuti
--           lane PERTAMA baru =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_inq_no text;
  v_ret_id uuid; v_ret_no text;
  v_lane_count int;
  v_inq_pol text; v_inq_pod text; v_inq_pol_loc uuid; v_inq_pod_loc uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (x) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-X-1', 'Uji X 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-X-2', 'Uji X 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-X-3', 'Uji X 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-X-4', 'Uji X 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_inq_id, v_inq_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji X 1', 'pod', 'Uji X 2'))
  ) AS t;

  -- Edit: lane BERBEDA total -- membuktikan replace-all + mirror ikut berubah.
  SELECT t.id, t.inquiry_no INTO v_ret_id, v_ret_no FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji X 3', 'pod', 'Uji X 4', 'mode', 'Sea FCL', 'load_unit', 'Container')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;
  SELECT pol, pod, pol_location_id, pod_location_id INTO v_inq_pol, v_inq_pod, v_inq_pol_loc, v_inq_pod_loc
    FROM public.inquiries WHERE id = v_inq_id;

  RAISE NOTICE '(x) inquiry %, lane_count=%, inquiries.pol=%/pod=%, pol_loc=%/pod_loc=% (harus Uji X 3/X 4, %/%)',
    v_inq_no, v_lane_count, v_inq_pol, v_inq_pod, v_inq_pol_loc, v_inq_pod_loc, v_loc3, v_loc4;

  IF v_ret_id IS DISTINCT FROM v_inq_id OR v_ret_no IS DISTINCT FROM v_inq_no THEN
    RAISE EXCEPTION 'UJI GAGAL (x) -- RETURN QUERY tidak mengembalikan id/inquiry_no yang benar';
  END IF;
  IF v_lane_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (x) -- seharusnya TEPAT 1 baris lane sesudah replace-all, dapat %', v_lane_count; END IF;
  IF v_inq_pol_loc IS DISTINCT FROM v_loc3 OR v_inq_pod_loc IS DISTINCT FROM v_loc4 THEN
    RAISE EXCEPTION 'UJI GAGAL (x) -- mirror pol_location_id/pod_location_id harus mengikuti lane BARU';
  END IF;
  IF v_inq_pol IS DISTINCT FROM 'Uji X 3' OR v_inq_pod IS DISTINCT FROM 'Uji X 4' THEN
    RAISE EXCEPTION 'UJI GAGAL (x) -- mirror pol/pod teks harus mengikuti lane BARU';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (x)';
END $$;


-- ===== (y) Manager (BUKAN owner) di entitas sama -- sukses mengedit lane
--           inquiry milik sales_a =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_lane_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (y) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Y-1', 'Uji Y 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Y-2', 'Uji Y 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Y-3', 'Uji Y 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Y-4', 'Uji Y 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true); -- owner = sales_a
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji Y 1', 'pod', 'Uji Y 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true); -- caller = manager, BUKAN owner
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji Y 3', 'pod', 'Uji Y 4'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id AND pol_location_id = v_loc3;
  RAISE NOTICE '(y) manager (bukan owner) berhasil edit -- lane ber-pol_location_id baru ditemukan: %', v_lane_count;
  IF v_lane_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (y) -- manager seharusnya berhasil mengedit lane inquiry yang bukan miliknya'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (y)';
END $$;


-- ===== (z) Super admin (ZZZTEST Admin, fixed) -- sukses mengedit lane
--           inquiry siapa pun, terlepas dari owner/peran di entitas itu =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_super   uuid := 'd730c348-ceab-463d-bc3b-458126314373';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_lane_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (z) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Z-1', 'Uji Z 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Z-2', 'Uji Z 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Z-3', 'Uji Z 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-Z-4', 'Uji Z 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji Z 1', 'pod', 'Uji Z 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji Z 3', 'pod', 'Uji Z 4'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id AND pol_location_id = v_loc3;
  RAISE NOTICE '(z) super admin berhasil edit -- lane ber-pol_location_id baru ditemukan: %', v_lane_count;
  IF v_lane_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (z) -- super admin seharusnya SELALU berhasil mengedit lane'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (z)';
END $$;


-- ===== (aa) Sales B (BUKAN owner, BUKAN manager) -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (aa) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-AA-1', 'Uji AA 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-AA-2', 'Uji AA 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-AA-3', 'Uji AA 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-AA-4', 'Uji AA 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji AA 1', 'pod', 'Uji AA 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.update_inquiry_lanes(
      p_inquiry_id := v_inq_id,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji AA 3', 'pod', 'Uji AA 4'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
    RAISE NOTICE '(aa) ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (aa) -- sales_b seharusnya DITOLAK (bukan owner, bukan manager)'; END IF;
  IF v_msg NOT ILIKE '%berhak%' THEN
    RAISE EXCEPTION 'UJI GAGAL (aa) -- pesan error tidak sesuai ekspektasi (gerbang peran), dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (aa)';
END $$;


-- ===== (bb) User dari company LAIN sama sekali (SOA) -- DITOLAK di gerbang
--            company, SEBELUM sempat sampai gerbang peran (pola dinamis
--            sama dengan (h)) =====
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_other_user uuid;
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_caught boolean := false; v_msg text;
BEGIN
  -- Koreksi Mas -- pola sama (h), lihat komentar di sana: LIMIT 1 tanpa
  -- ORDER BY + hanya NOT IN (v_sales_a) bisa memilih user yang KEBETULAN
  -- juga super admin atau punya peran aktif di MSI, membuat uji "harus
  -- DITOLAK di gerbang company" ini gagal palsu (user semacam itu justru
  -- LOLOS gerbang).
  SELECT ur.user_id INTO v_other_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_msi
        WHERE ur_msi.user_id = ur.user_id AND ur_msi.company_id = v_company_msi AND ur_msi.is_active = true
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_other_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (bb) -- nol user fixture aktif di company SOA TANPA peran MSI/super_admin, uji perlu akun lain';
  END IF;

  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (bb) -- nol akun fixture MSI'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-BB-1', 'Uji BB 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-BB-2', 'Uji BB 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-BB-3', 'Uji BB 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-BB-4', 'Uji BB 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji BB 1', 'pod', 'Uji BB 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.update_inquiry_lanes(
      p_inquiry_id := v_inq_id,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji BB 3', 'pod', 'Uji BB 4'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
    RAISE NOTICE '(bb) ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (bb) -- user company SOA seharusnya DITOLAK di gerbang company'; END IF;
  IF v_msg NOT ILIKE '%peran aktif%' THEN
    RAISE EXCEPTION 'UJI GAGAL (bb) -- pesan error tidak sesuai ekspektasi (gerbang company), dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (bb)';
END $$;


-- ===== (cc) Reorder (tukar lane 0 <-> lane 1) -- inquiries.pol/pod mengikuti
--            lane 0 yang BARU (lane yang SEBELUMNYA ada di posisi 1) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_locA uuid; v_locB uuid; v_locC uuid; v_locD uuid;
  v_inq_id uuid;
  v_inq_pol text; v_inq_pod text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (cc) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-CC-A', 'Uji CC A', 'Singapore', 'Seaport') RETURNING id INTO v_locA;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-CC-B', 'Uji CC B', 'Indonesia', 'Seaport') RETURNING id INTO v_locB;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-CC-C', 'Uji CC C', 'Malaysia', 'Seaport') RETURNING id INTO v_locC;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-CC-D', 'Uji CC D', 'Indonesia', 'Seaport') RETURNING id INTO v_locD;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- lane 0 = A->B, lane 1 = C->D.
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_locA, 'pod_location_id', v_locB, 'pol', 'Uji CC A', 'pod', 'Uji CC B'),
      jsonb_build_object('pol_location_id', v_locC, 'pod_location_id', v_locD, 'pol', 'Uji CC C', 'pod', 'Uji CC D')
    )
  ) AS t;

  -- Kirim ULANG lane yang SAMA ISINYA, tapi urutan DITUKAR -- lane C->D
  -- sekarang indeks 0.
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_locC, 'pod_location_id', v_locD, 'pol', 'Uji CC C', 'pod', 'Uji CC D'),
      jsonb_build_object('pol_location_id', v_locA, 'pod_location_id', v_locB, 'pol', 'Uji CC A', 'pod', 'Uji CC B')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT pol, pod INTO v_inq_pol, v_inq_pod FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(cc) sesudah reorder, inquiries.pol=%/pod=% (harus "Uji CC C"/"Uji CC D" -- lane yang SEBELUMNYA di posisi 1)', v_inq_pol, v_inq_pod;
  IF v_inq_pol IS DISTINCT FROM 'Uji CC C' OR v_inq_pod IS DISTINCT FROM 'Uji CC D' THEN
    RAISE EXCEPTION 'UJI GAGAL (cc) -- mirror harus mengikuti lane 0 BARU (yang tadinya lane 1), dapat %/%', v_inq_pol, v_inq_pod;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (cc)';
END $$;


-- ===== (dd) Hapus lane sampai tersisa 1 -- sukses; kirim array KOSONG --
--            DITOLAK ("Minimal 1 lane") =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid; v_loc5 uuid; v_loc6 uuid;
  v_inq_id uuid; v_lane_count int;
  v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (dd) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-DD-1', 'Uji DD 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-DD-2', 'Uji DD 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-DD-3', 'Uji DD 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-DD-4', 'Uji DD 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-DD-5', 'Uji DD 5', 'Singapore', 'Seaport') RETURNING id INTO v_loc5;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-DD-6', 'Uji DD 6', 'Indonesia', 'Seaport') RETURNING id INTO v_loc6;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji DD 1', 'pod', 'Uji DD 2'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji DD 3', 'pod', 'Uji DD 4'),
      jsonb_build_object('pol_location_id', v_loc5, 'pod_location_id', v_loc6, 'pol', 'Uji DD 5', 'pod', 'Uji DD 6')
    )
  ) AS t;

  -- Turunkan ke 1 lane -- sukses.
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji DD 1', 'pod', 'Uji DD 2'))
  ) AS t;
  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;
  RAISE NOTICE '(dd.1) turun ke 1 lane -- lane_count=% (harus 1)', v_lane_count;
  IF v_lane_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (dd.1) -- seharusnya TEPAT 1 baris sesudah hapus 2, dapat %', v_lane_count; END IF;

  -- Turunkan ke 0 (array kosong) -- DITOLAK.
  BEGIN
    PERFORM t.id FROM public.update_inquiry_lanes(p_inquiry_id := v_inq_id, p_lanes := '[]'::jsonb) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
    RAISE NOTICE '(dd.2) array kosong ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (dd.2) -- array lane kosong seharusnya DITOLAK'; END IF;
  IF v_msg NOT ILIKE '%Minimal 1 lane%' THEN
    RAISE EXCEPTION 'UJI GAGAL (dd.2) -- pesan error tidak sesuai ekspektasi, dapat: %', v_msg;
  END IF;
  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;
  IF v_lane_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (dd.2) -- percobaan yang ditolak TIDAK BOLEH mengubah apa pun, lane_count sekarang % (harus tetap 1)', v_lane_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (dd)';
END $$;


-- ===== (ee) Lane tanpa pol_location_id/pod_location_id (termasuk string
--            kosong '') -- DITOLAK, pesan ramah (pola sama (w)) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_inq_id uuid; v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (ee) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-EE-1', 'Uji EE 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-EE-2', 'Uji EE 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji EE 1', 'pod', 'Uji EE 2'))
  ) AS t;

  -- pod_location_id string kosong -- harus ditolak pesan RAMAH, bukan error cast uuid mentah.
  BEGIN
    PERFORM t.id FROM public.update_inquiry_lanes(
      p_inquiry_id := v_inq_id,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', '', 'pol', 'Uji EE 1', 'pod', 'Uji EE 3'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
    RAISE NOTICE '(ee) ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (ee) -- pod_location_id kosong seharusnya DITOLAK'; END IF;
  IF v_msg ILIKE '%invalid input syntax for type uuid%' THEN
    RAISE EXCEPTION 'UJI GAGAL (ee) -- ditolak TAPI dengan error cast uuid MENTAH (%), bukan pesan ramah', v_msg;
  END IF;
  IF v_msg NOT ILIKE '%Port of Loading%' THEN
    RAISE EXCEPTION 'UJI GAGAL (ee) -- pesan error tidak sesuai ekspektasi, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (ee)';
END $$;


-- ===== (ff) Update pada inquiry berstatus CANCELLED -- DITOLAK di gerbang
--            status (LOSABLE_INQUIRY_STATUS) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (ff) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-FF-1', 'Uji FF 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-FF-2', 'Uji FF 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-FF-3', 'Uji FF 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-FF-4', 'Uji FF 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji FF 1', 'pod', 'Uji FF 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  -- Setup fixture: paksa status CANCELLED langsung (sesi ini, di luar
  -- impersonasi, setara superuser -- BUKAN bagian yang diuji). Kalau
  -- trigger trg_z_stamp_inquiry_closure menolak transisi ini karena
  -- prasyarat yang belum terpenuhi, blok ini gagal di titik SETUP, bukan
  -- di assertion -- laporkan apa adanya ke Vir, jangan ditebak.
  UPDATE public.inquiries SET status = 'CANCELLED' WHERE id = v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.update_inquiry_lanes(
      p_inquiry_id := v_inq_id,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji FF 3', 'pod', 'Uji FF 4'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
    RAISE NOTICE '(ff) ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (ff) -- inquiry CANCELLED seharusnya DITOLAK'; END IF;
  IF v_msg NOT ILIKE '%CANCELLED%' THEN
    RAISE EXCEPTION 'UJI GAGAL (ff) -- pesan error tidak menyebut status CANCELLED, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (ff)';
END $$;


-- ===== (gg) Kirim ulang lane set yang PERSIS SAMA (no-op) -- sukses TANPA
--            menambah baris audit_logs baru, TANPA mengubah inquiry_lanes =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid;
  v_audit_before int; v_audit_after int;
  v_lane_ids_before uuid[]; v_lane_ids_after uuid[];
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (gg) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-GG-1', 'Uji GG 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-GG-2', 'Uji GG 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-GG-3', 'Uji GG 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-GG-4', 'Uji GG 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji GG 1', 'pod', 'Uji GG 2', 'via', 'Uji GG Via', 'mode', 'Sea LCL', 'load_unit', 'CBM'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji GG 3', 'pod', 'Uji GG 4', 'mode', 'Sea FCL', 'load_unit', 'Container')
    )
  ) AS t;

  SELECT count(*) INTO v_audit_before FROM public.audit_logs WHERE entity_id = v_inq_id AND action = 'UPDATE_INQUIRY_LANES';
  SELECT array_agg(id ORDER BY sort_order) INTO v_lane_ids_before FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;

  -- Kirim ULANG lane PERSIS SAMA (isi + urutan) -- harus kena no-op guard.
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji GG 1', 'pod', 'Uji GG 2', 'via', 'Uji GG Via', 'mode', 'Sea LCL', 'load_unit', 'CBM'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji GG 3', 'pod', 'Uji GG 4', 'mode', 'Sea FCL', 'load_unit', 'Container')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_audit_after FROM public.audit_logs WHERE entity_id = v_inq_id AND action = 'UPDATE_INQUIRY_LANES';
  SELECT array_agg(id ORDER BY sort_order) INTO v_lane_ids_after FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;

  RAISE NOTICE '(gg) audit sebelum=%/sesudah=% (harus sama), lane id sebelum=% sesudah=% (harus IDENTIK -- replace-all TIDAK dipicu)',
    v_audit_before, v_audit_after, v_lane_ids_before, v_lane_ids_after;

  IF v_audit_after <> v_audit_before THEN
    RAISE EXCEPTION 'UJI GAGAL (gg) -- no-op seharusnya TIDAK menambah baris audit_logs, sebelum=% sesudah=%', v_audit_before, v_audit_after;
  END IF;
  IF v_lane_ids_after IS DISTINCT FROM v_lane_ids_before THEN
    RAISE EXCEPTION 'UJI GAGAL (gg) -- no-op seharusnya TIDAK mengganti baris inquiry_lanes (id lane harus tetap sama)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (gg)';
END $$;


-- ===== (hh) Audit -- baris audit_logs action='UPDATE_INQUIRY_LANES' punya
--            old_data/new_data yang BENAR mencerminkan lane lama/baru =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_inq_no text;
  v_old_pol text; v_new_pol text;
  v_audit_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (hh) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-HH-1', 'Uji HH 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-HH-2', 'Uji HH 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-HH-3', 'Uji HH 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-HH-4', 'Uji HH 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_inq_id, v_inq_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji HH 1', 'pod', 'Uji HH 2'))
  ) AS t;

  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji HH 3', 'pod', 'Uji HH 4'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE entity_id = v_inq_id AND entity_type = 'INQUIRY' AND action = 'UPDATE_INQUIRY_LANES';
  SELECT old_data->'lanes'->0->>'pol', new_data->'lanes'->0->>'pol'
    INTO v_old_pol, v_new_pol
    FROM public.audit_logs
   WHERE entity_id = v_inq_id AND action = 'UPDATE_INQUIRY_LANES'
   ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE '(hh) baris audit=% (harus 1), entity_label vs inquiry_no=%, old_data.lanes[0].pol=% (harus "Uji HH 1"), new_data.lanes[0].pol=% (harus "Uji HH 3")',
    v_audit_count, v_inq_no, v_old_pol, v_new_pol;

  IF v_audit_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (hh) -- seharusnya TEPAT 1 baris audit, dapat %', v_audit_count; END IF;
  IF v_old_pol IS DISTINCT FROM 'Uji HH 1' THEN RAISE EXCEPTION 'UJI GAGAL (hh) -- old_data.lanes[0].pol salah, dapat %', v_old_pol; END IF;
  IF v_new_pol IS DISTINCT FROM 'Uji HH 3' THEN RAISE EXCEPTION 'UJI GAGAL (hh) -- new_data.lanes[0].pol salah, dapat %', v_new_pol; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (hh)';
END $$;


-- ===== (ii) RLS regresi-guard: user company LAIN (SOA) TETAP cuma bisa
--            SELECT (0 baris terlihat) sesudah lane diedit lewat RPC --
--            update_inquiry_lanes TIDAK membuka celah baca baru =====
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_other_user uuid;
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_count int;
BEGIN
  -- Koreksi Mas -- pola sama (h)/(bb): LIMIT 1 tanpa ORDER BY + hanya
  -- NOT IN (v_sales_a) bisa memilih user yang kebetulan juga super admin
  -- atau punya peran aktif di MSI, membuat uji "RLS tetap 0 baris" ini
  -- gagal palsu.
  SELECT ur.user_id INTO v_other_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_msi
        WHERE ur_msi.user_id = ur.user_id AND ur_msi.company_id = v_company_msi AND ur_msi.is_active = true
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_other_user IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (ii) -- nol user fixture aktif di company SOA TANPA peran MSI/super_admin'; END IF;

  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (ii) -- nol akun fixture MSI'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-II-1', 'Uji II 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-II-2', 'Uji II 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-II-3', 'Uji II 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-II-4', 'Uji II 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji II 1', 'pod', 'Uji II 2'))
  ) AS t;
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji II 3', 'pod', 'Uji II 4'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(ii) user SOA % melihat % baris lane SESUDAH edit (harus tetap 0)', v_other_user, v_count;
  IF v_count <> 0 THEN RAISE EXCEPTION 'UJI GAGAL (ii) -- seharusnya 0 baris, dapat % -- RLS inquiry_lanes_read mungkin ikut tersentuh regresi', v_count; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (ii)';
END $$;


-- ===== (jj) [K1] Sales B (BUKAN owner, BUKAN manager) pada inquiry yang
--            owner_id-nya NULL -- DITOLAK. Regresi-guard untuk bug NULL-
--            safety: SEBELUM perbaikan COALESCE, `v_owner_id = auth.uid()`
--            saat v_owner_id NULL menghasilkan NULL, `NOT(false OR NULL OR
--            false)` = NULL, `IF NULL THEN` TIDAK dieksekusi -- gerbang
--            akan TERLEWATI DIAM-DIAM. Blok ini BERNILAI hanya kalau ia
--            GAGAL di kode yang belum diperbaiki dan LULUS di kode yang
--            sudah =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_owner uuid;
  v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (jj) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-JJ-1', 'Uji JJ 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-JJ-2', 'Uji JJ 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-JJ-3', 'Uji JJ 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-JJ-4', 'Uji JJ 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  -- Manager membuat inquiry dengan p_owner_id eksplisit NULL (pola sama (e)/(j)).
  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := NULL,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji JJ 1', 'pod', 'Uji JJ 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (jj) -- fixture salah, owner_id seharusnya NULL, dapat %', v_owner; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true); -- bukan owner (owner NULL), bukan manager
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.update_inquiry_lanes(
      p_inquiry_id := v_inq_id,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji JJ 3', 'pod', 'Uji JJ 4'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
    RAISE NOTICE '(jj) ditolak: %', v_msg;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (jj) -- sales_b seharusnya DITOLAK pada inquiry ber-owner_id NULL -- BUG NULL-SAFETY (COALESCE) BELUM/TIDAK EFEKTIF';
  END IF;
  IF v_msg NOT ILIKE '%berhak%' THEN
    RAISE EXCEPTION 'UJI GAGAL (jj) -- pesan error tidak sesuai ekspektasi (gerbang peran), dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (jj)';
END $$;


-- ===== (kk) [K1] Manager pada inquiry yang owner_id-nya NULL -- SUKSES
--            (lewat is_manager_or_above_in, terlepas dari owner_id NULL) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_inq_id uuid; v_owner uuid; v_lane_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (kk) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-KK-1', 'Uji KK 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-KK-2', 'Uji KK 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-KK-3', 'Uji KK 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-KK-4', 'Uji KK 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_owner_id := NULL,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji KK 1', 'pod', 'Uji KK 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (kk) -- fixture salah, owner_id seharusnya NULL, dapat %', v_owner; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji KK 3', 'pod', 'Uji KK 4'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id AND pol_location_id = v_loc3;
  RAISE NOTICE '(kk) manager berhasil edit inquiry ber-owner_id NULL -- lane baru ditemukan: %', v_lane_count;
  IF v_lane_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (kk) -- manager seharusnya berhasil mengedit lane inquiry ber-owner_id NULL'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (kk)';
END $$;


-- ===== (ll) Inquiry LAMA (0 baris inquiry_lanes, pol/pod diisi langsung
--            tanpa lewat create_inquiry_with_lanes -- simulasi inquiry
--            pra-Putaran 4A) -- update_inquiry_lanes SUKSES menulis lane
--            pertama kalinya, mirror ikut berubah. Memakai lokasi REAL
--            (SGSIN/IDJKT, header skrip) untuk pol/pod ASLI inquiry lama
--            itu, dan lokasi throwaway untuk lane yang BARU ditulis --
--            supaya "sebelum" vs "sesudah" jelas berbeda sumbernya =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_loc_sgsin uuid := '1ab1059b-2fa3-48c0-b26d-1c206a614348';
  v_loc_idjkt uuid := '6997148d-4603-4401-ac1f-c3a9ef780b34';
  v_account uuid; v_loc_new1 uuid; v_loc_new2 uuid;
  v_legacy_id uuid; v_legacy_no text;
  v_lane_count_before int; v_lane_count_after int;
  v_inq_pol text; v_inq_pod text; v_inq_pol_loc uuid; v_inq_pod_loc uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (ll) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-LL-1', 'Uji LL 1', 'Malaysia', 'Seaport') RETURNING id INTO v_loc_new1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-LL-2', 'Uji LL 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_new2;

  -- Fixture "inquiry lama" -- INSERT LANGSUNG ke inquiries (BUKAN lewat
  -- create_inquiry_with_lanes, yang SELALU mensyaratkan minimal 1 lane --
  -- pra-Putaran 4A inquiry tidak lewat jalur itu sama sekali), di luar
  -- impersonasi (setara superuser, bukan bagian yang diuji). NOL baris
  -- inquiry_lanes ditulis untuk inquiry ini.
  INSERT INTO public.inquiries (
    company_id, prospect_id, service_type, direction, customer_role,
    pol, pod, pol_location_id, pod_location_id,
    status, created_by, owner_id
  ) VALUES (
    v_company, v_account, 'freight_forwarding', 'Export', 'Shipper',
    'Singapore', 'Jakarta', v_loc_sgsin, v_loc_idjkt,
    'OPEN', v_sales_a, v_sales_a
  ) RETURNING id, inquiry_no INTO v_legacy_id, v_legacy_no;

  SELECT count(*) INTO v_lane_count_before FROM public.inquiry_lanes WHERE inquiry_id = v_legacy_id;
  RAISE NOTICE '(ll) fixture inquiry lama % -- lane_count AWAL=% (harus 0)', v_legacy_no, v_lane_count_before;
  IF v_lane_count_before <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (ll) -- fixture salah, inquiry lama seharusnya 0 baris inquiry_lanes, dapat %', v_lane_count_before;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true); -- owner (dari INSERT langsung di atas)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_legacy_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_new1, 'pod_location_id', v_loc_new2, 'pol', 'Uji LL 1', 'pod', 'Uji LL 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count_after FROM public.inquiry_lanes WHERE inquiry_id = v_legacy_id;
  SELECT pol, pod, pol_location_id, pod_location_id INTO v_inq_pol, v_inq_pod, v_inq_pol_loc, v_inq_pod_loc
    FROM public.inquiries WHERE id = v_legacy_id;

  RAISE NOTICE '(ll) sesudah update -- lane_count=% (harus 1), mirror pol=%/pod=% pol_loc=%/pod_loc=% (harus "Uji LL 1"/"Uji LL 2", %/%, BUKAN lagi Singapore/Jakarta/%/%)',
    v_lane_count_after, v_inq_pol, v_inq_pod, v_inq_pol_loc, v_inq_pod_loc, v_loc_new1, v_loc_new2, v_loc_sgsin, v_loc_idjkt;

  IF v_lane_count_after <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (ll) -- seharusnya TEPAT 1 baris lane sesudah update inquiry lama, dapat %', v_lane_count_after; END IF;
  IF v_inq_pol_loc IS DISTINCT FROM v_loc_new1 OR v_inq_pod_loc IS DISTINCT FROM v_loc_new2 THEN
    RAISE EXCEPTION 'UJI GAGAL (ll) -- mirror pol_location_id/pod_location_id harus mengikuti lane BARU, BUKAN lagi SGSIN/IDJKT lama';
  END IF;
  IF v_inq_pol IS DISTINCT FROM 'Uji LL 1' OR v_inq_pod IS DISTINCT FROM 'Uji LL 2' THEN
    RAISE EXCEPTION 'UJI GAGAL (ll) -- mirror pol/pod teks harus mengikuti lane BARU';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (ll)';
END $$;


-- =============================================================================
-- PUTARAN 4 TAHAP 4C -- mode "Rate Sheet Request" di Intake Form wizard.
-- Blok (mm)-(uu), 9 skenario. TAHAP A SAJA (verifikasi perilaku yang SUDAH
-- LIVE -- kolom inquiries.inquiry_type/validity_from/validity_to/
-- monthly_volume_cbm + parameter RPC create_inquiry_with_lanes yang sama
-- SUDAH dibangun lengkap sejak Tahap 4A, migrasi 20261025000002/000005.
-- NOL migrasi baru ditulis untuk 4C -- blok di bawah membuktikan perilaku
-- yang sudah ada, bukan perilaku baru). Pola/konvensi IDENTIK blok-blok di
-- atas (DO-block self-rollback, SET LOCAL ROLE authenticated + set_config
-- request.jwt.claim.sub, RAISE EXCEPTION 'UJI LULUS/GAGAL (<label>)').
-- Dijalankan Vir di staging; TAHAP B (kode FE wizard + DealDetailPage +
-- src/kit/LaneTable.jsx) menunggu lampu hijau dari hasil ini.
-- =============================================================================


-- ===== (mm) [4C] inquiry_type='Rate Sheet Request' valid -- validity_from/
--            to + monthly_volume_cbm tersimpan, 2 lane tersimpan, mirror
--            pol/pod = lane pertama =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid;
  v_new_id uuid; v_new_no text;
  v_lane_count int;
  v_itype text; v_vfrom date; v_vto date; v_volm numeric;
  v_inq_pol text; v_inq_pod text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (mm) -- nol akun fixture'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-MM-1', 'Uji MM 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-MM-2', 'Uji MM 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-MM-3', 'Uji MM 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-MM-4', 'Uji MM 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji MM 1', 'pod', 'Uji MM 2', 'mode', 'Sea LCL', 'load_unit', 'CBM'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji MM 3', 'pod', 'Uji MM 4', 'mode', 'Sea LCL', 'load_unit', 'CBM')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  SELECT inquiry_type, validity_from, validity_to, monthly_volume_cbm, pol, pod
    INTO v_itype, v_vfrom, v_vto, v_volm, v_inq_pol, v_inq_pod
    FROM public.inquiries WHERE id = v_new_id;

  RAISE NOTICE '(mm) inquiry %, inquiry_type=%, validity=%..%  monthly_volume_cbm=%, lane_count=%, mirror pol=%/pod=%',
    v_new_no, v_itype, v_vfrom, v_vto, v_volm, v_lane_count, v_inq_pol, v_inq_pod;

  IF v_itype <> 'Rate Sheet Request' THEN RAISE EXCEPTION 'UJI GAGAL (mm) -- inquiry_type seharusnya Rate Sheet Request, dapat %', v_itype; END IF;
  IF v_vfrom <> '2026-12-01'::date OR v_vto <> '2027-02-28'::date THEN RAISE EXCEPTION 'UJI GAGAL (mm) -- validity_from/to tidak cocok'; END IF;
  IF v_volm <> 15 THEN RAISE EXCEPTION 'UJI GAGAL (mm) -- monthly_volume_cbm tidak cocok, dapat %', v_volm; END IF;
  IF v_lane_count <> 2 THEN RAISE EXCEPTION 'UJI GAGAL (mm) -- seharusnya TEPAT 2 baris inquiry_lanes, dapat %', v_lane_count; END IF;
  IF v_inq_pol <> 'Uji MM 1' OR v_inq_pod <> 'Uji MM 2' THEN RAISE EXCEPTION 'UJI GAGAL (mm) -- mirror pol/pod harus dari lane pertama'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (mm)';
END $$;


-- ===== (nn) [4C] Rate Sheet Request -- HANYA validity_from NULL (validity_to
--            dan monthly_volume_cbm terisi valid) -- exception. Melengkapi
--            blok (l) yang menguji ketiganya NULL sekaligus; ini mengisolasi
--            syarat validity_from sendirian =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (nn) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-NN-1', 'Uji NN 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-NN-2', 'Uji NN 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_inquiry_type := 'Rate Sheet Request',
      p_validity_from := NULL, -- SENGAJA hanya ini yang NULL
      p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji NN 1', 'pod', 'Uji NN 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(nn) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (nn) -- seharusnya ditolak (validity_from NULL)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (nn)';
END $$;


-- ===== (oo) [4C] Rate Sheet Request -- validity_to < validity_from (keduanya
--            terisi, urutan terbalik) -- exception =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (oo) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-OO-1', 'Uji OO 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-OO-2', 'Uji OO 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_inquiry_type := 'Rate Sheet Request',
      p_validity_from := '2027-02-28'::date, p_validity_to := '2026-12-01'::date, -- SENGAJA terbalik
      p_monthly_volume_cbm := 15,
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji OO 1', 'pod', 'Uji OO 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(oo) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (oo) -- seharusnya ditolak (validity_to < validity_from)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (oo)';
END $$;


-- ===== (pp) [4C] Rate Sheet Request -- monthly_volume_cbm = 0 (validity
--            terisi valid) -- exception. NULL murni sudah tercakup blok (l);
--            ini mengisolasi syarat "> 0" =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_caught boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (pp) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-PP-1', 'Uji PP 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-PP-2', 'Uji PP 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_inquiry_type := 'Rate Sheet Request',
      p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date,
      p_monthly_volume_cbm := 0, -- SENGAJA 0, bukan NULL (NULL murni sudah blok (l))
      p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji PP 1', 'pod', 'Uji PP 2'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(pp) ditolak sesuai ekspektasi: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL (pp) -- seharusnya ditolak (monthly_volume_cbm <= 0)'; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (pp)';
END $$;


-- ===== (qq) [4C] Rate Sheet Request -- p_lanes dikirim SUDAH pra-disaring
--            jadi 1 elemen (simulasi FE memfilter lane ber-checkbox "Use"
--            yang TIDAK dicentang SEBELUM memanggil RPC, lihat rencana
--            src/kit/LaneTable.jsx prop showUseColumn di TAHAP B) -- sukses,
--            tepat 1 baris lane. RPC TIDAK punya dan TIDAK PERLU kolom/
--            parameter "Use" apa pun -- yang dilihatnya hanya array final
--            yang sudah bersih, persis seperti inquiry 1-lane biasa =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid; v_lane_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (qq) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-QQ-1', 'Uji QQ 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-QQ-2', 'Uji QQ 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji QQ 1', 'pod', 'Uji QQ 2', 'mode', 'Sea LCL', 'load_unit', 'CBM')
    ) -- array sudah 1 elemen -- seolah FE awalnya punya 2 lane lalu 1 di-uncheck
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  RAISE NOTICE '(qq) lane_count=% (harus 1 -- RPC menerima array yang sudah difilter FE apa adanya)', v_lane_count;
  IF v_lane_count <> 1 THEN RAISE EXCEPTION 'UJI GAGAL (qq) -- seharusnya TEPAT 1 baris, dapat %', v_lane_count; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (qq)';
END $$;


-- ===== (rr) [4C] Edit langsung (simulasi saveInquirySection, BUKAN RPC) --
--            UPDATE inquiries SET validity_from = NULL pada inquiry Rate
--            Sheet Request yang sudah ada -- DITOLAK oleh constraint
--            inquiries_rate_sheet_fields_check (pengaman DB, dipakai Detail
--            Inquiry TANPA RPC baru -- Keputusan Vir Q3). Caller = sales_a =
--            owner inquiry, LOLOS RLS inquiries_update (owner boleh UPDATE
--            barisnya sendiri -- pola sama 6 section lain DealDetailPage),
--            jadi satu-satunya yang menolak WAJIB constraint CHECK level
--            tabel, bukan RLS -- diverifikasi via SQLSTATE 23514
--            (check_violation), bukan hanya "tertangkap exception apa pun" =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid;
  v_caught boolean := false;
  v_sqlstate text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (rr) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-RR-1', 'Uji RR 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-RR-2', 'Uji RR 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji RR 1', 'pod', 'Uji RR 2'))
  ) AS t;

  BEGIN
    UPDATE public.inquiries SET validity_from = NULL WHERE id = v_new_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_sqlstate := SQLSTATE;
    RAISE NOTICE '(rr) UPDATE langsung ditolak -- SQLSTATE=%, pesan: %', SQLSTATE, SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (rr) -- UPDATE langsung yang mengosongkan validity_from pada inquiry Rate Sheet Request seharusnya DITOLAK';
  END IF;
  IF v_sqlstate <> '23514' THEN
    RAISE EXCEPTION 'UJI GAGAL (rr) -- ditolak TAPI BUKAN oleh CHECK constraint (SQLSTATE seharusnya 23514 check_violation, dapat %)', v_sqlstate;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (rr)';
END $$;


-- ===== (ss) [4C] update_inquiry_lanes pada inquiry Rate Sheet Request yang
--            sudah ada -- tambah lane ke-3, sukses, GENERIK (fungsi ini
--            tidak menyentuh inquiry_type/validity_from/validity_to/
--            monthly_volume_cbm sama sekali, dan tidak perlu -- Keputusan
--            Vir Q4: kolom "Use" HANYA di wizard, Lane Editor Detail Inquiry
--            tidak disentuh) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid; v_loc3 uuid; v_loc4 uuid; v_loc5 uuid; v_loc6 uuid;
  v_new_id uuid; v_lane_count int;
  v_itype text; v_vfrom date; v_vto date; v_volm numeric;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (ss) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-SS-1', 'Uji SS 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-SS-2', 'Uji SS 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-SS-3', 'Uji SS 3', 'Malaysia', 'Seaport') RETURNING id INTO v_loc3;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-SS-4', 'Uji SS 4', 'Indonesia', 'Seaport') RETURNING id INTO v_loc4;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-SS-5', 'Uji SS 5', 'Thailand', 'Seaport') RETURNING id INTO v_loc5;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-SS-6', 'Uji SS 6', 'Indonesia', 'Seaport') RETURNING id INTO v_loc6;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji SS 1', 'pod', 'Uji SS 2'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji SS 3', 'pod', 'Uji SS 4')
    )
  ) AS t;

  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_new_id,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji SS 1', 'pod', 'Uji SS 2'),
      jsonb_build_object('pol_location_id', v_loc3, 'pod_location_id', v_loc4, 'pol', 'Uji SS 3', 'pod', 'Uji SS 4'),
      jsonb_build_object('pol_location_id', v_loc5, 'pod_location_id', v_loc6, 'pol', 'Uji SS 5', 'pod', 'Uji SS 6')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  SELECT inquiry_type, validity_from, validity_to, monthly_volume_cbm INTO v_itype, v_vfrom, v_vto, v_volm
    FROM public.inquiries WHERE id = v_new_id;

  RAISE NOTICE '(ss) sesudah update_inquiry_lanes -- lane_count=% (harus 3), inquiry_type=% validity=%..% monthly_volume_cbm=% (keempatnya harus TIDAK BERUBAH)',
    v_lane_count, v_itype, v_vfrom, v_vto, v_volm;

  IF v_lane_count <> 3 THEN RAISE EXCEPTION 'UJI GAGAL (ss) -- seharusnya TEPAT 3 baris sesudah tambah lane, dapat %', v_lane_count; END IF;
  IF v_itype <> 'Rate Sheet Request' OR v_vfrom <> '2026-12-01'::date OR v_vto <> '2027-02-28'::date OR v_volm <> 15 THEN
    RAISE EXCEPTION 'UJI GAGAL (ss) -- update_inquiry_lanes TIDAK BOLEH mengubah inquiry_type/validity/volume, tapi berubah';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (ss)';
END $$;


-- ===== (tt) [4C] Dua inquiry Rate Sheet Request, pelanggan+lane pertama
--            SAMA, dalam 30 hari -- find_possible_duplicate_inquiries
--            MENEMUKAN yang pertama saat dipanggil utk yang kedua. Ini
--            MEMBUKTIKAN PERILAKU DB APA ADANYA (Keputusan Vir Q1: terima
--            apa adanya, TIDAK ADA perubahan perilaku) -- BUKAN klaim
--            bahwa ini "benar" atau "salah" secara produk.
--            CATATAN PENTING, diverifikasi langsung ke kode (BUKAN hanya
--            dikutip): InquiryIntakeWizardPage.jsx, useEffect baris 433-438
--            -- cek duplikat HANYA berjalan kalau f.container_types.length
--            > 0. Untuk Rate Sheet Request, container_types SELALU kosong
--            (field itu disembunyikan total di mode ini, lihat PLAN §1/§5)
--            -- jadi wizard TIDAK PERNAH menjalankan cek duplikat untuk
--            Rate Sheet Request sama sekali hari ini, dan TAHAP 4C TIDAK
--            mengubah ini. Blok ini menguji FUNGSI DB-nya langsung (bukan
--            lewat alur wizard) semata-mata untuk mendokumentasikan
--            perilaku fungsi itu sendiri kalau suatu saat dipanggil.
--            Fungsi `find_possible_duplicate_inquiries` (migrasi
--            20261023000003, signature 6 argumen: p_company_id uuid,
--            p_customer_id uuid, p_pol_location_id uuid, p_pod_location_id
--            uuid, p_container_types text[], p_exclude_id uuid) belum
--            pernah live di production (nol hit schema_snapshot.sql) --
--            diasumsikan sudah live di STAGING sesuai keterangan Vir =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_id1 uuid; v_no1 text; v_id2 uuid; v_no2 text;
  v_found_id uuid; v_found_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (tt) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-TT-1', 'Uji TT 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-TT-2', 'Uji TT 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_id1, v_no1 FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji TT 1', 'pod', 'Uji TT 2'))
  ) AS t;

  -- Lane pertama SAMA PERSIS dgn v_id1 (v_loc1/v_loc2); validity/volume
  -- SENGAJA beda supaya jelas ini "dua permintaan RS beda periode", bukan
  -- INSERT ganda yang identik.
  SELECT t.id, t.inquiry_no INTO v_id2, v_no2 FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2027-03-01'::date, p_validity_to := '2027-05-31'::date, p_monthly_volume_cbm := 20,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji TT 1', 'pod', 'Uji TT 2'))
  ) AS t;

  SELECT id INTO v_found_id FROM public.find_possible_duplicate_inquiries(
    p_company_id := v_company, p_customer_id := v_account,
    p_pol_location_id := v_loc1, p_pod_location_id := v_loc2,
    p_container_types := NULL, -- NULL, bukan '{}' -- cermin create_inquiry_with_lanes yang memaksa container_types NULL utk Rate Sheet
    p_exclude_id := v_id2
  ) LIMIT 1;
  SELECT count(*) INTO v_found_count FROM public.find_possible_duplicate_inquiries(
    p_company_id := v_company, p_customer_id := v_account,
    p_pol_location_id := v_loc1, p_pod_location_id := v_loc2,
    p_container_types := NULL, p_exclude_id := v_id2
  );
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(tt) inquiry pertama % ditemukan sbg possible-duplicate saat mencari utk inquiry kedua %: found_id=%, total_found=% (harus id1 %, 1)',
    v_no1, v_no2, v_found_id, v_found_count, v_id1;

  IF v_found_id IS DISTINCT FROM v_id1 OR v_found_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (tt) -- find_possible_duplicate_inquiries seharusnya menemukan PERSIS inquiry pertama (lane sama, pelanggan sama, 30 hari, status OPEN), dapat found_id=% count=%', v_found_id, v_found_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (tt)';
END $$;


-- ===== (uu) [4C] Rate Sheet Request dengan p_incoterms/p_container_types/
--            p_n_containers/p_cargo_ready_date/p_pickup_address/
--            p_delivery_address SEMUA SENGAJA diisi -- assert SEMUA
--            dinormalisasi NULL di baris inquiries tersimpan.
--            CATATAN PENTING -- INI MENDUPLIKASI BLOK (r) YANG SUDAH ADA
--            (baris ~793 berkas ini, Tahap 4A): kedua blok menguji hal
--            yang SAMA dengan nilai yang hampir sama. Ditulis ulang di sini
--            ATAS INSTRUKSI EKSPLISIT VIR (nomor terpisah utk cakupan 4C,
--            bisa dicek tersendiri tanpa menggulir ke blok 4A lama) --
--            dilaporkan transparan, BUKAN diam-diam dianggap cakupan baru.
--            Kalau dianggap berlebihan, blok ini aman DIHAPUS tanpa
--            mengurangi cakupan sama sekali (perilaku sudah terbukti (r)) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc1 uuid; v_loc2 uuid;
  v_new_id uuid;
  v_cont text[]; v_inco text[]; v_ncont int; v_cargo date; v_pickup text; v_delivery text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (uu) -- nol akun fixture'; END IF;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-UU-1', 'Uji UU 1', 'Singapore', 'Seaport') RETURNING id INTO v_loc1;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-UU-2', 'Uji UU 2', 'Indonesia', 'Seaport') RETURNING id INTO v_loc2;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := '2026-12-01'::date, p_validity_to := '2027-02-28'::date, p_monthly_volume_cbm := 15,
    p_incoterms := ARRAY['CIF'], p_container_types := ARRAY['FCL 20'], p_n_containers := 5,
    p_cargo_ready_date := '2026-11-20'::date,
    p_pickup_address := 'Jl. Uji UU Asal', p_delivery_address := 'Jl. Uji UU Tujuan',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc1, 'pod_location_id', v_loc2, 'pol', 'Uji UU 1', 'pod', 'Uji UU 2'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT container_types, incoterms, n_containers, cargo_ready_date, pickup_address, delivery_address
    INTO v_cont, v_inco, v_ncont, v_cargo, v_pickup, v_delivery
    FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE '(uu) container_types=% incoterms=% n_containers=% cargo_ready_date=% pickup=% delivery=% (SEMUA harus NULL -- duplikat blok (r), lihat catatan di atas)',
    v_cont, v_inco, v_ncont, v_cargo, v_pickup, v_delivery;

  IF v_cont IS NOT NULL OR v_inco IS NOT NULL OR v_ncont IS NOT NULL OR v_cargo IS NOT NULL
     OR v_pickup IS NOT NULL OR v_delivery IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (uu) -- field Single-Shipment-only seharusnya dinormalisasi NULL untuk Rate Sheet Request';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (uu)';
END $$;
