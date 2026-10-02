-- =============================================================================
-- 20261001000001_td301_lapis_b_inactive_user_db_guard.sql
--
-- TD-301 LAPIS B -- pengaman database: user yang `profiles.active = false`
-- ditolak di server pada SETIAP request, terlepas dari apakah access token
-- yang mereka pegang masih sah (JWT stateless -- tidak dicek ulang ke server
-- Auth per request PostgREST/RPC). Ini lapis yang SUNGGUH menutup TD-301,
-- bukan Lapis A (blokir Supabase Auth, `set-user-status` Edge Function) atau
-- Lapis C (layar "Akun Dinonaktifkan" + auto-signout) -- keduanya kosmetik
-- dibanding ini, dan keduanya sudah diterapkan terpisah dari migrasi ini.
--
-- Status: ✅ LIVE staging DAN production 1 Okt 2026 (ditulis 1 Okt 2026,
--         DISELARASKAN 2 Okt 2026 dengan dua koreksi yang lahir SAAT
--         dijalankan -- lihat "DUA KOREKSI DARI EKSEKUSI SUNGGUHAN" di bawah.
--         Isi berkas ini ADALAH yang berjalan, bukan rencana awal). Hotfix
--         dari `main` (branch `hotfix/td301-user-nonaktif`) -- lihat doc 12.
--
-- -- DUA KOREKSI DARI EKSEKUSI SUNGGUHAN, BUKAN DARI RENCANA AWAL -------------
-- Rencana awal (commit pertama berkas ini, 1 Okt 2026) membungkus SELURUH 12
-- fungsi boolean dengan `is_caller_active() AND (...)`. Dua hal ternyata salah
-- begitu dijalankan -- bukan dibaca ulang, DIUKUR:
--
-- (1) **`is_admin_tier_role(p_role_id)` TIDAK BOLEH dibungkus -- badannya
--     TIDAK DIUBAH SAMA SEKALI.** Fungsi ini menilai sebuah ROLE (baris
--     `roles`), bukan pemanggilnya -- nol `auth.uid()` di badannya. Ia dipakai
--     dalam NEGASI di `user_roles_insert`/`user_roles_update`
--     (`NOT is_admin_tier_role(role_id)`, mencegah penetapan role admin-tier
--     lewat jalur yang tidak seharusnya). Membungkusnya membuat fungsi itu
--     SELALU `false` untuk pemanggil nonaktif -> `NOT false = true` -> syarat
--     "role ini BUKAN admin-tier" **lolos** justru untuk role yang memang
--     admin-tier, tepat saat pemanggilnya paling tidak berhak. Hari ini
--     tertutup kebetulan oleh klausa `is_admin_or_above()` di policy yang
--     sama -- itu bukan jaminan, dan jadi jebakan untuk policy berikutnya
--     yang memakai `is_admin_tier_role` sendirian. Lihat gotcha #46
--     (`03_DATA_MODEL.md`).
--
-- (2) **Pola "bungkus is_caller_active() AND EXISTS(...)" diganti jadi JOIN
--     langsung, karena fungsi `SECURITY DEFINER` bersarang TIDAK di-inline
--     planner dan dieksekusi PER BARIS.** Diukur di production (finance
--     user, rata-rata beberapa kali panggil):
--       sebelum migrasi apa pun : sp_items 1,0 ms  · sp_orders 22,3 ms ·
--                                  invoice 26,5 ms · produk 3,7 ms
--       versi pertama (dibatalkan): sp_items 9,5 ms · sp_orders 89 ms ·
--                                  invoice 77 ms   · produk 13,7 ms  (3-4x)
--       versi final (LIVE)       : sp_items 0,8 ms · sp_orders 25,7 ms ·
--                                  invoice 22,8 ms · produk 4,4 ms
--     Perbaikannya BUKAN mengoptimalkan `is_caller_active()` -- melainkan
--     TIDAK memanggilnya dari dalam fungsi lain sama sekali. 10 fungsi
--     berbasis `user_roles` kini menyatakan syarat aktif lewat
--     `JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true` di DALAM
--     `EXISTS` yang sama (planner bisa menggabungkannya ke rencana query),
--     dan `is_bnf_authorized` memakai
--     `EXISTS (SELECT 1 FROM profiles pa WHERE pa.id = auth.uid() AND pa.active = true) AND (...)`
--     -- EXISTS inline, bukan panggilan fungsi. `is_caller_active()` TETAP
--     ADA dan TETAP DIPAKAI, tapi HANYA dipanggil LANGSUNG dari definisi
--     POLICY (17 policy tulis + `profiles_update`) -- pemanggilan di situ
--     sudah per-baris secara alami (RLS selalu dievaluasi per baris), jadi
--     tidak ada lapis bersarang TAMBAHAN yang ditambahkan. Lihat gotcha #47
--     (`03_DATA_MODEL.md`). Sidik md5 gabungan ke-15 fungsi (14 lama +
--     `is_caller_active()` baru) IDENTIK di staging dan production sesudah
--     kedua koreksi: `28cfb89d08d5878130980adf5cc63299`.
--
-- COMMENT `is_caller_active()` diperbarui mengikuti (2) -- tidak lagi
-- menyebut "dibungkus ke 12 fungsi bantu peran".
--
-- -- BADAN DIAMBIL DARI LINGKUNGAN HIDUP, BUKAN DARI schema_snapshot.sql ------
-- `schema_snapshot.sql` terakhir di-refresh 18 Sep 2026 dan sudah dinyatakan
-- BASI di CLAUDE.md untuk banyak hal lain. Keempat belas badan fungsi di
-- bawah (12 boolean + 2 fungsi nilai) disalin dari `pg_get_functiondef` yang
-- dibaca LANGSUNG dari staging (`oovmlhilhqzejnawqkvt`) dan dicocokkan byte-
-- demi-byte terhadap production (`untmpqceexwxzuhlmyrg`) pada 1 Okt 2026 --
-- keduanya IDENTIK untuk seluruh 14 fungsi (md5(prosrc) sama persis di kedua
-- lingkungan). Begitu juga kesembilan belas policy yang disentuh di bawah
-- (18 self-write + `profiles_update`) -- qual/with_check dibaca langsung dan
-- identik staging/production. V-PRA di bawah memeriksa ULANG md5(prosrc)/teks
-- policy pada saat migrasi ini DIJALANKAN (bukan percaya pada komentar ini) --
-- kalau lingkungan sudah bergerak sejak 1 Okt, migrasi BERHENTI dan tidak
-- menimpa apa pun yang tidak terbaca.
--
-- -- KENAPA TIDAK CUKUP MENAMBAL FUNGSI BANTU PERAN SAJA ----------------------
-- `is_super_admin`/`is_admin_or_above`/`is_manager_or_above`/dst. menutup
-- mayoritas skema (>400 pemakaian gabungan di 349 policy), tapi SEBELAS tabel
-- punya SATU BELAS kebijakan TULIS yang mengecek `auth.uid()` langsung TANPA
-- memanggil fungsi bantu apa pun -- menambal fungsi bantu saja TIDAK menutup
-- celah untuk tabel-tabel ini. Lebih kritis lagi: `profiles_update` punya
-- cabang self-update (`id = auth.uid()`) yang memungkinkan user yang SUDAH
-- dinonaktifkan (tapi token-nya masih hidup) MENGAKTIFKAN DIRINYA SENDIRI
-- kembali -- cabang itu tidak pernah lewat fungsi bantu sama sekali.
--
-- -- SATU TABEL SENGAJA DIKECUALIKAN DARI DAFTAR ------------------------------
-- `audit_logs_insert` TIDAK disentuh di sini walau bentuknya sama (bare
-- `auth.uid() IS NOT NULL`). Menggerbanginya dengan is_caller_active() akan
-- MEMBUTAKAN deteksi: TD-301 sendiri ditemukan justru lewat satu baris LOGIN
-- di audit_logs yang ditulis OLEH akun yang sudah nonaktif -- menutup jalur
-- itu menghapus bukti kejadian yang sama di masa depan, bukan mencegahnya.
-- Risiko yang tersisa (user nonaktif menulis baris audit_logs sembarangan)
-- murni kosmetik -- tidak membuka atau mengubah data bisnis apa pun.
--
-- -- YANG BERKAS INI TIDAK LAKUKAN ---------------------------------------------
-- ⛔ Policy SELECT (baca) ber-`auth.uid()` telanjang TIDAK disentuh -- kelas
--    kerja yang sama dengan sisir sistematis TD-173/TD-180 yang sudah berjalan
--    terpisah. Dicatat sebagai TD-303 (follow-up baru), BUKAN dikerjakan di
--    hotfix ini (keputusan Den, TD-301 PLAN Q3).
-- ⛔ RPC/fungsi bisnis `SECURITY DEFINER` lain yang mungkin cuma cek
--    `auth.uid()` tanpa fungsi bantu (mis. sebagian RPC PRF/quotation) juga
--    TIDAK disisir di sini -- TD-303 yang sama.
-- ⛔ service_role TIDAK tersentuh -- ia bypass RLS di level Postgres
--    (BYPASSRLS), sama sekali di luar jalur fungsi bantu/policy ini.
-- ⛔ Hanya SATU trigger function (`guard_bnf_reports_field_update`) memanggil
--    salah satu dari 14 fungsi ini (`is_admin_or_above()`) -- efeknya
--    MEMPERKETAT (mengecualikan admin nonaktif dari cabang edit bebas), bukan
--    merusak, dan ia sudah menangani `auth.uid() IS NULL` (konteks
--    service-role) di baris pertama badannya.
--
-- Terkait: TD-301 (`08_TECH_DEBT.md`) · TD-173/TD-180 (sisir sistematis lama,
--          tidak diperluas di sini) · pola V-PRA/V-POST TD-281 H1-H5.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Potret SEBELUM -- 14 fungsi (dipakai V-PRA-2 dan ROLLBACK).
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE td301_lb_fn_sebelum ON COMMIT DROP AS
SELECT p.proname::text AS nama, md5(p.prosrc) AS md5_badan
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'get_user_company_id','get_user_company_ids',
     'is_super_admin','is_admin_or_above','is_manager_or_above',
     'is_manager_or_above_in','has_role','is_procurement_functional',
     'is_procurement_functional_in','is_hcga_functional','is_bnf_authorized',
     'is_admin_tier_role','is_sales_functional','is_sp_item_writer'
   );

-- -----------------------------------------------------------------------------
-- Potret SEBELUM -- 18 policy (17 self-write + profiles_update). Dipakai
-- V-PRA-3 dan ROLLBACK.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE td301_lb_pol_sebelum ON COMMIT DROP AS
SELECT tablename::text AS tabel, policyname::text AS nama, cmd::text AS perintah,
       qual::text AS using_lama, with_check::text AS check_lama
  FROM pg_policies
 WHERE schemaname = 'public'
   AND policyname IN (
     'approval_logs_insert','hrga_request_approvals_insert',
     'hrga_request_attachments_insert','hrga_request_items_insert',
     'hrga_request_items_update','hrga_requests_cancel_own',
     'hrga_requests_insert','hrga_requests_update_draft',
     'inquiry_comment_mentions_insert','inquiry_comments_insert',
     'inquiry_comments_update','notifications_delete','notifications_update',
     'rate_sheets_insert','sp_btbs_insert','sp_btbs_update',
     'stock_ledger_insert','profiles_update'
   );

-- -----------------------------------------------------------------------------
-- V-PRA-1 -- tepat satu definisi per nama fungsi (nol overload tak terduga).
-- -----------------------------------------------------------------------------
DO $pra1$
DECLARE r record; v_n int;
BEGIN
  FOR r IN SELECT nama FROM td301_lb_fn_sebelum LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nama;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'V-PRA-1 GAGAL: % ditemukan % kali (harus tepat 1).', r.nama, v_n;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM td301_lb_fn_sebelum) <> 14 THEN
    RAISE EXCEPTION 'V-PRA-1 GAGAL: hanya % dari 14 fungsi yang diharapkan ditemukan di lingkungan ini.', (SELECT count(*) FROM td301_lb_fn_sebelum);
  END IF;
  RAISE NOTICE 'V-PRA-1 LOLOS: ke-14 fungsi ada, masing-masing tepat satu kali.';
END
$pra1$;

-- -----------------------------------------------------------------------------
-- V-PRA-2 -- badan ke-14 fungsi masih SAMA dengan yang dibaca 1 Okt 2026 dari
-- staging (dan dicocokkan identik ke production). Kalau lingkungan ini sudah
-- bergerak sejak itu, berhenti -- jangan menimpa perubahan yang tidak terbaca.
-- -----------------------------------------------------------------------------
DO $pra2$
DECLARE r record; v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('get_user_company_id',          'a660fe05577b5d4ba16823a757f27c0d'),
      ('get_user_company_ids',         'ba6159f7bae4ceba27d33550f80170aa'),
      ('has_role',                     '5003b790e4b72b0a05962ff0be493db5'),
      ('is_admin_or_above',            '068a9eb5b9670fc465b7cc5de2ffb1a2'),
      ('is_admin_tier_role',           '1d10ff70cf59f51b20380199e31605da'),
      ('is_bnf_authorized',            '4ab2ddd8a431cf36f7de24ec09d5af15'),
      ('is_hcga_functional',           'fa64b8448f054f731e93f5839cfffc9a'),
      ('is_manager_or_above',          '886d3cbdb2c3eb883231dd6fedb05835'),
      ('is_manager_or_above_in',       '68e03e714abfa36677106433ffda042b'),
      ('is_procurement_functional',    '0ebc8ed773bd26310fc6b912eaeadb8c'),
      ('is_procurement_functional_in', 'fe49150e45dd35122c4e40e037c25b7d'),
      ('is_sales_functional',          '5ebfde6dcc61129eaeed25ea9ff8cba2'),
      ('is_sp_item_writer',            '384132b93cf287b82c5d9d4ba2a61489'),
      ('is_super_admin',               '5756a71c6828ce690a7574475a8934ac')
    ) AS t(nama, md5_dicatat)
  LOOP
    SELECT md5_badan INTO v_md5 FROM td301_lb_fn_sebelum WHERE nama = r.nama;
    IF v_md5 IS DISTINCT FROM r.md5_dicatat THEN
      RAISE EXCEPTION 'V-PRA-2 GAGAL: badan % = %, bukan % seperti dibaca 1 Okt 2026 dari staging/production. Ambil ulang badannya sebelum melanjutkan.',
        r.nama, v_md5, r.md5_dicatat;
    END IF;
  END LOOP;
  RAISE NOTICE 'V-PRA-2 LOLOS: ke-14 badan fungsi masih sama dengan yang dibaca 1 Okt 2026.';
END
$pra2$;

-- -----------------------------------------------------------------------------
-- V-PRA-3 -- teks qual/with_check ke-18 policy masih sama dengan yang dibaca
-- 1 Okt 2026 (identik staging/production).
-- -----------------------------------------------------------------------------
DO $pra3$
DECLARE r record; v_using text; v_check text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('approval_logs_insert', NULL::text,
        '((company_id = get_user_company_id()) AND (actor_id = auth.uid()))'),
      ('hrga_request_approvals_insert', NULL,
        '((approver_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_approvals.request_id) AND (r.company_id = get_user_company_id()) AND (r.deleted_at IS NULL)))))'),
      ('hrga_request_attachments_insert', NULL,
        '((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_attachments.request_id) AND (r.deleted_at IS NULL) AND (r.company_id = get_user_company_id())))))'),
      ('hrga_request_items_insert', NULL,
        '(EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY[''draft''::character varying, ''submitted''::character varying])::text[])) AND (r.company_id = get_user_company_id()))))'),
      ('hrga_requests_insert', NULL,
        '((company_id = get_user_company_id()) AND (requester_id = auth.uid()))'),
      ('inquiry_comment_mentions_insert', NULL,
        '(EXISTS ( SELECT 1
   FROM inquiry_comments c
  WHERE ((c.id = inquiry_comment_mentions.comment_id) AND (c.created_by = auth.uid()))))'),
      ('inquiry_comments_insert', NULL,
        '((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE (i.id = inquiry_comments.inquiry_id))))'),
      ('rate_sheets_insert', NULL, '(created_by = auth.uid())'),
      ('sp_btbs_insert', NULL, '(auth.uid() IS NOT NULL)'),
      ('stock_ledger_insert', NULL, '(auth.uid() IS NOT NULL)')
    ) AS t(nama, using_dicatat, check_dicatat)
  LOOP
    SELECT using_lama, check_lama INTO v_using, v_check
      FROM td301_lb_pol_sebelum WHERE nama = r.nama;
    IF v_check IS DISTINCT FROM r.check_dicatat THEN
      RAISE EXCEPTION 'V-PRA-3 GAGAL: with_check policy % sudah berubah sejak 1 Okt 2026. Baca ulang sebelum melanjutkan. Sekarang: %', r.nama, v_check;
    END IF;
  END LOOP;

  -- Policy ber-USING (bukan WITH CHECK) diperiksa terpisah, termasuk yang
  -- punya KEDUANYA (hrga_request_items_update, hrga_requests_cancel_own,
  -- hrga_requests_update_draft, inquiry_comments_update, profiles_update).
  FOR r IN SELECT * FROM (VALUES
      ('hrga_request_items_update',
        '(EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY[''draft''::character varying, ''revision_requested''::character varying])::text[])) AND (r.company_id = get_user_company_id()))))',
        '(EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND (r.company_id = get_user_company_id()))))'),
      ('hrga_requests_cancel_own',
        '((requester_id = auth.uid()) AND ((status)::text = ''submitted''::text))',
        '((requester_id = auth.uid()) AND ((status)::text = ''cancelled''::text))'),
      ('hrga_requests_update_draft',
        '((deleted_at IS NULL) AND (company_id = get_user_company_id()) AND (requester_id = auth.uid()) AND ((status)::text = ANY ((ARRAY[''draft''::character varying, ''revision_requested''::character varying])::text[])))',
        '((company_id = get_user_company_id()) AND (requester_id = auth.uid()))'),
      ('inquiry_comments_update', '(created_by = auth.uid())', '(created_by = auth.uid())'),
      ('notifications_delete', '(user_id = auth.uid())', NULL),
      ('notifications_update', '(user_id = auth.uid())', NULL),
      ('sp_btbs_update', '(auth.uid() IS NOT NULL)', NULL),
      ('profiles_update',
        '((id = auth.uid()) OR ((company_id = get_user_company_id()) AND is_admin_or_above()) OR is_super_admin())',
        '((id = auth.uid()) OR ((company_id = get_user_company_id()) AND is_admin_or_above()) OR is_super_admin())')
    ) AS t(nama, using_dicatat, check_dicatat)
  LOOP
    SELECT using_lama, check_lama INTO v_using, v_check
      FROM td301_lb_pol_sebelum WHERE nama = r.nama;
    IF v_using IS DISTINCT FROM r.using_dicatat OR v_check IS DISTINCT FROM r.check_dicatat THEN
      RAISE EXCEPTION 'V-PRA-3 GAGAL: USING/WITH CHECK policy % sudah berubah sejak 1 Okt 2026. Baca ulang sebelum melanjutkan.', r.nama;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM td301_lb_pol_sebelum) <> 18 THEN
    RAISE EXCEPTION 'V-PRA-3 GAGAL: hanya % dari 18 policy yang diharapkan ditemukan.', (SELECT count(*) FROM td301_lb_pol_sebelum);
  END IF;
  RAISE NOTICE 'V-PRA-3 LOLOS: ke-18 policy masih sama dengan yang dibaca 1 Okt 2026.';
END
$pra3$;

-- =============================================================================
-- 1. FUNGSI BARU -- choke point tunggal.
-- =============================================================================
CREATE FUNCTION public.is_caller_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT active FROM profiles WHERE id = auth.uid()), true)
$$;

COMMENT ON FUNCTION public.is_caller_active() IS 'TD-301 Lapis B. True kalau profil pemanggil active=true, atau kalau auth.uid() tidak merujuk profil mana pun (anon/service_role -- netral, tidak memberi akses baru). Dipakai LANGSUNG di 17 policy tulis + profiles_update (bukan bersarang di dalam fungsi SECURITY DEFINER lain) -- versi awal membungkusnya ke 12 fungsi bantu peran menyebabkan panggilan SECURITY DEFINER bersarang per baris, melambat 3-4x (lihat header migrasi 20261001000001 + TD-301 + gotcha #47). Fungsi bantu peran kini menyatakan syarat aktif langsung lewat JOIN profiles, bukan memanggil fungsi ini.';

REVOKE ALL ON FUNCTION public.is_caller_active() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_caller_active() TO authenticated;

-- =============================================================================
-- 2. DUA FUNGSI NILAI -- tambah syarat active=true langsung di WHERE-nya.
--    Ini menutup SELURUH pemakaian (233 + 80 titik policy) tanpa menyentuh
--    satu policy pun: company_id = get_user_company_id() -> NULL untuk user
--    nonaktif -> komparasi UNKNOWN -> false.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id
  FROM   profiles
  WHERE  id = auth.uid()
    AND  active = true
$$;

CREATE OR REPLACE FUNCTION public.get_user_company_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT ur.company_id
  FROM user_roles ur
  JOIN profiles p ON p.id = ur.user_id
  WHERE ur.user_id = auth.uid() AND ur.is_active = true AND p.active = true
$$;

-- =============================================================================
-- 3. SEPULUH FUNGSI BOOLEAN BERBASIS user_roles -- badan lama PERSIS, ditambah
--    SATU JOIN (`JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true`)
--    di dalam EXISTS yang sama. TANPA is_caller_active() -- lihat "DUA
--    KOREKSI" di header: panggilan fungsi SECURITY DEFINER bersarang tidak
--    di-inline planner dan dieksekusi per baris, melambatkan query besar
--    3-4x (gotcha #47). JOIN langsung bisa digabung planner ke rencana query.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_role(role_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r  ON r.id  = ur.role_id
    JOIN   profiles    pa ON pa.id = ur.user_id AND pa.active = true
    WHERE  ur.user_id      = auth.uid()
      AND  ur.is_active     = true
      AND  r.code           = role_code
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    JOIN   profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE  ur.user_id     = auth.uid()
      AND  ur.is_active   = true
      AND  r.code         IN ('super_admin', 'admin')
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_hcga_functional() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    JOIN   profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE  ur.user_id   = auth.uid()
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  r.code IN ('hcga_manager','hcga_ga','hcga_personel','hcga_peopledev')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE ur.user_id = auth.uid()
      AND r.level <= 6
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE));
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above_in(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE ur.user_id    = auth.uid()
      AND ur.company_id = p_company_id
      AND ur.is_active  = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND r.level <= 6
  );
$$;

CREATE OR REPLACE FUNCTION public.is_procurement_functional() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE ur.user_id = auth.uid() AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND r.code IN ('proc_manager','proc_staff'));
$$;

CREATE OR REPLACE FUNCTION public.is_procurement_functional_in(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE ur.user_id = auth.uid() AND ur.company_id = p_company_id AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND r.code IN ('proc_manager','proc_staff'));
$$;

CREATE OR REPLACE FUNCTION public.is_sales_functional() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE ur.user_id = auth.uid() AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND r.code IN ('bd_sales_executive','bd_account_executive','bd_sales_spv_console','bd_sales_spv_forwarding'));
$$;

CREATE OR REPLACE FUNCTION public.is_sp_item_writer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','manager','operations')
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    JOIN   profiles pa ON pa.id = ur.user_id AND pa.active = true
    WHERE  ur.user_id     = auth.uid()
      AND  ur.is_active   = true
      AND  r.code         = 'super_admin'
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  )
$$;

-- =============================================================================
-- 3b. is_bnf_authorized() -- pola berbeda dari 10 fungsi di atas karena
--     bentuknya OR-chain (bukan satu EXISTS tunggal): syarat aktif jadi
--     EXISTS TERPISAH di depan, AND dengan seluruh OR-chain lama (badan lama
--     PERSIS, tidak diubah selain pembungkus luar). Tetap EXISTS inline,
--     BUKAN panggilan ke is_caller_active() -- alasan performa sama (gotcha
--     #47). Catatan: `is_super_admin()` di cabang pertama OR-chain ini sudah
--     ADA SEBELUM migrasi TD-301 -- bukan pemanggilan bersarang BARU yang
--     ditambahkan di sini, jadi tidak ikut diukur dalam regresi 3-4x di atas
--     (is_bnf_authorized dipakai jauh lebih jarang daripada 10 fungsi #3).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_bnf_authorized() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM profiles pa WHERE pa.id = auth.uid() AND pa.active = true) AND (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM bnf_departments WHERE head_profile_id = auth.uid() AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM bnf_divisions WHERE director_profile_id = auth.uid() AND deleted_at IS NULL)
    OR EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND ur.is_active = true
        AND r.code IN ('ceo', 'gm', 'gm_bd', 'manager', 'finance_controller')
    )
    OR EXISTS (
      SELECT 1 FROM bnf_authorized_users a
      WHERE a.profile_id = auth.uid()
        AND a.company_id = get_user_company_id()
        AND a.revoked_at IS NULL
    )
  );
$$;

-- =============================================================================
-- 3c. is_admin_tier_role(p_role_id uuid) -- SENGAJA TIDAK DISENTUH, nol DDL.
--     Fungsi ini menilai sebuah ROLE (baris `roles`), BUKAN pemanggilnya --
--     nol `auth.uid()` di badannya -- dan dipakai dalam NEGASI di
--     `user_roles_insert`/`user_roles_update` (`NOT is_admin_tier_role(role_id)`).
--     Membungkusnya dengan syarat aktif pemanggil akan membuatnya SELALU
--     false untuk pemanggil nonaktif -> `NOT false = true` -> syarat "role
--     ini BUKAN admin-tier" LOLOS justru untuk role yang memang admin-tier,
--     tepat saat pemanggilnya paling tidak berhak. Lihat gotcha #46
--     (`03_DATA_MODEL.md`). Badannya tetap PERSIS seperti sebelum TD-301:
--       SELECT EXISTS (
--         SELECT 1 FROM public.roles r
--         WHERE r.id = p_role_id
--           AND r.code IN ('super_admin', 'admin')
--       )
--     Dicantumkan di sini sebagai REFERENSI (bukan DDL yang dijalankan) supaya
--     V-POST di bawah bisa memverifikasi md5(prosrc)-nya TIDAK BERUBAH dari
--     V-PRA-2, dan supaya pembaca berikutnya tidak bingung kenapa salah satu
--     dari 14 fungsi yang "disentuh" migrasi ini tidak punya CREATE OR REPLACE.
-- =============================================================================

-- =============================================================================
-- 4. 17 POLICY SELF-WRITE TANPA FUNGSI BANTU -- tambahkan
--    `AND public.is_caller_active()`. `audit_logs_insert` SENGAJA DIKECUALIKAN
--    (lihat header). ALTER POLICY, bukan DROP+CREATE -- lebih pendek, dan
--    tidak pernah ada jendela "policy tidak ada" di antaranya.
-- =============================================================================

ALTER POLICY approval_logs_insert ON public.approval_logs
  WITH CHECK (((company_id = get_user_company_id()) AND (actor_id = auth.uid()) AND public.is_caller_active()));

ALTER POLICY hrga_request_approvals_insert ON public.hrga_request_approvals
  WITH CHECK (((approver_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_approvals.request_id) AND (r.company_id = get_user_company_id()) AND (r.deleted_at IS NULL)))) AND public.is_caller_active()));

ALTER POLICY hrga_request_attachments_insert ON public.hrga_request_attachments
  WITH CHECK (((uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_attachments.request_id) AND (r.deleted_at IS NULL) AND (r.company_id = get_user_company_id())))) AND public.is_caller_active()));

ALTER POLICY hrga_request_items_insert ON public.hrga_request_items
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying])::text[])) AND (r.company_id = get_user_company_id())))) AND public.is_caller_active());

ALTER POLICY hrga_request_items_update ON public.hrga_request_items
  USING ((EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND ((r.status)::text = ANY ((ARRAY['draft'::character varying, 'revision_requested'::character varying])::text[])) AND (r.company_id = get_user_company_id())))) AND public.is_caller_active())
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hrga_requests r
  WHERE ((r.id = hrga_request_items.request_id) AND (r.requester_id = auth.uid()) AND (r.company_id = get_user_company_id())))) AND public.is_caller_active());

ALTER POLICY hrga_requests_cancel_own ON public.hrga_requests
  USING (((requester_id = auth.uid()) AND ((status)::text = 'submitted'::text) AND public.is_caller_active()))
  WITH CHECK (((requester_id = auth.uid()) AND ((status)::text = 'cancelled'::text) AND public.is_caller_active()));

ALTER POLICY hrga_requests_insert ON public.hrga_requests
  WITH CHECK (((company_id = get_user_company_id()) AND (requester_id = auth.uid()) AND public.is_caller_active()));

ALTER POLICY hrga_requests_update_draft ON public.hrga_requests
  USING (((deleted_at IS NULL) AND (company_id = get_user_company_id()) AND (requester_id = auth.uid()) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'revision_requested'::character varying])::text[])) AND public.is_caller_active()))
  WITH CHECK (((company_id = get_user_company_id()) AND (requester_id = auth.uid()) AND public.is_caller_active()));

ALTER POLICY inquiry_comment_mentions_insert ON public.inquiry_comment_mentions
  WITH CHECK ((EXISTS ( SELECT 1
   FROM inquiry_comments c
  WHERE ((c.id = inquiry_comment_mentions.comment_id) AND (c.created_by = auth.uid())))) AND public.is_caller_active());

ALTER POLICY inquiry_comments_insert ON public.inquiry_comments
  WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM inquiries i
  WHERE (i.id = inquiry_comments.inquiry_id))) AND public.is_caller_active()));

ALTER POLICY inquiry_comments_update ON public.inquiry_comments
  USING ((created_by = auth.uid()) AND public.is_caller_active())
  WITH CHECK ((created_by = auth.uid()) AND public.is_caller_active());

ALTER POLICY notifications_delete ON public.notifications
  USING ((user_id = auth.uid()) AND public.is_caller_active());

ALTER POLICY notifications_update ON public.notifications
  USING ((user_id = auth.uid()) AND public.is_caller_active());

ALTER POLICY rate_sheets_insert ON public.rate_sheets
  WITH CHECK ((created_by = auth.uid()) AND public.is_caller_active());

ALTER POLICY sp_btbs_insert ON public.sp_btbs
  WITH CHECK ((auth.uid() IS NOT NULL) AND public.is_caller_active());

ALTER POLICY sp_btbs_update ON public.sp_btbs
  USING ((auth.uid() IS NOT NULL) AND public.is_caller_active());

ALTER POLICY stock_ledger_insert ON public.stock_ledger
  WITH CHECK ((auth.uid() IS NOT NULL) AND public.is_caller_active());

-- =============================================================================
-- 5. profiles_update -- tutup lubang self-reaktivasi. Hanya cabang self
--    (`id = auth.uid()`) yang perlu diubah -- dua cabang lain sudah lewat
--    is_admin_or_above()/is_super_admin(), yang sudah dibungkus di atas.
-- =============================================================================
ALTER POLICY profiles_update ON public.profiles
  USING (((id = auth.uid() AND public.is_caller_active()) OR ((company_id = get_user_company_id()) AND is_admin_or_above()) OR is_super_admin()))
  WITH CHECK (((id = auth.uid() AND public.is_caller_active()) OR ((company_id = get_user_company_id()) AND is_admin_or_above()) OR is_super_admin()));

-- -----------------------------------------------------------------------------
-- V-POST
-- -----------------------------------------------------------------------------
DO $post$
DECLARE
  v_n int;
  v_src text;
  v_n_bool boolean;
BEGIN
  -- is_caller_active() ada, tertutup dari PUBLIC, terbuka untuk authenticated,
  -- dan mengembalikan true di konteks tanpa auth.uid() (migrasi ini sendiri).
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_caller_active';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'V-POST GAGAL: is_caller_active() tidak ditemukan tepat sekali (ada %).', v_n;
  END IF;
  IF NOT public.is_caller_active() THEN
    RAISE EXCEPTION 'V-POST GAGAL: is_caller_active() mengembalikan false tanpa auth.uid() -- seharusnya true (netral).';
  END IF;
  -- Gotcha #40 (03_DATA_MODEL.md): grantee PUBLIC harus diperiksa lewat
  -- aclexplode()+grantee=0, BUKAN LIKE '%=X/%' -- pola itu juga kena
  -- 'postgres=X/postgres' (selalu true, palsu).
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'is_caller_active'
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) INTO v_n_bool;
  IF v_n_bool THEN
    RAISE EXCEPTION 'V-POST GAGAL: is_caller_active() masih EXECUTE untuk PUBLIC.';
  END IF;

  -- get_user_company_id/ids -- badan baru memuat syarat active.
  FOR v_src IN SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_user_company_id','get_user_company_ids')
  LOOP
    IF v_src NOT ILIKE '%active = true%' THEN
      RAISE EXCEPTION 'V-POST GAGAL: badan get_user_company_id[s]() tidak memuat syarat active=true: %', v_src;
    END IF;
  END LOOP;

  -- 10 fungsi boolean berbasis user_roles -- badan baru memuat JOIN profiles
  -- pa ... pa.active = true, dan TIDAK memanggil is_caller_active() (gotcha
  -- #47 -- panggilan bersarang per baris adalah persis yang diganti).
  FOR v_src IN
    SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN (
       'is_super_admin','is_admin_or_above','is_manager_or_above',
       'is_manager_or_above_in','has_role','is_procurement_functional',
       'is_procurement_functional_in','is_hcga_functional',
       'is_sales_functional','is_sp_item_writer')
  LOOP
    IF v_src NOT ILIKE '%pa.active = true%' THEN
      RAISE EXCEPTION 'V-POST GAGAL: salah satu dari 10 fungsi berbasis user_roles tidak memuat JOIN profiles pa ... pa.active = true. Badan: %', v_src;
    END IF;
    IF v_src ILIKE '%is_caller_active()%' THEN
      RAISE EXCEPTION 'V-POST GAGAL: salah satu dari 10 fungsi berbasis user_roles MASIH memanggil is_caller_active() bersarang (gotcha #47). Badan: %', v_src;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN (
         'is_super_admin','is_admin_or_above','is_manager_or_above',
         'is_manager_or_above_in','has_role','is_procurement_functional',
         'is_procurement_functional_in','is_hcga_functional',
         'is_sales_functional','is_sp_item_writer')
         AND p.prosrc ILIKE '%pa.active = true%') <> 10 THEN
    RAISE EXCEPTION 'V-POST GAGAL: tidak semua 10 fungsi berbasis user_roles memuat JOIN profiles pa.active = true.';
  END IF;

  -- is_bnf_authorized -- EXISTS profiles pa inline di depan, TIDAK memanggil
  -- is_caller_active(). is_super_admin() di dalamnya SUDAH ADA sebelum
  -- TD-301 (bukan panggilan bersarang baru) -- lihat komentar bagian 3b.
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='is_bnf_authorized';
  IF v_src NOT ILIKE '%pa.active = true%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: is_bnf_authorized() tidak memuat EXISTS profiles pa ... pa.active = true: %', v_src;
  END IF;
  IF v_src ILIKE '%is_caller_active()%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: is_bnf_authorized() MASIH memanggil is_caller_active() bersarang (gotcha #47).';
  END IF;

  -- is_admin_tier_role -- SENGAJA TIDAK DISENTUH (gotcha #46): md5(prosrc)
  -- harus PERSIS sama dengan V-PRA-2 (nol DDL dijalankan terhadapnya), dan
  -- tentu saja tidak memanggil is_caller_active().
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='is_admin_tier_role';
  IF v_src ILIKE '%is_caller_active()%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: is_admin_tier_role() memanggil is_caller_active() -- fungsi ini menilai sebuah ROLE, bukan pemanggil, dan dipakai dalam NEGASI (gotcha #46) -- SEHARUSNYA TIDAK PERNAH DIUBAH.';
  END IF;
  IF md5(v_src) <> (SELECT md5_badan FROM td301_lb_fn_sebelum WHERE nama = 'is_admin_tier_role') THEN
    RAISE EXCEPTION 'V-POST GAGAL: badan is_admin_tier_role() berubah dari V-PRA-2, padahal seharusnya nol DDL menyentuhnya.';
  END IF;

  -- 18 policy -- qual/with_check baru memuat is_caller_active, kecuali
  -- audit_logs_insert yang sengaja tidak disentuh.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public'
     AND policyname IN (
       'approval_logs_insert','hrga_request_approvals_insert',
       'hrga_request_attachments_insert','hrga_request_items_insert',
       'hrga_request_items_update','hrga_requests_cancel_own',
       'hrga_requests_insert','hrga_requests_update_draft',
       'inquiry_comment_mentions_insert','inquiry_comments_insert',
       'inquiry_comments_update','notifications_delete','notifications_update',
       'rate_sheets_insert','sp_btbs_insert','sp_btbs_update',
       'stock_ledger_insert','profiles_update')
     AND (COALESCE(qual,'') || COALESCE(with_check,'')) ILIKE '%is_caller_active%';
  IF v_n <> 18 THEN
    RAISE EXCEPTION 'V-POST GAGAL: hanya % dari 18 policy yang memuat is_caller_active() sesudah ALTER POLICY.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND policyname='audit_logs_insert'
     AND (COALESCE(qual,'') || COALESCE(with_check,'')) ILIKE '%is_caller_active%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: audit_logs_insert ikut tersentuh -- seharusnya SENGAJA DIKECUALIKAN (lihat header).';
  END IF;

  RAISE NOTICE 'V-POST LOLOS: is_caller_active() hidup dan tertutup PUBLIC (dipakai LANGSUNG di policy, bukan bersarang), get_user_company_id[s]() syarat active, 10 fungsi user_roles + is_bnf_authorized pakai JOIN/EXISTS inline (gotcha #47), is_admin_tier_role TIDAK disentuh (gotcha #46), 18 policy tulis + profiles_update bergerbang, audit_logs_insert sengaja tidak disentuh.';
  RAISE NOTICE 'TD-301 LAPIS B SELESAI. Lapis A (set-user-status Edge Function) dan Lapis C (AuthGate auto-signout) berkas/commit terpisah.';
END
$post$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Kembalikan 13 fungsi (2 nilai + 10 user_roles + is_bnf_authorized) ke
-- badan sebelum migrasi ini (md5 di V-PRA-2 di atas membuktikan badan itu
-- identik dengan yang hidup 1 Okt 2026 di staging DAN production) -- salin
-- ulang `CREATE OR REPLACE FUNCTION` dari bagian 2/3/3b di atas, HAPUS
-- `JOIN profiles pa ON ... pa.active = true` / `EXISTS (... pa.active = true) AND`
-- / syarat `active = true` di WHERE, kembali ke isi EXISTS/SELECT polos yang
-- didokumentasikan di komentar V-PRA-2. `is_admin_tier_role` TIDAK perlu
-- rollback apa pun -- migrasi ini tidak pernah mengubahnya (bagian 3c).
--
-- Kembalikan ke-18 policy ke USING/WITH CHECK yang direkam di V-PRA-3 (tabel
-- `td301_lb_pol_sebelum` yang dipakai untuk verifikasi -- WAJIB diekspor
-- runner ke berkas terpisah sebelum COMMIT kalau rollback presisi
-- dibutuhkan, pola sama H1/H2/H5) lewat `ALTER POLICY ... USING (...)
-- WITH CHECK (...)` memakai teks persis yang tercatat di V-PRA-3 di atas.
--
-- Terakhir: `DROP FUNCTION public.is_caller_active();` -- aman HANYA sesudah
-- ke-18 policy di atas sudah dikembalikan (merekalah satu-satunya pemanggil
-- langsung sejak koreksi 2 Okt 2026 -- 13 fungsi di atas TIDAK lagi
-- memanggilnya; DROP lebih dulu akan membuat migrasi rollback sendiri gagal
-- di tengah jalan).
--
-- !! Rollback ini MENGHIDUPKAN KEMBALI TD-301 Lapis B sepenuhnya -- lakukan
--    HANYA kalau migrasi ini terbukti merusak sesuatu yang lebih mendesak
--    daripada celah yang ditutupnya, dan catat alasannya di TD-301.
-- =============================================================================
