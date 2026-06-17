# TECH_DEBT.md — Audit Tech Debt Menyeluruh (17 Jun 2026)

> **Audit-only.** Tidak ada kode diubah — ini laporan. Scan `src/` + `supabase/`.
> Tiap baris ditandai **[BARU]** (belum tercatat) atau **[SUDAH DI BACKLOG]** (sudah ada di
> CLAUDE.md Roadmap / Status Nggantung / RLS backlog / Security Hardening).
> Severity: 🔴 tinggi (correctness/security berisiko) · 🟡 sedang (maintainability) · 🟢 ringan.
> Diurutkan dari severity tertinggi.

---

## Temuan

| Kategori | File:baris | Temuan | Sev | Status | Saran |
|---|---|---|---|---|---|
| B. Keamanan | `src/contexts/AuthContext.jsx:39` (+28,68,80,113,183) | `console.log('[fetchProfileById] result:', profileRes.data …)` — **mem-log seluruh row profile user** (nama, role, company, dll) ke console produksi tiap auth event. | 🔴 | **[BARU]** | Hapus / gate di `import.meta.env.DEV`. Phase 0.5B hanya bersihkan `db.js`, log baru menumpuk lagi. |
| B. Keamanan | `src/modules/admin/pages/ProductsPage.jsx:342,349,350` | `console.log('[Products] total fetched:', prods…)`, `companies map`, `first 3 products` — log data bisnis (produk, harga, company map) ke console. | 🔴 | **[BARU]** | Hapus log data. |
| B. Keamanan | RLS `has_permission(text,text)` (`supabase/schema_snapshot.sql:184`) | Fungsi role-check dipakai RLS tidak sinkron RBAC granular; `is_admin_or_above()` tak kenal `ceo` (memicu CEO unblock 2.8Y). 173 policy: ~51 `is_admin_or_above`. | 🔴 | **[SUDAH DI BACKLOG]** | Lihat section **Backlog — Migrasi RLS Proper (RBAC-driven)**. Eksekusi sesi fresh. |
| A. Correctness | `src/modules/crm/QuotationFormPage.jsx:515-532` | Simpan quotation = `update` → `delete items` → `insert items` **non-atomik** (3 statement terpisah, bukan 1 RPC). Insert gagal setelah delete sukses → quotation tanpa item tapi total terisi. | 🔴 | **[SUDAH DI BACKLOG]** | Roadmap 🔴 "Write quotation atomik (RPC transaksi tunggal)". |
| C. Sampah/DB | seluruh tabel | DELETE RLS policy hilang di banyak tabel (~4 dari ~50 punya) — `.delete()` "sukses" 0-row senyap (bug `quotation_items` lama). | 🔴 | **[SUDAH DI BACKLOG]** | Roadmap 🔴 "Audit CRUD policy lintas tabel". |
| A. Correctness | `src/lib/db.js` (10×), `src/hooks/useHrgaRequests.js` (7×), `QuotationDetailPage`, `QuotationFormPage`, `CRMDashboardPage`, `RolesPage`, `InquiryFormPage`, `ProductDetailPage`, `UserEditPage`, `EntitySettingsPage`, `ApprovalWorkflowsPage`, `CustomerDetailPage`, `useAssets.js` | **33× `.single()`** vs hanya 6× `.maybeSingle()` → throw "Cannot coerce to single JSON object" saat 0 baris. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟡 "`.single()` → `.maybeSingle()` di tempat bisa 0-row". |
| A. Correctness | seluruh `src/` (169 `.select(`, hanya 72 ber-`.limit`/`.range`) | **~97 query tanpa `.limit()`** → kena default PostgREST 10-row (data hilang senyap) atau over-fetch. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟡 "Tambah `.limit()` ke ~97 query". |
| A. Correctness | `src/lib/db.js:371` (ar_btbs delete→bulkInsert), `RolesPage.jsx:201`, `UserEditPage.jsx:355` (perm diff delete+insert) | Write multi-step delete-then-insert non-atomik **selain quotation** (AR BTB, permission diff-save). | 🟡 | **[BARU]** | Bungkus ke RPC transaksi atau verifikasi count; risiko < quotation tapi pola sama. |
| D. Struktur | `src/App.jsx` (**4.667 baris**) | God-file makin besar (doc lama catat 4.618). Routing `activeMenu` (53 cabang) + ROLES/PERMISSIONS/`can()` + modul Storbit inline + 49 `useState`. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟢 pecah App.jsx SETELAH ada test. Urutan: konstanta→presentasional→modul Storbit→layout→registry routing. |
| D. Struktur | `CRMDashboardPage.jsx:1996`, `AssetDetailITPage.jsx:1588`, `SalesOrderDetailPage.jsx:1155` | File >1.000 baris (CRMDashboard tumbuh dari 1.850 → **1.996**). | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟢 "Pecah file >1.000 baris". CRMDashboard naik perlu di-update di doc. |
| D. Struktur | `AssetDetailPage.jsx:1094`, `MyProfilePage.jsx:870`, `QuotationFormPage.jsx:847`, `ProductDetailPage.jsx:832`, `QuotationDetailPage.jsx:824`, `CustomerDetailPage.jsx:812` | File 800–1100 baris **belum** masuk daftar pecah eksplisit (daftar lama hanya sebut CRMDashboard/AssetDetailIT/SalesOrderDetail). | 🟡 | **[BARU]** | Tambahkan ke daftar "pecah file >800 baris". |
| C. Sampah | `src/components/UserManagement.legacy.jsx` (390), `src/modules/crm/CustomerMasterPage.legacy.jsx` (816) | **1.206 baris dead code** (`*.legacy.jsx`) — tidak di-import di mana pun. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟡 "hapus 1.206 baris dead code". |
| C. Sampah | seluruh `src/` (**65 `console.*`**) | Selain yg leak data (atas), sisanya noise produksi (`[Auth] useEffect start`, dll). | 🟡 | **[BARU]** | Roadmap belum punya item "hapus console.*" (Phase 0.5B hanya db.js). Tambah ke backlog + logger ber-level. |
| D. Maintainability | 6 file: `AssetDashboardPage.jsx`, `ApprovalWorkflowsPage.jsx`, `DocumentSettingsPage.jsx`, `EntitySettingsPage.jsx`, `FinanceDefaultsPage.jsx`, `NotificationsPage.jsx` | 3 UUID company (MSI/JCI/SOA) **hardcoded `ENTITY_IDS`** di-copy ke 6 file. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟡 "`ENTITY_IDS`→`config/entities.js`". |
| D. Maintainability | `PipelineKanbanPage`, `ProspectListPage`, `CRMDashboardPage`, `InventoryDashboardPage` | Pola fetch role-aware (`isAllEntities`/`isSalesOnly` + `.or(assigned_to…)`) di-copy 4 file. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟢 ekstrak `useRoleScopedQuery`. |
| D. Maintainability | **45 file** deklarasi token (`const PASTEL/C/D = {…}`) | Token desain (warna brand) di-copy 45 file → rebrand = 45 edit. | 🟡 | **[SUDAH DI BACKLOG]** | Roadmap 🟡 "`PASTEL`→`lib/tokens.js`". |
| A. Reliability | ErrorBoundary hanya di 5 file; per-route di App.jsx | Banyak komponen fetch (admin pages, CRM list) — loading/empty/error state tidak seragam (sebagian hanya toast). | 🟡 | **[BARU]** | Standarkan wrapper `<DataState>`; audit per-list-page. |
| E. Lain | `QuotationFormPage.jsx:197,209,221`, `AddAssetPage.jsx`, `AssetDetailITPage.jsx:243,250,266`, `MyProfilePage.jsx:124`, `BuatRequestPage.jsx:263` | Kandidat `<input value=…>` tanpa `onChange`/`readOnly` (warning React) — **perlu verifikasi per-input** (banyak onChange ada di baris berikut / di komponen wrapper, jadi sebagian false-positive). | 🟢 | **[SUDAH DI BACKLOG]** | Status Nggantung "warning form field value without onChange". Tambah `readOnly`/`onChange` no-op. |
| D. Maintainability | 75 file inline-style vs 50 file Tailwind | Paradigma styling terbelah. | 🟢 | **[SUDAH DI BACKLOG]** | Roadmap 🟢 "Satukan paradigma styling". |
| C. Sampah | `src/modules/crm/PipelineKanbanPage.jsx:590` | `catch (_) {}` kosong (drag handler `setData`) — sengaja, tapi `_` unused var (lint). | 🟢 | **[BARU]** | Hapus param atau `void`; trivial. |
| C. TODO | `CustomerDetailPage.jsx:357,722` (health-score heuristik), `AssetDetailITPage.jsx:1382` (asset SW/Mtc edit), `SalesOrderPage.jsx:493,502,660` + `SalesOrderDetailPage.jsx:12` (`sp_items.status` migration) | Komentar TODO yg masih valid (bukan dead). | 🟢 | **[SUDAH DI BACKLOG]** | Health-score & SW/Mtc edit ada di Status Nggantung; `sp_items.status` migration backlog logistik. |

---

## Yang DIPERIKSA & BERSIH (tidak ada temuan)

| Cek | Hasil |
|---|---|
| Secret / API key / kredensial hardcoded | ✅ **Bersih.** `src/lib/supabase.js` pakai `import.meta.env.VITE_SUPABASE_URL/KEY` (anon key — memang publik di client). `SchemaManagerPage` pakai anon key + Bearer session token (benar). Tidak ada service_role di client. |
| Dependency `package.json` tak terpakai | ✅ **Bersih.** `html2canvas`/`jspdf` (PDF quotation), `recharts` (dashboard), `lucide-react` (57 file), `@supabase/supabase-js` — semua dipakai. |
| `<img>` tanpa `alt` | ✅ **Bersih.** Satu-satunya `<img>` (logo MSI di App.jsx) punya `alt="MSI"`. |
| Empty catch yang menelan error penting | ✅ Hanya 1 (`PipelineKanbanPage:590`, drag handler — wajar). |

---

## Ringkasan

### Per Kategori
| Kategori | Jumlah temuan |
|---|---|
| A. Correctness / rawan bug | 4 |
| B. Keamanan | 3 |
| C. Kode mati & sampah | 4 |
| D. Struktur & maintainability | 7 |
| E. Lain (form/a11y) | 1 |
| **Total** | **19** |

### Per Severity
| Severity | Jumlah |
|---|---|
| 🔴 Tinggi | 5 |
| 🟡 Sedang | 11 |
| 🟢 Ringan | 3 |
| **Total** | **19** |

### Per Status
| Status | Jumlah |
|---|---|
| **[BARU]** (belum tercatat) | 7 |
| **[SUDAH DI BACKLOG]** | 12 |

### Temuan [BARU] yang paling perlu perhatian
1. 🔴 **`console.log` mem-leak data profile/produk** (AuthContext, ProductsPage) — bukan sekadar noise, ini eksposur data di console produksi. Phase 0.5B hanya bersihkan `db.js`; log baru menumpuk.
2. 🟡 **Write non-atomik selain quotation** (AR BTB di `db.js`, permission diff-save) — pola yang sama dengan bug quotation, belum tercatat.
3. 🟡 **File 800–1100 baris belum masuk daftar pecah** (AssetDetailPage 1094, MyProfilePage 870, dll) + CRMDashboard tumbuh 1.850→1.996.
4. 🟡 **Item "hapus console.*"** belum ada di Roadmap tertulis (hanya Phase 0.5B yang terbatas db.js).
5. 🟡 **Loading/empty/error state tidak seragam** lintas list page.

> Mayoritas temuan struktural & maintainability (App.jsx god-file, `.single()`, `.limit()`, dead code,
> duplikasi token/fetch, has_permission/RLS) **sudah tercatat** di backlog — audit ini mengonfirmasi
> masih relevan, dan menambah 7 temuan baru (terutama eksposur data via console).
