# AUDIT ALUR PRF — Dari Entry Point sampai Nomor PRF Final

> **Mode:** AUDIT (read-only). Tidak ada file kode/dokumen yang diubah. File ini satu-satunya yang dibuat.
> **Tanggal audit:** 24 Jul 2026 · Branch `feat/inquiry-merge-goods-name` · HEAD `260e9ae`
> **Tujuan:** pemetaan proses faktual untuk bahan dokumentasi (MI + panduan user). BUKAN audit cari-bug — tapi cabang/ambiguitas yang ditemukan dicatat apa adanya di bagian TEMUAN.
> **Sumber diaudit:**
> - `src/App.jsx` — routing, state, gate menu, render block
> - `src/modules/procurement/PRFFormPage.jsx` (830 baris) — form Buat PRF (create-only)
> - `src/modules/procurement/PRFDetailPage.jsx`, `ProcInquiryForwardingPage.jsx` — sisi baca PRF
> - `src/modules/crm/DealDetailPage.jsx`, `DealPanels.jsx`, `CustomerDetailPage.jsx`, `InquiryListPage.jsx` — entry point
> - `supabase/schema_snapshot.sql` — tabel `prf`, RLS, RPC `increment_document_sequence`, trigger
> - **Atribusi:** seluruh nomor baris diverifikasi langsung dari file per tanggal audit. **NOL tes runtime** — semua pernyataan di bawah adalah pembacaan kode.

> ⚠️ **Koreksi istilah sejak awal.** Brief menyebut PRF = *"Purchase Request Form"*. Di kode, PRF **konsisten** berarti **"Price Request Form"** — permintaan harga dari sales ke procurement. Lihat `PRFFormPage.jsx:2` (komentar file), `:486` (subtitle UI yang dilihat user: *"Price Request Form"*), `App.jsx:3449` (komentar render block). **Tidak ada** entitas "Purchase Request" di codebase — Purchase Order / Procurement Request adalah menu terpisah yang masih `soon` (`App.jsx:677`, `:686`). Laporan ini memetakan **Price Request Form**.

---

## RINGKASAN ALUR

**Aktor: sales (atau `gm_bd`).** PRF **hanya boleh lahir dari sebuah inquiry** — keputusan desain eksplisit 19 Jul 2026 (`PRFFormPage.jsx:210`, dicatat di `CLAUDE.md`); picker Customer/Prospect sudah dicabut dari form, dan `inquiry_id` diwajibkan untuk DRAFT **maupun** SUBMIT. Alurnya: sales membuka sebuah **inquiry** yang sudah ada — lewat menu **CRM → Inquiry** (klik baris → halaman *Detail Inquiry*) **atau** lewat **CRM → Customer/Account → Detail Account → tab "Riwayat"** — lalu menekan tombol berlabel **"Cetak PRF"**. Tombol itu membuka halaman **"Buat PRF Baru"** yang sebagian field-nya sudah terisi otomatis dari inquiry sumber. Sales melengkapi Direction, Commodity, Service Type, Incoterm, dan (kalau Service Type dipilih) blok "Detail Layanan" per moda, lalu menekan **"Submit PRF"** (atau **"Simpan Draft"**). **Pada detik penyimpanan itulah nomor PRF di-generate** oleh RPC `increment_document_sequence` dan langsung ditulis ke baris `prf` — nomornya **tidak pernah** terlihat di layar form sebelum disimpan (yang tampil hanya pratinjau ber-akhiran `—`), dan sesudah disimpan form **langsung tertutup**; nomor final hanya muncul di **toast 2,8 detik** lalu di daftar-daftar PRF. Sesudah SUBMIT, trigger DB menaikkan status inquiry sumber `OPEN → IN_REVIEW`, dan PRF tersebut muncul di inbox procurement (**Procurement → Inquiry / RFQ → Direct → Forwarding (MSI)**) untuk dijawab harganya.

**Ringkas satu baris:** `Inquiry (sudah ada) → tombol "Cetak PRF" → form "Buat PRF Baru" → "Submit PRF" → nomor PRF lahir saat simpan → inquiry jadi IN_REVIEW → inbox procurement.`

---

## PETA ENTRY POINT

Ada **DUA jalur klik yang disengaja**, plus **satu jalur latent** yang bisa dicapai tanpa niat. Ketiganya bermuara ke komponen yang **sama**: `PRFFormPage`.

| # | Jalur | Menu / Route | Halaman perantara | Tombol pemicu | Prefill? |
|---|---|---|---|---|---|
| **A** | Detail Inquiry | Sidebar **CRM → Inquiry** (`activeMenu='crm-inquiry'`) | `InquiryListPage` → klik baris → `DealDetailPage` | **"Cetak PRF"** (kartu *Daftar PRF*) | ✅ ya |
| **B** | Detail Account | Sidebar **CRM → Customer** (`crm-customers`) *atau* **CRM → Account** tab Pipeline/Prospects | `CustomerListPage`/`PipelineKanbanPage`/`ProspectListPage` → klik baris → `CustomerDetailPage` → tab **"Riwayat"** | **"Cetak PRF"** (per baris inquiry) | ✅ ya |
| **C** | *(latent)* restore `localStorage` | — (**tidak ada leaf sidebar untuk `prf`**) | — | — (form langsung terbuka) | ❌ **tidak** |

**Catatan penting tentang jalur C:** `activeMenu` dipersist ke `localStorage['nexus_last_menu']` (`App.jsx:2017`) dan direstorasi saat mount (`App.jsx:1675`). Id `'prf'` **ada** di `ERP_MENU_GROUPS` sebagai gate registry (`App.jsx:668`) tapi **TIDAK ADA** di `NEXUS_NAV` (pohon sidebar) — jadi tak ada leaf yang bisa diklik. Konsekuensinya: kalau user terakhir berada di `activeMenu='prf'` lalu me-*refresh* browser, redirect-guard (`App.jsx:2064`) **meloloskannya** (karena `isMenuAccessible('prf', …)` → `item.role.includes(role)` → true untuk sales), dan `prfPrefillInquiryId` sudah hilang (state React) → user mendarat di **form PRF KOSONG tanpa prefill**. Form itu tetap fungsional (dropdown Inquiry bisa dipilih manual), jadi ini bukan halaman rusak — tapi ini **jalur masuk ketiga yang tak terdokumentasi**. Lihat TEMUAN #2.

### Detail file:line per entry point

**Jalur A — Detail Inquiry**
| Elemen | Lokasi |
|---|---|
| Leaf sidebar "Inquiry" | `src/App.jsx:480` (`CRM_MENU_ITEMS`) |
| Render list | `src/App.jsx:3178-3188` → `InquiryListPage` |
| Klik baris inquiry | `src/modules/crm/InquiryListPage.jsx:408-410` (`<tr onClick={() => onSelectInquiry(inq)}>` — **baris tabel, bukan tombol berlabel**) |
| Handler → Detail Inquiry | `src/App.jsx:3183` → `setCrmDealInquiry(inq)` |
| Render Detail Inquiry | `src/App.jsx:3198-3212` → `DealDetailPage` |
| Kartu "Daftar PRF" | `src/modules/crm/DealDetailPage.jsx:483` → `<PrfListCard … canCreate={['sales','gm_bd'].includes(erpRole)} onCreate={onCreatePRF} />` |
| Tombol **"Cetak PRF"** | `src/modules/crm/DealPanels.jsx:434-443` |
| Handler navigasi | `src/App.jsx:3208` → `setPrfPrefillInquiryId(crmDealInquiry.id); setCrmDealInquiry(null); setActiveMenu('prf')` |
| Render form | `src/App.jsx:3450-3458` (di-gate `canRenderPage('prf')`) |

**Jalur B — Detail Account, tab Riwayat**
| Elemen | Lokasi |
|---|---|
| Leaf sidebar "Customer" | `src/App.jsx:487` · tab Account (Pipeline/Prospects) `src/App.jsx:507-512` |
| Navigasi → Detail Account | `src/App.jsx:1874-1889` (`navigateToCustomerDetail`) — dipanggil dari `CustomerListPage` (`:3337`), Pipeline (`:3260`), Prospects (`:3270`) |
| Render Detail Account | `src/App.jsx:3343-3356` → `CustomerDetailPage` |
| Tab **"Riwayat"** | `src/modules/crm/CustomerDetailPage.jsx:994` |
| Baris inquiry (expandable) | `src/modules/crm/CustomerDetailPage.jsx:449` (`InquiryHistoryRow`) |
| Tombol **"Cetak PRF"** | `src/modules/crm/CustomerDetailPage.jsx:478-483` |
| Gate tombol | `src/modules/crm/CustomerDetailPage.jsx:607` (`canCreatePRF`) + `:1155` (prop hanya dikirim bila true) |
| Handler navigasi | `src/App.jsx:3353` → `setCustomerDetailTab('riwayat'); setCustomerPrfInquiryId(inq.id)` — **`activeMenu` TETAP `'customer-detail'`** |
| Render form | `src/App.jsx:3392-3402` (**tanpa** `canRenderPage`) |

**Jalur C — latent (localStorage)**
| Elemen | Lokasi |
|---|---|
| Persist `activeMenu` | `src/App.jsx:2016-2018` |
| Restore saat mount | `src/App.jsx:1675-1677` |
| Redirect-guard meloloskan | `src/App.jsx:2064` → `isMenuAccessible` (`:1387`) → `canSeeMenuItem` (`:1255`) → `item.role.includes(role)` |
| Gate registry `prf` | `src/App.jsx:668` |
| **Tidak ada** di `NEXUS_NAV` | dikonfirmasi: satu-satunya definisi menu `'prf'` di `App.jsx` adalah baris 668 |

---

## TABEL LANGKAH

Jalur **A** (Detail Inquiry) sebagai alur utama; perbedaan jalur **B** dicatat di kolom terakhir & catatan di bawah tabel.

| No | Aksi user | Label tombol persis | File:line | Yang terjadi di balik layar | Data masuk | Data keluar |
|---|---|---|---|---|---|---|
| 1 | Buka menu Inquiry di sidebar | **"Inquiry"** (leaf sidebar, ikon FileText) | `App.jsx:480` (definisi) · `App.jsx:3178` (render) | `setActiveMenu('crm-inquiry')` → render `InquiryListPage`; fetch `inquiries` (RLS-scoped, paginated) | — | daftar inquiry (`inquiry_no`, status, service, umur, dll) |
| 2 | Klik **baris** inquiry yang dituju | *(tidak ada label — seluruh baris `<tr>` clickable)* | `InquiryListPage.jsx:408-410` → `App.jsx:3183` | `setCrmDealInquiry(inq)` → render `DealDetailPage` | objek row inquiry | halaman *Detail Inquiry* |
| 3 | *(otomatis)* halaman Detail Inquiry memuat data | — | `DealDetailPage.jsx:165-200` | Query paralel: `inquiries` (by id) · `accounts` (prospect/customer) · `quotations` (by `inquiry_id`) · **`prf` (by `inquiry_id`, `select id, prf_no, service_type, status, created_at`, `:176-181`)** · `activities` · `profiles` | `inquiry.id` | kartu *Daftar PRF* terisi PRF yang sudah ada untuk inquiry ini |
| 4 | Tekan tombol di kartu **Daftar PRF** | **"Cetak PRF"** (tombol oranye, ikon FileText) | `DealPanels.jsx:434-443` · dirender oleh `DealDetailPage.jsx:483` | Tombol **hanya dirender** bila `['sales','gm_bd'].includes(erpRole)`; `onClick` → `onCreate()` | — | memanggil handler App |
| 5 | *(otomatis)* navigasi ke form PRF | — | `App.jsx:3208` | `setPrfPrefillInquiryId(inquiry.id)` → `setCrmDealInquiry(null)` → `setActiveMenu('prf')`; render digate `canRenderPage('prf')` (`:3450`), gagal → `AccessDeniedPage` | `inquiry.id` | halaman **"Buat PRF Baru"** |
| 6 | *(otomatis)* form memuat opsi dropdown | — | `PRFFormPage.jsx:207-221` | 3 query company-scoped: `inquiries` (+embed `is_in_lead_pool` dua sisi FK, **buang** yang parkir Lead Pool — *JARING 1*) · `currencies` · `companies.code` | `profile.company_id` | isi dropdown Inquiry, Currency, dan `companyCode` untuk pratinjau nomor |
| 7 | *(otomatis)* prefill dari inquiry sumber | — | `PRFFormPage.jsx:227-254` + helper `applyInquiryData` `:104-123` | Query `inquiries` **by id**; kalau akun inquiry parkir Lead Pool → **batal set `inquiry_id`** + pesan error (*JARING 2*, `:241-244`). Kalau lolos: set identitas (`inquiry_id`, `account_id`, `customer_source='inquiry'`) tanpa syarat + 10 field data *fill-empty-only* | `prefillInquiryId` | form terisi sebagian (lihat **DATA PREFILL**) |
| 8 | Isi field wajib yang tak ter-prefill | *(input/dropdown, bukan tombol)* | `PRFFormPage.jsx:554-695` | State lokal `form`. Cabang: `direction='domestic'` → matikan Service Type "Custom Only" + add-on customs (`:284-294`); `commodity='dg'` → munculkan MSDS/UN/IMO (`:587-612`) | ketikan user | Direction, Commodity, HS Code, Service Type, Incoterm, Pickup/Delivery, Add-On, Cargo Ready Date |
| 9 | *(kondisional)* isi "Detail Layanan" | *(section 03 muncul otomatis begitu Service Type dipilih)* | `PRFFormPage.jsx:701-810` | Pohon keputusan: Sea→FCL(container+qty)/LCL(GW/Dim/Vol/Koli) · Air(GW/Dim/Vol/Koli) · Inland(fleet 25 opsi + alamat) · Custom(tipe dok **derived** PIB/PEB) · Project(freight type + qty). Ganti Service Type → **reset seluruh state child** (`CHILD_RESET` `:262-269`) | pilihan moda | field child per moda |
| 10a | **Jalur simpan-final** | **"Submit PRF"** (tombol oranye, ikon Send) | `PRFFormPage.jsx:175` → `handleSave('SUBMITTED')` `:376` | Guard `inquiry_id` (`:378`) → `validate()` **penuh** (`:320-363`) → *JARING 3* cek ulang Lead Pool ke DB (`:389-397`) → **`generatePrfNo()`** (`:398`) → `INSERT INTO prf` (`:461`) | seluruh state `form` | 1 baris `prf` status `SUBMITTED` + `submitted_at` |
| 10b | *(alternatif)* simpan setengah jadi | **"Simpan Draft"** (tombol ghost, ikon Save) | `PRFFormPage.jsx:174` → `handleSave('DRAFT')` | **Sama persis** dengan 10a **kecuali `validate()` dilewati** (`:383` — validasi penuh hanya jalan saat `SUBMITTED`). Hanya `inquiry_id` yang wajib | state `form` seadanya | 1 baris `prf` status `DRAFT`, `submitted_at=null`. **Nomor PRF tetap terbit** |
| 10c | *(alternatif)* batal | **"Batal"** (tombol ghost, ikon ChevronLeft) | `PRFFormPage.jsx:173` → `onBack()` | Jalur A: `setActiveMenu('home')` (`App.jsx:3453`). Jalur B: `setCustomerPrfInquiryId(null)` (`App.jsx:3397`) | — | **nol tulis DB**, nomor tidak terbakar |
| 11 | *(otomatis)* nomor PRF di-generate | — | `PRFFormPage.jsx:365-374` | `supabase.rpc('increment_document_sequence', { p_company_id, p_document_type:'PRF', p_department_code:'PROC', p_year, p_month })` → string dirakit di **frontend** | company_id, tahun, bulan | `PRF/{CODE}/{YYYY}/{ROMAWI}/{NNN}` |
| 12 | *(otomatis)* insert ke DB | — | `PRFFormPage.jsx:405-462` | `supabase.from('prf').insert(payload)` — ±50 kolom; field child di-`null`-kan bila section-nya tak visible (safety net per-visibilitas) | payload | baris `prf` baru |
| 13 | *(otomatis, DB)* status inquiry naik | — | `schema_snapshot.sql:7822` (trigger) + `:1258-1274` (fungsi) | `trg_inquiry_review` `AFTER INSERT OR UPDATE OF status ON prf` → `set_inquiry_review_on_prf_submit()`: bila `status='SUBMITTED'` **dan** `inquiry_id` ada → `UPDATE inquiries SET status='IN_REVIEW' WHERE status='OPEN'` | baris `prf` baru | `inquiries.status` `OPEN → IN_REVIEW`. **DRAFT tidak memicu ini** |
| 14 | *(otomatis)* konfirmasi ke user | *(toast, bukan tombol)* | `PRFFormPage.jsx:463` | `showToast('PRF {prf_no} berhasil dikirim')` — atau `'Draft PRF {prf_no} tersimpan'`. Toast hidup **2,8 detik** (`App.jsx:2103`) | `prf_no` | **satu-satunya tempat nomor final ditampilkan langsung setelah simpan** |
| 15 | *(otomatis)* form ditutup | — | `PRFFormPage.jsx:464` → `onBack()` | Jalur A → `activeMenu='home'` (**Command Center**, bukan balik ke inquiry). Jalur B → clear state → `CustomerDetailPage` remount di tab **Riwayat** + re-fetch | — | user keluar dari form |
| 16 | *(baca)* lihat nomor PRF lagi | *(klik baris / tab, tanpa tombol khusus)* | 3 permukaan — lihat di bawah | — | — | `prf_no` tampil di daftar |
| 17 | *(procurement)* jawab harga | **"Forwarding (MSI)"** → klik baris → panel *Jawaban Harga* | `App.jsx:3461-3479` · `ProcInquiryForwardingPage.jsx:42` · `PRFDetailPage.jsx` | Procurement membuka PRF `SUBMITTED`, mengisi kartu vendor + award → RPC `save_prf_pricing` | `prf.id` | `prf.suggested_rate` dll + `prf_cost_items` |

**Perbedaan jalur B (Detail Account):**
- Langkah 1–2 diganti: sidebar **"Customer"** (atau tab **Pipeline**/**Prospects**) → klik baris akun → *Detail Account* → klik tab **"Riwayat"** (`CustomerDetailPage.jsx:994`) → tombol **"Cetak PRF"** ada di **header tiap baris inquiry** (`:478-483`) — **tidak perlu meng-*expand* baris**.
- Langkah 5 diganti: `activeMenu` **tetap** `'customer-detail'`; hanya `customerPrfInquiryId` yang diset (`App.jsx:3353`), dan render form **tidak** melewati `canRenderPage` (`App.jsx:3392`) — lihat TEMUAN #4.
- Langkah 15: `onBack` mengembalikan user ke *Detail Account* tab Riwayat (bukan ke Home) — jalur ini lebih rapi untuk melanjutkan kerja.

**Tiga permukaan baca `prf_no` (langkah 16):**
| Permukaan | Untuk siapa | File:line |
|---|---|---|
| Kartu **"Daftar PRF"** di *Detail Inquiry* | sales (PRF miliknya) | `DealDetailPage.jsx:176-181` (fetch) · `DealPanels.jsx:452-459` (kolom `PRF No`) |
| Tab **"Dokumen"** di *Detail Account* | sales | `CustomerDetailPage.jsx:790-797` (fetch, `or(account_id.eq…, inquiry_id.in…)`) · `:995` (tab) |
| List **Forwarding (MSI)** | procurement / manager+ / super | `ProcInquiryForwardingPage.jsx:42-43` (fetch) · `:109` (kolom `prf_no`, mono navy) |
| Header **PRF Detail** | procurement (+pembaca RLS) | `PRFDetailPage.jsx:54` (`PRF_SELECT` memuat `prf_no`) |

---

## MEKANISME NOMOR PRF

### Format

```
PRF/{ENTITY_CODE}/{YYYY}/{ROMAWI_BULAN}/{SEQ 3-digit}
```

Contoh: `PRF/MSI/2026/VII/001`

Dirakit di **frontend**, bukan di DB — `PRFFormPage.jsx:373`:
```js
return `PRF/${code || 'MSI'}/${year}/${toRoman(month)}/${String(data).padStart(3,'0')}`;
```

| Segmen | Sumber | Catatan |
|---|---|---|
| `PRF` | literal | prefix dokumen |
| `{ENTITY_CODE}` | `companies.code` di-fetch by `profile.company_id` (`PRFFormPage.jsx:219-220`) | **fallback `'MSI'`** kalau fetch gagal/kosong — lihat TEMUAN #6 |
| `{YYYY}` | `new Date().getFullYear()` (`:367`) | jam **klien**, bukan server |
| `{ROMAWI_BULAN}` | `toRoman(new Date().getMonth()+1)` via array `ROMAN` (`:91-92`) | `VII` = Juli |
| `{SEQ}` | **return value RPC**, di-`padStart(3,'0')` | 3 digit; ≥1000 akan meluber jadi 4 digit tanpa error |

### Dari mana angkanya

RPC **`increment_document_sequence`** (`schema_snapshot.sql:801-834`), `SECURITY DEFINER`, `search_path=public`:

```sql
UPDATE document_sequences SET last_sequence = last_sequence + 1
WHERE company_id=… AND document_type=… AND department_code=… AND year=… AND month=…
RETURNING last_sequence INTO v_new_seq;
IF NOT FOUND THEN
  INSERT INTO document_sequences (…, last_sequence) VALUES (…, 1)
  ON CONFLICT (company_id, document_type, department_code, year, month)
  DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
  RETURNING last_sequence INTO v_new_seq;
END IF;
```

Parameter yang dikirim PRF (`PRFFormPage.jsx:369-371`):

| Param | Nilai |
|---|---|
| `p_company_id` | `profile.company_id` |
| `p_document_type` | `'PRF'` |
| `p_department_code` | `'PROC'` |
| `p_year` | tahun berjalan |
| `p_month` | **bulan berjalan (1–12)** |

Karena `p_month` diisi (bukan `0` seperti MOM/Picking/SJ), kunci counternya per-bulan → **sequence PRF reset tiap bulan, per entitas**. Tabel counter: `document_sequences` (`schema_snapshot.sql:3216-3226`), unique key `(company_id, document_type, department_code, year, month)`.

**Bukan `max()+1`, bukan sequence Postgres, bukan trigger.** Increment atomik lewat `UPDATE … RETURNING` di dalam satu RPC — aman terhadap race condition antar-user.

### Kapan nomor terkunci

**Pada saat SIMPAN — baik "Submit PRF" MAUPUN "Simpan Draft".** Urutan persis di `handleSave` (`PRFFormPage.jsx:376-470`):

```
1. guard  inquiry_id ada?                    (:378)   ← gagal: return, nomor belum disentuh
2. validate() penuh — HANYA bila SUBMITTED   (:383)   ← gagal: return, nomor belum disentuh
3. setSaving(true)                           (:384)
4. JARING 3 — cek Lead Pool ke DB            (:389)   ← gagal: return, nomor belum disentuh
5. generatePrfNo()  ← ★ NOMOR LAHIR DI SINI  (:398)
6. INSERT INTO prf                           (:461)
7. toast + onBack()                          (:463-464)
```

Penempatan langkah 4 **sebelum** langkah 5 disengaja dan berkomentar eksplisit (`:388`): *"Sengaja SEBELUM generatePrfNo supaya penolakan tidak menghanguskan nomor PRF (TD-48)."*

**Konsekuensi yang perlu masuk MI:**
- **Menekan "Simpan Draft" sudah membakar satu nomor.** Draft dan Submit sama-sama menerbitkan nomor definitif.
- **Nomor tidak terbit saat "cetak"** — meskipun tombolnya berlabel "Cetak PRF", tak ada proses cetak di alur ini sama sekali (lihat TEMUAN #1).
- **Nomor bisa hangus (gap).** Kalau `INSERT` di langkah 6 gagal (misalnya RLS menolak — lihat ROLE GATE), counter sudah terlanjur naik dan nomor itu tidak terpakai selamanya. Tidak ada mekanisme kembalikan/reuse.

### Di elemen UI mana nomor final muncul

| Momen | Yang tampil | Lokasi |
|---|---|---|
| **Sebelum** simpan — badge kanan-atas header | `PRF/MSI/2026/VII/—` — **pratinjau, urutannya literal `—`** | `PRFFormPage.jsx:474` (`badgePreview`) · `:488` (badge) |
| **Sebelum** simpan — strip info Section 01, kolom "No. PRF" | pratinjau **yang sama** (`—`) | `PRFFormPage.jsx:505` |
| **Sesudah** simpan | toast: *"PRF PRF/MSI/2026/VII/001 berhasil dikirim"* — **hilang setelah 2,8 detik**, form langsung tertutup | `PRFFormPage.jsx:463` · durasi `App.jsx:2103` |
| Setelahnya | kolom **PRF No** di kartu *Daftar PRF* (Detail Inquiry) · tab **Dokumen** (Detail Account) · list **Forwarding (MSI)** · header **PRF Detail** | lihat tabel "tiga permukaan baca" di atas |

**Bisa di-copy dari mana?** Tidak ada tombol *copy* di mana pun. Nomor di daftar adalah teks biasa (mono, navy) → **user harus blok-teks manual** (`ProcInquiryForwardingPage.jsx:109`, `DealPanels.jsx` kolom PRF No). Di toast, teks hidup terlalu singkat untuk diblok dengan nyaman. Lihat TEMUAN #3.

---

## ANTI-DUPLIKAT

**Tidak ada pengecekan "PRF sudah pernah dibuat untuk inquiry ini".** Ini perlu dinyatakan tegas karena mudah disalah-asumsikan dari nama tombolnya.

### Yang ADA

| Mekanisme | Cakupan | Lokasi | Perilaku saat kena |
|---|---|---|---|
| **`UNIQUE (company_id, prf_no)`** | tabrakan **nomor**, bukan duplikat bisnis | `schema_snapshot.sql:6069-6070` (`prf_no_unique`) | `INSERT` gagal → `throw error` → toast `"Gagal menyimpan: …"` (`PRFFormPage.jsx:466`) dengan pesan Postgres mentah. Praktis tak akan terjadi karena counter atomik |
| **Guard Lead Pool 3 lapis** | mencegah PRF dibuat dari akun yang sedang parkir Lead Pool — **bukan** anti-duplikat | *JARING 1* filter dropdown `:215-216` · *JARING 2* saat prefill `:241-244` · *JARING 3* saat simpan `:389-397` | JARING 2/3 → pesan di bawah field Inquiry + (JARING 3) toast error, `return` sebelum nomor lahir |
| **Guard `inquiry_id` wajib** | mencegah PRF yatim (tanpa inquiry) | `PRFFormPage.jsx:378-382` (DRAFT **dan** SUBMIT) | pesan `"Pilih inquiry"` + toast; tidak ada constraint DB yang setara (`prf.inquiry_id` **nullable**) |

### Yang TIDAK ada

- **Nol query** yang menanyakan *"apakah `prf` dengan `inquiry_id` = X sudah ada?"* sebelum insert. Diverifikasi: `PRFFormPage.jsx` hanya menyentuh `prf` sekali, yaitu `INSERT` di `:461`.
- **Nol constraint** unik pada `(company_id, inquiry_id)` di tabel `prf` — constraint yang ada hanya `prf_pkey` dan `prf_no_unique` (`schema_snapshot.sql:6066-6078`).
- **Nol peringatan UI.** Tombol **"Cetak PRF"** di `DealPanels.jsx:434-443` selalu dirender selama role cocok — **tidak** disabled dan **tidak** berubah label meskipun kartu *Daftar PRF* di sebelahnya sudah menampilkan 3 PRF untuk inquiry yang sama.

**Artinya: satu inquiry boleh punya banyak PRF, dan itu tampaknya disengaja** — polanya identik dengan relasi PRF→Quotation, di mana `PRFDetailPage` secara eksplisit mendokumentasikan *"satu PRF boleh banyak quotation — keputusan desain, bukan TD"* (`CLAUDE.md`, entri 20 Jul). Tapi untuk PRF←Inquiry **keputusan itu tidak pernah ditulis di mana pun** — hanya tersirat dari ketiadaan cek. Lihat TEMUAN #5.

**Perlindungan terhadap klik ganda:** ada, tapi lemah. `setSaving(true)` (`:384`) men-*disable* ketiga tombol (`:174-175`) selama proses berjalan. Kalau user menekan "Simpan Draft" lalu form tertutup dan ia mengulang alurnya, **PRF kedua terbit tanpa halangan apa pun**.

---

## ROLE GATE

Gate berlapis empat, dan **lapisan-lapisannya tidak setara** — himpunan role yang diizinkan berbeda-beda antar lapisan.

### Lapis 1 — gate registry menu (`prf`)

`src/App.jsx:668`:
```js
{ id: 'prf', label: 'PRF', icon: FileText,
  role: ['sales','gm_bd','procurement','manager','ceo','admin','super_admin'] }
```
Dievaluasi oleh `canSeeMenuItem` (`App.jsx:1255-1271`) dengan urutan presedensi: `public` → `MENU_KEY_MAP` → `module` → `role` → default-deny. **`MENU_KEY_MAP` TIDAK punya entri `'prf'`** (diverifikasi: blok `MENU_KEY_MAP` hanya memuat `procRequest`/`purchaseOrder`/`vendors` untuk Procurement) → jatuh ke cabang `item.role.includes(role)`.

⚠️ `role` di sini = **`erpRole` PRIMER** (`App.jsx:1715` ← `AuthContext` `pickPrimaryErpRole`), bukan seluruh role user. Ini permukaan **TD-105** yang sudah terdaftar.

### Lapis 2 — route guard render

| Jalur | Guard | Lokasi |
|---|---|---|
| **A** (`activeMenu='prf'`) | `canRenderPage('prf')`, gagal → `<AccessDeniedPage>` | `App.jsx:3450-3458` |
| **B** (`activeMenu='customer-detail'`) | **TIDAK ADA guard PRF** — blok merender `PRFFormPage` begitu `customerPrfInquiryId` terisi | `App.jsx:3392-3402` |

### Lapis 3 — visibilitas tombol "Cetak PRF"

**Keduanya identik dan lebih ketat dari lapis 1:**

| Entry | Ekspresi | Lokasi |
|---|---|---|
| Detail Inquiry | `canCreate={['sales','gm_bd'].includes(erpRole)}` | `DealDetailPage.jsx:483` |
| Detail Account | `canCreatePRF = ['sales','gm_bd'].includes(erpRole)`; prop hanya dikirim bila true | `CustomerDetailPage.jsx:607` · `:1155` |

Kalau false, tombolnya **tidak dirender sama sekali** (bukan disabled).

### Lapis 4 — RLS (penegak sebenarnya)

`schema_snapshot.sql:12121-12145`:

| Policy | Aksi | Kondisi |
|---|---|---|
| `prf_insert` | INSERT | `is_super_admin() OR (company_id = get_user_company_id() AND created_by = auth.uid() AND (has_role('sales') OR has_role('gm_bd')))` |
| `prf_select` | SELECT | `is_super_admin() OR (company match AND (created_by = auth.uid() OR has_role('procurement') OR is_manager_or_above()))` |
| `prf_update_draft` | UPDATE | pembuat sendiri **dan** `status='DRAFT'` |
| `prf_update_status` | UPDATE | `has_role('procurement')` **dan** `status='SUBMITTED'` (jalur jawaban harga) |

`prf_insert` memakai **`has_role()`** yang menguji **semua** role user (bukan hanya primer) — berbeda dari lapis 1 & 3 yang memakai `erpRole` primer.

### Kesimpulan: siapa yang benar-benar bisa menyelesaikan alur

| Role | Lihat tombol "Cetak PRF"? | Bisa buka form? | INSERT diterima RLS? | **Bisa menyelesaikan?** |
|---|---|---|---|---|
| `sales` | ✅ | ✅ | ✅ | ✅ **YA** |
| `gm_bd` | ✅ | ✅ | ✅ | ✅ **YA** |
| `super_admin` | ❌ (bukan sales/gm_bd) | ✅ (lapis 1 lolos) | ✅ (bypass) | ⚠️ hanya lewat jalur C |
| `procurement` | ❌ | ✅ jalur C (lapis 1 lolos) | ❌ | ❌ — form terbuka, simpan **ditolak RLS** |
| `manager` / `ceo` / `admin` | ❌ | ✅ jalur C | ❌ | ❌ — sama seperti procurement |
| lainnya (`operations`, `finance`, `hrga`, `it`, `viewer`, …) | ❌ | ❌ (`AccessDeniedPage`) | ❌ | ❌ |

**Divergensi yang perlu diketahui:** lapis 1 (7 role) **jauh lebih longgar** dari lapis 3 & 4 (2 role + super). Bagi `procurement`/`manager`/`ceo`/`admin` yang mendarat di jalur C, form terbuka penuh dan bisa diisi, tapi **penolakan baru muncul saat menekan Submit** — sebagai toast `"Gagal menyimpan: new row violates row-level security policy…"`. **Nomor PRF sudah terlanjur terbit dan hangus** pada titik itu (langkah 5 mendahului langkah 6). Detail di TEMUAN #2.

---

## FIELD REFERENSI ODOO

### **TIDAK ADA.**

Tidak ditemukan **satu pun** field/kolom/tempat untuk mencatat nomor referensi eksternal (Odoo atau sistem lain) di seluruh entitas PRF:

| Yang diperiksa | Hasil |
|---|---|
| `CREATE TABLE public.prf` (`schema_snapshot.sql:4107-4166`) — 60 kolom | **nol** kolom `external_*` / `odoo_*` / `reference_no` / `ref_*` |
| `CREATE TABLE public.prf_cost_items` (`:4177-4193`) — 15 kolom | **nol** |
| Form `PRFFormPage.jsx` — seluruh 830 baris | **nol** input/state bernuansa referensi eksternal (state `form` `:184-199` sudah diperiksa penuh) |
| `PRFDetailPage.jsx` — `PRF_SELECT` (`:54`) + panel jawaban harga | **nol** |
| `ProcInquiryForwardingPage.jsx` — kolom list | **nol** |
| Grep `odoo|external_ref|external_no|reference_no|ref_external` di seluruh `src/` + snapshot | tak ada hit yang menyentuh PRF |

### Yang ADA di tempat lain (jangan tertukar)

| Lokasi | Kolom | Isi | Status |
|---|---|---|---|
| `accounts` | `is_odoo_customer boolean DEFAULT false NOT NULL` (`schema_snapshot.sql:1714`) | **penanda boolean** *"customer ini sudah ada di Odoo"* — **bukan** nomor referensi | **hidup** — checkbox *"Customer Existing (dari Odoo)"* (`CustomerListPage.jsx:483-486`) + badge *"Existing · Odoo"* di Detail Account (`CustomerDetailPage.jsx:1111-1112`) |
| `sales_orders` | `external_ref text` (`schema_snapshot.sql:4638`) | **Nomor referensi Odoo yang sebenarnya**. Komentar kolom (`:4648`): *"Nomor referensi SO ini di sistem operasional (Odoo). Nullable, belum dipakai UI mana pun — kunci sambungan disiapkan lebih dulu supaya rekonsiliasi tidak perlu mencari padanan manual nanti."* | **dorman** — kolom ada, **nol UI** yang membacanya/menulisnya |
| `sales_orders` | `booking_no text` (`:4678`) | nomor booking | dorman |
| `stock_ledger` dsb. | `reference_no varchar(50)` (`:4960`) | referensi **internal** (nomor SP/picking/GRN), **tak ada hubungan dengan Odoo** | hidup |

**Implikasi untuk MI:** pola `external_ref` sudah **ditetapkan preseden**-nya di `sales_orders` (migrasi `20260722000000_sales_orders_external_refs.sql`) sebagai cara mencatat nomor Odoo. Kalau PRF nanti perlu jejak Odoo, pola itulah yang sudah ada — tapi **hari ini PRF sama sekali tidak punya slotnya**, di DB maupun di UI.

---

## TEMUAN & AMBIGUITAS

### 1. Label **"Cetak PRF"** tidak mencetak apa pun — dan bukan tombol "buat"

**Fakta.** Tombol yang jadi satu-satunya pemicu alur ini berlabel **"Cetak PRF"** (`DealPanels.jsx:442`, `CustomerDetailPage.jsx:481`). Yang terjadi saat diklik adalah **membuka form entri data kosong-sebagian**. Tidak ada PDF, tidak ada `window.print()`, tidak ada dialog cetak — di mana pun dalam alur.

**Diverifikasi:** direktori `src/modules/**` memuat 6 komponen PDF (`InquiryPDF`, `QuotationPDF`, `RateSheetPDF`, `ActivityReportPDF`, `VisitHistoryPDF`, `DeliveryNotePDF`, `PickingListPDF`) — **tidak ada `PRFPDF`**; grep `prf.*pdf` (case-insensitive) di `src/` → **nol hit**.

**Kenapa ini penting untuk MI/panduan user:** sales yang membaca "Cetak PRF" akan mengira ia sedang mencetak dokumen yang sudah ada, padahal ia sedang **menerbitkan dokumen baru berikut nomornya**. Bandingkan dengan halaman-halaman lain di sistem yang punya PDF sungguhan (Inquiry, Quotation) — di sana kata "cetak/download" memang berarti cetak. **Kandidat rename atau minimal penjelasan eksplisit di panduan.**

### 2. Jalur masuk ketiga (localStorage) + nomor hangus untuk role yang salah

**Fakta A — jalur latent.** `activeMenu` dipersist (`App.jsx:2017`) dan direstorasi (`:1675`). `'prf'` **tidak ada** di `NEXUS_NAV` (tak ada leaf sidebar) tapi **ada** di `ERP_MENU_GROUPS` (`:668`), sehingga redirect-guard (`:2064`) **meloloskannya**. Refresh browser saat berada di form PRF → mendarat lagi di **form PRF kosong tanpa prefill** (state `prfPrefillInquiryId` hilang). Form tetap fungsional karena dropdown Inquiry bisa dipilih manual.

**Fakta B — divergensi gate.** Lapis 1 mengizinkan 7 role; RLS `prf_insert` hanya `sales`/`gm_bd`/super. Untuk `procurement`/`manager`/`ceo`/`admin` yang mendarat lewat jalur ini: form terbuka penuh → bisa diisi lengkap → tekan **"Submit PRF"** → `generatePrfNo()` **berhasil** (RPC-nya `SECURITY DEFINER`, tak peduli role) → `INSERT` **ditolak RLS** → toast `"Gagal menyimpan: …"` dengan pesan Postgres mentah. **Counter `document_sequences` sudah terlanjur naik** → satu nomor hangus permanen, dan pesan errornya tidak menjelaskan apa pun ke user.

**Status:** kedua fakta = pembacaan kode, **BELUM diverifikasi runtime**. Perlu konfirmasi apakah jalur C memang disengaja (form PRF "berdiri sendiri" yang sengaja disiapkan tapi belum diberi leaf sidebar) atau sisa dari pencabutan leaf `prf` di commit `83238c3` (restrukturisasi nav Procurement — dicatat di `CLAUDE.md` sebagai *efek samping* yang tak pernah dicatat sebagai keputusan).

### 3. Nomor PRF final praktis tak bisa dicatat pada saat terbit

Di form, yang tampil hanya pratinjau `PRF/MSI/2026/VII/—` (`PRFFormPage.jsx:474`) — **berakhiran literal `—`**, bukan nomor. Nomor asli baru ada setelah simpan, muncul **hanya di toast yang hidup 2,8 detik** (`:463`, durasi `App.jsx:2103`), dan **form langsung ditutup** di baris berikutnya (`:464`). Tidak ada layar konfirmasi, tidak ada tombol *copy*, tidak ada highlight PRF yang baru dibuat di daftar tujuan.

Sesudah itu user harus **menavigasi balik sendiri** ke Detail Inquiry / Detail Account / list Forwarding untuk membacanya, dan menyalinnya dengan blok-teks manual.

Diperberat oleh jalur A: `onBack()` melempar user ke **Home / Command Center** (`App.jsx:3453`), **bukan** kembali ke inquiry asalnya — jadi ia bahkan kehilangan konteks tempat mencari nomornya. (Jalur B lebih baik: balik ke Detail Account tab Riwayat.)

### 4. Jalur B melewati `canRenderPage`

Render `PRFFormPage` di `App.jsx:3392-3402` **tidak** di-gate `canRenderPage('prf')` — berbeda dari jalur A (`:3450`). Perlindungannya sepenuhnya bergantung pada **visibilitas tombol** (`CustomerDetailPage.jsx:607` + `:1155`) dan RLS.

Praktis ini **bukan lubang aktif**: `customerPrfInquiryId` hanya bisa terisi lewat `onCreatePRF` yang hanya dikirim bila `canCreatePRF` true. Tapi ini **asimetri defense-in-depth** — jalur A punya dua lapis, jalur B satu. Kalau nanti ada sub-view keempat di blok `customer-detail`, pola ini gampang tereplikasi. (`CLAUDE.md` sudah mencatat catatan jejak serupa: *"blok `customer-detail` kini digate 3 state → sub-view ke-4 nanti WAJIB tambah ke guard itu"*.)

### 5. Satu inquiry → banyak PRF: perilaku ada, keputusannya tidak tertulis

Sudah dijabarkan di bagian ANTI-DUPLIKAT. Yang jadi ambiguitas: relasi **PRF→Quotation** punya keputusan tertulis (*"satu PRF boleh banyak quotation — keputusan desain, bukan TD"*, `CLAUDE.md` 20 Jul), sementara relasi **Inquiry→PRF** tidak punya pernyataan apa pun — hanya ketiadaan cek. **Tidak bisa dipastikan dari kode** apakah ini keputusan sadar (revisi harga → PRF baru) atau celah yang belum ketahuan. **Perlu konfirmasi Den.**

Konsekuensi praktis kalau ternyata tidak diinginkan: sales yang bimbang bisa menekan "Simpan Draft" beberapa kali dan meninggalkan beberapa PRF `DRAFT` bernomor untuk inquiry yang sama, yang semuanya muncul di kartu *Daftar PRF*. **PRF `DRAFT` tidak bisa dibuka-ulang untuk diedit** (form ini create-only, tak ada `prfId`/mode edit; **TD-76** sudah mencatat ini) → draft nyasar hanya bisa dibiarkan.

### 6. Fallback entity code `'MSI'` bisa menghasilkan nomor untuk entitas yang salah

`PRFFormPage.jsx:373`: `` `PRF/${code || 'MSI'}/…` ``, di mana `code` berasal dari fetch `companies.code` (`:219-220`) yang juga sudah ber-fallback `'MSI'`.

Kalau fetch itu gagal atau lambat, PRF milik **JCI** atau **SOA** akan bernomor `PRF/MSI/…` — sementara `p_company_id` yang dikirim ke RPC tetap company yang benar. Hasilnya: **nomor menyebut entitas yang keliru, dan `prf_no_unique(company_id, prf_no)` tidak akan menangkapnya** (kombinasinya tetap unik karena `company_id`-nya beda).

Risiko hari ini **rendah tapi bukan nol**: PRF de-facto dipakai MSI (menu-nya *"Forwarding (MSI)"*), dan fetch `companies` company-scoped hampir selalu berhasil. Tapi **tidak ada guard** yang mencegah save saat `companyCode` masih kosong — `handleSave` tidak memeriksanya sama sekali. Sebagai pembanding, tombol "Submit PRF" **tidak** di-disable selama `companyCode` belum termuat.

### 7. Tiga kolom PRF ditulis kode tapi tidak ada di `schema_snapshot.sql`

`PRFFormPage.jsx` (payload `:422`, `:426-427`) menulis **`goods_name`**, **`un_number`**, dan **`imo_class`** ke tabel `prf`. Ketiganya **TIDAK ADA** di `CREATE TABLE public.prf` pada snapshot (`schema_snapshot.sql:4107-4166` — diverifikasi: grep ketiganya di dalam blok CREATE TABLE → **0 hit**), dan **tidak ada file migrasi** yang menambahkannya (grep `goods_name|un_number` di `supabase/migrations/` → **0 hit**; migrasi terakhir `20260722000010`).

Ketiga kolom itu ditambahkan oleh commit **`1235f4a` "feat(prf): batch 1 field PRF — nama barang + DG detail + enum kargo + kewajiban"** (23–24 Jul) yang **hanya menyentuh 1 file frontend** — artinya SQL-nya dijalankan manual **setelah** refresh snapshot 22 Jul, dan belum direkam.

**Ini persis kondisi yang diperingatkan `CLAUDE.md`:** *"snapshot bilang 'kolom tidak ada' ≠ kolomnya tidak ada — bandingkan dulu tanggal refresh snapshot vs tanggal SQL manual terakhir, lalu TANYA."* Sesuai aturan itu, saya **tidak** menyimpulkan kolomnya tidak ada. **Yang bisa saya pastikan dari repo:** kolomnya tidak terekam di snapshot maupun migrasi. **Yang tidak bisa saya pastikan:** apakah sudah live di DB. **Perlu konfirmasi Den** — kalau belum live, setiap Submit/Draft PRF akan gagal dengan error PostgREST *"column … does not exist"*.

Efek dokumen ikutan: `AUDIT_FIELD_INQUIRY_PRF.md` (audit sebelumnya) masih mencatat Nama Barang / UN Number / IMO Class sebagai **"TIDAK ADA di PRF"** (baris #18, #21, #22) — **klaim itu sudah usang** untuk sisi kode.

### 8. Format nomor PRF menyimpang dari standar penomoran

`AGENTS.md` (§ Document Numbering Direction) menetapkan `{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}` — contoh yang diberikan justru menyertakan PROC: `PO/STB/PROC/2026/0001`.

Format PRF: `PRF/{ENTITY}/{YYYY}/{ROMAWI}/{SEQ}` — **`{DEPT}` hilang** dari string (padahal `'PROC'` **tetap dikirim** ke RPC sebagai kunci counter), dan **bulan romawi disisipkan** di posisi yang standar tidak punya. Sequence-nya juga 3 digit, bukan 4 seperti seluruh contoh di `AGENTS.md`.

Ini **bukan bug** — polanya identik dengan Inquiry & Quotation (`InquiryFormPage.jsx:143`, `QuotationFormPage.jsx:187`) yang sama-sama pakai bulan romawi, jadi konsisten **di dalam** rantai dokumen komersial. Tapi standar tertulis di `AGENTS.md` **belum diperbarui** untuk mengakui varian ini. Dicatat supaya tidak jadi "temuan" berulang di audit berikutnya.

### 9. "Simpan Draft" nyaris tanpa validasi tapi konsekuensinya permanen

`handleSave('DRAFT')` melewati `validate()` sepenuhnya (`:383` — `if (status === 'SUBMITTED' && !validate()) return;`). Hanya `inquiry_id` yang dijaga. Artinya draft bisa lahir dengan Direction, Commodity, Service Type, Incoterm **semuanya kosong** — dan **tetap membakar satu nomor PRF**.

Digabung dengan TD-76 (draft tak bisa dibuka-ulang), draft setengah jadi = **nomor terbuang + baris `DRAFT` permanen** yang muncul di kartu *Daftar PRF* dan list Forwarding. Label tombolnya (**"Simpan Draft"**) mengesankan sesuatu yang ringan dan bisa diulang, padahal tidak.

### 10. Cabang UI yang perlu diketahui saat menulis panduan user

Bukan masalah — tapi alurnya **bercabang cukup dalam**, dan panduan yang mengasumsikan satu jalur lurus akan meleset:

| Pemicu | Efek |
|---|---|
| `Direction = Domestic` | Service Type **"Custom Only"** jadi `disabled` + berlabel *"(tak tersedia utk Domestic)"* (`:620-621`); add-on customs (5 dari 11) `disabled` dan yang sudah tercentang **dibersihkan otomatis** (`:284-294`) |
| `Commodity = Dangerous Good` | Muncul checkbox **MSDS** (wajib tercentang saat Submit, `:327`) + field **UN Number** & **IMO Class** (`:598-612`) |
| `Service Type = Air` | Daftar Incoterm menyusut **11 → 7** (`INCOTERMS_AIR`, `:305`) |
| Incoterm ∈ CIF/CIP/DDP | Muncul **Commercial Value** + **Currency** (`:640-654`) |
| Incoterm ∈ EXW/CPT/CIP/DAP/DPU/DDP | **Pickup Address** jadi wajib (`:330`) |
| Incoterm ∈ EXW/FAS/FOB/CFR/CIF/DAP/DPU/DDP | **Delivery Address** jadi wajib (`:331`) |
| Service Type dipilih | Section **03 "Detail Layanan"** muncul; **ganti Service Type → seluruh isian child TERHAPUS** tanpa peringatan (`CHILD_RESET`, `:262-269`) |
| Service Type = Inland **ATAU** add-on "Inland" dicentang | Blok Inland muncul (dua pemicu, `:314`) — dan alamat pickup/delivery-nya **field TERPISAH** dari Pickup/Delivery di Section 02 |
| Service Type = Custom **DAN** add-on "Custom Clearance" dicentang | Blok Custom muncul (**dua syarat**, `:315`). Kalau hanya Service Type=Custom tanpa add-on → muncul hint *"Centang add-on Custom Clearance untuk detail dokumen."* (`:788-790`) |
| Add-on "Others" dicentang | Muncul field teks **"Add On — Others"** (`:684-688`) |

Dua yang paling berpotensi membingungkan user: **(a)** ganti Service Type membuang isian Detail Layanan tanpa konfirmasi; **(b)** blok Custom butuh **dua** aksi terpisah, dan hintnya hanya muncul setelah kesalahan sudah terjadi.

### 11. Batas kejujuran audit ini

- **NOL tes runtime.** Seluruh isi laporan = pembacaan kode + snapshot per 24 Jul 2026. Tidak ada halaman yang dibuka, tidak ada SQL yang dijalankan.
- **`schema_snapshot.sql` adalah file di repo, bukan DB hidup.** Klaim tentang RLS, constraint, trigger, dan kolom mencerminkan isi snapshot (terakhir di-`pg_dump` 22 Jul, commit `b17757e`) — lihat TEMUAN #7 untuk kasus konkret di mana ini penting.
- **Statistik data tidak diaudit** (berapa PRF yang ada, berapa yang `DRAFT`, apakah ada inquiry ber-PRF ganda) — tidak ada akses DB di sesi ini.
- **`is_super_admin()`, `has_role()`, `get_user_company_id()`, `is_manager_or_above()`** dibaca sebagai nama fungsi di teks policy; isi definisinya tidak ditelusuri ulang di audit ini.
