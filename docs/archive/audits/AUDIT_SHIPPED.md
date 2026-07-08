# AUDIT — Alur `shipped_qty` & Titik Ubah Status SP (Storbit / SOA)

> Scope: pengisian `sp_items.shipped_qty` + semua titik yang mengubah `sp_status`
> (SP Manifest, Input SP, Picking List, Surat Jalan, Pengiriman SP).
> Read-only. Tidak ada file yang diubah; hanya dokumen ini ditulis. DB dibaca dari
> `supabase/schema_snapshot.sql` (bukan tebakan).

---

## RINGKASAN

**`shipped_qty` diisi 100% dari frontend (form manual), TIDAK ada DB function/trigger yang menulisnya.** Ada 3 jalur tulis aktif → semuanya lewat `spToDb` (`db.js:69 shipped_qty`) ke `sp_items`:

1. **`ShipmentModal` "Update Shipment"** — halaman **Pengiriman SP** (`ShipmentPage`). Ini UI khusus per-baris untuk isi `shipped_qty`. **Nilai bebas → partial MUNGKIN.**
2. **`FormModal` "Shipped QTY"** — form Add/Edit SP (Input SP → "Add New SP" & edit row). Editable bebas.
3. **Import CSV** (`bulkAdd`, `parseNumber(obj['shipped qty'])`).

(Halaman **Detail SP** `SalesOrderDetailPage` menampilkan Shipped QTY **read-only** — ikut tersimpan tapi tak bisa diubah di sana.)

**Picking List / Surat Jalan / dispatch TIDAK menyentuh `shipped_qty` sama sekali** — di seluruh `schema_snapshot.sql`, satu-satunya `UPDATE sp_items` ada di fungsi `set_sp_status` (`schema:912`), dan itu tak menyentuh `shipped_qty`. `generate_picking_from_sp` hanya **membaca** `qty - shipped_qty` (`schema:405,418,420`).

**Titik ubah `sp_status` cuma DUA tombol, keduanya di SP Manifest (`SalesOrderPage`):** **Konfirmasi** → `confirmed`, **Tolak** → `cancelled`. Keduanya lewat satu RPC `set_sp_status` (`db.js:330` → `schema:900`). `set_sp_status` **tidak dipanggil dari tempat lain**. Tombol **Manifest** tidak mengubah status (toast kosong).

**Celah utama:** tidak ada proteksi yang mencegah `shipped_qty` diisi sebelum SP `confirmed` → SP `draft` bisa dibuat "penuh terkirim" → tampil **CLOSED** & masuk **History** walau tak pernah dikonfirmasi (H-1). Selain itu jalur pengiriman "resmi" (Picking→Surat Jalan) tak menulis `shipped_qty`, jadi terputus dari status SP (H-2).

---

## ALUR `shipped_qty`

### Mapping kolom
- Baca: `db.js:25` `shippedQty: row.shipped_qty ?? 0`.
- Tulis: `db.js:69` `shipped_qty: Number(item.shippedQty) || 0` (dipakai `insertSpItem`/`bulkInsertSpItems`/`updateSpItem`, `db.js:292-320`).

### Jalur tulis (FE) — semua ada UI, manual
| # | UI / entry point | Lokasi | Editable? | Save path |
|---|---|---|---|---|
| 1 | **Pengiriman SP → "Update Shipment"** (`ShipmentModal`) | render `App.jsx:2749-2750` (`activeMenu==='shipment'` → `ShipmentPage` `App.jsx:4031`); baris → `onUpdate` → `setShipmentRow` → modal `App.jsx:3364`; input **`App.jsx:4514`** `onChange shippedQty` | **Ya, bebas** | `onSave=handleSave` (`App.jsx:2017`) → `dbSaveRow` → `updateSpItem` → `spToDb` |
| 2 | **Input SP / Add-Edit SP** (`FormModal`) | render `App.jsx:3330-3336` (`editingRow \|\| showAdd`); input **`App.jsx:4371`** `update('shippedQty')` | **Ya, bebas** | `onSave=handleSave` (`App.jsx:2017`) → `dbSaveRow` → `insertSpItem`/`updateSpItem` → `spToDb` |
| 3 | **Import CSV** | `App.jsx:4636` `shippedQty: parseNumber(obj['shipped qty'])` → `bulkAdd` → `bulkInsertSpItems` | — | `spToDb` |
| 4 | **Detail SP** (`SalesOrderDetailPage` EditItemModal) | field **`SalesOrderDetailPage:343` `readOnly`**; ikut payload `:268` | **Tidak** (read-only) | idempotent re-save |

### Bertahap (partial) atau tidak?
- **Kapabilitas: partial MUNGKIN.** `ShipmentModal` (`App.jsx:4514`) menerima angka bebas tanpa clamp; `newOutstanding = row.qty - shippedQty` (`App.jsx:4494`) hanya display. `ShipmentPage` beroperasi **per line item** (`sp_items` per baris), jadi satu SP multi-item bisa sebagian terkirim → SP-level `Partial` (`App.jsx:200-206`) → pill **MANIFEST**.
- **Realita data saat ini: 0 atau penuh.** Import mengisi `shipped_qty` hanya `0` atau `=qty` (CLAUDE.md: "shipped_qty Closed→qty & TROLLY→qty"). Jadi Partial jarang muncul **karena data**, bukan karena UI melarang.

### Yang TIDAK mengisi `shipped_qty`
- **DB:** tak ada trigger/fungsi yang menulis `shipped_qty`. Satu-satunya `UPDATE sp_items` = `set_sp_status` (`schema:912`, hanya kolom status). Grep `shipped_qty` di schema hanya muncul di: definisi tabel (`schema:3740`) + **pembacaan** oleh `generate_picking_from_sp` (`schema:405,418,420`).
- **Picking List / Surat Jalan / dispatch:** tidak ada fungsi yang menulis `shipped_qty` (tak ada di seluruh `schema_snapshot.sql`). Menyelesaikan Surat Jalan **tidak** menaikkan `shipped_qty`.

---

## SEMUA TITIK UBAH STATUS (`sp_status`)

Pemanggil `set_sp_status` di seluruh `src/`: **hanya `SalesOrderPage.jsx:450`** (via `db.js:330 setSpStatus`). `confirmModal` (`SalesOrderPage:441-464`) menangani **confirm & reject** sekaligus.

| Tombol | Lokasi (file:line) | Aksi | Status hasil (`sp_status`) | Kolom lain diisi |
|---|---|---|---|---|
| **Konfirmasi** | `SalesOrderPage:158` (`AksiCell`, tampil saat `dstatus==='OPEN'`) → `openModal(no,'confirm')` → `confirmModal` `:441` → `setSpStatus(no,'confirmed')` `:447-450` | konfirmasi SP | **`confirmed`** | `confirmed_at=now()`, `confirmed_by=auth.uid()` (`schema:913-915`) |
| **Tolak** | `SalesOrderPage:159` (tampil saat `dstatus==='OPEN'`) → `openModal(no,'reject')` → `confirmModal` (wajib alasan `:442`) → `setSpStatus(no,'cancelled',reason)` | tolak SP | **`cancelled`** | `cancelled_at`, `cancelled_by`, `cancel_reason` (`schema:916-918`) |
| **Manifest** | `SalesOrderPage:164` (tampil saat `dstatus==='MANIFEST'`) → `handleManifest` `:465-468` | — | **TIDAK berubah** (hanya `showToast('… dibuat ✓')`, komentar `// TODO`) | — |
| Input SP / FormModal | `App.jsx:4277` | buat/edit SP | **TIDAK di-set** oleh FE → DB pakai default `'draft'` (`schema:3760`); `spToDb` tak mengirim `sp_status` | — |
| Picking / Surat Jalan / Pengiriman SP | `ShipmentPage`/`ShipmentModal`, RPC picking/delivery | fulfillment | **TIDAK mengubah `sp_status`** | — |

Fungsi DB `set_sp_status` (`schema:900-925`) meng-UPDATE **semua baris** dengan `sp_no` sama (atomik per SP), validasi status ∈ {draft,confirmed,cancelled}.

**Kesimpulan:** SP Manifest adalah **satu-satunya** tempat yang mengubah `sp_status`. Picking/Surat Jalan/Pengiriman SP **tidak** mengubah `sp_status`.

---

## HUBUNGAN `shipped_qty` ↔ STATUS

### Q: `shipped_qty` penuh → tampil CLOSED walau `sp_status='draft'`? — YA. Alur persis:
1. `ShipmentModal` (`App.jsx:4514`) **atau** `FormModal` (`App.jsx:4371`) set `shippedQty = qty` pada SP yang `sp_status='draft'` → `handleSave` (`App.jsx:2017`) → `dbSaveRow` → `updateSpItem` → `spToDb` (`db.js:69`) simpan `shipped_qty=qty`. **`sp_status` tetap `draft`** (tak disentuh).
2. `calcItem` (`spCalc.js:24,27`): `outstandingQty = qty - shippedQty = 0` → `status='Closed'`.
3. `groupBySP` (`App.jsx:202-205`): semua item Closed → `g.status='Closed'`.
4. `toDesignStatus` (`SalesOrderPage:74`): `if (g.status === 'Closed') return 'CLOSED'` — **dicek SEBELUM** `spStatus==='confirmed'` (`:76`). → pill **CLOSED**.
5. Tab: `history = dstatus==='CLOSED'||'CANCELLED'` (`SalesOrderPage:355,368`) → SP masuk **History**.

→ SP yang **tak pernah dikonfirmasi** bisa tampak selesai/terpenuhi.

### Q: Ada proteksi mencegah `shipped_qty` diisi sebelum confirmed? — TIDAK ADA.
- `ShipmentPage` daftar item: `const pending = rows.filter(r => r.status !== 'Closed')` (`App.jsx:4032`) — pakai **status fulfillment**, bukan `sp_status`. SP `draft` tetap tampil & bisa di-"Update Shipment".
- `ShipmentModal` (`App.jsx:4486-...`): tidak ada cek `sp_status`. Gate satu-satunya = `can(role,'shipment')` (`App.jsx:2750`) — RBAC, bukan lifecycle.
- `FormModal` (`App.jsx:4371`): "Shipped QTY" editable bebas bahkan saat membuat SP baru (default `draft`).
- **Kontras:** DB `generate_picking_from_sp` JUSTRU mewajibkan `sp_status='confirmed'` (`schema:400-401`). Jadi jalur picking "resmi" ter-gate, tapi jalur `shipped_qty` langsung (ShipmentModal/FormModal) **melewati** gate itu.

---

## TEMUAN

### H-1 (HIGH) — `shipped_qty` bisa diisi tanpa/ sebelum konfirmasi → SP `draft` tampil CLOSED
Tidak ada gate `sp_status` di jalur tulis `shipped_qty` (`ShipmentModal` `App.jsx:4514`, `FormModal` `App.jsx:4371`, `ShipmentPage` filter `App.jsx:4032`). Fulfillment menimpa lifecycle di `SalesOrderPage:74`.
- **Dampak:** SP yang belum dikonfirmasi (bahkan baru dibuat) bisa dibuat "penuh terkirim" → pill CLOSED → masuk History → dianggap selesai untuk keputusan operasional/laporan, padahal `sp_status` masih `draft`. Juga bisa memicu MANIFEST palsu (partial) tanpa SP pernah confirmed.
- **Bukti:** `App.jsx:4032,4371,4514` + `spCalc.js:24,27` + `App.jsx:202-205` + `SalesOrderPage:74`.
- **Rekomendasi:** gate penulisan `shipped_qty` (UI + idealnya DB) ke SP `sp_status='confirmed'` saja; atau jadikan fulfillment tak menimpa lifecycle di pill.

### H-2 (HIGH) — Dua sistem fulfillment terputus: Surat Jalan/dispatch tak menaikkan `shipped_qty`
Jalur "resmi" Picking List → Surat Jalan (RPC `generate_picking_from_sp` `schema:390`, delivery/dispatch) **tidak menulis** `sp_items.shipped_qty` (tak ada `shipped_qty` di fungsi mana pun; satu-satunya `UPDATE sp_items` = `set_sp_status`). Sementara status fulfillment SP di halaman Manifest **hanya** bergerak dari `shipped_qty` yang diisi manual lewat `ShipmentModal`.
- **Dampak:** SP yang benar-benar dikirim via Surat Jalan tetap tampil **Open/Outstanding** di SP Manifest kecuali seseorang JUGA meng-update `shipped_qty` manual. Dua sumber kebenaran fulfillment (picking/delivery vs `shipped_qty`) tidak tersinkron → status & Outstanding menyesatkan.
- **Bukti:** `schema:912` (satu-satunya UPDATE sp_items), grep `shipped_qty` schema (hanya baca di `generate_picking_from_sp`), `App.jsx:4514` (satu-satunya penambah nyata).
- **Rekomendasi:** sambungkan dispatch Surat Jalan ke `shipped_qty` (mis. RPC dispatch menaikkan `shipped_qty`), atau tetapkan satu sumber fulfillment; pensiunkan jalur `ShipmentModal` manual bila picking/delivery jadi kanonik.

### M-1 (MEDIUM) — `shipped_qty` tanpa validasi/clamp (bisa melebihi `qty`)
`ShipmentModal` (`App.jsx:4514`) & `FormModal` (`App.jsx:4371`) menerima angka bebas; `newOutstanding = row.qty - shippedQty` (`App.jsx:4494`) bisa negatif. Tak ada `min/max`/clamp.
- **Dampak:** over-ship (shipped > qty) → outstanding negatif; `calcItem` tetap `Closed` (`outstandingQty===0` tak kena, tapi status jadi bukan Closed/Partial/Open yang benar — `outstandingQty<0` → bukan Closed karena `===0` gagal, bukan Partial karena butuh `>0`, jatuh ke `Open`), memicu tampilan aneh.
- **Rekomendasi:** clamp `0 ≤ shipped_qty ≤ qty` di UI + CHECK constraint DB.

### M-2 (MEDIUM) — `ShipmentPage` "pending" berbasis fulfillment, bukan lifecycle
`App.jsx:4032` `rows.filter(r => r.status !== 'Closed')` menampilkan SP `draft`/`cancelled` untuk di-ship (selama belum Closed).
- **Dampak:** operator bisa "mengirim" SP yang dibatalkan/belum dikonfirmasi. Terkait H-1.
- **Rekomendasi:** batasi daftar ke `sp_status='confirmed'`.

### L-1 (LOW) — Emoji di UI (langgar brand "no emoji")
`App.jsx:4066` "Semua item sudah Closed 🎉"; `App.jsx:2021` toast "…✨"; `SalesOrderPage:460` "…✓". Kosmetik.

---

### Catatan verifikasi
- Pemanggil `set_sp_status`: hanya `SalesOrderPage.jsx:450` (grep `src/`).
- `UPDATE sp_items` di DB: hanya `schema:912` (`set_sp_status`).
- `shipped_qty` di DB: definisi tabel `schema:3740`; dibaca `schema:405,418,420` (`generate_picking_from_sp`); **tak ada penulisan**.
- Penulis `shipped_qty` di FE: `spToDb` (`db.js:69`) via `insertSpItem`/`bulkInsertSpItems`/`updateSpItem`, dipicu `FormModal`/`ShipmentModal`/CSV import; Detail SP read-only.
