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
- `gm_bd` — role baru (Paket 1, 9 Jul 2026). Dieksekusi di DB MSI (tabel `roles` + permission + fungsi `is_manager_or_above()` sudah +`gm_bd`, dijalankan user manual). Single-entity MSI; RLS lintas-3-entitas = Paket 2 (belum). Prioritas frontend: disisipkan di `ERP_ROLE_PRIORITY` setelah `gm`, sebelum `manager` (`AuthContext.jsx:11`). **Roster CRM: lihat §3.1** (gm_bd boleh di-assign sbg pelaksana, TIDAK dihitung sbg performa sales). ⚠️ `gm_bd` absen dari map `PERMISSIONS` FE → `can()` = `false` untuk semua aksi; fix sudah ada (`App.jsx:289`) tapi **belum di-commit** — lihat **TD-64** / `18_…:D-01`.
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

### 3.1 Roster CRM — OPERASIONAL vs LAPORAN (dua konsep, sengaja terpisah)

> **Ini BUKAN gate menu** (siapa boleh buka halaman), tapi **isi dropdown/agregasi** (siapa muncul sbg pilihan / siapa dihitung). Keputusan bisnis, 17 Jul 2026 — **jangan disatukan.**

| Roster | Kriteria (`roles.code`) | Sumber | Dipakai di | `gm_bd`? |
|---|---|---|---|---|
| **OPERASIONAL** — siapa yang boleh **di-assign / dipilih sbg pelaksana** | `['sales','gm_bd']` = `OPERATIONAL_ROSTER_ROLES` | **`src/modules/crm/salesRoster.js`** → `fetchOperationalRoster(companyId)` | dropdown salesperson visit (`CRMDashboardPage` AddVisitModal) + filter dashboard · assignee `ActivitiesPage` · salesperson `SalesCallsPage` (dead code, TD-69) · filter `ActivityLogPage` | ✅ **MASUK** (BD ikut visit customer) |
| **ASSIGNEE DEAL** — siapa boleh **pegang deal** | `['sales','manager','supervisor','gm_bd']` | `DealDetailPage.jsx:105` `fetchAssignees` (**daftar sendiri**, lebih luas) | dropdown assignee EditDealModal → `accounts.assigned_to` | ✅ **MASUK** |
| **KAM** — siapa boleh **pegang akun strategis** | `['sales','manager','gm_bd']` | `StrategicHandoverModal.jsx:75` (**daftar sendiri**, lebih luas) | dropdown KAM di form Strategic Handover (deal WON > Rp100jt) | ✅ **MASUK** — **kontrak mewajibkan BD memegang customer tier A** |
| **LAPORAN** — performa sales siapa yang **DIHITUNG** | `['sales','supervisor','manager']` | `CRMReportPage.jsx:158` `fetchReportSales` | Sales Report (KPI / trend / per-sales) | ❌ **TIDAK** — **BD tidak dihitung sbg performa sales** |

**Ringkas: `gm_bd` ada di 3 dari 4 roster** — semua roster **operasional/assignment** (operasional, assignee deal, KAM). Yang satu (**LAPORAN**) **dikecualikan dengan sengaja**, bukan kelupaan.

- **Kenapa dipisah:** menyatukannya = diam-diam memasukkan BD ke **angka Sales Report**. Menambah `gm_bd` ke roster laporan **mengubah angka**, jadi itu keputusan bisnis, bukan refactor.
- **⚠️ Kenapa `DealDetailPage` & `StrategicHandoverModal` TAK memakai helper** (perangkap nyata — jangan "dirapikan" jadi satu): daftar keduanya **lebih luas** dari `OPERATIONAL_ROSTER_ROLES` (`['sales','gm_bd']`). Ditukar helper → **`DealDetailPage`: manager & supervisor hilang** · **`StrategicHandoverModal`: manager hilang** dari dropdown KAM (regresi senyap — dropdown tetap terisi, cuma kurang orang). Keduanya sudah diberi komentar peringatan di kode (`DealDetailPage.jsx:99-102`, `StrategicHandoverModal.jsx:70-74`). Pola: **role ditambahkan ke daftar milik masing-masing**, bukan disatukan ke helper.
- **Scope entitas:** roster **selalu company-scoped** (`roles` + `user_roles` `.eq('company_id', …)`). Row role `gm_bd` **hanya ada di MSI** → **gm_bd cuma muncul untuk user MSI**; JCI/SOA tak terpengaruh. Disengaja (§1: gm_bd single-entity, Paket 2 belum).
- **Menambah role ke roster operasional:** ubah `OPERATIONAL_ROSTER_ROLES` di `salesRoster.js` — **satu tempat**. (Sebelum 17 Jul: fungsi `fetchSalesProfiles` di-copy-paste identik di 4 file, semuanya hardcode `'sales'` → itu sebabnya `gm_bd` tak pernah muncul.)
- **Di luar roster (jangan tertukar):** `LeadPoolPage.jsx:146` `['manager','supervisor']` = `notifyManagers`, daftar **penerima notifikasi approver**, **bukan roster salesperson** → `gm_bd` **tidak relevan** di sini; nol sentuhan.

### Peta Menu → Halaman → Role-gate (visibilitas)

> **Beda dari matriks granular di bawah:** ini peta **visibilitas** (menu → halaman + siapa boleh lihat), dari `ERP_MENU_GROUPS`/`NEXUS_NAV` + `canSeeMenuItem` (**default-deny**) di `App.jsx`. Jenis gate: `public` · `menuKey` (via `hasMenuPermission`) · `module` (via `hasPermission`) · `role[...]` (array). **📋 soon** = `PLANNED_MODULES` → ComingSoonPage. *(Sumber terkini: `App.jsx` `ERP_MENU_GROUPS`/`NEXUS_NAV`.)*
>
> ℹ️ **Restruktur menu CRM Tahap 1 (19 Jul 2026, branch `feat/crm-nav-refactor`, belum commit — fondasi, NOL perubahan gate/izin):** daftar item CRM kini bersumber **tunggal** dari konstanta bersama **`CRM_MENU_ITEMS`** (`App.jsx`), dirujuk verbatim oleh `ERP_MENU_GROUPS` (pohon gate) DAN `NEXUS_NAV nav-crm` (sidebar) → tak bisa drift lagi. Induk grup CRM kini ber-id **`crm-group`** (gateless, dulu bertabrakan dengan id anak `crm-dashboard`); anak "Dashboard" TETAP `crm-dashboard` (menuKey `crm_dashboard` tak berubah). **Item, jumlah, dan gate per role di tabel di bawah IDENTIK** sebelum vs sesudah (objek gate-nya harfiah dipindah, bukan diubah); urutan render sidebar juga tak berubah.
>
> ℹ️ **Restruktur menu CRM Tahap 2a (19 Jul 2026, branch `feat/crm-nav-tahap2a` dari `main`@4e541b3, sudah di-commit sebagai `f2bbd76` & merge ke `main` — gabung menu Customer, NOL perubahan gate/izin/DB):** 5 entri "Master Customer" (`crm-customers` induk + 4 anak `crm-customers-msi/-jci/-soa/-free`) di `CRM_MENU_ITEMS` digabung jadi SATU leaf **`crm-customers`** berlabel **"Customer"**. Sumbu **entitas** (Semua/MSI/JCI/SOA) & **status** (Semua/Customer/Free Agent) kini jadi **filter di dalam `CustomerListPage`**, bukan submenu. `MENU_KEY_MAP` — 4 entri anak mati dihapus; `crm-customers` + `customer-detail` tetap → `crm_customers` (**gate & menuKey tak berubah, tak ada role yang kehilangan/mendapat akses**). Prop `entityFilter`/`ENTITY_HEADER` dibiarkan **dormant** (backward-compat, tak dihapus). Free Agent kini terjangkau lewat filter status (fetch `account_status IN ('customer','free_agent')`; di produksi `free_agent`=0 baris). Tahap 2b (Pipeline/Prospects/Lead Pool) & 2c (Activities/Activity Log) belum dikerjakan.
>
> ℹ️ **Restruktur menu CRM Tahap 2b (19 Jul 2026, branch `feat/crm-nav-tahap2b` dari `main`@f2bbd76, sudah di-commit sebagai `b857adf` & merge ke `main` — gabung 4 menu ber-tabel `accounts`, NOL perubahan gate/izin/DB/katalog menu):** 4 menu CRM yang membaca tabel `accounts` — **Pipeline** (`crm-pipeline`), **Prospects** (`crm-prospects`), **Lead Pool** (`crm-lead-pool`), **Approval Lead Pool** (`crm-lead-pool-approval`) — digabung jadi SATU leaf sidebar **`crm-account`** berlabel **"Account"** dengan **4 TAB**. **`activeMenu` tetap = id tab** (bukan id induk sintetis) → semua deep-link/back-button/localStorage/redirect-guard/content-gate lama bekerja tanpa diubah (beda dari Tahap 2a yang id anaknya benar-benar hilang + butuh normalisasi). **Gate per tab VERBATIM** (objek gate dipindah harfiah ke `children` node `crm-account` di `CRM_MENU_ITEMS`; `findMenuItemById(tabId)` tetap menemukan gate tiap tab); **visibilitas menu "Account" = OR gate anak** (`navChildGate`) → muncul iff user berhak ≥1 tab. Tab-bar (`AccountTabBar`) & sidebar (`LeafRow` special-case) memfilter dengan fungsi gate yang sama (`canSeeMenuItem`); tab default = tab pertama yang user berhak. **Tak ada role yang kehilangan/mendapat akses** (mis. `sales` → Lead Pool ✅, Approval ❌ = 3 tab; `crm_pipeline`/`crm_prospects` menuKey tak berubah). Deep-link notifikasi `lead_pool` → `crm-lead-pool` mendarat tepat di tab Lead Pool. Tab bar disembunyikan saat `ProspectFormPage` terbuka (satu-satunya sub-view in-flow full-page) agar isian tak hilang; sub-view lain = overlay `position:fixed` (self-protecting). Isi keempat halaman tak diubah. `MENU_KEY_MAP` tak berubah. Tahap 2c (Activities/Activity Log) belum dikerjakan.
>
> ℹ️ **Restruktur menu CRM Tahap 2c (19 Jul 2026, branch `feat/crm-nav-tahap2c` dari `main`@b857adf [= commit Tahap 2b], belum commit — penutup tahap 2; gabung 3 menu + 1 menu PINDAH GRUP, NOL perubahan gate/izin/DB/katalog menu/`MENU_KEY_MAP`):** **Activities** (`crm-calls`, CRM), **Activity Log** (`crm-activity-log`, CRM), dan **Riwayat Visit** (`riwayat-visit`, sebelumnya grup **Reporting**) digabung jadi SATU leaf sidebar **`crm-aktivitas`** berlabel **"Aktivitas"** dengan **3 TAB** (Jadwal & Tugas / Riwayat / Riwayat Visit). **`riwayat-visit` PINDAH grup Reporting → CRM** (dihapus dari `ERP_MENU_GROUPS` grup Reporting + dari `NEXUS_NAV nav-report`; gate `role[super_admin,ceo,gm_bd]` dipindah **verbatim** ke `children` node `crm-aktivitas`). Pola identik Tahap 2b: **`activeMenu` tetap = id tab** → deep-link/back/localStorage/redirect-guard/content-gate lama jalan tanpa diubah; **gate per tab VERBATIM** (`findMenuItemById(tabId)` tetap menemukan gate); **visibilitas "Aktivitas" = OR gate anak** → muncul iff user berhak ≥1 tab. Komponen tab bar Tahap 2b `AccountTabBar` **di-rename `MenuTabBar`** (kini dipakai 2 menu bertab; perilaku tak berubah); sidebar `LeafRow` special-case digeneralisasi menangani `crm-account` **dan** `crm-aktivitas`. Content-gate `canRenderPage('riwayat-visit')` **dipertahankan** di sub-blok riwayat-visit; catch-all ComingSoon allow-list `riwayat-visit` **dipertahankan** (bukan prefix `crm-`). **Visibilitas: 3 tab** (super_admin/ceo/gm_bd) — **2 tab** tanpa Riwayat Visit (admin/gm/manager/supervisor/sales) — **menu tersembunyi** (operations/finance/procurement/hrga/it/viewer). Tab default = Jadwal & Tugas. Deep-link notifikasi `activity` → `crm-calls` mendarat di tab Jadwal & Tugas. **Tak ada role yang kehilangan/mendapat akses.** Isi ketiga halaman tak diubah (kecuali 1 kata breadcrumb `RiwayatVisitPage` "Reporting"→"CRM"). Tahap 3 (panel detail inquiry) belum dikerjakan.

| Grup | Menu / Halaman | Komponen | Role-gate | Status |
|---|---|---|---|---|
| CORE | Command Center · Home | Dashboard · HomeDashboard | public | LIVE |
| CRM | CRM Dashboard | CRMDashboardPage | menuKey `crm_dashboard` | LIVE |
| CRM | Account › Pipeline / Leads | PipelineKanbanPage | menuKey | LIVE (**Tahap 2b — tab dalam menu "Account"**; gate tak berubah) |
| CRM | Account › Lead Pool | LeadPoolPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor,sales] | LIVE (**Tahap 2b — tab dalam menu "Account"**) |
| CRM | Account › Approval Lead Pool | LeadPoolApprovalPage | role[ceo,gm,gm_bd,manager,supervisor,admin,super_admin] | LIVE (**ceo/gm/gm_bd ditambah 9 Jul — sebelumnya CEO kelewat**; **Tahap 2b — tab dalam menu "Account"**) |
| CRM | Account › Prospects | ProspectListPage/FormPage | module `crm` + role[…,ceo,gm,…] (gm_bd via crm module) | LIVE (**Tahap 2b — tab dalam menu "Account"**) |
| CRM | Inquiry | InquiryListPage/FormPage/DealDetailPage | via crm | LIVE |
| CRM | Quotation | QuotationList/Detail/FormPage | via crm | LIVE |
| CRM | Rate List | RateListPage | role[super_admin,admin,ceo,gm,gm_bd,manager,sales] | LIVE |
| CRM | Customer (+ Detail) | CustomerListPage · CustomerDetailPage | menuKey `crm_customers` | LIVE (**Tahap 2a, 19 Jul** — 5 entri lama [induk + 4 anak MSI/JCI/SOA/Free] digabung jadi SATU menu "Customer"; MSI/JCI/SOA/Free Agent kini **filter di halaman**, bukan submenu. menuKey & gate tak berubah — **tak ada role yang kehilangan/mendapat akses**) |
| CRM | Aktivitas › Jadwal & Tugas / Riwayat | ActivitiesPage · ActivityLogPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor,sales] | LIVE (**Tahap 2c, 19 Jul** — tab dalam menu "Aktivitas"; gate tak berubah) |
| CRM | Aktivitas › Riwayat Visit | RiwayatVisitPage | role[super_admin,ceo,gm_bd] | LIVE (**Tahap 2c, 19 Jul — PINDAH dari grup Reporting** jadi tab; gate `[super_admin,ceo,gm_bd]` tak berubah — **gm_bd ditambah 9 Jul; gm SENGAJA tidak**) |
| LOGISTICS | Sales Order / SP (list + detail) | SalesOrderPage · SalesOrderDetailPage | menuKey `logistics_sp` | LIVE |
| LOGISTICS | ↳ Hapus SP (Danger Zone, Detail) | SalesOrderDetailPage | **role `super_admin` + status `DRAFT`** (RPC `delete_sp_dual` guard `is_super_admin()` + DRAFT) | ⚠️ RPC belum live (dijalankan manual). Dulu `[super_admin,operations]` tanpa gate status → operations dicabut akses hapus |
| LOGISTICS | ↳ Batalkan SP (header actions, Detail) | SalesOrderDetailPage | role[super_admin,operations,manager,gm] + status `DRAFT` (`set_sp_status 'cancelled'`, alasan wajib) | LIVE |
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
| PROCUREMENT | PRF (Price Request Form — form) | PRFFormPage | role[sales,gm_bd,procurement,manager,ceo,admin,super_admin] | LIVE (Fase 1; menu terlihat semua role di list, tapi **hanya sales/gm_bd bisa Submit/Draft** — dijaga RLS `prf_insert`; role lain submit → toast error) |
| PROCUREMENT | PR · PO · Vendor Mgmt | ComingSoon | — | 📋 soon |
| REPORTING | Sales Report | CRMReportPage | role[super_admin,admin,ceo,gm,gm_bd,manager,supervisor] | LIVE |
| REPORTING | ~~Riwayat Visit~~ | ~~RiwayatVisitPage~~ | — | **PINDAH ke grup CRM** (Tahap 2c, 19 Jul — kini tab "Aktivitas › Riwayat Visit"; lihat baris CRM) |
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
