# CRM_FLOW.md — Pemetaan Alur CRM (AS-IS, read-only audit)

> Tanggal: 2026-06-17 · Mode: pemetaan, **bukan** perbaikan. Tidak ada kode/DB yang diubah.
> Sumber: `supabase/schema_snapshot.sql` (struktur DB) + kode `src/modules/crm/*`.
> Cakupan: Lead Pool → Prospek → Inquiry → Quotation → WON → Customer + Activity/Call/Visit.

**Catatan kunci di awal:**
- Semua entitas CRM (lead / prospek / customer / lost / free_agent) adalah **satu tabel `accounts`** yang dibedakan kolom `account_status`. Pipeline diatur kolom `pipeline_stage`. (Tabel `prospects` lama sudah di-rename → `accounts`; **nama FK tetap `prospects_*`**.)
- **Trigger `set_customer_on_won` TIDAK ADA di `schema_snapshot.sql`** (snapshot 17 Jun) — `grep` nihil, dan **tidak ada satu pun `CREATE TRIGGER ... ON public.accounts`**. Per info user, trigger ini ditambahkan via SQL Editor *setelah* snapshot. Jadi keberadaannya tidak bisa diverifikasi dari repo; di bawah saya tandai sebagai "DB-only, di luar snapshot".

---

## DIAGRAM ALUR

```
[Lead Pool]──ADA──▶[Prospek]──ADA──▶[Inquiry]──ADA──▶[Quotation]╌╌PUTUS╌╌▶[WON]──ADA*──▶[Customer]
 accounts          accounts          inquiries        quotations            pipeline    accounts
 account_status=   account_status=   .prospect_id     .inquiry_id           _stage=     account_status=
 'lead_pool'       'prospect'        →accounts        →inquiries            'WON'       'customer'
                                                       .prospect_id
                                                       →accounts

        Call / Visit ╌╌(OPTIONAL, sering kosong)╌╌▶ [accounts] via prospect_id
        sales_calls / sales_visits . prospect_id (nullable, ON DELETE SET NULL)
        TIDAK ada anchor ke Inquiry maupun Quotation.
```

Status tiap panah:
| Panah | Status | Mekanisme |
|---|---|---|
| Lead Pool → Prospek | **ADA** | UPDATE `account_status` di baris yang sama (bukan baris baru) |
| Prospek → Inquiry | **ADA** | `inquiries.prospect_id` (wajib dipilih di form) |
| Inquiry → Quotation | **ADA** (parsial) | `quotations.inquiry_id` wajib; autofill hanya `service_type`+`route`, **item harga input ulang** |
| Quotation → WON | **PUTUS** | Tak ada link otomatis. Status quotation (SENT/ACCEPTED) terpisah total dari `pipeline_stage`. WON di-set manual |
| WON → Customer | **ADA\*** | Frontend `WinLossModal` (Kanban) + trigger `set_customer_on_won` (DB-only, di luar snapshot). Jalur **edit form manual masih putus** |
| Call/Visit → Account | **ADA tapi OPTIONAL** | `prospect_id` nullable + tidak divalidasi → bisa orphan |

\* Konsistensi WON→Customer lihat **TITIK PUTUS #5**.

---

## TABEL RELASI ENTITAS

Dari `schema_snapshot.sql` (semua FK target `accounts` masih bernama `prospects_*` / `*_prospect_id_fkey` pasca-rename):

| Entitas A | Entitas B | Nyambung via (FK / kolom) | schema:line | Status |
|---|---|---|---|---|
| inquiries | accounts | `inquiries.prospect_id` → accounts(id) `inquiries_prospect_id_fkey` | 5887 | **ADA** |
| inquiries | accounts | `inquiries.customer_id` → accounts(id) `inquiries_customer_id_fkey` | 5879 | ADA (tabel) tapi **MATI di kode** — selalu NULL |
| quotations | inquiries | `quotations.inquiry_id` → inquiries(id) `quotations_inquiry_id_fkey` | 6159 | **ADA** |
| quotations | accounts | `quotations.prospect_id` → accounts(id) `quotations_prospect_id_fkey` | 6175 | **ADA** (diwarisi dari inquiry saat insert) |
| quotations | accounts | `quotations.customer_id` → accounts(id) `quotations_customer_id_fkey` | 6151 | ADA (tabel), terisi hanya jika inquiry punya customer |
| quotation_items | quotations | `quotation_items.quotation_id` → quotations(id) **CASCADE** | 6127 | **ADA** |
| sales_calls | accounts | `sales_calls.prospect_id` → accounts(id) **ON DELETE SET NULL** `sales_calls_prospect_id_fkey` | 6263 | **ADA tapi nullable/optional** |
| sales_calls | profiles | `sales_calls.salesperson_id` → profiles(id) SET NULL | 6271 | ADA |
| sales_calls | inquiries / quotations | — | — | **TIDAK ADA** |
| sales_visits | accounts | `sales_visits.prospect_id` → accounts(id) **ON DELETE SET NULL** `sales_visits_prospect_id_fkey` | 6311 | **ADA tapi nullable/optional** |
| sales_visits | profiles | `sales_visits.salesperson_id` → profiles(id) SET NULL | 6319 | ADA |
| sales_visits | inquiries / quotations | — | — | **TIDAK ADA** |
| sales_visit_logs | sales_visits | `sales_visit_logs.visit_id` → sales_visits(id) **CASCADE** | 6287 | ADA |
| accounts | accounts | `accounts.converted_to` → accounts(id) `prospects_converted_to_fkey` | 6087 | ADA (kolom) — **tidak dipakai kode manapun** |
| Lead Pool | accounts | bukan tabel; = `accounts WHERE account_status='lead_pool'` | — | **ADA (segmen, bukan relasi)** |

Catatan FK lain yang relevan: `customers.prospect_id → accounts(id)` (5415) — tabel `customers` legacy yang sudah dipensiunkan.

---

## ALUR USER PER LANGKAH (trace dari kode UI)

### 1. Lead → Prospek
- Halaman `LeadPoolPage.jsx`: list `accounts` `account_status='lead_pool'` ([LeadPoolPage.jsx:113](src/modules/crm/LeadPoolPage.jsx#L113)).
- Aksi **"Tarik ke Pipeline"** → `UPDATE accounts SET account_status='prospect', last_activity_at=now() WHERE id=lead.id` ([LeadPoolPage.jsx:155-157](src/modules/crm/LeadPoolPage.jsx#L155)).
- **Tidak ada konversi/baris baru** — lead dan prospek adalah baris `accounts` yang sama, hanya ganti status. Semua relasi (assigned_to, BANT, dll) terbawa.

### 2. Bikin Inquiry
- `InquiryFormPage.jsx`: ada toggle **sumber = prospect | customer** ([:80](src/modules/crm/InquiryFormPage.jsx#L80)); dropdown di-load dari `accounts` (prospect: status='prospect'; customer: status='customer'), `.limit(1000)` ([:84-86](src/modules/crm/InquiryFormPage.jsx#L84)).
- **Wajib pilih account**: validasi menolak jika `prospect_id`/`customer_id` kosong ([:94-95](src/modules/crm/InquiryFormPage.jsx#L94)). **Inquiry tidak bisa berdiri sendiri.**
- Saat simpan: apapun pilihannya, **disimpan ke `prospect_id`**, `customer_id` selalu NULL ([:114-115](src/modules/crm/InquiryFormPage.jsx#L114)). Insert ke `inquiries` ([:125](src/modules/crm/InquiryFormPage.jsx#L125)).
- Entry point: standalone dari menu Inquiry (bukan dari dalam halaman prospek). Prospek dipilih lewat dropdown, bukan pre-filled.

### 3. Bikin Quotation
- `QuotationFormPage.jsx`: **wajib pilih Inquiry** ([:460](src/modules/crm/QuotationFormPage.jsx#L460) `if (!header.inquiry_id) e.inquiry_id='Pilih inquiry'`). Dropdown inquiry di-load dengan embed prospect/customer ([:290-291](src/modules/crm/QuotationFormPage.jsx#L290)).
- Saat inquiry dipilih (`handleInquiryChange`, [:373-383](src/modules/crm/QuotationFormPage.jsx#L373)): **autofill `service_type` + `route`** dari inquiry. **Item harga TIDAK ikut** (inquiry tak punya line item) → item diinput manual.
- Saat insert ([:541-546](src/modules/crm/QuotationFormPage.jsx#L541)): `inquiry_id` dari header, `prospect_id`/`customer_id` **diwarisi dari `selectedInquiry.prospect.id`/`customer.id`**. Item disimpan ke `quotation_items` ([:568](src/modules/crm/QuotationFormPage.jsx#L568)).
- Jadi quotation **selalu** tertaut ke inquiry → otomatis ke account. Bukan standalone.

### 4. Log Call / Visit
- **Call** (`SalesCallsPage.jsx`): dropdown prospect dari `accounts` status='prospect' ([:386](src/modules/crm/SalesCallsPage.jsx#L386)). Validasi simpan **hanya `contact_name`** ([:458](src/modules/crm/SalesCallsPage.jsx#L458)). `prospect_id` opsional → disimpan `|| null` ([:465](src/modules/crm/SalesCallsPage.jsx#L465)). **Call bisa tanpa account.**
- **Visit** (`CRMDashboardPage.jsx` → `AddVisitModal`): dropdown dari `accounts` `IN ('prospect','customer')` ([:1742](src/modules/crm/CRMDashboardPage.jsx#L1742)). Validasi simpan **hanya `visit_type` + `salesperson_id`** ([:1753-1755](src/modules/crm/CRMDashboardPage.jsx#L1753)). `prospect_id` opsional → `|| null` ([:1765](src/modules/crm/CRMDashboardPage.jsx#L1765)). **Visit bisa tanpa account.** Perubahan status visit dicatat ke `sales_visit_logs` ([:1795](src/modules/crm/CRMDashboardPage.jsx#L1795)).

### 5. WON → Customer
- **Jalur Kanban** (`PipelineKanbanPage.jsx`): drag ke WON → soft-gate cek ada Quotation (count, [:515-523](src/modules/crm/PipelineKanbanPage.jsx#L515)) → `WinLossModal` → `handleWinLossSave` set `account_status='customer'` + `became_customer_at` + `converted_at` ([:561-568](src/modules/crm/PipelineKanbanPage.jsx#L561)). **Konversi ADA.**
- **Jalur edit form** (`ProspectFormPage.jsx`): ubah stage ke WON hanya stamp `converted_at`, **tidak set `account_status`** ([:320-323](src/modules/crm/ProspectFormPage.jsx#L320)). **Konversi PUTUS di jalur ini** (kecuali trigger DB menutupinya — lihat di bawah).
- **Trigger DB `set_customer_on_won`**: tidak ada di snapshot. Jika benar aktif di DB, ia menutup semua jalur (termasuk edit form & import). **Tidak terverifikasi dari repo.**

---

## TITIK PUTUS (diurut dampak)

1. **Quotation → WON tidak otomatis (PUTUS).** Status quotation (`DRAFT/SENT/ACCEPTED/REJECTED`, kolom `quotations.status`) **tidak terhubung** ke `accounts.pipeline_stage`. Tidak ada kode yang men-set account ke WON saat quotation di-accept. Soft-gate Kanban hanya menghitung *jumlah* quotation, bukan statusnya ([PipelineKanbanPage.jsx:516-519](src/modules/crm/PipelineKanbanPage.jsx#L516)). **Dampak user:** sales meng-accept quotation tapi pipeline tetap, harus geser WON manual; data "deal menang" bisa tidak sinkron dengan quotation yang benar-benar disetujui.

2. **Call & Visit boleh tanpa account (anchor optional).** `prospect_id` nullable + tidak divalidasi (Call [:458,465](src/modules/crm/SalesCallsPage.jsx#L458); Visit [:1753,1765](src/modules/crm/CRMDashboardPage.jsx#L1753)). **Dampak:** aktivitas yatim (orphan) — tidak muncul di riwayat account manapun, rekap aktivitas per-prospek/customer bocor/tidak lengkap.

3. **Tidak ada anchor Call/Visit ke Inquiry/Quotation.** Aktivitas hanya bisa menempel ke account secara umum, **tidak bisa** dikaitkan ke deal/inquiry/quotation spesifik (tidak ada kolom `inquiry_id`/`quotation_id` di `sales_calls`/`sales_visits`). **Dampak:** tak bisa jawab "call/visit ini untuk penawaran yang mana".

4. **`inquiries.customer_id` mati di kode.** Kolom + FK ada (5879) tapi kode selalu menulis ke `prospect_id` dan memaksa `customer_id=NULL` ([InquiryFormPage.jsx:114-115](src/modules/crm/InquiryFormPage.jsx#L114)). **Dampak:** ambiguitas model (dua kolom, satu mati) — risiko query salah kolom; quotation yang mewarisi `customer_id` dari inquiry akan selalu NULL.

5. **WON→Customer tidak konsisten antar-jalur (di level kode).** Jalur Kanban mengkonversi; jalur **edit form manual tidak** ([ProspectFormPage.jsx:320-323](src/modules/crm/ProspectFormPage.jsx#L320)); import/seed juga tidak. Penambal satu-satunya adalah trigger `set_customer_on_won` yang **tidak ada di snapshot** → jika trigger belum/tidak aktif, akan ada account `pipeline_stage='WON'` tapi `account_status='prospect'` (gejala TOKO DAMRAH). **Dampak:** WON tak terhitung sebagai customer di sebagian jalur.

6. **`accounts.converted_to` (self-FK) tidak dipakai.** Tak ada kode yang mengisinya. **Dampak:** kecil — kolom sisa desain lama, berpotensi membingungkan.

---

## ANCHOR UNTUK MODUL TASK / ACTIVITY

### Anchor yang SUDAH tersedia sekarang
| Aktivitas | Kolom anchor existing | FK | Catatan |
|---|---|---|---|
| `sales_calls` | `prospect_id` | → accounts (SET NULL) | **nullable**, tidak divalidasi |
| | `salesperson_id` | → profiles | siapa yang menelepon |
| | `created_by`, `company_id` | → profiles / companies | scope |
| | `next_action`, `next_action_date` | (kolom teks/date) | **embrio task** — niat tindak lanjut, tapi bukan entitas task |
| `sales_visits` | `prospect_id` | → accounts (SET NULL) | **nullable**, tidak divalidasi |
| | `salesperson_id` | → profiles | |
| | `visit_type`, `follow_up`, `mom` | (kolom) | tindak lanjut bebas-teks |
| | `created_by`, `company_id` | | scope |
| `sales_visit_logs` | `visit_id` | → sales_visits (CASCADE) | riwayat status visit |

### Untuk task/activity yang NEMPEL ke prospek/customer/inquiry — apa yang ADA vs PERLU
- **Nempel ke prospek/customer:** anchor **SUDAH ADA** = `prospect_id` (→ `accounts`, karena prospek & customer satu tabel). Cukup pakai itu sebagai `account_id` secara semantik. *Yang perlu diperketat:* jadikan **NOT NULL / wajib divalidasi** kalau task harus selalu punya pemilik account (sekarang nullable).
- **Nempel ke Inquiry:** **PERLU kolom baru** `inquiry_id` (FK → `inquiries`). Belum ada di `sales_calls`/`sales_visits` maupun tabel task manapun.
- **Nempel ke Quotation:** **PERLU kolom baru** `quotation_id` (FK → `quotations`). Belum ada.
- **Tabel task khusus:** belum ada tabel `tasks`/`activities` generik. Kalau modul task dibuat, kolom anchor yang ideal (identifikasi saja, **tanpa SQL**):
  - `company_id`, `created_by`, `assigned_to` (→ profiles) — scope & kepemilikan
  - `account_id` (→ accounts) — anchor utama prospek/customer (manfaatkan unifikasi accounts)
  - `inquiry_id` (nullable → inquiries) — opsional, untuk task terkait penawaran
  - `quotation_id` (nullable → quotations) — opsional
  - field task: `type`, `status`, `due_date`, `title/notes`
  - Alternatif: pola **polymorphic** (`related_type` + `related_id`) bila ingin satu tabel task melayani banyak entitas — trade-off: kehilangan integritas FK.

> Kesimpulan anchor: **account sudah bisa di-anchor hari ini** (via `prospect_id`/accounts). **Inquiry & Quotation belum punya anchor** di aktivitas → itu kolom yang perlu ditambah saat membangun modul task/activity. (Identifikasi saja — tidak dibuat di sini.)
