# ROADMAP — Nexus by MSI

> Status fitur & modul. Sumber: `CLAUDE.md` (roadmap fase 2.0A–2.10F) + `PROGRESS.md` + `AGENTS.md` (arah produk). Detail per-fase granular ada di **git history `CLAUDE.md`** + `PROGRESS.md`.
>
> **Legenda:** ✅ Done · 🔄 In Progress · 📋 Planned · ⏸ Deferred
>
> **Diperbarui 2026-07-17 — Quotation: TABEL KURS manual per-quotation** (kolom baru `quotations.exchange_rates` jsonb + RPC `save_quotation` memetakannya — **DB sudah LIVE**, 2 file FE; **tes runtime OK**; migrasi direkam (`20260717000000`+`20260717000001`) + snapshot ter-refresh → **TD-74 (a)+(b) beres**, sisa **(c)** tabrakan nama + **(d)** `usd_rate` = keputusan desain). ⚠️ Arah *"dropdown currency header tunggal jadi penggerak baris"* yang sempat dicatat di sini **DIBATALKAN & dibongkar** — lihat baris Quotation di Status Modul + `PROGRESS.md` 2026-07-17. Sebelumnya 2026-07-10 — Modul PRF (Procurement) Fase 1+2 LIVE (form Section 01/02/03/04 + child fields dinamis + menu + nomor auto); FASE 0-3 SP done (mesin status LIVE s/d BTB_TERBIT), FASE 4-5 + tech debt next. Fakta: `03_DATA_MODEL`/`05_WORKFLOW_MAP`/`08_TECH_DEBT`.
>
> ℹ️ **Audit sumber 13-18** (`13_CRM_FLOW_AUDIT`, `14_BACKLOG_RECON`, `15_INPUT_CONTROL_AUDIT`, `16_SP_TABLES_SYNC_AUDIT`, `17_ZERO_INPUT_AUDIT`, `18_CRM_SALES_PRF_PENDING_AUDIT`) **kini diarsipkan di `docs/archive/audits/`**. Tag `(dari NN_…)` di bawah = atribusi historis (bukan tautan hidup).

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
| | **Admin Settings — Security Policy, Audit Log, General Preferences, Integrations** | ✅ | port Lovable (2.11A); General/Security/Integrations = localStorage fallback (TD-36), Audit Log = fetch real **`audit_logs`** (`AuditLogPage.jsx:103`) — sejak 2.11J (`7e40149`, 24 Jun); **TD-37 DONE** (klaim login-only usang). Sisa opsional: diff viewer `old_data`/`new_data`; **belum tes manual runtime** |
| | **AdminKit (`kit.jsx`) extended** | ✅ | +13 ikon lucide + primitive `KitSelect` (2.11A); satu sumber design-system Admin Settings |
| | **Dropdown Management** (master dropdown/option values) | ✅ | full DB-driven via `dropdown_options` (CRUD persist) + `currencies`/`payment_terms` (toggle-only); Tab 2 di General Preferences (2.11C–E); **belum tes manual runtime** |
| | My Profile (overlay, avatar, password, prefs) | ✅ | 2.8A |
| **CRM & Inquiry** | Pipeline / Kanban (drag-stage, soft-gate, toolbar: member/sort/filter/list-view) | ✅ | 2.9X–Z; `estimated_value` |
| | Prospect form + BANT scorecard + Win/Loss capture | ✅ | auto-assign sales, dup-check |
| | Inquiry (list + form + detail) | ✅ | |
| | Quotation (builder, SLA BD-05, pricing authority BD-06, discount, currency dropdown, VAT rate per service, PDF) | ✅ | PDF = `@react-pdf/renderer` (2.10A–C); **currency EUR/SGD/JPY/MYR + VAT rate dropdown** ✅ (2.10C/H/I). **"currency dropdown" di baris ini = dropdown per-baris** (`quotation_items.currency`) — **currency tetap per-baris (multi-currency)**; ⚠️ tak ada dropdown currency di header (percobaan 17 Jul **dibatalkan**, `quotations.currency_code` tetap PASIF). ⚠️ **"pricing authority BD-06" di baris ini = UI SAJA** (badge otoritas diskon + tampilan margin) — **enforcement NOL** (terverifikasi 17 Jul): `validate()` (`QuotationFormPage.jsx:784-788`) HANYA cek `header.inquiry_id`; `handleSave` (`:799`) = `if (!validate()) return false;` titik. `pricingAuthority()` (`:41`) dipanggil sekali di `:1118` → cuma merender badge warna; `marginPct` (`:780`) cuma dirender (`:1290`); `margin_floor` cuma passthrough payload (`:869`) — **tanpa field input, tak pernah dibandingkan**. Artinya user bisa **submit diskon 90% / margin negatif**: badge merah "perlu approval CEO" muncul tapi **simpan tetap jalan**, dan **tak ada record approval ditulis ke mana pun**. Lihat **TD-38** (HIGH) + task **H3** (`10_TASK_BREAKDOWN.md`). Sumber: audit 17 Jul (`18_CRM_SALES_PRF_PENDING_AUDIT.md` GAP #3 / C-03) |
| | **Tabel kurs per-quotation** (`quotations.exchange_rates` jsonb) | ✅ | 17 Jul: header punya tabel kurs manual; **kurs baris jadi read-only turunan** + write-through ⇒ Detail/PDF nol perubahan; seed quotation lama (beda kurs antar-baris → warning eksplisit); blokir **SUBMIT saja** bila kurs kurang (Draft boleh). **DB LIVE** (ALTER + RPC, manual) + **migrasi direkam** (`20260717000000`+`20260717000001`) + **snapshot ter-refresh**; **tes runtime OK**. Sisa **TD-74 (c)** tabrakan nama & **(d)** `usd_rate` = keputusan desain, bukan fitur kurang. Kurs **manual per-quotation, tanpa lookup FX** → **B6** `14_BACKLOG_RECON` tetap **SEBAGIAN** (jangan diklaim tutup) |
| | CRM Dashboard (KPI, charts, calendar, per-role, activity report) | ✅ | bg putih 2.10E |
| | **CRM Report page** (KPI, trend chart, per-sales breakdown, activity detail) | ✅ | Supabase real data + sidebar menu Report (2.10L–M); **belum tes manual runtime** |
| | Master Customer (list + detail page + health score) | ✅ | per-entitas + Free Agent (2.1C–G) |
| | Lead Pool | ✅ | 2.4A |
| | Activities (unified call/visit/meeting/email/followup/wa) + Activity Log feed | ✅ | gantikan sales_calls/visits (2.9D–N) |
| **Logistics (Storbit SP)** | **Mesin status SP 12 tahap** (FASE 0-3): skema baru `sp_orders`/`sp_order_items`/`sp_btb`/`dc_master` + `sp_recompute_status` (fact-derived) | ✅ | **LIVE s/d BTB_TERBIT**; INVOICED/SUBMITTED/LUNAS = FASE 4-5 📋. Detail: `03_DATA_MODEL`/`05_WORKFLOW_MAP` |
| | Input SP single-door + penomoran manual + DC wajib + identitas komposit `(customer_id,sp_no)` + dual-write | ✅ | InputSPPage (FASE 0) |
| | Picking → Surat Jalan → Dispatch (isi `shipped_qty`) → BTB (`sp_issue_btb`, Detail SP) | ✅ | FASE 1-3; picking/delivery RPC |
| | Harga kategori produk (semester/tahunan/project) | ✅ | FASE 0 (`set_product_category_prices`) |
| | Sales Order legacy — flag finance per item INV/FP/SUB/KRM | ⏸ | flag lama, **bukan** sumber status (lihat `05` §USANG) |
| | AR / TTF (`ar_ttfs`/`ar_btbs`) | ✅ | db.js (legacy Storbit, domain finance terpisah) |
| **Inventory / Warehouse** | Stok Barang, Penerimaan Barang (→ stock_ledger), Inventory Dashboard | ✅ | 2.0D/E, 2.8N |
| | Master Item / Kategori | ⏸ | redirect ke Stok Barang |
| **Asset Management** | IT/Kendaraan/Furniture/Properti (list + detail), Dashboard, Add Asset wizard, inline-edit IT | ✅ | dalam grup Service Management (2.7A); save wizard masih dummy |
| | Documents / Work Orders / Routes | 📋 | tabel belum ada (TD-26) |
| **HRGA Request** | Request (ATK form, My/All Requests, Detail, approval matrix) | ✅ | staging verified (2.0A) |
| | Offboarding | 📋 | tabel ada, UI belum |
| **Service Management** | IT Service Management (ticketing) | 📋 | |
| **Finance** | COA, Cost Centers, Currencies, Exchange Rates, Taxes | 🔄 | tabel ada; UI Finance defaults (Admin Settings) ✅, modul transaksi belum |
| | Billing/Invoice, AR Collection, AP, Cash/Bank, Accounting | 📋 | |
| **Procurement** | **PRF (Price Request Form)** — form + child fields dinamis + menu + nomor auto (Fase 1+2) | ✅ | tabel `prf` (FASE 0) + `PRFFormPage` (Section 01/02/03/04); sales/gm_bd bikin, procurement lihat. **Fase 2 (child fields Sea/Air/Inland/Custom/Project + add-on 11 opsi) done.** List/inbox (Fase 3a) + cross-entity (Fase 3b) belum. **Belum tes manual runtime.** |
| | PR, PO, Vendor Mgmt | 📋 | tabel `vendors` ada |
| **Approval Center** | Reusable approval engine | 🔄 | tabel + Admin Settings UI ada; engine runtime belum |
| **Document Mgmt / API / Portal / Reporting / Audit** | — | 📋 | arah jangka panjang (`AGENTS.md`) |
| **App Launcher** | Bento module grid + permission gating | ✅ | 2.0H |

---

## Selesai Terbaru (10 Jul 2026 — Modul PRF Fase 1+2)

**Procurement greenfield — PRF (Price Request Form):**
- ✅ **Fase 0 (DB, live)** — tabel `prf` (52 kolom, child fields Sea/Air/Inland/Custom/Project sebagai kolom nullable) + trigger `set_prf_updated_at` + 4 RLS policy single-entity. Rekaman: `20260710000001_prf_fase0.sql`.
- ✅ **Fix RLS super_admin (DB, live)** — 4 policy `prf` di-DROP + CREATE ulang, tiap kondisi dibungkus `is_super_admin() OR (…)` (Fase 0 keliru tanpa cabang ini → super_admin ditolak saat INSERT). super_admin kini bypass company scope (LIHAT PRF lintas-3-entitas, standar). BEDA dari cross-entity inbox procurement (Fase 3b, masih ditunda). Rekaman: `20260710000003_prf_rls_super_admin.sql`.
- ✅ **Fase 1 (KODE)** — `PRFFormPage.jsx` (Section 01 Informasi Dasar + 02 Inquiry Details; conditional logic incoterm/DG/domestic; sumber inquiry auto-isi account) + menu `prf` di ERP_MENU_GROUPS/NEXUS_NAV (role[]) + render block + nomor auto `PRF/{ENTITAS}/{TAHUN}/{ROMAWI}/{URUT}`.
- ✅ **Fase 2 (KODE, same file)** — Section 03 "Detail Layanan" child fields dinamis per `service_type` (Sea FCL/LCL + container qty jsonb, Air, Inland 25 armada, Custom PIB/PEB auto, Project); Notes digeser → Section 04; koreksi daftar add-on 6→11 opsi. Ganti `service_type` reset semua child; payload null-out per visibilitas. **Tanpa ubah DB** (kolom sudah ada Fase 0).
- 📋 **Belum:** list/inbox procurement (Fase 3a), cross-entity inbox (Fase 3b). **⚠️ FLAG UX:** Custom butuh 2 syarat (service=custom DAN add-on Custom Clearance) — perlu konfirmasi user testing.

> ⚠️ **Belum tes manual runtime** (perlu login sales/gm_bd). Hanya sales/gm_bd bisa Submit/Draft (RLS). ⚠️ Kolom `inquiry_id` ditambah Den manual — direkam di `supabase/migrations/20260710000002_prf_add_inquiry_id.sql`. `schema_snapshot.sql` STALE. Detail: `PROGRESS.md` 2026-07-10 + `AUDIT_PROCUREMENT.md`.

---

## Selesai Terbaru (FASE 0-3 — Storbit SP mesin status, ~Jul 2026)

Detail granular: `PROGRESS.md` (2026-07-06…08) + `CLAUDE.md` Recent. Skema/alur: `03_DATA_MODEL`/`05_WORKFLOW_MAP`. Semua SQL dijalankan manual (rekaman `supabase/migrations/20260706*…20260708000002`).

- ✅ **FASE 0 — fondasi skema DB:** tabel baru `sp_orders` (header, identitas komposit `(customer_id,sp_no)`, status 12-tahap, `had_cancelled_picking`), `sp_order_items` (kanonik), `sp_btb` (BTB benar), `dc_master`; harga kategori produk `price_semester/tahunan/project`; RLS + backfill (lama=baru). Dual-write InputSPPage.
- ✅ **FASE 1 — mesin status bawah:** `sp_recompute_status` (fact-derived) + tahap DRAFT→CONFIRMED→MENUNGGU_STOK→PICKING→PACKED; RPC picking (generate/complete/cancel) + fix desync.
- ✅ **FASE 2 — jembatan pengiriman:** dispatch/cancel isi `sp_items.shipped_qty`; tahap DIKIRIM/SAMPAI/TERKIRIM_PENUH; `mark_delivery_delivered`. Reader status list pindah ke `sp_orders.status` (2E).
- ✅ **FASE 3 — BTB_TERBIT:** RPC `sp_issue_btb`/`sp_delete_btb` → tabel `sp_btb`; **BTB_TERBIT = rank tertinggi** (mengalahkan TERKIRIM_PENUH — "puncak sebelum invoice"); kartu BTB pindah ke Detail SP; migrasi `sp_btbs`→`sp_btb` (186→205).

> ⚠️ Sebagian "terverifikasi user" (FASE 2C, 3 Step E/G); sisanya "build clean, belum tes runtime penuh". Debt FASE 0-3: `08_TECH_DEBT.md` (TD-38…TD-44).

---

## Selesai Terbaru (24 Jun 2026 — malam, 2.11E)

**Dropdown DB-driven (master data → konsumen form):**
- ✅ **`dropdown_options` table + seed (12 list)** — service_type, unit_label, lead_source, lost_reason, activity_type, customer_type, customer_tier, shipment_mode, container_type, incoterm, leave_type, allowance_type (global; RLS SELECT semua authenticated, write super_admin-only).
- ✅ **Dropdown Management full DB-driven** — CRUD persist ke DB (`dropdown_options` INSERT/UPDATE/soft-DELETE/toggle/reorder); `currencies`+`payment_terms` merge ke Finance (toggle-only, tak ada `sort_order`). Toast sukses + error asli.
- ✅ **`useDropdownOptions` hook** (`src/hooks/useDropdownOptions.js`) — fetch 1 `list_key`, fallback array bila error/empty.
- ✅ **QuotationForm** — `service_type` + `unit_label` via hook (unit pakai label sbg value utk preserve data lama), VAT via fetch `taxes` (rate→label, union dgn fallback agar 0/1,1%/11% selalu ada).
- ✅ **InquiryForm** — `service_type` via hook.
- ✅ **`taxes` dirapiin** — 6 baris duplikat soft-deleted (PPN11/VAT_0 × 3 entitas; sisa VAT_FULL 0.11 + TAXFREE 0). *(dijalankan di SQL Editor, bukan dari repo)*

> ⚠️ 2.11E **build clean, belum tes manual runtime**. Semua const lama dipertahankan sbg `*_FALLBACK`. Writes super_admin-only (RLS) → role lain dapat toast error asli.

---

## Selesai Terbaru (24 Jun 2026)

**Fitur — Admin Settings (port Lovable, 2.11A):**
- ✅ **Security Policy** — password policy, sesi, login protection, 2FA per-role (localStorage fallback `security_policy_*`).
- ✅ **Audit Log** — fetch real `user_login_logs` + join `profiles`; filter/pagination/CSV export (login events only sampai `audit_logs` jadi — TD-37). ⚠️ **Kondisi 2.11A ini kini sudah TIDAK berlaku** — sumbernya diganti ke `audit_logs` di **hari yang sama** oleh 2.11J (`7e40149`); **TD-37 ditutup DONE 17 Jul 2026**.
- ✅ **General Preferences** — lokalisasi/format/tampilan per entitas (localStorage `general_prefs_*`; EntitySwitcher default dari `useAuth`).
- ✅ **Integrations** — WhatsApp/SMTP/n8n webhook/API keys (localStorage `integrations_*`; ⚠️ credentials belum secure — TD-36).
- ✅ **`kit.jsx` extended** — +13 ikon lucide + `KitSelect` (reuse kit existing, tanpa `adminKit.js` baru).

> ⚠️ Semua page 2.11A **"build clean, belum tes manual runtime"**. TD baru: **TD-36** (credentials localStorage — **tetap OPEN**), **TD-37** (AuditLog login-only — **kini DONE**, ditutup 17 Jul; klaim login-only usang sejak 2.11J).

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

## Branch Aktif (belum merge)

> Branch kerja yang belum masuk `main` — dicatat agar tidak "hilang" dari governance. **Kosong per 17 Jul 2026: tak ada branch kerja yang menggantung — semua sudah merge ke `main`.** Section dipertahankan sbg placeholder untuk pencatatan branch mendatang.

- **`feat/detail-sp-reskin`** (UI-only, 1 file: `src/modules/logistics/SalesOrderDetailPage.jsx`) — re-skin halaman Detail Sales Order dari palet warm/cream → cool/navy brand (navy `#1B4D8A`/orange `#E85A1E`/amber), heading font Space Grotesk (keputusan final — lihat pengecualian di **TD-70**), reposisi header card, + **soft-tone pass** (indigo→slate soft, badge `TERKIRIM_PENUH`/`LUNAS` solid→tint, tombol primer orange solid→soft; tombol DANGER sengaja tetap solid merah). **Status: ✅ SUDAH MERGE ke `main` (`1ff0ffb`)** (koreksi 17 Jul — klaim lama "BELUM merge" **SALAH**); **BELUM tes runtime** (build clean). Detail kronologis: `00_DEV_JOURNEY.md` (Bagian 1, 2026-07-15).

---

## Next Up

Berdasarkan kondisi LIVE (FASE 0-3 selesai) + `08_TECH_DEBT.md`:

**Storbit SP — lanjutan mesin status (bangun entitas baru, bukan wiring):**
1. **FASE 4 — INVOICED** 📋 (belum dibangun): modul invoice baru — tabel invoice + line, penomoran (`increment_document_sequence`), relasi ke SP/BTB (`sp_order_id`/`sp_btb`), UI terbit invoice; gate = SP di TERKIRIM_PENUH/BTB_TERBIT. **Mulai dari AUDIT + DESAIN.**
2. **FASE 5 — LUNAS** 📋 (setelah FASE 4): modul payment baru (pembayaran → status LUNAS).

**Prioritas tech debt (detail: `08_TECH_DEBT.md`):**
3. **Enforce margin floor** (TD-38, HIGH) — quotation harus blok/warn bila margin < `margin_floor` (idealnya server-side di `save_quotation`); matriks diskon kini display-only.
4. **RLS hardening** (TD-39, HIGH) — perketat ~48 policy `USING(true)` (SP/gudang/dll) → company- + role-scoped (superset TD-04) + audit CRUD/DELETE (TD-03) + migrasi RBAC-driven (TD-01).
5. **Drop `sp_btbs` + dead code cleanup** (TD-41) — 4 helper legacy `db.js` (0 caller) + tabel `sp_btbs` (data migrasi) + `AppLauncher.jsx`.
6. Sisanya (TD-40 2D sync · TD-42 rank doc/`DESIGN_SP_SCHEMA` · TD-43 integrasi email/n8n · TD-44 EF docs) → rujuk `08_TECH_DEBT.md`.

**Backlog domain lain (open):**
- **Procurement PRF lanjutan** — Fase 2 (child fields Sea/Air/Inland/Project/Custom di form) **DONE 10 Jul**; sisa: Fase 3a (list/inbox procurement + acknowledge), Fase 3b (cross-entity inbox). Rujukan: `AUDIT_PROCUREMENT.md`.
- **CRM/Quotation gates** — verifikasi enforcement approval diskon/margin (downstream?) + BANT gate (`05_WORKFLOW_MAP.md` — Gate & Approval).
- **RBAC/RLS `accounts`** + dropdown role-scope (TD-01/04/06).
- **Runtime-verify staging** (accounts/Activity cutover) + **deploy Edge Functions** (TD-21/22) + **drop dormant** `sales_calls`/`visits`/`customers`/`profiles.role` (TD-18/19/20).
- **Modul Finance** transaksi umum (Billing/AR-AP) — arah setelah foundation matang. **Audit logging** (TD-05) ✅ done.
- **Inventory — perencanaan alokasi barang ke klien** 📋 (belum ada; `reserved`/`available` di stok = reservasi SP fulfillment, BUKAN perencanaan alokasi). (dari 14_BACKLOG_RECON.md D19)
- **Inventory — stock monitoring: aging & turnover** 📋 (belum ada; Inventory Dashboard punya movement-trend & low-stock, tapi **nol** KPI aging/turnover — terverifikasi `grep aging|turnover` inventory = 0; `stock_ledger` bisa jadi basis data). (dari 14_BACKLOG_RECON.md D20)
- **CRM — upload MOU ke Nexus** 📋 (belum ada; **nol `storage.upload` di CRM**, `deal_handovers.msa_status` hanya text; butuh desain Supabase Storage + kolom/tabel MOU). Ini juga rumah untuk item `18` C-13. (dari 14_BACKLOG_RECON.md C16)
- **CRM — Aktivitas tarik status MOU/TOP** 📋 (belum ada; bergantung MOU di atas; data TOP sudah ada di `top_requests`). (dari 14_BACKLOG_RECON.md C17)

**Near-term:** dashboard Indomarco — halaman `IndomarcoDashboardPage` sudah **LIVE**; polish/iterasi sesuai kebutuhan presentasi.

7. [TODO: konfirmasi prioritas bisnis berikutnya dengan product owner].

---

## Keputusan Terbuka (perlu keputusan Den)

> Peta keputusan produk terpusat — hal yang **belum diputuskan** (bukan fakta/selesai). Dari rekonsiliasi backlog. Section ini akan diperluas di sub-fase berikutnya (append-friendly).

1. **Dashboard boleh dibagi ke customer eksternal?** — `IndomarcoDashboardPage` sekarang ditandai INTERNAL (framing customer-facing tapi halaman internal). **Perlu keputusan Den:** boleh dibagikan ke customer eksternal? tujuan & batasannya? (dari 14_BACKLOG_RECON.md A1)
2. **Intake SP dari Indomarco — automasi email vs API.** — Email SP kadang tak diterima MSI. **Perlu keputusan Den:** solusi di sisi MSI (automasi email konfirmasi) atau integrasi API ke Indomarco? (butuh keputusan + desain integrasi; kerabat TD-43 verifikasi email). (dari 14_BACKLOG_RECON.md A2)
3. **Kontrak 20 DC vs aktual 44 DC — akun Nexus per DC?** — `dc_master` sudah memuat 45 DC (36 Indomarco ter-mapping) sebagai DATA, bukan keputusan. **Perlu keputusan Den:** buat akun/penomoran Nexus per DC atau tidak? (dari 14_BACKLOG_RECON.md A3)
4. **Hilangkan approval Lead Pool — cukup justifikasi wajib?** — Sekarang: pull Lead Pool butuh justifikasi ≥20 char + approval manager (`LeadPoolApprovalPage`). **Perlu keputusan Den:** buang tahap approval, cukup remarks/justifikasi WAJIB? (kerabat TD-77 celah RLS `pull_status`). (dari 14_BACKLOG_RECON.md C12)
5. **"Aktifkan modul Shipment untuk mengaktifkan form Handover" (Koh Deny) — maksud ambigu.** — Handover form SUDAH ter-wire ke WON (gate nilai Rp100jt) & `ShipmentPage` sudah ada. **Perlu keputusan Den / klarifikasi:** apa maksud "Shipment mengaktifkan Handover"? relasinya belum terdokumentasi. (dari 14_BACKLOG_RECON.md C14)
6. **Sinyal "lunas" untuk kunci harga/kategori SP (H7 ④).** — Guard beku sudah ada di `sp_recompute_status`, tapi belum ada mekanisme yang MENYETEL status lunas. **Perlu keputusan Den:** sinyal mana jadi acuan — (a) `sp_orders.status='LUNAS'` via FASE 4-5, (b) `ar_ttfs.tgl_pembayaran` (domain AR), atau (c) kolom status pelunasan baru diisi manual? (c bentrok dgn FASE 4-5.) (detail: `10_TASK_BREAKDOWN` H7 ④ · dari 18 S-04④)
7. **Domain nilai `sp_items.price_category` belum baku.** — `sp_order_items.price_category` ber-CHECK ketat (`semester/tahunan/project`); `sp_items.price_category` tanpa CHECK (dipakai `default`/`semester`/`legacy`). **Perlu keputusan Den:** satukan domain (beri CHECK di `sp_items`) atau biarkan longgar? Backfill menunggu ini. (detail: TD-72 · dari 18 S-05)
8. **Quotation ACCEPTED — bikin tombol atau buang trigger.** — Nol penulis `ACCEPTED` di kode → 88% deal WON nilainya kosong; trigger `sync_deal_value_on_quotation_accept` live tapi tak pernah jalan. **Perlu keputusan Den:** tambah aksi "Terima" (SENT→ACCEPTED) atau nyatakan ACCEPTED mati & buang trigger? (detail: TD-54 · dari 18 C-01)
9. **NURTURE = lubang hitam.** — ~~6 akun **bisa di-set** NURTURE dari form~~ **[USANG 22 Jul 2026]** opsi `NURTURE` **sudah DICABUT** dari `PIPELINE_STAGES` (`ProspectFormPage.jsx:31`) → **tak ada baris NURTURE baru**; keenam baris warisan juga **tak lagi bisa tertimpa diam-diam** lewat Edit Deal (penjaga `isKnownStage`). **Yang MASIH terbuka:** keenam baris itu **tak ada di Kanban & tak ada aturan aging** → tetap hilang dari pipeline. **Perlu keputusan Den:** beri kolom Kanban / aturan aging / atau migrasikan ke Lead Pool? *(rencana Fase 3 menurut brief Den = migrasi ke Lead Pool bersama backfill `pipeline_stage`; **belum dijalankan** — konfirmasi sebelum dieksekusi.)* (detail: TD-61 · dari 18 C-02 · `AUDIT_FASE3_20260722.md` H1)
10. **LOST tak punya siklus hidup.** — Hanya 7/997 akun LOST; lead mati menumpuk di stage aktif. **Perlu keputusan Den (butuh desain):** LOST masuk pool atau tempat sendiri? reaktivasi lewat mana? (detail: TD-58 · dari 18 C-10)
11. **`notification_rules` yatim.** — 11 rule aktif, semua MSI, nol pembaca (notif ditulis langsung tanpa lewat rules). **Perlu keputusan Den:** bangun rule engine atau buang tabel? (detail: TD-53 · dari 18 C-15)
12. **Costing / gate margin PRF — dibangun atau manual?** — PRICING_LANE tereduksi jadi form input tanpa costing/approval; harga quotation diketik tangan. **Perlu keputusan Den:** modul costing dibangun, atau proses ini manual di luar sistem? (detail: TD-83 · dari 18 P-04)
13. **Sign-off handover & TOP Request — manual di luar sistem atau belum dibangun?** — Kolom `approved_by_*` + status TOP tak pernah dimajukan; teks "dual sign-off" = copy UI. **Perlu keputusan Den:** approval manual di luar sistem (→ hapus teks menyesatkan) atau bangun alurnya? (detail: TD-78 · dari 18 C-05)
14. **Custom PRF butuh 2 syarat — membingungkan?** — Blok Custom muncul hanya bila `service_type='custom'` DAN add-on Custom Clearance. **Perlu keputusan Den (nunggu user testing):** pertahankan atau sederhanakan? (detail: TD-84 · dari 18 P-06)
15. **Fase 3b — inbox PRF cross-entity.** — Butuh cabang RLS custom role `procurement` lintas-3-entitas; bergantung inbox single-entity dulu. **Perlu keputusan Den + desain RLS:** kapan & bagaimana? (detail: TD-85, TD-76 · dari 18 P-07)
16. **Selisih data import SP belum diklarifikasi.** — "Selisih SP 431 vs 435 (Gigih)" + "mapping 30 item kontrak PKS Indomarco" (di `CLAUDE.md` Current Phase, bertanda PERLU KONFIRMASI). **Perlu keputusan Den / klarifikasi Gigih & Indomarco:** angka dasar SP belum disepakati. (belum ada TD — data clarification · dari 18 S-13)
