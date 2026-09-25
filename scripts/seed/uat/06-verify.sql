-- =============================================================================
-- 06-verify.sql -- V1..V10 + V11 (jurnal invoice_issued wajib ada)
--
-- Tiap blok mencetak satu baris: nama uji, angka yang diukur, dan LOLOS/GAGAL.
-- Berkas ini 100% BACA. Ia tidak memperbaiki apa pun -- kalau ada yang GAGAL,
-- yang salah adalah datanya atau skenarionya, dan itu perlu dilihat manusia.
--
-- !! Status SP tidak pernah dipaksa di seluruh seed ini; V1 membandingkan status
-- yang DIHITUNG sp_recompute_status dengan yang diharapkan skenario. Kalau V1
-- gagal, BERHENTI dan laporkan -- jangan UPDATE sp_orders.status (aturan R2).
-- =============================================================================

\echo '=============== V1  jumlah per skenario ==============='
WITH sp AS (
  SELECT o.sp_no, o.status,
         (SELECT count(*) FROM sp_invoices i WHERE i.sp_order_id=o.id AND i.deleted_at IS NULL) AS n_inv
  FROM sp_orders o
  WHERE o.sp_no LIKE '91%' AND o.deleted_at IS NULL
)
SELECT 'V1 total SP 91%' AS uji, count(*)::text AS diukur, '40' AS harapan,
       CASE WHEN count(*) = 40 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil FROM sp
UNION ALL
SELECT 'V1 belum ditagih (nol invoice)', count(*)::text, '12',
       CASE WHEN count(*) = 12 THEN 'LOLOS' ELSE 'GAGAL' END
  FROM sp WHERE n_inv = 0 AND sp_no BETWEEN '9100001' AND '9100012'
UNION ALL
SELECT 'V1 siap ditagih (nol invoice)', count(*)::text, '6',
       CASE WHEN count(*) = 6 THEN 'LOLOS' ELSE 'GAGAL' END
  FROM sp WHERE n_inv = 0 AND sp_no BETWEEN '9100013' AND '9100018'
UNION ALL
SELECT 'V1 sudah invoice', count(*)::text, '22',
       CASE WHEN count(*) = 22 THEN 'LOLOS' ELSE 'GAGAL' END
  FROM sp WHERE n_inv > 0;

\echo '--- V1b status SP yang DIHITUNG (dibaca, bukan dipaksa) ---'
SELECT o.sp_no, o.status,
       (SELECT count(*) FROM delivery_notes d WHERE d.sp_order_id=o.id) AS n_sj,
       (SELECT count(*) FROM sp_btb b WHERE b.sp_order_id=o.id) AS n_btb,
       (SELECT count(*) FROM sp_invoices i WHERE i.sp_order_id=o.id AND i.deleted_at IS NULL) AS n_inv
FROM sp_orders o
WHERE o.sp_no LIKE '91%' AND o.deleted_at IS NULL
ORDER BY o.sp_no;

\echo '=============== V2  sebaran status invoice ==============='
WITH x AS (
  SELECT i.status, count(*) AS n
  FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
  WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL
  GROUP BY i.status
), h(status, harapan) AS (
  VALUES ('issued',5),('submitted',4),('partial',4),('paid',8),('void',1)
)
SELECT 'V2 ' || h.status AS uji, COALESCE(x.n,0)::text AS diukur, h.harapan::text AS harapan,
       CASE WHEN COALESCE(x.n,0) = h.harapan THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM h LEFT JOIN x ON x.status = h.status ORDER BY h.status;

\echo '=============== V3  jurnal tidak timpang ==============='
SELECT 'V3 jurnal timpang' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*) = 0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM (
  SELECT je.id
  FROM journal_entries je
  JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
  WHERE je.id IN (
    SELECT je2.id FROM journal_entries je2
    JOIN sp_invoices i ON i.id = je2.reference_id
    JOIN sp_orders o ON o.id = i.sp_order_id
    WHERE je2.reference_type='invoice_issued' AND o.sp_no LIKE '91%'
    UNION
    SELECT je3.id FROM journal_entries je3
    JOIN sp_payments p ON p.id = je3.reference_id
    JOIN sp_invoices i2 ON i2.id = p.invoice_id
    JOIN sp_orders o2 ON o2.id = i2.sp_order_id
    WHERE je3.reference_type='payment_received' AND o2.sp_no LIKE '91%')
  GROUP BY je.id
  HAVING COALESCE(SUM(jl.debit),0) <> COALESCE(SUM(jl.credit),0)
) t;

\echo '=============== V4  debit piutang = total_amount (non-void) ==============='
-- Toleransi = jumlah Surat Jalan BERJURNAL x Rp1. Sebabnya ada di kode:
-- create_invoice_for_sp menghitung ROUND(PPN) per Surat Jalan, terpisah dari
-- ROUND(PPN) per baris yang membentuk total_amount -- jadi selisih pembulatan
-- maksimum Rp1 per Surat Jalan memang diharapkan, bukan kesalahan.
-- !! Invoice void DIKECUALIKAN: jurnalnya sengaja DIHAPUS, bukan dibalik.
WITH inv AS (
  SELECT i.id, i.invoice_no, i.total_amount,
         (SELECT count(*) FROM journal_entries je
           WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id) AS n_je,
         COALESCE((SELECT SUM(jl.debit) FROM journal_entries je
                    JOIN journal_entry_lines jl ON jl.journal_entry_id=je.id
                    JOIN chart_of_accounts c ON c.id=jl.account_id
                   WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id
                     AND c.code='1-1200'),0) AS debit_ar
  FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
  WHERE o.sp_no LIKE '91%' AND i.status <> 'void' AND i.deleted_at IS NULL
)
SELECT 'V4 invoice di luar toleransi' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*) = 0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM inv WHERE abs(debit_ar - total_amount) > GREATEST(n_je,1) * 1;

\echo '--- V4b rincian per invoice non-void ---'
SELECT i.invoice_no, i.status, i.total_amount,
       (SELECT count(*) FROM journal_entries je
         WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id) AS n_je,
       COALESCE((SELECT SUM(jl.debit) FROM journal_entries je
                  JOIN journal_entry_lines jl ON jl.journal_entry_id=je.id
                  JOIN chart_of_accounts c ON c.id=jl.account_id
                 WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id
                   AND c.code='1-1200'),0) AS debit_ar
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.status <> 'void' AND i.deleted_at IS NULL
ORDER BY i.invoice_no;

\echo '=============== V5  sp_items <-> sp_order_items konsisten ==============='
WITH lama AS (
  SELECT sp_no, SUM(qty) AS q, SUM(shipped_qty) AS s
  FROM sp_items WHERE sp_no LIKE '91%' GROUP BY sp_no
), baru AS (
  SELECT o.sp_no, SUM(soi.qty) AS q, SUM(soi.shipped_qty) AS s
  FROM sp_orders o JOIN sp_order_items soi ON soi.sp_order_id=o.id
  WHERE o.sp_no LIKE '91%' AND o.deleted_at IS NULL GROUP BY o.sp_no
)
SELECT 'V5 SP tidak konsisten' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*) = 0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM lama FULL JOIN baru USING (sp_no)
WHERE COALESCE(lama.q,-1) <> COALESCE(baru.q,-1) OR COALESCE(lama.s,-1) <> COALESCE(baru.s,-1);

\echo '--- V5b rincian SP yang tidak konsisten (harus kosong) ---'
WITH lama AS (
  SELECT sp_no, SUM(qty) AS q_lama, SUM(shipped_qty) AS s_lama
  FROM sp_items WHERE sp_no LIKE '91%' GROUP BY sp_no
), baru AS (
  SELECT o.sp_no, SUM(soi.qty) AS q_baru, SUM(soi.shipped_qty) AS s_baru
  FROM sp_orders o JOIN sp_order_items soi ON soi.sp_order_id=o.id
  WHERE o.sp_no LIKE '91%' AND o.deleted_at IS NULL GROUP BY o.sp_no
)
SELECT * FROM lama FULL JOIN baru USING (sp_no)
WHERE COALESCE(q_lama,-1) <> COALESCE(q_baru,-1) OR COALESCE(s_lama,-1) <> COALESCE(s_baru,-1)
ORDER BY sp_no;

\echo '=============== V6  tanggal konsisten ==============='
SELECT 'V6a signed_date < dispatched_at' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM delivery_notes d JOIN sp_orders o ON o.id=d.sp_order_id
WHERE o.sp_no LIKE '91%' AND d.signed_date IS NOT NULL
  AND d.signed_date < (d.dispatched_at AT TIME ZONE 'Asia/Jakarta')::date
UNION ALL
SELECT 'V6b due_date <> invoice_date+30', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.due_date IS NOT NULL
  AND i.due_date <> i.invoice_date + 30
UNION ALL
SELECT 'V6c payment_date < invoice_date', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_payments p JOIN sp_invoices i ON i.id=p.invoice_id
JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND p.payment_date < i.invoice_date
UNION ALL
SELECT 'V6d entry_date jurnal invoice <> signed_date', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM journal_entries je
JOIN delivery_notes d ON d.id = je.delivery_note_id
JOIN sp_invoices i ON i.id = je.reference_id
JOIN sp_orders o ON o.id = i.sp_order_id
WHERE je.reference_type='invoice_issued' AND o.sp_no LIKE '91%'
  AND je.entry_date <> d.signed_date
UNION ALL
SELECT 'V6e entry_date jurnal bayar <> payment_date', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM journal_entries je
JOIN sp_payments p ON p.id = je.reference_id
JOIN sp_invoices i ON i.id = p.invoice_id
JOIN sp_orders o ON o.id = i.sp_order_id
WHERE je.reference_type='payment_received' AND o.sp_no LIKE '91%'
  AND je.entry_date <> p.payment_date
UNION ALL
-- Rentangnya Mei-September, BUKAN Juli-September: 9100019 dan 9100020 sengaja
-- di Mei dan Juni supaya ember umur TTF di atas 90 hari terjangkau.
SELECT 'V6f sp_date di luar Mei-Sep 2026', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_orders o WHERE o.sp_no LIKE '91%' AND o.deleted_at IS NULL
  AND (o.sp_date < DATE '2026-05-01' OR o.sp_date > DATE '2026-09-30')
UNION ALL
SELECT 'V6g SP di luar Jul-Sep selain 19 dan 20', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_orders o WHERE o.sp_no LIKE '91%' AND o.deleted_at IS NULL
  AND o.sp_no NOT IN ('9100019','9100020')
  AND (o.sp_date < DATE '2026-07-01' OR o.sp_date > DATE '2026-09-30');

\echo '=============== V7  TTF ==============='
-- Sebaran 2/2/2/2. Ember "di atas 90 hari" terjangkau karena 9100019 dan
-- 9100020 digeser ke Mei/Juni 2026 -- alasannya di kepala 05-ttf.sql.
-- !! Ember dihitung dari CURRENT_DATE, jadi angkanya BERGESER seiring waktu.
WITH t AS (
  SELECT tf.id, tf.tanggal_ttf, (CURRENT_DATE - tf.tanggal_ttf) AS umur
  FROM ar_ttfs tf WHERE tf.no_sp LIKE '91%'
)
SELECT 'V7 jumlah TTF' AS uji, count(*)::text AS diukur, '8' AS harapan,
       CASE WHEN count(*)=8 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil FROM t
UNION ALL SELECT 'V7 umur 0-30',  count(*)::text, '2', CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END FROM t WHERE umur BETWEEN 0 AND 30
UNION ALL SELECT 'V7 umur 31-60', count(*)::text, '2', CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END FROM t WHERE umur BETWEEN 31 AND 60
UNION ALL SELECT 'V7 umur 61-90', count(*)::text, '2', CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END FROM t WHERE umur BETWEEN 61 AND 90
UNION ALL SELECT 'V7 umur di atas 90', count(*)::text, '2', CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END FROM t WHERE umur > 90
UNION ALL
SELECT 'V7 invoice belum lunas tanpa TTF', count(*)::text, '5',
       CASE WHEN count(*)=5 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.status IN ('issued','submitted','partial') AND i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM ar_ttfs tf WHERE tf.invoice_id = i.id);

\echo '=============== V8  void bersih ==============='
SELECT 'V8 jurnal pada invoice void' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM journal_entries je
JOIN sp_invoices i ON i.id = je.reference_id
JOIN sp_orders o ON o.id = i.sp_order_id
WHERE je.reference_type='invoice_issued' AND o.sp_no LIKE '91%' AND i.status='void';

\echo '=============== V9  stok tidak minus ==============='
SELECT 'V9 baris stok negatif' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM stock_summary WHERE available < 0 OR on_hand < 0;

\echo '=============== V10 nol kebocoran ke produksi ==============='
-- notify_sp_milestone dipanggil ratusan kali lewat sp_recompute_status selama
-- seed. Kalau ia masih memuat net.http atau ref produksi, seed ini akan menembak
-- produksi. Uji ini murah dan menutup satu-satunya jalur yang bisa menyentuhnya.
SELECT 'V10 notify_sp_milestone memuat net.http' AS uji,
       CASE WHEN p.prosrc LIKE '%net.http%' THEN 'YA' ELSE 'tidak' END AS diukur,
       'tidak' AS harapan,
       CASE WHEN p.prosrc LIKE '%net.http%' THEN 'GAGAL' ELSE 'LOLOS' END AS hasil
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='notify_sp_milestone'
UNION ALL
SELECT 'V10 notify_sp_milestone memuat ref produksi',
       CASE WHEN p.prosrc LIKE '%untmpqceexwxzuhlmyrg%' THEN 'YA' ELSE 'tidak' END,
       'tidak',
       CASE WHEN p.prosrc LIKE '%untmpqceexwxzuhlmyrg%' THEN 'GAGAL' ELSE 'LOLOS' END
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='notify_sp_milestone';

\echo '=============== V11 tiap invoice non-void punya jurnal invoice_issued ==============='
-- Uji ini menutup persis bug yang ditemukan 25 Sep 2026: invoice terbit dengan
-- total_amount terisi tapi NOL jurnal, tanpa error, karena
-- delivery_note_items.sp_order_item_id NULL (migrasi 20260925000001).
-- V4 saja TIDAK menangkapnya: debit_ar 0 vs total_amount 9 juta memang di luar
-- toleransi, tapi kalau kelak ada invoice bernilai nol, V4 lolos dan V11 tidak.
-- Dua uji yang berbeda, bukan duplikat.
SELECT 'V11 invoice non-void tanpa jurnal' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.status <> 'void' AND i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM journal_entries je
                   WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id);

\echo '--- V11b jumlah jurnal per invoice vs jumlah SJ berjurnal ---'
-- Jumlah jurnal invoice HARUS sama dengan jumlah Surat Jalan delivered
-- ber-signed_date, karena create_invoice_for_sp membuat satu jurnal per SJ.
-- Kecuali SJ yang nilainya nol (jalur CONTINUE) - tidak ada di seed ini.
SELECT i.invoice_no,
       (SELECT count(*) FROM journal_entries je
         WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id) AS n_jurnal,
       (SELECT count(*) FROM delivery_notes d
         WHERE d.sp_order_id=i.sp_order_id AND d.status='delivered'
           AND d.signed_date IS NOT NULL) AS n_sj_bertandatangan,
       CASE WHEN (SELECT count(*) FROM journal_entries je
                   WHERE je.reference_type='invoice_issued' AND je.reference_id=i.id)
               = (SELECT count(*) FROM delivery_notes d
                   WHERE d.sp_order_id=i.sp_order_id AND d.status='delivered'
                     AND d.signed_date IS NOT NULL)
            THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.status <> 'void' AND i.deleted_at IS NULL
ORDER BY i.invoice_no;

\echo '=============== V12 baris invoice <-> kepala (invoice lengkap) ==============='
-- Tiga identitas yang dijaga 20260928000002. Dua yang pertama LAMA dan wajib
-- tidak bergerak; yang ketiga BARU dan sebelumnya mustahil ada, karena baris
-- invoice dulu tidak punya kolom uang sama sekali.
SELECT 'V12a SUM(line_amount)+SUM(ppn) <> total_amount' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM (SELECT i.id FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
       LEFT JOIN sp_invoice_lines sl ON sl.invoice_id=i.id
       WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL
       GROUP BY i.id, i.total_amount
      HAVING COALESCE(SUM(sl.line_amount),0)+COALESCE(SUM(sl.ppn),0) <> i.total_amount) z
UNION ALL
SELECT 'V12b SUM(dpp) <> total_dpp', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM (SELECT i.id FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
       LEFT JOIN sp_invoice_lines sl ON sl.invoice_id=i.id
       WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL
       GROUP BY i.id, i.total_dpp HAVING COALESCE(SUM(sl.dpp),0) <> i.total_dpp) z
UNION ALL
SELECT 'V12c SUM(ppn) <> total_ppn', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM (SELECT i.id FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
       LEFT JOIN sp_invoice_lines sl ON sl.invoice_id=i.id
       WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL
       GROUP BY i.id, i.total_ppn HAVING COALESCE(SUM(sl.ppn),0) <> i.total_ppn) z;

\echo '--- V12d jalur BARIS ONGKIR saat terbit ---'
-- SP berongkir di seed ada DUA. Kalau angkanya berubah jadi 0, jalur baris
-- ongkir di create_invoice_for_sp tidak pernah dijalankan dan V12a "lolos"
-- tanpa menguji apa pun -- kelas hijau-palsu "lolos karena prasyaratnya tak
-- pernah terpenuhi".
SELECT 'V12d invoice punya baris ongkir' AS uji, count(*)::text AS diukur, '2' AS harapan,
       CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM (SELECT DISTINCT sl.invoice_id FROM sp_invoice_lines sl
        JOIN sp_invoices i ON i.id=sl.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id
       WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL AND sl.line_type='shipping') z
UNION ALL
SELECT 'V12e baris ongkir <> SUM(shipping_price) SP-nya', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoice_lines sl
  JOIN sp_invoices i ON i.id=sl.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL AND sl.line_type='shipping'
  AND (sl.line_amount <> (SELECT COALESCE(SUM(shipping_price),0) FROM sp_order_items
                           WHERE sp_order_id=i.sp_order_id)
       OR sl.dpp <> 0 OR sl.ppn <> 0);

\echo '--- V12f snapshot baris + kolom kepala terisi SAAT TERBIT ---'
SELECT 'V12f baris item tanpa snapshot produk/harga/akun' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM sp_invoice_lines sl JOIN sp_invoices i ON i.id=sl.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL AND sl.line_type='item'
  AND (sl.product_name='' OR sl.unit_price=0 OR sl.account_id IS NULL)
UNION ALL
SELECT 'V12g invoice tanpa payment_term_days', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL AND i.payment_term_days IS NULL
UNION ALL
SELECT 'V12h baris tanpa tax_id (VAT_FULL)', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoice_lines sl JOIN sp_invoices i ON i.id=sl.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL AND sl.tax_id IS NULL;

\echo '--- V12i fixture kolom kelas (c) ---'
SELECT 'V12i invoice ber-faktur_no' AS uji, count(*)::text AS diukur, '1' AS harapan,
       CASE WHEN count(*)=1 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.faktur_no IS NOT NULL
UNION ALL
SELECT 'V12i invoice ber-coretax_tx_code', count(*)::text, '2',
       CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.coretax_tx_code IS NOT NULL
UNION ALL
SELECT 'V12i invoice ber-print_count 2', count(*)::text, '1',
       CASE WHEN count(*)=1 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.print_count = 2
UNION ALL
SELECT 'V12i catatan internal', count(*)::text, '3',
       CASE WHEN count(*)=3 THEN 'LOLOS' ELSE 'GAGAL' END
FROM invoice_notes n JOIN sp_invoices i ON i.id=n.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND n.deleted_at IS NULL
UNION ALL
SELECT 'V12i lampiran', count(*)::text, '2',
       CASE WHEN count(*)=2 THEN 'LOLOS' ELSE 'GAGAL' END
FROM invoice_attachments a JOIN sp_invoices i ON i.id=a.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND a.deleted_at IS NULL
UNION ALL
SELECT 'V12i tautan invoice pengganti', count(*)::text, '1',
       CASE WHEN count(*)=1 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
WHERE o.sp_no LIKE '91%' AND i.replaces_invoice_id IS NOT NULL;

\echo '=============== V13 kolom terkunci benar-benar MENOLAK ==============='
-- Uji ini menulis, lalu MEMBATALKAN sendiri: tiap percobaan hidup di sub-blok
-- ber-EXCEPTION, dan baris yang terlanjur diterima langsung dihapus. Net nol.
--
-- PEMBANDING WAJIB (V13a): satu baris yang SAH harus DITERIMA. Tanpa itu,
-- "semua ditolak" bisa berarti constraint-nya terlalu ketat dan ujinya lolos
-- karena alasan yang salah -- pelajaran tiga asersi hijau-palsu, 25 Sep 2026.
DROP TABLE IF EXISTS _v13;
CREATE TEMP TABLE _v13 (urut int, uji text, diukur text, harapan text, hasil text);

DO $v13$
DECLARE
  v_inv uuid; v_id uuid;
BEGIN
  SELECT i.id INTO v_inv FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.deleted_at IS NULL ORDER BY i.invoice_no LIMIT 1;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'V13 BATAL: nol invoice seed.'; END IF;

  BEGIN
    INSERT INTO sp_invoice_lines (invoice_id, dpp, ppn, qty, "position", line_type,
      product_name, unit_price, line_amount, tax_rate, discount_pct)
    VALUES (v_inv, 1000, 110, 2, 9001, 'item', 'V13', 500, 1000, 0.11, 0) RETURNING id INTO v_id;
    DELETE FROM sp_invoice_lines WHERE id=v_id;
    INSERT INTO _v13 VALUES (1,'V13a PEMBANDING baris sah','DITERIMA','DITERIMA','LOLOS');
  EXCEPTION WHEN others THEN
    INSERT INTO _v13 VALUES (1,'V13a PEMBANDING baris sah','DITOLAK: '||SQLERRM,'DITERIMA','GAGAL');
  END;

  BEGIN
    INSERT INTO sp_invoice_lines (invoice_id, dpp, ppn, qty, "position", line_type,
      product_name, unit_price, line_amount, tax_rate, discount_pct)
    VALUES (v_inv, 1000, 110, 2, 9002, 'item', 'V13', 500, 950, 0.11, 5) RETURNING id INTO v_id;
    DELETE FROM sp_invoice_lines WHERE id=v_id;
    INSERT INTO _v13 VALUES (2,'V13b diskon 5 persen','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (2,'V13b diskon 5 persen','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    INSERT INTO sp_invoice_lines (invoice_id, dpp, ppn, qty, "position", line_type,
      product_name, unit_price, line_amount, tax_rate, days)
    VALUES (v_inv, 1000, 110, 2, 9003, 'item', 'V13', 500, 1000, 0.11, 30) RETURNING id INTO v_id;
    DELETE FROM sp_invoice_lines WHERE id=v_id;
    INSERT INTO _v13 VALUES (3,'V13c days terisi','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (3,'V13c days terisi','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    INSERT INTO sp_invoice_lines (invoice_id, dpp, ppn, qty, "position", line_type,
      product_name, unit_price, line_amount, tax_rate)
    VALUES (v_inv, 1000, 120, 2, 9004, 'item', 'V13', 500, 1000, 0.12) RETURNING id INTO v_id;
    DELETE FROM sp_invoice_lines WHERE id=v_id;
    INSERT INTO _v13 VALUES (4,'V13d tarif pajak 0.12','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (4,'V13d tarif pajak 0.12','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    INSERT INTO sp_invoice_lines (invoice_id, dpp, ppn, qty, "position", line_type,
      product_name, unit_price, line_amount, tax_rate)
    VALUES (v_inv, 500, 55, 2, 9005, 'shipping', 'V13', 500, 1000, 0.11) RETURNING id INTO v_id;
    DELETE FROM sp_invoice_lines WHERE id=v_id;
    INSERT INTO _v13 VALUES (5,'V13e baris ongkir ber-dpp/ppn','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (5,'V13e baris ongkir ber-dpp/ppn','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    INSERT INTO sp_invoice_lines (invoice_id, dpp, ppn, qty, "position", line_type,
      product_name, unit_price, line_amount, tax_rate)
    VALUES (v_inv, 1000, 110, 2, 9006, 'item', 'V13', 500, 777, 0.11) RETURNING id INTO v_id;
    DELETE FROM sp_invoice_lines WHERE id=v_id;
    INSERT INTO _v13 VALUES (6,'V13f line_amount tak sesuai rumus','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (6,'V13f line_amount tak sesuai rumus','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    UPDATE sp_invoices SET currency_code='USD' WHERE id=v_inv;
    INSERT INTO _v13 VALUES (7,'V13g mata uang USD','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (7,'V13g mata uang USD','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    UPDATE sp_invoices SET rounding_method='round' WHERE id=v_inv;
    INSERT INTO _v13 VALUES (8,'V13h rounding round','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (8,'V13h rounding round','DITOLAK','DITOLAK','LOLOS');
  END;

  BEGIN
    UPDATE sp_invoices SET use_dpp_nilai_lain=true WHERE id=v_inv;
    INSERT INTO _v13 VALUES (9,'V13i DPP nilai lain true','DITERIMA','DITOLAK','GAGAL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _v13 VALUES (9,'V13i DPP nilai lain true','DITOLAK','DITOLAK','LOLOS');
  END;
END
$v13$;

SELECT uji, diukur, harapan, hasil FROM _v13 ORDER BY urut;

\echo '--- V13j nol residu dari V13 ---'
SELECT 'V13j baris V13 tersisa' AS uji, count(*)::text AS diukur, '0' AS harapan,
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END AS hasil
FROM sp_invoice_lines WHERE product_name='V13'
UNION ALL
SELECT 'V13j invoice bergeser dari IDR/none/false', count(*)::text, '0',
       CASE WHEN count(*)=0 THEN 'LOLOS' ELSE 'GAGAL' END
FROM sp_invoices
WHERE currency_code<>'IDR' OR fx_rate<>1 OR rounding_method<>'none' OR use_dpp_nilai_lain;

DROP TABLE _v13;

\echo '=============== SISA (untuk menguji purge) ==============='
SELECT 'sp_orders 91%'        AS objek, count(*)::text AS n FROM sp_orders WHERE sp_no LIKE '91%'
UNION ALL SELECT 'sp_items 91%',        count(*)::text FROM sp_items WHERE sp_no LIKE '91%'
UNION ALL SELECT 'picking_lists 91%',   count(*)::text FROM picking_lists WHERE sp_no LIKE '91%'
UNION ALL SELECT 'delivery_notes 91%',  count(*)::text FROM delivery_notes WHERE sp_no LIKE '91%'
UNION ALL SELECT 'sp_btb 91%',          count(*)::text FROM sp_btb b JOIN sp_orders o ON o.id=b.sp_order_id WHERE o.sp_no LIKE '91%'
UNION ALL SELECT 'sp_invoices 91%',     count(*)::text FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id WHERE o.sp_no LIKE '91%'
UNION ALL SELECT 'sp_payments 91%',     count(*)::text FROM sp_payments p JOIN sp_invoices i ON i.id=p.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id WHERE o.sp_no LIKE '91%'
UNION ALL SELECT 'ar_ttfs 91%',         count(*)::text FROM ar_ttfs WHERE no_sp LIKE '91%'
UNION ALL SELECT 'goods_receipts dummy',count(*)::text FROM goods_receipts WHERE reference_no LIKE 'GR-DUMMY-UAT-%'
UNION ALL SELECT 'invoice_notes 91%',    count(*)::text FROM invoice_notes n JOIN sp_invoices i ON i.id=n.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id WHERE o.sp_no LIKE '91%'
UNION ALL SELECT 'invoice_attachments 91%', count(*)::text FROM invoice_attachments a JOIN sp_invoices i ON i.id=a.invoice_id JOIN sp_orders o ON o.id=i.sp_order_id WHERE o.sp_no LIKE '91%';
