-- =============================================================================
-- Migration: 20260902000004_set_sp_finance_docs
-- Phase:     FASE 1 (2/3) — satu-satunya penulis sah keenam kolom dokumen
--            finance, di level SP/header.
-- Depends:   20260902000003 (kolomnya HARUS sudah ada) · is_super_admin()
--            · has_role() · get_user_company_ids()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--
-- ⚠️ URUTAN: jalankan SETELAH 20260902000003. Tanpa kolomnya, CREATE FUNCTION
--    ini akan "berhasil" (pg_dump/PL-pgSQL tidak me-resolve nama kolom saat
--    CREATE) lalu GAGAL SAAT DIPANGGIL — persis kelas bug yang menjatuhkan
--    20260821000009 selama 5 hari (TD-212). Jangan dibalik.
--
-- KENAPA RPC, BUKAN DUA UPDATE DARI FE
--   Nilainya harus tertulis di DUA tempat sekaligus:
--     - sp_orders.<kolom>  -> sumber kebenaran kanonik (skema baru)
--     - sp_items.<kolom>   -> yang SEBENARNYA dibaca hampir semua konsumen
--                             hari ini: groupBySP/financePct (App.jsx:204-224),
--                             KPI FinancePage (:4413-4416), chip dokumen
--                             OutstandingPage (:4441-4444), tabel FinancePage
--                             (:4370-4375), export CSV (:2649-2650).
--   Dua UPDATE dari FE bisa sukses separuh: RLS sp_items_update = USING(true)
--   (lolos siapa pun) sementara sp_orders_update role-gated. Hasilnya item
--   berubah tapi header tidak. Satu fungsi = satu transaksi = mustahil separuh.
--
--   Sinkronisasi turun itu JUGA yang membuat SELURUH pembaca per-item di atas
--   tetap benar TANPA diubah sebaris pun.
--
-- GUARD (keputusan Den #5, 2 Sep 2026)
--   is_super_admin() OR has_role('finance_controller') OR has_role('finance')
--
--   is_manager_or_above() SENGAJA TIDAK DIPAKAI. 04_ROLE_PERMISSION_MATRIX
--   baris "Finance": manager = R, bukan CRUD. Ini membuat RPC ini LEBIH KETAT
--   dari create_invoice & mark_ttf_received (yang memang meloloskan manager)
--   dan LEBIH LONGGAR dari record_payment (super_admin + finance_controller
--   saja). Ketiganya sengaja berbeda — JANGAN diseragamkan tanpa keputusan
--   baru. Preseden perbedaan ini terdokumentasi di matrix baris 135-137.
--
--   is_sp_item_writer() (20260902000001) juga TIDAK dipakai di sini: itu
--   otoritas LOGISTICS (qty/harga/produk), bukan FINANCE. Dua sumbu berbeda
--   yang kebetulan menyentuh tabel yang sama.
--
-- FREEZE: HANYA 'CANCELLED', mengikuti preseden set_sp_expired_date.
--   SP LUNAS SENGAJA tetap boleh dikoreksi — rekonsiliasi dokumen historis
--   (mis. faktur pajak terbit belakangan) adalah kebutuhan nyata Finance.
--   Ini PENYIMPANGAN DISENGAJA dari daftar freeze sp_recompute_status yang
--   memakai ('CANCELLED','LUNAS'). Jangan "diseragamkan".
--
-- SEMUA 6 PARAMETER WAJIB DIKIRIM — ini BUKAN partial patch.
--   UI mengirim seluruh isi kartu tiap Simpan, sehingga tidak ada ambiguitas
--   "NULL = jangan ubah" vs "NULL = kosongkan". Untuk p_submit_date dan
--   p_email_status, NULL berarti BENAR-BENAR dikosongkan.
--
-- YANG SENGAJA TIDAK DILAKUKAN
--   - TIDAK memanggil sp_recompute_status: mesin status 12-tahap sama sekali
--     tidak membaca keenam kolom ini (ia membaca sp_status, picking_lists,
--     delivery_notes, sp_btb, sp_invoices). Memanggilnya = kerja sia-sia +
--     risiko efek samping. Pola sama set_sp_expired_date.
--   - TIDAK menyentuh sp_order_items: keenam kolom tidak ada di sana.
--   - TIDAK menulis audit log: nol RPC Storbit lain yang beraudit hari ini;
--     menambahkannya di sini jadi preseden tunggal. Dicatat sebagai follow-up.
--
-- ACL: pola FASE 5 (REVOKE FROM PUBLIC + GRANT authenticated, NOL anon).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_sp_finance_docs(
  p_customer_id  uuid,
  p_sp_no        text,
  p_inv          boolean,
  p_fp           boolean,
  p_submit       boolean,
  p_kirim        boolean,
  p_submit_date  date,
  p_email_status text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sp_order_id uuid; v_company uuid; v_status text;
BEGIN
  -- Header = sumber identitas, company, DAN status. Pola identik
  -- set_sp_expired_date / sp_issue_btb.
  SELECT id, company_id, status
    INTO v_sp_order_id, v_company, v_status
    FROM sp_orders
   WHERE customer_id = p_customer_id
     AND sp_no       = p_sp_no
     AND deleted_at IS NULL;
  IF v_sp_order_id IS NULL THEN
    RAISE EXCEPTION 'SP % untuk customer ini tidak ditemukan.', p_sp_no;
  END IF;

  -- Sumbu FINANCE, bukan sumbu logistics. Lihat blok GUARD di header file.
  IF NOT (is_super_admin() OR (v_company IN (SELECT get_user_company_ids())
          AND (has_role('finance_controller') OR has_role('finance')))) THEN
    RAISE EXCEPTION 'Tidak berhak mengubah status dokumen SP ini';
  END IF;

  -- Freeze HANYA CANCELLED — LUNAS sengaja TIDAK termasuk (lihat header).
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'SP sudah dibatalkan — status dokumen tidak bisa diubah.';
  END IF;

  UPDATE sp_orders
     SET inv          = p_inv,
         fp           = p_fp,
         submit       = p_submit,
         kirim        = p_kirim,
         submit_date  = p_submit_date,
         email_status = NULLIF(btrim(p_email_status), ''),
         updated_at   = now()
   WHERE id = v_sp_order_id;

  -- Turunkan ke SELURUH baris item se-SP. Inilah yang menghilangkan divergensi
  -- secara struktural DAN menjaga semua pembaca per-item lama (groupBySP,
  -- FinancePage, OutstandingPage, export CSV) tetap benar tanpa diubah.
  -- Digabung dengan 20260902000005 (6 kolom keluar dari update_sp_item_dual),
  -- tak ada lagi jalan menulis nilai berbeda per item lewat aplikasi.
  UPDATE sp_items
     SET inv          = p_inv,
         fp           = p_fp,
         submit       = p_submit,
         kirim        = p_kirim,
         submit_date  = p_submit_date,
         email_status = NULLIF(btrim(p_email_status), ''),
         updated_at   = now()
   WHERE customer_id = p_customer_id
     AND sp_no       = p_sp_no;
END; $$;

ALTER FUNCTION public.set_sp_finance_docs(uuid,text,boolean,boolean,boolean,boolean,date,text)
  OWNER TO postgres;
REVOKE ALL     ON FUNCTION public.set_sp_finance_docs(uuid,text,boolean,boolean,boolean,boolean,date,text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_sp_finance_docs(uuid,text,boolean,boolean,boolean,boolean,date,text)
  TO authenticated;

COMMENT ON FUNCTION public.set_sp_finance_docs(uuid,text,boolean,boolean,boolean,boolean,date,text) IS
  'Satu-satunya penulis sah inv/fp/submit/kirim/submit_date/email_status. '
  'Menulis sp_orders (sumber kebenaran) DAN menyinkronkan ke SEMUA sp_items '
  'se-SP dalam satu transaksi. Guard sumbu FINANCE (super_admin / '
  'finance_controller / finance) — SENGAJA tanpa is_manager_or_above(): '
  'matrix baris Finance menaruh manager di R, bukan CRUD.';

-- ─── VERIFIKASI (jalankan TERPISAH sesudahnya) ───────────────────────────────
--   -- a. ACL benar (authenticated saja, nol anon/public):
--   SELECT proname, proacl FROM pg_proc WHERE proname = 'set_sp_finance_docs';
--
--   -- b. Round-trip + rollback. Ganti <CUST>/<SPNO>.
--   BEGIN;
--     SELECT inv, fp, submit, kirim, submit_date, email_status
--       FROM sp_orders WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--     SELECT public.set_sp_finance_docs(
--       '<CUST>'::uuid, '<SPNO>', true, true, false, false,
--       DATE '2026-09-01', 'Terkirim ke customer');
--     SELECT inv, fp, submit, kirim, submit_date, email_status
--       FROM sp_orders WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--     -- sp_items HARUS mengembalikan TEPAT 1 baris (semua item seragam):
--     SELECT DISTINCT inv, fp, submit, kirim, submit_date, email_status
--       FROM sp_items WHERE customer_id='<CUST>' AND sp_no='<SPNO>';
--   ROLLBACK;
--
--   -- c. Pengosongan berfungsi (NULL = benar-benar kosong, bukan "abaikan"):
--   BEGIN;
--     SELECT public.set_sp_finance_docs('<CUST>'::uuid,'<SPNO>',
--            false,false,false,false, NULL, NULL);
--     SELECT submit_date, email_status FROM sp_orders WHERE sp_no='<SPNO>';
--     -- HARUS keduanya NULL.
--   ROLLBACK;
--
--   -- d. Guard peran (dari BROWSER, bukan SQL Editor — auth.uid() NULL di sini):
--   --    login finance / finance_controller -> HARUS LOLOS
--   --    login manager / operations / sales / gm_bd -> HARUS DITOLAK
--   --    'Tidak berhak mengubah status dokumen SP ini'
--
--   -- e. Freeze: SP CANCELLED HARUS ditolak; SP LUNAS HARUS LOLOS.
--   BEGIN;
--     SELECT public.set_sp_finance_docs('<CUST_CANCELLED>'::uuid,'<SPNO>',
--            true,true,true,true, NULL, NULL);
--     -- HARUS: 'SP sudah dibatalkan — status dokumen tidak bisa diubah.'
--   ROLLBACK;
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.set_sp_finance_docs(
--     uuid,text,boolean,boolean,boolean,boolean,date,text);
--   ⚠️ Setelah 20260902000005 jalan, men-DROP fungsi ini membuat keenam kolom
--      TIDAK BISA DIUBAH SAMA SEKALI lewat aplikasi (jalur item sudah ditutup).
--      Kalau perlu rollback penuh, rollback 20260902000005 juga.
