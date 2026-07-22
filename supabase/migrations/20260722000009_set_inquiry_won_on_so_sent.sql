-- STATUS: SUDAH DIJALANKAN 22 Jul 2026. REKAMAN — JANGAN dijalankan ulang.
-- Teks fungsi diambil dari pg_get_functiondef (definisi LIVE), bukan dari catatan.
--
-- FASE 3 langkah F3-EX1 — LAHIR DI LUAR RENCANA. Urutan asli Fase 3 adalah
-- F3-0a/0b/0c → F3-1 → F3-2 → F3-3 → F3-4; nomor ini dan F3-EX2
-- (20260722000010) adalah koreksi pemicu WON yang muncul saat pengujian, bukan
-- bagian dari urutan itu.
--
-- Menggeser pemicu inquiry WON dari "SO DIBUAT" ke "SO berstatus SENT".
-- Versi lama (20260722000004) menandai WON pada AFTER INSERT sales_orders apa pun
-- — artinya SO yang baru berbentuk DRAFT internal sudah dianggap kemenangan.
-- Yang menandai deal menang adalah SO yang benar-benar DIKIRIM ke customer.
--
-- ── URUTAN WAJIB — JANGAN DIBALIK ───────────────────────────────────────────
--   1. CREATE OR REPLACE FUNCTION  (badan fungsi)
--   2. DROP TRIGGER trg_inquiry_won
--   3. CREATE TRIGGER trg_inquiry_won
-- Triggernya HARUS di-drop dulu, tidak bisa lewat REPLACE: event-nya berubah dari
-- AFTER INSERT menjadi AFTER INSERT OR UPDATE, dan event trigger tidak bisa
-- diubah di tempat. Perubahan event inilah yang membuat SO yang lahir DRAFT lalu
-- BERUBAH jadi SENT tetap tertangkap — dengan AFTER INSERT saja, transisi itu
-- lolos dan inquiry-nya tidak pernah jadi WON.
--
-- ── DUA GUARD YANG DIPERTAHANKAN / DITAMBAH ─────────────────────────────────
-- (1) Klausa `AND status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION')` tetap ada
--     = pengaman "status hanya naik". Konsekuensinya sama seperti sebelumnya: LOST
--     dan CANCELLED tidak pernah tersentuh trigger, keduanya terminal dan hanya
--     bisa diubah manual.
-- (2) BARU: `IF TG_OP='UPDATE' AND OLD.status='SENT' THEN RETURN` — konsekuensi
--     langsung dari event UPDATE. Tanpa ini, setiap penyuntingan SO yang sudah
--     SENT akan menembak UPDATE inquiries lagi.
--
-- Batasan yang diketahui (tidak berubah dari versi lama): kalau SO di-soft-delete,
-- inquiry TETAP WON — konsisten dengan aturan "hanya naik"; pembatalan setelah
-- menang adalah CANCELLED manual, bukan penurunan otomatis.

CREATE OR REPLACE FUNCTION public.set_inquiry_won_on_so()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'SENT' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SENT' THEN RETURN NEW; END IF;
  IF NEW.inquiry_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.inquiries
  SET status = 'WON', updated_at = now()
  WHERE id = NEW.inquiry_id
    AND deleted_at IS NULL
    AND status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION');

  RETURN NEW;
END;
$function$;

DROP TRIGGER trg_inquiry_won ON public.sales_orders;

-- Prefix `public.` pada EXECUTE FUNCTION ditambahkan (lihat catatan yang sama di
-- 20260722000004 dan 20260722000008); selain itu identik output pg_get_triggerdef.
CREATE TRIGGER trg_inquiry_won
AFTER INSERT OR UPDATE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.set_inquiry_won_on_so();

-- ─── VERIFIKASI (jalankan TERPISAH) ──────────────────────────────────────────
--   SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
--   FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE NOT t.tgisinternal AND t.tgname='trg_inquiry_won';
--   -- harus AFTER INSERT OR UPDATE ON sales_orders (bukan AFTER INSERT saja)
--
-- ─── ROLLBACK (kembali ke perilaku 20260722000004) ───────────────────────────
--   DROP TRIGGER IF EXISTS trg_inquiry_won ON public.sales_orders;
--   -- lalu jalankan ulang badan fungsi + CREATE TRIGGER versi lama dari
--   -- 20260722000004 (AFTER INSERT saja, pemicu = SO dibuat).
