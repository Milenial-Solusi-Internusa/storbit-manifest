-- 20260720000001_save_prf_pricing_rpc.sql
-- RPC atomik untuk menyimpan jawaban harga PRF: header (kolom jawaban di prf) +
-- replace rincian biaya (prf_cost_items) DALAM SATU TRANSAKSI.
-- Menggantikan 3 request client terpisah (UPDATE + DELETE + INSERT) yang tidak atomik.
--
-- SECURITY INVOKER (BUKAN DEFINER): RLS tetap penegak. Fungsi ini TUNDUK pada policy
-- yang sudah diturunkan di 20260720000000 — prf_update_status (header) dan
-- prf_cost_items_* (rincian). Tidak melewati, tidak melonggarkan, tidak mengubah policy.
--
-- Prasyarat: jalankan 20260720000000_prf_pricing_answer.sql lebih dulu (kolom + tabel + RLS).
--
-- ATOMISITAS: fungsi plpgsql berjalan dalam satu transaksi tunggal. RAISE apa pun di
-- dalamnya (mis. RLS menolak INSERT, atau constraint gagal) membatalkan SELURUH transaksi —
-- termasuk UPDATE header dan DELETE rincian lama. Jadi bila insert rincian gagal:
--   (a) header TIDAK tersimpan, dan (b) rincian lama TIDAK hilang (DELETE ikut di-rollback).
-- Guard 0-row pada UPDATE header memblokir user tak-berwenang SEBELUM DELETE dijalankan.

CREATE OR REPLACE FUNCTION public.save_prf_pricing(p_prf_id uuid, p_header jsonb, p_items jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path TO 'public'
    AS $fn$
DECLARE v_count int;
BEGIN
  -- 1) Header jawaban harga (RLS prf_update_status: procurement + status='SUBMITTED').
  --    Semantik field sama persis dgn FE lama: kosong -> NULL, rate_currency default 'IDR',
  --    answered_by = user login (auth.uid()), answered_at = now(). updated_at diurus trigger.
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
