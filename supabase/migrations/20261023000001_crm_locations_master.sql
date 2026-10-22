-- =============================================================================
-- Migration: 20261023000001_crm_locations_master
-- Inquiry Management Irisan 6 -- Lingkup A (tabel master Location)
--
-- Status: BELUM DIJALANKAN -- Mas menjalankan manual di SQL Editor staging
-- SETELAH plan ini disetujui. Dependensi: tidak ada. Boleh jalan sendirian.
--
-- Rule 108 (nexus-notes.js): "Locations (seaport, airport, city, FTZ) are
-- master data with a code... A Manager or above adds and edits locations;
-- other roles only pick... The master has no Delete, only Deactivate."
--
-- SKEMA -- HANYA kanonik mockup (Location Master.dc.html + LocationSelect.
-- dc.html + crm-data.js D.LOC_TYPES): type IN ('Seaport','Airport','City',
-- 'FTZ'). Array LOCS lokal di Inquiry Management.dc.html (yang punya
-- "Inland City"/"Inland Port"/zone "Bonded Zone"/via-port) DIANGGAP ARTEFAK
-- DRAFT BASI -- keputusan eksplisit Mas (PLAN Irisan 6, koreksi #2) --
-- TIDAK diikuti dan TIDAK diubah di berkas mockup itu sendiri. Karena itu:
-- NOL kolom is_bonded_zone, NOL kolom via_port_id, NOL UI via-port di mana
-- pun pada irisan ini.
--
-- SENGAJA TANPA company_id -- lokasi dipakai lintas entitas (MSI/JCI/SOA),
-- bukan per company (PLAN Irisan 6 §2, poin 5 konteks). Beda dengan
-- dc_master/payment_terms/taxes yang company-scoped.
-- =============================================================================

BEGIN;

CREATE TABLE public.locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,                 -- UN/LOCODE atau kode internal, UPPERCASE (trigger di bawah)
  name        text NOT NULL,
  country     text NOT NULL,
  type        text NOT NULL CHECK (type IN ('Seaport','Airport','City','FTZ')),
  aliases     text[] NOT NULL DEFAULT '{}',   -- ejaan/singkatan lain -- pencarian picker + pemetaan data lama (backfill-inquiry-locations.sql). NOL field UI di Location Master -- diisi lewat kolom ini langsung kalau perlu, bukan form terpisah di putaran ini.
  active      boolean NOT NULL DEFAULT true,  -- TIDAK ADA delete, hanya deactivate (mockup)
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX locations_code_key ON public.locations (code);
CREATE INDEX locations_name_lower_idx ON public.locations (lower(name));
CREATE INDEX locations_aliases_gin_idx ON public.locations USING gin (aliases);
CREATE INDEX locations_active_idx ON public.locations (active);

COMMENT ON TABLE public.locations IS 'Master lokasi (pelabuhan/bandara/kota/FTZ) lintas entitas -- rule 108 (nexus-notes.js). Nol Delete, hanya active toggle. Diisi Manager-ke-atas; role lain mengajukan lewat request_new_location (migrasi 20261023000004) yang hanya mengirim notifikasi -- nol tabel request, nol baris tersimpan untuk pengajuan itu sendiri.';
COMMENT ON COLUMN public.locations.code IS 'UN/LOCODE atau kode internal, dipaksa UPPERCASE oleh trigger trg_locations_normalize. Seed-nya BUKAN tugas migrasi ini -- Vir menyiapkan daftar dari data production, Den memvalidasi kodenya (PLAN Irisan 6 §5); jangan isi tabel ini dari sini.';
COMMENT ON COLUMN public.locations.type IS 'HANYA 4 nilai kanonik mockup (D.LOC_TYPES). "FTZ" sudah mencakup Batam/Bintan/Karimun/Sabang -- tidak ada flag Batam/Bonded Zone terpisah di skema ini (keputusan eksplisit, lihat header migrasi).';
COMMENT ON COLUMN public.locations.aliases IS 'Ejaan/singkatan lain (mis. "jkt","shenzen") untuk pencarian picker DAN pencocokan backfill data lama (scripts/qa/sql/backfill-inquiry-locations.sql). Pencocokan SELALU persis (lower+trim), tidak ada fuzzy.';

CREATE FUNCTION public.set_locations_normalize() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.code := upper(btrim(NEW.code));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_locations_normalize() IS 'BEFORE INSERT/UPDATE ON locations -- memaksa code UPPERCASE+trim sebelum constraint unik dievaluasi (jadi "idtpp" lalu "IDTPP" ditolak sebagai duplikat, bukan dua baris beda huruf besar/kecil), dan menjaga updated_at.';

CREATE TRIGGER trg_locations_normalize BEFORE INSERT OR UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_locations_normalize();

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Baca: SELURUH authenticated, tanpa filter -- data referensi non-sensitif,
-- lintas entitas, dan admin page butuh melihat baris inactive juga (untuk
-- toggle balik) -- filter "active only" adalah urusan query picker, bukan RLS.
CREATE POLICY locations_select ON public.locations
  FOR SELECT TO authenticated USING (true);

-- Tulis: Manager ke atas ATAU super_admin, GLOBAL tanpa company -- rule 108
-- "A Manager or above adds and edits locations", nol pembedaan entitas.
CREATE POLICY locations_insert ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.is_manager_or_above());

CREATE POLICY locations_update ON public.locations
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.is_manager_or_above())
  WITH CHECK (public.is_super_admin() OR public.is_manager_or_above());

-- Sengaja NOL policy DELETE -- mockup: "no Delete, only Deactivate".

-- GRANT eksplisit (pelajaran "kita pernah lupa GRANT") -- REVOKE dulu baru
-- GRANT yang diperlukan, pola identik dropdown_option_requests
-- (20261011000002).
REVOKE ALL ON public.locations FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.locations TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFIKASI -- jalankan SESUDAHNYA
-- =============================================================================
-- SELECT count(*) FROM public.locations; -- harus 0, seed BUKAN bagian migrasi ini
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.locations'::regclass;
-- SELECT polname, cmd FROM pg_policies WHERE tablename = 'locations';
-- SELECT grantee, privilege_type FROM information_schema.table_privileges WHERE table_name='locations';
--
-- Rollback (sebelum ada baris memakainya):
--   DROP TABLE public.locations CASCADE;
--   DROP FUNCTION public.set_locations_normalize();
-- =============================================================================
