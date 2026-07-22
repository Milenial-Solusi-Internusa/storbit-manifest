-- STATUS: SUDAH DIJALANKAN 22 Jul 2026. REKAMAN — JANGAN dijalankan ulang.
-- Teks fungsi di file ini diambil dari pg_get_functiondef (definisi LIVE), bukan
-- disalin dari catatan — konvensi sama 20260722000004.
--
-- FASE 3 langkah F3-3. Prasyarat: 20260722000006 dan 20260722000007 sudah jalan.
--
-- Konversi akun jadi customer kini dipicu dari INQUIRY yang menang, bukan dari
-- accounts.pipeline_stage='WON'. Ini pasangan wajib batch 3B-1: begitu frontend
-- berhenti menulis stage WON ke accounts, tak ada lagi yang bisa memicu
-- set_customer_on_won yang lama — konversi otomatis akan mati diam-diam tanpa
-- penggantinya.
--
-- ── EMPAT CATATAN DESAIN ────────────────────────────────────────────────────
--
-- (1) set_customer_on_won LAMA (di accounts) SENGAJA DIBIARKAN HIDUP. Dua jalur
--     berjalan berdampingan selama masa transisi; yang lama baru dicabut di F3-8
--     (batch 3C) setelah pemantauan bersih. TIDAK ADA DROP hari ini.
--
-- (2) SECURITY DEFINER mengikuti preseden set_prospect_on_inquiry dan
--     set_inquiry_won_on_so — polanya: trigger yang MENULIS KE TABEL LAIN dibuat
--     DEFINER. Di sini wajib karena pemicunya bisa datang dari role yang tidak
--     punya hak tulis ke accounts.
--
-- (3) Guard "hanya sekali": pada UPDATE, bila OLD.status sudah 'WON' fungsi
--     langsung RETURN. Menyimpan ulang inquiry yang sudah menang tidak menstempel
--     tanggal konversi baru. Dua COALESCE (became_customer_at, converted_at) juga
--     menjaga timestamp ASLI kalau akunnya pernah dikonversi lebih dulu.
--
-- (4) Akun diambil dari COALESCE(prospect_id, customer_id) — prospect_id
--     didahulukan karena itu kolom yang diisi InquiryFormPage untuk akun
--     pra-customer; customer_id jadi cadangan untuk inquiry milik akun yang sudah
--     customer. NULL keduanya → tidak melakukan apa-apa.
--     Syarat UPDATE juga menuntut akun belum 'customer' dan belum soft-delete,
--     jadi baris yang sudah benar tidak ikut tersentuh (updated_at tidak bergerak).

CREATE OR REPLACE FUNCTION public.set_customer_on_inquiry_won()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account_id uuid;
BEGIN
  IF NEW.status <> 'WON' THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'WON' THEN RETURN NEW; END IF;

  v_account_id := COALESCE(NEW.prospect_id, NEW.customer_id);
  IF v_account_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.accounts
  SET account_status     = 'customer',
      became_customer_at = COALESCE(became_customer_at, now()),
      converted_at       = COALESCE(converted_at, now())
  WHERE id = v_account_id
    AND COALESCE(account_status,'') <> 'customer'
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$function$;

-- Prefix `public.` pada EXECUTE FUNCTION DITAMBAHKAN (pg_get_triggerdef
-- mengeluarkannya tanpa prefix) supaya file ini tidak bergantung search_path saat
-- dijalankan. Itu satu-satunya perbedaan dari output mentah; badan fungsi di atas
-- nol perubahan. Konvensi sama 20260722000004.
CREATE TRIGGER trg_set_customer_on_inquiry_won
AFTER INSERT OR UPDATE ON public.inquiries
FOR EACH ROW EXECUTE FUNCTION public.set_customer_on_inquiry_won();

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
--   SELECT p.proname, p.prosecdef, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.proname='set_customer_on_inquiry_won';
--   -- prosecdef=true, proconfig={search_path=public}
--
--   SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
--   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE NOT t.tgisinternal AND t.tgname='trg_set_customer_on_inquiry_won';
--   -- harus di tabel inquiries, AFTER INSERT OR UPDATE
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Jalur lama (set_customer_on_won di accounts) masih hidup, jadi rollback ini
-- tidak meninggalkan sistem tanpa mekanisme konversi.
--   DROP TRIGGER IF EXISTS trg_set_customer_on_inquiry_won ON public.inquiries;
--   DROP FUNCTION IF EXISTS public.set_customer_on_inquiry_won();
