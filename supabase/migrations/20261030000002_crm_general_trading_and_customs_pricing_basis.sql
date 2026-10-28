-- =============================================================================
-- Migration: 20261030000002_crm_general_trading_and_customs_pricing_basis
-- Inquiry Management Putaran 14 (W-10, W-41) -- create_inquiry_with_lanes:
-- (1) General Trading ('trading') bisa dibuat TANPA lane (minimal-1 lane
-- dikecualikan) + guard entitas SOA; (2) Pricing Basis diperluas ke
-- 'customs' (sebelumnya hanya 'door_to_door'); (3) 4 parameter baru utk
-- kolom "Delivery" dari 20261030000001.
--
-- Status: VERSI PASCA-PERBAIKAN. Versi PERTAMA berkas ini SUDAH DIJALANKAN
-- Mas di STAGING dan merusak create_inquiry_with_lanes utk SEMUA
-- service_type -- lihat "PERBAIKAN 42702" di bawah. BELUM pernah dijalankan
-- di production. MEMUAT DROP FUNCTION -- DIJALANKAN MAS SENDIRI (psql / SQL
-- Editor), BUKAN lewat connector Vir. Urutan: SETELAH
-- 20261030000001_crm_inquiries_delivery_fields (kolom harus ada dulu,
-- karena INSERT di badan fungsi ini menulis ke 4 kolom itu).
--
-- PERBAIKAN 42702 (ditemukan dari hasil verify-inquiry-putaran-14.sql di
-- staging, T1-T9 gagal) -- blok DECLARE memuat
-- `v_soa_id uuid := (SELECT id FROM public.companies WHERE code = 'SOA')`,
-- `id` TANPA alias tabel. Fungsi ini RETURNS TABLE (id uuid, inquiry_no
-- text), dan nama parameter OUT itu berlaku di SELURUH badan fungsi
-- termasuk blok DECLARE -- jadi `id` polos di subquery itu bentrok dengan
-- kolom keluaran `id` fungsi ini sendiri, BUKAN cuma dengan
-- `companies.id`. Postgres menolaknya "42702 column reference \"id\" is
-- ambiguous" SETIAP KALI FUNGSI DIPANGGIL (DECLARE dieksekusi tiap
-- invocation) -- jadi create_inquiry_with_lanes rusak utk SEMUA
-- service_type, bukan hanya 'trading'. Ditambal di DECLARE jadi
-- `SELECT c.id FROM public.companies c WHERE c.code = 'SOA'` (alias
-- eksplisit) -- lihat komentar di titik itu. SELURUH badan fungsi lain
-- ditelusuri (lihat laporan chat sesi perbaikan ini) -- nol referensi `id`
-- atau `inquiry_no` tanpa alias LAIN yang bentrok; satu-satunya tempat lain
-- yang memakai kedua nama itu sudah terkualifikasi
-- (`inquiries.id`/`inquiries.inquiry_no` pada klausa RETURNING, badan
-- lama yang tidak disentuh perbaikan ini).
--
-- DAPAT DIJALANKAN ULANG DI KEDUA ENVIRONMENT -- kedua DROP FUNCTION di
-- bawah memakai IF EXISTS: satu utk signature 39-parameter (LAMA, masih
-- live di production hari ini), satu utk signature 43-parameter (versi
-- PERTAMA/rusak yang sudah live di STAGING). Berkas yang SAMA ini aman
-- dijalankan di staging (menimpa versi rusak) MAUPUN di production
-- (migrasi pertama kali di sana) tanpa disunting ulang.
--
-- DASAR PERUBAHAN -- badan fungsi diambil VERBATIM dari migrasi TERAKHIR
-- yang mendefinisikan create_inquiry_with_lanes, yaitu
-- 20261029000001_crm_lane_validation_and_direction.sql (dikonfirmasi: nol
-- migrasi lain di antara 20261029000001 dan hari ini yang menyentuh fungsi
-- ini -- grep `create_inquiry_with_lanes` di seluruh supabase/migrations/
-- hanya mengembalikan 20261025000001/-02/-04/-05/-06,
-- 20261026000001, 20261027000007/-08, 20261029000001/-02; dan keempat
-- migrasi 20261029000002-05 diverifikasi TIDAK mendefinisikan ulang fungsi
-- ini -- 20261029000002 hanya MENYEBUTNYA di komentar trigger
-- trg_fn_round_inquiry_measurements, 20261029000003-05 mendefinisikan
-- fungsi lain sama sekali [find_possible_duplicate_rate_sheets,
-- trg_fn_quotation_auto_close_on_inquiry_closed,
-- trg_fn_lock_quotation_closed_inquiry,
-- trg_fn_lock_quotation_items_closed_inquiry, create_quotation_revision,
-- revert_manual_win]). schema_snapshot.sql SENGAJA TIDAK dipakai sebagai
-- acuan -- diverifikasi `grep -n create_inquiry_with_lanes
-- supabase/schema_snapshot.sql` = NOL hit; snapshot ini bukan cuma "basi
-- utk tweak terakhir", ia dari SEBELUM fungsi ini lahir sama sekali (tabel
-- inquiries di snapshot juga belum punya kolom customer_role/pricing_basis/
-- undername_import dkk dari Putaran 4).
--
-- SIGNATURE LAMA (live staging) -- 39 parameter (bukan 38 seperti sempat
-- tertulis di rencana awal -- dihitung ulang programatik dari
-- 20261029000001, `awk` pola 'CREATE ... sampai )' lalu
-- `grep -c '^\s*p_'` = 39): p_company_id uuid, p_prospect_id uuid,
-- p_service_type text, p_direction text, p_customer_role text,
-- p_inquiry_type text, p_route text, p_estimated_volume text,
-- p_estimated_value numeric, p_notes text, p_deadline_quote date,
-- p_contact_id uuid, p_incoterms text[], p_container_types text[],
-- p_goods_name text, p_hs_code text, p_weight_kg numeric,
-- p_volume_cbm numeric, p_dimension text, p_cargo_types text[],
-- p_un_number text, p_imo_class text, p_has_msds text,
-- p_additional_services text[], p_pickup_address text,
-- p_delivery_address text, p_duplicate_warning_reason text,
-- p_n_containers integer, p_cargo_ready_date date,
-- p_undername_import boolean, p_importer_of_record text,
-- p_duties_and_taxes text, p_supporting_docs_received boolean,
-- p_pricing_basis text, p_validity_from date, p_validity_to date,
-- p_monthly_volume_cbm numeric, p_owner_id uuid, p_lanes jsonb.
--
-- SIGNATURE BARU -- 43 parameter: signature lama + 4 parameter baru DI
-- AKHIR, semua DEFAULT NULL: p_order_category text,
-- p_requested_delivery_date date, p_estimated_shipping_cost numeric,
-- p_customer_reference text. Parameter baru berarti fungsi baru bagi
-- Postgres (tipe argumen berubah) -- CREATE OR REPLACE TIDAK cukup (akan
-- melahirkan overload kedua, bukan mengganti), jadi DROP FUNCTION
-- signature 39-param WAJIB lebih dulu. Signature RPC ini berubah dari
-- 39 -> 43 parameter.
--
-- PERUBAHAN BADAN FUNGSI -- HANYA INI, TIDAK ADA YANG LAIN:
--   1. Lane minimal-1 (mockup `req.laneOk`, baris 759) DIKECUALIKAN utk
--      p_service_type='trading' -- General Trading tidak punya langkah
--      "Route & Terms" sama sekali di mockup (SK baris 764), jadi tidak
--      pernah mengisi p_lanes. Tipe jsonb (harus array) TETAP diperiksa utk
--      SEMUA service_type (pertahanan dari payload rusak); hanya syarat
--      "panjangnya >= 1" yang dikecualikan utk 'trading'. Variabel
--      v_primary_pol_loc/v_primary_pod_loc/v_primary_pol/v_primary_pod
--      dibuat NULL-safe EKSPLISIT utk 'trading' (walau secara teknis sudah
--      NULL lewat semantik Postgres `jsonb -> out-of-range-index` = NULL --
--      dibuat eksplisit di sini supaya tidak bergantung pada perilaku
--      implisit yang mudah disalahpahami pembaca kode). Loop
--      `jsonb_array_elements(p_lanes)` (validasi mode/load_unit) dan cek
--      lane identik (GROUP BY ... HAVING count(*)>1) TIDAK disentuh --
--      keduanya otomatis jadi no-op utk array kosong (0 atau 1 elemen
--      tidak pernah memicu HAVING count(*)>1), jadi perilakunya utk
--      service_type LAIN (yang tetap mengirim lane) tidak berubah SAMA
--      SEKALI.
--   2. Guard baru: p_service_type='trading' DAN company yang akan ditulis
--      (p_company_id -- TIDAK ada override entitas di migrasi ini, lihat
--      catatan Scope 4 di bawah) BUKAN SOA -> RAISE EXCEPTION. Rule desain
--      #7 (nexus-notes.js baris 14): "General Trading belongs to SOA."
--      v_soa_id diselesaikan dari `companies.code='SOA'` (bukan UUID
--      hardcode) -- pola sama pencarian JCI di migrasi lain (mis.
--      20260603000025_assets_it_equipment.sql:88).
--   3. Customer Role wajib kecuali 'trading' -- SUDAH ADA di badan fungsi
--      sejak 20261029000001:206-208 ("(e) Customer Role wajib kecuali
--      General Trading"). TIDAK DISENTUH, dipertahankan verbatim.
--   4. Pricing Basis -- kondisi diperluas dari
--      `IF p_service_type <> 'door_to_door'` menjadi
--      `IF p_service_type NOT IN ('door_to_door', 'customs')`. TANPA
--      syarat Direction='Import' (keputusan Mas, Putaran 14) --
--      PENGECUALIAN SADAR DARI MOCKUP: mockup TIDAK memiliki UI Pricing
--      Basis untuk Customs Clearance berdiri sendiri sama sekali (field
--      ini hanya ada di langkah "Customs & Undername", yang di SK mockup
--      baris 764 HANYA ada utk Door-to-Door). Dicatat di sini sebagai
--      keputusan eksplisit, bukan ditebak dari markup yang tidak ada.
--   5. INSERT inquiries bertambah 4 kolom baru (order_category,
--      requested_delivery_date, estimated_shipping_cost,
--      customer_reference) dari 4 parameter baru, TANPA validasi nilai
--      tambahan (mockup: kelima field grup Delivery absen dari objek `req`
--      baris 759 -- nol field wajib).
--
-- SCOPE 4 (entitas Customs Clearance) -- SENGAJA TIDAK DIKERJAKAN DI
-- MIGRASI INI. Keputusan Mas: ditahan sampai nasib JCI diputuskan (staging
-- belum punya user aktif/akun JCI; 15 inquiry Customs Clearance yang ada
-- hari ini company_id-nya semua MSI). company_id utk p_service_type=
-- 'customs' TETAP p_company_id apa adanya (lihat INSERT, tidak diubah).
--
-- update_inquiry_lanes TIDAK disentuh sama sekali di migrasi ini (DROP
-- maupun CREATE) -- fungsi itu tidak berurusan dengan company_id/
-- service_type/kolom Delivery.
-- =============================================================================

BEGIN;

-- Signature LAMA (39 parameter, live production hari ini) -- IF EXISTS
-- supaya berkas ini aman dijalankan ulang di environment yang BELUM pernah
-- menjalankan 20261030000002 sama sekali (production, sebelum migrasi ini
-- jalan di sana).
DROP FUNCTION IF EXISTS public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb
);

-- Signature BARU RUSAK (43 parameter) -- hasil percobaan PERTAMA migrasi
-- ini yang sudah live di staging SEBELUM perbaikan 42702 ini. IF EXISTS
-- supaya berkas yang sama ini juga aman dijalankan ulang DI STAGING (yang
-- sekarang memegang signature 43-parameter yang rusak, bukan lagi
-- signature 39-parameter lama).
DROP FUNCTION IF EXISTS public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb, text, date, numeric, text
);

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
  p_lanes                     jsonb DEFAULT '[]'::jsonb,
  -- Putaran 14 (W-60) -- 4 parameter baru, SELALU DEFAULT NULL supaya
  -- pemanggil FE lama (belum tahu kolom ini) tetap jalan tanpa error.
  p_order_category             text DEFAULT NULL,
  p_requested_delivery_date    date DEFAULT NULL,
  p_estimated_shipping_cost    numeric DEFAULT NULL,
  p_customer_reference         text DEFAULT NULL
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
  -- Putaran 14 (W-10, Scope 1b) -- entitas SOA diselesaikan dari
  -- companies.code, bukan UUID hardcode.
  --
  -- PERBAIKAN PASCA-STAGING (42702) -- subquery di bawah SEBELUMNYA memakai
  -- `id` TANPA alias tabel (`SELECT id FROM public.companies ...`). Fungsi
  -- ini RETURNS TABLE (id uuid, inquiry_no text), dan parameter OUT itu
  -- IKUT terlihat di dalam seluruh badan fungsi termasuk blok DECLARE --
  -- jadi `id` polos bentrok dengan kolom keluaran `id`, bukan hanya dengan
  -- `companies.id`. Postgres menolaknya "42702 column reference id is
  -- ambiguous" SAAT FUNGSI DIPANGGIL (DECLARE dieksekusi tiap invocation,
  -- bukan hanya sekali saat CREATE) -- merusak create_inquiry_with_lanes
  -- utk SEMUA service_type, bukan hanya 'trading'. Ditambal dengan alias
  -- tabel eksplisit `c.id`/`c.code` -- kelas jebakan yang sama dengan
  -- "alias semua tabel di dalam fungsi RETURNS TABLE" (aturan wajib sesi).
  v_soa_id                   uuid := (SELECT c.id FROM public.companies c WHERE c.code = 'SOA');
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

  -- (e) Customer Role wajib kecuali General Trading ('trading'). TIDAK
  -- DISENTUH Putaran 14 -- sudah benar sejak 20261029000001.
  IF p_service_type <> 'trading' AND (p_customer_role IS NULL OR p_customer_role = '') THEN
    RAISE EXCEPTION 'Customer Role wajib diisi untuk Service Type ini.';
  END IF;

  -- Putaran 14 (W-10, Scope 1b, BARU) -- General Trading hanya tersedia
  -- utk entitas SOA (rule desain #7, nexus-notes.js: "General Trading
  -- belongs to SOA"). SCOPE 4 (entitas Customs Clearance) SENGAJA TIDAK
  -- disentuh di sini maupun di mana pun di fungsi ini -- lihat header
  -- migrasi.
  IF p_service_type = 'trading' AND p_company_id IS DISTINCT FROM v_soa_id THEN
    RAISE EXCEPTION 'General Trading hanya tersedia untuk entitas SOA.';
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
  -- TIDAK DISENTUH Putaran 14.
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

  -- (b) Pricing Basis -- Putaran 14 (W-41, Scope 2): diperluas dari
  -- "hanya Door-to-Door" menjadi "Door-to-Door ATAU Customs Clearance",
  -- TANPA syarat Direction='Import'. PENGECUALIAN SADAR DARI MOCKUP --
  -- mockup tidak punya UI Pricing Basis utk Customs Clearance berdiri
  -- sendiri (field ini hanya ada di langkah "Customs & Undername", yang
  -- di mockup HANYA ada utk Door-to-Door, lihat SK baris 764 di header
  -- migrasi) -- ditulis di sini sebagai keputusan eksplisit Mas.
  IF p_service_type NOT IN ('door_to_door', 'customs') THEN
    v_pricing_basis := NULL;
  END IF;

  -- (c)/(d) Rate Sheet: paksa NULL/kosong field Single-Shipment-only +
  -- wajibkan validity/volume (mencerminkan inquiries_rate_sheet_fields_check
  -- -- divalidasi di sini juga supaya pesan error-nya ramah, bukan mentah
  -- dari nama constraint). TIDAK DISENTUH Putaran 14.
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

  -- Lane -- tipe jsonb (harus array) WAJIB utk SEMUA service_type (jaga
  -- dari payload rusak); syarat "minimal 1 elemen" DIKECUALIKAN utk
  -- 'trading' (Putaran 14, W-10, Scope 1a) -- General Trading tidak punya
  -- langkah "Route & Terms" di mockup sama sekali (SK baris 764), jadi
  -- tidak pernah mengisi p_lanes. Service_type LAIN tetap mewajibkan
  -- minimal 1 lane, perilaku TIDAK berubah.
  IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Minimal 1 lane (Port of Loading + Port of Discharge) wajib diisi.';
  END IF;
  IF p_service_type <> 'trading' AND jsonb_array_length(p_lanes) < 1 THEN
    RAISE EXCEPTION 'Minimal 1 lane (Port of Loading + Port of Discharge) wajib diisi.';
  END IF;

  -- (4) NULLIF(..., '') -- string kosong diperlakukan SAMA dengan NULL;
  -- tanpa ini, '' lolos cek IS NULL lalu meledak di ::uuid cast dengan
  -- error Postgres mentah ("invalid input syntax for type uuid").
  --
  -- Putaran 12 Butir 1 -- mode/load_unit divalidasi ke dropdown_options
  -- HANYA kalau TIDAK kosong (NULL/'' diloloskan apa adanya -- lihat
  -- header migrasi 20261029000001; untuk create_inquiry_with_lanes ini
  -- murni jaga-jaga konsistensi dengan update_inquiry_lanes, karena FE
  -- SELALU mengirim mode+load_unit terisi untuk inquiry BARU). TIDAK
  -- DISENTUH Putaran 14 -- loop ini otomatis 0 iterasi utk 'trading'
  -- (p_lanes='[]'), jadi perilakunya utk service_type lain tidak berubah.
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

  -- Putaran 12 Butir 5 -- tolak lane identik di dalam satu payload. Lihat
  -- definisi "identik" di header migrasi 20261029000001. TIDAK DISENTUH
  -- Putaran 14 -- GROUP BY ... HAVING count(*)>1 otomatis tidak pernah
  -- benar utk array dengan 0 atau 1 elemen (kasus 'trading').
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
  -- Putaran 14 (Scope 1a) -- utk 'trading' (nol lane), dibuat NULL secara
  -- EKSPLISIT alih-alih mengandalkan semantik implisit Postgres
  -- (`jsonb_array -> index-di-luar-batas` = NULL, yang sebenarnya sudah
  -- membuat baris di bawah ini aman tanpa percabangan -- tapi ditulis
  -- eksplisit di sini supaya tidak bergantung pada perilaku yang mudah
  -- disalahpahami pembaca kode lain). Utk service_type LAIN, validasi di
  -- atas sudah menjamin nol string kosong di SELURUH elemen p_lanes pada
  -- titik ini -- cast di bawah tidak berubah, tidak bisa meledak mentah.
  IF p_service_type = 'trading' THEN
    v_primary_pol_loc := NULL;
    v_primary_pod_loc := NULL;
    v_primary_pol := NULL;
    v_primary_pod := NULL;
  ELSE
    v_primary_pol_loc := (p_lanes->0->>'pol_location_id')::uuid;
    v_primary_pod_loc := (p_lanes->0->>'pod_location_id')::uuid;
    v_primary_pol := p_lanes->0->>'pol';
    v_primary_pod := p_lanes->0->>'pod';
  END IF;

  -- Putaran 14 (W-60, Scope 3) -- 4 kolom baru ditambahkan ke daftar
  -- kolom/VALUES, TANPA validasi nilai tambahan (mockup: kelima field grup
  -- "Delivery" absen dari objek req baris 759 -- nol field wajib).
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
    order_category, requested_delivery_date, estimated_shipping_cost, customer_reference,
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
    p_order_category, p_requested_delivery_date, p_estimated_shipping_cost, p_customer_reference,
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
  date, date, numeric, uuid, jsonb, text, date, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb, text, date, numeric, text
) TO authenticated;

COMMENT ON FUNCTION public.create_inquiry_with_lanes(
  uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
  text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
  text[], text, text, text, integer, date, boolean, text, text, boolean, text,
  date, date, numeric, uuid, jsonb, text, date, numeric, text
) IS
  'Buat inquiry baru + lane sekaligus, satu transaksi. Gate company_id/owner/Rate-Sheet-fields seperti sebelumnya. Putaran 12: mode/load_unit per-lane divalidasi ke dropdown_options (list_key lane_mode/lane_unit) HANYA kalau terisi (NULL/kosong diloloskan); lane identik (pol+pod+mode+load_unit sama persis) ditolak. Putaran 14: signature 39 -> 43 parameter (+p_order_category/p_requested_delivery_date/p_estimated_shipping_cost/p_customer_reference, semua DEFAULT NULL); lane minimal-1 dikecualikan utk service_type=''trading'' (General Trading, guard entitas SOA ditambahkan); pricing_basis diperluas berlaku utk ''door_to_door'' DAN ''customs'' (sebelumnya hanya door_to_door), tanpa syarat Direction. Entitas Customs Clearance (Scope 4) SENGAJA TIDAK disentuh -- company_id tetap apa adanya dari caller.';

COMMIT;

-- =============================================================================
-- ROLLBACK (jalankan manual kalau migrasi ini perlu dibatalkan -- DROP
-- signature 43-param BARU, lalu CREATE ulang signature 39-param LAMA,
-- disalin VERBATIM dari 20261029000001_crm_lane_validation_and_direction.sql):
--
-- BEGIN;
--
-- DROP FUNCTION public.create_inquiry_with_lanes(
--   uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
--   text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
--   text[], text, text, text, integer, date, boolean, text, text, boolean, text,
--   date, date, numeric, uuid, jsonb, text, date, numeric, text
-- );
--
-- CREATE FUNCTION public.create_inquiry_with_lanes(
--   p_company_id                uuid,
--   p_prospect_id               uuid,
--   p_service_type              text,
--   p_direction                 text DEFAULT NULL,
--   p_customer_role             text DEFAULT NULL,
--   p_inquiry_type              text DEFAULT 'Single Shipment',
--   p_route                     text DEFAULT NULL,
--   p_estimated_volume          text DEFAULT NULL,
--   p_estimated_value           numeric DEFAULT NULL,
--   p_notes                     text DEFAULT NULL,
--   p_deadline_quote            date DEFAULT NULL,
--   p_contact_id                uuid DEFAULT NULL,
--   p_incoterms                 text[] DEFAULT NULL,
--   p_container_types           text[] DEFAULT NULL,
--   p_goods_name                text DEFAULT NULL,
--   p_hs_code                   text DEFAULT NULL,
--   p_weight_kg                 numeric DEFAULT NULL,
--   p_volume_cbm                numeric DEFAULT NULL,
--   p_dimension                 text DEFAULT NULL,
--   p_cargo_types                text[] DEFAULT NULL,
--   p_un_number                 text DEFAULT NULL,
--   p_imo_class                 text DEFAULT NULL,
--   p_has_msds                  text DEFAULT NULL,
--   p_additional_services       text[] DEFAULT NULL,
--   p_pickup_address             text DEFAULT NULL,
--   p_delivery_address          text DEFAULT NULL,
--   p_duplicate_warning_reason  text DEFAULT NULL,
--   p_n_containers              integer DEFAULT NULL,
--   p_cargo_ready_date          date DEFAULT NULL,
--   p_undername_import          boolean DEFAULT false,
--   p_importer_of_record        text DEFAULT NULL,
--   p_duties_and_taxes          text DEFAULT NULL,
--   p_supporting_docs_received  boolean DEFAULT false,
--   p_pricing_basis             text DEFAULT NULL,
--   p_validity_from             date DEFAULT NULL,
--   p_validity_to               date DEFAULT NULL,
--   p_monthly_volume_cbm        numeric DEFAULT NULL,
--   p_owner_id                  uuid DEFAULT NULL,
--   p_lanes                     jsonb DEFAULT '[]'::jsonb
-- )
--   RETURNS TABLE (id uuid, inquiry_no text)
--   LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path TO 'public'
--   AS $$
-- DECLARE
--   v_is_manager               boolean;
--   v_owner_id                 uuid;
--   v_undername_import         boolean := p_undername_import;
--   v_importer_of_record       text := p_importer_of_record;
--   v_duties_and_taxes         text := p_duties_and_taxes;
--   v_supporting_docs_received boolean := p_supporting_docs_received;
--   v_pricing_basis            text := p_pricing_basis;
--   v_incoterms                text[] := p_incoterms;
--   v_container_types          text[] := p_container_types;
--   v_n_containers             integer := p_n_containers;
--   v_cargo_ready_date         date := p_cargo_ready_date;
--   v_pickup_address           text := p_pickup_address;
--   v_delivery_address         text := p_delivery_address;
--   v_primary_pol_loc          uuid;
--   v_primary_pod_loc          uuid;
--   v_primary_pol              text;
--   v_primary_pod              text;
--   v_lane                     jsonb;
--   v_sort                     integer := 0;
--   v_new_id                   uuid;
--   v_new_no                   text;
-- BEGIN
--   IF p_company_id IS NULL
--      OR NOT (public.is_super_admin() OR p_company_id IN (SELECT public.get_user_company_ids())) THEN
--     RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas ini.';
--   END IF;
--
--   IF p_prospect_id IS NULL THEN
--     RAISE EXCEPTION 'Customer/Prospect wajib diisi.';
--   END IF;
--   IF p_service_type IS NULL OR p_service_type = '' THEN
--     RAISE EXCEPTION 'Service Type wajib diisi.';
--   END IF;
--
--   IF NOT EXISTS (
--     SELECT 1 FROM public.dropdown_options
--      WHERE list_key = 'service_type' AND value = p_service_type
--        AND is_active = true AND deleted_at IS NULL
--        AND (company_id IS NULL OR company_id = p_company_id)
--   ) THEN
--     RAISE EXCEPTION 'Service Type tidak dikenal: %', p_service_type;
--   END IF;
--
--   IF p_inquiry_type IS NULL OR p_inquiry_type NOT IN ('Single Shipment', 'Rate Sheet Request') THEN
--     RAISE EXCEPTION 'inquiry_type tidak dikenal: %', p_inquiry_type;
--   END IF;
--
--   IF p_service_type <> 'trading' AND (p_customer_role IS NULL OR p_customer_role = '') THEN
--     RAISE EXCEPTION 'Customer Role wajib diisi untuk Service Type ini.';
--   END IF;
--
--   v_is_manager := public.is_super_admin() OR public.is_manager_or_above_in(p_company_id);
--
--   IF NOT v_is_manager THEN
--     v_owner_id := auth.uid();
--   ELSE
--     v_owner_id := p_owner_id;
--     IF v_owner_id IS NOT NULL THEN
--       IF NOT EXISTS (
--         SELECT 1
--           FROM public.user_roles ur
--           JOIN public.roles r     ON r.id = ur.role_id AND r.deleted_at IS NULL
--           JOIN public.profiles pa ON pa.id = ur.user_id AND pa.active = true
--          WHERE ur.user_id    = v_owner_id
--            AND ur.company_id = p_company_id
--            AND ur.is_active  = true
--            AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--            AND r.code IN ('bd_sales_executive', 'bd_account_executive',
--                            'bd_sales_spv_console', 'bd_sales_spv_forwarding', 'gm_bd')
--       ) THEN
--         RAISE EXCEPTION 'Owner baru harus salah satu kandidat sales/BD aktif di entitas ini.';
--       END IF;
--     END IF;
--   END IF;
--
--   IF p_direction IS DISTINCT FROM 'Import' OR p_service_type NOT IN ('customs', 'door_to_door') THEN
--     v_undername_import := false;
--     v_importer_of_record := NULL;
--     v_duties_and_taxes := NULL;
--     v_supporting_docs_received := false;
--   END IF;
--
--   IF v_undername_import AND v_importer_of_record IS NOT NULL THEN
--     IF NOT EXISTS (
--       SELECT 1 FROM public.dropdown_options
--        WHERE list_key = 'importer_of_record' AND value = v_importer_of_record
--          AND is_active = true AND deleted_at IS NULL
--     ) THEN
--       RAISE EXCEPTION 'Importer of Record tidak dikenal: %', v_importer_of_record;
--     END IF;
--   END IF;
--
--   IF p_service_type <> 'door_to_door' THEN
--     v_pricing_basis := NULL;
--   END IF;
--
--   IF p_inquiry_type = 'Rate Sheet Request' THEN
--     v_incoterms := NULL;
--     v_container_types := NULL;
--     v_n_containers := NULL;
--     v_cargo_ready_date := NULL;
--     v_pickup_address := NULL;
--     v_delivery_address := NULL;
--
--     IF p_validity_from IS NULL OR p_validity_to IS NULL OR p_validity_to < p_validity_from
--        OR p_monthly_volume_cbm IS NULL OR p_monthly_volume_cbm <= 0 THEN
--       RAISE EXCEPTION 'Validity Requested From/Until dan Estimated Volume per Month wajib diisi dan valid untuk Rate Sheet Request.';
--     END IF;
--   END IF;
--
--   IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lanes) < 1 THEN
--     RAISE EXCEPTION 'Minimal 1 lane (Port of Loading + Port of Discharge) wajib diisi.';
--   END IF;
--
--   FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
--   LOOP
--     IF NULLIF(v_lane->>'pol_location_id', '') IS NULL OR NULLIF(v_lane->>'pod_location_id', '') IS NULL THEN
--       RAISE EXCEPTION 'Setiap lane wajib punya Port of Loading dan Port of Discharge.';
--     END IF;
--
--     IF NULLIF(v_lane->>'mode', '') IS NOT NULL AND NOT EXISTS (
--       SELECT 1 FROM public.dropdown_options
--        WHERE list_key = 'lane_mode' AND value = v_lane->>'mode'
--          AND is_active = true AND deleted_at IS NULL
--          AND (company_id IS NULL OR company_id = p_company_id)
--     ) THEN
--       RAISE EXCEPTION 'Lane Mode is not recognized: %', v_lane->>'mode';
--     END IF;
--
--     IF NULLIF(v_lane->>'load_unit', '') IS NOT NULL AND NOT EXISTS (
--       SELECT 1 FROM public.dropdown_options
--        WHERE list_key = 'lane_unit' AND value = v_lane->>'load_unit'
--          AND is_active = true AND deleted_at IS NULL
--          AND (company_id IS NULL OR company_id = p_company_id)
--     ) THEN
--       RAISE EXCEPTION 'Load Unit is not recognized: %', v_lane->>'load_unit';
--     END IF;
--   END LOOP;
--
--   IF EXISTS (
--     SELECT 1 FROM (
--       SELECT lane->>'pol_location_id' AS pol, lane->>'pod_location_id' AS pod,
--              lane->>'mode' AS md, lane->>'load_unit' AS lu
--         FROM jsonb_array_elements(p_lanes) AS lane
--     ) t
--     GROUP BY pol, pod, md, lu
--     HAVING count(*) > 1
--   ) THEN
--     RAISE EXCEPTION 'Two or more lanes are identical (same Port of Loading, Port of Discharge, Mode, and Load Unit).';
--   END IF;
--
--   v_primary_pol_loc := (p_lanes->0->>'pol_location_id')::uuid;
--   v_primary_pod_loc := (p_lanes->0->>'pod_location_id')::uuid;
--   v_primary_pol := p_lanes->0->>'pol';
--   v_primary_pod := p_lanes->0->>'pod';
--
--   INSERT INTO public.inquiries (
--     company_id, prospect_id, customer_id, contact_id, service_type, direction,
--     customer_role, inquiry_type, route, estimated_volume, estimated_value, notes,
--     deadline_quote, pol, pod, pol_location_id, pod_location_id,
--     incoterms, container_types, goods_name, hs_code,
--     weight_kg, volume_cbm, dimension, cargo_types, un_number, imo_class, has_msds,
--     additional_services, pickup_address, delivery_address, duplicate_warning_reason,
--     n_containers, cargo_ready_date, undername_import, importer_of_record,
--     duties_and_taxes, supporting_docs_received, pricing_basis,
--     validity_from, validity_to, monthly_volume_cbm,
--     status, created_by, owner_id
--   ) VALUES (
--     p_company_id, p_prospect_id, NULL, p_contact_id, p_service_type, p_direction,
--     p_customer_role, p_inquiry_type, p_route, p_estimated_volume, p_estimated_value, p_notes,
--     p_deadline_quote, v_primary_pol, v_primary_pod, v_primary_pol_loc, v_primary_pod_loc,
--     v_incoterms, v_container_types, p_goods_name, p_hs_code,
--     p_weight_kg, p_volume_cbm, p_dimension, p_cargo_types, p_un_number, p_imo_class, p_has_msds,
--     p_additional_services, v_pickup_address, v_delivery_address, p_duplicate_warning_reason,
--     v_n_containers, v_cargo_ready_date, v_undername_import, v_importer_of_record,
--     v_duties_and_taxes, v_supporting_docs_received, v_pricing_basis,
--     p_validity_from, p_validity_to, p_monthly_volume_cbm,
--     'OPEN', auth.uid(), v_owner_id
--   )
--   RETURNING inquiries.id, inquiries.inquiry_no INTO v_new_id, v_new_no;
--
--   v_sort := 0;
--   FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
--   LOOP
--     INSERT INTO public.inquiry_lanes (
--       inquiry_id, sort_order, pol_location_id, pod_location_id, via_location_id,
--       pol, pod, via, mode, load_unit
--     ) VALUES (
--       v_new_id, v_sort,
--       (v_lane->>'pol_location_id')::uuid, (v_lane->>'pod_location_id')::uuid,
--       NULLIF(v_lane->>'via_location_id', '')::uuid,
--       v_lane->>'pol', v_lane->>'pod', v_lane->>'via', v_lane->>'mode', v_lane->>'load_unit'
--     );
--     v_sort := v_sort + 1;
--   END LOOP;
--
--   RETURN QUERY SELECT v_new_id, v_new_no;
-- END;
-- $$;
--
-- REVOKE ALL ON FUNCTION public.create_inquiry_with_lanes(
--   uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
--   text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
--   text[], text, text, text, integer, date, boolean, text, text, boolean, text,
--   date, date, numeric, uuid, jsonb
-- ) FROM PUBLIC, anon;
-- GRANT EXECUTE ON FUNCTION public.create_inquiry_with_lanes(
--   uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
--   text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
--   text[], text, text, text, integer, date, boolean, text, text, boolean, text,
--   date, date, numeric, uuid, jsonb
-- ) TO authenticated;
--
-- COMMENT ON FUNCTION public.create_inquiry_with_lanes(
--   uuid, uuid, text, text, text, text, text, text, numeric, text, date, uuid,
--   text[], text[], text, text, numeric, numeric, text, text[], text, text, text,
--   text[], text, text, text, integer, date, boolean, text, text, boolean, text,
--   date, date, numeric, uuid, jsonb
-- ) IS
--   'Buat inquiry baru + lane sekaligus, satu transaksi. Gate company_id/owner/Rate-Sheet-fields seperti sebelumnya. Putaran 12: mode/load_unit per-lane divalidasi ke dropdown_options (list_key lane_mode/lane_unit) HANYA kalau terisi (NULL/kosong diloloskan); lane identik (pol+pod+mode+load_unit sama persis) ditolak.';
--
-- COMMIT;
-- =============================================================================
