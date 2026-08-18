-- =============================================================================
-- Migration: 20260818000004_rls_multi_company_read
-- Phase:     TD-180 — akses baca multi-company untuk sp_orders + products.
--            HANYA policy SELECT. Policy tulis TIDAK disentuh (lihat di bawah).
-- Depends:   get_user_company_ids() sudah ada (dipakai companies_read_own,
--            roles_read, journal_entries_read).
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi. Jalankan section
--            1 -> 2 di SQL Editor, lalu refresh schema_snapshot.sql via pg_dump.
--
-- MASALAH YANG DIPERBAIKI
--   get_user_company_id() = home company dari profiles. User multi-company
--   non-super_admin (mis. Finance dgn role aktif di MSI DAN SOA, home MSI)
--   karena itu TIDAK melihat satu pun baris SOA. Gagalnya SENYAP — RLS
--   mengembalikan nol baris, bukan error — sehingga layar tampak normal tapi
--   isinya salah. Empat gejala yang sudah dikonfirmasi berasal dari akar ini:
--     1. Dashboard Storbit: SELURUH kartu 0 (agregat atas nol baris tetap
--        mengembalikan satu baris berisi nol -> error NULL -> nol toast).
--     2. SP Manifest: SEMUA baris berlabel "Draft" + tombol Konfirmasi muncul
--        di semuanya. Sebabnya list dibaca dari sp_items (RLS USING(true) ->
--        463 baris tetap tampil) sementara badge status dibaca dari sp_orders
--        (nol baris) lalu jatuh ke fallback `g.orderStatus || 'DRAFT'`
--        (SalesOrderPage.jsx:97).
--     3. Stok Barang: kuantitas benar tapi SKU & nama produk "–" di semua
--        baris — embed PostgREST products(...) yang diblokir RLS resolve jadi
--        NULL, bukan error (StokBarangPage.jsx:302).
--     4. Invoice PDF (getInvoicePdfData, db.js:1027): embed sp_orders(...)
--        NULL -> dokumen kehilangan nomor SP & identitas customer.
--
-- BLAST RADIUS — SUDAH DIAUDIT PENUH SEBELUM MIGRASI INI DITULIS
--   products (5 konsumen langsung + 2 embed): HANYA ProductsPage yang berubah
--   perilaku. Sisanya kebal karena sudah memfilter company sendiri
--   (useProducts.js:42 `.eq('company_id', companyId)`, PenerimaanBarangPage
--   `.eq('company_id', soa.id)`), mengakses per-PK (ProductDetailPage
--   `.eq('id', …)`), atau digate super_admin (BulkEditPricePage — non-super
--   memakai useProducts yang sudah ber-filter). ProductsPage sendiri SIAP:
--   kolom "Entitas" + filter per-company sudah ada, dan asumsi "kode produk
--   unik" sudah ditambal LEBIH DULU (key React kini `p.id || p.sku`; `code`
--   unik PER COMPANY lewat products_company_code_unique, BUKAN global).
--   ⚠️ Tanpa tambalan key itu, migrasi ini akan memunculkan bug key duplikat
--   CC-EXP/CC-IMP untuk user multi-company — urutan pengerjaannya kebetulan
--   sudah benar, jangan dibalik kalau kelak di-replay di environment lain.
--   sp_orders (4 konsumen): semuanya modul Storbit, dan semuanya mengakses
--   via PK (id) atau komposit (customer_id, sp_no) yang unik GLOBAL — nol
--   risiko duplikat/tabrakan lintas entitas.
--
-- YANG SENGAJA TIDAK DISENTUH
--   products_insert / products_update / sp_orders_insert / sp_orders_update.
--   Keempatnya tetap varian TUNGGAL + role gate. Baca lebih luas daripada
--   tulis itu koheren dan disengaja: user boleh MELIHAT data entitas tempat
--   ia punya role aktif, tanpa otomatis boleh MENGUBAHNYA.
--   ⚠️ Konsekuensi UX yang harus diantisipasi: tombol aksi bisa muncul lalu
--   ditolak backend (pola yang sama dgn tombol Konfirmasi di SP Manifest yang
--   nol pengecekan role di FE). Itu gap FE tersendiri, bukan alasan menunda
--   migrasi ini.
--
-- BENTUK PERUBAHAN: MENAMBAH, BUKAN MENGGANTI
--   Klausa lama (get_user_company_id) DIPERTAHANKAN, varian jamak ditambahkan
--   sebagai OR. Sebabnya kedua fungsi punya sumber berbeda — profiles.company_id
--   vs user_roles(is_active) — dan TIDAK dijamin beririsan. Mengganti murni
--   bisa MENCABUT akses user yang home company-nya tak punya baris user_roles
--   aktif. Bentuk OR menjamin migrasi ini hanya MENAMBAH, nol kemungkinan
--   regresi akses. Pola sama sudah dipakai companies_read_own dan roles_read
--   (2 dari 3 policy jamak yang ada); hanya journal_entries_read yang murni
--   jamak, dan itu tabel baru tanpa konsumen sehingga tak ada yang bisa hilang.
--
-- ALTER POLICY (bukan DROP+CREATE): hanya klausa USING yang disentuh, jadi
-- mustahil tak sengaja menghilangkan FOR SELECT/TO/klausa lain saat mengetik
-- ulang, dan tak ada jendela waktu tanpa policy. ALTER POLICY sudah dipakai
-- 26 kali di folder migrasi ini.
-- =============================================================================

-- 1. sp_orders — baca lintas entitas tempat user punya role aktif.
ALTER POLICY sp_orders_read ON public.sp_orders
  USING (
    public.is_super_admin()
    OR company_id = public.get_user_company_id()
    OR company_id IN (SELECT public.get_user_company_ids())
  );

-- 2. products — idem. Klausa deleted_at DIPERTAHANKAN PERSIS seperti aslinya
--    (produk terhapus hanya terlihat super_admin).
ALTER POLICY products_read ON public.products
  USING (
    public.is_super_admin()
    OR (
      (company_id = public.get_user_company_id()
       OR company_id IN (SELECT public.get_user_company_ids()))
      AND (deleted_at IS NULL OR public.is_super_admin())
    )
  );

-- ─── VERIFIKASI (jalankan TERPISAH setelah 1-2) ──────────────────────────────
--   -- a. Policy sudah berubah & memuat varian jamak:
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy
--    WHERE polname IN ('sp_orders_read','products_read');
--   -- kedua baris HARUS memuat get_user_company_ids
--
--   -- b. Klausa TULIS tidak ikut berubah (harus tetap TUNGGAL):
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid)      AS check_expr
--     FROM pg_policy
--    WHERE polname IN ('products_insert','products_update',
--                      'sp_orders_insert','sp_orders_update');
--   -- tak satu pun boleh memuat get_user_company_ids
--
--   -- c. SIMULASI SEBAGAI ELVIRA tanpa browser — impersonasi via JWT claim,
--   --    dibungkus ROLLBACK sehingga nol efek permanen.
--   --    (auth.uid() memang NULL di SQL Editor; request.jwt.claims mengisinya.)
--   --    Jalankan blok ini SEBELUM dan SESUDAH section 1-2 supaya selisihnya
--   --    terlihat — ini bukti paling langsung tanpa perlu login browser.
--   BEGIN;
--     SELECT set_config('request.jwt.claims',
--            json_build_object('sub', (SELECT id::text FROM profiles
--                                       WHERE email ILIKE '%elvira%' LIMIT 1),
--                              'role','authenticated')::text, true);
--     SET LOCAL ROLE authenticated;
--     SELECT public.get_user_company_id()                AS home_company,
--            array(SELECT public.get_user_company_ids()) AS company_ids;
--     SELECT count(*) AS sp_orders_soa FROM public.sp_orders
--      WHERE deleted_at IS NULL
--        AND company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
--     SELECT count(*) AS products_soa FROM public.products
--      WHERE deleted_at IS NULL
--        AND company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
--   ROLLBACK;
--   -- SEBELUM migrasi kedua count = 0; SESUDAHNYA harus > 0
--   -- (sp_orders ±463, products = jumlah produk SOA aktif).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER POLICY sp_orders_read ON public.sp_orders
--   USING (public.is_super_admin() OR company_id = public.get_user_company_id());
-- ALTER POLICY products_read ON public.products
--   USING (public.is_super_admin() OR ((company_id = public.get_user_company_id())
--          AND ((deleted_at IS NULL) OR public.is_super_admin())));
