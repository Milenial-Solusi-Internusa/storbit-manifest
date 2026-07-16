-- ============================================================================
-- Level 2 / Task H7 — tambah sp_items.price_category + sp_items.review_status
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-16.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase SQL
--    Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli agar
--    tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS (Task H7 "kunci harga Edit Item SP", lihat 10_TASK_BREAKDOWN.md):
--   • price_category — kategori harga SP (semester/tahunan/project/default).
--     Diisi MANUAL per PKS (keputusan tim ops: kategori tak bisa diturunkan
--     otomatis; ada anomali SP dibuat Juni tapi rilis Juli memakai harga lama).
--   • review_status — penanda SEMENTARA untuk rekonsiliasi SP lama:
--       'review_default' = unit_price cocok dengan products.default_price
--       'perlu_review'   = beda → cek kontrak/PKS manual
--     Kolom ini BISA DI-DROP setelah rekonsiliasi selesai.
--
-- ⚠️ unit_price TIDAK diubah sama sekali. Harga SP = snapshot (keputusan bisnis:
--    harga SP lama tetap walau Master Product di-update, kecuali koreksi khusus).
--
-- HASIL (saat eksekusi manual): 587 'perlu_review' + 140 'review_default' = 727
--   baris (0 NULL).
--
-- CATATAN DOMAIN NILAI (terbuka — lihat TD-72): price_category di sp_items dipakai
--   dengan nilai 'default'/'semester'/'legacy' dst dan BELUM diberi CHECK
--   constraint, sedangkan sp_order_items.price_category punya CHECK ketat
--   ('semester','tahunan','project'). Penyatuan domain belum diputuskan.
-- ============================================================================

alter table sp_items add column if not exists price_category text;
alter table sp_items add column if not exists review_status text;
update sp_items si
set review_status = case
  when round(si.unit_price) = round(p.default_price) then 'review_default'
  else 'perlu_review'
end
from products p where p.id = si.product_id;

-- Verifikasi (saat eksekusi manual):
-- SELECT review_status, count(*) FROM sp_items GROUP BY review_status;
-- Harapan: perlu_review = 587, review_default = 140, NULL = 0 (total 727).
