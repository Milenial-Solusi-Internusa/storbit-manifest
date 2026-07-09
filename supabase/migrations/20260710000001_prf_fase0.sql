-- ============================================================================
-- FASE 0 — Modul PRF (Price Request Form): fondasi DB (tabel + trigger + RLS)
-- ============================================================================
-- Tanggal eksekusi manual: 2026-07-10.
--
-- ⚠️ FILE INI ADALAH REKAMAN, BUKAN UNTUK DIJALANKAN LAGI.
--    Semua SQL di bawah SUDAH LIVE di database (dijalankan manual di Supabase
--    SQL Editor, byte-exact dari yang dijalankan). File ini merekam SQL asli
--    agar tercatat & reproducible. JANGAN jalankan ulang.
--
-- KONTEKS: Modul PRF greenfield. Fase 0 = 1 tabel `prf` (opsi A: child fields
--   Sea/Air/Inland/Custom/Project sebagai kolom nullable dalam satu tabel;
--   discriminator = service_type). Status DRAFT/SUBMITTED/ACKNOWLEDGED/CANCELLED
--   (+ QUOTED/EXPIRED disiapkan di CHECK). Nomor PRF dirakit di FE:
--   PRF/{ENTITAS}/{TAHUN}/{ROMAWI}/{URUT} via increment_document_sequence
--   (p_document_type='PRF', p_department_code='PROC', p_month=<bulan berjalan>,
--   reset per-bulan per-entitas). RLS tiru pola hrga_requests, SINGLE-ENTITY
--   (semua cabang di-filter company_id; TANPA is_super_admin — cross-entity
--   inbox procurement = Fase 3b, ditunda). Rujukan desain: AUDIT_PROCUREMENT.md.
--
-- VERIFIKASI (saat eksekusi manual): 52 kolom; pg_constraint contype c=1 (CHECK
--   status), f=5 (FK), p=1 (PK), u=1 (UNIQUE); trigger set_prf_updated_at ada;
--   relrowsecurity=true; 4 policy (prf_insert/prf_select/prf_update_draft/
--   prf_update_status).
--
-- ISI:
--   BLOK 1 — CREATE TABLE prf (52 kolom: 12 sistem + informasi dasar + inquiry
--            details + child sea/air/inland/custom/project + notes; PK + UNIQUE
--            (company_id,prf_no) + CHECK status 6-nilai + 5 FK).
--   BLOK 2 — trigger set_prf_updated_at (reuse set_updated_at() eksisting) + GRANT.
--   BLOK 3 — ENABLE RLS + 4 policy (single-entity, company-scoped).
--
-- ⚠️ schema_snapshot.sql STALE setelah eksekusi ini (belum memuat tabel `prf`;
--    juga belum memuat is_manager_or_above() versi +gm_bd dari 2026-07-09).
--    Refresh via pg_dump sebelum dijadikan acuan.
-- ============================================================================


-- BLOK 1 — CREATE TABLE prf (Fase 0). Jalankan di SQL Editor.
CREATE TABLE public.prf (
  -- ── Kolom sistem (tiru inquiries) ────────────────────────────────────────
  id              uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id      uuid NOT NULL,
  prf_no          text NOT NULL,
  status          character varying DEFAULT 'DRAFT'::character varying,
  created_by      uuid,                          -- = Nama Sales (auto dari profile)
  updated_by      uuid,
  submitted_at    timestamp with time zone,
  acknowledged_by uuid,
  acknowledged_at timestamp with time zone,
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  deleted_at      timestamp with time zone,

  -- ── Informasi Dasar ──────────────────────────────────────────────────────
  customer_source     text,                      -- 'customer' / 'prospect' / 'inquiry'
  account_id          uuid,                      -- FK accounts
  account_name_manual text,                      -- fallback ketik manual
  stream              text,                      -- dropdown single
  deadline_quotation  date,

  -- ── Inquiry Details ──────────────────────────────────────────────────────
  direction           text,                      -- single: import/export/domestic
  commodity           text,                      -- single: general/special_permit/dg
  hs_code             text,                      -- 8 digit; mandatory jika import/export (validasi FE)
  msds_available      boolean DEFAULT false,     -- muncul+mandatory jika commodity=dg
  service_type        text,                      -- single: sea/air/inland/project/custom (DISCRIMINATOR)
  incoterms           text,                      -- SINGLE (bukan array)
  commercial_value    numeric(14,2),             -- muncul jika incoterms in (CIF,CIP,DDP)
  commercial_currency text,
  origin              text,                      -- kota, negara (manual dulu)
  destination         text,                      -- kota, negara (manual dulu)
  pickup_address      text,                      -- mandatory jika incoterms in (EXW,CPT,CIP,DAP,DPU,DDP)
  delivery_address    text,                      -- mandatory jika incoterms in (EXW,FAS,FOB,CFR,CIF,DAP,DPU,DDP)
  add_on_services     text[],                    -- MULTIPLE
  add_on_others       text,                      -- teks bebas kalau pilih Others
  cargo_ready_date    date,

  -- ── Child SEA (service_type='sea') ───────────────────────────────────────
  sea_freight_type    text,                      -- single: fcl/lcl
  sea_container_types text[],                    -- MULTIPLE, jika FCL
  sea_container_qty   jsonb,                      -- qty per tipe, jika FCL: {"20GP":2,"40HC":1}
  sea_lcl_gw          numeric(12,2),             -- jika LCL
  sea_lcl_dimension   text,                      -- jika LCL (PxLxT)
  sea_lcl_volume      numeric(12,2),             -- jika LCL (m3)
  sea_lcl_koli        integer,                   -- jika LCL

  -- ── Child AIR (service_type='air') ───────────────────────────────────────
  air_gw              numeric(12,2),
  air_dimension       text,
  air_volume          numeric(12,2),
  air_koli            integer,

  -- ── Child INLAND (service_type='inland' ATAU add-on inland) ──────────────
  inland_fleet_types    text[],                  -- MULTIPLE
  inland_pickup_address text,
  inland_delivery_address text,
  inland_gw             numeric(12,2),
  inland_dimension      text,

  -- ── Child CUSTOM (service_type='custom') ─────────────────────────────────
  custom_doc_type     text,                      -- AUTO: 'PIB' jika import, 'PEB' jika export

  -- ── Child PROJECT (service_type='project') ───────────────────────────────
  project_freight_types text[],                  -- MULTIPLE: 20'OT/40'OT/20'FR/40'FR/RORO/Breakbulk
  project_qty           integer,

  -- ── Umum ─────────────────────────────────────────────────────────────────
  notes               text,

  -- ── Constraints ──────────────────────────────────────────────────────────
  CONSTRAINT prf_pkey PRIMARY KEY (id),
  CONSTRAINT prf_no_unique UNIQUE (company_id, prf_no),
  CONSTRAINT prf_status_check CHECK (
    status::text = ANY (ARRAY['DRAFT','SUBMITTED','ACKNOWLEDGED','CANCELLED','QUOTED','EXPIRED'])
  ),
  CONSTRAINT prf_company_id_fkey      FOREIGN KEY (company_id)      REFERENCES public.companies(id),
  CONSTRAINT prf_created_by_fkey      FOREIGN KEY (created_by)      REFERENCES public.profiles(id),
  CONSTRAINT prf_updated_by_fkey      FOREIGN KEY (updated_by)      REFERENCES public.profiles(id),
  CONSTRAINT prf_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.profiles(id),
  CONSTRAINT prf_account_id_fkey      FOREIGN KEY (account_id)      REFERENCES public.accounts(id)
);


-- BLOK 2 — reuse set_updated_at() eksisting (JANGAN bikin fungsi baru) + GRANT
CREATE TRIGGER set_prf_updated_at
  BEFORE UPDATE ON public.prf
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT ALL ON TABLE public.prf TO anon, authenticated, service_role;


-- BLOK 3 — ENABLE RLS + 4 policy. Single-entity: SEMUA cabang di-filter company_id.
ALTER TABLE public.prf ENABLE ROW LEVEL SECURITY;

-- INSERT: pembuat = dirinya, dalam company-nya, HANYA role sales / gm_bd
CREATE POLICY prf_insert ON public.prf
  FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_user_company_id())
    AND (created_by = auth.uid())
    AND (public.has_role('sales') OR public.has_role('gm_bd'))
  );

-- SELECT: pembuat lihat own, ATAU procurement/manager-ke-atas lihat se-company
CREATE POLICY prf_select ON public.prf
  FOR SELECT TO authenticated
  USING (
    (company_id = public.get_user_company_id())
    AND (
      (created_by = auth.uid())
      OR public.has_role('procurement')
      OR public.is_manager_or_above()
    )
  );

-- UPDATE draft: pembuat, hanya saat DRAFT (edit sebelum submit)
CREATE POLICY prf_update_draft ON public.prf
  FOR UPDATE TO authenticated
  USING (
    (deleted_at IS NULL)
    AND (company_id = public.get_user_company_id())
    AND (created_by = auth.uid())
    AND (status::text = 'DRAFT')
  )
  WITH CHECK (
    (company_id = public.get_user_company_id())
    AND (created_by = auth.uid())
  );

-- UPDATE status ack: procurement acknowledge saat SUBMITTED
CREATE POLICY prf_update_status ON public.prf
  FOR UPDATE TO authenticated
  USING (
    (deleted_at IS NULL)
    AND (company_id = public.get_user_company_id())
    AND public.has_role('procurement')
    AND (status::text = 'SUBMITTED')
  )
  WITH CHECK (
    company_id = public.get_user_company_id()
  );
