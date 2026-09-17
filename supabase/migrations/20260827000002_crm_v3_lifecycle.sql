-- =============================================================================
-- ⛔⛔ JANGAN JALANKAN MIGRASI INI DULU — DITAHAN 4 September 2026 ⛔⛔
--     (blok ini KOMENTAR saja; nol baris SQL di bawahnya diubah)
--
-- ALASAN: STEP 1 me-RENAME accounts.account_status -> lifecycle_stage.
--   Begitu ia jalan, kolom lama LENYAP SEKETIKA — dan `main` yang SEDANG
--   MELAYANI PRODUKSI masih membacanya. Produksi patah SEBELUM branch CRM v3
--   di-merge, jadi tak ada urutan deploy FE-dulu yang menyelamatkannya selama
--   `main` belum berubah. Ini BLOKIR, bukan sekadar urutan deploy.
--
-- CAKUPAN (diukur `git grep` ke `main`, 4 Sep 2026 — bukan perkiraan):
--   14 file · 29 baris hidup (di luar komentar)
--     - 8 baris di dalam .select()  : DcMasterPage:175 · ActivitiesPage:589 ·
--       CRMDashboardPage:1956,2200 · CRMReportPage:197 · InquiryFormPage:181,183,225
--     - 15 baris filter .in()/.eq() : db.js:228 · CustomerListPage:598,611 ·
--       PipelineKanbanPage:471 · ProspectListPage:128 · activityFeed.js:56 · dll
--     - 3 baris MENULIS             : db.js:266 · CustomerListPage.jsx:373 ·
--                                     ProspectFormPage.jsx:282
--   ⚠️ Angka "sepuluh file" yang sempat beredar UNDER-COUNT. Jangan dipakai.
--
-- YANG BOLEH DIJALANKAN SEKARANG (nol dampak ke `main`), berurutan:
--   20260827000001_crm_v3_master_data
--   20260828000001_inquiry_status_history
--   20260828000002_inquiries_closure_fields
--   20260830000002_inquiry_owner_backfill_and_lock
--   lalu refresh supabase/schema_snapshot.sql via pg_dump, baru FE.
--
-- PENAHANAN DICABUT HANYA SETELAH Keputusan Terbuka #35 dijawab
-- (docs/Governance/09_ROADMAP.md):
--   A — rename langsung: nol kerja tambahan, ADA jendela downtime sepanjang
--       deploy Vercel, dan rollback praktis MUSTAHIL (STEP 4 sudah menimpa
--       empat fungsi plpgsql).
--   B — tulis ulang jadi tambah-kolom + trigger sinkron dua arah, drop
--       account_status setelah branch stabil: nol downtime, perlu migrasi baru.
--
-- ⚠️ POIN KEDUA YANG BELUM SELESAI — Keputusan Terbuka #36:
--   Penyempitan set_prospect_on_inquiry di STEP 4 ('lead','mql','sql') ->
--   ('lead','mql') MEMBATALKAN keputusan tertulis 18 Jul 2026. Header di bawah
--   menyatakan ini "disetujui Den"; per keputusan Den 4 Sep 2026 statusnya
--   DIKEMBALIKAN jadi PERTANYAAN TERBUKA sampai dikonfirmasi ulang. Jangan
--   menjalankan migrasi ini sambil menganggap poin ini sudah beres.
--
-- Rujukan: 08_TECH_DEBT.md TD-225 · 03_DATA_MODEL.md gotcha #21 ·
--          09_ROADMAP.md Keputusan Terbuka #35/#36 · PROGRESS.md 2026-09-04
-- =============================================================================

-- =============================================================================
-- Migration: 20260827000002_crm_v3_lifecycle
-- Batch:     CRM v3 — Batch Persiapan, bagian B2 (lifecycle akun bersih)
-- Depends:   accounts · inquiries · profiles · 20260718000001_lifecycle_split_fase2
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- ISI
--   1. accounts.account_status  ->  accounts.lifecycle_stage (RENAME)
--   2. account_lifecycle_history (tabel baru) + RLS + GRANT
--   3. Trigger baru trg_z_log_lifecycle_change (riwayat tiap perubahan)
--   4. EMPAT fungsi ditulis ulang karena merujuk kolom lama
--   5. Backfill riwayat: 1 baris per akun
--
-- ⚠️ URUTAN DEPLOY — FRONTEND DULU, BARU SQL INI.
--    Rename kolom memutus FE seketika. Aturan CLAUDE.md ("deploy code yang
--    berhenti baca kolom DULU") berlaku terbalik di sini karena ini rename,
--    bukan drop: FE yang sudah memakai `lifecycle_stage` HARUS sudah live
--    sebelum SQL ini jalan. Ada jendela singkat di antaranya — kalau jendela
--    itu tidak dapat diterima, pilih pola tambah-kolom + sinkron dua arah
--    (TIDAK dipakai di migrasi ini; keputusan Den).
--
-- ⚠️ PRA-CEK WAJIB:
--     SELECT COUNT(*) FROM public.accounts WHERE account_status IS NULL;
--     -- Kalau > 0: baris itu TIDAK akan dapat baris riwayat di STEP 5,
--     --            sehingga "jumlah riwayat = jumlah akun" tidak tercapai.
--
-- APA YANG IKUT RENAME SENDIRI, APA YANG TIDAK
--   IKUT otomatis (tersimpan sebagai parse tree, bukan teks):
--     - RLS policy `prospects_read` (merujuk account_status di klausa operations)
--     - CHECK constraint accounts_account_status_check (isinya; NAMA-nya tidak)
--     - index & FK yang menyentuh kolom itu
--   TIDAK ikut (body plpgsql disimpan sebagai TEKS -> patah saat runtime):
--     - generate_customer_code()
--     - set_customer_on_inquiry_won()
--     - set_customer_on_won()
--     - set_prospect_on_inquiry()
--   Keempatnya ditulis ulang di STEP 4. Ini alasan STEP 4 tidak opsional.
--
--   `track_stage_change()` SENGAJA TIDAK DISENTUH — diverifikasi dari snapshot:
--   ia hanya membaca/menulis pipeline_stage + stage_changed_at, nol referensi
--   ke kolom yang di-rename. Menyentuhnya = perubahan tanpa alasan.
--
-- ⚠️ PERUBAHAN PERILAKU YANG DISENGAJA (disetujui Den, batch persiapan):
--   `set_prospect_on_inquiry` sebelumnya menaikkan ke 'prospect' dari
--   ('lead','mql','sql'). Urutan lifecycle yang berlaku sekarang adalah
--   lead -> mql -> prospect -> sql -> customer, sehingga sql -> prospect
--   adalah PENURUNAN. Daftar dipersempit jadi ('lead','mql').
--   Catatan kejujuran: migrasi 20260718000001 mendokumentasikan daftar lama
--   sebagai perilaku yang DISENGAJA ("promosi lead/mql/sql -> prospect"), jadi
--   perubahan ini MEMBATALKAN keputusan tertulis 18 Jul 2026 — bukan menambal
--   bug yang tak sengaja. Den mengonfirmasi urutan 18 Jul itu heuristik
--   transisi dari pipeline_stage lama, bukan desain akhir.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — RENAME kolom + nama constraint
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.accounts RENAME COLUMN account_status TO lifecycle_stage;

-- Isi CHECK-nya sudah otomatis merujuk kolom baru; yang tersisa cuma namanya
-- supaya tidak menyesatkan pembaca berikutnya.
ALTER TABLE public.accounts
  RENAME CONSTRAINT accounts_account_status_check TO accounts_lifecycle_stage_check;

COMMENT ON COLUMN public.accounts.lifecycle_stage IS
  'Sumbu LIFECYCLE akun. Urutan: lead -> mql -> prospect -> sql -> customer. Dua exit manual dari tahap mana pun: free_agent, lost. Dulu bernama account_status (di-rename 27 Agu 2026, batch persiapan CRM v3).';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — account_lifecycle_history
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.account_lifecycle_history (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id  uuid NOT NULL,
    from_stage  character varying(50),          -- NULL = tak ada histori sebelumnya
    to_stage    character varying(50) NOT NULL,
    reason      text,                           -- nullable; diisi mulai batch Account
    changed_by  uuid,                           -- NULL = perubahan oleh trigger sistem
    changed_at  timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_lifecycle_history_pkey PRIMARY KEY (id),
    CONSTRAINT alh_account_fkey FOREIGN KEY (account_id)
        REFERENCES public.accounts(id) ON DELETE CASCADE,
    CONSTRAINT alh_changed_by_fkey FOREIGN KEY (changed_by)
        REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.account_lifecycle_history IS
  'Riwayat perubahan accounts.lifecycle_stage. Ditulis otomatis oleh trg_z_log_lifecycle_change. Kolom reason baru diisi mulai batch Account List & Detail lewat RPC dua tombol manual (Tandai Lost / Lepas jadi Free Agent).';
COMMENT ON COLUMN public.account_lifecycle_history.changed_by IS
  'auth.uid() saat perubahan. NULL bila perubahan datang dari trigger SECURITY DEFINER tanpa konteks user (mis. promosi otomatis dari inquiry).';

CREATE INDEX idx_alh_account_changed
  ON public.account_lifecycle_history (account_id, changed_at DESC);

ALTER TABLE public.account_lifecycle_history ENABLE ROW LEVEL SECURITY;

-- Delegasi ke RLS `accounts`: siapa yang boleh melihat akunnya, boleh melihat
-- riwayatnya. Subquery ke accounts TETAP tunduk pada RLS accounts sendiri,
-- jadi ini bukan USING(true) terselubung.
CREATE POLICY alh_read ON public.account_lifecycle_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_lifecycle_history.account_id));

-- Tulis HANYA lewat trigger (SECURITY DEFINER). Tidak ada policy INSERT/UPDATE/
-- DELETE untuk `authenticated` — riwayat tidak boleh dikarang lewat PostgREST.
-- Ini disengaja: tabel audit yang bisa ditulis klien bukan tabel audit.

GRANT SELECT ON TABLE public.account_lifecycle_history TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.account_lifecycle_history TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.account_lifecycle_history TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — Trigger riwayat
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.log_lifecycle_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage THEN
    INSERT INTO account_lifecycle_history (account_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.lifecycle_stage, NEW.lifecycle_stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER, bukan BEFORE: hanya perubahan yang benar-benar tersimpan yang dicatat.
-- Prefix trg_z_ mengikuti aturan urutan trigger CLAUDE.md — ia harus jalan
-- SESUDAH trigger BEFORE yang mungkin masih mengubah lifecycle_stage
-- (set_customer_on_won), supaya yang tercatat adalah nilai final.
CREATE TRIGGER trg_z_log_lifecycle_change
  AFTER UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_lifecycle_change();

-- CATATAN: tidak ada trigger lama yang "menulis lifecycle tanpa riwayat" untuk
-- dicabut. Diverifikasi: track_stage_change hanya menyentuh pipeline_stage.


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 4 — EMPAT fungsi yang merujuk kolom lama, ditulis ulang
-- ═════════════════════════════════════════════════════════════════════════════
-- Body diambil VERBATIM dari schema_snapshot.sql lalu di-diff; satu-satunya
-- perubahan adalah nama kolom — KECUALI set_prospect_on_inquiry, yang daftar
-- tahap sumbernya sengaja dipersempit (lihat header).

-- ── 4a. generate_customer_code — TIDAK ada di daftar tiga trigger yang
--        disebut di brief, tapi ia MERUJUK kolom lama dan akan patah tanpa ini.
CREATE OR REPLACE FUNCTION public.generate_customer_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  yr int := extract(year from coalesce(NEW.created_at, now()))::int;
  next_num int;
  prefix text;
  ckey text;
begin
  if NEW.lifecycle_stage = 'customer' and (NEW.code is null or NEW.code = '') then
    select code into prefix from public.companies
      where id = coalesce(NEW.owner_company_id, NEW.company_id);
    if prefix is null or prefix = '' then prefix := 'MSI'; end if;

    ckey := prefix || '-CUST';
    insert into public.code_counters (entity, year, last_number)
    values (ckey, yr, 1)
    on conflict (entity, year)
    do update set last_number = public.code_counters.last_number + 1
    returning last_number into next_num;

    NEW.code := prefix || '/CUST/' || yr || '/' || int_to_roman(next_num);
  end if;
  return NEW;
end;
$$;

-- ── 4b. set_customer_on_won — hanya rename kolom, logika utuh.
CREATE OR REPLACE FUNCTION public.set_customer_on_won() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.pipeline_stage = 'WON' AND COALESCE(NEW.lifecycle_stage,'') <> 'customer' THEN
    NEW.lifecycle_stage    := 'customer';
    NEW.became_customer_at := COALESCE(NEW.became_customer_at, now());
    NEW.converted_at       := COALESCE(NEW.converted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4c. set_customer_on_inquiry_won — juga TIDAK disebut di brief, juga patah
--        tanpa ini. Hanya rename kolom (3 tempat), logika utuh.
CREATE OR REPLACE FUNCTION public.set_customer_on_inquiry_won() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF NEW.status <> 'WON' THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'WON' THEN RETURN NEW; END IF;

  v_account_id := COALESCE(NEW.prospect_id, NEW.customer_id);
  IF v_account_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.accounts
  SET lifecycle_stage    = 'customer',
      became_customer_at = COALESCE(became_customer_at, now()),
      converted_at       = COALESCE(converted_at, now())
  WHERE id = v_account_id
    AND COALESCE(lifecycle_stage,'') <> 'customer'
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

-- ── 4d. set_prospect_on_inquiry — rename kolom + PENYEMPITAN daftar tahap.
--        ('lead','mql','sql') -> ('lead','mql'). Lihat header untuk alasannya
--        dan untuk catatan bahwa ini membatalkan keputusan tertulis 18 Jul.
CREATE OR REPLACE FUNCTION public.set_prospect_on_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.accounts
  SET lifecycle_stage = 'prospect'
  WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
    AND lifecycle_stage IN ('lead','mql');
  RETURN NEW;
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 — Backfill riwayat (1 baris per akun, from_stage NULL)
-- ═════════════════════════════════════════════════════════════════════════════
-- changed_by NULL: kita memang tidak tahu siapa yang menaruh akun di tahap
-- sekarang — data itu tak pernah direkam sebelum tabel ini ada. Mengarangnya
-- (mis. mengisi created_by) akan membuat riwayat berbohong.
INSERT INTO public.account_lifecycle_history (account_id, from_stage, to_stage, changed_by, changed_at)
SELECT id, NULL, lifecycle_stage, NULL, COALESCE(updated_at, created_at, now())
FROM public.accounts
WHERE lifecycle_stage IS NOT NULL;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI (jalankan TERPISAH sesudahnya)
-- ═════════════════════════════════════════════════════════════════════════════
--   -- a. Kolom lama benar-benar hilang, kolom baru ada
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='accounts' AND column_name IN ('account_status','lifecycle_stage');
--   -- HARUS: hanya lifecycle_stage
--
--   -- b. Nol fungsi yang masih menyebut nama lama
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%account_status%';
--   -- HARUS 0 baris
--
--   -- c. Nol policy yang masih menyebut nama lama
--   SELECT policyname, tablename FROM pg_policies
--    WHERE schemaname='public' AND (qual ILIKE '%account_status%' OR with_check ILIKE '%account_status%');
--   -- HARUS 0 baris (prospects_read seharusnya sudah ikut rename otomatis)
--
--   -- d. Backfill riwayat = jumlah akun
--   SELECT (SELECT count(*) FROM public.account_lifecycle_history) AS riwayat,
--          (SELECT count(*) FROM public.accounts WHERE lifecycle_stage IS NOT NULL) AS akun;
--   -- HARUS sama
--
--   -- e. Trigger riwayat aktif — bungkus ROLLBACK, nol efek permanen:
--   --  BEGIN;
--   --    UPDATE public.accounts SET lifecycle_stage='mql'
--   --     WHERE id=(SELECT id FROM public.accounts WHERE lifecycle_stage='lead' LIMIT 1);
--   --    SELECT from_stage, to_stage, changed_by FROM public.account_lifecycle_history
--   --     ORDER BY changed_at DESC LIMIT 1;      -- HARUS lead -> mql
--   --  ROLLBACK;
--
--   -- f. set_customer_on_won masih menaikkan ke customer — bungkus ROLLBACK:
--   --  BEGIN;
--   --    UPDATE public.accounts SET pipeline_stage='WON'
--   --     WHERE id=(SELECT id FROM public.accounts WHERE lifecycle_stage='prospect' LIMIT 1);
--   --    SELECT lifecycle_stage, became_customer_at FROM public.accounts
--   --     WHERE pipeline_stage='WON' ORDER BY updated_at DESC LIMIT 1;  -- HARUS customer
--   --  ROLLBACK;
--
--   -- g. Penyempitan set_prospect_on_inquiry bekerja — akun 'sql' TIDAK turun:
--   --  BEGIN;
--   --    -- buat inquiry baru untuk akun ber-lifecycle 'sql', lalu:
--   --    SELECT lifecycle_stage FROM public.accounts WHERE id='<akun_sql>';  -- HARUS tetap sql
--   --  ROLLBACK;
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   ⚠️ URUTAN TERBALIK. Fungsi dikembalikan ke nama kolom lama SESUDAH kolomnya
--      di-rename balik, bukan sebelum.
--   1. DROP TRIGGER IF EXISTS trg_z_log_lifecycle_change ON public.accounts;
--      DROP FUNCTION IF EXISTS public.log_lifecycle_change();
--   2. DROP TABLE IF EXISTS public.account_lifecycle_history;
--   3. ALTER TABLE public.accounts
--        RENAME CONSTRAINT accounts_lifecycle_stage_check TO accounts_account_status_check;
--      ALTER TABLE public.accounts RENAME COLUMN lifecycle_stage TO account_status;
--   4. Kembalikan keempat fungsi ke versi pra-migrasi (schema_snapshot.sql):
--        generate_customer_code · set_customer_on_won
--        set_customer_on_inquiry_won · set_prospect_on_inquiry
--      ⚠️ set_prospect_on_inquiry versi lama memakai IN ('lead','mql','sql').
