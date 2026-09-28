-- =============================================================================
-- 20260928000013_td281_h1_lapis2_guard_dan_jejak.sql
--
-- TD-281 H1 LAPIS 2 -- guard peran/entitas di DALAM badan empat fungsi, plus
-- jejak audit untuk dua aksi yang selama ini menulis tanpa mencatat siapa
-- pelakunya (TD-283).
--
-- Status: BELUM DIJALANKAN di mana pun (ditulis 28 Sep 2026).
--
-- !!  ARAH TERBALIK, sama dengan lapis 1: uji di staging -> jalankan di
--     PRODUCTION -> samakan staging. Lihat doc 12 butir 28.
--
-- -- HUBUNGANNYA DENGAN LAPIS 1 ----------------------------------------------
-- Lapis 1 (20260928000012, LIVE 28 Sep) menutup keenam fungsi dari PUBLIC dan
-- anon -- ia menjawab "siapa boleh MEMANGGIL". Lapis 2 menjawab pertanyaan
-- berikutnya: "di antara yang boleh memanggil, siapa boleh MELAKUKAN".
-- Tanpa lapis 2, setiap user yang login bisa menyelesaikan picking mana pun
-- dan menomori dokumen untuk entitas mana pun.
--
-- -- BADAN DIAMBIL DARI PRODUCTION, BUKAN DARI REPO --------------------------
-- Keempat badan di bawah disalin dari `pg_get_functiondef` PRODUCTION
-- (dump 28 Sep 2026), lalu guard dan jejak DITAMBAHKAN di atasnya. Alasannya
-- TD-282, dan itu diukur bukan dikira: teks fungsi di supabase/migrations/
-- tidak selalu sama dengan yang berjalan di produksi.
-- V-PRA-2 memeriksa md5(prosrc) SEBELUM mengganti: kalau produksi sudah
-- bergerak sejak dump, migrasi ini BERHENTI dan tidak menimpa apa pun.
--
-- -- TIGA KEPUTUSAN YANG HARUS TERLIHAT, BUKAN TERSELIP ----------------------
--
-- (1) ** check_similar_accounts DIUBAH DARI `LANGUAGE sql` KE `plpgsql`. **
--     Ini perubahan yang lebih besar daripada "menambah guard", jadi disebut
--     di depan. Sebabnya: fungsi SQL murni TIDAK BISA `RAISE EXCEPTION`, dan
--     syarat Den adalah pesan tolak yang jelas -- menyebut entitas dan
--     menyarankan menghubungi IT. Alternatifnya (guard di WHERE) membuat
--     penolakan tampak seperti "nol hasil", dan penolakan senyap adalah hal
--     yang paling mahal untuk didiagnosis.
--     Biayanya: fungsi plpgsql tidak bisa di-inline planner. Dampaknya nol di
--     sini -- ia pre-check form saat membuat akun, bukan jalur panas.
--
-- (2) ** Penolakan guard memakai ERRCODE BAWAAN (P0001), BUKAN 42501. **
--     Sengaja. 42501 berarti "tidak punya hak EXECUTE" -- itu bahasa lapis 1.
--     Kalau guard lapis 2 ikut memakainya, kedua kegagalan jadi tidak bisa
--     dibedakan, dan uji lapis 1 akan melaporkan TOLAK palsu untuk fungsi yang
--     sebenarnya boleh dipanggil. Satu kode galat, satu arti.
--
-- (3) ** completed_by TIDAK di-backfill, dan itu keputusan. **
--     151 picking yang sudah selesai akan tetap NULL. Datanya memang tidak
--     pernah ada (TD-283: nol completed_by, assigned_to selalu NULL, nol
--     audit_logs). Mengisinya dari `created_by` akan membuat kolom itu
--     BERBOHONG DENGAN RAPI -- lebih buruk daripada NULL yang jujur.
--     >> TD-283 karena itu tertutup MULAI SEKARANG, bukan surut ke belakang.
--
-- -- SATU RISIKO YANG DIUKUR DAN DITERIMA ------------------------------------
-- Guard entitas memakai `get_user_company_ids()` (entitas tempat user punya
-- role AKTIF), sementara FE mengirim `profile.company_id` (entitas HOME).
-- ** Keduanya himpunan yang berbeda. ** User ber-home MSI yang role-nya hanya
-- di SOA akan DITOLAK saat memanggil dengan home-nya.
-- Populasi keadaan itu di produksi hari ini = NOL (23 profil aktif, semuanya
-- punya role di home-nya; doc 12 butir 15). Kalau kelak ada, gejalanya adalah
-- penolakan yang membingungkan -- karena itu pesan tolaknya MENYEBUT nama
-- entitas, supaya sebabnya langsung terbaca.
--
-- -- JEJAK AUDIT MENGIKUTI KONVENSI YANG SUDAH ADA ---------------------------
-- Bentuk INSERT ke audit_logs disalin dari `mark_inquiry_won` yang sudah hidup
-- di produksi: kolom yang sama, cara mengambil user_email/user_role yang sama.
-- Bukan bentuk baru. AGENTS.md Security butir 6 mewajibkan "audit all
-- important actions", dan daftar kejadian wajibnya memuat `update`.
-- =============================================================================

BEGIN;

-- Rekam keadaan SEBELUM: dipakai V-PRA-2 (produksi belum bergerak sejak dump)
-- dan V-POST (ACL tidak ikut berubah).
CREATE TEMP TABLE td281_l2_sebelum ON COMMIT DROP AS
SELECT p.oid,
       p.proname::text                           AS nama,
       p.oid::regprocedure::text                 AS tanda_tangan,
       md5(p.prosrc)                             AS md5_badan,
       COALESCE(array_to_string(p.proacl::text[], ','), '(NULL)') AS acl_sebelum
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('complete_picking','attach_price_contract_info',
                     'increment_document_sequence','check_similar_accounts');

DO $pra$
DECLARE
  r      record;
  v_n    int;
  v_md5  text;
BEGIN
  -- ---- V-PRA-1: tepat satu tanda tangan per nama --------------------------
  FOR r IN SELECT unnest(ARRAY['complete_picking','attach_price_contract_info',
                               'increment_document_sequence','check_similar_accounts']) AS nama
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nama;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'V-PRA-1 GAGAL: % ditemukan % kali (harus tepat 1).', r.nama, v_n;
    END IF;
  END LOOP;
  RAISE NOTICE 'V-PRA-1 LOLOS: keempat nama punya tepat satu tanda tangan.';

  -- ---- V-PRA-2: badan masih SAMA dengan yang di-dump dari production ------
  -- Inilah yang membuat "disalin dari produksi" bisa dipercaya. Kalau produksi
  -- sudah bergerak sejak dump 28 Sep, badan di bawah sudah BUKAN badan
  -- produksi lagi, dan menimpanya akan MENGHAPUS perubahan yang tidak terbaca.
  FOR r IN SELECT * FROM (VALUES
      ('complete_picking',            'b80ceb3adc864bbf07efcc9ebd178953'),
      ('attach_price_contract_info',  'b33271f49006bc3658ef485a289de2ca'),
      ('increment_document_sequence', 'bdf578e34f32daa744bd6563f931a867'),
      ('check_similar_accounts',      '6ef42279850a2002c0879bb7e6fbf5a3')
    ) AS t(nama, md5_dump)
  LOOP
    SELECT md5(p.prosrc) INTO v_md5
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.nama;
    IF v_md5 IS DISTINCT FROM r.md5_dump THEN
      RAISE EXCEPTION 'V-PRA-2 GAGAL: badan % = %, bukan % seperti saat di-dump dari produksi 28 Sep. Ambil ulang badannya (baca-badan-lapis2.sh) sebelum melanjutkan.',
        r.nama, v_md5, r.md5_dump;
    END IF;
  END LOOP;
  RAISE NOTICE 'V-PRA-2 LOLOS: keempat badan masih sama dengan dump produksi.';
END
$pra$;

-- -- KOLOM JEJAK -------------------------------------------------------------
-- Nullable, tanpa DEFAULT -> nol rewrite tabel, aman di tabel berdata.
-- TANPA foreign key, sengaja: sama dengan tetangganya (`created_by`,
-- `assigned_to`) dan dengan `signed_date_filled_by` di 20260926000001.
ALTER TABLE public.picking_lists
  ADD COLUMN IF NOT EXISTS completed_by uuid;

COMMENT ON COLUMN public.picking_lists.completed_by IS
  'Diisi complete_picking() dari auth.uid() sejak 28 Sep 2026 (TD-283). NULL untuk picking yang selesai SEBELUM tanggal itu -- datanya memang tidak pernah direkam dan SENGAJA tidak di-backfill.';

-- =============================================================================
-- 1. complete_picking -- guard + jejak
-- =============================================================================
CREATE OR REPLACE FUNCTION public.complete_picking(p_picking_list_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_cust uuid; v_sp text; v_no text; v_company uuid;
  v_email text; v_role text;
BEGIN
  -- GUARD. is_sp_item_writer() sudah memuat super_admin/admin/manager/
  -- operations; is_super_admin() tetap ditulis EKSPLISIT supaya kalau kelak
  -- super_admin dicabut dari helper itu, hak ini tidak ikut hilang diam-diam.
  IF NOT (public.is_super_admin() OR public.is_sp_item_writer()) THEN
    RAISE EXCEPTION 'Anda tidak berhak menyelesaikan picking list. Yang boleh: operations, manager ke atas, admin. Hubungi IT kalau ini keliru.';
  END IF;

  SELECT status, customer_id, sp_no, picking_no, company_id
    INTO v_status, v_cust, v_sp, v_no, v_company
    FROM picking_lists WHERE id = p_picking_list_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Picking tidak ditemukan'; END IF;
  IF v_status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Hanya picking pending/in_progress yang bisa diselesaikan (status=%)', v_status; END IF;

  UPDATE picking_lists
     SET status = 'done', completed_at = now(), completed_by = auth.uid(), updated_at = now()
   WHERE id = p_picking_list_id;

  -- Jejak: bentuknya disalin dari mark_inquiry_won yang sudah hidup di
  -- produksi -- kolom sama, cara mengambil email/role sama.
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_role
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (
    user_id, user_email, user_role, company_id,
    action, entity_type, entity_id, entity_label,
    old_data, new_data, notes
  ) VALUES (
    auth.uid(), v_email, v_role, v_company,
    'COMPLETE_PICKING', 'PICKING_LIST', p_picking_list_id, v_no,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'done', 'completed_by', auth.uid()),
    'Picking diselesaikan lewat complete_picking()'
  );

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $function$;

-- =============================================================================
-- 2. attach_price_contract_info -- guard + jejak
-- =============================================================================
CREATE OR REPLACE FUNCTION public.attach_price_contract_info(
  p_history_id uuid, p_contract_no text, p_valid_from date, p_valid_until date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid; v_produk uuid; v_label text;
  v_kontrak_lama text; v_dari_lama date; v_sampai_lama date;
  v_email text; v_role text;
BEGIN
  -- GUARD. super_admin punya level 0 sehingga sudah lolos is_manager_or_above()
  -- (level <= 6) -- diukur 28 Sep; klausanya tetap eksplisit karena `level`
  -- adalah DATA dan bisa berubah tanpa menyentuh fungsi ini.
  IF NOT (public.is_super_admin() OR public.is_manager_or_above()) THEN
    RAISE EXCEPTION 'Anda tidak berhak melampirkan kontrak pada riwayat harga. Yang boleh: manager ke atas. Hubungi IT kalau ini keliru.';
  END IF;

  -- Nilai LAMA dibaca lebih dulu: UPDATE tidak bisa mengembalikan OLD, dan
  -- jejak tanpa nilai lama tidak bisa menjawab "apa yang berubah".
  SELECT company_id, product_id, contract_no, valid_from, valid_until
    INTO v_company, v_produk, v_kontrak_lama, v_dari_lama, v_sampai_lama
    FROM public.product_price_history
   WHERE id = p_history_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris riwayat harga % tidak ditemukan', p_history_id;
  END IF;

  UPDATE public.product_price_history
     SET contract_no = p_contract_no,
         valid_from  = p_valid_from,
         valid_until = p_valid_until
   WHERE id = p_history_id;

  SELECT name INTO v_label FROM public.products WHERE id = v_produk;

  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_role
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (
    user_id, user_email, user_role, company_id,
    action, entity_type, entity_id, entity_label,
    old_data, new_data, notes
  ) VALUES (
    auth.uid(), v_email, v_role, v_company,
    'ATTACH_PRICE_CONTRACT', 'PRODUCT_PRICE_HISTORY', p_history_id,
    COALESCE(v_label, p_history_id::text),
    jsonb_build_object('contract_no', v_kontrak_lama, 'valid_from', v_dari_lama, 'valid_until', v_sampai_lama),
    jsonb_build_object('contract_no', p_contract_no,  'valid_from', p_valid_from, 'valid_until', p_valid_until),
    'Kontrak dilampirkan lewat attach_price_contract_info()'
  );
END; $function$;

-- =============================================================================
-- 3. increment_document_sequence -- guard entitas
-- =============================================================================
CREATE OR REPLACE FUNCTION public.increment_document_sequence(
  p_company_id uuid, p_document_type text, p_department_code text,
  p_year integer, p_month integer DEFAULT 0, p_day integer DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_seq integer;
  v_kode    text;
BEGIN
  -- GUARD ENTITAS. Tanpa ini, seluruh parameternya bisa ditebak (UUID entitas
  -- ada di bundle FE) dan penomoran dokumen entitas mana pun bisa dibakar --
  -- dan pembakaran nomor itu PERMANEN.
  IF NOT (public.is_super_admin()
          OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
    SELECT code INTO v_kode FROM public.companies WHERE id = p_company_id;
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas % sehingga tidak bisa menomori dokumennya. Hubungi IT kalau Anda memang seharusnya bisa.',
      COALESCE(v_kode, p_company_id::text);
  END IF;

  UPDATE document_sequences
  SET    last_sequence = last_sequence + 1
  WHERE  company_id      = p_company_id
    AND  document_type   = p_document_type
    AND  department_code = p_department_code
    AND  year            = p_year
    AND  month           = p_month
    AND  day             = p_day
  RETURNING last_sequence INTO v_new_seq;

  IF NOT FOUND THEN
    INSERT INTO document_sequences
      (company_id, document_type, department_code, year, month, day, last_sequence)
    VALUES
      (p_company_id, p_document_type, p_department_code, p_year, p_month, p_day, 1)
    ON CONFLICT (company_id, document_type, department_code, year, month, day)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_new_seq;
  END IF;

  RETURN v_new_seq;
END;
$function$;

-- =============================================================================
-- 4. check_similar_accounts -- guard entitas
--    !! LANGUAGE sql -> plpgsql. Alasannya di kepala berkas, keputusan (1).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.check_similar_accounts(p_name text, p_company_id uuid)
 RETURNS TABLE(id uuid, name text, similarity real)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kode text;
BEGIN
  IF NOT (public.is_super_admin()
          OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
    SELECT code INTO v_kode FROM public.companies WHERE id = p_company_id;
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas % sehingga tidak bisa memeriksa nama akun di sana. Hubungi IT kalau Anda memang seharusnya bisa.',
      COALESCE(v_kode, p_company_id::text);
  END IF;

  RETURN QUERY
  WITH param AS (
    SELECT public.normalize_account_name(p_name) AS norm,
           0.6::real                             AS ambang
  )
  SELECT a.id,
         a.name,
         public.similarity(public.normalize_account_name(a.name), p.norm) AS similarity
  FROM public.accounts a
  CROSS JOIN param p
  WHERE a.company_id = p_company_id
    AND a.deleted_at IS NULL
    AND p.norm <> ''
    AND public.similarity(public.normalize_account_name(a.name), p.norm) >= p.ambang
  ORDER BY 3 DESC, a.name
  LIMIT 5;
END;
$function$;

-- =============================================================================
-- V-POST
-- =============================================================================
DO $v$
DECLARE
  r       record;
  v_gagal int := 0;
  v_src   text;
  v_pub   int; v_anon int; v_auth int;
BEGIN
  -- V-POST-1: kolom jejak ada.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='picking_lists'
                   AND a.attname='completed_by' AND a.attnum > 0 AND NOT a.attisdropped) THEN
    RAISE WARNING 'V-POST-1 GAGAL: kolom picking_lists.completed_by tidak ada.';
    v_gagal := v_gagal + 1;
  END IF;

  FOR r IN SELECT * FROM td281_l2_sebelum ORDER BY nama LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = r.oid;

    -- V-POST-2: badan BERUBAH (kebalikan lapis 1 -- di sini memang harus).
    IF md5(v_src) = r.md5_badan THEN
      RAISE WARNING 'V-POST-2 GAGAL: badan % TIDAK berubah -- guard tidak terpasang.', r.nama;
      v_gagal := v_gagal + 1;
    END IF;

    -- V-POST-3: guard benar-benar ada di badannya.
    IF v_src NOT LIKE '%is_super_admin()%' THEN
      RAISE WARNING 'V-POST-3 GAGAL: % tidak memuat is_super_admin().', r.nama;
      v_gagal := v_gagal + 1;
    END IF;

    -- V-POST-4: ACL TIDAK ikut berubah. CREATE OR REPLACE mempertahankan hak;
    -- DROP+CREATE tidak. Kalau angka ini bergeser, lapis 1 baru saja dibatalkan
    -- tanpa ada yang menyadarinya.
    SELECT count(*) FILTER (WHERE a.grantee = 0),
           count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'anon'),
           count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'authenticated')
      INTO v_pub, v_anon, v_auth
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = r.oid AND a.privilege_type = 'EXECUTE';
    IF v_pub > 0 OR v_anon > 0 THEN
      RAISE WARNING 'V-POST-4 GAGAL: % kembali terbuka (PUBLIC=% anon=%) -- lapis 1 batal.', r.nama, v_pub, v_anon;
      v_gagal := v_gagal + 1;
    END IF;
    IF v_auth = 0 THEN
      RAISE WARNING 'V-POST-4 GAGAL: % kehilangan EXECUTE untuk authenticated -- aplikasi akan patah.', r.nama;
      v_gagal := v_gagal + 1;
    END IF;

    RAISE NOTICE 'OK % : badan % -> %, acl [%]', r.nama, r.md5_badan, md5(v_src),
      (SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(NULL)') FROM pg_proc p WHERE p.oid = r.oid);
  END LOOP;

  IF v_gagal > 0 THEN
    RAISE EXCEPTION 'TD-281 H1 lapis 2: % pemeriksaan GAGAL. Transaksi dibatalkan, nol perubahan.', v_gagal;
  END IF;
  RAISE NOTICE 'TD-281 H1 LAPIS 2 LOLOS: 4 guard terpasang, jejak audit aktif, ACL lapis 1 utuh.';
END
$v$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- Teks SEBELUM perubahan ada di folder dump:
--   scripts/qa/out/badan-lapis2-20260928-130907/def-<nama>.sql
-- Jalankan keempatnya apa adanya (ia `CREATE OR REPLACE`, jadi ACL lapis 1
-- tetap utuh). Kolomnya boleh ditinggal -- ia nullable dan tidak dibaca siapa
-- pun selain complete_picking:
--   ALTER TABLE public.picking_lists DROP COLUMN IF EXISTS completed_by;
--
-- !! Memulihkan badan lama berarti MEMBUKA KEMBALI: setiap user yang login
--    bisa menyelesaikan picking mana pun dan menomori dokumen entitas mana pun.
--    Lakukan hanya kalau ada yang benar-benar patah, dan CATAT apa yang patah --
--    itulah pemakai sah yang guard-nya terlalu ketat, dan ia temuan tersendiri.
-- =============================================================================
