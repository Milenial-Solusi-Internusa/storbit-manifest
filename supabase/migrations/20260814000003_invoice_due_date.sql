-- =============================================================================
-- Migration: 20260814000003_invoice_due_date
-- Phase:     Due date invoice — stored-at-submit, bukan live-compute (rapat
--            Storbit 13 Agu 2026). Default SOA 14 hari, Indomarco override
--            30 hari.
-- Depends:   entity_finance_settings genuinely kosong total sebelum migrasi
--            ini (dikonfirmasi 14 Agu 2026, semua entitas nol baris) — INSERT
--            baru di sini, bukan UPDATE.
-- Status:    SUDAH DIJALANKAN 14 Agu 2026 — REKAMAN, JANGAN dijalankan ulang
--            begitu saja tanpa cek dulu apakah masih match yang live.
--
-- CATATAN DESAIN:
--   - due_date DIISI SEKALI di submit_invoke, saat status berubah ke
--     'submitted'. TIDAK dihitung ulang tiap invoice.invoice_date/terms
--     berubah setelahnya — begitu tersimpan, permanen (kecuali invoice
--     itu sendiri di-void & diterbitkan ulang, di luar cakupan migrasi ini).
--   - 2 invoice existing (INV lama, sudah 'issued' sebelum migrasi ini)
--     TIDAK di-backfill — due_date mereka tetap NULL, karena mereka
--     genuinely diterbitkan sebelum sistem due-date ini ada.
--   - Prioritas resolusi (persis draft yang direview Den): (1) kolom baru
--     accounts.invoice_payment_terms_days kalau terisi utk customer itu,
--     (2) entity_finance_settings via default_payment_term_id ->
--     payment_terms.days_due (kalau is_active), fallback ke kolom mentah
--     default_payment_terms kalau FK NULL, (3) hardcode 30 hari — sama
--     persis urutan fallback yang sudah ada di getInvoicePdfData (db.js),
--     supaya perilaku baru konsisten dgn yang lama, bukan logic baru.
--   - Path B dipilih (FK default_payment_term_id, BUKAN kolom mentah
--     default_payment_terms) — dikonfirmasi FinanceDefaultsPage.jsx HANYA
--     baca/tulis default_payment_term_id, kolom mentah tak tersentuh sama
--     sekali oleh UI Admin Settings manapun. Konsekuensi: perlu baris
--     payment_terms baru (NET14) krn SOA sebelumnya nol entri persis 14
--     hari (ada 7/15/30/45/60, bukan 14).
--   - due_date SENGAJA TIDAK di-GRANT ke authenticated (pola sama dgn
--     status/invoice_no/total_* di sp_invoices — RPC-only, PostgREST
--     langsung tidak bisa nulis kolom ini).
-- =============================================================================

-- 1. Payment term baru SOA — genuinely belum ada entri 14 hari (7/15/30/45/60 ada)
INSERT INTO public.payment_terms (company_id, code, name, days_due, is_active)
VALUES ('d2e5e565-5f67-4954-b8d9-5979a2a0c697', 'NET14', 'Net 14 Days', 14, true);

-- 2. Kolom baru sp_invoices — nullable, invoice lama TIDAK di-backfill
ALTER TABLE public.sp_invoices ADD COLUMN due_date date;

-- 3. Kolom baru accounts — override per-customer, nullable
ALTER TABLE public.accounts ADD COLUMN invoice_payment_terms_days integer;

-- 4. submit_invoice — tambah resolusi + simpan due_date, sisanya (guard,
--    status, submitted_at, sp_recompute_status) tidak berubah.
CREATE OR REPLACE FUNCTION public.submit_invoice(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sp_order_id uuid; v_customer_id uuid; v_sp_no text; v_status text;
  v_company_id uuid; v_invoice_date date;
  v_override_days int; v_term_days int; v_due_date date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin submit invoice.';
  END IF;

  SELECT sp_order_id, status, company_id, invoice_date
    INTO v_sp_order_id, v_status, v_company_id, v_invoice_date
    FROM sp_invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status <> 'issued' THEN
    RAISE EXCEPTION 'Invoice berstatus % — cuma invoice "issued" yang bisa di-submit.', v_status;
  END IF;

  SELECT customer_id, sp_no INTO v_customer_id, v_sp_no FROM sp_orders WHERE id = v_sp_order_id;

  SELECT invoice_payment_terms_days INTO v_override_days FROM accounts WHERE id = v_customer_id;

  IF v_override_days IS NOT NULL THEN
    v_term_days := v_override_days;
  ELSE
    SELECT (CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END) INTO v_term_days
      FROM entity_finance_settings efs
      LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
      WHERE efs.company_id = v_company_id;
    IF v_term_days IS NULL THEN
      SELECT default_payment_terms INTO v_term_days FROM entity_finance_settings WHERE company_id = v_company_id;
    END IF;
    v_term_days := COALESCE(v_term_days, 30);
  END IF;

  v_due_date := v_invoice_date + v_term_days;

  UPDATE sp_invoices SET status = 'submitted', submitted_at = now(), updated_at = now(), due_date = v_due_date
   WHERE id = p_invoice_id;

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
END; $$;

-- 5. entity_finance_settings SOA — baris baru (tabel genuinely kosong sebelum
--    ini), pakai FK ke NET14, sisanya ikut column default masing-masing.
INSERT INTO public.entity_finance_settings (company_id, default_payment_term_id)
VALUES (
  'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
  (SELECT id FROM public.payment_terms WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND code='NET14')
);

-- 6. Override Indomarco — 30 hari
UPDATE public.accounts SET invoice_payment_terms_days = 30
 WHERE id = 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661';

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
--   SELECT invoice_payment_terms_days FROM accounts WHERE id='a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'; -- 30
--   SELECT default_payment_term_id FROM entity_finance_settings WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697';
--   SELECT invoice_no, due_date FROM sp_invoices WHERE invoice_no LIKE 'SOA-INV-%' OR invoice_no LIKE 'INV/SOA%';
--   -- 2 invoice lama harus due_date IS NULL
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.sp_invoices DROP COLUMN IF EXISTS due_date;
-- ALTER TABLE public.accounts DROP COLUMN IF EXISTS invoice_payment_terms_days;
-- DELETE FROM public.entity_finance_settings WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697';
-- DELETE FROM public.payment_terms WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND code='NET14';
-- (lalu CREATE OR REPLACE submit_invoice kembali ke versi tanpa due_date, lihat
--  migrasi/PROGRESS.md sebelum 14 Agu 2026 utk body persisnya)
