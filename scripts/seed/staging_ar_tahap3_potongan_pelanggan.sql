-- scripts/seed/staging_ar_tahap3_potongan_pelanggan.sql
--
-- SEED KHUSUS STAGING -- JANGAN dijalankan di production, dan JANGAN masuk
-- folder supabase/migrations/. Isi peran akun account_role_mappings baru
-- (potongan_pelanggan, AR Tahap 3 / TD-287) untuk entitas SOA, mengikuti
-- pola seed yang SAMA dengan enam peran lama (20260927000002_account_role_mapping.sql
-- blok SEED): cari akun lewat KODE di chart_of_accounts milik entitas, lalu
-- INSERT ... ON CONFLICT (company_id, role_key) DO NOTHING ke
-- account_role_mappings.
--
-- PRASYARAT: 20260929000005_ar_tahap3_account_role_mapping_potongan_pelanggan.sql
-- (perluasan CHECK role_key) SUDAH jalan di lingkungan ini -- skrip ini
-- menolak jalan kalau belum.
--
-- AKUN 4-1900: per koreksi Den, draft CoA grup menempatkan potongan_pelanggan
-- di akun 4-1900 "Diskon, rebate, listing fee & potongan trading term"
-- (KONTRA-PENDAPATAN, posisi normal DEBIT). Kalau akun ini BELUM ada di
-- chart_of_accounts staging untuk SOA, skrip ini MENAMBAHKANNYA -- klasifikasi
-- (account_type='revenue', normal_balance='debit', level=1, is_header=false)
-- adalah pilihan MINIMAL yang konsisten dengan CHECK constraint tabel dan
-- dengan deskripsi Den; BELUM tentu final secara akuntansi (parent_id,
-- level, dan kode persisnya menunggu draft CoA final -- lihat TD-276: layar
-- pemetaan akun sengaja ditunda sampai migrasi CoA final).
--
-- IDEMPOTEN: aman dijalankan berulang. ON CONFLICT (company_id, code) untuk
-- akun, ON CONFLICT (company_id, role_key) untuk pemetaan.
--
-- ASCII murni. Jangan tambahkan karakter non-ASCII (bash 3.2 + locale UTF-8,
-- 02_RULES_GOVERNANCE.md SS2).

DO $palang$
BEGIN
  -- Sinyal lingkungan: notify_sp_milestone no-op HANYA ada di staging
  -- (20260925000003, doc 12 butir 10). Kalau badannya MASIH memanggil
  -- Edge Function produksi, ini BUKAN staging -- pola guard SAMA dengan
  -- scripts/seed/uat/00-guards.sql.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'notify_sp_milestone'
       AND (p.prosrc LIKE '%net.http%' OR p.prosrc LIKE '%untmpqceexwxzuhlmyrg%')
  ) THEN
    RAISE EXCEPTION 'PALANG: notify_sp_milestone BUKAN versi no-op staging -- skrip ini MENOLAK jalan di luar staging.';
  END IF;

  -- Prasyarat: CHECK role_key sudah memuat potongan_pelanggan.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'account_role_mappings_role_key_check'
       AND conrelid = 'public.account_role_mappings'::regclass
       AND pg_get_constraintdef(oid) LIKE '%potongan_pelanggan%'
  ) THEN
    RAISE EXCEPTION 'PALANG: account_role_mappings_role_key_check belum memuat potongan_pelanggan -- jalankan 20260929000005 lebih dulu.';
  END IF;

  RAISE NOTICE 'PALANG LOLOS: staging terkonfirmasi (notify_sp_milestone no-op), CHECK role_key sudah memuat potongan_pelanggan.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- 1. Akun 4-1900 untuk SOA -- tambahkan HANYA kalau belum ada.
-- ---------------------------------------------------------------------------
DO $akun$
DECLARE
  v_soa   CONSTANT uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_ada   boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.chart_of_accounts
     WHERE company_id = v_soa AND code = '4-1900' AND deleted_at IS NULL
  ) INTO v_ada;

  IF v_ada THEN
    RAISE NOTICE '1. Akun 4-1900 SUDAH ADA untuk SOA -- tidak menambah baris baru.';
  ELSE
    INSERT INTO public.chart_of_accounts
      (company_id, code, name, account_type, level, is_header, normal_balance, description, is_active)
    VALUES (
      v_soa, '4-1900', 'Diskon, rebate, listing fee & potongan trading term',
      'revenue', 1, false, 'debit',
      'Kontra-pendapatan (AR Tahap 3, TD-287) -- klasifikasi minimal staging, menunggu draft CoA final (TD-276). Dipetakan ke peran account_role_mappings.potongan_pelanggan.',
      true
    )
    ON CONFLICT (company_id, code) DO NOTHING;
    RAISE NOTICE '1. Akun 4-1900 DITAMBAHKAN untuk SOA.';
  END IF;
END
$akun$;

-- ---------------------------------------------------------------------------
-- 2. Pemetaan peran -- SAMA persis pola SEED di 20260927000002 (cari lewat
--    kode, ON CONFLICT DO NOTHING supaya pemetaan yang sudah disunting
--    manusia tidak ditimpa eksekusi ulang). Enam peran lama TIDAK disentuh.
-- ---------------------------------------------------------------------------
INSERT INTO public.account_role_mappings (company_id, role_key, account_id)
SELECT c.company_id, 'potongan_pelanggan', c.id
  FROM public.chart_of_accounts c
 WHERE c.company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'
   AND c.code = '4-1900'
   AND c.deleted_at IS NULL
ON CONFLICT (company_id, role_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- V1 -- bukti, bukan asumsi. get_mapped_account() harus mengembalikan akun
-- yang SAMA dengan lookup kode -- pola sama dengan V1 di 20260927000002.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_soa        CONSTANT uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_akun_id    uuid;
  v_dari_helper uuid;
  v_enam_lama  int;
BEGIN
  SELECT id INTO v_akun_id FROM public.chart_of_accounts
   WHERE company_id = v_soa AND code = '4-1900' AND deleted_at IS NULL;
  IF v_akun_id IS NULL THEN
    RAISE EXCEPTION 'V1 GAGAL: akun 4-1900 SOA tidak ditemukan sesudah seed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.account_role_mappings
     WHERE company_id = v_soa AND role_key = 'potongan_pelanggan' AND account_id = v_akun_id
  ) THEN
    RAISE EXCEPTION 'V1 GAGAL: account_role_mappings.potongan_pelanggan untuk SOA tidak menunjuk akun 4-1900.';
  END IF;

  v_dari_helper := public.get_mapped_account(v_soa, 'potongan_pelanggan');
  IF v_dari_helper IS DISTINCT FROM v_akun_id THEN
    RAISE EXCEPTION 'V1 GAGAL: get_mapped_account(SOA, potongan_pelanggan) = % TIDAK SAMA dengan akun 4-1900 (%).', v_dari_helper, v_akun_id;
  END IF;

  -- Enam peran lama TIDAK disentuh -- masih 6 baris untuk SOA di luar yang baru ini.
  SELECT count(*) INTO v_enam_lama FROM public.account_role_mappings
   WHERE company_id = v_soa AND role_key <> 'potongan_pelanggan';
  IF v_enam_lama <> 6 THEN
    RAISE EXCEPTION 'V1 GAGAL: seharusnya 6 peran lama untuk SOA tidak tersentuh, ditemukan %.', v_enam_lama;
  END IF;

  RAISE NOTICE 'V1 LOLOS: get_mapped_account(SOA, potongan_pelanggan) = % (akun 4-1900), 6 peran lama SOA tidak tersentuh.', v_dari_helper;
END
$v1$;

-- Tidak ada COMMIT/ROLLBACK eksplisit di berkas ini -- jalankan lewat
-- psql/SQL Editor dengan autocommit standar, sama seperti seed lain di
-- scripts/seed/uat/. Untuk membatalkan: DELETE FROM account_role_mappings
-- WHERE role_key = 'potongan_pelanggan'; lalu, HANYA kalau akun 4-1900
-- memang baru dibuat skrip ini (bukan sudah ada sebelumnya) dan belum
-- dipakai baris lain: DELETE FROM chart_of_accounts WHERE company_id =
-- 'd2e5e565-5f67-4954-b8d9-5979a2a0c697' AND code = '4-1900'.
