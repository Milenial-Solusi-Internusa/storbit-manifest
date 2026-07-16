# DATA MODEL — Nexus by MSI

> Referensi database. Sumber kebenaran struktur = **`supabase/schema_snapshot.sql`** (`pg_dump` full). Migrasi formal berhenti 3 Jun 2026 — banyak perubahan via SQL Editor (snapshot bisa lag; lihat §6).
>
> **Diperbarui 2026-07-16:** `sp_items` +2 kolom (`price_category`, `review_status` [SEMENTARA]) — ALTER manual sudah direkam migrasi `20260716000000_…`, ⚠️ **belum masuk snapshot** (TD-72). Sebelumnya **2026-07-10 (audit CRM E2E) — koreksi CRM:** `accounts` (pipeline = tabel ini, tak ada `deals`; `estimated_value`; kolom Lead Pool/aging), mesin status `quotations` (DRAFT→SUBMITTED→SENT), `rate_sheets` RLS bocor, `notification_rules` yatim, trigger `sync_last_activity`; gotcha #10-12 (snapshot stale lagi + data historis CRM + pooler host). Sebelumnya (8 Jul): FASE 0-3 mesin status SP. Hitungan tabel/RPC kanonik: `supabase/schema_snapshot.sql`.

---

## 1. Overview

- **Supabase project ref:** `untmpqceexwxzuhlmyrg`
- **Pooler:** `aws-1-ap-northeast-2.pooler.supabase.com:5432` (region Seoul)
- **Total tabel:** ~60+ tabel business (schema `public`) — bertambah sejak FASE 0 (SP: `sp_orders`, `sp_order_items`, `sp_btb`, `dc_master`). Hitungan persis: `supabase/schema_snapshot.sql`.
- **Fungsi DB:** ~37 RPC/fungsi (mesin status SP menambah ~10-12) · **RLS policy:** ~60 tabel ber-RLS (⚠️ ~48 policy `USING(true)` → isolasi company via filter aplikasi, bukan DB) · **Trigger:** ~42 (mayoritas `set_updated_at` + 7 `trg_z_*`)
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
- **`accounts`** — **master customer tunggal** (pipeline = tabel ini; **TIDAK ada tabel `deals`/`pipeline`**). `account_status` ∈ `prospect`/`customer`/`lost`/`free_agent`/`lead_pool`. Kolom kunci: `name, legal_name, customer_type, source, pipeline_stage, account_status, owner_company_id, company_id, code, tier, assigned_to, created_by, estimated_value` (**nilai deal disimpan di sini, bukan `deal_value`**)`, estimated_closing_date, payment_terms_id, bant_*, won_reason, lost_reason, became_customer_at, converted_at, vat_rate?, stage_changed_at, last_activity_at, is_in_lead_pool, lead_pool_*, pull_*, is_odoo_customer`. **RLS aktif** (`prospects_read/insert/update`): `company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=auth.uid() OR created_by=auth.uid()) OR is_super_admin()`. **Gotcha:** WON → auto-`customer` via trigger `trg_set_customer_on_won` (**terbukti sehat** audit 10 Jul: 33 WON, nol `account_status` bukan 'customer', nol `became_customer_at` NULL); FK constraint masih bernama `prospects_*` (lihat §6). **Status Lead Pool ditandai DUA kolom** — `account_status='lead_pool'` **DAN** `is_in_lead_pool=true` (kini disinkron; dulu desync 8 baris → `08_TECH_DEBT.md` **TD-50**). **`stage_changed_at`** 727/997 = timestamp backfill identik 25 Jun (sejarah pra-25 Jun hilang, **TD-51**). **`last_activity_at`** dulu tak jujur (ditulis sekali saat prospect dibuat) → **kini di-maintain trigger `trg_z_sync_last_activity`** dari `activities` (**TD-52/TD-59**). **`is_odoo_customer`** = nol/997 true (kolom mati, **TD-57**).
- **`inquiries`** — `inquiry_no, prospect_id, customer_id, service_type, route, commodity, status, deleted_at`. FK `inquiries_prospect_id_fkey` / `inquiries_customer_id_fkey` → `accounts`.
- **`quotations`** — `quotation_no, revision, inquiry_id, prospect_id, customer_id, service_type, route, valid_until, quote_date, payment_terms_id, currency_code, usd_rate, vat_rate (DEFAULT 0.011), discount_pct, subtotal, tax_amount, total_amount, status, notes, terms, internal_notes, margin_floor, pricing_done_at, quote_sent_at`. FK → `accounts` (`quotations_prospect_id_fkey`/`_customer_id_fkey`). RLS: read/insert company-scoped; `quotations_update` = owner (`created_by`) ATAU manager ATAU super. **Mesin status:** `DRAFT → SUBMITTED → SENT` (SUBMITTED via "Submit Quotation" `QuotationFormPage.jsx:730,790`, disabled sampai `inquiry_id` terisi; SENT via "Kirim ke Customer" `QuotationDetailPage.jsx:258`). **`ACCEPTED`/`REJECTED`/`EXPIRED` = label display, TANPA transisi UI** → **nol baris ACCEPTED** di DB → trigger `sync_deal_value_on_quotation_accept` tak pernah jalan → 88% deal WON `estimated_value` kosong (`08_TECH_DEBT.md` **TD-54**). Detail alur: `05_WORKFLOW_MAP`.
- **`quotation_items`** — `quotation_id, sort_order, description, qty, unit, unit_price, notes, group_name, currency, unit_label, exchange_rate, total, cost_price`. **Punya policy DELETE** (fix 2.8J — sebelumnya delete-then-insert silent gagal). Save via RPC `save_quotation` (atomik).
- **`activities`** — modul Activity terpadu (gantikan `sales_calls`+`sales_visits`). `type` (call/whatsapp/visit/meeting/email/followup), `status` (todo/done/cancelled), `account_id`/`inquiry_id`/`quotation_id`, `assigned_to`, `scheduled_for`, `details jsonb`, `migrated_from`. RLS niru accounts.
- **`activity_logs`** — audit status activity: `activity_id` (FK CASCADE), `changed_by`, `from_status`, `to_status`, `notes`. RLS via parent activity (EXISTS), bukan `company_id`.
- **`user_login_logs`** — sumber feed "Login" (`user_id, logged_in_at, ip, …`). **Tanpa `company_id`** → RLS sendiri (manager+/super/own). Diisi fungsi `capture_login_session()`.
- **`rate_sheets`** — rate card / pricing sheet dinamis (`columns`/`rows` jsonb, `valid_until`, `note`, `company_id` NOT NULL); soft-delete. Modul Rate List (CRM). ⚠️ **RLS `rate_sheets` TAK filter `company_id`** (policy = `created_by=auth.uid() OR is_manager_or_above()`) → manager entitas lain bisa baca lintas-entitas. Laten (2 baris, keduanya MSI) tapi **WAJIB fix sebelum JCI/SOA input rate** (`08_TECH_DEBT.md` **TD-55**, pola sama TD-47 `vendors`).
- **`deal_handovers`** — form handover deal WON (`handover_type` light/strategic by nilai deal, `status`); gate WON → customer (lihat `05_WORKFLOW_MAP`).
- **`top_requests`** — pengajuan Terms of Payment customer (`status='submitted'`; approval finance downstream). Dari CustomerDetailPage / WON flow.
- **DORMANT:** `sales_calls`, `sales_visits`, `sales_visit_logs` (digantikan activities/activity_logs sejak cutover 2.9D; belum di-drop). `customers` (digantikan `accounts`; pensiun, tak dihapus).

### Foundation / Master Data
- **`companies`** (3 entity; **`aging_enabled boolean NOT NULL DEFAULT false`** — flag per-entitas apakah aging-pipeline memindahkan lead idle ke Lead Pool. Default `false` = aktivasi harus keputusan sadar. Saat ini **MSI=true, JCI=false, SOA=false**. Dibaca EF `aging-pipeline` [service role] untuk `.in('company_id', …)`; lihat `05_WORKFLOW_MAP` §Aging Pipeline. ⚠️ `service_role` diberi GRANT SELECT eksplisit pada `companies` — 46 tabel lain belum, lihat TD-62), **`branches`**, **`departments`** (`code, name, parent_id, company_id`), **`positions`** (`code, name, level [Staff/Supervisor/Manager/Head/Director], department_id`; **UNIQUE(company_id, code)**), **`profiles`** (user; **`active` boolean, TIDAK ada `deleted_at`**; `reports_to` self-FK untuk org chart; `avatar_url`, `notification_preferences jsonb`, `display_preferences jsonb`; legacy `role` kolom deprecated). **`products`**, **`document_types`**, **`payment_terms`**, **`taxes`**, **`status_catalog`**, **`vendors`**, **`warehouses`**.
- **`currencies`** — `code, name, symbol, decimal_places, is_active`. Isi: USD/IDR/EUR/SGD/JPY/MYR. RLS `currencies_read_all` = `USING(true)` (semua authenticated baca).
- **`exchange_rates`**, **`code_counters`** (counter generate code customer), **`document_sequences`** / **`document_numbering`** / **`document_templates`**.
- **Entity settings:** `entity_bank_accounts`, `entity_signatories`, `entity_finance_settings` (Admin Settings).
- **`products`** — **4 tier harga** (FASE 0): `default_price` + **`price_semester`/`price_tahunan`/`price_project`** (nullable). Riwayat perubahan `default_price` → `product_price_history` (trigger `trg_z_products_price_history`); harga kategori di-log manual via RPC `set_product_category_prices` (§5). Lokasi rak per (product × warehouse) → `product_warehouse_location`.
- **`dc_master`** [BARU FASE 0] — master Distribution Center + wilayah (dipakai `sp_orders.dc_id`; `is_active`, soft-delete `deleted_at`).

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

### Procurement
- **`prf`** [BARU FASE 0, 10 Jul 2026] — **Price Request Form** (greenfield). Satu tabel dgn child fields Sea/Air/Inland/Custom/Project sebagai kolom nullable (opsi A; discriminator = `service_type`). **52 kolom.** Sistem: `id`, `company_id`, `prf_no`, `status` (DEFAULT `DRAFT`, CHECK ∈ `DRAFT/SUBMITTED/ACKNOWLEDGED/CANCELLED/QUOTED/EXPIRED`), `created_by` (=Nama Sales), `updated_by`, `submitted_at`, `acknowledged_by/at`, `created_at`, `updated_at`, soft-delete `deleted_at`. Informasi Dasar: `customer_source` (customer/prospect/inquiry), `account_id` (FK `accounts`), `account_name_manual`, `stream`, `deadline_quotation`. Inquiry Details: `direction`, `commodity`, `hs_code`, `msds_available`, `service_type` (DISCRIMINATOR), `incoterms` (single), `commercial_value` numeric(14,2), `commercial_currency`, `origin`, `destination`, `pickup_address`, `delivery_address`, `add_on_services` text[] (**11 opsi** [koreksi Fase 2 — sebelumnya doc keliru catat 6]: custom_clearance, inland, import_license_undername, import_license_pi, export_license, ls, warehouse_umum, warehouse_reefer, tkbm, insurance, others — **5 customs-family** [custom_clearance/import_license_undername/import_license_pi/export_license/ls] disabled saat direction=domestic; sisanya tidak), `add_on_others`, `cargo_ready_date`, `notes`. Child (**Fase 2 [10 Jul 2026] — kolom sudah ada sejak Fase 0 DAN sekarang sudah di-form** di Section 03 "Detail Layanan", dinamis per `service_type`): `sea_freight_type` (FCL/LCL), `sea_container_types` text[] (kode `20`/`40`/`40HC`/`20RF`/`40RF`), `sea_container_qty` jsonb (qty per tipe FCL, mis. `{"20":2,"40HC":1}`), `sea_lcl_gw/dimension/volume/koli`; `air_gw/dimension/volume/koli`; `inland_fleet_types` text[] (25 opsi armada) + `inland_pickup_address/delivery_address` (wajib) + `inland_gw/dimension` (opsional); `custom_doc_type` (AUTO PIB/PEB dari direction — hanya saat service=custom DAN add-on Custom Clearance dicentang); `project_freight_types` text[] + `project_qty`. **UNIQUE(company_id, prf_no)** + 5 FK (company/created_by/updated_by/acknowledged_by/account_id). Trigger `set_prf_updated_at` (reuse `set_updated_at()`). Nomor `prf_no` dirakit di FE: `PRF/{ENTITAS}/{TAHUN}/{ROMAWI}/{URUT}` via `increment_document_sequence` (`p_document_type='PRF'`, `p_department_code='PROC'`, `p_month`, reset per-bulan per-entitas). **RLS single-entity + bypass super_admin** (tiru `hrga_requests`): `prf_insert` (company + `created_by=auth.uid()` + `has_role('sales') OR has_role('gm_bd')`), `prf_select` (company + own OR `has_role('procurement')` OR `is_manager_or_above()`), `prf_update_draft` (own + DRAFT), `prf_update_status` (procurement, saat SUBMITTED). **Keempat policy dibungkus `is_super_admin() OR (…)`** sesuai jenisnya (insert=WITH CHECK saja, select=USING saja, update=USING & WITH CHECK) → super_admin bypass company scope (standar, konsisten semua modul; berarti super_admin LIHAT PRF lintas-3-entitas). **Cabang `is_super_admin` ditambahkan setelah Fase 0** (Fase 0 keliru tanpa cabang ini → super_admin ditolak saat INSERT); direkam `supabase/migrations/20260710000003_prf_rls_super_admin.sql` (verified pg_policies count=4). Yang **masih ditunda ke Fase 3b** = cross-entity inbox untuk role `procurement` (butuh cabang RLS custom) — BUKAN super_admin. Rekaman Fase 0: `supabase/migrations/20260710000001_prf_fase0.sql`. Kolom `inquiry_id uuid` + FK `→ inquiries(id)` DITAMBAH manual oleh Den setelah Fase 0 (dipakai FE saat `customer_source='inquiry'`) — direkam di `supabase/migrations/20260710000002_prf_add_inquiry_id.sql`. Fase 1 (form Section 01/02 + menu + nomor auto) = KODE only (`PRFFormPage.jsx`). **Fase 2 (10 Jul 2026)** = KODE only (same file) — Section 03 Detail Layanan (child fields dinamis per `service_type`) + koreksi daftar add-on (6→11); **tanpa ubah DB** (kolom child sudah ada sejak Fase 0). Trigger Inland penuh bila `service_type='inland'` ATAU add-on `inland` dicentang.
- **`vendors`** — master vendor (Foundation; PR/PO belum dibangun).

### Asset Management
- `assets` (+ kolom SQL-Editor: `condition`, `department_id` FK, `brand`, `assignment_status`), `asset_categories`, `asset_locations` (`branch_id` NOT NULL), `asset_specifications`, `asset_network`, `asset_software_licenses`, `asset_maintenance_records`, `asset_fuel_logs`. **Belum ada:** `asset_documents`, `asset_work_orders`, `asset_routes` (UI placeholder).

### Inventory & Logistics (Storbit SP + fulfillment)

**Skema SP baru (FASE 0-3, LIVE) — identitas komposit `(customer_id, sp_no)`:**
- **`sp_orders`** [BARU] — **header SP** (satu baris per SP). Kolom kunci: `company_id`, `customer_id`, `sp_no`, `sp_date`, `dc_id` (FK `dc_master`, NOT NULL), **`status`** (12-tahap, CHECK — lihat Mesin Status di bawah), `is_disputed`/`dispute_reason`/`disputed_at`/`disputed_by` (overlay dispute), `expired_date`, `sp_category`, `external_url`, `notes`, `confirmed_at/by`, `cancelled_at/by`, `cancel_reason`, **`had_cancelled_picking`** (flag permanen bila picking pernah dibatalkan), `created_by`, soft-delete `deleted_at`. **UNIQUE(customer_id, sp_no)** (nomor SP milik customer; boleh sama antar-customer). RLS company- + role-scoped (`operations`/manager+/`is_super_admin`).
- **`sp_order_items`** [BARU] — **item kanonik** per SP. `sp_order_id` (FK), `company_id`, `product_id`, `product_name`, `sku`, `qty`, `shipped_qty` (CHECK `shipped_qty <= qty`), `unit_price` (snapshot), `price_category` (CHECK null/semester/tahunan/project), **`legacy_sp_item_id`** (map 1:1 ke `sp_items.id`, dipakai audit/bridge — JANGAN drop). ⚠️ **`shipped_qty` kanonik belum di-sync** dari dispatch (2D pending) — dispatch saat ini menulis `sp_items.shipped_qty`, bukan yang ini.
- **`sp_btb`** [BARU] — **BTB (Bukti Terima Barang) entitas benar**, qty-only tanpa nilai pajak. `company_id`, `sp_order_id` (FK NOT NULL), `delivery_note_id` (FK nullable — BTB per batch bila dipetakan), `customer_id`, `btb_no`, `btb_date`, `qty` (nullable, CHECK `>= 0`), `received_at/by`, `remarks`, soft-delete `deleted_at`. **Partial UNIQUE `(customer_id, btb_no) WHERE deleted_at IS NULL`** (FASE 3 — re-issue nomor pasca soft-delete tak bentrok). RLS company/role-scoped.

**Rantai fulfillment (picking → surat jalan):**
- **`picking_lists`** / **`picking_list_items`** / **`picking_list_materials`** — manifest picking gudang (status `pending/in_progress/done/cancelled`; bawa `sp_no`+`customer_id`+`sp_order_id`). Reservasi stok via `stock_ledger`.
- **`delivery_notes`** / **`delivery_note_items`** — Surat Jalan (`do_no`, `sp_no`, `picking_list_id`, `customer_id`, `sp_order_id`, status `draft/in_transit/delivered/cancelled`).

**LEGACY (koeksis, belum di-drop):**
- **`sp_items`** — item SP generasi lama; **MASIH DIBACA** reader fulfillment (list/detail, `shipped_qty`). Create SP = **dual-write** (`create_sp_order_dual` tulis `sp_items` LAMA **dan** `sp_orders`/`sp_order_items` baru). FK `sp_items_customer_id_fkey` → `accounts`. RLS ⚠️ `USING(true)`. **+2 kolom BARU** [ALTER dijalankan manual di produksi 2026-07-16; ✅ **sudah direkam migrasi** → `supabase/migrations/20260716000000_sp_items_price_category_review_status.sql`; ⚠️ **KEDUANYA belum di `schema_snapshot.sql`** — snapshot stale, butuh refresh `pg_dump` manual, lihat TD-72] untuk rencana "Kunci Harga Edit Item SP" (§Task H7 / `10_TASK_BREAKDOWN.md`):
  - **`price_category`** — kategori harga SP. ⚠️ **Domain nilai belum baku** — dipakai `default`/`semester`/`legacy` (mengikuti kategori Master Product + penanda SP lama), **BEDA** dari CHECK `sp_order_items.price_category` (`semester/tahunan/project` saja). Perbedaan domain ini **perlu dikonfirmasi user** (belum ada CHECK constraint di `sp_items.price_category`). ⚠️ **Backfill belum jalan** — kolom masih kosong untuk SP lama.
  - **`review_status`** — penanda **SEMENTARA** rekonsiliasi SP lama (**bisa DI-DROP setelah rekonsiliasi selesai**): `review_default` = `unit_price` cocok `products.default_price` · `perlu_review` = beda → cek kontrak/PKS manual. Sudah ter-label penuh: **587 `perlu_review` + 140 `review_default` = 727 baris (0 NULL)**. **`unit_price` TIDAK diubah** (harga SP = snapshot).
- **`sp_btbs`** — BTB legacy (hanya `sp_no`+`btb_no`, buta identitas); **0 penulis FE** sejak FASE 3 (helper `db.js` tinggal definisi). Data delta sudah dimigrasi ke `sp_btb`; **tinggal di-drop**. RLS ⚠️ `USING(true)`.
- **`ar_ttfs`** (FK `ar_ttfs_customer_id_fkey` → `accounts`), **`ar_btbs`** — AR Tracker (TTF + baris BTB finance) — **domain terpisah** dari `sp_btb` (BTB Storbit).
- **`stock_ledger`** (append-only: `reserved`/`unreserved`/`outbound`/`inbound`/`adjustment`), view **`stock_summary`** (on_hand/reserved/available per product × warehouse × company), **`products`**, **`warehouses`**, `product_warehouse_location`.

**Mesin Status SP (12 tahap — LIVE s/d BTB_TERBIT):**

Kolom `sp_orders.status`, **fact-derived** (di-maintain otomatis oleh event, bukan diketik) via fungsi **`sp_recompute_status(customer_id, sp_no)`** (§5). Progresi:

`DRAFT → CONFIRMED → MENUNGGU_STOK → PICKING → PACKED → DIKIRIM → SAMPAI → TERKIRIM_PENUH → BTB_TERBIT → INVOICED → SUBMITTED → LUNAS` (+ terminal **`CANCELLED`**).

- **Live sekarang:** DRAFT s/d **BTB_TERBIT**. **INVOICED/SUBMITTED/LUNAS belum dibangun** (FASE 4-5 — butuh modul invoice/payment).
- **KEPUTUSAN BISNIS:** **BTB_TERBIT = rank TERTINGGI di band terkelola** (di ATAS TERKIRIM_PENUH) — *"puncak sebelum invoice"*, karena invoice ditagih atas BTB bertandatangan customer (Indomarco). Di recompute, cabang `v_has_btb` dicek **paling atas** (mengalahkan TERKIRIM_PENUH). ⚠️ *Array literal di CHECK constraint masih mengurut `…SAMPAI, BTB_TERBIT, TERKIRIM_PENUH…` — inkonsistensi kosmetik; yang menentukan status tampil = urutan CASE recompute, BUKAN urutan array. (`DESIGN_SP_SCHEMA.md` juga masih memuat urutan lama — perlu update terpisah.)*
- **CASE recompute (prioritas tertinggi → terendah):** `v_has_btb` → **BTB_TERBIT** · `Σshipped ≥ Σqty` (item confirmed) → TERKIRIM_PENUH · DN delivered → SAMPAI · DN in_transit/delivered → DIKIRIM · picking done → PACKED · picking active → PICKING · confirmed + stok kurang → MENUNGGU_STOK · confirmed → CONFIRMED · else DRAFT.
- **Guard (recompute early-return, tak menyentuh):** `status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS')`. **BTB_TERBIT TIDAK di-freeze** (bisa naik/turun mengikuti fakta BTB).
- **Recompute dipanggil (`PERFORM`)** dari RPC confirm/picking/delivery/BTB (lihat §5). `stock_summary.available` company-wide dipakai untuk MENUNGGU_STOK.
- **UI:** headline badge Detail SP + pill/tabs/filter list baca `sp_orders.status` (pasca-2E). Tombol Konfirmasi/Tolak hanya `DRAFT`; Generate Picking hanya `CONFIRMED`/`MENUNGGU_STOK`.

### Notifications
- **`notifications`** — notif in-app (bell). `event_type`, `title`, `body`, `reference_type`/`reference_id`, `is_read`, `user_id`, `company_id`. Ditulis langsung oleh kode (mis. EF aging-pipeline `event_type='crm.lead_idle'`, Lead Pool pull `event_type='lead_pool_pull_result'`).
- **`notification_rules`** — ⚠️ **YATIM (tak dibaca kode).** 11 rule semua `is_active=true` + `company_id=MSI`, seed 2026-06-14; **tak ada consumer** (8 notif nyata ditulis tanpa lewat rules). Bangun mesin pembaca atau buang (`08_TECH_DEBT.md` **TD-53**).

### Reporting / Governance (MOM)
- **`meeting_moms`** — header Minutes of Meeting (`mom_no`, `mom_type` weekly/project/probation/board/departmental/adhoc, `status` draft/submitted/approved/rejected). Approval CEO/admin.
- Child: **`mom_action_plans`** (action item: owner/due/priority), **`mom_issues`** (isu), **`mom_progress_updates`** (progress action plan), **`mom_improvements`** (usulan perbaikan). Semua RLS company-scoped.

---

## 4. RLS Patterns (fungsi)

| Fungsi | Role yang di-cover | Catatan |
|--------|--------------------|---------|
| `is_super_admin()` | `super_admin` (via `user_roles`) | Top-level bypass. JANGAN nest di dalam filter company. |
| `get_user_company_id()` | — | `SELECT company_id FROM profiles WHERE id=auth.uid()`. Null sebelum backfill / di SQL Editor. |
| `is_admin_or_above()` | `super_admin`, `admin` **saja** | ⚠️ TIDAK termasuk manager/ceo — dipakai ~51 policy; sumber banyak bug akses (lihat tech debt). |
| `is_manager_or_above()` | super_admin, admin, ceo, gm, gm_bd, manager, supervisor | Dipakai RLS accounts/activities. (Verified `schema_snapshot.sql` fungsi `is_manager_or_above`, `code IN (…)` — TIDAK ada `sales_head`.) |
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
| **SP — mesin status & fulfillment (FASE 1-3)** | | *(semua SECURITY DEFINER; recompute REVOKE dari PUBLIC — internal via PERFORM)* |
| `sp_recompute_status` | `(p_customer_id uuid, p_sp_no text)` | Recompute `sp_orders.status` fact-derived (BTB_TERBIT rank tertinggi). Guard `CANCELLED/INVOICED/SUBMITTED/LUNAS`. |
| `set_sp_status` | `(p_sp_no text, p_status text, p_reason text, p_customer_id uuid)` → int | Set `sp_items.sp_status` (draft/confirmed/cancelled) per (sp_no,customer_id) + stamp; confirm → recompute, cancel → CANCELLED. |
| `delete_sp_dual` ⚠️ *(belum live — dijalankan user manual)* | `(p_customer_id uuid, p_sp_no text)` | **Hapus SELURUH SP dual-table** per (customer_id, sp_no): `DELETE sp_orders` (`sp_order_items` ikut via FK ON DELETE CASCADE) + `DELETE sp_items`. Guard **`is_super_admin()`** + status **DRAFT strict** (`IF v_status IS DISTINCT FROM 'DRAFT' THEN RAISE` — blokir non-DRAFT & row kanonik tak ada). SECURITY DEFINER (bypass `sp_orders_delete` super-only RLS, guard tetap di dalam). ⚠️ **Belum ada file migrasi** & belum di `schema_snapshot.sql`. |
| `create_sp_order_dual` | `(p_company_id, p_customer_id, p_sp_no, p_sp_date, p_dc_id, p_status, p_expired_date, p_notes, p_items jsonb)` → uuid | Dual-write header+item ke `sp_orders`+`sp_order_items`; RAISE `unique_violation` bila `(customer_id,sp_no)` dobel. |
| `generate_picking_from_sp` | `(p_sp_no text, p_customer_id uuid, p_warehouse_id uuid=NULL)` → `TABLE(picking_list_id, picking_no)` | Buat picking dari SP confirmed + reserve stok → recompute PICKING. |
| `complete_picking` | `(p_picking_list_id uuid)` | Picking → done → recompute PACKED. |
| `cancel_picking` | `(p_picking_list_id uuid)` | Picking → cancelled, release reservasi, set `had_cancelled_picking` → recompute mundur. |
| `generate_delivery_from_picking` | `(p_picking_list_id uuid)` → `TABLE(delivery_note_id, do_no)` | Buat Surat Jalan dari picking done. |
| `dispatch_delivery` | `(p_delivery_note_id uuid)` | DN → in_transit; ledger unreserve+outbound; **+`sp_items.shipped_qty` (FASE 2A)** → recompute DIKIRIM/TERKIRIM_PENUH. |
| `mark_delivery_delivered` | `(p_delivery_note_id uuid)` | DN → delivered → recompute SAMPAI. |
| `cancel_delivery` | `(p_delivery_note_id uuid)` | DN → cancelled; reverse outbound + reverse `shipped_qty` → recompute mundur. |
| `sp_issue_btb` | `(p_customer_id, p_sp_no, p_btb_no, p_qty=NULL, p_btb_date=NULL, p_delivery_note_id=NULL, p_remarks=NULL)` → uuid | Terbitkan BTB ke `sp_btb` (idempoten per btb_no hidup) + recompute → **BTB_TERBIT**. |
| `sp_delete_btb` | `(p_btb_id uuid)` | Soft-delete `sp_btb` + recompute (mundur). |
| `set_product_category_prices` | `(p_product_id, p_semester, p_tahunan, p_project)` | Set harga kategori produk + log `product_price_history`; authz super ATAU admin-same-company (terima NULL utk clear). |
| `bulk_update_product_prices` | `(p_rows jsonb)` → `{updated, skipped}` | Update harga produk massal (super_admin only). |
| `indomarco_dashboard_stats` | `(p_customer_id uuid)` → jsonb | Agregasi KPI Dashboard Indomarco di DB (dipakai `IndomarcoDashboardPage.jsx` via `supabase.rpc`). Return `{total_sp:int (COUNT DISTINCT sp_no), total_ordered:int (SUM qty), total_realized:int (SUM shipped_qty), dc_count:int (COUNT DISTINCT dc trimmed), period_min/period_max:"YYYY-MM-DD", dc_volumes:[{dc,volume}] (1/DC, tak terurut), monthly:[{ym:"YYYY-MM", sp_count}] (1/bulan ada)}` atas `sp_items` per `customer_id`. Menggantikan agregasi client-side yang dulu ber-`.limit(1000)` (understate diam-diam bila baris >1000). ✅ **Sudah termuat di `schema_snapshot.sql`** (baris 811, refresh commit `6c68642`) + direkam migrasi `20260711000000_indomarco_dashboard_stats.sql` (commit `1a22d98`). |
| `storbit_sp_customers` | `()` → jsonb (tanpa argumen) | Daftar customer selector Dashboard Indomarco/Storbit (dipakai dropdown `IndomarcoDashboardPage.jsx` via `supabase.rpc`). Return jsonb array `[{customer_id:uuid, name:text}]` — DISTINCT customer yang punya SP, difilter company **SOA** (`d2e5e565-…`), urut alfabet by name. Sumber: `sp_items` join `accounts`. Menggantikan 2 query FE (scan `sp_items.select("customer_id").limit(5000)` + dedup `Set`, lalu resolve nama via `accounts.in(ids)`) — hilangkan tarik ribuan baris hanya utk daftar customer unik + `.limit(5000)` rapuh (cap default PostgREST 1000). ⚠️ **BELUM termuat di `schema_snapshot.sql`** (dibuat manual di DB, snapshot belum di-refresh) + **belum direkam migrasi** (`supabase/migrations/`). Lihat gotcha #10 (snapshot lag). |
| `add_picking_material` | `(p_picking_list_id, p_product_id, p_qty)` → uuid | Tambah baris material packing ke picking + post `stock_ledger` outbound (atomik). |
| `delete_picking_material` | `(p_material_id)` | Hapus baris material packing + reverse `stock_ledger` (inbound `material_reverse`). |
| `attach_price_contract_info` | `(p_history_id, p_contract_no, p_valid_from, p_valid_until)` | Lampirkan info kontrak/PKS ke baris `product_price_history` (audit harga). |
| `increment_document_sequence` | `(p_company_id, p_document_type, p_department_code, p_year, p_month=0)` | Generate nomor dokumen sekuensial atomik (SECURITY DEFINER). |
| `is_super_admin` / `get_user_company_id` / `is_admin_or_above` / `is_manager_or_above` / `has_permission` / `has_role` / `get_user_role_code` | — | Helper RLS (lihat §4). Bisa dipanggil `supabase.rpc(...)` dari frontend (mis. gating super-admin). |
| `get_table_columns` | `(p_table text)` | Introspeksi kolom (dipakai Schema Manager + custom fields). |
| `exec_sql` | `(sql text)` | Eksekusi SQL arbitrer (Edge Function `manage-schema`; service-role only). |
| `int_to_roman` | `(num integer)` | Helper (code customer pakai angka romawi). |
| **Trigger fns** | — | `generate_customer_code()`, `set_customer_on_won()`, `track_stage_change()` (log pipeline stage → `activity_logs`; trigger `trg_z_track_stage_change`), `handle_new_user()`, `set_updated_at()`, `capture_login_session()`, `sync_deal_value_on_quotation_accept()` (quotation ACCEPTED → `accounts.estimated_value` — ⚠️ **tak pernah jalan**, nol baris ACCEPTED, **TD-54**), `sync_last_activity()` [BARU 10 Jul, trigger `trg_z_sync_last_activity` di `activities` AFTER INSERT/UPDATE/DELETE → `accounts.last_activity_at = max(COALESCE(completed_at, created_at))`; **TD-52/TD-59**], `sync_profile_email()` (sinkron `profiles.email` ← `auth.users`), `log_product_price_change()` (AFTER UPDATE `products.default_price` → `product_price_history`). |

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
9. **Dua generasi SP (transisi FASE 0-3):** create SP = **dual-write** (`sp_items` lama + `sp_orders`/`sp_order_items` baru via `create_sp_order_dual`). Reader fulfillment (list/detail, `shipped_qty`) **masih baca `sp_items`**; **headline status baca `sp_orders.status`** (mesin 12-tahap). `sp_btbs` legacy sudah 0-penulis FE (bermigrasi ke `sp_btb`, tinggal drop). `sp_order_items.shipped_qty` kanonik **belum di-sync** dari dispatch (2D pending). ⚠️ **RLS `sp_items`/`sp_btbs`/picking/delivery = `USING(true)`** → isolasi company bergantung filter aplikasi (lihat `08_TECH_DEBT.md` **TD-39**, ~48 policy permisif + daftar tabel).
10. **Snapshot di-refresh 10 Jul 2026** (`pg_dump`, commit `67c600d` di branch `feat/aging-pipeline`) — **sudah memuat** perubahan terbaru: tabel `prf` + kolom `inquiry_id`, RPC `delete_sp_dual`, fungsi `sync_last_activity_on_account()` + trigger `trg_z_sync_last_activity` (activities), serta FASE 0-3 SP. ✅ **Snapshot SEGAR** untuk perubahan CRM/aging 10 Jul. (Verifikasi: `grep sync_last_activity supabase/schema_snapshot.sql` → ditemukan.) ⚠️ Snapshot ini hidup di branch `feat/aging-pipeline` yang **belum merge ke `main`**. **Update 11 Jul:** snapshot **sudah di-refresh** (`pg_dump`, commit `6c68642`) sehingga RPC baru `indomarco_dashboard_stats` (dipakai Dashboard Indomarco) **sudah termuat** (baris 811); migrasi direkam `20260711000000_indomarco_dashboard_stats.sql` (commit `1a22d98`). ✅ Snapshot SEGAR untuk RPC ini. **Update 12 Jul:** RPC baru **`storbit_sp_customers`** (dropdown selector Dashboard Indomarco/Storbit) dibuat manual di DB — **STALE lagi**: belum termuat di snapshot + belum ada file migrasi. Refresh `pg_dump` + rekam migrasi (pola `20260711000000_…`).
11. **Data historis CRM tak lengkap (audit 10 Jul):** `stage_changed_at` 727/997 = backfill 25 Jun (sejarah stage pra-25 Jun hilang, `audit_logs` nol perubahan pipeline_stage — **TD-51**); `last_activity_at` dulu ditulis sekali saat prospect dibuat (817 akun punya tanggal tapi nol `activities` — **TD-52**, kini di-NULL-kan + di-maintain trigger). Aging-pipeline mengandalkan `MAX(stage_changed_at, last_activity_at)` untuk mengurangi dampak backfill.
12. **Pooler host `pg_dump` yang BENAR = `aws-1-ap-northeast-2.pooler.supabase.com`** (region Seoul). Catatan lama yang menulis `ap-southeast-1` **SALAH** (gagal koneksi saat backup). Supabase project ref TIDAK berubah (`untmpqceexwxzuhlmyrg`) meski project dipindah ke org MSI.
