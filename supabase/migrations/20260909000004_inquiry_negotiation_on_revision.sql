-- =============================================================================
-- Migration: 20260909000004_inquiry_negotiation_on_revision
-- Phase:     Quotation versioning & approval (4/5) — penulis otomatis NEGOTIATION.
-- Depends:   20260909000003 (revisi lahir dari create_quotation_revision)
--            public.inquiries
-- Status:    LIVE — staging 9 Sep 2026, produksi 9 Sep 2026.
--
-- ⛔⛔ PASANGAN WAJIB DENGAN PENCABUTAN TOMBOL FE "Start Negotiation".
--     Roadmap "PEKERJAAN SETELAH MERGE" #4 + DealDetailPage.jsx:1392-1397.
--     URUTAN DEPLOY MENGIKAT — dan ia KEBALIKAN dari pola drop-kolom:
--       1) migrasi ini LIVE di produksi + diverifikasi
--       2) BARU deploy FE yang mencabut tombolnya
--     Kalau dibalik, ada jendela waktu di mana lajur NEGOTIATION TIDAK
--     TERJANGKAU SAMA SEKALI (nol penulis otomatis, tombol sudah hilang).
--     Sebelum migrasi ini, penulis NEGOTIATION di seluruh sistem HANYA tombol
--     manual itu (DealDetailPage.jsx:872-903).
--
-- PEMICU: REVISI KE-2+ DIKIRIM — bukan saat revisi DIBUAT.
--   ⚠️ Ini KOREKSI atas draft sebelumnya yang memakai AFTER INSERT.
--   Alasan: revisi lahir berstatus DRAFT. Draft yang batal dikirim TIDAK BOLEH
--   memindahkan deal ke NEGOTIATION — deal akan tersangkut di tahap yang tak
--   pernah benar-benar terjadi, dan tak ada jalan mundur otomatis untuk itu.
--   Negosiasi baru nyata ketika penawaran versi berikutnya SAMPAI ke customer.
--
--   Bentuk deteksi transisi DISALIN dari sibling di tabel yang sama,
--   set_inquiry_quoted_on_quotation_sent() (schema_snapshot.sql:3432):
--     NEW.status = 'SENT' AND OLD.status IS DISTINCT FROM 'SENT'
--   Menguji `NEW.status = 'SENT'` SAJA akan menyala ulang di SETIAP update
--   berikutnya pada baris yang kebetulan sedang bernilai SENT.
--
-- `AFTER UPDATE OF status` — bukan `AFTER UPDATE` polos.
--   Sama persis dengan narrowing yang sudah dipakai trg_inquiry_quoted
--   (:12603). Ekuivalen secara logika: predikat transisi di atas hanya bisa
--   benar kalau `status` memang ikut ditulis. Tanpa narrowing, fungsi ini
--   dieksekusi di setiap update ~30 kolom dari save_quotation tanpa guna.
--
-- ⚠️ URUTAN DUA TRIGGER PADA UPDATE YANG SAMA — JANGAN DIUBAH NAMANYA.
--   Saat revisi ke-2 dikirim, DUA trigger menyala pada statement yang sama:
--     trg_inquiry_quoted                    -> OPEN/IN_REVIEW jadi QUOTED
--     trg_z_inquiry_negotiation_on_revision -> QUOTED jadi NEGOTIATION
--   PostgreSQL menjalankan AFTER trigger berurutan ALFABETIS by name.
--   'trg_i...' < 'trg_z...' sehingga QUOTED selalu lebih dulu. Itulah gunanya
--   konvensi prefix trg_z_ di CLAUDE.md. Mengganti nama salah satunya bisa
--   membalik urutan dan mematikan lajur NEGOTIATION secara senyap.
--
-- SECURITY DEFINER — MENGIKUTI set_inquiry_quoted_on_quotation_sent() persis:
--   ia menulis `inquiries`, tabel yang pemanggilnya belum tentu boleh update.
--   (Beda dari kedua RPC di 20260909000003 yang justru INVOKER — dua peran
--   berbeda: RPC dijaga RLS, trigger justru harus menembusnya.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_inquiry_negotiation_on_quotation_revision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Tiga syarat, ketiganya wajib:
  --   (1) status BARU SAJA berpindah menjadi SENT (bukan sekadar bernilai SENT)
  --   (2) ini revisi ke-2 atau lebih  -> bukti negosiasi, bukan penawaran perdana
  --   (3) punya inquiry               -> tanpa itu tak ada yang bisa dinaikkan
  IF NEW.status = 'SENT'
     AND (OLD.status IS DISTINCT FROM 'SENT')
     AND NEW.revision >= 2
     AND NEW.inquiry_id IS NOT NULL THEN

    UPDATE public.inquiries
    SET    status = 'NEGOTIATION', updated_at = now()
    WHERE  id = NEW.inquiry_id
      AND  deleted_at IS NULL
      -- HANYA dari QUOTED. Sengaja SEMPIT, mengikuti keputusan Den
      -- "Mulai Negosiasi HANYA dari QUOTED" (DealDetailPage.jsx:55-58).
      -- WON/LOST/CANCELLED/NEGOTIATION tak tersentuh — trigger ini tidak
      -- boleh memundurkan deal yang sudah tutup, dan tidak boleh menulis
      -- ulang deal yang memang sudah bernegosiasi.
      AND  status = 'QUOTED';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_inquiry_negotiation_on_quotation_revision() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_z_inquiry_negotiation_on_revision ON public.quotations;
CREATE TRIGGER trg_z_inquiry_negotiation_on_revision
  AFTER UPDATE OF status ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inquiry_negotiation_on_quotation_revision();

COMMENT ON FUNCTION public.set_inquiry_negotiation_on_quotation_revision() IS
  'Revisi ke-2+ DIKIRIM (transisi ke SENT) => inquiry QUOTED naik ke NEGOTIATION. Pengganti tombol manual "Start Negotiation" yang dicabut bersamaan dengan migrasi ini. Revisi yang masih DRAFT sengaja TIDAK memicu apa pun.';

-- ─── VERIFIKASI ──────────────────────────────────────────────────────────────
--   -- a. Trigger terpasang dengan event yang BENAR:
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--   WHERE tgrelid='public.quotations'::regclass AND NOT tgisinternal
--   ORDER BY tgname;
--   -- HARUS memuat trg_z_inquiry_negotiation_on_revision dengan
--   -- "AFTER UPDATE OF status" — BUKAN "AFTER INSERT".
--   -- Urutan alfabetis: trg_inquiry_quoted mendahului trg_z_...
--
--   -- b. JALUR UTAMA (staging dulu):
--   --    inquiry QUOTED, quotation SENT rev 1
--   --    1) create_quotation_revision  -> rev 2 DRAFT
--   --       CEK: inquiry MASIH 'QUOTED'  <- inti koreksi migrasi ini
--   --    2) kirim rev 2 (status -> SENT)
--   --       CEK: inquiry jadi 'NEGOTIATION'
--   SELECT status FROM public.inquiries WHERE id='<INQ_ID>'::uuid;
--   SELECT from_status, to_status, changed_at FROM public.inquiry_status_history
--   WHERE inquiry_id='<INQ_ID>'::uuid ORDER BY changed_at DESC LIMIT 3;
--   -- log_inquiry_status_change() (:2509) HARUS menangkapnya otomatis.
--
--   -- c. YANG TIDAK BOLEH MEMICU (masing-masing: inquiry TIDAK berubah):
--   --    - revisi rev 2 dibuat tapi TIDAK PERNAH dikirim (tetap DRAFT)
--   --    - quotation rev 1 dikirim (penawaran perdana -> QUOTED, bukan NEGOTIATION)
--   --    - update apa pun pada rev 2 yang SUDAH SENT (mis. edit catatan)
--   --      -> OLD.status sudah 'SENT', predikat transisi menolak
--   --    - inquiry berstatus WON / LOST / CANCELLED / NEGOTIATION
--
--   -- d. Idempotensi: kirim rev 3 setelah inquiry sudah NEGOTIATION
--   --    -> tetap NEGOTIATION, TIDAK menambah baris inquiry_status_history baru
--   --       (guard `status = 'QUOTED'` menolak, jadi nol UPDATE).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_z_inquiry_negotiation_on_revision ON public.quotations;
--   DROP FUNCTION IF EXISTS public.set_inquiry_negotiation_on_quotation_revision();
--   ⚠️ Rollback ini WAJIB disertai revert FE (tombol "Start Negotiation"
--      dikembalikan). Tanpa itu lajur NEGOTIATION jadi buntu total.
