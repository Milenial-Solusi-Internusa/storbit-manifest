-- =============================================================================
-- Migration: 20261025000002_crm_inquiries_putaran4_columns
-- Inquiry Management Putaran 4 -- Tahap 4A (database only)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging.
-- Dependensi: tidak ada migrasi lain.
--
-- RINGKASAN
-- Kolom baru di inquiries untuk wizard Intake Form Putaran 4 (PLAN v1 §1 +
-- addendum §C). Kutipan baris mockup di setiap kolom mengacu
-- design-handoff/mockup/Inquiry Management.dc.html.
--
-- PRINSIP KEAMANAN DATA LAMA (berlaku SELURUH kolom di bawah): setiap kolom
-- lahir dengan DEFAULT yang membuat baris LAMA otomatis valid tanpa backfill
-- manual -- ALTER TABLE ... ADD COLUMN ... DEFAULT x di Postgres mengisi
-- default untuk baris existing sebagai operasi metadata (tanpa rewrite
-- tabel, PG 11+). InquiryFormPage.jsx (edit lama) memakai .update({...hanya
-- kolom yang ia tahu...}) Supabase -- partial update, TIDAK PERNAH
-- menyentuh kolom yang tidak ia kenal -- jadi kolom baru ini tidak bisa
-- "rusak" lewat jalur edit lama. Konsekuensinya: CHECK yang mengikat suatu
-- kolom pada nilai kolom LAIN (CHECK C.7/C.12 di bawah) aman ditambahkan
-- sebagai constraint KERAS, karena sisi kiri kondisinya (inquiry_type/
-- undername_import) hanya bisa diubah jadi TRUE/'Rate Sheet Request' oleh
-- RPC create_inquiry_with_lanes (migrasi 20261025000005) yang SELALU
-- memvalidasi/menormalisasi pasangannya dulu -- baris lama tidak pernah
-- memenuhi sisi kiri kondisi itu, jadi CHECK-nya vacuously benar untuk 100%
-- data lama.
--
-- KOREKSI atas draf PLAN addendum (§C.4/C.7, koreksi Den/Vir poin 2):
-- importer_of_record TIDAK memakai CHECK dua nama PT literal. Kolom tetap
-- `text NULL` tanpa CHECK nilai -- validasinya pindah ke dropdown_options
-- list_key='importer_of_record' (migrasi 20261025000004) + RPC
-- create_inquiry_with_lanes memvalidasi keanggotaannya di sana (dropdown
-- aktif, bukan literal hardcode dua kali). customer_role/duties_and_taxes/
-- pricing_basis TETAP CHECK literal (tiga, dipertahankan).
--
-- customer_role SENGAJA TANPA CHECK "wajib kalau svc != General Trading" --
-- baris lama FF/Customs Clearance/Door-to-Door/Trucking SEMUANYA NULL hari
-- ini (kolom baru, bukan backfill retroaktif); CHECK keras semacam itu akan
-- gagal divalidasi terhadap data existing saat ALTER TABLE ADD CONSTRAINT
-- dijalankan. Kewajiban "diisi untuk inquiry BARU" ditegakkan RPC saja
-- (koreksi Den/Vir poin 3e).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Customer Role -- mockup baris 63 (crShow), 759 (req.role), 1113-1114
-- (tombol cr.sh/co/tp), 1136 (crShow: sKey==='svc' && !!f.svc &&
-- f.svc!=='General Trading' -- berlaku utk Single Shipment DAN Rate Sheet,
-- tidak dikecualikan isRSf).
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN customer_role text
    CHECK (customer_role IS NULL OR customer_role IN ('Shipper', 'Consignee', 'Third Party'));

COMMENT ON COLUMN public.inquiries.customer_role IS
  'Mockup Inquiry Management.dc.html baris 63/1113-1114. Nullable, TANPA CHECK "wajib kalau svc != General Trading" -- lihat header migrasi. Wajib-untuk-inquiry-baru ditegakkan RPC create_inquiry_with_lanes, bukan DB.';

-- ---------------------------------------------------------------------------
-- Inquiry Type -- mockup baris 51 (f.itype toggle), 557 (blankF.itype=
-- 'Single Shipment'), 740 (isRSf = f.itype==='Rate Sheet Request').
-- DEFAULT 'Single Shipment' -- SELURUH baris lama otomatis dapat nilai ini,
-- tidak pernah 'Rate Sheet Request' (hanya RPC baru yang bisa menulis itu).
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN inquiry_type text NOT NULL DEFAULT 'Single Shipment'
    CHECK (inquiry_type IN ('Single Shipment', 'Rate Sheet Request'));

COMMENT ON COLUMN public.inquiries.inquiry_type IS
  'Mockup baris 51/557/740. DEFAULT ''Single Shipment'' -- seluruh baris lama + seluruh baris dari InquiryFormPage.jsx (form lama, tidak tahu kolom ini). Hanya create_inquiry_with_lanes yang bisa menulis ''Rate Sheet Request''.';

-- ---------------------------------------------------------------------------
-- Klaster Undername -- mockup baris 63/70 (f.under, data-rule="8"), 65/72
-- (f.ior options -- lihat migrasi 20261025000004 utk dropdown-nya), 66/69/73
-- (f.duties -- dirender DUA KALI di mockup untuk Door-to-Door, binding
-- identik, bug prototipe; Putaran 4 merender SEKALI di dalam panel bersyarat
-- Undername), 67/74 (f.docsOk, asterisk wajib TAPI ABSEN dari objek req
-- mockup baris 759 -- gap mockup).
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN undername_import boolean NOT NULL DEFAULT false;

ALTER TABLE public.inquiries
  ADD COLUMN importer_of_record text; -- nullable, nilai divalidasi RPC terhadap dropdown_options (lihat header migrasi)

ALTER TABLE public.inquiries
  ADD COLUMN duties_and_taxes text
    CHECK (duties_and_taxes IS NULL OR duties_and_taxes IN ('Included in price', 'Billed separately as per receipt'));

ALTER TABLE public.inquiries
  ADD COLUMN supporting_docs_received boolean NOT NULL DEFAULT false;

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_undername_docs_check
  CHECK (
    undername_import = false
    OR (importer_of_record IS NOT NULL AND duties_and_taxes IS NOT NULL AND supporting_docs_received = true)
  );

COMMENT ON COLUMN public.inquiries.undername_import IS 'Mockup baris 63/70 (f.under). DEFAULT false -- seluruh baris lama.';
COMMENT ON COLUMN public.inquiries.importer_of_record IS 'Mockup baris 65/72 (f.ior). Nullable, text -- nilainya divalidasi RPC terhadap dropdown_options list_key=''importer_of_record'' (migrasi 20261025000004), BUKAN CHECK literal (koreksi Den/Vir poin 2).';
COMMENT ON COLUMN public.inquiries.duties_and_taxes IS 'Mockup baris 66/69/73 (f.duties, dirender dua kali di mockup untuk Door-to-Door -- Putaran 4 merender sekali, di dalam panel Undername saja).';
COMMENT ON COLUMN public.inquiries.supporting_docs_received IS 'Mockup baris 67/74 (f.docsOk). Asterisk wajib di mockup TAPI absen dari objek req mockup (baris 759) -- CONSTRAINT inquiries_undername_docs_check menegakkan "wajib kalau undername_import=true" di DB, koreksi sadar atas gap validasi mockup.';
COMMENT ON CONSTRAINT inquiries_undername_docs_check ON public.inquiries IS
  'Kalau undername_import=true, importer_of_record+duties_and_taxes+supporting_docs_received WAJIB terisi/true. Aman untuk data lama: undername_import DEFAULT false untuk seluruh baris existing (lihat header migrasi).';

-- ---------------------------------------------------------------------------
-- Pricing Basis -- mockup baris 68, 1139 (pbOpts). Khusus Door-to-Door
-- (stepCustoms: sKey==='customs', baris 1136) -- TANPA asterisk, TANPA
-- entri req (baris 759) di mockup -- opsional sungguhan, bukan gap. Nilai
-- untuk service_type lain SELALU NULL (ditegakkan RPC, bukan CHECK --
-- korelasi dengan service_type sengaja tidak dikunci DB per prinsip minimal
-- constraint yang perlu).
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN pricing_basis text
    CHECK (pricing_basis IS NULL OR pricing_basis IN ('Itemized charges', 'All in per CBM', 'All in per KG'));

COMMENT ON COLUMN public.inquiries.pricing_basis IS
  'Mockup baris 68/1139. Khusus Door-to-Door (stepCustoms). Nullable, opsional sungguhan di mockup (tanpa asterisk/req). Dipaksa NULL untuk service_type lain oleh RPC create_inquiry_with_lanes, bukan CHECK DB.';

-- ---------------------------------------------------------------------------
-- Rate Sheet -- mockup baris 120 (f.vFrom), 121 (f.vTo), 122 (f.volM),
-- req.rsVal/req.rsVol baris 759. Estimated Value Rate Sheet SENGAJA memakai
-- kolom estimated_value yang SUDAH ADA (manual, auto-calc Sell Rate Card
-- ditunda -- Keputusan Den/Vir addendum §B.2) -- nol kolom baru untuk itu.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN validity_from date;

ALTER TABLE public.inquiries
  ADD COLUMN validity_to date;

ALTER TABLE public.inquiries
  ADD COLUMN monthly_volume_cbm numeric;

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_rate_sheet_fields_check
  CHECK (
    inquiry_type <> 'Rate Sheet Request'
    OR (
      validity_from IS NOT NULL AND validity_to IS NOT NULL AND validity_to >= validity_from
      AND monthly_volume_cbm IS NOT NULL AND monthly_volume_cbm > 0
    )
  );

COMMENT ON COLUMN public.inquiries.validity_from IS 'Mockup baris 120 (f.vFrom). Wajib hanya kalau inquiry_type=''Rate Sheet Request'' -- lihat inquiries_rate_sheet_fields_check.';
COMMENT ON COLUMN public.inquiries.validity_to IS 'Mockup baris 121 (f.vTo).';
COMMENT ON COLUMN public.inquiries.monthly_volume_cbm IS 'Mockup baris 122 (f.volM).';
COMMENT ON CONSTRAINT inquiries_rate_sheet_fields_check ON public.inquiries IS
  'Kalau inquiry_type=''Rate Sheet Request'', validity_from/validity_to/monthly_volume_cbm WAJIB terisi+valid. Aman untuk data lama: inquiry_type DEFAULT ''Single Shipment'' untuk seluruh baris existing (lihat header migrasi).';

-- ---------------------------------------------------------------------------
-- Scalar sederhana -- mockup baris 136 (f.nCont, req.nCont baris 759), 133
-- (f.ready). Khusus Single Shipment -- dipaksa NULL untuk Rate Sheet oleh
-- RPC (termsShow=false untuk isRSf, mockup baris 948 -- field ini tidak
-- pernah ditanyakan sama sekali di mode Rate Sheet).
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiries
  ADD COLUMN n_containers integer;

ALTER TABLE public.inquiries
  ADD COLUMN cargo_ready_date date;

COMMENT ON COLUMN public.inquiries.n_containers IS 'Mockup baris 136 (f.nCont). Hanya Single Shipment -- dipaksa NULL untuk Rate Sheet oleh RPC create_inquiry_with_lanes.';
COMMENT ON COLUMN public.inquiries.cargo_ready_date IS 'Mockup baris 133 (f.ready). Hanya Single Shipment -- dipaksa NULL untuk Rate Sheet oleh RPC create_inquiry_with_lanes.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Seluruh 12 kolom ada:
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_name = 'inquiries' AND column_name IN (
--    'customer_role','inquiry_type','undername_import','importer_of_record',
--    'duties_and_taxes','supporting_docs_received','pricing_basis',
--    'validity_from','validity_to','monthly_volume_cbm','n_containers','cargo_ready_date'
--  ) ORDER BY column_name; -- harus 12 baris
--
-- 2) Seluruh baris lama otomatis valid (nol NULL yang salah, nol CHECK gagal):
-- SELECT count(*) FROM public.inquiries WHERE inquiry_type IS NULL; -- harus 0
-- SELECT count(*) FROM public.inquiries WHERE undername_import IS NULL; -- harus 0
-- SELECT count(*) FROM public.inquiries WHERE supporting_docs_received IS NULL; -- harus 0
--
-- 3) CHECK constraint ada dan bernama benar:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.inquiries'::regclass
--  AND conname IN ('inquiries_undername_docs_check','inquiries_rate_sheet_fields_check'); -- 2 baris
--
-- Rollback (sebelum ada RPC/FE yang bergantung padanya):
--   ALTER TABLE public.inquiries
--     DROP CONSTRAINT IF EXISTS inquiries_rate_sheet_fields_check,
--     DROP CONSTRAINT IF EXISTS inquiries_undername_docs_check,
--     DROP COLUMN IF EXISTS customer_role,
--     DROP COLUMN IF EXISTS inquiry_type,
--     DROP COLUMN IF EXISTS undername_import,
--     DROP COLUMN IF EXISTS importer_of_record,
--     DROP COLUMN IF EXISTS duties_and_taxes,
--     DROP COLUMN IF EXISTS supporting_docs_received,
--     DROP COLUMN IF EXISTS pricing_basis,
--     DROP COLUMN IF EXISTS validity_from,
--     DROP COLUMN IF EXISTS validity_to,
--     DROP COLUMN IF EXISTS monthly_volume_cbm,
--     DROP COLUMN IF EXISTS n_containers,
--     DROP COLUMN IF EXISTS cargo_ready_date;
-- =============================================================================
