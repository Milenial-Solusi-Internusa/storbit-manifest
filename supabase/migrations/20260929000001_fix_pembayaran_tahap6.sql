-- =====================================================================
-- Koreksi pembayaran Storbit, Tahap 6
-- Tanggal : 29 Sep 2026
-- Status  : LIVE (dijalankan di produksi 29 Sep 2026, terverifikasi)
-- Dasar   : file AR STORBIT Finance (daftar mutasi rekening + AR 2026)
-- Cakupan :
--   A. Dua pembayaran 18 Jun 2026 tertukar invoice (salah pasang di rekap outstanding):
--        BTB 2011850 (3.243.420)    : SP 2112397 -> SP 2145180
--        BTB 2013901 (2.981.749,71) : SP 2145180 -> SP 2112397
--      Jurnal pembayaran tidak berubah (merujuk ke pembayaran, akun sama).
--      Status invoice 2145180 naik jadi paid. Status tidak pernah diturunkan.
--   B. SP 2031966, pembayaran ongkir BTB 1975476: 2.507.000 -> 2.550.100
--      (mutasi 20 Mei 2026 93.179.360,64 membuktikan uang masuk SP ini 54.452.100).
--      Ditambah satu jurnal koreksi: Dr Bank 43.100 / Cr Piutang 43.100.
--      Sisa tagihan setelah koreksi 2.900 = biaya TTF Indomaret (sama dengan AR Finance).
-- =====================================================================
BEGIN;

CREATE TABLE public.backfill_tahap6_20260929 (
  objek      text PRIMARY KEY,
  record_id  uuid NOT NULL,
  nilai_lama text NOT NULL,
  nilai_baru text NOT NULL,
  catatan    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_tahap6_20260929 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_tahap6_20260929 FROM anon, authenticated;

DO $fix6$
DECLARE
  c_pay_a1  CONSTANT uuid := '5b674a7f-1d00-4623-82f0-1e3ad4e3c26b'; -- BTB 2011850, 3.243.420
  c_pay_a2  CONSTANT uuid := '54d4b461-13f7-40b3-92dd-aa2f51da18b9'; -- BTB 2013901, 2.981.749,71
  c_inv_97  CONSTANT uuid := '015881fb-65aa-4bdf-8ec5-b01aa17635dc'; -- SP 2112397
  c_inv_80  CONSTANT uuid := '54419b0b-72bb-43b1-9f8d-913cb6cd2ff0'; -- SP 2145180
  c_pay_b   CONSTANT uuid := 'b697d707-1d9d-4a9d-a1e9-40b95ffc34c1'; -- SP 2031966 BTB 1975476
  c_inv_66  CONSTANT uuid := '2b2e655d-da49-47b6-ab17-31d4399a5362'; -- SP 2031966
  c_company CONSTANT uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  c_den     CONSTANT uuid := '67b63a2b-2648-4c32-a82b-1374ce849ca2';
  v_n int; v_je uuid; v_bank uuid; v_ar uuid; v_settled numeric; v_total numeric; r record;
BEGIN
  -- Pengecekan nilai lama
  SELECT count(*) INTO v_n FROM public.sp_payments WHERE id = c_pay_a1 AND invoice_id = c_inv_97 AND amount = 3243420 AND pph = 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pembayaran BTB 2011850 tidak sesuai nilai lama. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.sp_payments WHERE id = c_pay_a2 AND invoice_id = c_inv_80 AND amount = 2981749.71 AND pph = 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pembayaran BTB 2013901 tidak sesuai nilai lama. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.sp_payments WHERE id = c_pay_b AND invoice_id = c_inv_66 AND amount = 2507000 AND pph = 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Pembayaran ongkir SP 2031966 tidak sesuai nilai lama. Dibatalkan.'; END IF;
  SELECT count(*) INTO v_n FROM public.sp_invoices WHERE id IN (c_inv_97, c_inv_80, c_inv_66) AND deleted_at IS NULL;
  IF v_n <> 3 THEN RAISE EXCEPTION 'Invoice tidak lengkap. Dibatalkan.'; END IF;

  -- A. Tukar balik
  INSERT INTO public.backfill_tahap6_20260929 VALUES
    ('sp_payments.invoice_id BTB 2011850', c_pay_a1, c_inv_97::text, c_inv_80::text, 'SP 2112397 -> 2145180', now()),
    ('sp_payments.invoice_id BTB 2013901', c_pay_a2, c_inv_80::text, c_inv_97::text, 'SP 2145180 -> 2112397', now()),
    ('sp_invoices.status SP 2145180', c_inv_80, (SELECT status FROM public.sp_invoices WHERE id = c_inv_80), 'paid', null, now()),
    ('sp_orders.status SP 2145180', (SELECT sp_order_id FROM public.sp_invoices WHERE id = c_inv_80),
      (SELECT o.status FROM public.sp_orders o JOIN public.sp_invoices v ON v.sp_order_id = o.id WHERE v.id = c_inv_80), '(dihitung ulang)', null, now());
  UPDATE public.sp_payments SET invoice_id = c_inv_80 WHERE id = c_pay_a1 AND invoice_id = c_inv_97;
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 1 THEN RAISE EXCEPTION 'Tukar A1 gagal. Dibatalkan.'; END IF;
  UPDATE public.sp_payments SET invoice_id = c_inv_97 WHERE id = c_pay_a2 AND invoice_id = c_inv_80;
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 1 THEN RAISE EXCEPTION 'Tukar A2 gagal. Dibatalkan.'; END IF;

  SELECT total_amount INTO v_total FROM public.sp_invoices WHERE id = c_inv_80;
  SELECT COALESCE(SUM(amount + pph), 0) INTO v_settled FROM public.sp_payments WHERE invoice_id = c_inv_80;
  IF v_settled < v_total - 1 THEN RAISE EXCEPTION 'SP 2145180 belum lunas setelah tukar (% dari %). Dibatalkan.', v_settled, v_total; END IF;
  UPDATE public.sp_invoices SET status = 'paid', updated_at = now() WHERE id = c_inv_80 AND status <> 'paid';
  FOR r IN SELECT o.customer_id, o.sp_no FROM public.sp_orders o JOIN public.sp_invoices v ON v.sp_order_id = o.id WHERE v.id = c_inv_80 LOOP
    PERFORM public.sp_recompute_status(r.customer_id, r.sp_no);
  END LOOP;

  -- B. Nominal ongkir SP 2031966
  INSERT INTO public.backfill_tahap6_20260929 VALUES
    ('sp_payments.amount SP 2031966 BTB 1975476', c_pay_b, '2507000', '2550100', 'mutasi 20 Mei 2026', now());
  UPDATE public.sp_payments SET amount = 2550100 WHERE id = c_pay_b AND amount = 2507000;
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 1 THEN RAISE EXCEPTION 'Update nominal gagal. Dibatalkan.'; END IF;

  SELECT id INTO v_bank FROM public.chart_of_accounts WHERE company_id = c_company AND code = '1-1101' AND deleted_at IS NULL;
  SELECT id INTO v_ar   FROM public.chart_of_accounts WHERE company_id = c_company AND code = '1-1200' AND deleted_at IS NULL;
  IF v_bank IS NULL OR v_ar IS NULL THEN RAISE EXCEPTION 'Akun jurnal tidak lengkap. Dibatalkan.'; END IF;
  INSERT INTO public.journal_entries (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES (c_company, current_date, 'payment_received', c_pay_b,
          'Koreksi nominal pembayaran ongkir SP 2031966 (BTB 1975476) 2.507.000 -> 2.550.100 sesuai mutasi 20 Mei 2026. Jejak: backfill_tahap6_20260929', c_den)
  RETURNING id INTO v_je;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES
    (v_je, v_bank, 43100, 0),
    (v_je, v_ar, 0, 43100);
  INSERT INTO public.backfill_tahap6_20260929 VALUES ('journal_entries koreksi SP 2031966', v_je, '-', '43100', 'Dr Bank / Cr Piutang', now());

  SELECT total_amount INTO v_total FROM public.sp_invoices WHERE id = c_inv_66;
  SELECT COALESCE(SUM(amount + pph), 0) INTO v_settled FROM public.sp_payments WHERE invoice_id = c_inv_66;
  IF v_total - v_settled <> 2900 THEN RAISE EXCEPTION 'Sisa SP 2031966 % bukan 2.900. Dibatalkan.', v_total - v_settled; END IF;

  RAISE NOTICE 'OK';
END
$fix6$;

COMMIT;

-- ROLLBACK DARURAT:
-- BEGIN;
-- DELETE FROM public.journal_entry_lines WHERE journal_entry_id = (SELECT record_id FROM public.backfill_tahap6_20260929 WHERE objek = 'journal_entries koreksi SP 2031966');
-- DELETE FROM public.journal_entries WHERE id = (SELECT record_id FROM public.backfill_tahap6_20260929 WHERE objek = 'journal_entries koreksi SP 2031966');
-- UPDATE public.sp_payments SET amount = 2507000 WHERE id = 'b697d707-1d9d-4a9d-a1e9-40b95ffc34c1';
-- UPDATE public.sp_payments SET invoice_id = '015881fb-65aa-4bdf-8ec5-b01aa17635dc' WHERE id = '5b674a7f-1d00-4623-82f0-1e3ad4e3c26b';
-- UPDATE public.sp_payments SET invoice_id = '54419b0b-72bb-43b1-9f8d-913cb6cd2ff0' WHERE id = '54d4b461-13f7-40b3-92dd-aa2f51da18b9';
-- UPDATE public.sp_invoices SET status = (SELECT nilai_lama FROM public.backfill_tahap6_20260929 WHERE objek = 'sp_invoices.status SP 2145180'), updated_at = now() WHERE id = '54419b0b-72bb-43b1-9f8d-913cb6cd2ff0';
-- UPDATE public.sp_orders SET status = (SELECT nilai_lama FROM public.backfill_tahap6_20260929 WHERE objek = 'sp_orders.status SP 2145180'), updated_at = now() WHERE id = (SELECT record_id FROM public.backfill_tahap6_20260929 WHERE objek = 'sp_orders.status SP 2145180');
-- COMMIT;
