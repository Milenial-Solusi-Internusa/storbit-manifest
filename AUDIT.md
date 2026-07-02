# AUDIT: ProductPicker tidak muncul di form Input SP yang dipakai user

> Auditor mode. **Read-only** — tidak ada kode/DB yang diubah; hanya dokumen ini yang ditulis (menimpa isi lama).
> Konteks: kemarin ProductPicker dropdown-only dipasang di `InputSPPage.jsx`, tapi di Preview (commit `7dcb3be`) form yang dibuka user masih produk teks bebas.
> Semua klaim disertai `file:line`.

---

## RINGKASAN

**Kenapa ProductPicker tidak muncul: perubahan kemarin masuk ke KOMPONEN YANG SALAH untuk jalur yang dipakai user.**

Ada **tiga** komponen berbeda yang me-render input "Product Name" untuk item SP, dan mereka **tidak berbagi kode**:

| Komponen | File:line | Status | Dibuka dari |
|---|---|---|---|
| `ItemRow` (di `InputSPPage`) | `InputSPPage.jsx:662` | ✅ **ProductPicker** (yang kemarin diedit) | Menu **Daftar Pesanan** (`manifest`) → tombol Add SP (`showInputSP`) |
| `FormModal` | `App.jsx:4306` | ❌ **teks bebas**, tanpa `product_id` | Menu **Input SP** (`input`) → **"Add New SP"** ← **INI yang diklik user** |
| `EditItemModal` | `SalesOrderDetailPage.jsx:307` | ❌ **teks bebas** | **Detail SP** → pencil edit item |

Jadi ProductPicker **benar-benar ada dan benar**, tapi hanya di jalur "Daftar Pesanan → Add SP". Saat user masuk lewat **menu "Input SP" → card Manual Input → "Add New SP"**, yang terbuka adalah **`FormModal` di `src/App.jsx:4247`** — komponen lain yang tidak pernah disentuh kemarin. Tak ada yang "menimpa"; memang dua komponen berbeda untuk dua tombol berbeda.

**File yang SEHARUSNYA diedit agar sesuai keluhan user:**
1. `src/App.jsx` — `FormModal` (Product Name di `:4306`) → untuk "Add New SP" dari menu Input SP.
2. `src/modules/logistics/SalesOrderDetailPage.jsx` — `EditItemModal` (Product Name di `:307`) → untuk edit item di Detail SP.

`InputSPPage.jsx` sudah benar — biarkan.

**Catatan penting soal daftar field:** field yang kamu sebut ("SLA, Estimated Delivery, Arrival Date") **tidak ada** di `FormModal` (Add New Item) — itu milik `EditItemModal` (`SalesOrderDetailPage.jsx:341-347`). Jadi daftar field yang kamu lihat adalah **gabungan dua modal berbeda** yang kebetulan mirip; keduanya sama-sama masih teks bebas untuk Product Name.

---

## TEMUAN PER PERTANYAAN

### 1. Tombol "Add New SP" (card Manual Input, menu Input SP) membuka komponen apa?

Jalurnya: **menu Input SP → `InputPage` → "Add New SP" → `FormModal`.**

- Render menu: `src/App.jsx:2729-2737` → `activeMenu === 'input'` → `<InputPage onAdd={() => setShowAdd(true)} … />`.
- `InputPage` (def `App.jsx:3927`) me-render `ActionCard` "Manual Input" dengan `buttonLabel="Add New SP"` + `onClick={onAdd}` (`App.jsx:3945-3948`).
- `onAdd` = `setShowAdd(true)` (`App.jsx:2731`).
- Render modal: `App.jsx:3300-3306` → `{(editingRow || showAdd) && <FormModal initial={editingRow} customers={customers} onClose={…} onSave={handleSave} />}`.

⇒ Membuka **`FormModal`** (`src/App.jsx:4247`).

### 2. Modal "Add New Item" / "Edit Item" (subtitle "Field dengan asterisk wajib diisi") di-render file mana? Sama dengan InputSPPage?

**`FormModal` di `src/App.jsx:4247`** — judul di `App.jsx:4285` (`title={initial ? 'Edit Item' : 'Add New Item'}`, subtitle `"Field dengan asterisk wajib diisi"`).

**BERBEDA** dari `InputSPPage.jsx` (file yang kemarin diedit). Sama sekali komponen lain, didefinisikan inline di `App.jsx`.

Tambahan (agar tidak keliru): modal **"Edit Item" yang muncul dari Detail Sales Order** adalah komponen **KETIGA** lagi — `EditItemModal` di `src/modules/logistics/SalesOrderDetailPage.jsx:198` (judul `:285`, di-invoke `:1247`). `EditItemModal` inilah yang punya field **SLA / Estimated Delivery / Arrival Date** (`SalesOrderDetailPage.jsx:341-347`); `FormModal` tidak punya field-field itu.

### 3. Perubahan ProductPicker kemarin ada di mana? Apakah komponen itu yang dirender saat "Add New SP"?

- ProductPicker kemarin ada di **`InputSPPage.jsx`**: pemakaian di `:662` (`<ProductPicker value={item.productName} …/>`), `onPick` prefill di `:673-676`, pin SOA `useProducts({ companyId: … })` di `:143`, di dalam `ItemRow` (`:646` dst).
- Komponen `InputSPPage` **hanya** dirender saat `activeMenu === 'manifest' && !selectedSpId && showInputSP` (`App.jsx:2640-2654`), dan `showInputSP` di-set `true` oleh tombol Add SP di halaman **Daftar Pesanan** (`onAddSP={() => setShowInputSP(true)}`, `App.jsx:2632`).
- Saat user klik **"Add New SP" dari menu Input SP**, yang dirender adalah **`FormModal`** (Temuan 1), **bukan** `InputSPPage`. Jadi ProductPicker tidak "ditimpa" — memang **komponen & route berbeda**. Perubahan kemarin tidak menyentuh jalur yang dipakai user.

### 4. Ada berapa komponen me-render input "Product Name" item SP? Sebutkan semua + mana yang aktif di mana.

**Tiga** komponen, tidak berbagi kode:

a. **`InputSPPage.jsx:662`** — `<ProductPicker>` (✅ sudah dropdown-only + prefill). **Aktif:** Daftar Pesanan (`manifest`) → tombol Add SP → `showInputSP` (`App.jsx:2632,2640`).

b. **`App.jsx:4306` (`FormModal`)** — `<Input label="Product Name *" … />` teks bebas (❌). **Aktif:** menu **Input SP** → "Add New SP" (`showAdd`) **dan** edit baris dari list Input Data (`editingRow`) — keduanya render `FormModal` di `App.jsx:3300`.

c. **`SalesOrderDetailPage.jsx:307` (`EditItemModal`)** — `<ModalInp value={draft.productName} …/>` teks bebas (❌). **Aktif:** Detail SP → pencil edit item (`EditItemModal` di-invoke `SalesOrderDetailPage.jsx:1247`).

Hanya **(a)** yang sudah diperbaiki. **(b)** dan **(c)** — yang user lihat — masih teks bebas.

### 5. Saat item disimpan: product_id ikut ditulis atau hanya product_name? Di jalur mana bahaya desync?

Kolom `product_id` **sudah** dipetakan di write mapping: `src/lib/db.js:65` `product_id: item.productId || null` (dipakai `bulkInsertSpItems` & `updateSpItem`). Tapi apakah terisi bergantung pada apakah komponen mengisi `productId`:

- **`FormModal` (Add New SP) → DESYNC SEJAK AWAL.** State `data` FormModal **tidak punya field `productId`** (`App.jsx:4248-4255`). Simpan: `handleSubmit` (`App.jsx:4270-4280`) → `onSave(data)` → `handleSave` (`App.jsx:2009`) → `dbSaveRow` → `saveRow` → `spToDb`. Karena `data.productId` undefined → **`product_id` ditulis NULL**; `product_name` + `sku` keduanya teks bebas. Item baru dari sini **tak punya link ke master sama sekali**.

- **`EditItemModal` (Detail SP) → DESYNC saat nama diedit.** Simpan: `handleSave` (`SalesOrderDetailPage.jsx:249-262`) kirim `{ ...item, ...draft }` → `handleSaveItem` (`:679-687`) → `onSaveItem` = `dbSaveRow` (`App.jsx:2668`). `product_id` ikut dari `...item` (dipertahankan), **tetapi** `draft.productName` bebas diedit (`:307`) dan `draft` **tidak punya `productId`** (`:199-220`). Akibatnya: ubah nama → `product_name` berubah, sementara `product_id` + `sku` tetap milik produk lama → **nama menyimpang dari product_id/SKU** (persis kasus nama "d" vs SKU `FG.DSP.POP.0006`). Untuk item yang lahir dari FormModal, `product_id` sudah null → tetap null.

**Ringkas bahaya desync:** (b) FormModal = product_id **selalu NULL** + nama/SKU bebas; (c) EditItemModal = product_id lama **dipertahankan** tapi nama bisa menyimpang tanpa memperbarui product_id/SKU.

### 6. Field DC, Arrival Date, Estimated Delivery, Expired Date, SLA — punya kolom DB atau hanya tampil?

**Semua punya kolom DB nyata di `sp_items` dan tersimpan** via `spToDb` (`src/lib/db.js`):
- `dc` → `sp_items.dc`
- `expired_date` → `d(item.expired_date ?? item.deadline)` → `sp_items.expired_date`
- `estimated_delivery_date` → `d(item.estimatedDeliveryDate)` → `sp_items.estimated_delivery_date`
- `arrival_date` → `d(item.arrival_date ?? item.deliveredDate)` → `sp_items.arrival_date`
- `sla_days` → `sp_items.sla_days`

Kolom-kolom tersebut ada di `sp_items` (`supabase/schema_snapshot.sql`, tabel `sp_items`). **Bukan tampilan kosong.** Catatan lokasi input: SLA/Estimated Delivery/Arrival hanya ada di **`EditItemModal`** (`SalesOrderDetailPage.jsx:341-347`); `FormModal` hanya punya DC/Expired Date/Shipping Date (`App.jsx:4305,4322,4328`).

---

## REKOMENDASI FIX (jangan dieksekusi — rekomendasi saja)

Tujuan: **SEMUA** titik input produk SP jadi ProductPicker dropdown-only + `product_id` konsisten tersimpan. Yang perlu diubah:

### A. `src/App.jsx` — `FormModal` (jalur "Add New SP" dari menu Input SP) — **prioritas tertinggi (ini yang user pakai)**
1. Tambah `productId: null` ke state awal `data` (`App.jsx:4248-4255`).
2. Ganti `<Input label="Product Name *" … />` (`:4306`) → `<ProductPicker>`:
   - `onPick(p)` → set `productId=p.id`, `productName=p.name`, `sku=p.code`, prefill `unitPrice=p.default_price` (nilai awal, tetap editable).
   - `onChangeText(v)` → set `productName=v`, `productId=null`, `sku=''` (batalkan pilihan).
3. Jadikan SKU read-only (isi dari pick), seperti pola InputSPPage.
4. Validasi `handleSubmit` (`:4270`) → wajib `data.productId` (bukan sekadar `productName`), agar teks bebas tak bisa disimpan.
5. Import `ProductPicker` + `useProducts({ companyId: SOA })` di `App.jsx` (atau pertimbangkan mengekstrak FormModal ke file sendiri; App.jsx sudah ~4.9k baris).

### B. `src/modules/logistics/SalesOrderDetailPage.jsx` — `EditItemModal` (edit item di Detail SP)
1. Tambah `productId: item.productId ?? null` ke state `draft` (`:199-220`) — agar pilihan produk bisa berubah & tersimpan (bukan cuma warisan `...item`).
2. Ganti `<ModalInp value={draft.productName} …/>` (`:307`) → `<ProductPicker>` dengan `onPick`/`onChangeText` seperti A (set `draft.productId/productName/sku`, prefill unitPrice opsional).
3. SKU (`:` field SKU EditItemModal) jadi read-only dari pick.
4. Pastikan `handleSave` (`:249-262`) tetap kirim `productId` (karena kini ada di `draft`, `{...item,...draft}` akan menuliskannya benar).

### C. `src/lib/db.js`
- Tidak perlu diubah: `spToDb:65` sudah menulis `product_id: item.productId || null`. Cukup pastikan A & B mengisi `productId`.

### D. `src/modules/logistics/InputSPPage.jsx`
- **Biarkan** — sudah ProductPicker dropdown-only + prefill (Temuan 3).

### Catatan arsitektur (opsional, di luar minimal fix)
Ada **tiga** form input item SP yang menduplikasi field & logika (`InputSPPage.ItemRow`, `FormModal`, `EditItemModal`). Idealnya dikonsolidasikan ke satu komponen input-item bersama agar perbaikan seperti ini tidak perlu diulang di 3 tempat. Itu refactor besar dan berisiko — di luar scope fix minimal; minimal fix cukup A + B.

---

*Audit selesai. Tidak ada file kode/DB yang diubah. Hanya AUDIT.md ini yang ditulis.*
