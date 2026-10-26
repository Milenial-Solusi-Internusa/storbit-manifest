-- =============================================================================
-- Migration: 20261027000002_crm_inquiry_owner_history
-- Inquiry Management Putaran 8 -- Owner Assignment, L-13 (riwayat)
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
-- MEMUAT DROP: TIDAK. Migrasi ini boleh dijalankan lewat connector/Claude
-- Code seperti biasa (CREATE TABLE murni, idempoten).
-- URUTAN: migrasi KEDUA dari blok Putaran 8. WAJIB jalan SEBELUM
-- 20261027000003 (RPC yang INSERT ke tabel ini).
--
-- RINGKASAN
-- Tabel BARU riwayat lengkap pergantian owner inquiry (banyak baris per
-- inquiry: from/to/reason/siapa/kapan), pola sama account_pool_history
-- (Lead Pool) -- KEPUTUSAN Mas 26 Okt 2026, dipilih atas 2 alternatif lain
-- (memperluas inquiry_status_history yang sudah hidup di produksi, atau
-- tanpa tabel riwayat sama sekali/hanya kolom snapshot di inquiries).
-- Ditulis HANYA oleh reassign_inquiry_owner RPC (SECURITY DEFINER,
-- 20261027000003) -- INSERT/UPDATE/DELETE langsung dicabut dari
-- authenticated DAN anon.
--
-- TAMPILAN DI TAB "STATUS HISTORY" DETAIL INQUIRY DITUNDA ke Putaran 11
-- (keputusan Mas) -- tabel ini lahir sebagai pencatat saja di Putaran 8;
-- query balik (merge dgn inquiry_status_history di DealDetailPage.jsx)
-- baru dikerjakan saat modal Reassign ada (hint modal mockup baris 472:
-- "Recorded in the Status History tab").
--
-- RLS SELECT -- PERSIS pola inquiry_status_history_select, dikonfirmasi
-- Vir 26 Okt 2026 (query baca-saja terhadap staging):
--   EXISTS (SELECT 1 FROM inquiries i WHERE i.id = <tabel>.inquiry_id)
-- Sub-select ke `inquiries` cukup tanpa filter company_id/role tambahan
-- karena RLS inquiries_read SENDIRI sudah menegakkan siapa yang boleh
-- melihat baris itu -- planner mengevaluasi RLS tabel inquiries saat
-- sub-query dijalankan (properti Postgres, bukan ditebak di sini).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_owner_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id     uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  from_owner_id  uuid REFERENCES public.profiles(id),
  to_owner_id    uuid REFERENCES public.profiles(id),
  reason         text,
  changed_by     uuid REFERENCES public.profiles(id),
  changed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_owner_history_inquiry_id
  ON public.inquiry_owner_history(inquiry_id);

ALTER TABLE public.inquiry_owner_history ENABLE ROW LEVEL SECURITY;

-- SELECT: siapa pun yang boleh membaca inquiry induknya -- pola PERSIS
-- inquiry_status_history_select (dikonfirmasi Vir, bukan tebakan).
CREATE POLICY inquiry_owner_history_select ON public.inquiry_owner_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.inquiries i WHERE i.id = inquiry_owner_history.inquiry_id)
  );

-- INSERT hanya lewat SECURITY DEFINER RPC (reassign_inquiry_owner) --
-- current_user berganti jadi owner fungsi (postgres) selama RPC berjalan,
-- jadi REVOKE di bawah ini tidak menghalangi RPC-nya sendiri.
REVOKE ALL ON public.inquiry_owner_history FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.inquiry_owner_history FROM authenticated;
GRANT SELECT ON public.inquiry_owner_history TO authenticated;

COMMENT ON TABLE public.inquiry_owner_history IS
  'Riwayat lengkap pergantian owner inquiry (banyak baris/inquiry), ditulis HANYA oleh reassign_inquiry_owner RPC (20261027000003). Pola sama account_pool_history (Lead Pool). Tampilan di tab Status History Detail Inquiry DITUNDA ke Putaran 11 (keputusan Mas 26 Okt 2026) -- tabel ini baru dibaca balik mulai putaran itu.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Tabel + RLS aktif:
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.inquiry_owner_history'::regclass;
--  -- HARAP true.
--
-- 2) Hak akses authenticated/anon:
-- SELECT grantee, privilege_type FROM information_schema.table_privileges
--  WHERE table_schema='public' AND table_name='inquiry_owner_history'
--    AND grantee IN ('authenticated','anon');
--  -- HARAP: authenticated hanya SELECT; anon nol baris.
--
-- 3) Policy terpasang:
-- SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--  WHERE polrelid = 'public.inquiry_owner_history'::regclass;
--
-- 4) Nol baris (tabel baru, belum ada pemanggil sampai 20261027000003 live):
-- SELECT count(*) FROM public.inquiry_owner_history; -- HARAP 0.
-- =============================================================================

-- =============================================================================
-- ROLLBACK:
--   BEGIN;
--   DROP TABLE IF EXISTS public.inquiry_owner_history;
--   COMMIT;
-- (aman -- tabel ini belum punya pemanggil sebelum 20261027000003 jalan)
-- =============================================================================
