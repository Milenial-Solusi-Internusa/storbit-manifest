# AUDIT — Redundansi Jalur Input/Edit/Reader SP Storbit

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah. Satu-satunya file dibuat: dokumen ini.
> **Tanggal:** 2026-07-06 · **Branch:** `feat/sp-schema` · **Sumber DB:** `supabase/schema_snapshot.sql`.
> Tujuan: petakan semua jalur tumpang-tindih di alur SP agar bisa diputuskan mana yang aman dipensiunkan.

---

## RINGKASAN EKSEKUTIF

Ada **tiga jalur CREATE** SP yang berbeda (InputSPPage, FormModal legacy, ImportModal/CSV) dan **lima jalur EDIT** (EditItemModal, ShipmentModal, FinanceModal, set_sp_status, plus FormModal-edit yang ternyata **kode mati**), namun **hanya InputSPPage yang dual-write ke `sp_orders`/`sp_order_items`** — semua jalur lain menulis **`sp_items` saja**. Akibatnya `sp_orders`/`sp_order_items` sudah stale sejak edit pertama, dan **tidak ada satu pun halaman yang membaca tabel baru** (semua reader — list, detail, shipment, finance, outstanding — membaca `sp_items`). Verdict: **jalur yang aman dipensiunkan lebih dulu = SPSidePanel + FormModal-mode-edit (100% unreachable/dead), lalu FormModal-create** setelah satu gap ditutup (input `sp_no` manual; lihat §Dampak); **yang WAJIB dipertahankan sampai reader pindah = `sp_items` dan seluruh editor yang menulisnya** (EditItemModal/Shipment/Finance) — mematikannya sekarang akan melumpuhkan pembacaan SP. ImportModal (bulk) berdiri sendiri dan tidak bergantung ke FormModal.

---

## PETA JALUR CREATE

| Jalur | Dipicu dari | file:line | Nulis tabel | Dual-write `sp_orders`? | Penomoran |
|-------|-------------|-----------|-------------|--------------------------|-----------|
| **InputSPPage** (form asli baru) | Menu **`manifest`** (Sales Order/SP) → tombol "+ Input SP" di `SalesOrderPage` (`onAddSP` → `setShowInputSP(true)`) | render `App.jsx:2646-2660`; tombol `App.jsx:2637` `onAddSP={() => setShowInputSP(true)}`; insert `InputSPPage.jsx:216-282` (`doInsert`) | `sp_items` (`bulkInsertSpItems`) **+** `sp_orders`+`sp_order_items` (`createSpOrderDual`) | **YA** (`InputSPPage.jsx:247-283`) | **Auto** `SP-{6-digit timestamp}` (`InputSPPage.jsx:218`) |
| **FormModal** (legacy "Manual Input") | Menu **`input`** (sidebar "Input SP") → `InputPage` → kartu "Add New SP" (`onAdd` → `setShowAdd(true)`) | render `App.jsx:3316-3322`; tombol `App.jsx:2736` `onAdd={() => setShowAdd(true)}`; `InputPage` def `App.jsx:3943`, kartu `App.jsx:3968-3976`; save `handleSave` `App.jsx:2014-2026` → `dbSaveRow` → `insertSpItem` (`db.js:292`) | **`sp_items` SAJA** | **TIDAK** | **Manual diketik** — field "SP No *" `App.jsx:4318` (`placeholder="2020577"` = nomor SP asli customer), wajib isi `App.jsx:4295` |
| **ImportModal** (bulk CSV/paste) | Menu **`input`** → `InputPage` → kartu "Import from Excel" (`onImport` → `setShowImport(true)`) | render `App.jsx:3352`; tombol `App.jsx:2737`; `handleImport` `App.jsx:2049-2057` → `dbBulkAdd` → `bulkAdd` (`useSpItems.js:145-162`) → `bulkInsertSpItems` (`db.js:302`) | **`sp_items` SAJA** | **TIDAK** | **Dari data yang di-paste** (sp_no manual/apa adanya CSV) |

**Catatan penting:**
- Tombol "+ Input SP" di halaman SP (menu `manifest`) → **InputSPPage** (jalur baru, dual-write).
- Menu sidebar "Input SP" (`input`) → **InputPage** (landing util berisi 2 kartu: FormModal + ImportModal, plus panel "Data Management") — teks masih menyebut "di local storage" (`App.jsx:3980`, **copy usang**, data sebenarnya di Supabase).
- Jadi **tombol shortcut** (`+Input SP` di list) dan **form asli** menuju InputSPPage; sedangkan **menu Input SP** justru menuju jalur legacy (FormModal/Import). Ini sumber kebingungan: dua "Input SP" yang berbeda mesin.

---

## PETA JALUR EDIT

| Jalur | Dipicu dari | file:line | Nulis tabel | Dual-write? | Status keterjangkauan |
|-------|-------------|-----------|-------------|-------------|-----------------------|
| **EditItemModal** (Detail SP, pencil edit item) | Menu `manifest` → `SalesOrderDetailPage` → edit item | `SalesOrderDetailPage.jsx` (modal `:203-472`), `onSaveItem={dbSaveRow}` `App.jsx:2673` → `updateSpItem` (`db.js:311`) | `sp_items` **saja** | TIDAK | **LIVE**. (`shippedQty` di sini `readOnly` `:343`) |
| **ShipmentModal** (edit pengiriman) | Menu **`shipment`** → `ShipmentPage` klik baris (`onUpdate` → `setShipmentRow`) | page `App.jsx:2747`; modal `App.jsx:4472-4519`; `onSave=handleSave` `App.jsx:3350` → `dbSaveRow` | `sp_items` **saja** | TIDAK | **LIVE**. **Mengedit `shippedQty`** (input `App.jsx:4500`) + shippingDate/dc/notes |
| **FinanceModal** (edit flag finance) | Menu **`finance`** & **`outstanding`** → `FinancePage`/`OutstandingPage` klik baris (`onUpdate` → `setFinanceRow`) | pages `App.jsx:2752` & `:2757`; modal `App.jsx:4521-4561`; `onSave=handleSave` `App.jsx:3351` | `sp_items` **saja** | TIDAK | **LIVE**. Edit `inv/fp/submit/kirim` + submitDate/emailStatus/notes |
| **set_sp_status** (Konfirmasi/Tolak) | Menu `manifest` → `SalesOrderPage` tombol Konfirmasi/Tolak | `SalesOrderPage.jsx:155-169` → `:441-464` → `setSpStatus` `db.js:330` → RPC `set_sp_status` `schema:901` | `sp_items.sp_status` **saja** | TIDAK (RPC tak sentuh `sp_orders`) | **LIVE** |
| **External URL / BTB** (Detail SP) | Menu `manifest` → `SalesOrderDetailPage` | `setSpExternalUrl` `db.js:341` (`sp_items`); BTB `sp_btbs` (`db.js:781-808`) | `sp_items` / `sp_btbs` | TIDAK | **LIVE** |
| **FormModal (mode edit)** | `SPSidePanel.onEditItem` → `setEditingRow(item)` | `App.jsx:3306`; render `App.jsx:3316` (`editingRow || showAdd`) | `sp_items` saja | TIDAK | **DEAD** (lihat di bawah) |
| **SPSidePanel.onShipment/onFinance/onDeleteItem** | `SPSidePanel` (legacy detail) | `App.jsx:3309-3311` | `sp_items` | TIDAK | **DEAD** |

**Bukti DEAD:** `SPSidePanel` hanya dirender saat `viewingSPGroup && !selectedSpId` (`App.jsx:3302`), dan `viewingSPGroup` dihitung dari `viewingSP` (`App.jsx:2144`). **`setViewingSP` tidak pernah dipanggil dengan nilai truthy** — grep seluruh `src/` hanya menemukan `setViewingSP(null)` (`App.jsx:2042`, `:3305`) + inisialisasi `null` (`App.jsx:1738`). → `viewingSP` selalu `null` → `SPSidePanel` **tak pernah muncul** → jalur EDIT lewat FormModal + Shipment/Finance-dari-sidepanel + delete-item-dari-sidepanel semuanya **tak terjangkau**.

**Konsekuensi kunci:** Semua editor LIVE menulis **`sp_items` saja**. Dual-write ke `sp_orders`/`sp_order_items` **hanya terjadi saat CREATE via InputSPPage**. Maka setiap edit (qty, shipped, finance, status, url) membuat `sp_order_items` makin stale — tabel baru tak pernah menyusul.

---

## PEMANGGIL FORMMODAL (semua call site)

`FormModal` (def `App.jsx:4263`) dirender di **satu** tempat: `App.jsx:3316-3322`, dengan guard `(editingRow || showAdd)`. Dua sumber state pemicu:

| State pemicu | Di-set di | file:line | Konteks | Hidup? |
|--------------|-----------|-----------|---------|--------|
| `showAdd` (CREATE) | `InputPage.onAdd` | `App.jsx:2736` (`onAdd={() => setShowAdd(true)}`) | Menu `input` → kartu "Add New SP" | **LIVE** |
| `editingRow` (EDIT) | `SPSidePanel.onEditItem` | `App.jsx:3306` | Legacy side panel | **DEAD** (SPSidePanel tak pernah render) |

→ **FormModal secara efektif CREATE-only.** Mode edit-nya kode mati. Tidak dipanggil halaman lain. Dampak pensiun (bila jalur create dialihkan) terbatas ke satu kartu di `InputPage`.

---

## STUB & TOMBOL PALSU

| Elemen | file:line | Yang sebenarnya terjadi |
|--------|-----------|--------------------------|
| Tombol **"Manifest"** (list SP) | `SalesOrderPage.jsx:465-467` (`handleManifest`) | **Toast saja** — `showToast('Manifest ${no} dibuat ✓')`, tidak menulis DB. Komentar `:7` mengakui "shows toast only". |
| **Reset Data** (InputPage) | tombol `App.jsx:2738` `onReset={handleResetData}`; `handleResetData` `App.jsx:2113` → `resetData` (`useSpItems.js`) | **Disabled** — `throw new Error('Reset data tidak tersedia di mode multi-user…')` (`useSpItems.js` ~167). Bukan silent, tapi non-fungsional. |
| **Clear All** (InputPage) | tombol `App.jsx:2739` `onClear={handleClearAll}`; `handleClearAll` `App.jsx:2117` → `clearAll` | **Disabled** — `throw new Error('Clear all tidak tersedia…')` (`useSpItems.js` ~173). |
| Panel "Data Management" copy | `App.jsx:3980` | Menyebut "di local storage" padahal data di Supabase — **teks menyesatkan** (kosmetik). |

> Catatan: rantai putus gudang→status / finance→status (mis. dispatch tak menaikkan `shipped_qty`, flag finance di luar precedence pill) sudah dipetakan terpisah di `AUDIT_STATUS_PENOMORAN.md` — bukan "tombol palsu" tapi "sambungan hilang".

---

## PETA READER (halaman → tabel yang dibaca)

| Reader | Sumber data | file:line | Tabel |
|--------|-------------|-----------|-------|
| **SalesOrderPage** (list SP) | `groupedSP` ← `rows` (`useSpItems`) | render `App.jsx:2631`; `groupBySP` `App.jsx:162-215`; `rows` ← `useSpItems` (`App.jsx:1466-1473`) | **`sp_items`** |
| **SalesOrderDetailPage** (detail) | `enrichedRows.filter(r.spNo)` | `App.jsx:2668-2673`; `enrichedRows` `App.jsx:1882` | **`sp_items`** |
| **ShipmentPage** | `enrichedRows` | `App.jsx:2747`; def `App.jsx:4017` | **`sp_items`** |
| **FinancePage** | `enrichedRows` | `App.jsx:2752`; def `App.jsx:4089` | **`sp_items`** |
| **OutstandingPage** | `enrichedRows` | `App.jsx:2757`; def `App.jsx:4160` | **`sp_items`** |
| **SPSidePanel** (legacy) | `groupedSP` | `App.jsx:3302` | **`sp_items`** (tapi DEAD) |
| **PickingListPage/Detail** | `picking_lists` (+ resolve nama via join `sp_items.sp_no`) | `db.js:357-407` | `picking_lists`; **join `sp_items`** |
| **DeliveryNotePage/Detail** | `delivery_notes` | modul logistics | `delivery_notes` |
| **HomeDashboard / dll** | — | — | (tak baca SP tabel langsung) |

**Grep pembuktian:** `sp_orders`/`sp_order_items` di seluruh `src/` = **nol pembaca** (satu-satunya hit `sp_orders` adalah **komentar** di `InputSPPage.jsx`). → Ketergantungan ke **`sp_items` bersifat TOTAL**; tabel baru punya 0 reader. `sp_items` **tidak boleh dipensiunkan** sampai seluruh reader di atas dipindah ke `sp_orders`/`sp_order_items`.

---

## KOMPONEN INPUT PRODUK GANDA (tech-debt #4) — konfirmasi

Masih **3 scaffold form terpisah**, tetapi ketiganya kini **meng-embed komponen picker yang SAMA** (`src/components/ProductPicker.jsx`):
1. **InputSPPage** (ItemRow) — `InputSPPage.jsx:22` (import), `:738` (pakai).
2. **FormModal** (App.jsx) — `App.jsx:25` (import), `:4338` (pakai).
3. **EditItemModal** (SalesOrderDetailPage) — `SalesOrderDetailPage.jsx:25` (import), `:322` (pakai).

→ Picker sudah **dedup** (satu komponen). Yang masih **triplikat** = kerangka form di sekitarnya (`freshItem`/`freshRow`/`draft` + handler `onPick`/`onChangeText` + mapping field) di 3 file. Konsolidasi penuh (satu komponen "SPItemForm") masih utang terpisah, tapi risiko desync nama-vs-SKU sudah reda karena picker bersama.

---

## ANALISIS DAMPAK PENSIUN FORMMODAL

Jika **FormModal** dihapus, yang benar-benar hilang (mode edit = kode mati, jadi tak ada kehilangan di sana):

**Gap #1 — Input `sp_no` MANUAL saat create (satu-satunya di FormModal).** `App.jsx:4318` membolehkan operator mengetik nomor SP asli customer (`2020577`). **InputSPPage tidak punya field ini** — ia meng-auto-generate `SP-{timestamp}` (`InputSPPage.jsx:218`). Bila FormModal dipensiun tanpa menambah opsi manual di InputSPPage, kemampuan mencatat SP dengan **nomor asli customer via form** hilang. (Import/CSV masih bisa membawa sp_no manual → gap ini hanya untuk entri satuan.) **Keputusan bisnis diperlukan:** apakah SP harus memakai nomor customer, atau nomor internal generatif? (lihat `AUDIT_STATUS_PENOMORAN.md` §Penomoran).

**Gap #2 — Set `shipped_qty` + flag finance saat create.** `freshRow` FormModal menyertakan `shippedQty` (`App.jsx:4357`) dan toggle `inv/fp/submit/kirim` (`App.jsx:~4385-4396`) — bisa diisi **saat pembuatan**. InputSPPage tidak (default 0/false). **Namun** field-field ini tetap bisa diedit pasca-create via ShipmentModal (`App.jsx:4500`) & FinanceModal (`App.jsx:4535-4538`) — jadi gap ini **rendah** (hanya kehilangan "isi sekaligus saat create", bukan kemampuan).

**Gap #3 — Tidak ada.** FormModal tidak dipakai halaman lain, tidak jadi reader, mode edit-nya dead. Pemanggilnya tunggal (`InputPage` kartu "Add New SP").

**Yang TIDAK hilang:** ImportModal (bulk) independen; editor pasca-create (EditItemModal/Shipment/Finance) tetap; reader tetap (semua di `sp_items`).

**Peringatan lintas-jalur (bukan spesifik FormModal):** mempensiunkan FormModal **tidak** menyelesaikan masalah bahwa **semua editor menulis `sp_items` saja** → `sp_order_items` tetap stale. Itu isu terpisah yang harus dijawab dengan keputusan "sumber kebenaran" sebelum tabel baru berguna.

---

## URUTAN PEMENSIUNAN YANG DISARANKAN (bertahap, JANGAN dieksekusi sekarang)

1. **Langkah 0 (prasyarat, keputusan):** tetapkan sumber kebenaran SP — tetap `sp_items` (jembatan) atau pindah ke `sp_orders`. Semua langkah di bawah menyisakan `sp_items` sebagai sumber sampai reader dipindah. **Jangan sentuh `sp_items` reader dulu.**
2. **Langkah 1 — buang kode MATI (risiko nol):** hapus `SPSidePanel` + wiring `viewingSP`/`editingRow` (`App.jsx:3302-3313`, `:3316` cabang `editingRow`). Ini otomatis menjadikan FormModal **create-only** tanpa mengubah perilaku (semuanya sudah unreachable). Verifikasi build + tak ada referensi `viewingSP`/`onEditItem` tersisa.
3. **Langkah 2 — tutup Gap #1:** putuskan penomoran. Bila SP tetap butuh nomor customer, tambah field opsional `sp_no` manual di InputSPPage (atau kolom terpisah `customer_sp_no`) + kunci `UNIQUE(customer_id, sp_no)` di `sp_items` (samakan `sp_orders`) untuk cegah duplikat/merge (lihat `AUDIT_STATUS_PENOMORAN.md`).
4. **Langkah 3 — alihkan jalur create legacy:** arahkan kartu "Add New SP" di `InputPage` (`App.jsx:2736`/`3968`) ke **InputSPPage** (bukan `setShowAdd`), atau hapus kartu itu dan jadikan menu `input` murni untuk **Import**. Setelah tak ada pemicu `showAdd`, hapus `FormModal` + `handleSave`-nya jika tak dipakai modal lain (cek: `ShipmentModal`/`FinanceModal` juga pakai `onSave={handleSave}` → **jangan hapus `handleSave`**, hanya komponen FormModal).
5. **Langkah 4 — satukan editor pasca-create:** buat Shipment/Finance/EditItem menulis **dual** (atau langsung ke sumber kebenaran) agar `sp_order_items` tak stale. Baru setelah ini tabel baru layak jadi reader.
6. **Langkah 5 — konsolidasi 3 scaffold produk** jadi satu komponen `SPItemForm` (picker sudah bersama).
7. **Langkah 6 — pindahkan reader** (SalesOrderPage/Detail/Shipment/Finance/Outstanding) ke `sp_orders`/`sp_order_items`, lalu pensiunkan tulisan ke `sp_items`. **Terakhir**, setelah semua reader & writer pindah.

> Prinsip AGENTS.md: pindah reader **sebelum** drop kolom/tabel; hapus kode mati lebih dulu (murah, aman); jangan hilangkan kemampuan (nomor manual) tanpa keputusan bisnis eksplisit.
