-- ============================================================================
-- MVP Storbit SP — FASE 0 (fondasi skema DB) — MIGRASI KONSOLIDASI (CATATAN)
-- ============================================================================
-- Branch: feat/sp-schema (dari restruktur-nexus). Tanggal eksekusi manual: 2026-07-06.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Struktur Fase 0 SUDAH LIVE di database (dijalankan manual per-TASK di Supabase
--    SQL Editor, sudah terverifikasi). File ini merakit SQL asli agar tercatat &
--    reproducible. TIDAK memakai guard idempotent (IF NOT EXISTS dll) — direkam apa adanya.
--
-- SUMBER SQL: histori sesi Claude Code (branch feat/sp-schema). Tidak ada file
--   scratch .sql maupun cuplikan SQL runnable di PROGRESS.md — seluruhnya dari histori sesi.
--   Query verifikasi (SELECT count/pg_policies/dsb) & query review/deteksi TIDAK disertakan
--   di sini (bukan DDL migrasi); hanya CREATE/ALTER/INSERT/POLICY/GRANT/RPC struktural.
--
-- Entitas SOA/Storbit company_id = d2e5e565-5f67-4954-b8d9-5979a2a0c697.
-- ============================================================================


-- ============================================================================
-- TASK DB 1 — Master DC (dc_master)  [KETEMU: histori sesi]
-- ============================================================================

-- 1a. Tabel + RLS + GRANT
CREATE TABLE public.dc_master (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  customer_id uuid REFERENCES public.accounts(id),          -- NULL = DC umum
  kode        text,
  nama        text NOT NULL,
  wilayah     text CHECK (wilayah IN ('Jawa','Sumatera','Sulawesi','Kalimantan','Bali & Nusa Tenggara','Lainnya')),
  alamat      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
  -- UNIQUE (customer_id, nama) SENGAJA DITUNDA ke TASK 6 (setelah cek duplikat)
);

ALTER TABLE public.dc_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY dc_master_read   ON public.dc_master FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());
CREATE POLICY dc_master_insert ON public.dc_master FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY dc_master_update ON public.dc_master FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY dc_master_delete ON public.dc_master FOR DELETE
  USING (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dc_master TO authenticated;

-- 1b. (review "SELECT DISTINCT dc" — query verifikasi, tidak disertakan di migrasi)

-- 1c. Seed 45 DC + mapping wilayah (36 Indomarco ter-mapping; 9 non-Indomarco → NULL)
WITH region_map(nama_up, wilayah) AS (VALUES
  ('DC JAKARTA 1','Jawa'),('DC JAKARTA 2','Jawa'),('DC PURWAKARTA','Jawa'),('DC SURABAYA','Jawa'),
  ('DC GRESIK','Jawa'),('DC KLATEN','Jawa'),('DC YOGYAKARTA','Jawa'),('DC MALANG','Jawa'),
  ('DC BEKASI','Jawa'),('DC CIREBON','Jawa'),('DC TANGERANG 1','Jawa'),('DC TANGERANG 2','Jawa'),
  ('DC BOGOR','Jawa'),('DC BOGOR 2','Jawa'),('DC BANDUNG','Jawa'),('DC BANDUNG II','Jawa'),
  ('DC JEMBER','Jawa'),('DC LEBAK','Jawa'),('DC SEMARANG','Jawa'),('DC PARUNG','Jawa'),('SATO CK ANCOL','Jawa'),
  ('DC PALOPO','Sulawesi'),('DC KENDARI','Sulawesi'),('DC MAKASAR','Sulawesi'),('DC MANADO','Sulawesi'),
  ('DC PONTIANAK','Kalimantan'),('DC BANJARMASIN','Kalimantan'),
  ('DC BENGKULU','Sumatera'),('DC MEDAN','Sumatera'),('DC PALEMBANG','Sumatera'),('DC BANDAR LAMPUNG','Sumatera'),
  ('DC PEKANBARU','Sumatera'),('DC BATAM','Sumatera'),('DC JAMBI','Sumatera'),
  ('DC LOMBOK','Bali & Nusa Tenggara'),('DC BALI','Bali & Nusa Tenggara')
)
INSERT INTO public.dc_master (company_id, customer_id, nama, wilayah)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid,
       s.customer_id,
       s.dc,
       rm.wilayah                                   -- NULL bila DC tak ada di mapping
FROM (SELECT DISTINCT customer_id, trim(dc) AS dc
      FROM public.sp_items WHERE coalesce(trim(dc),'') <> '') s
LEFT JOIN region_map rm ON rm.nama_up = upper(trim(s.dc));


-- ============================================================================
-- TASK DB 2 — sp_orders + sp_order_items (header/items)  [KETEMU: histori sesi]
-- ============================================================================

-- 2a. CREATE sp_orders + RLS + GRANT
CREATE TABLE public.sp_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id),
  customer_id    uuid NOT NULL REFERENCES public.accounts(id),
  sp_no          text NOT NULL,
  sp_date        date,
  dc_id          uuid REFERENCES public.dc_master(id),          -- NULLABLE dulu; NOT NULL di TASK 6
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                   'DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED','DIKIRIM',
                   'SAMPAI','BTB_TERBIT','TERKIRIM_PENUH','INVOICED','SUBMITTED','LUNAS','CANCELLED')),
  is_disputed    boolean NOT NULL DEFAULT false,
  dispute_reason text, disputed_at timestamptz, disputed_by uuid,
  expired_date   date,
  sp_category    text,
  external_url   text,
  notes          text,
  confirmed_at   timestamptz, confirmed_by uuid,
  cancelled_at   timestamptz, cancelled_by uuid, cancel_reason text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
  -- UNIQUE (customer_id, sp_no) DITUNDA ke TASK 6 (setelah dedupe)
);

ALTER TABLE public.sp_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY sp_orders_read   ON public.sp_orders FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());
CREATE POLICY sp_orders_insert ON public.sp_orders FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY sp_orders_update ON public.sp_orders FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY sp_orders_delete ON public.sp_orders FOR DELETE
  USING (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_orders TO authenticated;

-- 2b. CREATE sp_order_items + RLS + GRANT  (company_id denormal utk RLS)
CREATE TABLE public.sp_order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sp_order_id    uuid NOT NULL REFERENCES public.sp_orders(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id),   -- denormal utk RLS
  product_id     uuid REFERENCES public.products(id),             -- FK; NULLABLE dulu (NOT NULL di TASK 6)
  product_name   text NOT NULL DEFAULT '',
  sku            text NOT NULL DEFAULT '',
  qty            integer NOT NULL DEFAULT 0 CHECK (qty >= 1),
  shipped_qty    integer NOT NULL DEFAULT 0 CHECK (shipped_qty >= 0 AND shipped_qty <= qty),
  unit_price     numeric(18,2) NOT NULL DEFAULT 0,                 -- SNAPSHOT
  price_category text CHECK (price_category IN ('semester','tahunan','project')),  -- NULL utk legacy
  shipping_price numeric(18,2) NOT NULL DEFAULT 0,
  sla_days       integer,
  estimated_delivery_date date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sp_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY sp_order_items_read   ON public.sp_order_items FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());
CREATE POLICY sp_order_items_insert ON public.sp_order_items FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY sp_order_items_update ON public.sp_order_items FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY sp_order_items_delete ON public.sp_order_items FOR DELETE
  USING (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_order_items TO authenticated;


-- ============================================================================
-- TASK DB 3 — 3 kategori harga produk + perluasan RPC  [KETEMU: histori sesi]
-- ============================================================================

-- 3A-1. 3 kolom harga kategori (nullable; default_price LAMA tidak disentuh)
ALTER TABLE public.products
  ADD COLUMN price_semester numeric(18,2),
  ADD COLUMN price_tahunan  numeric(18,2),
  ADD COLUMN price_project  numeric(18,2);

-- 3A-2. tag kategori di riwayat harga
ALTER TABLE public.product_price_history
  ADD COLUMN price_category text;   -- 'default' | 'semester' | 'tahunan' | 'project'

-- 3B. Perluasan RPC bulk_update_product_prices
-- Sumber: pg_get_functiondef live (byte-exact), diverifikasi 6 Jul 2026.
CREATE OR REPLACE FUNCTION public.bulk_update_product_prices(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row jsonb; v_product_id uuid; v_new_price numeric; v_category text;
  v_contract text; v_valid_until date; v_current numeric; v_company uuid; v_history_id uuid;
  v_updated int := 0; v_skipped int := 0; v_results jsonb := '[]'::jsonb;
begin
  if not is_super_admin() then
    raise exception 'Tidak diizinkan: hanya super_admin yang boleh bulk update harga';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_product_id  := (v_row->>'product_id')::uuid;
    v_new_price   := (v_row->>'new_price')::numeric;
    v_category    := coalesce(nullif(v_row->>'category',''), 'default');
    v_contract    := nullif(v_row->>'contract_no', '');
    v_valid_until := nullif(v_row->>'valid_until', '')::date;
    if v_product_id is null or v_new_price is null or v_new_price < 0 then
      raise exception 'Baris tidak valid (product_id/new_price kosong atau negatif): %', v_row;
    end if;
    if v_category not in ('default','semester','tahunan','project') then
      raise exception 'Kategori harga tidak valid: %', v_category;
    end if;
    select company_id,
           case v_category
             when 'semester' then price_semester
             when 'tahunan'  then price_tahunan
             when 'project'  then price_project
             else default_price
           end
      into v_company, v_current
      from products where id = v_product_id;
    if not found then
      raise exception 'Produk tidak ditemukan: %', v_product_id;
    end if;
    if v_current is distinct from v_new_price then
      if v_category = 'default' then
        update products set default_price = v_new_price where id = v_product_id;
        if v_contract is not null then
          select id into v_history_id from product_price_history
            where product_id = v_product_id order by changed_at desc limit 1;
          perform attach_price_contract_info(v_history_id, v_contract, current_date, v_valid_until);
        end if;
      else
        if v_category = 'semester' then
          update products set price_semester = v_new_price where id = v_product_id;
        elsif v_category = 'tahunan' then
          update products set price_tahunan = v_new_price where id = v_product_id;
        else
          update products set price_project = v_new_price where id = v_product_id;
        end if;
        insert into product_price_history
          (product_id, company_id, old_price, new_price, changed_by, source, price_category, contract_no, valid_from, valid_until)
        values
          (v_product_id, v_company, v_current, v_new_price, auth.uid(), 'bulk_category', v_category, v_contract, current_date, v_valid_until);
      end if;
      v_updated := v_updated + 1;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product_id, 'category', v_category, 'status', 'updated',
        'old_price', v_current, 'new_price', v_new_price);
    else
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'product_id', v_product_id, 'category', v_category, 'status', 'skipped_same_price');
    end if;
  end loop;
  return jsonb_build_object('updated', v_updated, 'skipped', v_skipped, 'rows', v_results);
end;
$function$


-- ============================================================================
-- TASK DB 4 — Backfill header/items dari sp_items (438 / 723)  [KETEMU: histori sesi]
-- ============================================================================

-- 4a. Backfill HEADER (sp_orders) — DISTINCT ON (customer_id, sp_no), deterministik
INSERT INTO public.sp_orders
  (company_id, customer_id, sp_no, sp_date, dc_id, status, expired_date, sp_category, external_url, notes,
   confirmed_at, confirmed_by, cancelled_at, cancelled_by, cancel_reason, created_at)
SELECT
  'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid,
  h.customer_id, h.sp_no, h.sp_date,
  dm.id,                                    -- dc_id (NULL bila dc kosong / tak match)
  CASE h.sp_status WHEN 'confirmed' THEN 'CONFIRMED'
                   WHEN 'cancelled' THEN 'CANCELLED'
                   ELSE 'DRAFT' END,        -- map dasar, TANPA recompute lanjut (keputusan D5)
  h.expired_date, h.sp_category, h.external_url, h.notes,
  h.confirmed_at, h.confirmed_by, h.cancelled_at, h.cancelled_by, h.cancel_reason,
  COALESCE(h.created_at, now())
FROM (
  SELECT DISTINCT ON (customer_id, sp_no)
    customer_id, sp_no, sp_date, trim(dc) AS dc, sp_status, expired_date, sp_category, external_url, notes,
    confirmed_at, confirmed_by, cancelled_at, cancelled_by, cancel_reason, created_at
  FROM public.sp_items
  ORDER BY customer_id, sp_no, created_at NULLS LAST, ctid   -- "baris pertama" deterministik
) h
LEFT JOIN public.dc_master dm
  ON dm.customer_id = h.customer_id AND dm.nama = h.dc;       -- dc -> dc_id

-- 4b-0. kolom sementara utk pemetaan lama->baru (di-drop di fase akhir; JANGAN sekarang)
ALTER TABLE public.sp_order_items ADD COLUMN legacy_sp_item_id uuid;

-- 4b-1. Backfill ITEM (sp_order_items) — PRESERVE apa adanya; price_category NULL (legacy)
INSERT INTO public.sp_order_items
  (sp_order_id, company_id, product_id, product_name, sku, qty, shipped_qty, unit_price, price_category,
   shipping_price, sla_days, estimated_delivery_date, notes, legacy_sp_item_id, created_at)
SELECT
  o.id, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid,
  si.product_id, si.product_name, si.sku, si.qty, si.shipped_qty, si.unit_price, NULL,
  si.shipping_price, si.sla_days, si.estimated_delivery_date, si.notes,
  si.id,                                   -- legacy_sp_item_id -> utk TASK 5
  COALESCE(si.created_at, now())
FROM public.sp_items si
JOIN public.sp_orders o
  ON o.customer_id = si.customer_id AND o.sp_no = si.sp_no;


-- ============================================================================
-- TASK DB 5 — Repoint FK gudang + sp_btb (D3)  [KETEMU: histori sesi]
-- ============================================================================

-- 5a. Tambah kolom FK baru (nullable, aditif). Kolom lama TIDAK di-drop.
ALTER TABLE public.picking_lists       ADD COLUMN sp_order_id      uuid REFERENCES public.sp_orders(id);
ALTER TABLE public.delivery_notes      ADD COLUMN sp_order_id      uuid REFERENCES public.sp_orders(id);
ALTER TABLE public.delivery_note_items ADD COLUMN sp_order_item_id uuid REFERENCES public.sp_order_items(id) ON DELETE SET NULL;

-- 5b. Backfill FK gudang (guard anti-ambigu)
-- (1) picking_lists -> sp_orders (via sp_no; hanya sp_no PADANAN TUNGGAL — picking_lists tak punya customer_id)
UPDATE public.picking_lists p SET sp_order_id = o.id
FROM public.sp_orders o
WHERE o.sp_no = p.sp_no
  AND (SELECT count(*) FROM public.sp_orders o2 WHERE o2.sp_no = p.sp_no) = 1;

-- (2) delivery_notes -> sp_orders (via customer_id + sp_no; unambiguous)
UPDATE public.delivery_notes d SET sp_order_id = o.id
FROM public.sp_orders o
WHERE o.customer_id = d.customer_id AND o.sp_no = d.sp_no;
-- fallback utk delivery_notes yang customer_id-nya NULL (pakai sp_no tunggal)
UPDATE public.delivery_notes d SET sp_order_id = o.id
FROM public.sp_orders o
WHERE d.sp_order_id IS NULL AND d.customer_id IS NULL AND o.sp_no = d.sp_no
  AND (SELECT count(*) FROM public.sp_orders o2 WHERE o2.sp_no = d.sp_no) = 1;

-- (3) delivery_note_items -> sp_order_items (via picking_list_items.sp_item_id -> legacy_sp_item_id)
UPDATE public.delivery_note_items dni SET sp_order_item_id = oi.id
FROM public.picking_list_items pli
JOIN public.sp_order_items oi ON oi.legacy_sp_item_id = pli.sp_item_id
WHERE dni.picking_list_item_id = pli.id;

-- 5c. CREATE sp_btb + RLS + GRANT (sp_btbs lama tetap utuh)
CREATE TABLE public.sp_btb (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id),
  sp_order_id      uuid NOT NULL REFERENCES public.sp_orders(id),
  delivery_note_id uuid REFERENCES public.delivery_notes(id),   -- NULL utk data historis
  customer_id      uuid NOT NULL REFERENCES public.accounts(id),
  btb_no           text NOT NULL,
  btb_date         date,
  qty              integer CHECK (qty IS NULL OR qty >= 0),      -- NULL utk historis
  received_at      timestamptz, received_by uuid,
  remarks          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
  -- UNIQUE (customer_id, btb_no) DITUNDA ke TASK 6
);

ALTER TABLE public.sp_btb ENABLE ROW LEVEL SECURITY;

CREATE POLICY sp_btb_read   ON public.sp_btb FOR SELECT
  USING (public.is_super_admin() OR company_id = public.get_user_company_id());
CREATE POLICY sp_btb_insert ON public.sp_btb FOR INSERT
  WITH CHECK (public.is_super_admin() OR (company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY sp_btb_update ON public.sp_btb FOR UPDATE
  USING (public.is_super_admin() OR (company_id = public.get_user_company_id()
         AND (public.is_manager_or_above() OR public.has_role('operations'))));
CREATE POLICY sp_btb_delete ON public.sp_btb FOR DELETE
  USING (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_btb TO authenticated;

-- Backfill sp_btb dari sp_btbs (hanya sp_no PADANAN TUNGGAL; qty=NULL historis)
INSERT INTO public.sp_btb (company_id, sp_order_id, customer_id, btb_no, remarks, created_at)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid, o.id, o.customer_id, b.btb_no, b.remarks, COALESCE(b.created_at, now())
FROM public.sp_btbs b
JOIN public.sp_orders o ON o.sp_no = b.sp_no
WHERE (SELECT count(*) FROM public.sp_orders o2 WHERE o2.sp_no = b.sp_no) = 1;
-- CATATAN: 1 baris sp_btb (BTB 2049904, salah-input, dikonfirmasi Gigih) DIHAPUS MANUAL
--   di luar migrasi setelah backfill → sp_btb final = 186 (sp_btbs lama tetap 187).


-- ============================================================================
-- TASK DB 6 — Constraint final  [KETEMU: histori sesi]
-- ============================================================================
-- Catatan: CHECK status (12-tahap), qty>=1, shipped<=qty, price_category, sp_btb.qty>=0
--   didefinisikan INLINE di CREATE TABLE (TASK DB 2 & 5) — tak ada statement CHECK terpisah
--   di TASK 6. TASK 6 = 2 UNIQUE + 2 NOT NULL (dijalankan setelah 6a dedupe-check BERSIH & 6b NOT NULL=0).

ALTER TABLE public.sp_orders      ADD CONSTRAINT sp_orders_no_unique UNIQUE (customer_id, sp_no);
ALTER TABLE public.sp_btb         ADD CONSTRAINT sp_btb_no_unique    UNIQUE (customer_id, btb_no);
ALTER TABLE public.sp_orders      ALTER COLUMN dc_id      SET NOT NULL;
ALTER TABLE public.sp_order_items ALTER COLUMN product_id SET NOT NULL;

-- ============================================================================
-- AKHIR FASE 0. Verifikasi akhir (dijalankan terpisah, tidak disertakan):
--   sp_orders=438, sp_order_items=723, sp_btb=186, dc_master=45; sp_items=723, sp_btbs=187 (utuh).
-- ============================================================================
