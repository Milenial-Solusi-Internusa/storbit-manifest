-- =============================================================================
-- Migration: 20261022000002_crm_inquiry_close_as_duplicate
-- Inquiry Management Irisan 4 -- Lingkup B (Close as Duplicate)
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging.
-- Dependensi:
--   - 20261012000007_crm_quotation_lock_on_closed_inquiry.sql (lock triggers
--     trg_fn_lock_quotation_closed_inquiry / quotation_items -- SUDAH
--     menolak tulis quotation saat inquiry CANCELLED, TIDAK disentuh migrasi
--     ini -- status CANCELLED dari Close as Duplicate otomatis terkunci).
--   - 20261021000001_crm_inquiry_won_manual_revert_and_auto.sql (badan
--     trg_fn_quotation_auto_close_on_inquiry_closed() yang DIPERLUAS di
--     TASK 3 bawah -- migrasi ini CREATE OR REPLACE di atas versi itu;
--     WAJIB jalan sesudahnya, kalau belum fungsi itu belum ada).
--
-- RINGKASAN
-- "Close as Duplicate" menutup inquiry duplikat sebagai CANCELLED + pointer
-- duplicate_of_id ke inquiry yang dipertahankan (status AWAL harus bukan
-- CANCELLED/LOST; WON pun boleh ditutup sbg duplikat -- lihat gate di RPC).
-- Status CANCELLED DIPAKAI ULANG (bukan status 'Duplicate' fiktif ala
-- mockup) -- dibedakan lewat kolom duplicate_of_id. Quotation anak langsung
-- ikut SUPERSEDED + terkunci (bukan REJECTED) lewat SATU baris kondisi baru
-- di trigger existing -- pola "extend trigger body dgn cabang baru digerbang
-- kolom sentinel" yang sudah dipakai TASK 5 migrasi 20261021000001 sendiri.
--
-- TASK 1 -- kolom duplicate_of_id + guard "hanya lewat RPC"
-- owner inquiry boleh UPDATE barisnya sendiri lewat RLS (inquiries_update),
-- jadi kolom ini TIDAK CUKUP dilindungi RLS saja -- RLS tidak tahu "ini
-- ditulis API publik atau RPC resmi". Trigger BEFORE UPDATE OF
-- duplicate_of_id menolak PERUBAHAN apa pun pada kolom ini kecuali penanda
-- transaksi-lokal nexus.inquiry_duplicate_close = 'on' -- pola IDENTIK
-- nexus.quotation_auto_close yang sudah dipakai trg_fn_quotation_auto_close_
-- on_inquiry_closed(). Aturan ini TIDAK bergantung jalur pemanggil (role,
-- RLS, dsb) -- hanya bergantung siapa yang menyalakan penanda itu, dan
-- satu-satunya kode yang menyalakannya adalah close_inquiry_as_duplicate()
-- di bawah.
-- =============================================================================

BEGIN;

ALTER TABLE public.inquiries
  ADD COLUMN duplicate_of_id uuid REFERENCES public.inquiries(id);

COMMENT ON COLUMN public.inquiries.duplicate_of_id IS
  'Diisi HANYA oleh close_inquiry_as_duplicate() -- menunjuk inquiry yang DIPERTAHANKAN. Tulisan langsung ke kolom ini ditolak trigger trg_z_lock_inquiry_duplicate_of kecuali lewat RPC itu. NULL = bukan duplikat siapa pun.';

CREATE FUNCTION public.lock_inquiry_duplicate_of_when_direct() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.duplicate_of_id IS DISTINCT FROM OLD.duplicate_of_id
     AND current_setting('nexus.inquiry_duplicate_close', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'inquiries.duplicate_of_id hanya boleh diubah lewat close_inquiry_as_duplicate(), bukan UPDATE langsung.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.lock_inquiry_duplicate_of_when_direct() IS
  'Menolak perubahan inquiries.duplicate_of_id kecuali penanda transaksi-lokal nexus.inquiry_duplicate_close=on (dinyalakan HANYA oleh close_inquiry_as_duplicate()). Pola identik nexus.quotation_auto_close. Dipasang migrasi 20261022000002.';

DROP TRIGGER IF EXISTS trg_z_lock_inquiry_duplicate_of ON public.inquiries;
CREATE TRIGGER trg_z_lock_inquiry_duplicate_of
  BEFORE UPDATE OF duplicate_of_id ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_inquiry_duplicate_of_when_direct();

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 2 -- close_inquiry_as_duplicate(p_inquiry_id, p_keep_inquiry_id)
--
-- Validasi (urutan menentukan pesan galat yang diterima user):
--   1. inquiry & kept inquiry harus ada.
--   2. Gate: is_manager_or_above_in(company_id inquiry YANG DITUTUP) ATAU
--      is_super_admin() -- pola mark_inquiry_won/revert_manual_win.
--   3. Bukan menutup dirinya sendiri.
--   4. Status inquiry yang ditutup BUKAN CANCELLED/LOST (WON & status
--      terbuka boleh -- keputusan Mas eksplisit).
--   5. Satu entitas (company_id sama, TANPA kecualian super_admin -- aturan
--      flat, dikonfirmasi Mas).
--   6. Anti-rantai: kept TIDAK sedang jadi duplikat siapa pun (duplicate_of_id
--      IS NULL), dan inquiry yang ditutup TIDAK SEDANG jadi acuan (kept)
--      bagi duplikat lain (NOT EXISTS ... duplicate_of_id = p_inquiry_id).
--   7. kept dibuat lebih dulu ATAU BERSAMAAN (created_at <=) dibanding yang
--      ditutup -- "lebih dulu" ditegakkan sbg created_at kept <= created_at
--      yang ditutup.
--
-- closed_at/closed_by DITIMPA EKSPLISIT (bukan dibiarkan ke trigger
-- stamp_inquiry_closure()'s COALESCE) -- TEMUAN PENTING: kalau inquiry yang
-- ditutup SEBELUMNYA berstatus WON, closed_at/closed_by LAMA (dari closure
-- WON) sudah TERISI, dan COALESCE(NEW.closed_at, now()) di
-- stamp_inquiry_closure() akan MEMPERTAHANKAN nilai WON yang lama -- bukan
-- mencatat momen penutupan-sebagai-duplikat yang sebenarnya. Pola yang sama
-- dengan revert_manual_win yang eksplisit mengosongkan closed_at/closed_by
-- saat membalik status; di sini kita eksplisit MENIMPA dengan nilai BARU
-- karena ini closure genuinely baru, bukan pembalikan.
--
-- Notifikasi: ke OWNER inquiry yang ditutup (bukan reports_to pemanggil --
-- pola BEDA dari mark_inquiry_won, lebih dekat ke pola "notify pemilik
-- objek yang berubah" ala Option Requests/Lead Pool). Dilewati kalau owner
-- adalah pemanggil sendiri (menutup inquiry milik sendiri -- notifikasi ke
-- diri sendiri tidak berguna) atau profil owner sudah nonaktif. Best-effort.
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.close_inquiry_as_duplicate(p_inquiry_id uuid, p_keep_inquiry_id uuid)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_company_id      uuid;
  v_status          text;
  v_inquiry_no      text;
  v_created_at      timestamptz;
  v_owner_id        uuid;
  v_keep_company_id uuid;
  v_keep_no         text;
  v_keep_created_at timestamptz;
  v_keep_dup_of     uuid;
  v_owner_company_id uuid;
  v_user_email      text;
  v_user_full_name  text;
  v_user_role       text;
BEGIN
  SELECT company_id, status, inquiry_no, created_at, owner_id
    INTO v_company_id, v_status, v_inquiry_no, v_created_at, v_owner_id
    FROM public.inquiries WHERE id = p_inquiry_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_manager_or_above_in(v_company_id)) THEN
    RAISE EXCEPTION 'Hanya Manager ke atas di entitas inquiry ini, atau Super Admin, yang boleh menutup inquiry sebagai duplikat.';
  END IF;

  IF p_inquiry_id = p_keep_inquiry_id THEN
    RAISE EXCEPTION 'Inquiry tidak bisa ditutup sebagai duplikat dari dirinya sendiri.';
  END IF;

  IF v_status IN ('CANCELLED', 'LOST') THEN
    RAISE EXCEPTION 'Inquiry berstatus % tidak bisa ditutup sebagai duplikat.', v_status;
  END IF;

  SELECT company_id, inquiry_no, created_at, duplicate_of_id
    INTO v_keep_company_id, v_keep_no, v_keep_created_at, v_keep_dup_of
    FROM public.inquiries WHERE id = p_keep_inquiry_id;
  IF v_keep_company_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry yang dipertahankan tidak ditemukan.';
  END IF;

  IF v_keep_company_id <> v_company_id THEN
    RAISE EXCEPTION 'Inquiry yang dipertahankan harus berada di entitas yang sama dengan inquiry yang ditutup.';
  END IF;

  IF v_keep_dup_of IS NOT NULL THEN
    RAISE EXCEPTION 'Inquiry yang dipertahankan sudah menjadi duplikat inquiry lain -- tidak bisa dijadikan rantai duplikat.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inquiries WHERE duplicate_of_id = p_inquiry_id) THEN
    RAISE EXCEPTION 'Inquiry ini sedang menjadi acuan (dipertahankan) untuk duplikat lain -- tidak bisa ditutup sebagai duplikat.';
  END IF;

  IF v_keep_created_at > v_created_at THEN
    RAISE EXCEPTION 'Inquiry yang dipertahankan harus dibuat lebih dulu atau bersamaan dengan inquiry yang ditutup.';
  END IF;

  PERFORM set_config('nexus.inquiry_duplicate_close', 'on', true);

  UPDATE public.inquiries
  SET    status          = 'CANCELLED',
         duplicate_of_id = p_keep_inquiry_id,
         cancel_reason   = 'Closed as duplicate of ' || v_keep_no,
         closed_at       = now(),
         closed_by       = auth.uid(),
         updated_at      = now()
  WHERE  id = p_inquiry_id;

  PERFORM set_config('nexus.inquiry_duplicate_close', 'off', true);

  SELECT email, full_name INTO v_user_email, v_user_full_name FROM public.profiles WHERE id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'CLOSE_INQUIRY_AS_DUPLICATE', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('status', v_status),
          jsonb_build_object('status', 'CANCELLED', 'duplicate_of_id', p_keep_inquiry_id, 'duplicate_of_no', v_keep_no),
          NULL);

  IF v_owner_id IS NOT NULL AND v_owner_id <> auth.uid() THEN
    BEGIN
      SELECT company_id INTO v_owner_company_id FROM public.profiles WHERE id = v_owner_id AND active = true;
      IF v_owner_company_id IS NOT NULL THEN
        INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
        VALUES (v_owner_company_id, v_owner_id, 'inquiry_closed_as_duplicate', 'Inquiry closed as duplicate',
                v_inquiry_no || ' was closed as a duplicate of ' || v_keep_no || ' by ' || COALESCE(v_user_full_name, v_user_email) || '.',
                'inquiry', p_inquiry_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.close_inquiry_as_duplicate(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_inquiry_as_duplicate(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.close_inquiry_as_duplicate(uuid, uuid) IS
  'Tutup inquiry duplikat sebagai CANCELLED + duplicate_of_id. Gate: is_manager_or_above_in(company_id) ATAU is_super_admin(). Status asal wajib BUKAN CANCELLED/LOST. Kept harus satu entitas, dibuat lebih dulu/bersamaan, bukan dirinya sendiri jadi duplikat (anti-rantai dua arah). closed_at/closed_by ditimpa eksplisit (lihat komentar di atas definisi -- kasus WON->CANCELLED-duplikat). Menulis duplicate_of_id lewat penanda nexus.inquiry_duplicate_close -- dibaca trg_fn_quotation_auto_close_on_inquiry_closed (TASK 3) untuk men-supersede quotation anak.';

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 3 -- trg_fn_quotation_auto_close_on_inquiry_closed: SATU cabang baru
-- di dalam blok CANCELLED, digerbang NEW.duplicate_of_id. Badan fungsi
-- disalin VERBATIM dari 20261021000001 kecuali blok IF NEW.status =
-- 'CANCELLED' -- pola "extend, jangan tulis ulang" yang sudah dipakai
-- migrasi itu sendiri untuk cabang WON.
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
    IF NEW.duplicate_of_id IS NOT NULL THEN
      -- Close as Duplicate (Irisan 4, Lingkup B) -- quotation anak ikut
      -- SUPERSEDED+terkunci (bukan REJECTED biasa), karena inquiry-nya tidak
      -- "kalah"/"dibatalkan" dalam arti bisnis, melainkan DIGANTIKAN oleh
      -- inquiry yang dipertahankan.
      v_reason_label  := 'Otomatis: inquiry ditutup sebagai duplikat';
      v_reason_detail := NULL;
      v_new_status    := 'SUPERSEDED';
    ELSE
      v_reason_label  := 'Otomatis: inquiry ditandai Cancelled';
      v_reason_detail := NEW.cancel_reason;
      v_new_status    := 'REJECTED';
    END IF;
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
    -- tidak berdasar. Hanya Mark Won manual (TASK 3 migrasi 20261021000001)
    -- dan Quotation Accepted (TASK 7 migrasi itu) berhak men-supersede --
    -- keduanya mengisi won_reason DI UPDATE YANG SAMA dengan status='WON',
    -- jadi NEW.won_reason sudah terisi saat trigger ini membaca NEW. Kalau
    -- NULL, berhenti tanpa menyentuh quotation apa pun -- penguncian (lock
    -- trigger) TETAP menyala untuk jalur SO, hanya SUPERSEDE yang tidak.
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
  'Saat inquiries.status berubah ke LOST/CANCELLED/WON, tutup paksa quotation DRAFT/SUBMITTED/SENT milik inquiry itu. LOST -> REJECTED tanpa syarat. CANCELLED -> REJECTED biasa, KECUALI NEW.duplicate_of_id IS NOT NULL (Close as Duplicate, Irisan 4) -> SUPERSEDED. WON -> SUPERSEDED, HANYA bila NEW.won_reason IS NOT NULL (Mark Won manual / Quotation Accepted) -- jalur set_inquiry_won_on_so dilewati (TD-318 Irisan 3). SECURITY DEFINER -- lihat catatan header migrasi 20261012000007 (trigger asal), 20261021000001 (perluasan WON), dan 20261022000002 (perluasan CANCELLED-duplikat).';

-- Nol perubahan ke trg_fn_lock_quotation_closed_inquiry() / lock quotation
-- items (20261012000007): keduanya SUDAH menolak tulis quotation saat
-- inquiry CANCELLED -- "disengaja dilewati" TIDAK berlaku di sini, CANCELLED
-- sudah ada di WHEN-nya sejak awal. Close as Duplicate otomatis terkunci.
-- Nol perubahan ke log_inquiry_status_change(): cabang CANCELLED-nya sudah
-- membaca NEW.cancel_reason, dan kita mengisi cancel_reason dengan
-- 'Closed as duplicate of ...' di TASK 2 -- riwayat status otomatis benar.

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- 1) Kolom + trigger guard + RPC terpasang:
-- SELECT column_name FROM information_schema.columns WHERE table_name='inquiries' AND column_name='duplicate_of_id';
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.inquiries'::regclass AND tgname='trg_z_lock_inquiry_duplicate_of';
-- SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='close_inquiry_as_duplicate';
--
-- Rollback (sebelum ada baris memakainya):
--   DROP FUNCTION public.close_inquiry_as_duplicate(uuid,uuid);
--   DROP TRIGGER trg_z_lock_inquiry_duplicate_of ON public.inquiries;
--   DROP FUNCTION public.lock_inquiry_duplicate_of_when_direct();
--   ALTER TABLE public.inquiries DROP COLUMN duplicate_of_id;
--   -- lalu CREATE OR REPLACE trg_fn_quotation_auto_close_on_inquiry_closed()
--   -- dengan badan versi 20261021000001 (tanpa cabang duplicate_of_id).
-- =============================================================================
