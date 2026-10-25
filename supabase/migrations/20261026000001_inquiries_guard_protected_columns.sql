-- =============================================================================
-- Migration: 20261026000001_inquiries_guard_protected_columns
-- Inquiry Management Putaran 5 K1c -- Audit K1a menemukan: status WON,
-- owner_id, dan inquiry_type bisa diubah lewat UPDATE PostgREST langsung
-- (RLS inquiries_update mengizinkan pemilik/manager menulis KOLOM APA PUN,
-- termasuk tiga ini) -- menembus RPC resmi (mark_inquiry_won/
-- revert_manual_win/reassign_inquiry_owner) yang menegakkan alasan wajib,
-- bukti wajib, gate manager, dan audit_logs.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP TRIGGER -- WAJIB DIJALANKAN DEN LANGSUNG DI SQL
-- EDITOR, BUKAN lewat connector Vir (connector menolak/membatalkan statement
-- DROP sebagai pengaman -- pola sama 20261023000003/20261026000004).
--
-- RINGKASAN
--   1. Trigger BARU BEFORE UPDATE OF status, won_reason, won_evidence_path,
--      revert_won_reason, owner_id, inquiry_type ON inquiries -- menolak
--      UPDATE langsung oleh authenticated pada keenam kolom ini.
--   2. REVOKE INSERT ON inquiries FROM authenticated -- create_inquiry_
--      with_lanes (SECURITY DEFINER) tetap jalan; satu-satunya jalur INSERT
--      FE (InquiryFormPage.jsx:502, cabang !isEdit) sudah DEAD CODE hari ini
--      (lihat TEMUAN di bawah) dan akan ikut ditolak DB jika pernah tercapai.
--
-- MEKANISME -- current_user <> 'authenticated', BUKAN GUC transaksi-lokal
-- (beda dari pola K1d/quotations). Alasannya: SELURUH jalur sah di domain
-- inquiries untuk keenam kolom ini adalah SECURITY DEFINER (diverifikasi
-- satu-satu di bawah, bukan diasumsikan) -- selama fungsi SECURITY DEFINER
-- berjalan, current_user berganti jadi OWNER fungsi itu (postgres), BUKAN
-- role pemanggil PostgREST (authenticated). Ini properti bawaan Postgres
-- (dokumentasi resmi SECURITY DEFINER), tidak bisa dipalsukan klien --
-- berbeda dari domain quotations (K1d) di mana dua jalur sahnya
-- (set_quotation_outcome/create_quotation_revision) SECURITY INVOKER,
-- sehingga current_user tetap 'authenticated' dan GUC jadi satu-satunya
-- sinyal yang bekerja di sana. Trigger ini TIDAK PERNAH membutuhkan GUC.
--
-- SELURUH JALUR SAH YANG MENULIS SALAH SATU DARI KEENAM KOLOM INI, DAN MODE
-- SECURITY-NYA (diverifikasi grep migrasi -- bukan tebakan; untuk fungsi yang
-- punya >1 definisi, yang dicek adalah definisi TERBARU/LIVE):
--   mark_inquiry_won(uuid,text,text,text)              -- SECURITY DEFINER
--     (20261021000001) -- status->WON, won_reason, won_evidence_path.
--   revert_manual_win(uuid,text)                       -- SECURITY DEFINER
--     (20261021000001) -- status<-WON, revert_won_reason.
--   reassign_inquiry_owner(uuid,uuid)                  -- SECURITY DEFINER
--     (20261024000004) -- owner_id.
--   trg_fn_inquiry_won_on_quotation_accepted()          -- SECURITY DEFINER
--     (20261021000001), trigger DI quotations -- status->WON, won_reason
--     ('Accepted quotation') PADA inquiries terkait.
--   set_inquiry_won_on_so()                            -- SECURITY DEFINER
--     (20260722000009, superseding 20260722000004) -- status->WON.
--   set_inquiry_quoted_on_quotation_sent()              -- SECURITY DEFINER
--     (20260722000004) -- status->QUOTED (BUKAN WON -- lolos guard ini
--     tanpa butuh bypass sama sekali, dicatat sebagai kelengkapan).
--   set_inquiry_review_on_prf_submit()                  -- SECURITY DEFINER
--     (20260722000004) -- status->IN_REVIEW (BUKAN WON, idem di atas).
--   set_inquiry_negotiation_on_quotation_revision()     -- SECURITY DEFINER
--     (20260909000004) -- status->NEGOTIATION (BUKAN WON, idem di atas).
--   close_inquiry_as_duplicate(uuid,uuid)               -- SECURITY DEFINER
--     (20261022000002) -- status->CANCELLED (BUKAN WON/owner_id/inquiry_type
--     -- tidak pernah menyentuh keenam kolom terjaga; dicatat karena Vir
--     memintanya diuji tetap lolos sebagai "jalur sah").
--   create_inquiry_with_lanes(...)                      -- SECURITY DEFINER
--     (20261025000005) -- INSERT, bukan UPDATE -- trigger ini BEFORE UPDATE
--     saja, nol dampak; disebut di sini supaya daftar tetap lengkap.
--   update_inquiry_lanes(uuid,jsonb)                     -- SECURITY DEFINER
--     (20261025000006) -- menulis pol/pod/*_location_id (mirror lane
--     pertama), TIDAK menyentuh keenam kolom terjaga -- lolos tanpa guard
--     ini pun perlu bekerja, dicatat demi kelengkapan.
--
-- NOL fungsi di atas yang SECURITY INVOKER -- premis mekanisme ini terbukti,
-- bukan diasumsikan.
--
-- YANG SENGAJA TIDAK DISENTUH (tetap lewat UPDATE langsung authenticated,
-- RLS inquiries_update sudah menegakkan siapa yang boleh):
--   - status -> LOST / status -> CANCELLED (selain lewat close_inquiry_as_
--     duplicate) -- MarkAsLostModal/CancelReasonModal (DealDetailPage.jsx),
--     pola UPDATE langsung existing, TIDAK diubah.
--   - Edit per-section Detail Inquiry (saveInquirySection) -- notes/
--     goods_name/weight_kg/dkk, PATCH langsung, TIDAK menyentuh keenam
--     kolom terjaga, TIDAK terpengaruh trigger ini (BEFORE UPDATE OF
--     hanya memicu bila SET clause menyebut salah satu kolom di daftar).
--   - inquiries.direction (InquiryClassificationPage.jsx, UPDATE biasa,
--     migrasi 20261024000001) -- di luar daftar kolom terjaga.
--   - duplicate_of_id -- SUDAH punya trigger sendiri
--     (trg_z_lock_inquiry_duplicate_of, migrasi 20261022000002, pola GUC
--     nexus.inquiry_duplicate_close) -- tidak diduplikasi di sini.
--
-- TEMUAN (diinvestigasi, BUKAN diperbaiki -- src/ di luar scope K1c):
-- SATU-SATUNYA jalur INSERT langsung ke inquiries di seluruh src/ adalah
-- InquiryFormPage.jsx:502 (cabang `if (isEdit) {...} ... else { insert }`).
-- Diverifikasi TIDAK REACHABLE hari ini: KEDUA mount point komponen ini di
-- src/routes/crm.routes.jsx (InquiryEditRoute, CustomerInquiryEditRoute)
-- mengoper mode="edit" secara HARDCODE -- nol rute yang pernah mengoper
-- mode lain. Komentar InquiryIntakeWizardPage.jsx:4 mengonfirmasi niatnya:
-- "CREATE-ONLY -- InquiryFormPage.jsx TETAP satu-satunya halaman EDIT".
-- Cabang INSERT itu adalah DEAD CODE sejak wizard baru menggantikan
-- create (Putaran 4 Tahap 4B) -- REVOKE INSERT di bawah membuatnya ikut
-- gagal di lapis DB seandainya suatu hari tercapai lagi (mis. rute baru
-- yang lupa mengirim mode="edit"), bukan memperbaiki/menghapus kodenya
-- (di luar scope -- JANGAN disentuh tanpa instruksi terpisah).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.trg_fn_guard_inquiries_protected_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- SECURITY DEFINER RPC/trigger (current_user = owner fungsi, postgres)
  -- selalu lolos -- lihat enumerasi lengkap di header migrasi ini. Hanya
  -- client PostgREST langsung (current_user = 'authenticated') diperiksa.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'WON' OR OLD.status = 'WON') THEN
    RAISE EXCEPTION 'inquiries.status tidak bisa diubah langsung ke/dari WON -- gunakan mark_inquiry_won/revert_manual_win.';
  END IF;

  IF NEW.won_reason IS DISTINCT FROM OLD.won_reason
     OR NEW.won_evidence_path IS DISTINCT FROM OLD.won_evidence_path
     OR NEW.revert_won_reason IS DISTINCT FROM OLD.revert_won_reason THEN
    RAISE EXCEPTION 'inquiries.won_reason/won_evidence_path/revert_won_reason tidak bisa diubah langsung -- gunakan mark_inquiry_won/revert_manual_win.';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'inquiries.owner_id tidak bisa diubah langsung -- gunakan reassign_inquiry_owner.';
  END IF;

  IF NEW.inquiry_type IS DISTINCT FROM OLD.inquiry_type THEN
    RAISE EXCEPTION 'inquiries.inquiry_type tidak bisa diubah setelah dibuat.';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function TIDAK pernah dipanggil sebagai RPC (hanya oleh mesin
-- trigger) -- REVOKE ALL FROM PUBLIC sebagai higienitas, SENGAJA TANPA
-- GRANT EXECUTE TO authenticated. Pola identik
-- trg_fn_guard_quotations_accepted_columns (K1d, 20261026000004).
REVOKE ALL ON FUNCTION public.trg_fn_guard_inquiries_protected_columns() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_guard_inquiries_protected_columns() IS
  'BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason, owner_id, inquiry_type ON inquiries -- menolak perubahan langsung oleh authenticated; current_user <> ''authenticated'' melolosankan seluruh jalur SECURITY DEFINER (mark_inquiry_won/revert_manual_win/reassign_inquiry_owner/trigger WON otomatis/dkk, lihat header migrasi 20261026000001 utk daftar lengkap). Putaran 5 K1c.';

DROP TRIGGER IF EXISTS trg_z_guard_inquiries_protected_columns ON public.inquiries;
CREATE TRIGGER trg_z_guard_inquiries_protected_columns
  BEFORE UPDATE OF status, won_reason, won_evidence_path, revert_won_reason, owner_id, inquiry_type
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_guard_inquiries_protected_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- INSERT langsung -- create_inquiry_with_lanes (SECURITY DEFINER) tetap
-- jalan (owner fungsi punya privilege tabel terlepas dari GRANT caller).
-- inquiries_insert RLS (company_id IN get_user_company_ids()) DIBIARKAN --
-- tidak relevan lagi untuk authenticated begitu privilege tabelnya dicabut,
-- tapi tetap berlaku utuh untuk role lain (service_role dkk melewati RLS,
-- bukan karena policy ini, by design Postgres).
-- ─────────────────────────────────────────────────────────────────────────
REVOKE INSERT ON public.inquiries FROM authenticated;

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Trigger terpasang pada keenam kolom yang benar:
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgrelid='public.inquiries'::regclass AND NOT tgisinternal AND tgname='trg_z_guard_inquiries_protected_columns';
--
-- 2) INSERT authenticated tercabut, SELECT/UPDATE/DELETE tidak ikut:
-- SELECT has_table_privilege('authenticated','public.inquiries','INSERT') AS insert_ok,   -- HARAP false
--        has_table_privilege('authenticated','public.inquiries','SELECT') AS select_ok,   -- HARAP true (tetap, RLS yang menggerbang)
--        has_table_privilege('authenticated','public.inquiries','UPDATE') AS update_ok;    -- HARAP true (tetap, RLS + trigger baru yang menggerbang)
--
-- 3) Trigger function tanpa EXECUTE PUBLIC/authenticated:
-- SELECT proacl FROM pg_proc WHERE proname='trg_fn_guard_inquiries_protected_columns';
--  -- HARAP: nol baris '=X/postgres' (PUBLIC), nol baris 'authenticated=X/postgres'.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (urutan terbalik):
--
--   BEGIN;
--   GRANT INSERT ON public.inquiries TO authenticated;
--   DROP TRIGGER IF EXISTS trg_z_guard_inquiries_protected_columns ON public.inquiries;
--   DROP FUNCTION IF EXISTS public.trg_fn_guard_inquiries_protected_columns();
--   COMMIT;
-- =============================================================================
