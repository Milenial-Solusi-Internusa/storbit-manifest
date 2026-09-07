-- =============================================================================
-- Migration: 20260907000001_prf_multi_company_guard
-- Phase:     TD-180 — penjaga multi-company untuk keempat RPC PRF.
-- Depends:   20260821000004_crm_prf_jamak (policy-nya sudah jamak sejak 21 Agu;
--            migrasi ini menutup sisanya, yaitu keempat RPC yang terlewat).
-- Status:    LIVE — dieksekusi di produksi 7 Sep 2026, terverifikasi runtime.
--
-- SIFAT: 4 CREATE OR REPLACE. Nol DDL tabel, nol perubahan RLS/policy, nol
--   sentuhan ke has_role() / is_manager_or_above() / get_user_company_id() /
--   get_user_company_ids().
--
-- ── MASALAH ────────────────────────────────────────────────────────────────
--   Keempat fungsi memakai get_user_company_id() SINGULAR, yang hanya
--   mengembalikan profiles.company_id (home company). Camelia Martina Sekar
--   Widianti dan Dery Agung Prahasto (Procurement Manager SOA) punya role
--   `procurement` AKTIF di ketiga entitas tapi home company SOA, sementara
--   SELURUH 285 PRF yang pernah ada bermilik MSI (nol JCI, nol SOA).
--   Akibatnya keduanya DITOLAK di setiap PRF yang pernah ada, di keempat
--   fungsi; 78 PRF SUBMITTED menunggu diambil.
--
--   Procurement lintas-entitas MEMANG by design (dikonfirmasi Den).
--
--   Ini instance keempat TD-180 dan yang PERTAMA memblokir keras
--   (RAISE EXCEPTION), bukan gagal senyap seperti tiga instance sebelumnya.
--
--   ⚠️ Policy RLS-nya SUDAH diperbaiki 21 Agu (20260821000004, LIVE) — header
--   migrasi itu bahkan menyebut Dery & Camellia secara eksplisit. Tapi ia hanya
--   menyentuh 18 policy di 6 tabel dan NOL RPC. Keempat fungsi di bawah
--   SECURITY DEFINER, jadi mereka tak ikut terbantu oleh perbaikan policy sama
--   sekali. Itulah kenapa bug ini masih hidup 17 hari kemudian.
--
-- ── KENAPA BUKAN SEKADAR TUKAR SINGULAR -> JAMAK ───────────────────────────
--   has_role() DAN is_manager_or_above() sama-sama MENGABAIKAN company
--   sepenuhnya (lihat COMMENT has_role(): "in any active user_roles
--   assignment"; is_manager_or_above() juga nol filter company). Selama sisi
--   kiri masih `= get_user_company_id()`, kelonggaran itu tak terlihat karena
--   home company yang mengikatnya.
--
--   Kalau sisi kiri diganti jamak TANPA menyentuh sisi kanan, kedua syaratnya
--   jadi TIDAK SALING TERKAIT: orang dengan role X di entitas A dan role apa
--   pun di entitas B lolos untuk PRF entitas B — padahal ia bukan X di sana.
--   Untuk prf_release/prf_select_offer itu berarti MELEPAS PRF ORANG LAIN dan
--   MEMILIH PENAWARAN VENDOR di PRF yang bukan miliknya. Menutup satu lubang
--   sambil membuka dua yang lebih serius.
--
--   Karena itu ketiga cabang role diganti pengujian role DI ENTITAS PRF ITU.
--
-- ── BLAST RADIUS: SUDAH DIUKUR, NOL ORANG TERDAMPAK ─────────────────────────
--   Diukur ke user_roles (Den, 7 Sep 2026): kesembilan pemegang role manajerial
--   — Ayun, Azhar, Den, Denyt, Endang, Gigih, Faris, Rini, Vendi — punya role
--   di SATU entitas saja, dan entitas itu SELALU sama dengan home company-nya.
--   Tidak ada satu pun yang manajer di entitas A tapi punya role lain di
--   entitas B.
--
--   Jadi pengetatan ini TIDAK mengubah perilaku siapa pun hari ini; ia murni
--   menutup celah ke depan. Dicatat supaya jelas keputusannya diambil SETELAH
--   diukur, bukan karena risikonya diabaikan.
--
-- ── DUPLIKASI DAFTAR ROLE (disadari, bukan kelalaian) ──────────────────────
--   Daftar role manajerial di prf_release & prf_select_offer di bawah adalah
--   SALINAN PERSIS dari definisi is_manager_or_above() (schema_snapshot:2236).
--   KALAU DAFTAR DI FUNGSI ITU BERUBAH, DUA TEMPAT DI BAWAH HARUS IKUT.
--
--   Menghindari duplikasi tidak mungkin tanpa melanggar batasan: tabel `roles`
--   tak punya kolom level/rank dan tak ada tabel yang mengelompokkan role per
--   senioritas (jadi tak ada yang bisa diturunkan), sementara
--   is_manager_or_above() mengembalikan boolean telanjang tanpa parameter
--   company sehingga mustahil dipakai ulang per-entitas. Membuat fungsi helper
--   baru sengaja tidak dilakukan di migrasi ini.
--
--   Inlining begini sudah jadi preseden: mark_delivery_delivered
--   (schema_snapshot:2438) menyalin daftar yang sama (plus 'operations').
--   Setelah migrasi ini daftar tsb hidup di EMPAT tempat.
-- =============================================================================


-- ─── 1. prf_claim ────────────────────────────────────────────────────────────
-- ⚠️ SENGAJA TIDAK memakai `v_company IN (SELECT get_user_company_ids())`.
--    JANGAN "disederhanakan" jadi begitu — lihat blok KENAPA BUKAN SEKADAR
--    TUKAR di kepala file.
--
--    Hasil pengujian per-entitas ini LEBIH KETAT sekaligus lebih longgar dari
--    versi lama:
--      · Camelia LOLOS untuk PRF MSI          -> karena procurement di MSI.
--      · Yang hanya procurement di SOA DITOLAK untuk PRF MSI
--        -> versi lama justru meloloskannya lewat has_role().
--    Versi lama salah di DUA arah; versi ini benar di keduanya.
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

  IF NOT (
    is_super_admin()
    OR EXISTS (
         SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id    = v_uid
           AND ur.company_id = v_company
           AND ur.is_active
           AND r.code        = 'procurement'
           AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       )
  ) THEN
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


-- ─── 2. prf_release ──────────────────────────────────────────────────────────
-- ⚠️ STRUKTUR PENJAGA BERUBAH, bukan cuma isinya.
--
--    Lama:  v_company = get_user_company_id()
--           AND (v_ack = v_uid OR is_manager_or_above())
--    Baru:  is_super_admin()
--           OR v_ack = v_uid
--           OR EXISTS (... role manajerial DI ENTITAS PRF ITU ...)
--
--    Cek identitas NAIK jadi cabang OR sejajar, tidak lagi bersarang di bawah
--    predikat company. Alasannya: pemegang PRF adalah pemegang PRF — kalau
--    v_ack = v_uid, dia sudah lolos prf_claim yang per-entitas untuk sampai ke
--    sini, jadi mengikatnya lagi ke company hanya menambah penghalang tanpa
--    menambah keamanan. Yang memang perlu di-scope ke entitas justru cabang
--    manager, dan itulah yang dilakukan EXISTS di bawah.
--
--    Daftar r.code = SALINAN dari is_manager_or_above(); lihat blok DUPLIKASI
--    DAFTAR ROLE di kepala file.
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
           AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
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


-- ─── 3. prf_mark_quoted ──────────────────────────────────────────────────────
-- SATU-SATUNYA yang memakai tukar jamak polos, dan itu BENAR di sini: penjaga
-- fungsi ini tidak punya cabang manager sama sekali (hanya v_ack = v_uid), jadi
-- tak ada syarat company-agnostic yang bisa terlepas dari predikat company.
-- Struktur bersarangnya sengaja dipertahankan apa adanya.
CREATE OR REPLACE FUNCTION public.prf_mark_quoted(p_prf_id uuid, p_waiver_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_status  text;
  v_ack     uuid;
  v_offers  int;
  v_reason  text := NULLIF(TRIM(COALESCE(p_waiver_reason, '')), '');
BEGIN
  SELECT company_id, status, acknowledged_by
    INTO v_company, v_status, v_ack
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids()) AND v_ack = v_uid)) THEN
    RAISE EXCEPTION 'Hanya pemegang PRF yang boleh menyatakan penawaran siap';
  END IF;

  IF v_status <> 'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'PRF harus berstatus ACKNOWLEDGED (sekarang: %)', v_status;
  END IF;

  SELECT count(*) INTO v_offers
  FROM prf_vendor_offers
  WHERE prf_id = p_prf_id AND deleted_at IS NULL;

  IF v_offers < 1 THEN
    RAISE EXCEPTION 'Belum ada penawaran vendor sama sekali';
  END IF;

  IF v_offers < 3 AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Baru % penawaran. Minimum 3, atau isi alasan kenapa kurang', v_offers;
  END IF;

  UPDATE prf
  SET status = 'QUOTED',
      min_offers_waiver_reason = CASE WHEN v_offers < 3 THEN v_reason ELSE NULL END
  WHERE id = p_prf_id;
END;
$$;


-- ─── 4. prf_select_offer ─────────────────────────────────────────────────────
-- ⚠️ STRUKTUR PENJAGA BERUBAH, alasan sama persis dengan prf_release di atas —
--    bedanya cek identitas di sini adalah v_owner = v_uid (sales PEMILIK PRF,
--    prf.created_by), bukan v_ack.
--
--    Daftar r.code = SALINAN dari is_manager_or_above(); lihat blok DUPLIKASI
--    DAFTAR ROLE di kepala file.
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
           AND r.code IN ('super_admin','admin','ceo','gm','gm_bd','manager','supervisor')
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


-- ── ACL: SENGAJA TIDAK ADA BLOK REVOKE/GRANT ───────────────────────────────
--   CREATE OR REPLACE MEMPERTAHANKAN GRANT yang sudah ada (beda dari
--   DROP+CREATE), jadi `GRANT ALL ... TO authenticated` keempatnya tetap utuh
--   tanpa perlu diulang di sini.
--
--   ⚠️ TEMUAN, di luar scope migrasi ini: keempat fungsi TIDAK punya
--   `REVOKE ALL ... FROM PUBLIC` di snapshot (17 fungsi lain punya), sehingga
--   PUBLIC — termasuk `anon` — masih boleh mengeksekusinya. TIDAK eksploitatif:
--   auth.uid() NULL untuk anon, sehingga is_super_admin() false dan seluruh
--   predikat di atas gagal, jadi setiap penjaga tetap melempar exception.
--   Menambal ini adalah pekerjaan tersendiri — JANGAN diselipkan ke sini.


-- =============================================================================
-- VERIFIKASI — jalankan TERPISAH setelah keempatnya.
-- =============================================================================
-- a) Nol pemakaian singular tersisa di prf% (harus 0 baris):
--    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname LIKE 'prf%'
--       AND pg_get_functiondef(p.oid) LIKE '%get_user_company_id()%';
--
-- b) Keempatnya masih SECURITY DEFINER + search_path (4 baris, prosecdef = t,
--    proconfig memuat search_path=public):
--    SELECT proname, prosecdef, proconfig FROM pg_proc
--     WHERE proname IN ('prf_claim','prf_release','prf_mark_quoted','prf_select_offer');
--
-- c) GRANT lama masih utuh setelah CREATE OR REPLACE (harus 4 baris
--    `authenticated`):
--    SELECT p.proname, r.rolname
--      FROM pg_proc p
--      CROSS JOIN LATERAL aclexplode(p.proacl) a
--      JOIN pg_roles r ON r.oid = a.grantee
--     WHERE p.proname LIKE 'prf_%' AND r.rolname = 'authenticated';
--
-- d) Camelia / Dery bisa mengambil PRF MSI — uji DI BROWSER, BUKAN SQL Editor.
--    auth.uid() NULL di SQL Editor, jadi seluruh penjaga di atas pasti menolak
--    dan hasilnya akan menyesatkan.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Jalankan ulang definisi lama keempat fungsi dari supabase/schema_snapshot.sql
-- (keempatnya ada di sana apa adanya, pra-migrasi ini).
