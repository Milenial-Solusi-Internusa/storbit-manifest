-- =============================================================================
-- Skrip uji transaksi-aman untuk RPC/trigger Won manual, Revert, Won otomatis
-- (TD-318 Irisan 3), migrasi 20261021000001. TIDAK DIJALANKAN oleh siapa pun
-- di sesi penulisan ini -- hanya ditulis untuk Den eksekusi manual di
-- staging SESUDAH migrasi jalan.
--
-- WAJIB jalankan tiap blok DO sebagai STATEMENT TERPISAH -- RAISE EXCEPTION
-- di akhir blok hanya membatalkan pekerjaan blok itu sendiri kalau blok itu
-- adalah statement-nya sendiri (bukan di-select-all sekaligus satu transaksi
-- besar). Setiap blok SELALU berakhir RAISE EXCEPTION, baik lulus ("UJI
-- LULUS (dibatalkan sengaja)") maupun gagal ("UJI GAGAL -- ...") -- nol baris
-- tersisa di DB dalam kedua kasus.
--
-- Identitas akun uji staging (semuanya perusahaan MSI, dikonfirmasi Den):
--   manager (level 6)             : 7f218c76-196e-4580-baf1-6bdf17c6a35a
--   sales pemilik                 : a3eea21f-dcbc-47d3-897b-ad68e4e35989
--   sales lain (bukan pemilik,
--     bukan manager)              : 6739c239-e2ff-48ff-97ed-23059f749218
--
-- Company setiap blok DITURUNKAN dari profiles.company_id milik akun sales
-- pemilik (BUKAN "ORDER BY created_at LIMIT 1" pada companies -- itu
-- mengembalikan JCI, sementara ketiga akun uji ada di MSI; salah company =
-- gate manager dan RLS gagal karena entitas tidak cocok).
--
-- Dua kebutuhan sesi, berlaku di blok yang memanggil create_quotation_
-- revision/save_quotation sebagai akun TERTENTU (bukan postgres):
--   1. set_config('request.jwt.claim.sub', <uuid>, true) -- supaya auth.uid()
--      resolve ke akun itu.
--   2. EXECUTE 'SET LOCAL ROLE authenticated' -- supaya RLS (TO authenticated)
--      benar-benar dievaluasi; tanpa ini SQL Editor tetap berjalan sebagai
--      postgres yang melewati RLS sepenuhnya, dan uji "berhasil sebagai
--      sales pemilik" bisa lulus palsu walau RLS sebenarnya akan menolak
--      user nyata.
-- =============================================================================

-- =====================================================================
-- (1) Mark Won sukses -- 4 blok, satu per alasan. Actor: sales pemilik
-- (owner inquiry). Tiap blok independen.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_reason text := 'Quoted outside Nexus';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);
  IF v_company_id IS NULL OR v_account_id IS NULL THEN
    RAISE EXCEPTION 'UJI TIDAK BISA DIJALANKAN -- company/account fixture tidak ditemukan';
  END IF;

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM mark_inquiry_won(v_inq_id, v_reason, v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', 'catatan uji 1a');

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- status tidak jadi WON';
  END IF;
  IF (SELECT won_reason FROM inquiries WHERE id = v_inq_id) <> v_reason THEN
    RAISE EXCEPTION 'UJI GAGAL -- won_reason tidak tersimpan dengan benar';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- alasan: %', v_reason;
END $$;

DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_reason text := 'Repeat order under existing agreement';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'NEGOTIATION', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM mark_inquiry_won(v_inq_id, v_reason, v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- status tidak jadi WON';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- alasan: %', v_reason;
END $$;

DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_reason text := 'Verbal confirmation';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'OPEN', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM mark_inquiry_won(v_inq_id, v_reason, v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- status tidak jadi WON';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- alasan: %', v_reason;
END $$;

DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_reason text := 'Legacy data';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'IN_REVIEW', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM mark_inquiry_won(v_inq_id, v_reason, v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- status tidak jadi WON';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- alasan: %', v_reason;
END $$;

-- =====================================================================
-- (2) Mark Won ditolak tanpa bukti
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  BEGIN
    PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- Mark Won tanpa bukti seharusnya ditolak'; END IF;
  IF v_msg NOT LIKE '%Bukti wajib%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena bukti kosong. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (3) Mark Won ditolak bukan-owner-bukan-manager. Actor: sales lain.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_uuid_sales_lain  uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_lain::text, true);
  BEGIN
    PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- Mark Won oleh bukan owner/manager seharusnya ditolak'; END IF;
  IF v_msg NOT LIKE '%Hanya pemilik inquiry, Manager ke atas%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena gate owner/manager. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (4) Mark Won ditolak dari status tidak valid (LOST)
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'LOST', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  BEGIN
    PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- Mark Won dari LOST seharusnya ditolak'; END IF;
  IF v_msg NOT LIKE '%tidak bisa ditandai Won secara manual%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena status asal tidak valid. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (5) Revert sukses -- status balik ke status asal, closed_at/closed_by
-- NULL, won_reason/won_evidence_path NULL, quotation SUPERSEDED tetap
-- SUPERSEDED, audit_logs old_data lengkap.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id uuid;
  v_old_data jsonb;
  v_uuid_manager     uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SENT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);
  PERFORM revert_manual_win(v_inq_id, 'uji revert sukses, tes 5');

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'QUOTED' THEN
    RAISE EXCEPTION 'UJI GAGAL -- status tidak balik ke QUOTED (status asal)';
  END IF;
  IF (SELECT closed_at FROM inquiries WHERE id = v_inq_id) IS NOT NULL
     OR (SELECT closed_by FROM inquiries WHERE id = v_inq_id) IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- closed_at/closed_by seharusnya NULL sesudah revert';
  END IF;
  IF (SELECT won_reason FROM inquiries WHERE id = v_inq_id) IS NOT NULL
     OR (SELECT won_evidence_path FROM inquiries WHERE id = v_inq_id) IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- won_reason/won_evidence_path seharusnya NULL sesudah revert';
  END IF;
  IF (SELECT status FROM quotations WHERE id = v_quo_id) <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'UJI GAGAL -- quotation seharusnya TETAP SUPERSEDED sesudah revert';
  END IF;

  SELECT old_data INTO v_old_data FROM audit_logs
   WHERE entity_id = v_inq_id AND action = 'REVERT_MANUAL_WIN' ORDER BY created_at DESC LIMIT 1;
  IF v_old_data IS NULL
     OR v_old_data->>'status' <> 'WON'
     OR v_old_data->>'won_reason' <> 'Verbal confirmation'
     OR v_old_data->>'won_evidence_path' IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- audit_logs.old_data REVERT_MANUAL_WIN tidak lengkap: %', v_old_data;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (6) Revert ditolak non-manager. Actor: sales lain.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_manager     uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
  v_uuid_sales_lain  uuid := '6739c239-e2ff-48ff-97ed-23059f749218';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_lain::text, true);
  BEGIN
    PERFORM revert_manual_win(v_inq_id, 'uji revert oleh non-manager');
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- Revert oleh non-manager seharusnya ditolak'; END IF;
  IF v_msg NOT LIKE '%Hanya Manager ke atas atau Super Admin%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena gate manager. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (7) Revert ditolak -- won_reason teks bebas (tidak dikenal, bukan 4
-- alasan whitelist, bukan juga 'Accepted quotation'). Actor: manager.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_msg text; v_caught boolean := false;
  v_uuid_manager     uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  -- simulasikan baris lama ber-won_reason teks bebas (kelas 3 baris yang
  -- sudah ada di staging hari ini, lihat §9 PLAN Irisan 3 -- bukan salah
  -- satu dari 4 alasan whitelist, bukan juga 'Accepted quotation').
  UPDATE inquiries SET won_reason = 'Relationship' WHERE id = v_inq_id;

  BEGIN
    PERFORM revert_manual_win(v_inq_id, 'uji revert won_reason tidak dikenal');
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;

  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- Revert dengan won_reason tidak dikenal seharusnya ditolak'; END IF;
  IF v_msg NOT LIKE '%bukan Won manual%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena won_reason tidak dikenali. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (8) Won otomatis dari set_quotation_outcome(..., 'ACCEPTED', NULL).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id uuid;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SENT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM set_quotation_outcome(v_quo_id, 'ACCEPTED', NULL);

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- inquiry tidak jadi WON dari quotation Accepted';
  END IF;
  IF (SELECT won_reason FROM inquiries WHERE id = v_inq_id) <> 'Accepted quotation' THEN
    RAISE EXCEPTION 'UJI GAGAL -- won_reason seharusnya ''Accepted quotation''';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (9) Won otomatis dari jalur sales_orders.status='SENT'
-- (set_inquiry_won_on_so) -- quotation SENT yang SEDANG berjalan TIDAK
-- boleh ikut tersapu, won_reason TETAP NULL, tapi penguncian quotation
-- baru TETAP menyala. SEMUA kolom NOT NULL sales_orders/quotations diisi
-- (company_id, so_no, status, inquiry_id, account_id -- diverifikasi dari
-- schema_snapshot.sql, tidak ditebak).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id uuid; v_so_id uuid;
  v_status_sebelum text; v_reason_sebelum text; v_status_sesudah text; v_reason_sesudah text;
  v_inq_status text; v_inq_won_reason text; v_msg text; v_caught boolean;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SENT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  SELECT status, rejection_reason INTO v_status_sebelum, v_reason_sebelum FROM quotations WHERE id = v_quo_id;

  -- sales_orders: company_id, so_no, status, inquiry_id, account_id -- SEMUA
  -- NOT NULL (schema_snapshot.sql:9677-9695). 'signed' DEFAULT false NOT
  -- NULL, tidak perlu diisi. Trigger trg_inquiry_won menyala AFTER INSERT
  -- OR UPDATE -- INSERT langsung status SENT sudah cukup memicunya.
  INSERT INTO sales_orders (company_id, so_no, status, inquiry_id, account_id)
  VALUES (v_company_id, 'UJI-SO-' || extract(epoch FROM now())::text, 'SENT', v_inq_id, v_account_id)
  RETURNING id INTO v_so_id;

  SELECT status, won_reason INTO v_inq_status, v_inq_won_reason FROM inquiries WHERE id = v_inq_id;
  SELECT status, rejection_reason INTO v_status_sesudah, v_reason_sesudah FROM quotations WHERE id = v_quo_id;

  RAISE NOTICE 'inquiry status=%, won_reason=%, quotation status=%, quotation reason=%',
    v_inq_status, v_inq_won_reason, v_status_sesudah, v_reason_sesudah;

  IF v_inq_status <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- inquiry tidak jadi WON dari SO SENT (status=%)', v_inq_status;
  END IF;
  IF v_inq_won_reason IS NOT NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- won_reason seharusnya tetap NULL untuk jalur SO, ternyata %', v_inq_won_reason;
  END IF;
  IF v_status_sesudah <> v_status_sebelum OR v_reason_sesudah IS DISTINCT FROM v_reason_sebelum THEN
    RAISE EXCEPTION 'UJI GAGAL -- quotation SENT yang sedang berjalan ikut tersapu (status %->%, reason %->%)',
      v_status_sebelum, v_status_sesudah, v_reason_sebelum, v_reason_sesudah;
  END IF;

  -- penguncian TETAP menyala walau won_reason NULL -- BEFORE trigger bukan
  -- mekanisme RLS, menyala untuk SEMUA role termasuk postgres.
  v_caught := false;
  BEGIN
    INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, status, created_by)
    VALUES (v_company_id, 'UJI-QUO2-' || extract(epoch FROM now())::text, 1, v_inq_id, 'DRAFT', v_uuid_sales_owner);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- insert quotation baru seharusnya ditolak (inquiry WON)'; END IF;
  IF v_msg NOT LIKE '%terkunci%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- insert quotation ditolak tapi BUKAN karena terkunci. Pesan sebenarnya: %', v_msg;
  END IF;

  -- save_quotation: SECURITY INVOKER -- switch ke role authenticated dulu
  -- supaya RLS/role ikut berperan, bukan dievaluasi sebagai postgres.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  v_caught := false;
  BEGIN
    PERFORM save_quotation(v_quo_id, jsonb_build_object('notes','uji'), NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- save_quotation pada quotation SENT yang masih hidup seharusnya ditolak';
  END IF;
  IF v_msg NOT LIKE '%terkunci%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- save_quotation ditolak tapi BUKAN karena terkunci. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (10) Won tidak mengunci balik (jalur quotation Accepted) -- insert
-- quotation baru DAN save_quotation pada quotation yang MENANG itu
-- sendiri harus sama-sama ditolak setelah inquiry WON. set_config ke
-- sales pemilik SEBELUM set_quotation_outcome supaya auth.uid() tidak
-- NULL saat quotation di-Accept.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id uuid;
  v_msg text; v_caught boolean;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SENT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM set_quotation_outcome(v_quo_id, 'ACCEPTED', NULL);

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL -- inquiry tidak jadi WON dari quotation Accepted';
  END IF;

  v_caught := false;
  BEGIN
    INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, status, created_by)
    VALUES (v_company_id, 'UJI-QUO2-' || extract(epoch FROM now())::text, 1, v_inq_id, 'DRAFT', v_uuid_sales_owner);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- insert quotation baru seharusnya ditolak'; END IF;
  IF v_msg NOT LIKE '%terkunci%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena terkunci. Pesan sebenarnya: %', v_msg;
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  v_caught := false;
  BEGIN
    -- quotation yang BARU SAJA menang sendiri -- tetap tak bisa disentuh lagi.
    PERFORM save_quotation(v_quo_id, jsonb_build_object('notes','uji'), NULL);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN RAISE EXCEPTION 'UJI GAGAL -- save_quotation pada quotation pemenang seharusnya tetap ditolak'; END IF;
  IF v_msg NOT LIKE '%terkunci%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena terkunci. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (11) Notifikasi atasan -- dua sub-kasus, reports_to diubah SEMENTARA
-- di dalam blok (ikut rollback karena blok selalu RAISE EXCEPTION).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_notif_count int;
  v_uuid_manager     uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  -- Sub-kasus A: reports_to terisi -> 1 notifikasi.
  UPDATE profiles SET reports_to = v_uuid_manager WHERE id = v_uuid_sales_owner;

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  SELECT count(*) INTO v_notif_count FROM notifications
   WHERE reference_type = 'inquiry' AND reference_id = v_inq_id AND event_type = 'inquiry_manual_win';
  IF v_notif_count <> 1 THEN
    RAISE EXCEPTION 'UJI GAGAL (sub-kasus A, reports_to terisi) -- harusnya 1 notifikasi, dapat %', v_notif_count;
  END IF;

  -- Sub-kasus B: reports_to dikosongkan -> 0 notifikasi, Mark Won TETAP sukses.
  UPDATE profiles SET reports_to = NULL WHERE id = v_uuid_sales_owner;

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);

  IF (SELECT status FROM inquiries WHERE id = v_inq_id) <> 'WON' THEN
    RAISE EXCEPTION 'UJI GAGAL (sub-kasus B) -- Mark Won seharusnya tetap sukses walau tanpa atasan';
  END IF;
  SELECT count(*) INTO v_notif_count FROM notifications
   WHERE reference_type = 'inquiry' AND reference_id = v_inq_id AND event_type = 'inquiry_manual_win';
  IF v_notif_count <> 0 THEN
    RAISE EXCEPTION 'UJI GAGAL (sub-kasus B, reports_to NULL) -- harusnya 0 notifikasi, dapat %', v_notif_count;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja) -- termasuk mengembalikan reports_to';
END $$;

-- =====================================================================
-- (12) Revert sebagai Manager, lalu create_quotation_revision SEBAGAI
-- SALES PEMILIK inquiry (bukan Manager, bukan postgres) -- supaya RLS
-- quotations_insert/update ikut teruji, bukan hanya gate internal fungsi.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id uuid; v_new_id uuid;
  v_uuid_manager     uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SENT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);
  PERFORM revert_manual_win(v_inq_id, 'uji revert untuk tes 12');

  IF (SELECT status FROM quotations WHERE id = v_quo_id) <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'UJI SETUP GAGAL -- quotation seharusnya SUPERSEDED sesudah Won+Revert';
  END IF;
  IF (SELECT status FROM inquiries WHERE id = v_inq_id) = 'WON' THEN
    RAISE EXCEPTION 'UJI SETUP GAGAL -- inquiry seharusnya sudah tidak WON sesudah Revert';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  v_new_id := create_quotation_revision(v_quo_id);

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'UJI GAGAL -- revisi tidak terbentuk saat dipanggil sebagai sales pemilik';
  END IF;
  IF (SELECT status FROM quotations WHERE id = v_new_id) <> 'DRAFT' THEN
    RAISE EXCEPTION 'UJI GAGAL -- revisi baru seharusnya DRAFT';
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (13a) Quotation versi TERAKHIR, SUPERSEDED, rejection_reason BUKAN
-- berawalan 'Otomatis: inquiry ditandai Won' (NULL), inquiry induk MASIH
-- QUOTED (bukan WON/LOST/CANCELLED). Satu-satunya sebab yang mungkin
-- menolaknya adalah gate status SENT/REJECTED -- bukan status inquiry.
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id uuid;
  v_msg text; v_caught boolean;
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, rejection_reason, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SUPERSEDED', NULL, v_uuid_sales_owner)
  RETURNING id INTO v_quo_id;

  v_caught := false;
  BEGIN
    PERFORM create_quotation_revision(v_quo_id);
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- SUPERSEDED tanpa awalan Won seharusnya ditolak walau inquiry masih terbuka';
  END IF;
  IF v_msg NOT LIKE '%Hanya quotation berstatus SENT atau REJECTED%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena gate status SENT/REJECTED. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- =====================================================================
-- (13b) Dibangun PENUH di dalam blok ini sendiri (tidak bergantung 13a --
-- tiap blok rollback sendiri): Mark Won manual -> Revert -> create_
-- quotation_revision (membentuk revisi N+1) -> panggil ULANG create_
-- quotation_revision pada revisi N (SUPERSEDED, berawalan Won) yang KINI
-- BUKAN versi terakhir. Harus ditolak oleh aturan VERSI TERAKHIR, BUKAN
-- oleh aturan awalan alasan (awalannya di sini justru COCOK dan status
-- inquiry sudah tidak WON).
-- =====================================================================
DO $$
DECLARE
  v_company_id uuid; v_account_id uuid; v_inq_id uuid; v_quo_id_n uuid; v_quo_id_n1 uuid;
  v_msg text; v_caught boolean;
  v_uuid_manager     uuid := '7f218c76-196e-4580-baf1-6bdf17c6a35a';
  v_uuid_sales_owner uuid := 'a3eea21f-dcbc-47d3-897b-ad68e4e35989';
BEGIN
  v_company_id := (SELECT company_id FROM profiles WHERE id = v_uuid_sales_owner);
  v_account_id := (SELECT id FROM accounts WHERE company_id = v_company_id AND deleted_at IS NULL LIMIT 1);

  INSERT INTO inquiries (company_id, inquiry_no, prospect_id, status, owner_id)
  VALUES (v_company_id, 'UJI-INQ-' || extract(epoch FROM now())::text, v_account_id, 'QUOTED', v_uuid_sales_owner)
  RETURNING id INTO v_inq_id;

  INSERT INTO quotations (company_id, quotation_no, revision, inquiry_id, prospect_id, status, created_by)
  VALUES (v_company_id, 'UJI-QUO-' || extract(epoch FROM now())::text, 1, v_inq_id, v_account_id, 'SENT', v_uuid_sales_owner)
  RETURNING id INTO v_quo_id_n;

  PERFORM set_config('request.jwt.claim.sub', v_uuid_manager::text, true);
  PERFORM mark_inquiry_won(v_inq_id, 'Verbal confirmation', v_company_id::text || '/' || v_inq_id::text || '/uji.pdf', NULL);
  PERFORM revert_manual_win(v_inq_id, 'uji revert untuk tes 13b');

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_uuid_sales_owner::text, true);
  v_quo_id_n1 := create_quotation_revision(v_quo_id_n); -- revisi N+1 terbentuk; quotation N tetap SUPERSEDED tapi KINI bukan versi terakhir

  IF v_quo_id_n1 IS NULL THEN
    RAISE EXCEPTION 'UJI SETUP GAGAL -- revisi N+1 tidak terbentuk, tes 13b tidak bisa dilanjutkan';
  END IF;

  v_caught := false;
  BEGIN
    PERFORM create_quotation_revision(v_quo_id_n); -- panggil ULANG pada versi N yang sekarang bukan terakhir
  EXCEPTION WHEN OTHERS THEN v_caught := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- revisi dari versi BUKAN terakhir seharusnya tetap ditolak';
  END IF;
  IF v_msg NOT LIKE '%Revisi hanya boleh dibuat dari versi terakhir%' THEN
    RAISE EXCEPTION 'UJI GAGAL -- ditolak tapi BUKAN karena aturan versi terakhir. Pesan sebenarnya: %', v_msg;
  END IF;

  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;
