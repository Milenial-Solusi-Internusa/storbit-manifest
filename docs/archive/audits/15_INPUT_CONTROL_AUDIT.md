# INPUT CONTROL AUDIT — Nexus by MSI

> Dua misi audit read-only. Memetakan FAKTA di kode, bukan memperbaiki. Sumber: kode `src/` + `supabase/schema_snapshot.sql` per branch `feat/detail-sp-reskin`.
> **⚠️ Tidak menjalankan app.** Semua = pembacaan kode + schema. Perilaku runtime ditandai perlu verifikasi manual.

---

## BAGIAN 1 — MISI 1: Jalur harga (Master Product sebagai sumber tunggal)

### Kesimpulan: **(a) SIAP** — dengan 2 catatan penting

Master Product **sudah** menyimpan harga (default + 3 kategori), dan **Input SP sudah menariknya + sudah read-only**. Yang tersisa persis seperti opsi (a): **Edit Item SP tinggal dibuat read-only dari sumber yang sama.** Tapi ada 2 hal yang WAJIB diputuskan dulu (lihat Bagian 4): (i) Edit Item belum punya mekanisme kategori seperti Input SP; (ii) harga SP = **SNAPSHOT**, jadi "kunci ke Master Product" mengubah perilaku bisnis.

### 1. Master Product — tabel & kolom harga (`schema_snapshot.sql`)

Tabel `products` (mulai baris 3805). Harga = **kolom pada `products`**, bukan tabel kategori terpisah:

| Kolom | Baris | Tipe |
|---|---|---|
| `default_price` | 3814 | numeric(18,2) DEFAULT 0 |
| `unit_cost` | 3829 | numeric(15,2) |
| `price_semester` | 3836 | numeric(18,2) |
| `price_tahunan` | 3837 | numeric(18,2) |
| `price_project` | 3838 | numeric(18,2) |

Audit perubahan harga di `product_price_history` (baris 3768). RPC server-side yang memetakan kategori→kolom harga: `bulk_update_product_prices` (~baris 96/123-147) dan `set_product_category_prices` (~1097/1118). Enum kategori di-CHECK pada `sp_order_items.price_category` (baris 4341): `'semester','tahunan','project'`.

### 2. Kategori harga — nyata atau placeholder?

**Label kategori = const statis `CAT_DEFS`** (`InputSPPage.jsx:63-67`) — memetakan `default→default_price`, `semester→price_semester`, `tahunan→price_tahunan`, `project→price_project`. **Tapi HARGA-nya nyata DB-backed** (kolom `products` di atas). `availCatsOf(p)` (`InputSPPage.jsx:69`) hanya menampilkan kategori yang kolomnya **non-null** pada produk terpilih. Jadi: himpunan label statis, nilai harga hidup dari master.

### 3. Input SP — Unit Price di-set dari mana? → dari MASTER, dan sudah READ-ONLY

| Titik | file:line | Fakta |
|---|---|---|
| Opsi kategori | `InputSPPage.jsx:63-67` | `CAT_DEFS` → kolom harga `products` |
| onPick produk | `InputSPPage.jsx:714-727` | set productId/name/sku; jika 1 kategori → auto-pilih + `unitPrice = Number(p[col])` (`:722`); jika banyak → kategori kosong + harga 0 |
| Ganti kategori | `InputSPPage.jsx:757-762` | `unitPrice = Number(prod[def.col]) || 0` (`:761`) — ditarik live dari objek produk saat pilih |
| Input Unit Price | `InputSPPage.jsx:782-785` | **`readOnly: true`** ("terkunci — nilainya ikut kategori harga"), styling grey/not-allowed. **Tak bisa diketik.** |
| Simpan | `InputSPPage.jsx:263-270` | payload `unit_price: Number(item.unitPrice)` + `price_category` |

`useProducts` hook memuat kolom kategori (dikonfirmasi via `CAT_DEFS` yang membacanya). **Input SP = sudah sesuai target: read-only, harga turunan dari master.**

### 4. Edit Item SP — Unit Price di-input gimana? → FREE-TYPED, tanpa gate (INI gap-nya)

`EditItemModal` di `SalesOrderDetailPage.jsx` (mulai baris 226):

| Titik | file:line | Fakta |
|---|---|---|
| Nilai awal draft | `:242` | `unitPrice: item.unitPrice ?? 0` — dari **record SP tersimpan** (`sp_items` via `spFromDb`), **bukan** re-fetch master |
| onPick produk | `:351` + komentar `:342-344` | hanya set productId/name/sku; **sengaja TIDAK re-prefill harga** ("unit_price TIDAK di-prefill di sini (tetap snapshot)") |
| Input Unit Price | `:400-404` | `<input type="number" value={draft.unitPrice} onChange=…>` — **bebas diketik, tanpa readOnly, tanpa dropdown kategori, tanpa validasi nilai** |
| Gate Save | `:487-489` | satu-satunya gate = `wasLinked && !draft.productId` (wajib produk tertaut) — **tidak** memvalidasi harga |
| Simpan | `:290-292` | `unitPrice: Number(draft.unitPrice)` diteruskan ke update |

**Edit Item = bertentangan dengan tujuan:** siapa pun (termasuk super admin) bisa mengetik harga bebas, tak ada dropdown kategori, tak menarik dari master.

### 5. Sumber kebenaran — **SNAPSHOT** (disalin saat create, berdiri sendiri)

| Bukti | file:line |
|---|---|
| Tulis: `spToDb` → `unit_price: Number(item.unitPrice) || 0` | `db.js:78` |
| Insert per baris via `bulkInsertSpItems` | `db.js:302-303` |
| Baca balik: `spFromDb` → `unitPrice: Number(row.unit_price ?? 0)` — **tanpa join ke `products`** | `db.js:36` |
| Kolom stored nyata | `sp_items.unit_price` (schema 4263), `sp_order_items.unit_price` (schema 4331) |
| `product_id` FK ada tapi hanya untuk label/linkage, **tak dipakai menurunkan harga saat tampil** | `sp_items.product_id` 4285; `sp_order_items.product_id` 4326 |

**Verdict: harga SP = SNAPSHOT.** Ditarik dari master hanya SAAT create (via kategori), lalu disimpan di baris SP dan berdiri sendiri. Kalau `products.default_price/price_*` berubah kemudian, baris SP lama **tetap** memakai `unit_price` yang tercatat.

### Peta jalur harga (ringkas)

```
Master Product (products.default_price / price_semester / price_tahunan / price_project)
      │  (CAT_DEFS: kategori → kolom harga)
      ▼
Input SP  ── pilih produk + kategori → unitPrice READ-ONLY dari master ──►  simpan
      │                                                                    (SNAPSHOT ke
      ▼                                                                     sp_items.unit_price)
sp_items.unit_price / sp_order_items.unit_price  (stored, berdiri sendiri)
      │  (spFromDb baca stored, TANPA re-derive dari master)
      ▼
Edit Item SP  ── seed dari snapshot tersimpan → input type=number BEBAS DIKETIK, tanpa gate ✗
```

### Implikasi mengunci Edit Item ke Master (JANGAN kuputuskan — untuk kamu)

Karena harga = snapshot, "kunci ke Master Product" di Edit Item punya **dua tafsir berbeda perilaku**:
- **(i) Read-only = tampilkan snapshot tersimpan** (buang input bebas, tak re-derive). Mempertahankan harga historis; koreksi harga tetap harus lewat re-create/mekanisme lain. Perubahan minimal, tak mengubah angka lama.
- **(ii) Read-only = re-derive dari master (via kategori) saat Edit**. Konsisten "sumber tunggal", TAPI SP lama akan **berubah** angkanya kalau harga master sudah berubah sejak SP dibuat → mengubah nilai historis/tertagih. Ini keputusan bisnis, bukan sekadar UI.

Untuk mewujudkan target sepenuhnya, Edit Item juga perlu **port mekanisme kategori** dari Input SP (`CAT_DEFS`/`availCatsOf` + dropdown kategori) — saat ini EditItemModal tak punya itu sama sekali.

---

## BAGIAN 2 — MISI 2: Inventaris input angka (rawan scroll-ubah-nilai)

`type="number"` berubah nilai saat scroll roda mouse ketika ter-focus. **AMAN** = ada `onWheel` blur/preventDefault ATAU `type="text"`. **RAWAN** = `type="number"` tanpa `onWheel`.

**Perlindungan `onWheel` di repo hanya ada 2 titik, dan NOL dipakai modul in-scope:** `ProductDetailPage.jsx:556` (`FormField`) + `BulkEditPricePage.jsx:207` (inline).

| File:line | Field | type | Status | Komponen bersama |
|---|---|---|---|---|
| `InputSPPage.jsx:742` | QTY | number | **RAWAN** | `inp()` lokal (no onWheel) |
| `InputSPPage.jsx:782` | Unit Price | number `readOnly` | AMAN (readOnly) | `inp()` |
| `InputSPPage.jsx:792` | Ongkos Kirim | number | **RAWAN** | `inp()` |
| `SalesOrderDetailPage.jsx:364` | qty (EditItemModal) | number | **RAWAN** | `ModalInp` (no onWheel) |
| `SalesOrderDetailPage.jsx:387` | slaDays | number | **RAWAN** | `ModalInp` |
| `SalesOrderDetailPage.jsx:403` | unitPrice | number | **RAWAN** | inline `<input>` |
| `SalesOrderDetailPage.jsx:410` | shippingPrice | number | **RAWAN** | inline `<input>` |
| `QuotationFormPage.jsx:243` | cost_price | number | **RAWAN** | inline (`cellInp` style) |
| `QuotationFormPage.jsx:256` | exchange_rate | number step=any | **RAWAN** | inline `cellInp` |
| `QuotationFormPage.jsx:265` | unit_price | number | **RAWAN** | inline `cellInp` |
| `QuotationFormPage.jsx:278` | qty | number step=any | **RAWAN** | inline `cellInp` |
| `QuotationFormPage.jsx:924` | discount_pct | number step=0.1 | **RAWAN** | inline `inpStyle` |
| `QuotationFormPage.jsx:1041` | container_qty | number | **RAWAN** | inline `inpStyle` |
| `QuotationFormPage.jsx:951` | vat_rate | **select** | AMAN (bukan number) | — |
| `App.jsx:3873` (ShipmentModal) | Shipped QTY | number | **RAWAN** | `Input` (App.jsx:3814, no onWheel) |
| `App.jsx:4601` (FinanceModal BTB) | dppPPN | number | **RAWAN** | inline `<input>` |
| `App.jsx:4603` (FinanceModal BTB) | pph | number | **RAWAN** | inline `<input>` |
| `App.jsx:4608` (FinanceModal BTB) | payment | number | **RAWAN** | inline `<input>` |
| `PRFFormPage.jsx:542` | commercial_value | text + inputMode=decimal | AMAN | inline |
| `PRFFormPage.jsx:629` | sea_container_qty | text + inputMode=numeric | AMAN | inline |
| `PRFFormPage.jsx:640,642,643` | sea_lcl_gw/volume/koli | text + inputMode | AMAN | inline |
| `PRFFormPage.jsx:651,653,654` | air_gw/volume/koli | text + inputMode | AMAN | inline |
| `PRFFormPage.jsx:672` | inland_gw | text + inputMode=decimal | AMAN | inline |
| `PRFFormPage.jsx:700` | project_qty | text + inputMode=numeric | AMAN | inline |
| `InquiryFormPage.jsx:438` | weight_kg | text | AMAN | inline |
| `InquiryFormPage.jsx:444` | volume_cbm | text | AMAN | inline |
| `ProspectFormPage.jsx` | bant_*/estimated | tak ada `type=number` | AMAN | inline |

**Total RAWAN: 16 field** (InputSP 2 · EditItemModal 4 · Quotation 6 · ShipmentModal 1 · FinanceModal BTB 3). PRF/Inquiry/Prospect **aman by design** (pakai `type="text"` + `inputMode`).

### Komponen input bersama (kunci untuk terpusat/tidak)

| Komponen | file:line | onWheel? | Dipakai |
|---|---|---|---|
| `ModalInp` | `SalesOrderDetailPage.jsx:194` | **Tidak** | EditItemModal qty/slaDays |
| `Input` | `App.jsx:3814` | **Tidak** | ShipmentModal Shipped QTY |
| `inp()` | `InputSPPage.jsx:320,611` | **Tidak** | qty/ongkir/unit price |
| `cellInp`/`inpStyle` | `QuotationFormPage.jsx` | — (style factory, bukan komponen) | line items Quotation |
| `Field` | InputSP/PRF/Inquiry/Prospect/Quotation | — (layout wrapper, tak render `<input>`) | — |
| `FormField` | `ProductDetailPage.jsx:544` | **Ya** (blur) | **tidak** in-scope |

**Tidak ada satu komponen number-input tunggal lintas CRM/Logistics/Procurement.** Number input dibangun inline atau via wrapper (`ModalInp`/`Input`/`inp()`) yang belum ber-onWheel; sebagian besar Quotation & FinanceModal murni inline.

---

## BAGIAN 3 — Rekomendasi pendekatan fix Misi 2 (TIDAK dieksekusi)

**Rekomendasi: HYBRID — pusatkan di wrapper yang ada + per-titik untuk yang inline.** Alasan: tak ada satu komponen bersama, jadi 100% terpusat tak mungkin; tapi beberapa wrapper meng-cover banyak titik sekaligus.

1. **Handler tunggal** (module-level, pola sudah terbukti di `BulkEditPricePage.jsx:207`): `const blurOnWheel = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.blur(); };`
2. **Tempel di 3 wrapper** → meng-cover 5 titik sekaligus, konsisten:
   - `ModalInp` (`SalesOrderDetailPage.jsx:194`) → EditItemModal qty + slaDays.
   - `Input` (`App.jsx:3814`) → ShipmentModal Shipped QTY.
   - `inp()` (`InputSPPage.jsx:320/611`) → qty + ongkos kirim.
3. **Per-titik untuk yang inline** (tak lewat wrapper): EditItemModal `unitPrice`/`shippingPrice` (SalesOrderDetailPage 403/410); Quotation line items 243/256/265/278 + discount_pct 924 + container_qty 1041; FinanceModal BTB 4601/4603/4608.
4. **Alternatif "paling bersih" (lebih besar):** adopsi pola PRF (`type="text"` + `inputMode="decimal"/"numeric"`) yang memang **kebal** masalah ini — tapi mengubah parsing/validasi tiap field → lebih berisiko daripada menambah `onWheel`. Untuk perbaikan cepat & aman, opsi onWheel lebih ringan.

Cakupan minimum agar semua RAWAN tertutup = 3 wrapper + ~11 titik inline. Tidak ada DB tersentuh (murni FE).

---

## BAGIAN 4 — Ambiguitas / butuh keputusanmu

**Misi 1:**
1. **Snapshot vs live** (Bagian 1, akhir) — "kunci Edit Item ke Master" = tampilkan snapshot read-only **(i)**, atau re-derive dari master via kategori **(ii)** (mengubah angka SP lama bila harga master berubah)? Keputusan bisnis, bukan UI.
2. **Port mekanisme kategori ke Edit Item** — apakah Edit Item perlu dropdown kategori (seperti Input SP) supaya bisa ganti kategori sambil tetap read-only-dari-master, atau cukup kunci ke kategori yang tersimpan (`sp_order_items.price_category`)? Catatan: `sp_items` (legacy, jalur Edit Item sekarang) **tidak** menyimpan `price_category` — hanya `sp_order_items` (kanonik) yang punya. **Perlu verifikasi runtime** apakah EditItemModal menulis ke `sp_items` saja atau dual-table.
3. **Cakupan "bahkan super admin"** — target minta harga read-only untuk semua role. Perlu konfirmasi: benar-benar TAK ada jalur ketik harga di SP untuk role mana pun (koreksi harga 100% via Master Product)?

**Misi 2:**
4. **Pendekatan fix** — HYBRID onWheel (cepat, rekomendasi) vs migrasi ke pola `type=text`+`inputMode` (lebih bersih, lebih berisiko)?
5. **Belum ada TD** — tidak ada entri di `08_TECH_DEBT.md` untuk isu scroll-ubah-angka (grep `onWheel/scroll/number` = 0). Precedent fix ada (`ProductDetailPage.FormField`, `BulkEditPricePage`) tapi tak pernah digeneralisasi/dicatat. **Kandidat TD baru** (LOW–MEDIUM; 16 field RAWAN, termasuk harga/qty SP & Quotation).

---

## Catatan Wajib

Audit ini **tidak menjalankan app/build**. Semua dari pembacaan kode + `schema_snapshot.sql`. Yang **perlu verifikasi runtime**: (a) apakah EditItemModal menulis `price_category` / dual-table (untuk keputusan Misi 1 #2); (b) reproduksi scroll-ubah-nilai pada 16 field RAWAN di browser. Nomor baris per branch `feat/detail-sp-reskin` saat audit.
