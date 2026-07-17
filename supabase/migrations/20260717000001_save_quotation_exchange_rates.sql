-- ============================================================================
-- Quotation — RPC save_quotation memetakan quotations.exchange_rates
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-17.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- PRASYARAT: 20260717000000_quotations_exchange_rates.sql (kolom exchange_rates)
--   HARUS lebih dulu. Tanpa itu → error 'column "exchange_rates" does not exist'.
--
-- KONTEKS: jalur EDIT quotation menyimpan header lewat RPC ini, dan RPC-nya
--   memetakan p_header EKSPLISIT per-kolom. Kolom baru yang tidak ditambahkan ke
--   sini = kursnya TIDAK tersimpan saat edit (gagal diam-diam). Body di bawah
--   IDENTIK dengan versi sebelumnya; satu-satunya tambahan = baris `exchange_rates`
--   (ditandai komentar di dalam body). Perhatikan `->` (bukan `->>`) supaya nilainya
--   tetap jsonb.
--
-- Signature TIDAK berubah — (uuid, jsonb, jsonb) → replace in-place, tak ada
--   koeksistensi/ambiguitas overload; FE lama tetap jalan.
--
-- Dollar-quote BERNAMA ($fn$) dipakai, bukan $$ polos: body 76 baris rawan
--   ter-truncate/salah-parse saat disalin ke SQL Editor.
--
-- VERIFIKASI (saat eksekusi manual):
--   select pg_get_functiondef('public.save_quotation(uuid,jsonb,jsonb)'::regprocedure)
--          like '%exchange_rates%' as rpc_ok;
--   → Hasil: true  ✅
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_quotation(p_quotation_id uuid, p_header jsonb, p_items jsonb)
RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $fn$
DECLARE v_count int;
BEGIN
  UPDATE public.quotations SET
    quotation_no     = COALESCE(p_header->>'quotation_no', quotation_no),
    quote_date       = COALESCE(NULLIF(p_header->>'quote_date','')::date, quote_date),
    inquiry_id       = COALESCE(NULLIF(p_header->>'inquiry_id','')::uuid, inquiry_id),
    prospect_id      = COALESCE(NULLIF(p_header->>'prospect_id','')::uuid, prospect_id),
    customer_id      = COALESCE(NULLIF(p_header->>'customer_id','')::uuid, customer_id),
    service_type     = COALESCE(p_header->>'service_type', service_type),
    valid_until      = COALESCE(NULLIF(p_header->>'valid_until','')::date, valid_until),
    payment_terms_id = COALESCE(NULLIF(p_header->>'payment_terms_id','')::uuid, payment_terms_id),
    currency_code    = COALESCE(p_header->>'currency_code', currency_code),
    -- BARU: tabel kurs per-quotation (jsonb object map). '->' bukan '->>' agar tetap jsonb.
    exchange_rates   = CASE WHEN p_header ? 'exchange_rates' THEN p_header->'exchange_rates' ELSE exchange_rates END,
    notes            = CASE WHEN p_header ? 'notes'          THEN p_header->>'notes'          ELSE notes          END,
    terms            = CASE WHEN p_header ? 'terms'          THEN p_header->>'terms'          ELSE terms          END,
    internal_notes   = CASE WHEN p_header ? 'internal_notes' THEN p_header->>'internal_notes' ELSE internal_notes END,
    route            = CASE WHEN p_header ? 'route'          THEN p_header->>'route'          ELSE route          END,
    subtotal         = COALESCE(NULLIF(p_header->>'subtotal','')::numeric, subtotal),
    tax_amount       = COALESCE(NULLIF(p_header->>'tax_amount','')::numeric, tax_amount),
    total_amount     = COALESCE(NULLIF(p_header->>'total_amount','')::numeric, total_amount),
    vat_rate         = COALESCE(NULLIF(p_header->>'vat_rate','')::numeric, vat_rate),
    status           = COALESCE(p_header->>'status', status),
    usd_rate         = COALESCE(NULLIF(p_header->>'usd_rate','')::numeric, usd_rate),
    discount_pct     = COALESCE(NULLIF(p_header->>'discount_pct','')::numeric, discount_pct),
    margin_floor     = COALESCE(NULLIF(p_header->>'margin_floor','')::numeric, margin_floor),
    pricing_done_at  = COALESCE(NULLIF(p_header->>'pricing_done_at','')::timestamptz, pricing_done_at),
    attention_to     = CASE WHEN p_header ? 'attention_to'     THEN p_header->>'attention_to'     ELSE attention_to     END,
    pickup_address   = CASE WHEN p_header ? 'pickup_address'   THEN p_header->>'pickup_address'   ELSE pickup_address   END,
    delivery_address = CASE WHEN p_header ? 'delivery_address' THEN p_header->>'delivery_address' ELSE delivery_address END,
    cargo_mode       = CASE WHEN p_header ? 'cargo_mode'       THEN p_header->>'cargo_mode'       ELSE cargo_mode       END,
    gw               = CASE WHEN p_header ? 'gw'               THEN p_header->>'gw'               ELSE gw               END,
    dimension        = CASE WHEN p_header ? 'dimension'        THEN p_header->>'dimension'        ELSE dimension        END,
    cw               = CASE WHEN p_header ? 'cw'               THEN p_header->>'cw'               ELSE cw               END,
    cbm              = CASE WHEN p_header ? 'cbm'              THEN p_header->>'cbm'              ELSE cbm              END,
    container_type   = CASE WHEN p_header ? 'container_type'   THEN p_header->>'container_type'   ELSE container_type   END,
    container_qty    = CASE WHEN p_header ? 'container_qty'    THEN NULLIF(p_header->>'container_qty','')::int ELSE container_qty END,
    updated_at       = now(),
    updated_by       = auth.uid()
  WHERE id = p_quotation_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin edit (RLS).';
  END IF;

  DELETE FROM public.quotation_items WHERE quotation_id = p_quotation_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.quotation_items (
      quotation_id, sort_order, description, qty, unit, unit_price, notes,
      group_name, currency, unit_label, exchange_rate, total, cost_price,
      if_any
    )
    SELECT p_quotation_id,
      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
      it->>'description',
      NULLIF(it->>'qty','')::numeric,
      it->>'unit',
      NULLIF(it->>'unit_price','')::numeric,
      it->>'notes',
      it->>'group_name',
      it->>'currency',
      it->>'unit_label',
      NULLIF(it->>'exchange_rate','')::numeric,
      NULLIF(it->>'total','')::numeric,
      NULLIF(it->>'cost_price','')::numeric,
      COALESCE((it->>'if_any')::boolean, false)
    FROM jsonb_array_elements(p_items) AS it;
  END IF;

  RETURN jsonb_build_object('ok', true, 'quotation_id', p_quotation_id);
END;
$fn$;
