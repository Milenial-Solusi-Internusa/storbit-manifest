-- =============================================================================
-- Hitung ulang BACA-SAJA -- berapa inquiry.direction IS NULL yang akan
-- terisi oleh backfill-inquiry-direction.sql, dan berapa yang tetap kosong.
--
-- BUKAN migrasi -- sengaja hidup di scripts/qa/sql/, bukan supabase/
-- migrations/ (pola persis backfill-inquiry-locations.sql). TIDAK DIJALANKAN
-- di sesi penulisan ini -- Den yang menjalankan di production, SETELAH
-- membaca keempat angka di bawah.
--
-- LOGIKA (replikasi PERSIS auto-suggest FE, InquiryIntakeWizardPage.jsx:
-- 598-622, dan recompute server Putaran 12 Butir 3, migrasi 20261029000001)
-- -- lane pertama (sort_order minimum di inquiry_lanes, DIFALLBACK ke
-- inquiries.pol_location_id/pod_location_id langsung untuk inquiry lama
-- pra-Putaran-4A yang nol baris inquiry_lanes), country dibandingkan
-- case-insensitive ke 'indonesia', string kosong/NULL dihitung "bukan
-- Indonesia" (BUKAN "tidak diketahui"). PASTI hanya kalau KEDUA lokasi
-- ditemukan di `locations` DAN minimal satu di antaranya Indonesia.
--
-- EMPAT ANGKA YANG DILAPORKAN:
--   1. total_null               -- seluruh inquiry direction IS NULL hari ini.
--   2. akan_terisi               -- kedua lokasi ditemukan, minimal satu
--                                   Indonesia -> Domestic/Export/Import.
--   3. kedua_dikenal_bukan_id    -- kedua lokasi ditemukan, KEDUANYA bukan
--                                   Indonesia -- model TIDAK punya bucket
--                                   untuk kombinasi ini, TETAP NULL sesudah
--                                   backfill (gap model, bukan data hilang).
--   4. lokasi_tidak_lengkap      -- salah satu/kedua lokasi tidak ditemukan
--                                   di `locations` (pol_location_id/
--                                   pod_location_id NULL, atau menunjuk id
--                                   yang sudah terhapus) -- TETAP NULL.
-- angka 2+3+4 HARUS SAMA DENGAN angka 1.
-- =============================================================================

WITH primary_lane AS (
  SELECT i.id AS inquiry_id,
         COALESCE(
           (SELECT il.pol_location_id FROM public.inquiry_lanes il
             WHERE il.inquiry_id = i.id ORDER BY il.sort_order ASC LIMIT 1),
           i.pol_location_id
         ) AS pol_loc,
         COALESCE(
           (SELECT il.pod_location_id FROM public.inquiry_lanes il
             WHERE il.inquiry_id = i.id ORDER BY il.sort_order ASC LIMIT 1),
           i.pod_location_id
         ) AS pod_loc
    FROM public.inquiries i
   WHERE i.direction IS NULL AND i.deleted_at IS NULL
),
classified AS (
  SELECT pl.inquiry_id,
         pol.id IS NOT NULL AS pol_found,
         pod.id IS NOT NULL AS pod_found,
         (lower(btrim(COALESCE(pol.country, ''))) = 'indonesia') AS pol_is_id,
         (lower(btrim(COALESCE(pod.country, ''))) = 'indonesia') AS pod_is_id
    FROM primary_lane pl
    LEFT JOIN public.locations pol ON pol.id = pl.pol_loc
    LEFT JOIN public.locations pod ON pod.id = pl.pod_loc
)
SELECT
  count(*)                                                                         AS total_null,
  count(*) FILTER (WHERE pol_found AND pod_found AND (pol_is_id OR pod_is_id))      AS akan_terisi,
  count(*) FILTER (WHERE pol_found AND pod_found AND NOT pol_is_id AND NOT pod_is_id) AS kedua_dikenal_bukan_id,
  count(*) FILTER (WHERE NOT pol_found OR NOT pod_found)                           AS lokasi_tidak_lengkap
FROM classified;

-- Rincian opsional per calon nilai (jalankan kalau ingin melihat distribusi
-- Domestic/Export/Import sebelum backfill benar-benar dijalankan):
--
-- WITH primary_lane AS (
--   SELECT i.id AS inquiry_id,
--          COALESCE((SELECT il.pol_location_id FROM public.inquiry_lanes il WHERE il.inquiry_id = i.id ORDER BY il.sort_order ASC LIMIT 1), i.pol_location_id) AS pol_loc,
--          COALESCE((SELECT il.pod_location_id FROM public.inquiry_lanes il WHERE il.inquiry_id = i.id ORDER BY il.sort_order ASC LIMIT 1), i.pod_location_id) AS pod_loc
--     FROM public.inquiries i WHERE i.direction IS NULL AND i.deleted_at IS NULL
-- )
-- SELECT
--   CASE
--     WHEN pol.id IS NULL OR pod.id IS NULL THEN NULL
--     WHEN lower(btrim(COALESCE(pol.country,''))) = 'indonesia' AND lower(btrim(COALESCE(pod.country,''))) = 'indonesia' THEN 'Domestic'
--     WHEN lower(btrim(COALESCE(pol.country,''))) = 'indonesia' THEN 'Export'
--     WHEN lower(btrim(COALESCE(pod.country,''))) = 'indonesia' THEN 'Import'
--     ELSE NULL
--   END AS calon_direction,
--   count(*)
-- FROM primary_lane pl
-- LEFT JOIN public.locations pol ON pol.id = pl.pol_loc
-- LEFT JOIN public.locations pod ON pod.id = pl.pod_loc
-- GROUP BY 1 ORDER BY 1;
-- =============================================================================
