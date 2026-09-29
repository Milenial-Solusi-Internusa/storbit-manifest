-- =============================================================================
-- 20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali.sql
-- (AR Tahap 3, koreksi hasil UAT -- sesudah 20260929000008)
--
-- mark_ttf_received: `tanggal_menerima` (kapan TTF PERTAMA KALI dicatat ke
-- Nexus) TIDAK BOLEH ditimpa lagi saat TTF diedit/dikoreksi belakangan.
--
-- KENAPA ADA -- ditemukan saat UAT, bukan dugaan. Cabang UPDATE di
-- 20260929000008 menulis `tanggal_menerima = CURRENT_DATE` SETIAP kali
-- fungsi ini dipanggil -- termasuk saat yang dikoreksi cuma `tanggal_ttf`,
-- No. TTF, atau nama penerima. Kasus nyata: `SOA-INV-VII-2026-0161`, TTF
-- pertama dicatat 16 Jul, lalu satu koreksi apa pun membuat
-- `tanggal_menerima` ikut berubah jadi 29 Sep -- jejak "kapan pertama kali
-- dicatat" hilang, digantikan jejak "kapan terakhir diedit".
--
-- KEPUTUSAN: `tanggal_menerima` diisi SEKALI, hanya di cabang INSERT (TTF
-- pertama kali dicatat). Cabang UPDATE tidak lagi menyentuhnya -- pola
-- "isi sekali" yang sama dengan `set_invoice_tax_info` (20260928000007) dan
-- `signed_date_filled_by` (20260926000001).
--
-- TANDA TANGAN TIDAK BERUBAH -- (uuid, text, text, text, date), sama
-- dengan 20260929000008. CREATE OR REPLACE, BUKAN DROP+CREATE -- gotcha
-- #37 (fungsi BARU bagi Postgres) TIDAK berlaku di sini karena nol
-- parameter berubah; ACL diwarisi otomatis, dan tetap diasersi ulang di
-- V-POST supaya penyimpangan (kalau ada) tidak lolos senyap.
--
-- BERKAS BARU, BUKAN mengedit 20260929000008 -- berkas itu sudah tercatat
-- jalan di staging; mengubah isinya membuat repo berhenti menggambarkan
-- apa yang benar-benar dieksekusi di sana (pola yang sama dipakai untuk
-- berkas 3 AR Tahap 2 dan 20260928000010, `PROGRESS.md` 2026-09-25 & 29).
--
-- DIFF terhadap 20260929000008 -- diverifikasi MEKANIS (`diff`, bukan
-- dibaca sekilas) sebelum berkas ini ditulis: HANYA satu baris hilang dari
-- cabang UPDATE -- "tanggal_menerima = CURRENT_DATE,". Nol baris lain
-- berubah, termasuk cabang INSERT (tetap mengisi `tanggal_menerima` dari
-- `CURRENT_DATE` di sana -- itu memang SEKALI-nya) dan blok hitung
-- `due_date` (tidak disentuh unit kerja ini).
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- V-PRA -- badan hidup harus PERSIS versi 20260929000008 (masih menimpa
-- tanggal_menerima di cabang UPDATE) sebelum diganti. oidvectortypes(proargtypes)
-- untuk cocokkan TIPE -- BUKAN pg_get_function_identity_arguments(), yang
-- ikut mencetak nama parameter dan tidak akan pernah cocok ke string tipe
-- polos (gotcha #44, ditemukan menulis 20260929000007/000008).
-- ---------------------------------------------------------------------------
DO $prapalang$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received(uuid, text, text, text, date) tidak ditemukan -- jalankan 20260929000008 lebih dulu.';
  END IF;
  IF v_def NOT LIKE '%tanggal_menerima = CURRENT_DATE,%' THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received yang hidup TIDAK LAGI menimpa tanggal_menerima di cabang UPDATE -- berkas ini sudah pernah jalan, atau badan berubah dari yang diharapkan. Baca ulang sebelum melanjutkan.';
  END IF;
  IF v_def NOT LIKE '%v_due_date  := p_ttf_date + v_term_days;%' THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received tidak memuat blok hitung due_date dari 20260929000008 -- badan berbeda dari yang diharapkan.';
  END IF;

  RAISE NOTICE 'V-PRA LOLOS: mark_ttf_received masih versi 20260929000008 (menimpa tanggal_menerima setiap UPDATE, blok due_date utuh).';
END
$prapalang$;

CREATE OR REPLACE FUNCTION public.mark_ttf_received(
  p_invoice_id  uuid,
  p_received_by text,
  p_ttf_no      text DEFAULT NULL::text,
  p_notes       text DEFAULT NULL::text,
  p_ttf_date    date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status      text;
  v_invoice_no  text;
  v_sp_order_id uuid;
  v_customer_id uuid;
  v_sp_no       text;
  v_company_id  uuid;
  v_ttf_id      uuid;
  v_ttf_lama    date;
  v_term_days   int;
  v_due_date    date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat penerimaan TTF.';
  END IF;

  IF p_received_by IS NULL OR btrim(p_received_by) = '' THEN
    RAISE EXCEPTION 'Nama penerima wajib diisi.';
  END IF;

  IF p_ttf_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal TTF wajib diisi.';
  END IF;

  SELECT i.status, i.invoice_no, i.sp_order_id
    INTO v_status, v_invoice_no, v_sp_order_id
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL;

  IF v_status IS NULL   THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_status = 'void'  THEN RAISE EXCEPTION 'Invoice sudah void.';      END IF;
  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft — terbitkan dulu sebelum menandai TTF diterima.';
  END IF;

  SELECT o.customer_id, o.sp_no, o.company_id INTO v_customer_id, v_sp_no, v_company_id
    FROM sp_orders o WHERE o.id = v_sp_order_id AND o.deleted_at IS NULL;

  SELECT t.id, t.tanggal_ttf INTO v_ttf_id, v_ttf_lama
    FROM ar_ttfs t
   WHERE t.invoice_id = p_invoice_id
   ORDER BY t.created_at
   LIMIT 1;

  IF v_ttf_id IS NULL THEN
    INSERT INTO ar_ttfs (
      no_ttf, tanggal_ttf, tanggal_menerima, no_inv, no_sp,
      customer_id, notes, sp_order_id, invoice_id, diterima_oleh
    ) VALUES (
      COALESCE(NULLIF(btrim(p_ttf_no), ''), ''),
      p_ttf_date,
      CURRENT_DATE,
      COALESCE(v_invoice_no, ''),
      COALESCE(v_sp_no, ''),
      v_customer_id,
      COALESCE(NULLIF(btrim(p_notes), ''), ''),
      v_sp_order_id,
      p_invoice_id,
      btrim(p_received_by)
    )
    RETURNING id INTO v_ttf_id;
  ELSE
    -- tanggal_menerima SENGAJA TIDAK ADA di sini lagi (AR Tahap 3, koreksi
    -- UAT 20260929000010) -- ia "isi sekali" di cabang INSERT di atas.
    -- Mengedit TTF (tanggal_ttf/No. TTF/nama penerima/catatan) TIDAK boleh
    -- menimpa kapan TTF PERTAMA KALI dicatat.
    UPDATE ar_ttfs SET
      tanggal_ttf      = p_ttf_date,
      diterima_oleh    = btrim(p_received_by),
      no_ttf = COALESCE(NULLIF(btrim(p_ttf_no), ''), no_ttf),
      notes  = COALESCE(NULLIF(btrim(p_notes),  ''), notes),
      sp_order_id = COALESCE(sp_order_id, v_sp_order_id),
      customer_id = COALESCE(customer_id, v_customer_id),
      no_inv = CASE WHEN no_inv = '' THEN COALESCE(v_invoice_no, '') ELSE no_inv END,
      no_sp  = CASE WHEN no_sp  = '' THEN COALESCE(v_sp_no, '')      ELSE no_sp  END
     WHERE id = v_ttf_id;
  END IF;

  -- due_date HANYA lahir dari tanggal_ttf, dan HANYA dihitung ulang kalau
  -- tanggal_ttf sungguh berubah (insert baru -> v_ttf_lama NULL; koreksi
  -- eksplisit -> nilainya beda). Mengedit No. TTF/nama penerima/catatan SAJA
  -- tidak menyentuh due_date. "due_date dihitung sekali lalu permanen"
  -- (rapat 13 Agu 2026) tetap berlaku -- yang berubah cuma PEMICUnya: TTF,
  -- bukan lagi submit/terbit. TIDAK DISENTUH unit kerja ini.
  IF v_ttf_lama IS DISTINCT FROM p_ttf_date THEN
    v_term_days := compute_payment_term_days(v_company_id, v_customer_id);
    v_due_date  := p_ttf_date + v_term_days;
    UPDATE sp_invoices SET due_date = v_due_date, updated_at = now() WHERE id = p_invoice_id;
  END IF;

  RETURN v_ttf_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- ACL -- CREATE OR REPLACE pada signature yang SAMA mewarisi hak yang sudah
-- ada, tapi diasersi ulang di sini defensif (pola yang sama dipakai untuk
-- submit_invoice/create_invoice_for_sp di 20260929000008) supaya penyimpangan
-- kalau ada tidak lolos senyap.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) TO authenticated;

COMMENT ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) IS
  'tanggal_menerima diisi SEKALI (cabang INSERT saja) -- cabang UPDATE tidak lagi menimpanya. Koreksi hasil UAT AR Tahap 3, 20260929000010.';

-- ---------------------------------------------------------------------------
-- V-POST -- badan tidak lagi menimpa tanggal_menerima di UPDATE, cabang
-- INSERT tetap mengisinya, blok due_date utuh, dan ACL tetap authenticated
-- saja (gotcha #40: proacl NULL ATAU entri berawalan '=' sama-sama PUBLIC
-- EXECUTE).
-- ---------------------------------------------------------------------------
DO $vpost$
DECLARE
  v_def text;
  v_acl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';

  IF v_def LIKE '%tanggal_menerima = CURRENT_DATE,%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: mark_ttf_received MASIH menimpa tanggal_menerima di suatu tempat -- seharusnya nol kemunculan pola itu sesudah berkas ini.';
  END IF;
  IF v_def NOT LIKE '%tanggal_menerima, no_inv, no_sp,%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: cabang INSERT kehilangan pengisian tanggal_menerima -- seharusnya TETAP ada, hanya UPDATE yang berubah.';
  END IF;
  IF v_def NOT LIKE '%v_due_date  := p_ttf_date + v_term_days;%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: blok hitung due_date hilang -- diff seharusnya HANYA satu baris tanggal_menerima di UPDATE.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';

  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL mark_ttf_received tidak sesuai (harus authenticated saja, nol PUBLIC/anon). ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: tanggal_menerima nol ditimpa di UPDATE, cabang INSERT + blok due_date utuh, ACL = %.', v_acl;
END
$vpost$;

COMMIT;

-- =============================================================================
-- ROLLBACK -- mengembalikan ke versi 20260929000008 (tanggal_menerima
-- ditimpa tiap UPDATE). Badan LENGKAP ada di berkas itu sendiri. Urutan:
--
--   BEGIN;
--   -- (tempel ulang CREATE FUNCTION mark_ttf_received(...) dari
--   --  20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql -- badan
--   --  DROP FUNCTION tidak perlu diulang, signature sama)
--   REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM PUBLIC;
--   REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM anon;
--   GRANT EXECUTE ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) TO authenticated;
--   COMMIT;
--
-- ⚠️ Rollback ini mengembalikan bug "tanggal_menerima tertimpa saat edit" --
-- hanya lakukan kalau memang ada yang patah dan perlu dibalik SEMENTARA.
-- =============================================================================
