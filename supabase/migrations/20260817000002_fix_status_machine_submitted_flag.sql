-- =============================================================================
-- Migration: 20260817000002_fix_status_machine_submitted_flag
-- Phase:     Fix bug mesin status SP — SP bisa MUNDUR dari SUBMITTED ke
--            INVOICED setelah pembayaran parsial.
-- Depends:   20260817000001_fase5_jurnal_ar_payments_ttf (versi
--            sp_recompute_status yang sudah punya cabang LUNAS).
-- Status:    ⚠️ BELUM DIJALANKAN saat file ini ditulis — kebalikan dari
--            20260817000001 yang retroaktif. File ini ditulis LEBIH DULU,
--            SQL-nya menyusul dijalankan manual di SQL Editor.
--
-- =============================================================================
-- BUG
-- =============================================================================
-- `sp_invoices.status` memikul DUA sumbu sekaligus dalam satu kolom:
--   - tahap dokumen    : draft → issued → submitted
--   - tahap pembayaran : partial → paid
-- Keduanya berbagi kolom yang sama, jadi saling menimpa.
--
-- `record_payment` (FASE 5) menulis `status = 'partial'` begitu ada pembayaran
-- sebagian. Nilai 'submitted' tertimpa — dan bersamanya hilang pula jejak
-- "invoice ini PERNAH disubmit", karena `sp_recompute_status` membaca
-- `status='submitted'` PERSIS, bukan "pernah submitted".
--
-- Akibatnya, recompute yang terpicu peristiwa lain SETELAH pembayaran parsial
-- menghitung v_submitted = false, lalu jatuh ke cabang berikutnya:
--
--     WHEN v_paid       THEN 'LUNAS'        -- false (baru dibayar sebagian)
--     WHEN v_submitted  THEN 'SUBMITTED'    -- false PADAHAL sudah disubmit  ← bug
--     WHEN v_has_invoice THEN 'INVOICED'    -- true  → SP MUNDUR ke sini
--
-- SP turun dari SUBMITTED ke INVOICED. Mundurnya status di mesin 12-tahap ini
-- salah secara semantik: submit ke sistem Indomarco adalah peristiwa yang sudah
-- terjadi dan tak bisa "batal terjadi" gara-gara pelanggan mencicil.
--
-- Ditemukan lewat pembacaan kode saat mendokumentasikan FASE 5, BUKAN dari
-- laporan bug lapangan. Peluangnya hari ini kecil (record_payment hanya
-- memanggil recompute saat invoice jadi 'paid', bukan saat 'partial') — tapi
-- bukan kondisi mustahil: cukup satu peristiwa LAIN yang memicu recompute pada
-- SP yang invoice-nya submitted + dibayar sebagian. Diperbaiki preventif,
-- sebelum ada data produksi yang terlanjur salah.
--
-- =============================================================================
-- FIX — SATU BARIS
-- =============================================================================
-- Basis v_submitted dipindah dari STATUS SAAT INI (mudah tertimpa) ke FAKTA
-- HISTORIS `submitted_at` (satu arah, tak pernah dibersihkan):
--
--   Dari:  ... WHERE sp_order_id=v_id AND status='submitted'
--   Jadi:  ... WHERE sp_order_id=v_id AND submitted_at IS NOT NULL AND status <> 'void'
--
-- Sisa body fungsi TIDAK berubah sama sekali — minimal-diff, pendekatan yang
-- sama seperti waktu cabang LUNAS ditambahkan di 20260817000001. Urutan CASE
-- juga tak disentuh: v_paid tetap di atas v_submitted, jadi invoice yang sudah
-- lunas tetap menang jadi LUNAS, bukan tersangkut di SUBMITTED.
--
-- KENAPA `submitted_at` AMAN DIPAKAI SEBAGAI PENANDA (diverifikasi, bukan
-- asumsi — kalau salah satu poin ini berubah di masa depan, fix ini rapuh):
--   1. Hanya SATU statement di seluruh DB yang menulisnya: `submit_invoice`
--      (SET submitted_at = now()). Selalu now(), TIDAK PERNAH di-NULL-kan.
--   2. Dari 3 statement `UPDATE sp_invoices` yang ada — create_invoice
--      (totals), record_payment (status+updated_at), submit_invoice — hanya
--      submit_invoice yang menyentuh kolom ini. record_payment TIDAK.
--   3. Kolom `submitted_at` TIDAK ter-GRANT ke `authenticated` (warisan
--      hardening TD-175: sp_invoices pakai GRANT UPDATE kolom-spesifik, dan
--      submitted_at sengaja tak masuk daftar) → PostgREST tak bisa menulis
--      apalagi menghapusnya.
--   4. Guard `submit_invoice` menolak apa pun selain status='issued', jadi
--      submitted_at juga tak bisa ditimpa dua kali.
--
-- CAKUPAN DAMPAK (disurvei sebelum perubahan, dicatat supaya tak perlu
-- diulang): pembanding `sp_invoices.status='submitted'` di SQL cuma ADA SATU,
-- yaitu baris yang diganti ini. Di frontend ada 3 titik
-- (`SalesOrderDetailPage.jsx` — gate showPaymentForm, gate showTtfBlock, badge
-- status invoice) tapi ketiganya membaca `sp_invoices.status` LANGSUNG untuk
-- keperluan UI, nol ketergantungan pada v_submitted. Migrasi ini hanya mengubah
-- cara `sp_orders.status` DITURUNKAN; `sp_invoices.status` sendiri tak disentuh
-- — jadi ketiga titik FE itu berperilaku persis sama seperti sebelumnya.
--
-- KENAPA ADA KLAUSA `AND status <> 'void'` — berpasangan dengan `submitted_at`:
-- basis historis membuat v_submitted "abadi" (sekali submitted_at terisi,
-- selamanya true). Tanpa penjaga, invoice yang sudah submitted lalu di-void
-- akan tetap membuat SP tampil SUBMITTED padahal v_has_invoice sudah false —
-- baris tetangganya memang sudah mengecualikan void. SP jadi "SUBMITTED tanpa
-- invoice aktif", kondisi yang tak punya arti di mesin status.
--
-- Klausa ini SENGAJA DISERTAKAN meski hari ini skenarionya MURNI TEORETIS —
-- tak ada satu pun jalur kode yang bisa menulis status 'void' ('void' cuma
-- muncul sebagai guard pembacaan + CHECK constraint), jadi belum bisa terjadi.
-- Tiga alasan tetap dimasukkan sekarang: (a) menyelaraskan dengan
-- v_has_invoice di baris atasnya yang sudah memakai `status <> 'void'` —
-- menambahkannya bikin konsisten, bukan mengada-ada; (b) biayanya nol, tetap
-- satu baris; (c) menutup celah SEBELUM fitur void invoice dibangun, bukan
-- sesudah — supaya tak jadi bug yang menunggu.
--
-- ⚠️ HARDCODE UUID SOA (`v_company`) DIPERTAHANKAN apa adanya — TD-178, di
--    luar cakupan fix ini. Jangan ikut "dirapikan" di sini.
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
  v_submitted   := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=v_id AND submitted_at IS NOT NULL AND status <> 'void');
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
