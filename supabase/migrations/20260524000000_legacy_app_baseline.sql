-- =============================================================================
-- Migration: 20260524000000_legacy_app_baseline
-- Phase:     1.0D++ — Legacy App Baseline for Fresh Staging
-- Purpose:   Create the legacy Storbit Manifest application tables on a
--            fresh Supabase project that has no public schema tables yet.
--            This migration must run FIRST (before 001–014) because:
--              - Migrations 007 and 008 extend `profiles` and `customers`
--                using ALTER TABLE ... ADD COLUMN IF NOT EXISTS, which
--                requires those tables to already exist.
--              - The current frontend (App.jsx, hooks, AuthContext) reads and
--                writes these tables directly and must work after all migrations.
--
-- Tables created:
--   profiles  — user identity and role (extended by migration 007)
--   customers — customer master for legacy UI (extended by migration 008)
--   sp_items  — SP / Surat Pesanan line items (full freight manifest)
--   ar_ttfs   — AR Tracker: TTF headers
--   ar_btbs   — AR Tracker: BTB line items (child of ar_ttfs, cascade delete)
--
-- Column source: derived from exact source code reads of:
--   src/lib/db.js            — all spFromDb/spToDb/customerFromDb/customerToDb/
--                              ttfFromDb/ttfToDb + all SELECT/INSERT/UPDATE calls
--   src/contexts/AuthContext.jsx — profile fields used at auth time
--   src/components/UserManagement.jsx — profile fields shown/written in UI
--   src/hooks/useSpItems.js  — sp_items read/write patterns
--   src/hooks/useTtfs.js     — ar_ttfs / ar_btbs read/write patterns
--   src/hooks/useCustomers.js
--
-- IMPORTANT CONSTRAINTS:
--   1. No RLS is enabled on any table here. RLS for profiles and customers is
--      deferred to Phase 1.0F (company_id backfill dependency).
--      New tables (sp_items, ar_ttfs, ar_btbs) will get RLS when transaction
--      modules are built in Phase 2+.
--   2. No business data is inserted (no INSERT statements).
--   3. No auth users are created.
--   4. set_updated_at() is defined here with CREATE OR REPLACE so migration 001
--      can safely redefine it without conflict.
--   5. This migration does NOT add any ERP master data columns — those are
--      handled additively by migrations 007 and 008.
--
-- Depends:   Fresh Supabase project with auth schema (default on all projects)
-- Run order: 0 — must run BEFORE 20260524000001_companies.sql
-- Status:    DRAFT — do NOT execute without explicit approval
--            See docs/operations/legacy-app-baseline-fresh-staging.md
-- =============================================================================

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP TABLE IF EXISTS ar_btbs;
-- DROP TABLE IF EXISTS ar_ttfs;
-- DROP TABLE IF EXISTS sp_items;
-- DROP TABLE IF EXISTS customers;
-- DROP TABLE IF EXISTS profiles;
-- DROP TYPE IF EXISTS user_role_legacy;
-- DROP FUNCTION IF EXISTS set_updated_at();
-- Note: DROP FUNCTION set_updated_at() will fail if migration 001 has already
--       run and created tables that depend on it. Roll back in reverse migration
--       order (014 → 013 → ... → 001 → 000).
-- =============================================================================


-- =============================================================================
-- PREREQUISITE: uuid-ossp extension
-- Required for uuid_generate_v4() in all PK defaults.
-- Supabase enables this by default on all projects; included here for safety.
-- Migration 001 also runs this — CREATE EXTENSION IF NOT EXISTS is idempotent.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- UTILITY: set_updated_at() trigger function
-- Defined here (before the legacy tables that need it) using CREATE OR REPLACE
-- so migration 001 can reuse the same function without conflict.
-- Every table with an updated_at column uses this same trigger function.
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
    'Trigger function: sets updated_at = now() before every UPDATE. '
    'Defined in migration 000 (legacy baseline) and reused by all subsequent '
    'migrations via CREATE OR REPLACE — safe to re-run.';


-- =============================================================================
-- LEGACY ROLE ENUM
-- The existing UserManagement.jsx exposes exactly 5 role values.
-- The RLS policy draft (migration 014) casts this as role::text for comparison.
-- Using an ENUM ensures invalid role strings cannot be stored.
-- Values in migration order (permission-level ascending):
--   management  → mapped to viewer in Phase 1.0F
--   logistic    → mapped to operations_staff in Phase 1.0F
--   procurement → mapped to procurement_staff in Phase 1.0F
--   finance     → mapped to finance_staff in Phase 1.0F
--   super       → mapped to super_admin in Phase 1.0F
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE user_role_legacy AS ENUM (
        'management',
        'logistic',
        'procurement',
        'finance',
        'super'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL; -- already exists, idempotent
END $$;

COMMENT ON TYPE user_role_legacy IS
    'Legacy role enum for profiles.role. '
    'Coexists with the new user_roles table until Phase 1.0F migration '
    'completes the mapping to the new roles system. DO NOT DROP until '
    'Phase 1.0F is verified in production.';


-- =============================================================================
-- TABLE: profiles
-- User identity table. One row per auth.users entry.
-- Row is created automatically by the on_auth_user_created trigger below.
-- The existing UserManagement.jsx reads:
--   p.id, p.full_name, p.role, p.active
-- and writes via updateProfile:
--   { role: newRole }, { active: newActive }, { full_name: newName }
-- AuthContext reads:
--   profile.role, profile.active, profile.full_name, profile.id
--
-- Migration 007 ADDS (does not modify existing columns):
--   company_id, branch_id, department_id, position_id, last_login_at, mfa_required
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   text,
    role        user_role_legacy    NOT NULL DEFAULT 'logistic',
    active      boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE profiles IS
    'Legacy user profile table. One row per auth.users entry, created by the '
    'on_auth_user_created trigger. Extended by migration 007 with ERP fields. '
    'role column maps to user_role_legacy enum; migrated to user_roles table '
    'in Phase 1.0F.';

COMMENT ON COLUMN profiles.role IS
    'Legacy role enum: super | logistic | procurement | finance | management. '
    'Phase 1.0F maps these to new role codes in user_roles and drops this column.';

COMMENT ON COLUMN profiles.active IS
    'False = user is disabled. AuthContext checks profile.active before '
    'granting isAuthenticated = true.';

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- TRIGGER: on_auth_user_created
-- Creates a profiles row when a new user is added in Supabase Auth.
-- Without this trigger, new users can log in via auth but profile is NULL,
-- and AuthContext sets isAuthenticated = false (profile && profile.active check).
-- Default role 'logistic' — first admin must manually set their role to 'super'
-- via the User Management page (or via Supabase SQL editor for the very first user).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, active)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        'logistic',
        true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
    'Auth trigger: creates a profiles row with default role=logistic when a new '
    'auth user is created. ON CONFLICT DO NOTHING makes it safe to re-run. '
    'SECURITY DEFINER + SET search_path = public prevents hijacking.';

-- Drop the trigger first to allow idempotent re-run of this migration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- TABLE: customers
-- Customer master data for the legacy Storbit Manifest app.
-- Read by: listCustomers() → select('*').order('name')
-- Written by: upsertCustomer() → customerToDb() which writes:
--   code, name, default_dc, pic_name, pic_email, active
-- Joined in sp_items queries as: sp_items.select('*, customers(name)')
-- Joined in ar_ttfs queries as: ar_ttfs.select('*, customers(name), ar_btbs(*)')
--
-- Legacy field: payment_terms integer (days) — kept untouched per migration 008
-- intent. Not used by current customerFromDb() but referenced in migration 008
-- comments as a pre-existing column.
--
-- Migration 008 ADDS (does not modify existing columns):
--   company_id, code (ADD IF NOT EXISTS), legal_name, customer_type, tax_id,
--   address, city, country, phone, email, pic_name (ADD IF NOT EXISTS),
--   pic_phone, pic_email (ADD IF NOT EXISTS), credit_limit, payment_terms_id,
--   currency_code, notes, deleted_at, created_by, updated_by
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            text        NOT NULL,
    code            text,                          -- Customer code (e.g. "IM", "CST-001")
    default_dc      text        NOT NULL DEFAULT '',  -- Default distribution center
    pic_name        text        NOT NULL DEFAULT '',  -- Point of contact name
    pic_email       text        NOT NULL DEFAULT '',  -- Point of contact email
    active          boolean     NOT NULL DEFAULT true,
    payment_terms   integer     NOT NULL DEFAULT 30,  -- Legacy: payment terms in days (integer)
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE customers IS
    'Legacy customer master table. Used by Customer page, SP Manifest, and AR Tracker. '
    'Extended by migration 008 with ERP fields (company_id, credit_limit, etc.). '
    'payment_terms (integer days) is the legacy field; payment_terms_id FK added in 008.';

COMMENT ON COLUMN customers.payment_terms IS
    'Legacy payment terms in days (integer). Not used by current customerFromDb() '
    'but preserved as a pre-existing column. Migration 008 adds payment_terms_id (FK). '
    'Phase 1.0F migrates this value to the FK and drops this integer column.';

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for the standard list query: .order('name')
CREATE INDEX IF NOT EXISTS idx_customers_name
    ON customers (name);

-- Index for the join used in sp_items / ar_ttfs
CREATE INDEX IF NOT EXISTS idx_customers_active
    ON customers (active);


-- =============================================================================
-- TABLE: sp_items
-- SP (Surat Pesanan) line items — the core freight manifest records.
-- Each row = one product line within a Surat Pesanan document.
-- Multiple rows share the same sp_no (grouped in app via groupBySP()).
--
-- All columns derived from spFromDb() / spToDb() in src/lib/db.js.
-- Query pattern:
--   SELECT *, customers(name) FROM sp_items ORDER BY sp_date DESC
--   INSERT / UPDATE individual rows
--   DELETE by id, or multiple deletes by sp_no (done row-by-row in hook)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sp_items (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Document identification
    sp_date         date,                          -- SP issue date
    sp_no           text        NOT NULL DEFAULT '',  -- SP document number (groups items)
    customer_id     uuid        REFERENCES customers(id) ON DELETE SET NULL,

    -- Product details
    product_name    text        NOT NULL DEFAULT '',
    sku             text        NOT NULL DEFAULT '',
    qty             integer     NOT NULL DEFAULT 0,   -- Ordered quantity
    shipped_qty     integer     NOT NULL DEFAULT 0,   -- Quantity already shipped
    exp_date        date,                          -- Expiry date of the product
    deadline        date,                          -- Shipment deadline

    -- Logistics
    dc              text        NOT NULL DEFAULT '',  -- Distribution Center code
    shipping_date   date,                          -- Actual shipping date
    btb_no          text        NOT NULL DEFAULT '',  -- BTB (Bukti Tagihan Barang) number

    -- Pricing
    unit_price      numeric(18, 2) NOT NULL DEFAULT 0,
    shipping_price  numeric(18, 2) NOT NULL DEFAULT 0,

    -- Finance document status flags (4 steps in the finance workflow)
    inv             boolean     NOT NULL DEFAULT false,  -- Invoice issued
    fp              boolean     NOT NULL DEFAULT false,  -- Faktur Pajak issued
    submit          boolean     NOT NULL DEFAULT false,  -- Submitted to customer
    kirim           boolean     NOT NULL DEFAULT false,  -- Delivered

    -- Finance tracking
    submit_date     date,                          -- Date submitted to customer
    email_status    text,                          -- Email date / status (stored as text)

    -- Notes
    notes           text        NOT NULL DEFAULT '',

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE sp_items IS
    'SP (Surat Pesanan) line items — core freight manifest. '
    'Multiple rows share the same sp_no and are grouped in the app by groupBySP(). '
    'customer_id FK ON DELETE SET NULL preserves rows if customer is deleted.';

COMMENT ON COLUMN sp_items.email_status IS
    'Stored as text (not date). App renders it in a date input (type=date) '
    'but treats it as a string. Empty string stored as NULL.';

COMMENT ON COLUMN sp_items.inv IS 'Invoice document issued flag.';
COMMENT ON COLUMN sp_items.fp  IS 'Faktur Pajak (tax invoice) issued flag.';

DROP TRIGGER IF EXISTS trg_sp_items_updated_at ON sp_items;

CREATE TRIGGER trg_sp_items_updated_at
    BEFORE UPDATE ON sp_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for the standard list query and common filter patterns
CREATE INDEX IF NOT EXISTS idx_sp_items_sp_date
    ON sp_items (sp_date DESC NULLS LAST);   -- matches .order('sp_date', ascending: false, nullsFirst: false)

CREATE INDEX IF NOT EXISTS idx_sp_items_customer_id
    ON sp_items (customer_id);               -- join to customers

CREATE INDEX IF NOT EXISTS idx_sp_items_sp_no
    ON sp_items (sp_no);                     -- groupBySP() / deleteRowsBySp()


-- =============================================================================
-- TABLE: ar_ttfs
-- AR Tracker TTF (Tanda Terima Faktur) headers.
-- Each TTF is an invoice acknowledgement record with customer and payment info.
-- One TTF has one or more BTBs (ar_btbs child rows).
--
-- All columns derived from ttfFromDb() / ttfToDb() in src/lib/db.js.
-- Query pattern:
--   SELECT *, customers(name), ar_btbs(*) FROM ar_ttfs ORDER BY tanggal_ttf DESC
--   INSERT header, then INSERT btb rows
--   UPDATE header, then DELETE + re-INSERT btb rows (replace strategy)
--   DELETE header → ar_btbs cascade-deleted via FK
-- =============================================================================
CREATE TABLE IF NOT EXISTS ar_ttfs (
    id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Document identification
    no_ttf              text        NOT NULL DEFAULT '',  -- TTF document number
    tanggal_ttf         date,                          -- TTF date
    tanggal_menerima    date,                          -- Date received by customer
    no_inv              text        NOT NULL DEFAULT '',  -- Invoice number
    no_sp               text        NOT NULL DEFAULT '',  -- Related SP number

    -- Customer linkage
    customer_id         uuid        REFERENCES customers(id) ON DELETE SET NULL,

    -- Payment tracking
    tgl_pembayaran      date,                          -- Payment date (NULL = not yet paid)
    notes               text        NOT NULL DEFAULT '',

    -- Metadata
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ar_ttfs IS
    'AR Tracker TTF (Tanda Terima Faktur) headers. '
    'Parent of ar_btbs (cascade delete). '
    'tgl_pembayaran = NULL means unpaid; used for payment status calculation in calcAR().';

COMMENT ON COLUMN ar_ttfs.tgl_pembayaran IS
    'Payment receipt date. NULL = not yet paid. '
    'calcAR() in App.jsx uses this to determine status: Lunas / Partial / Belum Bayar.';

DROP TRIGGER IF EXISTS trg_ar_ttfs_updated_at ON ar_ttfs;

CREATE TRIGGER trg_ar_ttfs_updated_at
    BEFORE UPDATE ON ar_ttfs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for the standard list query and common filter patterns
CREATE INDEX IF NOT EXISTS idx_ar_ttfs_tanggal_ttf
    ON ar_ttfs (tanggal_ttf DESC NULLS LAST);  -- matches .order('tanggal_ttf', ascending: false)

CREATE INDEX IF NOT EXISTS idx_ar_ttfs_customer_id
    ON ar_ttfs (customer_id);

CREATE INDEX IF NOT EXISTS idx_ar_ttfs_tgl_pembayaran
    ON ar_ttfs (tgl_pembayaran);               -- used for payment status filtering


-- =============================================================================
-- TABLE: ar_btbs
-- AR Tracker BTB (Bukti Tagihan Barang) line items — child of ar_ttfs.
-- Each BTB row contains the invoice amounts and payment amounts.
-- Deleted and re-inserted on every TTF update (replace strategy in db.js updateTtf).
-- ON DELETE CASCADE ensures btbs are removed when their parent TTF is deleted.
--
-- All columns derived from btbPayload construction in src/lib/db.js:
--   insertTtf() and updateTtf() build:
--     { ttf_id, no_btb, dpp_ppn, pph, payment, position }
-- ttfFromDb() reads:
--     id, no_btb, dpp_ppn, pph, payment, position (sorted by position)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ar_btbs (
    id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Parent reference (cascade: delete btbs when TTF is deleted)
    ttf_id      uuid        NOT NULL REFERENCES ar_ttfs(id) ON DELETE CASCADE,

    -- BTB data
    no_btb      text        NOT NULL DEFAULT '',  -- BTB document number
    dpp_ppn     numeric(18, 2) NOT NULL DEFAULT 0,  -- DPP + PPN amount
    pph         numeric(18, 2) NOT NULL DEFAULT 0,  -- PPh withholding tax
    payment     numeric(18, 2) NOT NULL DEFAULT 0,  -- Payment received
    position    integer     NOT NULL DEFAULT 0,     -- Sort order within TTF

    -- created_at only (no updated_at: rows are deleted + re-inserted, not updated)
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ar_btbs IS
    'AR Tracker BTB line items. Child of ar_ttfs (ON DELETE CASCADE). '
    'Update strategy: DELETE all rows for the TTF, then re-INSERT — never '
    'UPDATE individual BTB rows. Therefore no updated_at trigger needed.';

COMMENT ON COLUMN ar_btbs.dpp_ppn IS 'DPP (Dasar Pengenaan Pajak) + PPN combined amount.';
COMMENT ON COLUMN ar_btbs.pph IS 'PPh (Pajak Penghasilan) withholding tax.';
COMMENT ON COLUMN ar_btbs.position IS 'Sort order index. TTF detail display sorts by position ASC.';

-- Primary access pattern: get all btbs for a given TTF, sorted by position
CREATE INDEX IF NOT EXISTS idx_ar_btbs_ttf_id
    ON ar_btbs (ttf_id, position);


-- =============================================================================
-- POST-SETUP NOTES (read before proceeding to migrations 001–014):
--
-- 1. FIRST ADMIN USER:
--    After running this migration, create the first admin user via:
--    Supabase Dashboard → Authentication → Users → Add User → Create New User
--    Then set their role to 'super' via SQL:
--      UPDATE profiles SET role = 'super' WHERE id = '<user_uuid>';
--    Or wait until the app is running and another super user sets the role.
--
-- 2. PROFILE TRIGGER:
--    Every new user created in Supabase Auth will automatically get a profiles
--    row with role='logistic' and active=true. The admin (super) must manually
--    update the role via UserManagement page.
--
-- 3. RLS NOT ENABLED:
--    No RLS is enabled on these tables. profiles and customers RLS is deferred
--    to Phase 1.0F (company_id backfill). sp_items, ar_ttfs, ar_btbs RLS will
--    be added when transaction modules are built in Phase 2+.
--    Until then, the anon key on the frontend provides the only access gate
--    (together with Supabase Auth session enforcement on the frontend).
--
-- 4. set_updated_at() function:
--    Defined here using CREATE OR REPLACE. Migration 001 re-defines it the
--    same way (also CREATE OR REPLACE). Both definitions are identical — the
--    second definition is a no-op. This is intentional and safe.
--
-- 5. PROCEED TO MIGRATION 001:
--    After verifying this migration (see verification queries below), proceed
--    with migrations 001–014 in strict numerical order.
--    See docs/operations/staging-migration-readiness.md for the full checklist.
-- =============================================================================


-- =============================================================================
-- VERIFICATION QUERIES (run in staging after applying this migration):
--
-- 1. All 5 tables created:
-- SELECT tablename FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
-- Expected: ar_btbs, ar_ttfs, customers, profiles, sp_items
--
-- 2. profiles columns (before migration 007):
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'profiles'
-- ORDER BY ordinal_position;
-- Expected: id (uuid), full_name (text), role (user_role_legacy enum),
--           active (bool), created_at (timestamptz), updated_at (timestamptz)
--
-- 3. customers columns (before migration 008):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'customers' ORDER BY ordinal_position;
-- Expected: id, name, code, default_dc, pic_name, pic_email, active,
--           payment_terms, created_at, updated_at
--
-- 4. Trigger function exists:
-- SELECT proname FROM pg_proc WHERE proname IN ('set_updated_at', 'handle_new_user');
-- Expected: 2 rows
--
-- 5. Auth trigger registered:
-- SELECT trigger_name, event_manipulation, event_object_schema
-- FROM information_schema.triggers
-- WHERE trigger_name = 'on_auth_user_created';
-- Expected: 1 row — trigger on auth.users table
--
-- 6. FK constraints exist:
-- SELECT tc.constraint_name, tc.table_name, ccu.table_name AS references_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.constraint_column_usage ccu
--   ON tc.constraint_name = ccu.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_name IN ('profiles','sp_items','ar_ttfs','ar_btbs');
-- Expected:
--   profiles.id → auth.users.id
--   sp_items.customer_id → customers.id
--   ar_ttfs.customer_id → customers.id
--   ar_btbs.ttf_id → ar_ttfs.id
--
-- 7. Enum type created:
-- SELECT typname, typcategory FROM pg_type WHERE typname = 'user_role_legacy';
-- Expected: 1 row
--
-- 8. All indexes created:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
-- ORDER BY indexname;
-- Expected: includes idx_customers_name, idx_customers_active,
--           idx_sp_items_sp_date, idx_sp_items_customer_id, idx_sp_items_sp_no,
--           idx_ar_ttfs_tanggal_ttf, idx_ar_ttfs_customer_id,
--           idx_ar_ttfs_tgl_pembayaran, idx_ar_btbs_ttf_id
-- =============================================================================
