# AUDIT — Rantai Gudang Storbit (Picking → Packing → Surat Jalan → Stok)

> Read-only. Tidak ada file yang diubah; hanya dokumen ini dibuat. DB dari
> `supabase/schema_snapshot.sql` (kolom/FK/RPC/RLS diverifikasi, bukan tebakan).
> Entitas SOA `d2e5e565-…`; gudang default `303c3d4c-…`.

---

## RINGKASAN

- **Packing List BUKAN entitas terpisah.** Tak ada tabel `packing_*` maupun komponen `PackingList` di kode ("TIDAK ADA di kode"). "Packing" diwakili oleh **(a)** `picking_list_materials` (kardus/lakban dsb + qty, memotong stok), **(b)** kolom `delivery_notes.total_koli`/`total_weight` (ringkasan koli/berat di Surat Jalan), dan **(c)** cetakan `PickingListPDF.jsx` (checklist). Tak ada status/lifecycle packing.
- **Kardinalitas:** **1 SP → N Picking List** (per waktu; **≤1 aktif** dijaga RPC), tiap picking mencakup SEMUA item outstanding SP. **1 Picking → N Surat Jalan** (per waktu; **≤1 aktif** dijaga RPC), tiap SJ menyalin SEMUA item `qty_picked>0`. → **selalu efektif 1:1 aktif**; **tidak bisa** memecah 1 picking jadi 2 SJ (batch). Jadi **partial/batch TIDAK didukung**.
- **Jembatan ke SP: TIDAK ADA.** Tak ada satu titik pun (picking done / dispatch / delivered) yang menulis balik `sp_items.shipped_qty` atau `sp_status`. Satu-satunya `UPDATE sp_items` di DB = `set_sp_status` (`schema:912`, dipakai Konfirmasi/Tolak). **Padahal jalur FK untuk menjembatani SUDAH ADA** (`delivery_note_items.picking_list_item_id → picking_list_items.sp_item_id → sp_items.id`), tinggal dipasang.
- **Aliran stok** (reserved→unreserved/outbound + reversal) jalan otomatis & atomik via RPC SECURITY DEFINER, **tapi ada celah "reserved nyangkut"** bila Surat Jalan dibatalkan saat masih draft.
- **Semua aksi bisa dilakukan role `operations`** (Gigih); **role gudang TIDAK ADA**; gating in-file di rantai ini = **hanya status**, tak ada cek role.

---

## PACKING LIST

**Tidak ada sebagai entitas.** Bukti:
- Tabel: `grep TABLE public.packing*` → **nihil**. Tak ada `packing_lists`/`packing_*`.
- Komponen/halaman: `find src -iname "*packing*"` → **nihil**. Satu-satunya penyebutan "packing" di FE = komentar `DeliveryNoteDetailPage.jsx:3` ("Armada + packing editable").

**Bagaimana "packing" diwakili sekarang:**
| Wujud | Di mana | Kolom/isi | Efek |
|---|---|---|---|
| Material packing (kardus/lakban) | `picking_list_materials` (per picking, saat status `done`) | `picking_list_id`(FK CASCADE), `product_id`, `product_name`, `sku`, `qty`, `created_by` | RPC `add_picking_material` → `stock_ledger` **outbound** (`schema:63-65`) |
| Koli & berat | `delivery_notes.total_koli` (int), `total_weight` (numeric) | diisi di form Armada (`DeliveryNoteDetailPage:254`→`updateDeliveryArmada` `db.js:532`) | tak ada efek stok |
| Cetak checklist | `PickingListPDF.jsx` (tombol "Cetak Picking List" `PickingListDetailPage:459`) | render dari items + materials | dokumen cetak saja |

→ "Packing List" fisik = gabungan material + koli/berat + PDF; **tak punya tabel, status, atau nomor dokumen sendiri**. Material hanya editable saat picking `done` **dan** belum ada Surat Jalan (`matEditable`, `PickingListDetailPage:125`; DB guard `add_picking_material` `schema:52-54`).

---

## RANTAI & KARDINALITAS

### Tabel & FK (dari `schema`)
| Tabel | Kolom kunci | FK |
|---|---|---|
| `picking_lists` | `picking_no` UNIQUE, `sp_no` **TEXT (no FK)**, `warehouse_id`, `status`(pending/in_progress/done/cancelled) | `warehouse_id→warehouses`, `assigned_to/created_by→auth.users` (`schema:8051-8067`). **`sp_no` tanpa FK** (hanya index `idx_picking_lists_sp_no`) |
| `picking_list_items` | `qty_requested`, `qty_picked`, `qty_short`, `status`(pending/picked/short) | `picking_list_id→picking_lists` CASCADE; **`sp_item_id→sp_items(id)` SET NULL** (`schema:8003-8019`) |
| `picking_list_materials` | `qty` | `picking_list_id→picking_lists` CASCADE, `product_id→products` (`schema:8035-8043`) |
| `delivery_notes` | `do_no` UNIQUE, `sp_no` **TEXT (no FK)**, `picking_list_id`, `status`(draft/in_transit/delivered/cancelled), `total_koli/total_weight`, `customer_name`(snapshot) | **`picking_list_id→picking_lists` (FK, NON-unique)**, `customer_id→accounts`, `created_by→auth.users` (`schema:7371-7387`) |
| `delivery_note_items` | `qty` | `delivery_note_id→delivery_notes` CASCADE; **`picking_list_item_id→picking_list_items(id)` SET NULL**; `product_id→products` (`schema:7347-7363`) |

### Kardinalitas nyata
- **1 SP → N picking_lists:** `picking_lists.sp_no` teks, **tanpa unique** → DB izinkan banyak. Dibatasi hanya oleh guard RPC `generate_picking_from_sp`: `IF EXISTS (... picking_lists WHERE sp_no=... AND status<>'cancelled') THEN RAISE` (`schema:402`) → **maksimum 1 picking non-cancelled per SP** pada satu waktu; setelah dibatalkan boleh generate lagi. Tiap picking mencakup **semua item outstanding** SP: `qty_requested = GREATEST(qty - shipped_qty, 0)` untuk `sp_status='confirmed' AND (qty-shipped_qty)>0` (`schema:418-420`).
- **1 picking → N delivery_notes:** `delivery_notes.picking_list_id` FK **non-unique** → DB izinkan banyak. Dibatasi guard RPC `generate_delivery_from_picking`: `IF EXISTS (... delivery_notes WHERE picking_list_id=... AND status<>'cancelled') THEN RAISE` (`schema:357`) → **maksimum 1 SJ non-cancelled per picking**. Tiap SJ menyalin **semua** item `qty_picked>0` (`schema:376-379`).
- **1 SP → N delivery_notes** (via picking; juga `delivery_notes.sp_no` teks + index).

### Partial/batch (pertanyaan 5 & 6)
- **`delivery_note_items.qty` diambil dari `qty_picked`** saat generate (`schema:377`), lalu **editable selama SJ `draft`** (`updateDeliveryItemQty` `db.js:624`, gate FE `editable=status==='draft'` `DeliveryNoteDetailPage:105`).
- **Picking bersifat all-or-nothing per item:** `setPickingItemPicked` men-set `qty_picked = qty_requested` (picked) atau `0` (`db.js:433-434`) — **tak ada input qty parsial** di UI (toggle biner). `qty_short` diisi otomatis saat generate (selisih stok, `schema:432-433`) tapi tak dipakai untuk pengiriman parsial.
- **Tidak bisa memecah 1 picking jadi 2 SJ** (batch 600 + 400): guard `schema:357` memblok SJ ke-2 selama SJ pertama belum cancelled. → **partial/batch TIDAK didukung** oleh struktur saat ini.

### Diagram relasi (teks)
```
sp_items (N baris per SP, kunci teks sp_no)
   │  (sp_no TEXT, tanpa FK)                 ┌─ picking_list_items.sp_item_id ─→ sp_items.id (FK, SET NULL)
   ▼                                         │
picking_lists (1 aktif/ SP)  ──1:N──→ picking_list_items ──┘
   │  (picking_list_id FK non-unique)        └─ picking_list_materials (1:N, packing)
   ▼
delivery_notes (1 aktif/ picking) ──1:N──→ delivery_note_items
                                              (picking_list_item_id → picking_list_items.id, SET NULL)
```
Rantai FK ke SP **ADA** di sisi item: `delivery_note_items → picking_list_items → sp_items.id`. Rantai header (`picking_lists.sp_no`, `delivery_notes.sp_no`) **hanya teks**.

---

## ALIRAN STOK

| Gerakan (`movement_type`) | Kapan | RPC (file:line) | Tombol (file:line) | Detail |
|---|---|---|---|---|
| **reserved** | Generate Picking | `generate_picking_from_sp` (`schema:440-444`) | Detail SP "Generate Picking List" (`SalesOrderDetailPage:797`→`db.js:357`) | reserve `LEAST(qty_requested, avail)` per item; `qty_short` = sisa tak tersedia |
| **unreserved** | Batalkan Picking | `cancel_picking` (`schema:206-210`) | "Batalkan Picking" (`PickingListDetailPage:510`→`db.js:467`) | mirror baris `reserved` picking itu |
| **outbound** (−) | Tambah Material | `add_picking_material` (`schema:63-65`) | "Tambah" material (`PickingListDetailPage:409`→`db.js:476`) | `-abs(qty)`, ref `picking_material` |
| **inbound** (reversal) | Hapus Material | `delete_picking_material` (`schema:249-253`) | trash material (`PickingListDetailPage:437`→`db.js:488`) | ref `material_reverse` |
| **unreserved** + **outbound** (−) | Berangkatkan (dispatch) | `dispatch_delivery` (`schema:275-285`) | "Berangkatkan" (`DeliveryNoteDetailPage:341`→`db.js:539/542`) | unreserve reservasi picking **lalu** outbound `-abs(dni.qty)` per item SJ |
| **inbound** (reversal) | Batalkan SJ **yang sudah in_transit/delivered** | `cancel_delivery` (`schema:181-187`) | "Batalkan" (`DeliveryNoteDetailPage:354`→`db.js:554`) | reverse outbound → inbound; **HANYA bila status in_transit/delivered** |

- **Tandai Terkirim (delivered):** `db.js:546-549` update polos `status='delivered'` — **tanpa efek stok** (barang sudah keluar saat dispatch). Benar.
- **Atomisitas:** tiap RPC = satu fungsi plpgsql = **satu transaksi** → reserve/unreserve/outbound konsisten dalam satu aksi. `stock_summary` (view, `security_invoker`) menghitung `on_hand` (inbound/outbound/adjustment/transfer), `reserved` (Σreserved−Σunreserved), `available = on_hand − reserved`.

### Konsistensi & celah (pertanyaan 8)
- **CELAH "reserved nyangkut" (GAP):** alur `generate picking (reserved) → complete (done) → generate SJ (draft) → Batalkan SJ saat masih draft`. `cancel_delivery` hanya reverse bila status `in_transit`/`delivered` (`schema:181`) → untuk SJ **draft**, **tidak melepas reservasi** apa pun. Sementara picking sudah `done` → `cancel_picking` **diblok** (`schema:204` hanya pending/in_progress). → **stok tetap `reserved` selamanya** kecuali dibuat SJ baru lalu di-dispatch. Picking `done` yang diterlantarkan (tanpa SJ) juga **tak bisa dilepas reservasinya**. → temuan **G-2**.
- **Outbound dobel?** Tidak: `dispatch_delivery` di-gate `status='draft'` (`schema:271`) → tak bisa dispatch dua kali.
- **Over-deduct kecil:** dispatch outbound pakai `delivery_note_items.qty` yang **bisa diedit** saat draft (`db.js:624`), sedangkan unreserve pakai baris `reserved` asli (penuh). Bila qty SJ diedit naik melebihi picked, outbound bisa > yang direservasi (edge, MEDIUM).

---

## JEMBATAN KE SP (yang hilang)

**Konfirmasi (pertanyaan 9): TIDAK ADA satu pun titik di rantai gudang yang menulis `sp_items`.**
- `generate_picking_from_sp`/`cancel_picking`/`add`/`delete_picking_material`/`generate_delivery_from_picking`/`dispatch_delivery`/`cancel_delivery` → hanya menyentuh `picking_*`/`delivery_*`/`stock_ledger`. Tidak ada `UPDATE sp_items` di dalamnya (satu-satunya `UPDATE sp_items` di seluruh schema = `set_sp_status` `schema:912`).
- FE: handler dispatch/delivered/cancel hanya memanggil RPC delivery lalu `load()` (refetch DN), tak menyentuh SP (`DeliveryNoteDetailPage:128-145`).
- → SP yang barangnya sudah `delivered` tetap `shipped_qty` lama & `sp_status='confirmed'`; di SP Manifest tetap **Open/Outstanding**. (= AUDIT_E2E T-2, dipertegas.)

**Informasi yang tersedia saat dispatch/delivered (pertanyaan 10) — cukup untuk auto-update:**
- `delivery_notes.sp_no` (SP mana), `delivery_note_items.qty` (qty per item), dan **`delivery_note_items.picking_list_item_id → picking_list_items.sp_item_id → sp_items.id`** (baris SP persisnya).
- → **Jembatan SEHARUSNYA dipasang di `dispatch_delivery`** (`schema:262`, saat barang benar-benar keluar): setelah insert outbound, tambahkan
  `UPDATE sp_items s SET shipped_qty = shipped_qty + dni.qty FROM delivery_note_items dni JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id WHERE dni.delivery_note_id = p_delivery_note_id AND s.id = pli.sp_item_id;`
  (dan reversal serupa di `cancel_delivery` saat membatalkan in_transit/delivered). Alternatif titik: transisi `delivered`. Karena jalur FK sudah ada, jembatan ini **layak tanpa perubahan struktur** — hanya menambah UPDATE di RPC (di luar eksekusi audit).

---

## GATING & ROLE

| Aksi | Prasyarat (gerbang) | Dicek di mana | Role gating in-file |
|---|---|---|---|
| Generate Picking | `sp_status='confirmed'` + belum ada picking aktif + ada outstanding | FE `SalesOrderDetailPage:797` + DB `schema:400,402,406` | **tak ada** (hanya gate status) |
| Mulai Pengambilan | picking `status='pending'` | FE `PickingListDetailPage:466` | **tak ada** |
| Toggle item picked | picking tak `locked` (bukan done/cancelled) | FE `:323` | **tak ada** |
| Selesaikan Picking | `in_progress` **dan** semua item picked | FE `:482` | **tak ada** |
| Tambah/Hapus Material | picking `done` **dan** belum ada SJ | FE `:358/375` + DB `schema:52-54`/`247` | **tak ada** |
| Batalkan Picking | picking `pending`/`in_progress` | DB `schema:204` | **tak ada** |
| Buat Surat Jalan | picking `done` + ada `qty_picked>0` + belum ada SJ aktif | DB `schema:356,361,357` | **tak ada** |
| Simpan Armada | SJ tak `locked` (draft/in_transit) | FE `DeliveryNoteDetailPage:238` | **tak ada** |
| Edit/Tambah/Hapus item SJ | SJ `status='draft'` | FE `:105` | **tak ada** |
| Berangkatkan (dispatch) | SJ `draft` **dan** driver+vehicle terisi | FE `:340-341` + DB `schema:271` | **tak ada** |
| Tandai Terkirim | SJ `in_transit` | FE `:347` (DB update polos, **tanpa guard**) | **tak ada** |
| Batalkan SJ | SJ bukan `cancelled` | FE `:353` + DB `schema:180` | **tak ada** |

- **Role gating in-file di SELURUH rantai gudang: TIDAK ADA.** `PickingListPage/DetailPage` & `DeliveryNotePage/DetailPage` tidak meng-import `useAuth`/`erpRole`/`hasPermission` (dikonfirmasi audit E2E). Kontrol akses hanya **menu** (`App.jsx`) + RLS.
- **Menu:** `picking` & `surat-jalan` role = `super_admin/admin/ceo/gm/manager/operations` (`App.jsx:501-502`); Generate Picking dipicu dari Detail SP (menu `manifest`). → **role `operations` (Gigih) bisa melakukan SEMUA** aksi gudang (picking, packing/material, surat jalan, dispatch, delivered, cancel).
- **Role gudang/warehouse: TIDAK ADA** (13 role, `App.jsx:260-273`). Kolom `picking_lists.assigned_to` (FK auth.users) **ada di DB tapi tak dipakai** — PIC di UI = placeholder `—` ("Fase 5 role gudang", `PickingListPage:192`).
- **RLS:** `picking_lists/items/materials`, `delivery_notes/items` semua `USING(true)`/`WITH CHECK(true)`; `stock_ledger` select/insert bebas, update super_admin (`schema:9321-11007`). → gate FE bisa dilewati; siapa pun login bisa tulis lintas customer/entitas (= AUDIT_E2E T-1).

---

## TEMUAN

### G-1 (HIGH) — Rantai gudang tak menulis balik ke SP (jembatan hilang)
Tak ada RPC/aksi yang meng-update `sp_items.shipped_qty`/`sp_status` saat picking done/dispatch/delivered (`schema:172-448`; satu-satunya UPDATE sp_items = `set_sp_status`).
- **Dampak:** SP yang sudah dikirim & sampai tetap Open/Outstanding di SP Manifest; fulfillment hanya bisa ditutup dengan edit `shipped_qty` MANUAL (jalur legacy ShipmentModal). Laporan & keputusan berbasis status SP menyesatkan.
- **Titik pasang:** `dispatch_delivery` (`schema:262`) via FK `delivery_note_items→picking_list_items.sp_item_id→sp_items.id` (jalur sudah ada).

### G-2 (HIGH) — Stok "reserved" bisa nyangkut selamanya (Batalkan SJ draft / picking done terlantar)
`cancel_delivery` hanya reverse bila `in_transit`/`delivered` (`schema:181`); SJ `draft` yang dibatalkan tak melepas reservasi. Picking `done` tak bisa `cancel_picking` (`schema:204`).
- **Dampak:** reservasi stok dari picking `done` yang SJ-nya dibatalkan-draft (atau tak pernah dibuat SJ) **stuck `reserved`** → `available` turun permanen (stok bayangan), padahal barang fisik ada. Tak ada tombol untuk melepas.
- **Bukti:** `schema:181` (cancel_delivery guard) + `schema:204` (cancel_picking guard) + tak ada unreserve untuk picking done.

### G-3 (HIGH) — Tidak bisa partial/batch (1 picking → hanya 1 SJ aktif; pick all-or-nothing)
Guard `schema:357` blok SJ ke-2 per picking; `setPickingItemPicked` biner (`db.js:433`).
- **Dampak:** kirim sebagian (mis. 600 dari 1000, sisanya nyusul) tak bisa dimodelkan sebagai dua Surat Jalan dari satu picking; harus akal-akalan (edit qty / batalkan). Tak selaras kebutuhan lapangan partial delivery.

### G-4 (MEDIUM) — Header picking/SJ tertaut ke SP via teks tanpa FK
`picking_lists.sp_no` & `delivery_notes.sp_no` teks tanpa FK (hanya index); SP ber-No `Date.now()`.
- **Dampak:** picking/SJ bisa "yatim" bila `sp_no` typo/format beda; hapus SP tak cascade. (Item picking punya FK `sp_item_id` → lebih aman, tapi header tidak.)

### G-5 (MEDIUM) — Packing tak punya entitas/status → tak terlacak & tak ada gerbang
"Packing" hanya material + koli/berat + PDF; tak ada status "packed"/nomor packing.
- **Dampak:** tak ada bukti/lifecycle bahwa barang benar sudah dipacking sebelum SJ dibuat; koli/berat bisa kosong saat dispatch (tak ada guard). Rekonsiliasi packing↔pengiriman lemah.

### G-6 (MEDIUM) — `assigned_to` picking tak dipakai + tak ada role gudang
Kolom `picking_lists.assigned_to` ada (FK auth.users) tapi tak pernah diisi/dipakai; PIC placeholder. Tak ada role warehouse; semua via `operations`.
- **Dampak:** tak ada penugasan/pemisahan tugas staf gudang; jejak "siapa mengambil" hilang; kontrol akses gudang = generic operations.

### G-7 (MEDIUM) — Dispatch outbound pakai qty SJ yang editable (potensi over-deduct)
`dispatch_delivery` outbound `-abs(dni.qty)` (`schema:283`) sedangkan qty SJ bisa diedit saat draft (`db.js:624`); unreserve pakai reservasi penuh.
- **Dampak:** bila qty SJ diedit > qty_picked, stok keluar melebihi yang direservasi/dipicking → `on_hand` bisa minus / tak konsisten. Tak ada validasi qty ≤ picked.

### G-8 (LOW) — "Tandai Terkirim" tanpa guard DB
Transisi `delivered` = update polos (`db.js:546`), tanpa RPC/validasi status server-side (hanya gate FE `:347`).
- **Dampak:** bila dipanggil di luar alur (mis. langsung dari draft via manipulasi), bisa set `delivered` tanpa pernah dispatch (stok tak keluar). Andalkan FE saja.

### G-9 (LOW) — Cancel delivered mereversal stok barang yang sudah keluar fisik
`cancel_delivery` pada status `delivered` tetap inbound-reversal (`schema:181-187`).
- **Dampak:** membatalkan SJ yang sudah "terkirim" mengembalikan stok seolah barang balik, padahal sudah di customer — bisa salah saldo bila dipakai keliru.

---

## DIAGRAM RANTAI GUDANG (kondisi NYATA)

```
                          [SP confirmed]  (sp_items.sp_status='confirmed')
                                 │  Aktor: operations (Gigih) — TAK ada role gudang
                                 │  Detail SP → "Generate Picking List"
                                 │  Gerbang: confirmed + belum ada picking aktif + outstanding>0
                                 ▼
┌── PICKING LIST (picking_lists.status) ─────────────────────────────────────────┐
  pending ──"Mulai"──► in_progress ──toggle item (qty_picked=full/0)──►
     (allPicked) ──"Selesaikan"──► done
  STOK: generate → RESERVED (LEAST(req,avail)); qty_requested=qty-shipped_qty
  Batalkan (pending/in_progress) → UNRESERVED + status=cancelled
  ⚠ sp_items TIDAK berubah.        Item→SP: picking_list_items.sp_item_id (FK)
└────────────────────────────────────────────────────────────────────────────────┘
                                 │  (status=done)  "Buat Surat Jalan"
                                 │  Gerbang: done + qty_picked>0 + belum ada SJ aktif
                                 │  [PACKING: material (outbound stok) + koli/berat — bukan entitas]
                                 ▼
┌── SURAT JALAN (delivery_notes.status) ─────────────────────────────────────────┐
  draft ──isi armada + "Berangkatkan"(butuh driver+vehicle)──► in_transit
        ──"Tandai Terkirim"──► delivered
  qty item SJ = qty_picked (editable saat draft)
  STOK dispatch: UNRESERVED (reservasi picking) + OUTBOUND (−qty SJ)
  STOK cancel (in_transit/delivered): INBOUND (reversal)
  ⚠ CELAH: cancel saat draft → TIDAK unreserve → reserved NYANGKUT (picking done tak bisa cancel)
  ⚠ sp_items TIDAK berubah di dispatch/delivered/cancel.
└────────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                          [Barang keluar / sampai]
     ◄──── JEMBATAN YANG SEHARUSNYA DIPASANG (belum ada) ────►
     Di dispatch_delivery: UPDATE sp_items.shipped_qty += delivery_note_items.qty
       via delivery_note_items.picking_list_item_id → picking_list_items.sp_item_id → sp_items.id
       (info sp_no + qty + sp_item_id semua tersedia saat dispatch)
     → tanpa ini, SP Manifest tetap Open/Outstanding meski barang sudah delivered.

RINGKAS: rantai gudang (picking_lists · delivery_notes · stock_ledger) lengkap & atomik
per-pulau, tapi (1) TAK menjembat balik ke sp_items, (2) hanya 1:1 aktif (no batch),
(3) punya celah reserved-nyangkut, dan (4) tanpa role gudang / gating role in-file.
```
