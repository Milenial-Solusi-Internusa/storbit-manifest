# Nexus MSI — Development Progress Log

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
