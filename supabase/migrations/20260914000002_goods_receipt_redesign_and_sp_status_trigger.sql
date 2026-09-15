-- =====================================================================
-- Migration : 20260914000002_goods_receipt_redesign_and_sp_status_trigger
-- Status    : LIVE DI STAGING (14 Sep 2026) — BELUM DIJALANKAN DI PRODUCTION
-- Tujuan    :
--   1. Ganti jalur simpan Penerimaan Barang dari insert langsung ke
--      stock_ledger (tanpa RPC, tanpa dokumen header) jadi dua lapis:
--      goods_receipts (header) + goods_receipt_items (baris), lewat
--      satu RPC create_goods_receipt() yang mengecek role.
--   2. Tambah void_goods_receipt() sebagai jalan koreksi resmi
--      (baris pembalik, bukan hapus/UPDATE langsung).
--   3. Tambah trigger di stock_ledger yang menghitung ulang status SP
--      Storbit yang kepengaruh kapan pun ada pergerakan stok baru,
--      dari sumber mana pun (Goods Receipt, Transfer, Opname nanti,
--      atau SP lain yang mengambil stok yang sama).
--   4. create_goods_receipt() mewajibkan vendor untuk tipe
--      purchase_order/restock_produksi (ditambal 15 Sep, sudah
--      digabung ke definisi fungsi di bawah -- bukan patch terpisah).
--   5. Cabut TRUNCATE/REFERENCES/TRIGGER dari authenticated di dua
--      tabel baru ini (default privileges di database ini otomatis
--      menempelkan tiga privilege itu ke tabel baru manapun -- lihat
--      Keputusan Terbuka terpisah soal audit tabel lain, TIDAK di
--      migration ini).
--
-- Referensi schema saat ini: schema_snapshot.sql (potret 11 Sep 2026)
-- Konvensi ACL: REVOKE ALL FROM PUBLIC lalu GRANT eksplisit ke authenticated
-- (SQL Editor tidak otomatis GRANT tabel/fungsi baru).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TABEL BARU: goods_receipts (header dokumen penerimaan)
-- ---------------------------------------------------------------------
CREATE TABLE public.goods_receipts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    company_id uuid NOT NULL,
    reference_no character varying(50) NOT NULL,
    receipt_date date NOT NULL,
    warehouse_id uuid NOT NULL,
    receipt_type character varying(20) NOT NULL,
    vendor_id uuid,
    po_number character varying(50),
    notes text,
    status character varying(10) NOT NULL DEFAULT 'posted',
    voided_at timestamp with time zone,
    voided_by uuid,
    void_reason text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goods_receipts_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT goods_receipts_warehouse_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id),
    CONSTRAINT goods_receipts_vendor_fk FOREIGN KEY (vendor_id) REFERENCES public.vendors(id),
    CONSTRAINT goods_receipts_type_check CHECK (
        (receipt_type)::text = ANY (ARRAY['purchase_order','restock_produksi','transfer_masuk','adjustment'])
    ),
    CONSTRAINT goods_receipts_status_check CHECK (
        (status)::text = ANY (ARRAY['posted','void'])
    )
);

CREATE INDEX idx_goods_receipts_company_date ON public.goods_receipts (company_id, receipt_date);
CREATE INDEX idx_goods_receipts_reference_no ON public.goods_receipts (company_id, reference_no);

ALTER TABLE public.goods_receipts OWNER TO postgres;

-- ---------------------------------------------------------------------
-- 2. TABEL BARU: goods_receipt_items (baris barang per dokumen)
-- ---------------------------------------------------------------------
CREATE TABLE public.goods_receipt_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    goods_receipt_id uuid NOT NULL,
    product_id uuid NOT NULL,
    qty integer NOT NULL,
    unit_cost numeric(15,2),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goods_receipt_items_receipt_fk FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
    CONSTRAINT goods_receipt_items_product_fk FOREIGN KEY (product_id) REFERENCES public.products(id),
    CONSTRAINT goods_receipt_items_qty_check CHECK (qty > 0)
);

CREATE INDEX idx_goods_receipt_items_receipt ON public.goods_receipt_items (goods_receipt_id);

ALTER TABLE public.goods_receipt_items OWNER TO postgres;

-- ---------------------------------------------------------------------
-- 3. RLS + GRANT untuk kedua tabel baru
--    Pola disamakan persis dengan sp_btb (dokumen serupa: header
--    transaksi gudang, scoped per company, insert oleh operations
--    atau manager ke atas). Sengaja TIDAK ada UPDATE policy untuk
--    authenticated -- perubahan cuma boleh lewat void_goods_receipt().
-- ---------------------------------------------------------------------
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.goods_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.goods_receipt_items FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.goods_receipts TO authenticated;
GRANT SELECT, INSERT ON TABLE public.goods_receipt_items TO authenticated;
GRANT ALL ON TABLE public.goods_receipts TO service_role;
GRANT ALL ON TABLE public.goods_receipt_items TO service_role;

-- Database ini punya default privileges yang otomatis nempelkan
-- TRUNCATE/REFERENCES/TRIGGER ke authenticated di tabel baru manapun.
-- TRUNCATE khususnya berbahaya (bisa ngosongin tabel penuh, tidak
-- kena RLS). Dicabut eksplisit di sini supaya dua tabel baru ini
-- tidak ikut kebawa. Ini TIDAK membereskan tabel lama lain yang
-- mungkin sudah kena hal sama -- itu diaudit & dibereskan terpisah.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.goods_receipts FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.goods_receipt_items FROM authenticated;

CREATE POLICY goods_receipts_read ON public.goods_receipts
    FOR SELECT USING (
        public.is_super_admin() OR (company_id = public.get_user_company_id())
    );

CREATE POLICY goods_receipts_insert ON public.goods_receipts
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR (
            company_id = public.get_user_company_id()
            AND (public.is_manager_or_above() OR public.has_role('operations'::text))
        )
    );

CREATE POLICY goods_receipts_delete ON public.goods_receipts
    FOR DELETE USING (public.is_super_admin());

CREATE POLICY goods_receipt_items_read ON public.goods_receipt_items
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_items.goods_receipt_id
              AND gr.company_id = public.get_user_company_id()
        )
    );

CREATE POLICY goods_receipt_items_insert ON public.goods_receipt_items
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_items.goods_receipt_id
              AND gr.company_id = public.get_user_company_id()
              AND (public.is_manager_or_above() OR public.has_role('operations'::text))
        )
    );

CREATE POLICY goods_receipt_items_delete ON public.goods_receipt_items
    FOR DELETE USING (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 4. RPC: create_goods_receipt
--    Satu-satunya pintu resmi bikin dokumen penerimaan. Menulis header,
--    baris, DAN turunan ke stock_ledger dalam satu transaksi. Movement
--    type dipetakan dengan benar per tipe (tidak collapse jadi 'ADJ'
--    generik seperti versi lama), dan reference_id akhirnya kepakai
--    (dulu selalu NULL).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.create_goods_receipt(
    p_reference_no character varying,
    p_receipt_date date,
    p_warehouse_id uuid,
    p_receipt_type character varying,
    p_vendor_id uuid,
    p_po_number character varying,
    p_notes text,
    p_items jsonb
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
    v_company_id uuid;
    v_receipt_id uuid;
    v_movement_type character varying;
    v_item jsonb;
    v_qty int;
    v_product_id uuid;
BEGIN
    SELECT company_id INTO v_company_id FROM public.warehouses WHERE id = p_warehouse_id;
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Gudang tujuan tidak ditemukan';
    END IF;

    IF NOT (
        public.is_super_admin()
        OR (
            v_company_id = public.get_user_company_id()
            AND (public.is_manager_or_above() OR public.has_role('operations'::text))
        )
    ) THEN
        RAISE EXCEPTION 'Tidak punya akses membuat penerimaan barang untuk entitas ini';
    END IF;

    IF p_reference_no IS NULL OR btrim(p_reference_no) = '' THEN
        RAISE EXCEPTION 'Nomor referensi wajib diisi';
    END IF;
    IF length(p_reference_no) > 50 THEN
        RAISE EXCEPTION 'Nomor referensi maksimal 50 karakter';
    END IF;
    IF p_receipt_date IS NULL THEN
        RAISE EXCEPTION 'Tanggal penerimaan wajib diisi';
    END IF;
    IF p_receipt_type NOT IN ('purchase_order','restock_produksi','transfer_masuk','adjustment') THEN
        RAISE EXCEPTION 'Tipe penerimaan tidak valid: %', p_receipt_type;
    END IF;
    IF p_receipt_type IN ('purchase_order','restock_produksi') AND p_vendor_id IS NULL THEN
        RAISE EXCEPTION 'Vendor wajib diisi untuk tipe penerimaan %', p_receipt_type;
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Minimal satu baris barang (produk + qty) wajib diisi';
    END IF;

    v_movement_type := CASE p_receipt_type
        WHEN 'transfer_masuk' THEN 'transfer_in'
        WHEN 'adjustment' THEN 'adjustment'
        ELSE 'inbound'
    END;

    INSERT INTO public.goods_receipts (
        company_id, reference_no, receipt_date, warehouse_id, receipt_type,
        vendor_id, po_number, notes, created_by
    ) VALUES (
        v_company_id, btrim(p_reference_no), p_receipt_date, p_warehouse_id, p_receipt_type,
        p_vendor_id, p_po_number, p_notes, auth.uid()
    ) RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := NULLIF(v_item->>'qty','')::int;
        v_product_id := NULLIF(v_item->>'product_id','')::uuid;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Setiap baris wajib punya produk yang valid';
        END IF;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Qty setiap baris wajib bilangan bulat lebih dari 0 (produk %)', v_product_id;
        END IF;

        INSERT INTO public.goods_receipt_items (
            goods_receipt_id, product_id, qty, unit_cost, notes
        ) VALUES (
            v_receipt_id, v_product_id, v_qty,
            NULLIF(v_item->>'unit_cost','')::numeric,
            v_item->>'notes'
        );

        INSERT INTO public.stock_ledger (
            company_id, warehouse_id, product_id, movement_type, qty,
            reference_type, reference_id, reference_no, notes, created_by
        ) VALUES (
            v_company_id, p_warehouse_id, v_product_id, v_movement_type, v_qty,
            'goods_receipt', v_receipt_id, btrim(p_reference_no),
            COALESCE(v_item->>'notes', p_notes), auth.uid()
        );
    END LOOP;

    RETURN v_receipt_id;
END;
$fn$;

ALTER FUNCTION public.create_goods_receipt(character varying, date, uuid, character varying, uuid, character varying, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_goods_receipt(character varying, date, uuid, character varying, uuid, character varying, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_goods_receipt(character varying, date, uuid, character varying, uuid, character varying, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC: void_goods_receipt
--    Jalan koreksi resmi. Menulis baris pembalik ke stock_ledger
--    (bukan hapus/UPDATE qty), jejaknya tetap ada. Dibatasi supervisor
--    ke atas (is_manager_or_above sudah termasuk supervisor), BUKAN
--    dibuka juga untuk role 'operations' biasa seperti saat create.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.void_goods_receipt(
    p_id uuid,
    p_reason text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
    v_receipt public.goods_receipts;
    v_item public.goods_receipt_items;
    v_reverse_type character varying;
BEGIN
    SELECT * INTO v_receipt FROM public.goods_receipts WHERE id = p_id;
    IF v_receipt.id IS NULL THEN
        RAISE EXCEPTION 'Dokumen penerimaan tidak ditemukan';
    END IF;
    IF v_receipt.status = 'void' THEN
        RAISE EXCEPTION 'Dokumen ini sudah dibatalkan sebelumnya';
    END IF;
    IF NOT (
        public.is_super_admin()
        OR (v_receipt.company_id = public.get_user_company_id() AND public.is_manager_or_above())
    ) THEN
        RAISE EXCEPTION 'Tidak punya akses membatalkan penerimaan barang ini';
    END IF;
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'Alasan pembatalan wajib diisi';
    END IF;

    v_reverse_type := CASE v_receipt.receipt_type
        WHEN 'transfer_masuk' THEN 'transfer_out'
        ELSE 'outbound'
    END;

    FOR v_item IN SELECT * FROM public.goods_receipt_items WHERE goods_receipt_id = p_id
    LOOP
        INSERT INTO public.stock_ledger (
            company_id, warehouse_id, product_id, movement_type, qty,
            reference_type, reference_id, reference_no, notes, created_by
        ) VALUES (
            v_receipt.company_id, v_receipt.warehouse_id, v_item.product_id,
            v_reverse_type, -abs(v_item.qty),
            'goods_receipt_void', p_id, v_receipt.reference_no,
            'Pembatalan: ' || p_reason, auth.uid()
        );
    END LOOP;

    UPDATE public.goods_receipts
    SET status = 'void', voided_at = now(), voided_by = auth.uid(),
        void_reason = p_reason, updated_at = now()
    WHERE id = p_id;
END;
$fn$;

ALTER FUNCTION public.void_goods_receipt(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.void_goods_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_goods_receipt(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. TRIGGER: hitung ulang status SP begitu ada pergerakan stok baru
--    dari sumber mana pun (Goods Receipt, SP lain yang ambil stok
--    sama, dan nanti Transfer/Opname). Menutup celah "status SP
--    nyangkut CONFIRMED walau stok sudah berubah di tempat lain".
-- ---------------------------------------------------------------------
CREATE FUNCTION public.trg_stock_ledger_recompute_sp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT si.customer_id, si.sp_no
        FROM public.sp_items si
        JOIN public.sp_orders so
          ON so.customer_id = si.customer_id
         AND so.sp_no = si.sp_no
         AND so.deleted_at IS NULL
        WHERE si.product_id = NEW.product_id
          AND si.sp_status = 'confirmed'
          AND so.status NOT IN ('CANCELLED','LUNAS')
    LOOP
        PERFORM public.sp_recompute_status(r.customer_id, r.sp_no);
    END LOOP;
    RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.trg_stock_ledger_recompute_sp() OWNER TO postgres;

CREATE TRIGGER trg_stock_ledger_recompute_sp
    AFTER INSERT ON public.stock_ledger
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_stock_ledger_recompute_sp();

COMMIT;

-- =====================================================================
-- LANGKAH TERPISAH -- JANGAN DIJALANKAN DI SESI YANG SAMA
--
-- Baris di bawah ini MENUTUP jalur insert langsung ke stock_ledger dari
-- client (yang selama ini dipakai Penerimaan Barang tanpa RPC). Ini
-- baru boleh dijalankan SETELAH:
--   1. PenerimaanBarangPage.jsx sudah diubah CC untuk memanggil RPC
--      create_goods_receipt(), bukan insert langsung.
--   2. CC sudah konfirmasi lewat grep bahwa TIDAK ADA halaman lain di
--      src/ yang masih melakukan .from('stock_ledger').insert(...)
--      secara langsung dari client.
-- Kalau langkah di atas belum kelar dan baris ini dijalankan duluan,
-- Penerimaan Barang versi lama (yang belum diganti) akan langsung
-- error / berhenti bisa dipakai sama sekali.
--
-- REVOKE INSERT ON TABLE public.stock_ledger FROM authenticated;
-- =====================================================================
