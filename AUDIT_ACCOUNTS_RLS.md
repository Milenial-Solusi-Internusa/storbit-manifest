# AUDIT — Dropdown Customer KOSONG untuk role `operations` di Input SP

> **Mode:** AUDIT (read-only). Tidak ada file/kode/DB yang diubah. Satu-satunya file yang dibuat: dokumen ini.
> **Tanggal:** 2026-07-06 · **Branch:** `feat/sp-schema`
> **Sumber DB:** `supabase/schema_snapshot.sql` (bukan migrations lama).
> **Kasus lapangan:** Login `operations` (Gigih, entitas SOA) → dropdown Customer di Input SP **KOSONG**. Login `super_admin` (Den) → dropdown **PENUH**.

---

## RINGKASAN EKSEKUTIF

**Akar masalah: RLS tabel `accounts` (policy `prospects_read`) tidak mengizinkan role `operations` membaca baris customer, sementara halaman & aksi Input SP justru sudah dibuka untuk `operations`.** Policy `prospects_read` (`schema_snapshot.sql:10870`) hanya meloloskan baris bila `is_super_admin()` **ATAU** `(company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to = auth.uid() OR created_by = auth.uid()))`. Fungsi `is_manager_or_above()` (`:738`) **tidak memuat `operations`** (hanya super_admin/admin/ceo/gm/manager/supervisor). Customer Storbit (Indomarco dkk.) di-import dengan `owner_company_id`/`created_by` = akun importir (bukan Gigih) dan tidak di-`assigned_to` Gigih → **ketiga cabang gagal untuk operations → 0 baris dikembalikan** → array `customers` kosong di FE → dropdown kosong. Super_admin lolos lewat cabang `is_super_admin()` → melihat semua → dropdown penuh.

**Verdict tegas:** Ini **murni masalah RLS DB**, **bukan** bug query FE dan **bukan** bug gating menu. Query FE (`listCustomers`) benar (`account_status='customer'`, `deleted_at IS NULL`), dan menu `input` sudah role-gated termasuk `operations` (`App.jsx:497`) sehingga Gigih bisa membuka halamannya. Yang gagal adalah pembacaan data di lapisan DB.

**Severity: CRITICAL** — role yang memang ditugaskan membuat SP (`operations`) tidak bisa bekerja sama sekali di Input SP (tak ada customer yang bisa dipilih → SP tak bisa dibuat). Ini adalah **inkonsistensi desain**: skema SP baru (`sp_orders`/`sp_order_items`/`sp_btb`/`dc_master`) secara eksplisit memberi hak `operations` untuk **INSERT/UPDATE** SP (`:11341`, `:11307`, dst.), tetapi tabel `accounts` — sumber wajib untuk mengisi `customer_id` — **tidak ikut diberi hak baca** untuk `operations`.

---

## TEMUAN PER AREA

### 1 — SUMBER DATA DROPDOWN CUSTOMER

**[INFO] InputSPPage dan FormModal memakai SATU sumber yang sama (prop `customers`).**

- **InputSPPage** menerima customer via prop, bukan fetch sendiri:
  - `src/modules/logistics/InputSPPage.jsx:143` → `export default function InputSPPage({ onBack, customers = [], showToast })`
  - Render dropdown: `InputSPPage.jsx:353` → `{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}`
- **FormModal** (Add New SP dari App.jsx) juga menerima prop `customers`:
  - `src/App.jsx:4263` → `function FormModal({ initial, customers = [], onClose, onSave })`
  - `src/App.jsx:4310` → `const activeCustomers = customers.filter(c => c.active !== false);`
  - Render: `activeCustomers.map(c => <option value={c.name}>{c.code} · {c.name}</option>)`
- **Kedua-duanya diberi prop dari state yang sama** di App root:
  - `src/App.jsx:1465` → `const { customers, ... } = useCustomers();`
  - `src/App.jsx:2654` → `<InputSPPage ... customers={customers} ... />`
  - `src/App.jsx:3319` → `<FormModal ... customers={customers} ... />`

**Query persis** (satu-satunya jalur pengambilan): `src/lib/db.js:212-223`
```js
export async function listCustomers() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('account_status', 'customer')
    .is('deleted_at', null)
    .order('name');
  return { data: (data || []).map(customerFromDb), error };
}
```
- **Tabel:** `accounts` · **Filter:** `account_status='customer'` + `deleted_at IS NULL` · **Order:** `name`.
- **TIDAK ada filter `company_id` di FE**, **TIDAK ada role-scope di FE**, **TIDAK ada `.limit()`** (mengandalkan default PostgREST + RLS).
- **Kesimpulan:** Query FE tidak mengandung apa pun yang bisa "mengosongkan khusus SOA". Penyaringan per-entitas & per-role **sepenuhnya diserahkan ke RLS**. Karena hanya `account_status='customer'` + `deleted_at null`, tidak ada bug FE di sini.

> Catatan minor: ketiadaan `.limit(1000)` melanggar aturan wajib CLAUDE.md ("selalu `.limit(1000)`"). Bukan penyebab kasus ini (super_admin tetap penuh), tapi layak dicatat sebagai tech-debt (**LOW**).

---

### 2 — RLS TABEL `accounts` (policy SELECT)

**[CRITICAL] Hanya ada satu policy SELECT (`prospects_read`) dan ia menolak `operations`.**

Kutipan lengkap dari `schema_snapshot.sql`:
```sql
-- :10870
CREATE POLICY prospects_read ON public.accounts FOR SELECT USING (
  (
    (
      (company_id = public.get_user_company_id())
      AND (
        public.is_manager_or_above()
        OR (assigned_to = auth.uid())
        OR (created_by  = auth.uid())
      )
    )
    OR public.is_super_admin()
  )
);
-- :10863  prospects_insert  WITH CHECK (company_id = get_user_company_id())
-- :10877  prospects_update  (mirror prospects_read)
-- :9000   accounts_delete_superadmin  USING (is_super_admin())
```

**Pembacaan qual baris demi baris untuk user `operations` (Gigih, SOA):**
1. `is_super_admin()` → **FALSE** (Gigih bukan super_admin).
2. Cabang kiri butuh **DUA** syarat sekaligus:
   - `company_id = get_user_company_id()` → **TRUE** untuk customer SOA (asumsi Gigih company_id = SOA). Bukan ini yang gagal.
   - `AND (is_manager_or_above() OR assigned_to = auth.uid() OR created_by = auth.uid())`:
     - `is_manager_or_above()` → **FALSE** (lihat Area 3 — `operations` tidak ada di daftar).
     - `assigned_to = auth.uid()` → **FALSE** untuk customer hasil import (di-assign ke importir/NULL, bukan Gigih).
     - `created_by = auth.uid()` → **FALSE** (dibuat oleh proses import / super_admin, bukan Gigih).
   - → seluruh grup kanan **FALSE** → cabang kiri **FALSE**.
3. **FALSE OR FALSE = FALSE → baris ditolak.** Untuk **semua** customer → 0 baris.

**Tegas:** Untuk `operations` SOA, policy ini **MENOLAK** baca customer. Kondisi yang gagal = `(is_manager_or_above() OR assigned_to=uid OR created_by=uid)` — ketiganya false karena `operations` bukan manajer dan customer bukan miliknya.

Kontras dengan super_admin: cabang `is_super_admin()` TRUE → semua baris lolos → dropdown penuh. **Ini menjelaskan persis kenapa super_admin penuh & operations kosong.**

---

### 3 — FUNGSI RLS PENDUKUNG

**[CRITICAL] `is_manager_or_above()` tidak mengenal `operations`.**

`schema_snapshot.sql:738`
```sql
CREATE FUNCTION public.is_manager_or_above() RETURNS boolean ... AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.code IN ('super_admin','admin','ceo','gm','manager','supervisor')  -- ⟵ tanpa 'operations'
      AND ur.is_active = true
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
  );
$$;
```
- **`operations` tidak ada di daftar `r.code IN (...)`** → mengembalikan FALSE untuk Gigih. Inilah cabang yang seharusnya bisa membuka akses tapi gagal.

**`get_user_company_id()` — bekerja benar (bukan penyebab).** `:471`
```sql
CREATE FUNCTION public.get_user_company_id() RETURNS uuid ... AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;
```
- Mengembalikan `company_id` dari `profiles`. Untuk Gigih akan mengembalikan UUID SOA (asalkan `profiles.company_id` Gigih terisi = SOA). Bila NULL (belum ter-backfill), maka `company_id = NULL` → cabang kiri juga gagal — **perlu diverifikasi** (lihat Catatan Verifikasi). Namun bahkan bila terisi benar, akses tetap ditolak karena grup kanan (Area 2/3). Jadi ini bukan akar, hanya faktor tambahan yang perlu dipastikan.

**`is_super_admin()` — benar.** `:757` (hanya `super_admin`). Menjelaskan Den lolos.

**`has_role('operations')` — ADA & dipakai di tabel lain, TAPI tidak di `accounts`.** `:617`. Dipakai di policy write `sp_orders`/`sp_order_items`/`sp_btb`/`dc_master`. Ketiadaannya di `prospects_read` inilah inkonsistensinya (lihat Area 5).

**Catatan pola usang:** `is_admin_or_above()` (`:712`) hanya `('super_admin','admin')` — tidak mengenal ceo/manager. Tidak dipakai `prospects_read`, jadi tak relevan langsung ke kasus ini, tapi relevan ke TD-01 (di luar scope).

---

### 4 — GATING FRONTEND & MENU

**[INFO] Gating FE BUKAN penyebab — halaman terbuka, hanya datanya kosong.**

- Menu `input` (Input SP) sudah role-gated dan **memasukkan `operations`**:
  - `src/App.jsx:497` → `{ id: 'input', label: 'Input SP', ..., module: 'logistics', role: ['super_admin','admin','ceo','gm','manager','operations','sales'] }`
- Artinya Gigih **bisa membuka** halaman Input SP (sidebar tampil, page render). Gejala lapangan (halaman muncul, dropdown kosong) konsisten dengan ini.
- Tidak ada gating FE yang menyaring **isi** array `customers` berdasarkan role. Filter FE satu-satunya adalah `c.active !== false` (`App.jsx:4310` / `App.jsx:3566`), dan itu jalan **setelah** data ada; untuk operations array sudah kosong dari DB sebelum filter apa pun.
- **Pemisahan tegas:** Masalah = **RLS DB** (Area 2/3). Gating FE & query FE tidak berkontribusi.

> Sekadar konteks (bukan penyebab): CLAUDE.md sudah menandai FLAG bahwa `input` di-gate `module:'logistics'` yang role-def-nya termasuk `sales`. Itu isu terpisah (over-expose sales), tidak menyentuh kasus dropdown kosong operations.

---

### 5 — KONSISTENSI LINTAS JALUR

**[HIGH] Inkonsistensi pola: SP baru memberi hak `operations`, `accounts` tidak → operations bisa "menulis" SP tapi tak bisa "membaca" customer-nya.**

- Policy read SP baru **memberi seluruh anggota company** akses baca:
  - `sp_orders_read` (`:11348`): `is_super_admin() OR company_id = get_user_company_id()` — **tanpa** syarat manajer/owner → operations SOA **BISA** baca semua SP order di SOA.
  - `sp_order_items_read` (`:11314`): sama.
  - Policy **insert/update** SP secara eksplisit menyebut `has_role('operations')` (`:11341`, `:11355`, `:11307`, `:11321`, `:11205`, `:11219`) + `dc_master` (`:9569`, `:9583`).
- **Tetapi `accounts` (`prospects_read`, `:10870`) memakai pola CRM lama** (manager-or-above / owner-only) yang **tidak** menyertakan `operations` maupun "semua anggota company". → Ketimpangan: operations diberi izin membuat SP, tetapi sumber wajib `customer_id` tak bisa dibacanya.

- **Pola fetch accounts berbeda antar modul (inkonsistensi kode, bukan penyebab kosong):**
  - `listCustomers` (`db.js:212`): **tanpa** filter `company_id` di FE (andalkan RLS).
  - `InquiryFormPage.jsx:166-168`: **dengan** filter `.eq('company_id', profile.company_id)` + `.limit(1000)` — untuk prospect & customer.
  - Keduanya tetap menabrak tembok RLS yang sama untuk operations; bedanya operations praktis tak memakai modul CRM, sehingga gejala hanya muncul mencolok di Input SP.

---

### 6 — DAMPAK & LINGKUP

**[CRITICAL] Role lain yang kemungkinan kena hal sama di Input SP:**
- `sales` — juga bukan `is_manager_or_above()`. Sales **hanya** melihat customer yang `assigned_to`/`created_by` = dirinya. Untuk Input SP (butuh semua customer Storbit), sales akan melihat dropdown **kosong atau timpang** (hanya customer miliknya). Menu `input` juga memasukkan `sales` (`:497`), jadi gejalanya nyata.
- Semua role **non**-{super_admin, admin, ceo, gm, manager, supervisor} yang diberi menu `input` → dropdown kosong/timpang. Yang **aman**: manager ke atas (lolos `is_manager_or_above`) dan super_admin.

**[HIGH] Risiko sebaliknya — over-permissive (kebocoran lintas-customer) di jalur SP lama:**
- `sp_items` (tabel SP lama, masih sumber submit legacy `doInsert`/`bulkInsertSpItems`):
  - `sp_items_read` (`:11280`) = `USING (true)`, juga insert/update/delete `true` (`:11273`/`:11287`/`:11266`).
- `sp_btbs` (`:11246` read `USING(true)`), `delivery_notes`/`delivery_note_items` (`:9649`/`:9677` `USING(true)`), `picking_lists`/`picking_list_items`/`picking_list_materials` (`:10686`/`:10714`/`:10742` `USING(true)`), `ar_ttfs`/`ar_btbs` (`:9263`/`:9236` `USING(true)`), `product_warehouse_location` (`:10898`), `stock_ledger` (`:11423`), `warehouses`/`vendors` (`:11609`/`:11573`).
  - **Konsekuensi:** setiap user terautentikasi (lintas entitas) bisa membaca **semua** baris tabel-tabel ini → kebocoran data SP/pengiriman/AR lintas customer & lintas entitas. Ini **pre-existing tech-debt** (bukan regresi dari kasus dropdown), tapi wajib dicatat: skema SP **baru** (`sp_orders` dkk.) sudah company-scoped, sedangkan tabel **lama** yang masih dipakai submit belum. Ironi: `accounts` terlalu **ketat** (operations kebablasan ditolak), sementara `sp_items`/`delivery_notes` terlalu **longgar** (semua orang bisa baca semua).

---

## AKAR MASALAH (ROOT CAUSE)

Rantai sebab-akibat, dengan bukti:

1. Dropdown Customer diisi dari prop `customers` (App.jsx:1465 → 2654/3319), yang berasal dari `listCustomers()` (`db.js:212`) — query bersih tanpa filter company/role, **mengandalkan RLS**.
2. RLS `accounts` untuk SELECT hanya `prospects_read` (`schema_snapshot.sql:10870`). Qual: `is_super_admin() OR (company_id = get_user_company_id() AND (is_manager_or_above() OR assigned_to=uid OR created_by=uid))`.
3. Untuk Gigih (`operations`, SOA): `is_super_admin()` = FALSE; `is_manager_or_above()` = FALSE karena fungsi `:738` **tidak memuat `'operations'`**; `assigned_to`/`created_by` ≠ Gigih karena customer di-import bukan atas namanya.
4. → Qual = FALSE untuk **semua** baris customer → PostgREST mengembalikan **array kosong** (bukan error). `customers = []`.
5. → `InputSPPage.jsx:353` / `FormModal` (`App.jsx:4310`) memetakan array kosong → **dropdown kosong**.
6. Untuk Den (`super_admin`): cabang `is_super_admin()` = TRUE → semua baris lolos → **dropdown penuh**.

**Titik kegagalan spesifik:** kombinasi **policy `prospects_read` (`:10870`)** + **fungsi `is_manager_or_above()` (`:738`) yang mengecualikan `operations`** + **data customer yang bukan milik operations**. Diperparah oleh inkonsistensi: policy write SP baru sudah mengizinkan `operations` (`:11341` dst.), tetapi read `accounts` tidak.

**Faktor yang perlu dipastikan (kemungkinan kedua, lebih parah bila benar):** bila `profiles.company_id` Gigih **NULL/salah**, `get_user_company_id()` mengembalikan NULL → cabang kiri gagal bahkan untuk manajer sekalipun. Tetap menghasilkan dropdown kosong. Wajib dicek (lihat Verifikasi) untuk memastikan akar = "role tidak diizinkan" vs "company_id kosong".

---

## OPSI PERBAIKAN

> Semua opsi hanya usulan — **tidak dieksekusi**. Prinsip AGENTS.md: jangan lemahkan RLS asal jalan.

### Opsi A — Tambah `operations` ke daftar pembaca `accounts` (paling tepat sasaran) — **REKOMENDASI**
Ubah `prospects_read` agar anggota company yang berhak operasional bisa membaca customer, mis. menambah `OR public.has_role('operations')` di dalam cabang company-scoped:
```sql
-- USULAN (belum dijalankan)
CREATE POLICY prospects_read ON public.accounts FOR SELECT USING (
  is_super_admin()
  OR (
    company_id = get_user_company_id()
    AND (
      is_manager_or_above()
      OR has_role('operations')          -- ⟵ tambahan
      OR assigned_to = auth.uid()
      OR created_by  = auth.uid()
    )
  )
);
```
- **Trade-off keamanan:** operations melihat **semua** account di company-nya (prospect + customer), termasuk data pipeline CRM yang mungkin sensitif. Untuk kebutuhan Input SP sebenarnya cukup customer (`account_status='customer'`), bukan prospect.
- **Varian A′ (lebih ketat):** batasi hanya customer:
  `OR (has_role('operations') AND account_status = 'customer')`. Operations tak bisa mengintip prospect CRM. **Ini paling selaras AGENTS.md** (least privilege, tetap fungsional).
- **Konsistensi:** menyamakan `accounts` dengan pola SP baru yang sudah memberi `operations` akses. Aman (tetap company-scoped, tetap ada bypass super_admin).

### Opsi B — Perluas `is_manager_or_above()` menambah `operations`
- **Tolak.** Efek samping luas: fungsi ini dipakai banyak policy write (`sp_orders_update`, `dc_master_update`, dll.) dan read oversight lain → operations tiba-tiba dianggap "manajer" di seluruh sistem (bisa approve/oversight). **Melebihi kebutuhan & berisiko** menaikkan privilege lintas modul. Melanggar semangat least-privilege.

### Opsi C — Ubah query FE `listCustomers` agar tak bergantung RLS (mis. RPC SECURITY DEFINER)
- Buat RPC `list_sp_customers()` SECURITY DEFINER yang mengembalikan customer company-scoped untuk role tertentu, dipanggil FE.
- **Trade-off:** memindah otorisasi ke kode RPC (mudah salah, bypass RLS by design), menambah permukaan yang harus diaudit. **Tidak direkomendasikan** kecuali sudah ada pola RPC serupa; kalah rapi dibanding memperbaiki policy langsung.

### Opsi D — Assign customer ke user operations (`assigned_to`)
- Secara data, meng-`assigned_to` semua customer Storbit ke Gigih akan meloloskan cabang `assigned_to=uid`.
- **Tolak sebagai solusi utama.** Tidak scalable (tiap operations baru harus di-assign ulang seluruh customer), rapuh, dan menyalahgunakan kolom kepemilikan CRM. Boleh sebagai *workaround* darurat, bukan perbaikan.

**Rekomendasi akhir:** **Opsi A′** — tambah `has_role('operations') AND account_status='customer'` ke `prospects_read`. Paling aman (least-privilege, tetap company-scoped, tak menyentuh fungsi bersama), memulihkan fungsi Input SP, dan konsisten dengan hak `operations` yang sudah diberikan di skema SP baru. Pertimbangkan juga menambah `sales` bila sales memang harus bisa buat SP (lihat FLAG RBAC di CLAUDE.md — keputusan kebijakan, bahas terpisah).

> Terpisah (bukan bagian kasus ini, tapi wajib ditindak): kencangkan RLS `USING(true)` pada `sp_items`/`delivery_notes`/`picking_lists`/`ar_ttfs`/dst. menjadi company-scoped — kebocoran lintas-entitas (Area 6).

---

## CATATAN VERIFIKASI (SQL — jalankan manual di SQL Editor)

> Tujuan: memastikan (a) role Gigih, (b) company_id Gigih benar = SOA, (c) policy accounts persis, (d) apakah ada customer yang lolos untuk Gigih. **Jangan ubah apa pun — hanya SELECT.**

```sql
-- 1) Semua policy SELECT pada accounts (konfirmasi hanya prospects_read)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='accounts'
ORDER BY policyname;

-- 2) Role aktif Gigih (ganti email bila perlu). Pastikan code='operations'.
SELECT p.id, p.full_name, p.company_id, c.code AS company_code,
       r.code AS role_code, ur.is_active, ur.valid_until
FROM profiles p
LEFT JOIN companies  c  ON c.id = p.company_id
LEFT JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true
LEFT JOIN roles      r  ON r.id = ur.role_id
WHERE p.full_name ILIKE '%gigih%';   -- atau WHERE p.id = '<uuid gigih>'

-- 3) Apakah company_id Gigih benar = SOA (d2e5e565-5f67-4954-b8d9-5979a2a0c697)?
--    Jika NULL → get_user_company_id() = NULL → itu faktor tambahan yang harus dibetulkan juga.

-- 4) Berapa customer SOA yang ADA (tanpa RLS, sebagai super_admin di SQL Editor):
SELECT count(*) AS total_customer_soa
FROM accounts
WHERE account_status='customer' AND deleted_at IS NULL
  AND company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697';

-- 5) Dari jumlah itu, berapa yang assigned_to / created_by = Gigih (yang saat ini bisa dia lihat):
SELECT count(*) FILTER (WHERE assigned_to='<uuid gigih>') AS assigned_ke_gigih,
       count(*) FILTER (WHERE created_by ='<uuid gigih>') AS dibuat_gigih
FROM accounts
WHERE account_status='customer' AND deleted_at IS NULL
  AND company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697';
-- Ekspektasi kasus ini: 0 dan 0 → membuktikan dropdown kosong.

-- 6) Simulasi hasil fungsi seolah-olah sebagai Gigih (jalankan di browser/RLS context,
--    ATAU pakai SET ROLE + request.jwt.claims bila tersedia). Alternatif cepat:
--    verifikasi definisi fungsi tak memuat 'operations'.
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('is_manager_or_above','get_user_company_id','is_super_admin');

-- 7) Bukti akar (opsional, paling meyakinkan) — impersonasi Gigih via Supabase:
--    login sebagai Gigih di browser lalu jalankan di app console:
--    (await supabase.from('accounts').select('id,name').eq('account_status','customer')).data.length
--    → harus 0. Bandingkan login super_admin → > 0.
```

**Interpretasi:**
- Bila (2) menunjukkan role `operations` **dan** (3) company_id = SOA **dan** (4) > 0 **dan** (5) = 0/0 → **akar terkonfirmasi persis** = policy `prospects_read` + `is_manager_or_above()` mengecualikan operations (Opsi A′ adalah perbaikan tepat).
- Bila (3) company_id Gigih **NULL/bukan SOA** → ada masalah tambahan `get_user_company_id()` yang harus dibereskan (backfill `profiles.company_id`), selain penambahan role di policy.
