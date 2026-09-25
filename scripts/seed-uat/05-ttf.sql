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
-- !! BATAS STRUKTURAL: ember umur "di atas 90 hari" TIDAK TERJANGKAU
--
-- Rencana meminta sebaran 2/2/2/2 di empat ember umur (0-30, 31-60, 61-90,
-- di atas 90 hari). Ember keempat mustahil diisi dengan data yang masuk akal:
--
--   * sp_date dibatasi Juli-September 2026 (spesifikasi skenario).
--   * invoice_date = MAX(signed_date), dan signed_date paling awal yang bisa
--     ada = 2026-07-07 (SP 9100019, sp_date 2026-07-01).
--   * Umur TTF dihitung dari hari ini (25 Sep 2026), jadi umur maksimum yang
--     bisa dicapai = 80 hari.
--   * TTF terbit SESUDAH invoice. Menaruh tanggal_ttf sebelum 2026-06-27
--     (syarat umur > 90) berarti TTF terbit sebelum SP-nya ada.
--
-- Jadi sebarannya dibuat 2 / 2 / 4, bukan 2 / 2 / 2 / 2, dan V7 menilai angka
-- itu. Kalau ember di atas 90 hari memang dibutuhkan, yang harus berubah adalah
-- RENTANG TANGGAL SP (sebagian digeser ke Mei-Juni 2026) -- itu keputusan Den,
-- bukan sesuatu yang pantas diakali di sini dengan tanggal TTF yang mendahului
-- SP-nya.
--
-- !! Ember umur bergeser sendiri seiring waktu karena dihitung dari CURRENT_DATE.
-- Angka 2/2/4 benar pada 25 Sep 2026. Sebulan kemudian isinya bergeser ke ember
-- yang lebih tua tanpa ada yang berubah di data. Itu sifat umur, bukan cacat
-- seed -- tapi jangan membaca V7 sebagai invarian abadi.
-- =============================================================================

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
    {"sp":"9100019","ttf":"2026-07-12"},
    {"sp":"9100024","ttf":"2026-07-14"},
    {"sp":"9100028","ttf":"2026-07-15"},
    {"sp":"9100020","ttf":"2026-07-20"}
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
