# MVP Storbit — Rancangan Eksekusi (Fase 0–6)

> **Mode:** RANCANGAN / DESAIN. **Tidak ada eksekusi kode atau DB.** Dokumen ini untuk direview dulu sebelum eksekusi.
> **Basis:** `MVP_STORBIT_AUDIT.md` (audit 2026-07-01) + skema aktual `supabase/schema_snapshot.sql` + pola FE `src/`.
> **Scope entitas:** Storbit = **SOA** (`d2e5e565-5f67-4954-b8d9-5979a2a0c697`), Indomarco. Inventory sudah SOA-scoped.

---

## Ringkasan Fakta Skema (yang jadi patokan rancangan)

Fakta ini menentukan bentuk tabel/kolom baru. Diverifikasi dari snapshot:

- **`sp_items`** = tabel **line-item** (bukan header). Satu SP = banyak baris dengan `sp_no` sama. **Tidak ada `company_id`** (implisit SOA), **tidak ada kolom `status`**, produk = `product_name`/`sku` **TEXT** (tanpa `product_id`). PK `id` uuid. `customer_id` → `accounts(id)`.
- **`sp_btbs`** = mapping SP↔BTB (`sp_no` text, `btb_no`, `remarks`).
- **`ar_ttfs`** = invoice/AR. Ada `no_inv`, `no_sp` (**text**, bukan FK), `customer_id`, `tgl_pembayaran`, `tanggal_menerima`. **Tidak ada** field faktur pajak (no faktur, DPP, PPN).
- **`stock_ledger`** = log pergerakan. `company_id`, `warehouse_id`→`warehouses(id)`, `product_id`→`products(id)`, `movement_type` CHECK sudah termasuk **`reserved`/`unreserved`/`outbound`**, `reference_type`/`reference_id`/`reference_no`, `location_detail`.
- **`stock_summary`** = **VIEW** (bukan tabel) turunan `stock_ledger`: `on_hand`, `reserved`, `available` per (product_id, warehouse_id, company_id).
- **`products`** = katalog. PK uuid, `company_id`, `code`, `name`, `unit/uom`, `default_price`. Hook `useProducts` + komponen autocomplete `ProductDescInput` (di `QuotationFormPage`) sudah ada → bisa di-reuse.
- **RBAC:** `roles`(company-scoped, `code`) → `role_permissions` → `permissions`(`module`+`action`); `user_roles`(multi-role). FE: `ERP_ROLE_PRIORITY` (14 role, di `AuthContext.jsx`), menu via `NEXUS_NAV` + `MENU_KEY_MAP` + `canSeeMenuItem()` (default-deny).
- **Dokumen/attachment:** satu-satunya pola tabel = **`hrga_request_attachments`** (`request_id`, `file_name`, `storage_path`, `file_size_bytes`, `mime_type`, `uploaded_by`, `uploaded_at`, `deleted_at`). **Tidak ada bucket Storage yang didefinisikan di SQL** → bucket dibuat via dashboard (di luar snapshot).
- **Numbering:** RPC `increment_document_sequence(p_company_id, p_document_type, p_department_code, p_year, p_month)` + config `document_types` (`code`, `prefix_format` mis. `{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}`, `seq_padding`, `reset_period`). **SP saat ini TIDAK pakai RPC ini** — `sp_no` digenerate client-side `SP-${Date.now()}`. Dokumen baru (PICK/PACK/SJ) sebaiknya pakai RPC agar rapi.

> **Catatan lintas-fase (penting):** `sp_items` tanpa `company_id` dan tanpa header table adalah **akar banyak kerumitan** (status per-SP harus update banyak baris; reservasi butuh scope company/warehouse). Rancangan ini **tidak** memaksa bikin `sp_orders` header dulu (biar cepat), tapi menandainya sebagai **tech-debt yang diusulkan** bila modul gudang tumbuh.

---

## FASE 0 — Fix Blocker

Tiga sub-item independen. Ini fondasi; sebagian bisa jalan paralel.

### 0.1 — Persistensi status SP (Confirmed/Cancelled)

**1. Tabel/kolom baru**
- `sp_items`: tambah kolom
  - `sp_status text NOT NULL DEFAULT 'draft'` + CHECK `sp_status IN ('draft','confirmed','cancelled')`
  - `confirmed_at timestamptz`, `confirmed_by uuid` (→ `auth.users`)
  - `cancelled_at timestamptz`, `cancel_reason text`
- Status ini **lifecycle konfirmasi**, **terpisah** dari status fulfillment turunan qty (Open/Partial/Closed). Jangan digabung.
- **Konsistensi multi-baris:** confirm/cancel bersifat **per-SP** (`sp_no`), tapi disimpan di banyak baris. Usulkan RPC kecil `set_sp_status(p_sp_no text, p_status text, p_reason text)` (SECURITY DEFINER) yang `UPDATE sp_items ... WHERE sp_no = p_sp_no` atomik — hindari update parsial dari FE. (Alternatif MVP ultra-cepat: satu `update().eq('sp_no', …)` dari FE; tapi RPC lebih aman.)

**2. Frontend**
- `SalesOrderPage.jsx` `confirmModal()` (baris ~493, saat ini `// TODO` + toast saja) → panggil RPC/update lalu refetch. Aktifkan `STATUS_META.CONFIRMED/CANCELLED` (sudah didefinisikan, belum dipakai).
- `SalesOrderDetailPage.jsx`: badge status pakai `sp_status`; tombol Konfirmasi/Cancel wire ke handler nyata (+ modal alasan cancel yang sudah ada).
- `db.js`: `spFromDb`/`spToDb` tambah `sp_status`, `confirmed_at`, dll.

**3. MENU_KEY_MAP / RBAC** — tidak ada menu baru. Aksi confirm/cancel idealnya digate `hasPermission('sales_orders','approve')` (permission module `sales_orders` sudah ada di katalog). Untuk MVP boleh reuse gate existing halaman.

**4. Dependency** — tidak ada. Bisa dikerjakan pertama.

**5. Effort & prioritas** — **KECIL.** 🔴 **PALING PENTING untuk MVP.** Ini menutup bug menyesatkan (tombol tampak jalan padahal cuma toast). Wajib sebelum demo.

---

### 0.2 — Link `sp_items` ke katalog produk (`product_id` FK)

**1. Tabel/kolom baru**
- `sp_items`: tambah `product_id uuid` (→ `products(id)`, **NULLABLE**). `product_name`/`sku` **dipertahankan** (backward-compat + tetap boleh free-text bila produk belum di katalog).
- **Tidak** migrasi paksa data lama teks→FK. SP baru mengisi `product_id`; SP lama tetap text. (Backfill = skrip terpisah opsional, di luar MVP.)

**2. Frontend**
- `InputSPPage.jsx`: ganti input Product Name jadi **autocomplete produk** — reuse `useProducts` hook + pola `ProductDescInput` dari `QuotationFormPage.jsx`. Pilih produk → set `product_id` + prefill `product_name`/`sku`/`unit`. Tetap izinkan ketik manual (product_id null).
- `db.js` `bulkInsertSpItems`/`spToDb`: sertakan `product_id`.

**3. MENU_KEY_MAP / RBAC** — tidak ada.

**4. Dependency** — tidak ada untuk kolomnya. **Menjadi prasyarat Fase 1** (cek/reservasi stok butuh `product_id`).

**5. Effort & prioritas** — **SEDANG.** 🟡 Penting sebagai fondasi Fase 1, **tapi tidak wajib untuk demo end-to-end tanpa stok** (picking/surat jalan bisa jalan pakai product_name/sku text). Boleh nyusul jika waktu mepet — **kecuali** Fase 1 mau ikut didemokan.

---

### 0.3 — Aktifkan upload/link dokumen SP

**1. Tabel/kolom baru** — tabel baru `sp_documents`, **mirror `hrga_request_attachments`**:
```
sp_documents
  id            uuid PK default gen_random_uuid()
  company_id    uuid   default SOA        -- scoping RLS
  sp_no         text   NOT NULL           -- link ke SP (text, konsisten sp_btbs)
  doc_type      text                      -- 'surat_jalan' | 'po_customer' | 'btb' | 'rincian_harga' | 'lainnya'
  file_name     varchar(255) NOT NULL
  storage_path  text   NOT NULL           -- path di bucket
  file_size_bytes bigint
  mime_type     varchar(100)
  external_url  text                      -- alternatif: link Drive (bila tak upload)
  uploaded_by   uuid  -> auth.users
  uploaded_at   timestamptz default now()
  deleted_at    timestamptz               -- soft delete
```
- **Storage bucket** `sp-documents` dibuat via dashboard (di luar SQL snapshot) + RLS bucket. Catat di PROGRESS.
- **RLS tabel:** read/insert untuk role yang boleh lihat SP; delete = soft-delete oleh uploader/super_admin.

**2. Frontend**
- `SalesOrderDetailPage.jsx` tab **Dokumen** (baris ~1086, saat ini stub toast): wire drag-drop → `supabase.storage.from('sp-documents').upload()` → insert row `sp_documents` → list dokumen (nama, tipe, tanggal, tombol download/hapus).
- **Fallback ultra-cepat** (jika Storage belum siap malam ini): pakai field `external_url` saja — form "Tambah link dokumen" (paste URL Drive) → insert row tanpa upload file. Effort **kecil**, langsung menutup "dokumen tercecer".
- `db.js`: helper `listSpDocuments(spNo)`, `addSpDocument(...)`, `deleteSpDocument(id)` (mirror `listSpBtbs`/`addSpBtb`).

**3. MENU_KEY_MAP / RBAC** — tidak ada menu baru; ikut gate halaman SP detail.

**4. Dependency** — tidak ada (independen dari 0.1/0.2).

**5. Effort & prioritas** — **SEDANG** (full upload) / **KECIL** (fallback link). 🔴 **ROI tinggi** — menutup langkah 2/8/12/16 (dokumen) sekaligus. UI drag-drop sudah ada. Untuk MVP besok: **kirim fallback link dulu**, upgrade ke Storage upload nyusul.

---

## FASE 1 — Cek Stok & Reservasi

**1. Tabel/kolom baru**
- **Cek stok:** tidak perlu tabel — baca **VIEW `stock_summary`** by `product_id` + `warehouse_id` + `company_id (SOA)`.
- **Reservasi:** **tidak perlu tabel baru** — tulis ke **`stock_ledger`** dengan `movement_type='reserved'`, `qty`, `reference_type='sp'`, `reference_id=<sp_items.id atau null>`, `reference_no=<sp_no>`, `warehouse_id`, `product_id`. Cancel/batal → `movement_type='unreserved'`. `stock_summary.available` otomatis ikut.
- **Kekurangan stok (opsional):** tabel ringan `sp_stock_shortages` (`id`, `sp_no`, `product_id`, `qty_requested`, `qty_available`, `qty_short`, `warehouse_id`, `checked_at`, `checked_by`) — atau **cukup dihitung on-the-fly** dan ditampilkan (belum perlu persist untuk MVP). Rekomendasi: hitung dulu, persist nyusul.
- **RPC (disarankan):** `reserve_sp_stock(p_sp_no text, p_warehouse_id uuid)` SECURITY DEFINER — loop line item, cek `available`, tulis baris `reserved`, kembalikan daftar shortage. Atomik → hindari over-reserve saat konkuren.

**2. Frontend**
- Panel/tab **"Cek Stok"** di `SalesOrderDetailPage.jsx`: per line item tampilkan `available` vs `qty` (badge Ready / Kurang), pilih warehouse (Gudang Semper / Gudang Others). Mirror tampilan `StokBarangPage.jsx`.
- Tombol **"Reservasi Stok"** (muncul saat SP `confirmed`) → panggil RPC → tampilkan hasil + shortage. Baca ulang `stock_summary`.

**3. MENU_KEY_MAP / RBAC** — tidak ada menu baru. Aksi reservasi digate role gudang/operations (lihat Fase 5); untuk sekarang reuse gate SP detail.

**4. Dependency** — **butuh 0.2 selesai** (`product_id` di `sp_items`). Idealnya juga 0.1 (reservasi dipicu saat `confirmed`).

**5. Effort & prioritas** — **BESAR** (view + RPC + wiring + edge case shortage/konkuren). 🟡 **Bisa nyusul.** Menurut audit, integrasi SP↔inventory = proyek besar; **taruh setelah slice demo**. Untuk demo besok boleh di-skip (gudang cek stok manual dulu), fokus ke alur picking→surat jalan.

---

## FASE 2 — Picking List (RANCANGAN SIAP-EKSEKUSI)

> **Status:** detailed, ready to execute. Depends on **Slice 0.1 (`sp_items.sp_status`) — SUDAH SELESAI** (`3171efb`). Independen dari 0.2 (`product_id`) & Fase 1 (stok/reservasi).
> **Fakta patokan terverifikasi dari snapshot:** `sp_items` RLS **permissif penuh** (`USING(true)` read/insert/update/delete) → Storbit single-entity SOA, gating di app-level. `warehouses(id, company_id, code, name, …)` ada. `increment_document_sequence(p_company_id, p_document_type, p_department_code, p_year, p_month)` **mengembalikan integer** saja (FE/RPC yang format string). Pola numbering FE: `useHrgaRequests.js:166-205` (`HRG/{ENTITY}/{year}/{seq4}`). Trigger generik `public.set_updated_at()` tersedia. Detail SP (`SalesOrderDetailPage`) menerima prop `group` yang **sudah** membawa `spStatus` (dari Slice 0.1).

### 2.1 Skema DB — 2 tabel (mirror `sp_items`, RLS permissif)

**`picking_lists`** (header, 1 per generate):
| Kolom | Tipe | Null | Default | Ket |
|-------|------|------|---------|-----|
| id | uuid | no | `gen_random_uuid()` | PK |
| company_id | uuid | no | SOA uuid | scope numbering / multi-entity nanti |
| picking_no | text | no | — | **UNIQUE**; via numbering `PICK` |
| sp_no | text | no | — | sumber SP (text, mirror `sp_btbs`) |
| warehouse_id | uuid | yes | — | FK `warehouses(id)`; dipilih di detail |
| assigned_to | uuid | yes | — | FK `auth.users(id)`; staf gudang |
| status | text | no | `'pending'` | CHECK `pending/in_progress/done/cancelled` |
| notes | text | yes | — | |
| created_by | uuid | yes | — | FK `auth.users(id)` |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | trigger `set_updated_at` |
| started_at | timestamptz | yes | — | di-set saat →`in_progress` |
| completed_at | timestamptz | yes | — | di-set saat →`done` |

**`picking_list_items`** (baris, di-copy dari `sp_items` confirmed):
| Kolom | Tipe | Null | Default | Ket |
|-------|------|------|---------|-----|
| id | uuid | no | `gen_random_uuid()` | PK |
| picking_list_id | uuid | no | — | FK `picking_lists(id)` **ON DELETE CASCADE** |
| sp_item_id | uuid | yes | — | FK `sp_items(id)` **ON DELETE SET NULL** (jejak balik) |
| product_id | uuid | yes | — | FK `products(id)`; **NULL** sampai 0.2 |
| product_name | text | no | `''` | snapshot dari `sp_items` |
| sku | text | no | `''` | snapshot |
| qty_requested | integer | no | `0` | = outstanding (`qty - shipped_qty`) |
| qty_picked | integer | no | `0` | diisi staf gudang |
| location_detail | text | yes | — | lokasi rak (opsional) |
| status | text | no | `'pending'` | CHECK `pending/picked/short` (item-level) |
| created_at | timestamptz | no | `now()` | |

- **RLS:** mirror `sp_items` → `ENABLE ROW LEVEL SECURITY` + policy read/insert/update/delete `USING(true)`/`WITH CHECK(true) TO authenticated`. (Konsisten dgn model Storbit; gating nyata di menu/role app-level.)
- **GRANT** eksplisit setelah CREATE (aturan wajib CLAUDE.md).
- **Index:** `sp_no`, `status` (list filter); UNIQUE `picking_no`.

### 2.2 Numbering (`PICK`)
- Pakai `increment_document_sequence(SOA, 'PICK', 'WH', <year>, 0)` → integer, lalu format **`PICK/{ENTITY}/WH/{YYYY}/{SEQ4}`** (entity = `companies.code` SOA, di-fetch dinamis — mirror HRGA).
- **`document_types` row `PICK`** (opsional tapi disarankan utk governance; RPC numbering TIDAK butuh row ini — hanya sentuh `document_sequences`).

### 2.3 Generate dari SP `confirmed` — **RPC atomik** (rekomendasi)
Alih-alih orkestrasi multi-statement di FE (risiko header yatim bila insert item gagal), pakai **RPC `generate_picking_from_sp(p_sp_no, p_warehouse_id)`** SECURITY DEFINER: validasi `sp_status='confirmed'` + guard idempotensi (tolak bila sudah ada picking non-cancelled utk `sp_no`) + numbering + insert header & items dalam **satu transaksi**, kembalikan `(picking_list_id, picking_no)`. Draft SQL di §2.8.
- **qty_requested = `GREATEST(qty - shipped_qty, 0)`** (outstanding); hanya baris outstanding>0 yang ikut. Kalau semua sudah terkirim → RPC raise (tak ada yang perlu di-pick).
- **Alternatif ringan (fallback):** orkestrasi FE mirror HRGA (fetch confirmed items → RPC seq → format → insert header → insert items). Dipakai bila tak mau nambah RPC. **Tak disarankan** (non-atomik).

### 2.4 Frontend (mirror `SalesOrderPage`/`SalesOrderDetailPage`)
- **`src/modules/logistics/PickingListPage.jsx`** — list picking (tabel: No, Picking No, SP No, Status badge, Ditugaskan ke, Dibuat; filter status; klik row → detail). Pola `StatusBadge`/`STATUS_META` dari `SalesOrderPage`.
- **`src/modules/logistics/PickingListDetailPage.jsx`** — header (picking_no, sp_no, status, warehouse, assigned) + tabel item (product/sku/qty_requested/`qty_picked` input/location) + aksi: **Assign** (warehouse + staf), **Mulai** (`pending→in_progress`, set `started_at`), **Selesai** (`in_progress→done`, set `completed_at`; syarat qty_picked terisi), **Batalkan** (`→cancelled`).
- **`SalesOrderDetailPage.jsx`** — tombol **"Generate Picking List"** muncul **hanya bila `group.spStatus === 'confirmed'`** → `generatePickingFromSp(spNo)` → toast + navigasi ke picking detail. (Scope kecil: satu tombol + satu handler, tak ubah logic lain.)
- **`db.js`** helper baru: `generatePickingFromSp(spNo, warehouseId?)` (rpc), `listPickingLists()`, `getPickingList(id)`, `updatePickingStatus(id, status)`, `assignPicking(id, {warehouse_id, assigned_to})`, `savePickingItem(itemId, {qty_picked, location_detail, status})`. Opsional hook `usePickingLists` (mirror `useSpItems`) atau fetch langsung di page.

### 2.5 Menu + RBAC (role-only gating — demo-safe)
- **ERP_MENU_GROUPS** (grup Logistics, section "Storbit — Trading", `App.jsx:~485`): tambah leaf
  `{ id: 'picking', label: 'Picking List', icon: ClipboardList, role: ['super_admin','admin','ceo','gm','manager','operations'] }`.
- **NEXUS_NAV** (grup `nav-sp` "Daftar Pesanan (Storbit)", `App.jsx:~856`): tambah leaf gateless `{ id: 'picking', label: 'Picking List', icon: ClipboardList }` (resolusi visibilitas via `findMenuItemById` → node ERP_MENU_GROUPS ber-role).
- **MENU_KEY_MAP: JANGAN tambah entri** untuk `picking`. **Alasan (pelajaran dari bug CRM `e4f448b`):** kalau ada `MENU_KEY_MAP['picking']`, `canSeeMenuItem` mengecek `hasMenuPermission` DULU → butuh grant DB per-user (rapuh utk SOA) → bisa hilang utk operations. **Role-only** membuat gating jatuh ke `item.role.includes(role)` → operations pasti lihat, tanpa gantung ke seeding permission. Konsisten dgn pola leaf CRM.
- **Render block** (`App.jsx`): `activeMenu === 'picking'` → `PickingListPage`; detail via state `selectedPickingId` (mirror `selectedSpId`) → `PickingListDetailPage`. Reset `selectedPickingId` di `navigateTo` (mirror reset CRM). Content-gate F4/redirect-guard sudah otomatis benar (role-gated leaf lolos `isMenuAccessible` utk operations).
- **Role gudang:** DITUNDA (belum dibuat). `operations` sebagai proxy — sesuai instruksi.

### 2.6 Dependency & urutan eksekusi internal
1. **DB** (§2.8 STEP 1–5): tabel + index + RLS + GRANT + trigger + (opsional) `document_types PICK` + RPC `generate_picking_from_sp` → **kamu jalankan manual, verifikasi**.
2. **`db.js`** helper.
3. **`PickingListPage` + `PickingListDetailPage`** + wiring menu/render/state di `App.jsx`.
4. **Tombol Generate** di `SalesOrderDetailPage`.
5. Build + lint. Refresh `schema_snapshot.sql` (pg_dump) setelah SQL.

**Effort:** SEDANG. 🟢 Slice minimal (generate → assign → status) sudah sangat demoable — ini "tengah" flow yang selama ini kosong.

### 2.7 Verifikasi (setelah SQL)
```sql
-- struktur & constraint
SELECT table_name, count(*) FROM information_schema.columns
WHERE table_name IN ('picking_lists','picking_list_items') GROUP BY table_name;
-- smoke test generate (ganti <SP_NO> dgn SP yang SUDAH confirmed dari Slice 0.1)
SELECT * FROM public.generate_picking_from_sp('<SP_NO>', NULL);
SELECT picking_no, sp_no, status FROM public.picking_lists WHERE sp_no = '<SP_NO>';
SELECT product_name, qty_requested FROM public.picking_list_items
WHERE picking_list_id = (SELECT id FROM picking_lists WHERE sp_no='<SP_NO>' LIMIT 1);
-- idempotensi: panggil lagi → harus RAISE "sudah ada"
```
> Catatan: `auth.uid()` NULL di SQL Editor → `created_by` NULL saat tes manual (normal; terisi saat dipanggil dari browser).

### 2.8 DRAFT SQL (step-by-step, belum dieksekusi)

**STEP 1 — Tabel + index:**
```sql
CREATE TABLE public.picking_lists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL DEFAULT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
  picking_no    text NOT NULL,
  sp_no         text NOT NULL,
  warehouse_id  uuid REFERENCES public.warehouses(id),
  assigned_to   uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','done','cancelled')),
  notes         text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  CONSTRAINT picking_lists_picking_no_key UNIQUE (picking_no)
);
CREATE INDEX idx_picking_lists_sp_no  ON public.picking_lists (sp_no);
CREATE INDEX idx_picking_lists_status ON public.picking_lists (status);

CREATE TABLE public.picking_list_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_list_id uuid NOT NULL REFERENCES public.picking_lists(id) ON DELETE CASCADE,
  sp_item_id      uuid REFERENCES public.sp_items(id) ON DELETE SET NULL,
  product_id      uuid REFERENCES public.products(id),
  product_name    text NOT NULL DEFAULT '',
  sku             text NOT NULL DEFAULT '',
  qty_requested   integer NOT NULL DEFAULT 0,
  qty_picked      integer NOT NULL DEFAULT 0,
  location_detail text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','picked','short')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_picking_list_items_pl ON public.picking_list_items (picking_list_id);
```

**STEP 2 — Trigger `updated_at`:**
```sql
CREATE TRIGGER trg_picking_lists_updated_at
  BEFORE UPDATE ON public.picking_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

**STEP 3 — RLS (permissif, mirror `sp_items`) + GRANT:**
```sql
ALTER TABLE public.picking_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY picking_lists_read   ON public.picking_lists      FOR SELECT TO authenticated USING (true);
CREATE POLICY picking_lists_insert ON public.picking_lists      FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY picking_lists_update ON public.picking_lists      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY picking_lists_delete ON public.picking_lists      FOR DELETE TO authenticated USING (true);

CREATE POLICY pli_read   ON public.picking_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY pli_insert ON public.picking_list_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pli_update ON public.picking_list_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pli_delete ON public.picking_list_items FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.picking_lists      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.picking_list_items TO authenticated;
GRANT ALL ON public.picking_lists      TO service_role;
GRANT ALL ON public.picking_list_items TO service_role;
```

**STEP 4 — (opsional) `document_types` PICK:**
```sql
INSERT INTO public.document_types
  (company_id, module, code, name, prefix_format, department_code, reset_period, seq_padding, approval_required)
VALUES
  ('d2e5e565-5f67-4954-b8d9-5979a2a0c697', 'logistics', 'PICK', 'Picking List',
   '{DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}', 'WH', 'yearly', 4, false)
ON CONFLICT DO NOTHING;  -- aman bila sudah ada / bila ada unique (company_id, code)
```

**STEP 5 — RPC `generate_picking_from_sp`:**
```sql
CREATE OR REPLACE FUNCTION public.generate_picking_from_sp(
  p_sp_no        text,
  p_warehouse_id uuid DEFAULT NULL
) RETURNS TABLE (picking_list_id uuid, picking_no text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';  -- Storbit / SOA
  v_entity     text;
  v_year       int  := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::int;
  v_seq        int;
  v_no         text;
  v_pl_id      uuid;
  v_uid        uuid := auth.uid();
  v_outstanding int;
BEGIN
  -- 1. SP harus ada & confirmed
  IF NOT EXISTS (SELECT 1 FROM sp_items WHERE sp_no = p_sp_no AND sp_status = 'confirmed') THEN
    RAISE EXCEPTION 'SP % tidak ditemukan atau belum confirmed', p_sp_no;
  END IF;

  -- 2. Idempotensi: tolak bila sudah ada picking non-cancelled
  IF EXISTS (SELECT 1 FROM picking_lists WHERE sp_no = p_sp_no AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Picking list untuk SP % sudah ada', p_sp_no;
  END IF;

  -- 3. Harus ada minimal 1 baris outstanding (qty - shipped_qty > 0)
  SELECT count(*) INTO v_outstanding
  FROM sp_items WHERE sp_no = p_sp_no AND sp_status = 'confirmed' AND (qty - shipped_qty) > 0;
  IF v_outstanding = 0 THEN
    RAISE EXCEPTION 'SP % tidak punya item outstanding untuk di-pick', p_sp_no;
  END IF;

  -- 4. Numbering: PICK/{ENTITY}/WH/{YYYY}/{SEQ4}
  SELECT code INTO v_entity FROM companies WHERE id = v_company_id;
  v_seq := increment_document_sequence(v_company_id, 'PICK', 'WH', v_year, 0);
  v_no  := 'PICK/' || COALESCE(v_entity, 'SOA') || '/WH/' || v_year || '/' || lpad(v_seq::text, 4, '0');

  -- 5. Header
  INSERT INTO picking_lists (company_id, picking_no, sp_no, warehouse_id, status, created_by)
  VALUES (v_company_id, v_no, p_sp_no, p_warehouse_id, 'pending', v_uid)
  RETURNING id INTO v_pl_id;

  -- 6. Items — copy baris confirmed yang masih outstanding
  INSERT INTO picking_list_items
    (picking_list_id, sp_item_id, product_id, product_name, sku, qty_requested)
  SELECT v_pl_id, si.id, NULL, si.product_name, si.sku, GREATEST(si.qty - si.shipped_qty, 0)
  FROM sp_items si
  WHERE si.sp_no = p_sp_no AND si.sp_status = 'confirmed' AND (si.qty - si.shipped_qty) > 0;

  RETURN QUERY SELECT v_pl_id, v_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_picking_from_sp(text, uuid) TO authenticated;
```

> **Keputusan yang perlu kamu konfirmasi sebelum eksekusi:**
> 1. **qty_requested = outstanding** (`qty - shipped_qty`) — atau mau **qty penuh**? (default rancangan: outstanding.)
> 2. **RPC atomik** (§2.3) vs orkestrasi FE — default: RPC.
> 3. **`document_types PICK`** (STEP 4) di-seed atau skip? (RPC jalan tanpa itu.)
> 4. **Gating role-only** (tanpa MENU_KEY_MAP) — setuju? (menghindari bug seperti CRM `e4f448b`.)

---

## FASE 3 — Packing & Surat Jalan

**1. Tabel/kolom baru**

**(a) Packing** — mirror picking:
```
packing_lists (header)
  id, company_id default SOA, packing_no (doc 'PACK'), picking_list_id -> picking_lists,
  sp_no, status ('pending','packed','shipped'), total_koli integer, total_weight numeric,
  created_by, created_at, packed_at
packing_list_items
  id, packing_list_id -> packing_lists CASCADE, picking_list_item_id -> picking_list_items,
  product_name/sku snapshot, qty, koli integer, weight numeric, notes
```

**(b) Surat Jalan (delivery note)** — mirror `ar_ttfs`/invoice (header + item + PDF + numbering):
```
delivery_notes (header)
  id            uuid PK
  company_id    uuid default SOA
  do_no         text NOT NULL        -- via increment_document_sequence doc 'SJ'
  sp_no         text NOT NULL
  packing_list_id uuid -> packing_lists (nullable)
  customer_id   uuid -> accounts
  recipient_name text
  ship_address  text
  driver_name   text                 -- diisi Fase 4 boleh
  vehicle_plate text
  do_date       date default today
  status        text default 'draft' CHECK IN ('draft','issued','out','delivered','cancelled')
  notes         text
  created_by    uuid, created_at timestamptz
delivery_note_items
  id, delivery_note_id -> delivery_notes CASCADE, product_name/sku snapshot, qty, unit, notes
```
- **Numbering:** `document_types` code `SJ` (atau `DO`), dept `WH`.
- **Barang keluar gudang:** saat DO `issued`/`out` → tulis `stock_ledger` `movement_type='outbound'` (+ `unreserved` jika sebelumnya reserved di Fase 1) `reference_type='do'`, `reference_no=do_no`. Set `sp_items.kirim=true` + `shipping_date` (update manifest — kolom sudah ada).

**2. Frontend**
- `src/modules/logistics/DeliveryNotePage.jsx` (list) + `DeliveryNoteDetailPage.jsx` (header + item + status).
- **`DeliveryNotePDF.jsx`** — **mirror `QuotationPDF.jsx`** (`@react-pdf/renderer`, `StyleSheet`, `PDFDownloadLink`). Header entitas SOA, no DO, customer/alamat, tabel item, driver/plat, tanda tangan penerima.
- Packing UI bisa **ringkas**: form total koli/berat di detail picking yang selesai (tak wajib halaman penuh untuk MVP).
- Aksi "Buat Surat Jalan" dari packing/picking `done`.

**3. MENU_KEY_MAP / RBAC**
- Menu: `{ id: 'surat-jalan', label: 'Surat Jalan', icon: Truck, module:'logistics' }` → `MENU_KEY_MAP 'surat-jalan':'logistics_do'`. Packing bisa jadi sub/aksi (tak wajib menu terpisah).
- Role: gudang + operations + admin.

**4. Dependency** — **butuh Fase 2** (packing dari picking done; DO dari packing/SP). Outbound ledger butuh 0.2/Fase 1 hanya jika mau akurasi stok; DO+PDF bisa jalan tanpa stok.

**5. Effort & prioritas** — **SEDANG.** 🟢 **Surat Jalan PDF = bukti visual paling "wow"** untuk SCM (dokumen cetak nyata). Prioritaskan **DO + PDF + numbering**; packing detail (koli/berat) boleh disederhanakan.

> **6.2 — Surat Jalan #2 (finance/tagihan): ⛔ PENDING KLARIFIKASI.** Fungsi belum jelas (audit langkah 16). **TIDAK dirancang** — bahas di meeting SCM besok dulu, lalu masukkan sebagai tambahan `doc_type` di `delivery_notes` atau tabel terpisah setelah fungsinya jelas.

---

## FASE 4 — Armada (Sederhana)

**1. Tabel/kolom baru** — **sederhana dulu**, tak perlu sistem booking:
- **Opsi A (rekomendasi MVP):** reuse `delivery_notes` — isi `driver_name`, `vehicle_plate`, tambah `driver_phone text`, `vendor text`, `dispatched_at timestamptz`, `delivered_at timestamptz`. Status DO: `out` (dalam pengiriman) → `delivered`.
- **Opsi B (jika perlu jejak per-assignment):** tabel ringan `delivery_assignments` (`id`, `delivery_note_id`, `driver_name`, `driver_phone`, `vehicle_plate`, `vendor`, `status` `assigned/in_transit/delivered`, `assigned_at`, `dispatched_at`, `delivered_at`, `notes`).
- Master `fleet_vehicles`/`drivers` = **NANTI** (MVP pakai free-text).

**2. Frontend**
- Di `DeliveryNoteDetailPage.jsx`: section "Armada" — input driver/plat/vendor + tombol "Kirim" (status→`out`, set `dispatched_at`) dan "Selesai" (status→`delivered`, set `delivered_at`).
- Badge status pengiriman di list DO + manifest.

**3. MENU_KEY_MAP / RBAC** — tidak wajib menu baru (di dalam DO detail). Role gudang/operations.

**4. Dependency** — **butuh Fase 3** (delivery_notes).

**5. Effort & prioritas** — **KECIL** (opsi A). 🟡 **Bisa nyusul** — cukup status update. Tidak esensial untuk demo end-to-end minggu ini; tambahkan setelah alur picking→surat jalan solid.

---

## FASE 5 — Role & Akses Gudang

**1. Tabel/kolom baru** — tidak ada tabel baru; isi data RBAC existing:
- `roles`: insert row per company (SOA) `code='warehouse'`, `name='Gudang'`, `is_system_role=false`.
- `role_permissions`: grant `logistics.view/edit`, dan (jika permission modul dipecah) `picking.*`, `packing.*`, `delivery.*`. Minimal: view picking assigned + update status packing/picking.
- `user_roles`: assignment user gudang **NANTI** (audit: user dibuat belakangan).

**2. Frontend**
- `AuthContext.jsx` `ERP_ROLE_PRIORITY`: tambah `'warehouse'` (posisi dekat `operations`). Jadi 15 role.
- `userAccessTokens.js` / label & warna role: tambah entri `warehouse`.
- Gating menu picking/packing/surat-jalan: sertakan `warehouse` di role array atau (lebih baik) andalkan `role_permissions` `module:'logistics'`.

**3. MENU_KEY_MAP / RBAC** — inti fase ini. Pastikan `logistics_picking`/`logistics_do` bisa di-grant ke role `warehouse` via `user_menu_permissions`/`role_permissions`.

**4. Dependency** — **butuh Fase 2/3 ada** (percuma role tanpa halaman untuk digate — audit menegaskan ini). Definisi role sendiri kecil dan bisa disiapkan paralel.

**5. Effort & prioritas** — **KECIL** (role+permission) / **SEDANG** (workflow assignment+notif). 🟡 Untuk demo besok **pakai `operations`** sebagai proxy gudang; bikin role `warehouse` resmi **saat/ setelah** halaman picking/packing stabil. Infra notif sudah ada bila mau assignment→notif.

---

## FASE 6 — BTB & Finance Polish

### 6.1 — Faktur pajak di invoice/AR

**Cek hasil audit:** `ar_ttfs` **TIDAK punya** field faktur pajak. Yang ada hanya `sp_items.fp` (boolean) — cuma penanda sudah/belum.

**1. Tabel/kolom baru** — tambah ke `ar_ttfs` (paling ringan; hindari tabel baru untuk MVP):
- `no_faktur_pajak text`, `tanggal_faktur_pajak date`, `dpp numeric(18,2)`, `ppn numeric(18,2)`.
- (Bila butuh multi-faktur per invoice nanti → tabel `tax_invoices` terpisah. **Bukan MVP.**)

**2. Frontend** — `FinancePage`/form AR (`showAddAR`/`editingAR`): tambah 4 field di form + tampil di detail. Badge "Faktur Pajak" tetap.

**3/4/5** — RBAC: ikut gate finance existing. Dependency: tidak ada (independen). Effort **KECIL**. 🟡 Bisa nyusul (audit: MVP cukup flag `fp` + e-Faktur eksternal). Tambahkan bila finance butuh rekap.

### 6.2 — Surat Jalan #2 (finance/tagihan)
⛔ **PENDING KLARIFIKASI** — lihat catatan di Fase 3. Tidak dirancang sampai meeting SCM.

### 6.3 — Tanggal submit invoice ke sistem customer

**Cek hasil audit:** **SUDAH ADA.** `sp_items.submit` (bool) + `sp_items.submit_date` (date) + `email_status` + toggle "SUBMIT" di `FinanceModal`.

**Rancangan:** **tidak perlu kolom baru.** Cukup **verifikasi UI** — pastikan `submit_date` benar-benar bisa diinput manual (bukan cuma toggle boolean) di `FinanceModal`. Jika belum ada date-picker, tambah 1 field. Effort **KECIL/none**. 🟢 Sudah cukup untuk MVP.

---

## Peta Dependency (urutan teknis)

```
0.1 status ──┬─► 2 picking ──► 3 packing+surat jalan ──► 4 armada
             │        ▲
0.2 prod_id ─┴─► 1 stok/reservasi (opsional untuk demo)
0.3 dokumen  (independen)
5 role gudang  (butuh 2/3 ada dulu; pakai operations sementara)
6.1 faktur pajak (independen)  6.3 submit date (sudah ada, verifikasi)
6.2 ⛔ pending klarifikasi
```

Ringkas: **0.1 → 2 → 3** adalah tulang punggung end-to-end. **0.2 → 1** adalah cabang stok (bisa dipisah). 0.3, 6.1, 6.3 independen. 4 & 5 mengekor 3.

---

## Matriks Effort & Prioritas MVP

| Fase | Item | Effort | Wajib MVP besok? |
|------|------|--------|------------------|
| 0.1 | Status SP persist | Kecil | 🔴 **WAJIB** (fix bug menyesatkan) |
| 0.3 | Dokumen SP (fallback link) | Kecil | 🔴 **WAJIB** (ROI tinggi) — upload penuh nyusul |
| 2 | Picking list (slice) | Sedang | 🟢 **WORTH** — progress nyata gudang |
| 3 | Surat Jalan + PDF | Sedang | 🟢 **WORTH** — bukti visual kuat |
| 0.2 | product_id FK | Sedang | 🟡 Nyusul (kecuali Fase 1 ikut demo) |
| 1 | Cek stok + reservasi | Besar | 🟡 Nyusul (proyek besar) |
| 4 | Armada sederhana | Kecil | 🟡 Nyusul |
| 5 | Role gudang | Kecil | 🟡 Nyusul (pakai `operations` dulu) |
| 6.1 | Faktur pajak record | Kecil | 🟡 Nyusul |
| 6.3 | Submit date | ~none | 🟢 Sudah ada — verifikasi |
| 6.2 | Surat Jalan #2 | — | ⛔ Pending klarifikasi |

---

## REKOMENDASI URUTAN EKSEKUSI REALISTIS (untuk semalam)

**Tujuan:** menunjukkan **satu garis end-to-end yang benar-benar hidup** ke tim SCM besok — "SP dikonfirmasi → picking di gudang → surat jalan tercetak" — meski cabang stok & armada belum lengkap.

**Slice vertikal yang dikejar (urut kerja):**

1. **0.1 — Status SP persist** *(Kecil, wajib duluan)*
   Tambah `sp_status` + wire tombol Confirm/Cancel (RPC/update). Menghapus toast palsu + membuka syarat "generate picking dari SP confirmed".

2. **2 — Picking List (slice minimal)** *(Sedang)*
   Tabel `picking_lists`/`picking_list_items` + numbering `PICK` + "Generate Picking dari SP confirmed" + `PickingListPage`/`DetailPage` (assign + status pending→in_progress→done, input qty_picked). Carry `product_name/sku` **text** dulu (tanpa `product_id`) supaya tak terblok 0.2.

3. **3 — Surat Jalan + PDF (inti)** *(Sedang)*
   `delivery_notes`(+items) + numbering `SJ` + `DeliveryNotePDF` (mirror QuotationPDF) + aksi "Buat Surat Jalan" dari picking done + set `sp_items.kirim`/`shipping_date` (update manifest). **Packing disederhanakan** (input koli/berat di detail, tanpa halaman penuh).

4. **0.3 — Dokumen SP (fallback link)** *(Kecil, jika masih ada waktu)*
   Tabel `sp_documents` + field `external_url`; wire tab Dokumen ke "tambah link". Upload Storage nyusul.

**Ditunda (jujur ke tim, jangan dipaksa malam ini):**
- **Fase 1 (cek stok/reservasi)** & **0.2 (product_id)** — cabang besar; demokan "gudang cek stok manual" dulu, integrasi inventory menyusul. *(Kalau tim SCM menuntut stok, siapkan minimal panel read-only `stock_summary` — tapi reservasi tetap ditunda.)*
- **Fase 4 (armada)** — tambahkan field driver/plat di DO sebagai "isi manual", status update nyusul.
- **Fase 5 (role gudang)** — pakai `operations` sebagai proxy; role `warehouse` resmi setelah halaman stabil.
- **6.1 faktur pajak**, **6.2 ⛔ pending**, **6.3 sudah ada**.

**Kenapa slice ini:** ia melewati tepat bagian yang audit sebut "**KOSONG TOTAL**" (picking→packing→surat jalan) — jadi progres-nya paling terasa "baru" bagi SCM, sekaligus menutup bug status palsu (0.1). Cabang stok/armada/role bisa dibangun bertahap tanpa merombak slice ini.

> **Catatan disiplin (aturan wajib repo):** setiap tabel baru → **GRANT setelah CREATE** + RLS + refresh `schema_snapshot.sql` via `pg_dump`. FE fetch `.limit(1000)` + `.is('deleted_at', null)`. Bucket Storage dibuat manual (di luar SQL) + dicatat di PROGRESS. Push **hanya bila diinstruksikan**. Build clean + lint net-zero sebelum anggap selesai.

---

# Import Data Manifest & Warehouse — Rencana Final

> **Mode:** RANCANGAN / DESAIN. **Belum dieksekusi.** Untuk review sebelum eksekusi bertahap (SQL dijalankan manual di SQL Editor, satu tahap, verifikasi, lalu lanjut).
> **Sumber:** (1) Manifest Storbit — 6 sheet SP (720 baris / 435 SP), sheet PRODUCT (38), sheet DC LIST. (2) Warehouse MSI Group — sheet SUMMARY (65 produk, `QTY FC` = stok, kolom `Inventory Class`).
> **Target company:** SOA `d2e5e565-5f67-4954-b8d9-5979a2a0c697`.
> **Keputusan final (disetujui):** 4 akun (Indomarco tunggal + Indogrosir + General Order + CK); SP `Closed` → `shipped_qty=qty` (anti overdue palsu); semua SP `sp_status='confirmed'`; `customer_id` wajib; produk hanya `Inventory Class IN ('Finished Goods','Sub-Assembly')` (= 38, match 100% by nama dgn sheet PRODUCT).
> **Konvensi akun (dari `db.js:upsertCustomer`):** customer Storbit lahir dengan `account_status='customer'`, `owner_company_id=company_id`, `became_customer_at=now()`, `company_id=SOA`. **`account_status='customer'` WAJIB** — `listCustomers()` (sumber dropdown customer di Input SP + CRM) memfilter `account_status='customer'` + `deleted_at IS NULL`.
> **Jalankan sebagai:** SQL Editor (role `postgres`) — bypass RLS (aman untuk insert massal; RLS `products`/`accounts` yang company-scoped tak menghalangi).

## Task 1 — Verifikasi akun Indomarco (id disebut `a18fad3c…`)

Id ini **tidak ada di kode** (hanya teks dummy di HomeDashboard) → **harus diverifikasi di DB live**. Jalankan (read-only) dan **catat hasilnya sebagai acuan konsistensi** untuk 3 akun baru:

```sql
SELECT id, name, code, customer_type, account_status,
       company_id, owner_company_id, is_active, deleted_at,
       became_customer_at, payment_terms_id, tax_id, default_dc
FROM public.accounts
WHERE id::text LIKE 'a18fad3c%' OR name ILIKE '%indomarco%';
```
**Yang harus dipastikan (kalau tidak, remediasi dulu SEBELUM import sp_items):**
- `account_status = 'customer'` → kalau bukan, akun tak muncul di dropdown customer. Remediasi: `UPDATE accounts SET account_status='customer', owner_company_id='d2e5…', became_customer_at=COALESCE(became_customer_at, now()) WHERE id='<indomarco_id>';`
- `company_id = SOA` (`d2e5e565-…`). Kalau beda entitas → putuskan (idealnya SOA).
- `deleted_at IS NULL`.
- **Catat `id` persisnya** → jadi `customer_id` untuk 3 sheet Indomarco (Reguler/Loyang/Trolly).

> Kalau ternyata akun Indomarco **belum ada**, buat dengan pola INSERT yang sama seperti Task 2 (name `'Indomarco'`).

## Task 2 — INSERT 3 akun baru (Indogrosir, General Order, CK)

**Pre-check kolisi `code`** (UNIQUE per company, hanya WHERE code NOT NULL):
```sql
SELECT code FROM public.accounts
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
  AND code IN ('CUST-SOA-INDOGROSIR','CUST-SOA-GENERAL','CUST-SOA-CK');  -- harus 0 baris
```

**INSERT** (mirror `upsertCustomer` stamping; `customer_type='trading'` sesuai label app):
```sql
INSERT INTO public.accounts
  (name, company_id, owner_company_id, account_status, customer_type,
   is_active, became_customer_at, code)
VALUES
  ('Indogrosir',           'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(), 'CUST-SOA-INDOGROSIR'),
  ('General Order',        'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(), 'CUST-SOA-GENERAL'),
  ('CK - Central Kitchen', 'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(), 'CUST-SOA-CK')
RETURNING id, name, code;   -- CATAT 3 id ini untuk mapping sp_items
```
- `pipeline_stage`/`tier`/`payment_terms_id` dibiarkan default/null (irrelevan untuk customer). `code` boleh di-NULL-kan bila tak mau kelola kode (UNIQUE tak berlaku utk NULL). **CK** dibuat sebagai akun terpisah sementara — bila kelak jadi bagian Indomarco cukup `UPDATE sp_items SET customer_id=<indomarco> WHERE customer_id=<ck>` (tanpa re-import).

**Verifikasi pasca:**
```sql
SELECT id, name, code, account_status, company_id FROM public.accounts
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND account_status='customer'
ORDER BY name;   -- harus tampil 4: Indomarco, Indogrosir, General Order, CK
```

## Task 3 — Penyimpanan kategori Reguler/Loyang/Trolly (Indomarco) — 2–3 OPSI, KAMU pilih

Kategori ini **per-SP** (dari nama sheet), hanya untuk Indomarco. **`dc` TIDAK dipakai** (sudah untuk DC asli). Tak ada kolom native → pilih:

**Opsi A — kolom baru `sp_items.sp_category` (text, nullable) — TANPA wire UI dulu**
- SQL: `ALTER TABLE sp_items ADD COLUMN sp_category text;` (metadata-only, cepat) + opsional CHECK `IN ('reguler','loyang','trolly')`.
- Trade-off: **terstruktur & bersih**, gampang di-query/agregasi/laporan per kategori, future-proof (bisa jadi filter nanti). **Tapi belum tampil/terfilter di UI** sampai di-wire (jadi untuk sekarang cuma tersimpan). Effort: migration kecil; UI = 0 (nanti).
- Dampak UI sekarang: nol (tak muncul di manapun). Data aman & rapi menunggu di-wire.

**Opsi B — numpang di `sp_items.notes` (konvensi prefix, mis. `[LOYANG]`)**
- SQL: tak ada migration; saat import isi `notes = '[LOYANG] ' || <notes asli>` dst.
- Trade-off: **tercepat, tanpa DDL**; langsung "terlihat" bila field notes ditampilkan. **Tapi tak terstruktur/terfilter**, rawan tercampur teks lain, query per kategori pakai `LIKE '%[LOYANG]%'` (rapuh), dan mengotori kolom notes. Susah dijadikan filter beneran.
- Dampak UI sekarang: muncul sebagai teks di notes (kalau ditampilkan di detail), bukan filter.

**Opsi C — kolom baru `sp_items.sp_category` + WIRE minimal ke UI** (badge di list/detail + filter dinamis mirip DC)
- SQL: sama Opsi A. Kode: `spFromDb` baca `sp_category`; `groupBySP` bawa ke grup; `SalesOrderPage` +kolom/badge + filter dinamis (`Set(rows.map(r=>r.sp_category))`, pola identik `dcList`).
- Trade-off: **paling lengkap** (kategori jadi filter & badge beneran), tapi **effort paling besar** (migration + edit `db.js`/`App.jsx`/`SalesOrderPage.jsx`, + build/lint). Cocok bila tim SCM butuh memfilter Indomarco per kategori dari hari-1.

> **Rekomendasi (bukan keputusan):** kalau kategori penting untuk operasional segera → **Opsi C**; kalau cukup "tersimpan dulu, tampil nanti" → **Opsi A** (upgrade ke C kapan saja tanpa migrasi ulang); **Opsi B** hanya kalau benar-benar ingin hindari DDL. **Silakan pilih A / B / C.** (Rencana Task 5 di bawah tulis nilai kategori dengan asumsi kolom `sp_category` [A/C]; kalau pilih B tinggal ganti target ke `notes`.)

## Task 4 — Mapping sheet → customer_id → kategori

| Sheet manifest | Akun (`customer_id`) | `sp_category` (Indomarco only) |
|----------------|----------------------|-------------------------------|
| SP INDOMARCO | **Indomarco** (`a18fad3c…`, hasil Task 1) | `reguler` |
| SP INDOMARCO-LOYANG | **Indomarco** (sama) | `loyang` |
| SP INDOMARCO-TROLLY | **Indomarco** (sama) | `trolly` |
| SP INDOGROSIR | **Indogrosir** (id baru Task 2) | `NULL` |
| SP GENERAL ORDER | **General Order** (id baru) | `NULL` |
| SP CK | **CK - Central Kitchen** (id baru) | `NULL` |

## Task 5 — Rencana import lengkap (urutan FK) + verifikasi

> **Pendekatan:** muat tiap sheet ke **tabel staging** (via CSV import SQL Editor), lalu `INSERT … SELECT` dengan mapping/filter. Ini memungkinkan verifikasi & rollback bersih. Staging di-`DROP` di akhir. **Penting:** `sp_items` **tidak** butuh `product_id` (Fase 0.2 ditunda) — cukup `product_name`/`sku` teks. Hanya **`stock_ledger`** yang butuh match ke `products.id`.

### TAHAP 0 — Verifikasi PRA-import (read-only)
```sql
-- 0a. Data existing + baris test (jangan sampai kesenggol)
SELECT count(*) total_rows, count(DISTINCT sp_no) total_sp FROM public.sp_items;
SELECT sp_no, count(*) FROM public.sp_items WHERE sp_no='SP-894688' GROUP BY sp_no;   -- baris testing
SELECT count(*) FROM public.picking_lists WHERE sp_no='SP-894688';                     -- picking dummy
-- 0b. Kolom Slice 0.1 ada (bukti snapshot stale)
SELECT column_name FROM information_schema.columns
WHERE table_name='sp_items' AND column_name IN ('sp_status','confirmed_at','cancel_reason');
-- 0c. Gudang SOA (butuh ≥1 utk stock_ledger.warehouse_id)
SELECT id, code, name FROM public.warehouses
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND is_active;
-- 0d. Produk existing SOA (hindari dup code)
SELECT count(*) FROM public.products
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND deleted_at IS NULL;
```
> **Bersihkan baris test** sebelum lanjut (opsional tapi disarankan): `DELETE FROM public.picking_lists WHERE sp_no='SP-894688'; DELETE FROM public.sp_items WHERE sp_no='SP-894688';` (picking_list_items ikut CASCADE). Data import ber-`sp_no` beda → **tak akan campur** dengan SP-894688 walau tak dihapus (sp_no non-unik), tapi menghapus bikin list bersih.

### TAHAP 1 — Accounts (Task 1 + Task 2)
Verifikasi Indomarco → remediasi bila perlu → INSERT 3 akun → catat 4 `customer_id`. **(SQL di Task 1 & 2.)** Verifikasi: 4 akun `account_status='customer'` company SOA.

### TAHAP 2 — Products (38, filter Inventory Class)
```sql
-- 2a. Staging (muat sheet SUMMARY warehouse ke sini via CSV import)
CREATE TABLE stg_products (
  name text, code text, inventory_class text, main_group text,
  uom text, qty_fc numeric, unit_cost numeric
);
-- (import CSV SUMMARY → stg_products)

-- 2b. INSERT hanya Finished Goods / Sub-Assembly (= 38, match nama sheet PRODUCT)
INSERT INTO public.products
  (company_id, code, name, is_service, is_active,
   inventory_class, main_group, uom, unit_cost)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
       COALESCE(NULLIF(TRIM(s.code),''), 'PRD-'||lpad((row_number() OVER (ORDER BY s.name))::text,3,'0')),
       TRIM(s.name), false, true,
       s.inventory_class, s.main_group, s.uom, s.unit_cost
FROM stg_products s
WHERE s.inventory_class IN ('Finished Goods','Sub-Assembly');
```
- **Match by nama exact** dgn sheet PRODUCT manifest sudah divalidasi (38). `code` dari SUMMARY bila ada; kalau kosong → generate `PRD-###` (UNIQUE per company).
- **Verifikasi:** `SELECT count(*) FROM products WHERE company_id='d2e5…' AND deleted_at IS NULL;` → naik **+38**. Cek tak ada nama duplikat: `SELECT name, count(*) FROM products WHERE company_id='d2e5…' GROUP BY name HAVING count(*)>1;` → 0.

### TAHAP 3 — Warehouses (pastikan ada gudang SOA)
Kalau TAHAP 0c kosong, buat satu:
```sql
INSERT INTO public.warehouses (company_id, code, name, is_active)
VALUES ('d2e5e565-5f67-4954-b8d9-5979a2a0c697','WH-SOA-01','Gudang Utama Storbit', true)
ON CONFLICT (company_id, code) DO NOTHING
RETURNING id, code, name;   -- catat warehouse_id
```
Verifikasi: minimal 1 warehouse SOA aktif.

### TAHAP 4 — stock_ledger (inbound awal dari QTY FC)
```sql
INSERT INTO public.stock_ledger
  (company_id, warehouse_id, product_id, movement_type, qty,
   reference_type, reference_no, notes)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
       '<warehouse_id SOA>',           -- dari TAHAP 3
       p.id, 'inbound', s.qty_fc::int,
       'import', 'INIT-STOCK-2026', 'Saldo awal dari SUMMARY warehouse'
FROM stg_products s
JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND TRIM(p.name)=TRIM(s.name)
WHERE s.inventory_class IN ('Finished Goods','Sub-Assembly')
  AND s.qty_fc IS NOT NULL AND s.qty_fc::int <> 0;
```
- **Filter Inventory Class sama** seperti products → hanya 38 produk dapat saldo. Match `product_id` **by nama exact**.
- **Verifikasi (via view `stock_summary`):**
```sql
SELECT p.name, ss.on_hand
FROM public.stock_summary ss JOIN public.products p ON p.id=ss.product_id
WHERE ss.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
ORDER BY p.name;   -- on_hand harus = QTY FC per produk
SELECT count(*) FROM public.stock_ledger
WHERE reference_no='INIT-STOCK-2026';   -- jumlah baris inbound (≤38)
```

### TAHAP 5 — sp_items (720 baris, 435 SP)
```sql
-- 5a. Staging (gabungan 6 sheet SP; +kolom sheet_name utk mapping)
CREATE TABLE stg_sp (
  sheet_name text,           -- 'INDOMARCO' | 'INDOMARCO-LOYANG' | ... 
  sp_no text, sp_date date,
  product_name text, sku text,
  qty int, shipped_qty int,  -- shipped dari manifest (bila ada)
  manifest_status text,      -- 'Open'/'Partial'/'Closed' dari manifest
  dc text, unit_price numeric, shipping_price numeric,
  exp_date date, expired_date date, shipping_date date,
  inv bool, fp bool, submit bool, kirim bool, submit_date date, notes text
);
-- (import CSV 6 sheet → stg_sp, isi sheet_name per sheet)

-- 5b. INSERT dengan mapping customer + aturan shipped_qty + sp_status
INSERT INTO public.sp_items
  (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty,
   dc, unit_price, shipping_price, exp_date, expired_date, shipping_date,
   inv, fp, submit, kirim, submit_date, notes,
   sp_status, sp_category)               -- sp_category HANYA bila pilih Opsi A/C (else buang kolom ini)
SELECT
  s.sp_no, s.sp_date,
  CASE
    WHEN s.sheet_name LIKE 'INDOMARCO%' THEN '<indomarco_id>'
    WHEN s.sheet_name = 'INDOGROSIR'    THEN '<indogrosir_id>'
    WHEN s.sheet_name = 'GENERAL ORDER' THEN '<general_order_id>'
    WHEN s.sheet_name = 'CK'            THEN '<ck_id>'
  END,
  TRIM(s.product_name), COALESCE(s.sku,''), s.qty,
  CASE WHEN s.manifest_status='Closed' THEN s.qty          -- ANTI OVERDUE PALSU (poin 2)
       ELSE COALESCE(s.shipped_qty,0) END,
  COALESCE(s.dc,''), COALESCE(s.unit_price,0), COALESCE(s.shipping_price,0),
  s.exp_date, s.expired_date, s.shipping_date,
  COALESCE(s.inv,false), COALESCE(s.fp,false), COALESCE(s.submit,false),
  COALESCE(s.kirim,false), s.submit_date, COALESCE(s.notes,''),
  'confirmed',                                              -- semua confirmed (poin 3)
  CASE s.sheet_name WHEN 'INDOMARCO' THEN 'reguler'
                    WHEN 'INDOMARCO-LOYANG' THEN 'loyang'
                    WHEN 'INDOMARCO-TROLLY' THEN 'trolly'
                    ELSE NULL END
FROM stg_sp s;
```
- **`customer_id` wajib** (poin 4): CASE menutup semua sheet; **guard** sebelum insert: `SELECT count(*) FROM stg_sp WHERE sheet_name NOT IN ('INDOMARCO','INDOMARCO-LOYANG','INDOMARCO-TROLLY','INDOGROSIR','GENERAL ORDER','CK');` → **harus 0** (kalau tidak, ada sheet_name tak terpetakan → customer_id NULL).
- **`shipped_qty`**: `Closed → qty` (anti overdue). Non-closed → shipped dari manifest (atau 0). 
- **`dc`** dari kolom DC asli (BUKAN channel). **`sp_no`** apa adanya (aman, non-unik).
- **`sp_status='confirmed'`** semua → tombol Generate Picking langsung tersedia utk SP yang masih outstanding; SP Closed (shipped=qty) tampil CLOSED & Generate ter-guard RPC (no-op).
- **Konsistensi per-SP:** semua baris ber-`sp_no` sama sudah otomatis dapat `customer_id`/`sp_status`/`sp_category` sama (berbasis sheet). Bila satu `sp_no` muncul di >1 sheet (harusnya tidak) → cek dulu.

**Verifikasi pasca TAHAP 5:**
```sql
-- jumlah & sebaran
SELECT count(*) rows, count(DISTINCT sp_no) sp FROM public.sp_items WHERE sp_status='confirmed';  -- ~720 / ~435
SELECT a.name, count(*) rows, count(DISTINCT si.sp_no) sp
FROM public.sp_items si JOIN public.accounts a ON a.id=si.customer_id
GROUP BY a.name ORDER BY a.name;                       -- sebaran per akun
-- WAJIB 0: baris tanpa customer
SELECT count(*) FROM public.sp_items WHERE customer_id IS NULL AND sp_status='confirmed';
-- anti overdue: SP 'Closed' harus outstanding 0
SELECT count(*) FROM public.sp_items
WHERE sp_status='confirmed' AND (qty - shipped_qty) < 0;   -- 0 (shipped>qty tak boleh)
-- kategori Indomarco
SELECT sp_category, count(*) FROM public.sp_items WHERE customer_id='<indomarco_id>' GROUP BY sp_category;
-- SP-894688 tetap utuh / terisolasi
SELECT count(*) FROM public.sp_items WHERE sp_no='SP-894688';
```

### TAHAP 6 — sp_btbs (opsional, bila manifest punya nomor BTB)
```sql
INSERT INTO public.sp_btbs (sp_no, btb_no, remarks)
SELECT DISTINCT sp_no, btb_no, '' FROM stg_sp_btb WHERE btb_no IS NOT NULL AND TRIM(btb_no)<>'';
```
Verifikasi: `SELECT count(*) FROM sp_btbs;`.

### TAHAP 7 — Cleanup & finalisasi
```sql
DROP TABLE IF EXISTS stg_products, stg_sp, stg_sp_btb;
```
- **Refresh `schema_snapshot.sql`** via `pg_dump` (wajib — apalagi bila pilih Opsi A/C yang menambah kolom `sp_category`).
- Smoke test UI: login → SP list (sebaran 4 customer di filter, tak ada overdue palsu, badge CONFIRMED), buka 1 SP outstanding → tombol **Generate Picking List** muncul → generate → picking jalan; cek stok di Inventory (on_hand = QTY FC).

## Ringkas GAP / keputusan yang menunggu kamu
1. **Task 3 — pilih Opsi A / B / C** untuk kategori Loyang/Trolly (SQL Task 5 sudah siap untuk A/C via kolom `sp_category`; untuk B ganti target ke `notes`).
2. **Task 1 — jalankan query verifikasi Indomarco** & kabari hasilnya (id persis + `account_status`/`company_id`) → aku sesuaikan `<indomarco_id>` di mapping.
3. Konfirmasi **sumber `shipped_qty`** non-closed di manifest (ada kolom shipped, atau anggap 0?) dan **apakah manifest punya kolom BTB** (untuk TAHAP 6).
4. Konfirmasi **kolom kode produk** di sheet SUMMARY/PRODUCT (pakai kode asli atau generate `PRD-###`?).

> Setelah 4 poin di atas dijawab + Opsi kategori dipilih, aku finalisasi SQL per-TAHAP yang tinggal jalan. Eksekusi tetap **bertahap** (TAHAP 0→7), verifikasi tiap tahap sebelum lanjut.

---

# Import Data Manifest & Warehouse — Rencana Final (revisi 2)

> **Mode:** RANCANGAN. **Belum dieksekusi.** Revisi 2 = hasil **inspeksi langsung file CSV** di `~/Downloads` (6 sheet SP + SUMMARY warehouse). Beberapa **asumsi awal ternyata tidak akur** dengan data nyata — ditandai ⚠️ di bawah dan **butuh keputusanmu** sebelum SQL benar-benar final.
> **File sumber terverifikasi:** `STORBIT SHIPPING MANIFEST - SP {INDOMARCO (1)|INDOMARCO-LOYANG|INDOMARCO-TROLLY|INDOGROSIR|GENERAL ORDER|CK (CENTRAL KITCHEN)}.csv`, `MSI GROUP WAREHOUSE - SUMMARY.csv`. (Header SP mulai baris ke-4; ada 3 baris preamble.)

## TASK 1 (jawaban) — SP dengan >1 BTB berbeda

**Hanya 2 SP** (keduanya di sheet INDOMARCO) yang punya **lebih dari 1 BTB NO berbeda**:

| SP NO | BTB NO (distinct) |
|-------|-------------------|
| `2112398` | `1994555`, `2062562` |
| `2055555` | `2002172`, `2047986` |

Semua sheet lain: **maksimal 1 BTB distinct per SP.** Catatan: di manifest, BTB ditulis **per baris item** (berulang untuk tiap line item dalam SP yang sama) — mis. INDOMARCO 222 baris terisi BTB tapi hanya **97 BTB distinct**. → mapping `sp_btbs` harus pakai **`SELECT DISTINCT (sp_no, btb_no)`** (bukan per baris) supaya BTB tak dobel; 2 SP di atas otomatis jadi 2 baris masing-masing (didukung desain `sp_btbs` 1:many). **Presisi terjaga.**

## ⚠️ TEMUAN DATA yang MEMATAHKAN ASUMSI — butuh keputusan

Ditemukan saat inspeksi CSV (bukan tebakan). **Baca sebelum approve SQL:**

**F1 — Sheet TROLLY beda struktur kolom.** TROLLY **TIDAK punya kolom `SHIPPED QTY` maupun `OUTSTANDING`** (kolomnya: …QTY, EXP Date, Deadline, STATUS,… + `KIRIM DATE`, tanpa `SUBMIT DATE`/`Email Status`). Jadi asumsi keputusan #3 ("kolom SHIPPED QTY selalu terisi") **salah untuk TROLLY**. Status TROLLY: Delivered 10, Shipped 19, Closed 1 — **semuanya "sudah dikirim"**. → **Usulan:** `shipped_qty = qty` untuk **semua** 30 baris TROLLY (mencerminkan realita + hindari overdue). `submit_date`/`email_status` → NULL. **⟵ perlu konfirmasi.**

**F2 — Produk warehouse FG+Sub-Assembly = 36, BUKAN 38.** Filter `Inventory Class IN ('Finished Goods','Sub-Assembly')` di SUMMARY → **Finished Goods 31 + Sub-Assembly 5 = 36** produk. (Kelas lain: Raw Material 5, Inventory 15, Asset 7 — dikecualikan, benar.)

**F3 — 2 produk di SP TIDAK ADA di warehouse.** SP mereferensikan **38 nama produk distinct**; 36 match ke warehouse, **2 tidak ada di SUMMARY/MASTER PRODUCT sama sekali** (dicari, tak ketemu di kelas mana pun):
- `STANDARD TRAY RICE COOKER HEAVY DUTY`
- `TRAY BERLUBANG TR-6420P`
→ 2 produk ini **tak punya SKU baru** dan **tak punya stok** di warehouse. Konsekuensi ke keputusan #7 (translate semua SKU ke SKU baru): **untuk 2 produk ini tak ada SKU baru untuk dituju.** **⟵ perlu keputusan (F3-opsi di bawah).**

**F4 — Jumlah baris/SP sedikit beda dari brief.** Dari CSV terbaru (Jun 30): **717 baris / 433 SP distinct** (bukan 720/435). Tak ada `sp_no` yang muncul di >1 sheet (aman untuk mapping per sheet). Delta 3 baris/2 SP kemungkinan baris kosong/subtotal atau versi file. **Bukan blocker** — verifikasi pasca-import pakai angka nyata; boleh direkonsiliasi bila mau persis.

**F5 — Variasi kolom finance antar sheet.** `OUTSTANDING` (Indomarco) vs `OUTSTANDING QTY` (lain) — **tak dipakai** (outstanding = turunan, tak diimpor). Urutan `INV/KIRIM` beda di GENERAL/CK — tak masalah karena staging **per sheet** (map by nama kolom). → pakai **staging per-sheet** (bukan 1 tabel gabungan) agar beda kolom ditangani natural.

### Keputusan yang menunggu (3)
- **[F1]** TROLLY `shipped_qty = qty` semua? (usulan: ya.)
- **[F3]** 2 produk tray tanpa warehouse → pilih:
  - **F3-a (usulan):** tetap buat 2 baris `products` (agar katalog lengkap), tapi `code`=**SKU lama manifest** (tak ada SKU baru), **tanpa stok** (tak ada `stock_ledger`). `sp_items.sku` utk baris tray = SKU lama (pengecualian sah keputusan #7 — SKU baru tak ada).
  - **F3-b:** jangan buat produk; `sp_items.sku` utk 2 tray = **kosong** (nama produk tetap tampil).
  - **F3-c:** buat produk tanpa SKU sama sekali (`code` generate `PRD-TRAY-01/02`), sku sp_items kosong.
- **[F4]** terima 717/433, atau mau rekonsiliasi dulu ke 720/435?

> SQL di bawah **sudah final untuk semua yang tidak diperdebatkan**; titik F1/F3 ditandai `-- FLAG` agar tinggal disesuaikan setelah kamu putuskan. Keputusan #1/#2/#4/#5/#6/#7/#8 yang lain **sudah dibakukan** di SQL.

## Mapping final: sheet → customer_id → kategori → shipped_qty

| Sheet (rows/SP) | `customer_id` | `sp_category` | Aturan `shipped_qty` |
|---|---|---|---|
| INDOMARCO (532/250) | Indomarco `a18fad3c-75ee-4fc6-b3d2-5c5dfa810661` | `reguler` | Closed→qty; else as-is |
| INDOMARCO-LOYANG (141/141) | Indomarco (sama) | `loyang` | Closed→qty; else as-is |
| INDOMARCO-TROLLY (30/30) | Indomarco (sama) | `trolly` | **= qty semua** (F1; tak ada kolom shipped) |
| INDOGROSIR (8/8) | Indogrosir (baru) | NULL | Closed→qty; else as-is |
| GENERAL ORDER (3/1) | General Order (baru) | NULL | Closed→qty; else as-is (status blank→as-is) |
| CK (3/3) | CK (baru) | NULL | Closed→qty; else as-is |

Status per sheet (untuk aturan): INDOMARCO {Closed 391, Pending 103, Shipped 5, Delivered 9, Picking 6, blank 18}; LOYANG {Closed 84, Delivered 32, Shipped 25}; TROLLY {Delivered 10, Shipped 19, Closed 1}; INDOGROSIR {Delivered 3, Closed 5}; GENERAL {blank 3}; CK {blank 3}.

---

## SQL FINAL per-TAHAP (belum dieksekusi)

### TAHAP 0 — Verifikasi PRA-import
```sql
SELECT count(*) rows, count(DISTINCT sp_no) sp FROM public.sp_items;             -- baseline existing
SELECT sp_no, count(*) FROM public.sp_items WHERE sp_no='SP-894688' GROUP BY sp_no; -- baris test kemarin
SELECT count(*) FROM public.picking_lists WHERE sp_no='SP-894688';
-- Manifest tak memakai format 'SP-xxxxxx' (nomor numerik: 2112398, dst) → 0 tabrakan dgn SP-894688.
SELECT column_name FROM information_schema.columns
 WHERE table_name='sp_items' AND column_name IN ('sp_status','sp_category');       -- sp_category BELUM ada (dibuat TAHAP 5a)
SELECT id, code, name FROM public.warehouses
 WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND is_active;            -- gudang SOA
```
> Disarankan hapus baris test dulu: `DELETE FROM public.picking_lists WHERE sp_no='SP-894688'; DELETE FROM public.sp_items WHERE sp_no='SP-894688';`

### TAHAP 1 — Accounts
```sql
-- 1a. Indomarco: set customer_type='trading' (keputusan #1)
UPDATE public.accounts SET customer_type='trading'
WHERE id='a18fad3c-75ee-4fc6-b3d2-5c5dfa810661';

-- 1b. Pre-check kolisi code (harus 0)
SELECT code FROM public.accounts
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
  AND code IN ('CUST-SOA-INDOGROSIR','CUST-SOA-GENERAL','CUST-SOA-CK');

-- 1c. 3 akun baru (mirror db.js:upsertCustomer)
INSERT INTO public.accounts
  (name, company_id, owner_company_id, account_status, customer_type, is_active, became_customer_at, code)
VALUES
  ('Indogrosir',           'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(),'CUST-SOA-INDOGROSIR'),
  ('General Order',        'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(),'CUST-SOA-GENERAL'),
  ('CK - Central Kitchen', 'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(),'CUST-SOA-CK')
RETURNING id, name;   -- CATAT 3 id
```
**Verif 1:** `SELECT id,name,customer_type,account_status FROM accounts WHERE company_id='d2e5…' AND account_status='customer' ORDER BY name;` → 4 akun, semua `trading`.

### TAHAP 2 — Products (36; kolom `sp_category` di TAHAP 5)
```sql
-- 2a. staging SUMMARY (import CSV 'MSI GROUP WAREHOUSE - SUMMARY.csv')
CREATE TABLE stg_wh (
  no int, item_description text, inventory_class text, grp text, sku_id text,
  operational_function text, qty_cc numeric, qty_fc numeric, variance numeric,
  uom text, status text, remarks text, last_count_sync text
);
-- (import CSV → stg_wh; header baris pertama)

-- 2b. INSERT 36 produk (SKU baru dari warehouse, is_service=false)
INSERT INTO public.products
  (company_id, code, name, is_service, is_active, inventory_class, main_group, uom)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
       TRIM(s.sku_id), TRIM(s.item_description), false, true,
       s.inventory_class, s.grp, s.uom
FROM stg_wh s
WHERE s.inventory_class IN ('Finished Goods','Sub-Assembly')
  AND TRIM(COALESCE(s.item_description,'')) <> '';
-- FLAG F3: bila pilih F3-a, tambah 2 produk tray manual (code=SKU lama, tanpa stok).
```
**Verif 2:** `SELECT count(*) FROM products WHERE company_id='d2e5…' AND deleted_at IS NULL;` → +36 (atau +38 bila F3-a). Dup nama: `SELECT name,count(*) FROM products WHERE company_id='d2e5…' GROUP BY name HAVING count(*)>1;` → 0.

### TAHAP 3 — Warehouse SOA (bila TAHAP 0 kosong)
```sql
INSERT INTO public.warehouses (company_id, code, name, is_active)
VALUES ('d2e5e565-5f67-4954-b8d9-5979a2a0c697','WH-SOA-01','Gudang Utama Storbit', true)
ON CONFLICT (company_id, code) DO NOTHING RETURNING id, code;   -- catat warehouse_id
```

### TAHAP 4 — stock_ledger (inbound = QTY FC, 36 produk)
```sql
INSERT INTO public.stock_ledger
  (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_no, notes)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', '<warehouse_id SOA>',
       p.id, 'inbound', s.qty_fc::int, 'import', 'INIT-STOCK-2026', 'Saldo awal SUMMARY warehouse'
FROM stg_wh s
JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.item_description))
WHERE s.inventory_class IN ('Finished Goods','Sub-Assembly')
  AND s.qty_fc IS NOT NULL AND s.qty_fc::int <> 0;
```
**Verif 4:** `SELECT p.name, ss.on_hand FROM stock_summary ss JOIN products p ON p.id=ss.product_id WHERE ss.company_id='d2e5…' ORDER BY p.name;` → `on_hand` = QTY FC. `SELECT count(*) FROM stock_ledger WHERE reference_no='INIT-STOCK-2026';` ≈ 36.

### TAHAP 5 — sp_items (staging per sheet → INSERT + SKU baru via nama)
```sql
-- 5a. Kolom kategori (Opsi A, keputusan #2)
ALTER TABLE public.sp_items ADD COLUMN IF NOT EXISTS sp_category text;

-- 5b. Staging per sheet. "FULL" (INDOMARCO/LOYANG/INDOGROSIR/GENERAL/CK):
CREATE TABLE stg_sp_full (
  sheet text, sp_date date, sp_no text, product_name text, sku_old text,
  qty int, shipped_qty int, exp_date date, deadline date, status text, dc text,
  shipping_date date, arrival_date date, btb_no text, btb_remarks text,
  unit_price numeric, shipping_price numeric, inv text, fp text, submit text,
  kirim text, submit_date date, email_status text
);
-- TROLLY (tanpa shipped_qty/submit_date/email_status; ada kirim_date):
CREATE TABLE stg_sp_trolly (
  sheet text, sp_date date, sp_no text, product_name text, sku_old text,
  qty int, exp_date date, deadline date, status text, dc text,
  shipping_date date, arrival_date date, btb_no text, btb_remarks text,
  unit_price numeric, shipping_price numeric, inv text, fp text, submit text,
  kirim text, kirim_date date
);
-- (import tiap CSV ke staging masing-masing, sesuaikan mapping kolom;
--  set kolom `sheet` = literal saat/juga bisa via UPDATE per staging.)
-- Untuk 5 sheet FULL, muat ke stg_sp_full lalu tandai sheet-nya, mis:
--   (impor INDOMARCO) UPDATE stg_sp_full SET sheet='INDOMARCO' WHERE sheet IS NULL;  dst per impor.

-- 5c. INSERT sheet FULL → sp_items (SKU baru via join nama; kategori & customer per sheet)
INSERT INTO public.sp_items
  (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
   unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
   inv, fp, submit, kirim, submit_date, email_status, notes, sp_status, sp_category)
SELECT
  s.sp_no, s.sp_date,
  CASE s.sheet
    WHEN 'INDOMARCO'  THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
    WHEN 'LOYANG'     THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
    WHEN 'INDOGROSIR' THEN '<indogrosir_id>'
    WHEN 'GENERAL'    THEN '<general_id>'
    WHEN 'CK'         THEN '<ck_id>'
  END,
  TRIM(s.product_name),
  COALESCE(p.code, s.sku_old, ''),                          -- SKU BARU via nama; fallback SKU lama bila tak match (F3)
  s.qty,
  CASE WHEN s.status='Closed' THEN s.qty ELSE COALESCE(s.shipped_qty,0) END,   -- anti overdue (#3)
  COALESCE(s.dc,''), COALESCE(s.unit_price,0), COALESCE(s.shipping_price,0),
  s.exp_date, s.deadline, s.shipping_date, s.arrival_date,
  (upper(COALESCE(s.inv,''))    IN ('TRUE','YES','Y','1','V','✓')),
  (upper(COALESCE(s.fp,''))     IN ('TRUE','YES','Y','1','V','✓')),
  (upper(COALESCE(s.submit,'')) IN ('TRUE','YES','Y','1','V','✓')),
  (upper(COALESCE(s.kirim,''))  IN ('TRUE','YES','Y','1','V','✓')),
  s.submit_date, s.email_status, '', 'confirmed',
  CASE s.sheet WHEN 'INDOMARCO' THEN 'reguler' WHEN 'LOYANG' THEN 'loyang' ELSE NULL END
FROM stg_sp_full s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.product_name));

-- 5d. INSERT TROLLY → sp_items (shipped_qty = qty; F1)
INSERT INTO public.sp_items
  (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
   unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
   inv, fp, submit, kirim, notes, sp_status, sp_category)
SELECT
  s.sp_no, s.sp_date, 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  TRIM(s.product_name), COALESCE(p.code, s.sku_old, ''),
  s.qty, s.qty,                                              -- FLAG F1: shipped = qty
  COALESCE(s.dc,''), COALESCE(s.unit_price,0), COALESCE(s.shipping_price,0),
  s.exp_date, s.deadline, s.shipping_date, s.arrival_date,
  (upper(COALESCE(s.inv,''))    IN ('TRUE','YES','Y','1','V','✓')),
  (upper(COALESCE(s.fp,''))     IN ('TRUE','YES','Y','1','V','✓')),
  (upper(COALESCE(s.submit,'')) IN ('TRUE','YES','Y','1','V','✓')),
  (upper(COALESCE(s.kirim,''))  IN ('TRUE','YES','Y','1','V','✓')),
  '', 'confirmed', 'trolly'
FROM stg_sp_trolly s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.product_name));
```
> **Catatan boolean:** kolom INV/FP/SUBMIT/KIRIM di CSV berupa teks (cek isian nyata saat load — sesuaikan daftar nilai TRUE bila pakai 'x'/'ada'/dll). **`sku_old` HANYA fallback** untuk 2 produk tray tak match (F3); untuk 36 produk lain selalu terpakai `p.code` (SKU baru). Pastikan **0 baris FULL berakhir pakai SKU lama selain 2 tray**.

**Verif 5 (WAJIB semua lolos):**
```sql
SELECT count(*) rows, count(DISTINCT sp_no) sp FROM sp_items WHERE sp_status='confirmed';  -- ~717 / ~433
SELECT a.name, count(*) rows, count(DISTINCT si.sp_no) sp
 FROM sp_items si JOIN accounts a ON a.id=si.customer_id GROUP BY a.name ORDER BY a.name;   -- sebaran 4 akun
SELECT count(*) FROM sp_items WHERE customer_id IS NULL AND sp_status='confirmed';           -- WAJIB 0
-- 0 baris pakai SKU LAMA yang lolos (selain 2 tray yg memang tak ada SKU baru):
SELECT si.product_name, si.sku, count(*) FROM sp_items si
 LEFT JOIN products p ON p.company_id='d2e5…' AND lower(TRIM(p.name))=lower(TRIM(si.product_name))
 WHERE p.id IS NULL GROUP BY si.product_name, si.sku;   -- harusnya hanya 2 nama tray
-- SKU sistem = SKU baru utk yg match:
SELECT count(*) FROM sp_items si JOIN products p
 ON p.company_id='d2e5…' AND lower(TRIM(p.name))=lower(TRIM(si.product_name))
 WHERE si.sku <> p.code;                                 -- WAJIB 0 (semua pakai SKU baru)
-- anti overdue: tak boleh shipped>qty
SELECT count(*) FROM sp_items WHERE (qty - shipped_qty) < 0;   -- 0
-- kategori Indomarco
SELECT sp_category, count(*) FROM sp_items WHERE customer_id='a18fad3c-75ee-4fc6-b3d2-5c5dfa810661' GROUP BY sp_category;
-- SP-894688 tetap terisolasi
SELECT count(*) FROM sp_items WHERE sp_no='SP-894688';
```

### TAHAP 6 — sp_btbs (DISTINCT; multi-BTB otomatis)
```sql
INSERT INTO public.sp_btbs (sp_no, btb_no, remarks)
SELECT DISTINCT sp_no, TRIM(btb_no), ''
FROM (
  SELECT sp_no, btb_no FROM stg_sp_full   WHERE btb_no IS NOT NULL AND TRIM(btb_no)<>''
  UNION
  SELECT sp_no, btb_no FROM stg_sp_trolly WHERE btb_no IS NOT NULL AND TRIM(btb_no)<>''
) x;
```
**Verif 6:** `SELECT count(*) FROM sp_btbs;` (≈ 97+70+9+7 distinct ≈ 183+); `SELECT sp_no, count(*) FROM sp_btbs GROUP BY sp_no HAVING count(*)>1;` → **hanya `2112398` & `2055555`** (2 baris masing-masing).

### TAHAP 7 — Cleanup & finalisasi
```sql
DROP TABLE IF EXISTS stg_wh, stg_sp_full, stg_sp_trolly;
```
- **Refresh `schema_snapshot.sql` via `pg_dump`** (wajib — snapshot stale + kolom baru `sp_category`).
- Smoke test UI: filter customer (4 akun), tak ada overdue palsu, badge CONFIRMED, buka SP outstanding → tombol Generate Picking muncul; Inventory `on_hand`=QTY FC.

## Ringkas — yang menunggu keputusan sebelum eksekusi
1. **[F1]** TROLLY `shipped_qty=qty` semua? (usulan ya)
2. **[F3]** 2 produk tray tanpa warehouse → F3-a / F3-b / F3-c?
3. **[F4]** terima **717/433** atau rekonsiliasi ke 720/435 dulu?
4. **Konfirmasi nilai boolean** kolom INV/FP/SUBMIT/KIRIM di CSV (cek isian nyata saat staging → sesuaikan daftar TRUE).

> Begitu 4 poin dijawab, aku bekukan `<indogrosir_id>`/`<general_id>`/`<ck_id>` (hasil TAHAP 1c) + FLAG F1/F3 → SQL 100% siap jalan bertahap (TAHAP 0→7, verifikasi tiap tahap).

---

# Import Data Manifest & Warehouse — Rencana Final (revisi 3, data terverifikasi ulang)

> **⛔ Revisi 3 MENGGANTIKAN revisi 2.** Revisi 2 membaca **CSV lama/salah** dari `~/Downloads` — **abaikan sepenuhnya**. Revisi 3 dibaca ulang dari **2 XLSX terbaru** (via openpyxl):
> `STORBIT SHIPPING MANIFEST (2).xlsx` (sheet: SP INDOGROSIR, SP INDOMARCO, SP INDOMARCO-LOYANG, SP INDOMARCO-TROLLY, SP GENERAL ORDER, SP CK (CENTRAL KITCHEN), PRODUCT, DC LIST) + `MSI GROUP WAREHOUSE (1).xlsx` (sheet SUMMARY).
> **Hasil:** **720 baris / 435 SP** ✅ cocok brief. **38 produk** filter FG+Sub-Assembly ✅. **38 nama produk SP match 100% ke warehouse (0 unmatched)** ✅.

## Verifikasi struktur per sheet (dari XLSX benar)

| Sheet | Baris | SP unik | SHIPPED QTY? | OUTSTANDING? | STATUS (sebaran) |
|-------|-------|---------|--------------|--------------|------------------|
| SP INDOGROSIR | 8 | 8 | ✅ | ✅ | Delivered 3, Closed 5 |
| SP INDOMARCO | 535 | 252 | ✅ | ✅ | Closed 393, Pending 103, Picking 18, Shipped 5, Delivered 7, blank 9 |
| SP INDOMARCO-LOYANG | 141 | 141 | ✅ | ✅ | Closed 90, Delivered 26, Shipped 25 |
| SP INDOMARCO-TROLLY | 30 | 30 | **❌ TIDAK ADA** | **❌ TIDAK ADA** | Delivered 11, Shipped 18, Closed 1 |
| SP GENERAL ORDER | 3 | 1 | ✅ | ✅ | blank 3 |
| SP CK (CENTRAL KITCHEN) | 3 | 3 | ✅ | ✅ | blank 3 |
| **TOTAL** | **720** | **435** | | | |

Cross-sheet `sp_no` overlap: **NONE** (mapping per sheet aman).

## Status temuan F1–F5 (versi revisi 2 → sekarang)

| Kode | Revisi 2 (file salah) | **Revisi 3 (file benar)** |
|------|------------------------|----------------------------|
| **F1** TROLLY tanpa `SHIPPED QTY`/`OUTSTANDING` | ditemukan | **TETAP BENAR** — TROLLY memang tak punya kedua kolom (punya `KIRIM DATE`, tanpa `SUBMIT DATE`/`Email Status`). → `shipped_qty=qty` semua TROLLY (**sesuai keputusan #3**, bukan lagi flag terbuka). |
| **F2** produk filter = 36 | 36 | **BERUBAH → 38** (Finished Goods 33 + Sub-Assembly 5). Cocok brief. |
| **F3** 2 produk tray tak match | ditemukan (2 unmatched) | **HILANG/RESOLVED → 0 unmatched.** Semua 38 nama produk SP match warehouse. Trays dulu artefak file lama. → cabang "produk tak ada di warehouse" (keputusan #7) **tidak kena baris apa pun** (safeguard tetap dipasang). |
| **F4** 717/433 | ditemukan (beda brief) | **RESOLVED → 720/435.** Persis brief. |
| **F5** variasi kolom antar sheet | ditemukan | **TETAP BENAR** — TROLLY beda; GENERAL/CK urutan `KIRIM` sebelum `INV`. → staging **per-sheet**. |
| **Task 1** SP >1 BTB | 2 SP | **SAMA → 2 SP** (`2112398`→[1994555,2062562], `2055555`→[2002172,2047986]). Mapping `sp_btbs` DISTINCT. |

## Catatan data penting (baru, dari inspeksi XLSX)

1. **Angka sebagai numerik:** `SP NO`/`BTB NO`/`QTY`/harga tersimpan sebagai number → saat load bisa muncul `2112398.0`. **Normalisasi wajib**: `sp_no`/`btb_no` = `regexp_replace(TRIM(x),'\.0+$','')`; angka via `::numeric::int`.
2. **Tanggal berisi `-`:** kolom `Deadline` sering `'-'` (bukan kosong); `EXP Date`/`Deadline` juga ada yang blank. **Konversi**: `NULLIF(NULLIF(TRIM(x),'-'),'')::date`. Mapping: `exp_date ← EXP Date`, `expired_date ← Deadline`. (Aman: baris Closed → `status='Closed'` → `isOverdue` di-skip apa pun deadline-nya; hanya non-closed dgn deadline lampau yang overdue — memang benar.)
3. **Boolean literal:** `INV/FP/SUBMIT/KIRIM` = `'True'`/`'False'`/kosong. Mapping `UPPER(TRIM(x))='TRUE'` (kosong→false). Distribusi: INV/FP {True 449, False 204, blank 67}; SUBMIT/KIRIM {True 427, False 212, blank 81}.
4. **QTY FC:** 7 dari 38 produk warehouse ber-`QTY FC` kosong/0 → **tak dibuat baris `stock_ledger`** (produk tetap dibuat, stok 0). Wajar.
5. **DC LIST** (informational): kolom `DC NAME`/`DC ADDRESS`/`PIC NAME`/`PHONE`. `sp_items.dc` = **teks bebas** dari kolom `DC` tiap baris SP (mis. "DC PURWAKARTA", "DC PARUNG") — **tidak** semua ada di DC LIST → tetap teks bebas, DC LIST tak diimpor (bisa jadi tabel referensi DC nanti, di luar scope).
6. **PRODUCT sheet** (manifest, 38 nama, SKU **lama** mis. `RLS-FLAT-0090`) match 100% ke warehouse — memvalidasi keputusan #6. Tapi **sistem simpan SKU BARU** warehouse (`FG.DSP.RLC.0001`, dst) via join nama (keputusan #7). SKU lama **tidak dipakai**.

## Mapping final: sheet → customer_id → kategori → shipped_qty

| Sheet | `customer_id` | `sp_category` | `shipped_qty` |
|-------|---------------|---------------|---------------|
| SP INDOMARCO | `a18fad3c-75ee-4fc6-b3d2-5c5dfa810661` | `reguler` | Closed→qty; else as-is |
| SP INDOMARCO-LOYANG | `a18fad3c-…` (sama) | `loyang` | Closed→qty; else as-is |
| SP INDOMARCO-TROLLY | `a18fad3c-…` (sama) | `trolly` | **= qty semua** (tak ada kolom shipped; #3) |
| SP INDOGROSIR | `<indogrosir_id>` | NULL | Closed→qty; else as-is |
| SP GENERAL ORDER | `<general_id>` | NULL | Closed→qty; else as-is |
| SP CK (CENTRAL KITCHEN) | `<ck_id>` | NULL | Closed→qty; else as-is |

---

## SQL FINAL per-TAHAP (revisi 3, belum dieksekusi)

### TAHAP 0 — Verifikasi PRA-import
```sql
SELECT count(*) rows, count(DISTINCT sp_no) sp FROM public.sp_items;                 -- baseline
SELECT sp_no, count(*) FROM public.sp_items WHERE sp_no='SP-894688' GROUP BY sp_no;  -- baris test
SELECT count(*) FROM public.picking_lists WHERE sp_no='SP-894688';
-- Manifest sp_no numerik (2047009, 2117078…) → 0 tabrakan dgn 'SP-894688'.
SELECT column_name FROM information_schema.columns
 WHERE table_name='sp_items' AND column_name IN ('sp_status','sp_category');         -- sp_category dibuat di 5a
SELECT id, code, name FROM public.warehouses
 WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND is_active;
```
> Disarankan hapus baris test: `DELETE FROM public.picking_lists WHERE sp_no='SP-894688'; DELETE FROM public.sp_items WHERE sp_no='SP-894688';`

### TAHAP 1 — Accounts
```sql
-- 1a. Indomarco → customer_type='trading' (keputusan #1)
UPDATE public.accounts SET customer_type='trading'
WHERE id='a18fad3c-75ee-4fc6-b3d2-5c5dfa810661';

-- 1b. pre-check kolisi code (harus 0)
SELECT code FROM public.accounts
WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
  AND code IN ('CUST-SOA-INDOGROSIR','CUST-SOA-GENERAL','CUST-SOA-CK');

-- 1c. 3 akun baru (mirror db.js:upsertCustomer)
INSERT INTO public.accounts
  (name, company_id, owner_company_id, account_status, customer_type, is_active, became_customer_at, code)
VALUES
  ('Indogrosir',           'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(),'CUST-SOA-INDOGROSIR'),
  ('General Order',        'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(),'CUST-SOA-GENERAL'),
  ('CK - Central Kitchen', 'd2e5e565-5f67-4954-b8d9-5979a2a0c697','d2e5e565-5f67-4954-b8d9-5979a2a0c697','customer','trading', true, now(),'CUST-SOA-CK')
RETURNING id, name;   -- CATAT 3 id → isi <indogrosir_id>/<general_id>/<ck_id>
```
**Verif 1:** `SELECT id,name,customer_type FROM accounts WHERE company_id='d2e5…' AND account_status='customer' ORDER BY name;` → 4 akun, semua `trading`.

### TAHAP 2 — Products (38; SKU baru warehouse)
```sql
-- 2a. staging SUMMARY (import 'MSI GROUP WAREHOUSE (1).xlsx' sheet SUMMARY → CSV → tabel ini)
CREATE TABLE stg_wh (
  no text, item_description text, inventory_class text, grp text, sku_id text,
  operational_function text, qty_cc text, qty_fc text, variance text,
  uom text, status text, remarks text, last_count_sync text
);

-- 2b. 38 produk FG+Sub-Assembly (SKU BARU = sku_id; is_service=false)
INSERT INTO public.products
  (company_id, code, name, is_service, is_active, inventory_class, main_group, uom)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
       TRIM(s.sku_id), TRIM(s.item_description), false, true,
       TRIM(s.inventory_class), TRIM(s.grp), TRIM(s.uom)
FROM stg_wh s
WHERE TRIM(s.inventory_class) IN ('Finished Goods','Sub-Assembly')
  AND TRIM(COALESCE(s.item_description,'')) <> '';
```
**Verif 2:** `SELECT count(*) FROM products WHERE company_id='d2e5…' AND deleted_at IS NULL;` → **+38**. Dup nama/kode: `SELECT name,count(*) FROM products WHERE company_id='d2e5…' GROUP BY name HAVING count(*)>1;` → 0.

### TAHAP 3 — Warehouse SOA (bila TAHAP 0 kosong)
```sql
INSERT INTO public.warehouses (company_id, code, name, is_active)
VALUES ('d2e5e565-5f67-4954-b8d9-5979a2a0c697','WH-SOA-01','Gudang Utama Storbit', true)
ON CONFLICT (company_id, code) DO NOTHING RETURNING id, code;   -- catat warehouse_id
```

### TAHAP 4 — stock_ledger (inbound = QTY FC; 31 dari 38 punya stok, 7 kosong dilewati)
```sql
INSERT INTO public.stock_ledger
  (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_no, notes)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697', '<warehouse_id SOA>',
       p.id, 'inbound', NULLIF(TRIM(s.qty_fc),'')::numeric::int,
       'import', 'INIT-STOCK-2026', 'Saldo awal SUMMARY warehouse'
FROM stg_wh s
JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.item_description))
WHERE TRIM(s.inventory_class) IN ('Finished Goods','Sub-Assembly')
  AND NULLIF(TRIM(s.qty_fc),'') IS NOT NULL
  AND NULLIF(TRIM(s.qty_fc),'')::numeric::int <> 0;
```
**Verif 4:** `SELECT p.name, ss.on_hand FROM stock_summary ss JOIN products p ON p.id=ss.product_id WHERE ss.company_id='d2e5…' ORDER BY p.name;` → `on_hand` = QTY FC. `SELECT count(*) FROM stock_ledger WHERE reference_no='INIT-STOCK-2026';` ≈ 31.

### TAHAP 5 — sp_items (staging per-sheet; SKU baru via nama; normalisasi angka/tanggal/boolean)
```sql
-- 5a. kolom kategori (Opsi A, keputusan #2)
ALTER TABLE public.sp_items ADD COLUMN IF NOT EXISTS sp_category text;

-- 5b. staging ALL-TEXT (robust thd '-'/blank/numeric). Dua bentuk:
--   stg_sp_full  → 5 sheet (INDOGROSIR/INDOMARCO/LOYANG/GENERAL/CK)
--   stg_sp_trolly→ TROLLY (tanpa shipped_qty/submit_date/email_status; ada kirim_date)
CREATE TABLE stg_sp_full (
  sheet text, sp_date text, sp_no text, product_name text, sku_old text,
  qty text, shipped_qty text, outstanding text, exp_date text, deadline text,
  status text, dc text, shipping_date text, arrival_date text, btb_no text, btb_remarks text,
  unit_price text, shipping_price text, total text, ppn text, grand_total text,
  inv text, fp text, submit text, kirim text, submit_date text, email_status text
);
CREATE TABLE stg_sp_trolly (
  sheet text, sp_date text, sp_no text, product_name text, sku_old text,
  qty text, exp_date text, deadline text, status text, dc text,
  shipping_date text, arrival_date text, btb_no text, btb_remarks text,
  unit_price text, shipping_price text, total text, ppn text, grand_total text,
  inv text, fp text, submit text, kirim text, kirim_date text
);
-- (import tiap sheet ke staging-nya; set kolom `sheet` = literal per impor:
--   INDOMARCO / LOYANG / INDOGROSIR / GENERAL / CK ke stg_sp_full;  TROLLY ke stg_sp_trolly.
--   GENERAL/CK urutan KIRIM sebelum INV → map by NAMA kolom saat load, bukan posisi.)

-- 5c. INSERT 5 sheet FULL → sp_items
INSERT INTO public.sp_items
  (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
   unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
   inv, fp, submit, kirim, submit_date, email_status, notes, sp_status, sp_category)
SELECT
  regexp_replace(TRIM(s.sp_no),'\.0+$',''),
  NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
  CASE s.sheet
    WHEN 'INDOMARCO'  THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
    WHEN 'LOYANG'     THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
    WHEN 'INDOGROSIR' THEN '<indogrosir_id>'
    WHEN 'GENERAL'    THEN '<general_id>'
    WHEN 'CK'         THEN '<ck_id>'
  END,
  TRIM(s.product_name),
  COALESCE(p.code, '-'),                                              -- SKU BARU; '-' bila tak match (harusnya 0; keputusan #7)
  NULLIF(TRIM(s.qty),'')::numeric::int,
  CASE WHEN TRIM(s.status)='Closed' THEN NULLIF(TRIM(s.qty),'')::numeric::int   -- anti overdue (#3)
       ELSE COALESCE(NULLIF(TRIM(s.shipped_qty),'')::numeric::int, 0) END,
  COALESCE(TRIM(s.dc),''),
  COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric, 0),
  COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric, 0),
  NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,
  NULLIF(NULLIF(TRIM(s.deadline),'-'),'')::date,
  NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
  NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
  (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
  (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
  (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
  (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
  NULLIF(NULLIF(TRIM(s.submit_date),'-'),'')::date,
  NULLIF(TRIM(s.email_status),''),
  '', 'confirmed',
  CASE s.sheet WHEN 'INDOMARCO' THEN 'reguler' WHEN 'LOYANG' THEN 'loyang' ELSE NULL END
FROM stg_sp_full s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.product_name));

-- 5d. INSERT TROLLY → sp_items (shipped_qty = qty; tak ada submit_date/email_status)
INSERT INTO public.sp_items
  (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
   unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
   inv, fp, submit, kirim, notes, sp_status, sp_category)
SELECT
  regexp_replace(TRIM(s.sp_no),'\.0+$',''),
  NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
  'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
  TRIM(s.product_name), COALESCE(p.code,'-'),
  NULLIF(TRIM(s.qty),'')::numeric::int,
  NULLIF(TRIM(s.qty),'')::numeric::int,                              -- shipped = qty (TROLLY, #3/F1)
  COALESCE(TRIM(s.dc),''),
  COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0),
  COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
  NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,
  NULLIF(NULLIF(TRIM(s.deadline),'-'),'')::date,
  NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
  NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
  (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
  (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
  (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
  (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
  '', 'confirmed', 'trolly'
FROM stg_sp_trolly s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.product_name));
```
**Verif 5 (WAJIB semua lolos):**
```sql
SELECT count(*) rows, count(DISTINCT sp_no) sp FROM sp_items WHERE sp_status='confirmed';   -- 720 / 435
SELECT a.name, count(*) rows, count(DISTINCT si.sp_no) sp
 FROM sp_items si JOIN accounts a ON a.id=si.customer_id GROUP BY a.name ORDER BY a.name;
SELECT count(*) FROM sp_items WHERE customer_id IS NULL AND sp_status='confirmed';           -- WAJIB 0
-- 0 baris ber-SKU '-' (semua produk match warehouse → semua dpt SKU baru):
SELECT count(*) FROM sp_items WHERE sku='-' AND sp_status='confirmed';                        -- harus 0
-- SKU sistem = SKU baru utk yg match:
SELECT count(*) FROM sp_items si JOIN products p
 ON p.company_id='d2e5…' AND lower(TRIM(p.name))=lower(TRIM(si.product_name))
 WHERE si.sku <> p.code;                                                                      -- WAJIB 0
SELECT count(*) FROM sp_items WHERE (qty - shipped_qty) < 0;                                  -- 0 (anti overdue)
SELECT sp_category, count(*) FROM sp_items
 WHERE customer_id='a18fad3c-75ee-4fc6-b3d2-5c5dfa810661' GROUP BY sp_category;               -- reguler/loyang/trolly
SELECT count(*) FROM sp_items WHERE sp_no='SP-894688';                                        -- test terisolasi
```
> Ekspektasi sebaran: Indomarco 706 baris (535+141+30) / 423 SP (252+141+30); Indogrosir 8/8; General Order 3/1; CK 3/3. **Total 720/435.**

### TAHAP 6 — sp_btbs (DISTINCT; 2 SP multi-BTB otomatis)
```sql
INSERT INTO public.sp_btbs (sp_no, btb_no, remarks)
SELECT DISTINCT regexp_replace(TRIM(sp_no),'\.0+$',''), regexp_replace(TRIM(btb_no),'\.0+$',''), ''
FROM (
  SELECT sp_no, btb_no FROM stg_sp_full   WHERE btb_no IS NOT NULL AND TRIM(btb_no) NOT IN ('','-')
  UNION
  SELECT sp_no, btb_no FROM stg_sp_trolly WHERE btb_no IS NOT NULL AND TRIM(btb_no) NOT IN ('','-')
) x;
```
**Verif 6:** `SELECT sp_no, count(*) FROM sp_btbs GROUP BY sp_no HAVING count(*)>1;` → **hanya `2112398` & `2055555`** (2 baris masing-masing). `SELECT count(*) FROM sp_btbs;` = jumlah (sp_no,btb_no) distinct.

### TAHAP 7 — Cleanup & finalisasi
```sql
DROP TABLE IF EXISTS stg_wh, stg_sp_full, stg_sp_trolly;
```
- **Refresh `schema_snapshot.sql` via `pg_dump`** (wajib — snapshot stale + kolom baru `sp_category`).
- **Smoke test UI:** filter customer (4 akun tampil), tak ada overdue palsu, badge CONFIRMED, buka SP outstanding → tombol **Generate Picking List** muncul → generate jalan; Inventory `on_hand`=QTY FC.

## Status keputusan — revisi 3
**Tidak ada lagi keputusan terbuka.** Semua flag revisi-2 selesai oleh data yang benar:
- F1 (TROLLY tanpa shipped) → **dikonfirmasi**, ditangani `shipped_qty=qty` (keputusan #3).
- F2/F3/F4 → **resolved** (38 produk, 0 unmatched, 720/435).
- Boolean/tanggal/numerik → **ditangani** normalisasi di SQL.

> Yang perlu darimu saat eksekusi: **isi `<indogrosir_id>`/`<general_id>`/`<ck_id>`** (hasil TAHAP 1c), **`<warehouse_id SOA>`** (TAHAP 3), dan **load CSV/data ke tabel staging** sesuai kolom. Sisanya tinggal jalan TAHAP 0→7 bertahap dgn verifikasi.

---

## ADDENDUM revisi 3.1 — koreksi products/stock, unit_price, warehouse (saat eksekusi)

**Konteks eksekusi:** 0A terverifikasi (baseline 1 row test SP-894688; 3 gudang SOA existing; sp_category belum ada; 0 sp_no numerik). **Products/stock BERUBAH dari INSERT murni → UPSERT (no-delete).**

### C1 — Warehouse untuk stock_ledger (3 gudang SOA existing)
`DC-CBT` (86e4733d-…, DC Cibitung) · `OTHERS` (2b24e092-…, Gudang Lainnya) · `SEMPER` (303c3d4c-570e-40a1-b738-6b0ed1cb5078, Gudang Semper). Workbook warehouse **tak menyebut lokasi eksplisit**. **Rekomendasi: `SEMPER` (Gudang Semper)** sebagai lokasi FG utama (konsisten dgn `StokBarangPage` yang memfilter 'Gudang Semper'/'Gudang Others'). **⟵ perlu konfirmasi ops.**

### C2 — Products = UPSERT (JANGAN hapus; 63 produk existing valid)
63 produk SOA existing (code sama format: `FG.DSP.…`, `SA.DSP.…`). Hanya **38 (FG 33 + Sub-Assembly 5)** yang di-UPSERT dari SUMMARY; **25 lain (Asset/Inventory/Raw Material) TIDAK disentuh**. Ganti INSERT TAHAP 2 → **`INSERT … ON CONFLICT (company_id, code) DO UPDATE`** (refresh name/inventory_class/main_group/uom/is_service=false/is_active=true/updated_at; jangan sentuh default_price/deleted_at). **Prasyarat: konfirmasi 38 kode SUMMARY match by-code ke existing** (diagnostic di chat).

### C3 — stock_ledger = REFRESH via adjustment (bukan inbound murni)
Karena produk existing kemungkinan sudah punya baris `stock_ledger`, refresh stok ke `QTY FC` pakai **movement `adjustment` sebesar delta** (`QTY FC − on_hand sekarang`), bukan inbound baru. Bila produk belum punya stok → delta = QTY FC (setara inbound). Hanya 38 FG+Sub-Assembly; 7 produk `QTY FC`=0 dilewati bila delta 0.

### C4 — ⚠️ Anomali `Unit Price` (KEPUTUSAN sebelum TAHAP 6/sp_items)
**74 baris** punya `Unit Price` = **total baris**, bukan harga per-unit (INDOMARCO 8, LOYANG 63, TROLLY 3). Contoh SP 2023410: qty 11.000 × up 61.567.000 = **677 miliar** (padahal TOTAL 61.567.000). App menghitung `subtotal=unit_price×qty` → tampilan kacau bila diimpor apa adanya. Opsi:
- **Opt-2 (rekomendasi):** `unit_price = CASE WHEN round(unit_price×qty)=round(TOTAL) THEN unit_price ELSE ROUND(TOTAL/qty,2) END` — pertahankan harga per-unit yang sudah benar, back-compute hanya anomali. 34 baris (TOTAL tak habis dibagi qty) tetap meleset ~cents → verifikasi nilai pakai **toleransi kecil**.
- **Opt-1:** `unit_price = ROUND(TOTAL/qty,2)` untuk SEMUA (seragam, tapi lebih banyak baris drift cents).
- **Opt-3:** impor apa adanya (DITOLAK — tampilan 677 M).
→ **verifikasi acuan TAHAP 6 = GRAND TOTAL** (sum = Rp 7.677.438.264; sumQTY=984.026 — dikonfirmasi dari file). Grand di-derive app = `subtotal+shipping+round((subtotal+shipping)×0.11)`; PPN dibulatkan per baris → selisih kecil vs acuan wajar.

### TODO (di luar scope import — catat, jangan kerjakan sekarang)
**Halaman Inventory perlu pembeda visual "produk trading/jualan" (FG+Sub-Assembly) vs "barang operasional gudang" (Asset/Inventory/Raw Material).** Ke-63 produk SOA valid; 25 non-trading di-stock-opname bulanan & di-request ke procurement. Saat ini semua tercampur di list Inventory. Rancang filter/badge by `inventory_class`. (Tambahkan ke TECH_DEBT saat sprint UI Inventory.)

---

## SQL FINAL EKSEKUSI — TAHAP 4–7 (revisi 3.2, nilai dibekukan)

> Diagnostik terkonfirmasi: match-by-code **36 update + 2 insert** (`FG.GFP.TRY.0001/0002` baru); set FG/Sub existing bersih (0 di luar 38). Stok: 36 produk sudah ada ledger (40 baris) → **adjustment**; 2 baru → **inbound**. Warehouse **Gudang Semper** `303c3d4c-570e-40a1-b738-6b0ed1cb5078`. Unit Price **Opt-2**.
> **ID beku:** SOA `d2e5e565-5f67-4954-b8d9-5979a2a0c697` · Indomarco `a18fad3c-75ee-4fc6-b3d2-5c5dfa810661` · Indogrosir `92f48635-eb57-447a-940d-b5f9d8ac0963` · General Order `7fa6db6c-e356-44aa-be58-1c40ffaeeed8` · CK `4c3db412-c5af-419d-9e81-f0cf57cf60f4` · Semper `303c3d4c-570e-40a1-b738-6b0ed1cb5078`.

### TAHAP 4 — Products (UPSERT 36 update + 2 insert)
```sql
-- 4a. staging SUMMARY (import 'MSI GROUP WAREHOUSE (1).xlsx' > sheet SUMMARY > CSV)
DROP TABLE IF EXISTS stg_wh;
CREATE TABLE stg_wh (
  no text, item_description text, inventory_class text, grp text, sku_id text,
  operational_function text, qty_cc text, qty_fc text, variance text,
  uom text, status text, remarks text, last_count_sync text
);
-- (import CSV → stg_wh)

-- 4b. UPSERT (ON CONFLICT company_id,code) — 36 update + 2 insert; 25 non-trading tak tersentuh
INSERT INTO public.products
  (company_id, code, name, is_service, is_active, inventory_class, main_group, uom)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
       TRIM(s.sku_id), TRIM(s.item_description), false, true,
       TRIM(s.inventory_class), TRIM(s.grp), TRIM(s.uom)
FROM stg_wh s
WHERE TRIM(s.inventory_class) IN ('Finished Goods','Sub-Assembly')
  AND TRIM(COALESCE(s.sku_id,'')) <> ''
ON CONFLICT (company_id, code) DO UPDATE SET
  name=EXCLUDED.name, inventory_class=EXCLUDED.inventory_class,
  main_group=EXCLUDED.main_group, uom=EXCLUDED.uom,
  is_service=false, is_active=true, updated_at=now();
```
**Verif 4:**
```sql
SELECT count(*) FROM products WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
  AND inventory_class IN ('Finished Goods','Sub-Assembly') AND deleted_at IS NULL;   -- 38
SELECT count(*) FROM products WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND deleted_at IS NULL; -- 65 (63+2)
SELECT code,name FROM products WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
  AND code IN ('FG.GFP.TRY.0001','FG.GFP.TRY.0002');   -- 2 produk baru
```

### TAHAP 5 — Stock refresh (Gudang Semper; adjustment/inbound)
```sql
WITH cur AS (
  SELECT product_id, SUM(qty)::int AS on_hand
  FROM public.stock_ledger
  WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
  GROUP BY product_id
),
tgt AS (
  SELECT p.id AS product_id,
         NULLIF(TRIM(s.qty_fc),'')::numeric::int AS qty_fc,
         EXISTS (SELECT 1 FROM public.stock_ledger sl
                 WHERE sl.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND sl.product_id=p.id) AS has_ledger
  FROM stg_wh s
  JOIN public.products p
    ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND p.code=TRIM(s.sku_id)
  WHERE TRIM(s.inventory_class) IN ('Finished Goods','Sub-Assembly')
)
INSERT INTO public.stock_ledger
  (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_no, notes)
SELECT 'd2e5e565-5f67-4954-b8d9-5979a2a0c697',
       '303c3d4c-570e-40a1-b738-6b0ed1cb5078',
       t.product_id,
       CASE WHEN t.has_ledger THEN 'adjustment' ELSE 'inbound' END,
       COALESCE(t.qty_fc,0) - COALESCE(c.on_hand,0),
       'import','STOCK-REFRESH-2026','Refresh stok ke QTY FC (SUMMARY warehouse)'
FROM tgt t LEFT JOIN cur c ON c.product_id=t.product_id
WHERE COALESCE(t.qty_fc,0) - COALESCE(c.on_hand,0) <> 0;
-- adjustment/inbound diposting ke Semper; membawa TOTAL on_hand (semua gudang) tiap produk = QTY FC.
```
**Verif 5 (on_hand total = QTY FC):**
```sql
SELECT p.code, p.name,
       (SELECT COALESCE(SUM(qty),0) FROM public.stock_ledger
        WHERE company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND product_id=p.id) AS on_hand_total,
       NULLIF(TRIM(s.qty_fc),'')::numeric::int AS qty_fc
FROM stg_wh s JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697' AND p.code=TRIM(s.sku_id)
WHERE TRIM(s.inventory_class) IN ('Finished Goods','Sub-Assembly')
ORDER BY p.code;   -- on_hand_total HARUS = qty_fc semua baris
SELECT movement_type, count(*) FROM public.stock_ledger
WHERE reference_no='STOCK-REFRESH-2026' GROUP BY movement_type;  -- adjustment ~36, inbound 0 (2 tray qty_fc=0 → delta 0 dilewati)
```

### TAHAP 6 — sp_items (Opt-2 unit_price)
```sql
-- 6a. kolom kategori (Opsi A)
ALTER TABLE public.sp_items ADD COLUMN IF NOT EXISTS sp_category text;

-- 6b. staging (semua kolom TEXT — robust thd '-'/blank/numeric)
DROP TABLE IF EXISTS stg_sp_full, stg_sp_trolly;
CREATE TABLE stg_sp_full (
  sheet text, sp_date text, sp_no text, product_name text, sku_old text, qty text, shipped_qty text,
  outstanding text, exp_date text, deadline text, status text, dc text, shipping_date text, arrival_date text,
  btb_no text, btb_remarks text, unit_price text, shipping_price text, total text, ppn text, grand_total text,
  inv text, fp text, submit text, kirim text, submit_date text, email_status text );
CREATE TABLE stg_sp_trolly (
  sheet text, sp_date text, sp_no text, product_name text, sku_old text, qty text, exp_date text, deadline text,
  status text, dc text, shipping_date text, arrival_date text, btb_no text, btb_remarks text, unit_price text,
  shipping_price text, total text, ppn text, grand_total text, inv text, fp text, submit text, kirim text, kirim_date text );
-- import: INDOMARCO/LOYANG/INDOGROSIR/GENERAL/CK → stg_sp_full;  TROLLY → stg_sp_trolly.
-- set kolom `sheet` per impor, mis. sesudah impor sheet Indomarco:
--   UPDATE stg_sp_full SET sheet='INDOMARCO' WHERE sheet IS NULL;
--   (lalu impor LOYANG → UPDATE ... SET sheet='LOYANG' WHERE sheet IS NULL;  dst: INDOGROSIR/GENERAL/CK)
--   TROLLY: UPDATE stg_sp_trolly SET sheet='TROLLY' WHERE sheet IS NULL;
-- GENERAL/CK urutan KIRIM sebelum INV → map by NAMA kolom saat impor, bukan posisi.

-- 6c. INSERT 5 sheet FULL
INSERT INTO public.sp_items
 (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
  unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
  inv, fp, submit, kirim, submit_date, email_status, notes, sp_status, sp_category)
SELECT
 regexp_replace(TRIM(s.sp_no),'\.0+$',''),
 NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
 CASE s.sheet
   WHEN 'INDOMARCO'  THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
   WHEN 'LOYANG'     THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
   WHEN 'INDOGROSIR' THEN '92f48635-eb57-447a-940d-b5f9d8ac0963'
   WHEN 'GENERAL'    THEN '7fa6db6c-e356-44aa-be58-1c40ffaeeed8'
   WHEN 'CK'         THEN '4c3db412-c5af-419d-9e81-f0cf57cf60f4'
 END,
 TRIM(s.product_name),
 COALESCE(p.code,'-'),
 NULLIF(TRIM(s.qty),'')::numeric::int,
 CASE WHEN TRIM(s.status)='Closed' THEN NULLIF(TRIM(s.qty),'')::numeric::int
      ELSE COALESCE(NULLIF(TRIM(s.shipped_qty),'')::numeric::int,0) END,
 COALESCE(TRIM(s.dc),''),
 CASE WHEN ROUND(COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0) * NULLIF(TRIM(s.qty),'')::numeric)
         = ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0))
      THEN COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)
      ELSE ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0) / NULLIF(NULLIF(TRIM(s.qty),'')::numeric,0), 2)
 END,
 COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.deadline),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
 (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
 NULLIF(NULLIF(TRIM(s.submit_date),'-'),'')::date,
 NULLIF(TRIM(s.email_status),''),
 '', 'confirmed',
 CASE s.sheet WHEN 'INDOMARCO' THEN 'reguler' WHEN 'LOYANG' THEN 'loyang' ELSE NULL END
FROM stg_sp_full s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.product_name));

-- 6d. INSERT TROLLY (shipped=qty; tanpa submit_date/email_status)
INSERT INTO public.sp_items
 (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
  unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
  inv, fp, submit, kirim, notes, sp_status, sp_category)
SELECT
 regexp_replace(TRIM(s.sp_no),'\.0+$',''),
 NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
 TRIM(s.product_name), COALESCE(p.code,'-'),
 NULLIF(TRIM(s.qty),'')::numeric::int,
 NULLIF(TRIM(s.qty),'')::numeric::int,
 COALESCE(TRIM(s.dc),''),
 CASE WHEN ROUND(COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0) * NULLIF(TRIM(s.qty),'')::numeric)
         = ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0))
      THEN COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)
      ELSE ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0) / NULLIF(NULLIF(TRIM(s.qty),'')::numeric,0), 2)
 END,
 COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.deadline),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
 (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
 '', 'confirmed', 'trolly'
FROM stg_sp_trolly s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND lower(TRIM(p.name))=lower(TRIM(s.product_name));
```
**Verif 6 (bandingkan ke acuan):**
```sql
SELECT count(*) rows, count(DISTINCT sp_no) sp FROM sp_items WHERE sp_status='confirmed';   -- 720 / 435
SELECT SUM(qty) FROM sp_items WHERE sp_status='confirmed';                                   -- 984026
SELECT SUM(unit_price*qty) AS subtotal FROM sp_items WHERE sp_status='confirmed';            -- ~6,916,611,049
SELECT SUM(sub+ship+ROUND((sub+ship)*0.11)) AS grand_derived, 7677438264 AS acuan,
       SUM(sub+ship+ROUND((sub+ship)*0.11))-7677438264 AS selisih
FROM (SELECT unit_price*qty AS sub, shipping_price AS ship FROM sp_items WHERE sp_status='confirmed') t;
SELECT a.name, count(*) rows, count(DISTINCT si.sp_no) sp, SUM(si.qty) qty,
       SUM(si.unit_price*si.qty + si.shipping_price + ROUND((si.unit_price*si.qty+si.shipping_price)*0.11)) grand
FROM sp_items si JOIN accounts a ON a.id=si.customer_id
WHERE si.sp_status='confirmed' GROUP BY a.name ORDER BY a.name;
-- GUARD (semua harus 0):
SELECT count(*) FROM sp_items WHERE customer_id IS NULL AND sp_status='confirmed';
SELECT count(*) FROM sp_items WHERE sku='-' AND sp_status='confirmed';
SELECT count(*) FROM sp_items WHERE (qty - shipped_qty) < 0;
SELECT sp_category, count(*) FROM sp_items WHERE customer_id='a18fad3c-75ee-4fc6-b3d2-5c5dfa810661' GROUP BY sp_category;
```
**Acuan per customer:** Indomarco 706 baris / 423 SP / qty 981.279 / grand 7.606.377.316 · Indogrosir 8/8/2.379/20.789.070 · General Order 3/1/180/3.318.878 · CK 3/3/188/46.953.000. *(grand derived bisa beda beberapa rupiah dari acuan: PPN dibulatkan per-baris + Opt-2 back-compute 34 baris — laporkan selisih.)*

### TAHAP 7 — sp_btbs + cleanup + snapshot
```sql
INSERT INTO public.sp_btbs (sp_no, btb_no, remarks)
SELECT DISTINCT regexp_replace(TRIM(sp_no),'\.0+$',''), regexp_replace(TRIM(btb_no),'\.0+$',''), ''
FROM (
  SELECT sp_no, btb_no FROM stg_sp_full   WHERE btb_no IS NOT NULL AND TRIM(btb_no) NOT IN ('','-')
  UNION
  SELECT sp_no, btb_no FROM stg_sp_trolly WHERE btb_no IS NOT NULL AND TRIM(btb_no) NOT IN ('','-')
) x;
```
**Verif 7:** `SELECT sp_no, count(*) FROM sp_btbs GROUP BY sp_no HAVING count(*)>1;` → hanya `2112398` & `2055555`.
```sql
-- cleanup
DROP TABLE IF EXISTS stg_wh, stg_sp_full, stg_sp_trolly;
```
- **Refresh `schema_snapshot.sql` via `pg_dump`** (wajib — kolom baru `sp_category` + data).
- Smoke test UI: filter 4 customer, tak ada overdue palsu, badge CONFIRMED, SP outstanding → tombol Generate Picking; Inventory on_hand = QTY FC.

---

## TAHAP 6 FINAL (revisi 3.3 — sesuai staging aktual)

> Staging aktual: `stg_sp_full` 690 baris (kolom `sheet_name` ∈ INDOMARCO/LOYANG/INDOGROSIR/`GENERAL ORDER`/CK; **tanpa** `email_status`) + `stg_sp_trolly` 30 baris (tanpa `shipped_qty`/`outstanding`; ada `kirim_date` yang tak dipakai). Join produk **whitespace-robust** (collapse spasi internal) → jamin 38 match.

```sql
-- 6a. kolom kategori (idempoten)
ALTER TABLE public.sp_items ADD COLUMN IF NOT EXISTS sp_category text;

-- 6c. INSERT stg_sp_full (690) → sp_items
INSERT INTO public.sp_items
 (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
  unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
  inv, fp, submit, kirim, submit_date, notes, sp_status, sp_category)
SELECT
 regexp_replace(TRIM(s.sp_no),'\.0+$',''),
 NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
 CASE s.sheet_name
   WHEN 'INDOMARCO'     THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
   WHEN 'LOYANG'        THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
   WHEN 'INDOGROSIR'    THEN '92f48635-eb57-447a-940d-b5f9d8ac0963'
   WHEN 'GENERAL ORDER' THEN '7fa6db6c-e356-44aa-be58-1c40ffaeeed8'
   WHEN 'CK'            THEN '4c3db412-c5af-419d-9e81-f0cf57cf60f4'
 END,
 TRIM(s.product_name),
 COALESCE(p.code,'-'),
 NULLIF(TRIM(s.qty),'')::numeric::int,
 CASE WHEN TRIM(s.status)='Closed' THEN NULLIF(TRIM(s.qty),'')::numeric::int
      ELSE COALESCE(NULLIF(TRIM(s.shipped_qty),'')::numeric::int,0) END,
 COALESCE(TRIM(s.dc),''),
 CASE WHEN ROUND(COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)*NULLIF(TRIM(s.qty),'')::numeric)
         = ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0))
      THEN COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)
      ELSE ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0)/NULLIF(NULLIF(TRIM(s.qty),'')::numeric,0),2) END,
 COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.deadline),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
 (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
 NULLIF(NULLIF(TRIM(s.submit_date),'-'),'')::date,
 '', 'confirmed',
 CASE s.sheet_name WHEN 'INDOMARCO' THEN 'reguler' WHEN 'LOYANG' THEN 'loyang' ELSE NULL END
FROM stg_sp_full s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND regexp_replace(lower(TRIM(p.name)),'\s+',' ','g') = regexp_replace(lower(TRIM(s.product_name)),'\s+',' ','g');

-- 6d. INSERT stg_sp_trolly (30) → sp_items (shipped=qty; tanpa submit_date)
INSERT INTO public.sp_items
 (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
  unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
  inv, fp, submit, kirim, notes, sp_status, sp_category)
SELECT
 regexp_replace(TRIM(s.sp_no),'\.0+$',''),
 NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
 TRIM(s.product_name), COALESCE(p.code,'-'),
 NULLIF(TRIM(s.qty),'')::numeric::int,
 NULLIF(TRIM(s.qty),'')::numeric::int,
 COALESCE(TRIM(s.dc),''),
 CASE WHEN ROUND(COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)*NULLIF(TRIM(s.qty),'')::numeric)
         = ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0))
      THEN COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)
      ELSE ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0)/NULLIF(NULLIF(TRIM(s.qty),'')::numeric,0),2) END,
 COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.deadline),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
 (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
 '', 'confirmed', 'trolly'
FROM stg_sp_trolly s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND regexp_replace(lower(TRIM(p.name)),'\s+',' ','g') = regexp_replace(lower(TRIM(s.product_name)),'\s+',' ','g');
```

## TAHAP 6 FINAL (revisi 3.4 — Deadline TIDAK diimpor) ⟵ PAKAI INI

> Koreksi vs 3.3: kolom manifest **`Deadline` = turunan tampilan dari EXP Date** (sisa hari, bisa negatif) → **tidak disimpan**. Semua referensi `s.deadline` **dihapus**. `sp_items.expired_date` **diisi dari EXP Date** (stg `exp_date`) — sama dgn `sp_items.exp_date`; keduanya = tanggal kadaluarsa absolut. `Deadline` dihitung ulang di UI kapan saja. (Blok 3.3 di atas usang untuk pemetaan tanggal — jalankan blok 3.4 ini.)

```sql
-- 6a. kolom kategori (idempoten)
ALTER TABLE public.sp_items ADD COLUMN IF NOT EXISTS sp_category text;

-- 6c. stg_sp_full (690) → sp_items  [Deadline tidak diimpor]
INSERT INTO public.sp_items
 (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
  unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
  inv, fp, submit, kirim, submit_date, notes, sp_status, sp_category)
SELECT
 regexp_replace(TRIM(s.sp_no),'\.0+$',''),
 NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
 CASE s.sheet_name
   WHEN 'INDOMARCO'     THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
   WHEN 'LOYANG'        THEN 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661'
   WHEN 'INDOGROSIR'    THEN '92f48635-eb57-447a-940d-b5f9d8ac0963'
   WHEN 'GENERAL ORDER' THEN '7fa6db6c-e356-44aa-be58-1c40ffaeeed8'
   WHEN 'CK'            THEN '4c3db412-c5af-419d-9e81-f0cf57cf60f4'
 END,
 TRIM(s.product_name),
 COALESCE(p.code,'-'),
 NULLIF(TRIM(s.qty),'')::numeric::int,
 CASE WHEN TRIM(s.status)='Closed' THEN NULLIF(TRIM(s.qty),'')::numeric::int
      ELSE COALESCE(NULLIF(TRIM(s.shipped_qty),'')::numeric::int,0) END,
 COALESCE(TRIM(s.dc),''),
 CASE WHEN ROUND(COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)*NULLIF(TRIM(s.qty),'')::numeric)
         = ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0))
      THEN COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)
      ELSE ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0)/NULLIF(NULLIF(TRIM(s.qty),'')::numeric,0),2) END,
 COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,     -- exp_date  ← EXP Date
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,     -- expired_date ← EXP Date (Deadline TIDAK dipakai)
 NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
 (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
 NULLIF(NULLIF(TRIM(s.submit_date),'-'),'')::date,
 '', 'confirmed',
 CASE s.sheet_name WHEN 'INDOMARCO' THEN 'reguler' WHEN 'LOYANG' THEN 'loyang' ELSE NULL END
FROM stg_sp_full s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND regexp_replace(lower(TRIM(p.name)),'\s+',' ','g') = regexp_replace(lower(TRIM(s.product_name)),'\s+',' ','g');

-- 6d. stg_sp_trolly (30) → sp_items  [Deadline tidak diimpor; shipped=qty]
INSERT INTO public.sp_items
 (sp_no, sp_date, customer_id, product_name, sku, qty, shipped_qty, dc,
  unit_price, shipping_price, exp_date, expired_date, shipping_date, arrival_date,
  inv, fp, submit, kirim, notes, sp_status, sp_category)
SELECT
 regexp_replace(TRIM(s.sp_no),'\.0+$',''),
 NULLIF(NULLIF(TRIM(s.sp_date),'-'),'')::date,
 'a18fad3c-75ee-4fc6-b3d2-5c5dfa810661',
 TRIM(s.product_name), COALESCE(p.code,'-'),
 NULLIF(TRIM(s.qty),'')::numeric::int,
 NULLIF(TRIM(s.qty),'')::numeric::int,
 COALESCE(TRIM(s.dc),''),
 CASE WHEN ROUND(COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)*NULLIF(TRIM(s.qty),'')::numeric)
         = ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0))
      THEN COALESCE(NULLIF(TRIM(s.unit_price),'')::numeric,0)
      ELSE ROUND(COALESCE(NULLIF(TRIM(s.total),'')::numeric,0)/NULLIF(NULLIF(TRIM(s.qty),'')::numeric,0),2) END,
 COALESCE(NULLIF(TRIM(s.shipping_price),'')::numeric,0),
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,     -- exp_date  ← EXP Date
 NULLIF(NULLIF(TRIM(s.exp_date),'-'),'')::date,     -- expired_date ← EXP Date (Deadline TIDAK dipakai)
 NULLIF(NULLIF(TRIM(s.shipping_date),'-'),'')::date,
 NULLIF(NULLIF(TRIM(s.arrival_date),'-'),'')::date,
 (UPPER(TRIM(COALESCE(s.inv,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.fp,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.submit,'')))='TRUE'),
 (UPPER(TRIM(COALESCE(s.kirim,'')))='TRUE'),
 '', 'confirmed', 'trolly'
FROM stg_sp_trolly s
LEFT JOIN public.products p
  ON p.company_id='d2e5e565-5f67-4954-b8d9-5979a2a0c697'
 AND regexp_replace(lower(TRIM(p.name)),'\s+',' ','g') = regexp_replace(lower(TRIM(s.product_name)),'\s+',' ','g');
```
