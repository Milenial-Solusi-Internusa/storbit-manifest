-- =============================================================================
-- 20260930000002_ar_tahap3b_create_invoice_for_sp_approval_gate.sql
-- (AR Tahap 3 bagian kedua, berkas 2 dari 6)
--
-- Memotong create_invoice_for_sp jadi dua tahap: PENGAJUAN (di sini) dan
-- PERSETUJUAN (berkas 3). Sesudah berkas ini, memanggil create_invoice_for_sp
-- (lewat create_invoice, TIDAK disentuh -- pembungkus satu baris) TIDAK LAGI
-- menghasilkan invoice_no atau jurnal -- ia menghasilkan baris
-- `pending_approval` yang menunggu approve_invoice_issue() (berkas 3).
--
-- TIGA objek disunting DALAM SATU berkas karena ketiganya mendefinisikan
-- "SP ini boleh diajukan ulang atau tidak" dan HARUS bergerak bersama:
--   1. sp_invoice_readiness()      -- guard #1, dipakai FE dan RPC
--   2. sp_invoice_readiness_all()  -- daftar kandidat halaman Siap Ditagih
--   3. sp_invoice_one_per_sp       -- UNIQUE INDEX partial, penegak DB-level
--      TERPISAH dari kedua fungsi di atas -- kalau ini tidak ikut diubah,
--      guard aplikasi akan MENGIZINKAN pengajuan ulang tapi INSERT-nya akan
--      GAGAL di index ini, karena index ini masih menganggap 'draft' aktif.
--
-- Basis create_invoice_for_sp: 20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql
-- (versi TERAKHIR yang hidup di staging -- due_date sudah dicabut dari sana).
-- Diff terhadap basis itu (diverifikasi mekanis, lihat V-PRA/V-POST di bawah):
--   - DECLARE: v_entity_code/v_year/v_month_roman/v_seq/v_invoice_no dicabut
--     (penomoran pindah ke approve_invoice_issue, berkas 3)
--   - Guard peran: + OR has_role('finance') (keputusan rapat 24 Sep 2026)
--   - Blok penomoran (SELECT code / increment_document_sequence / CASE bulan
--     romawi / susun v_invoice_no) DICABUT SELURUHNYA
--   - INSERT header: kolom invoice_no dicabut dari daftar kolom & VALUES;
--     status 'issued' -> 'pending_approval'
--   - Ekor fungsi: PERFORM post_invoice_journal(...) + PERFORM
--     sp_recompute_status(...) DICABUT, diganti INSERT INTO audit_logs (aksi
--     AJUKAN_INVOICE) -- keduanya pindah ke approve_invoice_issue
--   - SEGALA sesuatu yang lain (readiness check, rantai termin, hitung
--     invoice_date dari SJ, tax_id, baris item, baris ongkir, hitung total)
--     TIDAK DISENTUH -- byte-identik dengan basis.
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp'
     AND oidvectortypes(p.proargtypes) = 'uuid, date';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp(uuid,date) tidak ada.';
  END IF;
  IF v_def NOT LIKE '%PERFORM post_invoice_journal(v_invoice_id);%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp yang hidup TIDAK memanggil post_invoice_journal langsung -- kemungkinan sudah bukan versi 20260929000008 yang diasumsikan berkas ini (mungkin sudah pernah dijalankan?). Periksa manual sebelum lanjut.';
  END IF;
  IF v_def LIKE '%pending_approval%' THEN
    RAISE EXCEPTION 'PALANG: create_invoice_for_sp SUDAH menyebut pending_approval -- berkas ini kemungkinan sudah pernah dijalankan di DB ini.';
  END IF;
  RAISE NOTICE 'PALANG LOLOS: create_invoice_for_sp adalah versi 20260929000008 (belum disentuh berkas ini).';
END
$palang$;

-- ---------------------------------------------------------------------------
-- V0 -- keadaan SEBELUM.
-- ---------------------------------------------------------------------------
DO $v0$
DECLARE v_def text; v_n_active int;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc
   WHERE proname = 'sp_invoice_readiness' AND pronamespace = 'public'::regnamespace;
  SELECT count(*) INTO v_n_active FROM sp_invoices WHERE status = 'draft' AND deleted_at IS NULL;
  RAISE NOTICE 'V0: sp_invoice_readiness guard #1 memuat %; % baris berstatus draft hari ini (harus 0, belum ada yang pernah ditolak).',
    (CASE WHEN v_def LIKE '%status <> ''void''%' THEN '<> void' ELSE '(bentuk lain)' END), v_n_active;
END
$v0$;

-- ---------------------------------------------------------------------------
-- (1) sp_invoice_readiness -- guard #1: 'draft' (ditolak) tidak lagi
-- dihitung sebagai "invoice aktif". Baris SELEBIHNYA byte-identik dengan
-- 20260927000003.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_invoice_readiness(p_sp_order_id uuid)
RETURNS TABLE (siap boolean, alasan_kode text, alasan_teks text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sp_no     text;
  v_ordered   int;
  v_shipped   int;
  v_sj_belum  text;
  v_dn_count  int;
BEGIN
  SELECT o.sp_no INTO v_sp_no
    FROM sp_orders o WHERE o.id = p_sp_order_id AND o.deleted_at IS NULL;

  IF v_sp_no IS NULL THEN
    RETURN QUERY SELECT false, 'SP_TIDAK_DITEMUKAN', 'SP tidak ditemukan.';
    RETURN;
  END IF;

  -- 1. invoice aktif -- AR Tahap 3 bagian kedua: 'draft' (ditolak) TIDAK
  -- dihitung. Baris draft adalah arsip penolakan, bukan proses aktif; kalau
  -- ia tetap dihitung di sini, SP yang invoice-nya pernah ditolak tidak akan
  -- PERNAH bisa diajukan ulang. 'pending_approval'/'issued'/'submitted'/
  -- 'partial'/'paid' TETAP menghalangi (SP masih punya proses aktif).
  IF EXISTS (SELECT 1 FROM sp_invoices WHERE sp_order_id = p_sp_order_id AND status NOT IN ('draft', 'void')) THEN
    RETURN QUERY SELECT false, 'SUDAH_ADA_INVOICE', 'SP ini sudah punya invoice aktif.';
    RETURN;
  END IF;

  -- 2. terkirim penuh
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  IF v_ordered = 0 OR v_shipped <> v_ordered THEN
    RETURN QUERY SELECT false, 'BELUM_TERKIRIM_PENUH',
      format('SP belum terkirim penuh (Sigma shipped=%s, Sigma qty=%s) - invoice tidak bisa diterbitkan.', v_shipped, v_ordered);
    RETURN;
  END IF;

  -- 3. BTB hidup
  IF NOT EXISTS (SELECT 1 FROM sp_btb b
                  WHERE b.sp_order_id = p_sp_order_id AND b.deleted_at IS NULL) THEN
    RETURN QUERY SELECT false, 'BELUM_ADA_BTB',
      format('SP %s belum punya BTB - invoice tidak bisa diterbitkan. Terbitkan BTB lebih dulu di Detail SP.', v_sp_no);
    RETURN;
  END IF;

  -- 4. Surat Jalan yang belum selesai
  SELECT string_agg(d.do_no || ' (' || d.status || ')', ', ' ORDER BY d.do_no)
    INTO v_sj_belum
    FROM delivery_notes d
   WHERE d.sp_order_id = p_sp_order_id
     AND d.status NOT IN ('delivered','cancelled');
  IF v_sj_belum IS NOT NULL THEN
    RETURN QUERY SELECT false, 'SJ_BELUM_SELESAI',
      format('SP %s masih punya Surat Jalan yang belum selesai: %s. Selesaikan atau batalkan dulu sebelum menerbitkan invoice.', v_sp_no, v_sj_belum);
    RETURN;
  END IF;

  -- 5. Surat Jalan delivered ber-tanggal ditandatangani
  SELECT count(*) INTO v_dn_count FROM delivery_notes
   WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  IF v_dn_count = 0 THEN
    RETURN QUERY SELECT false, 'SJ_TANPA_TANGGAL_TTD',
      'Belum ada Surat Jalan berstatus delivered dengan tanggal ditandatangani untuk SP ini. Kalau Surat Jalannya sudah sampai tapi tanggalnya belum diisi, pakai Lengkapi Tanggal Ditandatangani.';
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'SIAP', 'Siap ditagih.';
END;
$fn$;

REVOKE ALL ON FUNCTION public.sp_invoice_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_invoice_readiness(uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_invoice_readiness(uuid) IS
  'SATU sumber aturan "SP boleh ditagih atau belum". Guard #1 dilonggarkan AR Tahap 3 bagian kedua (20260930000002): draft (ditolak) tidak lagi dihitung sebagai invoice aktif -- lihat sp_invoice_one_per_sp (index) yang HARUS bergerak bersama perubahan ini.';

-- ---------------------------------------------------------------------------
-- (2) sp_invoice_readiness_all -- CTE kandidat, syarat yang SAMA persis
-- dengan guard #1 di atas (pasangan checklist -- kalau salah satu berubah
-- tanpa yang lain, daftar "Siap Ditagih" dan hasil sp_invoice_readiness()
-- akan menyimpang untuk SP yang invoice-nya pernah ditolak).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_invoice_readiness_all(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  sp_order_id  uuid,
  sp_no        text,
  customer_id  uuid,
  sp_date      date,
  n_sj         int,
  n_btb        int,
  siap         boolean,
  alasan_kode  text,
  alasan_teks  text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH kandidat AS (
    SELECT o.id, o.sp_no, o.customer_id, o.sp_date
      FROM sp_orders o
     WHERE o.deleted_at IS NULL
       AND (p_company_id IS NULL OR o.company_id = p_company_id)
       AND NOT EXISTS (
         SELECT 1 FROM sp_invoices i
          WHERE i.sp_order_id = o.id AND i.status NOT IN ('draft', 'void') AND i.deleted_at IS NULL
       )
       AND (SELECT COALESCE(SUM(soi.qty),0) FROM sp_order_items soi WHERE soi.sp_order_id = o.id) > 0
       AND (SELECT COALESCE(SUM(soi.qty),0) FROM sp_order_items soi WHERE soi.sp_order_id = o.id)
         = (SELECT COALESCE(SUM(soi.shipped_qty),0) FROM sp_order_items soi WHERE soi.sp_order_id = o.id)
  )
  SELECT k.id, k.sp_no, k.customer_id, k.sp_date,
         (SELECT count(*)::int FROM delivery_notes d
           WHERE d.sp_order_id = k.id AND d.status <> 'cancelled'),
         (SELECT count(*)::int FROM sp_btb b
           WHERE b.sp_order_id = k.id AND b.deleted_at IS NULL),
         r.siap, r.alasan_kode, r.alasan_teks
    FROM kandidat k
    CROSS JOIN LATERAL public.sp_invoice_readiness(k.id) r
   ORDER BY k.sp_date, k.sp_no;
$fn$;

REVOKE ALL ON FUNCTION public.sp_invoice_readiness_all(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sp_invoice_readiness_all(uuid) TO authenticated;

COMMENT ON FUNCTION public.sp_invoice_readiness_all(uuid) IS
  'Daftar SP terkirim penuh belum ber-invoice, untuk halaman Siap Ditagih. CTE kandidat disamakan dgn guard #1 sp_invoice_readiness() AR Tahap 3 bagian kedua (20260930000002): draft (ditolak) tidak menghalangi.';

-- ---------------------------------------------------------------------------
-- (3) sp_invoice_one_per_sp -- UNIQUE INDEX partial, penegak DB-LEVEL yang
-- TERPISAH dari kedua fungsi di atas. Definisi SEBELUM (diverifikasi
-- pg_indexes / schema_snapshot.sql:13701, lahir 20260923000001):
--
--   CREATE UNIQUE INDEX sp_invoice_one_per_sp ON public.sp_invoices
--     USING btree (sp_order_id) WHERE (status <> 'void'::text);
--
-- Definisi SESUDAH (baris ini):
--
--   CREATE UNIQUE INDEX sp_invoice_one_per_sp ON public.sp_invoices
--     USING btree (sp_order_id) WHERE (status NOT IN ('draft','void'));
--
-- Tanpa perubahan ini, guard aplikasi (poin 1-2 di atas) akan MENGIZINKAN
-- pengajuan ulang untuk SP yang invoice-nya ditolak, tapi INSERT baris baru
-- akan GAGAL di index ini (index masih menganggap baris draft menempati slot
-- sp_order_id itu) -- guard yang longgar bertemu index yang masih ketat,
-- hasilnya error yang membingungkan di detik terakhir alih-alih ditolak rapi
-- lebih awal oleh sp_invoice_readiness().
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.sp_invoice_one_per_sp;
CREATE UNIQUE INDEX sp_invoice_one_per_sp ON public.sp_invoices
  USING btree (sp_order_id) WHERE (status NOT IN ('draft', 'void'));

-- ---------------------------------------------------------------------------
-- (4) create_invoice_for_sp -- dipotong jadi tahap PENGAJUAN saja.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_for_sp(p_sp_order_id uuid, p_invoice_date date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id   uuid; v_customer_id uuid; v_sp_no text;
  v_invoice_date date;
  v_invoice_id   uuid;
  v_total_dpp    numeric(18,2); v_total_ppn numeric(18,2); v_total_amount numeric(18,2);
  v_uid          uuid := auth.uid();
  v_total_ship   numeric(18,2);
  v_override_days int; v_term_days int;
  v_term_label   text;
  v_cust_npwp    text;
  v_acc_rev      uuid; v_acc_ship uuid; v_tax_id uuid;
  v_siap         boolean; v_alasan_kode text; v_alasan_teks text;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mengajukan invoice.';
  END IF;

  SELECT company_id, customer_id, sp_no INTO v_company_id, v_customer_id, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan.'; END IF;

  SELECT r.siap, r.alasan_kode, r.alasan_teks
    INTO v_siap, v_alasan_kode, v_alasan_teks
    FROM public.sp_invoice_readiness(p_sp_order_id) r;

  IF NOT v_siap THEN
    RAISE EXCEPTION '%', v_alasan_teks;
  END IF;

  v_invoice_date := p_invoice_date;
  IF v_invoice_date IS NULL THEN
    SELECT MAX(signed_date) INTO v_invoice_date FROM delivery_notes
     WHERE sp_order_id = p_sp_order_id AND status = 'delivered' AND signed_date IS NOT NULL;
  END IF;

  SELECT invoice_payment_terms_days INTO v_override_days FROM accounts WHERE id = v_customer_id;
  IF v_override_days IS NOT NULL THEN
    v_term_days  := v_override_days;
    v_term_label := 'Override customer';
  ELSE
    SELECT (CASE WHEN pt.is_active THEN pt.days_due ELSE NULL END),
           (CASE WHEN pt.is_active THEN pt.name    ELSE NULL END)
      INTO v_term_days, v_term_label
      FROM entity_finance_settings efs
      LEFT JOIN payment_terms pt ON pt.id = efs.default_payment_term_id
      WHERE efs.company_id = v_company_id;
    IF v_term_days IS NULL THEN
      SELECT default_payment_terms INTO v_term_days FROM entity_finance_settings WHERE company_id = v_company_id;
      v_term_label := 'Default entitas';
    END IF;
    IF v_term_days IS NULL THEN
      v_term_label := 'Bawaan sistem';
    END IF;
    v_term_days := COALESCE(v_term_days, 30);
  END IF;

  SELECT btrim(COALESCE(tax_id, '')) INTO v_cust_npwp FROM accounts WHERE id = v_customer_id;

  -- invoice_no TIDAK diisi di sini -- lahir hanya saat approve_invoice_issue()
  -- (berkas 3). status 'pending_approval', BUKAN 'issued' (AR Tahap 3 bagian
  -- kedua: invoice yang diajukan belum punya nomor dan belum berjurnal).
  INSERT INTO sp_invoices (company_id, sp_order_id, invoice_date, status, created_by,
                           source_type, customer_tax_id, payment_term_days, payment_term_label)
  VALUES (v_company_id, p_sp_order_id, v_invoice_date, 'pending_approval', v_uid,
          'sp_storbit', NULLIF(v_cust_npwp, ''), v_term_days, v_term_label)
  RETURNING id INTO v_invoice_id;

  v_acc_rev := get_mapped_account(v_company_id, 'pendapatan_barang');

  -- Rujukan master pajak. Dicari lewat KODE + TARIF, sama persis dengan
  -- backfill berkas 6 -- kalau master entitas ini tidak punya VAT_FULL bertarif
  -- 0.11, hasilnya NULL dan layar menampilkan tarifnya saja. Nol master bukan
  -- alasan menolak menerbitkan invoice.
  SELECT t.id INTO v_tax_id
    FROM taxes t
   WHERE t.company_id = v_company_id AND t.code = 'VAT_FULL'
     AND t.deleted_at IS NULL AND t.rate = 0.11
   LIMIT 1;

  INSERT INTO sp_invoice_lines (
    invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
    line_type, product_id, product_name, sku, uom, unit_price, line_amount,
    account_id, tax_rate, tax_id)
  SELECT v_invoice_id, i.id,
         (i.unit_price * i.shipped_qty),
         ROUND((i.unit_price * i.shipped_qty + i.shipping_price) * 0.11),
         i.shipped_qty,
         row_number() OVER (ORDER BY i.created_at),
         'item', i.product_id, i.product_name, COALESCE(i.sku, ''),
         COALESCE(NULLIF(btrim(p.unit), ''), NULLIF(btrim(p.uom), ''), ''),
         i.unit_price,
         ROUND(i.unit_price * i.shipped_qty, 2),
         v_acc_rev, 0.11, v_tax_id
    FROM sp_order_items i
    LEFT JOIN products p ON p.id = i.product_id
   WHERE i.sp_order_id = p_sp_order_id;

  SELECT COALESCE(SUM(shipping_price), 0) INTO v_total_ship
    FROM sp_order_items WHERE sp_order_id = p_sp_order_id;

  IF v_total_ship > 0 THEN
    v_acc_ship := get_mapped_account(v_company_id, 'pendapatan_jasa_kirim');
    INSERT INTO sp_invoice_lines (
      invoice_id, sp_order_item_id, dpp, ppn, qty, "position",
      line_type, product_name, sku, uom, unit_price, line_amount,
      account_id, tax_rate, tax_id)
    SELECT v_invoice_id, NULL, 0, 0, 1,
           (SELECT COALESCE(MAX(sl2."position"), 0) + 1 FROM sp_invoice_lines sl2 WHERE sl2.invoice_id = v_invoice_id),
           'shipping', 'Ongkos kirim', '', 'LOT', v_total_ship, v_total_ship,
           v_acc_ship, 0.11, v_tax_id;
  END IF;

  SELECT COALESCE(SUM(dpp), 0), COALESCE(SUM(ppn), 0), COALESCE(SUM(line_amount), 0) + COALESCE(SUM(ppn), 0)
    INTO v_total_dpp, v_total_ppn, v_total_amount
    FROM sp_invoice_lines WHERE invoice_id = v_invoice_id;

  UPDATE sp_invoices
     SET total_dpp = v_total_dpp, total_ppn = v_total_ppn,
         total_amount = v_total_amount, total_amount_currency = v_total_amount
   WHERE id = v_invoice_id;

  -- post_invoice_journal() dan sp_recompute_status() TIDAK dipanggil di sini
  -- lagi -- keduanya pindah ke approve_invoice_issue() (berkas 3), persis
  -- saat invoice_no lahir. Sampai disetujui, nol jurnal, nol perubahan status
  -- SP.
  INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, new_data)
  VALUES (v_uid, v_company_id, 'AJUKAN_INVOICE', 'sp_invoices', v_invoice_id, v_sp_no,
          jsonb_build_object('sp_order_id', p_sp_order_id, 'total_amount', v_total_amount));

  RETURN v_invoice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_sp(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.create_invoice_for_sp(uuid, date) IS
  'Tahap PENGAJUAN saja (AR Tahap 3 bagian kedua, 20260930000002) -- menghasilkan baris pending_approval TANPA invoice_no/jurnal. Penomoran + jurnal pindah ke approve_invoice_issue(). Dipanggil dari create_invoice(uuid,date), TIDAK disentuh.';

COMMIT;

-- ---------------------------------------------------------------------------
-- V-POST
-- ---------------------------------------------------------------------------
DO $vpost$
DECLARE v_def text; v_acl text; v_idx_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp'
     AND oidvectortypes(p.proargtypes) = 'uuid, date';

  IF v_def LIKE '%PERFORM post_invoice_journal%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp MASIH memanggil post_invoice_journal -- seharusnya sudah pindah ke approve_invoice_issue.';
  END IF;
  IF v_def LIKE '%PERFORM sp_recompute_status%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp MASIH memanggil sp_recompute_status.';
  END IF;
  IF v_def NOT LIKE '%''pending_approval''%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: create_invoice_for_sp tidak meng-INSERT status pending_approval.';
  END IF;
  IF v_def NOT LIKE '%has_role(''finance'')%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: guard peran belum memuat has_role(''finance'').';
  END IF;
  IF v_def NOT LIKE '%AJUKAN_INVOICE%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: audit_logs AJUKAN_INVOICE tidak ditemukan di badan fungsi.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_invoice_for_sp'
     AND oidvectortypes(p.proargtypes) = 'uuid, date';
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL create_invoice_for_sp salah. ACL: %', v_acl;
  END IF;

  SELECT pg_get_indexdef(indexrelid) INTO v_idx_def
    FROM pg_index WHERE indexrelid = 'public.sp_invoice_one_per_sp'::regclass;
  IF v_idx_def NOT LIKE '%draft%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: sp_invoice_one_per_sp belum mengecualikan draft. Definisi: %', v_idx_def;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: create_invoice_for_sp = tahap pengajuan saja, ACL benar, index sp_invoice_one_per_sp = %.', v_idx_def;
END
$vpost$;

-- =============================================================================
-- ROLLBACK -- kembalikan create_invoice_for_sp + readiness + index ke bentuk
-- 20260929000008 / 20260927000003 / 20260923000001.
--
--   BEGIN;
--   -- (tempel ulang CREATE OR REPLACE FUNCTION sp_invoice_readiness dari
--   --  20260927000003_journal_account_roles_and_readiness.sql -- guard #1
--   --  kembali "status <> 'void'")
--   -- (tempel ulang sp_invoice_readiness_all dari berkas yang sama)
--   DROP INDEX IF EXISTS public.sp_invoice_one_per_sp;
--   CREATE UNIQUE INDEX sp_invoice_one_per_sp ON public.sp_invoices
--     USING btree (sp_order_id) WHERE (status <> 'void'::text);
--   -- (tempel ulang CREATE OR REPLACE FUNCTION create_invoice_for_sp dari
--   --  20260929000008_ar_tahap3_ttf_tanggal_dan_due_date.sql)
--   REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM PUBLIC;
--   REVOKE ALL ON FUNCTION public.create_invoice_for_sp(uuid, date) FROM anon;
--   GRANT EXECUTE ON FUNCTION public.create_invoice_for_sp(uuid, date) TO authenticated;
--   COMMIT;
--
-- ⚠️ Rollback ini HANYA aman kalau belum ada baris pending_approval hidup
-- (kalau ada, ia akan terbit tanpa jalur approval yang menciptakannya --
-- selesaikan/tolak semua baris pending_approval dulu, baru rollback).
-- =============================================================================
