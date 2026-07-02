# AUDIT: Alur Harga Produk (Master → Transaksi) — Kesiapan Bulk Update Semester 2

> Auditor mode. **Read-only** — tidak ada file kode/DB yang diubah; hanya dokumen ini yang ditulis.
> Dokumen ini **menggantikan** isi AUDIT.md sebelumnya (audit menu/routing 24 Jun 2026) yang tidak terkait topik ini.
> Konteks: bulk update `products.default_price` (harga semester 1 → semester 2) direncanakan **besok**.
> Semua klaim disertai bukti `file:line`. Sumber utama: `supabase/schema_snapshot.sql`, `src/lib/spCalc.js`, `src/lib/db.js`, `src/modules/logistics/*`, `src/modules/admin/pages/*`.

---

## RINGKASAN EKSEKUTIF

**Pertanyaan inti: "Apakah order semester 1 akan TETAP pakai harga semester 1 setelah bulk update besok?"**

# ✅ YA — TETAP (aman, tidak akan salah tagih order lama).

**Alasan singkat (berbasis kode):**
1. `sp_items` **punya kolom harga sendiri**: `unit_price numeric(18,2)` (`supabase/schema_snapshot.sql:3667`) + `shipping_price` (`:3668`). Harga **disimpan di baris SP**, bukan dibaca live dari produk.
2. Harga di-snapshot saat SP dibuat (`src/modules/logistics/InputSPPage.jsx:181` → `src/lib/db.js:77`) dan dibaca balik dari kolom tersimpan (`src/lib/db.js:36`).
3. **Semua** perhitungan/tampilan harga SP memakai `item.unitPrice` (tersimpan) via `src/lib/spCalc.js:17-19` dan `src/modules/logistics/SalesOrderDetailPage.jsx:211,237`. **Nol** jalur SP/picking/surat jalan membaca `products.default_price` (hasil sweep).
4. Picking (`picking_list_items`) dan Surat Jalan (`delivery_note_items`) **tidak punya kolom harga sama sekali** → mustahil ikut berubah.
5. Tidak ada trigger sinkronisasi `sp_items.unit_price` ← `default_price` (satu-satunya trigger sp_items = `trg_sp_items_updated_at`, `schema:6557`).

**Konsekuensi:** bulk update hanya menyentuh `products.default_price`. Baris SP/dokumen semester 1 memakai `unit_price` yang sudah dibekukan → **tidak berubah**.

**Peringatan (tidak membatalkan jawaban di atas):** risiko nyata bergeser ke **SP BARU pasca-bulk-update** — form Input SP **tidak** mem-prefill harga dari master (harga diketik manual), jadi ini risiko human-error operator, bukan cacat arsitektur. Lihat bagian RISIKO (R2).

---

## TEMUAN PER PERTANYAAN

### 1. STRUKTUR `sp_items` — punya kolom harga sendiri?

**YA. Ada kolom harga tersimpan per baris.**

- `supabase/schema_snapshot.sql:3667` → `unit_price numeric(18,2) DEFAULT 0 NOT NULL`
- `supabase/schema_snapshot.sql:3668` → `shipping_price numeric(18,2) DEFAULT 0 NOT NULL`
- `supabase/schema_snapshot.sql:3689` → `product_id uuid` (nullable; hasil backfill Fase 0.2) — link ke master **ADA, tapi TIDAK dipakai untuk menentukan harga**.
- Mapping app: `src/lib/db.js:36` `unitPrice: Number(row.unit_price ?? 0)` (baca kolom); `src/lib/db.js:77` `unit_price: Number(item.unitPrice) || 0` (tulis kolom).

Kesimpulan: harga **disimpan di baris SP saat baris dibuat**, bukan live dari `products.default_price`.

### 2. SNAPSHOT vs LIVE (Input SP + RPC picking/delivery)

**Snapshot di baris. Tidak ada perhitungan live dari `default_price`.**

**a) Saat SP dibuat (Input SP):**
- Kolom produk di form = **teks bebas** `productName`, bukan picker bertaut master: `src/modules/logistics/InputSPPage.jsx:65` (`productName: ''`), `:642-644` (input teks).
- `unitPrice` = **input angka manual** (`InputSPPage.jsx:674-675`), default `0` (`:68`), dikirim apa adanya: `InputSPPage.jsx:181`.
- `InputSPPage.jsx` **tidak membaca `default_price` sama sekali** (tidak muncul di sweep `default_price`). → harga di-snapshot dari input manual, tidak ditarik dari master.

**b) `generate_picking_from_sp`:**
- INSERT `picking_list_items` di `supabase/schema_snapshot.sql:353` — kolom `(picking_list_id, sp_item_id, product_id, product_name, sku, qty_requested, qty_short, location_detail)`. **Tanpa kolom harga.**
- Tabel `picking_list_items` (`schema:3091`) memang **tidak punya kolom harga**.

**c) `generate_delivery_from_picking`:**
- INSERT `delivery_note_items` di `supabase/schema_snapshot.sql:300` — `SELECT ... pli.product_name, pli.sku, pli.qty_picked`. **Hanya nama/sku/qty.**
- Tabel `delivery_note_items` (`schema:2209`) **tanpa kolom harga**; header `delivery_notes` hanya `total_koli`/`total_weight` (bukan uang).

**d) Total SP:** `src/lib/spCalc.js:17-19` → `unitPrice = Number(item.unitPrice); subtotal = unitPrice * qty` — sumber = **kolom tersimpan**.

### 3. TITIK BACA HARGA (SP detail / picking / SJ / PDF)

**Semua baca dari kolom tersimpan. Tidak ada jalur transaksi yang baca `default_price` live.**

- `src/lib/spCalc.js:17` — `Number(item.unitPrice)` (tersimpan) → subtotal/ppn/grandTotal (`:19-22`).
- `src/modules/logistics/SalesOrderDetailPage.jsx:24` import `calcItem`; `:211` `unitPrice: item.unitPrice ?? 0`; `:237` `subtotal = Number(draft.qty) * Number(draft.unitPrice)`; `:373-375,492` tampilkan Subtotal/Grand Total dari nilai tersimpan; `:358` bahkan **mengizinkan edit `unitPrice`** per item (tetap disimpan ke baris).
- **Sweep konfirmasi:** `grep default_price` yang menyentuh `sp_`/`picking`/`delivery`/`ar_`/`surat`/`shipment`/`ttf`/`btb` = **NONE**.

**Pembacaan `default_price` live yang ADA — tapi BUKAN jalur penagihan SP (demi kejujuran):**
- `src/modules/inventory/pages/InventoryDashboardPage.jsx:515` `cost: Number(row.products?.default_price) || 0` — **dashboard valuasi stok** (nilai kini). Akan naik ke harga semester 2 — **itu perilaku benar** untuk dashboard nilai-kini, bukan penagihan.
- `src/modules/crm/QuotationFormPage.jsx:234` `const price = Number(p.default_price) || 0` — **prefill baris Quotation** saat pilih produk, lalu **di-snapshot** ke `quotation_items.unit_price`. Quotation lama simpan harganya sendiri (tak berubah); quotation baru prefill harga semester 2 (benar). Modul CRM pra-order, terpisah dari SP.

### 4. DAMPAK BULK UPDATE besok

**Jawaban tegas: SP/dokumen semester 1 yang SUDAH ADA → TETAP (tidak ikut berubah).**

Dasar kode:
- Harga hidup di `sp_items.unit_price` (`schema:3667`), dibekukan saat baris dibuat (`db.js:77`).
- Semua pembacaan memakai kolom tersimpan (`spCalc.js:17`, `SalesOrderDetailPage.jsx:211/237`); **nol** pembacaan `default_price` di jalur SP/picking/SJ/AR.
- Bulk update (`src/modules/admin/pages/BulkEditPricePage.jsx:139` → `supabase.rpc('bulk_update_product_prices', …)`) menyasar `products.default_price`. Tak ada trigger yang mempropagasi ke `sp_items` (trigger sp_items satu-satunya = `set_updated_at`, `schema:6557`).
- ⇒ Baris SP lama tak tersentuh. **Tidak ada salah tagih** akibat bulk update terhadap order yang sudah ada.

> **Caveat verifikasi (R4):** body `bulk_update_product_prices` **belum ada** di `schema_snapshot.sql` (RPC ini belum masuk snapshot; `product_price_history`/`product_warehouse_location`/`attach_price_contract_info` sudah masuk). Aku **tidak bisa membaca body-nya**. Berdasarkan nama, pemanggilan FE, dan tak adanya trigger sinkron, RPC ini **seharusnya** hanya UPDATE `products.default_price`. **Konfirmasi body-nya** (pastikan tak menyentuh `sp_items`) sebelum eksekusi.

### 5. `product_price_history` — pemilihan harga by-date atau murni audit?

**Murni audit. TIDAK tersambung ke logika penagihan/tampilan mana pun.**

- Tabel `supabase/schema_snapshot.sql:3199-3212` — kolom `old_price, new_price, changed_by, changed_at, reason, source, contract_no, valid_from, valid_until`. Kolom pemilihan-by-date (`valid_from`/`valid_until`) **ada** (`:3210-3211`).
- Titik pakai di `src/`:
  - `src/modules/admin/pages/ProductDetailPage.jsx:676` & `:812` — **baca** riwayat untuk **ditampilkan** (section "Riwayat Harga") + refetch. Read-only.
  - `src/modules/admin/pages/BulkEditPricePage.jsx:139` — **tulis** (via RPC bulk).
  - `attach_price_contract_info` (`schema:75`) — **tulis** contract_no/valid_from/valid_until ke baris riwayat.
- **Tidak ada** kode yang mencocokkan tanggal order ke `valid_from`/`valid_until` untuk memilih harga. Semua hit `valid_until` lain milik `user_roles`, `quotations`, `rate_sheets`, `currencies` — tak terkait harga produk.

Kesimpulan: `product_price_history` = **catatan audit + info kontrak**, belum jadi sumber kebenaran harga transaksi.

### 6. KESIAPAN INVOICE BY-DATE

**Belum ada sama sekali.**

- **Tidak ada tabel `invoices`/`invoice`** (`grep CREATE TABLE public.invoices*` = NONE). Penagihan saat ini = flag `sp_items.inv`/`fp` + tabel `ar_ttfs`/`ar_btbs` (`schema:1349`/`1305`) yang **tidak menyimpan harga/amount** (grep price/amount/total di kedua tabel = kosong).
- **Tidak ada** logika yang memetakan `sp_date` → `product_price_history.valid_from/valid_until`.
- Building block **ada tapi belum dirangkai**: (a) `product_price_history.valid_from/valid_until` (`schema:3210-3211`), (b) `sp_items.product_id` backfilled (`schema:3689`). Belum dipakai bersama untuk penentuan harga.
- **Namun:** untuk kebutuhan bisnis yang dinyatakan (order semester-1 tetap harga semester-1), invoice-by-date **tidak diperlukan** — karena harga sudah di-snapshot di `sp_items.unit_price`. By-date hanya perlu jika ingin **menurunkan ulang** harga dari master saat menagih (justru berisiko).

---

## RISIKO (jika bulk update dijalankan besok, arsitektur saat ini)

| ID | Risiko | Severity | Dasar |
|----|--------|----------|-------|
| R1 | **Order semester-1 yang sudah ada salah tagih akibat bulk update** | **TIDAK ADA (mitigated by design)** | Harga di-snapshot di `sp_items.unit_price` (`schema:3667`); semua baca kolom tersimpan (`spCalc.js:17`); nol baca `default_price` di jalur SP. |
| R2 | **SP BARU pasca-bulk-update memakai harga salah** (operator ketik harga semester-1 lama karena kebiasaan/copas) | **MEDIUM** | Input SP tak mem-prefill dari master; `productName` teks bebas + `unitPrice` manual (`InputSPPage.jsx:65,181,674`). Tak ada pagar bahwa harga = semester 2. Risiko proses. |
| R3 | **Dashboard valuasi stok melonjak ke harga semester 2** | **LOW / informational** | `InventoryDashboardPage.jsx:515` baca `default_price` live. Benar untuk nilai-kini; bukan bug penagihan. |
| R4 | **Body `bulk_update_product_prices` tak terverifikasi** (tak ada di snapshot) → belum 100% pasti hanya menyentuh `products.default_price` | **LOW** | RPC belum masuk `schema_snapshot.sql`. Tak ada bukti menyentuh `sp_items` (tak ada trigger sinkron), tapi body tak terbaca. Konfirmasi sebelum run. |
| R5 | **Snapshot DB parsial/stale** (governance) | **LOW** | `bulk_update_product_prices` belum masuk snapshot → sumber kebenaran DB tak lengkap. Refresh `pg_dump` sebelum merge. |
| R6 | **`unit_price` SP bisa diedit manual pasca-buat** | **LOW** | `SalesOrderDetailPage.jsx:358` mengizinkan edit harga baris SP. Fitur koreksi, bukan efek bulk update — tapi berarti tak ada penguncian harga historis (siapa pun berakses bisa mengubah harga order lama manual). |

**Verdict risiko:** bulk update besok **AMAN** untuk order yang sudah ada (R1 non-isu). Perhatian nyata = **R2** (disiplin input SP baru) + kebersihan governance (R4/R5).

---

## OPSI SOLUSI

Kebutuhan: order semester-1 tetap harga semester-1. Arsitektur **sudah** memenuhinya. Perbandingan dua pendekatan:

### Opsi A — Snapshot harga di SP (SUDAH BERJALAN sekarang)
- **Cara kerja:** harga dibekukan di `sp_items.unit_price` saat SP dibuat; semua penagihan baca kolom itu.
- **Status:** **sudah terimplementasi** (`schema:3667`, `db.js:77`, `spCalc.js:17`).
- **Dampak ke kode existing untuk kebutuhan ini:** **NOL** — tak perlu ubah apa pun agar order lama aman.
- **Kelebihan:** sederhana, deterministik, tahan terhadap perubahan master; sudah teruji dipakai import produksi.
- **Kekurangan:** SP baru tak otomatis dapat harga master terbaru (harus diketik) → R2.
- **Penguatan opsional (kecil, tetap snapshot):** tambahkan **prefill** `unit_price` dari `default_price` saat memilih produk di Input SP (ubah field produk jadi picker ber-`product_id`, isi harga otomatis, **tetap boleh diedit & tetap disimpan ke baris**). Menutup R2 tanpa mengubah semantik snapshot. Perubahan terbatas di `InputSPPage.jsx`.

### Opsi B — Pemilihan harga by-date (belum ada; bangun dari nol)
- **Cara kerja:** harga TIDAK dibekukan di SP; saat menagih, harga diturunkan dengan mencocokkan `sp_date` ke `product_price_history.valid_from/valid_until` (join via `sp_items.product_id`).
- **Status:** **belum ada** (Temuan 5 & 6). Butuh: engine invoice, RPC pemilihan harga, jaminan tiap periode punya baris `valid_from/until` bersambung tanpa celah/overlap, penanganan produk tanpa riwayat.
- **Dampak ke kode existing:** **BESAR** — memindah sumber kebenaran harga dari kolom SP ke tabel riwayat; menyentuh `spCalc`, SP detail, seluruh tampilan/total, plus integritas data kontrak (gap/overlap tanggal = salah-tagih baru).
- **Kelebihan:** satu sumber harga terpusat, audit kontrak kuat, bisa koreksi retroaktif per periode.
- **Kekurangan:** kompleks, rawan bug tanggal, **menciptakan** risiko salah-tagih yang sekarang tidak ada, dan **tidak diperlukan** untuk tujuan yang dinyatakan.

### REKOMENDASI
1. **Pakai Opsi A (andalkan snapshot yang sudah ada).** Untuk "order semester-1 tetap harga semester-1", **tidak perlu perubahan kode** — bulk update besok aman terhadap order lama.
2. **Sebelum bulk update:** verifikasi body `bulk_update_product_prices` hanya UPDATE `products.default_price` (R4), lalu refresh `schema_snapshot.sql` (R5).
3. **Untuk menutup R2 (opsional, dampak kecil):** tambahkan prefill harga dari master ke Input SP (picker `product_id` → isi `unit_price`, tetap editable & tersimpan). Menjaga arsitektur snapshot, hanya menambah kenyamanan + kebenaran harga SP baru.
4. **Jangan** pindah ke Opsi B untuk kasus ini — biaya & risikonya jauh lebih besar dari manfaat, dan justru berpotensi menciptakan jalur salah-tagih yang saat ini tidak ada.

---

*Audit selesai. Tidak ada file kode/DB yang diubah. Hanya AUDIT.md ini yang ditulis.*
