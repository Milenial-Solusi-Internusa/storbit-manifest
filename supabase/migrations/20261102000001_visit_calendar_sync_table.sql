-- =============================================================================
-- Migration: 20261102000001_visit_calendar_sync_table
-- Phase:     Integrasi 2 (Kunjungan Sales -> Google Calendar), Fase 1 --
--            FONDASI DATA SAJA. Nol trigger, nol Edge Function, nol
--            ketergantungan ke Google -- murni tabel pelacak + RLS, bisa
--            diverifikasi penuh lewat SQL tanpa apa pun di luar DB.
--
-- Purpose:   Tabel SISI-SATU (1 baris per activities.id yang type='visit')
--            untuk melacak status sinkron ke Google Calendar: id event
--            Google, kalender tujuan, pemilik yang dipakai saat sinkron
--            terakhir (utk mendeteksi perpindahan assigned_to di Fase 2),
--            status/alasan gagal, dan jejak waktu percobaan.
--
--            SENGAJA tabel ANAK terpisah, BUKAN kolom tambahan di
--            `activities` -- activities dipakai bersama type='call'/
--            'meeting'/'email'/'whatsapp' (lihat ActivitiesPage.jsx), jadi
--            menambah ~10 kolom khusus-Calendar ke situ berarti kolom itu
--            NULL untuk mayoritas baris yang bukan visit. Pola yang sama
--            dengan tabel anak lain di repo ini (mis. prf_vendor_offers).
--
--            RPC baru TIDAK diperlukan -- jalur tulis activities (tab
--            Calendar CRMDashboardPage.jsx MAUPUN ActivitiesPage.jsx) TIDAK
--            disentuh sama sekali oleh migrasi ini. Penulisan ke tabel ini
--            HANYA lewat service_role (Edge Function sync-visit-calendar,
--            Fase 2) dan fungsi SECURITY DEFINER (trigger DB, Fase 3) --
--            KEDUANYA belum ada di migrasi ini, sengaja ditahan sampai
--            giliran masing-masing disetujui terpisah.
--
-- Status:    BELUM DIJALANKAN -- teks untuk SQL Editor Mas (staging dulu).
-- =============================================================================

CREATE TABLE public.visit_calendar_sync (
  activity_id        uuid PRIMARY KEY REFERENCES public.activities(id) ON DELETE CASCADE,
  google_event_id    text,
  google_calendar_id text,
  synced_owner_email text,
  sync_status        text NOT NULL DEFAULT 'pending',
  sync_error         text,
  synced_at          timestamptz,
  last_attempted_at  timestamptz,
  attempt_count      integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_calendar_sync_sync_status_check
    CHECK (sync_status IN ('pending', 'synced', 'error', 'skipped'))
);

COMMENT ON TABLE public.visit_calendar_sync IS 'Pelacak sinkron satu kunjungan (activities.type=''visit'') ke Google Calendar. 1 baris per activity_id. Ditulis HANYA oleh service_role (Edge Function sync-visit-calendar) dan trigger SECURITY DEFINER -- authenticated tidak pernah menulis ke sini (lihat RLS + GRANT di bawah). Bagian dari Integrasi 2 (Kalender Kunjungan Sales), Fase 1.';
COMMENT ON COLUMN public.visit_calendar_sync.activity_id IS 'FK ke activities.id (PK tabel ini juga -- 1:1, bukan 1:banyak). ON DELETE CASCADE: hard-delete activities (jalur yang hari ini nol pemakai UI, RLS activities_delete ada tapi tak dipakai) ikut membuang baris pelacakan ini. Edge Function bertanggung jawab menghapus event Google-nya SEBELUM baris activities itu benar-benar hilang -- di luar cakupan migrasi ini.';
COMMENT ON COLUMN public.visit_calendar_sync.google_event_id IS 'Id event di Google Calendar. NULL = belum pernah berhasil dibuat. Fase 2: id ini deterministik dari activity_id (bukan diberi Google secara acak) supaya retry/race tidak melahirkan event duplikat.';
COMMENT ON COLUMN public.visit_calendar_sync.google_calendar_id IS 'Id kalender tujuan (mis. "primary" untuk kalender pribadi sales, atau id kalender bersama). Bisa berbeda nilai per baris kalau desain akhir Fase 2 memakai kalender per-sales.';
COMMENT ON COLUMN public.visit_calendar_sync.synced_owner_email IS 'Email yang diimpersonasi (profiles.email sales) saat event ini TERAKHIR berhasil ditempatkan. Dibandingkan dengan assigned_to SAAT INI di Fase 2 untuk mendeteksi kunjungan yang di-reassign ke sales lain (perlu pindah event, bukan sekadar PATCH).';
COMMENT ON COLUMN public.visit_calendar_sync.sync_status IS 'pending (belum diproses/sedang diproses) / synced (event ada & konsisten di Google) / error (percobaan terakhir gagal, lihat sync_error) / skipped (sengaja dilewati, mis. profiles.email sales kosong/tidak valid -- bukan kegagalan, keputusan sadar).';
COMMENT ON COLUMN public.visit_calendar_sync.sync_error IS 'Pesan generik untuk percobaan TERAKHIR: alasan kegagalan (sync_status=error), alasan skip (sync_status=skipped), atau peringatan non-fatal (sync_status=synced, mis. event lama tidak terhapus saat pindah pemilik). NULL kalau tidak ada yang perlu dicatat.';
COMMENT ON COLUMN public.visit_calendar_sync.synced_at IS 'Waktu terakhir kali BERHASIL sinkron (create atau update event). NULL = belum pernah berhasil sama sekali.';
COMMENT ON COLUMN public.visit_calendar_sync.last_attempted_at IS 'Waktu PERCOBAAN terakhir, berhasil atau gagal. Dipakai Mas untuk menemukan kunjungan yang gagal sinkron: WHERE sync_status=''error'' ORDER BY last_attempted_at DESC.';
COMMENT ON COLUMN public.visit_calendar_sync.attempt_count IS 'Jumlah percobaan sinkron kumulatif (termasuk yang gagal). Bukan penghalang retry (tidak ada batas maksimum di migrasi ini) -- murni observabilitas.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.visit_calendar_sync ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin ATAU manager-ke-atas/owner/pembuat DI COMPANY YANG SAMA
-- dengan activity-nya (join balik ke activities -- tabel ini tak punya
-- company_id sendiri, sengaja, supaya nol kemungkinan company_id di sini
-- menyimpang dari company_id activities induknya).
--
-- NULL-safety: EXISTS (...) secara konstruksi SUDAH aman terhadap NULL tanpa
-- perlu COALESCE tambahan -- berbeda dari pola "IF NOT (a OR b) THEN RAISE"
-- di fungsi PL/pgSQL (di situ NULL di dalam NOT() berarti "jangan raise" =
-- LOLOS, berbahaya). Di sini, policy RLS USING(expr) HANYA meloloskan baris
-- kalau expr = TRUE secara eksplisit; NULL (termasuk dari auth.uid() yang
-- NULL atau a.assigned_to yang NULL) BUKAN TRUE, jadi baris itu otomatis
-- TIDAK LOLOS (deny) -- arah amannya justru terbalik dari kasus RPC, dan
-- EXISTS sudah menegakkannya tanpa bantuan COALESCE. "owner" di sini
-- disamakan dengan assigned_to ATAU created_by (bukan assigned_to saja) --
-- mengikuti PERSIS definisi "siapa boleh melihat" yang activities_select
-- sendiri pakai, supaya visibilitas tabel pelacak ini tidak pernah lebih
-- sempit atau lebih lebar dari visibilitas activities-nya sendiri.
CREATE POLICY visit_calendar_sync_select ON public.visit_calendar_sync
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
         SELECT 1
         FROM public.activities a
         WHERE a.id = visit_calendar_sync.activity_id
           AND a.company_id = public.get_user_company_id()
           AND (
                public.is_manager_or_above()
                OR a.assigned_to = auth.uid()
                OR a.created_by  = auth.uid()
               )
       )
  );

-- Sengaja NOL policy INSERT/UPDATE/DELETE untuk `authenticated` -- dengan RLS
-- ENABLED dan nol policy untuk perintah itu, Postgres default-deny totalnya
-- (bukan "mengizinkan diam-diam"). Penulisan HANYA lewat service_role (Edge
-- Function, BYPASSRLS bawaan Supabase) dan fungsi SECURITY DEFINER (owner
-- postgres, juga bypass RLS) -- keduanya lahir di Fase 2/3, belum ada di
-- migrasi ini.

-- ── GRANT ────────────────────────────────────────────────────────────────────
-- CREATE TABLE baru di schema public otomatis mewarisi default privileges --
-- authenticated DIBERI ALL (termasuk INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER) begitu tabel lahir, BUKAN hanya PUBLIC/anon. TRUNCATE
-- KHUSUSNYA tidak tunduk RLS sama sekali (RLS hanya menyaring baris untuk
-- SELECT/INSERT/UPDATE/DELETE) -- kalau authenticated masih punya TRUNCATE,
-- satu baris SQL dari klien mana pun yang berhasil login bisa mengosongkan
-- SELURUH tabel ini, dan policy di atas tidak relevan sama sekali untuk
-- perintah itu. Karena itu authenticated WAJIB di-REVOKE ALL dulu (mencabut
-- WARISAN default privileges-nya, bukan cuma "menambah" GRANT SELECT di atas
-- privilege ALL yang sudah ada), BARU diberi SELECT saja secara eksplisit.
-- service_role diberi ALL eksplisit juga -- tidak mengandalkan asumsi bahwa
-- service_role otomatis punya privilege tabel (BYPASSRLS hanya melewati RLS,
-- bukan jaminan privilege GRANT) -- RPC/Edge Function Fase 2/3 menulis lewat
-- role ini.
REVOKE ALL ON public.visit_calendar_sync FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.visit_calendar_sync TO authenticated;
GRANT ALL ON public.visit_calendar_sync TO service_role;

-- ── updated_at otomatis ──────────────────────────────────────────────────────
-- Reuse set_updated_at() yang sudah ada (dipakai mis. set_prf_updated_at) --
-- nol fungsi baru. Edge Function/trigger SECURITY DEFINER di Fase 2/3 tetap
-- boleh menyetel updated_at manual kalau perlu; trigger ini jaring pengaman
-- supaya UPDATE yang lupa menyetelnya tidak meninggalkan nilai basi.
CREATE TRIGGER set_visit_calendar_sync_updated_at
  BEFORE UPDATE ON public.visit_calendar_sync
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ─── VERIFIKASI (jalankan TERPISAH, setelah migrasi di atas) ────────────────
--   -- (a) tabel + RLS + trigger ada:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'public.visit_calendar_sync'::regclass;
--   -- Diharapkan: relrowsecurity = true.
--
--   SELECT polname, polcmd, polroles::regrole[] FROM pg_policy
--    WHERE polrelid = 'public.visit_calendar_sync'::regclass;
--   -- Diharapkan: 1 baris, polname=visit_calendar_sync_select, polcmd='r'
--   -- (SELECT), polroles={authenticated}.
--
--   -- (b) GRANT benar -- authenticated HANYA SELECT, service_role ALL, anon/PUBLIC nol:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'visit_calendar_sync' AND table_schema = 'public'
--    ORDER BY grantee, privilege_type;
--   -- Diharapkan: (authenticated, SELECT) -- SATU baris saja utk role ini --
--   -- dan (service_role, <masing-masing dari INSERT/SELECT/UPDATE/DELETE/
--   -- TRUNCATE/REFERENCES/TRIGGER>) -- tujuh baris utk role ini (ALL
--   -- terurai jadi 7 privilege_type lewat view ini). NOL baris anon, NOL
--   -- baris PUBLIC. `postgres` boleh muncul juga (pemilik tabel, privilege
--   -- implisit dari kepemilikan -- bukan dari GRANT di migrasi ini).
--
--   -- (c) default-deny INSERT authenticated (jalankan sbg user authenticated
--   -- biasa lewat klien yang login, BUKAN sbg postgres/service_role -- RLS
--   -- tak menghalangi superuser/pemilik tabel):
--   --   INSERT INTO visit_calendar_sync (activity_id) VALUES ('<id visit uji>');
--   -- Diharapkan: DITOLAK (permission denied / new row violates row-level
--   -- security policy) -- BUKAN sukses diam-diam.
--
--   -- (d) SELECT sesuai peran -- ganti <id visit uji> dengan baris activities
--   -- type='visit' nyata, uji sbg: (1) assigned_to-nya sendiri -> LOLOS,
--   -- (2) manager+ di company yang sama -> LOLOS, (3) user company LAIN ->
--   -- NOL baris (bukan error, hanya kosong), (4) super_admin -> LOLOS semua.

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS set_visit_calendar_sync_updated_at ON public.visit_calendar_sync;
-- DROP TABLE IF EXISTS public.visit_calendar_sync;
-- =============================================================================
