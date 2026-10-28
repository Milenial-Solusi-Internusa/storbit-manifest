-- =============================================================================
-- Skrip uji transaksi-aman -- Inquiry Management Putaran 14 (General Trading
-- + Pricing Basis + 4 kolom Delivery). Migrasi diuji: 20261030000001-000002.
--
-- TIDAK DIJALANKAN oleh siapa pun di sesi penulisan ini -- hanya ditulis
-- untuk Mas eksekusi manual di staging SESUDAH kedua migrasi live, dalam
-- urutan nomornya (20261030000001 dulu, lalu 20261030000002 -- yang kedua
-- MEMUAT DROP, dijalankan Mas sendiri, bukan lewat connector Vir).
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-4/5(-quotation)/-12.sql. T10 TIDAK menulis apa
-- pun (murni query katalog) jadi TIDAK memaksa RAISE EXCEPTION di akhir --
-- dicatat eksplisit di blok itu.
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (nilai yang dicek,
-- bukan hanya "OK"/"FAIL").
--
-- ⚠️ CATATAN PENTING -- T2, T8, DAN T9 menangkap `EXCEPTION WHEN OTHERS`
-- (SEMUA jenis error), lalu mencocokkan ISI PESANNYA terhadap pesan yang
-- diharapkan. Ini berarti bug LAIN yang sama sekali tidak berhubungan bisa
-- membuat blok ini tampak "ditolak=true" di NOTICE padahal sebabnya BUKAN
-- yang diuji. Terbukti nyata saat migrasi 20261030000002 versi pertama
-- (jebakan 42702, `id` tanpa alias di DECLARE `v_soa_id`) membuat SELURUH
-- panggilan create_inquiry_with_lanes gagal dgn "column reference id is
-- ambiguous" -- T2/T8/T9 tetap mencetak `ditolak=true` (exception memang
-- tertangkap), tapi PESANNYA salah, dan perbandingan `v_msg NOT LIKE ...`
-- yang menyertai NOTICE itulah yang akhirnya menangkap gagalnya (pesan
-- tidak cocok). Pembaca WAJIB selalu memeriksa ISI pesan/sqlstate di
-- NOTICE, bukan hanya kata "ditolak=true" sendirian. Sejak sesi perbaikan
-- ini, T2/T8/T9 JUGA memeriksa SQLSTATE secara eksplisit dan RAISE
-- EXCEPTION kalau sqlstate='42702' -- supaya jebakan kelas ini gagal KERAS
-- dengan pesan yang menyebut sebabnya, bukan cuma lolos diam-diam lewat
-- pencocokan pesan yang sudah ada.
--
-- Identitas akun uji staging (SAMA PERSIS dengan verify-inquiry-putaran-
-- 4/5/12.sql -- "jangan membuat pola baru"):
--   sales A MSI (non-manager, pembuat) : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
--   company_id SOA = d2e5e565-5f67-4954-b8d9-5979a2a0c697 (CLAUDE.md).
-- Belum tentu ada user ZZZTEST ber-role aktif di SOA yang UUID-nya diketahui
-- lebih dulu -- T1/T3/T4/T9 (kasus GT/SOA) MENCARI user itu secara DINAMIS
-- lewat user_roles (pola identik verify-inquiry-putaran-4.sql:374-385,
-- dikecualikan super_admin), BUKAN UUID hardcode. Akun (prospect/customer)
-- SOA dibuat BARU sebagai ZZZTEST di dalam tiap blok (pola identik
-- verify-inquiry-putaran-4.sql:291-294, "Akun throwaway sendiri -- tidak
-- bergantung ada/tidaknya akun existing") -- supaya uji ini tidak
-- bergantung pada ada/tidaknya akun SOA fixture yang cocok di staging hari
-- ini.
--
-- FIXTURE locations/accounts -- INSERT LANGSUNG sebagai postgres (SEBELUM
-- SET LOCAL ROLE authenticated), setara superuser, RLS tidak berlaku --
-- pola persis verify-inquiry-putaran-4/5/12.sql. RPC SECURITY DEFINER
-- (create_inquiry_with_lanes) WAJIB set_config('request.jwt.claim.sub',...)
-- + SET LOCAL ROLE authenticated supaya auth.uid()/is_super_admin()/
-- get_user_company_ids() resolve ke identitas yang diimpersonasi.
-- =============================================================================


-- =============================================================================
-- T1 -- trading + p_lanes='[]' + akun entitas SOA -> SUKSES, tidak ada
--       lane, inquiry_no berprefiks SOA-.
-- =============================================================================
DO $$
DECLARE
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_soa_user    uuid;
  v_account     uuid;
  v_new_id      uuid;
  v_new_no      text;
  v_lane_count  int;
BEGIN
  SELECT ur.user_id INTO v_soa_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_soa_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T1) -- nol user fixture aktif di company SOA tanpa peran super_admin';
  END IF;

  INSERT INTO public.accounts (company_id, name, is_in_lead_pool, lifecycle_stage)
    VALUES (v_company_soa, 'ZZZTEST P14 T1 Account', false, 'customer')
    RETURNING id INTO v_account;

  PERFORM set_config('request.jwt.claim.sub', v_soa_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_soa, p_prospect_id := v_account, p_service_type := 'trading',
    p_direction := 'Domestic',
    p_lanes := '[]'::jsonb
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_new_id;

  RAISE NOTICE 'T1 -- trading SOA tanpa lane -- user=%, inquiry_id=%, inquiry_no=%, lane_count=% (ekspektasi 0)',
    v_soa_user, v_new_id, v_new_no, v_lane_count;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T1) -- RPC seharusnya SUKSES dan mengembalikan id, dapat NULL';
  END IF;
  IF v_lane_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (T1) -- seharusnya 0 lane utk trading tanpa p_lanes, dapat %', v_lane_count;
  END IF;
  IF v_new_no IS NULL OR v_new_no NOT LIKE 'SOA-%' THEN
    RAISE EXCEPTION 'UJI GAGAL (T1) -- inquiry_no seharusnya berprefiks SOA-, dapat %', v_new_no;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T1)';
END $$;


-- =============================================================================
-- T2 -- trading + akun entitas MSI -> RAISE (guard SOA, Putaran 14 Scope 1b).
-- =============================================================================
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a     uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account     uuid;
  v_caught      boolean := false;
  v_msg         text;
  v_sqlstate    text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (T2) -- nol akun fixture MSI'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'trading',
      p_direction := 'Domestic',
      p_lanes := '[]'::jsonb
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM; v_sqlstate := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'T2 -- trading + akun MSI -- ditolak=%, sqlstate=%, pesan=%', v_caught, v_sqlstate, v_msg;
  IF v_sqlstate = '42702' THEN
    RAISE EXCEPTION 'UJI GAGAL (T2) -- bug ambigu id (42702) di create_inquiry_with_lanes, BUKAN guard SOA yang sedang diuji: %', v_msg;
  END IF;
  IF NOT v_caught OR v_msg NOT LIKE '%General Trading hanya tersedia untuk entitas SOA%' THEN
    RAISE EXCEPTION 'UJI GAGAL (T2) -- seharusnya ditolak dgn pesan guard SOA, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T2)';
END $$;


-- =============================================================================
-- T3 -- trading TANPA p_customer_role -> SUKSES (pengecualian sudah ada di
--       badan fungsi sejak 20261029000001, dipertahankan Putaran 14).
-- =============================================================================
DO $$
DECLARE
  v_company_soa  uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_soa_user     uuid;
  v_account      uuid;
  v_new_id       uuid;
  v_customer_role text;
BEGIN
  SELECT ur.user_id INTO v_soa_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_soa_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T3) -- nol user fixture aktif di company SOA tanpa peran super_admin';
  END IF;

  INSERT INTO public.accounts (company_id, name, is_in_lead_pool, lifecycle_stage)
    VALUES (v_company_soa, 'ZZZTEST P14 T3 Account', false, 'customer')
    RETURNING id INTO v_account;

  PERFORM set_config('request.jwt.claim.sub', v_soa_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_soa, p_prospect_id := v_account, p_service_type := 'trading',
    p_direction := 'Domestic', p_customer_role := NULL,
    p_lanes := '[]'::jsonb
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT customer_role INTO v_customer_role FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE 'T3 -- trading tanpa customer_role -- berhasil, id=%, customer_role_tersimpan=% (ekspektasi NULL)',
    v_new_id, v_customer_role;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T3) -- RPC seharusnya SUKSES tanpa customer_role utk trading';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T3)';
END $$;


-- =============================================================================
-- T4 -- trading: 4 kolom Delivery tersimpan sesuai input.
-- =============================================================================
DO $$
DECLARE
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_soa_user    uuid;
  v_account     uuid;
  v_new_id      uuid;
  v_order_cat   text;
  v_req_date    date;
  v_ship_cost   numeric;
  v_cust_ref    text;
BEGIN
  SELECT ur.user_id INTO v_soa_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_soa_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T4) -- nol user fixture aktif di company SOA tanpa peran super_admin';
  END IF;

  INSERT INTO public.accounts (company_id, name, is_in_lead_pool, lifecycle_stage)
    VALUES (v_company_soa, 'ZZZTEST P14 T4 Account', false, 'customer')
    RETURNING id INTO v_account;

  PERFORM set_config('request.jwt.claim.sub', v_soa_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_soa, p_prospect_id := v_account, p_service_type := 'trading',
    p_direction := 'Domestic',
    p_lanes := '[]'::jsonb,
    p_order_category := 'Baking Tray',
    p_requested_delivery_date := '2026-12-01'::date,
    p_estimated_shipping_cost := 1500000,
    p_customer_reference := 'ZZZTEST-PO-9999'
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT order_category, requested_delivery_date, estimated_shipping_cost, customer_reference
    INTO v_order_cat, v_req_date, v_ship_cost, v_cust_ref
    FROM public.inquiries WHERE id = v_new_id;

  RAISE NOTICE 'T4 -- 4 kolom Delivery -- order_category=%, requested_delivery_date=%, estimated_shipping_cost=%, customer_reference=%',
    v_order_cat, v_req_date, v_ship_cost, v_cust_ref;

  IF v_order_cat IS DISTINCT FROM 'Baking Tray' THEN
    RAISE EXCEPTION 'UJI GAGAL (T4) -- order_category salah, dapat %', v_order_cat;
  END IF;
  IF v_req_date IS DISTINCT FROM '2026-12-01'::date THEN
    RAISE EXCEPTION 'UJI GAGAL (T4) -- requested_delivery_date salah, dapat %', v_req_date;
  END IF;
  IF v_ship_cost IS DISTINCT FROM 1500000::numeric THEN
    RAISE EXCEPTION 'UJI GAGAL (T4) -- estimated_shipping_cost salah, dapat %', v_ship_cost;
  END IF;
  IF v_cust_ref IS DISTINCT FROM 'ZZZTEST-PO-9999' THEN
    RAISE EXCEPTION 'UJI GAGAL (T4) -- customer_reference salah, dapat %', v_cust_ref;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T4)';
END $$;


-- =============================================================================
-- T5 -- customs + p_pricing_basis -> pricing_basis tersimpan (Putaran 14
--       Scope 2, TANPA syarat Direction='Import' -- sengaja dipakai
--       Direction='Export' di uji ini utk membuktikan pengecualian itu).
-- =============================================================================
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a     uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account     uuid;
  v_loc_pol     uuid;
  v_loc_pod     uuid;
  v_new_id      uuid;
  v_pb          text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (T5) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P14-T5-POL', 'Uji P14 T5 POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P14-T5-POD', 'Uji P14 T5 POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'customs',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_pricing_basis := 'All in per CBM',
    p_lanes := jsonb_build_array(jsonb_build_object(
      'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
      'pol', 'Uji P14 T5 POL', 'pod', 'Uji P14 T5 POD'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT pricing_basis INTO v_pb FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE 'T5 -- customs (Direction=Export) + pricing_basis -- tersimpan=% (ekspektasi "All in per CBM")', v_pb;

  IF v_pb IS DISTINCT FROM 'All in per CBM' THEN
    RAISE EXCEPTION 'UJI GAGAL (T5) -- pricing_basis seharusnya tersimpan utk customs walau Direction<>Import, dapat %', v_pb;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T5)';
END $$;


-- =============================================================================
-- T6 -- door_to_door + p_pricing_basis -> tetap tersimpan (regresi -- tidak
--       boleh berubah oleh Putaran 14).
-- =============================================================================
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a     uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account     uuid;
  v_loc_pol     uuid;
  v_loc_pod     uuid;
  v_new_id      uuid;
  v_pb          text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (T6) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P14-T6-POL', 'Uji P14 T6 POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P14-T6-POD', 'Uji P14 T6 POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'door_to_door',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_pricing_basis := 'All in per KG',
    p_lanes := jsonb_build_array(jsonb_build_object(
      'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
      'pol', 'Uji P14 T6 POL', 'pod', 'Uji P14 T6 POD'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT pricing_basis INTO v_pb FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE 'T6 -- door_to_door + pricing_basis (regresi) -- tersimpan=% (ekspektasi "All in per KG")', v_pb;

  IF v_pb IS DISTINCT FROM 'All in per KG' THEN
    RAISE EXCEPTION 'UJI GAGAL (T6) -- pricing_basis seharusnya tetap tersimpan utk door_to_door, dapat %', v_pb;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T6)';
END $$;


-- =============================================================================
-- T7 -- freight_forwarding + p_pricing_basis -> jadi NULL (regresi -- tidak
--       boleh berubah oleh Putaran 14).
-- =============================================================================
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a     uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account     uuid;
  v_loc_pol     uuid;
  v_loc_pod     uuid;
  v_new_id      uuid;
  v_pb          text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (T7) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P14-T7-POL', 'Uji P14 T7 POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-P14-T7-POD', 'Uji P14 T7 POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id INTO v_new_id FROM public.create_inquiry_with_lanes(
    p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_pricing_basis := 'All in per KG',
    p_lanes := jsonb_build_array(jsonb_build_object(
      'pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod,
      'pol', 'Uji P14 T7 POL', 'pod', 'Uji P14 T7 POD'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT pricing_basis INTO v_pb FROM public.inquiries WHERE id = v_new_id;
  RAISE NOTICE 'T7 -- freight_forwarding + pricing_basis (regresi) -- tersimpan=% (ekspektasi NULL)', v_pb;

  IF v_pb IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T7) -- pricing_basis seharusnya tetap NULL utk freight_forwarding, dapat %', v_pb;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T7)';
END $$;


-- =============================================================================
-- T8 -- freight_forwarding dengan p_lanes='[]' -> tetap RAISE (lane
--       minimal-1 TETAP berlaku utk service_type selain 'trading' --
--       regresi, tidak boleh berubah oleh Putaran 14).
-- =============================================================================
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a     uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account     uuid;
  v_caught      boolean := false;
  v_msg         text;
  v_sqlstate    text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company_msi AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (T8) -- nol akun fixture MSI'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company_msi, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
      p_direction := 'Export', p_customer_role := 'Shipper',
      p_lanes := '[]'::jsonb
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM; v_sqlstate := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'T8 -- freight_forwarding tanpa lane -- ditolak=%, sqlstate=%, pesan=%', v_caught, v_sqlstate, v_msg;
  IF v_sqlstate = '42702' THEN
    RAISE EXCEPTION 'UJI GAGAL (T8) -- bug ambigu id (42702) di create_inquiry_with_lanes, BUKAN guard minimal-1-lane yang sedang diuji: %', v_msg;
  END IF;
  IF NOT v_caught OR v_msg NOT LIKE '%Minimal 1 lane%' THEN
    RAISE EXCEPTION 'UJI GAGAL (T8) -- seharusnya tetap ditolak minimal-1-lane, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T8)';
END $$;


-- =============================================================================
-- T9 -- order_category di luar tiga nilai -> ditolak CHECK
--       (inquiries_order_category_check, 20261030000001, sqlstate 23514).
-- =============================================================================
DO $$
DECLARE
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_soa_user    uuid;
  v_account     uuid;
  v_caught      boolean := false;
  v_msg         text;
  v_sqlstate    text;
BEGIN
  SELECT ur.user_id INTO v_soa_user FROM public.user_roles ur
   WHERE ur.company_id = v_company_soa AND ur.is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
        WHERE ur_sa.user_id = ur.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
     )
   ORDER BY ur.user_id
   LIMIT 1;
  IF v_soa_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T9) -- nol user fixture aktif di company SOA tanpa peran super_admin';
  END IF;

  INSERT INTO public.accounts (company_id, name, is_in_lead_pool, lifecycle_stage)
    VALUES (v_company_soa, 'ZZZTEST P14 T9 Account', false, 'customer')
    RETURNING id INTO v_account;

  PERFORM set_config('request.jwt.claim.sub', v_soa_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM t.id FROM public.create_inquiry_with_lanes(
      p_company_id := v_company_soa, p_prospect_id := v_account, p_service_type := 'trading',
      p_direction := 'Domestic',
      p_lanes := '[]'::jsonb,
      p_order_category := 'Nilai Ngawur'
    ) AS t;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM; v_sqlstate := SQLSTATE;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE 'T9 -- order_category ngawur -- ditolak=%, sqlstate=% (ekspektasi 23514), pesan=%', v_caught, v_sqlstate, v_msg;
  IF v_sqlstate = '42702' THEN
    RAISE EXCEPTION 'UJI GAGAL (T9) -- bug ambigu id (42702) di create_inquiry_with_lanes, BUKAN CHECK order_category yang sedang diuji: %', v_msg;
  END IF;
  IF NOT v_caught OR v_sqlstate IS DISTINCT FROM '23514' THEN
    RAISE EXCEPTION 'UJI GAGAL (T9) -- seharusnya ditolak CHECK (sqlstate 23514), dapat caught=% sqlstate=% pesan=%', v_caught, v_sqlstate, v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (T9)';
END $$;


-- =============================================================================
-- T10 -- K1c tidak terganggu: 4 kolom baru (order_category,
--        requested_delivery_date, estimated_shipping_cost,
--        customer_reference) TIDAK muncul di daftar kolom yang dijaga
--        trigger trg_z_guard_inquiries_protected_columns (fungsi
--        trg_fn_guard_inquiries_protected_columns). MURNI QUERY KATALOG,
--        NOL PERUBAHAN DATA -- TIDAK memaksa RAISE EXCEPTION di akhir
--        (tidak ada yang perlu dibatalkan).
-- =============================================================================
DO $$
DECLARE
  v_triggerdef text;
BEGIN
  SELECT pg_get_triggerdef(t.oid) INTO v_triggerdef
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'inquiries' AND t.tgname = 'trg_z_guard_inquiries_protected_columns';

  IF v_triggerdef IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (T10) -- trigger trg_z_guard_inquiries_protected_columns tidak ditemukan pada public.inquiries';
  END IF;

  RAISE NOTICE 'T10 -- definisi trigger K1c: %', v_triggerdef;

  IF v_triggerdef ~* '\morder_category\M'
     OR v_triggerdef ~* '\mrequested_delivery_date\M'
     OR v_triggerdef ~* '\mestimated_shipping_cost\M'
     OR v_triggerdef ~* '\mcustomer_reference\M' THEN
    RAISE EXCEPTION 'UJI GAGAL (T10) -- salah satu dari 4 kolom baru Putaran 14 MUNCUL di trigger K1c (seharusnya tidak): %', v_triggerdef;
  END IF;

  RAISE NOTICE 'T10 -- LULUS -- 4 kolom baru Putaran 14 TIDAK ada di daftar kolom terjaga K1c';
END $$;
