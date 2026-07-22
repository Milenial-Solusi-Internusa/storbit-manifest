-- STATUS: SUDAH DIJALANKAN 22 Jul 2026, terverifikasi.
-- Bukti: backup inquiries_status_backup_20260722 berisi 205 baris. Sebaran status
-- sesudah backfill: WON 3, QUOTED 66, OPEN 136 (total 205). Cocok dengan survei
-- pra-migrasi: jadi_won 3, jadi_quoted 66, punya_submitted_saja 22,
-- punya_draft_saja 74, tanpa_dokumen 40 (22 + 74 + 40 = 136 yang tetap OPEN).
--
-- FASE 2 — menghidupkan sumbu deal per-inquiry di kolom inquiries.status.
-- Kolom ini sebelumnya MATI: seluruh 205 baris permanen 'OPEN' karena satu-satunya
-- penulisnya adalah insert (InquiryFormPage.jsx:292 mengirim status:'OPEN'), dan
-- tidak ada satu pun trigger/RPC/tombol yang pernah memindahkannya. UI sudah lama
-- merender enam nilai status (InquiryListPage.jsx:41-48) yang lima di antaranya
-- tidak akan pernah muncul.
--
-- Langkah 1 dari 3. Berikutnya: 20260722000003 (CHECK constraint) lalu
-- 20260722000004 (tiga trigger). Sengaja dipisah supaya bisa di-revert granular.
--
-- ── KEPUTUSAN DESAIN YANG PERLU DIINGAT ─────────────────────────────────────
--
-- (1) Pemicu QUOTED adalah quotation berstatus 'SENT', BUKAN 'SUBMITTED'.
--     Alur quotation di sistem ini DRAFT -> SUBMITTED -> SENT; hanya SENT yang
--     berarti sudah sampai ke customer (QuotationDetailPage.jsx:258 mengisi
--     quote_sent_at bersamaan status SENT). 22 inquiry yang quotation-nya baru
--     SUBMITTED SENGAJA tetap OPEN — harganya belum keluar dari kantor.
--
-- (2) WON hanya diberikan pada inquiry yang punya Sales Order.
--     Ada 28 akun ber-stage WON di accounts.pipeline_stage, mencakup 52 inquiry,
--     tetapi hanya 3 Sales Order yang benar-benar ada. 51 sisanya tidak punya
--     bukti dokumen apa pun, jadi TIDAK di-backfill jadi WON. Status customer
--     mereka tetap utuh di accounts.account_status — tidak ada informasi yang
--     hilang; yang tidak diberikan hanya penanda posisi di papan deal.
--
-- Backup dibuat SEBELUM update apa pun. Dipakai oleh blok ROLLBACK di kaki
-- 20260722000004. Jangan di-drop sampai Fase 2 dinyatakan stabil.

CREATE TABLE inquiries_status_backup_20260722 AS
SELECT id, status, updated_at FROM public.inquiries WHERE deleted_at IS NULL;

UPDATE public.inquiries i
SET status = 'WON', updated_at = now()
WHERE i.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.sales_orders so
              WHERE so.inquiry_id = i.id AND so.deleted_at IS NULL);

UPDATE public.inquiries i
SET status = 'QUOTED', updated_at = now()
WHERE i.deleted_at IS NULL
  AND i.status <> 'WON'
  AND EXISTS (SELECT 1 FROM public.quotations q
              WHERE q.inquiry_id = i.id AND q.deleted_at IS NULL
                AND q.status = 'SENT');

-- ─── VERIFIKASI (jalankan TERPISAH setelah migrasi di atas) ───────────────────
-- Harus: WON 3, QUOTED 66, OPEN 136 — total 205, sama dengan jumlah baris backup.
--
--   SELECT status, count(*) FROM public.inquiries
--   WHERE deleted_at IS NULL GROUP BY status ORDER BY 2 DESC;
--
--   SELECT count(*) AS backup_rows FROM inquiries_status_backup_20260722;
