-- =============================================================================
-- Skrip uji transaksi-aman untuk Inquiry Management Putaran 3, Tahap 3A
-- (kolom `inquiries.direction` + CHECK, migrasi 20261024000001; RPC
-- `get_duplicate_of_inquiry_no`, migrasi 20261024000002; menu baru
-- `crm_inquiry_classification` + grant disalin dari `crm_inquiry`, migrasi
-- 20261024000003). TIDAK DIJALANKAN oleh siapa pun di sesi penulisan ini --
-- hanya ditulis untuk Vir eksekusi manual di staging SESUDAH ketiga migrasi
-- jalan, dalam urutan nomornya.
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri (bukan di-select-all sekaligus satu transaksi
-- besar). Setiap blok yang MENULIS data SELALU berakhir RAISE EXCEPTION,
-- baik lulus ("UJI LULUS (dibatalkan sengaja)") maupun gagal ("UJI GAGAL --
-- ..."), jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-locations-master.sql / verify-inquiry-numbering-and-duplicate.sql /
-- verify-inquiry-won-revert.sql. Blok (d) murni BACA (nol INSERT/UPDATE),
-- jadi RAISE EXCEPTION di akhirnya tidak membatalkan apa pun -- dipertahankan
-- semata supaya KEEMPAT blok di file ini seragam bentuknya.
--
-- Identitas akun uji staging (semuanya perusahaan MSI, dikonfirmasi Den
-- untuk Irisan sebelumnya -- lihat verify-locations-master.sql -- dipakai
-- ulang di sini, BUKAN akun baru):
--   manager (level 6)                   : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (owner "duplicate"/inquiry uji) : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (owner "target"/pihak ketiga)   : 6739c239-e2ff-48ff-97ed-23059f749218
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
--
-- Fixture AKUN (customer/prospect) untuk inquiry uji DICARI DINAMIS, BUKAN
-- di-hardcode -- `SELECT id FROM accounts WHERE company_id=<MSI> AND
-- is_in_lead_pool=false AND deleted_at IS NULL LIMIT 1` (instruksi eksplisit
-- tugas). Kalau staging kebetulan nol baris begitu, blok akan RAISE
-- EXCEPTION dengan pesan jelas, bukan gagal diam-diam di INSERT berikutnya.
--
-- Nomor urut inquiry_no DIBACA lewat `split_part(inquiry_no,'-',5)` kalau
-- perlu diverifikasi urut -- format `{ENTITY}-INQ-{ROMAWI}-{TAHUN}-{URUT:04d}`
-- (trigger trg_z_assign_inquiry_no, migrasi 20261022000001); bagian ke-5
-- (indeks 1-based split_part) adalah URUT berpadding 4 digit. Skrip ini
-- TIDAK menguji keurutan nomor (sudah dicakup skrip Irisan 4 lain) --
-- disebut di sini karena instruksi eksplisit tugas, dipakai di uji (c)
-- untuk memverifikasi bentuk string hasil RPC MASIH berupa inquiry_no utuh
-- (bukan fragmen/kolom lain yang bocor).
--
-- Jangan pernah `max()` pada kolom uuid (urutan uuid v4 tidak bermakna) --
-- tidak ada kebutuhannya di skrip ini (seluruh pemilihan baris via
-- `RETURNING ... INTO` dari INSERT yang baru dibuat sendiri, bukan "ambil
-- baris terbaru" lewat agregat).
--
-- Dua kebutuhan sesi untuk blok yang menjalankan apa pun SEBAGAI akun
-- tertentu (impersonasi):
--   1. set_config('request.jwt.claim.sub', <uuid>, true) -- auth.uid() resolve.
--   2. EXECUTE 'SET LOCAL ROLE authenticated' -- RLS (TO authenticated)
--      benar-benar dievaluasi; tanpa ini SQL Editor berjalan sebagai postgres
--      yang melewati RLS sepenuhnya (CLAUDE.md: auth.uid() NULL di SQL Editor).
-- `EXECUTE 'RESET ROLE'` WAJIB sebelum membaca balik hasil sebagai verifikasi
-- (postgres, bypass RLS) -- membaca SAAT MASIH ber-ROLE authenticated milik
-- akun yang baru dicoba bisa salah menyimpulkan "UPDATE gagal" padahal yang
-- sebenarnya terjadi adalah SELECT-nya sendiri yang disaring RLS (akun itu
-- toh tak berhak membaca baris yang bukan miliknya) -- bedanya penting di
-- uji (a)/(b2) di bawah. File ini tidak menguji audit_logs/notifications --
-- ketiga migrasi 3A murni DDL/DML katalog & fungsi baca, nol INSERT ke
-- kedua tabel itu (beda dari skrip Irisan lain yang menguji RPC pengirim
-- notifikasi); jejak logAudit Bagian B (UPDATE_INQUIRY_CLASSIFICATION)
-- ditulis dari FRONTEND, bukan dari migrasi -- diverifikasi lewat tes
-- manual browser (lihat laporan akhir), bukan skrip SQL ini.
-- =============================================================================

-- =====================================================================
-- (a) CHECK `direction` menolak nilai di luar tiga pilihan (berlaku utk
--     SIAPA PUN, CHECK bukan RLS); manager BOLEH UPDATE direction baris
--     milik orang lain; sales non-owner & non-manager DITOLAK RLS (UPDATE
--     sukses secara SQL tapi 0 baris terkena -- BUKAN exception, beda
--     kelas dari pelanggaran CHECK).
-- =====================================================================
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492'; -- MSI
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989'; -- owner inquiry uji
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218'; -- bukan owner, bukan manager
  v_account uuid;
  v_inq     uuid;
  v_dir     text;
  v_caught  boolean := false;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture (is_in_lead_pool=false, deleted_at IS NULL) di company MSI';
  END IF;

  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding')
    RETURNING id, direction INTO v_inq, v_dir;
  RAISE NOTICE 'Inquiry uji dibuat id=%, direction awal=% (harus NULL)', v_inq, v_dir;
  IF v_dir IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- direction baris baru seharusnya NULL ("Not set"), dapat %', v_dir;
  END IF;

  -- CHECK: nilai tak dikenal ditolak Postgres sendiri, sebelum RLS apa pun
  -- sempat relevan -- diuji sebagai postgres (bypass RLS), supaya kalau
  -- blok ini gagal, pasti CHECK-nya yang gagal, bukan RLS yang kebetulan
  -- juga menolak.
  BEGIN
    UPDATE public.inquiries SET direction = 'InvalidValue' WHERE id = v_inq;
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
    RAISE NOTICE 'CHECK direction menolak nilai tak dikenal, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- CHECK direction seharusnya menolak nilai tak dikenal tapi lolos';
  END IF;

  -- Manager: BOLEH UPDATE walau bukan owner (is_manager_or_above() di
  -- inquiries_update, cermin RLS LIVE).
  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inquiries SET direction = 'Import' WHERE id = v_inq;
  EXECUTE 'RESET ROLE';
  SELECT direction INTO v_dir FROM public.inquiries WHERE id = v_inq;
  IF v_dir IS DISTINCT FROM 'Import' THEN
    RAISE EXCEPTION 'UJI GAGAL -- manager seharusnya bisa UPDATE direction, hasil: %', v_dir;
  END IF;
  RAISE NOTICE 'Manager berhasil set direction=Import';

  -- Sales B: BUKAN owner (sales_a owner-nya), BUKAN manager -> RLS
  -- menyaring baris jadi 0 (UPDATE "sukses" secara SQL, 0 baris terkena).
  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inquiries SET direction = 'Export' WHERE id = v_inq;
  EXECUTE 'RESET ROLE';
  SELECT direction INTO v_dir FROM public.inquiries WHERE id = v_inq;
  IF v_dir IS DISTINCT FROM 'Import' THEN
    RAISE EXCEPTION 'UJI GAGAL -- sales non-owner non-manager seharusnya DITOLAK RLS (direction tetap Import), hasil: %', v_dir;
  END IF;
  RAISE NOTICE 'Sales B (non-owner, non-manager) ditolak RLS, direction tetap Import';

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (b) get_duplicate_of_inquiry_no -- tiga skenario:
--     (b1) owner inquiry DUPLICATE (sales_a) memanggil dgn p_inquiry_id =
--          id duplicate-nya sendiri -> dapat inquiry_no TARGET, WALAU
--          target dimiliki sales lain (sales_b).
--     (b2) pihak ketiga (bukan owner duplicate, bukan manager, bukan
--          procurement-ber-PRF) memanggil dgn p_inquiry_id yang SAMA ->
--          dapat NULL (gerbang akses gagal di baris p_inquiry_id itu).
--     (b3) inquiry TANPA duplicate_of_id, dipanggil ownernya sendiri
--          (gerbang akses lolos) -> dapat NULL (tidak ada apa pun utk
--          diresolusi).
--     (c)  hasil (b1) berbentuk inquiry_no murni (regex), bukan kolom lain.
-- =====================================================================
DO $$
DECLARE
  v_company   uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492'; -- MSI
  v_sales_a   uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989'; -- owner duplicate (D)
  v_sales_b   uuid := '6739c239-e2ff-48ff-97ed-23059f749218'; -- owner target (T), jadi pihak ketiga thd D
  v_account   uuid;
  v_target_id uuid;
  v_target_no text;
  v_dup_id    uuid;
  v_lone_id   uuid;
  v_result    text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL
   LIMIT 1;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol akun fixture (is_in_lead_pool=false, deleted_at IS NULL) di company MSI';
  END IF;

  -- Target (T) -- dimiliki sales_b, PIHAK LAIN dari sales_a.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type)
    VALUES (v_company, v_sales_b, v_sales_b, v_account, 'freight_forwarding')
    RETURNING id, inquiry_no INTO v_target_id, v_target_no;

  -- Duplicate (D) -- dimiliki sales_a, menunjuk T via duplicate_of_id.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type, duplicate_of_id)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding', v_target_id)
    RETURNING id INTO v_dup_id;

  -- Inquiry lepas, tanpa duplicate_of_id -- dimiliki sales_a.
  INSERT INTO public.inquiries (company_id, owner_id, created_by, prospect_id, service_type)
    VALUES (v_company, v_sales_a, v_sales_a, v_account, 'freight_forwarding')
    RETURNING id INTO v_lone_id;

  -- (b1) Owner D (sales_a) -> dapat inquiry_no T.
  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.get_duplicate_of_inquiry_no(v_dup_id) INTO v_result;
  EXECUTE 'RESET ROLE';
  IF v_result IS DISTINCT FROM v_target_no THEN
    RAISE EXCEPTION 'UJI GAGAL (b1) -- owner duplikat seharusnya dapat nomor target %, dapat %', v_target_no, v_result;
  END IF;
  RAISE NOTICE '(b1) OK -- owner duplikat (sales_a) dapat nomor target milik sales_b: %', v_result;

  -- (c) Bentuk hasil (b1) murni inquiry_no, bukan kolom lain yang bocor.
  IF v_result !~ '^[A-Z]+-INQ-[A-Z]+-[0-9]{4}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- hasil bukan format inquiry_no biasa (indikasi kolom lain bocor): %', v_result;
  END IF;
  IF split_part(v_result, '-', 5) !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- bagian urut (split_part ke-5) bukan 4 digit: %', split_part(v_result, '-', 5);
  END IF;
  RAISE NOTICE '(c) OK -- hasil berbentuk inquiry_no murni, urut=%', split_part(v_result, '-', 5);

  -- (b2) Pihak ketiga (sales_b -- bukan owner D, bukan manager) memanggil
  -- dgn p_inquiry_id = D -> gerbang akses GAGAL di baris D itu -> NULL.
  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.get_duplicate_of_inquiry_no(v_dup_id) INTO v_result;
  EXECUTE 'RESET ROLE';
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (b2) -- pihak ketiga (bukan owner D, bukan manager) seharusnya dapat NULL, dapat %', v_result;
  END IF;
  RAISE NOTICE '(b2) OK -- pihak ketiga dapat NULL';

  -- (b3) Inquiry lepas (tanpa duplicate_of_id), dipanggil ownernya sendiri
  -- (sales_a) -> gerbang akses LOLOS, tapi duplicate_of_id-nya NULL -> NULL.
  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.get_duplicate_of_inquiry_no(v_lone_id) INTO v_result;
  EXECUTE 'RESET ROLE';
  IF v_result IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (b3) -- inquiry tanpa duplicate_of_id seharusnya NULL, dapat %', v_result;
  END IF;
  RAISE NOTICE '(b3) OK -- inquiry tanpa duplicate_of_id -> NULL';

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (d) Grant menu baru: set (role, action) crm_inquiry_classification
--     HARUS PERSIS SAMA dengan crm_inquiry (migrasi 20261024000003
--     menyalin dinamis, bukan daftar role manual -- blok ini membuktikan
--     salinannya benar-benar lengkap DUA ARAH). Murni BACA, nol
--     INSERT/UPDATE/DELETE -- RAISE EXCEPTION di akhir tidak membatalkan
--     apa pun, dipertahankan hanya demi bentuk yang seragam dgn blok lain.
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
     WHERE mm.key = 'crm_inquiry_classification'
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
     WHERE mm.key = 'crm_inquiry_classification'
  ) only_old;

  RAISE NOTICE 'Pasangan (role,action) hanya di crm_inquiry_classification: % · hanya di crm_inquiry: %', v_only_in_new, v_only_in_old;
  IF v_only_in_new > 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- % pasangan (role,action) ADA di crm_inquiry_classification tapi TIDAK di crm_inquiry', v_only_in_new;
  END IF;
  IF v_only_in_old > 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- % pasangan (role,action) ADA di crm_inquiry tapi TIDAK di crm_inquiry_classification', v_only_in_old;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- set (role,action) kedua menu IDENTIK';
END $$;
