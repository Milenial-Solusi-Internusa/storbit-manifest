# DATA MODEL — Nexus by MSI

> Referensi database. Sumber kebenaran struktur = **`supabase/schema_snapshot.sql`** (`pg_dump` full). Migrasi formal berhenti 3 Jun 2026 — banyak perubahan via SQL Editor (snapshot bisa lag; lihat §6).

---

## 1. Overview

- **Supabase project ref:** `untmpqceexwxzuhlmyrg`
- **Pooler:** `aws-1-ap-northeast-2.pooler.supabase.com:5432` (region Seoul)
- **Total tabel:** 73 (schema `public`)
- **Fungsi DB:** 17 · **RLS policy:** 182 · **Trigger:** ~40 (mayoritas `set_updated_at`)
- Skema: multi-company (semua tabel business punya `company_id` / `owner_company_id`), soft-delete (`deleted_at`), RLS company- + role-scoped.

---

## 2. Entity UUIDs

| Entity | Nama | UUID |
|--------|------|------|
| MSI | PT Milenial Solusi Internusa (Freight Forwarding) | `0e1840d8-e6fb-4190-bd09-88338e68b492` |
| JCI | PT Jago Custom Indonesia (PPJK/Customs) | `42569e7c-531b-4d2b-832a-d5a7268c455b` |
| SOA | PT Stuja Orbit Abadi (General Trading; eks SBI/Storbit) | `d2e5e565-5f67-4954-b8d9-5979a2a0c697` |

Branch MSI Head Office: `ef2594db…` (asset_locations "Head Office BSD" terkait). [TODO: UUID branch lain bila perlu]

---

## 3. Tabel Utama per Modul

### CRM & Sales
- **`accounts`** — **master customer tunggal**. `account_status` ∈ `prospect`/`customer`/`lost`/`free_agent`/`lead_pool`. Kolom kunci: `name, legal_name, customer_type, source, pipeline_stage, account_status, owner_company_id, company_id, code, tier, assigned_to, created_by, estimated_value, estimated_closing_date, payment_terms_id, bant_*, won_reason, lost_reason, became_customer_at, converted_at, vat_rate?` . **RLS aktif** (`prospects_read/insert/update`): `company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=auth.uid() OR created_by=auth.uid()) OR is_super_admin()`. **Gotcha:** WON → auto-`customer` via trigger `trg_set_customer_on_won`; FK constraint masih bernama `prospects_*` (lihat §6).
- **`inquiries`** — `inquiry_no, prospect_id, customer_id, service_type, route, commodity, status, deleted_at`. FK `inquiries_prospect_id_fkey` / `inquiries_customer_id_fkey` → `accounts`.
- **`quotations`** — `quotation_no, revision, inquiry_id, prospect_id, customer_id, service_type, route, valid_until, quote_date, payment_terms_id, currency_code, usd_rate, vat_rate (DEFAULT 0.011), discount_pct, subtotal, tax_amount, total_amount, status, notes, terms, internal_notes, margin_floor, pricing_done_at, quote_sent_at`. FK → `accounts` (`quotations_prospect_id_fkey`/`_customer_id_fkey`). RLS: read/insert company-scoped; `quotations_update` = owner (`created_by`) ATAU manager ATAU super.
- **`quotation_items`** — `quotation_id, sort_order, description, qty, unit, unit_price, notes, group_name, currency, unit_label, exchange_rate, total, cost_price`. **Punya policy DELETE** (fix 2.8J — sebelumnya delete-then-insert silent gagal). Save via RPC `save_quotation` (atomik).
- **`activities`** — modul Activity terpadu (gantikan `sales_calls`+`sales_visits`). `type` (call/whatsapp/visit/meeting/email/followup), `status` (todo/done/cancelled), `account_id`/`inquiry_id`/`quotation_id`, `assigned_to`, `scheduled_for`, `details jsonb`, `migrated_from`. RLS niru accounts.
- **`activity_logs`** — audit status activity: `activity_id` (FK CASCADE), `changed_by`, `from_status`, `to_status`, `notes`. RLS via parent activity (EXISTS), bukan `company_id`.
- **`user_login_logs`** — sumber feed "Login" (`user_id, logged_in_at, ip, …`). **Tanpa `company_id`** → RLS sendiri (manager+/super/own). Diisi fungsi `capture_login_session()`.
- **DORMANT:** `sales_calls`, `sales_visits`, `sales_visit_logs` (digantikan activities/activity_logs sejak cutover 2.9D; belum di-drop). `customers` (digantikan `accounts`; pensiun, tak dihapus).

### Foundation / Master Data
- **`companies`** (3 entity), **`branches`**, **`departments`** (`code, name, parent_id, company_id`), **`positions`** (`code, name, level [Staff/Supervisor/Manager/Head/Director], department_id`; **UNIQUE(company_id, code)**), **`profiles`** (user; **`active` boolean, TIDAK ada `deleted_at`**; `reports_to` self-FK untuk org chart; `avatar_url`, `notification_preferences jsonb`, `display_preferences jsonb`; legacy `role` kolom deprecated). **`products`**, **`document_types`**, **`payment_terms`**, **`taxes`**, **`status_catalog`**, **`vendors`**, **`warehouses`**.
- **`currencies`** — `code, name, symbol, decimal_places, is_active`. Isi: USD/IDR/EUR/SGD/JPY/MYR. RLS `currencies_read_all` = `USING(true)` (semua authenticated baca).
- **`exchange_rates`**, **`code_counters`** (counter generate code customer), **`document_sequences`** / **`document_numbering`** / **`document_templates`**.
- **Entity settings:** `entity_bank_accounts`, `entity_signatories`, `entity_finance_settings` (Admin Settings).

### RBAC / Access Control
- **`user_roles`** — sumber role user (13 ERP role). `user_id` (→ `auth.users`, BUKAN profiles), `role_id`, `company_id`, `is_active`, `revoked_at`, `valid_until`. RLS: own row, atau admin se-company, atau super.
- **`roles`** (`code, name, level`), **`role_permissions`**, **`permissions`**, **`role_permission_templates`**.
- **Hierarki menu:** `modules` → `module_menus` → `module_actions` → `menu_actions`; `user_menu_permissions` (granular per-user-per-menu-action). Dipakai `hasMenuPermission`.
- **`profiles.role`** (legacy enum `user_role_legacy`) — deprecated, frontend/EF tak baca lagi; drop kolom = tahap final pending.

### Finance
- `chart_of_accounts` (COA, unique per company), `cost_centers`, `taxes`, `currencies`, `exchange_rates`.

### Approval Engine
- `approval_rules`, `approval_workflows`, `approval_workflow_steps`, `approval_logs`, `approval_delegations`. (Sebagian UI Admin Settings sudah disambung; lihat ROADMAP.)

### HRGA
- `hrga_requests`, `hrga_request_items`, `hrga_request_types`, `hrga_request_approvals` (INSERT-only audit), `hrga_request_attachments`, `hrga_approval_configs` (**UNIQUE(request_type_id, level)**; selalu filter `company_id`), `hrga_notification_queue`, `hrga_offboarding_checklists`, `hrga_offboarding_items`.

### Asset Management
- `assets` (+ kolom SQL-Editor: `condition`, `department_id` FK, `brand`, `assignment_status`), `asset_categories`, `asset_locations` (`branch_id` NOT NULL), `asset_specifications`, `asset_network`, `asset_software_licenses`, `asset_maintenance_records`, `asset_fuel_logs`. **Belum ada:** `asset_documents`, `asset_work_orders`, `asset_routes` (UI placeholder).

### Inventory & Logistics (Storbit SP/AR)
- `stock_ledger`, `products`, `warehouses`.
- `sp_items` (Sales Order / Surat Pesanan; FK `sp_items_customer_id_fkey` → `accounts`), `sp_btbs`, `ar_ttfs` (FK `ar_ttfs_customer_id_fkey` → `accounts`), `ar_btbs`.

### Notifications
- `notifications`, `notification_rules`.

---

## 4. RLS Patterns (fungsi)

| Fungsi | Role yang di-cover | Catatan |
|--------|--------------------|---------|
| `is_super_admin()` | `super_admin` (via `user_roles`) | Top-level bypass. JANGAN nest di dalam filter company. |
| `get_user_company_id()` | — | `SELECT company_id FROM profiles WHERE id=auth.uid()`. Null sebelum backfill / di SQL Editor. |
| `is_admin_or_above()` | `super_admin`, `admin` **saja** | ⚠️ TIDAK termasuk manager/ceo — dipakai ~51 policy; sumber banyak bug akses (lihat tech debt). |
| `is_manager_or_above()` | super_admin, admin, ceo, gm, manager, sales_head | Dipakai RLS accounts/activities. |
| `has_permission(module, action)` | query `user_roles→roles→role_permissions→permissions` | ⚠️ Lihat §6 — `CLAUDE.md` menandai BROKEN/unseeded. |
| `has_role(role_code)` | cek role di `user_roles` | — |
| `get_user_role_code()` | role code user | — |

**Pola policy accounts (acuan):** `SELECT/UPDATE USING ((company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=auth.uid() OR created_by=auth.uid())) OR is_super_admin())`; `INSERT WITH CHECK (company_id = get_user_company_id())`.

**`profiles_read` = `USING(true)`** (stopgap CEO unblock — semua authenticated baca profiles; lihat tech debt).

---

## 5. RPC Functions

| RPC | Signature | Tujuan |
|-----|-----------|--------|
| `save_quotation` | `(p_quotation_id uuid, p_header jsonb, p_items jsonb)` | Simpan quotation atomik: UPDATE header (COALESCE per field) + DELETE+INSERT items dalam 1 txn; RAISE bila RLS tolak / 0-row. Terima `p_header.vat_rate`. |
| `increment_document_sequence` | `(p_company_id, p_document_type, p_department_code, p_year, p_month=0)` | Generate nomor dokumen sekuensial atomik (SECURITY DEFINER). |
| `is_super_admin` / `get_user_company_id` / `is_admin_or_above` / `is_manager_or_above` / `has_permission` / `has_role` / `get_user_role_code` | — | Helper RLS (lihat §4). Bisa dipanggil `supabase.rpc(...)` dari frontend (mis. gating super-admin). |
| `get_table_columns` | `(p_table text)` | Introspeksi kolom (dipakai Schema Manager + custom fields). |
| `exec_sql` | `(sql text)` | Eksekusi SQL arbitrer (Edge Function `manage-schema`; service-role only). |
| `int_to_roman` | `(num integer)` | Helper (code customer pakai angka romawi). |
| **Trigger fns** | — | `generate_customer_code()`, `set_customer_on_won()`, `handle_new_user()`, `set_updated_at()`, `capture_login_session()`. |

---

## 6. Known Issues & Gotchas

1. **Snapshot lag:** `migrations/` berhenti 3 Jun; perubahan SQL Editor (mis. `assets.condition/brand/department_id/assignment_status`, `quotations.vat_rate`, `accounts.estimated_value`, `currencies`, `activities`/`activity_logs`, `user_login_logs`) masuk lewat snapshot — JANGAN andalkan migrasi untuk struktur terkini. Refresh snapshot via `pg_dump`. Sudah 2× menyebabkan salah-baca schema.
2. **FK constraint pakai nama lama `prospects_*`:** rename tabel `prospects`→`accounts` TIDAK rename constraint. Embed PostgREST tetap pakai nama lama, dengan **alias** supaya consumer tak berubah: `profiles!prospects_assigned_to_fkey`, `companies!prospects_owner_company_id_fkey`, dst. Begitu juga `customers`→`accounts` (embed `customers:accounts!sp_items_customer_id_fkey(name)`). Jika DBA me-rename constraint, update bagian `!constraint`.
3. **`auth.uid()` NULL di SQL Editor** → semua RLS helper false/null. Test RLS hanya di sesi browser.
4. **Trigger ordering `trg_z_`:** `trg_z_gen_customer_code_upd` (BEFORE UPDATE, `WHEN code NULL/'' AND deleted_at IS NULL`) sengaja prefix `z` agar fire **setelah** `trg_set_customer_on_won`. WHEN sudah meng-exclude soft-delete (fix bug "duplicate key accounts_code_unique saat hapus customer"). `accounts_code_unique` = `UNIQUE(code) WHERE code IS NOT NULL`.
5. **`has_permission()` flagged BROKEN** di `CLAUDE.md` ("query tabel `permissions`/`role_permissions` yang tidak ada"). Snapshot saat ini **punya** tabel `permissions` + `role_permissions` → kemungkinan tabel ada tapi **belum ter-seed** / fungsi tak dipakai. [TODO: verifikasi apakah `permissions`/`role_permissions` terisi & `has_permission` benar-benar dipakai RLS].
6. **`is_admin_or_above()` tidak kenal manager/ceo** → ~51 policy memakainya, tak sinkron dgn RBAC granular UI. Pemicu bug akses (mis. CEO ke-block baca profiles → stopgap `profiles_read USING(true)`; dropdown sales kosong untuk manager). Lihat tech debt RBAC RLS migration.
7. **`profiles` tanpa `deleted_at`** → pakai `active`. **`user_roles.user_id` → `auth.users`** (bukan profiles) → tak bisa embed user_roles dari profiles; query terpisah lalu map.
8. **Dormant tables** belum di-drop: `sales_calls`/`sales_visits`/`sales_visit_logs` (frontend sudah pindah ke activities), `customers` (sudah pindah ke accounts), kolom `profiles.role` (frontend/EF sudah berhenti baca).
