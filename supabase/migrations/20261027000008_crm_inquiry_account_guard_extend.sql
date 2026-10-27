-- =============================================================================
-- Migration: 20261027000008_crm_inquiry_account_guard_extend
-- Inquiry Management Putaran 15, Task 4 -- perluas trg_z_guard_inquiries_
-- protected_columns (K1c, 20261026000001, diperluas 20261027000004 utk
-- assigned_*) ke prospect_id/customer_id/contact_id, supaya satu-satunya
-- jalur sah mengubahnya adalah change_inquiry_account (20261027000007).
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP TRIGGER -- WAJIB DIJALANKAN MAS LANGSUNG DI
-- SQL EDITOR, BUKAN lewat connector Vir (connector menolak/membatalkan
-- statement DROP sebagai pengaman -- pola sama 20261026000001/
-- 20261027000004).
-- URUTAN: WAJIB jalan SESUDAH 20261027000007 (fungsi change_inquiry_account
-- harus sudah ada sebelum jalur authenticated langsung ditutup -- kalau
-- urutannya terbalik, satu-satunya jalur sah mengubah kolom-kolom ini
-- MENGHILANG untuk sementara). Boleh jalan SEBELUM ATAU SESUDAH
-- 20261027000005/000006 (Putaran 10, tidak relevan satu sama lain).
--
-- PREASYARAT TERPENUHI (telusur Task 4, dilaporkan di chat sesi ini, nol
-- berkas .md ditulis): InquiryFormPage.jsx (sedang dipensiunkan Task 1) ==
-- SATU-SATUNYA penulis sah inquiries.prospect_id/customer_id/contact_id
-- yang berjalan sebagai role `authenticated` hari ini. Ditelusur TUNTAS:
--   (a) src/ + scripts/ -- seluruh .from('inquiries').update(...)/.insert(...)
--       (termasuk yang .update()-nya di baris lain dari .from()), src/lib/db.js,
--       dan helper bersama (saveInquirySection DealDetailPage.jsx, dipakai
--       7 section Overview -- nol pemanggil mengirim prospect_id/customer_id/
--       contact_id di patch-nya).
--   (b) supabase/functions/ -- aging-pipeline (SELECT saja) dan manage-schema
--       (ALTER TABLE tambah kolom custom BARU via service_role, tidak pernah
--       menyentuh prospect_id/customer_id/contact_id).
--   (c) schema_snapshot.sql + seluruh supabase/migrations/*.sql -- nol fungsi/
--       trigger (SECURITY DEFINER maupun bukan) yang UPDATE inquiries SET
--       prospect_id/customer_id/contact_id = ...; RPC yang SECURITY DEFINER
--       (create_inquiry_with_lanes, update_inquiry_lanes, dll) tidak relevan
--       untuk pertanyaan ini -- mereka SUDAH lolos current_user <>
--       'authenticated' apa pun daftar kolom yang dijaga trigger ini.
-- Nol penulis sah LAIN ditemukan -- migrasi ini AMAN dijalankan begitu
-- InquiryFormPage.jsx sendiri sudah pensiun (Task 1), dan juga aman
-- dijalankan SEBELUM Task 1 (InquiryFormPage.jsx akan ikut ditolak trigger
-- ini untuk ketiga kolom itu -- sejalan dengan niat mematikannya).
--
-- YANG SENGAJA TIDAK DISENTUH (identik 20261026000001/20261027000004):
-- status/won_reason/won_evidence_path/revert_won_reason/owner_id/
-- assigned_by/assigned_at/assign_reason/inquiry_type -- SEMBILAN kolom itu
-- TETAP dijaga dgn aturan yang SAMA, tidak diubah migrasi ini.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_fn_guard_inquiries_protected_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- SECURITY DEFINER RPC/trigger (current_user = owner fungsi, postgres)
  -- selalu lolos -- lihat enumerasi lengkap di header migrasi 20261026000001
  -- + 20261027000004 + 20261027000007 (change_inquiry_account). Hanya client
  -- PostgREST langsung (current_user = 'authenticated') diperiksa.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'WON' OR OLD.status = 'WON') THEN
    RAISE EXCEPTION 'inquiries.status tidak bisa diubah langsung ke/dari WON -- gunakan mark_inquiry_won/revert_manual_win.';
  END IF;

  IF NEW.won_reason IS DISTINCT FROM OLD.won_reason
     OR NEW.won_evidence_path IS DISTINCT FROM OLD.won_evidence_path
     OR NEW.revert_won_reason IS DISTINCT FROM OLD.revert_won_reason THEN
    RAISE EXCEPTION 'inquiries.won_reason/won_evidence_path/revert_won_reason tidak bisa diubah langsung -- gunakan mark_inquiry_won/revert_manual_win.';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.assign_reason IS DISTINCT FROM OLD.assign_reason THEN
    RAISE EXCEPTION 'inquiries.owner_id/assigned_by/assigned_at/assign_reason tidak bisa diubah langsung -- gunakan reassign_inquiry_owner.';
  END IF;

  -- BARU Putaran 15, Task 4: prospect_id/customer_id/contact_id ikut
  -- terjaga -- satu aksi (change_inquiry_account), bukan jalur PATCH bebas.
  IF NEW.prospect_id IS DISTINCT FROM OLD.prospect_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
    RAISE EXCEPTION 'inquiries.prospect_id/customer_id/contact_id tidak bisa diubah langsung -- gunakan change_inquiry_account.';
  END IF;

  IF NEW.inquiry_type IS DISTINCT FROM OLD.inquiry_type THEN
    RAISE EXCEPTION 'inquiries.inquiry_type tidak bisa diubah setelah dibuat.';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function tidak pernah dipanggil sebagai RPC (hanya oleh mesin
-- trigger) -- REVOKE ALL FROM PUBLIC sebagai higienitas, SENGAJA TANPA
-- GRANT EXECUTE TO authenticated. Identik 20261026000001/20261027000004.
REVOKE ALL ON FUNCTION public.trg_fn_guard_inquiries_protected_columns() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_guard_inquiries_protected_columns() IS
  'BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason, owner_id, assigned_by, assigned_at, assign_reason, prospect_id, customer_id, contact_id, inquiry_type ON inquiries -- menolak perubahan langsung oleh authenticated; current_user <> ''authenticated'' melolosankan seluruh jalur SECURITY DEFINER. Definisi dasar Putaran 5 K1c (20261026000001), diperluas Putaran 8 (20261027000004) utk 3 kolom assigned_*, diperluas Putaran 15 Task 4 (20261027000008) utk prospect_id/customer_id/contact_id.';

DROP TRIGGER IF EXISTS trg_z_guard_inquiries_protected_columns ON public.inquiries;
CREATE TRIGGER trg_z_guard_inquiries_protected_columns
  BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason,
                   owner_id, assigned_by, assigned_at, assign_reason,
                   prospect_id, customer_id, contact_id, inquiry_type
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_guard_inquiries_protected_columns();

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Trigger terpasang pada DUA BELAS kolom yang benar:
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgrelid='public.inquiries'::regclass AND NOT tgisinternal
--    AND tgname='trg_z_guard_inquiries_protected_columns';
--  -- HARAP memuat: status, won_reason, won_evidence_path,
--  -- revert_won_reason, owner_id, assigned_by, assigned_at, assign_reason,
--  -- prospect_id, customer_id, contact_id, inquiry_type.
--
-- 2) Trigger function tanpa EXECUTE PUBLIC/authenticated (tidak berubah):
-- SELECT proacl FROM pg_proc WHERE proname='trg_fn_guard_inquiries_protected_columns';
--  -- HARAP: nol baris '=X/postgres' (PUBLIC), nol baris 'authenticated=X/postgres'.
--
-- 3) Uji tolakan langsung (sesi `authenticated`, BUKAN service_role) --
--    harus GAGAL dgn pesan eksplisit, bukan silent/RLS 0-row:
--    UPDATE inquiries SET prospect_id = prospect_id WHERE id = '<id_apa_pun>';
--  -- HARAP: ERROR "inquiries.prospect_id/customer_id/contact_id tidak bisa
--  -- diubah langsung -- gunakan change_inquiry_account."
--
-- 4) Uji jalur sah TETAP lolos (SECURITY DEFINER melewati trigger ini):
--    SELECT change_inquiry_account('<id_inquiry_uji>', '<id_akun_baru>', '<id_kontak_baru>');
--  -- HARAP: sukses, nol exception dari trigger ini.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (balik ke daftar kolom 20261027000004, urutan terbalik):
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_z_guard_inquiries_protected_columns ON public.inquiries;
--   CREATE TRIGGER trg_z_guard_inquiries_protected_columns
--     BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason,
--                      owner_id, assigned_by, assigned_at, assign_reason, inquiry_type
--     ON public.inquiries FOR EACH ROW
--     EXECUTE FUNCTION public.trg_fn_guard_inquiries_protected_columns();
--   COMMIT;
-- (fungsinya sendiri tetap berisi cek prospect_id/customer_id/contact_id
-- kalau badan fungsi tidak ikut dikembalikan ke versi 20261027000004 --
-- rollback penuh perlu CREATE OR REPLACE FUNCTION dgn badan lama juga.)
-- =============================================================================
