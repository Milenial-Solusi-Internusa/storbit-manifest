-- =============================================================================
-- 05-ttf.sql -- TTF untuk 8 dari 13 invoice belum lunas
--
-- Invoice belum lunas = 13 (5 issued + 4 submitted + 4 partial).
-- 8 dapat TTF lewat RPC mark_ttf_received, lalu tanggal_ttf/tanggal_menerima
-- digeser supaya umurnya tersebar. 5 sisanya SENGAJA tanpa TTF -> menguji
-- kelompok "Belum TTF" di AR Aging.
--
-- mark_ttf_received mengisi tanggal_ttf DAN tanggal_menerima dengan CURRENT_DATE
-- (dibaca dari pg_proc), jadi keduanya wajib digeser sesudahnya.
--
-- =============================================================================
-- Sebaran umur: 2 / 2 / 2 / 2 di empat ember (0-30, 31-60, 61-90, di atas 90).
--
-- !! Ember "di atas 90 hari" menuntut tanggal_ttf sebelum 2026-06-27, dan TTF
-- tidak boleh mendahului invoice-nya. Karena itu DUA SP belum-lunas (9100019,
-- 9100020) digeser ke Mei dan Juni 2026 di 04-scenario-3.sql -- bukan tanggal
-- TTF-nya yang dipaksa mendahului SP.
--
-- Versi pertama berkas ini memakai sebaran 2/2/4 karena seluruh sp_date masih
-- dibatasi Juli-September, yang membuat umur TTF maksimum 80 hari. Batas itu
-- nyata; yang berubah adalah rentang tanggal SP-nya, bukan cara menghitung umur.
--
-- !! Ember dihitung dari CURRENT_DATE, jadi angkanya BERGESER seiring waktu.
-- Sebaran 2/2/2/2 benar pada 25 September 2026. Sebulan kemudian isinya pindah
-- ke ember yang lebih tua tanpa ada yang berubah di data -- itu sifat umur,
-- bukan cacat seed. Jangan membaca V7 sebagai invarian abadi.
--
-- mark_ttf_received mengisi tanggal_ttf DAN tanggal_menerima dengan CURRENT_DATE
-- (dibaca dari pg_proc), jadi keduanya wajib digeser sesudahnya.
-- =============================================================================

-- Palang + impersonasi. DI SETIAP BERKAS, bukan sekali di awal rangkaian:
-- seed.sh menjalankan tiap berkas sebagai proses psql SENDIRI, jadi tiap berkas
-- adalah SESI sendiri dan tidak mewarisi GUC dari berkas sebelumnya.
-- Berpasangan dengan --single-transaction di seed.sh -- lihat README, bagian
-- "seed.sh wajib bisa jalan lewat psql".
\i 00-guards.sql

DO $$
DECLARE
  v_rec record;
  v_ttf uuid;
  v_n   int := 0;
  -- (sp_no, tanggal_ttf). Sengaja daftar eksplisit, bukan hitungan otomatis:
  -- pemilihan invoice mana yang dapat TTF adalah keputusan skenario, dan kalau
  -- diotomatiskan ia akan berubah diam-diam setiap katalog SP disentuh.
  v_peta jsonb := '[
    {"sp":"9100023","ttf":"2026-09-14"},
    {"sp":"9100027","ttf":"2026-09-16"},
    {"sp":"9100021","ttf":"2026-08-18"},
    {"sp":"9100031","ttf":"2026-08-14"},
    {"sp":"9100024","ttf":"2026-07-14"},
    {"sp":"9100028","ttf":"2026-07-15"},
    {"sp":"9100019","ttf":"2026-05-22"},
    {"sp":"9100020","ttf":"2026-06-19"}
  ]'::jsonb;
  v_it jsonb;
BEGIN
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_peta) LOOP
    SELECT i.id, o.sp_no INTO v_rec
      FROM sp_invoices i
      JOIN sp_orders o ON o.id = i.sp_order_id
     WHERE o.sp_no = v_it->>'sp' AND i.status <> 'void' AND i.deleted_at IS NULL
     LIMIT 1;

    IF v_rec.id IS NULL THEN
      RAISE EXCEPTION '05-ttf: invoice untuk SP % tidak ditemukan - jalankan 04-scenario-3.sql dulu', v_it->>'sp';
    END IF;

    v_ttf := mark_ttf_received(v_rec.id, 'Petugas UAT',
               'TTF-DUMMY-UAT-' || (v_it->>'sp'), 'DATA DUMMY UAT');

    UPDATE ar_ttfs
       SET tanggal_ttf      = (v_it->>'ttf')::date,
           tanggal_menerima = (v_it->>'ttf')::date + 2,
           created_at       = (v_it->>'ttf')::timestamptz + interval '9 hours',
           updated_at       = (v_it->>'ttf')::timestamptz + interval '9 hours'
     WHERE id = v_ttf;

    v_n := v_n + 1;
  END LOOP;

  IF v_n <> 8 THEN
    RAISE EXCEPTION '05-ttf: seharusnya 8 TTF, terbentuk %', v_n;
  END IF;
  RAISE NOTICE '05-ttf: % TTF dibuat', v_n;
END $$;
