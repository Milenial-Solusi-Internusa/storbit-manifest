-- ============================================================================
-- FASE 3 — BTB Step G: migrasi data BTB legacy (sp_btbs → sp_btb) + recompute massal
-- ============================================================================
-- Branch: feat/sp-schema. Tanggal eksekusi manual: 2026-07-08.
--
-- ⚠️ FILE INI ADALAH REKAMAN DATA-MIGRATION, BUKAN UNTUK DIJALANKAN LAGI.
--    Kedua blok SQL di bawah SUDAH LIVE di database (dijalankan manual di
--    Supabase SQL Editor, byte-exact dari yang dijalankan). Menjalankan ulang =
--    idempoten by design untuk Blok 1 (guard NOT EXISTS + n_sp_order=1), tapi
--    tetap JANGAN dijalankan ulang. File ini merekam SQL asli agar tercatat.
--
-- KONTEKS: setelah cutover FE (Step D-E-F), penulisan BTB baru 100% ke sp_btb.
--   Tersisa "delta" baris di sp_btbs legacy yang ditulis SETELAH backfill FASE 0
--   dan belum punya padanan di sp_btb. Step G memindahkan delta itu ke tabel
--   benar, lalu me-recompute status semua SP agar sp_orders.status mencerminkan
--   fakta BTB (BTB_TERBIT = rank tertinggi, mengalahkan TERKIRIM_PENUH).
--
-- BLOK 1 — INSERT delta sp_btbs → sp_btb:
--   Resolve sp_order via sp_no; HANYA baris yang sp_no-nya menunjuk TEPAT 1
--   sp_order (n_sp_order=1 → hindari ambigu customer) DAN belum ada di sp_btb
--   (NOT EXISTS by customer_id+btb_no hidup → hindari duplikat / hormati partial
--   unique sp_btb_no_unique_live). qty & delivery_note_id dibiarkan NULL
--   (historis, tak tersedia di sp_btbs). received_at = created_at legacy.
--   HASIL: 19 baris ter-insert → sp_btb hidup 186 → 205.
--
-- BLOK 2 — recompute massal semua SP (DO loop, PERFORM sp_recompute_status per SP).
--
-- HASIL VERIFIKASI (sebaran akhir sp_orders.status, total 438):
--   BTB_TERBIT 201 · TERKIRIM_PENUH 155 · MENUNGGU_STOK 45 · CONFIRMED 17 ·
--   DIKIRIM 10 · SAMPAI 6 · PICKING 4.
-- ============================================================================


-- ─── Blok 1 — INSERT delta 19 baris BTB legacy → sp_btb ──────────────────────

INSERT INTO sp_btb (company_id, sp_order_id, customer_id, btb_no, remarks, received_at)
SELECT
  o.company_id,
  o.id,
  o.customer_id,
  s.btb_no,
  s.remarks,
  s.created_at
FROM sp_btbs s
JOIN sp_orders o ON o.sp_no = s.sp_no AND o.deleted_at IS NULL
WHERE (SELECT count(*) FROM sp_orders o2 WHERE o2.sp_no = s.sp_no AND o2.deleted_at IS NULL) = 1
  AND NOT EXISTS (
    SELECT 1 FROM sp_btb b
    WHERE b.customer_id = o.customer_id AND b.btb_no = s.btb_no AND b.deleted_at IS NULL
  );


-- ─── Blok 2 — recompute massal semua SP ──────────────────────────────────────

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT customer_id, sp_no FROM sp_orders WHERE deleted_at IS NULL LOOP
    PERFORM sp_recompute_status(r.customer_id, r.sp_no);
  END LOOP;
END; $do$;
