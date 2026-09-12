-- =============================================================================
-- Migration: 20260912000004_is_procurement_functional
-- Phase:     Pilot 2 pecah role per-posisi — SCM Procurement. Potongan B dari 2:
--            2 fungsi guard (is_procurement_functional / _in) + 14 ALTER POLICY
--            yang mengganti has_role('procurement') + prf_claim (literal kode →
--            helper entitas-bound) + penutupan TD-180 di sales_orders_select.
--            Potongan A (role + menu): 20260912000003_proc_roles_menu_defaults.
-- Depends:   - 20260912000003 LIVE dan ROSTER SUDAH DIPINDAH ke proc_manager /
--              proc_staff (lihat URUTAN — ini prasyarat perilaku, bukan prasyarat
--              DDL: fungsi & policy di sini tidak menuntut role-nya ada).
--            - has_role() · is_super_admin() · is_manager_or_above() ·
--              get_user_company_ids() (semua sudah ada).
--            - Ke-14 policy + prf_claim HARUS masih berbentuk seperti di bagian
--              INVENTARIS (dicek 12 Sep 2026: teks produksi = staging = snapshot).
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 12 Sep 2026 SESUDAH
--            roster produksi dipindah, urutan STAGING (oovmlhilhqzejnawqkvt)
--            dulu lalu PRODUKSI (untmpqceexwxzuhlmyrg). Diverifikasi ulang
--            baca-saja dari kedua DB saat header ini ditulis, hasil identik:
--            nol sisa has_role('procurement') di pg_policies · 14 policy memuat
--            is_procurement_functional() · sales_orders_select jamak ·
--            prf_claim memakai is_procurement_functional_in(v_company) · kedua
--            helper terpasang, ACL benar (authenticated = true, anon = false).
--            Snapshot BELUM di-refresh — 3 fungsi + 14 policy menunggu pg_dump.
--
-- SIFAT: 2 CREATE OR REPLACE FUNCTION (baru; belum ada di kedua DB) + ACL +
--   COMMENT + 14 ALTER POLICY + 1 CREATE OR REPLACE FUNCTION prf_claim (badan
--   lama verbatim kecuali satu blok guard). Nol DDL tabel, nol data, nol GRANT
--   tabel. ACL prf_claim tidak disentuh (CREATE OR REPLACE mempertahankannya;
--   TD-232 tetap OPEN, di luar scope).
--   Setiap ALTER POLICY hanya mengganti has_role('procurement'::text) →
--   is_procurement_functional(); sisa ekspresi VERBATIM dari pg_policies
--   produksi — KECUALI sales_orders_select yang juga mengganti klausa
--   entitas singular → jamak (TD-180, keputusan Den 12 Sep 2026). Klausa yang
--   tidak memuat 'procurement' tetap ditulis ulang verbatim (WITH CHECK
--   prf_cost_items_update, prf_vendor_offers_update, vendors_update,
--   prf_update_status) supaya tidak bergantung pada semantik "klausa yang tak
--   disebut dipertahankan".
--
-- ── INVENTARIS (pg_policies + pg_proc PRODUKSI & STAGING, 12 Sep 2026 — identik) ─
--   14 policy / 7 tabel — semuanya bermakna "orang procurement", dan semua
--   aksi TULIS di dalamnya sudah dibatasi lagi oleh acknowledged_by (pemegang
--   PRF), jadi memberi keduanya ke proc_manager tidak membuka apa pun yang
--   bukan miliknya:
--     #1  accounts.prospects_read                 SELECT  USING
--     #2  inquiries.inquiries_read                SELECT  USING  (procurement: hanya inquiry ber-PRF)
--     #3  prf.prf_select                          SELECT  USING
--     #4  prf.prf_update_status                   UPDATE  USING + WITH CHECK
--     #5  prf_cost_items.prf_cost_items_delete    DELETE  USING
--     #6  prf_cost_items.prf_cost_items_insert    INSERT  WITH CHECK
--     #7  prf_cost_items.prf_cost_items_select    SELECT  USING
--     #8  prf_cost_items.prf_cost_items_update    UPDATE  USING + WITH CHECK
--     #9  prf_vendor_offers.prf_vendor_offers_insert  INSERT  WITH CHECK
--     #10 prf_vendor_offers.prf_vendor_offers_select  SELECT  USING
--     #11 prf_vendor_offers.prf_vendor_offers_update  UPDATE  USING + WITH CHECK
--     #12 sales_orders.sales_orders_select        SELECT  USING  (+ TD-180, lihat bawah)
--     #13 vendors.vendors_insert                  INSERT  WITH CHECK
--     #14 vendors.vendors_update                  UPDATE  USING + WITH CHECK
--   Fungsi (gotcha #26, pg_proc.prosrc): SATU — prf_claim, literal
--   `r.code = 'procurement'` yang diuji DI ENTITAS PRF (ur.company_id =
--   prf.company_id, bentuk 20260907000001). prf_release & prf_select_offer
--   level-based (r.level <= 6, tak menyebut nama) → proc_manager level 4 lolos
--   otomatis, proc_staff tidak — persis maksud pemisahan. prf_mark_quoted
--   pemegang-only. save_prf_pricing hanya komentar. Nol constraint/trigger/view.
--   FE (commit terpisah, bukan file ini): PRFDetailPage.jsx:75 canEdit,
--   SalesOrderDocDetailPage.jsx:119 prfDefinitive, roleResolution.js:19
--   ERP_ROLE_PRIORITY.
--
-- ── DESAIN FUNGSI ──────────────────────────────────────────────────────────
--   - Dua fungsi, preseden is_manager_or_above() / is_manager_or_above_in():
--       is_procurement_functional()            — pengganti has_role('procurement')
--                                                di policy; cakupan entitas
--                                                TETAP dari klausa company_id
--                                                masing-masing policy (semua
--                                                sudah jamak get_user_company_ids()
--                                                kecuali #12 yang ikut dijamakkan).
--       is_procurement_functional_in(uuid)     — MENGIKAT role ke entitas baris;
--                                                dipakai prf_claim yang bentuk
--                                                lamanya memang entitas-bound
--                                                (gotcha #26). Jangan diganti
--                                                varian tanpa parameter.
--   - Bentuk persis is_sp_item_writer / is_hcga_functional: LANGUAGE sql STABLE
--     SECURITY DEFINER, SET search_path, REVOKE FROM PUBLIC + GRANT EXECUTE TO
--     authenticated.
--   - Daftar kode EKSPLISIT ('proc_manager','proc_staff'), bukan LIKE 'proc_%'.
--     Legacy 'procurement' SENGAJA tidak dimasukkan — role dibiarkan dormant
--     (keputusan Den 12 Sep 2026) dan roster sudah pindah sebelum file ini.
--   - Berbasis KODE, bukan level: proc_staff (7) mendapat hak "orang
--     procurement" lewat helper ini; proc_manager (4) mendapat itu PLUS
--     manager-ke-atas lewat level (prf_release / prf_select_offer / 52 policy).
--
-- ── TD-180 di sales_orders_select (#12) ────────────────────────────────────
--   Klausa lama `company_id = get_user_company_id()` (home company, singular).
--   Dery & Camelia: home SOA, role hanya @MSI, dan 2 SO yang ada semuanya MSI →
--   inbox "Sales Order" procurement KOSONG SENYAP untuk keduanya (nol baris,
--   nol error) — instance TD-180 berikutnya, ketahuan dari sisir literal
--   'procurement', bukan dari keluhan. Diganti `company_id IN (SELECT
--   get_user_company_ids())` (pola 13 policy lain di batch ini). Efek samping
--   yang disetujui: manager/pembuat SO multi-entitas melihat SO di semua
--   entitas role-nya.
--
-- ── BLAST RADIUS (diukur 12 Sep 2026, produksi) ────────────────────────────
--   - PRF: 337 (semua MSI) — 78 SUBMITTED · 249 ACKNOWLEDGED · 1 QUOTED · 9 DRAFT.
--     Pemegang: Dwi 148 · Camelia 99 · Den 2 · SCM Master 1 · Dery 0.
--   - Jalur tulis FE ke tabel #4-#11: PRFDetailPage (jawaban harga, cost items,
--     penawaran vendor, klaim/lepas/nyatakan siap), PRFVendorOfferModal,
--     save_prf_pricing (SECURITY INVOKER → bersandar pada #4/#6/#8). Semua
--     bergantung pada helper ini sesudah roster pindah — itu sebabnya B wajib
--     SESUDAH roster, bukan sebelum.
--   - #1 prospects_read & #2 inquiries_read & #12 sales_orders_select: baca saja.
--   - #13/#14 vendors: 7 vendor (MSI 3, SOA 4).
--
-- ── URUTAN DEPLOY ──────────────────────────────────────────────────────────
--   A (20260912000003) → roster manual Den (incl. pemulihan 3 entitas
--   Dery/Camelia) → B (file ini). Kalau B mendahului roster: pemegang
--   'procurement' lama kehilangan tulis PRF/penawaran/vendor & klaim PRF
--   (baca tetap lewat prf_select? TIDAK — prf_select juga berpindah ke
--   helper; yang tersisa hanya PRF buatan sendiri). Jangan dibalik urutannya.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   Kebalikan persis: 14 ALTER POLICY mengembalikan is_procurement_functional()
--   → has_role('procurement'::text) (+ #12 kembali singular), prf_claim
--   kembali ke badan 20260907000001 (literal 'procurement'), lalu DROP kedua
--   fungsi. Wajib ALTER POLICY + prf_claim dulu — DROP FUNCTION ditolak
--   selama masih dirujuk.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi. DIHARAPKAN: 14 · 1 · 0 · 1
-- ═════════════════════════════════════════════════════════════════════════════
SELECT (SELECT count(*) FROM pg_policies
         WHERE qual ILIKE '%has_role(''procurement''%' OR with_check ILIKE '%has_role(''procurement''%') AS policy_procurement_sebelum,
       (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND prosrc ~ '''procurement''')          AS fungsi_literal_sebelum,
       (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'is_procurement_functional%') AS helper_sebelum,
       (SELECT count(*) FROM pg_policies
         WHERE policyname = 'sales_orders_select' AND qual ILIKE '%get_user_company_id()%')   AS so_singular_sebelum;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fungsi guard 1/2 — tanpa parameter (pengganti has_role di policy) ────────
CREATE OR REPLACE FUNCTION public.is_procurement_functional() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    WHERE  ur.user_id   = auth.uid()
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  r.code IN ('proc_manager','proc_staff')
  );
$$;

ALTER FUNCTION public.is_procurement_functional() OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.is_procurement_functional() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_procurement_functional() TO authenticated;

COMMENT ON FUNCTION public.is_procurement_functional() IS
  'True bila user memegang role fungsional SCM Procurement aktif (proc_manager/proc_staff) di entitas '
  'mana pun — pengganti has_role(''procurement'') di 14 policy (migrasi 20260912000004). Cakupan entitas '
  'TETAP dari klausa company_id di tiap policy (pola is_manager_or_above()). Daftar kode eksplisit, bukan '
  'LIKE ''proc_%''. Legacy ''procurement'' sengaja tidak dimasukkan (dormant sejak pilot 2, 12 Sep 2026). '
  'Kembaran entitas-bound: is_procurement_functional_in(uuid).';

-- ── Fungsi guard 2/2 — MENGIKAT role ke entitas baris (dipakai prf_claim) ────
CREATE OR REPLACE FUNCTION public.is_procurement_functional_in(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    WHERE  ur.user_id    = auth.uid()
      AND  ur.company_id = p_company_id
      AND  ur.is_active  = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  r.code IN ('proc_manager','proc_staff')
  );
$$;

ALTER FUNCTION public.is_procurement_functional_in(p_company_id uuid) OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.is_procurement_functional_in(p_company_id uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_procurement_functional_in(p_company_id uuid) TO authenticated;

COMMENT ON FUNCTION public.is_procurement_functional_in(p_company_id uuid) IS
  'Kembaran is_procurement_functional() yang MENGIKAT role ke entitas baris (pola is_manager_or_above_in, '
  'gotcha #26). Dipakai prf_claim menggantikan literal r.code = ''procurement'' yang diuji di entitas PRF '
  '(bentuk 20260907000001). Migrasi 20260912000004.';

-- ── #1 accounts ──────────────────────────────────────────────────────────────
ALTER POLICY prospects_read ON public.accounts
  USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid())
         OR (has_role('operations'::text) AND ((account_status)::text = 'customer'::text))
         OR ((has_role('finance'::text) OR has_role('finance_controller'::text)) AND ((account_status)::text = 'customer'::text))
         OR is_procurement_functional())));

-- ── #2 inquiries ─────────────────────────────────────────────────────────────
ALTER POLICY inquiries_read ON public.inquiries
  USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (is_manager_or_above() OR (created_by = auth.uid())
         OR (is_procurement_functional() AND (EXISTS (
               SELECT 1 FROM prf p
               WHERE (p.inquiry_id = inquiries.id) AND (p.company_id = inquiries.company_id) AND (p.deleted_at IS NULL)))))));

-- ── #3-#4 prf ────────────────────────────────────────────────────────────────
ALTER POLICY prf_select ON public.prf
  USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND ((created_by = auth.uid()) OR is_procurement_functional() OR is_manager_or_above())));

ALTER POLICY prf_update_status ON public.prf
  USING      (is_super_admin() OR ((deleted_at IS NULL) AND (company_id IN (SELECT get_user_company_ids()))
    AND is_procurement_functional()
    AND ((status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text]))
    AND ((acknowledged_by IS NULL) OR (acknowledged_by = auth.uid()))))
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND is_procurement_functional()));

-- ── #5-#8 prf_cost_items ─────────────────────────────────────────────────────
ALTER POLICY prf_cost_items_delete ON public.prf_cost_items
  USING (EXISTS (
    SELECT 1 FROM prf p
    WHERE (p.id = prf_cost_items.prf_id)
      AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids()))
           AND is_procurement_functional()
           AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text]))
           AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid()))))));

ALTER POLICY prf_cost_items_insert ON public.prf_cost_items
  WITH CHECK (EXISTS (
    SELECT 1 FROM prf p
    WHERE (p.id = prf_cost_items.prf_id)
      AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids()))
           AND is_procurement_functional()
           AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text]))
           AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid()))))));

ALTER POLICY prf_cost_items_select ON public.prf_cost_items
  USING (EXISTS (
    SELECT 1 FROM prf p
    WHERE (p.id = prf_cost_items.prf_id)
      AND (is_super_admin() OR ((p.company_id IN (SELECT get_user_company_ids()))
           AND ((p.created_by = auth.uid()) OR is_procurement_functional() OR is_manager_or_above())))));

ALTER POLICY prf_cost_items_update ON public.prf_cost_items
  USING (EXISTS (
    SELECT 1 FROM prf p
    WHERE (p.id = prf_cost_items.prf_id)
      AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids()))
           AND is_procurement_functional()
           AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text]))
           AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid()))))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM prf p
    WHERE (p.id = prf_cost_items.prf_id)
      AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids()))
           AND is_procurement_functional()
           AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text]))
           AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid()))))));

-- ── #9-#11 prf_vendor_offers ─────────────────────────────────────────────────
ALTER POLICY prf_vendor_offers_insert ON public.prf_vendor_offers
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND is_procurement_functional() AND (created_by = auth.uid())
    AND (EXISTS (SELECT 1 FROM prf p WHERE (p.id = prf_vendor_offers.prf_id) AND (p.acknowledged_by = auth.uid())))));

ALTER POLICY prf_vendor_offers_select ON public.prf_vendor_offers
  USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (is_procurement_functional() OR is_manager_or_above()
         OR (EXISTS (SELECT 1 FROM prf p WHERE (p.id = prf_vendor_offers.prf_id) AND (p.created_by = auth.uid()))))));

ALTER POLICY prf_vendor_offers_update ON public.prf_vendor_offers
  USING      (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND is_procurement_functional()
    AND (EXISTS (SELECT 1 FROM prf p WHERE (p.id = prf_vendor_offers.prf_id) AND (p.acknowledged_by = auth.uid())))))
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND is_procurement_functional()
    AND (EXISTS (SELECT 1 FROM prf p WHERE (p.id = prf_vendor_offers.prf_id) AND (p.acknowledged_by = auth.uid())))));

-- ── #12 sales_orders — helper + TD-180 (singular → jamak) ────────────────────
ALTER POLICY sales_orders_select ON public.sales_orders
  USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND ((created_by = auth.uid()) OR is_procurement_functional() OR is_manager_or_above())));

-- ── #13-#14 vendors ──────────────────────────────────────────────────────────
ALTER POLICY vendors_insert ON public.vendors
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (is_manager_or_above() OR is_procurement_functional())));

ALTER POLICY vendors_update ON public.vendors
  USING      (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (deleted_at IS NULL)
    AND (is_manager_or_above() OR is_procurement_functional())))
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (is_manager_or_above() OR is_procurement_functional())));

-- ── prf_claim — badan 20260907000001 VERBATIM kecuali blok guard: EXISTS
--    ber-literal r.code = 'procurement' → is_procurement_functional_in(v_company).
--    Signature/atribut/ACL tak berubah. ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prf_claim(p_prf_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_ack     uuid;
BEGIN
  SELECT company_id, status, acknowledged_by
    INTO v_company, v_status, v_ack
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  -- Role diuji DI ENTITAS PRF (gotcha #26) — sama seperti 20260907000001,
  -- kini lewat helper supaya daftar kode hidup di satu tempat.
  IF NOT (is_super_admin() OR is_procurement_functional_in(v_company)) THEN
    RAISE EXCEPTION 'Tidak berhak mengambil PRF ini';
  END IF;

  IF v_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'PRF harus berstatus SUBMITTED (sekarang: %)', v_status;
  END IF;

  IF v_ack IS NOT NULL THEN
    RAISE EXCEPTION 'PRF sudah diambil orang lain';
  END IF;

  UPDATE prf
  SET status = 'ACKNOWLEDGED', acknowledged_by = v_uid, acknowledged_at = now()
  WHERE id = p_prf_id;
END;
$$;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — nol sisa has_role('procurement') di policy mana pun. DIHARAPKAN 0.
SELECT count(*) AS sisa_procurement_policy
FROM   pg_policies
WHERE  qual ILIKE '%has_role(''procurement''%' OR with_check ILIKE '%has_role(''procurement''%';

-- V2 — persis 14 policy / 7 tabel memuat is_procurement_functional(). DIHARAPKAN 14 baris:
--      accounts 1 · inquiries 1 · prf 2 · prf_cost_items 4 · prf_vendor_offers 3 · sales_orders 1 · vendors 2
SELECT tablename, policyname, cmd
FROM   pg_policies
WHERE  qual ILIKE '%is_procurement_functional()%' OR with_check ILIKE '%is_procurement_functional()%'
ORDER  BY tablename, policyname;

-- V3 — pg_proc: nol literal 'procurement' tersisa; prf_claim memakai helper _in. DIHARAPKAN 0 · true
SELECT (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND prosrc ~ '''procurement''') AS literal_sisa,
       (SELECT prosrc ILIKE '%is_procurement_functional_in(v_company)%' FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = 'prf_claim') AS prf_claim_pakai_helper;

-- V4 — TD-180 tertutup: sales_orders_select jamak. DIHARAPKAN plural = true, singular = false
SELECT (qual ILIKE '%get_user_company_ids()%') AS plural,
       (qual ILIKE '%get_user_company_id()%')  AS singular
FROM   pg_policies WHERE policyname = 'sales_orders_select';

-- V5 — klausa yang harus tetap utuh. DIHARAPKAN 3 baris, semua true:
--      prospects_read masih operations/finance/finance_controller · inquiries_read masih EXISTS prf ·
--      prf_update_status USING masih 3 status + acknowledged_by.
SELECT policyname,
       CASE policyname
         WHEN 'prospects_read'    THEN qual ILIKE '%has_role(''operations''%' AND qual ILIKE '%has_role(''finance_controller''%'
         WHEN 'inquiries_read'    THEN qual ILIKE '%FROM prf p%'
         WHEN 'prf_update_status' THEN qual ILIKE '%QUOTED%' AND qual ILIKE '%acknowledged_by = auth.uid()%'
       END AS utuh
FROM   pg_policies
WHERE  policyname IN ('prospects_read','inquiries_read','prf_update_status')
ORDER  BY policyname;

-- V6 — ACL & atribut kedua fungsi. DIHARAPKAN tiap baris: auth true · anon false · secdef true · STABLE ('s')
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_harus_false,
       p.prosecdef AS secdef, p.provolatile AS volatile, p.proconfig AS search_path
FROM   pg_proc p
WHERE  p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'is_procurement_functional%'
ORDER  BY p.proname;


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser, PRODUKSI — staging tidak punya PRF/SO nyata;
-- di staging cukup V1-V6 + halaman PRF/Vendor List tidak error).
-- Prasyarat: roster sudah pindah, FE yang mengenal proc_* sudah mendarat.
--   1. Dwi (proc_staff): buka PRF ACKNOWLEDGED miliknya → panel Jawaban Harga
--      & Penawaran Vendor bisa disimpan (#4/#6/#8/#9/#11 lewat helper);
--      Vendor List: tambah/edit vendor jalan (#13/#14); Sales Order inbox
--      menampilkan 2 SO MSI (#12).
--   2. Dery (proc_manager): buka PRF SUBMITTED → "Ambil PRF Ini" jalan
--      (prf_claim lewat helper _in); buka PRF milik Dwi → tombol "Lepas PRF"
--      muncul & jalan (prf_release lewat level 4 — bukan file ini, tapi
--      inilah alasan level 4); Sales Order inbox TIDAK lagi kosong walau home
--      company SOA (#12 TD-180).
--   3. Camelia (proc_staff, home SOA): sesudah pemulihan 3 entitas — PRF
--      miliknya (99) tetap terlihat & bisa dikerjakan.
-- =============================================================================
