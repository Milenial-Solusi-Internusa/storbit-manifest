-- =============================================================================
-- Migration: 20260909000002_td180_quotations_plural
-- Phase:     Quotation versioning & approval (2/5) — TD-180 instance kelima.
-- Depends:   public.user_roles · public.roles · is_super_admin()
--            · get_user_company_ids()
-- Status:    LIVE — staging 9 Sep 2026, produksi 9 Sep 2026.
--
-- ⚠️⚠️ SATU-SATUNYA MIGRASI DI BATCH INI YANG MENGUBAH OTORISASI.
--      AGENTS.md "RLS Policy Change: Critical risk" — wajib diuji minimal
--      dua role, DARI BROWSER, sebelum naik ke produksi.
--
-- MASALAH YANG DITUTUP
--   Ketujuh policy quotations/quotation_items memakai get_user_company_id()
--   SINGULAR — yang membaca profiles.company_id, alias entitas HOME saja.
--   User yang punya role aktif di entitas LAIN (pola Elvira: home MSI, role
--   aktif di SOA) ter-blokir SENYAP: nol baris, BUKAN error.
--   Ini instance KELIMA TD-180 (18 Agu, 2 Sep, 5 Sep, 7 Sep, sekarang).
--
--   Alur revisi menyentuh KETUJUHNYA, bukan cuma quotations_update:
--     create_quotation_revision -> INSERT quotations  (quotations_insert)
--                               -> INSERT items       (quotation_items_insert)
--                               -> UPDATE sumber      (quotations_update)
--     save_quotation            -> DELETE+INSERT item (quotation_items_delete/insert)
--   Memperbaiki satu policy saja = alur revisi tetap patah senyap.
--
-- ⛔ KENAPA BUKAN SEKADAR TUKAR SINGULAR -> JAMAK
--   03_DATA_MODEL.md gotcha #26 (lahir dari sesi PRF 7 Sep) melarangnya:
--   is_manager_or_above() MENGABAIKAN company. Menukar polos membuat dua
--   syarat yang tadinya terikat jadi lepas — user yang `manager` di SOA tapi
--   cuma `sales` di MSI akan mendapat HAK MANAGER PENUH atas quotation MSI.
--   Itu memperbaiki TD-180 sambil membuka celah baru.
--
--   Bentuk yang BENAR: uji role DI ENTITAS BARIS ITU -> is_manager_or_above_in().
--
-- ⚠️ TD-233 — daftar role manajerial kini hidup di LIMA tempat
--      is_manager_or_above() · mark_delivery_delivered · prf_release
--      · prf_select_offer · is_manager_or_above_in()  <- BARU
--   Duplikasinya DISENGAJA (harga supaya role bisa diikat ke entitas).
--   JANGAN "diperbaiki" dengan mengembalikan panggilan ke is_manager_or_above().
--   Perlakukan sebagai CHECKLIST: ubah daftar role = sentuh KELIMANYA dalam
--   satu migrasi. Perbarui TD-233 dari "EMPAT tempat" jadi "LIMA".
--
-- ⚠️ revoked_at SENGAJA TIDAK DIPERIKSA
--   user_roles.revoked_at ADA, tapi is_manager_or_above() tidak memeriksanya
--   (hanya is_active + valid_until). Fungsi baru ini MENCERMINKAN PERSIS
--   sibling-nya. Menambahkan revoked_at di sini saja akan membuatnya diam-diam
--   LEBIH KETAT dari kembarannya — beda perilaku tak terdokumentasi yang
--   mustahil di-debug nanti. Kalau revoked_at memang harus ikut, ubah KEDUANYA
--   dalam satu migrasi terpisah, bukan di sini.
--
-- ⚠️ CAKUPAN SENGAJA DIBATASI: HANYA company-scoping yang diperbaiki.
--   quotation_items TIDAK punya cabang manager/owner hari ini — siapa pun di
--   entitas yang sama bisa baca/tulis item milik quotation yang header-nya
--   tak boleh ia baca. Itu ketimpangan LAMA (item lebih longgar dari header).
--   TIDAK diperketat di sini: keputusan Den #5 berbunyi "jangan bikin gate baru
--   yang lebih ketat". Dicatat sebagai temuan, bukan dikerjakan diam-diam.
--
-- BLAST RADIUS — UKUR DULU, JANGAN DITEBAK
--   Jalankan V6 (skrip verifikasi) di produksi SEBELUM migrasi ini.
--   Yang berubah aksesnya HANYA user dengan role aktif di >1 entitas.
--   Kalau V6 mengembalikan 0 baris, migrasi ini nol dampak pada siapa pun
--   hari ini dan murni menutup jebakan untuk ke depan.
-- =============================================================================

-- ─── 1. Helper: is_manager_or_above() versi ber-entitas ──────────────────────
CREATE OR REPLACE FUNCTION public.is_manager_or_above_in(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id    = auth.uid()
      AND ur.company_id = p_company_id
      AND ur.is_active  = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
  );
$$;

ALTER FUNCTION public.is_manager_or_above_in(uuid) OWNER TO postgres;

REVOKE ALL     ON FUNCTION public.is_manager_or_above_in(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_manager_or_above_in(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_manager_or_above_in(uuid) IS
  'Kembaran is_manager_or_above() yang MENGIKAT role ke entitas baris. Dipakai policy quotations/quotation_items agar TD-180 tertutup tanpa memutus keterkaitan dua syarat (gotcha #26). Daftar role WAJIB bergerak bersama TD-233 (lima tempat).';


-- ─── 2. quotations — 3 policy ────────────────────────────────────────────────
-- Bentuk dipertahankan PERSIS (klausa TO, USING vs WITH CHECK); yang berubah
-- HANYA sumbu company + pengikatan role ke entitas.

DROP POLICY IF EXISTS quotations_insert ON public.quotations;
CREATE POLICY quotations_insert ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS quotations_read ON public.quotations;
CREATE POLICY quotations_read ON public.quotations
  FOR SELECT
  USING (
    (company_id IN (SELECT public.get_user_company_ids())
     AND (public.is_manager_or_above_in(company_id) OR created_by = auth.uid()))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS quotations_update ON public.quotations;
CREATE POLICY quotations_update ON public.quotations
  FOR UPDATE
  USING (
    (company_id IN (SELECT public.get_user_company_ids())
     AND (public.is_manager_or_above_in(company_id) OR created_by = auth.uid()))
    OR public.is_super_admin()
  )
  WITH CHECK (
    (company_id IN (SELECT public.get_user_company_ids())
     AND (public.is_manager_or_above_in(company_id) OR created_by = auth.uid()))
    OR public.is_super_admin()
  );


-- ─── 3. quotation_items — 4 policy ───────────────────────────────────────────
-- Bentuk EXISTS-ke-quotations dipertahankan apa adanya. Tidak ada cabang
-- manager/owner yang ditambahkan (lihat catatan CAKUPAN di header).

DROP POLICY IF EXISTS quotation_items_read ON public.quotation_items;
CREATE POLICY quotation_items_read ON public.quotation_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_items.quotation_id
      AND (q.company_id IN (SELECT public.get_user_company_ids())
           OR public.is_super_admin())
  ));

DROP POLICY IF EXISTS quotation_items_insert ON public.quotation_items;
CREATE POLICY quotation_items_insert ON public.quotation_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_items.quotation_id
      AND (q.company_id IN (SELECT public.get_user_company_ids())
           OR public.is_super_admin())
  ));

DROP POLICY IF EXISTS quotation_items_update ON public.quotation_items;
CREATE POLICY quotation_items_update ON public.quotation_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_items.quotation_id
      AND (q.company_id IN (SELECT public.get_user_company_ids())
           OR public.is_super_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_items.quotation_id
      AND (q.company_id IN (SELECT public.get_user_company_ids())
           OR public.is_super_admin())
  ));

DROP POLICY IF EXISTS quotation_items_delete ON public.quotation_items;
CREATE POLICY quotation_items_delete ON public.quotation_items
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.id = quotation_items.quotation_id
      AND (q.company_id IN (SELECT public.get_user_company_ids())
           OR public.is_super_admin())
  ));

-- ─── VERIFIKASI ──────────────────────────────────────────────────────────────
--   -- a. NOL sisa singular di kedua tabel:
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('quotations','quotation_items')
--     AND (qual LIKE '%get_user_company_id()%' OR with_check LIKE '%get_user_company_id()%');
--   -- HARUS 0 baris. (Perhatikan: get_user_company_idS() jamak juga cocok pola
--   --  '%get_user_company_id%' — makanya pola di atas menyertakan '()' penutup.)
--
--   -- b. Ketujuh policy ada:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename IN ('quotations','quotation_items')
--   ORDER BY 1,2;
--   -- HARUS 7 baris.
--
--   -- c. Fungsi baru + ACL:
--   SELECT proname, prosecdef, proconfig, proacl FROM pg_proc
--   WHERE proname='is_manager_or_above_in';
--   -- prosecdef=true · proconfig memuat search_path=public
--   -- proacl TIDAK boleh memuat '=X/postgres' (itu berarti PUBLIC masih bisa EXECUTE)
--
--   -- d. GATE — DARI BROWSER, BUKAN SQL EDITOR (auth.uid() NULL di sini):
--   --    super_admin ............................ semua entitas LOLOS
--   --    sales PEMILIK quotation ................ LOLOS baca + edit
--   --    sales BUKAN pemilik & bukan manager .... DITOLAK  <- REGRESI WAJIB DIUJI
--   --    user multi-entitas (home MSI, role SOA)  quotation SOA TERLIHAT + bisa diedit
--   --    manager-di-SOA tapi sales-di-MSI ....... DITOLAK utk quotation MSI
--   --                                             (inilah yang bentuk tukar-polos
--   --                                              akan LOLOSKAN secara keliru)
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   Definisi ASLI ketujuh policy ada di schema_snapshot.sql:
--     quotations_insert :18531 · quotations_read :18538 · quotations_update :18545
--     quotation_items_delete :18487 · _insert :18496 · _read :18505 · _update :18514
--   Salin apa adanya untuk memulihkan, lalu:
--     DROP FUNCTION IF EXISTS public.is_manager_or_above_in(uuid);
--   ⚠️ Rollback ini MENGEMBALIKAN bug TD-180 — user multi-entitas kembali
--      ter-blokir senyap, dan alur revisi (M3) ikut patah untuk mereka.
