-- =============================================================================
-- Skrip uji transaksi-aman -- Inquiry Management Putaran 11, Tahap A:
-- reassign_inquiry_owner v3 (parameter baru p_notify, checkbox "Notify new
-- owner" di OwnerAssignModal.jsx, Tahap B).
-- Migrasi diuji: 20261028000001_crm_reassign_inquiry_owner_v3.sql.
--
-- TIDAK DIJALANKAN oleh siapa pun di sesi penulisan ini -- hanya ditulis
-- untuk Vir eksekusi manual di staging SESUDAH migrasi di atas live (DROP
-- FUNCTION, WAJIB dijalankan Mas langsung di SQL Editor, bukan connector
-- Vir -- lihat banner di kepala migrasi itu).
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-4.sql / verify-inquiry-putaran-5.sql. Blok (a)/(b)
-- murni introspeksi katalog (nol tulis) -- RAISE EXCEPTION di akhirnya
-- tidak membatalkan apa pun yang berarti, dipertahankan hanya demi bentuk
-- yang seragam.
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (angka/nilai yang
-- dicek, bukan hanya "OK"/"FAIL").
--
-- FIXTURE inquiries -- INSERT LANGSUNG sebagai postgres (SEBELUM SET LOCAL
-- ROLE authenticated), di luar impersonasi (setara superuser, RLS tidak
-- berlaku). inquiry_no SENGAJA TIDAK dikirim -- trigger BEFORE INSERT
-- trg_z_assign_inquiry_no selalu menimpanya dengan nomor server-generated.
--
-- Identitas akun uji staging (SAMA PERSIS dengan verify-inquiry-putaran-4/
-- 5.sql, diberikan di instruksi tugas):
--   manager/supervisor (level 6)    : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (non-manager, pembuat)  : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (non-manager, lain)     : 6739c239-e2ff-48ff-97ed-23059f749218
--   super admin (ZZZTEST Admin)     : d730c348-ceab-463d-bc3b-458126314373
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
--
-- Blok (i) butuh seorang pemanggil yang SEKALIGUS (1) manager-ke-atas (bisa
-- memanggil RPC) DAN (2) anggota OPERATIONAL_ROSTER_ROLES (bisa jadi target
-- owner baru yang sah) -- dipakai akun manager/supervisor di atas, yang di
-- verify-inquiry-putaran-5.sql:570 dicatat sebagai "ZZZ Test Sales
-- Supervisor" (role kemungkinan bd_sales_spv_console/bd_sales_spv_forwarding,
-- DUA-DUANYA ada di whitelist roster). Blok (i) memverifikasi dulu lewat
-- query, TIDAK mengasumsikan -- gagal dengan pesan diagnostik yang jelas
-- kalau asumsi ini salah, bukan diam-diam menguji hal yang berbeda.
-- =============================================================================


-- =============================================================================
-- BAGIAN 1 -- katalog (nol tulis): signature baru ada, ACL hanya
-- authenticated/postgres.
-- =============================================================================

-- ===== (a) Signature 4-argumen terpasang, SECURITY DEFINER (mekanisme
--           bypass K1c yang sama dipakai 20261027000003 -- ditegaskan ulang
--           di sini, dibuktikan BERLAKU oleh blok (c)-(i) yang semuanya
--           menulis ke kolom terjaga K1c lewat RPC ini dan SUKSES) =====
DO $$
DECLARE
  v_count integer;
  v_args  text;
  v_secdef boolean;
BEGIN
  SELECT count(*), max(oidvectortypes(p.proargtypes)), max(p.prosecdef::int)::boolean
    INTO v_count, v_args, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reassign_inquiry_owner';

  RAISE NOTICE '(a) reassign_inquiry_owner -- jumlah overload=% (harus 1), argtypes=% (harus "uuid, uuid, text, boolean"), SECURITY DEFINER=% (harus true)',
    v_count, v_args, v_secdef;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- seharusnya SATU overload (signature 3-argumen lama harus sudah di-DROP), dapat % overload', v_count;
  END IF;
  IF v_args <> 'uuid, uuid, text, boolean' THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- signature tidak sesuai, dapat: %', v_args;
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- fungsi harus SECURITY DEFINER (K1c bergantung pada current_user <> authenticated selama fungsi berjalan)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (a)';
END $$;


-- ===== (b) ACL -- grantee EXECUTE hanya authenticated (nol PUBLIC, nol
--           anon) =====
DO $$
DECLARE
  v_acl text[];
  v_has_public boolean;
  v_has_anon boolean;
  v_has_authenticated boolean;
BEGIN
  SELECT p.proacl::text[] INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reassign_inquiry_owner';

  v_has_public       := EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a LIKE '=%/%');
  v_has_anon         := EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a LIKE 'anon=%/%');
  v_has_authenticated := EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a LIKE 'authenticated=%/%');

  RAISE NOTICE '(b) ACL reassign_inquiry_owner -- proacl=% / PUBLIC=% (harus false) / anon=% (harus false) / authenticated=% (harus true)',
    v_acl, v_has_public, v_has_anon, v_has_authenticated;
  IF v_has_public OR v_has_anon OR NOT v_has_authenticated THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- ACL tidak sesuai (harus hanya authenticated, nol PUBLIC/anon)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (b)';
END $$;


-- =============================================================================
-- BAGIAN 2 -- efek nyata p_notify (bukan sekadar nol-error).
-- =============================================================================

-- ===== (c) p_notify=false -- NOL baris notifications baru, TAPI riwayat/
--           assigned_*/audit TETAP terisi penuh =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_inq_id uuid;
  v_notif_count integer; v_hist_count integer; v_audit_count integer;
  v_assigned_by uuid; v_assigned_at timestamptz; v_reason text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (c) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_b, 'Uji Putaran 11 (c) -- p_notify=false', false);
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE reference_type = 'inquiry' AND reference_id = v_inq_id;
  SELECT count(*) INTO v_hist_count FROM public.inquiry_owner_history WHERE inquiry_id = v_inq_id;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs WHERE entity_type = 'INQUIRY' AND entity_id = v_inq_id AND action = 'REASSIGN_INQUIRY_OWNER';
  SELECT assigned_by, assigned_at, assign_reason INTO v_assigned_by, v_assigned_at, v_reason FROM public.inquiries WHERE id = v_inq_id;

  RAISE NOTICE '(c) p_notify=false -- notifications=% (harus 0), inquiry_owner_history=% (harus 1), audit_logs=% (harus 1), assigned_by=% (harus manager), assigned_at NULL=% (harus false), assign_reason=%',
    v_notif_count, v_hist_count, v_audit_count, v_assigned_by, (v_assigned_at IS NULL), v_reason;
  IF v_notif_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- p_notify=false seharusnya NOL notifikasi, dapat %', v_notif_count;
  END IF;
  IF v_hist_count <> 1 OR v_audit_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- riwayat/audit seharusnya TETAP terisi (1/1) walau p_notify=false, dapat hist=%, audit=%', v_hist_count, v_audit_count;
  END IF;
  IF v_assigned_by IS DISTINCT FROM v_manager OR v_assigned_at IS NULL OR v_reason IS DISTINCT FROM 'Uji Putaran 11 (c) -- p_notify=false' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- assigned_by/assigned_at/assign_reason tidak terisi benar';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (c)';
END $$;


-- ===== (d) p_notify=true (eksplisit, signature 4-argumen) -- SATU
--           notifikasi ke owner baru, riwayat/audit terisi =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_inq_id uuid;
  v_notif_count integer; v_notif_user uuid; v_notif_title text;
  v_hist_count integer; v_audit_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (d) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_b, 'Uji Putaran 11 (d) -- p_notify=true', true);
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE reference_type = 'inquiry' AND reference_id = v_inq_id;
  SELECT user_id, title INTO v_notif_user, v_notif_title FROM public.notifications
   WHERE reference_type = 'inquiry' AND reference_id = v_inq_id LIMIT 1;
  SELECT count(*) INTO v_hist_count FROM public.inquiry_owner_history WHERE inquiry_id = v_inq_id;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs WHERE entity_type = 'INQUIRY' AND entity_id = v_inq_id AND action = 'REASSIGN_INQUIRY_OWNER';

  RAISE NOTICE '(d) p_notify=true -- notifications=% (harus 1), user_id=% (harus sales B), title=%, inquiry_owner_history=% (harus 1), audit_logs=% (harus 1)',
    v_notif_count, v_notif_user, v_notif_title, v_hist_count, v_audit_count;
  IF v_notif_count <> 1 OR v_notif_user IS DISTINCT FROM v_sales_b THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- p_notify=true seharusnya SATU notifikasi ke sales B, dapat count=%, user=%', v_notif_count, v_notif_user;
  END IF;
  IF v_hist_count <> 1 OR v_audit_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- riwayat/audit seharusnya 1/1, dapat hist=%, audit=%', v_hist_count, v_audit_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (d)';
END $$;


-- ===== (e) Panggilan gaya LAMA 3-argumen (p_inquiry_id, p_new_owner_id,
--           p_reason) TANPA p_notify -- default p_notify=true harus tetap
--           berlaku (kompatibilitas mundur utk pemanggil yang belum
--           diubah) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_inq_id uuid;
  v_notif_count integer;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (e) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_b, 'Uji Putaran 11 (e) -- panggilan 3-argumen lama');
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE reference_type = 'inquiry' AND reference_id = v_inq_id;

  RAISE NOTICE '(e) panggilan 3-argumen lama (tanpa p_notify) -- notifications=% (harus 1, default p_notify=true tetap berlaku)', v_notif_count;
  IF v_notif_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (e) -- kompatibilitas mundur pecah: pemanggil 3-argumen lama seharusnya tetap mengirim notifikasi (default true), dapat %', v_notif_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (e)';
END $$;


-- ===== (f) Panggilan gaya TERLAMA 2-argumen (p_inquiry_id, p_new_owner_id)
--           -- default p_reason=NULL DAN p_notify=true harus tetap berlaku
--           (pemanggil FE SEBELUM Tahap B, mis. DealDetailPage.jsx/
--           InquiryOwnerAssignmentPage.jsx yang belum diubah) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_inq_id uuid;
  v_notif_count integer; v_reason text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (f) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_b);
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE reference_type = 'inquiry' AND reference_id = v_inq_id;
  SELECT assign_reason INTO v_reason FROM public.inquiries WHERE id = v_inq_id;

  RAISE NOTICE '(f) panggilan 2-argumen terlama -- notifications=% (harus 1), assign_reason=% (harus NULL)', v_notif_count, v_reason;
  IF v_notif_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (f) -- pemanggil 2-argumen seharusnya tetap mengirim notifikasi (default p_notify=true), dapat %', v_notif_count;
  END IF;
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (f) -- assign_reason seharusnya NULL (default p_reason), dapat %', v_reason;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (f)';
END $$;


-- =============================================================================
-- BAGIAN 3 -- gerbang & kasus tepi tidak ikut bergeser oleh p_notify.
-- =============================================================================

-- ===== (g) Non-manager (sales A) mencoba reassign -- DITOLAK, pesan SAMA
--           dengan versi 20261027000003 =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_account uuid; v_inq_id uuid;
  v_caught boolean := false; v_msg text; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (g) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_b, 'Uji Putaran 11 (g)', true);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true; v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;
  RAISE NOTICE '(g) non-manager (sales A) reassign -- ditolak=%, pesan=%, owner_id akhir=% (harus tetap sales A)', v_caught, v_msg, v_owner;
  IF NOT v_caught OR v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (g) -- seharusnya ditolak, owner_id tetap sales A';
  END IF;
  IF v_msg NOT LIKE '%Hanya Manager ke atas%' THEN
    RAISE EXCEPTION 'UJI GAGAL (g) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (g)';
END $$;


-- ===== (h) No-op (owner baru = owner lama) -- NOL riwayat/notifikasi/audit
--           baru, walau p_notify=true =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_notif_count integer; v_hist_count integer; v_audit_count integer; v_owner uuid;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (h) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_sales_a, 'Uji Putaran 11 (h) -- no-op', true);
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE reference_type = 'inquiry' AND reference_id = v_inq_id;
  SELECT count(*) INTO v_hist_count FROM public.inquiry_owner_history WHERE inquiry_id = v_inq_id;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs WHERE entity_type = 'INQUIRY' AND entity_id = v_inq_id AND action = 'REASSIGN_INQUIRY_OWNER';
  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;

  RAISE NOTICE '(h) no-op (owner sama) -- notifications=% (harus 0), inquiry_owner_history=% (harus 0), audit_logs=% (harus 0), owner_id=% (harus tetap sales A)',
    v_notif_count, v_hist_count, v_audit_count, v_owner;
  IF v_notif_count <> 0 OR v_hist_count <> 0 OR v_audit_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- no-op seharusnya NOL baris baru di ketiganya, dapat notif=%, hist=%, audit=%', v_notif_count, v_hist_count, v_audit_count;
  END IF;
  IF v_owner IS DISTINCT FROM v_sales_a THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- owner_id seharusnya tetap sales A';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (h)';
END $$;


-- ===== (i) Self-assign oleh manager/supervisor -- riwayat/audit tetap
--           terisi, TAPI NOL notifikasi walau p_notify=true (rule 111
--           nexus-notes.js, "Assigning to yourself sends nothing", TIDAK
--           kalah oleh p_notify). Diverifikasi DULU bahwa akun manager
--           fixture memang anggota OPERATIONAL_ROSTER_ROLES -- kalau
--           tidak, blok ini gagal dengan pesan diagnostik jelas, bukan
--           diam-diam menguji hal berbeda. =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_manager uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid; v_inq_id uuid;
  v_is_roster boolean;
  v_notif_count integer; v_hist_count integer; v_audit_count integer; v_owner uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
     WHERE ur.user_id = v_manager AND ur.company_id = v_company AND ur.is_active = true
       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       AND r.code IN ('bd_sales_executive', 'bd_account_executive',
                       'bd_sales_spv_console', 'bd_sales_spv_forwarding', 'gm_bd')
  ) INTO v_is_roster;
  IF NOT v_is_roster THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- akun manager fixture (%) BUKAN anggota OPERATIONAL_ROSTER_ROLES di company MSI -- pilih akun lain yang sekaligus manager-ke-atas DAN anggota whitelist, atau lewati blok ini dan catat sebagai tidak bisa diuji', v_manager;
  END IF;

  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (i) -- nol akun fixture MSI'; END IF;

  INSERT INTO public.inquiries (company_id, prospect_id, service_type, direction, customer_role, status, created_by, owner_id)
  VALUES (v_company, v_account, 'freight_forwarding', 'Export', 'Shipper', 'OPEN', v_sales_a, v_sales_a)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_manager::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reassign_inquiry_owner(v_inq_id, v_manager, 'Uji Putaran 11 (i) -- self-assign', true);
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_notif_count FROM public.notifications WHERE reference_type = 'inquiry' AND reference_id = v_inq_id;
  SELECT count(*) INTO v_hist_count FROM public.inquiry_owner_history WHERE inquiry_id = v_inq_id;
  SELECT count(*) INTO v_audit_count FROM public.audit_logs WHERE entity_type = 'INQUIRY' AND entity_id = v_inq_id AND action = 'REASSIGN_INQUIRY_OWNER';
  SELECT owner_id INTO v_owner FROM public.inquiries WHERE id = v_inq_id;

  RAISE NOTICE '(i) self-assign (manager ke dirinya sendiri), p_notify=true -- notifications=% (harus 0, pengecualian self-assign), inquiry_owner_history=% (harus 1), audit_logs=% (harus 1), owner_id=% (harus manager)',
    v_notif_count, v_hist_count, v_audit_count, v_owner;
  IF v_notif_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- self-assign seharusnya NOL notifikasi walau p_notify=true (pengecualian "Assigning to yourself sends nothing" tidak boleh kalah oleh p_notify), dapat %', v_notif_count;
  END IF;
  IF v_hist_count <> 1 OR v_audit_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- riwayat/audit seharusnya TETAP terisi (1/1) utk self-assign, dapat hist=%, audit=%', v_hist_count, v_audit_count;
  END IF;
  IF v_owner IS DISTINCT FROM v_manager THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- owner_id seharusnya berubah jadi manager';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (i)';
END $$;
