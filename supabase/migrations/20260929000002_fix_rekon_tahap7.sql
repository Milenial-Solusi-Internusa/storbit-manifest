-- =====================================================================
-- Koreksi SP Storbit hasil rekonsiliasi AR Finance, Tahap 7 (item SP + invoice + jurnal, satu transaksi)
-- Tanggal       : 29 Sep 2026
-- Status        : LIVE (dijalankan di produksi 29 Sep 2026, terverifikasi)
-- Dasar         : rekonsiliasi seluruh invoice Nexus vs file AR STORBIT Finance (29 Sep 2026)
-- Cakupan       : 3 baris item di 3 SP
--   2032013  Loyang   harga 127.258,06 -> 120.000 (ongkir dobel yang lolos Tahap 2, selisih pembulatan 2,80)
--   2016991  Shelf Strip Flat 90 CM  harga 5.797,30 -> 5.148 (qty 888, sesuai AR Finance)
--   2084325  Loyang   ongkir 0 -> 132.000 (sesuai AR Finance 1.478.520)
-- Pola sama dengan Tahap 2 dan 3: cadangan nilai lama, update hanya kalau
-- nilai di DB masih sama, invoice dihitung ulang dengan rumus create_invoice,
-- status invoice hanya dinaikkan, satu jurnal penyesuaian per invoice.
-- =====================================================================

BEGIN;

CREATE TABLE public.backfill_tahap7_items_20260929 (
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
CREATE TABLE public.backfill_tahap7_invoice_line_20260929 (
  line_id uuid PRIMARY KEY, invoice_id uuid NOT NULL,
  dpp_lama numeric(18,2) NOT NULL, ppn_lama numeric(18,2) NOT NULL,
  dpp_baru numeric(18,2), ppn_baru numeric(18,2)
);
CREATE TABLE public.backfill_tahap7_invoice_20260929 (
  invoice_id uuid PRIMARY KEY, invoice_no text, sp_order_id uuid NOT NULL, sp_no text NOT NULL, company_id uuid NOT NULL,
  total_dpp_lama numeric(18,2) NOT NULL, total_ppn_lama numeric(18,2) NOT NULL, total_amount_lama numeric(18,2) NOT NULL,
  total_dpp_baru numeric(18,2), total_ppn_baru numeric(18,2), total_amount_baru numeric(18,2),
  settled numeric(18,2), status_lama text NOT NULL, status_baru text, sp_status_lama text,
  journal_entry_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_tahap7_items_20260929 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_tahap7_invoice_line_20260929 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_tahap7_invoice_20260929 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_tahap7_items_20260929 FROM anon, authenticated;
REVOKE ALL ON public.backfill_tahap7_invoice_line_20260929 FROM anon, authenticated;
REVOKE ALL ON public.backfill_tahap7_invoice_20260929 FROM anon, authenticated;

INSERT INTO public.backfill_tahap7_items_20260929
  (sp_order_item_id, sp_item_id, sp_no, alasan, unit_price_lama, unit_price_baru, shipping_price_lama, shipping_price_baru)
VALUES
  ('dbdd6429-4a29-4f34-b238-bba9a8ff3827', '789c41ad-f245-4e6d-82b4-80cb068b5f94', '2032013', 'ongkir dobel di harga satuan', 127258.06, 120000, 4500000, 4500000),
  ('0bc6362d-71b3-4bf3-9a73-170995fd5b9e', 'ea699e04-c885-4d9f-a8b7-bc96b9b709c8', '2016991', 'harga satuan sesuai AR Finance', 5797.30, 5148, 0, 0),
  ('912c6348-1f0f-49f0-953c-2b414bea39c6', '28065fef-568c-4e29-a0ad-9953a9559bdf', '2084325', 'ongkir sesuai AR Finance', 120000, 120000, 0, 132000);

DO $fix7$
DECLARE
  c_items   CONSTANT int := 3;
  c_inv     CONSTANT int := 3;
  c_den_id  CONSTANT uuid := '67b63a2b-2648-4c32-a82b-1374ce849ca2';
  v_n int; v_n2 int; v_lines int; v_je_n int := 0; v_unbal int;
  r record; v_je_id uuid;
  v_acc_ar uuid; v_acc_rev uuid; v_acc_ship uuid; v_acc_ppn uuid;
  d_ar numeric; d_rev numeric; d_ship numeric; d_ppn numeric;
BEGIN
  -- A. Pengecekan item: nilai di DB harus masih sama dengan nilai lama
  SELECT count(*) INTO v_n FROM public.sp_order_items i JOIN public.backfill_tahap7_items_20260929 b ON b.sp_order_item_id = i.id
   WHERE i.unit_price = b.unit_price_lama AND i.shipping_price = b.shipping_price_lama;
  SELECT count(*) INTO v_n2 FROM public.sp_items s JOIN public.backfill_tahap7_items_20260929 b ON b.sp_item_id = s.id
   WHERE s.unit_price = b.unit_price_lama AND s.shipping_price = b.shipping_price_lama;
  IF v_n <> c_items OR v_n2 <> c_items THEN
    RAISE EXCEPTION 'Pengecekan item gagal: sp_order_items % dari %, sp_items % dari %. Tidak ada yang diubah.', v_n, c_items, v_n2, c_items;
  END IF;

  -- B. Update item di dua tabel
  UPDATE public.sp_order_items i SET unit_price = b.unit_price_baru, shipping_price = b.shipping_price_baru, updated_at = now()
    FROM public.backfill_tahap7_items_20260929 b
   WHERE b.sp_order_item_id = i.id AND i.unit_price = b.unit_price_lama AND i.shipping_price = b.shipping_price_lama;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.sp_items s SET unit_price = b.unit_price_baru, shipping_price = b.shipping_price_baru
    FROM public.backfill_tahap7_items_20260929 b
   WHERE b.sp_item_id = s.id AND s.unit_price = b.unit_price_lama AND s.shipping_price = b.shipping_price_lama;
  GET DIAGNOSTICS v_n2 = ROW_COUNT;
  IF v_n <> c_items OR v_n2 <> c_items THEN
    RAISE EXCEPTION 'Update item tidak lengkap: % dan % dari %. Dibatalkan.', v_n, v_n2, c_items;
  END IF;

  -- C. Cadangan + hitung ulang baris invoice (semua baris milik invoice SP terkait)
  INSERT INTO public.backfill_tahap7_invoice_line_20260929 (line_id, invoice_id, dpp_lama, ppn_lama, dpp_baru, ppn_baru)
  SELECT l.id, l.invoice_id, l.dpp, l.ppn, i.unit_price * l.qty, ROUND((i.unit_price * l.qty + i.shipping_price) * 0.11)
    FROM public.sp_invoice_lines l
    JOIN public.sp_invoices v ON v.id = l.invoice_id AND v.deleted_at IS NULL AND v.status <> 'void'
    JOIN public.sp_order_items i ON i.id = l.sp_order_item_id
   WHERE v.sp_order_id IN (SELECT DISTINCT oi.sp_order_id FROM public.backfill_tahap7_items_20260929 b JOIN public.sp_order_items oi ON oi.id = b.sp_order_item_id);
  SELECT count(*) INTO v_lines FROM public.backfill_tahap7_invoice_line_20260929;

  INSERT INTO public.backfill_tahap7_invoice_20260929
    (invoice_id, invoice_no, sp_order_id, sp_no, company_id, total_dpp_lama, total_ppn_lama, total_amount_lama,
     total_dpp_baru, total_ppn_baru, total_amount_baru, settled, status_lama, sp_status_lama)
  SELECT v.id, v.invoice_no, v.sp_order_id, o.sp_no, v.company_id, v.total_dpp, v.total_ppn, v.total_amount,
         x.dpp, x.ppn, x.dpp + x.ppn + s.ship, COALESCE(p.settled, 0), v.status, o.status
    FROM public.sp_invoices v
    JOIN public.sp_orders o ON o.id = v.sp_order_id
    JOIN (SELECT invoice_id, SUM(dpp_baru) dpp, SUM(ppn_baru) ppn FROM public.backfill_tahap7_invoice_line_20260929 GROUP BY 1) x ON x.invoice_id = v.id
    JOIN (SELECT sp_order_id, SUM(shipping_price) ship FROM public.sp_order_items GROUP BY 1) s ON s.sp_order_id = v.sp_order_id
    LEFT JOIN (SELECT invoice_id, SUM(amount + pph) settled FROM public.sp_payments GROUP BY 1) p ON p.invoice_id = v.id;
  UPDATE public.backfill_tahap7_invoice_20260929
     SET status_baru = CASE WHEN settled >= total_amount_baru - 1 THEN 'paid' ELSE status_lama END;

  SELECT count(*) INTO v_n FROM public.backfill_tahap7_invoice_20260929;
  IF v_n <> c_inv THEN
    RAISE EXCEPTION 'Jumlah invoice % (harusnya %). Dibatalkan.', v_n, c_inv;
  END IF;

  -- D. Update baris dan total invoice
  UPDATE public.sp_invoice_lines l SET dpp = b.dpp_baru, ppn = b.ppn_baru
    FROM public.backfill_tahap7_invoice_line_20260929 b
   WHERE b.line_id = l.id AND l.dpp = b.dpp_lama AND l.ppn = b.ppn_lama;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_lines THEN
    RAISE EXCEPTION 'Baris invoice terubah % dari %. Dibatalkan.', v_n, v_lines;
  END IF;
  UPDATE public.sp_invoices v
     SET total_dpp = b.total_dpp_baru, total_ppn = b.total_ppn_baru, total_amount = b.total_amount_baru,
         status = b.status_baru, updated_at = now()
    FROM public.backfill_tahap7_invoice_20260929 b
   WHERE b.invoice_id = v.id AND v.total_amount = b.total_amount_lama AND v.status = b.status_lama;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> c_inv THEN
    RAISE EXCEPTION 'Invoice terubah % dari %. Dibatalkan.', v_n, c_inv;
  END IF;

  -- E. Jurnal penyesuaian
  FOR r IN SELECT * FROM public.backfill_tahap7_invoice_20260929
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
            || ') sesuai rekonsiliasi AR Finance. Jejak: backfill_tahap7_invoice_20260929', c_den_id)
    RETURNING id INTO v_je_id;
    IF d_ar <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_ar, GREATEST(d_ar,0), GREATEST(-d_ar,0)); END IF;
    IF d_rev <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_rev, GREATEST(-d_rev,0), GREATEST(d_rev,0)); END IF;
    IF d_ship <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_ship, GREATEST(-d_ship,0), GREATEST(d_ship,0)); END IF;
    IF d_ppn <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_acc_ppn, GREATEST(-d_ppn,0), GREATEST(d_ppn,0)); END IF;
    UPDATE public.backfill_tahap7_invoice_20260929 SET journal_entry_id = v_je_id WHERE invoice_id = r.invoice_id;
    v_je_n := v_je_n + 1;
  END LOOP;

  SELECT count(*) INTO v_unbal FROM (
    SELECT l.journal_entry_id FROM public.journal_entry_lines l
      JOIN public.backfill_tahap7_invoice_20260929 b ON b.journal_entry_id = l.journal_entry_id
     GROUP BY 1 HAVING SUM(l.debit) <> SUM(l.credit)) t;
  IF v_unbal > 0 THEN
    RAISE EXCEPTION '% jurnal tidak seimbang. Dibatalkan.', v_unbal;
  END IF;

  -- F. Status SP untuk invoice yang naik jadi paid
  FOR r IN SELECT o.customer_id, o.sp_no FROM public.backfill_tahap7_invoice_20260929 b JOIN public.sp_orders o ON o.id = b.sp_order_id
            WHERE b.status_lama <> 'paid' AND b.status_baru = 'paid'
  LOOP
    PERFORM public.sp_recompute_status(r.customer_id, r.sp_no);
  END LOOP;

  RAISE NOTICE 'OK: % item, % invoice, % baris invoice, % jurnal.', c_items, c_inv, v_lines, v_je_n;
END
$fix7$;

COMMIT;

-- ROLLBACK DARURAT (hanya kalau perlu):
-- BEGIN;
-- DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT journal_entry_id FROM public.backfill_tahap7_invoice_20260929 WHERE journal_entry_id IS NOT NULL);
-- DELETE FROM public.journal_entries WHERE id IN (SELECT journal_entry_id FROM public.backfill_tahap7_invoice_20260929 WHERE journal_entry_id IS NOT NULL);
-- UPDATE public.sp_invoice_lines l SET dpp = b.dpp_lama, ppn = b.ppn_lama FROM public.backfill_tahap7_invoice_line_20260929 b WHERE b.line_id = l.id;
-- UPDATE public.sp_invoices v SET total_dpp = b.total_dpp_lama, total_ppn = b.total_ppn_lama, total_amount = b.total_amount_lama, status = b.status_lama, updated_at = now() FROM public.backfill_tahap7_invoice_20260929 b WHERE b.invoice_id = v.id;
-- UPDATE public.sp_orders o SET status = b.sp_status_lama, updated_at = now() FROM public.backfill_tahap7_invoice_20260929 b WHERE b.sp_order_id = o.id AND o.status <> b.sp_status_lama;
-- UPDATE public.sp_order_items i SET unit_price = b.unit_price_lama, shipping_price = b.shipping_price_lama, updated_at = now() FROM public.backfill_tahap7_items_20260929 b WHERE b.sp_order_item_id = i.id;
-- UPDATE public.sp_items s SET unit_price = b.unit_price_lama, shipping_price = b.shipping_price_lama FROM public.backfill_tahap7_items_20260929 b WHERE b.sp_item_id = s.id;
-- COMMIT;
