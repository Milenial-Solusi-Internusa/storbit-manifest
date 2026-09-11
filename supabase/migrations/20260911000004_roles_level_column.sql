-- =============================================================================
-- Migration: 20260911000004_roles_level_column
-- Phase:     Infrastruktur "manager ke atas" berbasis LEVEL, bukan daftar nama.
--            Kolom roles.level + backfill 14 role + 3 fungsi guard diganti dari
--            `r.code IN (daftar nama)` menjadi `r.level <= 6`. Menyiapkan
--            Pekerjaan 4 (role per-posisi HCGA/BD) tanpa harus menambal daftar
--            nama di banyak tempat — Pekerjaan 4 sendiri TIDAK dikerjakan di sini.
-- Depends:   roles sudah global (20260821000003). Nol role baru dibuat.
--
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 11 Sep 2026 di STAGING
--            (oovmlhilhqzejnawqkvt) dan PRODUKSI (untmpqceexwxzuhlmyrg), hasil
--            identik & DIVERIFIKASI ULANG baca-saja dari produksi saat file ini
--            ditulis (hari yang sama):
--              - roles.level integer NOT NULL, TANPA default, CHECK
--                roles_level_check (level IN (0,1,2,4,6,7,99)) — terpasang.
--              - 14 role hidup ber-level sesuai mapping (finance_controller = 7).
--              - is_manager_or_above(), is_manager_or_above_in(),
--                mark_delivery_delivered() memakai r.level <= 6 (yang terakhir
--                OR r.code = 'operations'); ketiganya tetap SECURITY DEFINER +
--                SET search_path; nol literal 'gm_bd' di ketiganya.
--              - Regression check (gerbang 2) LOLOS: level<=6 = daftar lama.
--            ✅ Snapshot SUDAH di-refresh (pg_dump Den 11 Sep 2026 23:44, commit
--            di branch feat/role-level-column) — diff terverifikasi: kolom +
--            constraint + COMMENT + 5 body fungsi (3 dari sini, 2 dari 000005).
--
-- ⚠️ DUA RPC PRF SEMPAT TERLEWAT — ditutup 20260911000005 (kini LIVE, lihat
--    file itu). Kronologinya dipertahankan di bawah supaya kesalahan premisnya
--    tidak terulang:
--   Plan semula: 5 fungsi. Saat eksekusi, prf_release & prf_select_offer
--   dilewati dengan alasan "keduanya cuma memanggil is_manager_or_above()".
--   Itu benar HANYA di STAGING, yang masih memakai versi pra-7 Sep 2026
--   (`v_company = get_user_company_id() AND (... OR is_manager_or_above())`).
--   Di PRODUKSI keduanya adalah versi 20260907000001_prf_multi_company_guard,
--   yang justru MENGGANTI panggilan itu dengan EXISTS ber-daftar nama inline
--   `r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')`
--   supaya role diuji DI ENTITAS PRF (gotcha #26). Dibuktikan baca-saja 11 Sep
--   2026: md5(prosrc) keduanya di produksi TIDAK berubah sebelum vs sesudah
--   eksekusi file ini (204c2fda… / d63b234d…). Jadi di produksi daftar nama
--   masih hidup di dua tempat itu + is_bnf_authorized (konsep BNF, sengaja
--   tak disentuh). Migrasi 20260907000001 sendiri belum pernah mendarat di
--   staging — drift lingkungan yang ikut ketahuan di sini; 000005 sekaligus
--   menyusulkannya (staging kini memakai guard entitas yang sama).
--
-- SIFAT: DDL (1 kolom, 1 constraint) + DATA (backfill 14 baris) + 3 CREATE OR
--   REPLACE FUNCTION (signature/atribut tak berubah). Nol policy, nol GRANT.
--   GRANT roles tabel-level (GRANT ALL … authenticated) → kolom baru otomatis
--   terbaca FE lewat embed roles(level).
--
-- ── REGRESSION CHECK (produksi, baca-saja, 11 Sep 2026 — SEBELUM eksekusi) ──
--   Daftar hardcode lama (identik di 5 fungsi):
--       super_admin, admin, ceo, gm, gm_bd, manager, supervisor
--   level <= 6 dengan mapping DOKUMENTASI (04_ROLE_PERMISSION_MATRIX,
--   finance_controller = 4):
--       admin, ceo, FINANCE_CONTROLLER, gm, gm_bd, manager, super_admin
--       → TIDAK IDENTIK (+finance_controller). Itu perubahan kebijakan, bukan
--         refactor: is_manager_or_above() dipakai 41 policy di 30 tabel + 10 RPC
--         (generate_picking_from_sp, sp_issue_btb, sp_delete_btb, create_invoice,
--         submit_invoice, mark_ttf_received, set_sp_expired_date, …).
--   level <= 6 dengan finance_controller = 7:
--       admin, ceo, gm, gm_bd, manager, super_admin → IDENTIK (∩ role hidup;
--       supervisor ikut tercakup begitu role-nya dibuat).
--   KEPUTUSAN Den 11 Sep 2026: finance_controller = 7 — ikuti perilaku guard
--   yang berlaku, bukan hierarki dokumentasi. Wewenang Finance Controller di
--   modul Finance tetap datang dari has_role('finance_controller') eksplisit.
--   Kalau kelak mau dinaikkan: satu UPDATE sadar, bukan migrasi fungsi.
--   Varian mark_delivery_delivered (level<=6 OR operations) juga IDENTIK.
--
-- ── KEPUTUSAN LAIN (Den, 11 Sep 2026) ─────────────────────────────────────
--   - NOT NULL TANPA DEFAULT: role baru WAJIB memilih level secara sadar (nol
--     INSERT ke roles dari FE — grep src; Pekerjaan 4 menulis level-nya sendiri).
--   - CHECK enumeratif {0,1,2,4,6,7,99}: level baru (mis. 3/5) = ALTER
--     CONSTRAINT eksplisit. Sumbu otorisasi tidak boleh dapat nilai diam-diam.
--   - supervisor (6) didefinisikan walau 0 baris hari ini (TD-106) — begitu
--     dibuat, otomatis "manager ke atas" tanpa menyentuh fungsi mana pun.
--   - MANAGER_OR_ABOVE (array nama di src/lib/roles.js) dihapus; FE memakai
--     roles.level <= MANAGER_LEVEL_MAX (6) — commit FE di branch yang sama.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI (yang dijalankan 11 Sep 2026) — satu transaksi; gerbang 1 & 2
-- membatalkan seluruhnya kalau ada role tanpa level atau set-nya tidak identik.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS level integer;

COMMENT ON COLUMN public.roles.level IS
  'Tingkat wewenang lintas modul (bukan katalog nama): 0 super_admin/admin · 1 ceo · '
  '2 gm/gm_bd · 4 manager · 6 supervisor · 7 staf (sales/finance/finance_controller/'
  'operations/procurement/hrga/it) · 99 viewer (di luar hierarki). "Manager ke atas" = '
  'level <= 6 — dipakai is_manager_or_above(), is_manager_or_above_in(), prf_release, '
  'prf_select_offer, mark_delivery_delivered dan src/lib/roles.js. finance_controller '
  'SENGAJA 7, bukan 4 seperti hierarki org di 04_ROLE_PERMISSION_MATRIX: guard-guard itu '
  'tidak pernah memasukkannya (regression check 11 Sep 2026). Migrasi 20260911000004.';
-- Kalimat "dipakai … prf_release, prf_select_offer" di COMMENT ini BENAR sejak
-- 20260911000005 (bagian fungsi) dijalankan, 11 Sep 2026.

UPDATE public.roles r SET level = v.level
FROM (VALUES
  ('super_admin',0),('admin',0),('ceo',1),('gm',2),('gm_bd',2),('manager',4),
  ('supervisor',6),
  ('finance_controller',7),('sales',7),('finance',7),('operations',7),
  ('procurement',7),('hrga',7),('it',7),
  ('viewer',99)) AS v(code, level)
WHERE r.code::text = v.code AND r.level IS DISTINCT FROM v.level;
-- Hasil: UPDATE 14 (produksi & staging).

-- Gerbang 1: setiap role hidup harus punya level (berlaku di staging juga).
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(code, ',') INTO v_missing
  FROM public.roles WHERE deleted_at IS NULL AND level IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'roles tanpa level: % — tambahkan ke mapping dulu', v_missing;
  END IF;
END $$;

-- Gerbang 2 (regression check di dalam transaksi):
-- level<=6 HARUS sama persis dengan daftar lama ∩ role hidup.
DO $$
DECLARE v_diff text;
BEGIN
  WITH by_level AS (
    SELECT code::text AS code FROM public.roles WHERE deleted_at IS NULL AND level <= 6
  ), hard AS (
    SELECT r.code::text AS code FROM public.roles r
    WHERE r.deleted_at IS NULL
      AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
  )
  SELECT string_agg(code, ',') INTO v_diff
  FROM ((SELECT code FROM by_level EXCEPT SELECT code FROM hard)
        UNION ALL
        (SELECT code FROM hard EXCEPT SELECT code FROM by_level)) d;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION 'level<=6 ≠ daftar lama: % — BATAL', v_diff;
  END IF;
END $$;

ALTER TABLE public.roles ALTER COLUMN level SET NOT NULL;   -- sengaja TANPA DEFAULT
ALTER TABLE public.roles ADD CONSTRAINT roles_level_check CHECK (level IN (0,1,2,4,6,7,99));

-- Fungsi 1/3 — body persis seperti yang terpasang di produksi (pg_get_functiondef).
CREATE OR REPLACE FUNCTION public.is_manager_or_above() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.level <= 6
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE));
$$;

-- Fungsi 2/3.
CREATE OR REPLACE FUNCTION public.is_manager_or_above_in(p_company_id uuid) RETURNS boolean
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
      AND r.level <= 6
  );
$$;

-- Fungsi 3/3 — daftar lama + operations → level<=6 OR operations; pesan RAISE
-- berhenti menyebut daftar nama.
CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles       r ON r.id = ur.role_id
    WHERE  ur.user_id  = auth.uid()
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  (r.level <= 6 OR r.code = 'operations')
  ) THEN
    RAISE EXCEPTION 'Tidak berhak menandai surat jalan sebagai terkirim. Butuh level manager ke atas atau role operations.';
  END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $$;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — hasil 11 Sep 2026 (produksi; staging identik)
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — 14 role ber-level. HASIL:
--   admin=0, super_admin=0, ceo=1, gm=2, gm_bd=2, manager=4,
--   finance=7, finance_controller=7, hrga=7, it=7, operations=7, procurement=7,
--   sales=7, viewer=99
SELECT code, level FROM public.roles WHERE deleted_at IS NULL ORDER BY level, code;

-- V2 — "manager ke atas" = 6 kode. HASIL: admin,ceo,gm,gm_bd,manager,super_admin
SELECT string_agg(code, ',' ORDER BY code) FROM public.roles WHERE deleted_at IS NULL AND level <= 6;

-- V3 — kolom & constraint. HASIL: integer | not_null=t | default=(none) ;
--      roles_level_check = CHECK ((level = ANY (ARRAY[0, 1, 2, 4, 6, 7, 99])))
SELECT data_type, is_nullable = 'NO' AS not_null, coalesce(column_default, '(none)') AS dflt
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'roles' AND column_name = 'level';
SELECT conname, pg_get_constraintdef(oid)
FROM   pg_constraint WHERE conrelid = 'public.roles'::regclass AND contype = 'c';

-- V4 — fungsi yang MASIH memuat literal 'gm_bd'. HASIL produksi saat file ini
--      ditulis: is_bnf_authorized (konsep BNF, sengaja), prf_release,
--      prf_select_offer. Sesudah 000005 (dicek ulang 11 Sep 2026, kedua DB):
--      hanya is_bnf_authorized.
SELECT p.proname
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.prosrc LIKE '%gm_bd%'
ORDER  BY 1;

-- V5 — 3 fungsi memakai level dan tetap SECURITY DEFINER + search_path.
--      HASIL: 3 baris, pakai_level = t, secdef = t, config = search_path=public.
SELECT p.proname, p.prosrc LIKE '%level <= 6%' AS pakai_level, p.prosecdef AS secdef,
       (SELECT string_agg(c, ' ') FROM unnest(p.proconfig) c) AS config
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('is_manager_or_above','is_manager_or_above_in','mark_delivery_delivered')
ORDER  BY 1;

-- V6 — pemakai is_manager_or_above() tak berubah (hanya ISI fungsinya diganti).
--      HASIL: 41 policy di 30 tabel (+2 policy quotations utk varian _in).
SELECT count(*) AS n_policy, count(DISTINCT tablename) AS n_tabel
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%is_manager_or_above()%';


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser, preview branch feat/role-level-column —
-- Vercel Preview menunjuk STAGING) — sesudah kode FE mendarat.
--   1. Akun manager: masih melihat Approval Lead Pool / Sales Report; tombol
--      manager di Detail PRF (Lepas PRF, Pakai Penawaran) masih tampil.
--   2. Akun sales: tidak.
--   3. Super admin: normal. Nol console.warn "[roles] … tanpa level".
--   GAGAL khas: SEMUA gate manajerial FE hilang sekaligus + console error
--   PostgREST 42703 pada query user_roles → kode FE mendarat di DB yang belum
--   punya kolom level (urutan deploy terbalik).
-- =============================================================================


-- =============================================================================
-- CATATAN SESUDAH EKSEKUSI
--   1. ✅ Snapshot di-refresh 11 Sep 2026 (diff: kolom + constraint + COMMENT +
--      5 body fungsi). ⚠️ Diff-nya juga membawa `roles_code_unique UNIQUE (code)`
--      — constraint yang ADA di produksi & staging tapi TIDAK berasal dari
--      migrasi mana pun di repo (bukan dari file ini). Perlu dikonfirmasi
--      asal-usulnya dan direkam retroaktif.
--   2. ✅ 20260911000005 (bagian fungsi) LIVE di produksi & staging — TD-233
--      tertutup di kelima tempat. Bagian COMMENT-nya masih terutang (lihat
--      file itu).
--   3. Dokumen: 04_ROLE_PERMISSION_MATRIX tabel level (finance_controller 4 →
--      DB 7, alasannya di sini), TD-233 (3 dari 5 tempat tertutup), TD-106.
-- =============================================================================




















-- =============================================================================
-- =============================================================================
--
--                        ⛔  B A T A L K A N   —   JANGAN JALANKAN
--                            KECUALI MEMANG MAU MEMBALIKKAN
--
--   Dijauhkan dari alur baca verifikasi dengan sengaja; seluruhnya komentar.
--   ⚠️ WAJIB BERPASANGAN dengan revert kode FE: AuthContext meng-embed
--   roles(level) — kalau kolomnya dicabut sementara FE baru masih hidup,
--   PostgREST menolak SELURUH query user_roles (42703) → erpRoles kosong →
--   semua gate FE + menu tier-3 mati untuk semua user.
--   Urutan: 3 fungsi kembali ke body lama DULU, baru kolom di-drop.
--
-- =============================================================================
-- =============================================================================
--
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION public.is_manager_or_above() RETURNS boolean
--     LANGUAGE sql STABLE SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
--   SELECT EXISTS (
--     SELECT 1 FROM user_roles ur
--     JOIN roles r ON r.id = ur.role_id
--     WHERE ur.user_id = auth.uid()
--       AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
--       AND ur.is_active = true
--       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--   );
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.is_manager_or_above_in(p_company_id uuid) RETURNS boolean
--     LANGUAGE sql STABLE SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
--   SELECT EXISTS (
--     SELECT 1
--     FROM user_roles ur
--     JOIN roles r ON r.id = ur.role_id
--     WHERE ur.user_id    = auth.uid()
--       AND ur.company_id = p_company_id
--       AND ur.is_active  = true
--       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--       AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
--   );
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE v_status text; v_cust uuid; v_sp text;
-- BEGIN
--   SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp
--     FROM delivery_notes WHERE id=p_delivery_note_id;
--   IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
--   IF v_status <> 'in_transit' THEN
--     RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;
--
--   IF NOT EXISTS (
--     SELECT 1
--     FROM   user_roles ur
--     JOIN   roles       r ON r.id = ur.role_id
--     WHERE  ur.user_id  = auth.uid()
--       AND  ur.is_active = true
--       AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--       AND  r.code = ANY (ARRAY['super_admin','admin','ceo','gm','gm_bd',
--                                'manager','supervisor','operations'])
--   ) THEN
--     RAISE EXCEPTION 'Tidak berhak menandai surat jalan sebagai terkirim. Butuh salah satu role: super_admin, admin, ceo, gm, gm_bd, manager, supervisor, atau operations.';
--   END IF;
--   UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
--   PERFORM sp_recompute_status(v_cust, v_sp);
-- END; $$;
--
-- ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_level_check;
-- ALTER TABLE public.roles DROP COLUMN IF EXISTS level;
--
-- COMMIT;
--
-- =============================================================================
