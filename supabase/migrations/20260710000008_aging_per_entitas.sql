-- Aging pipeline: batasi ke entitas yang mengaktifkannya
--
-- Masalah: Edge Function aging-pipeline memakai service role key sehingga menembus
-- RLS dan melihat SELURUH entitas. Aturan aging (NEW 7 / CONTACTED 5 / QUALIFIED 5 /
-- PROPOSAL 3 / NEGOTIATION 14) adalah aturan sales MSI, bukan Storbit atau JCI.
-- Terbukti: dry_run 10 Jul memeriksa 472 lead, 3 di antaranya milik PT Stuja Orbit
-- Abadi.
--
-- Perbaikan: kolom companies.aging_enabled. Default false — mengaktifkan aging
-- harus keputusan sadar, bukan bawaan.
--
-- EF membaca daftar company_id dengan aging_enabled=true, lalu memfilter query
-- accounts dengan .in('company_id', companyIds).
--
-- Dijalankan manual 10 Jul 2026.

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS aging_enabled boolean NOT NULL DEFAULT false;

UPDATE companies
SET aging_enabled = true
WHERE id = '0e1840d8-e6fb-4190-bd09-88338e68b492';  -- PT Milenial Solusi Internusa

-- service_role tidak punya SELECT pada `companies`, sehingga EF gagal
-- "permission denied for table companies". Lihat TD-62: 47 dari 96 tabel
-- mengalami hal yang sama; hanya `companies` yang diperbaiki karena dibutuhkan.
GRANT SELECT ON public.companies TO service_role;

-- Verifikasi:
-- SELECT name, aging_enabled FROM companies ORDER BY name;
--   Harapan: JCI false, MSI true, SOA false.
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name='companies' AND grantee='service_role';
--   Harapan: SELECT muncul.
-- dry_run setelah perubahan: diperiksa 469 (turun dari 472), memenuhi 304.
