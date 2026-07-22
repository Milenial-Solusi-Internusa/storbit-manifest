> **CATATAN 22 Jul 2026 — sebagian USANG.**
> Ditulis sebelum batch PRF multi vendor + currency.
> Pernyataan "PRF tidak punya mesin kurs sama sekali" sudah tidak berlaku:
> prf.exchange_rates dan prf_cost_items.exchange_rate kini LIVE.
> Temuan lain masih berlaku. Rujuk 08_TECH_DEBT.md untuk status terkini.

# AUDIT_CURRENCY.md — Penanganan Mata Uang di Rantai PRF → Quotation (Total Modal / cost / margin)

> Auditor read-only, kritis. Tanggal: 2026-07-21. Scope: currency di `prf`, `prf_cost_items`, `quotations`, `quotation_items`, `sales_orders` — khusus perhitungan Total Modal / cost_total / cost_price / margin. Plus dump lengkap `prf_cost_items` (bahan ALTER). **Tidak** mengaudit `rate_sheets` (sudah dibuktikan terputus di `AUDIT_PRF_VENDOR.md`). Tidak ada file kode/DB yang diubah; tidak ada SQL dijalankan.
> Sumber: `supabase/schema_snapshot.sql`, `src/modules/procurement/PRFDetailPage.jsx`, `src/modules/crm/QuotationFormPage.jsx`, `QuotationDetailPage.jsx`, `QuotationPDF.jsx`, `docs/Governance/03_DATA_MODEL.md`.

---

## RINGKASAN EKSEKUTIF

**Penanganan currency di sisi PRF adalah fasad: kolom `currency` ada di `prf_cost_items`, tapi TIDAK ADA satu pun perhitungan yang menghormatinya.** `PRFDetailPage.jsx:107` menghitung `Total Modal = rows.reduce((s, r) => s + num(r.amount), 0)` — menjumlah `amount` mentah **lintas currency**, lalu melabeli hasilnya dengan **satu** currency header (`answer.rate_currency`, `:308`). Selama semua baris IDR (kondisi saat ini — `rate_currency` default `'IDR'`, semua data seed IDR), angkanya kebetulan benar. Begitu ada satu baris non-IDR (mis. Ocean Freight 500 USD) dicampur dengan baris IDR, "Total Modal" menjadi penjumlahan omong-kosong (500 + 8.000.000 = 8.000.500 "sesuatu"), dan karena `untung = sell − totalModal` (`:109`) dan `margin = untung/sell` (`:110`), **untung & margin ikut salah** — lalu `cost_total: totalModal` (`:190`) mengalir ke quotation sebagai `cost_price` yang menyuapi margin yang dilihat sales/manager. Tidak ada yang mencegah data campur: `prf_cost_items.currency` tidak punya CHECK, tidak punya FK ke `currencies`, dan currency per-baris bisa diedit bebas di UI.

**PRF tidak punya mesin kurs sama sekali.** Tidak ada kolom kurs di `prf` maupun `prf_cost_items`, tidak ada input kurs di UI PRF, dan master `public.exchange_rates` (`schema:3162`, lengkap dengan `from/to_currency`, `rate`, `effective_date`) **nol query di seluruh `src/`** — tabel FX mati. Artinya bahkan kalau seseorang ingin menjumlahkan biaya multi-currency dengan benar, tidak ada sumber kurs yang dipakai. Bandingkan dengan sisi **quotation** yang justru sudah benar: `calcRowTotal` (`QuotationFormPage.jsx:155-160`) mengonversi tiap baris ke IDR (`IDR→×1`, lainnya `×exchange_rate` per baris), sehingga `subtotal`/`tax`/`grandTotal`/`totalCost`/`margin` semuanya ternormalisasi ke IDR. Jadi ada **asimetri berbahaya**: quotation currency-aware, PRF currency-blind, padahal keduanya disambungkan lewat `cost_total`.

**Kabar "baik" (untuk mengukur risiko sekarang):** karena data produksi kemungkinan besar 100% IDR, cacat-cacat ini masih **laten** — belum ada angka salah yang keluar ke customer hari ini. Tapi ini persis jebakan yang akan meledak begitu batch "tambah kolom currency + kurs ke `prf_cost_items`" dijalankan: menambah kolom currency **tanpa** memperbaiki `totalModal` (`:107`) + `cost_total` (`:190`) + prefill quotation akan **mengaktifkan** jalur salah yang sekarang tidur. Currency di seluruh rantai PRF/quotation juga free-text tak tervalidasi (tanpa FK ke `currencies`, tanpa CHECK), jadi 'usd'/'USD'/'Rp'/typo diterima diam-diam — meracuni GROUP BY currency apa pun di masa depan.

---

## STRUKTUR `prf_cost_items` (dump lengkap — bahan ALTER)

**CREATE TABLE** (`schema_snapshot.sql:3893-3905`):

| Kolom | Tipe | Nullable | Default | Catatan |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `prf_id` | uuid | NOT NULL | — | FK → `prf(id)` ON DELETE CASCADE |
| `component` | text | NOT NULL | — | teks bebas (mis. "Ocean Freight") |
| `cost_type` | text | NOT NULL | `'vendor'` | CHECK ∈ {`vendor`,`internal`} |
| `amount` | numeric(18,2) | NOT NULL | `0` | nilai uang |
| **`currency`** | **text** | **NOT NULL** | **`'IDR'`** | **NO CHECK, NO FK — free text** |
| `sort_order` | integer | NOT NULL | `0` | |
| `notes` | text | NULL | — | |
| `created_at` | timestamptz | NULL | `now()` | |
| `updated_at` | timestamptz | NULL | `now()` | diisi trigger |

**Constraint:**
- PK: `prf_cost_items_pkey` PRIMARY KEY (`id`) — `schema:5734`.
- CHECK: `prf_cost_items_cost_type_check CHECK (cost_type = ANY (ARRAY['vendor','internal']))` — `schema:3904`. **Tidak ada CHECK pada `currency` maupun `amount`.**
- FK: `prf_cost_items_prf_id_fkey FOREIGN KEY (prf_id) REFERENCES prf(id) ON DELETE CASCADE` — `schema:9115`.
- UNIQUE: **tidak ada** (selain PK).

**Index:**
- `idx_prf_cost_items_prf_id` btree(`prf_id`) — `schema:6948`. (Tidak ada index pada `currency`.)

**Trigger:**
- `set_prf_cost_items_updated_at BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()` — `schema:7305`. (Housekeeping `updated_at` saja; tidak menyentuh currency/amount.)

**RLS (ENABLE ROW LEVEL SECURITY, `schema:11690`) — 4 policy, semua diturunkan dari induk `prf` via `EXISTS`:**
- `prf_cost_items_select` (SELECT, TO authenticated, `schema:11714`): USING `EXISTS(prf p WHERE p.id=prf_id AND (is_super_admin() OR (p.company_id=get_user_company_id() AND (p.created_by=auth.uid() OR has_role('procurement') OR is_manager_or_above()))))`.
- `prf_cost_items_insert` (INSERT, `schema:11705`): WITH CHECK `EXISTS(prf p WHERE p.id=prf_id AND (is_super_admin() OR (p.deleted_at IS NULL AND p.company_id=get_user_company_id() AND has_role('procurement') AND p.status='SUBMITTED')))`.
- `prf_cost_items_update` (UPDATE, `schema:11723`): USING & WITH CHECK sama seperti insert (procurement + status SUBMITTED).
- `prf_cost_items_delete` (DELETE, `schema:11696`): USING sama seperti insert.

**GRANT:** tidak muncul di snapshot (dump `--no-privileges`, konsisten TD-63). `03_DATA_MODEL.md:72` mengklaim "GRANT SELECT/INSERT/UPDATE/DELETE authenticated" — **tak bisa diverifikasi dari snapshot**, catat sebagai asumsi.

> **Implikasi untuk ALTER nanti:** menambah `currency`-per-baris sudah ada (tinggal dipakai); yang belum ada = **kolom kurs** (mis. `exchange_rate numeric` atau FK ke `exchange_rates`). Semua RLS turunan dari `prf` → menambah kolom **tidak** memaksa perubahan policy (policy tidak menyebut kolom apa pun selain lewat induk). Trigger `updated_at` aman. Tidak ada generated column / view yang tergantung struktur ini (lihat Peta Dampak).

---

## JAWABAN PERTANYAAN 1-6

### 1. PENYIMPANAN CURRENCY — tabel mana punya kolom currency?

| Tabel | Kolom currency | Tipe | Null | Default | CHECK | FK→currencies |
|---|---|---|---|---|---|---|
| `prf` | `rate_currency` (`schema:3879`) | text | NOT NULL | `'IDR'` | tidak | **tidak** |
| `prf` | `commercial_currency` (`schema:3849`) | text | NULL | — | tidak | **tidak** |
| `prf_cost_items` | `currency` (`schema:3899`) | text | NOT NULL | `'IDR'` | tidak | **tidak** |
| `quotations` | `currency_code` (`schema:4155`) | varchar | NULL | `'IDR'` | tidak | **tidak** |
| `quotations` | `usd_rate` (`schema:4168`) | numeric(15,2) | NULL | `16000` | tidak | (kurs, bukan kode) |
| `quotations` | `exchange_rates` (`schema:4187`) | jsonb | NOT NULL | `'{}'` | tidak | (tabel kurs per-quotation) |
| `quotations` | `vat_rate` (`schema:4176`) | numeric | NULL | `0.011` | tidak | (pajak, bukan currency) |
| `quotation_items` | `currency` (`schema:4131`) | varchar | NULL | `'IDR'` | tidak | **tidak** |
| `quotation_items` | `exchange_rate` (`schema:4133`) | numeric(15,2) | NULL | `1` | tidak | (kurs per-baris) |
| `sales_orders` | **— TIDAK ADA —** | | | | | |

**Tabel yang menyimpan angka uang TAPI tanpa kolom currency (ditandai eksplisit):**
- **`sales_orders`** (`schema:4335`): **tidak menyimpan uang sama sekali** — hanya `so_no`, `status` (DRAFT/SENT), `inquiry_id`, `account_id`, `signed`/`sign_link`. Dokumen tanda-tangan tipis; nilai uang ada di quotation. Jadi "currency di sales_orders" = tidak relevan (tidak ada uang). **Tidak ada tabel `sales_order_items`.**
- **`sp_items`** (`schema:4432`): `unit_price numeric(18,2)`, `shipping_price numeric(18,2)` — **tanpa kolom currency** → IDR implisit tak terdokumentasi. (Storbit/SOA, domestik — asumsi IDR wajar, tapi tak dijaga.)
- **`sp_order_items`** (`schema:4507`): `unit_price`, `shipping_price` — **tanpa kolom currency** juga.
- `sp_orders` (`schema:4535`): header, tak ada uang.

**Temuan lintas-tabel:** **nol** kolom currency di rantai PRF/quotation punya FK ke `currencies(code)` atau CHECK. Bandingkan: `customers`, `vendors`, `hrga_requests`, `exchange_rates` **punya** FK `currency_code → currencies(code)` (`schema:8179/9851/8747/8507`). Jadi konvensi validasi currency ADA di repo, tapi **PRF & quotation justru dikecualikan** — currency mereka free text.

### 2. SNAPSHOT vs REFERENSI — angka biaya diketik atau di-copy?

**`prf_cost_items.amount` = diketik manual user (snapshot), bukan JOIN.** Bukti: `PRFDetailPage.jsx:282` — input teks bebas `onChange={e => patchRow(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))}`. Tidak ada sumber referensi (tidak ada rate card, tidak ada produk, tidak ada FX). User mengetik `component`, `amount`, `currency`, `cost_type` per baris lalu simpan via RPC `save_prf_pricing`. Jadi `prf_cost_items` = data primer yang dimasukkan tangan, **di-snapshot** (tersimpan apa adanya).

**PRF → quotation = snapshot (copy), bukan JOIN.** Bukti: `PRFDetailPage.jsx:184-191` `handleCreateQuotation` mengirim `cost_total: totalModal` (`:190`), `suggested_rate`, `rate_currency`, `valid_until` sebagai payload prefill. Di `QuotationFormPage.jsx` (efek prefill, sekitar `:640-648`): dibuat SATU baris `{ ...freshRow(), currency: p.rate_currency, unit_price: suggested_rate, cost_price: p.cost_total }`, lalu `row.total = calcRowTotal(row)`. **Nilai disalin ke `quotation_items`, tidak ada FK/JOIN balik ke `prf_cost_items`.** Setelah tersalin, ubah PRF tidak mengubah quotation (dan sebaliknya). Rincian per-komponen + label vendor/internal **runtuh jadi satu `cost_price`** (lihat juga AUDIT_PRF_VENDOR.md).

### 3. KURS — ada master kurs / kolom kurs / input kurs?

**Ada master, tapi mati di sisi PRF.**
- Master FX: **`public.exchange_rates`** (`schema:3162`) — `company_id`, `from_currency`/`to_currency` (FK ke currencies), `rate numeric(18,6)`, `effective_date`, CHECK `rate>0` + no-self-conversion. **Nol query di `src/`** (`grep from('exchange_rates')` = kosong) → **tabel FX tidak dipakai aplikasi**.
- Master currency: `public.currencies` (`schema:2594`) — `code`, `name`, `symbol`, `decimal_places`, `is_active`. Dipakai hanya untuk **daftar dropdown** kode currency (`QuotationFormPage.jsx:475`, `PRFFormPage.jsx:201`, `DropdownManagementPage.jsx:356`). **`symbol` & `decimal_places` tidak pernah dipakai** untuk format uang (semua hardcode "Rp"/`id-ID`/2 desimal).
- Kolom kurs di dokumen: **quotation punya** (`quotations.exchange_rates` jsonb per-quotation + `quotation_items.exchange_rate` per-baris + `usd_rate` legacy). **PRF & prf_cost_items: TIDAK ADA kolom kurs.**
- Input kurs manual di UI: **hanya di quotation** — `QuotationFormPage.jsx:292` (input `exchange_rate` per-baris, `readOnly`, diturunkan dari tabel kurs header). **PRF: tidak ada input kurs sama sekali.**

Jadi: kurs eksis sebagai fitur quotation (manual per-quotation, TIDAK memakai master `exchange_rates`), dan **sama sekali tidak ada di PRF**. Master `exchange_rates` menganggur (kaitan TD-74 di dokumen).

### 4. TITIK HITUNG — semua tempat yang menjumlahkan uang (LENGKAP)

Semua di **JS client** (tidak ada RPC/view/generated column yang menghitung total — RPC `save_quotation`/`save_prf_pricing` hanya menyimpan angka yang sudah dihitung FE):

| # | file:line | Menghitung | Currency-aware? |
|---|---|---|---|
| 1 | `PRFDetailPage.jsx:107` | `totalModal = rows.reduce((s,r)=>s+num(r.amount),0)` | **TIDAK** — jumlah mentah, abaikan `r.currency` |
| 2 | `PRFDetailPage.jsx:109` | `untung = sell − totalModal` | **TIDAK** — `sell` (`rate_currency`) − `totalModal` (campur) |
| 3 | `PRFDetailPage.jsx:110` | `margin = untung/sell*100` | **TIDAK** — turunan dari #1/#2 |
| 4 | `PRFDetailPage.jsx:190` | `cost_total = totalModal` → payload quotation | **TIDAK** — mewarisi #1 |
| 5 | `QuotationFormPage.jsx:155-160` | `calcRowTotal = unit_price × qty × (IDR?1:exchange_rate)` | **YA** — konversi ke IDR |
| 6 | `QuotationFormPage.jsx:359` | section total `Σ (if_any?0:total)` | YA (total sudah IDR dari #5) |
| 7 | `QuotationDetailPage.jsx:231` | `subtotal = Σ (if_any?0:total)` | YA (total IDR) |
| 8 | `QuotationDetailPage.jsx:233` | `discountAmount = subtotal×pct/100` | YA (basis IDR) |
| 9 | `QuotationDetailPage.jsx:235` | `tax = (subtotal−disc)×vat` | YA |
| 10 | `QuotationDetailPage.jsx:236` | `grandTotal = (subtotal−disc)+tax` | YA |
| 11 | `QuotationDetailPage.jsx:238-245` | `totalCost = Σ cost_price × qty × exchange_rate` | **YA** — konversi ke IDR |
| 12 | `QuotationDetailPage.jsx:246-247` | `grossProfit = subtotal−totalCost`; `marginPct` | YA (dua-duanya IDR) |
| 13 | `QuotationDetailPage.jsx:403-404` | `secCost = Σ cost_price × qty × exchange_rate` | YA |
| 14 | `QuotationDetailPage.jsx:456` | margin per-section | YA |
| 15 | `QuotationPDF.jsx:114-120` | fallback `subtotalCalc/tax/grandTotal` | YA (dari stored/`total` IDR) |

**Kesimpulan #4:** titik hitung #1-4 (semua di PRF) **currency-blind**; #5-15 (semua di quotation) **currency-aware** (normalisasi ke IDR). Titik yang wajib difilter saat currency diaktifkan di PRF = **#1, #2, #4** (dan #3 otomatis ikut). `cost_price` yang masuk quotation dari PRF (#4→prefill) juga perlu diperhatikan: ia menjadi satu baris dengan `exchange_rate` default (lihat Temuan HIGH-2).

### 5. TAMPILAN — simbol mata uang & hardcode "Rp"

**Formatter (semua hardcode `id-ID`, tak pakai `currencies.symbol`/`decimal_places`):**
- `PRFDetailPage.jsx:34` — `money = (v) => toLocaleString('id-ID', {maximumFractionDigits:2})` (tanpa "Rp").
- `QuotationDetailPage.jsx:31` — `rp = 'Rp ' + toLocaleString('id-ID')`; `:32` `rpN` (tanpa Rp).
- `QuotationFormPage.jsx:36` — `rp = 'Rp ' + toLocaleString('id-ID')`.
- `QuotationPDF.jsx:14` — `rpN` id-ID tanpa Rp (caller tambah "Rp ").

**Hardcode "Rp" — file:line:**
- `PRFDetailPage.jsx:384` — `Rp {money(q.total_amount)}` (panel riwayat quotation).
- `QuotationDetailPage.jsx:647` `Rp {rpN(row.total)}`, `:658` `Rp {rpN(sec.total)}`, `:671` subtotal, `:676` `−Rp` diskon, `:681` tax, `:686` `Rp {total_amount}`.
- `QuotationPDF.jsx:229/239/249/254/260/265` — Rp pada row/section/subtotal/discount/tax/grand.

**Apakah ada baris non-IDR dirender dengan "Rp"? — analisis jujur (BUKAN CRITICAL, dan ini kenapa):** Di quotation, `row.total`/`sec.total`/`subtotal`/`grandTotal` **sudah dikonversi ke IDR** (titik hitung #5/#11). Jadi `Rp {row.total}` menampilkan **ekuivalen IDR** yang benar; currency asli + kurs ditampilkan terpisah di sebelahnya (`QuotationDetailPage.jsx:433-445`, `QuotationPDF.jsx:222/230-231`). Jadi "Rp" pada nilai IDR-ternormalisasi **bukan mislabel** — angka itu memang IDR. Ini saya nyatakan eksplisit supaya tidak jadi temuan CRITICAL palsu.

**Di PRF berbeda:** `Total Modal`/`Untung` **tidak** hardcode "Rp" — mereka pakai `money()` + label `sub={answer.rate_currency}` (`PRFDetailPage.jsx:308/315`). Jadi masalah PRF **bukan** hardcode Rp, melainkan (a) **angka salah** (jumlah lintas-currency) dan (b) **label currency tunggal** yang mengklaim semua = `rate_currency`. `PRFDetailPage.jsx:384` (`Rp {q.total_amount}`) satu-satunya hardcode Rp di PRF, dan itu pada `total_amount` quotation yang sudah IDR → benar, tapi hardcode (LOW).

### 6. DATA NYATA — query sebaran currency & cost_type (tulis saja, jangan jalankan)

Lihat bagian **SQL PEMERIKSAAN DATA** di bawah.

---

## TEMUAN

### [HIGH] `Total Modal` menjumlah biaya lintas-currency tanpa konversi → untung & margin salah (→ CRITICAL saat data multi-currency)
`PRFDetailPage.jsx:107` `totalModal = rows.reduce((s,r)=>s+num(r.amount),0)` mengabaikan `r.currency`; dilabeli `rate_currency` tunggal (`:308`). `untung`/`margin` (`:109-110`) & `cost_total` (`:190`) mewarisinya.
**Dampak nyata:** untuk PRF dengan baris beda-currency (mis. Ocean Freight USD + trucking IDR), Total Modal = penjumlahan mentah tak bermakna → Untung/Margin salah → `cost_total` salah menyuapi `cost_price` quotation → `grossProfit/marginPct` (`QuotationDetailPage.jsx:246-247`) yang **dipakai sales/manager untuk memutuskan harga** ikut salah. Per rubrik ini **CRITICAL** ("margin salah dipakai keputusan"); dinilai **HIGH sekarang** hanya karena data diduga 100% IDR (laten). **Menambah kolom currency ke `prf_cost_items` tanpa memperbaiki `:107` akan mengubah ini dari laten jadi aktif.**
**Rekomendasi:** saat currency diaktifkan, `totalModal` wajib konversi per-baris ke satu base (butuh kurs — lihat HIGH-3); atau larang campur currency dalam satu PRF via CHECK/validasi.

### [HIGH] PRF → quotation memipihkan cost multi-currency jadi satu `cost_price` tanpa kurs yang benar
`PRFDetailPage.jsx:190` `cost_total = totalModal` (sudah tercemar) → `QuotationFormPage.jsx` prefill membuat SATU baris `cost_price = cost_total`, `currency = rate_currency`, tapi `exchange_rate` dari `freshRow()` default (`=1`, `:144`) dan tak di-seed dari tabel kurs.
**Dampak nyata:** kalau `rate_currency` non-IDR, `totalCost` quotation (`QuotationDetailPage.jsx:238-245` = `cost_price × qty × exchange_rate`) memakai `exchange_rate=1` → cost tak terkonversi → margin quotation salah. Bahkan untuk single-currency non-IDR, basis modal quotation keliru.
**Rekomendasi:** saat prefill, set `exchange_rate` baris cost dari kurs yang relevan, atau simpan cost dalam IDR-base sejak dari PRF.

### [HIGH] Tidak ada mesin kurs di PRF; master `exchange_rates` menganggur
`prf`/`prf_cost_items` tanpa kolom kurs; UI PRF tanpa input kurs; `public.exchange_rates` (`schema:3162`) **0 query di src**.
**Dampak nyata:** currency di `prf_cost_items` **secara struktural tak bisa dikonversi** — tidak ada sumber angka kurs. `untung = sell(rate_currency) − totalModal(campur)` lintas mata uang mustahil benar tanpa kurs. Ini akar dari HIGH-1/HIGH-2.
**Rekomendasi:** batch "tambah kurs" sebaiknya **memakai `exchange_rates`** (yang sudah ada, FK ke currencies, punya effective_date) daripada mengulang pola jsonb ad-hoc quotation. Putuskan: kurs per-baris cost, atau kurs per-PRF?

### [MEDIUM] Currency di seluruh rantai PRF/quotation = free text tak tervalidasi (tanpa FK ke `currencies`, tanpa CHECK)
`prf.rate_currency`, `prf.commercial_currency`, `prf_cost_items.currency`, `quotations.currency_code`, `quotation_items.currency` — semua `text/varchar` tanpa FK/CHECK (`schema:3849/3879/3899/4155/4131`). Konvensi FK→`currencies(code)` ADA di repo (`customers`/`vendors`/`hrga_requests`/`exchange_rates`) tapi rantai ini dikecualikan.
**Dampak nyata:** 'usd'/'USD'/'Rp'/typo/`' IDR '` diterima diam-diam. `calcRowTotal` (`QuotationFormPage.jsx:159`) membandingkan `row.currency === 'IDR'` **case-sensitive** → 'idr' akan dianggap non-IDR dan dikali `exchange_rate` (default 0/1) → total salah. Juga meracuni GROUP BY currency & pelaporan.
**Rekomendasi:** tambah FK ke `currencies(code)` (atau minimal CHECK + normalisasi uppercase) pada kolom-kolom ini — sekalian saat ALTER `prf_cost_items`.

### [MEDIUM] Infrastruktur tampilan multi-currency ada tapi tak dipakai (`currencies.symbol`/`decimal_places`)
`currencies` punya `symbol` & `decimal_places` (`schema:2597-2598`), tapi semua formatter hardcode "Rp"/`id-ID`/2 desimal (`PRFDetailPage.jsx:34`, `QuotationDetailPage.jsx:31`, dst.).
**Dampak nyata:** begitu non-IDR benar-benar dipakai, angka non-IDR akan tetap tampil dengan gaya IDR (mis. JPY 0-desimal salah tampil 2 desimal). Bukan salah-hitung, tapi salah-tampil.
**Rekomendasi:** kalau multi-currency serius, formatter harus terima kode currency + baca `symbol`/`decimal_places`. Kalau tidak, dokumentasikan "IDR-only display".

### [LOW] `PRFDetailPage.jsx:384` hardcode "Rp" pada `quotation.total_amount`
`Rp {money(q.total_amount)}` di panel riwayat quotation.
**Dampak nyata:** rendah — `total_amount` quotation ternormalisasi IDR, jadi benar sekarang. Tapi hardcode = utang bila quotation kelak multi-currency display.
**Rekomendasi:** ikutkan ke pembersihan formatter (MEDIUM di atas).

### [LOW] `sp_items`/`sp_order_items` menyimpan uang tanpa kolom currency; `sales_orders` tanpa uang
`sp_items.unit_price/shipping_price` (`schema:4446-4447`), `sp_order_items.unit_price/shipping_price` (`schema:4516-4518`) — tanpa currency (IDR implisit). `sales_orders` (`schema:4335`) tanpa uang sama sekali.
**Dampak nyata:** rendah & di luar rantai margin PRF/quotation (Storbit domestik = IDR). Dicatat karena user menyebut `sales_orders`: **tidak ada uang di sana**, jadi bukan titik risiko currency.
**Rekomendasi:** biarkan; kalau SP kelak multi-currency, baru tambah kolom.

---

## PETA DAMPAK PERUBAHAN — kalau `prf_cost_items` +kolom currency (+kurs)

### WAJIB berubah
| Area | Item | Alasan |
|---|---|---|
| DB | `ALTER prf_cost_items` — sudah ada `currency`; **tambah kolom kurs** (mis. `exchange_rate numeric(18,6)` atau FK ke `exchange_rates`) | Tak ada mekanisme konversi sekarang (HIGH-3) |
| DB | (disarankan) FK/CHECK currency → `currencies(code)` pada `prf_cost_items.currency` (+ sekalian `prf.rate_currency`) | Free text tak tervalidasi (MEDIUM) |
| FE | `PRFDetailPage.jsx:107` `totalModal` → konversi per-baris | Titik hitung #1, akar HIGH-1 |
| FE | `PRFDetailPage.jsx:109-110` `untung`/`margin` | Turunan #1 |
| FE | `PRFDetailPage.jsx:190` `cost_total` payload | Titik hitung #4 → hilir quotation (HIGH-1/2) |
| FE | `PRFDetailPage.jsx:98/282-283/308/315` — input+display currency/kurs per-baris + label Total Modal | UI harus tampilkan & minta kurs |
| FE | `QuotationFormPage.jsx` prefill (`~:640-648`) — set `exchange_rate` baris cost dari PRF | HIGH-2 |
| DB/RPC | `save_prf_pricing` (RPC) — bila kolom kurs baru harus ikut disimpan | RPC saat ini tak tahu kolom kurs |
| Migrasi | file migrasi + refresh `schema_snapshot.sql` (pg_dump) | Konvensi wajib repo |

### MUNGKIN berubah (tergantung keputusan desain)
| Area | Item | Kapan |
|---|---|---|
| DB | Hidupkan/pakai master `exchange_rates` (seed kurs, RPC lookup) | Kalau kurs mau tersentralisasi, bukan diketik per-PRF |
| FE | Formatter uang (`money`/`rp`/`rpN`) baca `currencies.symbol`/`decimal_places` | Kalau non-IDR ditampilkan (MEDIUM) |
| FE | `QuotationDetailPage`/`QuotationPDF` — bila cost dari PRF non-IDR mengubah tampilan margin | Kalau non-IDR mengalir ke quotation |
| DB | CHECK "satu PRF satu currency" atau izinkan campur + wajib kurs | Keputusan bisnis |

### TIDAK TERSENTUH
| Area | Alasan |
|---|---|
| RLS `prf_cost_items` (4 policy) | Policy diturunkan dari `prf` via EXISTS, tak menyebut kolom currency/kurs → +kolom tak memecahkannya |
| Trigger `set_prf_cost_items_updated_at` | Housekeeping `updated_at` saja |
| Index `idx_prf_cost_items_prf_id` | Tak terkait currency |
| Sisi hitung quotation (#5-15) | Sudah currency-aware; asal cost_price masuk benar, tak perlu diubah |
| `sales_orders`, `sp_items`, `sp_order_items` | Di luar rantai; tak ada currency (sales_orders tanpa uang) |
| `rate_sheets` | Terputus dari PRF (AUDIT_PRF_VENDOR.md) |
| Generated column / view SQL | **Tidak ada** yang menghitung total (semua di JS) → tak ada view/generated yang perlu diubah |

---

## SQL PEMERIKSAAN DATA (jalankan manual — read-only)

```sql
-- 1. Sebaran currency di prf_cost_items (seberapa besar data non-IDR / campur?)
SELECT currency, COUNT(*) AS n_baris, COUNT(DISTINCT prf_id) AS n_prf,
       SUM(amount) AS jumlah_amount
FROM public.prf_cost_items
GROUP BY currency
ORDER BY n_baris DESC;

-- 2. PRF yang punya cost item LEBIH DARI SATU currency (target bug Total Modal)
--    Kalau ada baris di sini, Total Modal/Untung/Margin PRF itu SUDAH salah.
SELECT ci.prf_id, p.prf_no,
       COUNT(DISTINCT ci.currency) AS jml_currency,
       string_agg(DISTINCT ci.currency, ',') AS daftar_currency
FROM public.prf_cost_items ci
JOIN public.prf p ON p.id = ci.prf_id AND p.deleted_at IS NULL
GROUP BY ci.prf_id, p.prf_no
HAVING COUNT(DISTINCT ci.currency) > 1
ORDER BY jml_currency DESC;

-- 3. PRF yang currency baris cost-nya BEDA dari rate_currency header
--    (sell vs cost beda mata uang → untung/margin lintas-currency)
SELECT p.prf_no, p.rate_currency AS header_currency,
       string_agg(DISTINCT ci.currency, ',') AS currency_baris
FROM public.prf p
JOIN public.prf_cost_items ci ON ci.prf_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.prf_no, p.rate_currency
HAVING bool_or(ci.currency <> p.rate_currency)
ORDER BY p.prf_no;

-- 4. Sebaran cost_type di prf_cost_items (vendor vs internal)
SELECT cost_type, currency, COUNT(*) AS n, SUM(amount) AS total_amount
FROM public.prf_cost_items
GROUP BY cost_type, currency
ORDER BY cost_type, n DESC;

-- 5. Sebaran currency dokumen di seluruh rantai (deteksi non-IDR + typo/casing)
SELECT 'prf.rate_currency'  AS kolom, rate_currency  AS nilai, COUNT(*) FROM public.prf WHERE deleted_at IS NULL GROUP BY rate_currency
UNION ALL SELECT 'prf.commercial_currency', commercial_currency, COUNT(*) FROM public.prf WHERE deleted_at IS NULL AND commercial_currency IS NOT NULL GROUP BY commercial_currency
UNION ALL SELECT 'quotations.currency_code', currency_code, COUNT(*) FROM public.quotations WHERE deleted_at IS NULL GROUP BY currency_code
UNION ALL SELECT 'quotation_items.currency', currency, COUNT(*) FROM public.quotation_items GROUP BY currency
ORDER BY 1, 3 DESC;

-- 6. Deteksi kode currency ILEGAL (tak ada di master currencies) — bukti free-text tak tervalidasi
SELECT DISTINCT ci.currency
FROM public.prf_cost_items ci
LEFT JOIN public.currencies c ON c.code = ci.currency
WHERE c.code IS NULL;   -- baris di sini = currency di luar master (typo/casing)

-- 7. Apakah master exchange_rates terisi sama sekali? (kesiapan pakai kurs tersentralisasi)
SELECT company_id, from_currency, to_currency, COUNT(*) AS n, MAX(effective_date) AS terbaru
FROM public.exchange_rates
GROUP BY company_id, from_currency, to_currency
ORDER BY 1,2,3;

-- 8. Quotation non-IDR yang lahir dari PRF (cek dampak hilir nyata)
SELECT q.quotation_no, q.currency_code, q.total_amount, q.prf_id
FROM public.quotations q
WHERE q.deleted_at IS NULL AND q.prf_id IS NOT NULL AND q.currency_code <> 'IDR';
```

---

*Akhir laporan. Tidak ada perbaikan dimulai; hanya AUDIT_CURRENCY.md yang dibuat.*
