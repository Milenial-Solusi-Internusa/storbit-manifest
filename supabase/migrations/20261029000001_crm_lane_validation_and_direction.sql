-- =============================================================================
-- Migration: 20261029000001_crm_lane_validation_and_direction
-- Inquiry Management Putaran 12 -- Butir 1 (validasi lane_mode/load_unit ke
-- dropdown_options), Butir 3 (Direction dihitung ulang saat lane pertama
-- berubah), Butir 5 (penolakan lane identik). Digabung satu berkas karena
-- ketiganya menyentuh loop per-lane yang SAMA di DUA fungsi yang SAMA.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- TANPA DROP -- create_inquiry_with_lanes(38 parameter, 20261025000005) dan
-- update_inquiry_lanes(uuid,jsonb, 20261025000006) di-CREATE OR REPLACE
-- dengan signature IDENTIK. Boleh dijalankan lewat connector Vir.
--
-- Prasyarat (dikonfirmasi Den 27 Okt 2026, bukan asumsi): 20261025000001-006
-- (tabel inquiry_lanes, kedua RPC, seed dropdown lane_mode/lane_unit) dan
-- reassign_inquiry_owner v2 (20261027000003) SUDAH live di staging --
-- diverifikasi langsung ke database, bukan dari header file (yang masih
-- menulis "BELUM DIJALANKAN" -- header itu basi untuk staging). BELUM di
-- production -- migrasi ini mengikuti antrean production yang sama dengan
-- pendahulunya, TIDAK boleh mendahului 20261025000001-006 di sana.
--
-- =============================================================================
-- BUTIR 1 -- validasi lane_mode/load_unit, NULL-SAFE (koreksi Den 27 Okt 2026)
-- =============================================================================
-- Data staging (dikonfirmasi Den): 78 baris inquiry_lanes, 9 di antaranya
-- bermode NULL dan load_unit NULL (data legacy, lahir sebelum field ini
-- wajib), sisanya terisi (38 Sea FCL/Container, 31 Sea LCL/CBM). Memvalidasi
-- NULL sebagai "tidak dikenal" akan membuat SETIAP edit lane pada inquiry
-- yang masih membawa salah satu dari 9 baris itu gagal -- termasuk edit yang
-- tidak menyentuh lane itu sama sekali (update_inquiry_lanes REPLACE-ALL:
-- seluruh lane, bukan hanya yang diubah, ikut dikirim ulang).
--
-- Jadi: NULL atau string kosong pada mode/load_unit DILOLOSKAN tanpa
-- pemeriksaan (legacy, dibiarkan apa adanya -- BUKAN tugas migrasi ini untuk
-- membereskannya). HANYA nilai TIDAK KOSONG yang tidak ada di dropdown_options
-- yang ditolak. list_key untuk kolom `load_unit` adalah 'lane_unit' (BUKAN
-- 'load_unit' -- jebakan penamaan, lihat 20261025000003:27-39); list_key
-- untuk `mode` adalah 'lane_mode' (cocok nama kolom). Scope company_id sama
-- dengan pola service_type di create_inquiry_with_lanes:235-242 (global ATAU
-- milik entitas ini).
--
-- TEMUAN WAJIB DILAPORKAN (diperiksa kode FE, src/kit/LaneTable.jsx +
-- InquiryIntakeWizardPage.jsx + DealDetailPage.jsx): untuk LANE BARU, FE
-- SELALU mengirim mode+load_unit terisi -- `blankLane()` (wizard,
-- InquiryIntakeWizardPage.jsx:270-277) default `seed.mode ?? 'Sea LCL'` lalu
-- `unitForMode(mode)`; `addDetailLane()` (Detail Inquiry,
-- DealDetailPage.jsx:1590-1594) default `last?.mode || 'Sea LCL'` lalu
-- `last?.load_unit || unitForMode(mode)`; `singleLaneFromInquiry()` (seed
-- draft edit utk inquiry pra-Putaran-4A tanpa baris inquiry_lanes,
-- DealDetailPage.jsx:1582-1588) pakai `deriveLaneMode(container_types)`,
-- juga tak pernah NULL. SATU-SATUNYA jalur NULL mencapai RPC: baris
-- inquiry_lanes LAMA (salah satu dari 9 di atas) yang dimuat ke draft edit
-- TANPA disentuh user (dropdown-nya sendiri tidak diganti), lalu
-- update_inquiry_lanes mengirim ulang SELURUH array termasuk baris itu
-- apa adanya -- persis skenario yang membuat validasi ini wajib NULL-safe.
--
-- =============================================================================
-- BUTIR 5 -- penolakan lane identik
-- =============================================================================
-- Definisi (diajukan Putaran 12, disetujui): dua lane DI DALAM SATU payload
-- identik kalau pol_location_id, pod_location_id, mode, DAN load_unit SAMA
-- PERSIS (termasuk kalau keduanya NULL -- GROUP BY memperlakukan NULL=NULL
-- sebagai satu kelompok, sengaja, karena "sama-sama tidak menyebut mode" pun
-- tetap rute yang identik). via_location_id TIDAK diikutkan -- detail
-- transit, bukan pembeda rute. POL+POD sama dengan mode/unit BEDA bukan
-- duplikat (kombinasi alternatif Sea LCL vs Air utk rute sama adalah hal
-- normal).
--
-- =============================================================================
-- BUTIR 3 -- Direction dihitung ulang saat lane pertama berubah
-- =============================================================================
-- HANYA di update_inquiry_lanes (create_inquiry_with_lanes menerima
-- p_direction langsung dari wizard yang SUDAH menghitungnya saat create --
-- rule yang sama, titik yang berbeda). Logika MEREPLIKASI PERSIS auto-suggest
-- client (InquiryIntakeWizardPage.jsx:598-622): kedua lokasi lane[0] (BARU)
-- harus ditemukan di `locations` (kalau salah satu/kedua id tidak ditemukan
-- -> tidak ada saran, direction LAMA dibiarkan); country dibandingkan
-- case-insensitive ke 'indonesia', STRING KOSONG/NULL dihitung "bukan
-- Indonesia" (bukan "tidak diketahui") -- PERSIS perlakuan FE
-- (`(pol.country||'').trim().toLowerCase()==='indonesia'`). Kedua Indonesia
-- -> Domestic; POL Indonesia & POD bukan -> Export; POD Indonesia & POL
-- bukan -> Import; keduanya bukan Indonesia -> TIDAK ada saran (direction
-- LAMA dibiarkan, BUKAN di-NULL-kan -- rule yang sama "tidak ada bucket utk
-- kombinasi ini" berlaku di kedua sisi).
--
-- Trigger pemicu: HANYA kalau (pol_location_id, pod_location_id) lane[0]
-- BARU berbeda dari lane[0] LAMA (dibandingkan SEBELUM replace-all
-- menghapusnya) -- lane[0] yang TIDAK berubah lokasinya (hanya ganti mode/
-- unit/via, atau lane lain yang berubah) TIDAK memicu penghitungan ulang.
-- Direction YANG DIHASILKAN MENIMPA nilai manual yang mungkin sudah di-set
-- lewat InquiryClassificationPage.jsx -- KONSEKUENSI YANG DIMINTA (Den,
-- koreksi §4 rencana), bukan efek samping tak terduga.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_inquiry_with_lanes(
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
  --
  -- Putaran 12 Butir 1 (BARU) -- mode/load_unit divalidasi ke
  -- dropdown_options HANYA kalau TIDAK kosong (NULL/'' diloloskan apa
  -- adanya -- lihat header migrasi; untuk create_inquiry_with_lanes ini
  -- murni jaga-jaga konsistensi dengan update_inquiry_lanes, karena FE
  -- SELALU mengirim mode+load_unit terisi untuk inquiry BARU).
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    IF NULLIF(v_lane->>'pol_location_id', '') IS NULL OR NULLIF(v_lane->>'pod_location_id', '') IS NULL THEN
      RAISE EXCEPTION 'Setiap lane wajib punya Port of Loading dan Port of Discharge.';
    END IF;

    IF NULLIF(v_lane->>'mode', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dropdown_options
       WHERE list_key = 'lane_mode' AND value = v_lane->>'mode'
         AND is_active = true AND deleted_at IS NULL
         AND (company_id IS NULL OR company_id = p_company_id)
    ) THEN
      RAISE EXCEPTION 'Lane Mode is not recognized: %', v_lane->>'mode';
    END IF;

    IF NULLIF(v_lane->>'load_unit', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dropdown_options
       WHERE list_key = 'lane_unit' AND value = v_lane->>'load_unit'
         AND is_active = true AND deleted_at IS NULL
         AND (company_id IS NULL OR company_id = p_company_id)
    ) THEN
      RAISE EXCEPTION 'Load Unit is not recognized: %', v_lane->>'load_unit';
    END IF;
  END LOOP;

  -- Putaran 12 Butir 5 (BARU) -- tolak lane identik di dalam satu payload.
  -- Lihat definisi "identik" di header migrasi.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT lane->>'pol_location_id' AS pol, lane->>'pod_location_id' AS pod,
             lane->>'mode' AS md, lane->>'load_unit' AS lu
        FROM jsonb_array_elements(p_lanes) AS lane
    ) t
    GROUP BY pol, pod, md, lu
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Two or more lanes are identical (same Port of Loading, Port of Discharge, Mode, and Load Unit).';
  END IF;

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
) FROM PUBLIC, anon;
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
  'Buat inquiry baru + lane sekaligus, satu transaksi. Gate company_id/owner/Rate-Sheet-fields seperti sebelumnya. Putaran 12: mode/load_unit per-lane divalidasi ke dropdown_options (list_key lane_mode/lane_unit) HANYA kalau terisi (NULL/kosong diloloskan); lane identik (pol+pod+mode+load_unit sama persis) ditolak.';

-- =============================================================================
-- update_inquiry_lanes -- Butir 1 + 3 + 5
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_inquiry_lanes(
  p_inquiry_id uuid,
  p_lanes      jsonb
)
  RETURNS TABLE (id uuid, inquiry_no text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_company_id      uuid;
  v_status          text;
  v_owner_id        uuid;
  v_inquiry_no      text;
  v_lane            jsonb;
  v_sort            integer := 0;
  v_primary_pol_loc uuid;
  v_primary_pod_loc uuid;
  v_primary_pol     text;
  v_primary_pod     text;
  v_old_lanes       jsonb;
  v_new_lanes_norm  jsonb;
  v_user_email      text;
  v_user_full_name  text;
  v_user_role       text;
  -- Putaran 12 Butir 3 -- recompute direction.
  v_old_pol_loc     uuid;
  v_old_pod_loc     uuid;
  v_pol_found       boolean;
  v_pod_found       boolean;
  v_pol_country     text;
  v_pod_country     text;
  v_pol_is_id       boolean;
  v_pod_is_id       boolean;
  v_new_direction   text;
BEGIN
  -- (1) Inquiry harus ada, tidak soft-deleted. FOR UPDATE mengunci baris
  -- ini sampai transaksi selesai -- lihat KUNCI BARIS di header migrasi
  -- 20261025000006. Putaran 12 Butir 3: pol_location_id/pod_location_id
  -- LAMA ikut diambil di sini, SEBELUM replace-all mengubahnya, supaya bisa
  -- dibandingkan dengan lane[0] BARU sesudah insert.
  SELECT i.company_id, i.status, i.owner_id, i.inquiry_no,
         i.pol_location_id, i.pod_location_id
    INTO v_company_id, v_status, v_owner_id, v_inquiry_no,
         v_old_pol_loc, v_old_pod_loc
    FROM public.inquiries i
   WHERE i.id = p_inquiry_id AND i.deleted_at IS NULL
   FOR UPDATE;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  -- (2) Gerbang company -- defense-in-depth, SECURITY DEFINER melewati RLS
  -- caller (pola identik create_inquiry_with_lanes:219-222).
  IF NOT (public.is_super_admin() OR v_company_id IN (SELECT public.get_user_company_ids())) THEN
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas ini.';
  END IF;

  -- (3) Gerbang peran -- lihat penjelasan NULL-safety di header migrasi
  -- 20261025000006.
  IF NOT (
    public.is_super_admin()
    OR COALESCE(v_owner_id = auth.uid(), false)
    OR public.is_manager_or_above_in(v_company_id)
  ) THEN
    RAISE EXCEPTION 'Anda tidak berhak mengubah rute inquiry ini.';
  END IF;

  -- (4) Gerbang status -- LOSABLE_INQUIRY_STATUS (DealDetailPage.jsx:75).
  IF v_status NOT IN ('OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION') THEN
    RAISE EXCEPTION 'Rute inquiry berstatus % tidak bisa diubah.', v_status;
  END IF;

  -- (5) Validasi bentuk lane -- lihat header migrasi 20261025000006 +
  -- header migrasi ini (Putaran 12 Butir 1/5, BARU).
  IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lanes) < 1 THEN
    RAISE EXCEPTION 'Minimal 1 lane (Port of Loading + Port of Discharge) wajib diisi.';
  END IF;
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    IF NULLIF(v_lane->>'pol_location_id', '') IS NULL OR NULLIF(v_lane->>'pod_location_id', '') IS NULL THEN
      RAISE EXCEPTION 'Setiap lane wajib punya Port of Loading dan Port of Discharge.';
    END IF;

    -- Putaran 12 Butir 1 (BARU) -- NULL-safe, lihat header migrasi.
    IF NULLIF(v_lane->>'mode', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dropdown_options
       WHERE list_key = 'lane_mode' AND value = v_lane->>'mode'
         AND is_active = true AND deleted_at IS NULL
         AND (company_id IS NULL OR company_id = v_company_id)
    ) THEN
      RAISE EXCEPTION 'Lane Mode is not recognized: %', v_lane->>'mode';
    END IF;

    IF NULLIF(v_lane->>'load_unit', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.dropdown_options
       WHERE list_key = 'lane_unit' AND value = v_lane->>'load_unit'
         AND is_active = true AND deleted_at IS NULL
         AND (company_id IS NULL OR company_id = v_company_id)
    ) THEN
      RAISE EXCEPTION 'Load Unit is not recognized: %', v_lane->>'load_unit';
    END IF;
  END LOOP;

  -- Putaran 12 Butir 5 (BARU) -- tolak lane identik. Lihat header migrasi.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT lane->>'pol_location_id' AS pol, lane->>'pod_location_id' AS pod,
             lane->>'mode' AS md, lane->>'load_unit' AS lu
        FROM jsonb_array_elements(p_lanes) AS lane
    ) t
    GROUP BY pol, pod, md, lu
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Two or more lanes are identical (same Port of Loading, Port of Discharge, Mode, and Load Unit).';
  END IF;

  -- (6) No-op guard -- bandingkan lane tersimpan (urut sort_order) dengan
  -- lane yang dikirim (urut array, dinormalisasi bentuk yang sama).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pol_location_id', pol_location_id, 'pod_location_id', pod_location_id,
    'via_location_id', via_location_id, 'pol', pol, 'pod', pod, 'via', via,
    'mode', mode, 'load_unit', load_unit
  ) ORDER BY sort_order), '[]'::jsonb)
    INTO v_old_lanes
    FROM public.inquiry_lanes
   WHERE inquiry_id = p_inquiry_id;

  -- WITH ORDINALITY + ORDER BY ord -- jsonb_agg TANPA pengurutan eksplisit
  -- tidak dijamin mengikuti urutan baris sumbernya; ini membuat urutan
  -- v_new_lanes_norm DETERMINISTIK mengikuti urutan p_lanes, supaya
  -- perbandingan no-op (langkah 6) dan RETURN lane (langkah 8/audit) benar.
  SELECT jsonb_agg(jsonb_build_object(
    'pol_location_id', (le->>'pol_location_id')::uuid,
    'pod_location_id', (le->>'pod_location_id')::uuid,
    'via_location_id', NULLIF(le->>'via_location_id', '')::uuid,
    'pol', le->>'pol', 'pod', le->>'pod', 'via', le->>'via',
    'mode', le->>'mode', 'load_unit', le->>'load_unit'
  ) ORDER BY ord)
    INTO v_new_lanes_norm
    FROM jsonb_array_elements(p_lanes) WITH ORDINALITY AS t(le, ord);

  IF v_old_lanes = v_new_lanes_norm THEN
    RETURN QUERY SELECT i.id, i.inquiry_no FROM public.inquiries i WHERE i.id = p_inquiry_id;
    RETURN;
  END IF;

  -- (7) Replace-all -- lihat alasan di header migrasi 20261025000006.
  DELETE FROM public.inquiry_lanes WHERE inquiry_id = p_inquiry_id;

  v_sort := 0;
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    INSERT INTO public.inquiry_lanes (
      inquiry_id, sort_order, pol_location_id, pod_location_id, via_location_id,
      pol, pod, via, mode, load_unit
    ) VALUES (
      p_inquiry_id, v_sort,
      (v_lane->>'pol_location_id')::uuid, (v_lane->>'pod_location_id')::uuid,
      NULLIF(v_lane->>'via_location_id', '')::uuid,
      v_lane->>'pol', v_lane->>'pod', v_lane->>'via', v_lane->>'mode', v_lane->>'load_unit'
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- (8) Sinkron mirror -- lane pertama SETELAH urutan baru. Lihat header
  -- migrasi 20261025000006 (find_possible_duplicate_inquiries bergantung
  -- pada ini).
  v_primary_pol_loc := (p_lanes->0->>'pol_location_id')::uuid;
  v_primary_pod_loc := (p_lanes->0->>'pod_location_id')::uuid;
  v_primary_pol := p_lanes->0->>'pol';
  v_primary_pod := p_lanes->0->>'pod';

  -- Putaran 12 Butir 3 (BARU) -- direction dihitung ulang HANYA kalau
  -- lokasi lane pertama berubah. Replikasi persis logika auto-suggest FE
  -- (InquiryIntakeWizardPage.jsx:598-622) -- lihat header migrasi.
  v_new_direction := NULL;
  IF v_primary_pol_loc IS DISTINCT FROM v_old_pol_loc
     OR v_primary_pod_loc IS DISTINCT FROM v_old_pod_loc THEN
    v_pol_found := EXISTS (SELECT 1 FROM public.locations l WHERE l.id = v_primary_pol_loc);
    v_pod_found := EXISTS (SELECT 1 FROM public.locations l WHERE l.id = v_primary_pod_loc);
    IF v_pol_found AND v_pod_found THEN
      SELECT lower(btrim(COALESCE(l.country, ''))) INTO v_pol_country
        FROM public.locations l WHERE l.id = v_primary_pol_loc;
      SELECT lower(btrim(COALESCE(l.country, ''))) INTO v_pod_country
        FROM public.locations l WHERE l.id = v_primary_pod_loc;
      v_pol_is_id := (v_pol_country = 'indonesia');
      v_pod_is_id := (v_pod_country = 'indonesia');
      IF v_pol_is_id AND v_pod_is_id THEN
        v_new_direction := 'Domestic';
      ELSIF v_pol_is_id AND NOT v_pod_is_id THEN
        v_new_direction := 'Export';
      ELSIF v_pod_is_id AND NOT v_pol_is_id THEN
        v_new_direction := 'Import';
      END IF;
      -- keduanya bukan Indonesia -> v_new_direction tetap NULL, direction
      -- LAMA dibiarkan (tidak ada bucket untuk kombinasi ini, sama dgn FE).
    END IF;
    -- lokasi tidak ditemukan -> v_new_direction tetap NULL, direction LAMA
    -- dibiarkan (sama dengan FE: `if (!pol || !pod) return;`).
  END IF;

  UPDATE public.inquiries AS q SET
    pol = v_primary_pol, pod = v_primary_pod,
    pol_location_id = v_primary_pol_loc, pod_location_id = v_primary_pod_loc,
    direction = COALESCE(v_new_direction, q.direction),
    updated_at = now()
  WHERE q.id = p_inquiry_id;

  -- (9) Audit -- pola PERSIS reassign_inquiry_owner (20261024000004:127-141).
  SELECT pr.email, pr.full_name INTO v_user_email, v_user_full_name FROM public.profiles pr WHERE pr.id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'UPDATE_INQUIRY_LANES', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('lanes', v_old_lanes), jsonb_build_object('lanes', v_new_lanes_norm), NULL);

  RETURN QUERY SELECT i.id, i.inquiry_no FROM public.inquiries i WHERE i.id = p_inquiry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) IS
  'Edit/tambah/hapus/urutkan lane inquiry (replace-all). Gate/no-op/audit seperti sebelumnya (lihat 20261025000006). Putaran 12: mode/load_unit per-lane divalidasi ke dropdown_options HANYA kalau terisi (NULL/kosong legacy diloloskan); lane identik ditolak; direction DIHITUNG ULANG (replikasi auto-suggest FE) HANYA kalau lokasi lane pertama berubah, dan HANYA menimpa kalau hasilnya pasti (Domestic/Export/Import) -- kalau tidak pasti, direction lama dibiarkan.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname IN ('create_inquiry_with_lanes','update_inquiry_lanes');
--  -- prosecdef=true utk keduanya
-- SELECT proname, proacl FROM pg_proc WHERE proname IN ('create_inquiry_with_lanes','update_inquiry_lanes');
--  -- grantee hanya authenticated
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-12.sql untuk uji self-rollback.
--
-- Rollback (CREATE OR REPLACE balik ke badan SEBELUM migrasi ini -- badan
-- "sebelum" ada utuh di 20261025000005/20261025000006):
--   -- salin ulang CREATE OR REPLACE dari kedua file itu.
-- =============================================================================
