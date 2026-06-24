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
