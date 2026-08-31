-- 20260831000002_backfill_delivery_destination_active.sql
--
-- Backfill `delivery_notes.destination_address` dari dc_master.alamat, HANYA
-- untuk Surat Jalan yang MASIH AKTIF dan alamatnya belum pernah disentuh tangan.
--
-- ⚠️ JANGAN JALANKAN FILE INI SEKALIGUS.
--    Jalankan BAGIAN 1 (SELECT) dulu, review hasilnya, baru BAGIAN 2 (UPDATE).
--    Prasyarat: migrasi 20260831000001 sudah dijalankan lebih dulu.
--
-- Cakupan yang DISENGAJA (kondisi per 31 Agu 2026, total 85 Surat Jalan):
--   ✅ IKUT  — status draft/in_transit yang destination_address-nya NULL atau
--              persis sama dengan accounts.address (hasil seed HQ yang lama).
--              Harapannya PERSIS 5 baris, seluruhnya berstatus in_transit
--              (1 NULL + 4 beralamat HQ).
--   ❌ TIDAK — 1 Surat Jalan draft yang alamatnya pernah diedit manual. Isinya
--              bisa jadi alamat benar yang diketik orang; jangan ditimpa mesin.
--   ❌ TIDAK — 79 Surat Jalan berstatus delivered. Kertasnya sudah dicetak dan
--              barangnya sudah jalan; menulis ulang alamatnya membuat catatan
--              di database tak lagi cocok dengan dokumen yang beredar.
--   ❌ TIDAK — DC yang belum punya alamat (dibiarkan NULL, bukan diisi HQ).

-- ────────────────────────────────────────────────────────────────────────────
-- BAGIAN 1 — DRY RUN. Jalankan ini DULU dan periksa hasilnya.
-- Harus mengembalikan 5 baris. Kalau jumlahnya beda, STOP dan periksa dulu:
-- ada Surat Jalan yang berpindah status sejak audit 31 Agu 2026.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  d.id,
  d.do_no,
  d.status,
  d.customer_name,
  dc.nama                        AS dc_tujuan,
  d.destination_address          AS alamat_lama,
  NULLIF(btrim(dc.alamat), '')   AS alamat_baru,
  CASE
    WHEN d.destination_address IS NULL THEN 'kosong'
    ELSE 'sama dengan alamat HQ customer'
  END                            AS alasan_ikut
FROM delivery_notes d
JOIN sp_orders  so ON so.id = d.sp_order_id
JOIN dc_master  dc ON dc.id = so.dc_id
LEFT JOIN accounts a ON a.id = d.customer_id
WHERE d.status IN ('draft', 'in_transit')
  AND NULLIF(btrim(dc.alamat), '') IS NOT NULL
  AND (
        d.destination_address IS NULL
     OR (a.address IS NOT NULL AND d.destination_address = a.address)
      )
ORDER BY d.do_no;

-- ────────────────────────────────────────────────────────────────────────────
-- BAGIAN 2 — UPDATE. Jalankan HANYA setelah hasil BAGIAN 1 direview dan benar.
-- Predikatnya identik dengan BAGIAN 1, jadi baris yang tersentuh persis sama.
-- Dibungkus transaksi: cek jumlah baris yang terpengaruh sebelum COMMIT.
-- ────────────────────────────────────────────────────────────────────────────
-- BEGIN;

UPDATE delivery_notes d
   SET destination_address = NULLIF(btrim(dc.alamat), ''),
       updated_at          = now()
  FROM sp_orders so
  JOIN dc_master dc ON dc.id = so.dc_id
 WHERE so.id = d.sp_order_id
   AND d.status IN ('draft', 'in_transit')
   AND NULLIF(btrim(dc.alamat), '') IS NOT NULL
   AND (
         d.destination_address IS NULL
      OR d.destination_address = (SELECT a.address FROM accounts a WHERE a.id = d.customer_id)
       );

-- COMMIT;   -- jalankan setelah memastikan "UPDATE 5"
-- ROLLBACK; -- kalau jumlahnya tidak 5
