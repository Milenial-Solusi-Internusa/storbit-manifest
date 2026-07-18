-- ============================================================================
-- REKAMAN — BUKAN UNTUK DIJALANKAN LAGI
-- SQL ini SUDAH dieksekusi manual di Supabase SQL Editor pada 2026-07-18.
-- File ini hanya jejak/dokumentasi. Jangan jalankan ulang.
--
-- Entitas: SO (Sales Order) — dokumen perintah kerja Sales → Procurement.
-- Terverifikasi setelah eksekusi: tabel ada; 5 index (termasuk unique parsial
-- anti-dobel sales_orders_inquiry_unique_live WHERE deleted_at IS NULL);
-- RLS aktif; 4 policy (insert/select/update/delete); trigger updated_at;
-- GRANT authenticated (SELECT/INSERT/UPDATE/DELETE).
-- ============================================================================

-- 1) TABEL
CREATE TABLE IF NOT EXISTS public.sales_orders (
    id           uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id   uuid NOT NULL,
    so_no        text NOT NULL,
    status       character varying DEFAULT 'DRAFT'::character varying NOT NULL,
    inquiry_id   uuid NOT NULL,
    account_id   uuid NOT NULL,
    signed       boolean DEFAULT false NOT NULL,
    sign_link    text,
    signed_at    timestamp with time zone,
    created_by   uuid,
    updated_by   uuid,
    created_at   timestamp with time zone DEFAULT now(),
    updated_at   timestamp with time zone DEFAULT now(),
    deleted_at   timestamp with time zone,
    CONSTRAINT sales_orders_pkey PRIMARY KEY (id),
    CONSTRAINT sales_orders_status_check CHECK (((status)::text = ANY (ARRAY['DRAFT'::text, 'SENT'::text]))),
    CONSTRAINT sales_orders_no_unique UNIQUE (company_id, so_no),
    CONSTRAINT sales_orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT sales_orders_inquiry_id_fkey FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id),
    CONSTRAINT sales_orders_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
    CONSTRAINT sales_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
    CONSTRAINT sales_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id)
);

-- 2) ANTI-DOBEL: satu inquiry hanya SATU SO yang belum dihapus
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_inquiry_unique_live
    ON public.sales_orders USING btree (inquiry_id) WHERE (deleted_at IS NULL);

-- 3) INDEX pendukung
CREATE INDEX IF NOT EXISTS idx_sales_orders_account_id
    ON public.sales_orders USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_created
    ON public.sales_orders USING btree (company_id, created_at DESC);

-- 4) RLS
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_orders_insert ON public.sales_orders;
CREATE POLICY sales_orders_insert ON public.sales_orders
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_super_admin()
      OR ((company_id = public.get_user_company_id())
          AND (created_by = auth.uid())
          AND (public.has_role('sales'::text) OR public.has_role('gm_bd'::text)))
    );

DROP POLICY IF EXISTS sales_orders_select ON public.sales_orders;
CREATE POLICY sales_orders_select ON public.sales_orders
    FOR SELECT TO authenticated
    USING (
      public.is_super_admin()
      OR ((company_id = public.get_user_company_id())
          AND ((created_by = auth.uid())
               OR public.has_role('procurement'::text)
               OR public.is_manager_or_above()))
    );

DROP POLICY IF EXISTS sales_orders_update ON public.sales_orders;
CREATE POLICY sales_orders_update ON public.sales_orders
    FOR UPDATE TO authenticated
    USING (
      public.is_super_admin()
      OR ((deleted_at IS NULL)
          AND (company_id = public.get_user_company_id())
          AND (created_by = auth.uid()))
    )
    WITH CHECK (
      public.is_super_admin()
      OR ((company_id = public.get_user_company_id())
          AND (created_by = auth.uid()))
    );

DROP POLICY IF EXISTS sales_orders_delete ON public.sales_orders;
CREATE POLICY sales_orders_delete ON public.sales_orders
    FOR DELETE TO authenticated
    USING (
      public.is_super_admin()
      OR ((company_id = public.get_user_company_id())
          AND (created_by = auth.uid()))
    );

-- 5) GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_orders TO authenticated;

-- 6) updated_at otomatis
DROP TRIGGER IF EXISTS set_sales_orders_updated_at ON public.sales_orders;
CREATE TRIGGER set_sales_orders_updated_at
    BEFORE UPDATE ON public.sales_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
