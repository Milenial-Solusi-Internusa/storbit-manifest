# ZERO INPUT AUDIT — nilai default "0" tak hilang saat mengetik

> Investigasi read-only. Masalah: field angka berisi `0`; user ketik `5` → jadi `50`/`05`, bukan `5`. Memetakan FAKTA (di mana + kenapa), bukan memperbaiki.
> Lingkup mengikuti `docs/Governance/15_INPUT_CONTROL_AUDIT.md` (field yang sama dgn isu scroll).
> **⚠️ Tidak menjalankan app.** Murni baca kode. **Reproduksi perilaku ("05" vs "50") WAJIB diverifikasi runtime** — hasilnya bergantung posisi caret & browser (lihat Bagian 4).

---

## BAGIAN 1 — Diagnosa sebab

### Sebab utama: **(a) UX — tak ada select-on-focus**, dengan **(b) handling** sebagai faktor penguat

Mekanismenya seragam di semua field bermasalah:

1. **State menyimpan angka `0` (number)** → `value={x}` pada controlled `type="number"` **selalu me-render string `"0"`** (bukan `""`). Contoh default: `InputSPPage.jsx:73` `freshItem()` → `qty: 1, unitPrice: 0, shippingPrice: 0`; `App.jsx:4518` → `dppPPN: 0, pph: 0, payment: 0`; `SalesOrderDetailPage.jsx:232` → `qty: item.qty ?? 0`, `shippingPrice: item.shippingPrice ?? 0`.
2. **Tak ada `onFocus` yang `select()`** → saat field di-fokus, "0" tetap ada dan **caret cuma nangkring di sebelahnya**.
3. Digit yang diketik **menyatu** dengan "0" → hasil `"05"` (caret di belakang 0) atau `"50"` (caret di depan 0).
4. **`onChange` mentah** (`e.target.value` diteruskan apa adanya, tanpa strip leading-zero) → string gabungan itu tersimpan & ter-render lagi.

**Jadi:** sebab dominan = **(a)**. Kalau `select()` ada, ketikan otomatis menimpa "0" dan masalah hilang — terbukti di QuotationFormPage (Bagian 4). **(b)** memperparah/menentukan gejalanya:
- `value` tak pernah `""` (karena default number `0`, bukan `''`) → **selalu ada "0" untuk dilawan**.
- `onChange` mentah → `"05"`/`"50"` tersimpan utuh.
- **Pengecualian menarik:** `App.jsx:3877` (Shipped QTY) onChange-nya `Number(v)` → `"05"` ter-normalisasi jadi `5` (gejala **ter-mask** bila caret di belakang), **tapi `"50"` tetap jadi `50`** (caret di depan) → tetap salah. Ini kenapa user melihat **dua gejala berbeda**.

### Klasifikasi per field

| Kelompok | Sebab | Field |
|---|---|---|
| **RUSAK** — render "0", tanpa select, tanpa strip | **(a) + (b)** | InputSP shippingPrice · SODetail qty & shippingPrice · App shippedQty, dppPPN, pph, payment |
| **RUSAK sebagian** — default `1` (bukan 0), mekanisme identik | **(a)** | InputSP qty (gejala: "1" → "15") |
| **RUSAK sebagian** — punya select, tanpa strip | **(b) ringan** | Quotation discount_pct |
| **AMAN** — default `''`, "0" cuma `placeholder` | — | PRF (semua), Inquiry weight/volume, Quotation container_qty, SODetail slaDays |
| **AMAN** — sudah select + strip | — | Quotation cost_price, exchange_rate, unit_price, qty |
| **N/A** — `readOnly` | — | InputSP unitPrice (787), SODetail unitPrice (407) |

---

## BAGIAN 2 — Inventaris field bermasalah

| file:line | Field | Default | Simpan | onFocus select? | onChange strip? | Sebab |
|---|---|---|---|---|---|---|
| `InputSPPage.jsx:797` | shippingPrice | **0** | number→string | ❌ | ❌ | **(a)+(b)** RUSAK |
| `InputSPPage.jsx:746` | item qty | 1 | number→string | ❌ | ❌ | **(a)** sebagian |
| `SalesOrderDetailPage.jsx:367` | qty (EditItemModal) | **0** (`?? 0`) | number→string | ❌ | ❌ | **(a)+(b)** RUSAK |
| `SalesOrderDetailPage.jsx:415` | shippingPrice | **0** (`?? 0`) | number→string | ❌ | ❌ | **(a)+(b)** RUSAK |
| `App.jsx:3877` | Shipped QTY (ShipmentModal) | **0** | number (`Number(v)`) | ❌ | ❌ (tapi `Number()`) | **(a)** — "05" ter-mask, "50" tetap salah |
| `App.jsx:4605` | dppPPN (BTB) | **0** | number→string | ❌ | ❌ | **(a)+(b)** RUSAK |
| `App.jsx:4607` | pph (BTB) | **0** | number→string | ❌ | ❌ | **(a)+(b)** RUSAK |
| `App.jsx:4612` | payment (BTB) | **0** | number→string | ❌ | ❌ | **(a)+(b)** RUSAK |
| `QuotationFormPage.jsx:931` | discount_pct | **0** | number→string | ✅ (934) | ❌ | **(b)** ringan — select menutupi |

**Total: 7 RUSAK penuh + 2 sebagian.** Sama persis dengan populasi field RAWAN di `15_INPUT_CONTROL_AUDIT.md` (isu scroll), **dikurangi** yang kini `readOnly` (unitPrice Edit Item) & Quotation yang sudah benar.

**AMAN (tak perlu disentuh):** PRF `:542,629,640-643,651-654,672,700` · Inquiry `:438,444` · Quotation `container_qty:1049` · SODetail `slaDays:390` — semua default `''`, "0"-nya cuma `placeholder`.

---

## BAGIAN 3 — Rekomendasi pendekatan fix (TIDAK dieksekusi)

### Pola yang ditiru: **QuotationFormPage** (satu-satunya yang sudah benar)

Belt-and-braces di tiap call site:
```jsx
onFocus={(e) => e.target.select()}                                  // :248,262,272,287,934,1051
onChange={(e) => ...(e.target.value.replace(/^0+(?=\d)/, ''))}      // :249,263,273,288,1052
```
Pola kedua yang juga terbukti: **default `''` + `placeholder="0"`** (PRF/Inquiry) — paling bersih karena "0" tak pernah jadi *value*, tapi mengubah bentuk state (number→string) & menyentuh parsing/kalkulasi → **lebih berisiko**, tidak direkomendasikan untuk fix cepat.

### Rekomendasi: **HYBRID** — handler `selectOnFocus` type-guarded di wrapper + per-titik untuk inline

Persis pola fix scroll (TD-71) yang sudah terbukti:
```js
const selectOnFocus = (e) => { if (e.currentTarget.type === 'number') e.currentTarget.select(); };
```
Type-guard **wajib** supaya field text/date yang lewat wrapper yang sama tak berubah perilaku.

**⚠️ Kendala penting (temuan agen — memengaruhi cara pasang):**

| Wrapper | file:line | Bisa terima `onFocus` dari caller? | Konsekuensi |
|---|---|---|---|
| `inp()` | `InputSPPage.jsx:323` & `:614` (2 definisi) | **TIDAK** — `{...props}` di-spread **duluan**, lalu `onFocus` di-hardcode → onFocus caller **ditimpa diam-diam** | **Harus edit definisi `inp()`** (gabungkan select + styling border yang sudah ada). Cover qty(746) + shippingPrice(797) |
| `Input` | `App.jsx:3814` | **TIDAK** — props di-destructure (tanpa spread) | **Harus edit komponen `Input`**. Cover Shipped QTY(3877) |
| `ModalInp` | `SalesOrderDetailPage.jsx:196` | **BISA** (`{...rest}`) | Edit wrapper (lebih konsisten) atau kirim per-call. Cover qty(367) |
| `cellInp`/`inpStyle` | QuotationFormPage | — (style factory, bukan komponen) | tak relevan (Quotation sudah benar) |

**Titik inline (harus per-titik):** SODetail shippingPrice(415) · App BTB dppPPN(4605), pph(4607), payment(4612).

**Cakupan minimum:** 3 wrapper (`inp()` ×2 definisi, `Input`, `ModalInp`) + 4 titik inline → menutup 7 RUSAK + qty InputSP. Murni FE, **tanpa DB**.

**Opsional (paritas dgn Quotation):** tambahkan juga strip `.replace(/^0+(?=\d)/,'')` di onChange. Catatan: `select()` saja **sudah cukup** untuk kasus normal (dibuktikan discount_pct yang select-only), dan strip menuntut menyentuh tiap `onChange` (lebih invasif; untuk `App.jsx:3877` yang sudah `Number(v)`, strip redundan).

---

## BAGIAN 4 — Ambiguitas / perlu keputusanmu

1. **Cakupan** — perbaiki hanya **7 RUSAK penuh**, atau ikut sertakan **InputSP qty(746)** (default `1`, mekanisme identik, gejala "1"→"15") dan **discount_pct(931)** (sudah select, tinggal strip)? Rekomendasiku: ikutkan qty(746); discount_pct opsional.
2. **select-only vs select + strip** — cukup `onFocus select()` (minimal, meniru discount_pct yang sudah jalan), atau belt-and-braces seperti Quotation (select + strip)? Strip = sentuh tiap `onChange`.
3. **Edit wrapper `inp()` & `Input`** — keduanya **tak bisa** menerima `onFocus` dari caller, jadi fix **wajib** mengubah definisi wrapper-nya. `inp()` sudah meng-hardcode `onFocus` untuk styling border → select harus **digabung**, bukan menimpa. Konfirmasi boleh menyentuh wrapper ini.
4. **`Input` (App.jsx) dipakai 14 field date/text lain** — dengan type-guard, perilaku mereka tak berubah, tapi wrapper-nya tetap tersentuh. Sama seperti keputusan di fix scroll. Konfirmasi.
5. **Fix akar yang lebih dalam** (default `0` → `''` + `placeholder="0"`, pola PRF) — **tidak** kurekomendasikan sekarang (ubah bentuk state number→string, menyentuh kalkulasi `subtotal = qty × unitPrice` dll). Kalau kamu mau ini, itu task terpisah + perlu tes kalkulasi.
6. **Belum ada TD** — isu ini **tak tercatat** di `08_TECH_DEBT.md` (kerabat TD-71 scroll, populasi field sama). **Kandidat TD baru.**

### ⚠️ Perlu verifikasi runtime (tak bisa dipastikan dari kode)

- **Gejala persis "05" vs "50"** bergantung **posisi caret** (klik di depan/belakang "0") dan perilaku browser (tab-focus umumnya select-all otomatis; klik menaruh caret di titik klik). Perlu reproduksi manual per field.
- **`App.jsx:3877` (Shipped QTY)** — `Number(v)` diduga **me-mask** gejala saat caret di belakang ("05"→5) tapi tidak saat di depan ("50"→50). **Konfirmasi runtime** apakah user benar-benar melihat masalah di field ini.
- Apakah `type="number"` di browser target menormalkan `"05"` di level DOM sebelum `onChange` — memengaruhi apakah strip masih perlu.

---

## Catatan Wajib

Audit ini **tidak menjalankan app**. Semua dari pembacaan kode (`src/`). Klaim perilaku runtime — terutama gejala "05" vs "50" dan efek mask `Number(v)` di Shipped QTY — **belum diverifikasi dengan menjalankan aplikasi** dan ditandai eksplisit di Bagian 4. Nomor baris per working tree saat audit (branch `fix/lock-price-edit-item`).
