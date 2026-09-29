-- =====================================================================
-- Koreksi SP Storbit sesuai SP asli, Tahap 4 (item SP + invoice + jurnal, satu transaksi)
-- Tanggal       : 28 Sep 2026
-- Status        : LIVE (dijalankan di produksi 28 Sep 2026, terverifikasi)
-- Dasar         : dokumen SP asli Indomarco yang dicek Den 28 Sep 2026
-- Cakupan       : 5 baris item di 5 SP
--   2020577  Loyang      ongkir 600.000 -> 0 (SP asli tanpa ongkir)
--   2017009  Shelf Strip Flat 90 CM  harga 672 -> 5.148
--   2047232  Pengait POP A6          harga 3.900 -> 6.038
--   2050466  Pengait POP A6          harga 3.900 -> 6.038
--   2116904  Pengait POP A6          harga 3.900 -> 6.038
-- Pola sama dengan Tahap 2 dan 3: cadangan nilai lama, update hanya kalau
-- nilai di DB masih sama, invoice dihitung ulang dengan rumus create_invoice,
-- status invoice hanya dinaikkan, satu jurnal penyesuaian per invoice.
-- =====================================================================

BEGIN;

CREATE TABLE public.backfill_tahap4_items_20260928 (
  sp_order_item_id    uuid PRIMARY KEY,
  sp_item_id          uuid NOT NULL,
  sp_no               text NOT NULL,
  alasan              text NOT NULL,
  unit_price_lama     numeric(18,2) NOT NULL,
  unit_price_baru     numeric(18,2) NOT NULL,
  shipping_price_lama numeric(18,2) NOT NULL,
  shipping_price_baru numeric(18,2) NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.backfill_tahap4_invoice_line_20260928 (
  line_id uuid PRIMARY KEY, invoice_id uuid NOT NULL,
  dpp_lama numeric(18,2) NOT NULL, ppn_lama numeric(18,2) NOT NULL,
  dpp_baru numeric(18,2), ppn_baru numeric(18,2)
);
CREATE TABLE public.backfill_tahap4_invoice_20260928 (
  invoice_id uuid PRIMARY KEY, invoice_no text, sp_order_id uuid NOT NULL, sp_no text NOT NULL, company_id uuid NOT NULL,
  total_dpp_lama numeric(18,2) NOT NULL, total_ppn_lama numeric(18,2) NOT NULL, total_amount_lama numeric(18,2) NOT NULL,
  total_dpp_baru numeric(18,2), total_ppn_baru numeric(18,2), total_amount_baru numeric(18,2),
  settled numeric(18,2), status_lama text NOT NULL, status_baru text, sp_status_lama text,
  journal_entry_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_tahap4_items_20260928 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_tahap4_invoice_line_20260928 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_tahap4_invoice_20260928 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_tahap4_items_20260928 FROM anon, authenticated;
REVOKE ALL ON public.backfill_tahap4_invoice_line_20260928 FROM anon, authenticated;
REVOKE ALL ON public.backfill_tahap4_invoice_20260928 FROM anon, authenticated;

INSERT INTO public.backfill_tahap4_items_20260928
  (sp_order_item_id, sp_item_id, sp_no, alasan, unit_price_lama, unit_price_baru, shipping_price_lama, shipping_price_baru)
VALUES
  ('805f4151-6083-4b83-b363-3d7a9edec0d1', 'c424d451-d88e-4400-9d4d-022e21392f97', '2020577', 'ongkir tidak ada di SP asli', 120000, 120000, 600000, 0),
  ('9b607337-9354-4efb-a280-f822b4bad46c', '909c6993-cbbc-46b1-95dc-4f32e2506ec5', '2017009', 'harga satuan sesuai SP asli', 672, 5148, 0, 0),
  ('6ec08162-3cd3-4f50-9283-cbaa9b47b308', 'c344c849-2daf-43c2-98ef-2804b3cd924d', '2047232', 'harga satuan sesuai SP asli', 3900, 6038, 0, 0),
  ('173f3da6-aad1-4248-90c6-2d1a9aeb3a5c', '39f846c4-16b8-48b4-b248-232b0c965634', '2050466', 'harga satuan sesuai SP asli', 3900, 6038, 0, 0),
  ('126c5556-a42a-4e30-8b1a-b8f17e8b3a8e', '2899a839-f2b0-4892-8a68-7b4606692be0', '2116904', 'harga satuan sesuai SP asli', 3900, 6038, 0, 0);

DO $fix4$
DECLARE
  c_items   CONSTANT int := 5;
  c_inv     CONSTANT int := 5;
  c_den_id  CONSTANT uuid := '67b63a2b-2648-4c32-a82b-1374ce849ca2';
  v_n int; v_n2 int; v_lines int; v_je_n int := 0; v_unbal int;
  r record; v_je_id uuid;
  v_acc_ar uuid; v_acc_rev uuid; v_acc_ship uuid; v_acc_ppn uuid;
  d_ar numeric; d_rev numeric; d_ship numeric; d_ppn numeric;
BEGIN
  -- A. Pengecekan item: nilai di DB harus masih sama dengan nilai lama
  SELECT count(*) INTO v_n FROM public.sp_order_items i JOIN public.backfill_tahap4_items_20260928 b ON b.sp_order_item_id = i.id
   WHERE i.unit_price = b.unit_price_lama AND i.shipping_price = b.shipping_price_lama;
  SELECT count(*) INTO v_n2 FROM public.sp_items s JOIN public.backfill_tahap4_items_20260928 b ON b.sp_item_id = s.id
   WHERE s.unit_price = b.unit_price_lama AND s.shipping_price = b.shipping_price_lama;
  IF v_n <> c_items OR v_n2 <> c_items THEN
    RAISE EXCEPTION 'Pengecekan item gagal: sp_order_items % dari %, sp_items % dari %. Tidak ada yang diubah.', v_n, c_items, v_n2, c_items;
  END IF;

  -- B. Update item di dua tabel
  UPDATE public.sp_order_items i SET unit_price = b.unit_price_baru, shipping_price = b.shipping_price_baru, updated_at = now()
    FROM public.backfill_tahap4_items_20260928 b
   WHERE b.sp_order_item_id = i.id AND i.unit_price = b.unit_price_lama AND i.shipping_price = b.shipping_price_lama;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.sp_items s SET unit_price = b.unit_price_baru, shipping_price = b.shipping_price_baru
    FROM public.backfill_tahap4_items_20260928 b
   WHERE b.sp_item_id = s.id AND s.unit_price = b.unit_price_lama AND s.shipping_price = b.shipping_price_lama;
  GET DIAGNOSTICS v_n2 = ROW_COUNT;
  IF v_n <> c_items OR v_n2 <> c_items THEN
    RAISE EXCEPTION 'Update item tidak lengkap: % dan % dari %. Dibatalkan.', v_n, v_n2, c_items;
  END IF;

  -- C. Cadangan + hitung ulang baris invoice (semua baris milik invoice SP terkait)
  INSERT INTO public.backfill_tahap4_invoice_line_20260928 (line_id, invoice_id, dpp_lama, ppn_lama, dpp_baru, ppn_baru)
  SELECT l.id, l.invoice_id, l.dpp, l.ppn, i.unit_price * l.qty, ROUND((i.unit_price * l.qty + i.shipping_price) * 0.11)
    FROM public.sp_invoice_lines l
    JOIN public.sp_invoices v ON v.id = l.invoice_id AND v.deleted_at IS NULL AND v.status <> 'void'
    JOIN public.sp_order_items i ON i.id = l.sp_order_item_id
   WHERE v.sp_order_id IN (SELECT DISTINCT oi.sp_order_id FROM public.backfill_tahap4_items_20260928 b JOIN public.sp_order_items oi ON oi.id = b.sp_order_item_id);
  SELECT count(*) INTO v_lines FROM public.backfill_tahap4_invoice_line_20260928;

  INSERT INTO public.backfill_tahap4_invoice_20260928
    (invoice_id, invoice_no, sp_order_id, sp_no, company_id, total_dpp_lama, total_ppn_lama, total_amount_lama,
     total_dpp_baru, total_ppn_baru, total_amount_baru, settled, status_lama, sp_status_lama)
  SELECT v.id, v.invoice_no, v.sp_order_id, o.sp_no, v.company_id, v.total_dpp, v.total_ppn, v.total_amount,
         x.dpp, x.ppn, x.dpp + x.ppn + s.ship, COALESCE(p.settled, 0), v.status, o.status
    FROM public.sp_invoices v
    JOIN public.sp_orders o ON o.id = v.sp_order_id
    JOIN (SELECT invoice_id, SUM(dpp_baru) dpp, SUM(ppn_baru) ppn FROM public.backfill_tahap4_invoice_line_20260928 GROUP BY 1) x ON x.invoice_id = v.id
    JOIN (SELECT sp_order_id, SUM(shipping_price) ship FROM public.sp_order_items GROUP BY 1) s ON s.sp_order_id = v.sp_order_id
    LEFT JOIN (SELECT invoice_id, SUM(amount + pph) settled FROM public.sp_payments GROUP BY 1) p ON p.invoice_id = v.id;
  UPDATE public.backfill_tahap4_invoice_20260928
     SET status_baru = CASE WHEN settled >= total_amount_baru - 1 THEN 'paid' ELSE status_lama END;

  SELECT count(*) INTO v_n FROM public.backfill_tahap4_invoice_20260928;
  IF v_n <> c_inv THEN
    RAISE EXCEPTION 'Jumlah invoice % (harusnya %). Dibatalkan.', v_n, c_inv;
  END IF;

  -- D. Update baris dan total invoice
  UPDATE public.sp_invoice_lines l SET dpp = b.dpp_baru, ppn = b.ppn_baru
    FROM public.backfill_tahap4_invoice_line_20260928 b
   WHERE b.line_id = l.id AND l.dpp = b.dpp_lama AND l.ppn = b.ppn_lama;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_lines THEN
    RAISE EXCEPTION 'Baris invoice terubah % dari %. Dibatalkan.', v_n, v_lines;
  END IF;
  UPDATE public.sp_invoices v
     SET total_dpp = b.total_dpp_baru, total_ppn = b.total_ppn_baru, total_amount = b.total_amount_baru,
         status = b.status_baru, updated_at = now()
    FROM public.backfill_tahap4_invoice_20260928 b
   WHERE b.invoice_id = v.id AND v.total_amount = b.total_amount_lama AND v.status = b.status_lama;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_inv THEN
    RAISE EXCEPTION 'Invoice terubah % dari %. Dibatalkan.', v_n, c_inv;
  END IF;

  -- E. Jurnal penyesuaian
  FOR r IN SELECT * FROM public.backfill_tahap4_invoice_20260928
            WHERE total_amount_baru <> total_amount_lama OR total_dpp_baru <> total_dpp_lama OR total_ppn_baru <> total_ppn_lama
  LOOP
    SELECT id INTO v_acc_ar   FROM public.chart_of_accounts WHERE company_id = r.company_id AND code = '1-1200' AND deleted_at IS NULL;
    SELECT id INTO v_acc_rev  FROM public.chart_of_accounts WHERE company_id = r.company_id AND code = '4-1000' AND deleted_at IS NULL;
    SELECT id INTO v_acc_ship FROM public.chart_of_accounts WHERE company_id = r.company_id AND code = '4-1100' AND deleted_at IS NULL;
    SELECT id INTO v_acc_ppn  FROM public.chart_of_accounts WHERE company_id = r.company_id AND code = '2-1200' AND deleted_at IS NULL;
    IF v_acc_ar IS NULL OR v_acc_rev IS NULL OR v_acc_ship IS NULL OR v_acc_ppn IS NULL THEN
      RAISE EXCEPTION 'Akun jurnal tidak lengkap untuk company %. Dibatalkan.', r.company_id;
    END IF;
    d_ar   := r.total_amount_baru - r.total_amount_lama;
    d_rev  := r.total_dpp_baru - r.total_dpp_lama;
    d_ppn  := r.total_ppn_baru - r.total_ppn_lama;
    d_ship := (r.total_amount_baru - r.total_dpp_baru - r.total_ppn_baru) - (r.total_amount_lama - r.total_dpp_lama - r.total_ppn_lama);

    INSERT INTO public.journal_entries (company_id, entry_date, reference_type, reference_id, description, created_by)
    VALUES (r.company_id, current_date, 'invoice_adjustment', r.invoice_id,
            'Koreksi invoice ' || COALESCE(r.invoice_no, '(tanpa nomor)') || ' (SP ' || r.sp_no
            || ') sesuai SP asli. Jejak: backfill_tahap4_invoice_20260928', c_den_id)
    RETURNING id INTO v_je_id;
    IF d_ar <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_ar, GREATEST(d_ar,0), GREATEST(-d_ar,0)); END IF;
    IF d_rev <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_rev, GREATEST(-d_rev,0), GREATEST(d_rev,0)); END IF;
    IF d_ship <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_ship, GREATEST(-d_ship,0), GREATEST(d_ship,0)); END IF;
    IF d_ppn <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_ppn, GREATEST(-d_ppn,0), GREATEST(d_ppn,0)); END IF;
    UPDATE public.backfill_tahap4_invoice_20260928 SET journal_entry_id = v_je_id WHERE invoice_id = r.invoice_id;
    v_je_n := v_je_n + 1;
  END LOOP;

  SELECT count(*) INTO v_unbal FROM (
    SELECT l.journal_entry_id FROM public.journal_entry_lines l
      JOIN public.backfill_tahap4_invoice_20260928 b ON b.journal_entry_id = l.journal_entry_id
     GROUP BY 1 HAVING SUM(l.debit) <> SUM(l.credit)) t;
  IF v_unbal > 0 THEN
    RAISE EXCEPTION '% jurnal tidak seimbang. Dibatalkan.', v_unbal;
  END IF;

  -- F. Status SP untuk invoice yang naik jadi paid
  FOR r IN SELECT o.customer_id, o.sp_no FROM public.backfill_tahap4_invoice_20260928 b JOIN public.sp_orders o ON o.id = b.sp_order_id
            WHERE b.status_lama <> 'paid' AND b.status_baru = 'paid'
  LOOP
    PERFORM public.sp_recompute_status(r.customer_id, r.sp_no);
  END LOOP;

  RAISE NOTICE 'OK: % item, % invoice, % baris invoice, % jurnal.', c_items, c_inv, v_lines, v_je_n;
END
$fix4$;

COMMIT;

-- ROLLBACK DARURAT (hanya kalau perlu):
-- BEGIN;
-- DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT journal_entry_id FROM public.backfill_tahap4_invoice_20260928 WHERE journal_entry_id IS NOT NULL);
-- DELETE FROM public.journal_entries WHERE id IN (SELECT journal_entry_id FROM public.backfill_tahap4_invoice_20260928 WHERE journal_entry_id IS NOT NULL);
-- UPDATE public.sp_invoice_lines l SET dpp = b.dpp_lama, ppn = b.ppn_lama FROM public.backfill_tahap4_invoice_line_20260928 b WHERE b.line_id = l.id;
-- UPDATE public.sp_invoices v SET total_dpp = b.total_dpp_lama, total_ppn = b.total_ppn_lama, total_amount = b.total_amount_lama, status = b.status_lama, updated_at = now() FROM public.backfill_tahap4_invoice_20260928 b WHERE b.invoice_id = v.id;
-- UPDATE public.sp_orders o SET status = b.sp_status_lama, updated_at = now() FROM public.backfill_tahap4_invoice_20260928 b WHERE b.sp_order_id = o.id AND o.status <> b.sp_status_lama;
-- UPDATE public.sp_order_items i SET unit_price = b.unit_price_lama, shipping_price = b.shipping_price_lama, updated_at = now() FROM public.backfill_tahap4_items_20260928 b WHERE b.sp_order_item_id = i.id;
-- UPDATE public.sp_items s SET unit_price = b.unit_price_lama, shipping_price = b.shipping_price_lama FROM public.backfill_tahap4_items_20260928 b WHERE b.sp_item_id = s.id;
-- COMMIT;
