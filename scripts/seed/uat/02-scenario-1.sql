-- =============================================================================
-- 02-scenario-1.sql -- 12 SP BELUM DITAGIH
--
-- Prasyarat: 01-stock.sql + 01b-helper.sql sudah dijalankan (berkas terpisah,
--   sesi terpisah -- keduanya sudah commit saat berkas ini mulai).
--
-- !! Status akhir SP TIDAK dipaksa. Ia diturunkan sp_recompute_status dari
-- keadaan nyata (qty terkirim, status Surat Jalan, ada/tidak BTB). Kalau hasil
-- akhirnya tidak cocok dengan tabel di bawah, BERHENTI dan laporkan -- jangan
-- UPDATE sp_orders.status langsung (aturan R2).
--
-- Peta id master (staging, diukur 25 Sep 2026):
--   customer  Indomarco   a18fad3c-75ee-4fc6-b3d2-5c5dfa810661
--             Indogrosir  92f48635-eb57-447a-940d-b5f9d8ac0963
--             CK          4c3db412-c5af-419d-9e81-f0cf57cf60f4
--             GenOrder    7fa6db6c-e356-44aa-be58-1c40ffaeeed8
--   produk    LOYANG      9777af85-08de-48fc-9a11-ad53d2f702a5
--             FLAT90      29122cc0-cb2b-49c5-a7c5-4ca73ef26b53
--             CURVED90    a48fe3ea-182f-4239-ae14-a6bd36b27e09
--             TROLLY      a8b5bde4-4617-4b0b-b15e-a9718cb0a01f   <-- STOK NOL, sengaja
--             POPA6       6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3
--             RAILCARD    91f42e88-de59-49ef-b894-ab166819834e
-- =============================================================================

-- Palang + impersonasi. DI SETIAP BERKAS, bukan sekali di awal rangkaian:
-- seed.sh menjalankan tiap berkas sebagai proses psql SENDIRI, jadi tiap berkas
-- adalah SESI sendiri dan tidak mewarisi GUC dari berkas sebelumnya.
-- Berpasangan dengan --single-transaction di seed.sh -- lihat README, bagian
-- "seed.sh wajib bisa jalan lewat psql".
\i 00-guards.sql

-- 9100001, 9100002 : MENUNGGU_KONFIRMASI_DC
--   Kirim PENUH (pct 100) tapi Surat Jalan dibiarkan in_transit (deliver=false).
--   Bedanya dengan 9100006 di bawah HANYA kirim penuh vs sebagian -- itulah yang
--   memisahkan MENUNGGU_KONFIRMASI_DC dari DIKIRIM (jawaban Q3).
SELECT seed_uat_build('9100001','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-07-06',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":275,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-09","sign":null,"btb":null,"deliver":false}]'::jsonb);

SELECT seed_uat_build('9100002','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-07-14',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":1200,"u":18500,"s":0},
    {"p":"91f42e88-de59-49ef-b894-ab166819834e","q":800,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-17","sign":null,"btb":null,"deliver":false}]'::jsonb);

-- 9100003, 9100004 : CONFIRMED (berhenti di langkah 2)
SELECT seed_uat_build('9100003','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-08-03',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":16,"u":75000,"s":0}]'::jsonb,
  'CONFIRMED', '[]'::jsonb);

SELECT seed_uat_build('9100004','92f48635-eb57-447a-940d-b5f9d8ac0963',
  'eb187e7b-6cb2-4b32-b56d-5b3116b473a9', DATE '2026-08-11',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":5580,"u":8900,"s":450000}]'::jsonb,
  'CONFIRMED', '[]'::jsonb);

-- 9100005 : MENUNGGU_STOK
--   Produknya TROLLY HAND yang sengaja TIDAK ikut di-receipt (01-stock.sql),
--   jadi stoknya nol. Statusnya lahir dari sp_recompute_status, bukan dipaksa.
SELECT seed_uat_build('9100005','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c55027de-1f78-4624-8712-73aaf6b71f2b', DATE '2026-08-17',
  '[{"p":"a8b5bde4-4617-4b0b-b15e-a9718cb0a01f","q":120,"u":1850000,"s":0}]'::jsonb,
  'CONFIRMED', '[]'::jsonb);

-- 9100006, 9100007 : PICKING (picking dibuat, qty separuh, tidak diselesaikan)
SELECT seed_uat_build('9100006','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '4d8aa532-036f-4746-a7ef-c9e39dec365e', DATE '2026-08-24',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":430,"u":27500,"s":0}]'::jsonb,
  'PICKING', '[]'::jsonb);

SELECT seed_uat_build('9100007','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-09-01',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":95,"u":18500,"s":0}]'::jsonb,
  'PICKING', '[]'::jsonb);

-- 9100008 : DIKIRIM -- Surat Jalan in_transit, kirim SEBAGIAN (pct 60)
SELECT seed_uat_build('9100008','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-09-04',
  '[{"p":"91f42e88-de59-49ef-b894-ab166819834e","q":2400,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":60,"disp":"2026-09-08","sign":null,"btb":null,"deliver":false}]'::jsonb);

-- 9100009, 9100010 : TERKIRIM_PENUH tanpa BTB
--   !! SENGAJA TIDAK DIINVOICE (catatan tambahan 1). Sesudah AR Tahap 1, guard
--   BTB di create_invoice_for_sp akan menolaknya; seed ini harus tetap lolos di
--   versi itu, jadi jangan menambahkan invoice untuk kedua SP ini nanti.
SELECT seed_uat_build('9100009','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-07-20',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":640,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-23","sign":"2026-07-25","btb":null,"deliver":true}]'::jsonb);

SELECT seed_uat_build('9100010','4c3db412-c5af-419d-9e81-f0cf57cf60f4',
  'eb187e7b-6cb2-4b32-b56d-5b3116b473a9', DATE '2026-08-06',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":34,"u":75000,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-10","sign":"2026-08-12","btb":null,"deliver":true}]'::jsonb);

-- 9100011 : SJ pertama delivered penuh porsinya, SJ KEDUA masih in_transit
SELECT seed_uat_build('9100011','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '4d8aa532-036f-4746-a7ef-c9e39dec365e', DATE '2026-08-13',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":1800,"u":8900,"s":0}]'::jsonb,
  'LEGS', '[{"pct":55,"disp":"2026-08-17","sign":"2026-08-19","btb":"2026-08-20","deliver":true},
            {"pct":100,"disp":"2026-08-28","sign":null,"btb":null,"deliver":false}]'::jsonb);

-- 9100012 : SJ delivered TANPA signed_date
--   Lewat overload LAMA mark_delivery_delivered(uuid) -- TD-263. Satu-satunya
--   jalan mencapai keadaan ini, dan sekaligus bahan uji AR Aging untuk Surat
--   Jalan yang tak bisa diinvoice karena tanggal tanda tangannya hilang.
SELECT seed_uat_build('9100012','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c55027de-1f78-4624-8712-73aaf6b71f2b', DATE '2026-09-07',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":210,"u":18500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-09-10","sign":null,"btb":null,"deliver":true}]'::jsonb);
