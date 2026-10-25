-- =============================================================================
-- Skrip uji transaksi-aman -- Inquiry Management Putaran 5, K1c: guard kolom
-- terjaga (status WON/owner_id/inquiry_type hanya lewat fungsi), RLS
-- inquiries_read/inquiries_update entity-scoped, locations super_admin-only.
-- Migrasi diuji: 20261026000001 / 20261026000002 / 20261026000003.
--
-- TIDAK DIJALANKAN oleh siapa pun di sesi penulisan ini -- hanya ditulis
-- untuk Vir eksekusi manual di staging SESUDAH ketiga migrasi jalan, dalam
-- urutan nomornya (20261026000001 WAJIB dijalankan Den langsung di SQL
-- Editor -- memuat DROP TRIGGER; 20261026000002/000003 boleh lewat
-- connector Vir -- ALTER POLICY, tidak memuat DROP).
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-4.sql / verify-inquiry-putaran-5-quotation.sql.
-- Blok (k) murni introspeksi katalog (nol tulis) -- RAISE EXCEPTION di
-- akhirnya tidak membatalkan apa pun yang berarti, dipertahankan hanya demi
-- bentuk yang seragam.
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (angka/nilai yang
-- dicek, bukan hanya "OK"/"FAIL").
--
-- FIXTURE inquiries/locations -- INSERT LANGSUNG sebagai postgres (SEBELUM
-- SET LOCAL ROLE authenticated), di luar impersonasi (setara superuser,
-- RLS tidak berlaku, dan REVOKE INSERT migrasi 20261026000001 hanya
-- mencabut privilege role authenticated -- postgres tidak terpengaruh).
-- inquiry_no SENGAJA TIDAK dikirim di fixture mana pun -- trigger BEFORE
-- INSERT trg_z_assign_inquiry_no (migrasi 20261022000001, LIVE sebelum
-- Putaran 5) SELALU menimpanya dengan nomor server-generated, apa pun yang
-- dikirim atau tidak dikirim client/postgres (dibuktikan ulang di K1d).
--
-- Identitas akun uji staging (SAMA PERSIS dengan verify-inquiry-putaran-4/
-- 5(-quotation).sql, diberikan di instruksi tugas):
--   manager/supervisor (level 6)    : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (non-manager, pembuat)  : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (non-manager, lain)     : 6739c239-e2ff-48ff-97ed-23059f749218
--   super admin (ZZZTEST Admin)     : d730c348-ceab-463d-bc3b-458126314373
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
-- company_id SOA = d2e5e565-5f67-4954-b8d9-5979a2a0c697 (CLAUDE.md) -- dipakai
-- di blok (o) sebagai "entitas B"; user cross-entity dicari DINAMIS (lihat
-- blok (o) -- pola sama blok (h) verify-inquiry-putaran-4.sql).
-- =============================================================================


-- =============================================================================
-- BAGIAN 1 -- guard trigger menolak UPDATE langsung pada status WON/
-- owner_id/inquiry_type, oleh PEMILIK sendiri (bukan RLS yang menolak --
-- RLS inquiries_update SUDAH mengizinkan pemilik menulis kolom apa pun;
-- trigger BARU yang mencegat tiga kolom ini secara spesifik).
-- =============================================================================

-- ===== (a) Sales pemilik -- UPDATE langsung status ke WON -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_inq_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
  v_status  text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (a) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.inquiries SET status = 'WON' WHERE id = v_inq_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_status FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(a) UPDATE langsung status->WON oleh pemilik -- ditolak=%, pesan=%, status akhir=%', v_caught, v_msg, v_status;
  IF NOT v_caught OR v_status <> 'OPEN' THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- seharusnya ditolak, status tetap OPEN';
  END IF;
  IF v_msg NOT LIKE '%tidak bisa diubah langsung ke/dari WON%' THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (a)';
END $$;


-- ===== (b) Sales pemilik -- UPDATE langsung owner_id -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid;
  v_inq_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
  v_owner   uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (b) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.inquiries SET owner_id = v_sales_b WHERE id = v_inq_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(b) UPDATE langsung owner_id oleh pemilik -- ditolak=%, pesan=%, owner_id akhir=%', v_caught, v_msg, v_owner;
  IF NOT v_caught OR v_owner <> v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- seharusnya ditolak, owner_id tetap sales A';
  END IF;
  IF v_msg NOT LIKE '%owner_id tidak bisa diubah langsung%' THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (b)';
END $$;


-- ===== (c) Sales pemilik -- UPDATE langsung inquiry_type -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_inq_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
  v_type    text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (c) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.inquiries SET inquiry_type = 'Rate Sheet Request' WHERE id = v_inq_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT inquiry_type INTO v_type FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(c) UPDATE langsung inquiry_type oleh pemilik -- ditolak=%, pesan=%, inquiry_type akhir=%', v_caught, v_msg, v_type;
  IF NOT v_caught OR v_type <> 'Single Shipment' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- seharusnya ditolak, inquiry_type tetap default';
  END IF;
  IF v_msg NOT LIKE '%inquiry_type tidak bisa diubah setelah dibuat%' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (c)';
END $$;


-- ===== (d) Sales -- INSERT langsung ke inquiries -- DITOLAK (permission
--           denied, table-level REVOKE -- BUKAN RLS, ditolak sebelum RLS
--           sempat dievaluasi) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_caught  boolean := false;
  v_msg     text;
  v_count_before integer;
  v_count_after  integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (d) -- nol akun fixture MSI'; END IF;

  SELECT count(*) INTO v_count_before FROM public.inquiries WHERE company_id = v_company;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
    VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_count_after FROM public.inquiries WHERE company_id = v_company;
  RAISE NOTICE '(d) INSERT langsung oleh sales -- ditolak=%, pesan=%, jumlah baris sebelum=%/sesudah=%', v_caught, v_msg, v_count_before, v_count_after;
  IF NOT v_caught OR v_count_after <> v_count_before THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- INSERT langsung seharusnya ditolak, nol baris baru';
  END IF;
  IF v_msg NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- pesan error seharusnya "permission denied" (GRANT-level, bukan RLS), dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (d)';
END $$;


-- =============================================================================
-- BAGIAN 2 -- seluruh jalur SAH tetap lolos (SECURITY DEFINER -- current_user
-- <> 'authenticated' selama fungsi berjalan, guard trigger melolosankannya).
-- =============================================================================

-- ===== (e) create_inquiry_with_lanes tetap SUKSES =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid;
  v_new_id uuid; v_new_no text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (e) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K1C-E-POL', 'Uji K1c E POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K1C-E-POD', 'Uji K1c E POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.inquiry_no INTO v_new_id, v_new_no FROM public.create_inquiry_with_lanes(
    p_company_id := v_company, p_prospect_id := v_account, p_service_type := 'freight_forwarding',
    p_direction := 'Export', p_customer_role := 'Shipper',
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'Uji K1c E POL', 'pod', 'Uji K1c E POD'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(e) create_inquiry_with_lanes -- id=%, no=%', v_new_id, v_new_no;
  IF v_new_id IS NULL OR v_new_no IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (e) -- create_inquiry_with_lanes seharusnya tetap sukses sesudah guard terpasang';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (e)';
END $$;


-- ===== (f) update_inquiry_lanes tetap SUKSES (menulis lane pertama kali
--           pada inquiry fixture yang nol lane) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_loc_pol uuid; v_loc_pod uuid;
  v_inq_id uuid; v_lane_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (f) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K1C-F-POL', 'Uji K1c F POL', 'Singapore', 'Seaport') RETURNING id INTO v_loc_pol;
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K1C-F-POD', 'Uji K1c F POD', 'Indonesia', 'Seaport') RETURNING id INTO v_loc_pod;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM t.id FROM public.update_inquiry_lanes(
    p_inquiry_id := v_inq_id,
    p_lanes := jsonb_build_array(jsonb_build_object('pol_location_id', v_loc_pol, 'pod_location_id', v_loc_pod, 'pol', 'Uji K1c F POL', 'pod', 'Uji K1c F POD'))
  ) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_lane_count FROM public.inquiry_lanes WHERE inquiry_id = v_inq_id;
  RAISE NOTICE '(f) update_inquiry_lanes -- lane_count=%', v_lane_count;
  IF v_lane_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (f) -- update_inquiry_lanes seharusnya tetap sukses, dapat % lane', v_lane_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (f)';
END $$;


-- ===== (g) mark_inquiry_won tetap SUKSES (pemilik, alasan whitelist +
--           bukti berawalan benar -- nol EXISTS-check storage.objects di
--           fungsi ini, path palsu berawalan benar cukup) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid; v_path text;
  v_status text; v_won_reason text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (g) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'QUOTED', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  v_path := v_company::text || '/' || v_inq_id::text || '/zzztest-bukti-g.pdf';

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_path, 'Catatan uji K1c g');
  EXECUTE 'RESET ROLE';

  SELECT status, won_reason INTO v_status, v_won_reason FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(g) mark_inquiry_won -- status=%, won_reason=%', v_status, v_won_reason;
  IF v_status <> 'WON' OR v_won_reason <> 'Verbal confirmation' THEN
    RAISE EXCEPTION 'UJI GAGAL (g) -- mark_inquiry_won seharusnya tetap sukses sesudah guard terpasang';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (g)';
END $$;


-- ===== (h) revert_manual_win tetap SUKSES (manager; mark_inquiry_won dulu
--           utk membentuk riwayat status yang dibutuhkan revert) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_inq_id uuid; v_path text;
  v_status text; v_revert_reason text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (h) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'QUOTED', v_manager, v_manager)
  RETURNING id INTO v_inq_id;

  v_path := v_company::text || '/' || v_inq_id::text || '/zzztest-bukti-h.pdf';

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_path, NULL);
  PERFORM public.revert_manual_win(v_inq_id, 'Uji K1c h -- revert sengaja');
  EXECUTE 'RESET ROLE';

  SELECT status, revert_won_reason INTO v_status, v_revert_reason FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(h) revert_manual_win -- status akhir=% (harus QUOTED, status semula), revert_won_reason=%', v_status, v_revert_reason;
  IF v_status <> 'QUOTED' OR v_revert_reason IS DISTINCT FROM 'Uji K1c h -- revert sengaja' THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- revert_manual_win seharusnya tetap sukses sesudah guard terpasang';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (h)';
END $$;


-- ===== (i) reassign_inquiry_owner tetap SUKSES (manager) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_inq_id uuid; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (i) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_b);
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(i) reassign_inquiry_owner -- owner_id akhir=% (harus sales B)', v_owner;
  IF v_owner IS DISTINCT FROM v_sales_b THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- reassign_inquiry_owner seharusnya tetap sukses sesudah guard terpasang';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (i)';
END $$;


-- ===== (j) close_inquiry_as_duplicate tetap SUKSES (manager) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_account uuid; v_keep_id uuid; v_dup_id uuid;
  v_status text; v_dup_of uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (j) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_manager, v_manager)
  RETURNING id INTO v_keep_id;
  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_manager, v_manager)
  RETURNING id INTO v_dup_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.close_inquiry_as_duplicate(v_dup_id, v_keep_id);
  EXECUTE 'RESET ROLE';

  SELECT status, duplicate_of_id INTO v_status, v_dup_of FROM public.inquiries WHERE id = v_dup_id;
  RAISE NOTICE '(j) close_inquiry_as_duplicate -- status=% (harus CANCELLED), duplicate_of_id=% (harus = kept)', v_status, v_dup_of;
  IF v_status <> 'CANCELLED' OR v_dup_of IS DISTINCT FROM v_keep_id THEN
    RAISE EXCEPTION 'UJI GAGAL (j) -- close_inquiry_as_duplicate seharusnya tetap sukses sesudah guard terpasang';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (j)';
END $$;


-- ===== (k) EMPAT trigger function pengubah status OTOMATIS (In Review,
--           Quoted, Negotiation, WON-saat-quotation-Accepted) seluruhnya
--           SECURITY DEFINER -- premis mekanisme guard (current_user)
--           terbukti berlaku untuk mereka juga. Introspeksi katalog SAJA,
--           nol tulis -- uji end-to-end (memicu lewat PRF submit/quotation
--           sent/revisi/accept sungguhan) dikerjakan Vir sesudah K1d
--           digabung, sesuai instruksi tugas. =====
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef = true
     AND p.proname IN (
       'set_inquiry_review_on_prf_submit',
       'set_inquiry_quoted_on_quotation_sent',
       'set_inquiry_negotiation_on_quotation_revision',
       'trg_fn_inquiry_won_on_quotation_accepted'
     );
  RAISE NOTICE '(k) jumlah fungsi SECURITY DEFINER dari 4 yang diharapkan: %', v_count;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'UJI GAGAL (k) -- seharusnya 4 fungsi SECURITY DEFINER, dapat % -- cek nama fungsi (mungkin berubah) atau SECURITY mode berubah jadi INVOKER', v_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (k)';
END $$;


-- =============================================================================
-- BAGIAN 3 -- jalur UPDATE langsung yang SENGAJA TIDAK disentuh guard
-- (edit per-section, LOST, CANCELLED) tetap berhasil untuk pemilik.
-- =============================================================================

-- ===== (l) Edit per-section (kolom BUKAN salah satu dari 6 yang terjaga)
--           lewat UPDATE langsung -- TETAP SUKSES =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid; v_notes text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (l) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inquiries SET notes = 'Uji K1c l -- edit per-section' WHERE id = v_inq_id;
  EXECUTE 'RESET ROLE';

  SELECT notes INTO v_notes FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(l) Edit per-section (notes) oleh pemilik -- notes=%', v_notes;
  IF v_notes IS DISTINCT FROM 'Uji K1c l -- edit per-section' THEN
    RAISE EXCEPTION 'UJI GAGAL (l) -- edit per-section seharusnya tetap sukses, guard tidak boleh menyentuh kolom di luar daftar terjaga';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (l)';
END $$;


-- ===== (m) status->LOST lewat UPDATE langsung -- TETAP SUKSES =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid; v_status text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (m) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inquiries SET status = 'LOST' WHERE id = v_inq_id;
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_status FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(m) UPDATE langsung status->LOST oleh pemilik -- status akhir=%', v_status;
  IF v_status <> 'LOST' THEN
    RAISE EXCEPTION 'UJI GAGAL (m) -- status->LOST seharusnya tetap sukses, guard hanya mencegat transisi ke/dari WON';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (m)';
END $$;


-- ===== (n) status->CANCELLED lewat UPDATE langsung -- TETAP SUKSES =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid; v_status text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (n) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inquiries SET status = 'CANCELLED' WHERE id = v_inq_id;
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_status FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(n) UPDATE langsung status->CANCELLED oleh pemilik -- status akhir=%', v_status;
  IF v_status <> 'CANCELLED' THEN
    RAISE EXCEPTION 'UJI GAGAL (n) -- status->CANCELLED seharusnya tetap sukses, guard hanya mencegat transisi ke/dari WON';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (n)';
END $$;


-- =============================================================================
-- BAGIAN 4 -- RLS inquiries_read/inquiries_update entity-scoped (migrasi
-- 20261026000002).
-- =============================================================================

-- ===== (o) Manager entitas MSI yang JUGA punya peran NON-manager di SOA --
--           TIDAK LAGI bisa membaca atau mengubah inquiry SOA sebagai
--           "manager" (dicari DINAMIS -- pola sama blok (h)
--           verify-inquiry-putaran-4.sql; RAISE EXCEPTION jelas kalau nol
--           kandidat ditemukan, bukan silent-skip) =====
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_cross_user uuid;
  v_account_soa uuid;
  v_inq_id uuid;
  v_read_count integer;
  v_update_count integer;
BEGIN
  SELECT ur_a.user_id INTO v_cross_user
  FROM public.user_roles ur_a
  JOIN public.roles r_a ON r_a.id = ur_a.role_id
  WHERE ur_a.company_id = v_company_msi AND ur_a.is_active = true AND r_a.level <= 6
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur_b JOIN public.roles r_b ON r_b.id = ur_b.role_id
       WHERE ur_b.user_id = ur_a.user_id AND ur_b.company_id = v_company_soa AND ur_b.is_active = true AND r_b.level > 6
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur_sa JOIN public.roles r_sa ON r_sa.id = ur_sa.role_id
       WHERE ur_sa.user_id = ur_a.user_id AND ur_sa.is_active = true AND r_sa.code = 'super_admin'
    )
  ORDER BY ur_a.user_id
  LIMIT 1;

  IF v_cross_user IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (o) -- nol user fixture yang manager-ke-atas di MSI DAN punya peran non-manager aktif di SOA (dan bukan super_admin) -- cari/buat akun uji semacam ini di staging sebelum lanjut';
  END IF;

  SELECT id INTO v_account_soa FROM public.accounts
   WHERE company_id = v_company_soa AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account_soa IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (o) -- nol akun fixture SOA'; END IF;

  -- owner_id/created_by SENGAJA NULL -- satu-satunya cara v_cross_user bisa
  -- lihat/ubah baris ini adalah lewat klausa manager, yang sedang diuji.
  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status)
  VALUES (v_company_soa, v_account_soa, 'freight_forwarding', 'Export', 'Shipper', 'OPEN')
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_cross_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_read_count FROM public.inquiries WHERE id = v_inq_id;
  UPDATE public.inquiries SET notes = 'harus tidak pernah tersimpan' WHERE id = v_inq_id;
  GET DIAGNOSTICS v_update_count = ROW_COUNT;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(o) user % (manager MSI, non-manager SOA) atas inquiry SOA % -- baris terbaca=% (harus 0), baris terubah=% (harus 0)', v_cross_user, v_inq_id, v_read_count, v_update_count;
  IF v_read_count <> 0 OR v_update_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (o) -- seharusnya 0/0, user ini TIDAK manager di entitas SOA';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (o)';
END $$;


-- =============================================================================
-- BAGIAN 5 -- locations super_admin-only write (migrasi 20261026000003).
-- =============================================================================

-- ===== (p) Manager (non-super-admin) -- INSERT dan UPDATE locations --
--           KEDUANYA DITOLAK =====
DO $$
DECLARE
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_existing_loc uuid;
  v_caught_insert boolean := false; v_msg_insert text;
  v_caught_update boolean := false; v_msg_update text;
BEGIN
  SELECT id INTO v_existing_loc FROM public.locations LIMIT 1;
  IF v_existing_loc IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (p) -- nol baris locations existing utk uji UPDATE'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K1C-P-INS', 'Uji K1c P Insert', 'Singapore', 'Seaport');
  EXCEPTION WHEN OTHERS THEN
    v_caught_insert := true; v_msg_insert := SQLERRM;
  END;
  BEGIN
    UPDATE public.locations SET name = 'harus tidak pernah tersimpan' WHERE id = v_existing_loc;
  EXCEPTION WHEN OTHERS THEN
    v_caught_update := true; v_msg_update := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(p) Manager non-super-admin -- INSERT ditolak=% (%), UPDATE ditolak=% (%)', v_caught_insert, v_msg_insert, v_caught_update, v_msg_update;
  IF NOT v_caught_insert OR NOT v_caught_update THEN
    RAISE EXCEPTION 'UJI GAGAL (p) -- manager non-super-admin seharusnya ditolak KEDUA aksi (insert & update)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (p)';
END $$;


-- ===== (q) Super admin -- INSERT dan UPDATE locations -- KEDUANYA SUKSES =====
DO $$
DECLARE
  v_super uuid := 'd730c348-ceab-463d-bc3b-458126314373';
  v_new_loc uuid;
  v_name_after text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.locations (code, name, country, type) VALUES ('ZZZTEST-K1C-Q-INS', 'Uji K1c Q Insert', 'Singapore', 'Seaport')
    RETURNING id INTO v_new_loc;
  UPDATE public.locations SET name = 'Uji K1c Q Insert (diubah)' WHERE id = v_new_loc;
  EXECUTE 'RESET ROLE';

  SELECT name INTO v_name_after FROM public.locations WHERE id = v_new_loc;
  RAISE NOTICE '(q) Super admin -- lokasi baru id=%, nama akhir=%', v_new_loc, v_name_after;
  IF v_new_loc IS NULL OR v_name_after IS DISTINCT FROM 'Uji K1c Q Insert (diubah)' THEN
    RAISE EXCEPTION 'UJI GAGAL (q) -- super_admin seharusnya tetap bisa insert DAN update locations';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (q)';
END $$;
