-- =============================================================================
-- Migration: 20260909000003_quotation_revision_rpcs
-- Phase:     Quotation versioning & approval (3/5) — dua RPC inti.
-- Depends:   20260909000001 (kolom accepted_*/rejection_reason HARUS sudah ada)
--            20260909000002 (RLS jamak — RPC INVOKER bergantung penuh padanya)
-- Status:    LIVE — staging 9 Sep 2026, produksi 9 Sep 2026.
--
-- ⚠️ URUTAN: jalankan SETELAH 20260909000001 DAN 20260909000002.
--    Tanpa kolomnya, CREATE FUNCTION ini akan "berhasil" (PL/pgSQL tidak
--    me-resolve nama kolom saat CREATE) lalu GAGAL SAAT DIPANGGIL — persis
--    kelas bug yang menjatuhkan 20260821000009 selama 5 hari (TD-212).
--    Tanpa 000002, alur revisi patah senyap untuk user multi-entitas.
--
-- SECURITY INVOKER (tanpa klausa = default) — DISENGAJA, bukan kelalaian.
--   Keputusan Den #5: "gate yang SAMA kayak quotations_update, jangan bikin
--   gate baru yang lebih ketat". Cara paling jujur memenuhinya adalah
--   membiarkan RLS ITU SENDIRI yang menjaga, bukan menyalin daftar role ke
--   dalam fungsi — TD-233 sudah mencatat daftar itu hidup di lima tempat,
--   jangan jadi enam.
--
--   PRESEDEN SE-MODUL: save_quotation (schema_snapshot.sql:3270) juga INVOKER
--   dan mendeteksi tolakan RLS lewat GET DIAGNOSTICS ROW_COUNT = 0.
--   ⚠️ Ini SENGAJA BERBEDA dari pola FASE 5 Storbit (create_invoice /
--      record_payment / mark_ttf_received / set_sp_finance_docs) yang semuanya
--      SECURITY DEFINER karena harus menembus RLS tabel lain. Dua kebutuhan
--      berbeda — JANGAN diseragamkan tanpa keputusan baru.
--
-- ACL mengikuti FASE 5: REVOKE ALL FROM PUBLIC + GRANT EXECUTE ke authenticated,
--   NOL anon. Ini membuat kedua fungsi LEBIH KETAT dari save_quotation, yang
--   sampai hari ini tidak punya REVOKE sama sekali (kerabat TD-232).
--
-- ⚠️ KONSEKUENSI YANG DITERIMA SADAR (keputusan Den, sesi ini):
--   Karena INVOKER, GRANT ALL ON TABLE quotations TO authenticated (:20864)
--   TIDAK dipersempit. Artinya PostgREST tetap bisa PATCH status='ACCEPTED'
--   langsung, melewati kedua fungsi ini — accepted_at/accepted_by kosong dan
--   seluruh guard di bawah terlewati. Lubang ini DICATAT sebagai tech debt
--   baru, TIDAK ditutup di sini. Menutupnya menuntut SECURITY DEFINER +
--   GRANT kolom (preseden sp_payments, 17 Agu 2026) = keputusan terpisah.
-- =============================================================================


-- ─── 1. create_quotation_revision ────────────────────────────────────────────
--  Lahirkan versi berikutnya dari satu quotation.
--
--  SATU TRANSAKSI, TIGA AKIBAT:
--    (1) baris sumber -> SUPERSEDED
--    (2) baris baru   -> quotation_no SAMA, revision = MAX+1, status DRAFT
--    (3) seluruh quotation_items sumber DISALIN ke baris baru
--  Tiga UPDATE/INSERT dari FE bisa sukses separuh; satu fungsi = mustahil
--  separuh. Alasan yang sama persis dengan set_sp_finance_docs (20260902000004).
--
--  Sufiks huruf (-A/-B) TIDAK disimpan di sini. quotation_no tetap bersih;
--  hurufnya DIRENDER dari `revision` di FE (keputusan Den #6).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_quotation_revision(p_quotation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_src     public.quotations%ROWTYPE;
  v_max_rev integer;
  v_new_id  uuid;
  v_count   integer;
BEGIN
  -- FOR UPDATE menyerialkan dua klik "Create Revision" yang bersamaan.
  -- Tanpa ini keduanya menghitung revision yang sama dan yang kedua kena
  -- 23505 dari UNIQUE(quotation_no, revision) -- aman, tapi pesannya jelek.
  SELECT * INTO v_src
  FROM public.quotations
  WHERE id = p_quotation_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation tidak ditemukan atau tidak ada izin baca (RLS).';
  END IF;

  -- Guard 1: hanya versi yang SUDAH sampai ke customer yang layak direvisi.
  --   DRAFT/SUBMITTED  -> cukup diedit di tempat lewat save_quotation.
  --   ACCEPTED         -> kesepakatan sudah jadi, jangan diutak-atik.
  --   SUPERSEDED       -> revisi harus bercabang dari versi TERAKHIR.
  IF v_src.status NOT IN ('SENT','REJECTED') THEN
    RAISE EXCEPTION
      'Hanya quotation berstatus SENT atau REJECTED yang bisa direvisi (status sekarang: %).',
      v_src.status;
  END IF;

  -- Guard 2: harus revisi TERAKHIR. Mencegah sejarah bercabang.
  -- ⚠️ TANPA filter deleted_at: UNIQUE(quotation_no, revision) tidak peduli
  --    soft-delete, jadi baris terhapus TETAP memakai slot nomornya.
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
  -- SENGAJA TIDAK DISALIN (harus lahir bersih di versi baru):
  --   sent_at, quote_sent_at, accepted_at, accepted_by, rejection_reason,
  --   updated_by, deleted_at

  -- Salin seluruh baris biaya. quotation_items tak punya deleted_at/created_at,
  -- jadi seluruh kolom selain id & quotation_id ikut apa adanya.
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

  -- RLS bisa menyaring baris TANPA error -> 0 baris = gagal senyap (TD-161).
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada izin mengubah quotation ini (RLS).';
  END IF;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.create_quotation_revision(uuid) OWNER TO postgres;

REVOKE ALL     ON FUNCTION public.create_quotation_revision(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_quotation_revision(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_quotation_revision(uuid) IS
  'Lahirkan revisi berikutnya: sumber -> SUPERSEDED, baris baru revision=MAX+1 nomor SAMA status DRAFT, items disalin. Satu transaksi. SECURITY INVOKER: gate = RLS quotations_update/insert.';


-- ─── 2. set_quotation_outcome ────────────────────────────────────────────────
--  Catat jawaban customer atas quotation yang sudah terkirim.
--  SATU-SATUNYA penulis sah accepted_at / accepted_by / rejection_reason.
--  Pola sama dengan set_sp_finance_docs: kolom jejak hanya punya satu pintu.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_quotation_outcome(
  p_quotation_id uuid,
  p_outcome      text,
  p_reason       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_src     public.quotations%ROWTYPE;
  v_max_rev integer;
  v_count   integer;
BEGIN
  IF p_outcome NOT IN ('ACCEPTED','REJECTED') THEN
    RAISE EXCEPTION 'Outcome harus ACCEPTED atau REJECTED (diterima: %).', p_outcome;
  END IF;

  -- Alasan WAJIB saat menolak. Mengikuti preseden "Tandai Kalah" yang juga
  -- menuntut alasan (batch 3B-1, 22 Jul 2026) -- penolakan tanpa alasan
  -- adalah data yang tak bisa dipakai siapa pun nanti.
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

  -- Hanya yang SUDAH terkirim yang bisa dijawab customer.
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
      'Versi ini sudah digantikan revisi yang lebih baru — catat hasilnya di versi terakhir.';
  END IF;

  UPDATE public.quotations
  SET    status           = p_outcome,
         accepted_at      = CASE WHEN p_outcome = 'ACCEPTED' THEN now()          ELSE NULL END,
         accepted_by      = CASE WHEN p_outcome = 'ACCEPTED' THEN auth.uid()     ELSE NULL END,
         rejection_reason = CASE WHEN p_outcome = 'REJECTED' THEN btrim(p_reason) ELSE NULL END,
         updated_at       = now(),
         updated_by       = auth.uid()
  WHERE  id = p_quotation_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Tidak ada izin mengubah quotation ini (RLS).';
  END IF;
END;
$$;

ALTER FUNCTION public.set_quotation_outcome(uuid, text, text) OWNER TO postgres;

REVOKE ALL     ON FUNCTION public.set_quotation_outcome(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_quotation_outcome(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_quotation_outcome(uuid, text, text) IS
  'Catat jawaban customer (ACCEPTED/REJECTED) atas quotation SENT versi terakhir. Satu-satunya penulis accepted_at/accepted_by/rejection_reason.';

-- ─── VERIFIKASI ──────────────────────────────────────────────────────────────
--   -- a. Kedua fungsi ada, INVOKER, ber-search_path, PUBLIC sudah dicabut:
--   SELECT proname, prosecdef, proconfig, proacl FROM pg_proc
--   WHERE proname IN ('create_quotation_revision','set_quotation_outcome');
--   -- prosecdef = FALSE (invoker) · proconfig memuat search_path=public
--   -- proacl TIDAK memuat '=X/postgres'
--
--   -- b. HAPPY PATH (dari BROWSER, akun sales pemilik quotation):
--   --    quotation SENT rev 1 -> create_quotation_revision(<id>)
--   --    HARUS: baris baru quotation_no SAMA, revision=2, status DRAFT,
--   --           seluruh item tersalin, sumber jadi SUPERSEDED.
--   SELECT quotation_no, revision, status, created_by, accepted_at, rejection_reason
--   FROM public.quotations WHERE quotation_no = '<QUO/.../00X>' ORDER BY revision;
--   SELECT quotation_id, count(*) FROM public.quotation_items
--   WHERE quotation_id IN (<id_lama>, <id_baru>) GROUP BY 1;
--   -- HARUS dua baris dengan count IDENTIK.
--
--   -- c. GUARD create_quotation_revision (masing-masing HARUS exception):
--   --    dari DRAFT · dari SUBMITTED · dari ACCEPTED · dari SUPERSEDED
--   --    dari REJECTED -> HARUS LOLOS
--
--   -- d. GUARD set_quotation_outcome (masing-masing HARUS exception):
--   --    p_outcome='MAYBE' · REJECTED tanpa alasan · REJECTED alasan '   '
--   --    dari status DRAFT/SUBMITTED/SUPERSEDED
--   --    dari rev lama saat rev baru sudah ada
--
--   -- e. ACCEPTED bersih:
--   BEGIN;
--     SELECT public.set_quotation_outcome('<id>'::uuid, 'ACCEPTED');
--     SELECT status, accepted_at, accepted_by, rejection_reason
--     FROM public.quotations WHERE id='<id>'::uuid;
--     -- HARUS: ACCEPTED · accepted_at terisi · accepted_by = user · reason NULL
--   ROLLBACK;
--
--   -- f. Konkurensi: dua sesi memanggil create_quotation_revision bersamaan
--   --    pada id yang sama -> satu sukses, satu gagal dengan pesan jelas.
--   --    TIDAK BOLEH lahir dua baris revision=2.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP FUNCTION IF EXISTS public.create_quotation_revision(uuid);
--   DROP FUNCTION IF EXISTS public.set_quotation_outcome(uuid, text, text);
--   ⚠️ Kalau 20260909000004 sudah jalan, trigger NEGOTIATION-nya kehilangan
--      satu-satunya sumber revisi. Rollback keduanya bersamaan, dan pastikan
--      tombol FE "Start Negotiation" dikembalikan (lihat 000004).
