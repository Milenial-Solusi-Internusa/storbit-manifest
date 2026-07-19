# AUDIT — TD-98: Kesiapan Pensiun `DealDetailPage` (inventaris kapabilitas vs `CustomerDetailPage`)

> Read-only. Scope sempit sesuai instruksi: `src/modules/crm/DealDetailPage.jsx` (DDP), `src/modules/crm/CustomerDetailPage.jsx` (CDP), komponen/util yang keduanya panggil (`DealPanels.jsx`, seperlunya), entri **TD-98** di `08_TECH_DEBT.md`, + jalur wiring di `src/App.jsx` (untuk risiko pensiun). Verifikasi ke KODE, bukan ke catatan. Tanggal: 2026-07-19 (branch `feat/crm-detail-tahap3b`, pasca-Task 1–3; belum commit). **NOL file diubah selain dokumen ini.**
> Singkatan: **DDP** = DealDetailPage, **CDP** = CustomerDetailPage, **DP** = DealPanels.jsx, **App** = src/App.jsx.

---

## RINGKASAN EKSEKUTIF

**DealDetailPage BELUM bisa dipensiunkan.** Ada **dua** kelas penghambat, dan keduanya harus tuntas dulu:

1. **Satu gap yang CRITICAL, bukan MEDIUM: "Edit Inquiry".** Mode edit inquiry (`InquiryFormPage mode="edit"`) **hanya punya SATU jalan masuk di seluruh aplikasi** — tombol "Edit Inquiry" di DDP (`DDP:297-301` → `App:3154` → render `App:3164-3166`). Tidak ada entry lain (grep `mode="edit"` di App = hanya baris 3166 untuk inquiry, + MOM di 3427). **Kalau DDP dihapus tanpa mengganti entry ini, tidak ada cara apa pun untuk mengedit inquiry yang sudah dibuat.** Itu kehilangan akses ke *aksi mutasi* tanpa jalan lain → CRITICAL menurut rubrik. TD-98 memasukkan Edit Inquiry ke dalam daftar 5, tapi menandai seluruh TD sebagai **MEDIUM** — itu **meng-undersell** severity item ini.

2. **Entry-point rewire adalah blocker keras (bukan sekadar nice-to-have).** DDP dimasuki HANYA dari daftar Inquiry (`InquiryListPage:305` → `onSelectInquiry` → `App:3130 setCrmDealInquiry`). Kalau file DDP dihapus tapi entry itu dibiarkan, klik baris inquiry akan **menghasilkan layar kosong** (lihat §RISIKO) — karena blok list juga ter-guard `!crmDealInquiry`. Jadi Task 4 (alih entry) **wajib** menyertai pensiun, bukan opsional.

**Verifikasi klaim TD-98: 5 item masih AKURAT dan masih relevan** (tidak ada yang sudah keburu diselesaikan diam-diam di tahap 3b). Task 3 hanya menambah *tampilan* detail permintaan di tab Riwayat — ia **tidak** menyentuh kelima aksi/agregat yang ditagih TD-98. Namun ditemukan **3 gap kecil tambahan yang TIDAK tercatat di TD-98** (semua LOW: "Dibuat Oleh" per-inquiry, badge status inquiry di baris Riwayat, tampilan read-only "Est. Closing Date"). Tidak ada gap besar yang terlewat dari TD-98.

**Syarat pensiun (ringkas):** wire 5 kapabilitas ke CDP (prioritaskan Edit Inquiry) **+** alih entry daftar Inquiry ke CDP (Task 4) **+** samakan gate role (menu `crm_inquiry` vs `crm_customers`, lihat §RISIKO) **+** hapus state/blok render/import DDP di App. Tidak ada satupun butuh perubahan DB.

---

## TABEL PEMETAAN KAPABILITAS

Kolom: kapabilitas | DDP (file:line) | status di CDP | severity (jika DDP pensiun) | effort menutup.
"Severity" = dampak bila DDP dihapus HARI INI tanpa penambahan. Effort hanya untuk yang BELUM/SEBAGIAN. **Tidak ada** item yang butuh perubahan DB.

| # | Kapabilitas | DDP (file:line) | Status di CDP | Severity | Effort |
|---|---|---|---|---|---|
| 1 | **Loading state** | `DDP:254-262` | SUDAH ADA — `CDP:770-772` | — | — |
| 2 | **Not-found state** ("… tidak ditemukan" + Kembali) | `DDP:263-271` | SUDAH ADA — `CDP:773-782` ("Customer tidak ditemukan") | — | — |
| 3 | **DealStepper** (7-stage, stage+nilai) | `DDP:277` (komp `DP:161`) | SUDAH ADA — `CDP:982` (komponen identik) | — | — |
| 4 | **"Nilai Deal"** (angka besar) | via `DealHeaderControls` `DDP:91` (`DP:238-239`) | SUDAH ADA — `CDP:984` (komponen identik) | — | — |
| 5 | **Pindah Stage** (dropdown 7 stage → tulis `accounts.pipeline_stage` + audit) | `DDP:238-242` (`updateAccount` `DDP:226`) | SUDAH ADA — `CDP:766` `pickStage` + `CDP:984` `onPickStage`; jalur tulis sama `saveDealUpdate` (`DP:120`) | — | — |
| 6 | **Edit Deal** (modal: stage/assignee/estimated_value/closing) | `DDP:244-251` `saveEdit`; render `DDP:378-384` | SUDAH ADA — `CDP:785` `saveDealEdit`; render `CDP:1326`; assignee via `fetchAssignees` (`CDP:775`) | — | — |
| 7 | **Header: nama + StageBadge** | `DDP:75-77` | SUDAH ADA — nama `CDP` header card; stepper menunjukkan stage aktif (`CDP:982`) | — | — |
| 8 | **Header: assignee (avatar+nama)** | `DDP:82-84` | SUDAH ADA (tab lain) — "Assigned Salesperson" di tab Komersial `CDP:920` | LOW | — |
| 9 | **Header: Est. Closing Date (read-only)** | `DDP:85-87` | **BELUM ADA** sebagai tampilan read-only (hanya bisa dilihat/diubah di modal Edit Deal `DP:314-315`) | LOW | Kecil — `CDP` (1 baris di header/stepper), FE-only, tanpa DB |
| 10 | **Kartu "Detail Inquiry"** (service_type, status, POL→POD, incoterms, container_types, goods_name, hs_code, weight_kg, volume_cbm, cargo_types, additional_services, deadline_quote, route, commodity, notes) | `DDP:294-343` | SUDAH ADA (Task 3) — tab Riwayat, `InquiryDetailBlock` `CDP:399` + baris `InquiryHistoryRow` `CDP:437` (service_type/POL/POD/tanggal di header baris; sisanya di blok expand). **Beda UX:** DDP = kartu 1 inquiry; CDP = per-baris expand, semua inquiry akun | LOW (data setara) | — |
| 10a | ⤷ **"Dibuat Oleh"** per inquiry | `DDP:339` (`createdByName`) | **BELUM ADA** — baris Riwayat CDP tak menampilkan pembuat inquiry | LOW | Kecil — `CDP` + tambah `created_by` embed di query `histInquiries` (`CDP:715`), FE-only |
| 10b | ⤷ **Badge status inquiry** (OPEN/…) | `DDP:307-309, 313` | **BELUM ADA** (kolom `status` di-fetch tapi tak dirender di baris Riwayat) | LOW | Kecil — `CDP`, FE-only |
| 11 | **Kartu "Aktivitas Terkait"** (`activities` account-scoped, 5 terbaru) | `DDP:345-367` (fetch `DDP:168-174`) | SUDAH ADA (superset) — tab "Aktivitas" semua tipe s/d 200 (`CDP:1138`) + tab "History Visit" (`CDP:1122`) | — | — |
| 12 | **Daftar Quotation (tampil)** | `DDP:372` (`QuotationListCard` `DP:338`) | SUDAH ADA — tab Riwayat, tabel quotation ber-nest per inquiry + bagian "orphan" (`CDP:1045` `InquiryHistoryRow`) | — | — |
| 13 | **Lihat Quotation** (Eye → Quotation Detail) | `DDP:372` `onView={onViewQuotation}` (tombol `DP:374`; nav `App:3153`) | **BELUM ADA** — tabel quotation di Riwayat read-only, tanpa aksi lihat; `QuotationListCard` **tak** di-import CDP | MEDIUM (workaround: menu Quotation) | Sedang — `CDP` (aksi per-baris) + `App` (callback → `quotation-draft` detail), FE-only |
| 14 | **Buat Quotation dari inquiry** | `DDP:372` `onCreate={onCreateQuotation}` (tombol `DP:344`; `App:3152` = **form KOSONG**, tanpa prefill) | **BELUM ADA** di CDP | LOW-MEDIUM (form kosong; workaround: menu Quotation) | Kecil — `CDP` tombol + `App` buka form quotation, FE-only |
| 15 | **Daftar PRF (tampil)** | `DDP:373` (`PrfListCard` `DP:390`) | SUDAH ADA — tab Dokumen `PrfListCard prfs={docPrfs} canCreate={false}` (`CDP:1083`) | — | — |
| 16 | **Cetak PRF dari inquiry** (role `sales`/`gm_bd`) | `DDP:373` `canCreate={['sales','gm_bd'].includes(erpRole)} onCreate={onCreatePRF}` (`App:3155` prefill `inquiry_id`) | **BELUM ADA** — CDP Dokumen `canCreate={false}` | MEDIUM (workaround: menu PRF, `PRFFormPage` punya sumber=inquiry) | Sedang–Besar — `CDP` Dokumen bersifat akun (bukan per-inquiry) → butuh tombol per-inquiry di Riwayat / pemilih inquiry + gate role; `App` prefill; FE-only |
| 17 | **Summary Harga** (best quote + rentang min–max) | `DDP:374` (`PriceSummaryCard` `DP:437`) | **BELUM ADA** — `PriceSummaryCard` tak di-import CDP | LOW (turunan/informasional) | Kecil — `CDP` import + render + fetch `payment_terms` (termMap), FE-only |
| 18 | **Edit Inquiry** (→ `InquiryFormPage mode="edit"`) | `DDP:297-301` `onEditInquiry` (`App:3154` → render `App:3164-3166`) | **BELUM ADA** — Riwayat read-only; **tak ada entry edit inquiry lain di seluruh app** | **CRITICAL** (satu-satunya jalan; tak ada workaround) | Sedang — `CDP` (tombol Edit Inquiry per-baris Riwayat) + `App` (buka `InquiryFormPage mode=edit`, butuh membawa `inquiryId`), FE-only |
| 19 | **Navigasi Back** (→ daftar Inquiry) | `DDP:66-67, 286` `onBack` (`App:3151`) | SUDAH ADA (setara) — `CDP:onBack` → `backFromCustomerDetail` → `prevCustomerMenu` (`App:1838-1841`); kembali ke ASAL (Prospects/Pipeline/Customer/…Inquiry bila di-wire) | — | — |
| 20 | **Breadcrumb** ("Inquiry List / Detail Deal") | `DDP:66-69` | SUDAH ADA (setara) — breadcrumb "CRM › Customer › {nama}" (`CDP` header) | LOW (label beda) | — |
| 21 | **Tulis stage/deal → audit `CHANGE_PIPELINE_STAGE`** (side effect) | `DDP:228-233` via `saveDealUpdate` (`DP:123-131`) | SUDAH ADA — jalur tulis + audit yang **sama persis** (`saveDealUpdate`) dari `CDP` (`CDP:766/785`) | — | — |

**Catatan model (bukan gap, tapi relevan untuk pensiun):** DDP me-resolve akun **hanya** via `inquiry.prospect_id` dan **mengabaikan `inquiry.customer_id`** (`DDP:146-152`) → inquiry yang ter-link via `customer_id` tampil dengan akun/stepper/Nilai Deal **kosong** di DDP. CDP tidak punya cacat ini (CDP = akun-first; `id` sudah akun, dan Riwayat menyatukan `prospect_id` OR `customer_id`, `CDP:717`). Jadi CDP secara data **lebih benar** untuk kasus `customer_id`-linked — argumen tambahan untuk pindah, bukan penghambat.

---

## VERIFIKASI KLAIM TD-98

Isi TD-98 (baris 121, `08_TECH_DEBT.md`) menagih **5** kapabilitas: (a) Lihat Quotation, (b) Buat Quotation, (c) Cetak PRF, (d) Edit Inquiry, (e) Summary Harga.

| Klaim TD-98 | Hasil verifikasi kode | Verdict |
|---|---|---|
| (a) Lihat Quotation belum ada di CDP; Riwayat read-only | Benar — `QuotationListCard` tak di-import CDP; tabel Riwayat tanpa aksi Eye (`CDP:437-…`) | ✅ COCOK |
| (b) Buat Quotation belum ada | Benar — tak ada tombol/onCreate di CDP | ✅ COCOK |
| (c) Cetak PRF `canCreate={false}` di `CDP:1083` | Benar — persis di `CDP:1083` | ✅ COCOK (line akurat) |
| (d) Edit Inquiry tak ada padanan | Benar — **dan lebih parah**: ini satu-satunya entry `mode="edit"` inquiry di app | ✅ COCOK, tapi **severity di-undersell** (lihat bawah) |
| (e) Summary Harga tak ada di CDP | Benar — `PriceSummaryCard` tak di-import CDP | ✅ COCOK |
| Line ref lain: `DP:374`, `DP:344`, `DP:436`, `DDP:297-301,372-374` | `PriceSummaryCard` di `DP:437` (TD-98 tulis `:436` — meleset 1 baris, sepele); sisanya cocok | ⚠️ sepele |

**Kesimpulan verifikasi:**
1. **Jumlah masih 5, semuanya masih relevan.** Tidak ada dari kelima yang keburu tertutup di tahap 3b. Task 3 hanya menambah *tampilan* Detail Permintaan (kapabilitas #10), yang memang sudah "tampil" bukan bagian dari kelima aksi.
2. **TD-98 meng-undersell "Edit Inquiry".** TD ditandai MEDIUM secara global; tapi Edit Inquiry = **CRITICAL** karena tak ada jalur alternatif (grep `mode="edit"` inquiry = hanya `App:3166`). Rekomendasi: naikkan penekanan item (d) atau beri sub-severity per item.
3. **TD-98 tidak menyebut blocker entry-point rewire.** Bagian "remediasi" TD-98 menyebut Task 4 (alih entry) & Task 5 (pangkas Detail Inquiry) sebagai kelanjutan, tapi tidak dinyatakan bahwa **tanpa** Task 4 penghapusan file DDP membuat klik baris inquiry → layar kosong. Itu blocker keras, bukan follow-up opsional.
4. **3 gap LOW tak tercatat di TD-98** (semua kosmetik, tak menghalangi pensiun): "Dibuat Oleh" per-inquiry (#10a), badge status inquiry di baris Riwayat (#10b), tampilan read-only Est. Closing Date (#9). Layak dicatat agar tak dianggap regresi saat pensiun.
5. **Perbedaan gate role** (tak disebut TD-98): DDP hidup di menu `crm-inquiry` (menuKey `crm_inquiry`); CDP hidup sebagai `customer-detail` (menuKey efektif `crm_customers` via synthetic allow). Bila entry inquiry dialihkan ke CDP, **visibilitas per-role bisa bergeser** (siapa yang boleh membuka inquiry ≠ siapa yang boleh membuka Detail Account). Perlu dicek saat Task 4 (di luar scope audit ini, tapi ditandai).

---

## RISIKO PENSIUN — referensi yang masih menunjuk ke `DealDetailPage`

Referensi **hidup** (bukan komentar):

| Lokasi | Peran | Kalau DDP dihapus hari ini |
|---|---|---|
| `App:50` | `const DealDetailPage = lazy(() => import('./modules/crm/DealDetailPage'))` | **Build/runtime pecah** — import ke file yang hilang |
| `App:1691` | `const [crmDealInquiry, setCrmDealInquiry] = useState(null)` | state yatim (harus ikut dihapus) |
| `App:1798` | `setCrmDealInquiry(null)` (reset di `navigateTo`) | referensi yatim |
| `App:3125` | blok list Inquiry ter-guard `&& !crmDealInquiry` | jika `crmDealInquiry` di-set tapi blok DDP hilang → **list ikut hilang → layar kosong** |
| `App:3146-3160` | render `<DealDetailPage inquiryId=… onCreateQuotation/onViewQuotation/onEditInquiry/onCreatePRF/>` | referensi komponen hilang → pecah |
| `App:3161-3172` | render `<InquiryFormPage mode="edit">` (Edit Inquiry) — **guarded `crmDealInquiry && showInquiryForm`** | **satu-satunya entry edit inquiry** ikut mati |
| `App:3130` | `onSelectInquiry={(inq) => setCrmDealInquiry(inq)}` (entry) | klik baris inquiry set state tapi tak ada yang render → **layar kosong** |
| `InquiryListPage:305` | `onClick={() => (onSelectInquiry ? onSelectInquiry(inq) : setDetailInquiry(inq))}` | entry ke DDP; harus dialihkan ke CDP (Task 4) |

Referensi **komentar saja** (aman, tak memengaruhi build): `CDP:585,764,786,1325`; `DP:5,8,118`; `SalesOrderDetailPage.jsx:32`.

**Jalan masuk DDP saat ini = TUNGGAL:** hanya dari `InquiryListPage` (baris → `onSelectInquiry` → `App:3130`). Tidak ada menu, deep-link notifikasi, atau redirect lain ke DDP (grep bersih; deep-link CRM hanya `activity`→`crm-calls` & `lead_pool`→`crm-lead-pool`). Ini menyederhanakan alih entry — cukup satu titik (`InquiryListPage:305` + handler `App:3130`).

**"Apa yang pecah kalau dihapus hari ini":**
1. **Build gagal** (import `App:50` + JSX `App:3149`).
2. Andai import dibersihkan tapi entry `App:3130` dibiarkan: klik baris inquiry set `crmDealInquiry` → **tak ada blok yang render** (blok list ter-guard `!crmDealInquiry`) → **halaman kosong**.
3. **Edit Inquiry hilang total** (tak ada entry `mode="edit"` lain) → tidak bisa mengubah inquiry apa pun. CRITICAL.
4. Lihat/Buat Quotation dari konteks inquiry & Cetak PRF dari inquiry hilang (ada workaround via menu masing-masing) → MEDIUM.
5. Summary Harga hilang (informasional) → LOW.

---

## URUTAN KERJA YANG DISARANKAN

Prasyarat pensiun DDP, diurut dari yang paling menentukan. **Semua FE-only; tidak ada perubahan DB pada jalur mana pun** (tabel `quotations`/`prf`/`inquiries`/`accounts` + FK/RLS-nya sudah ada; ini murni wiring UI + navigasi).

1. **Edit Inquiry ke CDP (kapabilitas #18) — DAHULUKAN.** Ini satu-satunya CRITICAL. Tambah tombol "Edit Inquiry" per-baris di tab Riwayat (`InquiryHistoryRow`, `CDP:437`) → `App` buka `InquiryFormPage mode="edit"` membawa `inquiry.id`. Selama ini belum ada, DDP **tidak boleh** disentuh. *(Sedang, FE-only.)*
2. **Lihat Quotation (#13) + Buat Quotation (#14).** Idealnya pakai ulang `QuotationListCard` (`DP:338`, sudah punya `onView`/`onCreate`) di tab Riwayat menggantikan tabel custom, atau tambah aksi Eye + tombol di tabel yang ada; `App` sediakan callback nav ke `quotation-draft`. *(Sedang + Kecil, FE-only.)*
3. **Cetak PRF dari inquiry (#16).** Butuh keputusan bentuk: tombol per-inquiry di Riwayat (paling dekat perilaku DDP) vs tombol akun-level di Dokumen dengan pemilih inquiry. Pertahankan gate role `sales`/`gm_bd`. *(Sedang–Besar, FE-only.)*
4. **Summary Harga (#17)** + gap LOW (#9 Est. Closing read-only, #10a Dibuat Oleh, #10b status inquiry). Kosmetik/informasional; kerjakan sekalian agar tak terasa regresi. *(Kecil, FE-only.)*
5. **Alih entry daftar Inquiry (Task 4) — blocker keras, kerjakan SETELAH 1–4.** `InquiryListPage:305` + `App:3130` → arahkan ke `navigateToCustomerDetail(accId, {tab:'riwayat', expandInquiryId})` (butuh `prospect_id`/`customer_id` di select InquiryList). **Cek pergeseran gate role** `crm_inquiry` → `crm_customers` di sini (§VERIFIKASI poin 5). Tangani inquiry `customer_id`-only & yatim.
6. **Baru hapus DDP (Task 5):** buang `App:50` import, state `crmDealInquiry` (`App:1691`) + reset (`App:1798`) + blok render (`App:3146-3172`), lalu delete `DealDetailPage.jsx`. Pastikan build clean + tak ada referensi yatim.

**Gerbang keputusan:** DDP boleh pensiun **hanya** setelah langkah 1–5 selesai & terverifikasi runtime. Sebelum itu, biarkan DDP hidup & terjangkau (kondisi tahap 3b sekarang sudah benar: dua halaman koeksis untuk perbandingan).

---

**Catatan wajib:** Audit ini tidak menjalankan app/DB. Semua klaim dari pembacaan `src/` (DDP, CDP, DP, App, InquiryListPage) + entri TD-98. Line ref per state kode pasca-Task 1–3 (belum commit). Tidak ada SQL ditulis/dijalankan. NOL file diubah selain `AUDIT_TD98.md`.
