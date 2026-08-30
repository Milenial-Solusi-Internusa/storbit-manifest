-- =============================================================================
-- Migration: 20260830000003_inquiries_rls_owner_based
-- Batch:     CRM v3 — Batch Dashboard, kepemilikan deal (lanjutan)
-- Depends:   ⚠️ 20260830000002 (backfill owner_id) HARUS SUDAH DIJALANKAN
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- ISI
--   Mengganti dasar kepemilikan RLS `inquiries` dari `created_by` ke `owner_id`
--   pada DUA policy: inquiries_read dan inquiries_update.
--
-- KEPUTUSAN PRODUK (Den, 30 Agu 2026)
--   Reassign owner = PINDAH TOTAL. Owner LAMA kehilangan akses berbasis
--   kepemilikan; owner BARU mendapatkannya. `created_by` TETAP ADA sebagai
--   field historis/audit ("Dibuat Oleh" di Detail Deal) — hanya BERHENTI
--   dipakai sebagai dasar keputusan akses.
--
-- ⚠️⚠️ URUTAN MENGIKAT — JANGAN jalankan sebelum 20260830000002.
--   Migrasi ini memindahkan hak baca dari created_by ke owner_id. Kalau
--   backfill 20260830000002 BELUM jalan, masih banyak inquiry ber-owner_id
--   NULL — dan begitu policy ini aktif, seluruh baris itu LANGSUNG HILANG dari
--   pandangan sales pembuatnya (NULL = auth.uid() itu NULL, bukan true).
--   Gejalanya: papan Pipeline & Dashboard sales mendadak kosong tanpa error.
--   GUARD di BAGIAN 0 di bawah menolak menjalankan migrasi ini kalau kondisi
--   itu masih ada. Jangan dilewati.
--
-- YANG TIDAK BERUBAH (sengaja)
--   • is_manager_or_above()  — manager ke atas tetap melihat/mengubah apa pun
--                              di entitasnya, tak peduli siapa pemiliknya.
--   • is_super_admin()       — bypass top-level, persis seperti sekarang.
--   • company_id IN (SELECT get_user_company_ids())  — varian JAMAK
--                              dipertahankan apa adanya (hasil fix TD-180 P1,
--                              21 Agu 2026). JANGAN dikembalikan ke singular.
--   • Klausa procurement di inquiries_read — disalin BYTE-PER-BYTE dari policy
--                              yang berlaku; procurement melihat inquiry lewat
--                              PRF-nya, sama sekali tak bersinggungan dengan
--                              kepemilikan.
--   • inquiries_insert       — TIDAK diubah: WITH CHECK-nya hanya memeriksa
--                              company_id, nol rujukan created_by/owner_id,
--                              jadi tak ada yang perlu dipindahkan.
--
-- SUMBER DEFINISI LAMA (diverifikasi, bukan ditebak)
--   schema_snapshot.sql baris 15751-15770 DAN
--   migrations/20260821000004_crm_prf_jamak.sql baris 28-41 — keduanya
--   COCOK PERSIS, jadi tak ada penambalan belakangan yang terlewat.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN 0 — GUARD URUTAN (menolak jalan kalau backfill belum dilakukan)
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_gap bigint;
BEGIN
  SELECT COUNT(*) INTO v_gap
  FROM public.inquiries
  WHERE owner_id IS NULL AND created_by IS NOT NULL;

  IF v_gap > 0 THEN
    RAISE EXCEPTION
      'DIBATALKAN: masih ada % inquiry dengan owner_id NULL padahal created_by terisi. Jalankan migrasi 20260830000002 (backfill) LEBIH DULU — kalau tidak, baris-baris itu akan hilang dari pandangan sales pemiliknya begitu policy ini aktif.', v_gap;
  END IF;

  RAISE NOTICE 'Guard lolos: nol inquiry yang perlu backfill. Lanjut mengganti policy.';
END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN 1 — GANTI KEDUA POLICY
-- ═════════════════════════════════════════════════════════════════════════════
-- Dibungkus transaksi: DROP dan CREATE harus jadi satu kesatuan. Kalau gagal di
-- tengah tanpa transaksi, tabel bisa tertinggal TANPA policy baca — artinya
-- setiap non-super-admin kehilangan akses ke seluruh inquiry sampai diperbaiki.
BEGIN;

-- ── inquiries_read ──────────────────────────────────────────────────────────
-- Perubahan TUNGGAL: `created_by = auth.uid()` → `owner_id = auth.uid()`.
-- Sisanya identik dengan policy yang berlaku sekarang.
DROP POLICY IF EXISTS inquiries_read ON public.inquiries;
CREATE POLICY inquiries_read ON public.inquiries
FOR SELECT
USING (
  is_super_admin()
  OR (
    (company_id IN (SELECT get_user_company_ids()))
    AND (
      is_manager_or_above()
      OR (owner_id = auth.uid())
      OR (
        has_role('procurement'::text)
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
-- USING dan WITH CHECK dijaga TETAP IDENTIK satu sama lain, seperti aslinya.
-- ⚠️ Konsekuensi yang disengaja: karena WITH CHECK juga berbasis owner_id,
--    seorang sales pemilik TIDAK BISA mengoper deal ke orang lain lewat
--    PostgREST — baris hasilnya tak lagi lolos WITH CHECK miliknya sendiri.
--    Pengoperan jadi efektif aksi manager-ke-atas, persis seperti keputusan
--    produknya. Sales pemilik tetap bebas mengubah field lain.
DROP POLICY IF EXISTS inquiries_update ON public.inquiries;
CREATE POLICY inquiries_update ON public.inquiries
FOR UPDATE
USING (
  ((company_id IN (SELECT get_user_company_ids()))
   AND (is_manager_or_above() OR (owner_id = auth.uid())))
  OR is_super_admin()
)
WITH CHECK (
  ((company_id IN (SELECT get_user_company_ids()))
   AND (is_manager_or_above() OR (owner_id = auth.uid())))
  OR is_super_admin()
);

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — jalankan SESUDAHNYA
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Kedua policy sudah berbasis owner_id, dan insert tak tersentuh:
-- SELECT polname,
--        pg_get_expr(polqual,      polrelid) AS using_expr,
--        pg_get_expr(polwithcheck, polrelid) AS with_check_expr
-- FROM pg_policy
-- WHERE polrelid = 'public.inquiries'::regclass
-- ORDER BY polname;
--   HARAPAN: inquiries_read & inquiries_update memuat `owner_id = auth.uid()`
--            dan TIDAK lagi memuat `created_by = auth.uid()`;
--            inquiries_insert tetap hanya memeriksa company_id.
--
-- 2) Nol baris yatim (tak terlihat siapa pun kecuali manager+):
-- SELECT COUNT(*) AS inquiry_tanpa_owner FROM public.inquiries WHERE owner_id IS NULL;
--   Baris begini hanya lahir dari inquiry lama yang created_by-nya juga NULL.
--   Ia TIDAK hilang dari sistem — manager+/super_admin tetap melihatnya, dan di
--   Dashboard ia muncul sebagai "Tanpa Pemilik". Kalau angkanya > 0 dan kamu mau
--   mengatribusikannya, set owner_id-nya manual (deal yang sudah closed perlu
--   trigger trg_z_lock_inquiry_owner dimatikan sementara — lihat 20260830000002).
--
-- ⚠️ TES RLS HARUS DI BROWSER, bukan SQL Editor: auth.uid() NULL di SQL Editor
--    (aturan CLAUDE.md), jadi seluruh klausa kepemilikan akan selalu false di
--    sana dan hasilnya menyesatkan.
--
-- ROLLBACK — kembalikan kedua policy ke dasar created_by:
--   BEGIN;
--   DROP POLICY IF EXISTS inquiries_read ON public.inquiries;
--   CREATE POLICY inquiries_read ON public.inquiries FOR SELECT
--   USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids()))
--     AND (is_manager_or_above() OR (created_by = auth.uid())
--       OR (has_role('procurement'::text) AND (EXISTS ( SELECT 1 FROM prf p
--         WHERE ((p.inquiry_id = inquiries.id) AND (p.company_id = inquiries.company_id)
--            AND (p.deleted_at IS NULL))))))));
--   DROP POLICY IF EXISTS inquiries_update ON public.inquiries;
--   CREATE POLICY inquiries_update ON public.inquiries FOR UPDATE
--   USING (((company_id IN (SELECT get_user_company_ids()))
--     AND (is_manager_or_above() OR (created_by = auth.uid()))) OR is_super_admin())
--   WITH CHECK (((company_id IN (SELECT get_user_company_ids()))
--     AND (is_manager_or_above() OR (created_by = auth.uid()))) OR is_super_admin());
--   COMMIT;
