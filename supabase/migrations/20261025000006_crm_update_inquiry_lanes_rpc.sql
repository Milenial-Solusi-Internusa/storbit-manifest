-- =============================================================================
-- Migration: 20261025000006_crm_update_inquiry_lanes_rpc
-- Inquiry Management -- ronde "Lane Editor" (edit/tambah/hapus/urutkan lane
-- dari Detail Inquiry, menyusul Tahap 4A/4B Putaran 4)
--
-- Status: BELUM DIJALANKAN -- Vir menjalankan manual di staging, TAHAP A.
-- Dependensi: 20261025000001 (tabel inquiry_lanes + policy SELECT-only +
-- GRANT SELECT-only ke authenticated -- komentar migrasi itu sendiri,
-- baris 35-37, sudah mengantisipasi RPC ini: "Kalau nanti ada jalur EDIT
-- lane, itu dibuka lewat PLAN tersendiri (kandidat RPC `update_inquiry_lanes`
-- atau serupa) -- BUKAN dengan membuka INSERT/UPDATE langsung ke tabel
-- ini.") · 20261001000001_td301_lapis_b_inactive_user_db_guard.sql
-- (is_super_admin()/is_manager_or_above_in(uuid), LIVE jauh sebelum
-- Putaran 4) · tabel audit_logs (pre-existing).
--
-- RINGKASAN
-- RPC atomik kedua di atas inquiry_lanes -- yang pertama
-- (create_inquiry_with_lanes, 20261025000005) hanya menulis SEKALI saat
-- inquiry lahir; RPC ini membuka jalur EDIT sesudahnya: tambah/ubah/hapus/
-- urutkan lane dari Detail Inquiry. Pola, badan, dan whitelist kolomnya
-- DISALIN dari create_inquiry_with_lanes LIVE (bukan snapshot -- snapshot
-- tidak memuat Putaran 4 sama sekali) dan dari reassign_inquiry_owner
-- (20261024000004) untuk pola audit/no-op.
--
-- STRATEGI TULIS: REPLACE-ALL (DELETE seluruh baris inquiry_lanes milik
-- inquiry ini, lalu INSERT ulang dari p_lanes dengan sort_order = indeks
-- array), BUKAN upsert per id. Alasan, dibuktikan grep seluruh
-- supabase/migrations/, bukan diasumsikan:
--   - NOL FK masuk ke inquiry_lanes.id dari tabel mana pun -- menghapus
--     baris lama AMAN, tidak ada yang bisa jadi yatim.
--   - NOL trigger apa pun di inquiry_lanes, dan tabel ini NOL kolom
--     updated_at/deleted_at -- replace-all tidak menghilangkan jejak yang
--     sebetulnya ada (audit sepenuhnya di audit_logs, lihat di bawah).
--   - NOL constraint UNIQUE di sort_order -- replace-all menghindari race
--     "dua baris sort_order sama sementara" yang bisa terjadi kalau upsert-
--     per-id mencoba menggeser nomor urut baris yang masih hidup.
--   - PERSIS pola penulisan create_inquiry_with_lanes sendiri (loop
--     jsonb_array_elements -> INSERT, v_sort dari 0) -- mengurangi drift
--     pola antara dua RPC yang menulis tabel yang sama.
--
-- GERBANG AKSES (urutan mengikat):
--   (1) Inquiry harus ada, tidak soft-deleted.
--   (2) Company -- defense-in-depth (SECURITY DEFINER melewati RLS caller),
--       pola identik create_inquiry_with_lanes/reassign_inquiry_owner.
--   (3) Peran -- super admin ATAU owner inquiry ATAU manager-ke-atas di
--       entitas ini. v_owner_id BISA NULL (inquiry belum ber-owner --
--       MSI-INQ-X-2026-0022/23/24 contoh nyata di staging) -- koreksi
--       NULL-safety (Vir): `v_owner_id = auth.uid()` POLOS menghasilkan
--       NULL (bukan false) saat v_owner_id NULL, dan di SQL
--       `false OR NULL OR false` = NULL, membuat `NOT (...)` JUGA NULL --
--       `IF NULL THEN` TIDAK dieksekusi, sehingga gerbang akan TERLEWATI
--       DIAM-DIAM untuk user yang sebetulnya bukan siapa-siapa pada
--       inquiry itu. Kelas bug SAMA dengan p_company_id/p_direction NULL
--       di create_inquiry_with_lanes (migrasi 20261025000005, perbaikan
--       #1) -- di sini ditangkap SEBELUM pernah live, bukan ditambal
--       belakangan. Ditutup dengan `COALESCE(v_owner_id = auth.uid(), false)`.
--       `is_super_admin()`/`is_manager_or_above_in()` SENGAJA TIDAK
--       dibungkus COALESCE yang sama -- keduanya `LANGUAGE sql STABLE`
--       berbadan EXISTS tunggal (20261001000001), dan EXISTS di Postgres
--       SELALU true/false, tidak pernah NULL -- membungkusnya menambah
--       kode untuk skenario yang sudah terbukti mustahil, bukan kehati-
--       hatian yang berguna.
--   (4) Status -- HANYA OPEN/IN_REVIEW/QUOTED/NEGOTIATION, konstanta SAMA
--       dengan FE (LOSABLE_INQUIRY_STATUS, DealDetailPage.jsx:75). Rule 109
--       (nexus-notes.js) menutup jalur quotation begitu Won -- lane tunduk
--       aturan yang sama.
--
-- VALIDASI LANE -- PERSIS pola create_inquiry_with_lanes: minimal 1
-- elemen, setiap elemen wajib pol_location_id DAN pod_location_id
-- (NULLIF(...,'') IS NULL -- string kosong = NULL, menghindari error cast
-- ::uuid mentah). mode/load_unit SENGAJA TIDAK divalidasi ke
-- dropdown_options lane_mode/lane_unit -- PARITAS dengan
-- create_inquiry_with_lanes (yang juga tidak memvalidasinya), keputusan
-- sadar bukan kelupaan. NOL pemeriksaan lane identik/duplikat dalam satu
-- inquiry -- mockup (design-handoff/mockup/Inquiry Management.dc.html)
-- sendiri nol pemeriksaan ini untuk lane dalam satu inquiry (dibaca utuh,
-- dikonfirmasi tiga agen riset independen), jadi RPC ini MENIRU itu,
-- bukan mengetatkannya diam-diam.
--
-- SINKRON MIRROR -- lane PERTAMA (indeks 0) SETELAH urutan baru disalin
-- ke inquiries.pol/pod/pol_location_id/pod_location_id + updated_at.
-- find_possible_duplicate_inquiries (20261023000003) membaca HANYA kolom
-- mirror ini, TIDAK PERNAH inquiry_lanes langsung -- tanpa sinkron ulang,
-- deteksi duplikat lintas-inquiry diam-diam membaca lane yang sudah bukan
-- lane pertama lagi begitu lane direorder/dihapus. `direction` SENGAJA
-- TIDAK dihitung ulang (keputusan Mas eksplisit) -- auto-suggest Direction
-- adalah perilaku wizard SAAT CREATE saja, bukan RPC edit ini.
-- `updated_at` di-set MANUAL -- inquiries TIDAK punya trigger
-- set_updated_at (diverifikasi: 8 trigger di inquiries, nol yang
-- menyentuh kolom ini), pola yang sama dipakai reassign_inquiry_owner.
--
-- NO-OP GUARD -- pola reassign_inquiry_owner (20261024000004:91-97): kalau
-- lane yang dikirim PERSIS SAMA (isi DAN urutan) dengan lane yang
-- tersimpan saat ini, return tanpa DELETE/INSERT/audit. Diperiksa
-- SESUDAH gerbang status -- percobaan no-op pada inquiry WON/LOST/
-- CANCELLED tetap DITOLAK di gerbang status, bukan diam-diam lolos lewat
-- jalur no-op.
--
-- AUDIT -- INSERT audit_logs PERSIS pola reassign_inquiry_owner (dua
-- langkah ambil aktor: profiles utk email/nama, lalu baris user_roles
-- AKTIF TERBARU berdasarkan granted_at utk role -- bukan role yang lolos
-- gerbang (3) secara spesifik, pola yang sama persis). action literal
-- 'UPDATE_INQUIRY_LANES' murni string SQL -- precedent
-- reassign_inquiry_owner/close_inquiry_as_duplicate menulis audit_logs
-- LANGSUNG dari RPC tanpa lewat enum ACTION_TYPES FE, jadi NOL perubahan
-- di src/lib/ diperlukan untuk jalur audit ini. FE (DealDetailPage.jsx)
-- TIDAK memanggil logAudit() tambahan untuk aksi ini (koreksi Mas) --
-- satu baris audit per edit, bukan dua.
--
-- NOL EXCEPTION WHEN OTHERS -- error apa pun (termasuk dari CHECK
-- constraint atau cast ::uuid yang gagal) menjalar apa adanya ke client,
-- pola yang sama dengan create_inquiry_with_lanes/reassign_inquiry_owner.
--
-- KUALIFIKASI KOLOM (ditemukan Vir di staging, error 42702) -- RETURNS
-- TABLE (id uuid, inquiry_no text) membuat dua OUT-parameter bernama id
-- dan inquiry_no. Referensi kolom id/inquiry_no TANPA alias tabel di
-- badan fungsi bentrok dengan OUT-parameter itu ("column reference is
-- ambiguous") -- CREATE FUNCTION tetap berhasil karena plpgsql baru
-- diperiksa saat dipanggil, bukan saat dibuat. Seluruh referensi ke kolom
-- id/inquiry_no di badan fungsi ini memakai alias tabel eksplisit
-- (i/pr/q), bukan #variable_conflict.
--
-- KUNCI BARIS -- SELECT langkah (1) memakai FOR UPDATE: tanpa ini, dua
-- panggilan bersamaan pada inquiry yang sama bisa saling menimpa lewat
-- replace-all (DELETE lalu INSERT).
-- =============================================================================

BEGIN;

CREATE FUNCTION public.update_inquiry_lanes(
  p_inquiry_id uuid,
  p_lanes      jsonb
)
  RETURNS TABLE (id uuid, inquiry_no text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_company_id      uuid;
  v_status          text;
  v_owner_id        uuid;
  v_inquiry_no      text;
  v_lane            jsonb;
  v_sort            integer := 0;
  v_primary_pol_loc uuid;
  v_primary_pod_loc uuid;
  v_primary_pol     text;
  v_primary_pod     text;
  v_old_lanes       jsonb;
  v_new_lanes_norm  jsonb;
  v_user_email      text;
  v_user_full_name  text;
  v_user_role       text;
BEGIN
  -- (1) Inquiry harus ada, tidak soft-deleted. FOR UPDATE mengunci baris
  -- ini sampai transaksi selesai -- lihat KUNCI BARIS di header migrasi.
  SELECT i.company_id, i.status, i.owner_id, i.inquiry_no
    INTO v_company_id, v_status, v_owner_id, v_inquiry_no
    FROM public.inquiries i
   WHERE i.id = p_inquiry_id AND i.deleted_at IS NULL
   FOR UPDATE;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Inquiry tidak ditemukan.';
  END IF;

  -- (2) Gerbang company -- defense-in-depth, SECURITY DEFINER melewati RLS
  -- caller (pola identik create_inquiry_with_lanes:219-222).
  IF NOT (public.is_super_admin() OR v_company_id IN (SELECT public.get_user_company_ids())) THEN
    RAISE EXCEPTION 'Anda tidak punya peran aktif di entitas ini.';
  END IF;

  -- (3) Gerbang peran -- lihat penjelasan NULL-safety di header migrasi.
  IF NOT (
    public.is_super_admin()
    OR COALESCE(v_owner_id = auth.uid(), false)
    OR public.is_manager_or_above_in(v_company_id)
  ) THEN
    RAISE EXCEPTION 'Anda tidak berhak mengubah rute inquiry ini.';
  END IF;

  -- (4) Gerbang status -- LOSABLE_INQUIRY_STATUS (DealDetailPage.jsx:75).
  IF v_status NOT IN ('OPEN', 'IN_REVIEW', 'QUOTED', 'NEGOTIATION') THEN
    RAISE EXCEPTION 'Rute inquiry berstatus % tidak bisa diubah.', v_status;
  END IF;

  -- (5) Validasi bentuk lane -- lihat header migrasi.
  IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lanes) < 1 THEN
    RAISE EXCEPTION 'Minimal 1 lane (Port of Loading + Port of Discharge) wajib diisi.';
  END IF;
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    IF NULLIF(v_lane->>'pol_location_id', '') IS NULL OR NULLIF(v_lane->>'pod_location_id', '') IS NULL THEN
      RAISE EXCEPTION 'Setiap lane wajib punya Port of Loading dan Port of Discharge.';
    END IF;
  END LOOP;

  -- (6) No-op guard -- bandingkan lane tersimpan (urut sort_order) dengan
  -- lane yang dikirim (urut array, dinormalisasi bentuk yang sama).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pol_location_id', pol_location_id, 'pod_location_id', pod_location_id,
    'via_location_id', via_location_id, 'pol', pol, 'pod', pod, 'via', via,
    'mode', mode, 'load_unit', load_unit
  ) ORDER BY sort_order), '[]'::jsonb)
    INTO v_old_lanes
    FROM public.inquiry_lanes
   WHERE inquiry_id = p_inquiry_id;

  -- WITH ORDINALITY + ORDER BY ord -- jsonb_agg TANPA pengurutan eksplisit
  -- tidak dijamin mengikuti urutan baris sumbernya; ini membuat urutan
  -- v_new_lanes_norm DETERMINISTIK mengikuti urutan p_lanes, supaya
  -- perbandingan no-op (langkah 6) dan RETURN lane (langkah 8/audit) benar.
  SELECT jsonb_agg(jsonb_build_object(
    'pol_location_id', (le->>'pol_location_id')::uuid,
    'pod_location_id', (le->>'pod_location_id')::uuid,
    'via_location_id', NULLIF(le->>'via_location_id', '')::uuid,
    'pol', le->>'pol', 'pod', le->>'pod', 'via', le->>'via',
    'mode', le->>'mode', 'load_unit', le->>'load_unit'
  ) ORDER BY ord)
    INTO v_new_lanes_norm
    FROM jsonb_array_elements(p_lanes) WITH ORDINALITY AS t(le, ord);

  IF v_old_lanes = v_new_lanes_norm THEN
    RETURN QUERY SELECT i.id, i.inquiry_no FROM public.inquiries i WHERE i.id = p_inquiry_id;
    RETURN;
  END IF;

  -- (7) Replace-all -- lihat alasan di header migrasi.
  DELETE FROM public.inquiry_lanes WHERE inquiry_id = p_inquiry_id;

  v_sort := 0;
  FOR v_lane IN SELECT * FROM jsonb_array_elements(p_lanes)
  LOOP
    INSERT INTO public.inquiry_lanes (
      inquiry_id, sort_order, pol_location_id, pod_location_id, via_location_id,
      pol, pod, via, mode, load_unit
    ) VALUES (
      p_inquiry_id, v_sort,
      (v_lane->>'pol_location_id')::uuid, (v_lane->>'pod_location_id')::uuid,
      NULLIF(v_lane->>'via_location_id', '')::uuid,
      v_lane->>'pol', v_lane->>'pod', v_lane->>'via', v_lane->>'mode', v_lane->>'load_unit'
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- (8) Sinkron mirror -- lane pertama SETELAH urutan baru. Lihat header
  -- migrasi (find_possible_duplicate_inquiries bergantung pada ini).
  v_primary_pol_loc := (p_lanes->0->>'pol_location_id')::uuid;
  v_primary_pod_loc := (p_lanes->0->>'pod_location_id')::uuid;
  v_primary_pol := p_lanes->0->>'pol';
  v_primary_pod := p_lanes->0->>'pod';

  UPDATE public.inquiries AS q SET
    pol = v_primary_pol, pod = v_primary_pod,
    pol_location_id = v_primary_pol_loc, pod_location_id = v_primary_pod_loc,
    updated_at = now()
  WHERE q.id = p_inquiry_id;

  -- (9) Audit -- pola PERSIS reassign_inquiry_owner (20261024000004:127-141).
  SELECT pr.email, pr.full_name INTO v_user_email, v_user_full_name FROM public.profiles pr WHERE pr.id = auth.uid();
  SELECT r.code INTO v_user_role FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.user_id = auth.uid() AND ur.is_active = true
     AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
   ORDER BY ur.granted_at DESC LIMIT 1;

  INSERT INTO public.audit_logs (user_id, user_email, user_role, company_id, action, entity_type, entity_id, entity_label, old_data, new_data, notes)
  VALUES (auth.uid(), v_user_email, v_user_role, v_company_id, 'UPDATE_INQUIRY_LANES', 'INQUIRY', p_inquiry_id, v_inquiry_no,
          jsonb_build_object('lanes', v_old_lanes), jsonb_build_object('lanes', v_new_lanes_norm), NULL);

  RETURN QUERY SELECT i.id, i.inquiry_no FROM public.inquiries i WHERE i.id = p_inquiry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_inquiry_lanes(uuid, jsonb) IS
  'Edit/tambah/hapus/urutkan lane inquiry (replace-all, bukan upsert-per-id). Gate: inquiry ada + tidak soft-deleted -> is_super_admin() ATAU owner_id=auth.uid() (COALESCE NULL-safe, owner_id boleh NULL) ATAU is_manager_or_above_in(company_id) -> status IN (OPEN,IN_REVIEW,QUOTED,NEGOTIATION). Validasi lane sama dengan create_inquiry_with_lanes (minimal 1, pol_location_id+pod_location_id wajib via NULLIF); mode/load_unit tidak divalidasi (paritas). No-op (lane sama persis, urutan+isi) -> return tanpa tulis, diperiksa SESUDAH gerbang status. Mirror inquiries.pol/pod/*_location_id+updated_at disinkron dari lane pertama baru; direction TIDAK dihitung ulang. Audit UPDATE_INQUIRY_LANES pola reassign_inquiry_owner, old_data/new_data = lane lama/baru. NOL EXCEPTION WHEN OTHERS -- error naik apa adanya.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='update_inquiry_lanes'; -- prosecdef=true
-- SELECT proacl FROM pg_proc WHERE proname='update_inquiry_lanes'; -- grantee hanya authenticated
--
-- Lihat scripts/qa/sql/verify-inquiry-putaran-4.sql untuk uji self-rollback
-- lengkap (x)-(ll).
--
-- Rollback (sebelum ada pemanggil baru bergantung padanya):
--   DROP FUNCTION public.update_inquiry_lanes(uuid, jsonb);
-- =============================================================================
