-- =============================================================================
-- Migration: 20261029000005_crm_revert_manual_win_restore_swept_quotations
-- Inquiry Management Putaran 12 -- Butir 7: revert_manual_win harus
-- mengembalikan quotation yang disapu TASK 5 (trg_fn_quotation_auto_close_
-- on_inquiry_closed, cabang WON) ke status SEBELUM disapu.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- TANPA DROP -- revert_manual_win(uuid,text) di-CREATE OR REPLACE dengan
-- signature IDENTIK. Boleh dijalankan lewat connector Vir.
--
-- PEMBANDINGAN BADAN FUNGSI TERHADAP MIGRASI TERAKHIR -- badan TERAKHIR
-- revert_manual_win tetap 20261021000001 TASK 4 (lines 197-257) --
-- dikonfirmasi `grep -l revert_manual_win supabase/migrations/*.sql`:
-- lima berkas lain (20261022000002, 20261026000001, 20261027000004/6/8)
-- HANYA menyebutnya di komentar/pesan RAISE EXCEPTION lain ("gunakan
-- mark_inquiry_won/revert_manual_win"), TIDAK SATU PUN meng-CREATE OR
-- REPLACE fungsi ini. Migrasi ini memakai badan 20261021000001 TASK 4
-- sebagai dasar, utuh -- hanya MENAMBAH satu blok baru SESUDAH UPDATE
-- inquiries yang sudah ada, tidak mengubah satu baris pun dari logika lama.
--
-- =============================================================================
-- KOREKSI PREMIS (Den 27 Okt 2026) -- bukan "ACCEPTED -> SUPERSEDED"
-- =============================================================================
-- Rencana semula (prompt 39) salah menduga skenario: ACCEPTED TIDAK PERNAH
-- bisa menjadi SUPERSEDED lewat sweep manapun yang ada (trg_fn_quotation_
-- auto_close_on_inquiry_closed mengecualikan ACCEPTED dari WHERE IN-nya
-- sejak definisi pertama 20261012000007, konsisten di 20261021000001 DAN
-- 20261022000002; K1d juga menolak transisi keluar dari ACCEPTED tanpa
-- GUC). Skenario NYATA (data staging, dikonfirmasi Den): quotation
-- ZZZTEST-E2E-K1D-A-1792983990227 (inquiry MSI-INQ-X-2026-0049) TIDAK
-- PERNAH ACCEPTED (accepted_at kosong) -- ia DRAFT/SUBMITTED/SENT yang
-- disapu jadi SUPERSEDED saat inquiry-nya Won manual; revert_manual_win
-- mengembalikan INQUIRY ke QUOTED tapi TIDAK quotation-nya, menyisakan
-- inquiry QUOTED tanpa quotation aktif. Keputusan Den: quotation yang
-- disapu HARUS ikut kembali, ke status SEBELUM disapu (DRAFT/SUBMITTED/
-- SENT) -- BUKAN ke ACCEPTED. Logika pemulihan-ke-ACCEPTED + GUC
-- quotations_outcome_trusted dari rencana semula DIBUANG SELURUHNYA.
--
-- =============================================================================
-- DESAIN
-- =============================================================================
-- KANDIDAT RESTORE -- quotation di bawah inquiry ini dengan:
--   (a) status = 'SUPERSEDED'
--   (b) rejection_reason PERSIS pola yang ditulis sweep WON ('Otomatis:
--       inquiry ditandai Won', TANPA suffix -- v_reason_detail SELALU NULL
--       untuk cabang WON di trg_fn_quotation_auto_close_on_inquiry_closed,
--       jadi LIKE 'Otomatis: inquiry ditandai Won%' dipakai demi konsistensi
--       dgn konvensi celah-Revert create_quotation_revision yang sudah ada,
--       walau di praktiknya selalu persis tanpa suffix)
--   (c) updated_at >= waktu transisi KE WON yang SEDANG direvert (diambil
--       dari inquiry_status_history.changed_at baris to_status='WON' yang
--       SAMA yang sudah dipakai fungsi ini untuk v_from_status -- dalam SATU
--       transaksi yang sama dengan sweep aslinya, now() identik dengan
--       changed_at; >= dipakai sebagai jaga-jaga, bukan karena diperkirakan
--       meleset). Ini mencegah quotation yang disapu siklus Won SEBELUMNYA
--       (kalau inquiry ini sempat Won-revert-Won lagi) ikut terserempet.
-- Quotation SUPERSEDED karena REVISI NORMAL (create_quotation_revision,
-- TIDAK mengubah rejection_reason -- lihat badannya) TIDAK match pola (b),
-- jadi TIDAK tersentuh -- final decision #2 ("quotation SUPERSEDED TIDAK
-- dipulihkan") TETAP berlaku untuk kasus itu.
--
-- STATUS SEBELUM SAPUAN -- TIDAK tersimpan eksplisit di mana pun (quotations
-- tidak punya tabel riwayat status, dan tidak punya kolom submitted_at).
-- Diturunkan dari quote_sent_at -- BUKAN sent_at (kolom itu MATI, nol
-- penulis sejak dibuat, TD-311 docs/Governance/08_TECH_DEBT.md:474;
-- pemakaian nyata status SENT seluruhnya lewat quote_sent_at,
-- QuotationDetailPage.jsx:63,260,436,441): quote_sent_at IS NOT NULL ->
-- SENT, selain itu -> DRAFT.
--
-- KELEMAHAN YANG DISADARI (dilaporkan, bukan ditambal dengan kolom baru --
-- tidak ada kolom yang membedakan DRAFT dari SUBMITTED hari ini; pricing_
-- done_at BUKAN stempel transisi status, field form bebas yang bisa terisi
-- di status apa pun, QuotationFormPage.jsx:1131/1197): quotation yang sempat
-- SUBMITTED (menunggu approval internal) tapi BELUM pernah di-Send ke
-- customer akan DIKEMBALIKAN KE DRAFT, bukan SUBMITTED -- kehilangan sinyal
-- "sedang menunggu approval", bukan kehilangan data (field lain utuh, user
-- tinggal submit ulang). Diterima sebagai batas yang jujur.
--
-- EFEK SAMPING TRIGGER SAAT QUOTATION KEMBALI KE SENT (diverifikasi langsung
-- ke badan fungsi, bukan diasumsikan) --
--   set_inquiry_quoted_on_quotation_sent (20260722000004, AFTER UPDATE OF
--   status ON quotations, WHEN NEW.status='SENT'): `UPDATE inquiries
--   SET status='QUOTED' ... WHERE id=NEW.inquiry_id AND status IN
--   ('OPEN','IN_REVIEW')`. UPDATE inquiries (restore v_from_status) di
--   fungsi ini terjadi SEBELUM blok restore quotation -- urutan ini
--   DISENGAJA: kalau v_from_status BUKAN OPEN/IN_REVIEW, WHERE klausa
--   trigger itu tidak match sama sekali, nol baris, dan log_inquiry_status_
--   change (WHEN NEW.status IS DISTINCT FROM OLD.status) TIDAK menyala --
--   nol log ganda. Kalau v_from_status MEMANG OPEN/IN_REVIEW, trigger ini
--   akan menaikkannya ke QUOTED -- KONSISTEN secara historis (quotation yang
--   sempat SENT semestinya SUDAH menaikkan inquiry ke QUOTED lewat trigger
--   yang sama sebelum Won; v_from_status yang tercatat OPEN/IN_REVIEW
--   padahal ada quotation SENT berarti ada ketidakkonsistenan riwayat yang
--   SUDAH ADA sebelum revert ini, bukan yang diperkenalkan migrasi ini).
--   set_sql_on_quotation_sent (20261012000003, WHERE accounts.lifecycle_
--   stage/account_status IN ('lead','mql','prospect')): akun yang sempat
--   Won SUDAH lifecycle_stage='customer' (final decision #2 -- TIDAK
--   dikembalikan saat revert_manual_win) -- guard WHERE-nya mengecualikan
--   'customer', jadi NO-OP untuk setiap akun yang benar-benar melalui siklus
--   Won penuh.
--   K1d (trg_fn_guard_quotations_accepted_columns) -- OLD.status=
--   'SUPERSEDED', NEW.status='SENT'/'DRAFT': BUKAN salah satu dari
--   ('ACCEPTED'<->lainnya), ketiga kondisi K1d tidak match -- nol interaksi,
--   GUC quotations_outcome_trusted TIDAK diperlukan di blok ini.
--   trg_fn_lock_quotation_closed_inquiry -- GUC nexus.quotation_auto_close
--   dipasang SELAMA UPDATE restore (pola identik sweep aslinya) sebagai
--   defense-in-depth; pada titik ini inquiry SUDAH direstore ke
--   v_from_status (bukan WON lagi) sehingga lock trigger semestinya sudah
--   tidak relevan -- GUC murni jaga-jaga, bukan karena diperkirakan perlu.
--
-- GOTCHA GET DIAGNOSTICS (sudah didokumentasikan 20261026000004 header) --
-- GET DIAGNOSTICS dipanggil SEBELUM PERFORM set_config(...,'off',...) --
-- PERFORM adalah statement yang me-reset ROW_COUNT; membalik urutannya akan
-- membuat v_restored_count selalu 0.
--
-- STATUS INQUIRY SESUDAH REVERT KONSISTEN DENGAN QUOTATION YANG DIPULIHKAN
-- -- SUDAH terjamin by construction: v_from_status diturunkan dari inquiry_
-- status_history (riwayat NYATA), bukan ditebak -- ia mencerminkan status
-- inquiry PERSIS pada saat sebelum Won, periode yang SAMA dengan saat
-- quotation yang dipulihkan masih dalam status itu. Tidak ada langkah
-- tambahan yang diperlukan untuk menjamin konsistensi ini.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.revert_manual_win(p_inquiry_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text; v_company_id uuid; v_won_reason text; v_won_evidence_path text;
  v_from_status text; v_inquiry_no text; v_user_email text; v_user_role text;
  v_won_changed_at timestamptz;
  v_restored_count integer;
BEGIN
  SELECT status, company_id, won_reason, won_evidence_path, inquiry_no
    INTO v_status, v_company_id, v_won_reason, v_won_evidence_path, v_inquiry_no
  FROM public.inquiries WHERE id = p_inquiry_id AND deleted_at IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;
  IF v_status <> 'WON' THEN
    RAISE EXCEPTION 'Inquiry ini tidak dalam status Won.';
  END IF;

  -- Whitelist 4 alasan (BUKAN "<> 'Accepted quotation'") -- staging punya 3
  -- baris WON ber-won_reason teks bebas (bukan 4 alasan resmi, bukan juga
  -- 'Accepted quotation'); whitelist menolaknya direvert lewat jalur ini
  -- (tidak dikenali sebagai Won manual yang valid), tidak menerimanya begitu
  -- saja karena "bukan 'Accepted quotation'".
  IF v_won_reason IS NULL OR v_won_reason NOT IN (
    'Quoted outside Nexus','Repeat order under existing agreement','Verbal confirmation','Legacy data'
  ) THEN
    RAISE EXCEPTION 'Won ini bukan Won manual (atau alasannya tidak dikenali) -- tidak bisa direvert lewat jalur ini.';
  END IF;

  IF NOT (public.is_manager_or_above_in(v_company_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Hanya Manager ke atas atau Super Admin yang bisa membatalkan Won manual.';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan revert wajib diisi.';
  END IF;

  -- Putaran 12 Butir 7 -- changed_at ikut diambil (BARU; v_from_status
  -- sendiri tidak berubah) supaya blok restore quotation di bawah bisa
  -- membatasi dirinya hanya pada sapuan transisi WON yang SAMA.
  SELECT from_status, changed_at INTO v_from_status, v_won_changed_at
    FROM public.inquiry_status_history
   WHERE inquiry_id = p_inquiry_id AND to_status = 'WON'
   ORDER BY changed_at DESC LIMIT 1;
  IF v_from_status IS NULL THEN
    RAISE EXCEPTION 'Status asal sebelum Won tidak ditemukan di riwayat -- tidak bisa direvert otomatis.';
  END IF;

  UPDATE public.inquiries
  SET status = v_from_status, won_reason = NULL, won_evidence_path = NULL,
      closed_at = NULL, closed_by = NULL, revert_won_reason = p_reason, updated_at = now()
  WHERE id = p_inquiry_id;

  -- Putaran 12 Butir 7 (BARU) -- lihat "DESAIN" di header migrasi ini untuk
  -- definisi kandidat, derivasi status, kelemahan yang disadari, dan
  -- verifikasi efek samping trigger.
  PERFORM set_config('nexus.quotation_auto_close', 'on', true);

  UPDATE public.quotations
  SET    status           = CASE WHEN quote_sent_at IS NOT NULL THEN 'SENT' ELSE 'DRAFT' END,
         rejection_reason = NULL,
         updated_at       = now(),
         updated_by       = auth.uid()
  WHERE  inquiry_id = p_inquiry_id
    AND  status = 'SUPERSEDED'
    AND  rejection_reason LIKE 'Otomatis: inquiry ditandai Won%'
    AND  updated_at >= v_won_changed_at;

  -- GET DIAGNOSTICS SEBELUM PERFORM 'off' -- lihat gotcha di header migrasi.
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;

  PERFORM set_config('nexus.quotation_auto_close', 'off', true);

  SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  -- old_data LENGKAP: status, won_reason, won_evidence_path -- nilai
  -- SEBELUM dikosongkan oleh UPDATE di atas (sudah dibaca ke variabel lokal
  -- lebih dulu). new_data +quotations_restored (BARU, Putaran 12 Butir 7) --
  -- berapa baris quotation ikut dipulihkan, nol tidak dianggap kegagalan
  -- (banyak Won manual tidak punya quotation yang tersapu sama sekali).
  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'REVERT_MANUAL_WIN', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('status', 'WON', 'won_reason', v_won_reason, 'won_evidence_path', v_won_evidence_path),
          jsonb_build_object('status', v_from_status, 'quotations_restored', v_restored_count), p_reason);
END; $$;

REVOKE ALL ON FUNCTION public.revert_manual_win(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_manual_win(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.revert_manual_win(uuid,text) IS
  'Batalkan Won manual. Gate: is_manager_or_above_in(company_id) ATAU is_super_admin() (BUKAN owner -- final decision #2). Hanya untuk won_reason dalam whitelist 4 alasan. Status asal diturunkan dari inquiry_status_history (baris to_status=WON terbaru). Putaran 12 Butir 7: quotation yang disapu SUPERSEDED oleh sweep WON (rejection_reason berpola "Otomatis: inquiry ditandai Won%", disapu pada/sesudah transisi WON yang sedang direvert) dikembalikan ke status SEBELUM disapu (SENT kalau quote_sent_at terisi, selain itu DRAFT -- lihat KELEMAHAN di header migrasi: DRAFT vs SUBMITTED tidak bisa dibedakan). Quotation SUPERSEDED karena revisi normal TETAP TIDAK dipulihkan (final decision #2 berlaku sebagian, bukan dicabut).';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='revert_manual_win'; -- prosecdef=true
-- SELECT proacl FROM pg_proc WHERE proname='revert_manual_win'; -- grantee hanya authenticated
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-12.sql untuk uji self-rollback
-- (V8: Won manual -> Revert dengan quotation SENT, DRAFT, SUBMITTED, masing-
-- masing kembali sesuai derivasi; quotation SUPERSEDED-karena-revisi-normal
-- tidak tersentuh; nol notifikasi/log ganda).
--
-- Rollback (CREATE OR REPLACE balik ke badan SEBELUM migrasi ini -- badan
-- "sebelum" utuh di 20261021000001 TASK 4, lines 197-257):
--   -- salin ulang CREATE OR REPLACE dari file itu (signature tidak berubah).
-- =============================================================================
