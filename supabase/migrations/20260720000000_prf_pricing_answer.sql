-- 20260720000000_prf_pricing_answer.sql
-- PRF pricing answer: kolom jawaban harga di `prf` + tabel anak rincian biaya `prf_cost_items`.
-- Non-destruktif, idempotent. REKAMAN dari SQL yang dijalankan manual di SQL Editor.
-- Tabel PRF = public.prf (terverifikasi schema_snapshot.sql).
--
-- RLS prf_cost_items DITURUNKAN dari policy prf yang ASLI (bukan dikarang):
--   - SELECT  <- prf_select        (siapa boleh baca PRF, boleh baca rinciannya)
--   - INSERT/UPDATE/DELETE <- prf_update_status USING (procurement + status='SUBMITTED' + company)
-- Predikat induk diterapkan via EXISTS ke public.prf (pola sama quotation_items/activity_logs).
-- Catatan: prf TIDAK punya DELETE policy sendiri; write anak sengaja diikat ke prf_update_status
-- (procurement + SUBMITTED), TIDAK dilonggarkan.

-- 1) Kolom jawaban harga di prf (semua nullable kecuali rate_currency)
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS suggested_rate numeric(18,2);
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS rate_currency  text NOT NULL DEFAULT 'IDR';
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS valid_from     date;
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS valid_until    date;
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS pricing_notes  text;
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS answered_by    uuid;
ALTER TABLE public.prf ADD COLUMN IF NOT EXISTS answered_at    timestamptz;

DO $prf_fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prf_answered_by_fkey') THEN
    ALTER TABLE public.prf ADD CONSTRAINT prf_answered_by_fkey
      FOREIGN KEY (answered_by) REFERENCES public.profiles(id);
  END IF;
END
$prf_fk$;

-- 2) Tabel anak rincian biaya
CREATE TABLE IF NOT EXISTS public.prf_cost_items (
  id         uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  prf_id     uuid NOT NULL REFERENCES public.prf(id) ON DELETE CASCADE,
  component  text NOT NULL,
  cost_type  text NOT NULL DEFAULT 'vendor',
  amount     numeric(18,2) NOT NULL DEFAULT 0,
  currency   text NOT NULL DEFAULT 'IDR',
  sort_order integer NOT NULL DEFAULT 0,
  notes      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT prf_cost_items_cost_type_check CHECK (cost_type IN ('vendor','internal'))
);

CREATE INDEX IF NOT EXISTS idx_prf_cost_items_prf_id ON public.prf_cost_items USING btree (prf_id);

-- updated_at trigger (pola sama set_prf_updated_at pada prf; fungsi set_updated_at sudah ada)
DROP TRIGGER IF EXISTS set_prf_cost_items_updated_at ON public.prf_cost_items;
CREATE TRIGGER set_prf_cost_items_updated_at BEFORE UPDATE ON public.prf_cost_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) RLS
ALTER TABLE public.prf_cost_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prf_cost_items_select ON public.prf_cost_items;
CREATE POLICY prf_cost_items_select ON public.prf_cost_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.prf p WHERE p.id = prf_cost_items.prf_id AND (
  public.is_super_admin() OR ((p.company_id = public.get_user_company_id())
    AND ((p.created_by = auth.uid()) OR public.has_role('procurement'::text) OR public.is_manager_or_above())))));

DROP POLICY IF EXISTS prf_cost_items_insert ON public.prf_cost_items;
CREATE POLICY prf_cost_items_insert ON public.prf_cost_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.prf p WHERE p.id = prf_cost_items.prf_id AND (
  public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id())
    AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))));

DROP POLICY IF EXISTS prf_cost_items_update ON public.prf_cost_items;
CREATE POLICY prf_cost_items_update ON public.prf_cost_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.prf p WHERE p.id = prf_cost_items.prf_id AND (
  public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id())
    AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))))
WITH CHECK (EXISTS (SELECT 1 FROM public.prf p WHERE p.id = prf_cost_items.prf_id AND (
  public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id())
    AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))));

DROP POLICY IF EXISTS prf_cost_items_delete ON public.prf_cost_items;
CREATE POLICY prf_cost_items_delete ON public.prf_cost_items FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.prf p WHERE p.id = prf_cost_items.prf_id AND (
  public.is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id = public.get_user_company_id())
    AND public.has_role('procurement'::text) AND ((p.status)::text = 'SUBMITTED'::text)))));

-- 4) GRANT (pola sama prf/sales_orders)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prf_cost_items TO authenticated;
