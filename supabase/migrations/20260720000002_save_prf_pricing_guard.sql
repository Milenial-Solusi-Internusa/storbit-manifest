-- 20260720000002_save_prf_pricing_guard.sql
-- Perbaiki gagal-diam pada save_prf_pricing: kalau p_items BUKAN NULL dan BUKAN jsonb array,
-- RAISE EXCEPTION dengan menyebut jsonb_typeof yang diterima — JANGAN dilewati diam-diam.
-- p_items NULL atau array kosong TETAP SAH (artinya "tidak ada rincian") — bukan error.
--
-- Selain guard baru itu, fungsi identik dengan 20260720000001: tetap SECURITY INVOKER,
-- tetap satu transaksi (UPDATE header -> guard ROW_COUNT=0 -> DELETE -> INSERT), NOL perubahan
-- policy RLS, semantik field sama. CREATE OR REPLACE juga men-deploy ulang versi yang benar.
-- JANGAN ubah 20260720000000 / 20260720000001; ini file terpisah.
--
-- Prasyarat: 20260720000000 (kolom+tabel+RLS) dan 20260720000001 (fungsi awal) sudah dijalankan.

CREATE OR REPLACE FUNCTION public.save_prf_pricing(p_prf_id uuid, p_header jsonb, p_items jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO 'public'
    AS $fn$
DECLARE v_count int;
BEGIN
  -- 1) Header jawaban harga (RLS prf_update_status: procurement + status='SUBMITTED').
  UPDATE public.prf SET
    suggested_rate = NULLIF(p_header->>'suggested_rate','')::numeric,
    rate_currency  = COALESCE(NULLIF(p_header->>'rate_currency',''), 'IDR'),
    valid_from     = NULLIF(p_header->>'valid_from','')::date,
    valid_until    = NULLIF(p_header->>'valid_until','')::date,
    pricing_notes  = NULLIF(p_header->>'pricing_notes',''),
    answered_by    = auth.uid(),
    answered_at    = now()
  WHERE id = p_prf_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'PRF tidak ditemukan atau tidak ada izin menyimpan jawaban harga (RLS).';
  END IF;

  -- Guard eksplisit: p_items wajib jsonb array (atau NULL). Non-array = RAISE, bukan skip senyap.
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'save_prf_pricing: p_items harus jsonb array (atau NULL), tetapi menerima jsonb_typeof = %', jsonb_typeof(p_items);
  END IF;

  -- 2) Replace rincian biaya (RLS prf_cost_items_delete + _insert: procurement + SUBMITTED).
  DELETE FROM public.prf_cost_items WHERE prf_id = p_prf_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.prf_cost_items (prf_id, component, cost_type, amount, currency, sort_order, notes)
    SELECT p_prf_id,
      it->>'component',
      CASE WHEN (it->>'cost_type') = 'internal' THEN 'internal' ELSE 'vendor' END,
      COALESCE(NULLIF(it->>'amount','')::numeric, 0),
      COALESCE(NULLIF(it->>'currency',''), 'IDR'),
      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
      NULLIF(it->>'notes','')
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  RETURN jsonb_build_object('ok', true, 'prf_id', p_prf_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.save_prf_pricing(uuid, jsonb, jsonb) TO authenticated;
