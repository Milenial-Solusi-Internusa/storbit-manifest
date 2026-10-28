-- =============================================================================
-- Migration: 20261030000001_crm_inquiries_delivery_fields
-- Inquiry Management Putaran 14 (W-60) -- 4 kolom baru grup "Delivery" di
-- inquiries: Order Category, Requested Delivery Date, Estimated Shipping
-- Cost, Customer Reference. Dikutip dari
-- design-handoff/mockup/Inquiry Management.dc.html baris 93 (f.orderCat) /
-- 94 (f.reqDate) / 100 (f.shipCost) / 101 (f.custRef); grup Review wizard
-- "Delivery" baris 790.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun
-- production. Dijalankan Mas sendiri (psql / SQL Editor). TANPA DROP --
-- bisa dijalankan kapan pun sebelum 20261030000002 (yang menambahkan 4
-- kolom ini sebagai parameter baru create_inquiry_with_lanes).
--
-- Di mockup, kelima field grup "Delivery" (termasuk Delivery Destinations,
-- yang TIDAK dibuat di migrasi ini -- lihat catatan di bawah) ABSEN TOTAL
-- dari objek validasi wajib `req` (mockup baris 759) -- keempat kolom di
-- migrasi ini opsional sungguhan di mockup, bukan gap yang terlewat.
-- Migrasi ini TIDAK menambah CHECK "wajib diisi" apa pun.
--
-- order_category -- mockup baris 93, <select> 3 opsi tetap ("Regular" /
-- "Baking Tray" / "Trolley") + placeholder kosong, markup polos TANPA
-- sc-for/dropdown dinamis -- dimodelkan sebagai CHECK literal, pola PERSIS
-- customer_role / duties_and_taxes / pricing_basis (migrasi
-- 20261025000002_crm_inquiries_putaran4_columns.sql), BUKAN dropdown_options
-- baru. Keputusan Mas, Putaran 14 (jawaban Pertanyaan #5 rencana).
--
-- requested_delivery_date -- mockup baris 94, <input type="date">. date
-- polos, tanpa CHECK -- pola sama cargo_ready_date.
--
-- estimated_shipping_cost -- mockup baris 100, input berprefiks "Rp" +
-- inputMode="numeric", label "Optional". numeric polos, tanpa CHECK -- pola
-- sama monthly_volume_cbm/estimated_value. FE WAJIB mengirim nilai numerik
-- murni ke RPC (hasil src/lib/numberFormat.js readMoneyInput().value) --
-- format id-ID (titik ribuan, koma desimal, TD-285) murni urusan tampilan
-- layar, tidak pernah masuk ke kolom ini.
--
-- customer_reference -- mockup baris 101, text bebas, placeholder "PO or SP
-- number", label "Optional". text polos, tanpa CHECK -- pola sama goods_name.
--
-- Delivery Destinations (mockup baris 95 / grup Review baris 790, pemilihan
-- multi-DC) SENGAJA TIDAK dibuat di migrasi ini -- ditunda ke batch Sales
-- Order bersama Items step (instruksi eksplisit Putaran 14, bukan terlewat).
--
-- K1c -- trg_fn_guard_inquiries_protected_columns (migrasi
-- 20261026000001_inquiries_guard_protected_columns.sql, diperluas
-- 20261027000004/20261027000008) menjaga TEPAT 12 kolom: status, won_reason,
-- won_evidence_path, revert_won_reason, owner_id, assigned_by, assigned_at,
-- assign_reason, prospect_id, customer_id, contact_id, inquiry_type.
-- KEEMPAT KOLOM BARU DI MIGRASI INI BUKAN SALAH SATU DARI 12 ITU -- pola
-- sama komentar weight_kg/volume_cbm
-- (20261029000002_crm_inquiry_measurement_rounding.sql:25-26). Konsekuensi:
-- keempatnya tetap bisa ditulis langsung oleh role `authenticated` lewat
-- UPDATE biasa (tunduk RLS inquiries_update: company_id + manager-or-owner),
-- TANPA RPC baru -- inline-edit section "Delivery" di Detail Inquiry
-- (batch berikutnya, di luar Tahap 1 ini) bersandar pada fakta ini.
-- =============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS order_category text
    CONSTRAINT inquiries_order_category_check
    CHECK (order_category IS NULL OR order_category IN ('Regular', 'Baking Tray', 'Trolley'));

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS requested_delivery_date date;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS estimated_shipping_cost numeric;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS customer_reference text;

COMMENT ON COLUMN public.inquiries.order_category IS
  'Mockup Inquiry Management.dc.html baris 93 (f.orderCat), grup Review "Delivery" baris 790. Nullable, opsional (absen dari objek req mockup baris 759). CHECK literal 3 nilai (Regular/Baking Tray/Trolley) -- pola sama customer_role/duties_and_taxes/pricing_basis, BUKAN dropdown_options. Putaran 14 (W-60). BUKAN salah satu dari 12 kolom K1c (trg_fn_guard_inquiries_protected_columns) -- bisa ditulis UPDATE biasa, tidak butuh RPC baru.';

COMMENT ON COLUMN public.inquiries.requested_delivery_date IS
  'Mockup Inquiry Management.dc.html baris 94 (f.reqDate, <input type="date">), grup Review "Delivery" baris 790. Nullable, opsional, tanpa CHECK. Putaran 14 (W-60). BUKAN salah satu dari 12 kolom K1c.';

COMMENT ON COLUMN public.inquiries.estimated_shipping_cost IS
  'Mockup Inquiry Management.dc.html baris 100 (f.shipCost, label "Optional"), grup Review "Delivery" baris 790. Nullable, numeric polos -- FE wajib mengirim nilai numerik murni (src/lib/numberFormat.js, readMoneyInput().value), bukan string berformat id-ID. Putaran 14 (W-60). BUKAN salah satu dari 12 kolom K1c.';

COMMENT ON COLUMN public.inquiries.customer_reference IS
  'Mockup Inquiry Management.dc.html baris 101 (f.custRef, placeholder "PO or SP number", label "Optional"), grup Review "Delivery" baris 790. Nullable, text bebas, tanpa CHECK. Putaran 14 (W-60). BUKAN salah satu dari 12 kolom K1c.';

COMMIT;

-- =============================================================================
-- ROLLBACK (jalankan manual kalau migrasi ini perlu dibatalkan -- aman
-- kapan pun SEBELUM 20261030000002 dijalankan; sesudahnya, rollback RPC
-- dulu -- lihat catatan rollback di berkas itu):
--
--   ALTER TABLE public.inquiries DROP COLUMN IF EXISTS order_category;
--   ALTER TABLE public.inquiries DROP COLUMN IF EXISTS requested_delivery_date;
--   ALTER TABLE public.inquiries DROP COLUMN IF EXISTS estimated_shipping_cost;
--   ALTER TABLE public.inquiries DROP COLUMN IF EXISTS customer_reference;
-- =============================================================================
