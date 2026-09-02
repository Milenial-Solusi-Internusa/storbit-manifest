-- =============================================================================
-- Migration: 20260902000006_td180_sp_btb_dc_master
-- Phase:     TD-180 BATCH 2 — perluas company-scope RLS dari get_user_company_id()
--            (TUNGGAL, home company) ke get_user_company_ids() (JAMAK, semua
--            company tempat user punya role aktif).
-- Depends:   get_user_company_ids() · get_user_company_id() · is_super_admin()
--            · is_manager_or_above() · has_role()
-- Status:    LIVE. Dijalankan manual di SQL Editor oleh Den, 2 September 2026,
--            dan terverifikasi bekerja (akun Elvira Nurhuda: kartu BTB Numbers
--            + kartu DC Tujuan akhirnya terisi). File ini RETROAKTIF — direkam
--            ke repo SESUDAH dieksekusi, bukan sebelum.
--
-- =============================================================================
-- GEJALA YANG DILAPORKAN (terverifikasi di produksi, 2 Sep 2026)
-- =============================================================================
--   Akun: Elvira Nurhuda — Finance MSI yang juga aktif di SOA.
--     1. Kartu "BTB Numbers" (Detail SP) menampilkan "0 nomor BTB" padahal
--        data BTB-nya ADA (dikonfirmasi Den via SQL manual).
--     2. Kartu "DC Tujuan" (Detail SP, baru 2 Sep 2026) menampilkan "—" untuk
--        Nama dan Alamat padahal SP-nya punya dc_id yang valid.
--
-- =============================================================================
-- MEKANISME — kenapa NOL baris, bukan error
-- =============================================================================
--   get_user_company_id()  = profiles.company_id  -> HOME company saja
--   get_user_company_ids() = SETOF company_id dari user_roles yang aktif
--   (Keduanya BEDA SUMBER. Lihat COMMENT masing-masing di schema.)
--
--   Elvira: home = MSI; role aktif = finance+finance_controller di MSI
--           DAN finance+finance_controller di SOA.
--     -> get_user_company_id()  = MSI
--     -> get_user_company_ids() = {MSI, SOA}
--
--   Sementara di produksi: SELURUH 468 baris sp_btb dan SELURUH 47 baris
--   dc_master ber-company_id = SOA (Storbit memang entitas SOA).
--
--   Jadi predikat `company_id = get_user_company_id()` berbunyi `SOA = MSI`
--   -> FALSE untuk SETIAP baris -> RLS menyaring habis. PostgREST mengembalikan
--   array kosong dengan HTTP 200: GAGAL SENYAP, bukan 403. Itulah kenapa UI
--   menampilkan "0 nomor BTB" / "—" alih-alih pesan error.
--
--   ⚠️ Ini BUKAN kasus khusus Elvira. Konsekuensinya: SETIAP user non-
--   super_admin yang home company-nya bukan SOA terblokir dari SELURUH sp_btb
--   dan dc_master, sebanyak apa pun role SOA aktif yang ia punya.
--
-- =============================================================================
-- PERBAIKAN
-- =============================================================================
--   Tambahkan bypass `OR company_id IN (SELECT get_user_company_ids())` —
--   pola PERSIS TD-180 batch 1 yang sudah hidup di produksi:
--     companies_read_own   (schema_snapshot.sql:47635)
--     roles_read           (:49579)
--     journal_entries_read (:48575)
--     sp_orders_read       (:49979)  <- padanan struktural paling dekat
--
--   Suku `company_id = get_user_company_id()` DIPERTAHANKAN, tidak diganti.
--   Bukan redundan: get_user_company_ids() membaca user_roles, sementara
--   get_user_company_id() membaca profiles — user yang punya home company
--   TANPA role aktif di sana akan kehilangan akses kalau suku itu dibuang.
--   Preseden batch 1 juga mempertahankan keduanya.
--
--   Untuk sp_btb_insert & sp_btb_update: syarat PERAN
--   (is_manager_or_above() OR has_role('operations')) DIPERTAHANKAN APA ADANYA.
--   Yang diperluas HANYA sisi company-scope-nya. Migrasi ini TIDAK memberi
--   izin tulis kepada siapa pun yang sebelumnya tidak punya.
--
-- =============================================================================
-- CAKUPAN & YANG SENGAJA TIDAK DILAKUKAN
-- =============================================================================
--   - EMPAT policy saja: sp_btb_read, sp_btb_insert, sp_btb_update,
--     dc_master_read.
--   - dc_master_insert & dc_master_update punya CACAT YANG SAMA PERSIS tapi
--     SENGAJA TIDAK DISENTUH (di luar scope yang diminta). Keduanya juga
--     menuntut manager/operations, sehingga tidak menjelaskan gejala Elvira
--     (finance). Catat sebagai TD-180 batch 3.
--   - sp_btb_delete & dc_master_delete super_admin-only -> tidak terpengaruh.
--   - Klausa `TO` DIPERTAHANKAN apa adanya (keempatnya memang tanpa `TO`,
--     beda dari batch 1 yang memakai `TO authenticated`). Menambahkannya di
--     sini = perubahan perilaku di luar yang diminta.
--   - NOL perubahan frontend diperlukan. Kartu "BTB Numbers" (listSpBtbNew)
--     dan "DC Tujuan" (embed dc_master di getSpOrderStatus) SUDAH menanyakan
--     baris yang benar; RLS-lah yang menyaringnya habis. Begitu policy
--     diperluas, keduanya langsung terisi tanpa deploy FE.
--
-- DIBUNGKUS TRANSAKSI: DROP POLICY lalu CREATE POLICY meninggalkan jendela
--   tanpa policy. RLS fail-closed (jadi TIDAK ada kebocoran), tapi jendela itu
--   membuat semua orang kehilangan akses sesaat. BEGIN/COMMIT meniadakannya.
-- =============================================================================

BEGIN;

-- ─── 1. sp_btb_read ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sp_btb_read ON public.sp_btb;
CREATE POLICY sp_btb_read ON public.sp_btb FOR SELECT
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id())
    OR (company_id IN (SELECT public.get_user_company_ids()))
  );

-- ─── 2. sp_btb_insert ────────────────────────────────────────────────────────
-- Syarat peran TIDAK diubah — hanya company-scope yang diperluas.
DROP POLICY IF EXISTS sp_btb_insert ON public.sp_btb;
CREATE POLICY sp_btb_insert ON public.sp_btb FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      (
        (company_id = public.get_user_company_id())
        OR (company_id IN (SELECT public.get_user_company_ids()))
      )
      AND (public.is_manager_or_above() OR public.has_role('operations'::text))
    )
  );

-- ─── 3. sp_btb_update ────────────────────────────────────────────────────────
-- Syarat peran TIDAK diubah — hanya company-scope yang diperluas.
DROP POLICY IF EXISTS sp_btb_update ON public.sp_btb;
CREATE POLICY sp_btb_update ON public.sp_btb FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      (
        (company_id = public.get_user_company_id())
        OR (company_id IN (SELECT public.get_user_company_ids()))
      )
      AND (public.is_manager_or_above() OR public.has_role('operations'::text))
    )
  );

-- ─── 4. dc_master_read ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS dc_master_read ON public.dc_master;
CREATE POLICY dc_master_read ON public.dc_master FOR SELECT
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id())
    OR (company_id IN (SELECT public.get_user_company_ids()))
  );

COMMIT;

-- ─── VERIFIKASI (jalankan TERPISAH sesudahnya) ───────────────────────────────
--   -- a. Definisi baru terpasang (keempatnya HARUS memuat get_user_company_ids):
--   SELECT polname,
--          pg_get_expr(polqual,      polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--     FROM pg_policy
--    WHERE polrelid IN ('public.sp_btb'::regclass, 'public.dc_master'::regclass)
--    ORDER BY polrelid::regclass::text, polname;
--
--   -- b. Sisa policy yang MASIH memakai varian tunggal (peta TD-180 batch 3):
--   SELECT polrelid::regclass AS tabel, polname
--     FROM pg_policy
--    WHERE pg_get_expr(polqual, polrelid)      LIKE '%get_user_company_id()%'
--       OR pg_get_expr(polwithcheck, polrelid) LIKE '%get_user_company_id()%'
--    ORDER BY 1, 2;
--   --    dc_master_insert & dc_master_update HARUS masih muncul (sengaja).
--
--   -- c. UJI DARI BROWSER (bukan SQL Editor — auth.uid() NULL di sana),
--   --    login sebagai Elvira Nurhuda (Finance MSI + SOA):
--   --      Detail SP  -> kartu "BTB Numbers"  HARUS menampilkan nomor BTB nyata
--   --                                          (bukan "0 nomor BTB")
--   --      Detail SP  -> kartu "DC Tujuan"     HARUS menampilkan Nama + Alamat
--   --                                          (bukan "—")
--   --    NOL deploy FE diperlukan — cukup reload halaman.
--
--   -- d. NEGATIVE CASE — jangan sampai kebablasan. Login user yang TIDAK punya
--   --    role aktif di SOA sama sekali (mis. akun sales MSI murni):
--   --      kartu BTB & DC Tujuan HARUS tetap kosong. Kalau ikut terisi,
--   --      berarti scope-nya bocor — ROLLBACK.
--
--   -- e. Izin TULIS tidak melebar: user finance (tanpa manager/operations)
--   --    HARUS tetap DITOLAK saat menambah/menghapus BTB, walau kini bisa
--   --    MEMBACANYA. Ini pembeda utama migrasi ini — read melebar, write tidak.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP POLICY IF EXISTS sp_btb_read ON public.sp_btb;
--   CREATE POLICY sp_btb_read ON public.sp_btb FOR SELECT
--     USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));
--   DROP POLICY IF EXISTS sp_btb_insert ON public.sp_btb;
--   CREATE POLICY sp_btb_insert ON public.sp_btb FOR INSERT
--     WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id())
--       AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));
--   DROP POLICY IF EXISTS sp_btb_update ON public.sp_btb;
--   CREATE POLICY sp_btb_update ON public.sp_btb FOR UPDATE
--     USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id())
--       AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));
--   DROP POLICY IF EXISTS dc_master_read ON public.dc_master;
--   CREATE POLICY dc_master_read ON public.dc_master FOR SELECT
--     USING ((public.is_super_admin() OR (company_id = public.get_user_company_id())));
-- COMMIT;
--   ⚠️ Rollback ini MENGEMBALIKAN kedua gejala Elvira di atas.
