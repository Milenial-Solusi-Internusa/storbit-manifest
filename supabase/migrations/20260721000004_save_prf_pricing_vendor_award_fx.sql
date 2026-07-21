-- Tahap B dari batch PRF multi vendor + currency.
-- REKAMAN: sudah dijalankan & terverifikasi live (satu overload, body utuh).
-- save_prf_pricing kini menulis vendor_id, item_group, is_awarded, exchange_rate
-- ke prf_cost_items, dan exchange_rates ke header prf.
-- Semua field baru dibaca TOLERAN (COALESCE / NULLIF), jadi UI lama yang tidak
-- mengirim field tersebut tetap menghasilkan perilaku identik seperti sebelumnya.
-- Guard baru: satu PRF hanya boleh punya satu vendor ter-award (RAISE, bukan skip senyap).

CREATE OR REPLACE FUNCTION public.save_prf_pricing(
  p_prf_id uuid, p_header jsonb, p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE
  v_count   int;
  v_vendors int;
BEGIN
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

  IF p_items IS NOT NULL THEN
    SELECT count(DISTINCT it->>'vendor_id') INTO v_vendors
    FROM jsonb_array_elements(p_items) AS it
    WHERE COALESCE(NULLIF(it->>'is_awarded','')::boolean, true) = true
      AND NULLIF(it->>'vendor_id','') IS NOT NULL;

    IF v_vendors > 1 THEN
      RAISE EXCEPTION 'save_prf_pricing: hanya boleh satu vendor pemenang per PRF, tetapi menerima % vendor ter-award.', v_vendors;
    END IF;
  END IF;

  DELETE FROM public.prf_cost_items WHERE prf_id = p_prf_id;

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
$fn$;
