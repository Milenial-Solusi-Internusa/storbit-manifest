-- =====================================================================
-- Koreksi ongkir SP Storbit, Tahap 3 (invoice, status, jurnal penyesuaian)
-- Tanggal draft : 28 Sep 2026
-- Status        : LIVE (dijalankan di produksi 28 Sep 2026, terverifikasi)
-- Prasyarat     : Tahap 2 (backfill_ongkir_fix_20260928) sudah LIVE
-- Cakupan       : 94 invoice milik 94 SP yang dikoreksi di Tahap 2
-- Yang dilakukan:
--   1. Jenis jurnal baru 'invoice_adjustment' diizinkan (constraint diperluas)
--   2. Baris invoice dihitung ulang: DPP = harga x qty baris,
--      PPN = ROUND((DPP + ongkir) x 0,11)  (rumus sama dengan create_invoice)
--   3. Total invoice dihitung ulang: DPP + PPN + total ongkir SP
--   4. Status invoice HANYA dinaikkan ke 'paid' kalau pembayaran + PPh sudah
--      menutup total baru (toleransi 1 rupiah, sama dengan record_payment).
--      Status tidak pernah diturunkan.
--   5. Satu jurnal penyesuaian per invoice yang totalnya berubah, bertanggal
--      hari eksekusi. Jurnal lama TIDAK diubah.
--   6. Status SP dihitung ulang (sp_recompute_status) untuk invoice yang
--      naik jadi 'paid'.
-- Pengaman      : semua jumlah baris dicek; jurnal wajib seimbang; kalau ada
--                 yang meleset, seluruh transaksi dibatalkan.
-- =====================================================================

BEGIN;

-- 1. Izinkan jenis jurnal penyesuaian
ALTER TABLE public.journal_entries DROP CONSTRAINT journal_entries_reference_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type = ANY (ARRAY['invoice_issued'::text, 'payment_received'::text, 'invoice_adjustment'::text]));

-- 2. Tabel cadangan
CREATE TABLE public.backfill_invoice_line_fix_20260928 (
  line_id    uuid PRIMARY KEY,
  invoice_id uuid NOT NULL,
  dpp_lama   numeric(18,2) NOT NULL,
  ppn_lama   numeric(18,2) NOT NULL,
  dpp_baru   numeric(18,2) NOT NULL,
  ppn_baru   numeric(18,2) NOT NULL
);
CREATE TABLE public.backfill_invoice_fix_20260928 (
  invoice_id        uuid PRIMARY KEY,
  invoice_no        text,
  sp_order_id       uuid NOT NULL,
  sp_no             text NOT NULL,
  company_id        uuid NOT NULL,
  total_dpp_lama    numeric(18,2) NOT NULL,
  total_ppn_lama    numeric(18,2) NOT NULL,
  total_amount_lama numeric(18,2) NOT NULL,
  total_dpp_baru    numeric(18,2),
  total_ppn_baru    numeric(18,2),
  total_amount_baru numeric(18,2),
  settled           numeric(18,2) NOT NULL,
  status_lama       text NOT NULL,
  status_baru       text,
  sp_status_lama    text,
  journal_entry_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_invoice_line_fix_20260928 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backfill_invoice_fix_20260928 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_invoice_line_fix_20260928 FROM anon, authenticated;
REVOKE ALL ON public.backfill_invoice_fix_20260928 FROM anon, authenticated;

-- 3. Isi cadangan baris invoice (nilai lama + nilai baru hasil hitung ulang)
INSERT INTO public.backfill_invoice_line_fix_20260928 (line_id, invoice_id, dpp_lama, ppn_lama, dpp_baru, ppn_baru)
SELECT l.id, l.invoice_id, l.dpp, l.ppn,
       i.unit_price * l.qty,
       ROUND((i.unit_price * l.qty + i.shipping_price) * 0.11)
  FROM public.sp_invoice_lines l
  JOIN public.sp_invoices v   ON v.id = l.invoice_id AND v.deleted_at IS NULL AND v.status <> 'void'
  JOIN public.sp_order_items i ON i.id = l.sp_order_item_id
 WHERE v.sp_order_id IN (SELECT DISTINCT oi.sp_order_id
                           FROM public.backfill_ongkir_fix_20260928 b
                           JOIN public.sp_order_items oi ON oi.id = b.sp_order_item_id);

-- 4. Isi cadangan invoice
INSERT INTO public.backfill_invoice_fix_20260928
  (invoice_id, invoice_no, sp_order_id, sp_no, company_id,
   total_dpp_lama, total_ppn_lama, total_amount_lama,
   total_dpp_baru, total_ppn_baru, total_amount_baru,
   settled, status_lama, sp_status_lama)
SELECT v.id, v.invoice_no, v.sp_order_id, o.sp_no, v.company_id,
       v.total_dpp, v.total_ppn, v.total_amount,
       x.dpp, x.ppn, x.dpp + x.ppn + s.ship,
       COALESCE(p.settled, 0), v.status, o.status
  FROM public.sp_invoices v
  JOIN public.sp_orders o ON o.id = v.sp_order_id
  JOIN (SELECT invoice_id, SUM(dpp_baru) dpp, SUM(ppn_baru) ppn
          FROM public.backfill_invoice_line_fix_20260928 GROUP BY 1) x ON x.invoice_id = v.id
  JOIN (SELECT sp_order_id, SUM(shipping_price) ship
          FROM public.sp_order_items GROUP BY 1) s ON s.sp_order_id = v.sp_order_id
  LEFT JOIN (SELECT invoice_id, SUM(amount + pph) settled
               FROM public.sp_payments GROUP BY 1) p ON p.invoice_id = v.id;

UPDATE public.backfill_invoice_fix_20260928
   SET status_baru = CASE WHEN settled >= total_amount_baru - 1 THEN 'paid' ELSE status_lama END;

-- 5. Eksekusi dengan pengaman
DO $fix3$
DECLARE
  c_expected_inv CONSTANT int := 94;
  c_den_id       CONSTANT uuid := '67b63a2b-2648-4c32-a82b-1374ce849ca2';
  v_n_inv   int;
  v_n_line  int;
  v_upd     int;
  v_je_n    int := 0;
  v_unbal   int;
  r         record;
  v_je_id   uuid;
  v_acc_ar  uuid; v_acc_rev uuid; v_acc_ship uuid; v_acc_ppn uuid;
  d_ar numeric; d_rev numeric; d_ship numeric; d_ppn numeric;
BEGIN
  SELECT count(*) INTO v_n_inv  FROM public.backfill_invoice_fix_20260928;
  SELECT count(*) INTO v_n_line FROM public.backfill_invoice_line_fix_20260928;
  IF v_n_inv <> c_expected_inv THEN
    RAISE EXCEPTION 'Jumlah invoice % (harusnya %). Dibatalkan.', v_n_inv, c_expected_inv;
  END IF;

  -- 5a. Baris invoice
  UPDATE public.sp_invoice_lines l
     SET dpp = b.dpp_baru, ppn = b.ppn_baru
    FROM public.backfill_invoice_line_fix_20260928 b
   WHERE b.line_id = l.id AND l.dpp = b.dpp_lama AND l.ppn = b.ppn_lama;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> v_n_line THEN
    RAISE EXCEPTION 'Baris invoice terubah % dari %. Dibatalkan.', v_upd, v_n_line;
  END IF;

  -- 5b. Total + status invoice
  UPDATE public.sp_invoices v
     SET total_dpp = b.total_dpp_baru,
         total_ppn = b.total_ppn_baru,
         total_amount = b.total_amount_baru,
         status = b.status_baru,
         updated_at = now()
    FROM public.backfill_invoice_fix_20260928 b
   WHERE b.invoice_id = v.id
     AND v.total_amount = b.total_amount_lama
     AND v.status = b.status_lama;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> c_expected_inv THEN
    RAISE EXCEPTION 'Invoice terubah % dari %. Dibatalkan.', v_upd, c_expected_inv;
  END IF;

  -- 5c. Jurnal penyesuaian (satu per invoice yang totalnya berubah)
  FOR r IN SELECT * FROM public.backfill_invoice_fix_20260928
            WHERE total_amount_baru <> total_amount_lama
               OR total_dpp_baru <> total_dpp_lama
               OR total_ppn_baru <> total_ppn_lama
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
    d_ship := (r.total_amount_baru - r.total_dpp_baru - r.total_ppn_baru)
            - (r.total_amount_lama - r.total_dpp_lama - r.total_ppn_lama);

    INSERT INTO public.journal_entries (company_id, entry_date, reference_type, reference_id, description, created_by)
    VALUES (r.company_id, current_date, 'invoice_adjustment', r.invoice_id,
            'Koreksi ongkir invoice ' || COALESCE(r.invoice_no, '(tanpa nomor)') || ' (SP ' || r.sp_no
            || '), sesuai SP asli. Jejak: backfill_invoice_fix_20260928', c_den_id)
    RETURNING id INTO v_je_id;

    IF d_ar <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_ar, GREATEST(d_ar, 0), GREATEST(-d_ar, 0));
    END IF;
    IF d_rev <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_rev, GREATEST(-d_rev, 0), GREATEST(d_rev, 0));
    END IF;
    IF d_ship <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_ship, GREATEST(-d_ship, 0), GREATEST(d_ship, 0));
    END IF;
    IF d_ppn <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (v_je_id, v_acc_ppn, GREATEST(-d_ppn, 0), GREATEST(d_ppn, 0));
    END IF;

    UPDATE public.backfill_invoice_fix_20260928 SET journal_entry_id = v_je_id WHERE invoice_id = r.invoice_id;
    v_je_n := v_je_n + 1;
  END LOOP;

  -- 5d. Semua jurnal penyesuaian wajib seimbang
  SELECT count(*) INTO v_unbal FROM (
    SELECT je.id FROM public.journal_entries je
      JOIN public.backfill_invoice_fix_20260928 b ON b.journal_entry_id = je.id
      JOIN public.journal_entry_lines l ON l.journal_entry_id = je.id
     GROUP BY je.id HAVING SUM(l.debit) <> SUM(l.credit)) t;
  IF v_unbal > 0 THEN
    RAISE EXCEPTION '% jurnal penyesuaian tidak seimbang. Dibatalkan.', v_unbal;
  END IF;

  -- 5e. Status SP untuk invoice yang naik jadi paid
  FOR r IN SELECT o.customer_id, o.sp_no
             FROM public.backfill_invoice_fix_20260928 b
             JOIN public.sp_orders o ON o.id = b.sp_order_id
            WHERE b.status_lama <> 'paid' AND b.status_baru = 'paid'
  LOOP
    PERFORM public.sp_recompute_status(r.customer_id, r.sp_no);
  END LOOP;

  RAISE NOTICE 'OK: % invoice dikoreksi, % baris invoice, % jurnal penyesuaian.', c_expected_inv, v_n_line, v_je_n;
END
$fix3$;

COMMIT;


-- =====================================================================
-- VERIFIKASI SESUDAH
-- =====================================================================

-- V1. Total invoice sudah bernilai baru. Harapan: 94 / 94
SELECT count(*) total, count(*) FILTER (WHERE v.total_amount = b.total_amount_baru AND v.status = b.status_baru) cocok
  FROM public.backfill_invoice_fix_20260928 b JOIN public.sp_invoices v ON v.id = b.invoice_id;

-- V2. Jurnal penyesuaian seimbang. Harapan: tidak_seimbang 0
SELECT count(DISTINCT je.id) jurnal, count(DISTINCT je.id) FILTER (WHERE false) dummy,
       (SELECT count(*) FROM (SELECT l.journal_entry_id FROM public.journal_entry_lines l
          JOIN public.backfill_invoice_fix_20260928 b ON b.journal_entry_id = l.journal_entry_id
          GROUP BY 1 HAVING SUM(debit) <> SUM(credit)) x) tidak_seimbang
  FROM public.journal_entries je JOIN public.backfill_invoice_fix_20260928 b ON b.journal_entry_id = je.id;

-- V3. Saldo piutang di buku besar = sisa tagihan invoice, per invoice.
--     Harapan: beda 3 (SP 2033414, 2046673, 2066156). Ketiganya SUDAH selisih
--     1 rupiah sebelum koreksi ini, akibat pembulatan jurnal yang dipecah per
--     Surat Jalan. Bukan dari Tahap 3. Angka di atas 3 = ada yang salah.
SELECT count(*) invoice,
       count(*) FILTER (WHERE abs(gl.saldo_ar - (v.total_amount - b.settled)) > 0.01) beda
  FROM public.backfill_invoice_fix_20260928 b
  JOIN public.sp_invoices v ON v.id = b.invoice_id
  JOIN LATERAL (
    SELECT COALESCE(SUM(l.debit - l.credit), 0) saldo_ar
      FROM public.journal_entries je
      JOIN public.journal_entry_lines l ON l.journal_entry_id = je.id
      JOIN public.chart_of_accounts a ON a.id = l.account_id AND a.code = '1-1200'
     WHERE je.reference_id = v.id
        OR je.reference_id IN (SELECT id FROM public.sp_payments WHERE invoice_id = v.id)
  ) gl ON true;

-- V4. Ringkasan status. Harapan: paid 90, sisanya partial (2020577, 2031966, 2032030, 2066159)
SELECT status_lama, status_baru, count(*) FROM public.backfill_invoice_fix_20260928 GROUP BY 1, 2 ORDER BY 1, 2;
SELECT sp_no, status_baru, total_amount_baru - settled AS sisa
  FROM public.backfill_invoice_fix_20260928 WHERE status_baru <> 'paid' ORDER BY sp_no;


-- =====================================================================
-- ROLLBACK DARURAT (hanya kalau perlu membatalkan setelah COMMIT)
-- =====================================================================
-- BEGIN;
-- DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT journal_entry_id FROM public.backfill_invoice_fix_20260928 WHERE journal_entry_id IS NOT NULL);
-- DELETE FROM public.journal_entries WHERE id IN (SELECT journal_entry_id FROM public.backfill_invoice_fix_20260928 WHERE journal_entry_id IS NOT NULL);
-- UPDATE public.sp_invoice_lines l SET dpp = b.dpp_lama, ppn = b.ppn_lama FROM public.backfill_invoice_line_fix_20260928 b WHERE b.line_id = l.id;
-- UPDATE public.sp_invoices v SET total_dpp = b.total_dpp_lama, total_ppn = b.total_ppn_lama, total_amount = b.total_amount_lama, status = b.status_lama, updated_at = now() FROM public.backfill_invoice_fix_20260928 b WHERE b.invoice_id = v.id;
-- UPDATE public.sp_orders o SET status = b.sp_status_lama, updated_at = now() FROM public.backfill_invoice_fix_20260928 b WHERE b.sp_order_id = o.id AND o.status <> b.sp_status_lama;
-- COMMIT;
