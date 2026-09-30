-- =============================================================================
-- 20260930000006_ar_tahap3b_get_invoice_audit_trail.sql
-- (AR Tahap 3 bagian kedua, berkas 6 dari 6 -- TERAKHIR)
--
-- RPC BARU. Melayani DUA kebutuhan sekaligus (panel Riwayat TASK 1 --
-- ajukan/setujui/tolak -- dan TASK 3 -- koreksi TTF) lewat SATU sumber data,
-- SATU urutan waktu.
--
-- KENAPA RPC ini perlu ada sama sekali: `audit_logs` dibaca lewat RLS
-- `audit_logs_read USING (is_admin_or_above())` -- diverifikasi ke definisi
-- is_admin_or_above() (`role.code IN ('super_admin','admin')`). Finance dan
-- finance_controller BUKAN admin, jadi mereka TIDAK BISA membaca audit_logs
-- langsung lewat PostgREST -- persis populasi yang paling butuh melihat
-- Riwayat invoice yang mereka kerjakan sendiri. RPC SECURITY DEFINER ini
-- membaca audit_logs lewat gerbangnya sendiri (invoice_dapat_dibaca, SUDAH
-- ADA sejak 20260928000007, dipakai mark_invoice_printed/mark_invoice_emailed)
-- -- bukan gate baru, "siapa boleh lihat Riwayat" = "siapa boleh lihat
-- invoice itu sendiri".
--
-- Baris yang diambil: entity_type='sp_invoices' + entity_id=invoice ITU
-- (AJUKAN_INVOICE/SETUJUI_INVOICE/TOLAK_INVOICE dari berkas 2/3) DIGABUNG
-- entity_type='ar_ttfs' + entity_id = baris ar_ttfs milik invoice itu
-- (KOREKSI_TTF dari berkas 4) -- satu invoice hanya punya nol/satu baris
-- ar_ttfs (LIMIT 1 di mark_ttf_received), jadi subquery ini murah.
--
-- Tidak RAISE untuk pemanggil yang tak berhak -- mengembalikan kosong,
-- konsisten dengan gaya fungsi "list" lain (sp_invoice_readiness_all),
-- berbeda dari fungsi "aksi" yang RAISE.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'invoice_dapat_dibaca'
  ) THEN
    RAISE EXCEPTION 'PALANG: invoice_dapat_dibaca tidak ada -- 20260928000007 belum jalan di DB ini.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_invoice_audit_trail'
  ) THEN
    RAISE EXCEPTION 'PALANG: get_invoice_audit_trail SUDAH ADA -- berkas ini kemungkinan sudah pernah dijalankan.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: invoice_dapat_dibaca ada, get_invoice_audit_trail belum ada.';
END
$palang$;

CREATE OR REPLACE FUNCTION public.get_invoice_audit_trail(p_invoice_id uuid)
RETURNS TABLE (
  id          uuid,
  created_at  timestamptz,
  action      text,
  entity_type text,
  old_data    jsonb,
  new_data    jsonb,
  notes       text,
  actor_name  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT al.id, al.created_at, al.action, al.entity_type, al.old_data, al.new_data, al.notes,
         p.full_name AS actor_name
    FROM audit_logs al
    LEFT JOIN profiles p ON p.id = al.user_id
   WHERE invoice_dapat_dibaca(p_invoice_id)
     AND ( (al.entity_type = 'sp_invoices' AND al.entity_id = p_invoice_id)
        OR (al.entity_type = 'ar_ttfs' AND al.entity_id IN
             (SELECT t.id FROM ar_ttfs t WHERE t.invoice_id = p_invoice_id)) )
   ORDER BY al.created_at;
$fn$;

REVOKE ALL ON FUNCTION public.get_invoice_audit_trail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_invoice_audit_trail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_audit_trail(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_invoice_audit_trail(uuid) IS
  'Riwayat gabungan (approval + koreksi TTF) untuk panel Riwayat Detail Invoice. Gerbang: invoice_dapat_dibaca() -- siapa boleh lihat invoice = siapa boleh lihat Riwayatnya. Perlu ada KARENA audit_logs_read (RLS) dibatasi is_admin_or_above(), yang tidak mencakup finance/finance_controller. AR Tahap 3 bagian kedua, 20260930000006.';

COMMIT;

DO $vpost$
DECLARE v_acl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_invoice_audit_trail' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'V-POST GAGAL: get_invoice_audit_trail tidak ada.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p WHERE p.proname = 'get_invoice_audit_trail' AND p.pronamespace = 'public'::regnamespace;
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL get_invoice_audit_trail salah. ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: get_invoice_audit_trail ada, ACL authenticated-only.';
END
$vpost$;

-- =============================================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.get_invoice_audit_trail(uuid);
--
-- Aman kapan pun -- fungsi baca-saja, nol data ditulis olehnya.
-- =============================================================================
