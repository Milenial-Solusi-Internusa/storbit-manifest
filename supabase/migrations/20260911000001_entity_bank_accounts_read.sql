-- =============================================================================
-- Migration: 20260911000001_entity_bank_accounts_read
-- Phase:     TD-254 (instance pertama yang ditutup) — policy BACA terpisah untuk
--            rekening entitas, supaya blok Payment di invoice terbaca Finance.
-- Depends:   get_user_company_ids() (sudah ada). Tidak bergantung pada
--            20260910000001 — keduanya bisa dijalankan dalam urutan apa pun.
--
-- Status:    LIVE — dieksekusi manual di SQL Editor produksi oleh Den (10-11 Sep
--            2026; tanggal persisnya tidak dicatat), terverifikasi runtime akun
--            Elvira 11 Sep 2026: blok Payment invoice terisi (bukan lagi "belum
--            diatur"). Snapshot BELUM di-refresh.
--
-- SIFAT: 1 CREATE POLICY, FOR SELECT. Nol DDL tabel, nol GRANT/REVOKE, nol
--   sentuhan ke policy yang sudah ada (entity_bank_accounts_access TETAP utuh),
--   nol RPC.
--
-- ⭐ MURNI ADITIF, dan TULIS TIDAK BERUBAH — bukan karena kehati-hatian, tapi
--   karena semantik PostgreSQL: policy permissive di-OR-kan per perintah, dan
--   policy FOR SELECT hanya ikut dihitung untuk SELECT. INSERT/UPDATE/DELETE
--   tetap diadili oleh entity_bank_accounts_access sendirian (FOR ALL,
--   admin/super_admin di home company) persis seperti hari ini.
--
-- ── DIAGNOSIS: TERBUKTI DI PRODUKSI 11 Sep 2026 ────────────────────────────
--   Invoice SOA-INV-IX-2026-0074 (SP 2019023, entitas SOA, diterbitkan Elvira
--   Nurhuda hari itu juga) mencetak blok Payment berbunyi "Rekening pembayaran
--   belum diatur untuk entitas ini" — padahal sebelumnya, saat dilihat Super
--   Admin, ia terisi (BCA KCU Kuningan · 217-0496186 · PT Stuja Orbit Abadi).
--
--   Diperiksa langsung ke produksi (query C1/C2, 11 Sep 2026):
--     - baris entity_bank_accounts untuk SOA ADA, is_default = true,
--       is_active = true, terakhir diubah 8 Agu 2026  -> DATA UTUH
--     - invoice & SP-nya sama-sama SOA                -> kunci lookup BENAR
--   Jadi yang tersisa hanya policy.
--
-- ── POLICY YANG MENGHALANGI ───────────────────────────────────────────────
--   entity_bank_accounts_access  (FOR ALL, schema_snapshot.sql:17125)
--     USING ((company_id = get_user_company_id() AND is_admin_or_above())
--            OR is_super_admin())
--
--   Untuk MEMBACA pun harus admin/super_admin DI HOME COMPANY-nya. Role
--   finance_controller dan finance tidak pernah lolos is_admin_or_above()
--   (= super_admin/admin saja) — jadi Finance tak bisa membaca rekening
--   bahkan di entitasnya sendiri, apalagi lintas entitas. Yang dibaca
--   getInvoicePdfData() adalah rekening ENTITAS SP (sp_orders.company_id),
--   bukan entitas login — itu sudah benar; policy-nya yang menolak.
--
--   ⚠️ Pesan "belum diatur" MENYESATKAN: PostgREST mengembalikan nol baris
--   tanpa error, dan FE tak bisa membedakannya dari rekening yang memang
--   belum ada. Kelas yang sama dengan TD-253.
--
-- ── KENAPA POLICY BARU, BUKAN MENGUBAH YANG LAMA ──────────────────────────
--   Policy lama FOR ALL menyamakan izin BACA dengan izin TULIS. Memperlebar
--   USING-nya berarti memperlebar keduanya sekaligus — Finance jadi bisa
--   mengganti nomor rekening yang tercetak di invoice. Itu bukan yang
--   diinginkan. Policy SELECT terpisah memisahkan dua sumbu itu tanpa
--   menyentuh yang lama. Ini instance KETIGA pola "FOR ALL = baca sama dengan
--   tulis" yang ketahuan 10-11 Sep (prospects_read, sp_invoices_read,
--   sekarang ini) — dicatat sebagai TD-254, pola, bukan tiga kejadian.
--
-- ── SIAPA YANG BOLEH MEMBACA SESUDAH INI ──────────────────────────────────
--   Setiap user terautentikasi, untuk rekening entitas yang ia punya role
--   aktif di dalamnya (jamak) ATAU home company-nya (singular, dipertahankan
--   supaya bentuknya sama dengan sp_btb_read/dc_master_read). Rekening bank
--   dicetak di setiap invoice yang dikirim ke customer — ia bukan rahasia;
--   membacanya di entitas sendiri aman. Yang tetap terkunci: rekening entitas
--   tempat user TIDAK punya role, dan seluruh operasi tulis.
--
--   Hari ini tabel itu cuma berisi SATU baris (SOA). MSI dan JCI memang belum
--   punya rekening — untuk invoice mereka, pesan "belum diatur" BENAR.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE POLICY entity_bank_accounts_read ON public.entity_bank_accounts
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id())
    OR (company_id IN (SELECT public.get_user_company_ids()))
  );

COMMENT ON POLICY entity_bank_accounts_read ON public.entity_bank_accounts IS
  'Baca rekening entitas tempat user punya role aktif (atau home company). '
  'Dipisah dari entity_bank_accounts_access (FOR ALL, admin-only) supaya izin '
  'BACA tidak lagi disamakan dengan izin TULIS — TD-254. Migrasi 20260911000001.';

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
--
-- ⚠️ RLS TIDAK BISA diuji dari SQL Editor (auth.uid() NULL, service role
--    bypass). Di sini hanya "policy terpasang & klausanya benar". Bahwa Finance
--    benar-benar melihat rekeningnya dibuktikan di LAPIS 2 (browser).
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — kini DUA policy di tabel ini: yang lama utuh, yang baru FOR SELECT.
--      DIHARAPKAN: 2 baris —
--        entity_bank_accounts_access | ALL    | punya_jamak = f | punya_admin = t
--        entity_bank_accounts_read   | SELECT | punya_jamak = t | punya_admin = f
SELECT policyname,
       cmd,
       qual LIKE '%get_user_company_ids%' AS punya_jamak,
       qual LIKE '%is_admin_or_above%'    AS punya_admin
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'entity_bank_accounts'
ORDER  BY policyname;

-- V2 — policy lama TIDAK berubah satu karakter pun.
--      DIHARAPKAN: 1 baris, utuh = t.
SELECT policyname,
       qual = '(((company_id = get_user_company_id()) AND is_admin_or_above()) OR is_super_admin())' AS utuh
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'entity_bank_accounts'
  AND  policyname = 'entity_bank_accounts_access';

-- V3 — datanya masih di tempat (tak ada yang menyentuh baris).
--      DIHARAPKAN: 1 baris SOA, is_default = t, is_active = t,
--                  account_holder = 'PT Stuja Orbit Abadi'.
SELECT c.code, b.bank_name, b.branch, b.account_number, b.account_holder, b.is_default, b.is_active
FROM   public.entity_bank_accounts b
JOIN   public.companies c ON c.id = b.company_id
ORDER  BY c.code;

-- V4 — COMMENT mendarat.
--      DIHARAPKAN: 1 baris berisi 'TD-254'.
SELECT obj_description(oid, 'pg_policy') AS komentar
FROM   pg_policy
WHERE  polname = 'entity_bank_accounts_read';


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser, akun Elvira) — sesudah V1..V4 lolos
--
--   Buka Detail SP 2019023 (invoice SOA-INV-IX-2026-0074) -> Cetak (Kop Surat).
--   HARUS: blok Payment berisi
--          Bank          Bank Central Asia (BCA) KCU Kuningan
--          Account No.   217-0496186 (IDR)
--          Account Name  PT Stuja Orbit Abadi
--   GAGAL: masih "Rekening pembayaran belum diatur untuk entitas ini"
--          -> policy belum mendarat (cek V1) atau belum hard-refresh.
--
--   ⚠️ Varian download menampilkan hal yang sama — blok Payment ditulis sekali.
-- =============================================================================


-- =============================================================================
-- CATATAN SESUDAH EKSEKUSI
--   1. Ubah header `Status:` jadi LIVE + tanggal SESUDAH lapis 2 lolos (pelajaran
--      TD-243: header bukan bukti).
--   2. Refresh schema_snapshot.sql. ⚠️ Diff-nya lebih besar dari satu policy —
--      snapshot `main` tertinggal dari produksi (objek CRM v3 sejak 9 Sep).
-- =============================================================================




















-- =============================================================================
-- =============================================================================
--
--                        ⛔  B A T A L K A N   —   JANGAN JALANKAN
--                            KECUALI MEMANG MAU MEMBALIKKAN
--
--   Dijauhkan dari alur baca verifikasi dengan sengaja; seluruhnya komentar.
--   Mencabut policy baru mengembalikan keadaan semula: Finance kembali tidak
--   bisa membaca rekening, blok Payment kembali "belum diatur". Policy lama
--   tidak pernah disentuh, jadi tidak ada yang perlu dipulihkan di sana.
--
-- =============================================================================
-- =============================================================================
--
-- BEGIN;
-- DROP POLICY IF EXISTS entity_bank_accounts_read ON public.entity_bank_accounts;
-- COMMIT;
--
-- =============================================================================
