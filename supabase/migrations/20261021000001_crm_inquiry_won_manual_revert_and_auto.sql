-- =============================================================================
-- 20261021000001_crm_inquiry_won_manual_revert_and_auto.sql
--
-- TD-318 Irisan 3 (Inquiry Management): Mark Won manual, Revert, Won otomatis
-- (quotation Accepted), dan penguncian quotation saat inquiry Won.
--
-- Antrean produksi: BUTIR #66 (12_ANTREAN_MIGRASI_PRODUCTION.md), lanjutan
-- butir #65 (20261020000001). WAJIB jalan SESUDAH butir #56
-- (20261012000007_crm_quotation_lock_on_closed_inquiry) di environment yang
-- SAMA -- TASK 6/TASK 10 di bawah meng-CREATE OR REPLACE fungsi yang
-- didefinisikan pertama kali oleh migrasi itu; kalau belum jalan, migrasi
-- ini gagal "function ... does not exist". Terikat gerbang launching Lead
-- Management yang sama (develop/main bersama) untuk naik ke PRODUCTION.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN DI STAGING MAUPUN PRODUCTION.
--
-- =============================================================================
-- RINGKASAN
-- =============================================================================
-- TASK 1  -- dua kolom baru di inquiries: won_evidence_path, revert_won_reason.
-- TASK 2  -- bucket privat inquiry-won-evidence + 2 policy storage.objects.
-- TASK 3  -- mark_inquiry_won: DROP+CREATE (signature berubah, 1 -> 4 argumen).
--            Gate owner_id/is_manager_or_above_in/is_super_admin, 4 alasan
--            whitelist, bukti wajib, notifikasi atasan (profiles.reports_to)
--            best-effort dengan company_id milik PENERIMA.
-- TASK 4  -- revert_manual_win: RPC baru. Whitelist 4 alasan (BUKAN sekadar
--            "<> 'Accepted quotation'"), status asal dari inquiry_status_
--            history, audit old_data lengkap (status+won_reason+evidence).
-- TASK 5  -- trg_fn_quotation_auto_close_on_inquiry_closed: cabang WON baru,
--            DIGERBANG NEW.won_reason IS NOT NULL -- jalur set_inquiry_won_
--            on_so TIDAK mengisi won_reason, sehingga TIDAK men-supersede
--            quotation (sales_orders tak punya kolom ke quotation; produksi
--            punya SO yang inquiry-nya masih berquotation SENT, belum
--            Accepted -- menyapu itu tidak berdasar).
-- TASK 6  -- trg_fn_lock_quotation_closed_inquiry + trg_fn_lock_quotation_
--            items_closed_inquiry: WHEN diperluas ke WON (berlaku untuk
--            SEMUA jalur Won, termasuk SO -- beda dari TASK 5 yang hanya
--            dua jalur). Rate Sheet exception (rule 109) SENGAJA tidak
--            diimplementasikan.
-- TASK 7  -- trigger BARU: quotation ACCEPTED -> inquiry WON otomatis
--            (won_reason='Accepted quotation').
-- TASK 8  -- log_inquiry_status_change: cabang WON (baca won_reason) +
--            cabang keluar-dari-WON (baca revert_won_reason).
-- TASK 9  -- verifikasi struktural (DO block).
-- TASK 10 -- create_quotation_revision: celah Revert -- quotation SUPERSEDED
--            karena Won (ditandai awalan rejection_reason 'Otomatis: inquiry
--            ditandai Won') boleh direvisi SELAMA inquiry induknya sudah
--            tidak WON/LOST/CANCELLED.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 1 -- kolom baru
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.inquiries
  ADD COLUMN won_evidence_path text,
  ADD COLUMN revert_won_reason text;

COMMENT ON COLUMN public.inquiries.won_evidence_path IS
  'Path bukti Mark Won manual di bucket privat inquiry-won-evidence, <company_id>/<inquiry_id>/<uuid>.<ext>. NULL untuk Won otomatis (quotation Accepted atau jalur SO).';

COMMENT ON COLUMN public.inquiries.revert_won_reason IS
  'Alasan revert manual win TERAKHIR. Pola sama cancel_reason/lost_reason -- dibaca log_inquiry_status_change() pada baris UPDATE yang sama (TASK 8), tidak dikosongkan lagi sesudahnya.';

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 2 -- bucket + policy Storage untuk bukti Won manual
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inquiry-won-evidence', 'inquiry-won-evidence', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS inquiry_won_evidence_read   ON storage.objects;
DROP POLICY IF EXISTS inquiry_won_evidence_insert ON storage.objects;

CREATE POLICY inquiry_won_evidence_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inquiry-won-evidence'
    AND (
      public.is_super_admin()
      OR split_part(name, '/', 1) = public.get_user_company_id()::text
      OR split_part(name, '/', 1) IN (SELECT gc::text FROM public.get_user_company_ids() gc)
    )
  );

CREATE POLICY inquiry_won_evidence_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inquiry-won-evidence'
    AND (
      public.is_super_admin()
      OR split_part(name, '/', 1) = public.get_user_company_id()::text
      OR split_part(name, '/', 1) IN (SELECT gc::text FROM public.get_user_company_ids() gc)
    )
  );
-- Nol DELETE policy -- bukti Won tidak pernah dihapus dari UI (pola sama
-- invoice-docs: menghapus bukti kemenangan yang sudah tercatat bukan alur
-- yang disediakan).

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 3 -- mark_inquiry_won: signature baru (DROP + CREATE, bukan OR REPLACE)
-- ─────────────────────────────────────────────────────────────────────────

DROP FUNCTION public.mark_inquiry_won(uuid);

CREATE FUNCTION public.mark_inquiry_won(
  p_inquiry_id uuid, p_reason text, p_evidence_path text, p_notes text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text; v_owner_id uuid; v_company_id uuid; v_inquiry_no text;
  v_user_email text; v_user_full_name text; v_user_role text; v_supervisor_id uuid;
BEGIN
  SELECT status, owner_id, company_id, inquiry_no
    INTO v_status, v_owner_id, v_company_id, v_inquiry_no
  FROM public.inquiries WHERE id = p_inquiry_id AND deleted_at IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  IF v_status NOT IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION') THEN
    RAISE EXCEPTION 'Status inquiry (%) tidak bisa ditandai Won secara manual.', v_status;
  END IF;

  IF NOT (
    v_owner_id = auth.uid()
    OR public.is_manager_or_above_in(v_company_id)
    OR public.is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Hanya pemilik inquiry, Manager ke atas di entitas ini, atau Super Admin yang bisa menandai Won.';
  END IF;

  IF p_reason NOT IN ('Quoted outside Nexus','Repeat order under existing agreement','Verbal confirmation','Legacy data') THEN
    RAISE EXCEPTION 'Alasan Won manual tidak dikenali: %', p_reason;
  END IF;

  IF COALESCE(btrim(p_evidence_path), '') = '' THEN
    RAISE EXCEPTION 'Bukti wajib dilampirkan untuk Won manual.';
  END IF;
  IF p_evidence_path NOT LIKE (v_company_id::text || '/' || p_inquiry_id::text || '/%') THEN
    RAISE EXCEPTION 'Path bukti tidak sesuai inquiry ini.';
  END IF;

  UPDATE public.inquiries
  SET status = 'WON', won_reason = p_reason, won_evidence_path = p_evidence_path, updated_at = now()
  WHERE id = p_inquiry_id;

  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'MARK_INQUIRY_WON', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'WON', 'won_reason', p_reason),
          p_notes);

  -- Notifikasi atasan: company_id = profiles.company_id milik PENERIMA
  -- (reports_to), BUKAN company_id pengaju. Penerima harus active=true.
  -- Best-effort -- Mark Won TIDAK BOLEH gagal karena notifikasi gagal.
  -- Atasan tidak ada -> blok ini dilewati seluruhnya, nol notifikasi, dan
  -- itu bukan kegagalan (rule 110/final decision #1).
  SELECT reports_to INTO v_supervisor_id FROM public.profiles WHERE id = auth.uid();
  IF v_supervisor_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
      SELECT p.company_id, p.id, 'inquiry_manual_win', 'Manual win recorded',
             COALESCE(v_user_full_name, v_user_email) || ' marked ' || v_inquiry_no || ' as Won manually. Reason: ' || p_reason || '.',
             'inquiry', p_inquiry_id
      FROM public.profiles p
      WHERE p.id = v_supervisor_id AND p.active = true;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.mark_inquiry_won(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_inquiry_won(uuid,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.mark_inquiry_won(uuid,text,text,text) IS
  'Tandai inquiry WON manual. Gate: owner_id auth.uid() ATAU is_manager_or_above_in(company_id) ATAU is_super_admin(). Status asal wajib OPEN/IN_REVIEW/QUOTED/NEGOTIATION. 4 alasan whitelist, bukti wajib (path bucket inquiry-won-evidence). Notifikasi best-effort ke profiles.reports_to milik pemanggil (company_id milik PENERIMA). Menulis inquiries.won_reason -- dibaca trg_fn_quotation_auto_close_on_inquiry_closed (TASK 5) untuk men-supersede quotation sibling.';

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 4 -- revert_manual_win (RPC baru)
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.revert_manual_win(p_inquiry_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text; v_company_id uuid; v_won_reason text; v_won_evidence_path text;
  v_from_status text; v_inquiry_no text; v_user_email text; v_user_role text;
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

  SELECT from_status INTO v_from_status FROM public.inquiry_status_history
   WHERE inquiry_id = p_inquiry_id AND to_status = 'WON'
   ORDER BY changed_at DESC LIMIT 1;
  IF v_from_status IS NULL THEN
    RAISE EXCEPTION 'Status asal sebelum Won tidak ditemukan di riwayat -- tidak bisa direvert otomatis.';
  END IF;

  UPDATE public.inquiries
  SET status = v_from_status, won_reason = NULL, won_evidence_path = NULL,
      closed_at = NULL, closed_by = NULL, revert_won_reason = p_reason, updated_at = now()
  WHERE id = p_inquiry_id;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  -- old_data LENGKAP: status, won_reason, won_evidence_path -- nilai
  -- SEBELUM dikosongkan oleh UPDATE di atas (sudah dibaca ke variabel lokal
  -- lebih dulu).
  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'REVERT_MANUAL_WIN', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('status', 'WON', 'won_reason', v_won_reason, 'won_evidence_path', v_won_evidence_path),
          jsonb_build_object('status', v_from_status), p_reason);
END; $$;

REVOKE ALL ON FUNCTION public.revert_manual_win(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_manual_win(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.revert_manual_win(uuid,text) IS
  'Batalkan Won manual. Gate: is_manager_or_above_in(company_id) ATAU is_super_admin() (BUKAN owner -- final decision #2). Hanya untuk won_reason dalam whitelist 4 alasan. Status asal diturunkan dari inquiry_status_history (baris to_status=WON terbaru), BUKAN kolom tersendiri. Quotation SUPERSEDED TIDAK dipulihkan, accounts.lifecycle_stage TIDAK dikembalikan (final decision #2).';

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 5 -- trg_fn_quotation_auto_close_on_inquiry_closed: cabang WON baru,
-- digerbang NEW.won_reason (lihat RINGKASAN di atas untuk alasan bisnisnya)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reason_label  text;
  v_reason_detail text;
  v_reason        text;
  v_new_status    text;
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    v_reason_label  := 'Otomatis: inquiry ditandai Cancelled';
    v_reason_detail := NEW.cancel_reason;
    v_new_status    := 'REJECTED';
  ELSIF NEW.status = 'LOST' THEN
    v_reason_label  := 'Otomatis: inquiry ditandai Lost';
    v_reason_detail := COALESCE(
      (SELECT lr.name FROM public.loss_reasons lr WHERE lr.id = NEW.loss_reason_id),
      NEW.lost_reason);
    v_new_status    := 'REJECTED';
  ELSIF NEW.status = 'WON' THEN
    -- Jalur set_inquiry_won_on_so TIDAK mengisi won_reason (UPDATE-nya hanya
    -- menyentuh status). sales_orders tidak punya kolom apa pun yang
    -- menunjuk quotation, dan produksi punya kasus nyata SO yang inquiry-nya
    -- masih berquotation SENT (belum Accepted). Men-supersede quotation itu
    -- tidak berdasar. Hanya Mark Won manual (TASK 3) dan Quotation Accepted
    -- (TASK 7) berhak men-supersede -- keduanya mengisi won_reason DI UPDATE
    -- YANG SAMA dengan status='WON', jadi NEW.won_reason sudah terisi saat
    -- trigger ini membaca NEW. Kalau NULL, berhenti tanpa menyentuh quotation
    -- apa pun -- penguncian (lock trigger, TASK 6) TETAP menyala untuk jalur
    -- SO, hanya SUPERSEDE yang tidak.
    IF NEW.won_reason IS NULL THEN
      RETURN NEW;
    END IF;
    v_reason_label  := 'Otomatis: inquiry ditandai Won';
    v_reason_detail := NULL;
    v_new_status    := 'SUPERSEDED';
  END IF;

  v_reason := v_reason_label;
  IF COALESCE(btrim(v_reason_detail), '') <> '' THEN
    v_reason := v_reason || ' (' || v_reason_detail || ')';
  END IF;

  PERFORM set_config('nexus.quotation_auto_close', 'on', true);

  UPDATE public.quotations
  SET    status           = v_new_status,
         rejection_reason = v_reason,
         updated_at       = now(),
         updated_by       = auth.uid()
  WHERE  inquiry_id = NEW.id
    AND  status IN ('DRAFT', 'SUBMITTED', 'SENT');

  PERFORM set_config('nexus.quotation_auto_close', 'off', true);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() IS
  'Saat inquiries.status berubah ke LOST/CANCELLED/WON, tutup paksa quotation DRAFT/SUBMITTED/SENT milik inquiry itu. LOST/CANCELLED -> REJECTED (tanpa syarat). WON -> SUPERSEDED, HANYA bila NEW.won_reason IS NOT NULL (Mark Won manual / Quotation Accepted) -- jalur set_inquiry_won_on_so tidak mengisi won_reason dan SENGAJA dilewati (TD-318 Irisan 3). SECURITY DEFINER -- lihat catatan header migrasi 20261012000007 (trigger asal) dan 20261021000001 (perluasan WON).';

DROP TRIGGER trg_z_quotation_auto_close_on_inquiry_closed ON public.inquiries;
CREATE TRIGGER trg_z_quotation_auto_close_on_inquiry_closed
  AFTER UPDATE OF status ON public.inquiries
  FOR EACH ROW
  WHEN ((((new.status)::text = ANY ((ARRAY['LOST'::character varying, 'CANCELLED'::character varying, 'WON'::character varying])::text[])) AND ((old.status)::text IS DISTINCT FROM (new.status)::text)))
  EXECUTE FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed();

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 6 -- lock triggers: WHEN diperluas ke WON (berlaku SEMUA jalur Won,
-- termasuk SO -- beda dari TASK 5 yang hanya dua jalur)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_lock_quotation_closed_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_inquiry_status text;
BEGIN
  IF current_setting('nexus.quotation_auto_close', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.inquiry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_inquiry_status
  FROM public.inquiries
  WHERE id = NEW.inquiry_id;

  IF v_inquiry_status IN ('LOST', 'CANCELLED', 'WON') THEN
    RAISE EXCEPTION
      'Quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_lock_quotation_closed_inquiry() IS
  'Tolak INSERT/UPDATE pada quotations kalau inquiry induknya LOST/CANCELLED/WON (WON ditambahkan TD-318 Irisan 3, final decision #4 -- berlaku untuk SEMUA jalur Won termasuk SO, Rate Sheet exception rule 109 sengaja tidak diimplementasikan). Pengecualian: update cascading Task 1/Task 4 migrasi 20261012000007 + TASK 5/TASK 7 migrasi ini, dibedakan via GUC transaksi-lokal nexus.quotation_auto_close. SECURITY DEFINER -- lihat catatan header migrasi 20261012000007.';

CREATE OR REPLACE FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_quotation_id   uuid;
  v_inquiry_status text;
BEGIN
  v_quotation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.quotation_id ELSE NEW.quotation_id END;

  SELECT i.status INTO v_inquiry_status
  FROM public.quotations q
  JOIN public.inquiries  i ON i.id = q.inquiry_id
  WHERE q.id = v_quotation_id;

  IF v_inquiry_status IN ('LOST', 'CANCELLED', 'WON') THEN
    RAISE EXCEPTION
      'Item quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() IS
  'Tolak INSERT/UPDATE/DELETE pada quotation_items kalau quotation induknya (via inquiry_id) LOST/CANCELLED/WON (WON ditambahkan TD-318 Irisan 3). Defense-in-depth, nol GUC bypass. SECURITY DEFINER karena alasan yang sama dgn trg_fn_lock_quotation_closed_inquiry.';

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 7 -- trigger BARU: quotation Accepted -> inquiry Won otomatis
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.trg_fn_inquiry_won_on_quotation_accepted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.inquiry_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.inquiries
  SET status = 'WON', won_reason = 'Accepted quotation', updated_at = now()
  WHERE id = NEW.inquiry_id
    AND status IN ('OPEN','IN_REVIEW','QUOTED','NEGOTIATION');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_inquiry_won_on_quotation_accepted() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_inquiry_won_on_quotation_accepted() IS
  'Won otomatis (final decision #3, dipersempit dari rule 12: HANYA quotation Accepted, bukan SI/PO customer). Mengisi won_reason=''Accepted quotation'' DI UPDATE YANG SAMA -- dibaca trg_fn_quotation_auto_close_on_inquiry_closed (TASK 5) untuk men-supersede quotation sibling. SECURITY DEFINER, prefix trg_z_ pada triggernya supaya menyala sesudah trigger non-z lain di quotations.';

CREATE TRIGGER trg_z_inquiry_won_on_quotation_accepted
  AFTER UPDATE OF status ON public.quotations
  FOR EACH ROW
  WHEN (NEW.status = 'ACCEPTED' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_fn_inquiry_won_on_quotation_accepted();

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 8 -- log_inquiry_status_change: cabang WON + cabang keluar-dari-WON
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_inquiry_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_last_at   timestamptz;
  v_start     timestamptz;
  v_duration  integer;
BEGIN
  SELECT h.changed_at INTO v_last_at
    FROM inquiry_status_history h
   WHERE h.inquiry_id = NEW.id
   ORDER BY h.changed_at DESC
   LIMIT 1;

  v_start := COALESCE(v_last_at, OLD.created_at);

  IF v_start IS NOT NULL THEN
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_start))::int);
  END IF;

  INSERT INTO inquiry_status_history
    (inquiry_id, from_status, to_status, changed_by, reason, duration_seconds)
  VALUES
    (NEW.id, OLD.status, NEW.status, auth.uid(),
     CASE
       WHEN NEW.status = 'CANCELLED' THEN NEW.cancel_reason
       WHEN NEW.status = 'LOST' THEN COALESCE(
              (SELECT lr.name FROM loss_reasons lr WHERE lr.id = NEW.loss_reason_id),
              NEW.lost_reason)
       WHEN NEW.status = 'WON' THEN NEW.won_reason
       WHEN OLD.status = 'WON' THEN NEW.revert_won_reason
       ELSE NULL
     END,
     v_duration);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_inquiry_status_change() IS
  'Catat tiap transisi inquiries.status ke inquiry_status_history. Reason: CANCELLED/LOST pakai kolom sebelumnya (tidak diubah). WON pakai won_reason (TD-318 Irisan 3: manual 4-alasan atau "Accepted quotation"). Transisi KELUAR dari WON (revert) pakai revert_won_reason -- satu-satunya jalur keluar dari WON hari ini adalah revert_manual_win (TASK 4), yang mengisi kolom ini di UPDATE yang sama.';

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 9 -- verifikasi struktural
-- ─────────────────────────────────────────────────────────────────────────

DO $v1$
DECLARE
  v_cols int; v_fn_pub int; v_fn_auth int; v_trig int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='inquiries'
     AND column_name IN ('won_evidence_path','revert_won_reason');
  IF v_cols <> 2 THEN RAISE EXCEPTION 'V1a GAGAL: kolom baru inquiries tidak lengkap (%).', v_cols; END IF;

  SELECT count(*) INTO v_fn_pub FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('mark_inquiry_won','revert_manual_win')
     AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%'));
  IF v_fn_pub <> 0 THEN RAISE EXCEPTION 'V1b GAGAL: % fungsi Won ber-PUBLIC EXECUTE.', v_fn_pub; END IF;

  SELECT count(*) INTO v_fn_auth FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('mark_inquiry_won','revert_manual_win')
     AND EXISTS (SELECT 1 FROM unnest(p.proacl) a
                  WHERE a::text LIKE 'authenticated=%' AND split_part(a::text,'=',2) LIKE '%X%');
  IF v_fn_auth <> 2 THEN RAISE EXCEPTION 'V1c GAGAL: hanya % dari 2 fungsi ber-EXECUTE untuk authenticated.', v_fn_auth; END IF;

  SELECT count(*) INTO v_trig FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname IN ('inquiries','quotations') AND NOT t.tgisinternal
     AND t.tgname IN ('trg_z_quotation_auto_close_on_inquiry_closed','trg_z_inquiry_won_on_quotation_accepted');
  IF v_trig <> 2 THEN RAISE EXCEPTION 'V1d GAGAL: trigger WON tidak lengkap (%).', v_trig; END IF;

  RAISE NOTICE 'V1 LOLOS: 2 kolom baru, 2 RPC tanpa PUBLIC EXECUTE, 2 trigger WON terpasang.';
END
$v1$;

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 10 -- create_quotation_revision: celah Revert
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_quotation_revision(p_quotation_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_src     public.quotations%ROWTYPE;
  v_max_rev integer;
  v_new_id  uuid;
  v_count   integer;
  v_inquiry_status text;
BEGIN
  SELECT * INTO v_src
  FROM public.quotations
  WHERE id = p_quotation_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin baca (RLS).';
  END IF;

  IF v_src.status NOT IN ('SENT','REJECTED') THEN
    -- Celah Revert (final decision A.1): quotation yang di-SUPERSEDE
    -- OTOMATIS karena inquiry-nya sempat Won lalu di-revert, boleh direvisi
    -- SELAMA inquiry induknya tidak lagi tertutup. Ditandai lewat awalan
    -- rejection_reason yang ditulis trg_fn_quotation_auto_close_on_inquiry_
    -- closed() -- 'Otomatis: inquiry ditandai Won...'. Quotation SUPERSEDED
    -- lewat siklus revisi NORMAL (fungsi ini sendiri, UPDATE di bawah) TIDAK
    -- match awalan ini dan TETAP ditolak.
    IF v_src.status = 'SUPERSEDED' AND v_src.rejection_reason LIKE 'Otomatis: inquiry ditandai Won%' THEN
      SELECT status INTO v_inquiry_status FROM public.inquiries WHERE id = v_src.inquiry_id;
      IF v_inquiry_status IN ('WON','LOST','CANCELLED') THEN
        RAISE EXCEPTION 'Inquiry induk sudah %, revisi tidak bisa dibuat.', v_inquiry_status;
      END IF;
    ELSE
      RAISE EXCEPTION
        'Hanya quotation berstatus SENT atau REJECTED yang bisa direvisi (status sekarang: %).',
        v_src.status;
    END IF;
  END IF;

  SELECT MAX(revision) INTO v_max_rev
  FROM public.quotations
  WHERE quotation_no = v_src.quotation_no;

  IF v_src.revision < v_max_rev THEN
    RAISE EXCEPTION
      'Revisi hanya boleh dibuat dari versi terakhir (versi ini %, terakhir %).',
      v_src.revision, v_max_rev;
  END IF;

  INSERT INTO public.quotations (
    company_id, quotation_no, revision, inquiry_id, prospect_id, customer_id,
    service_type, valid_until, payment_terms_id, currency_code, notes, terms,
    subtotal, tax_amount, total_amount, status,
    usd_rate, route, pricing_done_at, discount_pct, margin_floor,
    internal_notes, quote_date, vat_rate, attention_to,
    pickup_address, delivery_address, cargo_mode,
    gw, dimension, cw, cbm, container_type, container_qty,
    exchange_rates, prf_id,
    created_by, created_at, updated_at
  )
  VALUES (
    v_src.company_id, v_src.quotation_no, v_max_rev + 1, v_src.inquiry_id,
    v_src.prospect_id, v_src.customer_id,
    v_src.service_type, v_src.valid_until, v_src.payment_terms_id,
    v_src.currency_code, v_src.notes, v_src.terms,
    v_src.subtotal, v_src.tax_amount, v_src.total_amount, 'DRAFT',
    v_src.usd_rate, v_src.route, v_src.pricing_done_at, v_src.discount_pct,
    v_src.margin_floor, v_src.internal_notes, CURRENT_DATE, v_src.vat_rate,
    v_src.attention_to, v_src.pickup_address, v_src.delivery_address,
    v_src.cargo_mode, v_src.gw, v_src.dimension, v_src.cw, v_src.cbm,
    v_src.container_type, v_src.container_qty,
    v_src.exchange_rates, v_src.prf_id,
    auth.uid(), now(), now()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.quotation_items (
    quotation_id, sort_order, description, qty, unit, unit_price, notes,
    group_name, currency, unit_label, exchange_rate, total, cost_price, if_any
  )
  SELECT v_new_id, sort_order, description, qty, unit, unit_price, notes,
         group_name, currency, unit_label, exchange_rate, total, cost_price, if_any
  FROM public.quotation_items
  WHERE quotation_id = p_quotation_id
  ORDER BY sort_order;

  UPDATE public.quotations
  SET    status = 'SUPERSEDED', updated_at = now(), updated_by = auth.uid()
  WHERE  id = p_quotation_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada izin mengubah quotation ini (RLS).';
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_quotation_revision(p_quotation_id uuid) IS
  'Lahirkan revisi berikutnya: sumber -> SUPERSEDED, baris baru revision=MAX+1 nomor SAMA status DRAFT, items disalin. Satu transaksi. SECURITY INVOKER: gate utama = RLS quotations_update/insert + UPDATE akhir lewat trg_fn_lock_quotation_closed_inquiry (TASK 6). TD-318 Irisan 3: SUPERSEDED boleh direvisi bila berasal dari auto-close Won (awalan rejection_reason) DAN inquiry induk sudah tidak WON/LOST/CANCELLED (celah Revert, final decision A.1).';

COMMIT;

-- =============================================================================
-- ROLLBACK:
--
--   DROP TRIGGER IF EXISTS trg_z_inquiry_won_on_quotation_accepted ON public.quotations;
--   DROP FUNCTION IF EXISTS public.trg_fn_inquiry_won_on_quotation_accepted();
--
--   -- log_inquiry_status_change, trg_fn_lock_quotation_closed_inquiry,
--   -- trg_fn_lock_quotation_items_closed_inquiry, trg_fn_quotation_auto_
--   -- close_on_inquiry_closed, create_quotation_revision: CREATE OR REPLACE
--   -- balik ke badan SEBELUM migrasi ini -- badan "sebelum" untuk yang
--   -- berasal dari 20261012000007 ada di file itu; untuk log_inquiry_status_
--   -- change dan create_quotation_revision badan "sebelum" ada di
--   -- schema_snapshot.sql (:3355-3397 dan :845-928).
--
--   DROP TRIGGER IF EXISTS trg_z_quotation_auto_close_on_inquiry_closed ON public.inquiries;
--   CREATE TRIGGER trg_z_quotation_auto_close_on_inquiry_closed
--     AFTER UPDATE OF status ON public.inquiries FOR EACH ROW
--     WHEN ((new.status::text = ANY (ARRAY['LOST','CANCELLED']::text[])) AND old.status IS DISTINCT FROM new.status)
--     EXECUTE FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed();
--
--   DROP FUNCTION IF EXISTS public.revert_manual_win(uuid,text);
--
--   DROP FUNCTION IF EXISTS public.mark_inquiry_won(uuid,text,text,text);
--   CREATE FUNCTION public.mark_inquiry_won(p_inquiry_id uuid) RETURNS void ...
--     -- (badan 1-argumen lama, schema_snapshot.sql:3519-3577)
--
--   DROP POLICY IF EXISTS inquiry_won_evidence_insert ON storage.objects;
--   DROP POLICY IF EXISTS inquiry_won_evidence_read   ON storage.objects;
--   -- BUCKET inquiry-won-evidence DAN ISINYA TIDAK IKUT DIHAPUS -- bisa
--   -- sudah berisi bukti Won nyata. Hapus manual, hanya kalau sudah kosong.
--
--   ALTER TABLE public.inquiries
--     DROP COLUMN IF EXISTS won_evidence_path,
--     DROP COLUMN IF EXISTS revert_won_reason;
-- =============================================================================
