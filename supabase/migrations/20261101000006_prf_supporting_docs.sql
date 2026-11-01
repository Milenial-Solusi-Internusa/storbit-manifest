-- =============================================================================
-- Migration: 20261101000006_prf_supporting_docs
-- Purpose:   Ganti prf.msds_available (boolean, khusus MSDS) dengan model
--            "Dokumen Pendukung" -- 4 dokumen (PI, LS, MSDS, Lainnya) x 4
--            status (tidak_perlu/tersedia/belum_tersedia/belum_diketahui) --
--            supaya "belum tersedia" (perlu, belum ada) tidak lagi harus
--            dipaksa jadi boolean false yang sama persis dengan "tidak
--            relevan sama sekali".
--              PI  = Persetujuan Impor
--              LS  = Laporan Surveyor (dokumen Lartas)
--              MSDS = Safety data sheet barang berbahaya (menggantikan
--                     msds_available)
--              Lainnya = satu slot bebas, nama ditulis di doc_other_name
--
-- msds_available SENGAJA TIDAK di-DROP di migrasi ini (aturan proyek
-- "berhenti baca kolom dulu, baru drop kolom" -- CLAUDE.md). Drop-nya
-- menyusul migrasi terpisah setelah FE + card.ts yang baru (giliran kerja
-- ini) terkonfirmasi live dan tak ada lagi pembaca msds_available.
--
-- Default kolom baru = 'tidak_perlu' untuk SEMUA PRF baru (bukan
-- 'belum_diketahui') -- keputusan Den: PRF barang umum tidak perlu
-- mendeklarasikan apa pun, dan kartu Space hanya menampilkan dokumen yang
-- statusnya BUKAN tidak_perlu/NULL, sehingga PRF biasa tidak menampilkan
-- section Dokumen Pendukung sama sekali. FE punya saran otomatis terpisah
-- (hanya saat field masih 'tidak_perlu', tidak menimpa pilihan user) --
-- lihat PRFFormPage.jsx, tidak ada mekanismenya di DB.
--
-- PENTING -- urutan ADD COLUMN vs DEFAULT dan trigger updated_at:
--   ADD COLUMN ... DEFAULT akan mengisi SEMUA baris LAMA dengan default itu
--   (bukan NULL) -- kalau DEFAULT dipasang di langkah ADD COLUMN, backfill
--   doc_msds_status "WHERE doc_msds_status IS NULL" di bawah akan mengenai
--   NOL baris (semua baris lama sudah terisi default, tidak pernah NULL).
--   Urutan yang benar, dan yang dipakai di bawah:
--     1. ADD COLUMN TANPA DEFAULT (baris lama tetap NULL)
--     2. ADD CONSTRAINT CHECK
--     3. DISABLE TRIGGER set_prf_updated_at (supaya UPDATE backfill di
--        langkah 4 TIDAK menggeser updated_at seluruh PRF lama -- backfill
--        ini bukan "perubahan" yang dilakukan user/sistem pada tanggal
--        migrasi ini, semata memberi nilai awal yang jujur ke kolom baru)
--     4. Backfill doc_msds_status dari gerbang relevansi lama. PI/LS/
--        Lainnya baris lama DIBIARKAN NULL (konsep baru, nol kolom lama
--        yang punya informasi itu).
--     5. ENABLE TRIGGER set_prf_updated_at
--     6. BARU SETELAH itu: ALTER COLUMN ... SET DEFAULT 'tidak_perlu' untuk
--        keempat kolom status -- berlaku HANYA untuk baris BARU sesudah
--        titik ini, tidak menyentuh baris yang sudah ada.
--
-- Status:    BELUM DIJALANKAN -- teks untuk SQL Editor Mas (staging dulu,
--            verifikasi, baru produksi).
-- =============================================================================

-- ── 1. ADD COLUMN tanpa DEFAULT ──────────────────────────────────────────────
ALTER TABLE public.prf
  ADD COLUMN IF NOT EXISTS doc_pi_status    text,
  ADD COLUMN IF NOT EXISTS doc_ls_status    text,
  ADD COLUMN IF NOT EXISTS doc_msds_status  text,
  ADD COLUMN IF NOT EXISTS doc_other_status text,
  ADD COLUMN IF NOT EXISTS doc_other_name   text,
  ADD COLUMN IF NOT EXISTS doc_updated_by   uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS doc_updated_at   timestamptz;

-- ── 2. ADD CONSTRAINT CHECK ──────────────────────────────────────────────────
ALTER TABLE public.prf
  ADD CONSTRAINT prf_doc_pi_status_check
    CHECK (doc_pi_status IS NULL OR doc_pi_status IN ('tidak_perlu','tersedia','belum_tersedia','belum_diketahui')),
  ADD CONSTRAINT prf_doc_ls_status_check
    CHECK (doc_ls_status IS NULL OR doc_ls_status IN ('tidak_perlu','tersedia','belum_tersedia','belum_diketahui')),
  ADD CONSTRAINT prf_doc_msds_status_check
    CHECK (doc_msds_status IS NULL OR doc_msds_status IN ('tidak_perlu','tersedia','belum_tersedia','belum_diketahui')),
  ADD CONSTRAINT prf_doc_other_status_check
    CHECK (doc_other_status IS NULL OR doc_other_status IN ('tidak_perlu','tersedia','belum_tersedia','belum_diketahui'));

COMMENT ON COLUMN public.prf.doc_pi_status IS 'Status dokumen PI (Persetujuan Impor) -- tidak_perlu/tersedia/belum_tersedia/belum_diketahui. NULL = belum pernah dideklarasikan (PRF lama, sebelum migrasi 20261101000006).';
COMMENT ON COLUMN public.prf.doc_ls_status IS 'Status dokumen LS (Laporan Surveyor, dokumen Lartas). Domain sama dgn doc_pi_status.';
COMMENT ON COLUMN public.prf.doc_msds_status IS 'Status dokumen MSDS -- menggantikan msds_available. Domain sama. NULL (PRF lama yang belum ter-backfill, atau backfill belum dijalankan) -- card.ts (notify-prf-space) jatuh ke gerbang relevansi msds_available/commodity/un_number/imo_class yang lama sbg cadangan.';
COMMENT ON COLUMN public.prf.doc_other_status IS 'Status dokumen "Lainnya" -- satu slot bebas, nama di doc_other_name. Domain sama dgn doc_pi_status.';
COMMENT ON COLUMN public.prf.doc_other_name IS 'Nama dokumen "Lainnya" (free text). NULL kalau doc_other_status = tidak_perlu (ditegakkan oleh RPC prf_update_supporting_docs, bukan CHECK constraint).';
COMMENT ON COLUMN public.prf.doc_updated_by IS 'Pengubah TERAKHIR salah satu/semua status dokumen pendukung -- satu pasang kolom untuk keempat dokumen (selalu diubah bersamaan lewat satu RPC).';
COMMENT ON COLUMN public.prf.doc_updated_at IS 'Waktu perubahan TERAKHIR status dokumen pendukung. Lihat doc_updated_by.';

-- ── 3. DISABLE trigger updated_at sebelum backfill ──────────────────────────
ALTER TABLE public.prf DISABLE TRIGGER set_prf_updated_at;

-- ── 4. Backfill doc_msds_status dari gerbang relevansi lama ────────────────
-- Gerbang PERSIS SAMA dengan logika msdsRelevant yang sudah ada di card.ts
-- hari ini (commodity='dg' ATAU un_number/imo_class terisi ATAU
-- msds_available=true -> dianggap relevan). PI/LS/Lainnya TIDAK dibackfill
-- -- konsep baru, nol kolom lama yang punya informasi itu -- dibiarkan NULL.
UPDATE public.prf
SET doc_msds_status = CASE
  WHEN commodity = 'dg' OR un_number IS NOT NULL OR imo_class IS NOT NULL OR msds_available = true
    THEN (CASE WHEN msds_available THEN 'tersedia' ELSE 'belum_tersedia' END)
  ELSE 'tidak_perlu'
END
WHERE doc_msds_status IS NULL;

-- ── 5. ENABLE kembali trigger updated_at ────────────────────────────────────
ALTER TABLE public.prf ENABLE TRIGGER set_prf_updated_at;

-- ── 6. SET DEFAULT -- berlaku HANYA untuk baris baru sesudah titik ini ─────
ALTER TABLE public.prf
  ALTER COLUMN doc_pi_status    SET DEFAULT 'tidak_perlu',
  ALTER COLUMN doc_ls_status    SET DEFAULT 'tidak_perlu',
  ALTER COLUMN doc_msds_status  SET DEFAULT 'tidak_perlu',
  ALTER COLUMN doc_other_status SET DEFAULT 'tidak_perlu';

-- ── RPC: satu panggilan menulis keempat status + nama "Lainnya" sekaligus ──
-- Pola "Simpan Semua" -- satu sumber kebenaran per aksi, bukan 4 RPC kecil.
CREATE OR REPLACE FUNCTION public.prf_update_supporting_docs(
  p_prf_id            uuid,
  p_doc_pi_status     text,
  p_doc_ls_status     text,
  p_doc_msds_status   text,
  p_doc_other_status  text,
  p_doc_other_name    text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_company    uuid;
  v_status     text;
  v_created_by uuid;
  v_ack        uuid;
BEGIN
  SELECT company_id, status, created_by, acknowledged_by
    INTO v_company, v_status, v_created_by, v_ack
  FROM prf WHERE id = p_prf_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRF tidak ditemukan';
  END IF;

  -- COALESCE(..., false) WAJIB di kedua perbandingan di bawah -- TANPA itu,
  -- untuk PRF yang belum diklaim (v_ack IS NULL) dipanggil oleh pemanggil
  -- mana pun yang sudah login tapi BUKAN pembuat/pemegang/manager (mis.
  -- finance): "v_ack = v_uid" adalah "NULL = <uid>" = NULL (bukan FALSE).
  -- Kalau v_created_by juga NULL (data anomali) atau EXISTS gagal, SELURUH
  -- rantai OR menjadi NULL, "NOT (NULL)" tetap NULL, dan "IF NULL THEN
  -- RAISE" di PL/pgSQL TIDAK meraise -- guard diam-diam lolos. Ini BUKAN
  -- pola yang sama dengan prf_release/prf_select_offer yang sudah ada:
  -- fungsi-fungsi itu punya pengecekan status SEBELUM guard ini yang
  -- membuat kombinasi "v_ack NULL" tidak reachable pada baris yang sedang
  -- diizinkan lewat; di prf_update_supporting_docs tidak ada pengecekan
  -- seperti itu, jadi v_ack/v_created_by BISA NULL tepat saat guard ini
  -- dievaluasi. COALESCE(...,false) memaksa hasil perbandingan jadi FALSE
  -- (bukan NULL) setiap kali salah satu sisi NULL, sehingga disjunct itu
  -- tidak pernah diam-diam meloloskan siapa pun.
  IF NOT (
    is_super_admin()
    OR COALESCE(v_created_by = v_uid, false)
    OR COALESCE(v_ack = v_uid, false)
    OR EXISTS (
         SELECT 1
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id    = v_uid
           AND ur.company_id = v_company
           AND ur.is_active
           AND r.level <= 6
           AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       )
  ) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah dokumen pendukung PRF ini';
  END IF;

  IF v_status IN ('CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION 'PRF sudah % -- dokumen pendukung tidak bisa diubah lagi', v_status;
  END IF;

  -- Nilai status di luar domain yang sah ditolak oleh CHECK constraint
  -- kolomnya sendiri (nol validasi duplikat di sini). doc_other_name
  -- dipaksa NULL kalau doc_other_status = 'tidak_perlu' -- status "tidak
  -- perlu" tidak boleh menyisakan nama dokumen yang menggantung.
  UPDATE prf
  SET doc_pi_status    = p_doc_pi_status,
      doc_ls_status    = p_doc_ls_status,
      doc_msds_status  = p_doc_msds_status,
      doc_other_status = p_doc_other_status,
      doc_other_name   = CASE
                            WHEN p_doc_other_status = 'tidak_perlu' THEN NULL
                            ELSE NULLIF(TRIM(COALESCE(p_doc_other_name, '')), '')
                          END,
      doc_updated_by   = v_uid,
      doc_updated_at   = now()
  WHERE id = p_prf_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prf_update_supporting_docs(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prf_update_supporting_docs(uuid, text, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.prf_update_supporting_docs(uuid, text, text, text, text, text) IS
  'Memperbarui 4 status dokumen pendukung (PI/LS/MSDS/Lainnya) + nama "Lainnya" sekaligus. Guard: super_admin ATAU created_by ATAU acknowledged_by ATAU manager+ (level<=6) di company PRF -- ketiga perbandingan pertama WAJIB dibungkus COALESCE(...,false) karena created_by/acknowledged_by bisa NULL (lihat komentar di badan fungsi). Ditolak kalau status PRF CANCELLED/EXPIRED. Migrasi 20261101000006.';

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   -- (a) fungsi + ACL benar:
--   SELECT proname, prosecdef,
--          has_function_privilege('anon', oid, 'EXECUTE')          AS anon_boleh,
--          has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated_boleh,
--          has_function_privilege('service_role', oid, 'EXECUTE')  AS service_role_boleh
--     FROM pg_proc WHERE proname = 'prf_update_supporting_docs' AND pronamespace = 'public'::regnamespace;
--   -- Diharapkan: anon_boleh=false, authenticated_boleh=true, service_role_boleh=true.
--
--   -- (b) trigger updated_at balik ENABLED setelah backfill (bukan lupa di-ENABLE):
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.prf'::regclass AND tgname = 'set_prf_updated_at';
--   -- Diharapkan: tgenabled = 'O' (enabled, bukan 'D').
--
--   -- (c) backfill MSDS tuntas, PI/LS/Lainnya baris lama tetap NULL (wajar):
--   SELECT count(*) FILTER (WHERE doc_msds_status IS NULL) AS msds_masih_null,
--          count(*) FILTER (WHERE doc_pi_status IS NULL)   AS pi_masih_null,
--          count(*) AS total_prf
--     FROM prf WHERE deleted_at IS NULL;
--   -- Diharapkan: msds_masih_null = 0. pi_masih_null = total_prf (SEMUA PRF
--   -- yang ada SAAT migrasi ini jalan -- kolom ini baru lahir di sini, jadi
--   -- wajar seluruhnya NULL; hanya PRF yang dibuat/diubah SETELAH migrasi
--   -- ini akan punya nilai PI).
--
--   -- (d) SIMULASI guard -- user yang BUKAN pembuat/pemegang/manager pada
--   -- PRF yang BELUM diklaim harus DITOLAK. Ganti kedua UUID contoh dengan
--   -- id PRF nyata yang statusnya SUBMITTED & acknowledged_by IS NULL, dan
--   -- id user nyata yang bukan created_by/bukan manager di company itu.
--   -- Jalankan sebagai user itu (lewat psql dgn SET ROLE / lewat klien yang
--   -- login sbg user itu) -- BUKAN sbg postgres/service_role, karena
--   -- SECURITY DEFINER tetap membaca auth.uid() sesi pemanggil:
--   --   SELECT prf_update_supporting_docs(
--   --     '<id PRF SUBMITTED, acknowledged_by IS NULL>'::uuid,
--   --     'tersedia', 'tidak_perlu', 'tidak_perlu', 'tidak_perlu'
--   --   );
--   -- Diharapkan: EXCEPTION 'Tidak berhak mengubah dokumen pendukung PRF
--   -- ini' -- BUKAN sukses diam-diam. Kalau ini LOLOS tanpa error, guard-nya
--   -- bocor (kelas bug TD-337) -- JANGAN lanjut ke produksi, lapor dulu.

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.prf_update_supporting_docs(uuid, text, text, text, text, text);
-- ALTER TABLE public.prf
--   DROP CONSTRAINT IF EXISTS prf_doc_pi_status_check,
--   DROP CONSTRAINT IF EXISTS prf_doc_ls_status_check,
--   DROP CONSTRAINT IF EXISTS prf_doc_msds_status_check,
--   DROP CONSTRAINT IF EXISTS prf_doc_other_status_check;
-- ALTER TABLE public.prf
--   DROP COLUMN IF EXISTS doc_pi_status,
--   DROP COLUMN IF EXISTS doc_ls_status,
--   DROP COLUMN IF EXISTS doc_msds_status,
--   DROP COLUMN IF EXISTS doc_other_status,
--   DROP COLUMN IF EXISTS doc_other_name,
--   DROP COLUMN IF EXISTS doc_updated_by,
--   DROP COLUMN IF EXISTS doc_updated_at;
-- =============================================================================
