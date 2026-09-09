-- =============================================================================
-- Migration: 20260909000006_crm_dashboard_aggregate_rpc
-- Phase:     Gelombang 2 — mencabut akar plafon 1000 baris di CRM Dashboard
--            & CRM Report (Gelombang 1 hanya membuat kegagalannya KELIHATAN).
-- Depends:   accounts · account_lifecycle_history · inquiries
--            · inquiry_status_history · activities · quotations
--            · RLS prospects_read / alh_read / inquiries_read / activities_select
--              / quotations_read — SEMUANYA TIDAK DIUBAH oleh migrasi ini.
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- SIFAT: 100% BACA. Nol DDL tabel, nol perubahan RLS, nol backfill, nol trigger.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- KENAPA RPC, BUKAN MENAIKKAN .limit()
--   Menaikkan plafon MEMINDAHKAN tebing, tidak menghapusnya — dan tebing
--   berikutnya datang TANPA peringatan, karena guard `rows.length === 1000`
--   berhenti akurat begitu plafonnya bukan 1000 lagi. Agregasi di DB membuat
--   plafon hilang secara struktural: benar di 1.258 akun maupun 125.800.
--
-- KENAPA SECURITY INVOKER, BUKAN DEFINER
--   Audit scoping (Gelombang 2, Task 0) membandingkan penyaringan FE dengan RLS
--   untuk SETIAP tabel yang disentuh di sini. Hasilnya seragam: penyaringan FE
--   hanya pernah REDUNDAN (mis. `sales` di accounts) atau LEBIH KETAT (mis.
--   `operations` di accounts, sumbu company singular) dari RLS. TIDAK ADA satu
--   pun kasus di mana FE menegakkan sesuatu yang RLS biarkan terbuka.
--   Artinya tidak ada celah yang wajib direplikasi, dan INVOKER membiarkan RLS
--   menjaga dirinya sendiri — pola yang sama dengan keempat RPC Storbit di
--   20260905000001.
--
--   ⛔ KALAU KELAK DIUBAH KE DEFINER: SELURUH isi prospects_read /
--      inquiries_read / alh_read / activities_select / quotations_read WAJIB
--      disalin ke dalam badan fungsi, termasuk cabang `operations` dan
--      `procurement`. Mengubah klausanya saja tanpa itu = kebocoran lintas
--      entitas seketika, dan gejalanya angka yang TERLIHAT WAJAR.
--
-- PARAMETER = PENYEMPIT, BUKAN GERBANG
--   p_company_id  cermin `byCompany` di FE. NULL = tidak menyempitkan (dipakai
--                 super_admin). RLS tetap menjaga apa pun isinya.
--   p_scope_own   cermin `isSalesOnly` di FE.
--   Kepemilikan diturunkan dari auth.uid() DI DALAM fungsi — SENGAJA bukan
--   parameter, supaya tidak ada jalan menyodorkan uid orang lain. Sekalipun
--   disodorkan, RLS tetap menolak; ini lapis kedua, bukan satu-satunya.
--
-- ⚠️ PELESTARIAN PERILAKU, BUKAN PERBAIKAN (keputusan Den)
--   Cabang `operations` di prospects_read mengizinkan mereka membaca SEMUA
--   akun ber-account_status='customer'. Penyaringan FE hari ini TIDAK
--   memberikannya, dan RPC di bawah MENIRU FE (p_scope_own berlaku sama untuk
--   sales maupun operations). Ini melestarikan angka yang berlaku sekarang.
--   Jangan "diperbaiki" diam-diam menjadi selonggar RLS — itu keputusan produk
--   tersendiri, dan efeknya angka operations naik tanpa sebab bisnis.
--
-- ⚠️ TEMUAN YANG SENGAJA TIDAK DISENTUH DI SINI (dicatat, bukan dikerjakan)
--   (a) prospects_read memakai `account_status` (kolom lama) untuk cabang
--       operations, sementara funnel membaca `lifecycle_stage`. Keduanya hidup
--       berdampingan pasca dual-write 20260908000001.
--   (b) activities_select masih `get_user_company_id()` SINGULAR — instance
--       TD-180 di tabel yang CRMReportPage baca tanpa filter FE apa pun.
--   Keduanya perubahan RLS, di luar scope migrasi yang bersifat 100% baca ini.
-- =============================================================================


-- ─── 1. crm_lifecycle_funnel ────────────────────────────────────────────────
-- Menggantikan query [10] (baris akun) DAN query count [15] sekaligus.
-- Total funnel = SUM(cnt) dari fungsi ini, jadi total dan rinciannya lahir dari
-- SATU sumber — mustahil melenceng. Gelombang 1 terpaksa memakai dua query
-- terpisah (baris untuk rincian, count untuk total) justru karena plafon.
CREATE OR REPLACE FUNCTION public.crm_lifecycle_funnel(
  p_company_id uuid    DEFAULT NULL,
  p_scope_own  boolean DEFAULT false
) RETURNS TABLE(stage text, cnt bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(a.lifecycle_stage, '(empty)')::text AS stage,
         count(*)::bigint                             AS cnt
  FROM   accounts a
  WHERE  a.deleted_at IS NULL
    AND  (p_company_id IS NULL OR a.company_id = p_company_id)
    AND  (NOT p_scope_own
          OR a.assigned_to = auth.uid()
          OR a.created_by  = auth.uid())
  GROUP  BY 1;
$$;


-- ─── 2. crm_mql_conversion ──────────────────────────────────────────────────
-- Kohort dibentuk DI DALAM DB lewat join account_lifecycle_history x accounts.
-- Ini menutup DUA cacat sekaligus:
--   (a) filter .in('account_id', <=1000 UUID) di FE menghasilkan URL ~37 KB dan
--       ditolak sebelum menyentuh Postgres (dugaan kuat HTTP 414) — itulah
--       sebab kartunya menampilkan "No account has been recorded reaching MQL
--       yet" padahal produksi punya 1.258 akun;
--   (b) rantai dua tingkat: kohortnya hanya bisa diambil dari 1000 akun yang
--       lolos plafon query [10]. Memperbaiki (a) saja tidak cukup.
--
-- ⚠️ URUTAN KLASIFIKASI TIDAK BOLEH DIUBAH: lost DULU, baru sql/customer,
--    sisanya pending. Sama persis dengan JS yang digantikan. Membalik urutannya
--    memindahkan akun `lost` yang pernah mencapai sql ke ember "converted" dan
--    menaikkan conversion rate secara palsu.
--
-- has_real_transition membedakan "kohort ada tapi seluruhnya baris backfill"
-- dari "kohort benar-benar punya transisi". Baris backfill ber-from_stage NULL;
-- tanpa pembeda ini, persentase apa pun terbaca sebagai "sekian persen gagal
-- naik" padahal yang terjadi adalah RIWAYATNYA BELUM ADA.
CREATE OR REPLACE FUNCTION public.crm_mql_conversion(
  p_company_id uuid    DEFAULT NULL,
  p_scope_own  boolean DEFAULT false
) RETURNS TABLE(converted bigint, pending bigint, lost bigint,
                has_real_transition boolean)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH cohort AS (
    SELECT a.id,
           a.lifecycle_stage,
           bool_or(h.from_stage IS NOT NULL) AS real_transition
    FROM   accounts a
    JOIN   account_lifecycle_history h ON h.account_id = a.id
    WHERE  h.to_stage = 'mql'
      AND  a.deleted_at IS NULL
      AND  (p_company_id IS NULL OR a.company_id = p_company_id)
      AND  (NOT p_scope_own
            OR a.assigned_to = auth.uid()
            OR a.created_by  = auth.uid())
    GROUP  BY a.id, a.lifecycle_stage
  )
  -- Tiga ember, urutan penilaian SAMA dengan JS yang digantikan:
  --   1) lost            2) sql/customer -> converted     3) sisanya -> pending
  -- Karena lifecycle_stage satu kolom, ketiganya saling lepas dengan
  -- sendirinya. Yang TIDAK boleh disederhanakan adalah cabang `pending`:
  -- `NOT IN (...)` bernilai NULL (bukan TRUE) saat lifecycle_stage NULL,
  -- sehingga akun bertahap kosong akan jatuh ke LUAR ketiga ember —
  -- persis kebocoran yang komentar "klasifikasi EKSHAUSTIF" di FE larang.
  -- `IS NULL OR` di bawah yang menahannya, meniru `else` di JS.
  SELECT
    count(*) FILTER (WHERE lifecycle_stage IN ('sql','customer'))::bigint AS converted,
    count(*) FILTER (WHERE lifecycle_stage IS DISTINCT FROM 'lost'
                       AND (lifecycle_stage IS NULL
                            OR lifecycle_stage NOT IN ('sql','customer')))::bigint AS pending,
    count(*) FILTER (WHERE lifecycle_stage = 'lost')::bigint AS lost,
    COALESCE(bool_or(real_transition), false)                AS has_real_transition
  FROM cohort;
$$;


-- ─── 3. crm_lead_source_distribution ────────────────────────────────────────
-- Menggantikan query [0] + agregasi `sourceCounts` di JS.
-- Widget ini PERSENTASE, jadi terpotongnya paling menyesatkan dari semua:
-- kalau 1000 baris pertama tak representatif, SELURUH proporsi salah sambil
-- tetap terlihat utuh.
-- Whitelist lifecycle_stage disalin apa adanya dari query [0], termasuk
-- 'lead_pool' yang masih menunggu backfill (TODO di FE, AUDIT_CRM_FLOW.md).
CREATE OR REPLACE FUNCTION public.crm_lead_source_distribution(
  p_company_id uuid        DEFAULT NULL,
  p_scope_own  boolean     DEFAULT false,
  p_start      timestamptz DEFAULT NULL,
  p_end        timestamptz DEFAULT NULL
) RETURNS TABLE(source text, cnt bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  -- Sentinel '__none__' untuk source kosong — SENGAJA bukan 'other'.
  -- `other` adalah nilai source yang SAH dan punya ratusan baris sendiri di
  -- produksi; meleburkan NULL ke situ membuat dua hal berbeda tak bisa
  -- dipisahkan lagi. Sentinel yang sama dipakai FE (`a.source || '__none__'`)
  -- dan pola yang sama dipakai loss_reason_id — jangan "dirapikan".
  SELECT COALESCE(NULLIF(btrim(a.source), ''), '__none__')::text AS source,
         count(*)::bigint                                        AS cnt
  FROM   accounts a
  WHERE  a.deleted_at IS NULL
    AND  a.lifecycle_stage IN ('lead','mql','sql','prospect','lead_pool')
    AND  (p_company_id IS NULL OR a.company_id = p_company_id)
    AND  (p_start IS NULL OR a.created_at >= p_start)
    AND  (p_end   IS NULL OR a.created_at <  p_end)
    AND  (NOT p_scope_own
          OR a.assigned_to = auth.uid()
          OR a.created_by  = auth.uid())
  GROUP  BY 1;
$$;


-- ─── 4. crm_stage_conversion ────────────────────────────────────────────────
-- "Pernah mencapai tahap X" = ada baris riwayat ber-to_status = X. Deal yang
-- mati di tengah TETAP terhitung pernah melewati tahap sebelumnya — itulah yang
-- membuat angka ini menjawab "bocor di tahap mana", bukan "sekarang ada berapa".
--
-- ⛔⛔ p_scope_own memakai `created_by`, BUKAN `owner_id` — DISENGAJA.
--    RLS inquiries_read di PRODUKSI hari ini masih berbasis created_by;
--    migrasi 20260830000003 yang memindahkannya ke owner_id BELUM DIJALANKAN
--    (header filenya masih "BELUM DIJALANKAN", dan snapshot produksi
--    membuktikannya). Memakai owner_id di sini sementara RLS masih created_by
--    menghasilkan IRISAN keduanya — sales kehilangan deal yang dioper kepadanya,
--    SENYAP, nol baris tanpa error.
--    GANTI ke owner_id BERSAMAAN dengan migrasi 20260830000003, jangan salah
--    satu duluan. Berlaku untuk fungsi ini DAN crm_stage_age di bawah.
--
-- Kohortnya = deal TERBUKA (tanpa batas periode, deal terbuka tak punya tanggal
-- tutup untuk disaring) + deal TERTUTUP di periode aktif. Sama persis dengan
-- openInq + closedInq yang dipakai widget di sebelahnya.
CREATE OR REPLACE FUNCTION public.crm_stage_conversion(
  p_company_id uuid        DEFAULT NULL,
  p_scope_own  boolean     DEFAULT false,
  p_start      timestamptz DEFAULT NULL,
  p_end        timestamptz DEFAULT NULL
) RETURNS TABLE(to_status text, inquiries bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH cohort AS (
    SELECT i.id
    FROM   inquiries i
    WHERE  i.deleted_at IS NULL
      AND  (p_company_id IS NULL OR i.company_id = p_company_id)
      AND  (NOT p_scope_own OR i.created_by = auth.uid())
      AND  (
             i.status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION')
             OR (i.status IN ('WON','LOST','CANCELLED')
                 AND (p_start IS NULL OR i.closed_at >= p_start)
                 AND (p_end   IS NULL OR i.closed_at <  p_end))
           )
  )
  SELECT upper(h.to_status)::text        AS to_status,
         count(DISTINCT h.inquiry_id)::bigint AS inquiries
  FROM   inquiry_status_history h
  JOIN   cohort c ON c.id = h.inquiry_id
  GROUP  BY 1;
$$;


-- ─── 5. crm_stage_age ───────────────────────────────────────────────────────
-- Satu baris per inquiry dalam kohort, dengan KAPAN ia masuk status yang
-- sekarang. Memberi makan tiga widget: Aging Per Tahap, Daftar Deal Stale, dan
-- kolom umur di keduanya.
--
-- Menggantikan .in('inquiry_id', cohortIds) yang bisa memuat SAMPAI 2.000 UUID
-- (openInq 1000 + closedInq 1000) — URL ~74 KB, dua kali lipat kasus MQL, dan
-- belum meledak hanya karena volume inquiry belum sampai ke sana.
--
-- ⛔ p_scope_own memakai created_by — alasan lengkap di crm_stage_conversion.
--
-- owner_id dikembalikan MENTAH (bukan namanya): resolusi nama sudah punya
-- query sendiri di FE yang dibatasi jumlah USER (puluhan), bukan jumlah baris —
-- ia tidak pernah jadi risiko plafon, jadi tidak ikut dipindah ke sini.
CREATE OR REPLACE FUNCTION public.crm_stage_age(
  p_company_id uuid        DEFAULT NULL,
  p_scope_own  boolean     DEFAULT false,
  p_start      timestamptz DEFAULT NULL,
  p_end        timestamptz DEFAULT NULL
) RETURNS TABLE(inquiry_id uuid, inquiry_no text, status text,
                company_id uuid, owner_id uuid, account_name text,
                stage_since timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH cohort AS (
    SELECT i.id, i.inquiry_no, i.status, i.company_id, i.owner_id,
           i.prospect_id, i.customer_id
    FROM   inquiries i
    WHERE  i.deleted_at IS NULL
      AND  (p_company_id IS NULL OR i.company_id = p_company_id)
      AND  (NOT p_scope_own OR i.created_by = auth.uid())
      AND  (
             i.status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION')
             OR (i.status IN ('WON','LOST','CANCELLED')
                 AND (p_start IS NULL OR i.closed_at >= p_start)
                 AND (p_end   IS NULL OR i.closed_at <  p_end))
           )
  ),
  last_move AS (
    -- DISTINCT ON: baris pertama tiap inquiry sesudah diurut menurun = transisi
    -- TERAKHIRNYA. Bentuk yang sama dengan `.order('changed_at', desc)` lalu
    -- "ambil yang pertama terlihat" di JS yang digantikan.
    SELECT DISTINCT ON (h.inquiry_id) h.inquiry_id, h.changed_at
    FROM   inquiry_status_history h
    JOIN   cohort c ON c.id = h.inquiry_id
    ORDER  BY h.inquiry_id, h.changed_at DESC
  )
  SELECT c.id,
         c.inquiry_no::text,
         upper(c.status)::text,
         c.company_id,
         c.owner_id,
         COALESCE(pa.name, ca.name)::text AS account_name,
         lm.changed_at                    AS stage_since
  FROM   cohort c
  LEFT   JOIN last_move lm ON lm.inquiry_id = c.id
  LEFT   JOIN accounts  pa ON pa.id = c.prospect_id
  LEFT   JOIN accounts  ca ON ca.id = c.customer_id;
$$;


-- ─── 6. crm_report_window ───────────────────────────────────────────────────
-- Agregat per-salesperson untuk SATU jendela tanggal, sumber KPI + tabel
-- per-sales CRMReportPage.
--
-- NOL parameter scoping — SENGAJA, dan ini bukan kelalaian. `fetchWindow` di
-- halaman itu memang TIDAK PERNAH menyempitkan di FE (nol filter company, nol
-- filter kepemilikan); komentarnya sendiri berbunyi "RLS scopes by
-- company/role". INVOKER mempertahankan keadaan itu apa adanya. Menambahkan
-- p_company_id di sini justru akan MENGURANGI baris yang selama ini dilihat
-- manager/super_admin lintas entitas, dan angka laporan turun tanpa sebab
-- bisnis.
--
-- Klasifikasi status disalin dari mapActs di FE: cancelled -> Cancelled,
-- done -> Done, sisanya Overdue kalau scheduled_for sudah lewat, selain itu
-- Pending. Ambang "sudah lewat" memakai akhir hari (23:59:59) supaya aktivitas
-- yang dijadwalkan HARI INI tidak langsung terhitung overdue — persis perilaku
-- FE yang menempelkan "T23:59:59" sebelum membandingkan.
CREATE OR REPLACE FUNCTION public.crm_report_window(
  p_start date,
  p_end   date
) RETURNS TABLE(sales_id uuid, total bigint, done bigint, pending bigint,
                overdue bigint, cancelled bigint,
                calls bigint, visits bigint, tasks bigint,
                prospects bigint, quotations bigint)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  WITH acts AS (
    SELECT a.assigned_to AS sales_id,
           /* Pemetaan tipe DISALIN dari TYPE_MAP di FE (CRMReportPage:67):
              call/whatsapp -> Call · visit/meeting -> Visit · email -> Email ·
              sisanya (termasuk followup) -> Task. Kolom Call/Visit/Task di
              tabel per-sales membacanya; 'Email' sengaja tak punya kolom
              sendiri di tabel itu dan ikut terhitung di `total` saja. */
           CASE
             WHEN a.type IN ('call','whatsapp')  THEN 'Call'
             WHEN a.type IN ('visit','meeting')  THEN 'Visit'
             WHEN a.type = 'email'               THEN 'Email'
             ELSE 'Task'
           END AS kind,
           CASE
             WHEN a.status = 'cancelled' THEN 'Cancelled'
             WHEN a.status = 'done'      THEN 'Done'
             -- scheduled_for bertipe DATE; ditambah 23:59:59 supaya aktivitas
             -- yang dijadwalkan HARI INI tidak langsung terhitung overdue.
             -- Bentuk yang sama dengan `new Date(scheduled_for + "T23:59:59")`
             -- di FE. Perbandingan date+time (timestamp) vs now() (timestamptz)
             -- memakai TimeZone sesi — sama seperti FE memakai zona browser.
             WHEN a.scheduled_for IS NOT NULL
              AND (a.scheduled_for + time '23:59:59') < now() THEN 'Overdue'
             ELSE 'Pending'
           END AS st
    FROM   activities a
    WHERE  a.deleted_at IS NULL
      AND  a.scheduled_for >= p_start
      AND  a.scheduled_for <= p_end
  ),
  act_agg AS (
    SELECT sales_id,
           count(*) FILTER (WHERE st <> 'Cancelled')::bigint AS total,
           count(*) FILTER (WHERE st =  'Done')::bigint      AS done,
           count(*) FILTER (WHERE st =  'Pending')::bigint   AS pending,
           count(*) FILTER (WHERE st =  'Overdue')::bigint   AS overdue,
           count(*) FILTER (WHERE st =  'Cancelled')::bigint AS cancelled,
           /* Cacah per-tipe MENGECUALIKAN Cancelled, sama seperti `total` —
              tabel per-sales di FE menghitungnya dari `acts` (aktif saja),
              bukan dari `actsAll`. Menghitungnya dari semua baris akan membuat
              Call+Visit+Task > total. */
           count(*) FILTER (WHERE st <> 'Cancelled' AND kind = 'Call')::bigint  AS calls,
           count(*) FILTER (WHERE st <> 'Cancelled' AND kind = 'Visit')::bigint AS visits,
           count(*) FILTER (WHERE st <> 'Cancelled' AND kind = 'Task')::bigint  AS tasks
    FROM   acts
    GROUP  BY sales_id
  ),
  prosp AS (
    SELECT p.assigned_to AS sales_id, count(*)::bigint AS prospects
    FROM   accounts p
    WHERE  p.deleted_at IS NULL
      AND  p.lifecycle_stage IN ('lead','mql','sql','prospect','lead_pool')
      AND  p.created_at >= p_start::timestamptz
      AND  p.created_at <= (p_end::timestamptz + interval '1 day' - interval '1 microsecond')
    GROUP  BY 1
  ),
  quo AS (
    SELECT q.created_by AS sales_id, count(*)::bigint AS quotations
    FROM   quotations q
    WHERE  q.deleted_at IS NULL
      AND  q.status IN ('SENT','SUBMITTED','sent','quoted')
      AND  q.created_at >= p_start::timestamptz
      AND  q.created_at <= (p_end::timestamptz + interval '1 day' - interval '1 microsecond')
    GROUP  BY 1
  ),
  ids AS (
    SELECT sales_id FROM act_agg
    UNION SELECT sales_id FROM prosp
    UNION SELECT sales_id FROM quo
  )
  SELECT i.sales_id,
         COALESCE(a.total, 0), COALESCE(a.done, 0), COALESCE(a.pending, 0),
         COALESCE(a.overdue, 0), COALESCE(a.cancelled, 0),
         COALESCE(a.calls, 0), COALESCE(a.visits, 0), COALESCE(a.tasks, 0),
         COALESCE(p.prospects, 0), COALESCE(q.quotations, 0)
  FROM   ids i
  LEFT   JOIN act_agg a ON a.sales_id = i.sales_id
  LEFT   JOIN prosp   p ON p.sales_id = i.sales_id
  LEFT   JOIN quo     q ON q.sales_id = i.sales_id
  WHERE  i.sales_id IS NOT NULL;
$$;


-- ─── ACL — pola FASE 5 / 20260905000001 ─────────────────────────────────────
-- Supabase meng-GRANT fungsi baru ke `anon` SECARA OTOMATIS, jadi REVOKE di
-- bawah BUKAN formalitas. WAJIB ikut dijalankan ulang setiap kali salah satu
-- fungsi di atas di-DROP+CREATE — DROP menghapus GRANT-nya, dan gejalanya tidak
-- terlihat sampai seseorang memanggilnya sebagai anon.
-- (indomarco_dashboard_stats di repo ini justru CONTOH YANG TIDAK DIIKUTI: ia
--  ter-GRANT ke anon dan tanpa SET search_path — itu TD-24 yang belum ditutup.)

REVOKE ALL     ON FUNCTION public.crm_lifecycle_funnel(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_lifecycle_funnel(uuid, boolean) TO authenticated;

REVOKE ALL     ON FUNCTION public.crm_mql_conversion(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_mql_conversion(uuid, boolean) TO authenticated;

REVOKE ALL     ON FUNCTION public.crm_lead_source_distribution(uuid, boolean, timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_lead_source_distribution(uuid, boolean, timestamptz, timestamptz) TO authenticated;

REVOKE ALL     ON FUNCTION public.crm_stage_conversion(uuid, boolean, timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_stage_conversion(uuid, boolean, timestamptz, timestamptz) TO authenticated;

REVOKE ALL     ON FUNCTION public.crm_stage_age(uuid, boolean, timestamptz, timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_stage_age(uuid, boolean, timestamptz, timestamptz) TO authenticated;

REVOKE ALL     ON FUNCTION public.crm_report_window(date, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_report_window(date, date) TO authenticated;

COMMENT ON FUNCTION public.crm_lifecycle_funnel(uuid, boolean) IS
  'Distribusi lifecycle_stage akun. Total = SUM(cnt). Menggantikan fetch baris berplafon 1000 + count terpisah. SECURITY INVOKER: RLS prospects_read yang menjaga.';
COMMENT ON FUNCTION public.crm_mql_conversion(uuid, boolean) IS
  'Kohort akun yang PERNAH mencapai mql + klasifikasi tahap sekarang. Urutan klasifikasi (lost -> sql/customer -> pending) TIDAK BOLEH diubah.';
COMMENT ON FUNCTION public.crm_lead_source_distribution(uuid, boolean, timestamptz, timestamptz) IS
  'Distribusi accounts.source untuk donut Lead Source. Widget PERSENTASE — terpotongnya paling menyesatkan, itulah alasan ia dipindah ke DB.';
COMMENT ON FUNCTION public.crm_stage_conversion(uuid, boolean, timestamptz, timestamptz) IS
  'Jumlah inquiry DISTINCT yang pernah mencapai tiap status. p_scope_own memakai created_by — ganti ke owner_id BERSAMAAN dengan migrasi 20260830000003.';
COMMENT ON FUNCTION public.crm_stage_age(uuid, boolean, timestamptz, timestamptz) IS
  'Satu baris per inquiry + kapan ia masuk status sekarang (Aging & Stale Deals). p_scope_own memakai created_by — lihat catatan di crm_stage_conversion.';
COMMENT ON FUNCTION public.crm_report_window(date, date) IS
  'Agregat aktivitas/akun/quotation per salesperson untuk satu jendela tanggal. NOL parameter scoping — halaman pemanggilnya memang tak pernah menyempitkan di FE.';

-- ─── VERIFIKASI ──────────────────────────────────────────────────────────────
--   -- a. Keenam fungsi ada, INVOKER, ber-search_path, PUBLIC ter-REVOKE:
--   SELECT proname, prosecdef, proconfig, proacl
--   FROM   pg_proc
--   WHERE  proname IN ('crm_lifecycle_funnel','crm_mql_conversion',
--                      'crm_lead_source_distribution','crm_stage_conversion',
--                      'crm_stage_age','crm_report_window')
--   ORDER  BY proname;
--   -- HARUS 6 baris · prosecdef = FALSE (invoker) di SEMUANYA
--   -- proconfig memuat search_path=public di SEMUANYA
--   -- proacl TIDAK memuat '=X/postgres' (itu berarti PUBLIC masih bisa EXECUTE)
--
--   -- b. NOL akses anon (harus 0 baris):
--   SELECT proname FROM pg_proc p
--   WHERE  proname LIKE 'crm\_%'
--     AND  has_function_privilege('anon', p.oid, 'EXECUTE');
--
--   -- c. Rekonsiliasi dengan Gelombang 1 — dijalankan DARI BROWSER, bukan SQL
--   --    Editor (auth.uid() NULL di sana, sehingga p_scope_own selalu kosong).
--   --    SUM(cnt) crm_lifecycle_funnel HARUS sama dengan angka "Total accounts"
--   --    yang sudah tampil sekarang (count server query [15]). Kalau berbeda,
--   --    penyempit p_company_id/p_scope_own belum cermin byCompany/ownAccounts.
--
--   -- d. crm_mql_conversion HARUS mengembalikan converted+pending+lost > 0
--   --    di produksi. Nol berarti kohort mql memang kosong — dan itu klaim
--   --    yang harus dibuktikan, bukan diasumsikan dari kegagalan request
--   --    seperti yang terjadi sebelum Gelombang 1.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.crm_lifecycle_funnel(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.crm_mql_conversion(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.crm_lead_source_distribution(uuid, boolean, timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.crm_stage_conversion(uuid, boolean, timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.crm_stage_age(uuid, boolean, timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.crm_report_window(date, date);
--   ⚠️ Rollback WAJIB disertai revert FE-nya. Tanpa itu kelima widget memanggil
--      fungsi yang tidak ada -> error -> `degraded` menyala di semuanya, dan
--      dashboard jadi kosong seluruhnya, bukan sekadar kembali ke plafon 1000.
