-- =============================================================================
-- Migration: 20260910000001_finance_read_access
-- Phase:     TD-217 (sumbu ROLE) + TD-218/TD-180 (sumbu ENTITAS) — membuka
--            akses BACA yang dibutuhkan Finance untuk memakai invoice.
-- Depends:   get_user_company_ids() (sudah ada) · pola jamak yang sudah hidup
--            di sp_btb_read / dc_master_read / journal_entries_read.
--
-- ⚠️ BELUM DIJALANKAN. Dijalankan manual di SQL Editor oleh Den.
--
-- SIFAT: 4 ALTER POLICY, semuanya FOR SELECT. Nol DDL tabel, nol GRANT/REVOKE,
--   nol sentuhan RPC, nol perubahan pada is_manager_or_above() /
--   get_user_company_id() / get_user_company_ids() / has_role().
--
-- ⭐ KEDUA PERUBAHAN MURNI ADITIF — tidak ada seorang pun yang bisa KEHILANGAN
--   akses karenanya. FIX 1 hanya menambah satu cabang OR. FIX 2 memakai bentuk
--   `A = singular OR A IN (jamak)`, BUKAN mengganti singular dengan jamak;
--   bentuk union itu disalin dari sp_btb_read/dc_master_read yang sudah hidup.
--   Mengganti (bukan menambah) akan mencabut akses user yang home company-nya
--   X tapi tidak punya role aktif di X — kecil kemungkinannya, tapi tak perlu
--   diambil risikonya untuk perbaikan produksi.
--
-- ── DIAGNOSIS: TERBUKTI DI PRODUKSI 10 Sep 2026 ────────────────────────────
--   Dua akun, SP 2280528 yang SAMA, hari yang sama:
--
--     Elvira Nurhuda (finance_controller @SOA, home MSI):
--       header      : "1 produk · 370 qty · —"
--       preview SP  : "Kepada Yth: —"
--       panel Invoice: "Belum Diterbitkan" + tombol Terbitkan Invoice
--
--     Super Admin:
--       header      : "1 produk · 370 qty · PT. Indomarco Prismatama"
--       preview SP  : "Kepada Yth: PT. Indomarco Prismatama"
--       panel Invoice: SOA-INV-IX-2026-0011 · Rp 21.975.736 · Download/Cetak/Submit
--
--   ⚠️ Panel "Belum Diterbitkan" itu BUKAN status sebenarnya — invoicenya sudah
--   terbit DAN sudah disubmit. Dua lapis kegagalan terbukti sekaligus.
--
-- ── LAPIS 1 — sumbu ROLE (accounts tidak terbaca sama sekali) ───────────────
--   prospects_read memuat manager-ke-atas, pemilik baris, operations (dibatasi
--   customer), dan procurement — TIDAK memuat finance maupun finance_controller,
--   dan keduanya juga tidak lolos is_manager_or_above() (daftarnya
--   super_admin/admin/ceo/gm/gm_bd/manager/supervisor).
--
--   ⚠️ Sumbu ENTITAS policy ini SUDAH jamak. Yang menolak murni PERANNYA —
--   jadi Finance satu-entitas pun kena, bukan cuma yang home-nya beda.
--
--   Sekali gagal, satu rantai ikut kosong: listSpItems() meng-embed
--   customers:accounts(name) -> spFromDb() -> groupBySP() -> header SP, daftar
--   SP, preview Surat Pesanan, FinancePage, OutstandingPage, PDF Invoice,
--   PDF Picking List, kolom CUSTOMER dashboard Storbit, daftar TTF, DC Master.
--   (PDF Surat Jalan AMAN — customer_name-nya di-snapshot saat generate.)
--
-- ── LAPIS 2 — sumbu ENTITAS (invoice tidak terbaca) ─────────────────────────
--   Tiga policy masih memakai get_user_company_id() SINGULAR = home company
--   (profiles.company_id). Elvira home MSI, role aktif di SOA, SP-nya SOA.
--
--     sp_invoices_read       -> panel invoice, kartu Outstanding Piutang
--     sp_invoice_lines_read  -> baris produk PDF invoice
--     sp_order_items_read    -> product_name/sku/unit_price di baris itu
--
--   Ketiganya perlu. Tanpa yang kedua & ketiga, invoice tetap TERCETAK tapi
--   dengan nama produk kosong dan harga Rp 0 — lebih buruk dari gagal, karena
--   ia terlihat sah.
--
--   ⚠️ EFEK IKUTAN YANG DIDAPAT GRATIS: sp_payments_read klausanya sendiri
--   sudah jamak, tapi ia ber-EXISTS(sp_invoices ...) dan PostgreSQL menerapkan
--   RLS juga pada tabel yang dirujuk di dalam ekspresi policy. Jadi ia ikut
--   jatuh lewat sp_invoices_read, dan ikut pulih begitu FIX 2 dijalankan —
--   tanpa policy sp_payments disentuh sama sekali.
--
-- ── KENAPA PEMBATASAN account_status='customer' MENGIKAT ───────────────────
--   RLS itu ROW-level, bukan COLUMN-level: begitu satu baris lolos, SELURUH
--   kolomnya ikut terbuka — credit_limit, payment_terms_id, tax_id, notes,
--   delapan kolom bant_*, pipeline_stage, lost_reason/won_reason, tier, source,
--   assigned_to, pic_*. Membatasi ke account_status='customer' menahan lead,
--   mql, sql, prospect, dan lead_pool tetap TERTUTUP untuk Finance — itulah
--   pipeline CRM, bagian paling sensitifnya. Bentuk pembatasnya menyalin
--   PERSIS cabang operations yang sudah ada di klausa yang sama.
--
--   ⚠️ JANGAN "rapikan" dengan mencabut syarat account_status supaya klausanya
--   lebih pendek. Syarat itu SATU-SATUNYA yang memisahkan Finance dari pipeline
--   CRM; tanpa dia, cabang ini membuka seluruh isi accounts.
--
-- ── YANG SENGAJA TIDAK DIKERJAKAN DI SINI ─────────────────────────────────
--   Ini BUKAN sisir RLS menyeluruh (TD-180: 198 policy / 76 tabel). Yang
--   disentuh cuma empat policy yang menghalangi alur invoice hari ini.
--   Tetap OPEN: sp_orders_update, sp_order_items_insert/update, payment_terms_*,
--   TD-231, dan TD-251/252/253 yang lahir dari audit yang sama.
--
--   Nomor BTB juga TIDAK disentuh — sudah dibuktikan by design (tak ada kontrol
--   edit untuk role mana pun; guard sp_issue_btb memang Operations/Manager+).
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── FIX 1 — prospects_read: tambah finance + finance_controller ─────────────
-- Perubahan HANYA satu cabang OR (baris ber-tanda "BARU" di bawah). Sisanya
-- byte-identik dengan klausa produksi hari ini.
ALTER POLICY prospects_read ON public.accounts
  USING (
    public.is_super_admin()
    OR (
      (company_id IN (SELECT public.get_user_company_ids()))
      AND (
        public.is_manager_or_above()
        OR (assigned_to = auth.uid())
        OR (created_by = auth.uid())
        OR (public.has_role('operations'::text) AND ((account_status)::text = 'customer'::text))
        -- BARU: Finance sejajar operations, dengan pembatas yang sama.
        OR (
          (public.has_role('finance'::text) OR public.has_role('finance_controller'::text))
          AND ((account_status)::text = 'customer'::text)
        )
        OR public.has_role('procurement'::text)
      )
    )
  );

-- ─── FIX 2a — sp_invoices_read: tambah varian jamak ─────────────────────────
ALTER POLICY sp_invoices_read ON public.sp_invoices
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id())
    OR (company_id IN (SELECT public.get_user_company_ids()))
  );

-- ─── FIX 2b — sp_invoice_lines_read: tambah varian jamak ────────────────────
ALTER POLICY sp_invoice_lines_read ON public.sp_invoice_lines
  USING (
    public.is_super_admin()
    OR (EXISTS (
      SELECT 1
      FROM public.sp_invoices i
      WHERE i.id = sp_invoice_lines.invoice_id
        AND (
          i.company_id = public.get_user_company_id()
          OR i.company_id IN (SELECT public.get_user_company_ids())
        )
    ))
  );

-- ─── FIX 2c — sp_order_items_read: tambah varian jamak ──────────────────────
ALTER POLICY sp_order_items_read ON public.sp_order_items
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id())
    OR (company_id IN (SELECT public.get_user_company_ids()))
  );

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
--
-- ⚠️ RLS TIDAK BISA diuji dari SQL Editor: auth.uid() NULL di sana dan service
--    role mem-bypass RLS. Yang bisa dibuktikan di sini cuma "policy-nya
--    terpasang dan klausanya memuat yang benar". Bahwa Elvira benar-benar
--    melihat datanya dibuktikan di LAPIS 2 (browser) — lihat laporan.
--
-- Sumbernya pg_policies = katalog HIDUP, jadi ia otoritatif apa pun isi
-- schema_snapshot.sql.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — keempat policy terpasang & membawa varian jamak.
--      DIHARAPKAN: 4 baris, kolom punya_jamak SEMUANYA t.
--                  punya_finance HANYA t pada prospects_read.
SELECT tablename,
       policyname,
       qual LIKE '%get_user_company_ids%'   AS punya_jamak,
       qual LIKE '%finance_controller%'     AS punya_finance
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  policyname IN ('prospects_read','sp_invoices_read',
                      'sp_invoice_lines_read','sp_order_items_read')
ORDER  BY tablename, policyname;

-- V2 — FIX 1 memuat KEDUA role finance, dan pembatas 'customer' muncul DUA kali
--      (sekali untuk operations, sekali untuk finance).
--      DIHARAPKAN: finance_polos = t · finance_ctl = t · jumlah_customer = 2
--      ⚠️ jumlah_customer = 1 berarti pembatasnya HILANG dari cabang finance —
--         itu membuka seluruh pipeline CRM. Rollback kalau terjadi.
SELECT policyname,
       qual LIKE '%has_role(''finance''::text)%'            AS finance_polos,
       qual LIKE '%has_role(''finance_controller''::text)%' AS finance_ctl,
       (length(qual) - length(replace(qual, 'customer', ''))) / length('customer')
                                                            AS jumlah_customer
FROM   pg_policies
WHERE  schemaname = 'public' AND policyname = 'prospects_read';

-- V3 — tidak ada policy lain yang ikut berubah.
--      DIHARAPKAN: 0 baris (nol policy SELECT tersisa yang masih singular-only
--      di antara empat tabel ini).
SELECT tablename, policyname
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename IN ('accounts','sp_invoices','sp_invoice_lines','sp_order_items')
  AND  cmd = 'SELECT'
  AND  qual LIKE '%get_user_company_id()%'
  AND  qual NOT LIKE '%get_user_company_ids%';

-- V4 — BLAST RADIUS dalam angka: berapa baris accounts yang BARU terbuka.
--      Jalankan SEBELUM dan SESUDAH; angkanya tidak berubah (ini query sebagai
--      super admin), gunanya menakar berapa yang kini terlihat Finance.
--      Yang terbuka HANYA baris account_status='customer' di entitas tempat
--      Finance punya role aktif. Selain itu tetap tertutup.
SELECT company_id,
       account_status,
       count(*) AS jumlah
FROM   public.accounts
WHERE  deleted_at IS NULL
GROUP  BY company_id, account_status
ORDER  BY company_id, jumlah DESC;

-- V5 — bukti bahwa panel "Belum Diterbitkan" memang berbohong: invoice SP
--      2280528 ADA dan statusnya bukan draft.
--      DIHARAPKAN: 1 baris, invoice_no = SOA-INV-IX-2026-0011,
--                  status = submitted, total_amount = 21975736
SELECT i.invoice_no, i.status, i.total_amount, i.company_id, o.sp_no
FROM   public.sp_invoices i
JOIN   public.sp_orders  o ON o.id = i.sp_order_id
WHERE  o.sp_no = '2280528' AND i.deleted_at IS NULL;


-- =============================================================================
-- CATATAN SESUDAH EKSEKUSI
--
-- 1. Ubah header `Status:` di puncak file ini jadi LIVE + tanggal SESUDAH
--    verifikasi runtime lolos — jangan sebelum. ⭐ Pelajaran TD-243 (10 Sep):
--    header `Status:` BUKAN bukti, ia catatan yang bisa lupa diperbarui.
--
-- 2. Refresh schema_snapshot.sql (pg_dump --schema-only --schema=public,
--    host aws-1-ap-northeast-2.pooler.supabase.com:5432).
--    ⚠️ Refresh ini TIDAK akan membawa keempat policy ini saja. Snapshot di
--    `main` hari ini TERTINGGAL dari produksi: enam RPC CRM v3
--    (crm_lifecycle_funnel dkk) dan is_manager_or_above_in() sudah LIVE di
--    produksi sejak 9 Sep tapi NOL hit di snapshot `main`. Diff-nya akan jauh
--    lebih besar dari empat policy — itu BUKAN tanda ada yang salah.
-- =============================================================================




















-- =============================================================================
-- =============================================================================
--
--                        ⛔  B A T A L K A N   —   JANGAN JALANKAN
--                            KECUALI MEMANG MAU MEMBALIKKAN
--
--   Blok di bawah SENGAJA dijauhkan dari alur baca verifikasi: pernah ada
--   blok rollback yang ikut ter-select dan ikut terjalankan. Jangan pindahkan
--   ke atas, jangan gabungkan dengan blok VERIFIKASI.
--
--   Ini mengembalikan keempat policy ke bentuknya sebelum migrasi ini —
--   artinya Finance kembali TIDAK bisa membaca nama customer, dan invoice
--   entitas non-home kembali tak terbaca.
--
-- =============================================================================
-- =============================================================================
--
-- BEGIN;
--
-- ALTER POLICY prospects_read ON public.accounts
--   USING ((public.is_super_admin() OR ((company_id IN ( SELECT public.get_user_company_ids() AS get_user_company_ids)) AND (public.is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (public.has_role('operations'::text) AND ((account_status)::text = 'customer'::text)) OR public.has_role('procurement'::text)))));
--
-- ALTER POLICY sp_invoices_read ON public.sp_invoices
--   USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));
--
-- ALTER POLICY sp_invoice_lines_read ON public.sp_invoice_lines
--   USING ((public.is_super_admin() OR (EXISTS ( SELECT 1
--      FROM public.sp_invoices i
--     WHERE ((i.id = sp_invoice_lines.invoice_id) AND (i.company_id = public.get_user_company_id()))))));
--
-- ALTER POLICY sp_order_items_read ON public.sp_order_items
--   USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));
--
-- COMMIT;
--
-- (Keempat klausa di atas disalin VERBATIM dari schema_snapshot.sql sebelum
--  migrasi ini — bukan ditulis ulang dari ingatan.)
-- =============================================================================
