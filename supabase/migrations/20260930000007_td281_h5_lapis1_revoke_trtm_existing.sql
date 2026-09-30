-- =============================================================================
-- 20260930000007_td281_h5_lapis1_revoke_trtm_existing.sql
--
-- TD-281 H5 LAPIS 1 -- pasangan RETROAKTIF dari H2 (20260929000001): mencabut
-- TRUNCATE, REFERENCES, TRIGGER, MAINTAIN dari `anon` dan `authenticated` pada
-- SELURUH tabel (dan view/materialized view -- lihat catatan relkind di bawah)
-- yang SUDAH ADA di skema `public`.
--
-- Status: ✅ LIVE staging DAN production 30 Sep 2026 (ditulis 30 Sep 2026).
--         Seluruh V-PRA/V-POST lolos di KEDUA lingkungan, nol koreksi
--         diperlukan untuk berkas ini (beda dari lapis 2, lihat berkasnya).
--         Angka potret sebelum/sesudah yang sebenarnya terjadi (bukan
--         perkiraan di bawah): `12_ANTREAN_MIGRASI_PRODUCTION.md` §H5.
--         ⛔ BUKAN "uji staging dulu, produksi menyusul" seperti H1/H3, dan
--         BUKAN pula "produksi dulu" seperti H2/H3. Temuan (b) TD-281 eksplisit
--         menyatakan T-R-T-M `authenticated` SERAGAM di KEDUA lingkungan --
--         karena itu TIDAK PERNAH muncul sebagai drift. Dijalankan: STAGING DAN
--         PRODUCTION DI HARI YANG SAMA, sebagai PENGERASAN MANDIRI, TIDAK
--         menunggu launching fitur `develop` (keputusan Den 30 Sep 2026).
--
-- -- KENAPA INI PENTING ---------------------------------------------------------
-- H2 (`ALTER DEFAULT PRIVILEGES`, LIVE kedua lingkungan 28 Sep) menghentikan
-- tabel BARU lahir dengan T-R-T-M untuk anon/authenticated. Ia SENGAJA tidak
-- retroaktif (lihat header H2) -- tabel yang sudah ada sebelum H2 tetap
-- membawa hak lama SELAMANYA sampai dicabut manual. Itulah TD-230, dan itulah
-- pekerjaan berkas ini.
--
-- `TRUNCATE` TIDAK TUNDUK PADA RLS SAMA SEKALI -- policy seketat apa pun tidak
-- relevan terhadapnya. Satu-satunya penghalang hari ini: PostgREST tidak
-- mengekspos TRUNCATE lewat REST API. Itu sifat ALAT, bukan IZIN -- begitu ada
-- jalur lain ke DB ber-role `authenticated`/`anon` (Edge Function ber-JWT
-- pemanggil, klien Postgres langsung), perlindungannya hilang tanpa peringatan.
--
-- -- PENGUKURAN 30 SEPTEMBER 2026 (dasar V-PRA di bawah, BUKAN diasumsikan) ----
--   production : 153 tabel `public`; anon T-R-T-M di 113; authenticated T-R-T-M
--                di 141 (12 tabel sudah bersih -- lahir sesudah H2 atau lewat
--                migrasi yang mencabut manual, mis. 20260927000002/
--                20260928000008/20260928000009/20260914000002).
--   staging    : 146 tabel `public`; proporsi anon/authenticated T-R-T-M sama
--                (113/141). ⭐ View `stock_summary` di staging JUGA membawa
--                T-R-T-M untuk anon -- BUKTI bahwa `ALL TABLES` menyentuh view,
--                bukan cuma tabel biasa (relkind 'r'/'p'). Karena itu snapshot
--                SEBELUM dan V-POST di bawah WAJIB mencakup relkind 'v' DAN 'm'
--                (materialized view), tidak cukup 'r'/'p' saja -- koreksi Den
--                atas draft rencana semula.
--   Angka di atas akan BERGESER lagi sebelum eksekusi sungguhan -- V-PRA/V-POST
--   di bawah TIDAK menguji angka ini secara harfiah (bisa basi), ia menguji
--   BENTUKNYA (ada/tidak ada hak, H2 live/tidak).
--
-- -- YANG BERKAS INI TIDAK LAKUKAN, DAN ITU PENTING ----------------------------
-- ⛔ Ia TIDAK menyentuh DML (SELECT/INSERT/UPDATE/DELETE) -- itu TD-281 H5
--    LAPIS 2 (11 tabel TD-24, berkas terpisah `...h5_lapis2...`) untuk `anon`,
--    dan sengaja TIDAK disentuh untuk `authenticated` di sini (74 tabel ditulis
--    langsung dari `src/`, diukur identik di `develop` MAUPUN `main` -- lihat
--    laporan sesi; mencabutnya butuh audit per-tabel terpisah, DI LUAR syarat
--    launching, "Group D").
-- ⛔ Ia TIDAK menyentuh sequence (GRANT ALL TABLES tidak mencakup sequence).
-- ⛔ Ia TIDAK menyentuh `service_role` -- keputusan SAMA dengan H2 (Den, 28 Sep,
--    ditegaskan ulang 30 Sep): service_role sudah bypass RLS + DML penuh di
--    setiap tabel, TRUNCATE bukan kelas kemampuan baru baginya, dan kuncinya
--    tidak pernah dikirim ke browser.
-- ⛔ Ia TIDAK menyentuh entri `supabase_admin` (milik platform Supabase,
--    keputusan Den 28 Sep, tetap berlaku).
--
-- -- KENAPA AMAN (bukti dari kode, bukan asumsi) --------------------------------
-- PostgREST tidak pernah mengekspos TRUNCATE. REFERENCES/TRIGGER hanya relevan
-- untuk DDL (ALTER TABLE ADD CONSTRAINT / CREATE TRIGGER), yang TIDAK bisa
-- dipanggil lewat REST API. Satu-satunya Edge Function yang menjalankan DDL
-- dinamis (`manage-schema`) melakukannya lewat RPC `exec_sql` dipanggil dengan
-- SERVICE ROLE KEY (`dbExecSql()`, `Authorization: Bearer <serviceRoleKey>`) --
-- bukan hak `authenticated`/`anon`, sama sekali tidak tersentuh berkas ini.
-- Diverifikasi 30 Sep 2026 dari `supabase/functions/manage-schema/index.ts`.
--
-- -- LOG PRODUKSI 23-30 SEP 2026 (~80rb request /rest/v1 + /graphql) -----------
-- Nol permintaan tanpa JWT `authenticated` dari referer/user-agent di luar
-- `nexus.msigroup.co.id`. Yang tanpa JWT hanya: preflight OPTIONS, Edge
-- Function Nexus sendiri (kunci service/sb_secret), atau aplikasi Nexus dengan
-- sesi kedaluwarsa (401). ⚠️ Batasan yang diterima: integrasi BULANAN tidak
-- akan terlihat di jendela 7 hari -- karena itu rollback PER TABEL (dari
-- snapshot, bukan blanket GRANT balik) tetap wajib tersedia, lihat ekor berkas.
--
-- Terkait: TD-230 · TD-281 finding (a)+(b) · TD-24 (H5 lapis 2) · doc 12 butir
--          45 · H2 (`20260929000001`).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- V-PRA -- H2 harus sudah live DI SINI. Kalau tidak, tabel BARU yang lahir
-- sesudah berkas ini tetap membawa T-R-T-M untuk anon/authenticated, dan
-- retroactive fix ini "kalah" oleh CREATE TABLE berikutnya tanpa GRANT eksplisit.
-- -----------------------------------------------------------------------------
DO $pra$
DECLARE v_h2_masih_longgar int;
BEGIN
  SELECT count(*) INTO v_h2_masih_longgar
    FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
     AND pg_get_userbyid(d.defaclrole) = 'postgres'
     AND pg_get_userbyid(a.grantee) IN ('anon','authenticated')
     AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
  IF v_h2_masih_longgar > 0 THEN
    RAISE EXCEPTION 'V-PRA GAGAL: H2 (20260929000001_td281_h2_default_privileges) belum live di lingkungan ini -- tabel BARU akan tetap lahir dengan T-R-T-M untuk anon/authenticated. Jalankan H2 dulu, baru berkas ini.';
  END IF;
  RAISE NOTICE 'V-PRA LOLOS: H2 sudah live -- tabel baru sudah lahir bersih.';
END
$pra$;

-- -----------------------------------------------------------------------------
-- Potret SEBELUM -- relkind 'r' (tabel biasa), 'p' (partitioned), 'v' (view),
-- 'm' (materialized view). GRANT/REVOKE "ALL TABLES IN SCHEMA" mencakup
-- KEEMPATNYA (dibuktikan empiris 30 Sep 2026: view `stock_summary` di staging
-- membawa T-R-T-M untuk anon) -- TIDAK cukup 'r'/'p' saja.
--
-- ⛔ WAJIB diekspor runner ke berkas TERPISAH sebelum COMMIT (pola sama H1) --
-- rollback presisi bergantung padanya. Sekitar 28 dari ~153 tabel TIDAK punya
-- T-R-T-M `anon` sebelum berkas ini (113/141 terukur 30 Sep); blanket GRANT
-- balik akan memberi ke-28 itu hak yang tidak pernah mereka punya.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE td281_h5l1_sebelum ON COMMIT DROP AS
SELECT c.relname                                    AS objek,
       c.relkind::text                              AS jenis,
       COALESCE(string_agg(DISTINCT
         CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END
         || ':' || g.privilege_type, ',' ORDER BY 1), '') AS trtm_sebelum
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(
    CASE c.relkind WHEN 'S' THEN 'S' ELSE 'r' END, c.relowner))) g
    ON pg_get_userbyid(g.grantee) IN ('anon','authenticated')
   AND g.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
 GROUP BY c.relname, c.relkind;

DO $pra2$
DECLARE v_total int; v_dengan_hak int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE trtm_sebelum <> '')
    INTO v_total, v_dengan_hak
    FROM td281_h5l1_sebelum;
  RAISE NOTICE 'Potret SEBELUM: % objek (tabel/view/matview) direkam, % di antaranya punya T-R-T-M anon/authenticated.', v_total, v_dengan_hak;
END
$pra2$;

-- -----------------------------------------------------------------------------
-- PENCABUTAN. `ON ALL TABLES IN SCHEMA public` mencakup tabel biasa,
-- partitioned table, view, DAN materialized view -- lihat catatan di atas.
-- Sequence TIDAK tersentuh (GRANT ALL TABLES tidak mencakupnya, dan T-R-T-M
-- bukan hak sequence yang valid).
-- -----------------------------------------------------------------------------
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- V-POST
-- -----------------------------------------------------------------------------
DO $post$
DECLARE
  v_sisa         int;
  v_sisa_per_jenis text;
  v_service      int;
BEGIN
  -- Nol T-R-T-M tersisa untuk anon/authenticated, di SELURUH relkind yang
  -- direkam di atas (r/p/v/m).
  SELECT count(*),
         COALESCE(string_agg(DISTINCT c.relkind::text, ',' ORDER BY 1), '')
    INTO v_sisa, v_sisa_per_jenis
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) g
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
     AND pg_get_userbyid(g.grantee) IN ('anon','authenticated')
     AND g.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');

  IF v_sisa > 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: % baris T-R-T-M anon/authenticated masih tersisa (relkind: %). Kemungkinan ada relkind yang tidak tercakup "ALL TABLES" -- periksa manual.', v_sisa, v_sisa_per_jenis;
  END IF;

  -- service_role WAJIB tetap utuh -- kalau nol, ada yang salah (mis. REVOKE
  -- tanpa daftar peran eksplisit ikut mengenai service_role secara tak sengaja).
  SELECT count(*) INTO v_service
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) g
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
     AND pg_get_userbyid(g.grantee) = 'service_role'
     AND g.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
  IF v_service = 0 THEN
    RAISE EXCEPTION 'V-POST GAGAL: service_role ikut kehilangan T-R-T-M -- di luar rencana (sengaja dipertahankan, keputusan Den 28 & 30 Sep).';
  END IF;

  RAISE NOTICE 'V-POST LOLOS: anon/authenticated 0 T-R-T-M di seluruh tabel/view/matview public. service_role tetap % hak.', v_service;
  RAISE NOTICE 'TD-281 H5 LAPIS 1 SELESAI. Lapis 2 (11 tabel TD-24 + 2 RPC anon) = berkas terpisah.';
END
$post$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
-- ⛔ BUKAN blanket `GRANT ... ON ALL TABLES ... TO anon, authenticated` --
-- ~28 tabel TIDAK punya hak anon sebelum berkas ini (113/141 dari ~153, terukur
-- 30 Sep 2026); blanket grant balik akan memberi mereka hak yang tidak pernah
-- mereka punya.
--
-- Pulihkan PER OBJEK dari `td281_h5l1_sebelum` yang DIEKSPOR RUNNER sebelum
-- COMMIT (pola sama H1/H2) -- bukan dari ingatan, bukan dari tabel ini sendiri
-- (ia ON COMMIT DROP, sudah lenyap begitu transaksi selesai). Bentuk per baris
-- (kalau `trtm_sebelum` tidak kosong):
--   GRANT <daftar privilege dari trtm_sebelum> ON <jenis> public.<objek> TO <peran>;
--
-- !! Memberi kembali TRUNCATE/REFERENCES/TRIGGER/MAINTAIN untuk peran TANPA
--    LOGIN (`anon`) atau peran login manapun berarti MEMBUKA KEMBALI paparan
--    yang berkas ini tutup. Lakukan HANYA kalau ada yang benar-benar patah, dan
--    catat apa yang patah -- karena itulah pemanggil yang tidak terdaftar di
--    log 7 hari (lihat batasan di atas), dan ia temuan tersendiri.
-- =============================================================================
