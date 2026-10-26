-- =============================================================================
-- Migration: 20261027000003_crm_reassign_inquiry_owner_v2
-- Inquiry Management Putaran 8 -- Owner Assignment, L-13
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP FUNCTION -- WAJIB DIJALANKAN MAS LANGSUNG DI
-- SQL EDITOR, BUKAN lewat connector Vir (connector menolak/membatalkan
-- statement DROP sebagai pengaman -- pola sama 20261026000001/
-- 20261026000004).
-- URUTAN: migrasi KETIGA dari blok Putaran 8. WAJIB jalan SESUDAH
-- 20261027000001 (kolom assigned_by/assigned_at/assign_reason) DAN
-- 20261027000002 (tabel inquiry_owner_history) -- kalau tidak, UPDATE/
-- INSERT di badan fungsi ini akan gagal "column/relation does not exist".
-- Boleh jalan SEBELUM ATAU SESUDAH 20261027000004 (urutan antara 003/004
-- tidak relevan satu sama lain -- RPC SECURITY DEFINER selalu lolos
-- trigger apa pun urutannya).
--
-- FAKTA DB (dikonfirmasi Vir, query baca-saja, 26 Okt 2026): versi
-- 2-argumen (20261024000004) SUDAH LIVE DI STAGING, BELUM di production.
-- Migrasi ini meng-DROP versi staging itu dan menggantinya di KEDUA
-- environment dengan signature 3-argumen yang sama.
--
-- PERUBAHAN -- gotcha #37 (tambah parameter = fungsi BARU, signature lama
-- WAJIB di-DROP eksplisit, bukan CREATE OR REPLACE):
--   DROP FUNCTION reassign_inquiry_owner(uuid, uuid)
--   CREATE FUNCTION reassign_inquiry_owner(uuid, uuid, text DEFAULT NULL)
--
-- PERUBAHAN PERILAKU vs versi 20261024000004:
--   - Parameter BARU p_reason text DEFAULT NULL -- pemanggil EXISTING
--     (InquiryOwnerAssignmentPage.jsx handleAssign, DealDetailPage.jsx
--     reassignOwner) TIDAK PERLU diubah -- Postgres otomatis memakai
--     default NULL kalau argumen ini tidak dikirim. (DealDetailPage.jsx
--     SENGAJA TIDAK disentuh Putaran 8 -- instruksi eksplisit.)
--   - Mengisi inquiries.assigned_by/assigned_at/assign_reason (kolom baru,
--     20261027000001) setiap kali dipanggil -- termasuk assignment
--     PERTAMA (tab Unassigned, owner lama NULL) maupun reassignment
--     (Detail Inquiry, owner lama ada).
--   - INSERT satu baris ke inquiry_owner_history (tabel baru,
--     20261027000002) -- from_owner_id/to_owner_id/reason/changed_by/
--     changed_at = SAMA PERSIS momen dgn UPDATE inquiries (satu v_now).
--   - audit_logs.new_data kini turut memuat assign_reason (sebelumnya
--     hanya owner_id) -- notes tidak berubah bentuk.
--   - p_notify TIDAK ditambahkan -- belum ada toggle UI (checkbox "Notify
--     new owner" = modal Putaran 11, rule 111 nexus-notes.js). Perilaku
--     notifikasi TETAP SAMA (selalu notify owner baru kecuali self-assign)
--     -- menambah p_notify jadi pekerjaan Putaran 11 sendiri (DROP+CREATE
--     lagi, konsisten pola gotcha #37 ini).
--   - Gate (manager-ke-atas di entitas/super admin), validasi roster
--     (OPERATIONAL_ROSTER_ROLES literal), no-op check (owner baru = owner
--     lama -> return), status terminal (WON/LOST/CANCELLED ditolak),
--     pesan error: BYTE-IDENTIK dgn versi 20261024000004 -- HANYA
--     penambahan reason-handling + 2 write baru, TIDAK ada perubahan
--     logic lain (minimalkan blast radius review).
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.reassign_inquiry_owner(uuid, uuid);

CREATE FUNCTION public.reassign_inquiry_owner(p_inquiry_id uuid, p_new_owner_id uuid, p_reason text DEFAULT NULL)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_company_id     uuid;
  v_status         text;
  v_inquiry_no     text;
  v_old_owner_id   uuid;
  v_old_owner_name text;
  v_new_owner_name text;
  v_user_email     text;
  v_user_full_name text;
  v_user_role      text;
  v_now            timestamptz := now();
BEGIN
  -- (b) Inquiry harus ada, tidak soft-deleted.
  SELECT company_id, status, inquiry_no, owner_id
    INTO v_company_id, v_status, v_inquiry_no, v_old_owner_id
    FROM public.inquiries
   WHERE id = p_inquiry_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  -- (a) Gerbang: manager-ke-atas DI ENTITAS inquiry ini, atau super admin.
  IF NOT (public.is_super_admin() OR public.is_manager_or_above_in(v_company_id)) THEN
    RAISE EXCEPTION 'Hanya Manager ke atas di entitas inquiry ini, atau Super Admin, yang boleh mengubah owner.';
  END IF;

  -- (b) Status bukan terminal. trg_z_lock_inquiry_owner tetap lapis kedua.
  IF v_status IN ('WON', 'LOST', 'CANCELLED') THEN
    RAISE EXCEPTION 'Inquiry berstatus % tidak bisa diubah owner-nya.', v_status;
  END IF;

  -- (d) No-op: owner baru == owner sekarang -> return, nol audit/riwayat/notifikasi.
  IF p_new_owner_id IS NOT NULL AND p_new_owner_id = v_old_owner_id THEN
    RETURN;
  END IF;
  IF p_new_owner_id IS NULL AND v_old_owner_id IS NULL THEN
    RETURN;
  END IF;

  -- (c) Owner baru harus profil aktif + role aktif di company inquiry ini,
  -- termasuk himpunan OPERATIONAL_ROSTER_ROLES (lihat header 20261024000004
  -- utk provenance+risiko drift -- daftar literal TIDAK diubah Putaran 8).
  IF p_new_owner_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r    ON r.id = ur.role_id AND r.deleted_at IS NULL
        JOIN public.profiles pa ON pa.id = ur.user_id AND pa.active = true
       WHERE ur.user_id    = p_new_owner_id
         AND ur.company_id = v_company_id
         AND ur.is_active  = true
         AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
         AND r.code IN ('bd_sales_executive', 'bd_account_executive',
                         'bd_sales_spv_console', 'bd_sales_spv_forwarding', 'gm_bd')
    ) THEN
      RAISE EXCEPTION 'Owner baru harus salah satu kandidat sales/BD aktif di entitas inquiry ini.';
    END IF;
  END IF;

  SELECT full_name INTO v_old_owner_name FROM public.profiles WHERE id = v_old_owner_id;
  SELECT full_name INTO v_new_owner_name FROM public.profiles WHERE id = p_new_owner_id;

  -- (e) UPDATE -- owner lama boleh NULL (tab Unassigned). BARU Putaran 8:
  -- assigned_by/assigned_at/assign_reason diisi SATU momen dgn owner_id.
  UPDATE public.inquiries
     SET owner_id      = p_new_owner_id,
         assigned_by   = auth.uid(),
         assigned_at   = v_now,
         assign_reason = p_reason,
         updated_at    = v_now
   WHERE id = p_inquiry_id;

  -- (e2) BARU Putaran 8: riwayat lengkap ke inquiry_owner_history
  -- (20261027000002) -- momen SAMA dgn UPDATE di atas (v_now).
  INSERT INTO public.inquiry_owner_history (inquiry_id, from_owner_id, to_owner_id, reason, changed_by, changed_at)
  VALUES (p_inquiry_id, v_old_owner_id, p_new_owner_id, p_reason, auth.uid(), v_now);

  -- (f) Audit -- kolom & aktor PERSIS pola close_inquiry_as_duplicate
  -- (20261022000002:181-191); new_data kini + assign_reason (Putaran 8).
  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'REASSIGN_INQUIRY_OWNER', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('owner_id', v_old_owner_id),
          jsonb_build_object('owner_id', p_new_owner_id, 'assign_reason', p_reason),
          'Owner: ' || COALESCE(v_old_owner_name, 'Unassigned') || ' -> ' || COALESCE(v_new_owner_name, 'Unassigned'));

  -- (g) Notifikasi -- SATU, ke owner BARU saja, KECUALI owner baru adalah
  -- pemanggil sendiri (rule 111 nexus-notes.js: "Assigning to yourself
  -- sends nothing."). TIDAK berubah dari versi 20261024000004 -- belum ada
  -- toggle UI, p_notify ditunda ke Putaran 11. NOL EXCEPTION WHEN OTHERS --
  -- error naik apa adanya (instruksi eksplisit, identik versi lama).
  IF p_new_owner_id IS NOT NULL AND p_new_owner_id <> auth.uid() THEN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_company_id, p_new_owner_id, 'inquiry_reassigned',
            'Inquiry assigned to you',
            v_inquiry_no || ' was assigned to you by ' || COALESCE(v_user_full_name, v_user_email) || '.',
            'inquiry', p_inquiry_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text) IS
  'v2 (Putaran 8, L-13) -- isi/ganti owner_id + assigned_by/assigned_at/assign_reason + log ke inquiry_owner_history. Gate/validasi/no-op/notifikasi identik versi 20261024000004 (2-argumen, DROP oleh migrasi ini). p_reason opsional, NULL kalau pemanggil belum mengirimnya (UI penangkap alasan = modal Putaran 11).';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Signature baru ada, signature lama sudah hilang:
-- SELECT p.proname, p.prosecdef, oidvectortypes(p.proargtypes)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='reassign_inquiry_owner';
--  -- HARAP: SATU baris, oidvectortypes = 'uuid, uuid, text', prosecdef=true.
--
-- 2) ACL hanya authenticated:
-- SELECT proacl FROM pg_proc WHERE proname='reassign_inquiry_owner';
--  -- HARAP: grantee hanya authenticated, nol baris '=X/postgres' (PUBLIC)
--  -- atau 'anon=X/postgres'.
--
-- 3) Uji end-to-end (di staging, setelah 001/002 juga live) -- panggil RPC
--    dgn p_reason terisi pada satu inquiry OPEN tanpa owner, lalu:
-- SELECT owner_id, assigned_by, assigned_at, assign_reason
--   FROM public.inquiries WHERE id = '<id_inquiry_uji>';
-- SELECT * FROM public.inquiry_owner_history WHERE inquiry_id = '<id_inquiry_uji>'
--   ORDER BY changed_at DESC LIMIT 1;
--  -- HARAP: kolom inquiries terisi, SATU baris baru di inquiry_owner_history,
--  -- changed_at = assigned_at (sama persis, satu v_now).
-- =============================================================================

-- =============================================================================
-- ROLLBACK (sebelum ada pemanggil baru yang bergantung pada p_reason):
--   BEGIN;
--   DROP FUNCTION public.reassign_inquiry_owner(uuid, uuid, text);
--   -- lalu jalankan ulang badan CREATE FUNCTION 20261024000004 (2-argumen)
--   -- kalau perlu balik ke versi lama.
--   COMMIT;
-- =============================================================================
