-- =============================================================================
-- Backfill: pemetaan inquiries.pol/.pod (teks bebas lama) -> pol_location_id/
-- pod_location_id (migrasi 20261023000002) lewat pencocokan PERSIS terhadap
-- public.locations.name ATAU public.locations.aliases.
--
-- BUKAN migrasi -- sengaja hidup di scripts/qa/sql/, bukan supabase/migrations/
-- (PLAN Irisan 6 §BATAS 2: seed lokasi & backfill data lama BUKAN tugas Claude
-- Code -- Vir menyiapkan seed, Den memvalidasi kodenya, Vir menjalankan skrip
-- ini). Dependensi: 20261023000001 (tabel locations, SUDAH diisi seed) +
-- 20261023000002 (kolom pol_location_id/pod_location_id) HARUS sudah jalan
-- dan `locations` HARUS sudah berisi data sebelum skrip ini berguna -- di
-- atas tabel `locations` kosong, skrip ini aman dijalankan (nol baris
-- cocok) tapi juga nol efek.
--
-- ATURAN PENCOCOKAN (persis, BUKAN fuzzy -- instruksi eksplisit):
--   key(teks) = lower(btrim(teks))
--   cocok kalau key(inquiries.pol) = key(locations.name) ATAU
--              key(inquiries.pol) = key(salah satu locations.aliases)
--   HANYA diterapkan kalau key itu mengarah ke TEPAT SATU locations.id di
--   seluruh tabel (name + aliases digabung) -- kalau dua lokasi berbeda
--   kebetulan berbagi key yang sama (nama sama, atau alias tabrakan nama
--   lokasi lain), key itu DILEWATI SELURUHNYA (tak ada yang "menang"
--   ditebak) -- lihat CTE `unambiguous` di bawah, `HAVING count(DISTINCT id)
--   = 1`. Baris yang tak cocok (atau cocok ambigu) DIBIARKAN NULL -- bukan
--   kegagalan, badge "Not recorded" (desain Location Master) menampilkannya
--   apa adanya.
--
-- IDEMPOTEN lewat kondisi WHERE-nya sendiri (`pol_location_id IS NULL`) --
-- dijalankan berulang kali aman, baris yang sudah terpetakan tak tersentuh
-- lagi (dan tak akan "ditimpa" kalau Location Master berubah namanya nanti --
-- itu kesadaran yang sama dgn migrasi owner_id backfill 30 Agu 2026).
--
-- TIDAK MENGUBAH kolom teks `inquiries.pol`/`inquiries.pod`/`inquiries.route`
-- sama sekali -- HANYA mengisi dua kolom FK baru. `route` tidak tersentuh
-- (tidak terkait lokasi sama sekali, PLAN Irisan 6 §3).
-- =============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- PRA-CEK -- jalankan DULU, catat angkanya untuk dibandingkan sesudah backfill
-- ═════════════════════════════════════════════════════════════════════════════
-- SELECT
--   count(*) FILTER (WHERE pol_location_id IS NULL AND pol IS NOT NULL AND btrim(pol) <> '') AS pol_belum_terpetakan,
--   count(*) FILTER (WHERE pod_location_id IS NULL AND pod IS NOT NULL AND btrim(pod) <> '') AS pod_belum_terpetakan,
--   count(*) FILTER (WHERE pol IS NULL OR btrim(pol) = '') AS pol_kosong,
--   count(*) FILTER (WHERE pod IS NULL OR btrim(pod) = '') AS pod_kosong
-- FROM public.inquiries
-- WHERE deleted_at IS NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN A -- POL (Port of Loading)
-- ═════════════════════════════════════════════════════════════════════════════
WITH loc_keys AS (
  SELECT lower(btrim(name)) AS key, id FROM public.locations
  UNION
  SELECT lower(btrim(a)) AS key, id FROM public.locations, unnest(aliases) AS a
  WHERE btrim(a) <> ''
),
unambiguous AS (
  SELECT key, (array_agg(DISTINCT id))[1] AS id
  FROM loc_keys
  GROUP BY key
  HAVING count(DISTINCT id) = 1
)
UPDATE public.inquiries i
SET pol_location_id = u.id
FROM unambiguous u
WHERE i.pol_location_id IS NULL
  AND i.pol IS NOT NULL
  AND btrim(i.pol) <> ''
  AND u.key = lower(btrim(i.pol));

-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN B -- POD (Port of Discharge / City)
-- ═════════════════════════════════════════════════════════════════════════════
WITH loc_keys AS (
  SELECT lower(btrim(name)) AS key, id FROM public.locations
  UNION
  SELECT lower(btrim(a)) AS key, id FROM public.locations, unnest(aliases) AS a
  WHERE btrim(a) <> ''
),
unambiguous AS (
  SELECT key, (array_agg(DISTINCT id))[1] AS id
  FROM loc_keys
  GROUP BY key
  HAVING count(DISTINCT id) = 1
)
UPDATE public.inquiries i
SET pod_location_id = u.id
FROM unambiguous u
WHERE i.pod_location_id IS NULL
  AND i.pod IS NOT NULL
  AND btrim(i.pod) <> ''
  AND u.key = lower(btrim(i.pod));

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI -- jalankan SESUDAH kedua bagian, bandingkan ke pra-cek.
-- `pol_belum_terpetakan`/`pod_belum_terpetakan` TURUN (baris yang cocok
-- persis ke locations.name/aliases); SISANYA yang tetap NULL = tak ada
-- padanan persis di Location Master hari ini (perlu ditambahkan manual via
-- Location Master, atau memang beda penulisan yang belum dikenal
-- aliases-nya) -- BUKAN kegagalan skrip.
-- ═════════════════════════════════════════════════════════════════════════════
-- SELECT
--   count(*) FILTER (WHERE pol_location_id IS NULL AND pol IS NOT NULL AND btrim(pol) <> '') AS pol_belum_terpetakan,
--   count(*) FILTER (WHERE pod_location_id IS NULL AND pod IS NOT NULL AND btrim(pod) <> '') AS pod_belum_terpetakan,
--   count(*) FILTER (WHERE pol_location_id IS NOT NULL) AS pol_terpetakan,
--   count(*) FILTER (WHERE pod_location_id IS NOT NULL) AS pod_terpetakan
-- FROM public.inquiries
-- WHERE deleted_at IS NULL;
--
-- Sanity check tambahan -- pastikan nol baris pol/pod TEKS berubah (skrip
-- ini TIDAK PERNAH menulis kolom pol/pod):
-- SELECT count(*) FROM public.inquiries WHERE pol IS NULL AND pol_location_id IS NOT NULL; -- lihat catatan di atas, ini bukan indikasi bug -- pol_location_id bisa terisi walau pol kosong KALAU kelak diisi dari picker baru (Irisan 6 FE), bukan dari skrip backfill ini (skrip ini hanya mengisi baris ber-pol/pod TEKS terisi).
-- =============================================================================
