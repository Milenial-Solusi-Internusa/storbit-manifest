-- =============================================================================
-- Migration: 20260818000002_storbit_dashboard_stats_rpc
-- Phase:     Dashboard Storbit (Shipping Manifest + Warehouse) — RPC agregasi
--            read-only, satu panggilan untuk seluruh angka kartu KPI:
--            Shipping Manifest 10 kartu/slice + 3 penyebut (total_sp,
--            dispatch_data_tersedia, dispatch_eligible); Warehouse 3 kartu +
--            1 penyebut. Pendamping drill-down: 20260818000003.
-- Depends:   20260818000001 (products.reorder_point + sp_orders.price_category)
--            HARUS sudah live — fungsi ini membaca kedua kolom itu dan akan
--            gagal compile kalau belum ada.
-- Status:    LIVE — dijalankan 18 Agu 2026, terverifikasi lewat
--            schema_snapshot.sql (body fungsi versi terakhir, sudah memuat
--            terkirim_penuh + dispatch_eligible). Snapshot sudah di-refresh.
--            Urutan aslinya section 1 -> 3 berurutan di SQL Editor; fungsi ini
--            CREATE OR REPLACE, jadi aman dijalankan ulang apa adanya.
--
-- CATATAN DESAIN:
--   - SECURITY INVOKER (default, sengaja TIDAK ditulis SECURITY DEFINER):
--     ini read-only, jadi RLS pemanggil harus ikut berlaku. Konsisten dgn
--     view stock_summary yang juga security_invoker='true'. STABLE — nol
--     tulis, aman dipanggil berkali-kali.
--   - GRANT pakai pola FASE 5 (record_payment/mark_ttf_received, 17 Agu 2026):
--     REVOKE ALL FROM PUBLIC lalu GRANT ke authenticated SAJA. SENGAJA TIDAK
--     meniru indomarco_dashboard_stats/storbit_sp_customers yang ter-GRANT ke
--     anon — di sana tidak eksploitabel (sp_items_read di-scope TO
--     authenticated, jadi anon tetap nol baris), tapi tetap permukaan tanpa
--     alasan. Default privileges Supabase (schema_snapshot.sql:18354-18356)
--     meng-GRANT fungsi baru ke anon secara OTOMATIS — itu sebabnya REVOKE
--     eksplisit di bawah bukan formalitas.
--
--   - FILTER company_id EKSPLISIT, tidak cukup mengandalkan RLS. Tiga sebab:
--       (a) stock_ledger_select = USING(true) (TD-173) -> view stock_summary
--           nol isolasi entitas;
--       (b) sp_orders_read & products_read dua-duanya "is_super_admin() OR ..."
--           -> super_admin lolos SEMUA entitas, padahal Storbit = SOA saja;
--     Fallback COALESCE ke get_user_company_id() utk pemanggilan tanpa argumen.
--
--     ⚠️ KOREKSI 18 Agu 2026 (rencana awal TIDAK terwujud): fungsi ini semula
--     dirancang menerima p_company_id dari AuthContext.activeCompanyId supaya
--     TIDAK menambah kasus TD-178. Itu dicoba dan GAGAL di produksi — seluruh
--     kartu menampilkan 0 padahal RPC benar, karena activeCompanyId = home
--     company user (bisa MSI/JCI) sedangkan SELURUH data Storbit ada di SOA.
--     Gagalnya SENYAP: CTE agregat tetap mengembalikan satu baris berisi nol,
--     jadi error NULL dan tak ada toast/banner apa pun.
--     Pemanggilnya (StorbitDashboardPage.jsx) kini HARDCODE SOA_COMPANY_ID —
--     jadi ini MEMANG kasus TD-178 di sisi FE, jangan dibaca sebaliknya.
--     Parameter p_company_id sendiri TETAP dipertahankan dan tetap benar: ia
--     jalan keluarnya begitu TD-178 dibereskan menyeluruh (FE tinggal mengirim
--     entitas aktif lagi, TANPA mengubah fungsi ini) — dengan syarat disertai
--     empty-state untuk entitas non-SOA, kalau tidak bug senyap yang sama
--     kembali persis dalam bentuk yang sama.
--
--   - expired_date DIAMBIL DARI sp_items, BUKAN sp_orders.expired_date.
--     sp_orders.expired_date memang ADA dan terisi saat create, TAPI tidak
--     pernah di-update sesudahnya: update_sp_item_dual hanya sync 5 kolom
--     (qty/sla_days/estimated_delivery_date/shipping_price/notes) dan tak
--     menyentuh header. Sementara SELURUH UI membaca & mengedit versi item
--     (EditItemModal SalesOrderDetailPage.jsx:436, kartu Deadline :1168,
--     kolom Expired SalesOrderPage.jsx:689, mapping spFromDb db.js:27).
--     Membaca header = angka dashboard diam-diam beda dari yang dilihat user
--     di layar begitu ada yang mengedit deadline. MIN() dipilih (deadline
--     paling awal = yang mengikat); UI pakai items.find() yang bergantung
--     urutan fetch, jadi non-deterministik.
--
--   - zero_stock pakai '<= 0', bukan '= 0': available bisa NEGATIF kalau
--     reserved > on_hand. Dengan '= 0' produk over-reserve hilang dari KEDUA
--     kartu (danger & zero). Produk yang belum pernah punya baris
--     stock_ledger sama sekali tertangkap COALESCE(...,0) — itu sebabnya CTE
--     stock digerakkan dari products, BUKAN dari stock_summary (produk tanpa
--     histori ledger tidak muncul di view itu -> zero_stock akan under-count).
--
--   - is_active = true berlaku untuk KETIGA metrik warehouse (keputusan Den,
--     18 Agu 2026) — ditaruh di WHERE CTE stock, bukan di FILTER satu kartu.
--
--   - btb_terbit (kartu ke-6 Shipping Manifest) DITAMBAHKAN SUSULAN, tidak ada
--     di desain awal. Ketahuan dari smoke test 18 Agu 2026: 390 dari 463 SP
--     (±84%, mayoritas mutlak data Storbit) berstatus BTB_TERBIT — barang
--     sudah diterima customer, invoice belum terbit. Tanpa kartu ini, bagian
--     terbesar data justru tak terwakili di dashboard sama sekali: BTB_TERBIT
--     tidak masuk pending_open, tidak masuk shipped (peringkatnya di ATAS
--     SAMPAI di sp_recompute_status), dan belum masuk finance.
--
--   - ⚠️ DEFINISI expired_date (dikonfirmasi ulang 18 Agu 2026): tenggat SP
--     harus DIKIRIM. Lewat tanggal itu, Storbit berpotensi kena PINALTI dari
--     customer. BUKAN soal validitas harga. Rumus versi pertama file ini salah
--     konsep — cuma membandingkan tanggal thd CURRENT_DATE tanpa peduli SP-nya
--     sudah dikirim atau belum, sehingga SP yang dikirim TEPAT WAKTU pun ikut
--     terhitung "expired" begitu kalender lewat tenggat lamanya (angkanya cuma
--     akan membesar seiring waktu tanpa ada pelanggaran apa pun).
--     Sekarang dipecah jadi dua konsep berbeda:
--       * expired / mendekati_expired = risiko yang MASIH BERJALAN -> hanya SP
--         yang BELUM dikirim (status pending_open: DRAFT..PACKED). Klausa lama
--         "status NOT IN ('LUNAS','CANCELLED')" dibuang karena jadi redundan.
--       * pernah_risiko_pinalti = pelanggaran yang SUDAH TERJADI -> ada dispatch
--         yang berangkat setelah tenggat.
--
--   - pernah_risiko_pinalti — 4 keputusan yang masing-masing punya alasan:
--       (a) JOIN via (customer_id, sp_no), BUKAN delivery_notes.sp_order_id.
--           Kolom itu di-backfill sekali 6 Jul 2026 (20260706000001:316-323)
--           lalu TIDAK PERNAH diisi lagi: generate_delivery_from_picking tak
--           menyertakannya di INSERT-nya, jadi SEMUA surat jalan yang lahir
--           setelah tanggal itu ber-sp_order_id NULL. Komposit (customer_id,
--           sp_no) adalah kunci yang sama dipakai sp_recompute_status dan
--           backfill di atas.
--       (b) dn.status <> 'cancelled' WAJIB: cancel_delivery TIDAK mengosongkan
--           dispatched_at (cuma set status + cancelled_at), jadi tanpa filter
--           ini pengiriman yang DIBATALKAN terhitung telat selamanya.
--       (c) (dispatched_at AT TIME ZONE 'Asia/Jakarta')::date — bukan
--           dispatched_at::date. Kolomnya timestamptz diisi now(); cast polos
--           memakai TimeZone sesi = UTC di PostgREST. Jakarta UTC+7, jadi
--           dispatch pukul 03:00 WIB jatuh ke tanggal SEBELUMNYA dalam UTC ->
--           under-count sistematis untuk semua dispatch sebelum 07:00 WIB.
--           Preseden pola yang sama: generate_delivery_from_picking pakai
--           EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta')).
--       (d) EXISTS (ANY), bukan ALL. Eksposur pinalti bersifat PER-PENGIRIMAN:
--           kalau 3 dari 4 dispatch tepat waktu dan satu telat 5 hari, customer
--           tetap bisa menagih atas yang satu itu. ALL hanya menyala kalau
--           SELURUH pengiriman telat — menyembunyikan mayoritas eksposur nyata
--           dan bertentangan dgn nama metriknya sendiri ("PERNAH").
--
--   - ⚠️ ASUMSI MENUNGGU KONFIRMASI: "dikirim" di sini = dispatched_at
--     (berangkat dari gudang), BUKAN delivered_at (sampai di customer).
--     Dipilih karena cocok dgn definisi di atas DAN lebih andal sbg data
--     (dispatched_at distempel pada aksi gudang nyata sekalian menulis
--     stock_ledger outbound; delivered_at distempel mark_delivery_delivered,
--     aksi manual yang bisa telat berhari-hari dari kenyataan -> mengukur
--     kedisiplinan input, bukan ketepatan kirim). YANG MENENTUKAN bukan
--     preferensi teknis melainkan bunyi klausa pinalti di PKS: kalau di sana
--     pinalti dihitung dari TANGGAL TERIMA customer, ganti ke delivered_at
--     (perubahan satu baris) — angka dispatched_at akan terlalu optimis karena
--     pengiriman yang berangkat tepat waktu tapi SAMPAI telat tak terdeteksi.
--
--   - ⚠️ CAKUPAN DATA 16,2% — SEBAB dispatch_data_tersedia ADA.
--     Diukur 18 Agu 2026: hanya 69 dari 425 SP yang sudah lewat tahap kirim
--     punya delivery_notes ber-dispatched_at. Sebabnya struktural: 435 SP hasil
--     import Excel tak pernah melewati alur picking -> surat jalan, dan status
--     BTB_TERBIT (±84% data) dicapai lewat keberadaan sp_btb yang peringkatnya
--     DI ATAS SAMPAI/DIKIRIM di sp_recompute_status — nol delivery_notes pun
--     tetap sampai BTB_TERBIT.
--     Konsekuensi: pernah_risiko_pinalti mengukur 16,2% populasi, bukan 100%.
--     Angka kecil di kartu itu BUKAN berarti tak ada keterlambatan, melainkan
--     datanya memang tak ada. Karena itu dispatch_data_tersedia ikut
--     dikembalikan sebagai PENYEBUT — bukan kartu/numerator baru.
--     ⛔ UI WAJIB menampilkan keduanya BERPASANGAN ("N dari M SP yang punya
--     data pengiriman"), TIDAK PERNAH salah satu saja. Angka pinalti telanjang
--     lebih menyesatkan daripada tidak ada kartunya sama sekali.
--
--   - Daftar status di FILTER bawah HARUS tetap sinkron dengan STATUS_GROUPS
--     di src/lib/spStatusConstants.js (dipakai drill-down FE). Kalau salah
--     satu diubah, ubah dua-duanya — pelajaran TD-168 (AGING_LIMITS FE vs
--     AGING_RULES Edge Function yang sempat drift berbulan-bulan).
-- =============================================================================

-- 1. RPC agregasi.
CREATE OR REPLACE FUNCTION public.get_storbit_dashboard_stats(
  p_customer_id    uuid DEFAULT NULL,
  p_price_category text DEFAULT NULL,
  p_company_id     uuid DEFAULT NULL
) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $fn$
WITH scope AS (
  SELECT COALESCE(p_company_id, public.get_user_company_id()) AS cid
),
sp AS (
  SELECT
    o.id,
    o.status,
    o.customer_id,                 -- dibawa utk join delivery_notes di sp_flag
    o.sp_no,                       -- idem
    (SELECT MIN(si.expired_date)
       FROM public.sp_items si
      WHERE si.customer_id = o.customer_id
        AND si.sp_no       = o.sp_no
        AND si.expired_date IS NOT NULL) AS expired_date,
    EXISTS (SELECT 1 FROM public.sp_btb b
             WHERE b.sp_order_id = o.id AND b.deleted_at IS NULL) AS has_btb
  FROM public.sp_orders o, scope
  WHERE o.deleted_at IS NULL
    AND o.company_id = scope.cid
    AND (p_customer_id    IS NULL OR o.customer_id    = p_customer_id)
    AND (p_price_category IS NULL OR o.price_category = p_price_category)
),
-- CTE terpisah karena expired_date dihitung di SELECT list `sp` dan tak bisa
-- dirujuk dari ekspresi sebelahnya di SELECT yang sama.
sp_flag AS (
  SELECT
    s.*,
    -- Ada dispatch yang BERANGKAT setelah tenggat kirim? (lihat CATATAN DESAIN
    -- butir a-d utk alasan tiap klausa di bawah)
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
       WHERE dn.customer_id = s.customer_id
         AND dn.sp_no       = s.sp_no
         AND dn.status <> 'cancelled'
         AND dn.dispatched_at IS NOT NULL
         AND s.expired_date IS NOT NULL
         AND (dn.dispatched_at AT TIME ZONE 'Asia/Jakarta')::date > s.expired_date
    ) AS late_dispatch,
    -- Penyebut: SP ini PUNYA data pengiriman sama sekali atau tidak. Tanpa ini,
    -- late_dispatch=false ambigu antara "tepat waktu" dan "tak ada datanya".
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
       WHERE dn.customer_id = s.customer_id
         AND dn.sp_no       = s.sp_no
         AND dn.status <> 'cancelled'
         AND dn.dispatched_at IS NOT NULL
    ) AS has_dispatch_data
  FROM sp s
),
manifest AS (
  SELECT
    COUNT(*) FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')) AS pending_open,
    COUNT(*) FILTER (WHERE status IN ('DIKIRIM','SAMPAI'))                                     AS shipped,
    -- SAMPAI + TERKIRIM_PENUH dua-duanya berarti "barang sampai, BTB belum".
    -- BTB_TERBIT peringkatnya DI ATAS keduanya di sp_recompute_status, jadi
    -- NOT has_btb di sini sabuk pengaman kalau status sempat basi.
    COUNT(*) FILTER (WHERE status IN ('SAMPAI','TERKIRIM_PENUH') AND NOT has_btb)               AS delivered_belum_btb,
    -- Kebalikan kartu di atas: BTB sudah terbit, invoice belum. ±84% data
    -- Storbit ada di sini (lihat CATATAN DESAIN).
    COUNT(*) FILTER (WHERE status = 'BTB_TERBIT')                                               AS btb_terbit,
    -- Slice donut yang HILANG sebelum revisi 18 Agu 2026. TERKIRIM_PENUH tak
    -- terwakili kunci mana pun (pending_open+shipped+btb_terbit+finance+
    -- cancelled = 12 dari 13 status), dan delivered_belum_btb BUKAN
    -- penggantinya — isinya SAMPAI *atau* TERKIRIM_PENUH yang belum ber-BTB,
    -- jadi beririsan dgn shipped. Tanpa field ini donut tak bisa dipartisi
    -- bersih; menurunkannya lewat pengurangan dari total_sp rapuh (status baru
    -- akan diam-diam terserap ke slice ini dan salah label).
    COUNT(*) FILTER (WHERE status = 'TERKIRIM_PENUH')                                           AS terkirim_penuh,
    -- expired & mendekati_expired: HANYA SP yang belum dikirim (pending_open).
    -- SP yang sudah dikirim tak bisa "kedaluwarsa" secara konsep — tenggatnya
    -- soal kapan dikirim, dan itu sudah terjadi.
    COUNT(*) FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                       AND expired_date < CURRENT_DATE)                                         AS expired,
    COUNT(*) FILTER (WHERE status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED')
                       AND expired_date >= CURRENT_DATE
                       AND date_trunc('month', expired_date) = date_trunc('month', CURRENT_DATE))
                                                                                                AS mendekati_expired,
    -- Pelanggaran yang SUDAH terjadi. WAJIB ditampilkan berpasangan dengan
    -- dispatch_data_tersedia di bawahnya — cakupan datanya cuma 16,2%.
    COUNT(*) FILTER (WHERE late_dispatch AND status <> 'CANCELLED')                             AS pernah_risiko_pinalti,
    -- PENYEBUT, bukan kartu: dari SP yang sudah lewat tahap kirim, berapa yang
    -- punya jejak dispatch sama sekali.
    COUNT(*) FILTER (WHERE has_dispatch_data
                       AND status <> 'CANCELLED'
                       AND status IN ('DIKIRIM','SAMPAI','BTB_TERBIT','TERKIRIM_PENUH',
                                      'INVOICED','SUBMITTED','LUNAS'))                          AS dispatch_data_tersedia,
    -- PENYEBUT KEDUA kartu pinalti ("N dari M SP yang sudah lewat tahap kirim").
    -- Daftar statusnya SENGAJA identik dgn dispatch_data_tersedia di atas — itu
    -- sebabnya dihitung di sini, bukan dijumlahkan di FE: rumus FE yang wajar
    -- (shipped + delivered_belum_btb + btb_terbit + finance) MENGHITUNG GANDA
    -- karena delivered_belum_btb beririsan dgn shipped di status SAMPAI.
    COUNT(*) FILTER (WHERE status <> 'CANCELLED'
                       AND status IN ('DIKIRIM','SAMPAI','BTB_TERBIT','TERKIRIM_PENUH',
                                      'INVOICED','SUBMITTED','LUNAS'))                          AS dispatch_eligible,
    COUNT(*) FILTER (WHERE status IN ('INVOICED','SUBMITTED','LUNAS'))                          AS finance,
    COUNT(*) FILTER (WHERE status = 'CANCELLED')                                                AS cancelled,
    COUNT(*)                                                                                    AS total_sp
  FROM sp_flag
),
stock AS (
  SELECT
    p.reorder_point,
    COALESCE((SELECT SUM(ss.available) FROM public.stock_summary ss
               WHERE ss.product_id = p.id
                 AND ss.company_id = p.company_id), 0) AS available
  FROM public.products p, scope
  WHERE p.deleted_at IS NULL
    AND p.company_id = scope.cid
    AND p.is_service = false
    AND p.is_active  = true
),
warehouse AS (
  SELECT
    COUNT(*) FILTER (WHERE reorder_point IS NOT NULL AND available < reorder_point) AS danger_stock,
    COUNT(*) FILTER (WHERE available <= 0)                                          AS zero_stock,
    COUNT(*) FILTER (WHERE reorder_point IS NULL)                                   AS rop_belum_diisi,
    COUNT(*)                                                                        AS total_produk
  FROM stock
)
SELECT jsonb_build_object(
  'manifest', jsonb_build_object(
    'pending_open',        (SELECT pending_open        FROM manifest),
    'shipped',             (SELECT shipped             FROM manifest),
    'delivered_belum_btb', (SELECT delivered_belum_btb FROM manifest),
    'btb_terbit',          (SELECT btb_terbit          FROM manifest),
    'terkirim_penuh',      (SELECT terkirim_penuh      FROM manifest),
    'expired',             (SELECT expired             FROM manifest),
    'mendekati_expired',   (SELECT mendekati_expired   FROM manifest),
    -- Pasangan wajib — jangan tampilkan salah satu saja di UI.
    'pernah_risiko_pinalti',  (SELECT pernah_risiko_pinalti  FROM manifest),
    'dispatch_data_tersedia', (SELECT dispatch_data_tersedia FROM manifest),
    'dispatch_eligible',      (SELECT dispatch_eligible      FROM manifest),
    'finance',             (SELECT finance             FROM manifest),
    'cancelled',           (SELECT cancelled           FROM manifest),
    'total_sp',            (SELECT total_sp            FROM manifest)
  ),
  'warehouse', jsonb_build_object(
    'danger_stock',    (SELECT danger_stock    FROM warehouse),
    'zero_stock',      (SELECT zero_stock      FROM warehouse),
    'rop_belum_diisi', (SELECT rop_belum_diisi FROM warehouse),
    'total_produk',    (SELECT total_produk    FROM warehouse)
  ),
  'generated_at', now()
);
$fn$;

-- 2. Hak akses — pola FASE 5. REVOKE dulu (default privileges Supabase sudah
--    terlanjur meng-GRANT ke anon), baru GRANT ke authenticated saja.
REVOKE ALL ON FUNCTION public.get_storbit_dashboard_stats(uuid, text, uuid) FROM PUBLIC;
GRANT ALL  ON FUNCTION public.get_storbit_dashboard_stats(uuid, text, uuid) TO authenticated;

-- 3. Dua index jaga-jaga. TIDAK diperlukan pada skala saat ini (463 SP / ~720
--    sp_items / ~38 produk aktif -> seq scan hitungan mikrodetik); disertakan
--    karena murah dan menutup dua kolom yang memang layak ber-index terlepas
--    dashboard ini. Fakta yang ditutup: sp_btb SAMA SEKALI tak punya index di
--    sp_order_id (cuma UNIQUE parsial customer_id+btb_no), dan sp_orders cuma
--    punya PK + UNIQUE(customer_id, sp_no) — nol index di company_id/status.
--    ⚠️ EXPLAIN belum pernah dijalankan untuk query di atas (sesi desain tanpa
--    akses DB) — ini penalaran dari struktur + jumlah baris, bukan pengukuran.
--    Kalau nanti terasa lambat, tersangka pertama BUKAN kedua index ini,
--    melainkan subquery terkorelasi ke stock_summary (view itu meng-GROUP BY
--    seluruh stock_ledger tiap dipanggil, sekali per produk) — perbaiki jadi
--    satu agregasi LEFT JOIN LATERAL dulu, baru pikirkan index lain.
CREATE INDEX IF NOT EXISTS idx_sp_btb_sp_order_live
  ON public.sp_btb (sp_order_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sp_orders_company_status
  ON public.sp_orders (company_id, status) WHERE deleted_at IS NULL;

-- ─── VERIFIKASI (jalankan TERPISAH setelah 1-3) ──────────────────────────────
--   -- a. Fungsi ada + STABLE + INVOKER (prosecdef harus false):
--   SELECT proname, provolatile, prosecdef FROM pg_proc WHERE proname='get_storbit_dashboard_stats';
--   -- provolatile 's' = STABLE, prosecdef false = SECURITY INVOKER
--
--   -- b. anon TIDAK boleh punya EXECUTE:
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name='get_storbit_dashboard_stats';
--   -- harus TIDAK ada baris grantee='anon'
--
--   -- c. Smoke test (SOA). CATATAN: auth.uid() NULL di SQL Editor, jadi
--   --    p_company_id WAJIB diisi eksplisit di sini; RLS-nya sendiri baru
--   --    teruji betul lewat browser sebagai user asli.
--   SELECT public.get_storbit_dashboard_stats(NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697');
--
--   -- d. Silang-cek total_sp:
--   SELECT COUNT(*) FROM public.sp_orders
--    WHERE deleted_at IS NULL AND company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697';
--
--   -- e. Silang-cek delivered_belum_btb (angka harus sama dgn payload RPC):
--   SELECT COUNT(*) FROM public.sp_orders o
--    WHERE o.deleted_at IS NULL AND o.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
--      AND o.status IN ('SAMPAI','TERKIRIM_PENUH')
--      AND NOT EXISTS (SELECT 1 FROM public.sp_btb b WHERE b.sp_order_id=o.id AND b.deleted_at IS NULL);
--
--   -- f. Silang-cek zero_stock:
--   SELECT COUNT(*) FROM public.products p
--    WHERE p.deleted_at IS NULL AND p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
--      AND p.is_service=false AND p.is_active=true
--      AND COALESCE((SELECT SUM(ss.available) FROM public.stock_summary ss
--                     WHERE ss.product_id=p.id AND ss.company_id=p.company_id),0) <= 0;
--
--   -- g0. ASSERTION PARTISI DONUT — 6 slice harus menjumlah PERSIS total_sp.
--   --     Kalau selisihnya bukan 0, ada status yang luput dari partisi.
--   WITH m AS (SELECT public.get_storbit_dashboard_stats(
--                NULL, NULL, 'd2e5e565-5f67-4954-b8d9-5979a2a0c697') -> 'manifest' AS j)
--   SELECT (j->>'total_sp')::int
--        - ((j->>'pending_open')::int + (j->>'shipped')::int + (j->>'terkirim_penuh')::int
--         + (j->>'btb_terbit')::int + (j->>'finance')::int + (j->>'cancelled')::int) AS selisih_harus_0
--   FROM m;
--
--   -- g. rop_belum_diisi harus = total_produk tepat setelah 20260818000001
--   --    (reorder_point belum diisi siapa pun).
--
--   -- h. expired harus TURUN DRASTIS dibanding versi rumus pertama. Kalau
--   --    angkanya tak berubah, filter status tidak mengikat -> cek lagi.
--   --    Pembanding rumus LAMA (yang salah konsep) utk melihat selisihnya:
--   SELECT COUNT(*) AS expired_rumus_lama FROM public.sp_orders o
--    WHERE o.deleted_at IS NULL AND o.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
--      AND o.status NOT IN ('LUNAS','CANCELLED')
--      AND (SELECT MIN(si.expired_date) FROM public.sp_items si
--            WHERE si.customer_id=o.customer_id AND si.sp_no=o.sp_no
--              AND si.expired_date IS NOT NULL) < CURRENT_DATE;
--
--   -- i. dispatch_data_tersedia harus ±69 (pengukuran 18 Agu 2026: 69/425).
--   --    Kalau jauh meleset, join (customer_id, sp_no)-nya yang bermasalah.
--
--   -- j. Bukti konversi timezone benar-benar mengikat — dua angka di bawah
--   --    HARUS berbeda kalau ada dispatch dini hari WIB (00:00-06:59):
--   SELECT
--     COUNT(*) FILTER (WHERE (dn.dispatched_at AT TIME ZONE 'Asia/Jakarta')::date
--                            <> (dn.dispatched_at)::date) AS beda_tanggal_wib_vs_utc,
--     COUNT(*) AS total_dispatch
--   FROM public.delivery_notes dn
--    WHERE dn.dispatched_at IS NOT NULL AND dn.status <> 'cancelled';
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_storbit_dashboard_stats(uuid, text, uuid);
-- DROP INDEX IF EXISTS public.idx_sp_btb_sp_order_live;
-- DROP INDEX IF EXISTS public.idx_sp_orders_company_status;
