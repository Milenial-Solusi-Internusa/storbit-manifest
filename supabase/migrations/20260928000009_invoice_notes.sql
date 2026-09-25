-- =============================================================================
-- 20260928000009_invoice_notes.sql           (Invoice lengkap, berkas 9 dari 9)
--
-- Catatan internal invoice, setara "Log note" Odoo. Tampil digabung ke Riwayat.
--
-- SIAPA BOLEH MENULIS: SIAPA PUN YANG BOLEH MEMBACA invoice itu -- termasuk
-- `finance` polos yang tidak boleh menerbitkan maupun mencatat pembayaran.
-- Itu disengaja: menutup catatan dari orang yang mengerjakan dokumennya
-- membuat fitur ini mati sebelum dipakai.
--
-- ⛔ APPEND-ONLY. Tidak ada jalur sunting, dan itu bukan kelalaian: jejak yang
-- bisa ditulis ulang bukan jejak. Salah tulis -> tulis catatan baru.
-- Menghapus = SOFT DELETE, hanya penulisnya sendiri atau super_admin, dan
-- barisnya TETAP tampil di Riwayat sebagai "catatan dihapus" beserta waktunya.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='invoice_dapat_dibaca'
  ) THEN
    RAISE EXCEPTION 'PALANG: invoice_dapat_dibaca tidak ada -- jalankan 20260928000007 lebih dulu.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS.';
END
$palang$;

CREATE TABLE IF NOT EXISTS public.invoice_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sp_invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  body       text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT invoice_notes_body_check CHECK (btrim(body) <> '' AND length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice
  ON public.invoice_notes (invoice_id, created_at DESC);

ALTER TABLE public.invoice_notes ENABLE ROW LEVEL SECURITY;

-- REVOKE sebelum GRANT -- lihat catatan yang sama di berkas 8: default
-- privileges DB ini menempelkan ALL ke `authenticated` pada tiap tabel baru.
REVOKE ALL ON public.invoice_notes FROM authenticated, anon;
GRANT SELECT ON public.invoice_notes TO authenticated;

-- Baris yang sudah di-soft-delete TETAP terbaca: Riwayat menampilkannya
-- sebagai "catatan dihapus". Menyembunyikannya membuat lini masa berlubang
-- tanpa penjelasan.
CREATE POLICY invoice_notes_read ON public.invoice_notes
  FOR SELECT TO authenticated
  USING (public.invoice_dapat_dibaca(invoice_id));

COMMENT ON TABLE public.invoice_notes IS
  'Catatan internal invoice (Log note). APPEND-ONLY: nol jalur sunting, hapus = soft delete oleh penulis/super_admin. TULIS hanya lewat add_invoice_note. Berkas 9, 20260928000009.';

CREATE OR REPLACE FUNCTION public.add_invoice_note(p_invoice_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_co uuid; v_no text; v_id uuid;
BEGIN
  -- Gate-nya BACA, bukan daftar peran. Satu sumber, dan ia ikut kalau policy
  -- baca invoice berubah.
  IF NOT invoice_dapat_dibaca(p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan atau tidak bisa dibaca dengan peran kamu.';
  END IF;
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Catatan tidak boleh kosong.';
  END IF;

  SELECT company_id, invoice_no INTO v_co, v_no FROM sp_invoices WHERE id = p_invoice_id;

  INSERT INTO invoice_notes (invoice_id, company_id, body, created_by)
  VALUES (p_invoice_id, v_co, btrim(p_body), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label)
  VALUES (v_uid, v_co, 'ADD_INVOICE_NOTE', 'sp_invoices', p_invoice_id, v_no);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_invoice_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_inv uuid; v_co uuid; v_by uuid; v_n int;
BEGIN
  SELECT invoice_id, company_id, created_by INTO v_inv, v_co, v_by
    FROM invoice_notes WHERE id = p_note_id AND deleted_at IS NULL;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'Catatan tidak ditemukan atau sudah dihapus.'; END IF;

  IF NOT (is_super_admin() OR v_by = v_uid) THEN
    RAISE EXCEPTION 'Hanya penulisnya sendiri atau Super Admin yang boleh menghapus catatan ini.';
  END IF;

  UPDATE invoice_notes SET deleted_at = now() WHERE id = p_note_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Catatan sudah dihapus orang lain.'; END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id)
  VALUES (v_uid, v_co, 'DELETE_INVOICE_NOTE', 'sp_invoices', v_inv);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_invoice_note(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_invoice_note(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_invoice_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invoice_note(uuid) TO authenticated;

DO $v1$
DECLARE v_tulis int; v_fn_pub int; v_fn_auth int; v_pol int;
BEGIN
  SELECT count(*) INTO v_tulis FROM information_schema.table_privileges
   WHERE table_schema='public' AND table_name='invoice_notes'
     AND grantee='authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE');
  IF v_tulis <> 0 THEN
    RAISE EXCEPTION 'V1a GAGAL: authenticated punya % hak tulis langsung ke invoice_notes -- append-only tidak berarti apa-apa.', v_tulis;
  END IF;

  -- PEMBANDING: baca harus ADA.
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                  WHERE table_schema='public' AND table_name='invoice_notes'
                    AND grantee='authenticated' AND privilege_type='SELECT') THEN
    RAISE EXCEPTION 'V1a GAGAL: authenticated tidak bisa MEMBACA invoice_notes.';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname='public' AND tablename='invoice_notes';
  IF v_pol <> 1 THEN RAISE EXCEPTION 'V1b GAGAL: % policy pada invoice_notes, harusnya 1 (SELECT).', v_pol; END IF;

  SELECT count(*) INTO v_fn_pub FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('add_invoice_note','delete_invoice_note')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  IF v_fn_pub <> 0 THEN RAISE EXCEPTION 'V1c GAGAL: % fungsi catatan ber-PUBLIC EXECUTE.', v_fn_pub; END IF;

  SELECT count(*) INTO v_fn_auth FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('add_invoice_note','delete_invoice_note')
     AND EXISTS (SELECT 1 FROM unnest(p.proacl) a
                  WHERE a::text LIKE 'authenticated=%' AND split_part(a::text,'=',2) LIKE '%X%');
  IF v_fn_auth <> 2 THEN RAISE EXCEPTION 'V1c GAGAL: hanya % dari 2 fungsi ber-EXECUTE untuk authenticated.', v_fn_auth; END IF;

  RAISE NOTICE 'V1 LOLOS: invoice_notes baca-saja untuk authenticated, 1 policy, 2 RPC tanpa PUBLIC.';
END
$v1$;

COMMIT;

-- =============================================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.delete_invoice_note(uuid);
--   DROP FUNCTION IF EXISTS public.add_invoice_note(uuid, text);
--   DROP TABLE IF EXISTS public.invoice_notes;
-- ⚠️ DROP TABLE menghapus catatan yang sudah ditulis orang. Ekspor dulu.
-- =============================================================================
