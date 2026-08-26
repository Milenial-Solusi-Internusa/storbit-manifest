-- =============================================================================
-- Migration: 20260826000003_delivery_incidents
-- Phase:     Pencatatan kendala/insiden selama perjalanan Surat Jalan —
--            fondasi tracking SLA vendor pengiriman.
-- Depends:   delivery_notes · companies · set_updated_at() (sudah ada,
--            schema_snapshot.sql:2866) · is_super_admin() ·
--            get_user_company_ids() · is_manager_or_above() · has_role()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- LATAR
--   Greenfield: grep `delivery_incident`/`delivery_issue` di seluruh repo = 0
--   hit. Tidak ada tabel, RPC, maupun kolom yang perlu dimigrasikan.
--   Aditif murni — NOL dampak ke objek yang sudah jalan.
--
-- KEPUTUSAN DESAIN YANG PERLU DIINGAT (bukan sekadar diikuti)
--   1. occurred_at DIPISAH dari reported_at. Insiden sering baru dilaporkan
--      belakangan (info driver/DC datang terlambat). Menggabungkannya membuat
--      metrik SLA salah — pelajaran yang sama dengan expired_date vs tanggal
--      kirim sebenarnya.
--   2. delay_minutes EKSPLISIT, bukan diturunkan dari selisih timestamp.
--      Tujuan tabel ini SLA VENDOR; menghitungnya dari dispatched_at/
--      delivered_at akan mencampur keterlambatan vendor dengan keterlambatan
--      input manual.
--   3. vendor_name TEKS BEBAS — INTERIM yang disadari. delivery_notes hari ini
--      hanya punya driver_name/vehicle_no, NOL FK vendor. Dinormalisasi saat
--      master vendor pengiriman ada.
--   4. CONSTRAINT ..._resolve_check memaksa status 'resolved' selalu punya
--      resolved_at + resolution — mencegah "resolved" kosong yang tak bisa
--      diaudit.
--   5. ON DELETE CASCADE ke delivery_notes: insiden tak bermakna tanpa SJ
--      induknya. Praktis tak akan terpicu — delivery_notes tidak pernah
--      di-hard-delete (cancel_delivery hanya menyetel status).
--
-- ⚠️ RLS SENGAJA TIDAK MENIRU delivery_notes
--   delivery_notes memakai EMPAT policy USING(true) (schema_snapshot.sql
--   :15171-15192) + GRANT ALL TO authenticated. Itu terdaftar di TD-173
--   sebagai salah satu dari 19 tabel CRITICAL. Menyalinnya = menambah satu
--   baris lagi ke daftar utang yang sudah dikenal.
--   Yang ditiru di sini adalah preseden yang BENAR: journal_entries (17 Agu
--   2026) — company-scope memakai varian JAMAK get_user_company_ids() sejak
--   lahir (pola TD-180), dan super_admin sebagai bypass TOP-LEVEL, bukan
--   nested di dalam AND (pelajaran TD-170).
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — TABEL
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.delivery_incidents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id),
  delivery_note_id  uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,

  incident_type     text NOT NULL,
  severity          text NOT NULL DEFAULT 'minor',
  description       text NOT NULL,

  occurred_at       timestamptz,                       -- kapan kendala TERJADI
  reported_at       timestamptz NOT NULL DEFAULT now(),-- kapan DILAPORKAN
  reported_by       uuid REFERENCES auth.users(id),

  status            text NOT NULL DEFAULT 'open',
  resolution        text,
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES auth.users(id),

  delay_minutes     int,                               -- dampak terukur ke SLA
  vendor_name       text,                              -- INTERIM, lihat catatan 3

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,                       -- soft delete (AGENTS rule 13)

  CONSTRAINT delivery_incidents_type_check CHECK (incident_type = ANY (ARRAY[
    'kendaraan_rusak'::text, 'kecelakaan'::text, 'macet'::text, 'cuaca'::text,
    'alamat_salah'::text, 'dc_tutup'::text, 'dc_tolak'::text,
    'barang_rusak'::text, 'barang_kurang'::text, 'dokumen_kurang'::text,
    'lainnya'::text])),
  CONSTRAINT delivery_incidents_severity_check CHECK (severity = ANY (ARRAY[
    'minor'::text, 'major'::text, 'critical'::text])),
  CONSTRAINT delivery_incidents_status_check CHECK (status = ANY (ARRAY[
    'open'::text, 'resolved'::text, 'cancelled'::text])),
  CONSTRAINT delivery_incidents_resolve_check CHECK (
    (status <> 'resolved') OR (resolved_at IS NOT NULL AND resolution IS NOT NULL))
);

ALTER TABLE public.delivery_incidents OWNER TO postgres;

COMMENT ON TABLE public.delivery_incidents IS
  'Kendala/insiden selama perjalanan Surat Jalan. Sumber data tracking SLA vendor pengiriman. occurred_at (kapan terjadi) sengaja dipisah dari reported_at (kapan dilaporkan).';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — INDEX
-- ═════════════════════════════════════════════════════════════════════════════
CREATE INDEX idx_delivery_incidents_dn      ON public.delivery_incidents (delivery_note_id);
CREATE INDEX idx_delivery_incidents_company ON public.delivery_incidents (company_id);
-- Partial: yang sering di-query adalah insiden yang masih terbuka.
CREATE INDEX idx_delivery_incidents_open    ON public.delivery_incidents (status) WHERE status = 'open';


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — TRIGGER updated_at
-- ═════════════════════════════════════════════════════════════════════════════
-- Memakai fungsi generik set_updated_at() yang SUDAH ADA (schema_snapshot.sql
-- :2866) — dipakai belasan tabel lain (hrga_*, dst). Tidak membuat fungsi baru.
-- Nama trigger mengikuti konvensi mayoritas repo: set_<tabel>_updated_at.
-- Prefix trg_z_ di repo ini dipakai untuk trigger yang ORDERING-nya penting
-- (harus jalan terakhir, mis. trg_z_track_stage_change); di sini hanya ada satu
-- trigger, jadi konvensi set_* yang dipakai — konsisten dengan tabel sejenis.
CREATE TRIGGER set_delivery_incidents_updated_at
  BEFORE UPDATE ON public.delivery_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 4 — RLS
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.delivery_incidents ENABLE ROW LEVEL SECURITY;

-- READ: super_admin bypass TOP-LEVEL; sisanya company-scope varian JAMAK.
CREATE POLICY delivery_incidents_read ON public.delivery_incidents
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (company_id IN (SELECT public.get_user_company_ids())));

-- INSERT: siapa pun yang boleh operasi gudang di entitas itu.
CREATE POLICY delivery_incidents_insert ON public.delivery_incidents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.is_manager_or_above() OR public.has_role('operations'))));

CREATE POLICY delivery_incidents_update ON public.delivery_incidents
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (
    company_id IN (SELECT public.get_user_company_ids())
    AND (public.is_manager_or_above() OR public.has_role('operations'))))
  WITH CHECK (public.is_super_admin() OR (company_id IN (SELECT public.get_user_company_ids())));

-- DELETE: super_admin SAJA (pola sp_btb_delete). Insiden = jejak audit SLA;
-- pencabutan normal lewat status='cancelled' atau deleted_at, bukan hapus baris.
CREATE POLICY delivery_incidents_delete ON public.delivery_incidents
  FOR DELETE TO authenticated
  USING (public.is_super_admin());


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 — GRANT (kolom-level)
-- ═════════════════════════════════════════════════════════════════════════════
-- Pelajaran TD-175: tanpa GRANT kolom-level, PostgREST bisa menulis kolom
-- sistem langsung. id/created_at/reported_at SENGAJA TIDAK di-GRANT — kalau
-- klien bisa menulisnya, jejak waktu pelaporan bisa dipalsukan, dan seluruh
-- guna tabel ini adalah bukti SLA.
-- NOL grant untuk anon (pola FASE 5).
GRANT SELECT ON TABLE public.delivery_incidents TO authenticated;

GRANT INSERT (company_id, delivery_note_id, incident_type, severity, description,
              occurred_at, reported_by, delay_minutes, vendor_name)
  ON TABLE public.delivery_incidents TO authenticated;

GRANT UPDATE (incident_type, severity, description, occurred_at,
              status, resolution, resolved_at, resolved_by,
              delay_minutes, vendor_name, deleted_at)
  ON TABLE public.delivery_incidents TO authenticated;
-- updated_at TIDAK di-GRANT: diisi trigger set_updated_at(), bukan klien.


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI (jalankan TERPISAH sesudahnya)
-- ═════════════════════════════════════════════════════════════════════════════
--   -- a. Tabel + 4 constraint + 3 index + 1 trigger ada:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.delivery_incidents'::regclass ORDER BY conname;
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'delivery_incidents' ORDER BY indexname;
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.delivery_incidents'::regclass AND NOT tgisinternal;
--
--   -- b. RLS aktif + 4 policy:
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid = 'public.delivery_incidents'::regclass;      -- HARUS true
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'delivery_incidents' ORDER BY policyname;
--
--   -- c. GRANT kolom-level benar — id/created_at/reported_at/updated_at
--   --    TIDAK boleh muncul untuk INSERT/UPDATE:
--   SELECT privilege_type, column_name FROM information_schema.column_privileges
--    WHERE table_name = 'delivery_incidents' AND grantee = 'authenticated'
--    ORDER BY privilege_type, column_name;
--
--   -- d. CONSTRAINT resolve bekerja — HARUS DITOLAK:
--   BEGIN;
--     INSERT INTO public.delivery_incidents
--       (company_id, delivery_note_id, incident_type, description, status)
--     VALUES ('d2e5e565-5f67-4954-b8d9-5979a2a0c697', '<DN_ID>', 'macet', 'uji', 'resolved');
--     -- HARUS gagal: delivery_incidents_resolve_check
--   ROLLBACK;
--
--   -- e. Trigger updated_at bekerja:
--   BEGIN;
--     INSERT INTO public.delivery_incidents
--       (company_id, delivery_note_id, incident_type, description)
--     VALUES ('d2e5e565-5f67-4954-b8d9-5979a2a0c697', '<DN_ID>', 'macet', 'uji')
--     RETURNING id, created_at, updated_at;
--     UPDATE public.delivery_incidents SET description='uji 2'
--      WHERE delivery_note_id='<DN_ID>' RETURNING updated_at;  -- HARUS bergerak
--   ROLLBACK;
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP TABLE IF EXISTS public.delivery_incidents CASCADE;
--   -- Aman: tabel baru, nol konsumen sebelum FE dibangun. Policy, index, dan
--   -- trigger ikut terhapus. set_updated_at() TIDAK boleh ikut di-drop —
--   -- dipakai belasan tabel lain.
