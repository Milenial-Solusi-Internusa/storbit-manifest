-- =============================================================================
-- Migration: 20261023000004_crm_request_new_location
-- Inquiry Management Irisan 6 -- Lingkup A (jalur "Request new option" picker)
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging.
-- Dependensi: tidak ada DDL lain -- hanya butuh is_manager_or_above(),
-- notifications, profiles, user_roles, roles yang sudah ada. Boleh jalan
-- kapan pun sesudah 20261023000001 (konsisten urutan penulisan, tidak ada
-- ketergantungan fungsional nyata ke tabel locations itu sendiri).
--
-- PERILAKU MOCKUP UNTUK onRequest (LocationSelect.dc.html, dikutip persis
-- -- dilaporkan dulu sebelum implementasi, sesuai instruksi):
--   request: () => { this.setState({ open: false }); if (p.onRequest) p.onRequest(p.label || 'Location'); }
-- `onRequest` hanya menerima SATU argumen: `p.label` (label FIELD statis,
-- mis. "Port of Loading" -- BUKAN teks yang user ketik di kotak cari,
-- `s.q` tidak pernah dirujuk di fungsi ini). Komponen prototipe TIDAK
-- mendefinisikan APA PUN tentang persistensi -- `onRequest` adalah prop
-- callback kosong, sama filosofi `onChange`/`onAdd` di MasterSelect.jsx:
-- "KOMPONEN INI MURNI PRESENTASIONAL", pemanggil yang memutuskan efeknya.
-- Nol modal, nol RPC, nol state request yang terlihat di mana pun di
-- seluruh mockup untuk kasus ini.
--
-- KEPUTUSAN (karena mockup diam soal persistensi -- default yang
-- diinstruksikan, BUKAN tebakan saya): satu RPC kecil request_new_location
-- yang HANYA mengirim notifikasi ke seluruh manager-ke-atas LINTAS
-- ENTITAS (pola identik submit_dropdown_option_request, migrasi
-- 20261020000001) -- NOL tabel request baru, NOL baris tersimpan untuk
-- pengajuan itu sendiri, NOL sentuhan ke OptionRequestsPage.jsx atau hook
-- LOCATION_LIST_KEYS di dalamnya (dibiarkan kosong seperti sekarang).
-- Admin menindaklanjuti lewat Location Master secara manual sesudah
-- membaca notifikasi -- tidak ada jejak "permintaan" yang bisa ditinjau
-- ulang selain notifikasi itu sendiri.
--
-- Replika WHERE is_manager_or_above() (schema_snapshot.sql tidak memuat
-- versi terkini -- badan LIVE ada di migrasi 20261001000001_td301_lapis_
-- b_inactive_user_db_guard.sql: JOIN profiles pa ON pa.id=ur.user_id AND
-- pa.active=true, r.level<=6, ur.is_active=true, valid_until). company_id
-- notifikasi = company_id milik PENERIMA baris itu sendiri (bukan satu
-- nilai pemohon untuk semua baris) -- sama koreksi yang sudah dipakai
-- submit_dropdown_option_request.
-- =============================================================================

BEGIN;

CREATE FUNCTION public.request_new_location(p_name text, p_note text DEFAULT NULL)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Anda harus login untuk mengajukan lokasi baru.';
  END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nama lokasi wajib diisi.';
  END IF;

  BEGIN
    INSERT INTO public.notifications (company_id, user_id, event_type, title, body, reference_type, reference_id)
    SELECT DISTINCT p.company_id, ur.user_id, 'location_requested',
           'New location requested',
           '"' || btrim(p_name) || '" requested as a new location.'
             || CASE WHEN COALESCE(btrim(p_note), '') <> '' THEN ' Note: ' || btrim(p_note) ELSE '' END,
           'location_request', NULL
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
END;
$$;

REVOKE ALL ON FUNCTION public.request_new_location(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_new_location(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_new_location(text, text) TO authenticated;

COMMENT ON FUNCTION public.request_new_location(text, text) IS
  'Jalur "Request new option" picker lokasi (LocationSelect.dc.html, onRequest) untuk non-manager -- mockup TIDAK menentukan persistensi, jadi fungsi ini HANYA mengirim notifikasi ke seluruh manager-ke-atas lintas entitas (replika WHERE is_manager_or_above(), migrasi 20261001000001), company_id per PENERIMA. NOL tabel request, NOL baris tersimpan untuk pengajuannya sendiri -- admin menindaklanjuti manual lewat Location Master.';

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND p.proname='request_new_location';
-- SELECT proacl FROM pg_proc WHERE proname='request_new_location'; -- grantee hanya authenticated
--
-- Rollback:
--   DROP FUNCTION public.request_new_location(text, text);
-- =============================================================================
