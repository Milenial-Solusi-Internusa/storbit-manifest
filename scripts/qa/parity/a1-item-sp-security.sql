-- =============================================================================
-- a1-item-sp-security.sql -- PATCH PARITY STAGING (TD-279, Kelompok A1)
--
-- !!  S T A G I N G   S A J A  --  JANGAN DIJALANKAN DI PRODUCTION  !!
--     Seluruh isi berkas ini SUDAH hidup di production. Ia membawa STAGING
--     menyusul, bukan sebaliknya. Tidak masuk antrean doc 12.
--
-- KENAPA PERTAMA. Ini satu-satunya temuan drift yang membuat STAGING LEBIH
-- LONGGAR dari production:
--     staging     sp_items_delete USING (true)
--     production  sp_items_delete USING (is_super_admin() OR is_sp_item_writer())
-- Arah itu berbahaya dengan cara yang halus: bug hapus item SP LOLOS di UAT
-- lalu DITOLAK di production. Uji yang lolos di lingkungan yang lebih longgar
-- tidak membuktikan apa pun tentang lingkungan yang lebih ketat.
--
-- Ketiga objek TIDAK BISA DIPISAH: policy ketatnya memanggil
-- is_sp_item_writer(), dan delete_sp_item_dual() adalah satu-satunya jalur
-- hapus yang sah sesudah policy itu berlaku.
--
-- Badan fungsi DISALIN BYTE-PER-BYTE dari production (read-only, 27 Sep 2026),
-- BUKAN dari 20260902000001/000002 -- alasannya di README folder ini.
--
-- !! PERHATIKAN POSISI PENUTUP $fn$. Badan delete_sp_item_dual berakhir
--    "END; " dengan SPASI dan TANPA baris baru, sementara is_sp_item_writer
--    berakhir dengan baris baru. Itu bukan kerapian: prosrc disimpan apa
--    adanya, jadi satu baris baru yang berbeda sudah membuat md5-nya meleset
--    dan V1 di ekor berkas GAGAL. Berkas ini digenerate dari teks production,
--    bukan diketik ulang, justru karena hal seperti ini tidak terlihat mata.
-- =============================================================================

BEGIN;

-- --- 1. is_sp_item_writer() -------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_sp_item_writer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','manager','operations')
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$fn$;

-- ACL production: postgres=X/postgres,authenticated=X/postgres -- TANPA PUBLIC.
-- Fungsi yang baru dibuat mendapat PUBLIC EXECUTE secara bawaan, jadi REVOKE
-- di bawah bukan hiasan: tanpa itu ACL staging berbeda dari production dan
-- drift-nya tidak akan tertutup.
REVOKE ALL     ON FUNCTION public.is_sp_item_writer() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_sp_item_writer() TO authenticated;

-- --- 2. delete_sp_item_dual(uuid) -------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_sp_item_dual(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE v_company uuid; v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT o.company_id, o.status, si.customer_id, si.sp_no
    INTO v_company, v_status, v_cust, v_sp
    FROM sp_items si
    JOIN sp_orders o
      ON o.customer_id = si.customer_id
     AND o.sp_no       = si.sp_no
     AND o.deleted_at IS NULL
   WHERE si.id = p_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Item SP tidak ditemukan, atau SP induknya belum ada di sp_orders.';
  END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND is_sp_item_writer())) THEN
    RAISE EXCEPTION 'Tidak berhak menghapus item SP ini';
  END IF;

  IF v_status NOT IN ('DRAFT','CONFIRMED','MENUNGGU_STOK') THEN
    RAISE EXCEPTION 'SP sudah berjalan (status %) — baris item tidak bisa dihapus.', v_status;
  END IF;

  IF (SELECT count(*) FROM sp_items
       WHERE customer_id = v_cust AND sp_no = v_sp) <= 1 THEN
    RAISE EXCEPTION 'Ini baris terakhir SP — hapus SP-nya lewat Danger Zone, bukan per item.';
  END IF;

  DELETE FROM sp_order_items WHERE legacy_sp_item_id = p_id;
  DELETE FROM sp_items       WHERE id = p_id;

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $fn$;

REVOKE ALL     ON FUNCTION public.delete_sp_item_dual(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_sp_item_dual(uuid) TO authenticated;

-- --- 3. policy sp_items_delete ----------------------------------------------
DROP POLICY IF EXISTS sp_items_delete ON public.sp_items;
CREATE POLICY sp_items_delete ON public.sp_items FOR DELETE TO authenticated
  USING (is_super_admin() OR is_sp_item_writer());

-- --- V1: BUKTI, bukan harapan -----------------------------------------------
-- -- ASAL ANGKA HARAPAN DI BAWAH ----------------------------------------
-- SELURUHNYA DIUKUR DARI PRODUCTION, bukan dihitung dan bukan disalin
-- dari staging. Sumbernya satu berkas yang ikut di repo:
--   scripts/qa/parity/inventaris-production-20260927.json
--   (env-drift-check.mjs INVENTARIS_SQL, SELECT saja, 27 Sep 2026,
--    ref untmpqceexwxzuhlmyrg)
--
-- Yang dipakai berkas ini:
--   384132b93cf287b82c5d9d4ba2a61489  is_sp_item_writer()               md5(prosrc)
--   d8f2a428ac396512ef5056fbe4c5936f  delete_sp_item_dual(uuid)         md5(prosrc)
--   9aa242a0e10291c085fc310cecb667a6  is_sp_item_writer()               sidik penuh
--   c5cd6c1d1efa513c38f04752e75acea8  delete_sp_item_dual(uuid)         sidik penuh
--
-- DUA penjaga, dan keduanya perlu karena menjaga hal berbeda:
--   scripts/qa/cek-sidik-parity.mjs  -- nol DB: tiap angka di sini WAJIB
--     ada di inventaris terukur itu. Menangkap angka hasil hitungan sendiri.
--   PREFLIGHT 2 di skrip apply       -- mengukur production LANGSUNG di run
--     yang sama lalu membandingkannya. Menangkap inventaris yang sudah BASI.
--
-- !! JANGAN menghitung angka ini di luar SQL. 28 Sep 2026 keenam konstanta
--    salah seluruhnya karena prosecdef::text disangka menghasilkan "t";
--    ia menghasilkan "true". t/f cuma cara psql MENAMPILKAN boolean.
-- -----------------------------------------------------------------------
DO $v1$
DECLARE v_md5 text; v_sidik text; v_nama text; v_qual text; v_roles text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='is_sp_item_writer';
  IF v_md5 IS DISTINCT FROM '384132b93cf287b82c5d9d4ba2a61489' THEN
    RAISE EXCEPTION 'V1a GAGAL: badan is_sp_item_writer tidak sama dengan production (md5 %).', v_md5;
  END IF;

  SELECT md5(prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='delete_sp_item_dual';
  IF v_md5 IS DISTINCT FROM 'd8f2a428ac396512ef5056fbe4c5936f' THEN
    RAISE EXCEPTION 'V1b GAGAL: badan delete_sp_item_dual tidak sama dengan production (md5 %).', v_md5;
  END IF;


  -- !! Sidik jari yang dibandingkan = sidik jari env-drift-check, bukan
  -- md5(prosrc) saja. Pelajaran 28 Sep 2026: V1 20260918000001 memeriksa badan
  -- + ACL + trigger, ketiganya cocok, dan ia melaporkan LOLOS -- sementara alat
  -- drift tetap melaporkan BEDA ISI, karena SECURITY DEFINER-nya tertinggal dan
  -- prosecdef ikut ditimbang. Blok verifikasi yang lebih longgar daripada alat
  -- yang memeriksanya bukan verifikasi, melainkan jaminan palsu.
  -- !! Angkanya DIUKUR dari production (inventaris 27 Sep), bukan dihitung di
  -- sini. Hitungan sendiri sempat salah untuk keenam fungsi parity karena
  -- prosecdef::text disangka 't' padahal 'true'. Penjaganya
  -- scripts/qa/cek-sidik-parity.mjs.
  SELECT md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), ''))
    INTO v_sidik FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='is_sp_item_writer';
  IF v_sidik IS DISTINCT FROM '9aa242a0e10291c085fc310cecb667a6' THEN
    RAISE EXCEPTION 'V1a1 GAGAL: sidik jari is_sp_item_writer (badan+secdef+volatile+config) = %, harusnya 9aa242a0e10291c085fc310cecb667a6.', v_sidik;
  END IF;

  SELECT md5(p.prosrc || '|' || p.prosecdef::text || '|' || p.provolatile::text
             || '|' || COALESCE(array_to_string(p.proconfig, ','), ''))
    INTO v_sidik FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='delete_sp_item_dual';
  IF v_sidik IS DISTINCT FROM 'c5cd6c1d1efa513c38f04752e75acea8' THEN
    RAISE EXCEPTION 'V1b2 GAGAL: sidik jari delete_sp_item_dual (badan+secdef+volatile+config) = %, harusnya c5cd6c1d1efa513c38f04752e75acea8.', v_sidik;
  END IF;

  -- Grantee KOSONG berawalan '=' berarti PUBLIC, dan proacl NULL juga berarti
  -- PUBLIC EXECUTE (gotcha #40). Keduanya diperiksa -- memeriksa satu saja
  -- meloloskan yang lain.
  FOR v_nama IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('is_sp_item_writer','delete_sp_item_dual')
       AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'))
  LOOP
    RAISE EXCEPTION 'V1c GAGAL: % masih ber-PUBLIC EXECUTE.', v_nama;
  END LOOP;

  SELECT qual, COALESCE(array_to_string(roles,','),'')
    INTO v_qual, v_roles FROM pg_policies
   WHERE schemaname='public' AND tablename='sp_items' AND policyname='sp_items_delete' AND cmd='DELETE';
  IF v_qual IS DISTINCT FROM '(is_super_admin() OR is_sp_item_writer())' THEN
    RAISE EXCEPTION 'V1d GAGAL: qual sp_items_delete = %', COALESCE(v_qual,'(tidak ada)');
  END IF;
  IF v_roles IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'V1e GAGAL: roles sp_items_delete = %, harusnya authenticated.', v_roles;
  END IF;

  RAISE NOTICE 'A1 LOLOS: 2 fungsi + 1 policy sama dengan production, nol PUBLIC EXECUTE.';
END
$v1$;

COMMIT;
