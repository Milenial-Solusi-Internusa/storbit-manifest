-- STATUS: SUDAH DIJALANKAN 22 Jul 2026, terverifikasi.
-- Bukti pemasangan: ketiga fungsi prosecdef=true, proconfig={search_path=public};
-- ketiga trigger terpasang (pg_trigger: trg_inquiry_quoted->quotations,
-- trg_inquiry_review->prf, trg_inquiry_won->sales_orders).
-- Bukti runtime, tiga uji dengan akun sales asli (Karina), BUKAN super admin:
--   1. INQ/MSI/2026/207 status OPEN -> submit PRF -> jadi IN_REVIEW.
--   2. INQ/MSI/2026/168 status QUOTED -> submit PRF -> TETAP QUOTED, updated_at
--      tidak bergerak. Klausa "hanya naik" terbukti menyaring.
--   3. QUO/MSI/2026/198 ditandai terkirim (quote_sent_at 09:47:42.344) ->
--      INQ/MSI/2026/202 jadi QUOTED (updated_at 09:47:42.490). Selisih 146ms =
--      satu transaksi, bukan kebetulan.
-- Seluruh data uji sudah di-rollback; sebaran kembali ke WON 3 / QUOTED 66 / OPEN 136.
-- Teks fungsi di file ini diambil dari pg_get_functiondef (definisi LIVE), bukan
-- disalin dari catatan. Lihat TD-C.
--
-- FASE 2 langkah 3 dari 3. Prasyarat: 20260722000002 (backup + backfill) dan
-- 20260722000003 (CHECK constraint) sudah jalan lebih dulu.
--
-- Tiga trigger yang menggerakkan sumbu deal per-inquiry. Sebelum ini kolom
-- inquiries.status tidak pernah bergerak setelah insert.
--
-- ── EMPAT CATATAN DESAIN ────────────────────────────────────────────────────
--
-- (1) SECURITY DEFINER mengikuti preseden set_prospect_on_inquiry dan
--     sync_deal_value_on_quotation_accept yang keduanya juga DEFINER. Polanya:
--     trigger yang MENULIS KE TABEL LAIN dibuat DEFINER. Wajib di sini karena
--     pemicu bisa datang dari role procurement, sementara procurement tidak bisa
--     membaca/menulis inquiries (is_manager_or_above tidak memuat procurement —
--     TD-90 yang diperluas). Tanpa DEFINER, trigger PRF akan gagal SENYAP.
--
-- (2) Klausa `AND status IN (...)` di setiap UPDATE adalah pengaman
--     "status hanya naik". Daftarnya BERBEDA per trigger, dan itu disengaja:
--       - review : hanya dari 'OPEN'
--       - quoted : dari 'OPEN' atau 'IN_REVIEW'
--       - won    : dari 'OPEN','IN_REVIEW','QUOTED','NEGOTIATION'
--     Konsekuensinya LOST dan CANCELLED tidak pernah tersentuh trigger — keduanya
--     terminal dan hanya bisa diubah manual.
--
-- (3) trg_inquiry_won hanya AFTER INSERT, tanpa UPDATE. Artinya kalau inquiry_id
--     pada SO diubah belakangan, trigger tidak menyala. Disengaja: yang menandai
--     kemenangan adalah LAHIRNYA SO, bukan penyuntingannya. Batasan lain yang
--     diketahui: kalau SO di-soft-delete, inquiry TETAP WON — konsisten dengan
--     aturan "hanya naik", dan pembatalan setelah menang adalah CANCELLED
--     (manual), bukan penurunan otomatis.
--
-- (4) Fase 2 SENGAJA tidak menyentuh accounts.pipeline_stage sama sekali,
--     sehingga set_customer_on_won yang ada tetap bekerja dan Fase 2 bisa
--     di-rollback bersih. Pemangkasan sumbu lead dan penulisan ulang
--     set_customer_on_won adalah Fase 3.
--
-- ── SATU PENYIMPANGAN SADAR DARI OUTPUT MENTAH ──────────────────────────────
-- pg_get_triggerdef mengeluarkan `EXECUTE FUNCTION
-- set_inquiry_review_on_prf_submit()` TANPA prefix `public.`. Prefix `public.`
-- DITAMBAHKAN pada ketiga CREATE TRIGGER di bawah supaya file ini tidak
-- bergantung pada search_path saat dijalankan. Itu satu-satunya perbedaan dari
-- output mentah; BADAN FUNGSI nol perubahan.

CREATE OR REPLACE FUNCTION public.set_inquiry_quoted_on_quotation_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'SENT'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SENT')
     AND NEW.inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries
    SET status = 'QUOTED', updated_at = now()
    WHERE id = NEW.inquiry_id
      AND deleted_at IS NULL
      AND status IN ('OPEN','IN_REVIEW');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_inquiry_review_on_prf_submit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'SUBMITTED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SUBMITTED')
     AND NEW.inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries
    SET status = 'IN_REVIEW', updated_at = now()
    WHERE id = NEW.inquiry_id
      AND deleted_at IS NULL
      AND status = 'OPEN';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_inquiry_won_on_so()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries
    SET status = 'WON', updated_at = now()
    WHERE id = NEW.inquiry_id
      AND deleted_at IS NULL
      AND status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_inquiry_quoted AFTER INSERT OR UPDATE OF status ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_quoted_on_quotation_sent();

CREATE TRIGGER trg_inquiry_review AFTER INSERT OR UPDATE OF status ON public.prf
FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_review_on_prf_submit();

CREATE TRIGGER trg_inquiry_won AFTER INSERT ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_won_on_so();

-- ─── VERIFIKASI (jalankan TERPISAH setelah migrasi di atas) ───────────────────
-- Fungsi: harus 3 baris, prosecdef=true, proconfig={search_path=public}.
--
--   SELECT p.proname, p.prosecdef, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('set_inquiry_quoted_on_quotation_sent',
--                       'set_inquiry_won_on_so',
--                       'set_inquiry_review_on_prf_submit')
--   ORDER BY p.proname;
--
-- Trigger: harus 3 baris — trg_inquiry_quoted->quotations, trg_inquiry_review->prf,
-- trg_inquiry_won->sales_orders.
--
--   SELECT c.relname AS tabel, t.tgname, pg_get_triggerdef(t.oid) AS definisi
--   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE NOT t.tgisinternal
--     AND t.tgname IN ('trg_inquiry_quoted','trg_inquiry_won','trg_inquiry_review')
--   ORDER BY c.relname;
--
-- ─── ROLLBACK SELURUH FASE 2 ─────────────────────────────────────────────────
-- URUTAN WAJIB: trigger dulu, BARU UPDATE status. Kalau dibalik, UPDATE-nya akan
-- memicu trigger yang masih terpasang.
-- Membatalkan ketiga langkah sekaligus (20260722000002/3/4). Tabel backup
-- inquiries_status_backup_20260722 harus masih ada.
--
--   DROP TRIGGER IF EXISTS trg_inquiry_quoted ON public.quotations;
--   DROP TRIGGER IF EXISTS trg_inquiry_won ON public.sales_orders;
--   DROP TRIGGER IF EXISTS trg_inquiry_review ON public.prf;
--   DROP FUNCTION IF EXISTS public.set_inquiry_quoted_on_quotation_sent();
--   DROP FUNCTION IF EXISTS public.set_inquiry_won_on_so();
--   DROP FUNCTION IF EXISTS public.set_inquiry_review_on_prf_submit();
--   ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_status_check;
--   UPDATE public.inquiries i SET status = b.status
--   FROM inquiries_status_backup_20260722 b WHERE i.id = b.id;
