# AUDIT CRM CHAIN — 22 Juli 2026

> **Mode: AUDIT, bukan eksekusi.** Nol file kode diubah, nol perubahan DB, nol dokumen governance disentuh, doc-keeper tidak dipanggil. Satu-satunya file yang dibuat adalah dokumen ini.
>
> **Basis bukti:** working tree `main` @ `e13f73d` (22 Jul 2026), `git log` rentang 15–22 Jul 2026 (63 commit, **semuanya sudah ancestor `main`** — nol pekerjaan menggantung di branch), `supabase/schema_snapshot.sql` (12.657 baris), `supabase/migrations/`, dan `src/`.
>
> **Batas kejujuran yang berlaku untuk SELURUH dokumen ini:** saya **tidak punya akses database**. `psql` dan `pg_dump` tidak terpasang di mesin ini, dan kredensial di `.env.local` hanya anon key (RLS akan mengembalikan 0 baris untuk tabel CRM tanpa sesi login). **Setiap angka baris di dokumen ini berasal dari dokumen/klaim Den, bukan dari query yang saya jalankan.** Setiap `SELECT count` yang diminta di brief saya tuliskan sebagai SQL siap-jalan, bukan sebagai hasil. Lihat §ASUMSI TIDAK DIVERIFIKASI.

---

## RINGKASAN EKSEKUTIF

| Dimensi | Skor | Alasan satu kalimat |
|---|---|---|
| **Kesiapan Design CRM** | **3 / 10** | Menu ~55% sejalan, tapi dua sumbu pipeline (lead per-perusahaan vs deal per-inquiry) **belum terpisah sama sekali** — keduanya masih satu kolom `accounts.pipeline_stage`. |
| **Integritas Data** | **2 / 10** | 39 policy RLS `USING (true)`, termasuk **DELETE/UPDATE terbuka untuk semua user login** pada `sp_items`, `delivery_notes`, `picking_lists`, `ar_ttfs`; ditambah gate bisnis (BANT, Win/Loss, Handover) yang bisa dilewati total lewat tombol "Pindah Stage". |
| **Konsistensi Dokumentasi vs Kode** | **4 / 10** | `CLAUDE.md` + `PROGRESS.md` sangat terkini dan detail; `00_DEV_JOURNEY` / `09_ROADMAP` / `10_TASK_BREAKDOWN` **tertinggal 4–5 hari**; dan ada dua klaim yang **salah ke arah pesimis** (bilang snapshot stale padahal segar). |
| **Kesehatan Rantai Dokumen** | **3 / 10** | Rantai FK-nya benar dan rapi (Inquiry → PRF → Quotation → SO, satu SO per inquiry). Tapi **mesin statusnya mati**: `inquiries.status` dan `prf.status` tidak pernah bertransisi setelah insert, dan procurement **buta** terhadap `inquiries`/`accounts` karena RLS. |

### Kritik terpenting

**1. Yang paling mengkhawatirkan bukan CRM — tapi RLS transaksional yang sudah lama dibiarkan.** `sp_items` punya empat policy dan **keempatnya `USING (true)` / `WITH CHECK (true)`** (`schema_snapshot.sql:12313,12320,12327,12334`). Artinya user terautentikasi apa pun — HRGA, viewer, sales entitas lain — bisa `DELETE` seluruh baris SP lewat PostgREST. Pola yang sama berlaku untuk `delivery_notes`, `delivery_note_items`, `picking_lists`, `picking_list_items`, `picking_list_materials`, `ar_ttfs`, `ar_btbs`, `sp_btbs`, `product_warehouse_location` — total **39 policy di 21 tabel**, **18 di antaranya jalur tulis/hapus**. Ini **sudah tercatat** sebagai TD-39 (HIGH), tapi minggu ini pola yang sama ditemukan lagi di `warehouses` dan **difilekan ulang sebagai TD-119 dengan severity LOW, tanpa cross-reference ke TD-39**. Fragmentasi severity seperti ini adalah cara utang kritikal terkubur: pembaca berikutnya melihat "LOW, catatan audit, belum dinilai bug" dan melewatinya. Sementara itu energi minggu ini habis di `vendors` — tabel **yatim yang nol FK masuk sampai 21 Jul** — sedangkan `sp_items` yang memegang 723 baris produksi dibiarkan terbuka.

**2. Design target CRM Anda mensyaratkan dua sumbu pipeline; kode punya satu, dan kolom untuk sumbu kedua sudah ada tapi mati.** `pipeline_stage` hanya ada di `accounts` (`schema_snapshot.sql:1564`), satu baris per perusahaan, dipetakan 1:1 ke kartu Kanban (`PipelineKanbanPage.jsx:711-722`). Akun dengan 5 inquiry tetap **satu kartu**. Tapi `inquiries.status` sudah ada, dan `InquiryListPage.jsx:41-48` sudah merender kosakata `OPEN / IN_REVIEW / QUOTED / WON / LOST / CANCELLED` — persis bentuk yang Target B3 butuhkan. Masalahnya: **satu-satunya penulis kolom itu adalah insert** (`InquiryFormPage.jsx:292`, `status: 'OPEN'`), tidak ada trigger, tidak ada RPC, tidak ada tombol. **Setiap inquiry di produksi permanen `OPEN`**, dan dropdown filter menawarkan lima status yang tidak akan pernah muncul. Cacat yang sama persis di `prf.status`: CHECK-nya mengizinkan 6 nilai, tapi hanya `DRAFT`/`SUBMITTED` yang pernah ditulis (`PRFFormPage.jsx:418`) — `ACKNOWLEDGED`, `QUOTED`, `EXPIRED`, `CANCELLED` **tidak terjangkau**. Jadi jalur ke design target bukan "bikin kolom baru", melainkan "hidupkan dua kolom yang sudah ada" — itu kabar bagus yang tidak tercatat di mana pun.

**3. Semua gate bisnis di Kanban bisa dilewati, dan pintu bypass-nya justru diperlebar minggu lalu.** `PipelineKanbanPage` menegakkan BANT (<5 blok, 5–7 konfirmasi, ≥8 lolos, `:542-552`), soft-gate inquiry untuk PROPOSAL (`:553-561`), soft-gate quotation untuk WON (`:562-570`), `WinLossModal` yang **mewajibkan alasan** (`WinLossModal.jsx:39,45`), dan **form Handover wajib** sebelum WON difinalisasi (`:624-681`). Sementara itu `CustomerDetailPage.pickStage` (`:810-818`) dan `DealDetailPage` (`:240-241`) menulis `pipeline_stage` **langsung** lewat `saveDealUpdate` (`DealPanels.jsx:120-134`) — **nol gate**. Set WON dari situ: trigger `set_customer_on_won` tetap menyala dan akun jadi `customer` (`schema_snapshot.sql:1189-1191`), **tanpa `won_reason`, tanpa baris `deal_handovers`, tanpa cek quotation**. Tahap 3a/3b (19 Jul) menambahkan kontrol Pindah Stage ini ke Detail Account dan memberinya **dua jalan masuk baru** (dari Prospects dan dari Pipeline). TD-94 menyadari Detail Account kini punya kontrol itu — tapi hanya membahas drift `account_status` saat **keluar** dari WON. Bypass saat **masuk** WON tidak tercatat di TD mana pun. TD-58 mencatat `lost_reason` hanya terisi di 3 dari 7 akun LOST — itu kemungkinan besar **jejak** dari jalur bypass ini, bukan kelalaian sales.

**4. Dokumentasi tidak berbohong, tapi bobotnya salah tempat — dan minggu ini ia salah ke dua arah sekaligus.** `CLAUDE.md` menulis bahwa `schema_snapshot.sql` "KEMBALI STALE untuk Tahap A/B", dan `08_TECH_DEBT.md:5` mengulanginya ("masih 10 kolom"). **Keduanya salah**: commit `e13f73d` — commit yang sama yang mengedit `08_TECH_DEBT.md` — sudah me-refresh snapshot; `prf_cost_items` di `schema_snapshot.sql:3925-3928` punya keempat kolom, dan body `save_prf_pricing` di snapshot **identik baris-per-baris** dengan migrasi `20260721000004`. `08_TECH_DEBT.md:5` bahkan **bertentangan dengan `:6`** di file yang sama (`:6` bilang SEGAR). Ke arah sebaliknya: `pg_dump` yang sama diam-diam **menghapus `SET search_path TO 'public'`** dari `save_prf_pricing` — karena migrasi `20260721000004:12` lupa menuliskannya ulang — dan **tidak satu dokumen pun menyebutnya**.

Yang paling mahal dari kelas ini bukan yang stale, tapi yang **mengarahkan perbaikan ke tempat yang salah**. FLAG RBAC di `CLAUDE.md` menyatakan menu `input` di-gate `hasPermission('logistics','view')` dan menyarankan mengubah permission `logistics.view` untuk role `sales`. Terverifikasi ke kode: gate-nya sebenarnya `hasMenuPermission('logistics_input','view')` (`App.jsx:1261-1262` + `MENU_KEY_MAP:1193`), dan `module`/`role` yang tertulis di item itu (`:590`) **tidak pernah dieksekusi** karena short-circuit. Remediasi yang disarankan **tidak akan berefek apa pun** — dan pola item-dengan-deklarasi-mati ini berulang di lima tempat (`:590, 622, 736, 738, 916`). Begitu juga dua klaim lain: TD-102 ditandai DONE padahal penyebut Win Rate baru setengah diperbaiki (`CRMDashboardPage.jsx:1981` masih menambahkan `.length` capped-1000), dan TD-98 "praktis tuntas" padahal dua kapabilitas (`Buat Quotation`, `Summary Harga`) **betul-betul tidak ada** di `CustomerDetailPage`. Polanya konsisten: yang dicatat panjang lebar adalah hal yang sudah diperhatikan; yang lolos adalah mekanika yang tak ada yang memeriksanya ulang.

---

## BAGIAN 1 — KONDISI SEKARANG vs DESIGN TARGET

### TARGET A — Struktur menu CRM (7 menu)

| Item target | Status | Bukti | Selisih |
|---|---|---|---|
| Menu **Dashboard** | ✅ SUDAH | `App.jsx:464` `{id:'crm-dashboard', label:'Dashboard'}` | — |
| Menu **Pipeline** (induk sendiri) | ❌ BELUM | `crm-pipeline` adalah **anak** dari `crm-account` (`App.jsx:474`), bukan menu induk | Pipeline harus dinaikkan jadi induk |
| Pipeline tab **Lead** | ⚠️ SEBAGIAN | Kanban ada (`PipelineKanbanPage`), tapi bukan tab dan berisi 7 stage campur lead+deal (`:17-25`) | Perlu dipecah |
| Pipeline tab **Deal** | ❌ BELUM | Tidak ada papan per-inquiry di mana pun; `grep -rn 'pipeline_stage' src/` → nol referensi ke `inquiries` | Belum ada |
| Pipeline tab **Menunggu harga** | ❌ BELUM | Padanan terdekat = `ProcInquiryForwardingPage` (list PRF, grup **Procurement** bukan CRM, tanpa filter status, `.limit(200)` `:47`) | Belum ada |
| Pipeline tab **Approval** | ⚠️ AMBIGU | Yang ada = `crm-lead-pool-approval` (approval **tarik Lead Pool**), tab di menu Account (`App.jsx:477,511`) | Perlu klarifikasi Den — approval apa? |
| Menu **Akun** | ⚠️ SEBAGIAN | Ada `crm-account` (label "Account", `App.jsx:472`) **dan** `crm-customers` (label "Customer", `:487`) — **dua menu untuk satu tabel** | Perlu digabung |
| Akun tab **Lead pool** | ✅ SUDAH (posisi beda) | `App.jsx:476,510` — tab di menu Account | Sudah tab, tinggal pindah induk |
| Akun **filter lifecycle** | ❌ BELUM | `CustomerListPage` fetch **dipatok** `['customer','free_agent']` (`:314`, `:561-565`); `STATUS_FILTERS` (`:48-51`) hanya 2 opsi | `lead/mql/sql/prospect` tak bisa muncul di menu Customer sama sekali |
| Menu **Aktivitas** | ✅ SUDAH | `App.jsx:494-501`, 3 tab | Target bilang "tidak punya tab" — **selisih** (sekarang 3 tab) |
| Menu **Inquiry** | ✅ SUDAH | `App.jsx:480` | — |
| Menu **Quotation** | ✅ SUDAH | `App.jsx:481` (`quotation-draft`) | — |
| Menu **Sales order** | ✅ SUDAH | `App.jsx:482` (`crm-sales-order`) | — |
| Menu **Rate List** (tidak ada di target) | ⚠️ EKSTRA | `App.jsx:483` | Perlu keputusan: dipertahankan atau dipindah |

**Kesimpulan Target A:** 8 item induk sekarang vs 7 di target. Yang cocok penuh: Dashboard, Inquiry, Quotation, Sales order (4). Yang perlu dirombak: Pipeline (harus keluar dari Account + dapat 4 tab), Akun (harus gabung Account+Customer + lifecycle filter). Yang perlu diputuskan: Rate List, Aktivitas (target bilang tanpa tab, sekarang 3 tab).

### TARGET B1 — Lifecycle akun

| Item | Status | Bukti | Selisih |
|---|---|---|---|
| Kolom lifecycle terpisah dari deal-stage | ✅ SUDAH | `accounts.account_status` (`schema_snapshot.sql:1590`), dipisah dari `pipeline_stage` (`:1564`) sejak 18 Jul (`20260718000001_lifecycle_split_fase2.sql`) | — |
| Nilai dikunci CHECK | ✅ SUDAH | `accounts_account_status_check` (`:1613`) = `lead, mql, sql, prospect, customer, free_agent, lost` | — |
| Urutan `lead → mql → prospect → sql → customer` | ❌ TIDAK COCOK | CHECK memuat `sql` **sebelum** `prospect`; FE `PRA_CUSTOMER_STATUS` juga `lead,mql,sql,prospect` (`InquiryFormPage.jsx:53-...`) | **Target menukar posisi `prospect` dan `sql`.** Perlu konfirmasi apakah ini disengaja |
| Nilai ekstra `free_agent` + `lost` | ⚠️ EKSTRA | Ada di CHECK, tidak ada di target 5-nilai | Perlu keputusan |
| Transisi ke `prospect` otomatis | ✅ SUDAH | Trigger `trg_set_prospect_on_inquiry` (`:7575`) → fungsi `set_prospect_on_inquiry()` (`:1244-1256`), guard `account_status IN ('lead','mql','sql')` | Bekerja, tapi hanya `AFTER INSERT ON inquiries` |
| Transisi ke `customer` otomatis | ⚠️ SUDAH tapi salah pemicu | Trigger `trg_set_customer_on_won` (`:7568`) memicu dari `pipeline_stage='WON'` (`:1189`) | Menempel ke sumbu **deal**, bukan lifecycle — akan pecah kalau WON pindah ke inquiry (lihat §3.4) |
| Transisi `lead→mql`, `mql→sql` | ❌ BELUM | Nol penulis di `src/`; hanya bisa lewat `ProspectFormPage` edit manual | Belum ada aturan |
| Sisa nilai mati `'lead_pool'` di query FE | ⚠️ SAMPAH | 6 query masih `.in('account_status', [... 'lead_pool'])` — `PipelineKanbanPage.jsx:466`, `ProspectListPage.jsx:123`, `CRMDashboardPage.jsx:1866,1962`, `ActivitiesPage.jsx:589`, `CRMDashboardPage.jsx:2185` — padahal **CHECK melarang nilai itu** | TD-91, kosmetik tapi menyesatkan |

### TARGET B2 — Pipeline lead (per perusahaan)

| Item | Status | Bukti | Selisih |
|---|---|---|---|
| Granularitas satu kartu per perusahaan | ✅ SUDAH | `PipelineKanbanPage.jsx:711` `prospects.map(p => …)` — 1 baris `accounts` = 1 kartu | Sudah sesuai target B2 (tapi lihat B3) |
| Nilai hanya `NEW / CONTACTED / QUALIFIED` | ❌ BELUM | `STAGES` = 7 nilai (`:17-25`), termasuk PROPOSAL/NEGOTIATION/WON/LOST | Perlu dipangkas |
| `NEW` otomatis | ✅ SUDAH | `accounts.pipeline_stage DEFAULT 'NEW'` (`schema_snapshot.sql:1564`) | — |
| `CONTACTED` manual | ✅ SUDAH | Drag-drop → `applyStageMove` (`:490-526`) | — |
| `QUALIFIED` otomatis dari BANT ≥ 8 | ❌ BELUM | `handleDropStage` (`:542-552`) — BANT hanya **gate manual**: <5 tolak, 5–7 ConfirmModal, ≥8 lolos. Skor ≥8 **tidak** memindahkan kartu sendiri | Perlu trigger/efek |
| Tidak ada stage `NURTURE` | ❌ MASIH ADA | `ProspectFormPage.jsx:27` `PIPELINE_STAGES` **memuat `'NURTURE'`**; badge di `ProspectListPage.jsx:37` | Pintu masuk masih terbuka; 6 baris nyata (klaim Den, TD-61) |

### TARGET B3 — Pipeline deal (per inquiry)

| Item | Status | Bukti | Selisih |
|---|---|---|---|
| Granularitas satu kartu per inquiry | ❌ **BELUM SAMA SEKALI** | `pipeline_stage` **hanya** ada di `accounts` (`schema_snapshot.sql:1564`; index `:7043`); nol kode membaca stage dari `inquiries` | **Selisih struktural terbesar dari seluruh audit** |
| Kolom kandidat sudah ada | ✅ ADA (mati) | `inquiries.status` (`:3442`, DEFAULT `'OPEN'`, **tanpa CHECK**) | Kolom siap pakai |
| Kosakata `QUOTED / NEGOTIATION / WON / LOST` | ⚠️ SEBAGIAN | `InquiryListPage.jsx:41-48` sudah punya `OPEN, IN_REVIEW, QUOTED, WON, LOST, CANCELLED` — **kurang `NEGOTIATION`**, lebih `IN_REVIEW`+`CANCELLED` | Kosakata perlu diselaraskan |
| `QUOTED` otomatis saat quotation terkirim | ❌ BELUM | `QuotationDetailPage.jsx:258` hanya `update({status:'SENT'})` pada `quotations`; nol sentuhan ke `inquiries`/`accounts` | Belum ada |
| `NEGOTIATION` manual | ❌ BELUM | Nilai tidak ada di `STATUS_META` inquiry | Belum ada |
| `WON` otomatis saat SO dibuat | ❌ BELUM | `SalesOrderDocFormPage.jsx:81-92` hanya insert `sales_orders`; nol sentuhan stage | Belum ada |
| `LOST` wajib alasan | ⚠️ SEBAGIAN | `WinLossModal.jsx:45-46` mewajibkan kategori+detail — **tapi hanya di jalur Kanban**; jalur `pickStage` melewatinya total | Enforcement bocor |
| Nol trigger DB untuk keduanya | ✅ TERKONFIRMASI | Trigger pada `quotations` hanya `trg_quotation_prf_consistency` (`:7554`) dan `trg_z_sync_deal_value_on_quotation_accept` (`:7631`); pada `sales_orders` hanya `set_sales_orders_updated_at` (`:7344`) | — |

### TARGET C — Rantai dokumen

| Mata rantai | Status | Bukti | Catatan |
|---|---|---|---|
| Akun induk semua inquiry | ⚠️ SEBAGIAN | `inquiries.prospect_id` **dan** `inquiries.customer_id` — **dua FK ke tabel yang sama** (`schema_snapshot.sql:8828,8836`) | Dua kolom untuk satu relasi; TD-95 bilang `customer_id` = warisan 0 baris |
| Akun hidup di menu Akun | ❌ BELUM | Terpecah di 4 permukaan: Account›Prospects (pra-customer), Account›Pipeline (pra-customer non-parkir), Account›Lead Pool (parkir), Customer (customer+free_agent) | — |
| Inquiry = akar rantai | ✅ SUDAH | `prf.inquiry_id` (`:9168`), `quotations.inquiry_id` (`:9368`), `sales_orders.inquiry_id NOT NULL` (`:4365`) | Rapi |
| Inquiry lahir → kartu di tab Deal | ❌ BELUM | Tab Deal belum ada | — |
| **PRF = tempat harga diisi** | ⚠️ SEBAGIAN | `prf.suggested_rate`/`rate_currency`/`valid_from`/`valid_until` (`:3898-3902`) + tabel anak `prf_cost_items` (`:3914-3930`) via RPC `save_prf_pricing` | Harga **ada** di PRF, tapi lihat baris berikut |
| Quotation ambil harga dari PRF | ⚠️ SEKALI TEMPEL | `QuotationFormPage.jsx:683-684` — `unit_price = p.suggested_rate`, `cost_price = p.cost_total`, **hanya prefill saat CREATE** (`:643` `if (isEdit \|\| duplicateFrom \|\| !prefillFromPrf) return`) | Bukan tautan hidup; quotation tetap punya harga sendiri yang bebas diedit |
| PRF hanya boleh dari inquiry | ✅ SUDAH | `PRFFormPage.jsx` — picker akun dicabut di `28eb85a`; `inquiry_id` wajib untuk Draft & Submit | — |
| Quotation terkirim → kartu ke QUOTED | ❌ BELUM | Lihat B3 | — |
| SO dibuat → kartu ke WON | ❌ BELUM | Lihat B3 | — |
| Satu SO per inquiry | ✅ SUDAH | `sales_orders_inquiry_unique_live` UNIQUE partial (`:7274`) | Rapi |
| Operasional sengaja putus | ✅ SESUAI | Nol FK dari `sales_orders` ke modul operasional | Sesuai desain |

---

### Jawaban naratif 1.1 – 1.12

#### 1.1 Isi `CRM_MENU_ITEMS` persis (`src/App.jsx:463-502`)

Delapan item induk, urutan sesuai render sidebar:

| # | id | label | icon | Gate |
|---|---|---|---|---|
| 1 | `crm-dashboard` | Dashboard | BarChart2 | menuKey `crm_dashboard` (`MENU_KEY_MAP` `:1184`) |
| 2 | `crm-account` | Account | Users | **tanpa gate sendiri** — visibilitas = OR gate anak (`navChildGate`) |
| 2a | ├ `crm-pipeline` | Pipeline / Leads | Users | menuKey `crm_pipeline` (`:1185`) |
| 2b | ├ `crm-prospects` | Prospects | Users | `module:'crm'` + `role:['super_admin','admin','ceo','gm','manager','sales','operations']` |
| 2c | ├ `crm-lead-pool` | Lead Pool | Archive | `role:['super_admin','admin','ceo','gm','gm_bd','manager','supervisor','sales']` |
| 2d | └ `crm-lead-pool-approval` | Approval Lead Pool | ClipboardCheck | `role:['ceo','gm','gm_bd','manager','supervisor','admin','super_admin']` |
| 3 | `crm-inquiry` | Inquiry | FileText | menuKey `crm_inquiry` (`:1187`) |
| 4 | `quotation-draft` | Quotation | Receipt | menuKey `crm_quotation` (`:1188`) |
| 5 | `crm-sales-order` | Sales Order | ClipboardList | `role:['sales','gm_bd','manager','ceo','admin','super_admin']` |
| 6 | `crm-rate-list` | Rate List | Tag | `role:['super_admin','admin','ceo','gm','gm_bd','manager','sales']` |
| 7 | `crm-customers` | Customer | Building2 | menuKey `crm_customers` (`:1189`) |
| 8 | `crm-aktivitas` | Aktivitas | Activity | **tanpa gate sendiri** — OR gate anak |
| 8a | ├ `crm-calls` | Activities | Activity | `role:['super_admin','admin','ceo','gm','gm_bd','manager','supervisor','sales']` |
| 8b | ├ `crm-activity-log` | Activity Log | History | `role:` sama dengan 8a |
| 8c | └ `riwayat-visit` | Riwayat Visit | History | `role:['super_admin','ceo','gm_bd']` |

**Selisih terhadap Target A**, tepatnya:
- **Kurang:** menu induk `Pipeline` dengan tab Lead/Deal/Menunggu harga/Approval.
- **Kurang:** menu `Akun` tunggal ber-filter lifecycle.
- **Lebih:** `crm-rate-list` (tidak disebut di target).
- **Beda bentuk:** `crm-account` (4 tab) sekarang mencampur Pipeline + Prospects + Lead Pool + Approval; target memecahnya jadi menu Pipeline (4 tab) dan menu Akun (1 tab).
- **Beda bentuk:** `Aktivitas` sekarang 3 tab, target bilang menu selain Pipeline & Akun tidak punya tab.
- **Beda bentuk:** `crm-customers` terpisah dari `crm-account`, padahal keduanya tabel `accounts`.

**Catatan gate yang penting untuk restrukturisasi:** enam item (`crm-lead-pool`, `crm-lead-pool-approval`, `crm-sales-order`, `crm-rate-list`, dan tiga anak `crm-aktivitas`) **tidak punya entri di `MENU_KEY_MAP`** → gate-nya jatuh ke array `role[]`, yang dievaluasi terhadap **`erpRole` primer saja** (`App.jsx:1715` ← `AuthContext.jsx:305` ← `pickPrimaryErpRole`). User multi-role kehilangan hak sekunder — ini **TD-105**, dan setiap menu baru yang Anda tambahkan dengan pola `role[]` akan mewarisi cacat yang sama.

#### 1.2 Tab didefinisikan di satu tempat atau tersebar?

**Tersebar, dua lapis.**

- **Terpusat di `App.jsx`** untuk dua menu bertab: `ACCOUNT_TABS` (`:507-514`) dan `ACTIVITY_TABS` (`:518-524`), keduanya dirender komponen bersama `MenuTabBar` (`:529-549`). Gate tiap tab tetap tinggal di `children` node induk di `CRM_MENU_ITEMS`, ditemukan lewat `findMenuItemById`.
- **Tersebar di halaman masing-masing** untuk tab dalam-halaman: `CustomerDetailPage.jsx:925` (`const TABS` — 9 tab), `CRMDashboardPage.jsx:722` (`DASH_TABS`), `ProductsPage.jsx:62`, `AssetDetailITPage.jsx:514`, `MyProfilePage.jsx:745`.

Konsekuensi untuk design target: menambah tab "Deal" dan "Menunggu harga" ke menu Pipeline **bisa** mengikuti pola `ACCOUNT_TABS` (terpusat, gate per tab, `activeMenu` = id tab). Pola itu sudah terbukti dipakai dua kali. Tapi perhatikan bahwa polanya mensyaratkan tiap tab punya **id menu sendiri** di `CRM_MENU_ITEMS` — jadi tab baru = item gate baru, bukan sekadar konstanta UI.

#### 1.3 `pipeline_stage` ada di tabel apa? Semua kolom status CRM + constraint-nya

**`pipeline_stage` hanya ada di satu tabel: `public.accounts`** (`schema_snapshot.sql:1564`), tipe `character varying DEFAULT 'NEW'`, **tanpa CHECK constraint**. Ada index `idx_prospects_pipeline_stage` (`:7043`). Satu-satunya tempat lain namanya muncul adalah tabel backup `accounts_lifecycle_backup_20260718` (`:1626`).

Inventaris lengkap kolom status/stage di rantai CRM:

| Tabel | Kolom | Default | CHECK constraint | Nilai |
|---|---|---|---|---|
| `accounts` | `pipeline_stage` | `'NEW'` | **TIDAK ADA** | de-facto dari FE: NEW, CONTACTED, QUALIFIED, PROPOSAL, NEGOTIATION, WON, LOST (+ **NURTURE** dari `ProspectFormPage.jsx:27`) |
| `accounts` | `account_status` | `'lead'` | ✅ `accounts_account_status_check` (`:1613`) | lead, mql, sql, prospect, customer, free_agent, lost |
| `accounts` | `pull_status` | — | ✅ `accounts_pull_status_check` (`:1614`) | pending, approved, rejected |
| `accounts` | `is_in_lead_pool` | `false` | boolean | — |
| `inquiries` | `status` | `'OPEN'` | **TIDAK ADA** | de-facto FE (`InquiryListPage.jsx:41-48`): OPEN, IN_REVIEW, QUOTED, WON, LOST, CANCELLED |
| `quotations` | `status` | `'DRAFT'` | **TIDAK ADA** | de-facto FE (`QuotationListPage.jsx:24-30`): DRAFT, SENT, ACCEPTED, REJECTED, SUBMITTED |
| `prf` | `status` | `'DRAFT'` | ✅ `prf_status_check` (`:3906`) | DRAFT, SUBMITTED, ACKNOWLEDGED, CANCELLED, QUOTED, EXPIRED |
| `sales_orders` | `status` | `'DRAFT'` | ✅ `sales_orders_status_check` (`:4375`) | DRAFT, SENT |
| `deal_handovers` | `status` | — | ✅ (`:2842`) | draft, submitted, approved |
| `top_requests` | `status` | — | ✅ (`:4815`) | draft, submitted, approved, rejected |

**Temuan yang perlu digarisbawahi:** tiga kolom status paling sentral di rantai CRM — `accounts.pipeline_stage`, `inquiries.status`, `quotations.status` — **semuanya varchar bebas tanpa CHECK**. Itulah sebabnya `NURTURE` bisa masuk tanpa hambatan, dan itulah yang membuat design target rentan: nilai apa pun yang salah ketik akan tersimpan diam-diam.

#### 1.4 KRITIS — Pipeline lead dan pipeline deal baca dari sumber yang sama atau beda?

**SAMA. Satu kolom, satu tabel, satu baris per perusahaan: `accounts.pipeline_stage`.**

Bukti: `PipelineKanbanPage.jsx:463` menarik `accounts` (bukan `inquiries`), memetakan tiap baris jadi satu objek deal di `:711-722` dengan `stage: (p.pipeline_stage || 'NEW').toLowerCase()`. Tujuh kolom Kanban (`:893`) memfilter array yang sama. Nol query ke `inquiries` kecuali satu `count(head)` di soft-gate PROPOSAL (`:554-557`).

**Konsekuensi untuk Target B2 vs B3 — dan ini inti masalahnya:**

Target B2 dan B3 punya **granularitas yang berbeda dan tidak bisa direkonsiliasi di satu kolom**. B2 bilang "satu kartu per perusahaan" (`accounts` — satu baris per perusahaan). B3 bilang "satu kartu per inquiry" (`inquiries` — banyak baris per perusahaan). Kolom yang sekarang dipakai hidup di sisi **perusahaan**, jadi:

1. **B2 sudah otomatis benar** — granularitasnya memang per perusahaan.
2. **B3 tidak bisa dibangun di atas kolom yang sama.** Kalau akun X punya inquiry A (sudah quotation) dan inquiry B (baru masuk), tidak ada tempat untuk menyimpan "A di QUOTED, B di belum-apa-apa". Satu kolom hanya bisa memegang satu nilai.
3. **Nilai PROPOSAL / NEGOTIATION / WON / LOST yang sekarang ada di `accounts.pipeline_stage` sebenarnya milik sumbu B3**, bukan B2. Mereka sedang menumpang di tabel yang salah.
4. Karena menumpang, **stage deal terakhir menimpa stage deal sebelumnya**. Akun yang WON di inquiry A lalu dapat inquiry B baru: kartunya sudah di kolom Won, dan inquiry B tidak punya representasi visual apa pun.
5. Trigger `set_customer_on_won` (`schema_snapshot.sql:1189`) ikut menumpang di sumbu yang salah: ia mengubah **lifecycle akun** berdasarkan **stage deal**. Begitu WON pindah ke `inquiries`, trigger ini berhenti bekerja.

**Kolom untuk B3 sudah ada dan mati:** `inquiries.status` (lihat 1.12 dan §3.3).

#### 1.5 Satu akun banyak inquiry → berapa kartu di Kanban?

**Tetap SATU kartu.** Selalu, berapa pun jumlah inquiry-nya.

Kode: `PipelineKanbanPage.jsx:711-722`
```js
const deals = prospects.map(p => ({
  id:      p.id,          // ← id ACCOUNT, bukan inquiry
  co:      p.name,
  stage:   (p.pipeline_stage || 'NEW').toLowerCase(),
  raw:     p,
}));
```
`prospects` diisi dari query di `:461-474` yang hanya menyentuh tabel `accounts`. Tidak ada join, tidak ada flatMap, tidak ada perkalian baris. Satu baris `accounts` → satu objek deal → satu `<DealCard>` (`:930`).

Konsekuensi operasional yang perlu Den sadari sekarang: **sales dengan akun besar (mis. Indomarco) yang punya banyak permintaan aktif hanya melihat satu kartu**, dan menggeser kartu itu ke NEGOTIATION berarti "akunnya sedang negosiasi", bukan "permintaan yang mana". Itu bukan bug — itu memang model yang sekarang — tapi itu persis alasan Target B3 dibuat.

#### 1.6 Semua sumber angka di header Pipeline dan kolom Kanban — kenapa 156 vs 150?

**Tiga angka, tiga query berbeda:**

**(A) Header halaman Pipeline** — `PipelineKanbanPage.jsx:766`, nilai `activeCount` dari `:741`:
```js
const activeCount = filteredDeals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;
```
Sumber: query `:461-474` — `accounts` WHERE `account_status IN (lead,mql,sql,prospect,lead_pool)` AND `is_in_lead_pool = false` AND `deleted_at IS NULL`, scope role-aware (`:471-472`), **TANPA `.limit()`**. Perhitungan client-side: buang yang `won`/`lost`, hitung sisanya.

**(B) Kolom Kanban** — `:894`, dan **identik di list-view `:953`**:
```js
const items = sortDeals(filteredDeals.filter(d => d.stage === stage.id), sortMode);
```
di-loop atas `STAGES` (`:17-25`) yang berisi **tujuh id: new, contacted, qualified, proposal, negotiation, won, lost**. Karena kedua mode tampilan memakai filter yang sama, **berpindah ke list-view tidak memunculkan baris yang hilang** — kartunya lenyap di kedua tampilan.

**(C) Kartu "Prospect Aktif" CRM Dashboard** — `CRMDashboardPage.jsx:1959-1966`: server `count(head)` atas `accounts` dengan kriteria hampir sama plus `.or('pipeline_stage.is.null,pipeline_stage.not.in.(WON,LOST)')`.

**Mekanisme selisih 156 vs 150 — terkonfirmasi di kode:**

Baris ber-`pipeline_stage` yang **tidak ada di `STAGES`** ikut dihitung di (A) — karena syaratnya hanya "bukan won, bukan lost" — tetapi **tidak dirender di kolom mana pun** di (B), karena tidak ada `stage.id` yang cocok. Enam baris `NURTURE` jatuh persis di celah itu. 156 − 150 = 6.

**Apakah NURTURE satu-satunya penyebab? TIDAK.** Ada dua sumber divergensi lain yang **tidak tercatat di TD-104**:

1. **Query Pipeline tidak punya `.limit()` sama sekali** (`:461-474`). Ia bergantung pada batas baris default server. Aturan wajib di `CLAUDE.md` menuntut `.limit(1000)` eksplisit di setiap fetch; query ini melanggarnya. Begitu populasi pra-customer melewati batas default, **header DAN kolom sama-sama terpotong** (jadi tidak memperlebar selisih 156/150), tetapi **kartu Dashboard (C) tidak** — karena `count(head)` tidak kena batas baris. Jadi begitu batas itu tergigit, (C) akan melampaui (A) tanpa penjelasan di layar.
2. **Scope entitas berbeda secara struktural untuk `super_admin`.** Pipeline: `if (!isAllEntities) query = query.eq('company_id', …)` (`:471`) — jadi super_admin melihat **tiga entitas**. Dashboard: `.eq('company_id', cid)` **tanpa syarat** (`:1962`) — selalu satu entitas. Untuk super_admin, (A) dan (C) menghitung **populasi yang berbeda**. Sekarang kebetulan sama karena data CRM terpusat di MSI (ini **TD-101**), dan akan langsung divergen begitu JCI/SOA punya akun CRM.

**Yang BUKAN penyebab, sudah saya periksa:** join yang menggandakan baris — tidak ada; kedua query hanya memakai embed to-one (`assigned_profile:profiles!…`), yang tidak memperbanyak baris. Filter `is_in_lead_pool = false` — identik di (A) dan (C). Perlakuan `pipeline_stage` NULL — konsisten (Pipeline memetakan `|| 'NEW'`, Dashboard memasukkannya eksplisit lewat `.or(...is.null...)`).

**Efek samping ketiga yang belum tercatat:** `stageIndex` di `DealPanels.jsx:47-50` mengembalikan **0 (= NEW)** untuk stage yang tidak dikenal. Jadi akun NURTURE yang dibuka di Detail Account menampilkan stepper di posisi "New" — **salah tampil tanpa gejala**, bukan sekadar hilang.

#### 1.7 NURTURE masih ada di mana? Berapa barisnya?

**Masih ada di kode, di TIGA tempat:**
- `src/modules/crm/ProspectFormPage.jsx:27` — `PIPELINE_STAGES` memuat `'NURTURE'` → **pintu masuknya masih terbuka**, user masih bisa menyetelnya hari ini.
- `src/modules/crm/ProspectFormPage.jsx:28` — `STAGE_DOT.NURTURE`.
- `src/modules/crm/ProspectListPage.jsx:37` — badge `NURTURE` (ungu).

**TIDAK ada di:** `PipelineKanbanPage.jsx` `STAGES` (`:17-25`), `DealPanels.jsx` `STAGES` (`:38-46`), dan `supabase/functions/aging-pipeline/index.ts` `AGING_RULES` (`:4-10`).

**Di DB: tidak ada CHECK constraint pada `pipeline_stage`** → tidak ada yang mencegah nilai ini.

**Jumlah baris: 6.** ⚠️ **Angka ini dari `08_TECH_DEBT.md` TD-61 ("6 akun, terakhir bergerak 25 Jun 2026") dan CLAUDE.md, bukan dari query yang saya jalankan.** SQL untuk memverifikasinya:
```sql
SELECT pipeline_stage, count(*) FROM public.accounts
WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;
```

**Temuan tambahan tentang aging yang belum tercatat di mana pun:** `AGING_RULES` di Edge Function memuat `NEW: 7` (`aging-pipeline/index.ts:5`), tetapi `AGING_LIMITS` di Kanban (`PipelineKanbanPage.jsx:169`) **tidak memuat `new`** — hanya contacted/qualified/proposal/negotiation. Artinya lead di stage NEW **akan disapu ke Lead Pool setelah 7 hari tanpa pernah menampilkan badge peringatan apa pun di kartunya.** Sales tidak punya cara melihatnya datang.

#### 1.8 Skor BANT — kolom, ambang, penegakan

**Kolom: SUDAH ADA.** Empat kolom `smallint DEFAULT 0` di `accounts`: `bant_budget`, `bant_authority`, `bant_need`, `bant_timeline` (`schema_snapshot.sql:1600-1603`), plus `bant_score integer DEFAULT 0` (`:1589`) sebagai turunan tersimpan, plus tujuh kolom kualitatif lama (`bant_commodity`, `bant_origin`, …).

**Perhitungan: di UI saja.** `src/modules/crm/bant.js:56-57`:
```js
export const calcBantScore = (obj) =>
  BANT_DIMENSIONS.reduce((sum, d) => sum + (Number(obj?.[d.key]) || 0), 0);
```
Maks 12 (`:54`). Ambang di `:59-63`: ≥8 Qualified, ≥5 Nurture, <5 Disqualify.

**Ambang ≥8 ditegakkan DI MANA: hanya di UI, hanya di satu jalur.** `PipelineKanbanPage.jsx:542-552`:
```js
if (newStage === 'QUALIFIED') {
  const score = calcBantScore(prospect);
  if (score < 5) { showToast?.(`BANT score terlalu rendah (${score}/12)…`, 'error'); return; }
  if (score < 8) { setStageGate({ open:true, …, type:'qualified', score }); return; }
}
```
**Di DB: nol.** `grep "bant" supabase/schema_snapshot.sql` di luar definisi kolom → hanya satu hit tak relevan (`asset_*.bant_collected`). Tidak ada trigger, tidak ada CHECK, tidak ada fungsi.

**Transisi ke QUALIFIED: MASIH MANUAL, dan gate-nya bisa dilewati.**
- Manual: skor ≥8 tidak memindahkan kartu. Ia hanya membuat drag-drop **tidak diprotes**.
- Bisa dilewati: `CustomerDetailPage.jsx:810-818` (`pickStage`) dan `:828-843` (`saveDealEdit`) serta `DealDetailPage.jsx:240-241` menulis `pipeline_stage` lewat `saveDealUpdate` (`DealPanels.jsx:120-134`) **tanpa memanggil `calcBantScore` sama sekali**. User bisa menyetel QUALIFIED dengan skor 0 dari Detail Account.

Target B2 minta QUALIFIED **otomatis** dari BANT ≥8. Jarak dari kondisi sekarang: perlu (a) trigger/efek yang memindahkan stage saat skor menembus 8, dan (b) menutup jalur tulis yang tidak ter-gate — kalau tidak, otomatisasinya akan langsung ditimpa manual.

#### 1.9 Jalur harga — PRF menyimpan di mana, Quotation ambil dari mana?

**PRF menyimpan harga di dua tempat:**

*Header* — tabel `prf` (`schema_snapshot.sql:3898-3905`):
`suggested_rate numeric(18,2)` (harga jual usulan) · `rate_currency text NOT NULL DEFAULT 'IDR'` · `valid_from date` · `valid_until date` · `pricing_notes text` · `answered_by uuid` · `answered_at timestamptz` · `exchange_rates jsonb NOT NULL DEFAULT '{}'`.

*Rincian modal* — tabel `prf_cost_items` (`:3914-3930`):
`prf_id` · `component` · `cost_type` (CHECK vendor/internal) · `amount numeric(18,2)` · `currency text` (FK → `currencies(code)`, `:9140`) · `sort_order` · `notes` · **+4 kolom Tahap A**: `vendor_id uuid` (FK → `vendors`) · `item_group text` (nullable, tanpa CHECK) · `is_awarded boolean NOT NULL DEFAULT true` · `exchange_rate numeric NOT NULL DEFAULT 1`.

Ditulis lewat RPC atomik `save_prf_pricing(p_prf_id, p_header, p_items)` (`schema_snapshot.sql:1031`), `SECURITY INVOKER`.

**Quotation TIDAK mengambil harga dari PRF secara hidup. Ia menyalinnya SEKALI saat form dibuka.**

`QuotationFormPage.jsx:643` menjaga agar prefill hanya jalan sekali dan hanya untuk CREATE:
```js
if (isEdit || duplicateFrom || !prefillFromPrf) return;
```
Isinya (`:678-687`): satu baris item dengan `unit_price: Number(p.suggested_rate) || 0` dan `cost_price: Number(p.cost_total) || 0`. `p.cost_total` dihitung di `PRFDetailPage.jsx:233-234, 354` (Σ `prf_cost_items` yang ter-award, dikonversi ke IDR pakai kurs yang diinput).

Setelah itu **quotation sepenuhnya berdiri sendiri**: harga hidup di `quotation_items.unit_price` / `cost_price` / `currency` / `exchange_rate`, dan user bebas mengubahnya. `quotations.prf_id` (`:4213`) hanya menyimpan **jejak asal**, bukan tautan harga. Trigger `trg_quotation_prf_consistency` (`:7554`) menjaga konsistensi `prf_id ↔ inquiry_id`, bukan harga.

**Jadi jawaban tegas untuk klaim "harga diisi di PRF, bukan di quotation": SEBAGIAN BENAR.** Harga memang **berasal** dari PRF, tapi quotation tetap **memiliki salinannya sendiri yang bisa menyimpang tanpa jejak**. Kalau PRF direvisi setelah quotation dibuat, quotation tidak tahu.

**⚠️ Temuan baru pada jalur ini — pemblokiran non-IDR bisa dilewati.** `PRFDetailPage.jsx:215` mengambil `rc = answer.rate_currency` (**state form, belum tersimpan**) dan `:237` memakai `rc` untuk menentukan `quotationBlockReason`. Tetapi `handleCreateQuotation` (`:348-355`) mengirim `rate_currency: prf.rate_currency` (**nilai DB**) dan `suggested_rate: num(prf.suggested_rate)` (**nilai DB**), sementara `cost_total: costTotalIdr` (**state form**). Dua akibat:
1. PRF yang tersimpan `rate_currency='USD'` → user ubah dropdown ke IDR **tanpa menyimpan** → tombol aktif → payload tetap mengirim `USD` ke jalur yang sengaja ditutup karena TD-120/TD-121.
2. Bahkan di jalur normal, `suggested_rate` datang dari DB sementara `cost_total` datang dari form yang belum disimpan → quotation bisa lahir dengan **modal dan harga jual dari dua versi PRF yang berbeda**.

#### 1.10 Transisi otomatis QUOTED dan WON — sudah ada trigger/RPC?

**Belum ada. Nol. Untuk keduanya.**

*Quotation terkirim → QUOTED:* `QuotationDetailPage.jsx:258` adalah satu-satunya penulis:
```js
.update({ status: 'SENT', quote_sent_at: nowIso, updated_by: profile.id })
```
Ia menyentuh tabel `quotations` saja. Nol update ke `accounts.pipeline_stage`, nol ke `inquiries.status`.

*SO dibuat → WON:* `SalesOrderDocFormPage.jsx:81-92` hanya `insert` ke `sales_orders`. Nol sentuhan stage.

**Trigger yang ada pada kedua tabel, lengkap:**
- `quotations`: `trg_quotation_prf_consistency` (`:7554`, konsistensi `prf_id`↔`inquiry_id`) dan `trg_z_sync_deal_value_on_quotation_accept` (`:7631`).
- `sales_orders`: hanya `set_sales_orders_updated_at` (`:7344`).

**`sync_deal_value_on_quotation_accept` (`:1450-1474`) layak dilihat lebih dekat karena hampir relevan tapi mati.** Ia menyala saat `NEW.status = 'ACCEPTED'` dan hanya menyalin `total_amount` ke `accounts.estimated_value` — **tidak menyentuh stage**. Dan ia **tidak akan pernah menyala**: `grep -rn "'ACCEPTED'" src/` menemukan dua hit, keduanya **pembacaan** (`QuotationListPage.jsx:48`, `DealPanels.jsx:438`); **tidak ada satu pun kode yang menulis** `status='ACCEPTED'`. Ini trigger yatim.

**Satu-satunya penulis WON: manual.** Tiga jalur, dan hanya satu yang ber-gate:
1. `PipelineKanbanPage` drag → `applyStageMove` → `handleWinLossSave` → `handleHandoverSubmit` → `finalizeWon` (`:602-621`). **Ber-gate penuh.**
2. `CustomerDetailPage.pickStage` (`:810-818`) → `saveDealUpdate`. **Nol gate.**
3. `DealDetailPage` (`:240-241`) → `updateAccount`. **Nol gate.**

Jalur 2 dan 3 melewati `saveDealUpdate` (`DealPanels.jsx:120-134`), yang isinya persis satu `.update()` plus `logAudit`. Trigger `set_customer_on_won` tetap menyala di ketiga jalur, jadi jalur 2 dan 3 **membuat customer baru tanpa `won_reason` dan tanpa baris `deal_handovers`**.

#### 1.11 `is_in_lead_pool` dipakai sebagai apa? Semua picker sudah difilter?

**Sebagai TAB** (`crm-lead-pool`, `App.jsx:476` + `ACCOUNT_TABS` `:510`) yang merender `LeadPoolPage`, ditambah **badge** di list (`CustomerListPage.jsx:222`, `ProspectListPage.jsx:266`, `CustomerDetailPage.jsx:1040`). Aturan dua-sumbu yang berlaku sekarang: **tempat aksi (picker) difilter, daftar baca tidak** (akun parkir tetap tampil dengan badge).

**Picker yang SUDAH memfilter `is_in_lead_pool = false`:**

| Lokasi | Baris |
|---|---|
| `InquiryFormPage` — dropdown prospect | `:176` |
| `InquiryFormPage` — dropdown customer | `:178` |
| `ActivitiesPage` — picker akun | `:589` |
| `CRMDashboardPage` — picker visit (AddVisitModal) | `:2185` |
| `PipelineKanbanPage` — sumber kartu | `:467` |

**Yang BOLONG — tiga, dan salah satunya adalah regresi minggu ini:**

1. **`PRFFormPage` — filternya HILANG.** Commit `8fc8878` (18 Jul) menambahkan `.eq('is_in_lead_pool', false)` ke dua picker akun di file itu. Commit `28eb85a` (20 Jul, "PRF hanya bisa dibuat dari inquiry") **menghapus kedua picker itu** — benar secara desain — tetapi dropdown pengganti (`PRFFormPage.jsx:199`, list `inquiries`) **tidak punya penyaring akun parkir sama sekali**:
   ```js
   supabase.from('inquiries').select('id, inquiry_no, customer_id, prospect_id, …')
     .eq('company_id', cid).is('deleted_at', null).order('created_at',…).limit(1000)
   ```
   Akibatnya: inquiry milik akun yang sedang parkir tetap bisa dipilih → **PRF baru bisa lahir untuk akun parkir**, persis yang dilarang aturan 18 Jul. `grep is_in_lead_pool src/modules/procurement/` → **0 hit**.
2. **`QuotationFormPage` dan `SalesOrderDocFormPage`** — picker inquiry, sengaja tidak difilter (dicatat di `CLAUDE.md` sebagai keputusan: akun diturunkan dari inquiry). Keputusan itu masuk akal **jika** gerbangnya ada di pembuatan inquiry. Tapi akun bisa **diparkir setelah** inquiry-nya lahir (Edge Function `aging-pipeline` melakukannya otomatis) — jadi gerbangnya bocor di semua dokumen hilir.
3. **`db.js:listCustomers`** — sengaja customer-only untuk jalur SP/AR, dicatat sebagai keputusan sadar.

**Kesimpulan jujur:** klaim "semua picker konteks-aksi sudah difilter" **tidak lagi berlaku per 20 Jul 2026**. Gerbang Lead Pool sekarang hanya berdiri di titik pembuatan inquiry dan di Kanban; seluruh rantai dokumen hilir (PRF, Quotation, SO) tidak menegakkannya.

#### 1.12 Tab "Menunggu harga" dan "Approval" — ada padanannya?

**"Menunggu harga": BELUM ADA.** Tidak ada tab, tidak ada halaman, tidak ada query dengan filter semacam `answered_at IS NULL`. `grep -rn "answered_at" src/` → tiga hit, **semuanya di `PRFDetailPage.jsx`** (`:54` select, `:342` gate tombol Buat Quotation, `:492` label "Dijawab oleh…"). Nol di list mana pun.

Yang paling mendekati adalah `ProcInquiryForwardingPage` — list PRF di grup **Procurement**, bukan CRM. Tapi ia bukan padanan:
- Menampilkan **semua** status PRF tanpa filter (`:41-49`).
- Tidak punya kolom/indikator "sudah dijawab atau belum" (`answered_at` tidak ikut di-select).
- `.limit(200)` (`:47`) — melanggar aturan `.limit(1000)` di `CLAUDE.md`, dan akan memotong diam-diam begitu PRF melewati 200.

**"Approval": AMBIGU, dan saya tidak akan menebak.** Yang ada bernama "Approval" adalah `crm-lead-pool-approval` → `LeadPoolApprovalPage` (`App.jsx:477`), yaitu approval **permintaan sales menarik akun keluar dari Lead Pool**. Itu urusan kepemilikan lead, bukan urusan pipeline deal. Kalau yang Anda maksud approval **harga/diskon** — itu **tidak ada**: `09_ROADMAP` mencatat matriks otoritas diskon sebagai **UI-saja tanpa enforcement** (TD-38), `quotations.margin_floor` hanya passthrough payload, dan tidak ada baris approval yang pernah ditulis ke mana pun. Kalau yang Anda maksud approval **SO/handover** — `deal_handovers` dan `top_requests` punya kolom `status` dengan nilai `approved`, tetapi **tidak ada UI approval** untuk keduanya; keduanya selalu di-insert `'submitted'` (`PipelineKanbanPage.jsx:671`).

---

## BAGIAN 2 — PEKERJAAN MINGGU INI (15–22 Jul 2026)

### 2.1 Kronologi

63 commit, semuanya sudah di `main`. Diringkas per hari (nama branch dari `git branch --contains`; sesuai aturan `CLAUDE.md`, status merge **tidak** saya salin ke dokumen governance mana pun — ini laporan audit, bukan dokumen kanonik).

| Tgl | Commit | Branch asal | Perubahan nyata | File inti |
|---|---|---|---|---|
| 15 Jul | `afc948d` | `fix/number-input-scroll` | Cegah scroll mengubah nilai di 16 field number | 16 file FE |
| 15 Jul | `1ff0ffb` | `feat/detail-sp-reskin` | Reskin soft-tone Detail SP (UI-only) | `SalesOrderDetailPage.jsx` |
| 15 Jul | `4f502d9`, `3e47c73` | — | Redeploy trigger + merge font | — |
| 16 Jul | `7f48159` | `fix/number-input-zero` | Default 0/1 tak hilang saat diketik, 9 field | 9 file FE |
| 16 Jul | `595ab51` | — | Kunci Unit Price read-only di Edit Item SP | `SalesOrderDetailPage.jsx` |
| 16 Jul | `5fd2a09` | — | Rekam migrasi `sp_items.price_category` + `review_status` | `20260716000000_*.sql` |
| 17 Jul | `7deee3a` | — | **Tabel kurs manual per-quotation** (`quotations.exchange_rates`) | `QuotationFormPage.jsx` + 2 migrasi |
| 17 Jul | `dd032b0`, `0d9f26f` | — | Roster operasional bersama + `gm_bd` di `can()` | `salesRoster.js`, `App.jsx` |
| 17 Jul | `7eab6a1`…`f49bc75` (6) | — | Konsolidasi governance: arsip audit 11–18, canon jadi 00–10 | `docs/` |
| 18 Jul | `08ec4b4` | `feat/lifecycle-split` | **Pisah `account_status` (lifecycle) dari `is_in_lead_pool`** — 6 file, tanpa DB | 5 FE CRM + EF `aging-pipeline` |
| 18 Jul | `b2e3fb2` | `feat/lifecycle-split` | Fase 1.5 — buka deadlock gerbang, perluas read-selector | 10 file FE |
| 18 Jul | `8fc8878` | `feat/lifecycle-split` | **Gate akun parkir di semua picker** (termasuk `PRFFormPage`) | 5 file FE |
| 18 Jul | `d0d0dbc`, `9cc24ff` | `feat/sales-order` | **UI entitas Sales Order** (list/form/detail, menu 2 sisi) | `src/modules/sales-order/*` |
| 18 Jul | `3bbf281` | `feat/sales-order` | Rekam migrasi `sales_orders` + refresh snapshot | `20260718000000_*.sql` |
| 18 Jul | `83238c3` | `feat/cetak-prf` | Cetak PRF dari inquiry + panel Daftar PRF + list Forwarding MSI | `PRFFormPage`, `DealDetailPage`, `App.jsx` |
| 19 Jul | `e10de30` | — | Rekam migrasi lifecycle fase 2 + refresh snapshot | `20260718000001_*.sql` |
| 19 Jul | `4e541b3` | `feat/crm-nav-refactor` | **Nav tahap 1** — satu-sumber `CRM_MENU_ITEMS`, fix id `crm-group`, hapus 2 file dead (−1.549 baris) | `App.jsx` |
| 19 Jul | `f2bbd76` | `feat/crm-nav-tahap2a` | **Nav 2a** — 5 menu Master Customer → 1 "Customer" | `App.jsx`, `CustomerListPage.jsx` |
| 19 Jul | `b857adf` | `feat/crm-nav-tahap2b` | **Nav 2b** — 4 menu → 1 "Account" bertab | `App.jsx` |
| 19 Jul | `ecfc032` | `feat/crm-nav-tahap2c` | **Nav 2c** — 3 menu → 1 "Aktivitas" bertab; `riwayat-visit` pindah grup | `App.jsx`, `RiwayatVisitPage.jsx` |
| 19 Jul | `16b2894` | `feat/crm-detail-tahap3a` | **Ekstrak `DealPanels.jsx`** (463 baris baru) + Detail Account 9 tab | `CustomerDetailPage.jsx`, `DealDetailPage.jsx` |
| 19 Jul | `ca36450` | `feat/crm-detail-tahap3b` | Jalan masuk Detail Account dari Prospects & Pipeline; hapus `ProspectDetailModal` | `PipelineKanbanPage.jsx`, `ProspectListPage.jsx` |
| 19 Jul | `aa9ae45` | `feat/crm-edit-inquiry-cdp` | Edit Inquiry dari Detail Account + badge status | `App.jsx`, `CustomerDetailPage.jsx` |
| 19 Jul | `c5878af` | `feat/crm-view-quote-prf-cdp` | Lihat Quotation + Cetak PRF dari Detail Account | `App.jsx`, `CustomerDetailPage.jsx` |
| 19 Jul | `60c2a6f` | `feat/crm-edit-inquiry-gate-menuperm` | Gate Edit Inquiry → `hasMenuPermission` | `App.jsx` (1 baris) |
| 19 Jul | `18935af` | `feat/crm-dashboard-prospect-count` | Kartu Prospect Aktif pakai `count(head)` | `CRMDashboardPage.jsx` |
| 19 Jul | `7442eb4` | `feat/prf-prefill-from-inquiry` | Prefill PRF dari inquiry + teks bantu field lossy | `PRFFormPage.jsx` |
| 20 Jul | `28eb85a` | `feat/prf-inquiry-only` | **PRF hanya dari inquiry** — cabut picker Customer/Prospect | `PRFFormPage.jsx` (+28/−50) |
| 20 Jul | `763edc4` | `feat/prf-pricing-answer` | **Panel Jawaban Harga PRF** + `PRFDetailPage` baru + RPC `save_prf_pricing` | 3 FE + 2 migrasi |
| 20 Jul | `8054873` | `feat/prf-pricing-answer` | Guard anti gagal-diam `save_prf_pricing` + refresh snapshot | `20260720000002_*.sql` |
| 20 Jul | `753694e`, `81a608d` | — | **Tombol Buat Quotation dari PRF** + kolom `quotations.prf_id` + trigger konsistensi | 3 FE + `20260720000003_*.sql` |
| 20 Jul | `bb1195c` | — | Dashboard berhenti pakai angka capped-1000 | `CRMDashboardPage.jsx` |
| 20 Jul | 8 commit `docs:` | — | Sinkronisasi status commit, audit doc-chain & pipeline-menu | `docs/`, `AUDIT_*.md` |
| 21 Jul | `1bae222` | — | **Rombak RLS `vendors` (5→4 policy)** + FK currency `prf_cost_items` + `prf.exchange_rates` | 2 migrasi + snapshot |
| 21 Jul | `6cdb52c` | — | **`VendorListPage.jsx` baru (402 baris)** + filter arsip di Penerimaan Barang | `App.jsx`, 2 file |
| 21 Jul | `06f95ce` | — | Cabut `deleted_at IS NULL` dari `vendors_select` + refresh snapshot | `20260721000002_*.sql` |
| 21 Jul | `587aa7b` | — | **PRF multi-vendor Tahap A+B** (4 kolom + RPC toleran + guard) | 2 migrasi |
| 22 Jul | `565dae4` | — | **PRF multi-vendor Tahap C** — panel Jawaban Harga jadi multi-vendor (+477/−143) | `PRFDetailPage.jsx` |
| 22 Jul | `e13f73d` | — | Docs Tahap C + **refresh snapshot A/B** + arsip 2 audit | 10 file |

**Pola yang terlihat dari kronologi:** minggu ini punya dua tema besar yang **tidak saling bergantung** — (1) restrukturisasi CRM (18–19 Jul: lifecycle, nav 3 tahap, detail 2 tahap, penutupan TD-98) dan (2) rantai PRF/procurement (20–22 Jul: pricing answer, prf_id, vendors, multi-vendor). Tema (1) berhenti mendadak di 19 Jul dan tidak dilanjutkan. Itu penting untuk §3.3.

### 2.2 Verifikasi klaim "selesai"

| # | Klaim | Status | Bukti |
|---|---|---|---|
| **a** | RLS `vendors` company-scoped via `20260721000000`, TD-47 ditutup | ✅ **TERBUKTI** | Tepat **4** policy di snapshot, semua `TO authenticated`: `vendors_delete:12599`, `vendors_insert:12606`, `vendors_select:12613`, `vendors_update:12620`. `vendors_read`/`vendors_modify` = **0 hit**. Role legacy `procurement_head`/`procurement_staff` = **0 hit** di snapshot maupun `src/` (sisa hanya di file migrasi arsip `20260524000005:176-177`, `20260524000014:631-632`) |
| **b** | CRUD Master Vendor lengkap | ⚠️ **SEBAGIAN** | Ada & benar-benar menulis: list `VendorListPage.jsx:100-106`, insert `:192-194` (**`company_id` di-set** ✅), edit `:139`+`:189`, soft delete `:219-221`. Hard delete = **0** (2 hit `.delete(` keduanya komentar, `:5`/`:214`). **TAPI:** `payment_terms_id` **nol pintu masuk UI** (`grep payment_terms_id src/modules/procurement/` → 0 hit) dan **nol jalur restore** (`grep "deleted_at: null" src/modules/procurement/` → 0 hit) |
| **c** | Bug 42501 dicabut lewat `20260721000002` | ⚠️ **SEBAGIAN — mekanisme TETAP TERBUKA** | Migrasi hanya melakukan satu hal (`:9-13`): `ALTER POLICY vendors_select` mencabut `AND deleted_at IS NULL`. Snapshot `:12613` cocok. **Tetapi penjelasan "WITH CHECK gagal" tidak didukung teks policy** — `vendors_update` WITH CHECK (`:12620`) tidak menyebut `deleted_at`; yang dicabut adalah policy **SELECT**, bukan UPDATE. Dokumen sudah menandainya sebagai pertanyaan terbuka (`08_TECH_DEBT.md:6`) — **itu jujur, jangan diturunkan jadi fakta** |
| **d** | Filter arsip di Penerimaan Barang | ✅ **TERBUKTI** | `PenerimaanBarangPage.jsx:332-336` — ketiga filter ada (`company_id`, `is_active`, `deleted_at IS NULL`). ⚠️ `company_id` = **`soa.id` hardcode** (`:315`), bukan company user — lihat TD-118 |
| **e** | PRF Tahap A — 4 kolom, backward compatible | ✅ **TERBUKTI** | `20260721000003:10-14` — `vendor_id` nullable, `item_group` **nullable tanpa CHECK**, `is_awarded NOT NULL DEFAULT true` (baris lama otomatis pemenang → angka modal lama tak berubah), `exchange_rate NOT NULL DEFAULT 1`. Satu-satunya CHECK di tabel tetap `prf_cost_items_cost_type_check`. `ITEM_GROUPS` hanya konstanta FE (`PRFDetailPage.jsx:34`) |
| **f** | PRF Tahap B — RPC toleran, UI lama tak pecah | ✅ **TERBUKTI** | Toleransi `20260721000004:58-65` (`COALESCE`/`NULLIF`): payload lama → `vendor_id=NULL, item_group=NULL, is_awarded=true, exchange_rate=1` = perilaku identik pra-Tahap A. Guard `:37-46` menghitung `count(DISTINCT it->>'vendor_id')` dengan syarat `is_awarded` truthy **DAN `vendor_id` non-NULL non-empty** (`:41`) → **baris ber-`vendor_id` NULL tidak pernah memicunya**, jadi PRF warisan aman. Klaim dokumentasi akurat |
| **g** | PRF Tahap C — UI multi vendor | ⚠️ **TERBUKTI 4/5** | (1) Award tunggal by construction: state tunggal `awardedKey` `:67`, set `:583`, dipakai `:275` ✅ (2) Ambang pra-submit `> 0` + guard key hantu `:254` ✅ (3) Badge dua tingkat `:547-567` ✅ (4) Dropdown vendor 3 filter `:141-143` ✅ (5) **"Buat Quotation" disabled non-IDR — BISA DILEWATI**, lihat §1.9 |
| **h** | `schema_snapshot.sql` hasil `pg_dump` terbaru | ✅ **TERBUKTI — dan dokumentasi SALAH ke arah sebaliknya** | `prf_cost_items` punya 4 kolom di snapshot `:3925-3928` + FK `prf_cost_items_vendor_id_fkey`; policy vendors cocok migrasi; **body `save_prf_pricing` di snapshot `:1035-1096` identik baris-per-baris dengan `20260721000004:13-70`** (diff terprogram, 50 vs 50 baris). ❌ **`08_TECH_DEBT.md:5` dan `CLAUDE.md` masih menyatakan snapshot "KEMBALI STALE … masih 10 kolom"** — tidak benar, dan `:5` bertentangan langsung dengan `:6` di file yang sama |

**⚠️ Drift tak terdokumentasi yang ditemukan saat memverifikasi (h):** diff snapshot di `e13f73d` memuat `-    SET search_path TO 'public'`. Migrasi `20260720000001:22` dan `20260720000002:17` keduanya menyetel `SET search_path TO 'public'`; migrasi `20260721000004:12` menulis `LANGUAGE plpgsql SECURITY INVOKER AS $fn$` **tanpa** menuliskannya ulang, sehingga `CREATE OR REPLACE` **mencabut setelan itu dari fungsi live**. Snapshot `:1031-1033` mengonfirmasi. **33 fungsi lain di snapshot masih punya `SET search_path`** → ini penyimpangan pola, bukan pilihan sadar. Risiko praktis rendah (fungsi `SECURITY INVOKER`, semua objek sudah schema-qualified: `public.prf`, `public.prf_cost_items`, `auth.uid()`), tetapi **nol dokumen menyebutnya**, dan komentar migrasi Tahap B mengklaim fungsi "identik selain guard" — klaim itu tidak akurat.

### 2.3 Verifikasi TD-115 … TD-122

| TD | Verdict | Bukti |
|---|---|---|
| **TD-115** — penyaringan arsip jadi kewajiban query | ✅ **MASIH VALID, akurat** | `vendors_select:12613` memang tanpa `deleted_at`. Tiga pembaca yang diklaim patuh **semuanya terverifikasi**: `VendorListPage.jsx:104`, `PenerimaanBarangPage.jsx:336`, `PRFDetailPage.jsx:143`. Total permukaan: 6 titik akses di 3 file, nol embed `vendors!fk`. ⚠️ Sitasi baris usang: TD menulis `:12581`, seharusnya `:12613` |
| **TD-116** — by-id tanpa guard `deleted_at` | ✅ **MASIH VALID, baris tepat** | `VendorListPage.jsx:139` (fetch), `:189` (update), `:219-221` (soft delete) — semua `.eq('id', …)` polos. Penilaian "belum ada jalur yang menyuplai id terarsip" **benar**: satu-satunya sumber id adalah `filtered` → `rows` → query `:100-106` yang sudah tersaring. Defense-in-depth, bukan lubang aktif |
| **TD-117** — arsip tak bisa dipulihkan | ✅ **MASIH VALID; dua sitasi salah** | (a) `vendors_update` USING masih bawa `deleted_at IS NULL` — snapshot `:12620` (TD menulis `:12588`) (b) `vendors_company_code_unique UNIQUE (company_id, code)` — `:6095` (TD menulis `:6071`); **dikonfirmasi bukan partial index**, tidak ada `WHERE deleted_at IS NULL` → kode vendor hangus permanen, INSERT kena 23505 (handler `VendorListPage.jsx:203-205`) (c) nol UI pemulihan — terkonfirmasi |
| **TD-118** — Inventory de-facto SOA-only | ✅ **MASIH VALID, terverifikasi di kedua file** | `PenerimaanBarangPage.jsx:315` `find(c => c.code === 'SOA')` → `soa.id` dipakai untuk products `:326`, warehouses `:330`, **vendors `:334`**. `StokBarangPage.jsx:288` `find(c => c.code === 'SOA')?.id`. Gate menu = menuKey saja (`App.jsx:1212`), **nol gate entitas**. `grep "code === 'SOA'"` → tepat 2 hit, nol konstanta bernama |
| **TD-119** — `warehouses_select USING(true)` | ❌ **PREMIS BENAR, LINGKUP SALAH BESAR** | Fakta dasarnya benar (`:12649`, TD menulis `:12617`). **Tetapi `USING (true)` bukan anomali tunggal — ada 39 policy di 21 tabel** (`grep -c "USING (true)"` = 39). Detail di bawah tabel ini |
| **TD-120** — `quotation_items` satu kolom currency | ✅ **MASIH VALID, tapi mitigasinya lebih lemah dari yang ditulis** | Sitasi `PRFDetailPage.jsx:236-241` tepat. Tapi blokir itu **bisa dilewati** (§1.9) → "mitigasi sadar" yang jadi dasar TD-120 punya lubang |
| **TD-121** — kurs baris jalur prefill | ⚠️ **SEBAGIAN — framing "laten" perlu diturunkan** | Premis "laten karena ternetralkan oleh blokir TD-120" **melemah** oleh temuan §1.9: blokirnya bisa dilewati. Framing yang benar: "laten **dengan jalur bypass yang belum ditutup**". Mekanisme di `QuotationFormPage.jsx` tidak saya verifikasi baris-per-baris |
| **TD-122** — Tahap D tertunda | ✅ **MASIH VALID; klaim kuncinya TERKONFIRMASI** | Klaim terpenting — *"RLS mengizinkan `procurement` menulis `prf_cost_items` LANGSUNG lewat PostgREST"* — **terbukti**. `prf_cost_items_insert:11746` / `_update:11764` / `_delete:11737` semuanya hanya menuntut `EXISTS(prf p WHERE p.id = prf_id AND (super OR (company AND has_role('procurement') AND p.status='SUBMITTED')))`. **Nol klausa yang mengikat penulisan ke RPC.** Guard hanya di `20260721000004:43-45` (dalam RPC) dan `PRFDetailPage.jsx:254` (FE) — **keduanya di luar DB**. Argumen bahwa `UNIQUE(prf_id) WHERE is_awarded` akan menolak data sah juga **benar** (`PRFDetailPage.jsx:276-300` menandai banyak baris `is_awarded=true` per PRF) |

**Perluasan TD-119 — ini temuan terpenting dari Bagian 2.**

`grep -c "USING (true)" supabase/schema_snapshot.sql` = **39**, tersebar di **21 tabel**: `ar_btbs`, `ar_ttfs`, `currencies`, `delivery_notes`, `delivery_note_items`, `menu_actions`, `module_actions`, `module_menus`, `modules`, `permissions`, `picking_lists`, `picking_list_items`, `picking_list_materials`, `profiles`, `product_warehouse_location`, `role_permission_templates`, `sp_btbs`, `sp_items`, `status_catalog`, `stock_ledger`, `warehouses`.

**18 di antaranya adalah jalur TULIS/HAPUS**, bukan sekadar baca. Contoh terverifikasi:
```
schema_snapshot.sql:12313  sp_items_delete    FOR DELETE TO authenticated USING (true);
schema_snapshot.sql:12320  sp_items_insert    FOR INSERT TO authenticated WITH CHECK (true);
schema_snapshot.sql:12327  sp_items_read      FOR SELECT TO authenticated USING (true);
schema_snapshot.sql:12334  sp_items_update    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
```
Ditambah `dn_delete:10570`, `dn_update:10591`, `dni_delete:10598`, `dni_update:10619`, `picking_lists_delete:11607`, `picking_lists_update:11628`, `pli_delete:11635`, `pli_update:11656`, `plm_delete:11663`, `plm_update:11684`, `ar_ttfs_delete:10184`, `ar_ttfs_update:10205`, `ar_btbs_delete:10157`, `sp_btbs_delete:12279`, `pwl_delete:11897`, `pwl_update:11918`.

**Artinya: user terautentikasi apa pun — role apa pun, entitas mana pun — bisa `DELETE` seluruh baris `sp_items` (723 baris produksi), `delivery_notes`, dan `picking_lists` lewat PostgREST.** Tidak ada gate role, tidak ada gate entitas.

**Ini SUDAH tercatat sebagai TD-39 (HIGH)** — `08_TECH_DEBT.md:73` menyebut "~48 policy RLS `USING(true)`" dan **menamai persis tabel-tabel ini**. Jadi temuan saya bukan "tidak terdokumentasi", melainkan sesuatu yang lebih halus dan lebih berbahaya:

> **TD-119 me-file-ulang instance dari TD-39 sebagai TD BARU dengan severity LOW, tanpa cross-reference ke TD-39 yang HIGH.** Pembaca berikutnya yang membuka `warehouses` akan melihat "LOW · catatan audit · belum dinilai bug · perlu keputusan, bukan perbaikan" dan melewatinya, tanpa pernah tahu bahwa ia bagian dari kelas HIGH yang mencakup jalur hapus transaksional.

Delapan policy bahkan **tanpa klausa `TO` sama sekali** (berlaku ke `public`, termasuk `anon` bila GRANT-nya ada): `menu_actions_read_all:11211`, `module_actions_read_all:11231`, `module_menus_read_all:11251`, `modules_read_all:11271`, `rpt_read_all:12103`, `sp_btbs_read:12293`, `stock_ledger_select:12470`, `warehouses_select:12649`.

⚠️ **Batas verifikasi:** saya memverifikasi **teks policy**, bukan GRANT. `schema_snapshot.sql` di-dump `--no-privileges` (TD-63) sehingga GRANT tidak terlihat dari repo. Keparahan praktisnya bergantung pada GRANT `DELETE` ke role `authenticated` — TD-112 (fakta dari Den, bukan verifikasi saya) menyatakan GRANT luas memang ada di ~100 tabel. Kalau itu benar, jalurnya nyata.

### 2.4 TD lama — mana yang sebenarnya sudah tertutup diam-diam?

| TD | Status dokumen | Status sebenarnya di kode | Verdict |
|---|---|---|---|
| **TD-61** (NURTURE) | OPEN | `PipelineKanbanPage.jsx:17-25` dan `aging-pipeline/index.ts:4-10` tanpa NURTURE ✅. **Tapi TD-61 keliru menyiratkan NURTURE cuma "tak punya kolom"** — `ProspectFormPage.jsx:27` **bisa MENULISNYA**, dan tak ada CHECK di DB (`schema_snapshot.sql:1564`) | **TETAP OPEN — bentuk cacatnya lebih buruk dari yang ditulis:** write-without-read, bukan sekadar kolom yang hilang |
| **TD-90** (procurement tak lihat quotation) | OPEN | `quotations_read:11982` ≡ `inquiries_read:11157`, keduanya bergantung `is_manager_or_above()` (`:948-960`, role list `:956`) yang **tidak memuat `procurement`**. Idiom `has_role('procurement')` **ada dan dipakai** di `prf_select:11782`, `prf_cost_items:11757`, `sales_orders_select:12164` — dua policy ini saja yang tak pernah mengadopsinya. Nol migrasi menimpanya | **TETAP OPEN — lingkup jauh lebih luas + ada mode gagal yang lebih berbahaya.** Lihat kotak di bawah |
| **TD-98** (prasyarat pensiun `DealDetailPage`) | "praktis tuntas", (b)+(e) WON'T-DO | `DealDetailPage.jsx` masih di-`lazy` (`App.jsx:52`) dan **masih di-route** (`:3174-3188`). (a) `CustomerDetailPage.jsx:514-518,1108` ✅ (c) `:479-483` ✅ (d) `:473-477` ✅ — **(b) Buat Quotation NIHIL** (0 hit `onCreateQuotation`; prop-nya bahkan tak ada di signature `:602`, bandingkan `DealDetailPage.jsx:115`) — **(e) Summary Harga NIHIL** (0 hit; `PriceSummaryCard` ada di `DealPanels.jsx:437` tapi hanya dipakai `DealDetailPage.jsx:374`) | **TETAP OPEN. Koreksi penilaian saya sendiri:** status "praktis tuntas" adalah **keputusan, bukan fakta tentang kode**. Mempensiunkan `DealDetailPage` hari ini **menghapus dua kapabilitas yang belum punya pengganti**. Port-nya mekanis (komponennya sudah di-export), tapi belum dikerjakan |
| **TD-100** (izin CRM tak sesuai peruntukan) | OPEN | Defect **data seed izin** (`user_menu_permissions`). Nol seed di repo (`grep -rn "crm_quotation" supabase/` → 0 hit; snapshot DDL-only) | **TIDAK BISA DIVERIFIKASI dari repo.** Tak bisa dikonfirmasi maupun dibantah tanpa query DB |
| **TD-104** (header 156 vs Kanban 150) | OPEN | Mekanisme terkonfirmasi presis: header `:741`, kolom `:894` (kanban) **dan `:953` (list view)**, normalisasi `:718`. **Bukan spesifik NURTURE** — nilai `pipeline_stage` tak dikenal APA PUN menghasilkan divergensi yang sama, di kedua mode tampilan | **TETAP OPEN, deskripsinya kurang lengkap** — TD hanya menyebut NURTURE; tiga penyebab lain (query tanpa `.limit()`, scope super_admin, list-view) tidak disebut |
| **TD-111** (angka dari `.length` atas query ber-`.limit()`) | OPEN | Terkonfirmasi di keempat permukaan. `CRMDashboardPage.jsx` `.limit(1000)` di `:813,1869,1893,1903,1914,1925,1933,1947,2123,2185`; `.length` yang tampil di `:1971,1979,1980,2021,2028,2071,2072,2073,2078`. `LeadPoolPage.jsx:125`→`:189,200`. `CustomerListPage.jsx:579,592`→`:631,715` | **TETAP OPEN — dan TD-102 yang ditandai DONE ternyata baru setengah beres.** `:1981` `totalDeals = activeProspects + wonCustomers.length` — suku pertama server-count (benar-benar diperbaiki), **suku kedua masih `.length` atas `.limit(1000)`** (`:1947`). Penyebut Win Rate **masih bisa salah**. TD-111 sendiri jujur menyebut `wonCustomersRes`; yang tidak akurat adalah label "DONE" pada TD-102 dan narasi di `CLAUDE.md` |
| **TD-113** (`quotation_items.currency` tanpa FK) | OPEN | `quotation_items` hanya punya **dua** constraint: pkey `:5839` + `quotation_id_fkey` `:9340`. **Nol constraint pada `currency`.** Bandingkan `prf_cost_items_currency_fkey:9140` | **TETAP OPEN.** ⚠️ Sitasi TD usang: `:5815,9308` → seharusnya **`:5839,9340`** (geser +24/+32 akibat refresh snapshot `1bae222`/`06f95ce`/`e13f73d`) |
| **TD-114** (`calcRowTotal` case-sensitive `'IDR'`) | OPEN | `QuotationFormPage.jsx:159` `const rate = row.currency === 'IDR' ? 1 : (Number(row.exchange_rate) \|\| 0);` — `'idr'`/`'IDR '` jatuh ke cabang else → `Number('')\|\|0` = **0** → total baris runtuh jadi 0. Terjangkau **karena** TD-113 (tak ada FK); sisi PRF tertutup FK `:9140` | **TETAP OPEN** |

> **⚠️ TD-90 jauh lebih besar dari yang dicatat — dan ini menyentuh langsung design target Anda.**
>
> TD-90 hanya membahas `quotations_read`. Tetapi `is_manager_or_above()` tidak memuat `procurement`, dan **dua policy lain memakai fungsi yang sama**:
> - `inquiries_read` (`:11157`) = `(company AND (is_manager_or_above() OR created_by=uid)) OR is_super_admin()` → **procurement tidak bisa membaca `inquiries`**
> - `prospects_read` (`:11883`) → cabangnya: `is_manager_or_above() OR assigned_to=uid OR created_by=uid OR (has_role('operations') AND account_status='customer')` → **procurement tidak bisa membaca `accounts`**
>
> Sementara `prf_select` (`:11782`) **memang memuat** `has_role('procurement')`. Jadi procurement bisa melihat PRF, tetapi:
> - `ProcInquiryForwardingPage.jsx:44` meng-embed `account:accounts!prf_account_id_fkey(name)` dan `inquiry:inquiries!prf_inquiry_id_fkey(inquiry_no)` — **kedua embed tunduk RLS** → untuk user procurement keduanya mengembalikan NULL.
> - `PRFDetailPage.jsx:54` (`PRF_SELECT`) meng-embed dua field yang sama → baris ringkasan "Customer" dan "Inquiry" akan menampilkan `—`.
>
> **Prediksi yang bisa diuji:** inbox PRF procurement menampilkan nomor PRF tanpa nama customer dan tanpa nomor inquiry. `grep -c inquiries_read docs/Governance/*.md` = **0 di semua file** → ini **sama sekali tidak tercatat**.
>
> **Dan ada mode gagal kedua yang lebih berbahaya, juga tak tercatat.** TD-90 mencampur dua mekanisme yang sebenarnya tak berhubungan. Panel quotation di `PRFDetailPage` di-gate `hasMenuPermission('crm_quotation','view')` (`:60`, dipakai `:158`, `:341`, `:705`) — itu membaca `user_menu_permissions` (`AuthContext.jsx:271-282`), **bukan** `is_manager_or_above()`. Hari ini panelnya **di-unmount total** untuk procurement, jadi aman. **Tetapi begitu procurement diberi izin menu `crm_quotation:view`** — hal yang wajar dilakukan saat menyambungkan rantai target — panelnya merender, query `:160-163` mengembalikan `[]` karena RLS menyaring **tanpa error** (`:164` `if (!cancelled && !qe) setPrfQuotes(data || [])`), dan UI mencetak **"Belum ada quotation yang dibuat dari PRF ini."** (`:710`) — sebuah **pernyataan yang salah**. Memberi izin menu tanpa melonggarkan RLS mengubah "tidak terlihat" jadi "berbohong dengan yakin".
>
> Atribusi jujur: ini **terbukti di kode (teks policy + kode embed + kode empty-state)**, **belum dikonfirmasi runtime**. Catatan tes runtime 21 Jul di `CLAUDE.md` menyebut PRF terbuka normal dengan akun `procurement`, tetapi tidak melaporkan apakah kolom Customer/Inquiry terisi.

### 2.5 Efek samping yang tidak dicatat

1. **Gate Lead Pool di PRF hilang saat picker dicabut** (`28eb85a`) — regresi paling konkret minggu ini. Commit `8fc8878` (18 Jul) menambahkan `.eq('is_in_lead_pool', false)`; commit `28eb85a` (20 Jul) menghapus baris yang memuatnya bersama picker-nya, dan dropdown inquiry pengganti (`PRFFormPage.jsx:199`) tidak menggantikan penyaringnya. `grep is_in_lead_pool src/modules/procurement/` → **0 hit**. Dokumentasi `28eb85a` mencatat "tidak menuntaskan TD apa pun" — ia justru **membuka kembali** aturan yang baru ditutup dua hari sebelumnya. Detail di §1.11.

2. **`SET search_path` hilang dari `save_prf_pricing`** (`20260721000004`) — §2.2 catatan.

3. **Kontrol "Pindah Stage" tanpa gate mendapat dua jalan masuk baru** (`ca36450`, tahap 3b) — dari daftar Prospects (`ProspectListPage.jsx`, prop `onSelectProspect`) dan dari kartu/baris Pipeline (`PipelineKanbanPage.jsx:934,954` `onSelectAccount`). Keduanya membuka Detail Account, yang memuat `pickStage` tanpa gate BANT/WinLoss/Handover. Commit itu didokumentasikan sebagai "jalan masuk Detail Account" — benar, tapi konsekuensinya (memperlebar permukaan bypass gate bisnis) tidak dicatat. TD-94 menyadari kontrolnya ada di sana, tetapi hanya membahas drift `account_status` saat **keluar** WON.

4. **`ProspectDetailModal` dan `stageIndex` fallback** — `ca36450` menghapus `ProspectDetailModal` dari `PipelineKanbanPage` (−140 baris) dan mengalihkan klik kartu ke Detail Account. Detail Account merender stepper lewat `stageIndex` (`DealPanels.jsx:47-50`) yang **mengembalikan 0 (NEW) untuk stage tak dikenal**. Akun NURTURE yang sebelumnya membuka modal (menampilkan nilai apa adanya) kini membuka stepper yang **menampilkannya sebagai "New"** — regresi kejujuran tampilan, tak tercatat.

5. **`ProcInquiryForwardingPage` `.limit(200)`** (`:47`) — melanggar aturan wajib `.limit(1000)` di `CLAUDE.md`. Bukan efek samping minggu ini (halaman lahir 18 Jul di `83238c3`), tapi tak pernah dicatat, dan halaman ini akan jadi basis tab "Menunggu harga".

6. **PROGRESS.md tidak punya heading `## 2026-07-22`** — dua commit tanggal 22 Jul (`565dae4`, `e13f73d`) dicatat di bawah heading `## 2026-07-21`. Kosmetik, tapi merusak kemampuan menelusuri per-tanggal, yang justru fungsi utama file itu.

7. **`CLAUDE.md` memecah SATU commit jadi DUA batch bernarasi, lengkap dengan pagar lingkup yang tak pernah ada.** Entri "Filter arsip di dropdown vendor Penerimaan Barang — SATU baris (21 Jul 2026)" dan entri "Halaman Master Vendor (Procurement)" ditulis sebagai dua batch terpisah, dan yang pertama menyatakan tegas *"SENGAJA TAK DISENTUH: … `VendorListPage.jsx`"*. Git menunjukkan **keduanya dikirim dalam satu commit `6cdb52c`**, yang **membuat** `VendorListPage.jsx` (402 baris) **dan** mengedit `PenerimaanBarangPage.jsx` bersamaan. Pagar lingkupnya tidak eksis saat commit dibuat. Ini bukan sekadar kosmetik: klaim "sengaja tak disentuh" adalah alat verifikasi yang dipakai audit berikutnya, dan di sini ia menggambarkan disiplin yang tidak terjadi.

8. **Commit `7442eb4` ("feat(prf): prefill PRF dari inquiry") menyelundupkan `AUDIT_STAGE_MOVE.md`** (+257 baris) — dokumen tentang perpindahan pipeline stage, **tak berhubungan dengan prefill PRF**. Dokumentasi saja, nol dampak perilaku, tapi commit-nya bukan yang dikatakan pesannya.

**Yang bersih dan patut dicatat:** commit `565dae4` ("panel Jawaban Harga jadi multi-vendor") `git show --stat` → **tepat satu file**, `PRFDetailPage.jsx` (+477/−143). Ini **mengonfirmasi** klaim `CLAUDE.md` bahwa `QuotationFormPage.jsx` dan `QuotationDetailPage.jsx` tidak disentuh. Nol efek samping. Begitu juga `28eb85a`, `587aa7b`, `1bae222`, `06f95ce`.

**Efek samping lintas-modul yang terdeteksi tapi WAJAR** (dicatat untuk kelengkapan, bukan sebagai keluhan): `763edc4` menyentuh `App.jsx` (+17/−4) — murni plumbing router untuk halaman baru, tak terhindarkan meski tak disebut di badan commit. `753694e` menyuntikkan `setQuotationFromPrf(null)` ke **5 handler CRM yang sudah ada** (`:3176, 3282, 3296-3297, 3354-3355`) — aditif, bukan perubahan logika, dan **dinyatakan** di badan commit. `83238c3` membuat `DealDetailPage` (halaman CRM) **membaca tabel `prf`** (`:445-450`, `.limit(200)`) — tersirat dari pesan commit ("panel Daftar PRF"), tapi arah dependensi CRM→procurement ini tak pernah dibahas sebagai keputusan arsitektur.

### 2.6 `canRenderPage` — masih fail-open?

**Ya, kodenya fail-open — tetapi HARI INI tidak ada satu pun call-site yang terdampak. Dan cacat yang sebenarnya di area ini adalah hal lain, yang belum tercatat di mana pun.**

**Konfirmasi fail-open, `src/App.jsx:1721-1725`:**
```js
const canRenderPage = useCallback((menuId) => {
  const item = findMenuItemById(menuId);
  if (!item) return true;                    // ← FAIL-OPEN
  return canSeeMenuItem(item, role, hasPermission, hasMenuPermission);
}, [role, hasPermission, hasMenuPermission]);
```

**Enumerasi lengkap 22 call-site — hasilnya: NOL yang jadi no-op.**

16 pemanggilan literal di `App.jsx` (`:1740, 2977, 2982, 2987, 3020, 3033, 3054, 3269, 3412, 3425, 3436, 3446, 3458, 3475, 3486, 3513`) plus 6 pemanggilan tak langsung lewat prop `canNavigate` (`App.jsx:2771` → `HomeDashboard.jsx:69` `const can = (id) => …canNavigate(id)`, dipakai di `:75-77` dan `:35,37,39`). **Setiap satu dari 22 argumen itu resolve ke item nyata di pohon menu** — `findMenuItemById` (`:1278-1293`) menelusuri `ERP_MENU_GROUPS` termasuk `children`, dan `CRM_MENU_ITEMS` disisipkan sebagai `children` di `:577` sehingga id CRM ikut terjangkau.

Bahkan kandidat paling jelas untuk gate mati — `'crm-customers-msi'`, id yang dihapus di `f2bbd76` (tahap 2a) — **sudah ikut diperbaiki**: `HomeDashboard.jsx:37` kini memakai `'crm-customers'`, dan `grep "crm-customers-msi"` → 0 hit. Jadi klaim implisit bahwa ada gate yang sudah bocor **tidak didukung kode**, dan saya menurunkan dugaan saya sendiri.

**Cacat yang sebenarnya ada di sini — dan ini belum tercatat di TD mana pun: 5 dari 16 call-site punya deklarasi `role`/`module` yang MATI.**

`canSeeMenuItem` (`:1255-1271`) mengevaluasi dengan urutan short-circuit:
```js
1260  if (typeof hasMenuPermission === 'function') {
1261    const menuKey = MENU_KEY_MAP[item.id];
1262    if (menuKey) return hasMenuPermission(menuKey, 'view');   // ← keluar di sini
1263  }
1265  if (item.module && …) return hasPermission(item.module, 'view');
1268  if (item.role) return item.role.includes(role);
1270  return false;
```
Untuk `input`, `shipment`, `finance`, `outstanding`, `admin` — kelimanya **punya entri `MENU_KEY_MAP`** (`:1193, 1198, 1226, 1224, 1244`) **dan** menuliskan `module:` + `role:[…]` pada itemnya (`:590, 622, 738, 736, 916`). Karena `:1262` keluar duluan, **`module` dan `role` di kelima item itu tidak pernah dieksekusi**. Siapa pun yang membaca sumbernya melihat daftar role yang sebenarnya tidak berpengaruh apa-apa.

**⚠️ Ini memfalsifikasi satu Known Issue di `CLAUDE.md`.** FLAG RBAC di sana berbunyi: *"Menu `input` (Input SP) di-gate `module:'logistics'` → `hasPermission('logistics','view')`, dan role-def-nya masih meng-include `sales`. Konsekuensi: kalau RBAC grant `logistics.view` ke role sales, sales bisa lihat 'Input SP'…"*. Terverifikasi ke kode: gate `input` adalah **`hasMenuPermission('logistics_input','view')`** (`:1261-1262` + `MENU_KEY_MAP:1193`). Baik `hasPermission('logistics','view')` maupun entri `sales` di array role **tidak pernah dikonsultasi**. Remediasi yang disarankan FLAG itu ("ubah role-def/permission `logistics.view` utk sales") **tidak akan berefek apa pun**. FLAG ini perlu ditulis ulang atau dicabut.

**Asimetri kedua yang juga belum tercatat — dua gate atas satu pohon menu yang berselisih di DUA arah:**

| Kasus | `canRenderPage` | Sidebar (`isMenuAccessible` `:1390`) |
|---|---|---|
| Item **tanpa gate sama sekali**, ada di pohon | **DITOLAK** (`:1270 return false`, tanpa bypass super_admin) | **TAMPIL** — `navHasGate` (`:1351-1353`) / `navChildGate` (`:1355-1366`) mengembalikan `null` = "gateless → warisi modul induk", dan `canSeeMenuItem` bahkan tidak dipanggil |
| Id **tidak ada di pohon** | **DIIZINKAN** (`:1723`) | **DIIZINKAN** (`:1393`) |

Jadi `canRenderPage` sekaligus **lebih ketat** dari sidebar (untuk item gateless) dan **lebih longgar** (untuk id yang hilang). Setiap item menu baru yang Anda tambahkan tanpa `menuKey`/`module`/`role`/`public` akan **tampil di sidebar tapi menolak dirinya sendiri saat dirender**.

**Rekomendasi tetap: ubah `if (!item) return true` → `return false` sebelum menyentuh struktur menu.** Alasannya sekarang bukan "ada gate yang sudah bocor" (tidak ada), melainkan **pencegahan**: Target A akan menghapus dan mengganti id menu (`crm-pipeline` keluar dari `crm-account`, `crm-customers` melebur, id tab baru untuk Deal/Menunggu harga/Approval). Begitu satu `canRenderPage('<id-lama>')` tertinggal, ia berubah jadi izin-untuk-semua **tanpa gejala apa pun** — build clean, lint bersih, halaman tampil normal untuk semua role. Preseden bahwa tim sudah menyadari risikonya: `60c2a6f` (19 Jul) memindahkan gate Edit Inquiry ke `hasMenuPermission` **justru sebagai prasyarat pemangkasan id menu** — tapi hanya satu titik yang dipindah, dan `canRenderPage` sendiri tidak diubah.

Sekalian saat itu: **hapus 5 deklarasi `module`/`role` yang mati** supaya sumbernya berhenti berbohong tentang siapa yang punya akses.

### 2.7 Bahan rekonstruksi lubang dokumentasi 18–21 Juli

**Lubangnya terkonfirmasi.** `docs/Governance/00_DEV_JOURNEY.md` **Bagian 1 (timeline kronologis)** berhenti di baris `:27` dengan entri **2026-07-17**. Tidak ada entri untuk 18, 19, 20, 21, maupun 22 Juli. Tiga commit terakhir yang menyentuh file itu (`0c0e51f`, `06f95ce`, `e13f73d`) **semuanya hanya mengedit baris `:88` di Bagian 2** (inventaris fitur — entri Master Vendor); **nol sentuhan ke tabel timeline**.

Dua dokumen lain juga tertinggal:
- `09_ROADMAP.md:7` — "Diperbarui 2026-07-17". Baris PRF-nya masih berbunyi *"List/inbox (Fase 3a) + cross-entity (Fase 3b) belum. Belum tes manual runtime"* dan baris Procurement masih *"PR, PO, Vendor Mgmt 📋 tabel `vendors` ada"* — keduanya **usang**.
- `10_TASK_BREAKDOWN.md:5` — "Diperbarui 2026-07-18". Nol jejak pekerjaan 19–22 Jul.
- `04_ROLE_PERMISSION_MATRIX.md:103` masih menulis Tahap 2c *"belum commit"* dan *"Tahap 3 belum dikerjakan"* — keduanya sudah selesai.

**Bahan mentah untuk lima entri timeline yang hilang** (dari git, bukan dari dokumen — silakan Den atau doc-keeper yang menuliskannya, saya tidak menyentuh file governance):

| Tanggal | Milestone | Output utama | Bukti |
|---|---|---|---|
| **2026-07-18** | **Pisah tiga sumbu CRM + entitas Sales Order** | (a) `account_status` jadi sumbu lifecycle murni, `is_in_lead_pool` jadi satu-satunya penanda parkir, inquiry jadi gerbang ke `prospect` lewat trigger DB; (b) gate akun parkir dipasang di semua picker aksi; (c) UI entitas Sales Order (list/form/detail, menu 2 sisi, satu SO per inquiry); (d) Cetak PRF dari inquiry | `08ec4b4`, `b2e3fb2`, `8fc8878`, `d0d0dbc`, `9cc24ff`, `3bbf281`, `83238c3` · migrasi `20260718000000`, `20260718000001` |
| **2026-07-19** | **Restrukturisasi menu + detail CRM (5 tahap dalam satu hari)** | Nav tahap 1 (satu-sumber `CRM_MENU_ITEMS`, −1.549 baris dead code) → 2a (5 menu Customer → 1) → 2b (4 menu → "Account" bertab) → 2c ("Aktivitas" bertab + `riwayat-visit` pindah grup); Detail tahap 3a (`DealPanels.jsx` diekstrak, Detail Account 9 tab) → 3b (jalan masuk dari Prospects & Pipeline); TD-98 item (a)(c)(d) ditutup; kartu Prospect Aktif pakai `count(head)` | `4e541b3`, `f2bbd76`, `b857adf`, `ecfc032`, `16b2894`, `ca36450`, `aa9ae45`, `c5878af`, `60c2a6f`, `18935af`, `7442eb4`, `e10de30` |
| **2026-07-20** | **Rantai Inquiry → PRF → Quotation tersambung** | PRF jadi inquiry-only; panel Jawaban Harga + cost build-up per komponen (`PRFDetailPage` baru) via RPC atomik `save_prf_pricing`; guard anti gagal-diam; tombol "Buat Quotation dari PRF" + kolom `quotations.prf_id` + trigger konsistensi induk; dashboard berhenti pakai angka capped-1000 | `28eb85a`, `763edc4`, `8054873`, `753694e`, `81a608d`, `bb1195c` · migrasi `20260720000000`–`20260720000003` |
| **2026-07-21** | **Master Vendor + rombak RLS `vendors` + fondasi multi-vendor PRF** | RLS `vendors` 5 policy tumpang tindih → 4 policy company-scoped (TD-47 RESOLVED); `VendorListPage` (pintu masuk UI pertama untuk tabel `vendors`); `deleted_at IS NULL` dicabut dari `vendors_select` (soft delete akhirnya jalan); FK currency `prf_cost_items` + `prf.exchange_rates`; PRF multi-vendor Tahap A+B (4 kolom longgar + RPC toleran + guard satu-vendor) | `1bae222`, `6cdb52c`, `06f95ce`, `587aa7b` · migrasi `20260721000000`–`20260721000004` |
| **2026-07-22** | **PRF multi-vendor Tahap C (UI)** | Panel Jawaban Harga jadi multi-vendor: kartu per vendor, award tunggal, total terpisah per mata uang tanpa konversi, kartu Biaya Internal terpisah, tabel kurs di header; snapshot di-refresh untuk Tahap A/B | `565dae4`, `e13f73d` |

---

## BAGIAN 3 — KORELASI DAN GAP

### 3.1 Peta ketergantungan

**Prasyarat LANGSUNG untuk design CRM di Bagian 1:**

| Pekerjaan minggu ini | Kenapa jadi prasyarat |
|---|---|
| Lifecycle-split 18 Jul (`08ec4b4`, `b2e3fb2`, `20260718000001`) | **Fondasi Target B1.** Tanpa ini, `account_status` masih mencampur lifecycle + penanda parkir dan B1 tak punya kolom |
| Nav tahap 1 — `CRM_MENU_ITEMS` satu sumber (`4e541b3`) | **Fondasi Target A.** Sebelum ini, item CRM didefinisikan dua kali dan sudah drift; restrukturisasi di atas dua definisi akan langsung menghasilkan sidebar dan gate yang tak sinkron |
| Pola menu bertab 2b/2c (`b857adf`, `ecfc032`) | **Cetak biru langsung** untuk Pipeline 4-tab dan Akun 1-tab. Polanya sudah terbukti dua kali: `activeMenu` = id tab, gate per tab di `children`, `MenuTabBar` bersama |
| Detail tahap 3a/3b (`16b2894`, `ca36450`) + TD-98 | **Prasyarat penggabungan Akun.** Detail Account sekarang menampung lead→customer dalam satu halaman — itu yang membuat "Akun sebagai satu menu" mungkin |
| Rantai PRF 20 Jul (`763edc4`, `753694e`, `81a608d`) | **Fondasi Target C mata rantai harga.** `prf.suggested_rate` + `prf_cost_items` + `quotations.prf_id` + trigger konsistensi |

**Jalur TERPISAH (tidak memblokir design CRM):**
- Rombak RLS `vendors` + `VendorListPage` (21 Jul) — kerapian procurement.
- PRF multi-vendor Tahap A/B/C (21–22 Jul) — memperkaya isi PRF, tidak mengubah bentuk rantainya.
- Semua pekerjaan SP/logistics 15–16 Jul.

#### Apakah TD-120, TD-121, TD-90 otomatis jadi blocker rantai Inquiry → PRF → Quotation → SO?

**TD-90 — YA, BLOCKER KERAS.** Alasan teknis: design target menempatkan pengisian harga di PRF, yang dikerjakan role `procurement`. Tetapi `is_manager_or_above()` (`schema_snapshot.sql:948-960`) tidak memuat `procurement`, dan tiga policy bergantung padanya: `inquiries_read` (`:11157`), `prospects_read` (`:11883`), `quotations_read` (`:11982`). Konsekuensinya procurement **tidak bisa membaca konteks permintaan yang ia harus hargai** — nama customer dan nomor inquiry di inbox PRF akan kosong (embed tunduk RLS). Menaruh harga di PRF sambil membiarkan pengisi harga buta terhadap induknya bukan pilihan desain, itu cacat. Ini harus diputuskan sebelum Target C dieksekusi. **Dan lingkup TD-90 harus diperluas dulu** — sekarang ia hanya menyebut `quotations_read`.

**TD-120 — YA, tapi BLOCKER LUNAK dan hanya untuk jalur non-IDR.** Alasan teknis: `quotation_items` punya **satu** kolom `currency` yang dipakai bersama oleh `unit_price` (jual) dan `cost_price` (modal). Kalau modal dalam USD dan jual dalam IDR, satu baris tidak bisa mewakili keduanya — berapa pun kursnya. Mitigasinya sekarang adalah memblokir tombol "Buat Quotation" untuk PRF non-IDR. Untuk rantai **IDR-saja**, rantai lengkap Inquiry → PRF → Quotation → SO **bisa jalan hari ini**. Jadi TD-120 memblokir *kelengkapan*, bukan *keberadaan* rantai. ⚠️ **Tapi mitigasinya bocor** (§1.9) — gate memakai state form, payload memakai state DB → jalur yang sengaja ditutup bisa dimasuki. **Bug bocornya harus ditutup lebih dulu**; itu perbaikan kecil (satu sumber nilai) dan tidak menunggu keputusan bisnis apa pun.

**TD-121 — TIDAK, bukan blocker.** Alasan teknis: cacatnya (kurs baris di jalur prefill tertinggal `1`) hanya terjangkau lewat jalur prefill PRF non-IDR, yang sudah ditutup oleh TD-120. Ia menjadi masalah **hanya setelah** TD-120 dibuka. Urutannya: tutup kebocoran gate → putuskan TD-120 → baru TD-121 relevan.

### 3.2 Persentase kesiapan per lapisan

Dasar hitungan: setiap lapisan dipecah jadi item biner yang bisa diperiksa dari kode (item tercantum di tabel Bagian 1). Item "SEBAGIAN" dihitung 0,5.

| Lapisan | Skor | Hitungan | Yang sudah ada | Yang belum |
|---|---|---|---|---|
| **Menu (Target A)** | **~54%** | 7,5 / 14 item | Dashboard, Inquiry, Quotation, Sales order, Lead pool sbg tab, pola tab terbukti (2×), `CRM_MENU_ITEMS` satu sumber | Pipeline sbg induk, 4 tab Pipeline (2 belum ada sama sekali), penggabungan Akun+Customer, filter lifecycle |
| **Lifecycle akun (B1)** | **~63%** | 5 / 8 item | Kolom terpisah, CHECK 7 nilai, gerbang → `prospect` via trigger DB, backfill selesai | Urutan `prospect`/`sql` beda dari target, transisi `lead→mql→sql` belum ada, `set_customer_on_won` menempel di sumbu yang salah, sisa `'lead_pool'` di 6 query |
| **Pipeline lead (B2)** | **~50%** | 2,5 / 5 item | Granularitas per-perusahaan **sudah benar**, `NEW` otomatis, `CONTACTED` manual | Stage belum dipangkas jadi 3, QUALIFIED belum otomatis, NURTURE masih bisa di-set |
| **Pipeline deal (B3)** | **~13%** | 1 / 8 item | Kolom kandidat `inquiries.status` ada (mati) + kosakata parsial di FE | Granularitas per-inquiry, keempat transisi, LOST wajib alasan yang tak bisa dilewati, papan/tab-nya sendiri |
| **Rantai dokumen (C)** | **~58%** | 7 / 12 item | FK lengkap & benar, satu SO per inquiry, PRF inquiry-only, trigger konsistensi `prf_id`↔`inquiry_id`, operasional sengaja putus | Akun terpecah 4 permukaan, dua FK ke akun di `inquiries`, kartu Deal, dua transisi otomatis, mesin status `inquiries`/`prf` mati |
| **Jalur harga** | **~60%** | 3 / 5 item | Harga tersimpan di PRF (header + rincian + multi-vendor + award), prefill ke quotation jalan, `prf_id` tercatat | Bukan tautan hidup (quotation punya salinan bebas), jalur non-IDR diblokir **dan blokirnya bocor** |

**Rata-rata tertimbang kasar: ~50%.** Tapi angka rata-rata menyesatkan di sini — **B3 (13%) adalah satu-satunya yang bersifat struktural**, dan ia memblokir tab Deal, dua transisi otomatis, dan setengah dari Target A. Lima lapisan lain adalah pekerjaan inkremental di atas fondasi yang sudah ada.

### 3.3 Urutan eksekusi yang saya sarankan

**Urutan yang Anda pikirkan** — menu → pipeline dua level → jalur harga → tab approval — **salah di dua tempat.**

**Salah #1: menu tidak boleh duluan.** Restrukturisasi menu **menghapus dan mengganti id menu**, sementara `canRenderPage` fail-open (`App.jsx:1723`). Setiap gate yang menunjuk id yang dihapus **berubah jadi izin-untuk-semua tanpa gejala apa pun**. Lebih dalam lagi: tab "Deal" dan "Menunggu harga" **tidak punya data untuk ditampilkan** sampai `inquiries.status` dihidupkan. Membangun menunya duluan menghasilkan dua tab kosong yang harus dibongkar ulang begitu sumbu deal jadi.

**Salah #2: "pipeline dua level" sebagai satu langkah terlalu besar.** B2 (per-perusahaan) sudah 50% jadi; B3 (per-inquiry) baru 13% dan menyentuh 71 referensi `pipeline_stage` di 10 file FE + 1 Edge Function + 6 objek DB. Menggabungkannya jadi satu langkah = big-bang, persis yang dilarang `CLAUDE.md`.

**Urutan tandingan:**

**Fase 0 — Prasyarat keselamatan (kecil, tidak menunggu keputusan bisnis apa pun)**
1. `canRenderPage`: `if (!item) return true` → `return false` (`App.jsx:1723`). **Aman dilakukan sekarang** — ke-22 call-site sudah diverifikasi resolve ke item nyata (§2.6), jadi perubahan ini **nol dampak hari ini** dan murni memasang jaring untuk Fase 4. Sekalian hapus 5 deklarasi `module`/`role` mati (`:590, 622, 736, 738, 916`) supaya sumbernya berhenti menampilkan daftar role palsu, dan tulis ulang FLAG RBAC di `CLAUDE.md` yang premisnya terbukti salah.
2. Tutup kebocoran gate "Buat Quotation" di `PRFDetailPage` — satukan sumber nilai (semuanya dari `prf`, atau semuanya dari `answer`, bukan campur). Satu file.
3. Pasang kembali gate Lead Pool di dropdown inquiry `PRFFormPage.jsx:199` — memulihkan aturan 18 Jul yang hilang di `28eb85a`.
4. Putuskan `USING (true)` untuk tabel transaksional (TD-39). **Ini tidak berhubungan dengan CRM**, tapi memblokir tidur nyenyak: `sp_items` bisa dihapus siapa pun yang login. Kalau tidak dikerjakan sekarang, minimal naikkan TD-119 ke TD-39 dan hentikan pemecahannya jadi TD LOW terpisah.

**Fase 1 — Keputusan bisnis (tidak ada kode; lihat §3.5)**
Tanpa ketiga keputusan di §3.5, Fase 2 tidak bisa dimulai tanpa menebak.

**Fase 2 — Hidupkan sumbu deal di `inquiries` (DB dulu, non-destruktif)**
5. `inquiries.status`: tetapkan kosakata final, tambahkan **CHECK constraint** (belajar dari NURTURE — kolom tanpa CHECK selalu akhirnya menampung sampah), backfill dari `accounts.pipeline_stage` untuk inquiry yang punya quotation/SO.
6. Transisi otomatis sebagai **trigger DB, bukan kode FE** — mengikuti preseden `set_prospect_on_inquiry` yang sudah terbukti: quotation `SENT` → inquiry `QUOTED`; SO dibuat → inquiry `WON`. Alasan memilih trigger: ada **tiga** jalur tulis stage di FE hari ini dan hanya satu yang ber-gate; menaruh aturan di FE berarti mengulangi cacat yang sama.
7. Belum ada perubahan UI. Verifikasi datanya benar dulu.

**Fase 3 — Pangkas sumbu lead**
8. `accounts.pipeline_stage` dipersempit jadi `NEW/CONTACTED/QUALIFIED` + CHECK; nilai PROPOSAL/NEGOTIATION/WON/LOST dipindahkan ke `inquiries.status` (sudah dibackfill di Fase 2). Nasib NURTURE diputuskan di sini.
9. **Tulis ulang `set_customer_on_won`** — ia sekarang memicu dari `accounts.pipeline_stage='WON'` (`:1189`) dan akan **berhenti bekerja** begitu WON pindah. Ini titik paling mudah terlewat di seluruh migrasi; kalau lolos, akun berhenti jadi customer secara diam-diam.
10. Sesuaikan `aging-pipeline` (EF) + `AGING_LIMITS` Kanban, sekalian tutup celah `NEW: 7` yang tak punya badge peringatan.
11. Tutup jalur tulis stage tanpa gate: `CustomerDetailPage.pickStage`/`saveDealEdit`, `DealDetailPage`. Kalau tidak, otomatisasi Fase 2 akan ditimpa manual.

**Fase 4 — Menu (baru sekarang)**
12. Pipeline naik jadi induk + 4 tab (pola `ACCOUNT_TABS`). Tab Deal dan Menunggu harga sekarang **punya data**.
13. Akun = gabung Account + Customer, longgarkan `CustomerListPage` fetch (`:314`, `:561-565`) agar lifecycle jadi filter sungguhan.

**Fase 5 — Jalur harga & approval**
14. Putuskan TD-120 (multi-currency quotation) — sekarang bisa dikerjakan tanpa menghalangi apa pun.
15. Tab Approval, setelah §3.5 #3 dijawab.

**Ringkas alasannya:** menu adalah **konsumen** dari sumbu status, bukan produsennya. Membangun konsumen sebelum produsen menghasilkan tab kosong dan pekerjaan ulang. Dan `canRenderPage` fail-open membuat urutan "menu duluan" bukan sekadar tidak efisien — tapi **tidak aman**.

### 3.4 Risiko migrasi data

⚠️ **Saya tidak bisa menjalankan `SELECT count` apa pun** (lihat kepala dokumen). Yang di bawah adalah SQL siap-jalan plus perkiraan dari angka yang tercatat di dokumen (semuanya klaim Den, bukan verifikasi saya).

**SQL yang perlu Den jalankan sebelum memutuskan:**
```sql
-- 1. Sebaran stage sekarang (basis pemecahan sumbu)
SELECT pipeline_stage, count(*) FROM public.accounts
WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC;

-- 2. Berapa inquiry yang perlu status deal
SELECT count(*) FROM public.inquiries WHERE deleted_at IS NULL;

-- 3. Akun dengan >1 inquiry — ini yang "pecah" jadi banyak kartu
SELECT count(*) FROM (
  SELECT COALESCE(prospect_id, customer_id) a, count(*) n
  FROM public.inquiries WHERE deleted_at IS NULL
  GROUP BY 1 HAVING count(*) > 1
) t;

-- 4. Akun stage-deal yang TIDAK punya inquiry → stage-nya akan hangus
SELECT count(*) FROM public.accounts a
WHERE a.deleted_at IS NULL
  AND a.pipeline_stage IN ('PROPOSAL','NEGOTIATION','WON','LOST')
  AND NOT EXISTS (SELECT 1 FROM public.inquiries i
                  WHERE COALESCE(i.prospect_id,i.customer_id)=a.id AND i.deleted_at IS NULL);

-- 5. Inquiry yang punya quotation SENT (kandidat backfill → QUOTED)
SELECT count(DISTINCT q.inquiry_id) FROM public.quotations q
WHERE q.deleted_at IS NULL AND q.status IN ('SENT','ACCEPTED') AND q.inquiry_id IS NOT NULL;

-- 6. Inquiry yang punya SO (kandidat backfill → WON)
SELECT count(*) FROM public.sales_orders WHERE deleted_at IS NULL;

-- 7. Nilai inquiries.status yang benar-benar ada (dugaan: semua OPEN)
SELECT status, count(*) FROM public.inquiries WHERE deleted_at IS NULL GROUP BY 1;

-- 8. NURTURE
SELECT count(*) FROM public.accounts
WHERE pipeline_stage='NURTURE' AND deleted_at IS NULL;
```

**Perkiraan berdasarkan angka tercatat (bukan hasil query saya):** `accounts` ≈ **1.089 baris** (tabel backup `accounts_lifecycle_backup_20260718`, `CLAUDE.md`); backfill lifecycle 18 Jul = lead 643 / mql 182 / sql 112 / prospect 93 / customer 42 / lost 8 = **1.080**; prospect aktif di pipeline = **156** (`TD-104`); NURTURE = **6** (TD-61); akun LOST = **7**, hanya 3 punya `lost_reason` (TD-58).

**Yang BUTUH backfill (jangan sampai hangus):**

| Data | Kenapa | Risiko kalau dilewat |
|---|---|---|
| `inquiries.status` untuk inquiry yang punya quotation `SENT` | Sumber kebenaran QUOTED | Semua deal yang sudah dikirim quotation-nya kembali ke awal |
| `inquiries.status` untuk inquiry yang punya SO | Sumber kebenaran WON | Deal menang hilang dari papan |
| `accounts.pipeline_stage` = WON, akun `account_status='customer'` | 42 customer hasil konversi | Kalau `set_customer_on_won` tidak ditulis ulang (Fase 3 #9), akun berhenti jadi customer diam-diam |
| `won_reason` / `lost_reason` | Melekat di `accounts`, bukan `inquiries` | Alasan menang/kalah terputus dari deal-nya. **Perlu keputusan: ikut pindah ke `inquiries` atau tetap di akun?** |
| `estimated_value` | Melekat di `accounts` | Nilai deal jadi ambigu untuk akun multi-inquiry — dan `sync_deal_value_on_quotation_accept` (`:1450`) menulisnya per-akun |
| `stage_changed_at` + aging | Basis Lead Pool, per-akun | Aging harus diputuskan: tetap per-akun (sumbu lead) atau ikut per-inquiry? |

**Yang boleh hangus diam-diam (dengan persetujuan):**
- Stage deal pada akun **tanpa** inquiry (query #4) — secara definisi tidak bisa dipetakan ke kartu deal. Angkanya perlu dicek dulu; kalau kecil, hangus. Kalau besar, itu sinyal bahwa sales memakai stage tanpa membuat inquiry, dan itu masalah proses, bukan masalah migrasi.
- Enam baris NURTURE — sudah tak bergerak sejak 25 Jun (TD-61).
- Nilai `IN_REVIEW`/`CANCELLED` di `STATUS_META` inquiry kalau tak dipakai di kosakata final.

**Blast radius kode:** `grep -rn 'pipeline_stage' src/` = **71 referensi di 10 file** (`useCustomFields.js`, `InquiryListPage`, `PipelineKanbanPage`, `CustomerDetailPage`, `ProspectListPage`, `DealDetailPage`, `CRMDashboardPage`, `ProspectFormPage`, `LeadPoolApprovalPage`, `LeadPoolPage`) **+ `supabase/functions/aging-pipeline/index.ts` + 6 objek DB** (2 kolom tabel, 1 index, 3 fungsi trigger). Setiap satu harus ditinjau — bukan diganti buta, karena sebagian memang milik sumbu lead dan harus tetap.

### 3.5 Tiga keputusan bisnis yang memblokir eksekusi

**#1 — Apa yang terjadi pada akun ketika salah satu inquiry-nya WON, dan akun itu masih punya inquiry lain yang berjalan? (PALING MEMBLOKIR)**

Hari ini pertanyaannya tidak bisa muncul, karena satu akun = satu kartu. Begitu deal jadi per-inquiry, ia muncul di setiap akun berulang. Yang bergantung pada jawabannya: `set_customer_on_won` (`schema_snapshot.sql:1189`) — apakah akun langsung jadi `customer` pada WON pertama, dan apakah lifecycle-nya bisa mundur; `account_status` mana yang benar untuk akun yang punya satu deal menang dan tiga deal berjalan; apakah kartu lead-nya hilang dari papan Lead setelah customer. **Tanpa jawaban ini, Fase 2 dan 3 tidak bisa dirancang.** Terkait TD-94, yang sudah menunggu keputusan Den sejak 19 Jul.

**#2 — "Approval" di tab Pipeline itu approval apa?**

Tiga kandidat yang sama-sama masuk akal dan **sepenuhnya berbeda implementasinya**: (a) approval tarik Lead Pool — **sudah ada**, tinggal dipindah tab; (b) approval harga/diskon — **belum ada apa pun**, `margin_floor` cuma passthrough, matriks otoritas diskon UI-saja tanpa enforcement (TD-38), dan approval engine sendiri masih 🔄 di roadmap; (c) approval handover WON — tabel `deal_handovers` ada dengan status `approved`, tapi nol UI approval. Saya sengaja **tidak menebak**. Kalau jawabannya (b), tab itu bukan pekerjaan menu — itu modul baru.

**#3 — Urutan lifecycle: `lead → mql → prospect → sql → customer` (target) atau `lead → mql → sql → prospect → customer` (yang sekarang di CHECK)?**

CHECK constraint `accounts_account_status_check` (`:1613`) dan seluruh konstanta FE `PRA_CUSTOMER_STATUS` memakai urutan `sql` **sebelum** `prospect`. Target Anda menukarnya. Kalau ini disengaja, ia mengubah makna `set_prospect_on_inquiry` (`:1244-1256`): trigger itu mempromosikan `lead/mql/sql → prospect` saat inquiry masuk — dengan urutan target, `sql` datang **setelah** `prospect`, jadi trigger akan mempromosikan akun ke tahap yang lebih **awal**. Sedikit, tapi ini keputusan yang harus eksplisit sebelum ada baris kode ditulis. Kalau sekadar salah tulis di brief, konfirmasi saja dan tidak ada yang perlu berubah.

---

## TOP 10 MASALAH PALING KRITIS

| # | Sev | Masalah | Bukti | Kenapa peringkat ini |
|---|---|---|---|---|
| **1** | **CRITICAL** | **`sp_items` (dan 20 tabel lain) bisa di-DELETE/UPDATE oleh user login mana pun.** 39 policy `USING (true)`, 18 di antaranya jalur tulis/hapus, di seluruh `sp_items`, `delivery_notes`, `picking_lists`, `ar_ttfs` | `schema_snapshot.sql:12313,12320,12327,12334` (`sp_items` keempat policy) + 17 lainnya (§2.3) · TD-39 | Kehilangan data produksi ireversibel. Bukan CRM, tapi tak boleh kalah prioritas dari apa pun di daftar ini. **Sudah ada di TD-39 (HIGH) tetapi minggu ini dipecah lagi jadi TD-119 (LOW)** — fragmentasi severity yang mengubur temuan |
| **2** | **HIGH** | **Semua gate bisnis Kanban bisa dilewati lewat "Pindah Stage".** BANT ≥8, soft-gate inquiry/quotation, `WinLossModal` (alasan wajib), dan form Handover wajib — semuanya dilewati oleh `pickStage` | `CustomerDetailPage.jsx:810-818`, `:828-843` · `DealDetailPage.jsx:240-241` · `DealPanels.jsx:120-134` vs `PipelineKanbanPage.jsx:542-570,624-681` | Akun jadi `customer` tanpa `won_reason` dan tanpa baris `deal_handovers`. TD-58 (3 dari 7 LOST tanpa alasan) kemungkinan besar jejaknya. **Diperlebar minggu lalu** (`ca36450` menambah 2 jalan masuk) |
| **3** | **HIGH** | **`inquiries.status` dan `prf.status` = mesin status mati.** `inquiries.status` hanya ditulis `'OPEN'` saat insert, tidak pernah bertransisi; `prf.status` hanya `DRAFT`/`SUBMITTED` — 4 nilai CHECK tak terjangkau | `InquiryFormPage.jsx:292` (satu-satunya penulis) · `PRFFormPage.jsx:418` · CHECK `schema_snapshot.sql:3906` · UI merender 6 status di `InquiryListPage.jsx:41-48` | UI menjanjikan mesin status yang tak ada — filter menawarkan 5 nilai yang mustahil muncul. **Sekaligus kabar bagus:** kolom untuk Target B3 sudah ada, tinggal dihidupkan |
| **4** | **HIGH** | **Procurement buta terhadap `inquiries` dan `accounts`.** `is_manager_or_above()` tak memuat `procurement`, dan `inquiries_read`/`prospects_read` bergantung padanya → embed di inbox PRF mengembalikan NULL | `schema_snapshot.sql:948-960`, `:11157`, `:11883` · embed `ProcInquiryForwardingPage.jsx:44`, `PRFDetailPage.jsx:54` · `grep -c inquiries_read docs/` = **0** | Design target menaruh harga di PRF; pengisi harga tak bisa melihat konteks permintaan. **TD-90 hanya menyebut `quotations`** — dua policy lain sama sekali tak tercatat |
| **5** | **HIGH** | **Pemblokiran "Buat Quotation" non-IDR bisa dilewati.** Gate memakai state form (`answer.rate_currency`), payload memakai state DB (`prf.rate_currency`) | `PRFDetailPage.jsx:215` vs `:237` vs `:348-355` | Jalur yang sengaja ditutup karena TD-120/TD-121 bisa dimasuki dengan mengubah dropdown tanpa menyimpan. Juga menyebabkan `cost_total` (form) dan `suggested_rate` (DB) datang dari dua versi berbeda |
| **6** | **MEDIUM** | **Gate menu berbohong di sumbernya + `canRenderPage` fail-open menunggu di jalan restrukturisasi.** 5 item menu menuliskan `module`/`role` yang **tidak pernah dieksekusi** (short-circuit `MENU_KEY_MAP`); `canRenderPage` fail-open; dan ia **default-DENY** untuk item gateless yang justru **TAMPIL** di sidebar | `App.jsx:1255-1271` (short-circuit `:1262`) · item mati `:590,622,736,738,916` · fail-open `:1723` · asimetri sidebar `:1351-1366,1390` | **Turun dari HIGH setelah verifikasi:** ke-22 call-site hari ini resolve ke item nyata → **nol gate yang sudah bocor**. Tapi (a) sumbernya menampilkan daftar role palsu — dan itu **memfalsifikasi FLAG RBAC di `CLAUDE.md`**, yang remediasi usulannya tak akan berefek; (b) Target A akan menghapus id menu, dan tanpa perbaikan fail-open dulu, gate pertama yang tertinggal bocor **tanpa gejala** |
| **7** | **MEDIUM** | **Gate Lead Pool hilang dari PRF — regresi 20 Jul.** Filter yang ditambahkan `8fc8878` (18 Jul) ikut terhapus di `28eb85a` (20 Jul); dropdown inquiry pengganti tak punya penyaring | `PRFFormPage.jsx:199` · `grep is_in_lead_pool src/modules/procurement/` = **0** · bandingkan `git show 8fc8878` | Aturan bisnis 18 Jul ("akun parkir harus ditarik dulu") bocor di seluruh rantai dokumen hilir. Didokumentasikan sebagai "tidak menuntaskan TD apa pun" — padahal membuka kembali |
| **8** | **MEDIUM** | **Dua sumbu pipeline masih satu kolom.** `pipeline_stage` hanya ada di `accounts`; 1 akun = 1 kartu berapa pun inquiry-nya | `schema_snapshot.sql:1564` (satu-satunya lokasi) · `PipelineKanbanPage.jsx:711-722` | Selisih struktural terbesar terhadap design target. Blast radius: 71 referensi / 10 file FE / 1 EF / 6 objek DB |
| **9** | **MEDIUM** | **Tiga kolom status paling sentral tanpa CHECK constraint.** `accounts.pipeline_stage`, `inquiries.status`, `quotations.status` semuanya varchar bebas | `schema_snapshot.sql:1564`, `:3442`, `:4186` | Ini yang memungkinkan NURTURE lahir dan bertahan. Setiap nilai baru di design target akan mewarisi kerentanan yang sama kalau tidak dikunci sekarang |
| **10** | **MEDIUM** | **Dokumentasi mengarahkan perbaikan ke tempat yang salah, dan naratifnya tertinggal 4–5 hari.** FLAG RBAC `CLAUDE.md` premisnya salah (remediasinya nol efek); TD-102 "DONE" padahal setengah; TD-98 "praktis tuntas" padahal 2 kapabilitas nihil; `08_TECH_DEBT.md:5` bilang snapshot stale padahal segar & bertentangan dengan `:6`; `00_DEV_JOURNEY` timeline berhenti 17 Jul | FLAG vs `App.jsx:1261-1262`+`:590`+`MENU_KEY_MAP:1193` · TD-102 vs `CRMDashboardPage.jsx:1981` · TD-98 vs `CustomerDetailPage.jsx:602` · `08_TECH_DEBT.md:5` vs `:6` vs `schema_snapshot.sql:3925-3928` · `00_DEV_JOURNEY.md:27` · `09_ROADMAP.md:7` · `10_TASK_BREAKDOWN.md:5` | Dokumentasi yang stale hanya lambat; dokumentasi yang **salah arah** aktif memboroskan waktu. Ditambah: lima hari kerja terpadat minggu ini tak punya jejak di dokumen yang dipakai untuk orientasi |

---

## ASUMSI TIDAK DIVERIFIKASI

1. **Semua angka baris.** Saya tidak menjalankan satu pun query. `psql`/`pg_dump` tidak terpasang; `.env.local` hanya berisi anon key (RLS akan mengembalikan 0 baris untuk tabel CRM tanpa sesi login). Angka `accounts` 1.089, backfill lifecycle 643/182/112/93/42/8, prospect aktif 156, Kanban 150, NURTURE 6, LOST 7 (3 ber-alasan), `sp_items` 723 — **semuanya dari `CLAUDE.md`/`08_TECH_DEBT.md`/klaim Den**, bukan verifikasi saya. SQL untuk memverifikasi ada di §3.4.

2. **`schema_snapshot.sql` = keadaan DB live.** Saya memverifikasi isi **file di repo**. Apakah file itu benar-benar mencerminkan produksi hanya bisa dipastikan dengan query langsung. Semua klaim "LIVE" dalam dokumen ini berasal dari catatan Den.

3. **GRANT tabel.** Snapshot di-dump `--no-privileges` (TD-63) → GRANT/REVOKE tidak terlihat dari repo. Keparahan temuan #1 (Top-10) bergantung pada GRANT `DELETE` ke `authenticated`. TD-112 (fakta dari Den, 21 Jul) menyatakan GRANT luas memang ada. **Saya tidak bisa memverifikasinya.**

4. **Nol tes runtime.** Semua temuan adalah pembacaan kode dan teks policy. Prediksi seperti "inbox PRF procurement akan menampilkan Customer `—`" (§2.4) adalah **konsekuensi logis dari teks policy + kode embed**, bukan sesuatu yang saya lihat di layar.

5. **Mekanisme error 42501 pada soft delete vendor.** Tetap **tidak bisa dijelaskan** dari teks policy. `vendors_update` WITH CHECK (`:12620`) tidak menyebut `deleted_at`, dan yang dicabut `20260721000002` adalah policy **SELECT**. A/B test yang membuktikan perbaikannya adalah pengamatan Den, bukan sesuatu yang bisa saya reproduksi. **Jangan turunkan status "pertanyaan terbuka" ini jadi fakta.**

6. **TD-100.** Defect data seed izin (`user_menu_permissions`), tidak terjangkau dari repo. Tidak diverifikasi.

7. **~~Enumerasi call-site `canRenderPage` belum selesai.~~ SUDAH DIVERIFIKASI, dan dugaan awal saya SALAH** — 22 call-site (16 literal di `App.jsx` + 6 lewat prop `canNavigate` di `HomeDashboard.jsx`) semuanya resolve ke item nyata di pohon menu; **nol gate no-op**. Di luar kedua file itu, `grep -rn "canRenderPage\|canNavigate" src/` hanya menemukan **dua baris komentar** (`LeadPoolApprovalPage.jsx:5`, `PRFDetailPage.jsx:17`), bukan pemanggilan. Enumerasinya lengkap. **Dugaan saya bahwa sudah ada gate yang bocor saya cabut** — yang tersisa adalah risiko ke depan, bukan kerusakan yang sedang berjalan.

8. **Mekanisme TD-121 di `QuotationFormPage.jsx`.** Saya memverifikasi jalur prefill (`:643`, `:678-687`) tetapi **tidak** memeriksa baris-per-baris klaim tentang `rateFromRates`, write-through, `seedRatesFromRows`, dan `missingRates`. Verdict TD-121 saya terbatas pada dampak temuan #5.

9. **Apakah 39 policy `USING (true)` benar-benar bisa dieksploitasi lewat PostgREST.** Saya memverifikasi teks policy. Jalur nyatanya bergantung pada GRANT (poin 3) dan konfigurasi PostgREST (`db-schemas`, `db-anon-role`) yang tidak ada di repo.

10. **Angka persentase kesiapan (§3.2).** Basisnya adalah pemecahan item biner yang **saya** susun dari brief Anda. Kalau Anda memecah target dengan granularitas berbeda, persentasenya bergeser. Rasionya saya tampilkan (mis. 7,5/14) supaya bisa diaudit ulang, bukan sekadar angka.

11. **Klaim "tes runtime DONE" untuk Master Vendor dan PRF multi-vendor.** Berasal dari catatan Den. Saya tidak bisa memverifikasi tes runtime dari repo — hanya bisa mengonfirmasi bahwa kodenya konsisten dengan yang diklaim.

---

## PERTANYAAN BUAT DEN

**Memblokir eksekusi (harus dijawab sebelum kode ditulis):**

1. **Akun WON di satu inquiry sementara inquiry lain masih jalan — akunnya jadi apa?** (§3.5 #1) Apakah `account_status` langsung `customer` pada WON pertama? Bisa mundur? Kartu lead-nya hilang dari papan Lead? Ini juga menentukan nasib TD-94.
2. **"Approval" di tab Pipeline itu approval apa?** (§3.5 #2) Lead Pool (sudah ada) / harga-diskon (belum ada apa pun, = modul baru) / handover WON (tabel ada, UI nol)?
3. **Urutan lifecycle `prospect` sebelum `sql` — disengaja atau salah tulis?** (§3.5 #3) CHECK dan seluruh FE sekarang memakai urutan sebaliknya.
4. **`won_reason`/`lost_reason`/`estimated_value` ikut pindah ke `inquiries` atau tetap di `accounts`?** Kalau tetap di akun, akun multi-inquiry akan punya satu alasan menang untuk banyak deal.
5. **Aging & Lead Pool tetap per-akun (sumbu lead) atau ikut per-inquiry?** Sekarang `stage_changed_at` dan `aging-pipeline` semuanya per-akun.

**Keputusan produk yang tertunda dan sekarang menghalangi:**

6. **NURTURE: dikasih kolom, dikasih aturan aging, atau pintu masuknya ditutup?** TD-61 terbuka sejak lama; 6 baris masih menggantung dan menyebabkan selisih 156/150 di layar yang sama.
7. **`USING (true)` di tabel transaksional (`sp_items`, `delivery_notes`, `picking_lists`, `ar_ttfs`) — kapan ditutup?** Ini pertanyaan yang paling saya ingin dijawab lebih dulu di seluruh audit ini. `sp_items` memegang data produksi dan bisa dihapus siapa pun yang login.
8. **RLS untuk procurement: dilonggarkan agar bisa membaca `inquiries` + `accounts` pada konteks PRF, atau memang sengaja tertutup?** Kalau sengaja, design target harus menyediakan cara lain bagi procurement melihat konteks permintaan — kalau tidak, mereka menghargai sesuatu yang tak bisa mereka lihat.
9. **`Rate List` dan `Aktivitas` (3 tab) di struktur menu baru — dipertahankan, digabung, atau dipindah?** Target A tidak menyebut keduanya.
10. **`payment_terms_id` vendor dan tombol Pulihkan vendor terarsip — masuk backlog sekarang atau ditunda?** (TD-117 + temuan §2.2b) Salah arsip vendor hari ini = kode vendornya hangus permanen dan tidak ada jalan balik dari UI.

**Klarifikasi dokumentasi:**

11. **Klaim "snapshot STALE untuk Tahap A/B" di `CLAUDE.md` dan `08_TECH_DEBT.md:5` — sudah tidak benar.** Snapshot segar per `e13f73d`. Perlu dikoreksi supaya tidak memicu `pg_dump` ulang yang tak perlu. (Saya tidak menyentuhnya — ini audit.)
12. **`SET search_path` yang hilang dari `save_prf_pricing` — dikembalikan atau diterima sebagai keputusan?** 33 fungsi lain masih punya. Kalau diterima, tulis alasannya supaya tidak dipungut lagi di audit berikutnya.
13. **FLAG RBAC di `CLAUDE.md` (menu `input` / `logistics.view` / `sales`) premisnya terbukti salah** — gate sebenarnya `hasMenuPermission('logistics_input','view')`, dan `module`/`role` di item itu tak pernah dieksekusi (§2.6). Dicabut, atau ditulis ulang dengan mekanisme yang benar? Selama ia berdiri, ia mengarahkan perbaikan ke tempat yang tidak berpengaruh.
14. **TD-102 ditandai DONE, tapi penyebut Win Rate baru setengah diperbaiki** (`CRMDashboardPage.jsx:1981` masih menambahkan `wonCustomers.length` yang capped-1000). Dibuka kembali, atau dilebur ke TD-111?
15. **TD-98 "praktis tuntas" — (b) Buat Quotation dan (e) Summary Harga betul-betul tidak ada di `CustomerDetailPage`.** Keputusan WON'T-DO tetap berlaku, atau di-port dulu (mekanis — komponennya sudah di-export di `DealPanels.jsx`) sebelum `DealDetailPage` dipensiunkan? Selama dua halaman detail hidup berdampingan, ada dua jalur tulis stage tanpa gate, bukan satu.
