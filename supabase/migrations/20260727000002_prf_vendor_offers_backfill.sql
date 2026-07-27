-- ARSIP — dijalankan manual 27 Jul 2026. Fase 2: backfill data lama.
-- Backup: backup_prf_cost_items_20260727 (5 baris), backup_prf_20260727 (13 baris).
-- Hasil terverifikasi: 4 offer, 4 cost item tertaut, 2 prf.selected_offer_id terisi,
-- 1 baris Biaya Internal sengaja offer_id NULL (biaya internal nempel ke PRF).
-- TIDAK IDEMPOTEN — jangan dijalankan ulang.

INSERT INTO public.prf_vendor_offers
  (prf_id, company_id, vendor_id, currency, pros, cons, created_by)
SELECT DISTINCT ON (ci.prf_id, ci.vendor_id)
  ci.prf_id, p.company_id, ci.vendor_id,
  COALESCE(ci.currency, p.rate_currency),
  'Migrasi data lama — belum ada justifikasi',
  'Migrasi data lama — belum ada justifikasi',
  p.answered_by
FROM public.prf_cost_items ci
JOIN public.prf p ON p.id = ci.prf_id
WHERE ci.vendor_id IS NOT NULL AND p.deleted_at IS NULL
ORDER BY ci.prf_id, ci.vendor_id, ci.id;

UPDATE public.prf_cost_items ci
SET offer_id = o.id
FROM public.prf_vendor_offers o
WHERE o.prf_id = ci.prf_id AND o.vendor_id = ci.vendor_id
  AND ci.vendor_id IS NOT NULL;

UPDATE public.prf p
SET selected_offer_id = o.id, selected_at = p.answered_at
FROM public.prf_vendor_offers o
WHERE o.prf_id = p.id
  AND o.vendor_id = (
    SELECT ci.vendor_id FROM public.prf_cost_items ci
    WHERE ci.prf_id = p.id AND ci.is_awarded AND ci.vendor_id IS NOT NULL
    LIMIT 1
  );
