-- =============================================================================
-- 20260929000006_ar_tahap3_sp_payments_potongan_kolom.sql   (AR Tahap 3, berkas 3 dari 6)
--
-- Dua kolom baru di sp_payments untuk TD-287 (potongan lain, mis. biaya TTF
-- Indomarco ~Rp 2.900 per TTF, dipotong saat membayar per BTB):
--
--   potongan_lain        numeric(18,2) NOT NULL DEFAULT 0, CHECK >= 0
--   potongan_keterangan  text -- WAJIB diisi kalau potongan_lain > 0
--                              (ditegakkan di record_payment DAN di form FE,
--                              bukan di sini -- CHECK antar-kolom yang
--                              menyalahkan salah satu sisi kalau formnya
--                              berubah bukan pola yang dipakai tabel ini)
--
-- DEFAULT 0 -- nol dampak ke baris lama: seluruh pembayaran yang sudah
-- tercatat otomatis punya potongan_lain = 0, potongan_keterangan = NULL.
--
-- ⛔ SENGAJA NOL GRANT UPDATE tambahan ke authenticated untuk kedua kolom --
-- pola yang SAMA dengan amount/pph (bandingkan reference/bukti_potong_url/
-- bukti_potong_no yang MEMANG dapat GRANT UPDATE kolom, sejak 20260817000001).
-- Nominal potongan hanya boleh masuk lewat record_payment (berkas 4).
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $v0$
DECLARE v_ada_lama boolean; v_ada_baru boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_payments' AND column_name='amount'
  ) INTO v_ada_lama;
  IF NOT v_ada_lama THEN
    RAISE EXCEPTION 'PALANG: kolom amount tidak ditemukan di sp_payments -- tabel ini seharusnya sudah ada sejak 20260817000001.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='sp_payments' AND column_name='potongan_lain'
  ) INTO v_ada_baru;
  IF v_ada_baru THEN
    RAISE EXCEPTION 'PALANG: sp_payments.potongan_lain SUDAH ADA -- migrasi ini sudah pernah jalan di lingkungan ini, jangan diulang.';
  END IF;

  RAISE NOTICE 'V0 LOLOS: sp_payments ada, potongan_lain belum ada -- aman melanjutkan.';
END
$v0$;

ALTER TABLE public.sp_payments
  ADD COLUMN potongan_lain numeric(18,2) NOT NULL DEFAULT 0
    CONSTRAINT sp_payments_potongan_lain_check CHECK (potongan_lain >= 0),
  ADD COLUMN potongan_keterangan text;

COMMENT ON COLUMN public.sp_payments.potongan_lain IS
  'Potongan lain di luar kas & PPh 23 (mis. biaya TTF Indomarco ~Rp 2.900/TTF, TD-287). Dijurnal sebagai debit ke peran akun potongan_pelanggan (akun draft CoA 4-1900, kontra-pendapatan). Hanya bisa diisi lewat RPC record_payment -- nol GRANT UPDATE langsung ke authenticated. AR Tahap 3, 20260929000006.';

COMMENT ON COLUMN public.sp_payments.potongan_keterangan IS
  'Keterangan potongan_lain. WAJIB diisi kalau potongan_lain > 0 -- ditegakkan di record_payment (RPC) dan di form pembayaran (FE), bukan lewat CHECK kolom. AR Tahap 3, 20260929000006.';

DO $v1$
DECLARE v_kolom int; v_default_bukan_nol int;
BEGIN
  SELECT count(*) INTO v_kolom FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sp_payments'
     AND column_name IN ('potongan_lain','potongan_keterangan');
  IF v_kolom <> 2 THEN
    RAISE EXCEPTION 'V1 GAGAL: seharusnya 2 kolom baru, ditemukan %.', v_kolom;
  END IF;

  SELECT count(*) INTO v_default_bukan_nol FROM public.sp_payments WHERE potongan_lain <> 0;
  IF v_default_bukan_nol <> 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: % baris LAMA punya potongan_lain bukan nol -- seharusnya DEFAULT 0 berlaku untuk semua baris lama.', v_default_bukan_nol;
  END IF;

  RAISE NOTICE 'V1 LOLOS: 2 kolom baru ada, seluruh baris lama potongan_lain = 0.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- hanya aman SELAMA record_payment (berkas 4) belum jalan dengan
-- potongan_lain > 0 di baris mana pun (kalau sudah, DROP COLUMN membuang
-- angka yang sudah dipakai menghitung status invoice -- cek dulu):
--
--   SELECT count(*) FROM sp_payments WHERE potongan_lain > 0;  -- harus 0
--   ALTER TABLE public.sp_payments DROP COLUMN IF EXISTS potongan_lain;
--   ALTER TABLE public.sp_payments DROP COLUMN IF EXISTS potongan_keterangan;
-- =============================================================================
