-- =============================================================================
-- 20260928000004_invoice_write_lockdown.sql   (Invoice lengkap, berkas 4 dari 9)
--
-- Penulisan invoice hanya lewat RPC SECURITY DEFINER. Titik.
--
-- APA YANG DICABUT
--   sp_invoice_lines : INSERT, UPDATE, DELETE  dari `authenticated`
--   sp_invoices      : INSERT                  dari `authenticated`
--
-- APA YANG TIDAK DICABUT, dan itu disengaja
--   sp_invoices.UPDATE -- tetap KOLOM-SPESIFIK seperti apa adanya (10 kolom,
--   dikurangi faktur_no yang sudah dicabut berkas 1). Mencabutnya sekaligus
--   berarti menebak kolom mana yang masih dipakai jalur lain; keputusan Den
--   berkas 1 menahan cakupannya di situ.
--   sp_invoices.DELETE -- di luar permintaan; RLS-nya super_admin saja.
--
-- ============================================================================
-- KENAPA INI AMAN -- DIUKUR, BUKAN DITAKSIR (27 Sep 2026)
--
--   FE : 7 pemakaian `sp_invoices`/`sp_invoice_lines` di `src/`, SELURUHNYA
--        `.select()` (db.js 1187, 1288, 1299, 1659, 1677, 1735, 1752).
--        NOL penulis langsung.
--
--   DB : 4 fungsi menulis kedua tabel. Tiga SECURITY DEFINER, jadi tidak
--        terpengaruh hak `authenticated` sama sekali:
--          create_invoice_for_sp, submit_invoice, record_payment
--
--   ⚠️ PENGECUALIAN YANG DICATAT, bukan yang disembunyikan:
--        `seed_uat_bill(...)` adalah SECURITY INVOKER dan melakukan
--        `UPDATE sp_invoices SET created_at / status / submitted_at / updated_at`.
--        Ia DIKECUALIKAN (keputusan Den, 27 Sep 2026) atas empat alasan yang
--        masing-masing bisa diperiksa:
--          1. helper seed UAT KHUSUS STAGING, dijalankan `seed.sh` sebagai
--             `postgres` -- hak `authenticated` tidak berlaku untuknya;
--          2. dihapus `99-purge.sql`, jadi ia tidak hidup di luar masa seed;
--          3. ia TIDAK menyentuh `sp_invoice_lines` sama sekali;
--          4. ia melakukan UPDATE, bukan INSERT -- jadi REVOKE INSERT di
--             `sp_invoices` tidak menyentuhnya.
--        ⭐ Dan ia memang SUDAH mustahil berjalan sebagai `authenticated`:
--        `status` dan `submitted_at` bukan bagian dari 10 kolom ber-UPDATE
--        untuk role itu. Pengecualian ini juga tercatat di
--        `scripts/seed/uat/README.md`.
-- ============================================================================
--
-- ⚠️ TD-176 sebagian tertutup untuk DUA tabel ini, dan HANYA dua tabel ini.
-- `sp_items`, `sp_order_items`, dan `sp_invoice_lines`-nya kerabat lain di TD
-- itu TIDAK disentuh.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='post_invoice_journal'
  ) THEN
    RAISE EXCEPTION 'PALANG: post_invoice_journal tidak ada -- jalankan 20260928000003 lebih dulu. Mencabut hak tulis sebelum jalur RPC-nya lengkap akan mematikan penerbitan invoice.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: jalur RPC penerbitan lengkap.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- bentuk hak SEBELUM.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE r record; v_txt text := '';
BEGIN
  FOR r IN
    SELECT c.relname, a::text AS acl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL unnest(c.relacl) AS a
     WHERE n.nspname='public' AND c.relname IN ('sp_invoices','sp_invoice_lines')
       AND a::text LIKE 'authenticated=%'
  LOOP
    v_txt := v_txt || r.relname || ' -> ' || r.acl || '; ';
  END LOOP;
  RAISE NOTICE 'V0 hak tingkat tabel untuk authenticated: %', v_txt;
END
$v0$;

-- ---------------------------------------------------------------------------
-- PENCABUTAN
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.sp_invoice_lines FROM authenticated;
REVOKE INSERT ON public.sp_invoices FROM authenticated;

COMMENT ON TABLE public.sp_invoice_lines IS
  'Baris invoice. TULIS HANYA lewat RPC SECURITY DEFINER (create_invoice_for_sp). authenticated tidak punya INSERT/UPDATE/DELETE sejak 20260928000004. Jangan kembalikan haknya untuk "memperbaiki data" -- perbaikan lewat RPC atau lewat migrasi.';

-- ---------------------------------------------------------------------------
-- V1 -- BUKTI. Diperiksa di DUA tingkat, karena hak bisa bersembunyi di
-- salah satunya: `relacl` (tingkat tabel) DAN `attacl` (tingkat kolom).
-- Memeriksa information_schema saja TIDAK cukup -- ia meratakan keduanya, dan
-- hak kolom yang tertinggal akan terbaca sebagai "sudah dicabut".
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_lines_tbl int; v_lines_kol int; v_inv_ins int; v_inv_upd_kol int;
BEGIN
  -- V1a: sp_invoice_lines -- nol a/w/d di tingkat TABEL.
  SELECT count(*) INTO v_lines_tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL unnest(c.relacl) AS a
   WHERE n.nspname='public' AND c.relname='sp_invoice_lines'
     AND a::text LIKE 'authenticated=%'
     AND split_part(a::text,'=',2) ~ '[awd]';
  IF v_lines_tbl <> 0 THEN
    RAISE EXCEPTION 'V1a GAGAL: authenticated masih punya INSERT/UPDATE/DELETE tingkat tabel pada sp_invoice_lines.';
  END IF;

  -- V1b: sp_invoice_lines -- nol hak tingkat KOLOM yang tertinggal.
  SELECT count(*) INTO v_lines_kol
    FROM pg_attribute at CROSS JOIN LATERAL unnest(at.attacl) AS a
   WHERE at.attrelid = 'public.sp_invoice_lines'::regclass
     AND a::text LIKE 'authenticated=%'
     AND split_part(a::text,'=',2) ~ '[awd]';
  IF v_lines_kol <> 0 THEN
    RAISE EXCEPTION 'V1b GAGAL: % kolom sp_invoice_lines masih ber-hak tulis untuk authenticated.', v_lines_kol;
  END IF;

  -- V1c: sp_invoices -- INSERT tercabut.
  SELECT count(*) INTO v_inv_ins
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL unnest(c.relacl) AS a
   WHERE n.nspname='public' AND c.relname='sp_invoices'
     AND a::text LIKE 'authenticated=%'
     AND split_part(a::text,'=',2) LIKE '%a%';
  IF v_inv_ins <> 0 THEN
    RAISE EXCEPTION 'V1c GAGAL: authenticated masih punya INSERT pada sp_invoices.';
  END IF;

  -- V1d: PEMBANDING. UPDATE kolom-spesifik sp_invoices HARUS MASIH ADA --
  -- kalau ia ikut hilang, pencabutan ini melampaui cakupannya dan uji di atas
  -- "lolos" karena alasan yang salah.
  SELECT count(*) INTO v_inv_upd_kol
    FROM pg_attribute at CROSS JOIN LATERAL unnest(at.attacl) AS a
   WHERE at.attrelid = 'public.sp_invoices'::regclass
     AND a::text LIKE 'authenticated=%'
     AND split_part(a::text,'=',2) LIKE '%w%';
  IF v_inv_upd_kol <> 9 THEN
    RAISE EXCEPTION 'V1d GAGAL: hak UPDATE kolom-spesifik sp_invoices = % kolom, harusnya 9 (10 semula, faktur_no dicabut berkas 1). Cakupan pencabutan meleset.', v_inv_upd_kol;
  END IF;

  RAISE NOTICE 'V1 LOLOS: sp_invoice_lines nol hak tulis (tabel & kolom); sp_invoices nol INSERT; UPDATE kolom-spesifik tetap 9 kolom.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   GRANT INSERT, UPDATE, DELETE ON public.sp_invoice_lines TO authenticated;
--   GRANT INSERT ON public.sp_invoices TO authenticated;
--
-- ⚠️ Rollback ini MENGEMBALIKAN kemampuan menulis baris invoice langsung lewat
-- PostgREST. Jalankan hanya kalau memang ada jalur sah yang memerlukannya --
-- dan kalau ada, catat jalur itu, karena pengukuran 27 Sep 2026 tidak
-- menemukan satu pun.
-- =============================================================================
