# ROADMAP — Nexus by MSI

> Status fitur & modul. Sumber: `CLAUDE.md` (roadmap fase 2.0A–2.10F) + `PROGRESS.md` + `AGENTS.md` (arah produk). Detail per-fase granular ada di **git history `CLAUDE.md`** + `PROGRESS.md`.
>
> **Legenda:** ✅ Done · 🔄 In Progress · 📋 Planned · ⏸ Deferred

---

## Status Modul

| Modul | Sub-fitur | Status | Notes |
|-------|-----------|--------|-------|
| **Auth & Access** | Supabase Auth + RLS | ✅ | Company- + role-scoped |
| | RBAC (modules→menus→actions, `user_menu_permissions`) | ✅ | `hasPermission` + `hasMenuPermission`; RLS belum sinkron (TD-01) |
| | User Access (list, edit page, avatar upload, permission matrix) | ✅ | EF delete-user/reset-password dibuat, **deploy pending** (TD-21) |
| | Auth lifecycle hardening (logout cleanup, restored-menu guard, content gate, tab-switch state) | ✅ | Fase 2.3D–F, 2.8B |
| | **Notification bell** (badge, dropdown, mark-as-read) | ✅ | 4 producers: activity assign/done, HRGA submit/approve; TDZ-safe (2.10K); **belum tes manual runtime** |
| | **Pending Approval badge** (HRGA pending count) | ✅ | auto-refresh 60s, navigasi ke inbox HRGA (2.10J); **belum tes manual runtime** |
| | `profiles.role` deprecation | 🔄 | Tahap 1–3 selesai; drop kolom = tahap 4 pending (TD-20) |
| **Foundation / Master Data** | Companies, Branches, Departments, Roles, Products, Document Types, Payment Terms, Taxes, Status Catalog | ✅ | CRUD live |
| | Positions (compact group-by-code + checkbox entitas) | ✅ | 2.9T |
| | Struktur Organisasi (Org Chart, `reports_to`, warna per-level) | ✅ | 2.9S/U/V |
| | Schema Manager | ✅ | via EF `manage-schema` |
| | Admin Settings (Entity profile/bank/signatories, Document numbering/templates, Finance defaults, Approval workflows, Notifications) | ✅ | UI + Supabase wired (2.6A–F) |
| | My Profile (overlay, avatar, password, prefs) | ✅ | 2.8A |
| **CRM & Inquiry** | Pipeline / Kanban (drag-stage, soft-gate, toolbar: member/sort/filter/list-view) | ✅ | 2.9X–Z; `estimated_value` |
| | Prospect form + BANT scorecard + Win/Loss capture | ✅ | auto-assign sales, dup-check |
| | Inquiry (list + form + detail) | ✅ | |
| | Quotation (builder, SLA BD-05, pricing authority BD-06, discount, currency dropdown, VAT rate per service, PDF) | ✅ | PDF = `@react-pdf/renderer` (2.10A–C); **currency EUR/SGD/JPY/MYR + VAT rate dropdown + kurs per-baris** ✅ (2.10C/H/I) |
| | CRM Dashboard (KPI, charts, calendar, per-role, activity report) | ✅ | bg putih 2.10E |
| | **CRM Report page** (KPI, trend chart, per-sales breakdown, activity detail) | ✅ | Supabase real data + sidebar menu Report (2.10L–M); **belum tes manual runtime** |
| | Master Customer (list + detail page + health score) | ✅ | per-entitas + Free Agent (2.1C–G) |
| | Lead Pool | ✅ | 2.4A |
| | Activities (unified call/visit/meeting/email/followup/wa) + Activity Log feed | ✅ | gantikan sales_calls/visits (2.9D–N) |
| **Logistics (Storbit SP/AR)** | Sales Order / SP (list + detail, INV/FP/SUB/KRM, BTB, edit/delete item) | ✅ | 2.0C/I; baca customer dari `accounts` |
| | AR / TTF | ✅ | db.js (legacy Storbit) |
| **Inventory / Warehouse** | Stok Barang, Penerimaan Barang (→ stock_ledger), Inventory Dashboard | ✅ | 2.0D/E, 2.8N |
| | Master Item / Kategori | ⏸ | redirect ke Stok Barang |
| **Asset Management** | IT/Kendaraan/Furniture/Properti (list + detail), Dashboard, Add Asset wizard, inline-edit IT | ✅ | dalam grup Service Management (2.7A); save wizard masih dummy |
| | Documents / Work Orders / Routes | 📋 | tabel belum ada (TD-26) |
| **HRGA Request** | Request (ATK form, My/All Requests, Detail, approval matrix) | ✅ | staging verified (2.0A) |
| | Offboarding | 📋 | tabel ada, UI belum |
| **Service Management** | IT Service Management (ticketing) | 📋 | |
| **Finance** | COA, Cost Centers, Currencies, Exchange Rates, Taxes | 🔄 | tabel ada; UI Finance defaults (Admin Settings) ✅, modul transaksi belum |
| | Billing/Invoice, AR Collection, AP, Cash/Bank, Accounting | 📋 | |
| **Procurement** | PR, PO, Vendor Mgmt | 📋 | tabel `vendors` ada |
| **Approval Center** | Reusable approval engine | 🔄 | tabel + Admin Settings UI ada; engine runtime belum |
| **Document Mgmt / API / Portal / Reporting / Audit** | — | 📋 | arah jangka panjang (`AGENTS.md`) |
| **App Launcher** | Bento module grid + permission gating | ✅ | 2.0H |

---

## Selesai Terbaru (23 Jun 2026)

**Fitur:**
- ✅ **CRM Report page** — KPI, trend chart, per-sales breakdown, Supabase real data, sidebar menu Report.
- ✅ **Notification bell** — badge, dropdown, mark-as-read, 4 producers (activity assign/done, HRGA submit/approve).
- ✅ **Pending Approval badge** — HRGA pending count, auto-refresh 60s.
- ✅ **Quotation** — currency EUR/SGD/JPY/MYR + VAT rate dropdown + kurs per-baris.

**Tech debt fixes (detail: `08_TECH_DEBT.md`):**
- ✅ `console.*` leak — `AuthContext` 6 dihapus, `ProductsPage` sudah bersih (TD-32; sisa ~65 OPEN).
- ✅ RLS oversight read — 3 policy +`is_manager_or_above` + `is_manager_or_above()` +STABLE (TD-01 PARTIAL).
- ✅ DELETE policy — 4 tabel transaksional: `notifications`, `hrga_request_items`, `hrga_offboarding_items`, `sp_btbs` (TD-03 PARTIAL).

> ⚠️ Beberapa fitur di atas berstatus **"build clean, belum tes manual runtime"** — verifikasi sebelum dianggap final. Perubahan RLS/DELETE: refresh `schema_snapshot.sql` via `pg_dump` bila sudah live di DB.

---

## Milestone Terakhir (terbesar)

1. **Unifikasi `accounts`** — `prospects` + `customers` digabung jadi master customer tunggal (2.2A–C, 2.5A); WON→customer via trigger DB.
2. **Modul Activity terpadu** — `activities`/`activity_logs` gantikan `sales_calls`/`sales_visits`/`sales_visit_logs`; unified Activity Log feed (5 sumber) (2.9B–N).
3. **Overhaul Quotation** — SLA indicator, pricing authority matrix, discount, currency dropdown DB, VAT rate per service_type, dan **PDF rewrite ke `@react-pdf/renderer`** (vector/text) (2.1A, 2.10A–C).
4. **Suite Admin Settings** — Entity/Document/Finance/Approval/Notifications (port desain Lovable + Supabase) (2.6A–F).
5. **Struktur Organisasi (Org Chart)** dari `profiles.reports_to`, warna per-level (2.9S–V).
6. **RBAC menu-permission** — `modules→menus→actions→user_menu_permissions`, gating sidebar + launcher (2.0F+…).
7. **Auth lifecycle hardening** — logout cleanup, restored-menu guard, content-gate, fix tab-switch kehilangan state (2.3D–F, 2.8B).
8. **Deprecate `profiles.role`** — tahap DB functions → Edge Functions → frontend (2.3G–H).
9. **Mobile responsive** — util grid opt-in + nav drawer + kalender/feed reflow (2.8S–Y).
10. **Master Customer page** (list + detail + health score, per-entitas) (2.1C–G).

---

## Next Up

Berdasarkan `CLAUDE.md` "Next recommended step" + Status Nggantung:

1. **Runtime-verify staging** migrasi `accounts` (Pipeline/Prospect/Dashboard/Inquiry/Calls/Quotation/Master Customer) + cutover Activity (call/visit/log, dropdown sales) — banyak fitur "build clean, belum tes manual".
2. **Deploy Edge Functions** `delete-user`, `reset-password`, re-deploy `manage-schema`/`create-user` (TD-21/22).
3. **Drop tabel/kolom dormant** setelah verifikasi: `sales_calls`/`sales_visits`/`sales_visit_logs` (TD-18), `customers` (TD-19), `profiles.role` (TD-20).
4. **Migrasi RLS RBAC-driven** (sesi fresh, prasyarat HRIS) (TD-01) + audit CRUD/DELETE policy semua tabel (TD-03).
5. **Audit logging** `audit_logs` + `logAudit()` (TD-05).
6. **Modul Finance** transaksi (Billing/AR) — arah berikutnya setelah foundation matang.
7. [TODO: konfirmasi prioritas bisnis berikutnya dengan product owner].
