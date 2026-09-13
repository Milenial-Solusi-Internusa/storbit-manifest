-- =============================================================================
-- Migration: 20260912000006_is_sales_functional
-- Phase:     Pilot 3 pecah role per-posisi — Business Development (BD).
--            Potongan B dari 2 (RLS): fungsi guard is_sales_functional() +
--            2 ALTER POLICY yang mengganti has_role('sales') — prf_insert dan
--            sales_orders_insert (yang terakhir sekaligus menutup TD-180:
--            klausa entitas singular → jamak).
--            Potongan A (5 role + 56 default menu): 20260912000005 (LIVE).
-- Depends:   - 20260912000005 LIVE dan ROSTER SUDAH DIPINDAH di produksi
--              (diverifikasi baca-saja 12 Sep 2026: 9 orang tepat 1 baris
--              aktif — Endang bd_sales_spv_console · Martin bd_account_executive
--              · Faris bd_digital_marketing_spv · Nurul/Rossy/Suhana/Maria/
--              Ayu/Gusti bd_sales_executive; NOL pemegang 'sales' tersisa).
--              Prasyarat perilaku, bukan DDL: fungsi & policy di sini tidak
--              menuntut role-nya ada.
--            - FE-1 LIVE di produksi (f6724cd) — gate Buat PRF & mode personal
--              sudah mengenal kode bd_*.
--            - has_role() · is_super_admin() · get_user_company_ids() (ada).
--            - Kedua policy HARUS masih berbentuk seperti di INVENTARIS (dicek
--              12 Sep 2026: teks produksi = staging = snapshot).
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 12-13 Sep 2026 SESUDAH
--            roster produksi dipindah, urutan STAGING (oovmlhilhqzejnawqkvt)
--            dulu lalu PRODUKSI (untmpqceexwxzuhlmyrg). Diverifikasi ulang
--            baca-saja dari kedua DB saat header ini ditulis, hasil identik:
--            nol sisa literal 'sales' di pg_policies · prf_insert &
--            sales_orders_insert memuat is_sales_functional() dengan
--            has_role('gm_bd') tetap · sales_orders_insert jamak (TD-180) ·
--            ACL benar (authenticated = true, anon = false) · pg_proc nol
--            literal 'sales'. Snapshot BELUM di-refresh — 1 fungsi + 2 policy
--            menunggu pg_dump.
--
-- SIFAT: 1 CREATE OR REPLACE FUNCTION (baru; belum ada di kedua DB) + ACL +
--   COMMENT + 2 ALTER POLICY. Nol DDL tabel, nol data, nol GRANT tabel.
--   prf_insert: hanya has_role('sales'::text) → is_sales_functional(); sisa
--   VERBATIM (created_by = auth.uid(), has_role('gm_bd') tetap eksplisit).
--   sales_orders_insert: sama, PLUS `company_id = get_user_company_id()` →
--   `company_id IN (SELECT get_user_company_ids())` (TD-180; semua pemegang
--   hari ini home MSI dengan role @MSI → nol dampak perilaku hari ini, tapi
--   sejajar sales_orders_select yang sudah dijamakkan 20260912000004).
--
-- ── INVENTARIS literal 'sales' (produksi & staging, 12 Sep 2026 — identik) ──
--   RLS: HANYA 2 policy — prf_insert (WITH CHECK) & sales_orders_insert (WITH
--   CHECK). Fungsi SQL: NOL (pg_proc.prosrc tanpa literal 'sales'; gotcha #26
--   sudah disisir). Constraint/trigger/view: nol. Sisanya hidup di FE (roster,
--   isSalesOnly, canCreatePRF, ERP_ROLE_PRIORITY) dan katalog menu — sudah
--   ditangani FE-1 (f6724cd) & FE-2 (commit terpisah sesudah file ini).
--
-- ── DESAIN FUNGSI ──────────────────────────────────────────────────────────
--   - Satu helper cukup: kedua policy bermakna sama — "orang yang menjual"
--     (membuat PRF / SO). Tier (SPV 6 vs exec/AE 7) TIDAK dibedakan di sini;
--     ia dibedakan oleh level (is_manager_or_above) dan SALES_ONLY_ROLES di FE.
--   - Bentuk persis is_hcga_functional / is_procurement_functional: LANGUAGE
--     sql STABLE SECURITY DEFINER, SET search_path, REVOKE FROM PUBLIC +
--     GRANT EXECUTE TO authenticated. Tanpa varian _in: nol RPC memakai
--     literal 'sales', dan kedua policy sudah ber-klausa entitas sendiri.
--   - Daftar kode EKSPLISIT, 4 kode penjual. bd_digital_marketing_spv SENGAJA
--     tidak masuk (keputusan Den #3: nol bukti butuh PRF/SO). Legacy 'sales'
--     SENGAJA tidak masuk — dormant, 0 pemegang sejak roster dipindah.
--   - gm_bd TETAP eksplisit di kedua policy (bukan bagian helper): BD GM
--     membuat PRF/SO by design (kontrak tier A), tapi ia bukan "sales".
--
-- ── BLAST RADIUS (produksi, 12 Sep 2026) ───────────────────────────────────
--   - prf_insert: alur harian sales → PRF (337 PRF; pembuat aktif Nurul 66,
--     Suhana 74, Rossy 54, Ayu 39, Endang 37, Maria 31, Martin 28). Sesudah
--     file ini, pembuat PRF = 4 role bd_* penjual + gm_bd + super_admin;
--     'sales' (0 pemegang) dan bd_digital_marketing_spv (Faris) TIDAK bisa.
--   - sales_orders_insert: 2 SO, semua MSI.
--   - Jalur tulis FE: PRFFormPage (INSERT prf), SalesOrderDocFormPage (INSERT
--     sales_orders). Gate FE-nya (canCreatePrf) sudah memuat kode baru.
--   - Kalau file ini mendahului roster: sales lama tak bisa membuat PRF/SO.
--     Roster SUDAH dipindah → aman.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   2 ALTER POLICY kembali ke has_role('sales'::text) (+ sales_orders_insert
--   kembali singular kalau ingin persis), lalu DROP FUNCTION
--   public.is_sales_functional(). Wajib ALTER POLICY dulu — DROP ditolak
--   selama masih dirujuk.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi. DIHARAPKAN: 2 · 0 · 1
-- ═════════════════════════════════════════════════════════════════════════════
SELECT (SELECT count(*) FROM pg_policies
         WHERE qual ~ '''sales''' OR with_check ~ '''sales''')                                   AS policy_sales_sebelum,
       (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = 'is_sales_functional')       AS helper_sebelum,
       (SELECT count(*) FROM pg_policies
         WHERE policyname = 'sales_orders_insert' AND with_check ILIKE '%get_user_company_id()%') AS so_singular_sebelum;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fungsi guard ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_sales_functional() RETURNS boolean
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
      AND  r.code IN ('bd_sales_executive','bd_account_executive',
                      'bd_sales_spv_console','bd_sales_spv_forwarding')
  );
$$;

ALTER FUNCTION public.is_sales_functional() OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.is_sales_functional() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_sales_functional() TO authenticated;

COMMENT ON FUNCTION public.is_sales_functional() IS
  'True bila user memegang role BD yang MENJUAL, aktif di entitas mana pun: bd_sales_executive / '
  'bd_account_executive / bd_sales_spv_console / bd_sales_spv_forwarding — pengganti has_role(''sales'') '
  'di prf_insert & sales_orders_insert (migrasi 20260912000006). Cakupan entitas dari klausa company_id '
  'tiap policy. Daftar kode eksplisit. bd_digital_marketing_spv sengaja tidak masuk (nol bukti butuh '
  'PRF/SO); legacy ''sales'' sengaja tidak masuk (dormant sejak pilot 3, 12 Sep 2026). gm_bd tetap '
  'eksplisit di policy, bukan bagian fungsi ini.';

-- ── prf_insert — has_role('sales') → helper; sisanya verbatim ───────────────
ALTER POLICY prf_insert ON public.prf
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (created_by = auth.uid())
    AND (is_sales_functional() OR has_role('gm_bd'::text))));

-- ── sales_orders_insert — helper + TD-180 (singular → jamak) ────────────────
ALTER POLICY sales_orders_insert ON public.sales_orders
  WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
    AND (created_by = auth.uid())
    AND (is_sales_functional() OR has_role('gm_bd'::text))));

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — nol sisa literal 'sales' di policy mana pun. DIHARAPKAN 0.
SELECT count(*) AS sisa_sales_policy
FROM   pg_policies WHERE qual ~ '''sales''' OR with_check ~ '''sales''';

-- V2 — persis 2 policy memuat is_sales_functional(); gm_bd masih di keduanya. DIHARAPKAN 2 baris, gm_bd_tetap = true.
SELECT tablename, policyname, cmd,
       (with_check ILIKE '%has_role(''gm_bd''%') AS gm_bd_tetap,
       (with_check ILIKE '%created_by = auth.uid()%') AS created_by_tetap
FROM   pg_policies
WHERE  with_check ILIKE '%is_sales_functional()%'
ORDER  BY tablename;

-- V3 — TD-180: sales_orders_insert jamak. DIHARAPKAN plural = true, singular = false.
SELECT (with_check ILIKE '%get_user_company_ids()%') AS plural,
       (with_check ILIKE '%get_user_company_id()%')  AS singular
FROM   pg_policies WHERE policyname = 'sales_orders_insert';

-- V4 — ACL & atribut fungsi. DIHARAPKAN auth true · anon false · secdef true · STABLE ('s') · search_path terpasang.
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_harus_false,
       p.prosecdef AS secdef, p.provolatile AS volatile, p.proconfig AS search_path
FROM   pg_proc p
WHERE  p.pronamespace = 'public'::regnamespace AND p.proname = 'is_sales_functional';

-- V5 — pg_proc tetap nol literal 'sales'. DIHARAPKAN 0.
SELECT count(*) AS literal_sales_di_fungsi
FROM   pg_proc WHERE pronamespace = 'public'::regnamespace AND prosrc ~ '''sales''';


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser, PRODUKSI — staging nol pemegang bd_*/sales dan
-- nol data CRM nyata; di staging cukup V1-V5 + halaman PRF/SO tidak error).
--   1. Rossy (bd_sales_executive): Buat PRF dari Detail Inquiry → tersimpan
--      (prf_insert lewat helper). Buat Sales Order → tersimpan (#2).
--   2. Endang (bd_sales_spv_console, level 6): Buat PRF → tersimpan (helper,
--      bukan level — level tak ada di policy ini); Dashboard CRM mode TIM.
--   3. Martin (bd_account_executive): Buat PRF → tersimpan; mode PERSONAL.
--   4. Faris (bd_digital_marketing_spv): TIDAK bisa membuat PRF/SO — by design
--      (keputusan #3), bukan kegagalan.
--   5. Vendi (gm_bd): Buat PRF tetap bisa (klausa gm_bd verbatim).
-- =============================================================================
