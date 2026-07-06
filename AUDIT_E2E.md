# AUDIT E2E — Siklus Hidup Storbit SP (Logistics / SOA)

> Read-only. Tidak ada file yang diubah; hanya dokumen ini dibuat. DB dibaca dari
> `supabase/schema_snapshot.sql` (kolom/trigger/function/policy diverifikasi, bukan tebakan).
> Entitas: SOA/Storbit `d2e5e565-5f67-4954-b8d9-5979a2a0c697`. Gudang default `303c3d4c-…`.

---

## RINGKASAN EKSEKUTIF

Sistem SP Storbit saat ini adalah **kumpulan tiga alur yang secara data SALING TERPUTUS**, bukan satu siklus hidup yang menyatu. (1) **Lifecycle SP** (`sp_items.sp_status`: draft→confirmed→cancelled) hanya digerakkan MANUAL oleh tombol Konfirmasi/Tolak di SP Manifest. (2) **Fulfillment/Outstanding** dihitung di frontend dari `sp_items.shipped_qty`, yang HANYA bisa diisi manual lewat form (ShipmentModal/FormModal) — **tak ada satu pun proses gudang/pengiriman yang menulisnya**. (3) **Rantai gudang** (Picking List → Surat Jalan → dispatch/delivered) punya status sendiri di tabel `picking_lists`/`delivery_notes` + gerakan `stock_ledger`, dan **tidak pernah menyentuh `sp_items`**. Akibatnya: SP yang benar-benar sudah dikirim & sampai (delivered di Surat Jalan) tetap tampil **Open/Outstanding** di SP Manifest, dan SP `draft` yang di-set `shipped_qty` penuh tampil **CLOSED**. Rantai gudang cukup lengkap & fungsional (start/pick/complete/generate SJ/dispatch/cancel, semua atomik via RPC SECURITY DEFINER dengan gerakan stok benar), tapi **semua RLS tabel alur ini `USING(true)`** → semua user login bisa baca/tulis SP, picking, surat jalan, AR, stok LINTAS customer & entitas. **Tidak ada notifikasi apa pun** (email/in-app/WA), **tidak ada role gudang**, dan **tidak ada alur request ke procurement**. Sisi Finance (invoice/faktur/submit) hanyalah **toggle boolean manual** di `sp_items` + tracker AR manual (`ar_ttfs`), bukan penerbitan dokumen. Dari 10 langkah lapangan, **0 didukung penuh end-to-end**; mayoritas didukung sebagian (input digital ada, tapi handoff & sinkronisasi status manual/terputus).

---

## PETA HALAMAN & TOMBOL

Legenda kolom: **Tombol | Siapa boleh (gating IN-FILE) | Efek | Data (kolom/tabel) | RPC/DB | Berfungsi?**
Catatan: gating **menu** (App.jsx) terpisah dari gating **in-file**; lihat bagian PERAN.

### 1. SP Manifest / Sales Order (`SalesOrderPage.jsx`) — menu `manifest`
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| **Konfirmasi** (`:158`) | tak ada cek in-file (muncul saat `dstatus==='OPEN'`) | SP→confirmed | `sp_status,confirmed_at,confirmed_by` | RPC `set_sp_status` (`db.js:330`→`schema:900`) | ✅ |
| **Tolak** (`:159`) | idem (wajib alasan `:442`) | SP→cancelled | `sp_status,cancelled_at/by,cancel_reason` | RPC `set_sp_status` | ✅ |
| **Manifest** (`:164`) | muncul saat `dstatus==='MANIFEST'` | — | — | `handleManifest` `:465` toast only | ❌ **STUB** |
| Baris klik → Detail (`:643`) | semua | buka Detail SP | — | prop `onSelectSP` | ✅ |
| Input SP (`:494`) | semua yang lihat halaman | buka Input SP | — | prop `onAddSP` | ✅ |
| Export CSV (`:593`) | semua | unduh CSV | baca `enrichedRows` | `onExport` (`App.jsx exportCSV`) | ✅ |
| Filter/tab/sort/search/Overdue | semua | filter client-side | — | in-memory | ✅ |

### 2. Input SP (`InputSPPage.jsx`) — menu `input`
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| **Submit SP** (`:534`, handler `:213`) | tak ada cek in-file | insert SP (validasi ketat) | insert `sp_items` (+`sp_btbs` best-effort `:207`) | `bulkInsertSpItems`→`spToDb` (`db.js:302,58`) | ✅ (TAPI tak set `sp_status` → default `draft`) |
| **Simpan Draft** (`:519`, handler `:219`) | tak ada cek in-file | insert SP (validasi longgar) | **sama** `doInsert` (`:230`) | idem | ✅ (identik Submit; beda hanya validasi) |
| Tambah/Hapus item, ProductPicker | — | edit form lokal | — | — | ✅ |

**Catatan:** No SP = timestamp klien `SP-${Date.now().toString().slice(-6)}` (`InputSPPage:184`) — **bukan** RPC numbering (TODO `:12`). `shipped_qty` tak di-set (default 0).

### 3. Detail SP (`SalesOrderDetailPage.jsx`) — dibuka dari Manifest
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| **Generate Picking List** (`:797`) | muncul HANYA bila `group.spStatus==='confirmed'`; tak ada cek role | buat picking | baca `sp_items`; tulis `picking_lists`,`picking_list_items`,`stock_ledger(reserved)` | RPC `generate_picking_from_sp` (`db.js:357`→`schema:390`) | ✅ |
| **Tambah BTB** (`:1020`) | tak ada cek role | catat no BTB | insert `sp_btbs` | `addSpBtb` (`db.js:781`) | ✅ |
| **Hapus BTB** (`:989`) | tak ada cek role | hapus BTB | **hard-delete** `sp_btbs` | `deleteSpBtb` (`db.js:793`) | ✅ |
| **Simpan** dokumen link (`:1208`) | tak ada cek role | set link Drive | `sp_items.external_url` (semua baris sp_no) | `setSpExternalUrl` (`db.js:341`) | ✅ |
| **Edit item** / header Edit (`:1127`/`:811`) | per-item: `super_admin/operations/manager/gm`; header Edit: tak ada cek | edit baris SP | update `sp_items` (banyak kolom; `shippedQty` **readOnly** `:343`) | `onSaveItem`→`dbSaveRow`→`spToDb` | ✅ |
| **Hapus item** (`:1136`) | `super_admin` | hard-delete baris | delete `sp_items` | `onDeleteItem`→`dbRemoveRow` | ✅ |
| **Delete entire SP** (`:1259`) | `super_admin/operations` | hard-delete semua baris | delete `sp_items` | `onDeleteSP`→`dbRemoveRowsBySp` | ✅ |
| **Shipment** per item (`:1115`) | — | — | — | toast only | ❌ **STUB** |
| **Finance** per item (`:1121`) | — | — | — | toast only | ❌ **STUB** |
| **+ Tambah Shipment** (tab, `:1165`) | — | — | — | toast only | ❌ **STUB** |
| Cetak/PDF, Kembali | semua | — | — | — | ✅ |

### 4. Picking List (`PickingListPage.jsx` + `PickingListDetailPage.jsx`) — menu `picking`
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| **Mulai Pengambilan** (detail `:466`) | tak ada cek role; muncul saat `status==='pending'` | pending→in_progress | `picking_lists.status,started_at` | `startPicking` (`db.js:443`, update langsung) | ✅ |
| **Toggle item picked** (`:321`) | disabled bila `locked`(done/cancelled) | set item picked; `qty_picked`=qty_requested/0 | `picking_list_items.status,qty_picked` | `setPickingItemPicked` (`db.js:429`) | ✅ (all-or-nothing per item) |
| **Selesaikan Picking** (`:482`) | muncul saat `in_progress && allPicked` | in_progress→done | `picking_lists.status,completed_at` | `completePicking` (`db.js:454`) | ✅ |
| **Buat Surat Jalan** (`:499`) | muncul saat `status==='done'` | buat SJ | tulis `delivery_notes`,`delivery_note_items` | prop→`generateDeliveryFromPicking` (`db.js:500`→`schema:341`) | ✅ |
| **Batalkan Picking** (`:510`) | muncul saat pending/in_progress | →cancelled + unreserve stok | `picking_lists.status`; `stock_ledger(unreserved)` | RPC `cancel_picking` (`db.js:467`→`schema:196`) | ✅ |
| **Tambah/Hapus Material** (`:409`/`:437`) | hanya bila `status==='done' && !has_delivery` | catat material + gerak stok | `picking_list_materials`; `stock_ledger(outbound/inbound)` | RPC `add/delete_picking_material` (`schema:40/239`) | ✅ |
| **Buat Picking Baru** (`:526`) | muncul saat cancelled | ke Detail SP | — | prop `onGoToSp` | ✅ |
| Cetak Picking List PDF (`:459`) | semua | unduh PDF | — | client PDF | ✅ |
| Kolom **PIC** (list `:192`) | — | — | placeholder `—` ("Fase 5 role gudang") | — | ❌ tak ada |

### 5. Surat Jalan (`DeliveryNotePage.jsx` + `DeliveryNoteDetailPage.jsx`) — menu `surat-jalan`
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| **Simpan Info Armada** (`:254`) | tak ada cek role; form aktif bila `!locked` | isi driver/vehicle/koli/berat/alamat | update `delivery_notes` (armada cols) | `updateDeliveryArmada` (`db.js:532`) | ✅ |
| Item qty edit/hapus/tambah (`:285/:294/:322`) | hanya bila `status==='draft'` | edit item SJ | `delivery_note_items` | `updateDeliveryItemQty`/`deleteDeliveryItem`/`addDeliveryItem` (`db.js:624/632/638`) | ✅ |
| **Berangkatkan** (dispatch, `:341`) | muncul saat `draft`; disabled bila tanpa driver+vehicle | draft→in_transit; unreserve+outbound stok | `delivery_notes.status,dispatched_at`; `stock_ledger` | RPC `dispatch_delivery` (`db.js:539`→`schema:262`) | ✅ |
| **Tandai Terkirim** (`:348`) | muncul saat `in_transit` | in_transit→delivered | `delivery_notes.status,delivered_at` | update langsung (`db.js:546`, **tanpa** efek stok/SP) | ✅ |
| **Batalkan** (`:354`) | muncul saat draft/in_transit | →cancelled + reversal stok bila sudah dispatch | `delivery_notes.status`; `stock_ledger(inbound)` | RPC `cancel_delivery` (`db.js:554`→`schema:172`) | ✅ |
| Cetak PDF SJ (`:335`) | semua | unduh PDF | — | client PDF | ✅ |

### 6. Pengiriman SP (`ShipmentPage`+`ShipmentModal`, App.jsx) — menu `shipment`
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| Baris → **Update Shipment** (`App.jsx:2750`) | buka modal bila `can(role,'shipment')` | edit pengiriman | — | `setShipmentRow` | ✅ |
| **Save** (`ShipmentModal`, `App.jsx:4514`) | — | tulis `shipped_qty` (bebas), shippingDate, dc, notes | update `sp_items.shipped_qty,shipping_date,dc,notes` | `handleSave`→`dbSaveRow`→`spToDb` (`db.js:69`) | ✅ (**satu-satunya penulis `shipped_qty` yang nyata**) |

### 7. Finance (`FinanceModal`/`FinancePage`/`OutstandingPage`, App.jsx) — menyentuh SP
| Tombol | Siapa boleh | Efek | Data | RPC/DB | Berfungsi? |
|---|---|---|---|---|---|
| Baris → Finance (`App.jsx:2755/3324`) | `can(role,'finance')` | buka `FinanceModal` | — | `setFinanceRow` | ✅ |
| **Save** (`FinanceModal`, `App.jsx:4535-4569`) | — | toggle Invoice/Faktur/Submit/Kirim + tanggal | update `sp_items.inv,fp,submit,kirim,submit_date,email_status,notes` | `handleSave`→`spToDb` | ✅ (flag manual, **bukan** penerbitan invoice) |
| AR TTF (`ar_ttfs`/`ar_btbs`) | `can(role,'finance')` (menu `ar`) | tracker invoice/pembayaran manual | `ar_ttfs`(no_inv,no_sp,tgl…)+`ar_btbs`(dpp,pph,payment) | `insertTtf/updateTtf` (`db.js:657`) | ✅ (manual; link ke SP via `no_sp` TEKS, tanpa FK) |

---

## DATA LINEAGE (angka/label yang ditampilkan → sumbernya)

### SP Manifest (`SalesOrderPage`)
| Ditampilkan | Sumber |
|---|---|
| **Status pill** | hitung FE `toDesignStatus` (`:72`) = gabung `sp_status` (DB) **+** fulfillment `Open/Partial/Closed` (hitung FE dari `qty`vs`shipped_qty`, `spCalc.js:26-28`; fulfillment MENIMPA `sp_status`) |
| Total Qty | Σ `qty` (`App.jsx:185`) — DB |
| **Outstanding** | Σ (`qty - shipped_qty`) (`spCalc.js:24`,`App.jsx:187`) — DB, hitung FE |
| **Expired** | kolom `sp_items.expired_date` (`db.js:27`; `exp_date` TIDAK dipakai) |
| Overdue (merah/amber) | `isOverdue` = `expired_date < today && !Closed` (`spCalc.js:30-36`) |
| Grand Total | `unit_price*qty + shipping + PPN11%` (`spCalc.js:19-22`) — hitung FE |
| Tab counts (437/2/0/346) | length `augmented` per `dstatus` (`:351-356`) — semua customer (fetch tanpa filter) |

### Detail SP
| Ditampilkan | Sumber |
|---|---|
| Header status badge (`headerStatus`) | hitung FE precedence cancelled>Closed>Partial>confirmed>Open (`:737`) |
| Stok kurang/cukup badge | `getStockForProducts`→view `stock_summary` (`db.js:562`) |
| BTB list | `sp_btbs` by `sp_no` (`db.js:771`) |
| Dokumen link | `sp_items.external_url` (`db.js:341` baca via spFromDb `:50`) |
| Shipped per item | `sp_items.shipped_qty` (readOnly) |

### Picking List / Surat Jalan
| Ditampilkan | Sumber |
|---|---|
| Status picking | kolom DB `picking_lists.status` (pending/in_progress/done/cancelled) — langsung |
| Customer (picking) | resolve FE `sp_no→accounts.name` (`db.js:394`), tak disimpan di picking |
| Status SJ | kolom DB `delivery_notes.status` (draft/in_transit/delivered/cancelled) — langsung |
| Customer/alamat SJ | **snapshot** di `delivery_notes.customer_name/destination_address` saat generate (`schema:363-373`) |

---

## MODEL STATUS

**Semua field yang menyimpan status/state SP + pengisinya:**
| Field (tabel) | Nilai | Pengisi | Dari tombol/proses | Auto/Manual |
|---|---|---|---|---|
| `sp_items.sp_status` | draft/confirmed/cancelled | RPC `set_sp_status` | Konfirmasi/Tolak (SP Manifest) | **Manual** |
| `sp_items.confirmed_at/by` | timestamp/uid | RPC `set_sp_status` (`schema:914-915`) | Konfirmasi | Manual(auto-stamp) |
| `sp_items.cancelled_at/by,cancel_reason` | | RPC `set_sp_status` | Tolak | Manual |
| `sp_items.shipped_qty` | int | `spToDb` | **ShipmentModal**/FormModal/CSV | **Manual** (tak ada proses gudang yang isi) |
| `sp_items.inv,fp,submit,kirim` | bool | `spToDb` | FinanceModal / FormModal / EditItemModal | **Manual** |
| `sp_items.submit_date,email_status` | date | idem | FinanceModal | Manual |
| `sp_items.arrival_date` | date | `spToDb` | EditItemModal (`SalesOrderDetailPage`) | Manual |
| `sp_items.external_url` | text | `setSpExternalUrl` | Detail SP "Simpan" dokumen | Manual |
| `sp_btbs (sp_no,btb_no)` | rows | `addSpBtb` | Detail SP "Tambah BTB" | Manual |
| `picking_lists.status` | pending/in_progress/done/cancelled | startPicking/completePicking/cancel_picking | tombol Picking | Manual(+auto stamp) |
| `delivery_notes.status` | draft/in_transit/delivered/cancelled | generate/dispatch/deliver/cancel | tombol Surat Jalan | Manual(+auto stamp) |
| `stock_ledger` movements | reserved/unreserved/outbound/inbound | RPC picking/delivery | generate/dispatch/cancel/material | **Auto** (side-effect RPC) |
| `ar_ttfs/ar_btbs` | invoice/pembayaran | insert/updateTtf | halaman AR | Manual |

**Kondisi bisnis vs kemampuan sistem membedakan:**
| Kondisi bisnis | Bisa dibedakan? | Di mana |
|---|---|---|
| Baru masuk / belum dikonfirmasi | ✅ | `sp_status=draft` |
| Dikonfirmasi | ✅ | `sp_status=confirmed` |
| Ditolak | ✅ | `sp_status=cancelled` |
| Sedang di-picking / packing | ✅ tapi **terpisah** | `picking_lists.status` (tak nyambung ke SP Manifest) |
| **Dikirim (in transit)** | ✅ tapi **terpisah & tak tampil di Manifest** | `delivery_notes.status=in_transit`; `sp_items` tak berubah |
| **Sampai customer (delivered)** | ✅ tapi **terpisah & tak tampil di Manifest** | `delivery_notes.status=delivered`; `sp_items` tak berubah |
| BTB terbit | ⚠️ hanya "ada/tidak" | rows `sp_btbs` (bukan status) |
| Invoiced / faktur / submitted | ⚠️ flag manual, tak di pill | `inv/fp/submit` bool + AR |
| Lunas/pembayaran | ✅ terpisah | `ar_ttfs/ar_btbs` (tracker manual) |

→ Kondisi tersebar di **≥5 penyimpanan terputus**; SP Manifest (pill) hanya menyatukan `sp_status`+fulfillment, sehingga **tak bisa** menampilkan "dikirim/sampai/invoiced".

---

## GATING & DEPENDENCY

| Aksi | Syarat | Dicek di mana |
|---|---|---|
| Generate Picking (Detail SP) | `sp_status='confirmed'` | **FE** `SalesOrderDetailPage:797` **& DB** `generate_picking_from_sp` `schema:400` (RAISE bila bukan confirmed) |
| Generate Picking (idempotensi) | belum ada picking non-cancelled | **DB** `schema:402` |
| Selesaikan Picking | `in_progress` & SEMUA item picked | **FE** `PickingListDetailPage:482` (allPicked) |
| Tambah Material | picking `done` & belum ada SJ | **FE** `:358/375` **& DB** `add_picking_material` `schema:52-54` |
| Buat Surat Jalan | picking `done`, ada `qty_picked>0` | **FE** `:499` **& DB** `generate_delivery_from_picking` `schema:356,361` |
| Berangkatkan (dispatch) | SJ `draft` + driver+vehicle terisi | **FE** `DeliveryNoteDetailPage:340-341` **& DB** `dispatch_delivery` `schema:271` |
| Tandai Terkirim | SJ `in_transit` | **FE** `:347` (DB update polos, tanpa guard) |
| Batalkan Picking | picking pending/in_progress | **DB** `cancel_picking` `schema:204` |
| Batalkan SJ | SJ bukan cancelled | **DB** `cancel_delivery` `schema:180` |

**Syarat yang SEHARUSNYA ada tapi TIDAK ADA (temuan):**
| Aksi | Syarat hilang | Bukti |
|---|---|---|
| Isi `shipped_qty` (ShipmentModal/FormModal) | butuh `sp_status='confirmed'` | tak ada cek; `App.jsx:4514/4371`, ShipmentPage filter pakai fulfillment `:4032` |
| Delivered/dispatch Surat Jalan | seharusnya menutup `shipped_qty`/status SP | tak ada penulisan `sp_items` (`schema` dispatch/deliver) |
| Konfirmasi/Tolak SP | otorisasi role/kepemilikan | RPC `set_sp_status` tanpa cek role (`schema:900`) |
| Semua RPC picking/delivery | otorisasi role/company | SECURITY DEFINER tanpa cek (kecuali `bulk_update_product_prices`) |
| Input SP nomor | numbering RPC | pakai `Date.now()` (`InputSPPage:184`) |

---

## RLS PER TABEL

| Tabel | Policy (SELECT/INSERT/UPDATE/DELETE) | Scoped? | Risiko |
|---|---|---|---|
| `sp_items` | semua `USING(true)`/`WITH CHECK(true)` (`schema:10918-10939`) | ❌ | Semua user baca/tulis/hapus SP semua customer & entitas |
| `sp_btbs` | read/delete `USING(true)`; insert/update `auth.uid() IS NOT NULL` (`schema:10884-10905`) | ❌ | idem (hanya syarat login) |
| `picking_lists` | semua `USING(true)` (`schema:10358-10379`) | ❌ | lintas |
| `picking_list_items` | semua `USING(true)` (`schema:10386-10407`) | ❌ | lintas |
| `picking_list_materials` | semua `USING(true)` (`schema:10414-10435`) | ❌ | lintas |
| `delivery_notes` | semua `USING(true)` (`schema:9321-9342`) | ❌ | lintas |
| `delivery_note_items` | semua `USING(true)` (`schema:9349-9370`) | ❌ | lintas |
| `product_warehouse_location` | semua `USING(true)` (`schema:10570-10591`) | ❌ | lintas |
| `stock_ledger` | select `USING(true)`, insert `auth.uid() IS NOT NULL`, **update `is_super_admin()`** (`schema:10993-11007`) | ⚠️ sebagian | baca/insert bebas; update super only |
| `ar_ttfs` | semua `USING(true)` (`schema:8969-8990`) | ❌ | data AR/keuangan lintas customer terbaca semua user |
| `ar_btbs` | read/insert/delete `USING(true)` (`schema:8942-8956`) | ❌ | idem |
| `stock_summary` (view) | `security_invoker=true` → ikut `stock_ledger` (USING true) | ❌ | lintas |

**Semua tabel inti alur SP = permissive.** Tak ada scoping `company_id`/role/`deleted_at`. Bertentangan langsung dengan AGENTS.md §Security (RLS wajib company-scoped, role-aware) & CLAUDE.md.

---

## NOTIFIKASI & PERAN

**Notifikasi: TIDAK ADA di alur ini.** `grep notifications/notif` pada `src/modules/logistics/` & `db.js` → 0 hasil. Handoff ops→gudang→driver→finance→customer semuanya **manual/di luar sistem** (email/WA pribadi). (Tabel `notifications` dipakai modul CRM/HRGA, bukan di alur SP.)

**Peran (13 ERP roles, `App.jsx:260-273` / `AuthContext ERP_ROLE_PRIORITY`):** super_admin, admin, ceo, gm, manager, finance_controller, finance, operations, sales, procurement, hrga, it, viewer.
- **Role gudang/warehouse: TIDAK ADA.** Kolom PIC picking = placeholder "Fase 5 role gudang" (`PickingListPage:192`). Staf gudang praktis pakai role **`operations`**.
- **Procurement: role ADA**, tapi **TIDAK ADA alur** "request ke procurement" dari SP/picking saat stok kurang (langkah 3 lapangan) — badge stok-kurang hanya informasional, tak memicu apa pun.
- Menu gating logistics: `input`/`shipment` = super_admin/admin/ceo/gm/manager/operations/sales; `picking`/`surat-jalan` = super_admin/admin/ceo/gm/manager/operations. Finance modal = `can(role,'finance')`.
- **In-file role gating**: hanya Detail SP (edit/hapus item/SP). Manifest, Input SP, Picking, Surat Jalan, Pengiriman SP → **0 cek role in-file** (andalkan menu + RLS, dan RLS permissif).

---

## PERBANDINGAN 10 LANGKAH LAPANGAN vs SISTEM

| # | Langkah lapangan | Status sistem |
|---|---|---|
| 1 | SP via email → upload Drive | ⚠️ **Sebagian** — ada field link Drive (`external_url`, Detail SP Dokumen tab); upload/terima email manual di luar sistem. Tak ada ingest email. |
| 2 | Gigih input/update manifest | ⚠️ **Sebagian** — Input SP + Detail SP edit ada; tapi No SP `Date.now()` (bukan standar), `sp_status` default draft, banyak field manual. |
| 3 | Cek stok → picking / request procurement | ⚠️ **Sebagian** — cek stok ✅ (`stock_summary`), generate picking ✅ (butuh confirmed). "Request procurement bila kurang" = **TIDAK ADA** (badge informasional saja). |
| 4 | Picking dikirim ke gudang → packing | ⚠️ **Sebagian** — Picking List digital ✅ (start/pick/complete). "Dikirim ke gudang" = **tak ada notif/assignment** (PIC placeholder). |
| 5 | Gudang bikin packing list + surat jalan | ✅ **Didukung** — Material Packing + Generate Surat Jalan + PDF. (Aktor = operations, bukan role gudang.) |
| 6 | Pesan armada, kirim → update status manifest | ⚠️ **Sebagian** — isi armada + Berangkatkan (dispatch) ✅ di Surat Jalan; **tapi status Manifest SP TIDAK ikut berubah** (terputus). "Pesan armada" manual. |
| 7 | Barang sampai → FU BTB | ⚠️ **Sebagian** — "Tandai Terkirim" (delivered) ✅ di SJ; FU & entri BTB manual (`sp_btbs`); tak nyambung ke status SP. |
| 8 | BTB ready → update manifest (tgl terima, status) | ⚠️ **Sebagian** — field `arrival_date`+BTB ada (manual, EditItemModal/Tambah BTB); bukan status; tak ada otomasi. |
| 9 | El bikin invoice, faktur, surat jalan | ⚠️ **Sebagian** — Surat Jalan ✅ (sistem); invoice/faktur = **hanya toggle boolean** `inv/fp` (bukan dokumen); AR tracker manual. |
| 10 | El submit invoice+faktur → update tgl submit | ⚠️ **Sebagian** — toggle `submit` + `submit_date` + `email_status` manual; submit ke sistem Indomarco di luar. |

**Didukung penuh end-to-end: 0/10.** Satu langkah (5) tergolong didukung, sisanya sebagian; tak ada yang benar-benar otomatis/tersambung lintas tahap.

---

## TEMUAN (urut paling parah)

### T-1 (CRITICAL) — RLS `USING(true)` di SELURUH tabel alur SP
`sp_items`, `sp_btbs`, `picking_lists/items/materials`, `delivery_notes/items`, `product_warehouse_location`, `ar_ttfs/ar_btbs`, `stock_ledger`(read/insert) semua permissive (`schema:8942-11007`).
- **Dampak:** setiap user login (mis. sales entitas lain, viewer) bisa **membaca & menulis & menghapus** SP, picking, surat jalan, **data AR/keuangan**, dan stok **lintas customer & lintas entitas**. Melanggar AGENTS.md rule 3/4/5 & §Security.
- **Kenapa parah:** kebocoran + manipulasi data bisnis lintas-tenant, tanpa jejak. Diperkuat oleh RPC SECURITY DEFINER tanpa cek otorisasi (set_sp_status, generate_picking, dispatch_delivery, dst).

### T-2 (HIGH) — Rantai gudang TERPUTUS dari status SP (shipped_qty & sp_status tak pernah di-update oleh pengiriman)
`dispatch_delivery`/deliver/`cancel_delivery`/picking **tidak menulis `sp_items`** sama sekali (`schema:172-288`; satu-satunya `UPDATE sp_items` = `set_sp_status` `schema:912`).
- **Dampak:** SP yang sudah delivered di Surat Jalan tetap **Open/Outstanding** di SP Manifest; Outstanding hanya bisa ditutup dengan mengedit `shipped_qty` MANUAL via ShipmentModal (jalur legacy paralel). Dua sistem fulfillment tak sinkron → status & Outstanding menyesatkan untuk keputusan/laporan.
- **Bukti:** `db.js:539-551`, `schema:262-288`, prior audit AUDIT_SHIPPED.md.

### T-3 (HIGH) — `shipped_qty` bisa diisi tanpa/sebelum confirmed → SP draft tampil CLOSED
Tak ada gate `sp_status` pada penulisan `shipped_qty` (`App.jsx:4514/4371`, ShipmentPage filter fulfillment `:4032`); fulfillment `Closed` menimpa `sp_status` di pill (`SalesOrderPage:74`).
- **Dampak:** SP belum dikonfirmasi bisa dibuat "penuh terkirim" → pill CLOSED → masuk History → dianggap selesai. (Kontras: picking DB justru mewajibkan confirmed.)

### T-4 (HIGH) — Tidak ada notifikasi & tidak ada role gudang/procurement flow
0 notifikasi di alur; handoff antar-peran manual. Role gudang tak ada (`operations` dipakai); procurement role ada tapi tak ada request PR dari stok kurang.
- **Dampak:** langkah 3/4/6/7 lapangan tak punya trigger; ketergantungan penuh pada koordinasi manual (email/WA) → rawan tertinggal, tak terlacak.

### T-5 (MEDIUM) — No SP dari `Date.now()` (bukan numbering standar), rawan tabrakan
`InputSPPage:184` `SP-${Date.now().toString().slice(-6)}`.
- **Dampak:** dua input dalam window 6-digit ms yang sama → nomor sama; tak ikut format `{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}`. (Picking `PICK/…` & SJ `SJ/…` sudah benar via `increment_document_sequence`.)

### T-6 (MEDIUM) — Tombol stub yang menampilkan "sukses" palsu / tab kosong
Manifest "Manifest" (`SalesOrderPage:465`), Detail SP per-item "Shipment"/"Finance" (`:1115/:1121`), "+ Tambah Shipment" (`:1165`) → toast sukses tanpa efek; Shipment/History tab kosong.
- **Dampak:** user mengira aksi berhasil / fitur ada; menyesatkan operasional.

### T-7 (MEDIUM) — Hard-delete data bisnis (tanpa soft-delete)
`sp_items` (hapus item/SP) & `sp_btbs` di-`delete()` permanen (`db.js:322-324/793-798`; Detail SP header comment `:11-12`). `sp_items` tak punya `deleted_at`.
- **Dampak:** melanggar AGENTS.md rule 13/§soft-delete; kehilangan jejak & data tak terpulihkan.

### T-8 (MEDIUM) — List query tanpa scope/limit/deleted_at
`listSpItems` (`db.js:284`, `SELECT *`, semua customer), `listPickingLists` (`:368`), `listDeliveryNotes` (`:508`) tanpa `.limit()`/filter.
- **Dampak:** "Semua SP = 437" = semua customer; beban naik seiring data; melanggar §Performance & aturan `.limit(1000)`.

### T-9 (LOW) — Finance = flag manual, bukan dokumen; AR link via teks
`inv/fp/submit/kirim` cuma boolean; `ar_ttfs.no_sp` menautkan AR ke SP via **teks** (tanpa FK) → rawan mismatch/typo.

### T-10 (LOW) — Emoji di UI (langgar brand "no emoji")
`App.jsx:4066` "🎉", `:2021` "✨", `SalesOrderPage:460/467` "✓".

---

## DIAGRAM ALUR SAAT INI (kondisi NYATA)

```
┌─ TAHAP 1: INPUT ────────────────────────────────────────────────────────────┐
 Aktor: Gigih (operations)   Menu: Input SP
 Klik "Submit"/"Simpan Draft" (identik) → bulkInsertSpItems → sp_items
   • No SP = Date.now() (bukan numbering)   • sp_status = DEFAULT 'draft'
   • shipped_qty = 0   • (opsional) sp_btbs best-effort
 Tampil di SP Manifest: pill OPEN (amber), tab "Pending Konfirmasi".
 [Upload SP ke Drive = MANUAL; link bisa ditempel nanti di Detail SP > Dokumen]
└─────────────────────────────────────────────────────────────────────────────┘
        │  Aktor: Gigih   Menu: SP Manifest → tombol KONFIRMASI (RPC set_sp_status)
        ▼
┌─ TAHAP 2: CONFIRMED ────────────────────────────────────────────────────────┐
 sp_status='confirmed' (+confirmed_at/by).  Pill → CONFIRMED (navy).
 ⚠ TAB: tak ada tab "Confirmed" → SP hanya muncul di "Semua SP".
 [Tolak → cancelled → tab History]
└─────────────────────────────────────────────────────────────────────────────┘
        │  Aktor: Gigih   Menu: Detail SP → "Generate Picking List"
        │  (muncul HANYA bila confirmed; DB juga wajib confirmed)
        │  cek stok: badge dari stock_summary (informasional, tak memblok)
        │  [stok kurang → "request procurement" = TIDAK ADA di sistem]
        ▼
┌─ TAHAP 3: PICKING (tabel picking_lists — TERPISAH dari sp_items) ───────────┐
 Aktor: gudang (pakai role operations; TAK ada role gudang; PIC = '—')
 RPC generate_picking_from_sp → picking_lists(status='pending') +
   picking_list_items(qty_requested) + stock_ledger('reserved').
 Menu Picking List:  "Mulai" → in_progress → toggle picked (qty_picked=full/0)
   → "Selesaikan" (butuh SEMUA item picked) → status='done'.
 (opsional) Tambah Material → stock_ledger('outbound').
 ⚠ sp_items TIDAK berubah sama sekali di seluruh tahap ini.
└─────────────────────────────────────────────────────────────────────────────┘
        │  Menu Picking (done) → "Buat Surat Jalan"  (RPC generate_delivery_from_picking)
        ▼
┌─ TAHAP 4: SURAT JALAN (tabel delivery_notes — TERPISAH) ────────────────────┐
 delivery_notes(status='draft', customer_name/address = SNAPSHOT) + items(qty_picked).
 Menu Surat Jalan:  isi armada (driver/vehicle) → "Berangkatkan"
   (RPC dispatch_delivery: unreserve + outbound stock; status='in_transit')
   → "Tandai Terkirim" (status='delivered', delivered_at).
 ⚠ dispatch/delivered TIDAK menulis sp_items.shipped_qty / sp_status.
   → Di SP Manifest, SP ini MASIH tampil OPEN/Outstanding seolah belum dikirim.
└─────────────────────────────────────────────────────────────────────────────┘
        │  [Realita: barang sampai → Gigih FU BTB]
        ▼
┌─ TAHAP 5: BTB & "TUTUP" MANUAL ─────────────────────────────────────────────┐
 Aktor: Gigih.  Detail SP → "Tambah BTB" (sp_btbs, manual).
   EditItemModal → arrival_date (manual).
 Untuk menutup Outstanding di Manifest: HARUS buka Menu "Pengiriman SP" →
   Update Shipment → set shipped_qty = qty MANUAL  (satu-satunya jalur).
   → fulfillment Closed → pill CLOSED → tab History.
 ⚠ Langkah manual ini terpisah total dari Surat Jalan yang sebenarnya mengirim.
└─────────────────────────────────────────────────────────────────────────────┘
        │  Aktor: El (finance)   Menu: Finance / AR
        ▼
┌─ TAHAP 6: FINANCE (flag manual) ────────────────────────────────────────────┐
 FinanceModal: toggle Invoice/Faktur/Submit/Kirim + submit_date + email_status
   → sp_items (boolean, BUKAN dokumen invoice/faktur beneran).
 AR TTF: ar_ttfs(no_inv,no_sp[teks],tgl_menerima,tgl_pembayaran) + ar_btbs(dpp,pph,payment)
   → tracker manual pembayaran.  Tak ada notifikasi/penerbitan dokumen.
└─────────────────────────────────────────────────────────────────────────────┘

RINGKAS: 3 pulau data terpisah — [sp_items/sp_status+shipped_qty] · [picking_lists] ·
[delivery_notes] (+ [sp_btbs] + [ar_*]). Hanya digerakkan manual per pulau; tak ada
jembatan status maupun notifikasi antar-pulau. Stok (stock_ledger) satu-satunya yang
benar-benar mengalir otomatis lewat RPC.
```
