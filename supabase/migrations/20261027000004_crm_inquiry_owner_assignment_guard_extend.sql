-- =============================================================================
-- Migration: 20261027000004_crm_inquiry_owner_assignment_guard_extend
-- Inquiry Management Putaran 8 -- Owner Assignment, L-13
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP TRIGGER -- WAJIB DIJALANKAN MAS LANGSUNG DI
-- SQL EDITOR, BUKAN lewat connector Vir (connector menolak/membatalkan
-- statement DROP sebagai pengaman -- pola sama 20261026000001).
-- URUTAN: migrasi KEEMPAT (terakhir) dari blok Putaran 8. WAJIB jalan
-- SESUDAH 20261027000001 (kolom assigned_by/assigned_at/assign_reason) --
-- kalau tidak, `BEFORE UPDATE OF ...` di bawah akan gagal "column does not
-- exist". Boleh jalan SEBELUM ATAU SESUDAH 20261027000003 (urutan antara
-- 003/004 tidak relevan satu sama lain).
--
-- FAKTA DB (dikonfirmasi Vir, query baca-saja, 26 Okt 2026): badan
-- trg_fn_guard_inquiries_protected_columns di staging SAMA PERSIS dgn
-- definisi 20261026000001, nol versi yang lebih baru -- migrasi ini aman
-- sebagai CREATE OR REPLACE murni (plus 3 kolom baru di daftar terjaga).
--
-- RINGKASAN
-- Memperluas trg_z_guard_inquiries_protected_columns (20261026000001) --
-- menambah assigned_by, assigned_at, assign_reason ke daftar kolom
-- terjaga, karena ketiganya hanya boleh berubah BERSAMA owner_id lewat
-- reassign_inquiry_owner v2 (20261027000003) -- bukan lewat PATCH
-- langsung authenticated. Mekanisme TIDAK berubah: current_user <>
-- 'authenticated' melolosankan seluruh jalur SECURITY DEFINER (RPC di
-- atas berjalan sebagai owner fungsi, postgres, bukan role pemanggil
-- PostgREST) -- hanya client langsung yang diperiksa/ditolak.
--
-- YANG SENGAJA TIDAK DISENTUH (identik 20261026000001): status/
-- won_reason/won_evidence_path/revert_won_reason/inquiry_type -- lima
-- kolom itu TETAP dijaga dgn aturan yang SAMA, tidak diubah migrasi ini.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_fn_guard_inquiries_protected_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- SECURITY DEFINER RPC/trigger (current_user = owner fungsi, postgres)
  -- selalu lolos -- lihat enumerasi lengkap di header migrasi
  -- 20261026000001 + reassign_inquiry_owner v2 (20261027000003). Hanya
  -- client PostgREST langsung (current_user = 'authenticated') diperiksa.
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

  -- BARU Putaran 8: assigned_by/assigned_at/assign_reason ikut owner_id --
  -- satu aksi yang sama (reassign_inquiry_owner v2), bukan 4 jalur
  -- terpisah.
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.assign_reason IS DISTINCT FROM OLD.assign_reason THEN
    RAISE EXCEPTION 'inquiries.owner_id/assigned_by/assigned_at/assign_reason tidak bisa diubah langsung -- gunakan reassign_inquiry_owner.';
  END IF;

  IF NEW.inquiry_type IS DISTINCT FROM OLD.inquiry_type THEN
    RAISE EXCEPTION 'inquiries.inquiry_type tidak bisa diubah setelah dibuat.';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function TIDAK pernah dipanggil sebagai RPC (hanya oleh mesin
-- trigger) -- REVOKE ALL FROM PUBLIC sebagai higienitas, SENGAJA TANPA
-- GRANT EXECUTE TO authenticated. Identik 20261026000001.
REVOKE ALL ON FUNCTION public.trg_fn_guard_inquiries_protected_columns() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_guard_inquiries_protected_columns() IS
  'BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason, owner_id, assigned_by, assigned_at, assign_reason, inquiry_type ON inquiries -- menolak perubahan langsung oleh authenticated; current_user <> ''authenticated'' melolosankan seluruh jalur SECURITY DEFINER. Definisi dasar Putaran 5 K1c (20261026000001), diperluas Putaran 8 (20261027000004) utk 3 kolom assigned_* (L-13).';

DROP TRIGGER IF EXISTS trg_z_guard_inquiries_protected_columns ON public.inquiries;
CREATE TRIGGER trg_z_guard_inquiries_protected_columns
  BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason,
                   owner_id, assigned_by, assigned_at, assign_reason, inquiry_type
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_guard_inquiries_protected_columns();

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA (baca-saja)
-- =============================================================================
-- 1) Trigger terpasang pada SEMBILAN kolom yang benar:
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgrelid='public.inquiries'::regclass AND NOT tgisinternal
--    AND tgname='trg_z_guard_inquiries_protected_columns';
--  -- HARAP memuat: status, won_reason, won_evidence_path,
--  -- revert_won_reason, owner_id, assigned_by, assigned_at, assign_reason,
--  -- inquiry_type.
--
-- 2) Trigger function tanpa EXECUTE PUBLIC/authenticated (tidak berubah):
-- SELECT proacl FROM pg_proc WHERE proname='trg_fn_guard_inquiries_protected_columns';
--  -- HARAP: nol baris '=X/postgres' (PUBLIC), nol baris 'authenticated=X/postgres'.
--
-- 3) Uji tolakan langsung (sesi `authenticated`, BUKAN service_role) --
--    harus GAGAL dgn pesan eksplisit, bukan silent/RLS 0-row:
--    UPDATE inquiries SET assigned_by = auth.uid() WHERE id = '<id_apa_pun>';
--  -- HARAP: ERROR "inquiries.owner_id/assigned_by/assigned_at/
--  -- assign_reason tidak bisa diubah langsung -- gunakan
--  -- reassign_inquiry_owner."
-- =============================================================================

-- =============================================================================
-- ROLLBACK (balik ke daftar kolom 20261026000001, urutan terbalik):
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_z_guard_inquiries_protected_columns ON public.inquiries;
--   CREATE TRIGGER trg_z_guard_inquiries_protected_columns
--     BEFORE UPDATE OF status, won_reason, won_evidence_path,
--                      revert_won_reason, owner_id, inquiry_type
--     ON public.inquiries FOR EACH ROW
--     EXECUTE FUNCTION public.trg_fn_guard_inquiries_protected_columns();
--   COMMIT;
-- (fungsinya sendiri tetap berisi cek assigned_* kalau badan fungsi tidak
-- ikut dikembalikan ke versi 20261026000001 -- rollback penuh perlu
-- CREATE OR REPLACE FUNCTION dgn badan lama juga.)
-- =============================================================================
