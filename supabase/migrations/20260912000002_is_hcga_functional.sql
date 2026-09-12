-- =============================================================================
-- Migration: 20260912000002_is_hcga_functional
-- Phase:     Pilot role per-posisi HCGA (Pekerjaan 4) — potongan 2 dari 2:
--            fungsi guard is_hcga_functional() + 9 ALTER POLICY yang mengganti
--            has_role('hrga') (role lama, 0 pemegang) dengan fungsi itu.
--            Potongan 1 (menu): 20260912000001_hcga_role_menu_defaults.
-- Depends:   - 4 role hcga_* (dibuat manual Den 11-12 Sep 2026, kedua DB; lihat
--              header 20260912000001). Level: hcga_manager 4 · tiga role staf 7.
--            - has_role() · is_super_admin() · is_admin_or_above() ·
--              is_manager_or_above() · get_user_company_id() (semua sudah ada).
--            - Ke-9 policy di bawah HARUS masih berbentuk seperti di bagian
--              INVENTARIS (dicek 12 Sep 2026: teks produksi = staging = snapshot).
-- Status:    LIVE di DUA DB — dieksekusi manual oleh Den 12 Sep 2026, urutan
--            STAGING (oovmlhilhqzejnawqkvt) dulu lalu PRODUKSI
--            (untmpqceexwxzuhlmyrg), V1-V6 lolos di keduanya, hasil identik:
--            is_hcga_functional() terpasang, 9 policy dialihkan, NOL sisa
--            has_role('hrga'), ACL benar (authenticated = true, anon = false).
--            Snapshot BELUM di-refresh — 1 fungsi + 9 policy menunggu pg_dump.
--            Independen dari 20260912000001 (dijalankan sesudahnya).
--
-- SIFAT: 1 CREATE OR REPLACE FUNCTION (baru; belum ada di kedua DB) + ACL +
--   COMMENT + 9 ALTER POLICY. Nol DDL tabel, nol data, nol GRANT tabel.
--   Setiap ALTER POLICY hanya mengganti has_role('hrga'::text) ->
--   is_hcga_functional(); sisa ekspresi VERBATIM dari pg_policies produksi.
--   Klausa roles (TO authenticated) dan cmd tak berubah (ALTER POLICY memang
--   tak bisa mengubah cmd). WITH CHECK #5/#6 yang tidak memuat 'hrga' ditulis
--   ulang VERBATIM supaya tidak bergantung pada semantik "klausa yang tak
--   disebut dipertahankan".
--
-- ── INVENTARIS (pg_policies PRODUKSI & STAGING, 12 Sep 2026 — identik) ─────
--   Catatan lama menyebut "8 policy" dan "hrga_offboarding_items (select+
--   update)". Yang benar: 9 policy di 6 tabel, dan hrga_offboarding_items_READ
--   TIDAK memuat has_role('hrga') — hanya _update.
--     #1 hrga_approval_configs_insert        INSERT  WITH CHECK
--     #2 hrga_approval_configs_update        UPDATE  USING + WITH CHECK
--     #3 hrga_offboarding_checklists_insert  INSERT  WITH CHECK
--     #4 hrga_offboarding_checklists_update  UPDATE  USING + WITH CHECK
--     #5 hrga_offboarding_items_update       UPDATE  USING  (juga it/finance — DIPERTAHANKAN)
--     #6 hrga_request_attachments_update     UPDATE  USING
--     #7 hrga_request_types_insert           INSERT  WITH CHECK
--     #8 hrga_request_types_update           UPDATE  USING + WITH CHECK
--     #9 hrga_requests_read_own              SELECT  USING  (juga is_manager_or_above/it/finance — DIPERTAHANKAN)
--   Sisir gotcha #26 (pg_proc.prosrc): NOL fungsi menyebut literal 'hrga' atau
--   'hcga'. hrga_submit_approval memakai has_role(v_cfg_role) — dinamis
--   mengikuti hrga_approval_configs.approver_role, jadi TIDAK perlu diubah;
--   ia otomatis mengikuti pemetaan approver_role (TASK 3, keputusan Den
--   terpisah, belum dibuatkan UPDATE-nya).
--   Terkait tapi SENGAJA TIDAK DISENTUH: CHECK hrga_offboarding_checklists_
--   role_check (responsible_role IN ('hrga','it','finance','supervisor')) —
--   bukan policy; 0 baris data; kalau checklist offboarding kelak mau
--   ditanggungjawabi hcga_*, constraint itu butuh ALTER sendiri.
--
-- ── DESAIN FUNGSI ──────────────────────────────────────────────────────────
--   - Bentuk persis is_manager_or_above() / is_sp_item_writer(): LANGUAGE sql
--     STABLE SECURITY DEFINER, SET search_path, REVOKE FROM PUBLIC + GRANT
--     EXECUTE TO authenticated.
--   - TANPA parameter company. is_manager_or_above() sendiri tidak memeriksa
--     company; cakupan entitas di ke-9 policy sudah datang dari klausa
--     company_id = get_user_company_id() yang TETAP verbatim. Varian
--     _in(p_company_id) (pola is_manager_or_above_in, gotcha #26) berarti
--     merombak struktur policy = pekerjaan sisir TD-180, bukan batch ini.
--     Kedua pemegang hari ini single-entitas (MSI) -> nol beda perilaku.
--   - Daftar kode EKSPLISIT, bukan LIKE 'hcga_%': role baru berawalan hcga_
--     harus ditambahkan sadar (alasan yang sama is_sp_item_writer menolak
--     'supervisor'). Legacy 'hrga' SENGAJA tidak dimasukkan — 0 pemegang
--     aktif sejak 11 Sep 2026; role-nya dibiarkan ada (keputusan Den 12 Sep).
--   - Berbasis KODE, bukan level -> tidak terpengaruh keputusan level.
--
-- ── KEPUTUSAN LEVEL (Den, 12 Sep 2026) & DAMPAKNYA KE #9 ───────────────────
--   Tiga role staf HCGA diturunkan 6 -> 7 (kedua DB): level<=6 = is_manager_
--   or_above() = 52 policy / 31 tabel + 10 RPC + 3 fungsi inline lintas modul
--   bisnis yang bukan domain HCGA (sp_orders/sp_invoices insert-update,
--   prospects_update, create_invoice, sp_issue_btb, generate_picking_from_sp,
--   prf_release, ...). Kasus yang sama dengan finance_controller=7
--   (20260911000004). Konsekuensi di file ini: di #9 hrga_requests_read_own,
--   hcga_ga/hcga_personel/hcga_peopledev kini LOLOS HANYA lewat
--   is_hcga_functional() (bukan lagi lewat is_manager_or_above()) — tes
--   runtime Araswati di produksi membuktikan fungsi ini bekerja.
--   hcga_manager (4) sudah lolos is_manager_or_above() sebelum file ini.
--
-- ── BLAST RADIUS (diukur 12 Sep 2026, produksi) ────────────────────────────
--   - Jalur tulis FE ke 5 tabel tulis (#1-#8): SATU — upsert hrga_approval_
--     configs dari Admin Settings > Approval Workflows > tab HRGA
--     (ApprovalWorkflowsPage.jsx:707). hrga_request_types, hrga_offboarding_
--     checklists, hrga_offboarding_items, hrga_request_attachments: NOL
--     pembaca/penulis FE, dan 0 baris data di produksi.
--   - #9 (SELECT) dipakai seluruh halaman HRGA. Data: 1 request (rejected),
--     0 pending, 1 baris approval — alur approve (RPC + hrga_request_
--     approvals_insert) TIDAK disentuh.
--   - Pemegang terdampak: Ayun (hcga_manager) & Araswati (hcga_personel).
--     hcga_ga / hcga_peopledev belum ada pemegang (sengaja).
--   - Dropdown approver di ApprovalWorkflowsPage (HRGA_ROLES, hardcode
--     hrga/manager/gm/ceo/finance/admin) belum kenal hcga_* — pemetaan
--     approver_role (TASK 3) lewat SQL, di luar file ini.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--   Kebalikan persis: 9 ALTER POLICY mengembalikan is_hcga_functional() ->
--   has_role('hrga'::text) (teks lama di bagian INVENTARIS / schema_snapshot
--   :17730-18006), lalu DROP FUNCTION public.is_hcga_functional(). Wajib
--   ALTER POLICY dulu — DROP FUNCTION akan ditolak selama masih dirujuk policy.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- V0 — jalankan SEBELUM blok eksekusi. DIHARAPKAN: 9 (policy ber-has_role('hrga'))
--      dan 0 (fungsi is_hcga_functional belum ada).
-- ═════════════════════════════════════════════════════════════════════════════
SELECT (SELECT count(*) FROM pg_policies
         WHERE qual ILIKE '%has_role(''hrga''%' OR with_check ILIKE '%has_role(''hrga''%') AS policy_hrga_sebelum,
       (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname = 'is_hcga_functional') AS fungsi_sebelum;


-- ═════════════════════════════════════════════════════════════════════════════
-- BLOK EKSEKUSI — tempel APA ADANYA, satu Run.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Fungsi guard ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_hcga_functional() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   user_roles ur
    JOIN   roles r ON r.id = ur.role_id
    WHERE  ur.user_id   = auth.uid()
      AND  ur.is_active = true
      AND  (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
      AND  r.code IN ('hcga_manager','hcga_ga','hcga_personel','hcga_peopledev')
  );
$$;

ALTER FUNCTION public.is_hcga_functional() OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.is_hcga_functional() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_hcga_functional() TO authenticated;

COMMENT ON FUNCTION public.is_hcga_functional() IS
  'True bila user memegang salah satu role fungsional HCGA aktif (hcga_manager/hcga_ga/hcga_personel/'
  'hcga_peopledev) di entitas mana pun — pengganti has_role(''hrga'') di 9 policy hrga_* (migrasi '
  '20260912000002). Cakupan entitas TETAP dari klausa company_id = get_user_company_id() di tiap policy '
  '(pola is_manager_or_above(), bukan varian _in). Daftar kode eksplisit, bukan LIKE ''hcga_%'' — role '
  'baru berawalan hcga_ harus ditambahkan sadar. Legacy ''hrga'' sengaja tidak dimasukkan (0 pemegang '
  'sejak 11 Sep 2026, role dibiarkan ada).';

-- ── #1-#2 hrga_approval_configs ─────────────────────────────────────────────
ALTER POLICY hrga_approval_configs_insert ON public.hrga_approval_configs
  WITH CHECK (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())));

ALTER POLICY hrga_approval_configs_update ON public.hrga_approval_configs
  USING      (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())))
  WITH CHECK (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())));

-- ── #3-#4 hrga_offboarding_checklists ───────────────────────────────────────
ALTER POLICY hrga_offboarding_checklists_insert ON public.hrga_offboarding_checklists
  WITH CHECK (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())));

ALTER POLICY hrga_offboarding_checklists_update ON public.hrga_offboarding_checklists
  USING      ((deleted_at IS NULL) AND (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional()))))
  WITH CHECK (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())));

-- ── #5 hrga_offboarding_items — has_role('it') / has_role('finance') DIPERTAHANKAN;
--    WITH CHECK tidak memuat 'hrga', ditulis ulang verbatim ────────────────────
ALTER POLICY hrga_offboarding_items_update ON public.hrga_offboarding_items
  USING (EXISTS (
    SELECT 1 FROM hrga_requests r
    WHERE (r.id = hrga_offboarding_items.request_id) AND (r.deleted_at IS NULL)
      AND (r.company_id = get_user_company_id())
      AND (is_super_admin() OR is_admin_or_above() OR is_hcga_functional() OR has_role('it'::text) OR has_role('finance'::text))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM hrga_requests r
    WHERE (r.id = hrga_offboarding_items.request_id) AND (r.company_id = get_user_company_id())));

-- ── #6 hrga_request_attachments — WITH CHECK ditulis ulang verbatim ──────────
ALTER POLICY hrga_request_attachments_update ON public.hrga_request_attachments
  USING ((deleted_at IS NULL)
    AND (EXISTS (SELECT 1 FROM hrga_requests r
                 WHERE (r.id = hrga_request_attachments.request_id) AND (r.company_id = get_user_company_id())))
    AND (is_super_admin() OR is_admin_or_above() OR is_hcga_functional() OR (uploaded_by = auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM hrga_requests r
    WHERE (r.id = hrga_request_attachments.request_id) AND (r.company_id = get_user_company_id())));

-- ── #7-#8 hrga_request_types ────────────────────────────────────────────────
ALTER POLICY hrga_request_types_insert ON public.hrga_request_types
  WITH CHECK (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())));

ALTER POLICY hrga_request_types_update ON public.hrga_request_types
  USING      (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())))
  WITH CHECK (is_super_admin() OR ((company_id = get_user_company_id()) AND (is_admin_or_above() OR is_hcga_functional())));

-- ── #9 hrga_requests (SELECT) — is_manager_or_above() / it / finance DIPERTAHANKAN ──
ALTER POLICY hrga_requests_read_own ON public.hrga_requests
  USING ((requester_id = auth.uid())
     OR ((company_id = get_user_company_id())
         AND (is_admin_or_above() OR is_manager_or_above() OR is_hcga_functional()
              OR has_role('it'::text) OR has_role('finance'::text)))
     OR is_super_admin());

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI LAPIS 1 (SQL) — jalankan TERPISAH sesudah COMMIT.
-- ═════════════════════════════════════════════════════════════════════════════

-- V1 — nol sisa has_role('hrga') di policy mana pun. DIHARAPKAN 0.
SELECT count(*) AS sisa_hrga
FROM   pg_policies
WHERE  qual ILIKE '%has_role(''hrga''%' OR with_check ILIKE '%has_role(''hrga''%';

-- V2 — persis 9 policy / 6 tabel memuat is_hcga_functional(). DIHARAPKAN 9 baris:
--   hrga_approval_configs (2) · hrga_offboarding_checklists (2) · hrga_offboarding_items (1)
--   hrga_request_attachments (1) · hrga_request_types (2) · hrga_requests (1)
SELECT tablename, policyname, cmd
FROM   pg_policies
WHERE  qual ILIKE '%is_hcga_functional()%' OR with_check ILIKE '%is_hcga_functional()%'
ORDER  BY tablename, policyname;

-- V3 — it/finance masih hidup di 2 policy. DIHARAPKAN: hrga_offboarding_items_update,
--      hrga_requests_read_own. Dan is_manager_or_above() masih di hrga_requests_read_own.
SELECT policyname,
       (qual ILIKE '%is_manager_or_above()%') AS masih_manager_or_above
FROM   pg_policies
WHERE  tablename LIKE 'hrga_%'
  AND  qual ILIKE '%has_role(''it''%' AND qual ILIKE '%has_role(''finance''%'
ORDER  BY policyname;

-- V4 — WITH CHECK #5/#6 identik dengan sebelum (bandingkan dengan
--      schema_snapshot.sql :17841-17843 / :17900-17901). DIHARAPKAN keduanya:
--      (EXISTS ( SELECT 1 FROM hrga_requests r WHERE ((r.id = <tabel>.request_id)
--       AND (r.company_id = get_user_company_id()))))
SELECT policyname, with_check
FROM   pg_policies
WHERE  policyname IN ('hrga_offboarding_items_update','hrga_request_attachments_update');

-- V5 — ACL fungsi. DIHARAPKAN: auth_ok = true, anon_harus_false = false.
SELECT has_function_privilege('authenticated', 'public.is_hcga_functional()', 'EXECUTE') AS auth_ok,
       has_function_privilege('anon',          'public.is_hcga_functional()', 'EXECUTE') AS anon_harus_false;

-- V6 — atribut fungsi. DIHARAPKAN: secdef = true, search_path terpasang, volatile = 's' (STABLE).
SELECT p.prosecdef AS secdef, p.proconfig AS search_path, p.provolatile AS volatile
FROM   pg_proc p
WHERE  p.pronamespace = 'public'::regnamespace AND p.proname = 'is_hcga_functional';


-- =============================================================================
-- VERIFIKASI LAPIS 2 (browser) — RLS hanya bisa dibuktikan dengan data, dan
-- staging TIDAK punya data HRGA (0 tipe / 0 config / 0 request). Di staging
-- cukup V1-V6 + halaman HRGA tidak error (daftar kosong = benar).
-- Di PRODUKSI, sesudah 20260912000001 juga live:
--   1. Araswati (hcga_personel, level 7): Semua Request menampilkan request
--      milik orang lain se-MSI (1 request, status rejected) — inilah bukti
--      #9 lewat is_hcga_functional(), karena di level 7 ia TIDAK lolos
--      is_manager_or_above(). Sebelum file ini: nol baris tanpa error.
--   2. Ayun (hcga_manager): Admin Settings > Approval Workflows > tab HRGA,
--      ubah satu approver pada satu kategori lalu Save -> toast "Approver ...
--      disimpan" (policy #1/#2 — satu-satunya jalur tulis FE). Kembalikan
--      nilainya sesudah tes. ⚠️ Dropdown belum memuat hcga_* — pilih nilai
--      lama yang tersedia untuk tes ini; pemetaan sebenarnya = TASK 3.
--   3. Approve/Reject TETAP belum bisa dilakukan Araswati sampai TASK 3
--      (approver_role masih 'hrga' di 57 baris) — itu by design, bukan
--      kegagalan file ini.
-- =============================================================================
