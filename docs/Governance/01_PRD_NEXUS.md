# PRD — Nexus by MSI

> Product Requirements Document. Sumber: `AGENTS.md` (arah produk), `CLAUDE.md`, `docs/09_ROADMAP.md`. Untuk status implementasi detail lihat ROADMAP; untuk struktur data lihat `docs/03_DATA_MODEL.md`.

---

## 1. Vision & Objective

**Nexus by MSI** = **Unified Business Core Platform** — platform internal tunggal untuk MSI Group, menggantikan prototipe Storbit Manifest (localStorage) menjadi ERP Core end-to-end.

**Masalah yang diselesaikan:**
- 3 entitas (MSI/JCI/SOA) sebelumnya tercerai-berai (spreadsheet/app terpisah) → tidak ada master data tunggal, tidak ada konsolidasi grup.
- Tidak ada audit trail, approval terstruktur, atau role-permission granular.
- Proses bisnis (CRM → quotation → sales order → operasi → finance) tidak terhubung.

**Objective:** master data tunggal multi-entity, proses bisnis end-to-end ter-mapping, approval-driven, audit-able, secure-by-default, reporting-ready, dengan migrasi inkremental dari Storbit.

**Target user:** karyawan internal MSI Group lintas departemen (Sales/BD, Operations/Logistics, Finance, HRGA, Procurement, IT, Management/BOD). Bukan publik (portal/API publik = arah jangka panjang).

---

## 2. Entitas & Scope

| Entity | Nama | Fokus bisnis | Scope di Nexus |
|--------|------|--------------|----------------|
| **MSI** | PT Milenial Solusi Internusa | Freight Forwarding | CRM, Quotation, Sales Order (SP), Logistics, Asset, HRGA, Master Data |
| **JCI** | PT Jago Custom Indonesia | PPJK / Customs Clearance | Customs workflow, CRM, Master Data (HR/IT/Finance dihandle MSI sbg holding) |
| **SOA** | PT Stuja Orbit Abadi | General Trading (eks SBI/Storbit) | Trading, Inventory/Warehouse, SP/AR, CRM, Master Data |

Platform **multi-company by design**: setiap tabel business scoped `company_id`/`owner_company_id`; konsolidasi grup hanya untuk role yang diizinkan (super_admin lintas-entitas). Tiap entitas bisa punya proses berbeda tapi tetap terhubung di level grup.

UUID entitas: lihat `docs/03_DATA_MODEL.md §2`.

---

## 3. Modul & Fitur

| Modul | Deskripsi | Fitur utama | Status | Target user |
|-------|-----------|-------------|--------|-------------|
| **Foundation / Master Data** | Data inti organisasi & konfigurasi | Companies, Branches, Departments, Positions, Roles, Users (User Access), Products, Document Types, Payment Terms, Taxes, Status Catalog, Currencies, Org Structure (org chart), Admin Settings (entity/document/finance/approval/notifications), Schema Manager, My Profile | ✅ Live | Admin, IT, super_admin |
| **CRM & Inquiry** | Sales pipeline → quotation | Pipeline/Kanban, Prospect + BANT scorecard, Win/Loss capture, Inquiry, Quotation (SLA, pricing authority, discount, multi-currency, VAT per service, PDF vektor), Master Customer (list+detail+health), Lead Pool, Activities (call/visit/meeting/email/WA/followup) + Activity Log feed, CRM Dashboard (per-role) | ✅ Live | Sales/BD, Manager, GM, CEO |
| **Logistics (Storbit SP/AR)** | Sales Order / Surat Pesanan | SP list + detail (INV/FP/SUB/KRM finance stages), BTB, edit/delete item, AR/TTF | ✅ Live | Operations, Sales, Finance |
| **Inventory / Warehouse** | Stok & penerimaan barang | Stok Barang (stock_summary), Penerimaan Barang (→ stock_ledger), Inventory Dashboard | ✅ Live | Operations, Procurement |
| **Asset Management** | IT equipment + kendaraan + furniture + properti | List + detail per kategori, Dashboard, Add Asset wizard, inline-edit IT; Documents/Work Orders/Routes belum ada | ✅ Live (parsial) | Procurement, IT, GA |
| **HRGA Request** | Service request HRGA | ATK form + line items, My Requests, Semua Request, Detail modal, approval matrix; Offboarding (planned) | ✅ Live (staging verified) | HRGA, semua karyawan (requester) |
| **Service Management** | IT Service + Asset (grup) | Asset Management (pindah ke grup ini); IT Service Management (ticketing) | 🔄 / 📋 | IT, GA |
| **Finance** | Akuntansi & transaksi keuangan | COA, Cost Centers, Currencies, Exchange Rates, Taxes (tabel ada); Finance Defaults (Admin Settings) ✅; Billing/Invoice/AR-Collection/AP/Cash-Bank/Accounting belum | 🔄 / 📋 | Finance, Finance Controller |
| **Approval Center** | Engine approval reusable | Tabel approval_rules/workflows/steps/logs/delegations + UI Admin Settings; engine runtime belum | 🔄 | Manager ke atas |
| **Procurement / PO / Vendor** | Pengadaan | Tabel `vendors` ada; modul belum dibangun | 📋 | Procurement |
| **App Launcher** | Bento grid modul + gating | Card per modul, permission-gated, restricted modal | ✅ Live | semua |

Detail status sub-fitur: `docs/09_ROADMAP.md`.

---

## 4. Non-Functional Requirements

- **Performance:** server-side pagination + search untuk list besar; debounce search (min 300ms); `.limit(1000)` wajib (default PostgREST 10); select kolom eksplisit; lazy-load modul (`React.lazy`); aggregate/materialized view untuk dashboard berat; tidak render ribuan row sekaligus.
- **Security:** Supabase Auth; RLS company- + role-scoped wajib tiap tabel business; MFA untuk admin/BOD/Finance Controller/Head ([TODO: status implementasi MFA — security baseline mewajibkan, verifikasi]); audit 19 event wajib ([TODO: belum diimplementasi — lihat TECH_DEBT TD-05]); soft-delete default; private bucket + signed URL untuk attachment; tidak ada service-role key di frontend.
- **Availability / Deploy:** Vercel auto-deploy dari `main` → production `nexus.msigroup.co.id`. Dev/staging/prod terpisah ([TODO: konfirmasi setup staging environment]).
- **Browser support:** modern evergreen (Chrome/Edge/Firefox/Safari terbaru). Responsive desktop + mobile (breakpoint `lg = 1024px`).
- **Observability:** error monitoring (Sentry) = direncanakan, belum terpasang (TECH_DEBT TD-08).

---

## 5. Out of Scope (saat ini)

- **Public API / tracking publik / customer & vendor portal** — arah jangka panjang, belum dibangun.
- **Procurement/PO, Job Costing, Billing/Invoice, AR Collection, AP, Cash/Bank, full Accounting** — planned, belum.
- **IT Service Management (ticketing)** — planned.
- **Reporting & Dashboard lintas-modul / consolidated group reporting** — sebagian (CRM/Inventory/Asset dashboard ada), konsolidasi grup penuh belum.
- **Approval engine runtime** (eksekusi workflow) — UI + tabel ada, engine belum.
- **MFA enforcement, audit logging runtime, performance/cache layer** — direncanakan.
- **Mobile native app** — hanya web responsive.
