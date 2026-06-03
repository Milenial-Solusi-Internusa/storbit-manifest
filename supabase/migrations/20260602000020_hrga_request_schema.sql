-- =============================================================================
-- Migration 020: HRGA Request Module — Schema
-- Branch: phase-2-service-management
-- Created: 2026-06-02
-- Status: DRAFT — do NOT execute without explicit approval
-- =============================================================================
--
-- Creates 9 tables for the HRGA Request sub-module of Service Management:
--   1. hrga_request_types          - master tipe request (19 types, 6 categories)
--   2. hrga_approval_configs       - chain approval config per type per level
--   3. hrga_requests               - header request per karyawan
--   4. hrga_request_items          - line items (ATK, perjalanan multi-destinasi, dll)
--   5. hrga_request_approvals      - approval action log (INSERT-only, immutable)
--   6. hrga_request_attachments    - file attachments via private storage
--   7. hrga_notification_queue     - email queue untuk Edge Function worker
--   8. hrga_offboarding_checklists - master template checklist offboarding per company
--   9. hrga_offboarding_items      - realisasi checklist per offboarding request
--
-- RLS Dependencies (must exist before this migration runs):
--   - get_user_company_id()   -- migration 014
--   - is_super_admin()        -- migration 014
--   - is_admin_or_above()     -- migration 014
--   - has_role(text)          -- migration 014
--   - companies table         -- migration 001
--   - branches table          -- migration 002
--   - departments table       -- migration 002
--   - currencies table        -- migration 006 (PK is varchar code, NOT uuid — see note below)
--   - roles table             -- migration 005
--
-- REVIEW NOTES (2026-06-02):
--   [FIX-1] currencies PK is varchar(3) code, NOT uuid. hrga_requests uses
--           currency_code varchar(3) instead of currency_id uuid.
--   [FIX-2] has_role() checks roles.code. The role codes 'hrga', 'it', 'finance',
--           'supervisor' are NOT in the migration 005/013 seed. They are added by
--           migration 021 seed. RLS policies are written against these codes and
--           will silently return false until migration 021 seed is applied.
--           Migration 021 MUST run before any user is assigned these roles.
--   [FIX-3] document_no is a varchar column — document_sequences uses soft-reference
--           (no hard FK), same pattern as all other document tables. Row in
--           document_sequences for (company, 'HRG', 'HR', year) is created on
--           first request submission via atomic UPDATE...RETURNING (app layer).
--           HRG document_type is already seeded in migration 004.
--
-- =============================================================================

-- Uses gen_random_uuid() — PostgreSQL 13+ built-in, no extension required.


-- =============================================================================
-- 1. hrga_request_types
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_request_types (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id),
  category_code       varchar(10) NOT NULL,
  -- ADM = Administrasi & Dokumen
  -- AST = Aset & Perlengkapan
  -- FAC = Fasilitas & Operasional
  -- TRV = Perjalanan Dinas
  -- FIN = Keuangan & Reimbursement
  -- OFF = Offboarding
  category_name       varchar(100) NOT NULL,
  type_code           varchar(30)  NOT NULL,
  type_name           varchar(150) NOT NULL,
  description         text,
  requires_attachment boolean      NOT NULL DEFAULT false,
  requires_amount     boolean      NOT NULL DEFAULT false,
  -- true  => amount field wajib saat submit
  -- used for TRV and FIN categories
  requires_date_range boolean      NOT NULL DEFAULT false,
  -- true  => start_date + end_date wajib
  -- used for travel, room booking, vehicle loans
  approval_levels     int          NOT NULL DEFAULT 1 CHECK (approval_levels BETWEEN 1 AND 3),
  is_active           boolean      NOT NULL DEFAULT true,
  sort_order          int          NOT NULL DEFAULT 0,
  created_by          uuid         REFERENCES auth.users(id),
  updated_by          uuid         REFERENCES auth.users(id),
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT hrga_request_types_company_code_unique UNIQUE (company_id, type_code),
  CONSTRAINT hrga_request_types_category_check CHECK (
    category_code IN ('ADM', 'AST', 'FAC', 'TRV', 'FIN', 'OFF')
  )
);

CREATE INDEX IF NOT EXISTS idx_hrga_request_types_company
  ON hrga_request_types (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hrga_request_types_category
  ON hrga_request_types (company_id, category_code)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TRIGGER set_hrga_request_types_updated_at
  BEFORE UPDATE ON hrga_request_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2. hrga_approval_configs
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_approval_configs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id),
  request_type_id     uuid        NOT NULL REFERENCES hrga_request_types(id),
  level               int         NOT NULL CHECK (level BETWEEN 1 AND 3),
  approver_role       varchar(50) NOT NULL,
  -- references roles.code. Valid values seeded in migration 021:
  -- 'hrga', 'it', 'finance', 'supervisor'
  -- plus existing: 'super_admin', 'admin', 'finance_controller', 'finance_staff'
  -- NOTE: has_role() checks user_roles JOIN roles.code — roles must exist in
  --       roles table AND be assigned in user_roles before RLS policies take effect.
  approver_user_id    uuid        REFERENCES auth.users(id),
  -- optional: specific user override; if NULL, any user with approver_role qualifies
  is_active           boolean     NOT NULL DEFAULT true,
  created_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hrga_approval_configs_type_level_unique UNIQUE (request_type_id, level)
);

CREATE INDEX IF NOT EXISTS idx_hrga_approval_configs_type
  ON hrga_approval_configs (request_type_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_hrga_approval_configs_company
  ON hrga_approval_configs (company_id);

CREATE TRIGGER set_hrga_approval_configs_updated_at
  BEFORE UPDATE ON hrga_approval_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 3. hrga_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_requests (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid          NOT NULL REFERENCES companies(id),
  document_no         varchar(50)   NOT NULL,
  -- format: HRG/{ENTITY}/{YYYY}/{NNNN}  e.g. HRG/MSI/2026/0001
  -- Soft-reference to document_sequences (no hard FK — same pattern as all other doc tables).
  -- HRG document_type is seeded in migration 004 for all companies.
  -- document_sequences row created on first submit via: UPDATE ... SET last_sequence+1 RETURNING.
  -- App must UPSERT document_sequences row if it doesn't exist yet for the year.
  request_type_id     uuid          NOT NULL REFERENCES hrga_request_types(id),
  requester_id        uuid          NOT NULL REFERENCES auth.users(id),
  department_id       uuid          REFERENCES departments(id),
  branch_id           uuid          REFERENCES branches(id),

  -- Request content
  subject             varchar(300)  NOT NULL,
  description         text,
  requested_date      date,
  -- tanggal dibutuhkan/target selesai (bukan tanggal submit)
  start_date          date,
  end_date            date,
  amount              numeric(18,4),
  -- wajib diisi saat submit jika requires_amount = true pada request_type
  currency_code       varchar(3)    REFERENCES currencies(code) DEFAULT 'IDR',
  -- currencies PK is varchar(3) code (ISO 4217), NOT uuid — migration 006
  destination         varchar(200),
  -- untuk perjalanan dinas
  notes               text,

  -- Status & approval tracking
  status              varchar(30)   NOT NULL DEFAULT 'draft',
  -- draft | submitted | under_review | revision_requested | revised
  -- approved | rejected | cancelled | completed | archived
  current_level       int           NOT NULL DEFAULT 0,
  -- 0 = belum disubmit; 1/2/3 = level approval yang sedang menunggu aksi
  total_levels        int           NOT NULL DEFAULT 1 CHECK (total_levels BETWEEN 1 AND 3),

  -- Timestamp milestones
  submitted_at        timestamptz,
  approved_at         timestamptz,
  rejected_at         timestamptz,
  completed_at        timestamptz,

  -- Audit
  created_by          uuid          REFERENCES auth.users(id),
  updated_by          uuid          REFERENCES auth.users(id),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT hrga_requests_document_no_unique UNIQUE (company_id, document_no),
  CONSTRAINT hrga_requests_status_check CHECK (
    status IN (
      'draft', 'submitted', 'under_review',
      'revision_requested', 'revised',
      'approved', 'rejected', 'cancelled',
      'completed', 'archived'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hrga_requests_company
  ON hrga_requests (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hrga_requests_requester
  ON hrga_requests (requester_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hrga_requests_company_status
  ON hrga_requests (company_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hrga_requests_company_created
  ON hrga_requests (company_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hrga_requests_type
  ON hrga_requests (request_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hrga_requests_current_level
  ON hrga_requests (company_id, current_level, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER set_hrga_requests_updated_at
  BEFORE UPDATE ON hrga_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 4. hrga_request_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_request_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid          NOT NULL REFERENCES hrga_requests(id) ON DELETE CASCADE,
  line_no             int           NOT NULL DEFAULT 1,
  item_description    varchar(300)  NOT NULL,
  quantity            numeric(18,4) NOT NULL DEFAULT 1,
  unit                varchar(50),
  -- pcs, set, hari, malam, lembar, dll
  unit_price          numeric(18,4),
  total_price         numeric(18,4),
  -- denormalized; computed by app: quantity * unit_price
  notes               text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT hrga_request_items_line_no_positive CHECK (line_no > 0),
  CONSTRAINT hrga_request_items_qty_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_hrga_request_items_request
  ON hrga_request_items (request_id);

CREATE TRIGGER set_hrga_request_items_updated_at
  BEFORE UPDATE ON hrga_request_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 5. hrga_request_approvals  (INSERT-only, immutable audit trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_request_approvals (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid          NOT NULL REFERENCES hrga_requests(id),
  level               int           NOT NULL CHECK (level BETWEEN 1 AND 3),
  approver_id         uuid          NOT NULL REFERENCES auth.users(id),
  approver_role       varchar(50)   NOT NULL,
  -- snapshot of the approver's primary role at time of action
  action              varchar(30)   NOT NULL,
  -- approved | rejected | revision_requested | noted
  comment             text,
  actioned_at         timestamptz   NOT NULL DEFAULT now(),
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT hrga_request_approvals_action_check CHECK (
    action IN ('approved', 'rejected', 'revision_requested', 'noted')
  )
);

CREATE INDEX IF NOT EXISTS idx_hrga_request_approvals_request
  ON hrga_request_approvals (request_id);

CREATE INDEX IF NOT EXISTS idx_hrga_request_approvals_approver
  ON hrga_request_approvals (approver_id);

-- NO updated_at trigger — this table is intentionally immutable


-- =============================================================================
-- 6. hrga_request_attachments
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_request_attachments (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid          NOT NULL REFERENCES hrga_requests(id),
  file_name           varchar(255)  NOT NULL,
  storage_path        text          NOT NULL,
  -- pattern: hrga-attachments/{company_id}/{request_id}/{uuid}_{filename}
  file_size_bytes     bigint,
  mime_type           varchar(100),
  uploaded_by         uuid          NOT NULL REFERENCES auth.users(id),
  uploaded_at         timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz
  -- soft delete: file stays in storage until separately cleaned up
);

CREATE INDEX IF NOT EXISTS idx_hrga_request_attachments_request
  ON hrga_request_attachments (request_id)
  WHERE deleted_at IS NULL;


-- =============================================================================
-- 7. hrga_notification_queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_notification_queue (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid          NOT NULL REFERENCES companies(id),
  request_id          uuid          NOT NULL REFERENCES hrga_requests(id),
  recipient_id        uuid          NOT NULL REFERENCES auth.users(id),
  recipient_email     varchar(200)  NOT NULL,
  -- snapshot at queue time; user may change email later
  notification_type   varchar(50)   NOT NULL,
  -- request_submitted | request_approved | request_rejected
  -- approval_pending | revision_requested
  payload             jsonb,
  -- extra data for email template (request subject, type name, document_no, etc.)
  status              varchar(20)   NOT NULL DEFAULT 'pending',
  -- pending | sent | failed | skipped
  sent_at             timestamptz,
  error_message       text,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT hrga_notification_queue_status_check CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped')
  ),
  CONSTRAINT hrga_notification_queue_type_check CHECK (
    notification_type IN (
      'request_submitted', 'request_approved', 'request_rejected',
      'approval_pending', 'revision_requested'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_hrga_notification_queue_pending
  ON hrga_notification_queue (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_hrga_notification_queue_request
  ON hrga_notification_queue (request_id);


-- =============================================================================
-- 8. hrga_offboarding_checklists  (master template per company)
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_offboarding_checklists (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid          NOT NULL REFERENCES companies(id),
  department          varchar(50)   NOT NULL DEFAULT 'ALL',
  -- 'ALL' = berlaku semua departemen
  -- atau nama department spesifik untuk checklist conditional
  responsible_role    varchar(50)   NOT NULL,
  -- 'hrga' | 'it' | 'finance'
  -- menentukan siapa yang harus menyelesaikan item ini
  item_order          int           NOT NULL DEFAULT 0,
  item_description    varchar(300)  NOT NULL,
  is_required         boolean       NOT NULL DEFAULT true,
  notes               text,
  is_active           boolean       NOT NULL DEFAULT true,
  created_by          uuid          REFERENCES auth.users(id),
  updated_by          uuid          REFERENCES auth.users(id),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  deleted_at          timestamptz,

  CONSTRAINT hrga_offboarding_checklists_role_check CHECK (
    responsible_role IN ('hrga', 'it', 'finance', 'supervisor')
  )
);

CREATE INDEX IF NOT EXISTS idx_hrga_offboarding_checklists_company
  ON hrga_offboarding_checklists (company_id)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE TRIGGER set_hrga_offboarding_checklists_updated_at
  BEFORE UPDATE ON hrga_offboarding_checklists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 9. hrga_offboarding_items  (realisasi checklist per request)
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrga_offboarding_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid          NOT NULL REFERENCES hrga_requests(id) ON DELETE CASCADE,
  checklist_id        uuid          REFERENCES hrga_offboarding_checklists(id),
  -- NULL jika item di-add manual (tidak dari template)
  item_order          int           NOT NULL DEFAULT 0,
  item_description    varchar(300)  NOT NULL,
  responsible_role    varchar(50)   NOT NULL,
  is_required         boolean       NOT NULL DEFAULT true,
  status              varchar(20)   NOT NULL DEFAULT 'pending',
  -- pending | done | skipped | na
  completed_by        uuid          REFERENCES auth.users(id),
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT hrga_offboarding_items_status_check CHECK (
    status IN ('pending', 'done', 'skipped', 'na')
  )
);

CREATE INDEX IF NOT EXISTS idx_hrga_offboarding_items_request
  ON hrga_offboarding_items (request_id);

CREATE TRIGGER set_hrga_offboarding_items_updated_at
  BEFORE UPDATE ON hrga_offboarding_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- RLS — Enable on all tables
-- =============================================================================

ALTER TABLE hrga_request_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_approval_configs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_requests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_request_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_request_approvals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_request_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_notification_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_offboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrga_offboarding_items      ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- RLS Policies — hrga_request_types
-- =============================================================================

DROP POLICY IF EXISTS hrga_request_types_read   ON hrga_request_types;
DROP POLICY IF EXISTS hrga_request_types_insert ON hrga_request_types;
DROP POLICY IF EXISTS hrga_request_types_update ON hrga_request_types;

-- All authenticated users in company can read active types (for request form)
CREATE POLICY hrga_request_types_read ON hrga_request_types
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND deleted_at IS NULL)
  );

-- Only admin/hrga can create or update types
CREATE POLICY hrga_request_types_insert ON hrga_request_types
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  );

CREATE POLICY hrga_request_types_update ON hrga_request_types
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  )
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  );

-- No DELETE policy — use soft delete (deleted_at)


-- =============================================================================
-- RLS Policies — hrga_approval_configs
-- =============================================================================

DROP POLICY IF EXISTS hrga_approval_configs_read   ON hrga_approval_configs;
DROP POLICY IF EXISTS hrga_approval_configs_insert ON hrga_approval_configs;
DROP POLICY IF EXISTS hrga_approval_configs_update ON hrga_approval_configs;

CREATE POLICY hrga_approval_configs_read ON hrga_approval_configs
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id())
  );

CREATE POLICY hrga_approval_configs_insert ON hrga_approval_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  );

CREATE POLICY hrga_approval_configs_update ON hrga_approval_configs
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  )
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  );


-- =============================================================================
-- RLS Policies — hrga_requests
-- =============================================================================

DROP POLICY IF EXISTS hrga_requests_read_own       ON hrga_requests;
DROP POLICY IF EXISTS hrga_requests_read_approver  ON hrga_requests;
DROP POLICY IF EXISTS hrga_requests_insert         ON hrga_requests;
DROP POLICY IF EXISTS hrga_requests_update_draft   ON hrga_requests;
DROP POLICY IF EXISTS hrga_requests_update_status  ON hrga_requests;

-- Requester: can always see their own requests
CREATE POLICY hrga_requests_read_own ON hrga_requests
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      is_super_admin()
      OR (company_id = get_user_company_id() AND requester_id = auth.uid())
      OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga') OR has_role('it') OR has_role('finance')))
    )
  );
-- NOTE: HRGA/IT/Finance approvers can see all requests in their company
-- so they can action approval queue. Supervisor sees own only (no has_role check here —
-- supervisor sees requests via their own requester_id. Cross-department supervisor visibility
-- can be added in a future phase via department-scoped policy.

-- Requester: any authenticated user in company can submit a request
CREATE POLICY hrga_requests_insert ON hrga_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND requester_id = auth.uid()
  );

-- Requester: can edit only their own draft/revision_requested requests
CREATE POLICY hrga_requests_update_draft ON hrga_requests
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND company_id = get_user_company_id()
    AND requester_id = auth.uid()
    AND status IN ('draft', 'revision_requested')
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND requester_id = auth.uid()
  );

-- Approvers / admin: can update status fields (approve, reject, etc.)
-- Also allows requester to cancel their own submitted request
CREATE POLICY hrga_requests_update_status ON hrga_requests
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND company_id = get_user_company_id()
    AND (
      is_super_admin()
      OR is_admin_or_above()
      OR has_role('hrga')
      OR has_role('it')
      OR has_role('finance')
      OR (requester_id = auth.uid() AND status = 'submitted')
      -- requester can cancel before first approval
    )
  )
  WITH CHECK (
    company_id = get_user_company_id()
  );

-- No DELETE policy — use soft delete (deleted_at)


-- =============================================================================
-- RLS Policies — hrga_request_items
-- =============================================================================

DROP POLICY IF EXISTS hrga_request_items_read   ON hrga_request_items;
DROP POLICY IF EXISTS hrga_request_items_insert ON hrga_request_items;
DROP POLICY IF EXISTS hrga_request_items_update ON hrga_request_items;

-- Items visible to anyone who can see the parent request
-- Join guard: app always filters via request_id which is already RLS-scoped
CREATE POLICY hrga_request_items_read ON hrga_request_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.deleted_at IS NULL
        AND (
          is_super_admin()
          OR r.company_id = get_user_company_id()
        )
    )
  );

-- Requester can add items only while request is draft
CREATE POLICY hrga_request_items_insert ON hrga_request_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.requester_id = auth.uid()
        AND r.status = 'draft'
        AND r.company_id = get_user_company_id()
    )
  );

-- Requester can update items only while request is draft or revision_requested
CREATE POLICY hrga_request_items_update ON hrga_request_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.requester_id = auth.uid()
        AND r.status IN ('draft', 'revision_requested')
        AND r.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.requester_id = auth.uid()
        AND r.company_id = get_user_company_id()
    )
  );

-- No DELETE policy — app replaces items by soft-delete pattern on request revision


-- =============================================================================
-- RLS Policies — hrga_request_approvals  (INSERT-only, NO UPDATE, NO DELETE)
-- =============================================================================

DROP POLICY IF EXISTS hrga_request_approvals_read   ON hrga_request_approvals;
DROP POLICY IF EXISTS hrga_request_approvals_insert ON hrga_request_approvals;

CREATE POLICY hrga_request_approvals_read ON hrga_request_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.deleted_at IS NULL
        AND (
          is_super_admin()
          OR r.company_id = get_user_company_id()
        )
    )
  );

-- Approver can only insert their own approval action
CREATE POLICY hrga_request_approvals_insert ON hrga_request_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    approver_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.company_id = get_user_company_id()
        AND r.deleted_at IS NULL
    )
  );

-- NO UPDATE policy — immutable by design
-- NO DELETE policy — immutable by design


-- =============================================================================
-- RLS Policies — hrga_request_attachments
-- =============================================================================

DROP POLICY IF EXISTS hrga_request_attachments_read   ON hrga_request_attachments;
DROP POLICY IF EXISTS hrga_request_attachments_insert ON hrga_request_attachments;
DROP POLICY IF EXISTS hrga_request_attachments_update ON hrga_request_attachments;

CREATE POLICY hrga_request_attachments_read ON hrga_request_attachments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.deleted_at IS NULL
        AND (
          is_super_admin()
          OR r.company_id = get_user_company_id()
        )
    )
  );

-- Requester or approver in company can upload attachments
CREATE POLICY hrga_request_attachments_insert ON hrga_request_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.deleted_at IS NULL
        AND r.company_id = get_user_company_id()
    )
  );

-- Soft-delete only (set deleted_at): only the uploader or admin can soft-delete
CREATE POLICY hrga_request_attachments_update ON hrga_request_attachments
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.company_id = get_user_company_id()
    )
    AND (
      is_super_admin()
      OR is_admin_or_above()
      OR has_role('hrga')
      OR uploaded_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.company_id = get_user_company_id()
    )
  );

-- No hard DELETE policy


-- =============================================================================
-- RLS Policies — hrga_notification_queue
-- =============================================================================

DROP POLICY IF EXISTS hrga_notification_queue_read   ON hrga_notification_queue;
DROP POLICY IF EXISTS hrga_notification_queue_insert ON hrga_notification_queue;
DROP POLICY IF EXISTS hrga_notification_queue_update ON hrga_notification_queue;

-- Admin and super_admin can read queue for debugging; regular users cannot
CREATE POLICY hrga_notification_queue_read ON hrga_notification_queue
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND is_admin_or_above())
  );

-- App (via authenticated context) inserts notifications on status change
CREATE POLICY hrga_notification_queue_insert ON hrga_notification_queue
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
  );

-- Edge Function worker (service role) updates status — no RLS applies to service role
-- This UPDATE policy is for admin monitoring corrections only
CREATE POLICY hrga_notification_queue_update ON hrga_notification_queue
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (company_id = get_user_company_id() AND is_admin_or_above())
  )
  WITH CHECK (
    company_id = get_user_company_id()
  );

-- No DELETE policy


-- =============================================================================
-- RLS Policies — hrga_offboarding_checklists
-- =============================================================================

DROP POLICY IF EXISTS hrga_offboarding_checklists_read   ON hrga_offboarding_checklists;
DROP POLICY IF EXISTS hrga_offboarding_checklists_insert ON hrga_offboarding_checklists;
DROP POLICY IF EXISTS hrga_offboarding_checklists_update ON hrga_offboarding_checklists;

CREATE POLICY hrga_offboarding_checklists_read ON hrga_offboarding_checklists
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      is_super_admin()
      OR company_id = get_user_company_id()
    )
  );

CREATE POLICY hrga_offboarding_checklists_insert ON hrga_offboarding_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  );

CREATE POLICY hrga_offboarding_checklists_update ON hrga_offboarding_checklists
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      is_super_admin()
      OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (company_id = get_user_company_id() AND (is_admin_or_above() OR has_role('hrga')))
  );

-- No DELETE policy — use soft delete (deleted_at)


-- =============================================================================
-- RLS Policies — hrga_offboarding_items
-- =============================================================================

DROP POLICY IF EXISTS hrga_offboarding_items_read   ON hrga_offboarding_items;
DROP POLICY IF EXISTS hrga_offboarding_items_insert ON hrga_offboarding_items;
DROP POLICY IF EXISTS hrga_offboarding_items_update ON hrga_offboarding_items;

CREATE POLICY hrga_offboarding_items_read ON hrga_offboarding_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.deleted_at IS NULL
        AND (
          is_super_admin()
          OR r.company_id = get_user_company_id()
        )
    )
  );

-- System generates items on submit (via app with authenticated context)
-- Any user in company who can see the request can create items at submit time
CREATE POLICY hrga_offboarding_items_insert ON hrga_offboarding_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.company_id = get_user_company_id()
        AND r.deleted_at IS NULL
    )
  );

-- Responsible approver can mark items done/skipped/na
CREATE POLICY hrga_offboarding_items_update ON hrga_offboarding_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.deleted_at IS NULL
        AND r.company_id = get_user_company_id()
        AND (
          is_super_admin()
          OR is_admin_or_above()
          OR has_role('hrga')
          OR has_role('it')
          OR has_role('finance')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hrga_requests r
      WHERE r.id = request_id
        AND r.company_id = get_user_company_id()
    )
  );

-- No DELETE policy — offboarding items are a permanent audit record


-- =============================================================================
-- GRANT DML to authenticated role
-- =============================================================================
-- Supabase CLI-created tables do NOT auto-grant SELECT/INSERT/UPDATE/DELETE
-- to the authenticated role (unlike Dashboard-created tables).
-- Postgres checks table-level privilege BEFORE evaluating RLS — without these
-- grants every operation returns "permission denied" regardless of RLS policy.

GRANT SELECT, INSERT, UPDATE ON hrga_request_types          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_approval_configs       TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_requests               TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_request_items          TO authenticated;
GRANT SELECT, INSERT         ON hrga_request_approvals      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_request_attachments    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_notification_queue     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_offboarding_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE ON hrga_offboarding_items      TO authenticated;


-- =============================================================================
-- ROLLBACK SQL
-- =============================================================================
-- To roll back this migration, run the following SQL:
--
-- DROP TABLE IF EXISTS hrga_offboarding_items      CASCADE;
-- DROP TABLE IF EXISTS hrga_offboarding_checklists CASCADE;
-- DROP TABLE IF EXISTS hrga_notification_queue     CASCADE;
-- DROP TABLE IF EXISTS hrga_request_attachments    CASCADE;
-- DROP TABLE IF EXISTS hrga_request_approvals      CASCADE;
-- DROP TABLE IF EXISTS hrga_request_items          CASCADE;
-- DROP TABLE IF EXISTS hrga_requests               CASCADE;
-- DROP TABLE IF EXISTS hrga_approval_configs       CASCADE;
-- DROP TABLE IF EXISTS hrga_request_types          CASCADE;
--
-- =============================================================================
-- END OF MIGRATION 020
-- =============================================================================
