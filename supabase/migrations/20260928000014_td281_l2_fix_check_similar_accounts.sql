-- =============================================================================
-- 20260928000014_td281_l2_fix_check_similar_accounts.sql
--
-- PERBAIKAN atas 20260928000013: check_similar_accounts RUSAK setelah diubah
-- ke plpgsql -- SQLSTATE 42702 (ambiguous column reference).
--
-- Status: BELUM DIJALANKAN di mana pun (ditulis 28 Sep 2026).
--         ⛔ 20260928000013 SUDAH jalan di STAGING, PRODUCTION belum.
--
-- !! BERKAS BARU, dan 20260928000013 SENGAJA TIDAK DISUNTING.
--    Berkas itu sudah tercatat jalan di staging; mengubah isinya membuat repo
--    berhenti menggambarkan apa yang benar-benar dijalankan. Pola yang sama
--    dipakai saat berkas 3 AR Tahap 2 cacat (PROGRESS 2026-09-25).
--
-- -- APA YANG RUSAK, DAN KENAPA TIDAK KETAHUAN LEBIH AWAL --------------------
-- `RETURNS TABLE(id uuid, name text, similarity real)` pada fungsi plpgsql
-- melahirkan TIGA VARIABEL OUT bernama id / name / similarity. Nama-nama itu
-- bertabrakan dengan kolom di dalam query, dan plpgsql menolak menebak:
--     ERROR 42702: column reference ... is ambiguous
-- Versi `LANGUAGE sql` sebelumnya tidak punya variabel sama sekali, jadi
-- masalah ini LAHIR BERSAMA konversi ke plpgsql -- ia tidak pernah ada
-- sebelumnya.
--
-- ⛔ Yang lebih perlu dicatat: uji runtime MELIHATNYA dan menilainya LULUS.
--    Pengklasifikasi di uji-td281-h1.sh menganggap "4xx yang punya kode
--    SQLSTATE" sebagai TERIMA -- karena itulah bentuk penolakan bisnis
--    (P0001). Tapi 42702 bukan penolakan; ia KERUSAKAN. Fungsinya tidak
--    menolak siapa pun, ia gagal untuk SEMUA ORANG.
--    >> Uji yang tidak bisa membedakan "ditolak" dari "rusak" akan meloloskan
--       fungsi yang mati, dan justru terlihat hijau saat melakukannya.
--    Kedua skrip uji sudah diperbaiki: SQLSTATE kelas 42/22/23/XX = RUSAK.
--
-- -- PERBAIKANNYA DUA LAPIS, DAN ITU DISENGAJA --------------------------------
-- Saya TIDAK bisa menjalankan SQL untuk memastikan identifier mana persisnya
-- yang ambigu, jadi perbaikannya menutup dua kemungkinan sekaligus:
--   (a) `#variable_conflict use_column` -- kalau ada acuan tak berkualifikasi
--       yang terlewat, ia diselesaikan sebagai KOLOM, bukan variabel;
--   (b) seluruh kolom keluaran diberi alias yang TIDAK MUNGKIN bertabrakan
--       (akun_id / akun_nama / skor), jadi tabrakannya dihapus, bukan
--       sekadar diatur cara menyelesaikannya.
-- Nama kolom yang DITERIMA PEMANGGIL tetap id / name / similarity -- itu
-- datang dari `RETURNS TABLE`, bukan dari alias di dalam query. FE membaca
-- `d.name`, dan itu tidak berubah.
--
-- ** Yang benar-benar membuktikan perbaikan ini BUKAN penalaran di atas,
--    melainkan uji kesetaraan di staging: versi LAMA (dari dump produksi)
--    dijalankan berdampingan dengan versi baru atas beberapa nama uji, dan
--    hasilnya harus IDENTIK. Lihat scripts/qa/out/uji-kesetaraan-csa.sh. **
--
-- Guard entitas dari 20260928000013 DIPERTAHANKAN apa adanya.
-- =============================================================================

BEGIN;

DO $pra$
DECLARE v_lang text; v_src text;
BEGIN
  SELECT l.lanname, p.prosrc INTO v_lang, v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language  l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'check_similar_accounts';

  IF v_lang IS NULL THEN
    RAISE EXCEPTION 'V-PRA GAGAL: check_similar_accounts tidak ada.';
  END IF;
  -- Berkas ini memperbaiki versi plpgsql dari 000013. Kalau yang hidup masih
  -- `sql`, berarti 000013 belum jalan di DB ini -- jalankan itu dulu, kalau
  -- tidak guard entitasnya hilang tanpa ada yang tahu.
  IF v_lang <> 'plpgsql' THEN
    RAISE EXCEPTION 'V-PRA GAGAL: check_similar_accounts masih LANGUAGE % -- 20260928000013 belum dijalankan di DB ini. Jalankan itu lebih dulu.', v_lang;
  END IF;
  IF v_src NOT LIKE '%get_user_company_ids%' THEN
    RAISE EXCEPTION 'V-PRA GAGAL: guard entitas tidak ditemukan di badan yang hidup. Berhenti dan periksa.';
  END IF;
  RAISE NOTICE 'V-PRA LOLOS: versi plpgsql ber-guard terdeteksi, siap diperbaiki.';
END
$pra$;

CREATE OR REPLACE FUNCTION public.check_similar_accounts(p_name text, p_company_id uuid)
 RETURNS TABLE(id uuid, name text, similarity real)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Acuan tak berkualifikasi diselesaikan sebagai KOLOM, bukan sebagai variabel
-- OUT (id/name/similarity). Ini lapis pertama dari dua.
#variable_conflict use_column
DECLARE
  v_kode text;
BEGIN
  IF NOT (public.is_super_admin()
          OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
    SELECT c.code INTO v_kode FROM public.companies c WHERE c.id = p_company_id;
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas % sehingga tidak bisa memeriksa nama akun di sana. Hubungi IT kalau Anda memang seharusnya bisa.',
      COALESCE(v_kode, p_company_id::text);
  END IF;

  -- Lapis kedua: alias keluaran dibuat TIDAK MUNGKIN bertabrakan dengan nama
  -- variabel OUT. Nama kolom yang diterima pemanggil tetap id/name/similarity
  -- -- itu datang dari RETURNS TABLE, dan RETURN QUERY memetakan per POSISI.
  RETURN QUERY
  WITH param AS (
    SELECT public.normalize_account_name(p_name) AS norm,
           0.6::real                             AS ambang
  )
  SELECT a.id                                                                AS akun_id,
         a.name                                                              AS akun_nama,
         public.similarity(public.normalize_account_name(a.name), p.norm)    AS skor
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

DO $post$
DECLARE v_pub int; v_anon int; v_auth int;
BEGIN
  -- ACL harus TETAP: CREATE OR REPLACE mempertahankan hak, DROP+CREATE tidak.
  -- Kalau ini bergeser, lapis 1 (butir 27) batal tanpa ada yang menyadarinya.
  SELECT count(*) FILTER (WHERE a.grantee = 0),
         count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'anon'),
         count(*) FILTER (WHERE a.grantee <> 0 AND pg_get_userbyid(a.grantee) = 'authenticated')
    INTO v_pub, v_anon, v_auth
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
   WHERE n.nspname = 'public' AND p.proname = 'check_similar_accounts'
     AND a.privilege_type = 'EXECUTE';

  IF v_pub > 0 OR v_anon > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: check_similar_accounts kembali terbuka (PUBLIC=% anon=%) -- lapis 1 batal.', v_pub, v_anon;
  END IF;
  IF v_auth = 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: check_similar_accounts kehilangan EXECUTE untuk authenticated.';
  END IF;

  RAISE NOTICE 'V-POST LOLOS: ACL utuh (nol PUBLIC, nol anon, authenticated ada).';
  RAISE NOTICE 'Perbaikan terpasang. !! BUKTI SEBENARNYA = uji kesetaraan di staging:';
  RAISE NOTICE '   ./scripts/qa/out/uji-kesetaraan-csa.sh';
END
$post$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--   Jalankan ulang blok CREATE OR REPLACE dari 20260928000013 (versi plpgsql
--   yang rusak) -- TIDAK disarankan, ia 42702 untuk semua orang.
--   Atau kembali ke versi LANGUAGE sql dari produksi:
--     scripts/qa/out/badan-lapis2-20260928-130907/def-check_similar_accounts.sql
--   ⚠️ versi itu NOL GUARD entitas. Memulihkannya berarti mencabut guard.
-- =============================================================================
