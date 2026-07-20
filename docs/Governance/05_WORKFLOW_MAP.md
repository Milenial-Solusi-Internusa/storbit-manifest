# WORKFLOW MAP — Nexus by MSI

> Alur bisnis per modul live. Sumber: `CLAUDE.md` (CRM Flow, phase notes), `docs/03_DATA_MODEL.md`. Notasi: **[role]** = pelaku, **⚙** = trigger/otomatis DB.
>
> **Diperbarui 2026-07-20 (PRF Pricing Answer — jawaban harga procurement dgn cost build-up per komponen, branch `feat/prf-pricing-answer`) — +langkah "Procurement isi Jawaban Harga" di flow PRF.** Halaman detail PRF baru (`PRFDetailPage`) dibuka dari list "Forwarding (MSI)" (baris jadi klik-able) → panel **"Jawaban Harga"**: tabel rincian biaya (`prf_cost_items`, per komponen vendor/internal) → Total Modal → Harga Jual (`suggested_rate`) → Untung & Margin % (**dihitung saat render, tak disimpan**). Simpan via **RPC atomik `save_prf_pricing`** (SECURITY INVOKER, satu transaksi: UPDATE header + replace rincian; `answered_by`=server `auth.uid()`) — menggantikan 3 request client non-atomik. **Menyimpan jawaban TIDAK mengubah `prf.status`** → procurement bisa koreksi ulang selama `SUBMITTED`. Edit hanya `procurement`/`super_admin` (cermin RLS `prf_update_status`); sales/manager = LIHAT saja. **DUA SQL DIJALANKAN MANUAL berurutan** (`20260720000000` kolom+tabel+RLS, lalu `20260720000001` RPC) — snapshot stale. → `03_DATA_MODEL` (`prf` +7 kolom, `prf_cost_items`) + `08_TECH_DEBT` TD-109.
> Sebelumnya **2026-07-19 (Pindah gate Edit Inquiry `canRenderPage('crm-inquiry')` → `hasMenuPermission('crm_inquiry','view')` di Detail Account, branch `main` working tree, NOL perubahan DB/RLS/menu — FE-only 1 file `App.jsx` 1 baris).** Gate tombol **Edit Inquiry** (tab Riwayat Detail Account) dipindah ke `hasMenuPermission('crm_inquiry','view')` — himpunan role IDENTIK (untuk kasus id menu ADA, `canRenderPage`→`canSeeMenuItem` short-circuit menuKey→`hasMenuPermission`; terverifikasi ke kode, bukan runtime), tapi gate baru **tak bergantung pohon menu** → memenuhi prasyarat Task 4/5 pensiun `DealDetailPage` (boleh memangkas id menu `'crm-inquiry'` tanpa membocorkan gate). `canRenderPage` sendiri tak diubah → **TD-103 tetap OPEN**. → `08_TECH_DEBT` TD-98 (prasyarat DIPENUHI) + TD-103.
> Sebelumnya **2026-07-19 (Tutup TD-98 (a) Lihat Quotation + (c) Cetak PRF di Detail Account, branch `main` working tree, NOL perubahan DB/RLS/menu — FE-only 2 file).** Tab **Riwayat** Detail Account kini punya **Eye per-baris quotation** (tabel nested per-inquiry + sub-tabel orphan) → `QuotationDetailPage` (jalur terpisah `App.customerQuotationView`) DAN **Cetak PRF per-baris inquiry** → `PRFFormPage` prefill (jalur terpisah `App.customerPrfInquiryId`, gate `['sales','gm_bd'].includes(erpRole)` DISALIN dari `DealDetailPage.jsx:373`). Keduanya balik (simpan/lihat selesai) → clear state → Detail Account remount tab Riwayat. Jalur Lihat/Cetak ini **BERDAMPINGAN** dengan `DealDetailPage` yang **MASIH HIDUP** (bukan pensiun). Menutup TD-98 item (a)+(c); item (b) Buat Quotation & (e) Summary Harga = WON'T-DO → **TD-98 PRAKTIS TUNTAS**. ⚠️ gate Cetak PRF pakai `erpRole` (role primer saja) → user multi-role bisa kehilangan hak (`08_TECH_DEBT` TD-105/TD-106). → `08_TECH_DEBT` TD-98 + `AUDIT_TD98.md`.
> Sebelumnya **2026-07-19 (Restruktur detail CRM — batch "Edit Inquiry ke Detail Account", branch `feat/crm-edit-inquiry-cdp`, NOL perubahan DB/RLS/menu — FE-only).** Tab **Riwayat** Detail Account kini punya tombol **Edit Inquiry per-baris** (→ `InquiryFormPage mode="edit"`) — jalur InquiryForm edit **KE-2**, BERDAMPINGAN dengan jalur `DealDetailPage` yang **MASIH HIDUP** (bukan pensiun). Tombol di-gate `canRenderPage('crm-inquiry')` (hilang untuk role tanpa hak menu Inquiry). Sepulang edit, Detail Account kembali ke tab Riwayat + re-fetch → perubahan langsung terlihat (bukan ke daftar Inquiry / layar kosong). Menutup TD-98 item (d). → `08_TECH_DEBT` TD-98/TD-99 + `AUDIT_TD98.md`.
> Sebelumnya **2026-07-19 (Restruktur detail CRM — TAHAP 3b, branch `feat/crm-detail-tahap3b`, NOL perubahan DB/RLS/menu/gate) — +subsection "Halaman Detail Account — jalan masuk".** Halaman **Detail Account** (`CustomerDetailPage`) kini punya JALAN MASUK BARU dari daftar **Prospects** (klik baris) DAN dari **Pipeline Kanban** (klik kartu / baris list-view) — selain dari daftar **Customer** yang sudah ada. Back-button kembali ke asal (Prospects→Prospects, Pipeline→Pipeline, Customer→Customer) via `prevCustomerMenu`/`backFromCustomerDetail`. **DealDetailPage TETAP HIDUP** (tetap terjangkau dari daftar Inquiry) — untuk sementara Detail Account & DealDetailPage sama-sama menampilkan riwayat akun (DISENGAJA, untuk perbandingan sebelum yang lama dimatikan di tahap berikutnya). ⚠️ Prasyarat pensiun DealDetailPage (5 kapabilitas belum ada padanan di Detail Account) → `08_TECH_DEBT` **TD-98**.
> Sebelumnya **2026-07-18 (UI entitas SO — Sales Order, dokumen perintah kerja Sales → Procurement) — +section "Sales → SO → Procurement".** SO dibuat manual oleh sales dari inquiry (account diturunkan otomatis), Sign by Customer (link), Kirim ke Procurement (SENT), procurement terima read-only. SO **menunjuk** history quotation/PRF via `inquiry_id` (bukan salinan). Satu inquiry satu SO. NOL perubahan DB (tabel `sales_orders` sudah dibuat + direkam `20260718000000_sales_orders.sql` + masuk snapshot). ⚠️ Known limitation v1: History Quotation bisa kosong di sisi procurement karena RLS `quotations_read` tak memuat `procurement` (bukan bug data) → `08_TECH_DEBT` TD-90. Belum tes runtime.
> Sebelumnya **2026-07-10 (peluncuran aging-pipeline, pagi) — section Aging Pipeline: LIVE + terjadwal.** Filter per-entitas via `companies.aging_enabled` (hanya MSI); pg_cron harian 01:00 WIB (Vault key); verify_jwt beres (TD-60 DONE); dry_run pasca-filter 469 diperiksa / 304 memenuhi. + KONTEKS ADOPSI sebaran pencatatan sales (bukan kinerja). Sebelumnya (audit CRM E2E): koreksi mesin status QUOTATION (DRAFT→SUBMITTED→SENT) + struktur pipeline (tabel `accounts`, tak ada `deals`) + trigger `trg_z_sync_last_activity`. Alur SP 12 tahap FASE 0-3 (mesin status `sp_orders.status` via `sp_recompute_status`, LIVE s/d BTB_TERBIT). Bagian non-CRM/non-SP belum ditinjau ulang.

---

## CRM / Sales Flow

```
Lead Pool ──┐
            ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ ACCOUNTS (master customer tunggal — account_status menentukan tahap) │
   └─────────────────────────────────────────────────────────────────┘
            ▼
 [Sales/BD] buat Prospect  →  account_status = 'prospect'
            │  (auto-assign ke sales pembuat; BANT scorecard; dup-check nama)
            ▼
 PIPELINE (drag Kanban / edit form) — pipeline_stage:
   NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST
            │
            │  soft-gate (konfirmasi, bukan blok):
            │    • → PROPOSAL  : disarankan sudah ada Inquiry
            │    • → WON       : disarankan sudah ada Quotation
            ▼
 [Sales] buat INQUIRY  (inquiry_no, service_type, route, commodity)  →  prospect_id → accounts
            ▼
 [Sales] buat QUOTATION dari Inquiry  (quotation_no, items per-section, currency, discount, VAT)
            │   status: DRAFT → SUBMITTED → SENT (Kirim ke Customer, ⚙ quote_sent_at)
            │            ACCEPTED / REJECTED / EXPIRED = label display, TANPA transisi UI (lihat catatan)
            │   SLA dihitung pricing_done_at → quote_sent_at (target per service_type)
            │   simpan via RPC save_quotation (atomik); PDF via @react-pdf/renderer
            ▼
 Pindah ke WON  ──⚙ trigger trg_set_customer_on_won──►  account_status = 'customer'
            │                                            became_customer_at + converted_at di-stamp
            │                                            ⚙ trg_z_gen_customer_code_upd → generate code customer
            ▼
 MASTER CUSTOMER  (account_status='customer') — health score, history, dst.
```

**Status transisi & pelaku:**
- **Prospect → stage**: [sales] drag Kanban / edit form. Manager+ bisa semua; sales hanya miliknya (RLS).
- **WON → customer**: **otomatis DB** (`trg_set_customer_on_won`, BEFORE INSERT OR UPDATE) — sumber kebenaran tunggal; menutup semua jalur (drag/edit/import). Frontend `WinLossModal` collect alasan WON/LOST (redundan tapi dipertahankan).
- **LOST**: account_status='lost' + lost_reason (kategori).
- **Lead Pool** (penanda parkir = **`is_in_lead_pool=true` SAJA**; nilai `account_status='lead_pool'` DIHAPUS dari kosakata lifecycle — TD-50 **SUPERSEDED** 18 Jul, lihat TD-91): arsip lead → [sales] "Tarik ke Pipeline" → butuh approval → `is_in_lead_pool=false` (account_status **tetap** lifecycle asli akun, TIDAK dipaksa prospect). ⚠️ **479 baris pool (per 10 Jul pagi) seluruhnya hasil migrasi 13 Jun 2026 18:59:03** (satu timestamp, `lead_pool_reason='Migrasi dari sistem lama'`) — belum ada baris "Aging N hari di stage X" sampai cron nyala. **Sejak 11 Jul cron aging berjalan** → pool tumbuh via aging (lihat "Aging Pipeline" di bawah; dampak malam pertama 479 → 783).
- **Activities** (call/visit/meeting/email/WA/followup): [sales] catat; status todo→done/cancelled; tiap transisi tulis `activity_logs` (feed). Convert-to-prospect dari activity tanpa account.

**Mesin status QUOTATION (terverifikasi kode):**
- **DRAFT → SUBMITTED**: [sales] tombol **"Submit Quotation"** (`QuotationFormPage.jsx:730,790`, `status='SUBMITTED'`). Tombol **disabled sampai `inquiry_id` terisi** — HARD gate **ketertautan inquiry** (bukan gate diskon/margin). Simpan Draft = `status='DRAFT'`.
- **SUBMITTED → SENT**: [sales] tombol **"Kirim ke Customer"** (`QuotationDetailPage.jsx:258`, `status='SENT'` + ⚙ `quote_sent_at`); tombol muncul saat `status='SUBMITTED'`.
- **ACCEPTED / REJECTED / EXPIRED** = **label display saja, TANPA transisi UI** — tak ada aksi/tombol yang menulis status ini (nol baris ACCEPTED di DB). ⚠️ Konsekuensi: trigger `sync_deal_value_on_quotation_accept` (nyala hanya saat ACCEPTED) **tak pernah jalan** → 88% deal WON `estimated_value` kosong (lihat `08_TECH_DEBT.md` **TD-54**).

**Dokumen CRM: NOL PDF dipersist (terverifikasi kode):**
- **Tidak ada satu pun dokumen/PDF CRM yang disimpan.** Semua PDF (Quotation Letter, Inquiry, Rate Sheet, Activity Report, Visit History) di-generate **di browser** via `@react-pdf/renderer` lalu di-**download sebagai blob** — **nol `storage.upload`/`storage.from` di `src/modules/crm/`**; tak ada kolom path/URL PDF di `quotations`/`inquiries`.
- Bukan "Storage belum ada": Storage **dipakai** modul lain (`UserEditPage`, `EntitySettingsPage`, `MyProfilePage` → avatars/logo). CRM memang tak pernah menyimpan dokumen.
- Yang tersimpan ke DB hanya **record terstruktur** (baris + `activity_logs`/`audit_logs`), **bukan dokumennya**.
- ⚠️ Konsekuensi: **tak ada arsip dokumen yang dikirim ke customer**, dan **upload MOU belum mungkin** (butuh desain penyimpanan dokumen dulu — backlog).

**Struktur pipeline (koreksi — TIDAK ada tabel `deals`/`pipeline`):**
- Pipeline = tabel **`accounts`**, kolom **`pipeline_stage`**. Nilai deal disimpan di **`accounts.estimated_value`** (BUKAN `deal_value`).
- Trigger di `accounts`: `trg_set_customer_on_won` (WON → customer) + `trg_z_track_stage_change` (log perubahan stage → `activity_logs`). Trigger di `quotations`: `trg_z_sync_deal_value_on_quotation_accept` (quotation ACCEPTED → `accounts.estimated_value`; lihat catatan TD-54 di atas).
- **`set_customer_on_won` terbukti sehat** (audit 10 Jul): 33 WON, nol `account_status` bukan 'customer', nol `became_customer_at` NULL.

**Trigger otomatis terkait:**
- `trg_set_customer_on_won` — WON → customer.
- `trg_z_gen_customer_code_upd` / `trg_gen_customer_code_ins` — generate `code` customer (prefix entity + `/CUST/` + tahun + romawi) saat jadi customer & code kosong (guard `deleted_at IS NULL`).
- `trg_z_track_stage_change` — log perubahan `pipeline_stage` ke `activity_logs`.
- `trg_z_sync_last_activity` [BARU 10 Jul] — sinkron `accounts.last_activity_at` dari tabel `activities` (AFTER INSERT/UPDATE/DELETE) = `max(COALESCE(completed_at, created_at))`. Menggantikan penulisan sekali-saat-buat yang tak jujur (lihat TD-52/TD-59).
- `capture_login_session()` — catat login ke `user_login_logs` (sumber feed "Login").

**Gate & Approval (pipeline / WON / lead pool)** — terverifikasi di kode (`PipelineKanbanPage.jsx`, dll):
- **CONTACTED → QUALIFIED — BANT gate:** saat drag ke Qualified, hitung skor BANT (0-12): **<5 = BLOK total** (toast, batal — tak bisa lanjut) · **5-7 = ConfirmModal** (soft, boleh lanjut) · **≥8 = lolos** langsung.
- **→ PROPOSAL / → WON — soft gate:** PROPOSAL tanpa Inquiry / WON tanpa Quotation → ConfirmModal (boleh lanjut). *(lihat juga catatan soft-gate di diagram atas)*
- **WON → Handover — HARD gate by nilai deal:** `estimated_value` **≤ Rp100jt → Light Handover** / **> Rp100jt → Strategic Handover**; WON resmi (`finalizeWon`: convert ke customer) **hanya jalan setelah** form handover tersimpan (`deal_handovers`).
- **Lead Pool → Pipeline — HARD (butuh approval):** [sales] "Tarik ke Pipeline" → `pull_status='pending'` → [manager/supervisor/admin] **approve** (Approval Lead Pool) → balik ke pipeline stage sebelumnya. Reject → tetap di pool.
- **Akun Lead Pool tak boleh dipakai untuk dokumen/aktivitas baru — GATE (FE, 18 Jul 2026):** akun yang sedang parkir (`is_in_lead_pool=true`) **TIDAK bisa dipilih** di picker manapun untuk **membuat/mengaitkan** dokumen/aktivitas baru — harus **ditarik dulu** dari Lead Pool via approval (bullet di atas) → `is_in_lead_pool=false` → baru bisa dikerjakan. Prinsip **dua sumbu**: **(1) TEMPAT AKSI** (picker/dropdown create/link) **WAJIB** filter `is_in_lead_pool=false`; **(2) DAFTAR BACA** (list/tabel/dashboard/laporan) **TIDAK** difilter — akun parkir tetap tampil dengan badge Lead Pool; halaman Lead Pool & Approval Lead Pool memang menampilkan akun parkir (tak disentuh). Diterapkan FE di **5 picker akun**: `InquiryFormPage` (prospect + customer), `PRFFormPage` (customer + prospect), `SalesCallsPage`, `ActivitiesPage` (2 select), `CRMDashboardPage` (AddVisit) — masing-masing + empty-state "Semua akun sedang di Lead Pool — tarik dari Lead Pool dulu untuk memakainya." **Edit-mode** menyuntik ulang akun yang sudah tertaut (walau kini parkir) supaya relasi lama tak hilang (`InquiryForm` sudah punya via fetch-by-id; `SalesCalls`/`Activities`/`CRMDashboard-visit` +param `injectAccount`; `PRF` create-only → tak perlu). **Sengaja TIDAK difilter** (akun **diwarisi lewat inquiry**, bukan dipilih langsung — inquiry itu gerbangnya): picker INQUIRY di `QuotationFormPage`/`SalesOrderDocFormPage`, PRF `source='inquiry'`, dan `db.js:listCustomers` (customer-only SP/AR logistics — customer praktis tak parkir, keputusan sadar). **Keputusan user:** filter diterapkan ke SEMUA picker termasuk customer-side (walau customer praktis tak pernah parkir) — aturan seragam lebih tahan lama daripada mengandalkan asumsi perilaku cron; tak ada constraint struktural yang mencegah `customer` punya `is_in_lead_pool=true`. Konsisten dgn Kanban (sudah filter `is_in_lead_pool=false`). Detail: `08_TECH_DEBT.md` **TD-91**.
- **Lifecycle → prospect — GERBANG DB (HARD, LIVE 18 Jul 2026):** akun `account_status` = sumbu **lifecycle** (`lead`/`mql`/`sql`/`prospect`/`customer`/`free_agent`/`lost`, dikunci CHECK `accounts_account_status_check`). Akun jadi **`prospect` hanya bila ada inquiry masuk** — **inquiry = gerbangnya**. Promosi `lead/mql/sql → prospect` ditangani **TRIGGER DB** `trg_set_prospect_on_inquiry` (fungsi `set_prospect_on_inquiry()`, SECURITY DEFINER) `AFTER INSERT ON inquiries`, **BUKAN kode FE**; guard `account_status IN ('lead','mql','sql')` → tak menurunkan customer/prospect (InquiryForm menaruh akun di `prospect_id`). Akun baru **lahir `'lead'`** (default kolom). Nilai `'lead_pool'` **sudah tak ada di data** (penanda parkir = `is_in_lead_pool` saja). Detail: `03_DATA_MODEL` entri `accounts` + `08_TECH_DEBT` **TD-91** + migrasi `20260718000001_lifecycle_split_fase2.sql`.
- **TOP Request — soft:** [sales/manager] ajukan Terms of Payment → insert `top_requests` status='submitted' → approval finance (proses downstream, di luar FE).
- **MOM approval — HARD:** MOM `submitted` → [CEO/admin] **approve/reject** (MOMDetailPage).

**Halaman Detail Account (`CustomerDetailPage`) — jalan masuk & status (Tahap 3a/3b, 19 Jul 2026):**
- **3 jalan masuk** ke Detail Account (semua via `navigateToCustomerDetail(id)` di `App.jsx`): (1) daftar **Customer** (klik baris — lama); (2) daftar **Prospects** (klik baris → **BARU 3b**, dulu buka form edit prospect); (3) **Pipeline Kanban** (klik kartu / baris list-view → **BARU 3b**, dulu buka `ProspectDetailModal` in-page). Karena Prospects & Pipeline kini tab di menu "Account" (Tahap 2b), Detail Account jadi tujuan detail bersama untuk lead→customer.
- **Back-button** kembali ke ASAL: `navigateToCustomerDetail` menyimpan `activeMenu` ke `prevCustomerMenu`; `backFromCustomerDetail` mengembalikannya → Prospects→tab Prospects, Pipeline→tab Pipeline, Customer→Customer.
- **Edit prospect** tetap tersedia lewat tombol Edit di Detail Account (pola sama daftar Customer) — bukan lagi klik baris. Guard klik-vs-drag di Kanban (`isDragging` ref pada `DealCard`) DIPERTAHANKAN → drag antar-stage tak terbawa jadi buka detail.
- **Dead-code cleanup 3b:** `ProspectDetailModal` (+helper eksklusif `Field`/`Section`/`STAGE_BADGE`/import `BantScoreBar` + state `detailDeal`) DIHAPUS dari `PipelineKanbanPage` karena tergantikan Detail Account.
- **Tab "Riwayat" Detail Account — detail permintaan inquiry (BARU 3b):** saat baris inquiry di-expand, tampil blok **"Detail Permintaan"** (incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, additional_services, deadline_quote, route, commodity, notes) DI ATAS daftar quotation; field kosong disaring. Query `histInquiries` diperluas untuk field ini (tetap **lazy** — hanya saat tab Riwayat dibuka).
- **Tab "Riwayat" Detail Account — Edit Inquiry per-baris (BARU, batch "Edit Inquiry ke Detail Account", 19 Jul 2026):** tiap baris inquiry punya tombol **Edit Inquiry** (di area aksi baris, di luar blok expand) → membuka `InquiryFormPage mode="edit"` (jalur TERPISAH dari `DealDetailPage`, state `App.customerInquiryEdit`). Ini jalur InquiryForm edit **KE-2**, berdampingan dgn jalur `DealDetailPage` (tombol Edit Inquiry di Detail Inquiry) yang **MASIH HIDUP** — bukan pengganti. **Gate:** App hanya passing `onEditInquiry` bila `hasMenuPermission('crm_inquiry','view')` → tombol hilang untuk role tanpa hak menu Inquiry (himpunan role PERSIS = menu crm-inquiry; menjamin tak ada role dapat hak mutasi inquiry baru). **[19 Jul 2026 — gate dipindah dari `canRenderPage('crm-inquiry')`; himpunan role identik, tapi gate baru tak bergantung pohon menu → memenuhi prasyarat Task 4/5, `08_TECH_DEBT` TD-98/TD-103.]** Sepulang edit (simpan ATAU batal, InquiryForm panggil `onBack` di keduanya) → CustomerDetailPage remount di tab Riwayat + re-fetch (perubahan langsung terlihat). Baris tampil juga **badge status inquiry** (`INQ_STATUS_TONE`, replika `InquiryListPage.STATUS_META` — **TD-99**). Detail: `08_TECH_DEBT` **TD-98** (item d RESOLVED) + `AUDIT_TD98.md`.
- **Tab "Riwayat" Detail Account — Lihat Quotation + Cetak PRF per-baris (BARU, batch "Lihat Quotation + Cetak PRF di Detail Account", 19 Jul 2026):** (a) tiap baris quotation (tabel nested per-inquiry **DAN** sub-tabel orphan "Quotation tanpa inquiry") punya tombol **Eye** → `QuotationDetailPage` via jalur TERPISAH `App.customerQuotationView` (bukan `crmDealInquiry`/DDP); dari Quotation Detail bisa Edit/Duplicate (perilaku DISALIN verbatim dari jalur `quotation-draft` lama + `setActiveMenu('quotation-draft')`). (b) tiap baris inquiry punya tombol **Cetak PRF** → `PRFFormPage` prefill via jalur TERPISAH `App.customerPrfInquiryId`; **gate `['sales','gm_bd'].includes(erpRole)`** DISALIN APA ADANYA dari `DealDetailPage.jsx:373` (App hanya passing `onCreatePRF` bila `canCreatePRF` true → tombol muncul iff role sales/gm_bd, pola sama Edit Inquiry). Kedua tombol balik (simpan/lihat selesai) → clear state → CustomerDetailPage remount tab Riwayat + re-fetch. ⚠️ gate Cetak PRF pakai `erpRole` = role primer saja → user multi-role (mis. Endang Kumolo Ratih `manager`+`sales`) bisa kehilangan hak (`08_TECH_DEBT` **TD-105**/**TD-106**). Menutup TD-98 item (a)+(c). Catatan implementasi: blok render `customer-detail` kini digate 3 state (`!customerInquiryEdit && !customerQuotationView && !customerPrfInquiryId`) — sub-view ke-4 nanti WAJIB ditambah ke guard itu (kalau lupa → layar kosong).
- **DealDetailPage TETAP HIDUP** (terjangkau dari daftar Inquiry — Task 4/5 alih-entry & pangkas Detail Inquiry SENGAJA DIBATALKAN dari 3b, dipindah ke tahap tersendiri). Sementara ini Detail Account & DealDetailPage sama-sama menampilkan riwayat akun (disengaja, untuk perbandingan). **Kapabilitas Detail Account KINI LENGKAP** untuk pensiun DealDetailPage: item (a) Lihat + (c) Cetak PRF + (d) Edit Inquiry RESOLVED; item (b) Buat Quotation & (e) Summary Harga = **WON'T-DO** (nol nilai tambah) → **TD-98 PRAKTIS TUNTAS**. Sisa = Task 4 (alih entry daftar Inquiry) + Task 5 (hapus DDP). Detail: `08_TECH_DEBT` **TD-98**.

---

## Aging Pipeline (Lead idle → Lead Pool) — Edge Function (LIVE + TERJADWAL harian 01:00 WIB)

Edge Function **`aging-pipeline`** (`supabase/functions/aging-pipeline/index.ts`) — pindahkan lead yang terlalu lama diam ke Lead Pool + notifikasi ke sales pemilik. Sebelumnya ter-deploy dgn slug auto `bright-handler` & **tak ada di version control**; kini di-commit (branch `feat/aging-pipeline`, sudah merge ke `main`).

**Batas diam per stage (hari):** NEW 7 · CONTACTED 5 · QUALIFIED 5 · PROPOSAL 3 · NEGOTIATION 14.

**Filter per-entitas (`companies.aging_enabled`) — HANYA MSI:** EF pakai **service role key** → menembus RLS → semula melihat SELURUH entitas. Tapi aturan aging di atas adalah aturan sales **MSI**, bukan Storbit (SOA)/JCI. Terbukti dry_run: dari 472 lead, **3 milik PT Stuja Orbit Abadi** (General Order, Indogrosir, CK — Central Kitchen; ketiganya `assigned_to` NULL). **Perbaikan** (migrasi `20260710000008`): kolom `companies.aging_enabled boolean NOT NULL DEFAULT false` (MSI=true, JCI/SOA=false); EF baca daftar `company_id` yang `aging_enabled=true` lalu `.in('company_id', companyIds)` di query accounts; +GRANT SELECT `companies` ke `service_role` (fix `permission denied for table companies` — lihat TD-62). Hasil dry_run pasca-filter: diperiksa **469** (turun dari 472), memenuhi **304** (tak berubah — 3 lead Storbit diam 7 hari di NEW, batas 7, belum lewat).

**Perhitungan:** `diamHari = Math.floor((now − MAX(stage_changed_at, last_activity_at)) / hari)`. Lead dianggap "disentuh" bila **stage naik ATAU ada aktivitas** (pakai yang paling baru dari keduanya). `Math.floor` (pembulatan ke bawah) → lead dapat jatah hari penuh. Bila `diamHari > batas`:
- `is_in_lead_pool=true`, ~~`account_status='lead_pool'` (kedua kolom serempak — fix TD-50)~~ **[USANG — SUPERSEDED 18 Jul: EF kini HANYA set `is_in_lead_pool`; `account_status` tak disentuh. `'lead_pool'` bahkan DITOLAK CHECK `accounts_account_status_check` sejak Fase 2 live — lihat TD-50/TD-91]**, `lead_pool_at=now`, `lead_pool_reason='Aging N hari di stage X'`, + notifikasi ke `assigned_to` (`event_type='crm.lead_idle'`).
- **Mode kering** (`?dry_run=true`) → laporkan kandidat (diperiksa/memenuhi/per-stage/daftar), **tak memindahkan** apa pun.

**Perbaikan EF (commit `ca7aad3`, `9f59f8c`, `96974bb`):**
1. +aturan **NEW:7** (sebelumnya 157 lead NEW tanpa aturan → tak pernah diperiksa).
2. Aging dari **`MAX(stage_changed_at, last_activity_at)`** (bukan `stage_changed_at` saja) — menyelamatkan lead yang digarap meski stage tak berubah (mitigasi TD-51).
3. **Fix insert notifikasi** — kolom `message`→`body`, buang `type`, +`event_type='crm.lead_idle'` +`reference_type`/`reference_id`. Insert LAMA **PASTI GAGAL** (kolom `message`/`type` tak ada di `notifications`) dan gagal diam-diam (tak ada cek error).
4. Buang `PREV_STAGE` dead code.
5. +mode kering (`dry_run`).
6. +`.is('deleted_at', null)`.
7. `Math.floor` (jatah hari penuh).
8. ~~Set `account_status` bareng `is_in_lead_pool` (TD-50).~~ **[USANG — SUPERSEDED 18 Jul: EF berhenti menulis `account_status`; hanya toggle `is_in_lead_pool`. Lihat TD-50/TD-91.]**

**Simulasi `dry_run` — terverifikasi 10 Jul (`verify_jwt` aktif, pasca-filter per-entitas):** **469 diperiksa** (hanya MSI), **304 memenuhi syarat** (setelah `Math.floor`). Sebaran: CONTACTED 121 · NEW 118 · QUALIFIED 45 · PROPOSAL 20 · NEGOTIATION 0. Sebelum `Math.floor` angkanya **332** (termasuk 6 NEGOTIATION); pembulatan ke bawah menyelamatkan **28 lead** yang harinya belum genap — seluruhnya deal NEGOTIATION aman.

**Rencana peluncuran (status per-langkah — urut):**
1. ✅ **SELESAI (10 Jul)** — TD-60 `verify_jwt` beres; `config.toml` diberi entri `[functions.aging-pipeline]` `verify_jwt=true`. Terverifikasi: **401** tanpa key sah, **200** dgn anon key.
2. ✅ **SELESAI (10 Jul)** — `aging-pipeline` di-deploy ulang dgn slug benar (sebelumnya `bright-handler`). Live.
3. ✅ **SELESAI (10 Jul)** — `dry_run` dijalankan manual: 469 diperiksa, **304 memenuhi syarat**.
4. ✅ **SELESAI (10 Jul)** — sales diberi tahu **sebelum** cron berjalan. **TIDAK** pakai tenggat seminggu; keputusan Den: sales perlu melihat pipeline punya konsekuensi nyata. Pemberitahuan dikirim pagi, cron jalan 01:00 WIB (malam yang sama).
5. ✅ **SELESAI (10 Jul)** — pg_cron terjadwal (migrasi `20260710000009`). Sejak ini **lead berpindah otomatis tiap malam**.

**Mekanisme cron (migrasi `20260710000009`):**
- Job **`aging-pipeline-harian`**, schedule **`0 18 * * *`** (18:00 UTC = **01:00 WIB**), harian.
- Panggil EF via **`net.http_post`** (extension `pg_net`).
- **Service role key disimpan di Vault** (nama `aging_pipeline_key`), BUKAN hardcode di `cron.job` — tabel itu terbaca siapa pun yang punya akses schema `cron`.
- Prasyarat terpenuhi: `pg_cron` 1.6.4 + `pg_net` aktif, EF `verify_jwt=true`, `aging_enabled=true` hanya MSI, GRANT SELECT `companies` ke `service_role`.
- Diverifikasi: `net.http_post` manual `?dry_run=true` → status **200**, memenuhi **304**.

**Dampak malam pertama (11 Jul 01:00 WIB):** pipeline aktif **469 → 165**; Lead Pool **479 → 783**; **~303 notifikasi**. Malam berikutnya diperkirakan mendekati nol (sisa lead belum lewat batas) — **"aging jadi aliran, bukan gelombang"**.

**Perintah darurat:**
```sql
-- (a) matikan cron
SELECT cron.unschedule('aging-pipeline-harian');

-- (b) kembalikan lead yang dipindah malam pertama
--     HANYA toggle penanda parkir — JANGAN set account_status. Akun kembali ke
--     lifecycle aslinya; menyetel 'prospect' menaikkan lead/mql/sql jadi prospect
--     tanpa inquiry (melanggar aturan gerbang, lolos CHECK jadi tak ketahuan).
UPDATE accounts
SET is_in_lead_pool = false,
    lead_pool_at = NULL, lead_pool_reason = NULL
WHERE lead_pool_reason LIKE 'Aging%'
  AND lead_pool_at >= '2026-07-10 18:00:00+00';

-- (c) pantau harian berapa lead masuk pool via aging
SELECT date_trunc('day', lead_pool_at) AS tanggal, count(*)
FROM accounts
WHERE lead_pool_reason LIKE 'Aging%'
GROUP BY 1 ORDER BY 1 DESC;
```

---

## Sebaran pencatatan sales — KONTEKS ADOPSI (⚠️ BUKAN penilaian kinerja)

> **DISCLAIMER WAJIB DIBACA.** Angka di bawah **mengukur PENCATATAN di Nexus, BUKAN KINERJA sales.** Sales bisa menggarap lead lewat WhatsApp/telepon tanpa mencatatnya di Nexus; data ini **tak bisa membedakan** keduanya. **Jangan jadikan dasar penilaian kinerja / evaluasi orang.** Yang bisa disimpulkan hanya: **Nexus belum menjadi tempat sales mencatat kerja** → ini masalah **adopsi/desain produk, bukan orang**. Tindak lanjut = perbaikan proses/UX, bukan teguran individu (dibahas terpisah).

Konteks saat cron aging dinyalakan (10 Jul): rasio aktivitas tercatat per lead vs proporsi lead yang akan terbuang ke Lead Pool. Total: **269 aktivitas tercatat untuk 469 lead aktif** dalam sebulan.

| Sales | Lead | Aktivitas/lead | Akan terbuang |
|---|---|---|---|
| Rossy Siregar | 30 | 1.83 | 33% |
| F Ayumurni Hartanti | 27 | 0.89 | 74% |
| Nurul Andini Karina | 96 | 0.78 | 67% |
| Martin | 12 | 0.50 | 67% |
| Maria Marcia Mannuela | 23 | 0.39 | 96% |
| Gusti Raharjo | 94 | 0.32 | 65% |
| Endang Kumolo Ratih | 66 | 0.14 | 92% |
| Suhana Nia | 120 | 0.10 | 48% |

> Baca sebagai sinyal adopsi: jumlah aktivitas tercatat jauh di bawah jumlah lead → alat belum melekat di kebiasaan kerja. Ini bahan diagnosa produk, sekali lagi **bukan rapor sales.**

---

## Foundation Flow

**Onboarding user baru:**
```
[Admin/super_admin] User Access → "Add User"
   → Edge Function create-user (service-role):
        ⚙ auth.admin.createUser  → buat akun auth
        ⚙ profiles upsert (full_name, company_id, branch/dept/position)
        ⚙ user_roles upsert (role_id = ERP role; cross-company via service-role)
   → User Edit page: Profile + Permission Matrix (user_menu_permissions diff-save)
        + avatar upload (bucket avatars), Ubah Password (reset-password EF), Hapus User (delete-user EF)
```
- **Assign role:** via `user_roles` (bukan `profiles.role` yang deprecated). Role menentukan `erpRole` di AuthContext + RLS.
- **Set company:** `profiles.company_id` (+ `user_roles.company_id`). Menentukan `get_user_company_id()` untuk RLS.
- **Org structure:** [Admin] Struktur Organisasi → set `profiles.reports_to` (self-FK) → org chart top-down; warna node per **position level** (Director/Manager/Head/Supervisor/Staff/Operator), badge per entitas.

**Master data CRUD:** [Admin/IT] Companies/Branches/Departments/Positions/Roles/Products/Payment Terms/Taxes/Document Types/Status Catalog/Currencies. Positions = compact group-by-code + checkbox entitas (INSERT/reactivate/deactivate per entity).

---

## Service Management Flow

**HRGA Request:**
```
[Requester] My Requests → pilih request type (per company) → isi form + line items (ATK)
   → submit (status: submitted) → ⚙ increment_document_sequence (HRG nomor)
   → approval matrix (hrga_approval_configs per request_type × level, scoped company_id)
   → [Approver L1/L2/L3] approve/reject (hrga_request_approvals, INSERT-only audit)
   → status lifecycle: draft → submitted → under_review → approved/rejected/revision_requested → completed
```
- Approval config: `hrga_approval_configs` UNIQUE(request_type_id, level); **selalu filter company_id**.
- Offboarding: tabel `hrga_offboarding_checklists`/`_items` ada, UI [TODO: belum dibangun].

**IT Service Management:** [TODO: modul belum dibangun — planned].

**Asset Management:**
```
[Procurement/IT] tambah aset (Add Asset wizard, per kategori IT-EQP/VEH/FURN/BLDG)
   → assets + asset_specifications + asset_network (+ software/maintenance/fuel per kategori)
   → assignment_status (available/checked_out), assigned_to user
   → detail: inline-edit (IT), tab Health Score (heuristik), Maintenance, Fuel (kendaraan)
```
- ⚠️ Save wizard masih **dummy** (belum persist). Documents/Work Orders/Routes = tabel belum ada (TECH_DEBT TD-26).

---

## Logistics (Storbit SP) Flow — Mesin Status 12 Tahap (FASE 0-3, LIVE)

Status headline = **`sp_orders.status`**, **fact-derived** via `sp_recompute_status(customer_id, sp_no)` (di-maintain otomatis oleh event, BUKAN diketik). Detail skema/RPC: `docs/03_DATA_MODEL.md §3 (Inventory & Logistics) + §5`.

```
[Sales/Operations] Input SP (single door: InputSPPage)
   → penomoran MANUAL (nomor dari customer), DC WAJIB, identitas komposit (customer_id, sp_no)
   → dual-write: sp_items (lama) + sp_orders/sp_order_items (baru, ⚙ create_sp_order_dual)
   ══►  status = DRAFT
         │
 [Ops/Manager] Konfirmasi SP (set_sp_status 'confirmed') ─⚙ recompute─►  CONFIRMED
         │                                                (stok kurang → MENUNGGU_STOK)
         │  [Ops] Tolak SP (set_sp_status 'cancelled') ──►  CANCELLED (terminal)
         ▼
 [Ops] Generate Picking (generate_picking_from_sp; hanya saat CONFIRMED/MENUNGGU_STOK)
         │   → picking_lists + items + reservasi stok  ─⚙ recompute─►  PICKING
         ▼
 [Ops] Selesai picking/packing (complete_picking)      ─⚙ recompute─►  PACKED
         ▼
 [Ops] Buat Surat Jalan (generate_delivery_from_picking) → delivery_notes (draft)
 [Ops] Berangkatkan (dispatch_delivery)
         │   → ledger outbound + isi sp_items.shipped_qty ─⚙ recompute─►  DIKIRIM
         ▼
 [Ops] Tandai sampai (mark_delivery_delivered)          ─⚙ recompute─►  SAMPAI
         │   (bila Σshipped ≥ Σqty)                      ─⚙ recompute─►  TERKIRIM_PENUH
         ▼
 [Ops] Terbit BTB di Detail SP (sp_issue_btb) → sp_btb  ─⚙ recompute─►  BTB_TERBIT ★ PUNCAK
         │   (BTB_TERBIT = rank TERTINGGI, MENGALAHKAN TERKIRIM_PENUH — "puncak sebelum invoice")
         ▼
 ─────────── FASE 4-5 (📋 PLANNED — belum dibangun, butuh modul invoice/payment) ───────────
 [Finance] Terbit invoice        →  INVOICED   📋
 [Finance] Submit/serah faktur   →  SUBMITTED  📋
 [Finance] Lunas (payment)       →  LUNAS      📋
```

**Aksi mundur (fact-derived — recompute otomatis balik ke tahap fakta tertinggi):**
- **Batal picking** (`cancel_picking`): picking → cancelled, release reservasi, set flag **`had_cancelled_picking`** (permanen) → status **mundur ke CONFIRMED**.
- **Batal Surat Jalan** (`cancel_delivery`): reverse ledger + **kembalikan `sp_items.shipped_qty`** → status mundur (mis. TERKIRIM_PENUH → SAMPAI/DIKIRIM).
- **Hapus BTB** (`sp_delete_btb`, soft-delete): status **mundur** dari BTB_TERBIT ke tahap fakta tertinggi berikutnya.

**Guard recompute:** `status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS')` → beku (recompute tak menyentuh). **BTB_TERBIT TIDAK beku** (ikut fakta BTB).

**Batalkan vs Hapus SP (di Detail SP):**
- **[Ops/Manager/GM/super_admin] Batalkan SP** (`set_sp_status 'cancelled'`, hanya saat **DRAFT**) — alasan **wajib** (textarea); status → **CANCELLED** (terminal, data tetap tersimpan). Dual-table + komposit `(customer_id, sp_no)`. Tombol "Batalkan SP" di header actions, TERPISAH dari Danger Zone.
- **[super_admin] Hapus SP** (`delete_sp_dual`, ⚠️ **belum live** — RPC dijalankan user manual, hanya saat **DRAFT**) — hapus permanen dual-table: `sp_orders` (+`sp_order_items` via FK CASCADE) **dan** `sp_items`, di-kunci komposit → nomor bisa dipakai ulang. Guard `is_super_admin()` + DRAFT strict di RPC. Di Danger Zone. **operations kehilangan akses hapus** (dulu `['super_admin','operations']` tanpa gate status) → diberi "Batalkan SP" sebagai gantinya.

**Catatan transisi & yang USANG:**
- Live sekarang **DRAFT s/d BTB_TERBIT**; **INVOICED/SUBMITTED/LUNAS = FASE 4-5 (planned)**.
- ⚠️ **USANG (flag finance lama):** progress per-item **INV → FP → SUB → KRM** (kolom `sp_items.inv/fp/submit/kirim`) = generasi lama, **BUKAN sumber kebenaran status** — digantikan mesin status + (nanti) modul invoice FASE 4-5.
- ⚠️ `sp_btbs` (BTB legacy per-SP) digantikan `sp_btb`; **AR/TTF (`ar_ttfs`/`ar_btbs`) = domain finance/penagihan terpisah**, bukan status SP.

---

## Inventory Flow

```
[Operations] Penerimaan Barang (goods receipt)
   → pilih products + vendor + warehouse → simpan ke stock_ledger (movement masuk)
   → Stok Barang: agregasi stock_summary (qty per product per warehouse)
   → Inventory Dashboard: KPI + movement trend (dari stock_ledger) + low-stock alert
```

---

## Procurement — PRF (Price Request Form) Flow (Fase 1+2 LIVE; Pricing Answer LIVE 20 Jul; Fase 3 belum)

```
[Sales / GM BD] Buat PRF (PRFFormPage) — HANYA dari inquiry (lihat "Keputusan desain" di bawah)
   → Sumber = Inquiry (read-only, tak bisa diganti) → pilih Inquiry → inquiry_id + auto-isi account_id dari inquiry
   → Section 01 Informasi Dasar (stream, deadline_quotation)
   → Section 02 Inquiry Details (direction, commodity, HS Code, MSDS jika DG,
       service_type, incoterms, commercial value/currency jika CIF/CIP/DDP,
       pickup/delivery address per incoterm, add-on services [11 opsi], cargo_ready_date)
   → Section 03 Detail Layanan (child fields dinamis per service_type — MUNCUL saat service_type dipilih):
       • Sea → Freight Type FCL/LCL; FCL → container types (multi) + qty per tipe; LCL → gw/dimension/volume/koli
       • Air → gw/dimension/volume/koli
       • Inland (service=inland ATAU add-on 'inland') → fleet types (multi) + pickup/delivery (wajib) + gw/dim (opsional)
       • Custom (service=custom DAN add-on Custom Clearance) → doc type AUTO PIB/PEB dari direction
       • Project → freight types (multi) + qty  (note: penentuan project masih sementara)
       ganti service_type → reset semua field child; field tak relevan → payload null
   → Section 04 Notes
   → nomor auto PRF/{ENTITAS}/{TAHUN}/{ROMAWI}/{URUT} (increment_document_sequence, reset per-bulan)
   → Simpan Draft (status=DRAFT) ATAU Submit (status=SUBMITTED + submitted_at)
   → INSERT prf (RLS prf_insert: hanya sales/gm_bd se-company)

[Procurement] lihat PRF submitted → acknowledge (status=ACKNOWLEDGED)   ← Fase 3a (list/inbox) BELUM
   → RLS prf_select (own OR procurement OR manager+); prf_update_status (procurement, saat SUBMITTED)

[Procurement] isi JAWABAN HARGA (Pricing Answer, 20 Jul 2026 — PRFDetailPage)   ← dibuka dari list "Forwarding (MSI)" (baris klik-able)
   → panel "Jawaban Harga": tabel rincian biaya cost build-up (prf_cost_items: component, cost_type vendor/internal, amount, currency, sort_order)
   → Total Modal (Σ amount) → Harga Jual (suggested_rate) → Untung & Margin %   ← DIHITUNG SAAT RENDER, tak disimpan
   → header jawaban: rate_currency, valid_from, valid_until, pricing_notes
   → Simpan → RPC atomik save_prf_pricing(p_prf_id, p_header, p_items) — SECURITY INVOKER, SATU transaksi:
       UPDATE header (guard ROW_COUNT=0 → RAISE, blokir tak-berwenang sebelum delete) → DELETE rincian → INSERT rincian
       answered_by = server auth.uid(); RAISE apa pun me-rollback SELURUH txn (rincian lama tak hilang bila insert gagal)
   → RLS: header via prf_update_status (procurement + SUBMITTED); rincian via prf_cost_items_* (EXISTS→prf, predikat sama)
   → status prf TIDAK berubah → procurement bisa koreksi ulang selama SUBMITTED
```

- **Live sekarang:** FORM lengkap (Section 01/02/03/04) + nomor auto (Fase 1+2). Sumber SELALU inquiry → mengisi `inquiry_id` + auto `account_id`. Section 03 child fields dinamis per `service_type` (Fase 2). **+ Detail PRF + Jawaban Harga (20 Jul 2026).**

**Jawaban Harga (Pricing Answer) — procurement isi cost build-up [20 Jul 2026, branch `feat/prf-pricing-answer`, 3 file FE + SQL manual]:**
> Tempat tim pricing/procurement menuliskan jawaban harga atas PRF, dengan **cost build-up dirinci per komponen** (vendor vs internal). **Tidak ada role `pricing`** di sistem (hanya `procurement`) → "pricing/procurement" = procurement.
- **Halaman baru `PRFDetailPage.jsx`** (dibuat SEMINIMAL mungkin — keputusan Den: summary PRF read-only + panel Jawaban Harga saja, tanpa tombol edit/hapus/cetak PRF). Dibutuhkan karena SEBELUMNYA **tak ada halaman detail PRF** (hanya form create + list read-only non-klik). Dibuka dari list **"Forwarding (MSI)"** (`ProcInquiryForwardingPage`, baris kini klik-able via prop `onSelect`); `App.jsx` state `procPrfDetailId` + render block (gate list `!procPrfDetailId` + cabang detail, keduanya di bawah `canRenderPage('proc-inquiry-fwd-msi')`).
- **Panel Jawaban Harga:** tabel rincian biaya (`prf_cost_items`: component / cost_type vendor|internal / amount / currency, bisa tambah–hapus–urut baris) → **Total Modal** (Σ amount) → **Harga Jual** (`suggested_rate`) → **Untung** & **Margin %** — ketiganya **dihitung saat render, TIDAK disimpan ke DB**. Field header jawaban: `rate_currency`, `valid_from`, `valid_until`, `pricing_notes`.
- **Simpan** → **RPC atomik `save_prf_pricing(p_prf_id, p_header, p_items)`** (migrasi `20260720000001`, **SECURITY INVOKER** — RLS tetap penegak, NOL perubahan policy): satu transaksi = UPDATE header (kolom jawaban + `answered_by`=server `auth.uid()` + `answered_at`=now; guard `GET DIAGNOSTICS ROW_COUNT=0 → RAISE` memblokir user tak-berwenang **sebelum** DELETE) → DELETE rincian → INSERT rincian. **RAISE apa pun (mis. INSERT ditolak RLS) me-rollback SELURUH transaksi** → header tak tersimpan & rincian lama tak hilang. **Jejak keputusan:** implementasi awal = 3 request client terpisah (UPDATE+DELETE+INSERT) yang **TIDAK atomik** (window kehilangan rincian biaya bila DELETE commit lalu INSERT gagal) → diganti RPC atomik (keputusan Den, opsi A).
- **Menyimpan jawaban TIDAK mengubah `prf.status`** (terverifikasi: satu-satunya penulis status = form create `PRFFormPage:~372`; tak ada transisi) → procurement bisa **mengoreksi ulang** selama PRF `SUBMITTED`.
- **Gate edit:** `['procurement','super_admin'].includes(erpRole)` (cermin RLS; pola gating = `erpRole`-includes, sama dgn gate "Cetak PRF"). Sales/manager = **LIHAT saja** (panel read-only). **RLS = penegak sebenarnya.**
- **⚠️ Heads-up / kandidat tech debt LOW (`08_TECH_DEBT` TD-109):** kalau kelak ada transisi `SUBMITTED→QUOTED`, procurement akan **terkunci** dari edit (RLS `prf_update_status` menuntut `status='SUBMITTED'`). Belum ditangani (di luar scope).
- **DUA SQL DIJALANKAN MANUAL** oleh Den, **berurutan**: (1) `supabase/migrations/20260720000000_prf_pricing_answer.sql` (kolom+tabel+RLS), lalu (2) `supabase/migrations/20260720000001_save_prf_pricing_rpc.sql` (RPC `save_prf_pricing`). Tanpa RPC → simpan gagal ("function save_prf_pricing not found"). Snapshot stale, `pg_dump` belum jalan. Skema: `03_DATA_MODEL` (tabel `prf` +7 kolom jawaban, tabel `prf_cost_items`, RPC). Belum tes runtime.

**⭐ KEPUTUSAN DESAIN EKSPLISIT — PRF hanya boleh lahir DARI INQUIRY (Den, 19 Jul 2026):**
> PRF adalah permintaan harga sales→procurement **atas sebuah permintaan customer**. Tanpa inquiry, permintaan itu tak tercatat dan rantai dokumen putus di pangkal → karena itu **PRF hanya boleh dibuat dari inquiry**.
- **Sebelumnya aturan ini hanya TERSIRAT** dari mandat inquiry-first (MI), TIDAK eksplisit. Batch ini menegakkannya di form + mencatatnya resmi.
- **Pencabutan leaf sidebar `prf` (entry buat-PRF-dari-nol) terjadi di commit `83238c3`** ("cetak PRF dari inquiry…") sebagai **EFEK SAMPING** restrukturisasi nav Procurement (leaf `{id:'prf'}` dihapus dari `NEXUS_NAV`, digantikan node Procurement bertingkat dengan "Forwarding (MSI)" sebagai leaf aktif) — **tak pernah dicatat sebagai keputusan**. Terverifikasi: `id:'prf'` masih ada di `ERP_MENU_GROUPS` (`App.jsx:666`) sebagai gate-registry + render block (`App.jsx:3416`), tetapi **satu-satunya jalan masuk ke `PRFFormPage` adalah tombol "Cetak PRF" dari inquiry** (`setActiveMenu('prf')` + `prefillInquiryId`, di `DealDetailPage` & tab Riwayat Detail Account) → dua pilihan sumber Customer/Prospect praktis tak pernah terpakai = UI mati.
- **Yang dikerjakan batch ini (FE, 19 Jul 2026, `PRFFormPage.jsx`, NOL SQL, NOL file lain):** (a) selektor 3-tombol Sumber (Customer/Prospect/Inquiry) **DIHAPUS** → indikator read-only "Sumber: Inquiry"; field **Inquiry** jadi field utama Section 01. (b) field "Nama Manual" (`account_name_manual`) **dihapus dari UI**; payload tetap menulis `account_name_manual: null`. (c) fetch `customers` + `prospects` + state-nya + `onSourceChange` **dihapus**. (d) default `customer_source` `'customer'`→`'inquiry'`; **payload tetap menulis `customer_source: 'inquiry'`** (kolom TIDAK dikosongkan — baris baru konsisten dgn baris lama). (e) validasi akun disederhanakan → `if(!inquiry_id) e.account='Pilih inquiry'`. (f) **`inquiry_id` kini WAJIB untuk DRAFT DAN SUBMIT** (guard di awal `handleSave`; sebelumnya Draft tak divalidasi sama sekali → bisa simpan PRF tanpa inquiry). **TANPA constraint DB.**
- **Dampak data lama = NIHIL:** `customer_source` **hanya dibaca/ditulis di dalam `PRFFormPage.jsx`** — nol list/detail/PDF/badge/filter lain yang membacanya (terverifikasi grep `src/`: `ProcInquiryForwardingPage`/`CustomerDetailPage`/`DealDetailPage`/`SalesOrderDocDetailPage` tak satupun select `customer_source`). Kolom `customer_source` di DB TETAP ADA & tetap menyimpan `'customer'` untuk baris lama.
- **Dua baris PRF historis (`PRF/MSI/2026/VII/003` & `006`)** lahir dari jalur yang kini ditutup (`customer_source='customer'`, `inquiry_id` NULL) — **dibiarkan APA ADANYA sebagai sejarah**, tidak diubah, tidak dimigrasi.
- **Asumsi yang mendasari penghapusan field "Nama Manual" (`account_name_manual`) — AMAN saat ini:** `account_id` PRF baru sepenuhnya diturunkan dari inquiry (`inq.customer_id || inq.prospect_id`), dan **diverifikasi 0 inquiry aktif tanpa akun** (semua inquiry punya `customer_id` ATAU `prospect_id`) — **query Den, 19 Jul 2026** (atribusi jujur: hasil query Den, BUKAN verifikasi doc-keeper/CC, bukan tes runtime). **Asumsi yang bergantung:** bila suatu saat aturan berubah sehingga inquiry boleh lahir TANPA akun tertaut, PRF bisa tersimpan dengan `account_id` null **tanpa jaring pengaman manual** (list Forwarding menampilkan Customer "—") → asumsi ini **perlu ditinjau ulang** saat itu. Sengaja TIDAK ditambahkan penanganan khusus sekarang (tak perlu jaring pengaman untuk kasus yang tak ada di data).
- **Tidak menuntaskan tech debt:** TD-76 (draft PRF tak bisa dibuka-ulang) tetap OPEN — batch ini justru menegaskannya (draft kini wajib punya inquiry tapi tetap tak bisa direopen); TD-79/TD-89/TD-107/TD-108 (prefill/vocab) tak tersentuh. Atribusi jujur: verifikasi = pembacaan kode + grep CC, **bukan** tes runtime.
- **Belum:** list/inbox procurement penuh (Fase 3a — form masih create-only, draft tak bisa dibuka-ulang), cross-entity inbox (Fase 3b). Status QUOTED/EXPIRED disiapkan di CHECK tapi belum ada transisinya. **⚠️ FLAG UX (perlu konfirmasi user testing):** Custom butuh 2 syarat (service=custom DAN add-on Custom Clearance) — jika custom tanpa add-on, blok tak muncul + hint.

**Cetak PRF dari inquiry (realisasi mandat MI — [sales/gm_bd], 18 Jul 2026):**
> Mandat MI: sales **wajib menerbitkan PRF** untuk minta harga ke pricing/procurement, ter-prefill dari inquiry. NOL perubahan DB (FK `prf.inquiry_id → inquiries.id` sudah ada).
```
[Sales/GM BD] Detail Inquiry (DealDetailPage)
   → tombol "Cetak PRF" (HANYA sales/gm_bd — role dgn prf_insert)
   → form PRF ter-PREFILL field non-cabang dari inquiry (via helper `applyInquiryData`):
        account_id (dari customer_id/prospect_id), hs_code, pickup/delivery address,
        pol→origin, pod→destination, deadline_quote→deadline_quotation, notes→notes,
        incoterms[0] (hanya bila token PRF valid, else kosong), customer_source='inquiry' + inquiry_id
   → [sales] pilih service_type (moda) + direction + SEMUA field cabang MANUAL
        (taksonomi service_type inquiry=lini bisnis ≠ PRF=moda; direction tak ada di inquiry)
   → Submit → INSERT prf dgn inquiry_id (jejak)
   → muncul di panel "Daftar PRF" (per-inquiry, DealDetailPage) & list "Forwarding (MSI)"
```
- **Anti-dobel = panel "Daftar PRF" yang TERLIHAT** di Detail Inquiry (bukan dialog blocking) → sales lihat sendiri berapa kali inquiry ini di-PRF-kan. Panel + list Forwarding(MSI) = **read-only** (nol aksi edit/delete).
- **⚠️ Known limitation v1 (RLS `prf_select` = own OR procurement OR manager+):** sales **hanya melihat PRF MILIKNYA** di panel & list → cek-dobel & list **tak menangkap** PRF yang dibuat user lain untuk inquiry sama. Diterima untuk v1 (perbaikannya butuh melonggarkan RLS — tak dilakukan). Detail: `08_TECH_DEBT` **TD-79** (sebagian teraddress) + **TD-76** (list read-only ada, form tetap create-only).
- **Gate role:** menu terlihat sales/gm_bd/procurement/manager+; **hanya sales/gm_bd yang bisa Submit/Draft** (RLS `prf_insert`). Detail: `04_ROLE_PERMISSION_MATRIX`. Skema: `03_DATA_MODEL` (tabel `prf`). Rujukan desain: `AUDIT_PROCUREMENT.md`.
- **Prefill diperluas (FE, 19 Jul 2026, `PRFFormPage.jsx`):** logika prefill dikonsolidasi ke helper `applyInquiryData(f, inq)` dan aktif di **3 jalan masuk**: (1) Cetak PRF dari `DealDetailPage` (prop `prefillInquiryId`), (2) Cetak PRF per-baris di tab Riwayat Detail Account (prop sama), dan (3) **pilih dropdown Inquiry `onInquiryPick`** di form (yang sebelumnya TIDAK prefill sama sekali). *(Catatan: sejak batch "PRF hanya dari inquiry" 19 Jul 2026, dropdown Inquiry ini adalah SATU-SATUNYA selektor sumber — selektor 3-tombol Customer/Prospect/Inquiry sudah dihapus; lihat blok "Keputusan desain" di atas.)* Pengaman helper: **fill-empty-only** (tak menimpa isian user) + **non-null** (tak menghapus); create-only struktural (PRFFormPage tak punya edit-mode). Field vocab-beda/lossy yang tak bisa disalin (`service_type`, `commodity`, `additional_services`→`add_on_services`, dan **`incoterms` nilai tanpa padanan** mis. `CFR/CNF`, `DDU/DAP` — yang selama ini diam-diam jadi kosong saat prefill) **tak di-prefill** tetapi ditampilkan sebagai **teks bantu read-only** (echo nilai asli inquiry) supaya sales tahu harus isi apa tanpa membuka inquiry; field Inquiry juga diberi hint "Sebagian data disalin otomatis dari inquiry {no}." NOL perubahan DB (semua kolom sudah ada). ⚠️ Duplikasi kolom lintas-tabel inquiry↔prf yang ditambal helper ini dicatat sbg **TD-107** (`08_TECH_DEBT`). Belum tes runtime.

---

## Sales → SO (Sales Order) → Procurement Flow (UI v1 LIVE; SI menyusul)

> Dokumen perintah kerja Sales → Procurement. Sales menerbitkan SO manual dari inquiry; SO **menunjuk** history quotation & PRF (via `inquiry_id`), **tidak menyalin** ke tabel SO. NOL perubahan DB (tabel `sales_orders` sudah dibuat, rekaman `20260718000000_sales_orders.sql`, sudah masuk snapshot).

```
[Sales/GM BD] Menu "Sales Order" (CRM) → tombol "Buat SO"
   → pilih INQUIRY sumber → account_id DITURUNKAN OTOMATIS dari inquiry (customer_id ?? prospect_id; sales tak isi account terpisah)
   → nomor auto SO/{ENTITAS}/{TAHUN}/{URUT-3digit} (increment_document_sequence: document_type='SO', department_code='CRM', month=0)
   → INSERT sales_orders (status='DRAFT', signed=false, created_by)
   → Anti-dobel 2 lapis: (a) cek SO live per inquiry sebelum insert → jika ada, tak insert + tawarkan "Buka SO {so_no}";
                          (b) tangkap unique violation DB 23505 (sales_orders_inquiry_unique_live) → pesan ramah

[Sales] Detail SO (SalesOrderDocDetailPage)
   → Sign by Customer: input link URL (validasi http/https) → sign_link + signed=true + signed_at (hanya creator; setelah signed → badge + link + "Ubah link")
   → Kirim ke Procurement: status DRAFT→SENT (hanya creator + status DRAFT)
   → Panel History Quotation (query quotations WHERE inquiry_id = SO.inquiry_id, read-only)
   → Panel History PRF (query prf WHERE inquiry_id = SO.inquiry_id, read-only)
   → Slot SI (Shipment Instruction) = placeholder badge "Nyusul" (entitas terpisah, belum dibangun)

[Procurement] Menu "Sales Order" (Procurement, node top-level) → list read-only (tanpa tombol Buat SO) → Detail SO read-only
   → RLS sales_orders_select: super OR (company AND (creator OR procurement OR manager+))
```

- **SO menunjuk, tidak menyalin:** nol kolom quotation/prf di `sales_orders`; history dirender saat buka Detail (via `inquiry_id`). Satu inquiry hanya SATU SO (unique index parsial DB `sales_orders_inquiry_unique_live WHERE deleted_at IS NULL`).
- **Status v1:** DRAFT / SENT (CHECK). Sign = link teks (bukan upload file). SI = placeholder (entitas terpisah, menyusul).
- **Menu 2 sisi:** `crm-sales-order` (child nav-crm; gate `[sales,gm_bd,manager,ceo,admin,super_admin]`, tombol "Buat SO") + `proc-sales-order` (node top-level nav-proc; gate `[procurement,manager,ceo,admin,super_admin]`, read-only).
- **⚠️ Known limitation v1 (RLS quotation ≠ procurement):** RLS `quotations_read` = `manager+ OR created_by OR super` → **procurement TIDAK termasuk**. Di sisi Procurement (dan role non-manager), panel History Quotation bisa **kosong bukan karena tak ada quotation, tapi karena RLS memblokir**. UI menangani jujur: role manager-or-above/super → "Belum ada quotation" (definitif); role lain → pesan **netral** "Quotation tidak dapat ditampilkan untuk role ini (kebijakan akses)". **Keterbatasan klien:** tak bisa membedakan 100% RLS-blocked vs genuinely-empty untuk role non-definitif → dipakai pesan netral. History PRF aman (`prf_select` memuat `procurement`). **RLS quotations TIDAK dilonggarkan di task ini** — calon perubahan = keputusan forum terpisah. Detail: `08_TECH_DEBT` TD-90.
- Skema: `03_DATA_MODEL` (tabel `sales_orders`). Belum tes runtime.

---

## [Modul lain]

- **Finance (transaksi), Procurement/PO, Approval engine runtime, Billing/AR-AP, Reporting konsolidasi** — [TODO: belum cukup info / belum dibangun. Lihat `docs/09_ROADMAP.md` status 📋].
