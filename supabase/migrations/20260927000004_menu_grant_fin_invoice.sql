-- =============================================================================
-- 20260927000004_menu_grant_fin_invoice.sql
--            (AR Tahap 2 -- izin menu untuk halaman Invoice Management 6.2.1)
--
-- Memberi izin `view` atas menu key `fin_invoice` ke tiga role: finance,
-- finance_controller, ceo (keputusan Den K-6).
--
-- 100% DATA. Nol DDL, nol policy, nol RPC, nol baris dihapus.
--
-- KENAPA TERPISAH dari tiga migrasi AR Tahap 2 lainnya
--   Tiga migrasi itu mengubah PERILAKU DB (due_date, pemetaan akun, guard).
--   Yang ini mengubah SIAPA YANG MELIHAT sebuah menu. Dua jenis perubahan yang
--   berbeda, dan yang kedua satu-satunya yang bisa membuat halaman muncul di
--   sidebar orang lain -- itu layak punya berkas sendiri supaya bisa ditunda,
--   dibalik, atau diaudit tanpa menyentuh yang lain.
--
-- KENAPA TIDAK PERLU BARIS KATALOG BARU
--   `fin_invoice` ("Billing / Invoice", modul `finance`) SUDAH ada di
--   module_menus. Sebelum ini ia punya NOL grant role -- id menu `billing`
--   terparkir di PLANNED_MENU_IDS dan tidak dipasang di tab mana pun. AR Tahap 2
--   memasangnya di 6.2.1, jadi key yang sudah ada itulah gate-nya; tidak ada key
--   baru yang lahir.
--
-- super_admin SENGAJA tidak di-seed: bypass tier 1 hasMenuPermission sudah
-- menjaminnya (preseden 20260809000001 + 20260911000003 + 20260924000002).
--
-- ⚠️ IZIN MENU BUKAN IZIN AKSI. Role `finance` akan MELIHAT halaman ini, tapi DB
-- tetap menolaknya menerbitkan invoice, submit, dan mencatat pembayaran
-- (create_invoice_for_sp & submit_invoice: super_admin/manager+/finance_controller;
-- record_payment: super_admin/finance_controller). Itu DISENGAJA: FE menampilkan
-- tombolnya NONAKTIF beserta alasannya, bukan menyembunyikannya (keputusan Den
-- K-6), supaya orang tahu keberadaan jalur itu dan siapa yang bisa memakainya.
-- Melonggarkan izin aksinya = pekerjaan Tahap 3, bukan di sini.
--
-- ⚠️ TIDAK menggeser baseline sweep QA. Kelima akun sweep memegang role
-- bd_sales_executive / operations / hcga_personel / proc_staff / viewer --
-- diukur 25 Sep 2026, nol di antaranya finance, finance_controller, atau ceo.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V0 -- sebelum.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE
  v_total   int;
  v_key_ada boolean;
  v_grant   int;
  v_role_hilang text;
BEGIN
  SELECT count(*) INTO v_total FROM role_menu_permissions;

  SELECT EXISTS (SELECT 1 FROM module_menus WHERE key = 'fin_invoice') INTO v_key_ada;
  IF NOT v_key_ada THEN
    RAISE EXCEPTION 'PALANG: menu key fin_invoice tidak ada di module_menus. Jangan membuatnya di sini -- periksa katalog lebih dulu.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM menu_actions ma JOIN module_menus mm ON mm.id = ma.menu_id
     WHERE mm.key = 'fin_invoice' AND ma.action = 'view'
  ) THEN
    RAISE EXCEPTION 'PALANG: aksi `view` untuk fin_invoice tidak ada di menu_actions.';
  END IF;

  SELECT count(*) INTO v_grant
    FROM role_menu_permissions rmp
    JOIN menu_actions ma ON ma.id = rmp.menu_action_id
    JOIN module_menus mm ON mm.id = ma.menu_id
   WHERE mm.key = 'fin_invoice';

  -- Role yang disebut keputusan tapi tidak ada/aktif di DB ini: berhenti, jangan
  -- diam-diam memberi izin ke sebagian saja (pelajaran 20260911000003).
  SELECT string_agg(k.code, ', ') INTO v_role_hilang
    FROM (VALUES ('finance'),('finance_controller'),('ceo')) AS k(code)
   WHERE NOT EXISTS (
     SELECT 1 FROM roles r
      WHERE r.code::text = k.code AND r.is_active = true AND r.deleted_at IS NULL
   );

  IF v_role_hilang IS NOT NULL THEN
    RAISE EXCEPTION 'PALANG: role tidak ada atau tidak aktif di DB ini: %. Keputusan K-6 menyebut tiga role; memberi izin ke sebagian saja bukan keputusan yang pernah diambil.', v_role_hilang;
  END IF;

  RAISE NOTICE 'V0: role_menu_permissions=% baris; grant fin_invoice (semua aksi)=%', v_total, v_grant;
END
$v0$;

-- ---------------------------------------------------------------------------
-- GRANT -- idempoten.
-- ---------------------------------------------------------------------------
INSERT INTO public.role_menu_permissions (role_id, menu_action_id)
SELECT r.id, ma.id
FROM (VALUES
  ('fin_invoice', ARRAY['finance','finance_controller','ceo'])
) AS v(key, role_codes)
JOIN public.module_menus mm ON mm.key = v.key
JOIN public.menu_actions ma ON ma.menu_id = mm.id AND ma.action = 'view'
JOIN public.roles r ON r.code::text = ANY(v.role_codes)
                   AND r.deleted_at IS NULL AND r.is_active = true
                   AND r.code <> 'super_admin'
ON CONFLICT (role_id, menu_action_id) WHERE (menu_action_id IS NOT NULL) DO NOTHING;

-- ---------------------------------------------------------------------------
-- V1 -- sesudah.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE
  v_daftar text;
  v_n      int;
BEGIN
  SELECT count(*), string_agg(r.code::text || ':' || ma.action, ', ' ORDER BY r.code::text, ma.action)
    INTO v_n, v_daftar
    FROM role_menu_permissions rmp
    JOIN menu_actions ma ON ma.id = rmp.menu_action_id
    JOIN module_menus mm ON mm.id = ma.menu_id
    JOIN roles r ON r.id = rmp.role_id
   WHERE mm.key = 'fin_invoice';

  IF v_n < 3 THEN
    RAISE EXCEPTION 'V1 GAGAL: grant fin_invoice cuma % baris, diharapkan minimal 3 (finance, finance_controller, ceo).', v_n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_menu_permissions rmp
      JOIN menu_actions ma ON ma.id = rmp.menu_action_id
      JOIN module_menus mm ON mm.id = ma.menu_id
      JOIN roles r ON r.id = rmp.role_id
     WHERE mm.key = 'fin_invoice' AND r.code::text = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'V1 GAGAL: ada baris super_admin untuk fin_invoice -- seharusnya nol (bypass tier 1).';
  END IF;

  RAISE NOTICE 'V1 LOLOS: grant fin_invoice = % baris -> %', v_n, v_daftar;
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK
--
--   BEGIN;
--   DELETE FROM public.role_menu_permissions rmp
--    USING public.menu_actions ma, public.module_menus mm, public.roles r
--    WHERE ma.id = rmp.menu_action_id AND mm.id = ma.menu_id AND r.id = rmp.role_id
--      AND mm.key = 'fin_invoice'
--      AND r.code::text IN ('finance','finance_controller','ceo')
--      AND ma.action = 'view';
--   COMMIT;
--
-- ⚠️ DELETE-nya dibatasi ke aksi `view` dan ketiga role itu saja. Menghapus
-- SEMUA grant fin_invoice akan ikut mencabut grant per-user/aksi lain yang
-- mungkin sudah diberikan lewat Admin Settings di luar migrasi ini.
-- =============================================================================
