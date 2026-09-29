-- =====================================================================
-- Koreksi harga Pengait POP A6, Tahap 5
-- Tanggal : 28 Sep 2026
-- Status  : LIVE (dijalankan di produksi 28 Sep 2026, terverifikasi)
-- Dasar   : SP asli 2234621 (9 Jul 2026) harga 6.338, sama dengan harga semester di master
-- Cakupan :
--   1. Item SP 2234621: harga 3.900 -> 6.338 (dua tabel), invoice SOA-INV-VIII-2026-0007
--      dihitung ulang (649.350 -> 1.055.277) + satu jurnal penyesuaian. Belum ada pembayaran.
--   2. Master Product Pengait POP A6: harga default 3.900 -> 6.338
-- =====================================================================
BEGIN;

CREATE TABLE public.backfill_tahap5_20260928 (
  objek      text PRIMARY KEY,
  record_id  uuid NOT NULL,
  nilai_lama numeric(18,2) NOT NULL,
  nilai_baru numeric(18,2) NOT NULL,
  catatan    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_tahap5_20260928 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_tahap5_20260928 FROM anon, authenticated;

DO $fix5$
DECLARE
  c_item   CONSTANT uuid := 'd9025753-3a13-4310-8fcb-60b3f1d8e12d';
  c_legacy CONSTANT uuid := 'f5bfe9ba-86ed-41d3-b0ff-42ea172461dd';
  c_inv    CONSTANT uuid := 'b0a8a7dc-01c7-4df5-8810-585c9ab9092e';
  c_prod   CONSTANT uuid := '023c7273-11cc-4cb9-98d5-b2a4652e67d6';
  c_den    CONSTANT uuid := '67b63a2b-2648-4c32-a82b-1374ce849ca2';
  v_n int; v_inv record; v_line record;
  v_new_dpp numeric; v_new_ppn numeric; v_new_total numeric;
  v_je uuid; v_ar uuid; v_rev uuid; v_ppn uuid;
BEGIN
  -- Pengecekan nilai lama
  SELECT count(*) INTO v_n FROM public.sp_order_items WHERE id = c_item AND unit_price = 3900 AND shipping_price = 0 AND qty = 150;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Item SP 2234621 tidak sesuai nilai lama. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.sp_items WHERE id = c_legacy AND unit_price = 3900 AND shipping_price = 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Item legacy SP 2234621 tidak sesuai nilai lama. Dibatalkan.'; END IF;
  SELECT * INTO v_inv FROM public.sp_invoices WHERE id = c_inv AND total_amount = 649350 AND status = 'issued' AND deleted_at IS NULL;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice tidak sesuai nilai lama. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.sp_payments WHERE invoice_id = c_inv;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Invoice sudah punya pembayaran. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.sp_invoice_lines WHERE invoice_id = c_inv;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Jumlah baris invoice bukan 1. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.products WHERE id = c_prod AND default_price = 3900 AND price_semester = 6338;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Master Pengait tidak sesuai nilai lama. Dibatalkan.'; END IF;

  -- 1. Item SP
  INSERT INTO public.backfill_tahap5_20260928 VALUES ('sp_order_items.unit_price', c_item, 3900, 6338, 'SP 2234621', now());
  INSERT INTO public.backfill_tahap5_20260928 VALUES ('sp_items.unit_price', c_legacy, 3900, 6338, 'SP 2234621', now());
  UPDATE public.sp_order_items SET unit_price = 6338, updated_at = now() WHERE id = c_item AND unit_price = 3900;
  UPDATE public.sp_items SET unit_price = 6338 WHERE id = c_legacy AND unit_price = 3900;

  -- 2. Invoice
  SELECT * INTO v_line FROM public.sp_invoice_lines WHERE invoice_id = c_inv;
  v_new_dpp := 6338 * v_line.qty;
  v_new_ppn := ROUND(v_new_dpp * 0.11);
  v_new_total := v_new_dpp + v_new_ppn;
  IF v_new_total <> 1055277 THEN RAISE EXCEPTION 'Total baru % bukan 1.055.277 (SP asli). Dibatalkan.', v_new_total; END IF;
  INSERT INTO public.backfill_tahap5_20260928 VALUES ('sp_invoices.total_amount', c_inv, 649350, v_new_total, 'SOA-INV-VIII-2026-0007', now());
  UPDATE public.sp_invoice_lines SET dpp = v_new_dpp, ppn = v_new_ppn WHERE id = v_line.id;
  UPDATE public.sp_invoices SET total_dpp = v_new_dpp, total_ppn = v_new_ppn, total_amount = v_new_total, updated_at = now() WHERE id = c_inv;

  -- 3. Jurnal penyesuaian
  SELECT id INTO v_ar  FROM public.chart_of_accounts WHERE company_id = v_inv.company_id AND code = '1-1200' AND deleted_at IS NULL;
  SELECT id INTO v_rev FROM public.chart_of_accounts WHERE company_id = v_inv.company_id AND code = '4-1000' AND deleted_at IS NULL;
  SELECT id INTO v_ppn FROM public.chart_of_accounts WHERE company_id = v_inv.company_id AND code = '2-1200' AND deleted_at IS NULL;
  IF v_ar IS NULL OR v_rev IS NULL OR v_ppn IS NULL THEN RAISE EXCEPTION 'Akun jurnal tidak lengkap. Dibatalkan.'; END IF;
  INSERT INTO public.journal_entries (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES (v_inv.company_id, current_date, 'invoice_adjustment', c_inv,
          'Koreksi harga Pengait POP A6 invoice SOA-INV-VIII-2026-0007 (SP 2234621) sesuai SP asli. Jejak: backfill_tahap5_20260928', c_den)
  RETURNING id INTO v_je;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES
    (v_je, v_ar, v_new_total - v_inv.total_amount, 0),
    (v_je, v_rev, 0, v_new_dpp - v_inv.total_dpp),
    (v_je, v_ppn, 0, v_new_ppn - v_inv.total_ppn);
  SELECT count(*) INTO v_n FROM (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je HAVING SUM(debit) <> SUM(credit)) t;
  IF v_n > 0 THEN RAISE EXCEPTION 'Jurnal tidak seimbang. Dibatalkan.'; END IF;

  -- 4. Master Product
  INSERT INTO public.backfill_tahap5_20260928 VALUES ('products.default_price', c_prod, 3900, 6338, 'Pengait POP A6', now());
  UPDATE public.products SET default_price = 6338, updated_at = now(), updated_by = c_den WHERE id = c_prod AND default_price = 3900;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Update master gagal. Dibatalkan.'; END IF;

  RAISE NOTICE 'OK: SP 2234621, invoice, jurnal, dan master Pengait dikoreksi.';
END
$fix5$;

COMMIT;

-- ROLLBACK DARURAT:
-- BEGIN;
-- DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM public.journal_entries WHERE reference_type='invoice_adjustment' AND reference_id='b0a8a7dc-01c7-4df5-8810-585c9ab9092e' AND description LIKE '%backfill_tahap5_20260928%');
-- DELETE FROM public.journal_entries WHERE reference_type='invoice_adjustment' AND reference_id='b0a8a7dc-01c7-4df5-8810-585c9ab9092e' AND description LIKE '%backfill_tahap5_20260928%';
-- UPDATE public.sp_invoice_lines SET dpp = 585000, ppn = 64350 WHERE invoice_id = 'b0a8a7dc-01c7-4df5-8810-585c9ab9092e';
-- UPDATE public.sp_invoices SET total_dpp = 585000, total_ppn = 64350, total_amount = 649350, updated_at = now() WHERE id = 'b0a8a7dc-01c7-4df5-8810-585c9ab9092e';
-- UPDATE public.sp_order_items SET unit_price = 3900, updated_at = now() WHERE id = 'd9025753-3a13-4310-8fcb-60b3f1d8e12d';
-- UPDATE public.sp_items SET unit_price = 3900 WHERE id = 'f5bfe9ba-86ed-41d3-b0ff-42ea172461dd';
-- UPDATE public.products SET default_price = 3900, updated_at = now() WHERE id = '023c7273-11cc-4cb9-98d5-b2a4652e67d6';
-- COMMIT;
