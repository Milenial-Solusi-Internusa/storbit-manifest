-- =============================================================================
-- 20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan.sql
-- (AR Tahap 3, berkas 2 dari 6)
--
-- Perluasan CHECK peran akun (account_role_mappings, 20260927000002) dengan
-- SATU peran baru: potongan_pelanggan -- dipakai record_payment (berkas 4)
-- untuk menjurnal potongan lain (TD-287, mis. biaya TTF Indomarco ~Rp 2.900).
--
-- ⛔ NAMA PERAN INI SUDAH DIKOREKSI Den dari usulan PLAN semula
-- ("beban_potongan_lain") menjadi "potongan_pelanggan" -- draft CoA grup
-- menempatkannya di akun 4-1900 "Diskon, rebate, listing fee & potongan
-- trading term" (KONTRA-PENDAPATAN, posisi normal DEBIT). Baris jurnalnya
-- (di record_payment) TETAP debit, sama seperti akun kontra-pendapatan lain.
--
-- ADITIF SEPENUHNYA terhadap fungsi: nol fungsi jurnal disentuh di berkas
-- ini (sama seperti 20260927000002 sendiri) -- CHECK diperluas, TIDAK ADA
-- baris account_role_mappings baru yang di-seed di sini. Pengisian akun
-- 4-1900 untuk SOA adalah SEED STAGING TERPISAH (di luar folder migration,
-- lihat scripts/seed/), bukan bagian migrasi yang naik ke produksi.
--
-- KONSEKUENSI kalau seeding belum dilakukan: get_mapped_account('potongan_pelanggan')
-- akan RAISE EXCEPTION dengan pesan jelas ("Peran akun [potongan_pelanggan]
-- belum dipetakan..."). record_payment (berkas 4) hanya memanggilnya kalau
-- p_potongan_lain > 0, jadi pembayaran TANPA potongan lain tetap jalan normal.
--
-- ⚠️ JANGAN ubah pemetaan/CHECK enam peran yang SUDAH ADA (piutang_usaha,
-- ppn_keluaran, pendapatan_barang, pendapatan_jasa_kirim, kas_bank,
-- pph23_dibayar_dimuka) -- berkas ini hanya MENAMBAH satu nilai.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $v0$
DECLARE v_ada boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'account_role_mappings_role_key_check'
       AND conrelid = 'public.account_role_mappings'::regclass
  ) INTO v_ada;
  IF NOT v_ada THEN
    RAISE EXCEPTION 'PALANG: account_role_mappings_role_key_check tidak ditemukan -- pastikan 20260927000002_account_role_mapping.sql sudah jalan lebih dulu di lingkungan ini.';
  END IF;
  RAISE NOTICE 'V0: constraint account_role_mappings_role_key_check ditemukan, lanjut memperluasnya.';
END
$v0$;

ALTER TABLE public.account_role_mappings
  DROP CONSTRAINT account_role_mappings_role_key_check;

ALTER TABLE public.account_role_mappings
  ADD CONSTRAINT account_role_mappings_role_key_check CHECK (role_key IN (
    'piutang_usaha',
    'ppn_keluaran',
    'pendapatan_barang',
    'pendapatan_jasa_kirim',
    'kas_bank',
    'pph23_dibayar_dimuka',
    'potongan_pelanggan'   -- BARU, AR Tahap 3 -- akun 4-1900 (kontra-pendapatan, normal debit)
  ));

COMMENT ON CONSTRAINT account_role_mappings_role_key_check ON public.account_role_mappings IS
  'Tujuh peran akun (AR Tahap 2 + AR Tahap 3). potongan_pelanggan ditambahkan 20260929000005 untuk menjurnal potongan lain pada pembayaran (TD-287) -- akun draft CoA 4-1900, kontra-pendapatan, normal debit.';

DO $v1$
DECLARE v_def text; v_baris int;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'account_role_mappings_role_key_check'
     AND conrelid = 'public.account_role_mappings'::regclass;

  IF v_def NOT LIKE '%potongan_pelanggan%' THEN
    RAISE EXCEPTION 'V1 GAGAL: potongan_pelanggan tidak ada di definisi constraint baru: %', v_def;
  END IF;
  IF v_def NOT LIKE '%piutang_usaha%' OR v_def NOT LIKE '%pph23_dibayar_dimuka%' THEN
    RAISE EXCEPTION 'V1 GAGAL: salah satu dari enam peran lama hilang dari definisi constraint: %', v_def;
  END IF;

  -- Nol baris account_role_mappings yang disentuh -- ini murni perluasan CHECK.
  SELECT count(*) INTO v_baris FROM public.account_role_mappings WHERE role_key = 'potongan_pelanggan';
  IF v_baris <> 0 THEN
    RAISE EXCEPTION 'V1 GAGAL: berkas ini seharusnya nol baris potongan_pelanggan, ternyata %. Ada seed yang jalan lebih dulu dari yang diharapkan.', v_baris;
  END IF;

  RAISE NOTICE 'V1 LOLOS: constraint kini memuat tujuh peran (enam lama + potongan_pelanggan); nol baris account_role_mappings disentuh.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- aman SELAMA belum ada baris account_role_mappings ber-role_key
-- 'potongan_pelanggan' (V1 di atas sudah memastikan nol baris saat migrasi
-- ini jalan; kalau sesudahnya sempat diisi seed, hapus baris itu DULU):
--
--   BEGIN;
--   DELETE FROM public.account_role_mappings WHERE role_key = 'potongan_pelanggan';
--   ALTER TABLE public.account_role_mappings DROP CONSTRAINT account_role_mappings_role_key_check;
--   ALTER TABLE public.account_role_mappings ADD CONSTRAINT account_role_mappings_role_key_check
--     CHECK (role_key IN ('piutang_usaha','ppn_keluaran','pendapatan_barang',
--                          'pendapatan_jasa_kirim','kas_bank','pph23_dibayar_dimuka'));
--   COMMIT;
-- =============================================================================
