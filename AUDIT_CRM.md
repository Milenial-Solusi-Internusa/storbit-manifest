# AUDIT_CRM.md — Audit Kritis Modul CRM (Nexus by MSI)

> **Audit-only.** Tidak ada kode/DB diubah. Scope: HANYA modul CRM (`src/modules/crm/` +
> tabel `accounts`/`inquiries`/`quotations`/`quotation_items`/`sales_visits`/`sales_calls`/
> `sales_visit_logs` di `supabase/schema_snapshot.sql`). Bukti = `file:line`.
> Tanggal: 17 Jun 2026.

---

## RINGKASAN EKSEKUTIF

| Dimensi | Skor (1–10) | Verdict singkat |
|---|---|---|
| Arsitektur | **4** | `CRMDashboardPage.jsx` = god-file **1.996 baris / 21 komponen** dalam 1 file; 13 file CRM masing-masing mendefinisikan objek token desain sendiri. |
| Keamanan | **5** | RLS `accounts`/`quotations`/`sales_*` sudah role-aware & benar, TAPI `inquiries_update` admin-only (sales tak bisa edit inquiry sendiri — déjà-vu bug 2.8Q), dan list Inquiry/Quotation/Calls **tidak** role-aware → super_admin buta lintas-entitas. |
| Maintainability | **3** | Copy-paste pola fetch & 13 token-object terduplikasi; model visibility **tidak konsisten** antar halaman; emoji & hijau terlarang nyasar. |
| Reliability | **3** | Fallback nomor dokumen **diam-diam** bikin nomor non-sekuensial/rawan tabrakan; write quotation non-atomik; `.single()` yang throw; `catch {}` menelan error. |
| Kelengkapan Fitur | **4** | Pipeline/BANT/Win-Loss/Quotation/Calls/Visits ADA; tapi **task & reminder follow-up, multi-contact, timeline interaksi nyata, stage-history, forecast, merge duplikat, notifikasi, bulk/saved-view** semua BELUM. |
| Kematangan Desain | **4** | Token brand sebagian dipakai tapi 13 set token berbeda → 13 dialek visual; densitas data rendah (operasional tapi terasa landing-page); skala radius kacau (6/7/8/9/10/11/12/14/20/99). |

**Kritik terpenting (jujur, tajam):**

**1. Ini bukan satu modul CRM — ini 13 halaman yang kebetulan satu folder.** Tiap file CRM
(`ProspectListPage`, `InquiryListPage`, `QuotationListPage`, `SalesCallsPage`, dst.) punya
**objek token desain sendiri** (`const C = {…}` / `const D = {…}` / `const S = {…}`) — 13 deklarasi
terpisah. Akibatnya tiap halaman punya warna/spacing/radius yang **mirip tapi tidak identik**, dan
ubah satu warna brand = sentuh 13 file. Model **visibility** pun tidak seragam: Pipeline/Prospects/
Dashboard sudah role-aware (super_admin lihat semua entitas — fix 2.8C), tapi **Inquiry/Quotation/
SalesCalls masih `company_id`-only** ([InquiryListPage.jsx:159](src/modules/crm/InquiryListPage.jsx),
[QuotationListPage.jsx:106](src/modules/crm/QuotationListPage.jsx)) → super_admin **buta** terhadap
inquiry/quotation entitas lain. Ini bukan polish, ini fondasi yang belum disepakati.

**2. Reliability bocor di titik paling sensitif: nomor dokumen.** Saat RPC
`increment_document_sequence` gagal, generator nomor inquiry/quotation **diam-diam** fallback ke
`Date.now().toString().slice(-4)` ([InquiryFormPage.jsx:59-61](src/modules/crm/InquiryFormPage.jsx),
[QuotationFormPage.jsx:131-132](src/modules/crm/QuotationFormPage.jsx)) — 4 digit dari epoch ms,
**non-sekuensial dan rawan tabrakan** (window 10 detik = digit sama). User tidak diberi tahu RPC
gagal; quotation terkirim ke customer dengan nomor "acak" atau bisa **duplikat**. Untuk ERP yang
menuntut "Document numbering standard", ini cacat integritas yang serius.

**3. CRM-grade-nya masih ~40%.** Yang ADA itu *kerangka pipeline* (drag-drop stage, BANT, win/loss,
quotation, calls, visits). Yang HILANG justru hal yang bikin sales **tidak kehilangan deal**:
**tidak ada task/reminder follow-up** (prospect bisa "menguap" tanpa di-follow-up), **tidak ada
timeline interaksi per account** ("Recent Activity" cuma menampilkan *prospect baru dibuat* —
[CRMDashboardPage.jsx:1700-1705](src/modules/crm/CRMDashboardPage.jsx) — bukan call/visit/email/
perubahan stage), **tidak ada riwayat stage** (cuma stage terkini), **tidak ada multi-contact /
lampiran**, **tidak ada forecast/weighted pipeline**, **tidak ada merge duplikat**. Dan duplikat
account memang bisa terjadi: **tidak ada UNIQUE constraint** di `accounts` (PK pun masih bernama
`prospects_pkey` — [snapshot:3612](supabase/schema_snapshot.sql)), proteksi cuma warning onBlur
non-blocking ([ProspectFormPage.jsx:259](src/modules/crm/ProspectFormPage.jsx)). Kasus Indochem
dobel = konsekuensi langsung.

**4. Audit trail = nol.** Tidak ada `audit_logs`/`logAudit()` untuk perubahan account/quotation/
inquiry/assignment. `sales_visit_logs` hanya mencatat perubahan status visit. Untuk CRM internal
yang memegang pipeline & harga, "siapa mengubah apa kapan" mustahil dilacak.

---

## TEMUAN TEKNIS (Bagian 1)

### 1. Arsitektur & Struktur

- **[HIGH] God-component dashboard** — `CRMDashboardPage.jsx:1431` (file **1.996 baris**, **21 komponen** dalam 1 file: Icon, KpiCard, PieTip, AddVisitModal 200 baris, VisitDetailModal, DashCalendar 260 baris, dll). **Dampak:** mustahil di-review/test, merge-conflict magnet, fetch + agregasi + 8 chart + 2 modal kalender semua di sini. **Fix:** ekstrak `useCrmDashboardData()` hook (semua query+agregat), `charts/*`, `AddVisitModal.jsx`, `VisitDetailModal.jsx`, `DashCalendar.jsx`.
- **[MEDIUM] 13 objek token desain terduplikasi** — `const C/D/S = {…}` di **13 file CRM** (ProspectListPage, InquiryListPage, QuotationListPage, SalesCallsPage, CustomerListPage, CustomerDetailPage, dll). **Dampak:** rebrand = 13 edit; drift visual. **Fix:** `src/lib/tokens.js` tunggal.
- **[MEDIUM] Duplikasi pola fetch role-aware** — `isAllEntities`/`isSalesOnly` + `.or('assigned_to…')` di-copy di PipelineKanbanPage, ProspectListPage, CRMDashboardPage. **Fix:** hook `useRoleScopedQuery(table, opts)`.
- **[MEDIUM] Dead code** — `CustomerMasterPage.legacy.jsx` (816 baris) tidak di-import. **Fix:** hapus.
- **[LOW] Dua model "list" berbeda** — Inquiry/Quotation pakai server-side `.range()` pagination; Prospect/LeadPool pakai client-side slicing; CRMDashboard agregat client-side. Tidak ada `DataTablePage` bersama.

### 2. Konsistensi & Maintainability

- **[HIGH] Model visibility tidak konsisten** — Prospects/Pipeline/Dashboard role-aware (super_admin lihat semua entitas), tapi `InquiryListPage.jsx:159` & `QuotationListPage.jsx:106` & `SalesCallsPage.jsx` hanya `.eq('company_id', profile.company_id)`. **Dampak:** super_admin/admin **tak bisa** melihat inquiry/quotation/call entitas lain; bug yang sama yang sudah di-fix untuk Prospects (2.8C) tertinggal di sini. **Fix:** terapkan pola `isAllEntities`/`isSalesOnly` yang sama.
- **[MEDIUM] FK constraint masih nama lama** — embed pakai `accounts!inquiries_prospect_id_fkey`, `accounts!prospects_assigned_to_fkey`, dan PK `prospects_pkey`/`customers_pkey` ([snapshot:3612,3212](supabase/schema_snapshot.sql)). **Dampak:** membingungkan (tabel `accounts` tapi constraint `prospects_*`/`customers_*`), rawan salah saat ada yg me-rename. **Fix:** dokumentasikan/rename constraint terencana (hati-hati — embed di kode ikut).
- **[LOW] Magic strings stage/status tersebar** — `'WON'`/`'LOST'`/`account_status` literal di banyak file; `VISIT_STATUS`, `STAGES` di-redefine. **Fix:** konstanta bersama `crm/constants.js`.

### 3. Database & Data Integrity

- **[HIGH] Tidak ada UNIQUE di `accounts`** — tak ada `UNIQUE (company_id, name)` / `(company_id, code)` ([snapshot ~3611](supabase/schema_snapshot.sql) hanya `prospects_pkey`). **Dampak:** duplikat account (kasus **Indochem**) bisa berulang; dedup hanya warning client-side non-blocking ([ProspectFormPage.jsx:259,388](src/modules/crm/ProspectFormPage.jsx)). **Fix:** UNIQUE partial `(company_id, lower(name)) WHERE deleted_at IS NULL`, atau dedup server-side + fungsi merge.
- **[HIGH] `inquiries_update` admin-only** — policy `inquiries_update … is_admin_or_above()` ([snapshot:7337](supabase/schema_snapshot.sql)). **Dampak:** sales (creator) **tak bisa edit inquiry miliknya** — déjà-vu `quotations_update` yang sudah di-fix 2.8Q. **Fix:** `(company_id=get_user_company_id() AND (is_manager_or_above() OR created_by=auth.uid())) OR is_super_admin()`.
- **[HIGH] Write quotation non-atomik** — `QuotationFormPage.jsx:515-532`: `update quotations` → `delete quotation_items` → `insert quotation_items`, **3 statement terpisah** tanpa transaksi. **Dampak:** insert gagal setelah delete sukses → quotation **tanpa item tapi total terisi** (korup). **Fix:** RPC `SECURITY DEFINER` transaksi tunggal. _(Sudah di Roadmap 🔴.)_
- **[MEDIUM] `QuotationListPage` tak filter `deleted_at`** — `quotations` punya kolom `deleted_at` ([snapshot](supabase/schema_snapshot.sql)) tapi fetch list ([QuotationListPage.jsx:96-108](src/modules/crm/QuotationListPage.jsx)) tidak `.is('deleted_at', null)`. **Dampak:** quotation yang di-soft-delete (sekarang/nanti) tetap muncul di list. **Fix:** tambah `.is('deleted_at', null)`.
- **[MEDIUM] Total denormalized tanpa trigger** — `quotations.subtotal/tax_amount/total_amount` dihitung di frontend ([QuotationFormPage.jsx:508-510](src/modules/crm/QuotationFormPage.jsx)). **Dampak:** kalau item diubah langsung di DB / partial-fail, header desync. **Fix:** total via DB trigger/generated.
- **[LOW] `accounts` tanpa DELETE policy** — tidak ada `*_delete` untuk `accounts` (soft-delete via UPDATE — OK by design), tapi kalau ada kode `.delete()` accounts akan **0-row senyap**. Saat ini aman (semua soft-delete). Catat sebagai jebakan.

### 4. Security

- **[HIGH] Super_admin cross-entity blind (Inquiry/Quotation/Calls)** — lihat 2-Konsistensi. RLS sebenarnya mengizinkan (`OR is_super_admin()`), tapi **frontend `company_id` filter** yang membatasi → super_admin hanya lihat company-nya. **Fix:** role-aware fetch.
- **[LOW] `profiles_read USING(true)`** — semua authenticated bisa baca semua `profiles` (di luar scope CRM, tapi CRM banyak embed `profiles(full_name)`). Sudah tercatat (Phase 2.8Y) — review saat HRIS. **Catat sebagai dependency CRM.**
- **[POSITIF]** RLS `accounts` (prospects_read/update), `quotations`, `sales_calls`, `sales_visits` sudah benar role-aware (sales = assigned/created, manager = entity, super = all) — [snapshot:7608,7677,7771+](supabase/schema_snapshot.sql). `quotation_items` punya DELETE policy (fix 2.8J). Tidak ada secret hardcoded.

### 5. State & Data Flow

- **[MEDIUM] Optimistic drag tanpa cek 0-row** — `PipelineKanbanPage.jsx` rollback hanya bila `error` truthy; kalau RLS mem-block update (sales drag prospect bukan miliknya) bisa balik sukses 0-row → UI tampak pindah, DB tak berubah. **Fix:** verifikasi `data`/`count` hasil update, bukan hanya `error`.
- **[LOW] Form state reset on tab-switch** — sudah di-fix global (AuthContext 2.8B). Form CRM (WinLossModal, AddVisitModal) aman karena local `useState`.
- **[LOW] `DashCalendar` `useIsMobile` + `setDayPopup`** — state lokal, OK.

### 6. Error Handling & Reliability

- **[HIGH] Fallback nomor dokumen diam-diam → nomor rawan tabrakan** — `InquiryFormPage.jsx:59-61` & `QuotationFormPage.jsx:131-132`: `catch { return … Date.now().slice(-4) }`. **Dampak:** saat RPC gagal, nomor inquiry/quotation jadi 4-digit epoch (non-sekuensial, bisa duplikat), **tanpa notifikasi ke user**. **Fix:** jangan swallow — surface error (toast "gagal generate nomor, coba lagi"), jangan buat nomor non-sekuensial; idealnya nomor di-generate server-side via RPC atomik dan gagal = batalkan simpan.
- **[MEDIUM] `.single()` yang harusnya `.maybeSingle()`** — `CustomerDetailPage.jsx:422,426`, `QuotationDetailPage.jsx:172,186,203`, `QuotationFormPage.jsx:538`, `InquiryFormPage.jsx:107`. **Dampak:** throw "Cannot coerce to single JSON object" saat 0 baris (mis. payment_terms_id null → `payment_terms…single()` di QuotationDetailPage:186). **Fix:** `.maybeSingle()`.
- **[MEDIUM] `catch {}` menelan error asli** — `CustomerDetailPage.jsx:425`, `CustomerListPage.jsx:551`: fallback query `select('*')` setelah join gagal, tapi error asli **tidak di-log**, dan fallback `.single()` ([CustomerDetailPage.jsx:426](src/modules/crm/CustomerDetailPage.jsx)) sendiri tak dicek errornya. **Dampak:** kegagalan join (mis. FK embed salah) tak kelihatan; debug sulit. **Fix:** `console.error` konteks + cek error fallback.
- **[HIGH] Dropdown account tanpa `.limit()` → default-10** — `InquiryFormPage.jsx:86,88`: fetch `accounts` (prospect & customer) untuk dropdown TANPA `.limit()` → PostgREST default **10 baris**. **Dampak:** di company dengan >10 account (SOA punya 60+), user **tak bisa memilih** account ke-11+ saat buat inquiry. **Fix:** `.limit(1000)` (pola wajib repo).
- **[LOW] Loading/empty/error tidak seragam** — sebagian list (Inquiry/Quotation) ada skeleton+empty; sebagian hanya `showToast` saat error. **Fix:** standar `<DataState>`.

### 7. Performance

- **[MEDIUM] ~63 query CRM tanpa `.limit()`** (dari 169 select repo, hanya 72 ber-limit). Khusus CRM: dropdown InquiryForm (di atas), beberapa fetch dashboard. **Fix:** audit `.limit()`.
- **[LOW] Tidak ada N+1 parah** — list pakai PostgREST embed (`prospect:accounts(name)`, `assigned_profile:profiles(full_name)`) → 1 query, bukan per-row. (Bagus.)
- **[LOW] CRMDashboard agregasi di client** — 8+ query lalu hitung trend/leadSource/salesPerf di JS. Saat data besar = lambat. **Fix:** RPC/materialized view.

---

## ROADMAP FITUR (Bagian 2)

| Fitur CRM-grade | Status | Kenapa penting | Prioritas |
|---|---|---|---|
| **Task & reminder follow-up** | ❌ Belum | Tanpa ini prospect "menguap" tak di-follow-up; `sales_calls.next_action_date` ada tapi tidak ada surfacing "overdue" / task list / reminder. | **MUST** |
| **Timeline interaksi per account** (call+visit+email+stage change+quotation) | ⚠️ Setengah | CustomerDetailPage ada tab "History Visit" saja; "Recent Activity" dashboard cuma *prospect baru* ([CRMDashboardPage.jsx:1700](src/modules/crm/CRMDashboardPage.jsx)). Sales butuh 1 kronologi lengkap per account. | **MUST** |
| **Riwayat perubahan stage (stage history)** | ❌ Belum | Hanya `pipeline_stage` terkini; tak bisa hitung sales-cycle/aging per stage atau audit "kapan pindah ke Negotiation". | **MUST** |
| **Deteksi + merge duplikat account** | ⚠️ Setengah | Hanya warning onBlur non-blocking, tak ada UNIQUE DB, tak ada merge. Kasus Indochem membuktikan gagal. | **MUST** |
| **Audit trail perubahan data** | ❌ Belum | 0 `audit_logs`; tak bisa lacak siapa ubah harga/stage/assignment. | **MUST** |
| **Multiple contacts per account + lampiran dokumen** | ❌ Belum | `accounts` hanya 1 `pic_name/phone/email`; tak ada tabel contacts; tak ada attachment (selain PDF quotation). Deal B2B punya >1 PIC. | MUST/NICE |
| **Deal/opportunity terpisah + weighted pipeline + forecast** | ⚠️ Setengah | 1 account = 1 deal (pipeline_stage di account); tak bisa >1 deal/account; tak ada probability per stage/weighted value/forecast. Win/loss reason ADA (WinLossModal). | **MUST** (forecast NICE) |
| **Lead scoring / kualifikasi** | ⚠️ Setengah | BANT scorecard ADA (`bant.js`, `BantScoreBar`). Auto-score lanjutan (engagement/recency) belum. | NICE |
| **Notifikasi & aturan assignment** | ⚠️ Setengah | Auto-assign sales saat create + manual (2.8C) ADA. Round-robin, notifikasi "lead baru di-assign / follow-up due" BELUM. | MUST (notif) / NICE (round-robin) |
| **Reporting** (conversion funnel, sales cycle, win rate, per-stage/per-sales) | ⚠️ Setengah | Dashboard punya win rate, pipeline by stage, lead source, sales performance, prospect trend. BELUM: konversi antar-stage (funnel), sales-cycle length, forecast. | MUST |
| **Bulk action / filter lanjutan / saved view / global search** | ❌ Belum | List hanya filter status/source + search 1-field; tak ada bulk assign/delete, saved view, atau global search lintas modul. | NICE/MUST |

---

## REKOMENDASI DESAIN (Bagian 3)

| Lokasi | "Tell" AI-nya | Rekomendasi konkret (sebelum → sesudah) |
|---|---|---|
| **Seluruh modul CRM** (13 file `const C/D/S={}`) | Tiap halaman punya token sendiri → 13 dialek visual mirip-tapi-beda; ciri khas generator yg meng-output file mandiri. | Satu `lib/tokens.js`: `{ navy:#144682, orange:#E85A1E, cream:#F6EFE3, ink, line, …, radius:{sm:8,md:10,pill:999}, shadow:{card} }`. Semua file import dari sini. |
| **Radius chaos** (CRM pakai 6/7/8/9/10/11/12/14/20/99) | 10 nilai radius berbeda = tidak ada skala; tanda "asal nempel". | Skala 3 nilai: `8` (input/cell), `12` (card), `999` (pill/badge). Ganti semua ke skala ini. |
| **Card + shadow di mana-mana** (55 `boxShadow` di CRM; CRMDashboard penuh `om-card` hover-lift) | Setiap blok dibungkus card ber-shadow + translateY(-3) hover → "dashboard template SaaS", bukan tool operasional. | Kurangi shadow: pakai 1px border `#E8E0D4` + cream surface; shadow hanya untuk overlay/modal. Hover-lift dihapus di tabel/list. |
| **Densitas rendah** (list rows padding besar, `gap-4` seragam) | Halaman CRM operasional terasa lapang seperti landing page; sales butuh banyak baris kelihatan. | Tabel: row height ~36–40px, padding `8px 12px`, font 12.5–13; tampilkan lebih banyak kolom (stage, owner, nilai, last-activity) per layar. |
| **Emoji di UI** — `QuotationListPage.jsx:58` (⏱ SLA), `SalesCallsPage.jsx:474` (✨), `CustomerListPage.jsx:354,616` (✨), `CustomerDetailPage.jsx:478` (✨), `InquiryFormPage.jsx:129` (✨), `QuotationDetailPage.jsx:73` (⚠️), `ProspectFormPage.jsx:396` (⚠️) | Emoji = tanda paling jelas "AI/template"; melanggar brand "NO emoji". | Ganti dengan ikon Lucide: ⏱→`<Clock/>`, ✨ (toast sukses)→`<CheckCircle2/>`, ⚠️→`<AlertTriangle/>`. Warna ikon dari token. |
| **Hijau terlarang** — `CustomerDetailPage.jsx:109`, `CustomerListPage.jsx:94` (`#2F6B3F`) | Warna di luar palet brand (hijau lama). | Ganti ke navy `#144682` / orange `#E85A1E` / token status. |
| **Tabel belum terasa "data table"** (Inquiry/Quotation/Prospect lists) | Tak ada sort kolom, tak ada sticky header, angka (total, nilai) rata kiri. | Header sticky + klik-sort; kolom angka/uang `text-align:right` + `IBM Plex Mono`; zebra/hover halus; badge status konsisten. |
| **Hierarki tombol lemah** | Primary/secondary/ghost tidak dibedakan tegas (banyak tombol mirip). | 3 varian jelas: primary = solid orange `#E85A1E`; secondary = outline navy; ghost = text-only. Satu `<Btn variant>` shared. |
| **Empty state generik** (mis. "Belum ada data") | Microcopy datar, tak membantu. | Spesifik + CTA: "Belum ada prospect di pipeline. **+ Tambah Prospect** atau tarik dari **Lead Pool**." |
| **Tipografi tidak konsisten** (ukuran/weight asal antar file) | Tiap halaman skala font beda. | Skala token: H1 24/800 Montserrat, section 14/700, body 13/500 Inter, angka/kode IBM Plex Mono. |

---

## TOP 10 PALING KRITIS (lintas bagian)

1. **[HIGH] Fallback nomor dokumen diam-diam → nomor rawan tabrakan/non-sekuensial** — `InquiryFormPage.jsx:59`, `QuotationFormPage.jsx:131`.
2. **[HIGH] Dropdown account InquiryForm tanpa `.limit()` (default-10)** — user tak bisa pilih account ke-11+ — `InquiryFormPage.jsx:86,88`.
3. **[HIGH] `inquiries_update` admin-only** — sales tak bisa edit inquiry sendiri — `snapshot:7337`.
4. **[HIGH] Write quotation non-atomik** (korup item/total saat partial-fail) — `QuotationFormPage.jsx:515-532`.
5. **[HIGH] Tidak ada UNIQUE di `accounts`** → duplikat account (Indochem) berulang — `snapshot ~3611` + dedup cuma onBlur.
6. **[HIGH] Visibility tidak role-aware di Inquiry/Quotation/Calls** → super_admin buta lintas-entitas — `InquiryListPage.jsx:159`, `QuotationListPage.jsx:106`.
7. **[HIGH] God-component `CRMDashboardPage.jsx` 1.996 baris / 21 komponen** — `:1431`.
8. **[MEDIUM] Audit trail = 0** untuk account/quotation/inquiry/assignment.
9. **[MEDIUM] `QuotationListPage` tak filter `deleted_at`** → quotation terhapus tetap muncul — `:96-108`.
10. **[MEDIUM] `.single()` rawan throw** di detail/form (payment_terms null dll) — `QuotationDetailPage.jsx:186`, `CustomerDetailPage.jsx:422`.

> Fitur MUST-HAVE yang hilang (task/reminder, timeline nyata, stage-history, merge) bukan "bug" tapi
> **gap produk** — itu yang paling membedakan "demo AI" vs CRM dipakai sales harian.

---

## DAFTAR FIX (CHECKLIST)

### 🔴 SEGERA (correctness/security berisiko)
- [ ] Nomor dokumen: hapus fallback `Date.now().slice(-4)`; gagal RPC → surface error + batalkan simpan (`InquiryFormPage:59`, `QuotationFormPage:131`).
- [ ] `InquiryFormPage:86,88` → tambah `.limit(1000)` pada dropdown account.
- [ ] RLS `inquiries_update` → izinkan creator/manager+/super (samakan `quotations_update` pola 2.8Q). *(DB, butuh approval.)*
- [ ] Role-aware fetch di `InquiryListPage`/`QuotationListPage`/`SalesCallsPage` (super_admin lihat semua entitas).
- [ ] `QuotationListPage` → tambah `.is('deleted_at', null)`.
- [ ] UNIQUE `(company_id, lower(name)) WHERE deleted_at IS NULL` di `accounts` + dedup server-side. *(DB.)*
- [ ] Write quotation → RPC transaksi tunggal. *(DB + frontend.)*

### 🟡 JANGKA PENDEK
- [ ] `.single()` → `.maybeSingle()` di CRM (`QuotationDetailPage:172,186,203`, `CustomerDetailPage:422,426`, `QuotationFormPage:538`, `InquiryFormPage:107`).
- [ ] `catch {}` → log error asli + cek error fallback (`CustomerDetailPage:425`, `CustomerListPage:551`).
- [ ] Optimistic drag → verifikasi count update (Pipeline).
- [ ] Implement `audit_logs` + `logAudit()` untuk create/update/delete/assign/stage-change CRM.
- [ ] Stage history (tabel `account_stage_history` + tulis saat pindah stage) → sales-cycle/aging.
- [ ] Task & reminder follow-up + surfacing "overdue".
- [ ] Desain: hapus emoji (8 lokasi) + hijau terlarang (2 lokasi); satukan `tokens.js`; skala radius 3-nilai.

### 🟢 JANGKA PANJANG
- [ ] Pecah `CRMDashboardPage.jsx` (hook data + komponen chart/modal/calendar terpisah).
- [ ] Ekstrak shared: `useRoleScopedQuery`, `DataTablePage` (sort/sticky/density), `<Btn variant>`, `<Badge>`, `<DataState>`.
- [ ] Timeline interaksi per account (gabung call+visit+stage+quotation).
- [ ] Multi-contact per account + lampiran dokumen.
- [ ] Deal/opportunity terpisah + weighted pipeline + forecast.
- [ ] Reporting: funnel conversion antar-stage, sales-cycle length, win rate per sales.
- [ ] Merge duplikat account (UI + fungsi DB repoint FK).
- [ ] Notifikasi (lead di-assign, follow-up due) + round-robin assignment.
- [ ] Bulk action, saved view, global search.

---

### Lampiran — yang DIPERIKSA & relatif sehat
- RLS `accounts`/`quotations`/`sales_calls`/`sales_visits` role-aware & benar; `quotation_items` DELETE policy ada (fix 2.8J).
- Tidak ada secret hardcoded; tidak ada N+1 parah (pakai PostgREST embed).
- Inquiry/Quotation list pakai server-side pagination (`.range()`).
- BANT scorecard, Win/Loss capture, Pipeline drag-drop + rollback, role-aware Prospects/Pipeline/Dashboard (2.8C) — fondasi yang sudah benar.
