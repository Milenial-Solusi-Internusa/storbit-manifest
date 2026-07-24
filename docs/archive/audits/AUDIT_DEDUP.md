# AUDIT — Fondasi Fitur "Cegah Duplikat Akun"

> **Mode:** AUDIT (read-only). Nol file diubah, nol SQL dijalankan. File ini satu-satunya yang dibuat.
> **Tanggal:** 24 Jul 2026 · Branch `feat/inquiry-merge-goods-name` · HEAD `260e9ae`
> **Aturan bisnis (final, tidak diperdebatkan):** satu perusahaan = satu akun, hard-block, cakupan **PER-ENTITAS**.
> **Sumber:** `supabase/schema_snapshot.sql` (pg_dump 22 Jul, commit `b17757e`) · `supabase/migrations/20260722000005_dedup_accounts.sql` · `src/lib/db.js` · `src/modules/crm/ProspectFormPage.jsx` · `src/modules/crm/CustomerListPage.jsx` · `src/App.jsx` · Governance 03/08.

> ## ⚠️ BATAS AUDIT INI — BACA DULU
>
> Saya **tidak menjalankan query apa pun**. Konsekuensinya tegas:
>
> | Pertanyaan | Bisa dijawab dari repo? |
> |---|---|
> | 1. Struktur tabel | ✅ **YA** — penuh, dari snapshot |
> | 2. Extension `pg_trgm` | ❌ **TIDAK** — lihat alasan di bawah |
> | 2. Index & constraint | ⚠️ **SEBAGIAN** — snapshot per 22 Jul, bukan kondisi live |
> | 3. Data kotor pasca-normalisasi | ❌ **TIDAK** — butuh data. SQL disediakan |
> | 4. Kasus ALLIANCE | ❌ **TIDAK** — butuh data. SQL disediakan |
> | 5. Jalur create account | ✅ **YA** — penuh, dari kode |
>
> Semua angka konkret di bagian 3 & 4 harus datang dari menjalankan SQL di lampiran. **Saya tidak menebak satu angka pun.**

---

## RINGKASAN

**(1) Struktur.** Nama perusahaan ada di `accounts.name` (`text NOT NULL`, **tanpa constraint apa pun**). Kolom entitas **ADA DUA** dan ini masalah pertama yang harus diputuskan sebelum menulis index: `company_id` (`uuid NOT NULL`, FK `companies`) dipakai RLS dan dup-check Prospect, sementara `owner_company_id` (`uuid` **NULLABLE**, FK `companies`) dipakai **filter entitas di UI** dan **penerbitan kode customer**. Keduanya di-set sama saat INSERT oleh ketiga jalur create, tapi **tidak ada constraint yang memaksa keduanya tetap sama**, dan `owner_company_id` boleh NULL. Nilai `'MSI'/'JCI'/'SOA'` bukan enum — itu `companies.code varchar(20)`, dicapai lewat FK.

**(2) Extension & index.** `pg_trgm` **tidak bisa dipastikan dari repo** — snapshot ini di-dump hanya untuk schema `public`, jadi tak memuat satu pun `CREATE EXTENSION`. **Tapi ada bukti kuat tak langsung**: migrasi `20260722000005` baris 34-36 menulis *"Extension pg_trgm HANYA dipakai untuk survei awal"* — artinya per 22 Jul pg_trgm dipakai untuk `similarity()`. Itu **indikasi, bukan verifikasi**; query pemastiannya ada di lampiran. Index di `accounts` per snapshot: **satu UNIQUE** (`accounts_code_unique` pada `code`, partial `WHERE code IS NOT NULL`, dan **GLOBAL — tidak per-company**) plus tiga index biasa (`assigned_to`, `company_id`, `pipeline_stage`). **NOL constraint/index unik pada `name`** — persis lubang yang mau ditutup.

**(3) Data kotor.** Tidak bisa saya hitung. **Tapi repo memberi baseline yang sangat berguna**: dedup massal sudah pernah jalan 22 Jul (39 baris soft-delete, 2 lifecycle dinaikkan, akun aktif jadi 1.050), dan migrasinya mencatat **sisa 7 grup** duplikat ternormalisasi plus **~13 pasang beda-ejaan** yang butuh mata manusia. **Dua peringatan keras:** (a) normalisasi yang Anda tentukan (`upper(trim(collapse-spasi))`) **jauh lebih lemah** dari yang dipakai 22 Jul (yang juga membuang PT/CV/TBK dan seluruh non-alfanumerik), jadi angka "7" **bukan** jawaban pertanyaan Anda; (b) dedup 22 Jul dijalankan **GLOBAL tanpa scoping entitas**, padahal aturan final Anda per-entitas — pass itu lebih agresif dari aturannya.

**(4) ALLIANCE.** Nol data di repo. Satu-satunya jejak: migrasi `20260722000005` baris 54 menyebut pasangan **`ALLIANC` vs `ALLIANCE COSMETICS`** sebagai contoh sisa yang lolos normalisasi eksak. Query detailnya ada di lampiran §Q4.

**(5) Jalur create.** Ada **TIGA** jalur INSERT ke `accounts` yang hidup, dengan **tiga perilaku dup-check yang berbeda-beda dan tak satu pun memblokir**: `ProspectFormPage.jsx:267` (warning lunak, scope `company_id` + pra-customer), `CustomerListPage.jsx:366` (warning lunak, **tanpa scope entitas sama sekali**), dan `db.js:264` lewat `CustomerModal` (`App.jsx:4445` — **satu-satunya yang hard-block**, tapi client-side terhadap list in-memory). Error handling ketiganya menampilkan `err.message` mentah. Sudah ada **preseden 23505 yang rapi** untuk dicontek di `VendorListPage.jsx:202-207`.

---

## STRUKTUR `accounts`

Sumber: `schema_snapshot.sql:1600-1724` (blok `CREATE TABLE public.accounts`).

### Kolom yang ditanyakan

| Peran | Kolom persis | Tipe | Null? | Default | Catatan |
|---|---|---|---|---|---|
| **Nama perusahaan** | `name` | `text` | **NOT NULL** | — | **Nol constraint, nol index.** Bebas apa saja termasuk string kosong |
| **Entitas (kandidat A)** | `company_id` | `uuid` | **NOT NULL** | — | FK → `companies(id)` (`prospects_company_id_fkey`). Dipakai **RLS** + dup-check Prospect |
| **Entitas (kandidat B)** | `owner_company_id` | `uuid` | **NULLABLE** | — | FK → `companies(id)` (`prospects_owner_company_id_fkey`). Dipakai **filter entitas UI** + `generate_customer_code` |
| **Lead pool** | `is_in_lead_pool` | `boolean` | **NULLABLE** | `false` | ⚠️ nullable — lihat TEMUAN A-3 |
| **Soft delete** | `deleted_at` | `timestamptz` | NULLABLE | — | Penanda hapus. Konvensi repo: baris hidup = `deleted_at IS NULL` |
| **Lifecycle** | `account_status` | `varchar(50)` | NULLABLE | `'lead'` | CHECK 7 nilai: `lead`/`mql`/`sql`/`prospect`/`customer`/`free_agent`/`lost` |

### Kolom identitas lain

| Kolom | Tipe | Null? | Constraint | Terisi? |
|---|---|---|---|---|
| `legal_name` | `varchar` | NULLABLE | nol | opsional, diisi manual di form Customer |
| `tax_id` (NPWP) | `varchar` | NULLABLE | **nol unique** | opsional, diisi manual |
| `code` (customer code) | `text` | NULLABLE | **UNIQUE global** `accounts_code_unique WHERE code IS NOT NULL` | diterbitkan trigger `trg_gen_customer_code_ins` saat `account_status='customer'` |
| `company_prefix` | `text` | NULLABLE | nol | prefix nama (PT/CV) di form Prospect, **terpisah dari `name`** |
| `customer_type` | `varchar` | NULLABLE | nol | |
| `is_odoo_customer` | `boolean` | NOT NULL | — | default false; per 03_DATA_MODEL: **0 dari 997 true** (kolom mati, TD-57) |

### ⚠️ TEMUAN A-1 — Kolom entitas ada DUA, dan ini keputusan yang harus diambil SEBELUM menulis index

Ini temuan paling penting di audit ini. Bukti bahwa keduanya benar-benar dipakai untuk maksud berbeda:

| Pemakaian | Kolom yang dipakai | Bukti |
|---|---|---|
| RLS `prospects_read`/`insert`/`update` | **`company_id`** | `schema_snapshot.sql:12225`, `:12232`, `:12239` |
| Filter entitas di UI Customer (chip MSI/JCI/SOA) | **`owner_company_id`** | `CustomerListPage.jsx:569` embed `source_company:companies!prospects_owner_company_id_fkey(name,code)`, dipakai di `:608`, `:610`, `:621` |
| Penerbitan kode customer | **`COALESCE(owner_company_id, company_id)`** | `generate_customer_code()`, `schema_snapshot.sql:448` |
| Dup-check Prospect (yang sekarang) | **`company_id`** | `ProspectFormPage.jsx:203` |
| Dup-check Customer (yang sekarang) | **tidak ada** | `CustomerListPage.jsx:305-309` — tak menyebut kolom entitas mana pun |

Ketiga jalur INSERT menulis keduanya dengan nilai sama (`db.js:259`, `CustomerListPage.jsx:360-361`, `ProspectFormPage.jsx:266`) — **tapi itu hanya berlaku untuk baris yang lahir dari aplikasi**. Baris hasil import (Storbit/Odoo/Lead Pool 506 lead) tidak lewat jalur itu. `owner_company_id` **nullable tanpa default**, jadi baris ber-`owner_company_id` NULL **mungkin ada**.

**Konsekuensi teknis yang tidak bisa diabaikan:** kalau index dibuat pada `owner_company_id` dan ada baris NULL, semua baris NULL itu **lolos dari UNIQUE** (NULL tak pernah sama dengan NULL di btree) — hard-block-nya bocor diam-diam. Kalau index dibuat pada `company_id`, index-nya rapat (NOT NULL) **tapi sumbunya beda dari yang dilihat user di layar** — user melihat chip entitas yang dibangun dari `owner_company_id`, lalu ditolak oleh aturan yang berbasis `company_id`. Pesan errornya akan terasa salah.

**Query pemastian ada di lampiran §Q1.** Jangan pilih kolomnya sebelum query itu dijalankan. Kalau ternyata `owner_company_id` selalu = `company_id` dan nol NULL, keputusannya bebas dan sebaiknya `company_id` (NOT NULL, rapat). Kalau ada divergensi, itu keputusan bisnis, bukan teknis.

### ⚠️ TEMUAN A-2 — `accounts_code_unique` GLOBAL, tidak per-entitas

`schema_snapshot.sql:6429`: `CREATE UNIQUE INDEX accounts_code_unique ON public.accounts USING btree (code) WHERE (code IS NOT NULL);`

Tidak ada `company_id` di dalamnya. Praktis ini tidak menimbulkan bentrok karena `code` sudah memuat prefix entitas (`MSI/CUST/2026/LI`), jadi kode antar entitas tak akan tabrakan. Dicatat supaya tidak jadi preseden: **kalau index nama nanti dibuat mengikuti pola ini (tanpa kolom entitas), aturan per-entitas Anda langsung dilanggar.** Bandingkan dengan `vendors_company_code_unique(company_id, code)` yang benar per-company.

Perlu diperhatikan juga: `accounts_code_unique` **tidak mengecualikan baris soft-deleted**. Kode akun yang di-soft-delete tetap menyandera nomornya selamanya. Ini pola yang **jangan** ditiru untuk index nama — lihat TEMUAN A-3.

### ⚠️ TEMUAN A-3 — Predikat partial index: `deleted_at` aman, `is_in_lead_pool` berbahaya

Untuk `deleted_at`, predikat `WHERE deleted_at IS NULL` benar dan aman.

Untuk `is_in_lead_pool` (kalau Anda memutuskan akun parkir dikecualikan dari hard-block), kolomnya `boolean` **NULLABLE** dengan default `false`. Menulis `WHERE is_in_lead_pool = false` akan **melewatkan seluruh baris ber-NULL** — dan baris NULL sangat mungkin ada, karena kolom ini ditambahkan belakangan (batch aging-pipeline/Lead Pool) sehingga baris lama yang tidak ikut backfill bisa NULL. Bentuk yang benar: `WHERE is_in_lead_pool IS NOT TRUE`.

**Tapi pertanyaan yang lebih dulu harus dijawab: apakah akun Lead Pool ikut kena hard-block?** Ini tidak ada di brief. Lihat CATATAN AMBIGU #2.

---

## EXTENSION & INDEX EKSISTING

### `pg_trgm` — TIDAK BISA DIPASTIKAN DARI REPO

Snapshot ini di-dump **hanya untuk schema `public`**. Buktinya: file hanya memuat `CREATE SCHEMA public;` (baris 20), sementara fungsi-fungsi merujuk `extensions.uuid_generate_v4()` — artinya schema `extensions` ada di DB tapi **tidak ikut di-dump**. Grep `CREATE EXTENSION` di seluruh snapshot: **nol hit**. Grep `USING gin|gist`: **nol hit**.

Jadi ketiadaan pg_trgm di snapshot **tidak membuktikan apa-apa** — persis kasus yang diperingatkan `CLAUDE.md` ("snapshot bilang kolom tidak ada ≠ kolomnya tidak ada").

**Bukti tak langsung yang kuat:** `supabase/migrations/20260722000005_dedup_accounts.sql` baris 34-36 menulis:

> *"similarity() meleset dua arah pada data ini… Extension pg_trgm HANYA dipakai untuk survei awal, TIDAK dipakai di eksekusi ini — file ini tidak bergantung padanya."*

Kalimat itu hanya masuk akal kalau `similarity()` benar-benar dijalankan pada 22 Jul, yang berarti pg_trgm terpasang saat itu. **Perlakukan sebagai indikasi, bukan fakta.** Query pemastian: lampiran §Q2a.

### Index & constraint di `accounts` per snapshot 22 Jul

| Nama | Jenis | Definisi | Partial? |
|---|---|---|---|
| `prospects_pkey` | PRIMARY KEY | `(id)` | tidak |
| `accounts_code_unique` | **UNIQUE INDEX** | `btree (code)` | **ya** — `WHERE code IS NOT NULL` |
| `idx_prospects_assigned_to` | INDEX | `btree (assigned_to)` | tidak |
| `idx_prospects_company_id` | INDEX | `btree (company_id)` | tidak |
| `idx_prospects_pipeline_stage` | INDEX | `btree (pipeline_stage)` | tidak |

CHECK constraint: `accounts_account_status_check` (7 nilai lifecycle), `accounts_pull_status_check` (pending/approved/rejected), `prospects_source_check` (11 nilai source).

FK keluar: 8 (`company_id`, `owner_company_id`, `assigned_to`, `assigned_profile`, `created_by`, `updated_by`, `converted_to`, `payment_terms_id`, `pull_approved_by`).

**FK masuk ke `accounts`: 20 constraint dari 19 tabel** — `activities`, `ar_ttfs`, `customers`, `dc_master`, `deal_handovers`, `delivery_notes`, `inquiries` (×2: `prospect_id` + `customer_id`), `picking_lists`, `prf`, `quotations` (×2), `sales_calls`, `sales_orders`, `sales_visits`, `sp_btb`, `sp_items`, `sp_orders`, `top_requests`, dan `accounts.converted_to` (self-FK). Relevan karena **merge duplikat = memindahkan 20 FK**, dan itu alasan migrasi 22 Jul sengaja tidak menyentuh grup yang dua-duanya berdata.

**Yang TIDAK ADA:** nol UNIQUE pada `name`, nol UNIQUE pada `(company_id, name)`, nol UNIQUE pada `tax_id`, nol index trigram. Verifikasi kondisi live: lampiran §Q2b.

---

## DATA KOTOR PASCA-NORMALISASI

**Saya tidak bisa menghitung ini** — butuh akses data. Yang bisa saya berikan: baseline dari repo, peringatan metodologis, dan query siap jalan.

### Baseline dari migrasi 22 Jul (fakta tercatat, bukan tebakan)

Migrasi `20260722000005_dedup_accounts.sql` menyatakan sudah dijalankan & terverifikasi:

| Fakta | Nilai | Sumber |
|---|---|---|
| Akun aktif sebelum dedup | 1.089 | baris 3 |
| Baris di-soft-delete | 39 | baris 4-5 |
| Akun aktif sesudah | 1.050 | baris 4 |
| Lifecycle dinaikkan | 2 baris | baris 10 |
| **Sisa grup duplikat ternormalisasi** | **7** | baris 8, 144-145 |
| Sisa pasangan beda-ejaan (perkiraan penulis migrasi) | ~13 | baris 53-57 |
| Backup pra-dedup | `accounts_dedup_backup_20260722` | baris 64 (ada di snapshot `:1725`) |

Contoh pasangan beda-ejaan yang disebut eksplisit di baris 54-56: `ALLIANC` vs `ALLIANCE COSMETICS`, `HINOMOTO MANUFACTURE` vs `MANUFACTURING`, `SINAR JAYA LOGISTICS` vs `LOGISTIK`, `MENARA PERDANA ANUGERAH` vs `ANUGRAH`.

### ⚠️ TEMUAN B-1 — Angka "7" BUKAN jawaban pertanyaan Anda

Normalisasi yang dipakai 22 Jul (baris 71) berbeda dari yang Anda tentukan:

| | Normalisasi Anda | Normalisasi migrasi 22 Jul |
|---|---|---|
| Ekspresi | `upper(trim(regexp_replace(name,'\s+',' ','g')))` | `lower(regexp_replace(regexp_replace(name,'\y(PT\|CV\|TBK)\y\.?','','gi'),'[^a-zA-Z0-9]','','g'))` |
| Buang PT/CV/TBK | **tidak** | ya |
| Buang tanda baca | **tidak** | ya |
| Buang SEMUA spasi | tidak (hanya rapikan) | ya |
| Agresivitas | **lemah** | kuat |

Contoh konkret: `PT Alun Indah` vs `ALUN INDAH` **bertabrakan** di normalisasi migrasi, tapi **TIDAK bertabrakan** di normalisasi Anda. Artinya jumlah grup di bawah aturan Anda akan **lebih sedikit** dari 7 — tapi berapa persisnya harus dihitung, bukan diturunkan.

Ini sebetulnya **kabar baik untuk pemasangan index**: normalisasi lemah = lebih sedikit yang nge-block. Tapi ini juga berarti hard-block Anda **tidak akan mencegah** `PT Alun Indah` didaftarkan di sebelah `ALUN INDAH`. Pilihan normalisasi = pilihan seberapa ketat pencegahannya. Lihat CATATAN AMBIGU #1.

### ⚠️ TEMUAN B-2 — Dedup 22 Jul dijalankan GLOBAL, tanpa scoping entitas

CTE `norm` (baris 69-73) mengambil seluruh `accounts WHERE deleted_at IS NULL` **tanpa** filter atau partisi `company_id`/`owner_company_id`. Window function-nya `PARTITION BY n` saja (baris 105-107).

Artinya: kalau ada perusahaan yang sah punya akun di MSI **dan** di JCI dengan nama sama, pass 22 Jul **men-soft-delete salah satunya** — padahal di bawah aturan final Anda (per-entitas) keduanya sah.

Saya **tidak tahu apakah ini benar-benar terjadi** — perlu dicek ke tabel backup. Kalau terjadi, ada baris yang perlu dipulihkan sebelum index dipasang, bukan sesudah. Query: lampiran §Q3c.

### ⚠️ TEMUAN B-3 — Satu jalur create meng-UPPERCASE nama, dua lainnya tidak

`App.jsx:4459` (CustomerModal, jalur Storbit): `name: data.name.trim().toUpperCase()`.

`ProspectFormPage.jsx` dan `CustomerListPage.jsx` menyimpan `form.name.trim()` apa adanya.

Jadi `accounts.name` berisi campuran ALL-CAPS (dari Storbit) dan Title/mixed case (dari CRM). Normalisasi `upper()` Anda memang menyeragamkan ini untuk keperluan index — dicatat karena menjelaskan kenapa data terlihat tidak konsisten, dan karena **kalau hard-block dipasang, jalur Storbit akan menabrak akun CRM bernama sama dengan casing berbeda** (yang memang diinginkan, tapi pesannya harus jelas).

### Query untuk menjawab pertanyaan 3

Lampiran §Q3a (grup exact-identik pasca-normalisasi Anda, per-entitas, dengan detail per baris + status hidup/kosong) dan §Q3b (kandidat mirip via trigram, tanpa threshold — dilaporkan apa adanya, diurut similarity).

---

## KASUS ALLIANCE

**Nol data di repo.** Saya tidak bisa menampilkan satu baris pun.

Satu-satunya jejak, di `supabase/migrations/20260722000005_dedup_accounts.sql:53-57`:

> *"SISA YANG TIDAK TERTANGKAP normalisasi eksak: sekitar 13 pasang yang berbeda ejaan atau kata, mis. **ALLIANC vs ALLIANCE COSMETICS**, HINOMOTO MANUFACTURE vs MANUFACTURING… Ini butuh penilaian manusia, tidak bisa diotomatiskan."*

Yang bisa saya simpulkan dari kalimat itu, dan **hanya** ini:

| Yang bisa disimpulkan | Yang TIDAK bisa disimpulkan |
|---|---|
| Per 22 Jul ada ≥2 akun aktif bernama mirip `ALLIANCE` | berapa banyak persisnya |
| Salah satunya bernama pendek/terpotong (`ALLIANC`) | apakah itu typo, singkatan, atau perusahaan berbeda |
| Keduanya **lolos** dedup 22 Jul → **dua-duanya masih aktif** | entitas masing-masing, lifecycle-nya, ada transaksi atau tidak |
| Migrasi menganggapnya butuh penilaian manusia | mana yang layak dipertahankan |

**Catatan penting soal harapan hasilnya:** `ALLIANC` vs `ALLIANCE COSMETICS` **tidak akan bertabrakan** di normalisasi yang Anda tentukan (beda huruf, beda jumlah kata). Jadi pasangan ini **tidak akan nge-block** pemasangan UNIQUE index — tapi juga berarti hard-block Anda **tidak akan mencegah** kasus semacam ini terulang. Pencegahan untuk kelas ini butuh fuzzy pre-check di UI (pertanyaan 5b), bukan index.

Query lengkap dengan seluruh kolom yang Anda minta plus hitungan transaksi per baris: **lampiran §Q4**.

---

## JALUR CREATE ACCOUNT

Ada **tiga** jalur INSERT hidup ke `accounts`. Ketiganya punya perilaku dup-check berbeda, dan **tidak satu pun memblokir di sisi server**.

| # | Jalur | INSERT di | Dipicu dari | Lifecycle lahir |
|---|---|---|---|---|
| **1** | Form Prospect / akun baru CRM | `ProspectFormPage.jsx:267` | CRM → Account → Prospects → "Tambah Prospect" | `'lead'` (`:266`) |
| **2** | Modal Customer CRM | `CustomerListPage.jsx:366` | CRM → Customer → tambah customer | `'customer'` (`:364`) |
| **3** | Modal Customer Storbit | `db.js:264` (`upsertCustomer`) | menu `customers` → `CustomerModal` (`App.jsx:3022`, `:3706-3712`) | `'customer'` (`db.js:258`) |

### Dup-check yang ada sekarang — tiga perilaku berbeda, semuanya lemah

| Aspek | Jalur 1 (`ProspectFormPage:199-205`) | Jalur 2 (`CustomerListPage:300-316`) | Jalur 3 (`App.jsx:4444-4453`) |
|---|---|---|---|
| Kapan jalan | `onBlur` field nama (`:322`) | `onBlur` field nama (`:401`) | saat submit |
| Cara cek | query DB `ilike(name)` | query DB `ilike(name)` | `.find()` **in-memory** atas `existingCustomers` |
| Scope entitas | **`company_id`** ✅ | **TIDAK ADA** ❌ | tak relevan (list sudah ter-RLS) |
| Scope lifecycle | `lead/mql/sql/prospect/lead_pool` | `customer/free_agent` | `account_status='customer'` saja |
| `deleted_at IS NULL` | ✅ | ✅ | ✅ (dari `listCustomers`) |
| Skip saat edit | ✅ `if (isEdit) return` | ✅ bandingkan nama lama | ✅ `c.id !== initial?.id` |
| **Memblokir?** | ❌ warning oranye (`:326`) | ❌ warning (`:404-408`) | ✅ **`alert()` + `return`** |
| Normalisasi | `trim()` saja | `trim()` saja | `trim().toUpperCase()` |

**Tiga lubang yang perlu dicatat sebelum menulis fitur:**

Pertama, **jalur 1 dan 2 bersama-sama tidak menutup lingkaran**. Jalur 1 hanya melihat akun pra-customer, jalur 2 hanya melihat customer-side. Jadi mendaftarkan prospect bernama sama dengan customer yang sudah ada **tidak memicu warning apa pun** di jalur 1, dan sebaliknya di jalur 2. Hard-block per-entitas nanti akan menabrak justru di celah ini, dan user tidak pernah diperingatkan lebih dulu.

Kedua, **jalur 2 tidak menyaring entitas sama sekali** (`CustomerListPage.jsx:305-309` tidak menyebut `company_id` maupun `owner_company_id`). Praktis RLS `prospects_read` sudah membatasi ke company user — **tapi bukan itu yang membuat perilakunya benar**, dan untuk super_admin (yang bypass RLS lintas entitas) warning-nya akan salah: ia akan diperingatkan soal akun di entitas lain yang sebetulnya sah.

Ketiga, **jalur 3 mengecek terhadap list in-memory**, dan `listCustomers()` (`db.js:212-223`) **tidak punya `.limit()` eksplisit** — ia mengandalkan batas baris default PostgREST. Kalau jumlah customer melewati batas itu, dup-check-nya **diam-diam mengecek terhadap data terpotong**. Ini melanggar aturan wajib repo (`CLAUDE.md`: "Fetch: selalu `.limit(1000)`").

### ⚠️ TEMUAN C-1 — RLS membuat pre-check fuzzy TIDAK BISA DIPERCAYA untuk sales

Ini temuan paling penting untuk desain fitur (b).

`prospects_read` (`schema_snapshot.sql:12232`):
```
is_super_admin() OR (company_id = get_user_company_id() AND (
  is_manager_or_above() OR assigned_to = auth.uid() OR created_by = auth.uid()
  OR (has_role('operations') AND account_status = 'customer')))
```

Untuk user ber-role **`sales`** (bukan manager+), cabang yang berlaku hanya `assigned_to = auth.uid() OR created_by = auth.uid()` — artinya **sales hanya bisa membaca akun miliknya sendiri**.

Konsekuensi langsung: **pre-check fuzzy apa pun yang dijalankan dari frontend dengan sesi sales akan buta terhadap akun milik sales lain.** Sales A mengetik "PT Alliance Cosmetic", sistem bilang "tidak ada yang mirip" (karena akunnya milik Sales B), user menekan simpan, lalu **ditolak UNIQUE index dengan error dari DB**. Pengalamannya justru lebih buruk daripada tanpa pre-check, karena user sudah diyakinkan bahwa namanya aman.

Ini juga menjelaskan kenapa duplikat menumpuk sampai perlu dedup 39 baris: warning yang ada sekarang memang tidak bisa melihat akun sales lain.

**Implikasi desain (bukan instruksi — keputusan Anda):** pre-check fuzzy yang berguna harus lewat jalur yang bisa membaca lintas-pemilik dalam satu entitas, misalnya RPC `SECURITY DEFINER` yang hanya mengembalikan `name` + entitas (bukan seluruh baris, supaya tidak membocorkan pipeline sales lain). Kalau pre-check tetap dijalankan lewat PostgREST biasa, **jujurlah di UI** bahwa cek ini tidak menjamin.

### Titik sisip yang direkomendasikan

**(a) Pre-check fuzzy "ada akun mirip"**

| Jalur | Titik sisip | Alasan |
|---|---|---|
| 1 | `ProspectFormPage.jsx:199-205` — ganti isi `checkDuplicateName` | sudah ter-wire ke `onBlur` (`:322`) dan sudah punya slot render warning (`:326`); tinggal ganti mesinnya |
| 2 | `CustomerListPage.jsx:300-316` — ganti isi `checkDuplicate` | idem; slot render `:404-408` |
| 3 | `App.jsx:4444-4453` — di dalam blok cek duplikat yang sudah ada | sudah hard-block; tinggal ganti `.find()` exact jadi panggilan fuzzy |

Ketiganya sebaiknya memanggil **satu helper bersama** (misalnya `src/lib/accountDedup.js`), bukan tiga implementasi — tiga versi berbeda persis penyakit yang membuat kondisi hari ini.

**(b) Error handling 23505**

| Jalur | Titik sisip | Bentuk sekarang |
|---|---|---|
| 1 | `ProspectFormPage.jsx:276-278` (blok `catch`) | `showToast('Gagal menyimpan: ' + err.message, 'error')` |
| 2 | `CustomerListPage.jsx:371-373` (blok `catch`) | `showToast('Gagal menyimpan: ' + err.message, 'error')` |
| 3 | `App.jsx:2325-2327` (blok `catch` `handleSaveCustomer`) | `showToast('Gagal menyimpan customer: ' + (err.message \|\| 'unknown error'), 'error')` |

Ketiganya menampilkan pesan Postgres mentah. Untuk 23505 pesannya akan berbunyi seperti `duplicate key value violates unique constraint "accounts_name_per_entity_unique"` — tidak layak dibaca sales.

**Preseden yang sudah ada di repo dan tinggal dicontek** — `VendorListPage.jsx:201-207`:
```js
} catch (err) {
  // 23505 = unique_violation → constraint vendors_company_code_unique (company_id, code).
  if (err?.code === '23505') {
    setFormErrors(e => ({ ...e, code: 'Kode sudah dipakai' }));
    showToast?.(`Kode vendor "${form.code.trim()}" sudah dipakai di company ini.`, 'error');
  } else {
    showToast?.('Gagal menyimpan vendor: ' + (err?.message || 'terjadi kesalahan'), 'error');
  }
}
```
Pola ini menandai field-nya **dan** memberi toast spesifik. Catatan teknis: `err.code` tersedia karena `throw error` melempar objek error Supabase apa adanya (`ProspectFormPage.jsx:269`, `CustomerListPage.jsx:368`) — jadi `err?.code` **akan terbaca** di ketiga jalur. Untuk jalur 3, error dilempar ulang lewat `useCustomers.js:43` (`throw err`) sehingga `err.code` juga sampai ke `App.jsx:2325`. **Tidak perlu mengubah plumbing.**

⚠️ Satu jebakan: kalau constraint dibuat sebagai **partial unique index**, pesan errornya menyebut **nama index**, bukan nama constraint. Bedakan `accounts_code_unique` (yang sudah ada) dari index nama yang baru — kalau handler hanya mengecek `err.code === '23505'` tanpa melihat `err.message`/`err.details`, **bentrok `code` akan salah dilaporkan sebagai bentrok nama**. Jalur 2 dan 3 menulis `code` di INSERT (`CustomerListPage.jsx:363`, dan trigger `generate_customer_code`), jadi keduanya bisa memicu 23505 dari constraint yang berbeda.

---

## CATATAN AMBIGU

**#1 — Normalisasi mana yang jadi kontrak index?**
Anda menentukan `upper(trim(regexp_replace(name,'\s+',' ','g')))`. Itu **tidak** menangkap `PT Alun Indah` vs `ALUN INDAH`, `PT. ABC` vs `PT ABC`, maupun `ABC Corp.` vs `ABC Corp`. Migrasi 22 Jul memakai normalisasi yang jauh lebih kuat justru karena kasus-kasus itu nyata di data ini. Saya **tidak mengganti** normalisasi Anda — tapi perlu Anda sadari bahwa hard-block dengan normalisasi lemah akan lolos justru pada bentuk duplikat yang paling umum di data ini. Query §Q3a saya tulis **parametrik**: menjalankan kedua normalisasi berdampingan supaya Anda bisa lihat selisihnya sebelum memutuskan.

**#2 — Apakah akun Lead Pool ikut kena hard-block?**
Brief menyebut `is_in_lead_pool` sebagai kolom yang harus saya laporkan, tapi tidak menyatakan apakah akun parkir dikecualikan. Dua arah punya konsekuensi nyata: kalau **ikut**, akun yang diparkir tetap menyandera namanya sehingga sales tak bisa mendaftarkan ulang perusahaan itu tanpa menariknya dari pool (padahal alur tarik-keluar butuh approval manager). Kalau **dikecualikan**, akan lahir duplikat baru tiap kali ada akun parkir bernama sama, dan hard-block-nya berlubang persis di tempat yang sering dipakai. Saya tidak memilihkan. Kalau dikecualikan, predikatnya wajib `IS NOT TRUE`, bukan `= false` (TEMUAN A-3).

**#3 — `company_id` atau `owner_company_id`?**
Sudah dibahas di TEMUAN A-1. Tidak bisa diputuskan tanpa hasil §Q1. Kalau keduanya ternyata selalu identik dan nol NULL, saya condong ke `company_id` karena NOT NULL (index rapat, tak ada celah NULL) — tapi itu rekomendasi teknis, dan sumbu yang dilihat user di layar adalah `owner_company_id`.

**#4 — Baris soft-deleted: dikecualikan atau tidak?**
Saya asumsikan **dikecualikan** (`WHERE deleted_at IS NULL`) karena itu konvensi repo dan karena brief menyebut "hanya baris deleted_at IS NULL". Dicatat eksplisit supaya jadi keputusan sadar: konsekuensinya, akun yang di-soft-delete **melepaskan** namanya, sehingga nama yang sama boleh didaftarkan lagi. Berbeda dari `accounts_code_unique` yang menyandera `code` selamanya (TEMUAN A-2). Ketidakkonsistenan ini kemungkinan besar memang diinginkan, tapi belum pernah dinyatakan.

**#5 — Apakah dedup 22 Jul menghapus pasangan lintas-entitas yang sah?**
Tidak bisa saya pastikan (TEMUAN B-2). Kalau ya, ada baris yang perlu dipulihkan dari `accounts_dedup_backup_20260722` **sebelum** index dipasang. Query §Q3c.

**#6 — Kondisi live vs snapshot.**
Seluruh pernyataan soal index, constraint, dan RLS di laporan ini berasal dari `schema_snapshot.sql` hasil `pg_dump` **22 Jul**. Sesudah itu ada SQL manual yang belum terekam — audit PRF kemarin menemukan tiga kolom `prf` yang ditulis kode tapi tak ada di snapshot maupun migrasi. **Anggap bagian EXTENSION & INDEX sebagai hipotesis sampai §Q2b dijalankan.**

**#7 — Angka 1.050 akun aktif sudah kedaluwarsa.**
Itu kondisi tepat setelah dedup 22 Jul. Dua hari sudah lewat, dan tidak ada pencegahan yang terpasang (migrasi baris 59-62: *"NOL PENCEGAHAN… sistem MASIH menerima duplikat baru"*). Jumlah hari ini kemungkinan lebih besar dan grup duplikatnya bisa bertambah. **Jangan pakai 1.050 sebagai premis.**

**#8 — Ada tabel `customers` yang masih punya FK ke `accounts`.**
`customers_prospect_id_fkey` masih hidup di snapshot. Tabel `customers` sudah dipensiunkan (nol referensi di kode live) tapi belum di-drop. Query "hidup/kosong" saya sertakan hitungannya (mengikuti migrasi 22 Jul yang juga menghitungnya), tapi kalau tabel itu ternyata sudah kosong, kolom itu bisa diabaikan.

---

# LAMPIRAN — SQL SIAP JALAN

> Seluruh query di bawah **read-only** (SELECT saja). Nol DDL, nol DML. Jalankan di Supabase SQL Editor.
> Dollar-quote bernama tidak diperlukan karena tak ada fungsi yang dibuat.

## §Q1 — Kolom entitas mana yang dipakai? (jalankan PERTAMA)

Menentukan apakah `company_id` dan `owner_company_id` bisa dianggap satu sumbu.

```sql
SELECT
  count(*)                                                        AS total_aktif,
  count(*) FILTER (WHERE owner_company_id IS NULL)                AS owner_null,
  count(*) FILTER (WHERE owner_company_id IS DISTINCT FROM company_id) AS owner_beda_dari_company,
  count(DISTINCT company_id)                                      AS jml_company_id,
  count(DISTINCT owner_company_id)                                AS jml_owner_company_id
FROM public.accounts
WHERE deleted_at IS NULL;
```

Kalau `owner_null` dan `owner_beda_dari_company` dua-duanya 0, sumbunya satu dan pilihan kolom bebas. Kalau tidak, lihat rinciannya:

```sql
SELECT a.id, a.name, a.account_status,
       c1.code AS company_code, c2.code AS owner_code, a.created_at
FROM public.accounts a
LEFT JOIN public.companies c1 ON c1.id = a.company_id
LEFT JOIN public.companies c2 ON c2.id = a.owner_company_id
WHERE a.deleted_at IS NULL
  AND a.owner_company_id IS DISTINCT FROM a.company_id
ORDER BY a.created_at;
```

## §Q2a — Apakah `pg_trgm` terpasang?

```sql
SELECT extname, extversion, n.nspname AS schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY extname;
```

Kalau `pg_trgm` tidak muncul, §Q3b dan §Q4b (bagian trigram) **tidak akan jalan** — pakai versi non-trigram yang saya sertakan.

Cek fungsinya benar-benar terpanggil (kalau extension ada di schema `extensions`, `search_path` mungkin perlu di-qualify):

```sql
SELECT similarity('ALLIANCE COSMETIC', 'ALLIANC') AS uji_similarity;
```

## §Q2b — Index & constraint LIVE di `accounts`

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'accounts'
ORDER BY indexname;

SELECT conname, contype, pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conrelid = 'public.accounts'::regclass
ORDER BY contype, conname;
```

## §Q3a — Grup duplikat pasca-normalisasi, PER-ENTITAS, dengan status hidup/kosong

Normalisasi Anda dan normalisasi 22 Jul dijalankan berdampingan supaya selisihnya kelihatan. **Ganti `company_id` jadi `owner_company_id` di dua tempat** kalau §Q1 mengarahkan ke sana.

```sql
WITH base AS (
  SELECT
    a.id, a.name, a.account_status, a.is_in_lead_pool, a.created_at,
    a.company_id AS entitas_id,                                    -- ← ganti bila perlu
    upper(trim(regexp_replace(a.name, '\s+', ' ', 'g')))  AS norm_lemah,
    lower(regexp_replace(regexp_replace(a.name,'\y(PT|CV|TBK)\y\.?','','gi'),
                         '[^a-zA-Z0-9]','','g'))          AS norm_kuat
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
),
pakai AS (
  SELECT b.*,
      (SELECT count(*) FROM public.inquiries  x WHERE x.prospect_id=b.id OR x.customer_id=b.id) AS n_inquiry,
      (SELECT count(*) FROM public.quotations x WHERE x.prospect_id=b.id OR x.customer_id=b.id) AS n_quotation,
      (SELECT count(*) FROM public.sales_orders x WHERE x.account_id=b.id)                      AS n_so,
      (SELECT count(*) FROM public.prf        x WHERE x.account_id=b.id)                        AS n_prf,
      (SELECT count(*) FROM public.activities x WHERE x.account_id=b.id)
    + (SELECT count(*) FROM public.sales_calls  x WHERE x.prospect_id=b.id)
    + (SELECT count(*) FROM public.sales_visits x WHERE x.prospect_id=b.id)
    + (SELECT count(*) FROM public.deal_handovers x WHERE x.account_id=b.id)
    + (SELECT count(*) FROM public.top_requests   x WHERE x.account_id=b.id)
    + (SELECT count(*) FROM public.sp_orders    x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.sp_items     x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.sp_btb       x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.delivery_notes x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.picking_lists  x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.ar_ttfs      x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.dc_master    x WHERE x.customer_id=b.id)
    + (SELECT count(*) FROM public.customers    x WHERE x.prospect_id=b.id)
    + (SELECT count(*) FROM public.accounts     x WHERE x.converted_to=b.id)                    AS n_lain
  FROM base b
)
SELECT
  co.code                                    AS entitas,
  p.norm_lemah                               AS nama_ternormalisasi,
  count(*) OVER (PARTITION BY p.entitas_id, p.norm_lemah) AS anggota_grup,
  p.id, p.name AS nama_asli, p.account_status, p.is_in_lead_pool, p.created_at,
  p.n_inquiry, p.n_quotation, p.n_so, p.n_prf, p.n_lain,
  CASE WHEN p.n_inquiry + p.n_quotation + p.n_so + p.n_prf + p.n_lain > 0
       THEN 'HIDUP' ELSE 'kosong' END        AS status_pakai
FROM pakai p
JOIN public.companies co ON co.id = p.entitas_id
WHERE (p.entitas_id, p.norm_lemah) IN (
  SELECT entitas_id, norm_lemah FROM base
  GROUP BY entitas_id, norm_lemah HAVING count(*) > 1
)
ORDER BY co.code, p.norm_lemah, p.created_at;
```

Ringkasan jumlah grup, kedua normalisasi berdampingan:

```sql
WITH base AS (
  SELECT company_id AS entitas_id,                                 -- ← ganti bila perlu
         upper(trim(regexp_replace(name,'\s+',' ','g'))) AS norm_lemah,
         lower(regexp_replace(regexp_replace(name,'\y(PT|CV|TBK)\y\.?','','gi'),
                              '[^a-zA-Z0-9]','','g'))    AS norm_kuat
  FROM public.accounts WHERE deleted_at IS NULL
)
SELECT
  (SELECT count(*) FROM (SELECT 1 FROM base GROUP BY entitas_id, norm_lemah HAVING count(*)>1) t) AS grup_norm_ANDA_per_entitas,
  (SELECT count(*) FROM (SELECT 1 FROM base GROUP BY entitas_id, norm_kuat  HAVING count(*)>1) t) AS grup_norm_KUAT_per_entitas,
  (SELECT count(*) FROM (SELECT 1 FROM base GROUP BY norm_lemah             HAVING count(*)>1) t) AS grup_norm_ANDA_global,
  (SELECT count(*) FROM (SELECT 1 FROM base GROUP BY norm_kuat              HAVING count(*)>1) t) AS grup_norm_KUAT_global;
```

Kolom pertama = **jumlah grup yang akan memblokir pemasangan UNIQUE index**. Kalau 0, index bisa langsung dipasang.

## §Q3b — Kandidat mirip (trigram, tanpa threshold)

Butuh `pg_trgm` (§Q2a). Tidak ada ambang batas — diurut dari paling mirip, keputusan tetap di manusia. Batasi ke pasangan dalam entitas sama.

```sql
SELECT
  co.code AS entitas,
  a.id AS id_a, a.name AS nama_a, a.account_status AS status_a,
  b.id AS id_b, b.name AS nama_b, b.account_status AS status_b,
  round(similarity(
    upper(trim(regexp_replace(a.name,'\s+',' ','g'))),
    upper(trim(regexp_replace(b.name,'\s+',' ','g')))
  )::numeric, 3) AS kemiripan
FROM public.accounts a
JOIN public.accounts b
  ON a.company_id = b.company_id                                   -- ← ganti bila perlu
 AND a.id < b.id
JOIN public.companies co ON co.id = a.company_id
WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
  AND upper(trim(regexp_replace(a.name,'\s+',' ','g')))
   <> upper(trim(regexp_replace(b.name,'\s+',' ','g')))             -- exact sudah ditangani §Q3a
  AND similarity(
        upper(trim(regexp_replace(a.name,'\s+',' ','g'))),
        upper(trim(regexp_replace(b.name,'\s+',' ','g')))
      ) > 0.4                                                       -- ambang PELEBAR, bukan penentu
ORDER BY kemiripan DESC
LIMIT 200;
```

⚠️ `0.4` di situ hanya untuk membatasi ukuran hasil (self-join 1.050 baris = ~550 ribu pasangan). Itu **bukan** ambang keputusan — turunkan kalau mau lihat ekor yang lebih longgar.

Versi tanpa pg_trgm (kalau §Q2a gagal), berbasis prefix 6 huruf — akan menangkap `ALLIANC`/`ALLIANCE`:

```sql
WITH b AS (
  SELECT id, name, account_status, company_id,
         left(regexp_replace(upper(name),'[^A-Z0-9]','','g'), 6) AS kunci
  FROM public.accounts WHERE deleted_at IS NULL
)
SELECT co.code AS entitas, b.kunci, count(*) OVER (PARTITION BY b.company_id, b.kunci) AS anggota,
       b.id, b.name, b.account_status
FROM b JOIN public.companies co ON co.id = b.company_id
WHERE (b.company_id, b.kunci) IN (
  SELECT company_id, kunci FROM b GROUP BY company_id, kunci HAVING count(*) > 1)
ORDER BY co.code, b.kunci, b.name;
```

## §Q3c — Apakah dedup 22 Jul menghapus pasangan lintas-entitas yang sah? (TEMUAN B-2)

```sql
WITH dihapus AS (
  SELECT a.id, a.name, a.company_id, a.owner_company_id, a.account_status
  FROM public.accounts a
  WHERE a.deleted_at = '2026-07-22 09:24:03.904117+00'
)
SELECT
  d.id AS id_dihapus, d.name AS nama_dihapus,
  cd.code AS entitas_dihapus,
  s.id AS id_bertahan, s.name AS nama_bertahan,
  cs.code AS entitas_bertahan
FROM dihapus d
JOIN public.accounts s
  ON s.deleted_at IS NULL
 AND lower(regexp_replace(regexp_replace(s.name,'\y(PT|CV|TBK)\y\.?','','gi'),'[^a-zA-Z0-9]','','g'))
   = lower(regexp_replace(regexp_replace(d.name,'\y(PT|CV|TBK)\y\.?','','gi'),'[^a-zA-Z0-9]','','g'))
JOIN public.companies cd ON cd.id = d.company_id
JOIN public.companies cs ON cs.id = s.company_id
WHERE s.company_id IS DISTINCT FROM d.company_id
ORDER BY d.name;
```

Baris yang keluar = akun yang **dihapus padahal entitasnya berbeda** dari yang dipertahankan. Di bawah aturan per-entitas Anda, baris-baris itu sah dan kandidat dipulihkan. Kalau nol baris, dedup 22 Jul kebetulan tidak merusak apa-apa.

## §Q4 — Kasus ALLIANCE

```sql
WITH kandidat AS (
  SELECT a.*
  FROM public.accounts a
  WHERE regexp_replace(upper(a.name), '[^A-Z0-9]', '', 'g') LIKE '%ALLIANC%'
)
SELECT
  k.id,
  k.name,
  co.code                       AS entitas,
  k.company_id, k.owner_company_id,
  k.account_status,
  k.is_in_lead_pool,
  k.deleted_at,
  k.created_at,
  k.created_by,
  k.assigned_to,
  k.code                        AS customer_code,
  (SELECT count(*) FROM public.inquiries    x WHERE x.prospect_id=k.id OR x.customer_id=k.id) AS n_inquiry,
  (SELECT count(*) FROM public.quotations   x WHERE x.prospect_id=k.id OR x.customer_id=k.id) AS n_quotation,
  (SELECT count(*) FROM public.sales_orders x WHERE x.account_id=k.id)                        AS n_so,
  (SELECT count(*) FROM public.prf          x WHERE x.account_id=k.id)                        AS n_prf,
  (SELECT count(*) FROM public.activities   x WHERE x.account_id=k.id)                        AS n_aktivitas,
  (SELECT count(*) FROM public.sp_items     x WHERE x.customer_id=k.id)                       AS n_sp_items,
  (SELECT count(*) FROM public.ar_ttfs      x WHERE x.customer_id=k.id)                       AS n_ar
FROM kandidat k
LEFT JOIN public.companies co ON co.id = k.company_id
ORDER BY k.deleted_at NULLS FIRST, k.created_at;
```

Sengaja **tidak** memfilter `deleted_at IS NULL` — supaya baris yang sudah kena dedup 22 Jul juga terlihat, dan Anda bisa tahu apakah salah satu ALLIANCE sudah pernah dihapus.

Kalau ingin melihat nomor dokumennya (bukan cuma jumlah), untuk memutuskan mana yang dipertahankan:

```sql
SELECT 'inquiry' AS jenis, i.inquiry_no AS nomor, i.status, i.created_at,
       coalesce(i.prospect_id, i.customer_id) AS account_id
FROM public.inquiries i
WHERE i.deleted_at IS NULL
  AND coalesce(i.prospect_id, i.customer_id) IN (
    SELECT id FROM public.accounts
    WHERE regexp_replace(upper(name),'[^A-Z0-9]','','g') LIKE '%ALLIANC%')
UNION ALL
SELECT 'quotation', q.quotation_no, q.status, q.created_at,
       coalesce(q.prospect_id, q.customer_id)
FROM public.quotations q
WHERE q.deleted_at IS NULL
  AND coalesce(q.prospect_id, q.customer_id) IN (
    SELECT id FROM public.accounts
    WHERE regexp_replace(upper(name),'[^A-Z0-9]','','g') LIKE '%ALLIANC%')
UNION ALL
SELECT 'prf', p.prf_no, p.status, p.created_at, p.account_id
FROM public.prf p
WHERE p.deleted_at IS NULL
  AND p.account_id IN (
    SELECT id FROM public.accounts
    WHERE regexp_replace(upper(name),'[^A-Z0-9]','','g') LIKE '%ALLIANC%')
ORDER BY account_id, jenis, created_at;
```

## §Q5 — Pre-flight sebelum memasang UNIQUE index

Jalankan setelah §Q3a menunjukkan 0 grup. Query ini **mensimulasikan** index tanpa membuatnya.

```sql
-- Harus mengembalikan NOL baris. Kalau ada, index akan GAGAL dibuat.
SELECT company_id,                                                 -- ← ganti bila perlu
       upper(trim(regexp_replace(name,'\s+',' ','g'))) AS norm,
       count(*) AS jml,
       array_agg(id) AS ids,
       array_agg(name) AS nama
FROM public.accounts
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING count(*) > 1;
```

Cek nama kosong / whitespace-only yang akan saling bertabrakan:

```sql
SELECT id, name, company_id, account_status, created_at
FROM public.accounts
WHERE deleted_at IS NULL
  AND (trim(name) = '' OR name IS NULL)
ORDER BY created_at;
```
