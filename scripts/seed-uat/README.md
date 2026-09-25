# Seed data dummy UAT -- nexus-staging

Data dummy yang meniru pola produksi, untuk UAT. **Produksi tidak pernah
disentuh oleh berkas mana pun di folder ini** -- `seed.sh` menolak jalan kalau
`STG_DB_URL` memuat ref produksi.

| | |
|---|---|
| Target | `oovmlhilhqzejnawqkvt` (`nexus-staging`) SAJA |
| Entitas | SOA (`d2e5e565-5f67-4954-b8d9-5979a2a0c697`) |
| Penanda | nomor SP `91xxxxx` - `notes = 'DATA DUMMY UAT'` - `goods_receipts.reference_no LIKE 'GR-DUMMY-UAT-%'` |
| Cakupan | 40 SP, Juli-September 2026: 12 belum ditagih - 6 siap ditagih - 22 sudah invoice - 8 TTF |
| Dijalankan | 25 September 2026, dua putaran (seed, purge, seed ulang). Verifikasi 30/30 LOLOS di kedua putaran |

## Cara jalan

```
STG_DB_URL='postgresql://...oovmlhilhqzejnawqkvt...' ./seed.sh seed
STG_DB_URL='...' ./seed.sh verify
STG_DB_URL='...' ./seed.sh purge
```

Env var yang dibutuhkan hanya **`STG_DB_URL`**. **Nol password akun** -- lihat
"Impersonasi" di bawah.

## Urutan berkas (mengikat)

| Berkas | Isi |
|---|---|
| `00-guards.sql` | palang: impersonasi aktif, uid benar, SOA ada, `notify_sp_milestone` no-op |
| `01-stock.sql` | stok awal lewat RPC `create_goods_receipt` (5 produk x 30.000, Juni 2026) |
| `01b-helper.sql` | `derive_status`, `seed_uat_build`, `seed_uat_bill` |
| `02-scenario-1.sql` | 12 SP belum ditagih |
| `03-scenario-2.sql` | 6 SP siap ditagih |
| `04-scenario-3.sql` | 22 SP ber-invoice (+submit, bayar, void) |
| `05-ttf.sql` | 8 TTF + geser `tanggal_ttf` |
| `06-verify.sql` | V1..V11 |
| `99-purge.sql` | mode HAPUS |

`01-stock.sql` wajib sebelum skenario apa pun; tanpa stok sebagian besar SP
jatuh ke `MENUNGGU_STOK`. `01b-helper.sql` wajib sebelum 02/03/04.
`04` wajib sebelum `05` (TTF menempel pada invoice yang dibuat 04).

> `01b-helper.sql` **tidak ada di daftar berkas rencana** -- ia lahir saat
> pelaksanaan karena ketiga skrip skenario memanggil rantai langkah yang sama.
> Dinomori `01b` supaya nama berkas lain tidak bergeser.

## Impersonasi: nol password

`auth.uid()` NULL di SQL Editor, jadi setiap RPC ber-`is_super_admin()` akan
ditolak. Tapi `auth.uid()` di staging membaca GUC `request.jwt.claim.sub`, dan
`is_super_admin()` hanya bergantung padanya:

```sql
PERFORM set_config('request.jwt.claim.sub', '<uid test@msi.com>', true);
```

Guard RPC lolos, sementara sesi tetap role `postgres` sehingga RLS tidak
menghalangi UPDATE tanggal historis. Dua sifat yang dibutuhkan sekaligus, dan
**tanpa satu pun password**.

## Tanggal historis: satu urutan yang mengikat

Yang **tidak** perlu digeser (sudah dari parameter): `sp_date`, `receipt_date`,
`btb_date`, `signed_date`, `invoice_date`, `due_date`, `payment_date`, dan
`journal_entries.entry_date`.

Yang **harus** digeser: kolom yang diisi `now()` oleh RPC -- `created_at`,
`updated_at`, `dispatched_at`, `ship_date`, `delivered_at`, `received_at`,
`submitted_at`, `tanggal_ttf`, `tanggal_menerima`.

STOP: Satu urutan yang mengikat, per Surat Jalan:

```
dispatch_delivery(dn)                  -> dispatched_at = now()
UPDATE dispatched_at = <historis>          <-- GESER DULU
mark_delivery_delivered(dn, <signed>)  -> guard signed_date >= dispatched_at LOLOS
UPDATE delivered_at = <historis>
```

Menggeser `dispatched_at` lebih dulu membuat guard **diuji** dengan data
realistis. Urutan kebalikannya (kirim tanggal hari ini lalu geser `signed_date`)
akan **melewati** guard tanpa pernah mengujinya.

## Lima tulisan langsung yang disengaja

Sisanya lewat RPC resmi. Kelima ini menulis tabel langsung, dan masing-masing
punya alasan:

1. **`sp_items`** (langkah 1a) -- tiruan `bulkInsertSpItems` + `spToDb`
   (`db.js:58-88`). FE memang menulis tabel lama ini sendiri, di luar RPC.
2. **`picking_list_items.qty_picked`** -- tiruan `setPickingItemPicked`
   (`db.js:665`), juga UPDATE langsung di FE.
3. **`void` invoice** -- nol RPC untuk void. Jurnalnya **dihapus**, bukan
   dibalik (pola migrasi `20260908000004`).
4. **Geser tanggal historis** -- tidak punya jalur aplikasi, memang tidak boleh
   punya.
5. **`signed_date = NULL`** untuk satu Surat Jalan -- lihat catatan berikutnya.

## Temuan saat pelaksanaan (25 Sep 2026)

Empat hal terungkap justru karena seed ini dijalankan, bukan dibaca:

1. * **`mark_delivery_delivered(uuid)` tidak bisa dipanggil sama sekali.**
   Overload 2-argumen punya `p_signed_date date DEFAULT NULL`, jadi setiap
   panggilan 1-argumen cocok untuk **kedua** kandidat dan Postgres menolak
   dengan `42725 function ... is not unique`.
   **Ini memperbaiki TD-263:** jalan pintas "tandai terkirim tanpa tanggal"
   lewat overload lama itu **terkunci oleh ambiguitas**, bukan terbuka --
   walaupun ACL-nya memang masih `PUBLIC EXECUTE`. Yang jadi masalah nyata
   adalah ambiguitasnya sendiri: panggilan 1-argumen mana pun gagal.
   Keadaan "delivered tanpa `signed_date`" karena itu dicapai lewat RPC
   2-argumen lalu kolomnya dikosongkan. Keadaan itu **nyata di produksi**:
   106 dari 698 Surat Jalan `delivered` ber-`signed_date` NULL (diukur 25 Sep
   2026), yang terakhir 15 Sep -- sebelum kolomnya jadi wajib pada 17 Sep.
2. **`picking_list_items.status` tidak menerima `'partial'`.** Constraintnya
   hanya `pending`/`picked`/`short`. Helper versi pertama memakai `'partial'`
   dan langsung ditolak. Status sekarang **diturunkan dari angkanya** lewat
   `derive_status`, cermin `derivePickingItemStatus` (`db.js:658`) -- sama
   seperti FE, supaya qty dan status mustahil melenceng.
   Bug itu tidak terlihat lebih awal karena probe sebelumnya hanya memakai
   pick 100%.
3. **Rantai termin pembayaran ikut teruji dua jalur.** Indomarco punya
   `accounts.invoice_payment_terms_days = 30` (tingkat 1); tiga customer lain
   NULL sehingga jatuh ke hardcode 30 (tingkat 3). Keduanya menghasilkan 30,
   jadi `due_date = invoice_date + 30` berlaku untuk semuanya -- tapi lewat dua
   jalur yang berbeda.
4. **Ember umur TTF "di atas 90 hari" tidak terjangkau.** `sp_date` dibatasi
   Juli-September 2026, `invoice_date` paling awal 2026-07-07, jadi umur TTF
   maksimum 80 hari. Sebarannya 2/2/4, bukan 2/2/2/2. Kalau ember itu
   dibutuhkan, yang harus berubah adalah rentang tanggal SP -- bukan tanggal
   TTF yang mendahului SP-nya. Lihat kepala `05-ttf.sql`.

## Hal yang TIDAK dibalik oleh purge

- **`document_sequences`** -- deret `INV`/`SJ`/`PICK` monoton. Seed ulang
  memberi **nomor invoice yang berbeda**. Diterima, bukan bug.
- **`audit_logs`** -- jejak, bukan data bisnis (keputusan Den Q5).

## Dua pelajaran purge yang jangan dilupakan

1. `session_replication_role` **tidak bisa** diset dari koneksi non-superuser
   (Supabase pooler menolak). Purge bersandar sepenuhnya pada urutan FK
   anak-ke-induk, bukan pada mematikan trigger.
2. **`stock_ledger` wajib dihapus SEBELUM `delivery_notes`/`picking_lists`.**
   Kalau induknya hilang lebih dulu, baris ledger jadi yatim dan tidak bisa
   lagi dikenali lewat `reference_id` -- stok tidak pulih. Uji pertama kena ini
   (stok 29.700 bukan 30.000).

## Prasyarat migrasi

Seed ini **menuntut** `supabase/migrations/20260925000001_dni_sp_order_item_link.sql`
sudah jalan. Tanpanya `delivery_note_items.sp_order_item_id` tetap NULL, dan
`create_invoice_for_sp` menerbitkan invoice **tanpa jurnal, tanpa error** --
V11 ada justru untuk menangkap keadaan itu.

## Sweep QA

Baseline sweep **dibiarkan basi** (keputusan Den Q4). Data dummy mengubah
`surfaceHash` halaman Storbit/Finance/CRM, jadi sweep akan melaporkan perbedaan
-- itu diharapkan. Baseline baru dibuat di sweep malam berikutnya.
