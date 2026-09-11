-- =============================================================================
-- Migration: 20260911000005_prf_rpc_level_check
-- Phase:     Lanjutan 20260911000004 — dua RPC PRF yang TERLEWAT: prf_release &
--            prf_select_offer di PRODUKSI masih memakai daftar nama inline
--            `r.code IN ('super_admin',…,'supervisor')`. Diganti `r.level <= 6`.
--            Sesudah ini, satu-satunya fungsi ber-literal 'gm_bd' adalah
--            is_bnf_authorized (konsep BNF, sengaja tak disentuh).
-- Depends:   20260911000004 (roles.level) — LIVE di staging & produksi.
--
-- Status:    LIVE — kedua CREATE OR REPLACE dieksekusi manual oleh Den 11 Sep
--            2026 di STAGING dan PRODUKSI, diverifikasi baca-saja hari yang
--            sama (V1: sisa 'gm_bd' hanya is_bnf_authorized; V2: kedua RPC
--            pakai_level = t, guard_entitas = t, SECURITY DEFINER, search_path;
--            snapshot 23:44 sudah memuat body barunya). COMMENT ON FUNCTION
--            is_manager_or_above_in sempat tertinggal, lalu diperbarui Den
--            sendiri di kedua DB malam itu juga dengan TEKS BERBEDA dari draf
--            di file ini — teks yang berlaku ada di blok "SISA" (sudah
--            selesai). Snapshot BELUM memuat COMMENT baru itu (refresh 23:44
--            mendahuluinya) — diff kecil yang akan muncul di refresh berikut.
--
-- ── KENAPA TERLEWAT ────────────────────────────────────────────────────────
--   Saat 20260911000004 dieksekusi, keduanya dilewati dengan alasan "cuma
--   memanggil is_manager_or_above()". Itu keadaan STAGING, yang masih memakai
--   versi pra-7 Sep 2026:
--       v_company = get_user_company_id() AND (v_ack = v_uid OR is_manager_or_above())
--   Di PRODUKSI keduanya versi 20260907000001_prf_multi_company_guard yang
--   MENGGANTI panggilan itu dengan EXISTS "role di entitas PRF" ber-daftar nama
--   inline (gotcha #26: uji role DI ENTITAS baris, bukan tukar singular→jamak).
--   Bukti baca-saja 11 Sep 2026: md5(prosrc) produksi prf_release =
--   204c2fdac94689ee4a24db83a7155df0, prf_select_offer =
--   d63b234d270d01bc65fe091726b6181c — sama persis dengan snapshot main
--   (schema_snapshot.sql:3312 / :3364) dan TIDAK berubah sesudah 000004.
--
-- ── SIFAT ──────────────────────────────────────────────────────────────────
--   2 CREATE OR REPLACE FUNCTION, body produksi apa adanya, HANYA baris predikat
--   role yang diganti (`r.code IN (...)` → `r.level <= 6`). Guard entitas
--   (`ur.company_id = v_company`), is_super_admin(), pemilik/pemegang PRF,
--   status, signature, SECURITY DEFINER, search_path — semuanya tetap.
--   + 1 COMMENT ON FUNCTION (is_manager_or_above_in) yang basi.
--   Regression check: level<=6 = daftar lama (dibuktikan di 000004, gerbang 2).
--
-- ⚠️ STAGING: file ini di staging sekaligus MENYUSULKAN guard multi-company
--   7 Sep yang tak pernah mendarat di sana (versi staging sebelumnya singular
--   get_user_company_id()). Di staging ini bukan cuma "ganti predikat",
--   melainkan ganti versi fungsi — sudah terjadi 11 Sep 2026 (V2 staging:
--   guard_entitas = t); staging kini sama dengan produksi untuk kedua RPC.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prf_release(p_prf_id uuid) RETURNS void
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

  IF v_status <> 'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'PRF tidak sedang dikerjakan siapa pun (status: %)', v_status;
  END IF;

  IF NOT (
    is_super_admin()
    OR v_ack = v_uid
    OR EXISTS (
         SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id    = v_uid
           AND ur.company_id = v_company
           AND ur.is_active
           AND r.level <= 6   -- manager ke atas (roles.level, migrasi 20260911000004); dulu daftar nama
           AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       )
  ) THEN
    RAISE EXCEPTION 'Hanya pemegang PRF atau manager yang boleh melepas';
  END IF;

  UPDATE prf
  SET status = 'SUBMITTED', acknowledged_by = NULL, acknowledged_at = NULL
  WHERE id = p_prf_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prf_select_offer(p_prf_id uuid, p_offer_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_owner   uuid;
  v_ok      boolean;
BEGIN
  SELECT company_id, status, created_by
    INTO v_company, v_status, v_owner
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  IF NOT (
    is_super_admin()
    OR v_owner = v_uid
    OR EXISTS (
         SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id    = v_uid
           AND ur.company_id = v_company
           AND ur.is_active
           AND r.level <= 6   -- manager ke atas (roles.level, migrasi 20260911000004); dulu daftar nama
           AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       )
  ) THEN
    RAISE EXCEPTION 'Hanya sales pemilik PRF atau manager yang boleh memilih penawaran';
  END IF;

  IF v_status <> 'QUOTED' THEN
    RAISE EXCEPTION 'Penawaran belum siap dipilih (status: %)', v_status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM prf_vendor_offers
    WHERE id = p_offer_id AND prf_id = p_prf_id AND deleted_at IS NULL
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Penawaran tidak ditemukan atau bukan milik PRF ini';
  END IF;

  UPDATE prf
  SET selected_offer_id = p_offer_id,
      selected_by = v_uid,
      selected_at = now()
  WHERE id = p_prf_id;
END;
$$;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- SISA — SELESAI (Den, 11 Sep 2026 malam, kedua DB): COMMENT yang basi diganti.
-- Teks di bawah adalah yang SUNGGUH terpasang (dibaca ulang dari produksi &
-- staging, identik) — bukan draf semula yang menyebut TD-233/gotcha #26; Den
-- memilih deskripsi netral. Statement ini idempoten kalau dijalankan lagi.
-- ═════════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION public.is_manager_or_above_in(p_company_id uuid) IS
  'Cek apakah user punya role level<=6 (manager ke atas) di company_id tertentu. '
  'Kini level-driven (roles.level), bukan daftar nama role.';


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — satu-satunya fungsi ber-literal 'gm_bd' yang tersisa = is_bnf_authorized.
--      DIHARAPKAN: 1 baris, is_bnf_authorized.
SELECT p.proname
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.prosrc LIKE '%gm_bd%'
ORDER  BY 1;

-- V2 — kedua RPC memakai level, masih ber-guard entitas, SECURITY DEFINER,
--      search_path. DIHARAPKAN: 2 baris, semua kolom t / search_path=public.
SELECT p.proname,
       p.prosrc LIKE '%r.level <= 6%'              AS pakai_level,
       p.prosrc LIKE '%ur.company_id = v_company%' AS guard_entitas,
       p.prosecdef                                  AS secdef,
       (SELECT string_agg(c, ' ') FROM unnest(p.proconfig) c) AS config
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.proname IN ('prf_release','prf_select_offer')
ORDER  BY 1;

-- V3 — lima fungsi "manager ke atas" semuanya level-driven.
--      DIHARAPKAN: 5 baris, pakai_level = t.
SELECT p.proname, p.prosrc LIKE '%level <= 6%' AS pakai_level
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('is_manager_or_above','is_manager_or_above_in','mark_delivery_delivered',
                     'prf_release','prf_select_offer')
ORDER  BY 1;

-- V4 — COMMENT mendarat. DIHARAPKAN: berisi 'level-driven', TIDAK lagi 'lima tempat'.
--      HASIL 11 Sep 2026 malam: LOLOS di kedua DB (teks di blok SISA).
SELECT obj_description(p.oid, 'pg_proc')
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.proname = 'is_manager_or_above_in';


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser) — akun manager (bukan pemegang PRF) di entitas
-- PRF: tombol "Lepas PRF" pada PRF ACKNOWLEDGED milik orang lain berhasil;
-- "Pakai Penawaran Ini" pada PRF QUOTED milik sales lain berhasil. Akun sales
-- bukan pemilik: keduanya ditolak dengan pesan RAISE yang sama seperti dulu.
-- =============================================================================


-- =============================================================================
-- CATATAN SESUDAH EKSEKUSI
--   1. ✅ LIVE penuh (fungsi + COMMENT), kedua DB.
--   2. ✅ Snapshot di-refresh 11 Sep 2026 23:44 bersama 20260911000004 — body
--      kedua RPC termuat; COMMENT baru belum (dijalankan sesudah refresh) →
--      muncul sebagai diff kecil di refresh berikutnya, bukan kejutan.
-- =============================================================================




















-- =============================================================================
-- =============================================================================
--
--                        ⛔  B A T A L K A N   —   JANGAN JALANKAN
--                            KECUALI MEMANG MAU MEMBALIKKAN
--
--   Dijauhkan dari alur baca verifikasi dengan sengaja; seluruhnya komentar.
--   Mengembalikan body produksi 20260907000001 (daftar nama inline). Tidak
--   bergantung pada kolom roles.level, jadi aman dijalankan sendiri.
--
-- =============================================================================
-- =============================================================================
--
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION public.prf_release(p_prf_id uuid) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE
--   v_uid     uuid := auth.uid();
--   v_company uuid;
--   v_status  text;
--   v_ack     uuid;
-- BEGIN
--   SELECT company_id, status, acknowledged_by
--     INTO v_company, v_status, v_ack
--   FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'PRF tidak ditemukan';
--   END IF;
--
--   IF v_status <> 'ACKNOWLEDGED' THEN
--     RAISE EXCEPTION 'PRF tidak sedang dikerjakan siapa pun (status: %)', v_status;
--   END IF;
--
--   IF NOT (
--     is_super_admin()
--     OR v_ack = v_uid
--     OR EXISTS (
--          SELECT 1
--          FROM user_roles ur
--          JOIN roles r ON r.id = ur.role_id
--          WHERE ur.user_id    = v_uid
--            AND ur.company_id = v_company
--            AND ur.is_active
--            AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
--            AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--        )
--   ) THEN
--     RAISE EXCEPTION 'Hanya pemegang PRF atau manager yang boleh melepas';
--   END IF;
--
--   UPDATE prf
--   SET status = 'SUBMITTED', acknowledged_by = NULL, acknowledged_at = NULL
--   WHERE id = p_prf_id;
-- END;
-- $$;
--
-- CREATE OR REPLACE FUNCTION public.prf_select_offer(p_prf_id uuid, p_offer_id uuid) RETURNS void
--     LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
-- DECLARE
--   v_uid     uuid := auth.uid();
--   v_company uuid;
--   v_status  text;
--   v_owner   uuid;
--   v_ok      boolean;
-- BEGIN
--   SELECT company_id, status, created_by
--     INTO v_company, v_status, v_owner
--   FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'PRF tidak ditemukan';
--   END IF;
--
--   IF NOT (
--     is_super_admin()
--     OR v_owner = v_uid
--     OR EXISTS (
--          SELECT 1
--          FROM user_roles ur
--          JOIN roles r ON r.id = ur.role_id
--          WHERE ur.user_id    = v_uid
--            AND ur.company_id = v_company
--            AND ur.is_active
--            AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
--            AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--        )
--   ) THEN
--     RAISE EXCEPTION 'Hanya sales pemilik PRF atau manager yang boleh memilih penawaran';
--   END IF;
--
--   IF v_status <> 'QUOTED' THEN
--     RAISE EXCEPTION 'Penawaran belum siap dipilih (status: %)', v_status;
--   END IF;
--
--   SELECT EXISTS (
--     SELECT 1 FROM prf_vendor_offers
--     WHERE id = p_offer_id AND prf_id = p_prf_id AND deleted_at IS NULL
--   ) INTO v_ok;
--
--   IF NOT v_ok THEN
--     RAISE EXCEPTION 'Penawaran tidak ditemukan atau bukan milik PRF ini';
--   END IF;
--
--   UPDATE prf
--   SET selected_offer_id = p_offer_id,
--       selected_by = v_uid,
--       selected_at = now()
--   WHERE id = p_prf_id;
-- END;
-- $$;
--
-- COMMIT;
--
-- =============================================================================
