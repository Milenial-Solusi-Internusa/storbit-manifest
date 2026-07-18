# AUDIT — Alur CRM (lead → inquiry), kondisi APA ADANYA

> Read-only. Sumber: `src/`, `supabase/schema_snapshot.sql`, `supabase/functions/`, docs Governance. Tanggal: 2026-07-18 (branch `feat/sales-order`).
> Sifat: pemetaan, bukan penilaian gaya. Tiap klaim ada `file:line` / nama objek DB. Yang tak bisa dipastikan dari kode ditandai eksplisit. **Tidak ada file diubah selain dokumen ini. Tidak ada DB disentuh.** Section 7 = query SELECT diserahkan ke user (tak ada kredensial DB di sesi).

---

## RINGKASAN — kondisi alur CRM sekarang

**Tidak ada entitas "lead" terpisah, dan istilah MQL/SQL tidak ada di mana pun** — nol tabel `leads`/`lead` (`schema_snapshot.sql`, grep `CREATE TABLE public.leads` = 0), nol string `MQL`/`marketing_qualified`/`sales_qualified` di `src/` maupun schema. Yang ada: **satu tabel `accounts`** yang memegang prospect **dan** customer **dan** "lead pool", dibedakan kolom `account_status` (`prospect`/`customer`/`free_agent`/`lost`/`lead_pool`) + `pipeline_stage` (`NEW`…`WON`/`LOST`) + flag `is_in_lead_pool`. Tabel `accounts` adalah hasil rename dari `prospects` — **mayoritas nama constraint FK-nya masih `prospects_*`** dan **RLS policy-nya masih bernama `prospects_insert/read/update`** (`schema:11567/11574/11581`).

**Urutan pembuatan sekarang: prospect DULU, baru inquiry — dugaan forum benar.** Prospect dibuat via `ProspectFormPage.jsx:230-232` (`account_status='prospect'`), dan inquiry (`InquiryFormPage.jsx:283`) **mewajibkan memilih prospect/customer yang sudah ada** (validasi `:227-228`). FK `inquiries.prospect_id`/`customer_id` → `accounts` keduanya **nullable** (DB mengizinkan inquiry tanpa akun), tapi **form + seluruh pembaca hilir mengasumsikan akun sudah ada**. Perpindahan tahap prospect→customer **otomatis** lewat trigger DB `set_customer_on_won` (`schema:1080`) saat `pipeline_stage='WON'`; sisanya (NEW→…→NEGOTIATION) manual via drag Kanban.

**Kosakata tahap murni konvensi kode — nol CHECK constraint** pada `pipeline_stage`, `account_status`, `inquiries.status`, `quotations.status`. Artinya nilai tahap tak dijaga DB sama sekali; nilai baru (mis. `MQL`/`SQL`) bisa masuk tanpa ditolak, tapi juga tak ada yang mengenalinya. Ada **inkonsistensi kosakata internal**: `ProspectFormPage.jsx:27` `PIPELINE_STAGES` memuat **`NURTURE`** (8 nilai) sementara Kanban `PipelineKanbanPage.jsx:18-26` `STAGES` hanya 7 (tanpa NURTURE) — prospect ber-stage NURTURE bisa di-set tapi hilang dari Kanban.

**Titik paling rapuh kalau urutan dibalik** bukan di FK inquiries/quotations (semua nullable), tapi di: (a) **validasi form inquiry** yang menuntut akun, (b) **belasan pembaca** yang embed `prospect/customer` dari inquiry, (c) **`sales_orders.inquiry_id` + `account_id` = NOT NULL** (`schema` — satu-satunya FK CRM yang NOT NULL), (d) **default `account_status='prospect'`** yang mengikat identitas akun ke tahap. Detail per-risiko di bagian 8.

---

## PETA ALUR SEKARANG (apa adanya di kode)

```
                       [ Tambah Deal ]            [ Tambah Prospect ]
                    PipelineKanban:896-899       ProspectListPage:201
                            │                            │
                            └──────────┬─────────────────┘
                                       ▼  buka ProspectFormPage (setShowProspectForm)
   (lead = konsep UI,      ┌──────────────────────────────────────────────┐
    bukan record)          │  accounts.insert (ProspectFormPage.jsx:232)   │
                           │  account_status='prospect', pipeline_stage=NEW│
                           └───────────────────────┬──────────────────────┘
                                                   │ drag Kanban (applyStageMove :610-643)
             ┌─────────────────────────────────────┼───────────────────────────┐
             ▼ gate QUALIFIED (BANT)   ▼ gate PROPOSAL (ada inquiry?)  ▼ gate WON (ada quotation?)
        pipeline_stage: NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST
                                                   │                         │
   Aging idle → Lead Pool                          │ WON → trigger           │
   (EF aging-pipeline:108-110                       │ set_customer_on_won     │
    is_in_lead_pool=true                            │ (account_status         │
    + account_status='lead_pool')                   ▼ →'customer' otomatis)   │
                                                                              │
   [ Buat Inquiry ] InquiryFormPage:283 ── WAJIB pilih prospect/customer ─────┤
        inquiries.insert (status='OPEN', prospect_id|customer_id → accounts)  │
                                                   │                          │
   [ Buat Quotation ] QuotationFormPage:849-851 ── WAJIB inquiry_id ──────────┘
        quotations.insert (inquiry_id → inquiries; prospect_id/customer_id
        diturunkan dari inquiry terpilih)
```

Urutan efektif: **account(prospect) → inquiry → quotation**. Inquiry & quotation menempel ke akun; tak ada entitas lead/MQL/SQL di antaranya.

---

## TEMUAN PER BAGIAN

### 1. STRUKTUR DATA

**Tidak ada tabel `leads`** (`schema_snapshot.sql` grep = 0). "Lead" = baris `accounts` tahap awal / `is_in_lead_pool=true`.

**`accounts`** (rename dari `prospects`) — kolom tahap/status:
| Kolom | Tipe | Default | CHECK |
|---|---|---|---|
| `pipeline_stage` | varchar | `'NEW'` | **TIDAK ADA** |
| `account_status` | varchar(50) | `'prospect'` | **TIDAK ADA** |
| `is_in_lead_pool` | boolean | `false` | — |
| `lead_pool_reason` | text | — | — |
| `lead_pool_at` | timestamptz | — | — |
| `pull_status` | text | — | `accounts_pull_status_check` = `pending/approved/rejected` |
| `source` | varchar | — | `prospects_source_check` (nama lama) = `sales_visit/cold_call/referral/existing_network/exhibition/instagram/linkedin/tiktok/website/walk_in/other` |
| `tier` | varchar(20) | — | — |
Kolom pendukung tahap lain: `bant_score`/`bant_budget/authority/need/timeline`, `estimated_value`, `stage_changed_at`, `converted_at`/`converted_to`/`became_customer_at`, `won_reason`/`lost_reason`, `pull_*`. (Blok `CREATE TABLE public.accounts` di `schema_snapshot.sql`.)

**Nilai `account_status` yang benar-benar ditulis kode/EF:** `prospect` (`ProspectFormPage.jsx:230`), `customer` (`PipelineKanbanPage.jsx:726`, `CustomerListPage.jsx:339`), `free_agent` (`CustomerListPage.jsx:339`), `lead_pool` (`aging-pipeline/index.ts:110`), `prospect` lagi saat pull-back (`LeadPoolApprovalPage.jsx:123`). LOST via `pipeline_stage='LOST'` (`PipelineKanbanPage.jsx:764`), bukan account_status.

**Nilai `pipeline_stage`:** `NEW/CONTACTED/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST` (`PipelineKanbanPage.jsx:18-26`). **`NURTURE`** hanya di `ProspectFormPage.jsx:27` `PIPELINE_STAGES` — **tidak ada di Kanban STAGES** (inkonsistensi; = `08_TECH_DEBT` TD-61).

**`inquiries`** — `status` varchar DEFAULT `'OPEN'` (**tanpa CHECK**); satu-satunya nilai ditulis = `'OPEN'` (`InquiryFormPage.jsx:283`). `prospect_id uuid` (nullable), `customer_id uuid` (nullable) + banyak kolom freight (pol/pod/incoterms[]/hs_code/weight_kg/… — di luar scope tahap).

**`quotations`** — `status` varchar DEFAULT `'DRAFT'` (**tanpa CHECK**); nilai ditulis: `DRAFT`/`SUBMITTED` (`QuotationFormPage.jsx`), `SENT` (di `QuotationDetailPage`). `inquiry_id`/`prospect_id`/`customer_id` semua **nullable**.

**Tabel penghubung / dormant terkait:** **`customers`** (tabel TERPISAH, masih ada di schema — `customers_*_fkey` `schema:7961-8017`) tapi **dorman**: satu-satunya pembaca = `CustomerMasterPage.legacy.jsx:396/446/452/625/640` (dead code `.legacy`). Sama untuk `sales_calls`/`sales_visits` (hanya dibaca legacy). (= TD-18/TD-19.)

### 2. RELASI & FK

**FK KELUAR `accounts`** — **mayoritas nama LAMA `prospects_*`** (rename artifact): `prospects_assigned_profile_fkey`, `prospects_assigned_to_fkey`, `prospects_company_id_fkey`, `prospects_converted_to_fkey` (→ `accounts`, self-ref), `prospects_created_by_fkey`, `prospects_owner_company_id_fkey`, `prospects_payment_terms_id_fkey`, `prospects_updated_by_fkey` (`schema:9009-9065`). Hanya `accounts_pull_approved_by_fkey` (`:7441`) pakai nama baru. **⚠️ nama constraint stale.**

**FK KELUAR `inquiries`** (nama baru): `inquiries_company_id_fkey`, `inquiries_created_by_fkey` (→profiles), `inquiries_customer_id_fkey` (→accounts, **nullable**), `inquiries_prospect_id_fkey` (→accounts, **nullable**) (`schema:8593-8617`).

**FK KELUAR `quotations`** (nama baru): `quotations_inquiry_id_fkey` (→inquiries, **nullable**), `quotations_prospect_id_fkey` / `quotations_customer_id_fkey` (→accounts, **nullable**), + company/created_by/updated_by/payment_terms (`schema:9097-9145`).

**FK MASUK ke `accounts`** (yang bakal kena kalau model akun berubah): `activities_account_id_fkey`, `ar_ttfs_customer_id_fkey`, `customers_prospect_id_fkey` (ON DELETE SET NULL, dorman), `dc_master_customer_id_fkey`, `deal_handovers_account_id_fkey` (**ON DELETE CASCADE**), `delivery_notes_customer_id_fkey`, `inquiries_customer_id_fkey`, `inquiries_prospect_id_fkey`, `picking_lists_customer_id_fkey`, `prf_account_id_fkey`, `quotations_customer_id_fkey`, `quotations_prospect_id_fkey`, `sales_calls_prospect_id_fkey` (dorman), `sales_orders_account_id_fkey`, `sales_visits_prospect_id_fkey` (dorman), `sp_btb_customer_id_fkey`, `sp_items_customer_id_fkey`, `sp_orders_customer_id_fkey`, `top_requests_account_id_fkey` (CASCADE) (`schema:7449-9505`).

**FK MASUK ke `inquiries`:** `activities_inquiry_id_fkey` (`:7465`), `prf_inquiry_id_fkey` (`:8921`), `quotations_inquiry_id_fkey` (`:9121`), **`sales_orders_inquiry_id_fkey` (`:9281`)**.

**FK NOT NULL (calon penghalang kalau urutan dibalik):**
- **`sales_orders.inquiry_id` NOT NULL** + **`sales_orders.account_id` NOT NULL** (`CREATE TABLE public.sales_orders`) — **satu-satunya FK CRM yang NOT NULL.**
- `inquiries.prospect_id`/`customer_id` = **nullable** (bukan blocker DB).
- `quotations.inquiry_id`/`prospect_id`/`customer_id` = **nullable** (bukan blocker DB).

### 3. TITIK PEMBUATAN DATA

| # | Aksi | file:line | Dipicu dari UI | Field kunci diisi | Urutan |
|---|---|---|---|---|---|
| 1 | **Buat prospect** | `ProspectFormPage.jsx:232` (insert), status di `:230` | "Tambah Deal" (`PipelineKanbanPage.jsx:896-899`) **atau** "Tambah Prospect" (`ProspectListPage.jsx:201`) → keduanya buka `ProspectFormPage` | `account_status='prospect'`, `created_by`, `owner_company_id`, `last_activity_at`, `pipeline_stage` (default NEW / dari form), BANT | insert tunggal `accounts` |
| 2 | **Buat customer langsung** | `CustomerListPage.jsx:353` (insert), status `:339` | Master Customer (Customer form) | `account_status='customer'` / `'free_agent'`, `became_customer_at` | insert tunggal `accounts` |
| 3 | **Buat inquiry** | `InquiryFormPage.jsx:283` (insert) | Menu Inquiry / DealDetail "Buat Inquiry" | `status='OPEN'`, `prospect_id`\|`customer_id` (dari **akun existing**, wajib `:227-228`), nomor `INQ/…` via `increment_document_sequence` | insert tunggal `inquiries` (butuh akun lebih dulu) |
| 4 | **Buat quotation** | `QuotationFormPage.jsx` — RPC `save_quotation` (edit) `:882` / insert langsung `:940`; FK di `:849-851` | Menu Quotation / DealDetail "Buat Quotation" | `inquiry_id` (wajib, `:786`), `prospect_id`/`customer_id` **diturunkan dari inquiry** (`selectedInquiry.prospect?.id`/`customer?.id`), `status='DRAFT'` | insert `quotations` + `quotation_items` (butuh inquiry lebih dulu) |
| 5 | **Promosi prospect→customer** | `finalizeWon` (`PipelineKanbanPage.jsx:722-728`, `account_status='customer'`) **+ trigger** `set_customer_on_won` (`schema:1080`, `BEFORE INSERT OR UPDATE`, `trg_set_customer_on_won` `:7356`) | Drag ke WON → handover → finalize | `pipeline_stage='WON'` → trigger paksa `account_status='customer'` + `became_customer_at`/`converted_at` | update `accounts` (bukan record baru) |
| 6 | **Pindah tahap (drag)** | `applyStageMove` (`PipelineKanbanPage.jsx:610-643`, update `:628`) | Kanban drag-drop | `pipeline_stage`, `updated_by` | update `accounts` |
| 7 | **Masuk Lead Pool (otomatis)** | Edge Function `aging-pipeline/index.ts:108-110` | Cron harian (di luar UI) | `is_in_lead_pool=true` **+ `account_status='lead_pool'`** | update `accounts` |
| 8 | **Tarik dari Lead Pool** | `LeadPoolApprovalPage.jsx:122-123` | Approval Lead Pool | `is_in_lead_pool=false`, `account_status='prospect'` | update `accounts` |
| 9 | **Stamp `stage_changed_at`** | trigger `track_stage_change` (`schema:1403`, `trg_z_track_stage_change` `BEFORE UPDATE` `:7433`) | otomatis tiap update stage | `stage_changed_at` | trigger |

**Tak ada** RPC/trigger yang mem-"promosikan" lead→MQL→SQL→prospect — konsep itu tak ada di kode.

### 4. ATURAN TAHAP YANG BERLAKU SEKARANG

- **Manual (drag Kanban)** untuk NEW↔CONTACTED↔QUALIFIED↔PROPOSAL↔NEGOTIATION (`applyStageMove`).
- **Gate saat naik (client-only, cek stage TUJUAN):** `PipelineKanbanPage.jsx:659-664` —
  - **→ QUALIFIED**: BANT `calcBantScore` (`:664`) — `<5` **blok total**, `5–7` **konfirmasi**, `≥8` lolos.
  - **→ PROPOSAL**: bila 0 baris `inquiries` untuk prospect → **konfirmasi**.
  - **→ WON**: bila 0 baris `quotations` → **konfirmasi**.
- **Otomatis (trigger DB):** `set_customer_on_won` — begitu `pipeline_stage='WON'`, `account_status` dipaksa `'customer'` (`schema:1080`). Ini satu-satunya transisi "identitas" otomatis.
- **Otomatis (EF cron):** aging → Lead Pool (`aging-pipeline`, per `AGING_RULES` `index.ts:4`).
- **MQL / SQL:** **TIDAK ADA di kode maupun DB** (grep `MQL`/`marketing_qualified`/`sales_qualified` = 0). Kosakata tahap = konvensi kode, **nol CHECK** di 4 kolom status (accounts.pipeline_stage, accounts.account_status, inquiries.status, quotations.status) → tak ada penjaga nilai di level DB.

### 5. RLS & ROLE

**`accounts`** (policy nama lama `prospects_*`):
- `prospects_insert` (`:11567`): `company_id = get_user_company_id()` — **semua authenticated dalam company** boleh insert (tanpa gate role).
- `prospects_read` (`:11574`): `is_super_admin() OR (company AND (is_manager_or_above() OR assigned_to=uid OR created_by=uid OR …))` — **owner-scoped untuk sales** (assigned_to/created_by), se-company untuk manager+.
- `prospects_update` (`:11581`): `(company AND (is_manager_or_above() OR assigned_to=uid OR created_by=uid)) OR super` — owner-scoped.
- `accounts_delete_superadmin` (`:9670`): **super_admin only**.

**`inquiries`:**
- `inquiries_insert` (`:10885`): `company_id = get_user_company_id()` (tanpa gate role).
- `inquiries_read` (`:10892`): `company AND (is_manager_or_above() OR created_by=uid) OR super` — **owner-scoped untuk sales** (hanya inquiry yang ia buat).
- `inquiries_update` (`:10899`): sama pola read.
- **DELETE: TIDAK ADA policy** (grep `FOR DELETE … inquiries` = 0).

**`quotations`:**
- `quotations_insert`/`quotations_read`/`quotations_update` (dari audit lain, `schema:~11559-11573`): insert = company match; read/update = `company AND (is_manager_or_above() OR created_by=uid) OR super`. **DELETE: TIDAK ADA policy.**

Ringkas: **sales owner-scoped** (lihat/ubah miliknya) di ketiga tabel; manager+ se-company; super lintas-entitas; **insert tak digate role** (siapa pun authenticated dalam company); **DELETE hanya di accounts (super-only); inquiries & quotations nol DELETE policy** (= pola TD-03).

### 6. KETERGANTUNGAN KE LUAR

**Pembaca `inquiries`** (`from('inquiries')` / embed `inquiries!` / `inquiry_id`): `PipelineKanbanPage.jsx`, `InquiryListPage.jsx`, `QuotationDetailPage.jsx`, `activityFeed.js`, `CRMDashboardPage.jsx`, `QuotationFormPage.jsx`, `InquiryFormPage.jsx`, `DealDetailPage.jsx`, `SalesOrderDocFormPage.jsx`, `SalesOrderDocListPage.jsx`, `SalesOrderDocDetailPage.jsx`, `ProcInquiryForwardingPage.jsx`, `PRFFormPage.jsx` (grep `from('inquiries')|inquiries!|inquiry_id` di `src/`).

**Tabel yang FK ke `inquiries`** (kena kalau inquiry berubah): `activities`, `prf`, `quotations`, **`sales_orders` (NOT NULL)**.

**Tabel yang FK ke `accounts`** (17, kena kalau model akun berubah): lihat §2 (activities, ar_ttfs, dc_master, deal_handovers[CASCADE], delivery_notes, inquiries, picking_lists, prf, quotations, sales_orders, sp_btb, sp_items, sp_orders, top_requests + dorman customers/sales_calls/sales_visits).

**Pembaca `accounts` lintas-modul (embed):** CRM (semua page di atas), SP/logistics (`sp_items`/`sp_orders` via `customers:accounts!…_fkey`), PRF (`prf.account_id`), SO (`sales_orders.account_id`), Finance/AR (`ar_ttfs.customer_id`), Dashboard Indomarco. (Embed alias `accounts!…_fkey` tersebar; contoh `QuotationListPage.jsx:109-110`, `DealDetailPage` embeds, `SalesOrderDocDetailPage.jsx`.)

### 7. KONDISI DATA — **TIDAK BISA DIQUERY DI SESI INI** (tak ada kredensial DB)

Angka TIDAK dikarang. Jalankan query read-only ini di SQL Editor:

```sql
-- (a) Jumlah baris per tabel inti
SELECT 'accounts'   AS t, count(*) FROM public.accounts   WHERE deleted_at IS NULL
UNION ALL SELECT 'inquiries',  count(*) FROM public.inquiries  WHERE deleted_at IS NULL
UNION ALL SELECT 'quotations', count(*) FROM public.quotations WHERE deleted_at IS NULL
UNION ALL SELECT 'customers(dormant)', count(*) FROM public.customers;

-- (b) Sebaran account_status & pipeline_stage
SELECT account_status, pipeline_stage, count(*) FROM public.accounts
WHERE deleted_at IS NULL GROUP BY 1,2 ORDER BY 3 DESC;

-- (c) is_in_lead_pool vs account_status (cek sinkron / drift)
SELECT is_in_lead_pool, account_status, count(*) FROM public.accounts
WHERE deleted_at IS NULL GROUP BY 1,2 ORDER BY 3 DESC;

-- (d) Prospect punya inquiry vs tidak
SELECT (i.n IS NOT NULL) AS punya_inquiry, count(*) FROM public.accounts a
LEFT JOIN (SELECT prospect_id, count(*) n FROM public.inquiries WHERE deleted_at IS NULL GROUP BY 1) i
  ON i.prospect_id = a.id
WHERE a.deleted_at IS NULL AND a.account_status = 'prospect' GROUP BY 1;

-- (e) Inquiry TANPA prospect DAN tanpa customer (yatim)
SELECT count(*) AS inquiry_yatim FROM public.inquiries
WHERE deleted_at IS NULL AND prospect_id IS NULL AND customer_id IS NULL;

-- (f) Sebaran inquiries.status & quotations.status
SELECT 'inquiry' k, status, count(*) FROM public.inquiries WHERE deleted_at IS NULL GROUP BY 2
UNION ALL SELECT 'quotation', status, count(*) FROM public.quotations WHERE deleted_at IS NULL GROUP BY 2;

-- (g) Indikasi duplikat akun (nama sama, company sama)
SELECT company_id, lower(trim(name)) nm, count(*) FROM public.accounts
WHERE deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1 ORDER BY 3 DESC;

-- (h) Akun ber-stage NURTURE (hilang dari Kanban) + LOST count
SELECT pipeline_stage, count(*) FROM public.accounts
WHERE deleted_at IS NULL AND pipeline_stage IN ('NURTURE','LOST') GROUP BY 1;
```

### 8. RISIKO PERUBAHAN (kalau urutan prospect/inquiry dibalik)

| # | Lokasi | Dampak nyata | Severity |
|---|---|---|---|
| R1 | **`sales_orders.inquiry_id` + `account_id` = NOT NULL** (`CREATE TABLE public.sales_orders`; FK `:9257`/`:9281`) | SO **wajib** punya inquiry + akun. Kalau model baru bikin inquiry sebelum akun ada, jalur SO putus / insert gagal `null value violates not-null`. | **HIGH** |
| R2 | **Validasi form inquiry menuntut akun** (`InquiryFormPage.jsx:227-228`) + default `account_status='prospect'` (`ProspectFormPage.jsx:230`) | "Inquiry-first" tak didukung UI: form menolak submit tanpa prospect/customer. Identitas akun terikat ke tahap via default. | **HIGH** |
| R3 | **~13 pembaca inquiry embed `prospect`/`customer`** (§6; mis. `QuotationFormPage.jsx:850-851` menurunkan FK quotation dari `selectedInquiry.prospect/customer`; `DealDetailPage`/`SalesOrderDocDetailPage` embed nama) | Jika inquiry bisa eksis tanpa akun (FK nullable mengizinkan), embed → `null` → nama kosong, quotation kehilangan `prospect_id`/`customer_id` turunan, DealDetail/SO Detail menampilkan "—". | **HIGH** |
| R4 | **Trigger `set_customer_on_won`** (`schema:1080`) mengasumsikan satu baris `accounts` melewati NEW→WON | Kalau tahap baru (MQL/SQL) disisipkan atau identitas dipisah dari tahap, aturan "WON⇒customer" bisa salah picu / tak relevan. | **MEDIUM** |
| R5 | **Nol CHECK pada 4 kolom status** (accounts.pipeline_stage/account_status, inquiries.status, quotations.status) | Nilai baru (MQL/SQL) bisa masuk DB tanpa error TAPI tak dikenali kode mana pun (Kanban STAGES 7 nilai, `SERVICE`/badge map terbatas) → baris "tak terlihat" (persis kasus NURTURE `TD-61`). | **MEDIUM** |
| R6 | **RLS & FK bernama `prospects_*`** (`schema:9009-9065`, `:11567-11581`) | Bukan blocker fungsional, tapi migrasi/rename lanjutan rawan bingung; skrip yang mereferensi nama constraint harus pakai nama lama. | **LOW** |
| R7 | **Dua sumber status Lead Pool** (`is_in_lead_pool` bool + `account_status='lead_pool'`, di-set bareng hanya oleh EF `aging-pipeline:109-110`; FE baca `is_in_lead_pool`) | Kalau tahap direstruktur, dua penanda ini bisa makin drift (TD-50). | **LOW** |
| R8 | **`deal_handovers`/`top_requests` FK `ON DELETE CASCADE` ke accounts** (`:8041`/`:9505`) | Hapus/replace akun saat migrasi bisa meng-cascade hapus handover/TOP. (Bukan reversal langsung, tapi risiko saat manipulasi akun.) | **LOW** |

---

## SELISIH TERHADAP ALUR TARGET (`leads → MQL → SQL → prospect → inquiry`)

Hanya deskripsi selisih — **tanpa usulan solusi**.

1. **`leads` sebagai entitas: TIDAK ADA.** Target mulai dari "leads"; kode tak punya tabel/record lead. "Lead" hanya framing UI (tombol "Tambah Deal" langsung bikin **prospect**, `PipelineKanbanPage.jsx:896`→`ProspectFormPage.jsx:232`). → target butuh enttitas/tahap yang belum ada.
2. **`MQL` & `SQL`: TIDAK ADA** di kode maupun DB (grep = 0; nol CHECK yang mengizinkannya). Dua tahap tengah pada target tak terwakili sama sekali.
3. **Urutan sekarang = prospect → inquiry** (bukan lead → … → prospect → inquiry). Prospect adalah **titik awal** pembuatan record (bukan hasil promosi dari lead/MQL/SQL). Inquiry **menempel ke prospect yang sudah ada** (`InquiryFormPage.jsx:227-228,283`). → target menempatkan prospect **jauh di hilir** setelah 3 tahap; kode menempatkannya di **hulu**.
4. **Promosi antar-tahap:** target menyiratkan rantai promosi lead→MQL→SQL→prospect. Kode hanya punya (a) drag manual `pipeline_stage` dalam SATU baris accounts, (b) satu promosi identitas otomatis prospect→customer saat WON. Tak ada mekanisme "promosi lead menjadi prospect".
5. **KOREKSI (18 Jul 2026 — desain final).** Premis audit awal ("inquiry = paling hilir, muncul setelah prospect sudah settle") **KELIRU**. Per desain final: **INQUIRY adalah GERBANG menuju prospect** — sebuah akun baru boleh berstatus `prospect` justru **karena/setelah** ia punya inquiry pertama. Promosi `lead→prospect` dipicu **trigger DB** (dipasang user manual) saat inquiry pertama dibuat, **bukan** kode frontend. Jadi inquiry bukan langkah terakhir setelah prospect, melainkan **syarat masuk** menjadi prospect. Konsekuensinya, sumbu **lifecycle** akun (`account_status` = `lead`/`mql`/`sql`/`prospect`/`customer`/`lost`) dipisah dari sumbu **deal-stage** (`pipeline_stage`) dan dari **penanda parkir** (`is_in_lead_pool`) — tiga sumbu berbeda yang dulu bertumpuk. (Catatan: jalur `ProspectFormPage` masih bisa membuat akun `account_status='prospect'` langsung = jalur legacy pra-trigger; lihat `03_DATA_MODEL` entri `accounts` + `08_TECH_DEBT` TD-91.)
6. **Kosakata `pipeline_stage`** (NEW/CONTACTED/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST) adalah sumbu **deal-stage**, berbeda sumbu dari **lifecycle lead→MQL→SQL→prospect** pada target. Kode tak memisahkan "lifecycle akun" dari "deal stage" — keduanya bertumpuk di `accounts` (`account_status` vs `pipeline_stage`), dan tak satu pun memuat MQL/SQL.

---

## PERTANYAAN TERBUKA (tak bisa dipastikan dari kode saja)

1. **Apakah `account_status='lead_pool'` benar-benar hidup di data?** Hanya di-set oleh EF `aging-pipeline` (di luar `src/`); FE membaca `is_in_lead_pool`. Sinkron/drift-nya **butuh query** (§7c) — tak terbaca dari kode.
2. **Berapa inquiry yatim (tanpa prospect & customer)?** FK nullable mengizinkan, tapi form mencegah. Apakah ada baris lolos (mis. via import/SQL manual)? **Butuh query** (§7e).
3. **Apakah tabel `customers` (dorman) benar-benar kosong/tak dipakai produksi?** Kode hanya baca via `.legacy.jsx`. Isi tabel & apakah ada proses luar (Odoo/import) yang menulisnya **tak bisa dipastikan dari kode**.
4. **Perilaku EF `aging-pipeline` di produksi** (frekuensi, entitas mana `aging_enabled`, apakah benar men-set kedua kolom) hanya terbaca dari source EF + cron; **eksekusi nyata tak terverifikasi** tanpa log.
5. **Apakah `pipeline_stage`/`account_status` di data hanya berisi nilai yang dikenal kode?** Tanpa CHECK, nilai liar mungkin ada (mis. NURTURE, atau sisa migrasi). **Butuh query** (§7b/§7h).
6. **Siapa penulis `converted_to` (self-ref accounts)?** FK `prospects_converted_to_fkey` ada, tapi titik tulisnya tak terlihat jelas di `src/` (grep `converted_to` di creation points = tak muncul selain kolom); **tak bisa dipastikan** apakah kolom ini terisi.
7. **Snapshot vs produksi:** semua klaim DB dari `schema_snapshot.sql`. Jika produksi drift (objek dibuat manual belum di-`pg_dump`), nama constraint/CHECK bisa beda — **perlu re-cek `pg_policies`/`information_schema` bila kritikal.**

---

**Catatan wajib:** Audit ini **tidak menjalankan app/DB**; semua dari `src/` + `schema_snapshot.sql` + `supabase/functions/`. Angka data (§7) **tidak diisi** karena tak ada kredensial — query disediakan untuk dijalankan manual. Nol file diubah selain dokumen ini; nol perubahan DB.
