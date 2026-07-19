# AUDIT — Halaman Pipeline & Account (CRM) + Menu Sidebar CRM

**Mode:** AUDIT read-only. Nol perubahan file/kode/DB, nol SQL. Satu-satunya file dibuat: ini.
**Scope:** halaman Pipeline (Kanban), halaman Account (4 tab), definisi menu sidebar CRM. **DI LUAR scope:** Procurement, Inventory, dll.
**Sumber DB:** `supabase/schema_snapshot.sql`.
**Tanggal:** 2026-07-20.
**Atribusi:** semua klaim diverifikasi langsung ke file (baris dikutip). Yang tak ada di kode ditandai **TIDAK DITEMUKAN**. Tak ada angka data live yang dikarang (tak ada akses DB di sesi ini).

---

## RINGKASAN

**Pipeline hari ini adalah SATU papan Kanban akun-sentris, bukan dua, dan bukan inquiry.** Kartu Kanban dirender dari tabel **`accounts`** (bukan `inquiries`) — `PipelineKanbanPage.jsx:462` menarik akun pra-customer (`account_status ∈ {lead, mql, sql, prospect, lead_pool}`) yang **tidak** sedang parkir (`is_in_lead_pool = false`). Tujuh kolom Kanban di-hardcode di array `STAGES` (`:17–25`): New, Contacted, Qualified, Proposal, Negotiation, Won, Lost — **bukan dari DB, bukan config**. Seluruh mesin stage menempel di `accounts`: kolom `pipeline_stage`, skor BANT, `estimated_value`, trigger `set_customer_on_won` + `track_stage_change`, dan Edge Function `aging-pipeline` semuanya beroperasi pada `accounts`. `inquiries` **tidak punya** kolom `pipeline_stage`/BANT/nilai deal sama sekali.

**Duplikasi paling nyata: data akun pra-customer yang sama disajikan lewat TIGA jalan, dengan filter yang tidak identik.** (1) Kanban papan; (2) toggle list di dalam Kanban (`:869–875`, `setView('board'|'list')` — data fetch yang SAMA, dikelompokkan per-stage); (3) tab **Prospects** (`ProspectListPage.jsx`) — tabel ter-paginasi terpisah. Kanban dan Prospects menarik dari tabel & himpunan lifecycle yang **sama**, tapi **Kanban mengecualikan akun parkir** (`is_in_lead_pool=false`, `:467`) sedangkan **Prospects MENYERTAKAN akun parkir** (tak ada filter itu; malah menampilkan badge Lead Pool, `ProspectListPage.jsx:265`). Jadi tab Prospects menampilkan baris yang **tidak ada** di Kanban. Tambah lagi: Kanban **tanpa `.limit()`** (ke-cap diam-diam di 1000 baris default PostgREST), Prospects **ter-paginasi** (`.range()`). Dua jalur "lihat prospect sebagai daftar" yang tak sinkron.

**Yang paling rapuh: `pipeline_stage` ditulis dari banyak tempat berbeda, bukan satu jalur.** Ada jalur tulis bersama `saveDealUpdate` (`DealPanels.jsx:120`, dipakai `CustomerDetailPage`/`DealDetailPage`), TAPI Kanban **melewatinya**: tiga `supabase.from('accounts').update({pipeline_stage})` langsung (`:508` drag, `:605` WON, `:645` LOST), plus `LeadPoolApprovalPage.jsx:126` (approve pull-back), plus `ProspectFormPage.jsx` (create/edit). Audit di-log manual di tiap jalur Kanban (`:511/:616/:649`) — jadi tercatat, tapi lewat kode terduplikasi, bukan satu jalur. Setiap kali logika stage berubah, ada ≥5 tempat yang harus diselaraskan.

**Menu CRM sudah dikonsolidasi jadi 8 item, dan "Account" sudah bertab (4) — jadi framing "8 menu jadi 7" tidak memetakan bersih ke "hapus tab Prospects".** `CRM_MENU_ITEMS` (`App.jsx:461`) = Dashboard · **Account** (4 tab: Pipeline/Prospects/Lead Pool/Approval) · Inquiry · Quotation · Sales Order · Rate List · **Customer** · **Aktivitas** (3 tab). Menghapus tab Prospects mengubah Account dari 4→3 tab tapi **tak mengubah jumlah menu** (tetap 8). Kopling tersembunyi ke id tab ada di `MENU_KEY_MAP` (`:1180–1181`, `crm-pipeline`→`crm_pipeline`, `crm-prospects`→`crm_prospects`) yang menyambung ke izin RBAC di DB — bukan sekadar string UI.

---

## JAWABAN PER PERTANYAAN

### A. KANBAN PIPELINE

**1. File render + definisi kolom Kanban + seluruh nilai kolom.**
File: **`src/modules/crm/PipelineKanbanPage.jsx`** (render block `App.jsx:3218–3229`, di bawah `activeMenu === 'crm-pipeline'`). Kolom di-definisikan sebagai **array hardcoded** `STAGES` (`PipelineKanbanPage.jsx:17–25`) — bukan config, bukan DB. Nilai apa adanya (7 kolom): **`new`** (New, prob 10), **`contacted`** (Contacted, 20), **`qualified`** (Qualified, 40), **`proposal`** (Proposal, 60), **`negotiation`** (Negotiation, 80), **`won`** (Won, 100), **`lost`** (Lost, 0). Catatan: **`NURTURE` BUKAN kolom Kanban** (tak ada di `STAGES`); "nurture" hanya muncul sebagai teks pesan gate BANT (`:1001`) dan sebagai badge status di `ProspectListPage.jsx:37`. Id lowercase; DB menyimpan uppercase (`newStage = stageId.toUpperCase()`, `:491`).

**2. Kolom PROPOSAL: nilai DB + apa yang memindahkan kartu ke sana.**
Nilai DB: `pipeline_stage = 'PROPOSAL'` (uppercase). Tak beda struktural dengan kolom lain — semua nilai string di kolom yang sama `accounts.pipeline_stage`; `PROPOSAL` sekadar `prob:60` di `STAGES`. Yang memindahkan kartu ke PROPOSAL: **drag manual**, dengan **soft-gate**: saat drop ke PROPOSAL, `handleDropStage` (`:553–561`) menjalankan COUNT `inquiries WHERE prospect_id = id`; kalau **0 inquiry**, muncul dialog konfirmasi ("Proposal tanpa inquiry") — user tetap **bisa lanjut** (`handleStageGateConfirm → applyStageMove`). **Tidak ada trigger/RPC/dokumen yang otomatis memindah ke PROPOSAL** — gate hanya MEMERIKSA keberadaan inquiry, tidak dipicu olehnya.

**3. Kartu dirender dari tabel apa + query.**
Dari **`accounts`** (bukan `inquiries`). Query (`PipelineKanbanPage.jsx:461–474`, disingkat kolomnya):
```
supabase.from('accounts')
  .select('id, name, ..., source, pipeline_stage, ..., estimated_value, ..., stage_changed_at, is_in_lead_pool, bant_*, assigned_profile:profiles!prospects_assigned_to_fkey(full_name)')
  .in('account_status', ['lead','mql','sql','prospect','lead_pool'])
  .eq('is_in_lead_pool', false)
  .is('deleted_at', null)
  [if !isAllEntities] .eq('company_id', profile.company_id)
  [if isSalesOnly]    .or('assigned_to.eq.<uid>,created_by.eq.<uid>')
  .order('created_at', { ascending:false })
```
`isAllEntities = ['super_admin']`, `isSalesOnly = ['sales','operations']` (`:415`-area flags). Embed alias `profiles!prospects_assigned_to_fkey` = FK belum di-rename (pola repo).

**4. Angka header "… prospect aktif dalam pipeline" dihitung dari apa?**
Teks di `:766`: `{activeCount} prospect aktif dalam pipeline`. `activeCount` (`:741`) = `filteredDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length`. `filteredDeals` diturunkan dari **`prospects` state = hasil fetch tunggal di #3** (via `deals` map lalu filter klien member/source/type/BANT). Jadi: **angka header dan jumlah kartu berasal dari QUERY YANG SAMA** (satu fetch). **`.limit()`: TIDAK ADA** → ter-cap diam-diam di **1000** (default PostgREST). **Filter `is_in_lead_pool`: YA (`=false`)**, di fetch. Konsekuensi: header menghitung akun aktif = fetch (dikurangi kolom won/lost, lalu filter klien). Bila akun pra-customer >1000, header DAN kartu sama-sama kurang hitung (konsisten, tapi dua-duanya salah). Angka spesifik "147" **TIDAK DAPAT DIVERIFIKASI** (tak ada akses DB).

### B. TAB DI HALAMAN ACCOUNT

**5. Empat tab didefinisikan di mana — satu sumber atau tersebar?**
**Agak tersebar (2 tempat di file yang sama).** (a) Gate tiap tab hidup sebagai **children `crm-account`** di `CRM_MENU_ITEMS` (`App.jsx:471–476`). (b) Urutan & label tab bar hidup di array **`ACCOUNT_TABS`** (`App.jsx:505–510`). Keduanya di `App.jsx`, tapi **dua array berbeda** yang harus dijaga selaras manual (id sama: `crm-pipeline`/`crm-prospects`/`crm-lead-pool`/`crm-lead-pool-approval`). Render: `isAccountTab(activeMenu)` blok `:3206–3270`.

**6. Tab Prospects: tabel/filter/query + apakah SAMA dengan Kanban?**
File `ProspectListPage.jsx`. Query (`:108–134`):
```
.from('accounts').select('... is_in_lead_pool ...')
  .in('account_status', ['lead','mql','sql','prospect','lead_pool'])
  [if !isAllEntities] .eq('company_id', ...)
  [if isSalesOnly]    .or('assigned_to.eq.<uid>,created_by.eq.<uid>')
  .order('created_at', desc)
  .range(page*PAGE_SIZE, ...)              // paginasi server
  [if filterStage] .eq('pipeline_stage', filterStage)
  [if filterSource] .eq('source', filterSource)
```
**BEDA dengan Kanban — bukti, bukan kesan:**
- **Parkir:** Kanban `.eq('is_in_lead_pool', false)` (`Pipeline:467`). Prospects **TIDAK memfilter** `is_in_lead_pool` → **menyertakan akun parkir** (menampilkannya + badge, `ProspectList:265–266`). → Prospects menampilkan baris yang Kanban sembunyikan.
- **Batas:** Kanban tanpa `.limit()` (cap 1000). Prospects `.range()` ter-paginasi.
- **Filter:** Prospects punya dropdown `pipeline_stage` + `source` + search (server-side). Kanban filter di klien (member/source/type/BANT).
- **SAMA:** tabel (`accounts`), himpunan lifecycle (`lead/mql/sql/prospect/lead_pool`), scoping company + isSalesOnly `.or(assigned/created)`. → **~90% populasi sama, disajikan board vs tabel-paged; perbedaan semantik utama = inklusi akun parkir.**

**7. Ikon toggle di kanan atas Kanban — fungsi sebenarnya + beda dengan tab Prospects.**
Fungsi: **toggle tampilan dalam Kanban itu sendiri**, board ↔ list. `PipelineKanbanPage.jsx:869–875`: satu ikon, `onClick={() => setView(v => v === 'board' ? 'list' : 'board')}`, ikon menampilkan tampilan LAWAN (`view==='board' ? 'list' : 'columns'`). List view = `ListGroup` per-stage (`:946+`, `:373–411`) atas **data fetch yang SAMA** dengan papan. **Beda dengan tab Prospects:** (i) list-Kanban dikelompokkan per stage, **tak paginasi** (cap 1000), **mengecualikan parkir**; tab Prospects = tabel datar **ter-paginasi**, **menyertakan parkir**, punya filter stage/source + tombol "Tambah Prospect" (`:3235`) + baris→Detail Account. Jadi **dua "list of prospects" yang berbeda komponen, beda query, beda baris**.

**8. Tab Lead Pool: tabel/filter/query.**
File `LeadPoolPage.jsx`. Query (`:118–125`):
```
.from('accounts').select('id, name, pipeline_stage, lead_pool_reason, lead_pool_at, pull_status, pull_justification, assigned_to, assigned_profile:...')
  .eq('is_in_lead_pool', true)
  [if !isAllEntities] .eq('company_id', ...)
  .order('lead_pool_at', desc).limit(1000)
```
= komplemen Kanban/Prospects: akun **parkir** (`is_in_lead_pool=true`). Sales bisa "Tarik ke Pipeline" → `pull_status='pending'` (`:169–173`).

**9. Tab Approval: isi/tabel/role.**
File `LeadPoolApprovalPage.jsx`. Isi: daftar **request pull** yang menunggu. Query (`:81–87`): `.from('accounts').select('...pull_justification...').eq('pull_status','pending')` [+company scope] `.order('pull_requested_at').limit(1000)`. Approve (`:118–128`) → set `pull_status='approved'`, `is_in_lead_pool=false`, **`pipeline_stage=newStage`**, `stage_changed_at`. Role akses (gate menu, `App.jsx:475`): **`['ceo','gm','gm_bd','manager','supervisor','admin','super_admin']`** + content-gate `canRenderPage('crm-lead-pool-approval')` saat render (`:3260`). Sales/operations **tidak** termasuk.

### C. MENU SIDEBAR

**10. Definisi menu CRM + isi lengkap sekarang.**
Konstanta **`CRM_MENU_ITEMS`** (`App.jsx:461–500`), "single source of truth" yang dirujuk oleh gate-tree (`ERP_MENU_GROUPS` via `findMenuItemById`) DAN sidebar (`NEXUS_NAV` `nav-crm`, `:575` & `:946`). Isi (8 item top-level):
1. `crm-dashboard` — Dashboard
2. **`crm-account` — Account** (children: `crm-pipeline` "Pipeline / Leads", `crm-prospects` "Prospects" [role sa/admin/ceo/gm/manager/sales/operations], `crm-lead-pool` "Lead Pool" [role …/gm_bd/supervisor/sales], `crm-lead-pool-approval` "Approval Lead Pool" [role ceo/gm/gm_bd/manager/supervisor/admin/super_admin])
3. `crm-inquiry` — Inquiry
4. `quotation-draft` — Quotation
5. `crm-sales-order` — Sales Order (role sales/gm_bd/manager/ceo/admin/super_admin)
6. `crm-rate-list` — Rate List (role super_admin/admin/ceo/gm/gm_bd/manager/sales)
7. `crm-customers` — Customer
8. **`crm-aktivitas` — Aktivitas** (children: `crm-calls` Activities, `crm-activity-log` Activity Log, `riwayat-visit` Riwayat Visit [role super_admin/ceo/gm_bd])
Sidebar merender `crm-account` & `crm-aktivitas` sebagai **satu leaf** (special-case `LeafRow`, `:1466`); `activeMenu` tetap = id tab.

**11. Menu Customer vs Account — dua halaman atau satu komponen berfilter?**
**Dua menu berbeda, komponen list berbeda; halaman DETAIL berbagi.**
- **Customer** (`crm-customers`) → **`CustomerListPage`** (`App.jsx:3303`, `import :53`). Populasi = `customer` + `free_agent` (post-customer), dengan filter entitas & status di dalam halaman (Tahap 2a).
- **Account** (`crm-account`, 4 tab) → **komponen berbeda per tab**: `PipelineKanbanPage`, `ProspectListPage`, `LeadPoolPage`, `LeadPoolApprovalPage` (pra-customer/parkir/approval).
- **Detail keduanya = `CustomerDetailPage`** ("Detail Account") via `navigateToCustomerDetail` — jadi list-nya beda, detail-nya satu komponen bersama. "Customer" dan "Account" **bukan** satu komponen berfilter; mereka populasi berbeda (post- vs pra-customer) dengan detail bersama.

**12. Rate List: role + pembaca di luar CRM.**
Role akses menu (`App.jsx:481`): **`['super_admin','admin','ceo','gm','gm_bd','manager','sales']`**. Pembaca tabel `rate_sheets` di seluruh `src/`: **`App.jsx`** (definisi menu/lazy import), **`RateListPage.jsx`**, **`RateSheetPDF.jsx`** — **semuanya di modul CRM**. **Komponen pricing/procurement yang membaca `rate_sheets`: TIDAK DITEMUKAN.** (Rate sheet hanya dibaca di CRM.)

### D. PERPINDAHAN STAGE

**13. SEMUA jalan yang mengubah `pipeline_stage`.**
Tulis langsung ke `accounts.pipeline_stage`:
- **Drag Kanban (non-WON/LOST):** `PipelineKanbanPage.jsx:508` (`applyStageMove` → `.update({pipeline_stage})`).
- **WON (Kanban):** `finalizeWon` `:605` (`.update({pipeline_stage:'WON', account_status:'customer', ...})` `:608`).
- **LOST (Kanban):** `handleWinLossSave` `:644–645` (`.update({pipeline_stage:'LOST', account_status:'lost'})`).
- **Jalur bersama `saveDealUpdate`** (`DealPanels.jsx:120`) dipakai oleh **`CustomerDetailPage.jsx:813/832`** dan **`DealDetailPage.jsx:228`** (Pindah Stage / Edit Deal di halaman Detail Account & Deal Detail).
- **Approve pull-back:** `LeadPoolApprovalPage.jsx:126` (`.update({pipeline_stage:newStage, is_in_lead_pool:false})`).
- **Create/edit prospect:** `ProspectFormPage.jsx:83` (default `'NEW'` saat create), `:202/:206` (win/loss di form).
Trigger DB (BEFORE UPDATE `accounts`): **`trg_z_track_stage_change`** (`schema:7472` → set `stage_changed_at`, tidak mengubah nilai stage) dan **`trg_set_customer_on_won`** (`schema:7388` → saat `pipeline_stage='WON'`, set `account_status='customer'`; **bereaksi** ke stage, tidak menulis stage).
Edge Function: **`aging-pipeline`** (`supabase/functions/aging-pipeline/index.ts`) — membaca `pipeline_stage` untuk menghitung aging (`:49/:61`) tapi **TIDAK menulis `pipeline_stage`**; hanya menyalakan `is_in_lead_pool=true` (`:108–112`, komentar eksplisit "account_status TIDAK BOLEH diubah").
RPC yang menulis `pipeline_stage`: **TIDAK DITEMUKAN** (perpindahan stage lewat `.update` langsung / `saveDealUpdate`, bukan RPC).

**14. Ada perpindahan stage otomatis oleh dokumen (quotation/SO), atau semua manual?**
**Semua maju-stage MANUAL** (drag Kanban atau tombol Pindah Stage di Detail). Gate PROPOSAL/WON hanya **memeriksa** keberadaan inquiry/quotation via COUNT (`Pipeline:554/563`) lalu meminta konfirmasi — **tidak** memindah otomatis saat quotation terkirim / SO dibuat. Satu-satunya otomasi terkait-stage: (a) trigger `set_customer_on_won` mengubah `account_status` (bukan `pipeline_stage`) saat sudah WON; (b) `aging-pipeline` **memarkir** akun stale ke Lead Pool (`is_in_lead_pool=true`) tanpa menyentuh `pipeline_stage`. **Tidak ada** dokumen (quotation/SO) yang memicu perpindahan `pipeline_stage`.

**15. `saveDealUpdate` masih satu-satunya jalur tulis?**
**TIDAK.** `saveDealUpdate` (`DealPanels.jsx:120`) hanya dipakai `CustomerDetailPage` & `DealDetailPage`. **Kanban melewatinya** dengan 3 `.update({pipeline_stage})` langsung (`:508/:605/:645`), dan `LeadPoolApprovalPage.jsx:126` + `ProspectFormPage.jsx` juga menulis langsung. Jadi minimal **5 jalur tulis** `pipeline_stage` berdampingan. Audit tetap tercatat (Kanban `logAudit` manual `:511/:616/:649`), tapi lewat kode terduplikasi, bukan satu pintu.

### E. KESIAPAN UNTUK RANCANGAN BARU

**16. Kalau kartu pipeline diganti akun → inquiry, komponen apa yang harus berubah?**
Perkiraan: **BESAR (skema + ≥5 FE + 2 trigger + 1 Edge Function + RLS).** Alasan: seluruh mesin stage akun-sentris.
- **Skema:** `inquiries` **TIDAK punya** `pipeline_stage`, `estimated_value`, kolom BANT (terverifikasi tabel `inquiries` di snapshot). "Kartu=inquiry" butuh sumbu stage baru pada `inquiries` (kolom + default + CHECK) atau model baru.
- **FE (baca akun):** `PipelineKanbanPage.jsx` (fetch `:462`, kartu `DealCard` pakai field akun: name/customer_type/estimated_value/source/bant_*), ketiga jalur tulis (`:508/605/645`), tiga gate (QUALIFIED=BANT akun `:544`, PROPOSAL=COUNT inquiries by `prospect_id` `:557`, WON=COUNT quotations by `prospect_id` `:566`), `finalizeWon` (konversi akun→customer `:606`), `WinLossModal`, handover gate (pakai `estimated_value` akun `:562`-area).
- **FE terkait:** `ProspectListPage` (tab Prospects, akun pra-customer), `CustomerDetailPage`/`DealDetailPage` + `DealPanels.saveDealUpdate` (stepper stage akun), `LeadPoolPage`/`LeadPoolApprovalPage` (parkir akun), `CRMDashboardPage` (metrik pipeline).
- **DB:** trigger `set_customer_on_won` & `track_stage_change` menempel pada `accounts`; `aging-pipeline` memarkir `accounts`. Semua harus dipikir ulang bila unit pipeline jadi inquiry.
- **RLS:** pipeline saat ini mengandalkan RLS `accounts`; inquiry punya RLS sendiri (owner-scoped `created_by`) — himpunan pembaca berbeda.

**17. Kalau tab Prospects dihapus & diganti filter lifecycle di Account, ada fitur yang hilang?**
Yang **HANYA** ada di tab Prospects (`ProspectListPage.jsx`) dan tak ada di tempat lain apa adanya:
- **Paginasi server** (`.range()` `:131`) atas akun pra-customer — Kanban tak paginasi (cap 1000), Kanban list-toggle juga tak paginasi.
- **Tabel datar yang MENYERTAKAN akun parkir** (badge Lead Pool `:265`) — Kanban & list-toggle mengecualikan parkir; Lead Pool tab hanya menampilkan yang parkir. Tak ada tampilan lain yang mencampur parkir+non-parkir dalam satu daftar.
- **Filter `pipeline_stage` + `source` (dropdown, server-side)** + search — Kanban filter klien (member/source/type/BANT), beda sumbu.
- **Entry "Tambah Prospect"** → `ProspectFormPage` (`:3235`, `:3242`). Catatan: `ProspectFormPage` **hanya dirender di bawah `activeMenu==='crm-prospects'`** (`:3242`); walau Kanban menerima prop `setShowProspectForm` (`:3224`), formnya tak akan tampil saat `activeMenu==='crm-pipeline'` (guard tab). Jadi **satu-satunya jalan masuk form Prospect = tab Prospects** → menghapus tab tanpa memindah entry = kehilangan pembuatan prospect manual.
Catatan: Kanban **tidak** punya filter lifecycle (`account_status`) — ia mencampur lead/mql/sql/prospect tanpa memilah. "Filter lifecycle di Account" = **UI BARU**, bukan sekadar memindah yang sudah ada.

**18. Dependency tersembunyi ke nama tab/menu.**
- **`MENU_KEY_MAP`** (`App.jsx:1180–1181`): `crm-pipeline → crm_pipeline`, `crm-prospects → crm_prospects`. Kunci ini dipakai `hasMenuPermission` → tabel DB `user_menu_permissions`/`module_menus` (RBAC). **Mengganti/menghapus id tab tanpa menyelaraskan MENU_KEY_MAP + seed DB akan memutus resolusi izin.** (Lead Pool/Approval pakai gate `role[]` inline, tanpa menuKey.)
- **`canRenderPage('crm-lead-pool-approval')`** content-gate (`:3260`) + `canSeeMenuItem` per tab di tab bar (`:3211–3212`).
- **`isAccountTab(activeMenu)`** (`:512`, `:3206`) — seluruh routing tab bergantung id tab persis; `activeMenu` MENYIMPAN id tab (bukan `crm-account`).
- **Notifikasi bell:** `reference_type==='lead_pool' → 'crm-lead-pool'` (`App.jsx:1944`). String hardcoded.
- **Normalisasi localStorage last-menu:** untuk `crm-customers-*` (`:2060`) — pola yang sama akan perlu bila id tab berubah (deep-link/last-menu basi).
- **RLS/DB menyebut nama menu:** **TIDAK DITEMUKAN** — grep `crm-pipeline`/`crm-prospects`/`Pipeline`/`menu_key` di `schema_snapshot.sql` **kosong**. RLS memakai `roles`/fungsi, bukan nama menu. (Kopling DB hanya via `module_menus.menu_key` = `crm_pipeline`/`crm_prospects` yang dipetakan `MENU_KEY_MAP`, bukan literal id tab.)

---

## DUPLIKASI YANG DITEMUKAN

| # | Data sama | Jalan 1 | Jalan 2 | Beda kunci |
|---|-----------|---------|---------|-----------|
| D-1 | Akun pra-customer (non-parkir) sebagai daftar | Kanban **list-toggle** (`Pipeline:869–875/946+`) | tab **Prospects** (`ProspectListPage`) | list-toggle: grouped-by-stage, cap 1000, **tanpa** parkir. Prospects: tabel paged, **dengan** parkir. Beda baris. |
| D-2 | Akun pra-customer sebagai koleksi | Kanban **papan** (`accounts` `:462`, `is_in_lead_pool=false`) | tab **Prospects** (`accounts` `:108`, **tanpa** filter parkir) | Prospects menyertakan akun parkir yang tak muncul di papan. |
| D-3 | Hitungan "prospect aktif" | header Kanban `activeCount` (`:741/766`, dari fetch, cap 1000) | (kartu di kolom, fetch sama) | sumber sama; risiko sama-salah bila >1000 (bukan dua query berbeda — konsisten, tapi tanpa guard limit). |
| D-4 | Tulis `pipeline_stage` | `saveDealUpdate` (`DealPanels:120`) | 3× `.update` langsung Kanban (`:508/605/645`) + `LeadPoolApproval:126` + `ProspectForm` | logika stage terduplikasi di ≥5 tempat; audit di-log manual per tempat. |

---

## TEMUAN & RISIKO

| ID | Severity | Temuan |
|----|----------|--------|
| **M-1** | **MEDIUM** | **Kanban fetch tanpa `.limit()` → cap diam-diam 1000** (`PipelineKanbanPage.jsx:461–474`). Header `activeCount` (`:741`) & kartu sama-sama dari fetch ini. Bila akun pra-customer >1000 (per company, atau lintas-entitas utk super_admin), papan + header undercount tanpa peringatan. Belum kena hari ini (data kecil, tak terverifikasi), tapi tak ada guard. |
| **M-2** | **MEDIUM** | **Tab Prospects vs Kanban tidak sinkron soal akun parkir.** Prospects menyertakan `is_in_lead_pool=true` (`ProspectList:108/265`), Kanban mengecualikannya (`Pipeline:467`). Akun bisa "hilang dari papan tapi ada di Prospects" — membingungkan; keduanya mengaku daftar prospect yang sama. |
| **M-3** | **MEDIUM** | **Tiga tampilan daftar tumpang-tindih** (Kanban board, Kanban list-toggle, Prospects tab) dengan query & filter berbeda (D-1/D-2). Beban perawatan + potensi angka berbeda antar layar untuk "prospect yang sama". |
| **M-4** | **MEDIUM** | **`pipeline_stage` ditulis dari ≥5 jalur** (`saveDealUpdate` + 3 direct Kanban + Approval + ProspectForm; T-13/15). Perubahan aturan stage harus diselaraskan di banyak tempat; risiko drift (mis. satu jalur lupa langkah). Termitigasi sebagian oleh trigger DB (`track_stage_change`, `set_customer_on_won`) yang jalan apa pun jalurnya. |
| **M-5** | **MEDIUM** | **Kopling id tab → RBAC DB.** `MENU_KEY_MAP` (`:1180–1181`) menyambung `crm-pipeline`/`crm-prospects` ke `module_menus.menu_key` DB. Mengganti/menghapus id tab tanpa sinkron DB memutus `hasMenuPermission`. (Lead Pool/Approval pakai role[] inline, tak kena.) |
| **L-6** | **LOW** | **Dua definisi tab paralel** (`CRM_MENU_ITEMS.children` gate `:471` vs `ACCOUNT_TABS` label/urutan `:505`) harus dijaga selaras manual — id kembar di dua array. Kosmetik/maintenance. |
| **L-7** | **LOW** | **Entry pembuatan Prospect terkunci ke tab Prospects.** `ProspectFormPage` hanya dirender di `crm-prospects` (`:3242`); prop `setShowProspectForm` yang diberikan ke Kanban (`:3224`) tak menghasilkan form saat di tab Pipeline (guard). Relevan untuk keputusan hapus-tab (T-17). |
| **INFO** | — | **Semua maju-stage manual; tak ada otomasi dokumen→stage** (T-14). `NURTURE` bukan kolom Kanban (hanya badge di ProspectList + teks gate). Bukan bug — konteks untuk rancangan. |

*Tak ada temuan CRITICAL/HIGH: tak ada kebocoran data, breach, atau korupsi pasti yang teridentifikasi dalam scope ini. M-1 & M-2 adalah risiko latent/konsistensi, bukan kerusakan aktif.*

---

## DAMPAK KE RANCANGAN

Bagian rancangan yang **TIDAK cocok** dengan keadaan kode sekarang, beserta alasan faktual (tanpa rekomendasi — keputusan di tanganmu):

- **"Dua pipeline".** Sekarang **hanya SATU** pipeline: Kanban akun-sentris tunggal (`STAGES` hardcoded `:17`, satu fetch `accounts` `:462`). Tak ada papan/sumbu kedua di kode. "Dua pipeline" = pembangunan baru, bukan pemekaran yang ada.
- **"Kartu = inquiry".** Berbenturan dengan fakta bahwa **`pipeline_stage`, BANT, `estimated_value`, trigger `set_customer_on_won`/`track_stage_change`, dan `aging-pipeline` semuanya menempel di `accounts`**, sedangkan `inquiries` tak punya kolom stage sama sekali. Mengubah unit kartu jadi inquiry = perubahan skema + ≥5 komponen FE + 2 trigger + 1 Edge Function + pertimbangan RLS (T-16). Ini bukan penggantian sumber data yang setara; mesin stage-nya harus dipindah/diduplikasi ke inquiry.
- **"Prospects jadi filter lifecycle di Account".** Sebagian selaras (Prospects & Kanban ~90% data sama), TAPI: (i) yang HANYA ada di Prospects — paginasi server, tabel yang menyertakan akun parkir, filter stage/source, entry Tambah Prospect — akan hilang kecuali dipindah (T-17); (ii) Kanban **belum punya** filter `account_status` (lifecycle) — "filter lifecycle" adalah UI baru, bukan relokasi; (iii) inklusi-parkir yang beda (M-2) harus diputuskan (papan mengecualikan, Prospects menyertakan).
- **"Menu 8 jadi 7".** Framing ini **tidak memetakan** ke "hapus tab Prospects": tab bukan menu. `CRM_MENU_ITEMS` sudah 8 item top-level, dan **Account sudah menampung 4 tab** (`:471`), Aktivitas 3 tab (`:495`). Menghapus tab Prospects → Account jadi 3 tab, **jumlah menu tetap 8**. Untuk benar-benar "8→7" harus menghapus/menggabung **menu top-level** (mis. Account+Customer, atau lainnya) — keputusan berbeda dari sekadar mengubah tab, dan menyentuh kopling `MENU_KEY_MAP`/RBAC (M-5).

---

*Audit murni observasi. Tidak ada file lain disentuh, tidak ada SQL dijalankan. Angka data live (mis. "147 prospect", jumlah akun >1000) tidak dapat diverifikasi di sesi ini dan tidak dikarang. `AUDIT_CRM_FLOW.md` dirujuk oleh komentar kode tapi tidak dibuka di audit ini (di luar kebutuhan pertanyaan).*
