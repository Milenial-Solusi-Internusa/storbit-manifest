-- =============================================================================
-- 20260930000001_ar_tahap3b_status_pending_approval.sql   (AR Tahap 3 bagian
-- kedua -- approval terbit invoice, berkas 1 dari 6)
--
-- 100% ADITIF. Menambah SATU nilai status (`pending_approval`) ke
-- `sp_invoices_status_check` dan LIMA kolom jejak approval/penolakan. Nol
-- fungsi disentuh di berkas ini, nol baris data diubah, nol invoice yang
-- sudah ada berpindah status -- ALTER TABLE murni.
--
-- Kenapa `pending_approval` (bukan nama lain): `src/modules/finance/
-- invoiceStatus.js:50-54` SUDAH menuliskan id ini sebagai titik sisip yang
-- diantisipasi sejak 25 Sep 2026 ("AR Tahap 3 akan menambahkan 'Menunggu
-- Persetujuan' DI DEPAN 'issued'"). Nama ini bukan usulan baru.
--
-- KENAPA `draft` dipakai untuk invoice yang DITOLAK, bukan status baru lain:
-- `sp_invoices.status` sudah ber-DEFAULT 'draft' sejak tabel ini lahir, dan
-- CHECK constraint sudah lama memuat nilai itu -- tapi diverifikasi (grep
-- `INSERT INTO sp_invoices` di SELURUH riwayat migrasi): nol RPC pernah
-- meng-INSERT dengan status 'draft', semuanya langsung 'issued'. Jadi 'draft'
-- adalah nilai skema yang hidup tapi tak terpakai -- aman diberi makna baru
-- di sini, bukan nilai yang sedang dipakai untuk hal lain yang bisa bentrok.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PALANG -- berkas ini mendarat DI ATAS antrean AR Tahap 3 bagian pertama
-- (butir 32-38). Tanpa itu, `create_invoice_for_sp` yang akan disunting
-- berkas berikutnya bukan versi yang diasumsikan PLAN ini.
-- ---------------------------------------------------------------------------
DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'compute_payment_term_days'
  ) THEN
    RAISE EXCEPTION 'PALANG: compute_payment_term_days tidak ada -- AR Tahap 3 bagian pertama (20260929000004) belum jalan di DB ini.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
       AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date'
  ) THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received(uuid,text,text,text,date) tidak ada -- 20260929000008/000010 belum jalan di DB ini.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: AR Tahap 3 bagian pertama (butir 32-38) terpasang di DB ini.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan SEBELUM.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE v_n_inv int; v_n_status int;
BEGIN
  SELECT count(*) INTO v_n_inv FROM sp_invoices WHERE deleted_at IS NULL;
  SELECT count(DISTINCT status) INTO v_n_status FROM sp_invoices WHERE deleted_at IS NULL;
  RAISE NOTICE 'V0: % invoice hidup, % nilai status berbeda dipakai (harus tidak memuat pending_approval -- nilai itu belum ada).', v_n_inv, v_n_status;
END
$v0$;

-- ---------------------------------------------------------------------------
-- (1) Status baru.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoices DROP CONSTRAINT sp_invoices_status_check;
ALTER TABLE public.sp_invoices
  ADD CONSTRAINT sp_invoices_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'issued'::text,
                              'submitted'::text, 'partial'::text, 'paid'::text, 'void'::text]));

-- ---------------------------------------------------------------------------
-- (2) Jejak approval/penolakan. Tanpa FK -- pola sama dengan `created_by` di
-- tabel ini sendiri (tanpa FK ke auth.users), dan dengan sp_payments/ar_ttfs
-- (dicatat gotcha lama: beberapa tabel tak punya FK created_by -> profiles,
-- nama pelaku diresolusi FE lewat batch lookup, bukan lewat JOIN paksa).
-- ---------------------------------------------------------------------------
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS approved_by    uuid;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS approved_at    timestamptz;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS rejected_by    uuid;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS rejected_at    timestamptz;
ALTER TABLE public.sp_invoices ADD COLUMN IF NOT EXISTS rejection_note text;

COMMENT ON COLUMN public.sp_invoices.approved_by IS
  'Diisi HANYA oleh approve_invoice_issue() (berkas 3, 20260930000003). Isi sekali per baris -- baris yang ditolak lalu diajukan ulang lahir sebagai baris BARU, bukan baris ini didaur ulang.';
COMMENT ON COLUMN public.sp_invoices.rejection_note IS
  'Wajib diisi oleh reject_invoice_issue() (berkas 3). Baris berstatus draft ber-rejection_note = ditolak; baris draft TANPA rejection_note tidak seharusnya pernah ada (created_invoice_for_sp selalu insert pending_approval, tidak pernah draft).';

COMMIT;

-- ---------------------------------------------------------------------------
-- V1 -- verifikasi.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'sp_invoices' AND c.conname = 'sp_invoices_status_check'
       AND pg_get_constraintdef(c.oid) LIKE '%pending_approval%'
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'V1 GAGAL: constraint status belum memuat pending_approval.'; END IF;

  SELECT bool_and(EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sp_invoices' AND column_name = kolom
  )) INTO v_ok
  FROM unnest(ARRAY['approved_by','approved_at','rejected_by','rejected_at','rejection_note']) kolom;
  IF NOT v_ok THEN RAISE EXCEPTION 'V1 GAGAL: salah satu dari lima kolom jejak belum ada.'; END IF;

  RAISE NOTICE 'V1 LOLOS: status_check memuat pending_approval, lima kolom jejak ada.';
END
$v1$;

-- =============================================================================
-- ROLLBACK
--
--   BEGIN;
--   ALTER TABLE public.sp_invoices DROP COLUMN IF EXISTS approved_by;
--   ALTER TABLE public.sp_invoices DROP COLUMN IF EXISTS approved_at;
--   ALTER TABLE public.sp_invoices DROP COLUMN IF EXISTS rejected_by;
--   ALTER TABLE public.sp_invoices DROP COLUMN IF EXISTS rejected_at;
--   ALTER TABLE public.sp_invoices DROP COLUMN IF EXISTS rejection_note;
--   ALTER TABLE public.sp_invoices DROP CONSTRAINT sp_invoices_status_check;
--   ALTER TABLE public.sp_invoices ADD CONSTRAINT sp_invoices_status_check
--     CHECK (status = ANY (ARRAY['draft','issued','submitted','partial','paid','void']));
--   COMMIT;
--
-- ⚠️ Rollback ini HANYA aman sebelum berkas 2 (create_invoice_for_sp) jalan --
-- sesudahnya, baris ber-status pending_approval akan gagal masuk kembali ke
-- constraint lama. Jangan jalankan rollback ini kalau sudah ada baris
-- pending_approval hidup.
-- =============================================================================
