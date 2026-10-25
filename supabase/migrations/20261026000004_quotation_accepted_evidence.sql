-- =============================================================================
-- Migration: 20261026000004_quotation_accepted_evidence
-- Putaran 5 K1d -- Quotation Accepted wajib bukti (Keputusan Den 25 Okt 2026:
-- "quotation yang ditandai Accepted WAJIB disertai bukti" -- Accepted otomatis
-- menjadikan inquiry WON (Irisan 3), jadi jalur ini harus seketat Mark as Won
-- manual yang sudah mewajibkan alasan dan bukti).
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- ⛔⛔ BERKAS INI MEMUAT DROP FUNCTION -- WAJIB DIJALANKAN DEN LANGSUNG DI SQL
-- EDITOR, BUKAN lewat connector Vir (connector menolak/membatalkan statement
-- DROP sebagai pengaman -- pola sama 20261023000003_crm_find_possible_
-- duplicate_inquiries_location_ids.sql).
--
-- RINGKASAN
--   1. Kolom baru quotations.accepted_evidence_path (nullable, TANPA CHECK
--      constraint -- lihat alasan di bawah).
--   2. Bucket privat BARU quotation-acceptance-evidence (10 MB, PDF/JPEG/PNG)
--      + 2 policy Storage, pola identik inquiry-won-evidence (20261021000001).
--      BUKAN reuse bucket itu -- path-nya berkonvensi <company_id>/<inquiry_id>/..,
--      menaruh bukti quotation di situ membuat segmen kedua path berarti dua
--      hal berbeda tanpa cara membedakannya dari namanya saja.
--   3. DROP set_quotation_outcome(uuid,text,text) -- CREATE set_quotation_outcome
--      (uuid,text,text,text), 4 argumen: bukti WAJIB untuk ACCEPTED, DIVERIFIKASI
--      benar-benar ada di storage.objects (bukan hanya path berawalan benar --
--      tambahan review Vir), GUC nexus.quotations_outcome_trusted membungkus
--      UPDATE-nya supaya trigger guard (poin 4) melolosankannya.
--   4. Trigger BARU BEFORE UPDATE trg_z_guard_quotations_accepted_columns --
--      menolak UPDATE langsung oleh authenticated pada status<->ACCEPTED dan
--      accepted_at/accepted_by/accepted_evidence_path, kecuali GUC di atas 'on'.
--
-- KEPUTUSAN (Den 25 Okt 2026 + review Vir, disetujui di rencana K1d):
--   - Overload lama (3 argumen) DI-DROP, bukan dipertahankan berdampingan.
--     Satu-satunya pemanggil src/ adalah QuotationDetailPage.jsx (handleOutcome)
--     -- diubah bersamaan ke overload baru di unit kerja YANG SAMA (Tahap A).
--     Nol FE lain yang memanggil fungsi ini (grep src/ = 1 hit).
--   - Bukti TIDAK disalin ke inquiries.won_evidence_path. Komentar kolom itu
--     (20261021000001:62) eksplisit "NULL untuk Won otomatis (quotation
--     Accepted atau jalur SO)" -- keputusan lama yang dipertahankan, bukan
--     kelalaian. Bukti tetap bisa diakses dari Inquiry lewat DocumentFlow/
--     RelatedDocuments -> klik quotation Accepted -> lihat bukti di sana.
--   - GUC BARU nexus.quotations_outcome_trusted -- SENGAJA BUKAN reuse
--     nexus.quotation_auto_close (20261012000007) yang sudah ada: tujuannya
--     berbeda (auto-close = cascade status LOST/CANCELLED/WON pada inquiries
--     yang menembus lock quotations; GUC ini = "RPC pencatat jawaban customer
--     SEDANG menulis") -- nol tumpang tindih makna antara dua GUC.
--   - EXISTS-check storage.objects (tambahan review Vir): mark_inquiry_won
--     punya kelemahan YANG SAMA (path berawalan benar tanpa file benar-benar
--     ada tidak pernah divalidasi) tapi SENGAJA TIDAK diperbaiki di migrasi
--     ini -- itu perbaikan TERPISAH pada fungsi lain, di luar scope K1d.
--
-- MENGAPA NOL CHECK CONSTRAINT pada accepted_evidence_path (beda dari pola
-- inquiries_rate_sheet_fields_check, 20261025000002): aturan "wajib bukti
-- untuk ACCEPTED" hanya bisa dilewati lewat (a) RPC ini -- yang sudah
-- menegakkannya sendiri -- atau (b) UPDATE langsung -- yang trigger poin 4
-- menolak untuk authenticated. Nol jalur ketiga yang bisa membuat baris
-- ACCEPTED tanpa bukti tersimpan, jadi CHECK constraint di level tabel
-- redundan (kompleksitas tanpa manfaat tambahan).
--
-- BASELINE DATA (laporan Vir, TIDAK tersentuh migrasi ini -- kolom baru
-- nullable, baris lama otomatis valid tanpa backfill): quotation berstatus
-- ACCEPTED hari ini = 6 (staging) / 96 (production). Seluruhnya
-- accepted_evidence_path=NULL sesudah migrasi, dan itu SAH (bukti hanya
-- wajib untuk TRANSISI BARU ke ACCEPTED, bukan retroaktif).
--
-- JALUR YANG DIPERIKSA TIDAK MENULIS status<->ACCEPTED ATAU kolom terjaga
-- (nol penyesuaian perlu untuk mereka -- lihat rencana K1d untuk detail):
--   create_quotation_revision(uuid)   -- SECURITY INVOKER. OLD.status di
--     sana HANYA SENT/REJECTED/SUPERSEDED-khusus (celah Revert); baris baru
--     selalu status='DRAFT'; nol accepted_*/evidence di daftar INSERT-nya.
--   save_quotation(uuid,jsonb,jsonb)  -- SECURITY INVOKER. status = COALESCE
--     (p_header->>'status', status) -- GENERIK, bisa diisi apa pun kalau
--     dikirim p_header.status, TAPI FE (QuotationFormPage.jsx) hanya pernah
--     mengirim 'SUBMITTED'/'DRAFT', tidak pernah 'ACCEPTED'. Trigger poin 4
--     menutup celah bypass ini sebagai efek samping yang diinginkan (bukan
--     scope creep -- konsekuensi otomatis dari enumerasi yang diminta).
--   trg_fn_quotation_auto_close_on_inquiry_closed() -- SECURITY DEFINER,
--     trigger di inquiries, cascading ke quotations. status->REJECTED/
--     SUPERSEDED saja, TIDAK PERNAH ACCEPTED.
--   trg_fn_inquiry_won_on_quotation_accepted() -- SECURITY DEFINER, trigger
--     DI quotations (AFTER UPDATE OF status WHEN NEW.status='ACCEPTED').
--     Menulis ke inquiries, BUKAN quotations -- bukan penulis kolom ini.
--   "Reopen Quotation" (fitur mockup) -- NOL kode live (grep src/ dan
--     migrations/ = nol hasil). Kalau dibangun nanti, WAJIB pakai GUC yang
--     sama sebelum mengubah status keluar dari ACCEPTED.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Kolom baru
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.quotations
  ADD COLUMN accepted_evidence_path text;

COMMENT ON COLUMN public.quotations.accepted_evidence_path IS
  'Path bukti penerimaan quotation di bucket privat quotation-acceptance-evidence, <company_id>/<quotation_id>/<uuid>.<ext>. NULL untuk baris ACCEPTED sebelum migrasi ini (bukti hanya wajib untuk transisi BARU ke ACCEPTED, bukan retroaktif -- 6 baris staging/96 production per laporan Vir) dan untuk REJECTED. Satu-satunya penulis sah: set_quotation_outcome(uuid,text,text,text). Keputusan Den 25 Okt 2026.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Bucket + policy Storage (pola identik inquiry-won-evidence, 20261021000001)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quotation-acceptance-evidence', 'quotation-acceptance-evidence', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS quotation_acceptance_evidence_read   ON storage.objects;
DROP POLICY IF EXISTS quotation_acceptance_evidence_insert ON storage.objects;

CREATE POLICY quotation_acceptance_evidence_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'quotation-acceptance-evidence'
    AND (
      public.is_super_admin()
      OR split_part(name, '/', 1) = public.get_user_company_id()::text
      OR split_part(name, '/', 1) IN (SELECT gc::text FROM public.get_user_company_ids() gc)
    )
  );

CREATE POLICY quotation_acceptance_evidence_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'quotation-acceptance-evidence'
    AND (
      public.is_super_admin()
      OR split_part(name, '/', 1) = public.get_user_company_id()::text
      OR split_part(name, '/', 1) IN (SELECT gc::text FROM public.get_user_company_ids() gc)
    )
  );
-- Nol DELETE policy -- bukti penerimaan tidak pernah dihapus dari UI, pola
-- sama inquiry-won-evidence (menghapus bukti kemenangan/penerimaan yang
-- sudah tercatat bukan alur yang disediakan).

-- Policy READ di atas JUGA menjadi gerbang EXISTS-check storage.objects di
-- dalam set_quotation_outcome (bagian 3 di bawah): fungsi itu SECURITY
-- INVOKER, jadi SELECT-nya ke storage.objects tunduk PERSIS policy ini,
-- dievaluasi sebagai pemanggil yang sama. Pemanggil yang baru mengunggah
-- filenya SENDIRI (lewat policy INSERT di atas, company_id sama) akan lolos
-- policy READ ini juga -- tambahan review Vir diverifikasi di skrip uji (j).

-- ─────────────────────────────────────────────────────────────────────────
-- 3. set_quotation_outcome -- DROP overload lama, CREATE 4-argumen
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.set_quotation_outcome(uuid, text, text);

CREATE FUNCTION public.set_quotation_outcome(
  p_quotation_id  uuid,
  p_outcome       text,
  p_reason        text DEFAULT NULL,
  p_evidence_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_src           public.quotations%ROWTYPE;
  v_max_rev       integer;
  v_count         integer;
  v_user_email    text;
  v_user_role     text;
  v_object_exists boolean;
BEGIN
  IF p_outcome NOT IN ('ACCEPTED','REJECTED') THEN
    RAISE EXCEPTION 'Outcome harus ACCEPTED atau REJECTED (diterima: %).', p_outcome;
  END IF;

  -- Alasan WAJIB saat menolak -- badan IDENTIK versi 3-argumen lama, nol
  -- perubahan perilaku REJECTED.
  IF p_outcome = 'REJECTED' AND COALESCE(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;

  SELECT * INTO v_src
  FROM public.quotations
  WHERE id = p_quotation_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin baca (RLS).';
  END IF;

  -- Hanya yang SUDAH terkirim yang bisa dijawab customer -- badan IDENTIK lama.
  IF v_src.status <> 'SENT' THEN
    RAISE EXCEPTION
      'Hanya quotation berstatus SENT yang bisa dicatat hasilnya (status sekarang: %).',
      v_src.status;
  END IF;

  SELECT MAX(revision) INTO v_max_rev
  FROM public.quotations
  WHERE quotation_no = v_src.quotation_no;

  IF v_src.revision < v_max_rev THEN
    RAISE EXCEPTION
      'Versi ini sudah digantikan revisi yang lebih baru -- catat hasilnya di versi terakhir.';
  END IF;

  -- Bukti WAJIB untuk ACCEPTED (Keputusan Den 25 Okt 2026) -- pola sama
  -- mark_inquiry_won (20261021000001:145-150): path wajib terisi DAN
  -- berawalan company_id/quotation_id. TAMBAHAN review Vir -- mark_inquiry_won
  -- BELUM punya ini, SENGAJA TIDAK disentuh di migrasi ini (perbaikan
  -- terpisah, di luar scope K1d) -- file-nya BENAR-BENAR ada di
  -- storage.objects, bukan sekadar path yang "kelihatan benar" (tanpa ini,
  -- pemanggil bisa mengarang path berawalan benar tanpa mengunggah apa pun).
  IF p_outcome = 'ACCEPTED' THEN
    IF COALESCE(btrim(p_evidence_path), '') = '' THEN
      RAISE EXCEPTION 'Bukti wajib dilampirkan untuk Accepted.';
    END IF;
    IF p_evidence_path NOT LIKE (v_src.company_id::text || '/' || p_quotation_id::text || '/%') THEN
      RAISE EXCEPTION 'Path bukti tidak sesuai quotation ini.';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'quotation-acceptance-evidence' AND name = p_evidence_path
    ) INTO v_object_exists;
    IF NOT v_object_exists THEN
      RAISE EXCEPTION 'File bukti tidak ditemukan di penyimpanan.';
    END IF;
  END IF;

  -- GUC transaksi-lokal (parameter ketiga true, WAJIB) -- melolosankan UPDATE
  -- ini lewat trg_z_guard_quotations_accepted_columns (bagian 4 di bawah).
  -- Diatur 'off' lagi SEGERA sesudah UPDATE (bukan dibiarkan 'on' sampai akhir
  -- transaksi) -- pola identik nexus.quotation_auto_close
  -- (20261012000007:314-324): nyala tepat di sekitar SATU statement yang
  -- butuh bypass, mati lagi sebelum statement lain di fungsi yang sama.
  PERFORM set_config('nexus.quotations_outcome_trusted', 'on', true);

  UPDATE public.quotations
  SET    status                 = p_outcome,
         accepted_at            = CASE WHEN p_outcome = 'ACCEPTED' THEN now()           ELSE NULL END,
         accepted_by            = CASE WHEN p_outcome = 'ACCEPTED' THEN auth.uid()      ELSE NULL END,
         accepted_evidence_path = CASE WHEN p_outcome = 'ACCEPTED' THEN p_evidence_path ELSE NULL END,
         rejection_reason       = CASE WHEN p_outcome = 'REJECTED' THEN btrim(p_reason) ELSE NULL END,
         updated_at             = now(),
         updated_by             = auth.uid()
  WHERE  id = p_quotation_id;

  PERFORM set_config('nexus.quotations_outcome_trusted', 'off', true);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada izin mengubah quotation ini (RLS).';
  END IF;

  -- Audit -- pola sama mark_inquiry_won (20261021000001:156-166): user/role
  -- dari sesi SAAT INI (bukan role yang lolos gerbang secara spesifik),
  -- old_data/new_data status saja (cukup untuk jejak "siapa mengubah apa").
  -- Perilaku notifikasi TIDAK diubah -- versi lama nol notifikasi sama
  -- sekali, versi baru ini juga nol (di luar scope Task 1).
  SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_src.company_id,
          CASE WHEN p_outcome = 'ACCEPTED' THEN 'ACCEPT_QUOTATION' ELSE 'REJECT_QUOTATION' END,
          'QUOTATION', p_quotation_id, v_src.quotation_no,
          jsonb_build_object('status', v_src.status),
          jsonb_build_object('status', p_outcome),
          p_reason);
END;
$$;

ALTER FUNCTION public.set_quotation_outcome(uuid, text, text, text) OWNER TO postgres;

REVOKE ALL     ON FUNCTION public.set_quotation_outcome(uuid, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_quotation_outcome(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_quotation_outcome(uuid, text, text, text) IS
  'Catat jawaban customer (ACCEPTED/REJECTED). SECURITY INVOKER -- gate = RLS quotations_update (sama seperti versi 3-argumen lama yang di-DROP migrasi ini). ACCEPTED wajib p_evidence_path: berawalan company_id/quotation_id, DAN benar-benar ada di storage.objects bucket quotation-acceptance-evidence (EXISTS-check). GUC transaksi-lokal nexus.quotations_outcome_trusted membungkus UPDATE-nya supaya trg_z_guard_quotations_accepted_columns melolosankannya. Keputusan Den 25 Okt 2026, Putaran 5 K1d.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Trigger guard -- menolak UPDATE langsung authenticated pada kolom ACCEPTED
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_guard_quotations_accepted_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Mekanisme pembeda: GUC transaksi-lokal, BUKAN current_user. Berbeda dari
  -- pola K1c (trg_fn_guard_inquiries_protected_columns, 20261026000001) yang
  -- memakai current_user karena SELURUH jalur sah di domain inquiries adalah
  -- SECURITY DEFINER. Di domain quotations, DUA jalur sah utama
  -- (set_quotation_outcome DAN create_quotation_revision) adalah SECURITY
  -- INVOKER -- current_user akan tetap 'authenticated' selama eksekusinya,
  -- tidak bisa dibedakan dari klien langsung. GUC adalah satu-satunya sinyal
  -- yang bekerja di sini, dan ini pola yang SUDAH dipakai domain ini sendiri
  -- (nexus.quotation_auto_close, 20261012000007) -- bukan konvensi baru.
  IF current_setting('nexus.quotations_outcome_trusted', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
    RAISE EXCEPTION 'quotations.status tidak bisa diubah langsung ke ACCEPTED -- gunakan Record Outcome (set_quotation_outcome).';
  END IF;
  IF OLD.status = 'ACCEPTED' AND NEW.status IS DISTINCT FROM 'ACCEPTED' THEN
    RAISE EXCEPTION 'quotations.status tidak bisa diubah langsung dari ACCEPTED.';
  END IF;

  IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
     OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by
     OR NEW.accepted_evidence_path IS DISTINCT FROM OLD.accepted_evidence_path THEN
    RAISE EXCEPTION 'quotations.accepted_at/accepted_by/accepted_evidence_path tidak bisa diubah langsung -- gunakan Record Outcome (set_quotation_outcome).';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function TIDAK pernah dipanggil sebagai RPC (hanya oleh mekanisme
-- trigger itu sendiri, yang tidak memerlukan GRANT EXECUTE pada role yang
-- menyebabkan UPDATE) -- REVOKE ALL FROM PUBLIC sebagai higienitas, SENGAJA
-- TANPA GRANT EXECUTE TO authenticated: memberi grant itu tidak membuatnya
-- bisa dipanggil langsung secara berarti (NEW/OLD/TG_OP hanya tersedia dalam
-- konteks trigger), dan menggrant-nya akan menyesatkan pembaca lain bahwa
-- fungsi ini dimaksudkan sebagai RPC. Pola identik
-- trg_fn_guard_inquiries_protected_columns (20261026000001).
REVOKE ALL ON FUNCTION public.trg_fn_guard_quotations_accepted_columns() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_guard_quotations_accepted_columns() IS
  'BEFORE UPDATE ON quotations -- menolak perubahan langsung oleh authenticated pada status<->ACCEPTED dan accepted_at/accepted_by/accepted_evidence_path, kecuali GUC transaksi-lokal nexus.quotations_outcome_trusted = ''on'' (dipasang set_quotation_outcome). create_quotation_revision/save_quotation/trigger lain TIDAK butuh GUC ini -- nol di antaranya pernah menulis status ke/dari ACCEPTED (lihat header migrasi ini untuk enumerasi lengkap). Putaran 5 K1d, Keputusan Den 25 Okt 2026.';

DROP TRIGGER IF EXISTS trg_z_guard_quotations_accepted_columns ON public.quotations;
CREATE TRIGGER trg_z_guard_quotations_accepted_columns
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_guard_quotations_accepted_columns();

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Kolom baru ada:
-- SELECT column_name FROM information_schema.columns WHERE table_name='quotations' AND column_name='accepted_evidence_path';
--
-- 2) Bucket + 2 policy Storage:
-- SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='quotation-acceptance-evidence';
-- SELECT polname, cmd FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND polname LIKE 'quotation_acceptance_evidence%';
--
-- 3) Overload lama hilang, baru ada, ACL bersih (oidvectortypes, BUKAN
--    pg_get_function_identity_arguments -- gotcha #44):
-- SELECT p.proname, oidvectortypes(p.proargtypes) AS arg_types, p.prosecdef, p.proacl
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='set_quotation_outcome';
--  -- HARAP: 1 baris, arg_types = 'uuid, text, text, text', prosecdef=false,
--  --        proacl memuat authenticated=X, TANPA baris kosong '=X' (PUBLIC).
--
-- 4) Trigger terpasang:
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgrelid='public.quotations'::regclass AND NOT tgisinternal AND tgname LIKE 'trg_z_guard%';
--
-- 5) Baris ACCEPTED lama tidak rusak (bandingkan dengan baseline Vir: 6 staging/96 production):
-- SELECT count(*) FROM public.quotations WHERE status='ACCEPTED';
-- SELECT count(*) FROM public.quotations WHERE status='ACCEPTED' AND accepted_evidence_path IS NOT NULL; -- harus 0
-- =============================================================================

-- =============================================================================
-- ROLLBACK (urutan terbalik):
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_z_guard_quotations_accepted_columns ON public.quotations;
--   DROP FUNCTION IF EXISTS public.trg_fn_guard_quotations_accepted_columns();
--
--   DROP FUNCTION public.set_quotation_outcome(uuid, text, text, text);
--
--   -- Re-create badan 3-argumen LAMA (dikutip verbatim dari
--   -- 20260909000003_quotation_revision_rpcs.sql:171-235):
--   CREATE FUNCTION public.set_quotation_outcome(
--     p_quotation_id uuid, p_outcome text, p_reason text DEFAULT NULL
--   ) RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
--   DECLARE v_src public.quotations%ROWTYPE; v_max_rev integer; v_count integer;
--   BEGIN
--     IF p_outcome NOT IN ('ACCEPTED','REJECTED') THEN
--       RAISE EXCEPTION 'Outcome harus ACCEPTED atau REJECTED (diterima: %).', p_outcome;
--     END IF;
--     IF p_outcome = 'REJECTED' AND COALESCE(btrim(p_reason),'') = '' THEN
--       RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
--     END IF;
--     SELECT * INTO v_src FROM public.quotations
--     WHERE id = p_quotation_id AND deleted_at IS NULL FOR UPDATE;
--     IF NOT FOUND THEN RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin baca (RLS).'; END IF;
--     IF v_src.status <> 'SENT' THEN
--       RAISE EXCEPTION 'Hanya quotation berstatus SENT yang bisa dicatat hasilnya (status sekarang: %).', v_src.status;
--     END IF;
--     SELECT MAX(revision) INTO v_max_rev FROM public.quotations WHERE quotation_no = v_src.quotation_no;
--     IF v_src.revision < v_max_rev THEN
--       RAISE EXCEPTION 'Versi ini sudah digantikan revisi yang lebih baru -- catat hasilnya di versi terakhir.';
--     END IF;
--     UPDATE public.quotations
--     SET status = p_outcome,
--         accepted_at = CASE WHEN p_outcome = 'ACCEPTED' THEN now() ELSE NULL END,
--         accepted_by = CASE WHEN p_outcome = 'ACCEPTED' THEN auth.uid() ELSE NULL END,
--         rejection_reason = CASE WHEN p_outcome = 'REJECTED' THEN btrim(p_reason) ELSE NULL END,
--         updated_at = now(), updated_by = auth.uid()
--     WHERE id = p_quotation_id;
--     GET DIAGNOSTICS v_count = ROW_COUNT;
--     IF v_count = 0 THEN RAISE EXCEPTION 'Tidak ada izin mengubah quotation ini (RLS).'; END IF;
--   END; $$;
--   REVOKE ALL ON FUNCTION public.set_quotation_outcome(uuid, text, text) FROM PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.set_quotation_outcome(uuid, text, text) TO authenticated;
--
--   DROP POLICY IF EXISTS quotation_acceptance_evidence_insert ON storage.objects;
--   DROP POLICY IF EXISTS quotation_acceptance_evidence_read   ON storage.objects;
--   -- BUCKET quotation-acceptance-evidence DAN ISINYA TIDAK IKUT DIHAPUS --
--   -- bisa sudah berisi bukti nyata. Hapus manual, hanya kalau sudah kosong.
--
--   ALTER TABLE public.quotations DROP COLUMN IF EXISTS accepted_evidence_path;
--   COMMIT;
-- =============================================================================
