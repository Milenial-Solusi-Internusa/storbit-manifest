-- =============================================================================
-- Migration: 20260925000002_sp_order_items_legacy_unique
-- Phase:     Menjadikan keunikan sp_order_items.legacy_sp_item_id jaminan
--            SKEMA, bukan lagi kebetulan DATA.
--
-- Status:    LIVE DI STAGING (25 Sep 2026) - BELUM DIJALANKAN DI PRODUCTION.
--
-- -- KENAPA ------------------------------------------------------------------
--   Migrasi 20260925000001 memetakan delivery_note_items.sp_order_item_id lewat
--   rantai picking_list_items.sp_item_id -> sp_order_items.legacy_sp_item_id.
--   Rantai itu hanya benar kalau legacy_sp_item_id UNIK. Hari ini keunikannya
--   tidak dijamin apa pun: satu-satunya index di sp_order_items adalah
--   sp_order_items_pkey (diukur di produksi 25 Sep 2026), jadi yang menjaganya
--   adalah keadaan data, bukan skema.
--
--   Selama belum dijamin, 20260925000001 melindungi diri dengan dua cara:
--   subquery skalar (tidak bisa menggandakan baris Surat Jalan) dan guard
--   pra-terbang pada backfill. Keduanya tetap benar sesudah index ini ada -
--   index ini membuat keduanya tidak pernah perlu menyala.
--
-- -- LINGKUP INDEX ------------------------------------------------------------
--   Kolomnya HANYA legacy_sp_item_id, bukan (sp_order_id, legacy_sp_item_id).
--   Sebabnya: satu baris sp_items lama boleh dimiliki tepat SATU baris
--   sp_order_items di seluruh sistem. Kalau id lama yang sama muncul di dua SP
--   berbeda, itu bukan keadaan sah yang perlu diizinkan - itu tanda dual-write
--   melenceng. Diukur di produksi 25 Sep 2026: nol id yang dipakai lintas SP.
--
--   PARSIAL (WHERE legacy_sp_item_id IS NOT NULL) karena NULL itu sah dan
--   banyak: baris sp_order_items yang lahir tanpa pasangan lama. Di Postgres
--   NULL memang tidak pernah bertabrakan di index unik, tapi klausa WHERE-nya
--   ditulis eksplisit supaya niatnya terbaca dan index-nya lebih kecil.
--
-- -- SIFAT --------------------------------------------------------------------
--   Idempoten (IF NOT EXISTS). DDL index saja - nol kolom, nol data, nol
--   GRANT/REVOKE, nol policy, nol fungsi, nol baris dihapus.
--   ⚠️ CREATE UNIQUE INDEX mengambil ShareLock pada tabel: penulisan ke
--   sp_order_items tertahan selama pembuatan. Di tabel sekecil ini (produksi
--   974 baris per 25 Sep 2026) itu hitungan milidetik. Untuk tabel besar,
--   bentuk yang benar CONCURRENTLY - di sini TIDAK dipakai, karena
--   CONCURRENTLY tidak boleh berada di dalam blok transaksi dan migrasi ini
--   dijalankan sebagai satu kesatuan.
--
-- -- URUTAN -------------------------------------------------------------------
--   Jalankan SESUDAH 20260925000001. Bukan karena bergantung secara teknis,
--   tapi karena kalau index ini gagal (ada duplikat), yang benar adalah
--   menyelidiki duplikatnya - dan 20260925000001 sudah lebih dulu memastikan
--   backfill-nya tidak memilih kandidat sembarangan.
-- =============================================================================


-- =============================================================================
-- V0 -- jalankan SEBELUM blok eksekusi.
-- =============================================================================
SELECT 'sp_order_items total'                  AS metrik, count(*)::text AS nilai FROM sp_order_items
UNION ALL SELECT 'legacy_sp_item_id NULL',     count(*)::text FROM sp_order_items WHERE legacy_sp_item_id IS NULL
UNION ALL SELECT 'legacy_sp_item_id terisi',   count(*)::text FROM sp_order_items WHERE legacy_sp_item_id IS NOT NULL
UNION ALL SELECT 'nilai legacy DUPLIKAT',
  (SELECT count(*)::text FROM (
     SELECT legacy_sp_item_id FROM sp_order_items
     WHERE legacy_sp_item_id IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1) d)
UNION ALL SELECT 'index sudah ada',
  (SELECT count(*)::text FROM pg_class WHERE relname = 'sp_order_items_legacy_sp_item_id_key');


-- =============================================================================
-- 1. PRA-CEK -- menolak jalan kalau ada duplikat.
--    CREATE UNIQUE INDEX sendiri sudah akan gagal, tapi pesannya generik
--    ("could not create unique index ... Key is duplicated"). Blok ini gagal
--    lebih dulu dengan pesan yang menyebut BERAPA nilai dan menunjuk ke query
--    V1b, supaya yang menjalankan tidak perlu menerka.
-- =============================================================================
DO $$
DECLARE v_dup int; v_baris int;
BEGIN
  SELECT count(*), COALESCE(SUM(n),0) INTO v_dup, v_baris FROM (
    SELECT legacy_sp_item_id, count(*) AS n
    FROM sp_order_items
    WHERE legacy_sp_item_id IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'sp_order_items punya % nilai legacy_sp_item_id duplikat (% baris terlibat) - index unik tidak dibuat. Jalankan V1b untuk melihat daftarnya; duplikat berarti dual-write melenceng dan harus diselesaikan dulu, bukan diakali.', v_dup, v_baris;
  END IF;
END $$;


-- =============================================================================
-- 2. INDEX
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS sp_order_items_legacy_sp_item_id_key
  ON public.sp_order_items (legacy_sp_item_id)
  WHERE legacy_sp_item_id IS NOT NULL;

COMMENT ON INDEX public.sp_order_items_legacy_sp_item_id_key IS
  'Satu baris sp_items lama dimiliki tepat satu baris sp_order_items. Menjamin rantai pemetaan delivery_note_items.sp_order_item_id (migrasi 20260925000001) tidak pernah ambigu. Parsial: NULL sah dan banyak.';


-- =============================================================================
-- V1 -- VERIFIKASI sesudah eksekusi
-- =============================================================================

-- V1a  Index ada, UNIK, dan PARSIAL. HARAPAN: 1 baris, unik = true,
--      definisinya memuat WHERE.
SELECT i.indexrelid::regclass::text AS nama_index,
       i.indisunique               AS unik,
       i.indpred IS NOT NULL       AS parsial,
       pg_get_indexdef(i.indexrelid) AS definisi
FROM pg_index i
WHERE i.indrelid = 'public.sp_order_items'::regclass
ORDER BY 1;
-- HARAPAN: dua baris total - sp_order_items_pkey dan
--          sp_order_items_legacy_sp_item_id_key (unik=true, parsial=true)

-- V1b  Daftar duplikat. Dipakai HANYA kalau pra-cek butir 1 gagal.
SELECT soi.legacy_sp_item_id, count(*) AS n,
       array_agg(soi.sp_order_id) AS sp_order_ids,
       array_agg(soi.product_name) AS produk
FROM sp_order_items soi
WHERE soi.legacy_sp_item_id IS NOT NULL
GROUP BY 1 HAVING count(*) > 1
ORDER BY 2 DESC;

-- V1c  Index benar-benar MENGIKAT, bukan cuma ada. Blok ini selalu berakhir
--      dengan EXCEPTION, jadi nol baris uji bisa tertinggal - yang membedakan
--      lolos dan gagal adalah PESANNYA.
--
--      ⚠️ Baris ujinya menyalin SELURUH kolom dari baris yang sudah ada dan
--      hanya mengganti product_name. Itu bukan kerapian: percobaan yang hanya
--      mengisi (sp_order_id, product_name, qty, unit_price, legacy_sp_item_id)
--      GAGAL DULU di company_id lalu product_id yang NOT NULL, sehingga cek
--      unik tidak pernah tersentuh dan ujinya lolos karena alasan yang salah.
--      Terjadi 25 Sep 2026; cabang WHEN OTHERS di bawah itulah yang
--      menangkapnya - tanpa cabang itu, error NOT NULL akan terbaca sebagai
--      "insert ditolak" = uji hijau palsu.
--
--      Dijalankan di staging 25 Sep 2026: LOLOS (23505).
DO $$
DECLARE v_ditolak boolean := false; v_lain text := '(tidak ada error)';
BEGIN
  BEGIN
    INSERT INTO sp_order_items (company_id, sp_order_id, product_id, product_name,
                                qty, unit_price, shipping_price, legacy_sp_item_id)
    SELECT company_id, sp_order_id, product_id, 'UJI INDEX - JANGAN SIMPAN',
           qty, unit_price, shipping_price, legacy_sp_item_id
    FROM sp_order_items WHERE legacy_sp_item_id IS NOT NULL LIMIT 1;
  EXCEPTION
    WHEN unique_violation THEN v_ditolak := true;
    WHEN OTHERS THEN v_lain := SQLSTATE || ' ' || SQLERRM;
  END;

  IF NOT v_ditolak THEN
    RAISE EXCEPTION 'V1c TIDAK SAH: bukan unique_violation. Yang terjadi: %', v_lain;
  END IF;
  RAISE EXCEPTION 'V1c LOLOS: insert duplikat ditolak unique_violation (23505). Transaksi dibatalkan, nol baris uji tertinggal.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   DROP INDEX IF EXISTS public.sp_order_items_legacy_sp_item_id_key;
--
-- Aman dan lengkap: index ini tidak menopang FK maupun constraint apa pun, dan
-- tidak ada baris data yang bergantung padanya. Menjatuhkannya hanya
-- mengembalikan keadaan "keunikan dijaga data, bukan skema" - yaitu keadaan
-- sebelum migrasi ini, dan 20260925000001 tetap benar tanpanya.
