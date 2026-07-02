# STATUS PROYEK — Nexus by MSI (Storbit MVP)

> Ringkasan status untuk pemilik proyek. Diambil dari `CLAUDE.md`, `PROGRESS.md`, dan daftar tugas tertunda.
> Tanggal rekap: **2026-07-03** · Branch aktif: **`restruktur-nexus`** (belum merge ke `main`/production).
> Catatan penting: "SELESAI" di bawah = selesai secara kode **di branch** dan diverifikasi build/lint. Banyak fitur bertanda **belum tes runtime penuh** (perlu login). DB dijalankan manual oleh pemilik via SQL Editor.

## SUDAH SELESAI

| Fitur / Modul | Ringkas | Catatan status |
|---|---|---|
| Slice 0.1 — Status SP | `sp_status` draft/confirmed/cancelled + RPC `set_sp_status`; Konfirmasi/Tolak SP persist | Live di branch; belum tes runtime penuh |
| RBAC hardening | Gate menu MOM/CRM, AdminShell role gate, F4 content-gate, redirect-guard `isMenuAccessible`, cabut `operations` dari 4 menu CRM | Selesai |
| Fase 2 — Picking List | Tabel `picking_lists`/`picking_list_items` + RPC `generate_picking_from_sp`; halaman list + detail; Generate dari SP confirmed | Belum tes runtime penuh |
| Fase 2 — Cancel Picking | RPC `cancel_picking` (release reservasi) + tombol Batalkan; SP bisa generate ulang | Belum tes runtime penuh |
| Import Data Produksi Storbit | 720 baris / 435 SP / qty 984.026 / nilai acuan Rp 7.736.680.654; 4 accounts, 38 products, sp_btbs 187 | Terverifikasi via SQL; entitas SOA |
| Fase 0.2 — product_id backfill | `sp_items.product_id` + propagate ke picking/delivery items | Selesai |
| Fase 0.3 — SP document link | `sp_items.external_url` + fallback link dokumen | Selesai |
| Fase 3 — Packing & Surat Jalan | Tabel `delivery_notes`/`delivery_note_items` + RPC `generate_delivery_from_picking`; halaman + PDF; item editable draft; komponen `ProductPicker` shared | Belum tes runtime penuh |
| Fase 1 — Cek stok & reservasi | `stock_summary` view (on_hand/reserved/available); reserve saat generate; unreserve saat cancel; outbound saat dispatch; badge qty_short | Belum tes runtime penuh |
| Material Packing + PickingListPDF | Tabel `picking_list_materials` + RPC add/delete (potong/reverse stok); section Material Packing; PDF checklist gudang | Belum tes runtime penuh |
| Lokasi Rak (Stok Barang) | Tabel `product_warehouse_location`; kolom "Lokasi Rak" inline-edit ikut filter gudang; auto-isi `location_detail` saat generate picking | Belum tes runtime penuh |
| Riwayat Harga produk (kontrak/PKS) | Tabel `product_price_history` + trigger log + RPC `attach_price_contract_info`; section Riwayat Harga; info kontrak opsional; fix RLS `products_update` (bypass super_admin) | Belum tes runtime penuh |
| BulkEditPricePage — Update Harga Massal | Halaman baru (super_admin); RPC `bulk_update_product_prices`; picker role-aware lintas entitas (super) | Belum tes runtime; snapshot belum memuat RPC |
| ProductPicker dropdown-only di form SP | InputSPPage + FormModal + EditItemModal; prefill harga snapshot dari `default_price` (tetap editable); `product_id` tersimpan; enforcement lenient legacy | Belum tes runtime penuh |
| Fix dropdown Customer kosong | `customerFromDb` mapping `active` → `is_active` (accounts) | Belum tes runtime |
| Fase 3.0A–3.0C — Restruktur navigasi + rebrand | Sidebar 2-level, HomeDashboard, palet warna baru, role-gating quick action | Selesai (fase sebelumnya) |
| Modul CRM, Quotation, Rate Sheet, MOM, Asset, HRGA, Reporting | Dibangun di fase 2.x (lihat `PROGRESS.md` untuk detail per-fase) | Live |

## BELUM DIKERJAKAN / BACKLOG

| Item | Deskripsi | Sumber / Catatan |
|---|---|---|
| Refresh `schema_snapshot.sql` | Snapshot terakhir di `5a8fba2`; belum memuat RPC `bulk_update_product_prices` (dibuat manual setelahnya). Perlu `pg_dump` sebelum merge ke `main` | Governance; wajib sebelum production |
| Merge `restruktur-nexus` → `main` | Seluruh Storbit MVP masih di branch; belum ke production | Setelah snapshot refresh + smoke test |
| Smoke test UI menyeluruh | Banyak fitur "build clean, belum tes runtime" — perlu login berbagai role | Verifikasi runtime |
| Konsolidasi 3 form input produk SP | InputSPPage `ItemRow`, FormModal, EditItemModal menduplikasi field & logika produk; idealnya satu komponen input-item bersama | Utang teknis (dicatat di AUDIT.md) |
| Verifikasi mapping 30 item kontrak PKS Indomarco | Pastikan pemetaan 30 item kontrak PKS sesuai; belum dikonfirmasi | Perlu konfirmasi |
| Follow-up field DC / Arrival Date / SLA di modal SP | Penyesuaian/kelengkapan field modal SP untuk kebutuhan list Gigih | Follow-up permintaan Gigih |
| Fase 5 — Role gudang | Peran/izin khusus operator gudang untuk alur fulfillment | Belum dimulai |
| Fase 6 — BTB & finance/invoice/faktur | Modul BTB lanjutan + keuangan (invoice/faktur); saat ini belum ada tabel `invoices`, penagihan hanya flag `inv`/`fp` + AR | Belum dimulai; lihat audit alur harga |
| Pembeda visual Inventory: produk dagang vs operasional | Halaman Inventory bedakan visual produk trading (FG+Sub-Assembly) vs barang operasional gudang (Asset/Inventory/Raw Material) by `inventory_class` | TODO UI (di luar scope import) |
| Filter "Bulan Ini" — empty-state | Tampilan/empty-state saat filter Bulan Ini tidak ada data | Perbaikan UX |
| Selisih jumlah SP 431 vs 435 | Menunggu konfirmasi sumber angka dari Gigih; data sistem (720 baris/435 SP) konsisten dengan hasil import | Perlu konfirmasi (tidak ada aksi sistem sekarang) |

## PERLU KONFIRMASI (ringkas)

| Hal | Status |
|---|---|
| Selisih SP 431 vs 435 | Menunggu Gigih; data sistem konsisten (435) |
| Mapping 30 item kontrak PKS Indomarco | Belum diverifikasi |
| RPC `bulk_update_product_prices` di snapshot | Belum di-refresh; perlu `pg_dump` |
