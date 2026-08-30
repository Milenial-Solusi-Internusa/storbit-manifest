-- =============================================================================
-- Migration: 20260830000005_sales_targets
-- Batch:     CRM v3 — Bagian 4 (target sales + halaman AdminHub)
-- Depends:   companies · profiles · get_user_company_ids() · is_super_admin()
--            · is_manager_or_above() · set_updated_at()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- ISI
--   1. Tabel sales_targets + constraint + index
--   2. RLS (baca: manager+ atau pemilik target sendiri · tulis: manager+)
--   3. GRANT (tabel baru TIDAK auto-grant — aturan CLAUDE.md)
--   4. Trigger updated_at
--
-- KEPUTUSAN DESAIN (Den, 30 Agu 2026) — JANGAN dibalik tanpa bahas
--   • GRANULARITY per SALES per BULAN. `user_id` NOT NULL — tak ada baris
--     tingkat entitas, jadi tak ada aturan resolusi "target siapa yang menang"
--     yang perlu diperdebatkan. Ini satu-satunya bentuk yang bisa mengisi kolom
--     "% target" per baris di widget Sales Performance, yang memang per orang.
--   • DUA METRIK: `target_value` (kuota rupiah) dan `target_deals` (kuota jumlah
--     deal WON). Win-rate minimum SENGAJA TIDAK jadi kolom — angka ≥45% / ≥85% /
--     ≥3.0x adalah ambang KPI perusahaan, bukan kuota per orang, jadi tempatnya
--     helper text di form, bukan data tersimpan.
--   • PERIODE BULANAN sebagai basis (period_year + period_month). Target
--     kuartal/tahun = penjumlahan bulan-bulannya, sehingga selector periode
--     Dashboard (This Month/Quarter/Year) terlayani ketiganya dari satu sumber.
--
-- ⚠️ KENAPA KEDUA KOLOM METRIK NULLABLE DAN BUKAN `DEFAULT 0`
--   "Belum ditetapkan" harus bisa dibedakan dari "target nol". Bedanya lebih
--   tajam di sini daripada di kolom nilai biasa, karena attainment adalah
--   PEMBAGIAN: target NULL harus menghasilkan "—" (tak bisa dinilai), sedangkan
--   target 0 adalah pernyataan bisnis yang berbeda dan sekaligus pembagi nol.
--   DEFAULT 0 akan menyamakan keduanya dan membuat widget menampilkan angka
--   mustahil. Prinsip yang sama dipakai inquiries.estimated_value (migrasi
--   20260722000007) dan duration_seconds di inquiry_status_history.
--   CHECK di bawah menuntut MINIMAL SATU dari keduanya terisi — baris target
--   yang tak menetapkan apa pun tidak punya makna.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PRA-CEK — pastikan tabelnya memang belum ada
-- ═════════════════════════════════════════════════════════════════════════════
-- SELECT to_regclass('public.sales_targets') AS sudah_ada;
--   HARAPAN: NULL. Kalau sudah terisi, JANGAN lanjut — periksa dulu apa yang ada
--   di sana, migrasi ini tidak idempoten untuk CREATE TABLE.


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. TABEL
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.sales_targets (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id    uuid NOT NULL,
    user_id       uuid NOT NULL,           -- salesperson pemegang target
    period_year   integer NOT NULL,
    period_month  integer NOT NULL,        -- 1..12

    target_value  numeric,                 -- kuota rupiah;      NULL = tak ditetapkan
    target_deals  integer,                 -- kuota jumlah deal; NULL = tak ditetapkan

    notes         text,
    is_active     boolean DEFAULT true NOT NULL,
    created_by    uuid,
    created_at    timestamp with time zone DEFAULT now() NOT NULL,
    updated_at    timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at    timestamp with time zone,

    CONSTRAINT sales_targets_pkey PRIMARY KEY (id),
    CONSTRAINT sales_targets_company_fkey FOREIGN KEY (company_id)
        REFERENCES public.companies(id),
    CONSTRAINT sales_targets_user_fkey FOREIGN KEY (user_id)
        REFERENCES public.profiles(id),
    CONSTRAINT sales_targets_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES public.profiles(id),

    CONSTRAINT sales_targets_month_check CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT sales_targets_year_check  CHECK (period_year  BETWEEN 2020 AND 2100),
    CONSTRAINT sales_targets_value_check CHECK (target_value IS NULL OR target_value >= 0),
    CONSTRAINT sales_targets_deals_check CHECK (target_deals IS NULL OR target_deals >= 0),
    -- Minimal satu metrik terisi — lihat catatan di header.
    CONSTRAINT sales_targets_metric_required CHECK (
        target_value IS NOT NULL OR target_deals IS NOT NULL
    )
);

COMMENT ON TABLE public.sales_targets IS
  'Target penjualan per salesperson per bulan. Dipakai Dashboard CRM untuk menghitung quota attainment. Granularity per-orang (keputusan Den 30 Agu 2026) — tak ada baris tingkat entitas.';
COMMENT ON COLUMN public.sales_targets.target_value IS
  'Kuota nilai (rupiah). NULL = belum ditetapkan, BUKAN nol — attainment atas target NULL harus tampil "—", bukan dibagi nol.';
COMMENT ON COLUMN public.sales_targets.target_deals IS
  'Kuota jumlah deal WON. NULL = belum ditetapkan, BUKAN nol. Metrik ini tidak bergantung pada inquiries.estimated_value, jadi sudah bermakna sejak hari pertama.';

-- Satu target AKTIF per sales per bulan. Parsial `WHERE deleted_at IS NULL`
-- supaya baris yang sudah diarsip tidak memblokir pembuatan ulang periode yang
-- sama — pola yang sama dengan role_menu_permissions_role_menu_action_unique.
CREATE UNIQUE INDEX sales_targets_unique_active
    ON public.sales_targets (company_id, user_id, period_year, period_month)
    WHERE deleted_at IS NULL;

-- Lookup widget Dashboard: "target semua sales di entitas X untuk periode Y".
CREATE INDEX idx_sales_targets_period
    ON public.sales_targets (company_id, period_year, period_month)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_sales_targets_user
    ON public.sales_targets (user_id)
    WHERE deleted_at IS NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. RLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Bentuknya meniru inquiries_read/inquiries_update pasca-migrasi 20260830000003,
-- termasuk varian JAMAK get_user_company_ids(). ⚠️ JANGAN diganti ke varian
-- tunggal get_user_company_id(): itu memutus user yang genuinely multi-entitas
-- (TD-180, sudah terjadi berulang).
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- BACA: manager-ke-atas melihat seluruh entitasnya; sales hanya targetnya
-- sendiri. super_admin bypass di TOP LEVEL (aturan CLAUDE.md), bukan bersarang
-- di dalam filter company_id.
CREATE POLICY sales_targets_read ON public.sales_targets
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      (company_id IN (SELECT public.get_user_company_ids()))
      AND (public.is_manager_or_above() OR user_id = auth.uid())
    )
  );

-- TULIS: manager-ke-atas saja. Sales TIDAK boleh menetapkan targetnya sendiri —
-- itu inti dari kenapa target ada.
CREATE POLICY sales_targets_insert ON public.sales_targets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR ((company_id IN (SELECT public.get_user_company_ids())) AND public.is_manager_or_above())
  );

CREATE POLICY sales_targets_update ON public.sales_targets
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR ((company_id IN (SELECT public.get_user_company_ids())) AND public.is_manager_or_above())
  )
  WITH CHECK (
    public.is_super_admin()
    OR ((company_id IN (SELECT public.get_user_company_ids())) AND public.is_manager_or_above())
  );

-- DELETE fisik sengaja TIDAK diberi policy: penghapusan lewat soft delete
-- (deleted_at) yang jalannya lewat policy UPDATE di atas. Konsisten dengan
-- aturan "jangan hard-delete data business" di CLAUDE.md.


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. GRANT — WAJIB, tabel baru TIDAK auto-grant (aturan CLAUDE.md)
-- ═════════════════════════════════════════════════════════════════════════════
-- Pola disalin apa adanya dari loss_reasons/channel_types (migrasi
-- 20260827000001): GRANT lebar ke `authenticated`, pembatasan sebenarnya
-- dikerjakan RLS di atas. Tanpa blok ini, seluruh query ke tabel ini gagal 403
-- meski policy-nya sudah benar — persis insiden 5 Agu 2026 (TD-165).
GRANT ALL ON TABLE public.sales_targets TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sales_targets TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sales_targets TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER updated_at
-- ═════════════════════════════════════════════════════════════════════════════
-- Memakai ULANG public.set_updated_at() yang sudah dipakai belasan tabel lain
-- (mis. hrga_approval_configs) — bukan fungsi baru.
CREATE TRIGGER set_sales_targets_updated_at
  BEFORE UPDATE ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — jalankan SESUDAHNYA
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Tabel, constraint, index:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.sales_targets'::regclass ORDER BY conname;
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE schemaname='public' AND tablename='sales_targets' ORDER BY indexname;
--
-- 2) RLS aktif + 3 policy:
-- SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
--        pg_get_expr(polwithcheck, polrelid) AS with_check_expr
--   FROM pg_policy WHERE polrelid = 'public.sales_targets'::regclass ORDER BY polname;
--   HARAPAN: sales_targets_read / _insert / _update, semuanya memuat
--            get_user_company_ids() (JAMAK) dan is_super_admin() di top level.
--
-- 3) GRANT benar-benar menempel:
-- SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name='sales_targets'
--  GROUP BY grantee ORDER BY grantee;
--   HARAPAN: `authenticated` punya SELECT/INSERT/UPDATE/DELETE.
--
-- 4) CHECK "minimal satu metrik" benar-benar menggigit — HARUS GAGAL:
-- INSERT INTO public.sales_targets (company_id, user_id, period_year, period_month)
-- SELECT c.id, p.id, 2026, 9 FROM public.companies c, public.profiles p LIMIT 1;
--
-- 5) UNIQUE parsial benar-benar menggigit — INSERT kedua HARUS GAGAL:
-- (jalankan dua kali dengan company_id/user_id yang sama)
--
-- ⚠️ TES RLS HARUS DI BROWSER, bukan SQL Editor: auth.uid() NULL di SQL Editor
--    (aturan CLAUDE.md), jadi klausa user_id = auth.uid() selalu false di sana
--    dan hasilnya menyesatkan.
--
-- ROLLBACK penuh:
--   DROP TRIGGER IF EXISTS set_sales_targets_updated_at ON public.sales_targets;
--   DROP TABLE IF EXISTS public.sales_targets;   -- policy & index ikut terhapus
