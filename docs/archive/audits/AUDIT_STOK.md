# AUDIT — Mesin Stok / Inventory (Storbit SOA)

> Read-only. Tidak ada file yang diubah; hanya dokumen ini dibuat. DB dari
> `supabase/schema_snapshot.sql` (kolom/FK/RPC/trigger/RLS/view diverifikasi, bukan
> tebakan). Data aktual TIDAK di-query — SQL SELECT disediakan untuk dijalankan manual.
> Entitas SOA `d2e5e565-…`; gudang default (Semper) `303c3d4c-…`.

---

## RINGKASAN

- **Stok bergerak OTOMATIS hanya di dua jalur:** (a) **Penerimaan Barang** → `inbound` (nambah), (b) **alur SP** (Generate Picking → `reserved`; Dispatch Surat Jalan → `unreserved` + `outbound`; plus material packing → `outbound`; berbagai reversal). Di luar itu **tak ada UI** yang menggerakkan stok — menu **Pengeluaran / Transfer / Opname-Adjustment = ComingSoon (stub)**, jadi `adjustment`/`transfer_in`/`transfer_out` **TIDAK ADA di kode** (hanya dari import SQL manual).
- **Angka stok berasal dari `stock_ledger` (ledger, satu baris per gerakan).** `products` **tidak punya kolom stok** → stok murni turunan ledger. `stock_summary` adalah **VIEW live** (bukan tabel/materialized) → **selalu sinkron** dengan ledger by construction; **tak bisa desync**.
- **Saat dispatch, on_hand BENAR-BENAR berkurang** (posting `outbound`), bukan sekadar pindah dari reserved. `reserved` & `on_hand` dua dimensi berbeda: dispatch melakukan **`unreserved` (reserved turun)** DAN **`outbound` (on_hand turun)**. `available = on_hand − reserved`.
- **Konsistensi struktural aman (view), tapi integritas NILAI rawan:** (1) **reserved nyangkut** bila Surat Jalan dibatalkan saat draft / picking done diterlantarkan (G-2, dipertegas di bawah), (2) **tak ada guard negatif/over-deduct** (bisa `available`/`on_hand` minus), (3) koreksi stok (opname/adjustment) hanya bisa lewat SQL manual, (4) RLS `stock_ledger`/`stock_summary` permissif + menu inventory `public` + Penerimaan tanpa gating role → **siapa pun login bisa nambah stok** & baca stok lintas company.

---

## STRUKTUR STOK

### `warehouses` (schema)
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid NOT NULL | **FK → companies** (RESTRICT, `schema:8707`) |
| `code`,`name` | varchar | UNIQUE `(company_id, code)` (`schema:5242`) |
| `city`,`address` | | |
| `is_active` | bool | |
- **RLS:** `warehouses_select USING(true)` (`schema:11193`) — semua user baca semua gudang; `warehouses_modify USING(is_super_admin())` (`schema:11186`) — hanya super_admin ubah.

### `stock_ledger` (LEDGER — 1 baris per gerakan) (schema)
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid NOT NULL | FK → companies RESTRICT (`schema:8507`) |
| `warehouse_id` | uuid NOT NULL | FK → warehouses RESTRICT (`schema:8531`) |
| `product_id` | uuid NOT NULL | **FK → products RESTRICT** (`schema:8523`) |
| `movement_type` | varchar(20) | **CHECK**: `inbound/outbound/adjustment/reserved/unreserved/transfer_in/transfer_out` |
| `qty` | int NOT NULL | positif utk masuk/reserved; RPC posting outbound pakai **negatif** (`-abs(qty)`) |
| `reference_type` | varchar(20) | `PO`/`ADJ`/`picking`/`delivery`/`picking_material`/`material_reverse`/`delivery_cancel` |
| `reference_id`,`reference_no` | | tautan ke picking/DN/material |
| `created_by`,`created_at`,`notes`,`location_detail`,`last_count_date` | | |
- **Ledger, bukan snapshot** — tiap gerakan = INSERT baris baru; tak pernah di-mutate untuk saldo.
- **RLS:** `select USING(true)` (`schema:11007`), `insert WITH CHECK(auth.uid() IS NOT NULL)` (`schema:10993`), `update USING(is_super_admin())` (`schema:11000`), **TIDAK ADA policy DELETE** → baris tak bisa dihapus via klien (immutable), tapi super_admin bisa UPDATE.

### `stock_summary` (VIEW, bukan tabel) (schema:3882-3908)
`CREATE VIEW public.stock_summary WITH (security_invoker='true')` — dihitung **live** dari `stock_ledger`, GROUP BY `product_id, warehouse_id, company_id`:
- `on_hand` = `Σ qty FILTER (movement_type IN inbound/outbound/adjustment/transfer_in/transfer_out)` (`schema:3886`)
- `reserved` = `Σ(reserved) − Σ(unreserved)` (abs) (`schema:3889-3893`)
- `available` = `on_hand − reserved` (`schema:3896-3902`)
- `last_count_date` = `max(last_count_date)`
- `security_invoker=true` → mengikuti RLS pemanggil atas `stock_ledger` (yang `USING(true)`).

### Relasi ke produk (pertanyaan 4)
- **Via `product_id` (FK), konsisten.** `stock_ledger.product_id → products.id` (`schema:8523`). `sp_items.product_id → products.id` juga (FK). `picking_list_items.product_id`, `delivery_note_items.product_id` idem. **Bukan** via `sku` teks. (Catatan: `sp_items` juga menyimpan `sku`/`product_name` snapshot, tapi tautan stok pakai `product_id`.) `products` **tak punya kolom qty/on_hand** — stok murni dari ledger.

---

## PETA GERAKAN STOK

| movement_type | Kapan | Aksi / tombol | RPC / writer (file:line) | reference_type |
|---|---|---|---|---|
| **inbound** | Konfirmasi Penerimaan Barang | "Konfirmasi" | **direct insert** `PenerimaanBarangPage.jsx:398-411` (`movement_type:'inbound'`) | `PO` atau `ADJ` |
| **reserved** | Generate Picking List | Detail SP "Generate Picking List" | `generate_picking_from_sp` (`schema:440-444`, `LEAST(req,avail)`) | `picking` |
| **unreserved** | Batalkan Picking | "Batalkan Picking" | `cancel_picking` (`schema:206-210`) | `picking` |
| **unreserved** | Berangkatkan (dispatch) | "Berangkatkan" | `dispatch_delivery` (`schema:275-279`) | `picking` |
| **outbound** | Berangkatkan (dispatch) | "Berangkatkan" | `dispatch_delivery` (`schema:281-285`, `-abs(dni.qty)`) | `delivery` |
| **outbound** | Tambah Material Packing | "Tambah" material | `add_picking_material` (`schema:63-65`, `-abs(qty)`) | `picking_material` |
| **inbound** (reversal) | Hapus Material | trash material | `delete_picking_material` (`schema:249-253`) | `material_reverse` |
| **inbound** (reversal) | Batalkan SJ **in_transit/delivered** | "Batalkan" | `cancel_delivery` (`schema:181-187`) | `delivery_cancel` |
| **adjustment** | — | Opname/Adjustment = **ComingSoon** | **TIDAK ADA di kode** (hanya import SQL manual) | — |
| **transfer_in/out** | — | Transfer Stok = **ComingSoon** | **TIDAK ADA di kode** | — |

**Catatan penting:**
- **Penerimaan "tipe Adjustment"** tetap menulis `movement_type='inbound'` (hanya `reference_type='ADJ'`) — `PenerimaanBarangPage:397,402`. Jadi **tak ada movement `adjustment` dari UI**; koreksi stok minus/opname **tak bisa** lewat aplikasi.
- **`StokBarangPage` TIDAK menulis stok** (grep `stock_ledger`/`movement_type` → nihil) — hanya tampil + edit lokasi rak.
- **`InventoryDashboardPage`** hanya **membaca** (`stock_summary × products × warehouses` + `stock_ledger` untuk grafik mingguan, `:491`).

### Urutan di alur SP (pertanyaan 6) — on_hand benar berkurang saat dispatch?
```
Generate Picking → reserved +Q         (on_hand TETAP; available −Q)
(complete picking → tak ada gerakan)
(generate SJ draft → tak ada gerakan)
Dispatch SJ      → unreserved +Q  DAN  outbound −Q
                   (reserved −Q kembali 0; on_hand −Q; available tetap turun karena on_hand turun)
```
→ **Ya, on_hand benar-benar berkurang saat dispatch** (posting `outbound` negatif), sekaligus melepas reserved. Bukan sekadar pindah reserved→outbound; keduanya dimensi terpisah di view.

### Penerimaan Barang (pertanyaan 7)
- Form `PenerimaanBarangPage` → `handleKonfirmasi` (`:387`) **insert langsung** ke `stock_ledger` (`:409-411`): satu baris `inbound` per produk (`company_id=SOA`, `warehouse_id` dipilih, `product_id`, `qty`, `reference_type` PO/ADJ, `reference_no=form.ref`). **Bukan lewat RPC.**
- **Siapa bisa:** menu `inventory` **`public: true`** (`App.jsx:612`) → semua user lihat; `inventory-penerimaan` **tanpa `role`**; halaman **tanpa gating in-file** (tak ada `useAuth`/`can`); RLS insert hanya butuh login. → **setiap user login bisa menambah stok**.

---

## KONSISTENSI & RISIKO

### 1. `stock_summary` vs `stock_ledger` — SELALU sinkron
`stock_summary` **VIEW** (bukan tabel/materialized) → dihitung ulang tiap query dari `stock_ledger`. **Tak ada tabel summary yang perlu di-maintain, tak ada trigger, tak bisa desync** "ledger nambah tapi summary ketinggalan". (Ini kelebihan desain.) Konsekuensi: tak ada cache — dashboard menghitung agregat live tiap load (beban query naik seiring ledger membesar; MEDIUM performa).

### 2. Bisa negatif / over-deduct? — YA, tak ada guard
- **Tak ada CHECK/clamp** yang mencegah `on_hand`/`available` negatif. `dispatch_delivery` posting `outbound = -abs(dni.qty)` (`schema:283`) memakai **`delivery_note_items.qty` yang bisa diedit** saat draft (`db.js:624`) — bisa melebihi yang di-pick/di-reserve → `on_hand` bisa minus.
- **Race pada reserve:** `generate_picking_from_sp` reserve `LEAST(req, avail)` (`schema:442`) tanpa row-lock/serialisasi → dua picking konkuren atas produk sama bisa **over-reserve** (Σreserved > on_hand) → `available` negatif.
- **Tak ada validasi** qty penerimaan (bisa 0/negatif? `qty` int, form pakai Number — nilai negatif tak diblok eksplisit di RPC; Penerimaan `Number(item.qty)`).

### 3. Reserved nyangkut (G-2) — di mana persis & seberapa besar
Reservasi (`reserved`) HANYA dilepas (`unreserved`) oleh **`cancel_picking`** (picking pending/in_progress) atau **`dispatch_delivery`**. Celah:
- **Batalkan SJ saat `draft`:** `cancel_delivery` hanya membalik bila status `in_transit`/`delivered` (`schema:181`) → untuk SJ **draft**, TIDAK ada `unreserved`. Picking sudah `done` → `cancel_picking` diblok (`schema:204` hanya pending/in_progress). → **reserved dari picking itu menggantung permanen.**
- **Picking `done` diterlantarkan** (tak pernah dibuat SJ): tak ada jalur `unreserved` untuk picking `done`. → reserved menggantung.
- **Besarnya:** setiap picking yang berakhir di kondisi ini menyumbang `Σ qty reserved` produknya ke `available` yang **understated permanen** (stok bayangan). Tak ada tombol pelepas. Besar persisnya = jumlahkan `reserved − unreserved` per picking yang berstatus `done`-tanpa-SJ-aktif atau `cancelled`-dengan-net-reserved>0 (lihat SQL di bawah).

### 4. Keamanan/akses (RLS)
- `stock_ledger select USING(true)` + `stock_summary security_invoker` + `warehouses select USING(true)` → **semua user login membaca stok semua company/gudang**. `insert` cukup login → **semua user bisa tambah stok**. `update` super_admin (bisa mengubah baris ledger historis — audit trail tak immutable terhadap super_admin). (Bagian dari AUDIT_E2E T-1.)

---

## SQL VERIFIKASI (jalankan manual — tidak dijalankan oleh audit)

```sql
-- (11a) On-hand & reserved & available per gudang (dari view)
SELECT w.code, w.name,
       SUM(s.on_hand)   AS on_hand,
       SUM(s.reserved)  AS reserved,
       SUM(s.available) AS available
FROM stock_summary s
JOIN warehouses w ON w.id = s.warehouse_id
GROUP BY w.code, w.name
ORDER BY w.code;

-- (11b) Jumlah baris & total qty per movement_type
SELECT movement_type, COUNT(*) AS rows, SUM(qty) AS sum_qty
FROM stock_ledger
GROUP BY movement_type
ORDER BY movement_type;

-- (11c) RESERVED MENGGANTUNG: net reserved per picking vs status picking-nya.
--   net>0 & status='cancelled'      → BOCOR (harusnya sudah unreserved)
--   net>0 & status='done'           → NYANGKUT (G-2: SJ dibatalkan draft / picking terlantar)
--   net>0 & status IN pending/in_progress → wajar (masih berjalan)
SELECT sl.reference_id AS picking_id,
       pl.status       AS picking_status,
       pl.sp_no,
       SUM(CASE WHEN sl.movement_type='reserved'   THEN sl.qty ELSE 0 END)
     - SUM(CASE WHEN sl.movement_type='unreserved' THEN sl.qty ELSE 0 END) AS net_reserved
FROM stock_ledger sl
LEFT JOIN picking_lists pl ON pl.id = sl.reference_id
WHERE sl.reference_type = 'picking'
GROUP BY sl.reference_id, pl.status, pl.sp_no
HAVING SUM(CASE WHEN sl.movement_type='reserved'   THEN sl.qty ELSE 0 END)
     - SUM(CASE WHEN sl.movement_type='unreserved' THEN sl.qty ELSE 0 END) <> 0
ORDER BY picking_status, net_reserved DESC;

-- (11d) Total qty reserved yang NYANGKUT (picking done/cancelled tapi net_reserved>0)
SELECT COALESCE(SUM(net),0) AS total_qty_reserved_nyangkut
FROM (
  SELECT sl.reference_id,
         SUM(CASE WHEN sl.movement_type='reserved'   THEN sl.qty ELSE 0 END)
       - SUM(CASE WHEN sl.movement_type='unreserved' THEN sl.qty ELSE 0 END) AS net,
         pl.status
  FROM stock_ledger sl LEFT JOIN picking_lists pl ON pl.id = sl.reference_id
  WHERE sl.reference_type='picking'
  GROUP BY sl.reference_id, pl.status
) t
WHERE t.status IN ('done','cancelled') AND t.net > 0;

-- (12a) Integritas nilai: adakah stok NEGATIF (indikasi over-deduct / over-reserve)?
SELECT s.*, p.name, w.code AS wh
FROM stock_summary s
JOIN products p   ON p.id = s.product_id
JOIN warehouses w ON w.id = s.warehouse_id
WHERE s.on_hand < 0 OR s.available < 0 OR s.reserved < 0
ORDER BY s.available;

-- (12b) Cek view vs hitung-ulang ledger (harus SELALU cocok karena summary = view).
--   Baris hasil = 0 → konsisten. (Kalau >0, ada anomali definisi/GROUP.)
SELECT s.product_id, s.warehouse_id, s.on_hand,
       l.on_hand_ledger
FROM stock_summary s
JOIN (
  SELECT product_id, warehouse_id,
         SUM(qty) FILTER (WHERE movement_type IN
           ('inbound','outbound','adjustment','transfer_in','transfer_out')) AS on_hand_ledger
  FROM stock_ledger
  GROUP BY product_id, warehouse_id
) l ON l.product_id = s.product_id AND l.warehouse_id = s.warehouse_id
WHERE s.on_hand IS DISTINCT FROM l.on_hand_ledger;

-- (12c) Rincian gerakan 1 produk (audit manual): ganti :pid & :wid
SELECT created_at, movement_type, qty, reference_type, reference_no
FROM stock_ledger
WHERE product_id = :pid AND warehouse_id = :wid
ORDER BY created_at;
```

---

## TEMUAN

### S-1 (HIGH) — Reserved bisa nyangkut permanen (stok bayangan) — G-2 di level stok
Reservasi tak dilepas saat SJ dibatalkan `draft` (`cancel_delivery` guard `schema:181`) dan picking `done` tak bisa `cancel_picking` (`schema:204`).
- **Dampak:** `available` produk turun permanen tanpa barang benar-benar keluar → stok "hilang" ke reserved; picking berikutnya bisa dianggap kurang stok padahal ada. Tak ada UI pelepas. Besarnya = SQL (11d).
- **Bukti:** `schema:181,204`; tak ada `unreserved` untuk picking `done`.

### S-2 (HIGH) — Tak ada guard negatif / over-deduct + race pada reserve
`on_hand`/`available` tak ada CHECK ≥0; `dispatch` outbound pakai `dni.qty` editable (`db.js:624`, `schema:283`); `generate_picking` reserve tanpa lock (`schema:442`).
- **Dampak:** stok bisa minus (over-ship qty diedit), atau over-reserve saat dua picking konkuren → `available` negatif menyesatkan.
- **Bukti:** definisi view (tanpa clamp), `schema:283/442`, `db.js:624`.

### S-3 (HIGH) — Penerimaan/stok tanpa gating role; RLS permissif → siapa pun tambah/baca stok
Menu `inventory` `public:true` (`App.jsx:612`); `PenerimaanBarangPage` tanpa cek role; `stock_ledger insert` cukup login (`schema:10993`); `select USING(true)`.
- **Dampak:** user mana pun (viewer/sales) bisa **menambah stok** (inbound fiktif) & membaca stok lintas company. Melanggar AGENTS.md §Security (scope company/role).

### S-4 (MEDIUM) — Tak ada koreksi stok via aplikasi (Opname/Adjustment & Pengeluaran & Transfer = ComingSoon)
`adjustment`/`transfer_in`/`transfer_out` **tak pernah ditulis kode** (hanya import SQL); menu Opname/Pengeluaran/Transfer stub (tak di exclusion `App.jsx:2616`).
- **Dampak:** salah input/opname fisik **tak bisa dikoreksi** dari UI; stok minus (S-2) atau nyangkut (S-1) tak ada jalan perbaikan selain SQL manual super_admin. Stok-keluar non-SP (mis. rusak/sample) tak terekam.

### S-5 (MEDIUM) — `stock_summary` view tanpa cache; agregat dihitung live tiap load
View meng-agregasi seluruh `stock_ledger` tiap query (dashboard `InventoryDashboardPage`, `getStockForProducts`).
- **Dampak:** seiring ledger membesar, query stok melambat; tak ada index/materialized untuk agregat. (Performa; AGENTS.md §Performance "materialized view untuk dashboard berat".)

### S-6 (MEDIUM) — Penerimaan "tipe Adjustment" tetap `inbound`; tak bisa mengurangi
`PenerimaanBarangPage:397,402` — `reference_type='ADJ'` tapi `movement_type='inbound'` selalu.
- **Dampak:** "Adjustment" via Penerimaan hanya bisa **menambah**, menyesatkan sebagai fitur koreksi (tak bisa adjust turun).

### S-7 (LOW) — `stock_ledger` bisa di-UPDATE super_admin (audit trail tak fully immutable)
`stock_ledger_modify USING(is_super_admin())` (`schema:11000`); tak ada policy DELETE (baris tak terhapus, tapi bisa diubah).
- **Dampak:** super_admin bisa mengubah qty/tipe baris historis → riwayat stok bisa dimanipulasi tanpa jejak koreksi (idealnya ledger append-only + baris koreksi).

---

## DIAGRAM ALIRAN STOK (kondisi NYATA)

```
                         [ products ]  (tak punya kolom stok — semua dari ledger)
                                 ▲ product_id (FK)
                                 │
   PENERIMAAN BARANG ───────────┼───────────────────────────────────────────────
   Aktor: siapa pun login (menu public, tanpa role)                              
   "Konfirmasi" → INSERT stock_ledger  movement_type='inbound' (+qty)            
     ref_type = PO | ADJ   (PenerimaanBarangPage:402,409)                        
                                 │                                               
                                 ▼                                               
                        ┌────────────────────┐                                   
                        │  GUDANG (Semper …)  │  on_hand = Σ(inbound/outbound/adj/transfer) 
                        │  stock_ledger rows  │  reserved = Σreserved − Σunreserved         
                        └────────┬───────────┘  available = on_hand − reserved   (VIEW live)
                                 │                                               
        ── ALUR SP ─────────────┼──────────────────────────────────────────────
                                 │                                               
  Generate Picking  ───────────► reserved +Q   (available −Q; on_hand tetap)     
     generate_picking_from_sp (schema:442)                                       
                                 │                                               
  Tambah Material   ───────────► outbound −Q   (on_hand −Q)  [packing]           
     add_picking_material (schema:65)                                            
                                 │                                               
  Berangkatkan (dispatch) ─────► unreserved +Q  DAN  outbound −Q                 
     dispatch_delivery (schema:277,283)   → on_hand −Q, reserved kembali 0        
                                 │                                               
  Batalkan Picking (pending/inprog) ─► unreserved +Q  (lepas reservasi)          
     cancel_picking (schema:208)                                                 
                                 │                                               
  Batalkan SJ (in_transit/delivered) ─► inbound +Q (reversal outbound)           
     cancel_delivery (schema:184)                                                
                                 │                                               
  ⚠ Batalkan SJ (DRAFT) / Picking done terlantar ─► TIDAK ADA unreserved          
     → reserved NYANGKUT permanen (available understated)   [S-1]                 
                                                                                 
  ✗ adjustment / transfer_in / transfer_out / pengeluaran non-SP                 
     → TIDAK ADA di kode (menu ComingSoon; hanya import SQL manual)  [S-4]        
```

**Ringkas:** `stock_ledger` = sumber tunggal (append-only via klien), `stock_summary` = view yang **selalu konsisten** dengannya. Stok **otomatis & benar** untuk jalur happy-path (terima → reserve → dispatch/outbound). Risiko bukan di sinkronisasi summary, melainkan di **nilai**: reserved nyangkut (S-1), tak ada guard negatif/race (S-2), tak ada koreksi/opname via UI (S-4), dan akses stok terlalu terbuka (S-3).
