-- ============================================================================
-- PRF — fix RLS: tambah cabang is_super_admin() ke 4 policy
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-10.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: Policy PRF Fase 0 (20260710000001) TIDAK punya cabang
--   is_super_admin() → super_admin (role tertinggi) DITOLAK saat INSERT PRF.
--   Itu salah; super_admin harus bisa semua (konsisten pola tabel lain, mis.
--   hrga_requests). Diperbaiki: DROP + CREATE 4 policy, tiap kondisi lama
--   dibungkus `public.is_super_admin() OR (…)` sesuai jenis policy —
--   INSERT = WITH CHECK saja, SELECT = USING saja, UPDATE = USING & WITH CHECK.
--
-- VERIFIKASI (saat eksekusi manual): pg_policies count=4; is_super_admin muncul
--   di qual/with_check sesuai jenis (insert=check-only, select=using-only,
--   update=keduanya).
--
-- KONSEKUENSI: super_admin kini LIHAT PRF lintas-3-entitas (wajar — super_admin
--   bypass company scope di semua modul). BEDA dari Fase 3b (inbox procurement
--   lintas-entitas untuk role `procurement`, yang masih ditunda & butuh custom).
--
-- CATATAN AKURASI: Terverifikasi cocok dengan policy live (pg_policies) pada
--   2026-07-10. Perbedaan tekstual di pg_policies hanya normalisasi Postgres
--   (prefix public. dibuang, cast ::text ditambah) — logika identik.
-- ============================================================================


-- ── prf_insert (INSERT: WITH CHECK saja) ────────────────────────────────────
DROP POLICY IF EXISTS prf_insert ON public.prf;
CREATE POLICY prf_insert ON public.prf
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin() OR (
      (company_id = public.get_user_company_id())
      AND (created_by = auth.uid())
      AND (public.has_role('sales') OR public.has_role('gm_bd'))
    )
  );

-- ── prf_select (SELECT: USING saja) ─────────────────────────────────────────
DROP POLICY IF EXISTS prf_select ON public.prf;
CREATE POLICY prf_select ON public.prf
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR (
      (company_id = public.get_user_company_id())
      AND (
        (created_by = auth.uid())
        OR public.has_role('procurement')
        OR public.is_manager_or_above()
      )
    )
  );

-- ── prf_update_draft (UPDATE: USING & WITH CHECK) ───────────────────────────
DROP POLICY IF EXISTS prf_update_draft ON public.prf;
CREATE POLICY prf_update_draft ON public.prf
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR (
      (deleted_at IS NULL)
      AND (company_id = public.get_user_company_id())
      AND (created_by = auth.uid())
      AND (status::text = 'DRAFT')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR (
      (company_id = public.get_user_company_id())
      AND (created_by = auth.uid())
    )
  );

-- ── prf_update_status (UPDATE: USING & WITH CHECK) ──────────────────────────
DROP POLICY IF EXISTS prf_update_status ON public.prf;
CREATE POLICY prf_update_status ON public.prf
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin() OR (
      (deleted_at IS NULL)
      AND (company_id = public.get_user_company_id())
      AND public.has_role('procurement')
      AND (status::text = 'SUBMITTED')
    )
  )
  WITH CHECK (
    public.is_super_admin() OR (
      company_id = public.get_user_company_id()
    )
  );
