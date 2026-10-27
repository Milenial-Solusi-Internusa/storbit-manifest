-- =============================================================================
-- Migration: 20261028000001_crm_reassign_inquiry_owner_v3
-- Inquiry Management Putaran 11, Tahap A -- modal Assign/Reassign Owner
-- bersama (checkbox "Notify new owner").
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP FUNCTION -- WAJIB DIJALANKAN MAS LANGSUNG DI
-- SQL EDITOR, BUKAN lewat connector Vir (connector menolak/membatalkan
-- statement DROP sebagai pengaman -- pola sama 20261026000001/
-- 20261027000003/20261027000004/20261027000008).
-- URUTAN: WAJIB jalan SESUDAH 20261027000001/000002/000003 (kolom
-- assigned_*, tabel inquiry_owner_history, RPC v2 3-argumen) -- dikonfirmasi
-- Den (prompt 40, jawaban 4): 20261027000003 SUDAH LIVE DI STAGING dengan
-- tanda tangan (uuid, uuid, text), PRODUKSI BELUM. Migrasi ini DROP
-- signature itu dan menggantinya di KEDUA environment dengan signature
-- 4-argumen yang sama (gotcha #37 -- tambah parameter = fungsi BARU,
-- signature lama WAJIB di-DROP eksplisit, bukan CREATE OR REPLACE).
--
-- PERUBAHAN:
--   DROP FUNCTION reassign_inquiry_owner(uuid, uuid, text)
--   CREATE FUNCTION reassign_inquiry_owner(uuid, uuid, text DEFAULT NULL, boolean DEFAULT true)
--
-- PERUBAHAN PERILAKU vs 20261027000003 -- SATU-SATUNYA perubahan, instruksi
-- eksplisit Den (prompt 38 §7/prompt 40 Tahap A.1): "badan IDENTIK dengan
-- 20261027000003 kecuali blok INSERT notifications yang digerbang p_notify":
--   - Parameter BARU p_notify boolean DEFAULT true -- pemanggil EXISTING
--     (DealDetailPage.jsx reassignOwner yang memanggil dengan 2 argumen,
--     InquiryOwnerAssignmentPage.jsx handleAssign yang juga 2 argumen)
--     TIDAK PERLU diubah SEGERA -- Postgres otomatis memakai default
--     p_reason=NULL dan p_notify=true kalau argumen-argumen ini tidak
--     dikirim. Tahap B sesi ini MENGUBAH kedua pemanggil itu ke modal baru
--     (OwnerAssignModal.jsx) yang mengirim keduanya eksplisit.
--   - Blok notifikasi (g) di bawah digerbang `p_notify AND ...` -- kalau
--     p_notify=false, NOL baris notifications ditulis. Pengecualian
--     self-assign ("Assigning to yourself sends nothing", rule 111
--     nexus-notes.js) TETAP berlaku DI DALAM gerbang itu -- p_notify=true
--     TIDAK memaksa notifikasi terkirim ke diri sendiri.
--   - Gate (manager-ke-atas di entitas/super admin), validasi roster
--     (OPERATIONAL_ROSTER_ROLES literal), no-op check (owner baru = owner
--     lama -> return, NOL audit/riwayat/notifikasi), status terminal
--     (WON/LOST/CANCELLED ditolak), UPDATE inquiries (assigned_by/
--     assigned_at/assign_reason), INSERT inquiry_owner_history, INSERT
--     audit_logs, pesan error: BYTE-IDENTIK dengan 20261027000003 -- HANYA
--     penambahan parameter + gerbang notifikasi, TIDAK ada perubahan logic
--     lain (minimalkan blast radius review, instruksi eksplisit Den).
--   - Reason wajib/opsional (Keputusan Den, prompt 40 jawaban 5): DITEGAKKAN
--     DI LAYAR SAJA (OwnerAssignModal.jsx, Tahap B) -- badan fungsi ini
--     TIDAK menambah pemeriksaan apa pun atas p_reason (tetap boleh NULL
--     kapan pun, sama seperti 20261027000003). RPC tidak tahu/tidak perlu
--     tahu mode Assign vs Reassign.
--   - Kotak "Also moves: N quotation/rate request" di mockup TIDAK dibangun
--     (Tahap B) -- diperiksa (prompt 40, syarat teks mockup): RLS
--     quotations_read/quotations_update dan prf_select/prf_update_* memakai
--     created_by = auth.uid(), BUKAN join ke inquiries.owner_id
--     (schema_snapshot.sql:20046/:20053/:19804/:19811/:19818; migrasi
--     terakhir yang menyentuhnya, 20260909000002, tidak mengubah ini).
--     Kepemilikan quotation/PRF TIDAK ikut inquiry.owner_id -- badan fungsi
--     ini TIDAK menyentuh quotations/prf, konsisten dengan itu, TIDAK
--     ditambahkan apa pun untuk menutup kotak itu.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.reassign_inquiry_owner(uuid, uuid, text);

CREATE FUNCTION public.reassign_inquiry_owner(p_inquiry_id uuid, p_new_owner_id uuid, p_reason text DEFAULT NULL, p_notify boolean DEFAULT true)
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
  -- utk provenance+risiko drift -- daftar literal TIDAK diubah Putaran 11).
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

  -- (e) UPDATE -- owner lama boleh NULL (tab Unassigned). assigned_by/
  -- assigned_at/assign_reason diisi SATU momen dgn owner_id.
  UPDATE public.inquiries
     SET owner_id      = p_new_owner_id,
         assigned_by   = auth.uid(),
         assigned_at   = v_now,
         assign_reason = p_reason,
         updated_at    = v_now
   WHERE id = p_inquiry_id;

  -- (e2) Riwayat lengkap ke inquiry_owner_history (20261027000002) --
  -- momen SAMA dgn UPDATE di atas (v_now).
  INSERT INTO public.inquiry_owner_history (inquiry_id, from_owner_id, to_owner_id, reason, changed_by, changed_at)
  VALUES (p_inquiry_id, v_old_owner_id, p_new_owner_id, p_reason, auth.uid(), v_now);

  -- (f) Audit -- kolom & aktor PERSIS pola close_inquiry_as_duplicate
  -- (20261022000002:181-191); new_data memuat assign_reason.
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
  -- sends nothing.") -- TIDAK berubah dari versi 20261027000003.
  -- BARU Putaran 11: seluruh blok ini digerbang p_notify -- checkbox
  -- "Notify new owner" (OwnerAssignModal.jsx, Tahap B) mengirim parameter
  -- ini. p_notify=false TIDAK menulis apa pun ke notifications; p_notify
  -- TIDAK mengubah pengecualian self-assign di atas -- kedua syarat
  -- digabung AND, bukan saling menggantikan. NOL EXCEPTION WHEN OTHERS --
  -- error naik apa adanya (instruksi eksplisit, identik versi lama).
  IF p_notify AND p_new_owner_id IS NOT NULL AND p_new_owner_id <> auth.uid() THEN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_company_id, p_new_owner_id, 'inquiry_reassigned',
            'Inquiry assigned to you',
            v_inquiry_no || ' was assigned to you by ' || COALESCE(v_user_full_name, v_user_email) || '.',
            'inquiry', p_inquiry_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text, boolean) TO postgres;

COMMENT ON FUNCTION public.reassign_inquiry_owner(uuid, uuid, text, boolean) IS
  'v3 (Putaran 11, Tahap A) -- isi/ganti owner_id + assigned_by/assigned_at/assign_reason + log ke inquiry_owner_history. Gate/validasi/no-op/audit identik versi 20261027000003 (3-argumen, DROP oleh migrasi ini). p_notify (default true) menggerbang blok INSERT notifications ke owner baru -- checkbox "Notify new owner" di OwnerAssignModal.jsx. p_notify TIDAK mengubah pengecualian self-assign ("Assigning to yourself sends nothing"). Reason wajib/opsional ditegakkan di layar, bukan di sini.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Signature baru ada, signature 3-argumen lama sudah hilang:
-- SELECT p.proname, p.prosecdef, oidvectortypes(p.proargtypes)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='reassign_inquiry_owner';
--  -- HARAP: SATU baris, oidvectortypes = 'uuid, uuid, text, boolean', prosecdef=true.
--
-- 2) ACL hanya authenticated (+postgres sebagai owner fungsi):
-- SELECT proacl FROM pg_proc WHERE proname='reassign_inquiry_owner';
--  -- HARAP: grantee hanya authenticated/postgres, nol baris '=X/postgres' (PUBLIC)
--  -- atau 'anon=X/postgres'.
--
-- 3) Uji end-to-end lengkap: scripts/qa/sql/verify-inquiry-putaran-11.sql
--    (Vir, staging, setelah migrasi ini live).
-- =============================================================================

-- =============================================================================
-- ROLLBACK (sebelum ada pemanggil baru yang bergantung pada p_notify):
--   BEGIN;
--   DROP FUNCTION public.reassign_inquiry_owner(uuid, uuid, text, boolean);
--   -- lalu jalankan ulang badan CREATE FUNCTION 20261027000003 (3-argumen)
--   -- kalau perlu balik ke versi v2.
--   COMMIT;
-- =============================================================================
