# Cetak Biru — Finance & Accounting Nexus

**Versi 1.0 · 9 September 2026**
Redesign alur invoice Storbit dan struktur modul Finance & Accounting.

| | |
|---|---|
| Entitas | MSI · JCI · SOA (Storbit) |
| Cakupan v1 | Piutang Storbit. MSI dan JCI menyusul, alasannya di §12 |
| Dasar | Info Finance 9 Sep 2026 · struktur organisasi 18 Mei 2026 · audit kode & data produksi 9 Sep 2026 |
| Sistem pembanding | Odoo (yang dipakai MSI hari ini) |

Dokumen ini ditulis untuk dibaca lintas sesi. Setiap angka di dalamnya diukur, bukan diperkirakan; sumbernya disebut supaya bisa diverifikasi ulang.

> **Riwayat berkas.** Masuk repo 9 Sep 2026 dari `BLUEPRINT_FINANCE_STORBIT.md`, dinamai ulang mengikuti konvensi `docs/Governance/` (`NN_UPPER_SNAKE.md`, melanjutkan `10_TASK_BREAKDOWN.md`). Seluruh rujukan file, nomor migrasi, nama kolom, dan nama fungsi disisir terhadap keadaan repo pada tanggal yang sama; koreksi yang dilakukan ditandai **[koreksi 9 Sep 2026]** di tempatnya masing-masing.
>
> ⚠️ **Angka produksinya TIDAK bisa diverifikasi ulang dari repo.** `schema_snapshot.sql` bersifat *schema-only* sejak 5 Sep 2026 (nol blok `COPY` — lihat `03_DATA_MODEL.md` gotcha #23), jadi seluruh hitungan baris di §2, §11, dan Lampiran A hanya bisa diuji ulang dengan query langsung ke produksi. Angkanya dibiarkan apa adanya.

---

## 1. Prinsip & Keputusan Pokok

Empat prinsip ini menurunkan seluruh keputusan di dokumen ini. Kalau nanti ada usulan yang bertabrakan dengan salah satunya, yang gugur usulannya, bukan prinsipnya.

| # | Prinsip | Isi dan konsekuensinya |
|---|---|---|
| **F1** | **Dokumen lahir dari dokumen** | PO Customer → Sales Order → Surat Jalan → BTB → Invoice. Tiap dokumen menyimpan pointer ke induknya. Tidak ada invoice yatim. |
| **F2** | **Invoice adalah anak BTB, bukan anak SP** | Satu BTB satu invoice. Satu SP dengan dua BTB menghasilkan dua invoice. Ini yang membuat penagihan parsial mungkin. |
| **F3** | **Tanggal dokumen ≠ tanggal input** | `btb_date` dan `invoice_date` adalah tanggal kejadian di dunia nyata. `created_at` adalah tanggal orang mengetik. Jurnal mengikuti yang pertama, supaya laporan periode tetap valid saat ada input terlambat lintas bulan. |
| **F4** | **Jurnal lahir dari BTB** | Serah terima barang adalah kejadian akuntansinya. Invoice adalah dokumen penagihan di atasnya, bukan pemicu jurnal. |

### Keputusan yang sudah diambil (9 Sep 2026, dari Finance)

| # | Keputusan |
|---|---|
| D1 | Jurnal terbentuk saat **BTB terbit**, bukan saat invoice. Yang terbentuk: Penjualan (AR) dan HPP (Inventory). |
| D2 | Invoice bisa terbit **parsial berdasarkan BTB**. 1 SP dengan 2 BTB → 2 invoice. |
| D3 | **Nomor dan bulan invoice mengikuti `btb_date`**, bukan tanggal input. |
| D4 | Enam invoice yang terbit tanpa BTB adalah **kelalaian**. Di-`void` lalu diterbitkan ulang dari BTB. Daftarnya di §11.3 — perlu konfirmasi Elvira/Gigih sebelum dieksekusi. |
| D5 | **Approval line** ditambahkan saat invoice diterbitkan: Elvira menerbitkan, Finance Jr. Manager menyetujui. Kalau ditolak, kembali ke draft dengan catatan penolakan dari manager. |
| D6 | `btb_date` diisi **saat input BTB**, bukan saat menerbitkan invoice. |
| D7 | BTB lama yang `btb_date`-nya kosong **diisi mundur**. Cakupan dan sumbernya di §11.2. |

---

## 2. Diagnosa Struktural

Semua angka di bagian ini diukur langsung di produksi (ref `untmpqceexwxzuhlmyrg`) pada 8–9 September 2026.

| # | Temuan | Angka | Akibatnya |
|---|---|---|---|
| **D-01** | `sp_btb.btb_date` **tidak pernah terisi** | 0 dari 456 baris hidup | Tanggal BTB tidak ada di sistem sama sekali. **[koreksi 9 Sep 2026]** Kolomnya ada sejak **6 Juli** (`20260706000001_sp_schema_mvp_fase0.sql:339`); yang lahir **8 Juli** adalah parameter RPC-nya (`20260708000001_sp_fase3_btb.sql:99`). Keduanya ada, tapi FE tidak pernah mengirimnya |
| **D-02** | Form BTB tidak punya input tanggal | `SalesOrderDetailPage.jsx` — hanya `btbInput` (nomor) dan `btbRemarks` | Tidak ada jalur pengisian dari UI, dan itu sebab langsung D-01 |
| **D-03** | `invoice_date` diisi `current_date` | 10 dari 10 invoice produksi bertanggal sama dengan hari tombol ditekan | Melanggar F3. Jurnal masuk periode yang salah kalau input terlambat |
| **D-04** | Satu SP hanya boleh punya satu invoice | Guard di `create_invoice`: `IF EXISTS (... WHERE sp_order_id = ... AND status <> 'void') THEN RAISE` | Melanggar F2. Penagihan parsial mustahil |
| **D-05** | **30 SP punya lebih dari satu BTB** | dari 456 BTB hidup | D-04 bukan kasus langka — 30 SP itu seharusnya menghasilkan 60+ invoice, bukan 30 |
| **D-06** | Enam invoice terbit **tanpa BTB sama sekali** | 6 dari 10 | Melanggar F1 dan F2. Sistem tidak menolaknya |
| **D-07** | `due_date` hanya dihitung saat `issued → submitted` | 9 dari 10 invoice `due_date` NULL | Invoice yang dicetak sebelum submit **dijamin** keluar dengan "Due Date: —". **[koreksi 9 Sep 2026]** Panel invoice kini punya **dua** tombol PDF — "Download" dan "Cetak (Kop Surat)" — dan **keduanya sama-sama tanpa syarat status**, jadi cakupan D-07 bertambah, bukan berkurang |
| **D-08** | Nomor invoice diturunkan dari `now()`, bukan dari `invoice_date` | `extract(year from now())`, bulan Romawi dari `extract(month from now())` | Setelah D3 diterapkan, nomor dan tanggal bisa berbeda bulan: BTB 30 Sep diinput 2 Okt → nomor Oktober, tanggal September |
| **D-09** | `record_payment` menerima status `issued` | Hanya menolak `void` dan `draft` | Invoice yang langsung dibayar melompat ke `partial`/`paid`, dan `submit_invoice` menolaknya selamanya. `due_date` terkunci NULL |
| **D-10** | `delivery_note_id` di `sp_btb` tidak pernah terisi | 0 dari 456 | Rantai Surat Jalan → BTB terputus di data, walaupun kolomnya ada |
| **D-11** | Role finance tidak bisa membaca `accounts` | TD-217 | Kalau invoice pindah ke modul Finance dengan RLS sekarang, nama customer akan kosong di layar. **✅ [11 Sep 2026] DITUTUP** — `20260910000001` LIVE, terverifikasi akun Elvira |
| **D-12** | Nol approval pada penerbitan invoice | Status: `draft` → `issued` → `submitted` → `partial`/`paid` / `void` | Melanggar D5 |

### Yang sudah benar dan jangan diubah

| Hal | Catatan |
|---|---|
| Prioritas payment terms | `accounts.invoice_payment_terms_days` → `entity_finance_settings.default_payment_term_id` → hardcode 30 hari. Terbukti bekerja: Indogrosir tanpa override dapat NET14 |
| `due_date` dihitung sekali lalu permanen | Bukan live-compute. Keputusan rapat Storbit 13 Agu 2026 |
| PPN dua tarif | `PPN_RATE = 0.11` dan `PPN_RATE_FREIGHT_FORWARDING = 0.011`. Bukan salah tulis — freight forwarding memang 1,1% |
| `sp_invoices.created_at` | `NOT NULL DEFAULT now()` — tanggal input sudah tersimpan benar, hanya belum pernah ditampilkan |

---

## 3. Glosarium

| Istilah | Definisi resmi |
|---|---|
| **SP** | Surat Pesanan dari customer. Di Indomarco disebut PO. Satu SP berisi banyak baris barang |
| **Surat Jalan (SJ)** | Dokumen pengiriman. Menyertai barang dari gudang ke DC customer |
| **BTB** | Bukti Terima Barang. Diterbitkan customer sebagai tanda barang diterima. **Ini kejadian akuntansinya** — jurnal lahir di sini |
| **`btb_date`** | Tanggal BTB diterbitkan customer. Tanggal dunia nyata, bukan tanggal input |
| **`received_at`** | Tanggal BTB diinput ke Nexus. Diisi `now()` oleh RPC |
| **Invoice** | Dokumen penagihan. **Satu per BTB.** Bukan pemicu jurnal, melainkan dokumen atas jurnal yang sudah ada |
| **Penagihan parsial** | Satu SP ditagih beberapa kali karena barangnya diterima bertahap. Konsekuensi langsung dari F2 |
| **TTF** | Tanda Terima Faktur. Bukti bahwa faktur fisik sudah diterima customer. Diinput Elvira setelah dimasukkan ke sistem Indomarco. **Bagian alur penagihan, bukan logistik** |
| **`due_date`** | Batas waktu pembayaran. `invoice_date + N`, N dari prioritas tiga tingkat di §6 |
| **Approval line** | Elvira menerbitkan → Finance Jr. Manager menyetujui. Ditolak → kembali draft dengan catatan |
| **Coretax** | Sistem pajak DJP yang menggantikan e-Faktur lama. Dipakai MSI. **Status di Storbit belum diketahui** — pertanyaan terbuka §12 |

---

## 4. Rantai Dokumen

```
PO Customer (PO123)
      ↓
Sales Order / SP (SO123)
      ↓
Surat Jalan (SJ123)
      ↓
BTB (BTB123)  ←── JURNAL LAHIR DI SINI
      │            Dr. Piutang Usaha (AR)
      │            Cr. Penjualan
      │            Dr. HPP
      │            Cr. Persediaan
      ↓
Invoice (INV123)  ←── satu invoice per BTB
      ↓
Penerimaan Pembayaran
      ↓
TTF
```

### Aturan rantai

| # | Aturan |
|---|---|
| R1 | Tiap dokumen menyimpan pointer ke induknya. Tidak ada dokumen yatim |
| R2 | Invoice **tidak boleh** terbit tanpa BTB. Sistem harus menolaknya, bukan mengandalkan disiplin |
| R3 | Satu BTB menghasilkan **tepat satu** invoice non-void |
| R4 | Satu SP bisa punya banyak BTB, karena itu bisa punya banyak invoice |
| R5 | Nilai invoice = nilai barang di BTB-nya, bukan nilai seluruh SP |

### Yang belum tersambung

`sp_btb.delivery_note_id` ada di skema tapi nol terisi (D-10). Rantai SJ → BTB terputus di data. Ini tidak memblokir v1 — invoice hanya butuh BTB — tapi harus ditutup sebelum jurnal HPP bisa mengambil nilai persediaan dari SJ.

---

## 5. Model Data

### `sp_invoices` — perubahan

| Kolom | Keadaan | Perubahan |
|---|---|---|
| `sp_order_id` | ada | **Dipertahankan.** Tetap berguna untuk menelusuri ke SP |
| `btb_id` | **belum ada** | **BARU.** FK ke `sp_btb.id`. NOT NULL untuk invoice baru |
| `invoice_date` | `current_date` | Diisi dari `sp_btb.btb_date` |
| `due_date` | dihitung saat submit | Dihitung saat **terbit**, dari `invoice_date` |
| `status` | draft/issued/submitted/partial/paid/void | Bertambah tahap approval, lihat §7. ⚠️ **[koreksi 9 Sep 2026]** Nilainya dijaga `CONSTRAINT sp_invoices_status_check` (`schema_snapshot.sql:8652`) yang **belum memuat `pending_approval`** — batch F4 harus menyertakan `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT`, bukan hanya mengubah RPC |
| `approved_by` | belum ada | **BARU.** uuid, FK ke `profiles` |
| `approved_at` | belum ada | **BARU.** timestamptz |
| `rejection_note` | belum ada | **BARU.** text. Catatan penolakan dari Finance Jr. Manager |
| `created_at` | ada, benar | **Ditampilkan** di UI dan PDF sebagai "Tanggal Dibuat" |

### Guard yang berubah

| Sekarang | Menjadi |
|---|---|
| Tolak kalau SP sudah punya invoice non-void | Tolak kalau **BTB** sudah punya invoice non-void |
| — | Tolak kalau SP nol BTB (menutup D-06) |
| — | Tolak kalau `btb_date` NULL (menutup D-01 untuk data baru) |

### `sp_btb` — perubahan

| Kolom | Perubahan |
|---|---|
| `btb_date` | Menjadi **wajib diisi** dari UI. Pertimbangkan NOT NULL setelah backfill selesai |

### Indeks unik baru

```
sp_invoices_btb_unique_live ON (btb_id) WHERE status <> 'void' AND deleted_at IS NULL
```

Ini yang menegakkan R3 di lapis database, bukan hanya di RPC.

---

## 6. Aturan Tanggal

| Field | Sumber | Arti |
|---|---|---|
| `sp_btb.btb_date` | Diisi PIC saat input BTB | Tanggal BTB diterbitkan customer |
| `sp_btb.received_at` | `now()` otomatis | Tanggal BTB diinput ke Nexus |
| `sp_invoices.invoice_date` | `= sp_btb.btb_date` | Tanggal dokumen. **Dasar jurnal dan penomoran** |
| `sp_invoices.created_at` | `now()` otomatis | Tanggal PIC menerbitkan invoice di Nexus |
| `sp_invoices.due_date` | `invoice_date + N` | Batas waktu pembayaran |

### Prioritas `N` — tiga tingkat, dipertahankan apa adanya

1. `accounts.invoice_payment_terms_days` — override per-customer. Indomarco = **30 hari**
2. `entity_finance_settings.default_payment_term_id → payment_terms.days_due`, hanya kalau `is_active`. SOA = **NET14 / 14 hari**
3. Hardcode **30 hari**

Dihitung sekali saat invoice terbit, lalu permanen.

### Penomoran — D-08 harus ditutup

Nomor invoice sekarang diturunkan dari `now()`. Setelah D3, ia harus diturunkan dari `invoice_date`.

Contoh yang harus benar: BTB terbit 30 September, diinput 2 Oktober → nomor `SOA-INV-**IX**-2026-xxxx`, tanggal 30 September. Bukan `X`.

⚠️ Konsekuensi: `increment_document_sequence` dipanggil dengan tahun dari `invoice_date`. Kalau BTB Desember diinput Januari, nomornya masuk urutan tahun lama — dan itu **benar** secara akuntansi.

---

## 7. Alur Status Invoice

```
draft ──terbitkan──> pending_approval ──setujui──> issued ──submit──> submitted
                            │                                              │
                            └──tolak (catatan)──> draft                    ├─> partial ─> paid
                                                                           └─> void
```

| Status | Arti | Siapa |
|---|---|---|
| `draft` | Belum diajukan, atau ditolak dan dikembalikan | Elvira |
| `pending_approval` | **BARU.** Menunggu persetujuan | — |
| `issued` | Disetujui, invoice sah | Finance Jr. Manager menyetujui |
| `submitted` | Sudah dikirim ke customer | Elvira |
| `partial` / `paid` | Sebagian / lunas | Elvira mencatat pembayaran |
| `void` | Dibatalkan | Finance Jr. Manager |

### Aturan approval

| # | Aturan |
|---|---|
| A1 | Elvira menerbitkan → status `pending_approval` |
| A2 | Finance Jr. Manager menyetujui → `issued`, `approved_by` dan `approved_at` terisi |
| A3 | Ditolak → kembali `draft`, `rejection_note` wajib diisi |
| A4 | Invoice `draft` dan `pending_approval` **tidak boleh dicetak** — menutup D-07 di sisi alur |
| A5 | `due_date` dihitung saat masuk `issued`, bukan saat `submitted` |
| A6 | `record_payment` **hanya menerima** `submitted`, `partial`. Menutup D-09 |

---

## 8. Jurnal

### Saat BTB terbit (D1)

```
Dr. Piutang Usaha (AR)          xxx
    Cr. Penjualan                       xxx
Dr. Harga Pokok Penjualan       xxx
    Cr. Persediaan                      xxx
```

Tanggal jurnal = `btb_date`, bukan tanggal input.

### Saat invoice terbit

**Nol jurnal baru.** Invoice adalah dokumen atas jurnal yang sudah ada. Yang berubah hanya rujukan dokumen pada baris AR-nya.

⚠️ Ini berbeda dari keadaan sekarang, di mana jurnal AR lahir dari `create_invoice`. Perpindahannya bagian dari migrasi §11.

### Saat pembayaran diterima

```
Dr. Kas / Bank                  xxx
Dr. PPh 23 dibayar di muka      xxx   (kalau ada bukti potong)
    Cr. Piutang Usaha                   xxx
```

### Yang belum diputuskan

Nilai HPP diambil dari mana. Kandidatnya `sp_items.unit_price` (harga jual, salah), atau harga pokok dari `stock_ledger`. Ini pertanyaan terbuka §12.

---

## 9. Matriks Role & Izin

### Dasar: struktur organisasi 18 Mei 2026

```
CEO
 └── Finance Controller
      ├── Finance Jr. Manager
      │    ├── Account Receivable
      │    ├── Account Payable
      │    ├── Cash Management
      │    ├── Finance Staff
      │    └── Finance Staff (JCI)
      └── Accounting & Tax Jr. Manager
           └── Accounting Staff
```

Finance adalah fungsi **group-level**. Satu Finance Controller untuk tiga entitas, dengan staf yang ditugaskan per-entitas. Itu sebabnya modulnya satu, bukan per-entitas.

### Matriks

| Peran | Piutang | Hutang | Kas & Bank | Akuntansi | Laporan | Pengaturan |
|---|---|---|---|---|---|---|
| Account Receivable | tulis | — | baca | — | baca | — |
| Account Payable | — | tulis | baca | — | baca | — |
| Cash Management | baca | baca | tulis | — | baca | — |
| Finance Jr. Manager | tulis + **approve** | tulis + approve | tulis | baca | baca | baca |
| Accounting Staff | baca | baca | baca | tulis | baca | baca |
| Accounting & Tax Jr. Manager | baca | baca | baca | tulis + approve | baca | tulis |
| Finance Controller | semua | semua | semua | semua | semua | semua |
| Logistik (Gigih dkk) | **baca ringkas saja** | — | — | — | — | — |

### Prasyarat yang harus ditutup lebih dulu

**TD-217** — `prospects_read` tidak mengizinkan role finance membaca `accounts`. Kalau tidak dibereskan, halaman Piutang menampilkan nama customer kosong. Ini **memblokir** pemindahan, bukan sekadar merepotkan. **✅ [11 Sep 2026] DITUTUP** — migrasi `20260910000001_finance_read_access` (cabang `finance`/`finance_controller` dibatasi `account_status='customer'`), LIVE, terverifikasi akun Elvira 11 Sep; prasyarat F6 **terpenuhi**. ⚠️ Yang muncul menggantikannya sebagai pertanyaan matriks: **Keputusan Terbuka #49 & #51** (`09_ROADMAP.md`) — guard `create_invoice`/`record_payment` menolak `finance` polos padahal matriks di atas memberi Jr. Manager "tulis + approve", dan sistem tak punya role `accounting` untuk 3 dari 7 baris peran di atas.

---

## 10. Struktur Modul & Menu

### Kenapa satu modul, bukan dua

Pertanyaan awalnya: Finance dan Accounting digabung atau dipisah?

Tiga alasan menggabungkan, dan ketiganya bukan soal selera:

| # | Alasan |
|---|---|
| 1 | **Org chart sudah menjawabnya.** Finance Jr. Manager dan Accounting & Tax Jr. Manager berada di bawah **satu** Finance Controller. Satu penanggung jawab, satu modul |
| 2 | **Odoo pun tidak memisahkannya.** Modul Accounting Odoo mengelompokkan menunya berdasarkan **lawan transaksi** (Customers / Vendors), lalu Accounting, lalu Reporting, lalu Configuration. Bukan berdasarkan finance-vs-accounting |
| 3 | **Datanya satu.** Invoice yang diterbitkan langsung menjadi jurnal AR. Kalau dipisah jadi dua modul, jurnalnya harus "dikirim" antar modul — memindahkan masalah, bukan menyelesaikannya |

Yang justru perlu dipisah adalah **hak akses**, dan itu sudah ditangani di §9.

### Korelasi dengan Odoo

| Odoo | Nexus | Catatan |
|---|---|---|
| Customers → Invoices, Credit Notes, Invoice Receipt, Payments, Follow-up Reports | **Piutang** | Sama isinya, nama diterjemahkan |
| Customers → e-Faktur | **Akuntansi & Pajak → e-Faktur/Coretax** | Dipindah ke pajak karena bukan pekerjaan AR harian |
| Vendors → Bills, Refund, Payments | **Hutang** | Di MSI ini bergabung dengan Bank Disbursement |
| Accounting → Journal Entries, Journal Items, Reconciliation, Tax Adjustments, Lock Dates, Assets | **Akuntansi & Pajak** | Sama |
| Accounting → Analytic Items | **Laporan → Job Costing** | Lihat penjelasan di bawah |
| Reporting (30+ menu) | **Laporan** | Nexus mulai dari yang dipakai, bukan menyalin semuanya |
| Configuration | **Pengaturan** | Sama |

**Yang sengaja tidak ditiru:** Odoo punya 30+ menu laporan karena ia produk umum untuk semua jenis bisnis. Menyalinnya berarti mewarisi kompleksitas yang MSI tidak butuhkan. Nexus mulai dari enam laporan yang benar-benar dipakai, dan bertambah kalau ada yang meminta.

### Struktur menu final

| Kelompok | Menu | Kesiapan |
|---|---|---|
| **Piutang** | Invoice | Siap — Storbit sudah jalan |
| | Penerimaan Pembayaran | Siap |
| | TTF | Siap |
| | Outstanding & Aging | Siap |
| **Hutang** | Vendor Invoice | ⛔ Tunggu Job Order |
| | Bank Disbursement | ⛔ Tunggu Job Order |
| | Settlement of Advance | ⛔ Tunggu BD |
| **Kas & Bank** | Kas / Bank | Siap |
| | Rekonsiliasi | Setelah Kas/Bank |
| **Akuntansi & Pajak** | Jurnal | Setelah AR dan AP jalan |
| | Chart of Accounts | Siap — COA SOA sudah di-seed |
| | Aset | Nanti |
| | Tutup Buku | Setelah jurnal |
| | e-Faktur / Coretax | ⛔ Tunggu jawaban Finance |
| **Laporan** | Neraca · Laba Rugi · Arus Kas | Setelah jurnal |
| | Buku Besar | Setelah jurnal |
| | AR Aging | Siap |
| | AP Aging | ⛔ Tunggu AP |
| | **Job Costing** | ⛔ Tunggu Job Order + BD |
| **Pengaturan** | Payment Terms · Pajak · Bank Account · Jurnal | Siap |

### Tiga koreksi dari kerangka menu yang ada sekarang

| Kerangka lama | Menjadi | Alasan |
|---|---|---|
| **Job Costing** di menu paling atas | **Laporan → Job Costing** | Biayanya masuk lewat Bank Disbursement (terbukti dari Odoo: baris BD memuat Job Order + Account + Amount), pendapatannya lewat Invoice. Job Costing **menyandingkan** keduanya — ia laporan, bukan tempat entri |
| **Outstanding** berdiri sendiri | **Piutang → Outstanding & Aging** | Ia AR aging, bukan kategori tersendiri |
| Nol kelompok **Laporan** dan **Pengaturan** | Ditambahkan | Odoo memisahkannya karena isinya banyak. Nexus akan mengalami hal yang sama begitu jurnal jalan |

### Job Order memblokir separuh modul

Empat menu bergantung pada modul Job Order yang **belum dibangun**: Vendor Invoice, Bank Disbursement, Settlement of Advance, Job Costing.

Ini bukan pilihan urutan — ini ketergantungan data. Baris Bank Disbursement di Odoo menempel pada Job Order (`ACEJKT20260800308`, `SIJKT20260800831`). Tanpa JO, baris biayanya tidak punya tempat menempel.

### Yang tersisa di Shipping Manifest

Seluruh panel Invoice / Terima Pembayaran / TTF **pindah** ke modul Finance. TTF ikut pindah karena yang mengisinya Elvira, bukan orang lapangan.

Yang tersisa di halaman SP: **satu baris baca-saja**, nol tombol.

> Invoice `SOA-INV-IX-2026-0011` · Rp 21.975.736 · Issued · TTF belum diterima

Alasannya: orang logistik perlu **tahu** SP ini sudah ditagih atau belum, tanpa harus membuka modul yang bukan haknya. Kalau panelnya hilang total, mengecek satu status menuntut akses ke seluruh modul Finance.

---

## 11. Rencana Migrasi

### 11.1 Urutan batch

| Batch | Isi | Bisa dikerjakan |
|---|---|---|
| **F1** | Input `btb_date` di form BTB. FE kirim `p_btb_date` ke `sp_issue_btb` | Segera. Menutup D-01 dan D-02 untuk data baru |
| **F2** | Backfill `btb_date` untuk 456 BTB lama | Setelah F1, butuh sumber data |
| **F3** | `sp_invoices.btb_id` + guard baru + penomoran dari `invoice_date` | Setelah F2 |
| **F4** | Approval line + status `pending_approval` | Setelah F3 |
| **F5** | Jurnal pindah dari invoice ke BTB | Setelah F3. Butuh keputusan sumber nilai HPP |
| **F6** | Modul Finance + pemindahan halaman | Setelah TD-217 ditutup — **✅ terpenuhi 11 Sep 2026** (`20260910000001` LIVE) |
| **F7** | Void dan terbitkan ulang enam invoice | Setelah F3, dan setelah konfirmasi Elvira/Gigih |

⚠️ **F1 sebelum F2 sebelum F3** mengikat. Tanpa `btb_date` terisi, `invoice_date` tidak punya sumber.

### 11.2 Backfill `btb_date` (D7)

456 BTB hidup, nol punya `btb_date`. Sumber yang mungkin:

| Sumber | Ketersediaan |
|---|---|
| Dokumen BTB fisik | Ada di Elvira/Gigih, perlu diinput manual |
| `received_at` sebagai perkiraan | 273 dari 456 terisi. **Bukan tanggal BTB**, tapi batas atas — BTB tidak mungkin terbit setelah diinput |
| Sistem Indomarco | Kalau bisa diekspor, ini sumber paling akurat |

**Belum diputuskan.** Kalau memakai `received_at` sebagai perkiraan, itu harus ditandai eksplisit di data supaya tidak dianggap tanggal sungguhan.

### 11.3 Enam invoice tanpa BTB (D4)

Diukur 9 Sep 2026. **Perlu konfirmasi Elvira/Gigih sebelum dieksekusi.**

| Invoice | SP | Status sekarang | Tindakan |
|---|---|---|---|
| `SOA-INV-VIII-2026-0001` | **2017320** | issued | Void, terbitkan ulang dari BTB |
| `SOA-INV-VIII-2026-0007` | **2234621** | issued | Void, terbitkan ulang dari BTB |
| `SOA-INV-VIII-2026-0008` | **2139772** | issued | Void, terbitkan ulang dari BTB |
| `SOA-INV-VIII-2026-0009` | **2154308** | issued | Void, terbitkan ulang dari BTB |
| `SOA-INV-VIII-2026-0002` | 2268718 | **sudah void** | Nol tindakan |
| `SOA-INV-VIII-2026-0004` | `ZZZTEST-DUEDATE-001` | submitted | **Data uji**, bukan invoice sungguhan. Hapus atau biarkan |

Jadi yang benar-benar perlu di-void: **empat invoice** — 0001, 0007, 0008, 0009.

⚠️ Keempat SP itu harus dipastikan **punya BTB** sebelum invoice diterbitkan ulang. Kalau BTB-nya memang tidak pernah ada, masalahnya bukan di invoice melainkan di BTB yang tidak pernah diinput.

### 11.4 Empat invoice yang punya BTB

| Invoice | SP | BTB | Status | Catatan |
|---|---|---|---|---|
| `SOA-INV-IX-2026-0010` | 2180345 | 1 | issued | `invoice_date` perlu dikoreksi ke `btb_date` |
| `SOA-INV-IX-2026-0011` | 2280528 | 1 | issued | idem |
| `SOA-INV-IX-2026-0012` | 2280686 | 1 | void | nol tindakan |
| `SOA-INV-IX-2026-0013` | 2273234 | 1 | void | nol tindakan |

---

## 12. Yang Sengaja Ditunda

| # | Hal | Kenapa ditunda |
|---|---|---|
| T1 | **Invoice MSI dan JCI** | Jauh lebih kompleks: multi-currency dalam satu invoice, PPN 1,1%, Coretax Transaction Code, DPP 11/12, Bukti Potong, Analytic Account per baris. Bergantung pada Job Order yang belum ada |
| T2 | **Job Costing** | Biaya masuk lewat Bank Disbursement yang bergantung Job Order |
| T3 | **AP / Bank Disbursement** | Idem |
| T4 | **Coretax** | Belum diketahui apakah Odoo yang mengurus pelaporan, atau sistem lain. Kalau Nexus harus mengambil alih, itu fitur besar dan berisiko — pelaporan pajak salah ada sanksinya |
| T5 | **Sumber nilai HPP untuk jurnal** | Kandidat: `stock_ledger` atau harga pokok produk. Belum diputuskan |
| T6 | **`sp_btb.delivery_note_id`** | Nol terisi. Rantai SJ → BTB terputus di data. Tidak memblokir v1 |
| T7 | **`btb_date` jadi NOT NULL** | Baru bisa setelah backfill 456 baris selesai |

### Pertanyaan terbuka yang menunggu jawaban

Kelimanya juga dicatat di `09_ROADMAP.md` §Keputusan Terbuka supaya terbaca dari governance, bukan hanya dari dokumen ini. Nomornya diverifikasi bebas di `main` **dan** di branch `feature/crm-v3-batch-persiapan`.

| # | Keputusan Terbuka | Pertanyaan | Kepada |
|---|---|---|---|
| Q1 | **#43** | Coretax diurus di mana sekarang — Odoo, aplikasi DJP, atau vendor pihak ketiga? | Finance |
| Q2 | **#44** | Sumber `btb_date` untuk 456 BTB lama: dokumen fisik, ekspor Indomarco, atau perkiraan dari `received_at`? | Elvira / Gigih |
| Q3 | **#45** | Empat SP di §11.3 — apakah BTB-nya memang tidak pernah ada, atau ada tapi belum diinput? | Elvira / Gigih |
| Q4 | **#46** | Nilai HPP diambil dari mana untuk jurnal BTB? | Finance / Accounting |
| Q5 | **#47** | Apakah Storbit akan punya tim finance sendiri, atau tetap dilayani finance group? | Finance Controller |

⚠️ **#42 sengaja dilewati** — nomor itu sudah dipakai branch `feature/crm-v3-batch-persiapan` (`accounts.estimated_closing_date` salah sumbu). Lompatan 41 → 43 di `09_ROADMAP.md` **bukan kekeliruan**; jangan "dirapikan".

---

## Lampiran A — Sumber Angka

Semua diukur di produksi ref `untmpqceexwxzuhlmyrg`, 8–9 September 2026.

| Angka | Query / sumber |
|---|---|
| 456 BTB hidup, `btb_date` terisi 0 | `SELECT count(*), count(btb_date) FROM sp_btb WHERE deleted_at IS NULL` |
| 30 SP dengan >1 BTB | ⚠️ **[koreksi 9 Sep 2026]** `sp_btb` **tidak punya kolom `sp_no`** — query harus lewat `sp_order_id`: `SELECT o.sp_no, count(*) FROM sp_btb b JOIN sp_orders o ON o.id = b.sp_order_id WHERE b.deleted_at IS NULL GROUP BY o.sp_no HAVING count(*) > 1` |
| 10 invoice, 6 tanpa BTB | `LEFT JOIN sp_btb ON sp_order_id` |
| 9 dari 10 `due_date` NULL | tabel §11.3 dan §11.4 |
| Indomarco override 30 hari, SOA NET14 | `accounts.invoice_payment_terms_days` dan `payment_terms` |
| Struktur organisasi | Dokumen 002/OD/HCGA-MSI/V/2026, versi 2.0, 18 Mei 2026 |
| Menu Odoo | Tangkapan layar modul Accounting dan Bank Disbursement, 9 Sep 2026 |

## Lampiran B — Rujukan Kode

| Objek | Lokasi |
|---|---|
| `create_invoice(p_sp_order_id uuid)` | `schema_snapshot.sql` — guard SP di baris ~389, `current_date` di ~408 |
| `submit_invoice(uuid)` | `schema_snapshot.sql` ~3914 — menghitung `due_date` |
| `sp_issue_btb(..., p_btb_date date DEFAULT NULL)` | `schema_snapshot.sql` ~3760 |
| `record_payment` | menerima `issued` — D-09 |
| Form BTB | `SalesOrderDetailPage.jsx` — `btbInput`, `btbRemarks` |
| Tombol terbitkan invoice | **[koreksi 9 Sep 2026]** `SalesOrderDetailPage.jsx:~2259` → `db.js:1166`. Baris FE bergeser dari ~2224 karena penataan panel invoice hari yang sama; `db.js` tidak bergeser |
| `InvoicePDF` | `src/modules/logistics/InvoicePDF.jsx` — berdiri sendiri, nol import `printKit`/`printTokens` (masih benar per 9 Sep 2026; satu-satunya kemunculan kata `printKit` di file itu ada di komentar). **[koreksi 9 Sep 2026]** Sejak 9 Sep ia menerima prop `variant` (`'download'` \| `'print'`): varian cetak membuang blok kop, latar krem, dan memakai padding kertas kop. Panel pemanggilnya punya dua tombol, `handleInvoicePdf(variant)` |
| TD-217 | `docs/Governance/08_TECH_DEBT.md` |

---

**Akhir dokumen.** Perubahan atas blueprint ini harus dicatat dengan tanggal dan alasannya, mengikuti pola blueprint CRM v3.
