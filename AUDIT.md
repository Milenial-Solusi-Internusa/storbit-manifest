# AUDIT — Nexus by MSI (Struktur Menu, Routing, Role Access, Modul)

> **Mode:** AUDIT read-only. Tidak ada file/DB/kode yang diubah. Satu-satunya file yang dibuat = dokumen ini.
> **Tanggal:** 24 Jun 2026 · **Auditor scope:** struktur menu, routing, role access control, kelengkapan modul, gap analysis.
> **Metode:** baca `CLAUDE.md` / `AGENTS.md` / `README.md` / `PROGRESS.md` + pembacaan langsung `src/App.jsx` (4.909 baris), komponen modul, dan `supabase/schema_snapshot.sql`. Verdict modul **diverifikasi langsung lewat grep `supabase.from/.insert/.update/.rpc`** (sebuah survei agent awal sempat salah melabeli beberapa file "dummy" — sudah dikoreksi di sini).
> **Catatan kejujuran:** semua klaim "REAL/DUMMY" di bawah sudah dicek ke kode, bukan asumsi.

---

## RINGKASAN EKSEKUTIF (baca ini dulu)

Nexus punya **fondasi yang solid di ~6 area** (Auth/RBAC, Master Data/Admin, CRM end-to-end Prospect→Inquiry→Quotation, HRGA Request, Admin Settings, Asset detail IT) — tapi **navigasi memajang kerangka ERP raksasa yang ~80–90% masih placeholder "Coming Soon"**. Ini menciptakan ilusi kelengkapan: user bisa klik puluhan menu yang tidak melakukan apa-apa.

Tiga kelas masalah paling serius:
1. **Gating role rapuh & tidak konsisten** — taksonomi role pecah jadi 4+ kosakata berbeda (`sales_head`/`supervisor`/`super`/`logistic` muncul di tempat berbeda padahal bukan bagian dari 13 role kanonik), 1 gate aksi yang **pasti gagal untuk super_admin**, dan render page hampir tanpa re-check role (hanya bergantung visibilitas menu).
2. **FE menampilkan menu yang RLS-nya menolak** (TD-01 sudah tercatat) — manager/ceo/gm lihat menu, klik, lalu write gagal senyap.
3. **Modul "selesai" yang sebenarnya tidak menyimpan** — paling parah: **Add Asset wizard "menyimpan" secara simulasi 1,5 detik tanpa insert DB sama sekali** (user mengira aset tersimpan, padahal hilang).

Detail lengkap di bawah.

---

## 1. PETA MENU LENGKAP

Sumber menu: `MENU_GROUPS` di `src/App.jsx` (mulai ~line 410, definisi grup s/d line 791). Routing = **state-swap `activeMenu`** (BUKAN react-router). Render conditional di `src/App.jsx:2227–2785`. Fallback placeholder via `PLANNED_MODULES` (`src/App.jsx:281`) + catch-all (`src/App.jsx:2278`).

### 1a. Menu yang BENAR-BENAR punya halaman (REAL routes)

| Grup | Menu / Sub-menu | activeMenu id | Komponen | Role gate (FE) | Status |
|---|---|---|---|---|---|
| (Home) | App Launcher | `home` / `!activeModule` | `AppLauncher` | semua auth | OK |
| Dashboard | Dashboard (Storbit SP) | `dashboard` | `Dashboard` | default-allow | OK |
| CRM | Dashboard | `crm-dashboard` | `CRMDashboardPage` | menuPerm `crm_dashboard` | OK |
| CRM | Pipeline / Leads | `crm-pipeline` | `PipelineKanbanPage` | `crm_pipeline` | OK |
| CRM | Lead Pool | `crm-lead-pool` | `LeadPoolPage` | default-allow | OK (convert lead→prospect, `:171`) |
| CRM | Prospects (+form) | `crm-prospects` | `ProspectListPage`/`ProspectFormPage` | role array (7 role) | OK |
| CRM | Inquiry (+form) | `crm-inquiry` | `InquiryListPage`/`InquiryFormPage` | `crm_inquiry` | OK (insert `inquiries` `:128`) |
| CRM | Quotation (+form+detail) | `quotation-draft` | `QuotationListPage`/`QuotationFormPage`/`QuotationDetailPage` | `crm_quotation` | OK (RPC `save_quotation` `:600`) |
| CRM | Master Customer MSI/JCI/SOA/Free | `crm-customers*` | `CustomerListPage` | `crm_customers` | OK |
| CRM | (Customer detail) | `customer-detail` | `CustomerDetailPage` | via context | OK |
| CRM | Activities | `crm-calls` | `ActivitiesPage` | default-allow | OK |
| CRM | Activity Log | `crm-activity-log` | `ActivityLogPage` | default-allow | OK |
| CRM | Report (+Export PDF) | `crm-report` | `CRMReportPage` | default-allow | OK |
| Logistics | SP Manifest / Input SP | `manifest` / `input` | `SalesOrderPage`/`InputSPPage`/`SalesOrderDetailPage` | role array | PARTIAL (lihat §4) |
| Inventory | Dashboard/Stok/Penerimaan | `inventory-dashboard/-stok/-penerimaan` | `InventoryDashboardPage`/`StokBarangPage`/`PenerimaanBarangPage` | default-allow | OK |
| Service Mgmt | Asset Management (Dashboard + detail IT) | `assets*` | `AssetShell` → `AssetDashboardPage`/`AssetDetailITPage`/`AddAssetPage` | default-allow | PARTIAL (Add Asset = simulasi, §4) |
| Service Mgmt | HRGA Request (My/Buat/Semua/Pending/Arsip) | `hrga*` | `HrgaShell` | default-allow | OK |
| Foundation | Master Data | `admin` | `AdminShell` | role `['super_admin','admin','it']` | OK |
| Foundation | Products & Services (+detail) | `products`/`product-detail` | `ProductsPage`/`ProductDetailPage` | **default-allow** ⚠ | OK |
| Foundation | Schema Manager | `schema-manager` | `SchemaManagerPage` | role `['super_admin']` + inline `hasPermission` | OK |
| Foundation | Admin Settings (hub + 9 tab) | `admin-settings*` | `AdminSettingsHub` + 9 page | role `['super_admin','admin']` | OK/PARTIAL (§4) |
| Profile | My Profile | (topbar) | `MyProfilePage` | self | OK |

### 1b. Menu PLACEHOLDER (ada di UI, render "Coming Soon", BELUM ada halaman)

Semua di bawah ini **dead-end** — klik → `ComingSoonPage`. Sumber: `PLANNED_MODULES` (`src/App.jsx:281–360`) + catch-all (`:2278`).

| Grup | Menu (label) | id | Status |
|---|---|---|---|
| Logistics | General Trading, Job Management, Freight Forwarding, Shipment Management, PPJK Impor/Ekspor/Manifest/Trucking | `trading`,`job`,`freight`,`shipment`,`ppjk*` | DEAD (ComingSoon) |
| Procurement & Vendor | Procurement Request, Purchase Order, Vendor Management | `procRequest`,`purchaseOrder`,`vendors` | DEAD |
| Inventory | Pengeluaran, Transfer, Opname | `inventory-pengeluaran/-transfer/-opname` | DEAD |
| Finance & Accounting | Job Costing, Billing/Invoice, AR/Collection, AP, Cash/Bank, Accounting, Outstanding, Finance Docs | `jobCosting`,`billing`,`ar`,`ap`,`cashBank`,`accounting`,`outstanding`,`finance` | DEAD |
| Service Mgmt | IT Service Mgmt (semua sub) | `it*` | DEAD |
| Service Mgmt | Asset: Analytics, Kendaraan, Furniture, Properti, Maintenance, Work Orders, Dokumen, Kategori, Lokasi, Vendor, Settings | `assets-analytics`,`assets-kendaraan`,`assets-furniture`,… | DEAD (hanya Dashboard + IT detail yang live) |
| Workflow & Document | Approval Center (semua), Document Management (semua) | `approvals*`,`docMgmt*` | DEAD |
| Portal & Integration | Customer Portal, Vendor Portal, API & Integration, Public Tracking | `customerPortal*`,`vendorPortal*`,`apiCenter*`,`publicTracking*` | DEAD |
| Reporting & Governance | Reporting & Dashboard, Performance & Cache, Audit & Compliance | `reports*`,`performance*`,`audit*` | DEAD |

> **Estimasi:** dari ~150+ item menu/sub-menu, hanya **~30 yang punya halaman nyata**. Sisanya (~80%) placeholder.

### 1c. Halaman yang ADA tapi tidak terhubung ke menu manapun (orphan / dead code)

| File | Status |
|---|---|
| `src/components/UserManagement.legacy.jsx` | **Tidak di-import** di mana pun (dead code, TD-15) |
| `src/modules/crm/CustomerMasterPage.legacy.jsx` | **Tidak di-import** (dead code, TD-15) |
| `src/modules/foundation/OrgStructurePage.jsx` | Org Chart — file ada, **tidak ada menu yang merender-nya** lewat `activeMenu` (PROGRESS klaim "Org Chart 2.9S–V" tapi tak ada route di App.jsx). **Perlu verifikasi**: apakah dirender di dalam AdminShell? |
| `src/modules/crm/WinLossModal.jsx`, `BantScoreBar.jsx` | komponen pendukung (bukan route) — OK |

### 1d. Inkonsistensi penamaan menu vs id vs komponen

- `crm-calls` (id) → label **"Activities"** → komponen **`ActivitiesPage`**. Tiga nama berbeda untuk hal yang sama (warisan rename Sales Calls → Activities). Membingungkan saat maintenance. (`src/App.jsx:462`)
- `quotation-draft` (id) → label **"Quotation"** → padahal merender list/form/detail penuh, bukan "draft". (`src/App.jsx:452`)
- `manifest` (id) → label **"SP Manifest"** / parent "Sales Order / SP" → komponen `SalesOrderPage`. (`src/App.jsx:475`)
- `admin` (id) → label **"Master Data"** → komponen `AdminShell`. (`src/App.jsx:784`)
- `crm-customers` muncul **dua kali**: sebagai parent di grup CRM (`:454`) dan sebagai cross-link "Di CRM" di grup Logistics (`:488`) — id ganda berisiko ambiguitas active-state.

---

## 2. TEMUAN ROUTING & LOGIC

**[HIGH] Routing seluruh app = satu `activeMenu` state-swap, tanpa URL/react-router** — `src/App.jsx:1200–1528`, render `:2227–2785`.
Dampak nyata: (1) tidak ada deep-link/URL yang bisa dibagikan atau di-bookmark; (2) tombol Back/Forward browser tidak berfungsi sebagai navigasi; (3) refresh mengandalkan `localStorage('nexus_last_menu')` untuk restore — kalau corrupt/stale, lokasi hilang; (4) tidak ada boundary route untuk testing. God-file 4.909 baris memperparah (TD-12).
Fix: adopsi `react-router` bertahap (mulai dari level modul), petakan `activeMenu` id → path. Jangan big-bang (sesuai AGENTS rule #2) — bungkus router di shell, migrasi per grup.

**[MEDIUM] ~80% menu adalah placeholder "Coming Soon" yang tampil sebagai item aktif** — `PLANNED_MODULES` `src/App.jsx:281`; catch-all `:2278–2289`.
Dampak: user/QA tidak bisa membedakan fitur nyata vs rencana; menambah beban kognitif & laporan bug palsu; memberi kesan parity yang salah ke stakeholder.
Fix: tandai item planned secara visual (badge "Soon"/disabled) ATAU sembunyikan di balik feature-flag/`feature-registry` sampai modulnya nyata. Minimal: beri ikon kunci/abu + non-klik.

**[MEDIUM] Tidak ada role-based landing page setelah login** — initial `activeMenu = localStorage || 'home'` (`src/App.jsx:1204`); restored-menu divalidasi ulang (`FIX B`, `:1476–1528`).
Dampak: sales, finance, HRGA semua mendarat di App Launcher generik, bukan modul kerja mereka. Minor UX, tapi terasa untuk daily driver.
Fix: default landing per role (mis. sales→`crm-dashboard`, finance→finance, hrga→`hrga`).

**[LOW] Semua komponen sudah `lazy()` (63 lazy imports, `src/App.jsx:23–63)`** — bagus. Tapi `ProductDetailModal` selalu ter-mount di tree dengan `isOpen` toggle (`:2420–2426`) ketimbang conditional — minor overhead.

**[LOW] `users` activeMenu = redirect inline** `(() => { navigateTo('admin'); return null; })()` saat render (`src/App.jsx:2396`).
Dampak: memanggil `navigateTo` (setState) di tengah render — anti-pattern React (boleh memicu warning/re-render ganda). Mitigasinya jarang dipakai (legacy bookmark).
Fix: tangani redirect di `useEffect`, bukan di body render.

**[LOW] Catch-all "Coming Soon" pakai daftar exclude string panjang & rapuh** — `src/App.jsx:2278–2283` (hardcode list `['dashboard','manifest',…]` + banyak `startsWith`). Setiap route baru wajib ingat menambah ke exclude, kalau lupa → halaman nyata ketiban "Coming Soon" atau sebaliknya.
Fix: pakai satu registry `id → renderer`; default = ComingSoon. Hilangkan exclude-list manual.

---

## 3. TEMUAN ROLE ACCESS

**[HIGH] Gate aksi pakai role string yang tidak ada / legacy → pasti gagal untuk super_admin** — `src/modules/logistics/SalesOrderDetailPage.jsx:1112`:
`{(role === 'super' || role === 'operations' || role === 'logistic') && (…)}`.
`role` dari `useAuth()` = `erpRoleCode` (mis. `'super_admin'`), sehingga `'super'` **tidak pernah match**, dan `'logistic'` bukan role yang ada (yang valid `operations`). Role terdampak: **super_admin** (kehilangan aksi yang seharusnya boleh), dan taksonomi `logistic` mati.
Fix: ganti ke `role === 'super_admin' || role === 'operations'` (+ role logistik yang benar bila ada).

**[HIGH] Taksonomi role terfragmentasi 4+ kosakata berbeda** — bukti:
- Kanonik 13 role: `ERP_ROLE_PRIORITY` di `src/contexts/AuthContext.jsx:9` = super_admin, admin, ceo, gm, manager, finance_controller, finance, operations, sales, procurement, hrga, it, viewer.
- DB `is_manager_or_above()` (`schema_snapshot.sql:396`) menambah **`sales_head`** — TIDAK ada di 13 kanonik.
- Roster sales (`CRMReportPage.jsx:150`, juga `fetchSalesProfiles`) memakai **`supervisor`** — TIDAK ada di 13 kanonik.
- Legacy **`super`** masih dipakai: `src/App.jsx:254`, `src/modules/admin/pages/userAccessTokens.js:35`, `UserManagement.legacy.jsx:39`, dan gate `SalesOrderDetailPage.jsx:1112`.
Dampak: user ber-role `sales_head`/`supervisor` mendapat akses tak konsisten — DB memberi hak setara manager (read), tapi FE menu role-array tak pernah menyebut mereka → menu kosong; sebaliknya beberapa gate FE memakai string yang tak match role nyata.
Fix: tetapkan SATU daftar role kanonik (sumber tunggal, mis. tabel `roles` + konstanta FE yang di-generate), lalu reconcile: `ERP_ROLE_PRIORITY` ↔ `is_manager_or_above`/`is_admin_or_above` ↔ role-array menu ↔ roster. Hapus `super`/`logistic`.

**[HIGH] Render page hampir tanpa re-check role (FE-only gating)** — hanya `schema-manager` yang punya cek inline `hasPermission('admin','view')` (`src/App.jsx:2428`). Semua block lain (`admin`, `admin-settings`, `products`, dst.) merender **murni berdasarkan visibilitas menu** (`canSeeMenuItem`).
Dampak: melanggar AGENTS rule #5 ("jangan hanya andalkan FE permission") untuk lapisan UI. Jika ada celah di logika visibilitas atau `activeMenu` di-set programatik, page tetap render. **Mitigasi nyata:** RLS DB (backstop data) + `FIX B` validasi restored-menu (`:1476–1528`). Jadi datanya aman, tapi UI bisa bocor.
Fix: route-guard terpusat — sebelum render block, panggil `canSeeMenuItem` untuk id terkait; kalau gagal → `AccessDeniedPage`.

**[HIGH] FE menampilkan menu yang RLS-nya menolak (TD-01)** — role-array menu memasukkan `manager/ceo/gm` (mis. `src/App.jsx:450,609,614,616`), tapi banyak RLS write masih `is_admin_or_above()` (super_admin/admin saja). 
Dampak: manager/ceo klik menu yang terlihat, lalu create/update **gagal senyap (0-row)** atau error. Sudah tercatat sebagai TD-01 (PARTIAL). 
Fix: lanjutkan migrasi RLS `is_admin_or_above`→`is_manager_or_above` per kebutuhan + samakan dengan role-array FE.

**[MEDIUM] Default-allow pada `canSeeMenuItem`** — `src/App.jsx:864–875`: bila item tak punya `role`/`module`/menuKey, fungsi `return true`. Banyak item sensitif TANPA role array, mis. `products` (`:785`), seluruh Finance kecuali 3 (`jobCosting/billing/ap/cashBank/accounting` `:607–613`), seluruh sub Logistics/Procurement/Portal.
Dampak: **`Products & Services` saat ini terlihat oleh SEMUA user login** (tak ada gate). Saat modul Finance/Procurement/dll dibuat nyata, mereka akan world-visible kecuali role ditambah — jebakan keamanan menunggu.
Fix: ubah default jadi **default-deny** (atau wajibkan setiap item punya `module`/`role`), dan tambah role ke `products`.

**[MEDIUM] Entity naming tidak konsisten antar sumber kebenaran** — `AGENTS.md`/`README.md`: JCI = "PT **Jago Custom** Indonesia", SOA = "PT **Stuja Orbit** Abadi"; sedangkan `CLAUDE.md` + kode (`DropdownManagementPage`/`kit`/`tokens` `ENTITIES`): JCI = "PT **Jaya Cargo** Internusa", SOA = "PT **Samudra Optima** Abadi".
Dampak: nama legal entitas berbeda di dokumen vs aplikasi → risiko muncul di dokumen/PDF/quotation yang menghadap customer. CRITICAL kalau sampai tercetak di invoice/quotation.
Fix: tetapkan nama legal resmi (satu sumber), samakan semua.

**[LOW] Tidak ada enforcement MFA di kode** — AGENTS/security-baseline mewajibkan MFA untuk admin/BOD/Finance Controller/Head; tidak ditemukan gating MFA di alur login. (SecurityPolicyPage hanya localStorage, lihat §4.)
Fix: implement MFA gate untuk role sensitif (server-side).

---

## 4. STATUS MODUL PER MODUL

Verdict diverifikasi via grep (`supabase.from/.insert/.update/.rpc` + `localStorage`). **Koreksi penting:** survei agent awal salah melabeli QuotationForm/InquiryForm/CRMReport/LeadPool sebagai "dummy" — faktanya REAL (dibuktikan di bawah).

### CRM — paling matang
| Fitur | Status | Catatan (bukti) |
|---|---|---|
| Pipeline / Kanban | REAL | drag-stage update DB |
| Prospect (list+form, BANT, Win/Loss) | REAL | insert/update accounts |
| Lead Pool | REAL | convert lead→prospect `LeadPoolPage.jsx:171` |
| Inquiry (list+form) | REAL | `InquiryFormPage.jsx:128` insert `inquiries` |
| Quotation (list+form+detail+PDF) | REAL | RPC `save_quotation` `QuotationFormPage.jsx:600`; dropdown DB-driven; PDF react-pdf |
| Master Customer (list+detail) | REAL | accounts CRUD |
| Activities + Activity Log | REAL | activities CRUD + feed |
| CRM Dashboard | REAL | fetch activities/accounts/quotations |
| CRM Report + Export PDF | REAL | fetch real + ActivityReportPDF |
| ⚠ `overdue` activity | DERIVED FE-only | tidak ada status DB / SLA config; dihitung di `CRMReportPage` saja (lihat audit overdue) |

### Admin / Foundation — matang
| Fitur | Status | Catatan |
|---|---|---|
| Companies/Branches/Departments/Positions/Roles/Products/DocTypes/PaymentTerms/Taxes/StatusCatalog | REAL | via hooks `useXxx`, CRUD AdminFormModal |
| User Access + User Edit (avatar, password, 2FA UI) | REAL | |
| Schema Manager | PARTIAL/REAL | super_admin only |
| My Profile | REAL | avatar Storage + auth.updateUser |

### Admin Settings (9 tab) — **terbelah dua**
| Tab | Status | Tabel / penyimpanan |
|---|---|---|
| Entity Settings | REAL | companies, entity_bank_accounts, entity_signatories, Storage (12 write) |
| Document Settings | REAL | document_numbering, document_templates (3 write) |
| Finance Defaults | REAL | entity_finance_settings (1 write) |
| Approval Workflows | REAL | approval_workflows, approval_workflow_steps, hrga_approval_configs, hrga_request_types (7 write) |
| Notifications | REAL | notification_rules (3 write) |
| Dropdown Management | REAL | dropdown_options + currencies + payment_terms (7 write) |
| Audit Log | PARTIAL | **read-only**, hanya `user_login_logs` (login events). Tabel `audit_logs` belum ada (TD-05/TD-37) |
| General Preferences | **LOCALSTORAGE-ONLY** | 5 key `general_prefs_*` — tidak ke DB |
| Security Policy | **LOCALSTORAGE-ONLY** | 4 key `security_policy_*` — **tidak ditegakkan**; ini settings keamanan yang tak punya efek nyata |
| Integrations | **LOCALSTORAGE-ONLY** | 5 key `integrations_*` — **credentials (WA token/SMTP password/API keys) plaintext di localStorage** (TD-36) |

### HRGA — matang
| Fitur | Status |
|---|---|
| My/Semua/Pending/Arsip Request, Detail, approval | REAL (via `useHrgaRequests`) |
| Buat Request | **PERLU VERIFIKASI** — survei menandai form belum wired; HRGA list/approval jelas REAL. Cek `BuatRequestPage` submit. |
| Offboarding | PLANNED (tabel ada, UI belum) |

### Asset Management — **PARTIAL berbahaya**
| Fitur | Status | Catatan |
|---|---|---|
| Asset Dashboard | REAL | fetch counts |
| Asset Detail IT (inline edit) | REAL | save ke `assets` |
| **Add Asset wizard** | **DUMMY — SIMULASI** | `AddAssetPage.jsx:507` `AASaveButton` = `setTimeout(...1.5s) → onSuccess()`, **0 panggilan supabase**. User mengira aset tersimpan, padahal TIDAK ADA insert. |
| Kendaraan/Furniture/Properti/Maintenance/WorkOrders/Docs | PLACEHOLDER (ComingSoon; tabel sebagian belum ada — TD-26) |

### Inventory
| Fitur | Status |
|---|---|
| Stok Barang, Penerimaan Barang, Dashboard | REAL (fetch + penerimaan write) |
| Pengeluaran/Transfer/Opname | PLACEHOLDER |

### Logistics (Storbit SP/AR) — PARTIAL
| Fitur | Status | Catatan |
|---|---|---|
| Sales Order / SP list + detail | REAL (read) | `db.js` legacy Storbit |
| Input SP | PERLU VERIFIKASI | survei menandai draft-only |
| AR / TTF | REAL | db.js |
| Job/Freight/PPJK/Trading/Shipment | PLACEHOLDER (ComingSoon) |

### Dashboard (Storbit)
| Fitur | Status |
|---|---|
| Dashboard.jsx (stats SP) | REAL (menerima `stats`/`groupedSP` dari App.jsx yang dihitung dari data SP) |

---

## 5. GAP ANALYSIS — APA YANG BELUM ADA

### 5a. Alur Sales (inti bisnis MSI) — di mana putusnya
`Prospect ✅ → Inquiry ✅ → Quotation ✅ → ❌ [PUTUS] → Sales Order/Job → Operation (Freight/PPJK/Trucking) → Billing/Invoice → AR/Collection`

- **Quotation → Sales Order/Job: tidak ada konversi.** Quotation berhenti di status SENT/ACCEPTED; tidak ada tombol "jadikan SO/Job". SP Storbit (`manifest`) adalah alur trading legacy yang **terpisah**, tidak lahir dari Quotation. **Ini gap terbesar untuk operasional.**
- **Job/Operation Management:** placeholder total (Freight FCL/LCL/Air, PPJK Impor/Ekspor/Manifest, Trucking) — inti bisnis MSI/JCI **belum ada sama sekali**.
- **Billing/Invoice, AR Collection, AP, Cash/Bank, Accounting:** placeholder total. Tidak ada jembatan dari Quotation/SO ke invoice → **revenue tidak tercatat di sistem**.

### 5b. Modul besar yang BELUM ADA SAMA SEKALI di Nexus (vs daftar AGENTS)
| Modul/Fitur | Ada di Nexus? | Prioritas | Catatan |
|---|---|---|---|
| Job / Operation Management | ❌ ComingSoon | **P0** | inti freight/PPJK |
| Freight Forwarding (FCL/LCL/Air) | ❌ | **P0** | core MSI |
| PPJK / Customs (PIB/PEB/BC) | ❌ | **P0** | core JCI |
| Billing / Invoice | ❌ | **P0** | tak ada pencatatan revenue |
| AR / Collection | ❌ (kecuali Storbit TTF legacy) | **P1** | |
| AP / Vendor Invoice | ❌ | P1 | |
| Procurement (PR/PO) | ❌ | P1 | tabel `vendors` ada, UI tidak |
| Vendor Management | ❌ | P1 | `vendors` table tanpa UI |
| Cash/Bank, Accounting/GL | ❌ | P2 | `chart_of_accounts`/`cost_centers` ada (FinanceDefaults baca sebagian) |
| Approval Center (runtime engine) | ❌ engine | **P1** | tabel `approval_workflows/_steps/approval_rules/_logs/_delegations` ADA + UI config ADA, tapi **tidak ada engine eksekusi** |
| Document Management | ❌ | P2 | |
| IT Service Mgmt (ticketing) | ❌ | P2 | |
| Customer/Vendor Portal | ❌ | P3 | |
| API / Public Tracking | ❌ | P3 | |
| Reporting & Dashboard (exec) | ❌ | P2 | hanya CRM Report yang ada |
| Audit & Compliance | ❌ | **P1** | **`audit_logs` table belum ada**; 0 `logАudit()` (TD-05). AGENTS wajibkan 19 event audit → belum terpenuhi sama sekali |
| MFA enforcement | ❌ | P1 | diwajibkan security-baseline |

### 5c. Tabel DB ADA tapi BELUM ada UI (atau UI minimal)
| Tabel | UI? | Catatan |
|---|---|---|
| `vendors` | ❌ | Vendor Mgmt placeholder |
| `approval_rules`, `approval_logs`, `approval_delegations` | ❌ engine | hanya config workflow yang ada, runtime tidak |
| `chart_of_accounts`, `cost_centers`, `exchange_rates` | sebagian | FinanceDefaults baca sebagian; tak ada modul transaksi |
| `stock_ledger`, `warehouses` | sebagian | inventory parsial |
| `status_catalog` | UI ada | tapi konsumen status/stage CRM masih hardcoded (belum konsumsi tabel ini) |
| `notifications` | producer + bell ada | OK |

### 5d. UI ADA tapi BELUM ada tabel DB (atau tak persist)
| UI | Masalah |
|---|---|
| Add Asset wizard | tak ada insert (simulasi) |
| Security Policy / General Preferences / Integrations | localStorage saja, tak ada tabel settings |
| Audit Log page | baca `user_login_logs`; tabel `audit_logs` yang sebenarnya belum ada |
| Banyak ComingSoon | tak ada tabel (memang belum dibangun) |

---

## 6. TOP 10 MASALAH PALING KRITIS

1. **[HIGH] Add Asset wizard "menyimpan" secara simulasi tanpa insert DB** — `AddAssetPage.jsx:507,727`. User kehilangan data tanpa sadar. **Fix segera: wire ke `assets`/`asset_*` insert, atau matikan tombol + label "belum aktif".**
2. **[HIGH] Gate aksi `role === 'super' || … 'logistic'`** — `SalesOrderDetailPage.jsx:1112`. Super_admin kehilangan aksi; pakai role string mati. Fix: `'super_admin'`.
3. **[HIGH] Taksonomi role pecah** (`sales_head`/`supervisor`/`super`/`logistic` vs 13 kanonik) — akses tak konsisten lintas FE/DB. Fix: satukan daftar role.
4. **[HIGH] FE menampilkan menu yang RLS tolak (TD-01)** — manager/ceo write gagal senyap. Fix: selesaikan migrasi RLS + samakan role-array.
5. **[HIGH] Render page nyaris tanpa re-check role** (hanya schema-manager) — gating UI hanya dari visibilitas menu. Fix: route-guard terpusat.
6. **[HIGH] Tidak ada audit logging** (`audit_logs` belum ada, 0 `logAudit()`) — AGENTS wajibkan 19 event; compliance gap total. (TD-05)
7. **[MEDIUM→CRITICAL bila tercetak] Nama legal entitas beda antara docs (Jago Custom/Stuja Orbit) vs kode (Jaya Cargo/Samudra Optima)** — risiko di dokumen customer-facing. Fix: satukan nama resmi.
8. **[MEDIUM] Security Policy = localStorage, tak ditegakkan** + **Integrations menyimpan credential plaintext di localStorage** (TD-36) — pengaturan keamanan ilusi + kebocoran rahasia. Fix: pindah ke secret store server-side; tegakkan policy server-side.
9. **[MEDIUM] Default-allow `canSeeMenuItem`** — `Products` world-visible sekarang; jebakan saat Finance/Procurement jadi nyata. Fix: default-deny.
10. **[MEDIUM] Alur Sales putus di Quotation → SO/Job/Invoice** — revenue & operasional inti belum tersambung; navigasi penuh ComingSoon menutupi gap ini.

---

## 7. REKOMENDASI ROADMAP TEKNIS

> Prinsip: jangan big-bang (AGENTS). Stabilkan fondasi & tutup lubang keamanan dulu, baru lengkapi alur bisnis inti, baru ekspansi.

### FASE 1 (0–3 bulan) — Hardening fondasi + tutup lubang yang sudah terlihat
1. **Perbaiki bug akut:** Add Asset simulasi → insert nyata (#1); gate `SalesOrderDetailPage:1112` (#2).
2. **Satukan taksonomi role** (#3): satu sumber role kanonik, reconcile `ERP_ROLE_PRIORITY` ↔ RLS functions ↔ role-array menu ↔ roster; hapus `super`/`logistic`/`supervisor`/`sales_head` yang liar (atau resmikan kalau memang dibutuhkan).
3. **Lanjutkan migrasi RLS (TD-01)** agar selaras dengan menu yang ditampilkan (manager/ceo/gm).
4. **Route-guard terpusat** (#5) + ubah `canSeeMenuItem` jadi default-deny (#9).
5. **Audit logging (TD-05):** buat tabel `audit_logs` + helper `logAudit()`, mulai dari 19 event wajib; sambungkan AuditLogPage ke `audit_logs`.
6. **Amankan settings:** Security Policy & Integrations pindah dari localStorage ke DB/secret-store + enforcement (#8); MFA untuk role sensitif.
7. **Samakan nama entitas** (#7).
8. **Tandai/null-kan menu ComingSoon** supaya UI jujur (badge "Soon"/disabled) (§2).

### FASE 2 (3–6 bulan) — Sambungkan alur bisnis inti (revenue path)
1. **Quotation → Sales Order/Job conversion** (tutup putusnya alur §5a).
2. **Job / Operation Management** (Freight FCL/LCL/Air + PPJK Impor/Ekspor) — inti MSI/JCI.
3. **Billing / Invoice** + dasar **AR/Collection** (mulai catat revenue).
4. **Approval Center runtime engine** (tabel sudah ada; bangun eksekutornya, dipakai HRGA + Quotation discount + PR/PO).
5. **Procurement (PR/PO) + Vendor Management** (tabel `vendors` sudah ada).
6. **Pecah `App.jsx`** + adopsi react-router bertahap (prasyarat: ada test — TD-07).

### FASE 3 (6–12 bulan) — Ekspansi & governance lanjutan
1. AP / Vendor Invoice, Cash/Bank, Accounting/GL (general ledger).
2. IT Service Management (ticketing).
3. Document Management.
4. Reporting & Dashboard eksekutif (gunakan materialized views / aggregate — performance-baseline).
5. Customer/Vendor Portal + Public Tracking API (DTO masking, rate limit).
6. Performance & Cache layer; Sentry/monitoring (TD-08); CI pipeline (TD-29).

---

## CATATAN METODOLOGI & KETERBATASAN AUDIT

- Verdict modul diverifikasi via grep langsung; tetap ada **2 item bertanda "PERLU VERIFIKASI"** (`BuatRequestPage` submit, `InputSPPage` submit, `OrgStructurePage` route) yang sebaiknya dicek manual sebelum dijadikan keputusan.
- `audit_logs` disimpulkan belum ada berdasarkan `AuditLogPage` membaca `user_login_logs` + catatan TD-05; konsisten dengan dokumen.
- Daftar role kanonik diambil dari `ERP_ROLE_PRIORITY` (`AuthContext.jsx`) karena `INSERT INTO roles` tidak ada di `schema_snapshot.sql` (role di-seed di luar snapshot).
- Audit ini READ-ONLY: tidak ada file/DB/kode yang diubah selain pembuatan `AUDIT.md` ini.

---
---

# AUDIT — Investigasi 5 Temuan (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah bagian ini ke `AUDIT.md` (bagian audit 24 Jun di atas dipertahankan utuh).
> **Referensi DB:** `supabase/schema_snapshot.sql` (sumber kebenaran), bukan `migrations/`.
> **Scope:** 5 investigasi spesifik (komoditi prospek · batalkan visit sales · text kepotong quotation · konsep tier · payment terms/CBD).

## RINGKASAN

1. **Komoditi hilang di Detail Prospek** — **ROOT CAUSE DITEMUKAN, ada bug data-loss lebih parah dari gejala.** Dua akar bertumpuk di `ProspectFormPage`: (a) form di-feed baris **tipis** dari `ProspectListPage` (8 kolom, tanpa `bant_*`), dan (b) input BANT kualitatif (komoditi/origin/destination/dll) **tak dirender lagi** sejak redesign 2.11W. Akibat: komoditi tak tampil **dan** — kritis — edit prospek dari daftar lalu Simpan **menimpa ~22 kolom jadi kosong** (komoditi, phone, email, address, notes, payment terms, seluruh BANT). Drawer Pipeline Kanban & CustomerDetailPage menampilkan komoditi benar (fetch lengkap).
2. **Error "Batalkan Visit" role sales** — **ROOT CAUSE: gate frontend, BUKAN RLS.** `canCancel` (`CRMDashboardPage.jsx:1719`) tak memuat `sales`/`operations`/`supervisor`; klik tahap "Dibatalkan" → toast error "Hanya Manager ke atas…". RLS `activities` UPDATE **justru mengizinkan** pemilik (`assigned_to`/`created_by = auth.uid()`) — FE lebih ketat dari DB.
3. **Text kepotong di Quotation** — **Tidak ada hard-truncation** (tidak ada `ellipsis`/`line-clamp`/`overflow:hidden`+height). Preview & PDF **wrap**. Titik "kepotong" nyata: input **Description** form = `<input>` 1 baris (clip visual); angka besar di Total/summary PDF lebar-tetap (wrap janggal); sel label `nowrap` (minor). Inventaris lengkap di bawah.
4. **Konsep "Tier"** — **ADA.** `accounts.tier varchar(20)` (`schema:664`), nilai UI **A/B/C** (`CustomerListPage.jsx:41`). **Penanda asal Odoo: TIDAK ADA** — tak ada `is_migrated`/origin-system di `accounts`; `source` hanya origin lead.
5. **Payment Terms & CBD** — sumber = `accounts.payment_terms_id` (FK→`payment_terms`), nama via embed `payment_term:payment_terms!...(name)` (`CustomerDetailPage.jsx:445`). **Nilai CBD tak terkonfirmasi di snapshot** (schema-only tanpa data seed); `'CBD'` di kode hanya opsi hardcode `TOPRequestModal`. Tombol "Ajukan TOP Request" = `CustomerDetailPage.jsx:692`, **tanpa syarat apa pun**.

## INVESTIGASI 1 — Komoditi (dan field lain) hilang di Detail Prospek

**Data DB:** `accounts.bant_commodity` (text) + kerabat — `schema_snapshot.sql:654-660` (`bant_commodity/origin/destination/frequency/current_vendor/payment/decision_maker`). Komoditi = **`bant_commodity`** (BUKAN `commodity`; `commodity` milik tabel `inquiries` `:2425`).

**Permukaan detail prospek (inventaris):**
| Permukaan | Fetch komoditi? | Render? | Status |
|---|---|---|---|
| Pipeline Kanban drawer (`PipelineKanbanPage.jsx:398-404`) | Ya — select `:585` | Ya | ✅ benar |
| CustomerDetailPage tab BANT (`:809-816`) | Ya — `select('*')` `:441-448` | Ya (label "Komoditi" `:124`) | ✅ benar |
| **ProspectFormPage** (form create/edit) | **Tidak** | **Tidak (input dihapus)** | ❌ bug |

**Root cause (2 lapis):**
- **Lapis A — baris tipis, tanpa re-fetch:** `ProspectListPage.jsx:109-113` select hanya `id,name,legal_name,customer_type,source,pic_name,pipeline_stage,created_at,assigned_profile` → diteruskan `:247 onEditProspect(p)` → `App.jsx:2625` → `App.jsx:2635 prospect={editingProspect}`. `ProspectFormPage.jsx:71` pakai prop; `:109-131` isi `form` **hanya dari prop** (`:112 bant_commodity: prospect.bant_commodity || ''` → `''`). Tak ada self-fetch baris penuh (kecuali fallback `assigned_to` `:138-150`).
- **Lapis B — input tak dirender:** `ProspectFormPage.jsx:86` komentar *"…tak dirender lagi"*; section BANT `:385-405` hanya 4 kartu dimensi baru (`BANT_DIMENSIONS`), tanpa input kualitatif.

**Konsekuensi (lebih parah dari gejala):** `:221-232` `payload = { ...form, ... }` → **`UPDATE accounts`** (`:228`). `form` di-set utuh `:121-129`, jadi payload **menulis** kolom-kolom ini; saat edit-dari-daftar nilainya `''`/`0` → **menimpa data lama**:
- Ter-WIPE: `company_prefix, pic_phone, pic_email, phone, email, address, city, notes, payment_terms_id, won_reason, lost_reason, bant_commodity, bant_origin, bant_destination, bant_frequency, bant_current_vendor, bant_payment, bant_decision_maker, bant_budget, bant_authority, bant_need, bant_timeline, bant_score`.
- Ter-preserve: `name, legal_name, customer_type, source, pic_name, pipeline_stage`; `assigned_to` diselamatkan fallback `:138-150`.

**Severity:** **CRITICAL** (potensi silent data-loss multi-field pada edit normal; melanggar prinsip soft-delete/jangan hilangkan data). Gejala visual komoditi = HIGH.

**Rekomendasi (jangan dieksekusi):** (1) `ProspectFormPage` saat `isEdit` **self-fetch baris penuh** by id (pola `PipelineKanbanPage.jsx:585`) sebelum isi `form`; (2) atau lengkapi select `ProspectListPage`; (3) susun `payload` hanya dari field yang dirender / diff terhadap baris asli; (4) putuskan nasib BANT kualitatif — kembalikan ke render, atau keluarkan dari payload agar tak ter-wipe.

## INVESTIGASI 2 — Error "Batalkan Visit" untuk role 'sales'

**Handler & DB:** `CRMDashboardPage.jsx` → `AddVisitModal` (`:1076`), tahap via `VisitStepper` (`:1128-1137`); simpan `handleSaveVisit` (`:2063-2131`) → `UPDATE`/`INSERT` ke **`activities`** (`:2098`/`:2100`), status map `cancelled→'cancelled'` (`:2082`), log ke `activity_logs` (`:2113-2119`). Jalur kedua (di luar kalender): `ActivitiesPage.jsx:739` `.update({status:'cancelled'})`.

**Root cause — gate frontend, BUKAN RLS:** `:1719 canCancel = ['super_admin','admin','ceo','gm','manager'].includes(erpRole)`. `:1131-1133` bila tahap `cancelled` & `!canCancel` → `onCancelBlocked()` + return. `:2241 onCancelBlocked` → `showToast('Hanya Manager ke atas…','error')` = "error" yang dilihat sales. Untuk `sales`/`operations`/`supervisor`, `canCancel=false`.

**Kenapa role lain aman:** manager+ lolos gate FE lalu lolos RLS via `is_manager_or_above()`.

**Apakah batasan DB? TIDAK.** RLS `activities_update` (`schema_snapshot.sql:7794`): `USING ((company_id=get_user_company_id()) AND (is_manager_or_above() OR assigned_to=auth.uid() OR created_by=auth.uid())) OR is_super_admin()`. Pemilik visit **boleh** update→cancel. Jadi RLS benar & permisif; FE lebih ketat. Bukan "policy hilang", bukan "new row violates", bukan 0-row diam-diam — ini **toast error sengaja dipicu FE**. `activity_logs` insert juga permisif (`:7816-7818`).

**Inkonsistensi:** `is_manager_or_above()` (`:388-400`) memuat `supervisor`, tapi `canCancel` (`:1719`) tidak → supervisor ikut terblok di FE meski DB izinkan.

**Severity:** **MEDIUM** (fungsional; bukan kebocoran keamanan). Bila kebijakan bisnis = "hanya manager boleh batal", maka ini bukan bug melainkan pesan membingungkan (lihat Catatan Terbuka).

**Rekomendasi (jangan dieksekusi):** bila sales boleh batal visit sendiri → longgarkan gate FE: `canCancel = isManagerPlus || visit.assigned_to===profile.id || visit.created_by===profile.id` (**RLS tak perlu diubah**). Bila memang manager-only → ubah toast `error`→`info` teks netral + disable tahap "Dibatalkan" untuk role tak berwenang. Selaraskan `canCancel` dgn `is_manager_or_above()` (+`supervisor`).

## INVESTIGASI 3 — Text kepotong di Quotation (inventaris)

**Umum:** Tidak ada `ellipsis`/`-webkit-line-clamp`/`overflow:hidden`+tinggi-tetap di ketiga file. Preview HTML & PDF **wrap** → output customer-facing tidak terpotong keras. Titik yang bisa terlihat clip/wrap-janggal:

**A. QuotationFormPage.jsx (input):**
- (1) **Description = `<input>` 1 baris** `:337-350` (`ProductDescInput` `:168,:222-228`, style `cellInp` `:282-286 height:34`, sel `minWidth:160 :337`). Deskripsi panjang ter-clip di input (scroll-able). **MEDIUM.** Fix: `<textarea>` auto-grow / tooltip / perlebar.
- (2) Sel Total `whiteSpace:'nowrap'`,`width:120` `:394` + sub-baris kurs `:396-399` → angka besar lewat 120px (parent `overflowX:auto :319`). **LOW.**
- (3) Header `nowrap` `:323-330` — wajar; tabel scroll. **LOW.**

**B. QuotationDetailPage.jsx (preview):**
- (4) `labelCell nowrap width:80px` `:569` — label panjang ("APPROVAL DATE") sedikit melebihi sel (tanpa hidden → memuai, bukan clip). **LOW.**
- (5) Kolom DESCRIPTION tanpa width & tanpa nowrap (`:613,:624`) → **wrap, aman.** Kolom lain lebar tetap (`:614-618`). **LOW.**

**C. QuotationPDF.jsx (@react-pdf):**
- (6) Kolom % `cDesc 35%…cTotal 21%` (`:58-63`) — Description **wrap** default. **LOW.**
- (7) `wrap={false}` tiap baris (`:224`,header`:210`,total`:237`,summary`:245`) — cegah pecah antar-halaman; risiko tepi: deskripsi super-panjang bikin baris > tinggi halaman → ter-cut. **LOW.** Fix: lepas `wrap={false}` pada baris data berisiko.
- (8) `summaryTable width:250` (`:67`) + `grandVal fontSize:12` bold (`:73`), `space-between` (`:71`) → grand total belasan digit bisa wrap/berhimpit label. **MEDIUM.** Fix: perlebar/ kecilkan font/ kolom nilai eksplisit.
- (9) `cTotal 21%` "Rp …" 8pt + newline "× kurs" (`:230-232`) — umumnya muat. **LOW.**
- (10) Lebar % total 100% + border 0.5/sel (`:54-55`) → drift kecil kolom akhir. **LOW.**

**Severity keseluruhan:** **LOW–MEDIUM.** Kandidat utama yang dirasakan sales: input Description 1 baris (1) & summary PDF angka besar (8). *Batasan: analisis statik; perlu verifikasi runtime dgn data ekstrem.*

## INVESTIGASI 4 — Konsep "Tier" Customer

**(a) Tier — ADA.** DB: `accounts.tier character varying(20)` (`schema:664`; juga `customers.tier :1738`) — **tanpa CHECK constraint**. Kode/UI nilai **A/B/C**: `CustomerListPage.jsx:41 TIERS=['A','B','C']`; `TIER_CFG :80-82`; badge `:158-160,:206`; filter `:582,:656-657`; stat `:597,:641`; form select `:435-437`; tulis DB `:338`. `CustomerDetailPage.jsx:593 tierCfg` (default `B` bila tak dikenali), badge `:637,:713`. Terdaftar di `STANDARD_COLUMNS.accounts` (`useCustomFields.js:33`).

**(b) Penanda asal Odoo — TIDAK ADA.** `accounts` (`schema:619-686`) tak punya `is_migrated`/`migrated_from`/`origin`/`external_source` (`migrated_from` hanya di `activities :713`). `accounts.source` (`:634`,CHECK `:685`) = origin **lead** (sales_visit/cold_call/referral/…), bukan penanda sistem. `owner_company_id`(`:663`)/`source_company_id`(customers `:1740`) = asal **entitas**, bukan Odoo. Tak ada `odoo`/`backfill` di `src/`/schema. **Kesimpulan: belum ada kolom pembeda customer migrasi-Odoo vs baru → perlu desain baru (schema change, butuh approval).**

## INVESTIGASI 5 — Payment Terms & nilai "CBD"

**Kolom:** master `payment_terms` (`code varchar(20) NOT NULL`, `name varchar(100) NOT NULL`, `days_due int`, `is_active`, `deleted_at`). Pada customer: `accounts.payment_terms_id uuid` (FK constraint `prospects_payment_terms_id_fkey` `schema:7329-7330`). FE baca: `CustomerDetailPage.jsx:445` embed `payment_term:payment_terms!...(name)` — **hanya `name`**; tampil `:643`.

**Nilai CBD:** **tak terkonfirmasi dari snapshot** (schema-only tanpa data seed; `'CBD'` nihil di schema). String `'CBD'` di kode = opsi form, bukan FK: `TOPRequestModal.jsx:17 TOP_OPTIONS=['CBD','TOP 7',…]`; `bant.js:78 'Cash Before Delivery (CBD)'`. Format penyimpanan CBD di `payment_terms` (code/name/days_due) **perlu dicek langsung di DB**.

**Tombol TOP Request:** `CustomerDetailPage.jsx:692` `onClick={()=>setTopOpen(true)}` (header actions `:691-695`; modal `:932-934`) — **tanpa guard payment-term.**

**Severity:** **LOW** (enabler desain, bukan bug).

**Rekomendasi (jangan dieksekusi):** (1) konfirmasi nilai kanonik CBD di `payment_terms` (pakai `code`, lebih stabil dari `name`); (2) tambah `code` ke embed `:445`; (3) bungkus tombol `:692` dgn `customer.payment_term?.code !== 'CBD'` (case-insensitive; default tampil bila null); (4) selaraskan dgn aturan bisnis (CBD=bayar di muka→tak perlu TOP).

## CATATAN TERBUKA (perlu keputusan Den)

1. **[INV2 kebijakan]** Apakah `sales` SEHARUSNYA boleh membatalkan visit miliknya? RLS sudah izinkan pemilik; yang memblok hanya gate FE `:1719`. Jawaban menentukan "perbaiki FE" vs "perhalus pesan". Pertimbangkan `supervisor`/`operations` yang sama terblok meski `is_manager_or_above()` memuat `supervisor`.
2. **[INV1 keparahan]** Konfirmasi: edit prospek dilakukan **dari daftar** (`ProspectListPage`)? Bila ya, bug data-loss ~22 kolom aktif & berdampak luas (prioritas tinggi), bukan sekadar komoditi tak tampil.
3. **[INV1 produk]** Apakah BANT kualitatif (komoditi/origin/dll) sengaja dipensiunkan dari form? Bila masih dipakai → kembalikan render; bila tidak → keluarkan dari payload agar tak menimpa data.
4. **[INV3 runtime]** Inventaris truncation = analisis statik; perlu contoh nyata (deskripsi/alamat sangat panjang + total belasan digit) untuk prioritas.
5. **[INV4 desain]** Penanda asal Odoo belum ada → fitur "handover hanya customer baru / naik tier" butuh kolom baru + backfill (schema change, approval). Apakah "customer baru" cukup via ambang `became_customer_at`/`created_at`, atau wajib penanda eksplisit?
6. **[INV5 data]** Nilai persis CBD di `payment_terms` tak ada di snapshot → cek langsung DB sebelum kode guard tombol.
7. **[Umum]** `schema_snapshot.sql` memuat **83** `CREATE TABLE`, sedangkan `CLAUDE.md` menyebut "73 tabel" — dokumentasi tertinggal dari snapshot (pengamatan, di luar scope 5 investigasi).

---

## INVESTIGASI 6 — Inventaris kolom BANT lama (text/kualitatif) di `accounts`

> **Mode:** AUDIT read-only. Lanjutan investigasi 30 Jun. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `supabase/schema_snapshot.sql:619-686` (DDL `accounts`), `ProspectFormPage.jsx`, `PipelineKanbanPage.jsx`, `CustomerDetailPage.jsx`, `useCustomFields.js`, `bant.js`.
> **Tujuan:** inventaris akurat sebelum memindah kolom BANT lama (kualitatif) jadi section "Informasi Tambahan" (nama kolom TETAP).

### 1. Tabel inventaris lengkap

Semua kolom `accounts` ber-prefix `bant_` (12 kolom). "DB line" merujuk `schema_snapshot.sql`. Semua kolom **nullable** (tak ada `NOT NULL`).

| Kolom | Tipe DB | Nullable / Default | Skema | Input di ProspectFormPage? | Tampil di permukaan lain |
|---|---|---|---|---|---|
| `bant_budget` | `smallint` | nullable / `DEFAULT 0` (`:671`) | **BARU** (dimensi) | **Ya** — `BantCard` via `BANT_DIMENSIONS.map` `ProspectFormPage.jsx:395-396` | PipelineKanban: tidak ditampilkan per-dimensi (hanya di-`select` `:585` utk `calcBantScore`). CustomerDetail: tidak (BANT_FIELD_DEFS tak memuat dimensi) |
| `bant_authority` | `smallint` | nullable / `DEFAULT 0` (`:672`) | **BARU** (dimensi) | **Ya** — `:395-396` | sama spt `bant_budget` |
| `bant_need` | `smallint` | nullable / `DEFAULT 0` (`:673`) | **BARU** (dimensi) | **Ya** — `:395-396` | sama spt `bant_budget` |
| `bant_timeline` | `smallint` | nullable / `DEFAULT 0` (`:674`) | **BARU** (dimensi) | **Ya** — `:395-396` | sama spt `bant_budget` |
| `bant_score` | `integer` | nullable / `DEFAULT 0` (`:661`) | **Derivatif** (dipakai lama & baru; ditulis `calcBantScore`) | **Tidak diinput** — hanya ditampilkan via `BantScoreBar` `ProspectFormPage.jsx:393` (dihitung dari 4 dimensi `:128,:187`) | PipelineKanban `BantScoreBar` `:396`; CustomerDetail `BantScoreBar` `:801` |
| `bant_commodity` | `text` | nullable / tanpa default (`:654`) | **LAMA** (kualitatif) | **Tidak** — hanya state `:87`/populate `:112`, tak ada JSX input | PipelineKanban drawer `:398` (label "Komoditi / Barang"); CustomerDetail BANT tab `:124,:809` (label "Komoditi") |
| `bant_origin` | `text` | nullable / tanpa default (`:655`) | **LAMA** (kualitatif) | **Tidak** — state `:87`/populate `:112` | PipelineKanban `:399` ("Kota/Port Asal (POL)"); CustomerDetail `:125,:809` ("Asal") |
| `bant_destination` | `text` | nullable / tanpa default (`:656`) | **LAMA** (kualitatif) | **Tidak** — state `:87`/populate `:113` | PipelineKanban `:400` ("Kota/Port Tujuan (POD)"); CustomerDetail `:126,:809` ("Tujuan") |
| `bant_frequency` | `text` | nullable / tanpa default (`:657`) | **LAMA** (kualitatif) | **Tidak** — state `:87`/populate `:113` | PipelineKanban `:401` ("Frekuensi Pengiriman"); CustomerDetail `:127,:809` ("Frekuensi") |
| `bant_current_vendor` | `text` | nullable / tanpa default (`:658`) | **LAMA** (kualitatif) | **Tidak** — state `:88`/populate `:114` | PipelineKanban `:402` ("Vendor / Forwarder Saat Ini"); CustomerDetail `:128,:809` ("Vendor Saat Ini") |
| `bant_payment` | `text` | nullable / tanpa default (`:659`) | **LAMA** (kualitatif) | **Tidak** — state `:88`/populate `:114` | PipelineKanban `:403` ("Preferensi Payment"); CustomerDetail `:129,:809` ("Payment") |
| `bant_decision_maker` | `text` | nullable / tanpa default (`:660`) | **LAMA** (kualitatif) | **Tidak** — state `:88`/populate `:115` | PipelineKanban `:404` ("Decision Maker"); CustomerDetail `:130,:809` ("Decision Maker") |

**Catatan akurasi:**
- Sumber data ketiga permukaan: ProspectForm dapat baris dari prop (lihat INV1 — baris tipis dari `ProspectListPage`). PipelineKanban `select` lengkap `PipelineKanbanPage.jsx:585`. CustomerDetail `select('*')` `CustomerDetailPage.jsx:441-448`.
- 7 kolom LAMA: **tidak ada satupun input di ProspectFormPage saat ini** — section BANT `ProspectFormPage.jsx:385-400` hanya merender `BantScoreBar` + 4 `BantCard` (dimensi baru). Inilah sebab "komoditi hilang" (INV1).
- **Tidak ada kolom `bant_volume`** di `accounts`. Contoh "volume" di brief tidak punya kolom BANT; data volume kargo ada di tabel **`inquiries`** (`volume_cbm`, `estimated_volume`), bukan `accounts`.

### 2. Pengelompokan: "Informasi Tambahan" vs kandidat drop

**Layak jadi "Informasi Tambahan" (semua 7 kolom LAMA punya nilai informasi kargo/prospect):**

| Kolom | Nilai informasi | Pendapat |
|---|---|---|
| `bant_commodity` | Jenis komoditi/barang yang dikirim | **Berguna** — inti profil kargo prospect. Pertahankan. |
| `bant_origin` | Kota/port asal (POL) | **Berguna** — rute. Pertahankan. |
| `bant_destination` | Kota/port tujuan (POD) | **Berguna** — rute. Pertahankan. |
| `bant_frequency` | Frekuensi pengiriman | **Berguna** — potensi volume bisnis. Pertahankan. |
| `bant_current_vendor` | Vendor/forwarder incumbent | **Berguna** — intel kompetitif. Pertahankan. |
| `bant_payment` | Preferensi term pembayaran | **Berguna**, tapi overlap konsep dengan `payment_terms_id` (FK real). Lihat Catatan Terbuka. |
| `bant_decision_maker` | Nama/jabatan pengambil keputusan | **Berguna** — sales intel. Pertahankan. |

**Kandidat drop (sisa scoring murni, tak berguna sebagai info):**
- **TIDAK ADA** di antara 7 kolom kualitatif — semuanya menyimpan informasi, bukan angka skor.
- Satu-satunya artefak skor adalah `bant_score` (integer agregat), tetapi **masih aktif** (ditulis ulang oleh `calcBantScore` dari 4 dimensi baru — `ProspectFormPage.jsx:128,:187`). **Bukan kandidat drop**, hanya perlu disadari overlap lama↔baru-nya.
- Sesuai instruksi: **tidak ada yang di-drop**; ini hanya klasifikasi.

### 3. Rekomendasi tipe input UI per kolom (rekomendasi saja)

Berdasarkan nama + tipe `text` + himpunan nilai yang terdeteksi di `bant.js` (opsi legacy dipertahankan: `BANT_FREQUENCY_OPTIONS` `bant.js:74-76`, `BANT_PAYMENT_OPTIONS` `bant.js:77-79`):

| Kolom | Tipe input disarankan | Alasan / dugaan himpunan nilai |
|---|---|---|
| `bant_commodity` | **Teks bebas** (input biasa) | Nama komoditi sangat bervariasi; tak ada himpunan terbatas. |
| `bant_origin` | **Teks bebas** (input biasa) | Kota/port; bisa di-upgrade ke autocomplete port nanti, tapi data eksisting free-text. |
| `bant_destination` | **Teks bebas** (input biasa) | Sama spt `bant_origin`. |
| `bant_frequency` | **Dropdown/select** | Himpunan jelas dari `BANT_FREQUENCY_OPTIONS`: `Rutin Mingguan`, `Rutin Bulanan`, `Per Kuartal`, `Tidak Menentu`, `Proyek` (+ kosong). Pertimbangkan opsi "Lainnya" / free-text fallback krn data lama mungkin di luar daftar. |
| `bant_current_vendor` | **Teks bebas** (input biasa) | Nama vendor/forwarder bebas. |
| `bant_payment` | **Dropdown/select** | Himpunan dari `BANT_PAYMENT_OPTIONS`: `Cash Before Delivery (CBD)`, `TOP 7/14/30/45/60` (+ kosong). Catatan: ini **preferensi**, beda dari `payment_terms_id` FK. |
| `bant_decision_maker` | **Teks bebas** (input biasa); **Textarea** bila ingin tampung nama+jabatan/banyak orang | Umumnya nama/jabatan singkat → input cukup; textarea opsional. |

> Semua kolom bertipe `text` (bukan numeric), jadi tidak ada rekomendasi input numeric. Untuk dropdown (`bant_frequency`, `bant_payment`), karena kolom DB free-`text` (tanpa CHECK constraint), **disarankan tetap izinkan nilai di luar daftar** (combobox/select-with-other) agar data lama hasil free-text tidak hilang/invalid.

### 4. Status pendaftaran di `STANDARD_COLUMNS.accounts` (`useCustomFields.js`)

**Semua 12 kolom BANT (lama + baru) SUDAH terdaftar** → tidak akan salah muncul sebagai "custom field":
- `bant_commodity, bant_origin, bant_destination, bant_frequency, bant_current_vendor, bant_payment, bant_decision_maker, bant_score` — `useCustomFields.js:29-30`.
- `bant_budget, bant_authority, bant_need, bant_timeline` — `useCustomFields.js:31`.

Konsekuensi: memindah 7 kolom LAMA ke section "Informasi Tambahan" **tidak** memerlukan perubahan `STANDARD_COLUMNS` — mereka sudah dikecualikan dari `CustomFieldsSection` (`ProspectFormPage.jsx:401-409`). Aman.

### 5. Catatan terbuka (INV6)

1. **Inkonsistensi label antar permukaan** — `bant_origin`/`bant_destination`: PipelineKanban pakai "Kota/Port Asal (POL)"/"Tujuan (POD)" (`PipelineKanbanPage.jsx:399-400`), CustomerDetail pakai "Asal"/"Tujuan" (`CustomerDetailPage.jsx:125-126`). Saat mendesain section "Informasi Tambahan", samakan label agar tak membingungkan.
2. **Overlap `bant_payment` vs `payment_terms_id`** — `bant_payment` (text, preferensi) berbeda dari `payment_terms_id` (uuid FK ke `payment_terms`, term aktual). Perlu keputusan Den: apakah keduanya tetap dipisah (preferensi vs disepakati) atau salah satu dikonsolidasi. **Jangan** gabungkan tanpa keputusan.
3. **Tidak ada `bant_volume`** — bila "Informasi Tambahan" diharapkan memuat volume kargo, kolomnya **belum ada** di `accounts` (volume ada di `inquiries`). Menambah kolom = schema change (butuh approval), di luar scope inventaris ini.
4. **`bant_score` overlap lama↔baru** — integer ini dipakai skema lama maupun baru (ditulis dari 4 dimensi). Bukan untuk dipindah ke "Informasi Tambahan"; tetap sebagai skor.
5. **Keterkaitan dengan INV1** — saat 7 kolom LAMA dipindah jadi input "Informasi Tambahan", sekaligus menutup gap INV1 (komoditi tak terlihat & ter-wipe). Tapi perbaikan inti INV1 (form jangan menimpa kolom yang tak diinput / self-fetch baris penuh) tetap diperlukan agar pemindahan tidak malah menulis nilai kosong untuk kolom lain.
