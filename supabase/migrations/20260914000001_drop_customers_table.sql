-- =============================================================================
-- Migration: 20260914000001_drop_customers_table
-- Phase:     Penutup TD-19 — DROP tabel legacy `customers` yang sudah
--            dipensiunkan sejak Phase 2.5A (14 Jun 2026). Sekaligus menjadi
--            RUMAH bagi sejarah 14 Jun 2026 yang selama ini tidak punya file
--            migrasi (lihat SEJARAH di bawah).
-- Depends:   - Tabel backup `public.customers_backup_20260614` SUDAH ADA di DB
--              yang sedang dieksekusi (dibuat manual Den, staging dulu lalu
--              produksi, masing-masing SEBELUM DROP). Guard BAGIAN 0 menolak
--              jalan kalau backup tidak ada atau jumlah barisnya tidak sama.
--            - FE `SchemaManagerPage.jsx` yang sudah tidak mendaftarkan
--              'customers' (cabut dari TABLE_GROUPS + default selectedTable
--              diturunkan dari daftar) HARUS SUDAH LIVE di produksi lebih dulu
--              — aturan CLAUDE.md: deploy kode yang berhenti membaca DULU,
--              baru drop. Tanpa itu Schema Manager terbuka pada tabel yang
--              sudah tidak ada.
-- Status:    BELUM DIJALANKAN — akan dijalankan MANUAL oleh Den di Supabase
--            SQL Editor: STAGING (oovmlhilhqzejnawqkvt) dulu → verifikasi
--            (LAPIS 1 + LAPIS 2 di bawah) → baru PRODUKSI (untmpqceexwxzuhlmyrg).
--            Sesudah produksi: refresh schema_snapshot.sql, tutup TD-19.
--
-- SIFAT: 1 DROP TABLE. Nol perubahan data pada tabel lain, nol RLS/policy
--   tabel lain, nol fungsi. TANPA CASCADE — sengaja: nol FK dari tabel lain
--   yang REFERENCES customers, jadi kalau DROP polos ditolak PostgreSQL karena
--   ada dependensi, itu berarti ada yang TERLEWAT dari audit dan harus
--   diperiksa dulu, bukan dipaksa lewat CASCADE.
--
-- ─── SEJARAH — kenapa tabel ini ada dan kenapa aman dibuang ─────────────────
--   1. `customers` lahir sebagai master data customer khusus Storbit (SOA):
--      dipakai halaman Customer Storbit, SP Manifest, dan AR Tracker
--      (COMMENT ON TABLE aslinya: "Legacy customer master table…").
--      Isinya hanya pernah 2 baris: INDOMARCO (id a18fad3c-75ee-4fc6-b3d2-
--      5c5dfa810661, dibuat 24 Mei 2026 lewat form Storbit) dan satu baris
--      uji-hapus (id 53eb97a4-01c5-41b9-85b6-a69c058240f4, dibuat lalu
--      di-soft-delete 4 detik kemudian pada 24 Mei 2026, tes fitur hapus).
--   2. 14 Jun 2026 — Phase 2.5A ("Customers → accounts, single master
--      customer"), dikerjakan MANUAL oleh Den di SQL Editor dan SQL-nya
--      TIDAK PERNAH direkam sebagai file migrasi (migrations/ berhenti 3 Jun
--      2026). Yang dilakukan, direkonstruksi dari catatan CLAUDE.md saat itu
--      (commit e31fa86, kini 00_DEV_JOURNEY.md fase 2.5A + PROGRESS.md
--      2026-06-14) dan dari data snapshot 31 Agu 2026 (commit 0c736fb):
--        a. Satu-satunya customer aktif (INDOMARCO) disalin ke `accounts`
--           DENGAN ID YANG SAMA lewat INSERT … SELECT — created_at/updated_at,
--           pic_name/pic_email "Dummy", nomor_kontrak 'test' ikut tersalin
--           identik; owner/company_id di-set SOA, account_status='customer',
--           pipeline_stage='WON', code diterbitkan SOA/CUST/2026/I.
--           Id dipertahankan SENGAJA: ratusan baris sp_items/ar_ttfs sudah
--           ber-customer_id = a18fad3c…, jadi FK bisa dipindah tanpa menulis
--           ulang satu pun baris transaksi.
--        b. 5 FK di-repoint dari customers ke accounts: sp_items.customer_id,
--           ar_ttfs.customer_id, inquiries.customer_id, quotations.customer_id,
--           accounts.converted_to (nama constraint tidak diubah — sebab
--           embed FE memakai alias `customers:accounts!<constraint>(name)`).
--        c. Kode FE dipindah ke `accounts` (db.js listCustomers/upsertCustomer/
--           deleteCustomer + CRM Inquiry/Quotation embeds).
--        d. Tabel `customers` DIPENSIUNKAN, TIDAK dihapus → dicatat TD-19.
--   3. Audit ulang 14 Sep 2026 (read-only, git + snapshot + query Den ke DB)
--      mengonfirmasi tabel ini benar-benar mati:
--        - NOL FK dari tabel lain yang REFERENCES public.customers (8 FK yang
--          ada semuanya KELUAR dari customers — assigned_to, company_id,
--          created_by, currency_code, payment_terms_id, prospect_id→accounts,
--          source_company_id, updated_by — dan ikut hilang bersama tabelnya).
--        - NOL fungsi / RPC / trigger / view yang membacanya. Yang menempel
--          hanya miliknya sendiri: trigger trg_customers_updated_at,
--          3 policy (customers_read/insert/update), 5 index, ACL.
--        - NOL query langsung ke tabel ini di src/ — di `main` MAUPUN branch
--          feature/crm-v3-batch-persiapan. Sisa rujukan tidak langsung cuma
--          useCustomFields('customers') → get_table_columns('customers')
--          (sesudah DROP mengembalikan 0 baris tanpa error → input "custom
--          field" di form Customer Storbit sekadar hilang) dan daftar tabel
--          SchemaManagerPage (dicabut, lihat Depends).
--        - Semua tabel ber-customer_id (sp_orders, sp_btb, sp_items,
--          picking_lists, delivery_notes, dc_master, ar_ttfs, inquiries,
--          quotations) 100% menunjuk ke accounts.id — NOL baris yatim
--          (diverifikasi Den ke DB, 14 Sep 2026).
--   4. Backup dibuat manual sebelum DROP di tiap DB:
--        CREATE TABLE public.customers_backup_20260614 AS
--          SELECT * FROM public.customers;
--      (2 baris: 1 aktif + 1 soft-deleted). Isi kedua baris juga masih
--      terbaca dari git di snapshot berdata terakhir, commit 0c736fb.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN 0 — GUARD (menolak jalan kalau prasyarat belum terpenuhi)
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_backup_exists boolean;
  v_live   bigint;
  v_backup bigint;
  v_fk_in  bigint;
BEGIN
  -- 0a. Backup harus ADA di DB ini (staging & produksi masing-masing punya).
  SELECT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'customers_backup_20260614'
  ) INTO v_backup_exists;
  IF NOT v_backup_exists THEN
    RAISE EXCEPTION
      'DIBATALKAN: public.customers_backup_20260614 tidak ada di DB ini. Buat dulu: CREATE TABLE public.customers_backup_20260614 AS SELECT * FROM public.customers;';
  END IF;

  -- 0b. Jumlah baris backup = jumlah baris hidup (termasuk yang soft-deleted).
  SELECT count(*) INTO v_live   FROM public.customers;
  SELECT count(*) INTO v_backup FROM public.customers_backup_20260614;
  IF v_live <> v_backup THEN
    RAISE EXCEPTION
      'DIBATALKAN: customers = % baris, customers_backup_20260614 = % baris. Backup tidak utuh — buat ulang sebelum DROP.', v_live, v_backup;
  END IF;

  -- 0c. Nol FK MASUK dari tabel lain (kalau ada, audit 14 Sep 2026 terlewat
  --     sesuatu — periksa dulu, JANGAN diselesaikan dengan CASCADE).
  SELECT count(*) INTO v_fk_in
  FROM pg_constraint
  WHERE contype = 'f' AND confrelid = 'public.customers'::regclass;
  IF v_fk_in > 0 THEN
    RAISE EXCEPTION
      'DIBATALKAN: masih ada % FK dari tabel lain yang menunjuk ke customers. Lihat: SELECT conname, conrelid::regclass FROM pg_constraint WHERE confrelid = ''public.customers''::regclass;', v_fk_in;
  END IF;

  RAISE NOTICE 'Guard lolos: backup ada (% baris = % baris), nol FK masuk. Lanjut DROP.', v_backup, v_live;
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN 1 — DROP
-- ═════════════════════════════════════════════════════════════════════════════
-- Tanpa CASCADE (sengaja, lihat SIFAT). Ikut hilang otomatis bersama tabel:
-- constraint customers_pkey, 8 FK keluar, 5 index (idx_customers_active /
-- _company_code / _company_id / _deleted_at / _name), trigger
-- trg_customers_updated_at, 3 policy RLS, ACL, dan seluruh COMMENT-nya.
-- Fungsi set_updated_at() TIDAK ikut hilang — ia dipakai trigger tabel lain.
DROP TABLE public.customers;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudahnya, di DB yang sama.
-- ═════════════════════════════════════════════════════════════════════════════
-- a. Tabelnya hilang, backup-nya tetap (HARAPAN: 1 baris = customers_backup_20260614):
-- SELECT tablename FROM pg_tables
--  WHERE schemaname = 'public' AND tablename LIKE 'customers%';
--
-- b. Nol sisa objek yang menyebut customers (HARAPAN: 0 baris):
-- SELECT policyname, tablename FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'customers';
-- SELECT proname FROM pg_proc
--  WHERE pronamespace = 'public'::regnamespace AND prosrc ILIKE '%public.customers%';
--
-- c. Jalur customer_id ke accounts tetap utuh (HARAPAN: 9 baris, semua
--    confrelid = accounts):
-- SELECT conrelid::regclass AS tabel, conname, confrelid::regclass AS menunjuk_ke
--   FROM pg_constraint
--  WHERE contype = 'f' AND conname LIKE '%customer_id_fkey'
--  ORDER BY 1;
--
-- d. get_table_columns('customers') kini kosong TANPA error (HARAPAN: 0 baris):
-- SELECT * FROM public.get_table_columns('customers');
--
-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 2 (browser, akun super_admin) — sesudah LAPIS 1 lolos.
-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Storbit → Customers: daftar tetap terisi (dibaca dari accounts), Add/Edit
--    Customer terbuka normal; blok "custom field" di modal kini kosong — itu
--    HARAPAN, bukan bug (sumbernya get_table_columns('customers') = 0 baris).
-- 2. AdminHub → Schema Manager: terbuka pada 'vendors' (tabel pertama grup
--    MASTER DATA), 'customers' tidak ada di sidebar, kolom termuat.
-- 3. Detail SP mana pun: nama customer tetap tampil (embed
--    customers:accounts!sp_items_customer_id_fkey tidak terpengaruh).
--
-- ═════════════════════════════════════════════════════════════════════════════
-- SESUDAH PRODUKSI
-- ═════════════════════════════════════════════════════════════════════════════
-- - Refresh schema_snapshot.sql (pg_dump --schema-only --schema=public, ACL
--   ikut) — CREATE TABLE public. turun 1; GRANT … TO authenticated turun 1
--   (itu GRANT milik customers, bukan kehilangan yang lain).
-- - 08_TECH_DEBT.md: TD-19 → RESOLVED (sebut migrasi ini). Periksa TD-18
--   (sales_calls/sales_visits) yang sekelas — TIDAK ikut migrasi ini.
-- - 03_DATA_MODEL.md + baris "Drop the retired `customers` table" di
--   AGENTS.md §Pending: koreksi fakta terverifikasi, diff sekecil mungkin.
-- - `customers_backup_20260614` = tabel backup ke-9 di DB; jadwalkan drop
--   bersama backup lain dalam SATU sesi + SATU refresh snapshot
--   (03_DATA_MODEL.md gotcha #10). Jangan dihapus sebelum snapshot pasca-DROP
--   utama sudah di-commit dan aplikasi terbukti sehat beberapa hari.
--
-- ─── ROLLBACK (komentar — TIDAK dieksekusi otomatis) ────────────────────────
-- Mengembalikan DATA-nya saja:
--   CREATE TABLE public.customers AS
--     SELECT * FROM public.customers_backup_20260614;
--
-- ⚠️ Rollback di atas TIDAK mengembalikan apa pun yang tadinya menempel di
--    tabel asli — dan juga tidak mengembalikan PRIMARY KEY, NOT NULL, DEFAULT,
--    serta 8 FK keluar (CREATE TABLE AS hanya menyalin kolom + data):
--      - 5 index  : idx_customers_active, idx_customers_company_code,
--                   idx_customers_company_id, idx_customers_deleted_at,
--                   idx_customers_name
--      - 3 policy : customers_read, customers_insert, customers_update
--                   (+ ALTER TABLE … ENABLE ROW LEVEL SECURITY)
--      - 1 trigger: trg_customers_updated_at (BEFORE UPDATE → set_updated_at())
--      - ACL      : GRANT ALL ON TABLE public.customers TO authenticated
--                   (+ REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ke anon/service_role)
--    Kalau rollback PENUH dibutuhkan, DDL lengkapnya ada di
--    supabase/schema_snapshot.sql versi SEBELUM refresh pasca-DROP (terakhir
--    memuatnya: versi 11 Sep 2026 di main, dan versi 31 Agu 2026 commit
--    0c736fb yang juga membawa DATA kedua barisnya) — cari blok
--    "CREATE TABLE public.customers (" lalu ikuti nama objek di atas; nomor
--    baris sengaja tidak dikutip karena bergeser tiap refresh (TD-221).
--    Tabel yang dipulihkan TANPA RLS akan terbaca semua orang lewat PostgREST
--    (GRANT default) — pasang policy-nya dulu sebelum aplikasi menyentuhnya.
