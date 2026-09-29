-- =====================================================================
-- Rekonsiliasi pembayaran Storbit vs AR Finance, Tahap 8
-- Tanggal : 29 Sep 2026
-- Status  : LIVE (dijalankan di produksi 29 Sep 2026, terverifikasi)
-- Sumber  : file AR STORBIT Finance, sheet "2026" (nominal kas + PPh per invoice).
--           Urutan kepercayaan sumber: mutasi rekening > AR Finance > rekap outstanding.
--           Rekap outstanding (sumber impor 24 Sep) tidak dipakai di tahap ini.
-- Cakupan : 58 invoice (satu invoice per SP, total invoice Nexus = AR Finance)
--   INSERT (35): pembayaran yang dicatat Finance tapi belum ada di Nexus (terutama Ags s/d Sep 2026)
--   ADJUST (23): nominal pembayaran Nexus disamakan dengan uang masuk di AR Finance
--                (mayoritas selisih biaya TTF sekitar 2.900, plus ongkir SP 2084325 146.520)
--   Tidak disentuh: 9 SP yang di AR Finance belum bayar tapi rekap outstanding
--   mencatat lunas 29 Jul (satu TTF dengan SP 2137362 yang di AR sudah lunas 29 Jul).
-- Jurnal  : satu jurnal payment_received per pembayaran baru/selisih
--           (Bank, PPh 23 Dibayar Dimuka, Piutang Usaha), pola sama dengan record_payment.
-- Status  : invoice hanya dinaikkan (paid bila lunas dengan toleransi 1 rupiah, partial bila ada bayar).
-- =====================================================================
BEGIN;

CREATE TABLE public.backfill_tahap8_20260929 (
  sp_no text PRIMARY KEY,
  aksi text NOT NULL,
  ar_inv text,
  invoice_id uuid,
  payment_id uuid,
  cash_lama numeric(18,2), pph_lama numeric(18,2),
  cash_baru numeric(18,2), pph_baru numeric(18,2),
  status_lama text, status_baru text, sp_status_lama text,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.backfill_tahap8_20260929 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backfill_tahap8_20260929 FROM anon, authenticated;

CREATE TEMP TABLE t8_aksi (sp text, aksi text, nx_cash numeric, nx_pph numeric, ar_nom numeric, ar_pph numeric, ar_date date, ar_inv text) ON COMMIT DROP;
INSERT INTO t8_aksi VALUES
('1881812','ADJUST',46414840.05,25401.00,46411939.95,25401.0,'2026-02-26','JKT-260110'),
('1904702','ADJUST',74718540.00,0.00,74715640.0,0.0,'2026-02-25','JKT-260107'),
('1904751','ADJUST',70302960.00,0.00,70300060.0,0.0,'2026-03-18','JKT-260118'),
('1949842','ADJUST',31438312.50,0.00,31438313.55,0.0,'2026-02-25','JKT-260106'),
('1962108','ADJUST',1539126.00,0.00,1536226.0,0.0,'2026-03-11','JKT-260112'),
('1999364','ADJUST',112517125.80,0.00,112514225.8,0.0,'2026-03-27','JKT-260130'),
('1999563','ADJUST',23226750.00,0.00,23223850.0,0.0,'2026-03-18','JKT-260115'),
('2003857','ADJUST',85281300.00,0.00,85278400.0,0.0,'2026-04-16','JKT-260209'),
('2016113','ADJUST',7439983.10,0.00,7442883.0,0.0,'2026-03-27','JKT-260131'),
('2016880','ADJUST',5714280.00,0.00,5711380.0,0.0,'2026-03-30','JKT-260123'),
('2019023','ADJUST',101880451.00,0.00,101877550.9,0.0,'2026-04-23','JKT-260313'),
('2023410','ADJUST',194053530.00,0.00,194050630.0,0.0,'2026-04-22','JKT-260315'),
('2023415','ADJUST',25340034.60,0.00,25337134.6,0.0,'2026-03-31','JKT-260205'),
('2053449','ADJUST',57610332.00,0.00,57607432.0,0.0,'2026-04-22','JKT-260309'),
('2055473','ADJUST',10362092.67,0.00,10364974.65,0.0,'2026-05-29','JKT-260421'),
('2066159','ADJUST',38203240.00,16700.00,38206150.0,16700.0,'2026-08-20','JKT-260715'),
('2069910','ADJUST',7997092.40,0.00,7999992.0,0.0,'2026-05-29','JKT-260411'),
('2082813','ADJUST',64604886.00,0.00,64601986.0,0.0,'2026-05-29','JKT-260417'),
('2084325','ADJUST',1332000.00,0.00,1478520.0,0.0,'2026-08-12','JKT-260697'),
('2087170','ADJUST',33300000.00,0.00,33297109.0,0.0,'2026-08-12','JKT-260699'),
('2137358','ADJUST',540580.00,0.00,540570.0,0.0,'2026-08-20','JKT-260721'),
('2183788','ADJUST',23748300.00,39000.00,23745955.0,39000.0,'2026-08-20','JKT-260741'),
('2213494','ADJUST',86819870.17,0.00,86820425.32,0.0,'2026-08-26','JKT-260757'),
('2055476','INSERT',0,0,2930400.0,0.0,'2026-09-17','JKT-260783'),
('2079021','INSERT',0,0,1332000.0,0.0,'2026-09-17','JKT-260777'),
('2154308','INSERT',0,0,15374431.75,44051.0,'2026-09-23','JKT-260812'),
('2158589','INSERT',0,0,11147260.0,26000.0,'2026-09-17','JKT-260768'),
('2172962','INSERT',0,0,3137692.5,0.0,'2026-09-23','JKT-260810'),
('2180318','INSERT',0,0,3635694.0,0.0,'2026-09-23','JKT-260813'),
('2180327','INSERT',0,0,6466593.6,0.0,'2026-09-23','JKT-260806'),
('2180344','INSERT',0,0,4306356.0,0.0,'2026-09-23','JKT-260795'),
('2180346','INSERT',0,0,1454277.6,0.0,'2026-09-23','JKT-260799'),
('2180347','INSERT',0,0,5732395.2,0.0,'2026-09-23','JKT-260808'),
('2180348','INSERT',0,0,6431295.6,0.0,'2026-09-17','JKT-260787'),
('2180350','INSERT',0,0,5407653.6,0.0,'2026-09-17','JKT-260786'),
('2180351','INSERT',0,0,4680514.8,0.0,'2026-09-23','JKT-260802'),
('2180352','INSERT',0,0,7751440.8,0.0,'2026-09-23','JKT-260814'),
('2180353','INSERT',0,0,5075852.4,0.0,'2026-09-23','JKT-260791'),
('2180355','INSERT',0,0,6304222.8,0.0,'2026-09-23','JKT-260793'),
('2180356','INSERT',0,0,6607785.6,0.0,'2026-09-23','JKT-260794'),
('2180360','INSERT',0,0,4327534.8,0.0,'2026-09-23','JKT-260804'),
('2180361','INSERT',0,0,6120673.2,0.0,'2026-09-23','JKT-260796'),
('2180362','INSERT',0,0,4214581.2,0.0,'2026-09-23','JKT-260792'),
('2185623','INSERT',0,0,2753244.0,0.0,'2026-09-23','JKT-260801'),
('2204889','INSERT',0,0,33650644.56,0.0,'2026-09-23','JKT-260805'),
('2204895','INSERT',0,0,37124335.6,0.0,'2026-09-17','JKT-260782'),
('2204974','INSERT',0,0,43679174.2,0.0,'2026-09-23','JKT-260803'),
('2207723','INSERT',0,0,36412458.87,0.0,'2026-09-23','JKT-260807'),
('2207805','INSERT',0,0,3252070.23,0.0,'2026-09-17','JKT-260781'),
('2213363','INSERT',0,0,47834659.5,0.0,'2026-09-23','JKT-260816'),
('2213364','INSERT',0,0,15349465.6,0.0,'2026-09-17','JKT-260779'),
('2213370','INSERT',0,0,6749776.8,0.0,'2026-09-17','JKT-260778'),
('2213578','INSERT',0,0,27278594.1,0.0,'2026-09-23','JKT-260811'),
('2213579','INSERT',0,0,56696170.41,0.0,'2026-09-23','JKT-260809'),
('2213600','INSERT',0,0,13714272.0,0.0,'2026-09-17','JKT-260780'),
('2224912','INSERT',0,0,12957610.0,39380.0,'2026-09-23','JKT-260797'),
('2234621','INSERT',0,0,1055277.0,0.0,'2026-09-17','JKT-260776'),
('2249601','INSERT',0,0,3296700.0,0.0,'2026-09-23','JKT-260800');

DO $fix8$
DECLARE
  c_expected CONSTANT int := 58;
  c_den CONSTANT uuid := '67b63a2b-2648-4c32-a82b-1374ce849ca2';
  r record; v_inv record; v_n int; v_cash numeric; v_pph numeric;
  v_pay uuid; v_je uuid; d_cash numeric; d_pph numeric;
  v_bank uuid; v_pphacc uuid; v_ar uuid; v_settled numeric; v_new_status text; v_unbal int;
BEGIN
  SELECT count(*) INTO v_n FROM t8_aksi;
  IF v_n <> c_expected THEN RAISE EXCEPTION 'Jumlah aksi % bukan %. Dibatalkan.', v_n, c_expected; END IF;

  FOR r IN SELECT * FROM t8_aksi ORDER BY aksi, sp LOOP
    SELECT count(*) INTO v_n FROM public.sp_invoices v JOIN public.sp_orders o ON o.id = v.sp_order_id
     WHERE o.sp_no = r.sp AND o.deleted_at IS NULL AND v.deleted_at IS NULL AND v.status <> 'void';
    IF v_n <> 1 THEN RAISE EXCEPTION 'SP % punya % invoice aktif. Dibatalkan.', r.sp, v_n; END IF;
    SELECT v.*, o.status AS sp_status, o.customer_id INTO v_inv FROM public.sp_invoices v JOIN public.sp_orders o ON o.id = v.sp_order_id
     WHERE o.sp_no = r.sp AND o.deleted_at IS NULL AND v.deleted_at IS NULL AND v.status <> 'void';

    SELECT COALESCE(SUM(amount),0), COALESCE(SUM(pph),0) INTO v_cash, v_pph FROM public.sp_payments WHERE invoice_id = v_inv.id;
    IF abs(v_cash - r.nx_cash) > 0.005 OR abs(v_pph - r.nx_pph) > 0.005 THEN
      RAISE EXCEPTION 'SP % pembayaran sudah berubah (kas % vs %, pph % vs %). Dibatalkan.', r.sp, v_cash, r.nx_cash, v_pph, r.nx_pph;
    END IF;

    SELECT id INTO v_bank   FROM public.chart_of_accounts WHERE company_id = v_inv.company_id AND code = '1-1101' AND deleted_at IS NULL;
    SELECT id INTO v_pphacc FROM public.chart_of_accounts WHERE company_id = v_inv.company_id AND code = '1-1300' AND deleted_at IS NULL;
    SELECT id INTO v_ar     FROM public.chart_of_accounts WHERE company_id = v_inv.company_id AND code = '1-1200' AND deleted_at IS NULL;
    IF v_bank IS NULL OR v_pphacc IS NULL OR v_ar IS NULL THEN RAISE EXCEPTION 'Akun jurnal tidak lengkap. Dibatalkan.'; END IF;

    d_cash := r.ar_nom - r.nx_cash;
    d_pph  := r.ar_pph - r.nx_pph;

    IF r.aksi = 'INSERT' THEN
      IF v_cash <> 0 OR v_pph <> 0 THEN RAISE EXCEPTION 'SP % sudah punya pembayaran. Dibatalkan.', r.sp; END IF;
      INSERT INTO public.sp_payments (invoice_id, payment_date, amount, pph, reference, created_by)
      VALUES (v_inv.id, r.ar_date, r.ar_nom, r.ar_pph, 'Rekon AR Finance ' || r.ar_inv, c_den)
      RETURNING id INTO v_pay;
      INSERT INTO public.journal_entries (company_id, entry_date, reference_type, reference_id, description, created_by)
      VALUES (v_inv.company_id, r.ar_date, 'payment_received', v_pay,
              'Pembayaran ' || COALESCE(v_inv.invoice_no,'') || ' (SP ' || r.sp || ') dari rekonsiliasi AR Finance ' || r.ar_inv || '. Jejak: backfill_tahap8_20260929', c_den)
      RETURNING id INTO v_je;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je, v_bank, r.ar_nom, 0);
      IF r.ar_pph > 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je, v_pphacc, r.ar_pph, 0); END IF;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je, v_ar, 0, r.ar_nom + r.ar_pph);
    ELSIF r.aksi = 'ADJUST' THEN
      SELECT id INTO v_pay FROM public.sp_payments WHERE invoice_id = v_inv.id ORDER BY amount DESC, created_at LIMIT 1;
      UPDATE public.sp_payments SET amount = amount + d_cash, pph = pph + d_pph WHERE id = v_pay;
      SELECT count(*) INTO v_n FROM public.sp_payments WHERE id = v_pay AND amount > 0 AND pph >= 0;
      IF v_n <> 1 THEN RAISE EXCEPTION 'SP % hasil penyesuaian tidak valid. Dibatalkan.', r.sp; END IF;
      INSERT INTO public.journal_entries (company_id, entry_date, reference_type, reference_id, description, created_by)
      VALUES (v_inv.company_id, current_date, 'payment_received', v_pay,
              'Penyesuaian nominal pembayaran ' || COALESCE(v_inv.invoice_no,'') || ' (SP ' || r.sp || ') sesuai AR Finance ' || r.ar_inv || '. Jejak: backfill_tahap8_20260929', c_den)
      RETURNING id INTO v_je;
      IF d_cash <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je, v_bank, GREATEST(d_cash,0), GREATEST(-d_cash,0)); END IF;
      IF d_pph <> 0 THEN INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je, v_pphacc, GREATEST(d_pph,0), GREATEST(-d_pph,0)); END IF;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je, v_ar, GREATEST(-(d_cash+d_pph),0), GREATEST(d_cash+d_pph,0));
    ELSE
      RAISE EXCEPTION 'Aksi tidak dikenal %', r.aksi;
    END IF;

    SELECT COALESCE(SUM(amount + pph),0) INTO v_settled FROM public.sp_payments WHERE invoice_id = v_inv.id;
    v_new_status := CASE WHEN v_settled >= v_inv.total_amount - 1 THEN 'paid'
                         WHEN v_inv.status IN ('paid','partial') THEN v_inv.status
                         WHEN v_settled > 0 THEN 'partial'
                         ELSE v_inv.status END;
    IF v_new_status <> v_inv.status THEN
      UPDATE public.sp_invoices SET status = v_new_status, updated_at = now() WHERE id = v_inv.id;
    END IF;
    IF v_new_status = 'paid' AND v_inv.status <> 'paid' THEN
      PERFORM public.sp_recompute_status(v_inv.customer_id, r.sp);
    END IF;

    INSERT INTO public.backfill_tahap8_20260929
      (sp_no, aksi, ar_inv, invoice_id, payment_id, cash_lama, pph_lama, cash_baru, pph_baru, status_lama, status_baru, sp_status_lama, journal_entry_id)
    VALUES (r.sp, r.aksi, r.ar_inv, v_inv.id, v_pay, v_cash, v_pph, r.ar_nom, r.ar_pph, v_inv.status, v_new_status, v_inv.sp_status, v_je);
  END LOOP;

  SELECT count(*) INTO v_unbal FROM (
    SELECT l.journal_entry_id FROM public.journal_entry_lines l
      JOIN public.backfill_tahap8_20260929 b ON b.journal_entry_id = l.journal_entry_id
     GROUP BY 1 HAVING SUM(l.debit) <> SUM(l.credit)) t;
  IF v_unbal > 0 THEN RAISE EXCEPTION '% jurnal tidak seimbang. Dibatalkan.', v_unbal; END IF;

  SELECT count(*) INTO v_n FROM public.backfill_tahap8_20260929;
  IF v_n <> c_expected THEN RAISE EXCEPTION 'Tercatat % dari %. Dibatalkan.', v_n, c_expected; END IF;
  RAISE NOTICE 'OK: % aksi.', v_n;
END
$fix8$;

COMMIT;

-- ROLLBACK DARURAT:
-- BEGIN;
-- DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (SELECT journal_entry_id FROM public.backfill_tahap8_20260929);
-- DELETE FROM public.journal_entries WHERE id IN (SELECT journal_entry_id FROM public.backfill_tahap8_20260929);
-- DELETE FROM public.sp_payments WHERE id IN (SELECT payment_id FROM public.backfill_tahap8_20260929 WHERE aksi = 'INSERT');
-- UPDATE public.sp_payments p SET amount = p.amount - (b.cash_baru - b.cash_lama), pph = p.pph - (b.pph_baru - b.pph_lama)
--   FROM public.backfill_tahap8_20260929 b WHERE b.aksi = 'ADJUST' AND b.payment_id = p.id;
-- UPDATE public.sp_invoices v SET status = b.status_lama, updated_at = now() FROM public.backfill_tahap8_20260929 b WHERE b.invoice_id = v.id AND v.status <> b.status_lama;
-- UPDATE public.sp_orders o SET status = b.sp_status_lama, updated_at = now() FROM public.backfill_tahap8_20260929 b JOIN public.sp_invoices v ON v.id = b.invoice_id WHERE o.id = v.sp_order_id AND o.status <> b.sp_status_lama;
-- COMMIT;
