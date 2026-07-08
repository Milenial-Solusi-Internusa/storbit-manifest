# ROLE PERMISSION MATRIX — Nexus by MSI

> Matrix RBAC. Sumber: `CLAUDE.md` (Roles & Permission Structure, kini di `docs/00_DEV_JOURNEY.md`), `docs/03_DATA_MODEL.md` (RLS), `docs/08_TECH_DEBT.md` (gaps). ⚠️ RLS DB belum sepenuhnya sinkron dengan matrix UI — lihat §5.

---

## 1. Daftar Role

14 **ERP role** (sumber: tabel `roles`, di-assign via `user_roles`). Struktur sama di 3 entitas kecuali `gm_bd` (baru — MSI single-entity; lihat catatan).

| Code | Nama | Level | Deskripsi |
|------|------|-------|-----------|
| `super_admin` | Super Admin | System | IT/Developer; full akses lintas-entitas (bypass RLS via `is_super_admin()`). |
| `admin` | Admin | System | Master Data admin (per-entitas). |
| `ceo` | CEO / Executive | 1 | Full view + final approve. |
| `gm` | GM / Senior GM | 2 | GM SCM (Supply Chain). Approve + report. |
| `gm_bd` | GM Business Development | 2 | GM BD; setara/dekat `gm` di hierarki, fokus commercial/CRM. Full CRM + akses reporting (incl. Riwayat Visit) + approve MOM. **TIDAK** dapat akses gudang/finance (by design). |
| `manager` | Manager | 4 | Kelola departemen + approve. |
| `finance_controller` | Finance Controller | 4 | Full akses finance. |
| `finance` | Finance Staff | 7 | Finance Jr. Manager + Staff. |
| `operations` | Operations | 7 | Logistic, Console, Warehouse. |
| `sales` | Sales / BD | 7 | BD, Sales Forwarding, Account Exec, Digital. |
| `procurement` | Procurement | 7 | Direct + Indirect Procurement. |
| `hrga` | HRGA | 7 | HRGA, Personnel, People Dev, GA. |
| `it` | IT Staff | 7 | IT Developer + Helpdesk. |
| `supervisor` | Supervisor | 6 | Supervisor lintas-dept. |
| `viewer` | Viewer | — | Read-only semua modul. |

**Catatan role lain:**
- `gm_bd` — role baru (Paket 1, 9 Jul 2026). Dieksekusi di DB MSI (tabel `roles` + permission + fungsi `is_manager_or_above()` sudah +`gm_bd`, dijalankan user manual). Single-entity MSI; RLS lintas-3-entitas = Paket 2 (belum). Prioritas frontend: disisipkan di `ERP_ROLE_PRIORITY` setelah `gm`, sebelum `manager` (`AuthContext.jsx:11`).
- `sales_head` — muncul di fungsi RLS `is_manager_or_above()` tapi tidak ada di daftar role aktif standar. [TODO: konfirmasi apakah `sales_head` masih dipakai sebagai role aktif atau sisa migrasi].
- `operator` — adalah **position level** (Operator: driver/OB), **bukan** role RBAC.
- Legacy enum `profiles.role` (`super`/`logistic`/`management`) — **deprecated**, frontend & Edge Functions tak baca lagi (lihat TECH_DEBT TD-20).

---

## 2. Hierarki Role

```
super_admin            (System — bypass RLS lintas-entitas)
   └─ admin            (System — master data per-entitas)
        └─ ceo         (Lvl 1 — full view + final approve)
             └─ gm / gm_bd   (Lvl 2 — gm=SCM, gm_bd=BD; approve + report)
                  └─ manager / finance_controller   (Lvl 4)
                       └─ supervisor                (Lvl 6)
                            └─ sales / finance / operations / procurement / hrga / it   (Lvl 7)
                                 └─ viewer          (read-only)
```

**Cakupan akses data (RLS):**
- `super_admin` → **lintas entitas** (semua company).
- `admin` & lainnya → **single entity** (`company_id` sendiri). ⚠️ Frontend `isAllEntities=['super_admin']` saja (admin = single-entity, selaras RLS).
- `sales`/`operations` → hanya row miliknya (`assigned_to`/`created_by`).
- `manager` ke atas (`is_manager_or_above`) → seluruh entitasnya.

---

## 3. Permission Matrix per Modul

Sumber: matrix permission `CLAUDE.md`. **CRUD** = full, **R** = read-only, **-** = no access.

> **`gm_bd`** (kolom belum ditambahkan ke tabel di bawah): aksesnya kira-kira setara `gm` untuk **CRM (CRUD)** + **Reporting (R)**, TAPI **TIDAK** dapat Logistics/Finance/Assets/HRGA (by design — fokus BD). Peta visibilitas menu presisi untuk `gm_bd` ada di tabel "Menu → Halaman → Role-gate" di bawah.

| Module | super_admin | ceo | gm | manager | finance_controller | finance | operations | sales | procurement | hrga | it | viewer |
|--------|:-----------:|:---:|:--:|:-------:|:------------------:|:-------:|:----------:|:-----:|:-----------:|:----:|:--:|:------:|
| Master Data | CRUD | R | R | R | R | R | R | R | R | R | CRUD | - |
| CRM | CRUD | R | CRUD | CRUD | R | R | R | CRUD | R | - | R | R |
| Logistics | CRUD | R | CRUD | CRUD | R | R | CRUD | R | R | - | R | R |
| Finance | CRUD | R | R | R | CRUD | CRUD | R | R | R | - | R | R |
| HRGA | CRUD | R | R | CRUD | R | R | - | - | - | CRUD | R | R |
| Assets | CRUD | R | R | R | R | R | R | R | CRUD | R | CRUD | R |
| Admin | CRUD | - | - | - | - | - | - | - | - | - | CRUD | - |

### Peta Menu → Halaman → Role-gate (visibilitas)

> **Beda dari matriks granular di bawah:** ini peta **visibilitas** (menu → halaman + siapa boleh lihat), dari `ERP_MENU_GROUPS`/`NEXUS_NAV` + `canSeeMenuItem` (**default-deny**) di `App.jsx`. Jenis gate: `public` · `menuKey` (via `hasMenuPermission`) · `module` (via `hasPermission`) · `role[...]` (array). **📋 soon** = `PLANNED_MODULES` → ComingSoonPage. *(Sumber terkini: `App.jsx` `ERP_MENU_GROUPS`/`NEXUS_NAV`.)*

| Grup | Menu / Halaman | Komponen | Role-gate | Status |
|---|---|---|---|---|
| CORE | Command Center · Home | Dashboard · HomeDashboard | public | LIVE |
| CRM | CRM Dashboard | CRMDashboardPage | menuKey `crm_dashboard` | LIVE |
| CRM | Pipeline / Leads | PipelineKanbanPage | menuKey | LIVE |
| CRM | Lead Pool | LeadPoolPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor,sales] | LIVE |
| CRM | Approval Lead Pool | LeadPoolApprovalPage | role[ceo,gm,gm_bd,manager,supervisor,admin,super_admin] | LIVE (**ceo/gm/gm_bd ditambah 9 Jul — sebelumnya CEO kelewat**) |
| CRM | Prospects | ProspectListPage/FormPage | module `crm` + role[…,ceo,gm,…] (gm_bd via crm module) | LIVE |
| CRM | Inquiry | InquiryListPage/FormPage/DealDetailPage | via crm | LIVE |
| CRM | Quotation | QuotationList/Detail/FormPage | via crm | LIVE |
| CRM | Rate List | RateListPage | role[super_admin,admin,ceo,gm,gm_bd,manager,sales] | LIVE |
| CRM | Master Customer (MSI/JCI/SOA/Free) + Detail | CustomerListPage · CustomerDetailPage | menuKey `crm_customers` | LIVE |
| CRM | Activities · Activity Log | ActivitiesPage · ActivityLogPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor,sales] | LIVE |
| LOGISTICS | Sales Order / SP (list + detail) | SalesOrderPage · SalesOrderDetailPage | menuKey `logistics_sp` | LIVE |
| LOGISTICS | Input SP | InputSPPage | module `logistics` + **canInputSP** (permission AND operational role) | LIVE |
| LOGISTICS | Picking List (+Detail) | PickingListPage · DetailPage | role[…,operations] | LIVE |
| LOGISTICS | Surat Jalan (+Detail) | DeliveryNotePage · DetailPage | role[…,operations] | LIVE |
| LOGISTICS | Shipment Mgmt | ShipmentPage (inline) | module `logistics` + role | LIVE |
| LOGISTICS | General Trading · Job · Freight · Customs(PPJK) | ComingSoon | — | 📋 soon |
| INVENTORY | Dashboard · Stok Barang · Penerimaan | InventoryDashboard · StokBarang · PenerimaanBarangPage | via inventory | LIVE |
| INVENTORY | Pengeluaran · Transfer · Opname | — | — | 📋 menu ada, tanpa render block |
| FINANCE | AR/Collection · Outstanding · Finance Docs | ARTracker · Outstanding · FinancePage (inline) | module `finance` + role | LIVE |
| FINANCE | Job Costing · Billing · AP · Cash/Bank · Accounting | ComingSoon | — | 📋 soon |
| SERVICE | HRGA Request | HrgaShell (My/Buat/Semua[role]/Pending Approval[role]/Arsip) | mixed per sub-page | LIVE |
| SERVICE | Asset Management | AssetShell (16 sub-objek) | inherit | LIVE |
| SERVICE | IT Service Mgmt | ComingSoon | — | 📋 soon |
| REPORTING | Sales Report | CRMReportPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor] | LIVE |
| REPORTING | Riwayat Visit | RiwayatVisitPage | role[super_admin,ceo,gm_bd] | LIVE (**gm_bd ditambah 9 Jul; gm SENGAJA tidak**) |
| REPORTING | Indomarco Dashboard | IndomarcoDashboardPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor] (manager-or-above) | LIVE |
| REPORTING | MOM (menu) | MOMListPage/FormPage/DetailPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor,sales,operations] | LIVE |
| REPORTING | MOM — lihat semua (SEE_ALL) | MOMListPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor] | LIVE |
| REPORTING | MOM — approve (APPROVER) | MOMDetailPage | role[ceo,gm_bd,admin,super_admin] | LIVE (**gm_bd ditambah 9 Jul; gm SENGAJA tidak**) |
| REPORTING | Reports · Performance · Audit | ComingSoon | — | 📋 soon |
| FOUNDATION | Master Data | AdminShell | module `foundation` + role[super_admin,admin,it] | LIVE |
| FOUNDATION | Products & Services (+Detail) | ProductsPage · ProductDetailPage | canRenderPage | LIVE |
| FOUNDATION | Update Harga Massal | BulkEditPricePage | role[super_admin] | LIVE |
| FOUNDATION | Schema Manager | SchemaManagerPage | **super_admin only** (enforced at render) | LIVE |
| FOUNDATION | Admin Settings (hub + 9 sub-page) | AdminSettingsHub + admin-settings-* | canAdminSettings (super/admin) | LIVE |

### Matrix granular per action (VIEW/CREATE/EDIT/DELETE/APPROVE/EXPORT/PRINT)

Model granular sebenarnya disimpan di DB: **`modules` → `module_menus` → `module_actions` / `menu_actions` → `user_menu_permissions`** (per-user-per-menu-action), diakses frontend via `hasMenuPermission(menuKey, action)`. Juga ada `permissions` + `role_permissions` (per-role) via `hasPermission(module, action)`.

> [TODO: isi tabel granular VIEW/CREATE/EDIT/DELETE/APPROVE/EXPORT/PRINT per menu — **tidak tersedia di `schema_snapshot.sql`** karena snapshot `--schema-only` (tanpa data). Perlu query langsung: `SELECT m.key, ma.code FROM module_menus m JOIN menu_actions ... ` atau export data RBAC tables. Action set yang ada di kode: `view`, `create`/`add`, `edit`, `delete`, `approve`, `export`, `print` — verifikasi via `module_actions`/`menu_actions`.]

---

## 4. RLS Functions

| Fungsi | Siapa yang masuk (true) | Efek |
|--------|-------------------------|------|
| `is_super_admin()` | `super_admin` (via `user_roles`, is_active, not revoked) | Bypass semua filter company → akses lintas-entitas. **Wajib top-level `OR`**, jangan nest di filter `company_id`. |
| `is_admin_or_above()` | **`super_admin`, `admin` SAJA** | ⚠️ TIDAK termasuk manager/ceo/gm — dipakai ~51 policy. Sumber bug akses (CEO ke-block, dropdown sales kosong utk manager). |
| `is_manager_or_above()` | super_admin, admin, ceo, gm, **gm_bd**, manager, sales_head | Cakupan "lihat seluruh tim/entitas" (RLS accounts/activities). `gm_bd` ditambah 9 Jul 2026 (dieksekusi user di DB MSI). |
| `get_user_company_id()` | — | `SELECT company_id FROM profiles WHERE id=auth.uid()`. Null sebelum backfill / di SQL Editor. |
| `has_permission(module, action)` | query `user_roles→roles→role_permissions→permissions` | ⚠️ Flagged broken/unseeded (TECH_DEBT TD-02). |
| `has_role(role_code)` / `get_user_role_code()` | cek role di `user_roles` | Helper. |

**Pola RLS accounts (acuan utama):**
`USING ((company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=auth.uid() OR created_by=auth.uid())) OR is_super_admin())`.

Catatan: `profiles_read = USING(true)` (stopgap — semua authenticated baca profiles; TD-04).

---

## 5. Known Gaps

1. **TIGA sumber kebenaran permission yang tidak sinkron** (TECH_DEBT TD-06):
   - **RLS DB** — pakai role hardcode (`is_admin_or_above()` ~51 policy, `is_manager_or_above()`).
   - **`hasPermission(module, action)`** — frontend, baca `role_permissions`/`permissions`.
   - **`hasMenuPermission(menuKey, action)`** — frontend, baca `user_menu_permissions` (granular per-user).
   → UI bisa mengizinkan aksi yang RLS tolak (atau sebaliknya). Konsolidasi = bagian migrasi RLS RBAC-driven (TD-01).
2. **`is_admin_or_above()` tak kenal manager/ceo** → memicu stopgap (`profiles_read USING(true)`, dropdown sales kosong utk manager sudah di-fix di frontend tapi RLS tetap perlu dibenahi).
3. **`has_permission()` broken/unseeded** (TD-02) — tabel `permissions`/`role_permissions` ada di snapshot tapi status seed belum dikonfirmasi.
4. **Audit CRUD/DELETE policy belum lengkap** (TD-03) — hanya ~4 dari ~50 tabel punya DELETE policy; UPDATE "admin-only" pernah nyangkut owner-edit.
5. **Migrasi RLS proper (RBAC-driven, 4-fase)** — BESAR, risiko tinggi, eksekusi sesi fresh, prasyarat HRIS (TD-01).
