-- =============================================================================
-- Migration: 20260902000003_sp_orders_finance_cols
-- Phase:     FASE 1 (1/3) — promosi inv/fp/submit/kirim/submit_date/
--            email_status jadi atribut level SP/header.
-- Depends:   sp_orders (FASE 0 skema SP)
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- POLA: persis expired_date (20260825000002) — header jadi sumber kebenaran,
--   item disinkronkan turun oleh satu RPC. TAPI dengan SATU perbedaan penting:
--   expired_date punya NOL divergensi (481 SP diperiksa 25 Agu). Yang ini
--   punya 13 SP divergen dari 492, jadi backfill butuh aturan menang-kalah
--   yang eksplisit — bukan sekadar menyalin.
--
-- KENAPA DIPROMOSIKAN
--   Keenam kolom ini secara semantik milik modul FINANCE
--   (04_ROLE_PERMISSION_MATRIX baris "Finance": finance_controller & finance
--   = CRUD), tapi secara fisik tinggal di sp_items — tabel milik modul
--   LOGISTICS, ditulis update_sp_item_dual yang guard-nya berbentuk gudang.
--   Akibatnya Finance TIDAK BISA menyimpan status dokumen dari permukaan mana
--   pun sejak 25 Agu 2026 (FinanceModal terbuka, toggle bergerak, Save ditolak
--   'Tidak berhak mengubah item SP ini'). Memindahkan kolomnya ke header +
--   RPC ber-guard finance sendiri (20260902000004) yang menyelesaikannya.
--
--   Dalam praktik keenam nilai ini memang SP-level: satu invoice menutup
--   seluruh baris SP. 479 dari 492 SP sudah seragam antar item tanpa ada yang
--   menegakkannya — divergensi 13 SP itu justru gejala tidak adanya sumber
--   kebenaran tunggal.
--
-- ATURAN BACKFILL (keputusan Den, dikonfirmasi 2 Sep 2026)
--   inv/fp/submit/kirim -> bool_and()  KONSERVATIF: header true HANYA bila
--     SEMUA item true. "Dokumen SP terbit" baru sah kalau seluruh baris
--     tercakup; salah-arah yang aman adalah under-claim, bukan over-claim.
--   submit_date         -> max()       tanggal submit terakhir = saat SP
--     benar-benar tersubmit penuh.
--   email_status        -> nilai dari item ber-updated_at TERBARU (teks bebas,
--     tak bisa diagregasi). NULL kalau semua item kosong.
--
-- 13 SP DIVERGEN yang akan dinormalkan (sensus dari data produksi 31 Agu):
--   keenam kolom : 2096315(5 item) 2204884(2) 2204886(2) 2204974(3,PICKING) 2213370(2)
--   submit/kirim/submit_date : 2172914(2) 2173356(4)
--   submit_date  : 2049270(2)
--   email_status : 2056583(3) 2118462(2) 2193685(2) 2193689(2) 2198923(2)
--   Semua BTB_TERBIT kecuali 2204974 (PICKING). Total 32 baris sp_items.
--   ⚠️ Backup 32 baris itu SUDAH DIAMBIL Den sebelum sesi ini (konfirmasi
--      2 Sep 2026). Normalisasi di bawah TIDAK BISA DI-ROLLBACK dari file ini.
--
-- DAMPAK PERILAKU YANG DISENGAJA (disetujui Den)
--   groupBySP (App.jsx:204-209) menghitung invDone/fpDone/submitDone/
--   kirimDone PER ITEM, sehingga financePct hari ini bisa bernilai pecahan
--   (mis. 3 dari 5 item ber-INV = 60%). Sesudah promosi, semua item se-SP
--   selalu seragam -> financePct hanya bisa 0/25/50/75/100%. Ini terlihat di
--   kartu "Finance Progress" Detail SP, KPI FinancePage, dan dashboard.
--   Persentase per-item selama ini tak punya makna bisnis — satu invoice
--   menutup seluruh SP.
--
-- YANG SENGAJA TIDAK DILAKUKAN
--   - TIDAK menambah CHECK pada email_status. Data lama memuat NULL (630),
--     'Terkirim ke customer' (168), 'Belum dikirim' (4); sp_items sendiri
--     tak punya constraint. CHECK di sini menciptakan asimetri yang bisa
--     menolak nilai sah saat sinkronisasi turun.
--   - TIDAK menyentuh sp_order_items: keenam kolom itu memang tidak ada di
--     sana, dan itu keputusan desain yang benar (DESIGN_SP_SCHEMA.md).
--   - TIDAK menyentuh update_sp_item_dual. Pencabutan 6 kolom dari daftar
--     SET-nya ada di 20260902000005, yang BARU BOLEH JALAN setelah FE live.
--   - TIDAK memberi GRANT UPDATE kolom baru ke authenticated. Kolom baru
--     TIDAK otomatis mewarisi GRANT kolom lama di Postgres — dan itu memang
--     yang diinginkan: satu-satunya penulis sah adalah RPC di 000004.
--
-- ADDITIVE: sampai 000004 + FE mendarat, file ini NOL perubahan perilaku.
--   Kolom baru tak dibaca siapa pun; seluruh UI masih membaca versi sp_items.
-- =============================================================================

ALTER TABLE public.sp_orders
  ADD COLUMN IF NOT EXISTS inv          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fp           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submit       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kirim        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submit_date  date,
  ADD COLUMN IF NOT EXISTS email_status text;

COMMENT ON COLUMN public.sp_orders.inv IS
  'Status dokumen level SP (promosi 2 Sep 2026). SUMBER KEBENARAN; sp_items.inv '
  'disinkronkan turun oleh set_sp_finance_docs(). Jangan tulis langsung.';
COMMENT ON COLUMN public.sp_orders.fp IS
  'Faktur Pajak, level SP. Sumber kebenaran — lihat catatan sp_orders.inv.';
COMMENT ON COLUMN public.sp_orders.submit IS
  'Submit ke customer, level SP. Sumber kebenaran — lihat catatan sp_orders.inv.';
COMMENT ON COLUMN public.sp_orders.kirim IS
  'Kirim dokumen, level SP. Sumber kebenaran — lihat catatan sp_orders.inv.';
COMMENT ON COLUMN public.sp_orders.submit_date IS
  'Tanggal submit dokumen, level SP. Sumber kebenaran — lihat sp_orders.inv.';
COMMENT ON COLUMN public.sp_orders.email_status IS
  'Status email ke customer, level SP. Teks bebas (sama seperti sp_items, '
  'sengaja tanpa CHECK). Sumber kebenaran — lihat catatan sp_orders.inv.';

-- ─── Backfill header dari item ───────────────────────────────────────────────
WITH agg AS (
  SELECT customer_id, sp_no,
         bool_and(inv)    AS inv,
         bool_and(fp)     AS fp,
         bool_and(submit) AS submit,
         bool_and(kirim)  AS kirim,
         max(submit_date) AS submit_date,
         (ARRAY_AGG(email_status ORDER BY updated_at DESC NULLS LAST)
            FILTER (WHERE email_status IS NOT NULL))[1] AS email_status
    FROM public.sp_items
   GROUP BY customer_id, sp_no
)
UPDATE public.sp_orders o
   SET inv          = a.inv,
       fp           = a.fp,
       submit       = a.submit,
       kirim        = a.kirim,
       submit_date  = a.submit_date,
       email_status = a.email_status,
       updated_at   = now()
  FROM agg a
 WHERE o.customer_id = a.customer_id
   AND o.sp_no       = a.sp_no
   AND o.deleted_at IS NULL;

-- ─── Normalisasi item ke nilai header ────────────────────────────────────────
-- ⚠️ INI MENGUBAH DATA (32 baris sp_items pada 13 SP; backup sudah diambil Den).
--    Tanpa langkah ini ke-13 SP itu tetap divergen dan groupBySP
--    (App.jsx:204-209) akan menampilkan angka yang BERTENTANGAN dengan kartu
--    header baru — persis kelas bug yang promosi ini ingin hilangkan.
UPDATE public.sp_items si
   SET inv          = o.inv,
       fp           = o.fp,
       submit       = o.submit,
       kirim        = o.kirim,
       submit_date  = o.submit_date,
       email_status = o.email_status,
       updated_at   = now()
  FROM public.sp_orders o
 WHERE o.customer_id = si.customer_id
   AND o.sp_no       = si.sp_no
   AND o.deleted_at IS NULL
   AND (
         (si.inv, si.fp, si.submit, si.kirim)
           IS DISTINCT FROM (o.inv, o.fp, o.submit, o.kirim)
      OR si.submit_date  IS DISTINCT FROM o.submit_date
      OR si.email_status IS DISTINCT FROM o.email_status
       );

-- ─── VERIFIKASI (jalankan TERPISAH sesudahnya) ───────────────────────────────
--   -- a. Kolom terpasang:
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'sp_orders'
--      AND column_name IN ('inv','fp','submit','kirim','submit_date','email_status')
--    ORDER BY column_name;
--
--   -- b. NOL SP divergen tersisa (HARUS 0 — sebelum migrasi: 13):
--   SELECT count(*) FROM (
--     SELECT customer_id, sp_no FROM sp_items
--      GROUP BY customer_id, sp_no
--     HAVING count(DISTINCT inv) > 1 OR count(DISTINCT fp) > 1
--         OR count(DISTINCT submit) > 1 OR count(DISTINCT kirim) > 1
--         OR count(DISTINCT submit_date) > 1 OR count(DISTINCT email_status) > 1) t;
--
--   -- c. Header == item untuk SELURUH SP (HARUS 0 baris):
--   SELECT DISTINCT o.sp_no
--     FROM sp_orders o
--     JOIN sp_items si ON si.customer_id = o.customer_id AND si.sp_no = o.sp_no
--    WHERE o.deleted_at IS NULL
--      AND ((o.inv, o.fp, o.submit, o.kirim)
--             IS DISTINCT FROM (si.inv, si.fp, si.submit, si.kirim)
--        OR o.submit_date  IS DISTINCT FROM si.submit_date
--        OR o.email_status IS DISTINCT FROM si.email_status);
--
--   -- d. Sanity angka agregat (bandingkan dengan sebelum migrasi):
--   SELECT count(*) FILTER (WHERE inv)    AS inv_true,
--          count(*) FILTER (WHERE fp)     AS fp_true,
--          count(*) FILTER (WHERE submit) AS submit_true,
--          count(*) FILTER (WHERE kirim)  AS kirim_true,
--          count(*) AS total_sp
--     FROM sp_orders WHERE deleted_at IS NULL;
--
--   -- e. Kolom baru TIDAK boleh writable langsung lewat PostgREST:
--   SELECT grantee, privilege_type, column_name
--     FROM information_schema.column_privileges
--    WHERE table_name = 'sp_orders'
--      AND column_name IN ('inv','fp','submit','kirim','submit_date','email_status');
--   --    HARUS kosong untuk grantee 'authenticated' + privilege 'UPDATE'.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.sp_orders
--     DROP COLUMN IF EXISTS inv,          DROP COLUMN IF EXISTS fp,
--     DROP COLUMN IF EXISTS submit,       DROP COLUMN IF EXISTS kirim,
--     DROP COLUMN IF EXISTS submit_date,  DROP COLUMN IF EXISTS email_status;
--
--   ⚠️ Normalisasi sp_items TIDAK bisa di-rollback oleh statement di atas —
--      nilai per-item lama pada 13 SP sudah tertimpa. Pemulihannya HANYA dari
--      backup 32 baris yang Den ambil sebelum sesi ini.
--   ⚠️ Kalau 20260902000004 sudah jalan, DROP kolom di atas akan gagal /
--      merusak RPC itu. Rollback 000004 lebih dulu.
