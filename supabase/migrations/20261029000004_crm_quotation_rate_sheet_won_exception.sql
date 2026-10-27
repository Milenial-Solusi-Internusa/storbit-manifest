-- =============================================================================
-- Migration: 20261029000004_crm_quotation_rate_sheet_won_exception
-- Inquiry Management Putaran 12 -- Butir 6: TD-324 / mockup rule 109 --
-- pengecualian Rate Sheet pada penguncian quotation saat inquiry Won.
--
-- Status: DITULIS UNTUK REVIEW. BELUM DIJALANKAN di staging maupun production.
--
-- TANPA DROP -- 4 fungsi di-CREATE OR REPLACE dengan signature IDENTIK
-- (ketiga trigger function 0-argumen, create_quotation_revision(uuid)).
-- Boleh dijalankan lewat connector Vir.
--
-- REFERENSI: TD-324 (docs/Governance/08_TECH_DEBT.md) -- status "DITERIMA,
-- bukan bug" (21 Okt 2026) DIBALIK oleh keputusan Den 27 Okt 2026. Rule 109
-- (design-handoff/mockup/nexus-notes.js): "a Rate Sheet quotation that is
-- Accepted may still be revised (Create Revision stays enabled and its
-- quotations are not superseded) ... Do not apply this rule to Rate Sheet
-- quotations." Label "D-76" yang dipakai sesi 27 Okt 2026 HANYA penanda di
-- laporan audit, BUKAN dokumen tercatat -- commit ini mengacu TD-324 +
-- rule 109, bukan "D-76".
--
-- PEMBANDINGAN BADAN FUNGSI TERHADAP MIGRASI TERAKHIR (wajib sebelum
-- CREATE OR REPLACE, per instruksi eksekusi) --
--   trg_fn_quotation_auto_close_on_inquiry_closed() -- badan TERAKHIR BUKAN
--     di 20261021000001 (yang direncanakan semula), melainkan di
--     20261022000002 (TASK 3, CREATE OR REPLACE lagi) -- menambah cabang
--     CANCELLED+duplicate_of_id ('Otomatis: inquiry ditutup sebagai
--     duplikat' -> SUPERSEDED) DI DALAM blok IF NEW.status='CANCELLED'.
--     20261026000004/20261027000005 HANYA menyebutnya di komentar (audit
--     "fungsi mana yang menulis accepted_* "), TIDAK meng-CREATE OR REPLACE.
--     Migrasi ini memakai badan 20261022000002 sebagai dasar, cabang
--     CANCELLED/LOST (termasuk sub-cabang duplicate_of_id) DIBIARKAN UTUH
--     -- HANYA cabang WON yang disentuh.
--   trg_fn_lock_quotation_closed_inquiry() -- badan TERAKHIR tetap
--     20261021000001 TASK 6 (dikonfirmasi: 20261022000002 eksplisit
--     "Nol perubahan ke trg_fn_lock_quotation_closed_inquiry()").
--   trg_fn_lock_quotation_items_closed_inquiry() -- sama, 20261021000001
--     TASK 6, tidak disentuh migrasi mana pun sejak itu.
--   create_quotation_revision(uuid) -- badan TERAKHIR tetap 20261021000001
--     TASK 10 (dikonfirmasi: 20260909000002/3/4 lebih lama/superseded;
--     20261026000001/20261026000004 HANYA menyebutnya di komentar audit
--     SECURITY INVOKER, TIDAK meng-CREATE OR REPLACE).
--
-- =============================================================================
-- DESAIN (koreksi Den 27 Okt 2026, "aturan 16" -- harga quotation ACCEPTED
-- terkunci sampai validity Rate Sheet habis)
-- =============================================================================
-- Rate Sheet quotation mengenali induknya lewat JOIN ke inquiries.inquiry_
-- type='Rate Sheet Request' -- TIDAK butuh kolom baru (bertentangan dgn
-- asumsi TD-324 sendiri soal "Nexus tidak punya konsep tipe quotation Rate
-- Sheet").
--
-- (1) trg_fn_quotation_auto_close_on_inquiry_closed -- cabang WON: kalau
--     NEW.inquiry_type = 'Rate Sheet Request', SELURUH sweep (supersede
--     sibling DRAFT/SUBMITTED/SENT) DILEWATI. Cabang CANCELLED/LOST TIDAK
--     berubah untuk SEMUA inquiry_type (rule 109 cuma soal "Won closes the
--     quotations").
-- (2) trg_fn_lock_quotation_closed_inquiry / _items_ -- DIPISAH dua kasus
--     untuk status WON: (a) inquiry_type BUKAN Rate Sheet -> perilaku LAMA,
--     tetap terkunci; (b) inquiry_type = Rate Sheet -> HANYA baris/item
--     quotation BERSTATUS ACCEPTED yang TETAP terkunci (aturan 16 -- harga
--     yang sudah disetujui tidak boleh berubah selama validity berjalan);
--     baris/item NON-ACCEPTED (termasuk INSERT revisi baru berstatus DRAFT)
--     TIDAK diblokir -- itulah "Create Revision stays enabled" di rule 109.
--     LOST/CANCELLED TIDAK berubah untuk SEMUA inquiry_type.
-- (3) create_quotation_revision -- cabang baru: v_src.status='ACCEPTED' DAN
--     inquiry induk inquiry_type='Rate Sheet Request' -> revisi DIIZINKAN,
--     DAN langkah "tandai baris lama SUPERSEDED" DILEWATI (v_skip_supersede)
--     -- PERSIS rule 109 "its quotations are not superseded". Baris ACCEPTED
--     lama TETAP ACCEPTED (dan tetap terkunci oleh (2) di atas); baris
--     revisi BARU lahir DRAFT, bisa diedit bebas sampai di-Send lagi.
--     Cabang SUPERSEDED-karena-Won (celah Revert, final decision A.1) TIDAK
--     disentuh.
--
-- DIPERIKSA (diminta Den) -- TIDAK ADA unique constraint/index yang
-- melarang dua baris quotation "aktif" (non-SUPERSEDED) pada satu
-- quotation_no/inquiry: `grep -rn "CREATE UNIQUE INDEX\|ADD CONSTRAINT.*UNIQUE" supabase/migrations/*.sql | grep -i quotation`
-- = NOL HIT. Mekanisme "satu revisi baru per quotation_no" SELAMA INI sudah
-- bergantung pada v_max_rev (MAX(revision) WHERE quotation_no=...), BUKAN
-- constraint DB -- create_quotation_revision SUDAH menghasilkan banyak
-- baris per quotation_no (satu per revisi) sejak awal dibuat; cabang baru
-- di atas HANYA menambah satu kombinasi baru (ACCEPTED + DRAFT hidup
-- berdampingan), tidak melanggar constraint apa pun karena memang tidak ada.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- (1) trg_fn_quotation_auto_close_on_inquiry_closed -- dasar: 20261022000002
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

    -- Putaran 12 Butir 6 (TD-324, rule 109) -- Rate Sheet exception: Won
    -- SAMA SEKALI tidak menutup paksa quotation sibling untuk Rate Sheet
    -- Request -- "its quotations are not superseded".
    IF NEW.inquiry_type = 'Rate Sheet Request' THEN
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

REVOKE EXECUTE ON FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() IS
  'Saat inquiries.status berubah ke LOST/CANCELLED/WON, tutup paksa quotation DRAFT/SUBMITTED/SENT milik inquiry itu. LOST -> REJECTED tanpa syarat. CANCELLED -> REJECTED biasa, KECUALI NEW.duplicate_of_id IS NOT NULL (Close as Duplicate, Irisan 4) -> SUPERSEDED. WON -> SUPERSEDED, HANYA bila NEW.won_reason IS NOT NULL (Mark Won manual / Quotation Accepted) DAN NEW.inquiry_type <> ''Rate Sheet Request'' (Putaran 12 Butir 6, TD-324/rule 109 -- Rate Sheet TIDAK pernah disapu oleh Won). SECURITY DEFINER -- lihat catatan header migrasi 20261012000007 (trigger asal), 20261021000001 (perluasan WON), 20261022000002 (perluasan CANCELLED-duplikat), dan 20261029000004 (pengecualian Rate Sheet).';

-- ─────────────────────────────────────────────────────────────────────────
-- (2a) trg_fn_lock_quotation_closed_inquiry -- dasar: 20261021000001 TASK 6
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_lock_quotation_closed_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_inquiry_status text;
  v_inquiry_type   text;
BEGIN
  IF current_setting('nexus.quotation_auto_close', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.inquiry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, inquiry_type INTO v_inquiry_status, v_inquiry_type
  FROM public.inquiries
  WHERE id = NEW.inquiry_id;

  IF v_inquiry_status IN ('LOST', 'CANCELLED') THEN
    RAISE EXCEPTION
      'Quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
  END IF;

  IF v_inquiry_status = 'WON' THEN
    IF v_inquiry_type IS DISTINCT FROM 'Rate Sheet Request' THEN
      RAISE EXCEPTION
        'Quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'ACCEPTED' THEN
      -- Putaran 12 Butir 6, aturan 16 -- harga quotation Rate Sheet yang
      -- SUDAH Accepted tetap terkunci sampai validity habis; pengecualian
      -- Rate Sheet HANYA membuka baris NON-ACCEPTED (termasuk INSERT revisi
      -- baru berstatus DRAFT, lihat create_quotation_revision di bawah).
      RAISE EXCEPTION
        'This quotation is Accepted and its price is locked -- create a new revision instead of editing it directly.';
    END IF;
    -- Rate Sheet WON + (INSERT revisi baru ATAU UPDATE baris non-ACCEPTED)
    -- -> dilewatkan, lihat header migrasi.
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_lock_quotation_closed_inquiry() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_lock_quotation_closed_inquiry() IS
  'Tolak INSERT/UPDATE pada quotations kalau inquiry induknya LOST/CANCELLED, atau WON dan BUKAN Rate Sheet. Untuk Rate Sheet WON (Putaran 12 Butir 6, TD-324/rule 109): HANYA baris berstatus ACCEPTED yang tetap terkunci (aturan 16); baris lain (termasuk INSERT revisi baru) TIDAK diblokir. Pengecualian: update cascading (GUC nexus.quotation_auto_close). SECURITY DEFINER -- lihat catatan header migrasi 20261012000007.';

-- ─────────────────────────────────────────────────────────────────────────
-- (2b) trg_fn_lock_quotation_items_closed_inquiry -- dasar: 20261021000001
-- TASK 6
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_quotation_id     uuid;
  v_quotation_status text;
  v_inquiry_status   text;
  v_inquiry_type     text;
BEGIN
  v_quotation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.quotation_id ELSE NEW.quotation_id END;

  SELECT q.status, i.status, i.inquiry_type
    INTO v_quotation_status, v_inquiry_status, v_inquiry_type
  FROM public.quotations q
  JOIN public.inquiries  i ON i.id = q.inquiry_id
  WHERE q.id = v_quotation_id;

  IF v_inquiry_status IN ('LOST', 'CANCELLED') THEN
    RAISE EXCEPTION
      'Item quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
  END IF;

  IF v_inquiry_status = 'WON' THEN
    IF v_inquiry_type IS DISTINCT FROM 'Rate Sheet Request' THEN
      RAISE EXCEPTION
        'Item quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
    ELSIF v_quotation_status = 'ACCEPTED' THEN
      -- Putaran 12 Butir 6, aturan 16 -- item quotation Rate Sheet yang
      -- induknya SUDAH Accepted tetap terkunci; hanya item revisi BARU
      -- (quotation berstatus DRAFT dst) yang boleh diubah.
      RAISE EXCEPTION
        'This quotation is Accepted and its price is locked -- create a new revision instead of editing its items directly.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() IS
  'Tolak INSERT/UPDATE/DELETE pada quotation_items kalau quotation induknya (via inquiry_id) LOST/CANCELLED, atau WON dan inquiry BUKAN Rate Sheet. Untuk Rate Sheet WON (Putaran 12 Butir 6): item TETAP terkunci HANYA kalau quotation induknya ACCEPTED (aturan 16); item quotation lain (revisi baru) tidak diblokir. Defense-in-depth, nol GUC bypass. SECURITY DEFINER karena alasan yang sama dgn trg_fn_lock_quotation_closed_inquiry.';

-- ─────────────────────────────────────────────────────────────────────────
-- (3) create_quotation_revision -- dasar: 20261021000001 TASK 10
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
  v_inquiry_type   text;
  v_skip_supersede boolean := false;
BEGIN
  SELECT * INTO v_src
  FROM public.quotations
  WHERE id = p_quotation_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin baca (RLS).';
  END IF;

  IF v_src.status NOT IN ('SENT','REJECTED') THEN
    SELECT status, inquiry_type INTO v_inquiry_status, v_inquiry_type
    FROM public.inquiries WHERE id = v_src.inquiry_id;

    IF v_src.status = 'ACCEPTED' AND v_inquiry_type = 'Rate Sheet Request' THEN
      -- Putaran 12 Butir 6 (TD-324, rule 109): quotation Rate Sheet yang
      -- ACCEPTED tetap boleh direvisi (versi dibandingkan sel demi sel).
      -- Baris lama TIDAK disupersede ("its quotations are not superseded")
      -- -- tetap ACCEPTED, dan tetap terkunci oleh trg_fn_lock_quotation_
      -- closed_inquiry/_items_ di atas (aturan 16). Baris revisi BARU lahir
      -- DRAFT, bebas diedit sampai di-Send lagi.
      v_skip_supersede := true;
    ELSIF v_src.status = 'SUPERSEDED' AND v_src.rejection_reason LIKE 'Otomatis: inquiry ditandai Won%' THEN
      -- Celah Revert (final decision A.1, TIDAK disentuh migrasi ini):
      -- quotation yang di-SUPERSEDE OTOMATIS karena inquiry-nya sempat Won
      -- lalu di-revert, boleh direvisi SELAMA inquiry induknya tidak lagi
      -- tertutup.
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

  IF NOT v_skip_supersede THEN
    UPDATE public.quotations
    SET    status = 'SUPERSEDED', updated_at = now(), updated_by = auth.uid()
    WHERE  id = p_quotation_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Tidak ada izin mengubah quotation ini (RLS).';
    END IF;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL     ON FUNCTION public.create_quotation_revision(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_quotation_revision(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_quotation_revision(p_quotation_id uuid) IS
  'Lahirkan revisi berikutnya: sumber -> SUPERSEDED (KECUALI Rate Sheet ACCEPTED, Putaran 12 Butir 6 -- lihat di bawah), baris baru revision=MAX+1 nomor SAMA status DRAFT, items disalin. Satu transaksi. SECURITY INVOKER: gate utama = RLS quotations_update/insert + UPDATE akhir lewat trg_fn_lock_quotation_closed_inquiry. TD-318 Irisan 3: SUPERSEDED boleh direvisi bila berasal dari auto-close Won (awalan rejection_reason) DAN inquiry induk sudah tidak WON/LOST/CANCELLED (celah Revert, final decision A.1). Putaran 12 Butir 6 (TD-324/rule 109): quotation Rate Sheet berstatus ACCEPTED boleh direvisi TANPA disupersede -- baris ACCEPTED lama tetap ACCEPTED (tetap terkunci, aturan 16), baris revisi baru lahir DRAFT.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname IN (
--    'trg_fn_quotation_auto_close_on_inquiry_closed',
--    'trg_fn_lock_quotation_closed_inquiry',
--    'trg_fn_lock_quotation_items_closed_inquiry',
--    'create_quotation_revision');
--  -- ketiga trigger function: prosecdef=true. create_quotation_revision: prosecdef=false (SECURITY INVOKER, tidak berubah).
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-12.sql untuk uji self-rollback
-- (V7: Rate Sheet WON tidak menyapu sibling + ACCEPTED/item tetap terkunci +
-- revisi baru bisa diedit + Single Shipment tidak berubah).
--
-- Rollback (CREATE OR REPLACE balik ke badan SEBELUM migrasi ini):
--   trg_fn_quotation_auto_close_on_inquiry_closed -- badan 20261022000002.
--   trg_fn_lock_quotation_closed_inquiry / _items_ -- badan 20261021000001 TASK 6.
--   create_quotation_revision -- badan 20261021000001 TASK 10.
-- =============================================================================
