-- =============================================================================
-- Migration: 20260902000007_td180_batch3_dc_master_write
-- Phase:     TD-180 BATCH 3 — perluas company-scope RLS pada jalur TULIS
--            dc_master (insert + update), dari get_user_company_id()
--            (TUNGGAL, home company) ke get_user_company_ids() (JAMAK).
-- Depends:   get_user_company_ids() · get_user_company_id() · is_super_admin()
--            · is_manager_or_above() · has_role()
-- Status:    LIVE. Dijalankan manual di SQL Editor oleh Den pada 2 September
--            2026, dan diverifikasi (kedua policy kini memuat
--            get_user_company_ids()). File ini RETROAKTIF — direkam ke repo
--            SESUDAH dieksekusi, bukan sebelum. Mengikuti preseden penulisan
--            retroaktif 20260821000001_partial-picking-guard.sql.
--
-- ⚠️ JANGAN DIJALANKAN ULANG tanpa membaca blok "BENTUK EKSPRESI" di bawah.
--
-- =============================================================================
-- KENAPA
-- =============================================================================
--   Lanjutan langsung dari batch 2 (20260902000006). Batch itu memperbaiki
--   sisi BACA (sp_btb_read, sp_btb_insert, sp_btb_update, dc_master_read) dan
--   secara eksplisit MENCATAT bahwa dc_master_insert & dc_master_update punya
--   cacat yang sama persis tapi sengaja ditinggalkan di luar scope saat itu:
--   keduanya menuntut manager/operations sehingga tidak menjelaskan gejala
--   yang dilaporkan (akun finance Elvira Nurhuda). File ini menutup sisanya.
--
--   Mekanismenya identik batch 2:
--     get_user_company_id()  = profiles.company_id  -> HOME company saja
--     get_user_company_ids() = SETOF company_id dari user_roles yang aktif
--   Seluruh 47 baris dc_master ber-company_id = SOA. User manager/operations
--   yang home company-nya bukan SOA — tapi punya role aktif di SOA — tetap
--   tertolak saat menambah/mengubah master DC, karena `SOA = <home>` false.
--   Gagalnya SENYAP untuk INSERT/UPDATE lewat PostgREST: 0 baris terpengaruh,
--   bukan error yang jelas.
--
-- =============================================================================
-- YANG DIUBAH DAN TIDAK
-- =============================================================================
--   DIUBAH  : sisi company-scope saja, ditambah
--             `OR (company_id IN (SELECT get_user_company_ids()))`.
--   TIDAK   : syarat PERAN (is_manager_or_above() OR has_role('operations'))
--             dipertahankan APA ADANYA. Migrasi ini TIDAK memberi izin tulis
--             master DC kepada siapa pun yang sebelumnya tidak punya —
--             ia hanya berhenti memblokir orang yang memang sudah berhak,
--             tapi kebetulan home company-nya beda.
--   TIDAK   : suku `company_id = get_user_company_id()` dibuang. Bukan
--             redundan — get_user_company_ids() membaca user_roles sementara
--             get_user_company_id() membaca profiles; user dengan home company
--             TANPA role aktif di sana akan kehilangan akses kalau dibuang.
--             Preseden batch 1 & 2 juga mempertahankan keduanya.
--   TIDAK   : dc_master_delete (super_admin-only, tidak terpengaruh).
--   TIDAK   : klausa `TO` — keempat policy dc_master memang tanpa `TO`.
--
-- =============================================================================
-- ⚠️ BENTUK EKSPRESI — CATATAN KEJUJURAN
-- =============================================================================
--   File ini ditulis RETROAKTIF tanpa akses baca ke DB (mesin yang menulisnya
--   tidak punya kredensial pg). Bentuk di bawah adalah rekonstruksi yang
--   mengikuti pola batch 2 — nesting `((C1 OR C2) AND R)`.
--
--   Kalau Den menulisnya dengan sebaran `((C1 AND R) OR (C2 AND R))`, hasil
--   akhirnya SECARA LOGIKA IDENTIK (distribusi AND terhadap OR), jadi tidak
--   ada perbedaan perilaku — hanya beda bentuk teks yang tersimpan.
--   Bentuk yang BENAR-BENAR tersimpan bisa dibaca dari schema_snapshot.sql
--   hasil refresh 2 Sep 2026 (sesudah migrasi ini). Kalau berbeda, samakan
--   file ini ke bentuk snapshot supaya re-run kelak tidak menghasilkan
--   definisi yang berbeda teksnya dari yang hidup.
-- =============================================================================

BEGIN;

-- ─── 1. dc_master_insert ─────────────────────────────────────────────────────
-- Syarat peran TIDAK diubah — hanya company-scope yang diperluas.
DROP POLICY IF EXISTS dc_master_insert ON public.dc_master;
CREATE POLICY dc_master_insert ON public.dc_master FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      (
        (company_id = public.get_user_company_id())
        OR (company_id IN (SELECT public.get_user_company_ids()))
      )
      AND (public.is_manager_or_above() OR public.has_role('operations'::text))
    )
  );

-- ─── 2. dc_master_update ─────────────────────────────────────────────────────
-- Syarat peran TIDAK diubah — hanya company-scope yang diperluas.
DROP POLICY IF EXISTS dc_master_update ON public.dc_master;
CREATE POLICY dc_master_update ON public.dc_master FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      (
        (company_id = public.get_user_company_id())
        OR (company_id IN (SELECT public.get_user_company_ids()))
      )
      AND (public.is_manager_or_above() OR public.has_role('operations'::text))
    )
  );

COMMIT;

-- ─── VERIFIKASI (sudah dijalankan Den 2 Sep 2026 — hasil: LOLOS) ─────────────
--   -- a. Kedua policy memuat varian jamak:
--   SELECT polname,
--          pg_get_expr(polqual,      polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--     FROM pg_policy
--    WHERE polrelid = 'public.dc_master'::regclass
--    ORDER BY polname;
--
--   -- b. Peta sisa TD-180 (policy yang MASIH memakai varian tunggal saja).
--   --    Sesudah batch 2 & 3, tak satu pun baris dc_master/sp_btb boleh muncul:
--   SELECT polrelid::regclass AS tabel, polname
--     FROM pg_policy
--    WHERE (pg_get_expr(polqual, polrelid)      LIKE '%get_user_company_id()%'
--        OR pg_get_expr(polwithcheck, polrelid) LIKE '%get_user_company_id()%')
--      AND pg_get_expr(polqual, polrelid)      NOT LIKE '%get_user_company_ids()%'
--      AND COALESCE(pg_get_expr(polwithcheck, polrelid), '') NOT LIKE '%get_user_company_ids()%'
--    ORDER BY 1, 2;
--   --    ⚠️ Sisa baris di tabel LAIN memang masih ada — TD-180 belum tuntas
--   --       menyeluruh. Batch berikutnya butuh keputusan terpisah Den.
--
--   -- c. UJI DARI BROWSER (bukan SQL Editor — auth.uid() NULL di sana):
--   --    login user manager/operations yang home company-nya BUKAN SOA tapi
--   --    punya role aktif di SOA -> Master DC HARUS bisa tambah & edit.
--
--   -- d. NEGATIVE CASE: user finance/sales (tanpa manager/operations) HARUS
--   --    TETAP DITOLAK menulis master DC, walau kini bisa membacanya lewat
--   --    dc_master_read (batch 2). Read melebar, write TIDAK.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP POLICY IF EXISTS dc_master_insert ON public.dc_master;
--   CREATE POLICY dc_master_insert ON public.dc_master FOR INSERT
--     WITH CHECK ((public.is_super_admin() OR ((company_id = public.get_user_company_id())
--       AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));
--   DROP POLICY IF EXISTS dc_master_update ON public.dc_master;
--   CREATE POLICY dc_master_update ON public.dc_master FOR UPDATE
--     USING ((public.is_super_admin() OR ((company_id = public.get_user_company_id())
--       AND (public.is_manager_or_above() OR public.has_role('operations'::text)))));
-- COMMIT;
--   ⚠️ Rollback ini mengembalikan blokade senyap bagi user multi-company yang
--      berhak menulis master DC.
