# AUDIT — Kelengkapan Field Layar Detail PRF (untuk pembaca Procurement)

> **Mode: AUDIT MURNI, READ-ONLY.** Tidak ada kode/DB yang diubah. `AUDIT_PRF_FIELDS.md` adalah satu-satunya file yang dibuat di sesi ini.
> **Scope: SEMPIT dan spesifik** — bukan pengulangan `AUDIT_PRF.md` (audit menyeluruh alur/keamanan/RLS PRF, sudah selesai). Audit ini HANYA menjawab: begitu RLS `accounts`/`inquiries` dibuka untuk role `procurement` (sedang dikerjakan terpisah, diasumsikan AKAN tersedia), **apakah layar Detail PRF sudah menampilkan data yang benar dan lengkap?**
> **Tanggal:** 2026-07-27 · **Branch:** `feat/akun-merge` (HEAD `2ae1c5e`).
> **Sumber:** `src/modules/procurement/PRFFormPage.jsx`, `PRFDetailPage.jsx`; `src/modules/crm/DealDetailPage.jsx`, `DealPanels.jsx`, `CustomerDetailPage.jsx` (untuk perbandingan); `supabase/schema_snapshot.sql` (tabel `prf`, `inquiries`, `accounts`, `contacts`, `payment_terms`).
> **Batasan jujur:** Nol akses DB langsung — semua klaim "field ini kosong di data nyata" HARUS diverifikasi lewat SQL di bagian khusus, bukan tebakan. Semua nomor baris (`file:line`) diverifikasi lewat pembacaan kode/grep langsung pada commit ini.

---

## RINGKASAN

**Tabel `prf`: 64 kolom total.** Di-`SELECT` oleh `PRFDetailPage.jsx:54` (`PRF_SELECT`): 29 kolom skalar + 2 relasi ter-embed (`account.name`, `inquiry.inquiry_no`). Dari 29 kolom yang di-select, **25 benar-benar dirender** ke layar dalam bentuk apa pun (grid ringkasan, header, atau panel Jawaban Harga); **2 di-select tapi tidak pernah dirender** (`customer_source`, `inquiry_id` — yang terakhir dipakai sebagai FK untuk query lain, bukan ditampilkan sebagai nilai). **37 kolom tidak pernah di-select sama sekali** — termasuk **SELURUH 19 kolom Section 03 "Detail Layanan"** (spesifikasi kargo per moda: kontainer, berat, dimensi, volume, armada, tipe freight), **tiga kolom keselamatan Dangerous Goods** (`msds_available`, `un_number`, `imo_class`), dan **tiga kolom niaga** (`commercial_value`, `commercial_currency`, `add_on_others`). **Ringkas: dari 64 kolom, hanya 25 (≈39%) yang benar-benar sampai ke mata procurement.**

**Tabel `inquiries`: 35 kolom total.** Dari situ, **11 kolom** disalin ke PRF saat create lewat `applyInquiryData` (`PRFFormPage.jsx:104-123`) — dan penyalinan ini SATU KALI SAJA, saat form dibuka (baik lewat picker dropdown maupun prefill dari tombol "Cetak PRF"); tidak ada re-sync setelahnya. **24 kolom TIDAK PERNAH disalin ke PRF DAN TIDAK PERNAH di-fetch ulang secara live oleh `PRFDetailPage`** (yang hanya meng-embed `inquiry_no`, satu kolom, dari seluruh tabel `inquiries`). Empat di antara 24 kolom yang hilang ini — `weight_kg`, `volume_cbm`, `container_types`, `cargo_types` — justru **DITAMPILKAN** di dua layar setara lain di aplikasi yang sama (`DealDetailPage.jsx`, `CustomerDetailPage.jsx`'s `InquiryDetailBlock`) untuk kasus penggunaan yang JAUH kurang butuh data itu (sales melihat status deal) dibanding procurement (yang harus MENENTUKAN HARGA berdasarkan berat/volume/kontainer itu).

**Data customer/kontak: nol.** `PRFDetailPage` hanya menampilkan satu string — nama akun (`account.name`, via embed FK `prf_account_id_fkey`). Tidak ada kode, alamat, NPWP (`tax_id`), telepon, email, atau kontak PIC apa pun. Yang paling tajam: **modul PRF tidak menyentuh tabel `contacts` sama sekali** (dikonfirmasi grep menyeluruh — nol hit) padahal `contacts` sudah jadi sumber kebenaran PIC di seluruh CRM sejak 26 Jul 2026 dan sudah punya pola pemakaian yang matang serta reusable persis di sebelah — `CustomerDetailPage.jsx:769-778`.

**Penilaian jujur:** Layar ini, hari ini, adalah layar "penawaran harga generik" — ia menampilkan rute, incoterm, dan tanggal, tapi TIDAK menampilkan **satu pun** angka yang menentukan biaya aktual pengiriman (berat, volume, jumlah & tipe kontainer, armada) dan TIDAK memberi procurement cara apa pun untuk tahu siapa yang harus dihubungi kalau ada pertanyaan (baik salesperson pembuat PRF maupun PIC customer). Ini bukan kekurangan kosmetik — ini berarti procurement HARUS keluar dari layar ini (membuka Detail Inquiry di tab lain, atau bertanya langsung ke sales) untuk mendapatkan informasi yang seharusnya jadi alasan utama layar ini ada. Mengingat "latar yang sudah diputuskan" secara eksplisit menyebut RLS `accounts`/`inquiries` SEDANG dibuka untuk procurement — pekerjaan itu akan sia-sia sebagian besar kalau layarnya sendiri tidak ikut diperluas untuk memakai data yang baru akan bisa dibaca itu. Membuka RLS tanpa memperluas query+render adalah pekerjaan setengah jalan yang tidak akan terasa oleh siapa pun.

---

## TABEL KOLOM `prf`

Legenda kolom "Tampil?": **Ya** = nilainya muncul di layar dalam bentuk apa pun · **Tidak (select)** = di-select tapi tak pernah dirender · **Tidak (nol)** = tidak pernah di-select sama sekali.

| # | Kolom | Tipe | Tampil di Detail? | file:line | Butuh procurement? |
|---|---|---|---|---|---|
| 1 | `id` | uuid | Tidak (nol, dipakai internal) | — | Tidak — id internal, bukan info bisnis. |
| 2 | `company_id` | uuid | Tidak (nol) | — | Tidak — konteks entitas sudah tersirat dari akses menu, tak perlu ditampilkan literal. |
| 3 | `prf_no` | text | **Ya** | `PRFDetailPage.jsx:487` (H1) | Ya — identitas dokumen. |
| 4 | `status` | varchar | **Ya** | `:488` | Ya — tahu status alur. |
| 5 | `created_by` | uuid | Tidak (nol) | — | **Ya** — sales pembuat PRF adalah kontak pertama kalau procurement butuh klarifikasi. Bandingkan `DealDetailPage.jsx:449` yang menampilkan "Dibuat Oleh" untuk inquiry. |
| 6 | `updated_by` | uuid | Tidak (nol) | — | Tidak — audit trail, bukan info kerja harian. |
| 7 | `submitted_at` | timestamptz | Tidak (nol) | — | Sebagian — `created_at` sudah tampil sebagai proksi; `submitted_at` beda hanya kalau PRF sempat DRAFT lama sebelum submit (jarang, karena create-only). PERLU KONFIRMASI DEN apakah bedanya cukup penting untuk ditampilkan terpisah. |
| 8 | `acknowledged_by` | uuid | Tidak (nol) | — | Tidak — kolom mati (tak pernah ditulis kode mana pun, lihat `AUDIT_PRF.md`). |
| 9 | `acknowledged_at` | timestamptz | Tidak (nol) | — | Tidak — sama, kolom mati. |
| 10 | `created_at` | timestamptz | **Ya** | `:488` (label "dibuat") | Ya. |
| 11 | `updated_at` | timestamptz | Tidak (nol) | — | Tidak — tak krusial untuk pricing. |
| 12 | `deleted_at` | timestamptz | (dipakai filter `.is(...,null)`, bukan data) | `:83` | Tidak — soft-delete flag, bukan info bisnis. |
| 13 | `customer_source` | text | **Tidak (select)** | select `:54`, tak pernah dirender | Tidak — nilainya selalu `'inquiry'` sejak keputusan 19 Jul 2026 (PRF hanya lahir dari inquiry), jadi menampilkannya tak menambah info. Layak dihapus dari SELECT (dead fetch). |
| 14 | `account_id` | uuid | Tidak (nol, hanya jadi jalur embed) | — | Tidak langsung — tapi lihat baris kolom `accounts`/`contacts` di bawah: `account_id` adalah kunci yang seharusnya dipakai untuk menarik JAUH lebih banyak data customer yang procurement butuh. |
| 15 | `account_name_manual` | text | **Ya** (fallback) | `:351` (`const customer = prf.account?.name \|\| prf.account_name_manual \|\| '—'`) | Ya — sudah benar dipakai sbg fallback. |
| 16 | `stream` | text | **Ya** | summary `:383` | Sebagian — kategori pelaporan internal sales, kegunaan langsung untuk pricing tipis, tapi tak salah ditampilkan. |
| 17 | `deadline_quotation` | date | **Ya** | `:384` | **Ya, penting** — SLA kapan harga harus keluar. |
| 18 | `direction` | text | **Ya** | `:375` | Ya — import/export/domestic menentukan kebutuhan dokumen. |
| 19 | `commodity` | text | **Ya** | `:376` | Ya — kategori kargo mempengaruhi vendor yang relevan. |
| 20 | `hs_code` | text | **Ya** | `:377` | Ya — untuk kutipan bea/kepabeanan bila relevan. |
| 21 | `msds_available` | boolean | **Tidak (nol)** | — | **Ya, kritis untuk DG** — kalau `commodity='dg'`, procurement wajib tahu apakah MSDS sudah tersedia sebelum menghubungi vendor DG-capable. Lihat Temuan §"Selalu Kosong". |
| 22 | `service_type` | text | **Ya** | `:374` (label via `SERVICE_LABEL`) | Ya — moda transport (sea/air/inland/project/custom), penentu jenis vendor. |
| 23 | `incoterms` | text | **Ya** | `:378` | Ya — menentukan siapa menanggung leg mana. |
| 24 | `commercial_value` | numeric | **Tidak (nol)** | — | Sebagian — relevan untuk incoterm CIF/CIP/DDP (nilai pabean); PERLU KONFIRMASI DEN apakah procurement butuh angka ini atau itu murni domain finance/customs broker di hilir. |
| 25 | `commercial_currency` | text | **Tidak (nol)** | — | Sama seperti di atas — pasangan `commercial_value`. |
| 26 | `origin` | text | **Ya** | `:379` | Ya. |
| 27 | `destination` | text | **Ya** | `:380` | Ya. |
| 28 | `pickup_address` | text | **Ya** | `:381` | Ya — alamat fisik untuk estimasi biaya trucking/handling. |
| 29 | `delivery_address` | text | **Ya** | `:382` | Ya. |
| 30 | `add_on_services` | text[] | **Ya** | `:386` | Ya — layanan tambahan yang perlu di-quote vendor terpisah. |
| 31 | `add_on_others` | text | **Tidak (nol)** | — | **Ya** — kalau `add_on_services` memuat `'others'`, teks bebas penjelasnya TIDAK ditampilkan sama sekali; badge "Others" muncul tanpa detail apa isinya. |
| 32 | `cargo_ready_date` | date | **Ya** | `:385` | Ya. |
| 33 | `sea_freight_type` | text | **Tidak (nol)** | — | **Ya, kritis** — FCL vs LCL adalah keputusan struktur biaya paling dasar untuk moda Sea. |
| 34 | `sea_container_types` | text[] | **Tidak (nol)** | — | **Ya, kritis untuk FCL** — vendor container shipping butuh tahu tipe kontainer utk quote. |
| 35 | `sea_container_qty` | jsonb | **Tidak (nol)** | — | **Ya, kritis untuk FCL** — jumlah per tipe kontainer = variabel harga utama Sea FCL. |
| 36 | `sea_lcl_gw` | numeric | **Tidak (nol)** | — | **Ya, kritis untuk LCL** — berat kotor dasar tarif LCL. |
| 37 | `sea_lcl_dimension` | text | **Tidak (nol)** | — | **Ya untuk LCL** — dimensi menentukan volumetric weight. |
| 38 | `sea_lcl_volume` | numeric | **Tidak (nol)** | — | **Ya, kritis untuk LCL** — CBM adalah basis tarif LCL. |
| 39 | `sea_lcl_koli` | integer | **Tidak (nol)** | — | Ya — jumlah koli relevan utk handling cost. |
| 40 | `air_gw` | numeric | **Tidak (nol)** | — | **Ya, kritis untuk Air** — dasar tarif air freight. |
| 41 | `air_dimension` | text | **Tidak (nol)** | — | **Ya untuk Air** — dimensi → volumetric weight, sering jadi basis tarif (bukan GW aktual). |
| 42 | `air_volume` | numeric | **Tidak (nol)** | — | Ya. |
| 43 | `air_koli` | integer | **Tidak (nol)** | — | Ya. |
| 44 | `inland_fleet_types` | text[] | **Tidak (nol)** | — | **Ya, kritis untuk Inland** — jenis armada (Blind Van vs Tronton vs Trailer 40ft) adalah variabel harga trucking paling langsung. |
| 45 | `inland_pickup_address` | text | **Tidak (nol)** | — | Ya — TERPISAH dari `pickup_address` Section 02 (rute inland spesifik). |
| 46 | `inland_delivery_address` | text | **Tidak (nol)** | — | Ya, sama alasan. |
| 47 | `inland_gw` | numeric | **Tidak (nol)** | — | Sebagian (field opsional di form sendiri). |
| 48 | `inland_dimension` | text | **Tidak (nol)** | — | Sebagian (opsional). |
| 49 | `custom_doc_type` | text | **Tidak (nol)** | — | Ya untuk moda Custom — PIB/PEB menentukan jenis vendor customs broker. |
| 50 | `project_freight_types` | text[] | **Tidak (nol)** | — | Ya untuk Project — 20'OT/40'OT/RORO/Breakbulk sangat menentukan jenis vendor & alat berat. |
| 51 | `project_qty` | integer | **Tidak (nol)** | — | Ya, sama alasan. |
| 52 | `notes` | text | **Ya** | `:497` (conditional block) | Ya. |
| 53 | `inquiry_id` | uuid | **Tidak (select, FK-only)** | select `:54`, dipakai `:364,373` (bukan ditampilkan sbg field, hanya untuk query & payload) | Tidak sebagai field terpisah — sudah cukup terwakili lewat "Inquiry" (`inquiry.inquiry_no`) yang MEMANG dirender. |
| 54 | `suggested_rate` | numeric | **Ya** | Jawaban Harga panel `:666-669` | Ya — ini output procurement sendiri. |
| 55 | `rate_currency` | text | **Ya** | `:672-677` | Ya. |
| 56 | `valid_from` | date | **Ya** | `:679-683` | Ya. |
| 57 | `valid_until` | date | **Ya** | `:685-689` | Ya. |
| 58 | `pricing_notes` | text | **Ya** | `:692-696` | Ya. |
| 59 | `answered_by` | uuid | **Ya** (resolved ke nama) | `:129-131` (fetch nama), `:506` (render) | Ya. |
| 60 | `answered_at` | timestamptz | **Ya** | `:506` | Ya. |
| 61 | `exchange_rates` | jsonb | **Ya** (via UI tabel kurs) | `:94-98`, `:511-541` | Ya. |
| 62 | `goods_name` | text | **Tidak (nol)** | — | **Ya** — nama barang adalah info paling dasar untuk memilih vendor/handling yang sesuai; sudah ditangkap saat create (`PRFFormPage.jsx:578`) tapi lenyap di layar baca. |
| 63 | `un_number` | text | **Tidak (nol)** | — | **Ya, kritis untuk DG** — UN Number wajib diketahui vendor DG-capable. |
| 64 | `imo_class` | text | **Tidak (nol)** | — | **Ya, kritis untuk DG** — kelas bahaya menentukan vendor & handling yang boleh dipakai. |

**Ringkas per baris di atas:** 25 Ya, 2 Tidak(select-tapi-tak-dirender), 37 Tidak(nol) — dari 37 itu, **19 adalah Section 03 (baris 33-51)** dan **3 adalah DG safety (baris 21, 63, 64)**.

---

## TABEL KOLOM `inquiries`

Legenda "Dibawa ke PRF?": **Ya** = disalin oleh `applyInquiryData` (`PRFFormPage.jsx:104-123`) saat create · **Ya (lossy)** = disalin tapi dengan kehilangan data · **Tidak** = tak pernah disalin.
Legenda "Tampil di Detail PRF?": karena `PRFDetailPage` hanya meng-embed `inquiry_no` dari seluruh tabel `inquiries` (`PRF_SELECT`, `:54`), **jawabannya HAMPIR SELALU "Tidak (nol)"** kecuali dicatat lain — nilai yang tampak tampil sebenarnya berasal dari kolom `prf` sendiri (hasil salinan saat create), BUKAN pembacaan live `inquiries`.

| # | Kolom `inquiries` | Dibawa ke PRF (create)? | Tampil di Detail PRF? | Butuh procurement? |
|---|---|---|---|---|
| 1 | `id` | — (dipakai sbg FK `inquiry_id`) | Tidak langsung (hanya via `inquiry_no`) | — |
| 2 | `company_id` | Tidak | Tidak (nol) | Tidak. |
| 3 | `inquiry_no` | — (bukan disalin, direferensi via `inquiry_id`) | **Ya** (embed) | Ya — identitas dokumen sumber. |
| 4 | `prospect_id` | Ya (dipakai tentukan `account_id`, di luar `applyInquiryData` — lihat `PRFFormPage.jsx:250,298`) | Tidak langsung | — |
| 5 | `customer_id` | Ya (sama seperti di atas) | Tidak langsung | — |
| 6 | `service_type` | **Tidak** (sengaja — TD-108, sumbu beda dari `prf.service_type`) | Tidak (nol) | Sebagian — lini bisnis inquiry (freight_forwarding/customs/trading) beda konsep dari moda `prf.service_type`; bisa jadi konteks tambahan tapi bukan pengganti. PERLU KONFIRMASI DEN. |
| 7 | `route` | **Tidak** | Tidak (nol) | Sebagian — ringkasan rute bebas-teks; `prf.origin`/`destination` sudah menutupi sebagian besar kebutuhan ini. |
| 8 | `estimated_volume` | **Tidak** | Tidak (nol) | Rendah — field lama, PRF sudah punya field volume per-moda sendiri (yang juga tak tampil, lihat Section 03 di tabel atas). |
| 9 | `notes` | **Ya** | **Ya** (via kolom `prf.notes` sendiri) | Ya. |
| 10 | `status` | Tidak (tidak relevan, PRF beda siklus) | Tidak | Tidak. |
| 11 | `created_by` | Tidak | Tidak | Sebagian — lihat catatan `prf.created_by` di tabel atas; nama sales pembuat INQUIRY beda dari pembuat PRF (PRF juga dibuat sales, biasanya orang yang sama, tapi tak dijamin). |
| 12 | `created_at` | Tidak | Tidak | Rendah. |
| 13 | `updated_at` | Tidak | Tidak | Tidak. |
| 14 | `deleted_at` | Tidak | Tidak | Tidak. |
| 15 | `deadline_quote` | **Ya** (→ `deadline_quotation`) | **Ya** (via `prf.deadline_quotation`) | Ya. |
| 16 | `pol` | **Ya** (→ `origin`) | **Ya** (via `prf.origin`) | Ya. |
| 17 | `pod` | **Ya** (→ `destination`) | **Ya** (via `prf.destination`) | Ya. |
| 18 | `incoterms` | **Ya (lossy)** — hanya elemen pertama, dan HANYA bila ada di `INCOTERMS_FULL`; incoterm lain (mis. `CFR/CNF`, `DDU/DAP` versi lama) hilang senyap saat prefill (`PRFFormPage.jsx:120`) | **Ya** (via `prf.incoterms`, tapi mungkin sudah beda dari incoterm asli inquiry kalau lossy) | Ya — tapi lihat catatan kehilangan data. |
| 19 | `container_types` | **Tidak** | Tidak (nol) | **Ya** — ini KONSEP YANG SAMA dengan `prf.sea_container_types` (Section 03), tapi tak pernah dipetakan; sales harus mengetik ulang dari nol walau datanya sudah ada di inquiry. |
| 20 | `goods_name` | **Ya** | **Tidak (nol di layar, walau ADA di kolom `prf.goods_name`)** — lihat baris 62 tabel `prf` di atas: disalin saat create tapi tak pernah dirender. | Ya. |
| 21 | `hs_code` | **Ya** | **Ya** (via `prf.hs_code`) | Ya. |
| 22 | `weight_kg` | **Tidak** | Tidak (nol) | **Ya, kritis** — berat total inquiry; `prf` tak punya field berat umum (hanya per-moda: `sea_lcl_gw`/`air_gw`/`inland_gw`, yang JUGA tak ditampilkan). |
| 23 | `volume_cbm` | **Tidak** | Tidak (nol) | **Ya, kritis** — sama alasan, CBM total. |
| 24 | `cargo_types` | **Tidak** (hanya jadi teks bantu saat create: "Dari inquiry: X — pilih commodity sesuai", `PRFFormPage.jsx:572`) | Tidak (nol) | Ya — kategori kargo asli dari sisi sales (bisa beda granularitas dari `prf.commodity`). |
| 25 | `un_number` | **Ya** | **Tidak (nol di layar)** — sama seperti `goods_name`, disalin tapi kolom `prf.un_number` tak dirender. | Ya, kritis DG. |
| 26 | `imo_class` | **Ya** | **Tidak (nol di layar)** — sama. | Ya, kritis DG. |
| 27 | `has_msds` | **Tidak** (`prf.msds_available` adalah checkbox terpisah yang harus dicentang ULANG manual, tak diwarisi dari `inquiries.has_msds`) | Tidak (nol) | **Ya, kritis** — kalau inquiry sudah mencatat MSDS tersedia, PRF idealnya mewarisi info itu, bukan minta sales mengulang. Catatan: `has_msds` bertipe `text` di `inquiries` (bukan boolean) — ketidaksesuaian tipe kemungkinan alasan kenapa tak pernah dipetakan. |
| 28 | `additional_services` | **Tidak** (hanya teks bantu create: "Dari inquiry: X — centang manual", `PRFFormPage.jsx:681`) | Tidak (nol) | Sebagian — kosakata beda dari `prf.add_on_services` (TD-107), tapi info aslinya tetap berguna sbg konteks. |
| 29 | `dimension` | **Tidak** | Tidak (nol) | Sebagian — `prf` punya dimensi per-moda sendiri (`sea_lcl_dimension`/`air_dimension`/`inland_dimension`), yang JUGA tak ditampilkan. |
| 30 | `pickup_address` | **Ya** | **Ya** (via `prf.pickup_address`) | Ya. |
| 31 | `delivery_address` | **Ya** | **Ya** (via `prf.delivery_address`) | Ya. |
| 32 | `won_reason` | Tidak (tak relevan) | Tidak | Tidak. |
| 33 | `lost_reason` | Tidak (tak relevan) | Tidak | Tidak. |
| 34 | `estimated_value` | Tidak | Tidak | Sebagian — nilai deal bisa jadi konteks prioritas ("ini deal besar, prioritaskan") tapi bukan data pricing itu sendiri. PERLU KONFIRMASI DEN. |
| 35 | `contact_id` | **Tidak** (PRF tak punya kolom `contact_id` sama sekali) | Tidak (nol) | **Ya** — lihat bagian Kontak di bawah. Catatan: kolom ini di `inquiries` sendiri **belum di-backfill** (NULL di semua baris per catatan proyek 26 Jul 2026), jadi bahkan kalau PRF mau memakainya, datanya belum ada untuk PRF/inquiry lama. |

**Ringkas:** 11 dari 35 kolom `inquiries` disalin ke PRF saat create (satu di antaranya, `incoterms`, dengan kehilangan data). Dari 11 yang disalin, **2 (`goods_name`, `un_number`, `imo_class` — tiga sebenarnya) disalin tapi kemudian tak pernah dirender** di Detail PRF meski sudah ADA di kolom `prf` (lihat tabel `prf` di atas). 24 kolom tak pernah disalin sama sekali, dan karena `PRFDetailPage` juga tak pernah mem-fetch `inquiries` secara live selain `inquiry_no`, **seluruh 24 kolom itu 100% tidak terjangkau dari Detail PRF** — termasuk empat yang paling langsung relevan untuk pricing: `weight_kg`, `volume_cbm`, `container_types`, `cargo_types`.

---

## TABEL DATA CUSTOMER/KONTAK

### `accounts` (65 kolom total) — hanya baris yang relevan untuk procurement dicantumkan; sisanya (BANT/pipeline/lead-pool/tier/dll — ~40 kolom) adalah state internal CRM sales dan secara jelas TIDAK relevan untuk pricing, jadi tidak ditabulasikan satu-satu.

| Field | Sumber tabel | Tampil di Detail PRF? | Butuh procurement? |
|---|---|---|---|
| `name` | `accounts` | **Ya** — via embed `account:accounts!prf_account_id_fkey(name)` (`PRFDetailPage.jsx:54`), ditampilkan sbg "Customer" (`:372`) | Ya, dan sudah benar. |
| `code` | `accounts` | Tidak (tak di-embed) | Sebagian — kode akun (mis. `MSI/CUST/2026/XXX`) berguna untuk cross-reference internal, tapi bukan blocker pricing. PERLU KONFIRMASI DEN. |
| `legal_name` | `accounts` | Tidak (tak di-embed) | Sebagian — relevan kalau vendor butuh nama badan hukum resmi untuk dokumen pengapalan/kepabeanan (mis. consignee di B/L). PERLU KONFIRMASI DEN. |
| `tax_id` (NPWP) | `accounts` | Tidak (tak di-embed) | **Ya, kritis untuk kasus Customs** — PIB/PEB (dokumen impor/ekspor) mensyaratkan NPWP importir/eksportir. Kalau PRF punya add-on `custom_clearance` atau `direction` import/export, procurement/vendor customs SANGAT butuh ini. |
| `address` | `accounts` | Tidak (tak di-embed) | Sebagian — alamat terdaftar perusahaan (beda dari `pickup_address`/`delivery_address` operasional yang SUDAH tampil di `prf`); berguna untuk korespondensi/dokumen resmi, bukan untuk estimasi biaya rute. |
| `city`, `country` | `accounts` | Tidak (tak di-embed) | Rendah — `origin`/`destination` di `prf` sudah menutupi kebutuhan rute. |
| `phone`, `email` (level-akun) | `accounts` | Tidak (tak di-embed) | Rendah — kanal kontak level-perusahaan, kalah relevan dibanding kontak PIC personal (lihat `contacts` di bawah). |
| `pic_name`, `pic_phone`, `pic_email` | `accounts` | Tidak — **dan JANGAN dipakai**: kolom ini sudah dipensiunkan sejak batch "kunci pic_*" 26 Jul 2026 (`CustomerDetailPage.jsx:766-768`: *"kolom pic_* itu SENGAJA tidak lagi dibaca di sini"*). Sumber kebenaran sekarang adalah `contacts` (lihat di bawah). | Tidak — JANGAN dipetakan ke sini meski kolomnya masih ada di DB. |
| `payment_terms_id` | `accounts` | Tidak (tak di-embed) | Rendah-Sedang — termin bayar CUSTOMER ke MSI/JCI/SOA (bukan termin MSI ke vendor) — lebih relevan untuk finance/sales daripada keputusan harga beli procurement. PERLU KONFIRMASI DEN. |
| `currency_code` | `accounts` | Tidak (tak di-embed) | Rendah — `prf.rate_currency`/`commercial_currency` sudah jadi sumber currency yang relevan untuk PRF ini secara spesifik. |
| `credit_limit` | `accounts` | Tidak (tak di-embed) | **Tidak** — data kredit/finance, tak relevan untuk pricing beli, dan JANGAN ditampilkan ke procurement (di luar kebutuhan kerjanya). |
| Seluruh kolom BANT/pipeline/lead-pool/tier/source/dll (~40 kolom) | `accounts` | Tidak (tak di-embed) | Tidak — murni state internal CRM/sales-pipeline, tidak relevan untuk procurement menentukan harga beli vendor. |

### `contacts` (15 kolom, tabel PIC yang benar — bukan `accounts.pic_*`)

| Field | Sumber tabel | Tampil di Detail PRF? | Butuh procurement? |
|---|---|---|---|
| `name` | `contacts` | **Tidak (nol)** — modul PRF tidak mereferensikan tabel `contacts` sama sekali (dikonfirmasi grep: `grep -n "contacts\b" src/modules/procurement/*.jsx` = 0 hit) | **Ya, kritis** — nama PIC adalah orang yang procurement/vendor mungkin perlu hubungi untuk klarifikasi kargo/jadwal. |
| `position` | `contacts` | Tidak (nol) | Sebagian — jabatan PIC memberi konteks kewenangan. |
| `email` | `contacts` | Tidak (nol) | **Ya** — kanal kontak langsung. |
| `phone` | `contacts` | Tidak (nol) | **Ya** — kanal kontak langsung, sering paling cepat dipakai operasional. |
| `role_type` (decision_maker/requester/finance/operations/other) | `contacts` | Tidak (nol) | Sebagian — tahu apakah kontak ini "operations" (orang lapangan yang tahu detail kargo) vs "finance" bisa membantu procurement tahu siapa yang tepat dihubungi untuk pertanyaan spesifik. |
| `is_primary` | `contacts` | Tidak (nol) | Ya — penentu kontak MANA yang ditampilkan kalau akun punya banyak kontak (pola sudah ada: `CustomerDetailPage.jsx:775`, `.eq('is_primary', true)`). |
| `is_active` | `contacts` | Tidak (nol) | Ya — memfilter kontak yang sudah tak aktif. |

**Pola siap-pakai yang sudah ada di aplikasi ini** (sekadar butuh diterapkan, bukan didesain dari nol) — `CustomerDetailPage.jsx:769-778`:
```js
const [primaryContact, setPrimaryContact] = useState(null);
useEffect(() => {
  if (!id) { setPrimaryContact(null); return; }
  supabase.from('contacts')
    .select('id, name, email, phone')
    .eq('account_id', id)
    .eq('is_primary', true)
    .is('deleted_at', null)
    .maybeSingle()
    .then(({ data }) => setPrimaryContact(data || null));
}, [id]);
```
Untuk PRF, `id` di atas tinggal diganti `prf.account_id` (kolom yang SUDAH di-select via embed FK, tinggal diperluas). **Ini bukan pekerjaan besar** — polanya sudah ada, teruji, dan reusable persis.

**Catatan penting soal RLS (di luar scope audit ini, tapi perlu dicatat sbg konteks):** `contacts` RLS mewarisi visibilitas dari `accounts` lewat EXISTS (per catatan `CLAUDE.md`) — begitu RLS `accounts` benar-benar terbuka untuk `procurement` (pekerjaan terpisah yang sedang berjalan, sesuai "latar yang sudah diputuskan"), `contacts` untuk akun yang sama seharusnya otomatis ikut terbaca TANPA perlu perubahan RLS tambahan — tapi ini **asumsi berdasarkan pola yang tercatat**, bukan sesuatu yang saya verifikasi ulang di audit ini (di luar scope, dan saya tak punya akses DB).

---

## FIELD YANG SELALU KOSONG

Field yang **DITAMPILKAN** di layar tapi berpotensi tampil kosong/em-dash secara sistematis (bukan cuma kadang-kadang), dengan sebabnya:

| Field yang tampil | Sebab kosong | Bukti |
|---|---|---|
| **"Customer"** (`prf.account?.name \|\| prf.account_name_manual \|\| '—'`) | **Tidak di-select relasi**, BUKAN null di DB / BUKAN RLS — kalau `account_id` mengarah ke akun yang tak ter-cover RLS `accounts_read` untuk role `procurement` (situasi SEBELUM RLS baru diterapkan, sesuai latar audit ini), embed `account:accounts!...(name)` akan mengembalikan `null` untuk relasi itu (PostgREST tidak melempar error, embed relasi yang gagal RLS hanya jadi `null`) → jatuh ke `account_name_manual` → yang HAMPIR SELALU `null` juga karena `PRFFormPage.jsx:414` menulis `account_name_manual: null` (hardcoded) untuk SEMUA PRF sejak keputusan 19 Jul 2026 "PRF hanya lahir dari inquiry" (jalur customer/prospect manual sudah dicabut). **Kalau RLS lama (procurement belum bisa baca `accounts`) masih berlaku, baris "Customer" akan tampil `'—'` untuk PRF yang dibuat OLEH SALES tapi DIBACA OLEH procurement** — ini FIELD PALING PENTING di seluruh layar, dan berisiko tinggi kosong justru untuk pembaca yang paling butuh (procurement). **WAJIB dicek via SQL di bawah.** |
| **"Inquiry"** (`prf.inquiry?.inquiry_no \|\| '—'`) | Sama pola: RLS `inquiries_select` untuk role `procurement` (kalau belum terbuka) akan membuat embed `inquiry:inquiries!...(inquiry_no)` jadi `null`. Sebab lain: `prf.inquiry_id` sendiri `NULL` (mungkin untuk PRF sangat lama sebelum keputusan "wajib dari inquiry" 19 Jul 2026 — lihat kolom `inquiry_id` nullable di `AUDIT_PRF.md`). | `PRFDetailPage.jsx:373` |
| **Jawaban Harga: "Dijawab {nama}"** | Kolom `answered_by` menyimpan uuid; nama diresolve via fetch terpisah `profiles.select('full_name').eq('id', p.answered_by)` (`:129-131`) — kalau profile itu sudah tak aktif/dihapus (jarang, tapi mungkin) atau RLS `profiles_read` tak mengizinkan procurement membaca profil sales tertentu, `answeredName` akan kosong walau `answered_by` sendiri terisi. Rendah risiko (dikonfirmasi `profiles_read` cenderung permisif per catatan proyek), tapi tetap kemungkinan berbeda-beda tergantung RLS. | `:129-132` |
| **Seluruh field Section 03 (kolom 33-51 di tabel `prf` di atas)** | **Bukan null di DB** (untuk PRF yang benar-benar diisi lewat form Section 03 sesuai moda-nya — `PRFFormPage.jsx:701-810` mengisi field ini dgn benar) dan **bukan RLS** (kolom `prf` sendiri, RLS sudah mengizinkan `procurement` membaca seluruh baris `prf` yang RLS-nya lolos) — sebabnya **murni tak pernah di-select** oleh `PRF_SELECT` (`PRFDetailPage.jsx:54`). Ini kategori paling berbeda dari dua baris di atas: bukan masalah RLS relasi, tapi query di layar Detail sendiri tak pernah meminta kolom-kolom ini ke Postgres. |
| **`goods_name`, `un_number`, `imo_class`** | Sama seperti Section 03 — **ADA nilainya di DB** (disalin dari inquiry saat create, `applyInquiryData`), **bukan RLS**, murni tak di-select oleh `PRF_SELECT`. |
| **`msds_available`, `commercial_value`, `commercial_currency`, `add_on_others`** | Sama — tak di-select, meski nilainya bisa jadi terisi di DB. |
| **Data customer (kode/NPWP/alamat/telepon/kontak)** | Bukan null di DB (kemungkinan besar sebagian besar akun punya `tax_id`/`address`/`phone` terisi — perlu SQL utk pastikan), **bukan (murni) RLS** — tapi KOMBINASI keduanya: bahkan kalau RLS baru sudah membuka akses, field-field ini **tak akan otomatis muncul** karena embed `account:accounts!prf_account_id_fkey(name)` HANYA meminta kolom `name`. Membuka RLS tanpa memperluas daftar kolom di embed = tetap kosong. |

---

## USULAN LAYOUT

Kalau merancang ulang "Ringkasan Permintaan" untuk pembaca procurement, saya kelompokkan jadi **6 blok**, urutan mengikuti alur berpikir procurement saat membuka PRF baru: *siapa & seberapa mendesak → siapa yang bisa saya hubungi → apa & ke mana → berapa banyak/besar (baru bisa cari vendor) → ada penanganan khusus? → nilai niaga & catatan bebas.*

**Blok 1 — Identitas & Urgensi** *(baris pertama yang dilihat, menjawab "PRF apa ini dan seberapa mendesak")*
`PRF No` · `Status` · `Tanggal Dibuat` · **`Dibuat Oleh`** (baru — nama sales, `prf.created_by` → `profiles.full_name`) · `Inquiry No` · **`Deadline Quotation`** (dipindah lebih atas dari posisi sekarang — ini SLA, bukan detail sekunder).
*Alasan urutan:* sebelum menyentuh detail kargo, procurement perlu tahu ini permintaan dari siapa dan kapan harus selesai — dua hal yang menentukan prioritas kerja hari itu.

**Blok 2 — Customer & Kontak** *(baru sepenuhnya — baik "siapa" secara legal maupun "siapa yang bisa dihubungi")*
`Nama Customer` (sudah ada) · **`Kode Akun`** · **`NPWP`** (kritis kalau ada add-on customs/direction import-export) · **`Alamat`** · **Kontak PIC** — blok kecil berisi Nama/Jabatan/Telepon/Email dari `contacts` (`is_primary=true`), pakai pola yang sudah ada di `CustomerDetailPage.jsx:769-778`.
*Alasan urutan:* diletakkan SEBELUM detail kargo karena kalau procurement bingung soal spesifikasi apa pun di blok bawah, blok inilah yang memberi tahu SIAPA yang harus dihubungi — harus sudah terlihat sebelum orang mulai membaca detail teknis, bukan dicari-cari di bagian bawah.

**Blok 3 — Rute & Ringkasan Kargo** *(apa yang dipindahkan, dari mana ke mana)*
`Direction` · `Origin → Destination` (dgn ikon, sudah ada) · `Service Type` · `Incoterms` · `Commodity` · **`Nama Barang`** (baru — `goods_name`) · `HS Code` · `Cargo Ready Date`.
*Alasan urutan:* ini "ringkasan eksekutif" pengiriman — cukup untuk gambaran umum sebelum masuk ke angka detail di Blok 4.

**Blok 4 — Detail Layanan per Moda** *(BLOK PALING PENTING, saat ini 100% tak ada di layar)*
Render kondisional sesuai `prf.service_type`, sama persis strukturnya dengan Section 03 form create:
- **Sea + FCL:** `Freight Type` (FCL) · tabel/pill Tipe Kontainer + Qty per tipe.
- **Sea + LCL:** `Freight Type` (LCL) · `GW (kg)` · `Dimensi` · `Volume (CBM)` · `Koli`.
- **Air:** `GW (kg)` · `Dimensi` · `Volume (CBM)` · `Koli`.
- **Inland:** pill Tipe Armada · `Pickup/Delivery Address` (khusus inland, beda dari alamat Blok 3) · `GW`/`Dimensi` (opsional).
- **Custom:** `Tipe Dokumen` (PIB/PEB, sudah derived dari Direction).
- **Project:** pill Tipe Freight · `Qty`.
*Alasan urutan:* ini adalah blok yang SECARA LANGSUNG menentukan angka yang harus procurement minta ke vendor — berat, volume, jumlah kontainer, tipe armada. Tanpa blok ini, seluruh Blok 1-3 hanya "konteks" tanpa bahan untuk benar-benar menghitung harga.

**Blok 5 — Dangerous Goods** *(kondisional, HANYA muncul bila `commodity='dg'`, diberi aksen visual berbeda — mis. border/badge amber-merah, BUKAN blok putih polos seperti yang lain, supaya tak terlewat)*
`MSDS Tersedia` (badge Ya/Tidak, mencolok) · `UN Number` · `IMO Class`.
*Alasan pemisahan visual:* ini bukan sekadar "field lagi" — kalau MSDS belum tersedia atau UN Number kosong padahal kargo DG, itu **blocker operasional** (vendor DG-capable tak akan jalan tanpa dokumen ini). Menempatkannya sebagai baris biasa di antara puluhan field lain berisiko terlewat; blok terpisah dengan aksen warna memaksa perhatian.

**Blok 6 — Nilai Niaga, Add-On & Catatan** *(informasi pendukung, dibaca terakhir)*
`Commercial Value` + `Currency` (kondisional, hanya bila incoterm CIF/CIP/DDP) · `Add-On Services` (badge, sudah ada) · **`Add-On — Others` (detail teks, baru)** · `Pickup Address` / `Delivery Address` (level Section 02, sudah ada) · `Notes` (paling bawah, full-width, sudah ada).
*Alasan urutan:* nilai komersial & catatan bebas adalah info pendukung — berguna tapi bukan yang pertama dicari saat membuka PRF baru untuk mulai mencari vendor.

**Yang SENGAJA tidak diusulkan masuk Ringkasan Permintaan** (biar tak jadi terlalu ramai): `stream` (kategori pelaporan internal, kegunaan tipis untuk procurement — bisa dipindah ke area sekunder/tooltip), `customer_source` (selalu `'inquiry'`, hapus saja dari SELECT), field BANT/pipeline/lead-pool `accounts` (state internal CRM, tak relevan). `credit_limit` **JANGAN pernah ditampilkan** ke procurement (di luar kebutuhan kerja, berpotensi bocor info finance yang tak perlu).

---

## SQL UNTUK DIJALANKAN MANUAL

Semua read-only. Tujuan tiap query dijelaskan di komentarnya.

```sql
-- ═══════════════════════════════════════════════════════════════════
-- (1) Berapa % baris prf yang account_id-nya TERISI vs NULL.
-- Tujuan: field "Customer" di Detail PRF bergantung account_id via embed
-- FK — kalau banyak baris account_id NULL, memperluas embed tak akan
-- membantu baris-baris itu; mereka akan tetap tampil '—' apa pun yang
-- diperbaiki di query/render.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(*) AS total_prf,
  count(account_id) AS ada_account_id,
  round(100.0 * count(account_id) / NULLIF(count(*), 0), 1) AS persen_terisi
FROM public.prf
WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- (2) Berapa % baris prf yang inquiry_id-nya TERISI vs NULL — sama
-- alasannya untuk field "Inquiry".
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(*) AS total_prf,
  count(inquiry_id) AS ada_inquiry_id,
  round(100.0 * count(inquiry_id) / NULLIF(count(*), 0), 1) AS persen_terisi
FROM public.prf
WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- (3) Untuk PRF yang account_id-nya TERISI, berapa yang akun terkaitnya
-- benar-benar punya name/tax_id/address/phone terisi di `accounts`.
-- Tujuan: mengukur seberapa berguna memperluas embed account — kalau
-- tax_id/address kebanyakan NULL di data nyata, menampilkannya di UI
-- akan sering menampilkan '—' juga (bukan bug UI, tapi data kosong).
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(*) AS total_akun_terkait_prf,
  count(a.tax_id) AS ada_npwp,
  count(a.address) AS ada_alamat,
  count(a.phone) AS ada_telepon,
  count(a.code) AS ada_kode
FROM public.prf p
JOIN public.accounts a ON a.id = p.account_id
WHERE p.deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- (4) Untuk akun yang terkait PRF, berapa yang punya kontak PRIMARY di
-- tabel contacts (bukan accounts.pic_*). Tujuan: mengukur seberapa
-- berguna menambahkan blok "Kontak PIC" — kalau mayoritas akun belum
-- punya contacts.is_primary=true, blok itu akan sering kosong (bukan
-- salah query, tapi data-entry gap yang perlu diketahui lebih dulu).
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(DISTINCT p.account_id) AS total_akun_unik_terkait_prf,
  count(DISTINCT c.account_id) AS akun_dengan_kontak_primary
FROM public.prf p
LEFT JOIN public.contacts c
  ON c.account_id = p.account_id AND c.is_primary = true AND c.deleted_at IS NULL
WHERE p.deleted_at IS NULL AND p.account_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- (5) Seberapa padat data Section 03 "Detail Layanan" benar-benar
-- terisi di produksi, per service_type. Tujuan: mengukur skala dampak
-- nyata dari field yang tak pernah ditampilkan — kalau field ini padat
-- terisi, dampak "invisible di Detail" jauh lebih besar daripada kalau
-- kebanyakan kosong.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  service_type,
  count(*) AS total_prf,
  count(sea_freight_type)      AS ada_sea_freight_type,
  count(sea_container_types)   AS ada_sea_container_types,
  count(sea_lcl_gw)            AS ada_sea_lcl_gw,
  count(air_gw)                AS ada_air_gw,
  count(inland_fleet_types)    AS ada_inland_fleet_types,
  count(project_freight_types) AS ada_project_freight_types
FROM public.prf
WHERE deleted_at IS NULL
GROUP BY service_type;

-- ═══════════════════════════════════════════════════════════════════
-- (6) Berapa % prf ber-commodity='dg' yang msds_available/un_number/
-- imo_class benar terisi. Tujuan: kalau banyak PRF Dangerous Goods
-- dengan data ini kosong DI DB (bukan cuma tak tampil di UI), itu
-- masalah data-entry terpisah dari masalah display yang diaudit di sini.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(*) AS total_prf_dg,
  count(*) FILTER (WHERE msds_available = true) AS msds_tersedia,
  count(un_number) AS ada_un_number,
  count(imo_class) AS ada_imo_class
FROM public.prf
WHERE deleted_at IS NULL AND commodity = 'dg';

-- ═══════════════════════════════════════════════════════════════════
-- (7) goods_name/un_number/imo_class: berapa yang terisi di prf VS di
-- inquiries sumbernya (untuk PRF yang py inquiry_id) — untuk memastikan
-- klaim "disalin saat create tapi tak tampil" itu bukan kebetulan
-- kosong di kedua sisi.
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(*) AS total_prf_dgn_inquiry,
  count(p.goods_name) AS prf_ada_goods_name,
  count(i.goods_name) AS inquiry_ada_goods_name,
  count(*) FILTER (WHERE p.goods_name IS NOT NULL AND i.goods_name IS NULL) AS prf_ada_tapi_inquiry_kosong,
  count(*) FILTER (WHERE p.goods_name IS NULL AND i.goods_name IS NOT NULL) AS inquiry_ada_tapi_prf_kosong_gagal_salin
FROM public.prf p
JOIN public.inquiries i ON i.id = p.inquiry_id
WHERE p.deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- (8) Untuk PRF yang py inquiry_id, seberapa sering inquiries.weight_kg/
-- volume_cbm/container_types/cargo_types (yang TAK PERNAH disalin ke
-- PRF sama sekali) sebenarnya terisi di sisi inquiry. Tujuan: mengukur
-- besarnya data yang "hilang di tengah jalan" — captured di inquiry,
-- tak pernah sampai ke PRF, dan karenanya tak mungkin tampil di Detail
-- PRF sama sekali (bukan soal display, soal field yg memang tak dipetakan).
-- ═══════════════════════════════════════════════════════════════════
SELECT
  count(*) AS total_prf_dgn_inquiry,
  count(i.weight_kg) AS inquiry_ada_weight_kg,
  count(i.volume_cbm) AS inquiry_ada_volume_cbm,
  count(i.container_types) AS inquiry_ada_container_types,
  count(i.cargo_types) AS inquiry_ada_cargo_types
FROM public.prf p
JOIN public.inquiries i ON i.id = p.inquiry_id
WHERE p.deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- (9) Distribusi role_type kontak PRIMARY untuk akun-akun yang terkait
-- PRF — untuk membantu memutuskan apakah menampilkan role_type di blok
-- Kontak PIC (usulan Blok 2) benar berguna atau kebanyakan NULL/other.
-- ═══════════════════════════════════════════════════════════════════
SELECT c.role_type, count(*) AS jumlah
FROM public.contacts c
WHERE c.is_primary = true AND c.deleted_at IS NULL
  AND c.account_id IN (SELECT DISTINCT account_id FROM public.prf WHERE account_id IS NOT NULL AND deleted_at IS NULL)
GROUP BY c.role_type
ORDER BY jumlah DESC;

-- ═══════════════════════════════════════════════════════════════════
-- (10) add_on_others: berapa prf yang add_on_services memuat 'others'
-- TAPI add_on_others (detail teksnya) kosong — mengukur seberapa sering
-- badge "Others" muncul tanpa penjelasan apa pun kalau field ini benar
-- ditambahkan ke tampilan.
-- ═══════════════════════════════════════════════════════════════════
SELECT count(*) AS jumlah_others_tanpa_detail
FROM public.prf
WHERE deleted_at IS NULL
  AND add_on_services @> ARRAY['others']::text[]
  AND (add_on_others IS NULL OR add_on_others = '');
```

---

## PERTANYAAN TERBUKA

1. **Apakah `commercial_value`/`commercial_currency` benar dibutuhkan procurement**, atau itu murni domain finance/customs broker di tahap hilir (setelah PRF selesai, saat dokumen PIB/PEB dibuat)? Kalau tak dibutuhkan procurement, tak perlu ditambahkan ke Blok 6 usulan — cukup dicatat sebagai "sengaja tak ditampilkan di sini, tapi ada di data untuk kebutuhan lain."

2. **Apakah `accounts.payment_terms_id`/`credit_limit` relevan sama sekali untuk keputusan pricing procurement**, atau ini murni informasi sales/finance yang seharusnya TIDAK terlihat dari layar ini? Saya condong ke "tidak relevan / jangan ditampilkan", tapi ingin dikonfirmasi eksplisit supaya tidak dianggap kealpaan kalau memang sengaja dikecualikan.

3. **Kenapa `inquiries.has_msds`/`weight_kg`/`volume_cbm`/`container_types`/`cargo_types` tidak pernah dipetakan ke PRF sama sekali** — apakah karena perbedaan tipe/struktur data yang genuinely butuh keputusan desain (mis. `has_msds` bertipe `text` bukan boolean, jadi butuh normalisasi nilai dulu), atau murni belum sempat dikerjakan? Ini menentukan apakah perbaikannya "tinggal tambah field di form + query" atau butuh keputusan model data lebih dulu (mirip TD-107/TD-108 di `AUDIT_PRF.md`).

4. **Apakah `prf.account_id`/`inquiry_id`/data copy-an lain SEHARUSNYA disinkronkan ulang (live) dari `inquiries`/`accounts` setiap kali Detail PRF dibuka**, atau memang by-design snapshot satu-kali saat create (sehingga kalau inquiry diedit setelahnya, PRF sengaja tak ikut berubah)? Ini menentukan apakah usulan layout di atas harus mengambil beberapa field LANGSUNG dari `inquiries`/`accounts` live (mis. NPWP/alamat customer — data yang wajar berubah dan sebaiknya selalu terkini) vs field yang wajar snapshot (mis. HS Code/incoterm — spesifik untuk pengiriman ini, tidak seharusnya ikut berubah kalau inquiry diedit belakangan).

5. **Setelah RLS `accounts`/`inquiries` untuk role `procurement` selesai dibuka** (pekerjaan terpisah yang jadi latar audit ini) — apakah ada rencana untuk memperluas `PRF_SELECT`/embed di `PRFDetailPage.jsx` dalam paket kerja yang SAMA, atau ini akan jadi dua PR terpisah? Saya sarankan disatukan (percuma RLS terbuka kalau query-nya tak ikut diperluas) — tapi ini keputusan sequencing yang bukan wewenang saya putuskan di audit ini.

6. **Apakah Section 03 perlu ditampilkan LENGKAP (semua sub-field per moda) atau cukup ringkasan satu-baris** (mis. "FCL · 2x40' · 2x20'RF" sebagai satu string, bukan tabel penuh)? Usulan layout saya di atas mengasumsikan tampilan penuh (meniru struktur form create), tapi kalau tujuannya cuma referensi cepat, ringkasan padat mungkin lebih sesuai kebiasaan kerja procurement. Perlu masukan dari procurement/Den langsung soal preferensi ini.

---

## USULAN TECH DEBT BARU (mulai TD-151, USULAN — belum resmi masuk `08_TECH_DEBT.md`)

- **TD-151 (USULAN, HIGH):** `PRFDetailPage.jsx` tidak pernah men-select maupun menampilkan seluruh 19 kolom "Section 03 Detail Layanan" (`sea_freight_type` s/d `project_qty`) — spesifikasi kargo per moda yang paling langsung menentukan biaya, ditangkap lengkap saat create (`PRFFormPage.jsx:701-810`) lalu 100% hilang dari layar baca.
- **TD-152 (USULAN, HIGH):** Tiga kolom keselamatan Dangerous Goods (`msds_available`, `un_number`, `imo_class`) tidak pernah ditampilkan di Detail PRF — dua di antaranya (`un_number`, `imo_class`) bahkan sudah tersimpan di kolom `prf` (disalin dari inquiry saat create) tapi tak pernah di-select untuk ditampilkan.
- **TD-153 (USULAN, MEDIUM-HIGH):** Modul PRF tidak menyentuh tabel `contacts` sama sekali — customer di Detail PRF direduksi jadi satu string nama, tanpa kode/NPWP/alamat/kontak PIC apa pun, padahal pola fetch-nya sudah ada dan reusable persis di `CustomerDetailPage.jsx:769-778`.
- **TD-154 (USULAN, MEDIUM):** `commercial_value`, `commercial_currency`, dan `add_on_others` (detail teks untuk add-on "Others") ditangkap saat create tapi tak pernah ditampilkan di Detail PRF.
- **TD-155 (USULAN, LOW):** `customer_source` di-select oleh `PRF_SELECT` tapi tak pernah dibaca/dirender di mana pun dalam komponen — dead fetch, aman dihapus dari SELECT.
- **TD-156 (USULAN, MEDIUM):** Detail PRF tidak menampilkan siapa PEMBUAT PRF (`created_by`) maupun waktu submit aktual (`submitted_at`), berbeda dari layar setara `DealDetailPage.jsx` yang secara eksplisit meresolve dan menampilkan "Dibuat Oleh" untuk inquiry — procurement tak punya cara dari layar ini untuk tahu salesperson mana yang harus dihubungi soal PRF tersebut.
