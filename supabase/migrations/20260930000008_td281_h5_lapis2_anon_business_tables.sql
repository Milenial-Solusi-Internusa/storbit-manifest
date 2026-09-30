-- =============================================================================
-- 20260930000008_td281_h5_lapis2_anon_business_tables.sql
--
-- TD-281 H5 LAPIS 2 -- mencabut hak `anon` (SELECT/INSERT/UPDATE/DELETE, "GRANT
-- ALL") di 11 tabel bisnis (TD-24) dan EXECUTE `anon` di dua RPC yang hanya
-- berguna kalau anon punya hak tabel di baliknya.
--
-- Status: BELUM DIJALANKAN di mana pun (ditulis 30 Sep 2026).
--         Sama seperti lapis 1: STAGING DAN PRODUCTION DI HARI YANG SAMA,
--         sebagai PENGERASAN MANDIRI, TIDAK menunggu launching fitur `develop`
--         (keputusan Den 30 Sep 2026). Jalankan SESUDAH lapis 1 -- lapis 1
--         mencabut T-R-T-M di tabel yang sama; menjalankan keduanya berdekatan
--         menghindari jendela drift ganda pada objek yang sama.
--
-- -- KENAPA INI, DAN KENAPA AMAN ------------------------------------------------
-- TD-24 (diukur 2 Sep 2026, DIUKUR ULANG 30 Sep 2026 -- daftar & jumlah SAMA
-- PERSIS): 11 tabel bisnis memberi `anon` "GRANT ALL" (SELECT/INSERT/UPDATE/
-- DELETE, di luar T-R-T-M yang sudah ditutup lapis 1). RLS aktif di semua
-- tabel ini -- TD-24 sendiri mencatatnya "bukan lubang terbuka", tapi "lebih
-- longgar dari seharusnya".
--
-- TASK 3 (riset sesi ini, `git grep` develop DAN main): NOL baris di seluruh
-- `src/` yang membaca tabel apa pun sebelum login -- `AuthGate` membungkus
-- SELURUH root route, dan satu-satunya hal yang dimuat sebelum sesi ada adalah
-- dua ASET STORAGE PUBLIK (logo + gambar latar di `Login.jsx`), bukan tabel.
-- Log Edge production 23-30 Sep 2026 (~80rb permintaan /rest/v1 + /graphql):
-- NOL permintaan ber-anon-key dari luar `nexus.msigroup.co.id`. ⚠️ Integrasi
-- BULANAN tidak akan terlihat di jendela 7 hari -- rollback per objek tetap
-- disiapkan di ekor berkas.
--
-- Dua RPC yang bisa dipanggil `anon` (`indomarco_dashboard_stats(uuid)`,
-- `storbit_sp_customers()`) adalah SECURITY INVOKER (bukan DEFINER, diverifikasi
-- `schema_snapshot.sql:2960-2962` & `:4873-4875`) -- kalau dipanggil SEBAGAI
-- anon, keduanya BUTUH hak tabel anon yang justru dicabut berkas ini (accounts/
-- sp_orders dkk). Keduanya HANYA dipanggil dari `IndomarcoDashboardPage.jsx`,
-- yang berada di balik `AuthGate` -- dipanggil sebagai `authenticated`, TIDAK
-- PERNAH sebagai `anon`, di kode manapun. Mencabut EXECUTE `anon` di keduanya
-- SEKALIGUS mengunci pintu yang badannya sendiri sudah tidak berguna untuk
-- anon sesudah tabelnya dicabut -- daripada meninggalkan "pintu ada, terkunci
-- dari dalam".
--
-- -- YANG BERKAS INI TIDAK LAKUKAN ----------------------------------------------
-- ⛔ T-R-T-M kesebelas tabel ini = lapis 1 (berkas lain, jalankan LEBIH DULU).
-- ⛔ Hak `authenticated` di tabel-tabel ini TIDAK disentuh -- semuanya memang
--    dibaca/ditulis oleh app sebagai authenticated (mis. `audit_logs` dibaca
--    lewat RLS `is_admin_or_above()`, `prf`/`rate_sheets` modul Procurement/CRM
--    aktif).
-- ⛔ EXECUTE `authenticated` pada kedua RPC TIDAK disentuh -- itulah cara
--    `IndomarcoDashboardPage.jsx` memanggilnya hari ini, dan tetap begitu
--    sesudah berkas ini.
-- ⛔ Peninjauan hak `authenticated` di ~65 tabel RPC-only LAINNYA (di luar 74
--    yang ditulis langsung dari `src/`) SENGAJA TIDAK di sini -- itu "Group D",
--    unit kerja terpisah pasca-launching, per-tabel (bukan sapuan; DML, beda
--    dari T-R-T-M, punya jalur legitimate lewat RLS yang harus diverifikasi
--    satu-satu, bukan diasumsikan kosong).
--
-- -- DAFTAR (diukur 2 Sep 2026, DIUKUR ULANG 30 Sep 2026 -- IDENTIK) -----------
--   app_settings, audit_logs, deal_handovers, meeting_moms, mom_action_plans,
--   mom_improvements, mom_issues, mom_progress_updates, prf, rate_sheets,
--   top_requests
--
-- Terkait: TD-24 · TD-281 · doc 12 butir 46 · H5 lapis 1 (`20260930000007`).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Potret SEBELUM -- 11 tabel TD-24.
-- ⛔ WAJIB diekspor runner ke berkas terpisah sebelum COMMIT (pola sama H1/H2/
-- lapis 1) -- rollback presisi bergantung padanya.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE td281_h5l2_tabel_sebelum ON COMMIT DROP AS
SELECT c.relname AS tabel,
       string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type) AS hak_anon_sebelum
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) g
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
   AND pg_get_userbyid(g.grantee) = 'anon'
   AND c.relname IN ('app_settings','audit_logs','deal_handovers','meeting_moms',
     'mom_action_plans','mom_improvements','mom_issues','mom_progress_updates',
     'prf','rate_sheets','top_requests')
 GROUP BY c.relname;

-- -----------------------------------------------------------------------------
-- V-PRA -- daftar 11 tabel TD-24 HARUS masih persis seperti diukur (kalau
-- BEDA -- misalnya ada tabel ke-12 yang belum tercatat -- ukuran TD-24 sudah
-- basi, JANGAN lanjut dengan daftar lama tanpa mengukur ulang lebih dulu, lihat
-- query TASK 2b sesi ini).
-- -----------------------------------------------------------------------------
DO $pra$
DECLARE v_n int; v_daftar_lain int;
BEGIN
  SELECT count(*) INTO v_n FROM td281_h5l2_tabel_sebelum;
  IF v_n = 0 THEN
    RAISE NOTICE 'V-PRA: nol dari 11 tabel TD-24 masih punya hak anon -- sudah pernah dicabut, lanjut sebagai no-op.';
  ELSE
    RAISE NOTICE 'V-PRA: % dari 11 tabel TD-24 masih punya hak anon, siap dicabut.', v_n;
  END IF;

  -- Sabuk pengaman tipis: kalau ternyata ADA tabel LAIN (di luar 11 ini) yang
  -- masih memberi anon "GRANT ALL" penuh (empat DML sekaligus), itu pertanda
  -- daftar TD-24 sudah basi -- berhenti dan lapor, jangan diam-diam melewatkannya.
  SELECT count(*) INTO v_daftar_lain
    FROM (
      SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) g
       WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
         AND pg_get_userbyid(g.grantee) = 'anon'
         AND g.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
         AND c.relname NOT IN ('app_settings','audit_logs','deal_handovers','meeting_moms',
           'mom_action_plans','mom_improvements','mom_issues','mom_progress_updates',
           'prf','rate_sheets','top_requests')
       GROUP BY c.relname
      HAVING count(DISTINCT g.privilege_type) = 4
    ) x;
  IF v_daftar_lain > 0 THEN
    RAISE EXCEPTION 'V-PRA GAGAL: % tabel DI LUAR daftar 11 TD-24 juga memberi anon keempat hak DML sekaligus. Daftar TD-24 sudah basi -- ukur ulang (query TASK 2b) sebelum melanjutkan.', v_daftar_lain;
  END IF;
  RAISE NOTICE 'V-PRA LOLOS: nol tabel LAIN di luar daftar 11 yang punya GRANT ALL untuk anon.';
END
$pra$;

-- -----------------------------------------------------------------------------
-- PENCABUTAN TABEL.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.app_settings, public.audit_logs, public.deal_handovers, public.meeting_moms,
  public.mom_action_plans, public.mom_improvements, public.mom_issues,
  public.mom_progress_updates, public.prf, public.rate_sheets, public.top_requests
  FROM anon;

-- -----------------------------------------------------------------------------
-- PENCABUTAN RPC. Signature diresolusi dari katalog via oid::regprocedure,
-- BUKAN diketik ulang (gotcha #44, pola sama H1) -- salah ketik signature di
-- sini berarti REVOKE yang tidak mengenai apa pun (kelas TD-282).
-- -----------------------------------------------------------------------------
DO $rpc$
DECLARE v_sig text; v_n int := 0;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('indomarco_dashboard_stats','storbit_sp_customers')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_sig);
    v_n := v_n + 1;
    RAISE NOTICE 'EXECUTE dicabut dari anon: %', v_sig;
  END LOOP;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'V-PRA/RPC GAGAL: ditemukan % fungsi (harus tepat 2: indomarco_dashboard_stats, storbit_sp_customers).', v_n;
  END IF;
END
$rpc$;

-- -----------------------------------------------------------------------------
-- V-POST
-- -----------------------------------------------------------------------------
DO $post$
DECLARE v_sisa_tabel int; v_sisa_fungsi int; v_auth_tabel int; v_auth_fungsi int;
BEGIN
  -- Anon 0 hak di kesebelas tabel.
  SELECT count(*) INTO v_sisa_tabel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) g
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     AND pg_get_userbyid(g.grantee) = 'anon'
     AND c.relname IN (SELECT tabel FROM td281_h5l2_tabel_sebelum);
  IF v_sisa_tabel > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: % hak anon tersisa di 11 tabel TD-24.', v_sisa_tabel;
  END IF;

  -- authenticated TIDAK BOLEH ikut kehilangan hak di tabel yang sama (berkas
  -- ini hanya menyebut FROM anon di REVOKE ALL -- sabuk pengaman memastikan
  -- itu benar-benar terjadi, bukan diasumsikan dari teks perintah).
  SELECT count(*) INTO v_auth_tabel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) g
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
     AND pg_get_userbyid(g.grantee) = 'authenticated'
     AND c.relname IN ('app_settings','audit_logs','deal_handovers','meeting_moms',
       'mom_action_plans','mom_improvements','mom_issues','mom_progress_updates',
       'prf','rate_sheets','top_requests');
  IF v_auth_tabel = 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: authenticated kehilangan SELURUH hak di 11 tabel TD-24 -- itu di luar rencana, app akan patah.';
  END IF;

  -- anon/PUBLIC 0 EXECUTE di kedua RPC.
  SELECT count(*) INTO v_sisa_fungsi
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
   WHERE n.nspname = 'public' AND p.proname IN ('indomarco_dashboard_stats','storbit_sp_customers')
     AND (pg_get_userbyid(a.grantee) = 'anon' OR a.grantee = 0) AND a.privilege_type = 'EXECUTE';
  IF v_sisa_fungsi > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: anon/PUBLIC masih EXECUTE kedua RPC.';
  END IF;

  -- authenticated TETAP EXECUTE kedua RPC -- IndomarcoDashboardPage.jsx
  -- memanggilnya sebagai authenticated, harus tetap jalan.
  SELECT count(*) INTO v_auth_fungsi
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
   WHERE n.nspname = 'public' AND p.proname IN ('indomarco_dashboard_stats','storbit_sp_customers')
     AND pg_get_userbyid(a.grantee) = 'authenticated' AND a.privilege_type = 'EXECUTE';
  IF v_auth_fungsi <> 2 THEN
    RAISE EXCEPTION 'V-POST GAGAL: authenticated tidak lagi EXECUTE kedua RPC (hanya %/2) -- Indomarco Dashboard akan patah.', v_auth_fungsi;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: anon 0 hak di 11 tabel TD-24 (authenticated utuh), 0 EXECUTE anon/PUBLIC di kedua RPC (authenticated utuh).';
END
$post$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Per tabel, dari `td281_h5l2_tabel_sebelum` yang diekspor runner sebelum
-- COMMIT (pola sama H1/lapis 1) -- bukan blanket "GRANT ALL" balik, karena
-- kolom `hak_anon_sebelum` mencatat PERSIS privilege apa yang dulu ada (bisa
-- beda per tabel walau sama-sama "TD-24").
--   GRANT <daftar privilege dari hak_anon_sebelum> ON TABLE public.<tabel> TO anon;
-- RPC (signature via oid::regprocedure saat rollback, jangan diketik ulang):
--   GRANT EXECUTE ON FUNCTION public.indomarco_dashboard_stats(uuid) TO anon;
--   GRANT EXECUTE ON FUNCTION public.storbit_sp_customers()          TO anon;
--
-- !! Sama seperti lapis 1: lakukan hanya kalau ada yang benar-benar patah dan
--    itu bukan sesuatu yang bisa diperbaiki dengan cara lain (mis. memindahkan
--    pemanggil ke authenticated) -- integrasi anon key yang sah TIDAK ADA
--    hari ini (log 7 hari, lihat header), jadi rollback ini semestinya nol
--    kali dipakai.
-- =============================================================================
