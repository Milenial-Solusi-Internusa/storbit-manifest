-- ============================================================================
-- REKAMAN — BUKAN UNTUK DIJALANKAN LAGI
-- Lifecycle-split FASE 2 — backfill + trigger gerbang + default kolom + CHECK
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-18.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    SQL di bawah SUDAH LIVE di production (dijalankan manual di Supabase SQL
--    Editor, 2026-07-18, byte-exact dari yang dijalankan). File ini merekam SQL
--    asli agar tercatat & reproducible. JANGAN jalankan ulang, JANGAN ubah,
--    JANGAN "perbaiki". Urutan (a)→(d) JANGAN diubah.
--
-- TERVERIFIKASI setelah eksekusi (bukan hanya "Success"):
--    via pg_proc (fungsi set_prospect_on_inquiry), pg_trigger
--    (trg_set_prospect_on_inquiry), pg_constraint (accounts_account_status_check).
--
-- KONTEKS: Memisahkan account_status jadi sumbu LIFECYCLE murni. Kosakata final
--    account_status = lead/mql/sql/prospect/customer/free_agent/lost. Nilai lama
--    'lead_pool' DIHAPUS dari kosakata (penanda parkir kini = is_in_lead_pool).
--    Aturan bisnis: akun hanya jadi 'prospect' kalau ada inquiry masuk — inquiry
--    adalah gerbangnya; promosi lead/mql/sql → prospect ditangani TRIGGER DB
--    (bukan kode FE). Lihat PREFLIGHT_LIFECYCLE.md + TD-91.
--
-- HASIL BACKFILL (sebelum pembersihan data tes):
--    lead 643, mql 182, sql 112, prospect 93, customer 42, lost 8.
--
-- BACKUP: diambil ke public.accounts_lifecycle_backup_20260718 (1089 baris)
--    sebelum backfill.
--
-- ⚠️ PRASYARAT URUTAN DEPLOY: kode FE + Edge Function aging-pipeline HARUS
--    ter-deploy LEBIH DULU sebelum SQL ini dijalankan — EF lama menulis
--    account_status='lead_pool', nilai yang kini DITOLAK oleh CHECK constraint
--    (d). Menjalankan CHECK sebelum EF baru ter-deploy = aging-pipeline error.
--
-- CATATAN: dollar-quote BERNAMA ($fn$) dipakai SENGAJA di (b), jangan diganti
--    $$ polos.
-- ============================================================================

-- (a) BACKFILL LIFECYCLE
UPDATE public.accounts a
SET account_status = CASE
  WHEN a.account_status IN ('customer','free_agent') THEN a.account_status
  WHEN a.account_status = 'lost' OR a.pipeline_stage = 'LOST' THEN 'lost'
  WHEN EXISTS (
    SELECT 1 FROM public.inquiries q
    WHERE q.deleted_at IS NULL
      AND (q.prospect_id = a.id OR q.customer_id = a.id)
  ) THEN 'prospect'
  WHEN a.pipeline_stage = 'NEW' THEN 'lead'
  WHEN a.pipeline_stage = 'CONTACTED' THEN 'mql'
  ELSE 'sql'
END
WHERE a.deleted_at IS NULL;

-- (b) TRIGGER GERBANG — inquiry masuk menaikkan lead/mql/sql → prospect
CREATE OR REPLACE FUNCTION public.set_prospect_on_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.accounts
  SET account_status = 'prospect'
  WHERE id = COALESCE(NEW.prospect_id, NEW.customer_id)
    AND account_status IN ('lead','mql','sql');
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_set_prospect_on_inquiry
AFTER INSERT ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.set_prospect_on_inquiry();

-- (c) DEFAULT KOLOM — akun baru lahir sebagai 'lead'
ALTER TABLE public.accounts
  ALTER COLUMN account_status SET DEFAULT 'lead';

-- (d) CHECK CONSTRAINT — kunci kosakata lifecycle (7 nilai)
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_account_status_check
  CHECK (account_status IN
    ('lead','mql','sql','prospect','customer','free_agent','lost'));
