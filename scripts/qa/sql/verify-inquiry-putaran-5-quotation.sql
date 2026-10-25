-- =============================================================================
-- Skrip uji transaksi-aman -- Inquiry Management Putaran 5, K1d: Quotation
-- Accepted wajib bukti (migrasi 20261026000004_quotation_accepted_evidence).
-- TIDAK DIJALANKAN oleh siapa pun di sesi penulisan ini -- hanya ditulis
-- untuk Vir eksekusi manual di staging SESUDAH migrasi itu jalan (Den, lewat
-- SQL Editor -- migrasi memuat DROP FUNCTION, connector menolaknya).
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri. Setiap blok yang MENULIS SELALU berakhir
-- RAISE EXCEPTION ("UJI LULUS (dibatalkan sengaja)" / "UJI GAGAL -- ..."),
-- jadi nol baris tersisa di DB dalam KEDUA kasus -- pola identik
-- verify-inquiry-putaran-4.sql / verify-inquiry-putaran-5.sql (K1c).
--
-- Setiap blok MENCETAK hasil terukur lewat RAISE NOTICE (angka/nilai yang
-- dicek, bukan hanya "OK"/"FAIL").
--
-- FIXTURE quotations/inquiries -- INSERT LANGSUNG sebagai postgres (SEBELUM
-- SET LOCAL ROLE authenticated), di luar impersonasi (setara superuser,
-- bukan bagian yang diuji), lalu seluruhnya dibatalkan di akhir blok lewat
-- RAISE EXCEPTION -- pola identik fixture "inquiry lama" blok (ll)
-- verify-inquiry-putaran-4.sql. quotations hanya punya 3 kolom NOT NULL
-- (company_id, quotation_no, exchange_rates -- yang terakhir ber-DEFAULT),
-- jadi fixture minimal = company_id + quotation_no + status + created_by
-- (diverifikasi langsung ke schema_snapshot.sql, lihat migrasi 20261026000004
-- untuk definisi lengkap tabel).
--
-- ⚠️ FIXTURE storage.objects (blok (c)/(k), mensimulasikan "file bukti sudah
-- diunggah") -- skema storage DIKECUALIKAN dari schema_snapshot.sql
-- (--schema=public), jadi kolom pastinya TIDAK bisa diverifikasi dari repo
-- ini. INSERT di bawah hanya mengisi bucket_id+name (keduanya yang
-- dibutuhkan EXISTS-check di set_quotation_outcome) + id eksplisit supaya
-- bisa dihapus balik idempoten kalau RAISE EXCEPTION di akhir blok TIDAK
-- otomatis membatalkannya (seharusnya otomatis, blok ini pun DO $$...$$
-- satu statement/transaksi) -- kalau Postgres menolak INSERT ini karena ada
-- kolom NOT NULL lain yang tidak terlihat dari sini (mis. owner_id di
-- sebagian versi storage-api), TAMBAHKAN kolom itu secukupnya dan laporkan
-- balik -- jangan diam-diam melonggarkan pengujian bagian lain blok itu.
-- DO blocks tidak bisa memanggil Storage HTTP API (upload sungguhan) --
-- INSERT langsung ke storage.objects adalah satu-satunya cara mensimulasikan
-- "file ada" tanpa benar-benar mengunggah byte.
--
-- Identitas akun uji staging (semuanya perusahaan MSI kecuali disebut lain --
-- SAMA PERSIS dengan verify-inquiry-putaran-5.sql/K1c, diberikan di instruksi
-- tugas):
--   manager/supervisor (level 6)    : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales A (non-manager, pembuat)  : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales B (non-manager, lain)     : 6739c239-e2ff-48ff-97ed-23059f749218
--   super admin (ZZZTEST Admin)     : d730c348-ceab-463d-bc3b-458126314373
-- company_id MSI = 0e1840d8-e6fb-4190-bd09-88338e68b492 (CLAUDE.md).
-- company_id SOA = d2e5e565-5f67-4954-b8d9-5979a2a0c697 (CLAUDE.md) -- dipakai
-- di uji (h) sebagai "company lain"; user aktifnya dicari dinamis (pola
-- identik blok (h) verify-inquiry-putaran-4.sql).
-- =============================================================================


-- ===== (a) UPDATE langsung ke ACCEPTED oleh pembuat sendiri -- DITOLAK
--           trigger guard (bukan RLS -- pembuat SEHARUSNYA boleh UPDATE
--           baris ini, guard yang mencegat KOLOM/TRANSISI-nya) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-A', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.quotations SET status = 'ACCEPTED' WHERE id = v_quo_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(a) UPDATE langsung ke ACCEPTED -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- UPDATE langsung ke ACCEPTED seharusnya DITOLAK trigger guard';
  END IF;
  IF v_msg NOT LIKE '%tidak bisa diubah langsung ke ACCEPTED%' THEN
    RAISE EXCEPTION 'UJI GAGAL (a) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (a)';
END $$;


-- ===== (b) RPC set_quotation_outcome ACCEPTED TANPA bukti -- DITOLAK =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-B', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.set_quotation_outcome(v_quo_id, 'ACCEPTED', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(b) ACCEPTED tanpa p_evidence_path -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- ACCEPTED tanpa bukti seharusnya DITOLAK';
  END IF;
  IF v_msg NOT LIKE '%Bukti wajib dilampirkan%' THEN
    RAISE EXCEPTION 'UJI GAGAL (b) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (b)';
END $$;


-- ===== (c) RPC ACCEPTED DENGAN bukti valid (file BENAR-BENAR ada di
--           storage.objects) -- SUKSES: accepted_at/accepted_by/
--           accepted_evidence_path terisi, inquiry terkait jadi WON dengan
--           won_reason='Accepted quotation' =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_account uuid;
  v_inq_id  uuid;
  v_inq_no  text;
  v_quo_id  uuid;
  v_path    text;
  v_status  text; v_acc_at timestamptz; v_acc_by uuid; v_acc_path text;
  v_inq_status text; v_inq_won_reason text;
  v_audit_notes text;
BEGIN
  SELECT id INTO v_account FROM public.accounts
   WHERE company_id = v_company AND is_in_lead_pool = false AND deleted_at IS NULL LIMIT 1;
  IF v_account IS NULL THEN RAISE EXCEPTION 'UJI GAGAL (c) -- nol akun fixture MSI'; END IF;

  -- Fixture inquiry QUOTED (salah satu status FROM yang diterima
  -- trg_fn_inquiry_won_on_quotation_accepted) -- INSERT LANGSUNG, pola
  -- identik blok (ll) verify-inquiry-putaran-4.sql.
  INSERT INTO public.inquiries (
    company_id, prospect_id, service_type, direction, customer_role,
    status, created_by, owner_id
  ) VALUES (
    v_company, v_account, 'freight_forwarding', 'Export', 'Shipper',
    'QUOTED', v_sales_a, v_sales_a
  ) RETURNING id, inquiry_no INTO v_inq_id, v_inq_no;

  INSERT INTO public.quotations (company_id, quotation_no, status, created_by, inquiry_id)
  VALUES (v_company, 'ZZZTEST-K1D-C', 'SENT', v_sales_a, v_inq_id)
  RETURNING id INTO v_quo_id;

  v_path := v_company::text || '/' || v_quo_id::text || '/zzztest-bukti-c.pdf';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('quotation-acceptance-evidence', v_path);

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_quotation_outcome(v_quo_id, 'ACCEPTED', 'Catatan uji K1d c', v_path);
  EXECUTE 'RESET ROLE';

  SELECT status, accepted_at, accepted_by, accepted_evidence_path
    INTO v_status, v_acc_at, v_acc_by, v_acc_path
    FROM public.quotations WHERE id = v_quo_id;
  SELECT status, won_reason INTO v_inq_status, v_inq_won_reason FROM public.inquiries WHERE id = v_inq_id;
  SELECT notes INTO v_audit_notes FROM public.audit_logs
   WHERE action = 'ACCEPT_QUOTATION' AND entity_id = v_quo_id
   ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE '(c) quotation %: status=%, accepted_at=%, accepted_by=%, path=% | inquiry %: status=%, won_reason=% | audit_logs.notes=%',
    v_quo_id, v_status, v_acc_at, v_acc_by, v_acc_path, v_inq_no, v_inq_status, v_inq_won_reason, v_audit_notes;

  IF v_status <> 'ACCEPTED' OR v_acc_at IS NULL OR v_acc_by IS DISTINCT FROM v_sales_a OR v_acc_path IS DISTINCT FROM v_path THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- kolom quotations tidak terisi benar sesudah ACCEPTED';
  END IF;
  IF v_inq_status <> 'WON' OR v_inq_won_reason IS DISTINCT FROM 'Accepted quotation' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- inquiry seharusnya WON dengan won_reason=''Accepted quotation'', dapat status=%/won_reason=%', v_inq_status, v_inq_won_reason;
  END IF;
  IF v_audit_notes IS DISTINCT FROM 'Catatan uji K1d c' THEN
    RAISE EXCEPTION 'UJI GAGAL (c) -- audit_logs.notes untuk ACCEPT_QUOTATION seharusnya ''Catatan uji K1d c'', dapat %', v_audit_notes;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (c)';
END $$;


-- ===== (d) RPC REJECTED tanpa bukti -- TETAP SUKSES (bukti hanya wajib
--           untuk ACCEPTED, alasan yang wajib untuk REJECTED) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_id  uuid;
  v_status  text; v_reason text; v_path text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-D', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.set_quotation_outcome(v_quo_id, 'REJECTED', 'Harga tidak kompetitif', NULL);
  EXECUTE 'RESET ROLE';

  SELECT status, rejection_reason, accepted_evidence_path INTO v_status, v_reason, v_path
    FROM public.quotations WHERE id = v_quo_id;

  RAISE NOTICE '(d) REJECTED tanpa bukti -- status=%, reason=%, evidence_path=% (harus NULL)', v_status, v_reason, v_path;
  IF v_status <> 'REJECTED' OR v_reason IS DISTINCT FROM 'Harga tidak kompetitif' OR v_path IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (d) -- REJECTED tanpa bukti seharusnya tetap sukses, evidence_path harus NULL';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (d)';
END $$;


-- ===== (e) Bentuk panggilan LAMA (3 argumen bernama, p_evidence_path TIDAK
--           disebut sama sekali) untuk ACCEPTED -- overload lama SUDAH
--           di-DROP, tapi p_evidence_path punya DEFAULT NULL di fungsi
--           BARU, jadi Postgres TETAP meresolusi panggilan 3-argumen ini ke
--           fungsi baru (bukan "function does not exist") -- buktikan
--           validasi bukti TETAP menolaknya walau pemanggil tidak tahu
--           parameter itu ada =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-E', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    -- SENGAJA memakai nama parameter saja (bentuk lama), TANPA p_evidence_path.
    PERFORM public.set_quotation_outcome(p_quotation_id := v_quo_id, p_outcome := 'ACCEPTED', p_reason := NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(e) bentuk panggilan 3-argumen lama untuk ACCEPTED -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (e) -- overload lama yang di-DROP TIDAK BOLEH jadi jalan pintas (p_evidence_path mestinya default NULL lalu ditolak validasi bukti)';
  END IF;
  IF v_msg NOT LIKE '%Bukti wajib dilampirkan%' THEN
    RAISE EXCEPTION 'UJI GAGAL (e) -- pesan error tidak sesuai (seharusnya sama dengan (b), bukan "function does not exist"), dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (e)';
END $$;


-- ===== (f) Jalur sah lain TIDAK terganggu trigger guard: edit draft lewat
--           save_quotation, "Send" lewat UPDATE langsung status=SENT (pola
--           persis handleSendToCustomer), create_quotation_revision --
--           SEMUA tetap sukses =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_draft uuid; v_quo_submitted uuid; v_quo_rejected uuid; v_quo_no text := 'ZZZTEST-K1D-F';
  v_notes text; v_sent_status text; v_sent_at timestamptz;
  v_rev_id uuid; v_rev_no int; v_rev_count int;
BEGIN
  -- (f1) save_quotation -- edit DRAFT (notes), nol perubahan status.
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, v_quo_no || '-1', 'DRAFT', v_sales_a)
  RETURNING id INTO v_quo_draft;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.save_quotation(v_quo_draft, jsonb_build_object('notes', 'Uji K1d f1'), '[]'::jsonb);
  EXECUTE 'RESET ROLE';

  SELECT notes INTO v_notes FROM public.quotations WHERE id = v_quo_draft;
  RAISE NOTICE '(f1) save_quotation DRAFT -- notes=%', v_notes;
  IF v_notes IS DISTINCT FROM 'Uji K1d f1' THEN
    RAISE EXCEPTION 'UJI GAGAL (f1) -- save_quotation seharusnya tetap sukses untuk DRAFT';
  END IF;

  -- (f2) "Send" -- UPDATE langsung status SUBMITTED->SENT, pola persis
  -- handleSendToCustomer (QuotationDetailPage.jsx) -- guard TIDAK boleh
  -- menyentuh transisi ini sama sekali.
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, v_quo_no || '-2', 'SUBMITTED', v_sales_a)
  RETURNING id INTO v_quo_submitted;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.quotations SET status = 'SENT', quote_sent_at = now(), updated_by = v_sales_a WHERE id = v_quo_submitted;
  EXECUTE 'RESET ROLE';

  SELECT status, quote_sent_at INTO v_sent_status, v_sent_at FROM public.quotations WHERE id = v_quo_submitted;
  RAISE NOTICE '(f2) Send SUBMITTED->SENT -- status=%, quote_sent_at=%', v_sent_status, v_sent_at;
  IF v_sent_status <> 'SENT' OR v_sent_at IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (f2) -- transisi SUBMITTED->SENT seharusnya TIDAK terganggu guard';
  END IF;

  -- (f3) create_quotation_revision -- dari REJECTED (salah satu status FROM
  -- yang diterima fungsi itu).
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by, rejection_reason)
  VALUES (v_company, v_quo_no || '-3', 'REJECTED', v_sales_a, 'Uji K1d f3')
  RETURNING id INTO v_quo_rejected;

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT t.id, t.revision INTO v_rev_id, v_rev_no FROM public.create_quotation_revision(v_quo_rejected) AS t;
  EXECUTE 'RESET ROLE';

  SELECT count(*) INTO v_rev_count FROM public.quotations WHERE quotation_no = v_quo_no || '-3';
  RAISE NOTICE '(f3) create_quotation_revision dari REJECTED -- revisi baru id=%, revision=%, total baris quotation_no ini=%', v_rev_id, v_rev_no, v_rev_count;
  IF v_rev_id IS NULL OR v_rev_no <> 2 OR v_rev_count <> 2 THEN
    RAISE EXCEPTION 'UJI GAGAL (f3) -- create_quotation_revision seharusnya tetap sukses dari REJECTED';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (f)';
END $$;


-- ===== (g) RLS: user BUKAN pembuat dan BUKAN manager (Sales B atas
--           quotation milik Sales A) -- RPC DAN UPDATE langsung sama-sama
--           ditolak (RLS quotations_update, bukan trigger guard) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_sales_b uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
  v_quo_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
  v_status  text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-G', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_sales_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.set_quotation_outcome(v_quo_id, 'REJECTED', 'Coba dari akun lain', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  SELECT status INTO v_status FROM public.quotations WHERE id = v_quo_id;
  RAISE NOTICE '(g) Sales B (bukan pembuat/manager) coba REJECTED -- ditolak=%, pesan=%, status akhir=%', v_caught, v_msg, v_status;
  IF NOT v_caught OR v_status <> 'SENT' THEN
    RAISE EXCEPTION 'UJI GAGAL (g) -- seharusnya ditolak RLS, status tetap SENT';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (g)';
END $$;


-- ===== (h) RLS: user company LAIN (SOA) coba RPC atas quotation milik
--           company MSI -- DITOLAK ("tidak ditemukan atau tidak ada izin
--           baca (RLS)" -- FOR UPDATE di awal fungsi sudah gagal duluan) =====
DO $$
DECLARE
  v_company_msi uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_company_soa uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_other_user uuid;
  v_quo_id  uuid;
  v_caught  boolean := false;
  v_msg     text;
BEGIN
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
    RAISE EXCEPTION 'UJI GAGAL (h) -- nol user fixture aktif di company SOA TANPA peran MSI/super_admin';
  END IF;

  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company_msi, 'ZZZTEST-K1D-H', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.set_quotation_outcome(v_quo_id, 'REJECTED', 'Coba dari entitas lain', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(h) user SOA % coba RPC atas quotation MSI -- ditolak=%, pesan=%', v_other_user, v_caught, v_msg;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (h) -- seharusnya ditolak (quotation tidak kelihatan lewat RLS dari entitas lain)';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (h)';
END $$;


-- ===== (i) Quotation yang SUDAH ACCEPTED SEBELUM migrasi ini (simulasi:
--           accepted_evidence_path NULL, seperti 6 baris staging/96
--           production hari ini) -- tetap TERBACA dan TIDAK RUSAK, nol
--           CHECK constraint yang menolaknya =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_id  uuid;
  v_status  text; v_path text; v_acc_at timestamptz;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by, accepted_at, accepted_by)
  VALUES (v_company, 'ZZZTEST-K1D-I', 'ACCEPTED', v_sales_a, now() - interval '30 days', v_sales_a)
  RETURNING id INTO v_quo_id;
  -- accepted_evidence_path SENGAJA tidak diisi -- simulasi baris LAMA.

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT status, accepted_evidence_path, accepted_at INTO v_status, v_path, v_acc_at
    FROM public.quotations WHERE id = v_quo_id;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(i) quotation ACCEPTED lama (pra-migrasi, simulasi) -- terbaca=%, status=%, accepted_evidence_path=% (harus NULL, SAH), accepted_at=%',
    (v_status IS NOT NULL), v_status, v_path, v_acc_at;
  IF v_status IS DISTINCT FROM 'ACCEPTED' THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- baris ACCEPTED lama seharusnya tetap terbaca persis seperti sebelum migrasi';
  END IF;
  IF v_path IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL (i) -- fixture salah, accepted_evidence_path seharusnya NULL di skenario ini';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (i)';
END $$;


-- ===== (j) RPC ACCEPTED dengan path BERAWALAN BENAR tapi file TIDAK ADA di
--           storage.objects -- DITOLAK (tambahan review Vir: EXISTS-check,
--           bukan sekadar cocok awalan string) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo_id  uuid;
  v_path    text;
  v_caught  boolean := false;
  v_msg     text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-J', 'SENT', v_sales_a)
  RETURNING id INTO v_quo_id;

  -- SENGAJA TIDAK meng-INSERT apa pun ke storage.objects -- path di bawah
  -- berawalan benar (company_id/quotation_id) tapi mengarah ke file yang
  -- tidak pernah "diunggah".
  v_path := v_company::text || '/' || v_quo_id::text || '/zzztest-tidak-pernah-ada.pdf';

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.set_quotation_outcome(v_quo_id, 'ACCEPTED', NULL, v_path);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    v_msg := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '(j) path berawalan benar, file TIDAK ADA -- ditolak=%, pesan=%', v_caught, v_msg;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL (j) -- path berawalan benar tanpa file nyata seharusnya DITOLAK (celah "mengarang path")';
  END IF;
  IF v_msg NOT LIKE '%File bukti tidak ditemukan di penyimpanan%' THEN
    RAISE EXCEPTION 'UJI GAGAL (j) -- pesan error tidak sesuai, dapat: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (j)';
END $$;


-- ===== (k) GUC nexus.quotations_outcome_trusted TIDAK BOCOR: sesudah RPC
--           pencatat SUKSES menjalankan UPDATE-nya untuk quotation #1 (yang
--           mengatur GUC 'on' lalu 'off' lagi), UPDATE LANGSUNG ke ACCEPTED
--           pada quotation #2 YANG LAIN, DALAM TRANSAKSI/BLOK YANG SAMA,
--           TETAP DITOLAK trigger guard (keputusan Den: GUC wajib diatur
--           balik ke 'off' segera sesudah UPDATE, bukan dibiarkan 'on'
--           sampai akhir transaksi) =====
DO $$
DECLARE
  v_company uuid := '0e1840d8-e6fb-4190-bd09-88338e68b492';
  v_sales_a uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_quo1_id uuid; v_quo2_id uuid;
  v_path    text;
  v_status1 text;
  v_caught2 boolean := false;
  v_msg2    text;
  v_status2 text;
BEGIN
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-K1', 'SENT', v_sales_a)
  RETURNING id INTO v_quo1_id;
  INSERT INTO public.quotations (company_id, quotation_no, status, created_by)
  VALUES (v_company, 'ZZZTEST-K1D-K2', 'SENT', v_sales_a)
  RETURNING id INTO v_quo2_id;

  v_path := v_company::text || '/' || v_quo1_id::text || '/zzztest-bukti-k.pdf';
  INSERT INTO storage.objects (bucket_id, name) VALUES ('quotation-acceptance-evidence', v_path);

  PERFORM set_config('request.jwt.claim.sub', v_sales_a::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Langkah 1: RPC sukses untuk quotation #1 -- GUC nyala sesaat lalu mati
  -- lagi DI DALAM fungsi itu sendiri, SEBELUM statement ini selesai.
  PERFORM public.set_quotation_outcome(v_quo1_id, 'ACCEPTED', NULL, v_path);

  -- Langkah 2: DALAM TRANSAKSI/SESI YANG SAMA (nol COMMIT di antaranya --
  -- seluruh blok DO ini satu statement), coba UPDATE LANGSUNG quotation
  -- #2 YANG LAIN ke ACCEPTED. Kalau GUC bocor (tetap 'on'), ini akan
  -- SUKSES secara salah -- harus TETAP ditolak.
  BEGIN
    UPDATE public.quotations SET status = 'ACCEPTED' WHERE id = v_quo2_id;
  EXCEPTION WHEN OTHERS THEN
    v_caught2 := true;
    v_msg2 := SQLERRM;
  END;

  EXECUTE 'RESET ROLE';

  SELECT status INTO v_status1 FROM public.quotations WHERE id = v_quo1_id;
  SELECT status INTO v_status2 FROM public.quotations WHERE id = v_quo2_id;

  RAISE NOTICE '(k) quotation #1 (lewat RPC)=% (harus ACCEPTED) | quotation #2 (UPDATE langsung, GUC seharusnya sudah off)=%, ditolak=%, pesan=%',
    v_status1, v_status2, v_caught2, v_msg2;

  IF v_status1 <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'UJI GAGAL (k) -- quotation #1 seharusnya ACCEPTED lewat RPC (langkah 1 gagal, bukan GUC yang diuji)';
  END IF;
  IF NOT v_caught2 OR v_status2 = 'ACCEPTED' THEN
    RAISE EXCEPTION 'UJI GAGAL (k) -- GUC BOCOR: UPDATE langsung ke ACCEPTED pada quotation LAIN seharusnya TETAP ditolak sesudah RPC selesai';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) (k)';
END $$;
