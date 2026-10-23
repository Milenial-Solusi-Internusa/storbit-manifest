-- =============================================================================
-- Migration: 20261024000004_crm_reassign_inquiry_owner
-- Inquiry Management Putaran 3 -- Tahap 3B, Lingkup C/F
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging.
-- Dependensi: inquiries.owner_id (sudah ada) · is_manager_or_above_in(uuid)
-- LIVE (20261001000001_td301_lapis_b_inactive_user_db_guard.sql, join
-- profiles.active=true) · trg_z_lock_inquiry_owner (BEFORE UPDATE OF
-- owner_id, badan lock_inquiry_owner_when_closed()) tetap lapis kedua yang
-- TIDAK disentuh migrasi ini -- RPC ini menolak status terminal SENDIRI
-- (pesan jelas), trigger itu cadangan kalau jalur lain mencoba UPDATE
-- owner_id langsung pada inquiry yang sudah terminal.
--
-- RINGKASAN
-- RPC tunggal untuk mengisi/mengganti owner inquiry, dipakai DUA permukaan:
-- (1) tab "Unassigned" halaman Inquiry Owner Assignment (1.2.3, inquiry
-- owner_id IS NULL -> diisi pertama kali) dan (2) panel "Reassign Owner"
-- Detail Inquiry (DealDetailPage.jsx, inquiry SUDAH berowner -> diganti).
-- Satu fungsi, dua pemanggil -- bukan dua RPC dengan logika yang bisa
-- melenceng. Menggantikan UPDATE langsung ke inquiries yang sebelumnya
-- dipakai DealDetailPage.jsx (gagal senyap RLS tak pernah dicek eksplisit,
-- nol audit untuk sisi gudang tab Unassigned).
--
-- KANDIDAT OWNER -- replika server-side dari fetchOperationalRoster()
-- (src/modules/crm/salesRoster.js:35-50), SATU-SATUNYA sumber "siapa boleh
-- di-assign" yang sudah dipakai FE (salesOpts DealDetailPage.jsx:554+1076,
-- dan dipakai sama di Unassigned/InquiryOwnerAssignmentPage.jsx). Himpunan
-- role: OPERATIONAL_ROSTER_ROLES = [...BD_SALES_ROLES, 'gm_bd'] (src/lib/
-- roles.js:58-61 + salesRoster.js:29) = 'bd_sales_executive',
-- 'bd_account_executive', 'bd_sales_spv_console', 'bd_sales_spv_forwarding',
-- 'gm_bd' -- DITRANSKRIPSI LITERAL ke SQL di bawah (bukan tebakan): empat
-- yang pertama JUGA persis daftar hardcode di dalam badan DB function LIVE
-- is_sales_functional() (20261001000001:444-452) + 'gm_bd' ditambahkan
-- sesuai salesRoster.js -- tiga sumber (2 array JS + 1 fungsi DB) konvergen
-- ke himpunan yang sama, bukan satu sumber yang ditebak. ⚠️ RISIKO DRIFT
-- YANG DITERIMA: kalau OPERATIONAL_ROSTER_ROLES di salesRoster.js berubah
-- di masa depan (role ditambah/dicabut), daftar literal di RPC ini TIDAK
-- otomatis ikut -- harus disunting manual bersamaan. Dicatat di sini
-- sebagai utang yang disadari, bukan ditebak sembunyi-sembunyi.
--
-- fetchOperationalRoster juga mensyaratkan roles.deleted_at IS NULL
-- (langkah 1 query-nya) -- disalin di bawah.
--
-- Pelajaran bug cast request_new_location (20261023000004): literal NULL
-- polos di konteks ambigu disimpulkan tipe SALAH dan bisa ditelan blok
-- EXCEPTION WHEN OTHERS di sekitarnya -- nol notifikasi terkirim tanpa
-- error terlihat. Fungsi ini SENGAJA TIDAK memakai EXCEPTION WHEN OTHERS
-- di jalur mana pun (instruksi eksplisit) -- error naik apa adanya; dan
-- NOL literal NULL polos dikirim ke kolom bertipe (reference_id selalu
-- p_inquiry_id, bukan NULL; v_old_owner_id/v_old_owner_name dibaca lewat
-- variabel DECLARE yang sudah bertipe, bukan literal NULL langsung).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.reassign_inquiry_owner(p_inquiry_id uuid, p_new_owner_id uuid)
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

  -- (d) No-op: owner baru == owner sekarang -> return, nol audit, nol notifikasi.
  IF p_new_owner_id IS NOT NULL AND p_new_owner_id = v_old_owner_id THEN
    RETURN;
  END IF;
  IF p_new_owner_id IS NULL AND v_old_owner_id IS NULL THEN
    RETURN;
  END IF;

  -- (c) Owner baru harus profil aktif + role aktif di company inquiry ini,
  -- termasuk himpunan OPERATIONAL_ROSTER_ROLES (lihat header migrasi).
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

  -- (e) UPDATE -- owner lama boleh NULL (tab Unassigned).
  UPDATE public.inquiries
     SET owner_id   = p_new_owner_id,
         updated_at = now()
   WHERE id = p_inquiry_id;

  -- (f) Audit -- kolom & aktor PERSIS pola close_inquiry_as_duplicate
  -- (20261022000002:181-191): user_id/email/role dari sesi SAAT INI,
  -- role = baris user_roles TERBARU (granted_at desc), bukan role yang
  -- lolos gerbang (a) secara spesifik -- pola yang sama persis.
  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'REASSIGN_INQUIRY_OWNER', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('owner_id', v_old_owner_id),
          jsonb_build_object('owner_id', p_new_owner_id),
          'Owner: ' || COALESCE(v_old_owner_name, 'Unassigned') || ' -> ' || COALESCE(v_new_owner_name, 'Unassigned'));

  -- (g) Notifikasi -- SATU, ke owner BARU saja, KECUALI owner baru adalah
  -- pemanggil sendiri (rule 111 nexus-notes.js: "Assigning to yourself
  -- sends nothing."). p_new_owner_id sudah divalidasi aktif di (c) --
  -- nol cek aktif ulang di sini (beda dari close_inquiry_as_duplicate yang
  -- menotifikasi OWNER LAMA, yang tak pernah divalidasi aktif sebelumnya).
  -- NOL EXCEPTION WHEN OTHERS -- error naik apa adanya (instruksi eksplisit).
  IF p_new_owner_id IS NOT NULL AND p_new_owner_id <> auth.uid() THEN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_company_id, p_new_owner_id, 'inquiry_reassigned',
            'Inquiry assigned to you',
            v_inquiry_no || ' was assigned to you by ' || COALESCE(v_user_full_name, v_user_email) || '.',
            'inquiry', p_inquiry_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_inquiry_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reassign_inquiry_owner(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reassign_inquiry_owner(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.reassign_inquiry_owner(uuid, uuid) IS
  'Isi/ganti owner_id inquiry. Gate: is_super_admin() ATAU is_manager_or_above_in(company_id inquiry). Status terminal (WON/LOST/CANCELLED) ditolak. Owner baru wajib profil aktif + role aktif di company_id itu + termasuk OPERATIONAL_ROSTER_ROLES (salesRoster.js) -- daftar role ditranskripsi literal, lihat header migrasi utk provenance+risiko drift. No-op (owner baru = owner lama) -> return tanpa audit/notifikasi. Audit REASSIGN_INQUIRY_OWNER pola persis close_inquiry_as_duplicate. Notifikasi SATU ke owner baru, dilewati kalau owner baru = pemanggil (rule 111). NOL EXCEPTION WHEN OTHERS -- error naik.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='reassign_inquiry_owner';
-- SELECT proacl FROM pg_proc WHERE proname='reassign_inquiry_owner'; -- grantee hanya authenticated
--
-- Rollback (sebelum ada pemanggil baru bergantung padanya):
--   DROP FUNCTION public.reassign_inquiry_owner(uuid, uuid);
-- =============================================================================
