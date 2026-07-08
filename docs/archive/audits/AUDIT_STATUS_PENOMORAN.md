# AUDIT — Mekanika Status SP & Penomoran SP (end-to-end)

> **Mode:** AUDIT read-only. Tidak ada file kode/DB diubah. Satu-satunya file dibuat: dokumen ini.
> **Tanggal:** 2026-07-06 · **Branch:** `feat/sp-schema`
> **Sumber DB:** `supabase/schema_snapshot.sql` (terkini). **Sumber FE:** `src/`.
> **Metode:** trace langsung + 2 sub-agent (frontend status derivation; gudang/finance wiring) — hasilnya saling mengonfirmasi.

---

## RINGKASAN EKSEKUTIF

Status SP yang tampil ke user **bukan satu status**, melainkan gabungan dua dimensi yang dihitung di frontend dari `sp_items`: **lifecycle** (`sp_status`: draft/confirmed/cancelled — diubah manual) dan **fulfillment** (Open/Partial/Closed — dihitung dari `qty` vs `shipped_qty`). **Verdict tegas kenapa "pengiriman/finance selesai tapi status tak berubah":** (1) TIDAK ADA satu pun aksi gudang (generate picking, complete picking, generate/dispatch/deliver surat jalan) yang menulis `sp_items.shipped_qty` atau status SP — semuanya hanya menggerakkan tabel gudang sendiri + `stock_ledger`; (2) `shipped_qty` **tidak bisa** dinaikkan otomatis di mana pun, dan di halaman Detail SP field-nya `readOnly` — jadi fulfillment status **mustahil bergerak dari Open** untuk SP baru kecuali di-edit manual lewat modal legacy; (3) flag finance (`inv/fp/submit/kirim`) **sama sekali tidak dipakai** dalam logika pill status — mereka hanya angka progres terpisah; (4) status 12-tahap baru (`sp_orders.status`) **tidak pernah dibaca UI dan tidak pernah digerakkan** oleh event apa pun — diam di nilai backfill/`DRAFT`. Tiga pulau (SP · gudang · finance) memang **terputus total di lapisan data**. Tombol "Manifest" pun hanya menampilkan toast tanpa menulis apa pun. **Severity keseluruhan: CRITICAL** (status menyesatkan keputusan operasional).

Penomoran: **dua skema hidup bersamaan** — InputSPPage meng-auto-generate `SP-{6-digit-timestamp}` (dual-write ke `sp_orders`), sedangkan FormModal legacy (Add New SP di menu manifest) meminta user **mengetik `sp_no` manual** (placeholder `2020577` = nomor SP asli customer) dan hanya single-write ke `sp_items`. `sp_items` **tak punya UNIQUE** pada `sp_no`, `sp_orders` punya `UNIQUE(customer_id, sp_no)`. Pengelompokan UI (`groupBySP`) memakai **`sp_no` saja sebagai kunci** → nomor manual yang kembar antar-customer bisa **tergabung** jadi satu SP di layar. SP tidak memakai `increment_document_sequence` seperti dokumen lain (SJ/PICK/Quotation/MOM/Asset).

---

## PETA STATUS (BAGIAN A)

### A1 — Semua sumber status yang tampil ke user

| # | Status | Tersimpan / Dihitung | Lokasi |
|---|--------|----------------------|--------|
| 1 | **Fulfillment per-item** (Open/Partial/Closed) | **Dihitung FE** dari `qty` vs `shipped_qty` | `src/lib/spCalc.js:23-28` (fn `calcItem`) |
| 2 | **Fulfillment per-SP** (Open/Partial/Closed) | **Dihitung FE** (agregasi item) | `src/App.jsx:200-205` (fn `groupBySP`) |
| 3 | **Lifecycle** (`sp_status`: draft/confirmed/cancelled) | **Tersimpan DB** `sp_items.sp_status` | kolom: `schema_snapshot.sql` (sp_items) · dibaca `src/lib/db.js:46` (`spFromDb`: `spStatus: row.sp_status || 'draft'`) |
| 4 | **Flag finance** (`inv/fp/submit/kirim`) | **Tersimpan DB** `sp_items.inv/fp/submit/kirim` (boolean) | dibaca `spFromDb` (`src/lib/db.js`) · ditampilkan `SalesOrderDetailPage.jsx:1092-1095` (`FinPill`) + `FIN_STAGES` (progress) |
| 5 | **Design status pill** (OPEN/CONFIRMED/MANIFEST/CLOSED/CANCELLED) | **Dihitung FE** (gabungan #2 + #3) | `SalesOrderPage.jsx:72-78` (`toDesignStatus`) · `SalesOrderDetailPage.jsx:737-745` (`headerStatus`) |
| 6 | **Status 12-tahap** (`sp_orders.status`) | **Tersimpan DB** `sp_orders.status` | **TIDAK dibaca UI di mana pun** (lihat A1-catatan) |

**Kutipan kunci #1** (`spCalc.js:23-28`):
```js
const outstandingQty = qty - shippedQty;
let status = 'Open';
if (outstandingQty === 0 && qty > 0) status = 'Closed';
else if (shippedQty > 0 && outstandingQty > 0) status = 'Partial';
```

**Kutipan #6 — `sp_orders.status` tidak pernah dibaca UI.** Grep `sp_orders` di seluruh `src/` hanya menghasilkan **satu** hit, dan itu **komentar** (`InputSPPage.jsx`: "// Validation — DC (dcId) wajib: sp_orders.dc_id NOT NULL…"). Semua read SP di `db.js` menyasar `sp_items` (`listSpItems`, `spFromDb`). → Kolom 12-tahap saat ini **write-only/mati** dari sudut pandang UI.

### A2 — Apa PERSIS yang mengubah tiap status

| Status | Pemicu perubahan | Manual/Otomatis | Bukti |
|--------|------------------|-----------------|-------|
| `sp_status` (lifecycle) | Tombol **Konfirmasi** / **Tolak** di list SP | **Manual** | `SalesOrderPage.jsx:155-169` (`AksiCell`) → `confirmModal` `:441-464` (`status = action==='confirm' ? 'confirmed' : 'cancelled'`, `:447`) → `setSpStatus` `src/lib/db.js:330-337` → RPC `set_sp_status` `schema:901-925` (UPDATE `sp_items` saja) |
| `shipped_qty` (fulfillment) | **HANYA** input manual "Shipped QTY" di **FormModal legacy** | **Manual** | `App.jsx:~4357` `<Input label="Shipped QTY" ... onChange={v=>update('shippedQty', Number(v))}/>` → `handleSave` `:2014-2026` → `saveRow` `useSpItems.js:57-100` → `updateSpItem`/`insertSpItem` `db.js`. **Di Detail SP field ini `readOnly`** → `SalesOrderDetailPage.jsx:343` `<ModalInp value={draft.shippedQty} readOnly/>` |
| `inv/fp/submit/kirim` | Toggle di FormModal legacy **dan** EditItemModal Detail | **Manual** | FormModal `App.jsx:~4393` (`<Toggle label="INV" …/>` dst.) · Detail `SalesOrderDetailPage.jsx:418-435` → `updateSpItem` (`spToDb`: `inv:!!item.inv,…`) |
| `sp_orders.status` (12-tahap) | **Tidak ada** | — | Tak ada trigger, tak ada RPC recompute (lihat A5) |

**Penting:** Tidak ada satu pun status SP yang bergerak **otomatis**. Semua mutasi status/qty/flag adalah **input manual operator**. Satu-satunya "otomatis" adalah *turunan tampilan* (pill dihitung ulang dari data manual itu).

### A3 — Precedence (gabungan jadi satu pill)

`SalesOrderPage.jsx:72-78`:
```js
// Precedence high→low: cancelled > Closed > Partial(Manifest) > confirmed > open.
function toDesignStatus(g) {
  if (g.spStatus === 'cancelled') return 'CANCELLED';
  if (g.status === 'Closed')      return 'CLOSED';
  if (g.status === 'Partial')     return 'MANIFEST';
  if (g.spStatus === 'confirmed') return 'CONFIRMED';
  return 'OPEN';
}
```
`SalesOrderDetailPage.jsx:737-745` (`headerStatus`) memakai precedence identik (palet warna beda).

**Konsekuensi precedence:** dimensi **fulfillment menimpa lifecycle** di tengah — SP yang `confirmed` tapi `status='Closed'`/`'Partial'` akan menampilkan CLOSED/MANIFEST, bukan CONFIRMED. Dan **flag finance (`inv/fp/submit/kirim`) TIDAK ADA di precedence sama sekali** → berapa pun invoice/submit/kirim selesai, pill status **tak berubah**. Ini akar langsung keluhan "finance selesai tapi status tetap".

### A4 — RANTAI PUTUS (inti keluhan) — dibuktikan tegas

**Grep pembuktian:** seluruh occurrence `shipped_qty` di `schema_snapshot.sql` = baris **406, 419, 421** (ketiganya **READ** di `generate_picking_from_sp`), plus definisi kolom (3791/3864/3874). **NOL** statement `UPDATE … shipped_qty` di seluruh DB. Sama di `src/`: `shipped_qty`/`shippedQty` hanya dibaca untuk hitung, satu-satunya **WRITE** adalah input manual FormModal.

**Aksi GUDANG — apakah mengubah status SP / shipped_qty? Semua: TIDAK.**
| Aksi | Fungsi | Yang ditulis | Sentuh SP? |
|------|--------|--------------|-----------|
| Generate Picking | `generate_picking_from_sp` `schema:391-449` | INSERT `picking_lists`/`picking_list_items` + `stock_ledger` (reserved) | **TIDAK** — `sp_items` hanya dibaca (`:401`,`:406`,`:419-421`) untuk validasi & hitung outstanding |
| Complete Picking | `completePicking` `db.js` → `UPDATE picking_lists SET status='done'` | `picking_lists` saja | **TIDAK** |
| Generate Surat Jalan | `generate_delivery_from_picking` `schema:342-389` | INSERT `delivery_notes`/`delivery_note_items` | **TIDAK** — `sp_items` hanya dibaca untuk nama customer |
| Dispatch (in_transit) | `dispatch_delivery` `schema:263-289` | `UPDATE delivery_notes SET status='in_transit'` + `stock_ledger` (unreserved+outbound) | **TIDAK** — nol sentuhan `sp_items`/`sp_orders` |
| Mark Delivered | `setDeliveryStatus('delivered')` `db.js` → `UPDATE delivery_notes SET status='delivered'` | `delivery_notes` saja | **TIDAK** |
| Cancel picking/delivery | `cancel_picking`/`cancel_delivery` `schema:197/173` | reversal `stock_ledger` + status tabelnya | **TIDAK** |

→ **Seharusnya nyambung tapi tidak:** saat `dispatch_delivery` (`schema:263-289`) atau mark-delivered mengeluarkan barang, di titik itulah `sp_items.shipped_qty` (dan idealnya `sp_orders.status`→DIKIRIM/TERKIRIM_PENUH) semestinya di-post. Tidak ada baris seperti itu.

**Aksi FINANCE — apakah mengubah status SP / shipped_qty? Semua: TIDAK.**
- Flag `inv/fp/submit/kirim`: hanya menulis kolom boolean-nya sendiri via `updateSpItem` (`db.js`, `spToDb`). Tidak memicu perubahan `sp_status`/`shipped_qty`/`sp_orders`.
- AR TTF / BTB: `insertTtf`/`updateTtf` (`db.js`) menulis **`ar_ttfs`/`ar_btbs` saja**. Nol `UPDATE sp_items`/`sp_orders`.
- Grep `sp_orders` di `src/` (write): **NOL** kecuali jalur dual-write InputSPPage (create). Tak ada finance/gudang yang menulis `sp_orders`.

**Bonus temuan — tombol "Manifest" palsu:** `SalesOrderPage.jsx:465-467` `handleManifest` = `showToast('Manifest ${no} dibuat ✓')` **tanpa menulis apa pun**. Komentar `:7` mengakui: "Manifest action still shows toast only (manifest state derived from qty/shipped_qty)." → user diberi umpan-balik sukses padahal tak ada perubahan data.

### A5 — Kondisi tabel baru `sp_orders.status`

- **Belum pernah digerakkan otomatis.** Tidak ada fungsi `sp_recompute_status` atau sejenis (grep `recompute` = nol). Trigger pada `sp_orders`/`sp_items` hanya `set_updated_at` (`schema:6796` sp_items; `sp_orders` hanya punya trigger updated_at). Tidak ada trigger status.
- Nilai `sp_orders.status` = hasil **backfill Fase 0** (map draft→DRAFT/confirmed→CONFIRMED/cancelled→CANCELLED, "TANPA recompute lanjut" per PROGRESS TASK 4) untuk SP lama, dan **`'DRAFT'`** untuk SP baru dari dual-write (`create_sp_order_dual` param `p_status` di-set `'DRAFT'` oleh FE — `InputSPPage.doInsert`). → Kolom 12-tahap **diam**, tak mencerminkan realita gudang/finance.

### A6 — DUAL-WRITE: dua sumber status hidup bersamaan

Ya. Sejak InputSPPage dual-write, ada **dua** representasi status per SP baru:
- `sp_items.sp_status` = `'draft'` (default insert) — **INI yang dibaca UI**.
- `sp_orders.status` = `'DRAFT'` (dari RPC) — **tidak dibaca UI**.

**Risiko desync konkret:**
1. **Konfirmasi SP** memanggil `set_sp_status` (`schema:901`) yang **hanya UPDATE `sp_items`** → `sp_items.sp_status='confirmed'` sementara `sp_orders.status` tetap `'DRAFT'`. Langsung divergen sejak aksi pertama.
2. **SP dari FormModal legacy** (Add New SP manifest) **tidak membuat baris `sp_orders` sama sekali** (single-write `sp_items`) → SP itu tak punya kembaran di skema baru. Divergensi total (ada di lama, absen di baru).
3. Semua mutasi lanjutan (shipped_qty, finance flag, cancel) hanya menyentuh `sp_items`; `sp_orders` tak pernah menyusul. → Bila kelak ada pembaca yang mempercayai `sp_orders.status`, ia akan **menyesatkan**.

---

## PETA PENOMORAN (BAGIAN B)

### B7 — Bagaimana `sp_no` digenerate sekarang
Dua jalur berbeda:
- **InputSPPage** (Input SP Baru): `src/modules/logistics/InputSPPage.jsx:218` → `const spNo = \`SP-${Date.now().toString().slice(-6)}\`;` — **client-side, otomatis**, format `SP-{6 digit terakhir epoch-ms}`. Dual-write ke `sp_orders` via RPC.
- **FormModal** (Add New SP di menu manifest/`App.jsx`): field **diketik manual** → `App.jsx:~4318` `<Input label="SP No *" value={data.spNo} onChange={v=>update('spNo',v)} placeholder="2020577"/>`, divalidasi wajib isi (`if (!data.spNo)`). Placeholder = nomor SP asli customer. **Single-write `sp_items` saja.**

→ Konfirmasi: **masih `SP-{timestamp}` untuk InputSPPage**, tapi **nomor manual** untuk FormModal. Dua konvensi hidup bersamaan.

### B8 — Constraint uniqueness `sp_no`
- **`sp_items`: TIDAK punya UNIQUE pada `sp_no`.** Hanya PK `sp_items_pkey PRIMARY KEY (id)` (`schema:5266`) dan index **non-unique** `idx_sp_items_sp_no` (`schema:6411`). → nomor SP boleh kembar tanpa halangan DB.
- **`sp_orders`: punya** `ADD CONSTRAINT sp_orders_no_unique UNIQUE (customer_id, sp_no)` (`schema:5282`).

### B9 — RPC `increment_document_sequence` & pola dokumen lain
- Fungsi ada: `increment_document_sequence(company, doc_type, dept, year, month)` (`schema:644-674`), atomik, pola nomor `{TYPE}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}`.
- **Dipakai** oleh: Surat Jalan `increment_document_sequence(…, 'SJ','WH',…)` (`schema:369`), Picking `('PICK','WH')` (`schema:410`); serta (per PROGRESS/CLAUDE) Inquiry `'INQ','CRM'`, MOM `'MOM','RPT'`, Asset `AST/…`.
- **SP TIDAK memakainya.** SP pakai timestamp/manual. Tabel `document_sequences` (`schema:2427`) + konsep `document_types` tersedia; bahkan komentar `approval_rules.document_type` menyebut `'SP'` sebagai contoh kode (`schema:1305`) — tapi itu untuk engine approval, bukan penomoran. → **Pola yang bisa ditiru sudah ada** (`SJ`/`PICK`) tinggal `increment_document_sequence(SOA,'SP','…',year)` → `SP/{ENTITY}/{DEPT}/{YYYY}/{SEQ}`.

### B10 — Konsekuensi bila `sp_no` diketik manual dari nomor SP asli customer
1. **Uniqueness `sp_items`:** tidak ada → duplikat **diterima diam-diam** (dua SP nomor sama).
2. **Pengelompokan UI merge:** `groupBySP` memakai **`sp_no` saja** sebagai kunci (`App.jsx:166` `if (!groups[r.spNo])`) — **tanpa customer**. Dua customer berbeda dengan nomor SP manual sama akan **tergabung jadi satu grup SP** di layar (item tercampur, total salah). Ini bug nyata karena nomor SP customer bisa saja bertabrakan lintas customer.
3. **Dual-write (`create_sp_order_dual`):** `sp_orders` punya `UNIQUE(customer_id, sp_no)` → duplikat **(customer, nomor)** akan memicu `unique_violation` → RPC RAISE → FE toast "gagal sinkron" **tapi `sp_items` tetap tertulis** (divergensi lama-vs-baru). Namun `create_sp_order_dual` saat ini hanya dipanggil InputSPPage (yang auto-generate), **bukan** FormModal manual — jadi jalur manual belum kena RPC ini sama sekali.
4. **Link BTB/AR via teks:** `sp_btbs.sp_no` & tautan AR memakai `sp_no` **teks bebas** (mis. `db.js:345/775/808`, `generate_picking_from_sp`/`generate_delivery_from_picking` join by `sp_no`). Nomor kembar → **tautan ambigu** (picking/DN/BTB bisa nyasar ke SP yang salah; `generate_delivery_from_picking` `SELECT … WHERE si.sp_no=v_sp_no LIMIT 1` mengambil customer sembarang bila kembar).

---

## DIAGRAM RANTAI STATUS (perjalanan 1 SP)

```
[Input SP] InputSPPage → sp_items (sp_status='draft', shipped_qty=0)
           + dual-write sp_orders (status='DRAFT')
   pill: OPEN                                            ← BERGERAK (dari input)
      │
      ▼
[Konfirmasi] tombol Konfirmasi → set_sp_status → sp_items.sp_status='confirmed'
   pill: CONFIRMED                                       ← BERGERAK (manual)
   ⚠ sp_orders.status TETAP 'DRAFT'                      ← DESYNC di sini
      │
      ▼
[GUDANG] Generate Picking → Complete → Generate SJ → Dispatch → Delivered
   sp_items.shipped_qty: TETAP 0                         ← ✗ MACET (tak ada writer)
   sp_orders.status:     TETAP 'DRAFT'                   ← ✗ MACET
   pill: masih CONFIRMED (bukan MANIFEST/CLOSED)         ← ✗ TIDAK BERGERAK
      │
      ▼
[FINANCE] toggle INV/FP/SUBMIT/KIRIM (manual) + AR TTF/BTB
   sp_status / shipped_qty / pill: TIDAK terpengaruh     ← ✗ MACET (flag di luar precedence)
      │
      ▼
[Selesai?] Untuk pindah ke CLOSED, HARUS buka FormModal legacy
           dan ketik shipped_qty = qty secara MANUAL     ← satu-satunya jalan
```
Titik BERGERAK: input, konfirmasi/tolak (manual), dan edit `shipped_qty` manual. Titik MACET: seluruh rantai gudang & finance.

---

## TITIK PUTUS TERURUT (impact desc)

1. **[CRITICAL] Gudang → `shipped_qty` tidak tersambung.** Dispatch/deliver tak menaikkan `shipped_qty` (`dispatch_delivery` `schema:263-289` nol sentuhan sp_items; grep write `shipped_qty`=0). Fulfillment (Open/Partial/Closed) tak pernah maju → status SP menyesatkan (tampil Open/Confirmed padahal barang terkirim).
2. **[CRITICAL] `shipped_qty` tak bisa diedit di Detail SP.** `SalesOrderDetailPage.jsx:343` `readOnly` → untuk SP baru, satu-satunya jalur ubah adalah FormModal legacy (menu manifest). Operator via Detail SP mentok; fulfillment praktis beku.
3. **[HIGH] Flag finance di luar precedence status.** `toDesignStatus` (`SalesOrderPage.jsx:72-78`) & `headerStatus` (`:737-745`) tak melihat `inv/fp/submit/kirim`. Finance 100% selesai → pill tetap. (Inti keluhan finance.)
4. **[HIGH] `kirim` (flag) vs `shipped_qty` (angka) — dua "terkirim" yang tak sinkron.** Operator bisa mencentang KIRIM tanpa `shipped_qty` naik (dan sebaliknya). Tak ada rekonsiliasi.
5. **[HIGH] Tombol "Manifest" palsu.** `SalesOrderPage.jsx:465-467` toast-only. Memberi kesan aksi berhasil tanpa mengubah data.
6. **[HIGH] `sp_orders.status` mati + desync dual-write.** Tak ada recompute/trigger (A5); `set_sp_status` tak menyentuh `sp_orders`; FormModal tak membuat `sp_orders`. Sumber status baru divergen sejak awal (A6).
7. **[HIGH] `groupBySP` merge lintas-customer pada `sp_no` kembar.** `App.jsx:166` kunci `sp_no` saja → nomor manual bentrok menggabungkan SP beda customer.
8. **[MEDIUM] `sp_items` tanpa UNIQUE `sp_no`.** `schema:5266/6411` → duplikat diterima diam-diam; tautan teks (BTB/AR/picking/DN) jadi ambigu.
9. **[MEDIUM] Dua skema penomoran co-exist** (auto `SP-{ts}` vs manual). Tak konsisten, menyulitkan rekonsiliasi & pencarian.

---

## OPSI ARAH PERBAIKAN (usulan — TIDAK dieksekusi)

### Status — menyambung tiga pulau (selaras `DESIGN_SP_SCHEMA.md` 12-tahap)

- **Opsi S1 — Recompute terpusat di skema BARU + jadikan `sp_orders` sumber kebenaran.** Buat RPC/trigger `sp_recompute_status(sp_order_id)` yang menyetel `sp_orders.status` 12-tahap dari fakta turunan: `sp_order_items.shipped_qty` (fulfillment), keberadaan picking/delivery (PICKING/PACKED/DIKIRIM/SAMPAI), `sp_btb` (BTB_TERBIT), dan sinyal finance (INVOICED/SUBMITTED/LUNAS). Panggil dari `dispatch_delivery`/mark-delivered (post `shipped_qty` ke `sp_order_items`), dari generate/complete picking, dan dari event finance. **Trade-off:** paling sesuai desain target, tapi menuntut FE beralih membaca `sp_orders` (saat ini nol pembaca) + migrasi tampilan. **Rekomendasi utama jangka menengah** — inilah maksud skema 12-tahap.
- **Opsi S2 — Sambungkan dulu ke skema LAMA (`sp_items`) sebagai jembatan cepat.** Tambah writer `shipped_qty` di titik dispatch/deliver (post qty DN → `sp_items.shipped_qty`), dan masukkan sinyal finance ke precedence pill. **Trade-off:** cepat memulihkan akurasi tanpa merombak pembaca UI, tapi memupuk utang di tabel lama yang akan dipensiun; harus hati-hati agar tak dobel dengan S1.
- **Opsi S3 — Status manual-saja yang jujur.** Biarkan manual tapi (a) buka `shipped_qty` agar editable di Detail SP, (b) hapus tombol Manifest palsu, (c) beri indikator jelas "status manual". **Trade-off:** paling murah, tapi tidak menyelesaikan keluhan inti (otomatisasi) — hanya mengh: mengurangi menyesatkan.
- **Wajib lintas-opsi:** hentikan desync dual-write — entah `set_sp_status` ikut mem-propagate ke `sp_orders`, atau tetapkan **satu** sumber kebenaran dan matikan yang lain. AGENTS.md: jangan biarkan dua sumber status "hidup" tanpa rekonsiliasi.

**Rekomendasi:** target **S1** (sesuai `DESIGN_SP_SCHEMA.md`), dengan **S2 sebagai jembatan sementara** hanya bila butuh perbaikan akurasi mendesak sebelum FE pindah baca `sp_orders`. Hindari S3 sebagai solusi akhir.

### Penomoran

- **Opsi N1 — Adopsi `increment_document_sequence('SP',…)`** meniru `SJ`/`PICK` → `SP/{ENTITY}/{DEPT}/{YYYY}/{SEQ}`, auto, unik, konsisten lintas dokumen. **Trade-off:** rapi & selaras pola repo, tapi bukan nomor SP asli customer (butuh kolom terpisah `customer_sp_no` bila nomor customer tetap ingin disimpan/dicari).
- **Opsi N2 — Pertahankan nomor SP customer sebagai identitas, tapi kunci uniqueness.** Tambah `UNIQUE(customer_id, sp_no)` juga di `sp_items` (samakan dgn `sp_orders`) dan **ubah `groupBySP` agar keyed by `(customer_id, sp_no)`** (`App.jsx:166`) untuk mematikan merge lintas-customer. **Trade-off:** menjaga makna bisnis nomor customer, tapi perlu bersihkan duplikat historis dulu sebelum pasang UNIQUE.
- **Opsi N3 — Satukan jalur input.** Pensiunkan FormModal legacy manual-write atau samakan dengan InputSPPage (dual-write + aturan nomor sama) agar tak ada dua konvensi. **Trade-off:** menghilangkan sumber divergensi, tapi menyentuh alur input harian (perlu hati-hati).

**Rekomendasi:** **N2 + N3** — kunci `(customer_id, sp_no)` di kedua tabel & perbaiki kunci `groupBySP` (menyelesaikan merge + ambiguitas tautan), lalu satukan jalur input. Terapkan **N1** bila diputuskan SP memakai nomor internal generatif (simpan nomor customer di kolom terpisah). Semua opsi: **jangan lemahkan uniqueness demi jalan** (AGENTS.md), dan bersihkan duplikat sebelum memasang constraint.

---

## CATATAN VERIFIKASI (SQL read-only, jalankan manual bila ingin memastikan lapangan)

```sql
-- 1) Apakah shipped_qty benar-benar diam untuk SP baru (bukan hasil import)?
SELECT sp_no, count(*) items, sum(qty) qty, sum(shipped_qty) shipped
FROM sp_items GROUP BY sp_no HAVING sum(shipped_qty)=0 ORDER BY max(created_at) DESC LIMIT 20;

-- 2) Desync lifecycle lama vs baru (sp_items vs sp_orders) untuk sp_no yang sama customer:
SELECT si.sp_no, si.customer_id,
       min(si.sp_status) sp_items_status, o.status sp_orders_status
FROM sp_items si LEFT JOIN sp_orders o ON o.customer_id=si.customer_id AND o.sp_no=si.sp_no
GROUP BY si.sp_no, si.customer_id, o.status
HAVING min(si.sp_status)='confirmed' AND (o.status IS NULL OR o.status='DRAFT') LIMIT 30;

-- 3) sp_no manual kembar LINTAS customer (risiko merge groupBySP):
SELECT sp_no, count(DISTINCT customer_id) n_cust
FROM sp_items GROUP BY sp_no HAVING count(DISTINCT customer_id) > 1;

-- 4) SP yang punya delivery 'delivered' tapi shipped_qty masih < qty (bukti rantai putus):
SELECT dn.sp_no, dn.status dn_status,
       sum(si.qty) qty, sum(si.shipped_qty) shipped
FROM delivery_notes dn JOIN sp_items si ON si.sp_no=dn.sp_no
WHERE dn.status IN ('in_transit','delivered')
GROUP BY dn.sp_no, dn.status HAVING sum(si.shipped_qty) < sum(si.qty) LIMIT 30;

-- 5) Konfirmasi tak ada trigger status di sp_orders/sp_items selain updated_at:
SELECT tgname, tgrelid::regclass FROM pg_trigger
WHERE tgrelid IN ('public.sp_items'::regclass,'public.sp_orders'::regclass) AND NOT tgisinternal;
```
