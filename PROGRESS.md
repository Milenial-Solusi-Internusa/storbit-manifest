# Nexus MSI — Development Progress Log

## 2026-06-17

### Activity cutover Phase 2A — frontend call/visit → `activities`/`activity_logs` (Phase 2.9D)
> Cutover **data-layer only** — tampilan/UX tidak berubah. Setelah ini TIDAK ada kode menyentuh `sales_calls`/`sales_visits`/`sales_visit_logs`. Plan: `ACTIVITY_UI_MAP.md`.
- [x] **SalesCallsPage.jsx** — CRUD call → `activities` (type='call', status='done'). Read remap activities→bentuk call lama (UI tak diubah); write payload + `details jsonb` (call_type/duration_minutes/bant_collected); account name embed `accounts!activities_account_id_fkey`
- [x] **CRMDashboardPage.jsx** — kalender visit + 2 KPI mingguan (call/visit) read → `activities`; `handleSaveVisit` write → `activities` (type='visit', `details` visit_type/location/point_of_meeting/mom, `follow_up`→`next_action`); log write + VisitDetailModal timeline read → `activity_logs` (`activity_id`); `ownBySales` pakai `assigned_to`
- [x] **CustomerDetailPage.jsx** — History Visit + Health Score read → `activities` `.eq('account_id',id).eq('type','visit')` (**visit only**, call tidak digabung — keputusan disetujui)
- [x] **Mapping status** scheduled/completed/cancelled ⇄ todo/done/cancelled (`VISIT_TO_ACT_STATUS`/`ACT_TO_VISIT_STATUS`); `activity_logs` simpan vocab visit agar konsisten dgn data migrasi + lookup `VISIT_STATUS`
- [x] **Nama sales/log-author via client-side map** — `activities.assigned_to` & `activity_logs.changed_by` tak punya FK ke `profiles` (DB tak diubah) → fetch profiles by id (TANPA filter active, biar sales nonaktif/lama tetap kebaca) & map di JS. Account name tetap embed (FK ada)
- [x] **Fix #3 dropdown sales** — helper `fetchSalesProfiles(companyId)` (RBAC: `roles.code='sales'` per-company → `user_roles` is_active+revoked_at IS NULL+company_id → profiles active), **tanpa hardcode role_id**; ganti query bocor CRMDashboard (tanpa company filter) + konsistenkan SalesCallsPage. Default salesperson = user login dibiarkan
- [x] **Verifikasi:** `grep sales_calls|sales_visits|sales_visit_logs` di `src/` = **0 di luar `*.legacy`**; `npm run build` clean (**2629 modules, 886ms**)
- [ ] **Checklist tes manual (belum dijalankan — runtime):** log call baru muncul di list · tambah visit dari kalender → muncul di kalender+detail+timeline · detail customer tampil history visit · login sales → dropdown cuma sales se-entitas · KPI call/visit wajar
- [ ] **(Backlog) drop `sales_calls`/`sales_visits`/`sales_visit_logs`** setelah tes manual lolos (masih DORMANT)

### DB Changes via SQL Editor (Phase 2.9B/2.9C — dokumentasi, sudah masuk schema_snapshot.sql refresh: 71 tabel, ~8.395 baris)
> Tidak ada kode/DB diubah dari sesi dokumentasi ini. Detail lengkap: CLAUDE.md section **DB Changes via SQL Editor — 17 Jun 2026** + audit `CRM_FLOW.md` & `ACTIVITY_UI_MAP.md`.
- [x] **(2.9B) WON → customer (fix konversi).** Masalah: deal `pipeline_stage='WON'` tidak selalu jadi `account_status='customer'` — cuma jalur drag+`WinLossModal` yang konversi; form-edit ([ProspectFormPage.jsx:320-323](src/modules/crm/ProspectFormPage.jsx#L320)) & import TIDAK (gejala: TOKO DAMRAH, `created_by` null = jejak import). Fix: (1) backfill record WON yang masih `prospect`; (2) trigger `trg_set_customer_on_won` (function `set_customer_on_won`, `BEFORE INSERT OR UPDATE ON accounts`) set `account_status='customer'` + `became_customer_at`/`converted_at` saat `pipeline_stage='WON'`. **Menutup SEMUA jalur → DB jadi sumber kebenaran tunggal**; frontend `WinLossModal` jadi redundan (dibiarkan, tak dicabut)
- [x] **(2.9B) Tabel `public.activities` (Phase 1 modul Activity/Task).** Tabel baru yang menyatukan & akan menggantikan `sales_calls`+`sales_visits`: multi-tipe (`type` call/visit/meeting/prospecting/followup), `status` todo/done/cancelled, anchor `account_id`/`inquiry_id`/`quotation_id` (FK lengkap → menjawab titik-putus `CRM_FLOW.md`), `details jsonb` per-tipe, `migrated_from`, RLS role-aware niru `accounts`, 6 index. Data lama dimigrasi (0 calls + 2 visits)
- [x] **(2.9C) Tabel `public.activity_logs` (audit log status untuk `activities`).** Kolom: `activity_id` → activities(id) **ON DELETE CASCADE**, `changed_by`, `changed_at`, `from_status`, `to_status`, `notes`; 1 index (`activity_id`); **RLS scope via parent activity** (`EXISTS` ke `activities`, bukan `company_id` langsung). **Menggantikan `sales_visit_logs`**; data lama dimigrasi (2 log)
- [ ] **(Backlog) repoint frontend call/visit/log → `activities`/`activity_logs`:** `SalesCallsPage.jsx` + `CRMDashboardPage` AddVisitModal/VisitDetailModal/fetch masih pakai tabel lama (`sales_calls`/`sales_visits`/`sales_visit_logs`). Inventory UI: `ACTIVITY_UI_MAP.md`
- [ ] **(Backlog) drop `sales_calls` + `sales_visits` + `sales_visit_logs`** — HANYA setelah frontend dipindah & diverifikasi (saat ini DORMANT, jangan drop dulu)

### DB Schema Snapshot
- [x] `pg_dump --schema-only --schema=public` → `supabase/schema_snapshot.sql` (**69 tabel, ~8.140 baris**); pakai `pg_dump` (libpq), BUKAN `supabase db pull` (Docker tak terinstall). Menangkap semua perubahan SQL-Editor (4 kolom `assets`, `accounts` unified, RBAC 6 tabel, dll)
- [x] Roadmap 🔴 "schema ke version control" = **DONE**; cara refresh + instruksi "baca snapshot, bukan migrasi" dicatat di section **DB Schema Reference** (CLAUDE.md)

### Mobile Responsive Overhaul (Phase 2.8S–2.8X)
> Prinsip: SEMUA perilaku mobile di-gate breakpoint (`@media max-width:1023px` / Tailwind `lg:`) → **desktop ≥1024px tidak berubah sama sekali**.
- [x] **2.8S** — Fix layout BLANK di mobile: container utama `flex min-h-screen` → `flex flex-col lg:flex-row` (flex-row bikin mobile topbar ke-stretch ~2389px menutupi konten). App.jsx
- [x] **2.8T** — Responsive grids semua halaman utama: util opt-in di `index.css` (`.nx-grid-kpi`/`.nx-grid-3`/`.nx-grid-2`/`.nx-page-pad`/`.nx-stack`) aktif HANYA `@media(max-width:1023px)` + `!important` → desktop ≥1024 pixel-identik (inline style menang). Diterapkan: CRM/Inventory Dashboard, Asset (IT/detail/dashboard), Logistics (InputSP/SalesOrderDetail), Quotation detail/form (`nx-stack`), Finance Defaults. Tabel lebar pakai `overflow-x-auto`
- [x] **2.8U** — Navigasi mobile: hamburger drawer + App Launcher. `ModuleSidebar` prop `asDrawer`/`isOpen`/`onClose` (reuse, DRY); desktop sidebar static (`hidden lg:flex`), mobile drawer slide-in + overlay; hamburger (lucide `Menu`) muncul saat in-module; nav pills flat dihapus; App Launcher kini tampil di mobile; state `mobileDrawerOpen`. App.jsx
- [x] **2.8V→2.8W** — Kalender mobile: scroll horizontal (2.8V, sempat dibuat) → **diganti** pola dot + tap-for-detail (2.8W). Mobile <1024px cell mengecil (7 kolom muat tanpa scroll), event jadi DOT PASTEL (sky `#A5C8E8`/teal `#7FD8C4`/peach `#F5C9A8`, maks 3 + "+N"); tap tanggal ber-visit → bottom-sheet detail + Tambah Visit; desktop tetap event-text. Hybrid: visual CSS (`hidden`/`lg:`), tap via `useIsMobile` (matchMedia). `.nx-cal-scroll` dihapus total. CRMDashboardPage.jsx + index.css
- [x] **2.8X** — Recent Activity reflow mobile: timestamp+badge dibungkus `nx-act-meta`, di mobile pindah ke bawah nama (stack, tak overlap); desktop tetap horizontal. CRMDashboardPage.jsx + index.css

### CEO Unblock (Phase 2.8Y — DB change via SQL Editor, BUKAN di repo)
- [x] `profiles_read` di-DROP & dibuat ulang `USING (true)` → semua `authenticated` bisa baca `profiles`; `profiles_update` TIDAK disentuh. Akar masalah: `is_admin_or_above()` tak kenal role `ceo` → CEO ke-block baca nama assignee/sales
- [x] Aman sekarang (`profiles` bukan HRIS, tak ada data sensitif). **⚠️ WAJIB diperketat saat modul HRIS masuk**

### RLS Migration Backlog (planned — BESAR, risiko tinggi, sesi fresh)
- [ ] Migrasi RLS proper (RBAC-driven): ganti cek role hardcode → RBAC granular + entity boundary; prasyarat HRIS
- [ ] Audit 173 policy: ~51 `is_admin_or_above` (target migrasi), 70 `super_admin` (OK), 130 `company_id` (OK); `has_permission()` BROKEN (query tabel `permissions`/`role_permissions` yg tak ada)
- [ ] Cross-entity (`is_cross_entity`) sudah ada strukturnya di `role_permission_templates` & `user_menu_permissions`; rencana 4 fase — detail di CLAUDE.md section **Backlog — Migrasi RLS Proper (RBAC-driven)**

### Console cleanup + empty-catch fix (Phase 2.8Z)
- [x] Hapus 6 `console.log` debug di `AuthContext.jsx` (termasuk yg mem-leak seluruh row profile user) + 3 `console.log` data produk/company di `ProductsPage.jsx`; `console.error`/`console.warn` (error handling beneran) dipertahankan
- [x] `PipelineKanbanPage.jsx` empty `catch (_) {}` (drag `setData`) → `console.warn` + komentar (operasi opsional, non-fatal, tak di-surface); lint `no-empty` + `_` unused hilang (5→3)
- [x] Refresh angka basi CLAUDE.md Roadmap: App.jsx 4.618→4.667, CRMDashboardPage 1.850→1.996 (aktual `wc -l`)

### CRM Batch 1 — fix correctness frontend (Phase 2.9A, hasil AUDIT_CRM.md)
- [x] Nomor dokumen: hapus fallback `Date.now().slice(-4)` di InquiryForm/QuotationForm `generateXNo` → RPC gagal = throw → save dibatalkan + toast error (tak ada nomor non-sekuensial)
- [x] InquiryForm dropdown account tambah `.limit(1000)` (default-10 → account ke-11+ tak kepilih); QuotationList tambah `.is('deleted_at', null)`
- [x] Role-aware visibility (tiru pola ProspectListPage) di InquiryList/QuotationList/SalesCalls — super_admin lihat semua entitas, sales hanya miliknya; sales-own ikut kolom RLS (inquiries/quotations=created_by, sales_calls=salesperson_id/created_by)
- [x] `.single()`→`.maybeSingle()`: QuotationDetail (3×), CustomerDetail (2×), QuotationForm, InquiryForm — aman saat data minim (mis. payment_terms null)
- [x] `catch {}` CustomerDetail/CustomerList → `console.error` + cek error query fallback (tak senyap)
- [ ] (Batch DB terpisah — belum) RLS `inquiries_update` admin-only, UNIQUE accounts (dedup), write quotation atomik

### Backlog (update)
- [ ] Mobile polish — verifikasi visual per-halaman (Inventory/Asset/Logistics/Quotation) di <1024px
- [ ] Warning React "form field value without onChange handler" di input read-only — bersihkan
- [ ] (lanjut) audit CRUD policy lintas tabel · update `assigned_to` 24 laptop · cleanup office Semper · Software/Maintenance inline edit

## 2026-06-16

### Quotation
- [x] Fix PDF quotation (Phase 2.8M): section header dipindah ke `<thead>` sebagai `<tr className="pdf-no-break">` (anti ke-potong antar halaman) + box Notes (border kiri navy `#144682`) & Above rates/Terms (border kiri orange `#E85A1E`)
- [x] Fix RLS `quotations_update` (Phase 2.8Q, DB via SQL Editor): policy lama `is_admin_or_above()` → sales ke-block edit quotation sendiri. Diubah `(company_id=get_user_company_id() AND (is_manager_or_above() OR created_by=auth.uid())) OR is_super_admin()` + `WITH CHECK` sama. Sales kini bisa edit quotation miliknya

### Inventory
- [x] Dashboard Inventory baru (Phase 2.8N): `InventoryDashboardPage.jsx`, accent **TEAL #0D9488** (pembeda dari navy CRM), data Supabase asli (role-aware, company-scoped, `.limit(1000)`, `useWidth` callback ref). KPI: Total SKU, Total Nilai Inventory, Total On-Hand, Stok Menipis (<10). Charts: tren pergerakan (`stock_ledger`), stok per kategori, top 10 by nilai, per gudang
- [x] Fix nilai inventory (Phase 2.8N-fix): `unit_cost` semua NULL → pakai `default_price` (harga jual); subtitle "Berdasarkan harga jual"

### CRM
- [x] Fix visit dropdown (Phase 2.8O, CRMDashboard AddVisitModal): `.eq('account_status','prospect')` → `.in('account_status',['prospect','customer'])` supaya customer (mantan WON spt Indochem) muncul; label "Prospect" → "Prospect / Customer". Query KPI/salesPerf tetap prospect-only

### Asset Management
- [x] Inline edit semua tab `AssetDetailITPage` (Phase 2.8P): tombol Edit global → field Info/Spesifikasi/Network jadi input in-place (bukan modal/route), Save/Cancel, save lintas 3 tabel via UPSERT + error handling per-tabel + refetch tanpa reload. Assigned To = dropdown user (pilih → checked_out, kosong → available). Dropdown bernilai-valid utk field ber-constraint (status/asset_subtype/storage_type/depreciation_method). Health/Software/Maintenance read-only (TODO per-row)
- [x] Aktifkan brand/condition/department_id/assignment_status (Phase 2.8P-fix): keempat kolom ADA di DB (via SQL Editor, belum di migrasi). Edit form + view mode + save; fix `useAssetDetail` select tak ambil `assigned_to_user_id` (dropdown assignee kini pre-fill benar)
- [x] Schema (DB via SQL Editor, Phase 2.8R): `assets` ALTER ADD `condition`/`department_id`(FK departments)/`brand`/`assignment_status`(default 'available')
- [x] Master data (DB via SQL Editor): `asset_locations` "Head Office BSD" (branch_id MSI HO, NOT NULL); `departments` MSI +3 (HCGA/PPJK/CONSOLE); bulk insert **24 laptop MSI** ke `assets`+`asset_specifications`+`asset_network` (assigned_to kosong, assignment_status 'available')

### Catatan / Backlog
- [ ] ⬆️ **`supabase db pull`** NAIK PRIORITAS — 2× jadi penghambat hari ini (4 kolom `assets` + `unit_cost` via SQL Editor tak terlihat di file migrasi → sempat skip field)
- [ ] Audit CRUD policy lintas tabel — pola berulang "UPDATE admin-only" (`quotations_update`) + over-filter `account_status` (dashboard/visit/visibility)
- [ ] Update `assigned_to` 24 laptop MSI setelah re-audit
- [ ] Office "Semper": 2 branch duplikat di JCI (SEMPER + HO SEMP) — office asli MSI Group (hampir salah hapus), perlu dedup + ownership
- [ ] Inline edit tab Software & Lisensi + Maintenance (per-row terpisah, ada TODO)
- [ ] UI list Asset tampilkan field baru (condition/brand/department/assignment_status)

## 2026-06-15

### Security Hardening (milestone)
- [x] Cabut GRANT `anon` di **29 tabel sensitif** — 3 finansial (accounts/quotations/quotation_items) + 26 (finance/RBAC/user/CRM/inventory); RLS tetap lapisan kedua (defense-in-depth, anon ke-block di GRANT DAN RLS); GRANT `authenticated` diverifikasi lengkap sebelum revoke
- [ ] Backlog: tabel kategori REFERENCES/TRIGGER/TRUNCATE-only (companies/payment_terms/assets dll) belum dicabut — tidak urgent (tidak beri akses baca/tulis data)

### Bug Fixes — CRM & Auth (Phase 2.8B–2.8I, kode)
- [x] 2.8B — Form state hilang saat tab-switching (AuthContext Opsi A: `previousUserIdRef`, skip `setLoading` saat same-user re-emit SIGNED_IN/TOKEN_REFRESHED)
- [x] 2.8C — Prospect visibility role-aware (super_admin/admin semua entitas, manager se-entitas, sales own) + badge "Belum di-assign" + auto-assign saat sales create prospect
- [x] 2.8D — Dropdown Assigned To kosong di Edit Prospect (list select tak ikut `assigned_to` UUID; synthetic option utk cross-entity assignee)
- [x] 2.8E — `UNIT_LABELS` quotation jadi 13 (tambah Per CBM/KG/Ton/Container/Shipment/Trip di depan)
- [x] 2.8F — Soft stage gating (PROPOSAL butuh inquiry, WON butuh quotation — konfirmasi via ConfirmModal, bisa di-bypass)
- [x] 2.8G — Dashboard WON/Win Rate/Sales Performance hitung deal WON termasuk yang auto-convert jadi customer (`became_customer_at`); Total Prospects tetap prospect aktif saja
- [x] 2.8H — Chart Prospect Trend kosong → `useWidth` pakai callback ref (terukur saat container mount setelah data load)
- [x] 2.8I — Polish CRM Dashboard: gradient horizontal line (ungu→pink→biru), Bulan Lalu jadi abu, pie Lead Source pastel + fix crop

### Bug Fix — Quotation Duplikat (Phase 2.8J, DB/RLS)
- [x] ROOT CAUSE: RLS policy DELETE hilang di `quotation_items` → `.delete()` "sukses" 0-row tanpa error → insert numpuk → item+total dobel; Solusi: `CREATE POLICY quotation_items_delete` (kode tidak diubah)

### Data Cleanup (Phase 2.8K, DB)
- [x] Indochem dedup: hapus `64ee0492` (customer/NEW kosong), pertahankan `79c3562b` (prospect/WON + inquiry+quotation)
- [x] Indochem → customer (`account_status=customer`, `code=IJL`, `became_customer_at` stamped)
- [x] Konfirmasi auto-convert WON→customer SUDAH ADA di PipelineKanbanPage; Indochem hanya korban timing
- [x] Payment term "Cash Before Delivery" (`CBD`) ditambah ke MSI/JCI/SOA

### Audit Menyeluruh + Roadmap
- [x] Audit aplikasi menyeluruh (arsitektur/keamanan/maintainability/reliability/performance) → section **ROADMAP MENUJU PRODUCTION-GRADE** di CLAUDE.md (3 tier: SEGERA / JANGKA PENDEK / JANGKA PANJANG)

### Status Nggantung
- [ ] Quotation Hisaka (`QUO/MSI/2026/004`) — items di-wipe, total reset 0, **perlu input ulang via UI**
- [ ] Field Registry Level 1 — disepakati, nunggu 4 keputusan desain (struktur metadata, core 2a/2b, custom field JSONB, pilot form Prospect)

## 2026-06-14
### Accounts Unification — Single Master Customer
- [x] Tabel `prospects` → di-rename jadi `accounts` (master customer tunggal); kolom baru: `account_status` (prospect/customer/lost/free_agent/lead_pool), `owner_company_id`, `tier`, `code`, `nomor_kontrak`, `default_dc`, `last_activity_at`, `became_customer_at`
- [x] CRM migrasi penuh ke `accounts` (Batch 1–3): Pipeline/Prospect/Dashboard, Inquiry/Calls/Quotation embeds, Master Customer list+detail — `.eq('account_status', ...)` filter pipeline vs customer
- [x] WON di pipeline → auto-convert `account_status='customer'` + `became_customer_at`
- [x] Customer unification: tabel `customers` → `accounts` (single master); 5 FK di-repoint (sp_items, ar_ttfs, inquiries, quotations, accounts.converted_to); INDOMARCO pindah, id sama; tabel `customers` lama dipensiunkan (tidak dihapus)
- [x] db.js (Storbit SP/AR): listCustomers/upsertCustomer/deleteCustomer → `.from('accounts')`; embed pakai alias `customers:accounts!<constraint>(name)` agar mapper tidak berubah
- [x] CRM InquiryFormPage dropdown → accounts WHERE account_status='customer', simpan ke prospect_id; embed `customer:accounts!*_customer_id_fkey` di Inquiry/Quotation

### Master Customer — Sub-menu per Entitas + Detail Page
- [x] Master Customer 4 sub-menu per entitas: MSI / JCI / SOA / Free Agent (entityFilter)
- [x] CustomerListPage + CustomerDetailPage (dedicated page, state-swap mirror AssetDetailPage); CustomerFormModal named export untuk reuse
- [x] CustomerDetailPage: 6 tab (Info Dasar, Komersial, History Visit, BANT & Pipeline, Health Score, Notes); visual port dari Lovable handoff
- [x] Health Score tab — heuristik dari sinyal real (engagement visit, BANT, pipeline stage, kelengkapan profil, status kontrak); gauge SVG + breakdown; banner "skor sementara"

### User Access Management
- [x] Edge Functions baru: `delete-user` (gate super_admin, blokir hapus akun sendiri) + `reset-password` (min 8 char); pola two-client (caller ANON + admin SERVICE_ROLE)
- [x] Edit User: modal → full page (UserEditPage, state-swap); tab Profile/Permissions; Hapus User + Ubah Password (super_admin only, self-protection)
- [x] Avatar upload — bucket Storage `avatars`, kolom `profiles.avatar_url`, validasi tipe+2MB, overlay kamera + Hapus Foto

### Hierarchical RBAC
- [x] Permission model hierarki: 6 tabel (modules, module_menus, module_actions/menu_actions, user_menu_permissions, dst.) — 9 modules / 57 menus / 399 actions
- [x] AuthContext: `hasMenuPermission(menuKey, action)` + `menuPermissions` state; gating Sidebar + AppLauncher migrasi ke hasMenuPermission (fallback hasPermission → role → true)
- [x] Permission Matrix tab di Edit User (collapsible per module, select-all, diff-based save)

### Drop Legacy profiles.role
- [x] Deprecate `profiles.role` — role sekarang MURNI dari `user_roles` (erpRole/role di context)
- [x] Tahap 1–3 selesai (kode): DB functions dibersihkan, Edge Functions (manage-schema/create-user) pakai `is_super_admin()` RPC bukan profiles.role, frontend `src/` 0 ref profiles.role
- [ ] Tahap 4 — drop kolom `profiles.role` + type `user_role_legacy` (pending approval; verifikasi semua super_admin ada di user_roles dulu)

### Auth Lifecycle Hardening
- [x] Fix A — logout bersihkan `nexus_last_menu`/`nexus_last_module` di localStorage
- [x] Fix B — validasi restored activeMenu (redirect kalau user baru warisi menu yg tak punya akses)
- [x] Fix C — content-level access gate (AccessDeniedPage, defense-in-depth selain sidebar gating)
- [x] Fix D — `permissionsLoading` flag; AppLauncher dim+blocked "Memuat izin akses…" saat permission belum load; fix klik modul no-op setelah login user baru
- [x] Fix enterModule stale closure + auth listener setLoading(true) saat SIGNED_IN

### Lead Pool
- [x] Import 506 lead (arsip, ter-assign ke sales) → `account_status='lead_pool'`
- [x] LeadPoolPage — list/tabel (pagination client-side 25), filter source/type/search, 2 stat card; aksi "Tarik ke Pipeline" per row (account_status → prospect)
- [x] RLS aktif di `accounts`: sales lihat assigned_to=dia, manager se-entitas, super semua

## 2026-06-12
- [x] activeMenu di-persist ke localStorage (`nexus_last_menu`) — survive browser refresh
- [x] ProspectFormPage SOURCE options diperluas jadi 11 (sales_visit, cold_call, referral, existing_network, exhibition, instagram, linkedin, tiktok, website, walk_in, other); sinkron `SOURCE_LABELS_KP` + `sourceToSvc` di PipelineKanbanPage
- [x] Fix profiles query → `.eq('active', true)` (kolom `active`, bukan `is_active`)

## 2026-06-07
### Modules Live — HRGA, Assets, Logistics, Inventory, CRM Dashboard
- [x] HRGA Request module — schema 9 tabel + RLS + GRANT, 20 request types × 3 company, approval matrix; My Requests / Semua Request / detail modal; form ATK line items (migrations 020–024)
- [x] Asset Management — IT Equipment + Kendaraan list/detail (useAssets hook, server-side pagination); migrations 025–027 (specs, network, software licenses, maintenance, fuel logs)
- [x] Logistics Sales Order — SP list page (KPI cards, tabs, filter, bulk, pagination) + SP Detail page (5 tab, Finance Status INV/FP/SUB/KRM per-stage, Edit Item modal, Delete SP type-to-confirm)
- [x] Product Detail Modal — overlay modal, inline edit, toggle active, copy SKU (migration 028)
- [x] Inventory — Stok Barang (stock_summary JOIN products+warehouses) + Penerimaan Barang (goods receipt → stock_ledger)
- [x] App Launcher (Odoo-style grid, solid colour cards per group) + vertical sidebar per module
- [x] CRM Dashboard fully connected ke Supabase — KPI, Pipeline by Stage, Prospect Trend, Lead Source donut, Sales Performance, Calendar Jadwal Visit (semua real, mock dihapus)
- [x] CRM enhancements — Visit stepper (scheduled/completed/cancelled) + visit type + log history; BANT Scorecard; Sales Calls page; Win/Loss capture; Pricing Authority + Quote SLA; dashboard per-role
- [x] `src/lib/spCalc.js` — single source of truth kalkulasi SP (calcItem/groupBySP)
- [x] `src/components/ConfirmModal.jsx` — reusable confirm dialog (ganti semua window.confirm)
- [x] Permission gating DB-driven — role_permissions → hasPermission(module, action) + isCrossEntity

## 2026-06-06
### CRM UI — Visual Redesigns & New Pages
- [x] PipelineKanbanPage.jsx — full visual redesign: Lovable JSX port, chevron/arrow stage headers (clip-path), MSI Navy #144682, list/kanban toggle, drag-drop fade fix (draggingId reset on drop)
- [x] InputSPPage.jsx — full visual redesign: MSI brand colors, Montserrat headings, 2-row item sub-card grid (Product+SKU+QTY / UnitPrice+Shipping+ExpDate+Deadline), BTB trash red bg
- [x] CRMDashboardPage.jsx — new page created from Lovable design bundle, recharts (Bar/Pie/Area), mock data, registered at activeMenu === 'crm-dashboard'
- [x] CRM sidebar menu restructured — 4 items: Dashboard (crm-dashboard), Pipeline/Leads (crm-pipeline), Inquiry (crm-inquiry), Quotation (quotation-draft); removed section dividers and unused items
- [x] 'crm' removed from PLANNED_MODULES — CRM is live, parent click now expands dropdown without navigating to Coming Soon page
- [x] sp_items — tambah 3 kolom baru: sla_days, estimated_delivery_date, delivered_date; auto-calc estimatedDeliveryDate via useEffect; badge Est. Delivery / Delivered / Overdue di item card
- [x] Master Data status audit — documented in CLAUDE.md (12 tabel, status per tabel)
- [x] Roles structure defined — 13 system roles based on official org chart OD/HCGA-MSI/V/2026
- [x] Permission matrix documented in CLAUDE.md
- [x] Role migration completed — 7 deprecated soft-deleted, bod→ceo, supervisor→gm, logistic legacy handled
- [x] Role permissions seeded for all 13 roles (finance, hrga, it, manager, operations, sales, procurement, gm, ceo)
- [x] Company codes updated: SBI → SOA, JCI name → Jago Custom Indonesia
- [x] RolesPage updated with editable permission matrix for super_admin
- [x] Company names updated to PT full names (MSI, JCI, SOA)
- [x] Departments cleaned and synced with org chart — 9 dept MSI/SOA, 10 dept JCI (+PPJK)
- [x] Departments cleaned per entity — JCI (2), MSI (9), SOA (3) sesuai org chart
- [x] Positions cleaned and synced with org chart — MSI (10), JCI (3), SOA (3)
- [x] ProductsPage.jsx created — grid/list view, company tabs, Supabase integration, 78 products (MSI:10, JCI:5, SOA:63)
- [x] Products RLS fixed — super_admin can view all companies; fetch uses id→code map instead of join
- [x] Supabase default limit 10 discovered — fixed with .limit(1000); rule added to CLAUDE.md Debugging Field Notes
- [x] InquiryListPage designed in Lovable — pending port to Nexus
- [x] ProductDetailPage designed in Lovable — pending port to Nexus (adaptive service/product layout)
- [x] CRM tab navigation designed — pending implementation

## 2026-06-05
### CRM Module — Initial Implementation
- [x] Migration: tabel prospects, inquiries, quotations, quotation_items
- [x] RLS & GRANT permissions untuk 4 tabel CRM
- [x] ProspectListPage.jsx — list + filter + badge stage
- [x] ProspectFormPage.jsx — form tambah/edit
- [x] InquiryListPage.jsx — list + filter + auto-generate INQ number
- [x] InquiryFormPage.jsx — form inquiry
- [x] QuotationFormPage.jsx — sectioned table, multi-currency, VAT 1.1%
- [x] PipelineKanbanPage.jsx — 7 kolom, HTML5 drag and drop
- [x] Fix: column mismatch (company_name → name, payment_term_id → payment_terms_id)
- [x] Fix: inquiries.deleted_at ditambah via ALTER TABLE
- [x] Fix: quotation_items.total kolom GENERATED di-DROP, diganti plain numeric
- [x] Schema update: usd_rate di quotations, group_name/currency/unit_label/exchange_rate/total di quotation_items
- [x] Cost price tracking per quotation item — cost_price kolom di quotation_items, no-print CSS, profit summary di sidebar
- [x] Fix: input angka leading zero di QuotationFormPage (cost_price, unit_price, qty, usd_rate)
- [x] Fix: tambah kolom route di insert payload quotations (konfirmasi sudah ada, schema cache issue sisi Supabase)
- [x] QuotationListPage.jsx — list + filter status + search + pagination
- [x] QuotationDetailPage.jsx — detail read-only + sectioned table + print layout + internal cost/profit (no-print)
- [x] Routing App.jsx untuk quotation list, detail, form (create + edit mode via crmQuotationDetail + editingQuotation state)
- [x] PDF generator: jspdf + html2canvas, tombol Download PDF di QuotationDetailPage
- [x] Print area: logo MSI, customer info, sectioned table (tanpa cost_price), summary, notes, footer — off-screen div#quotation-print-area
- [x] Print area redesign: customer details table (dark-green label cells), terms/above rates, Best Regards + jabatan dari profiles.positions, footer alamat lengkap
- [x] Print area update: verticalAlign middle semua customer details cells, baris APPROVED BY + APPROVAL DATE, Best Regards ↔ Approved by side-by-side, divider orange-navy, footer navy dengan 2 kantor MSI
- [x] Fix: QuotationFormPage edit mode — prop quotation, useEffect populate header+sections, handleSave branch UPDATE vs INSERT
- [x] Fix: tambah field Terms & Conditions / Above Rates di QuotationFormPage + di insert/update payload quotations

## 2026-06-05 — SLA & Delivery Fields pada sp_items
- [x] db.js: tambah sla_days, estimated_delivery_date, delivered_date ke spFromDb dan spToDb
- [x] SalesOrderDetailPage EditItemModal: tambah baris baru di section TANGGAL (SLA hari, Estimated Delivery, Delivered Date)
- [x] Auto-calc estimatedDeliveryDate via useEffect saat shippingDate atau slaDays berubah (masih editable manual)
- [x] Item card footer: badge Est. Delivery (biru), badge Delivered (hijau), badge Overdue (merah) sesuai kondisi

## 2026-06-05 — BTB No: item-level → SP-level (sp_btbs table)
- [x] db.js: hapus btb_no dari rowFromDb/spToDb (column renamed btb_no_deprecated), tambah listSpBtbs/addSpBtb/deleteSpBtb/bulkInsertSpBtbs
- [x] SalesOrderDetailPage: hapus btbNo dari EditItemModal state+form+badge, tambah BTB Numbers section di Overview tab (fetch sp_btbs, inline add+delete)
- [x] InputSPPage: tambah BTB Numbers card (dynamic list add/remove), bulkInsertSpBtbs saat submit
- [x] App.jsx ShipmentModal + FinanceModal: hapus btbNo field dari state dan form

## 2026-06-05 — Dynamic Custom Fields for Customers
- [x] useCustomFields.js hook — fetch extra columns via get_table_columns RPC, filter STANDARD_COLUMNS, return customFields array
- [x] CustomFieldsSection.jsx — renders per data_type: text/number/boolean/date/datetime/jsonb, read-only mode support
- [x] CustomerModal updated: useCustomFields('customers'), customValues state, populate on edit, merge on save
- [x] CustomersPage updated: useCustomFields at page level, CustomFieldsSection read-only per card
- [x] STANDARD_COLUMNS exported from hook for use in App.jsx

## 2026-06-05 — Schema Manager
- [x] SchemaManagerPage.jsx — super admin UI untuk tambah kolom ke tabel existing via manage-schema Edge Function
- [x] Sidebar kiri: list tabel per grup (Master Data / CRM / Assets)
- [x] Tabel kolom existing dari information_schema (dengan RPC fallback)
- [x] Form: Field Label, Field Key (auto snake_case), Data Type dropdown, Default Value
- [x] SQL preview sebelum submit
- [x] Call Edge Function manage-schema dengan Bearer session token
- [x] Guard: hidden kalau role bukan 'super' atau 'super_admin'
- [x] Wire ke App.jsx: lazy import, menu entry Foundation > Master Data, render block
- [x] Catch-all exclusion untuk 'schema-manager' menu ID

## 2026-06-05 — Rebrand MSI Brand Guideline v1.0
- [x] Audit: scan semua file warna (#2F6B3F, #1a3a2a, Plus Jakarta Sans) — 27 files teridentifikasi
- [x] Navy #144682 replace dark green #1a3a2a di print area QuotationDetailPage
- [x] Navy gradient replace sidebar dark green #0F2A23/#173D34 di App.jsx
- [x] Orange #E85A1E replace accent green #2F6B3F di semua 19 module files (42 occurrences)
- [x] accentSoft #FEF2EC replace #E7EFE2 (60 occurrences)
- [x] Font: Montserrat (heading) + Inter (body) via Google Fonts — index.html + index.css + App.jsx
- [x] Active icon color updated #C8EFD9 → #FFB899 (orange tint on navy sidebar)
- [x] CLAUDE.md updated dengan Brand System token table
