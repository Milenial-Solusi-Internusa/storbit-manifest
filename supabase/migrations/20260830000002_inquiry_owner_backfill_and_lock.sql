-- =============================================================================
-- Migration: 20260830000002_inquiry_owner_backfill_and_lock
-- Batch:     CRM v3 — Batch Dashboard, kepemilikan deal
-- Depends:   inquiries (kolom owner_id, migrasi 20260827000001 STEP 6)
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- ISI (URUTANNYA MENGIKAT — lihat peringatan di bawah)
--   BAGIAN A. Backfill owner_id = created_by untuk baris yang masih NULL
--   BAGIAN B. Trigger pengunci owner_id sesudah status closed
--
-- ⚠️⚠️ URUTAN TIDAK BOLEH DIBALIK. Kalau trigger BAGIAN B dipasang LEBIH DULU,
--   backfill BAGIAN A akan menabraknya: banyak inquiry ber-owner_id NULL sudah
--   berstatus WON/LOST/CANCELLED, dan trigger itu akan RAISE EXCEPTION pada
--   baris pertama semacam itu — seluruh UPDATE ter-rollback dan backfill-nya
--   gagal total. Jalankan A sampai tuntas, baru B.
--
-- KEPUTUSAN PRODUK (Den, 30 Agu 2026)
--   • Pemilik deal = pembuat inquiry (created_by) saat dibuat.
--   • Boleh dipindahtangankan SELAMA status masih di Pipeline
--     (OPEN / IN_REVIEW / QUOTED / NEGOTIATION).
--   • TERKUNCI begitu status masuk closed mana pun — WON, LOST, ATAU CANCELLED
--     (bukan hanya WON) — demi menjaga Sales Performance & Win Rate historis.
--   • Data lama ber-owner_id NULL di-backfill dari created_by, bukan dibiarkan.
--
-- ADITIF — tidak menyentuh 4 trigger yang sudah ada. Sudah diverifikasi dengan
--   membaca badan fungsinya masing-masing:
--     - trg_inquiry_review  → ON public.prf           (set_inquiry_review_on_prf_submit)
--     - trg_inquiry_quoted  → ON public.quotations    (set_inquiry_quoted_on_quotation_sent)
--     - trg_inquiry_won     → ON public.sales_orders  (set_inquiry_won_on_so)
--     - trg_set_customer_on_inquiry_won → AFTER INSERT OR UPDATE ON inquiries
--   Tiga yang pertama duduk di TABEL LAIN dan hanya menulis `inquiries.status`;
--   yang keempat AFTER, jadi berjalan sesudah trigger BEFORE ini dan tak saling
--   menimpa. Tak satu pun menyentuh `owner_id`, jadi tak ada yang bisa tersandung
--   penjaga ini. Prefix `trg_z_` mengikuti aturan urutan trigger di CLAUDE.md.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- PRA-CEK — jalankan DULU, catat angkanya untuk dibandingkan sesudah BAGIAN A
-- ═════════════════════════════════════════════════════════════════════════════
-- SELECT
--   COUNT(*) FILTER (WHERE owner_id IS NULL)                            AS owner_null_total,
--   COUNT(*) FILTER (WHERE owner_id IS NULL AND created_by IS NOT NULL) AS bisa_dibackfill,
--   COUNT(*) FILTER (WHERE owner_id IS NULL AND created_by IS NULL)     AS tak_bisa_dibackfill
-- FROM public.inquiries;
--
--   `tak_bisa_dibackfill` akan TETAP NULL sesudah migrasi ini — tak ada nilai
--   yang bisa disalin. Itu bukan kegagalan; baris begitu memang tak punya jejak
--   pembuat. Di Dashboard ia muncul sebagai "Tanpa Pemilik".


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN A — BACKFILL  (jalankan SEBELUM Bagian B)
-- ═════════════════════════════════════════════════════════════════════════════
-- Idempoten lewat kondisi WHERE-nya sendiri: begitu terisi, baris itu tak lagi
-- masuk kriteria. Aman dijalankan berulang.
--
-- Baris soft-deleted (deleted_at IS NOT NULL) SENGAJA IKUT di-backfill:
-- membiarkannya NULL berarti kalau kelak dipulihkan ia lahir kembali dalam
-- keadaan tak konsisten, dan tak ada ruginya mengisi kolom atribusi pada baris
-- yang memang tak tampil di mana-mana.
UPDATE public.inquiries
SET owner_id = created_by
WHERE owner_id IS NULL
  AND created_by IS NOT NULL;

-- VERIFIKASI BAGIAN A — `bisa_dibackfill` HARUS 0 sekarang:
-- SELECT
--   COUNT(*) FILTER (WHERE owner_id IS NULL AND created_by IS NOT NULL) AS bisa_dibackfill,
--   COUNT(*) FILTER (WHERE owner_id IS NULL AND created_by IS NULL)     AS sisa_tanpa_pembuat
-- FROM public.inquiries;


-- ═════════════════════════════════════════════════════════════════════════════
-- BAGIAN B — PENGUNCI owner_id SESUDAH STATUS CLOSED
-- ═════════════════════════════════════════════════════════════════════════════
-- RAISE EXCEPTION, BUKAN diam-diam mengembalikan nilai lama. Membatalkan
-- perubahan secara senyap (mis. `NEW.owner_id := OLD.owner_id; RETURN NEW;`)
-- akan membuat UPDATE terlihat BERHASIL dari sisi klien padahal tidak terjadi
-- apa-apa — persis kelas kegagalan senyap yang baru dibereskan di batch
-- Dashboard. Penolakan harus berisik.
CREATE OR REPLACE FUNCTION public.lock_inquiry_owner_when_closed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND OLD.status IN ('WON', 'LOST', 'CANCELLED') THEN
    RAISE EXCEPTION
      'Pemilik deal terkunci: inquiry % sudah berstatus %. Kepemilikan tidak bisa dipindahkan setelah deal ditutup, demi menjaga angka Sales Performance dan Win Rate historis tetap utuh.',
      COALESCE(OLD.inquiry_no, OLD.id::text), OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lock_inquiry_owner_when_closed() IS
  'Menolak perubahan inquiries.owner_id ketika status LAMA sudah WON/LOST/CANCELLED. Sengaja RAISE EXCEPTION, bukan silent revert. Dipasang oleh migrasi 20260830000002.';

-- `BEFORE UPDATE OF owner_id` menyempitkan pemicu ke statement yang memang
-- menyebut kolom itu; pemeriksaan IS DISTINCT FROM di dalam fungsi menutup sisa
-- kasusnya (UPDATE yang menyebut owner_id dengan nilai yang sama → lolos).
-- Konsekuensinya UPDATE status dari ketiga trigger lintas-tabel di atas tidak
-- pernah membangunkan penjaga ini sama sekali.
DROP TRIGGER IF EXISTS trg_z_lock_inquiry_owner ON public.inquiries;
CREATE TRIGGER trg_z_lock_inquiry_owner
  BEFORE UPDATE OF owner_id ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_inquiry_owner_when_closed();


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI BAGIAN B — jalankan SESUDAHNYA
-- ═════════════════════════════════════════════════════════════════════════════
-- 1) Trigger terpasang?
-- SELECT tgname, pg_get_triggerdef(oid)
-- FROM pg_trigger
-- WHERE tgrelid = 'public.inquiries'::regclass AND NOT tgisinternal
-- ORDER BY tgname;
--
-- 2) UJI NEGATIF — HARUS GAGAL dengan pesan di atas.
--    Ambil satu inquiry yang sudah closed, lalu coba ubah pemiliknya:
-- DO $$
-- DECLARE v_id uuid; v_owner uuid;
-- BEGIN
--   SELECT id, owner_id INTO v_id, v_owner
--   FROM public.inquiries
--   WHERE status IN ('WON','LOST','CANCELLED') LIMIT 1;
--   IF v_id IS NULL THEN RAISE NOTICE 'Tak ada inquiry closed untuk diuji.'; RETURN; END IF;
--   UPDATE public.inquiries SET owner_id = gen_random_uuid() WHERE id = v_id;   -- HARUS meledak
--   RAISE WARNING 'TIDAK MELEDAK — trigger tidak bekerja, periksa pemasangannya.';
-- END $$;
--
-- 3) UJI POSITIF — HARUS BERHASIL (deal masih terbuka, owner diset ke dirinya sendiri):
-- UPDATE public.inquiries SET owner_id = owner_id
-- WHERE status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION') LIMIT 1;
--
-- ⚠️ Penguncian ini BERLAKU UNTUK SEMUA, super_admin sekalipun — memang
--    disengaja: ini penjaga integritas angka historis, bukan aturan izin.
--    Kalau suatu saat sebuah baris benar-benar harus dikoreksi, matikan
--    triggernya secara sadar, perbaiki, lalu pasang lagi:
--      ALTER TABLE public.inquiries DISABLE TRIGGER trg_z_lock_inquiry_owner;
--      -- ... koreksi manual di sini ...
--      ALTER TABLE public.inquiries ENABLE  TRIGGER trg_z_lock_inquiry_owner;
--
-- ROLLBACK penuh migrasi ini:
--   DROP TRIGGER IF EXISTS trg_z_lock_inquiry_owner ON public.inquiries;
--   DROP FUNCTION IF EXISTS public.lock_inquiry_owner_when_closed();
--   -- Backfill BAGIAN A tidak dibalik: mengembalikan owner_id ke NULL akan
--   -- menghapus atribusi yang mungkin sudah dipakai laporan.
