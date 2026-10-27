-- =============================================================================
-- Backfill: inquiries.direction -- HANYA kasus "pasti" (kedua lokasi lane
-- pertama ditemukan DAN minimal satu di antaranya Indonesia). Sisanya
-- (kedua lokasi dikenal tapi bukan Indonesia, atau lokasi tidak lengkap)
-- DIBIARKAN NULL -- bukan kegagalan, gap model yang sudah ada sejak
-- Direction pertama kali dibuat (lihat count-inquiry-direction-backfill.sql).
--
-- BUKAN migrasi -- sengaja hidup di scripts/qa/sql/, bukan supabase/
-- migrations/ (pola persis backfill-inquiry-locations.sql). TIDAK DIJALANKAN
-- di sesi penulisan ini -- Den yang menjalankan di production, SETELAH
-- menjalankan count-inquiry-direction-backfill.sql dan mencatat angkanya
-- untuk dibandingkan sesudah.
--
-- IDEMPOTEN lewat kondisi WHERE-nya sendiri (`direction IS NULL`) --
-- dijalankan berulang kali aman, baris yang sudah terisi (oleh backfill ini
-- ATAU oleh recompute server Putaran 12 Butir 3 pada edit berikutnya) tidak
-- tersentuh lagi.
--
-- LOGIKA -- replikasi PERSIS count-inquiry-direction-backfill.sql (baca
-- komentarnya untuk rincian lane pertama/fallback/perlakuan negara kosong).
--
-- TIDAK MENGUBAH kolom lain apa pun -- HANYA mengisi inquiries.direction.
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
         CASE
           WHEN pol.id IS NULL OR pod.id IS NULL THEN NULL
           WHEN lower(btrim(COALESCE(pol.country, ''))) = 'indonesia'
                AND lower(btrim(COALESCE(pod.country, ''))) = 'indonesia' THEN 'Domestic'
           WHEN lower(btrim(COALESCE(pol.country, ''))) = 'indonesia' THEN 'Export'
           WHEN lower(btrim(COALESCE(pod.country, ''))) = 'indonesia' THEN 'Import'
           ELSE NULL
         END AS calon_direction
    FROM primary_lane pl
    LEFT JOIN public.locations pol ON pol.id = pl.pol_loc
    LEFT JOIN public.locations pod ON pod.id = pl.pod_loc
)
UPDATE public.inquiries i
   SET direction = c.calon_direction,
       updated_at = now()
  FROM classified c
 WHERE i.id = c.inquiry_id
   AND i.direction IS NULL
   AND c.calon_direction IS NOT NULL;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA, bandingkan dengan angka
-- count-inquiry-direction-backfill.sql yang dicatat SEBELUM backfill ini:
--
-- SELECT count(*) FILTER (WHERE direction IS NULL)  AS masih_null,
--        count(*) FILTER (WHERE direction IS NOT NULL) AS terisi
--   FROM public.inquiries WHERE deleted_at IS NULL;
--
-- "masih_null" SESUDAH harus SAMA DENGAN (kedua_dikenal_bukan_id +
-- lokasi_tidak_lengkap) dari count-inquiry-direction-backfill.sql SEBELUM --
-- kalau TIDAK sama, backfill ini mengisi lebih banyak/sedikit dari yang
-- dihitung, dan harus diselidiki sebelum dipercaya.
-- =============================================================================
