# MVP Storbit — Audit Kesiapan Import Data Produksi

> **Peran:** auditor aplikasi senior, kritis & jujur. **Mode:** AUDIT (read-only). Tak ada file kode/DB diubah.
> **Konteks:** import ±720 baris item dari 435 SP historis + 38 produk + data stok, dari spreadsheet manifest & warehouse manual, ke modul **Storbit (SOA `d2e5e565-5f67-4954-b8d9-5979a2a0c697`)**.
> **Basis bukti:** `src/` + `supabase/schema_snapshot.sql` + fakta Slice 0.1/Fase 2 yang sudah dieksekusi manual.
> **⚠️ Catatan akurasi snapshot:** `schema_snapshot.sql` **belum di-refresh `pg_dump`** setelah SQL manual Slice 0.1 & Fase 2. Jadi snapshot **tidak** menampilkan kolom `sp_status`/`confirmed_at`/dll dan tabel `picking_lists`/`picking_list_items` — **padahal semuanya SUDAH ADA di DB live** (terverifikasi end-to-end). Audit ini memakai kondisi **DB live** sebagai kebenaran, bukan snapshot.

---

## RINGKASAN — kesiapan sistem untuk import sebesar ini

**Verdict: SIAP untuk import, dengan 4 keputusan data yang wajib diambil dulu.** Struktur `sp_items` cukup fleksibel (banyak kolom nullable, `sp_no` **tidak unik** → aman pakai nomor historis), RLS permissif (tak menghambat insert), dan halaman list/detail sudah menangani sebagian besar NULL dengan fallback `'—'`/`0`. **Tidak ada blocker struktural** untuk memasukkan baris.

Namun ada **4 hal yang menentukan apakah data "terbaca dengan baik" di UI** (bukan sekadar masuk):

1. **Tidak ada kolom channel/sub-label** di `sp_items` maupun `accounts`. Kasus Indomarco/Indogrosir/Loyang/Trolly/General Order/CK (1 customer, beda label invoice) **tidak punya tempat native**. Harus diputuskan: **akun terpisah per channel** vs **simpan label di `dc`/`notes`**. (Detail & rekomendasi di bawah.)
2. **Status turunan digerakkan `qty` vs `shipped_qty`.** Salah set → semua SP historis yang sudah selesai bisa tampil **"Overdue" merah** (karena `expired_date` lampau + belum "Closed"). Aturan mapping wajib: SP selesai → `shipped_qty = qty`.
3. **`sp_status` (draft/confirmed/cancelled) menentukan munculnya tombol "Generate Picking List"** dan badge CONFIRMED. Import harus set nilai ini eksplisit sesuai keadaan tiap SP (bukan dibiarkan default `draft`).
4. **Customer & DC di UI dipetakan dari data, bukan FK.** `sp_items.customer_id` FK ke `accounts` (untuk nama customer), tapi `dc` **teks bebas**. Filter customer & DC **dinamis** → channel/DC baru otomatis muncul di dropdown tanpa ubah kode.

Kesehatan struktural: PK/FK rapi (customer_id `ON DELETE SET NULL` aman), tak ada unique yang menghalangi nomor historis, produk & akun company-scoped. **Import bisa jalan hari ini** begitu 4 keputusan di atas diputuskan + mapping disiapkan.

---

## TEMUAN BAGIAN A (Struktur & Logic) — detail per poin 1–8

### A1 — Struktur `sp_items` (lengkap) + kolom channel

**Kolom** (DB live; PK `id` uuid):

| Kolom | Tipe | Null | Default | Catatan import |
|-------|------|------|---------|----------------|
| id | uuid | no | `uuid_generate_v4()` | auto |
| sp_date | date | **yes** | — | tampil + sort; null→'—' |
| sp_no | text | no | `''` | **nomor historis boleh** (tak unik) |
| customer_id | uuid | **yes** | — | FK→`accounts(id)` ON DELETE SET NULL; sumber nama customer |
| product_name | text | no | `''` | tampil bold; kosong→blank |
| sku | text | no | `''` | null-safe (`'—'`) |
| qty | integer | no | `0` | **basis status**; ≥1 agar bermakna |
| shipped_qty | integer | no | `0` | **basis status** (Open/Partial/Closed) |
| exp_date | date | yes | — | tampil |
| expired_date | date | yes | — | **basis overdue** + deadline |
| dc | text | no | `''` | **teks bebas** (BUKAN FK); kandidat channel/DC |
| shipping_date | date | yes | — | |
| btb_no_deprecated | text | no | `''` | jangan dipakai (BTB via `sp_btbs`) |
| unit_price | numeric(18,2) | no | `0` | basis subtotal/grand total |
| shipping_price | numeric(18,2) | no | `0` | kena PPN di kalkulasi |
| inv / fp / submit / kirim | boolean | no | `false` | flag finance |
| submit_date | date | yes | — | |
| email_status | text | yes | — | |
| notes | text | no | `''` | **kandidat channel/keterangan** |
| created_at / updated_at | timestamptz | no | `now()` | |
| sla_days | integer | yes | — | |
| estimated_delivery_date | date | yes | — | |
| arrival_date | date | yes | — | tanggal terima BTB |
| **sp_status** | text | no | `'draft'` | **Slice 0.1** · CHECK `draft/confirmed/cancelled` |
| **confirmed_at / confirmed_by** | timestamptz / uuid | yes | — | Slice 0.1 |
| **cancelled_at / cancelled_by** | timestamptz / uuid | yes | — | Slice 0.1 |
| **cancel_reason** | text | yes | — | Slice 0.1 |

- **Unik `sp_no`?** TIDAK — hanya index **non-unik** `idx_sp_items_sp_no`. Banyak baris berbagi `sp_no` (grup by `groupBySP()`). → **nomor SP historis apa pun aman**.
- **Kolom channel/sub-label?** **TIDAK ADA.** Yang paling dekat fungsinya: **`dc` (teks bebas)** — paling cocok karena filter DC dinamis (channel akan otomatis muncul di dropdown); alternatif **`notes`** (teks bebas, tak terfilter). Tak ada enum/CHECK di keduanya → bebas isi.

### A2 — `accounts`: Indomarco/Indomaret & sub-channel

- **Seed?** Snapshot **schema-only** — **tidak ada** INSERT/COPY untuk Indomarco/Indomaret/Indogrosir. **Perlu diverifikasi di DB live** apakah akun-akun ini sudah dibuat (query di §Rekomendasi). Kemungkinan besar **belum** → harus dibuat saat import.
- **Kolom identitas:** `name` (wajib), `code` (**UNIQUE per company**, nullable), `customer_type` (varchar, no CHECK), `legal_name`, `tier`, `default_dc` (teks bebas).
- **Mekanisme sub-channel/hierarki?** **TIDAK ADA.** Tak ada `parent_id`/`parent_account_id`/`channel`/`sub_channel`/`group`. `converted_to` = self-FK tapi untuk konversi prospek→customer (bukan hierarki). → **Indomarco + channel-nya tidak bisa dimodelkan sebagai parent-child** di `accounts`.
- Implikasi: channel (Indogrosir/Loyang/Trolly/General Order/CK) harus jadi **akun terpisah** (masing-masing `accounts.name` sendiri) **atau** disimpan sebagai label di `sp_items.dc`/`notes` (1 akun Indomarco, channel di level baris SP).

### A3 — `products`, `stock_summary`, `stock_ledger`

- **`products`** (company-scoped, PK uuid, **UNIQUE `(company_id, code)`**): `code`(≤20, NOT NULL), `name`(≤100, NOT NULL), `category`, `unit`/`uom`, `is_service`(default **true** → set **false** untuk barang trading), `default_price`, `unit_cost`, `is_active`, `deleted_at`(soft delete), dll. **Import 38 produk:** wajib `company_id`=SOA, `code` unik per SOA, `name`; set `is_service=false`.
- **`stock_ledger`** (log pergerakan): `company_id`,`warehouse_id`→`warehouses`,`product_id`→`products`, **`movement_type` CHECK** ∈ `inbound/outbound/adjustment/reserved/unreserved/transfer_in/transfer_out`, `qty`, `reference_type/id/no`, `location_detail`, `last_count_date`. Stok awal diimport sebagai baris **`inbound`**.
- **`stock_summary`** = **VIEW** (`security_invoker=true`, warisi RLS `stock_ledger`), agregasi per (product_id, warehouse_id, company_id):
  - `on_hand = sum(qty)`
  - `reserved = Σ|qty| reserved − Σ|qty| unreserved`
  - `available = on_hand − reserved`
  - → stok muncul **otomatis** begitu ada baris `stock_ledger` (tak perlu tulis ke summary).
- **`warehouses`** (DC fisik): PK uuid, **UNIQUE `(company_id, code)`**, `code`/`name`. Dipakai `stock_ledger.warehouse_id` & `picking_lists.warehouse_id`. **Catatan:** `sp_items.dc` **tidak** terhubung ke `warehouses` (teks bebas).

### A4 — Logic status SP (sp_status × turunan qty)

**Dua sinyal terpisah, digabung dengan precedence.**

- **Turunan qty (per item)** — [`spCalc.js:26-28`](src/lib/spCalc.js#L26): `Closed` bila `shipped_qty === qty` (`outstanding===0 && qty>0`); `Partial` bila `0<shipped_qty<qty`; else `Open`. `isOverdue` bila `expired_date < hari ini` **dan** status ≠ Closed.
- **Agregasi grup (per SP)** — [`App.jsx:189-207`](src/App.jsx#L189): grup `Closed` bila semua item Closed; `Open` bila semua Open; else `Partial`. `group.spStatus` diambil dari **item pertama** (`r.spStatus || 'draft'`, [`App.jsx:166`](src/App.jsx#L166)) — semua baris se-`sp_no` harus sama.
- **Precedence tampilan** — `toDesignStatus()` [`SalesOrderPage.jsx:66-72`](src/modules/logistics/SalesOrderPage.jsx#L66) & `headerStatus` [`SalesOrderDetailPage.jsx:680-689`](src/modules/logistics/SalesOrderDetailPage.jsx#L680), **identik**:
  1. `spStatus==='cancelled'` → **CANCELLED**
  2. qty `Closed` → **CLOSED**
  3. qty `Partial` → **MANIFEST**
  4. `spStatus==='confirmed'` → **CONFIRMED**
  5. else → **OPEN**

**Konsekuensi import kunci:** `sp_status` hanya menang bila SP **belum** Partial/Closed. SP selesai (`shipped_qty=qty`) selalu tampil **CLOSED** apa pun `sp_status`-nya. `sp_status='confirmed'` tampil badge CONFIRMED **hanya** untuk SP yang `shipped_qty=0`.

### A5 — RLS & gating

| Tabel | RLS | Policy | Sifat |
|-------|-----|--------|-------|
| `sp_items` | ON | read/insert/update/delete **`USING(true)`** | **permissif penuh** — semua authenticated bisa CRUD semua baris, **tanpa company scoping** (by design Storbit single-entity) |
| `accounts` | ON | insert/read/update **company-scoped** (`company_id=get_user_company_id()` + role) ; delete super_admin | **ketat** — import akun harus `company_id`=SOA |
| `products` | ON | insert/update **admin+ & company-scoped**; read super_admin OR company | **ketat** — insert produk butuh admin+ & `company_id`=SOA |
| `stock_ledger` | ON | insert=authenticated; select **`USING(true)`**; update super_admin | select permissif; insert bebas authenticated |
| `stock_summary` | VIEW | warisi `stock_ledger` (select permissif) | semua authenticated lihat semua |

- **Menu gating:** `manifest`/`input`/`shipment` gated `module:'logistics'`+`menuKey` (`logistics_sp`/`logistics_input`); `picking` **role-only** (operations, tanpa MENU_KEY_MAP). Import data tak terpengaruh gating (gating = visibilitas UI, bukan baca DB).
- **Implikasi import:** jalankan insert `accounts`/`products` **sebagai user admin+ di company SOA** (atau service role di SQL Editor yang bypass RLS). `sp_items`/`stock_ledger` permissif → insert mudah. **SQL Editor (role postgres) bypass semua RLS** → paling aman untuk import massal.

### A6 — Relasi DC

- **Tak ada tabel DC khusus** (`distribution_centers`/`dc` tidak ada). Tabel gudang fisik = **`warehouses`** (dipakai stok & picking).
- **`sp_items.dc` = TEKS BEBAS** (NOT NULL default `''`, tanpa FK). `accounts.default_dc` juga teks bebas.
- → DC di manifest = label bebas, **bukan** referensi warehouse. Filter DC di list dibangun **dinamis** dari nilai `dc` yang ada ([`App.jsx:1868-1871`](src/App.jsx#L1868)) → nilai DC/channel baru **otomatis** muncul di dropdown.

### A7 — Numbering SP (KOREKSI penting)

- **SP numbering TIDAK memakai `increment_document_sequence`/`document_sequences`.** SP baru digenerate **client-side** di [`InputSPPage.jsx:173`](src/modules/logistics/InputSPPage.jsx#L173): `` `SP-${Date.now().toString().slice(-6)}` `` (mis. `SP-894688`).
- **Nomor historis ("2047009", "SOA-0001") AMAN dipakai apa adanya:** `sp_no` tak punya unique constraint; format bebas; nomor baru masa depan berformat `SP-xxxxxx` sehingga **tak bertabrakan** dengan nomor historis. (`document_sequences` hanya dipakai HRGA/Quotation/**PICK** picking — bukan SP.)

### A8 — Data existing & konflik

- **Jumlah baris sp_items sekarang: TIDAK bisa saya hitung** (tak ada akses query DB dari sini). Jalankan: `SELECT count(*) total, count(distinct sp_no) sp FROM public.sp_items;` (+ `SELECT count(*) FROM picking_lists;`).
- **SP-894688** (dari testing kemarin) + picking dummy hasil smoke-test **masih ada** kecuali sudah dihapus. Karena `sp_no` **non-unik** dan nomor import berbeda, **tak akan konflik/campur secara teknis** — tapi mengotori tampilan. **Rekomendasi:** hapus baris test sebelum import: `DELETE FROM picking_lists WHERE sp_no='SP-894688'; DELETE FROM sp_items WHERE sp_no='SP-894688';` (picking_list_items ikut CASCADE).

---

## TEMUAN BAGIAN B (Halaman & Form) — poin 9–12

### Tabel: kolom dibaca vs kolom wajib vs risiko

| Halaman | Kolom `sp_items` dibaca / ditampilkan | Kolom **wajib** (agar tak error/salah tampil) | Risiko bila data import tak lengkap |
|---------|----------------------------------------|-----------------------------------------------|--------------------------------------|
| **SalesOrderPage** (list manifest) | `sp_no`, `sp_date`, `customer`(via customer_id→accounts.name), `dc`, `qty`(Σ totalQty), `shipped_qty`(→outstanding), `expired_date`, `unit_price`+`shipping_price`(→grandTotal), `inv/fp/submit/kirim`(→financePct), `sp_status` | `sp_no`, `qty`, `shipped_qty`, `sp_status` | `customer_id` null → pill customer **kosong** + tak muncul di filter customer. `expired_date` lampau + belum Closed → badge **Overdue merah**. `qty=0` → status nyangkut 'Open'. Nama customer kosong bikin dropdown filter tak lengkap. |
| **SalesOrderDetailPage** | header: `sp_no`, `customer`, `sp_status`, Σqty/items; item: `product_name`, `sku`, `qty`, `shipped_qty`, `unit_price`, `shipping_price`, `inv/fp/submit/kirim`, `arrival_date`, `estimated_delivery_date`; ringkasan finance | `product_name`, `qty`, `unit_price`, `sp_status` | `product_name` kosong → baris item **blank**. `unit_price=0` → semua total **Rp 0** (menyesatkan). `sp_status` null(→default draft di FE) aman. Semua date null → `'—'` (aman). |
| **InputSPPage** (create) | menulis, bukan baca | (lihat validasi §B10) | Tak dipakai untuk import (import bypass form). Tapi **min-date `expired_date`** akan menolak entri manual historis (lihat B10). |
| **PickingListPage** (list) | Baca `picking_lists`(+`warehouses`); customer via **`customerBySpNo`** (dari `groupedSP`→`sp_items.customer`) | picking_lists.* ; `sp_items.customer_id`(untuk nama) | Picking hanya ada bila di-generate. Kolom **Customer** ambil dari map `sp_no`→customer; bila SP import `customer_id` null → **Customer `'—'`** di picking. Gudang dari embed `warehouses.name` (null→'—'). |
| **PickingListDetailPage** | `getPickingListDetail`: header+items picking + **customer di-resolve dari `sp_items` by `sp_no`** | `picking_list_items.*`; `sp_items.customer_id`+`sp_no` | Item picking = snapshot dari SP saat generate (product_name/sku/qty_requested). Customer di header di-resolve ulang dari `sp_items` → null bila SP tak punya customer. |

**Catatan NULL-safety (positif):** list & detail sudah pakai fallback: `fmtDate`→`'—'`, `rp(n)`→`Number(n)||0`, `dc||'—'`, `sku||'—'`, `customer` pill punya default color. **Tak ditemukan crash keras** dari NULL — risikonya **salah-tampil/menyesatkan** (Rp 0, overdue palsu, customer kosong), bukan error fatal.

### B10 — Field wajib & validasi form (Input SP / edit)

- **Required FE** ([`InputSPPage.jsx:166-167`](src/modules/logistics/InputSPPage.jsx#L166)): header `spDate && customerId && expiredDate`; tiap item `productName.trim() && qty>=1 && unitPrice>=0`.
- **Validasi yang menolak data historis:** field `expired_date` punya atribut **`min: today()`** ([`InputSPPage.jsx:~324`]) → **tanggal lampau ditolak di form**. **Tapi hanya FE** — **import via SQL/DB bypass form** → tak menghalangi import. (Artinya: SP historis tak bisa **dibuat ulang** lewat form, tapi **boleh di-import**.)
- **Edit item** (EditItemModal) tak menolak tanggal lampau (hanya numeric). Aman untuk edit data historis.

### B11 — Kondisi tombol status (Konfirmasi/Cancel/Generate Picking)

- **Konfirmasi/Tolak (list)** — `AksiCell` [`SalesOrderPage.jsx:233-251`](src/modules/logistics/SalesOrderPage.jsx#L233): tombol **Konfirmasi+Tolak muncul HANYA saat `dstatus==='OPEN'`**; `MANIFEST`→Manifest+Detail; `CONFIRMED/CLOSED/CANCELLED`→Detail saja. `dstatus` = `toDesignStatus(group)`.
- **Generate Picking List (detail)** — [`SalesOrderDetailPage.jsx:735`](src/modules/logistics/SalesOrderDetailPage.jsx#L735): syarat **PERSIS `group?.spStatus === 'confirmed'`** — **independen** dari status qty. Jadi:
  - Import `sp_status='confirmed'` → **tombol Generate langsung muncul**, **tanpa** perlu klik Konfirmasi manual. ✅ (inilah yang diinginkan untuk SP yang mau di-fulfill sekarang).
  - Tapi berlaku juga untuk SP `confirmed` yang **sudah Closed** (shipped=qty): tombol tetap muncul, namun **RPC `generate_picking_from_sp` menolak** ("tidak ada item outstanding") → aman (error toast, tak bikin picking kosong). Sekadar tombol yang no-op.
- **Konsekuensi mapping:** untuk SP historis **yang masih perlu dipick** (belum kirim) → `sp_status='confirmed'` + `shipped_qty=0`. Untuk SP historis **sudah selesai** → `shipped_qty=qty` (tampil CLOSED); `sp_status` boleh `'confirmed'` (tombol Generate muncul tapi no-op) atau `'draft'` (tombol tak muncul — lebih rapi bila tak mau menggoda user).

### B12 — Dropdown/filter: hardcoded vs dinamis

| Filter | Sumber | Channel/DC baru otomatis muncul? |
|--------|--------|----------------------------------|
| **Customer** | **DINAMIS** — `customerNames` dari `augmented.map(g=>g.customer)` unik+sort ([`SalesOrderPage.jsx:~530`]) | **Ya** — tiap `accounts.name` yang dipakai SP muncul otomatis |
| **DC** | **DINAMIS** — `dcList` dari `Set(rows.map(r=>r.dc))` ([`App.jsx:1868`](src/App.jsx#L1868)) | **Ya** — tiap nilai `sp_items.dc` (mis. Loyang/Indogrosir) muncul otomatis |
| **Status (tab)** | **HARDCODED** (`all/pending/manifest/history`) — hitungan dinamis | tak relevan (status enum tetap) |

→ **Channel baru (Indogrosir/Loyang/dst) akan otomatis muncul di filter** tanpa ubah kode — **asalkan** disimpan di kolom yang di-scan: **`dc`** (untuk filter DC) atau sebagai **`accounts.name` terpisah** (untuk filter Customer). Jika disimpan di `notes` → **tidak** akan jadi filter.

---

## GAP / RISIKO — yang perlu diputuskan/dibangun sebelum import aman

1. **[KEPUTUSAN] Model channel Indomarco.** Tak ada kolom native. Dua opsi:
   - **Opsi A — akun terpisah per channel** (`Indomarco - Indogrosir`, `Indomarco - Loyang`, …): muncul otomatis di **filter Customer**, tiap channel bisa punya `code`/`payment_terms`/`tax_id` sendiri (cocok "beda label invoice"). Kekurangan: "1 customer" terpecah jadi banyak akun (tak ada roll-up parent).
   - **Opsi B — 1 akun Indomarco + channel di `sp_items.dc`**: 1 akun, channel jadi filter **DC**. Cocok bila DC memang = channel. Kekurangan: `dc` jadi ambigu (DC fisik vs channel), dan invoice-label per channel tak tersimpan di akun.
   - **Rekomendasi:** **Opsi A** bila channel = entitas penagihan berbeda (beda NPWP/termin/label invoice) — paling sesuai deskripsi "beda label invoice". Pakai `accounts.code` untuk kode channel, `customer_type` untuk tandai "channel".
2. **[DATA] Akun Indomarco/channel belum tentu ada.** Verifikasi & buat dulu (akun harus lebih dulu dari `sp_items` karena FK `customer_id`).
3. **[MAPPING] Overdue palsu.** SP selesai wajib `shipped_qty=qty`; jangan biarkan `shipped_qty=0` untuk SP lampau → badge Overdue merah membanjiri list.
4. **[MAPPING] `sp_status` eksplisit** per SP (bukan default draft): `confirmed` untuk yang aktif/perlu pick, `draft`/`confirmed` untuk yang selesai (lihat B11).
5. **[HARGA] `unit_price` wajib benar.** null/0 → semua total Rp 0 (menyesatkan finance). Bila harga historis tak ada, tandai eksplisit (mis. 0) dan sadari total finance jadi 0.
6. **[KEBERSIHAN] Baris test** (`SP-894688` + picking dummy) harus dihapus sebelum/sesudah import.
7. **[SNAPSHOT] `schema_snapshot.sql` stale** — refresh `pg_dump` agar audit/skema selanjutnya akurat (tak menghambat import, tapi wajib per aturan repo).
8. **[STOK] Link produk↔SP belum ada** (Fase 0.2 ditunda): `sp_items` tak punya `product_id`. Stok (`stock_ledger`/`stock_summary`) berdiri sendiri per `product_id`. Import stok tetap bisa, tapi **belum otomatis tersambung** ke baris SP (cek stok per SP belum ada — sesuai rancangan, Fase 1 ditunda). Produk di SP tetap by `product_name`/`sku` teks.

**Yang TIDAK perlu dibangun dulu:** RLS permissif `sp_items`/`stock_ledger` = by design Storbit (bukan blocker import). Tak perlu tambah kolom status (sudah ada). Tak perlu numbering RPC untuk SP (nomor historis dipakai apa adanya).

---

## REKOMENDASI STRUKTUR IMPORT — urutan, mapping, penyesuaian UI

### Urutan import (hormati FK)
1. **`accounts`** (SOA) — buat/verifikasi customer + channel (Opsi A). `company_id`=SOA, `name`, `code` unik, `customer_type`. **Harus duluan** (FK `sp_items.customer_id`).
2. **`products`** (SOA) — 38 produk. `company_id`=SOA, `code` unik per SOA, `name`, `is_service=false`. (Belum wajib untuk `sp_items` karena SP pakai teks; tapi perlu untuk stok.)
3. **`warehouses`** (SOA) — pastikan gudang stok ada (untuk `stock_ledger.warehouse_id` & picking). 
4. **`stock_ledger`** — stok awal sebagai baris `movement_type='inbound'` (per product_id+warehouse_id+company). `stock_summary` (view) ikut otomatis.
5. **`sp_items`** — 720 baris. Map per kolom (di bawah). Set `sp_status` & `shipped_qty` sesuai keadaan.
6. **`sp_btbs`** (opsional) — bila ada nomor BTB historis.
7. **Hapus baris test** + **refresh `schema_snapshot.sql`**.

### Strategi mapping `sp_items` (kolom → sumber spreadsheet)
- `sp_no` ← nomor manifest asli (apa adanya; aman).
- `customer_id` ← id akun channel (Opsi A) hasil langkah 1. **Wajib terisi** (kalau null → customer kosong di UI).
- `dc` ← DC/channel label (bila Opsi B) atau DC fisik. Ingat: ini yang mengisi filter DC.
- `product_name`, `sku` ← dari baris item.
- `qty` ← qty pesan (≥1).
- `shipped_qty` ← **= qty untuk SP selesai** (→ CLOSED, no overdue); `0` untuk yang belum kirim; parsial sesuai realisasi.
- `unit_price`, `shipping_price` ← harga historis (0 bila tak ada — sadari total jadi 0).
- `sp_date`, `expired_date`/`exp_date`, `shipping_date`, `arrival_date` ← tanggal historis (boleh lampau).
- `inv/fp/submit/kirim`, `submit_date` ← flag finance historis (default false).
- **`sp_status`** ← `confirmed` (aktif/perlu pick) · `draft`/`confirmed` (selesai) · `cancelled` (batal). **Konsisten sama untuk semua baris ber-`sp_no` sama** (karena grup ambil dari baris pertama).

### Penyesuaian UI yang perlu dipertimbangkan (opsional, bukan blocker)
- **Filter/kolom "Channel"**: jika pakai Opsi B (`dc`=channel), filter DC sudah otomatis jadi filter channel — cukup pertimbangkan **ganti label kolom/filter "DC"→"Channel"** di `SalesOrderPage` agar tak membingungkan (perubahan kecil, opsional). Jika Opsi A, channel muncul di filter Customer (tak perlu ubah UI).
- **Badge status untuk data historis**: pastikan mapping `shipped_qty`/`sp_status` benar supaya list tidak penuh Overdue/OPEN palsu. **Tanpa** ubah kode — murni disiplin data.
- **Nama produk konsisten**: karena SP pakai `product_name` teks (belum `product_id`), samakan ejaan nama produk antar baris supaya rapi (dan agar nanti backfill `product_id` di Fase 0.2 mudah).

### Verifikasi pra-import (jalankan di SQL Editor — read-only)
```sql
-- 1. Jumlah data existing + baris test
SELECT count(*) total, count(DISTINCT sp_no) sp FROM public.sp_items;
SELECT sp_no, count(*) FROM public.sp_items WHERE sp_no = 'SP-894688' GROUP BY sp_no;
SELECT count(*) FROM public.picking_lists;

-- 2. Apakah akun Indomarco/channel sudah ada di SOA?
SELECT id, name, code, customer_type FROM public.accounts
WHERE company_id = 'd2e5e565-5f67-4954-b8d9-5979a2a0c697'
  AND (name ILIKE '%indom%' OR name ILIKE '%indogros%');

-- 3. Konfirmasi kolom Slice 0.1 SUDAH ada (bukti snapshot stale)
SELECT column_name FROM information_schema.columns
WHERE table_name='sp_items' AND column_name IN
 ('sp_status','confirmed_at','cancelled_at','cancel_reason');

-- 4. Warehouses SOA (untuk stok)
SELECT id, code, name FROM public.warehouses
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND is_active;
```

---

**Penutup:** sistem **siap menerima import** secara struktural; kualitas hasil di UI bergantung pada **4 keputusan/mapping data** (channel model, `shipped_qty` untuk hindari overdue palsu, `sp_status` eksplisit, `customer_id` terisi) — bukan pada perubahan kode. Satu-satunya penyesuaian UI yang layak dipertimbangkan (opsional) adalah label "DC→Channel" bila memilih Opsi B. Refresh snapshot & bersihkan baris test sebelum go-live.
