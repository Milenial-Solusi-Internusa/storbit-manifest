# AUDIT_PRF_VENDOR.md — Relasi Vendor di PRF & Kesiapan Multi-Vendor

> Auditor read-only. Tanggal: 2026-07-20. Scope: relasi vendor di dalam PRF + kesiapan struktur untuk >1 vendor per PRF, termasuk rantai `rate_sheets → PRF → quotation`. Tidak ada file kode/DB yang diubah.
> Sumber bukti: `supabase/schema_snapshot.sql`, `src/modules/procurement/*`, `src/modules/crm/RateListPage.jsx`, `src/modules/crm/QuotationFormPage.jsx`, `docs/Governance/03_DATA_MODEL.md`, `05_WORKFLOW_MAP.md`.

---

## RINGKASAN EKSEKUTIF

**Vendor tidak dimodelkan di rantai PRF sama sekali.** Ini temuan utama, dan harus jujur: bukan "satu PRF terkunci ke satu vendor", melainkan **PRF tidak tahu vendor apa pun**. Tabel `prf` (`schema:3824`) tidak punya kolom vendor. Tabel anak `prf_cost_items` (`schema:3893`) juga tidak — satu-satunya jejak kata "vendor" di seluruh rantai adalah kolom `cost_type` yang isinya cuma enum `'vendor' | 'internal'` (`CONSTRAINT prf_cost_items_cost_type_check`, `schema:3904`). Itu **klasifikasi jenis biaya** (biaya ke pihak luar vs biaya internal), **bukan identitas vendor**. Tidak ada `vendor_id`, tidak ada nama vendor terstruktur, tidak ada FK. Grep membuktikan: **tidak ada satu pun `REFERENCES public.vendors` di seluruh skema.**

**Tabel master `vendors` (`schema:4870`) praktis mati dalam alur transaksional.** Ia lengkap (code, name, bank_account, payment_terms, dll.) dan punya RLS + index, tapi **nol FK masuk** dari tabel mana pun, dan **satu-satunya pembaca di seluruh frontend** adalah `PenerimaanBarangPage.jsx:332` (Goods Receipt inventory) — **bukan** modul Procurement/PRF. `grep from('vendors')` di `src/modules/procurement/` = nihil. Dokumen sendiri sudah jujur soal ini: `03_DATA_MODEL.md:71` menulis "`vendors` — master vendor (Foundation; **PR/PO belum dibangun**)". Jadi konsep vendor ada sebagai master data yatim, belum pernah disambungkan ke transaksi.

**Konsekuensinya untuk pertanyaan besar (kesiapan multi-vendor): strukturnya bukan "belum siap multi-vendor" — ia belum siap SATU vendor pun.** Menambah kemampuan >1 vendor per PRF bukan "melonggarkan model 1-vendor yang ada", melainkan **membangun pemodelan vendor dari nol**: tabel penawaran/attribusi vendor, FK ke `vendors`, UI pemilihan vendor, konsep "award/vendor terpilih" (yang **tidak ada** di mana pun, termasuk dead code), dan pembawaan info vendor ke hilir. Kabar baiknya: karena tidak ada constraint/trigger/unique yang mengunci PRF ke vendor, **tidak ada yang "meledak"** saat multi-vendor dipasang — tidak ada yang menghalangi karena tidak ada yang mengatur. Kabar buruknya: rantai `rate_sheets → PRF → quotation` yang jadi asumsi scope **tidak eksis di kode**; `rate_sheets` adalah fitur CRM (Rate List) berdiri sendiri, freeform jsonb, tanpa kolom vendor, tanpa tautan ke PRF.

---

## JAWABAN 7 PERTANYAAN

### 1. BENTUK SEKARANG — Vendor nempel di mana?

**Tidak nempel di mana pun secara struktural.**
- Header `prf` (`schema:3824-3886`): tidak ada kolom vendor. Kolom terkait harga hanya `suggested_rate`, `rate_currency`, `valid_from/until`, `pricing_notes`, `answered_by/at`. Tidak ada `vendor_id`.
- `prf_cost_items` (`schema:3893-3905`): kolomnya `component` (text bebas, mis. "Ocean Freight"), `cost_type` (`'vendor'|'internal'`), `amount`, `currency`, `sort_order`, `notes`. **Tidak ada `vendor_id`, tidak ada nama vendor.** `cost_type='vendor'` hanya menandai "ini biaya ke pihak luar", tanpa menyebut pihak mana.
- `rate_sheets` (`schema:4210-4221`): `columns`/`rows` jsonb freeform, `rate_name`, `valid_until`, `note`. Tidak ada kolom vendor, tidak ada FK ke PRF.

**Relasi PRF→vendor sekarang: TIDAK ADA relasi.** Bukan one-to-one, bukan one-to-many, bukan lewat perantara. Nol. Yang paling dekat dengan "vendor" adalah kolom klasifikasi enum di baris biaya. Satu-satunya tempat manusia bisa menaruh nama vendor adalah mengetiknya bebas ke `prf_cost_items.component` atau `.notes` — tidak terstruktur, tidak bisa di-query, tidak terjamin.

### 2. TABEL VENDOR

- Nama tabel master: **`public.vendors`** (`schema:4870`). Comment: "Company-scoped vendor master. Covers suppliers, shipping lines, truckers, customs agents, and sub-contractors."
- Kolom: `id, company_id, code, name, legal_name, vendor_type, tax_id, address, city, country, phone, email, pic_name, pic_phone, bank_name, bank_account, bank_account_name, payment_terms_id, currency_code, notes, is_active, created_by/updated_by, timestamps, deleted_at`.
- **Kolom yang dipakai di rantai PRF: TIDAK ADA — karena rantai PRF tidak menyentuh tabel ini sama sekali.**
- **Per entitas atau global?** **Per entitas.** `company_id NOT NULL` + FK `vendors_company_id_fkey → companies(id) ON DELETE RESTRICT` (`schema:9835`) + `UNIQUE(company_id, code)` (`vendors_company_code_unique`, `schema:6070`). Jadi vendor di-scope per MSI/JCI/SOA. (Catatan: RLS-nya bermasalah — lihat Temuan, TD-47.) ⚠️ **KOREKSI 21 Jul 2026:** scoping per-entitas itu benar **secara struktur**, tapi **TIDAK berlaku efektif** saat audit ini ditulis — `vendors_select USING(true)` menganulir scoping company sehingga **read bocor lintas entitas antar user login** (`anon` tidak terdampak). Sudah ditutup 21 Jul 2026. Lihat blok **⚠️ KOREKSI** di §TEMUAN.

### 3. RATE SHEET

- **Satu rate sheet = satu... apa pun.** `rate_sheets` **tidak punya konsep vendor sama sekali** — tidak ada kolom vendor, tidak ada FK. Ia hanya "kartu tarif" freeform: `columns` (mis. default `['POL','POD','O/F','CFS','OTHERS','REMARKS']`, `RateListPage.jsx:33`) dan `rows` (array of array string). Jadi pertanyaan "satu vendor atau lintas vendor" **tidak berlaku** — vendor bukan dimensi di tabel ini.
- **Bagaimana rate sheet dipilih saat bikin PRF?** **Tidak dipilih.** Tidak ada picker rate sheet di PRF. `grep rate_sheet` di `src/modules/procurement/` = nihil. `rate_sheets` hanya dibaca/ditulis di `RateListPage.jsx` (menu CRM "Rate List") dan dicetak PDF via `RateSheetPDF.jsx`. **Rantai `rate_sheets → PRF` tidak eksis di kode.**
- **Bisakah satu PRF menarik baris dari dua rate sheet vendor berbeda?** Pertanyaan ini mengandaikan mekanisme yang tidak ada. PRF tidak pernah menarik baris dari rate sheet mana pun. Yang **mencegah**-nya: ketiadaan fitur (tidak ada kode yang menyambungkan). Yang **tidak mencegah** kalau kelak dibangun: tidak ada constraint apa pun.
- Kode picker rate sheet: **tidak ada.** (Yang ada: editor rate sheet standalone di `RateListPage.jsx:73-92`, murni CRUD spreadsheet.)

### 4. UNIQUE & CONSTRAINT — ada yang mengunci PRF ke satu vendor?

**Tidak ada.** Constraint pada rantai:
- `prf`: `prf_no_unique UNIQUE(company_id, prf_no)` (`schema:5742`) — mengunci **nomor dokumen**, bukan vendor.
- `prf_cost_items`: hanya `prf_cost_items_pkey` (`schema:5734`) + FK `prf_id → prf ON DELETE CASCADE` (`schema:9115`). Tidak ada unique yang membatasi vendor.
- `quotations`: `quotations_quotation_no_revision_key UNIQUE(quotation_no, revision)` (`schema:5830`).
- `rate_sheets`: hanya pkey.
- Trigger di rantai: `set_prf_cost_items_updated_at` (housekeeping `updated_at`), dan `trg_quotation_prf_consistency` (menjaga `quotations.prf_id ↔ inquiry_id`, **bukan** vendor). Tidak ada trigger vendor.

Karena vendor tidak dimodelkan, **tidak ada constraint yang akan "meledak duluan" saat multi-vendor dipasang** — justru sebaliknya, tidak ada rem sama sekali. (Ini bukan kabar baik: artinya integritas multi-vendor harus dibangun eksplisit, tidak ada yang menjaga.)

### 5. TITIK BACA VENDOR DI UI (konteks PRF)

Satu-satunya UI yang menyebut "vendor" di konteks PRF adalah dropdown klasifikasi biaya, **bukan** pemilihan/tampilan identitas vendor:
- `PRFDetailPage.jsx:24` — `const COST_TYPES = [{ v: 'vendor', l: 'Vendor' }, { v: 'internal', l: 'Internal' }];`
- `PRFDetailPage.jsx:98` — baris biaya baru default `cost_type: 'vendor'`.
- `PRFDetailPage.jsx:130` — saat simpan: `cost_type: r.cost_type === 'internal' ? 'internal' : 'vendor'`.
- Render: tabel rincian biaya dengan kolom "Tipe" = dropdown Vendor/Internal per baris (bagian panel Jawaban Harga).

**Apakah UI berasumsi cuma ada satu vendor?** Tidak persis — ia me-render **daftar baris** (bukan single value, bukan `[0]`), masing-masing bisa `vendor`/`internal`. Tapi ia **tidak punya konsep identitas vendor** untuk diasumsikan. Tidak ada `VendorPicker`, tidak ada `vendor_id`, tidak ada nama vendor yang ditampilkan. `PRFFormPage.jsx`: `grep vendor` = nihil (tidak ada vendor saat PRF dibuat). `QuotationDetailPage`/`QuotationPDF`: tidak ada kolom vendor (quotation_items tak punya vendor). Master `vendors` sama sekali tidak dibaca di modul procurement.

### 6. HILIR — PRF → quotation, info vendor terbawa atau hilang?

**Hilang total, dan bahkan klasifikasi vendor/internal ikut pipih.** Saat "Buat Quotation dari PRF" (batch 20 Jul):
- `PRFDetailPage.jsx:107` — `totalModal = rows.reduce((s, r) => s + num(r.amount), 0)` — menjumlahkan **SEMUA** baris biaya, `vendor` **dan** `internal` digabung.
- `PRFDetailPage.jsx:184-191` — payload prefill ke quotation membawa `cost_total: totalModal` (satu angka gabungan) + `suggested_rate`, `rate_currency`, `valid_until`, `inquiry_id`, `prf_id`. **Tidak ada informasi vendor** (tidak ada, memang).
- Di quotation, `cost_total` masuk sebagai `cost_price` di **satu** baris item generik `Jasa <layanan>`. Jadi rincian per-komponen + label vendor/internal **runtuh jadi satu angka modal**.

**Kalau nanti ada tiga vendor, apa yang terjadi di quotation dengan kode sekarang?** Ketiga vendor (yang bagaimanapun tidak tersimpan sebagai identitas) akan **tetap runtuh jadi satu `cost_total`**. Tidak ada tempat di `quotations`/`quotation_items` (`schema:4121-4189`) untuk menyimpan siapa vendornya. Quotation akan tampak persis sama entah dari 1 atau 3 vendor. Attribusi vendor = mustahil di hilir tanpa perubahan skema. (Catatan risiko internal: menggabung `internal` ke dalam `cost_price` quotation berpotensi salah basis margin — lihat Temuan MEDIUM.)

### 7. AWARD — ada konsep "vendor terpilih / menang / award"?

**TIDAK ADA.** Di mana pun — bukan di skema (`grep award|winner|selected_vendor|pemenang` = nihil), bukan di UI procurement/quotation, bukan sebagai dead code. Tidak ada kolom status vendor, tidak ada flag `is_awarded`, tidak ada tabel penawaran untuk dibandingkan lalu dipilih. Konsep "bandingkan penawaran beberapa vendor lalu pilih pemenang" — yang jadi inti nilai multi-vendor — **belum ada fondasinya sama sekali**.

---

## TEMUAN

### [HIGH] Tidak ada entitas vendor di rantai PRF — multi-vendor = greenfield, bukan modifikasi
`prf` (`schema:3824`) & `prf_cost_items` (`schema:3893`) tanpa kolom/FK vendor; nol `REFERENCES public.vendors` di seluruh skema.
**Dampak:** kemampuan ">1 vendor per PRF" tidak bisa dicapai dengan melonggarkan yang ada — harus dibangun dari nol (tabel attribusi/penawaran, FK, UI, award). Setiap estimasi batch yang mengira ini "tweak" akan meleset besar.
**Rekomendasi:** perlakukan sebagai fitur baru bertahap. Putuskan dulu bentuk (Opsi A/B/C di bawah) sebelum menyentuh kode.

### [HIGH] Master `vendors` yatim — dipakai membangun multi-vendor berarti menghidupkan tabel mati + kena TD-47
`vendors` (`schema:4870`) nol FK masuk; satu-satunya pembaca FE = `PenerimaanBarangPage.jsx:332` (inventory, bukan procurement). RLS-nya memakai role legacy (`vendors_update` menyebut `procurement_head`/`procurement_staff`, `schema:12586`) yang tidak sinkron dengan taksonomi role aktif (`procurement`) — ini **TD-47** yang sudah tercatat.
**Dampak:** menyambungkan PRF ke `vendors` akan segera memunculkan masalah RLS (siapa boleh pilih/baca vendor) + scope per-entitas yang belum teruji runtime (0 baris data vendor kemungkinan besar).
**Rekomendasi:** audit + perbaiki RLS `vendors` (TD-47) sebagai prasyarat, dan seed minimal data vendor untuk uji.

> ### ⚠️ KOREKSI (21 Jul 2026, doc-keeper) — temuan di atas MENGECILKAN masalah
> Isi audit di atas **sengaja dibiarkan apa adanya sebagai arsip**. Dua hal harus diluruskan:
>
> **1. Jumlah policy bermasalah: BUKAN satu/tiga — ada LIMA policy, dan yang paling berbahaya TIDAK disebut.**
> Audit ini hanya menamai **`vendors_update`** (role legacy) sebagai cacat RLS. Kondisi sebenarnya: tabel `vendors` punya **LIMA policy tumpang tindih** — `vendors_select`, `vendors_read`, `vendors_insert`, `vendors_update`, `vendors_modify`.
> Yang **luput sepenuhnya** = **`vendors_insert`**, dan justru **itu yang paling berbahaya dari kelimanya**:
> `vendors_insert WITH CHECK (auth.uid() IS NOT NULL)` — **tanpa cek role, tanpa cek company**. Artinya **user terautentikasi APA PUN, role apa pun, bisa menyisipkan vendor ke company MANA PUN.** Ini cacat tulis lintas-entitas, jauh lebih berat daripada "role legacy yang kotor" yang jadi fokus audit.
>
> **2. Klaim "read vendor per-entitas" (lihat juga baris §Pertanyaan "Per entitas atau global?") TIDAK AKURAT.**
> Secara **struktur** memang per-entitas (`company_id NOT NULL` + `UNIQUE(company_id, code)`) — itu benar. Tapi secara **RLS efektif TIDAK**: `vendors_select USING(true)` **tanpa klausa `TO`** meng-OR-kan dirinya dengan `vendors_read` yang company-scoped (policy permissive di PostgreSQL digabung dengan OR) → **`USING(true)` menang** → **read bocor lintas entitas antar user yang login** (user MSI bisa membaca vendor SOA).
> **Catatan akurat yang penting:** **`anon` TIDAK terdampak** — role `anon` tidak punya GRANT ke tabel ini. Jadi ini **bocor antar-user-login, BUKAN bocor publik/anonim**. Jangan naikkan severity melebihi faktanya.
>
> **Status: kedua cacat SUDAH DITUTUP.** Migrasi `supabase/migrations/20260721000000_vendors_rls_overhaul.sql` (**sudah dijalankan & LIVE**) merombak 5 policy → **4** (`vendors_select`/`vendors_insert`/`vendors_update`/`vendors_delete`), semua `TO authenticated`, company-scoped, role gate `is_manager_or_above() OR has_role('procurement')`, super admin bypass, **DELETE super admin only** → **TD-47 RESOLVED**.
> Konsekuensinya untuk audit ini: **"perbaiki RLS `vendors` sebagai prasyarat" sudah TERPENUHI** — prasyarat itu bukan lagi penghalang untuk pekerjaan multi-vendor. Yang **masih berlaku** dari rekomendasi di atas: **seed minimal data vendor untuk uji** (tabel kemungkinan besar masih 0 baris, belum teruji runtime).
> Rujukan: `docs/Governance/03_DATA_MODEL.md` §Foundation entri `vendors` + `docs/Governance/08_TECH_DEBT.md` **TD-47**.

### [MEDIUM] `cost_type` adalah klasifikasi, bukan identitas — atribusi vendor mustahil bahkan untuk 1 vendor
`prf_cost_items.cost_type ∈ {vendor, internal}` (`schema:3904`) tanpa `vendor_id`. Nama vendor hanya bisa "nyelip" di `component`/`notes` (text bebas).
**Dampak:** tidak bisa menjawab "biaya ini dari vendor mana", tidak bisa agregasi per vendor, tidak bisa bandingkan penawaran. Data historis PRF tidak menyimpan identitas vendor → backfill multi-vendor tidak punya sumber kebenaran (harus manual).
**Rekomendasi:** kalau butuh atribusi, tambah kolom/tabel vendor terstruktur; jangan andalkan text bebas.

### [MEDIUM] PRF → quotation memipihkan vendor+internal jadi satu `cost_total` (basis margin bisa keliru)
`PRFDetailPage.jsx:107` menjumlah semua baris (vendor+internal) → `cost_total` (`:190`) → `cost_price` satu baris quotation.
**Dampak:** `cost_price` quotation (dipakai hitung margin internal) mencampur biaya vendor dengan biaya internal. Bergantung definisi bisnis "modal", ini bisa menggelembungkan/mengempiskan margin yang tampil ke internal. **Bukan** customer-facing (cost_price tidak dicetak ke customer; `suggested_rate` yang jadi harga jual), jadi bukan CRITICAL — tapi angka margin internal bisa menyesatkan pengambilan keputusan.
**Rekomendasi:** putuskan apakah `cost_price` quotation = hanya biaya vendor, atau vendor+internal; dokumentasikan; sesuaikan reduce.

### [MEDIUM] Rantai `rate_sheets → PRF → quotation` tidak eksis — asumsi scope keliru
`rate_sheets` (`schema:4210`) = fitur CRM Rate List standalone (`RateListPage.jsx`), freeform jsonb, tanpa kolom vendor, tanpa FK ke PRF/quotation. Tidak dibaca di procurement.
**Dampak:** kalau desain multi-vendor mengandalkan "tarik rate dari rate_sheets per vendor", itu membangun jembatan yang belum ada + `rate_sheets` bahkan tak tahu vendor. Plus RLS `rate_sheets` bocor lintas-entitas (**TD-55**, `03_DATA_MODEL.md:41`).
**Rekomendasi:** jangan jadikan `rate_sheets` sumber rate vendor tanpa redesign; ia lebih cocok tetap sebagai brosur tarif sales.

### [MEDIUM] Tidak ada konsep award/vendor terpilih — inti nilai multi-vendor belum berfondasi
Nihil di skema & kode (lihat Q7).
**Dampak:** multi-vendor tanpa "pilih pemenang" hanya jadi tempat menumpuk penawaran tanpa keputusan. Fitur setengah jadi kalau award tidak ikut dirancang.
**Rekomendasi:** masukkan status/award ke desain sejak awal (mana penawaran yang jadi dasar quotation).

### [LOW] Dokumentasi jujur tapi menyiratkan kesiapan yang belum ada
`03_DATA_MODEL.md:71` benar ("PR/PO belum dibangun"), dan `05_WORKFLOW_MAP.md:323/350/352` mendeskripsikan `cost_type vendor/internal` dengan akurat sebagai klasifikasi. Tidak ada mismatch doc↔skema yang menyesatkan.
**Dampak:** rendah; hanya perlu waspada bahwa "vendor" di dokumen = klasifikasi biaya, bukan entitas.
**Rekomendasi:** saat merancang multi-vendor, tambahkan catatan eksplisit di `03_DATA_MODEL` bahwa vendor identity belum ada.

---

## PETA DAMPAK — kalau PRF diubah bisa menampung banyak vendor

### WAJIB berubah
| Area | Item | Alasan |
|---|---|---|
| DB skema | Tabel/kolom baru untuk penawaran/attribusi vendor + FK ke `vendors` | Tidak ada tempat menyimpan identitas vendor sekarang |
| DB skema | Kolom/tabel "award / vendor terpilih" | Multi-vendor butuh keputusan pemenang (tidak ada) |
| DB RLS | Policy untuk tabel penawaran vendor baru (turunkan dari `prf` seperti `prf_cost_items`) | Konsistensi akses procurement/sales |
| DB RLS | Perbaiki RLS `vendors` (TD-47, role legacy `procurement_head/staff`) | Vendor akan dibaca/dipilih di UI |
| FE | `PRFDetailPage.jsx` (406 baris) — panel Jawaban Harga jadi per-vendor + pemilihan vendor + pilih award | Titik utama input harga |
| FE | `PRFDetailPage.jsx` `handleCreateQuotation` (`:184`) + `totalModal` (`:107`) — sumber `cost_total` harus dari vendor terpilih, bukan Σ semua | Hilir quotation |
| FE | `QuotationFormPage.jsx` prefill (efek `prefillFromPrf`) — terima info vendor terpilih | Bawa vendor ke hilir (kalau diinginkan) |
| FE | Master vendor picker (komponen baru) + hook `useVendors` (belum ada) | `from('vendors')` belum pernah dipakai di procurement |
| Migrasi | File migrasi + refresh `schema_snapshot.sql` (pg_dump) | Konvensi wajib repo |

### MUNGKIN berubah (tergantung keputusan desain)
| Area | Item | Kapan perlu |
|---|---|---|
| DB | `quotations`/`quotation_items` +kolom vendor | Kalau vendor harus terlihat di quotation/hilir |
| FE | `QuotationDetailPage.jsx` / `QuotationPDF.jsx` | Kalau vendor ditampilkan/dicetak (hati-hati: jangan bocor ke customer) |
| FE | `ProcInquiryForwardingPage.jsx` (127 baris) — list PRF +indikator jumlah vendor/award | Kalau list perlu status |
| DB | `rate_sheets` +dimensi vendor **atau** tabel rate vendor baru | Kalau rate vendor mau ditarik otomatis (bukan input manual) |
| DB | `prf.status` +nilai baru (mis. `AWARDED`) | Kalau award mengubah status PRF (kaitan TD-109) |

### TIDAK TERSENTUH
| Area | Alasan |
|---|---|
| `PRFFormPage.jsx` (764 baris) | Pembuatan PRF oleh sales tak menyentuh vendor (vendor muncul di tahap jawaban harga procurement) |
| Trigger `trg_quotation_prf_consistency` | Menjaga `prf_id↔inquiry_id`, ortogonal terhadap vendor |
| Numbering (`increment_document_sequence`) | Tidak terkait vendor |
| Modul CRM inti (pipeline/inquiry/customer) | Di luar jalur vendor PRF |
| `PenerimaanBarangPage.jsx` (satu-satunya pembaca `vendors`) | Konteks inventory, terpisah — jangan ikut diubah |

---

## OPSI STRUKTUR — evaluasi terhadap kode yang ADA

Ketiga opsi mengasumsikan fakta inti: **hari ini nol pemodelan vendor**, jadi ketiganya sama-sama "menambah", bukan "mengubah model 1-vendor".

### A. Satu PRF = satu vendor, banyak PRF digrup per inquiry
- **Tabel berubah:** minimal. Tambah `prf.vendor_id uuid → vendors(id)` (1 kolom) + index. Grup per inquiry sudah ada gratis (`prf.inquiry_id`, `schema:3877` — banyak PRF boleh menunjuk 1 inquiry; tak ada unique yang melarang, sudah dikonfirmasi di audit sebelumnya).
- **File UI kesentuh:** sedang. `PRFFormPage`/`PRFDetailPage` +vendor picker; `ProcInquiryForwardingPage` +tampil vendor per PRF; view "PRF per inquiry" untuk membandingkan (sudah setengah ada via list).
- **Yang rusak:** paling sedikit. Tidak memecah `prf_cost_items`. `cost_type vendor/internal` tetap berarti (rincian dalam satu vendor). Award = "pilih PRF mana yang jadi dasar quotation" (sudah mirip alur "Buat Quotation dari PRF" yang ada — tinggal ditegaskan).
- **Backfill:** aman. PRF lama = 1 PRF tanpa vendor_id (null) → tetap valid; tak ada info hilang (memang tak pernah ada info vendor). Grup per inquiry otomatis.
- **Catatan jujur:** paling selaras dengan kode sekarang (alur "banyak PRF per inquiry" + "Buat Quotation dari PRF" sudah eksis). Kelemahan: membandingkan vendor = membandingkan antar-PRF (UX kurang ringkas), dan tetap butuh `vendor_id` + award ringan.

### B. Tabel baru penawaran vendor, satu baris per vendor per item
- **Tabel berubah:** banyak. Tabel baru mis. `prf_vendor_quotes` (prf_id, vendor_id, ...) + kemungkinan `prf_vendor_quote_items` (per item per vendor) + kolom award. `prf_cost_items` yang ada jadi tumpang tindih/ perlu dimigrasi ke struktur baru atau dipensiun.
- **File UI kesentuh:** paling banyak. `PRFDetailPage` di-rombak jadi matriks vendor×item + pemilihan pemenang; `handleCreateQuotation` ambil dari penawaran terpilih; RLS 4-policy tabel baru.
- **Yang rusak:** `prf_cost_items` existing (rincian jawaban harga 20 Jul) harus dipetakan — data cost build-up yang sudah masuk bisa jadi tak punya `vendor_id` untuk dipindah (semua ke "vendor tak dikenal").
- **Backfill:** paling berisiko kehilangan struktur — baris `prf_cost_items` lama tak punya identitas vendor, jadi masuk sebagai 1 penawaran "unknown vendor". Amount tetap, tapi granularitas per-vendor untuk data lama = fiktif.
- **Catatan jujur:** paling "benar" untuk procurement sungguhan (bandingkan penawaran, award, audit trail), tapi batch terbesar dan paling mengganggu pekerjaan `prf_cost_items` yang baru saja dibangun (20 Jul). Layak hanya kalau multi-vendor comparison memang tujuan bisnis inti.

### C. Vendor per baris item di `prf_cost_items`
- **Tabel berubah:** kecil-sedang. Tambah `prf_cost_items.vendor_id uuid → vendors(id)` (nullable) + index. Tidak ada tabel baru.
- **File UI kesentuh:** sedang. `PRFDetailPage` panel Jawaban Harga +kolom vendor per baris (dropdown vendor). `handleCreateQuotation`/`totalModal` perlu logika: gabung per vendor? pilih vendor mana?
- **Yang rusak:** semantik `totalModal` (`:107`) ambigu — "total modal" jadi campuran multi-vendor; margin per vendor tak terdefinisi tanpa aturan tambahan. Award tidak natural (award itu per-penawaran, bukan per-baris).
- **Backfill:** aman secara kolom (baris lama `vendor_id=null`), tapi tak menyelesaikan "penawaran mana yang menang" (tak ada konsep penawaran, hanya baris).
- **Catatan jujur:** murah di DB tapi menimbulkan kebingungan konseptual: satu PRF dengan baris-baris dari beberapa vendor bukan "beberapa penawaran untuk dibandingkan", melainkan "satu cost build-up campur vendor". Cocok kalau realitanya memang "satu paket harga dirakit dari beberapa vendor sekaligus" (bukan tender). Tidak cocok kalau tujuannya membandingkan & memilih vendor.

**Rangkuman rekomendasi auditor (bukan keputusan):** kalau tujuannya **membandingkan penawaran & pilih pemenang** → B (mahal tapi benar). Kalau tujuannya **cepat & selaras kode sekarang** dengan vendor sebagai atribut → A (paling kecil risiko, paling nyambung ke alur "banyak PRF per inquiry" + "Buat Quotation dari PRF" yang sudah ada). C hanya kalau realitanya "satu harga dirakit lintas vendor" tanpa kebutuhan award. Semua butuh perbaikan RLS `vendors` (TD-47) lebih dulu.

---

## SQL PEMERIKSAAN DATA (jalankan manual — read-only)

> ⚠️ **Penting & jujur:** "jumlah vendor per PRF" **tidak bisa dihitung akurat** karena tidak ada `vendor_id` di mana pun. Query di bawah adalah **proxy** — mereka mengukur baris biaya per PRF dan sebaran `cost_type`, plus mendeteksi apakah ada nama vendor "nyelip" di text bebas. Angka "vendor per PRF" yang sebenarnya = **tidak terdefinisi by design**.

```sql
-- 0. Konfirmasi struktural: benarkah tak ada kolom vendor di rantai PRF?
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('prf','prf_cost_items','rate_sheets','quotations','quotation_items')
  AND (column_name ILIKE '%vendor%')
ORDER BY 1,2;   -- Ekspektasi: 0 baris (hanya prf_cost_items.cost_type yang 'vendor' sbg NILAI, bukan kolom)

-- 1. Berapa PRF ada (hidup), per entitas + status
SELECT c.code AS entity, p.status, COUNT(*) AS n
FROM public.prf p JOIN public.companies c ON c.id = p.company_id
WHERE p.deleted_at IS NULL
GROUP BY ROLLUP (c.code, p.status)
ORDER BY 1,2;

-- 2. Berapa PRF yang sudah punya rincian biaya (prf_cost_items), dan berapa yang belum
SELECT
  COUNT(*) FILTER (WHERE ci.n IS NOT NULL AND ci.n > 0) AS prf_dengan_rincian,
  COUNT(*) FILTER (WHERE ci.n IS NULL OR ci.n = 0)      AS prf_tanpa_rincian,
  COUNT(*)                                              AS total_prf
FROM public.prf p
LEFT JOIN (
  SELECT prf_id, COUNT(*) AS n
  FROM public.prf_cost_items GROUP BY prf_id
) ci ON ci.prf_id = p.id
WHERE p.deleted_at IS NULL;

-- 3. Sebaran cost_type per PRF (proxy 'vendor vs internal' — BUKAN jumlah vendor unik)
SELECT
  p.prf_no,
  COUNT(*) FILTER (WHERE ci.cost_type = 'vendor')   AS baris_vendor,
  COUNT(*) FILTER (WHERE ci.cost_type = 'internal') AS baris_internal,
  COUNT(*)                                          AS total_baris
FROM public.prf p
JOIN public.prf_cost_items ci ON ci.prf_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.prf_no
ORDER BY total_baris DESC;

-- 4. Adakah PRF yang de facto menyentuh >1 "sumber biaya"? (proxy paling dekat:
--    PRF dengan >1 baris cost_type='vendor' — TAPI ini bisa jadi 1 vendor banyak komponen,
--    TIDAK membuktikan >1 vendor. Interpretasikan hati-hati.)
SELECT COUNT(*) AS prf_dengan_banyak_baris_vendor
FROM (
  SELECT ci.prf_id
  FROM public.prf_cost_items ci
  JOIN public.prf p ON p.id = ci.prf_id AND p.deleted_at IS NULL
  WHERE ci.cost_type = 'vendor'
  GROUP BY ci.prf_id
  HAVING COUNT(*) > 1
) t;

-- 5. Deteksi nama vendor 'nyelip' di text bebas (component/notes) — apakah user
--    sudah terpaksa mencatat vendor secara manual? (indikasi kebutuhan riil)
SELECT p.prf_no, ci.component, ci.notes, ci.cost_type, ci.amount, ci.currency
FROM public.prf_cost_items ci
JOIN public.prf p ON p.id = ci.prf_id AND p.deleted_at IS NULL
WHERE ci.cost_type = 'vendor'
  AND (ci.notes IS NOT NULL AND btrim(ci.notes) <> '')
ORDER BY p.prf_no, ci.sort_order;

-- 6. Apakah master vendors terisi sama sekali? (kesiapan seed untuk multi-vendor)
SELECT c.code AS entity, COUNT(*) FILTER (WHERE v.deleted_at IS NULL) AS vendor_aktif
FROM public.companies c
LEFT JOIN public.vendors v ON v.company_id = c.id
GROUP BY c.code ORDER BY 1;

-- 7. Konfirmasi: adakah quotation yang berasal dari PRF (prf_id terisi)?
--    (hilir — untuk cek apakah ada data nyata yang akan terdampak perubahan prefill)
SELECT COUNT(*) FILTER (WHERE prf_id IS NOT NULL) AS quotation_dari_prf,
       COUNT(*)                                   AS total_quotation
FROM public.quotations WHERE deleted_at IS NULL;
```

---

*Akhir laporan. Tidak ada perbaikan yang dimulai; tidak ada file selain dokumen ini yang dibuat/diubah.*
