-- =============================================================================
-- Migration: 20261025000001_crm_inquiry_lanes_table
-- Inquiry Management Putaran 4 -- Tahap 4A (database only)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging. CC tidak
-- pernah menjalankan SQL ke database (aturan tetap).
-- Dependensi: tidak ada migrasi lain -- boleh dijalankan sendirian (hanya
-- membuat tabel baru + FK ke inquiries/locations yang sudah ada).
--
-- RINGKASAN
-- `inquiries` hari ini hanya punya SATU pasangan POL/POD (pol/pod/
-- pol_location_id/pod_location_id). Wizard Intake Form baru (PLAN Putaran 4,
-- §3/§D addendum) butuh N baris rute ("lane") per inquiry -- tabel ini
-- menyimpannya. Lane PERTAMA yang terkirim tetap disalin ke kolom
-- pol/pod/pol_location_id/pod_location_id di inquiries SENDIRI (dilakukan
-- oleh RPC create_inquiry_with_lanes, migrasi 20261025000005 -- BUKAN
-- trigger, lihat alasan di migrasi itu) -- supaya permukaan existing yang
-- membaca inquiries.pol/pod (Possible Duplicates, kolom Route di
-- InquiryListPage, RouteStrip) nol perubahan.
--
-- KOREKSI atas draf PLAN addendum (§D): kolom skalar "included"/"is_used"
-- yang sebelumnya diusulkan TIDAK dibuat. Checkbox "Use" mockup (Rate Sheet,
-- baris 108 Inquiry Management.dc.html) murni state klien -- baris yang
-- di-uncheck tidak pernah dikirim ke RPC sama sekali (meniru filter `LN`
-- mockup, baris 794-801), jadi tidak pernah ada baris inquiry_lanes untuknya.
-- Nol kolom untuk menyimpan sesuatu yang memang tidak pernah tersimpan.
--
-- PILIHAN HAK AKSES -- KOREKSI EKSPLISIT Den/Vir atas draf PLAN:
-- HANYA policy SELECT + GRANT SELECT ke authenticated. TIDAK ADA policy atau
-- GRANT INSERT/UPDATE/DELETE untuk authenticated -- penulisan lane HANYA
-- lewat RPC SECURITY DEFINER (create_inquiry_with_lanes). Alasan: lane
-- pertama disalin ke kolom pol/pod di inquiries; penulisan langsung dari
-- klien ke inquiry_lanes akan membuat kedua sisi bisa tidak sinkron tanpa
-- RPC yang menjaga keduanya sekaligus dalam satu transaksi. Kalau nanti ada
-- jalur EDIT lane, itu dibuka lewat PLAN tersendiri (kandidat RPC
-- update_inquiry_lanes atau serupa) -- BUKAN dengan membuka INSERT/UPDATE
-- langsung ke tabel ini.
--
-- POLA RLS/GRANT -- bentuk EXISTS-ke-induk ditranskripsi dari quotation_items
-- (child table satu-ke-banyak existing; lihat skema di
-- schema_snapshot.sql:9399-9418 + 19989-20026), DIKURANGI ketiga policy
-- insert/update/delete-nya -- quotation_items punya keempatnya untuk
-- authenticated karena memang diedit langsung dari form Quotation;
-- inquiry_lanes TIDAK, sesuai keputusan di atas.
--
-- ⚠️ KONDISI DI DALAM EXISTS BUKAN quotation_items_read (yang cuma company-
-- scope) -- itu AKAN lebih longgar dari inquiries_read sungguhan dan
-- membiarkan Sales B (company sama, bukan owner/manager/procurement-ber-PRF)
-- membaca lane milik inquiry Sales A yang inquiries_read SENDIRI menolaknya.
-- Kondisi di bawah DISALIN VERBATIM dari inquiries_read LIVE
-- (20260830000003_inquiries_rls_owner_based.sql:91-106): is_super_admin()
-- OR (company_id IN get_user_company_ids() AND (is_manager_or_above() OR
-- owner_id=auth.uid() OR (is_procurement_functional() AND EXISTS prf ber-
-- inquiry_id ini))) -- "otomatis ikut RLS inquiries_read" (koreksi Den/Vir
-- poin 1) berarti REPLIKA PERSIS kondisi itu, bukan sekadar company-scope.
-- ⚠️ RISIKO DRIFT YANG DITERIMA (pola sama reassign_inquiry_owner): kalau
-- inquiries_read berubah lagi di masa depan, policy ini TIDAK otomatis ikut
-- -- harus disunting manual bersamaan.
--
-- Index pada inquiry_id DITAMBAHKAN eksplisit -- quotation_items SENDIRI
-- lupa index ini pada quotation_id, tidak diwarisi di sini.
-- =============================================================================

BEGIN;

CREATE TABLE public.inquiry_lanes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id       uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  sort_order       integer NOT NULL DEFAULT 0,
  pol_location_id  uuid REFERENCES public.locations(id),
  pod_location_id  uuid REFERENCES public.locations(id),
  via_location_id  uuid REFERENCES public.locations(id),
  pol              text,   -- snapshot teks, pola sama inquiries.pol/pod
  pod              text,
  via              text,
  mode             text,   -- 'Sea LCL' | 'Sea FCL' | 'Air' -- dropdown_options list_key='lane_mode'
  load_unit        text,   -- 'CBM' | 'Container' | 'KG' | 'Ton' -- dropdown_options list_key='lane_unit'
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inquiry_lanes_inquiry_id_idx ON public.inquiry_lanes (inquiry_id);

COMMENT ON TABLE public.inquiry_lanes IS
  'Baris rute (lane) per inquiry -- Putaran 4. Lane pertama yang terkirim RPC disalin ke inquiries.pol/pod/pol_location_id/pod_location_id. Penulisan HANYA lewat RPC create_inquiry_with_lanes -- tidak ada policy/GRANT INSERT/UPDATE/DELETE untuk authenticated.';
COMMENT ON COLUMN public.inquiry_lanes.mode IS 'Nilai dari dropdown_options list_key=''lane_mode'' (migrasi 20261025000003).';
COMMENT ON COLUMN public.inquiry_lanes.load_unit IS 'Nilai dari dropdown_options list_key=''lane_unit'' (migrasi 20261025000003).';

ALTER TABLE public.inquiry_lanes ENABLE ROW LEVEL SECURITY;

CREATE POLICY inquiry_lanes_read ON public.inquiry_lanes
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.inquiries i
    WHERE i.id = inquiry_lanes.inquiry_id
      AND (
        public.is_super_admin()
        OR (
          i.company_id IN (SELECT public.get_user_company_ids())
          AND (
            public.is_manager_or_above()
            OR i.owner_id = auth.uid()
            OR (
              public.is_procurement_functional()
              AND EXISTS (
                SELECT 1 FROM public.prf p
                WHERE p.inquiry_id = i.id
                  AND p.company_id = i.company_id
                  AND p.deleted_at IS NULL
              )
            )
          )
        )
      )
  ));

-- Nol policy INSERT/UPDATE/DELETE untuk authenticated (keputusan di atas).
-- RPC create_inquiry_with_lanes (SECURITY DEFINER) menulis lewat jalur
-- pemilik tabel, melewati RLS -- itu sudah cukup dan satu-satunya jalur sah.

REVOKE ALL ON TABLE public.inquiry_lanes FROM PUBLIC;
REVOKE ALL ON TABLE public.inquiry_lanes FROM anon;
GRANT SELECT ON TABLE public.inquiry_lanes TO authenticated;
GRANT ALL ON TABLE public.inquiry_lanes TO service_role;

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Tabel + index ada:
-- SELECT count(*) FROM information_schema.tables WHERE table_name = 'inquiry_lanes'; -- harus 1
-- SELECT indexname FROM pg_indexes WHERE tablename = 'inquiry_lanes'; -- inquiry_lanes_pkey, inquiry_lanes_inquiry_id_idx
--
-- 2) RLS aktif, SATU policy saja:
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.inquiry_lanes'::regclass; -- 1 baris, polcmd='r' (SELECT)
--
-- 3) Grant authenticated HANYA SELECT:
-- SELECT grantee, privilege_type FROM information_schema.table_privileges
--  WHERE table_name = 'inquiry_lanes' AND grantee = 'authenticated'; -- harus 1 baris, SELECT saja
--
-- Rollback (sebelum ada baris data):
--   DROP TABLE public.inquiry_lanes;
-- =============================================================================
