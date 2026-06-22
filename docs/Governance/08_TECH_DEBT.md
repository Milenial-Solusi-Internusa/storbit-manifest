# TECH DEBT — Nexus by MSI

> Utang teknis tercatat. Sumber: `CLAUDE.md` (Roadmap Menuju Production-Grade, Backlog, Status Nggantung) + field notes. Status: **OPEN** / **PARTIAL** / **DONE** / **VERIFY** (selesai di kode, belum tes runtime).

## Legenda Severity
**CRITICAL** — keamanan/integritas data, blokir produksi · **HIGH** — bug fungsional luas / risiko tinggi · **MEDIUM** — maintainability / konsistensi · **LOW** — kebersihan / kosmetik.

---

## Daftar Tech Debt

| ID | Severity | Deskripsi | Lokasi | Status | Catatan |
|----|----------|-----------|--------|--------|---------|
| TD-01 | CRITICAL | **Migrasi RLS proper (RBAC-driven).** ~51 policy pakai `is_admin_or_above()` (hardcode role, tak kenal manager/ceo) — tak sinkron RBAC granular UI. Rencana 4-fase: fix `has_permission()` → ganti `is_admin_or_above` → verifikasi cross-entity → test lintas role. | DB RLS (182 policy) | OPEN | BESAR + risiko tinggi, eksekusi sesi fresh, prasyarat HRIS. Pemicu: TD-04, TD-06. |
| TD-02 | CRITICAL | **`has_permission()` broken/unseeded.** Fungsi query `permissions`/`role_permissions`. `CLAUDE.md` (audit 15 Jun) tandai tabel "tidak ada"; snapshot kini PUNYA tabel itu → kemungkinan ada tapi belum ter-seed. | `has_permission()` + tabel `permissions`/`role_permissions` | VERIFY | [TODO: cek apakah kedua tabel terisi & fungsi dipakai RLS]. |
| TD-03 | HIGH | **Audit CRUD/DELETE policy semua tabel.** Pola berulang: UPDATE "admin-only" nyangkut owner-edit (fixed `quotations_update` 2.8Q); DELETE policy hilang → silent 0-row (fixed `quotation_items` 2.8J). Hanya ~4 dari ~50 tabel punya policy DELETE. | DB RLS | OPEN | Sisir `.eq('account_status',…)` + policy UPDATE/DELETE semua tabel. |
| TD-04 | HIGH | **`profiles_read` = `USING(true)` (stopgap CEO unblock).** Semua authenticated baca `profiles` karena `is_admin_or_above()` tak kenal `ceo`. | DB RLS `profiles_read` | OPEN | Aman sekarang (profiles bukan data sensitif), **WAJIB diperketat saat modul HRIS masuk**. |
| TD-05 | HIGH | **Tidak ada audit logging.** `AGENTS.md`/security baseline wajibkan 19 event audit; saat ini **0 call** `logAudit()` di kode, tabel `audit_logs` belum diimplementasi. | seluruh app | OPEN | Implement `audit_logs` + `logAudit()` helper. |
| TD-06 | MEDIUM | **Dua sistem permission belum sinkron.** Frontend pakai `hasPermission(module,action)` (role_permissions) DAN `hasMenuPermission(menuKey,action)` (user_menu_permissions); RLS pakai role hardcode. Tiga sumber kebenaran berbeda. | AuthContext + RLS | OPEN | Konsolidasi saat TD-01. |
| TD-07 | HIGH | **Tidak ada test sama sekali.** Belum ada Vitest + RTL. | repo | OPEN | Mulai dari util murni: `spCalc`, `bant`, format. Prasyarat aman untuk pecah App.jsx (TD-12). |
| TD-08 | MEDIUM | **Tidak ada error monitoring.** Sentry belum terpasang. | repo | OPEN | Pasang Sentry + ErrorBoundary report. |
| TD-09 | MEDIUM | **Total quotation dihitung di frontend.** Idealnya via DB trigger / generated column (konsistensi). | QuotationFormPage/DetailPage/PDF + `spCalc` | PARTIAL | Save sudah atomik via RPC `save_quotation` (2.9O); kalkulasi masih di FE. |
| TD-10 | MEDIUM | **`.single()` rawan 0-row.** Sebagian sudah → `.maybeSingle()` (2.9A). | berbagai query | PARTIAL | Sisir sisa. |
| TD-11 | MEDIUM | **~97 query tanpa `.limit()`.** Risiko default PostgREST 10-row / fetch tak terbatas. | berbagai | OPEN | Tambah `.limit()` / `.range()`. |
| TD-12 | HIGH | **`App.jsx` god-file (~4.667 baris, 30+ inline component).** | `src/App.jsx` | OPEN | Pecah **setelah** ada test (TD-07). Urutan: konstanta → presentasional → modul Storbit → layout → routing registry. JANGAN big-bang. |
| TD-13 | MEDIUM | **File >1.000 baris.** `CRMDashboardPage` (~1.996), `AssetDetailITPage`, `SalesOrderDetailPage`. | `src/modules/` | OPEN | Pecah bertahap. |
| TD-14 | LOW | **`PASTEL` design tokens duplikat di 22+ file.** | banyak file | OPEN | Ekstrak ke `src/lib/tokens.js`. Sekalian `ENTITY_IDS`→`config/entities.js`, helper `isSuperAdmin()`. |
| TD-15 | LOW | **Dead code `*.legacy.jsx` (~1.206 baris).** `CustomerMasterPage.legacy.jsx`, `UserManagement.legacy.jsx`. | `src/modules/` | OPEN | Hapus setelah konfirmasi tak direferensikan. |
| TD-16 | LOW | **`#quotation-print-area` dead DOM.** Eks-target html2canvas; sejak PDF pindah ke `@react-pdf/renderer` (2.10A) tak terpakai, off-screen. Comment "captured by html2canvas" stale. | `QuotationDetailPage.jsx` | OPEN | Kandidat hapus (dipertahankan sementara per instruksi sebelumnya). |
| TD-17 | LOW | **5 hijau terlarang + emoji** masih ada di sebagian UI. | berbagai | OPEN | Ganti ke token brand + Lucide. |
| TD-18 | MEDIUM | **Drop tabel dormant `sales_calls`/`sales_visits`/`sales_visit_logs`.** Frontend sudah cutover ke `activities`/`activity_logs` (2.9D). | DB | VERIFY | Tinggal verifikasi manual runtime lalu drop. Data lama sudah dimigrasi. |
| TD-19 | LOW | **Drop tabel dormant `customers`.** Sudah digantikan `accounts` (2.5A); pensiun, belum drop. | DB | OPEN | Drop setelah verifikasi staging + approval. |
| TD-20 | MEDIUM | **Drop kolom `profiles.role` + enum `user_role_legacy` (tahap 4).** Frontend + Edge Functions sudah berhenti baca (tahap 1-3 selesai). | DB | OPEN | Verifikasi semua super_admin ada di `user_roles` dulu; perlu approval. |
| TD-21 | HIGH | **Edge Functions `delete-user` + `reset-password` belum di-deploy.** Kode dibuat (2.3A) + UI wired (2.3B), tapi `supabase functions deploy …` belum dijalankan. (⚠️ Catatan: contoh task awal bilang "EF belum ada" — sebenarnya SUDAH dibuat, hanya belum deploy.) | `supabase/functions/` | OPEN | Deploy `delete-user reset-password` (+ `manage-schema`/`create-user` setelah perubahan profiles.role 2.3G). |
| TD-22 | MEDIUM | **`manage-schema` / `create-user` EF perlu re-deploy** pasca pembersihan `profiles.role` (2.3G). | `supabase/functions/` | OPEN | `supabase functions deploy manage-schema create-user`; pastikan `SUPABASE_ANON_KEY` ter-set di env manage-schema. |
| TD-23 | MEDIUM | **Deactivate user tidak otomatis cabut sesi auth.** Security baseline: "inactive users must be blocked or logged out". | UserAccess / AuthContext | VERIFY | [TODO: verifikasi — tidak eksplisit tercatat sbg debt di `CLAUDE.md`; konfirmasi apakah deactivate me-revoke sesi]. |
| TD-24 | LOW | **Cabut GRANT `anon` tabel kategori REFERENCES/TRIGGER-only.** 29 tabel sensitif sudah dicabut (2.8L); sisa `companies`/`payment_terms`/`assets` dll backlog kebersihan (bukan eksposur data). | DB grants | OPEN | Tidak urgent. |
| TD-25 | LOW | **Migrasi data lama `activities.type='prospecting'`.** Tipe `prospecting` dihapus dari UI (2.9K); row lama tampil "—" sampai dimigrasi. | DB data | OPEN | `UPDATE activities SET type='whatsapp'\|'followup' WHERE type='prospecting';` (manual, belum jalan). |
| TD-26 | LOW | **Asset module belum lengkap.** Tabel `asset_documents`/`asset_work_orders`/`asset_routes` belum ada; tab Dokumen/Rute/Work Orders placeholder; inline-edit Software & Maintenance di-skip; `assigned_to` 24 laptop MSI kosong. | `src/modules/assets/` + DB | OPEN | Perlu approval skema untuk tabel baru. |
| TD-27 | LOW | **React warning input read-only** ("form field without onChange"). | berbagai | OPEN | Tambah `readOnly` / `onChange` no-op. |
| TD-28 | LOW | **Mobile polish per-halaman.** Util responsive (2.8T) + drawer (2.8U) sudah ada; halaman selain CRM Dashboard belum dicek satu-satu di <1024px. | berbagai | OPEN | Sisir visual tiap halaman. |
| TD-29 | LOW | **CI pipeline belum ada** (build+lint+test gate sebelum deploy `main`). | repo | OPEN | Prasyarat: TD-07. |
| TD-30 | LOW | **Data cleanup tertunda.** Office "Semper" 2 branch duplikat JCI (dedup + ownership), Quotation Hisaka `QUO/MSI/2026/004` perlu input ulang item. | DB data | OPEN | Bukan kode. |
| TD-31 | LOW | **Field Registry Level 1** (custom field via JSONB) — nunggu 4 keputusan desain (struktur metadata, field core, pilot form Prospect). | desain | OPEN | — |

---

## Prioritas Fix (urutan disarankan)

1. **TD-21 / TD-22** — deploy Edge Functions (cepat, fungsional: delete-user/reset-password/schema).
2. **TD-03** — audit CRUD/DELETE policy semua tabel (silent-fail = risiko integritas; pola sudah terbukti).
3. **TD-02** — verifikasi/perbaiki `has_permission()` (prasyarat TD-01).
4. **TD-01 + TD-06** — migrasi RLS RBAC-driven (sesi fresh, prasyarat HRIS) + konsolidasi sistem permission.
5. **TD-05** — audit logging (`audit_logs` + `logAudit()`).
6. **TD-04** — perketat `profiles_read` (bersamaan modul HRIS).
7. **TD-07** → **TD-12/TD-13** — test dulu, baru pecah god-file App.jsx & file besar.
8. **TD-18 / TD-19 / TD-20** — drop tabel/kolom dormant setelah verifikasi runtime.
9. Sisanya (TD-08…TD-31) — maintainability & kebersihan, kerjakan oportunistik.

> ⚠️ Beberapa contoh di prompt task awal sudah **stale** vs kondisi nyata: "delete-user/reset-password EF belum ada" → sebenarnya sudah dibuat (2.3A), tinggal deploy (TD-21). Dokumen ini mencerminkan kondisi aktual per `CLAUDE.md`.
