# Nexus MSI — Development Progress Log

## 2026-07-08

### MVP Storbit SP — FASE 3 BTB SELESAI TOTAL (Step A-G) — branch `feat/sp-schema`
> **Ringkasan:** BTB_TERBIT kini HIDUP end-to-end. Tahap yang dulu yatim (ada di enum, di-freeze di guard, tak pernah tercapai) sekarang jadi **rank TERTINGGI di band terkelola (mengalahkan TERKIRIM_PENUH)** — puncak sebelum invoice, karena ditagih atas BTB bertandatangan Indomarco. Jalur BTB pindah dari `sp_btbs` legacy (buta identitas) → `sp_btb` (tabel benar, RLS scoped, FK sp_order_id/customer_id/delivery_note_id, qty). **Fondasi DB (A-C)** + **FE cutover (D-F)** + **migrasi data (G)** semua SELESAI & TERVERIFIKASI. Rujukan: `AUDIT_FASE3_BTB.md`.
- [x] **Step A-B-C (DB, live & terverifikasi)** — GRANT + partial unique `sp_btb_no_unique_live`; `sp_recompute_status` (reproduksi 2B + cabang `v_has_btb` rank tertinggi + BTB_TERBIT dicabut dari guard freeze + REVOKE PUBLIC); RPC `sp_issue_btb` (7 arg, idempoten) + `sp_delete_btb` (soft delete). Rekaman: `20260708000001_sp_fase3_btb.sql`. (Detail di entri di bawah.)
- [x] **Step D (FE, additive `db.js`)** — 3 helper `sp_btb`: `issueSpBtb({customerId,spNo,btbNo,qty,btbDate,deliveryNoteId,remarks})`→`rpc('sp_issue_btb')`; `deleteSpBtbNew(id)`→`rpc('sp_delete_btb')`; `listSpBtbNew(spOrderId)`→`from('sp_btb').select('id,btb_no,qty,btb_date,remarks,created_at').eq('sp_order_id',…).is('deleted_at',null)`. Helper `sp_btbs` lama DITAHAN. Build clean, lint 223.
- [x] **Step E (FE, replaces — `SalesOrderDetailPage`)** — prasyarat additive `getSpOrderStatus` select +`id` (konsumen tunggal aman). Kartu "BTB Numbers": reader effect depend `spOrder?.id`→`listSpBtbNew`; add→`issueSpBtb({customerId:group.customerId,spNo,btbNo,remarks})`; delete→`deleteSpBtbNew`; helper `refreshBtbAndStatus()` re-fetch list + `getSpOrderStatus` → **badge headline naik BTB_TERBIT saat terbit / mundur saat hapus**; JSX kartu tak diubah. **Terverifikasi user** (terbit→BTB_TERBIT di badge+pill list, hapus→mundur, idempoten). Build clean, lint 223.
- [x] **Step F (FE, replaces — `InputSPPage`)** — hapus 2 pemanggil `bulkInsertSpBtbs` + kartu/state input BTB (`btbRows`) + import `bulkInsertSpBtbs` + `btbRows` dari deps `doInsert`. **BTB pindah 100% ke Detail SP (keputusan D3, post-delivery)**; TAK ADA lagi penulis `sp_btbs` dari FE (grep callers=0). Build clean, lint 223. Ikon `Trash2`/`Plus` ditahan (dipakai kartu lain).
- [x] **Step G (DB data-migration, live & terverifikasi)** — **Blok 1:** INSERT delta `sp_btbs`→`sp_btb` (resolve sp_order via sp_no, HANYA `n_sp_order=1` + `NOT EXISTS` by customer_id+btb_no hidup → idempoten, hindari ambigu/duplikat; qty/delivery_note_id NULL historis; received_at=created_at legacy) → **19 baris ter-insert, sp_btb hidup 186 → 205**. **Blok 2:** DO loop recompute massal semua SP (`PERFORM sp_recompute_status` per SP). **Sebaran akhir `sp_orders.status` (total 438): BTB_TERBIT 201 · TERKIRIM_PENUH 155 · MENUNGGU_STOK 45 · CONFIRMED 17 · DIKIRIM 10 · SAMPAI 6 · PICKING 4.** Rekaman: `20260708000002_sp_fase3_btb_data_migrasi.sql` (header + 2 blok byte-exact). Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum (housekeeping, di luar FASE 3 inti):** refresh `schema_snapshot.sql` via `pg_dump` (Step A-C + data belum masuk snapshot). Pensiun/drop `sp_btbs` legacy + pembersihan definisi helper legacy `db.js` (`listSpBtbs`/`addSpBtb`/`deleteSpBtb`/`bulkInsertSpBtbs` — masih diekspor, 0 caller) = paling akhir setelah verifikasi produksi. **FASE 4 (INVOICED→SUBMITTED→LUNAS)** butuh modul invoice/payment — belum ada.

### MVP Storbit SP — Mesin status FASE 3 (BTB_TERBIT: fondasi DB Step A+B+C) SELESAI & TERVERIFIKASI — branch `feat/sp-schema`
> **Konteks (AUDIT_FASE3_BTB.md):** BTB terbelah dua generasi — `sp_btbs` (legacy) hidup tapi buta identitas (hanya `sp_no`, RLS permisif, tanpa `customer_id`/`qty`/link); `sp_btb` (Fase 0) tabel benar tapi MATI (0 reader/writer live, backfill 186 dormant). Tahap `BTB_TERBIT` yatim: ada di enum + di-freeze di guard recompute, tapi tak pernah bisa tercapai. FASE 3 menghidupkannya. **Keputusan bisnis DIKUNCI: BTB_TERBIT = rank TERTINGGI di band terkelola (puncak SEBELUM invoice) — mengalahkan TERKIRIM_PENUH**, karena invoice ditagih atas BTB bertandatangan Indomarco. Semua SQL dijalankan user manual di SQL Editor, **terverifikasi runtime (SP 2038213): issue BTB → BTB_TERBIT (mengalahkan TERKIRIM_PENUH); panggil ulang nomor sama → idempoten (tak duplikat); delete BTB → mundur ke TERKIRIM_PENUH**.
- [x] **Step A — GRANT + partial unique (REPLACES constraint):** `GRANT SELECT, INSERT, UPDATE ON sp_btb TO authenticated`; `DROP CONSTRAINT sp_btb_no_unique`; `CREATE UNIQUE INDEX sp_btb_no_unique_live ON sp_btb (customer_id, btb_no) WHERE deleted_at IS NULL` — partial index (hanya baris hidup) supaya re-issue nomor BTB yang pernah di-soft-delete tak kena `unique_violation`.
- [x] **Step B — `sp_recompute_status` (REPLACES 2B):** reproduksi body FASE 2B UTUH + fakta `v_has_btb := EXISTS(sp_btb WHERE sp_order_id=v_id AND deleted_at IS NULL)` + cabang CASE **`WHEN v_has_btb THEN 'BTB_TERBIT'` paling ATAS** (rank tertinggi) + **`BTB_TERBIT` DICABUT dari guard freeze** (kini bisa naik/turun mengikuti fakta BTB; guard tinggal `CANCELLED/INVOICED/SUBMITTED/LUNAS`). Signature tetap `(uuid,text)` (replace in-place → 5 pemanggil existing tak pecah) + `REVOKE EXECUTE ... FROM PUBLIC` (internal via PERFORM).
- [x] **Step C — RPC `sp_issue_btb` + `sp_delete_btb` (ADDITIVE):** `sp_issue_btb(p_customer_id, p_sp_no, p_btb_no, p_qty DEFAULT NULL, p_btb_date DEFAULT NULL, p_delivery_note_id DEFAULT NULL, p_remarks DEFAULT NULL)` SECURITY DEFINER — resolve `sp_order_id`+`company_id` via `(customer_id, sp_no)`; guard nomor wajib + validasi DN milik SP (bila di-link); **idempotensi lembut** (btb_no hidup untuk customer ini → kembalikan id yang ada, tak duplikat); INSERT `sp_btb` + `PERFORM sp_recompute_status` → BTB_TERBIT. `sp_delete_btb(p_btb_id)` — **soft delete** (`deleted_at=now()`) + recompute (mundur bila tak ada BTB lain). +GRANT EXECUTE authenticated.
- [x] **File migrasi rekaman** dibuat: `supabase/migrations/20260708000001_sp_fase3_btb.sql` — header (tujuan + tanggal 8 Jul 2026 + keputusan BTB rank tertinggi + hasil verifikasi + "SUDAH LIVE, rekaman, bukan untuk dijalankan lagi") + Step A/B/C urut byte-exact dari SQL yang dijalankan user (tag `$fn$` bernama). Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum (rencana FASE 3 lanjutan, lihat AUDIT_FASE3_BTB.md):** refresh `schema_snapshot.sql` via `pg_dump` (Step A/B/C belum masuk snapshot — masih guard lama). **Step D** (helper db.js `sp_btb`: `issueSpBtb`/`listSpBtbNew`/`deleteSpBtbNew`, additive). **Step E** (cutover kartu "BTB Numbers" SalesOrderDetailPage dari `sp_btbs` → `sp_btb`; +`id` di `getSpOrderStatus`). **Step F** (stop tulis `sp_btbs` legacy di InputSPPage). **Step G** (gated/later: preview dampak 186 backfill + migrasi delta `sp_btbs`→`sp_btb` + pensiun legacy). Tes manual runtime (perlu login) menyusul di Step E.

## 2026-07-07

### MVP Storbit SP — Mesin status FASE 2C (transisi delivered → SAMPAI via RPC) SELESAI & TERVERIFIKASI — branch `feat/sp-schema`
> **Konteks (AUDIT_FASE2_PENGIRIMAN.md 2C):** transisi "delivered" (surat jalan sampai) dulu pakai plain `.update` di `setDeliveryStatus` → TAK memicu `sp_recompute_status` → status SP tak naik ke SAMPAI otomatis. 2C: RPC `mark_delivery_delivered` (set delivered + recompute) + FE panggil RPC. 1 file FE + 1 RPC baru, dijalankan user manual, **terverifikasi** (SP 2204884 DIKIRIM → SAMPAI, lalu dikembalikan ke kondisi semula).
- [x] **RPC `mark_delivery_delivered(p_delivery_note_id)`** (SECURITY DEFINER, `SET search_path=public`, pola persis `complete_picking`): resolve `customer_id`+`sp_no` dari `delivery_notes`; guard **`status='in_transit'` only** (tolak draft/cancelled/sudah-delivered, RAISE); `UPDATE delivery_notes SET status='delivered', delivered_at=now()`; `PERFORM sp_recompute_status` → SAMPAI (bila belum TERKIRIM_PENUH — rank lebih tinggi). +GRANT authenticated. Terverifikasi pg_proc + runtime.
- [x] **FE `db.js:setDeliveryStatus`** — cabang `status==='delivered'` → `supabase.rpc('mark_delivery_delivered', {p_delivery_note_id})` (ganti plain update; `delivered_at` kini di-set RPC). **Cabang `in_transit` (2A `dispatch_delivery`) TAK disentuh**; +fallback plain-update utk status lain (tak dipakai saat ini). Pemakai tunggal `DeliveryNoteDetailPage.jsx:130` cuma pakai `{error}` → tak pecah. **TIDAK disentuh:** dispatch/cancel (2A), `sp_recompute_status` (2B), `cancelDelivery`, DeliveryNoteDetailPage. Build clean (~2583 modules, 1.77s). Lint **223 (net-zero)**.
- [x] **File migrasi rekaman** dibuat: `supabase/migrations/20260707000004_mark_delivery_delivered_rpc.sql` — header (tujuan + tanggal 7 Jul 2026 + "SUDAH LIVE, rekaman, bukan untuk dijalankan lagi") + definisi RPC + GRANT byte-exact dari histori sesi (tag `$fn$`). Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump`. **2D** (sync `sp_order_items.shipped_qty` kanonik via legacy_sp_item_id) & **2E** (pindah reader status list ke `sp_orders.status` — `AUDIT_PINDAH_READER_STATUS.md`) belum. Tes manual (perlu login): tandai DN in_transit→delivered → `sp_orders.status` jadi SAMPAI (atau tetap TERKIRIM_PENUH bila shipped-penuh); DN non-in_transit → ditolak.

### MVP Storbit SP — Mesin status FASE 2 (2A+2B: jembatan pengiriman) SELESAI & TERVERIFIKASI — branch `feat/sp-schema`
> **Konteks (AUDIT_FASE2_PENGIRIMAN.md, temuan G-1):** `dispatch_delivery` memberangkatkan surat jalan (in_transit + `stock_ledger` unreserve+outbound) TAPI tak pernah menulis `shipped_qty` → fulfillment beku, `sp_recompute_status` (FASE 1) mentok PACKED. FASE 2 menjembatani pengiriman → status lanjut DIKIRIM/SAMPAI/TERKIRIM_PENUH. Semua SQL dijalankan user manual, **terverifikasi: 438 SP di-recompute → TERKIRIM_PENUH 346, MENUNGGU_STOK 45, CONFIRMED 20, DIKIRIM 14, SAMPAI 9, PICKING 4**. **DB-only, tak ada perubahan FE** (dispatch/cancel sudah dipanggil jalur FE yang ada; transisi 'delivered' via RPC = 2C, belum).
- [x] **2A — jembatan shipped_qty (dispatch + cancel sepaket):** `CREATE OR REPLACE dispatch_delivery` (+`UPDATE sp_items.shipped_qty += qty` akumulatif via jalur `delivery_note_items.picking_list_item_id → picking_list_items.sp_item_id → sp_items.id`, agregasi **per sp_item_id** bukan product_id → hindari kontaminasi antar-item; +`PERFORM sp_recompute_status`). **Idempoten** karena dispatch hanya jalan sekali (guard `status='draft'`). `CREATE OR REPLACE cancel_delivery` (+reversal `shipped_qty = GREATEST(shipped_qty - qty, 0)` per sp_item_id, **hanya bila DN in_transit/delivered**; draft = belum dispatch → skip; +recompute). **Logika `stock_ledger` (unreserve/outbound/inbound) & guard DN TAK diubah** (hanya +baris shipped_qty).
- [x] **2B — perluas `sp_recompute_status`:** tier pengiriman di ATAS band FASE 1 — **TERKIRIM_PENUH** (`Σshipped_qty ≥ Σqty` item confirmed) > **SAMPAI** (DN delivered) > **DIKIRIM** (DN in_transit/delivered) > band FASE 1 (PACKED..DRAFT). Band FASE 1 (fakta + logika) TAK diubah, hanya ditumpuk tier kirim. Guard: `CANCELLED`,`BTB_TERBIT`,`INVOICED`,`SUBMITTED`,`LUNAS` → return (BTB_TERBIT ikut di-guard demi forward-compat FASE 3; 0 SP saat ini — keputusan user AskUserQuestion). Signature tetap (replace in-place) + `REVOKE ... FROM PUBLIC`.
- [x] **KEPUTUSAN BAKU:** **TERKIRIM_PENUH murni dari `Σshipped_qty ≥ Σqty`** (dari `sp_items`, item confirmed), **APA PUN SUMBERNYA** (dispatch Nexus ATAU migrasi). 554 item historis ber-shipped_qty=qty penuh dari migrasi TANPA surat jalan → jujur tampil TERKIRIM_PENUH (boleh lompat tahap tanpa jejak DIKIRIM/SAMPAI). Preview read-only dijalankan dulu sebelum recompute massal (pola FASE 1).
- [x] **File migrasi rekaman** dibuat: `supabase/migrations/20260707000003_sp_fase2_pengiriman.sql` — header + 3 blok urut (dispatch_delivery · cancel_delivery · sp_recompute_status 2B) byte-exact dari histori sesi (tag `$fn$`). Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump`. **2C** (RPC `mark_delivery_delivered` + FE `setDeliveryStatus` delivered→rpc, supaya transisi delivered memicu recompute→SAMPAI). **2D** (sync `sp_order_items.shipped_qty` kanonik via legacy_sp_item_id). **2E** (pindah reader status list ke `sp_orders.status` — `AUDIT_PINDAH_READER_STATUS.md`). Limitasi dicatat: partial/N-batch lanjutan (guard 1-picking-per-SP) di luar FASE 2.

### MVP Storbit SP — Mesin status FASE 1 (DRAFT→PACKED) SELESAI & TERVERIFIKASI — branch `feat/sp-schema`
> **Konteks (AUDIT_MESIN_STATUS.md):** `sp_orders.status` (12-tahap) diam di DRAFT, tak ada recompute, desync dengan `sp_items.sp_status`. FASE 1: bangun `sp_recompute_status` + sambungkan tahap darat bawah + fix desync. **3 keputusan bisnis baku:** (1) PACKED = picking `done`; (2) MENUNGGU_STOK ditampilkan sbg status (confirmed + stok kurang); (3) batal picking → mundur ke CONFIRMED + flag overlay `had_cancelled_picking` (permanen). 2 file FE + SQL (1 kolom + 1 fungsi baru + 3 RPC replace + 1 RPC baru), semua SQL dijalankan user manual, **terverifikasi: 438 SP di-recompute → CONFIRMED 367, MENUNGGU_STOK 45, PACKED 22, PICKING 4**.
- [x] **DB (SQL manual, terverifikasi):** (1) `ALTER sp_orders ADD had_cancelled_picking boolean DEFAULT false`; (2) **`sp_recompute_status(customer_id, sp_no)`** baru — kunci **komposit** (bukan sp_order_id; `picking_lists` sudah bawa customer_id+sp_no dari BAGIAN B), **fact-derived** dari `sp_items` (lifecycle) + `picking_lists` (done→PACKED / active→PICKING) + `stock_summary.available` (confirmed+short→MENUNGGU_STOK), guard CANCELLED & >PACKED tak disentuh, downgrade batal-picking natural, `REVOKE EXECUTE FROM PUBLIC` (internal via PERFORM); (3) `set_sp_status` (4-arg) **replace** +sync `sp_orders` (cancel→CANCELLED eksplisit; confirm/draft→PERFORM recompute) = **fix desync**; (4) `generate_picking_from_sp` (3-arg) **replace** +PERFORM recompute (→PICKING); (5) `cancel_picking(uuid)` **replace** +set flag +recompute (mundur); (6) **`complete_picking(uuid)` baru** (set done + recompute→PACKED, guard pending/in_progress). Semua RPC yg diubah **signature tetap** (replace in-place).
- [x] **FE:** `db.js` — `completePicking` → `rpc('complete_picking')` (return `{error}`, FE `handleComplete` cuma pakai error); +helper `getSpOrderStatus(customerId, spNo)` (read `status`+`had_cancelled_picking`). `SalesOrderDetailPage.jsx` — state+effect fetch `sp_orders` by `(customerId, spNo)` → **badge additive** "Tahap: {status}" + "⚠ Pernah picking dibatalkan" di samping pill lama. Build clean (~2583 modules, 1.78s). Lint **223 (net-zero)**.
- [x] **Strategi transisi (keputusan user AskUserQuestion):** pill list `SalesOrderPage` **TETAP baca `sp_items`** (jangan pecah reader); `sp_orders.status` hidup di DB + badge Detail SP dulu (Tahap A/B), pindah reader = fase lanjut. Badge masuk FASE 1 · `complete_picking` pakai guard pending/in_progress. **TIDAK disentuh:** `createSpOrderDual`/dual-write (kunci komposit sudah cukup; `sp_order_id` wiring = FASE 2), reader `sp_items`/`groupBySP`/`toDesignStatus`, logika stok/ledger/item di generate_picking & cancel_picking (hanya +baris recompute/flag), `startPicking`/`setPickingItemPicked`.
- [x] **File migrasi rekaman** dibuat: `supabase/migrations/20260707000002_sp_status_machine_fase1.sql` — header + 6 blok urut (ALTER flag · sp_recompute_status+REVOKE · set_sp_status · generate_picking_from_sp · cancel_picking · complete_picking) byte-exact dari histori sesi (tag `$fn$`). Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump` (kolom + fungsi baru belum masuk snapshot). Tes manual runtime (perlu login): confirm→CONFIRMED/MENUNGGU_STOK; generate picking→PICKING; picking selesai→PACKED; batal picking→balik CONFIRMED + flag nyala. **FASE 2+ (DIKIRIM→LUNAS) belum** — butuh jembatan dispatch→shipped_qty + modul invoice/payment.

### ProductDetailPage — tampil + edit 3 harga kategori (semester/tahunan/project) — branch `feat/sp-schema`
> **Konteks (DESIGN #13):** kolom `products.price_semester/tahunan/project` + dropdown kategori InputSPPage sudah ada, TAPI ProductDetailPage cuma tampil/edit `default_price` → semua produk cuma punya "Default", dropdown kategori Input SP cuma "Default". 1 file FE (`ProductDetailPage.jsx`) + 1 RPC baru. **Tidak mengisi angka harga apa pun** (produk existing tak berubah nilai). Keputusan user (AskUserQuestion): RPC baru (bukan `bulk_update_product_prices`) + kontrak tidak per-kategori.
- [x] **TASK 1 (tampil)** — fetch produk `.select()` +`price_semester,price_tahunan,price_project`; di kartu "Harga & Pajak" **di bawah box Default Price** +3 `InfoRow` ringkas (Harga Semester/Tahunan/Project); NULL → **"Belum diatur"** (cek `!= null`, bedakan dari Rp 0). Box Default Price tetap menonjol.
- [x] **TASK 2 (edit)** — lewat form Edit yang ADA (bukan tombol terpisah): `EditForm` +3 `FormField type="number"` (boleh kosong=NULL) setelah Default Price; `startEdit` prefill `?? ''`.
- [x] **Jalur simpan (KRITIS)** — trigger DB `trg_z_products_price_history` **hanya cover `default_price`** → simpan kategori via **RPC baru `set_product_category_prices(p_product_id,p_semester,p_tahunan,p_project)`** (SECURITY DEFINER; authz mirror `products_update` = super ATAU admin-same-company; terima NULL utk clear; log `product_price_history` per kategori yg berubah, `source='category_edit'`, `price_category`). Dibuat & dijalankan manual di SQL Editor, **terverifikasi jalan**. **Kenapa bukan `bulk_update_product_prices`:** super-only + tolak NULL (raise) → tak bisa clear + pecah parity.
- [x] **`saveEdit`** — parse `'' → null`, guard non-negatif SEBELUM simpan; `default_price` path **100% tak berubah** (direct update + trigger + attach kontrak); SETELAH itu panggil RPC kategori → `catErr` → toast "harga tersimpan, kategori gagal" (default tetap tersimpan); `setProduct` set kategori hanya bila RPC sukses; `loadPriceHistory` refresh bila default **atau** kategori berubah. **Kontrak per-kategori TIDAK ditambah** (tetap utk default saja). **TIDAK disentuh:** InputSPPage, dropdown kategori, BulkEditPricePage, `bulk_update_product_prices`, jalur default_price. Build clean (~2583 modules, 1.48s). Lint **223 (net-zero)**; no console error.
- [x] **File migrasi rekaman** dibuat: `supabase/migrations/20260707000001_set_product_category_prices_rpc.sql` — header (tujuan + tanggal 7 Jul 2026 + "SUDAH LIVE, rekaman, bukan untuk dijalankan lagi") + definisi RPC + GRANT byte-exact dari histori sesi. Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump` (RPC baru belum masuk snapshot). Tes manual (perlu login admin+): buka produk → 3 harga "Belum diatur"; isi 1 kategori → tersimpan + tampil + `product_price_history` nambah 1 baris kategori itu; kosongkan lagi → "Belum diatur"; angka negatif ditolak.

## 2026-07-06

### MVP Storbit SP — FASE 0 (fondasi skema DB) SELESAI & TERVERIFIKASI (branch `feat/sp-schema`)
> Eksekusi Fase 0 dari `DESIGN_SP_SCHEMA.md` (rev.2, final terkunci) berdasarkan 6 audit (`AUDIT_E2E/FINANCE/GUDANG/STOK/UI.md`). **DB-only, non-destruktif** — semua CREATE/ALTER ADD + backfill; **tidak ada drop**. Branch baru `feat/sp-schema` dari `restruktur-nexus` (belum merge). Semua SQL dijalankan user manual di Supabase SQL Editor, per-TASK dengan gerbang verifikasi; Claude hanya menulis SQL/plan.
- [x] **TASK 1 — `dc_master`** (tabel master DC baru): `id/company_id/customer_id/kode/nama/wilayah/alamat/is_active/created_by/created_at/updated_at/deleted_at`. RLS company/role-scoped (4 policy: read super-or-company; insert/update `is_manager_or_above() OR has_role('operations')`; delete super) + GRANT + ENABLE RLS. Backfill dari `SELECT DISTINCT (customer_id, trim(dc))` di `sp_items` → **45 DC** (36 Indomarco ter-mapping wilayah via `region_map` 36 DC; 9 non-Indomarco [6 IGR, 2 YMY, 1 DC JOMBANG] wilayah NULL, admin isi belakangan). Verifikasi: policy=4, 45 DC, 36 mapping/9 unmapped. **CSV surat jalan TIDAK dipakai** (nama beda format + baris non-DC) — hanya rujukan alamat manual di luar Fase 0.
- [x] **TASK 2 — `sp_orders` + `sp_order_items`** (header/items, split dari `sp_items` flat; kosong dulu). `sp_orders`: `status text+CHECK` 12-tahap (DRAFT…LUNAS+CANCELLED) default DRAFT, `is_disputed`+dispute_*, `dc_id` FK dc_master (nullable dulu), expired_date/sp_category/external_url/confirmed_*/cancelled_*/soft-delete. `sp_order_items`: `sp_order_id` FK CASCADE, `company_id` (denormal utk RLS — deviasi dari DESIGN, dicatat), `product_id` FK (nullable dulu), `qty CHECK>=1`, `shipped_qty CHECK(>=0 AND <=qty)`, `unit_price` (snapshot), `price_category text CHECK(semester/tahunan/project)` nullable. RLS 4 policy + GRANT masing-masing. Pre-flight `sp_items` BERSIH (qty_lt_1=0, shipped_gt_qty=0, product_null=0) → backfill mulus.
- [x] **TASK 3 — 3 kategori harga produk**: `ALTER products ADD price_semester/price_tahunan/price_project` (numeric, **nullable**; `default_price` LAMA utuh). `ALTER product_price_history ADD price_category`. RPC **`bulk_update_product_prices` diperluas** (CREATE OR REPLACE): terima `category` per baris (default 'default' → **backward-compat** perilaku lama via trigger `default_price`); kategori baru → update kolom yg benar + **logging MANUAL** ke `product_price_history` dgn `price_category` (keputusan #6, bukan trigger — trigger hanya `AFTER UPDATE OF default_price`). ⚠️ RPC ini TIDAK ada di `schema_snapshot.sql` branch ini (dibuat manual pasca-snapshot) → user dump `pg_get_functiondef` dulu sebelum CREATE OR REPLACE (hindari clobber).
- [x] **TASK 4 — backfill 708→ header/items** (KRUSIAL, data asli): header via `DISTINCT ON (customer_id, sp_no)` (deterministik `ORDER BY …, created_at, ctid`), dc→dc_id via join `(customer_id, nama)`, status map dasar draft→DRAFT/confirmed→CONFIRMED/cancelled→CANCELLED (**D5: TANPA recompute lanjut**). Items 1:1 PRESERVE qty/shipped_qty/unit_price/product_id, `price_category=NULL` (legacy), +kolom **sementara `legacy_sp_item_id`** (= `sp_items.id` lama, utk map TASK 5 & audit). Verifikasi **lama=baru**: header 438=438, item **723=723**, `SUM(qty) 985.795=985.795`, `SUM(shipped_qty) 800.881=800.881`, dc_id NULL=0, header-divergen (vi)=0.
- [x] **TASK 5 — repoint FK gudang + `sp_btb`** (aditif): `ALTER picking_lists/delivery_notes ADD sp_order_id`, `delivery_note_items ADD sp_order_item_id` (semua FK nullable, kolom lama utuh). Backfill: picking via `sp_no` (guard sp_no-tunggal, picking_lists tak punya customer_id); delivery_notes via `(customer_id, sp_no)`; delivery_note_items via `picking_list_item → picking_list_items.sp_item_id → sp_order_items.legacy_sp_item_id`. **CREATE `sp_btb`** (entitas BTB baru, D3: qty saja tanpa nilai pajak; `sp_order_id/delivery_note_id/customer_id` FK, soft-delete) +RLS 4 policy+GRANT; backfill dari `sp_btbs` (guard sp_no-tunggal, qty=NULL historis). Verifikasi: picking 18/18, DN 14/14, DN-items 21/21 (belum=0, no orphan), sp_btb 187=187, policy=4.
- [x] **TASK 6 — constraint final** (kunci): 6a deteksi duplikat **BERSIH** (`(customer_id,sp_no)`=0, `(customer_id,btb_no)`=0; kasus BTB 2049904 salah-input dikonfirmasi Gigih & dihapus manual dari `sp_btb`). 6b pre-check `dc_id NULL=0` & `product_id NULL=0`. 6c: `ADD CONSTRAINT sp_orders_no_unique UNIQUE(customer_id, sp_no)` + `sp_btb_no_unique UNIQUE(customer_id, btb_no)` + `dc_id`/`product_id` **SET NOT NULL**. CHECK (status 12-tahap, qty>=1, shipped<=qty, price_category, sp_btb.qty>=0) sudah dari CREATE.
- [x] **Ringkasan akhir:** `sp_orders=438`, `sp_order_items=723`, `sp_btb=186`, `dc_master=45`. **Tabel lama UTUH:** `sp_items=723`, `sp_btbs=187` (selisih 1 di sp_btb = BTB salah-input yg dihapus).
- [ ] **⚠️ CATATAN WAJIB (belum):**
  - (1) **Frontend BELUM** — perubahan Fase 0 masih **DB-only**. InputSPPage (dc dropdown WAJIB dari `dc_master` + dropdown Kategori Harga per item → `unit_price` auto-snapshot + `price_category`, tanpa input angka manual) dan `db.js` **dual-write** (tulis sp_orders/items **DAN** sp_items lama, D2 opsi A) = **Fase 0 lanjutan**, belum dikerjakan. UI legacy belum dipensiun (Fase 0.5).
  - (2) **`schema_snapshot.sql` PERLU di-refresh via `pg_dump`** (belum) — snapshot branch ini stale (tak memuat tabel/kolom/RPC Fase 0). User jalankan manual.
  - (3) **Belum ada drop** apa pun; **belum merge ke `main`**; belum commit/push (atas permintaan user).
  - (4) **`sp_order_items.legacy_sp_item_id` JANGAN di-drop dulu** — masih dipakai untuk audit/rollback map; drop di fase akhir.
  - (5) Fase 1 (dispatch bridge `shipped_qty` auto, partial/N-batch, invoice/payment/TTF-FK, `sp_audit_log`/tab History, `sp_recompute_status`) **belum** — di luar Fase 0.

### Migrasi konsolidasi Fase 0 dibuat (catatan/reproducibility) — branch `feat/sp-schema`
> SQL 6 TASK DB Fase 0 dijalankan manual di SQL Editor tapi tak pernah disimpan sebagai file migrasi. Dirakit jadi satu file **rekaman** (BUKAN untuk dijalankan lagi — struktur sudah live). Sumber SQL: **histori sesi Claude Code** (tak ada file scratch `.sql` maupun SQL runnable di PROGRESS.md). SQL direkam apa adanya, urut per-task, tanpa guard idempotent.
- [x] Buat `supabase/migrations/20260706000001_sp_schema_mvp_fase0.sql` — header komentar per TASK DB 1–6.
- [x] **Semua 6 TASK DB KETEMU** (dari histori sesi), **tidak ada yang HILANG**: DB1 dc_master (CREATE+4 policy+GRANT+seed 45 DC/region_map) · DB2 sp_orders+sp_order_items (CREATE+4 policy each+GRANT) · DB3 3 kolom harga products + product_price_history.price_category + RPC bulk_update_product_prices · DB4 backfill sp_orders/sp_order_items (+legacy_sp_item_id) · DB5 repoint FK gudang + sp_btb (CREATE+RLS+backfill) · DB6 2 UNIQUE + 2 NOT NULL.
- [x] **TASK DB 3 (RPC) — sudah byte-exact dari live** (6 Jul 2026): blok `bulk_update_product_prices` di file migrasi di-swap dengan hasil `pg_get_functiondef` live (tag `$function$`, header `LANGUAGE plpgsql`/`SECURITY DEFINER`/`SET search_path`); komentar provenance lama diganti "Sumber: pg_get_functiondef live (byte-exact)". **Tidak ada lagi titik lunak** — seluruh isi file migrasi Fase 0 kini = SQL asli (CREATE/ALTER/POLICY/GRANT/backfill/RPC/constraint). Hanya blok RPC yang berubah; TASK DB 1/2/4/5/6 tak disentuh.
- [x] Query verifikasi/review/deteksi (SELECT count/pg_policies/dsb) **tidak** disertakan (bukan DDL migrasi). Tidak ada file lain disentuh; tidak ada SQL dijalankan.

### RLS `accounts` — izinkan role `operations` baca customer (fix dropdown Input SP kosong) — branch `feat/sp-schema`
> **Akar masalah (audit `AUDIT_ACCOUNTS_RLS.md`):** operator SOA (role `operations`, mis. Gigih) dropdown Customer di Input SP **KOSONG**, super_admin (Den) **PENUH**. Sumber: policy `prospects_read` di `accounts` hanya meloloskan `is_super_admin()` **atau** `company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=uid OR created_by=uid)`. Fungsi `is_manager_or_above()` **tidak memuat `operations`**, dan customer hasil import bukan milik Gigih (`assigned_to`/`created_by` ≠ dia) → 0 baris → dropdown kosong. Inkonsistensi: skema SP baru (`sp_orders`/`sp_order_items`/`sp_btb`/`dc_master`) sudah beri `operations` hak INSERT/UPDATE, tapi `accounts` (sumber `customer_id`) tak ikut diberi hak baca. **DB-only, sudah live & terverifikasi di production** (dijalankan manual di SQL Editor). Tidak ada SQL dijalankan ulang di sesi ini.
- [x] **Fix (Opsi A′ dari audit):** `DROP POLICY prospects_read` + `CREATE POLICY prospects_read` — tambah cabang `has_role('operations') AND account_status = 'customer'` di dalam grup company-scoped. Least-privilege: operations hanya baca account ber-status **customer** (bukan prospect CRM), tetap **company-scoped**, bypass super_admin utuh, cabang manager/owner lama tak berubah.
- [x] Rekam SQL sebagai file migrasi: `supabase/migrations/20260706000002_accounts_rls_operations_read.sql` — header komentar (tujuan + tanggal 6 Jul 2026 + catatan "SUDAH LIVE, file ini rekaman, bukan untuk dijalankan lagi") + DROP/CREATE POLICY persis.
- [x] Tidak ada file lain disentuh (hanya file migrasi baru + PROGRESS.md). Tidak ada SQL dijalankan. Referensi audit lengkap: `AUDIT_ACCOUNTS_RLS.md`.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump` (snapshot masih memuat `prospects_read` versi lama). Verifikasi runtime: login `operations` SOA → dropdown Customer Input SP terisi; role `sales` masih timpang (hanya customer miliknya — keputusan kebijakan RBAC terpisah).

### MVP Storbit SP — Fase 0 lanjutan (dual-write D2-A, TASK 2) SELESAI & TERVERIFIKASI — branch `feat/sp-schema`
> **Tujuan:** saat InputSPPage menyimpan SP, tulis ke DUA generasi sekaligus — `sp_items` lama (tak berubah, pembaca Manifest/Detail/Pengiriman/Finance tetap baca ini) DAN skema baru `sp_orders`+`sp_order_items` (atomik). Jembatan transisi. Keputusan user (AskUserQuestion): **atomisitas approach (iii)** (RPC tabel-baru saja, jalur sp_items 100% tak tersentuh) + **DC WAJIB** di validasi. RPC dibuat & dijalankan manual di SQL Editor, **terverifikasi jalan**.
- [x] **RPC `create_sp_order_dual`** (SECURITY INVOKER, `SET search_path=public`): INSERT `sp_orders` (header, `created_by=auth.uid()`, status default DRAFT) → RETURNING id → INSERT `sp_order_items` dari `jsonb_array_elements(p_items)`; `EXCEPTION WHEN unique_violation` (constraint `sp_orders_no_unique(customer_id,sp_no)`) → `RAISE EXCEPTION 'SP … sudah ada…'` (error jelas, bukan gagal senyap). RLS berlaku — `operations` SOA sudah punya hak insert (policy `sp_orders_insert`/`sp_order_items_insert`). +GRANT EXECUTE authenticated. **Terverifikasi jalan** (dual-write sukses, header+items terisi identik dgn sp_items).
- [x] **FE `db.js`** — +helper `createSpOrderDual({companyId,customerId,spNo,spDate,dcId,status,expiredDate,notes,items})` = wrapper `supabase.rpc('create_sp_order_dual',…)`. `spToDb`/`bulkInsertSpItems`/`bulkInsertSpBtbs` **tak diubah**.
- [x] **FE `InputSPPage.jsx` `doInsert`** — urutan: (1) `bulkInsertSpItems` DULU (tak berubah — juga sumber `legacy_sp_item_id`); (2) zip `legacy_sp_item_id = inserted[i].id` per index (PostgREST kembalikan baris urut input), build `dualItems` — `price_category` di-map **`'default'`/`''`→null** (CHECK hanya semester/tahunan/project), `shipped_qty`=0, `unit_price`=snapshot; panggil `createSpOrderDual` (company=SOA, status='DRAFT' utk Submit & Draft = parity legacy); (3) BTB best-effort. **Error dual-write** (`dualErr`): sp_items lama sudah tertulis → toast error JELAS + **return true** (tak retry supaya sp_items tak dobel; sp_no di-generate ulang tiap insert). **DC wajib**: `headerOk` +`dcId` (`sp_orders.dc_id` NOT NULL) + pesan draft +"DC". **TIDAK disentuh:** FormModal (App.jsx), EditItemModal (SalesOrderDetailPage), semua pembaca sp_items, `spToDb`. Build clean (~2583 modules, 1.46s). Lint 223 (net-zero); InputSPPage+db.js 0 error.
- [x] **File migrasi rekaman RPC** dibuat: `supabase/migrations/20260706000003_create_sp_order_dual_rpc.sql` — header komentar (tujuan dual-write TASK 2 + tanggal 6 Jul 2026 + "SUDAH LIVE, rekaman, bukan untuk dijalankan lagi") + definisi RPC + GRANT persis dari histori sesi TASK 2. Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump` (RPC baru belum masuk snapshot). Tes manual runtime penuh via Preview (buat SP uji → SQL gerbang: `sp_order_items` vs `sp_items` jumlah baris + SUM(qty) identik + header `sp_orders` customer_id/dc_id/sp_no sesuai + `legacy_sp_item_id` terisi; sp_no duplikat → error jelas).

### MVP Storbit SP — Identitas komposit (customer_id, sp_no) BAGIAN B SELESAI & TERVERIFIKASI — branch `feat/sp-schema`
> **Konteks:** nomor SP kini manual (BAGIAN A) → bisa kembar antar customer. Sebelumnya seluruh app + 3 RPC mengenali SP dari `sp_no` saja → SP beda-customer bernomor sama **tergabung di layar** + aksi Konfirmasi/Picking/Surat-Jalan **kontaminasi lintas-customer**. Diterapkan identitas komposit `(customer_id, sp_no)` menyeluruh: FE (6 file) + DB (1 kolom + 3 RPC). Bertahap dgn gerbang: DB-5 (cek data) → DB-1 (kolom) → DB-2/3/4 (RPC baru) → FE → DB-6 (drop RPC lama). Semua SQL dijalankan user manual, terverifikasi (pg_proc + runtime).
- [x] **DB-5 (cek data existing)** — 0 nomor SP kembar lintas-customer di `sp_orders`, `sp_items`, `picking_lists` → tak perlu migrasi data. Backfill `LIMIT 1` aman.
- [x] **DB-1 (kolom + backfill)** — `ALTER picking_lists ADD customer_id uuid` (nullable, FK accounts) + backfill 2 lapis: utama dari `sp_orders` via `sp_order_id`, fallback dari `sp_items` via `sp_no LIMIT 1`. Verifikasi: **26 picking, 26 terisi, 0 null**.
- [x] **DB-2/3/4 (RPC baru, koeksis dgn lama)** — `set_sp_status` signature **4-arg** `(p_sp_no,p_status,p_reason,p_customer_id)` `WHERE sp_no AND customer_id`; `generate_picking_from_sp` **3-arg** `(p_sp_no,p_customer_id,p_warehouse_id DEFAULT NULL)` semua `WHERE sp_no` +`AND customer_id` + guard picking di-scope + INSERT `picking_lists.customer_id`; `generate_delivery_from_picking` signature **tetap** `(p_picking_list_id)` — resolve customer dari `picking_lists.customer_id` (fallback `sp_items LIMIT 1` bila null) + set `delivery_notes.customer_id`. Body identik versi lama + klausa customer saja. Verifikasi via pg_proc: signature baru terbentuk, versi lama masih ada.
- [x] **FE (6 file)** — `db.js` (`setSpStatus`+`p_customer_id`, `generatePickingFromSp`+`p_customer_id`); `App.jsx` (`groupBySP` key `spNo`→`uid=${customerId}|${spNo}` + grup ekspos `uid`/`customerId`; `selectedSpId` string→objek `{spNo,customerId}`; +`customerByUid` memo; `handleGeneratePicking`/`onGoToSp` bawa customerId); `SalesOrderPage.jsx` (`key={g.uid}`, `onSelectSP(g)`, `openModal(g,…)`, `setSpStatus(…, modal.group.customerId)`); `SalesOrderDetailPage.jsx` (`onGeneratePicking(spNo, group?.customerId)`); `PickingListPage.jsx` (prop `customerByUid`, lookup `[${r.customer_id}|${r.sp_no}]`); `PickingListDetailPage.jsx` (`onGoToSp(detail.sp_no, detail.customer_id)`). **Keputusan user:** `customerBySpNo` dipertahankan utk `DeliveryNotePage` (di luar 6 file) → ADD `customerByUid` (bukan rename). Build clean (~2583 modules, 1.34s), lint **223 (net-zero)**, no console error.
- [x] **DB-6 (drop RPC lama)** — setelah FE terverifikasi: `DROP FUNCTION set_sp_status(text,text,text)` + `generate_picking_from_sp(text,uuid)` → tak ada sisa fungsi tak-scoped.
- [x] **File migrasi rekaman** dibuat: `supabase/migrations/20260706000004_sp_composite_identity.sql` — header + 5 blok urut (ALTER+backfill · set_sp_status 4-arg · generate_picking 3-arg · generate_delivery · DROP lama) byte-exact dari histori sesi. Tidak ada file lain disentuh; tidak ada SQL dijalankan.
- [ ] **Belum:** refresh `schema_snapshot.sql` via `pg_dump` (kolom + RPC baru belum masuk snapshot). Sisa sp_no-keyed di luar scope (dicatat): `getPickingListDetail` (db.js) resolve `customer_name` via `sp_items LIMIT 1` (display-only); komponen legacy `Manifest` (App.jsx:3480, tak dirender) masih `key={g.spNo}` (dead).

## 2026-07-05

### Halaman baru "Indomarco Dashboard" — INTERNAL, lintas-modul CRM + data SP (branch `restruktur-nexus`)
> Dashboard presentasi tim MSI ke Indomarco (meeting 14 Jul 2026). Framing customer-facing, tapi **halaman internal** (role-gated manager-or-above; isi bisa terlihat customer saat meeting → sembunyikan harga/margin/cost). Acuan visual mockup `IndomarcoDashboard.jsx` (LAYOUT saja; warna/font dari token brand repo). Rencana disetujui user (PLAN). 1 file baru + `App.jsx` + docs, **tanpa ubah DB**.
- [x] **Page** `src/modules/crm/IndomarcoDashboardPage.jsx`: fetch `sp_items` `.eq('customer_id','a18fad3c-…')` `.limit(1000)` — **tanpa `deleted_at`/`company_id`** (kolom tak ada; RLS `sp_items_read`=`USING(true)` → scope via customer_id + role-gate). Agregasi client-side (satu fetch ~708 baris). Loading/empty/error state.
- [x] **4 zona:** header + badge; 4 KPI (Total SP=COUNT DISTINCT sp_no, Unit Dipesan=Σqty, **Volume Terealisasi=Σshipped_qty [absolut, bukan %/on-time]**, Jangkauan DC=COUNT DISTINCT dc); baris donut "Jangkauan per Wilayah" (center=dcCount LIVE; **pembagian wilayah DUMMY**, komentar `// DUMMY`) + bar "DC Teratas" (GROUP BY dc, Σqty, top 6, top-3 orange); area "Tren SP per Bulan" (COUNT DISTINCT sp_no per bulan sp_date, Jan–Jul 2026).
- [x] **Role gate INTERNAL:** menu `role:['super_admin','admin','ceo','gm','manager','supervisor']` + render guard `canRenderPage`→`AccessDeniedPage` (pola `riwayat-visit`). Sales/customer tak akses. Charts recharts (pola CRMReportPage); grid responsif reuse `nx-grid-kpi`/`nx-grid-2`.
- [x] **Menu (`App.jsx`):** lazy import + item `indomarco-dashboard` (icon `Building2`) di CRM group (ERP_MENU_GROUPS + NEXUS_NAV) + `'indomarco-dashboard'` ke exclusion ComingSoon + render block.
- [x] **TIDAK ditampilkan:** harga/margin/cost/%/on-time. Warna/font dari token brand (navy `#1B4D8A`/orange `#E85A1E`, Montserrat/Inter/IBM Plex Mono), bukan hex mockup.
- [x] Build clean (2584 modules, 1.59s). Lint **223 (net-zero; file baru 0)**.
- [ ] **⚠️ KPI belum diverifikasi live** (no DB creds di sesi + page di balik login). SQL verifikasi KPI + `SELECT DISTINCT dc` diserahkan ke user; target ~425 SP / 981.332 dipesan / 798.502 realisasi / 36 DC.
- [ ] **TODO donut:** ganti `REGION_DATA` dummy → agregasi wilayah asli setelah user kasih daftar `DISTINCT dc` + mapping dc→wilayah (Jawa/Sumatera/Sulawesi/Bali & Nusa Tenggara/Kalimantan).
- [ ] **Tes manual (belum, perlu login manager+):** menu muncul (bukan ComingSoon); 4 KPI live masuk akal; bar/area + tooltip; donut dummy; sales tak bisa akses; tak ada harga/%/on-time; responsif layar kecil.

## 2026-07-03

### Fix dropdown Customer kosong — mapping `active` → `is_active` (branch `restruktur-nexus`)
> Akar masalah (AUDIT.md): `customerFromDb` (`db.js`) memetakan `active: !!row.active`, padahal tabel `accounts` kolomnya **`is_active`** (bukan `active`) → semua customer `active:false` → tersaring habis oleh filter `c.active !== false`. Bug lama dari migrasi `customers→accounts` (Phase 2.5A), **bukan** dari perubahan ProductPicker. 1 baris FE, tanpa ubah DB. Commit `a3f49c8`.
- [x] `db.js` `customerFromDb`: `active: !!row.active` → `active: row.is_active !== false` (accounts `is_active DEFAULT true`; nama kolom diverifikasi via `schema_snapshot.sql`).
- [x] Satu titik akar → semua konsumen filter `active` ikut benar: FormModal (`App.jsx:4296`), AR TTF (`:5308`), chip filter customer (`:3552`/`:5027`). Customer yang benar-benar `is_active=false` tetap tersaring.
- [x] Bukan isu RLS/scope — `listCustomers` sudah ambil customer relevan; array yang sama tampil normal di `InputSPPage`. Build clean (2581 modules). Lint 223 (net-zero).
- [ ] **Tes manual (belum):** dropdown Customer FormModal terisi (Indomarco/Indogrosir/dll); AR TTF + chip filter + kartu customer tetap benar; customer inactive tetap tak muncul.

### ProductPicker dropdown-only di FormModal & EditItemModal (branch `restruktur-nexus`)
> Lanjutan fix bug AUDIT.md: ProductPicker sebelumnya diedit di `InputSPPage` yang ternyata SALAH jalur; 2 titik input produk SP lain (FormModal via menu Input SP → "Add New SP", EditItemModal via Detail SP → pencil) masih teks bebas. 2 file FE (`App.jsx`, `SalesOrderDetailPage.jsx`), tanpa ubah DB (`spToDb` sudah petakan `product_id`). Commit `b21bfae`.
- [x] **FormModal (`App.jsx`)**: import `ProductPicker`+`useProducts({companyId: SOA})`; `data` +`productId:null`; Product Name `<Input>` → ProductPicker (onPick isi productId/name/sku + prefill `unitPrice=default_price` tetap editable; onChangeText batalkan pilihan); SKU jadi read-only display; validasi `handleSubmit` wajib `productId`.
- [x] **EditItemModal (`SalesOrderDetailPage.jsx`)**: `draft` +`productId`; Product Name `<ModalInp>` → ProductPicker (onPick sinkronkan productId/name/sku — tutup desync nama vs SKU; unitPrice TIDAK di-prefill, tetap snapshot); SKU sudah read-only; field lain (DC/Qty/tanggal/SLA/EstDelivery/Arrival) tak disentuh.
- [x] **Enforcement lenient legacy (keputusan user):** item BARU + item lama yang sudah tertaut wajib `productId` (cegah unlink); item legacy (`product_id` null) boleh disimpan tanpa memilih. FormModal `requireProduct = !initial || !!initial.productId`; EditItemModal Save `disabled` bila `wasLinked && !draft.productId`.
- [x] Build clean (2581 modules). Lint 223 (net-zero). Konsolidasi 3 form input produk SP DITUNDA (utang teknis).
- [ ] **Tes manual (belum):** Add New SP produk cuma dropdown + SKU + prefill harga editable → simpan `product_id` terisi; Detail SP pencil ganti produk → SKU+nama konsisten.

### BulkEditPricePage (bulk update harga) + ProductPicker di Input SP (branch `restruktur-nexus`)
> Halaman baru update harga massal (super_admin) + picker role-aware lintas entitas; + ganti input produk teks-bebas jadi ProductPicker di InputSPPage. Commit `7dcb3be` (+ snapshot `5a8fba2`). RPC `bulk_update_product_prices` dibuat manual di DB.
- [x] **BulkEditPricePage** (`src/modules/admin/pages/`): tabel baris dinamis (Produk via shared ProductPicker, Harga Saat Ini read-only, Harga Baru number +anti-scroll onWheel, Nomor Kontrak, Berlaku Sampai); "Simpan Semua" → `rpc('bulk_update_product_prices',{p_rows})` → toast `X diperbarui, Y dilewati (harga sama)` dari `{updated,skipped}`; loading/empty/error + validasi.
- [x] **Picker role-aware:** super_admin → katalog lintas entitas (query `products` tanpa filter company, RLS izinkan; badge entitas MSI/JCI/SOA dari `companies.code`); non-super → `useProducts` default company-scoped. `useProducts.js` TAK disentuh (query lokal di halaman).
- [x] **Menu** `bulk-edit-price` (label "Update Harga Massal", icon TrendingUp, role super_admin) di ERP_MENU_GROUPS + NEXUS_NAV (Master Data) + render guard `canRenderPage` + exclusion catch-all ComingSoon.
- [x] **InputSPPage:** field produk teks-bebas → ProductPicker dropdown-only (pin SOA); onPick isi productId/name/sku + prefill `unitPrice=default_price` (tetap editable → snapshot utuh); `spToDb` +`product_id`; validasi dropdown-only (Submit + Draft). Harga SP tetap snapshot (`sp_items.unit_price`), tidak live.
- [x] Build clean. Lint 223 (net-zero).
- [ ] **Tes manual (belum):** menu muncul (bukan Coming Soon); pilih produk lintas entitas + badge; simpan → toast updated/skipped; InputSP dropdown-only + product_id tersimpan.

### Lokasi Rak (Stok Barang) + Riwayat Harga produk (kontrak/PKS) (branch `restruktur-nexus`)
> 2 fitur; DB dijalankan manual + diverifikasi user (2 tabel + RPC update + trigger). Commit `e739c39` (+ snapshot `5a8fba2`).
- [x] **DB (manual):** tabel `product_warehouse_location` (rack per produk×gudang, RLS permissive) + RPC `generate_picking_from_sp` di-update (auto-isi `picking_list_items.location_detail` dari rak saat generate); tabel `product_price_history` (+kolom `contract_no`/`valid_from`/`valid_until`, RLS read-only, immutable) + trigger `trg_z_products_price_history` (AFTER UPDATE default_price → log) + RPC `attach_price_contract_info` (audit-safe, hanya kolom kontrak). Fix RLS `products_update` +bypass `is_super_admin()` (USING & WITH CHECK) — akar bug simpan harga gagal senyap.
- [x] **StokBarangPage:** kolom "Lokasi Rak" inline-edit ikut filter gudang (Semper/Others editable, Semua Gudang read-only + hint); helper `db.js` getProductRackLocations/upsertProductRackLocation.
- [x] **ProductDetailPage:** section "Riwayat Harga" (Tanggal/Harga Lama/Harga Baru/Selisih/Diubah Oleh/Kontrak/Berlaku Sampai) dari `product_price_history`; info kontrak opsional via RPC saat harga diubah; prefill kontrak terakhir saat buka edit; input angka anti-scroll (onWheel blur); `saveEdit`/`toggleActive` +`.select()` + guard 0-row + toast error (tak gagal senyap).
- [x] Build clean. Lint 223 (net-zero).
- [ ] **Tes manual (belum):** isi rak per gudang → persist; edit harga → Riwayat Harga muncul + info kontrak; simpan lintas entitas (super_admin) sukses.

## 2026-07-02

### Material Packing + PDF Picking List (Fase 3.x · branch `restruktur-nexus`)
> Commit `debb8ed` (+ snapshot `5f16843`).
- [x] **DB (manual):** tabel `picking_list_materials` + RPC `add_picking_material` (insert + outbound stok) / `delete_picking_material` (delete + reverse stok).
- [x] **PickingListDetailPage:** section "Material Packing" (muncul saat picking done): ProductPicker filter `inventory_class='Inventory'` + qty + availability (soft-warn) + Tambah/Hapus; editable sebelum Surat Jalan dibuat, read-only setelahnya.
- [x] **PickingListPDF.jsx** (baru): checklist gudang (kolom checkbox) + section Material Packing; tombol Cetak jadi PDF beneran.
- [x] Build clean. Lint 223.
- [ ] **Tes manual (belum):** tambah/hapus material → stok gerak; kunci setelah SJ; cetak PDF.

### Fase 1 — cek stok & reservasi otomatis (branch `restruktur-nexus`)
> Commit `5322f9c` (+ snapshot `7aae37f`/`8ec957d` untuk Fase 0.2).
- [x] **DB (manual):** `stock_summary` view (on_hand/reserved/available; fix on_hand exclude reserved); RPC `generate_picking_from_sp` reserve stok; `cancel_picking`→unreserve; `dispatch_delivery`→unreserve+outbound; `cancel_delivery`→reversal. `picking_list_items.qty_short`.
- [x] **FE:** badge availability/qty_short di SalesOrderDetailPage + PickingListDetailPage; `db.js` getStockForProducts (company-level SOA); dispatch/cancel via RPC.
- [x] **Fase 0.2 (`8ec957d`):** `sp_items.product_id` backfill + propagate ke picking_list_items/delivery_note_items.
- [ ] **Tes manual (belum):** reserve saat generate; qty_short saat stok kurang; unreserve saat cancel; outbound saat dispatch.

### Fase 3 — Packing & Surat Jalan (delivery notes) (branch `restruktur-nexus`)
> Commit `905f99b` (+ snapshot `7aae37f`).
- [x] **DB (manual):** tabel `delivery_notes`/`delivery_note_items` + RPC `generate_delivery_from_picking` (dari picking done; snapshot customer_name; numbering SJ/…) + item edits (draft only).
- [x] **FE:** `DeliveryNotePage`/`DeliveryNoteDetailPage`/`DeliveryNotePDF`; komponen `ProductPicker` shared diekstrak dari QuotationFormPage; item editable (Opsi C) via ProductPicker; fix BUG customer_name "—" (snapshot di generate, bukan baca live RLS-blocked).
- [ ] **Tes manual (belum):** generate SJ dari picking done; edit item draft; PDF.

### Fase 0.3 — SP document link (external_url) (branch `restruktur-nexus`)
> Commit `1093a67`.
- [x] `sp_items.external_url` + fallback link dokumen SP di FE.

### Fase 2 — Cancel Picking List (branch `restruktur-nexus`)
> Commit `2000580` (+ snapshot `5764504` tambah `cancelled_at`).
- [x] RPC `cancel_picking` (set cancelled + release reservasi) + tombol Batalkan di PickingListDetailPage; SP eligible generate ulang.

### Fase 2 — Picking List + Import Data Produksi Storbit (branch `restruktur-nexus`)
> Commit `964376f` (Picking) + `dd420e8` (import docs) + snapshot `73ea183`.
- [x] **Picking List:** tabel `picking_lists`/`picking_list_items` + RPC `generate_picking_from_sp` (atomik, guard idempotensi, numbering `PICK/SOA/WH/{YYYY}/{SEQ}`); `PickingListPage`/`PickingListDetailPage`; tombol "Generate Picking List" di SP detail (saat `sp_status='confirmed'`); menu role-only `operations`.
- [x] **Import Data Produksi (DB-only via SQL Editor manual):** dari `STORBIT SHIPPING MANIFEST (2).xlsx` + `MSI GROUP WAREHOUSE (1).xlsx`, target entitas SOA. Hasil terverifikasi SQL: **720 baris / 435 SP / qty 984.026 / nilai acuan Rp 7.736.680.654**; 4 accounts (Indomarco existing + 3 baru), 38 products upsert, stock_ledger refresh, sp_items +`sp_category`/`sp_status='confirmed'`, sp_btbs 187. Rancangan: `MVP_STORBIT_RANCANGAN.md`; audit: `MVP_STORBIT_AUDIT.md`/`MVP_STORBIT_IMPORT_AUDIT.md`.
- [ ] **Perlu konfirmasi:** selisih jumlah SP **431 vs 435** (menunggu konfirmasi sumber angka dari Gigih); verifikasi mapping **30 item kontrak PKS Indomarco**.

### Slice 0.1 — Persistensi status SP + fix rbac (branch `restruktur-nexus`)
> Commit `3171efb` (SP status) + `e4f448b` (rbac redirect-guard).
- [x] **Slice 0.1:** `sp_items.sp_status` (draft/confirmed/cancelled) + `confirmed_at/by`, `cancelled_at/by`, `cancel_reason` + RPC `set_sp_status` (atomik per sp_no); FE Konfirmasi/Tolak SP kini persist (bukan toast palsu).
- [x] **fix(rbac) `e4f448b`:** redirect-guard pakai `isMenuAccessible` (identik sidebar/F4; hilangkan bounce ke Command Center utk child role-gated) + cabut `operations` dari 4 menu CRM (lead-pool/rate-list/calls/activity-log).

## 2026-07-01

### RBAC hardening — gate MOM/CRM public menus + AdminShell + F4 content-gate (branch `restruktur-nexus`)
> Commit `3dbbc64`. Penajaman gating pasca restruktur menu 3.0.
- [x] Gate menu publik MOM/CRM, AdminShell role gate, dan content-level gate (F4) supaya route sensitif tak bisa diakses via URL/redirect tanpa izin.

### Role-gating Home quick actions (Phase 3.0C · branch `restruktur-nexus`)
> Access-control gap: tombol quick action Home muncul utk semua role tanpa gating. 2 file (`App.jsx`, `HomeDashboard.jsx`), FE-only. Diverifikasi build/lint + live (super_admin).
- [x] **Temuan (Point 1)** — target "Buat SP" = `InputPage` (`activeMenu==='input'`) **tak punya guard role/permission**; `InputSPPage.jsx` juga bersih. Satu-satunya gate = `canAccessActiveMenu` (kasar — izinkan `input` selama modul induk `manifest` visible krn `collectMenuIds` tak re-gate child). → andalkan block halaman tujuan TIDAK aman.
- [x] **Fix (Point 2+3)** — `App.jsx`: pass `canNavigate={canRenderPage}` ke `HomeDashboard` (fungsi existing = `canSeeMenuItem(findMenuItemById(id),…)`, **mekanisme identik sidebar**). `HomeDashboard`: +prop `canNavigate`, helper `can(id)` (default-allow bila fn absen); `QUICK` array (Buat SP→`input`, Buat Quotation→`quotation-draft`, Catat Inquiry→`crm-inquiry`) `.filter(can)`; tombol tak-izin **disembunyikan** (bukan disabled); baris quick-action hilang total bila `QUICK.length===0`.
- [x] **Perlu tindakan (interim)** — tiap TASK +`gate` (SP→`manifest`, akses customer→`crm-customers-msi`, quotation→`quotation-draft`); `visibleTasks = TASKS.filter(t=>can(t.gate))` dipakai di hero count + badge + rows; +empty state "Tidak ada yang perlu tindakan.". **Catatan:** ini interim utk dummy — saat wiring data asli, gating final harus by approval-assignment (bukan menu-visibility).
- [x] **Garansi** — visibilitas tombol Home = **identik** sidebar (fungsi gating sama). "Buat SP" hilang utk sales/Karina IFF "Input SP" hilang di sidebar-nya.
- [x] **Flag RBAC (dicatat di CLAUDE.md Known Issues, JANGAN diperbaiki sekarang)** — `input` di-gate `hasPermission('logistics','view')` + role-def include `sales`; kalau RBAC grant `logistics.view` ke sales, sales tetap lihat "Buat SP"/"Input SP" (mungkin tak diinginkan). Itu konfig data-permission/RLS (di luar scope FE, berisiko) → tunda, bahas terpisah.
- [x] **Build clean** 2573 modules 1.39s · Lint 223 (0 error baru) · HomeDashboard lint bersih. **Verified live (super_admin):** 3 tombol + 3 task tampil.
- [ ] **Tes manual (belum):** login **Karina (sales)** → "Buat SP" hilang di Home (ikut visibility sidebar "Input SP"); role lain sesuai izin masing-masing. (Perlu kredensial sales — negative case dijamin by construction.)

### Polish sidebar 3.0B — connector line, badge soon orange, audit flatten (lanjutan · branch `restruktur-nexus`)
> 3 fix visual/struktur lanjutan. 1 file (`App.jsx`), FE-only. Diverifikasi live (login super_admin di Preview).
- [x] **Fix 1 (visual — connector line)** — hapus `borderLeft: '1px solid var(--line)'` di 3 container submenu (LeafRow grandchildren + expandable-module children + soon-module children). Sekarang cuma indentasi (`marginLeft:12` + `paddingLeft:8`) + spacing, tanpa garis vertikal. Verified: `borderLeftWidth=0px` di semua container.
- [x] **Fix 3 (visual — badge soon orange)** — badge "soon" (modul-level Logistic/Procurement/IT/Freight/Customs **dan** objek-level Bank Disbursement/Sales Order/Job Order/dst) dari abu (`--p-slate`) → **orange** `background: rgba(232,112,61,0.14)` + `color: #E8703D`. Konsisten semua. Verified: 10 badge, semua `rgb(232,112,61)`. Tetap non-klik/disabled.
- [x] **Fix 2 (audit flatten — TIDAK dieksekusi, dilaporkan)** — cek apakah Asset/Finance boleh di-flatten jadi 1 item. **Temuan:** `AssetShell` **TIDAK punya internal nav** (komentar file eksplisit "Navigation handled entirely by App.jsx's ModuleSidebar. No secondary sidebar here"; content-only, router by `activePage`). `Finance` juga **tanpa shell/internal nav** (tiap halaman ar/outstanding/finance/dst di-render individual by `activeMenu` di App.jsx, tak ada `FinanceShell`). → **JANGAN flatten** keduanya (akan hilang akses halaman lagi). Perlu bikin internal nav dulu sebelum sidebar utama bisa disederhanakan — nunggu keputusan Den. (Catatan: banyak sub-halaman Asset saat ini `<ComingSoon>` di dalam AssetShell — hanya Dashboard + list IT/Kendaraan/Furniture/Properti + detail yang real.)
- [x] **Build clean** 2573 modules 1.42s · Lint 223 (0 error baru) · Boot+login OK. Asset render 16 objek (verified `assetChildCount:16`).

### Perbaikan sidebar pasca-audit — Fix A+B + Point 1&2 (Phase 3.0B · branch `restruktur-nexus`)
> Lanjutan 3.0A. Ketauan gap: modul Asset runtime cuma nampilin "Dashboard". Audit ulang `NEXUS_NAV` vs route existing + blueprint §03. 1 file (`App.jsx`), **100% FE, tanpa ubah DB.** Semua di-approve Den bertahap.
- [x] **Fix A — root cause gating regression** — Sidebar 3.0A meng-gate tiap child via `canSeeMenuItem`. Child Asset (`assets-*`) tak punya gate eksplisit (tak ada `menuKey`/`module`/`role`/`public`; cuma modul `assets` punya `service_asset`) → `canSeeMenuItem` default-deny → **semua child Asset kecuali Dashboard ke-hidden utk SEMUA user** (termasuk super_admin). Sidebar lama (`ModuleSidebar`/`SidebarItem`) tak pernah gate child (child inherit visibility modul). **Fix di `NexusSidebar`:** +`hasGate(item)` (true bila `public===true` / `MENU_KEY_MAP[id]` / `module` / `role`); `childGate(c)` tri-state → `true` (gated-visible) / `false` (gated-denied) / `null` (gateless → inherit); `childVisible = childGate(c) !== false`; `moduleVisible` = ada child `true` ATAU semua child `null`. Efek: child gateless (Asset) tampil kalau modul visible; child ber-gate tetap dihormati; modul tetap hidden kalau user tak punya izin modul (tak over-expose).
- [x] **Fix B — 3 objek Asset hilang** — +`assets-workorders` (Work Orders), `assets-expiring` (Akan Expired), `assets-expired` (Sudah Expired) ke `NEXUS_NAV` (urutan asli). Semua real, di-route `AssetShell`. Asset kini 16 objek.
- [x] **Point 1 — Shipment** — cek data source: `ShipmentPage` terima `rows={enrichedRows}` = `useSpItems` = **SP Storbit** (kolom SP No/Customer/Product/Qty/Shipped/Outstanding/DC/BTB/Shipping Date), bukan freight MSI. → pindah jadi child `nav-sp` (Daftar Pesanan), label **"Pengiriman SP"** (biar tak ambigu vs freight shipment nanti). Id/route/data `shipment` TETAP (murni label + parent).
- [x] **Point 2 — objek soon dari blueprint §03** — pola **expandable-soon**: modul `soon` yg punya `children` kini bisa di-expand nampilin objek-soon (disabled + badge "soon", non-klik, TANPA `navigateTo`). `LeafRow` +cabang `c.soon` (soon row). Modul soon tanpa child (Procurement, IT/Service Mgmt) tetap flat non-expandable. Objek soon ditambah: **Freight** → `Sales Order` + `Job Order`; **Customs/PPJK** → `Customs Doc` + `TPS / Bea Cukai`; **Logistic** → `Pengiriman`; **Finance** → `Bank Disbursement` (objek soon TERPISAH dari Cash/Bank — beda siklus hidup & approval flow, sesuai pola ERP/Odoo). Procurement & IT/Service Mgmt **tidak** dikasih child (blueprint §03 tak namai objek terpisah). Item §04 (tab) tak ditambah.
- [x] **Build clean** — 2573 modules, 1.41s. Lint 223 problems (**0 error baru** vs baseline 3.0A; 2 unused-var App.jsx `SalesCallsPage`/`isCrossEntity` pre-existing). Boot OK (login render, no crash).
- [ ] **Tes manual (belum — runtime, desktop + login):** Asset expand → 16 objek tampil (bukan cuma Dashboard); Pengiriman SP muncul di Daftar Pesanan; Freight/Customs/Logistic bisa di-expand → objek soon (badge soon, non-klik); Bank Disbursement soon di Finance (terpisah dari Cash/Bank); modul tetap ke-gate per izin (user tanpa izin Asset → modul hidden).

### Restruktur navigasi + rebrand warna global — 3 task (Phase 3.0A · branch `restruktur-nexus`)
> Patokan visual: `nexus_blueprint_master.html` (peta menu) + `nexus_home_v4.html` (home, sudah di-approve). **100% FE, TANPA ubah DB.** Plan disetujui via 2 keputusan (AskUserQuestion): sidebar **modul expandable** (bukan flat) + recolor **sweep menyeluruh** (bukan shell-only). Branch `restruktur-nexus` (Vercel Preview), TIDAK ke `main`.
- [x] **T1 token warna global (sweep menyeluruh)** — palet baru gantikan navy pekat `#144682`: `--navy #1B4D8A / --navy-d #143C6E / --ink #212A37 / --mute #7E8899 / --faint #A6AEBD / --orange #E8703D / --bg #F2F5F9 (abu lembut) / --card #FFFFFF / --line #E8ECF2` + 9 pasang pastel per-modul. **Sumber terpusat baru:** CSS `:root` vars di `index.css` (+ `body` bg abu). **Sweep `sed` `#144682→#1B4D8A` di 43 file `src/`**; **4 file PDF/cetak DIKECUALIKAN** (`QuotationPDF`/`InquiryPDF`/`RateSheetPDF`/`ActivityReportPDF` = tetap navy brand resmi). `App.jsx`: `PASTEL` di-remap (cream→abu, ink/line cool-gray), `.nexus-shell-bg`→`#F2F5F9`, topbar cream→cool. Login `AuthGate` **sengaja tak disentuh** (di luar scope).
- [x] **T2 sidebar 2-level persisten** — komponen baru `NexusSidebar` (putih, `hidden lg:flex` + drawer mobile) **ganti** `ModuleSidebar` navy + **hapus App Launcher**. Konstanta baru `NEXUS_NAV` (4 grup Beranda/Bisnis/Shared Services/Foundation → modul → objek existing) + `NAV_TONES`. Modul **expandable** (accordion) reveal objek existing → `navigateTo(id)` (semua halaman lama tetap terjangkau, tanpa refactor tab). Item aktif = bg `--p-blue` + teks `--navy`; modul `soon` (Freight/Customs/Logistic/Procurement/IT) = disabled + badge "soon"; footer avatar+nama+role. Gating child reuse `findMenuItemById`+`canSeeMenuItem`. **Hapus dead code:** `ModuleSidebar`/`SidebarItem`/`isPlanned`/`PLANNED_REAL_IDS`/`PLANNED_REAL_PREFIXES`/`enterModule`/`goToLauncher`/`allMenuGroups`/`activeModuleGroup`. `users`→2 list `SYNTHETIC` (nav Users & Access utk admin/it).
- [x] **T3 home dashboard** — baru `src/modules/home/HomeDashboard.jsx` (port `nexus_home_v4.html`; render saat `activeMenu==='home'`, default landing) **ganti grid launcher** → dashboard: hero navy+glow orange (sapaan by jam + "Login sebagai · Group"), quick action (Buat SP→`input` / Buat Quotation→`quotation-draft` / Catat Inquiry→`crm-inquiry`), panel Perlu tindakan (3 dummy + tombol aksi→navigate) / Pengumuman (2 dummy) / Aktivitas terakhir (timeline dummy). Semua **dummy/statis**, **TANPA angka finansial sensitif** (keputusan final). `AppLauncher.jsx` jadi orphan (tak di-import, file dibiarkan).
- [x] **Build clean** — 2573 modules, 1.77s. Lint **net-negatif** (228→223 problems; **0 error baru** — 2 unused-var App.jsx [`SalesCallsPage`/`isCrossEntity`] pre-existing di HEAD). App boot OK (login render, no crash).
- [ ] **Tes manual (belum — runtime, desktop + login):** sidebar 4 grup putih + modul expandable + item aktif highlight `--p-blue` + badge "soon" di modul planned; home = dashboard (bukan grid launcher) dengan sapaan+quick action+perlu tindakan+pengumuman+aktivitas; buka 3-4 halaman → warna konsisten (pastel + navy lembut, sidebar putih, bg abu, tidak biru penuh); home tanpa angka finansial; cek Vercel Preview branch `restruktur-nexus`.

## 2026-06-30

### Rate Sheet dinamis (rewrite) + PDF brosur + badge Odoo — 3 task (Phase 2.14)
> 3 file disentuh (`RateListPage.jsx` rewrite total, `App.jsx` komentar, `CustomerDetailPage.jsx`) + 1 baru (`RateSheetPDF.jsx`). **Tanpa ubah DB** — `freight_rates` sudah DI-DROP, `rate_sheets` sudah dibuat (user, manual). Plan disetujui + 1 penyesuaian: sel "FREE" di PDF = BOLD NAVY (bukan ink, bukan hijau).
- [x] **T1 REWRITE RateListPage (rate_sheets dinamis)** — buang TOTAL versi `freight_rates` (kolom fixed). `rate_sheets`: `columns` jsonb `string[]`, `rows` jsonb `string[][]`, `valid_until` date, `note`. Mode internal `list|editor`. **List:** `.limit(1000)` (RLS filter, FE tanpa `created_by`), embed `company(name,code)`; kolom Nama Rate / Berlaku Sampai / Status (badge Aktif vs Expired derived `valid_until<todayYMD()`) / Dibuat / Jumlah Baris (`rows.length`); aksi Edit-atau-Lihat (expired→`Eye` read-only) / Download PDF (`pdf().toBlob()`) / Hapus (`ConfirmModal`); tombol Buat Rate Baru. **Editor (`RateEditor`):** Nama Rate (wajib) / Berlaku Sampai (date) / Note; tabel dinamis — `addColumn`/`removeColumn`(+rename header)/`addRow`/`removeRow`/`setCell`; default sheet baru kolom `POL/POD/O/F/CFS/OTHERS/REMARKS` + 1 baris kosong; save insert (`company_id=profile.company_id`,`created_by=profile.id`) / update. **Expired → read-only penuh** (input disabled/readOnly, tombol Simpan hilang, notice "Rate ini sudah kedaluwarsa, buat rate baru untuk update."); selaras RLS UPDATE yang blokir `valid_until<CURRENT_DATE`. `App.jsx`: komentar `freight_rates`→`rate_sheets`; menu `crm-rate-list` + render block `<RateListPage showToast/>` tetap. **grep `freight_rates` di `src/` = 0.**
- [x] **T2 RateSheetPDF.jsx (baru)** — @react-pdf brosur **landscape** A4 (Helvetica/Helvetica-Bold + Courier; `<Image src=MSI LOGO>` utk semua entitas). Header band navy (logo + `company.name` + sub "Freight Forwarding & Logistics · MSI Group") + label "RATE LIST" + `{code}/RATE/{tahun}` orange; orange rule; title row (Nama Rate + Tanggal Dibuat + Berlaku Sampai orange); tabel dinamis (header cream/navy bold dari `columns`; baris zebra dari `rows`; `width: 100/columns.length %` proporsional; nilai Courier; kolom 0&1 [rute] bold navy; **sel `FREE` → bold navy** per penyesuaian user — no hijau); note strip cream border-left orange (bila ada note); footer DISIAPKAN OLEH (nama/role/phone/email sales) + blok ttd (garis manual + nama + entitas); bottom bar navy `fixed`. Header+orangeRule+bottomBar `fixed` (repeat per halaman); rows `wrap={false}`. Data sales = fetch `profiles` by `created_by` saat download (FK `created_by`→`auth.users`, tak bisa di-embed); entitas dari `company` embed. Filename `RateList-{rate_name '/'→'-'}.pdf`.
- [x] **T3 badge Odoo di CustomerDetailPage** — +icon `database` (SVG lucide) ke `ICONS`; badge "Existing · Odoo" (`S.navyBadge` + `<Icon name="database">`) di `badgeRow` header, render **hanya bila `customer.is_odoo_customer`**. Select sudah `select('*')` → `is_odoo_customer` ter-fetch (no change fetch).
- [x] **Build clean** — 2573 modules (+1 file), 1.35s. Lint net-zero error baru (4× `react-hooks/set-state-in-effect` = pola `useEffect(()=>{fetchX()},[fetchX])` pervasive di semua list page repo).
- [ ] **Tes manual (belum — runtime):** buat sheet→tambah 2 kolom+3 baris→isi→simpan→muncul di list; set valid_until kemarin→read-only+tombol simpan hilang+tetap bisa Download PDF; sales A bikin→sales B tak lihat→manager lihat semua; Download PDF→logo MSI muncul, kolom/baris dinamis benar, nama sales+ttd+valid until, landscape rapi (kolom sedikit & banyak); customer `is_odoo_customer=true`→badge muncul, false→tidak.

### Milestone fitur lintas-CRM — 8 task (Phase 2.13)
> 10 file (1 baru: `src/modules/crm/RateListPage.jsx`). **Tanpa ubah DB** — tabel `freight_rates`, kolom `inquiries.pickup_address/delivery_address`, `accounts.is_odoo_customer`, RLS `accounts_delete_superadmin` semua sudah dijalankan manual oleh user. Plan disetujui + 3 keputusan via tanya: Duplicate=prefilled-create, hapus=TAB Aktivitas, delete customer=soft-delete super_admin-only.
- [x] **T1 Rate List (baru)** — `RateListPage.jsx`: list `freight_rates` (RLS filter visibilitas; FE TANPA filter `created_by`; `.limit(1000)`; kolom Nama Rate/POL/POD/O-F + edit/hapus), modal `RateFormModal` create/edit (validasi rate_name/POL/POD wajib; field rate teks bebas; insert set `company_id`+`created_by`), delete via `ConfirmModal`. `App.jsx`: lazy import + menu `crm-rate-list` (icon `Tag`, grup CRM setelah Quotation, role `super_admin/admin/ceo/gm/manager/sales/operations`) + render block. Tanpa audit log (tak ada ACTION_TYPE rate; di luar scope).
- [x] **T2 Duplicate Quotation** — `QuotationDetailPage`: +import `Copy`, +prop `onDuplicate`, tombol "Duplicate" (antara Edit & Download). `QuotationFormPage`: +prop `duplicateFrom`, effect prefill (key `duplicateFrom?.id`) — copy header+items dari sumber, **mode CREATE** (quotation=null → isEdit=false → save_quotation jalur create = nomor baru + DRAFT); reset valid_until/pricing_done_at, quote_date=today(); `setSelectedInquiry` disintesis dari `prospect_id`/`customer_id` sumber agar link terbawa ke insert payload. `App.jsx`: state `duplicatingQuotation` + reset di menu-change; detail `onDuplicate`→form prefilled; form `duplicateFrom={duplicatingQuotation}`. **Keputusan user:** prefilled-create (tak bikin draft row sampai user Submit → no orphan).
- [x] **T3 Inquiry No di Quotation** — relasi `quotations.inquiry_id`→`inquiries.inquiry_no`. `QuotationDetailPage`: select +embed `inquiry:inquiries!quotations_inquiry_id_fkey(inquiry_no)`; +`InfoRow "Inquiry No"` (mono, navy) dekat Quotation No; baris preview `INQUIRY` (service-route) → `INQUIRY NO.` (nomor). `QuotationPDF`: custRows baris `INQUIRY` → `INQUIRY NO.` = `quot.inquiry?.inquiry_no`; hapus const `SERVICE_TYPE_LABELS`+`inquiryStr` yang jadi nganggur.
- [x] **T4 hapus section Aktivitas di Dashboard** — `CRMDashboardPage`: hapus entri `{id:'activity',label:'Aktivitas'}` dari `DASH_TABS`. **Keputusan user:** hanya TAB "Aktivitas" (ActivityReportTab); "Recent Activity" card + "Aktivitas Saya" tetap. Render branch `tab==='activity'` jadi unreachable (harmless, ActivityReportTab tetap ter-referensi → no lint unused).
- [x] **T5 Pickup/Delivery Address Inquiry** — `InquiryFormPage`: +`pickup_address`/`delivery_address` ke state awal, populate edit (`setForm`), payload `fields` (create+edit), + 2 `<textarea>` (grid2) setelah POL/POD. Edit-load `select('*')` → auto kebaca.
- [x] **T6 badge stage di list Inquiry** — `InquiryListPage`: +token C `teal`/`orange` + `STAGE_META` (mirror ProspectListPage, token sama — bukan palet baru) + komponen `StageBadge`; embed `prospect`/`customer` +`pipeline_stage`; +kolom header "Stage" + cell badge (`inq.prospect?.pipeline_stage || inq.customer?.pipeline_stage`); colSpan empty/loading 7→8. `.range()` pagination tetap.
- [x] **T7 checkbox "Customer dari Odoo"** — `CustomerFormModal` (CustomerListPage): +`is_odoo_customer` state (`initial?.is_odoo_customer||false`), checkbox "Customer Existing (dari Odoo)" (section Komersial, accentColor navy), payload eksplisit `is_odoo_customer: !!form.is_odoo_customer`. **Satu komponen** dipakai create/edit (list) **dan** edit (CustomerDetailPage `{editing && <CustomerFormModal initial={customer}/>}`) → cover keduanya. Anti data-loss: payload eksplisit (hanya field terdaftar) + kedua sumber `select('*')` (preload benar).
- [x] **T8 delete customer super_admin** — `CustomerDetailPage`: `canDelete` `['super_admin','admin','manager']` → **`erpRole==='super_admin'`**. **Keputusan user:** pertahankan **soft-delete** (`deleted_at`), TIDAK hard-DELETE → hindari FK error + RLS `accounts_delete_superadmin` dibiarkan nganggur. Tombol/confirm/handler soft-delete existing dipakai apa adanya.
- [x] **Build clean** — 2572 modules (+1 file), 1.46s. Lint net-zero error baru (set-state-in-effect/static-components = pola pervasive repo; 3 `no-unused-vars` di CRMDashboardPage = pre-existing, di luar baris yang disentuh).
- [ ] **Tes manual (belum — runtime):** (T1) sales bikin rate→muncul; sales lain tak lihat; manager lihat semua; edit/hapus. (T2) Duplicate→form terisi→Submit→quotation baru nomor baru DRAFT. (T3) Inquiry No di detail+PDF. (T4) tab Aktivitas hilang, section lain utuh. (T5) pickup/delivery simpan+edit-load. (T6) badge stage berwarna. (T7) centang Odoo→simpan→load; field lain tak hilang. (T8) super_admin lihat tombol hapus + jalan; role lain tidak.
- [ ] ⚠️ **Catatan FK (delete customer):** hard-DELETE `accounts` akan GAGAL bila ada child non-cascade (`inquiries.prospect_id/customer_id`, `quotations.*`, `activities.account_id`, `sp_items.customer_id`, `ar_ttfs.customer_id`, `accounts.converted_to`). Karena dipakai soft-delete, tak terdampak. Bila nanti mau hard-delete: perlu CASCADE / cleanup child dulu (keputusan Den + perubahan DB).

## 2026-06-24

### CRM Report — cancelled activities + Export PDF (Phase 2.11G)
> 2 file: `src/modules/crm/CRMReportPage.jsx` + baru `src/modules/crm/ActivityReportPDF.jsx`. Tanpa ubah DB/RLS, tanpa package baru (@react-pdf/renderer sudah ada).
- [x] **AUDIT** — `fetchWindow` activities tak filter status (cancelled ikut ke-fetch), tapi `mapActs` drop `status==='cancelled'`. Tak ada kolom cancelled terpisah; `activities.status ∈ {todo,done,cancelled}` (ActivitiesPage `STATUS_META`, value `'cancelled'`).
- [x] **TASK 1 (cancelled di Report)** — `mapActs`: `cancelled` → status "Cancelled" (tak di-drop). `acts` tetap **active-only** (filter Cancelled) → KPI done/pending/overdue/total + trend + per-sales + winRate TIDAK berubah (keputusan: active-only, cancelled terpisah). `cancelledCount`/`prevCancelledCount` derive terpisah. +KPI card "Dibatalkan" (`Ic.XCircle`, warna `gray500`, goodWhenDown) → `st.kpiGrid` repeat(6→7). +`STATUS_STYLE.Cancelled` (label "Dibatalkan", gray). `detailActs` kini dari `exportRows` (active+cancelled) slice(40) → baris cancelled tampil di tabel detail dgn pill "Dibatalkan".
- [x] **TASK 2 (Export PDF)** — komponen baru `ActivityReportPDF.jsx` (@react-pdf/renderer): header band navy "Nexus by MSI" + judul "Laporan Aktivitas Sales" + bar orange; sub-header Periode/Salesperson/Dibuat; KPI summary 5 (Total/Selesai/Pending/Overdue/Dibatalkan); tabel No|Tanggal|Tipe|Status|Customer/Prospek|Sales|Catatan (header `fixed` repeat per halaman, row `wrap={false}` zebra, status berwarna); footer `fixed` "Halaman X dari Y" + "Generated by Nexus by MSI". Warna navy #144682 / orange #E85A1E. CRMReportPage: `import { pdf }` + `ActivityReportPDF`; state `exporting`; `exportRows` = SELURUH aktivitas terfilter (active+cancelled, newest-first, bukan cuma 40); handler `handleExportPDF` → `pdf(...).toBlob()` → download, nama file `Laporan-Aktivitas-{Sales}-{Period}-{YYYY-MM-DD}.pdf`; tombol "Export PDF" di pojok kanan filter bar (bg orange, disabled bila loading/error/0 aktivitas). Error → `window.alert` (page tak punya `showToast`).
- [x] **Build clean** — 2558 modules (+1 file), 1.36s
- [ ] **Tes manual (belum — runtime):** aktivitas cancelled muncul di KPI "Dibatalkan" + tabel detail (pill abu); KPI lain + winRate tak berubah; tombol Export disabled saat 0 data; klik → PDF ter-download (semua baris terfilter, bukan 40), header/footer/pagination benar, nama file sesuai sales+period+tanggal; filter sales/entity/period mempengaruhi isi PDF.

### Dropdown Management full DB-driven + konsumen CRM fetch dari DB (Phase 2.11E)
> `dropdown_options` (baru, sudah di-seed + RLS super_admin-write) jadi sumber dropdown lintas modul. 5 file (1 baru: `src/hooks/useDropdownOptions.js`). DB cleanup `taxes` dijalankan user di SQL Editor (bukan dari repo). Tanpa ubah DB/RLS dari repo, tanpa package baru.
- [x] **TASK 1 (DB cleanup — user, SQL Editor)** — `UPDATE taxes SET deleted_at=now() WHERE code IN ('PPN11','VAT_0')` → **6 rows** (2 × 3 entitas MSI/JCI/SOA). Sisa: VAT_FULL (0.11) + TAXFREE (0). ✅
- [x] **TASK 2 (DropdownManagementPage → full DB)** — buang SEED dummy. Tree data-driven: `dropdown_options` di-`select('*')` (group_key→list_key), nama/icon/desc grup+list dari metadata FE (`GROUP_META`/`LIST_META`, humanize fallback) + `currencies` (global) + `payment_terms` (scope `company_id`). Write persist + re-fetch (refreshKey): dropdown_options → INSERT / UPDATE(label,value,is_active) / soft-DELETE(deleted_at) / toggle / reorder(batch sort_order via Promise.all). currencies+payment_terms → **toggle is_active saja** (tak ada kolom sort_order; add/edit/delete digate-off + chip "toggle saja"). Toast sukses + error asli (`useToast` dari kit). Writes super_admin-only per RLS (role lain → toast error asli). Styling/layout dipertahankan.
- [x] **TASK 3 (hook)** — `src/hooks/useDropdownOptions.js`: `useDropdownOptions(listKey, fallback=[])` → `{options:[{id,label,value}], loading, error}`; fetch dropdown_options (is_active, deleted_at null, order sort_order); fallback bila error ATAU kosong. setState dalam `.then()` (pola lint repo).
- [x] **TASK 4 (QuotationFormPage)** — `UNIT_LABELS`→`UNIT_LABELS_FALLBACK` + `useDropdownOptions('unit_label', …)`; render pakai **opt.label sbg value+display** (seed unit label=value, preserve data lama `quotation_items.unit`). `SERVICE_TYPES`→`SERVICE_TYPES_FALLBACK` + hook; render pakai **opt.value** (seed value = freight_forwarding/customs/trading/trucking/warehousing, cocok). `VAT_OPTIONS`→`VAT_OPTIONS_FALLBACK`; VAT di-fetch dari `taxes` (company_id, is_active, deleted_at null, order rate) map rate→label (0→'0%',0.011→'1,1%',0.11→'11%'), **union dgn fallback** supaya 3 rate standar selalu ada (default non-customs 1,1% aman) + rate company ekstra. `unitLabels` di-pass sbg prop ke `SectionCard` (pola sama `currencies`).
- [x] **TASK 5 (InquiryFormPage)** — `SERVICE_TYPES`→`SERVICE_TYPES_FALLBACK` + `useDropdownOptions('service_type', …)`; render pakai opt.value.
- [x] **Build clean** — 2557 modules (+1 hook), 1.37s
- [ ] **Tes manual (belum — runtime):** Dropdown Mgmt — add/edit/delete/toggle/reorder dropdown_options persist + refetch; currency/payment_terms toggle only; toast error utk non-super. Quotation form — Service Type 5 opsi dari DB; Unit Label dari DB (simpan string sama spt dulu); VAT 0/1,1%/11% muncul + default per service_type benar; quote lama tetap kebaca. Inquiry form — Service Type dari DB. Semua fallback jalan bila offline/RLS-block.

### Dropdown Management → Tab 2 di GeneralPreferences (Phase 2.11D)
> Integrasi: Dropdown Management bukan page terpisah lagi, jadi tab di dalam `GeneralPreferencesPage`. 4 file diubah. Tanpa ubah DB/RLS, tanpa package baru.
- [x] **TASK 1 (integrasi)** — `DropdownManagementPage.jsx`: refactor default export `DropdownManagementPage({onHome})` → named `export function DropdownManagementBody()`; buang header (breadcrumb + h1), `page` bg `#ffffff` dihapus (jadi `{fontFamily,color}`), import lucide `ChevronRight`+`Layers` (cuma dipakai header) dibuang. Tree kiri + editor kanan + fetch payment_terms/currencies + loading/error TETAP. `GeneralPreferencesPage.jsx`: import `Tabs` (kit) + `{DropdownManagementBody}`; state `tab` (default `prefs`); render `<Tabs>` (Tab "Preferensi Umum" + "Dropdown Management") setelah PageHeader; konten prefs existing di-wrap `{tab==='prefs' && …}`; `{tab==='dropdown' && <DropdownManagementBody/>}`. Tab/section/styling existing TIDAK diubah
- [x] **TASK 2 (cleanup page terpisah)** — AdminSettingsHub: hapus card `dropdown-mgmt`. App.jsx: hapus lazy import `DropdownManagementPage` + onOpen map `dropdown-mgmt` + render block `admin-settings-dropdown`. File `DropdownManagementPage.jsx` dibiarkan (kini meng-export `DropdownManagementBody` yang di-import GeneralPreferences). kit.jsx ikon `layers` dibiarkan (harmless, di luar scope)
- [x] **Build clean** — 2556 modules, 1.46s
- [ ] **Tes manual (belum — runtime):** buka General Preferences → 2 tab muncul; Tab 1 prefs jalan spt biasa (save per-section, EntitySwitcher); Tab 2 = tree + editor; "Termin Pembayaran"/"Mata Uang" data DB nyata; add/edit/delete/toggle/reorder in-memory; hub TIDAK lagi ada card Dropdown Management; route lama `admin-settings-dropdown` sudah tak ada

### Dropdown Management page — port Lovable + fetch partial Supabase (Phase 2.11C)
> File baru `src/pages/foundation/admin-settings/DropdownManagementPage.jsx` (self-contained: lucide-react + inline styles + dnd reorder). 3 file diubah (kit.jsx, AdminSettingsHub.jsx, App.jsx). Tanpa ubah DB/RLS, tanpa package baru.
- [x] **TASK 1 (port)** — copy Lovable verbatim + 3 tweak: page bg CREAM→`#ffffff`; `minHeight:'100vh'` dihapus; outer padding root (`26px 28px 60px`) dihapus (shell handle). Padding internal panel/card dipertahankan. lucide-react import OK. `export default DropdownManagementPage`. Breadcrumb "Admin Settings" dibuat clickable (`onHome`) agar tidak dead-end (wiring, bukan ubah desain)
- [x] **TASK 2 (fetch partial)** — REAL: `payment_terms` (select id/code/name/is_active/company_id; scope `company_id`, super_admin=all; `deleted_at` null) → map {id,label:name,value:code,active}; `currencies` (code/name/symbol/is_active) → map {id:code,label:`name (symbol)`,value:code,active}. useEffect overwrite options list `payment_terms`+`currency` setelah fetch. 9 list lain KEEP dummy (comment `// TODO: fetch dari DB`). Loading spinner (`.dm-spinner`) + error state. Mutasi (add/edit/delete/toggle/reorder) **in-memory only** (belum tulis DB — out of scope). Import `useAuth`=`../../../contexts/useAuth`, supabase=`../../../lib/supabase` (path benar utk depth folder, brief tulis `../../` keliru)
- [x] **TASK 3 (hub + routing)** — AdminSettingsHub: +card "Dropdown Management" group "Keamanan & Sistem" (id `dropdown-mgmt`, icon `layers`, status available). kit.jsx: +ikon `layers` (import Layers + registry) supaya card icon render. App.jsx: +lazy import `DropdownManagementPage`, +onOpen map (`dropdown-mgmt`→`admin-settings-dropdown`), +render block (ErrorBoundary+Suspense, `onHome`→hub) — pola sama 4 page 2.11A
- [x] **Build clean** — 2556 modules (+1), 1.29s
- [ ] **Tes manual (belum — runtime):** hub card "Dropdown Management" → buka; tree group/list + count; pilih "Termin Pembayaran"/"Mata Uang" → data DB nyata (bukan dummy); list lain masih dummy; loading spinner muncul saat fetch; add/edit/delete/toggle/reorder bekerja (in-memory); breadcrumb "Admin Settings" balik ke hub; super_admin vs non-super (payment_terms scope company)

### Admin Settings — 4 page baru (Security/Audit/General/Integrations) port Lovable (Phase 2.11A)
> Port 5 file Lovable (AdminKit + 4 page) ke pola modul Nexus. Reuse `kit.jsx` + `tokens.js` existing (TANPA bikin `adminKit.js` baru). Lokasi `src/pages/foundation/admin-settings/`. Routing via `activeMenu` state-swap (bukan react-router). Tanpa ubah DB/RLS, tanpa package baru. 3 file diubah + 4 file baru.
- [x] **TASK 1 (kit.jsx)** — TIDAK buat adminKit.js (duplikasi). Tambah ke kit existing: 13 ikon lucide yang kurang (`smartphone/user/filter/download/messagecircle/webhook/key(KeyRound)/signal/zap/link2/copy/eye/eyeoff`) + primitive `KitSelect` (compact select; dipakai General/Audit). NumberStepper/Segmented/SaveButton(variant navy)/dll sudah ada
- [x] **TASK 2 (GeneralPreferencesPage)** — layout/styling Lovable PERSIS; shared-scope→import `./kit`+`./tokens`. Data: localStorage `general_prefs_<entity>` (load on entity change + persist per-section save). EntitySwitcher default ke company user via `useAuth` (ENTITY_CODE_BY_ID, set once). TODO: migrate ke DB settings table
- [x] **TASK 3 (SecurityPolicyPage)** — layout PERSIS; localStorage `security_policy_<entity>` (password policy/session/login protection/2FA per-role). EntitySwitcher default dari useAuth. TODO: DB + enforcement server-side
- [x] **TASK 4 (AuditLogPage)** — fetch REAL dari `user_login_logs` (login events: logged_in_at/ip/user_agent) + join `profiles` utk nama; RLS auto-scope (super_admin semua, admin/manager company). Map → type=login/module=Authentication. User-filter dropdown dinamis dari data. Filter/pagination/CSV export tetap jalan; loading/error/empty state. ⚠️ Belum ada tabel audit sistem penuh (TD-05) → baru login events; create/update/delete dst nyusul
- [x] **TASK 5 (IntegrationsPage)** — layout PERSIS; localStorage `integrations_wa/smtp/hook/keys` (load once + persist on change). WhatsApp/SMTP/n8n webhook/API keys interaktif (modal/slideover, test sim, generate/copy/revoke key). TODO: secrets pindah ke secret store server-side (bukan localStorage)
- [x] **TASK 6 (AdminSettingsHub)** — group "Roadmap" → "Keamanan & Sistem"; 4 card status `roadmap`→`available`. Card style existing dipertahankan. id card (security/audit/general/integrate) tetap
- [x] **TASK 7 (App.jsx)** — 4 lazy import + extend hub `onOpen` map (security/audit/general/integrate → `admin-settings-security/-audit/-general/-integrations`) + 4 render block (ErrorBoundary+Suspense, `onHome`→hub). Pola `admin-settings-*` existing menangani sidebar/scroll guard
- [x] **Build clean** — 2555 modules (+4), 1.34s
- [ ] **Tes manual (belum — runtime):** hub 4 card "Tersedia" → navigasi; General EntitySwitcher+save; Security toggle/stepper+save; Audit filter/pagination/CSV (data login_logs nyata); Integrations modal/slideover buka-tutup, test connection, generate/copy/revoke key; persist localStorage survive reload

## 2026-06-22

### CRM Report page — port Lovable + data Supabase real (Phase 2.10L)
> File baru `src/modules/crm/CRMReportPage.jsx` + wiring App.jsx (lazy import, menu, route). recharts ^3.8.1 (sudah terpasang). Tanpa ubah DB/RLS.
- [x] **TASK 1** — port visual Lovable ke `CRMReportPage.jsx` PERSIS (tokens C, kpiGrad/tint/shade, Ic icons, STATUS_STYLE/TYPE_COLOR/ENTITY_COLOR, st, CSS, LegendDots/Th/RankBadge/Pill, layout filter bar/KPI/area+bar chart/tabel/detail). Tidak simplify/ubah design
- [x] **TASK 2** — ganti dummy (mulberry32/genActivities/CURRENT/PREVIOUS/SALES/CUSTOMERS/NOTES) → fetch real. Roster sales/supervisor/manager (pola fetchSalesProfiles, entity dari user_roles.company_id). `activities` filter scheduled_for in range (done=status done; pending=todo & scheduled_for>=now; overdue=todo & <now; cancelled di-skip; type map call/whatsapp→Call, visit/meeting→Visit, email→Email, followup→Task). `accounts` (prospect/lead in range, by assigned_to). `quotations` (SENT/SUBMITTED in range, by created_by). KPI/trend/per-sales aggregate; period today/week/month + prev-window utk "vs periode lalu"; loading/error/empty
- [x] **TASK 3** — sidebar CRM menu Report (BarChart2) setelah Activity Log + route crm-report → CRMReportPage (lazy + ErrorBoundary + Suspense). Tak ada MENU_KEY_MAP (konsisten crm-calls/crm-activity-log)
- [x] **Build clean** — 2551 modules, 1.30s (CRMReportPage chunk 31.56kB)
- [ ] **Tes manual (belum — runtime):** KPI/trend/per-sales dari data nyata; filter period/sales/entity; loading→data; super_admin lintas entity vs non-super single company; chip vs periode lalu
- [ ] ⚠️ RLS `activities`/`accounts`/`quotations` scope per company/role — entity pills lain bisa kosong untuk non-super (bukan bug, by-RLS)

### Quotation — currency dropdown DB + VAT rate per service_type + PPN dynamic (Phase 2.10C)
> Prasyarat DB (SQL Editor, sudah ada; snapshot stale): tabel `currencies`, `quotations.vat_rate` DEFAULT 0.011, RPC save_quotation terima vat_rate. `currencies_read_all` USING(true). 3 file.
- [x] **TASK 1 (Form currency)** — state `currencies` + fetch (is_active, order code); SectionCard prop `currencies` → dropdown render code (fallback ['IDR','USD']). Kurs USD/calcRowTotal tak diubah (currency non-USD listing only, konversi USD-only out of scope)
- [x] **TASK 2 (Form VAT)** — VAT_OPTIONS (0/1,1%/11%) + `vatDefaultFor` (customs→0.11 else 0.011) + `vatLabel` (koma). header.vat_rate default+edit-populate. Field "Tarif PPN" antara Kurs USD & Notes. Auto-default saat service_type berubah (handleServiceTypeChange + handleInquiryChange), override manual OK. tax pakai header.vat_rate; vat_rate ke p_header+insertPayload; summary label dynamic
- [x] **TASK 3 (DetailPage on-screen)** — SELECT +vat_rate; effVat=`quot.vat_rate ?? 0.011`; tax recompute pakai effVat (bukan cuma label); sidebar label PPN dynamic koma. Dead print-area (html2canvas) tak disentuh
- [x] **TASK 4 (PDF)** — effVat=`quot.vat_rate ?? 0.011`; tax=`tax_amount ?? round((sub-disc)*effVat)`; label PPN dynamic koma; baris VAT hidden kalau effVat===0
- [x] Format label ID-koma konsisten Task 2/3/4 (`.replace('.',',')`)
- [x] **Build clean** — 2550 modules, 1.65s
- [ ] **Tes manual (belum — runtime):** dropdown currency EUR/SGD/JPY/MYR/USD/IDR muncul · service Customs→VAT 11%, lain→1,1% · override manual tersimpan+reload benar · detail+PDF label PPN dynamic · baris VAT hilang di PDF saat 0% · quote lama vat_rate null→fallback 1,1%

### Quotation PDF rewrite — html2canvas+jsPDF → @react-pdf/renderer (Phase 2.10A)
> Vector/text PDF, pagination otomatis. Ganti raster JPEG screenshot. 3 file (deps + QuotationPDF baru + QuotationDetailPage).
- [x] **TASK 1 (deps)** — uninstall html2canvas+jspdf (cuma dipakai di QuotationDetailPage, diverifikasi), install @react-pdf/renderer ^4.5.1
- [x] **TASK 2 (`QuotationPDF.jsx` BARU)** — `({quot, items, sections, creatorProfile})`, Document/Page/View/Text/Image/StyleSheet, font Helvetica built-in (no register). 9 section: header(logo h36, not fixed)/customer details(+APPROVED BY blank)/item tables per section (wrap=false per row, section-name+col-header nyatu, zebra, USD #a45a22, kolom 35/8/14/14/8/21, NO cost/margin)/grand summary(VAT 1.1%, GRAND TOTAL navy)/notes(navy left)/terms(orange left "Above rates :")/signatures 2-kolom/divider 8%+92%/footer navy `fixed` text-only (logo footer skip — filter invert tak didukung). Page paddingBottom 96 ≥ footer
- [x] **TASK 3 (QuotationDetailPage)** — hapus import html2canvas+jsPDF, +`{ pdf }`+QuotationPDF; handleDownloadPDF → `pdf(<QuotationPDF/>).toBlob()` → a.download `${quotation_no}_rev${revision??1}.pdf`; showToast?.(msg,'error') (urutan existing, bukan snippet kebalik); 2 tombol tetap. `#quotation-print-area` DIPERTAHANKAN (per instruksi; kini dead DOM, comment stale)
- [x] Internal (internal_notes/cost_price/margin) TIDAK di PDF
- [x] **Build clean** — 2550 modules (turun dari 2633: html2canvas+jsPDF dibuang; @react-pdf di chunk lazy), 1.50s
- [ ] **Tes manual (belum — runtime):** Download PDF → .pdf ter-download (bukan error) · teks selectable (bukan raster) · 9 section urut lengkap · tabel item tak kepotong di tengah baris · footer tiap halaman · grand total benar · internal_notes/cost/margin tak muncul · on-screen detail tetap normal
- [ ] **Catatan:** `#quotation-print-area` kini dead/unused DOM (dipertahankan per instruksi) — kandidat cleanup terpisah kalau memang tak dipakai on-screen

### Activity lifecycle → feed: tulis activity_logs + feed baca log (Phase 2.9Z)
> 3 file (ActivitiesPage/activityFeed/ActivityLogPage). Tanpa ubah DB (activity_logs + RLS sudah ada). Pilihan: edit via edited↔edited (A) + ganti sumber feed (B).
- [x] **TASK 1 (ActivitiesPage)** — fire-and-forget INSERT activity_logs (`changed_by: profile.id`; error→console.error, tak block/tak toast) tiap op: CREATE `.select('id').single()` → `{from:null,to:'todo'}`; mark-done `{from:row.status,to:'done'}`; cancel (resolve from via `rows.find`) `{to:'cancelled'}`; edit `{from:'edited',to:'edited'}`. deps +profile (+rows di cancel)
- [x] **TASK 2 (activityFeed)** — hapus sumber activities-row; ganti `activity_logs` (embed `activity:activities(type,contact_name,account:accounts(name))`, order changed_at desc limit 200, no company filter → RLS via parent). Map type:'activity' (tetap), actType=activity.type, title per to_status (baru/selesai/dibatalkan/diubah), subtitle contact_name||account.name, timestamp changed_at, user_id changed_by (auto nameMap). id `actlog-`
- [x] **TASK 3 (ActivityLogPage)** — no change: type tetap 'activity' → TYPE_TONE.activity + filter 'activity' existing tetap jalan (hanya title beda per status)
- [x] **Build clean** — 2633 modules, 1.19s
- [x] Catatan: activity lama tanpa baris activity_logs (kecuali visit via CRMDashboard sejak 2.9D) tak muncul di feed sampai di-aksi lagi (konsekuensi ganti sumber). FEED_ACT_LABEL tetap di-export; FEED_ACT_ICON tetap dipakai
- [ ] **Tes manual (belum — runtime):** create→"Aktivitas baru" · mark-done→"Aktivitas selesai" · edit→"Aktivitas diubah" · cancel→"Aktivitas dibatalkan" · nama user benar · subtitle kontak/akun · tak ada duplikat (activities-row sudah dihapus)

### PipelineKanban — aktifkan 4 kontrol toolbar + fix list crash + value 0 (Phase 2.9X)
> `PipelineKanbanPage.jsx` saja. Prasyarat DB: `accounts.estimated_value` sudah dibuat via SQL Editor. Tanpa ubah DB/RLS/file lain.
- [x] **Shared infra** — `openMenu` (1 popover) + overlay z140 click-outside (no doc listener) + menu z150 dalam wrapper relative; primitives `MenuBox`/`MenuOption`/`CheckRow` (navy aktif, Lucide check). Pipeline turunan: `filteredDeals = deals→member→panel`, `sortDeals()` per stage (board & list sama)
- [x] **TASK 1 (fix crash)** — `ListGroup`/`ListRow` +`onRowClick` (ganti `setDetailDeal` out-of-scope → ReferenceError); list pass `onRowClick={setDetailDeal}`
- [x] **TASK 2 (value)** — `estimated_value` ke SELECT + mapping `value: p.estimated_value ?? 0` (buang deal_value); display `rp()` existing (toLocaleString id-ID, 0/null→'—')
- [x] **TASK 3 (Semua Anggota)** — dropdown; members derive distinct assigned_to+full_name; "Semua Anggota" reset; filter assigned_to; label=member
- [x] **TASK 4 (sort "Nilai Pipeline")** — 6 opsi (Terbaru/Terlama/Nilai↑↓/Closing Terdekat null-last/Nama A–Z) via sortDeals per stage; default recent; aktif check+navy; label=opsi
- [x] **TASK 5 (Filter panel)** — draft→applied; Source(multi)+Customer Type(multi)+BANT(multi 6-7/4-5/1-3/0)+Closing(single bulan ini/30/60/90/semua); Terapkan+Reset; badge "Filter · N"; AND dgn member
- [x] **TASK 6 (list view)** — full setelah fix; member+filter+sort+value lewat filteredDeals/sortDeals di kedua view
- [x] **Header "X prospect aktif"** dari filteredDeals (excl won/lost) — konsisten saat filter aktif (disepakati)
- [x] **Build clean** — 2633 modules, 1.17s
- [ ] **Tes manual (belum — runtime):** toggle list→klik baris buka detail (bukan crash) · nilai kartu+total Rp setelah estimated_value diisi · member filter → board hanya deal-nya · sort Nilai Tertinggi → urutan berubah · Filter panel + badge angka · kombinasi member+filter+sort di board & list

### Org chart — warna node level-based (Phase 2.9U)
> `OrgStructurePage.jsx` saja. Node accent dari entity-based → level-based; badge entitas tetap entity-based.
- [x] `LEVEL_COLOR` map + `levelColorOf(level)` — Director #9B1C1C / Manager #166534 / Supervisor #4338CA / Staff #1E40AF / Operator #374151 / default #64748B
- [x] **Node** — `lc=levelColorOf(person.positionLevel)` dipakai avatar bg + card border-left + nama color + focus ring (hexA); **badge entitas tetap `ent.color`**
- [x] **Modal head avatar** ikut `lc` (drop `c` unused, `ent` tetap utk label)
- [x] **Fetch** `position:positions(name)` → `(name, level)`; mapping +`positionLevel`
- [x] **Build clean** — 2633 modules, 1.18s
- [x] Catatan: `positions.level` enum tak punya 'Operator'; 'Head' tak ada di mapping task → jatuh ke slate default (sesuai instruksi eksplisit)
- [ ] **Tes manual (belum — runtime):** avatar+border+nama per level (Director merah/Manager hijau/Supervisor indigo/Staff biru) · badge entitas tetap navy/orange/coral · node tanpa level → slate

### Positions — compact group-by-code + edit modal checkbox entitas (Phase 2.9T)
> `PositionsPage.jsx` saja (rewrite). Tanpa ubah `usePositions.js`/DB/file lain. Tabel lama 1 baris per (company,code) → "Manager" 3×.
- [x] **TASK 1 (compact list)** — fetch lokal `positions` `.eq('is_active',true).is('deleted_at',null).order('name').limit(1000)` (ganti usePositions paginated); group by `code` → 1 baris/code: Code badge · Name · LevelBadge · entity pills inline (MSI navy/JCI orange/SOA coral; absent=abu dim) · Status ACTIVE(3 entitas)/PARTIAL · Edit. Department dihapus, pagination dihapus, search client-side
- [x] **TASK 2 (edit modal, reuse AdminFormModal)** — Code (read-only edit / editable create) · Name · Level dropdown · 3 EntityCheckbox pre-checked sesuai row aktif
- [x] **Save (supabase.from langsung, BUKAN hook updatePosition yg null-kan department_id)** — pre-check existing rows lintas-3-entitas (incl inactive/deleted): dicentang+ada→UPDATE name/level/is_active=true/deleted_at=null (reactivate, hindari langgar UNIQUE(company_id,code)); dicentang+tak ada→INSERT; uncentang+aktif→UPDATE is_active=false (soft delete flag, bukan hard delete). Error→toast asli; sukses→toast+refetch
- [x] **Create dipertahankan** — "New Position" → modal create-mode (code editable, wajib ≥1 entitas)
- [x] **Build clean** — 2633 modules, 1.22s
- [x] **RLS caveat dicatat** — positions_read/insert/update scope non-super ke company sendiri → cross-entity view+save fully functional utk super_admin; admin biasa 1 badge & write lintas-entitas error RLS (ter-surface toast); tak nambah role-gating
- [ ] **Tes manual (belum — runtime):** Manager 1 baris badge MSI+JCI+SOA · edit pre-checked benar · uncheck→save→inactive & hilang dari badge · recheck→save→reactivate (bukan duplicate) · edit name/level→semua entitas ke-update · create code baru

### Struktur Organisasi (Org Chart) — port Lovable + Supabase (Phase 2.9S)
> File baru `src/modules/foundation/OrgStructurePage.jsx`. Modul Foundation (AdminShell). Tanpa ubah DB (kolom `profiles.reports_to` sudah ada).
- [x] **Import desain** — paste manual (Option A); MCP `claude_design`/DesignSync tak bisa auth di sesi token-pinned (`CLAUDE_CODE_OAUTH_TOKEN` tak bisa di-grant design scopes, `/design-login`/`/login` tak tersedia)
- [x] **Data (ganti dummy)** — `profiles` `.eq('active', true)` (TAK ada `deleted_at`) + embed `position:positions(name)` (FK `fk_profiles_position_id`) + `department:departments(name)` + `reports_to` + `company_id`; `.order('full_name').limit(1000)`
- [x] **company_id dari user_roles** — query terpisah (`user_roles.user_id→auth.users`, tak bisa embed dari profiles): `is_active=true`, `revoked_at IS NULL`, `order granted_at`, ambil pertama; **fallback `profiles.company_id`** kalau role aktif tak terlihat (RLS)
- [x] **Warna node by company_id** — MSI navy #144682 / JCI orange #E85A1E / SOA coral #F08C7D (badge+avatar+border-left+focus ring); unknown→abu fallback
- [x] **Edit modal "Atur Atasan"** — `update({ reports_to: value }).eq('id', nodeId)`, null=root; cycle-guard (exclude self+descendants); async save + saving/saveError + re-fetch tree setelah sukses
- [x] **Adaptasi shell** — `height:100vh`→`calc(100vh-120px)` card (AdminShell normal-flow); chart `overflow:auto`; loading/error+retry/empty/no-root states
- [x] **Brand/ikon** — company colors persis brand; Lucide `X`/`Search` (ganti glyph `×` + inline SVG); select chevron CSS data-URI (bukan emoji); no dark green; CSS connector scoped `.ocp`
- [x] **Sidebar** — AdminShell import `GitBranch`+`OrgStructurePage`; nav `org-structure` "Struktur Organisasi" SETELAH Positions (section Organization); PAGE_MAP ErrorBoundary
- [x] **Build clean** — 2633 modules, 1.21s
- [ ] **Tes manual (belum — runtime):** tree dari data nyata · warna per entitas benar · search dim/highlight · klik node → modal → ganti atasan → save → re-fetch & re-parent · set "tanpa atasan" → jadi root · cek RLS: non-super admin mungkin lihat "—" untuk position/department lintas-entitas (idealnya super_admin)

### Quotation mobile fix — list scroll horizontal + box tabel item muat konten (Phase 2.9R)
> MURNI mobile styling (`@media max-width:1023px`, desktop pixel-identik). 2 file. Tanpa DB/perhitungan/alignment/header-coral.
- [x] **TASK 1 (QuotationListPage)** — tabel di card `overflow:hidden` ke-clip di mobile (kolom Service tak terjangkau). Tambah `<style>` in-component `@media(max-width:1023px){ .q-list-table{ min-width:920px } }` + bungkus `<table>` dgn `<div overflowX:auto>` + className. Desktop `width:100%` + media mobile-only → identik
- [x] **TASK 2 (QuotationFormPage SectionCard)** — UNIT LABEL & QTY desimal ke-clip karena squeeze. `<style>` existing +blok `@media(max-width:1023px)`: `.q-item-table{min-width:800px}` (tak squeeze → wrapper overflowX:auto [sudah ada] scroll), `.q-unit-select{appearance:none +min-width:116px}` (panah dropdown hilang HANYA mobile, reclaim ruang, tetap tappable), `.qty-input{min-width:54px}` ("4,1" muat). className `q-item-table` ke table, `q-unit-select` ke select unit (qty input sudah `qty-input`)
- [x] Semua min-width ≤ lebar kolom desktop + media mobile-only → desktop tak berubah (full-width 2.9Q, alignment, header coral, panah unit desktop tetap)
- [x] **Build clean** — 2632 modules, 1.19s
- [ ] **Tes manual (belum — runtime mobile):** list geser samping → Service kebaca penuh · form "Per CBM"/"Per Shipment" muat + qty "4,1" lengkap + panah unit hilang + tabel scroll horizontal · desktop tak berubah

### Quotation line item — full-width tabel (form) + alignment konsisten + header coral (Phase 2.9Q)
> MURNI layout/styling, 2 file (QuotationFormPage + QuotationDetailPage). Tanpa DB/RPC/perhitungan.
- [x] **TASK 1 (full-width, FORM saja)** — `.nx-stack` 1-baris (kiri 60% header+sections+summary 40%) → **2 baris**: Baris 1 `.nx-stack` (header card 60% + summary 40% sticky, tak berubah); Baris 2 baru full-width = `sections.map(SectionCard)` + tombol Tambah Section. Responsive: `.nx-stack` collapse <1024px (index.css:44), Baris 2 stack di bawah pada mobile; drawer/sidebar/`flex-col lg:flex-row` tak disentuh
- [x] **Tradeoff (disepakati "two-row, summary on top")** — summary sticky kini di Baris 1 → scroll lewat saat dalam tabel; tiap SectionCard tetap punya "Section total", grand total di atas
- [x] **TASK 2 (alignment, kedua file on-screen)** — Description=left · Cost=right · Currency=center · Sell=right · Unit=center · Qty=center · Total=right (header ikut isi). Form: qty input right→center, select currency/unit +center; Detail: header cost→right, currency/unit header+cell→center
- [x] **TASK 3 (header coral, kedua file on-screen)** — baris header `background:#F08C7D` + teks `color:#144682` navy (kontras, bukan cream/putih). Bar judul section cream TIDAK diubah
- [x] **PDF `#quotation-print-area` TIDAK disentuh** (opsi "on-screen only"; dokumen customer tetap brand navy, tak ada kolom Cost Price)
- [x] **Build clean** — 2632 modules, 1.22s
- [ ] **Tes manual (belum — runtime):** form tabel full-width di desktop + rapih di mobile (layar kecil) · alignment sesuai spec, header sejajar isi, sama di form+detail · header coral+navy kebaca · angka/total tak berubah (cuma posisi)

## 2026-06-18

### Quotation save hardening — RPC atomik + internal/per-item notes + quote_date (Phase 2.9O)
> Prasyarat DB (SQL Editor, BELUM di snapshot): `quotations.internal_notes`/`quote_date`, RPC `save_quotation(p_quotation_id,p_header,p_items)` atomik, RLS `quotation_items` fix.
- [x] **QuotationDetailPage** — detail select +`inquiry_id,prospect_id,customer_id,internal_notes,quote_date,currency_code,margin_floor` (wajib biar form edit punya nilai real); blok "Catatan Internal (Sales)" on-screen `no-print` + TIDAK di `#quotation-print-area` (tak ke PDF customer); "Kirim ke Customer" +`.select('id')`+cek row → error asli
- [x] **QuotationFormPage TASK 1 (edit)** — update→delete→insert diganti 1 `rpc('save_quotation')`; `rpcError`→pesan asli (no fake success). `p_header` lengkap; **inquiry_id/prospect_id/customer_id ikut** (dulu ketinggalan), prospect/customer fallback ke prop kalau inquiry tak diganti; **internal_notes/currency_code/margin_floor dibaca dari prop real** (bukan default '' /0/'IDR' → cegah wipe). `p_items`=baseItemRows tanpa quotation_id
- [x] **TASK 2 (create)** — tetap insert +`.select('id').single()`+guard `!quot?.id`→error asli; items +quotation_id; payload +quote_date/internal_notes
- [x] **TASK 3 quote_date** — ganti field-hantu `tanggal` (load `quote_date||created_at`, bind setH('quote_date'), masuk payload) → tanggal kini kesimpen
- [x] **TASK 4 internal_notes** — textarea "Catatan Internal (Sales)" di form; sales-only (no-print, bukan di print-area)
- [x] **TASK 5 per-item notes** — input baris-expand (`<Fragment>`+`<tr colSpan=8>` di bawah item, bukan kolom ke-9 → tabel tak melebar); kebawa ke p_items; tetap customer-facing (PDF)
- [x] **Build clean** — 2632 modules, 1.18s; lint net-zero (QuotationFormPage 4→4, QuotationDetailPage 1→1, baseline)
- [ ] **Tes manual (belum — runtime):** edit semua header (tanggal/ganti inquiry/internal notes) → reload SEMUA kesimpen · edit item +per-item notes → kesimpen · internal notes di form+detail TAPI tidak di PDF · per-item notes di PDF · non-owner edit quotation orang lain → ERROR ASLI (bukan sukses palsu) · Kirim ke Customer gagal → error asli
- [ ] **Refresh schema_snapshot.sql** (kolom internal_notes/quote_date + RPC save_quotation belum ter-pull)

### Unified feed — sumber ke-5: login (user_login_logs) (Phase 2.9M)
> Tabel `user_login_logs` BARU (belum di schema_snapshot; RLS gating manager+/super/own).
- [x] **activityFeed.js** — fetch ke-5 `user_login_logs.select('*').order('logged_in_at',desc).limit(1000)` TANPA filter company/owner (andelin RLS, tak ada kolom company_id). Event `{type:'login', title:'Login', subtitle:nama user, icon:'LogIn'}`; subtitle dari nameMap (`||'Pengguna'`); user_id login ikut nameMap. `FEED_ACT_LABEL`/`FEED_ACT_ICON` +login
- [x] **ActivityLogPage.jsx** — filter tipe +opsi "Login"; ICONS +LogIn; TYPE_TONE.login slate (no dark green)
- [x] **CRMDashboardPage.jsx** — widget pakai feed sama → login auto top-7; ICONS registry +SVG `login` + ACT_META.login (slate) biar tak fallback info
- [x] **Build clean** — 2632 modules, 1.14s; lint net-zero (activityFeed 0, ActivityLogPage 3→3, CRMDashboard 8→8). Login `select('*')` no embed → tak 400
- [x] Scoping note (FYI bukan bug): widget dashboard sumber login andelin RLS → super_admin lihat login semua entitas (minor, hanya super; tak dipaksa single-entity)
- [ ] **Tes manual (belum — runtime):** Activity Log filter "Login" → event login muncul (min. punya sendiri) · feed campuran login interleaved · dashboard Recent Activity login nongol kalau terbaru · login sebagai sales → cuma login sendiri (RLS) · fetch user_login_logs tak 400

### Unified activity feed + Activity Log page + Recent Activity widget (Phase 2.9L)
> Shared feed (4 tabel) dipakai halaman Activity Log baru + widget dashboard. DB read-only.
- [x] **`activityFeed.js` (BARU, shared)** — `fetchActivityFeed({companyId,uid,isAllEntities,isSalesOnly})`: merge accounts(prospect)/inquiries/quotations/activities → events `{id,timestamp,type,actType,title,subtitle,user_id,user_name,icon}`, sort desc. Role-aware scoping (company always kecuali super; sales own via created_by/assigned_to). Nama user via nameMap profiles. `.limit(1000)`/sumber. Helper feedTimeAgo/feedFmtDate
- [x] **Embed FK names diverifikasi vs schema** (byte-identik dgn list page live): `inquiries_prospect_id_fkey`, `inquiries_customer_id_fkey`, `quotations_prospect_id_fkey`, `quotations_customer_id_fkey`, `activities_account_id_fkey` — semua prefix tabel sendiri, BUKAN legacy `prospects_*`/`customers_*`. Build clean → tak 400
- [x] **`ActivityLogPage.jsx` (BARU)** — feed penuh, newest-first (icon Lucide + title + subtitle + user + relatif+tanggal). Filter tipe + tanggal (today/this_week/this_month/custom); manager+ dropdown sales (fetchSalesProfiles RBAC), sales own-only. Pagination 25. `isAllEntities=super_admin`
- [x] **App.jsx** — lucide +History; menu `crm-activity-log` "Activity Log" PERSIS setelah Activities di grup CRM (item lain tak disentuh, TIDAK di MENU_KEY_MAP spt crm-calls); lazy import + route block
- [x] **CRMDashboardPage (Task 3)** — `recentActivity` pakai unified feed top-7 (ganti prospects-only); widget dashboard SELALU single-entity (`isAllEntities:false`, termasuk super_admin); ACT_META +`activity`; subtitle → "Prospect, inquiry, quotation & aktivitas terbaru". Render tak berubah
- [x] **Build clean** — 2632 modules, 1.33s; lint net-zero (activityFeed 0, ActivityLogPage 3 baseline, CRMDashboard 8→8, App 4→4)
- [ ] **Tes manual (belum — runtime):** menu Activity Log muncul di bawah Activities → halaman kebuka · feed campuran (prospect+inquiry+quotation+activity), terbaru di atas · filter tipe/tanggal jalan, manager filter sales, sales own-only · dashboard Recent Activity campuran (bukan cuma "Prospect baru") · login sales → feed own-only

### ActivitiesPage — tipe final (6) + convert-to-prospect aksi list + delete list (Phase 2.9K)
- [x] **Tipe (6):** TYPE_META/TYPE_FORM hapus `prospecting` → call(biru)/whatsapp(hijau)/visit(ungu)/meeting(navy)/email(amber)/followup(slate), no dark green. `activities.type` tanpa CHECK → aman tanpa ubah DB. Field kondisional: contact utk call|whatsapp, location utk visit|meeting, email/followup notes saja. **Field `prospect_name` dihapus dari form** (input/EMPTY_TASK/actToDraft/payload); legacy read dipertahankan
- [x] **Hapus flow prospecting dari centang:** handleCheck tak lagi `setConfirmProspect` saat type prospecting → centang selesai tak munculkan popup
- [x] **Convert-to-Prospect = aksi LIST:** icon UserPlus di kolom Aksi, muncul jika `!row.account_id` → ConfirmModal "Jadikan Prospek?" (reuse confirmProspect, wording baru) → openProspectFromActivity prefill `{name:contact_name, pic_name:contact_name, pic_phone:contact_phone}`. Activity tak berubah saat convert
- [x] **Delete LIST (super_admin):** icon Trash2 danger di kolom Aksi, muncul jika `erpRole==='super_admin'` (status apapun) → reuse deleteConfirm + ConfirmModal danger (2.9I) → handleDeleteActivity soft delete. Footer modal Hapus tetap ada
- [x] **Build clean** — 2630 modules, 1.16s; lint 5→5 (net-zero baseline)
- [ ] **DB migrasi (BELUM — manual):** `SELECT count(*) FROM activities WHERE type='prospecting';` lalu `UPDATE activities SET type='whatsapp'|'followup' WHERE type='prospecting';` (pilih satu). Detail di CLAUDE.md Phase 2.9K
- [ ] **Tes manual (belum — runtime):** form tipe = 6 baru (no prospecting) · call/whatsapp→contact, visit/meeting→location, email/followup→notes · list tanpa account → Convert muncul, dengan account → tidak · Convert → form prospek prefilled dari contact · centang → tak ada popup prospek · super_admin → icon Hapus tiap row, role lain tak ada · Hapus list → konfirmasi → soft delete

### ActivitiesPage — footer modal gate per-tombol (Phase 2.9J)
> Fix: tombol Hapus (super_admin) & Edit/Batalkan tertutup gate `status==='todo'` tunggal → dipisah per tombol.
- [x] Wrapper footer view-mode: `{act.status === 'todo' && …}` → `{(act.status === 'todo' || isSuperAdmin) && …}` (render hanya jika ada ≥1 tombol visible → no empty bar)
- [x] Gate per tombol: **Tandai Selesai** = `status==='todo'`; **Batalkan Aktivitas** = `status==='todo' && canEdit`; **Hapus** = `isSuperAdmin` (apapun status, paling kiri)
- [x] Handler (handleCheck/handleCancelActivity/handleDeleteActivity) tidak diubah. Build clean — 2630 modules, 1.13s; lint 5→5 (net-zero)
- [ ] **Tes manual (belum — runtime):** todo → Tandai Selesai (+Batalkan jk canEdit) · done+super_admin → tombol Hapus muncul (tanpa Tandai/Batalkan) · done+non-super → footer tak render (no empty bar) · klik Hapus di done → konfirmasi → soft delete

### ActivitiesPage — delete (super_admin) + fix popup "Buat Prospek?" (Phase 2.9I)
- [x] **Delete activity (super_admin)** — tombol "Hapus" (outline danger, paling kiri) di footer view-mode modal, muncul hanya jika `isSuperAdmin`. `handleDeleteActivity` = soft delete (`deleted_at=now()`) + toast + setDetail(null) + setDeleteConfirm(null) + fetchActivities(). Flow: Hapus → tutup modal + `ConfirmModal` variant=danger "Hapus Aktivitas?" → confirm → soft delete. Role non-super: tombol tak muncul
- [x] **Fix popup "Buat Prospek?"** — `handleCheck` urutan: UPDATE → fetchActivities() → setConfirmProspect(row) → setDetail(null) TERAKHIR (sebelumnya setConfirmProspect sebelum fetch/setDetail). ConfirmModal prospek `open={!!confirmProspect}` dikonfirmasi benar. Popup kini muncul saat "Tandai Selesai" prospecting dari modal
- [x] **Build clean** — 2630 modules, 1.22s; lint ActivitiesPage 5→5 (net-zero baseline)
- [ ] **Tes manual (belum — runtime):** super_admin buka modal → tombol Hapus → konfirmasi danger → soft delete, list refresh · role lain → Hapus tak muncul · prospecting + Tandai Selesai dari modal → popup "Buat Prospek?" muncul → [Ya] → form prospek prefilled

### ActivitiesPage — aksi dari dalam modal: Tandai Selesai + Batalkan (Phase 2.9H)
> Footer button bar di ActivityDetailModal view mode, muncul hanya saat status='todo'.
- [x] **Tombol "Tandai Selesai"** (primary navy, icon Check) → `handleCheck(detail)` (reuse — handle prospecting `setConfirmProspect` + mark done); muncul saat status todo (tanpa gate canEdit, konsisten centang list row)
- [x] **Tombol "Batalkan Aktivitas"** (outline danger) → `handleCancelActivity(id)`: UPDATE status='cancelled' + toast + setDetail(null) + fetchActivities(); muncul saat `status==='todo' && canEdit`
- [x] **handleCheck** +`setDetail(null)` setelah fetchActivities() (unconditional, no-op dari list row → modal auto-tutup setelah mark-done; popup "Buat Prospek?" tetap muncul utk prospecting krn state terpisah)
- [x] Modal signature +2 prop (onCancel, onMarkDone), mount di-wire `detail && handleCheck/handleCancelActivity`. Status done/cancelled → kedua tombol tak muncul
- [x] **Build clean** — 2630 modules, 1.07s; lint ActivitiesPage 5→5 (net-zero baseline)
- [ ] **Tes manual (belum — runtime):** modal todo → 2 tombol muncul · Tandai Selesai biasa → modal tutup, done di list · Tandai Selesai prospecting → popup "Buat Prospek?" · Batalkan → modal tutup, cancelled di list · modal done/cancelled → tombol tak muncul

### Activity module Phase 2C — edit + history tab + daily report (Phase 2.9G)
> Edit activity (3B), tab Aktivitas di CustomerDetail (3C), daily activity report di Dashboard (3D). DB tidak diubah.
- [x] **ActivitiesPage.jsx — edit mode di ActivityDetailModal** (bukan modal baru): tombol Edit (view mode, muncul jika `canEdit`) → form inline. `canEdit = isManagerOrAbove || assigned_to===self`; `isManagerOrAbove` incl. `sales_head` (selaras `is_manager_or_above()` DB). Field: type/tanggal/waktu/sales/account/prospect_name/contact/outcome/notes/next_action+date/location. Status TIDAK via form. `handleEditSave` UPDATE (tanpa status/company_id/created_by); **details merge-preserve** (tak hapus call_type/visit_type/mom)
- [x] **CustomerDetailPage.jsx — tab "Aktivitas"** setelah 'visit': fetch semua tipe (account_id, tanpa filter type), tabel Tanggal/Tipe/Status/Sales/Catatan-Outcome, badge copy ACT_TYPE_META/ACT_STATUS_META, count badge. Tab 'visit' tak diubah
- [x] **CRMDashboardPage.jsx — tab "Aktivitas"** (DASH_TABS ketiga, icon activity): `ActivityReportTab` role-aware. SALES → ringkasan hari ini (todo/done + done per tipe) + detail (filter tanggal). MANAGER+ → ringkasan per-sales hari ini (Todo/Done/per-tipe) + filter sales (fetchSalesProfiles RBAC) + filter tanggal + detail (+kolom Sales). Fetch company-scoped, assigned_to=uid jika sales. Tab Overview/Calendar tak diubah
- [x] **Build clean** — 2630 modules, 1.18s; 3 chunk rebuilt. Lint net +1 set-state-in-effect per file (baseline); "Cannot create components" CRMDashboard pre-existing (line shift, bukan dari edit ini)
- [ ] **Tes manual (belum — runtime):** edit activity (klik row→Edit→ubah→simpan→refresh) · sales hanya bisa edit milik sendiri (tombol Edit tak muncul kalau bukan owner/manager) · tab Aktivitas CustomerDetail (semua tipe muncul) · Dashboard Aktivitas login sales (ringkasan+detail diri) · login manager (summary per-sales + filter sales + detail)

### CRM role-scoping hardening (Phase 2.9F — hasil audit role akses)
> Tutup celah defense-in-depth + selaraskan frontend dgn RLS. Tampilan/fitur tidak diubah.
- [x] **LeadPoolPage.jsx frontend belt** — sebelumnya fetch `lead_pool` tanpa `company_id`/owner filter (sole guard = RLS). Tambah pola ProspectListPage: `isAllEntities=['super_admin']` + `isSalesOnly=['sales','operations']`; guard profile.id/company_id; `if(!isAllEntities) .eq('company_id')` + `if(isSalesOnly) .or('assigned_to.eq.{uid},created_by.eq.{uid}')`; deps effect diperbarui. Sales kini cuma lihat leads milik sendiri
- [x] **Admin role alignment** — `isAllEntities` `['super_admin','admin']`→`['super_admin']` di 7 file CRM (Prospect/Inquiry/Quotation/PipelineKanban/Activities/SalesCalls/LeadPool). Admin tadinya intent all-entities tapi RLS batasi own-entity (silent mismatch) → kini frontend single-entity utk admin, konsisten RLS. super_admin tetap lintas entitas
- [x] **Build clean** — 2630 modules, 1.07s; grep verifikasi 7/7 file `isAllEntities=['super_admin']`, 0 sisa `'admin'`. Lint LeadPool 2 set-state-in-effect (baseline)
- [ ] **Tes manual (belum — runtime):** login sales → LeadPool cuma leads sendiri · login admin → data CRM tetap jalan (single-entity, tak hilang) · login super_admin → data tetap lintas entitas

### Activity module Phase 2B — ActivitiesPage gantikan SalesCallsPage (Phase 2.9E)
> Halaman aktivitas terpadu (semua tipe) di route `crm-calls`. SalesCallsPage tidak dihapus.
- [x] **`src/modules/crm/ActivitiesPage.jsx` (BARU)** — list semua activity (call/visit/meeting/prospecting/followup) dari `activities`, role-aware (sales→assigned_to/created_by, manager+→se-entitas, super/admin→semua), embed account name + nama sales via client map. Kolom: Tanggal/Tipe/Status/Customer-Prospek/Sales/Catatan-Outcome/Aksi. Visual mirror SalesCallsPage (tokens C, pagination 20)
- [x] **Filter bar** — tipe, status (todo/done/cancelled), tanggal (hari ini/minggu ini/bulan ini/custom/semua), sales dropdown (RBAC `fetchSalesProfiles` sales-only)
- [x] **Tambah Task modal** — wajib: tipe+tanggal+salesperson; kondisional per tipe (call/prospecting→contact; prospecting→prospect_name; visit/meeting→location→details.location); notes/next_action/next_action_date/account_id opsional; `status='todo'` default
- [x] **Centang selesai** — todo row → `status='done'`+`completed_at`; `type='prospecting'` → ConfirmModal "Buat Prospek?" [Ya]→ProspectFormPage CREATE prefilled {name,pic_name,pic_phone} (pola PipelineKanban: setActiveMenu+setShowProspectForm+setEditingProspect), [Nanti saja]→mark done saja
- [x] **Badge** — status todo(abu outline)/done(hijau)/cancelled(merah outline); tipe call(biru)/visit(ungu)/meeting(navy)/prospecting(orange)/followup(amber). No emoji, brand MSI
- [x] **Option A — ProspectFormPage.jsx tweak** — `isEdit = !!prospect` → `!!prospect?.id` (prefill object tanpa id = CREATE, handleSave tetap INSERT) + effect seed name/pic_name/pic_phone dari prefill
- [x] **App.jsx** — lazy import ActivitiesPage; menu `crm-calls` label→'Activities' icon `PhoneCall`→`Activity` (PhoneCall dihapus dari import krn unused); route render → ActivitiesPage + 3 props; menu key `crm-calls` TIDAK diubah; SalesCallsPage import dibiarkan (per instruksi, 1 lint unused-var diterima)
- [x] **Build clean** — 2630 modules, 1.00s; chunk `ActivitiesPage` ter-emit (code-split). Lint baseline-category (set-state-in-effect/memoization-skip, sama pola SalesCallsPage)
- [ ] **Tes manual (belum dijalankan — runtime):** buka menu Activities (list muncul/kosong OK) · filter tipe/status/tanggal/sales · Tambah Task (field kondisional muncul per tipe) · simpan → status todo · centang biasa → done · centang prospecting → popup konfirmasi · login sales → cuma lihat task sendiri

## 2026-06-17

### Activity cutover Phase 2A — frontend call/visit → `activities`/`activity_logs` (Phase 2.9D)
> Cutover **data-layer only** — tampilan/UX tidak berubah. Setelah ini TIDAK ada kode menyentuh `sales_calls`/`sales_visits`/`sales_visit_logs`. Plan: `ACTIVITY_UI_MAP.md`.
- [x] **SalesCallsPage.jsx** — CRUD call → `activities` (type='call', status='done'). Read remap activities→bentuk call lama (UI tak diubah); write payload + `details jsonb` (call_type/duration_minutes/bant_collected); account name embed `accounts!activities_account_id_fkey`
- [x] **CRMDashboardPage.jsx** — kalender visit + 2 KPI mingguan (call/visit) read → `activities`; `handleSaveVisit` write → `activities` (type='visit', `details` visit_type/location/point_of_meeting/mom, `follow_up`→`next_action`); log write + VisitDetailModal timeline read → `activity_logs` (`activity_id`); `ownBySales` pakai `assigned_to`
- [x] **CustomerDetailPage.jsx** — History Visit + Health Score read → `activities` `.eq('account_id',id).eq('type','visit')` (**visit only**, call tidak digabung — keputusan disetujui)
- [x] **Mapping status** scheduled/completed/cancelled ⇄ todo/done/cancelled (`VISIT_TO_ACT_STATUS`/`ACT_TO_VISIT_STATUS`); `activity_logs` simpan vocab visit agar konsisten dgn data migrasi + lookup `VISIT_STATUS`
- [x] **Nama sales/log-author via client-side map** — `activities.assigned_to` & `activity_logs.changed_by` tak punya FK ke `profiles` (DB tak diubah) → fetch profiles by id (TANPA filter active, biar sales nonaktif/lama tetap kebaca) & map di JS. Account name tetap embed (FK ada)
- [x] **Fix #3 dropdown sales** — helper `fetchSalesProfiles(companyId)` (RBAC: `roles.code='sales'` per-company → `user_roles` is_active+revoked_at IS NULL+company_id → profiles active), **tanpa hardcode role_id**; ganti query bocor CRMDashboard (tanpa company filter) + konsistenkan SalesCallsPage. Default salesperson = user login dibiarkan
- [x] **Verifikasi:** `grep sales_calls|sales_visits|sales_visit_logs` di `src/` = **0 di luar `*.legacy`**; `npm run build` clean (**2629 modules, 886ms**)
- [ ] **Checklist tes manual (belum dijalankan — runtime):** log call baru muncul di list · tambah visit dari kalender → muncul di kalender+detail+timeline · detail customer tampil history visit · login sales → dropdown cuma sales se-entitas · KPI call/visit wajar
- [ ] **(Backlog) drop `sales_calls`/`sales_visits`/`sales_visit_logs`** setelah tes manual lolos (masih DORMANT)

### DB Changes via SQL Editor (Phase 2.9B/2.9C — dokumentasi, sudah masuk schema_snapshot.sql refresh: 71 tabel, ~8.395 baris)
> Tidak ada kode/DB diubah dari sesi dokumentasi ini. Detail lengkap: CLAUDE.md section **DB Changes via SQL Editor — 17 Jun 2026** + audit `CRM_FLOW.md` & `ACTIVITY_UI_MAP.md`.
- [x] **(2.9B) WON → customer (fix konversi).** Masalah: deal `pipeline_stage='WON'` tidak selalu jadi `account_status='customer'` — cuma jalur drag+`WinLossModal` yang konversi; form-edit ([ProspectFormPage.jsx:320-323](src/modules/crm/ProspectFormPage.jsx#L320)) & import TIDAK (gejala: TOKO DAMRAH, `created_by` null = jejak import). Fix: (1) backfill record WON yang masih `prospect`; (2) trigger `trg_set_customer_on_won` (function `set_customer_on_won`, `BEFORE INSERT OR UPDATE ON accounts`) set `account_status='customer'` + `became_customer_at`/`converted_at` saat `pipeline_stage='WON'`. **Menutup SEMUA jalur → DB jadi sumber kebenaran tunggal**; frontend `WinLossModal` jadi redundan (dibiarkan, tak dicabut)
- [x] **(2.9B) Tabel `public.activities` (Phase 1 modul Activity/Task).** Tabel baru yang menyatukan & akan menggantikan `sales_calls`+`sales_visits`: multi-tipe (`type` call/visit/meeting/prospecting/followup), `status` todo/done/cancelled, anchor `account_id`/`inquiry_id`/`quotation_id` (FK lengkap → menjawab titik-putus `CRM_FLOW.md`), `details jsonb` per-tipe, `migrated_from`, RLS role-aware niru `accounts`, 6 index. Data lama dimigrasi (0 calls + 2 visits)
- [x] **(2.9C) Tabel `public.activity_logs` (audit log status untuk `activities`).** Kolom: `activity_id` → activities(id) **ON DELETE CASCADE**, `changed_by`, `changed_at`, `from_status`, `to_status`, `notes`; 1 index (`activity_id`); **RLS scope via parent activity** (`EXISTS` ke `activities`, bukan `company_id` langsung). **Menggantikan `sales_visit_logs`**; data lama dimigrasi (2 log)
- [ ] **(Backlog) repoint frontend call/visit/log → `activities`/`activity_logs`:** `SalesCallsPage.jsx` + `CRMDashboardPage` AddVisitModal/VisitDetailModal/fetch masih pakai tabel lama (`sales_calls`/`sales_visits`/`sales_visit_logs`). Inventory UI: `ACTIVITY_UI_MAP.md`
- [ ] **(Backlog) drop `sales_calls` + `sales_visits` + `sales_visit_logs`** — HANYA setelah frontend dipindah & diverifikasi (saat ini DORMANT, jangan drop dulu)

### DB Schema Snapshot
- [x] `pg_dump --schema-only --schema=public` → `supabase/schema_snapshot.sql` (**69 tabel, ~8.140 baris**); pakai `pg_dump` (libpq), BUKAN `supabase db pull` (Docker tak terinstall). Menangkap semua perubahan SQL-Editor (4 kolom `assets`, `accounts` unified, RBAC 6 tabel, dll)
- [x] Roadmap 🔴 "schema ke version control" = **DONE**; cara refresh + instruksi "baca snapshot, bukan migrasi" dicatat di section **DB Schema Reference** (CLAUDE.md)

### Mobile Responsive Overhaul (Phase 2.8S–2.8X)
> Prinsip: SEMUA perilaku mobile di-gate breakpoint (`@media max-width:1023px` / Tailwind `lg:`) → **desktop ≥1024px tidak berubah sama sekali**.
- [x] **2.8S** — Fix layout BLANK di mobile: container utama `flex min-h-screen` → `flex flex-col lg:flex-row` (flex-row bikin mobile topbar ke-stretch ~2389px menutupi konten). App.jsx
- [x] **2.8T** — Responsive grids semua halaman utama: util opt-in di `index.css` (`.nx-grid-kpi`/`.nx-grid-3`/`.nx-grid-2`/`.nx-page-pad`/`.nx-stack`) aktif HANYA `@media(max-width:1023px)` + `!important` → desktop ≥1024 pixel-identik (inline style menang). Diterapkan: CRM/Inventory Dashboard, Asset (IT/detail/dashboard), Logistics (InputSP/SalesOrderDetail), Quotation detail/form (`nx-stack`), Finance Defaults. Tabel lebar pakai `overflow-x-auto`
- [x] **2.8U** — Navigasi mobile: hamburger drawer + App Launcher. `ModuleSidebar` prop `asDrawer`/`isOpen`/`onClose` (reuse, DRY); desktop sidebar static (`hidden lg:flex`), mobile drawer slide-in + overlay; hamburger (lucide `Menu`) muncul saat in-module; nav pills flat dihapus; App Launcher kini tampil di mobile; state `mobileDrawerOpen`. App.jsx
- [x] **2.8V→2.8W** — Kalender mobile: scroll horizontal (2.8V, sempat dibuat) → **diganti** pola dot + tap-for-detail (2.8W). Mobile <1024px cell mengecil (7 kolom muat tanpa scroll), event jadi DOT PASTEL (sky `#A5C8E8`/teal `#7FD8C4`/peach `#F5C9A8`, maks 3 + "+N"); tap tanggal ber-visit → bottom-sheet detail + Tambah Visit; desktop tetap event-text. Hybrid: visual CSS (`hidden`/`lg:`), tap via `useIsMobile` (matchMedia). `.nx-cal-scroll` dihapus total. CRMDashboardPage.jsx + index.css
- [x] **2.8X** — Recent Activity reflow mobile: timestamp+badge dibungkus `nx-act-meta`, di mobile pindah ke bawah nama (stack, tak overlap); desktop tetap horizontal. CRMDashboardPage.jsx + index.css

### CEO Unblock (Phase 2.8Y — DB change via SQL Editor, BUKAN di repo)
- [x] `profiles_read` di-DROP & dibuat ulang `USING (true)` → semua `authenticated` bisa baca `profiles`; `profiles_update` TIDAK disentuh. Akar masalah: `is_admin_or_above()` tak kenal role `ceo` → CEO ke-block baca nama assignee/sales
- [x] Aman sekarang (`profiles` bukan HRIS, tak ada data sensitif). **⚠️ WAJIB diperketat saat modul HRIS masuk**

### RLS Migration Backlog (planned — BESAR, risiko tinggi, sesi fresh)
- [ ] Migrasi RLS proper (RBAC-driven): ganti cek role hardcode → RBAC granular + entity boundary; prasyarat HRIS
- [ ] Audit 173 policy: ~51 `is_admin_or_above` (target migrasi), 70 `super_admin` (OK), 130 `company_id` (OK); `has_permission()` BROKEN (query tabel `permissions`/`role_permissions` yg tak ada)
- [ ] Cross-entity (`is_cross_entity`) sudah ada strukturnya di `role_permission_templates` & `user_menu_permissions`; rencana 4 fase — detail di CLAUDE.md section **Backlog — Migrasi RLS Proper (RBAC-driven)**

### Console cleanup + empty-catch fix (Phase 2.8Z)
- [x] Hapus 6 `console.log` debug di `AuthContext.jsx` (termasuk yg mem-leak seluruh row profile user) + 3 `console.log` data produk/company di `ProductsPage.jsx`; `console.error`/`console.warn` (error handling beneran) dipertahankan
- [x] `PipelineKanbanPage.jsx` empty `catch (_) {}` (drag `setData`) → `console.warn` + komentar (operasi opsional, non-fatal, tak di-surface); lint `no-empty` + `_` unused hilang (5→3)
- [x] Refresh angka basi CLAUDE.md Roadmap: App.jsx 4.618→4.667, CRMDashboardPage 1.850→1.996 (aktual `wc -l`)

### CRM Batch 1 — fix correctness frontend (Phase 2.9A, hasil AUDIT_CRM.md)
- [x] Nomor dokumen: hapus fallback `Date.now().slice(-4)` di InquiryForm/QuotationForm `generateXNo` → RPC gagal = throw → save dibatalkan + toast error (tak ada nomor non-sekuensial)
- [x] InquiryForm dropdown account tambah `.limit(1000)` (default-10 → account ke-11+ tak kepilih); QuotationList tambah `.is('deleted_at', null)`
- [x] Role-aware visibility (tiru pola ProspectListPage) di InquiryList/QuotationList/SalesCalls — super_admin lihat semua entitas, sales hanya miliknya; sales-own ikut kolom RLS (inquiries/quotations=created_by, sales_calls=salesperson_id/created_by)
- [x] `.single()`→`.maybeSingle()`: QuotationDetail (3×), CustomerDetail (2×), QuotationForm, InquiryForm — aman saat data minim (mis. payment_terms null)
- [x] `catch {}` CustomerDetail/CustomerList → `console.error` + cek error query fallback (tak senyap)
- [ ] (Batch DB terpisah — belum) RLS `inquiries_update` admin-only, UNIQUE accounts (dedup), write quotation atomik

### Backlog (update)
- [ ] Mobile polish — verifikasi visual per-halaman (Inventory/Asset/Logistics/Quotation) di <1024px
- [ ] Warning React "form field value without onChange handler" di input read-only — bersihkan
- [ ] (lanjut) audit CRUD policy lintas tabel · update `assigned_to` 24 laptop · cleanup office Semper · Software/Maintenance inline edit

## 2026-06-16

### Quotation
- [x] Fix PDF quotation (Phase 2.8M): section header dipindah ke `<thead>` sebagai `<tr className="pdf-no-break">` (anti ke-potong antar halaman) + box Notes (border kiri navy `#144682`) & Above rates/Terms (border kiri orange `#E85A1E`)
- [x] Fix RLS `quotations_update` (Phase 2.8Q, DB via SQL Editor): policy lama `is_admin_or_above()` → sales ke-block edit quotation sendiri. Diubah `(company_id=get_user_company_id() AND (is_manager_or_above() OR created_by=auth.uid())) OR is_super_admin()` + `WITH CHECK` sama. Sales kini bisa edit quotation miliknya

### Inventory
- [x] Dashboard Inventory baru (Phase 2.8N): `InventoryDashboardPage.jsx`, accent **TEAL #0D9488** (pembeda dari navy CRM), data Supabase asli (role-aware, company-scoped, `.limit(1000)`, `useWidth` callback ref). KPI: Total SKU, Total Nilai Inventory, Total On-Hand, Stok Menipis (<10). Charts: tren pergerakan (`stock_ledger`), stok per kategori, top 10 by nilai, per gudang
- [x] Fix nilai inventory (Phase 2.8N-fix): `unit_cost` semua NULL → pakai `default_price` (harga jual); subtitle "Berdasarkan harga jual"

### CRM
- [x] Fix visit dropdown (Phase 2.8O, CRMDashboard AddVisitModal): `.eq('account_status','prospect')` → `.in('account_status',['prospect','customer'])` supaya customer (mantan WON spt Indochem) muncul; label "Prospect" → "Prospect / Customer". Query KPI/salesPerf tetap prospect-only

### Asset Management
- [x] Inline edit semua tab `AssetDetailITPage` (Phase 2.8P): tombol Edit global → field Info/Spesifikasi/Network jadi input in-place (bukan modal/route), Save/Cancel, save lintas 3 tabel via UPSERT + error handling per-tabel + refetch tanpa reload. Assigned To = dropdown user (pilih → checked_out, kosong → available). Dropdown bernilai-valid utk field ber-constraint (status/asset_subtype/storage_type/depreciation_method). Health/Software/Maintenance read-only (TODO per-row)
- [x] Aktifkan brand/condition/department_id/assignment_status (Phase 2.8P-fix): keempat kolom ADA di DB (via SQL Editor, belum di migrasi). Edit form + view mode + save; fix `useAssetDetail` select tak ambil `assigned_to_user_id` (dropdown assignee kini pre-fill benar)
- [x] Schema (DB via SQL Editor, Phase 2.8R): `assets` ALTER ADD `condition`/`department_id`(FK departments)/`brand`/`assignment_status`(default 'available')
- [x] Master data (DB via SQL Editor): `asset_locations` "Head Office BSD" (branch_id MSI HO, NOT NULL); `departments` MSI +3 (HCGA/PPJK/CONSOLE); bulk insert **24 laptop MSI** ke `assets`+`asset_specifications`+`asset_network` (assigned_to kosong, assignment_status 'available')

### Catatan / Backlog
- [ ] ⬆️ **`supabase db pull`** NAIK PRIORITAS — 2× jadi penghambat hari ini (4 kolom `assets` + `unit_cost` via SQL Editor tak terlihat di file migrasi → sempat skip field)
- [ ] Audit CRUD policy lintas tabel — pola berulang "UPDATE admin-only" (`quotations_update`) + over-filter `account_status` (dashboard/visit/visibility)
- [ ] Update `assigned_to` 24 laptop MSI setelah re-audit
- [ ] Office "Semper": 2 branch duplikat di JCI (SEMPER + HO SEMP) — office asli MSI Group (hampir salah hapus), perlu dedup + ownership
- [ ] Inline edit tab Software & Lisensi + Maintenance (per-row terpisah, ada TODO)
- [ ] UI list Asset tampilkan field baru (condition/brand/department/assignment_status)

## 2026-06-15

### Security Hardening (milestone)
- [x] Cabut GRANT `anon` di **29 tabel sensitif** — 3 finansial (accounts/quotations/quotation_items) + 26 (finance/RBAC/user/CRM/inventory); RLS tetap lapisan kedua (defense-in-depth, anon ke-block di GRANT DAN RLS); GRANT `authenticated` diverifikasi lengkap sebelum revoke
- [ ] Backlog: tabel kategori REFERENCES/TRIGGER/TRUNCATE-only (companies/payment_terms/assets dll) belum dicabut — tidak urgent (tidak beri akses baca/tulis data)

### Bug Fixes — CRM & Auth (Phase 2.8B–2.8I, kode)
- [x] 2.8B — Form state hilang saat tab-switching (AuthContext Opsi A: `previousUserIdRef`, skip `setLoading` saat same-user re-emit SIGNED_IN/TOKEN_REFRESHED)
- [x] 2.8C — Prospect visibility role-aware (super_admin/admin semua entitas, manager se-entitas, sales own) + badge "Belum di-assign" + auto-assign saat sales create prospect
- [x] 2.8D — Dropdown Assigned To kosong di Edit Prospect (list select tak ikut `assigned_to` UUID; synthetic option utk cross-entity assignee)
- [x] 2.8E — `UNIT_LABELS` quotation jadi 13 (tambah Per CBM/KG/Ton/Container/Shipment/Trip di depan)
- [x] 2.8F — Soft stage gating (PROPOSAL butuh inquiry, WON butuh quotation — konfirmasi via ConfirmModal, bisa di-bypass)
- [x] 2.8G — Dashboard WON/Win Rate/Sales Performance hitung deal WON termasuk yang auto-convert jadi customer (`became_customer_at`); Total Prospects tetap prospect aktif saja
- [x] 2.8H — Chart Prospect Trend kosong → `useWidth` pakai callback ref (terukur saat container mount setelah data load)
- [x] 2.8I — Polish CRM Dashboard: gradient horizontal line (ungu→pink→biru), Bulan Lalu jadi abu, pie Lead Source pastel + fix crop

### Bug Fix — Quotation Duplikat (Phase 2.8J, DB/RLS)
- [x] ROOT CAUSE: RLS policy DELETE hilang di `quotation_items` → `.delete()` "sukses" 0-row tanpa error → insert numpuk → item+total dobel; Solusi: `CREATE POLICY quotation_items_delete` (kode tidak diubah)

### Data Cleanup (Phase 2.8K, DB)
- [x] Indochem dedup: hapus `64ee0492` (customer/NEW kosong), pertahankan `79c3562b` (prospect/WON + inquiry+quotation)
- [x] Indochem → customer (`account_status=customer`, `code=IJL`, `became_customer_at` stamped)
- [x] Konfirmasi auto-convert WON→customer SUDAH ADA di PipelineKanbanPage; Indochem hanya korban timing
- [x] Payment term "Cash Before Delivery" (`CBD`) ditambah ke MSI/JCI/SOA

### Audit Menyeluruh + Roadmap
- [x] Audit aplikasi menyeluruh (arsitektur/keamanan/maintainability/reliability/performance) → section **ROADMAP MENUJU PRODUCTION-GRADE** di CLAUDE.md (3 tier: SEGERA / JANGKA PENDEK / JANGKA PANJANG)

### Status Nggantung
- [ ] Quotation Hisaka (`QUO/MSI/2026/004`) — items di-wipe, total reset 0, **perlu input ulang via UI**
- [ ] Field Registry Level 1 — disepakati, nunggu 4 keputusan desain (struktur metadata, core 2a/2b, custom field JSONB, pilot form Prospect)

## 2026-06-14
### Accounts Unification — Single Master Customer
- [x] Tabel `prospects` → di-rename jadi `accounts` (master customer tunggal); kolom baru: `account_status` (prospect/customer/lost/free_agent/lead_pool), `owner_company_id`, `tier`, `code`, `nomor_kontrak`, `default_dc`, `last_activity_at`, `became_customer_at`
- [x] CRM migrasi penuh ke `accounts` (Batch 1–3): Pipeline/Prospect/Dashboard, Inquiry/Calls/Quotation embeds, Master Customer list+detail — `.eq('account_status', ...)` filter pipeline vs customer
- [x] WON di pipeline → auto-convert `account_status='customer'` + `became_customer_at`
- [x] Customer unification: tabel `customers` → `accounts` (single master); 5 FK di-repoint (sp_items, ar_ttfs, inquiries, quotations, accounts.converted_to); INDOMARCO pindah, id sama; tabel `customers` lama dipensiunkan (tidak dihapus)
- [x] db.js (Storbit SP/AR): listCustomers/upsertCustomer/deleteCustomer → `.from('accounts')`; embed pakai alias `customers:accounts!<constraint>(name)` agar mapper tidak berubah
- [x] CRM InquiryFormPage dropdown → accounts WHERE account_status='customer', simpan ke prospect_id; embed `customer:accounts!*_customer_id_fkey` di Inquiry/Quotation

### Master Customer — Sub-menu per Entitas + Detail Page
- [x] Master Customer 4 sub-menu per entitas: MSI / JCI / SOA / Free Agent (entityFilter)
- [x] CustomerListPage + CustomerDetailPage (dedicated page, state-swap mirror AssetDetailPage); CustomerFormModal named export untuk reuse
- [x] CustomerDetailPage: 6 tab (Info Dasar, Komersial, History Visit, BANT & Pipeline, Health Score, Notes); visual port dari Lovable handoff
- [x] Health Score tab — heuristik dari sinyal real (engagement visit, BANT, pipeline stage, kelengkapan profil, status kontrak); gauge SVG + breakdown; banner "skor sementara"

### User Access Management
- [x] Edge Functions baru: `delete-user` (gate super_admin, blokir hapus akun sendiri) + `reset-password` (min 8 char); pola two-client (caller ANON + admin SERVICE_ROLE)
- [x] Edit User: modal → full page (UserEditPage, state-swap); tab Profile/Permissions; Hapus User + Ubah Password (super_admin only, self-protection)
- [x] Avatar upload — bucket Storage `avatars`, kolom `profiles.avatar_url`, validasi tipe+2MB, overlay kamera + Hapus Foto

### Hierarchical RBAC
- [x] Permission model hierarki: 6 tabel (modules, module_menus, module_actions/menu_actions, user_menu_permissions, dst.) — 9 modules / 57 menus / 399 actions
- [x] AuthContext: `hasMenuPermission(menuKey, action)` + `menuPermissions` state; gating Sidebar + AppLauncher migrasi ke hasMenuPermission (fallback hasPermission → role → true)
- [x] Permission Matrix tab di Edit User (collapsible per module, select-all, diff-based save)

### Drop Legacy profiles.role
- [x] Deprecate `profiles.role` — role sekarang MURNI dari `user_roles` (erpRole/role di context)
- [x] Tahap 1–3 selesai (kode): DB functions dibersihkan, Edge Functions (manage-schema/create-user) pakai `is_super_admin()` RPC bukan profiles.role, frontend `src/` 0 ref profiles.role
- [ ] Tahap 4 — drop kolom `profiles.role` + type `user_role_legacy` (pending approval; verifikasi semua super_admin ada di user_roles dulu)

### Auth Lifecycle Hardening
- [x] Fix A — logout bersihkan `nexus_last_menu`/`nexus_last_module` di localStorage
- [x] Fix B — validasi restored activeMenu (redirect kalau user baru warisi menu yg tak punya akses)
- [x] Fix C — content-level access gate (AccessDeniedPage, defense-in-depth selain sidebar gating)
- [x] Fix D — `permissionsLoading` flag; AppLauncher dim+blocked "Memuat izin akses…" saat permission belum load; fix klik modul no-op setelah login user baru
- [x] Fix enterModule stale closure + auth listener setLoading(true) saat SIGNED_IN

### Lead Pool
- [x] Import 506 lead (arsip, ter-assign ke sales) → `account_status='lead_pool'`
- [x] LeadPoolPage — list/tabel (pagination client-side 25), filter source/type/search, 2 stat card; aksi "Tarik ke Pipeline" per row (account_status → prospect)
- [x] RLS aktif di `accounts`: sales lihat assigned_to=dia, manager se-entitas, super semua

## 2026-06-12
- [x] activeMenu di-persist ke localStorage (`nexus_last_menu`) — survive browser refresh
- [x] ProspectFormPage SOURCE options diperluas jadi 11 (sales_visit, cold_call, referral, existing_network, exhibition, instagram, linkedin, tiktok, website, walk_in, other); sinkron `SOURCE_LABELS_KP` + `sourceToSvc` di PipelineKanbanPage
- [x] Fix profiles query → `.eq('active', true)` (kolom `active`, bukan `is_active`)

## 2026-06-07
### Modules Live — HRGA, Assets, Logistics, Inventory, CRM Dashboard
- [x] HRGA Request module — schema 9 tabel + RLS + GRANT, 20 request types × 3 company, approval matrix; My Requests / Semua Request / detail modal; form ATK line items (migrations 020–024)
- [x] Asset Management — IT Equipment + Kendaraan list/detail (useAssets hook, server-side pagination); migrations 025–027 (specs, network, software licenses, maintenance, fuel logs)
- [x] Logistics Sales Order — SP list page (KPI cards, tabs, filter, bulk, pagination) + SP Detail page (5 tab, Finance Status INV/FP/SUB/KRM per-stage, Edit Item modal, Delete SP type-to-confirm)
- [x] Product Detail Modal — overlay modal, inline edit, toggle active, copy SKU (migration 028)
- [x] Inventory — Stok Barang (stock_summary JOIN products+warehouses) + Penerimaan Barang (goods receipt → stock_ledger)
- [x] App Launcher (Odoo-style grid, solid colour cards per group) + vertical sidebar per module
- [x] CRM Dashboard fully connected ke Supabase — KPI, Pipeline by Stage, Prospect Trend, Lead Source donut, Sales Performance, Calendar Jadwal Visit (semua real, mock dihapus)
- [x] CRM enhancements — Visit stepper (scheduled/completed/cancelled) + visit type + log history; BANT Scorecard; Sales Calls page; Win/Loss capture; Pricing Authority + Quote SLA; dashboard per-role
- [x] `src/lib/spCalc.js` — single source of truth kalkulasi SP (calcItem/groupBySP)
- [x] `src/components/ConfirmModal.jsx` — reusable confirm dialog (ganti semua window.confirm)
- [x] Permission gating DB-driven — role_permissions → hasPermission(module, action) + isCrossEntity

## 2026-06-06
### CRM UI — Visual Redesigns & New Pages
- [x] PipelineKanbanPage.jsx — full visual redesign: Lovable JSX port, chevron/arrow stage headers (clip-path), MSI Navy #144682, list/kanban toggle, drag-drop fade fix (draggingId reset on drop)
- [x] InputSPPage.jsx — full visual redesign: MSI brand colors, Montserrat headings, 2-row item sub-card grid (Product+SKU+QTY / UnitPrice+Shipping+ExpDate+Deadline), BTB trash red bg
- [x] CRMDashboardPage.jsx — new page created from Lovable design bundle, recharts (Bar/Pie/Area), mock data, registered at activeMenu === 'crm-dashboard'
- [x] CRM sidebar menu restructured — 4 items: Dashboard (crm-dashboard), Pipeline/Leads (crm-pipeline), Inquiry (crm-inquiry), Quotation (quotation-draft); removed section dividers and unused items
- [x] 'crm' removed from PLANNED_MODULES — CRM is live, parent click now expands dropdown without navigating to Coming Soon page
- [x] sp_items — tambah 3 kolom baru: sla_days, estimated_delivery_date, delivered_date; auto-calc estimatedDeliveryDate via useEffect; badge Est. Delivery / Delivered / Overdue di item card
- [x] Master Data status audit — documented in CLAUDE.md (12 tabel, status per tabel)
- [x] Roles structure defined — 13 system roles based on official org chart OD/HCGA-MSI/V/2026
- [x] Permission matrix documented in CLAUDE.md
- [x] Role migration completed — 7 deprecated soft-deleted, bod→ceo, supervisor→gm, logistic legacy handled
- [x] Role permissions seeded for all 13 roles (finance, hrga, it, manager, operations, sales, procurement, gm, ceo)
- [x] Company codes updated: SBI → SOA, JCI name → Jago Custom Indonesia
- [x] RolesPage updated with editable permission matrix for super_admin
- [x] Company names updated to PT full names (MSI, JCI, SOA)
- [x] Departments cleaned and synced with org chart — 9 dept MSI/SOA, 10 dept JCI (+PPJK)
- [x] Departments cleaned per entity — JCI (2), MSI (9), SOA (3) sesuai org chart
- [x] Positions cleaned and synced with org chart — MSI (10), JCI (3), SOA (3)
- [x] ProductsPage.jsx created — grid/list view, company tabs, Supabase integration, 78 products (MSI:10, JCI:5, SOA:63)
- [x] Products RLS fixed — super_admin can view all companies; fetch uses id→code map instead of join
- [x] Supabase default limit 10 discovered — fixed with .limit(1000); rule added to CLAUDE.md Debugging Field Notes
- [x] InquiryListPage designed in Lovable — pending port to Nexus
- [x] ProductDetailPage designed in Lovable — pending port to Nexus (adaptive service/product layout)
- [x] CRM tab navigation designed — pending implementation

## 2026-06-05
### CRM Module — Initial Implementation
- [x] Migration: tabel prospects, inquiries, quotations, quotation_items
- [x] RLS & GRANT permissions untuk 4 tabel CRM
- [x] ProspectListPage.jsx — list + filter + badge stage
- [x] ProspectFormPage.jsx — form tambah/edit
- [x] InquiryListPage.jsx — list + filter + auto-generate INQ number
- [x] InquiryFormPage.jsx — form inquiry
- [x] QuotationFormPage.jsx — sectioned table, multi-currency, VAT 1.1%
- [x] PipelineKanbanPage.jsx — 7 kolom, HTML5 drag and drop
- [x] Fix: column mismatch (company_name → name, payment_term_id → payment_terms_id)
- [x] Fix: inquiries.deleted_at ditambah via ALTER TABLE
- [x] Fix: quotation_items.total kolom GENERATED di-DROP, diganti plain numeric
- [x] Schema update: usd_rate di quotations, group_name/currency/unit_label/exchange_rate/total di quotation_items
- [x] Cost price tracking per quotation item — cost_price kolom di quotation_items, no-print CSS, profit summary di sidebar
- [x] Fix: input angka leading zero di QuotationFormPage (cost_price, unit_price, qty, usd_rate)
- [x] Fix: tambah kolom route di insert payload quotations (konfirmasi sudah ada, schema cache issue sisi Supabase)
- [x] QuotationListPage.jsx — list + filter status + search + pagination
- [x] QuotationDetailPage.jsx — detail read-only + sectioned table + print layout + internal cost/profit (no-print)
- [x] Routing App.jsx untuk quotation list, detail, form (create + edit mode via crmQuotationDetail + editingQuotation state)
- [x] PDF generator: jspdf + html2canvas, tombol Download PDF di QuotationDetailPage
- [x] Print area: logo MSI, customer info, sectioned table (tanpa cost_price), summary, notes, footer — off-screen div#quotation-print-area
- [x] Print area redesign: customer details table (dark-green label cells), terms/above rates, Best Regards + jabatan dari profiles.positions, footer alamat lengkap
- [x] Print area update: verticalAlign middle semua customer details cells, baris APPROVED BY + APPROVAL DATE, Best Regards ↔ Approved by side-by-side, divider orange-navy, footer navy dengan 2 kantor MSI
- [x] Fix: QuotationFormPage edit mode — prop quotation, useEffect populate header+sections, handleSave branch UPDATE vs INSERT
- [x] Fix: tambah field Terms & Conditions / Above Rates di QuotationFormPage + di insert/update payload quotations

## 2026-06-05 — SLA & Delivery Fields pada sp_items
- [x] db.js: tambah sla_days, estimated_delivery_date, delivered_date ke spFromDb dan spToDb
- [x] SalesOrderDetailPage EditItemModal: tambah baris baru di section TANGGAL (SLA hari, Estimated Delivery, Delivered Date)
- [x] Auto-calc estimatedDeliveryDate via useEffect saat shippingDate atau slaDays berubah (masih editable manual)
- [x] Item card footer: badge Est. Delivery (biru), badge Delivered (hijau), badge Overdue (merah) sesuai kondisi

## 2026-06-05 — BTB No: item-level → SP-level (sp_btbs table)
- [x] db.js: hapus btb_no dari rowFromDb/spToDb (column renamed btb_no_deprecated), tambah listSpBtbs/addSpBtb/deleteSpBtb/bulkInsertSpBtbs
- [x] SalesOrderDetailPage: hapus btbNo dari EditItemModal state+form+badge, tambah BTB Numbers section di Overview tab (fetch sp_btbs, inline add+delete)
- [x] InputSPPage: tambah BTB Numbers card (dynamic list add/remove), bulkInsertSpBtbs saat submit
- [x] App.jsx ShipmentModal + FinanceModal: hapus btbNo field dari state dan form

## 2026-06-05 — Dynamic Custom Fields for Customers
- [x] useCustomFields.js hook — fetch extra columns via get_table_columns RPC, filter STANDARD_COLUMNS, return customFields array
- [x] CustomFieldsSection.jsx — renders per data_type: text/number/boolean/date/datetime/jsonb, read-only mode support
- [x] CustomerModal updated: useCustomFields('customers'), customValues state, populate on edit, merge on save
- [x] CustomersPage updated: useCustomFields at page level, CustomFieldsSection read-only per card
- [x] STANDARD_COLUMNS exported from hook for use in App.jsx

## 2026-06-05 — Schema Manager
- [x] SchemaManagerPage.jsx — super admin UI untuk tambah kolom ke tabel existing via manage-schema Edge Function
- [x] Sidebar kiri: list tabel per grup (Master Data / CRM / Assets)
- [x] Tabel kolom existing dari information_schema (dengan RPC fallback)
- [x] Form: Field Label, Field Key (auto snake_case), Data Type dropdown, Default Value
- [x] SQL preview sebelum submit
- [x] Call Edge Function manage-schema dengan Bearer session token
- [x] Guard: hidden kalau role bukan 'super' atau 'super_admin'
- [x] Wire ke App.jsx: lazy import, menu entry Foundation > Master Data, render block
- [x] Catch-all exclusion untuk 'schema-manager' menu ID

## 2026-06-05 — Rebrand MSI Brand Guideline v1.0
- [x] Audit: scan semua file warna (#2F6B3F, #1a3a2a, Plus Jakarta Sans) — 27 files teridentifikasi
- [x] Navy #144682 replace dark green #1a3a2a di print area QuotationDetailPage
- [x] Navy gradient replace sidebar dark green #0F2A23/#173D34 di App.jsx
- [x] Orange #E85A1E replace accent green #2F6B3F di semua 19 module files (42 occurrences)
- [x] accentSoft #FEF2EC replace #E7EFE2 (60 occurrences)
- [x] Font: Montserrat (heading) + Inter (body) via Google Fonts — index.html + index.css + App.jsx
- [x] Active icon color updated #C8EFD9 → #FFB899 (orange tint on navy sidebar)
- [x] CLAUDE.md updated dengan Brand System token table
