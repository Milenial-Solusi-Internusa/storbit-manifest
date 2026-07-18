# AUDIT — Struktur Navigasi & Halaman Modul Commercial & CRM (kondisi APA ADANYA)

> Read-only. Sumber: `src/App.jsx`, `src/modules/crm/*`, `docs/Governance/04_ROLE_PERMISSION_MATRIX.md`. Tanggal: 2026-07-19 (branch `main`, commit terakhir lifecycle-split + gate Lead Pool).
> Sifat: pemetaan, bukan usulan. Tiap klaim ada `file:line`. Yang tak bisa dipastikan dari kode ditandai eksplisit. **Nol file diubah selain dokumen ini. Nol perubahan DB. Tidak ada usulan struktur baru** (sesuai instruksi).

---

## RINGKASAN — kondisi navigasi CRM sekarang

Menu CRM didefinisikan **dua kali** di `src/App.jsx`: **`ERP_MENU_GROUPS`** (`:453`, grup "Commercial & CRM" `:470-499`) = sumber **gate/izin** (dibaca `findMenuItemById` + `canSeeMenuItem`), dan **`NEXUS_NAV`** (`:852`, grup `nav-crm` `:862-886`) = struktur **sidebar yang dirender**. Keduanya harus disinkron manual; keduanya memuat daftar item CRM yang sama tapi **urutan sedikit beda** (mis. `crm-rate-list`/`crm-sales-order` bertukar posisi). Grup CRM berisi 12 item di bawah satu induk `crm-dashboard` (label "CRM & Inquiry"), dan **id induk bertabrakan dengan id anak** (`crm-dashboard` dipakai untuk parent DAN child, `:474` vs `:476`).

Routing tidak memakai react-router — semua lewat state `activeMenu` + rentetan blok `{activeMenu === 'crm-…' && (<Komponen/>)}` di `App.jsx:3030-3475`. Satu menu id kadang merender beberapa komponen berbeda lewat **state sekunder** (mis. `crm-inquiry` = InquiryList / InquiryForm-create / DealDetail / InquiryForm-edit tergantung `showInquiryForm`+`crmDealInquiry`, `:3055-3101`). Beberapa **komponen halaman CRM tidak punya item menu sama sekali** dan hanya dicapai lewat tombol/baris dari halaman lain: `CustomerDetailPage`, `DealDetailPage`, `ProspectFormPage`, `InquiryFormPage`, `QuotationFormPage`, `QuotationDetailPage`.

Sumbu **entitas** (MSI/JCI/SOA/Free Agent) di Master Customer adalah **satu komponen** (`CustomerListPage`) dipakai 5 menu dengan prop `entityFilter` berbeda. MSI/JCI/SOA menjalankan **query DB yang IDENTIK** (`account_status='customer'`) dan hanya dibedakan **filter client-side** `source_company.code === entityFilter` (`CustomerListPage.jsx:602-608`); Free Agent adalah query beda (`account_status='free_agent'`, `:562`). **Tidak ada pemilih entitas di header** — topbar hanya menampilkan logo MSI statis + search (`App.jsx:2416-2445`); jadi premis "pemilih entitas di header (MSI/JCI/Storbit)" **tidak terwakili di kode** (kemungkinan fitur terencana, belum dibangun). Karena fetch tak memfilter `company_id` (RLS yang membatasi), untuk user single-entity **dua dari tiga submenu entitas selalu kosong** — hanya `super_admin` yang melihat ketiganya.

Titik paling rawan & tumpang tindih: (a) **Pipeline vs Prospects** membaca himpunan akun pra-customer yang sama, beda cuma tampilan (kanban vs tabel) + Pipeline mengecualikan akun parkir; (b) **Activities vs Riwayat Visit vs Sales Calls (mati)** semuanya tabel `activities` (Riwayat Visit = subset `type='visit'`); (c) gate menu **campur** antara `hasMenuPermission` (per-user, DB-driven) dan array `role` inline — pada item ber-`menuKey`, `role`/`module` inline **diabaikan** (`canSeeMenuItem:1200-1201`); (d) restrukturisasi id akan menyentuh **banyak titik hardcode** (MENU_KEY_MAP, dua allow-list SYNTHETIC, catch-all ComingSoon, deep-link notifikasi, ~40 blok render).

---

## PETA MENU — grup > item > komponen > tabel sumber

**Grup "Commercial & CRM"** (`ERP_MENU_GROUPS:470-499` · sidebar `NEXUS_NAV nav-crm:862-886`). Induk: `crm-dashboard` label **"CRM & Inquiry"** (`:474`).

| # | Menu id | Label | Ikon | Komponen (render) | Tabel/sumber utama | Gate |
|---|---|---|---|---|---|---|
| 1 | `crm-dashboard` | Dashboard | BarChart2 | `CRMDashboardPage` (`:3105`) | `accounts` (pra-customer) + `accounts` (customer WON) + `activities` (call/visit) | menuKey `crm_dashboard` |
| 2 | `crm-pipeline` | Pipeline / Leads | Users | `PipelineKanbanPage` (`:3114`) | `accounts` account_status∈pra-customer, `is_in_lead_pool=false` | menuKey `crm_pipeline` |
| 3 | `crm-lead-pool` | Lead Pool | Archive | `LeadPoolPage` (`:3336`) | `accounts` `is_in_lead_pool=true` | role[] (`:478`) |
| 4 | `crm-lead-pool-approval` | Approval Lead Pool | ClipboardCheck | `LeadPoolApprovalPage` (`:3345`) | `accounts` `pull_status='pending'` | role[] (`:479`) + `canRenderPage` |
| 5 | `crm-prospects` | Prospects | Users | `ProspectListPage`/`ProspectFormPage` (`:3031`/`:3042`) | `accounts` account_status∈pra-customer | menuKey `crm_prospects` (⚠️ inline module/role **diabaikan**) |
| 6 | `crm-inquiry` | Inquiry | FileText | `InquiryListPage`/`InquiryFormPage`/`DealDetailPage` (`:3055-3101`) | `inquiries` | menuKey `crm_inquiry` |
| 7 | `quotation-draft` | Quotation | Receipt | `QuotationListPage`/`QuotationDetailPage`/`QuotationFormPage` (`:3128`/`:3140`/`:3450`) | `quotations` | menuKey `crm_quotation` |
| 8 | `crm-rate-list` | Rate List | Tag | `RateListPage` (`:3464`) | `rate_sheets` | role[] (`:483`) |
| 9 | `crm-sales-order` | Sales Order | ClipboardList | `SalesOrderDocListPage`/`FormPage`/`DetailPage` variant=`crm` (`:3246`) | `sales_orders` | role[] (`:484`) + `canRenderPage` |
| 10 | `crm-customers` | Master Customer (induk) | Building2 | `CustomerListPage` (tanpa filter) (`:3155`) | `accounts` account_status='customer' | menuKey `crm_customers` |
| 10a | `crm-customers-msi` | Customer MSI | Building2 | `CustomerListPage entityFilter="MSI"` (`:3162`) | `accounts` customer + client-filter code=MSI | menuKey `crm_customers` |
| 10b | `crm-customers-jci` | Customer JCI | Building2 | `CustomerListPage entityFilter="JCI"` (`:3169`) | idem, code=JCI | menuKey `crm_customers` |
| 10c | `crm-customers-soa` | Customer SOA | Building2 | `CustomerListPage entityFilter="SOA"` (`:3176`) | idem, code=SOA | menuKey `crm_customers` |
| 10d | `crm-customers-free` | Free Agent | UserX | `CustomerListPage entityFilter="FREE_AGENT"` (`:3183`) | `accounts` account_status='free_agent' | menuKey `crm_customers` |
| 11 | `crm-calls` | Activities | Activity | `ActivitiesPage` (`:3201`) | `activities` (semua type) | role[] (`:494`) |
| 12 | `crm-activity-log` | Activity Log | History | `ActivityLogPage` (`:3215`) | `fetchActivityFeed` → `accounts`+`inquiries`+`quotations`+`activity_logs`+`user_login_logs` | role[] (`:495`) |
| — | `customer-detail` | (tak ada menu) | — | `CustomerDetailPage` (`:3192`) | `accounts` single by id | SYNTHETIC allow (`:1909/:2283`) → efektif `crm_customers` via CustomerList |

**Item terkait CRM di grup lain (baca data CRM, tapi bukan di grup CRM):**

| Menu id | Grup | Komponen | Tabel | Gate |
|---|---|---|---|---|
| `reporting-sales` | Reporting (`:804`) | `CRMReportPage` (`:3278`) | `activities`+`accounts`(PROSPECT_STATUS)+`quotations` | role[] (`:804`) |
| `riwayat-visit` | Reporting (`:805`) | `RiwayatVisitPage` (`:3287`) | `activities` `type='visit'` | role[super_admin,ceo,gm_bd] (`:805`) + `canRenderPage` |
| `indomarco-dashboard` | Reporting (`:806`) | `IndomarcoDashboardPage` (`:3298`) | RPC `indomarco_dashboard_stats` (`sp_items`) | role[] (`:806`) + `canRenderPage` |
| `reporting-mom` | Reporting (`:808`) | `MOMListPage`/`FormPage`/`DetailPage` (`:3309`) | `meeting_moms` (modul reporting) | role[] (`:808`) |
| `crm-customers` | Logistics (`:521`) | (sama — CustomerListPage) | idem | note `'Di CRM'` (cross-link) |
| `proc-sales-order` | Procurement | `SalesOrderDocListPage` variant=`procurement` (`:3263`) | `sales_orders` | role[] + `canRenderPage` |

---

## TEMUAN PER BAGIAN

### 1. DEFINISI MENU

**Dua definisi paralel** di `App.jsx`:
- **`ERP_MENU_GROUPS`** (`:453`) — grup "Commercial & CRM" (`:470-499`). Ini yang memuat **gate inline** (`role`/`module`) dan dibaca `findMenuItemById`.
- **`NEXUS_NAV`** (`:852`) — grup `nav-crm` (`:862-886`), struktur **sidebar** yang dirender; **tanpa** gate inline (gate diresolusi via `findMenuItemById(id)` → `ERP_MENU_GROUPS`).

Item CRM (ERP_MENU_GROUPS, urut asli):
`crm-dashboard`(child,`:476`) · `crm-pipeline`(`:477`) · `crm-lead-pool`(`:478`,role) · `crm-lead-pool-approval`(`:479`,role) · `crm-prospects`(`:480`,module+role) · `crm-inquiry`(`:481`) · `quotation-draft`(`:482`) · `crm-rate-list`(`:483`,role) · `crm-sales-order`(`:484`,role) · `crm-customers`(`:486`)→[`-msi`,`-jci`,`-soa`,`-free`](`:488-491`) · `crm-calls`(`:494`,role) · `crm-activity-log`(`:495`,role).

**Penanda "soon"/disabled:** grup CRM **tidak punya** item `soon`/`planned` (semua LIVE). `PLANNED_MODULES` (`:310`) **sengaja tak memuat `crm`** (`:312` komentar). Item planned hanya di grup lain (Freight/Customs/dst, `NEXUS_NAV` `soon:true`). Di Reporting: `reporting-form-report` `planned:true` (`:807`).

**Anomali:**
- **Id induk = id anak:** `crm-dashboard` dipakai untuk item induk (`:474`) DAN anak pertama (`:476`). `findMenuItemById` akan match yang pertama ditemukan.
- **`quotation-draft`** = satu-satunya item CRM tanpa prefix `crm-` (`:482`); menuKey `crm_quotation`.
- Urutan **beda** antara ERP_MENU_GROUPS (`rate-list` sebelum `sales-order`) dan NEXUS_NAV (`sales-order` sebelum `rate-list`, `:872-873`).

### 2. PEMETAAN MENU → HALAMAN

Render blocks `App.jsx:3030-3475` (lihat tabel PETA MENU). Poin penting:

**Komponen dipakai >1 menu:**
- **`CustomerListPage`** → 5 menu (`crm-customers`, `-msi`, `-jci`, `-soa`, `-free`), beda hanya prop `entityFilter` (`:3155-3188`).
- **`SalesOrderDocListPage`** + **`SalesOrderDocDetailPage`** → `crm-sales-order` (variant `crm`, `:3254`) **dan** `proc-sales-order` (variant `procurement`, `:3269`).
- **`InquiryFormPage`** → dirender 2× dalam `crm-inquiry`: create (`:3069`) & edit (`:3094`, `mode="edit"`).

**Menu menunjuk komponen sama lewat state (bukan menu beda):** `crm-inquiry` (4 komponen via `showInquiryForm`/`crmDealInquiry`), `quotation-draft` (3 via `crmQuotationDetail`/`showQuotationForm`), `crm-prospects` (2 via `showProspectForm`), `crm-sales-order` (3 via `soDetailId`/`soFormOpen`).

**Komponen halaman CRM TANPA item menu (hanya via tombol/link):**
- `CustomerDetailPage` (`customer-detail`, `:3192`) — dari baris CustomerList (`onSelectCustomer` → `navigateToCustomerDetail` `:1746`).
- `DealDetailPage` (`:3076`) — dari `InquiryListPage` `onSelectInquiry` → `setCrmDealInquiry` (`:3060`).
- `ProspectFormPage` (`:3042`) — dari ProspectList/Pipeline/Activities.
- `InquiryFormPage` (`:3066`/`:3094`) — dari InquiryList/DealDetail.
- `QuotationFormPage` (`:3450`) — dari QuotationList/QuotationDetail/DealDetail.
- `QuotationDetailPage` (`:3140`) — dari QuotationList/DealDetail.

**Komponen CRM yang ADA tapi MATI (di-import/eksis, tanpa menu DAN tanpa render):**
- **`SalesCallsPage.jsx`** — di-`import` (`App.jsx:62`) tapi **tak pernah dirender** (grep `<SalesCallsPage` = 0). Komentar di `ActivitiesPage.jsx:3-4` menyatakan "Replaces SalesCallsPage as the component for the crm-calls route". = **dead code** (sesuai TD-69).
- **`CustomerMasterPage.legacy.jsx`** — **tak di-import** di `App.jsx` (grep = 0). File legacy mati.
- Komponen non-halaman (modal/PDF) yang dipakai di dalam halaman, bukan route: `WinLossModal`, `LightHandoverModal`, `StrategicHandoverModal`, `TOPRequestModal`, `QuotationPDF`, `InquiryPDF`, `RateSheetPDF`, `ActivityReportPDF`, `VisitHistoryPDF`, `BantScoreBar`, `bant.js`, `salesRoster.js`, `activityFeed.js` (helper).

### 3. TABEL SUMBER TIAP HALAMAN (yang membedakan halaman ber-tabel sama)

| Halaman | Tabel | Filter kunci (file:line) | Yang membedakan |
|---|---|---|---|
| **PipelineKanbanPage** | `accounts` | `account_status∈[lead,mql,sql,prospect,lead_pool]` + **`is_in_lead_pool=false`** + `deleted_at null` (`:583-595`) | Board kanban per `pipeline_stage`; **mengecualikan akun parkir** |
| **ProspectListPage** | `accounts` | `account_status∈[pra-customer]` + `deleted_at null` (`:107-135`); **tanpa** filter `is_in_lead_pool` | Tabel paginasi; **memuat** akun parkir (badge Lead Pool) |
| **LeadPoolPage** | `accounts` | **`is_in_lead_pool=true`** + `deleted_at null` (`:117-125`) | Hanya akun parkir |
| **LeadPoolApprovalPage** | `accounts` | **`pull_status='pending'`** (`:80-87`) | Antrian approval tarik-dari-pool |
| **CustomerListPage** | `accounts` | `account_status = 'customer'` \| `'free_agent'` (`:559-575`) + **client-side** `source_company.code` (`:602-608`) | Master customer; entitas via client-filter |
| **CRMDashboardPage** | `accounts` + `activities` | akun pra-customer (`:1867`), akun customer-WON (`:1943`), `activities` type call/visit (`:1910-1929`) | Agregasi KPI/funnel/feed |
| **CRMReportPage** | `activities`+`accounts`+`quotations` | `accounts.in(PROSPECT_STATUS=[pra-customer])` + **rentang tanggal `created_at`** (`:196-200`); `activities` rentang `scheduled_for`; `quotations` status∈SENT | Laporan performa per-sales berjendela tanggal |
| **ActivityLogPage** | via `fetchActivityFeed` | `accounts`+`inquiries`+`quotations`+`activity_logs`+`user_login_logs` (`activityFeed.js:53-97`) | Feed kronologis gabungan (read-only) |
| **ActivitiesPage** | `activities` | `deleted_at null`, **tanpa** filter `type` (semua) (`:523-537`) | Semua aktivitas (agenda) |
| **SalesCallsPage** (mati) | `activities` | **`type='call'`** (`:361-376`) | (dead) hanya call |
| **RiwayatVisitPage** | `activities` | **`type='visit'`** (`:152-158`) | Hanya visit; di menu Reporting |
| **InquiryListPage** | `inquiries` | `deleted_at null` + scope role (`:186-208`) | List inquiry |
| **DealDetailPage** | `inquiries` (single) | `.eq('id',inquiryId)` + related `accounts`/`quotations`/`prf`/`activities` (`:423-454`) | Detail 1 deal |
| **QuotationListPage** | `quotations` | `deleted_at null` + scope (`:104-125`) | List quotation |
| **RateListPage** | `rate_sheets` | tanpa `company_id`/`deleted_at` (andalkan RLS) (`:259-266`) | List rate sheet |
| **IndomarcoDashboardPage** | RPC `indomarco_dashboard_stats` | agregasi `sp_items` di DB (`:148`) | Dashboard SP Indomarco (bukan akun) |

**Definisi "pra-customer" konsisten** di semua reader: `['lead','mql','sql','prospect','lead_pool']` (lead_pool = sisa transisi ber-`TODO`).

### 4. ROLE GATE

**Mekanisme** (`canSeeMenuItem`, `App.jsx:1194-1210`): urutan **public → `menuKey` (hasMenuPermission per-user) → `module` (hasPermission) → `role[]` → default-deny**. **Item ber-`menuKey` short-circuit** (`:1200-1201`) → `role`/`module` inline **DIABAIKAN**.

**Gate global:** semua konten dibungkus `canAccessActiveMenu` → `isMenuAccessible` (`:2279`/`:2661`) + effect redirect ke Command Center bila tak akses (`:1930`). Jadi **setiap halaman tergate** oleh guard global ini, walau blok render-nya tak punya `canRenderPage` sendiri.

**Peta gate CRM (aktual):**
- **Via `menuKey`** (`MENU_KEY_MAP:1117-1129`, per-user DB): `crm-dashboard`→`crm_dashboard`, `crm-pipeline`→`crm_pipeline`, `crm-prospects`→`crm_prospects`, `crm-inquiry`→`crm_inquiry`, `quotation-draft`→`crm_quotation`, `crm-customers*`+`customer-detail`→`crm_customers`. **⚠️ Inline `module:'crm'`+`role[…]` pada `crm-prospects` (`:480`) MATI** (di-override menuKey).
- **Via `role[]` inline** (tanpa menuKey): `crm-lead-pool` (`:478`), `crm-lead-pool-approval` (`:479`), `crm-rate-list` (`:483`), `crm-sales-order` (`:484`), `crm-calls` (`:494`), `crm-activity-log` (`:495`).
- **`customer-detail`**: tak punya gate sendiri — masuk **SYNTHETIC allow-list** (`:1909`,`:2283`) → selalu di-allow oleh guard global; keamanannya bergantung pada `crm-customers` (satu-satunya jalan masuk).

**Halaman tanpa `canRenderPage` per-blok (hanya guard global):** `crm-dashboard`, `crm-pipeline`, `crm-prospects`, `crm-inquiry`, `quotation-draft`, `crm-customers*`, `crm-calls`, `crm-activity-log`, `crm-lead-pool`, `crm-rate-list`, `reporting-sales`, `reporting-mom`. **Dengan `canRenderPage` ganda (redundan):** `crm-lead-pool-approval` (`:3345`), `crm-sales-order` (`:3246`), `riwayat-visit` (`:3287`), `indomarco-dashboard` (`:3298`), `proc-sales-order` (`:3263`).

**Tanpa gate sama sekali:** tidak ada di CRM — semua item punya menuKey/role, dan default-deny menutup sisanya. (`quotation-draft` juga ber-menuKey.)

### 5. JALAN MASUK & KELUAR

**Helper nav (`App.jsx`):** `navigateTo(id)` (`:1702`, reset semua state sub-CRM), `navigateToCustomerDetail` (`:1746`→`setActiveMenu('customer-detail')` `:1755`), `backFromCustomerDetail` (`:1757`→balik `prevCustomerMenu`).

| Halaman | Jalan MASUK | Jalan KELUAR / lanjut |
|---|---|---|
| CRMDashboard | menu `crm-dashboard` | (tak ada nav keluar terdeteksi) |
| PipelineKanban | menu `crm-pipeline` | "Tambah Deal"→**`crm-prospects`**+form (`:897-899`); ProspectDetailModal edit→**`crm-prospects`**+form (`:1137-1139`) |
| ProspectList | menu `crm-prospects` | `onAddProspect`→form (`:196`); baris→form edit (`:255`) |
| ProspectForm | ProspectList(`:3035/3036`), **Pipeline**(`:897/1137`), **Activities**(`:817-823`) | `onBack`→list |
| Inquiry(list) | menu `crm-inquiry` | `onAddInquiry`→form (`:246`); baris→**DealDetail** (`:305`→`setCrmDealInquiry`) |
| DealDetail | InquiryList `onSelectInquiry` (`:3060`) — **satu-satunya masuk** | `onEditInquiry`→InquiryForm-edit (`:594`); `onCreateQuotation`→**`quotation-draft`** form (`:672`/`App:3082`); `onViewQuotation`→**`quotation-draft`** detail (`:702`/`App:3083`); `onCreatePRF`→**`prf`** (`:718`/`App:3085`) |
| InquiryForm | InquiryList `onAddInquiry` (create); DealDetail `onEditInquiry` (edit) | `onBack` |
| Quotation(list) | menu `quotation-draft` | `onAddQuotation`→form (`:166`); baris→detail (`:220`) |
| QuotationDetail | QuotationList `onSelectQuotation` (`:220`); **DealDetail** `onViewQuotation` (lintas-menu, `:3083`) | `onEdit`→form (`:343`); `onDuplicate`→form (`:350`) |
| QuotationForm | QuotationList(`:166`), QuotationDetail edit/dup(`:343/350`), **DealDetail** onCreateQuotation(`:3082`) | `onBack` |
| Master Customer (5 menu) | menu `crm-customers*` | baris→**`customer-detail`** (`:734`→`navigateToCustomerDetail`) |
| CustomerDetail | dari 5 CustomerList (`:3158/3165/3172/3179/3186`) — **hanya via baris** | `onBack`→`prevCustomerMenu` (`:1757`) |
| Activities | menu `crm-calls`; **deep-link notifikasi `activity`** (`:1843`) | `openProspectFromActivity`→**`crm-prospects`**+form (`:817-823`) |
| ActivityLog | menu `crm-activity-log` | (read-only, tak ada nav keluar) |
| LeadPool | menu `crm-lead-pool`; **deep-link notifikasi `lead_pool`** (`:1844`) | request pull (in-page); tak pindah menu |
| LeadPoolApproval | menu `crm-lead-pool-approval` | approve/reject (in-page) |
| RateList | menu `crm-rate-list` | (in-page CRUD) |
| Sales Order (CRM) | menu `crm-sales-order` | list↔form↔detail (state internal) |

**Jalan masuk TUNGGAL (satu-satunya):** `DealDetailPage` (hanya dari InquiryList `:3060`); `CustomerDetailPage` (hanya baris CustomerList). **Tanpa jalan lanjut (dead-end nav):** `CRMDashboardPage`, `ActivityLogPage`, `RateListPage`, `LeadPoolApprovalPage`, `RiwayatVisitPage`, `IndomarcoDashboardPage` (tak memicu `setActiveMenu` keluar). **Deep-link notifikasi CRM** (`handleNotifClick:1842-1845`): `activity`→`crm-calls`, `lead_pool`→`crm-lead-pool` (+ `mom`→`reporting-mom`); **tidak ada** handler `reference_type='account'`.

### 6. SUBMENU MASTER CUSTOMER

**Empat submenu = SATU komponen** `CustomerListPage` dengan prop `entityFilter` (`:3162-3188`): `"MSI"`/`"JCI"`/`"SOA"`/`"FREE_AGENT"`. Plus induk `crm-customers` tanpa `entityFilter` (`:3155`, "backward-compat default").

**Apa yang membedakan query:**
- **Query DB** ditentukan hanya oleh `statusFilter` (`:562`): `entityFilter==='FREE_AGENT'` → `account_status='free_agent'`; **selain itu** (MSI/JCI/SOA/tanpa-filter) → `account_status='customer'`. **Jadi MSI, JCI, SOA menjalankan query DB yang PERSIS SAMA.**
- **Pembeda MSI vs JCI vs SOA murni client-side:** `filtered` membuang baris yang `c.source_company?.code !== entityFilter` (`:602-608`); `source_company` = embed `companies!prospects_owner_company_id_fkey(code)` (`:569`) = `accounts.owner_company_id` → `companies.code`.
- **Tidak ada `.eq('company_id', …)` di fetch** (`:564-575`) → cakupan dibatasi **RLS** (`get_user_company_id`; super_admin lintas-entitas). Konsekuensi: untuk user single-entity, submenu entitas LAIN **selalu kosong** (RLS sudah menyaring ke company sendiri, lalu client-filter pada code lain → 0 baris). Hanya `super_admin` melihat isi ketiga entitas.

**Hubungan dengan pemilih entitas di header:** **TIDAK ADA pemilih entitas di header** dalam kode. Topbar desktop (`:2416-2445`) hanya berisi logo MSI statis + search + (kanan) notifikasi/profil; grep `EntitySwitcher`/`activeEntity`/`entity picker`/`companySwitch` = **0 hit**. Jadi **submenu Master Customer adalah satu-satunya mekanisme pemilihan entitas** di UI, dan ia menyaring `owner_company_id.code` (client-side), **bukan** `company_id` scope. Apakah header picker "MSI/JCI/Storbit" direncanakan tak bisa dipastikan dari kode (CLAUDE.md menyebut "entity switcher navbar" sebagai item terencana — di luar snapshot kode ini).

**Cross-listing:** `crm-customers` juga muncul di grup **Logistics** (`:521`, `note:'Di CRM'`) — pointer ke halaman yang sama, bukan komponen kedua.

### 7. DUPLIKASI & TUMPANG TINDIH

Ringkas (tabel detail di bawah). **Tumpang tindih terbesar** = keluarga pembaca `accounts` pra-customer (Pipeline, Prospects, sebagian CRMDashboard, CRMReport, ActivityLog-feed) — semua himpunan akun yang **sama**, beda **tampilan/agregasi**. **Activities vs Riwayat Visit vs SalesCalls(mati)** — semua `activities`, beda filter `type`. **Master Customer MSI/JCI/SOA** — query identik, beda client-filter.

### 8. YANG AKAN PATAH KALAU MENU DIRESTRUKTUR

Titik hardcode yang bergantung pada id/urutan menu (`App.jsx`):
- **Dua struktur menu harus disinkron:** `ERP_MENU_GROUPS` (`:470-499`) **dan** `NEXUS_NAV` (`:862-886`) — ubah satu tanpa satunya = sidebar/gate divergen.
- **`MENU_KEY_MAP`** (`:1117-1129`) — tiap id CRM → menuKey. **Rename id = putus gate izin** (menuKey hilang → jatuh ke role/module/default-deny).
- **Dua allow-list `SYNTHETIC`** (`:1909`, `:2283`) hardcode `'customer-detail'` + prefiks (`startsWith('customer-')`, `'crm-customers'`).
- **Redirect guard prefiks** (`:1911-1913`) — `startsWith('customer-')`.
- **Catch-all ComingSoon** (`:2719-2724`) hardcode daftar id [`reporting-sales`,`riwayat-visit`,`indomarco-dashboard`,`reporting-mom`,`prf`,`crm-sales-order`,`proc-sales-order`,…] + prefiks `startsWith('crm-')`, `'quotation-'`, `'customer-'`. Id baru yang tak cocok pola → bisa jatuh ke ComingSoon; id lama yang di-rename keluar dari pengecualian → bisa ke-treat ComingSoon.
- **`navigateToCustomerDetail`** (`:1746-1755`) cari `'crm-customers'` di ERP_MENU_GROUPS + `setActiveMenu('customer-detail')`.
- **Deteksi modul aktif** (`:1277`, `:1405`) hardcode `'crm-customers'`/`'customer-detail'`/`startsWith('crm-customers')`.
- **Deep-link notifikasi** (`:1842-1845`) hardcode `'activity'→crm-calls`, `'lead_pool'→crm-lead-pool`, `'mom'→reporting-mom`.
- **Nav lintas-menu di komponen:** DealDetail→`setActiveMenu('quotation-draft')` (`:3082/3083`), →`'prf'` (`:3085`); Activities→`'crm-prospects'` (`:817`); Pipeline→`'crm-prospects'` (`:897/1137`).
- **~40 blok render** `activeMenu === 'crm-…'`/`'quotation-draft'`/`'customer-detail'` (`:3030-3475`) — tiap id di-cocokkan literal.
- **`quotation-draft`** (id non-`crm-`) khusus: dipakai di menuKey `crm_quotation`, prefiks `'quotation-'` di catch-all, dan blok render — memindahkannya menyentuh ketiganya.

---

## HALAMAN YANG TUMPANG TINDIH — tabel perbandingan

| Pasangan | Sama | Beda | Besar tumpang tindih |
|---|---|---|---|
| **PipelineKanban ↔ ProspectList** | Tabel `accounts`, himpunan pra-customer identik (`[lead,mql,sql,prospect,lead_pool]`) | Kanban board-per-`pipeline_stage` + **mengecualikan `is_in_lead_pool=true`** (`:587`); List = tabel paginasi + **memuat** akun parkir (badge) | **TINGGI** — data inti sama, murni beda tampilan + 1 filter parkir |
| **PipelineKanban ↔ LeadPool** | `accounts` | Kanban `is_in_lead_pool=false`; LeadPool `is_in_lead_pool=true` — **komplemen** | Komplementer (tak overlap baris, tapi satu sumbu) |
| **ProspectList ↔ LeadPool** | `accounts` pra-customer | ProspectList memuat parkir+non-parkir; LeadPool hanya parkir → **LeadPool ⊂ ProspectList** | LeadPool subset ProspectList |
| **Activities ↔ RiwayatVisit** | Tabel `activities` | Activities = semua `type`; RiwayatVisit = `type='visit'` saja (di menu **Reporting**) | **TINGGI** — RiwayatVisit = subset Activities |
| **Activities ↔ SalesCalls(mati)** | Tabel `activities` | Activities semua type; SalesCalls `type='call'` — **SalesCalls tak dirender (dead)** | Subset, tapi SalesCalls mati |
| **Activities/RiwayatVisit ↔ CRMDashboard(calls/visits) ↔ ActivityLog** | `activities`/`activity_logs` | Activities=list; Dashboard=hitung minggu ini; RiwayatVisit=visit; ActivityLog=feed gabungan | Sedang — beda agregasi/feed |
| **CRMDashboard ↔ CRMReport** | `accounts` pra-customer + `quotations` + `activities` | Dashboard=snapshot KPI/funnel; Report=performa per-sales **berjendela tanggal** (`created_at`) | Sedang — metrik mirip, sumbu waktu beda |
| **Master Customer MSI ↔ JCI ↔ SOA** | Query DB **identik** (`account_status='customer'`) | Hanya client-filter `source_company.code` (`:602-608`) | **SANGAT TINGGI** — satu komponen, satu query, beda 1 baris filter |
| **Master Customer(customer) ↔ Free Agent** | Komponen sama (`CustomerListPage`) | Query beda: `account_status='customer'` vs `'free_agent'` (`:562`) | Rendah (query beda) |
| **Sales Order (CRM `crm-sales-order`) ↔ Sales Order Procurement (`proc-sales-order`)** | Komponen sama (`SalesOrderDocListPage/DetailPage`), tabel `sales_orders` | prop `variant` `crm` (bikin+lihat) vs `procurement` (read-only) (`:3254`/`:3269`) | Tinggi — satu komponen, beda variant/izin |
| **InquiryList ↔ DealDetail** | `inquiries` | List vs detail 1 baris + related | Rendah (list vs detail) |
| **QuotationList ↔ QuotationDetail** | `quotations` | List vs detail | Rendah |
| **"Sales Order" CRM (`crm-sales-order`→`sales_orders`) ↔ "Sales Order / SP" Logistics (`manifest`→`SalesOrderPage`, `sp_items`/`sp_orders`)** | **Nama menu mirip ("Sales Order")** | Domain **beda total**: SO dokumen (`sales_orders`) vs SP manifest Storbit (`sp_items`) | Nol data-overlap, **tinggi risiko kebingungan nama** |

---

## PERTANYAAN TERBUKA (tak bisa dipastikan dari kode saja)

1. **Apakah menuKey CRM benar-benar ter-seed di `user_menu_permissions`?** Item `crm-dashboard`/`crm-pipeline`/`crm-prospects`/`crm-inquiry`/`quotation-draft`/`crm-customers` gate-nya `hasMenuPermission(menuKey,'view')` (`:1200-1201`). Bila menuKey terkait **belum di-seed**, `hasMenuPermission` mengembalikan false → menu **tersembunyi untuk semua role** (dan pada `crm-prospects`, `role[]` inline yang seharusnya menyelamatkan **diabaikan** karena menuKey menang). Status seed = **butuh query DB** (`user_menu_permissions`/`module_menus`), tak terbaca dari `schema_snapshot.sql` (`--schema-only`). Ini menentukan apakah gate CRM sebenarnya "per-user DB" atau efektif mati.
2. **Pemilih entitas header (MSI/JCI/Storbit)** — **tidak ada di kode**. Apakah memang direncanakan (fitur navbar) atau premis keliru? Tak bisa dipastikan dari kode; hanya submenu Master Customer (client-filter `owner_company_id`) yang menyaring entitas.
3. **Batas scope "CRM" vs "Reporting":** `reporting-sales`(CRMReportPage), `riwayat-visit`, `indomarco-dashboard`, `reporting-mom` membaca data CRM tapi tinggal di grup **Reporting**. Apakah ini dianggap bagian modul CRM untuk restrukturisasi = **keputusan desain**, bukan fakta kode.
4. **Id induk `crm-dashboard` yang bertabrakan dengan anak** (`:474` vs `:476`): efek `findMenuItemById` (match pertama) pada gate/aktif-modul tak sepenuhnya tertelusur untuk semua pemanggil — perlu verifikasi runtime bila kritikal.
5. **`crm-customers` di grup Logistics** (`:521`) — apakah pointer ini dirender di sidebar Logistics (via NEXUS_NAV) atau hanya artefak ERP_MENU_GROUPS? NEXUS_NAV nav-sp (`:888-896`) **tak** memuat `crm-customers`; jadi cross-link ini kemungkinan hanya di ERP_MENU_GROUPS (tak tampil di sidebar aktual) — **butuh konfirmasi runtime**.
6. **`RateListPage` tanpa filter `deleted_at`/`company_id`** (`:259-266`, andalkan RLS) — apakah `rate_sheets` punya kolom `deleted_at`/soft-delete & RLS company-scoped memadai, tak terverifikasi di audit navigasi ini (di luar scope; tandai untuk audit data).

---

**Catatan wajib:** Audit ini **tidak menjalankan app/DB**; semua dari `src/` + docs. Status seed permission (§PT-1) & keberadaan header entity picker (§PT-2) **butuh verifikasi runtime/DB**. Nol file diubah selain dokumen ini; nol perubahan DB; **tidak ada usulan struktur baru** (sesuai instruksi).
