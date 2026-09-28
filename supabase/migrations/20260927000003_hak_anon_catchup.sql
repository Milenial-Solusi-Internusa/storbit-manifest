-- =============================================================================
-- 20260927000003_hak_anon_catchup.sql
--
-- !!  M I G R A S I   R E T R O A K T I F  --  BACA SEBELUM MENJALANKAN  !!
--
--   Keadaan yang direkam di sini SUDAH LIVE DI PRODUCTION. Kapan dan oleh
--   siapa: TIDAK DIKETAHUI -- tidak ada berkas migrasi di repo yang mencabut
--   hak-hak ini, dan tidak ada catatan yang menyebutnya. Ia terukur pertama
--   kali pada 27 September 2026, oleh kategori hak yang baru ditambahkan ke
--   env-drift-check hari itu juga.
--
--   !! JANGAN DIJALANKAN DI PRODUCTION -- di sana hak-hak ini sudah dicabut.
--   !! TIDAK MASUK ANTREAN doc 12.
--   >> DIJALANKAN DI STAGING saja (TD-279, Kelompok A langkah hak).
--
-- -- APA YANG DICABUT --------------------------------------------------------
-- 28 tabel: MAINTAIN, REFERENCES, TRIGGER, TRUNCATE dari `anon`.
--  1 tabel: DELETE pada sp_items dari `authenticated`.
-- Totalnya 113 hak di 29 tabel, seluruhnya DIUKUR -- berkas ini digenerate
-- dari selisih inventaris kedua database, bukan didaftar tangan.
--
-- ** KENAPA sp_items DELETE ADA DI SINI, bukan di a1-item-sp-security.sql.
-- Patch A1 menyamakan POLICY sp_items_delete menjadi
-- (is_super_admin() OR is_sp_item_writer()). Tapi policy hanya berlaku kalau
-- HAK tabelnya ada: production sudah mencabut DELETE dari authenticated, jadi
-- di sana policy itu lapis KEDUA. Staging yang masih memegang grant-nya tetap
-- lebih longgar walau policy-nya sudah sama. Preflight Kelompok A yang
-- menemukannya -- dan ia menemukannya karena BERHENTI alih-alih melanjutkan.
--
-- -- YANG SENGAJA TIDAK DISENTUH ---------------------------------------------
-- !! `anon` di production MASIH punya MAINTAIN/REFERENCES/TRIGGER/TRUNCATE
--    pada sp_items, sp_invoices, dan sp_invoice_lines. Ketiganya TIDAK ikut
--    dicabut di sini: tujuan berkas ini menyamakan staging ke production,
--    bukan memperbaiki production.
-- !! `authenticated` punya TRUNCATE/TRIGGER/REFERENCES/MAINTAIN di SELURUH
--    tabel public, di KEDUA lingkungan, dan TRUNCATE tidak tunduk RLS.
-- Keduanya temuan keamanan production, dicatat sebagai TD tersendiri dan TIDAK
-- diperbaiki di pekerjaan parity ini. Menambalnya di sini akan membuat staging
-- berbeda dari production ke arah yang lain -- drift baru, dengan niat baik.
--
-- Nomor berkas 20260927* dipakai karena tanggal aslinya tidak diketahui.
-- Menebak tanggal akan membuat urutan berkas berbohong tentang sejarah.
--
-- Status: LIVE DI PRODUCTION sejak tanggal yang tidak diketahui.
--         Direkam retroaktif + dijalankan di STAGING 27 Sep 2026.
-- =============================================================================

BEGIN;

-- --- 28 tabel: cabut sisa hak anon ------------------------------------------
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.accounts FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.approval_workflow_steps FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.approval_workflows FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.document_numbering FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.document_templates FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_bank_accounts FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_finance_settings FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.entity_signatories FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inquiries FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.menu_actions FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.module_actions FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.module_menus FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.modules FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.notification_rules FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.notifications FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.products FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.quotation_items FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.quotations FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.role_permission_templates FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sales_calls FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sales_visit_logs FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sales_visits FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.sp_btbs FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.stock_ledger FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.user_menu_permissions FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.vendors FROM anon;
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.warehouses FROM anon;

-- --- sp_items: cabut DELETE dari authenticated ------------------------------
REVOKE DELETE ON public.sp_items FROM authenticated;

-- --- V1: BUKTI hak staging = hak production ---------------------------------
-- Dibandingkan dengan RUMUS YANG SAMA dengan env-drift-check (anon,
-- authenticated, PUBLIC; grantee 0 = PUBLIC). Kalau rumusnya berbeda, "lolos"
-- di sini tidak berarti alat itu akan ikut diam.
DO $v1$
DECLARE r record; v_ada text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('tabel:accounts', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:approval_workflow_steps', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:approval_workflows', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:document_numbering', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:document_templates', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:entity_bank_accounts', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:entity_finance_settings', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:entity_signatories', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:inquiries', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:menu_actions', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:module_actions', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:module_menus', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:modules', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:notification_rules', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:notifications', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:products', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:profiles', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:quotation_items', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:quotations', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:role_permission_templates', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:sales_calls', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:sales_visit_logs', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:sales_visits', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:sp_btbs', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:stock_ledger', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:user_menu_permissions', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:vendors', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:warehouses', 'authenticated=DELETE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE'),
      ('tabel:sp_items', 'anon=MAINTAIN,anon=REFERENCES,anon=TRIGGER,anon=TRUNCATE,authenticated=INSERT,authenticated=MAINTAIN,authenticated=REFERENCES,authenticated=SELECT,authenticated=TRIGGER,authenticated=TRUNCATE,authenticated=UPDATE')
    ) AS t(kunci, harapan)
  LOOP
    SELECT COALESCE((
             SELECT string_agg(g.nama || '=' || g.priv, ',' ORDER BY g.nama, g.priv)
               FROM (SELECT DISTINCT
                            CASE WHEN x.grantee = 0 THEN 'PUBLIC'
                                 ELSE pg_get_userbyid(x.grantee) END AS nama,
                            x.privilege_type AS priv
                       FROM aclexplode(c.relacl) x) g
              WHERE g.nama IN ('anon','authenticated','PUBLIC')), '(nol)')
      INTO v_ada
      FROM pg_class c JOIN pg_namespace nn ON nn.oid = c.relnamespace
     WHERE nn.nspname = 'public' AND c.relname = substring(r.kunci from 7);

    IF v_ada IS NULL THEN
      RAISE EXCEPTION 'V1 GAGAL: tabel % tidak ditemukan.', r.kunci;
    END IF;
    IF v_ada IS DISTINCT FROM r.harapan THEN
      RAISE EXCEPTION 'V1 GAGAL: % hak-nya %, harusnya sama dengan production: %',
        r.kunci, v_ada, r.harapan;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  IF v_n <> 29 THEN RAISE EXCEPTION 'V1 GAGAL: hanya % dari 29 tabel diperiksa.', v_n; END IF;
  RAISE NOTICE 'A-hak LOLOS: 29 tabel hak-nya sama persis dengan production.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK (staging saja) -- mengembalikan keadaan yang LEBIH LONGGAR, jadi
-- lakukan hanya kalau memang perlu membandingkan perilaku lama:
--   GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON <28 tabel di atas> TO anon;
--   GRANT DELETE ON public.sp_items TO authenticated;
-- =============================================================================
