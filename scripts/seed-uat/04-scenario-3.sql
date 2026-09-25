-- =============================================================================
-- 04-scenario-3.sql -- 22 SP SUDAH DIINVOICE
--   5 issued (2 di atas Rp5jt) - 4 submitted - 4 partial - 8 paid - 1 void
--
-- Tiap SP dibangun dulu sampai siap-tagih (seed_uat_build), lalu ditagih
-- (seed_uat_bill). Keduanya idempoten, jadi berkas ini aman dijalankan ulang.
--
-- invoice_date SENGAJA dibiarkan NULL di seluruh berkas ini kecuali satu SP:
-- create_invoice_for_sp mengambil MAX(signed_date) kalau parameternya NULL, dan
-- itulah perilaku yang dipakai aplikasi. Menuliskannya tangan akan menguji jalur
-- yang tidak pernah dipakai orang. 9100040 satu-satunya yang memaksa tanggal,
-- supaya jalur parameter eksplisit juga punya bahan uji.
--
-- payment_date = invoice_date + sebaran ber-median 48 hari (pola produksi).
--
-- Prasyarat: 00-guards.sql + 01-stock.sql + 01b-helper.sql di sesi yang SAMA.
-- =============================================================================

-- ---------------------------------------------------------------- 5 x ISSUED
-- 9100019, 9100020 di atas Rp5jt; tiga sisanya kecil.
-- !! 9100019 dan 9100020 SENGAJA di MEI dan JUNI 2026, di luar rentang
-- Juli-September skenario lainnya. Sebabnya tunggal: ember umur TTF "di atas 90
-- hari" hanya terjangkau kalau tanggal_ttf sebelum 2026-06-27, dan TTF tidak
-- boleh mendahului invoice-nya. Menggeser SP-nya adalah satu-satunya cara yang
-- tidak memalsukan urutan dokumen. Keduanya dipilih karena BELUM LUNAS (status
-- issued), jadi ia memang bahan uji AR Aging.
SELECT seed_uat_build('9100019','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-05-11',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":1820,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-05-14","sign":"2026-05-18","btb":"2026-05-19","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100019','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'ISSUED');

SELECT seed_uat_build('9100020','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-06-08',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":5580,"u":8900,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-06-11","sign":"2026-06-15","btb":"2026-06-16","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100020','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'ISSUED');

SELECT seed_uat_build('9100021','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-08-05',
  '[{"p":"91f42e88-de59-49ef-b894-ab166819834e","q":290,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-08","sign":"2026-08-11","btb":"2026-08-12","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100021','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'ISSUED');

SELECT seed_uat_build('9100022','92f48635-eb57-447a-940d-b5f9d8ac0963',
  'eb187e7b-6cb2-4b32-b56d-5b3116b473a9', DATE '2026-08-25',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":110,"u":18500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-28","sign":"2026-08-31","btb":"2026-09-01","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100022','92f48635-eb57-447a-940d-b5f9d8ac0963', NULL, 'ISSUED');

SELECT seed_uat_build('9100023','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '4d8aa532-036f-4746-a7ef-c9e39dec365e', DATE '2026-09-03',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":16,"u":75000,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-09-06","sign":"2026-09-09","btb":"2026-09-10","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100023','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'ISSUED');

-- ------------------------------------------------------------- 4 x SUBMITTED
SELECT seed_uat_build('9100024','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-07-03',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":275,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-07","sign":"2026-07-09","btb":"2026-07-10","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100024','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'SUBMITTED');

SELECT seed_uat_build('9100025','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c55027de-1f78-4624-8712-73aaf6b71f2b', DATE '2026-07-16',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":640,"u":18500,"s":0},
    {"p":"91f42e88-de59-49ef-b894-ab166819834e","q":420,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-20","sign":"2026-07-22","btb":"2026-07-23","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100025','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'SUBMITTED');

-- dua Surat Jalan -> dua jurnal penerbitan, tetap satu invoice
SELECT seed_uat_build('9100026','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-08-07',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":1100,"u":8900,"s":0}]'::jsonb,
  'LEGS', '[{"pct":45,"disp":"2026-08-11","sign":"2026-08-13","btb":"2026-08-14","deliver":true},
            {"pct":100,"disp":"2026-08-21","sign":"2026-08-24","btb":"2026-08-25","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100026','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'SUBMITTED');

SELECT seed_uat_build('9100027','4c3db412-c5af-419d-9e81-f0cf57cf60f4',
  'eb187e7b-6cb2-4b32-b56d-5b3116b473a9', DATE '2026-09-05',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":48,"u":75000,"s":320000}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-09-08","sign":"2026-09-11","btb":"2026-09-12","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100027','4c3db412-c5af-419d-9e81-f0cf57cf60f4', NULL, 'SUBMITTED');

-- --------------------------------------------------------------- 4 x PARTIAL
SELECT seed_uat_build('9100028','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-07-05',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":950,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-08","sign":"2026-07-10","btb":"2026-07-11","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100028','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PARTIAL',
  '[{"frac":0.35,"date":"2026-08-26"}]'::jsonb);

SELECT seed_uat_build('9100029','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-07-13',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":1500,"u":18500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-16","sign":"2026-07-19","btb":"2026-07-20","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100029','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PARTIAL',
  '[{"frac":0.5,"date":"2026-09-04"}]'::jsonb);

-- partial dua kali bayar, masih belum lunas
SELECT seed_uat_build('9100030','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '4d8aa532-036f-4746-a7ef-c9e39dec365e', DATE '2026-07-23',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":2400,"u":8900,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-27","sign":"2026-07-29","btb":"2026-07-30","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100030','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PARTIAL',
  '[{"frac":0.3,"date":"2026-09-01"},{"frac":0.65,"date":"2026-09-18"}]'::jsonb);

SELECT seed_uat_build('9100031','7fa6db6c-e356-44aa-be58-1c40ffaeeed8',
  'c55027de-1f78-4624-8712-73aaf6b71f2b', DATE '2026-08-02',
  '[{"p":"91f42e88-de59-49ef-b894-ab166819834e","q":780,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-05","sign":"2026-08-08","btb":"2026-08-09","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100031','7fa6db6c-e356-44aa-be58-1c40ffaeeed8', NULL, 'PARTIAL',
  '[{"frac":0.4,"date":"2026-09-20"}]'::jsonb);

-- ------------------------------------------------------------------ 8 x PAID
-- 69% sekali bayar (6), 31% dua kali (2). Dua di antaranya ber-PPh 23.
SELECT seed_uat_build('9100032','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-07-04',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":275,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-07","sign":"2026-07-10","btb":"2026-07-11","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100032','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":1,"date":"2026-08-27"}]'::jsonb);

SELECT seed_uat_build('9100033','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-07-07',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":420,"u":18500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-10","sign":"2026-07-13","btb":"2026-07-14","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100033','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":1,"date":"2026-08-30"}]'::jsonb);

-- PPh 23 = 2% dari DPP, amount dikurangi sebesar itu -> settled tetap = total
SELECT seed_uat_build('9100034','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-07-11',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":1200,"u":8900,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-14","sign":"2026-07-17","btb":"2026-07-18","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100034','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":1,"date":"2026-09-02","pph23":true}]'::jsonb);

SELECT seed_uat_build('9100035','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'eb187e7b-6cb2-4b32-b56d-5b3116b473a9', DATE '2026-07-18',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":34,"u":75000,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-21","sign":"2026-07-24","btb":"2026-07-25","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100035','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":1,"date":"2026-09-09","pph23":true}]'::jsonb);

-- dua kali bayar, lunas di yang kedua
SELECT seed_uat_build('9100036','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '4d8aa532-036f-4746-a7ef-c9e39dec365e', DATE '2026-07-21',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":880,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-24","sign":"2026-07-27","btb":"2026-07-28","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100036','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":0.45,"date":"2026-09-05"},{"frac":1,"date":"2026-09-19"}]'::jsonb);

SELECT seed_uat_build('9100037','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c55027de-1f78-4624-8712-73aaf6b71f2b', DATE '2026-07-29',
  '[{"p":"91f42e88-de59-49ef-b894-ab166819834e","q":1600,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-01","sign":"2026-08-04","btb":"2026-08-05","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100037','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":0.6,"date":"2026-09-12"},{"frac":1,"date":"2026-09-22"}]'::jsonb);

-- dua Surat Jalan + ongkos kirim, lunas: menguji proporsi ongkos per SJ
SELECT seed_uat_build('9100038','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-08-01',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":1300,"u":18500,"s":900000}]'::jsonb,
  'LEGS', '[{"pct":50,"disp":"2026-08-05","sign":"2026-08-07","btb":"2026-08-08","deliver":true},
            {"pct":100,"disp":"2026-08-15","sign":"2026-08-18","btb":"2026-08-19","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100038','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', NULL, 'PAID',
  '[{"frac":1,"date":"2026-09-16"}]'::jsonb);

SELECT seed_uat_build('9100039','92f48635-eb57-447a-940d-b5f9d8ac0963',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-08-10',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":660,"u":8900,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-13","sign":"2026-08-16","btb":"2026-08-17","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100039','92f48635-eb57-447a-940d-b5f9d8ac0963', NULL, 'PAID',
  '[{"frac":1,"date":"2026-09-21"}]'::jsonb);

-- ------------------------------------------------------------------ 1 x VOID
-- invoice_date DIPAKSA di sini (satu-satunya) supaya jalur parameter eksplisit
-- create_invoice_for_sp juga punya bahan uji, bukan hanya jalur MAX(signed_date).
SELECT seed_uat_build('9100040','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-08-14',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":22,"u":75000,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-18","sign":"2026-08-20","btb":"2026-08-21","deliver":true}]'::jsonb);
SELECT seed_uat_bill('9100040','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661', DATE '2026-08-22', 'VOID');
