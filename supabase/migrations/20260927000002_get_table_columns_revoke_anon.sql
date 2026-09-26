-- =============================================================================
-- 20260927000002_get_table_columns_revoke_anon.sql
--
-- !!  M I G R A S I   R E T R O A K T I F  --  BACA SEBELUM MENJALANKAN  !!
--
--   Keadaan yang direkam di sini SUDAH LIVE DI PRODUCTION. Kapan dan oleh
--   siapa: TIDAK DIKETAHUI. Ia pertama kali tercatat sebagai keganjilan pada
--   5 September 2026 (TD-24, "perubahan DB nyata tanpa migrasi yang
--   merekamnya"), dan baru terukur pasti pada 27 September 2026 lewat
--   env-drift-check.
--
--   !! JANGAN DIJALANKAN DI PRODUCTION -- di sana `anon` sudah tidak punya
--      EXECUTE, dan berkas ini bukan perubahan yang menunggu naik. Ia REKAMAN.
--   !! TIDAK MASUK ANTREAN doc 12.
--   >> DIJALANKAN DI STAGING saja (TD-279, Kelompok A4).
--
--   Nomor berkas 20260927* dipakai karena tanggal aslinya tidak diketahui.
--   Menebak tanggal akan membuat urutan berkas berbohong tentang sejarah;
--   tanggal HARI PEREKAMAN setidaknya benar tentang dirinya sendiri.
--
-- -- APA YANG BERBEDA --------------------------------------------------------
-- Badan fungsinya IDENTIK di kedua sisi (md5 13acef68d392d5ed1a42bc716180794b,
-- 167 karakter). Yang berbeda hanya ACL-nya:
--     staging     postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres,anon=X/postgres
--     production  postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres
--
-- ** Perbedaan ini TIDAK TERLIHAT dari badan fungsi sama sekali, dan itulah
-- sebabnya sidik jari env-drift-check menyertakan proacl. Kalau ia hanya
-- membandingkan prosrc, kedua sisi akan dilaporkan "identik" sementara staging
-- membuka satu fungsi ke peran anonim.
--
-- `anon` adalah peran untuk permintaan TANPA login. get_table_columns membaca
-- information_schema.columns dan mengembalikan nama + tipe kolom tabel mana
-- pun di schema public -- peta skema, bukan data. Bukan kebocoran baris, tapi
-- juga tidak ada alasan ia terbuka tanpa login.
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_table_columns(text) FROM anon;

-- -- V1: ACL staging = ACL production -----------------------------------------
DO $v1$
DECLARE v_acl text; v_md5 text;
BEGIN
  SELECT COALESCE(array_to_string(proacl::text[], ','), '(null)'), md5(prosrc)
    INTO v_acl, v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_table_columns';

  IF v_acl IS NULL THEN
    RAISE EXCEPTION 'V1a GAGAL: get_table_columns tidak ada.';
  END IF;

  -- Badan SENGAJA ikut diperiksa walau berkas ini tidak menyentuhnya: kalau
  -- badannya ternyata sudah berbeda, menyamakan ACL saja menutup satu baris
  -- laporan sambil meninggalkan perbedaan yang lebih besar.
  IF v_md5 IS DISTINCT FROM '13acef68d392d5ed1a42bc716180794b' THEN
    RAISE EXCEPTION 'V1b GAGAL: badan get_table_columns sudah berbeda dari production (md5 %). Berhenti -- ini temuan baru, bukan soal ACL.', v_md5;
  END IF;

  IF v_acl IS DISTINCT FROM 'postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres' THEN
    RAISE EXCEPTION 'V1c GAGAL: ACL = %, harusnya sama dengan production (tanpa anon).', v_acl;
  END IF;

  RAISE NOTICE 'A4b LOLOS: get_table_columns tidak lagi ter-EXECUTE untuk anon, badan tidak disentuh.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK (staging saja):
--   GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO anon;
-- =============================================================================
