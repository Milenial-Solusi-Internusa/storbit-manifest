-- =============================================================================
-- 20261012000001_crm_lead_pool_schema.sql
--
-- Batch DS 3 Lead Management, irisan 7 Bagian 2 (Paket 2) -- file 1/4
-- (skema + helper izin). Desain gabungan disetujui Den (sesi sebelumnya,
-- tidak tersimpan di repo) + koreksi keputusan 1-3 irisan ini. LATAR
-- (audit penuaan 11 Okt 2026): mekanisme pool LAMA (is_in_lead_pool tanpa
-- pernah mengosongkan assigned_to, persetujuan tanpa RPC) diganti prinsip
-- baru -- pool artinya TANPA pemilik, tarik artinya KLAIM kepemilikan,
-- penuaan hanya menandai stale (tidak memindahkan ke pool).
--
-- Status: JALAN DI STAGING 12 Okt 2026. BELUM DI PRODUCTION.
-- Istilah: kepemilikan akun = accounts.assigned_to
-- (TIDAK ada kolom owner_id di accounts). inquiries.owner_id adalah hal
-- LAIN, tidak disentuh di sini.
--
-- -- accounts, 5 kolom baru -----------------------------------------------
-- lead_pool_last_owner -- pemilik TERAKHIR sebelum dilepas ke pool (beda
--   dari pull_approved_by/pull_requested_by yang sudah ada -- kolom itu
--   mencatat SIKLUS TARIKAN, ini mencatat SIKLUS PELEPASAN).
-- pull_requested_by -- SENGAJA BELUM ADA di skema lama walau
--   pull_approved_by/pull_approved_at sudah ada sejak lama (lihat
--   accounts_pull_approved_by_fkey) -- mekanisme lama tak pernah mencatat
--   SIAPA yang mengajukan, hanya siapa yang menyetujui.
-- pull_rejection_reason -- terpisah dari pull_justification (alasan
--   PENGAJUAN) supaya riwayat pengajuan tidak tertimpa alasan penolakan.
-- is_stale / stale_flagged_at -- pengganti mekanisme "penuaan otomatis
--   pindah ke pool" yang sudah dihentikan (cron aging-pipeline-harian
--   nonaktif, companies.aging_enabled MSI = false). Prinsip baru: penuaan
--   HANYA menandai, tidak memindahkan kepemilikan -- supervisor yang
--   memutuskan pelepasan lewat lead_pool_release(). Edge Function
--   aging-pipeline yang menuliskan kedua kolom ini adalah irisan 8+ (DI
--   LUAR cakupan file ini) -- kolomnya disiapkan lebih dulu supaya dua
--   trigger promosi (file 3) bisa mulai mengosongkannya begitu lead naik
--   tahap dengan sendirinya.
--
-- -- companies, 1 kolom baru -----------------------------------------------
-- aging_baseline_at -- jam MULAI penuaan dihitung, diisi manual saat
--   Paket 2 rilis per entitas (bukan oleh migrasi ini -- nilainya nol
--   historis untuk dikarang). SENGAJA BUKAN last_activity_at/
--   stage_changed_at -- dua kolom itu tetap berarti "kapan akun ini
--   terakhir disentuh", bukan "sejak kapan penuaan berlaku untuk entitas
--   ini".
--
-- -- Tabel baru: account_pool_history ---------------------------------------
-- Audit-only, pola account_lifecycle_history (schema_snapshot.sql) --
-- account_id ON DELETE CASCADE, profil TANPA ON DELETE. RLS: SELECT untuk
-- yang punya izin crm_lead_pool_approval di ENTITAS BARIS itu (lewat
-- has_menu_permission_in di bawah) atau pelaku sendiri; NOL policy
-- INSERT/UPDATE/DELETE untuk authenticated -- hanya empat RPC SECURITY
-- DEFINER di file 2 yang menulis. REVOKE ALL dari anon+authenticated lalu
-- GRANT SELECT ke authenticated (persis instruksi -- lebih ketat dari
-- account_lifecycle_history lama yang masih menyisakan REFERENCES/
-- TRIGGER/TRUNCATE/MAINTAIN ke anon dari default privileges, tak pernah
-- dicabut eksplisit).
--
-- -- has_menu_permission_in(p_company_id, p_menu_key, p_action) -------------
-- Belum ada presedennya di DB -- menu-permission hari ini resolusinya
-- FE-only (AuthContext.jsx hasMenuPermission, 3 tingkat). Fungsi ini
-- MENIRU PERSIS logika itu supaya hasilnya sama dengan yang dilihat UI,
-- BUKAN memperbaiki/memperketatnya:
--   1. super_admin -> true (bypass, sama seperti FE).
--   2. user_menu_permissions: dicocokkan HANYA pada menu_action_id --
--      TANPA memeriksa company_id/is_cross_entity walau kedua kolom itu
--      ADA di tabel. Ini SENGAJA meniru AuthContext.jsx: query userRes
--      mengambil SEMUA baris user_menu_permissions milik user (nol filter
--      company_id), dan matchesMenuAction() mencocokkan menu+aksi SAJA.
--      Kalau FE kelak diperketat per-entitas, fungsi ini WAJIB ikut
--      diubah -- kalau tidak, RPC bisa menolak aksi yang UI-nya masih
--      menampilkan tombolnya (atau sebaliknya).
--      Match menang MUTLAK (grant/deny), tidak jatuh ke tingkat 3.
--   3. role_menu_permissions: union peran AKTIF milik user DI
--      p_company_id (BUKAN entitas aktif sesi FE -- fungsi ini
--      diparameterkan supaya bisa memeriksa ENTITAS AKUN, yang belum
--      tentu sama dengan entitas yang sedang dipilih user di
--      CompanySwitcher). Syarat aktif: is_active=true DAN valid_until
--      IS NULL -- BUKAN "IS NULL OR >= CURRENT_DATE" seperti
--      is_manager_or_above()/is_manager_or_above_in(). Ini DIBERATKAN
--      DISENGAJA: fetchProfileById (AuthContext.jsx) memakai syarat yang
--      SAMA PERSIS (.is('valid_until', null)) -- fungsi ini sengaja ikut
--      FE di titik ini, bukan helper lain, supaya "role yang dilihat UI"
--      dan "role yang dipakai RPC" selalu baris yang sama.
--   4. Tak ada yang cocok -> false (default-deny, sama seperti FE).
--
-- -- lead_pool_approvers(p_company_id) ---------------------------------------
-- SETOF uuid -- daftar profil AKTIF yang berhak menyetujui tarikan di
-- entitas itu, dipakai untuk penerima notifikasi (RPC file 2) dan BISA
-- dipakai badge sidebar kelak (irisan 9+, DI LUAR file ini). Logika 3
-- tingkat yang SAMA dengan has_menu_permission_in, tapi dievaluasi untuk
-- SETIAP kandidat profil sekaligus (bukan hanya auth.uid()) -- karena itu
-- badannya query mandiri, bukan memanggil has_menu_permission_in per
-- baris (yang auth.uid()-sentris, hanya bisa menjawab untuk pemanggil).
-- =============================================================================

BEGIN;

ALTER TABLE public.accounts
  ADD COLUMN lead_pool_last_owner  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN pull_requested_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN pull_rejection_reason text,
  ADD COLUMN is_stale              boolean NOT NULL DEFAULT false,
  ADD COLUMN stale_flagged_at      timestamptz;

COMMENT ON COLUMN public.accounts.lead_pool_last_owner IS 'Pemilik TERAKHIR sebelum lead_pool_release() mengosongkan assigned_to. Beda dari pull_approved_by (siklus tarikan) -- ini siklus pelepasan.';
COMMENT ON COLUMN public.accounts.pull_requested_by IS 'Pengaju tarikan aktif (pull_status=''pending''/''rejected''). Dikosongkan lead_pool_approve_pull()/lead_pool_release(). Guard self-approval RPC membandingkan kolom ini dengan auth.uid().';
COMMENT ON COLUMN public.accounts.pull_rejection_reason IS 'Alasan PENOLAKAN tarikan terakhir -- terpisah dari pull_justification (alasan PENGAJUAN) supaya lead_pool_reject_pull() tidak menimpa alasan pengaju.';
COMMENT ON COLUMN public.accounts.is_stale IS 'Ditandai Edge Function aging-pipeline (irisan 8+, DI LUAR file ini) saat lead tak tersentuh melewati ambang sla_policies. TIDAK memindahkan kepemilikan -- cuma penanda + pengingat. Dikosongkan otomatis oleh trigger promosi (file 3) atau lead_pool_release()/lead_pool_approve_pull().';
COMMENT ON COLUMN public.accounts.stale_flagged_at IS 'Kapan is_stale diset true. NULL kalau is_stale false.';

ALTER TABLE public.companies
  ADD COLUMN aging_baseline_at timestamptz;

COMMENT ON COLUMN public.companies.aging_baseline_at IS 'Jam MULAI penuaan dihitung untuk entitas ini -- diisi manual saat Paket 2 rilis per entitas (migrasi ini SENGAJA tidak mengisinya, nol nilai historis untuk dikarang). BUKAN last_activity_at/stage_changed_at (dua kolom itu tetap berarti "kapan akun ini terakhir disentuh").';

-- =============================================================================
-- has_menu_permission_in -- lihat catatan logika di header berkas.
-- =============================================================================
CREATE FUNCTION public.has_menu_permission_in(
  p_company_id uuid,
  p_menu_key text,
  p_action text DEFAULT 'view'
) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_menu_action_id uuid;
  v_user_effect text;
BEGIN
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  SELECT ma.id INTO v_menu_action_id
  FROM public.menu_actions ma
  JOIN public.module_menus mm ON mm.id = ma.menu_id
  WHERE mm.key = p_menu_key AND ma.action = p_action;

  IF v_menu_action_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT ump.effect INTO v_user_effect
  FROM public.user_menu_permissions ump
  WHERE ump.user_id = auth.uid() AND ump.menu_action_id = v_menu_action_id
  LIMIT 1;

  IF v_user_effect IS NOT NULL THEN
    RETURN v_user_effect <> 'deny';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_menu_permissions rmp ON rmp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND ur.company_id = p_company_id
      AND ur.is_active = true
      AND ur.valid_until IS NULL
      AND rmp.menu_action_id = v_menu_action_id
  );
END $$;

COMMENT ON FUNCTION public.has_menu_permission_in(uuid, text, text) IS 'Resolusi izin menu di ENTITAS TERTENTU untuk auth.uid() -- meniru persis AuthContext.jsx hasMenuPermission() (3 tingkat: super_admin bypass -> user_menu_permissions menang mutlak, TANPA filter company_id/is_cross_entity -- lihat header berkas -> union role_menu_permissions peran aktif DI p_company_id, syarat aktif valid_until IS NULL persis fetchProfileById). Dipakai RPC Lead Pool (file 2) menggantikan cek level peran -- level 6 ke atas juga mencakup Finance yang tidak boleh ikut.';

REVOKE ALL ON FUNCTION public.has_menu_permission_in(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_menu_permission_in(uuid, text, text) TO authenticated;

-- =============================================================================
-- lead_pool_approvers -- lihat catatan logika di header berkas.
-- =============================================================================
CREATE FUNCTION public.lead_pool_approvers(p_company_id uuid) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH menu_action AS (
    SELECT ma.id
    FROM public.menu_actions ma
    JOIN public.module_menus mm ON mm.id = ma.menu_id
    WHERE mm.key = 'crm_lead_pool_approval' AND ma.action = 'view'
  ),
  role_grant AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN public.role_menu_permissions rmp ON rmp.role_id = ur.role_id
    JOIN menu_action ma ON rmp.menu_action_id = ma.id
    WHERE ur.company_id = p_company_id
      AND ur.is_active = true
      AND ur.valid_until IS NULL
  ),
  user_override AS (
    SELECT ump.user_id, ump.effect
    FROM public.user_menu_permissions ump
    JOIN menu_action ma ON ump.menu_action_id = ma.id
  )
  SELECT p.id
  FROM public.profiles p
  WHERE p.active = true
    AND (
      (p.id IN (SELECT user_id FROM role_grant)
       AND NOT EXISTS (SELECT 1 FROM user_override uo WHERE uo.user_id = p.id AND uo.effect = 'deny'))
      OR p.id IN (SELECT user_id FROM user_override WHERE effect = 'grant')
    );
$$;

COMMENT ON FUNCTION public.lead_pool_approvers(uuid) IS 'Profil AKTIF yang berhak menyetujui tarikan Lead Pool di entitas ini -- logika 3 tingkat yang SAMA dengan has_menu_permission_in, dievaluasi per kandidat (bukan auth.uid()-sentris). Dipakai notifikasi RPC request_pull (file 2); badge sidebar jumlah tarikan pending (irisan 9+) juga bisa memakai fungsi yang sama -- DI LUAR cakupan file ini.';

REVOKE ALL ON FUNCTION public.lead_pool_approvers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_pool_approvers(uuid) TO authenticated;

-- =============================================================================
-- account_pool_history
-- =============================================================================
CREATE TABLE public.account_pool_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  event_type text NOT NULL CHECK (event_type IN ('enter_pool', 'release', 'request_pull', 'approve_pull', 'reject_pull', 'owner_cleared')),
  actor_id uuid REFERENCES public.profiles(id),
  previous_owner uuid REFERENCES public.profiles(id),
  new_owner uuid REFERENCES public.profiles(id),
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_pool_history IS 'Riwayat Lead Pool (enter_pool/release/request_pull/approve_pull/reject_pull/owner_cleared) -- audit-only, pola account_lifecycle_history. owner_cleared = akun yang pemiliknya dikosongkan oleh lead_pool_sweep_deactivated_owner TANPA masuk pool (lifecycle di luar lead/mql, atau punya inquiry/quotation terbuka). Ditulis EKSKLUSIF oleh empat RPC SECURITY DEFINER (file 2) + lead_pool_sweep_deactivated_owner (file 2, service_role) -- nol policy tulis untuk authenticated.';

ALTER TABLE public.account_pool_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_pool_history_select ON public.account_pool_history
  FOR SELECT TO authenticated
  USING (
    public.has_menu_permission_in(company_id, 'crm_lead_pool_approval', 'view')
    OR actor_id = auth.uid()
  );

-- Sengaja NOL policy INSERT/UPDATE/DELETE untuk authenticated -- satu-
-- satunya jalur tulis adalah RPC SECURITY DEFINER di file 2, mengunci
-- "riwayat hanya lewat RPC" di level hak akses, bukan cuma konvensi FE.

REVOKE ALL ON public.account_pool_history FROM authenticated, anon;
GRANT SELECT ON public.account_pool_history TO authenticated;

COMMIT;

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'accounts'
--    AND column_name IN ('lead_pool_last_owner','pull_requested_by',
--                         'pull_rejection_reason','is_stale','stale_flagged_at')
--  ORDER BY column_name;
-- -- Harap: 5 baris; is_stale is_nullable='NO' default 'false', sisanya
-- --        is_nullable='YES'.
--
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='companies' AND column_name='aging_baseline_at';
-- -- Harap: 1 baris.
--
-- SELECT to_regclass('public.account_pool_history');
-- -- Harap: bukan NULL.
--
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.account_pool_history'::regclass AND contype = 'c';
-- -- Harap: CHECK event_type memuat 6 nilai termasuk 'owner_cleared'
-- --        (ditambahkan koreksi 12 Okt 2026 untuk lead_pool_sweep_deactivated_owner).
--
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.account_pool_history'::regclass;
-- -- Harap: 1 baris (r = SELECT) -- nol insert/update/delete.
--
-- SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
--   FROM information_schema.role_table_grants
--  WHERE table_schema='public' AND table_name='account_pool_history'
--    AND grantee IN ('authenticated','anon')
--  GROUP BY grantee;
-- -- Harap: authenticated = SELECT ; anon = tidak muncul sama sekali.
--
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('has_menu_permission_in','lead_pool_approvers');
-- -- Harap: 2 baris, masing-masing proacl memuat authenticated=X, TANPA
-- --        baris kosong '=X' (PUBLIC). Gotcha #40 (03_DATA_MODEL.md):
-- --        periksa lewat aclexplode()+grantee=0 kalau mau presisi penuh,
-- --        bukan LIKE '%=X/%' (kena 'postgres=X/postgres', selalu true).
--
-- -- Sanity cepat has_menu_permission_in -- jalankan sebagai user super_admin
-- -- (SQL Editor lewat service_role tidak punya auth.uid(), hasilnya selalu
-- -- false untuk tingkat 2/3 -- hanya tingkat 1 super_admin yang bisa diuji
-- -- murni dari SQL Editor; sisanya diuji lewat RPC panggilan FE/Postman
-- -- dengan token user sungguhan):
-- SELECT public.has_menu_permission_in(
--   '0e1840d8-e6fb-4190-bd09-88338e68b492'::uuid, 'crm_lead_pool_approval', 'view');
-- =============================================================================

-- =============================================================================
-- ROLLBACK (kalau perlu dibatalkan sebelum ada baris account_pool_history):
--   DROP TABLE public.account_pool_history;
--   DROP FUNCTION public.lead_pool_approvers(uuid);
--   DROP FUNCTION public.has_menu_permission_in(uuid, text, text);
--   ALTER TABLE public.companies DROP COLUMN aging_baseline_at;
--   ALTER TABLE public.accounts
--     DROP COLUMN lead_pool_last_owner, DROP COLUMN pull_requested_by,
--     DROP COLUMN pull_rejection_reason, DROP COLUMN is_stale,
--     DROP COLUMN stale_flagged_at;
-- =============================================================================
