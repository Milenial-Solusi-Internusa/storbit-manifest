-- =============================================================================
-- 07-fixture-invoice-v2.sql -- fixture untuk kolom invoice lengkap (20260928*)
--
-- Seed 01-05 sudah menerbitkan 22 invoice lewat create_invoice_for_sp, jadi
-- SELURUH kolom yang diisi SAAT TERBIT (NPWP, termin, snapshot produk, baris
-- ongkir, akun per baris) sudah terisi tanpa berkas ini -- dan V12 mengujinya.
--
-- Yang DIISI DI SINI hanya kolom kelas (c): yang memang baru ada SESUDAH
-- invoice terbit, dan hanya lewat RPC berjejak. Tanpa fixture ini kolom-kolom
-- itu nol baris di seluruh seed, dan tab "Info Lain" / "Pajak & Coretax" /
-- "Lampiran & Catatan" tidak punya apa pun untuk ditampilkan saat UAT.
--
-- SELURUHNYA lewat RPC resmi, bukan UPDATE langsung -- prinsip yang sama dengan
-- 02-05: fixture ini menguji jalur produksinya sendiri.
--
-- IDEMPOTEN: tiap blok memeriksa keadaan lebih dulu, jadi menjalankan ulang
-- tidak menggandakan catatan/lampiran.
--
-- Prasyarat: 00-guards.sql + 04-scenario-3.sql (invoice-nya) di sesi yang SAMA.
-- Dibersihkan 99-purge.sql lewat CASCADE dari sp_invoices.
--
-- ASCII murni. Jangan tambahkan karakter non-ASCII (bash 3.2 + locale UTF-8).
-- =============================================================================

\i 00-guards.sql

DO $fx$
DECLARE
  v_uid   uuid := 'd730c348-ceab-463d-bc3b-458126314373';  -- test@msi.com (staging)
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid; v_void uuid;
  v_co uuid; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);

  -- Pemilihan DETERMINISTIK lewat urutan nomor invoice, bukan id acak: seed
  -- yang sama harus menghasilkan fixture yang sama supaya V12/V13 bisa
  -- menyebut angka pasti.
  SELECT i.id INTO v_a FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.status='issued'    AND i.deleted_at IS NULL
   ORDER BY i.invoice_no LIMIT 1;
  SELECT i.id INTO v_b FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.status='submitted' AND i.deleted_at IS NULL
   ORDER BY i.invoice_no LIMIT 1;
  SELECT i.id INTO v_c FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.status='partial'   AND i.deleted_at IS NULL
   ORDER BY i.invoice_no LIMIT 1;
  SELECT i.id, i.company_id INTO v_d, v_co FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.status='paid'      AND i.deleted_at IS NULL
   ORDER BY i.invoice_no LIMIT 1;
  SELECT i.id INTO v_void FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.status='void'      AND i.deleted_at IS NULL
   ORDER BY i.invoice_no LIMIT 1;
  SELECT i.id INTO v_e FROM sp_invoices i JOIN sp_orders o ON o.id=i.sp_order_id
   WHERE o.sp_no LIKE '91%' AND i.status='issued'    AND i.deleted_at IS NULL
     AND i.replaces_invoice_id IS NULL AND i.id <> v_a
   ORDER BY i.invoice_no DESC LIMIT 1;

  IF v_a IS NULL OR v_b IS NULL OR v_c IS NULL OR v_d IS NULL OR v_void IS NULL OR v_e IS NULL THEN
    RAISE EXCEPTION 'FIXTURE BATAL: seed 02-05 belum lengkap (issued/submitted/partial/paid/void tidak semuanya ada).';
  END IF;

  -- (1) Pajak: nomor Faktur Pajak + kode transaksi Coretax.
  IF (SELECT faktur_no FROM sp_invoices WHERE id=v_a) IS NULL THEN
    PERFORM set_invoice_tax_info(v_a, '010.000-26.10000001', '[05] 05 - Besaran tertentu');
  END IF;
  IF (SELECT coretax_tx_code FROM sp_invoices WHERE id=v_c) IS NULL THEN
    PERFORM set_invoice_tax_info(v_c, NULL, '[01] 01 - Kepada Pihak yang Bukan Pemungut PPN');
  END IF;

  -- (2) Jejak cetak (dua kali, supaya print_count > 1) dan kirim email.
  IF (SELECT print_count FROM sp_invoices WHERE id=v_b) = 0 THEN
    PERFORM mark_invoice_printed(v_b, 'download');
    PERFORM mark_invoice_printed(v_b, 'print');
  END IF;
  IF (SELECT emailed_at FROM sp_invoices WHERE id=v_b) IS NULL THEN
    PERFORM mark_invoice_emailed(v_b);
  END IF;

  -- (3) Catatan internal -- tiga, supaya Riwayat punya lebih dari satu baris
  -- manusia di antara kejadian sistem.
  SELECT count(*) INTO v_n FROM invoice_notes WHERE invoice_id=v_c AND deleted_at IS NULL;
  IF v_n = 0 THEN
    PERFORM add_invoice_note(v_c, 'DATA DUMMY UAT - customer minta invoice dikirim ulang ke email finance mereka.');
    PERFORM add_invoice_note(v_c, 'DATA DUMMY UAT - pembayaran sebagian diterima, sisa dijanjikan minggu depan.');
    PERFORM add_invoice_note(v_c, 'DATA DUMMY UAT - sudah dikonfirmasi ke PIC gudang, BTB fisik ada di berkas.');
  END IF;

  -- (4) Lampiran -- metadata saja; berkas fisiknya tidak diunggah di seed.
  -- Path tetap mengikuti kontrak <company_id>/<invoice_id>/..., karena RPC-nya
  -- menolak bentuk lain dan fixture tidak boleh melewati guard itu.
  SELECT count(*) INTO v_n FROM invoice_attachments WHERE invoice_id=v_d AND deleted_at IS NULL;
  IF v_n = 0 THEN
    PERFORM add_invoice_attachment(v_d, v_co::text||'/'||v_d::text||'/faktur-pajak.pdf',
                                   'faktur-pajak.pdf', 'application/pdf', 248311);
    PERFORM add_invoice_attachment(v_d, v_co::text||'/'||v_d::text||'/bukti-potong.pdf',
                                   'bukti-potong.pdf', 'application/pdf', 91204);
  END IF;

  -- (5) Invoice pengganti: menautkan satu invoice hidup ke invoice VOID di
  -- entitas yang sama. Ini satu-satunya fixture yang menguji guard "hanya
  -- void" dari sisi yang DITERIMA.
  IF (SELECT replaces_invoice_id FROM sp_invoices WHERE id=v_e) IS NULL
     AND NOT EXISTS (SELECT 1 FROM sp_invoices WHERE replaces_invoice_id = v_void AND deleted_at IS NULL) THEN
    PERFORM link_replacement_invoice(v_e, v_void);
  END IF;

  RAISE NOTICE 'FIXTURE v2 SELESAI: pajak 2 invoice, cetak+email 1, catatan 3, lampiran 2, pengganti 1.';
END
$fx$;
