-- =============================================================================
-- Migration: 20261025000003_crm_lane_mode_unit_dropdown_seed
-- Inquiry Management Putaran 4 -- Tahap 4A (database only)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging.
-- Dependensi: tidak ada migrasi lain (dropdown_options sudah ada; list_key
-- baru TIDAK butuh perubahan skema -- nol CHECK constraint pada list_key).
--
-- RINGKASAN
-- Dua list_key dropdown_options BARU untuk kolom inquiry_lanes.mode/
-- load_unit (migrasi 20261025000001) -- mockup Inquiry Management.dc.html
-- baris 112-113 (<select> statis Sea LCL/Sea FCL/Air, CBM/Container/KG/Ton).
-- Per aturan CLAUDE.md ("list BARU lewat dropdown_options, bukan array JS
-- baru"), bukan ditulis sebagai konstanta FE hardcode.
--
-- Idempotensi: ON CONFLICT (list_key, value) WHERE company_id IS NULL --
-- dropdown_options punya UNIQUE INDEX PARSIAL dropdown_options_global_unique
-- ON (list_key, value) WHERE company_id IS NULL (bukan constraint polos) --
-- predikat WHERE WAJIB disebut persis supaya Postgres bisa mencocokkan ke
-- index parsial itu (pola 20261011000002_crm_lead_master_data_requests.sql).
-- Global (company_id NULL) -- bukan per-entitas.
-- =============================================================================

BEGIN;

-- Seed lane_mode -- 3 nilai, mockup baris 112.
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'lane_mode', 'Sea LCL', 'Sea LCL', 1, NULL),
  ('crm', 'lane_mode', 'Sea FCL', 'Sea FCL', 2, NULL),
  ('crm', 'lane_mode', 'Air',     'Air',     3, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

-- Seed lane_unit -- 4 nilai, mockup baris 113.
INSERT INTO public.dropdown_options (group_key, list_key, label, value, sort_order, company_id) VALUES
  ('crm', 'lane_unit', 'CBM',       'CBM',       1, NULL),
  ('crm', 'lane_unit', 'Container', 'Container', 2, NULL),
  ('crm', 'lane_unit', 'KG',        'KG',        3, NULL),
  ('crm', 'lane_unit', 'Ton',       'Ton',       4, NULL)
ON CONFLICT (list_key, value) WHERE company_id IS NULL DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT list_key, value, sort_order FROM public.dropdown_options
--  WHERE list_key IN ('lane_mode','lane_unit') AND company_id IS NULL
--  ORDER BY list_key, sort_order; -- 7 baris (3 + 4)
--
-- Rollback (sebelum ada baris inquiry_lanes yang mereferensikannya):
--   DELETE FROM public.dropdown_options WHERE list_key IN ('lane_mode','lane_unit') AND company_id IS NULL;
-- =============================================================================
