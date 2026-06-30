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

---
---

# AUDIT — Persiapan PPN per-item Quotation + Kerapian payment_terms (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `supabase/schema_snapshot.sql`, `QuotationFormPage.jsx`, `QuotationDetailPage.jsx`, `QuotationPDF.jsx`, `CustomerDetailPage.jsx`, dll. Data DB (isi tabel) TIDAK di-query — query SELECT disediakan untuk Den jalankan manual.

## INVESTIGASI A — Kalkulasi Quotation (persiapan PPN per service/line item)

### A.1 — Struktur data line item & total

**`quotations`** (header) — kolom terkait harga (`schema_snapshot.sql:~636-666`):
- `subtotal numeric(15,2) DEFAULT 0`, `tax_amount numeric(15,2) DEFAULT 0`, `total_amount numeric(15,2) DEFAULT 0`
- `discount_pct numeric DEFAULT 0`, **`vat_rate numeric DEFAULT 0.011`** (PPN **level header**, satu rate utk seluruh quotation), `usd_rate numeric(15,2) DEFAULT 16000`, `currency_code`, `margin_floor`.

**`quotation_items`** (`schema_snapshot.sql:~688-705`):
- `qty numeric`, `unit_price numeric(15,2)`, `exchange_rate numeric(15,2) DEFAULT 1`, `total numeric(15,2)`, `cost_price numeric(15,2)`, `currency`, `unit_label`, `notes`, `group_name`, `sort_order`.
- **TIDAK ADA kolom pajak/PPN per item.** PPN saat ini **100% level header** (`quotations.vat_rate`), bukan per baris.

**Severity:** N/A (temuan struktur). **Rekomendasi (jangan eksekusi):**
- PPN per item butuh **kolom baru** di `quotation_items` (mis. `ppn_pct numeric(5,2) DEFAULT 0`). **Tidak ada kolom existing yang bisa di-reuse** (`notes` text bukan numerik; `vat_rate` ada di header saja).
- Checkbox "Cetak dengan PPN" butuh **flag header baru** (mis. `quotations.print_with_ppn boolean DEFAULT true`), atau diturunkan dari `vat_rate` (kurang eksplisit). Rekomendasi: kolom boolean baru.
- `vat_rate` header sebaiknya **dipertahankan** utk backward-compat quote lama (lihat A.5).

### A.2 — RPC `save_quotation` (`schema_snapshot.sql:433`)

- **UPDATE-only** — `WHERE id = p_quotation_id`; raise exception bila 0 row. **Jalur CREATE pakai INSERT langsung di FE** (bukan RPC) — `QuotationFormPage.jsx:837-838`.
- **Items: `DELETE FROM quotation_items WHERE quotation_id=…` lalu re-INSERT** (`save_quotation` body). Daftar kolom INSERT **HARDCODED 13 kolom**: `quotation_id, sort_order, description, qty, unit, unit_price, notes, group_name, currency, unit_label, exchange_rate, total, cost_price`. **Tidak ada ppn.**
- Header total: `subtotal/tax_amount/total_amount/vat_rate/discount_pct` **sudah dipetakan** via `COALESCE(NULLIF(p_header->>'x','')::numeric, x)` → aman (FE wajib pass nilainya; bila tidak, nilai lama dipertahankan).

**⚠️ RISIKO UTAMA (HIGH) — bukan COALESCE, tapi DELETE+reINSERT items:** Bila kolom `ppn_pct` ditambah ke `quotation_items` TAPI RPC `save_quotation` **tidak** diupdate, maka **setiap EDIT-save akan MENGHAPUS nilai ppn per item** (items di-DELETE total lalu di-INSERT ulang tanpa kolom ppn → balik ke DEFAULT 0). Ini lebih berbahaya dari COALESCE header karena tak ada proteksi keep-old — data hilang diam-diam. Sama persis pola insiden 2.11S (field header baru tak ke-map RPC → tak tersimpan saat edit), tapi utk items efeknya **wipe**.
- **Titik yang HARUS berubah** untuk PPN per item: (a) RPC `save_quotation` — tambah `ppn_pct` ke daftar kolom INSERT **dan** ke `SELECT NULLIF(it->>'ppn_pct','')::numeric`; (b) `quotations` header CASE/COALESCE — tambah `print_with_ppn`; (c) FE create insert (`:802-835`); (d) FE `baseItemRows()` (`:788`).

### A.3 — Kalkulasi di FE (`QuotationFormPage.jsx`)

- Per baris: **`calcRowTotal(row)`** (`:119`) → `row.total`.
- Section total: `sec.rows.reduce(... r.total)` (`:750`).
- **`subtotal`** = Σ section totals (`:753`).
- `discountPct` = `header.discount_pct` (`:754`); `discountAmount = round(subtotal*discountPct/100)` (`:755`).
- **`tax = round((subtotal − discountAmount) * (header.vat_rate))`** (`:756`) — **satu rate header diterapkan ke (subtotal−diskon)**.
- `grandTotal = (subtotal − discountAmount) + tax` (`:757`).
- Save: header bawa `subtotal`, `tax_amount: tax`, `total_amount: grandTotal`, `vat_rate`, `discount_pct` — di **dua** jalur: RPC `p_header` (`:829-836`) & create `insertPayload` (`:889-891`).
- **State header** (`:440-465`): `vat_rate`, `discount_pct`, dll — **TIDAK ada flag "cetak dengan PPN"** → perlu key baru.
- **Titik perubahan PPN per item:** `:756` (ganti single-rate → Σ per-item ppn), mungkin `calcRowTotal`/`:750` (akumulasi ppn per baris), `baseItemRows()` (`:788`, +ppn_pct), header state (+`print_with_ppn`).
- **Lokasi checkbox "Cetak dengan PPN":** card **"Header Quotation"** (`:974`), dekat dropdown VAT (`vatOptions.map` `:1057`) & field "Diskon (%)" (`:1024`). `handleServiceTypeChange` (`:696`) saat ini auto-set `vat_rate` per service-type (customs 11% / lainnya 1,1%) — perlu diselaraskan dengan model per-item.

### A.4 — Render preview & PDF

**`QuotationDetailPage.jsx`** — **DUA** tempat summary:
- **(i) Card summary on-screen (`:502-518`)** — **RECOMPUTE dari items** (`subtotal:229`, `discountAmount:231`, `effVat=quot.vat_rate??VAT_RATE :232`, `tax:233` single-rate, `grandTotal:234`). Label PPN single (`:512`).
- **(ii) Tabel preview ala-PDF (`:660-683`)** — **prefer nilai DB**: `quot.subtotal ?? subtotal` (`:668`), `quot.tax_amount ?? tax` (`:678`), `quot.total_amount ?? grandTotal` (`:683`).
- **Tabel item preview header (`:623-628`):** `DESCRIPTION · CUR · PRICE · UNIT · QTY · TOTAL (IDR)` — **tak ada kolom PPN** (titik tambah kolom).
- InfoRow `Payment Terms` (`:382`), `Diskon` (`:383`).

**`QuotationPDF.jsx`:**
- Totals (`:113-119`): `subtotal = quot.subtotal ?? subtotalCalc`, `tax = quot.tax_amount ?? compute`, `grandTotal = quot.total_amount ?? compute` → **prefer DB, fallback compute**. `effVat` single (`:117`).
- Tabel item header (`:210-215`): `DESCRIPTION · CUR · PRICE · UNIT · QTY · TOTAL` — tak ada kolom PPN. Rows `:220-225`; section total `:232-234`.
- Summary (`:244-260`): Subtotal / Diskon / **PPN single (`:254`)** / GRAND TOTAL.
- **Notes:** `noteBox` (`:267`, `quot.notes`) & `termsBox` (`:275`, `quot.terms`) → tempat menaruh **"Harga belum termasuk PPN"** saat checkbox OFF.

### A.5 — Risiko & catatan

- **Quote existing terdampak?** Quote lama menyimpan `subtotal/tax_amount/total_amount` berbasis `vat_rate` header. Render PDF/preview-table **baca nilai DB tersimpan** (prefer `quot.*`) → quote lama **tetap tampil benar** tanpa diubah. **TAPI** begitu quote lama **di-edit & disimpan ulang** dengan logika per-item baru, total dihitung ulang → bila `ppn_pct` per item kosong (null→0) sedangkan dulu pakai header 1,1%, **PPN bisa jadi 0** (regresi nilai). → **Perlu fallback**: saat load quote lama tanpa ppn per item, isi `ppn_pct` default dari `vat_rate` header, atau pertahankan `vat_rate` sebagai sumber bila item ppn semua null. **Severity: HIGH** (konsistensi data lama).
- **PDF/preview baca dari DB atau hitung ulang?** **Campur:** card on-screen (i) **hitung ulang**; tabel preview (ii) + PDF **prefer DB** (fallback hitung). → Perubahan PPN **wajib konsisten di 3 layer: FE-calc + RPC-store + render**. Kalau FE ganti rumus tapi RPC tak simpan `tax_amount` per-item-aware → card on-screen (hitung) ≠ PDF (baca DB) → angka beda. **Severity: HIGH.**
- **Trigger `sync_deal_value_on_quotation_accept` (`schema_snapshot.sql:552`, trigger `trg_z_… :5945`):** `AFTER UPDATE`, saat `status` jadi `'ACCEPTED'` → `UPDATE accounts SET estimated_value = NEW.total_amount` (via prospect_id, fallback customer_id). **Membaca `total_amount` tersimpan.** Selama `total_amount` tetap = grand total (incl PPN), **struktur tak rusak** — hanya nilainya yang ikut PPN (sudah begitu sekarang krn header PPN). **Tidak terdampak struktur** oleh per-item PPN. Catatan: trigger hanya fire pada `status='ACCEPTED'` (FE saat ini set `DRAFT/SUBMITTED/SENT` — apakah `ACCEPTED` pernah di-set adalah pertanyaan terpisah, di luar scope). **Severity: LOW.**

### A.6 — Ringkasan titik yang harus diubah untuk PPN per item
| Layer | File:line | Perubahan |
|---|---|---|
| DB (rekomendasi, butuh approval) | `quotation_items` | +`ppn_pct numeric(5,2) DEFAULT 0` |
| DB (rekomendasi) | `quotations` | +`print_with_ppn boolean DEFAULT true` |
| RPC | `save_quotation` (`:433`) | +`ppn_pct` di INSERT kolom & SELECT; +`print_with_ppn` di header CASE |
| FE calc | `QuotationFormPage.jsx:756` (+`:750/:119/:788`) | tax = Σ per-item ppn; baseItemRows +ppn_pct; header state +flag |
| FE create | `QuotationFormPage.jsx:802-835` | insert item +ppn_pct; header +print_with_ppn |
| FE UI | `QuotationFormPage.jsx:974/1024/1057` | checkbox "Cetak dengan PPN" + kolom PPN per baris di tabel item |
| Preview | `QuotationDetailPage.jsx:502-518, 623-683` | kolom PPN di tabel + summary (2 tempat) + note saat OFF |
| PDF | `QuotationPDF.jsx:210-260, 267` | kolom PPN + summary + noteBox "belum termasuk PPN" |

## INVESTIGASI B — Pemakaian & kerapian `payment_terms`

### B.1 — Struktur & relasi

**`payment_terms`** (`schema_snapshot.sql:2653`): `id uuid`, **`company_id uuid NOT NULL`**, `code varchar(20) NOT NULL`, `name varchar(100) NOT NULL`, `days_due integer DEFAULT 0`, `description`, `is_active`, `deleted_at`. Unique **`payment_terms_company_code_unique`** = `(company_id, code)` (`:4299`). Index `idx_payment_terms_company_id`.
- **Duplikat 3× = BY DESIGN (company-scoped).** Tiap entitas (MSI/JCI/SOA) punya set sendiri; unik per `(company_id, code)`. Comment tabel: "Company-scoped payment term templates" (`:2673`).

**FK yang menunjuk `payment_terms.id` (4 tabel)** — semua **TANPA `ON DELETE` → default RESTRICT**:
- `customers.payment_terms_id` (`:6519`)
- `accounts.payment_terms_id` (constraint **`prospects_payment_terms_id_fkey`** `:7359`)
- `quotations.payment_terms_id` (`:7415`)
- `vendors.payment_terms_id` (`:7783`)
→ Baris `payment_terms` yang masih direferensikan **tak bisa di-DELETE** (RESTRICT) tanpa repoint FK dulu.

### B.2 — Pemakaian di code (by-NAME vs by-ID)

**By-ID (FK — sensitif ke MERGE/DELETE id):** semua dropdown simpan `value={t.id}`:
- `ProspectFormPage.jsx:375` (select `value=t.id`), save `:223`; fetch `:164`.
- `CustomerListPage.jsx:449` (form select), fetch `:283`, save `:332`.
- `QuotationFormPage.jsx:1045-1047` (`value={t.id}`), save `:824` & `:883`, fetch `:531`.
- `CustomerMasterPage.legacy.jsx:562` (`value=t.id`), save `:433`.
- `PipelineKanbanPage.jsx:408` menampilkan `raw.payment_terms_id` mentah (id).

**By-NAME (sensitif ke RENAME):**
- **🔴 `CustomerDetailPage.jsx:33-40` `TEMPO_TERMS`/`isTempoTerm` + dipakai `:706`** — **LOGIKA gate tombol "Ajukan TOP Request" cocok NAMA persis** (5 nilai: `Net 15/30/45/60 Days`, `Top Net 7 hari`). **RENAME salah satu nama → gate meleset** (tombol hilang/muncul keliru). **Satu-satunya tempat NAMA dipakai untuk LOGIKA.**
- Handover modals simpan **`value={t.name}`** ke kolom **TEXT** `deal_handovers.payment_terms` (snapshot, bukan FK): `LightHandoverModal.jsx:113`, `StrategicHandoverModal.jsx:168`. Rename → pilihan baru pakai nama baru; data lama (string tersimpan) tak berubah.
- **Display-only by name** (rename hanya ubah teks tampil, aman): `CustomerListPage.jsx:208/512`, `CustomerDetailPage.jsx:657`, `QuotationDetailPage.jsx:382` (fetch `name` by id `:191`), `CustomerMasterPage.legacy.jsx:280`.
- `usePaymentTerms.js` — hook fetch, **order by `days_due` asc** ("COD first, longest last") → menandakan `days_due` membedakan tempo (besar) vs non-tempo (0).

### B.3 — Analisis risiko per opsi rapikan

**Opsi 1 — RENAME (samakan bahasa/kapitalisasi):**
- **RUSAK:** `isTempoTerm` (`CustomerDetailPage.jsx:40`) cocok nama persis → rename `"Net 30 Days"`→`"Net 30 hari"` membuat gate TOP Request **meleset** (customer tempo dianggap non-tempo → tombol hilang). **Severity: HIGH.**
- Handover modal: selection baru simpan nama baru (inkonsistensi string historis di `deal_handovers.payment_terms`). **Severity: LOW.**
- Display-only spots: aman.
- **Mitigasi wajib bila rename:** ubah `isTempoTerm` agar **tidak** bergantung nama (lihat B.4).

**Opsi 2 — MERGE duplikat (3 entitas → 1 id):**
- **SALAH SECARA DESAIN** — `payment_terms` company-scoped (unik `(company_id, code)`); tiap entitas butuh id sendiri. Merge lintas-entitas melanggar model multi-entity.
- **FK RESTRICT** → id yang masih dipakai customer/account/quotation/vendor **tak bisa dihapus** tanpa repoint semua FK dulu. Repoint lintas-entitas = data customer MSI menunjuk term JCI → **salah**.
- **Severity: HIGH (jangan lakukan).** Duplikat 3× memang disengaja.

**Opsi 3 — Biarkan data + perbaiki di layer tampilan / normalisasi non-destruktif:**
- Tambah kolom kategori/normalisasi (mis. `is_tempo boolean` atau andalkan `days_due`) **tanpa** mengubah nama/id existing → tak ada FK/by-name yang rusak. **Severity: LOW (paling aman).**

### B.4 — Rekomendasi tegas

1. **JANGAN MERGE** — duplikat per-entitas disengaja (company-scoped). Merge = bug multi-entity + terhalang FK RESTRICT.
2. **Hindari rename "buta".** Bila tetap mau standardisasi nama, **ubah dulu `isTempoTerm` agar gate berbasis `days_due > 0`** (bukan whitelist nama), supaya tahan rename. Ini perubahan FE kecil **tapi** perlu `days_due` ikut di-fetch di `CustomerDetailPage` select (saat ini hanya embed `name` — `:459`). **Verifikasi dulu** `days_due` benar membedakan tempo vs non-tempo (khususnya "50% Uang Muka" — lihat query Q3).
3. **Paling aman:** biarkan id & struktur; rapikan **hanya display** (mis. mapping label di FE) bila perlu konsistensi visual; ATAU rename **per-entitas serentak** + migrasi `isTempoTerm`→`days_due` di PR yang sama.
4. Semua op集 destruktif (rename/merge) = perubahan DB → butuh approval + jalankan query B.5 dulu.

### B.5 — Query SELECT untuk Den jalankan manual (JANGAN dijalankan auditor)

```sql
-- Q1. Distinct nama + jumlah duplikat + entitas mana saja
SELECT name, count(*) AS n, array_agg(DISTINCT company_id) AS companies
FROM payment_terms WHERE deleted_at IS NULL
GROUP BY name ORDER BY name;

-- Q2. Jumlah referensi per baris payment_terms (cek sebelum merge/rename/hapus)
SELECT pt.id, pt.company_id, pt.code, pt.name, pt.days_due,
  (SELECT count(*) FROM accounts   a WHERE a.payment_terms_id = pt.id) AS accounts_ref,
  (SELECT count(*) FROM quotations q WHERE q.payment_terms_id = pt.id) AS quotations_ref,
  (SELECT count(*) FROM customers  c WHERE c.payment_terms_id = pt.id) AS customers_ref,
  (SELECT count(*) FROM vendors    v WHERE v.payment_terms_id = pt.id) AS vendors_ref
FROM payment_terms pt WHERE pt.deleted_at IS NULL
ORDER BY pt.name, pt.company_id;

-- Q3. Apakah days_due bisa jadi sinyal tempo (>0) vs non-tempo (0)?
--     Perhatikan khusus "50% Uang Muka" / CBD / CoD.
SELECT name, code, days_due, count(*) AS n
FROM payment_terms WHERE deleted_at IS NULL
GROUP BY name, code, days_due ORDER BY days_due, name;

-- Q4. Verifikasi 5 nama tempo yang dipakai isTempoTerm benar-benar ada & persis
SELECT name, count(*) FROM payment_terms
WHERE deleted_at IS NULL
  AND name IN ('Net 15 Days','Net 30 Days','Net 45 Days','Net 60 Days','Top Net 7 hari')
GROUP BY name ORDER BY name;

-- Q5. Dump lengkap per entitas (lihat inkonsistensi bahasa/kapitalisasi & kode)
SELECT pt.company_id, co.code AS entity, pt.code, pt.name, pt.days_due, pt.is_active
FROM payment_terms pt LEFT JOIN companies co ON co.id = pt.company_id
WHERE pt.deleted_at IS NULL
ORDER BY co.code, pt.days_due, pt.name;
```

## CATATAN TERBUKA — butuh keputusan Den

1. **[A — model PPN]** Per-item PPN benar-benar dibutuhkan, atau cukup PPN per **service_type** di header (sudah ada `vat_rate` + auto-default customs 11%)? Per-item = kolom DB baru + ubah RPC + 3 layer render. Kalau cukup header per-service, jauh lebih kecil & aman.
2. **[A — backward-compat]** Untuk quote lama (tanpa `ppn_pct` per item): saat di-edit ulang, fallback `ppn_pct` diisi dari `vat_rate` header, atau biarkan `vat_rate` jadi sumber bila semua item ppn null? Perlu keputusan agar tak regresi PPN→0.
3. **[A — checkbox default]** "Cetak dengan PPN" default ON atau OFF? Dan saat OFF, apakah `tax_amount` disimpan 0 (mengubah `total_amount` di DB → memengaruhi `estimated_value` via trigger ACCEPTED) atau PPN tetap dihitung tapi hanya disembunyikan di cetak?
4. **[B — rapikan payment_terms]** Pilih arah: (a) biarkan + perbaiki display saja; (b) rename per-entitas serentak **plus** migrasi `isTempoTerm`→`days_due`; (c) tidak diubah. **Jangan merge.** Jalankan Q1–Q5 dulu.
5. **[B — sinyal tempo]** Konfirmasi via Q3 apakah `days_due > 0` valid sebagai penanda tempo (resiko: "50% Uang Muka" mungkin punya `days_due > 0` → false positive). Bila tidak bersih, gate berbasis `days_due` perlu pengecualian eksplisit.
6. **[B — pesan]** `isTempoTerm` saat ini whitelist 5 nama persis; bila ada term tempo lain di DB dengan nama beda (mis. "NET 30", "Net 30 hari"), gate akan **meleset diam-diam** (default hide). Q4 mengonfirmasi apakah nama di DB persis sama dengan yang di-hardcode.

---
---

# AUDIT — Inventaris Warehouse & Inventory (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `supabase/schema_snapshot.sql` (struktur), grep `src/`. Data DB (isi tabel) TIDAK di-query — query SELECT disediakan untuk Den jalankan manual.

## INVESTIGASI WAREHOUSE & INVENTORY

### 1 + 2 — Tabel DB & Komponen FE (ringkasan)

**Tabel DB inventory/warehouse/produk/aset** (semua **RLS aktif**):

| Tabel | #kolom | RLS (policy) | Dipakai FE? | Peran |
|---|---|---|---|---|
| `products` | 30 | ✅ (3) | ✅ ProductsPage, useProducts, Quotation autocomplete | Master produk/jasa (service + goods). Punya kolom terstruktur (lihat §3). |
| `warehouses` | 9 | ✅ (2) | ✅ StokBarang, Penerimaan, Dashboard | Master gudang (company-scoped). **Tanpa `deleted_at`/`created_by`.** |
| `stock_ledger` | 14 | ✅ (3) | ✅ Penerimaan (write), Dashboard (read) | **Ledger pergerakan stok** (in/out/adjust/reserved/transfer). Inti stok. |
| `stock_summary` (VIEW) | — | security_invoker | ✅ StokBarang, Dashboard | View agregat dari `stock_ledger` → `on_hand/reserved/available` (lihat §4). |
| `assets` | 44 | ✅ (3) | ✅ AssetShell + pages | Master aset tetap (+depresiasi). Modul terpisah (bukan Inventory). |
| `asset_categories` | 12 | ✅ (3) | ✅ | Kategori aset + parameter depresiasi (useful_life, method). |
| `asset_locations` | 11 | ✅ (3) | ⚠️ parsial | Lokasi aset (FK `branch_id`). |
| `asset_specifications` | 38 | ✅ (3) | ✅ (IT-EQP) | Spek detail IT (CPU/RAM/dst). |
| `asset_network` | 18 | ✅ (3) | ✅ (IT-EQP) | Data jaringan aset IT. |
| `asset_software_licenses` | 15 | ✅ (3) | ⚠️ | Lisensi software per aset. |
| `asset_maintenance_records` | 15 | ✅ (3) | ⚠️ | Riwayat maintenance aset. |
| `asset_fuel_logs` | 14 | ✅ (3) | ⚠️ | Log BBM kendaraan. |
| `sp_items` | 27 | ✅ (4) | ✅ (Storbit SP, legacy App.jsx + logistics) | Item Surat Pesanan. `sku`/`qty` free-text — **TIDAK** ter-link ke `products`/`stock_ledger` (lihat §5). |
| `sp_btbs` | 5 | ✅ (4) | ✅ | Link SP↔BTB (bukti terima barang). |

> **Tidak ditemukan** tabel khusus: `inventory`, `sku`, `gudang`, `opname`, `stock_count`, `cycle_count`, `inbound`, `goods_receipt`, `stock_opname`. Stok = `stock_ledger` (+ view `stock_summary`).

**Komponen FE:**

| Komponen | Path | Status | Fungsi |
|---|---|---|---|
| InventoryDashboardPage | `src/modules/inventory/pages/InventoryDashboardPage.jsx` | ✅ REAL (`App.jsx:2585`) | Dashboard stok dari `stock_summary` + `stock_ledger` (movement mingguan). |
| StokBarangPage | `src/modules/inventory/pages/StokBarangPage.jsx` | ✅ REAL (`App.jsx:2598`) | List stok per produk dari `stock_summary` (read-only). **Hardcode "for SOA company"** (`:3`). |
| PenerimaanBarangPage | `src/modules/inventory/pages/PenerimaanBarangPage.jsx` | ✅ REAL (`App.jsx:2611`) | Inbound — **tulis ke `stock_ledger`** (`movement_type='inbound'`). |
| Inventory: Pengeluaran / Transfer / Opname | menu `inventory-pengeluaran/-transfer/-opname` (`App.jsx:602-604`) | ❌ **ComingSoon** (tak ada render block → catch-all) | Belum ada. |
| ProductsPage | `src/modules/admin/pages/ProductsPage.jsx` | ✅ REAL (`App.jsx`, menu `products`) | Master produk CRUD (fetch real, fallback mock bila kosong). |
| ProductDetailPage | `src/modules/admin/pages/ProductDetailPage.jsx` | ✅ REAL (`product-detail`) | Detail produk. |
| AssetShell + pages | `src/modules/assets/` (AssetShell, AddAssetPage, AssetDashboard, AssetITPage, AssetDetail*) | ✅ REAL (`assets*`, `App.jsx:660-668`) | Modul Asset Management (Dashboard/Analytics/Kendaraan/IT/Furniture/Properti). |
| useProducts / useAssets | `src/hooks/` | ✅ | Hooks fetch. |

**Hook fetch produk** (`useProducts.js:36`): `select('id, company_id, code, name, category, unit, uom, default_price, is_service, is_active')` — dipakai Quotation line-item autocomplete.

### 3 — Master Product / SKU

- **Tabel `products` (30 kolom)** — bukan sekadar nama+harga. Kolom relevan SKU/goods: `code varchar(20) NOT NULL`, `name`, `category varchar(50)`, `unit varchar(20)`, `uom text`, **`inventory_class varchar(100)`**, **`main_group varchar(100)`**, `operational_function text`, `unit_cost numeric(15,2)`, `default_price`, `weight text`, `dimensions text`, `packaging text`, `min_order_qty text`, `is_service boolean DEFAULT true`, `tax_id`, `cogs_account_id`/`revenue_account_id` (+ duplikat string `cogs_account`/`revenue_account`), `registered_date`.
- **SKU = kolom `code`** (varchar 20). FE menampilkannya sebagai badge "SKU" (`ProductsPage.jsx:249/275`). **Bukan kolom bernama `sku`** di tabel `products` (kolom `sku` hanya ada di `sp_items`).
- **Kodifikasi SKU:** **TIDAK ada generator DB** (tak ada `generate_product_code`; hanya `generate_customer_code` utk accounts). `code` = **manual/free-text**. **TAPI** pola terstruktur sudah tersirat di seed FE `ProductsPage.jsx:118-135`: `{ENTITY}-{GROUP}-{ITEM}` — mis. `SEA-FCL-20`, `AIR-EXP-KG` (MSI jasa freight), `SOA-DSP-FSU` (display unit), `SOA-PKG-BOX` (packaging). Group seperti `DSP`/`PKG` ada di seed, **belum** dipaksakan di DB (tak ada CHECK/enum untuk `main_group`/`inventory_class`).
- **Relasi ke Quotation:** `useProducts` → autocomplete deskripsi line-item di `QuotationFormPage` (pilih produk → isi description/unit/price). **`quotation_items` TIDAK menyimpan `product_id`** (integrasi UI-only; quote menyimpan teks). → produk dipakai sebagai katalog bantu, bukan FK.
- **Default `is_service=true`** → tabel ini **awalnya untuk jasa** (freight MSI), tapi kolom goods (weight/dimensions/packaging/inventory_class) + seed SOA menunjukkan **niat dipakai juga untuk barang fisik (trading)**.

### 4 — Konsep Stok / Quantity

- **ADA & fungsional (ledger-based).** `stock_ledger` (14 kolom): `company_id`, **`warehouse_id` (FK→warehouses, RESTRICT)**, **`product_id` (FK→products, RESTRICT)**, `movement_type` (CHECK: `inbound/outbound/adjustment/reserved/unreserved/transfer_in/transfer_out`), `qty integer`, `reference_type`, `reference_id`, `reference_no`, `notes`, `location_detail text`, `last_count_date date`, `created_by`(→auth.users).
- **View `stock_summary`** (`schema:3327`): `GROUP BY product_id, warehouse_id, company_id` → `on_hand = sum(qty)`, `reserved = Σreserved − Σunreserved`, `available = on_hand − reserved`, `last_count_date = max(...)`. **Multi-gudang sudah ada** (per warehouse_id).
- **Movement in/out:** ADA via `movement_type`. Saat ini FE hanya **menulis `inbound`** (PenerimaanBarang). `outbound/adjustment/transfer/reserved` **belum ada penulis FE**.
- **Multi-gudang/lokasi:** `warehouses` (master) + `stock_ledger.warehouse_id` + `stock_ledger.location_detail` (text bin/rak). Untuk **aset** ada `asset_locations` terpisah. Legacy SP pakai kolom **`sp_items.dc`** (text, "DC BOGOR") — bukan FK warehouse.
- **`last_count_date`** di ledger = hook untuk **stock opname**, tapi **belum ada FE opname** yang menulisnya.

### 5 — Storbit / SP (relevan stok)

- **`sp_items` (27 kolom):** `sp_no`, `sp_date`, `customer_id`(→accounts), `product_name text`, **`sku text` (free-text)**, `qty`, `shipped_qty`, `dc text`, `unit_price`, `shipping_price`, flags `inv/fp/submit/kirim`, `arrival_date`, `estimated_delivery_date`, `sla_days`, dst. **Tanpa `company_id`/`deleted_at`** (tabel legacy).
- **Status flow** (turunan, bukan kolom): per item `Open/Partial/Closed` dari `qty` vs `shipped_qty` (`App.jsx:187-191`); UI desain `OPEN→CONFIRMED→MANIFEST→CLOSED/CANCELLED` (`CONFIRMED/CANCELLED` butuh kolom `sp_items.status`, **TODO**, `SalesOrderPage.jsx:60`).
- **🔴 `sp_items.sku` TIDAK ter-link ke `products`** — free-text (mis. `BKT-SB43-00001`, "STORBIT LOYANG", `App.jsx:4017`). **Tidak ada FK `sp_items.product_id`**, tidak ada relasi `sp_items ↔ products ↔ stock_ledger`. SP (trading Storbit) & stok Nexus (`stock_ledger`) adalah **dua dunia terpisah** yang belum tersambung.
- **`sp_items.dc`** (free-text "DC BOGOR") ≠ `warehouses` FK.

### 6 — Asset (aset & depresiasi)

- **Modul terpisah** ("Asset Management", `App.jsx:658-668`, AssetShell live). **Bukan** bagian menu Inventory.
- **`assets` (44 kolom)** punya depresiasi penuh: `purchase_price`, `useful_life_years`, `depreciation_method` (CHECK `straight_line/double_declining/none`), `accumulated_depreciation`, `book_value`, `disposal_date`, `coa_*_account_id`; subtype IT/kendaraan (`asset_subtype`, `plate_number`, `vin`, `km_odometer`, `fuel_type`), `status` (CHECK `active/disposed/in_repair/retired/transferred`), `assignment_status`.
- **Add Asset wizard** (`AddAssetPage.jsx`) → **INSERT ke `assets`** (`:685-686`) + (IT-EQP) best-effort `asset_specifications` (`:720`) & `asset_network` (`:739`); lookup `asset_categories` (`:647`). Konfirmasi: wizard sudah tulis DB nyata.
- Depresiasi: **parameter ada** (method/useful_life/accumulated/book_value) tapi **belum tentu ada job/penghitung depresiasi periodik** (tak ditemukan trigger/RPC depresiasi di schema — perlu cek lebih lanjut bila relevan).

### 7 — GAP ANALYSIS (penilaian, bukan eksekusi)

**✅ SUDAH ADA & bisa dipakai ulang:**
- Master gudang (`warehouses`), master produk (`products`), **ledger stok multi-gudang** (`stock_ledger` + CHECK movement lengkap), **view agregat** (`stock_summary` on_hand/reserved/available) — fondasi inventory **sudah ada & RLS aktif**.
- FE: Dashboard Inventory, Stok Barang (read), Penerimaan (inbound write) — **3 halaman live**.
- Kolom hook stock opname: `stock_ledger.last_count_date` + `movement_type='adjustment'`.
- Reserved/available sudah dimodelkan (`reserved`/`unreserved`).
- Asset Management + depresiasi (struktur) sudah lengkap & live.

**❌ BELUM ADA (perlu dibuat baru):**
- **Stock opname** (full/cycle count + variance): tak ada tabel sesi opname (`stock_counts`/`count_lines`) maupun FE. `last_count_date` ada tapi tak ada UI/penulis.
- **Outbound / Transfer / Adjustment FE**: movement_type-nya ada di CHECK, tapi **belum ada halaman** (menu Pengeluaran/Transfer/Opname = ComingSoon).
- **On-hold / inbound staging** (QC/karantina sebelum on-hand): tak ada status/staging area; `stock_ledger` langsung on-hand.
- **Master SKU terstruktur** (enum/codification FG/SA/RM, group DSP/PKG): kolom `inventory_class`/`main_group` ada tapi **tanpa master/enum/generator** — masih free-text.
- **Relasi SP↔stok**: tak ada (lihat konflik).
- **Reorder level / min-stock alert, batch/lot, expiry tracking** di `stock_ledger`: belum (sp_items punya `exp_date` tapi terpisah).

**🔧 ADA TAPI PERLU DIPERLUAS:**
- **`products`**: tambah kodifikasi SKU terstruktur (master `inventory_class`/`main_group`/sub-group + generator/`code` rule), tegaskan `is_service` vs goods, mungkin pisah katalog jasa vs barang. `quotation_items` perlu `product_id` bila mau link tegas.
- **`warehouses`**: tambah `deleted_at`/`created_by`/`branch_id` bila perlu konsistensi soft-delete + struktur bin/rack (saat ini cuma `stock_ledger.location_detail` text).
- **`stock_ledger`**: tambah dukungan opname session, batch/lot, unit cost per movement (untuk valuasi); `created_by`→`auth.users` (bukan profiles) → perlu fetch terpisah utk nama.
- **StokBarangPage**: hardcode "SOA company" (`:3`) → perlu di-scope dinamis per entitas.

**⚠️ KONFLIK / DUPLIKASI:**
- **🔴 `sp_items.sku` (free-text) vs `products.code`** — dua sistem SKU tidak sinkron. Barang Storbit (SP) hidup di `sp_items` (tanpa product_id, tanpa stock_ledger); barang Nexus hidup di `products`+`stock_ledger`. Bila Warehouse baru pakai `products`/`stock_ledger`, **SP existing tidak otomatis ikut** → risiko stok ganda/tidak akurat. Perlu keputusan: migrasikan SP ke products+ledger, atau jembatani `sp_items.product_id`.
- **`sp_items.dc` (text) vs `warehouses`** — lokasi gudang dua representasi.
- **`products` dipakai untuk jasa (MSI freight, is_service=true) DAN barang (SOA trading)** dalam satu tabel — perlu pemisahan jelas agar modul Warehouse (barang) tak tercampur katalog jasa Quotation.
- **`products.cogs_account_id`(uuid FK) vs `cogs_account`(text)** & `revenue_account_id` vs `revenue_account` — kolom duplikat (uuid + text), berpotensi inkonsisten.

### Query SELECT untuk Den (jalankan manual — auditor TIDAK query DB)

```sql
-- P1. Struktur isi products: berapa jasa vs barang, per entitas
SELECT co.code AS entity, p.is_service, count(*) AS n
FROM products p LEFT JOIN companies co ON co.id = p.company_id
WHERE p.deleted_at IS NULL
GROUP BY co.code, p.is_service ORDER BY co.code, p.is_service;

-- P2. Pola code/SKU + kolom terstruktur (lihat apakah inventory_class/main_group terisi)
SELECT code, name, category, main_group, inventory_class, uom, unit_cost, is_service
FROM products WHERE deleted_at IS NULL ORDER BY code LIMIT 100;

-- P3. Apakah stock_ledger sudah ada isinya (stok real) & movement apa saja
SELECT company_id, warehouse_id, movement_type, count(*) AS n, sum(qty) AS qty_sum
FROM stock_ledger GROUP BY company_id, warehouse_id, movement_type ORDER BY 1,2,3;

-- P4. Stok on-hand sekarang (via view)
SELECT product_id, warehouse_id, on_hand, reserved, available, last_count_date
FROM stock_summary ORDER BY on_hand DESC LIMIT 100;

-- P5. Master gudang yang ada
SELECT id, company_id, code, name, city, is_active FROM warehouses ORDER BY company_id, code;

-- P6. Volume SP (legacy trading) & keunikan SKU bebas
SELECT count(*) AS sp_rows, count(DISTINCT sp_no) AS sp_count,
       count(DISTINCT sku) AS distinct_sku, count(DISTINCT dc) AS distinct_dc
FROM sp_items;

-- P7. Overlap SKU: apakah sp_items.sku ada yang sama dengan products.code?
SELECT s.sku, count(*) AS sp_n,
       EXISTS (SELECT 1 FROM products p WHERE p.code = s.sku AND p.deleted_at IS NULL) AS ada_di_products
FROM sp_items s WHERE s.sku <> '' GROUP BY s.sku ORDER BY ada_di_products DESC, sp_n DESC LIMIT 100;

-- P8. Aset + status depresiasi (sanity)
SELECT status, depreciation_method, count(*) AS n,
       sum(purchase_price) AS total_cost, sum(book_value) AS total_book
FROM assets WHERE deleted_at IS NULL GROUP BY status, depreciation_method ORDER BY 1,2;
```

### CATATAN TERBUKA — butuh keputusan Den

1. **[Sumber kebenaran stok]** Modul Warehouse baru pakai `stock_ledger`+`products` (sudah ada) — apakah **SP/Storbit (`sp_items`) di-migrasi/dijembatani** ke model ini, atau dibiarkan terpisah? Tanpa keputusan ini, stok barang Storbit tidak akan akurat di Warehouse.
2. **[Jasa vs barang di `products`]** Pisahkan katalog jasa (Quotation) vs barang fisik (Warehouse), atau satu tabel dengan `is_service` sebagai pemisah? Jalankan P1/P2 dulu.
3. **[Kodifikasi SKU]** Mau master terstruktur (class/group + generator `code`) atau tetap free-text? Kolom `inventory_class`/`main_group` sudah ada tapi kosong/longgar (cek P2).
4. **[Opname]** Belum ada tabel sesi opname maupun FE; `last_count_date` & `movement_type='adjustment'` adalah hook yang tersedia. Desain butuh tabel baru (sesi + variance) — perubahan DB (butuh approval).
5. **[Scope entitas]** `StokBarangPage` hardcode SOA (`:3`) — apakah Warehouse multi-entitas (MSI/JCI/SOA) atau khusus SOA/trading?
6. **[Duplikat kolom akun]** `products.cogs_account_id`(uuid) vs `cogs_account`(text) (dan revenue) — mana yang kanonik? Rapikan sebelum dipakai valuasi.
7. **[Warehouses non-standar]** `warehouses` tanpa `deleted_at`/`created_by` — biarkan atau standarkan (konsisten soft-delete)? (perubahan DB).

---
---

# AUDIT — Flow Storbit (Trading/SOA) End-to-End (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `supabase/schema_snapshot.sql`, `src/lib/db.js`, `src/lib/spCalc.js`, `src/App.jsx` (legacy Storbit pages), `src/modules/logistics/*`. Data DB TIDAK di-query — query SELECT disediakan untuk Den.

## INVESTIGASI FLOW STORBIT END-TO-END

### TAHAP 1 — INPUT & KELOLA SP

**FE:** `InputSPPage.jsx` (input), `SalesOrderPage.jsx` (list), `SalesOrderDetailPage.jsx` (detail). Semua **REAL** (render `App.jsx:2403/2423/2439`).

**Input SP (`InputSPPage.jsx`):**
- Header: `spDate`(:133), `customerId`(:134, →accounts), `dc`(:135), `expiredDate`(:136), `notes`(:137).
- Item (repeatable, `freshItem` :66): `productName`, `sku`, `qty`, `unitPrice`, `shippingPrice`, (`ppn` dihitung, tak diinput). Total preview: subtotal/shipping/ppn/grand (:158-162) — **PPN 11%**, hanya tampilan.
- BTB rows (opsional): `btb_no`, `remarks` (:144) → `sp_btbs`.
- **Validasi:** `headerOk = spDate && customerId && expiredDate` (:166); `itemsOk` = tiap item `productName` terisi, `qty≥1`, `unitPrice≥0` (:167).
- **Nomor SP:** `SP-${Date.now().slice(-6)}` **client-side** (:173) — bukan sequence DB.
- **Simpan:** `bulkInsertSpItems(rows)` (:188) → `sp_items`; `bulkInsertSpBtbs(spNo, btbRows)` (:195) → `sp_btbs` (error di-ignore). **Draft = Submit** (insert sama, tak ada kolom status — komentar :10/:212).

**`sp_items` (27 kolom)** — arti:
| Kolom | Tipe | Arti |
|---|---|---|
| `sp_no` | text | Nomor SP (group key). Client-gen `SP-xxxxxx`. |
| `sp_date` | date | Tanggal SP. |
| `customer_id` | uuid | →`accounts` (Indomarco/customer). |
| `product_name` | text | Nama barang (free-text). |
| `sku` | text | **Free-text**, tak ter-link `products`. |
| `qty` / `shipped_qty` | integer | Pesan vs terkirim → dasar status. |
| `dc` | text | Distribution Center tujuan (free-text "DC BOGOR"). Bukan FK `warehouses`. |
| `exp_date` / `expired_date` | date | Kedaluwarsa barang / deadline SP (dipakai `isOverdue`). |
| `shipping_date` / `arrival_date` / `estimated_delivery_date` | date | Tanggal kirim/tiba/estimasi. |
| `sla_days` | integer | SLA. |
| `submit` / `kirim` / `inv` / `fp` | boolean | Flag dokumen: submit, kirim, invoice, faktur pajak (dikelola FinancePage). |
| `submit_date` | date | Tgl submit. |
| `email_status` | text | Status email. |
| `unit_price` / `shipping_price` | numeric(18,2) | Harga satuan / ongkir. **Tak ada kolom `ppn`/`grand_total`/`subtotal`** — dihitung di FE. |
| `btb_no_deprecated` | text | Kolom BTB usang (pindah ke `sp_btbs`). |
| `notes` | text | Catatan. |

> **TIDAK ADA:** `company_id`, `deleted_at`, **`status`** (eksplisit). Tabel legacy.

**Grouping SP:** dua implementasi —
- `App.jsx:149-199` `groupBySP(rows)` (kaya: items[], totals, financePct, status, isOverdue) — dipakai render utama.
- `spCalc.js:groupBySP` (ringan) — untuk komponen yang hanya butuh agregat.

**Status SP (diturunkan, BUKAN kolom):** `spCalc.js:calcItem` (:36-44) per item: `outstandingQty = qty − shippedQty`; `Closed` bila outstanding=0 & qty>0; `Partial` bila shipped>0 & outstanding>0; else `Open`. Per-SP (`App.jsx:187-191`): semua item Closed→`Closed`, semua Open→`Open`, selain itu→`Partial`. UI desain map ke `OPEN→CONFIRMED→MANIFEST→CLOSED/CANCELLED` (`SalesOrderPage.jsx:62-63`), tapi **`CONFIRMED`/`CANCELLED` BELUM ada** (butuh kolom `sp_items.status`, TODO :60).

**Tombol Konfirmasi/Tolak (`SalesOrderPage.jsx:226-297`):** ada di UI (modal "SP akan berpindah ke status Confirmed/Cancelled") **TAPI tidak persist** — tak ada kolom `status` untuk disimpan; status tetap turunan qty. → **kosmetik/no-op** sampai migrasi `sp_items.status`. **Status: SEBAGIAN (input live, status-transition belum nyata).**

### TAHAP 2 — STOK / WAREHOUSE (manual)

**Tabel** (detail lengkap di section "INVESTIGASI WAREHOUSE & INVENTORY" di atas): `products` (30 kol, `code`=SKU manual), `warehouses` (9 kol), `stock_ledger` (14 kol, ledger movement, FK product+warehouse RESTRICT), VIEW `stock_summary` (on_hand/reserved/available dari `stock_ledger`).

**🔴 Hubungan `sp_items ↔ products ↔ stock_ledger`: TIDAK ADA.** `sp_items.sku`/`product_name` free-text, tak ada `product_id`, tak ada FK. **SP TIDAK memotong/menambah `stock_ledger`** — tak ditemukan kode yang menulis `stock_ledger` saat SP dibuat/dikirim. **Konfirmasi: stok TIDAK otomatis** dari SP → sesuai info Den (dicek manual via sheet warehouse).

**FE live:**
- `InventoryDashboardPage` — baca `stock_summary` + `stock_ledger` (read).
- `StokBarangPage` — baca `stock_summary` (read-only; **hardcode "SOA company"** :3).
- `PenerimaanBarangPage` — **tulis `stock_ledger`** (`movement_type='inbound'`) — satu-satunya penulis stok.
- `ProductsPage` — master produk CRUD.
→ Inventory ini adalah **modul Nexus terpisah**, **belum tersambung ke flow SP Storbit**.

**Surat jalan & terima barang:** **TIDAK ADA komponen/tabel.** Hanya disebut sebagai placeholder teks di `SalesOrderDetailPage.jsx:1099` (EmptyState "Upload dokumen … Surat Jalan, PO Customer…") dan desain masa depan di `docs/architecture/business-process-map.md:102/124`. **Terima barang Storbit direpresentasikan via `sp_btbs` (BTB)** + flag, bukan modul surat jalan. → sesuai info Den (Gigih manual). **Status: BELUM (selain BTB & flag).**

### TAHAP 3 — PENGIRIMAN / SHIPMENT

**FE:** `ShipmentPage` (legacy, `App.jsx:3711`, render `:2474`) + menu "Shipment Management" (`:515`). `SalesOrderDetailPage` juga menampilkan shipment.
- `ShipmentPage`: list item `status !== 'Closed'` (:3712, "perlu update shipment"); edit via `onUpdate`→`setShipmentRow` → modal → `updateSpItem` (`db.js:303`). Beroperasi pada **`sp_items` (enrichedRows)** yang sama.
- **"Kirim" direpresentasikan di `sp_items`:** `shipped_qty` (naik → status Partial/Closed), `kirim` (boolean), `shipping_date`, `arrival_date`, `estimated_delivery_date`, `dc` (tujuan). Tidak ada tabel shipment terpisah.
- **Surat jalan / delivery order: TIDAK ADA di code** (hanya placeholder/desain, lihat Tahap 2).
**Status: SEBAGIAN** (update shipped_qty/kirim/tanggal live; tak ada DO/tracking number/multi-leg).

### TAHAP 4 — FINANCE: BTB, INVOICE, AR

**Dua "BTB" berbeda:**
- **`sp_btbs`** (5 kol: `sp_no`, `btb_no`, `remarks`, `created_at`) = **Bukti Terima Barang (barang)** — link `sp_no`↔`btb_no` (barang diterima di DC). Diisi saat Input SP.
- **`ar_btbs`** (FK `ttf_id`) = **baris penagihan/pembayaran (finance)** di bawah satu TTF — `no_btb`, `dpp_ppn`, `pph`, `payment`, `position`. **Bukan barang.**

**AR tables:**
| Tabel | Kolom | Arti |
|---|---|---|
| `ar_ttfs` | `no_ttf`, `tanggal_ttf`, `tanggal_menerima`, **`no_inv`**, **`no_sp`**, `customer_id`(→accounts), `tgl_pembayaran`, `notes` | Header TTF (Tanda Terima Faktur/invoice). **Link ke SP via `no_sp` (TEXT, bukan FK).** |
| `ar_btbs` | `ttf_id`(FK→ar_ttfs), `no_btb`, `dpp_ppn`, `pph`, `payment`, `position` | Rincian invoice + pembayaran (nested di TTF). |

- **TTF↔SP:** `ar_ttfs.no_sp` = `sp_items.sp_no` **by string** (tak ada FK; tak dijoin di code — terpisah).
- **Nesting:** `listTtfs` (`db.js:322`) embed `ar_btbs(*)` + `customers:accounts!ar_ttfs_customer_id_fkey(name)`; `ttfFromDb` (`db.js:137`) map `btbs[]` urut `position`.
- **Pembayaran dicatat** di `ar_btbs.payment` (multi-baris per TTF).

**Status pembayaran (turunan)** — `App.jsx:205-242` (`calcTtf`):
- `totalInvoice = Σ(dpp_ppn + pph)` (:209-210), `totalPayment = Σ payment` (:216), `totalOS = totalInvoice − totalPayment` (:217).
- `Belum Bayar` (default); `Lunas` bila `|totalOS|≤TOLERANCE && totalPayment>0` (:232); `Lebih Bayar` bila `totalOS < −TOLERANCE` (:233); `Partial` bila `payment>0 && totalOS>TOLERANCE` (:234). `isOverdue` bila belum lunas & `jarakTgl>30` tanpa `tglPembayaran` (:238).

**FE finance:**
- `AR Tracker` (`App.jsx:4612`, render `:2494`, menu `ar`) — `useTtfs` → **tulis `ar_ttfs` + `ar_btbs`** (TTF + nested BTB pembayaran). LIVE.
- `OutstandingPage` (`App.jsx:3854`, render `:2480`, menu `outstanding`) — list SP `totalOutstanding>0` (dari sp_items). LIVE (read/aksi via finance modal).
- `FinancePage` (`App.jsx:3783`, render `:2477`, menu `finance`) — **update flag `inv`/`fp`/`submit`/`kirim`/`email_status`** di `sp_items` (subtitle :3795). LIVE.

**Flag `inv` & `fp` (`sp_items`):** boolean status dokumen (invoice dibuat / faktur pajak dibuat), **dikelola manual di FinancePage** (siapa pun ber-role finance/akses menu). **Bukan** auto dari AR — terpisah dari `ar_ttfs` (yang punya `no_inv` sendiri). → **Dua sumber "invoice": flag `sp_items.inv` (Storbit doc-status) vs `ar_ttfs.no_inv` (AR Tracker) — tidak tersinkron.**

**Status: LIVE** (AR Tracker + Finance flags + Outstanding), tapi link SP↔TTF hanya by-text & inv-flag vs AR tak sinkron.

### TAHAP 5 — PERAN & AKSES

**Role di menu (FE gate):**
- Input SP (`input`): `['super_admin','admin','ceo','gm','manager','operations','sales']` (`App.jsx:485`).
- Shipment (`shipment`): `['super_admin','admin','ceo','gm','manager','operations','sales']` (:515).
- AR (`ar`) & Outstanding: `['super_admin','admin','ceo','gm','finance_controller','finance', (+manager utk outstanding)]` (:616/:621).
- `finance` (FinancePage flags): gate via `can(role,'finance')` (`App.jsx:2477`).

**🔴 RLS (DB) — sangat longgar:**
| Tabel | RLS | Catatan |
|---|---|---|
| `sp_items` | read/insert/update/delete **`USING(true)`** (`:9685-9706`) | **Semua authenticated bisa apa saja.** Tanpa role/company. |
| `sp_btbs` | read/delete `true`; insert/update `auth.uid() IS NOT NULL` (`:9651-9672`) | Sama longgar. |
| `ar_ttfs` | read/insert/update/delete **`USING(true)`** (`:8031-8052`) | Semua authenticated. |
| `ar_btbs` | read/insert/delete **`USING(true)`** (`:8004-8018`) | Semua authenticated (tak ada UPDATE policy → update diblok? hanya insert/delete/read). |
| `stock_ledger` | insert `auth.uid() not null`; **update `is_super_admin()`**; select `true` (`:9760-9774`) | Lebih ketat di update. |

**Scope entitas:** `sp_items`/`sp_btbs`/`ar_ttfs`/`ar_btbs` **TIDAK punya `company_id`** → **flat, semua entitas campur** (tak ada pemisahan MSI/JCI/SOA di tabel Storbit). `customer_id`→`accounts` (yang punya `company_id`) jadi satu-satunya jejak entitas, tapi RLS tak memakainya. **Severity: HIGH** (kontrol akses Storbit praktis hanya di FE-menu; DB terbuka untuk semua authenticated).

### RANGKUMAN FLOW (seperti di code sekarang)

```
[Customer/Indomarco kirim SP]
        │ (manual: diketik operator)
        ▼
TAHAP 1  Input SP  ──────────────────────────────────────────────
  InputSPPage → bulkInsertSpItems → sp_items (sp_no=SP-xxxxxx client-gen)
                bulkInsertSpBtbs  → sp_btbs (BTB barang, opsional)
  Status SP = turunan qty vs shipped_qty (Open/Partial/Closed) — TAK ada kolom status
  Konfirmasi/Tolak di UI = NO-OP (belum persist)
        │
        ▼
TAHAP 2  Cek Stok  ──────────────────────────────────────────────
  ❌ MANUAL (sheet warehouse) — sp_items TIDAK tersambung products/stock_ledger
  Inventory Nexus (stock_ledger/stock_summary) ada tapi TERPISAH dari SP
  Surat jalan / terima barang = BELUM (hanya BTB di sp_btbs + placeholder doc)
        │
        ▼
TAHAP 3  Pengiriman  ────────────────────────────────────────────
  ShipmentPage → updateSpItem: shipped_qty↑, kirim=true, shipping_date/arrival_date, dc
  → status SP otomatis jadi Partial/Closed (dari shipped_qty)
  Tak ada Delivery Order / tracking terpisah
        │
        ▼
TAHAP 4  Finance / AR  ──────────────────────────────────────────
  FinancePage → sp_items flags: submit, kirim, inv, fp, email_status (manual)
  AR Tracker  → ar_ttfs (no_sp link by TEXT, no_inv) + ar_btbs (dpp_ppn, pph, payment)
  Status bayar = calcTtf: Belum Bayar / Partial / Lunas / Lebih Bayar (App.jsx:205-242)
  OutstandingPage → SP dengan outstanding qty/finance
        │
        ▼
[Selesai / Lunas]
```

**Otomatis vs manual:**
- ✅ Otomatis: status SP (dari qty), PPN 11% (hitung FE), status bayar AR (dari ar_btbs), agregat outstanding.
- 🔴 Manual: cek stok (tak ada potong stok), nomor SP (timestamp client), flag inv/fp/submit/kirim (diklik manual), link SP↔TTF (ketik `no_sp`), surat jalan/terima barang, konfirmasi SP (belum persist).

### GAP per tahap (yang belum ada untuk flow lengkap)

- **T1:** kolom `sp_items.status` eksplisit (Confirmed/Cancelled belum nyata); `company_id`/`deleted_at`; nomor SP via sequence DB (bukan timestamp client, risiko tabrakan); harga/ppn/grand tak tersimpan (hitung ulang tiap render).
- **T2:** sambungan `sp_items.product_id` → `products`/`stock_ledger`; auto-reserve/auto-deduct stok saat SP/kirim; modul terima barang/surat jalan; opname; reorder.
- **T3:** Delivery Order/surat jalan (tabel+FE), tracking/proof of delivery, multi-DC per SP.
- **T4:** link FK `ar_ttfs.no_sp`→`sp_items` (sekarang text); sinkron `sp_items.inv`/`fp` ↔ `ar_ttfs` (dua sumber invoice); generator nomor invoice/TTF; aging report formal.
- **T5:** RLS role/company-scoped untuk `sp_items`/`ar_*` (kini `USING(true)` + tanpa `company_id`); audit trail.

### Query SELECT untuk Den (jalankan manual — auditor TIDAK query DB)

```sql
-- S1. Contoh isi SP + status turunan (cek qty vs shipped)
SELECT sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty,
       (qty - shipped_qty) AS outstanding, dc, kirim, inv, fp, submit, shipping_date, arrival_date
FROM sp_items ORDER BY created_at DESC LIMIT 50;

-- S2. Volume SP & keunikan
SELECT count(*) AS rows, count(DISTINCT sp_no) AS sp_count,
       count(DISTINCT customer_id) AS customers, count(DISTINCT dc) AS dc_count,
       sum(CASE WHEN qty>shipped_qty THEN 1 ELSE 0 END) AS open_or_partial_rows
FROM sp_items;

-- S3. Overlap SKU SP vs master products (apakah barang Storbit ada di products)
SELECT s.sku, count(*) AS sp_rows,
       EXISTS (SELECT 1 FROM products p WHERE p.code = s.sku AND p.deleted_at IS NULL) AS ada_di_products
FROM sp_items s WHERE s.sku <> '' GROUP BY s.sku ORDER BY ada_di_products, sp_rows DESC LIMIT 100;

-- S4. AR: TTF + agregat invoice/payment + link ke SP
SELECT t.no_ttf, t.no_inv, t.no_sp, t.customer_id, t.tanggal_ttf, t.tgl_pembayaran,
       COALESCE(sum(b.dpp_ppn + b.pph),0) AS total_invoice,
       COALESCE(sum(b.payment),0) AS total_payment,
       COALESCE(sum(b.dpp_ppn + b.pph),0) - COALESCE(sum(b.payment),0) AS outstanding
FROM ar_ttfs t LEFT JOIN ar_btbs b ON b.ttf_id = t.id
GROUP BY t.id ORDER BY t.tanggal_ttf DESC NULLS LAST LIMIT 50;

-- S5. Apakah no_sp di TTF benar menunjuk SP yang ada (integritas link by-text)
SELECT t.no_sp, count(*) AS ttf_n,
       EXISTS (SELECT 1 FROM sp_items s WHERE s.sp_no = t.no_sp) AS sp_ada
FROM ar_ttfs t WHERE t.no_sp <> '' GROUP BY t.no_sp ORDER BY sp_ada, ttf_n DESC LIMIT 100;

-- S6. sp_btbs (BTB barang) — berapa SP punya BTB
SELECT count(*) AS btb_rows, count(DISTINCT sp_no) AS sp_with_btb FROM sp_btbs;

-- S7. Konsistensi entitas: SP customer ada di company mana (sp_items tak punya company_id)
SELECT co.code AS entity, count(DISTINCT s.sp_no) AS sp_count
FROM sp_items s LEFT JOIN accounts a ON a.id = s.customer_id
LEFT JOIN companies co ON co.id = a.owner_company_id
GROUP BY co.code ORDER BY sp_count DESC;
```

### CATATAN TERBUKA — butuh keputusan Den

1. **[Stok ↔ SP]** Storbit fulfillment butuh potong stok otomatis? Saat ini 100% manual & `sp_items` tak tersambung `stock_ledger`/`products`. Keputusan: jembatani (`sp_items.product_id` + tulis ledger saat kirim) atau biarkan manual.
2. **[Status SP eksplisit]** Tambah kolom `sp_items.status` agar Konfirmasi/Tolak nyata (kini no-op) + dukung CONFIRMED/CANCELLED? Plus nomor SP via sequence DB (timestamp client rawan tabrakan saat input berbarengan).
3. **[Link SP↔Invoice]** `ar_ttfs.no_sp` & `sp_items.inv` adalah dua jalur invoice terpisah (text link + flag) yang **tak sinkron**. Mau disatukan (FK + status invoice tunggal)?
4. **[Surat jalan / terima barang]** Belum ada modul DO/Goods Receipt (selain `sp_btbs` minimal + placeholder). Bangun baru?
5. **[RLS & entitas]** `sp_items`/`ar_*` `USING(true)` + tanpa `company_id` → terbuka untuk semua authenticated, semua entitas campur. Perlu RLS role/company-scoped + tambah `company_id` (perubahan DB, butuh approval). **Prioritas keamanan.**
6. **[Harga tersimpan]** `sp_items` tak simpan subtotal/ppn/grand (hitung ulang tiap render via `calcItem`). Untuk audit/historis (harga berubah), pertimbangkan simpan snapshot.

---
---

# AUDIT — Kesiapan Clean Start Storbit & Inventory (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `supabase/schema_snapshot.sql` (FK graph), grep `from('…')` + import hook di `src/`. Data DB (jumlah baris) **TIDAK** di-query — query COUNT disediakan untuk Den.
> ⚠️ **Verdict "aman/tidak aman" di bawah berbasis KETERKAITAN (FK + FE). Jumlah baris real WAJIB diverifikasi Den via query §3 sebelum eksekusi apa pun.**

## INVESTIGASI — KESIAPAN CLEAN START STORBIT

### 1. Matriks keterkaitan (apa yang rusak bila tabel X dihapus)

**Metode:** "FK masuk" = constraint dari tabel lain yang menunjuk X (DROP X butuh drop/empty dulu yang refer). "Link by TEXT" = relasi lewat string, **bukan FK** (tak menghalangi DROP, tapi memutus relasi logis). "FE" = file yang query tabel.

| Tabel | #kol | RLS | FK MASUK (inbound) | Link by TEXT | FE yang pakai | Modul |
|---|---|---|---|---|---|---|
| **sp_items** | 27 | `USING(true)` | **TIDAK ADA** | `sp_btbs.sp_no`, `ar_ttfs.no_sp` (string) | `lib/db.js` → App.jsx legacy + `logistics/*` + `useSpItems` | Storbit |
| **sp_btbs** | 5 | longgar | **TIDAK ADA** | `sp_no`→sp_items (string) | `lib/db.js` (InputSP, detail) | Storbit |
| **ar_ttfs** | 11 | `USING(true)` | **`ar_btbs.ttf_id`** (ON DELETE **CASCADE**) | `no_sp`→sp_items, `no_inv` (string) | `lib/db.js` → AR Tracker (`useTtfs`) | Storbit/AR |
| **ar_btbs** | 7 | `USING(true)` | **TIDAK ADA** | — | `lib/db.js` (nested di TTF) | Storbit/AR |
| **products** | 30 | RLS (3) | **`stock_ledger.product_id`** (ON DELETE **RESTRICT**) | `sp_items.sku` (string, longgar) | `useProducts`→**QuotationFormPage**, `ProductsPage`, `ProductDetailPage`, `PenerimaanBarangPage` | **CRM/Quotation + Inventory + Master** |
| **stock_ledger** | 14 | RLS (3) | TIDAK ADA (view `stock_summary` baca, bukan FK) | — | `PenerimaanBarangPage`(write), `InventoryDashboardPage`(read) | Inventory |
| **stock_summary** (VIEW) | — | invoker | — (view; bergantung `stock_ledger`) | — | `StokBarangPage`, `InventoryDashboardPage` | Inventory |
| **warehouses** | 9 | RLS (2) | **`stock_ledger.warehouse_id`** (ON DELETE **RESTRICT**) | `sp_items.dc` (string, bukan FK) | `PenerimaanBarangPage` | Inventory |
| **assets** | 44 | RLS (3) | 5 sub-tabel: `asset_specifications`/`asset_network`/`asset_software_licenses`/`asset_maintenance_records` (**CASCADE**), `asset_fuel_logs` (**RESTRICT**) | — | `useAssets`, `AssetShell` pages | Asset Mgmt |
| **asset_categories** | 12 | RLS (3) | **`assets.category_id`** (RESTRICT/NO ACTION) | — | `useAssets`, AddAsset, Dashboard | Asset Mgmt |
| **asset_locations** | 11 | RLS (3) | **`assets.location_id`** (RESTRICT) | — | `AssetDetailITPage` | Asset Mgmt |

**Outbound FK (tidak menghalangi DROP tabel ini, hanya relasi keluar):**
- `sp_items.customer_id` → `accounts` (`sp_items_customer_id_fkey`); `ar_ttfs.customer_id` → `accounts`. **`accounts` adalah parent → drop sp_items/ar_ttfs TIDAK merusak accounts** (mereka di sisi child).
- `products` → `taxes`(tax_id), `chart_of_accounts`(cogs/revenue_account_id), `companies`(company_id) — outbound.
- `stock_ledger` → `products`, `warehouses`, `companies` (semua RESTRICT).

**🔑 Tidak ada FK dari tabel "aman" (accounts/customers/companies/quotations) yang MASUK ke sp_items/sp_btbs/ar_ttfs/ar_btbs.** Artinya keempatnya **tak dihalangi** oleh tabel inti mana pun saat DROP.

### 2. Apakah benar-benar terisolasi? (jawaban tegas per tabel)

- **🔴 `products` — TIDAK TERISOLASI. JANGAN DROP.**
  - **Dipakai MSI Quotation:** `useProducts()` di-consume **HANYA** oleh `QuotationFormPage.jsx:489` → autocomplete deskripsi line-item (`ProductDescInput`). **Drop/TRUNCATE `products` = autocomplete Quotation MSI kosong** (fitur live rusak; tak error fatal krn free-text, tapi katalog hilang).
  - **Dipakai Inventory:** `PenerimaanBarangPage` (pilih produk utk inbound), `ProductsPage`/`ProductDetailPage` (master).
  - **FK masuk:** `stock_ledger.product_id` RESTRICT → bila `stock_ledger` ada baris, DROP `products` **diblokir** DB.
  - **Catatan:** `products` mencampur jasa MSI (is_service=true: SEA-FCL, AIR-EXP) **dan** barang trading (SOA-DSP/PKG). Bukan tabel Storbit murni.
- **✅ `sp_items`, `sp_btbs` — TERISOLASI ke Storbit.** Inbound FK = NONE. FE = `lib/db.js` saja (App.jsx legacy Storbit + `logistics/*`). **Tidak** dibaca report/dashboard/audit lain (grep `sp_items`/`sp_no` di luar db.js/logistics/hooks = **kosong**). Relasi ke `sp_btbs`/`ar_ttfs` hanya via `sp_no`/`no_sp` **string** (putus relasi logis, bukan FK).
- **✅ `ar_ttfs`, `ar_btbs` — TERISOLASI ke AR Tracker.** `ar_btbs` child dari `ar_ttfs` (CASCADE). FE = `lib/db.js`→AR Tracker. Tak ada konsumen lain.
- **🟡 `stock_ledger`, `stock_summary`, `warehouses` — terisolasi ke modul Inventory** (BUKAN data Storbit). Ini **infra inventory baru** (mungkin minim data). Drop akan merusak InventoryDashboard/StokBarang/Penerimaan. `stock_summary` adalah VIEW (drop bergantung `stock_ledger`).
- **🟡 `assets` + sub-tabel — terisolasi ke modul Asset Management** (live, terpisah dari Storbit). **Di luar scope clean-start Storbit/Inventory-barang** — jangan campur.

**Kesimpulan isolasi:** Klaster **Storbit murni** yang aman secara keterkaitan = **`sp_items`, `sp_btbs`, `ar_ttfs`, `ar_btbs`** (FK-isolated + FE hanya db.js/logistics). **`products` BUKAN** bagian aman (dipakai Quotation MSI). `stock_*`/`warehouses`/`assets` = modul lain, bukan data Storbit legacy.

### 3. Query verifikasi jumlah data (Den jalankan manual)

> Auditor TIDAK query DB. Jalankan ini untuk membuktikan dugaan "data dummy/minim".

```sql
-- C1. COUNT semua tabel relevan sekaligus
SELECT 'sp_items'     AS tabel, count(*) FROM sp_items
UNION ALL SELECT 'sp_btbs',      count(*) FROM sp_btbs
UNION ALL SELECT 'ar_ttfs',      count(*) FROM ar_ttfs
UNION ALL SELECT 'ar_btbs',      count(*) FROM ar_btbs
UNION ALL SELECT 'products',     count(*) FROM products
UNION ALL SELECT 'stock_ledger', count(*) FROM stock_ledger
UNION ALL SELECT 'warehouses',   count(*) FROM warehouses
UNION ALL SELECT 'assets',       count(*) FROM assets;
-- INTERPRETASI: angka 0 / sangat kecil (<~10) = kemungkinan dummy → aman.
--   sp_items/ar_ttfs ratusan+ = ADA histori transaksi real → JANGAN drop, backup + arsip dulu.

-- C2. products: jasa vs barang + berapa aktif
SELECT is_service, count(*) AS n, sum((is_active)::int) AS aktif
FROM products WHERE deleted_at IS NULL GROUP BY is_service;
-- INTERPRETASI: is_service=true = jasa MSI (dipakai Quotation) → WAJIB dipertahankan.
--   is_service=false = barang trading. Kalau barang banyak & real → bukan dummy.

-- C3. products dipakai stock_ledger? (yang TIDAK BOLEH dihapus krn FK RESTRICT)
SELECT count(DISTINCT product_id) AS produk_terpakai_di_ledger FROM stock_ledger;
-- INTERPRETASI: >0 = ada produk yang di-RESTRICT FK → DROP products akan GAGAL
--   sampai stock_ledger dikosongkan dulu.

-- C4. products dipakai di Quotation? (heuristik nama, krn quotation_items TANPA product_id)
SELECT count(*) AS quotation_items_match_nama_produk
FROM quotation_items qi
WHERE EXISTS (SELECT 1 FROM products p WHERE lower(p.name) = lower(qi.description) AND p.deleted_at IS NULL);
-- INTERPRETASI: quotation_items TIDAK punya product_id (link UI-only), jadi ini cuma
--   heuristik kecocokan teks. Berapa pun hasilnya, autocomplete Quotation TETAP baca
--   tabel products live → products tidak boleh dikosongkan tanpa mengganggu Quotation.

-- C5. sp_items: volume + distinct SP + rentang tanggal
SELECT count(*) AS rows, count(DISTINCT sp_no) AS sp_count,
       min(sp_date) AS sp_pertama, max(sp_date) AS sp_terakhir,
       count(DISTINCT customer_id) AS customers
FROM sp_items;
-- INTERPRETASI: rentang tanggal lebar + ratusan SP = data produksi real (arsip dulu).
--   1-2 SP / tanggal sempit / customer 1 = sandbox/dummy → aman.

-- C6. sp_items: contoh 5 baris terbaru (lihat apakah nama barang real spt "STORBIT LOYANG…")
SELECT sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc, kirim, inv, fp
FROM sp_items ORDER BY created_at DESC LIMIT 5;

-- C7. AR: ada histori invoice/pembayaran real?
SELECT (SELECT count(*) FROM ar_ttfs) AS ttf_rows,
       (SELECT count(*) FROM ar_btbs) AS btb_rows,
       (SELECT count(*) FROM ar_btbs WHERE payment > 0) AS btb_dengan_pembayaran,
       (SELECT coalesce(sum(payment),0) FROM ar_btbs) AS total_pembayaran_tercatat;
-- INTERPRETASI: btb_dengan_pembayaran>0 / total_pembayaran besar = histori keuangan
--   REAL → JANGAN drop, ini bukti tagihan; backup wajib.

-- C8. Integritas link AR→SP (no_sp menunjuk SP yang ada?)
SELECT count(*) AS ttf, sum((EXISTS (SELECT 1 FROM sp_items s WHERE s.sp_no = t.no_sp))::int) AS no_sp_valid
FROM ar_ttfs t WHERE coalesce(t.no_sp,'') <> '';
-- INTERPRETASI: kalau no_sp_valid << ttf, link by-text sudah banyak putus (data lemah).

-- C9. stock_ledger & warehouses: infra inventory sudah dipakai atau kosong?
SELECT (SELECT count(*) FROM stock_ledger) AS ledger_rows,
       (SELECT count(*) FROM warehouses)   AS warehouse_rows,
       (SELECT count(*) FROM stock_summary) AS summary_rows;
-- INTERPRETASI: ledger_rows kecil/0 = inventory belum jalan → aman truncate/rebuild.

-- C10. assets: ada aset real (jangan ikut terhapus saat clean-start Storbit)?
SELECT count(*) AS assets, count(*) FILTER (WHERE deleted_at IS NULL) AS aktif,
       coalesce(sum(purchase_price),0) AS total_nilai FROM assets;
-- INTERPRETASI: assets adalah modul TERPISAH — apa pun hasilnya, JANGAN sertakan
--   dalam clean-start Storbit/Inventory-barang.
```

### 4. Rekomendasi clean start (analisis, BUKAN eksekusi)

> Tergantung hasil §3. Pola di bawah berdasarkan keterkaitan; angka final dari Den.

**🟢 AMAN di-drop / truncate total (bila §3 membuktikan dummy/kosong) — klaster Storbit:**
- `sp_items`, `sp_btbs`, `ar_btbs`, `ar_ttfs` — FK-isolated, FE hanya Storbit/db.js. Tak ada modul lain yang rusak.
- **Urutan aman** (child → parent): `ar_btbs` → `ar_ttfs` (ar_btbs CASCADE, jadi drop ar_ttfs otomatis bawa ar_btbs, tapi eksplisit lebih aman) → `sp_btbs` → `sp_items`. (sp_btbs/ar_ttfs hanya link string ke sp_items, tak ada FK → urutan bebas, tapi konsisten child-dulu.)
- **TRUNCATE vs DROP:** kalau struktur mau dipertahankan (rebuild FE belum), cukup **TRUNCATE** (kosongkan) — lebih aman & reversible-secara-struktur. **DROP** hanya kalau benar-benar ganti skema baru.

**🔴 JANGAN DROP (dipakai modul live lain):**
- **`products`** — dipakai **Quotation MSI** (autocomplete) + Inventory + Master. Drop/truncate = autocomplete Quotation kosong + Penerimaan rusak + FK RESTRICT dari `stock_ledger` bisa memblokir. Bila mau "bersihkan barang Storbit" dari products: **hapus selektif `WHERE is_service=false` saja** (sisakan jasa MSI), itupun cek dulu C3 (FK ledger) & dampak.
- **`assets` + sub-tabel** — modul Asset Management terpisah & live. **Di luar scope.**

**🟡 Cukup DIPERLUAS / TRUNCATE (bukan diganti) — infra Inventory:**
- `stock_ledger`, `warehouses`, view `stock_summary` — ini **infra inventory baru** (kemungkinan minim data, cek C9). Untuk clean-start Warehouse: **TRUNCATE `stock_ledger`** (rebuild dari opname awal) lebih tepat daripada DROP; `warehouses` cukup di-seed ulang. **Jangan DROP `products`** (dipakai Quotation) — kalau perlu SKU barang terstruktur, **PERLUAS** `products` (atau pisah tabel `goods`/`skus` baru) ketimbang ganti.
- `stock_summary` VIEW: bila `stock_ledger` di-rebuild, view ikut valid otomatis (tak perlu drop).

**💾 WAJIB backup dulu (sebelum apa pun):**
- `sp_items`, `sp_btbs`, `ar_ttfs`, `ar_btbs` — **bila C5/C7 menunjukkan data real** (histori SP & keuangan/tagihan = bukti transaksi; jangan hilang tanpa arsip). Backup = `pg_dump` per-tabel / `CREATE TABLE *_archive AS SELECT * …`.
- `products` (seluruhnya) — sebelum hapus selektif barang.
- Snapshot penuh DB (`pg_dump`) sebelum clean-start apa pun.

**Urutan aman bila jadi clean-start (asumsi data Storbit dummy, products dipertahankan):**
1. Backup penuh (`pg_dump`) + arsip 4 tabel Storbit.
2. TRUNCATE `ar_btbs` → `ar_ttfs` → `sp_btbs` → `sp_items` (atau DROP jika skema baru, child→parent).
3. **JANGAN sentuh** `products` (kecuali hapus selektif `is_service=false` setelah cek C3), `assets`, `accounts`.
4. Untuk Inventory: TRUNCATE `stock_ledger` (rebuild), re-seed `warehouses`; PERLUAS `products` untuk SKU barang (bukan drop).

### 5. Catatan terbuka

1. **[products = titik kritis]** Satu tabel `products` melayani **Quotation MSI (jasa)** + **Inventory/barang**. Clean-start Storbit **tidak boleh** mengosongkan products. Keputusan desain: pisahkan jasa vs barang (tabel terpisah) sebelum clean-start, agar barang Storbit bisa dibersihkan tanpa mengganggu Quotation.
2. **[Link by-text rapuh]** `sp_btbs.sp_no`, `ar_ttfs.no_sp` = string, bukan FK. Saat clean-start, tak ada CASCADE yang menjaga konsistensi — verifikasi C8 untuk tahu seberapa banyak link sudah putus.
3. **[ar_btbs CASCADE]** Drop/truncate `ar_ttfs` otomatis menghapus `ar_btbs` (CASCADE) — pastikan ini disengaja (histori pembayaran ikut hilang). Backup dulu (C7).
4. **[stock_ledger RESTRICT]** Bila `stock_ledger` punya baris, DROP `products`/`warehouses` **diblokir** DB → harus kosongkan ledger dulu (cek C3/C9).
5. **[Scope]** `assets` + modul Asset Management **bukan** bagian Storbit/Inventory-barang — jangan masuk daftar clean-start meski namanya "inventory/aset".
6. **[Data real vs dummy]** Verdict final tergantung §3. Bila C1/C5/C7 menunjukkan ratusan baris + rentang tanggal lebar + pembayaran tercatat → **itu data produksi**, clean-start = migrasi+arsip, bukan drop polos.

---
---

# AUDIT — Navigasi & Multi-Entity (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `src/App.jsx`, `src/modules/launcher/AppLauncher.jsx`, `src/pages/foundation/admin-settings/kit.jsx`, `supabase/schema_snapshot.sql`.

## INVESTIGASI — NAVIGASI & MULTI-ENTITY

### 1. Struktur menu / sidebar sekarang

- **Definisi menu:** konstanta **`ERP_MENU_GROUPS`** (`App.jsx:430`) — **array of groups**, tiap group `{ label, items: [...] }`. Item = `{ id, label, icon, public?, role?, module?, children?[] }` atau `{ section: '…' }` (divider). **Nested s/d 3 level** (group → item → children → grandchildren, mis. `crm-customers` → `crm-customers-msi`). `allMenuGroups = ERP_MENU_GROUPS` (`:1923`, tanpa filter tambahan).
- **Routing:** state-based, **bukan react-router.** `activeModule` (group aktif) + `activeMenu` (id halaman) — keduanya **di-persist ke `localStorage`** (`nexus_last_module`/`nexus_last_menu`, `:1280-1283`). Klik item → `setActiveMenu(item.id)` (`:1004/1050/1074/1120/1157`). Render = **switch id-based** di JSX: `{activeMenu === 'xxx' && <Page/>}` (ratusan blok). `navigate(menuId)` (`:1379`) + `enterModule(group)` (`:1524`).
- **App Launcher** (grid modul): `AppLauncher` (`src/modules/launcher/AppLauncher.jsx:266`), props `{ moduleGroups, onSelect, profile, hasPermission, hasMenuPermission, permissionsLoading }`. Dirender saat **`!activeModule`** (`App.jsx:2317-2327`); `onSelect={enterModule}`. Sidebar muncul **setelah** pilih modul ("Option B: sidebar-after-launcher", `:2006`). Jadi pola sekarang = **pilih MODUL dulu → sidebar modul → halaman.**
- **REAL vs ComingSoon:** `isPlanned(id)` (`:899`) — `PLANNED_MODULES` map (`:287`, judul ComingSoon) + `PLANNED_REAL_IDS` (`:897`) + `PLANNED_REAL_PREFIXES` (`:898`, `assets/hrga/crm-/quotation-/inventory-/customer-/admin-settings`). Render: `{PLANNED_MODULES[activeMenu] && <ComingSoonPage/>}` (`:2383`) + catch-all.

**Grup & status (ringkas, dari `ERP_MENU_GROUPS`):**
| Grup | Item REAL | Item ComingSoon |
|---|---|---|
| Core | `dashboard` (+sub planned) | dashboard-tasks/notifications/activity |
| Commercial & CRM | `crm-dashboard/-pipeline/-prospects/-inquiry/-lead-pool/-lead-pool-approval/-calls/-activity-log`, `quotation-draft`, **`crm-rate-list`**, `crm-customers-msi/jci/soa/free` | — (CRM hampir semua live) |
| Logistics | `manifest`(SP Manifest)/`input`(Input SP)/`shipment` | `trading*`, `job*`, `freight*`, `ppjk*` |
| Procurement & Vendor | — | semua (`procRequest*`/`purchaseOrder*`/`vendors*`) |
| Inventory | `inventory-dashboard/-stok/-penerimaan` | `-pengeluaran/-transfer/-opname` |
| Finance & Accounting | `ar`, `outstanding`, `finance` | jobCosting/billing/ap/cashBank/accounting |
| Asset Management | `assets*` (Shell live) | — |
| HRGA, Admin Settings, Reporting | `hrga*`, `admin-settings-*`, `reporting-sales/-mom`, `users`, `admin`, `schema-manager` | reporting-form-report dll |

> Menu disusun **per FUNGSI/modul**, bukan per entitas. Entitas hanya muncul sebagai **sub-item** (`crm-customers-msi/jci/soa`) + **divider label** di Logistics ("Storbit — Trading", "MSI — Freight Forwarding", "JCI — PPJK").

### 2. Entity / Company — apa yang sudah ada

- **Tabel `companies`** (`schema:companies`) — **FLAT, TIDAK ada hierarki.** Tak ada `parent_id`/`parent_company_id`/`group_id` (parent_id hanya di `chart_of_accounts` & `departments`, **bukan** `companies`). MSI/JCI/SOA = **sibling sejajar**. Kolom: `code`, `name`, `legal_name`, `business_focus`, `default_currency`, `timezone`, dll. UUID (dari CLAUDE.md/kode): MSI `0e1840d8-…`, JCI `42569e7c-…`, SOA `d2e5e565-…`.
- **🔴 "Entity selector" di header utama = STATIC, TIDAK BERFUNGSI.** `App.jsx:2133-2141` — `<button>` menampilkan "MSI / JCI / Storbit" + `ChevronsUpDown`, **TANPA `onClick`/state**. Murni dekoratif/placeholder; **tak mengubah apa pun.**
- **EntitySwitcher yang BENAR-BENAR bekerja** = komponen kit `EntitySwitcher` (`kit.jsx:141`, value/onChange, slider 3 entitas) — **HANYA dipakai di 4 halaman Admin Settings**: `ApprovalWorkflowsPage` (`:782`), `FinanceDefaultsPage` (`:322`), `GeneralPreferencesPage`, `SecurityPolicyPage`. State **lokal per-halaman** (`entity` + `switchEntity`), men-scope **SETTINGS** per entitas via `ENTITY_ID_BY_CODE`. **Bukan** konteks navigasi global.
- **Yang berubah saat ganti entity (di admin-settings):** hanya `company_id` untuk fetch/simpan settings halaman itu (mis. finance defaults per entitas). Di luar admin-settings, **tak ada switcher** — scoping data lewat `profile.company_id` (lihat bawah).
- **`company_id` konsistensi:** **±56 tabel punya `company_id`** (mayoritas ERP: accounts, products, warehouses, stock_ledger, assets, quotations, inquiries, profiles, user_roles, payment_terms, taxes, dll). **🔴 FLAT (tanpa `company_id`):** `sp_items`, `sp_btbs`, `ar_ttfs`, `ar_btbs` (Storbit legacy), dan `quotation_items` (child, ikut parent `quotations`). → Storbit legacy **tak ter-scope entitas** di DB.
- **`profile.company_id`:** **entitas "rumah" user (tunggal, NOT NULL** sejak Phase 1.0F). `get_user_company_id()` (RLS) mengembalikan ini. **Scoping data per-entitas** = pola `isAllEntities = ['super_admin']` (super lihat semua) vs non-super di-`.eq('company_id', profile.company_id)` — **didefinisikan PER-HALAMAN** (mis. `ProspectListPage:89`, `InquiryListPage:170`, `QuotationListPage:90`, `PipelineKanbanPage:540`, … `InventoryDashboardPage:454` pakai `['super_admin','admin']`). **Tidak terpusat.**
- **User multi-entitas?** `user_roles` punya `company_id` + `UNIQUE(user_id, role_id, company_id)` (`schema:4583`) → **secara DB user BISA punya role di banyak company.** TAPI FE `profile.company_id` **tunggal** → praktis **non-super user terikat 1 entitas** (rumahnya); hanya **super_admin** yang lihat lintas-entitas (`isAllEntities`). Tak ada UI untuk user biasa berpindah entitas aktif.
- **UUID entitas di-HARDCODE & duplikat** di banyak file (tak ada modul konstanta tunggal): `CRMReportPage:56`, `PositionsPage:49`, `OrgStructurePage:15`, `AssetDashboardPage:44`, admin-settings (`ApprovalWorkflowsPage:28`, `FinanceDefaultsPage:22`, `GeneralPreferencesPage:29/34`).

### 3. Role & akses per entitas

- **Gate menu:** `canSeeMenuItem(item, role, hasPermission, hasMenuPermission)` (`App.jsx:876`). Prioritas: `section`→true → **`public:true`**→true → **`hasMenuPermission(MENU_KEY_MAP[id], 'view')`** (per-user RBAC) → `hasPermission` → **`item.role` array** includes role → **default DENY**. `MENU_KEY_MAP` (`:804`) memetakan id menu → key permission.
- **Route guard:** `canRenderPage(menuId)` (`:1311`) **reuse `canSeeMenuItem`** (defense-in-depth) + `findMenuItemById`. `isPlanned` → ComingSoon.
- **Gate berbasis:** `role` (erpRole dari `user_roles`) + per-user `user_menu_permissions` (hasMenuPermission). **TIDAK ADA dimensi entitas di gate menu** — gate murni role/permission, bukan "boleh entitas X".
- **"User X cuma boleh entitas Y"?** **TIDAK ADA di level menu/UI.** Yang ada: **data-scoping** via `profile.company_id` + RLS `get_user_company_id()` (non-super hanya lihat barisnya sendiri). Jadi pemisahan entitas terjadi di **DATA (RLS/query)**, bukan di **NAVIGASI/menu**. Semua user lihat **struktur menu yang sama**; isinya yang ter-filter per company.
- **Reuse untuk entity-scoping nanti:** `profile.company_id` + `isAllEntities` + RLS `get_user_company_id()` sudah jadi fondasi; `canSeeMenuItem`/`MENU_KEY_MAP` bisa diperluas dengan dimensi entitas (lihat §5).

### 4. Ketergantungan — apa yang kena bila navigasi dirombak

- **🔴 Render switch id-based (ratusan blok `activeMenu === 'id'`)** di `App.jsx` — **setiap halaman terikat ke string id menu spesifik**. Mengganti/menyusun ulang id = harus update semua blok render + `MENU_KEY_MAP` + `PLANNED_REAL_IDS`/`PLANNED_REAL_PREFIXES` + `isPlanned`.
- **`localStorage` deep-link** (`nexus_last_module`/`nexus_last_menu`, `:1280-1283`) — menyimpan **id menu** terakhir; user dengan id lama tersimpan akan mengarah ke id yang mungkin berubah (perlu fallback/migrasi key).
- **Hardcode id menu** di luar render: `MENU_KEY_MAP` (`:804`), `PLANNED_REAL_IDS` (`:897`), `PLANNED_REAL_PREFIXES` (`:898`), navigasi notifikasi (bell → `reference_type`→menu id, mis. `:1505-1506`), tombol topbar (`navigateTo('hrga-pending-approval')` `:2143`, `navigateTo('adminSettings')` `:2273`), redirect `'inventory'→'inventory-stok'` (`:1641`), `assets-detail` (`:1402`).
- **Entity sub-menu hardcoded:** `crm-customers-msi/jci/soa` → `CustomerListPage entityFilter="MSI/JCI/SOA"` (`:2754-2773`). Ini **satu-satunya** tempat navigasi sudah "entity-scoped" (via prop), pola yang bisa dicontoh.
- **Divider label entitas di Logistics** (`:480/496/522`) — kosmetik, mudah dipindah.
- **Risiko utama (CRM MSI produktif):** CRM tidak terikat ke entity-context global (scoping via `profile.company_id` + `isAllEntities` per halaman). **Selama id menu CRM (`crm-*`, `quotation-draft`) & `profile.company_id`/RLS tidak diubah, CRM MSI tetap jalan.** Yang berisiko memecah CRM = (a) mengganti id menu `crm-*`, (b) menyisipkan entity-context yang meng-override `profile.company_id` sehingga query CRM ter-scope ke entitas salah, (c) mengubah `canSeeMenuItem` hingga item CRM ter-deny.

### 5. Penilaian transisi ke "Entity Launcher"

**Besarnya perubahan:** **SEDANG, bisa BERTAHAP (wrapper di atas struktur existing)** — tidak harus rombak total. Alasan: navigasi sudah berlapis (launcher → module → page), tinggal **menambah satu lapis "entity" di DEPAN** launcher + sebuah **EntityContext** yang men-set `activeEntity`.

**Bisa dipakai ulang (JANGAN bikin baru):**
- `companies` (master entitas, sudah ada) + UUID konstanta (tinggal **disatukan** jadi satu modul, hilangkan duplikasi).
- `EntitySwitcher` kit (`kit.jsx:141`) — komponen UI switcher sudah ada & teruji (admin-settings) → bisa diangkat jadi global.
- `profile.company_id` + `isAllEntities` + RLS `get_user_company_id()` — fondasi scoping data per-entitas.
- `ERP_MENU_GROUPS` + `canSeeMenuItem` + `isPlanned` — struktur menu & gate tetap dipakai; cukup **difilter per entitas**.
- Pola `entityFilter` prop (CustomerListPage) — contoh meneruskan entitas ke halaman.

**Yang BARU diperlukan:**
- **EntityContext global** (`activeEntity` state + provider) — sumber kebenaran entitas terpilih, persist ke localStorage (mis. `nexus_active_entity`). **Mengganti** static button header (`:2133`) jadi `EntitySwitcher` fungsional.
- **Metadata entitas→modul** di `ERP_MENU_GROUPS`: tandai tiap group/item milik entitas mana (mis. `entities: ['MSI']` untuk Freight, `['SOA']` untuk Storbit-Trading, `['*']` untuk lintas spt CRM/HRGA/Admin). Lalu filter launcher/sidebar by `activeEntity`.
- **Guard entitas** (opsional): batasi `activeEntity` ke entitas yang user berhak (dari `user_roles.company_id` list), bukan hanya `profile.company_id` tunggal — agar user multi-entitas (yang sudah didukung DB) bisa berpindah.

**Rekomendasi pendekatan transisi paling AMAN (bertahap):**
1. **Fase 0 — Konsolidasi konstanta entitas** (refactor murni, no behavior): satu modul `entities.js` (UUID↔code↔name↔color), ganti semua hardcode. Nol risiko fungsional.
2. **Fase 1 — EntityContext + switcher fungsional**, tapi **default `activeEntity = profile.company_id`** dan **belum memfilter menu** (hanya meng-set context + label header benar). CRM tetap pakai `profile.company_id`/`isAllEntities` apa adanya → **CRM MSI tidak tersentuh.**
3. **Fase 2 — Tag `entities` di `ERP_MENU_GROUPS`** + filter **launcher** (grid) by `activeEntity`. Sidebar/halaman belum diubah. Item lintas-entitas (`*`) selalu tampil. Uji CRM MSI tetap muncul saat entity=MSI.
4. **Fase 3 — Halaman membaca `activeEntity`** (gantikan/atur `profile.company_id` untuk super_admin agar bisa "masuk sebagai" entitas tertentu), per-halaman, **dimulai dari modul non-kritis** (mis. Inventory/Storbit), CRM **paling akhir** setelah terbukti aman.
5. **Pertahankan id menu** (`crm-*`, `quotation-draft`, dll) **tidak berubah** sepanjang transisi → render switch & localStorage deep-link tetap valid.

> Prinsip: **tambah lapis entitas di ATAS struktur existing (wrapper), jangan ganti id/route**. CRM MSI yang produktif aman selama id menu & scoping `profile.company_id`/RLS tidak diubah; entity-launcher cukup memilih SUBSET modul yang ditampilkan, bukan mengganti mesin routing.

### 6. Catatan terbuka

1. **[Switcher palsu]** Header "MSI / JCI / Storbit" (`App.jsx:2133`) **tidak berfungsi** — keputusan: jadikan `EntitySwitcher` kit fungsional + EntityContext, atau buang. (UI sudah menjanjikan fitur yang belum ada.)
2. **[Companies flat]** Tak ada hierarki company (parent/child). Bila "Company Tree" ERP diinginkan (holding→anak), perlu **tambah `companies.parent_id`** (perubahan DB, approval). Saat ini 3 entitas sejajar.
3. **[User multi-entitas]** DB sudah dukung (`user_roles.company_id` multi), tapi FE `profile.company_id` tunggal. Entity-launcher untuk non-super butuh: daftar entitas yang boleh diakses user (dari `user_roles`) + mekanisme "switch active entity" yang aman terhadap RLS (RLS pakai `get_user_company_id()` = profiles.company_id tunggal → **bila user berpindah entitas, RLS tak otomatis ikut** kecuali super_admin). **Ini ganjalan terbesar:** RLS non-super mengunci ke `profiles.company_id`; entity-switch untuk non-super perlu desain RLS baru (mis. cek keanggotaan `user_roles`).
4. **[Storbit flat tanpa company_id]** `sp_items`/`ar_*` tak punya `company_id` → tak bisa di-scope per entitas di entity-launcher tanpa menambah kolom (lihat audit Clean Start). Bila Storbit jadi "modul milik SOA", perlu `company_id` atau filter via `customer.owner_company_id`.
5. **[Konstanta tersebar]** UUID entitas hardcode di ≥7 file → konsolidasi dulu (Fase 0) sebelum transisi, agar satu sumber kebenaran.
6. **[Scoping per-halaman]** `isAllEntities`/`company_id filter` didefinisikan ulang di tiap halaman (tak terpusat) → saat menambah dimensi `activeEntity`, perlu pola terpusat (hook `useActiveEntity`) agar konsisten & tak ada halaman yang terlewat.

---
---

# AUDIT — State of Nexus (Konsolidasi) (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `supabase/schema_snapshot.sql` (84 tabel), `src/App.jsx`, `src/contexts/AuthContext.jsx`, grep `src/`, `docs/`. Data DB (isi) TIDAK di-query — query disediakan untuk Den di akhir.

## INVESTIGASI — STATE OF NEXUS (KONSOLIDASI)

### BAGIAN A — Konsolidasi audit sebelumnya (pointer, bukan ulang)

**Navigasi & multi-entity** (§"Navigasi & Multi-Entity"):
- Entity selector di header utama (`App.jsx:2133`) **palsu** (button tanpa onClick). EntitySwitcher fungsional hanya di 4 page admin-settings.
- `companies` **FLAT** (tak ada parent_id/hierarki). Routing **id-based state** (`activeMenu`) + localStorage deep-link.
- **RLS non-super mengunci ke `profiles.company_id` tunggal** → entity-switch untuk user biasa = landmine (RLS tak ikut berpindah). Gate menu tak punya dimensi entitas.

**Storbit/SP flow** (§"Flow Storbit End-to-End" + §"Kesiapan Clean Start"):
- `sp_items` tanpa kolom `status` (Konfirmasi/Tolak **no-op**), tanpa `company_id`, nomor SP timestamp-client. PPN dihitung FE (tak disimpan).
- `sp_items`/`sp_btbs`/`ar_ttfs`/`ar_btbs` **RLS `USING(true)`** + tanpa `company_id` → terbuka semua authenticated, flat lintas-entitas.
- SP↔stok↔products **tak tersambung** (stok manual). SP↔invoice link by **text** (`no_sp`), `sp_items.inv` vs `ar_ttfs` tak sinkron.
- 4 tabel Storbit FK-isolated → aman drop/truncate (verifikasi count dulu); `products` **tidak** (dipakai Quotation MSI).

**Warehouse/Inventory** (§"Inventaris Warehouse & Inventory"):
- Sudah ada: `stock_ledger` (movement lengkap) + view `stock_summary` (on_hand/reserved/available) + `warehouses` + 3 FE live (Dashboard/Stok/Penerimaan). Belum: opname, outbound/transfer FE, on-hold, SKU terstruktur.

**Konflik data** (§"PPN per-item" + §"payment_terms" + §"Warehouse"):
- `products` **mencampur jasa (MSI freight) & barang (SOA trading)** dalam satu tabel → hapus barang berisiko ganggu Quotation.
- `payment_terms` duplikat 3× **by-design** (company-scoped) — JANGAN merge; rename memecah `isTempoTerm` (match by nama).
- Quotation PPN level-header (`vat_rate`), per-item butuh kolom baru + ubah RPC (risiko wipe item saat edit).

### BAGIAN B — Gap yang belum diaudit

#### B1. Peta menu & modul (sumber `ERP_MENU_GROUPS` `App.jsx:430`)

**11 grup (app launcher), status REAL vs ComingSoon (CS):**

| Grup | REAL | ComingSoon |
|---|---|---|
| **Core** | `dashboard` | dashboard-tasks/-notifications/-activity (sub) |
| **Commercial & CRM** | `crm-dashboard`,`crm-pipeline`,`crm-prospects`,`crm-inquiry`,`quotation-draft`,`crm-rate-list`,`crm-lead-pool`,`crm-lead-pool-approval`,`crm-calls`,`crm-activity-log`,`crm-customers-msi/jci/soa/free` | — |
| **Logistics** | `manifest`(SP Manifest),`input`(Input SP),`shipment` | `trading*`,`job*`,`freight*`(FCL/LCL/Air),`ppjk*`(PIB/PEB/BC11/23/30/trucking) |
| **Procurement & Vendor** | — | `procRequest*`,`purchaseOrder*`,`vendors*` (semua) |
| **Inventory** | `inventory-dashboard`,`inventory-stok`,`inventory-penerimaan` | `-pengeluaran`,`-transfer`,`-opname` |
| **Finance & Accounting** | `ar`,`outstanding`,`finance` | `jobCosting`,`billing`,`ap`,`cashBank`,`accounting` |
| **Service Management** | — | semua (IT Service/ticket) |
| **Workflow & Document** | `hrga*` (HrgaShell), `hrga-pending-approval` | `approvals`(Approval Center),`document*` |
| **Portal & Integration** | `admin-settings-integrations` | Customer/Vendor Portal, API center |
| **Reporting & Governance** | `reporting-sales`,`reporting-mom`,`admin-settings-audit` | `reporting-form-report`, dll |
| **Foundation** | `admin`(Master Data),`users`,`admin-settings-*`(general/security/finance/entity/approvals/documents/notifications),`schema-manager`,`products`,`product-detail` | — |

**Ringkasan kematangan:** **Produktif/REAL** = CRM (penuh), Logistics-Storbit (SP/Shipment), Inventory (3 hal), Finance-AR, HRGA, Asset, Admin/Foundation, Reporting (Sales/MOM). **ComingSoon (mayoritas placeholder):** Procurement, Service Management, Freight/PPJK/Job (MSI/JCI ops), Portal, Accounting/Billing/AP/Cash, Document/Approval-Center. → **~5-6 domain live, ~4-5 domain masih kerangka.**

#### B2. Permission / Access / Role

**14 role kanonik** (`AuthContext.jsx:10` `ERP_ROLE_PRIORITY`): `super_admin, admin, ceo, gm, manager, supervisor, finance_controller, finance, operations, sales, procurement, hrga, it, viewer`.

**DUA sistem permission (paralel):**
1. **RBAC granular (UI/per-user):** tabel `modules`→`module_menus`→`menu_actions`/`module_actions` + `user_menu_permissions` (per-user) + `role_permission_templates` + `permissions`+`role_permissions`. FE gate via **`hasMenuPermission(MENU_KEY_MAP[id],'view')`** (baca `user_menu_permissions`). DB function **`has_permission(module,action)`** join `user_roles→roles→role_permissions→permissions`.
2. **RLS hardcoded-role helpers:** dipakai di policy DB (lihat fungsi bawah).

- **`has_permission()` TIDAK query tabel hantu** — semua tabel (`role_permissions`,`permissions`) **nyata & ada**. Tapi **bergantung SEED**: bila `permissions`/`role_permissions` kosong → selalu false. **Verifikasi seed via query Q-P1/Q-P2.** (CLAUDE TD-02 menandai "unseeded/broken" → kemungkinan tabel ada tapi belum di-seed → sistem RBAC granular **dormant**, yang aktif = role-array di menu + `is_*` helper + per-user `user_menu_permissions`.)
- **Gate menu aktif** (`canSeeMenuItem` `App.jsx:876`): `section`→true → `public:true`→true → `hasMenuPermission(menuKey,'view')` (jika ada `MENU_KEY_MAP`) → `hasPermission` → `item.role[]` includes → **default DENY**. `canRenderPage` (`:1311`) reuse (route-guard).
- **Role-array eksplisit di menu** hanya sebagian item (mis. `crm-prospects`,`crm-rate-list`,`crm-lead-pool-approval`,`input`,`shipment`,`ar`,`outstanding`); sisanya andalkan `public:true` atau `hasMenuPermission`. → **Tak ada matriks role×modul yang deklaratif lengkap** di kode; gating tersebar (role-array + per-user permission + public flag).

**Fungsi RLS helper (security-definer) + pemakaian:**
| Fungsi | Logika | Dipakai |
|---|---|---|
| `is_super_admin()` | role `super_admin` (atau legacy `profiles.role='super'`) | bypass top-level banyak policy |
| `is_admin_or_above()` | role IN (super_admin, **admin**) — **TIDAK kenal manager/ceo** | policy lama (TD-01) |
| `is_manager_or_above()` | role IN (super_admin,admin,ceo,gm,manager,**supervisor**) | policy CRM/transaksional (TD-01 fixed) |
| `get_user_company_id()` | `profiles.company_id` (tunggal) | **semua policy company-scoped** |
| `get_user_role_code()` | role tertinggi (super>admin>else) | util |
| `has_role(code)` | cek 1 role | util/policy |
| `has_permission(mod,act)` | RBAC granular (role_permissions) | jarang di policy (dormant?) |

> **TD-01:** beberapa policy masih `is_admin_or_above()` (manager/ceo tak lolos) — PARTIAL fixed. **TD-02:** `has_permission`/RBAC granular kemungkinan unseeded → dormant.

#### B3. Database — inventaris (84 tabel + 1 view)

**Flag per tabel** (cols/RLS/policy/company_id(C)/deleted_at(D)) — *companies RLS=Y (koreksi)*:

`accounts`65 Y4 C D · `activities`24 Y4 C D · `activity_logs`7 Y4 - - · `app_settings`7 Y3 C - · `approval_delegations`13 Y3 C - · `approval_logs`13 Y2 C - · `approval_rules`16 Y3 C - · **`approval_workflow_steps`10 N0 - -** · **`approval_workflows`10 N0 C -** · `ar_btbs`8 Y3 - - · `ar_ttfs`11 Y4 - - · `asset_categories`12 Y3 C D · `asset_fuel_logs`14 Y3 C D · `asset_locations`11 Y3 C D · `asset_maintenance_records`15 Y3 C D · `asset_network`18 Y3 C D · `asset_software_licenses`15 Y3 C D · `asset_specifications`38 Y3 C D · `assets`44 Y3 C D · `audit_logs`15 Y2 C - · `branches`11 Y3 C D · `chart_of_accounts`15 Y3 C D · **`code_counters`3 N0 - -** · `companies`23 Y2 - - · `cost_centers`12 Y3 C D · `currencies`7 Y2 - - · `customers`34 Y3 C D · `deal_handovers`50 Y3 C - · `departments`10 Y3 C D · **`document_numbering`14 N0 C -** · `document_sequences`9 Y3 C - · **`document_templates`14 N0 C -** · `document_types`15 Y3 C - · `dropdown_options`11 Y4 C D · **`entity_bank_accounts`12 N0 C -** · **`entity_finance_settings`17 N0 C -** · **`entity_signatories`11 N0 C -** · `exchange_rates`10 Y2 C - · `hrga_approval_configs`10 Y3 C - · `hrga_notification_queue`11 Y3 C - · `hrga_offboarding_checklists`14 Y3 C D · `hrga_offboarding_items`13 Y4 - - · `hrga_request_approvals`9 Y2 - - · `hrga_request_attachments`9 Y3 - D · `hrga_request_items`11 Y4 - - · `hrga_request_types`18 Y3 C D · `hrga_requests`28 Y4 C D · `inquiries`32 Y3 C D · `meeting_moms`21 Y4 C - · `menu_actions`5 Y2 - - · `module_actions`5 Y2 - - · `module_menus`7 Y2 - - · `modules`6 Y2 - - · `mom_action_plans`10 Y4 - - · `mom_improvements`6 Y4 - - · `mom_issues`7 Y4 - - · `mom_progress_updates`8 Y4 - - · **`notification_rules`14 N0 C -** · `notifications`11 Y4 C - · `payment_terms`11 Y3 C D · `permissions`5 Y2 - - · `positions`11 Y3 C D · `products`30 Y3 C D · `profiles`25 Y4 C - · `quotation_items`14 Y4 - - · `quotations`42 Y3 C D · `rate_sheets`10 Y4 C - · `role_permission_templates`5 Y2 - - · `role_permissions`6 Y3 - - · `roles`11 Y3 C D · `sales_calls`18 Y4 C - · `sales_visit_logs`7 **Y1** - - · `sales_visits`16 Y4 C - · `sp_btbs`5 Y4 - - · `sp_items`27 Y4 - - · `status_catalog`11 Y2 - - · `stock_ledger`14 Y3 C - · `taxes`14 Y3 C D · `top_requests`59 Y3 C - · `user_login_logs`7 **Y1** - - · `user_menu_permissions`8 Y2 C - · `user_roles`11 Y3 C - · `vendors`26 Y5 C D · `warehouses`9 Y2 C - · **VIEW** `stock_summary` (agregat stock_ledger).

**🔴 RLS DIMATIKAN (9 tabel — beberapa SENSITIF):** `entity_bank_accounts`, `entity_finance_settings`, `entity_signatories` (data bank/finance/ttd per-entitas!), `approval_workflows`, `approval_workflow_steps`, `notification_rules`, `document_numbering`, `document_templates`, `code_counters`. **Semua authenticated bisa baca/tulis** (hanya bergantung GRANT). **Severity: HIGH.**

**🔴 RLS `USING(true)` full-CRUD (terbuka):** `sp_items`(4), `ar_ttfs`(4), `ar_btbs`(3), `sp_btbs`(2). **Severity: HIGH** (data SP/AR/keuangan).

**🟡 Policy tidak lengkap (hanya 1 policy):** `sales_visit_logs`(1), `user_login_logs`(1) — kemungkinan hanya SELECT/INSERT, CRUD lain default-deny (mungkin disengaja utk log).

**🟡 Business table tanpa `company_id` (tak ter-scope entitas):** `sp_items`,`sp_btbs`,`ar_ttfs`,`ar_btbs` (Storbit), `quotation_items` (child quotations — OK via parent). Sisanya lookup/RBAC/child (acceptable).

**Functions (20):** RLS-helper (6, lihat B2) · `save_quotation` (RPC upsert quotation+items) · `increment_document_sequence` (nomor dokumen) · `generate_customer_code` (trigger) · `set_customer_on_won` · `track_stage_change` · `sync_deal_value_on_quotation_accept` (total→accounts.estimated_value) · `sync_profile_email` · `handle_new_user` (auth→profiles) · `capture_login_session` · `set_updated_at` · `int_to_roman` · `get_table_columns`,`exec_sql` (schema-manager).
**Triggers (~43):** mayoritas `*_updated_at` (timestamp) + `trg_gen_customer_code_*` + `trg_z_sync_deal_value` + `trg_z_track_stage_change` + `trg_set_customer_on_won` + `trg_z_sync_profile_email`.
**View (1):** `stock_summary`.

**Tabel dormant/kandidat drop:** `sales_calls`,`sales_visits`,`sales_visit_logs` (digantikan `activities` — TD-18/19), `customers` (legacy, digantikan `accounts` — pensiun), `customer` lama. `code_counters` (legacy counter, digantikan `document_sequences`). `customers` masih dibaca SP/AR? (cek; sebenarnya SP/AR pakai `accounts`). **Verifikasi pemakaian via grep/Q sebelum drop.**

#### B4. Progress — state

- **Fase terakhir (CLAUDE.md):** **2.15** (gate TOP Request by tempo). Rangkaian 2.11–2.15 = penyempurnaan CRM/Quotation/MOM/Rate/Asset/Inventory.
- **Produktif dipakai:** CRM (Prospect→Inquiry→Quotation→Pipeline→Customer), Storbit SP/Shipment/AR, HRGA Request, Asset, Admin/Master Data, Reporting Sales/MOM.
- **Live tapi minim/awal:** Inventory (Dashboard/Stok/Penerimaan saja), Rate Sheet (baru), Lead Pool.
- **Dummy/ComingSoon:** Procurement, Service Mgmt, Freight/PPJK/Job ops, Accounting/Billing/AP/Cash, Portal, Document/Approval-Center, Inventory Pengeluaran/Transfer/Opname.
- **Pending (CLAUDE):** drop `profiles.role` + `user_role_legacy` enum (tahap 4); drop `customers` table; refresh `schema_snapshot.sql` setelah perubahan SQL Editor.

#### B5. Tech debt — inventaris

| Item | Lokasi | Sev | Dampak |
|---|---|---|---|
| RLS OFF 9 tabel (entity_bank/finance/signatories dll) | schema (B3) | **HIGH** | Data bank/finance/ttd/approval terbuka semua authenticated |
| RLS `USING(true)` SP/AR | sp_items/ar_* | **HIGH** | Data SP/AR/keuangan tak ter-proteksi role/entitas |
| `sp_items` tanpa `status` (Konfirmasi/Tolak no-op) | `SalesOrderPage.jsx:60/493/502/660` | HIGH | Status SP tak persist; tombol palsu |
| RBAC granular (`has_permission`) unseeded/dormant | `permissions`/`role_permissions` (TD-02) | MED | Dua sistem permission; granular tak jalan |
| `is_admin_or_above()` di policy (manager/ceo tak lolos) | RLS (TD-01 PARTIAL) | MED | Akses oversight role terhalang/oversight |
| Storbit/AR tanpa `company_id` | sp_items/sp_btbs/ar_* | MED | Tak bisa entity-scope (landmine entity-launcher) |
| Entity selector header palsu | `App.jsx:2133` | MED | UI menjanjikan fitur belum ada |
| UUID entitas hardcode ≥7 file | CRMReport/Positions/OrgStructure/AssetDash/admin-settings | MED | Restruktur entity perlu konsolidasi dulu |
| Secrets di `app_settings`/localStorage (WA token/SMTP/API keys) | `IntegrationsPage.jsx:11/28/157` | MED | Kredensial plaintext (TD-36) |
| Hard-delete (bukan soft) SP/customer di beberapa aksi | `SalesOrderDetailPage.jsx:12` | MED | Data business hilang permanen |
| Health score CRM heuristik (TODO auto-calc) | `CustomerDetailPage.jsx:393/874` | LOW | Skor sementara |
| `customers` legacy + `sales_calls/visits` dormant belum drop | TD-18/19/20 | LOW | Tabel mati menumpuk |
| Audit log belum lengkap (login-only sebelumnya, audit_logs baru) | `AuditLogPage.jsx:10` | LOW | Diff viewer TODO |
| App.jsx god-file (~5.000 baris) | `src/App.jsx` | LOW | Maintainability (TD-12) |
| `products` jasa+barang campur; cogs_account_id vs cogs_account dup | products | MED | Lihat §Warehouse |
| 19 TODO + 1 XXX di 9 file | grep | LOW | Backlog kecil |

> Dua dokumen tech-debt: root `TECH_DEBT.md` (17 Jun, audit scan) + `docs/Governance/08_TECH_DEBT.md` (TD-01..TD-37 terstruktur). **Berpotensi tumpang-tindih/usang** — `docs/Governance/08` lebih kanonik.

#### B6. Dokumentasi — inventaris

**Root (.md):** `CLAUDE.md`★(30 Jun, entry-point), `PROGRESS.md`★(30 Jun, dev log), `AUDIT.md`(30 Jun, ini), `AGENTS.md`(17 Jun, identitas+safety), `README.md`(17 Jun), `TECH_DEBT.md`(17 Jun), `AUDIT_CRM.md`/`CRM_FLOW.md`/`ACTIVITY_UI_MAP.md`(17 Jun, CRM-spesifik).
**`docs/Governance/` (00–12):** PRD, Rules, Data Model, **04 Role-Permission Matrix**, Workflow Map, UI/UX, API, **08 Tech Debt**, **09 Roadmap**, Task Breakdown, QA, Change Request — set governance terstruktur.
**`docs/` lain:** architecture (blueprint/module-map/feature-registry/roadmap), database (schema-draft/entity-map/indexing/seed), security (baseline/permission-matrix/audit/retention/**rls-policy-draft**), workflow (approval-engine/numbering/status-lifecycle), operations (deployment/rls-hardening/staging-verification-log), performance, integration. `docs/progress.md` + `docs/project-audit.md` (mungkin duplikat root).

**Konsistensi/usang:**
- **CLAUDE.md sumber kebenaran** (30 Jun, fase 2.15). PROGRESS.md sinkron.
- **Usang/risiko kontradiksi:** CLAUDE.md menyebut "73 tabel" → **aktual 84** (snapshot lebih baru). `docs/Governance/03_DATA_MODEL.md` kemungkinan masih 73. Root `TECH_DEBT.md` (17 Jun) vs `docs/Governance/08` (lebih baru). `docs/progress.md` vs root `PROGRESS.md`. README/AGENTS (17 Jun) belum muat fase 2.11–2.15. `04_ROLE_PERMISSION_MATRIX.md` perlu dicek vs 14 role aktual.

### BAGIAN C — Temuan baru & risiko untuk entity launcher

**🧨 Silent landmines (yang Den mungkin belum sadari):**
1. **RLS non-super = `get_user_company_id()` (profiles.company_id TUNGGAL).** Entity-launcher untuk user **non-super** yang berpindah entitas **TIDAK akan mengubah baris yang terlihat** — RLS tetap mengunci ke company rumah. Pindah entitas hanya "kosmetik" kecuali (a) user super_admin, atau (b) **redesign RLS** agar baca keanggotaan `user_roles` (multi-company) + konsep "active company" yang aman. **Ini blocker arsitektural terbesar.**
2. **9 tabel RLS OFF** termasuk **`entity_bank_accounts`/`entity_finance_settings`/`entity_signatories`** — justru data **per-entitas** yang akan jadi inti "master shared di level Grup". Saat entity-launcher dibangun di atasnya, data ini **terbuka** → wajib pasang RLS dulu sebelum dipakai luas.
3. **Storbit (sp_items/ar_*) tanpa `company_id` + RLS `USING(true)`** → bila Storbit jadi "modul milik SOA" di entity-launcher, **tak ada cara DB men-scope-nya** ke SOA; semua user lihat semua SP. Butuh `company_id` + RLS baru.
4. **UUID entitas hardcode di ≥7 file** + `isAllEntities`/`company_id` filter **didefinisikan ulang per-halaman** → menambah "active entity" tanpa hook terpusat akan **terlewat di sebagian halaman** (inkonsistensi diam-diam). Konsolidasi (modul `entities.js` + `useActiveEntity`) **wajib sebelum** rollout.
5. **RBAC granular dormant (`has_permission` unseeded)** → kalau entity-launcher mau "menu per entitas per role", **jangan andalkan** sistem granular yang belum hidup; pakai role-array + per-user `user_menu_permissions` yang sudah aktif, atau seed RBAC dulu.
6. **`MENU_KEY_MAP` + ratusan blok `activeMenu === 'id'` + localStorage deep-link** → mengubah id menu = pecah luas. Entity-launcher **harus pertahankan id menu**, hanya menyaring SUBSET yang tampil per entitas.
7. **`companies` flat** → "master shared di level Grup" + "customer-entitas dengan approval" mengasumsikan ada level Grup/holding. **Belum ada parent_id** → konsep Grup harus ditambah (DB) atau disimulasikan di FE.

**Tabel/modul paling SIAP di-entity-scope:** CRM (`accounts`/`inquiries`/`quotations` punya `company_id` + `isAllEntities` sudah jalan), Products/Warehouses/Stock/Assets (punya `company_id` + RLS), HRGA (`company_id` + RLS). **Shared services** (HRGA/IT/Procurement) cocok jadi modul "lintas entitas" (`entities:['*']`).

**Paling BERMASALAH:** Storbit SP/AR (no company_id, RLS terbuka), 9 tabel RLS-off, entity-config tables (bank/finance/signatory) yang justru sentral.

**Yang penting tapi mungkin terlewat:** sebelum membangun entity-launcher, **3 prasyarat keamanan/data**: (a) pasang RLS pada 9 tabel off, (b) tambah `company_id` + RLS ke Storbit/AR, (c) tentukan model "active entity" untuk RLS non-super (yang sekarang terkunci `profiles.company_id`). Tanpa ini, entity-launcher = lapisan UI di atas fondasi yang tak bisa benar-benar memisahkan data per entitas.

### Query SELECT untuk Den (verifikasi)

```sql
-- Q-P1. RBAC granular ter-seed? (kalau 0 → has_permission selalu false, RBAC dormant)
SELECT (SELECT count(*) FROM permissions) AS permissions,
       (SELECT count(*) FROM role_permissions) AS role_permissions,
       (SELECT count(*) FROM user_menu_permissions) AS user_menu_perms,
       (SELECT count(*) FROM modules) AS modules,
       (SELECT count(*) FROM module_menus) AS module_menus;

-- Q-P2. Apakah ada user dengan role di >1 company (multi-entity sudah dipakai?)
SELECT user_id, count(DISTINCT company_id) AS companies
FROM user_roles WHERE is_active GROUP BY user_id HAVING count(DISTINCT company_id) > 1;

-- Q-S1. Tabel RLS-off: ada data sensitif?
SELECT 'entity_bank_accounts' t, count(*) FROM entity_bank_accounts
UNION ALL SELECT 'entity_finance_settings', count(*) FROM entity_finance_settings
UNION ALL SELECT 'entity_signatories', count(*) FROM entity_signatories
UNION ALL SELECT 'approval_workflows', count(*) FROM approval_workflows
UNION ALL SELECT 'notification_rules', count(*) FROM notification_rules;
-- INTERPRETASI: >0 = data nyata terbuka tanpa RLS → tutup RLS sebelum entity-launcher.

-- Q-D1. Tabel dormant: masih ada data / dipakai?
SELECT 'sales_calls' t, count(*) FROM sales_calls
UNION ALL SELECT 'sales_visits', count(*) FROM sales_visits
UNION ALL SELECT 'customers', count(*) FROM customers;
-- INTERPRETASI: kalau dipakai App (legacy) cek FE; kalau kosong → kandidat drop.

-- Q-E1. Distribusi data per entitas (siapkah entity-scope?)
SELECT co.code, count(*) FILTER (WHERE a.account_status='customer') AS customers,
       (SELECT count(*) FROM quotations q WHERE q.company_id=co.id) AS quotations,
       (SELECT count(*) FROM products p WHERE p.company_id=co.id) AS products
FROM companies co LEFT JOIN accounts a ON a.company_id=co.id
GROUP BY co.id, co.code ORDER BY co.code;

-- Q-M1. Jumlah baris per tabel inti (snapshot kematangan) — sesuaikan daftar
SELECT relname AS tabel, n_live_tup AS perkiraan_baris
FROM pg_stat_user_tables WHERE schemaname='public'
ORDER BY n_live_tup DESC;
-- INTERPRETASI: bandingkan modul produktif (CRM/SP) vs dummy (procurement/service) — 0 baris = belum dipakai.
```

### Catatan terbuka (konsolidasi)

1. **[Prasyarat keamanan]** 9 tabel RLS-off + Storbit RLS-`USING(true)` **harus** ditutup sebelum entity-launcher (kalau tidak, pemisahan entitas semu).
2. **[RLS non-super]** Tentukan model "active entity" untuk user multi-entitas; `get_user_company_id()` tunggal = blocker. Mungkin perlu fungsi RLS baru berbasis `user_roles`.
3. **[Grup/holding]** `companies` flat — perlu `parent_id`/konsep Grup bila "master shared di level Grup" diinginkan.
4. **[Konsolidasi konstanta]** Satukan UUID entitas + `useActiveEntity` hook sebelum menyentuh per-halaman.
5. **[Docs sinkron]** CLAUDE "73 tabel" vs 84 aktual; dua TECH_DEBT; `04_ROLE_PERMISSION_MATRIX` vs 14 role — perlu disinkronkan agar blueprint akurat.
6. **[Verifikasi count]** Jalankan Q-P1/Q-S1/Q-D1/Q-E1/Q-M1 untuk membedakan data real vs dummy sebelum keputusan struktur.

---
---

# AUDIT — Struktur Sub-Menu Lengkap (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `ERP_MENU_GROUPS` (`App.jsx:430-801`) + render block `activeMenu === '…'` + `PLANNED_MODULES` + `isPlanned` + Shell internal routing (`AssetShell.jsx`, `HrgaShell.jsx`).

## INVESTIGASI — STRUKTUR SUB-MENU LENGKAP

**Legend status:**
- **REAL** — ada render block / Shell me-route ke komponen nyata (live).
- **CS** (ComingSoon) — hanya entri menu; klik → `ComingSoonPage` (atau `<ComingSoon>` di dalam Shell). Tak ada halaman fungsional.
- **POINTER** — mengarah ke modul lain (bukan halaman sendiri).
- **(divider)** — `{ section: '…' }`, label non-klik.

> **Catatan "DUMMY":** dari pemeriksaan, **tidak ada** halaman yang "ada tapi data statis" — item yang REAL memakai data DB nyata; sisanya langsung `ComingSoonPage` (placeholder murni). Jadi klasifikasi efektif = **REAL / CS / POINTER**. Bila ada nuansa "real tapi sebagian", ditandai di catatan.

> **Mekanisme status (kondisional):** `isPlanned(id)` → `PLANNED_MODULES[id]` (parent modul yg di-CS-kan) **atau** id tak ada di `PLANNED_REAL_IDS`/prefix `PLANNED_REAL_PREFIXES` (`assets/hrga/crm-/quotation-/inventory-/customer-/admin-settings`) → CS via catch-all (`App.jsx:2390`). Jadi **sub-menu dari modul planned otomatis CS** walau punya id.

---

### MODUL 1 — Core
```
[label] Core
└── [id: dashboard] Command Center ............... REAL  (public)  → Dashboard.jsx (activeMenu==='dashboard')
    ├── [dashboard] Overview Dashboard ........... REAL  (= halaman dashboard)
    ├── [dashboard-tasks] My Tasks ............... CS    (catch-all)
    ├── [dashboard-notifications] Notifications .. CS
    └── [dashboard-activity] Recent Activity ..... CS
```

### MODUL 2 — Commercial & CRM  (paling matang)
```
[label] Commercial & CRM
└── [crm-dashboard] CRM & Inquiry
    ├── [crm-dashboard] Dashboard ................ REAL  → CRMDashboardPage
    ├── [crm-pipeline] Pipeline / Leads .......... REAL  → PipelineKanbanPage
    ├── [crm-lead-pool] Lead Pool ................ REAL  (public) → LeadPoolPage
    ├── [crm-lead-pool-approval] Approval Lead Pool REAL  role:[manager,supervisor,admin,super_admin] → LeadPoolApprovalPage
    ├── [crm-prospects] Prospects ................ REAL  role:[super_admin,admin,ceo,gm,manager,sales,operations] → ProspectListPage/FormPage
    ├── [crm-inquiry] Inquiry .................... REAL  → InquiryListPage/FormPage/DealDetailPage
    ├── [quotation-draft] Quotation .............. REAL  → QuotationListPage/FormPage/DetailPage
    ├── [crm-rate-list] Rate List ................ REAL  role:[super_admin,admin,ceo,gm,manager,sales,operations] → RateListPage
    ├── [crm-customers] Master Customer .......... REAL  → CustomerListPage
    │   ├── [crm-customers-msi] Customer MSI ..... REAL  (entityFilter="MSI")  ⚑ entitas
    │   ├── [crm-customers-jci] Customer JCI ..... REAL  (entityFilter="JCI")  ⚑ entitas
    │   ├── [crm-customers-soa] Customer SOA ..... REAL  (entityFilter="SOA")  ⚑ entitas
    │   └── [crm-customers-free] Free Agent ...... REAL  (entityFilter="free")
    ├── [crm-calls] Activities ................... REAL  (public) → ActivitiesPage
    └── [crm-activity-log] Activity Log .......... REAL  (public) → ActivityLogPage
    (+ [customer-detail] CustomerDetailPage — sintetis, dari klik customer)
```

### MODUL 3 — Logistics  (campur 3 entitas via divider)
```
[label] Logistics
├── (divider) Storbit — Trading                                      ⚑ SOA
├── [manifest] Sales Order / SP
│   ├── [manifest] SP Manifest ................... REAL  → SalesOrderPage  ⚑ SOA/Storbit
│   └── [input] Input SP ........................ REAL  role:[…operations,sales] → InputSPPage  ⚑ SOA
├── [trading] General Trading ................... CS  (PLANNED_MODULES)  ⚑ SOA
│   ├── [trading-transaksi] Transaksi ........... CS
│   └── [trading-rekap] Rekap Trading ........... CS
├── [crm-customers] Master Customer ............. POINTER (note:'Di CRM') → modul CRM
├── (divider) MSI — Freight Forwarding                               ⚑ MSI
├── [job] Job Management ........................ CS  (PLANNED)  ⚑ MSI
│   ├── [job-semua] Semua Job ................... CS
│   ├── [job-aktif] Job Aktif ................... CS
│   ├── [job-buat] Buat Job Baru ................ CS
│   └── [job-history] Job History ............... CS
├── [freight] Freight Forwarding ............... CS  (PLANNED)  ⚑ MSI
│   ├── [freight-fcl] FCL (Full Container) ...... CS
│   ├── [freight-lcl] LCL (Less Container) ...... CS
│   └── [freight-air] Air Freight ............... CS
├── [shipment] Shipment Management ............. REAL  role:[…operations,sales] → ShipmentPage (legacy)  ⚑ label MSI tapi data Storbit/SP (MISMATCH)
│   ├── [shipment] Tracking Aktif ............... REAL
│   ├── [shipment-jadwal] Jadwal Pengiriman ..... CS  (catch-all)
│   └── [shipment-riwayat] Riwayat Pengiriman ... CS
├── (divider) JCI — PPJK / Customs                                   ⚑ JCI
├── [ppjk-impor] Pengurusan Impor .............. CS  ⚑ JCI
│   ├── [ppjk-pib] PIB / [ppjk-bc23] BC 2.3 / [ppjk-impor-tracking] Tracking Impor … CS
├── [ppjk-ekspor] Pengurusan Ekspor ............ CS  ⚑ JCI
│   ├── [ppjk-peb] PEB / [ppjk-bc30] BC 3.0 / [ppjk-ekspor-tracking] Tracking Ekspor … CS
├── [ppjk] Manifest & BCF ...................... CS  ⚑ JCI
│   ├── [ppjk-bc11] BC 1.1 / [ppjk-manifest] Manifest List … CS
└── [ppjk-trucking] Jasa Trucking .............. CS  ⚑ JCI
    └── [ppjk-trucking-order/-jadwal/-riwayat] … CS
```

### MODUL 4 — Procurement & Vendor  (100% CS)
```
[label] Procurement & Vendor
├── (divider) Direct Procurement
├── [procRequest] Procurement Request .......... CS (PLANNED)
│   ├── [procRequest-semua] Semua Request ....... CS
│   ├── [procRequest-buat] Buat Request ......... CS
│   ├── [procRequest-pending] Pending Approval .. CS
│   └── [procRequest-arsip] Arsip ............... CS
├── [purchaseOrder] Purchase Order ............. CS (PLANNED)
│   ├── [purchaseOrder-semua] Semua PO .......... CS
│   ├── [purchaseOrder-buat] Buat PO ............ CS
│   ├── [purchaseOrder-pending] Pending Approval  CS
│   └── [purchaseOrder-history] PO History ...... CS
├── (divider) Indirect Procurement
└── [vendors] Vendor Management ................ CS (PLANNED)   (tabel `vendors` ADA di DB, FE belum)
    ├── [vendors-daftar] Daftar Vendor .......... CS
    ├── [vendors-evaluasi] Evaluasi Vendor ...... CS
    ├── [vendors-kontrak] Kontrak Vendor ........ CS
    └── [vendors-blacklist] Blacklist Vendor .... CS
```

### MODUL 5 — Inventory
```
[label] Inventory
└── [inventory] Inventory / Warehouse .......... REAL (public, redirect → inventory-stok, App.jsx:1641)
    ├── [inventory-dashboard] Dashboard Inventory  REAL  → InventoryDashboardPage
    ├── [inventory-stok] Stok Barang ............ REAL  → StokBarangPage (⚑ hardcode SOA)
    ├── [inventory-penerimaan] Penerimaan Barang  REAL  → PenerimaanBarangPage (tulis stock_ledger)
    ├── [inventory-pengeluaran] Pengeluaran Barang CS  (catch-all)
    ├── [inventory-transfer] Transfer Stok ...... CS
    └── [inventory-opname] Opname / Adjustment .. CS
```

### MODUL 6 — Finance & Accounting
```
[label] Finance & Accounting
├── (divider) Transaksi
├── [jobCosting] Job Costing ................... CS (PLANNED)
├── [billing] Billing / Invoice ............... CS (PLANNED)
├── [ar] AR / Collection ...................... REAL  role:[super_admin,admin,ceo,gm,finance_controller,finance] → AR Tracker (ar_ttfs/ar_btbs)
├── [ap] AP / Vendor Invoice .................. CS (PLANNED)
├── (divider) Keuangan
├── [cashBank] Cash / Bank .................... CS (PLANNED)
├── [accounting] Accounting ................... CS (PLANNED)
├── [outstanding] Outstanding ................. REAL  role:[…manager,finance_controller,finance] → OutstandingPage (sp_items)
├── (divider) Dokumen
└── [finance] Finance Docs .................... REAL  role:[…finance] → FinancePage (flag inv/fp/submit/kirim sp_items)
```

### MODUL 7 — Service Management  (HRGA+Asset live, IT 100% CS)
```
[label] Service Management
├── (divider) HRGA Request
├── [hrga] HRGA Request ........................ REAL → HrgaShell (semua sub real)
│   ├── [hrga] My Requests ..................... REAL (public)
│   ├── [hrga-buat-request] Buat Request ....... REAL (public)
│   ├── (divider) Management
│   ├── [hrga-semua-request] Semua Request ..... REAL (public)
│   ├── [hrga-pending-approval] Pending Approval  REAL (public, badge)
│   └── [hrga-arsip] Arsip ..................... REAL (public)
├── (divider) IT Service Mgmt
├── [it] IT Service Mgmt ....................... CS (PLANNED)
│   ├── (divider) Karyawan
│   ├── [it-tickets] My Tickets / [it-buat] Buat Tiket ........... CS
│   ├── (divider) Management
│   ├── [it-semua] Semua Tiket / [it-pending] Pending Approval / [it-arsip] Arsip … CS
│   ├── (divider) Master Data
│   └── [it-kategori] Kategori Tiket / [it-sla] SLA & Assignment … CS
├── (divider) Asset Management
└── [assets] Asset Management .................. REAL → AssetShell
    ├── [assets] Dashboard ..................... REAL → AssetDashboardPage
    ├── [assets-analytics] Analytics & Reports . CS  (in-shell <ComingSoon>)
    ├── (divider) Assets
    ├── [assets-kendaraan] Kendaraan ........... REAL (VEH → AssetITPage)
    ├── [assets-it] IT Equipment ............... REAL (IT-EQP → AssetITPage)
    ├── [assets-furniture] Furniture & Office .. REAL (FURN)
    ├── [assets-properti] Properti ............. REAL (BLDG)
    ├── (divider) Maintenance
    ├── [assets-maint] Jadwal Maintenance ...... CS
    ├── [assets-hist] History Maintenance ...... CS
    ├── [assets-workorders] Work Orders ........ CS
    ├── (divider) Dokumen
    ├── [assets-docs] Semua Dokumen ............ CS
    ├── [assets-expiring] Akan Expired ......... CS
    ├── [assets-expired] Sudah Expired ......... CS
    ├── (divider) Administration
    ├── [assets-kategori] Kategori Aset ........ CS
    ├── [assets-lokasi] Lokasi & Ruangan ....... CS
    ├── [assets-vendor] Vendor & Supplier ...... CS
    └── [assets-settings] Settings ............. CS
    (+ [assets-detail] AssetDetailPage — REAL, dari klik aset)
```

### MODUL 8 — Workflow & Document  (100% CS)
```
[label] Workflow & Document
├── (divider) Approval
├── [approvals] Approval Center ............... CS (PLANNED)   (catatan: header "Pending Approval" arahkan ke hrga-pending-approval, BUKAN approvals)
│   ├── (divider) Approval Center
│   ├── [approvals-pending] Pending Approval ... CS
│   ├── [approvals-processed] Sudah Diproses ... CS
│   ├── [approvals-delegasi] Delegasi Approval . CS
│   ├── (divider) Template
│   ├── [approvals-template] Semua Template ..... CS
│   └── [approvals-template-buat] Buat Template . CS
├── (divider) Dokumen
└── [docMgmt] Document Management ............. CS (PLANNED)
    ├── [docMgmt-semua] Semua Dokumen .......... CS
    ├── [docMgmt-upload] Upload Dokumen ........ CS
    ├── [docMgmt-kategori] Kategori Dokumen .... CS
    └── [docMgmt-arsip] Arsip .................. CS
```

### MODUL 9 — Portal & Integration  (100% CS)
```
[label] Portal & Integration
├── (divider) Portal
├── [customerPortal] Customer Portal .......... CS (PLANNED)
│   ├── [customerPortal-dashboard] Dashboard Customer / [-tracking] Tracking Order / [-history] History Transaksi … CS
├── [vendorPortal] Vendor Portal .............. CS (PLANNED)
│   ├── [vendorPortal-dashboard] / [-po] PO Masuk / [-invoice] Invoice Submission … CS
├── (divider) Integration
├── [apiCenter] API & Integration ............ CS (PLANNED)   (catatan: Admin Settings → Integrations REAL, terpisah dari sini)
│   ├── [apiCenter-keys] API Keys / [-webhook] Webhook / [-log] Log Integrasi … CS
└── [publicTracking] Public Tracking ......... CS (PLANNED)
    ├── [publicTracking-page] Tracking Page / [-settings] Settings Tracking … CS
```

### MODUL 10 — Reporting & Governance
```
[label] Reporting & Governance
├── (divider) Reporting
├── [reports] Reporting & Dashboard .......... CS (PLANNED)
│   ├── [reports-executive] Executive Dashboard CS
│   ├── [reports-operasional] Laporan Operasional CS
│   ├── [reports-keuangan] Laporan Keuangan .... CS
│   └── [reports-custom] Custom Report ......... CS
├── [reporting-sales] Sales Report ........... REAL (public) → CRMReportPage
├── [reporting-form-report] Form Report ...... CS (planned:true)
├── [reporting-mom] MOM ...................... REAL (public) → MOMListPage/FormPage/DetailPage
├── [performance] Performance & Cache ........ CS (PLANNED)
│   ├── [performance-system] System Performance / [performance-cache] Cache Management … CS
├── (divider) Governance
└── [audit] Audit & Compliance ............... CS (PLANNED)   (catatan: Admin Settings → Audit Log REAL, terpisah)
    ├── [audit-log] Audit Log / [audit-activity] User Activity / [audit-compliance] Compliance Report … CS
```

### MODUL 11 — Foundation
```
[label] Foundation
├── (divider) Master Data
├── [admin] Master Data ...................... REAL  role:[super_admin,admin,it] → AdminShell (Company/Branch/Dept/Position/Roles/Users/dll)
├── [products] Products & Services ........... REAL  → ProductsPage (+ [product-detail] ProductDetailPage)
├── [schema-manager] Schema Manager .......... REAL  role:[super_admin] → schema tools
├── (divider) Admin Settings
└── [admin-settings] Admin Settings .......... REAL  role:[super_admin,admin] → AdminSettingsHub
    │   (sub-pages via Hub cards, BUKAN sidebar — semua REAL:)
    ├── [admin-settings-general] General Preferences ... REAL
    ├── [admin-settings-security] Security Policy ...... REAL
    ├── [admin-settings-audit] Audit Log ............... REAL
    ├── [admin-settings-integrations] Integrations ..... REAL
    ├── [admin-settings-entity] Entity Settings ........ REAL
    ├── [admin-settings-finance] Finance Defaults ...... REAL
    ├── [admin-settings-documents] Document Settings ... REAL
    ├── [admin-settings-approvals] Approval Workflows .. REAL
    └── [admin-settings-notifications] Notifications ... REAL
```
> (+ [users] User Access — REAL, navigasi dari Master Data/topbar, bukan item sidebar terpisah; [customers] legacy Storbit customers page — REAL.)

---

### Ringkasan jumlah item

| Modul | REAL | CS | POINTER | Total leaf |
|---|---|---|---|---|
| Core | 1 | 3 | 0 | 4 |
| Commercial & CRM | ~16 | 0 | 0 | 16 |
| Logistics | 3 (manifest,input,shipment) | ~24 | 1 (crm-customers) | ~28 |
| Procurement & Vendor | 0 | 14 | 0 | 14 |
| Inventory | 4 | 3 | 0 | 7 |
| Finance & Accounting | 3 (ar,outstanding,finance) | 5 | 0 | 8 |
| Service Mgmt (HRGA+IT+Asset) | ~10 (hrga5+assets5) | ~18 (it8+assets11) | 0 | ~28 |
| Workflow & Document | 0 | 12 | 0 | 12 |
| Portal & Integration | 0 | 13 | 0 | 13 |
| Reporting & Governance | 2 (sales,mom) | ~12 | 0 | ~14 |
| Foundation | ~13 (admin,products,schema,admin-settings+9 sub,users) | 0 | 0 | ~13 |
| **TOTAL (perkiraan leaf)** | **~55 REAL** | **~104 CS** | **1 POINTER** | **~160** |

> **Komposisi:** ~**1/3 menu REAL, ~2/3 ComingSoon.** Modul **100% CS:** Procurement & Vendor, Workflow & Document, Portal & Integration. Modul **100% (atau hampir) REAL:** Commercial & CRM, Foundation. **Campuran:** Logistics (Storbit live, MSI/JCI ops CS), Service Mgmt (HRGA+Asset live, IT CS), Inventory (3 live, 3 CS), Finance (AR/Outstanding/Finance live, akuntansi CS), Reporting (Sales/MOM live, sisanya CS). **DUMMY murni: tidak ada** (REAL = data DB; sisanya CS placeholder).

### Item yang MENCAMPUR konteks entitas (⚑ — relevan entity launcher)

1. **Logistics = 3 entitas dalam 1 modul generic**, dipisah hanya oleh **divider label**: `Storbit — Trading` (manifest/input/trading → **SOA**), `MSI — Freight Forwarding` (job/freight/shipment → **MSI**), `JCI — PPJK / Customs` (ppjk* → **JCI**). Tak ada pemisahan teknis (id/role/data) per entitas — semua di grup "Logistics".
2. **`shipment` MISMATCH:** ada di bawah divider "MSI — Freight Forwarding", tapi `ShipmentPage` (legacy) beroperasi pada `sp_items` = data **Storbit/SOA**. Label entitas ≠ sumber data.
3. **CRM > Master Customer > Customer MSI/JCI/SOA** (`crm-customers-msi/jci/soa`): entitas jadi **sub-menu eksplisit** di modul CRM generic, di-pass via `entityFilter` prop. Ini **satu-satunya** pola "menu per entitas" yang sudah jalan — model acuan untuk entity launcher.
4. **`crm-customers` muncul DUA kali**: di CRM (REAL) dan di Logistics (POINTER `note:'Di CRM'`) → cross-module reference.
5. **`products` (Foundation) generic** padahal isinya campur jasa MSI + barang SOA (lihat §Warehouse) — saat entity-scope, perlu dipisah.
6. **Admin Settings per-entitas** (`admin-settings-entity/-finance/-security/-general`) sudah punya `EntitySwitcher` internal (pilih MSI/JCI/SOA di dalam halaman) → konsep entity-scope **sudah ada di level settings**, tinggal diangkat ke navigasi.
7. **Storbit dipanggil "Logistics"** padahal Storbit = lini Trading/SOA (bukan freight). Penamaan modul vs entitas tidak konsisten.

### Catatan tambahan
- **Penomoran modul:** 11 grup `ERP_MENU_GROUPS` (Core, CRM, Logistics, Procurement, Inventory, Finance, Service Mgmt, Workflow & Doc, Portal & Integration, Reporting & Governance, Foundation). "10 modul" di docs = 10 domain bisnis (Core sering tak dihitung sbg domain).
- **`PLANNED_MODULES`** memuat juga id launcher-level berbeda dari id menu (mis. `quotation` [planned] vs `quotation-draft` [real]; `adminSettings` [planned] vs `admin-settings` [real]) — id kembar beda-kasing; yang dirender sidebar adalah versi menu (`-draft`/`admin-settings`).
- **Sub-menu modul planned** otomatis CS lewat **catch-all** (`App.jsx:2390`), bukan entri ComingSoon eksplisit — jadi strukturnya "dirancang" tapi 0 implementasi.
- **HRGA & Asset** punya sub-tab paling dalam yang sebagian REAL sebagian CS **di dalam Shell** (bukan via App.jsx) — satu-satunya modul dengan CS "in-shell".

---
---

# AUDIT — Menu Semantics & Cross-Entity (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `ERP_MENU_GROUPS` (App.jsx), `AuthContext.jsx`, `RolesPage.jsx`, `useHrgaRequests.js`, `supabase/schema_snapshot.sql`.

## INVESTIGASI — MENU SEMANTICS & CROSS-ENTITY

### 1. Audit semantik menu — OBJEK / FUNGSI / AKSI

**Prinsip klasifikasi:** OBJEK = entitas data yang dikelola (punya tabel + list/detail). FUNGSI/VIEW = cara memandang objek (filter/agregasi/laporan). AKSI = create/input (kandidat tombol).

| menu id | label | Klasifikasi | Objek induk | Rekomendasi |
|---|---|---|---|---|
| `dashboard` | Command Center | FUNGSI (overview) | lintas | Tetap (home) |
| `dashboard-tasks/-notifications/-activity` | sub | FUNGSI | Task/Notif/Activity | Tab di Home, bukan menu |
| `crm-dashboard` | CRM Dashboard | FUNGSI | CRM (Prospect/Quotation) | Tab "Dashboard" di modul CRM |
| **`crm-pipeline`** | Pipeline / Leads | **FUNGSI/VIEW** | **Prospect (accounts)** | **View/tab di objek Prospect** (kanban vs list) |
| **`crm-lead-pool`** | Lead Pool | **FUNGSI/VIEW** | **Prospect (is_in_lead_pool)** | **Filter/tab di Prospect**, bukan menu |
| `crm-lead-pool-approval` | Approval Lead Pool | FUNGSI (approval queue) | Prospect/LeadPool | Tab/inbox di Prospect (atau Approval Center) |
| **`crm-prospects`** | Prospects | **OBJEK** | accounts (prospect) | **Menu utama** |
| **`crm-inquiry`** | Inquiry | **OBJEK** | inquiries | **Menu utama** |
| **`quotation-draft`** | Quotation | **OBJEK** | quotations | **Menu utama** |
| **`crm-rate-list`** | Rate List | **OBJEK** | rate_sheets | **Menu utama** |
| **`crm-customers`** (+msi/jci/soa/free) | Master Customer | **OBJEK** | accounts (customer) | **Menu utama**; pecahan MSI/JCI/SOA → **filter entitas**, bukan 4 menu |
| **`crm-calls`** | Activities | **OBJEK** (activity records) | activities | Menu utama (atau tab CRM) |
| **`crm-activity-log`** | Activity Log | **FUNGSI/VIEW** | activities/activity_logs | Tab "Log" di Activities |
| **`manifest`** | SP Manifest | **OBJEK** | sp_items (SP) | **Menu utama** (objek Sales Order/SP) |
| **`input`** | Input SP | **AKSI** | sp_items | **Tombol "Buat SP"** di SP, bukan menu |
| **`shipment`** | Shipment Management | **FUNGSI/VIEW** | sp_items (status kirim) | **Tab "Pengiriman" di SP** (saat ini view atas sp_items) |
| `shipment-jadwal/-riwayat` | Jadwal/Riwayat | FUNGSI | sp_items | Tab/filter di SP |
| `trading-transaksi/-rekap` | Transaksi/Rekap | OBJEK/FUNGSI | (trading) | Objek transaksi + tab rekap |
| `job-*` | Job Management | OBJEK(`job-semua`)+AKSI(`job-buat`)+FUNGSI(aktif/history) | (jobs) | 1 objek Job + tab status + tombol Buat |
| `freight-fcl/lcl/air` | FCL/LCL/Air | FUNGSI/VIEW | (shipment/job) | Filter/tipe di objek Job/Shipment |
| `ppjk-*` | PIB/PEB/BC… | OBJEK(dokumen pabean)+FUNGSI(tracking) | (customs docs) | Objek "Dokumen Pabean" + tab jenis (BC 1.1/2.3/3.0) |
| `procRequest-semua` | Semua Request | OBJEK | (PR) | Menu objek Procurement Request |
| `procRequest-buat` | Buat Request | **AKSI** | PR | Tombol |
| `procRequest-pending/-arsip` | Pending/Arsip | **FUNGSI** | PR | Tab/filter status di PR |
| `purchaseOrder-semua` | Semua PO | OBJEK | (PO) | Menu objek PO |
| `purchaseOrder-buat` | Buat PO | **AKSI** | PO | Tombol |
| `purchaseOrder-pending/-history` | Pending/History | **FUNGSI** | PO | Tab/filter di PO |
| `vendors-daftar` | Daftar Vendor | OBJEK | vendors | Menu objek Vendor |
| `vendors-evaluasi/-kontrak/-blacklist` | Evaluasi/Kontrak/Blacklist | FUNGSI/OBJEK-anak | vendors | Tab di Vendor (evaluasi/kontrak/status) |
| `inventory-stok` | Stok Barang | **FUNGSI/VIEW** | products/stock_ledger | View "Stok" di objek Product/Warehouse |
| `inventory-dashboard` | Dashboard Inventory | FUNGSI | stock | Tab dashboard |
| `inventory-penerimaan` | Penerimaan | **AKSI/OBJEK** (GRN) | stock_ledger | Objek "Penerimaan/GRN" atau aksi inbound |
| `inventory-pengeluaran/-transfer/-opname` | Pengeluaran/Transfer/Opname | **AKSI/transaksi** | stock_ledger | Transaksi stok (objek movement) |
| `jobCosting/billing/ap/cashBank/accounting` | Finance | OBJEK | (GL/Invoice/Bill) | Menu objek masing-masing |
| **`ar`** | AR / Collection | **OBJEK** | ar_ttfs (TTF/Invoice) | **Menu objek Piutang** |
| **`outstanding`** | Outstanding | **FUNGSI/VIEW** | sp_items/ar | **Tab/view "Outstanding" di SP/AR**, bukan menu |
| **`finance`** | Finance Docs | **FUNGSI/AKSI** | sp_items (flag inv/fp/submit/kirim) | **Tab "Dokumen Finance" di SP** |
| `hrga` | My Requests | OBJEK | hrga_requests | Menu objek HRGA Request |
| `hrga-buat-request` | Buat Request | **AKSI** | hrga_requests | Tombol |
| `hrga-semua-request` | Semua Request | **FUNGSI/VIEW** (scope) | hrga_requests | Tab/filter (mine vs all) |
| `hrga-pending-approval` | Pending Approval | **FUNGSI** (queue) | hrga_requests | Tab/inbox approval |
| `hrga-arsip` | Arsip | **FUNGSI** | hrga_requests | Filter status |
| `it-*` | IT Service | OBJEK(ticket)+AKSI(buat)+FUNGSI(pending/arsip)+OBJEK(kategori/sla) | (tickets) | 1 objek Ticket + tab + master |
| `assets` | Asset Dashboard | FUNGSI | assets | Tab di Asset |
| `assets-kendaraan/-it/-furniture/-properti` | per kategori | **FUNGSI/VIEW (filter kategori)** | assets | **Filter kategori di objek Asset**, bukan 4 menu |
| `assets-maint/-hist/-workorders` | Maintenance | OBJEK-anak/FUNGSI | asset_maintenance_records | Tab "Maintenance" di Asset |
| `assets-docs/-expiring/-expired` | Dokumen | FUNGSI/VIEW | asset (docs/expiry) | Tab/filter di Asset |
| `assets-kategori/-lokasi/-vendor/-settings` | Master/Admin | OBJEK-master | asset_categories/locations | Master Data (objek terpisah) |
| `approvals-pending/-processed/-delegasi` | Approval | **FUNGSI** (queue) | (approval engine) | Tab di Approval Center (objek = approval instance) |
| `approvals-template(+buat)` | Template | OBJEK+AKSI | approval_workflows | Objek Template + tombol Buat |
| `docMgmt-semua/-upload/-kategori/-arsip` | Document | OBJEK(`semua`)+AKSI(`upload`)+FUNGSI | (documents) | Objek Dokumen + tombol + filter |
| `customerPortal-*/vendorPortal-*` | Portal | FUNGSI/VIEW (eksternal) | shipment/PO/invoice | Portal = surface terpisah, view atas objek |
| `apiCenter-keys/-webhook/-log` | Integration | OBJEK(keys/webhook)+FUNGSI(log) | (integration) | Objek API Key/Webhook + tab Log |
| `reports-*` / `reporting-sales` / `reporting-form-report` | Reporting | **FUNGSI/VIEW** | lintas objek | View/laporan (boleh menu Report sendiri) |
| **`reporting-mom`** | MOM | **OBJEK** | meeting_moms | **Menu objek MOM** |
| `performance-*` / `audit-*` | Governance | FUNGSI | audit_logs/system | View/laporan |
| `admin` | Master Data | OBJEK-container | companies/branches/… | Menu (hub master) |
| `products` | Products & Services | **OBJEK** | products | Menu utama |
| `admin-settings(+sub)` | Settings | FUNGSI/config | app_settings/entity_* | Menu Settings (sub = tab) |
| `schema-manager`/`users` | Admin | OBJEK(user)/tool | profiles/user_roles | Menu |

**🚩 FUNGSI yang berdiri sebagai MENU (kandidat konsolidasi ke tab/view):**
`outstanding` (→ AR/SP), `shipment` (→ SP), `finance` Finance Docs (→ SP), `crm-pipeline` (→ Prospect view), `crm-lead-pool` (→ Prospect filter), `crm-activity-log` (→ Activities tab), `assets-kendaraan/-it/-furniture/-properti` (→ filter kategori Asset), `inventory-stok` (→ view Product/Warehouse), semua `*-pending/-arsip/-history/-aktif` (→ filter status), semua `*-buat/-upload/-input` (AKSI → tombol). Pecahan entitas `crm-customers-msi/jci/soa` (→ 1 menu + filter entitas).

### 2. Struktur permission & cross-entity (cara kerja existing)

**Tabel RBAC:**
- `roles` (id, **company_id NOT NULL**, code, name, is_system_role, is_active, deleted_at) → **role per-entitas** (tiap company punya set role-nya).
- `permissions` (module, action, description) — katalog izin granular.
- `role_permissions` (role_id, permission_id, **`is_cross_entity` bool DEFAULT false**) — izin per role + flag cross-entity.
- `role_permission_templates` (role_id, menu_action_id, is_cross_entity) — template per menu-action.
- `user_menu_permissions` (user_id, menu_action_id **XOR** module_action_id [CHECK], **is_cross_entity**, company_id, granted_by) — **override per-user**.
- `modules`→`module_menus`(key,label)→`menu_actions`(action) / `module_actions` — hierarki menu untuk granular.

**Bagaimana cross-entity disimpan & dievaluasi:**
- **Disimpan:** kolom `is_cross_entity` di `role_permissions` (+ templates + user_menu_permissions). Per **(role × module)** efektif (RolesPage toggle "Cross Entity" per modul — `RolesPage.jsx:220-237` meng-update SEMUA permission modul itu).
- **Dievaluasi (FE):** `AuthContext.isCrossEntity(module)` (`:286`) → super_admin true; else `userPermissions` ada `permissions.module===module && is_cross_entity===true`. **Role-level.**
- **🔴 TIDAK meng-override `company_id` di RLS.** **NOL policy RLS memakai `is_cross_entity`** (grep schema: hanya definisi kolom, tak ada di policy). Scope data DB tetap `get_user_company_id()` (company tunggal) + bypass `is_super_admin()`.
- **🔴 Konsumen praktis = 1 dan TAK aktif:** hanya `useAllHrgaRequests({crossEntity})` (`useHrgaRequests.js:469`) yang memakai flag untuk menghapus filter company_id — TAPI pemanggilnya (`AllRequestsPage.jsx:32`, `ArsipPage.jsx:30`) **tidak meneruskan `crossEntity`** → selalu `false`. → **Cross-entity = data model + UI toggle ADA, tapi efek runtime praktis NIHIL** (dormant). Hanya `super_admin` yang benar-benar lintas-entitas (via `is_super_admin()` RLS bypass + `isAllEntities=['super_admin']` per halaman).

**`has_permission()`:** valid (join real tables) tapi **tak pakai cross_entity**; FE `hasPermission()` (`:237`) baca `userPermissions` (role_permissions). **`hasMenuPermission()`** (`:271`) baca `user_menu_permissions` (per-user). Gate menu `canSeeMenuItem` pakai `hasMenuPermission` → `hasPermission` → `item.role[]` → public. **Cross-entity tak menyentuh gate menu.**

**Context-aware "login as X" — bisa diturunkan dari data yang ADA?**
- **Bisa sebagian:** `profile.company_id` (entitas rumah, tunggal) → "login as MSI/JCI/SOA". `erpRoles[]` (dari `user_roles`, bisa multi-company via `user_roles.company_id`) → daftar entitas yang user punya role. `isCrossEntity(module)` / `super_admin` → "Group/all-entity".
- **Yang KURANG untuk indikator "login as X" + switch:**
  1. **State "active entity"** (sekarang tak ada; `profile.company_id` tunggal & statis).
  2. **RLS yang menghormati active-entity** — `get_user_company_id()` mengunci ke `profiles.company_id`; cross_entity tak dipakai RLS → ganti entitas tak mengubah data terlihat (kecuali super_admin). Perlu fungsi RLS baru berbasis `user_roles` + active-company.
  3. **Indikator UI** (header selector saat ini palsu, lihat §Navigasi).
  4. **Resolusi level "Group/Holding"** — `companies` flat (tanpa parent) → "login as Group" belum punya wadah.
- **Kesimpulan:** kerangka data (role multi-company + cross_entity flag) **ada tapi belum di-wire**. "Context-aware login" untuk **super_admin** praktis sudah jalan (lihat semua); untuk **non-super cross-entity** butuh wiring RLS + active-entity state (belum ada).

### 3. Inventaris objek bisnis

| Objek | Tabel utama | List/Detail FE | Fungsi/view menempel | Entitas |
|---|---|---|---|---|
| Prospect/Lead | `accounts`(prospect) | ProspectListPage/FormPage, PipelineKanban, DealDetailPage | Pipeline, Lead Pool, BANT, Activities | per company |
| Customer | `accounts`(customer) | CustomerListPage/DetailPage | per-entitas filter, TOP Request, Health | per company |
| Inquiry | `inquiries` | InquiryListPage/FormPage, DealDetail | Stage badge, → Quotation | per company |
| Quotation | `quotations`(+`quotation_items`) | QuotationListPage/FormPage/DetailPage + PDF | Duplicate, status, → SO | per company |
| Rate Sheet | `rate_sheets` | RateListPage + RateSheetPDF | Aktif/Expired, PDF | per company |
| Activity | `activities`(+`activity_logs`) | ActivitiesPage, ActivityLogPage, CRM Report | Calendar, log, report | per company |
| Sales Order/SP | `sp_items`(+`sp_btbs`) | SalesOrderPage/DetailPage, InputSPPage | Manifest, Shipment, Outstanding, Finance flags | **flat (no company_id)** |
| Shipment | (sp_items status) | ShipmentPage (legacy) | tracking/jadwal/riwayat | flat |
| Piutang/AR (Invoice/TTF) | `ar_ttfs`(+`ar_btbs`) | AR Tracker, OutstandingPage | Outstanding, status bayar | **flat** |
| Product/Service | `products` | ProductsPage/DetailPage | autocomplete Quotation, kategori | per company |
| Stock | `stock_ledger`(+view `stock_summary`,`warehouses`) | StokBarang, Penerimaan, InvDashboard | on-hand/reserved, movement | per company |
| Asset | `assets`(+7 sub) | AssetShell (Dashboard/IT/VEH/FURN/BLDG/Detail) | per kategori, maintenance, depresiasi | per company |
| Vendor | `vendors` | — (FE belum) | evaluasi/kontrak/blacklist | per company |
| HRGA Request | `hrga_requests`(+items/approvals/attachments) | HrgaShell (My/Buat/Semua/Pending/Arsip) | approval flow, arsip | per company |
| MOM | `meeting_moms`(+4 child) | MOMListPage/FormPage/DetailPage | approval CEO, status | per company |
| User/Role | `profiles`,`user_roles`,`roles`,`role_permissions` | AdminShell (UserAccess, RolesPage) | cross-entity toggle, RBAC | roles per company |
| Company/Org | `companies`,`branches`,`departments`,`positions` | AdminShell/OrgStructure | hierarki dept (bukan company) | master |
| Document Seq/Type | `document_sequences`,`document_types`,`document_numbering`,`document_templates` | admin-settings-documents | numbering | per company |
| Settings (entity) | `entity_finance_settings`,`entity_bank_accounts`,`entity_signatories`,`app_settings` | admin-settings-* (EntitySwitcher) | per-entitas config | per company |
| Approval (engine) | `approval_workflows/steps/rules/delegations/logs` | (FE belum, kecuali admin-settings-approvals) | queue, template, delegasi | per company |
| Notification | `notifications`,`notification_rules` | bell + admin-settings-notifications | rules | per company |

> Objek **belum punya FE**: Vendor, Procurement Request/PO (tabel `vendors` ada; PR/PO belum bertabel), IT Ticket (belum bertabel), Document Mgmt (belum bertabel), Billing/AP/GL (belum bertabel), Portal.

### 4. Usulan struktur menu bersih (analisis, BUKAN eksekusi)

**Prinsip:** menu = OBJEK; FUNGSI = tab/view di dalam objek; AKSI = tombol; entitas = atribut user (context-aware + cross-entity), bukan menu/launcher.

**A. CRM/Commercial → objek + tab:**
```
Prospects (objek)        → tab: List · Pipeline(kanban) · Lead Pool · Activities · BANT
Customers (objek)        → filter entitas (MSI/JCI/SOA/Free) sebagai chip, bukan 4 menu; tab: Detail · Health · TOP
Inquiries (objek)        → tab: List · by Stage
Quotations (objek)       → tab: Draft/Sent/Accepted (status filter); tombol Buat/Duplicate
Rate Sheets (objek)
Activities (objek)       → tab: Calendar · Log · Report
```
→ Hilangkan menu terpisah Pipeline, Lead Pool, Activity Log, CRM Dashboard (jadi tab); `Customer MSI/JCI/SOA` → 1 menu + filter entitas.

**B. Sales/Trading (Storbit) → objek SP:**
```
Sales Order / SP (objek) → tab: Manifest(list) · Shipment(kirim) · Outstanding · Finance Docs(inv/fp); tombol "Buat SP"
Piutang / AR (objek)     → tab: Invoice/TTF · Outstanding · Aging · Pembayaran
```
→ `Input SP` jadi tombol; `Shipment`,`Outstanding`,`Finance Docs` jadi **tab di SP/AR**, bukan menu.

**C. Logistics Ops (MSI/JCI) — rapikan tanpa entity launcher:** entitas = **filter/context**, bukan divider. Objek lintas:
```
Jobs (objek)             → filter entitas + tab: Aktif/History; tombol Buat
Shipment/Freight (objek) → tipe FCL/LCL/Air sebagai filter; tab tracking
Customs Docs (objek)     → jenis BC 1.1/2.3/3.0 + PIB/PEB sebagai tab/filter; tracking tab
```
→ Hapus divider "Storbit/MSI/JCI"; tiap objek tahu entitas dari context user + kolom company_id.

**D. Inventory → objek Product/Stock:**
```
Products (objek master)
Stock (objek)            → tab: Stok(on-hand) · Penerimaan · Pengeluaran · Transfer · Opname · Dashboard
Warehouses (master)
```

**E. Finance → objek akuntansi:**
```
Invoicing/Billing (objek) · AP (objek) · AR (objek, lihat B) · Cash/Bank (objek) · GL/Accounting (objek) · Job Costing (view)
```
→ Outstanding & Aging = tab/view di AR; bukan menu.

**F. Procurement (belum aktif) — kerangka ideal:**
```
Procurement Request (objek) → tombol Buat; tab status: Draft/Pending/Approved/Arsip
Purchase Order (objek)      → tombol Buat; tab: Open/History; from PR
Vendors (objek)             → tab: Profil · Evaluasi · Kontrak · Blacklist
```

**G. IT Service (belum aktif):**
```
Tickets (objek)   → tombol Buat; tab: My/All/Pending/Arsip
Master IT         → Kategori · SLA & Assignment (objek master)
```

**H. Workflow & Document (belum aktif):**
```
Approval Center (objek=approval instance) → tab: Pending · Processed · Delegasi
Approval Templates (objek)                → tombol Buat
Documents (objek)                         → tombol Upload; tab: All · Kategori · Arsip
```

**I. Portal & Integration:** Portal = surface eksternal (view atas Shipment/PO/Invoice), bukan menu internal. Integration: objek API Key/Webhook + tab Log.

**J. Reporting & Governance:** Reports = view/laporan (boleh menu sendiri, read-only); Audit/Performance = governance view. **MOM = objek** (tetap menu).

**Entitas tanpa launcher (sesuai prinsip Den):**
- Tambah **state "active entity"** (default `profile.company_id`) + indikator header (ganti button palsu) — TANPA mengubah struktur menu.
- Untuk user cross-entity/super: switch active-entity → **filter `company_id`** di query (pakai `isCrossEntity`/`isAllEntities` yang sudah ada, tapi **wajib wire ke RLS** atau ke filter FE terpusat).
- Master shared (Products, Vendors, COA, dll) → tampil per active-entity; objek lintas (HRGA/IT/Procurement) → context-aware.

### 5. Query SELECT untuk Den (verifikasi)

```sql
-- M1. Isi role_permissions + flag cross-entity per role/module
SELECT r.code AS role, p.module, count(*) AS perms,
       sum((rp.is_cross_entity)::int) AS cross_entity_perms
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
GROUP BY r.code, p.module ORDER BY r.code, p.module;
-- INTERPRETASI: cross_entity_perms>0 = role itu di-set lintas-entitas (tapi ingat: belum di-enforce RLS).

-- M2. Apakah RBAC granular ter-seed (kalau 0 → has_permission/hasMenuPermission selalu false utk non-super)
SELECT (SELECT count(*) FROM permissions) perms,
       (SELECT count(*) FROM role_permissions) role_perms,
       (SELECT count(*) FROM user_menu_permissions) user_menu_perms,
       (SELECT count(*) FROM menu_actions) menu_actions,
       (SELECT count(*) FROM modules) modules;

-- M3. Roles per entitas (apakah tiap company punya set role sendiri?)
SELECT co.code AS entity, count(*) AS roles, array_agg(r.code ORDER BY r.code) AS role_codes
FROM roles r LEFT JOIN companies co ON co.id = r.company_id
WHERE r.deleted_at IS NULL GROUP BY co.code ORDER BY co.code;

-- M4. User dengan akses >1 entitas (kandidat cross-entity nyata)
SELECT ur.user_id, count(DISTINCT ur.company_id) AS entitas, array_agg(DISTINCT r.code) AS roles
FROM user_roles ur JOIN roles r ON r.id = ur.role_id
WHERE ur.is_active GROUP BY ur.user_id HAVING count(DISTINCT ur.company_id) > 1;

-- M5. user_menu_permissions: ada override per-user aktif dipakai?
SELECT count(*) AS rows, count(DISTINCT user_id) AS users,
       sum((is_cross_entity)::int) AS cross_rows FROM user_menu_permissions;
```

### Catatan terbuka

1. **[Cross-entity dormant]** Den mengira cross-entity berfungsi — faktanya **disimpan & bisa di-toggle (RolesPage) tapi tak meng-enforce apa pun** (0 RLS, konsumen HRGA tak pasang flag). Untuk "cross-entity permission" nyata: wire `is_cross_entity` ke **filter query/RLS** (mis. izinkan `company_id IN (entitas yang user punya cross-entity)`).
2. **[Menu = FUNGSI]** Banyak menu sebenarnya FUNGSI/VIEW (Outstanding, Shipment, Pipeline, Lead Pool, Finance Docs, kategori Asset) → konsolidasi ke tab/objek (tabel §1 "🚩").
3. **[Entitas = atribut, bukan menu]** `crm-customers-msi/jci/soa` + divider Logistics = entitas dijadikan struktur menu → ganti jadi **filter context** atas objek. Butuh state "active entity" + (untuk non-super) wiring RLS.
4. **[Roles per-company]** `roles.company_id` NOT NULL → role di-duplikasi per entitas (mirip payment_terms). Saat context-aware, resolve role user per active-entity dari `user_roles`.
5. **[Objek tanpa company_id]** SP/AR (`sp_items`/`ar_*`) flat → tak bisa context-aware per entitas tanpa tambah `company_id` (lihat §Clean Start).
6. **[Verifikasi]** Jalankan M1-M5 untuk tahu apakah RBAC granular ter-seed & cross-entity benar-benar dipakai sebelum mengandalkannya di desain baru.

---
---

# AUDIT — SP Layout & UI Existing (30 Jun 2026)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah; hanya menambah section ini ke `AUDIT.md`.
> **Sumber:** `src/modules/logistics/SalesOrderPage.jsx`, `InputSPPage.jsx`, `SalesOrderDetailPage.jsx`, `App.jsx`. Deskripsi = apa adanya di kode.

## INVESTIGASI — SP LAYOUT & UI EXISTING

### 1. Layout per halaman (susunan visual atas→bawah)

#### A. `SalesOrderPage.jsx` — "Sales Order / SP" (LIST + Manifest)
Susunan (top→bottom):
1. **Header** (`:515-542`): breadcrumb `Logistics › Sales Order / SP`; H1 "Sales Order / SP"; subtitle "Kelola surat pesanan masuk dari customer **Storbit**"; tombol kanan **"Input SP"** (orange, → `onAddSP`).
2. **Stat cards (4)** (`:544-550`, grid auto-fit): **Total SP** · **Pending Konfirmasi** (warn) · **Total Manifest** (info) · **Outstanding** (danger). Nilai dari `stats` (derive dari grouped SP).
3. **Main card** berisi:
   - **Tab pills (4)** (`:558-588`): `Semua SP` · `Pending Konfirmasi` · `Manifest` · `History` — tiap tab punya badge count (`counts[k]`).
   - **Filter bar** (`:590-644`): search ("Cari SP, customer, produk…"), dropdown **Customer**, dropdown **DC**, checkbox **"Overdue only"**, spacer, tombol **Export CSV**.
   - **Bulk bar** (`:646-681`, muncul saat ada row dipilih): "{n} SP dipilih" + tombol **Konfirmasi Selected** · **Export** · clear.
   - **Tabel** (`:683-809`) + pagination.

**Kolom tabel (urut, `:686-708`):** ☐(checkbox) · **SP Date** (sort) · **No SP** (clickable→detail) · **Customer** (pill) · **Items** ("N produk") · **Total QTY** (sort, right) · **Outstanding** (sort, right, merah jika >0) · **Status** (badge) · **DC** · **Expired Date** (sort, merah jika <2 hari) · **Grand Total** (right) · **Finance Progress** (bar %) · **Aksi**. Row overdue → background `#FFF0EE`.

**Aksi per-row (`AksiCell` `:226-244`, kondisional by status):**
- status **OPEN** → **Konfirmasi** (orange) + **Tolak** (danger).
- status **MANIFEST** → **Manifest** (purple) + **Detail**.
- status **CLOSED/lain** → **Detail** saja.

#### B. `InputSPPage.jsx` — "Input SP" (CREATE)
Layout **2 kolom** (`:277` grid `1fr 360px`):
1. **Header**: breadcrumb + H1 + tombol back.
2. **KIRI (form):**
   - Card **"SP Information"** (`:287`) — grid 3-kolom: SP Date, Customer (dropdown accounts), DC, Expired Date, Notes.
   - Card **"BTB Numbers"** (`:344`) — repeatable `btb_no` + remarks (opsional).
   - **Item Pesanan** — list item repeatable (`freshItem`), tiap baris grid: Product Name · SKU · QTY · Unit Price · Shipping Price (`:637`); tombol **"Tambah Item"** (`:440`); empty state.
3. **KANAN (sticky summary, `:446-534`):** header navy "Ringkasan SP"; baris **Total QTY · Subtotal · Ongkos Kirim · PPN (11%)**; **Grand Total** (accent); tombol **"Simpan sebagai Draft"** + **"Submit SP"**.

> Catatan: **Draft = Submit** (insert identik; `sp_items` tak punya `status`, `:10`). Nomor SP `SP-{timestamp}` client-side.

#### C. `SalesOrderDetailPage.jsx` — Detail per-SP  ⭐ **SUDAH PAKAI TABS**
Susunan:
1. **Header** (`:678+`): breadcrumb + nama SP + status badge (Open/Partial/Closed dari group); tombol Edit/Hapus.
2. **Stat cards (3)** (`:747-788`): **SP Date** (orange) · **Expired Date** (yellow, merah jika <2hr) · **Finance Progress %** (purple, bar).
3. **Tabbed card** (`:790-799`) — **TAB BAR 5 tab:**
   - **Overview** (`:794`) → Financial Summary (Total Items/QTY/Shipped/Outstanding/Subtotal/Ongkir/PPN) + finance stage chips.
   - **Items** (`:795`, count=totalItems) → tabel item + EditItemModal (qty/shipped/finance flags inv/fp/submit/kirim/email).
   - **Shipment** (`:796`, **count=0 → EmptyState**).
   - **Dokumen** (`:797`, **count=0 → EmptyState** "Surat Jalan/PO/Rincian Harga").
   - **History** (`:798`, **EmptyState**).

**Finance stages config** (`:144-149`): `inv`(Invoice) · `fp`(Faktur Pajak) · `submit`(Submit) · `kirim`(Kirim) — 4 flag boolean per item, diedit di EditItemModal.

> Komentar eksplisit `:14`: *"Shipment / Dokumen / History tabs → empty states (no SP-level tables yet)."* → **kerangka tab sudah ada, 3 tab masih kosong.**

### 2. Status tab / KPI / kolom / aksi

| Elemen | Nilai | Status |
|---|---|---|
| **Tab list (List page)** | Semua SP · Pending Konfirmasi · Manifest · History | REAL (filter `dstatus` `:418-423`) |
| **Tab list (Detail page)** | Overview · Items · Shipment · Dokumen · History | Overview/Items **REAL**; Shipment/Dokumen/History **EmptyState (kosong)** |
| **KPI (List)** | Total SP · Pending Konfirmasi · Total Manifest · Outstanding | REAL (derive) |
| **KPI (Detail)** | SP Date · Expired Date · Finance Progress% | REAL |
| **Aksi: Input SP** | tombol header → InputSPPage | **REAL** (insert sp_items) |
| **Aksi: Export CSV** | `onExport` | REAL |
| **Aksi: Konfirmasi** (row + bulk) | `confirmModal`/bulk | **🔴 NO-OP** — hanya `showToast`; `// TODO: needs sp_items.status migration` (`:494/501`) |
| **Aksi: Tolak** (+ alasan modal) | `confirmModal` reject | **🔴 NO-OP** (toast saja, `:501`) |
| **Aksi: Manifest** | `handleManifest` | **🔴 NO-OP** (toast saja, `:503`) |
| **Aksi: Detail** | `onSelectSP(spNo)` | REAL |
| **Aksi: Edit Item / Hapus SP** (Detail) | EditItemModal / DeleteModal | REAL (update/delete sp_items) |

→ **Status flow (Konfirmasi/Tolak/Manifest) = UI lengkap tapi tak persist** (tak ada `sp_items.status`). Status sebenarnya **derived** dari `qty` vs `shipped_qty` (Open/Partial/Closed).

### 3. Komponen & state

| Komponen | File | Peran |
|---|---|---|
| `SalesOrderPage` | `logistics/SalesOrderPage.jsx` | List SP + tab/filter/stat |
| ` ├ StatCard` (`:139`), `Th` (`:189`), `AksiCell` (`:226`), `ConfirmModal` (`:266`), `StatusBadge`/`CustPill`/`FinBar` | sub-komponen |
| `InputSPPage` | `logistics/InputSPPage.jsx` | Form create (2-col + sticky summary) |
| `SalesOrderDetailPage` | `logistics/SalesOrderDetailPage.jsx` | Detail per-SP + 5 tab |
| ` ├ EditItemModal` (`:198`), `DeleteModal` (`:453`), `EmptyState` (`:552`), `TabBtn`, `FinanceStage` | sub-komponen |

**Data fetch & grouping:**
- Data **tidak di-fetch di komponen** — `SalesOrderPage` menerima prop `groupedSP` dari **App.jsx** (`groupBySP(rows)` `App.jsx:149`), yang meng-`calcItem` (`spCalc.js`) per baris `sp_items` lalu **group by `sp_no`** → 1 baris tabel = 1 SP (agregat items, totals, financePct, status, isOverdue).
- `toDesignStatus(g)` (`:62`) map Open→OPEN, Partial→MANIFEST, Closed→CLOSED (CONFIRMED/CANCELLED TODO).
- Detail page menerima `group` + `items[]` (dari App), CRUD via `dbRemoveRow`/`dbRemoveRowsBySp`/update.

**"View/fungsi yang sebenarnya bisa jadi tab SP":** ⭐ **SUDAH terbukti** — Detail page sudah punya tab Overview/Items/**Shipment**/**Dokumen**/**History**. Di level LIST, "Manifest" & "Pending/History" = **tab status** (sudah). "Outstanding" = **KPI + kolom + filter** (belum tab tersendiri). "Finance Docs" (inv/fp/submit/kirim) = **edit di Detail>Items** (EditItemModal) + halaman `FinancePage` terpisah (legacy).

### 4. Relasi ke menu

- **Menu sidebar:** Logistics › (divider **"Storbit — Trading"**) › **`manifest`** "SP Manifest" + **`input`** "Input SP" (`App.jsx:481-487`). Keduanya child dari item parent `manifest` "Sales Order / SP".
- **Render:** `activeMenu==='manifest'` → SalesOrderPage / (selectedSpId) SalesOrderDetailPage / (showInputSP) InputSPPage (`App.jsx:2403-2446`). `activeMenu==='input'` → InputSPPage juga (`:2464`).
- **Duplikat/pointer:** `input` muncul **2×** (sebagai child `manifest` + sebagai item `crm-customers` POINTER tidak; tapi `input` punya render block sendiri di `:2464` selain via manifest). `crm-customers` POINTER ("Di CRM") ada di Logistics.
- **View SP tersebar ke 3 menu LAIN** (semua baca `sp_items` yang sama): **`shipment`** (ShipmentPage legacy, status≠Closed), **`outstanding`** (OutstandingPage, totalOutstanding>0), **`finance`** (FinancePage, edit flag inv/fp/submit/kirim). → **fungsi SP dipecah jadi menu terpisah di grup berbeda** (shipment di Logistics, outstanding & finance di Finance & Accounting).

**Campur konteks:** Header & subtitle eksplisit menyebut **"customer Storbit"** (SOA/Trading) → SP modul = **Storbit/SOA murni**. TAPI: (a) ada di grup generic **"Logistics"** bukan "Storbit"; (b) `shipment` (view SP Storbit) berada di bawah divider **"MSI — Freight Forwarding"** (mismatch label); (c) `sp_items` flat tanpa `company_id` (tak ter-tag entitas). → **konteks entitas tercampur di level grup/divider, bukan di data.**

### 5. Penilaian (analisis tab-able)

**Sudah bagus:**
- Detail page **sudah objek-sentris dengan tab** (Overview/Items/Shipment/Dokumen/History) — pola yang persis diinginkan; tinggal isi 3 tab kosong.
- List page rapi: stat cards + tab status + filter + tabel + bulk + export. Konsisten brand.
- Grouping by `sp_no` benar (objek SP = agregat items).

**Campur/perlu dirapikan:**
- **Fungsi SP jadi 3 menu terpisah** (`shipment`, `outstanding`, `finance`) di grup berbeda — idealnya jadi **tab/view di objek SP**, bukan menu sendiri.
- **`input` (AKSI)** sebagai menu + duplikat render — idealnya **hanya tombol "Input SP"** di list (sudah ada tombolnya), hapus dari sidebar.
- **Status flow tombol (Konfirmasi/Tolak/Manifest) NO-OP** — UI menjanjikan aksi yang tak jalan (butuh `sp_items.status`).
- **Label grup/divider** ("Logistics" / "MSI — Freight" untuk shipment Storbit) tak konsisten dengan isi (Storbit/SOA).

**Usulan tab bila SP jadi "objek menu" (berbasis yang ADA):**
```
Objek: Sales Order / SP
├── Manifest (List)     ← tab "Semua/Pending/Manifest/History" (sudah ada di list page)
├── Shipment            ← dari menu `shipment` (ShipmentPage) → jadi tab; isi tab Shipment Detail yang kosong
├── Outstanding         ← dari menu `outstanding` (OutstandingPage) → jadi tab/filter (kolom Outstanding sudah ada)
├── Finance Docs        ← dari menu `finance` (FinancePage, inv/fp/submit/kirim) → jadi tab (sudah ada di EditItemModal)
├── Dokumen             ← tab kosong existing (Surat Jalan/PO) — isi nanti
└── History             ← tab kosong existing
  + tombol "Input SP" (bukan menu)
```
→ Konsolidasi 4 menu (`manifest`,`shipment`,`outstanding`,`finance`) + `input` (aksi) menjadi **1 objek SP dengan tab**, persis arah restruktur "objek = menu, fungsi = tab, aksi = tombol". Detail page sudah membuktikan polanya layak.

### Catatan
- Tidak ada query DB baru diperlukan untuk section ini (murni layout/UI). Untuk data SP lihat query S1-S7 di §"Flow Storbit End-to-End".
- `sp_items.status` (untuk Konfirmasi/Tolak/Manifest nyata + tab status persist) = prasyarat agar tab/aksi tak no-op (lihat §Flow Storbit, catatan terbuka).
