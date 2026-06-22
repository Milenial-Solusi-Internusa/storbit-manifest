# TASK BREAKDOWN — Nexus by MSI

> Breakdown task aktif & backlog jadi unit yang bisa langsung dikerjakan Claude Code. Sumber: `docs/09_ROADMAP.md` (Next Up), `docs/08_TECH_DEBT.md`. Update saat task selesai / prioritas berubah.

---

## Active / Next Up

> Dari ROADMAP "Next Up" — dipecah jadi task konkret. Banyak fitur berstatus "build clean, **belum tes manual runtime**".

### A. Runtime verification (staging) — tidak ubah kode, validasi saja
- [ ] **A1.** Verifikasi migrasi `accounts` di staging: Pipeline drag→WON jadi `customer` & muncul di Master Customer; tambah customer → `account_status='customer'` + `owner_company_id`; Dashboard/Inquiry/Quotation/Lead Pool tampil benar per role.
- [ ] **A2.** Verifikasi cutover Activity: log call/visit, mark-done/cancel/edit → muncul di Activity Log feed dengan judul benar (Aktivitas baru/selesai/dibatalkan/diubah); nama user & subtitle benar; tak ada duplikat.
- [ ] **A3.** Verifikasi Quotation: currency dropdown (EUR/SGD/JPY/MYR/USD/IDR), VAT auto per service_type (customs=11%), override tersimpan & reload benar, PDF teks selectable + 9 section + footer tiap halaman + internal data tak muncul, quote lama (vat_rate null) → fallback 1,1%.
- [ ] **A4.** Verifikasi dropdown sales (Activities/Dashboard) se-entitas untuk manager (pasca RLS); Positions compact (Manager 1 baris badge MSI+JCI+SOA, edit pre-checked, reactivate bukan duplicate).

### B. Deploy Edge Functions (TD-21/22)
- [ ] **B1.** `supabase functions deploy delete-user reset-password` + smoke test (hapus user dummy super_admin only; reset password).
- [ ] **B2.** Re-deploy `manage-schema` + `create-user` (pasca pembersihan `profiles.role` 2.3G); pastikan `SUPABASE_ANON_KEY` di env manage-schema.

### C. Drop tabel/kolom dormant (setelah verifikasi)
- [ ] **C1.** Drop `sales_calls`, `sales_visits`, `sales_visit_logs` (TD-18) — setelah A2 lulus. Data sudah dimigrasi.
- [ ] **C2.** Drop tabel `customers` (TD-19) — setelah konfirmasi 0 ref di kode live + approval.
- [ ] **C3.** Drop kolom `profiles.role` + enum `user_role_legacy` (TD-20) — setelah verifikasi semua super_admin ada di `user_roles` + approval.
- [ ] **C4.** Migrasi data `activities.type='prospecting'` → `whatsapp`/`followup` (TD-25). Refresh snapshot tiap drop.

### D. Keamanan / RLS (CRITICAL — sesi fresh)
- [ ] **D1.** Verifikasi `has_permission()` + apakah `permissions`/`role_permissions` ter-seed (TD-02).
- [ ] **D2.** Audit CRUD/DELETE policy SEMUA tabel — sisir UPDATE "admin-only" & DELETE policy hilang (TD-03).
- [ ] **D3.** Migrasi RLS RBAC-driven (4-fase, TD-01) — **prasyarat HRIS, sesi fresh, risiko tinggi**. Perketat `profiles_read` (TD-04) bersamaan modul HRIS.

### E. Foundation reliability
- [ ] **E1.** Implement `audit_logs` + `logAudit()` (19 event wajib; TD-05).
- [ ] **E2.** Setup Vitest + RTL mulai dari util murni (`spCalc`, `bant`, format) (TD-07) — prasyarat pecah App.jsx.
- [ ] **E3.** Pasang Sentry + ErrorBoundary report (TD-08).

---

## Backlog

> Sudah teridentifikasi, belum scheduled. Sumber TECH_DEBT + ROADMAP.

**Maintainability (low-risk, oportunistik):**
- Ekstrak `PASTEL` → `src/lib/tokens.js`, `ENTITY_IDS` → `config/entities.js`, helper `isSuperAdmin()` (TD-14).
- Hapus dead code `*.legacy.jsx` (~1.206 baris) setelah konfirmasi 0 ref (TD-15).
- Ganti 5 hijau terlarang + emoji sisa → token brand + Lucide (TD-17).
- Hapus dead DOM `#quotation-print-area` (TD-16).
- `.single()`→`.maybeSingle()` sisa (TD-10); tambah `.limit()` ke ~97 query (TD-11).
- React warning input read-only (TD-27).

**Refactor besar (SETELAH ada test):**
- Pecah `App.jsx` (~4.667 baris god-file; TD-12) — urutan: konstanta → presentasional → modul Storbit → layout → routing registry. JANGAN big-bang.
- Pecah file >1.000 baris: `CRMDashboardPage` (~1.996), `AssetDetailITPage`, `SalesOrderDetailPage` (TD-13).
- Ekstrak shared: `useRoleScopedQuery`, `DataTablePage`, `Badge`, `Modal`, `lib/format.js`.
- Satukan paradigma styling (inline vs Tailwind).

**Fitur planned (ROADMAP 📋):**
- Modul Finance transaksi (Billing/Invoice, AR Collection, AP, Cash/Bank, Accounting).
- Procurement / PO / Vendor Management.
- Approval engine runtime (eksekusi workflow).
- IT Service Management (ticketing).
- Asset: tabel `asset_documents`/`asset_work_orders`/`asset_routes` + wire tab Maintenance kendaraan; save Add Asset wizard (kini dummy); inline-edit Software & Maintenance (TD-26).
- HRGA Offboarding UI.
- Field Registry Level 1 (custom field JSONB) — nunggu 4 keputusan desain (TD-31).
- CI pipeline (build+lint+test gate; TD-29).
- Total quotation via DB trigger (TD-09).
- Mobile polish per-halaman <1024px (TD-28).

**Data cleanup (bukan kode):**
- Office "Semper" 2 branch duplikat JCI — dedup + ownership (TD-30).
- 24 laptop MSI `assigned_to` kosong — isi setelah re-audit.
- Quotation Hisaka `QUO/MSI/2026/004` — input ulang item.

---

## Template Task Baru

```markdown
### [ID] — [Judul singkat]
**Modul:** (CRM / Foundation / Finance / …)
**Severity/Prioritas:** Critical / High / Medium / Low
**Tipe:** Feature / Bugfix / Refactor / Docs / DB change

**Konteks/Masalah:**
(akar masalah / kebutuhan; link ke TECH_DEBT TD-xx atau ROADMAP)

**Scope (file yang disentuh):**
- src/…

**DB change diperlukan:** Ya/Tidak (kalau ya → ikuti DB Change Checklist + approval)

**Definition of Done:**
- [ ] npm run build clean (catat modules + waktu)
- [ ] Lint net-zero
- [ ] Tidak ubah file di luar scope
- [ ] Tes manual: (sebutkan langkah)
- [ ] Update CLAUDE.md + PROGRESS.md

**Catatan:** (audit-before-fix? dependency ke task lain?)
```
