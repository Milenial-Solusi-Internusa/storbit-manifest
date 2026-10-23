-- =============================================================================
-- Migration: 20261025000005_crm_create_inquiry_with_lanes_rpc
-- Inquiry Management Putaran 4 -- Tahap 4A (database only)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging.
-- Dependensi: 20261025000001 (inquiry_lanes) · 20261025000002 (kolom baru
-- inquiries) · 20261025000003 (dropdown lane_mode/lane_unit, DIBACA ulang
-- oleh FE, BUKAN oleh RPC ini) · 20261025000004 (dropdown service_type DAN
-- importer_of_record -- importer_of_record DIBACA LANGSUNG oleh RPC ini
-- utk validasi). WAJIB urutan ini -- fungsi di bawah merujuk kolom/tabel
-- yang keempat migrasi itu buat.
--
-- RINGKASAN
-- RPC atomik TUNGGAL utk membuat inquiry + N baris lane dalam satu
-- transaksi -- menggantikan dua .insert() client berurutan yang bisa gagal
-- separuh jalan (lihat PLAN v1 §4 utk alasan memilih RPC). Dipanggil wizard
-- Intake Form baru (Tahap 4B/4C, BELUM dikerjakan -- 4A murni database).
-- NOL FE disentuh migrasi ini.
--
-- WHITELIST KOLOM (syarat F.4 PLAN addendum, DIPERKUAT eksplisit per koreksi
-- Den/Vir poin 4) -- signature fungsi ini TIDAK PUNYA parameter untuk:
-- inquiry_no (trigger assign_inquiry_no menimpa apa pun -- migrasi
-- 20261022000001), status (selalu 'OPEN', hardcode di INSERT di bawah),
-- created_by (selalu auth.uid()), duplicate_of_id (kolom lock terpisah,
-- hanya diisi close_inquiry_as_duplicate -- migrasi 20261022000002),
-- customer_id (selalu NULL -- paritas InquiryFormPage.jsx, inquiry baru
-- SELALU dari prospect, bukan customer langsung). Keenamnya TIDAK BISA
-- dikirim client lewat RPC ini sama sekali -- bukan "diterima lalu
-- diabaikan", benar-benar tidak ada parameternya.
--
-- Parameter LAIN yang diterima = seluruh kolom yang diisi InquiryFormPage.jsx
-- (form lama, create path -- diverifikasi payload-nya baris 424-490) PLUS
-- direction (BARU -- form lama hari ini TIDAK mengisinya sama sekali,
-- hanya InquiryClassificationPage.jsx yang menulisnya pasca-create) PLUS
-- duplicate_warning_reason (sudah ada di form lama) PLUS seluruh 12 kolom
-- baru §C PLAN addendum (migrasi 20261025000002) PLUS p_owner_id + p_lanes.
--
-- NORMALISASI SERVER-SIDE (koreksi Den/Vir poin 3) -- dijalankan SEBELUM
-- INSERT, supaya CHECK constraint inquiries_undername_docs_check/
-- inquiries_rate_sheet_fields_check (migrasi 20261025000002) SELALU
-- terpenuhi dari jalur ini, dan supaya klien yang mengirim kombinasi
-- nyeleneh (mis. undername_import=true utk Freight Forwarding) tidak bisa
-- memaksakannya:
--   (a) direction<>'Import' ATAU service_type di luar {customs,door_to_door}
--       -> paksa undername_import=false, importer_of_record=NULL,
--       duties_and_taxes=NULL, supporting_docs_received=false.
--   (b) service_type<>'door_to_door' -> paksa pricing_basis=NULL.
--   (c) inquiry_type='Rate Sheet Request' -> paksa NULL/kosong utk
--       incoterms/container_types/n_containers/cargo_ready_date/
--       pickup_address/delivery_address (mockup termsShow=false, Inquiry
--       Management.dc.html baris 948 -- field-field ini tidak pernah
--       ditanyakan di mode Rate Sheet).
--   (d) n_containers -- tercakup (c), hanya utk Single Shipment.
--   (e) customer_role wajib utk inquiry baru KECUALI General Trading
--       ('trading') -- ditegakkan di sini (RAISE EXCEPTION), BUKAN CHECK DB
--       (lihat migrasi 20261025000002, komentar customer_role).
--
-- OWNER (syarat F.2/F.3 PLAN addendum) -- replika pola RPC
-- reassign_inquiry_owner (migrasi 20261024000004): non-manager SELALU
-- dipaksa owner_id=auth.uid() apa pun p_owner_id yang dikirim; manager-ke-
-- atas di entitas ini (is_manager_or_above_in) boleh kirim p_owner_id NULL
-- (Unassigned) atau kandidat OPERATIONAL_ROSTER_ROLES aktif di entitas ini
-- -- daftar role DITRANSKRIPSI LITERAL identik reassign_inquiry_owner
-- (src/modules/crm/salesRoster.js:29 + src/lib/roles.js:58-61) -- RISIKO
-- DRIFT YANG SAMA diterima, lihat komentar di migrasi itu.
--
-- IMPORTER OF RECORD -- divalidasi terhadap dropdown_options aktif
-- list_key='importer_of_record' (migrasi 20261025000004), BUKAN CHECK
-- literal (koreksi Den/Vir poin 2 -- lihat migrasi 20261025000002).
--
-- LANE -- p_lanes jsonb array, SETIAP elemen HANYA yang akan benar-benar
-- tersimpan (FE memfilter baris "Use" yang di-uncheck SEBELUM memanggil RPC
-- ini -- lihat PLAN addendum §D; RPC TIDAK menerima baris yang sudah
-- di-uncheck sama sekali). Minimal 1 elemen; setiap elemen wajib
-- pol_location_id DAN pod_location_id. sort_order = urutan array (indeks
-- 0-based). Lane PERTAMA (indeks 0) disalin ke inquiries.pol/pod/
-- pol_location_id/pod_location_id DI DALAM TRANSAKSI YANG SAMA -- bukan
-- trigger (lihat alasan di migrasi 20261025000001: satu-satunya jalur tulis
-- adalah RPC ini, jadi konsistensi dijamin di titik penulisan, nol
-- kompleksitas sinkronisasi dua-arah yang tak diperlukan).
--
-- NOL EXCEPTION WHEN OTHERS -- error apa pun (termasuk dari trigger
-- assign_inquiry_no/trg_block_inquiry_for_pooled_account, atau dari CHECK
-- constraint) menjalar apa adanya (pola reassign_inquiry_owner).
--
-- EMPAT PERBAIKAN (review Vir, staging -- migrasi #1-4 sudah dijalankan dan
-- lolos, #5 ini BELUM karena dua bug di bawah):
--
-- (1) LOGIKA NULL PADA NORMALISASI UNDERNAME -- bug nyata, SILENT WRONG DATA
-- (bukan sekadar error tak ramah): `IF NOT (p_direction = 'Import' AND
-- p_service_type IN ('customs','door_to_door')) THEN` -- kalau p_direction
-- NULL, `NULL AND true` = NULL, `NOT NULL` = NULL, dan `IF NULL THEN` TIDAK
-- dieksekusi (bukan exception, bukan true) -- normalisasi (a) DILEWATI,
-- sehingga inquiry dgn Direction belum terisi bisa tersimpan dgn
-- undername_import=true + IOR/duties/docs terisi lengkap (CHECK
-- inquiries_undername_docs_check tetap lolos, karena datanya KONSISTEN
-- SATU SAMA LAIN -- cuma salah secara bisnis, Undername semestinya nol
-- kalau Direction belum Import). Diganti `p_direction IS DISTINCT FROM
-- 'Import' OR p_service_type NOT IN ('customs','door_to_door')` -- kedua
-- operand sudah dijamin bukan NULL di titik ini (p_service_type divalidasi
-- NOT NULL/kosong di atas; IS DISTINCT FROM sendiri tak pernah NULL).
--
-- Kondisi LAIN yang diperiksa dgn pola sama (NOT(...)/perbandingan yg bisa
-- NULL) -- hasil lengkap di laporan chat, ringkasannya: company_id NULL
-- (celah nyata, DIPERBAIKI -- lihat guard baru di langkah (1) badan fungsi,
-- FE tak pernah mengirim NULL tapi pemanggil RPC langsung bisa) · booleans
-- DEFAULT false (p_undername_import/p_supporting_docs_received) yang
-- dikirim NULL eksplisit -- TIDAK diperbaiki (COALESCE) karena kolom
-- tujuannya NOT NULL di DB (migrasi 20261025000002), jadi kegagalannya
-- tetap KERAS (NOT NULL violation), bukan silent -- beda kelas dari bug (1)
-- yang datanya KONSISTEN secara CHECK sehingga lolos tanpa error sama
-- sekali · p_inquiry_type NULL eksplisit -- DIPERBAIKI (guard tambahan,
-- murah & konsisten dgn pola p_service_type) walau kolom tujuannya juga
-- NOT NULL (gagal keras tanpa perbaikan ini juga, tapi pesannya jadi ramah).
--
-- (2) STATUS MANAGER -- `v_is_manager := is_manager_or_above_in(p_company_id)`
-- SAJA salah utk super_admin yang tidak punya baris user_roles aktif di
-- entitas target (super_admin lolos GERBANG AKSES lewat is_super_admin(),
-- bukan lewat baris role di company_id itu) -- is_manager_or_above_in
-- murni query ke user_roles, jadi bisa false utk super_admin tanpa baris di
-- sana, memaksanya owner_id=auth.uid() milik SUPER ADMIN itu sendiri alih-
-- alih membolehkan ia memilih/mengosongkan owner. Diganti `v_is_manager :=
-- public.is_super_admin() OR public.is_manager_or_above_in(p_company_id);`
-- -- pola identik gerbang reassign_inquiry_owner (migrasi 20261024000004).
--
-- (3) VALIDASI service_type -- SETELAH cek NULL/kosong, divalidasi harus
-- ada di dropdown_options aktif (list_key='service_type', is_active=true,
-- deleted_at IS NULL, company_id NULL [global] atau = p_company_id)
-- -- RAISE EXCEPTION ramah, bukan membiarkan nilai asing tersimpan
-- (service_type TIDAK punya CHECK literal di DB -- lihat catatan
-- 03_DATA_MODEL -- jadi tanpa ini, nilai apa pun lolos tanpa pengecekan).
--
-- (4) LANE pol_location_id/pod_location_id='' -- sebelumnya hanya `IS NULL`
-- dicek; string kosong lolos pengecekan lalu meledak di `::uuid` cast
-- dgn error Postgres mentah ("invalid input syntax for type uuid: \"\"").
-- Diganti `NULLIF(..., '') IS NULL` -- string kosong diperlakukan sama
-- dgn NULL, pesan ramah yang SAMA ("Setiap lane wajib punya Port of
-- Loading dan Port of Discharge.") utk kedua kasus.
-- =============================================================================

BEGIN;

CREATE FUNCTION public.create_inquiry_with_lanes(
  p_company_id                uuid,
  p_prospect_id               uuid,
  p_service_type              text,
  p_direction                 text DEFAULT NULL,
  p_customer_role             text DEFAULT NULL,
  p_inquiry_type              text DEFAULT 'Single Shipment',
  p_route                     text DEFAULT NULL,
  p_estimated_volume          text DEFAULT NULL,
  p_estimated_value           numeric DEFAULT NULL,
  p_notes                     text DEFAULT NULL,
  p_deadline_quote            date DEFAULT NULL,
  p_contact_id                uuid DEFAULT NULL,
  p_incoterms                 text[] DEFAULT NULL,
  p_container_types           text[] DEFAULT NULL,
  p_goods_name                text DEFAULT NULL,
  p_hs_code                   text DEFAULT NULL,
  p_weight_kg                 numeric DEFAULT NULL,
  p_volume_cbm                numeric DEFAULT NULL,
  p_dimension                 text DEFAULT NULL,
  p_cargo_types                text[] DEFAULT NULL,
  p_un_number                 text DEFAULT NULL,
  p_imo_class                 text DEFAULT NULL,
  p_has_msds                  text DEFAULT NULL,
  p_additional_services       text[] DEFAULT NULL,
  p_pickup_address             text DEFAULT NULL,
  p_delivery_address          text DEFAULT NULL,
  p_duplicate_warning_reason  text DEFAULT NULL,
  p_n_containers              integer DEFAULT NULL,
  p_cargo_ready_date          date DEFAULT NULL,
  p_undername_import          boolean DEFAULT false,
  p_importer_of_record        text DEFAULT NULL,
  p_duties_and_taxes          text DEFAULT NULL,
  p_supporting_docs_received  boolean DEFAULT false,
  p_pricing_basis             text DEFAULT NULL,
  p_validity_from             date DEFAULT NULL,
  p_validity_to               date DEFAULT NULL,
  p_monthly_volume_cbm        numeric DEFAULT NULL,
  p_owner_id                  uuid DEFAULT NULL,
  p_lanes                     jsonb DEFAULT '[]'::jsonb
)
  RETURNS TABLE (id uuid, inquiry_no text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_is_manager               boolean;
  v_owner_id                 uuid;
  v_undername_import         boolean := p_undername_import;
  v_importer_of_record       text := p_importer_of_record;
  v_duties_and_taxes         text := p_duties_and_taxes;
  v_supporting_docs_received boolean := p_supporting_docs_received;
  v_pricing_basis            text := p_pricing_basis;
  v_incoterms                text[] := p_incoterms;
  v_container_types          text[] := p_container_types;
  v_n_containers             integer := p_n_containers;
  v_cargo_ready_date         date := p_cargo_ready_date;
  v_pickup_address           text := p_pickup_address;
  v_delivery_address         text := p_delivery_address;
  v_primary_pol_loc          uuid;
  v_primary_pod_loc          uuid;
  v_primary_pol              text;
  v_primary_pod              text;
  v_lane                     jsonb;
  v_sort                     integer := 0;
  v_new_id                   uuid;
  v_new_no                   text;
BEGIN
  -- (1) company_id caller valid -- defense-in-depth (SECURITY DEFINER
  -- melewati RLS inquiries_insert, yang hanya berlaku utk INSERT langsung
  -- dari sesi caller sebagai invoker -- fungsi ini WAJIB mengecek sendiri).
  -- p_company_id IS NULL dicek EKSPLISIT di depan -- tanpa ini,
  -- `NULL IN (SELECT ...)` = NULL, `NOT NULL` = NULL, dan IF NULL tidak
  -- dieksekusi -- gerbang akses akan terlewati diam-diam (kolom tujuannya
  -- NOT NULL di DB sehingga tetap gagal pada akhirnya, tapi dengan pesan
  -- mentah dan sesudah kerja yang terbuang -- lihat header migrasi).
  IF p_company_id IS NULL
     OR NOT (public.is_super_admin() OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas ini.';
  END IF;

  IF p_prospect_id IS NULL THEN
    RAISE EXCEPTION 'Customer/Prospect wajib diisi.';
  END IF;
  IF p_service_type IS NULL OR p_service_type = '' THEN
    RAISE EXCEPTION 'Service Type wajib diisi.';
  END IF;

  -- (3) service_type TIDAK punya CHECK literal di DB (hanya character
  -- varying polos) -- divalidasi di sini terhadap dropdown_options aktif,
  -- global (company_id NULL) atau milik entitas ini, supaya nilai asing
  -- ditolak dengan pesan ramah sebelum sempat tersimpan.
  IF NOT EXISTS (
    SELECT 1 FROM public.dropdown_options
     WHERE list_key = 'service_type' AND value = p_service_type
       AND is_active = true AND deleted_at IS NULL
       AND (company_id IS NULL OR company_id = p_company_id)
  ) THEN
    RAISE EXCEPTION 'Service Type tidak dikenal: %', p_service_type;
  END IF;

  -- p_inquiry_type NULL eksplisit -- dicek terpisah dari NOT IN (pola sama
  -- p_service_type) supaya pesannya ramah; kolom tujuannya NOT NULL juga,
  -- jadi tanpa ini tetap gagal, hanya dengan pesan mentah.
  IF p_inquiry_type IS NULL OR p_inquiry_type NOT IN ('Single Shipment', 'Rate Sheet Request') THEN
    RAISE EXCEPTION 'inquiry_type tidak dikenal: %', p_inquiry_type;
  END IF;

  -- (e) Customer Role wajib kecuali General Trading ('trading').
  IF p_service_type <> 'trading' AND (p_customer_role IS NULL OR p_customer_role = '') THEN
    RAISE EXCEPTION 'Customer Role wajib diisi untuk Service Type ini.';
  END IF;

  -- (2) is_manager_or_above_in SAJA salah utk super_admin yang tidak punya
  -- baris user_roles aktif di company_id ini -- super_admin lolos gerbang
  -- akses lewat is_super_admin(), bukan lewat baris role di entitas target.
  -- Pola identik gerbang reassign_inquiry_owner (20261024000004).
  v_is_manager := public.is_super_admin() OR public.is_manager_or_above_in(p_company_id);

  -- (F.2/F.3) Owner -- dipaksa utk non-manager, divalidasi utk manager.
  IF NOT v_is_manager THEN
    v_owner_id := auth.uid();
  ELSE
    v_owner_id := p_owner_id;
    IF v_owner_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r     ON r.id = ur.role_id AND r.deleted_at IS NULL
          JOIN public.profiles pa ON pa.id = ur.user_id AND pa.active = true
         WHERE ur.user_id    = v_owner_id
           AND ur.company_id = p_company_id
           AND ur.is_active  = true
           AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
           AND r.code IN ('bd_sales_executive', 'bd_account_executive',
                           'bd_sales_spv_console', 'bd_sales_spv_forwarding', 'gm_bd')
      ) THEN
        RAISE EXCEPTION 'Owner baru harus salah satu kandidat sales/BD aktif di entitas ini.';
      END IF;
    END IF;
  END IF;

  -- (a) Undername hanya relevan Customs Clearance/Door-to-Door + Import.
  -- (1) `p_direction IS DISTINCT FROM 'Import'` -- NULL-safe: p_direction
  -- NULL dihitung "bukan Import" (benar, bukan dilewati). p_service_type
  -- sudah dijamin bukan NULL/kosong di atas, jadi NOT IN di sini aman.
  IF p_direction IS DISTINCT FROM 'Import' OR p_service_type NOT IN ('customs', 'door_to_door') THEN
    v_undername_import := false;
    v_importer_of_record := NULL;
    v_duties_and_taxes := NULL;
    v_supporting_docs_received := false;
  END IF;

  IF v_undername_import AND v_importer_of_record IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dropdown_options
       WHERE list_key = 'importer_of_record' AND value = v_importer_of_record
         AND is_active = true AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Importer of Record tidak dikenal: %', v_importer_of_record;
    END IF;
  END IF;

  -- (b) Pricing Basis hanya Door-to-Door.
  IF p_service_type <> 'door_to_door' THEN
    v_pricing_basis := NULL;
  END IF;

  -- (c)/(d) Rate Sheet: paksa NULL/kosong field Single-Shipment-only +
  -- wajibkan validity/volume (mencerminkan inquiries_rate_sheet_fields_check
  -- -- divalidasi di sini juga supaya pesan error-nya ramah, bukan mentah
  -- dari nama constraint).
  IF p_inquiry_type = 'Rate Sheet Request' THEN
    v_incoterms := NULL;
    v_container_types := NULL;
    v_n_containers := NULL;
    v_cargo_ready_date := NULL;
    v_pickup_address := NULL;
    v_delivery_address := NULL;

    IF p_validity_from IS NULL OR p_validity_to IS NULL OR p_validity_to < p_validity_from
       OR p_monthly_volume_cbm IS NULL OR p_monthly_volume_cbm <= 0 THEN
      RAISE EXCEPTION 'Validity Requested From/Until dan Estimated Volume per Month wajib diisi dan valid untuk Rate Sheet Request.';
    END IF;
  END IF;

  -- Lane -- minimal 1, setiap elemen wajib pol_location_id+pod_location_id.
  IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lanes) < 1 THEN
    RAISE EXCEPTION 'Minimal 1 lane (Port of Loading + Port of Discharge) wajib diisi.';
  END IF;

  -- (4) NULLIF(..., '') -- string kosong diperlakukan SAMA dengan NULL;
  -- tanpa ini, '' lolos cek IS NULL lalu meledak di ::uuid cast dengan
  -- error Postgres mentah ("invalid input syntax for type uuid").
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    IF NULLIF(v_lane->>'pol_location_id', '') IS NULL OR NULLIF(v_lane->>'pod_location_id', '') IS NULL THEN
      RAISE EXCEPTION 'Setiap lane wajib punya Port of Loading dan Port of Discharge.';
    END IF;
  END LOOP;

  -- Lane pertama (indeks 0) -- disalin ke kolom pol/pod inquiries sendiri.
  -- Validasi di atas sudah menjamin nol string kosong di SELURUH elemen
  -- p_lanes pada titik ini -- cast di bawah tidak lagi bisa meledak mentah.
  v_primary_pol_loc := (p_lanes->0->>'pol_location_id')::uuid;
  v_primary_pod_loc := (p_lanes->0->>'pod_location_id')::uuid;
  v_primary_pol := p_lanes->0->>'pol';
  v_primary_pod := p_lanes->0->>'pod';

  INSERT INTO public.inquiries (
    company_id, prospect_id, customer_id, contact_id, service_type, direction,
    customer_role, inquiry_type, route, estimated_volume, estimated_value, notes,
    deadline_quote, pol, pod, pol_location_id, pod_location_id,
    incoterms, container_types, goods_name, hs_code,
    weight_kg, volume_cbm, dimension, cargo_types, un_number, imo_class, has_msds,
    additional_services, pickup_address, delivery_address, duplicate_warning_reason,
    n_containers, cargo_ready_date, undername_import, importer_of_record,
    duties_and_taxes, supporting_docs_received, pricing_basis,
    validity_from, validity_to, monthly_volume_cbm,
    status, created_by, owner_id
  ) VALUES (
    p_company_id, p_prospect_id, NULL, p_contact_id, p_service_type, p_direction,
    p_customer_role, p_inquiry_type, p_route, p_estimated_volume, p_estimated_value, p_notes,
    p_deadline_quote, v_primary_pol, v_primary_pod, v_primary_pol_loc, v_primary_pod_loc,
    v_incoterms, v_container_types, p_goods_name, p_hs_code,
    p_weight_kg, p_volume_cbm, p_dimension, p_cargo_types, p_un_number, p_imo_class, p_has_msds,
    p_additional_services, v_pickup_address, v_delivery_address, p_duplicate_warning_reason,
    v_n_containers, v_cargo_ready_date, v_undername_import, v_importer_of_record,
    v_duties_and_taxes, v_supporting_docs_received, v_pricing_basis,
    p_validity_from, p_validity_to, p_monthly_volume_cbm,
    'OPEN', auth.uid(), v_owner_id
  )
  RETURNING inquiries.id, inquiries.inquiry_no INTO v_new_id, v_new_no;

  v_sort := 0;
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    INSERT INTO public.inquiry_lanes (
      inquiry_id, sort_order, pol_location_id, pod_location_id, via_location_id,
      pol, pod, via, mode, load_unit
    ) VALUES (
      v_new_id, v_sort,
      (v_lane->>'pol_location_id')::uuid, (v_lane->>'pod_location_id')::uuid,
      NULLIF(v_lane->>'via_location_id', '')::uuid,
      v_lane->>'pol', v_lane->>'pod', v_lane->>'via', v_lane->>'mode', v_lane->>'load_unit'
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN QUERY SELECT v_new_id, v_new_no;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb
) IS
  'INSERT atomik inquiry + N baris inquiry_lanes. Whitelist kolom eksplisit -- inquiry_no/status/created_by/duplicate_of_id/customer_id tidak punya parameter sama sekali. Owner dipaksa auth.uid() utk non-manager, divalidasi OPERATIONAL_ROSTER_ROLES utk manager (pola reassign_inquiry_owner). Normalisasi server-side: undername/duties/docs/IOR dipaksa NULL kecuali Import+Customs/Door-to-Door; pricing_basis hanya Door-to-Door; incoterms/container_types/n_containers/cargo_ready_date/pickup+delivery_address dipaksa NULL utk Rate Sheet Request. Lane pertama disalin ke inquiries.pol/pod/pol_location_id/pod_location_id. NOL EXCEPTION WHEN OTHERS -- error naik apa adanya.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='create_inquiry_with_lanes'; -- prosecdef=true
-- SELECT proacl FROM pg_proc WHERE proname='create_inquiry_with_lanes'; -- grantee hanya authenticated
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-4.sql utk uji self-rollback lengkap (a)-(w).
--
-- Rollback (sebelum ada pemanggil baru bergantung padanya):
--   DROP FUNCTION public.create_inquiry_with_lanes(
--     uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
--     text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
--     text[], text, text, text, integer, date, boolean, text, text, boolean, text,
--     date, date, numeric, uuid, jsonb
--   );
-- =============================================================================
