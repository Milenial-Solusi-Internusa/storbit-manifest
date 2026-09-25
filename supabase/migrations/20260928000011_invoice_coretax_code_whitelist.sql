-- =============================================================================
-- 20260928000011_invoice_coretax_code_whitelist.sql (Invoice lengkap, berkas 11)
--
-- `set_invoice_tax_info` menolak kode transaksi Coretax di luar daftar 01..10.
--
-- KENAPA ADA. Sampai berkas 10, kode Coretax adalah isian BEBAS: apa pun yang
-- diketik masuk, termasuk salah ketik yang baru ketahuan berbulan-bulan
-- kemudian saat dicocokkan ke Faktur Pajak. FE kini memakai dropdown daftar
-- tetap, tapi dropdown adalah kenyamanan, bukan penjagaan -- RPC ini bisa
-- dipanggil langsung.
--
-- ⭐ YANG DIPERIKSA HANYA KODE-nya, BUKAN KALIMAT KETERANGANNYA.
--   Bentuk yang diterima: '[NN] ...' dengan NN salah satu dari 01..10.
--   Kata-kata sesudahnya dibiarkan apa adanya.
--
--   Itu keputusan sadar, bukan kelonggaran: keterangan tiap kode MASIH
--   menunggu konfirmasi Finance (09_ROADMAP.md, Pertanyaan untuk Finance).
--   Kalau kalimatnya ikut divalidasi, setiap koreksi kata dari Finance akan
--   menolak nilai yang sudah tersimpan -- dan yang mengikat secara pajak
--   memang kodenya, bukan kalimatnya.
--
-- ⛔ KEMBARAN YANG WAJIB BERGERAK BERSAMA (kelas checklist TD-233):
--   himpunan kode di sini <-> CORETAX_TX_CODES di src/lib/taxConstants.js.
--   Menambah/menghapus BARIS = sentuh keduanya. Mengubah KALIMAT = FE saja.
--
-- SIFAT: satu CREATE OR REPLACE. Nol kolom, nol tabel, nol izin berubah.
--   Badan fungsinya disalin dari 20260928000007 (versi yang LIVE) dan HANYA
--   ditambahi satu blok validasi -- selebihnya identik.
--
-- ⚠️ TIDAK RETROAKTIF. Baris `coretax_tx_code` yang sudah tersimpan tidak
--   divalidasi ulang dan tidak diubah. Fungsinya "isi sekali", jadi nilai lama
--   memang tidak akan lewat sini lagi. V2 di bawah MENGHITUNG berapa baris
--   lama yang di luar daftar -- sebagai kabar, bukan sebagai kegagalan.
--
-- Status: LIVE DI STAGING (25 Sep 2026) -- BELUM DIJALANKAN DI PRODUCTION
--         (12_ANTREAN_MIGRASI_PRODUCTION.md butir 26)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_invoice_tax_info(
  p_invoice_id       uuid,
  p_faktur_no        text DEFAULT NULL,
  p_coretax_tx_code  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_super boolean := is_super_admin();
  v_co uuid; v_no text; v_status text;
  v_faktur_lama text; v_coretax_lama text;
  v_faktur_baru text; v_coretax_baru text;
  v_kode text;
  v_n int;
BEGIN
  IF NOT (v_super OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mengisi data pajak invoice. Hanya Finance, Finance Controller, atau Super Admin.';
  END IF;

  SELECT company_id, invoice_no, status, faktur_no, coretax_tx_code
    INTO v_co, v_no, v_status, v_faktur_lama, v_coretax_lama
    FROM sp_invoices WHERE id = p_invoice_id AND deleted_at IS NULL;
  IF v_co IS NULL THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;

  IF NOT invoice_dapat_dibaca(p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice ini bukan milik entitas tempat kamu punya peran.';
  END IF;

  IF v_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void -- data pajaknya tidak bisa diubah.';
  END IF;

  v_faktur_baru  := NULLIF(btrim(COALESCE(p_faktur_no, '')), '');
  v_coretax_baru := NULLIF(btrim(COALESCE(p_coretax_tx_code, '')), '');

  IF v_faktur_baru IS NULL AND v_coretax_baru IS NULL THEN
    RAISE EXCEPTION 'Tidak ada yang diisi: kirim nomor Faktur Pajak, kode Coretax, atau keduanya.';
  END IF;

  -- ── BARU di berkas 11: kode Coretax harus dari daftar 01..10 ───────────────
  -- Kodenya diambil dari '[NN]' di awal, lalu diuji ke himpunan. Kalimat
  -- sesudahnya SENGAJA tidak diperiksa (lihat kepala berkas).
  --
  -- ⚠️ `substring` dipakai, BUKAN `LIKE '[0-9][0-9]%'` -- di SQL, kurung siku
  -- bukan kelas karakter, jadi pola itu akan mencari kurung siku harfiah dan
  -- lolos untuk '[99] apa pun'. Kegagalannya akan senyap.
  IF v_coretax_baru IS NOT NULL THEN
    v_kode := substring(v_coretax_baru from '^\[([0-9]{2})\]');
    IF v_kode IS NULL OR v_kode NOT IN ('01','02','03','04','05','06','07','08','09','10') THEN
      RAISE EXCEPTION 'Kode transaksi Coretax "%" tidak dikenali. Pilih salah satu dari daftar 01 sampai 10.', v_coretax_baru;
    END IF;
  END IF;
  -- ──────────────────────────────────────────────────────────────────────────

  -- ISI SEKALI. Mengubah yang sudah terisi hanya super_admin.
  IF v_faktur_baru IS NOT NULL AND v_faktur_lama IS NOT NULL
     AND v_faktur_lama <> v_faktur_baru AND NOT v_super THEN
    RAISE EXCEPTION 'Nomor Faktur Pajak sudah terisi (%). Hanya Super Admin yang boleh mengubahnya.', v_faktur_lama;
  END IF;
  IF v_coretax_baru IS NOT NULL AND v_coretax_lama IS NOT NULL
     AND v_coretax_lama <> v_coretax_baru AND NOT v_super THEN
    RAISE EXCEPTION 'Kode transaksi Coretax sudah terisi (%). Hanya Super Admin yang boleh mengubahnya.', v_coretax_lama;
  END IF;

  -- Syarat "isi sekali" DIULANG di WHERE: dua panggilan berbarengan tidak
  -- boleh sama-sama lolos IF di atas (pola set_delivery_signed_date).
  UPDATE sp_invoices
     SET faktur_no       = COALESCE(v_faktur_baru, faktur_no),
         coretax_tx_code = COALESCE(v_coretax_baru, coretax_tx_code),
         updated_at      = now()
   WHERE id = p_invoice_id
     AND deleted_at IS NULL
     AND status <> 'void'
     AND (v_super
          OR ((v_faktur_baru  IS NULL OR faktur_no       IS NULL OR faktur_no       = v_faktur_baru)
          AND (v_coretax_baru IS NULL OR coretax_tx_code IS NULL OR coretax_tx_code = v_coretax_baru)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Data pajak tidak jadi diubah -- kemungkinan diisi orang lain lebih dulu. Muat ulang halamannya.';
  END IF;

  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data)
  VALUES (v_uid, v_co, 'SET_INVOICE_TAX_INFO', 'sp_invoices', p_invoice_id, v_no,
          jsonb_build_object('faktur_no', v_faktur_lama, 'coretax_tx_code', v_coretax_lama),
          jsonb_build_object('faktur_no', COALESCE(v_faktur_baru, v_faktur_lama),
                             'coretax_tx_code', COALESCE(v_coretax_baru, v_coretax_lama)));
END;
$function$;

-- Izin TIDAK berubah; ditegaskan ulang supaya CREATE OR REPLACE di lingkungan
-- yang belum pernah menjalankan berkas 7 tidak meninggalkan fungsi ber-PUBLIC.
REVOKE ALL ON FUNCTION public.set_invoice_tax_info(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_invoice_tax_info(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- V1 -- fungsinya terpasang, dan ACL-nya tetap seperti semula.
-- ---------------------------------------------------------------------------
DO $v1$
DECLARE v_pub int; v_auth int; v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='set_invoice_tax_info';
  IF v_src IS NULL THEN RAISE EXCEPTION 'V1a GAGAL: set_invoice_tax_info tidak ada.'; END IF;
  IF position('tidak dikenali' in v_src) = 0 THEN
    RAISE EXCEPTION 'V1a GAGAL: badan fungsi tidak memuat validasi kode Coretax.';
  END IF;

  SELECT count(*) INTO v_pub FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='set_invoice_tax_info'
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  IF v_pub <> 0 THEN RAISE EXCEPTION 'V1b GAGAL: masih ber-PUBLIC EXECUTE.'; END IF;

  -- PEMBANDING: tanpa ini, V1b lolos juga kalau EXECUTE-nya hilang untuk semua.
  SELECT count(*) INTO v_auth FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='set_invoice_tax_info'
     AND EXISTS (SELECT 1 FROM unnest(p.proacl) a
                  WHERE a::text LIKE 'authenticated=%' AND split_part(a::text,'=',2) LIKE '%X%');
  IF v_auth <> 1 THEN RAISE EXCEPTION 'V1c GAGAL: authenticated tidak punya EXECUTE.'; END IF;

  RAISE NOTICE 'V1 LOLOS: validasi terpasang, 0 PUBLIC EXECUTE, authenticated ber-EXECUTE.';
END
$v1$;

-- ---------------------------------------------------------------------------
-- V2 -- KABAR, bukan gerbang: berapa baris LAMA yang di luar daftar.
-- Migrasi ini tidak retroaktif, jadi angka > 0 bukan kegagalan; ia daftar
-- kerja untuk Finance, dan lebih baik dicetak sekarang daripada ditemukan
-- saat rekonsiliasi Faktur Pajak.
-- ---------------------------------------------------------------------------
DO $v2$
DECLARE v_total int; v_aneh int; r record;
BEGIN
  SELECT count(*) INTO v_total FROM sp_invoices
   WHERE coretax_tx_code IS NOT NULL AND deleted_at IS NULL;
  SELECT count(*) INTO v_aneh FROM sp_invoices
   WHERE coretax_tx_code IS NOT NULL AND deleted_at IS NULL
     AND COALESCE(substring(coretax_tx_code from '^\[([0-9]{2})\]'), '')
         NOT IN ('01','02','03','04','05','06','07','08','09','10');

  RAISE NOTICE 'V2: % invoice hidup punya kode Coretax, % di antaranya di luar daftar 01..10.', v_total, v_aneh;
  IF v_aneh > 0 THEN
    FOR r IN SELECT invoice_no, coretax_tx_code FROM sp_invoices
              WHERE coretax_tx_code IS NOT NULL AND deleted_at IS NULL
                AND COALESCE(substring(coretax_tx_code from '^\[([0-9]{2})\]'), '')
                    NOT IN ('01','02','03','04','05','06','07','08','09','10')
              ORDER BY invoice_no LIMIT 20
    LOOP
      RAISE NOTICE 'V2   di luar daftar: % -> "%"', r.invoice_no, r.coretax_tx_code;
    END LOOP;
  END IF;
END
$v2$;

COMMIT;

-- =============================================================================
-- ROLLBACK: jalankan ulang blok CREATE OR REPLACE set_invoice_tax_info dari
--   supabase/migrations/20260928000007_invoice_post_issue_rpcs.sql
--   (versi tanpa blok validasi). Nol data yang perlu dibalik -- berkas ini
--   tidak pernah menyentuh satu baris pun.
-- =============================================================================
