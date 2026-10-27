-- =============================================================================
-- Migration: 20261027000007_crm_change_inquiry_account
-- Inquiry Management Putaran 15, Task 4 -- Change Account di Detail Inquiry
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
-- Dijalankan Mas sendiri (SQL Editor atau connector Vir -- CREATE FUNCTION
-- polos, tanpa DROP, aman lewat connector).
--
-- RAISE EXCEPTION, judul, dan isi notifikasi memakai Bahasa Inggris (pola
-- Putaran 10: prf_remind_procurement/prf_cancel_request, 20261027000006) --
-- fungsi BARU, tanpa riwayat bahasa yang harus diseragamkan ke badan lama.
--
-- LATAR: InquiryFormPage.jsx (sedang dipensiunkan, Task 1 Putaran 15) adalah
-- SATU-SATUNYA penulis sah inquiries.prospect_id/customer_id/contact_id hari
-- ini -- ditelusur TUNTAS sebelum migrasi ini ditulis (src/, scripts/,
-- supabase/functions/, schema_snapshot.sql + seluruh migrations/*.sql untuk
-- fungsi/trigger non-SECURITY DEFINER yang UPDATE inquiries): nol penulis sah
-- lain ditemukan. Tabel hasil telusur lengkap dilaporkan di chat sesi ini
-- (bukan file terpisah -- instruksi eksplisit: tidak menulis berkas .md).
--
-- SATU AKUN GABUNGAN (koreksi wajib Den, Putaran 15): inquiries.customer_id
-- SELALU NULL sejak create_inquiry_with_lanes (20261025000005) dan
-- InquiryIntakeWizardPage.jsx -- id akun SELALU ke prospect_id, baik akun itu
-- berstage prospect ATAUPUN customer (AccountPicker menampilkan badge stage,
-- bukan dua kolom). RPC ini mengikuti pola yang SAMA: baca akun lama lewat
-- COALESCE(prospect_id, customer_id) (data lama/longgar mungkin masih pakai
-- customer_id), lalu SET prospect_id = akun baru, customer_id = NULL --
-- TIDAK ada toggle Prospect/Customer di modal pemanggil (DICABUT dari
-- rencana awal, lihat ChangeAccountModal.jsx).
--
-- GERBANG: manager-ke-atas DI ENTITAS inquiry ini (is_manager_or_above_in),
-- atau super admin (is_super_admin) -- pola IDENTIK reassign_inquiry_owner v2
-- (20261027000003:88) dan mark_inquiry_won. Status wajib salah satu dari
-- OPEN/IN_REVIEW/QUOTED/NEGOTIATION (LOSABLE_INQUIRY_STATUS FE,
-- DealDetailPage.jsx:86) -- bukan status terminal.
--
-- TEMUAN DAMPAK TURUNAN (diverifikasi ke kode/skema sebelum menulis larangan
-- di bawah, bukan ditebak):
--   (1) assign_inquiry_no() (20261022000001_crm_inquiry_server_side_numbering,
--       baris 95-139) ambil kode entitas dari NEW.company_id (inquiries.
--       company_id SENDIRI),
--       BUKAN dari akun -- inquiry_no TIDAK ikut berubah bila akun diganti,
--       tapi akun baru WAJIB company_id SAMA dengan inquiries.company_id,
--       kalau tidak inquiry_no akan berbohong soal entitas akunnya.
--   (2) quotations punya kolom prospect_id/customer_id SENDIRI
--       (schema_snapshot.sql:9430-9431) -- snapshot di waktu quotation
--       dibuat, BUKAN live-join ke inquiries. prf punya account_id/
--       account_name_manual SENDIRI (schema_snapshot.sql:9059-9060), sama.
--       Mengganti akun inquiry TIDAK mengikutkan quotation/PRF yang sudah
--       terbit -- keduanya akan terus menunjuk akun LAMA. Karena itu RPC ini
--       MENOLAK KERAS bila inquiry ini sudah punya Quotation ATAU PRF hidup
--       (deleted_at IS NULL) -- bukan hanya peringatan FE.
--   (3) trg_fn_block_inquiry_for_pooled_account (20261012000006:544-546)
--       HANYA BEFORE INSERT, tidak menjangkau UPDATE -- RPC ini melakukan
--       cek is_in_lead_pool SENDIRI (defense-in-depth, bukan mengandalkan
--       trigger insert-only yang tidak relevan untuk UPDATE).
--
-- YANG SENGAJA TIDAK DIBANGUN (membatasi cakupan Task 4):
--   - Tabel riwayat khusus (pola inquiry_owner_history) -- audit_logs
--     dianggap cukup untuk aksi yang jauh lebih jarang dipakai dibanding
--     reassign owner.
--   - Kolom permanen untuk alasan ganti akun -- cukup di audit_logs.notes/
--     new_data, pola sama reassign_inquiry_owner (assign_reason DI kolom
--     inquiries itu sendiri, tapi itu dipakai ulang Reassign Owner lain;
--     ganti akun jauh lebih jarang, tidak butuh kolom sendiri).
--   - Menjalankan ulang find_possible_duplicate_inquiries -- preseden sudah
--     "create-only" (form lama juga mematikan deteksi ini total saat edit).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.change_inquiry_account(
  p_inquiry_id      uuid,
  p_new_account_id  uuid,
  p_new_contact_id  uuid,
  p_reason          text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_company_id            uuid;
  v_status                text;
  v_inquiry_no            text;
  v_old_account_id        uuid;
  v_old_contact_id        uuid;
  v_old_account_name      text;
  v_new_account_name      text;
  v_new_account_company   uuid;
  v_new_account_lifecycle text;
  v_new_account_pooled    boolean;
  v_owner_id              uuid;
  v_user_email            text;
  v_user_full_name        text;
  v_user_role             text;
  v_has_quotation         boolean;
  v_has_prf               boolean;
  v_now                   timestamptz := now();
BEGIN
  -- Inquiry harus ada, tidak soft-deleted. COALESCE(prospect_id, customer_id)
  -- -- satu akun gabungan, lihat header migrasi di atas.
  SELECT company_id, status, inquiry_no, COALESCE(prospect_id, customer_id), contact_id, owner_id
    INTO v_company_id, v_status, v_inquiry_no, v_old_account_id, v_old_contact_id, v_owner_id
    FROM public.inquiries
   WHERE id = p_inquiry_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry not found.';
  END IF;

  -- Gerbang: manager-ke-atas DI ENTITAS inquiry ini, atau super admin.
  IF NOT (public.is_super_admin() OR public.is_manager_or_above_in(v_company_id)) THEN
    RAISE EXCEPTION 'Only a Manager or above in this entity, or a Super Admin, may change the account.';
  END IF;

  -- Status bukan terminal.
  IF v_status NOT IN ('OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION') THEN
    RAISE EXCEPTION 'An inquiry with status % cannot have its account changed.', v_status;
  END IF;

  IF p_new_account_id IS NULL THEN
    RAISE EXCEPTION 'A new account is required.';
  END IF;
  IF p_new_contact_id IS NULL THEN
    RAISE EXCEPTION 'A contact is required.';
  END IF;

  -- No-op: akun DAN kontak sama persis -> nol tulis, nol audit, nol notifikasi.
  IF p_new_account_id = v_old_account_id AND p_new_contact_id IS NOT DISTINCT FROM v_old_contact_id THEN
    RETURN;
  END IF;

  SELECT name, company_id, lifecycle_stage, is_in_lead_pool
    INTO v_new_account_name, v_new_account_company, v_new_account_lifecycle, v_new_account_pooled
    FROM public.accounts
   WHERE id = p_new_account_id AND deleted_at IS NULL;
  IF v_new_account_name IS NULL THEN
    RAISE EXCEPTION 'The selected account was not found.';
  END IF;

  -- (1) Entitas akun baru HARUS sama dengan entitas inquiry -- lihat temuan
  -- assign_inquiry_no() di header migrasi.
  IF v_new_account_company IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'The new account must belong to the same entity as this inquiry.';
  END IF;

  -- lifecycle_stage: 7 nilai di CHECK (lead/mql/sql/prospect/customer/
  -- free_agent/lost) -- tolak hanya 'lost', cermin filter FE picker.
  IF v_new_account_lifecycle = 'lost' THEN
    RAISE EXCEPTION 'The selected account is marked Lost and cannot be linked to an inquiry.';
  END IF;

  -- (3) is_in_lead_pool cek SENDIRI -- trigger insert-only tidak menjangkau
  -- UPDATE ini, lihat header migrasi.
  IF v_new_account_pooled THEN
    RAISE EXCEPTION 'The selected account is currently in the Lead Pool and must be claimed before it can be linked to an inquiry.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
     WHERE id = p_new_contact_id AND account_id = p_new_account_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The selected contact was not found, or does not belong to the selected account.';
  END IF;

  -- (2) Larangan total kalau sudah ada Quotation ATAU PRF hidup -- keduanya
  -- menyimpan akun SENDIRI, independen dari inquiries (lihat header migrasi).
  SELECT EXISTS (SELECT 1 FROM public.quotations WHERE inquiry_id = p_inquiry_id AND deleted_at IS NULL) INTO v_has_quotation;
  SELECT EXISTS (SELECT 1 FROM public.prf        WHERE inquiry_id = p_inquiry_id AND deleted_at IS NULL) INTO v_has_prf;
  IF v_has_quotation OR v_has_prf THEN
    RAISE EXCEPTION 'This inquiry already has a %, which records the account separately -- the account cannot be changed anymore.',
      CASE WHEN v_has_quotation AND v_has_prf THEN 'Quotation and a PRF'
           WHEN v_has_quotation THEN 'Quotation'
           ELSE 'PRF' END;
  END IF;

  SELECT name INTO v_old_account_name FROM public.accounts WHERE id = v_old_account_id;

  UPDATE public.inquiries
     SET prospect_id = p_new_account_id,
         customer_id = NULL,
         contact_id  = p_new_contact_id,
         updated_at  = v_now
   WHERE id = p_inquiry_id;

  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'CHANGE_INQUIRY_ACCOUNT', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('prospect_id', v_old_account_id, 'contact_id', v_old_contact_id),
          jsonb_build_object('prospect_id', p_new_account_id, 'contact_id', p_new_contact_id, 'reason', p_reason),
          'Account: ' || COALESCE(v_old_account_name, '-') || ' -> ' || v_new_account_name);

  -- Notifikasi ke owner, kecuali pemanggil = owner sendiri (pola
  -- reassign_inquiry_owner v2:162, rule 111 nexus-notes.js).
  IF v_owner_id IS NOT NULL AND v_owner_id <> auth.uid() THEN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_company_id, v_owner_id, 'inquiry_account_changed',
            'Inquiry account changed',
            v_inquiry_no || ' was moved from ' || COALESCE(v_old_account_name, '(none)') || ' to ' || v_new_account_name || ' by ' || COALESCE(v_user_full_name, v_user_email) || '.',
            'inquiry', p_inquiry_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.change_inquiry_account(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_inquiry_account(uuid, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.change_inquiry_account(uuid, uuid, uuid, text) IS
  'Change the account (prospect_id) and contact of an inquiry (NEW function, Putaran 15, Task 4). Gate: Manager or above in the inquiry entity, or Super Admin. Rejected when status is terminal, the new account is cross-entity/Lost/in the Lead Pool, the contact does not belong to the account, or the inquiry already has a live Quotation or PRF (both snapshot their own account link). customer_id is always set to NULL (single combined account, same convention as create_inquiry_with_lanes).';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Fungsi ada, SECURITY DEFINER, signature benar:
-- SELECT p.proname, p.prosecdef, oidvectortypes(p.proargtypes)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='change_inquiry_account';
--  -- HARAP: SATU baris, oidvectortypes = 'uuid, uuid, uuid, text', prosecdef=true.
--
-- 2) ACL hanya authenticated:
-- SELECT proacl FROM pg_proc WHERE proname='change_inquiry_account';
--  -- HARAP: grantee hanya authenticated, nol baris '=X/postgres' (PUBLIC)
--  -- atau 'anon=X/postgres'.
--
-- 3) Uji positif (inquiry OPEN tanpa Quotation/PRF, akun baru entitas sama,
--    bukan Lead Pool, punya kontak):
-- SELECT change_inquiry_account('<id_inquiry_uji>', '<id_akun_baru>', '<id_kontak_baru>', 'uji manual');
-- SELECT prospect_id, customer_id, contact_id FROM public.inquiries WHERE id = '<id_inquiry_uji>';
--  -- HARAP: prospect_id = akun baru, customer_id NULL, contact_id = kontak baru.
--
-- 4) Uji negatif (jalankan sebagai sesi `authenticated`, bukan `service_role`
--    / `postgres`):
--    - Panggil pada inquiry berstatus WON/LOST/CANCELLED -> HARAP RAISE
--      EXCEPTION status terminal.
--    - Panggil dengan akun baru company_id BEDA dari inquiry -> HARAP RAISE
--      EXCEPTION "same entity".
--    - Panggil dengan akun baru is_in_lead_pool=true -> HARAP RAISE EXCEPTION
--      "Lead Pool".
--    - Panggil pada inquiry yang sudah punya Quotation/PRF hidup -> HARAP
--      RAISE EXCEPTION menyebut Quotation/PRF.
--    - Panggil sebagai user BUKAN manager-ke-atas di entitas inquiry DAN
--      bukan super admin -> HARAP RAISE EXCEPTION gerbang.
--    - Panggil dengan p_new_contact_id milik akun LAIN (bukan p_new_account_id)
--      -> HARAP RAISE EXCEPTION "does not belong to the selected account".
-- =============================================================================

-- =============================================================================
-- ROLLBACK:
--   BEGIN;
--   DROP FUNCTION public.change_inquiry_account(uuid, uuid, uuid, text);
--   COMMIT;
--   Nol dampak ke tabel inquiries -- fungsi ini tidak membawa kolom baru.
-- =============================================================================
