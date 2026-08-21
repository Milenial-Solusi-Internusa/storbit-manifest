-- Fix darurat TD-180 P1: accounts, inquiries, prf, prf_cost_items,
-- prf_vendor_offers, vendors — semua masih pakai get_user_company_id()
-- singular, memblokir Dery & Camellia (procurement lintas MSI/JCI/SOA)
-- yang baru saja diberi akses lintas-company hari ini.
-- Status: LIVE — dijalankan manual & diverifikasi 21 Agu 2026 oleh Den
-- di Supabase SQL Editor, SEBELUM file ini ditulis (dicatat retroaktif
-- karena ditemukan darurat di tengah sesi, bukan direncanakan).

BEGIN;

-- === accounts ===
DROP POLICY IF EXISTS prospects_insert ON public.accounts;
CREATE POLICY prospects_insert ON public.accounts
FOR INSERT
WITH CHECK (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS prospects_read ON public.accounts;
CREATE POLICY prospects_read ON public.accounts
FOR SELECT
USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (has_role('operations'::text) AND ((account_status)::text = 'customer'::text)) OR has_role('procurement'::text))));

DROP POLICY IF EXISTS prospects_update ON public.accounts;
CREATE POLICY prospects_update ON public.accounts
FOR UPDATE
USING (((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR (assigned_to = auth.uid()) OR (created_by = auth.uid()))) OR is_super_admin());

-- === inquiries ===
DROP POLICY IF EXISTS inquiries_insert ON public.inquiries;
CREATE POLICY inquiries_insert ON public.inquiries
FOR INSERT
WITH CHECK (company_id IN (SELECT get_user_company_ids()));

DROP POLICY IF EXISTS inquiries_read ON public.inquiries;
CREATE POLICY inquiries_read ON public.inquiries
FOR SELECT
USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR (created_by = auth.uid()) OR (has_role('procurement'::text) AND (EXISTS ( SELECT 1 FROM prf p WHERE ((p.inquiry_id = inquiries.id) AND (p.company_id = inquiries.company_id) AND (p.deleted_at IS NULL))))))));

DROP POLICY IF EXISTS inquiries_update ON public.inquiries;
CREATE POLICY inquiries_update ON public.inquiries
FOR UPDATE
USING (((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR (created_by = auth.uid()))) OR is_super_admin())
WITH CHECK (((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR (created_by = auth.uid()))) OR is_super_admin());

-- === prf ===
DROP POLICY IF EXISTS prf_insert ON public.prf;
CREATE POLICY prf_insert ON public.prf
FOR INSERT
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (created_by = auth.uid()) AND (has_role('sales'::text) OR has_role('gm_bd'::text))));

DROP POLICY IF EXISTS prf_select ON public.prf;
CREATE POLICY prf_select ON public.prf
FOR SELECT
USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND ((created_by = auth.uid()) OR has_role('procurement'::text) OR is_manager_or_above())));

DROP POLICY IF EXISTS prf_update_draft ON public.prf;
CREATE POLICY prf_update_draft ON public.prf
FOR UPDATE
USING (is_super_admin() OR ((deleted_at IS NULL) AND (company_id IN (SELECT get_user_company_ids())) AND (created_by = auth.uid()) AND ((status)::text = 'DRAFT'::text)))
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (created_by = auth.uid())));

DROP POLICY IF EXISTS prf_update_status ON public.prf;
CREATE POLICY prf_update_status ON public.prf
FOR UPDATE
USING (is_super_admin() OR ((deleted_at IS NULL) AND (company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND ((status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text])) AND ((acknowledged_by IS NULL) OR (acknowledged_by = auth.uid()))))
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text)));

-- === prf_cost_items ===
DROP POLICY IF EXISTS prf_cost_items_delete ON public.prf_cost_items;
CREATE POLICY prf_cost_items_delete ON public.prf_cost_items
FOR DELETE
USING (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_cost_items.prf_id) AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text])) AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid())))))));

DROP POLICY IF EXISTS prf_cost_items_insert ON public.prf_cost_items;
CREATE POLICY prf_cost_items_insert ON public.prf_cost_items
FOR INSERT
WITH CHECK (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_cost_items.prf_id) AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text])) AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid())))))));

DROP POLICY IF EXISTS prf_cost_items_select ON public.prf_cost_items;
CREATE POLICY prf_cost_items_select ON public.prf_cost_items
FOR SELECT
USING (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_cost_items.prf_id) AND (is_super_admin() OR ((p.company_id IN (SELECT get_user_company_ids())) AND ((p.created_by = auth.uid()) OR has_role('procurement'::text) OR is_manager_or_above()))))));

DROP POLICY IF EXISTS prf_cost_items_update ON public.prf_cost_items;
CREATE POLICY prf_cost_items_update ON public.prf_cost_items
FOR UPDATE
USING (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_cost_items.prf_id) AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text])) AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid())))))))
WITH CHECK (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_cost_items.prf_id) AND (is_super_admin() OR ((p.deleted_at IS NULL) AND (p.company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND ((p.status)::text = ANY (ARRAY['SUBMITTED'::text, 'ACKNOWLEDGED'::text, 'QUOTED'::text])) AND ((p.acknowledged_by IS NULL) OR (p.acknowledged_by = auth.uid())))))));

-- === prf_vendor_offers ===
DROP POLICY IF EXISTS prf_vendor_offers_insert ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_insert ON public.prf_vendor_offers
FOR INSERT
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_vendor_offers.prf_id) AND (p.acknowledged_by = auth.uid()))))));

DROP POLICY IF EXISTS prf_vendor_offers_select ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_select ON public.prf_vendor_offers
FOR SELECT
USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (has_role('procurement'::text) OR is_manager_or_above() OR (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_vendor_offers.prf_id) AND (p.created_by = auth.uid())))))));

DROP POLICY IF EXISTS prf_vendor_offers_update ON public.prf_vendor_offers;
CREATE POLICY prf_vendor_offers_update ON public.prf_vendor_offers
FOR UPDATE
USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_vendor_offers.prf_id) AND (p.acknowledged_by = auth.uid()))))))
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND has_role('procurement'::text) AND (EXISTS ( SELECT 1 FROM prf p WHERE ((p.id = prf_vendor_offers.prf_id) AND (p.acknowledged_by = auth.uid()))))));

-- === vendors ===
DROP POLICY IF EXISTS vendors_insert ON public.vendors;
CREATE POLICY vendors_insert ON public.vendors
FOR INSERT
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR has_role('procurement'::text))));

DROP POLICY IF EXISTS vendors_select ON public.vendors;
CREATE POLICY vendors_select ON public.vendors
FOR SELECT
USING (is_super_admin() OR (company_id IN (SELECT get_user_company_ids())));

DROP POLICY IF EXISTS vendors_update ON public.vendors;
CREATE POLICY vendors_update ON public.vendors
FOR UPDATE
USING (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (deleted_at IS NULL) AND (is_manager_or_above() OR has_role('procurement'::text))))
WITH CHECK (is_super_admin() OR ((company_id IN (SELECT get_user_company_ids())) AND (is_manager_or_above() OR has_role('procurement'::text))));

COMMIT;
