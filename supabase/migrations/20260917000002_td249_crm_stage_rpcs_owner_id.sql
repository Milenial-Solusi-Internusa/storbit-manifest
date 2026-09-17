-- =============================================================================
-- Migration: 20260917000002_td249_crm_stage_rpcs_owner_id
-- Phase:     TD-249 — sumbu kepemilikan `p_scope_own` di crm_stage_conversion
--            & crm_stage_age pindah dari inquiries.created_by ke
--            inquiries.owner_id, cermin RLS inquiries_read/inquiries_update
--            versi 20260830000003.
-- Depends:   20260909000006_crm_dashboard_aggregate_rpc (LIVE 9 Sep 2026 —
--              kedua fungsi lahir di sana; badan disalin dari versi LIVE
--              produksi, hanya SATU baris per fungsi yang berubah)
--            · 20260830000002_inquiry_owner_backfill_and_lock (LIVE 6 Sep 2026 —
--              owner_id terisi & terkunci; guard 20260830000003 menolak jalan
--              bila masih ada owner_id NULL ber-created_by)
--            · 20260830000003_inquiries_rls_owner_based — pasangan WAJIB,
--              lihat blok ⛔ di bawah.
-- Status:    BELUM DIJALANKAN — jalankan bersamaan 20260830000003 di hari
--            merge CRM v3 ke main.
--
-- ⛔⛔ WAJIB SATU SESI SQL EDITOR BERSAMA 20260830000003 — staging dulu.
--   Urutan keduanya bebas, asal keduanya selesai di hari yang sama. Yang
--   DILARANG: membiarkan salah satu hidup sendirian. Kedua fungsi ini
--   SECURITY INVOKER, jadi hasilnya selalu IRISAN (baris yang lolos RLS)
--   ∩ (baris yang lolos predikat p_scope_own) — dua sumbu berbeda = irisan
--   yang berbeda:
--   · RPC sudah owner_id, RLS masih created_by → deal yang DIOPER kepada
--     seorang sales (owner_id = dia, created_by = orang lain) lolos RPC tapi
--     ditolak RLS → hilang dari Aging Per Tahap / Daftar Deal Stale-nya.
--   · RLS sudah owner_id, RPC masih created_by → deal yang sama lolos RLS tapi
--     ditolak RPC → hilang juga; ditambah deal yang ia BUAT lalu dioper ke
--     orang lain lolos RPC tapi ditolak RLS.
--   Dua-duanya SENYAP: nol error, angka mengecil. Hanya ketika kedua sumbu
--   sama-sama owner_id irisannya kembali = deal yang ia miliki.
--   Peringatan asalnya: 20260909000006:187-192 · TD-249 (08_TECH_DEBT.md).
--
-- ⛔ JANGAN jalankan ulang 20260909000006 sesudah migrasi ini. Ia idempoten
--   (CREATE OR REPLACE) dan akan MENGEMBALIKAN created_by tanpa peringatan —
--   memutus pasangan di atas dari arah pertama.
--
-- SIFAT: 100% BACA — dua CREATE OR REPLACE fungsi SQL STABLE SECURITY INVOKER.
--   Nol DDL tabel, nol perubahan RLS (itu isi 20260830000003), nol backfill.
--   Predikat baru SENGAJA `i.owner_id = auth.uid()` TANPA fallback created_by:
--   cermin persis klausa RLS 20260830000003:99. Menambah OR created_by di
--   sini = RPC lebih longgar dari RLS → irisan timpang lagi dari arah lain.
--
-- ACL: TIDAK diulang. Signature (uuid, boolean, timestamptz, timestamptz)
--   tidak berubah; CREATE OR REPLACE mempertahankan REVOKE PUBLIC + GRANT
--   authenticated dari 20260909000006:417-421 (terverifikasi mendarat:
--   schema_snapshot.sql 72cd622 :20063-20072). Peringatan DROP+CREATE di
--   20260909000006:400-406 tidak berlaku di sini.
--
-- CATATAN BADAN: acuan = versi LIVE produksi (schema_snapshot.sql 72cd622,
--   refresh 11 Sep 2026), BUKAN file 20260909000006. Identik untuk
--   crm_stage_conversion; untuk crm_stage_age versi LIVE TIDAK memuat 3 baris
--   komentar "DISTINCT ON" (20260909000006:268-270) — dipindah ke luar badan
--   di bawah supaya badan tetap byte-identik dengan LIVE.
-- =============================================================================

BEGIN;

-- ─── 1. crm_stage_conversion ─────────────────────────────────────────────────
-- Badan = LIVE verbatim; perubahan TUNGGAL: predikat p_scope_own
-- `i.created_by = auth.uid()` → `i.owner_id = auth.uid()`.
-- (Blok ⛔ 20260909000006:187-192 "GANTI ke owner_id BERSAMAAN dengan
--  20260830000003" — TERLAKSANA di migrasi ini, 20260917000002.)
CREATE OR REPLACE FUNCTION public.crm_stage_conversion(
  p_company_id uuid        DEFAULT NULL,
  p_scope_own  boolean     DEFAULT false,
  p_start      timestamptz DEFAULT NULL,
  p_end        timestamptz DEFAULT NULL
) RETURNS TABLE(to_status text, inquiries bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH cohort AS (
    SELECT i.id
    FROM   inquiries i
    WHERE  i.deleted_at IS NULL
      AND  (p_company_id IS NULL OR i.company_id = p_company_id)
      AND  (NOT p_scope_own OR i.owner_id = auth.uid())
      AND  (
             i.status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION')
             OR (i.status IN ('WON','LOST','CANCELLED')
                 AND (p_start IS NULL OR i.closed_at >= p_start)
                 AND (p_end   IS NULL OR i.closed_at <  p_end))
           )
  )
  SELECT upper(h.to_status)::text        AS to_status,
         count(DISTINCT h.inquiry_id)::bigint AS inquiries
  FROM   inquiry_status_history h
  JOIN   cohort c ON c.id = h.inquiry_id
  GROUP  BY 1;
$$;

-- ─── 2. crm_stage_age ────────────────────────────────────────────────────────
-- Badan = LIVE verbatim; perubahan TUNGGAL yang sama di predikat p_scope_own.
-- (Komentar 20260909000006:236-237 — terlaksana di 20260917000002.)
-- last_move memakai DISTINCT ON: baris pertama tiap inquiry sesudah diurut
-- menurun = transisi TERAKHIRNYA — bentuk yang sama dengan `.order('changed_at',
-- desc)` lalu "ambil yang pertama terlihat" di JS yang digantikan. (Sengaja di
-- LUAR badan: versi LIVE tidak memuatnya — lihat CATATAN BADAN.)
CREATE OR REPLACE FUNCTION public.crm_stage_age(
  p_company_id uuid        DEFAULT NULL,
  p_scope_own  boolean     DEFAULT false,
  p_start      timestamptz DEFAULT NULL,
  p_end        timestamptz DEFAULT NULL
) RETURNS TABLE(inquiry_id uuid, inquiry_no text, status text,
                company_id uuid, owner_id uuid, account_name text,
                stage_since timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH cohort AS (
    SELECT i.id, i.inquiry_no, i.status, i.company_id, i.owner_id,
           i.prospect_id, i.customer_id
    FROM   inquiries i
    WHERE  i.deleted_at IS NULL
      AND  (p_company_id IS NULL OR i.company_id = p_company_id)
      AND  (NOT p_scope_own OR i.owner_id = auth.uid())
      AND  (
             i.status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION')
             OR (i.status IN ('WON','LOST','CANCELLED')
                 AND (p_start IS NULL OR i.closed_at >= p_start)
                 AND (p_end   IS NULL OR i.closed_at <  p_end))
           )
  ),
  last_move AS (
    SELECT DISTINCT ON (h.inquiry_id) h.inquiry_id, h.changed_at
    FROM   inquiry_status_history h
    JOIN   cohort c ON c.id = h.inquiry_id
    ORDER  BY h.inquiry_id, h.changed_at DESC
  )
  SELECT c.id,
         c.inquiry_no::text,
         upper(c.status)::text,
         c.company_id,
         c.owner_id,
         COALESCE(pa.name, ca.name)::text AS account_name,
         lm.changed_at                    AS stage_since
  FROM   cohort c
  LEFT   JOIN last_move lm ON lm.inquiry_id = c.id
  LEFT   JOIN accounts  pa ON pa.id = c.prospect_id
  LEFT   JOIN accounts  ca ON ca.id = c.customer_id;
$$;

-- ─── 3. COMMENT ON FUNCTION ──────────────────────────────────────────────────
-- Teks lama (20260909000006:434-437) berbunyi "p_scope_own memakai created_by
-- — ganti ke owner_id BERSAMAAN dengan 20260830000003"; digantikan di sini.
-- ⚠️ Per schema_snapshot.sql 72cd622 (11 Sep 2026) NOL dari 6 COMMENT crm_* di
-- 20260909000006 yang mendarat di produksi — dua COMMENT di bawah kemungkinan
-- besar yang PERTAMA untuk kedua fungsi ini. Empat fungsi lain di luar cakupan.
COMMENT ON FUNCTION public.crm_stage_conversion(uuid, boolean, timestamptz, timestamptz) IS
  'Jumlah inquiry DISTINCT yang pernah mencapai tiap status. p_scope_own memakai inquiries.owner_id sejak 20260917000002 (semula created_by; diganti bersamaan RLS 20260830000003 — TD-249).';
COMMENT ON FUNCTION public.crm_stage_age(uuid, boolean, timestamptz, timestamptz) IS
  'Satu baris per inquiry + kapan ia masuk status sekarang (Aging & Stale Deals). p_scope_own memakai inquiries.owner_id sejak 20260917000002 (semula created_by; diganti bersamaan RLS 20260830000003 — TD-249).';

COMMIT;

-- =============================================================================
-- VERIFIKASI (baca saja) — sesudah KEDUA migrasi jalan di sesi yang sama
-- =============================================================================
--   -- a. Kedua badan sudah owner_id, nol created_by. HARAPAN: 2 baris, true/false.
--   SELECT p.proname,
--          p.prosrc LIKE '%i.owner_id = auth.uid()%'   AS pakai_owner_id,
--          p.prosrc LIKE '%i.created_by = auth.uid()%' AS masih_created_by
--   FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE  n.nspname = 'public' AND p.proname IN ('crm_stage_conversion','crm_stage_age');
--
--   -- b. Pasangannya sudah jalan: RLS inquiries_read berbasis owner_id. HARAPAN: true.
--   SELECT qual LIKE '%owner_id = auth.uid()%' AS rls_owner_id
--   FROM   pg_policies
--   WHERE  schemaname = 'public' AND tablename = 'inquiries' AND policyname = 'inquiries_read';
--
--   -- c. ACL tak berubah: anon tetap TIDAK bisa eksekusi. HARAPAN: 0 baris.
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE  n.nspname = 'public' AND p.proname IN ('crm_stage_conversion','crm_stage_age')
--     AND  has_function_privilege('anon', p.oid, 'EXECUTE');
--
--   -- d. COMMENT mendarat. HARAPAN: 2 baris, keduanya memuat '20260917000002'.
--   SELECT p.proname, obj_description(p.oid, 'pg_proc')
--   FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE  n.nspname = 'public' AND p.proname IN ('crm_stage_conversion','crm_stage_age');
--
--   -- e. DARI BROWSER (auth.uid() NULL di SQL Editor, p_scope_own jadi hampa di sana):
--   --    login sebagai sales yang punya deal DIOPER kepadanya (owner_id = dia,
--   --    created_by ≠ dia) → Aging Per Tahap & Daftar Deal Stale HARUS memuatnya.
-- =============================================================================
