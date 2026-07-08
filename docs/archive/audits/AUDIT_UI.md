# AUDIT — Redundansi UI & Celah Salah-Input (Alur SP)

> Read-only. Tidak ada file yang diubah; hanya dokumen ini dibuat. DB dari
> `supabase/schema_snapshot.sql`. Referensi audit sebelumnya: AUDIT_E2E/FINANCE/GUDANG/STOK.md.

---

## RINGKASAN

**Ada DUA generasi UI SP yang hidup bersamaan** — generasi **baru** (SP Manifest `SalesOrderPage` → `InputSPPage`, Detail SP `SalesOrderDetailPage`/`EditItemModal`) dan generasi **legacy** yang masih ter-mount di menu (`input`→`InputPage`→**FormModal**+**ImportModal**; `shipment`→**ShipmentModal**; `finance`/`outstanding`→**FinanceModal**). Akibatnya:

- **≥6 komponen menulis `sp_items`** dengan tumpang tindih besar: `InputSPPage`, `FormModal`, `EditItemModal`, `ShipmentModal`, `FinanceModal`, `ImportModal`. **FormModal adalah "mega-form"** yang bisa mengisi SEMUA field sekaligus (termasuk `shipped_qty` + flag finance + `sp_no` manual), padahal ada form khusus untuk tiap bagian → banyak jalan menuju data yang sama, dengan **validasi berbeda-beda**.
- **2 jalur "Buat SP" tak konsisten:** `InputSPPage` (nomor SP **auto** `Date.now()`, wajib `expiredDate`, dropdown-only) vs `FormModal` (nomor SP **diketik manual**, tak wajib tanggal/dc/qty). → data SP bisa lahir dengan aturan berbeda.
- **3 jalur menulis `shipped_qty`** (`FormModal`, `ShipmentModal`, `ImportModal`) + 4 jalur flag finance (`FormModal`, `EditItemModal`, `FinanceModal`, `ImportModal`).
- **≥5 tombol bermasalah** (stub toast-palsu / salah kondisi / duplikat), termasuk aksi yang **fungsional di UI legacy tapi STUB di UI baru** (Shipment/Finance per item).
- **Celah salah-input utama:** `shipped_qty` bisa `> qty` & bisa diisi sebelum `confirmed`; `sp_no`/`btb_no` bisa duplikat (tanpa unique); dua kolom tanggal kembar (`exp_date` vs `expired_date`) bisa berbeda; `dc` & tanggal bisa kosong; banyak **double-entry** (BTB ops vs BTB finance, shipped_qty vs surat jalan, invoice flag vs AR).

Rekomendasi utama: **pensiunkan generasi legacy** (FormModal/ShipmentModal/FinanceModal/InputPage/ImportModal-mega) dan jadikan satu sumber per concern (InputSPPage untuk create, EditItemModal untuk edit, jalur Surat Jalan untuk shipped_qty, AR untuk invoice).

---

## FORM/MODAL PENULIS `sp_items`

| Komponen | file:line | Dipakai di (trigger) | Field yang bisa diisi | Validasi |
|---|---|---|---|---|
| **InputSPPage** (create baru) | `InputSPPage.jsx` (form), insert `:200` | SP Manifest → "Input SP" (`SalesOrderPage:494`→`App.jsx:2640,2648`) | header: spDate, customer, dc, expiredDate, notes, btbRows · item: product(dropdown), qty, unitPrice, shippingPrice, expDate, expired_date | **wajib** spDate+customer+**expiredDate**; item wajib productId, qty≥1, unitPrice≥0 (`:176-179`). sp_no **auto** `Date.now()` (`:184`). shipped_qty & flag finance **tak ada** |
| **FormModal** (mega, create/edit item) | `App.jsx:4277`, submit `:4308`, render `:3330` | menu `input` → InputPage "Add" (`App.jsx:2739 setShowAdd`); + legacy `SPSidePanel onEditItem` (`:3320`, dormant) | **SEMUA**: spDate, **spNo (manual)**, customer, dc, product, sku, qty, **shippedQty**, expDate, expired_date, shippingDate, unitPrice, shippingPrice, **inv/fp/submit/kirim**, submitDate, emailStatus, notes | **hanya** wajib spNo+product+customer (`:4309-4320`). **Tak wajib** tanggal/dc/qty≥1 |
| **EditItemModal** (edit item, baru) | `SalesOrderDetailPage.jsx:203`, save `:261`, render `:1270` | Detail SP: pencil per item (`:1129`) + header "Edit" (`:812`, item[0] saja) | product, sku, dc, qty, expDate, expired_date, shippingDate, slaDays, estimatedDeliveryDate, arrival_date, unitPrice, shippingPrice, **inv/fp/submit/kirim**, submitDate, emailStatus, notes | Save disabled bila `wasLinked && !productId` (`:464`). **shippedQty readOnly** (`:343`) |
| **ShipmentModal** (legacy) | `App.jsx:4486`, render `:3364` | menu `shipment` → ShipmentPage row (`App.jsx:2750`) | **shippedQty**, shippingDate, dc, notes | **tak ada** (Number bebas, tanpa clamp) |
| **FinanceModal** (legacy) | `App.jsx:4535`, render `:3365` | menu `finance`/`outstanding` → Finance/OutstandingPage row (`:2755/2760`) | **inv/fp/submit/kirim**, submitDate, emailStatus, notes | **tak ada** |
| **ImportModal** (CSV) | `App.jsx:4577`, render `:3366` | menu `input` → InputPage "Import" (`:2740`→`bulkAdd`) | via CSV: semua kolom termasuk **shippedQty** (`:4636`), expDate, expired_date | parsing minimal; tak ada gate status |

### Tabel perbandingan OVERLAP field (✔ = bisa mengisi)
| Field | InputSPPage | FormModal | EditItemModal | ShipmentModal | FinanceModal | ImportModal |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| product/sku | ✔ | ✔ | ✔ | – | – | ✔ |
| qty | ✔ | ✔ | ✔ | – | – | ✔ |
| unitPrice/shipping | ✔ | ✔ | ✔ | – | – | ✔ |
| **shippedQty** | – | **✔** | (readOnly) | **✔** | – | **✔** |
| dc | ✔ | ✔ | ✔ | ✔ | – | ✔ |
| expDate | ✔ | ✔ | ✔ | – | – | ✔ |
| expired_date | ✔ | ✔ | ✔ | – | – | ✔ |
| **inv/fp/submit/kirim** | – | **✔** | **✔** | – | **✔** | ✔ |
| submitDate/emailStatus | – | ✔ | ✔ | – | ✔ | ✔ |
| sp_no | auto | **manual** | – | – | – | ✔(csv) |

→ **shipped_qty punya 3 penulis; flag finance punya 4 penulis; dc punya 5; kedua tanggal punya 4.** FormModal & ImportModal adalah super-set (bisa semua).

---

## PENULIS `shipped_qty` & BTB & FINANCE

| Data | Ditulis dari mana saja (file:line) | Risiko dobel/tak sinkron |
|---|---|---|
| **shipped_qty** | FormModal (`App.jsx:4371`), ShipmentModal (`:4514`), ImportModal/CSV (`:4636`). (EditItemModal readOnly `:343`.) **TIDAK** ditulis oleh alur Surat Jalan/dispatch. | 3 jalur manual untuk angka yang sama; **tak sinkron dengan pengiriman nyata** (surat jalan tak menulisnya — AUDIT_GUDANG G-1). Bisa diisi beda di tiap tempat. |
| **BTB (operasional)** `sp_btbs.btb_no` | Detail SP "Tambah/Hapus BTB" (`SalesOrderDetailPage:1020/989`), InputSPPage bulk (`:207`) | Tanpa unique → duplikat. Tak tertaut ke BTB finance. |
| **BTB (finance)** `ar_btbs.no_btb` | ARModal "Add BTB" (`App.jsx:5422` → `insertTtf`) | Nomor BTB **diketik ulang** terpisah dari `sp_btbs` → bisa beda. |
| **Invoice status** | flag `sp_items.inv` (FormModal/EditItemModal/FinanceModal/CSV) **dan** `ar_ttfs.no_inv` (ARModal) | "sudah invoice?" dicatat di dua tempat (boolean vs nomor) tanpa penghubung → bisa kontradiktif. |
| **Faktur pajak** | flag `sp_items.fp` (3 form) | hanya flag; tak ada dokumen; bisa beda antar form. |
| **submit/kirim + submitDate/emailStatus** | FormModal, EditItemModal, FinanceModal, CSV | 4 jalur untuk milestone yang sama. |

---

## TOMBOL BERMASALAH

| Tombol | file:line | Kesan user | Kenyataan | Jenis |
|---|---|---|---|---|
| "Manifest" (SP Manifest) | `SalesOrderPage.jsx:164,465` | "Manifest dibuat ✓" (toast sukses) | `handleManifest` → **toast saja, tak ada DB** | **stub / sukses palsu** |
| "Shipment" per item (Detail SP) | `SalesOrderDetailPage.jsx:1115` | update shipment item | toast "akan tersedia setelah migrasi tabel shipment" | **stub** (padahal fungsional di ShipmentPage) |
| "Finance" per item (Detail SP) | `SalesOrderDetailPage.jsx:1121` | update finance item | toast "akan tersedia setelah migrasi tabel status" | **stub** (padahal fungsional di FinanceModal) |
| "+ Tambah Shipment" (Detail SP, tab Shipment) | `SalesOrderDetailPage.jsx:1165` | tambah shipment | toast stub; tab = EmptyState (`:1172`) | **stub** |
| Header "Edit" (Detail SP) | `SalesOrderDetailPage.jsx:811-812` | edit SP | buka EditItemModal **hanya untuk `items[0]`** | **salah kondisi / menyesatkan** (SP multi-item hanya item pertama teredit) |
| Tab "History" (Detail SP) | `SalesOrderDetailPage.jsx:1240` | riwayat aktivitas | EmptyState "setelah tabel audit log" | **stub** |
| Shipment/Finance per item (legacy SPSidePanel) | `App.jsx:3870/3875` | update shipment/finance | **fungsional** (buka ShipmentModal/FinanceModal) | **duplikat** aksi yang di Detail SP baru = stub → perilaku beda di dua UI |
| Toggle finance di FormModal & EditItemModal & FinanceModal | `App.jsx:4407-4410`, `SalesOrderDetailPage:424`, `App.jsx:4549-4552` | set status invoice/faktur | 3 tempat berbeda menulis kolom sama | **duplikat** |

---

## CELAH SALAH-INPUT

| Field | Masalah | Dampak | Severity |
|---|---|---|---|
| **shipped_qty** | Tak ada clamp `≤ qty` (FormModal `:4371`, ShipmentModal `:4514`) → bisa > qty (outstanding negatif) | Outstanding/stok salah; over-deduct saat dispatch (AUDIT_STOK S-2) | HIGH |
| **shipped_qty** | Bisa diisi tanpa `sp_status='confirmed'` (tak ada gate) | SP draft tampil CLOSED / History (AUDIT_E2E T-3) | HIGH |
| **sp_no** | `InputSPPage` auto `Date.now().slice(-6)` (`:184`); `FormModal` ketik manual bebas (`:4332`); **tak ada unique** di `sp_items.sp_no` | Dua SP bisa bernomor sama; picking/SJ/AR tertaut teks → salah gabung | HIGH |
| **btb_no** | `sp_btbs` tanpa unique (AUDIT_FINANCE F-5); input teks bebas | BTB duplikat per SP tak terdeteksi | MEDIUM |
| **exp_date vs expired_date** | Dua kolom kembar, editable independen (InputSPPage `:378-379`? → FormModal `:4378-4379`, EditItemModal); hanya `expired_date` dipakai overdue | User isi "EXP Date" berharap overdue berubah → tak terjadi; dua tanggal bisa beda | MEDIUM |
| **dc** | Tak wajib (InputSPPage `headerOk` `:176` tanpa dc; FormModal tanpa cek dc) | "DC Tujuan" kosong di Manifest; routing operasional hilang | MEDIUM |
| **expired_date (FormModal)** | Wajib di InputSPPage tapi **tak wajib** di FormModal | SP via FormModal bisa tanpa tanggal kedaluwarsa → overdue tak jalan | MEDIUM |
| **qty (FormModal)** | Tak divalidasi `≥1` (InputSPPage validasi, FormModal tidak) | Item qty 0 bisa tersimpan | MEDIUM |
| **outstanding (tampilan)** | Dihitung `qty − shipped` tanpa clamp → tampil negatif | Angka menyesatkan | LOW |

---

## FIELD WAJIB YANG TIDAK DIPAKSA

| Field | Dibutuhkan untuk | Akibat kalau kosong |
|---|---|---|
| **dc** | "DC Tujuan" di Manifest, routing pengiriman | tampil "—"; operasional gudang/driver tak tahu tujuan |
| **product_id** (item legacy) | Generate Picking (reserve stok pakai product_id, `schema:442`), tautan stok | item tanpa product_id: tak ter-reserve, `qty_short`/lokasi kosong → tak bisa dipick benar |
| **expired_date** (via FormModal/CSV) | overdue/Expired | overdue tak pernah nyala; SP "abadi" |
| **sp_status='confirmed'** sebelum shipped_qty | integritas status | shipped_qty terisi → CLOSED palsu |
| **driver+vehicle** (sudah dipaksa di dispatch) | dispatch | *(ini SUDAH dipaksa — pembanding positif, `DeliveryNoteDetailPage:341`)* |
| **koli/berat** (Surat Jalan) | dokumen SJ | boleh kosong saat dispatch → SJ tanpa info packing (AUDIT_GUDANG G-5) |

---

## DOUBLE ENTRY (data sama diketik di banyak tempat)

| Data | Diketik/diisi di mana saja | Potensi tak sinkron |
|---|---|---|
| **shipped_qty** | ShipmentModal (`:4514`) vs FormModal (`:4371`) vs CSV — **dan** qty pengiriman nyata di `delivery_note_items` | manual ≠ surat jalan; tiga form bisa beda |
| **BTB** | `sp_btbs.btb_no` (Detail SP) vs `ar_btbs.no_btb` (ARModal) | nomor BTB diketik dua kali, tanpa penghubung |
| **Invoice** | flag `sp_items.inv` (3 form) vs `ar_ttfs.no_inv` (ARModal) | "sudah invoice" biner vs nomor invoice → kontradiktif |
| **sp_no / no_sp** | FormModal ketik `sp_no`, ARModal ketik `no_sp`, `sp_btbs.sp_no`, `delivery_notes.sp_no` | tautan teks; typo → yatim (AUDIT_FINANCE F-1) |
| **dc** | InputSPPage, FormModal, EditItemModal, ShipmentModal (per item, padahal 1 SP) | dc bisa beda antar baris item SP yang sama |
| **customer_name** | snapshot `delivery_notes.customer_name` (saat generate) vs master `accounts.name` | master di-rename → SJ lama stale |
| **finance milestones** | FormModal vs EditItemModal vs FinanceModal (inv/fp/submit/kirim) | tiga pintu ke kolom sama |

---

## REKOMENDASI KONSOLIDASI

| Redundansi | Jadikan SATU sumber | Hapus/gabung | Risiko kalau dibiarkan |
|---|---|---|---|
| Create SP (InputSPPage vs FormModal vs ImportModal) | **InputSPPage** (auto-number, validasi ketat, dropdown-only) | Pensiunkan **FormModal** (create) & menu `input`→InputPage; jadikan CSV import jalur terpisah yang lewat validasi InputSPPage | dua aturan berbeda; sp_no manual bentrok; SP tanpa tanggal/dc |
| Edit item SP (FormModal vs EditItemModal) | **EditItemModal** (Detail SP) | Hapus FormModal (edit) | dua editor beda field & validasi |
| shipped_qty (FormModal/ShipmentModal/CSV) | **Jalur Surat Jalan** (dispatch auto-update shipped_qty via jembatan AUDIT_GUDANG G-1); shipped_qty jadi **read-only** di semua form | Hapus ShipmentModal + input shipped_qty di FormModal/CSV | angka fulfillment manual & tak sinkron pengiriman |
| Finance flags (FormModal/EditItemModal/FinanceModal) | **Satu** editor finance (mis. FinanceModal saja) atau derive dari AR | Hapus toggle finance di FormModal & EditItemModal | status invoice beda di tiap pintu |
| BTB (sp_btbs vs ar_btbs) | Satu entitas BTB dengan qty + tautan ke pengiriman & AR (butuh perubahan struktur) | Gabungkan; tautkan `ar_btbs`→`sp_btbs` | BTB ganda tak terekonsiliasi |
| Tombol Shipment/Finance per item (stub di Detail SP vs fungsional legacy) | Satu perilaku (aktifkan di Detail SP **atau** buang) | Hapus stub `SalesOrderDetailPage:1115/1121/1165` & tombol "Manifest" palsu | user tertipu sukses palsu / bingung |
| Legacy UI (Manifest/SPSidePanel/InputPage) | Generasi baru (SalesOrderPage/Detail) | Pensiunkan komponen legacy yang dormant/duplikat | permukaan bug ganda, perilaku tak konsisten |

---

## TEMUAN (urut paling parah)

### U-1 (HIGH) — Dua generasi UI SP hidup bersamaan → banyak jalur menulis data sama, validasi berbeda
Create: `InputSPPage` (baru) vs `FormModal` (legacy, menu `input`, `App.jsx:2739/3330`); edit: `EditItemModal` vs `FormModal`; shipment: Detail-SP-stub vs `ShipmentModal`/`ShipmentPage`; finance: `FinanceModal`/`EditItemModal`/`FormModal`.
- **Dampak:** user bisa membuat/mengubah SP lewat jalur berbeda dengan aturan berbeda → data tak konsisten; maintenance ganda; bug muncul di satu jalur tak di jalur lain.

### U-2 (HIGH) — `FormModal` mega-form + `sp_no` manual + validasi longgar
`App.jsx:4308-4321` hanya wajib spNo/product/customer; `sp_no` diketik bebas (`:4332`); bisa set shipped_qty & flag finance sekaligus.
- **Dampak:** SP lahir tanpa tanggal/dc/qty valid; nomor SP bentrok; shipped_qty/finance terisi tanpa alur yang benar. Ini pintu paling rawan salah-input.

### U-3 (HIGH) — `shipped_qty` multi-writer tanpa clamp & tanpa gate confirmed
FormModal `:4371`, ShipmentModal `:4514`, CSV `:4636`; tak ada `≤qty` maupun cek `confirmed`.
- **Dampak:** outstanding/stok salah (over-deduct), SP draft tampil CLOSED (AUDIT_E2E T-3, STOK S-2). Idealnya satu sumber = pengiriman.

### U-4 (HIGH) — Tombol "Manifest" beri sukses palsu + Shipment/Finance per item stub
`SalesOrderPage:465`, `SalesOrderDetailPage:1115/1121/1165`.
- **Dampak:** user yakin aksi berhasil padahal tak ada perubahan; aksi sama fungsional di UI legacy tapi mati di UI baru → kebingungan & kepercayaan salah.

### U-5 (MEDIUM) — `sp_no`/`btb_no` tanpa unique; nomor bisa duplikat
`sp_items.sp_no` (auto timestamp / manual) & `sp_btbs.btb_no` tanpa constraint unique.
- **Dampak:** dua SP/BTB bernomor sama; karena tautan hilir berbasis teks `sp_no`, penggabungan picking/SJ/AR bisa salah SP.

### U-6 (MEDIUM) — Dua kolom tanggal kembar (`exp_date` vs `expired_date`) yang bisa berbeda
Editable independen (InputSPPage/FormModal/EditItemModal); hanya `expired_date` dipakai overdue.
- **Dampak:** user salah kira mengedit tanggal yang menggerakkan overdue; dua nilai divergen membingungkan.

### U-7 (MEDIUM) — Field penting tak dipaksa: `dc`, `expired_date` (FormModal), `qty≥1` (FormModal), `product_id` (legacy)
`InputSPPage:176` (dc tak wajib), `App.jsx:4308` (FormModal longgar).
- **Dampak:** SP miss data di hilir (DC tujuan kosong, overdue mati, item tak bisa dipick benar).

### U-8 (MEDIUM) — Double-entry lintas modul (BTB ops vs finance, invoice flag vs AR, shipped_qty vs SJ, dc per baris)
Lihat tabel DOUBLE ENTRY.
- **Dampak:** sumber kebenaran ganda; nilai bisa kontradiktif tanpa rekonsiliasi.

### U-9 (LOW) — Header "Edit" Detail SP hanya mengedit item pertama
`SalesOrderDetailPage:811-812` (`items[0]`).
- **Dampak:** pada SP multi-item, tombol Edit global terasa seperti mengedit SP tapi hanya baris pertama → salah paham.

### U-10 (LOW) — Emoji "✓/✨/🎉" di toast (langgar brand no-emoji)
`SalesOrderPage:460`, `App.jsx:2021`, `InputSPPage:209`, `App.jsx:4066`.
- **Dampak:** kosmetik; tak sesuai pedoman brand.

---

*Catatan: seluruh gate FE (`can(role,'edit'/'shipment'/'finance')`) hanya di frontend; RLS `sp_items` `USING(true)` (AUDIT_E2E T-1) → validasi/gerbang di sini bisa dilewati di level DB.*
