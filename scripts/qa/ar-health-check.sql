-- =============================================================================
-- ar-health-check.sql -- cek kesehatan piutang & jurnal invoice. 100% BACA.
--
-- Berkas ini TIDAK menulis apa pun: nol INSERT/UPDATE/DELETE, nol DDL, nol
-- pemanggilan fungsi yang menulis. Aman dijalankan ke STAGING maupun
-- PRODUCTION. Ia juga tidak menyaring per entitas atau per nomor SP -- yang
-- diperiksa adalah SELURUH invoice hidup di DB yang sedang dibuka.
--
-- Cara jalan (pilih satu):
--   psql "$DB_URL" -f scripts/qa/ar-health-check.sql
--   salin BAGIAN A ke Supabase SQL Editor (satu query, tanpa perintah psql)
--
-- -----------------------------------------------------------------------------
-- KENAPA ADA
-- -----------------------------------------------------------------------------
-- Migrasi 20260926000002 (AR Tahap 1) memasang invariant "debit piutang =
-- total_amount" DI DALAM create_invoice_for_sp, sehingga invoice yang terbit
-- SESUDAHNYA tidak bisa mendarat timpang. Invoice LAMA tidak pernah diperiksa:
-- jurnalnya lahir dari jalur lama yang tidak punya invariant itu.
--
-- Berkas ini memberi invariant yang sama sebagai PEMERIKSAAN, bukan sebagai
-- penjaga. Ia menjawab satu pertanyaan: "apakah yang sudah terlanjur ada
-- memenuhi aturan yang kini berlaku untuk yang baru?"
--
-- !! H1 adalah yang paling penting dan paling mudah terlewat. Bug laten
-- delivery_note_items.sp_order_item_id (doc 12 butir 6) membuat invoice terbit
-- dengan total_amount TERISI, NOL jurnal, dan NOL error. Kerusakannya tidak
-- berupa angka yang salah, melainkan angka yang TIDAK ADA -- laporan yang
-- menjumlahkan jurnal akan tampak rapi justru karena barisnya hilang.
--
-- -----------------------------------------------------------------------------
-- CARA MEMBACANYA
-- -----------------------------------------------------------------------------
-- Kolom hasil: BERSIH / PERIKSA. "PERIKSA" bukan berarti ada bug di kode hari
-- ini -- ia berarti ADA BARIS yang tidak memenuhi invariant, dan yang
-- dibutuhkan berikutnya adalah KEPUTUSAN AKUNTANSI, bukan UPDATE diam-diam.
-- Jangan memperbaiki data dari berkas ini. Berkas ini hanya menghitung.
--
-- !! Toleransi H2 = jumlah jurnal x Rp1, sama persis dengan yang dipakai
-- invariant di create_invoice_for_sp. Angka itu DIUKUR, bukan dikira-kira:
-- dari 507 invoice berjurnal di produksi (25 Sep 2026), 474 pas persis dan 33
-- berselisih tepat Rp1, nol di atas Rp1 -- sisa pembulatan per Surat Jalan.
-- Kalau toleransi di migrasi kelak berubah, ubah di SINI juga: dua tempat,
-- harus bergerak bersama.
--
-- !! Akun piutang dicari lewat KODE '1-1200', persis seperti yang dilakukan
-- create_invoice_for_sp hari ini. Draft CoA Finance yang baru mengubah ARTI
-- kode yang sama, jadi begitu pemetaan peran akun dipasang (AR Tahap 2),
-- berkas ini WAJIB ikut pindah ke pemetaan itu -- kalau tidak, ia akan
-- mengukur akun yang salah dan melaporkan BERSIH dengan yakin.
--
-- Hasil pertama (STAGING, 25 Sep 2026): H1..H5 BERSIH; H6 = 5 baris, SELURUHNYA
-- milik ZZZTEST-SP-0001 -- SP uji buatan tangan 26 Agu 2026 yang punya 5 baris
-- sp_items lama tapi hanya 1 sp_order_items, dan yang satu itu legacy_sp_item_id
-- NULL. Pasangannya memang tidak pernah ada, jadi backfill 20260925000001 benar
-- ketika membiarkannya: ia tidak bisa mengarang kaitan.
--
-- !! Itu pelajaran cara membaca H6: nilai > 0 TIDAK otomatis berarti migrasi
-- backfill gagal. Ia bisa berarti SP-nya tidak punya pasangan sp_order_items
-- sama sekali. B4 memisahkan keduanya -- periksa dulu apakah SP-nya memang
-- lahir lewat create_sp_order_dual sebelum menyimpulkan ada yang rusak.
--
-- Status: dibuat 25 Sep 2026. Dijalankan ke STAGING 25 Sep 2026.
--         PRODUKSI: belum dijalankan (keputusan Den -- hasil pertamanya harus
--         dilihat manusia, bukan dipakai sebagai gate otomatis).
-- Terkait: TD-275 - 12_ANTREAN_MIGRASI_PRODUCTION.md butir 6 dan 9.
-- =============================================================================


-- =============================================================================
-- BAGIAN A -- RINGKASAN. Satu query, enam baris.
-- =============================================================================
WITH inv AS (
  SELECT i.id,
         i.invoice_no,
         i.status,
         i.total_amount,
         i.due_date,
         i.sp_order_id,
         (SELECT count(*) FROM journal_entries je
           WHERE je.reference_type = 'invoice_issued' AND je.reference_id = i.id) AS n_je,
         COALESCE((SELECT SUM(jl.debit)
                     FROM journal_entries je
                     JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
                     JOIN chart_of_accounts c    ON c.id = jl.account_id
                    WHERE je.reference_type = 'invoice_issued'
                      AND je.reference_id = i.id
                      AND c.code = '1-1200'), 0) AS debit_piutang
    FROM sp_invoices i
   WHERE i.deleted_at IS NULL
), je_semua AS (
  -- Jurnal yang lahir dari rantai AR: penerbitan invoice dan penerimaan bayar.
  SELECT je.id
    FROM journal_entries je JOIN sp_invoices i ON i.id = je.reference_id
   WHERE je.reference_type = 'invoice_issued' AND i.deleted_at IS NULL
   UNION
  SELECT je.id
    FROM journal_entries je
    JOIN sp_payments p  ON p.id = je.reference_id
    JOIN sp_invoices i2 ON i2.id = p.invoice_id
   WHERE je.reference_type = 'payment_received' AND i2.deleted_at IS NULL
)
SELECT 'H1' AS kode,
       'invoice non-void TANPA jurnal sama sekali' AS uji,
       count(*)::text AS diukur,
       '0' AS ambang,
       CASE WHEN count(*) = 0 THEN 'BERSIH' ELSE 'PERIKSA' END AS hasil
  FROM inv WHERE status <> 'void' AND n_je = 0

UNION ALL
SELECT 'H2',
       'debit piutang <> total_amount di luar toleransi (n_jurnal x Rp1)',
       count(*)::text, '0',
       CASE WHEN count(*) = 0 THEN 'BERSIH' ELSE 'PERIKSA' END
  FROM inv
 WHERE status <> 'void' AND n_je > 0
   AND abs(debit_piutang - total_amount) > GREATEST(n_je, 1) * 1

UNION ALL
SELECT 'H3',
       'jurnal AR timpang (debit <> kredit)',
       count(*)::text, '0',
       CASE WHEN count(*) = 0 THEN 'BERSIH' ELSE 'PERIKSA' END
  FROM (SELECT je.id
          FROM journal_entries je
          JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
         WHERE je.id IN (SELECT id FROM je_semua)
         GROUP BY je.id
        HAVING COALESCE(SUM(jl.debit), 0) <> COALESCE(SUM(jl.credit), 0)) t

UNION ALL
SELECT 'H4',
       'jurnal penerbitan MASIH menempel pada invoice void',
       count(*)::text, '0',
       CASE WHEN count(*) = 0 THEN 'BERSIH' ELSE 'PERIKSA' END
  FROM inv WHERE status = 'void' AND n_je > 0

UNION ALL
-- H5 KONTEKS, bukan cacat. due_date baru diisi saat terbit sejak AR Tahap 1;
-- invoice lama memang NULL (produksi 25 Sep 2026: 508 dari 509). Backfill-nya
-- sengaja BUKAN Tahap 1 (keputusan D-14). Angkanya di sini supaya terlihat
-- menyusut saat backfill kelak dijalankan.
SELECT 'H5',
       'KONTEKS: invoice hidup ber-due_date NULL (backfill = AR Tahap 2)',
       count(*)::text, '(konteks)',
       'INFO'
  FROM inv WHERE status <> 'void' AND due_date IS NULL

UNION ALL
-- H6 adalah SEBAB paling mungkin dari H1, bukan gejala terpisah. Kalau H1
-- berbunyi, periksa H6 lebih dulu sebelum menyalahkan data jurnal.
SELECT 'H6',
       'baris Surat Jalan tanpa sp_order_item_id (sebab H1; doc 12 butir 6)',
       count(*)::text, '0',
       CASE WHEN count(*) = 0 THEN 'BERSIH' ELSE 'PERIKSA' END
  FROM delivery_note_items dni
  JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
 WHERE dni.sp_order_item_id IS NULL
   AND dn.status <> 'cancelled'

ORDER BY 1;


-- =============================================================================
-- BAGIAN B -- RINCIAN. Jalankan hanya kalau BAGIAN A berbunyi PERIKSA.
-- Keempatnya baca-saja dan tidak saling bergantung.
-- =============================================================================

-- B1 untuk H1 -- invoice non-void tanpa jurnal, beserta bahan diagnosanya.
-- Kolom n_sj_bertandatangan menjelaskan SEBABNYA: create_invoice_for_sp
-- menjurnal PER Surat Jalan delivered ber-signed_date, jadi nol di kolom itu
-- berarti memang tidak ada yang bisa dijurnal, bukan jurnal yang hilang.
SELECT i.invoice_no, i.status, i.invoice_date, i.total_amount, o.sp_no,
       (SELECT count(*) FROM delivery_notes d
         WHERE d.sp_order_id = i.sp_order_id
           AND d.status = 'delivered' AND d.signed_date IS NOT NULL) AS n_sj_bertandatangan,
       (SELECT count(*) FROM delivery_note_items dni
          JOIN delivery_notes d2 ON d2.id = dni.delivery_note_id
         WHERE d2.sp_order_id = i.sp_order_id
           AND dni.sp_order_item_id IS NULL) AS n_baris_sj_tanpa_kaitan
  FROM sp_invoices i JOIN sp_orders o ON o.id = i.sp_order_id
 WHERE i.deleted_at IS NULL AND i.status <> 'void'
   AND NOT EXISTS (SELECT 1 FROM journal_entries je
                    WHERE je.reference_type = 'invoice_issued' AND je.reference_id = i.id)
 ORDER BY i.invoice_date, i.invoice_no;

-- B2 untuk H2 -- selisih per invoice, terbesar dulu. Kolom selisih_per_jurnal
-- memisahkan sisa pembulatan (nilainya 0 atau 1) dari cacat sungguhan.
SELECT i.invoice_no, i.status, i.total_amount,
       (SELECT count(*) FROM journal_entries je
         WHERE je.reference_type = 'invoice_issued' AND je.reference_id = i.id) AS n_je,
       COALESCE((SELECT SUM(jl.debit)
                   FROM journal_entries je
                   JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
                   JOIN chart_of_accounts c    ON c.id = jl.account_id
                  WHERE je.reference_type = 'invoice_issued'
                    AND je.reference_id = i.id AND c.code = '1-1200'), 0) AS debit_piutang,
       COALESCE((SELECT SUM(jl.debit)
                   FROM journal_entries je
                   JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
                   JOIN chart_of_accounts c    ON c.id = jl.account_id
                  WHERE je.reference_type = 'invoice_issued'
                    AND je.reference_id = i.id AND c.code = '1-1200'), 0) - i.total_amount AS selisih,
       round((COALESCE((SELECT SUM(jl.debit)
                   FROM journal_entries je
                   JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
                   JOIN chart_of_accounts c    ON c.id = jl.account_id
                  WHERE je.reference_type = 'invoice_issued'
                    AND je.reference_id = i.id AND c.code = '1-1200'), 0) - i.total_amount)
             / GREATEST((SELECT count(*) FROM journal_entries je
                          WHERE je.reference_type = 'invoice_issued'
                            AND je.reference_id = i.id), 1), 2) AS selisih_per_jurnal
  FROM sp_invoices i
 WHERE i.deleted_at IS NULL AND i.status <> 'void'
 ORDER BY abs(COALESCE((SELECT SUM(jl.debit)
                   FROM journal_entries je
                   JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
                   JOIN chart_of_accounts c    ON c.id = jl.account_id
                  WHERE je.reference_type = 'invoice_issued'
                    AND je.reference_id = i.id AND c.code = '1-1200'), 0) - i.total_amount) DESC
 LIMIT 50;

-- B3 untuk H4 -- invoice void yang jurnal penerbitannya belum dicabut.
SELECT i.invoice_no, i.status, i.total_amount, je.entry_no, je.entry_date
  FROM sp_invoices i
  JOIN journal_entries je ON je.reference_type = 'invoice_issued' AND je.reference_id = i.id
 WHERE i.deleted_at IS NULL AND i.status = 'void'
 ORDER BY i.invoice_no;

-- B4 untuk H6 -- Surat Jalan yang punya baris tanpa kaitan ke item SP.
-- Ini daftar kerja untuk backfill doc 12 butir 6, bukan daftar kerusakan:
-- selama Surat Jalannya belum pernah ditagih, tidak ada angka yang salah.
-- Kolom n_soi_berlegacy memisahkan dua sebab yang tampak sama: baris yang
-- backfill-nya belum jalan (pasangannya ADA) vs SP yang memang tidak punya
-- pasangan sp_order_items sama sekali (nilai 0 -- tidak ada yang bisa
-- di-backfill, dan itu bukan cacat).
SELECT o.sp_no, dn.do_no, dn.status, dn.signed_date,
       count(*) FILTER (WHERE dni.sp_order_item_id IS NULL) AS baris_tanpa_kaitan,
       count(*) AS baris_total,
       (SELECT count(*) FROM sp_order_items soi
         WHERE soi.sp_order_id = dn.sp_order_id
           AND soi.legacy_sp_item_id IS NOT NULL) AS n_soi_berlegacy,
       (SELECT count(*) FROM sp_invoices i
         WHERE i.sp_order_id = dn.sp_order_id AND i.deleted_at IS NULL) AS n_invoice
  FROM delivery_note_items dni
  JOIN delivery_notes dn ON dn.id = dni.delivery_note_id
  JOIN sp_orders o       ON o.id = dn.sp_order_id
 WHERE dn.status <> 'cancelled'
 GROUP BY o.sp_no, dn.do_no, dn.status, dn.signed_date, dn.sp_order_id
HAVING count(*) FILTER (WHERE dni.sp_order_item_id IS NULL) > 0
 ORDER BY o.sp_no, dn.do_no;
