-- =============================================================================
-- 20261020000001_crm_option_requests_approve_note_and_notify.sql
--
-- Irisan 5 (TD-318 item #18) -- menambah catatan Approve + notifikasi
-- submit/approve/reject ke RPC Option Requests dari 20261011000002 (butir
-- #48 rantai Lead Pool Paket 2, 12_ANTREAN_MIGRASI_PRODUCTION.md). File ini
-- diusulkan sebagai butir BARU #58 di EKOR rantai 47-57 (bukan disisipkan
-- di antara #48/#49) -- ketergantungannya HANYA pada #48 (tabel
-- dropdown_option_requests + ketiga RPC dasarnya), INDEPENDEN dari #49-#57
-- (infrastruktur Lead Pool, berbagi tabel generik `notifications` tapi nol
-- RPC/kolom yang tumpang tindih).
--
-- Status: DITULIS UNTUK REVIEW, BELUM DIJALANKAN di staging maupun
--         production. Ditulis oleh Claude Code (Irisan 5, 20 Okt 2026) atas
--         instruksi eksplisit Den -- lihat plan §5c/§8 Commit 5. Jalankan
--         manual di SQL Editor SESUDAH Den membaca dan menyetujui isi file
--         ini; TIDAK dieksekusi oleh sesi yang menulisnya.
--
-- -- Prasyarat diverifikasi sebelum menulis file ini (plan Context) --------
-- Grep repo untuk pemanggil `approve_dropdown_option_request(` = NOL
-- pemanggil FE/migrasi lain (hanya file definisinya sendiri,
-- 20261011000002). Fungsi ini belum pernah LIVE di production -- aman
-- DROP FUNCTION + CREATE FUNCTION signature baru (bukan CREATE OR REPLACE),
-- karena signature-nya BERTAMBAH satu parameter (p_note).
-- reject_dropdown_option_request signature TETAP (2 argumen) -> CREATE OR
-- REPLACE cukup.
--
-- Kolom yang dibaca/ditulis sudah diverifikasi ke schema_snapshot.sql:
--   user_roles: user_id, role_id, company_id NOT NULL, is_active NOT NULL,
--     valid_until (:10485-10497)
--   roles: id, code, level integer NOT NULL, CHECK level IN
--     (0,1,2,4,6,7,99) (:9591-9605)
--   profiles: id, full_name, company_id NOT NULL (:9308-9314)
--   notifications: company_id uuid NOT NULL (:8826-8838) -- draf SQL
--     putaran plan pertama LUPA mengisi kolom ini, diperbaiki di sini
--     (lihat catatan company_id di bawah).
--
-- -- Query penerima notifikasi SUBMIT -- replika is_manager_or_above() -----
-- is_manager_or_above() (schema_snapshot.sql:3151-3161) TIDAK bisa dipanggil
-- per-kandidat-penerima karena ia selalu membaca auth.uid() milik PEMANGGIL,
-- bukan parameter. Badan fungsinya:
--   SELECT EXISTS (
--     SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
--     WHERE ur.user_id = auth.uid()
--       AND r.level <= 6
--       AND ur.is_active = true
--       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE));
-- Query submit_dropdown_option_request di bawah mereplikasi KONDISI WHERE
-- itu persis, dengan ur.user_id dibiarkan terbuka (bukan di-pin ke
-- auth.uid()). `rl.code = 'super_admin'` TIDAK diikutkan sebagai OR
-- tambahan -- super_admin level = 0 (20260911000004_roles_level_column.sql:102),
-- sudah tercakup r.level <= 6, dan is_manager_or_above() sendiri tak punya
-- cabang khusus super_admin. `profiles.active = true` DITAMBAHKAN sebagai
-- filter EKSTRA di luar yang is_manager_or_above() cek (sengaja: jangan
-- kirim notifikasi ke akun yang sudah dinonaktifkan).
--
-- -- company_id notifikasi -- PER PENERIMA, bukan satu nilai pengaju -------
-- Setiap baris `notifications` memakai profiles.company_id milik PENERIMA
-- baris itu sendiri (requester untuk approve/reject -- penerimanya satu;
-- setiap manager untuk submit -- penerimanya banyak, masing-masing company
-- miliknya sendiri). Diverifikasi App.jsx:2113-2135 (fetchNotifications)
-- hanya filter user_id+is_read, NOL filter company -- kolom ini murni tag
-- deskriptif di satu-satunya konsumen yang ada, jadi pilihan ini soal
-- kebenaran semantik, bukan fungsi.
-- =============================================================================

ALTER TABLE public.dropdown_option_requests ADD COLUMN approval_note text;

DROP FUNCTION public.approve_dropdown_option_request(uuid);

CREATE FUNCTION public.approve_dropdown_option_request(p_request_id uuid, p_note text DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.dropdown_option_requests;
  v_opt_id uuid;
  v_requester_company uuid;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_manager_or_above()) THEN
    RAISE EXCEPTION 'Hanya manager ke atas yang boleh menyetujui permintaan opsi';
  END IF;
  SELECT * INTO r FROM public.dropdown_option_requests WHERE id = p_request_id AND status = 'pending';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Permintaan tidak ditemukan atau sudah diproses';
  END IF;
  v_opt_id := public.add_dropdown_option_direct(r.list_key, r.label, r.company_id);
  UPDATE public.dropdown_option_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
         created_dropdown_option_id = v_opt_id, approval_note = p_note
   WHERE id = p_request_id;
  -- company_id baris ini = company HOME requester (satu-satunya penerima).
  SELECT company_id INTO v_requester_company FROM public.profiles WHERE id = r.requested_by;
  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_requester_company, r.requested_by, 'dropdown_option_request_approved',
            'Option request approved',
            'Your request for "' || r.label || '" was approved and is now available.',
            'dropdown_option_request', p_request_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN v_opt_id;
END $$;
REVOKE ALL ON FUNCTION public.approve_dropdown_option_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_dropdown_option_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_dropdown_option_request(p_request_id uuid, p_reason text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.dropdown_option_requests;
  v_requester_company uuid;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_manager_or_above()) THEN
    RAISE EXCEPTION 'Hanya manager ke atas yang boleh menolak permintaan opsi';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi';
  END IF;
  SELECT * INTO r FROM public.dropdown_option_requests WHERE id = p_request_id AND status = 'pending';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Permintaan tidak ditemukan atau sudah diproses';
  END IF;
  UPDATE public.dropdown_option_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
   WHERE id = p_request_id AND status = 'pending';
  SELECT company_id INTO v_requester_company FROM public.profiles WHERE id = r.requested_by;
  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    VALUES (v_requester_company, r.requested_by, 'dropdown_option_request_rejected',
            'Option request rejected',
            'Your request for "' || r.label || '" was rejected. Reason: ' || p_reason,
            'dropdown_option_request', p_request_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- RPC BARU -- menggantikan INSERT langsung di RequestNewOptionModal.jsx.
-- Adopsi FE-nya DITUNDA (plan §8/§11.3) -- file ini hanya menaruh RPC-nya
-- di DB, nol pemanggil baru sampai ronde FE terpisah disetujui Den (sesudah
-- migrasi ini dikonfirmasi jalan di staging). Nol gerbang peran ditambahkan
-- di sini (keputusan plan §10.4: RLS insert permisif diterima apa adanya,
-- dicatat tech debt di antrean dokumentasi) -- fungsi ini HANYA menambah
-- notifikasi di atas perilaku insert yang sudah ada.
CREATE FUNCTION public.submit_dropdown_option_request(
  p_list_key text, p_label text, p_reason text DEFAULT NULL, p_company_id uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.dropdown_option_requests (list_key, label, reason, company_id, requested_by)
    VALUES (p_list_key, trim(p_label), p_reason, p_company_id, auth.uid())
    RETURNING id INTO v_id;
  BEGIN
    -- Cross-entity (plan §5b) -- SEMUA is_manager_or_above(), bukan dibatasi
    -- entitas pengaju. company_id PER-BARIS = company HOME penerima ITU
    -- SENDIRI (bukan satu nilai pengaju untuk semua baris -- lihat catatan
    -- company_id di kepala file). DISTINCT aman walau satu user punya >1
    -- baris user_roles manajerial lintas entitas, karena p.company_id
    -- (profiles, home tunggal per user) konstan per user_id -- DISTINCT
    -- tetap menghasilkan SATU baris notifikasi per user, bukan dobel.
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    SELECT DISTINCT p.company_id, ur.user_id, 'dropdown_option_request_submitted',
           'New option request',
           p_label || ' requested for ' || p_list_key,
           'dropdown_option_request', v_id
      FROM public.user_roles ur
      JOIN public.roles rl ON rl.id = ur.role_id
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE rl.level <= 6
       AND ur.is_active = true
       AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
       AND p.active = true
       AND ur.user_id <> auth.uid();
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_dropdown_option_request(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_dropdown_option_request(text, text, text, uuid) TO authenticated;

-- =============================================================================
-- ROLLBACK -- kalau perlu dibatalkan SEBELUM ada baris baru memakainya
-- =============================================================================
-- DROP FUNCTION public.submit_dropdown_option_request(text,text,text,uuid);
-- DROP FUNCTION public.reject_dropdown_option_request(uuid,text);
-- -- lalu re-create versi 20261011000002 apa adanya untuk reject_... --
-- DROP FUNCTION public.approve_dropdown_option_request(uuid,text);
-- -- lalu re-create versi 1-argumen dari 20261011000002 --
-- ALTER TABLE public.dropdown_option_requests DROP COLUMN approval_note;
