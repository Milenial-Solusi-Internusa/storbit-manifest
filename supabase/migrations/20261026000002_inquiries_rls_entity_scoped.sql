-- =============================================================================
-- Migration: 20261026000002_inquiries_rls_entity_scoped
-- Inquiry Management Putaran 5 K1c -- Audit K1a menemukan: inquiries_read dan
-- inquiries_update memakai is_manager_or_above() TANPA parameter entitas.
-- Fungsi itu memeriksa peran manager-ke-atas user DI MANA PUN (seluruh role
-- aktifnya, lintas entitas) -- bukan khusus di company_id baris yang dibaca/
-- diubah. Konsekuensi: seorang manager di entitas A yang JUGA punya peran
-- (apa pun levelnya) di entitas B bisa membaca DAN MENGUBAH inquiry B
-- sebagai "manager", padahal perannya di B belum tentu manager.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- ⛔ BERKAS INI TIDAK MEMUAT DROP -- memakai ALTER POLICY (pola sama
-- 20260912000004_is_procurement_functional.sql: "ALTER POLICY ... USING
-- (...)" mengganti satu klausa tanpa DROP+CREATE), BOLEH dijalankan Vir
-- lewat connector.
--
-- ISI -- SATU PERUBAHAN per policy: is_manager_or_above() -> is_manager_or_
-- above_in(company_id). Sisa ekspresi (termasuk klausa procurement di
-- inquiries_read) VERBATIM dari bentuk LIVE saat ini (dikutip dari
-- 20260830000003_inquiries_rls_owner_based.sql:91-109/121-135 -- migrasi
-- itu bertanggal lebih awal dari 20260912000004 tapi EKSEKUSINYA lebih
-- belakangan, 18 Sep 2026, lihat header migrasi itu sendiri + CLAUDE.md
-- entri 18 Sep -- jadi bentuk owner_id-nya yang LIVE hari ini, bukan bentuk
-- created_by yang sempat live 12 Sep-18 Sep).
--
-- inquiries_insert TIDAK disentuh (sudah hanya company_id IN
-- get_user_company_ids(), nol fungsi manager yang perlu di-scope).
-- =============================================================================

BEGIN;

-- ── inquiries_read ──────────────────────────────────────────────────────────
ALTER POLICY inquiries_read ON public.inquiries
  USING (
    is_super_admin()
    OR (
      (company_id IN (SELECT get_user_company_ids()))
      AND (
        is_manager_or_above_in(company_id)
        OR (owner_id = auth.uid())
        OR (
          is_procurement_functional()
          AND (EXISTS (
            SELECT 1 FROM prf p
            WHERE ((p.inquiry_id = inquiries.id)
               AND (p.company_id = inquiries.company_id)
               AND (p.deleted_at IS NULL))
          ))
        )
      )
    )
  );

-- ── inquiries_update ────────────────────────────────────────────────────────
ALTER POLICY inquiries_update ON public.inquiries
  USING (
    ((company_id IN (SELECT get_user_company_ids()))
     AND (is_manager_or_above_in(company_id) OR (owner_id = auth.uid())))
    OR is_super_admin()
  )
  WITH CHECK (
    ((company_id IN (SELECT get_user_company_ids()))
     AND (is_manager_or_above_in(company_id) OR (owner_id = auth.uid())))
    OR is_super_admin()
  );

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Kedua klausa sekarang memuat is_manager_or_above_in, TIDAK lagi
--    is_manager_or_above() TANPA argumen (keduanya mengandung string
--    "is_manager_or_above" -- cek substring persis):
-- SELECT polname,
--        pg_get_expr(polqual,      polrelid) AS using_expr,
--        pg_get_expr(polwithcheck, polrelid) AS with_check_expr
-- FROM pg_policy
-- WHERE polrelid = 'public.inquiries'::regclass AND polname IN ('inquiries_read','inquiries_update')
-- ORDER BY polname;
--   HARAP: keduanya memuat "is_manager_or_above_in(inquiries.company_id)",
--   NOL kemunculan "is_manager_or_above()" (tanpa argumen) tersisa.
--
-- 2) inquiries_insert tidak tersentuh:
-- SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--  WHERE polrelid='public.inquiries'::regclass AND polname='inquiries_insert';
--   HARAP: tetap "(company_id IN ( SELECT get_user_company_ids() AS get_user_company_ids))",
--   byte-identik sebelum migrasi ini.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (mengembalikan ke is_manager_or_above() tanpa argumen, verbatim
-- 20260830000003 -- urutan tidak penting, keduanya ALTER POLICY independen):
--
--   BEGIN;
--   ALTER POLICY inquiries_read ON public.inquiries
--     USING (
--       is_super_admin()
--       OR (
--         (company_id IN (SELECT get_user_company_ids()))
--         AND (
--           is_manager_or_above()
--           OR (owner_id = auth.uid())
--           OR (
--             is_procurement_functional()
--             AND (EXISTS (
--               SELECT 1 FROM prf p
--               WHERE ((p.inquiry_id = inquiries.id)
--                  AND (p.company_id = inquiries.company_id)
--                  AND (p.deleted_at IS NULL))
--             ))
--           )
--         )
--       )
--     );
--   ALTER POLICY inquiries_update ON public.inquiries
--     USING (
--       ((company_id IN (SELECT get_user_company_ids()))
--        AND (is_manager_or_above() OR (owner_id = auth.uid())))
--       OR is_super_admin()
--     )
--     WITH CHECK (
--       ((company_id IN (SELECT get_user_company_ids()))
--        AND (is_manager_or_above() OR (owner_id = auth.uid())))
--       OR is_super_admin()
--     );
--   COMMIT;
-- =============================================================================
