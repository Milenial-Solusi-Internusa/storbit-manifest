-- =============================================================================
-- Migration: 20260817000001_fase5_jurnal_ar_payments_ttf
-- Phase:     Storbit SP FASE 5 — pembayaran (LUNAS) + jurnal AR minimal + TTF
--            sebagai dokumen transmittal ber-FK (DESIGN_SP_SCHEMA.md §2.5).
-- Depends:   FASE 4 (sp_invoices/sp_invoice_lines/sp_payments, ar_ttfs
--            +sp_order_id/+invoice_id) — migrasi 8 Agu 2026, sudah live.
--            chart_of_accounts sudah terisi kode 1-1101 / 1-1200 / 1-1300 /
--            2-1200 / 4-1000 / 4-1100 untuk company yang dipakai; RPC di
--            bawah RAISE EXCEPTION eksplisit kalau salah satunya belum ada.
--
-- ⚠️ CATATAN: Migration ini RETROAKTIF — SQL sudah dijalankan manual
--    di SQL Editor pada 17 Agustus 2026 sebelum file ini ditulis.
--    File ini murni dokumentasi urutan perubahan, BUKAN untuk
--    dijalankan ulang (akan gagal di sebagian besar statement karena
--    objeknya sudah ada — sudah pakai IF NOT EXISTS/OR REPLACE di
--    sebagian besar, tapi tetap tidak untuk re-run di environment ini).
--
-- SUMBER ISI FILE INI:
--   Seluruh DDL, policy, GRANT, dan BODY FUNGSI di bawah diambil dari
--   `supabase/schema_snapshot.sql` (pg_dump pasca-eksekusi, commit 35cb1d3),
--   dan cakupannya diturunkan dari diff snapshot 1dcf5ed..35cb1d3 — BUKAN
--   ditulis ulang dari ingatan. Dua penyimpangan yang DISENGAJA terhadap
--   teks snapshot, keduanya tidak mengubah semantik:
--     (a) `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION` (konvensi folder
--         migrasi ini; STEP 5/STEP 6 memang REPLACE atas fungsi yang sudah ada).
--     (b) dollar-quote `$$` → dollar-quote bernama `$fn$`.
--   Selain dua itu, body fungsi identik karakter-per-karakter dengan snapshot.
--
-- URUTAN SECTION (STEP 1 → STEP 9, berurutan):
--   Label "STEP" adalah penomoran LOKAL file ini — urutan dependency nyata
--   saat SQL FASE 5 dijalankan di sesi 17 Agu 2026, dinomori ulang 1..9 supaya
--   dibaca berurutan dari atas ke bawah.
--   ⚠️ SENGAJA BUKAN "M1/M2/..." — label M sudah dipakai tabel rencana migrasi
--   M1–M13 di `DESIGN_SP_SCHEMA.md` §5, yang isinya BERBEDA sama sekali
--   (di sana M2 = buat tabel FASE 4, M7 = backfill ar_ttfs). Jangan tertukar:
--   nomor STEP di file ini tidak punya hubungan apa pun dengan nomor M di sana.
--   Logika urutannya: kolom & tabel dulu (STEP 1–4), lalu dua fungsi LAMA yang
--   di-REPLACE (STEP 5–6), baru dua RPC BARU yang memanggilnya (STEP 7
--   record_payment PERFORM sp_recompute_status dan mengandalkan cabang
--   LUNAS-nya), ditutup pengetatan hak akses sp_payments (STEP 9) setelah
--   RPC-nya ada.
--
-- CATATAN DESAIN:
--   - Jurnal AR ini MINIMAL & auto-post tanpa approval. Hanya 2 pemicu:
--     'invoice_issued' (create_invoice) dan 'payment_received'
--     (record_payment) — dikunci CHECK constraint di journal_entries.
--   - Tulis ke journal_entries/journal_entry_lines HANYA via RPC SECURITY
--     DEFINER. Tak ada policy INSERT/UPDATE/DELETE sama sekali untuk
--     `authenticated`, dan GRANT tabelnya cuma SELECT — jadi PostgREST
--     tidak bisa menulis jurnal langsung. Koreksi = jurnal pembalik, BUKAN
--     UPDATE baris lama (karena itu pula tak ada updated_at).
--   - journal_entry_lines_sign_check menolak baris yang debit DAN credit
--     terisi bersamaan (salah satu wajib 0) — jaga bentuk double-entry.
--   - Status invoice 'paid' ditentukan `SUM(amount)+SUM(pph) >= total_amount`
--     dengan toleransi Rp 1 (c_tolerance) untuk selisih pembulatan PPN.
--     PPh dihitung sebagai bagian pelunasan, bukan potongan yang hangus.
--   - Cabang LUNAS di sp_recompute_status ditaruh di prioritas TERATAS, dan
--     'LUNAS' tetap ada di guard freeze `IF v_status IN ('CANCELLED','LUNAS')
--     THEN RETURN` — begitu LUNAS, status SP tidak pernah mundur lagi.
--   - STEP 9 menutup sebagian TD-176 khusus sp_payments: `GRANT ALL ON TABLE`
--     diganti SELECT + UPDATE kolom-level (3 kolom), dan policy
--     sp_payments_insert DIHAPUS total (INSERT sekarang RPC-only).
--     sp_order_items/sp_items/sp_invoice_lines masih `GRANT ALL` — TD-176
--     tetap OPEN untuk ketiganya, di luar cakupan migrasi ini.
-- =============================================================================


-- =============================================================================
-- STEP 1 — sp_payments: kolom bukti potong PPh 23
-- Dipakai record_payment (p_bukti_potong_url / p_bukti_potong_no). Interim:
-- URL manual ke Drive/Storage, belum ada upload terintegrasi.
-- =============================================================================

ALTER TABLE public.sp_payments ADD COLUMN IF NOT EXISTS bukti_potong_url text;
ALTER TABLE public.sp_payments ADD COLUMN IF NOT EXISTS bukti_potong_no  text;

COMMENT ON COLUMN public.sp_payments.bukti_potong_url IS 'Tautan scan bukti potong (Drive/Storage). Interim: URL manual.';
COMMENT ON COLUMN public.sp_payments.bukti_potong_no IS 'Nomor bukti potong PPh 23 dari customer.';


-- =============================================================================
-- STEP 2 — ar_ttfs: kolom diterima_oleh + index FK
-- diterima_oleh = nama orang di pihak customer; SENGAJA teks bebas, bukan FK
-- ke profiles (orang di luar sistem Nexus). Dipakai mark_ttf_received (STEP 8).
-- Dua index menyusul kolom FK sp_order_id/invoice_id yang sudah dibuat di
-- FASE 4 — waktu itu kolomnya saja, tanpa index.
-- =============================================================================

ALTER TABLE public.ar_ttfs ADD COLUMN IF NOT EXISTS diterima_oleh text;

COMMENT ON COLUMN public.ar_ttfs.diterima_oleh IS 'Nama orang di pihak customer yang menerima faktur. Teks bebas — orang di luar sistem Nexus, sengaja BUKAN FK ke profiles.';

CREATE INDEX IF NOT EXISTS idx_ar_ttfs_invoice_id  ON public.ar_ttfs USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_ttfs_sp_order_id ON public.ar_ttfs USING btree (sp_order_id);


-- =============================================================================
-- STEP 3 — Tabel jurnal AR minimal: journal_entries + journal_entry_lines
-- Header + baris debit/credit. Tanpa updated_at (baris jurnal tak pernah
-- di-UPDATE — koreksi lewat jurnal pembalik).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    reference_type text NOT NULL,
    reference_id uuid NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT journal_entries_reference_type_check CHECK ((reference_type = ANY (ARRAY['invoice_issued'::text, 'payment_received'::text])))
);

COMMENT ON TABLE public.journal_entries IS 'Jurnal AR minimal Fase 5. Auto-post tanpa approval. Tulis HANYA via RPC SECURITY DEFINER. Koreksi = jurnal pembalik, bukan UPDATE.';

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    debit numeric(18,2) DEFAULT 0 NOT NULL,
    credit numeric(18,2) DEFAULT 0 NOT NULL,
    CONSTRAINT journal_entry_lines_sign_check CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric) AND ((debit = (0)::numeric) OR (credit = (0)::numeric))))
);

-- Primary key
ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_pkey PRIMARY KEY (id);

-- Foreign key. ON DELETE RESTRICT ke companies & chart_of_accounts (jurnal
-- tak boleh ikut hilang saat master dihapus); CASCADE dari header ke baris.
ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;

-- Index
CREATE INDEX IF NOT EXISTS idx_je_company_date ON public.journal_entries USING btree (company_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_reference    ON public.journal_entries USING btree (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_jel_account     ON public.journal_entry_lines USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_jel_entry       ON public.journal_entry_lines USING btree (journal_entry_id);


-- =============================================================================
-- STEP 4 — RLS + GRANT tabel jurnal
-- READ-ONLY untuk authenticated, company-scoped. Pakai get_user_company_ids()
-- (varian JAMAK) — bukan get_user_company_id(), supaya user multi-company
-- tidak terkunci ke home company-nya (pola TD-180).
-- journal_entry_lines discope lewat header-nya (EXISTS ke journal_entries).
-- TIDAK ADA policy INSERT/UPDATE/DELETE — penulisan hanya lewat RPC
-- SECURITY DEFINER (STEP 6/STEP 7), yang memang bypass RLS.
-- =============================================================================

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entries_read ON public.journal_entries FOR SELECT TO authenticated USING ((public.is_super_admin() OR (company_id IN ( SELECT public.get_user_company_ids() AS get_user_company_ids))));

ALTER TABLE public.journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY journal_entry_lines_read ON public.journal_entry_lines FOR SELECT TO authenticated USING ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.journal_entries je
  WHERE ((je.id = journal_entry_lines.journal_entry_id) AND (je.company_id IN ( SELECT public.get_user_company_ids() AS get_user_company_ids)))))));

-- GRANT. Tabel dibuat lewat SQL Editor → tidak auto-grant (aturan wajib
-- CLAUDE.md). authenticated cuma dapat SELECT — nol INSERT/UPDATE/DELETE.
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.journal_entries TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.journal_entries TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.journal_entries TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.journal_entry_lines TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.journal_entry_lines TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.journal_entry_lines TO service_role;


-- =============================================================================
-- STEP 5 — sp_recompute_status: cabang LUNAS (REPLACE fungsi lama)
-- Perubahan vs versi FASE 4: +deklarasi v_paid, +probe status='paid' ke
-- sp_invoices, +cabang `WHEN v_paid THEN 'LUNAS'` di PUNCAK CASE. Sisanya
-- identik. Dilakukan SEBELUM STEP 7 karena record_payment memanggil fungsi ini
-- dan mengandalkan cabang LUNAS-nya begitu invoice jadi 'paid'.
-- ⚠️ v_company masih hardcode UUID SOA (TD-178) — DIPERTAHANKAN apa adanya,
--    perbaikannya di luar cakupan FASE 5.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
  v_has_btb bool; v_has_invoice bool; v_submitted bool;
  v_paid bool;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status IN ('CANCELLED','LUNAS') THEN RETURN; END IF;
  v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
  v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
  v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
  v_short := EXISTS(
    SELECT 1 FROM sp_items si
     WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
       AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
       AND (si.qty - si.shipped_qty) > COALESCE(
             (SELECT SUM(ss.available) FROM stock_summary ss
               WHERE ss.company_id=v_company AND ss.product_id=si.product_id), 0));
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');
  v_has_btb     := EXISTS(SELECT 1 FROM sp_btb      WHERE sp_order_id=v_id AND deleted_at IS NULL);
  v_has_invoice := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status <> 'void');
  v_submitted   := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status='submitted');
  v_paid        := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND status='paid');
  v_new := CASE
    WHEN v_paid                                   THEN 'LUNAS'
    WHEN v_submitted                              THEN 'SUBMITTED'
    WHEN v_has_invoice                            THEN 'INVOICED'
    WHEN v_has_btb                                THEN 'BTB_TERBIT'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
    WHEN v_has_delivered                          THEN 'SAMPAI'
    WHEN v_has_dispatch                           THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;
  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
    IF FOUND AND v_new IN ('CONFIRMED','BTB_TERBIT','SUBMITTED') THEN
      PERFORM public.notify_sp_milestone(v_id, v_new, v_status, v_new);
    END IF;
  END IF;
END; $fn$;


-- =============================================================================
-- STEP 6 — create_invoice: blok jurnal 'invoice_issued' (REPLACE fungsi lama)
-- Perubahan vs versi 20260814000002/3: +deklarasi v_total_ship/v_je_id/
-- v_acc_ar/v_acc_rev/v_acc_ship/v_acc_ppn_out + 4 konstanta kode akun,
-- +lookup akun (gagal keras kalau akun belum ada), +posting jurnal.
-- Bentuk jurnal penerbitan invoice:
--   D  1-1200 Piutang Usaha            = total_amount
--   K  4-1000 Pendapatan               = total_dpp     (kalau > 0)
--   K  4-1100 Pendapatan Ongkos Kirim  = total_ship    (kalau > 0)
--   K  2-1200 PPN Keluaran             = total_ppn     (kalau > 0)
-- Akun ongkos kirim HANYA di-lookup kalau v_total_ship > 0 — SP tanpa ongkos
-- kirim tidak dipaksa punya akun 4-1100.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice(p_sp_order_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text; v_entity_code text;
  v_year         int := extract(year from now())::int;
  v_month_roman  text;
  v_seq          int; v_invoice_no text; v_invoice_id uuid;
  v_ordered      int; v_shipped int;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
  v_total_ship   numeric(18,2);
  v_je_id        uuid;
  v_acc_ar       uuid;
  v_acc_rev      uuid;
  v_acc_ship     uuid;
  v_acc_ppn_out  uuid;
  c_code_ar      CONSTANT text := '1-1200';
  c_code_rev     CONSTANT text := '4-1000';
  c_code_ship    CONSTANT text := '4-1100';
  c_code_ppn_out CONSTANT text := '2-1200';
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin menerbitkan invoice.';
  END IF;

  SELECT company_id, customer_id, sp_no INTO v_company_id, v_customer_id, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;

  IF EXISTS (SELECT 1 FROM sp_invoices WHERE sp_order_id = p_sp_order_id AND status <> 'void') THEN
    RAISE EXCEPTION 'SP ini sudah punya invoice aktif.';
  END IF;

  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  IF v_ordered = 0 OR v_shipped <> v_ordered THEN
    RAISE EXCEPTION 'SP belum terkirim penuh (Σshipped=%, Σqty=%) — invoice tidak bisa diterbitkan.', v_shipped, v_ordered;
  END IF;

  SELECT code INTO v_entity_code FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'INV', 'FIN', v_year, 0, 0);
  v_month_roman := CASE extract(month from now())::int
    WHEN 1 THEN 'I' WHEN 2 THEN 'II' WHEN 3 THEN 'III' WHEN 4 THEN 'IV'
    WHEN 5 THEN 'V' WHEN 6 THEN 'VI' WHEN 7 THEN 'VII' WHEN 8 THEN 'VIII'
    WHEN 9 THEN 'IX' WHEN 10 THEN 'X' WHEN 11 THEN 'XI' WHEN 12 THEN 'XII'
  END;
  v_invoice_no := v_entity_code || '-INV-' || v_month_roman || '-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_no, invoice_date, status, created_by)
  VALUES (v_company_id, p_sp_order_id, v_invoice_no, current_date, 'issued', v_uid)
  RETURNING id INTO v_invoice_id;

  INSERT INTO sp_invoice_lines (invoice_id, sp_order_item_id, dpp, ppn, qty, position)
  SELECT v_invoice_id, i.id,
         (i.unit_price * i.shipped_qty),
         ROUND((i.unit_price * i.shipped_qty + i.shipping_price) * 0.11),
         i.shipped_qty,
         row_number() OVER (ORDER BY i.created_at)
    FROM sp_order_items i WHERE i.sp_order_id = p_sp_order_id;

  SELECT COALESCE(SUM(dpp),0), COALESCE(SUM(ppn),0) INTO v_total_dpp, v_total_ppn
    FROM sp_invoice_lines WHERE invoice_id = v_invoice_id;
  SELECT v_total_dpp + v_total_ppn + COALESCE(SUM(shipping_price),0) INTO v_total_amount
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  UPDATE sp_invoices SET total_dpp = v_total_dpp, total_ppn = v_total_ppn, total_amount = v_total_amount
   WHERE id = v_invoice_id;

  SELECT COALESCE(SUM(shipping_price),0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  SELECT id INTO v_acc_ar FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_ar AND deleted_at IS NULL;
  IF v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ar;
  END IF;

  SELECT id INTO v_acc_rev FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_rev AND deleted_at IS NULL;
  IF v_acc_rev IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_rev;
  END IF;

  SELECT id INTO v_acc_ppn_out FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_ppn_out AND deleted_at IS NULL;
  IF v_acc_ppn_out IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ppn_out;
  END IF;

  IF v_total_ship > 0 THEN
    SELECT id INTO v_acc_ship FROM chart_of_accounts
     WHERE company_id = v_company_id AND code = c_code_ship AND deleted_at IS NULL;
    IF v_acc_ship IS NULL THEN
      RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ship;
    END IF;
  END IF;

  INSERT INTO journal_entries
    (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES
    (v_company_id, current_date, 'invoice_issued', v_invoice_id,
     'Penerbitan invoice ' || v_invoice_no || ' (SP ' || v_sp_no || ')', v_uid)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, v_total_amount, 0);

  IF v_total_dpp > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_rev, 0, v_total_dpp);
  END IF;

  IF v_total_ship > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_ship, 0, v_total_ship);
  END IF;

  IF v_total_ppn > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_ppn_out, 0, v_total_ppn);
  END IF;

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END; $fn$;


-- =============================================================================
-- STEP 7 — record_payment(): RPC BARU pencatatan pembayaran
-- Otorisasi lebih ketat dari create_invoice: HANYA super_admin atau
-- finance_controller (is_manager_or_above SENGAJA tidak termasuk — mencatat
-- uang masuk bukan wewenang manajer lini).
-- Alur: validasi → lookup akun → INSERT sp_payments → hitung ulang settled
-- (amount+pph seluruh baris) → update status invoice (paid/partial) →
-- posting jurnal → PERFORM sp_recompute_status kalau invoice jadi 'paid'
-- (di situlah SP naik ke LUNAS lewat cabang STEP 5).
-- Bentuk jurnal penerimaan pembayaran:
--   D  1-1101 Bank                        = amount
--   D  1-1300 PPh 23 Dibayar Dimuka       = pph        (kalau > 0)
--   K  1-1200 Piutang Usaha               = amount + pph
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_reference text DEFAULT NULL::text, p_pph numeric DEFAULT 0, p_bukti_potong_url text DEFAULT NULL::text, p_bukti_potong_no text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  c_code_bank   CONSTANT text := '1-1101';  -- Bank
  c_code_ar     CONSTANT text := '1-1200';  -- Piutang Usaha
  c_code_pph23  CONSTANT text := '1-1300';  -- PPh 23 Dibayar Dimuka
  c_tolerance   CONSTANT numeric := 1;

  v_uid         uuid := auth.uid();
  v_company_id  uuid;
  v_sp_order_id uuid;
  v_total       numeric(18,2);
  v_inv_status  text;
  v_invoice_no  text;
  v_customer_id uuid;
  v_sp_no       text;
  v_payment_id  uuid;
  v_settled     numeric(18,2);
  v_new_status  text;
  v_je_id       uuid;
  v_acc_bank    uuid;
  v_acc_ar      uuid;
  v_acc_pph     uuid;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat pembayaran.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih besar dari nol.';
  END IF;
  IF COALESCE(p_pph, 0) < 0 THEN
    RAISE EXCEPTION 'PPh tidak boleh negatif.';
  END IF;

  SELECT i.company_id, i.sp_order_id, i.total_amount, i.status, i.invoice_no
    INTO v_company_id, v_sp_order_id, v_total, v_inv_status, v_invoice_no
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL;

  IF v_company_id IS NULL  THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_inv_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void — pembayaran tidak bisa dicatat.';
  END IF;
  IF v_inv_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft — terbitkan dulu sebelum mencatat pembayaran.';
  END IF;

  SELECT id INTO v_acc_bank FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_bank AND deleted_at IS NULL;
  IF v_acc_bank IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_bank;
  END IF;

  SELECT id INTO v_acc_ar FROM chart_of_accounts
   WHERE company_id = v_company_id AND code = c_code_ar AND deleted_at IS NULL;
  IF v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_ar;
  END IF;

  IF COALESCE(p_pph, 0) > 0 THEN
    SELECT id INTO v_acc_pph FROM chart_of_accounts
     WHERE company_id = v_company_id AND code = c_code_pph23 AND deleted_at IS NULL;
    IF v_acc_pph IS NULL THEN
      RAISE EXCEPTION 'Akun [%] belum ada di chart_of_accounts untuk company ini — hubungi Finance Controller.', c_code_pph23;
    END IF;
  END IF;

  INSERT INTO sp_payments
    (invoice_id, payment_date, amount, pph, reference, bukti_potong_url, bukti_potong_no, created_by)
  VALUES
    (p_invoice_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount,
     COALESCE(p_pph, 0), p_reference, p_bukti_potong_url, p_bukti_potong_no, v_uid)
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(SUM(amount), 0) + COALESCE(SUM(pph), 0)
    INTO v_settled
    FROM sp_payments WHERE invoice_id = p_invoice_id;

  v_new_status := CASE
    WHEN v_settled >= (v_total - c_tolerance) THEN 'paid'
    WHEN v_settled > 0                        THEN 'partial'
    ELSE v_inv_status END;

  IF v_new_status IS DISTINCT FROM v_inv_status THEN
    UPDATE sp_invoices
       SET status = v_new_status, updated_at = now()
     WHERE id = p_invoice_id;
  END IF;

  INSERT INTO journal_entries
    (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES
    (v_company_id, COALESCE(p_payment_date, CURRENT_DATE), 'payment_received', v_payment_id,
     'Penerimaan pembayaran invoice ' || COALESCE(v_invoice_no, '(tanpa nomor)'), v_uid)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_bank, p_amount, 0);

  IF COALESCE(p_pph, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_pph, p_pph, 0);
  END IF;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, 0, p_amount + COALESCE(p_pph, 0));

  IF v_new_status = 'paid' THEN
    SELECT customer_id, sp_no INTO v_customer_id, v_sp_no
      FROM sp_orders WHERE id = v_sp_order_id AND deleted_at IS NULL;
    IF v_customer_id IS NOT NULL THEN
      PERFORM sp_recompute_status(v_customer_id, v_sp_no);
    END IF;
  END IF;

  RETURN v_payment_id;
END;
$fn$;


-- =============================================================================
-- STEP 8 — mark_ttf_received(): RPC BARU penerimaan TTF
-- UPSERT, bukan INSERT: kalau invoice sudah punya baris ar_ttfs (ambil yang
-- created_at paling awal), baris itu di-UPDATE. Jadi tombol Edit di UI
-- memanggil RPC yang SAMA tanpa melahirkan TTF kedua.
-- Otorisasi lebih longgar dari record_payment (super_admin / manager ke atas /
-- finance_controller) — menerima faktur adalah aktivitas operasional, bukan
-- pencatatan uang masuk.
-- Field no_ttf/notes hanya ditimpa kalau input baru tidak kosong; no_inv/no_sp
-- hanya diisi kalau sebelumnya masih string kosong (tidak menimpa data lama).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_ttf_received(p_invoice_id uuid, p_received_by text, p_ttf_no text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_status      text;
  v_invoice_no  text;
  v_sp_order_id uuid;
  v_customer_id uuid;
  v_sp_no       text;
  v_ttf_id      uuid;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat penerimaan TTF.';
  END IF;

  IF p_received_by IS NULL OR btrim(p_received_by) = '' THEN
    RAISE EXCEPTION 'Nama penerima wajib diisi.';
  END IF;

  SELECT i.status, i.invoice_no, i.sp_order_id
    INTO v_status, v_invoice_no, v_sp_order_id
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL;

  IF v_status IS NULL   THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status = 'void'  THEN RAISE EXCEPTION 'Invoice sudah void.';      END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft — terbitkan dulu sebelum menandai TTF diterima.';
  END IF;

  SELECT o.customer_id, o.sp_no INTO v_customer_id, v_sp_no
    FROM sp_orders o WHERE o.id = v_sp_order_id AND o.deleted_at IS NULL;

  SELECT t.id INTO v_ttf_id
    FROM ar_ttfs t
   WHERE t.invoice_id = p_invoice_id
   ORDER BY t.created_at
   LIMIT 1;

  IF v_ttf_id IS NULL THEN
    INSERT INTO ar_ttfs (
      no_ttf, tanggal_ttf, tanggal_menerima, no_inv, no_sp,
      customer_id, notes, sp_order_id, invoice_id, diterima_oleh
    ) VALUES (
      COALESCE(NULLIF(btrim(p_ttf_no), ''), ''),
      CURRENT_DATE,
      CURRENT_DATE,
      COALESCE(v_invoice_no, ''),
      COALESCE(v_sp_no, ''),
      v_customer_id,
      COALESCE(NULLIF(btrim(p_notes), ''), ''),
      v_sp_order_id,
      p_invoice_id,
      btrim(p_received_by)
    )
    RETURNING id INTO v_ttf_id;
  ELSE
    UPDATE ar_ttfs SET
      tanggal_menerima = CURRENT_DATE,
      diterima_oleh    = btrim(p_received_by),
      no_ttf = COALESCE(NULLIF(btrim(p_ttf_no), ''), no_ttf),
      notes  = COALESCE(NULLIF(btrim(p_notes),  ''), notes),
      sp_order_id = COALESCE(sp_order_id, v_sp_order_id),
      customer_id = COALESCE(customer_id, v_customer_id),
      no_inv = CASE WHEN no_inv = '' THEN COALESCE(v_invoice_no, '') ELSE no_inv END,
      no_sp  = CASE WHEN no_sp  = '' THEN COALESCE(v_sp_no, '')      ELSE no_sp  END
     WHERE id = v_ttf_id;
  END IF;

  RETURN v_ttf_id;
END;
$fn$;

-- GRANT eksekusi kedua RPC baru (STEP 7 & STEP 8). REVOKE FROM PUBLIC dulu — default
-- PostgreSQL memberi EXECUTE ke PUBLIC untuk fungsi baru.
REVOKE ALL ON FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_payment_date date, p_reference text, p_pph numeric, p_bukti_potong_url text, p_bukti_potong_no text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_payment_date date, p_reference text, p_pph numeric, p_bukti_potong_url text, p_bukti_potong_no text) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_ttf_received(p_invoice_id uuid, p_received_by text, p_ttf_no text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_ttf_received(p_invoice_id uuid, p_received_by text, p_ttf_no text, p_notes text) TO authenticated;


-- =============================================================================
-- STEP 9 — RLS + GRANT hardening sp_payments (setelah RPC-nya ada)
-- Dijalankan TERAKHIR: mencabut INSERT langsung baru aman setelah
-- record_payment (STEP 7) tersedia sebagai satu-satunya jalur tulis.
--
-- Tiga pengetatan sekaligus:
--   1. Policy lama tanpa target role (berlaku ke SEMUA role, termasuk anon)
--      diganti versi eksplisit `TO authenticated`.
--   2. Policy sp_payments_insert DIHAPUS TOTAL — tidak dibuat ulang. INSERT
--      sekarang hanya lewat record_payment (SECURITY DEFINER, bypass RLS).
--   3. `GRANT ALL ON TABLE` (temuan TD-176) diganti SELECT + UPDATE
--      kolom-level 3 kolom: reference, bukti_potong_url, bukti_potong_no.
--      amount/pph/payment_date/invoice_id SENGAJA tidak bisa di-UPDATE lewat
--      PostgREST — nilai uang hanya boleh lahir dari RPC yang juga menulis
--      jurnal, supaya sp_payments dan journal_entry_lines tak pernah pisah.
--      DELETE tetap super_admin-only.
-- =============================================================================

DROP POLICY IF EXISTS sp_payments_insert ON public.sp_payments;
DROP POLICY IF EXISTS sp_payments_read   ON public.sp_payments;
DROP POLICY IF EXISTS sp_payments_update ON public.sp_payments;
DROP POLICY IF EXISTS sp_payments_delete ON public.sp_payments;

CREATE POLICY sp_payments_read ON public.sp_payments FOR SELECT TO authenticated USING ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.sp_invoices i
  WHERE ((i.id = sp_payments.invoice_id) AND (i.company_id IN ( SELECT public.get_user_company_ids() AS get_user_company_ids)))))));

CREATE POLICY sp_payments_update ON public.sp_payments FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.sp_invoices i
  WHERE ((i.id = sp_payments.invoice_id) AND (i.company_id IN ( SELECT public.get_user_company_ids() AS get_user_company_ids)) AND (public.is_manager_or_above() OR public.has_role('finance_controller'::text))))))) WITH CHECK ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.sp_invoices i
  WHERE ((i.id = sp_payments.invoice_id) AND (i.company_id IN ( SELECT public.get_user_company_ids() AS get_user_company_ids)) AND (public.is_manager_or_above() OR public.has_role('finance_controller'::text)))))));

CREATE POLICY sp_payments_delete ON public.sp_payments FOR DELETE TO authenticated USING (public.is_super_admin());

-- GRANT: cabut ALL, ganti SELECT tabel + UPDATE kolom-level.
REVOKE ALL ON TABLE public.sp_payments FROM authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sp_payments TO authenticated;
GRANT UPDATE(reference) ON TABLE public.sp_payments TO authenticated;
GRANT UPDATE(bukti_potong_url) ON TABLE public.sp_payments TO authenticated;
GRANT UPDATE(bukti_potong_no) ON TABLE public.sp_payments TO authenticated;
