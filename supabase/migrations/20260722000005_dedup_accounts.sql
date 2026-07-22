-- STATUS: SUDAH DIJALANKAN 22 Jul 2026, terverifikasi.
-- Bukti:
--   backup accounts_dedup_backup_20260722 = 1.089 baris (seluruh akun aktif pra-dedup)
--   akun aktif sesudah = 1.050 (1.089 - 39, cocok)
--   deleted_at seragam 2026-07-22 09:24:03.904117+00 pada tepat 39 baris
--   MITRA BANGUN GRAHA MANDIRI tetap 'customer' dan aktif (lifecycle TIDAK turun)
--   ALUN INDAH naik dari 'lead' ke 'mql' dan aktif
--   sisa grup duplikat nama-ternormalisasi = 7 (semuanya kategori manual)
--
-- Dedup akun duplikat: 39 baris di-soft-delete, 2 baris dinaikkan lifecycle-nya.
-- Dijalankan manual di SQL Editor; file ini dibuat menyusul supaya perubahannya
-- punya jejak (prinsip repo: rekam tiap SQL manual jadi file migrasi).
--
-- ── CATATAN DESAIN ──────────────────────────────────────────────────────────
--
-- (1) PERINGATAN: FILE INI TIDAK IDEMPOTEN. Menjalankannya ulang akan mencari
--     duplikat LAGI berdasarkan keadaan data saat itu, dan bisa mengenai baris
--     yang berbeda. Ini rekaman satu kali jalan, BUKAN skrip yang boleh diulang.
--     Kalau perlu dedup lagi di kemudian hari, jalankan PREVIEW dulu (query di
--     kaki file) dan tinjau hasilnya secara manual.
--
-- (2) SOFT DELETE, bukan DELETE. accounts punya 20 tabel anak / 22 kolom FK
--     (accounts.converted_to, activities, ar_ttfs, customers, dc_master,
--     deal_handovers, delivery_notes, inquiries x2, picking_lists, prf,
--     quotations x2, sales_calls, sales_orders, sales_visits, sp_btb, sp_items,
--     sp_orders, top_requests). DELETE akan ditolak FK atau meninggalkan data
--     yatim.
--
-- (3) DETEKSI pakai NAMA TERNORMALISASI, bukan similarity. Normalisasi: buang
--     PT/CV/TBK, buang semua karakter non-alfanumerik, lowercase. Alasannya
--     similarity() meleset dua arah pada data ini: terlalu longgar untuk nama
--     yang berbagi kata umum ("MPA LOGISTICS INDONESIA" vs "MJL LOGISTICS
--     INDONESIA" = 0.78 padahal beda perusahaan), dan terlalu ketat untuk beda
--     prefix ("ALUN INDAH" vs "PT Alun Indah" = 0.79). Extension pg_trgm HANYA
--     dipakai untuk survei awal, TIDAK dipakai di eksekusi ini — file ini tidak
--     bergantung padanya.
--
-- (4) ATURAN PEMENANG, berurutan: (a) yang punya data menang, (b) kalau seri,
--     lifecycle tertinggi, (c) kalau seri lagi, created_at paling tua.
--
-- (5) LIFECYCLE PEMENANG DINAIKKAN ke level tertinggi di grupnya. Ini WAJIB dan
--     bukan tambahan kosmetik. Tanpa ini, MITRA BANGUN GRAHA MANDIRI akan turun
--     dari 'customer' ke 'prospect' — karena baris yang punya data justru yang
--     lifecycle-nya lebih rendah. Konsisten dengan keputusan K-1: lifecycle
--     hanya naik, tidak pernah turun.
--
-- (6) GRUP DENGAN LEBIH DARI SATU ANGGOTA BERDATA SENGAJA TIDAK DISENTUH
--     (klausa `anggota_berdata <= 1`). Menggabungkannya berarti memindahkan 22
--     kolom FK antar akun, dan itu pekerjaan tersendiri. Tersisa 7 grup, yang
--     terberat TIGA REKSA PERDANA INDONESIA (dua-duanya customer, 15 vs 7
--     rujukan).
--
-- (7) SISA YANG TIDAK TERTANGKAP normalisasi eksak: sekitar 13 pasang yang
--     berbeda ejaan atau kata, mis. ALLIANC vs ALLIANCE COSMETICS, HINOMOTO
--     MANUFACTURE vs MANUFACTURING, SINAR JAYA LOGISTICS vs LOGISTIK, MENARA
--     PERDANA ANUGERAH vs ANUGRAH. Ini butuh penilaian manusia, tidak bisa
--     diotomatiskan.
--
-- (8) NOL PENCEGAHAN. Setelah migrasi ini, sistem MASIH menerima duplikat baru —
--     tidak ada UNIQUE constraint maupun peringatan saat input. Membersihkan
--     tanpa mencegah berarti duplikat akan menumpuk lagi. Pencegahan saat input
--     tercatat sebagai D-1 di antrean.

CREATE TABLE accounts_dedup_backup_20260722 AS
SELECT * FROM public.accounts WHERE deleted_at IS NULL;

BEGIN;

WITH norm AS (
  SELECT id, name, account_status, created_at,
         lower(regexp_replace(regexp_replace(name,'\y(PT|CV|TBK)\y\.?','','gi'),'[^a-zA-Z0-9]','','g')) AS n
  FROM public.accounts WHERE deleted_at IS NULL
),
pakai AS (
  SELECT nm.*,
    (SELECT count(*) FROM public.inquiries x WHERE x.prospect_id=nm.id OR x.customer_id=nm.id)
  + (SELECT count(*) FROM public.quotations x WHERE x.prospect_id=nm.id OR x.customer_id=nm.id)
  + (SELECT count(*) FROM public.activities x WHERE x.account_id=nm.id)
  + (SELECT count(*) FROM public.sales_calls x WHERE x.prospect_id=nm.id)
  + (SELECT count(*) FROM public.sales_visits x WHERE x.prospect_id=nm.id)
  + (SELECT count(*) FROM public.sales_orders x WHERE x.account_id=nm.id)
  + (SELECT count(*) FROM public.prf x WHERE x.account_id=nm.id)
  + (SELECT count(*) FROM public.deal_handovers x WHERE x.account_id=nm.id)
  + (SELECT count(*) FROM public.top_requests x WHERE x.account_id=nm.id)
  + (SELECT count(*) FROM public.sp_orders x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.sp_items x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.sp_btb x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.delivery_notes x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.picking_lists x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.ar_ttfs x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.dc_master x WHERE x.customer_id=nm.id)
  + (SELECT count(*) FROM public.customers x WHERE x.prospect_id=nm.id)
  + (SELECT count(*) FROM public.accounts x WHERE x.converted_to=nm.id) AS dipakai
  FROM norm nm
  WHERE nm.n IN (SELECT n FROM norm GROUP BY n HAVING count(*)>1)
),
skor AS (
  SELECT *, CASE account_status
      WHEN 'customer' THEN 6 WHEN 'prospect' THEN 5 WHEN 'sql' THEN 4
      WHEN 'mql' THEN 3 WHEN 'lead' THEN 2 ELSE 1 END AS lvl
  FROM pakai
),
rank AS (
  SELECT *,
    row_number() OVER (PARTITION BY n ORDER BY (dipakai>0) DESC, lvl DESC, created_at ASC) AS urut,
    count(*) FILTER (WHERE dipakai>0) OVER (PARTITION BY n) AS anggota_berdata,
    max(lvl) OVER (PARTITION BY n) AS lvl_tertinggi
  FROM skor
),
aman AS (SELECT * FROM rank WHERE anggota_berdata <= 1),
naik AS (
  UPDATE public.accounts a
  SET account_status = CASE m.lvl_tertinggi
        WHEN 6 THEN 'customer' WHEN 5 THEN 'prospect' WHEN 4 THEN 'sql'
        WHEN 3 THEN 'mql' ELSE 'lead' END,
      updated_at = now()
  FROM aman m
  WHERE a.id = m.id AND m.urut = 1 AND m.lvl < m.lvl_tertinggi
  RETURNING a.id
)
UPDATE public.accounts a
SET deleted_at = now(), updated_at = now()
FROM aman m
WHERE a.id = m.id AND m.urut > 1;

COMMIT;

-- ─── VERIFIKASI (jalankan TERPISAH setelah migrasi di atas) ───────────────────
--
-- 1) Akun aktif — harus 1050.
--    SELECT count(*) AS akun_aktif FROM public.accounts WHERE deleted_at IS NULL;
--
-- 2) Baris yang dihapus batch ini — harus 39.
--    SELECT count(*) AS dihapus_batch_ini FROM public.accounts
--    WHERE deleted_at = '2026-07-22 09:24:03.904117+00';
--
-- 3) Dua akun penanda — MITRA BANGUN GRAHA MANDIRI harus 'customer' + aktif,
--    ALUN INDAH harus 'mql' + aktif.
--    SELECT name, account_status, deleted_at FROM public.accounts
--    WHERE name ILIKE '%MITRA BANGUN GRAHA MANDIRI%'
--       OR name ILIKE '%ALUN INDAH%'
--    ORDER BY name;
--
-- 4) Sisa grup duplikat ternormalisasi — harus 7 (semuanya kategori manual,
--    yaitu grup dengan lebih dari satu anggota berdata; lihat catatan 6).
--    WITH norm AS (
--      SELECT lower(regexp_replace(regexp_replace(name,'\y(PT|CV|TBK)\y\.?','','gi'),'[^a-zA-Z0-9]','','g')) AS n
--      FROM public.accounts WHERE deleted_at IS NULL
--    )
--    SELECT count(*) AS sisa_grup_duplikat
--    FROM (SELECT n FROM norm GROUP BY n HAVING count(*)>1) t;
--
-- ─── PREVIEW (WAJIB dijalankan lebih dulu kalau dedup diulang) ────────────────
-- Query ini DITURUNKAN dari CTE di atas (rantai CTE identik, statement akhir
-- diganti SELECT). BUKAN query yang dijalankan 22 Jul — disediakan supaya
-- catatan (1) punya rujukan nyata. Tinjau hasilnya baris per baris sebelum
-- menjalankan UPDATE apa pun.
--
--    WITH norm AS ( ... salin apa adanya dari blok di atas ... ),
--    pakai AS ( ... ),
--    skor AS ( ... ),
--    rank AS ( ... ),
--    aman AS (SELECT * FROM rank WHERE anggota_berdata <= 1)
--    SELECT n, id, name, account_status, dipakai, lvl, lvl_tertinggi, urut,
--           CASE WHEN urut > 1                 THEN 'AKAN DI-SOFT-DELETE'
--                WHEN lvl  < lvl_tertinggi     THEN 'AKAN DINAIKKAN lifecycle'
--                ELSE 'pemenang, tidak berubah' END AS rencana
--    FROM aman
--    ORDER BY n, urut;
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Jalankan KEDUANYA, urutan bebas. Perintah kedua mengembalikan 2 akun yang
-- lifecycle-nya dinaikkan.
--
-- Timestamp presisi itu PENTING: memakai `deleted_at IS NOT NULL` akan ikut
-- mengembalikan akun yang dihapus karena alasan lain (ada 2 baris dari 18 Jul
-- dan beberapa dari 21 Jun).
--
--    UPDATE public.accounts a
--    SET deleted_at = NULL,
--        account_status = b.account_status,
--        updated_at = now()
--    FROM accounts_dedup_backup_20260722 b
--    WHERE a.id = b.id
--      AND a.deleted_at = '2026-07-22 09:24:03.904117+00';
--
--    UPDATE public.accounts a
--    SET account_status = b.account_status, updated_at = now()
--    FROM accounts_dedup_backup_20260722 b
--    WHERE a.id = b.id AND a.account_status <> b.account_status;
