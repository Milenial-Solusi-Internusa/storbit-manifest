-- =============================================================================
-- 03-scenario-2.sql -- 6 SP SIAP DITAGIH
--
-- Kirim penuh + BTB lengkap + signed_date ada, TAPI belum diinvoice.
-- Di antaranya: 2 dengan DUA Surat Jalan bertanggal tanda tangan berbeda,
-- 1 dengan TIGA Surat Jalan, 1 ber-shipping_price.
--
-- !! Dua Surat Jalan dengan signed_date berbeda itu bukan hiasan: begitu SP ini
-- diinvoice, create_invoice_for_sp memecah jurnal PER Surat Jalan dengan
-- entry_date = signed_date masing-masing. Tanpa SP seperti ini, pemecahan jurnal
-- dan proporsi ongkos kirim per Surat Jalan tidak pernah teruji.
--
-- Prasyarat: 01-stock.sql + 01b-helper.sql sudah dijalankan (berkas terpisah,
--   sesi terpisah -- keduanya sudah commit saat berkas ini mulai).
-- =============================================================================

-- Palang + impersonasi. DI SETIAP BERKAS, bukan sekali di awal rangkaian:
-- seed.sh menjalankan tiap berkas sebagai proses psql SENDIRI, jadi tiap berkas
-- adalah SESI sendiri dan tidak mewarisi GUC dari berkas sebelumnya.
-- Berpasangan dengan --single-transaction di seed.sh -- lihat README, bagian
-- "seed.sh wajib bisa jalan lewat psql".
\i 00-guards.sql

-- 9100013 : satu Surat Jalan, satu item (bentuk paling umum di produksi)
SELECT seed_uat_build('9100013','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '5d69f78d-ddb2-4517-850c-2ca3f4627896', DATE '2026-07-02',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":275,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-07-06","sign":"2026-07-08","btb":"2026-07-09","deliver":true}]'::jsonb);

-- 9100014 : DUA Surat Jalan, signed_date BERBEDA -> dua jurnal ber-entry_date beda
SELECT seed_uat_build('9100014','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '1b0a6638-d6c9-4c92-80c8-dc9bee419e0e', DATE '2026-07-10',
  '[{"p":"29122cc0-cb2b-49c5-a7c5-4ca73ef26b53","q":1400,"u":18500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":50,"disp":"2026-07-14","sign":"2026-07-16","btb":"2026-07-17","deliver":true},
            {"pct":100,"disp":"2026-07-24","sign":"2026-07-27","btb":"2026-07-28","deliver":true}]'::jsonb);

-- 9100015 : DUA Surat Jalan, signed_date berbeda, dua item
SELECT seed_uat_build('9100015','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'c685d53c-791c-4ab6-9bd6-89274539db10', DATE '2026-07-27',
  '[{"p":"a48fe3ea-182f-4239-ae14-a6bd36b27e09","q":900,"u":8900,"s":0},
    {"p":"91f42e88-de59-49ef-b894-ab166819834e","q":1500,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":40,"disp":"2026-07-31","sign":"2026-08-03","btb":"2026-08-04","deliver":true},
            {"pct":100,"disp":"2026-08-12","sign":"2026-08-14","btb":"2026-08-15","deliver":true}]'::jsonb);

-- 9100016 : TIGA Surat Jalan -- toleransi pembulatan PPN terberat (3 x Rp1)
SELECT seed_uat_build('9100016','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  'eb187e7b-6cb2-4b32-b56d-5b3116b473a9', DATE '2026-08-04',
  '[{"p":"9777af85-08de-48fc-9a11-ad53d2f702a5","q":1830,"u":27500,"s":0}]'::jsonb,
  'LEGS', '[{"pct":34,"disp":"2026-08-08","sign":"2026-08-10","btb":"2026-08-11","deliver":true},
            {"pct":67,"disp":"2026-08-18","sign":"2026-08-20","btb":"2026-08-21","deliver":true},
            {"pct":100,"disp":"2026-08-27","sign":"2026-08-29","btb":"2026-08-31","deliver":true}]'::jsonb);

-- 9100017 : ber-shipping_price -> memicu akun 4-1100 dan proporsi ongkos per SJ
SELECT seed_uat_build('9100017','a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  '4d8aa532-036f-4746-a7ef-c9e39dec365e', DATE '2026-08-19',
  '[{"p":"6faf3425-d43d-4bd2-b47a-8ec3c5ac2ac3","q":60,"u":75000,"s":1250000}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-08-24","sign":"2026-08-26","btb":"2026-08-27","deliver":true}]'::jsonb);

-- 9100018 : nilai kecil (dekat p10 Rp1,2jt), customer non-Indomarco
SELECT seed_uat_build('9100018','7fa6db6c-e356-44aa-be58-1c40ffaeeed8',
  'c55027de-1f78-4624-8712-73aaf6b71f2b', DATE '2026-09-02',
  '[{"p":"91f42e88-de59-49ef-b894-ab166819834e","q":290,"u":4200,"s":0}]'::jsonb,
  'LEGS', '[{"pct":100,"disp":"2026-09-05","sign":"2026-09-08","btb":"2026-09-09","deliver":true}]'::jsonb);
