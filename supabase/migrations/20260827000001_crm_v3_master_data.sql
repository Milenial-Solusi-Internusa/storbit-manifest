-- =============================================================================
-- Migration: 20260827000001_crm_v3_master_data
-- Batch:     CRM v3 — Batch Persiapan, bagian B1 (master data pendukung)
-- Depends:   companies · profiles · accounts (kolom BANT) · inquiries
--            · get_user_company_ids() · is_super_admin() · is_admin_or_above()
-- Status:    BELUM DIJALANKAN — ditulis sebelum eksekusi.
--            ⚠️ Dijalankan MANUAL di Supabase SQL Editor oleh Den.
--
-- ISI
--   1. loss_reasons   — GLOBAL   (company_id NULL)
--   2. channel_types  — PER-ENTITAS
--   3. sla_policies   — PER-ENTITAS, menampung TIGA jenis kebijakan
--   4. CHECK 0-3 untuk empat dimensi BANT di accounts (kolom SUDAH ADA)
--   5. inquiries.owner_id + backfill dari created_by
--
-- ⚠️ PRA-CEK WAJIB — jalankan DULU, migrasi ini GAGAL kalau hasilnya bukan 0:
--     SELECT COUNT(*) FROM public.accounts
--      WHERE bant_budget    NOT BETWEEN 0 AND 3
--         OR bant_authority NOT BETWEEN 0 AND 3
--         OR bant_need      NOT BETWEEN 0 AND 3
--         OR bant_timeline  NOT BETWEEN 0 AND 3;          -- HARUS 0
--
--   Pra-cek informatif (tidak memblokir, tapi menentukan hasil backfill):
--     SELECT COUNT(*) FROM public.inquiries WHERE created_by IS NULL;
--     -- baris ini akan tetap owner_id NULL sesudah backfill (lihat STEP 5)
--
-- KEPUTUSAN SCOPING (Den, batch persiapan CRM v3) — JANGAN dibalik tanpa bahas:
--   loss_reasons  GLOBAL  — taksonomi alasan kalah deal sama untuk MSI/JCI/SOA,
--                           tak punya atribut lini/entitas. Ikut pola
--                           roles/departments pasca-globalisasi 21 Agu 2026.
--                           ⚠️ FE JANGAN memfilter company_id untuk tabel ini
--                           (gotcha #18 — filter itu mengembalikan NOL BARIS
--                           tanpa error).
--   channel_types PER-ENTITAS — margin floor per channel didesain beda tiap
--                           lini/entitas.
--   sla_policies  PER-ENTITAS — komitmen SLA itu kebijakan operasional per
--                           entitas, bukan konsep organisasi seragam.
-- =============================================================================


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — loss_reasons (GLOBAL)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.loss_reasons (
    id          uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id  uuid,                                   -- SELALU NULL = global
    code        character varying(20)  NOT NULL,
    name        character varying(100) NOT NULL,
    category    character varying(30),
    applies_to  character varying(10) DEFAULT 'deal' NOT NULL,
    sort_order  integer DEFAULT 0 NOT NULL,
    is_active   boolean DEFAULT true NOT NULL,
    created_by  uuid,
    created_at  timestamp with time zone DEFAULT now() NOT NULL,
    updated_at  timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at  timestamp with time zone,
    CONSTRAINT loss_reasons_pkey PRIMARY KEY (id),
    CONSTRAINT loss_reasons_applies_check CHECK (applies_to = ANY (ARRAY['deal','account','both'])),
    CONSTRAINT loss_reasons_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.loss_reasons IS
  'Taksonomi GLOBAL alasan kalah (deal/akun). company_id selalu NULL — jangan difilter di FE (gotcha #18).';

-- Unik hanya di antara baris hidup — mengikuti pola
-- `departments_company_code_active_uidx` yang sudah ada, bukan UNIQUE polos,
-- supaya kode bisa dipakai ulang setelah baris lamanya di-soft-delete.
CREATE UNIQUE INDEX loss_reasons_code_uidx
  ON public.loss_reasons (code) WHERE (deleted_at IS NULL);

ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY loss_reasons_read ON public.loss_reasons
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_super_admin());

CREATE POLICY loss_reasons_insert ON public.loss_reasons
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_above());

CREATE POLICY loss_reasons_update ON public.loss_reasons
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

CREATE POLICY loss_reasons_delete ON public.loss_reasons
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- GRANT WAJIB — tabel yang dibuat lewat SQL Editor/CLI tidak auto-grant.
GRANT ALL ON TABLE public.loss_reasons TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.loss_reasons TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.loss_reasons TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — channel_types (PER-ENTITAS)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.channel_types (
    id            uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id    uuid NOT NULL,
    code          character varying(20)  NOT NULL,
    name          character varying(100) NOT NULL,
    service_line  character varying(30),               -- lini: freight_forwarding|customs|trading
    margin_floor  numeric(5,2),                        -- % — SEED NULL, angka menyusul sebelum batch B4
    description   text,
    sort_order    integer DEFAULT 0 NOT NULL,
    is_active     boolean DEFAULT true NOT NULL,
    created_by    uuid,
    created_at    timestamp with time zone DEFAULT now() NOT NULL,
    updated_at    timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at    timestamp with time zone,
    CONSTRAINT channel_types_pkey PRIMARY KEY (id),
    CONSTRAINT channel_types_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT channel_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
    CONSTRAINT channel_types_margin_check CHECK (margin_floor IS NULL OR (margin_floor >= 0 AND margin_floor <= 100)),
    CONSTRAINT channel_types_line_check CHECK (service_line IS NULL OR service_line = ANY
        (ARRAY['freight_forwarding','customs','trading']))
);

-- ⚠️ BUKAN `UNIQUE (company_id, code, service_line)`. Di Postgres, NULL
-- dianggap DISTINCT di UNIQUE constraint, jadi (MSI,'DIRECT',NULL) bisa masuk
-- berkali-kali tanpa ditolak — dan seed di bawah memang menulis service_line
-- NULL. COALESCE ke sentinel menutup celah itu. Pola disalin dari
-- `departments_company_code_active_uidx` yang sudah ada di skema.
CREATE UNIQUE INDEX channel_types_company_code_line_uidx
  ON public.channel_types (company_id, code, COALESCE(service_line, '__ALL__'))
  WHERE (deleted_at IS NULL);

COMMENT ON TABLE public.channel_types IS
  'Channel penjualan per entitas (Direct/Forwarder/Hybrid). margin_floor dipakai gerbang margin Quotation (batch B4).';

ALTER TABLE public.channel_types ENABLE ROW LEVEL SECURITY;

-- Varian JAMAK get_user_company_ids() dipakai sejak awal (bukan singular) —
-- preseden 17 Agu 2026; pola singular adalah TD-180 yang masih terbuka.
CREATE POLICY channel_types_read ON public.channel_types
  FOR SELECT TO authenticated
  USING ((company_id IN (SELECT public.get_user_company_ids()) AND deleted_at IS NULL)
         OR public.is_super_admin());

CREATE POLICY channel_types_insert ON public.channel_types
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()) AND public.is_admin_or_above());

CREATE POLICY channel_types_update ON public.channel_types
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.get_user_company_ids()) OR public.is_super_admin())
  WITH CHECK ((company_id IN (SELECT public.get_user_company_ids()) AND public.is_admin_or_above())
              OR public.is_super_admin());

CREATE POLICY channel_types_delete ON public.channel_types
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

GRANT ALL ON TABLE public.channel_types TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.channel_types TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.channel_types TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — sla_policies (PER-ENTITAS, TIGA jenis kebijakan dalam satu tabel)
-- ═════════════════════════════════════════════════════════════════════════════
-- Tiga jenis yang ditampung (sumbunya BERBEDA, itu sebabnya bukan tabel datar):
--   prf_response     — batas respons Pricing atas PRF, sumbu MODA
--   deal_aging       — batas aging per status deal, sumbu inquiries.status
--   account_dormancy — batas dorman akun, sumbu pre_customer|customer
--
-- ⚠️ MODA ≠ LINI. Keduanya sama-sama bernama `service_type` di tabel aslinya
--    (inquiries.service_type = lini; prf.service_type = moda) — itu TD-108,
--    masih terbuka. Di tabel ini keduanya dinamai EKSPLISIT (`service_line`
--    vs `transport_mode`) supaya kesalahan yang sama tidak terulang.
--    Kosakata moda di sini MERATAKAN `sea` jadi fcl/lcl, karena batas
--    responsnya memang berbeda (FCL 4 jam vs LCL 6 jam) sementara di `prf`
--    keduanya sama-sama service_type='sea' + sea_freight_type.
CREATE TABLE public.sla_policies (
    id             uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id     uuid NOT NULL,
    code           character varying(30)  NOT NULL,
    name           character varying(100) NOT NULL,

    policy_type    character varying(20) NOT NULL,
    service_line   character varying(30),
    transport_mode character varying(20),
    target_status  character varying(30),
    target_scope   character varying(30),

    threshold      integer NOT NULL,
    time_unit      character varying(20) NOT NULL,
    inherits_from  uuid,

    action         character varying(30) NOT NULL,
    requires_human boolean DEFAULT false NOT NULL,
    escalate_to    character varying(30),

    description    text,
    sort_order     integer DEFAULT 0 NOT NULL,
    is_active      boolean DEFAULT true NOT NULL,
    created_by     uuid,
    created_at     timestamp with time zone DEFAULT now() NOT NULL,
    updated_at     timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at     timestamp with time zone,

    CONSTRAINT sla_policies_pkey PRIMARY KEY (id),
    CONSTRAINT sla_policies_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
    CONSTRAINT sla_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
    CONSTRAINT sla_policies_inherits_fkey FOREIGN KEY (inherits_from) REFERENCES public.sla_policies(id),
    CONSTRAINT sla_policies_threshold_check CHECK (threshold > 0),
    CONSTRAINT sla_policies_type_check CHECK (policy_type = ANY
        (ARRAY['prf_response','deal_aging','account_dormancy'])),
    CONSTRAINT sla_policies_unit_check CHECK (time_unit = ANY
        (ARRAY['business_hour','business_day','day','month'])),
    CONSTRAINT sla_policies_mode_check CHECK (transport_mode IS NULL OR transport_mode = ANY
        (ARRAY['air','fcl','lcl','inland','project','custom'])),
    CONSTRAINT sla_policies_line_check CHECK (service_line IS NULL OR service_line = ANY
        (ARRAY['freight_forwarding','customs','trading'])),
    CONSTRAINT sla_policies_scope_check CHECK (target_scope IS NULL OR target_scope = ANY
        (ARRAY['pre_customer','customer'])),
    CONSTRAINT sla_policies_action_check CHECK (action = ANY
        (ARRAY['flag_stale','create_task','escalate_manager','propose_cancel',
               'move_lead_pool','set_free_agent'])),
    -- Tiap jenis WAJIB mengisi sumbunya sendiri dan hanya sumbunya.
    CONSTRAINT sla_policies_axis_check CHECK (
        (policy_type = 'prf_response'     AND transport_mode IS NOT NULL AND target_status IS NULL  AND target_scope IS NULL) OR
        (policy_type = 'deal_aging'       AND target_status  IS NOT NULL AND target_scope  IS NULL) OR
        (policy_type = 'account_dormancy' AND target_scope   IS NOT NULL AND transport_mode IS NULL AND target_status IS NULL)
    ),
    -- Aksi yang menutup/memindahkan akun WAJIB minta konfirmasi manusia.
    -- Dikunci di skema, bukan cuma di komentar: `propose_cancel` sengaja
    -- TIDAK boleh jadi auto-close (keputusan Den).
    CONSTRAINT sla_policies_human_check CHECK (
        action <> 'propose_cancel' OR requires_human = true
    )
);

CREATE UNIQUE INDEX sla_policies_company_code_uidx
  ON public.sla_policies (company_id, code) WHERE (deleted_at IS NULL);

COMMENT ON TABLE public.sla_policies IS
  'Kebijakan SLA per entitas. Tiga policy_type: prf_response (sumbu moda), deal_aging (sumbu inquiries.status), account_dormancy (sumbu pre_customer/customer).';
COMMENT ON COLUMN public.sla_policies.inherits_from IS
  'Dipakai baris IN_REVIEW: ambang batasnya mengikuti baris prf_response moda yang bersangkutan.';
COMMENT ON COLUMN public.sla_policies.requires_human IS
  'true = sistem hanya MENGUSULKAN, tidak pernah mengeksekusi sendiri.';

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY sla_policies_read ON public.sla_policies
  FOR SELECT TO authenticated
  USING ((company_id IN (SELECT public.get_user_company_ids()) AND deleted_at IS NULL)
         OR public.is_super_admin());

CREATE POLICY sla_policies_insert ON public.sla_policies
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()) AND public.is_admin_or_above());

CREATE POLICY sla_policies_update ON public.sla_policies
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT public.get_user_company_ids()) OR public.is_super_admin())
  WITH CHECK ((company_id IN (SELECT public.get_user_company_ids()) AND public.is_admin_or_above())
              OR public.is_super_admin());

CREATE POLICY sla_policies_delete ON public.sla_policies
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

GRANT ALL ON TABLE public.sla_policies TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sla_policies TO anon;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sla_policies TO service_role;


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 4 — SEED
-- ═════════════════════════════════════════════════════════════════════════════
-- Entity UUID (CLAUDE.md):
--   MSI 0e1840d8-e6fb-4190-bd09-88338e68b492  (PT Milenial Solusi Internusa)
--   JCI 42569e7c-531b-4d2b-832a-d5a7268c455b  (PT Jago Custom Indonesia)
--   SOA d2e5e565-5f67-4954-b8d9-5979a2a0c697  (PT Stuja Orbit Abadi)

-- ── 4a. loss_reasons (global) ────────────────────────────────────────────────
INSERT INTO public.loss_reasons (code, name, category, applies_to, sort_order) VALUES
  ('PRICE',        'Harga tidak kompetitif',        'commercial', 'deal',    10),
  ('LEADTIME',     'Lead time tidak memenuhi',      'operational','deal',    20),
  ('CAPACITY',     'Kapasitas/space tidak tersedia','operational','deal',    30),
  ('SCOPE',        'Scope tidak sesuai kebutuhan',  'commercial', 'deal',    40),
  ('COMPETITOR',   'Menang ke kompetitor',          'commercial', 'deal',    50),
  ('NO_RESPONSE',  'Customer tidak merespons',      'engagement', 'both',    60),
  ('POSTPONED',    'Rencana ditunda customer',      'engagement', 'both',    70),
  ('BUDGET',       'Budget customer tidak tersedia','commercial', 'both',    80),
  ('COMPLIANCE',   'Terkendala dokumen/compliance', 'operational','deal',    90),
  ('INTERNAL',     'Kami mengundurkan diri',        'internal',   'deal',   100),
  ('DORMANT',      'Tidak ada aktivitas (dorman)',  'engagement', 'account',110),
  ('OTHER',        'Lainnya',                       'other',      'both',   999);

-- ── 4b. channel_types (per entitas, margin_floor NULL) ───────────────────────
INSERT INTO public.channel_types (company_id, code, name, service_line, margin_floor, sort_order)
SELECT c.id, v.code, v.name, v.service_line, NULL, v.sort_order
FROM (VALUES
  ('DIRECT',    'Direct',    NULL::character varying, 10),
  ('FORWARDER', 'Forwarder', NULL::character varying, 20),
  ('HYBRID',    'Hybrid',    NULL::character varying, 30)
) AS v(code, name, service_line, sort_order)
CROSS JOIN (VALUES
  ('0e1840d8-e6fb-4190-bd09-88338e68b492'::uuid),
  ('42569e7c-531b-4d2b-832a-d5a7268c455b'::uuid),
  ('d2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid)
) AS c(id);

-- ── 4c. sla_policies — prf_response (MSI SAJA) ───────────────────────────────
-- Angka & moda ini spesifik freight forwarding. JCI/SOA sengaja TIDAK di-seed:
-- FCL/LCL tak relevan untuk customs/trading, dan angka respons PRF mereka belum
-- ada. Memaksa seed = menaruh data yang tak masuk akal (keputusan Den).
INSERT INTO public.sla_policies
  (company_id, code, name, policy_type, transport_mode, threshold, time_unit, action, sort_order)
VALUES
  ('0e1840d8-e6fb-4190-bd09-88338e68b492','PRF_AIR',    'Respons PRF — Air',         'prf_response','air',    2,'business_hour','flag_stale',10),
  ('0e1840d8-e6fb-4190-bd09-88338e68b492','PRF_FCL',    'Respons PRF — Sea FCL',     'prf_response','fcl',    4,'business_hour','flag_stale',20),
  ('0e1840d8-e6fb-4190-bd09-88338e68b492','PRF_INLAND', 'Respons PRF — Inland',      'prf_response','inland', 4,'business_hour','flag_stale',30),
  ('0e1840d8-e6fb-4190-bd09-88338e68b492','PRF_LCL',    'Respons PRF — Sea LCL',     'prf_response','lcl',    6,'business_hour','flag_stale',40),
  ('0e1840d8-e6fb-4190-bd09-88338e68b492','PRF_PROJECT','Respons PRF — Project',     'prf_response','project',2,'business_day', 'flag_stale',50),
  ('0e1840d8-e6fb-4190-bd09-88338e68b492','PRF_CUSTOM', 'Respons PRF — Custom Only', 'prf_response','custom', 2,'business_day', 'flag_stale',60);

-- ── 4d. sla_policies — deal_aging IN_REVIEW (MSI SAJA, 6 baris ikut moda) ────
-- Opsi (a) yang dipilih Den: redundansi data murah, resolusi diselesaikan saat
-- INSERT (lewat inherits_from + threshold yang disalin), BUKAN saat runtime.
-- JCI/SOA menyusul begitu prf_response mereka ada.
INSERT INTO public.sla_policies
  (company_id, code, name, policy_type, target_status, transport_mode,
   threshold, time_unit, inherits_from, action, sort_order)
SELECT
  p.company_id,
  'AGING_IN_REVIEW_' || upper(p.transport_mode),
  'Aging IN_REVIEW — ' || p.name,
  'deal_aging',
  'IN_REVIEW',
  p.transport_mode,
  p.threshold,
  p.time_unit,
  p.id,
  'flag_stale',
  100 + p.sort_order
FROM public.sla_policies p
WHERE p.policy_type = 'prf_response'
  AND p.company_id = '0e1840d8-e6fb-4190-bd09-88338e68b492';

-- ── 4e. sla_policies — deal_aging sisanya (MSI + JCI + SOA, nilai sama) ──────
-- Ini soal ritme proses sales, bukan moda pengiriman → seragam ketiga entitas.
INSERT INTO public.sla_policies
  (company_id, code, name, policy_type, target_status, threshold, time_unit,
   action, requires_human, escalate_to, description, sort_order)
SELECT c.id, v.code, v.name, 'deal_aging', v.target_status, v.threshold, v.time_unit,
       v.action, v.requires_human, v.escalate_to, v.description, v.sort_order
FROM (VALUES
  ('AGING_OPEN',        'Aging OPEN',            'OPEN',         1, 'business_day',
   'create_task',      false, NULL::character varying,
   'Inquiry OPEN lebih dari 1 hari kerja — buat tugas tindak lanjut.', 200),
  ('AGING_QUOTED_14',   'Aging QUOTED — Stale',  'QUOTED',      14, 'day',
   'flag_stale',       false, NULL,
   'Quotation terkirim 14 hari tanpa gerak — tandai Stale + tugas tindak lanjut.', 210),
  ('AGING_QUOTED_30',   'Aging QUOTED — Usul Batal','QUOTED',   30, 'day',
   'propose_cancel',   true,  NULL,
   'Quotation diam 30 hari — sistem MENGUSULKAN CANCELLED. WAJIB konfirmasi manusia, JANGAN auto-close.', 220),
  ('AGING_NEGOTIATION', 'Aging NEGOTIATION',     'NEGOTIATION', 14, 'day',
   'escalate_manager', false, 'manager',
   'Negosiasi berjalan 14 hari — eskalasi ke manager.', 230)
) AS v(code, name, target_status, threshold, time_unit, action, requires_human, escalate_to, description, sort_order)
CROSS JOIN (VALUES
  ('0e1840d8-e6fb-4190-bd09-88338e68b492'::uuid),
  ('42569e7c-531b-4d2b-832a-d5a7268c455b'::uuid),
  ('d2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid)
) AS c(id);

-- ── 4f. sla_policies — account_dormancy (MSI + JCI + SOA, nilai sama) ────────
INSERT INTO public.sla_policies
  (company_id, code, name, policy_type, target_scope, threshold, time_unit,
   action, description, sort_order)
SELECT c.id, v.code, v.name, 'account_dormancy', v.target_scope, v.threshold, v.time_unit,
       v.action, v.description, v.sort_order
FROM (VALUES
  ('DORM_PRE',  'Dorman — Akun Pra-Customer', 'pre_customer', 30, 'day',   'move_lead_pool',
   'Akun pra-customer nol aktivitas 30 hari — masuk Lead Pool.', 300),
  ('DORM_CUST', 'Dorman — Customer',          'customer',      6, 'month', 'set_free_agent',
   'Customer nol inquiry 6 bulan — jadi free_agent.', 310)
) AS v(code, name, target_scope, threshold, time_unit, action, description, sort_order)
CROSS JOIN (VALUES
  ('0e1840d8-e6fb-4190-bd09-88338e68b492'::uuid),
  ('42569e7c-531b-4d2b-832a-d5a7268c455b'::uuid),
  ('d2e5e565-5f67-4954-b8d9-5979a2a0c697'::uuid)
) AS c(id);

-- ⚠️ TIDAK DI-SEED: kedaluwarsa kontrak. Tabel `contracts` BELUM ADA di skema
--    (dicek: nol hasil di schema_snapshot.sql), jadi renewal_notice_days belum
--    bisa dirujuk. Menyusul di batch Contract.


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 5 — CHECK BANT 0-3 (kolom SUDAH ADA, tidak di-drop, tidak diubah tipe)
-- ═════════════════════════════════════════════════════════════════════════════
-- Rubrik SOP BD v2.2 §4.3 — tiap dimensi bernilai 0..3.
-- `bant_score` (agregat 0..12) SENGAJA tidak diberi CHECK: ia bukan dimensi.
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_bant_budget_check
      CHECK (bant_budget    IS NULL OR bant_budget    BETWEEN 0 AND 3),
  ADD CONSTRAINT accounts_bant_authority_check
      CHECK (bant_authority IS NULL OR bant_authority BETWEEN 0 AND 3),
  ADD CONSTRAINT accounts_bant_need_check
      CHECK (bant_need      IS NULL OR bant_need      BETWEEN 0 AND 3),
  ADD CONSTRAINT accounts_bant_timeline_check
      CHECK (bant_timeline  IS NULL OR bant_timeline  BETWEEN 0 AND 3);


-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 6 — inquiries.owner_id + backfill
-- ═════════════════════════════════════════════════════════════════════════════
-- Nama `owner_id` mengikuti instruksi eksplisit Den. Catatan konvensi: nama ini
-- BELUM PERNAH dipakai di repo — pola "pemilik" yang hidup adalah
-- accounts.assigned_to / assigned_profile. FK-nya menyusul pola itu:
-- REFERENCES profiles(id).
ALTER TABLE public.inquiries ADD COLUMN owner_id uuid;

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

COMMENT ON COLUMN public.inquiries.owner_id IS
  'Pemilik inquiry. Di-backfill dari created_by (batch persiapan CRM v3). Nullable: created_by sendiri nullable.';

UPDATE public.inquiries SET owner_id = created_by WHERE owner_id IS NULL;

CREATE INDEX idx_inquiries_owner_id ON public.inquiries (owner_id) WHERE deleted_at IS NULL;

-- ⚠️ SENGAJA TANPA NOT NULL. `inquiries.created_by` nullable, jadi baris dengan
--    created_by NULL akan tetap owner_id NULL. Memasang NOT NULL akan menolak
--    baris-baris itu dan menggagalkan migrasi. Backfill "100%" hanya tercapai
--    bila pra-cek created_by IS NULL = 0.


-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI (jalankan TERPISAH sesudahnya)
-- ═════════════════════════════════════════════════════════════════════════════
--   -- a. Tiga tabel ada + jumlah seed
--   SELECT 'loss_reasons' t, count(*) FROM public.loss_reasons
--   UNION ALL SELECT 'channel_types', count(*) FROM public.channel_types
--   UNION ALL SELECT 'sla_policies',  count(*) FROM public.sla_policies;
--   -- HARAPAN: loss_reasons 12 · channel_types 9 (3 kode x 3 entitas)
--   --          sla_policies 30 (6 prf MSI + 6 IN_REVIEW MSI + 4x3 aging + 2x3 dorman)
--
--   -- b. loss_reasons benar-benar global
--   SELECT count(*) FROM public.loss_reasons WHERE company_id IS NOT NULL;  -- HARUS 0
--
--   -- c. IN_REVIEW mewarisi ambang moda dengan benar
--   SELECT c.code, c.threshold, c.time_unit, p.code AS induk, p.threshold AS induk_threshold
--     FROM public.sla_policies c JOIN public.sla_policies p ON p.id = c.inherits_from
--    WHERE c.target_status = 'IN_REVIEW' ORDER BY c.code;   -- threshold HARUS sama
--
--   -- d. Guard konfirmasi manusia aktif — HARUS GAGAL:
--   --    INSERT INTO public.sla_policies (company_id, code, name, policy_type,
--   --      target_status, threshold, time_unit, action, requires_human)
--   --    VALUES ('0e1840d8-e6fb-4190-bd09-88338e68b492','X','X','deal_aging',
--   --            'QUOTED', 30, 'day', 'propose_cancel', false);
--
--   -- e. CHECK BANT aktif — HARUS GAGAL:
--   --    UPDATE public.accounts SET bant_budget = 5 WHERE id = (SELECT id FROM public.accounts LIMIT 1);
--
--   -- f. Backfill owner_id
--   SELECT count(*) FILTER (WHERE owner_id IS NULL) AS masih_null,
--          count(*) FILTER (WHERE created_by IS NULL) AS created_by_null,
--          count(*) AS total
--     FROM public.inquiries WHERE deleted_at IS NULL;
--   -- masih_null HARUS sama dengan created_by_null (bukan otomatis 0)
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═════════════════════════════════════════════════════════════════════════════
--   DROP INDEX IF EXISTS public.idx_inquiries_owner_id;
--   ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_owner_id_fkey;
--   ALTER TABLE public.inquiries DROP COLUMN IF EXISTS owner_id;
--   ALTER TABLE public.accounts
--     DROP CONSTRAINT IF EXISTS accounts_bant_budget_check,
--     DROP CONSTRAINT IF EXISTS accounts_bant_authority_check,
--     DROP CONSTRAINT IF EXISTS accounts_bant_need_check,
--     DROP CONSTRAINT IF EXISTS accounts_bant_timeline_check;
--   DROP TABLE IF EXISTS public.sla_policies;   -- self-FK + index ikut terhapus
--   DROP TABLE IF EXISTS public.channel_types;
--   DROP TABLE IF EXISTS public.loss_reasons;
