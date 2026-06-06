# Nexus MSI — Development Progress Log

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
