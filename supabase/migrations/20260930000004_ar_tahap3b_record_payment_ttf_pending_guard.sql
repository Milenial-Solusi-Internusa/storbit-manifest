-- =============================================================================
-- 20260930000004_ar_tahap3b_record_payment_ttf_pending_guard.sql
-- (AR Tahap 3 bagian kedua, berkas 4 dari 6)
--
-- Dua fungsi disentuh, masing-masing untuk DUA alasan yang harus mendarat
-- bersama (Postgres tidak bisa "menambal sebagian" badan fungsi -- setiap
-- CREATE OR REPLACE menulis ulang badan penuh):
--
--   record_payment (basis 20260929000007, v3, signature TIDAK berubah):
--     - guard status TAMBAH cabang 'pending_approval' (status baru dari
--       berkas 1 -- guard lama gaya blocklist [void/draft/issued] akan
--       MELOLOSKAN pending_approval tanpa penambahan ini)
--     - guard peran + has_role('finance') (keputusan rapat 24 Sep 2026)
--
--   mark_ttf_received (basis 20260929000010, TERAKHIR -- koreksi UAT
--   tanggal_menerima isi sekali, signature TIDAK berubah):
--     - guard status TAMBAH cabang 'pending_approval' (alasan sama)
--     - guard peran + has_role('finance')
--     - AUDIT KOREKSI TTF: audit_logs diisi HANYA di cabang UPDATE (mengedit
--       TTF yang SUDAH ADA), HANYA kalau sungguh ada nilai yang berbeda dari
--       sebelumnya (bukan tiap kali Simpan ditekan)
--
-- ⛔ is_manager_or_above() PADA KETIGA FUNGSI (mark_ttf_received di sini,
-- create_invoice_for_sp/submit_invoice di berkas 2) SENGAJA TIDAK disentuh --
-- meloloskan SELURUH role ber-level<=6 lintas departemen adalah perilaku LAMA
-- (sudah begitu sejak 20260817000001), bukan sesuatu yang lahir di PLAN ini,
-- dan mempersempitnya butuh keputusan Den dulu (dicatat TD-297,
-- 08_TECH_DEBT.md).
--
-- Status: BELUM DIJALANKAN DI MANA PUN
-- =============================================================================

BEGIN;

DO $palang$
DECLARE v_def_rp text; v_def_mtr text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def_rp
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_payment'
     AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text, numeric, text';
  IF v_def_rp IS NULL THEN
    RAISE EXCEPTION 'PALANG: record_payment(9 argumen) tidak ada -- 20260929000007 belum jalan di DB ini.';
  END IF;
  IF v_def_rp LIKE '%pending_approval%' THEN
    RAISE EXCEPTION 'PALANG: record_payment SUDAH menyebut pending_approval -- berkas ini kemungkinan sudah pernah dijalankan.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def_mtr
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';
  IF v_def_mtr IS NULL THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received(uuid,text,text,text,date) tidak ada.';
  END IF;
  IF v_def_mtr LIKE '%tanggal_menerima = CURRENT_DATE,%' THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received MASIH menimpa tanggal_menerima -- bukan versi 20260929000010 yang diasumsikan.';
  END IF;
  IF v_def_mtr LIKE '%pending_approval%' THEN
    RAISE EXCEPTION 'PALANG: mark_ttf_received SUDAH menyebut pending_approval -- berkas ini kemungkinan sudah pernah dijalankan.';
  END IF;

  RAISE NOTICE 'PALANG LOLOS: record_payment v3 dan mark_ttf_received (versi 20260929000010) belum menyentuh pending_approval.';
END
$palang$;

-- ---------------------------------------------------------------------------
-- record_payment -- signature TIDAK berubah (9 argumen, sama dengan v3) jadi
-- CREATE OR REPLACE, bukan DROP+CREATE -- ACL diwarisi, diasersi ulang
-- defensif di bawah.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payment(
  p_invoice_id         uuid,
  p_amount             numeric,
  p_payment_date       date DEFAULT CURRENT_DATE,
  p_reference          text DEFAULT NULL::text,
  p_pph                numeric DEFAULT 0,
  p_bukti_potong_url   text DEFAULT NULL::text,
  p_bukti_potong_no    text DEFAULT NULL::text,
  p_potongan_lain      numeric DEFAULT 0,
  p_potongan_keterangan text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_tolerance       CONSTANT numeric := 1;
  v_uid             uuid := auth.uid();
  v_company_id      uuid;
  v_sp_order_id     uuid;
  v_total           numeric(18,2);
  v_inv_status      text;
  v_invoice_no      text;
  v_customer_id     uuid;
  v_sp_no           text;
  v_payment_id      uuid;
  v_settled_sebelum numeric(18,2);
  v_sisa_sebelum    numeric(18,2);
  v_bayar_ini       numeric(18,2);
  v_settled_baru    numeric(18,2);
  v_new_status      text;
  v_je_id           uuid;
  v_acc_bank        uuid;
  v_acc_ar          uuid;
  v_acc_pph         uuid;
  v_acc_potongan    uuid;
BEGIN
  IF NOT (is_super_admin() OR has_role('finance_controller') OR has_role('finance')) THEN
    RAISE EXCEPTION 'Tidak punya izin mencatat pembayaran.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal pembayaran harus lebih besar dari nol.';
  END IF;
  IF COALESCE(p_pph, 0) < 0 THEN
    RAISE EXCEPTION 'PPh tidak boleh negatif.';
  END IF;
  IF COALESCE(p_potongan_lain, 0) < 0 THEN
    RAISE EXCEPTION 'Potongan lain tidak boleh negatif.';
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 AND COALESCE(btrim(p_potongan_keterangan), '') = '' THEN
    RAISE EXCEPTION 'Keterangan potongan wajib diisi kalau ada potongan lain.';
  END IF;

  -- Kunci baris invoice SEBELUM membaca total pembayaran yang sudah ada.
  -- sp_payments NOL GRANT INSERT ke authenticated -- record_payment satu-
  -- satunya jalur tulis -- jadi FOR UPDATE di sini cukup menyerialkan dua
  -- panggilan untuk invoice yang sama: panggilan kedua menunggu sampai yang
  -- pertama commit/rollback, baru membaca SUM(sp_payments) yang sudah
  -- termasuk pembayaran pertama. TD-285.
  SELECT i.company_id, i.sp_order_id, i.total_amount, i.status, i.invoice_no
    INTO v_company_id, v_sp_order_id, v_total, v_inv_status, v_invoice_no
    FROM sp_invoices i
   WHERE i.id = p_invoice_id AND i.deleted_at IS NULL
   FOR UPDATE;

  IF v_company_id IS NULL  THEN RAISE EXCEPTION 'Invoice tidak ditemukan.'; END IF;
  IF v_inv_status = 'void' THEN
    RAISE EXCEPTION 'Invoice sudah void - pembayaran tidak bisa dicatat.';
  END IF;
  IF v_inv_status = 'draft' THEN
    RAISE EXCEPTION 'Invoice masih draft - terbitkan dulu sebelum mencatat pembayaran.';
  END IF;
  IF v_inv_status = 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice masih menunggu persetujuan - belum bisa dicatat pembayarannya.';
  END IF;
  IF v_inv_status = 'issued' THEN
    RAISE EXCEPTION 'Invoice % belum di-submit ke customer - submit dulu sebelum mencatat pembayaran.', COALESCE(v_invoice_no, '(tanpa nomor)');
  END IF;

  SELECT COALESCE(SUM(amount),0) + COALESCE(SUM(pph),0) + COALESCE(SUM(potongan_lain),0)
    INTO v_settled_sebelum
    FROM sp_payments WHERE invoice_id = p_invoice_id;

  v_sisa_sebelum := v_total - v_settled_sebelum;
  v_bayar_ini    := p_amount + COALESCE(p_pph,0) + COALESCE(p_potongan_lain,0);

  -- TD-286: PPh sendirian tidak boleh melebihi sisa tagihan -- diperiksa
  -- LEBIH DULU supaya pesannya menuduh PPh secara spesifik, bukan pesan
  -- umum di bawah. Ini bukan aturan terpisah dari TD-285: kalau PPh sendiri
  -- sudah melebihi sisa, guard total di bawah PASTI juga menolaknya (amount
  -- selalu > 0 menambah lebih jauh) -- guard ini murni supaya PESANNYA lebih
  -- tepat, bukan supaya ada pembatas kedua yang independen.
  IF COALESCE(p_pph,0) > v_sisa_sebelum + c_tolerance THEN
    RAISE EXCEPTION 'PPh 23 (Rp %) melebihi sisa tagihan invoice % (Rp %).',
      p_pph, COALESCE(v_invoice_no,'(tanpa nomor)'), GREATEST(v_sisa_sebelum, 0);
  END IF;

  -- TD-285: total pembayaran (kas + PPh + potongan lain) tidak boleh
  -- melebihi sisa tagihan. Toleransi = c_tolerance, SAMA dengan yang dipakai
  -- menentukan status 'paid' di bawah (TD-294) -- BUKAN angka baru untuk
  -- menutup potongan TTF (~2.900): itu jalur eksplisit p_potongan_lain,
  -- bukan toleransi yang diperlebar.
  IF v_bayar_ini > v_sisa_sebelum + c_tolerance THEN
    RAISE EXCEPTION 'Total pembayaran (Rp %) melebihi sisa tagihan invoice % (Rp %, toleransi Rp %).',
      v_bayar_ini, COALESCE(v_invoice_no,'(tanpa nomor)'), GREATEST(v_sisa_sebelum, 0), c_tolerance;
  END IF;

  -- AKUN lewat PERAN. PPh dan potongan hanya dicari kalau memang dipakai --
  -- pola sama dengan sebelumnya, supaya entitas tanpa peran itu tidak
  -- diblokir untuk pembayaran yang tidak memakainya.
  v_acc_bank := get_mapped_account(v_company_id, 'kas_bank');
  v_acc_ar   := get_mapped_account(v_company_id, 'piutang_usaha');
  IF COALESCE(p_pph, 0) > 0 THEN
    v_acc_pph := get_mapped_account(v_company_id, 'pph23_dibayar_dimuka');
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 THEN
    v_acc_potongan := get_mapped_account(v_company_id, 'potongan_pelanggan');
  END IF;

  INSERT INTO sp_payments
    (invoice_id, payment_date, amount, pph, potongan_lain, potongan_keterangan,
     reference, bukti_potong_url, bukti_potong_no, created_by)
  VALUES
    (p_invoice_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount,
     COALESCE(p_pph, 0), COALESCE(p_potongan_lain, 0), NULLIF(btrim(p_potongan_keterangan), ''),
     p_reference, p_bukti_potong_url, p_bukti_potong_no, v_uid)
  RETURNING id INTO v_payment_id;

  v_settled_baru := v_settled_sebelum + v_bayar_ini;

  v_new_status := CASE
    WHEN v_settled_baru >= (v_total - c_tolerance) THEN 'paid'
    WHEN v_settled_baru > 0                        THEN 'partial'
    ELSE v_inv_status END;

  IF v_new_status IS DISTINCT FROM v_inv_status THEN
    UPDATE sp_invoices SET status = v_new_status, updated_at = now() WHERE id = p_invoice_id;
  END IF;

  INSERT INTO journal_entries
    (company_id, entry_date, reference_type, reference_id, description, created_by)
  VALUES
    (v_company_id, COALESCE(p_payment_date, CURRENT_DATE), 'payment_received', v_payment_id,
     'Penerimaan pembayaran invoice ' || COALESCE(v_invoice_no, '(tanpa nomor)'), v_uid)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_bank, p_amount, 0);
  IF COALESCE(p_pph, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_pph, p_pph, 0);
  END IF;
  IF COALESCE(p_potongan_lain, 0) > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, v_acc_potongan, p_potongan_lain, 0);
  END IF;
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
  VALUES (v_je_id, v_acc_ar, 0, p_amount + COALESCE(p_pph, 0) + COALESCE(p_potongan_lain, 0));

  IF v_new_status = 'paid' THEN
    SELECT customer_id, sp_no INTO v_customer_id, v_sp_no
      FROM sp_orders WHERE id = v_sp_order_id AND deleted_at IS NULL;
    IF v_customer_id IS NOT NULL THEN
      PERFORM sp_recompute_status(v_customer_id, v_sp_no);
    END IF;
  END IF;

  RETURN v_payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.record_payment(uuid, numeric, date, text, numeric, text, text, numeric, text) IS
  'v3 + guard pending_approval + peran finance (AR Tahap 3 bagian kedua, 20260930000004). Badan SELAIN guard byte-identik dengan 20260929000007.';

-- ---------------------------------------------------------------------------
-- mark_ttf_received -- signature TIDAK berubah (5 argumen, sama dengan
-- 20260929000010), CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
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
  v_status        text;
  v_invoice_no    text;
  v_sp_order_id   uuid;
  v_customer_id   uuid;
  v_sp_no         text;
  v_company_id    uuid;
  v_ttf_id        uuid;
  v_ttf_lama      date;
  v_no_ttf_lama   text;
  v_diterima_lama text;
  v_notes_lama    text;
  v_no_ttf_baru   text;
  v_notes_baru    text;
  v_term_days     int;
  v_due_date      date;
BEGIN
  IF NOT (is_super_admin() OR is_manager_or_above() OR has_role('finance_controller') OR has_role('finance')) THEN
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
  IF v_status = 'pending_approval' THEN
    RAISE EXCEPTION 'Invoice masih menunggu persetujuan — TTF hanya bisa dicatat sesudah invoice terbit.';
  END IF;

  SELECT o.customer_id, o.sp_no, o.company_id INTO v_customer_id, v_sp_no, v_company_id
    FROM sp_orders o WHERE o.id = v_sp_order_id AND o.deleted_at IS NULL;

  SELECT t.id, t.tanggal_ttf, t.no_ttf, t.diterima_oleh, t.notes
    INTO v_ttf_id, v_ttf_lama, v_no_ttf_lama, v_diterima_lama, v_notes_lama
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
    v_no_ttf_baru := COALESCE(NULLIF(btrim(p_ttf_no), ''), v_no_ttf_lama);
    v_notes_baru  := COALESCE(NULLIF(btrim(p_notes),  ''), v_notes_lama);

    UPDATE ar_ttfs SET
      tanggal_ttf      = p_ttf_date,
      diterima_oleh    = btrim(p_received_by),
      no_ttf = v_no_ttf_baru,
      notes  = v_notes_baru,
      sp_order_id = COALESCE(sp_order_id, v_sp_order_id),
      customer_id = COALESCE(customer_id, v_customer_id),
      no_inv = CASE WHEN no_inv = '' THEN COALESCE(v_invoice_no, '') ELSE no_inv END,
      no_sp  = CASE WHEN no_sp  = '' THEN COALESCE(v_sp_no, '')      ELSE no_sp  END
     WHERE id = v_ttf_id;

    -- AR Tahap 3 bagian kedua (TASK 3): jejak koreksi TTF, HANYA kalau
    -- sungguh ada yang berubah -- bukan setiap klik Simpan (kelas set_
    -- invoice_tax_info: audit_logs mencatat AKSI, bukan setiap panggilan).
    IF v_ttf_lama IS DISTINCT FROM p_ttf_date
       OR v_no_ttf_lama IS DISTINCT FROM v_no_ttf_baru
       OR v_diterima_lama IS DISTINCT FROM btrim(p_received_by)
       OR v_notes_lama IS DISTINCT FROM v_notes_baru
    THEN
      INSERT INTO audit_logs (user_id, company_id, action, entity_type, entity_id, entity_label, old_data, new_data)
      VALUES (auth.uid(), v_company_id, 'KOREKSI_TTF', 'ar_ttfs', v_ttf_id, v_invoice_no,
              jsonb_build_object('tanggal_ttf', v_ttf_lama, 'no_ttf', v_no_ttf_lama,
                                  'diterima_oleh', v_diterima_lama, 'notes', v_notes_lama),
              jsonb_build_object('tanggal_ttf', p_ttf_date, 'no_ttf', v_no_ttf_baru,
                                  'diterima_oleh', btrim(p_received_by), 'notes', v_notes_baru));
    END IF;
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

REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) TO authenticated;

COMMENT ON FUNCTION public.mark_ttf_received(uuid, text, text, text, date) IS
  'Versi 20260929000010 + guard pending_approval + peran finance + jejak audit_logs KOREKSI_TTF saat baris yang sudah ada diedit (AR Tahap 3 bagian kedua, 20260930000004). is_manager_or_above() TETAP lintas departemen -- lihat TD-297.';

COMMIT;

-- ---------------------------------------------------------------------------
-- V-POST
-- ---------------------------------------------------------------------------
DO $vpost$
DECLARE v_def text; v_acl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_payment'
     AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text, numeric, text';
  IF v_def NOT LIKE '%pending_approval%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment belum memuat guard pending_approval.';
  END IF;
  IF v_def NOT LIKE '%has_role(''finance'')%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: record_payment belum memuat has_role(''finance'').';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_payment'
     AND oidvectortypes(p.proargtypes) = 'uuid, numeric, date, text, numeric, text, text, numeric, text';
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL record_payment salah. ACL: %', v_acl;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';
  IF v_def NOT LIKE '%pending_approval%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: mark_ttf_received belum memuat guard pending_approval.';
  END IF;
  IF v_def NOT LIKE '%has_role(''finance'')%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: mark_ttf_received belum memuat has_role(''finance'').';
  END IF;
  IF v_def NOT LIKE '%KOREKSI_TTF%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: mark_ttf_received belum memuat jejak audit_logs KOREKSI_TTF.';
  END IF;
  IF v_def LIKE '%tanggal_menerima = CURRENT_DATE,%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: mark_ttf_received kembali menimpa tanggal_menerima -- regresi ke bentuk sebelum 20260929000010.';
  END IF;

  SELECT COALESCE(array_to_string(p.proacl::text[], ','), '(null = PUBLIC EXECUTE)') INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_ttf_received'
     AND oidvectortypes(p.proargtypes) = 'uuid, text, text, text, date';
  IF v_acl = '(null = PUBLIC EXECUTE)' OR v_acl LIKE '=%' OR v_acl LIKE '%,=%'
     OR v_acl LIKE 'anon=%' OR v_acl LIKE '%,anon=%' OR v_acl NOT LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'V-POST GAGAL: ACL mark_ttf_received salah. ACL: %', v_acl;
  END IF;

  RAISE NOTICE 'V-POST LOLOS: record_payment + mark_ttf_received memuat guard pending_approval, peran finance, jejak KOREKSI_TTF; ACL keduanya authenticated-only.';
END
$vpost$;

-- =============================================================================
-- ROLLBACK -- tempel ulang kedua fungsi dari badan basisnya:
--   record_payment      <- 20260929000007_ar_tahap3_record_payment_v3.sql
--   mark_ttf_received    <- 20260929000010_ar_tahap3_ttf_tanggal_menerima_isi_sekali.sql
-- lalu REVOKE/GRANT ulang seperti pola di atas. Signature TIDAK berubah pada
-- keduanya, jadi CREATE OR REPLACE cukup.
-- =============================================================================
