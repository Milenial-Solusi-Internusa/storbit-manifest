# AUDIT: Fitur "If Any" per baris charge di Quotation

> Auditor mode. **Read-only** — tidak ada kode/DB yang diubah; hanya dokumen ini yang ditulis (menimpa isi lama).
> Fitur: tiap baris charge punya checkbox **"If Any"**. Baris ber-flag: tetap tampil + harga satuan, TAPI **tidak** dijumlahkan ke Section total maupun Grand total; di PDF kolom total baris itu ditulis **"(if any)"**. Flag tersimpan permanen di DB.
> Semua klaim disertai `file:line`.

---

## RINGKASAN

**Skala: FRONTEND (3 file) + DB (1 kolom baru + ganti 1 RPC) + PDF.** Bukan sekadar frontend — karena flag harus permanen, butuh kolom DB + perubahan RPC `save_quotation`; dan karena total di-hitung ulang di beberapa tempat, exclusion harus dipasang di **≥5 titik perhitungan**.

Titik yang harus diubah:
- **DB:** `ALTER TABLE quotation_items ADD COLUMN if_any boolean` + `CREATE OR REPLACE save_quotation` (tambah `if_any` di INSERT item).
- **`QuotationFormPage.jsx`:** `freshRow` (+field), checkbox UI di baris, **exclude if_any di 2 perhitungan section-total** (inline `:307` + `sectionTotals :626`), `baseItemRows` (+if_any), select+map saat load edit (`:454`) & duplicate (`:527`).
- **`QuotationDetailPage.jsx`:** select (+if_any `:181`), **exclude if_any di `sections.total :225` + `subtotal :229`**, render section on-screen.
- **`QuotationPDF.jsx`:** kolom total baris → "(if any)" (`:225`), fallback subtotal (`:113`) exclude.

**Aman tanpa perubahan** (baca `total_amount` tersimpan, bukan hitung ulang): QuotationListPage, DealDetailPage.

⚠️ **Bahaya utama:** section-total dihitung di **3 tempat berbeda** (Form inline, Form `sectionTotals`, Detail). Kalau salah satu lupa di-exclude → total form ≠ total detail ≠ total tersimpan. Lihat RISIKO.

---

## TEMUAN PER PERTANYAAN

### 1. Section charges + baris di-render di mana? Struktur satu baris?

- Komponen **`SectionCard`** (`src/modules/crm/QuotationFormPage.jsx:167`). Tabel baris: `:206-302`; header kolom `:210-220` (Description, Cost Price, Currency, Kurs, Sell Price, Unit Label, QTY, Total IDR, [hapus]); baris di-map `:223-299`; kolom **Total IDR** per baris `:282-289` (`rp(row.total)`).
- **Struktur baris** = `freshRow()` (`:102-112`): `{ id, description, cost_price, currency, unit_price, qty, unit_label, exchange_rate, total }`. **Belum ada `if_any`.**
- Perhitungan total baris: `calcRowTotal(row)` (`:120-126`) = `round(unit_price × qty × rate)` (rate=1 utk IDR, else exchange_rate). Dipanggil di `updateRow` (`:617`).

### 2. Baris disimpan ke tabel/kolom apa? Lewat RPC atau insert langsung?

- Tabel **`quotation_items`**. Kolom sekarang (`supabase/schema_snapshot.sql`, `CREATE TABLE public.quotation_items`): `id, quotation_id, sort_order, description, qty, unit, unit_price, notes, group_name, currency, unit_label, exchange_rate, total, cost_price`. **Tidak ada `if_any`.** Tidak ada CHECK constraint.
- **Dua jalur simpan** (`QuotationFormPage.jsx`):
  - **EDIT → RPC** `save_quotation` (`:729-733`), item = `baseItemRows()` (`:667-684`) dikirim sbg `p_items`.
  - **CREATE → insert langsung** ke `quotations` (`:785-786`) lalu `quotation_items` (`:790-791`) — `baseItemRows()` + `quotation_id`.
- `baseItemRows()` shape (`:670-682`): `{ sort_order, group_name, description, qty, unit, unit_price, unit_label, currency, exchange_rate, total, cost_price }`. **Belum ada `if_any`.**

### 3. Bagaimana Section total & Grand total dihitung? (harus exclude if_any)

Di **`QuotationFormPage.jsx`**, section-total dihitung di **DUA** tempat:
- **(a) Inline di SectionCard** (`:307`): `section.rows.reduce((s, r) => s + (r.total || 0), 0)` — display "Section total" di dalam kartu.
- **(b) `sectionTotals` useMemo** (`:626-630`): `total: sec.rows.reduce((s, r) => s + (Number(r.total) || 0), 0)`.

Lalu berantai:
- `subtotal` (`:632`) = `sectionTotals.reduce(...)`.
- `discountAmount` (`:634`) = `round(subtotal × discount%)`.
- `tax` (`:635`) = `round((subtotal − discount) × vat_rate)`.
- **`grandTotal`** (`:636`) = `(subtotal − discount) + tax`.
- `totalCost` (`:639-648`) internal (untuk margin) = Σ `cost_price × qty × kurs` (semua baris).

⇒ Untuk exclude if_any: ubah **(a) `:307`** dan **(b) `:626`** agar `r.if_any ? 0 : r.total`. Otomatis subtotal→tax→grandTotal ikut benar. **`totalCost` = keputusan** (lihat RISIKO/keputusan).

### 4. Bagaimana baris & total dirender di QuotationPDF?

`src/modules/crm/QuotationPDF.jsx` (`export default … ({ quot, items, sections, creatorProfile })` `:99`):
- **Baris item** di-map `:220-231`; **kolom TOTAL per baris** `:225` = `Rp {rpN(r.total)}`. ← ini yang jadi **"(if any)"** untuk baris ber-flag.
- **Section Total** `:234` = `Rp {rpN(sec.total)}` (nilai `sec.total` datang dari `QuotationDetailPage` `sections`, lihat Q3-detail).
- **Total keseluruhan** `:112-119`: `subtotal = quot.subtotal ?? items.reduce((s,r)=>s+r.total,0)` (`:113-114`), `grandTotal = quot.total_amount ?? …` (`:119`), dicetak `:244/:258-260`. **Lebih utamakan nilai tersimpan** (`quot.subtotal`/`quot.total_amount`) → benar setelah form menyimpan total yang sudah exclude. **Fallback `:113`** masih Σ semua `r.total` → perlu exclude juga (jaga-jaga bila stored null).

### 5. Kolom baru + perubahan RPC untuk simpan flag permanen?

- **Kolom baru:** `quotation_items.if_any` tipe **`boolean DEFAULT false NOT NULL`**.
- **RPC `save_quotation`** (`supabase/schema_snapshot.sql:800`) **WAJIB diubah** untuk jalur EDIT. RPC menghapus lalu re-insert item dgn **daftar kolom eksplisit**:
  ```
  INSERT INTO public.quotation_items (
    quotation_id, sort_order, description, qty, unit, unit_price, notes,
    group_name, currency, unit_label, exchange_rate, total, cost_price
  )
  SELECT p_quotation_id, …, NULLIF(it->>'cost_price','')::numeric
  FROM jsonb_array_elements(p_items) AS it;
  ```
  Karena kolomnya eksplisit, `if_any` **tidak** akan tersimpan lewat EDIT kecuali RPC ditambah `if_any` di daftar kolom + SELECT. (Jalur CREATE insert langsung dari FE, jadi cukup tambah `if_any` di `baseItemRows()`.)

### 6. Ada section charges lain (DESTINATION/FREIGHT/dll)? Pakai komponen sama?

Ya — semua section pakai **komponen `SectionCard` yang sama** (`:167`, dipakai `:1143` di-map atas `sections`). Section default `freshSection('ORIGIN CHARGES')` (`:114`), user bisa tambah section (nama bebas). Baris di section mana pun struktur & render-nya identik. ⇒ Fitur "If Any" **otomatis berlaku ke semua section** begitu `freshRow`/render/perhitungan diubah — tidak perlu penanganan per-section. Section-total tiap section (`:307` inline, `:626` useMemo) sama-sama harus exclude (satu perubahan berlaku semua section).

### 7. Tempat lain yang baca total quotation & bisa terpengaruh?

| Pembaca | Sumber | Terpengaruh? |
|---|---|---|
| **QuotationListPage** `:241` | `q.total_amount` **tersimpan** (`:108`) | ❌ aman — total_amount sudah exclude setelah form fix |
| **DealDetailPage** `:540-541,673,697` | `q.total_amount` **tersimpan** (`:425`) | ❌ aman — pakai nilai tersimpan |
| **QuotationDetailPage** `:225,229` | **HITUNG ULANG** dari items | ✅ WAJIB fix (exclude if_any di `sections.total :225` + `subtotal :229`, plus `totalCost :236`) |
| **QuotationPDF** `:113,225,234` | prefer tersimpan, fallback hitung | ✅ fix per-baris "(if any)" `:225` + fallback `:113` (`sec.total` ikut dari DetailPage) |

Jadi pembaca yang pakai **`total_amount` tersimpan** aman otomatis; yang **menghitung ulang dari items** (DetailPage & PDF-fallback) wajib di-exclude, kalau tidak → detail/PDF beda dari list.

---

## RENCANA PERUBAHAN

### (a) SQL — kolom baru + ganti RPC (JANGAN eksekusi; tulis saja)

```sql
-- 1) Kolom flag permanen
ALTER TABLE public.quotation_items
  ADD COLUMN if_any boolean NOT NULL DEFAULT false;
```

```sql
-- 2) save_quotation: tambah if_any di INSERT item (bagian yang berubah).
--    CREATE OR REPLACE seluruh fungsi save_quotation, dengan blok INSERT item
--    diubah HANYA menambah kolom if_any (kolom lain & bagian UPDATE header TETAP):
--
--    INSERT INTO public.quotation_items (
--      quotation_id, sort_order, description, qty, unit, unit_price, notes,
--      group_name, currency, unit_label, exchange_rate, total, cost_price,
--      if_any                                              -- << TAMBAH
--    )
--    SELECT p_quotation_id,
--      COALESCE(NULLIF(it->>'sort_order','')::int, 0),
--      it->>'description',
--      NULLIF(it->>'qty','')::numeric,
--      it->>'unit',
--      NULLIF(it->>'unit_price','')::numeric,
--      it->>'notes',
--      it->>'group_name',
--      it->>'currency',
--      it->>'unit_label',
--      NULLIF(it->>'exchange_rate','')::numeric,
--      NULLIF(it->>'total','')::numeric,
--      NULLIF(it->>'cost_price','')::numeric,
--      COALESCE((it->>'if_any')::boolean, false)           -- << TAMBAH
--    FROM jsonb_array_elements(p_items) AS it;
```
> Ambil definisi lengkap `save_quotation` dari `schema_snapshot.sql:800` dan reproduksi utuh dgn 2 baris tambahan di atas. Setelah dijalankan, **refresh `schema_snapshot.sql`** (pg_dump).

### (b) Frontend — form (checkbox + exclude dari total)

`src/modules/crm/QuotationFormPage.jsx`:
1. `freshRow()` (`:102-112`) → +`if_any: false`.
2. **Checkbox "If Any"** per baris — tambah 1 kolom/checkbox di render baris (`:223-299`, mis. sebelum kolom hapus `:290`), `checked={row.if_any}` → `onUpdateRow(section.id, row.id, 'if_any', e.target.checked)`. Tambah header kolomnya (`:210-220`).
3. **Exclude di section-total (2 titik):**
   - Inline `:307` → `section.rows.reduce((s, r) => s + (r.if_any ? 0 : (Number(r.total) || 0)), 0)`.
   - `sectionTotals :629` → `sec.rows.reduce((s, r) => s + (r.if_any ? 0 : (Number(r.total) || 0)), 0)`.
   - subtotal/tax/grandTotal (`:632-636`) otomatis ikut.
4. `totalCost` (`:639-648`) → **(keputusan)** exclude if_any juga agar margin konsisten (`… + (row.if_any ? 0 : round(cost×qty×kurs))`).
5. `baseItemRows()` (`:670-682`) → +`if_any: !!row.if_any`.
6. **Load** (select + map): edit `:454`/`:466-471` dan duplicate `:527`/`:539-544` → tambah `if_any` di `.select(...)` dan map row `if_any: !!row.if_any`.
7. Row `total` per-baris (`calcRowTotal`, kolom `:282-289`) **TIDAK diubah** — baris if_any tetap menyimpan/menampilkan total aslinya (exclusion hanya di agregasi; un-check di masa depan langsung ikut terhitung lagi).

### (c) PDF + Detail

`src/modules/crm/QuotationDetailPage.jsx`:
1. select `:181` → +`if_any`.
2. `sections.total :225` → exclude `if_any`.
3. `subtotal :229` → exclude `if_any`; `totalCost :236` → (keputusan) exclude.
4. Render section on-screen (`:400-472`) — konsisten dgn sec.total baru.

`src/modules/crm/QuotationPDF.jsx`:
1. Kolom total baris `:225` → `{r.if_any ? '(if any)' : 'Rp ' + rpN(r.total)}` (baris tetap tampil dgn `unit_price` `:222`).
2. Fallback subtotal `:113` → `items.reduce((s,r)=>s+(r.if_any?0:(Number(r.total)||0)),0)` (jaga bila `quot.subtotal` null).
3. `sec.total :234` sudah benar (dari DetailPage yg sudah exclude).

---

## RISIKO

| Risiko | Severity | Catatan |
|---|---|---|
| **Section-total di 3 tempat berbeda** (`Form:307`, `Form:626`, `Detail:225`) — kalau salah satu lupa exclude → total form ≠ detail ≠ tersimpan | **TINGGI** | Wajib ubah ketiganya. Ini akar kesalahan paling mungkin. |
| **Fallback PDF `:113`** kalau `quot.subtotal` null (quote lama) → include if_any | SEDANG | Fix fallback; quote baru pakai stored (aman). |
| **Margin/`totalCost` inkonsisten** bila subtotal exclude if_any tapi cost tidak → margin% salah (`Form:650-651`, `Detail:236,453`) | SEDANG | Keputusan: exclude if_any dari cost juga (rekomendasi). |
| **RPC EDIT tak simpan if_any** kalau lupa ubah `save_quotation` → flag hilang tiap kali quote di-edit (CREATE tetap simpan) | SEDANG | Kolom eksplisit di RPC → wajib tambah `if_any`. |
| **Tampilan total baris di FORM** untuk if_any: angka atau "(if any)"? User hanya spesifik utk PDF | RENDAH | Keputusan: form tetap angka (referensi operator); PDF "(if any)". |
| Quote lama (`if_any` NULL/false default) | RENDAH | Default false → perilaku lama tak berubah. |
| Tabel `quotation_items` tanpa CHECK/enum → penambahan boolean aman | — | Tidak ada constraint yang menghalangi. |

**Keputusan yang perlu dikonfirmasi sebelum eksekusi:** (1) exclude if_any dari `totalCost`/margin? (rekomendasi: ya) · (2) di FORM, kolom Total IDR baris if_any tampil angka atau "(if any)"? (rekomendasi: angka di form, "(if any)" hanya di PDF).

---

*Audit selesai. Tidak ada file kode/DB yang diubah. Hanya AUDIT.md ini yang ditulis.*
