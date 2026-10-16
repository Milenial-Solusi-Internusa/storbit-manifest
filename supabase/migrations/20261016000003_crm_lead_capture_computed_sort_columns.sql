-- =============================================================================
-- 20261016000003_crm_lead_capture_computed_sort_columns.sql
--
-- TD-318 Irisan Sorting -- 4 computed column PostgREST untuk Capture/Table
-- (mockup Lead Management.dc.html, 9 kolom sortable). 5 kolom langsung
-- (code/source/name/estimated_value/last_activity_at) sudah sortable lewat
-- .order() dinamis TANPA migrasi -- lihat LeadCapturePage.jsx, branch
-- feat/td318-irisan-sorting. 4 kolom di sini TIDAK PUNYA kolom asli di
-- accounts -- bant_score adalah SUM 4 kolom, lead_status_rank TURUNAN
-- lifecycle_stage+qualified_at (5-nilai, bukan 1 kolom), owner_name dan
-- primary_contact_name berasal dari tabel LAIN (profiles/contacts, relasi
-- many-to-one dan one-to-many) -- PostgREST TIDAK BISA .order() lintas
-- tabel untuk baris INDUK tanpa !inner (yang akan MEMBUANG baris
-- Unassigned/tanpa kontak dari hasil, lihat LeadCapturePage.jsx:263-266
-- untuk kelas bug yang sama persis sudah dihindari di pencarian kontak).
--
-- Pendekatan: "computed column" PostgREST -- fungsi SQL berargumen TUNGGAL
-- bertipe baris accounts, PostgREST mengenalinya sebagai kolom virtual
-- tabel itu, bisa dipakai langsung di ?order= TANPA !inner dan TANPA
-- mengubah bentuk hasil (baris Unassigned/tanpa kontak tetap ikut, nilainya
-- NULL -- NULLS LAST dipasang di FE lewat nullsFirst:false, bukan di sini).
--
-- SECURITY INVOKER (bukan DEFINER) -- RLS profiles/contacts pemanggil tetap
-- berlaku saat owner_name/primary_contact_name di-resolve, bukan dilewati
-- lewat privilege fungsi.
--
-- lead_status_rank MENIRU PERSIS leadStatus.js deriveLeadStatus() + urutan
-- array LEAD_STATUSES (0=raw, 1=qualified, 2=converted, 3=customer,
-- 4=lost). is_stale SENGAJA TIDAK dilipat ke rank ini -- di UI, Stale
-- adalah badge TERPISAH yang bisa menempel ke status APA PUN (lihat
-- LeadCapturePage.jsx:516, dirender BERSAMA badge status, bukan
-- menggantikannya), dan mockup sendiri tak punya nilai status "Stale" --
-- hanya 4 kategori warna (Raw/Qualified/Converted/Lost, objek BC di
-- Lead Management.dc.html). Melipat is_stale ke rank akan membuat satu
-- kolom mewakili DUA sumbu berbeda sekaligus.
--
-- Status: JALAN DI STAGING 16 Okt 2026 (Vir, via connector) -- BELUM DI
-- PRODUCTION, menunggu rilis November bersama sisa Irisan Sorting. Keempat
-- CREATE FUNCTION draf awal diganti CREATE OR REPLACE FUNCTION (idempoten
-- tanpa perlu DROP dulu -- pola sama dengan koreksi 20261016000001, bukan
-- karena connector memblokir CREATE FUNCTION polos, melainkan supaya file
-- ini aman dijalankan ulang kalau isinya direvisi sebelum naik produksi).
-- Sesudah jalan, Vir menjalankan NOTIFY pgrst, 'reload schema' supaya
-- PostgREST langsung mengenali keempat computed column tanpa restart --
-- WAJIB diulang saat migrasi ini jalan di production nanti.
--
-- Verifikasi staging (Vir, 16 Okt 2026): PT Verifikasi Irisan Enam --
-- bant_score 12, lead_status_rank 1, owner_name "ZZZTEST Sales",
-- primary_contact_name "Andi Wijaya". PT Bumi Agro Jember -- owner_name
-- NULL (Unassigned tetap ikut hasil, tidak terbuang).
-- =============================================================================

BEGIN;

-- bant_score -- cermin PERSIS calcBantScoreSafe() (LeadCapturePage.jsx:597-600):
-- tiap dimensi NULL dianggap 0, bukan membuat SUM-nya NULL.
CREATE OR REPLACE FUNCTION public.bant_score(rec public.accounts) RETURNS integer
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(rec.bant_budget, 0) + COALESCE(rec.bant_authority, 0)
       + COALESCE(rec.bant_need, 0) + COALESCE(rec.bant_timeline, 0);
$$;
COMMENT ON FUNCTION public.bant_score(public.accounts) IS 'Computed column PostgREST -- SUM 4 kolom dimensi BANT, cermin calcBantScoreSafe() FE. Dipakai .order("bant_score") di LeadCapturePage (TD-318 Irisan Sorting), TIDAK pernah di-select (hanya untuk order).';
REVOKE ALL ON FUNCTION public.bant_score(public.accounts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bant_score(public.accounts) TO authenticated;

-- lead_status_rank -- cermin PERSIS leadStatus.js deriveLeadStatus() + urutan
-- LEAD_STATUSES (raw/qualified/converted/customer/lost = 0..4). NULL untuk
-- lifecycle_stage di luar 5 nilai itu (mis. free_agent, dikecualikan dari
-- query LeadCapturePage lewat .neq('lifecycle_stage','free_agent')) --
-- NULLS LAST di FE. is_stale SENGAJA TIDAK dilipat ke sini, lihat catatan
-- header file.
CREATE OR REPLACE FUNCTION public.lead_status_rank(rec public.accounts) RETURNS integer
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN rec.lifecycle_stage = 'lost' THEN 4
    WHEN rec.lifecycle_stage = 'customer' THEN 3
    WHEN rec.lifecycle_stage IN ('prospect', 'sql') THEN 2
    WHEN rec.lifecycle_stage IN ('lead', 'mql') AND rec.qualified_at IS NOT NULL THEN 1
    WHEN rec.lifecycle_stage IN ('lead', 'mql') THEN 0
    ELSE NULL
  END;
$$;
COMMENT ON FUNCTION public.lead_status_rank(public.accounts) IS 'Computed column PostgREST -- ordinal status 0=raw,1=qualified,2=converted,3=customer,4=lost, cermin PERSIS deriveLeadStatus() (leadStatus.js) + urutan LEAD_STATUSES. is_stale TIDAK dilipat (sumbu terpisah, badge independen). Dipakai .order("lead_status_rank") di LeadCapturePage (TD-318 Irisan Sorting), TIDAK pernah di-select.';
REVOKE ALL ON FUNCTION public.lead_status_rank(public.accounts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_status_rank(public.accounts) TO authenticated;

-- owner_name -- relasi many-to-one (accounts.assigned_to -> profiles.id).
-- NULL utk Unassigned -- NULLS LAST di FE, bukan !inner (yang akan
-- membuang baris Unassigned dari hasil -- TIDAK BOLEH).
CREATE OR REPLACE FUNCTION public.owner_name(rec public.accounts) RETURNS text
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
  SELECT p.full_name FROM public.profiles p WHERE p.id = rec.assigned_to;
$$;
COMMENT ON FUNCTION public.owner_name(public.accounts) IS 'Computed column PostgREST -- nama pemilik (profiles.full_name via assigned_to), NULL utk Unassigned. SECURITY INVOKER -- RLS profiles pemanggil tetap berlaku. Dipakai .order("owner_name") di LeadCapturePage (TD-318 Irisan Sorting), TIDAK pernah di-select (nama sudah tersedia dari embed assigned_profile di query utama).';
REVOKE ALL ON FUNCTION public.owner_name(public.accounts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_name(public.accounts) TO authenticated;

-- primary_contact_name -- relasi one-to-many (banyak contacts per account),
-- diambil SATU baris ber-is_primary=true DAN deleted_at IS NULL. NULL kalau
-- nol kontak utama -- NULLS LAST di FE.
CREATE OR REPLACE FUNCTION public.primary_contact_name(rec public.accounts) RETURNS text
    LANGUAGE sql STABLE SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
  SELECT c.name FROM public.contacts c
   WHERE c.account_id = rec.id AND c.is_primary = true AND c.deleted_at IS NULL
   LIMIT 1;
$$;
COMMENT ON FUNCTION public.primary_contact_name(public.accounts) IS 'Computed column PostgREST -- nama kontak utama (contacts.name WHERE is_primary AND deleted_at IS NULL), NULL kalau tak ada. SECURITY INVOKER -- RLS contacts pemanggil tetap berlaku. Dipakai .order("primary_contact_name") di LeadCapturePage (TD-318 Irisan Sorting), TIDAK pernah di-select (nama sudah tersedia dari embed contacts di query utama).';
REVOKE ALL ON FUNCTION public.primary_contact_name(public.accounts) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.primary_contact_name(public.accounts) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
-- PostgREST meng-cache daftar kolom/fungsi saat start -- tanpa NOTIFY ini,
-- keempat computed column baru tidak dikenali sampai PostgREST restart
-- sendiri. WAJIB diulang tiap migrasi ini dijalankan di environment baru
-- (sudah dilakukan Vir di staging 16 Okt 2026; ulangi saat naik production).

-- =============================================================================
-- Verifikasi (jalankan terpisah sesudah commit):
--
-- SELECT code, name, bant_score(accounts.*), lead_status_rank(accounts.*),
--        owner_name(accounts.*), primary_contact_name(accounts.*)
--   FROM accounts LIMIT 5;
-- -- (sintaks SQL biasa -- lewat PostgREST, cukup ?order=bant_score.desc
-- --  dst., tanpa perlu menyebutnya di select.)
--
-- Sanity NULLS LAST tetap benar di kedua arah lewat PostgREST:
-- -- GET /accounts?order=owner_name.asc.nullslast
-- -- GET /accounts?order=owner_name.desc.nullslast
-- -- Keduanya harus menaruh baris Unassigned di akhir.
--
-- Rollback:
-- DROP FUNCTION IF EXISTS public.bant_score(public.accounts);
-- DROP FUNCTION IF EXISTS public.lead_status_rank(public.accounts);
-- DROP FUNCTION IF EXISTS public.owner_name(public.accounts);
-- DROP FUNCTION IF EXISTS public.primary_contact_name(public.accounts);
-- NOTIFY pgrst, 'reload schema';
-- =============================================================================
