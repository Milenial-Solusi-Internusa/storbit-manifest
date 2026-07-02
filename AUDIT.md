# AUDIT: Dropdown Customer KOSONG di FormModal (Add New SP)

> Auditor mode. **Read-only** — tidak ada kode/DB yang diubah; hanya dokumen ini yang ditulis (menimpa isi lama).
> Bug: dropdown "Customer" di `FormModal` (menu Input SP → "Add New SP") hanya menampilkan "— Pilih customer —", tanpa satu pun customer. Product Name (ProductPicker) di form yang sama normal.
> Semua klaim disertai `file:line`.

---

## RINGKASAN

**Dropdown Customer kosong karena BUG PEMETAAN FIELD `active` yang lama (bukan RLS, bukan scope, dan BUKAN akibat perubahan ProductPicker terakhir).**

Rantai penyebabnya pasti:
1. `listCustomers()` membaca tabel **`accounts`** (`src/lib/db.js`), lalu tiap baris dipetakan lewat `customerFromDb()`.
2. `customerFromDb` menyetel **`active: !!row.active`** (`src/lib/db.js:104`). Tapi tabel `accounts` **tidak punya kolom `active`** — kolomnya bernama **`is_active`** (`supabase/schema_snapshot.sql`, accounts). Jadi `row.active` = `undefined` → `!!undefined` = **`false`** untuk SETIAP customer.
3. `FormModal` memfilter **`activeCustomers = customers.filter(c => c.active !== false)`** (`src/App.jsx:4296`). Karena semua customer `active === false`, **semua tersaring habis** → dropdown kosong (`src/App.jsx:4314`).

Kenapa Product Name (ProductPicker) jalan tapi Customer tidak: keduanya sumber datanya berbeda. ProductPicker pakai `useProducts` (katalog `products`, tidak kena filter `active` yang salah ini). Dropdown Customer pakai `customers` + filter `c.active` yang rusak.

Kenapa dropdown customer di `InputSPPage` (jalur ProductPicker) TIDAK kosong: `InputSPPage` me-render `customers.map(...)` **tanpa** filter `active` (`src/modules/logistics/InputSPPage.jsx:319`) → semua customer tampil. Perbedaannya persis pada ada/tidaknya `.filter(c => c.active !== false)`.

**Ini bug lama** dari migrasi `customers → accounts` (Phase 2.5A) di mana kolom `active` menjadi `is_active`, tapi `customerFromDb` masih membaca `row.active`. Perubahan ProductPicker terakhir **tidak menyentuh** logika customer sama sekali.

---

## TEMUAN PER PERTANYAAN

### 1. Dropdown Customer di FormModal ambil data dari mana?

Rantai: **prop `customers` → `useCustomers()` → `listCustomers()` → tabel `accounts`.**

- `FormModal({ …, customers = [] })` (`src/App.jsx:4249`); di-render dengan `customers={customers}` (`src/App.jsx:3305`).
- `customers` di App berasal dari `const { customers, … } = useCustomers()` (`src/App.jsx:1462`).
- `useCustomers` memanggil `listCustomers()` saat mount (`src/hooks/useCustomers.js:26-38`) dan menyimpannya ke state.
- `listCustomers()` (`src/lib/db.js`): `supabase.from('accounts').select('*').eq('account_status','customer').is('deleted_at', null).order('name')`, lalu `.map(customerFromDb)`.
- Di FormModal, sebelum dirender difilter: `const activeCustomers = customers.filter(c => c.active !== false)` (`src/App.jsx:4296`), lalu `activeCustomers.map(...)` (`src/App.jsx:4314`).

### 2. Query customer di-scope ke company tertentu atau ambil semua?

**Query FE `listCustomers` TIDAK menyaring company secara eksplisit** — hanya `account_status='customer'` + `deleted_at IS NULL` (`src/lib/db.js`, body `listCustomers`). Scoping diserahkan ke RLS `accounts` (lihat Temuan 4). Jadi dari sisi query FE, customer SOA/Storbit **akan ikut terambil** (sepanjang RLS mengizinkan). **Emptiness bukan karena scope company di query**, melainkan filter `active` di FE (Temuan 1 & 5).

### 3. owner_company_id customer Storbit — apakah query menemukan mereka?

Ya, query **menemukan** mereka (mereka `account_status='customer'`). Dari catatan import (CLAUDE.md): Indomarco `a18fad3c-75ee-4fc6-b3d2-5c5dfa810661`, Indogrosir `92f48635-…`, General Order `7fa6db6c-…`, CK `4c3db412-…` — semuanya di-set `account_status='customer'` + `owner_company_id` + `customer_type='trading'`. `listCustomers` memfilter `account_status='customer'` → baris-baris ini **lolos** query. Mereka **tidak** ter-filter oleh owner_company; mereka ter-filter oleh **`c.active !== false`** di FormModal karena `active` selalu `false` (Temuan 1). Catatan: RLS `accounts` memakai kolom **`company_id`**, bukan `owner_company_id` (lihat Temuan 4) — dua kolom berbeda.

### 4. Kemungkinan RLS `accounts` menolak baca senyap?

Policy read `accounts` = `prospects_read` (`supabase/schema_snapshot.sql:10477`):
```sql
USING (
  ((company_id = get_user_company_id())
     AND (is_manager_or_above() OR assigned_to = auth.uid() OR created_by = auth.uid()))
  OR is_super_admin()
)
```
Jadi RLS **memang company-scoped** dan **bisa** memfilter senyap (mengembalikan lebih sedikit baris tanpa error) — mirip pola bug DeliveryNote dulu. **TAPI ini BUKAN penyebab gejala saat ini**, buktinya: array `customers` yang SAMA dipakai `InputSPPage` (`src/modules/logistics/InputSPPage.jsx:319`) dan di sana customer **tampil**. Kalau RLS memblokir baca, array itu kosong di SEMUA konsumen (termasuk InputSPPage), bukan hanya FormModal. Karena hanya FormModal yang kosong → penyebabnya filter FE `active`, bukan RLS.

> Catatan risiko terpisah (bukan penyebab bug ini, tapi patut diperhatikan): RLS memakai `company_id`. Bila user login **non-super_admin** dan `company_id` akun customer SOA ≠ company user, RLS akan menyembunyikan customer itu di SEMUA dropdown (termasuk InputSPPage). Kalau nanti gejalanya berubah jadi "InputSPPage juga kosong untuk user tertentu", itu isu RLS/scope yang berbeda dari bug `active` ini. Untuk sekarang, gejala yang dilaporkan (hanya FormModal kosong) murni bug `active`.

### 5. Apakah bug ini AKIBAT perubahan ProductPicker terakhir? **TEGAS: TIDAK.**

- Perubahan ProductPicker di FormModal hanya menyentuh: field **Product Name** (`<Input>` → `ProductPicker`), field **SKU** (jadi read-only), penambahan `productId` di `data`, dan validasi `handleSubmit` soal `productId`.
- **TIDAK menyentuh** logika customer sama sekali: baris `const activeCustomers = customers.filter(c => c.active !== false)` (`src/App.jsx:4296`) dan `<select>` customer (`src/App.jsx:4293-4302`, opsi di `:4314`) tetap seperti sebelumnya.
- Akar masalah (`customerFromDb` baca `row.active` yang tak ada di `accounts`, `src/lib/db.js:104`) berasal dari migrasi `customers → accounts` (Phase 2.5A), jauh sebelum perubahan ProductPicker. **Bug lama, tidak berhubungan.**

### 6. Dropdown Customer yang sama kosong di tempat lain juga?

Ya — **semua konsumen yang memakai `.filter(c => c.active !== false)`** akan kosong, karena akar masalahnya sama:
- `src/App.jsx:4296/4314` — **FormModal** (Add/Edit Item SP) ← yang dilaporkan.
- `src/App.jsx:5308/5338` — modal AR TTF (`activeCustomers`).
- `src/App.jsx:3552` — chip filter "All Customers" (list customer).
- `src/App.jsx:5027` — list/filter customer lain.

Yang **TIDAK kosong** (tidak pakai filter `active`):
- `src/modules/logistics/InputSPPage.jsx:319` — `customers.map(...)` tanpa filter → tampil.
- `src/App.jsx:4746` — kartu manajemen customer memakai `opacity` (`c.active === false ? 0.55 : 1`), bukan filter → semua tetap tampil (walau semuanya tampak "redup" karena `active=false`).

⇒ Bug ini **bukan** khusus FormModal; ia menjangkiti setiap dropdown/list yang menyaring `c.active`. FormModal kebetulan yang diuji user.

---

## REKOMENDASI FIX

Ini **masalah pemetaan field (FE), BUKAN RLS dan BUKAN scope query.** Perbaiki di satu titik akar agar semua konsumen ikut benar:

### Opsi 1 (REKOMENDASI — perbaiki di akar, satu baris)
Di `src/lib/db.js`, `customerFromDb` (`:104`): baca kolom yang benar dari `accounts`.
- Ganti `active: !!row.active` → `active: row.is_active !== false` (atau `!!(row.is_active ?? row.active)` bila mau tetap kompat dengan tabel lama).
- Efek: semua customer memetakan `active=true` (karena `accounts.is_active DEFAULT true`), sehingga filter `c.active !== false` di FormModal (dan semua konsumen lain) meloloskan mereka. **Satu perubahan menyembuhkan semua titik.**
- Pertimbangkan juga menambah `'is_active'` ke `CUSTOMER_STANDARD_DB_COLS` (`src/lib/db.js:92`) agar tidak bocor ganda sebagai custom field (kosmetik).

### Opsi 2 (alternatif, lebih sempit — hanya menutup gejala FormModal)
Hapus/relaksasi filter `activeCustomers` di FormModal (`src/App.jsx:4296`) — mis. samakan dengan InputSPPage yang me-render semua customer. Tapi ini **tidak** memperbaiki konsumen lain (AR TTF, chip filter) yang juga rusak, dan meninggalkan pemetaan `active` yang salah. **Kurang disarankan** dibanding Opsi 1.

### Bukan solusi
- **RLS**: tidak perlu diubah — bukan penyebab (Temuan 4). Mengutak-atik RLS di sini salah sasaran.
- **Scope query company**: tidak perlu ditambah/diubah — query sudah mengambil customer yang relevan (Temuan 2-3).

### Catatan verifikasi setelah fix
- Pastikan `accounts.is_active` untuk customer SOA memang `true` (default kolomnya `true`; kecuali sengaja di-nonaktifkan).
- Jika nanti user **non-super_admin** melaporkan customer SOA tetap tak muncul di SEMUA dropdown (termasuk InputSPPage), itu isu **RLS company-scope** terpisah (Temuan 4 catatan) — bukan bug `active` ini.

---

*Audit selesai. Tidak ada file kode/DB yang diubah. Hanya AUDIT.md ini yang ditulis.*
