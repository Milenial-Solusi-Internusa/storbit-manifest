# CLAUDE.md — Nexus by MSI

> Lean entry point untuk Claude Code. Detail lengkap ada di `docs/` (lihat tabel di bawah). `AGENTS.md` = identitas produk + safety rules (jangan diubah). `PROGRESS.md` = dev log per-tanggal.

## Quick Reference

- **Stack:** React 19 + Vite 8 · TailwindCSS 3 · Supabase (PostgreSQL + Auth + RLS + Edge Functions + Storage) · Vercel auto-deploy dari `main` (= production).
- **Supabase ref:** `untmpqceexwxzuhlmyrg` · pooler `aws-1-ap-northeast-2.pooler.supabase.com:5432`.
- **Live URL:** `nexus.dli.my.id` (production).
- **Repo:** GitHub `mhmmdjaelaniii/storbit-manifest`, branch `main` (solo dev; `fix/*` hotfix).
- **Entity UUID:** MSI `0e1840d8-e6fb-4190-bd09-88338e68b492` · JCI `42569e7c-531b-4d2b-832a-d5a7268c455b` · SOA `d2e5e565-5f67-4954-b8d9-5979a2a0c697`.
- **Sumber kebenaran DB:** `supabase/schema_snapshot.sql` (73 tabel) — BUKAN `migrations/` (berhenti 3 Jun 2026).
- **Brand:** navy `#144682` · orange `#E85A1E` · coral `#F08C7D` · app shell putih `#ffffff` · Montserrat (heading) + Inter (body) · Lucide icons · **no emoji, no dark green**.

## Aturan Wajib (ringkasan — detail: `docs/02_RULES_GOVERNANCE.md`)

- **Fetch:** selalu `.limit(1000)` (default PostgREST 10) · `.is('deleted_at', null)` · scope `company_id` + role-aware (`isAllEntities=['super_admin']`, `isSalesOnly=['sales','operations']`).
- **`profiles`** pakai kolom **`active`** (TIDAK ada `deleted_at`). · **`showToast?.(message, type)`** (urutan message dulu).
- **Soft delete** (`deleted_at`/`is_active=false`), jangan hard-delete data business.
- **DB:** GRANT setelah CREATE (tabel CLI tak auto-grant) · trigger ordering pakai prefix `trg_z_` · `auth.uid()` NULL di SQL Editor (test RLS di browser) · super-admin bypass = top-level `OR is_super_admin()`.
- **Embed alias** saat constraint FK belum di-rename (`customers:accounts!sp_items_customer_id_fkey(name)`).
- **Deploy code yang berhenti baca kolom DULU, baru drop kolom.** · Refresh `schema_snapshot.sql` via `pg_dump` setelah perubahan SQL Editor.
- **Workflow:** Inspect → Plan → Edit (scope kecil, hindari big-bang & rewrite App.jsx sekaligus) → Verify (`npm run build` clean, lint net-zero) → Summarize. Push HANYA bila diinstruksikan. Audit-before-fix untuk bug non-trivial.
- **Safety rules lengkap:** lihat `AGENTS.md` (15 non-negotiable).

## Dokumentasi Lengkap

| File | Isi |
|------|-----|
| `AGENTS.md` | Identitas produk, prinsip engineering, 15 safety rules, workflow per tipe task |
| `docs/02_RULES_GOVERNANCE.md` | Konvensi kode, pola wajib frontend/DB, brand, Do/Don't, workflow |
| `docs/03_DATA_MODEL.md` | Referensi DB: 73 tabel per modul, entity UUID, RLS patterns, RPC, gotchas |
| `docs/08_TECH_DEBT.md` | Daftar tech debt (TD-01…TD-31) + prioritas fix |
| `docs/09_ROADMAP.md` | Status modul, milestone, next up |
| `PROGRESS.md` | Dev log kronologis per-tanggal (jangan dihapus) |
| `docs/architecture/`, `docs/security/`, `docs/database/`, dll | Blueprint, baseline keamanan/performa, dll (lihat AGENTS.md "Required Reading") |

## Current Phase & Recent Changes

**Current phase: 2.10P** ✅ Complete

Recent (terbaru → lama; detail granular di git history & `PROGRESS.md`):
- **2.10P** — Fix dropdown customer/prospek AddVisitModal (kalender CRM) yang ke-cut huruf Q–Z. `CRMDashboardPage.jsx:2049` query `accounts` (`.order('name')` + `.in('account_status',['prospect','customer'])`) `.limit(200)` → `.limit(1000)`. Order name ASC + limit 200 = ekor alfabet ter-truncate bila total >200 (mis. "Waste for Change…" hilang). Ini satu-satunya `.limit(200)` di repo; kini selaras query saudara (ActivitiesPage:601, SalesCallsPage:445, InquiryFormPage:84/86 semua `.limit(1000)`) + aturan wajib CLAUDE.md. 1 baris, 1 file. Build clean (2551 modules, 1.27s). **Belum: tes manual runtime.**
- **2.10O** — Sinkronisasi dokumen governance (docs-only, 4 file: `docs/Governance/08_TECH_DEBT.md`, `09_ROADMAP.md`, `10_TASK_BREAKDOWN.md`, CLAUDE.md). **TECH_DEBT:** TD-01→PARTIAL (3 policy oversight-read +`is_manager_or_above`, fungsi +STABLE; Bucket A/B tak diubah), TD-03→PARTIAL (DELETE policy 4 tabel: notifications/hrga_request_items/hrga_offboarding_items/sp_btbs), TD-09 atomicity DONE (RPC `save_quotation`), TD-10 +count (~33 `.single()`); +TD-32 console.* (AuthContext/ProductsPage DONE, ~65 sisa), +TD-33 write non-atomik (ar_btbs db.js:371, RolesPage:201, UserEditPage:355), +TD-34 file 800–1.000 baris, +TD-35 loading/empty/error tak seragam; TD-13 +AssetDetailPage(~1.094)+CRMDashboard(1.996). **ROADMAP:** +CRM Report/Notification bell/Pending Approval/Quotation currency-VAT-kurs ✅, section "Selesai Terbaru 23 Jun". **TASK_BREAKDOWN:** +section "Completed (23 Jun)" + section F (tech debt open). ⚠️ Perubahan RLS/DELETE: `schema_snapshot.sql` perlu refresh `pg_dump` bila sudah live (snapshot saat audit masih state lama). Tidak ada kode/DB diubah.
- **2.10N** — Bersihkan console logging yang emit ke console produksi (2 file scope; logika auth/fetch tak berubah). `AuthContext.jsx`: hapus 6 `console.*` — 1 `console.warn` safety-timeout (string statis) + 5 `console.error` yang me-log objek error (profile error ×2, getSession error, profile fetch failed, sign-out error). Cleanup ikutan agar lint net-zero: drop `error` dari destructure `.then(({...}))` (2×), `.catch((err)=>` → `.catch(()=>` (2×), `signOut` jadi `await supabase.auth.signOut();` (buang `const {error}` + if-block kosong). State/useEffect/return/context values TIDAK diubah. `ProductsPage.jsx`: sudah 0 `console.*` (log produk/companies/first-3 yang disebut sudah tidak ada) → tak disentuh. Build clean (2551 modules, 1.29s).
- **2.10M** — CRMReportPage fit dalam Nexus shell (styling-only, 1 file). Filter bar tak lagi `position:sticky`/`top:0` (dulu stick di scroll container shell = janggal, terpisah dari konten) → flow normal di atas konten; borderBottom + boxShadow + backdrop(blur) dipertahankan. `st.filterInner.maxWidth` & `st.body.maxWidth` 1440→`"100%"` (full width sesuai shell; padding L/R 24px keduanya sudah sama). Root div `minHeight:'100vh'` dihapus (shell handle height). Tidak ubah warna/font/card/chart/tabel/logika data. Build clean (2551 modules, 1.29s). **Belum: tes manual runtime.**
- **2.10L** — CRM Report page (port Lovable + data Supabase real). File baru `src/modules/crm/CRMReportPage.jsx` (recharts ^3.8.1, sudah terpasang). Visual/tokens/CSS/layout dipertahankan PERSIS dari Lovable; dummy generator (mulberry32/genActivities/CURRENT/PREVIOUS/SALES/CUSTOMERS) diganti fetch real: roster sales/supervisor/manager (pola `fetchSalesProfiles`, entity dari `user_roles.company_id`); `activities` (filter `scheduled_for` in range; done/pending/overdue dari status+scheduled_for vs now; cancelled di-skip; type call/whatsapp→Call, visit/meeting→Visit, email→Email, followup→Task); `accounts` (prospect/lead in range by assigned_to); `quotations` (SENT/SUBMITTED in range by created_by). KPI/trend(day untuk today-week, week untuk month)/per-sales di-aggregate; period today/week/month + previous-window utk chip "vs periode lalu" (custom→today, TODO). Loading/error/empty state. Sidebar CRM: menu **Report** (BarChart2) setelah Activity Log + route `crm-report`→`<CRMReportPage/>`. App.jsx (lazy import + menu + route) + 1 file baru. Build clean (2551 modules, 1.30s). **Belum: tes manual runtime.** ⚠️ RLS `activities`/`accounts`/`quotations` scope per company/role (super_admin lihat semua entity; non-super hanya company-nya → entity pills lain mungkin kosong).
- **2.10K** — Notification bell re-apply (TDZ-safe). Commit bell lama `3d03fc3` white-screen krn `handleNotifClick` (useCallback dep `[navigateTo]`) diletakkan SEBELUM `navigateTo` dideklarasikan → `ReferenceError: Cannot access 'et' before initialization` (sudah di-revert `49f9437`). Fix: **seluruh blok bell** (state `notifications`/`unreadCount`/`notifOpen` + `NOTIF_ICON` + `notifTimeAgo` + `fetchNotifications` + 2 useEffect [mount+60s, Escape] + `markAllNotifRead` + `handleNotifClick` + JSX dropdown bell) dipindah ke SETELAH deklarasi `navigateTo`(1266)/`navigateToAssetDetail`(1283)/`navigateToCustomerDetail`(1301) → bell state di ~1321, `handleNotifClick` di ~1383. Hanya App.jsx, perubahan tunggal = penempatan. Producer notif (ActivitiesPage/useHrgaRequests dari 2.10K lama) tetap ada. Build clean (2550 modules, 1.24s). Catatan: fix status-filter badge (under_review→in_progress) TIDAK ikut di-reapply (di luar daftar blok bell). **Belum: tes manual runtime** (bell render, no white screen, dropdown/mark-read/navigate).
- **2.10J** — Navbar "Pending Approval" badge aktif (HRGA). App.jsx: +import `supabase` + `erpRoles` dari useAuth; state `pendingApprovalCount` (fetch saat mount + `setInterval` 60s, cleanup). Hitung: `hrga_requests` status `submitted`/`under_review` × `hrga_approval_configs` (approver_role ∈ role user, match `request_type_id|current_level`); super_admin tanpa company filter (lainnya scope `company_id`). Badge orange #E85A1E pojok kanan-atas tombol (>99 → "99+", 0 → hidden). Tujuan navigasi diganti `approvals` (ComingSoon) → **`hrga-pending-approval`** (HrgaShell real). Hanya App.jsx. Build clean (2550 modules, 1.21s). **Belum: tes manual runtime** (badge muncul utk approver HRGA; angka benar; navigasi ke inbox HRGA).
- **2.10I** — Quotation: satu sumber kurs (per-baris saja). Hapus field header "Kurs USD (IDR)" + recalc-effect + summary note. `calcRowTotal(row)`: IDR→×1, SEMUA non-IDR (incl USD)→×`row.exchange_rate`. Kolom "Kurs" tampil utk semua non-IDR; ganti ke USD → pre-fill 16000 (override OK), ke EUR/dll → kosong, IDR → "—". `totalCost`/`baseItemRows` ikut per-baris. `header.usd_rate` dipertahankan di state+payload (backward-compat DB), tak di-render. Detail+PDF: subtitle "× kurs" untuk semua non-IDR pakai `item.exchange_rate`; InfoRow "Kurs USD" dihapus. 3 file. Build clean (2550 modules, 1.27s). **Belum: tes manual runtime**.
- **2.10H** — Quotation konversi per-row multi-currency. `calcRowTotal`: IDR→1, USD→`header.usd_rate`, lainnya (EUR/SGD/JPY/MYR)→`row.exchange_rate`. Form: kolom "Kurs" (input muncul HANYA non-IDR/non-USD, else "—") setelah Currency; ganti currency reset kurs (IDR→1/USD→''/lain→'' user isi); subtitle total + `exchange_rate` preserved di edit-reconstruction & baseItemRows. Detail + PDF: subtitle "× kurs {rate}" untuk non-IDR/non-USD. 3 file. Build clean (2550 modules, 1.25s). **Belum: tes manual runtime** (EUR 320×1×kurs 17.000 → Rp 5.440.000; input kurs dinamis; USD/IDR tetap).
- **2.10G** — CRM Dashboard fit lebar: `D.wrap` `maxWidth:1280` → `"100%"` (hapus cap penyebab whitespace L/R di layar lebar) + `D.root` padding L/R `28px` → `20px` (top/bottom 26/44 tetap). Chart (`nx-grid-2` 1fr/1fr) kini stretch full-width. Hanya CRMDashboardPage.jsx (line 184-185). Build clean (2550 modules, 1.21s).
- **2.10F** — `.nexus-shell-bg` background cream gradient → `#ffffff` (app shell putih global). *(pushed)*
- **2.10E** — CRM Dashboard `D.root` bg `#F7F7F8` → `#ffffff` (fix belang vs card).
- **2.10D** — `UNIT_LABELS` quotation +3 (Per CBM-Up, Per 1-3 CBM, Per Waybill).
- **2.10C** — Quotation: currency dropdown dari tabel `currencies` + VAT rate dropdown (auto-default per service_type, customs=11%) + PPN dynamic di detail & PDF.
- **2.10B** — QuotationPDF: divider nempel footer + "Customer Representative" center.
- **2.10A** — Quotation PDF rewrite `html2canvas+jsPDF` → `@react-pdf/renderer` (vector/text, pagination otomatis).
- **2.9X–2.9Z** — PipelineKanban toolbar (member filter/sort/filter panel/list-view) + `estimated_value`; Activity lifecycle → `activity_logs` feed.

> ⚠️ Banyak fase "build clean, **belum tes manual runtime**" — selalu cek sebelum anggap fitur jalan. Update bagian ini + `PROGRESS.md` tiap akhir task.

## Known Issues (Quick Ref — detail: `docs/08_TECH_DEBT.md`)

- **CRITICAL** — Migrasi RLS RBAC-driven belum jalan; ~51 policy pakai `is_admin_or_above()` (tak kenal manager/ceo) → bug akses (TD-01, **PARTIAL**: 3 oversight-read sudah +`is_manager_or_above`+STABLE). `has_permission()` flagged broken/unseeded (TD-02).
- **HIGH** — Audit CRUD/DELETE policy semua tabel (silent 0-row; TD-03, **PARTIAL**: 4 tabel transaksional sudah dpt DELETE policy). Write non-atomik ar_btbs/permission-diff (TD-33). `profiles_read = USING(true)` stopgap CEO (perketat saat HRIS; TD-04). Edge Functions delete-user/reset-password belum di-deploy (TD-21). Belum ada audit logging / test / Sentry (TD-05/07/08).
- **MEDIUM/LOW** — Dua sistem permission belum sinkron (TD-06); tabel dormant `sales_calls`/`sales_visits`/`customers` + kolom `profiles.role` belum di-drop (TD-18/19/20); App.jsx god-file ~4.667 baris (pecah setelah ada test; TD-12).
