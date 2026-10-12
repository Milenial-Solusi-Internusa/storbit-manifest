-- =============================================================================
-- 20261012000007_crm_quotation_lock_on_closed_inquiry.sql
--
-- KEPUTUSAN DEN: kalau inquiry ditandai LOST atau CANCELLED, semua quotation
-- di inquiry itu ikut ditutup (status -> REJECTED) dan tidak bisa dibuka atau
-- diubah lagi -- kecuali Download PDF (sisi UI, lihat file FE terkait).
--
-- KONDISI PRODUCTION sebelum migrasi ini (dilaporkan Den, BUKAN dihitung
-- ulang di sini): quotations tidak punya CHECK status. Di bawah inquiry LOST
-- ada 96 quotation SENT, 17 DRAFT, 2 SUBMITTED. Di bawah inquiry CANCELLED
-- ada 1 quotation ACCEPTED (lihat Task 4.2 -- sengaja TIDAK disentuh).
-- Angka SENT/DRAFT/SUBMITTED di bawah CANCELLED tidak disebutkan Den --
-- dihitung live oleh DO-block Task 4 di bawah, bukan ditebak/disalin.
--
-- Status: BELUM DIJALANKAN.
--
-- =============================================================================
-- RINGKASAN PERUBAHAN
-- =============================================================================
-- TASK 1 (tutup otomatis, DB) -- trigger BARU trg_z_quotation_auto_close_on_
--   inquiry_closed, AFTER UPDATE OF status ON inquiries. Saat status berubah
--   ke LOST/CANCELLED: semua quotation inquiry itu berstatus DRAFT, SUBMITTED,
--   atau SENT -> REJECTED, rejection_reason "Otomatis: inquiry ditandai
--   Lost/Cancelled" + alasan asli dari loss_reasons.name / lost_reason (LOST)
--   atau cancel_reason (CANCELLED) kalau ada -- pola identik dgn CASE yang
--   sudah dipakai log_inquiry_status_change(). ACCEPTED/REJECTED/SUPERSEDED
--   TIDAK disentuh.
--
-- TASK 2 (kunci, DB) -- dua trigger BARU:
--   a. trg_z_lock_quotation_closed_inquiry, BEFORE INSERT OR UPDATE ON
--      quotations -- tolak kalau inquiry induk (NEW.inquiry_id) LOST/
--      CANCELLED. Nama 'trg_z_' SENGAJA, supaya fire SESUDAH
--      trg_quotation_prf_consistency (alfabetis 'q' < 'z') -- trigger itu
--      bisa mengisi NEW.inquiry_id dari prf_id kalau kosong, jadi saat
--      trigger ini membaca NEW.inquiry_id, nilainya sudah final.
--   b. trg_lock_quotation_items_closed_inquiry, BEFORE INSERT OR UPDATE OR
--      DELETE ON quotation_items -- tolak kalau quotation induknya (via
--      quotation_id -> quotations.inquiry_id) LOST/CANCELLED. Defense-in-
--      depth murni: ketiga jalur tulis quotation_items yang ada hari ini
--      (CREATE insert, save_quotation DELETE+INSERT, create_quotation_
--      revision INSERT) semuanya terjadi dalam transaksi yang SAMA dengan
--      tulis ke quotations yang sudah dikunci (a) -- jadi trigger ini tidak
--      pernah dibutuhkan untuk menutup lubang NYATA hari ini, tapi melindungi
--      jalur tulis yang mungkin ditambahkan nanti. Nol trigger lain ada di
--      quotation_items hari ini, jadi nol konflik urutan -- nama TANPA
--      prefix trg_z_.
--
--   Satu-satunya pengecualian (a): update cascading dari Task 1 sendiri, dan
--   dari pembersihan data satu-kali Task 4 di migrasi ini. Dibedakan lewat
--   GUC transaksi-lokal nexus.quotation_auto_close (set_config(...,true) --
--   pola yang SAMA dengan impersonasi request.jwt.claim.sub yang sudah
--   dipakai skrip seed UAT di repo ini). GUC ini TIDAK bisa di-set client
--   PostgREST (mereka hanya punya jalur REST/RPC, tidak ada RPC yang
--   mengekspos set_config ini) -- satu-satunya penulisnya fungsi trigger
--   Task 1 dan blok Task 4 di migrasi ini. Alternatif yang DITOLAK: mencocokkan
--   BENTUK update (status->REJECTED + rejection_reason terisi) -- tidak aman,
--   karena set_quotation_outcome('REJECTED', reason) pada kasus NORMAL
--   (quotation SENT ditolak customer, inquiry masih OPEN) punya bentuk akhir
--   yang identik; mencocokkan bentuk akan membuka jalan quotation NORMAL ikut
--   lolos kuncian, atau sebaliknya memberi jalan pintas bagi siapa pun yang
--   mengirim payload serupa.
--
--   b TIDAK memakai GUC bypass -- tidak ada jalur tulis quotation_items yang
--   sah bersamaan dengan inquiry yang sudah tertutup (lihat alinea di atas).
--
-- TASK 3 (kunci, UI) -- lihat commit FE terpisah di branch yang sama:
--   src/modules/crm/QuotationDetailPage.jsx, src/routes/crm.routes.jsx.
--   Trigger di atas tetap jadi penjaga akhir kalau sisi UI terlewat/di-bypass.
--
-- TASK 4 (data lama) -- di bawah, sesudah kedua trigger Task 1/2 dibuat
--   (urutan WAJIB: trigger dulu, baru UPDATE pembersihan -- supaya UPDATE-nya
--   sendiri lolos lewat GUC bypass yang sama dengan Task 1).
--
-- =============================================================================
-- TELUSUR TRIGGER QUOTATIONS YANG SUDAH ADA (Task 1.2) -- TIDAK ikut menyala
-- =============================================================================
-- Ketiga trigger AFTER yang sudah ada di quotations, semuanya di-guard
-- "IF NEW.status = 'SENT' ..." di baris pertama badan fungsinya:
--   - set_sql_on_quotation_sent            (trg_set_sql_on_quotation_sent)
--   - set_inquiry_quoted_on_quotation_sent (trg_inquiry_quoted)
--   - set_inquiry_negotiation_on_quotation_revision (trg_z_inquiry_negotiation_on_revision)
-- Update Task 1 HANYA PERNAH men-set NEW.status = 'REJECTED', tidak pernah
-- 'SENT' -- ketiga IF di atas selalu FALSE, badannya tidak pernah jalan, NOL
-- mutasi ke inquiries.status atau accounts.lifecycle_stage/account_status.
-- Lapis kedua (independen dari guard status): dua di antaranya juga punya
-- WHERE ... AND status IN ('OPEN','IN_REVIEW') / = 'QUOTED' pada UPDATE
-- inquiries-nya -- saat Task 1 jalan, inquiries.status SUDAH LOST/CANCELLED,
-- jadi WHERE itu pun nol baris kalaupun badannya terpaksa jalan. Diverifikasi
-- dengan membaca badan fungsi langsung di schema_snapshot.sql, bukan diasumsikan.
-- Skenario uji empiris: lihat blok VERIFIKASI poin (d) di bawah.
--
-- =============================================================================
-- KEDUA FUNGSI TRIGGER BARU WAJIB SECURITY DEFINER (pola sama dgn migrasi
-- 20261012000006 -- trigger guard yang hanya membaca/menulis demi keputusan
-- kunci TIDAK BOLEH bergantung pada RLS SELECT pemanggil: sebagai INVOKER,
-- RLS inquiries bisa menyembunyikan baris dari pemanggil tertentu -- lookup
-- kosong lalu "tidak LOST/CANCELLED karena tidak ketemu" LOLOS DIAM-DIAM,
-- padahal baris itu ADA dan tertutup. SECURITY DEFINER menjamin trigger
-- selalu melihat status inquiry yang sebenarnya.
-- Ketiganya REVOKE EXECUTE FROM PUBLIC -- trigger tetap menyala lewat
-- mekanisme trigger Postgres, bukan dipanggil sebagai fungsi biasa oleh role
-- mana pun, jadi REVOKE tidak mematikannya. (Catatan: sejak migrasi TD-300
-- 2 Okt 2026, fungsi baru di schema public sudah TIDAK otomatis ter-EXECUTE
-- PUBLIC -- REVOKE di sini murni eksplisit/dokumentasi, bukan menutup celah.)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- TASK 1 -- tutup otomatis: quotation ikut REJECTED saat inquiry LOST/CANCELLED
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reason_label  text;
  v_reason_detail text;
  v_reason        text;
BEGIN
  -- WHEN clause trigger sudah menyaring NEW.status IN ('LOST','CANCELLED')
  -- AND OLD.status IS DISTINCT FROM NEW.status -- badan ini hanya jalan untuk itu.
  IF NEW.status = 'CANCELLED' THEN
    v_reason_label  := 'Otomatis: inquiry ditandai Cancelled';
    v_reason_detail := NEW.cancel_reason;
  ELSIF NEW.status = 'LOST' THEN
    v_reason_label  := 'Otomatis: inquiry ditandai Lost';
    -- Pola identik log_inquiry_status_change(): loss_reasons (master, aktif)
    -- diutamakan, lost_reason (text bebas, deprecated) sbg fallback baris lama.
    v_reason_detail := COALESCE(
      (SELECT lr.name FROM public.loss_reasons lr WHERE lr.id = NEW.loss_reason_id),
      NEW.lost_reason);
  END IF;

  v_reason := v_reason_label;
  IF COALESCE(btrim(v_reason_detail), '') <> '' THEN
    v_reason := v_reason || ' (' || v_reason_detail || ')';
  END IF;

  -- Sinyal bypass utk trg_z_lock_quotation_closed_inquiry (Task 2) --
  -- transaksi-lokal (is_local=true), direset 'off' segera sesudah UPDATE ini
  -- selesai supaya jendela bypass seminimal mungkin (hanya statement ini).
  PERFORM set_config('nexus.quotation_auto_close', 'on', true);

  UPDATE public.quotations
  SET    status           = 'REJECTED',
         rejection_reason  = v_reason,
         updated_at        = now(),
         updated_by        = auth.uid()
  WHERE  inquiry_id = NEW.id
    AND  status IN ('DRAFT', 'SUBMITTED', 'SENT');

  PERFORM set_config('nexus.quotation_auto_close', 'off', true);

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() OWNER TO postgres;

COMMENT ON FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() IS
  'Task 1 -- saat inquiries.status berubah ke LOST/CANCELLED, tutup paksa (REJECTED) seluruh quotation DRAFT/SUBMITTED/SENT milik inquiry itu. SECURITY DEFINER -- lihat catatan header migrasi 20261012000007.';

REVOKE EXECUTE ON FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed() FROM PUBLIC;

CREATE TRIGGER trg_z_quotation_auto_close_on_inquiry_closed
  AFTER UPDATE OF status ON public.inquiries
  FOR EACH ROW
  WHEN ((((new.status)::text = ANY ((ARRAY['LOST'::character varying, 'CANCELLED'::character varying])::text[])) AND ((old.status)::text IS DISTINCT FROM (new.status)::text)))
  EXECUTE FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed();


-- ─────────────────────────────────────────────────────────────────────────
-- TASK 2a -- kunci quotations: tolak INSERT/UPDATE kalau inquiry induk tertutup
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.trg_fn_lock_quotation_closed_inquiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_inquiry_status text;
BEGIN
  -- Bypass: UPDATE cascading dari Task 1 (trg_z_quotation_auto_close_on_
  -- inquiry_closed) atau dari pembersihan data satu-kali Task 4 di migrasi
  -- ini -- keduanya SENGAJA menulis status->REJECTED pada quotation milik
  -- inquiry yang baru saja/sudah tertutup, dan harus lolos tanpa dicek.
  IF current_setting('nexus.quotation_auto_close', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.inquiry_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_inquiry_status
  FROM public.inquiries
  WHERE id = NEW.inquiry_id;

  IF v_inquiry_status IN ('LOST', 'CANCELLED') THEN
    RAISE EXCEPTION
      'Quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_fn_lock_quotation_closed_inquiry() OWNER TO postgres;

COMMENT ON FUNCTION public.trg_fn_lock_quotation_closed_inquiry() IS
  'Task 2a -- tolak INSERT/UPDATE pada quotations kalau inquiry induknya LOST/CANCELLED. Pengecualian: update cascading Task 1/Task 4, dibedakan via GUC transaksi-lokal nexus.quotation_auto_close. SECURITY DEFINER -- lihat catatan header migrasi 20261012000007.';

REVOKE EXECUTE ON FUNCTION public.trg_fn_lock_quotation_closed_inquiry() FROM PUBLIC;

CREATE TRIGGER trg_z_lock_quotation_closed_inquiry
  BEFORE INSERT OR UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_lock_quotation_closed_inquiry();


-- ─────────────────────────────────────────────────────────────────────────
-- TASK 2b -- kunci quotation_items: tolak INSERT/UPDATE/DELETE kalau
-- quotation induknya (lewat inquiry) tertutup. Defense-in-depth -- lihat
-- catatan header migrasi soal ketiga jalur tulis yang ada hari ini.
-- ─────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() RETURNS trigger
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

  IF v_inquiry_status IN ('LOST', 'CANCELLED') THEN
    RAISE EXCEPTION
      'Item quotation ini terkunci -- inquiry induknya sudah %.', v_inquiry_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() OWNER TO postgres;

COMMENT ON FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() IS
  'Task 2b -- tolak INSERT/UPDATE/DELETE pada quotation_items kalau quotation induknya (via inquiry_id) LOST/CANCELLED. Defense-in-depth, nol GUC bypass -- lihat catatan header migrasi 20261012000007. SECURITY DEFINER karena alasan yang sama dgn Task 2a.';

REVOKE EXECUTE ON FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry() FROM PUBLIC;

CREATE TRIGGER trg_lock_quotation_items_closed_inquiry
  BEFORE INSERT OR UPDATE OR DELETE ON public.quotation_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry();


-- ─────────────────────────────────────────────────────────────────────────
-- TASK 4 -- pembersihan data lama (DILAKUKAN SESUDAH kedua trigger di atas
-- dibuat, supaya UPDATE di bawah lolos lewat GUC bypass yang sama dgn Task 1)
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.quotations q
  JOIN public.inquiries i ON i.id = q.inquiry_id
  WHERE i.status IN ('LOST','CANCELLED')
    AND q.status IN ('DRAFT','SUBMITTED','SENT');
  RAISE NOTICE 'Task 4 -- quotation yang akan diubah jadi REJECTED (harap 96+17+2=115 di bawah LOST + sisanya di bawah CANCELLED): % baris', v_count;
END $$;

SELECT set_config('nexus.quotation_auto_close', 'on', true);

UPDATE public.quotations q
SET    status           = 'REJECTED',
       rejection_reason  = 'Otomatis: ditutup karena inquiry Lost/Cancelled (pembersihan data)',
       updated_at        = now()
FROM   public.inquiries i
WHERE  i.id = q.inquiry_id
  AND  i.status IN ('LOST','CANCELLED')
  AND  q.status IN ('DRAFT','SUBMITTED','SENT');

SELECT set_config('nexus.quotation_auto_close', 'off', true);

DO $$
DECLARE
  v_count_after        int;
  v_accepted_cancelled int;
BEGIN
  SELECT count(*) INTO v_count_after
  FROM public.quotations q
  JOIN public.inquiries i ON i.id = q.inquiry_id
  WHERE i.status IN ('LOST','CANCELLED')
    AND q.status IN ('DRAFT','SUBMITTED','SENT');
  RAISE NOTICE 'Task 4 -- sisa DRAFT/SUBMITTED/SENT di bawah inquiry tertutup (harap 0): %', v_count_after;

  SELECT count(*) INTO v_accepted_cancelled
  FROM public.quotations q
  JOIN public.inquiries i ON i.id = q.inquiry_id
  WHERE i.status = 'CANCELLED' AND q.status = 'ACCEPTED';
  RAISE NOTICE 'Task 4.2 -- quotation ACCEPTED di bawah inquiry CANCELLED (harap tetap 1, TIDAK disentuh oleh migrasi ini): %', v_accepted_cancelled;
END $$;

COMMIT;

-- =============================================================================
-- VERIFIKASI
-- =============================================================================
-- SELECT proname, prosecdef FROM pg_proc
--  WHERE proname IN ('trg_fn_quotation_auto_close_on_inquiry_closed',
--                     'trg_fn_lock_quotation_closed_inquiry',
--                     'trg_fn_lock_quotation_items_closed_inquiry')
--  ORDER BY proname;
-- -- Harap: 3 baris, prosecdef = true (SECURITY DEFINER) di semuanya.
--
-- SELECT proname, proacl FROM pg_proc
--  WHERE proname IN ('trg_fn_quotation_auto_close_on_inquiry_closed',
--                     'trg_fn_lock_quotation_closed_inquiry',
--                     'trg_fn_lock_quotation_items_closed_inquiry');
-- -- Harap: proacl grantee KOSONG berawalan '=' (REVOKE ALL FROM PUBLIC), ATAU
-- --        NULL (default privilege TD-300 sejak 2 Okt 2026 -- nol EXECUTE
-- --        ke siapa pun secara default). Keduanya berarti "nol EXECUTE
-- --        PUBLIC" -- trigger tetap menyala lewat mekanisme trigger.
--
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
--  WHERE tgname IN ('trg_z_quotation_auto_close_on_inquiry_closed',
--                    'trg_z_lock_quotation_closed_inquiry',
--                    'trg_lock_quotation_items_closed_inquiry')
--  ORDER BY tgname;
-- -- Harap: 3 baris -- inquiries, quotations, quotation_items.
--
-- -- Urutan trigger BEFORE INSERT/UPDATE di quotations (harap alfabetis,
-- -- trg_quotation_prf_consistency SEBELUM trg_z_lock_quotation_closed_inquiry):
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid = 'public.quotations'::regclass AND tgtype & 2 = 2 -- BEFORE
--  ORDER BY tgname;
--
-- =============================================================================
-- SKENARIO UJI END-TO-END (staging, lewat token user sungguhan -- bukan
-- SQL Editor/postgres, supaya RLS + SECURITY DEFINER sungguhan teruji)
-- =============================================================================
-- (a) Siapkan inquiry OPEN dengan 2 quotation: satu SENT, satu DRAFT. Tandai
--     inquiry itu LOST dengan loss_reason_id terisi (atau lost_reason kalau
--     baris lama). Harap: KEDUA quotation -> status REJECTED,
--     rejection_reason = 'Otomatis: inquiry ditandai Lost (<nama alasan>)'.
--
-- (b) Pada salah satu quotation dari (a) (sudah REJECTED), coba UPDATE
--     langsung apa pun (mis. ganti notes). Harap GAGAL --
--     'Quotation ini terkunci -- inquiry induknya sudah LOST.'
--
-- (c) Siapkan inquiry LAIN yang MASIH OPEN dengan quotation SENT. Panggil
--     set_quotation_outcome(<id>, 'REJECTED', 'ditolak customer'). Harap
--     BERHASIL (status -> REJECTED, rejection_reason = 'ditolak customer') --
--     TIDAK ikut terkunci oleh trigger Task 2, karena inquiry-nya tidak
--     LOST/CANCELLED.
--
-- (d) Sesudah (a): cek inquiries.status inquiry itu TETAP 'LOST' (tidak
--     terdorong balik ke status lain oleh trigger quotations manapun), dan
--     accounts.lifecycle_stage / account_status akun prospect/customer-nya
--     TIDAK berubah akibat UPDATE cascading quotations di langkah (a) --
--     membuktikan temuan telusur Task 1.2 di atas (ketiga trigger lama diam).
-- =============================================================================

-- =============================================================================
-- ROLLBACK (urutan WAJIB: DROP trigger dulu, baru fungsi -- TIDAK ADA
-- rollback otomatis utk Task 4, data yang sudah diubah jadi REJECTED oleh
-- pembersihan tetap REJECTED kecuali dipulihkan manual dari backup/log):
--
--   DROP TRIGGER trg_lock_quotation_items_closed_inquiry ON public.quotation_items;
--   DROP FUNCTION public.trg_fn_lock_quotation_items_closed_inquiry();
--   DROP TRIGGER trg_z_lock_quotation_closed_inquiry ON public.quotations;
--   DROP FUNCTION public.trg_fn_lock_quotation_closed_inquiry();
--   DROP TRIGGER trg_z_quotation_auto_close_on_inquiry_closed ON public.inquiries;
--   DROP FUNCTION public.trg_fn_quotation_auto_close_on_inquiry_closed();
-- =============================================================================
