-- =============================================================================
-- Skrip uji transaksi-aman -- Inquiry Management Putaran 12 (database
-- hardening domain Inquiry). Migrasi diuji: 20261029000001-000005.
--
-- TIDAK DIJALANKAN oleh siapa pun di sesi penulisan ini -- hanya ditulis
-- untuk Vir eksekusi manual di staging SESUDAH kelima migrasi jalan, dalam
-- urutan nomornya (nol DROP di kelimanya -- boleh lewat connector Vir).
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-4/5(-quotation).sql / verify-inquiry-won-revert.sql.
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (nilai yang dicek,
-- bukan hanya "OK"/"FAIL").
--
-- Identitas akun uji staging (SAMA PERSIS dengan verify-inquiry-putaran-5.sql):
--   manager/supervisor (level 6)    : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (non-manager, pembuat)  : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (non-manager, lain)     : 6739c239-e2ff-48ff-97ed-23059f749218
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
--
-- FIXTURE locations/inquiries/quotations -- INSERT LANGSUNG sebagai postgres
-- (SEBELUM SET LOCAL ROLE authenticated), setara superuser, RLS tidak
-- berlaku -- pola persis verify-inquiry-putaran-5.sql. Memanggil RPC yang
-- menegakkan gate lewat RLS/current_user (create_quotation_revision,
-- UPDATE langsung quotations/quotation_items) WAJIB diimpersonasi
-- (set_config('request.jwt.claim.sub',...) + SET LOCAL ROLE authenticated).
-- RPC SECURITY DEFINER (create_inquiry_with_lanes/update_inquiry_lanes/
-- mark_inquiry_won/revert_manual_win) WAJIB set_config saja (auth.uid()
-- harus resolve) -- SET LOCAL ROLE TIDAK diperlukan untuk RPC-nya sendiri
-- (current_user jadi postgres/pemilik fungsi selama berjalan), TAPI
-- dipasang di blok yang JUGA melakukan UPDATE langsung tabel di blok yang
-- sama (konsistensi, nol efek buruk).
-- =============================================================================


-- =============================================================================
-- V1 -- lane_mode/load_unit: NULL diterima, nilai tidak dikenal ditolak
-- =============================================================================

-- ===== V1a -- create_inquiry_with_lanes, mode TIDAK DIKENAL -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid;
  v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V1a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1A-POL', 'Uji P12 V1a POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1A-POD', 'Uji P12 V1a POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := jsonb_build_array(jsonb_build_object(
        'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
        'pol', 'Uji P12 V1a POL', 'pod', 'Uji P12 V1a POD', 'mode', 'Mode Ngawur', 'load_unit', 'CBM'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V1a -- mode ngawur -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught OR v_msg NOT LIKE '%Lane Mode is not recognized%' THEN
    RAISE EXCEPTION 'UJI GAGAL (V1a) -- seharusnya ditolak dgn pesan Lane Mode is not recognized, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V1a)';
END $$;

-- ===== V1b -- create_inquiry_with_lanes, load_unit TIDAK DIKENAL -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid;
  v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V1b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1B-POL', 'Uji P12 V1b POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1B-POD', 'Uji P12 V1b POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := jsonb_build_array(jsonb_build_object(
        'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
        'pol', 'Uji P12 V1b POL', 'pod', 'Uji P12 V1b POD', 'mode', 'Sea LCL', 'load_unit', 'Unit Ngawur'))
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V1b -- load_unit ngawur -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught OR v_msg NOT LIKE '%Load Unit is not recognized%' THEN
    RAISE EXCEPTION 'UJI GAGAL (V1b) -- seharusnya ditolak dgn pesan Load Unit is not recognized, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V1b)';
END $$;

-- ===== V1c -- update_inquiry_lanes, mode+load_unit NULL (legacy) -- DITERIMA =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_inq_id uuid; v_lane_count integer; v_lane_mode text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V1c) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1C-POL', 'Uji P12 V1c POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1C-POD', 'Uji P12 V1c POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  -- NULL eksplisit -- mensimulasikan 9 baris legacy di staging (mode/
  -- load_unit NULL) yang dikirim ulang apa adanya oleh FE saat edit lane
  -- LAIN pada inquiry yang sama, tanpa user menyentuh dropdown baris ini.
  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object(
      'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
      'pol', 'Uji P12 V1c POL', 'pod', 'Uji P12 V1c POD', 'mode', NULL, 'load_unit', NULL))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*), max(mode) INTO v_lane_count, v_lane_mode FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;
  RAISE NOTICE 'V1c -- mode/load_unit NULL -- lane_count=%, mode_tersimpan=%', v_lane_count, v_lane_mode;
  IF v_lane_count <> 1 OR v_lane_mode IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (V1c) -- seharusnya tetap tersimpan 1 lane dengan mode NULL, dapat count=% mode=%', v_lane_count, v_lane_mode;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V1c)';
END $$;

-- ===== V1d -- create_inquiry_with_lanes/update_inquiry_lanes, nilai DIKENAL -- DITERIMA (regresi) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_new_id uuid; v_new_no text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V1d) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1D-POL', 'Uji P12 V1d POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V1D-POD', 'Uji P12 V1d POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object(
      'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
      'pol', 'Uji P12 V1d POL', 'pod', 'Uji P12 V1d POD', 'mode', 'Sea FCL', 'load_unit', 'Container'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V1d -- nilai dikenal -- id=%, no=%', v_new_id, v_new_no;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (V1d) -- seharusnya tetap sukses dengan nilai dikenal';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V1d)';
END $$;


-- =============================================================================
-- V3 -- weight_kg/volume_cbm dibulatkan 2 desimal, DUA jalur (RPC + UPDATE
-- langsung)
-- =============================================================================

-- ===== V3a -- create_inquiry_with_lanes dengan weight_kg/volume_cbm 3+ desimal =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_new_id uuid;
  v_weight numeric; v_volume numeric;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V3a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V3A-POL', 'Uji P12 V3a POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V3A-POD', 'Uji P12 V3a POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_weight_kg := 12.345, p_volume_cbm := 1.005,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'Uji P12 V3a POL', 'pod', 'Uji P12 V3a POD'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT weight_kg, volume_cbm INTO v_weight, v_volume FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE 'V3a -- create_inquiry_with_lanes -- weight_kg=%, volume_cbm=%', v_weight, v_volume;
  IF v_weight <> 12.35 OR v_volume <> 1.01 THEN
    RAISE EXCEPTION 'UJI GAGAL (V3a) -- seharusnya 12.35/1.01, dapat %/%', v_weight, v_volume;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V3a)';
END $$;

-- ===== V3b -- UPDATE langsung inquiries.weight_kg/volume_cbm (jalur DealDetailPage) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid; v_weight numeric; v_volume numeric;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V3b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inquiries SET weight_kg = 5.666, volume_cbm = 0.004 WHERE id = v_inq_id;
  EXECUTE 'RESET ROLE';

  SELECT weight_kg, volume_cbm INTO v_weight, v_volume FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE 'V3b -- UPDATE langsung -- weight_kg=%, volume_cbm=%', v_weight, v_volume;
  IF v_weight <> 5.67 OR v_volume <> 0.00 THEN
    RAISE EXCEPTION 'UJI GAGAL (V3b) -- seharusnya 5.67/0.00, dapat %/%', v_weight, v_volume;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V3b)';
END $$;


-- =============================================================================
-- V4 -- Direction dihitung ulang HANYA saat lane pertama berubah
-- =============================================================================

-- ===== V4a -- lane[0] berubah dari (SG,ID) ke (ID,ID) -- direction jadi Domestic =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_loc_sg uuid; v_loc_id_a uuid; v_loc_id_b uuid;
  v_direction text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V4a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4A-SG', 'Uji P12 V4a SG', 'Singapore', 'Seaport') RETURNING id INTO v_loc_sg;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4A-IDA', 'Uji P12 V4a IDA', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_id_a;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4A-IDB', 'Uji P12 V4a IDB', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_id_b;

  -- Create: lane[0] = SG -> ID (Export), direction dikirim manual 'Export'
  -- (meniru wizard yang sudah menghitungnya saat create).
  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_sg, 'pod_location_id', v_loc_id_a, 'pol', 'SG', 'pod', 'IDA'))
  ) AS t;

  -- Edit: lane[0] POL diganti ke ID (ID -> ID) -- direction HARUS dihitung
  -- ulang jadi Domestic.
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_id_b, 'pod_location_id', v_loc_id_a, 'pol', 'IDB', 'pod', 'IDA'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT direction INTO v_direction FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE 'V4a -- lane[0] POL SG->ID -- direction=%', v_direction;
  IF v_direction <> 'Domestic' THEN
    RAISE EXCEPTION 'UJI GAGAL (V4a) -- seharusnya Domestic, dapat %', v_direction;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V4a)';
END $$;

-- ===== V4b -- lane[0] TIDAK berubah (hanya tambah lane kedua) -- direction TETAP =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_loc_sg uuid; v_loc_id_a uuid; v_loc_my uuid;
  v_direction text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V4b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4B-SG', 'Uji P12 V4b SG', 'Singapore', 'Seaport') RETURNING id INTO v_loc_sg;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4B-ID', 'Uji P12 V4b ID', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_id_a;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4B-MY', 'Uji P12 V4b MY', 'Malaysia', 'Seaport') RETURNING id INTO v_loc_my;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_sg, 'pod_location_id', v_loc_id_a, 'pol', 'SG', 'pod', 'ID'))
  ) AS t;

  -- Edit: lane[0] SAMA (SG->ID), tambah lane kedua (MY->ID) -- direction
  -- TIDAK boleh dihitung ulang (lane pertama tidak berubah).
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc_sg, 'pod_location_id', v_loc_id_a, 'pol', 'SG', 'pod', 'ID'),
      jsonb_build_object('pol_location_id', v_loc_my, 'pod_location_id', v_loc_id_a, 'pol', 'MY', 'pod', 'ID')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT direction INTO v_direction FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE 'V4b -- lane[0] tidak berubah -- direction=%', v_direction;
  IF v_direction <> 'Export' THEN
    RAISE EXCEPTION 'UJI GAGAL (V4b) -- seharusnya tetap Export, dapat %', v_direction;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V4b)';
END $$;

-- ===== V4c -- lane[0] berubah ke (SG,MY), keduanya bukan Indonesia -- direction LAMA dibiarkan =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_loc_sg uuid; v_loc_id_a uuid; v_loc_my uuid;
  v_direction text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V4c) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4C-SG', 'Uji P12 V4c SG', 'Singapore', 'Seaport') RETURNING id INTO v_loc_sg;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4C-ID', 'Uji P12 V4c ID', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_id_a;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V4C-MY', 'Uji P12 V4c MY', 'Malaysia', 'Seaport') RETURNING id INTO v_loc_my;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_inq_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_sg, 'pod_location_id', v_loc_id_a, 'pol', 'SG', 'pod', 'ID'))
  ) AS t;

  -- Edit: lane[0] diganti SG -> MY (keduanya bukan Indonesia) -- tidak ada
  -- bucket, direction LAMA (Export) dibiarkan, BUKAN di-NULL-kan.
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_sg, 'pod_location_id', v_loc_my, 'pol', 'SG', 'pod', 'MY'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT direction INTO v_direction FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE 'V4c -- lane[0] jadi SG->MY (keduanya non-ID) -- direction=%', v_direction;
  IF v_direction <> 'Export' THEN
    RAISE EXCEPTION 'UJI GAGAL (V4c) -- seharusnya TETAP Export (lama dibiarkan), dapat %', v_direction;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V4c)';
END $$;


-- =============================================================================
-- V5 -- lane identik ditolak
-- =============================================================================

-- ===== V5a -- 2 lane POL+POD+mode+load_unit SAMA PERSIS -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid;
  v_caught boolean := false; v_msg text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V5a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V5A-POL', 'Uji P12 V5a POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V5A-POD', 'Uji P12 V5a POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := jsonb_build_array(
        jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD', 'mode', 'Sea LCL', 'load_unit', 'CBM'),
        jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD', 'mode', 'Sea LCL', 'load_unit', 'CBM')
      )
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V5a -- 2 lane identik -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught OR v_msg NOT LIKE '%identical%' THEN
    RAISE EXCEPTION 'UJI GAGAL (V5a) -- seharusnya ditolak dgn pesan lane identik, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V5a)';
END $$;

-- ===== V5b -- 2 lane POL+POD SAMA tapi mode BEDA -- DITERIMA (bukan duplikat) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_new_id uuid; v_lane_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V5b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V5B-POL', 'Uji P12 V5b POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V5B-POD', 'Uji P12 V5b POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(
      jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD', 'mode', 'Sea LCL', 'load_unit', 'CBM'),
      jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD', 'mode', 'Air', 'load_unit', 'KG')
    )
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;
  RAISE NOTICE 'V5b -- POL+POD sama, mode beda -- lane_count=%', v_lane_count;
  IF v_lane_count <> 2 THEN
    RAISE EXCEPTION 'UJI GAGAL (V5b) -- seharusnya 2 lane tersimpan (bukan duplikat), dapat %', v_lane_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V5b)';
END $$;


-- =============================================================================
-- V6 -- find_possible_duplicate_rate_sheets
-- =============================================================================

-- ===== V6a -- akun sama, validity overlap, lane sama -- DITEMUKAN =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_existing_id uuid;
  v_match_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V6a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V6A-POL', 'Uji P12 V6a POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V6A-POD', 'Uji P12 V6a POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_existing_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := CURRENT_DATE, p_validity_to := CURRENT_DATE + interval '90 days', p_monthly_volume_cbm := 50,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD'))
  ) AS t;

  SELECT count(*) INTO v_match_count FROM public.find_possible_duplicate_rate_sheets(
    p_company_id := v_company, p_prospect_id := v_account,
    p_validity_from := CURRENT_DATE + interval '30 days', p_validity_to := CURRENT_DATE + interval '120 days',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod))
  );
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V6a -- akun sama, validity overlap, lane sama -- match_count=%', v_match_count;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (V6a) -- seharusnya 1 match, dapat %', v_match_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V6a)';
END $$;

-- ===== V6b -- inquiry_type Single Shipment -- TIDAK dibandingkan (nol match) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_existing_id uuid;
  v_match_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V6b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V6B-POL', 'Uji P12 V6b POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V6B-POD', 'Uji P12 V6b POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- inquiry Single Shipment (BUKAN Rate Sheet) dengan lane yang SAMA.
  SELECT t.id INTO v_existing_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD'))
  ) AS t;

  SELECT count(*) INTO v_match_count FROM public.find_possible_duplicate_rate_sheets(
    p_company_id := v_company, p_prospect_id := v_account,
    p_validity_from := CURRENT_DATE, p_validity_to := CURRENT_DATE + interval '90 days',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod))
  );
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V6b -- Single Shipment existing -- match_count=%', v_match_count;
  IF v_match_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (V6b) -- seharusnya 0 match (Single Shipment tidak dibandingkan), dapat %', v_match_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V6b)';
END $$;

-- ===== V6c -- validity TIDAK overlap -- nol match =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_existing_id uuid;
  v_match_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V6c) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V6C-POL', 'Uji P12 V6c POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V6C-POD', 'Uji P12 V6c POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_existing_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper', p_inquiry_type := 'Rate Sheet Request',
    p_validity_from := CURRENT_DATE, p_validity_to := CURRENT_DATE + interval '30 days', p_monthly_volume_cbm := 50,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'POL', 'pod', 'POD'))
  ) AS t;

  -- validity CALON mulai 60 hari sesudah validity_to yang ada -- TIDAK overlap.
  SELECT count(*) INTO v_match_count FROM public.find_possible_duplicate_rate_sheets(
    p_company_id := v_company, p_prospect_id := v_account,
    p_validity_from := CURRENT_DATE + interval '60 days', p_validity_to := CURRENT_DATE + interval '150 days',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod))
  );
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'V6c -- validity tidak overlap -- match_count=%', v_match_count;
  IF v_match_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (V6c) -- seharusnya 0 match, dapat %', v_match_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V6c)';
END $$;


-- =============================================================================
-- V7 -- TD-324/rule 109: Rate Sheet WON TIDAK menyapu sibling, ACCEPTED +
-- item-nya TETAP terkunci (aturan 16), revisi baru BISA diedit, Single
-- Shipment TIDAK berubah
-- =============================================================================

-- ===== V7a -- Rate Sheet: ACCEPTED+Won -- sibling SENT TIDAK disapu =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_inq_id uuid;
  v_quot_main uuid; v_quot_sibling uuid; v_sibling_status text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V7a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V7A-POL', 'Uji P12 V7a POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V7A-POD', 'Uji P12 V7a POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, inquiry_type,
    validity_from, validity_to, monthly_volume_cbm, status, created_by, owner_id, pol_location_id, pod_location_id, pol, pod)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'Rate Sheet Request',
    CURRENT_DATE, CURRENT_DATE + interval '90 days', 50, 'QUOTED', v_sales_a, v_sales_a, v_loc_pol, v_loc_pod, 'POL', 'POD')
  RETURNING id INTO v_inq_id;

  -- Quotation UTAMA: SENT, siap diterima.
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V7A-MAIN-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SENT', now(), v_sales_a)
  RETURNING id INTO v_quot_main;

  -- Quotation SIBLING: SENT juga -- harus TETAP SENT sesudah Won (Rate Sheet
  -- exception: sweep TASK 5 dilewati sepenuhnya).
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V7A-SIB-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SENT', now(), v_sales_a)
  RETURNING id INTO v_quot_sibling;

  -- Terima quotation utama -- otomatis memicu Won (trg_fn_inquiry_won_on_
  -- quotation_accepted, tidak membedakan inquiry_type). storage.objects
  -- WAJIB berisi file bukti -- EXISTS-check set_quotation_outcome (K1d,
  -- 20261026000004), pola persis verify-inquiry-putaran-5-quotation.sql.
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('quotation-acceptance-evidence', v_company::text || '/' || v_quot_main::text || '/uji.pdf');

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_quotation_outcome(v_quot_main, 'ACCEPTED', NULL, v_company::text || '/' || v_quot_main::text || '/uji.pdf');
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_sibling_status FROM public.quotations WHERE id = v_quot_sibling;
  RAISE NOTICE 'V7a -- Rate Sheet Won -- inquiry_status=%, sibling_status=%',
    (SELECT status FROM public.inquiries WHERE id = v_inq_id), v_sibling_status;
  IF (SELECT status FROM public.inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7a) -- inquiry seharusnya WON';
  END IF;
  IF v_sibling_status <> 'SENT' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7a) -- sibling seharusnya TETAP SENT (Rate Sheet exception), dapat %', v_sibling_status;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V7a)';
END $$;

-- ===== V7b -- REGRESI: Single Shipment ACCEPTED+Won -- sibling SENT TETAP disapu =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_quot_main uuid; v_quot_sibling uuid; v_sibling_status text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V7b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'QUOTED', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V7B-MAIN-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SENT', now(), v_sales_a)
  RETURNING id INTO v_quot_main;

  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V7B-SIB-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SENT', now(), v_sales_a)
  RETURNING id INTO v_quot_sibling;

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('quotation-acceptance-evidence', v_company::text || '/' || v_quot_main::text || '/uji.pdf');

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_quotation_outcome(v_quot_main, 'ACCEPTED', NULL, v_company::text || '/' || v_quot_main::text || '/uji.pdf');
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_sibling_status FROM public.quotations WHERE id = v_quot_sibling;
  RAISE NOTICE 'V7b (regresi Single Shipment) -- sibling_status=%', v_sibling_status;
  IF v_sibling_status <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7b) -- sibling Single Shipment seharusnya TETAP disapu ke SUPERSEDED, dapat %', v_sibling_status;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V7b)';
END $$;

-- ===== V7c -- Rate Sheet WON: UPDATE langsung quotation ACCEPTED -- DITOLAK
--           (aturan 16); create_quotation_revision -- SUKSES tanpa supersede;
--           item quotation ACCEPTED -- DITOLAK; item revisi baru -- DITERIMA =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid; v_inq_id uuid;
  v_quot_main uuid; v_quot_item uuid; v_new_rev_id uuid; v_new_rev_item uuid;
  v_caught boolean; v_msg text; v_main_status text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V7c) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V7C-POL', 'Uji P12 V7c POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V7C-POD', 'Uji P12 V7c POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, inquiry_type,
    validity_from, validity_to, monthly_volume_cbm, status, created_by, owner_id, pol_location_id, pod_location_id, pol, pod)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'Rate Sheet Request',
    CURRENT_DATE, CURRENT_DATE + interval '90 days', 50, 'QUOTED', v_sales_a, v_sales_a, v_loc_pol, v_loc_pod, 'POL', 'POD')
  RETURNING id INTO v_inq_id;

  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V7C-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SENT', now(), v_sales_a)
  RETURNING id INTO v_quot_main;

  INSERT INTO public.quotation_items (quotation_id, sort_order, description, qty, unit, unit_price)
  VALUES (v_quot_main, 1, 'Uji item V7c', 1, 'unit', 1000) RETURNING id INTO v_quot_item;

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('quotation-acceptance-evidence', v_company::text || '/' || v_quot_main::text || '/uji.pdf');

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_quotation_outcome(v_quot_main, 'ACCEPTED', NULL, v_company::text || '/' || v_quot_main::text || '/uji.pdf');

  -- (i) UPDATE langsung notes pada quotation ACCEPTED -- DITOLAK.
  v_caught := false;
  BEGIN
    UPDATE public.quotations SET notes = 'coba ubah' WHERE id = v_quot_main;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  RAISE NOTICE 'V7c(i) -- UPDATE quotation ACCEPTED -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught OR v_msg NOT LIKE '%Accepted and its price is locked%' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7c-i) -- seharusnya ditolak, dapat: %', v_msg;
  END IF;

  -- (ii) UPDATE langsung item pada quotation ACCEPTED -- DITOLAK.
  v_caught := false;
  BEGIN
    UPDATE public.quotation_items SET qty = 2 WHERE id = v_quot_item;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  RAISE NOTICE 'V7c(ii) -- UPDATE item quotation ACCEPTED -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught OR v_msg NOT LIKE '%Accepted and its price is locked%' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7c-ii) -- seharusnya ditolak, dapat: %', v_msg;
  END IF;

  -- (iii) create_quotation_revision pada quotation ACCEPTED -- SUKSES,
  -- baris lama TETAP ACCEPTED (tidak disupersede).
  v_new_rev_id := public.create_quotation_revision(v_quot_main);
  SELECT status INTO v_main_status FROM public.quotations WHERE id = v_quot_main;
  RAISE NOTICE 'V7c(iii) -- create_quotation_revision -- new_id=%, status quotation lama=%', v_new_rev_id, v_main_status;
  IF v_new_rev_id IS NULL OR v_main_status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7c-iii) -- revisi seharusnya sukses TANPA menyupersede baris lama, dapat new_id=% status_lama=%', v_new_rev_id, v_main_status;
  END IF;
  IF (SELECT status FROM public.quotations WHERE id = v_new_rev_id) <> 'DRAFT' THEN
    RAISE EXCEPTION 'UJI GAGAL (V7c-iii) -- revisi baru seharusnya DRAFT';
  END IF;

  -- (iv) item pada revisi BARU (DRAFT) -- bisa diubah.
  SELECT id INTO v_new_rev_item FROM public.quotation_items WHERE quotation_id = v_new_rev_id LIMIT 1;
  UPDATE public.quotation_items SET qty = 3 WHERE id = v_new_rev_item;
  RAISE NOTICE 'V7c(iv) -- item revisi baru diubah -- qty=%', (SELECT qty FROM public.quotation_items WHERE id = v_new_rev_item);
  IF (SELECT qty FROM public.quotation_items WHERE id = v_new_rev_item) <> 3 THEN
    RAISE EXCEPTION 'UJI GAGAL (V7c-iv) -- item revisi baru seharusnya bisa diubah';
  END IF;

  -- (v) sibling SENT (tidak disentuh sama sekali di uji ini) bisa diupdate --
  -- memastikan Rate Sheet WON tidak membabi-buta mengunci SEMUA baris.
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V7c)';
END $$;


-- =============================================================================
-- V8 -- revert_manual_win mengembalikan quotation yang disapu ke status
-- SEBELUM disapu (SENT/DRAFT/SUBMITTED->DRAFT), quotation SUPERSEDED karena
-- revisi normal TIDAK tersentuh, nol notifikasi/log ganda
-- =============================================================================

DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_quot_sent uuid; v_quot_draft uuid; v_quot_submitted uuid; v_quot_revised_old uuid; v_quot_revised_new uuid;
  v_status_sent text; v_status_draft text; v_status_submitted text; v_status_revised text;
  v_inq_status_after text;
  v_audit_count_before integer; v_audit_count_after integer;
  v_hist_count_before integer; v_hist_count_after integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V8) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'QUOTED', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  -- Quotation 1: SENT (quote_sent_at terisi) -- harus kembali ke SENT.
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V8-SENT-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SENT', now(), v_sales_a)
  RETURNING id INTO v_quot_sent;

  -- Quotation 2: DRAFT (quote_sent_at NULL) -- harus kembali ke DRAFT.
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V8-DRAFT-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'DRAFT', v_sales_a)
  RETURNING id INTO v_quot_draft;

  -- Quotation 3: SUBMITTED (quote_sent_at NULL juga) -- KELEMAHAN YANG
  -- DISADARI: akan kembali ke DRAFT, bukan SUBMITTED (nol kolom pembeda).
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V8-SUBM-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SUBMITTED', v_sales_a)
  RETURNING id INTO v_quot_submitted;

  -- Quotation 4: SUPERSEDED karena REVISI NORMAL (bukan sweep Won) --
  -- rejection_reason TIDAK diisi pola Won -- TIDAK boleh tersentuh revert.
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, quote_sent_at, created_by)
  VALUES (v_company, 'ZZZTEST-P12-V8-REV-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account, 'SUPERSEDED', now(), v_sales_a)
  RETURNING id INTO v_quot_revised_old;
  INSERT INTO public.quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company, (SELECT quotation_no FROM public.quotations WHERE id = v_quot_revised_old), 2, v_inq_id, v_account, 'DRAFT', v_sales_a)
  RETURNING id INTO v_quot_revised_new;

  -- Mark Won manual -- menyapu Quotation 1/2/3 (DRAFT/SUBMITTED/SENT) ke
  -- SUPERSEDED, rejection_reason='Otomatis: inquiry ditandai Won'.
  -- Quotation 4 TIDAK tersentuh lagi (sudah SUPERSEDED, bukan di DRAFT/
  -- SUBMITTED/SENT). storage.objects WAJIB berisi file bukti -- EXISTS-
  -- check mark_inquiry_won (20261027000005).
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('inquiry-won-evidence', v_company::text || '/' || v_inq_id::text || '/uji.pdf');

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  PERFORM public.mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  -- "before" diambil SESUDAH mark_inquiry_won, SEBELUM revert_manual_win --
  -- supaya selisih after-before di bawah mengukur HANYA efek revert_manual_
  -- win (bukan ikut menghitung +1 baris yang sudah ditulis mark_inquiry_won
  -- sebelum titik ini).
  SELECT count(*) INTO v_audit_count_before FROM public.audit_logs WHERE entity_id = v_inq_id;
  SELECT count(*) INTO v_hist_count_before FROM public.inquiry_status_history WHERE inquiry_id = v_inq_id;

  -- Revert, sebagai manager.
  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  PERFORM public.revert_manual_win(v_inq_id, 'Uji Putaran 12 V8 -- salah tandai Won');

  SELECT status INTO v_status_sent FROM public.quotations WHERE id = v_quot_sent;
  SELECT status INTO v_status_draft FROM public.quotations WHERE id = v_quot_draft;
  SELECT status INTO v_status_submitted FROM public.quotations WHERE id = v_quot_submitted;
  SELECT status INTO v_status_revised FROM public.quotations WHERE id = v_quot_revised_old;
  SELECT status INTO v_inq_status_after FROM public.inquiries WHERE id = v_inq_id;
  SELECT count(*) INTO v_audit_count_after FROM public.audit_logs WHERE entity_id = v_inq_id;
  SELECT count(*) INTO v_hist_count_after FROM public.inquiry_status_history WHERE inquiry_id = v_inq_id;

  RAISE NOTICE 'V8 -- inquiry_status=%, sent=%, draft=%, submitted(->draft)=%, revised_old(harus tetap SUPERSEDED)=%, audit %->%  , history %->%',
    v_inq_status_after, v_status_sent, v_status_draft, v_status_submitted, v_status_revised,
    v_audit_count_before, v_audit_count_after, v_hist_count_before, v_hist_count_after;

  IF v_inq_status_after <> 'QUOTED' THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- inquiry seharusnya kembali QUOTED, dapat %', v_inq_status_after;
  END IF;
  IF v_status_sent <> 'SENT' THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- quotation SENT seharusnya kembali SENT, dapat %', v_status_sent;
  END IF;
  IF v_status_draft <> 'DRAFT' THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- quotation DRAFT seharusnya kembali DRAFT, dapat %', v_status_draft;
  END IF;
  -- KELEMAHAN DISADARI, BUKAN kegagalan: SUBMITTED kembali sebagai DRAFT.
  IF v_status_submitted <> 'DRAFT' THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- quotation SUBMITTED seharusnya kembali DRAFT (kelemahan disadari), dapat %', v_status_submitted;
  END IF;
  IF v_status_revised <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- quotation SUPERSEDED-karena-revisi-normal TIDAK BOLEH tersentuh, dapat %', v_status_revised;
  END IF;
  -- Audit: PERSIS +1 baris (REVERT_MANUAL_WIN) dari mark_inquiry_won +
  -- revert_manual_win (mark_inquiry_won sendiri juga +1 -- jadi before/after
  -- selisih +2 total dari titik SEBELUM mark_inquiry_won; v_audit_count_before
  -- diambil SESUDAH mark_inquiry_won, SEBELUM revert, jadi selisih di sini
  -- harus PERSIS +1 -- revert_manual_win menulis SATU baris audit, bukan
  -- lebih, nol duplikat dari trigger cascade manapun).
  IF v_audit_count_after - v_audit_count_before <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- audit_logs seharusnya +1 (revert saja), dapat selisih %', v_audit_count_after - v_audit_count_before;
  END IF;
  -- History: +1 baris (transisi WON->QUOTED) -- trigger log_inquiry_status_
  -- change hanya menyala WHEN status berubah; cascading set_inquiry_quoted_
  -- on_quotation_sent TIDAK menambah baris lagi (lihat alasan di header
  -- migrasi 20261029000005 -- WHERE IN ('OPEN','IN_REVIEW') tidak match
  -- QUOTED).
  IF v_hist_count_after - v_hist_count_before <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (V8) -- inquiry_status_history seharusnya +1 (nol transisi ganda), dapat selisih %', v_hist_count_after - v_hist_count_before;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V8)';
END $$;


-- =============================================================================
-- V9 -- derivasi backfill Direction (count-inquiry-direction-backfill.sql /
-- backfill-inquiry-direction.sql) benar untuk 4 kombinasi, pada data ZZZTEST
-- =============================================================================

DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_loc_sg uuid; v_loc_id uuid; v_loc_my uuid;
  v_inq_both_id uuid; v_inq_export uuid; v_inq_neither_id uuid; v_inq_missing_loc uuid;
  v_dir_both text; v_dir_export text; v_dir_neither text; v_dir_missing text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (V9) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V9-SG', 'Uji P12 V9 SG', 'Singapore', 'Seaport') RETURNING id INTO v_loc_sg;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V9-ID', 'Uji P12 V9 ID', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_id;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P12-V9-MY', 'Uji P12 V9 MY', 'Malaysia', 'Seaport') RETURNING id INTO v_loc_my;

  -- Kombinasi 1: kedua Indonesia -> akan terisi Domestic.
  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id, pol_location_id, pod_location_id)
  VALUES (v_company, v_account, 'freight_forwarding', NULL, 'Shipper', 'OPEN', v_sales_a, v_sales_a, v_loc_id, v_loc_id)
  RETURNING id INTO v_inq_both_id;

  -- Kombinasi 2: SG->ID (POL Singapore, POD Indonesia) -> akan terisi
  -- Import (POD Indonesia = barang masuk; lihat backfill-inquiry-
  -- direction.sql -- POL Indonesia = Export, POD Indonesia = Import).
  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id, pol_location_id, pod_location_id)
  VALUES (v_company, v_account, 'freight_forwarding', NULL, 'Shipper', 'OPEN', v_sales_a, v_sales_a, v_loc_sg, v_loc_id)
  RETURNING id INTO v_inq_export;

  -- Kombinasi 3: SG->MY, kedua lokasi dikenal, keduanya bukan Indonesia ->
  -- TETAP NULL (gap model, bukan data hilang).
  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id, pol_location_id, pod_location_id)
  VALUES (v_company, v_account, 'freight_forwarding', NULL, 'Shipper', 'OPEN', v_sales_a, v_sales_a, v_loc_sg, v_loc_my)
  RETURNING id INTO v_inq_neither_id;

  -- Kombinasi 4: pod_location_id NULL (lokasi tidak lengkap) -> TETAP NULL.
  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id, pol_location_id, pod_location_id)
  VALUES (v_company, v_account, 'freight_forwarding', NULL, 'Shipper', 'OPEN', v_sales_a, v_sales_a, v_loc_sg, NULL)
  RETURNING id INTO v_inq_missing_loc;

  -- Jalankan LOGIKA backfill (persis backfill-inquiry-direction.sql), tapi
  -- DIBATASI ke 4 baris ZZZTEST ini saja (WHERE id = ANY (...)) supaya uji
  -- ini tidak ikut mengisi direction inquiry lain yang nol-nya memang milik
  -- data staging/produksi sungguhan.
  WITH primary_lane AS (
    SELECT i.id AS inquiry_id,
           COALESCE((SELECT il.pol_location_id FROM public.inquiry_lanes il WHERE il.inquiry_id = i.id ORDER BY il.sort_order ASC LIMIT 1), i.pol_location_id) AS pol_loc,
           COALESCE((SELECT il.pod_location_id FROM public.inquiry_lanes il WHERE il.inquiry_id = i.id ORDER BY il.sort_order ASC LIMIT 1), i.pod_location_id) AS pod_loc
      FROM public.inquiries i
     WHERE i.id = ANY (ARRAY[v_inq_both_id, v_inq_export, v_inq_neither_id, v_inq_missing_loc])
       AND i.direction IS NULL AND i.deleted_at IS NULL
  ),
  classified AS (
    SELECT pl.inquiry_id,
           CASE
             WHEN pol.id IS NULL OR pod.id IS NULL THEN NULL
             WHEN lower(btrim(COALESCE(pol.country,''))) = 'indonesia' AND lower(btrim(COALESCE(pod.country,''))) = 'indonesia' THEN 'Domestic'
             WHEN lower(btrim(COALESCE(pol.country,''))) = 'indonesia' THEN 'Export'
             WHEN lower(btrim(COALESCE(pod.country,''))) = 'indonesia' THEN 'Import'
             ELSE NULL
           END AS calon_direction
      FROM primary_lane pl
      LEFT JOIN public.locations pol ON pol.id = pl.pol_loc
      LEFT JOIN public.locations pod ON pod.id = pl.pod_loc
  )
  UPDATE public.inquiries i SET direction = c.calon_direction, updated_at = now()
    FROM classified c
   WHERE i.id = c.inquiry_id AND i.direction IS NULL AND c.calon_direction IS NOT NULL;

  SELECT direction INTO v_dir_both FROM public.inquiries WHERE id = v_inq_both_id;
  SELECT direction INTO v_dir_export FROM public.inquiries WHERE id = v_inq_export;
  SELECT direction INTO v_dir_neither FROM public.inquiries WHERE id = v_inq_neither_id;
  SELECT direction INTO v_dir_missing FROM public.inquiries WHERE id = v_inq_missing_loc;

  RAISE NOTICE 'V9 -- both_ID=%(ekspektasi Domestic), SG_ID=%(ekspektasi Import), SG_MY=%(ekspektasi NULL), lokasi_hilang=%(ekspektasi NULL)',
    v_dir_both, v_dir_export, v_dir_neither, v_dir_missing;

  IF v_dir_both <> 'Domestic' THEN RAISE EXCEPTION 'UJI GAGAL (V9) -- kombinasi 1 seharusnya Domestic, dapat %', v_dir_both; END IF;
  IF v_dir_export <> 'Import' THEN RAISE EXCEPTION 'UJI GAGAL (V9) -- kombinasi 2 seharusnya Import, dapat %', v_dir_export; END IF;
  IF v_dir_neither IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (V9) -- kombinasi 3 seharusnya TETAP NULL, dapat %', v_dir_neither; END IF;
  IF v_dir_missing IS NOT NULL THEN RAISE EXCEPTION 'UJI GAGAL (V9) -- kombinasi 4 seharusnya TETAP NULL, dapat %', v_dir_missing; END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (V9)';
END $$;
