-- =============================================================================
-- Migration: 20260916000001_mark_inquiry_won_stop_pipeline_stage
-- Batch:     Persiapan B3 — sumbu "menang" lepas dari accounts.pipeline_stage
-- Depends:   20260813_mark_inquiry_won_rpc (LIVE) ·
--            20260722000008_set_customer_on_inquiry_won (LIVE) ·
--            20260908000001_accounts_lifecycle_dual_write (LIVE 7 Sep 2026)
-- Status:    DITAHAN — tunggu branch CRM v3 merge KE main DAN ke-deploy ke
--            production, DAN terverifikasi CRMDashboardPage.jsx di main sudah
--            baca dari RPC crm_* (sumbu inquiries.status), bukan lagi
--            pipeline_stage='WON'. Cek ulang syarat ini sebelum eksekusi,
--            jangan asumsikan otomatis terpenuhi begitu merge selesai.
--
-- MENGAPA DITAHAN — ketergantungan di FE `main` yang LIVE (16 Sep 2026):
--   CRMDashboardPage.jsx (main) menghitung Won Deals / Win Rate / kolom Won di
--   Sales Performance dari accounts.pipeline_stage='WON' (query wonCustomersRes
--   ~:1956-1963 → wonCount/winRate ~:1996-2000 → salesMap ~:2055-2066). Begitu
--   RPC ini berhenti menulis WON, tiap kemenangan sesudahnya DIAM-DIAM berhenti
--   terhitung di dashboard produksi (bukan error, bukan nol — angkanya basi).
--   Branch CRM v3 sudah memindahkan dashboard ke RPC crm_* (20260909000006,
--   LIVE) di sumbu inquiries.status, jadi merge + deploy branch itulah yang
--   menghapus ketergantungannya. Kosmetik yang ikut pindah lewat merge yang
--   sama: DealStepper DealDetailPage (main :474/:703) & StageBadge akun di
--   InquiryListPage (main :426).
--
-- PRASYARAT YANG SUDAH TERPENUHI (16 Sep 2026):
--   - EF aging-pipeline v8: prefilter lifecycle pra-customer, jadi customer
--     tidak lagi bergantung pada nilai 'WON' untuk lolos dari aging.
--   - CustomerDetailPage 5de08d1: Health Score / chevron / badge memakai
--     lifecycle_stage='customer', bukan pipeline_stage==='WON'.
--
-- APA YANG BERUBAH
--   1. mark_inquiry_won: blok `UPDATE public.accounts SET pipeline_stage='WON'`
--      DICABUT beserta tiga variabel yang hanya melayaninya (v_prospect_id,
--      v_customer_id, v_account_id) dan dua kolom di SELECT INTO. Guard izin,
--      guard idempotensi, UPDATE inquiries, dan INSERT audit_logs IDENTIK
--      dengan versi 20260813. Konversi akun -> customer TIDAK berubah: ia sudah
--      sejak 22 Jul 2026 terjadi lewat trg_set_customer_on_inquiry_won pada
--      UPDATE inquiries (AFTER trigger, dalam transaksi yang sama). Faktanya
--      trigger di accounts (butir 2) sudah no-op di jalur RPC ini: saat UPDATE
--      accounts dieksekusi, akunnya sudah 'customer' sehingga guard-nya false.
--   2. trg_set_customer_on_won + set_customer_on_won() DICABUT. Sesudah butir 1
--      nol jalur kode yang menulis pipeline_stage='WON' (diverifikasi grep di
--      main & branch 16 Sep 2026: DB hanya RPC ini; FE Kanban main menolak drop
--      ke Won sebelum menulis — PipelineKanbanPage.jsx:570; EF nol). DO-guard
--      di bawah menolak jalan bila ada fungsi lain yang masih menulisnya.
--      Jalur ad-hoc (SQL Editor / PostgREST langsung: GRANT ALL, tanpa CHECK)
--      sesudah ini tidak lagi mengonversi akun — ditutup permanen oleh CHECK
--      3 nilai di batch 3C.
--   Rencana lama F3-8 / batch 3C ("trigger lama di accounts hidup berdampingan
--   sampai F3-8", 05_WORKFLOW_MAP.md:70) — inilah pelaksanaannya.
--
-- EFEK SESUDAH JALAN
--   - accounts.pipeline_stage akun yang menang TETAP di nilai aktif terakhir
--     (NEW/CONTACTED/QUALIFIED) → himpunan legacy WON membeku (53 per 16 Sep
--     + kemenangan sampai hari eksekusi) — prasyarat backfill B3.
--   - stage_changed_at tak lagi disegarkan saat menang (pembaca satu-satunya =
--     EF aging, yang kini sudah mengecualikan customer).
--   - Tombol "Mark as Won" dan RPC-nya TETAP ADA (Keputusan Terbuka #48 /
--     TD-239 tetap dihormati — yang dicabut hanya satu efek samping).
--
-- PASANGAN DI BRANCH CRM v3
--   20260908000002_accounts_lifecycle_drop_legacy §2b sudah disesuaikan
--   (commit 796cc2c): DROP TRIGGER/FUNCTION IF EXISTS, idempoten terhadap
--   urutan eksekusi kedua file.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. mark_inquiry_won: berhenti menulis accounts.pipeline_stage
-- ═════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE mempertahankan owner (postgres) dan GRANT yang ada
-- (GRANT ALL ... TO authenticated, schema_snapshot.sql:20250).
CREATE OR REPLACE FUNCTION public.mark_inquiry_won(p_inquiry_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status      text;
  v_created_by  uuid;
  v_inquiry_no  text;
  v_company_id  uuid;
  v_user_email  text;
  v_user_role   text;
BEGIN
  SELECT status, created_by, inquiry_no, company_id
    INTO v_status, v_created_by, v_inquiry_no, v_company_id
  FROM public.inquiries
  WHERE id = p_inquiry_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  IF v_created_by IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Anda bukan pembuat inquiry ini — tidak bisa menandai WON.';
  END IF;

  IF v_status = 'WON' THEN
    RAISE EXCEPTION 'Inquiry ini sudah WON.';
  END IF;

  -- Konversi akun -> customer terjadi lewat trg_set_customer_on_inquiry_won pada
  -- UPDATE ini (jalur yang sama sejak 22 Jul 2026). Blok UPDATE accounts (tahap
  -- deal di akun) dicabut 16 Sep 2026: sumbu deal = inquiries.status.
  UPDATE public.inquiries
  SET status = 'WON', updated_at = now()
  WHERE id = p_inquiry_id;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();

  SELECT r.code INTO v_user_role
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  ORDER BY ur.granted_at DESC
  LIMIT 1;

  INSERT INTO public.audit_logs (
    user_id, user_email, user_role, company_id,
    action, entity_type, entity_id, entity_label,
    old_data, new_data, notes
  ) VALUES (
    auth.uid(), v_user_email, v_user_role, v_company_id,
    'MARK_INQUIRY_WON', 'INQUIRY', p_inquiry_id, v_inquiry_no,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'WON'),
    'Ditandai WON manual dari Inquiry Detail'
  );
END;
$$;

COMMENT ON FUNCTION public.mark_inquiry_won(uuid) IS
  'Tandai inquiry WON manual (pembuat atau super_admin; menolak bila sudah WON). Menulis inquiries.status + audit_logs MARK_INQUIRY_WON. Sejak 20260916000001 TIDAK menyentuh accounts.pipeline_stage; konversi akun -> customer lewat trg_set_customer_on_inquiry_won.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Cabut trigger lama di accounts — nol pemicu tersisa sesudah §1
-- ═════════════════════════════════════════════════════════════════════════════
-- Pra-cek: tak ada fungsi lain yang menulis pipeline_stage bernilai WON.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prokind = 'f'
     AND p.proname <> 'set_customer_on_won'
     AND p.prosrc ~* 'set\s+pipeline_stage\s*=\s*''WON''';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Masih ada % fungsi yang menulis pipeline_stage=WON — trigger belum boleh dicabut', n;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_set_customer_on_won ON public.accounts;
DROP FUNCTION IF EXISTS public.set_customer_on_won();

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI (jalankan TERPISAH sesudahnya)
-- ═════════════════════════════════════════════════════════════════════════════
--   -- a. Body RPC tak lagi menyentuh accounts
--   SELECT prosrc ILIKE '%public.accounts%' AS masih_sentuh_accounts
--     FROM pg_proc WHERE proname = 'mark_inquiry_won';
--   -- HARUS false
--
--   -- b. GRANT tetap (CREATE OR REPLACE tidak menghapusnya)
--   SELECT has_function_privilege('authenticated',
--            'public.mark_inquiry_won(uuid)', 'EXECUTE') AS authenticated_boleh;
--   -- HARUS true
--
--   -- c. Trigger lama hilang, lima trigger lain accounts tetap
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.accounts'::regclass AND NOT tgisinternal ORDER BY tgname;
--   -- HARAPAN: trg_a_sync_lifecycle_columns · trg_gen_customer_code_ins ·
--   --          trg_z_gen_customer_code_upd · trg_z_log_lifecycle_change ·
--   --          trg_z_track_stage_change  (TANPA trg_set_customer_on_won)
--
--   -- d. Fungsi lama hilang
--   SELECT count(*) FROM pg_proc WHERE proname = 'set_customer_on_won';
--   -- HARUS 0
--
--   -- e. Tes fungsional — LEWAT BROWSER, bukan SQL Editor (auth.uid() NULL di
--   --    sana → RPC menolak "bukan pembuat"). Buka Detail Deal satu inquiry uji
--   --    milik user login (bukan data pelanggan), tekan Mark as Won, lalu cek:
--   SELECT i.status, a.lifecycle_stage, a.code, a.pipeline_stage, a.became_customer_at
--     FROM public.inquiries i
--     JOIN public.accounts a ON a.id = COALESCE(i.prospect_id, i.customer_id)
--    WHERE i.id = '<id inquiry uji>';
--   -- HARAPAN: status WON · lifecycle_stage customer · code terisi ·
--   --          pipeline_stage TIDAK berubah dari nilai sebelum tes ·
--   --          became_customer_at terisi
--   SELECT action, entity_label, notes FROM public.audit_logs
--    WHERE entity_id = '<id inquiry uji>' ORDER BY created_at DESC LIMIT 1;
--   -- HARAPAN: MARK_INQUIRY_WON
--
--   Lalu refresh schema_snapshot.sql via pg_dump (aturan CLAUDE.md).
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (satu transaksi; body lama verbatim dari schema_snapshot.sql 3334e06)
-- ═════════════════════════════════════════════════════════════════════════════
--   ⚠️ Versi set_customer_on_won di bawah adalah versi DUAL-WRITE (masih menulis
--      NEW.account_status). Ia benar HANYA selama kolom account_status masih ada,
--      yaitu sebelum 20260908000002_accounts_lifecycle_drop_legacy dijalankan.
--      Sesudah kolom itu di-drop, JANGAN pasang ulang trigger ini sama sekali.
--
--   BEGIN;
--   -- 1. RPC versi 20260813 (schema_snapshot.sql:2991-3060)
--   CREATE OR REPLACE FUNCTION public.mark_inquiry_won(p_inquiry_id uuid) RETURNS void
--       LANGUAGE plpgsql SECURITY DEFINER
--       SET search_path TO 'public'
--       AS $$
--   DECLARE
--     v_status      text;
--     v_created_by  uuid;
--     v_prospect_id uuid;
--     v_customer_id uuid;
--     v_inquiry_no  text;
--     v_company_id  uuid;
--     v_account_id  uuid;
--     v_user_email  text;
--     v_user_role   text;
--   BEGIN
--     SELECT status, created_by, prospect_id, customer_id, inquiry_no, company_id
--       INTO v_status, v_created_by, v_prospect_id, v_customer_id, v_inquiry_no, v_company_id
--     FROM public.inquiries
--     WHERE id = p_inquiry_id
--       AND deleted_at IS NULL
--     FOR UPDATE;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Inquiry tidak ditemukan.';
--     END IF;
--
--     IF v_created_by IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
--       RAISE EXCEPTION 'Anda bukan pembuat inquiry ini — tidak bisa menandai WON.';
--     END IF;
--
--     IF v_status = 'WON' THEN
--       RAISE EXCEPTION 'Inquiry ini sudah WON.';
--     END IF;
--
--     UPDATE public.inquiries
--     SET status = 'WON', updated_at = now()
--     WHERE id = p_inquiry_id;
--
--     v_account_id := COALESCE(v_prospect_id, v_customer_id);
--     IF v_account_id IS NOT NULL THEN
--       UPDATE public.accounts
--       SET pipeline_stage = 'WON'
--       WHERE id = v_account_id
--         AND deleted_at IS NULL;
--     END IF;
--
--     SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();
--
--     SELECT r.code INTO v_user_role
--     FROM public.user_roles ur
--     JOIN public.roles r ON r.id = ur.role_id
--     WHERE ur.user_id = auth.uid()
--       AND ur.is_active = true
--       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
--     ORDER BY ur.granted_at DESC
--     LIMIT 1;
--
--     INSERT INTO public.audit_logs (
--       user_id, user_email, user_role, company_id,
--       action, entity_type, entity_id, entity_label,
--       old_data, new_data, notes
--     ) VALUES (
--       auth.uid(), v_user_email, v_user_role, v_company_id,
--       'MARK_INQUIRY_WON', 'INQUIRY', p_inquiry_id, v_inquiry_no,
--       jsonb_build_object('status', v_status),
--       jsonb_build_object('status', 'WON'),
--       'Ditandai WON manual dari Inquiry Detail'
--     );
--   END;
--   $$;
--
--   -- 2. Fungsi trigger versi dual-write (schema_snapshot.sql:3752-3764)
--   CREATE FUNCTION public.set_customer_on_won() RETURNS trigger
--       LANGUAGE plpgsql
--       AS $$
--   BEGIN
--     IF NEW.pipeline_stage = 'WON' AND COALESCE(NEW.lifecycle_stage,'') <> 'customer' THEN
--       NEW.account_status     := 'customer';
--       NEW.lifecycle_stage    := 'customer';
--       NEW.became_customer_at := COALESCE(NEW.became_customer_at, now());
--       NEW.converted_at       := COALESCE(NEW.converted_at, now());
--     END IF;
--     RETURN NEW;
--   END;
--   $$;
--
--   -- 3. Trigger (schema_snapshot.sql:13176)
--   CREATE TRIGGER trg_set_customer_on_won BEFORE INSERT OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.set_customer_on_won();
--   COMMIT;
