-- =============================================================================
-- verify-option-requests-rpc.sql
--
-- Skrip uji TRANSAKSI-AMAN untuk RPC Option Requests pasca-migrasi
-- 20261020000001_crm_option_requests_approve_note_and_notify.sql.
--
-- TIDAK DIJALANKAN oleh Claude Code -- hanya ditulis untuk Den/Vir eksekusi
-- manual di staging SESUDAH migrasi di atas jalan (plan Irisan 5 §5d/§8
-- Commit 5). Bukan file migrasi -- sengaja ditaruh di scripts/qa/sql/,
-- bukan supabase/migrations/, supaya tooling antrean tidak menganggapnya
-- migrasi sungguhan.
--
-- Empat blok DO, MASING-MASING MANDIRI (impersonasi + aksi + assersi dalam
-- SATU blok, nol ketergantungan pada statement di luar blok). SETIAP blok
-- SELALU diakhiri RAISE EXCEPTION -- baik "UJI LULUS (dibatalkan sengaja)"
-- (assersi lolos) maupun "UJI GAGAL -- ..." (assersi gagal) -- kedua kasus
-- membatalkan transaksi blok itu sendiri, jadi menjalankan skrip ini TIDAK
-- PERNAH meninggalkan baris baru di dropdown_option_requests/
-- dropdown_options/notifications, apa pun hasilnya.
--
-- ⚠️ DUA CATATAN WAJIB DIBACA SEBELUM MENJALANKAN:
--
-- 1. SETIAP blok "DO $$...$$" HARUS dieksekusi sebagai STATEMENT TERPISAH
--    di SQL Editor (bukan di-select-all lalu Run sekaligus di dalam satu
--    transaksi besar) -- RAISE EXCEPTION di akhir blok hanya membatalkan
--    PEKERJAAN BLOK ITU SENDIRI kalau blok itu adalah statement-nya sendiri.
--
-- 2. IMPERSONASI ADA DI DALAM TIAP BLOK (koreksi Vir, 20 Okt 2026) --
--    `PERFORM set_config('request.jwt.claim.sub', '<uuid>', true)` adalah
--    PERNYATAAN PERTAMA di dalam BEGIN tiap blok, BUKAN `SET LOCAL` di
--    statement terpisah SEBELUM blok (draf sebelumnya menaruhnya di luar
--    blok sebagai komentar -- berisiko hilang kalau SQL Editor meng-commit
--    per-statement sebelum blok DO-nya sendiri jalan). `set_config(..., true)`
--    = is_local TRUE, berlaku untuk transaksi blok DO ITU SENDIRI, jadi
--    tidak bergantung pada bagaimana statement sebelumnya di-commit.
--    Isi placeholder `<UUID_NON_MANAGER>`/`<UUID_MANAGER>` SEBELUM
--    menjalankan (lihat project memory "Staging test accounts" -- 5 akun
--    peran, password tidak dicatat di sini): blok (a) = akun non-manager,
--    blok (b)/(c)/(d) = akun manager ke atas. Tanpa ini auth.uid() NULL
--    (CLAUDE.md Aturan Wajib) dan:
--      - uji (a) submit akan mencatat 0 notifikasi terkirim secara
--        MENYESATKAN, karena `ur.user_id <> auth.uid()` menjadi
--        `ur.user_id <> NULL` = UNKNOWN untuk SETIAP baris -- bukan bukti
--        fungsinya salah.
--      - uji (b)/(c)/(d) approve/reject akan LANGSUNG GAGAL di gerbang
--        is_manager_or_above() sebelum sempat menguji apa pun, karena
--        auth.uid() NULL membuat fungsi itu selalu false.
-- =============================================================================

-- (a) submit_dropdown_option_request membuat notifikasi ke manager.
-- Impersonasi: akun NON-manager.
DO $$
DECLARE
  v_req_id uuid;
  v_notif_count int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<UUID_NON_MANAGER>', true);
  v_req_id := public.submit_dropdown_option_request(
    'lead_industry', 'UJI SEMENTARA ' || now()::text, 'uji otomatis -- akan dibatalkan', NULL);
  SELECT count(*) INTO v_notif_count FROM public.notifications
   WHERE reference_type = 'dropdown_option_request' AND reference_id = v_req_id
     AND event_type = 'dropdown_option_request_submitted';
  RAISE NOTICE 'Request id=%, notifikasi manager terkirim=%', v_req_id, v_notif_count;
  IF v_notif_count = 0 THEN
    RAISE EXCEPTION 'UJI GAGAL -- nol notifikasi terkirim (cek: UUID placeholder sudah diisi? ada manager aktif lain di staging?)';
  END IF;
  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- (b) approve menambah opsi ke dropdown_options DAN menyimpan approval_note.
-- Impersonasi: akun manager-ke-atas.
DO $$
DECLARE
  v_req_id uuid;
  v_opt_id uuid;
  v_note_saved text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<UUID_MANAGER>', true);
  INSERT INTO public.dropdown_option_requests (list_key, label, reason, requested_by)
    VALUES ('lead_industry', 'UJI APPROVE ' || now()::text, 'uji otomatis', auth.uid())
    RETURNING id INTO v_req_id;
  v_opt_id := public.approve_dropdown_option_request(v_req_id, 'catatan uji approve');
  SELECT approval_note INTO v_note_saved FROM public.dropdown_option_requests WHERE id = v_req_id;
  RAISE NOTICE 'Opsi baru id=%, approval_note tersimpan=%', v_opt_id, v_note_saved;
  IF v_opt_id IS NULL OR v_note_saved IS DISTINCT FROM 'catatan uji approve' THEN
    RAISE EXCEPTION 'UJI GAGAL -- opsi tidak terbuat atau approval_note tidak tersimpan';
  END IF;
  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- (c) reject TANPA alasan ditolak.
-- Impersonasi: akun manager-ke-atas.
DO $$
DECLARE
  v_req_id uuid;
  v_caught boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<UUID_MANAGER>', true);
  INSERT INTO public.dropdown_option_requests (list_key, label, reason, requested_by)
    VALUES ('lead_industry', 'UJI REJECT-KOSONG ' || now()::text, 'uji otomatis', auth.uid())
    RETURNING id INTO v_req_id;
  BEGIN
    PERFORM public.reject_dropdown_option_request(v_req_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE 'Reject tanpa alasan ditolak, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- reject tanpa alasan seharusnya ditolak tapi lolos';
  END IF;
  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;

-- (d) approve KEDUA KALI pada request yang sama ditolak.
-- Impersonasi: akun manager-ke-atas.
DO $$
DECLARE
  v_req_id uuid;
  v_opt_id uuid;
  v_caught boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '<UUID_MANAGER>', true);
  INSERT INTO public.dropdown_option_requests (list_key, label, reason, requested_by)
    VALUES ('lead_industry', 'UJI APPROVE-DUA-KALI ' || now()::text, 'uji otomatis', auth.uid())
    RETURNING id INTO v_req_id;
  v_opt_id := public.approve_dropdown_option_request(v_req_id, 'approve pertama');
  BEGIN
    PERFORM public.approve_dropdown_option_request(v_req_id, 'approve kedua');
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    RAISE NOTICE 'Approve kedua pada request yg sama ditolak, pesan: %', SQLERRM;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'UJI GAGAL -- approve kedua seharusnya ditolak (status sudah approved) tapi lolos';
  END IF;
  RAISE EXCEPTION 'UJI LULUS (dibatalkan sengaja)';
END $$;
