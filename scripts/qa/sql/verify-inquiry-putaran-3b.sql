-- =============================================================================
-- Skrip uji transaksi-aman untuk Inquiry Management Putaran 3, Tahap 3B
-- (reassign_inquiry_owner, migrasi 20261024000004; list_possible_duplicate_
-- inquiry_pairs, migrasi 20261024000005; grant menu
-- crm_inquiry_owner_assignment, migrasi 20261024000006). TIDAK DIJALANKAN
-- oleh siapa pun di sesi penulisan ini -- hanya ditulis untuk Vir eksekusi
-- manual di staging SESUDAH ketiga migrasi jalan, dalam urutan nomornya.
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-3a.sql / verify-locations-master.sql. Blok (j)
-- murni BACA, RAISE EXCEPTION di akhirnya tidak membatalkan apa pun --
-- dipertahankan hanya demi bentuk yang seragam.
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (bukan hanya lolos
-- diam-diam) -- angka yang dicek, bukan cuma "OK"/"FAIL".
--
-- Identitas akun uji staging (semuanya perusahaan MSI, DIBERIKAN di
-- instruksi tugas -- dipakai ulang dari skrip Irisan 3/4/6 & Tahap 3A):
--   manager/supervisor (level 6)    : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (owner)                 : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (lain)                  : 6739c239-e2ff-48ff-97ed-23059f749218
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
--
-- ⚠️ Fixture akun (`accounts`, customer/prospect) DICARI DINAMIS --
-- `is_in_lead_pool=false AND deleted_at IS NULL` -- bukan di-hardcode
-- (instruksi eksplisit, pola sama verify-inquiry-putaran-3a.sql).
-- ⚠️ Fixture `locations` (blok h/i) JUGA dicari dinamis -- dua baris
-- MANA PUN yang ada di staging, bukan UUID tertentu yang ditebak. Kalau
-- staging punya <2 lokasi, blok itu RAISE EXCEPTION dengan pesan jelas
-- (bukan gagal membingungkan di INSERT berikutnya).
-- ⚠️ TD-220 test (f) -- "owner baru dari company lain atau profil
-- nonaktif" DIUJI DENGAN gen_random_uuid() (uuid acak yang PASTI tidak
-- terdaftar di user_roles mana pun), BUKAN uuid pengguna sungguhan dari
-- company lain yang TIDAK diberikan di fixture tugas -- menguji "owner
-- baru tidak punya role kandidat apa pun di company ini sama sekali",
-- lewat JALUR PEMERIKSAAN YANG SAMA (IF NOT EXISTS ... r.code IN (...))
-- yang juga menolak kasus company-lain/nonaktif. Sub-kasus "company lain"
-- dan "profil nonaktif" SECARA SPESIFIK tidak diuji terpisah -- dicatat
-- sebagai gap, bukan ditebak dengan UUID yang tidak dikonfirmasi.
--
-- Dua kebutuhan sesi untuk blok yang menjalankan apa pun SEBAGAI akun
-- tertentu: set_config('request.jwt.claim.sub', <uuid>, true) +
-- EXECUTE 'SET LOCAL ROLE authenticated'. EXECUTE 'RESET ROLE' WAJIB
-- sebelum membaca balik audit_logs/notifications sbg verifikasi (postgres,
-- bypass RLS) -- membaca SAAT MASIH ber-ROLE authenticated milik akun yang
-- baru dicoba bisa salah menyimpulkan "nol baris" padahal SELECT-nya
-- sendiri yang disaring RLS (audit_logs read = is_admin_or_above();
-- notifications_read = user_id=auth.uid(), bukan milik aktor pemanggil).
--
-- Nomor urut inquiry_no via split_part(inquiry_no,'-',5) -- disebut di
-- blok (a) sbg sanity-check ringan generator nomor tetap benar untuk baris
-- uji baru. Jangan pernah max() pada kolom uuid. Setiap konkatenasi string
-- yang melibatkan variabel yang BISA NULL dibungkus COALESCE eksplisit
-- (NULL || apa pun = NULL diam-diam di Postgres -- akan membuat pesan
-- RAISE kosong/hilang, bukan error yang terlihat).
-- =============================================================================

-- =====================================================================
-- (a) Manager reassign inquiry YANG SUDAH BEROWNER (sales_b -> sales_a):
--     owner berubah, TEPAT 1 baris audit REASSIGN_INQUIRY_OWNER, TEPAT 1
--     notifikasi ke owner baru dengan company_id = company inquiry.
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492'; -- MSI
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid;
  v_inq     uuid;
  v_inquiry_no text;
  v_owner   uuid;
  v_audit_count int;
  v_notif_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture (is_in_lead_pool=false, deleted_at IS NULL) di company MSI';
  END IF;

  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, v_sales_b, v_sales_b, v_account, 'freight_forwarding', 'OPEN')
    RETURNING id, inquiry_no INTO v_inq, v_inquiry_no;
  RAISE NOTICE 'Inquiry uji dibuat %, urut=%, owner awal=sales_b', v_inquiry_no, split_part(v_inquiry_no, '-', 5);

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq, v_sales_a);
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq;
  IF v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- owner seharusnya sales_a, dapat %', COALESCE(v_owner::text, '<NULL>');
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE action = 'REASSIGN_INQUIRY_OWNER' AND entity_id = v_inq;
  SELECT count(*) INTO v_notif_count FROM public.notifications
   WHERE event_type = 'inquiry_reassigned' AND reference_id = v_inq AND user_id = v_sales_a AND company_id = v_company;
  RAISE NOTICE '(a) owner=%% · audit_count=% · notif_count=%', v_audit_count, v_notif_count;
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- seharusnya TEPAT 1 baris audit REASSIGN_INQUIRY_OWNER, dapat %', v_audit_count;
  END IF;
  IF v_notif_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- seharusnya TEPAT 1 notifikasi ke owner baru dgn company_id inquiry, dapat %', v_notif_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (a)';
END $$;

-- =====================================================================
-- (b) Reassign inquiry owner_id NULL (Unassigned) -> berhasil; notes
--     audit menyebut 'Unassigned' utk owner lama.
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_inq     uuid;
  v_owner   uuid;
  v_notes   text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture';
  END IF;

  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, NULL, v_manager, v_account, 'freight_forwarding', 'OPEN')
    RETURNING id INTO v_inq;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq, v_sales_a);
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq;
  IF v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- owner seharusnya sales_a, dapat %', COALESCE(v_owner::text, '<NULL>');
  END IF;

  SELECT notes INTO v_notes FROM public.audit_logs
   WHERE action = 'REASSIGN_INQUIRY_OWNER' AND entity_id = v_inq
   ORDER BY created_at DESC LIMIT 1;
  RAISE NOTICE '(b) notes audit = %', COALESCE(v_notes, '<NULL>');
  IF v_notes IS NULL OR v_notes NOT ILIKE '%Unassigned%' THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- notes audit seharusnya menyebut Unassigned, dapat %', COALESCE(v_notes, '<NULL>');
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (b)';
END $$;

-- =====================================================================
-- (c) Manager meng-assign ke DIRINYA SENDIRI: audit ADA, notifikasi NOL
--     (rule 111: "Assigning to yourself sends nothing.").
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid;
  v_inq     uuid;
  v_owner   uuid;
  v_audit_count int;
  v_notif_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture';
  END IF;

  -- Owner AWAL sales_b (BUKAN manager) supaya reassign ke manager BUKAN no-op.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, v_sales_b, v_sales_b, v_account, 'freight_forwarding', 'OPEN')
    RETURNING id INTO v_inq;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq, v_manager);
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq;
  IF v_owner IS DISTINCT FROM v_manager THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- owner seharusnya manager (self-assign), dapat %. Catatan: tes ini MENGANDAIKAN fixture manager/supervisor adalah role yg JUGA termasuk kandidat owner (level 6 DAN OPERATIONAL_ROSTER_ROLES, mis. bd_sales_spv_console/forwarding) -- kalau gagal di titik ini, kemungkinan fixture-nya bukan role semacam itu, bukan bug RPC.', COALESCE(v_owner::text, '<NULL>');
  END IF;

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE action = 'REASSIGN_INQUIRY_OWNER' AND entity_id = v_inq;
  SELECT count(*) INTO v_notif_count FROM public.notifications
   WHERE event_type = 'inquiry_reassigned' AND reference_id = v_inq;
  RAISE NOTICE '(c) audit_count=% · notif_count=% (harus 0)', v_audit_count, v_notif_count;
  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- seharusnya TEPAT 1 baris audit, dapat %', v_audit_count;
  END IF;
  IF v_notif_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- self-assign seharusnya NOL notifikasi (rule 111), dapat %', v_notif_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (c)';
END $$;

-- =====================================================================
-- (d) Pemanggil sales NON-MANAGER -> exception (gerbang 1a).
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid;
  v_inq     uuid;
  v_caught  boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture';
  END IF;

  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN')
    RETURNING id INTO v_inq;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    -- Sales A bahkan mencoba reassign inquiry MILIKNYA SENDIRI -- RPC ini
    -- TIDAK punya jalur "owner boleh reassign sendiri" (instruksi 1a: HANYA
    -- manager-ke-atas/super admin, tanpa kecuali pemilik).
    PERFORM public.reassign_inquiry_owner(v_inq, v_sales_b);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(d) sales non-manager ditolak, pesan: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- sales non-manager seharusnya ditolak tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (d)';
END $$;

-- =====================================================================
-- (e) Inquiry berstatus WON/LOST/CANCELLED -> exception (gerbang 1b).
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid;
  v_inq     uuid;
  v_caught  boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture';
  END IF;

  -- status dipaksa CANCELLED langsung di INSERT (hindari trigger closure
  -- stamping/won_reason yang tidak relevan bagi tes ini -- murni menguji
  -- gerbang status reassign_inquiry_owner, bukan mesin status closure).
  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'CANCELLED')
    RETURNING id INTO v_inq;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reassign_inquiry_owner(v_inq, v_sales_b);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(e) status CANCELLED ditolak, pesan: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (e) -- inquiry CANCELLED seharusnya ditolak tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (e)';
END $$;

-- =====================================================================
-- (f) Owner baru TANPA role kandidat apa pun di company ini -> exception
--     (gerbang 1c). Diuji dgn gen_random_uuid() -- uuid PASTI tidak
--     terdaftar user_roles mana pun, bukan tebakan user company lain
--     yang tak diberikan fixture-nya (lihat catatan header file).
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_inq     uuid;
  v_fake_owner uuid := gen_random_uuid();
  v_caught  boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture';
  END IF;

  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN')
    RETURNING id INTO v_inq;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reassign_inquiry_owner(v_inq, v_fake_owner);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(f) owner tanpa role kandidat ditolak, pesan: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (f) -- owner acak tanpa role kandidat seharusnya ditolak tapi lolos';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (f)';
END $$;

-- =====================================================================
-- (g) Owner baru = owner sekarang (BUKAN NULL) -> no-op: NOL audit,
--     NOL notifikasi.
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_inq     uuid;
  v_audit_count int;
  v_notif_count int;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture';
  END IF;

  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, status)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN')
    RETURNING id INTO v_inq;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq, v_sales_a); -- owner baru == owner sekarang
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_audit_count FROM public.audit_logs
   WHERE action = 'REASSIGN_INQUIRY_OWNER' AND entity_id = v_inq;
  SELECT count(*) INTO v_notif_count FROM public.notifications
   WHERE event_type = 'inquiry_reassigned' AND reference_id = v_inq;
  RAISE NOTICE '(g) no-op -- audit_count=% · notif_count=% (keduanya harus 0)', v_audit_count, v_notif_count;
  IF v_audit_count <> 0 OR v_notif_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (g) -- no-op seharusnya NOL audit & NOL notifikasi, dapat audit=% notif=%', v_audit_count, v_notif_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (g)';
END $$;

-- =====================================================================
-- (h)+(i) Possible Duplicates -- pasangan OPEN customer/POL/POD/container
-- sama (Keep=lebih lama, tiebreak id saat created_at identik); pol/pod
-- NULL dikecualikan; container berbeda dikecualikan; selisih >30 hari
-- dikecualikan; status non-OPEN dikecualikan; sales ditolak gerbang;
-- manager berhasil; hasilnya langsung dipakai close_inquiry_as_duplicate
-- TANPA error.
-- =====================================================================
DO $$
DECLARE
  v_company   uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager   uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a   uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account   uuid;
  v_pol_loc   uuid;
  v_pod_loc   uuid;
  v_containers text[] := ARRAY['20GP', '40HC'];
  v_other_containers text[] := ARRAY['40HC'];
  v_now       timestamptz := now();
  v_keep_id   uuid;
  v_dup_id    uuid;
  v_null_loc_id uuid;
  v_diff_container_id uuid;
  v_too_far_id uuid;
  v_wrong_status_id uuid;
  -- Pasangan tiebreak created_at identik -- dua id baru digenerate dulu,
  -- SEBELUM INSERT, supaya tahu mana yg lebih kecil TANPA max() pada uuid.
  v_tie_a     uuid := gen_random_uuid();
  v_tie_b     uuid := gen_random_uuid();
  v_tie_small uuid;
  v_tie_big   uuid;
  v_match_count int;
  v_tie_keep  uuid;
  v_tie_dup   uuid;
  v_null_hit  int;
  v_diffcontainer_hit int;
  v_toofar_hit int;
  v_wrongstatus_hit int;
  v_caught    boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture (is_in_lead_pool=false, deleted_at IS NULL)';
  END IF;

  SELECT id INTO v_pol_loc FROM public.locations ORDER BY code LIMIT 1 OFFSET 0;
  SELECT id INTO v_pod_loc FROM public.locations ORDER BY code LIMIT 1 OFFSET 1;
  IF v_pol_loc IS NULL OR v_pod_loc IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- staging butuh minimal 2 baris locations utk uji ini, tidak ditemukan';
  END IF;

  -- KEEP (lebih lama, 10 hari lalu) dan DUPLICATE (5 hari lalu) -- sama
  -- customer/pol/pod/container, keduanya OPEN.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            v_pol_loc, v_pod_loc, v_containers, v_now - interval '10 days')
    RETURNING id INTO v_keep_id;
  INSERT INTO public.inquiries (company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            v_pol_loc, v_pod_loc, v_containers, v_now - interval '5 days')
    RETURNING id INTO v_dup_id;

  -- Negatif (h1): pol/pod location NULL -- tidak boleh muncul di pasangan apa pun.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            NULL, NULL, v_containers, v_now - interval '6 days')
    RETURNING id INTO v_null_loc_id;

  -- Negatif (h2): container BERBEDA -- tidak boleh berpasangan dgn KEEP/DUPLICATE.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            v_pol_loc, v_pod_loc, v_other_containers, v_now - interval '7 days')
    RETURNING id INTO v_diff_container_id;

  -- Negatif (h3): selisih >30 hari dari KEEP/DUPLICATE -- tidak boleh berpasangan dgn keduanya.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            v_pol_loc, v_pod_loc, v_containers, v_now - interval '60 days')
    RETURNING id INTO v_too_far_id;

  -- Negatif (h4): status BUKAN OPEN -- tidak boleh berpasangan dgn KEEP/DUPLICATE.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'QUOTED',
            v_pol_loc, v_pod_loc, v_containers, v_now - interval '8 days')
    RETURNING id INTO v_wrong_status_id;

  -- Tiebreak: created_at IDENTIK persis, id lebih kecil harus jadi Keep.
  v_tie_small := CASE WHEN v_tie_a < v_tie_b THEN v_tie_a ELSE v_tie_b END;
  v_tie_big   := CASE WHEN v_tie_a < v_tie_b THEN v_tie_b ELSE v_tie_a END;
  INSERT INTO public.inquiries (id, company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_tie_a, v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            v_pol_loc, v_pod_loc, v_containers, v_now - interval '3 days');
  INSERT INTO public.inquiries (id, company_id, owner_id, created_by, customer_id, service_type, status,
                                 pol_location_id, pod_location_id, container_types, created_at)
    VALUES (v_tie_b, v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', 'OPEN',
            v_pol_loc, v_pod_loc, v_containers, v_now - interval '3 days');

  -- (h, sales ditolak gerbang)
  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM count(*) FROM public.list_possible_duplicate_inquiry_pairs(v_company);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE '(h) sales ditolak gerbang list_possible_duplicate_inquiry_pairs, pesan: %', SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- sales seharusnya ditolak memanggil list_possible_duplicate_inquiry_pairs tapi lolos';
  END IF;

  -- (h, manager berhasil) -- verifikasi SELURUH sub-syarat.
  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_match_count FROM public.list_possible_duplicate_inquiry_pairs(v_company)
   WHERE keep_id = v_keep_id AND dup_id = v_dup_id;
  RAISE NOTICE '(h) pasangan KEEP/DUPLICATE utama ditemukan: %', v_match_count;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- pasangan KEEP/DUPLICATE utama seharusnya muncul TEPAT 1x, dapat %', v_match_count;
  END IF;

  SELECT keep_id, dup_id INTO v_tie_keep, v_tie_dup FROM public.list_possible_duplicate_inquiry_pairs(v_company)
   WHERE (keep_id = v_tie_a AND dup_id = v_tie_b) OR (keep_id = v_tie_b AND dup_id = v_tie_a)
   LIMIT 1;
  RAISE NOTICE '(h) tiebreak created_at identik -- keep=% dup=% (keep seharusnya id lebih kecil %)',
    COALESCE(v_tie_keep::text, '<NULL>'), COALESCE(v_tie_dup::text, '<NULL>'), v_tie_small;
  IF v_tie_keep IS DISTINCT FROM v_tie_small OR v_tie_dup IS DISTINCT FROM v_tie_big THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- tiebreak created_at identik seharusnya keep=id lebih kecil (%), dapat keep=%',
      v_tie_small, COALESCE(v_tie_keep::text, '<NULL>');
  END IF;

  SELECT count(*) INTO v_null_hit FROM public.list_possible_duplicate_inquiry_pairs(v_company)
   WHERE keep_id = v_null_loc_id OR dup_id = v_null_loc_id;
  SELECT count(*) INTO v_diffcontainer_hit FROM public.list_possible_duplicate_inquiry_pairs(v_company)
   WHERE keep_id = v_diff_container_id OR dup_id = v_diff_container_id;
  SELECT count(*) INTO v_toofar_hit FROM public.list_possible_duplicate_inquiry_pairs(v_company)
   WHERE keep_id = v_too_far_id OR dup_id = v_too_far_id;
  SELECT count(*) INTO v_wrongstatus_hit FROM public.list_possible_duplicate_inquiry_pairs(v_company)
   WHERE keep_id = v_wrong_status_id OR dup_id = v_wrong_status_id;
  RAISE NOTICE '(h) negatif -- null_loc=% · diff_container=% · too_far=% · wrong_status=% (semua harus 0)',
    v_null_hit, v_diffcontainer_hit, v_toofar_hit, v_wrongstatus_hit;
  IF v_null_hit <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- inquiry ber-pol/pod_location_id NULL seharusnya TIDAK PERNAH muncul, dapat %', v_null_hit;
  END IF;
  IF v_diffcontainer_hit <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- inquiry ber-container BERBEDA seharusnya tidak berpasangan, dapat %', v_diffcontainer_hit;
  END IF;
  IF v_toofar_hit <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- inquiry berselisih >30 hari seharusnya tidak berpasangan, dapat %', v_toofar_hit;
  END IF;
  IF v_wrongstatus_hit <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- inquiry status non-OPEN seharusnya tidak berpasangan, dapat %', v_wrongstatus_hit;
  END IF;

  -- (i) Hasil (h) langsung dipakai close_inquiry_as_duplicate TANPA error.
  PERFORM public.close_inquiry_as_duplicate(v_dup_id, v_keep_id);
  RAISE NOTICE '(i) close_inquiry_as_duplicate(%, %) sukses tanpa error', v_dup_id, v_keep_id;

  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (h)+(i)';
END $$;

-- =====================================================================
-- (j) Grant menu baru: set (role, action) crm_inquiry_owner_assignment
--     HARUS PERSIS SAMA dengan crm_inquiry, DUA ARAH. Murni BACA.
-- =====================================================================
DO $$
DECLARE
  v_only_in_new int;
  v_only_in_old int;
BEGIN
  SELECT count(*) INTO v_only_in_new FROM (
    SELECT r.code, ma.action
      FROM public.role_menu_permissions rmp
      JOIN public.menu_actions ma   ON ma.id = rmp.menu_action_id
      JOIN public.module_menus mm   ON mm.id = ma.menu_id
      JOIN public.roles r           ON r.id = rmp.role_id
     WHERE mm.key = 'crm_inquiry_owner_assignment'
    EXCEPT
    SELECT r.code, ma.action
      FROM public.role_menu_permissions rmp
      JOIN public.menu_actions ma   ON ma.id = rmp.menu_action_id
      JOIN public.module_menus mm   ON mm.id = ma.menu_id
      JOIN public.roles r           ON r.id = rmp.role_id
     WHERE mm.key = 'crm_inquiry'
  ) only_new;

  SELECT count(*) INTO v_only_in_old FROM (
    SELECT r.code, ma.action
      FROM public.role_menu_permissions rmp
      JOIN public.menu_actions ma   ON ma.id = rmp.menu_action_id
      JOIN public.module_menus mm   ON mm.id = ma.menu_id
      JOIN public.roles r           ON r.id = rmp.role_id
     WHERE mm.key = 'crm_inquiry'
    EXCEPT
    SELECT r.code, ma.action
      FROM public.role_menu_permissions rmp
      JOIN public.menu_actions ma   ON ma.id = rmp.menu_action_id
      JOIN public.module_menus mm   ON mm.id = ma.menu_id
      JOIN public.roles r           ON r.id = rmp.role_id
     WHERE mm.key = 'crm_inquiry_owner_assignment'
  ) only_old;

  RAISE NOTICE '(j) hanya di crm_inquiry_owner_assignment: % · hanya di crm_inquiry: %', v_only_in_new, v_only_in_old;
  IF v_only_in_new > 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (j) -- % pasangan (role,action) ADA di crm_inquiry_owner_assignment tapi TIDAK di crm_inquiry', v_only_in_new;
  END IF;
  IF v_only_in_old > 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (j) -- % pasangan (role,action) ADA di crm_inquiry tapi TIDAK di crm_inquiry_owner_assignment', v_only_in_old;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (j) -- set (role,action) kedua menu IDENTIK';
END $$;
