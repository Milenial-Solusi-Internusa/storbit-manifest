-- ARSIP — dijalankan manual di Supabase SQL Editor, 27 Jul 2026.
-- Menyelaraskan RLS tulis dengan model klaim (prf.acknowledged_by).
--
-- MASALAH YANG DIPERBAIKI: prf_update_status dan ketiga policy tulis
-- prf_cost_items memakai `status = 'SUBMITTED'` sebagai proksi "PRF sedang
-- dikerjakan". Setelah prf_claim() dibuat, PRF yang diklaim berubah jadi
-- ACKNOWLEDGED sehingga SELURUH jalur tulis mati — termasuk untuk modul
-- Penawaran Vendor yang baru.
--
-- POLA BARU: status IN ('SUBMITTED','ACKNOWLEDGED')
--            AND (acknowledged_by IS NULL OR acknowledged_by = auth.uid())
-- Backward compatible: PRF yang belum diklaim tetap bisa ditulis procurement
-- mana pun, persis seperti sebelumnya.
--
-- ⭐ CATATAN PENTING untuk pengembangan lanjutan: ketiga policy prf_cost_items
-- mencari induknya lewat prf_cost_items.prf_id, BUKAN offer_id. Baris biaya
-- yang dibuat modul Penawaran Vendor WAJIB tetap mengisi prf_id — kalau hanya
-- offer_id yang diisi, EXISTS tidak ketemu dan insert ditolak diam-diam.
-- Ini juga alasan prf_id TIDAK boleh dibuang di Fase 4 (alasan kedua: baris
-- biaya internal ber-vendor_id NULL memakai prf_id sebagai satu-satunya induk).

DROP POLICY IF EXISTS prf_update_status ON public.prf;

CREATE POLICY prf_update_status ON public.prf
FOR UPDATE TO authenticated
USING (
  is_super_admin() OR (
    deleted_at IS NULL
    AND company_id = get_user_company_id()
    AND has_role('procurement')
    AND status::text IN ('SUBMITTED','ACKNOWLEDGED')
    AND (acknowledged_by IS NULL OR acknowledged_by = auth.uid())
  )
)
WITH CHECK (
  is_super_admin() OR (
    company_id = get_user_company_id()
    AND has_role('procurement')
  )
);

DROP POLICY IF EXISTS prf_cost_items_insert ON public.prf_cost_items;

CREATE POLICY prf_cost_items_insert ON public.prf_cost_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
);

DROP POLICY IF EXISTS prf_cost_items_update ON public.prf_cost_items;

CREATE POLICY prf_cost_items_update ON public.prf_cost_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
);

DROP POLICY IF EXISTS prf_cost_items_delete ON public.prf_cost_items;

CREATE POLICY prf_cost_items_delete ON public.prf_cost_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM prf p
    WHERE p.id = prf_cost_items.prf_id
      AND (
        is_super_admin() OR (
          p.deleted_at IS NULL
          AND p.company_id = get_user_company_id()
          AND has_role('procurement')
          AND p.status::text IN ('SUBMITTED','ACKNOWLEDGED')
          AND (p.acknowledged_by IS NULL OR p.acknowledged_by = auth.uid())
        )
      )
  )
);

-- Patch save_prf_pricing: DELETE dibatasi ke baris warisan (offer_id NULL).
-- Tanpa ini, panel "Jawaban Harga" lama akan MENGHAPUS seluruh baris biaya
-- milik prf_vendor_offers secara diam-diam saat disimpan.
-- Terverifikasi 27 Jul 2026: setelah patch, 2 baris ber-offer_id pada
-- PRF/MSI/2026/VII/001 SELAMAT dari pemanggilan save_prf_pricing, sementara
-- baris warisannya terhapus seperti seharusnya.
-- Definisi di bawah diambil verbatim dari pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.save_prf_pricing(p_prf_id uuid, p_header jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count   int;
  v_vendors int;
BEGIN
  -- 1) Header jawaban harga (RLS prf_update_status: procurement + SUBMITTED/ACKNOWLEDGED).
  UPDATE public.prf SET
    suggested_rate = NULLIF(p_header->>'suggested_rate','')::numeric,
    rate_currency  = COALESCE(NULLIF(p_header->>'rate_currency',''), 'IDR'),
    valid_from     = NULLIF(p_header->>'valid_from','')::date,
    valid_until    = NULLIF(p_header->>'valid_until','')::date,
    pricing_notes  = NULLIF(p_header->>'pricing_notes',''),
    exchange_rates = COALESCE(p_header->'exchange_rates', exchange_rates),
    answered_by    = auth.uid(),
    answered_at    = now()
  WHERE id = p_prf_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PRF tidak ditemukan atau tidak ada izin menyimpan jawaban harga (RLS).';
  END IF;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'save_prf_pricing: p_items harus jsonb array (atau NULL), tetapi menerima jsonb_typeof = %', jsonb_typeof(p_items);
  END IF;

  -- Guard aturan bisnis: satu PRF hanya boleh punya SATU vendor pemenang.
  IF p_items IS NOT NULL THEN
    SELECT count(DISTINCT it->>'vendor_id') INTO v_vendors
    FROM jsonb_array_elements(p_items) AS it
    WHERE COALESCE(NULLIF(it->>'is_awarded','')::boolean, true) = true
      AND NULLIF(it->>'vendor_id','') IS NOT NULL;

    IF v_vendors > 1 THEN
      RAISE EXCEPTION 'save_prf_pricing: hanya boleh satu vendor pemenang per PRF, tetapi menerima % vendor ter-award.', v_vendors;
    END IF;
  END IF;

  -- 2) Replace rincian biaya WARISAN saja.
  -- ⭐ 27 Jul 2026: DELETE dibatasi ke baris ber-offer_id NULL. Tanpa syarat ini,
  -- panel "Jawaban Harga" lama akan MENGHAPUS seluruh baris biaya milik
  -- prf_vendor_offers (modul Penawaran Vendor) secara diam-diam.
  DELETE FROM public.prf_cost_items
  WHERE prf_id = p_prf_id AND offer_id IS NULL;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.prf_cost_items (
      prf_id, component, cost_type, amount, currency, sort_order, notes,
      vendor_id, item_group, is_awarded, exchange_rate
    )
    SELECT p_prf_id,
      it->>'component',
      CASE WHEN (it->>'cost_type') = 'internal' THEN 'internal' ELSE 'vendor' END,
      COALESCE(NULLIF(it->>'amount','')::numeric, 0),
      COALESCE(NULLIF(it->>'currency',''), 'IDR'),
      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
      NULLIF(it->>'notes',''),
      NULLIF(it->>'vendor_id','')::uuid,
      NULLIF(it->>'item_group',''),
      COALESCE(NULLIF(it->>'is_awarded','')::boolean, true),
      COALESCE(NULLIF(it->>'exchange_rate','')::numeric, 1)
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  RETURN jsonb_build_object('ok', true, 'prf_id', p_prf_id);
END;
$function$
