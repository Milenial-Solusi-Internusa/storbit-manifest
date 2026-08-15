-- =============================================================================
-- Migration: 20260814000002_invoice_no_format
-- Phase:     Format nomor invoice Storbit SP (hasil rapat 13 Agu 2026)
-- Purpose:   Ganti format invoice_no dari "INV/{entitas}/FIN/{tahun}/{urut}"
--            jadi "{entitas}-INV-{bulan romawi}-{tahun}-{urut}". Contoh:
--            invoice Agustus 2026 -> SOA-INV-VIII-2026-0004.
-- Status:    SUDAH DIJALANKAN 14 Agu 2026 — REKAMAN, JANGAN dijalankan ulang
--            begitu saja tanpa cek dulu apakah masih match yang live
--            (pg_get_functiondef).
--
-- CATATAN PENTING:
--   - increment_document_sequence(...) TIDAK berubah — masih dipanggil
--     persis sama (document_type='INV', department_code='FIN', p_month:=0,
--     p_day:=0). Counter tetap yearly-rolling per (company_id, year),
--     BUKAN reset per bulan — dikonfirmasi langsung dari body
--     increment_document_sequence sebelum migrasi ini ditulis, bukan
--     asumsi. Bulan romawi di nomor HANYA representasi visual bulan
--     invoice dibuat, tidak mereset/mempengaruhi urutan sama sekali.
--   - Format lama ("INV/SOA/FIN/2026/0001" & "0002") TIDAK diubah/rename —
--     2 invoice itu (SP 2017320 & SP 2268718) sudah terbit sebelum migrasi
--     ini, dibiarkan apa adanya. Format baru HANYA berlaku invoice baru
--     sejak migrasi ini.
--   - Sequence counter (document_sequences, company_id=SOA/INV/FIN/2026)
--     saat migrasi ini ditulis sudah di last_sequence=3 (bukan 2) — invoice
--     nyata ke-3 milik SP test ZZZTEST-NOTIFY-001 (sesi testing notifikasi
--     14 Agu 2026, sudah dihapus). Invoice REAL berikutnya akan bernomor
--     urut 0004, bukan 0001 — gap di 0003 permanen & disengaja (document
--     sequence tak pernah di-reuse/renumber, standar praktik).
--   - Companion fix (file terpisah, TIDAK di migrasi SQL ini): InvoicePDF.jsx
--     baris shortInvoiceNo — regex strip prefix diperbarui dari /^INV\// ke
--     /^[A-Z]+-INV-/ supaya tetap match format baru (label vertikal PDF).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice(p_sp_order_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text; v_entity_code text;
  v_year         int := extract(year from now())::int;
  v_month_roman  text;
  v_seq          int; v_invoice_no text; v_invoice_id uuid;
  v_ordered      int; v_shipped int;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
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

  PERFORM sp_recompute_status(v_customer_id, v_sp_no);
  RETURN v_invoice_id;
END; $$;

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='create_invoice';
--   -- cek body persis seperti di atas
--
--   SELECT invoice_no FROM sp_invoices WHERE invoice_no IN
--     ('INV/SOA/FIN/2026/0001','INV/SOA/FIN/2026/0002');
--   -- harus tetap 2 baris, format lama, tidak berubah
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Kembalikan v_invoice_no ke format lama (hapus v_month_roman dari DECLARE +
-- CASE dari body, kembalikan baris v_invoice_no ke):
--   v_invoice_no := 'INV/' || v_entity_code || '/FIN/' || v_year || '/' || lpad(v_seq::text, 4, '0');
