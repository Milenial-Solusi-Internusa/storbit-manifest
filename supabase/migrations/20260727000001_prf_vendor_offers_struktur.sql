-- ARSIP — dijalankan manual di Supabase SQL Editor, 27 Jul 2026.
-- Fase 1 + 1b modul Penawaran Vendor. Aditif murni, nol dampak kode lama.
-- Catatan: policy insert/update sempat direvisi dalam sesi yang sama
-- (tambah guard acknowledged_by). Yang tercatat di sini keadaan AKHIR.

CREATE TABLE IF NOT EXISTS public.prf_vendor_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prf_id        uuid NOT NULL REFERENCES public.prf(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL,
  vendor_id     uuid NOT NULL REFERENCES public.vendors(id),
  currency      text,
  valid_from    date,
  valid_until   date,
  pros          text NOT NULL,
  cons          text NOT NULL,
  notes         text,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_prf_vendor_offers_prf
  ON public.prf_vendor_offers(prf_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prf_vendor_offers_company
  ON public.prf_vendor_offers(company_id);
CREATE INDEX IF NOT EXISTS idx_prf_vendor_offers_vendor
  ON public.prf_vendor_offers(vendor_id);

-- fungsi set_updated_at() SUDAH ADA di proyek, tidak dibuat ulang
DROP TRIGGER IF EXISTS trg_prf_vendor_offers_updated_at ON public.prf_vendor_offers;
CREATE TRIGGER trg_prf_vendor_offers_updated_at
BEFORE UPDATE ON public.prf_vendor_offers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.prf
  ADD COLUMN IF NOT EXISTS selected_offer_id uuid
    REFERENCES public.prf_vendor_offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS selected_at timestamptz,
  ADD COLUMN IF NOT EXISTS min_offers_waiver_reason text,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_prf_selected_offer
  ON public.prf(selected_offer_id) WHERE selected_offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prf_acknowledged_by
  ON public.prf(acknowledged_by) WHERE acknowledged_by IS NOT NULL;

ALTER TABLE public.prf_cost_items
  ADD COLUMN IF NOT EXISTS offer_id uuid
    REFERENCES public.prf_vendor_offers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_prf_cost_items_offer
  ON public.prf_cost_items(offer_id);

ALTER TABLE public.prf_vendor_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prf_vendor_offers_select ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_select ON public.prf_vendor_offers
FOR SELECT TO authenticated
USING (
  is_super_admin() OR (
    company_id = get_user_company_id() AND (
      has_role('procurement') OR is_manager_or_above()
      OR EXISTS (SELECT 1 FROM public.prf p
                 WHERE p.id = prf_vendor_offers.prf_id AND p.created_by = auth.uid())
    )
  )
);

DROP POLICY IF EXISTS prf_vendor_offers_insert ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_insert ON public.prf_vendor_offers
FOR INSERT TO authenticated
WITH CHECK (
  is_super_admin() OR (
    company_id = get_user_company_id()
    AND has_role('procurement')
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.prf p
                WHERE p.id = prf_vendor_offers.prf_id AND p.acknowledged_by = auth.uid())
  )
);

DROP POLICY IF EXISTS prf_vendor_offers_update ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_update ON public.prf_vendor_offers
FOR UPDATE TO authenticated
USING (
  is_super_admin() OR (
    company_id = get_user_company_id() AND has_role('procurement')
    AND EXISTS (SELECT 1 FROM public.prf p
                WHERE p.id = prf_vendor_offers.prf_id AND p.acknowledged_by = auth.uid())
  )
)
WITH CHECK (
  is_super_admin() OR (
    company_id = get_user_company_id() AND has_role('procurement')
    AND EXISTS (SELECT 1 FROM public.prf p
                WHERE p.id = prf_vendor_offers.prf_id AND p.acknowledged_by = auth.uid())
  )
);

DROP POLICY IF EXISTS prf_vendor_offers_delete ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_delete ON public.prf_vendor_offers
FOR DELETE TO authenticated
USING (is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prf_vendor_offers TO authenticated;
