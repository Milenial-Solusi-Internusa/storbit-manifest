# MVP Storbit — Audit Kesiapan Flow Operasional End-to-End

> **Peran:** auditor kritis & jujur. **Mode:** AUDIT (read-only, tak ada file diubah). **Kasus:** general trading Storbit/SOA (Indomarco), 18 langkah.
> **Basis bukti:** `src/` + `supabase/schema_snapshot.sql` per 2026-07-01. Klaim "ADA" hanya jika ada tabel + UI + persistensi yang benar-benar jalan.

---

## RINGKASAN EKSEKUTIF

Dari **18 langkah**: **~2 ADA**, **~8 PARSIAL**, **~8 BELUM ADA**.

**Skala kesiapan MVP end-to-end (jujur): ± 35–40%.** Sistem **KUAT di sisi pencatatan/tracking & finance** (input SP, manifest status, BTB number, invoice/AR) — ini bagian "dokumen & tagihan" dari flow. Tapi sistem **KOSONG TOTAL di sisi FULFILLMENT GUDANG** (picking, packing, surat jalan, booking armada, role gudang) — seluruh "tengah" flow operasional **belum ada sama sekali**.

**Tiga temuan paling penting untuk keputusan launch:**

1. **Fulfillment gudang = 0 fitur.** Langkah 5–9 (picking list → kirim ke gudang → packing list → surat jalan → booking armada) **tidak ada dalam bentuk apa pun** di codebase (grep `picking`/`packing`/`surat_jalan`/`delivery_note`/`fleet`/`armada` → nol hit fungsional). Tidak ada **role gudang**. Kalau definisi MVP adalah "end-to-end **di dalam sistem**", ini **blocker besar** — seluruh proses fisik gudang masih manual/di luar sistem.

2. **Beberapa yang "kelihatan ada" ternyata STUB/non-fungsional.** (a) Tab **Dokumen** di SP detail punya area drag-drop, tapi klik → toast *"Upload dokumen akan tersedia setelah tabel dokumen dimigrasi"* → **upload dokumen tidak berfungsi** (langkah 2, 8, 16). (b) Tombol **Konfirmasi/Cancel SP** ada, tapi handler-nya `// TODO: needs sp_items.status migration` → **hanya toast, tak menyimpan status** (langkah 3: CONFIRMED/CANCELLED tidak aktif). Kalau ini dianggap "ada", keputusan bisa salah.

3. **Inventory Storbit ADA tapi TERPUTUS dari SP.** Modul Inventory (SOA-scoped, `stock_summary`/`stock_ledger` dengan on_hand/reserved/available) berfungsi, dan `stock_ledger` bahkan punya movement `reserved`/`unreserved`. TAPI `sp_items` memakai `product_name`/`sku` sebagai **TEXT bebas (tanpa `product_id` FK)** → **tidak ada jembatan antara baris SP dan katalog stok** → tak bisa cek/reservasi stok untuk SP tertentu (langkah 4 = gap struktural, bukan sekadar "belum dipakai").

**Verdict:** Untuk **"tracking SP + finance"** → mostly bisa jalan (dengan gudang manual di luar sistem). Untuk **"end-to-end penuh di sistem"** → **BELUM siap** — bagian fulfillment gudang harus dibangun dulu, atau secara eksplisit diterima tetap manual untuk MVP.

---

## TABEL PER LANGKAH

| No | Langkah | Status | Detail teknis (file / tabel / field) | Catatan gap |
|----|---------|--------|--------------------------------------|-------------|
| 1 | SP masuk (input SP) | **ADA** | `InputSPPage.jsx` → `sp_items`. Header: SP Date*, Customer*, Distribution Center, Expired Date*, Notes. Line item: Product Name*, SKU, QTY*, Unit Price*, Ongkos Kirim, Exp Date, Expired Date. | Input berfungsi. Tak ada attach dokumen di form. Produk = teks bebas (lihat #4). |
| 2 | Upload dokumen SP | **BELUM** | Tab "Dokumen" di `SalesOrderDetailPage.jsx:~1090` = **placeholder**; klik upload → toast *"akan tersedia setelah tabel dokumen dimigrasi"*. Tak ada Storage bucket/tabel attachment SP. (Bucket `assets` cuma utk modul Asset.) | Tak ada penyimpanan/rujukan dokumen SP. Manual ke Drive, tak ada link di sistem. |
| 3 | Update manifest / progress SP | **PARSIAL** | Status **diturunkan** dari `qty` vs `shipped_qty` → Open/Partial/Closed. `SalesOrderPage.jsx`: map Open→OPEN, Partial→MANIFEST, Closed→CLOSED. `STATUS_META` juga punya CONFIRMED/CANCELLED **tapi tak terpakai**. Tombol Konfirmasi/Reject ada; `confirmModal` = `// TODO: needs sp_items.status migration` → **hanya toast**. | **Tak ada kolom status** di `sp_items`. **CONFIRMED/CANCELLED non-fungsional** (tak persist). Bukan state-machine sungguhan. |
| 4 | Cek stok | **PARSIAL (gap struktural)** | Inventory ADA & Storbit-scoped: `StokBarangPage`/`InventoryDashboardPage` baca `stock_summary` (on_hand/reserved/available) untuk company **SOA**. `stock_ledger` punya `movement_type` incl `reserved`/`unreserved` + `reference_type/id/no`. | **`sp_items` pakai `product_name`/`sku` TEXT, tanpa `product_id` FK** → tak ada link SP↔katalog stok. **Tak ada fitur reservasi/allocate stok untuk SP** (grep `allocate`/`reservasi` = 0). |
| 5 | Picking list | **BELUM** | grep `picking`/`pick_list` = 0 fungsional (2 hit = false positive: "picking customer", "without picking"). | Fitur tidak ada sama sekali. |
| 6 | Kirim picking ke gudang / role gudang | **BELUM** | 14 role kanonik (`ERP_ROLE_PRIORITY`): super_admin, admin, ceo, gm, manager, supervisor, finance_controller, finance, operations, sales, procurement, hrga, it, viewer. **Tak ada role gudang/warehouse.** Tak ada assignment/notif ke gudang. | Perlu role gudang + mekanisme assignment. `operations` = terdekat tapi bukan gudang. |
| 7 | Packing list | **BELUM** | grep `packing`/`packing_list` = 0. | Fitur tidak ada. |
| 8 | Surat jalan (driver) | **BELUM** | grep `surat_jalan`/`delivery_note`/`delivery order` = 0 fungsional (hanya disebut sebagai *contoh* dokumen di placeholder tab Dokumen). | Fitur tidak ada (tak ada tabel/generate/PDF). |
| 9 | Booking / pesan armada | **BELUM** | grep `fleet` = 0; `armada` = 1 (teks); `trucking` = freight/PPJK **ComingSoon** (bukan Storbit). Tak ada modul fleet/vendor trucking untuk Storbit. | Fitur tidak ada untuk Storbit. |
| 10 | Update status manifest (dikirim) | **PARSIAL** | `sp_items`: `shipping_date` (date), `kirim` (bool), `shipped_qty` (int). `ShipmentModal` (App.jsx, dari `ShipmentPage`) edit shipment; `shipped_qty` → menurunkan Partial/Closed. Toggle **KIRIM** di `FinanceModal`. | Field ada & bisa diedit. "Status dikirim" = boolean `kirim` + `shipping_date`, bukan status pengiriman berjenjang. |
| 11 | FU kelengkapan BTB | **BELUM** | Tak ada reminder/checklist BTB-readiness di sistem. | Proses manual (WA/email) — tak wajib fitur, tapi tak ada bantuan sistem. |
| 12 | BTB (Bukti Terima Barang) | **ADA (tanpa upload)** | `sp_btbs` (sp_no, btb_no, remarks, created_at). `SalesOrderDetailPage` panel "BTB Numbers": add/remove nomor BTB + remarks (`addSpBtb`/`db.js`). `btb_no` di `sp_items` = **deprecated** (`btb_no_deprecated`). | Nomor BTB berfungsi. **Tak ada upload bukti fisik BTB** (file). Tak ada tanggal-terima di record BTB (arrival_date terpisah di sp_items). |
| 13 | Update manifest (tgl terima BTB, status) | **PARSIAL** | `sp_items.arrival_date` diedit via EditDealModal (`SalesOrderDetailPage:348`). `ar_ttfs.tanggal_menerima` (di sisi invoice). BTB number di `sp_btbs`. | Tanggal terima ada (arrival_date), tapi **tak terikat langsung ke record BTB**; status tetap turunan qty. |
| 14 | Invoice | **PARSIAL** | `ar_ttfs` (no_ttf, tanggal_ttf, tanggal_menerima, **no_inv**, **no_sp**, customer_id, tgl_pembayaran, notes). Form add/edit manual (`showAddAR`/`editingAR`, `useTtfs`/`db.js`). Flag `inv` (bool) di `sp_items`. | **Invoice input MANUAL** (bukan auto-generate dari SP+BTB). Terhubung ke SP via `no_sp` **teks**, bukan FK. |
| 15 | Faktur pajak | **PARSIAL (minimal)** | Hanya **`sp_items.fp` (boolean)** + toggle "FP" di FinanceModal + badge "Faktur Pajak". `npwp` ada di `accounts`/customer. | **Tak ada record faktur pajak** (no nomor faktur, tanggal FP, DPP, PPN per-faktur). Cuma checkbox sudah/belum. |
| 16 | Surat jalan #2 (finance/tagihan) | **BELUM** | Hanya muncul sebagai *contoh* dokumen ("Surat Jalan") di placeholder tab Dokumen. Tak ada tabel/fitur. | Fungsi tak jelas & fitur tak ada. |
| 17 | Submit invoice ke sistem customer | **PARSIAL** | `sp_items.submit` (bool) + toggle "SUBMIT" di FinanceModal + `email_status`. | Submission eksternal (wajar di luar sistem), tapi **hanya flag "sudah submit"**, tak ada rujukan/bukti submission. |
| 18 | Update tanggal submit di manifest | **PARSIAL/ADA** | `sp_items.submit_date` (date) ada. Toggle SUBMIT di FinanceModal. | Kolom `submit_date` ada; perlu dicek apakah tanggalnya diinput manual di modal (toggle SUBMIT terlihat boolean; tanggal mungkin auto/terpisah). Field tersedia. |

\* = field wajib.

---

## FITUR YANG SAMA SEKALI BELUM ADA (dengan estimasi effort)

| Fitur | Langkah | Effort | Catatan |
|-------|---------|--------|---------|
| **Upload/attach dokumen SP** (Storage + tabel attachment) | 2, 8, 16 | **Sedang** | UI drag-drop sudah ada (stub). Butuh Supabase Storage bucket + tabel `sp_documents` (sp_no, type, file_url, uploaded_by) + RLS + wiring upload. Pintu masuk paling cepat karena UI-nya sudah dirancang. |
| **Picking list** | 5 | **Sedang–Besar** | Tabel `picking_lists`/`picking_items` (generate dari sp_items), assignment ke gudang, cetak/PDF, status picked. |
| **Packing list** | 7 | **Sedang** | Tabel `packing_lists` (dari picking), koli/berat, cetak. |
| **Surat jalan (delivery note)** | 8 | **Sedang** | Tabel `delivery_notes` (link SP), nomor DO, driver, plat, PDF cetak. |
| **Booking armada / trucking Storbit** | 9 | **Besar** | Modul vendor trucking + booking + biaya (Storbit ≠ freight MSI). |
| **Role gudang + assignment/notif** | 6 | **Kecil** (role) / **Sedang** (workflow) | Tambah role `warehouse` di `roles` + permission; wiring assignment picking→gudang + notif (infra notif sudah ada). |
| **Reminder/checklist BTB** | 11 | **Kecil** | Opsional; checklist readiness. |
| **Record faktur pajak** (bukan cuma flag) | 15 | **Sedang** | Kolom/tabel faktur (no_faktur, tgl, DPP, PPN) link ke invoice. |
| **Persistensi status Confirm/Cancel SP** | 3 | **Kecil–Sedang** | Tambah `sp_items.status` (enum) + migrasi + wire tombol yang sudah ada (saat ini hanya toast). |
| **Link SP↔katalog produk + reservasi stok** | 4 | **Besar** | `sp_items.product_id` FK ke `products` + alur allocate/reserve via `stock_ledger` (movement `reserved` sudah didukung schema). Perubahan data model + migrasi data teks→FK. |

---

## REKOMENDASI PRIORITAS (untuk keputusan LAUNCH)

**Prinsip:** sistem hari ini = **"SP tracker + finance ledger"**, bukan "warehouse management". Untuk MVP cepat, jangan paksa membangun WMS penuh — pisahkan yang **WAJIB di sistem** vs yang **boleh tetap manual** dulu.

### 🔴 WAJIB dibenahi sebelum launch (murah, tapi menyesatkan kalau dibiarkan)
1. **Persistensi status SP (langkah 3)** — tombol Konfirmasi/Cancel yang **tampak jalan tapi hanya toast** itu berbahaya (user kira SP ter-confirm padahal tidak). Minimal: tambah `sp_items.status` + wire, ATAU sembunyikan tombol Confirm/Cancel sampai siap. **Effort kecil.**
2. **Upload/link dokumen SP (langkah 2/8/12)** — UI sudah ada (stub). Aktifkan Storage + tabel `sp_documents` supaya Surat Jalan / PO customer / **bukti BTB** bisa dilampirkan di sistem (biar tak tercecer di Drive). **Effort sedang, ROI tinggi** (menutup 3 langkah dokumen sekaligus). Alternatif ultra-cepat: cukup field **URL/link** ke Drive per SP (effort kecil).

### 🟡 BOLEH tetap MANUAL untuk MVP (tanpa menghalangi proses jalan)
- **Picking list, Packing list, Surat jalan, Booking armada (langkah 5,7,8,9)** — proses fisik gudang. Untuk MVP, gudang tetap pakai spreadsheet + surat jalan manual; sistem cukup **mencatat status "dikirim" + shipping_date + surat jalan sebagai dokumen upload** (bila #2 di atas jadi). Bangun WMS bertahap setelah launch.
- **Role gudang (langkah 6)** — sementara pakai `operations`. Buat role `warehouse` **bila & saat** fitur picking/packing dibangun (percuma bikin role tanpa fitur).
- **Faktur pajak (langkah 15)** — untuk MVP cukup flag `fp` + faktur digenerate di sistem pajak eksternal (Coretax/e-Faktur). Bangun record faktur nanti kalau perlu rekap.
- **Reservasi stok (langkah 4)** — cek stok tetap di spreadsheet warehouse (sesuai kondisi sekarang). Integrasi SP↔inventory = proyek besar, taruh **setelah** MVP.

### 🟢 Sudah cukup untuk MVP (jangan diutak-atik dulu)
- Input SP (1), BTB numbers (12), manifest tracking Open/Partial/Closed + shipping/kirim (3/10), invoice/AR manual (14), flag submit + submit_date (17/18).

### Catatan akses (role)
- **Role gudang:** BELUM ADA (14 role kanonik, tak ada warehouse) → gap untuk end-to-end; tunda sampai fitur gudang dibangun.
- **Finance (El):** role `finance`/`finance_controller` **ada**. Akses invoice/AR = via menu `ar`/`outstanding` (menuKey `fin_ar`/`fin_outstanding`) + edit di FinancePage digate `can(role,'finance')`. **Berfungsi jika `fin_ar`/`fin_outstanding` sudah di-grant** ke user finance (cek grant per-user, pola sama audit RBAC F9) — **verifikasi grant sebelum launch** agar El benar-benar bisa akses.

### Ringkas keputusan launch
- **Kalau MVP = "kelola SP + finance di sistem, gudang manual":** bisa launch **setelah** fix #1 (status) + #2 (dokumen/link) — **effort kecil-sedang, beberapa hari**.
- **Kalau MVP = "end-to-end penuh di sistem (termasuk picking→surat jalan→armada)":** **BELUM siap** — perlu bangun modul fulfillment gudang (effort besar, mingguan–bulanan). Rekomendasi: **jangan** — launch versi tracking dulu, bangun WMS bertahap.
