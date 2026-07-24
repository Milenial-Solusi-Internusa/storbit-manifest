# AUDIT PEMETAAN FIELD — Form Inquiry ↔ Form PRF

> **Tujuan:** memetakan field antara **form Inquiry** dan **form PRF (Cetak PRF dari inquiry)** untuk menghindari *redundant data entry* — field yang sudah diisi user saat membuat Inquiry tidak perlu diketik ulang saat membuat PRF.
> **Mode:** AUDIT (read-only). Tidak ada file kode/dokumen yang diubah. File ini satu-satunya yang dibuat.
> **Sumber diaudit:**
> - `src/modules/crm/InquiryFormPage.jsx` (547 baris) — form **Buat/Edit Inquiry** (satu komponen, `mode='create'|'edit'`).
> - `src/modules/procurement/PRFFormPage.jsx` (789 baris) — form **Buat PRF Baru** (create-only; dibuka via "Cetak PRF" dari inquiry, prop `prefillInquiryId`).
> - `supabase/schema_snapshot.sql` — tabel `inquiries` (`:3679–3717`) dan `prf` (`:4107–4166`).
> - Atribusi: seluruh nomor baris diverifikasi langsung dari file per tanggal audit. Tidak ada tes runtime.

---

## RINGKASAN

Redundansi antara kedua form **sudah ditekan cukup jauh**, tapi belum tuntas. Dari sisi *data entry*, PRF saat ini **sudah men-prefill 8 field data** dari inquiry sumber secara otomatis (fill-empty-only, non-null) lewat helper `applyInquiryData` (`PRFFormPage.jsx:97–111`): **HS Code, Pickup Address, Delivery Address, Origin (←POL), Destination (←POD), Deadline Quotation (←Deadline Quote), Notes, dan Incoterm** (yang terakhir bersyarat — lihat di bawah). Ditambah **identitas akun** (`account_id`) yang **diturunkan otomatis** dari inquiry sehingga user PRF **tidak perlu memilih customer/prospect lagi** — ini penghematan input paling bernilai dan sudah berjalan.

Sisa redundansi yang **belum** dihemat terbagi dua kelompok, dan **keduanya bukan karena kelalaian, melainkan karena bentuk datanya memang beda**: **(1) field dengan kosakata berbeda** — `service_type` (inquiry = lini bisnis freight/customs/trading; PRF = moda angkut sea/air/inland/project/custom — ini **TD-108** yang sudah terdokumentasi), `commodity` (inquiry = teks bebas; PRF = enum general/special_permit/dg), dan `additional_services`/`add_on_services` (daftar nilai beda). Ketiganya **tidak di-prefill** dan sebagai gantinya ditampilkan **teks bantu read-only** ("Dari inquiry: … — pilih manual"). **(2) spesifikasi fisik yang di PRF dipecah per-moda** — Berat, Volume, Dimensi, dan Jenis Kontainer ada sebagai **satu field umum** di Inquiry, tetapi di PRF hanya muncul **di dalam Section 03 (child) yang tergantung service type** (Sea-LCL / Air / Inland punya kolom GW/Volume/Dimension sendiri-sendiri). Karena PRF belum tahu moda saat prefill dan kolomnya bercabang, keempatnya **sengaja tidak disalin** (komentar `PRFFormPage.jsx:95, :213`).

**Estimasi penghematan tambahan yang realistis:** field yang benar-benar *tinggal disalin 1:1 tapi belum* praktis **sudah habis** — yang mudah sudah di-prefill. Kandidat penghematan berikutnya menuntut **keputusan pemetaan** dulu (mapping vocab service_type/commodity/add-on, dan mapping spesifikasi umum→child per moda), plus beberapa **field DG (UN Number, IMO Class) dan Nama Barang (goods_name) yang ada di Inquiry tapi TIDAK punya slot di PRF sama sekali** — ini bukan soal prefill, tapi soal apakah PRF memang perlu membawanya (lihat Daftar C, ada yang berpotensi *gap*, bukan sekadar "sengaja tak dibawa").

---

## TABEL MASTER PEMETAAN FIELD

Legenda tipe: **txt**=text · **num**=number · **date** · **dd**=dropdown · **pill**=multi-select pill/card · **chk**=checkbox · **ta**=textarea · **ro**=read-only/derived.
Mandatory: **Inq**=di form Inquiry · **PRF**=di form PRF · (kondisi) bila bersyarat. Inquiry selalu jalur create+edit; PRF punya beda DRAFT vs SUBMIT (lihat catatan di bawah tabel).

| # | Field (label UI) | Ada di Inquiry? | Ada di PRF? | Kolom DB | Tipe | Mandatory | Prefill Inq→PRF? |
|---|---|---|---|---|---|---|---|
| 1 | Sumber akun (Prospect/Customer ↔ Inquiry) | ya — toggle+dropdown `InquiryFormPage.jsx:347–375` | ya — chip read-only "Inquiry" + dropdown inquiry `PRFFormPage.jsx:491–507` | `inquiries.prospect_id`/`customer_id` ↔ `prf.customer_source`+`account_id`+`inquiry_id` | dd / ro+dd | Inq: ya (pilih akun) · PRF: ya (pilih inquiry) | **n/a — `account_id` diturunkan otomatis dari inquiry** (`:237`,`:285`) |
| 2 | Service Type | ya `:382–389` | ya `:575–587` | `inquiries.service_type` ↔ `prf.service_type` | dd | Inq: ya · PRF: ya | **TIDAK** (vocab beda — TD-108; teks bantu `:586`) |
| 3 | Deadline Quote / Quotation | ya `:376–378` | ya `:519–522` | `inquiries.deadline_quote` ↔ `prf.deadline_quotation` | date | Inq: tidak · PRF: **ya** | **YA** (`applyInquiryData:106`) |
| 4 | Incoterm(s) | ya — multi pill `:427–432` | ya — dropdown **tunggal** `:588–596` | `inquiries.incoterms text[]` ↔ `prf.incoterms text` | pill / dd | tidak / tidak | **SEBAGIAN** — ambil `incoterms[0]` **hanya bila** ada di `INCOTERMS_FULL`, else kosong (`:108`,`:595`) |
| 5 | Pickup Address | ya `:417–420` | ya `:621–624` | `inquiries.pickup_address` ↔ `prf.pickup_address` | ta | tidak / **ya (incoterm EXW/CPT/CIP/DAP/DPU/DDP)** | **YA** (`:102`) |
| 6 | Delivery Address | ya `:421–424` | ya `:625–628` | `inquiries.delivery_address` ↔ `prf.delivery_address` | ta | tidak / **ya (incoterm EXW/FAS/FOB/CFR/CIF/DAP/DPU/DDP)** | **YA** (`:103`) |
| 7 | HS Code | ya `:443` | ya `:559–562` | `inquiries.hs_code` ↔ `prf.hs_code` | txt | tidak / **ya bila import/export (wajib 8 digit)** | **YA** (`:101`) — ⚠️ lihat Ambigu #1 |
| 8 | Origin ← POL | ya (POL) `:405–408` | ya (Origin) `:616` | `inquiries.pol` ↔ `prf.origin` | txt | tidak / tidak | **YA** (`origin ← pol`, `:104`) |
| 9 | Destination ← POD | ya (POD) `:409–413` | ya (Destination) `:617` | `inquiries.pod` ↔ `prf.destination` | txt | tidak / tidak | **YA** (`destination ← pod`, `:105`) |
| 10 | Notes / Catatan | ya `:532` | ya `:772–780` | `inquiries.notes` ↔ `prf.notes` | ta | tidak / tidak | **YA** (`:107`) |
| 11 | Commodity | ya — **teks bebas** `:468` | ya — **enum** general/special_permit/dg `:546–555` | `inquiries.commodity` ↔ `prf.commodity` | txt / dd | tidak / **ya** | **TIDAK** (vocab beda; teks bantu `:554`) |
| 12 | Add-On / Additional Services | ya — pill customs/warehouse/undername/insurance/trucking `:519–521` | ya — pill 11 nilai (custom_clearance, inland, import_license_*, dst) `:631–641` | `inquiries.additional_services text[]` ↔ `prf.add_on_services text[]` | pill / pill | tidak / tidak | **TIDAK** (vocab beda; teks bantu `:640`) |
| 13 | Berat / GW | ya — Berat Total (KG) `:446–452` | **hanya child**: `sea_lcl_gw`/`air_gw`/`inland_gw` `:701,:712,:733` | `inquiries.weight_kg` ↔ `prf.sea_lcl_gw`/`air_gw`/`inland_gw` | num | tidak / **ya (Sea-LCL & Air)**, opsional (Inland) | **TIDAK** (branch-split; `:95`,`:213`) |
| 14 | Volume | ya — Volume (CBM) `:453–458` | **hanya child**: `sea_lcl_volume`/`air_volume` `:703,:714` | `inquiries.volume_cbm` ↔ `prf.sea_lcl_volume`/`air_volume` | num | tidak / **ya (Sea-LCL & Air)** | **TIDAK** (branch-split) |
| 15 | Dimensi | ya — Dimensi (PxLxT) `:462` | **hanya child**: `sea_lcl_dimension`/`air_dimension`/`inland_dimension` `:702,:713,:734` | `inquiries.dimension` ↔ `prf.sea_lcl_dimension`/`air_dimension`/`inland_dimension` | txt | tidak / **ya (Sea-LCL & Air)**, opsional (Inland) | **TIDAK** (branch-split) |
| 16 | Jenis Kontainer | ya — pill FCL20/FCL40/FCL40HC/LCL `:434–439` | **hanya child** Sea-FCL: `sea_container_types`+`sea_container_qty` `:682–698` | `inquiries.container_types text[]` ↔ `prf.sea_container_types text[]`+`sea_container_qty jsonb` | pill / pill+num | tidak / **ya bila Sea-FCL** | **TIDAK** (vocab+branch beda) |
| 17 | MSDS | ya — `has_msds` radio **Ya/Tidak/Belum Tahu** (muncul bila cargo=DG) `:503–506` | ya — `msds_available` **checkbox boolean** (muncul bila commodity=DG) `:563–571` | `inquiries.has_msds text` ↔ `prf.msds_available boolean` | radio / chk | tidak / **ya bila DG** | **TIDAK** (tipe beda: teks 3-nilai vs boolean) |
| 18 | Nama Barang (goods_name, EN) | ya `:442` | **TIDAK ADA** | `inquiries.goods_name` ↔ *(tak ada)* | txt | tidak / — | n/a (Inquiry-only — lihat Daftar C / gap) |
| 19 | Route | ya `:467` | **TIDAK ADA** | `inquiries.route` ↔ *(tak ada)* | txt | tidak / — | n/a (Inquiry-only) |
| 20 | Estimasi Volume | ya di **state+payload** tapi **TIDAK dirender** (`:157`,`:256`; input dihapus) | **TIDAK ADA** | `inquiries.estimated_volume text` ↔ *(tak ada)* | (hidden) | — | n/a (Inquiry-only, tersembunyi) |
| 21 | UN Number (DG) | ya (muncul bila DG) `:493` | **TIDAK ADA** | `inquiries.un_number` ↔ *(tak ada)* | txt | tidak / — | n/a (Inquiry-only — lihat gap DG) |
| 22 | IMO Class (DG) | ya (muncul bila DG) `:494–501` | **TIDAK ADA** | `inquiries.imo_class` ↔ *(tak ada)* | dd | tidak / — | n/a (Inquiry-only — lihat gap DG) |
| 23 | Cargo Type (checklist) | ya — normal/dg/liquid/reefer/oversize/permit `:482–484` | **TIDAK ADA** (info DG/permit sebagian diwakili `commodity`) | `inquiries.cargo_types text[]` ↔ *(tak ada)* | pill | tidak / — | n/a (Inquiry-only — lihat gap) |
| 24 | Stream | **TIDAK ADA** | ya `:510–518` | *(tak ada)* ↔ `prf.stream` | dd | — / tidak | n/a (PRF-only) |
| 25 | Direction (Import/Export/Domestic) | **TIDAK ADA** | ya `:537–545` | *(tak ada)* ↔ `prf.direction` | dd | — / **ya** | n/a (PRF-only) |
| 26 | Commercial Value | **TIDAK ADA** | ya (muncul bila incoterm CIF/CIP/DDP) `:599–603` | *(tak ada)* ↔ `prf.commercial_value` | num | — / tidak | n/a (PRF-only) |
| 27 | Currency (commercial) | **TIDAK ADA** | ya (muncul bila incoterm CIF/CIP/DDP) `:604–611` | *(tak ada)* ↔ `prf.commercial_currency` | dd | — / tidak | n/a (PRF-only) |
| 28 | Add-On — Others | **TIDAK ADA** | ya (muncul bila add-on "Others") `:643–647` | *(tak ada)* ↔ `prf.add_on_others` | txt | — / tidak | n/a (PRF-only) |
| 29 | Cargo Ready Date | **TIDAK ADA** | ya `:650–653` | *(tak ada)* ↔ `prf.cargo_ready_date` | date | — / **ya** | n/a (PRF-only) |
| 30 | Section 03 child — Sea Freight Type | **TIDAK ADA** | ya (FCL/LCL) `:672–680` | *(tak ada)* ↔ `prf.sea_freight_type` | dd | — / **ya bila Sea** | n/a (PRF-only) |
| 31 | Section 03 child — Sea LCL Koli | **TIDAK ADA** | ya `:704` | *(tak ada)* ↔ `prf.sea_lcl_koli` | num | — / **ya bila Sea-LCL** | n/a (PRF-only) |
| 32 | Section 03 child — Air Koli | **TIDAK ADA** | ya `:715` | *(tak ada)* ↔ `prf.air_koli` | num | — / **ya bila Air** | n/a (PRF-only) |
| 33 | Section 03 child — Inland Fleet Type | **TIDAK ADA** | ya (25 opsi) `:719–727` | *(tak ada)* ↔ `prf.inland_fleet_types text[]` | pill | — / **ya bila Inland** | n/a (PRF-only) |
| 34 | Section 03 child — Inland Pickup/Delivery Address | **TIDAK ADA** (terpisah dari Pickup/Delivery utama) | ya `:728–731` | *(tak ada)* ↔ `prf.inland_pickup_address`/`inland_delivery_address` | ta | — / **ya bila Inland** | n/a (PRF-only) — ⚠️ lihat Ambigu #4 |
| 35 | Section 03 child — Custom Doc Type | **TIDAK ADA** | ya — **derived** dari Direction (PIB/PEB) `:739–745` | *(tak ada)* ↔ `prf.custom_doc_type` | ro | — / n/a | n/a (PRF-only, otomatis) |
| 36 | Section 03 child — Project Freight Type + Qty | **TIDAK ADA** | ya `:750–765` | *(tak ada)* ↔ `prf.project_freight_types text[]`+`project_qty` | pill+num | — / **ya bila Project** | n/a (PRF-only) |

**Catatan mandatory PRF (DRAFT vs SUBMIT):** menyimpan **Draft** PRF hanya mewajibkan `inquiry_id` (`handleSave:365`). Seluruh kolom "wajib" lain (Deadline Quotation, Direction, Commodity, HS Code kondisional, MSDS kondisional, Service Type, Pickup/Delivery kondisional, Cargo Ready Date, + child per moda) baru ditegakkan saat **Submit** (`validate:307–350`). Form Inquiry tidak punya konsep draft — `validate` jalan di create maupun edit, dan hanya mewajibkan **sumber akun + Service Type** (`:235–242`).

---

## DAFTAR A — ADA DI DUA-DUANYA tapi BELUM ter-prefill (kandidat penghematan)

Diurut dari yang paling "murni kandidat" ke yang paling terhalang bentuk data.

| Field | Kenapa belum di-prefill | Bisa dihemat? |
|---|---|---|
| **MSDS** (#17) | Tipe beda: inquiry `has_msds` teks 3-nilai (Ya/Tidak/Belum Tahu) vs PRF `msds_available` boolean. | **Bisa parsial** — map "Ya"→`true`, selain itu `false`/biarkan. Perlu keputusan penanganan "Belum Tahu". |
| **Incoterm** (#4) | Sudah di-prefill **sebagian** — hanya `incoterms[0]` & hanya bila token cocok `INCOTERMS_FULL`. Inquiry menawarkan `CFR/CNF` & `DDU/DAP` yang **tak ada** di daftar PRF → tak tersalin (teks bantu `:595`); multi-select inquiry → PRF tunggal → nilai lebih dari satu hilang. | **Sebagian sudah**; sisanya butuh keputusan pemetaan `CFR/CNF→CFR`, `DDU/DAP→DAP`. |
| **Berat / GW** (#13), **Volume** (#14), **Dimensi** (#15) | Di PRF hanya ada **di dalam child per moda** (Sea-LCL/Air/Inland), sedangkan prefill jalan sebelum moda dipilih. Sengaja tak disalin (`:95`,`:213`). | **Bisa, tapi bersyarat** — perlu mapping "field umum inquiry → child mana" begitu Service Type PRF dipilih. Bukan prefill 1:1. |
| **Jenis Kontainer** (#16) | Vocab beda (inquiry FCL20/FCL40/FCL40HC/LCL vs PRF 20/40/40HC/20RF/40RF) **dan** hanya di child Sea-FCL. | **Bisa parsial** dengan tabel pemetaan + gated Sea-FCL. |
| **Service Type** (#2) | Kosakata beda sumbu (lini bisnis vs moda angkut) — **TD-108**. Tak ada pemetaan 1:1 yang benar. | **Tidak trivial** — butuh aturan bisnis. Saat ini teks bantu saja. |
| **Commodity** (#11) | Inquiry teks bebas; PRF enum (general/special_permit/dg). | **Tidak trivial** — teks bebas → enum perlu klasifikasi. Teks bantu saja. |
| **Add-On Services** (#12) | Daftar nilai beda; multi-select dua-duanya tapi kosakata tak sejajar. | **Tidak trivial** — perlu tabel pemetaan add-on. Teks bantu saja. |

> **Kesimpulan Daftar A:** field yang *tinggal disalin apa adanya* sudah habis diprefill. Semua sisa di sini terhalang **beda kosakata** atau **struktur child per-moda** — menghematnya butuh **keputusan pemetaan**, bukan sekadar menambah baris `fill()`.

---

## DAFTAR B — HANYA di PRF (memang harus manual, tak bisa di-prefill)

Tidak ada padanannya di Inquiry, jadi tidak ada sumber untuk prefill:

- **Stream** (#24) — kategori pelaporan PRF.
- **Direction** — Import/Export/Domestic (#25) — **wajib**; tidak ada di inquiry.
- **Commercial Value** (#26) & **Currency** (#27) — muncul bila incoterm CIF/CIP/DDP.
- **Add-On — Others** (#28) — teks bebas saat add-on "Others" dicentang.
- **Cargo Ready Date** (#29) — **wajib**; berbeda dari Deadline Quote.
- **Custom Doc Type** (#35) — **derived otomatis** dari Direction (PIB/PEB), user tak mengisi.
- **Seluruh Section 03 (child per moda)** (#30–34, #36): Sea Freight Type, Sea Container qty, Sea-LCL Koli, Air Koli, Inland Fleet Type, Inland Pickup/Delivery Address, Project Freight Type + Qty. Semua spesifik ke moda dan tidak punya sumber sepadan di inquiry (kecuali sebagian bisa diturunkan dari field umum inquiry — lihat Daftar A #13–16).
- **`customer_source`** (fixed `'inquiry'`) & **`account_id`** (derived) — bukan input user; `account_id` **sudah diturunkan** dari inquiry (bukan diketik ulang).

---

## DAFTAR C — HANYA di Inquiry (tidak dibawa ke PRF) — cek sengaja vs kelewat

| Field | Status | Penilaian |
|---|---|---|
| **Route** (#19) | Inquiry-only. PRF pakai Origin/Destination (yang **sudah** di-prefill dari POL/POD). | **Sengaja** — tampaknya digantikan Origin/Destination. Route teks bebas ("Jakarta – Surabaya") tak punya slot PRF. Rendah risiko. |
| **Estimasi Volume** (#20) | Inquiry-only, **dan sudah tidak dirender** di form inquiry (state+payload saja). | **Sengaja / legacy** — field mati di UI. Tak relevan untuk prefill. |
| **Nama Barang / goods_name** (#18) | Inquiry-only. PRF **tak punya kolom maupun field** goods_name. | **⚠️ PERLU KONFIRMASI** — rencana perubahan menyebut "commodity name / nama barang". Inquiry menyimpan nama barang (EN), tapi PRF tak punya tempat menampung/menampilkannya. Ini bisa **gap** (procurement tak melihat nama barang) atau memang diputuskan tak perlu. |
| **UN Number** (#21) & **IMO Class** (#22) | Inquiry-only (muncul saat cargo DG). PRF **tak punya** field UN/IMO sama sekali, walau PRF punya `commodity='dg'` + `msds_available`. | **⚠️ PERLU KONFIRMASI** — untuk kargo DG, UN Number & IMO Class yang sudah diisi di inquiry **tidak tersedia** saat procurement membuat PRF. Kalau pricing DG butuh info ini, ini **gap fungsional**, bukan sekadar "tak di-prefill". |
| **Cargo Type checklist** (#23) | Inquiry-only (normal/dg/liquid/reefer/oversize/permit). PRF hanya punya `commodity` enum (general/special_permit/dg) yang mewakili sebagian. | **Sebagian hilang** — karakteristik liquid/reefer/oversize yang ditandai di inquiry tak terbawa. `dg`/`special_permit` diwakili `commodity` PRF (tapi tetap tak di-prefill). Perlu keputusan: relevan untuk pricing? |

---

## JAWABAN CATATAN KHUSUS

Status per-field yang disebut dalam rencana perubahan form PRF:

| Field yang ditanyakan | Ada di Inquiry? | Ada di PRF? | Status ringkas |
|---|---|---|---|
| **incoterm** | ✅ ya (multi pill, `Inquiry:427–432`) | ✅ ya (dropdown tunggal, `PRF:588–596`) | **DI DUA-DUANYA.** Prefill **sebagian**: ambil elemen pertama hanya bila token cocok daftar PRF. `CFR/CNF` & `DDU/DAP` inquiry tak punya padanan → tak tersalin. |
| **volume (CBM)** | ✅ ya (Volume CBM, `Inquiry:453–458`) | ⚠️ ya **tapi hanya di child** Sea-LCL/Air (`PRF:703,:714`) | **DI DUA-DUANYA secara konsep**, beda struktur (umum vs per-moda). **Tidak di-prefill.** |
| **commodity name / nama barang** | ✅ ya — **DUA field**: `commodity` (teks bebas `:468`) **dan** `goods_name` "Nama Barang" (`:442`) | `commodity` ✅ ya (enum `:546`) · `goods_name` ❌ **tidak ada** | `commodity` **di dua-duanya** (vocab beda, tak di-prefill). `goods_name` **hanya di Inquiry** — tak ada slot di PRF (**potensi gap**). |
| **service type / jenis layanan** | ✅ ya (`:382–389`) | ✅ ya (`:575–587`) | **DI DUA-DUANYA**, tapi **sumbu beda** (lini bisnis vs moda) — **TD-108**. **Tidak di-prefill**, hanya teks bantu. |
| **stream** | ❌ tidak | ✅ ya (`:510–518`) | **HANYA di PRF.** Tak ada di inquiry → tak bisa di-prefill. |
| **deadline quotation** | ✅ ya (Deadline Quote, `:376–378`) | ✅ ya (Deadline Quotation, wajib, `:519–522`) | **DI DUA-DUANYA.** **Sudah di-prefill** (`:106`). |
| **cargo ready date** | ❌ tidak (inquiry hanya punya Deadline Quote) | ✅ ya (wajib, `:650–653`) | **HANYA di PRF.** Beda makna dari Deadline Quote → tak bisa disamakan. |
| **cargo type** | ✅ ya (checklist 6 nilai, `:482–484`) | ❌ tidak (hanya `commodity` enum yang mewakili sebagian) | **HANYA di Inquiry** sebagai field khusus. Info liquid/reefer/oversize tak terbawa. |
| **dimensi** | ✅ ya (`:462`) | ⚠️ ya **tapi hanya di child** Sea-LCL/Air/Inland (`PRF:702,:713,:734`) | **DI DUA-DUANYA secara konsep**, beda struktur. **Tidak di-prefill.** |
| **HS code** | ✅ ya (`:443`) | ✅ ya (wajib 8-digit bila import/export, `:559–562`) | **DI DUA-DUANYA.** **Sudah di-prefill** (`:101`) — ⚠️ lihat Ambigu #1 (sanitasi 8-digit). |
| **special permit** | ✅ ya — sebagai **cargo_types 'permit'** ("Izin Khusus BPOM/Kementan", `:41`,`:482–484`) | ✅ ya — sebagai **commodity 'special_permit'** (`:32`,`:546–555`) **dan** add-on import/export_license, LS (`:56–59`) | **DI DUA-DUANYA tapi lewat FIELD BERBEDA** (cargo_types checkbox di Inquiry vs commodity enum + add-on di PRF). **Tidak di-prefill.** |

### Soal "Sumber" di form PRF

**Hanya ada satu opsi: Inquiry.** Di `PRFFormPage.jsx:491–496` "Sumber" dirender sebagai **chip read-only bertuliskan "Inquiry"** + teks "PRF selalu diterbitkan dari sebuah inquiry." State `customer_source` di-hardcode `'inquiry'` (`:173`) dan payload selalu menulis `'inquiry'` (`:399`). **Tidak ada** toggle/pilihan sumber lain (Customer/Prospect/Manual). Ini konsisten dengan keputusan yang tercatat: pilihan sumber Customer/Prospect **dicabut** dari form PRF (CLAUDE.md, entri 19 Jul 2026 — "PRF hanya boleh lahir DARI INQUIRY"). Kolom DB `prf.customer_source` masih menyimpan nilai lain untuk baris historis, tapi UI saat ini mengunci ke Inquiry.

> Catatan pembeda: toggle **Prospect/Customer** yang ADA di form **Inquiry** (`:347–356`) adalah pilihan **akun** untuk inquiry itu — bukan "sumber PRF". Jangan tertukar.

---

## CATATAN AMBIGU

Hal-hal yang tidak bisa dipastikan hanya dari kode, atau nuansa yang perlu keputusan sebelum eksekusi prefill:

1. **HS Code — sanitasi saat prefill.** Field HS di **Inquiry** teks bebas (placeholder `0000.00.00`, boleh titik). `applyInquiryData` menyalin nilai **mentah** ke PRF (`:101`), **melewati** sanitizer PRF yang memaksa digit-only + potong 8 (`:560`). Akibatnya HS ber-titik/kurang-dari-8-digit dari inquiry bisa mendarat di PRF dalam bentuk tak valid dan **memblokir Submit** (PRF mewajibkan tepat 8 digit untuk import/export, `:313`) sampai user mengetik ulang. Belum bisa dipastikan apakah data inquiry nyata mengandung titik — perlu cek data.

2. **Incoterm — kehilangan data multi→tunggal.** Inquiry multi-select; PRF tunggal. Bila inquiry punya >1 incoterm, hanya `[0]` yang dipertimbangkan, sisanya hilang tanpa jejak. Selain itu 2 dari 6 nilai inquiry (`CFR/CNF`, `DDU/DAP`) tak punya padanan di daftar PRF. Apakah pemetaan `CFR/CNF→CFR`, `DDU/DAP→DAP` diinginkan = keputusan bisnis.

3. **Volume/Berat/Dimensi/Kontainer → child per moda.** Karena PRF menaruh spesifikasi ini di dalam Section 03 yang bergantung Service Type, prefill 1:1 tak mungkin tanpa aturan "field umum inquiry masuk ke child moda mana". Contoh: inquiry `volume_cbm` → `sea_lcl_volume` (bila Sea-LCL) **atau** `air_volume` (bila Air)? Perlu keputusan mapping + kapan mengisinya (saat service_type dipilih, bukan saat inquiry dipilih).

4. **Alamat: dua pasang field di PRF.** PRF punya **Pickup/Delivery Address utama** (`:621–628`, yang di-prefill dari inquiry) **dan** **Inland Pickup/Delivery Address terpisah** di child Inland (`:728–731`, tidak di-prefill). Bila Service Type = Inland, user berpotensi mengisi alamat **dua kali**. Perlu keputusan: apakah alamat Inland seharusnya mewarisi dari alamat utama / dari inquiry.

5. **MSDS — beda tipe.** Inquiry `has_msds` = teks 3-nilai; PRF `msds_available` = boolean. Pemetaan "Ya→true" jelas, tapi "Belum Tahu"→? tidak terdefinisi. Selain itu keduanya muncul di kondisi berbeda (inquiry: cargo_type DG; PRF: commodity DG) yang **tidak di-prefill**, jadi kondisi DG pun tak otomatis sinkron.

6. **goods_name & DG detail (UN/IMO) tak ada di PRF.** Ini **bukan** soal prefill melainkan ketiadaan kolom/field di PRF (tabel `prf` tak punya `goods_name`/`un_number`/`imo_class`). Tidak bisa dipastikan dari kode apakah ini keputusan sadar (procurement tak butuh) atau gap. Menambahkannya = perubahan skema + form, di luar lingkup "prefill".

7. **Cargo Type checklist tak terwakili penuh.** Karakteristik liquid/reefer/oversize (yang memengaruhi penanganan & harga) ditandai di inquiry tapi tak punya tempat di PRF. Apakah relevan untuk pricing procurement = keputusan bisnis.

8. **Batas metode audit.** Seluruh temuan berbasis pembacaan kode + skema, **bukan tes runtime**. Perilaku prefill aktual (mis. apakah `onInquiryPick` vs prop `prefillInquiryId` menghasilkan hasil identik) diverifikasi dari alur kode: keduanya memanggil `applyInquiryData` dengan field-select yang sama (`:218` vs `:202`), jadi set field yang tersalin sama — tapi ini kesimpulan dari kode, bukan pengamatan layar.

---

*Akhir laporan. Tidak ada file kode/dokumen lain yang disentuh.*
