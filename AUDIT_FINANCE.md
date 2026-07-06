# AUDIT — Struktur BTB / Invoice / Faktur / AR (Storbit SP)

> Read-only. Tidak ada file yang diubah; hanya dokumen ini dibuat. DB dari
> `supabase/schema_snapshot.sql` (kolom/FK/index/RLS diverifikasi, bukan tebakan).

---

## RINGKASAN

- **1 SP → BANYAK BTB (one-to-many)**, tapi lewat **dua tabel BTB yang TERPISAH & tak saling tertaut**:
  - `sp_btbs` (operasional, di Detail SP): hanya `sp_no`(teks) + `btb_no`(teks) + `remarks`. **Tidak ada qty, tidak ada FK, tidak ada unique** → boleh banyak BTB per SP, bahkan duplikat.
  - `ar_btbs` (finance, anak dari `ar_ttfs`): `no_btb` + `dpp_ppn` + `pph` + `payment`. Ini yang menyimpan **nilai uang** BTB.
  Kedua tabel BTB **tidak punya relasi** satu sama lain — BTB fisik yang sama bisa muncul di dua tempat tanpa terkait.
- **Invoice/faktur: TIDAK ADA tabel invoice sungguhan.** Direpresentasikan dua cara terpisah:
  - **Flag boolean** `sp_items.inv` (invoice) & `sp_items.fp` (faktur pajak) → hanya **"sudah/belum"** per baris item. Biner, bukan dokumen, bukan multi-invoice.
  - **`ar_ttfs.no_inv`** (teks nomor invoice) di tracker AR. Di level DB **1 SP bisa punya BANYAK `ar_ttfs`** (tautan via `no_sp` **teks, tanpa FK**) → secara teknis multi-invoice mungkin, tapi tak ada entitas invoice ber-line-item; nilainya ada di `ar_btbs`.
- **Partial/batch: TIDAK BISA direpresentasikan.** Tak ada satu pun kolom di `sp_btbs`/`ar_ttfs`/`ar_btbs` yang menyimpan qty per BTB atau menautkan BTB/invoice ke `delivery_notes`/`shipped_qty`/picking tertentu. Semua **nempel flat ke SP via teks `sp_no`/`no_sp`**, tanpa konsep batch/pengiriman.

---

## STRUKTUR BTB

### Tabel `sp_btbs` (BTB operasional — dipakai di Detail SP)
Kolom (schema `CREATE TABLE public.sp_btbs`):
| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | `schema:5122` |
| `sp_no` | text NOT NULL | **tautan ke SP (teks)** — bukan FK |
| `btb_no` | text NOT NULL | nomor dokumen BTB |
| `created_at` | timestamptz | |
| `remarks` | text | catatan opsional |

- **Relasi ke SP:** hanya via kolom **`sp_no` teks**. **TIDAK ADA foreign key** — cek FK: `sp_btbs` hanya punya `sp_btbs_pkey` (`schema:5122`); tak ada `sp_btbs_*_fkey`. Tak ada juga FK ke `sp_items` (yang PK-nya `id`, sedangkan `sp_no` di `sp_items` tidak unik karena 1 SP = banyak baris item).
- **Kardinalitas:** **1 SP → banyak BTB.** Tak ada unique constraint pada `(sp_no)` maupun `(sp_no, btb_no)` — **tak ada index sama sekali** pada `sp_btbs` (grep index: nihil). → duplikat `(sp_no, btb_no)` **tidak dicegah DB** (dedupe hanya dilakukan saat import, bukan constraint).
- **Simpan qty?** **TIDAK.** Tak ada kolom quantity/jumlah. `sp_btbs` **hanya menyimpan nomor dokumen + remarks** — tak tahu berapa unit yang tercakup BTB itu.
- **Terhubung ke pengiriman/batch?** **TIDAK.** Tak ada `delivery_note_id`, `picking_list_id`, `shipped_qty`, atau tanggal terima. BTB **nempel ke SP secara umum** (via `sp_no`), tak tahu batch/surat jalan mana.

**db.js:** `listSpBtbs` (`:771` select `id,sp_no,btb_no,remarks,created_at` `.eq('sp_no',spNo)`), `addSpBtb` (`:781` insert `{sp_no,btb_no,remarks?}`), `deleteSpBtb` (`:793` **hard delete** by id), `bulkInsertSpBtbs` (`:802`, dipakai Input SP).

---

## STRUKTUR INVOICE / FAKTUR / AR

### (a) Flag finance di `sp_items` — biner per baris
Kolom (schema tabel `sp_items`): `inv` boolean, `fp` boolean, `submit` boolean, `kirim` boolean, `submit_date` date, `email_status` text.
- `inv` = invoice sudah dibuat? `fp` = faktur pajak sudah? `submit` = sudah submit? `kirim` = sudah kirim? — **semua boolean**, jadi hanya **"sudah/belum" (satu keadaan)**, **bukan** dokumen, **bukan** multi-invoice.
- Level: **per baris `sp_items`** (bukan per SP). `groupBySP` menjumlah `invDone/fpDone/submitDone/kirimDone` (`App.jsx:191-194`) untuk `financePct` — agregat, bukan status.
- Diisi via `spToDb` (`db.js:80-85`).

### (b) Tabel AR — `ar_ttfs` (header) + `ar_btbs` (detail)
`ar_ttfs` kolom (schema):
| Kolom | Catatan |
|---|---|
| `id` uuid PK | `schema:4274` |
| `no_ttf` text | nomor TTF (tanda terima faktur) |
| `tanggal_ttf`, `tanggal_menerima`, `tgl_pembayaran` date | |
| `no_inv` text | **nomor invoice (teks, satu per TTF)** |
| `no_sp` text | **tautan ke SP (teks, TANPA FK)** |
| `customer_id` uuid | **FK → accounts(id)** (`ar_ttfs_customer_id_fkey`, `schema:6907`) |
| `notes` | |

`ar_btbs` kolom (schema):
| Kolom | Catatan |
|---|---|
| `id` uuid PK | `schema:4266` |
| `ttf_id` uuid | **FK → ar_ttfs(id) ON DELETE CASCADE** (`schema:6899`) |
| `no_btb` text | nomor BTB (versi finance) |
| `dpp_ppn` numeric | **nilai DPP+PPN** |
| `pph` numeric | **nilai PPh** |
| `payment` numeric | **pembayaran** |
| `position` int | urutan |

**Kardinalitas & tautan:**
- `ar_ttfs` → SP: via **`no_sp` teks, TANPA FK** (cek FK `ar_ttfs`: hanya `customer_id_fkey`; tak ada `no_sp` FK). → **1 SP bisa punya banyak `ar_ttfs`** (tidak dibatasi DB). Tiap `ar_ttfs` punya **1 `no_inv`** (field teks tunggal).
- `ar_ttfs` → `ar_btbs`: **one-to-many** via `ttf_id` FK (CASCADE). Index `idx_ar_btbs_ttf_id (ttf_id, position)` (`schema:5404`). Nilai uang (dpp/pph/payment) ada **per BTB** di `ar_btbs`.
- `calcAR` (`App.jsx:221-258`) menghitung `totalInvoice = Σ(dpp_ppn+pph)`, `totalPayment = Σpayment`, `totalOS`, status Lunas/Partial/Belum Bayar/Lebih Bayar, overdue >30 hari — semua dari `ar_btbs` di dalam satu TTF.
- **db.js:** `listTtfs` (`:649` embed `ar_btbs(*)` + `accounts`), `insertTtf`/`updateTtf` (`:657/:689` — update = **delete-all-reinsert** `ar_btbs`), `deleteTtf` (`:722`, cascade).

**Jadi "invoice" ada dua representasi terpisah:** (1) flag `sp_items.inv/fp` (biner, operasional) dan (2) `ar_ttfs.no_inv` + nilai di `ar_btbs` (tracker AR/pembayaran). **Keduanya tak tertaut** (tak ada kolom penghubung; hanya kebetulan teks `no_sp` = SP yang sama).

**Ada dua "BTB" pula:** `sp_btbs.btb_no` (operasional, tanpa nilai) vs `ar_btbs.no_btb` (finance, dengan nilai) — **tak ada relasi** antar keduanya.

---

## HUBUNGAN KE PARTIAL / BATCH

**Pertanyaan 7 — bisa merepresentasikan "BTB untuk batch 600" vs "batch 400"?** → **TIDAK BISA.**
- `sp_btbs` tak punya kolom qty (lihat struktur di atas) → tak bisa menandai jumlah unit per BTB.
- `ar_btbs` punya nilai uang (dpp/pph/payment) tapi **tak ada qty** dan **tak ada tautan ke batch/pengiriman**.
- Tak ada mekanisme "BTB ini untuk pengiriman X" — semua BTB hanya menempel ke `sp_no`.

**Pertanyaan 8 — ada kolom yang menghubungkan BTB/invoice ke `shipped_qty`/surat jalan/`delivery_notes`?** → **TIDAK ADA di kode.**
- `sp_btbs`: kolom = `id, sp_no, btb_no, created_at, remarks` — nihil tautan ke `delivery_notes`/`picking_lists`/`shipped_qty`.
- `ar_ttfs`: nihil `delivery_note_id`/`do_no`/`shipped_qty`.
- `ar_btbs`: nihil tautan pengiriman.
- `delivery_notes`/`delivery_note_items` (schema) juga tak menyimpan `btb_no`/`invoice`/`ttf_id`.
→ BTB, invoice, dan pengiriman (surat jalan) **benar-benar terputus**; hanya bisa dikaitkan manual lewat kesamaan teks `sp_no`. Konsisten dengan temuan AUDIT_E2E.md (T-2: rantai gudang terputus dari SP).

---

## SIAPA MENGISI

| Field/Dokumen | Tabel/Kolom | Halaman | Tombol/Form | Role gating (IN-FILE) |
|---|---|---|---|---|
| BTB operasional (tambah) | `sp_btbs` insert | Detail SP (Overview) | "Tambah BTB" (`SalesOrderDetailPage:1020` → `addSpBtb`) | **TIDAK ADA cek role** (siapa pun yang buka Detail SP) |
| BTB operasional (hapus) | `sp_btbs` hard-delete | Detail SP | "X" per BTB (`:989` → `deleteSpBtb`) | **TIDAK ADA cek role** |
| BTB operasional (bulk saat input) | `sp_btbs` insert | Input SP | saat Submit/Draft (`InputSPPage:207` → `bulkInsertSpBtbs`, best-effort) | **TIDAK ADA cek role** in-file |
| Flag Invoice/Faktur/Submit/Kirim + submit_date/email_status | `sp_items.inv/fp/submit/kirim/submit_date/email_status` | FinancePage / OutstandingPage / Detail SP → **FinanceModal** | Toggle + Save (`App.jsx:4535-4569`) | dibuka via `can(role,'finance')` (`App.jsx:2755`,`2760`,`3324`) |
| Flag finance (jalur lain) | idem | Input SP FormModal / EditItemModal | Toggle INV/FP/SUBMIT/KIRIM (`App.jsx:4407-4410`; `SalesOrderDetailPage:424`) | FormModal: tanpa cek; EditItemModal per-item edit gated `super_admin/operations/manager/gm` |
| TTF + invoice no + BTB nilai (buat) | `ar_ttfs` + `ar_btbs` insert | **AR / Collection** (`ARTrackerPage`) → **ARModal** | "Tambah TTF" (`App.jsx:5011` `can(role,'finance')`) → form fields No.INV/No.SP + "Add BTB" rows (`ARModal:5310`, `:5422`) → `insertTtf` | tombol Add gated `can(role,'finance')` |
| TTF edit / hapus | `ar_ttfs`/`ar_btbs` update/delete | AR (ARSidePanel) | "Edit TTF" / "Hapus" (`ARSidePanel`, keduanya di blok `can(role,'finance')`) → `updateTtf`/`deleteTtf` | `can(role,'finance')` |

### Konfirmasi peran (pertanyaan 10)
- **Role gudang/warehouse: TIDAK ADA** di daftar 13 role (`App.jsx:260-273`: super_admin/admin/ceo/gm/manager/finance_controller/finance/operations/sales/procurement/hrga/it/viewer). PIC picking = placeholder "Fase 5 role gudang" (`PickingListPage:192`).
- **Aksi operasional (input SP, konfirmasi, generate picking, BTB) semua bisa dilakukan role `operations`** (Gigih):
  - Menu `input` role termasuk `operations` (`App.jsx:498`); menu `manifest`/Konfirmasi tak punya cek role in-file (RLS + menu); menu `picking`/`surat-jalan` role termasuk `operations` (`App.jsx:501-502`).
  - BTB (Tambah/Hapus di Detail SP) **tanpa cek role in-file** → bahkan role apa pun yang bisa buka Detail SP bisa mengisi.
  - Generate Picking di Detail SP tak punya cek role in-file (hanya gate `sp_status='confirmed'`).
- **Aksi finance (flag inv/fp, AR TTF/BTB nilai) di-gate `can(role,'finance')`** → role `finance`/`finance_controller` (dan atas). Menu `ar` role = super_admin/admin/ceo/gm/finance_controller/finance (`App.jsx:631`).
- **Catatan penting:** semua gate ini **FE-only**. RLS `sp_btbs`/`ar_ttfs`/`ar_btbs` = `USING(true)`/`auth.uid() IS NOT NULL` (schema `:8942-8990`,`:10884-10905`) → di level DB **siapa pun yang login bisa baca/tulis** BTB & data AR lintas customer, terlepas dari role FE.

---

## TEMUAN

### F-1 (HIGH) — Tautan SP↔BTB↔invoice via teks tanpa FK → rawan mismatch & yatim
`sp_btbs.sp_no` (teks, tanpa FK), `ar_ttfs.no_sp` (teks, tanpa FK). SP sendiri ber-No `Date.now()` (AUDIT_E2E T-5).
- **Dampak:** typo/format beda pada `sp_no`/`no_sp` → BTB atau invoice "yatim" (tak match SP mana pun) tanpa terdeteksi DB; hapus SP tak meng-cascade BTB (BTB nyangkut). Integritas referensial nol.
- **Bukti:** `schema` FK list (`sp_btbs` hanya PK; `ar_ttfs` hanya `customer_id_fkey`), `db.js:774/782` (`sp_no`), `db.js:177` (`no_sp`).

### F-2 (HIGH) — Struktur tak mendukung partial/batch (BTB & invoice tak punya qty / tautan pengiriman)
`sp_btbs` tanpa qty; tak ada kolom penghubung ke `delivery_notes`/`shipped_qty`/picking di manapun.
- **Dampak:** mustahil menyatakan "BTB/invoice untuk batch 600 dari 1000"; tak bisa rekonsiliasi BTB↔pengiriman↔invoice per batch. Menghambat kasus partial (yang secara kapabilitas UI mungkin, AUDIT_SHIPPED).
- **Bukti:** struktur `sp_btbs`/`ar_ttfs`/`ar_btbs` (schema) — nihil qty & FK pengiriman.

### F-3 (HIGH) — RLS finance permissif (data AR/BTB terbaca & tertulis lintas customer oleh siapa saja)
`ar_ttfs`/`ar_btbs`/`sp_btbs` RLS `USING(true)` (read/delete) & `auth.uid() IS NOT NULL` (insert/update) — `schema:8942-8990`,`10884-10905`.
- **Dampak:** setiap user login (mis. sales/viewer) bisa membaca **nilai invoice, DPP/PPN, PPh, pembayaran, OS** semua customer, dan menulis/menghapusnya. Data keuangan sensitif bocor + bisa dimanipulasi. (Bagian dari AUDIT_E2E T-1 CRITICAL.)

### F-4 (MEDIUM) — Dua representasi BTB & dua representasi invoice, tak tertaut → sumber kebenaran ganda
BTB: `sp_btbs.btb_no` (ops, tanpa nilai) vs `ar_btbs.no_btb` (finance, dengan nilai). Invoice: flag `sp_items.inv` vs `ar_ttfs.no_inv`. Tak ada relasi antar pasangan.
- **Dampak:** BTB/invoice yang sama dicatat dua kali secara terpisah; bisa tidak konsisten (mis. `inv=true` tapi tak ada `ar_ttfs`, atau BTB ops ada tapi `ar_btbs` beda nomor). Tak ada rekonsiliasi.
- **Bukti:** `sp_btbs`(schema) vs `ar_btbs`(schema); `sp_items.inv` (`db.js:38`) vs `ar_ttfs.no_inv` (`db.js:152`).

### F-5 (MEDIUM) — BTB tanpa unique constraint & hard-delete
`sp_btbs` tak punya index/unique apa pun; `deleteSpBtb` hard-delete (`db.js:793`).
- **Dampak:** duplikat `(sp_no, btb_no)` tak dicegah (dedupe hanya di import); hapus permanen tanpa jejak (langgar soft-delete AGENTS.md rule 13).

### F-6 (MEDIUM) — BTB operasional tanpa gating role (in-file)
Tambah/Hapus BTB di Detail SP tanpa cek role (`SalesOrderDetailPage:1020/989`); hanya RLS permissif di belakang.
- **Dampak:** siapa pun yang bisa membuka Detail SP bisa menambah/menghapus BTB — tak ada pemisahan tugas ops vs lainnya.

### F-7 (LOW) — Invoice bukan entitas dokumen (tak ada line item/among/pajak sebagai dokumen)
"Invoice/faktur" hanya flag boolean + nomor teks + jumlah agregat di `ar_btbs`. Tak ada tabel `invoices` dengan item/among/tax sebagai dokumen yang bisa dicetak/diaudit.
- **Dampak:** tak bisa terbitkan/simpan dokumen invoice/faktur resmi dari sistem; penerbitan tetap manual di luar (konsisten AUDIT_E2E langkah 9).

### F-8 (LOW) — `ar_ttfs.no_inv` tunggal → satu TTF = satu nomor invoice
`no_inv` field teks tunggal per `ar_ttfs`. Multi-invoice per SP hanya bisa dengan membuat banyak baris `ar_ttfs` (via `no_sp` teks) — tanpa validasi keterkaitan.
- **Dampak:** tak ada model bersih "1 SP → N invoice → M pembayaran"; bergantung pada disiplin pengisian teks.

---

### Ringkasan kardinalitas (jawaban lugas)
- **1 SP → N BTB** (di `sp_btbs`, via `sp_no` teks, tanpa batas/uniqueness). BTB **tak simpan qty**, **tak terhubung batch/pengiriman**.
- **1 SP → invoice:** sebagai **flag biner** `inv/fp` (sudah/belum, per baris item) **ATAU** sebagai **N baris `ar_ttfs`** (via `no_sp` teks, tanpa FK); tiap `ar_ttfs` = 1 `no_inv` + **N `ar_btbs`** (nilai dpp/pph/payment).
- **Partial/batch: TIDAK didukung** — tak ada qty di BTB, tak ada tautan ke `delivery_notes`/`shipped_qty`.
