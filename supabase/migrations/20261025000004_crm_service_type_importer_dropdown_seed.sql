-- =============================================================================
-- Migration: 20261025000004_crm_service_type_importer_dropdown_seed
-- Inquiry Management Putaran 4 -- Tahap 4A (database only)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging DAN
-- produksi (lihat alasan dua-environment di bawah -- berbeda dari migrasi
-- 20261025000003 yang murni staging-dulu).
-- Dependensi: tidak ada migrasi lain.
--
-- RINGKASAN -- list_key='service_type'
-- Fakta Vir (PLAN addendum §A poin 3-4): staging hari ini NOL baris
-- dropdown_options utk list_key='service_type' (useDropdownOptions jatuh ke
-- fallback 3 nilai FE) sementara PRODUKSI punya 5 baris (freight_forwarding,
-- customs, trading, trucking, warehousing -- termasuk 'warehousing' yang
-- TIDAK PERNAH muncul di mockup Inquiry Management.dc.html sebagai kartu
-- Service Type, lihat PLAN addendum §B.1 -- Warehousing hanya tag di
-- additional_services, bukan Service Type). Door-to-Door ('door_to_door',
-- mockup baris 60, kartu og.svc) BELUM ADA di kedua environment.
--
-- Seed ini menulis KEENAM nilai (5 lama + door_to_door) ke KEDUA environment
-- dengan DAFTAR YANG SAMA, idempoten per nilai (ON CONFLICT ... DO NOTHING
-- per baris -- bukan per statement, supaya baris yang SUDAH ada di produksi
-- tidak tersentuh sama sekali [label/sort_order lama produksi DIPERTAHANKAN
-- apa adanya, hanya baris yang belum ada yang masuk], sementara staging yang
-- kosong mendapat KEENAM baris sekaligus). Hasil: staging 0->6 baris;
-- produksi 5->6 baris (hanya door_to_door yang baru). Begitu migrasi ini
-- jalan di staging, useDropdownOptions('service_type', FALLBACK) di staging
-- berhenti memakai fallback FE (ada baris DB) -- SAMA perilakunya dengan
-- produksi sejak itu, bukan lagi dua environment yang diam-diam berbeda.
--
-- General Trading ('trading') TETAP diseed di sini (nilainya tetap valid
-- untuk InquiryFormPage.jsx lama) TAPI disembunyikan dari KARTU wizard baru
-- di FE Tahap 4B/4C (keputusan Den/Vir addendum §B.1) -- itu kode wizard
-- yang belum ada di Tahap 4A ini, bukan sesuatu yang disunting di sini.
--
-- RINGKASAN -- list_key='importer_of_record'
-- Koreksi Den/Vir poin 2 atas draf PLAN addendum: kolom
-- inquiries.importer_of_record (migrasi 20261025000002) TIDAK memakai CHECK
-- literal dua nama PT -- nilainya divalidasi RPC create_inquiry_with_lanes
-- (migrasi 20261025000005) terhadap dropdown_options aktif list_key ini.
-- Dua nilai dari mockup baris 65/72 (f.ior <select> options), global.
-- =============================================================================

BEGIN;

-- Seed service_type -- 6 nilai (5 produksi existing + door_to_door baru).
-- Idempoten PER BARIS -- baris produksi yang sudah ada (freight_forwarding/
-- customs/trading/trucking/warehousing) TIDAK tersentuh (label/sort_order
-- lama mereka dipertahankan); hanya door_to_door yang baru masuk.
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'service_type', 'Freight Forwarding',  'freight_forwarding', 1, NULL),
  ('crm', 'service_type', 'Customs Clearance',   'customs',            2, NULL),
  ('crm', 'service_type', 'Door to Door',        'door_to_door',       3, NULL),
  ('crm', 'service_type', 'Trucking',            'trucking',           4, NULL),
  ('crm', 'service_type', 'General Trading',     'trading',            5, NULL),
  ('crm', 'service_type', 'Warehousing',         'warehousing',        6, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

-- Seed importer_of_record -- 2 nilai, mockup baris 65/72.
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'importer_of_record', 'PT Mitra Niaga Sejahtera', 'PT Mitra Niaga Sejahtera', 1, NULL),
  ('crm', 'importer_of_record', 'PT Sentra Impor Nusantara', 'PT Sentra Impor Nusantara', 2, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (di KEDUA environment)
-- =============================================================================
-- SELECT list_key, value, label, sort_order FROM public.dropdown_options
--  WHERE list_key = 'service_type' AND company_id IS NULL ORDER BY sort_order;
--  -- staging: 6 baris. produksi: 6 baris (5 lama + door_to_door, cek label/
--  -- sort_order 5 lama TIDAK berubah dari sebelum migrasi -- bandingkan dulu
--  -- dengan SELECT yang sama SEBELUM menjalankan migrasi ini).
--
-- SELECT list_key, value FROM public.dropdown_options
--  WHERE list_key = 'importer_of_record' AND company_id IS NULL ORDER BY sort_order;
--  -- 2 baris, kedua environment.
--
-- Rollback (sebelum ada inquiry yang mereferensikan door_to_door/importer_of_record):
--   DELETE FROM public.dropdown_options WHERE list_key = 'service_type' AND value = 'door_to_door' AND company_id IS NULL;
--   DELETE FROM public.dropdown_options WHERE list_key = 'importer_of_record' AND company_id IS NULL;
--   -- JANGAN hapus 5 baris service_type lama (freight_forwarding/customs/
--   -- trading/trucking/warehousing) -- itu data produksi existing, bukan
--   -- bagian dari migrasi ini.
-- =============================================================================
