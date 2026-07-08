# DESIGN — Skema DB Target MVP Storbit SP (End-to-End) — **VERSI FINAL TERKUNCI (rev.2)**

> **RANCANGAN FINAL (terkunci) untuk direview — BUKAN eksekusi.** Tidak ada kode/DB yang diubah.
> Semua blok SQL di bawah adalah **USULAN**. Basis: keenam audit
> (AUDIT_E2E/FINANCE/GUDANG/STOK/UI.md) + `supabase/schema_snapshot.sql` (struktur SEKARANG) +
> **12 keputusan final** (lihat bagian "KEPUTUSAN FINAL (TERKUNCI)" di bawah).
> Prinsip AGENTS.md dipatuhi: multi-company, soft-delete, FK & constraint, RLS company-scoped, deploy-code-sebelum-drop-column.
> ⚠️ Semua langkah migrasi **wajib diverifikasi ulang saat eksekusi** (di branch + staging).
>
> **✅ Diperbarui 2026-07-08 — sinkron dengan kode LIVE (resolusi TD-42).** FASE 0-3 sudah **[IMPLEMENTED]** (skema `sp_orders`/`sp_order_items`/`sp_btb`/`dc_master`, mesin status 12-tahap, `sp_recompute_status`, BTB) — bagian yang sudah live ditandai **[IMPLEMENTED]**; invoice/payment (FASE 4-5) + `sp_audit_log` masih rancangan. **KOREKSI RANK: `BTB_TERBIT` = rank TERTINGGI di band terkelola (di ATAS `TERKIRIM_PENUH`)** — "puncak sebelum invoice" (invoice ditagih atas BTB bertandatangan). Sinkron dengan `docs/Governance/03_DATA_MODEL` + `05_WORKFLOW_MAP`.

## Ringkasan keputusan desain (TL;DR)
1. **Pisah header/items (SEKARANG, penuh):** `sp_orders` (header) + `sp_order_items` (baris) menggantikan `sp_items` flat.
2. **Status:** satu kolom `status` (**text + CHECK**, 12 tahap + `CANCELLED`) di header, **DISPUTE = overlay flag** (`is_disputed`). Status **diturunkan dari fakta** via fungsi recompute; transisi manual hanya DRAFT→CONFIRMED, →CANCELLED, →SUBMITTED, set/clear DISPUTE.
3. **Partial/batch:** picking tetap **all-or-nothing**; partial hanya di **Surat Jalan** — 1 SP → **N `delivery_notes`** (guard "1 SJ aktif" **dihapus**), qty parsial per batch; `shipped_qty` naik **otomatis hanya dari dispatch**.
4. **BTB entitas nyata** (`sp_btb`) dengan **qty SAJA + FK ke SP + FK ke batch/SJ + nomor UNIK per-customer**; **tanpa nilai pajak**.
5. **Invoice entitas** (`sp_invoices` + `sp_invoice_lines` + `sp_payments`); **1 SP → 1 invoice**, terbit hanya saat Σshipped = Σqty; **nomor invoice digenerate sistem**.
6. **`ar_ttfs` (TTF) DIPERTAHANKAN** sebagai dokumen transmittal, tertaut FK ke `sp_orders` + `sp_invoices` (bukan dibuang).
7. **Master DC baru** (`dc_master` + `sp_orders.dc_id` FK); **`dc` wajib** saat create. Mengaktifkan mapping DC→wilayah struktural (donut Indomarco).
8. **Semua link teks (`sp_no`/`no_sp`/`no_btb`/`dc`) → FK.** `sp_no` & `btb_no` **UNIQUE per-customer**.
9. **Material packing** tetap terpisah (`picking_list_materials`, stok kelas Inventory).
10. **RLS company/role-aware diterapkan SEKARANG** untuk semua tabel baru & tabel alur; **tanpa role gudang** (operasional = role `operations`).
11. **Jembatan shipped_qty** di RPC `dispatch_delivery`, titik naik = **in_transit (dispatch)**.
12. **`stock_summary` tetap VIEW** (live).
13. **3 kategori harga per produk** (`price_semester`/`price_tahunan`/`price_project`, boleh NULL) di master `products` — memperluas `default_price`+`product_price_history` yang sudah ada, bukan menggandakan.
14. **Input SP pilih kategori harga**; `sp_order_items.unit_price` = **snapshot angka** (sumber kebenaran, immutable vs master) + `price_category` (label). Harga AUTO dari kategori, tak bisa diketik manual.
15. **Audit log SP** (`sp_audit_log`) mengaktifkan tab History; diisi **trigger** (status/item, tahan bocor) + insert dari RPC (event lintas-tabel).
16. **Field armada Surat Jalan OPSIONAL** (tak NOT NULL); driver+vehicle tetap syarat **dispatch** saja, bukan syarat pembuatan SJ.

---

## 1. MODEL STATUS SP

### 1.1 Pendekatan (TERKUNCI: hybrid — 1 kolom `status` diturunkan dari fakta)
`status` = **headline 12 tahap** yang **di-maintain otomatis** oleh event (shipment/BTB/invoice/payment) via fungsi `sp_recompute_status`, **bukan** diketik bebas. Kebenaran fulfillment tetap = Σ`shipped_qty` vs Σ`qty`; kebenaran finance = entitas invoice/payment. `status` hanya cermin agar UI & filter cepat, sehingga tak bisa berbohong terhadap fakta. **DISPUTE = flag overlay** (`is_disputed`) yang bisa menyala di tahap mana pun tanpa menggeser `status`.

### 1.2 Definisi status — **text + CHECK** (keputusan #5; bukan ENUM native, bukan status_catalog)
```sql
-- 12 tahap linear + CANCELLED terminal. DISPUTE = flag terpisah (is_disputed).
-- text + CHECK dipilih: mudah di-ALTER (tambah/ubah nilai) tanpa migrasi type, konsisten pola sp_status lama.
status text NOT NULL DEFAULT 'DRAFT'
  CHECK (status IN (
    'DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED','DIKIRIM',
    'SAMPAI','BTB_TERBIT','TERKIRIM_PENUH','INVOICED','SUBMITTED','LUNAS',
    'CANCELLED'
  ))
```
> **[IMPLEMENTED]** Kolom `status` + CHECK 12-tahap sudah live di `sp_orders`. ⚠️ **Urutan nilai dalam array CHECK = KOSMETIK** (daftar nilai sah, BUKAN rank). **Rank ditentukan urutan CASE di `sp_recompute_status`** → `BTB_TERBIT` dicek paling atas (**tertinggi, mengalahkan `TERKIRIM_PENUH`**). Array live sengaja tetap `…SAMPAI, BTB_TERBIT, TERKIRIM_PENUH…` (tak diubah — hanya kosmetik, tak memengaruhi perilaku).

### 1.3 Transisi sah (state machine)
```
 DRAFT ──(konfirmasi, MANUAL)──► CONFIRMED
 CONFIRMED ──(generate picking; stok cukup, AUTO)──► PICKING
 CONFIRMED ──(stok kurang, AUTO)──► MENUNGGU_STOK ──(stok masuk)──► PICKING
 PICKING ──(picking done + material packed, AUTO)──► PACKED
 PACKED ──(dispatch SJ pertama = in_transit, AUTO)──► DIKIRIM
 DIKIRIM ──(SJ delivered, AUTO)──► SAMPAI
 SAMPAI / DIKIRIM ──(Σshipped = Σqty, AUTO)──► TERKIRIM_PENUH
 SAMPAI / TERKIRIM_PENUH ──(BTB batch terbit, AUTO — RANK TERTINGGI, di ATAS TERKIRIM_PENUH)──► BTB_TERBIT
 BTB_TERBIT ──(invoice terbit; gate Σshipped=Σqty; FASE 4 planned)──► INVOICED
 INVOICED ──(submit ke Indomarco, MANUAL)──► SUBMITTED
 SUBMITTED ──(Σpayment ≥ total, AUTO)──► LUNAS
 (any non-terminal) ──(MANUAL)──► CANCELLED   [terminal]
 (any) ──(MANUAL, overlay)──► is_disputed = true/false  [tidak mengganti status]
```
- **AUTO** (via `sp_recompute_status`): PICKING, MENUNGGU_STOK, PACKED, DIKIRIM, SAMPAI, TERKIRIM_PENUH, **BTB_TERBIT (rank tertinggi)**, INVOICED, LUNAS.
- **MANUAL** (RPC eksplisit + audit): CONFIRMED, SUBMITTED, CANCELLED, set/clear DISPUTE.
- Partial: `status` = tahap **paling maju yang relevan**; detail per-batch ada di `delivery_notes`/`sp_btb`. `TERKIRIM_PENUH` hanya saat Σshipped = Σqty.

---

## 2. TABEL & KOLOM

Legenda: **[BARU]** · **[ADA]** (dipertahankan) · **[DEPRECATED]** (di-drop di akhir migrasi).

### 2.0 `dc_master` **[BARU]** — master DC (keputusan #9)
```sql
CREATE TABLE public.dc_master (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),             -- pemilik data (SOA)
  customer_id uuid REFERENCES accounts(id),                       -- NULL = DC umum; terisi = DC milik customer (mis. Indomarco)
  kode        text,                                               -- kode DC (opsional)
  nama        text NOT NULL,                                      -- nama DC, mis. 'DC JAKARTA 1'
  wilayah     text CHECK (wilayah IN ('Jawa','Sumatera','Sulawesi','Kalimantan','Bali & Nusa Tenggara','Lainnya')),
  alamat      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  CONSTRAINT dc_master_nama_unique UNIQUE (customer_id, nama)      -- unik per-customer (NULL customer_id = ruang umum)
);
```
**Manfaat:** donut "Jangkauan per Wilayah" (Indomarco) kini bisa mengambil `wilayah` **struktural** dari `dc_master`, menggantikan mapping `REGION_DC` hardcode di FE (`IndomarcoDashboardPage.jsx`). Seed `wilayah` dari mapping yang sudah disepakati (5 wilayah + Lainnya).

### 2.1 `sp_orders` **[BARU]** — header SP (1 baris per SP)
```sql
CREATE TABLE public.sp_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id),           -- [BARU] scoping (sp_items lama tak punya)
  customer_id    uuid NOT NULL REFERENCES accounts(id),            -- [ADA→FK]
  sp_no          text NOT NULL,                                    -- nomor SP dari customer (Indomarco)
  sp_date        date,
  dc_id          uuid NOT NULL REFERENCES dc_master(id),           -- [BARU FK] WAJIB (ganti dc teks bebas) — keputusan #9
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (...)),  -- [BARU] lihat §1.2
  is_disputed    boolean NOT NULL DEFAULT false,                   -- [BARU] overlay (keputusan #3)
  dispute_reason text, disputed_at timestamptz, disputed_by uuid,  -- [BARU]
  expired_date   date,                                             -- [ADA] kanonik (twin exp_date DIHAPUS)
  sp_category    text,                                             -- [ADA]
  external_url   text,                                             -- [ADA] link Drive
  notes          text,
  confirmed_at   timestamptz, confirmed_by uuid,                   -- [ADA]
  cancelled_at   timestamptz, cancelled_by uuid, cancel_reason text,-- [ADA]
  created_by     uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,                                      -- [BARU] soft-delete (AGENTS rule 13)
  CONSTRAINT sp_orders_no_unique UNIQUE (customer_id, sp_no)       -- [BARU] keputusan #1
);
```
Asumsi: **1 SP = 1 DC tujuan** (dc di header). Bila kelak perlu multi-DC per SP, `dc_id` bisa dipindah ke item — di luar scope MVP.
Kolom lama **DEPRECATED** (tak dipindah ke header): `dc` teks (→ `dc_id`), `exp_date` (twin), `btb_no_deprecated`, `inv`/`fp`/`submit`/`kirim`/`submit_date`/`email_status` (→ invoice), `shipped_qty` (→ item), `sp_status` lama (→ `status` 12-tahap).

### 2.2 `sp_order_items` **[BARU]** — baris SP
```sql
CREATE TABLE public.sp_order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sp_order_id   uuid NOT NULL REFERENCES sp_orders(id) ON DELETE CASCADE,  -- [BARU FK]
  product_id    uuid NOT NULL REFERENCES products(id),            -- [ADA→WAJIB] dropdown-only, tak boleh null
  product_name  text NOT NULL,  sku text NOT NULL DEFAULT '',      -- snapshot
  qty           integer NOT NULL CHECK (qty >= 1),                 -- dipesan
  shipped_qty   integer NOT NULL DEFAULT 0 CHECK (shipped_qty >= 0 AND shipped_qty <= qty), -- [ADA] AUTO-only (§4, keputusan #11)
  unit_price    numeric(18,2) NOT NULL DEFAULT 0,                  -- SNAPSHOT angka dari kategori terpilih (SUMBER KEBENARAN; immutable vs master) — keputusan #14
  price_category text CHECK (price_category IN ('semester','tahunan','project')),  -- [BARU] label kategori terpilih; NULL utk data legacy
  shipping_price numeric(18,2) NOT NULL DEFAULT 0,
  sla_days      integer, estimated_delivery_date date,            -- [ADA]
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
  -- outstanding = qty - shipped_qty → generated column / view (bukan disimpan)
);
-- outstanding integer GENERATED ALWAYS AS (qty - shipped_qty) STORED   -- opsional
```
`arrival_date` **pindah** ke level pengiriman (per batch, di `delivery_notes`), bukan per SP item.

**Harga = snapshot + label (keputusan #14):** saat create SP, `unit_price` **diisi otomatis** dari harga kategori terpilih di `products` (§2.7), lalu **dibekukan** (tak berubah walau master di-update kemudian) — inilah riwayat harga permanen. `price_category` hanya **penanda/label** untuk UI (semester/tahunan/project); **sumber kebenaran = `unit_price`**. User **tak boleh** mengetik angka manual; hanya memilih kategori yang **tersedia** (harga non-NULL) pada produk itu. Data legacy (708 baris) → `price_category` **NULL** (UI tampilkan "—/Legacy"), `unit_price` tetap apa adanya.

### 2.3 Pengiriman/batch — perluas `delivery_notes` **[ADA + ubah]** (keputusan #8: partial di level SJ)
```sql
ALTER TABLE public.delivery_notes
  ADD COLUMN sp_order_id  uuid REFERENCES sp_orders(id),          -- [BARU FK] ganti sp_no teks
  ADD COLUMN batch_seq    integer,                                -- [BARU] urutan batch per SP (1,2,3…)
  ADD COLUMN arrival_date date;                                   -- [BARU] tgl sampai (pindah dari sp_items)
-- delivery_notes.sp_no [DEPRECATED] dipertahankan sementara utk transisi lalu di-drop.
-- HAPUS guard "1 SJ aktif per picking" di generate_delivery_from_picking → izinkan N batch (partial).
```
```sql
ALTER TABLE public.delivery_note_items
  ADD COLUMN sp_order_item_id uuid REFERENCES sp_order_items(id) ON DELETE SET NULL; -- [BARU FK langsung ke item SP]
-- qty = jumlah dikirim di batch ini (boleh < outstanding item → PARTIAL, hanya di sini).
-- Guard RPC dispatch: qty <= (sp_order_items.qty - sp_order_items.shipped_qty).
```
`picking_lists`/`picking_list_items`/`picking_list_materials` **[ADA]** dipertahankan. **Picking tetap all-or-nothing** (keputusan #8): `qty_picked` = penuh/0, tak ada pick parsial; parsial dilakukan saat membuat Surat Jalan (pilih qty ≤ picked & ≤ outstanding).
```sql
ALTER TABLE public.picking_lists ADD COLUMN sp_order_id uuid REFERENCES sp_orders(id); -- ganti sp_no teks [DEPRECATED]
-- picking_list_items.sp_item_id [ADA] → repoint ke sp_order_items(id) saat migrasi (§5).
```
**Material packing [ADA]:** `picking_list_materials` tetap — stok material (kelas `Inventory`) terpisah dari produk jual (keputusan #9 lokal / rule material). Opsi: tambah `delivery_note_id` bila packing ingin per-batch.

**Field armada OPSIONAL (keputusan #16):** kolom `driver_name`, `driver_phone`, `vehicle_no`, `ship_date`, `total_koli`, `total_weight`, `destination_address` di `delivery_notes` **tetap NULLABLE** (di schema sekarang memang sudah nullable — **JANGAN** ditambah `NOT NULL`). SJ boleh dibuat dengan armada kosong dan diisi belakangan. **Guard `driver_name`+`vehicle_no` dipertahankan HANYA sebagai syarat DISPATCH** (di RPC `dispatch_delivery` / tombol Berangkatkan), **bukan** syarat pembuatan SJ — rekomendasi: barang keluar tanpa identitas armada berisiko, jadi guard dispatch tetap; `koli`/`weight`/`alamat` **tidak** dijadikan syarat apa pun.

### 2.4 BTB — `sp_btb` **[BARU]** (keputusan #4 & #7: qty saja, tanpa nilai pajak)
```sql
CREATE TABLE public.sp_btb (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id),
  sp_order_id      uuid NOT NULL REFERENCES sp_orders(id),         -- [BARU FK] ganti sp_no teks
  delivery_note_id uuid REFERENCES delivery_notes(id),            -- [BARU FK] BTB milik batch mana (nullable saat belum dipetakan)
  customer_id      uuid NOT NULL REFERENCES accounts(id),         -- utk unique per-customer
  btb_no           text NOT NULL,                                 -- nomor BTB dari customer
  btb_date         date,
  qty              integer CHECK (qty IS NULL OR qty >= 0),        -- [BARU] qty per batch — TANPA nilai pajak (keputusan #7)
  received_at      timestamptz, received_by uuid,
  remarks          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,                                    -- soft-delete (ganti hard-delete lama)
  CONSTRAINT sp_btb_no_unique UNIQUE (customer_id, btb_no)         -- [BARU] keputusan #1
);
```
`sp_btbs` **[DEPRECATED]** (dimigrasi lalu di-drop). Nilai DPP/PPN/PPh yang dulu di `ar_btbs` **pindah ke sisi invoice** (§2.5) — BTB = dokumen terima barang (qty), bukan tempat angka pajak.

### 2.5 Invoice, TTF, & pembayaran (keputusan #5/#6/#7/#11)
**Invoice = entitas** (`sp_invoices` + `sp_invoice_lines` + `sp_payments`). **TTF (`ar_ttfs`) DIPERTAHANKAN** sebagai dokumen transmittal, tertaut FK ke SP + invoice.
```sql
CREATE TABLE public.sp_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  sp_order_id   uuid NOT NULL REFERENCES sp_orders(id),
  invoice_no    text,           -- DIGENERATE SISTEM (keputusan #6), mis. 'INV/SOA/FIN/2026/0001' via increment_document_sequence
  faktur_no     text,           -- nomor faktur pajak
  invoice_date  date,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','issued','submitted','partial','paid','void')),
  submitted_at  timestamptz, submit_ref text,                     -- submit ke sistem Indomarco (MANUAL)
  total_dpp     numeric(18,2) NOT NULL DEFAULT 0,
  total_ppn     numeric(18,2) NOT NULL DEFAULT 0,
  total_amount  numeric(18,2) NOT NULL DEFAULT 0,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT sp_invoice_one_per_sp UNIQUE (sp_order_id)           -- keputusan #3-invoice: 1 SP → 1 invoice
);
-- Guard RPC create_invoice: hanya bila sum(shipped_qty)=sum(qty) FROM sp_order_items WHERE sp_order_id=... (Σterkirim=Σdipesan).
-- ⚠ CATATAN NOMOR INVOICE (keputusan #6): format `invoice_no` WAJIB disepakati SEKALI di awal bersama Finance (El)
--   agar tidak bentrok dengan penomoran pelaporan pajak (faktur) yang berjalan di luar sistem.
--   Rekomendasi pakai increment_document_sequence(company, 'INV', 'FIN', year, ...) → {DOC}/{ENTITY}/{DEPT}/{YYYY}/{SEQ}.

CREATE TABLE public.sp_invoice_lines (                            -- detail per item/BTB (nilai pajak di sini, bukan di BTB)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES sp_invoices(id) ON DELETE CASCADE,
  sp_order_item_id uuid REFERENCES sp_order_items(id),
  btb_id     uuid REFERENCES sp_btb(id),                          -- kaitkan baris invoice ke BTB batch
  dpp numeric(18,2) NOT NULL DEFAULT 0, ppn numeric(18,2) NOT NULL DEFAULT 0,
  qty integer, position integer
);

CREATE TABLE public.sp_payments (                                 -- ganti kolom payment/pph di ar_btbs lama
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES sp_invoices(id) ON DELETE CASCADE,
  payment_date date, amount numeric(18,2) NOT NULL, pph numeric(18,2) NOT NULL DEFAULT 0,
  reference text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
-- LUNAS derived: sum(sp_payments.amount) >= sp_invoices.total_amount.
```
**TTF dipertahankan (keputusan #11):**
```sql
-- ar_ttfs [ADA — DIPERTAHANKAN sebagai dokumen transmittal], hanya ganti link teks → FK:
ALTER TABLE public.ar_ttfs
  ADD COLUMN sp_order_id uuid REFERENCES sp_orders(id),           -- [BARU FK] ganti no_sp teks
  ADD COLUMN invoice_id  uuid REFERENCES sp_invoices(id);         -- [BARU FK] TTF merujuk invoice yg ditransmit (ganti no_inv teks)
-- ar_ttfs tetap menyimpan: no_ttf, tanggal_ttf, tanggal_menerima, tgl_pembayaran(→ opsional, payment kanonik di sp_payments), notes.
-- ar_btbs [DEPRECATED]: nilai (dpp_ppn/pph/payment) pindah ke sp_invoice_lines/sp_payments; BTB dokumen → sp_btb.
```
Ringkas: **`ar_ttfs` = lembar transmittal** (bukti serah faktur+BTB ke Indomarco) yang menunjuk **satu invoice** (`invoice_id`) & **satu SP** (`sp_order_id`); nilai uang tinggal di invoice/payment. `ar_btbs` di-pensiun (nilainya bermigrasi).

### 2.6 Stok **[ADA]** — `stock_ledger` (append-only) + `stock_summary` (**VIEW**, keputusan #12)
`stock_summary` tetap **VIEW live** (selalu konsisten). Perubahan hanya perilaku RPC: tutup **reserved nyangkut** (S-1) + guard negatif (S-2) (§4.3).

### 2.7 Master produk — 3 kategori harga **[ADA + tambah kolom]** (keputusan #13)
`products` **SUDAH punya** `default_price numeric(18,2)` (harga tunggal) + tabel riwayat `product_price_history` (old/new_price, changed_at, contract_no, valid_from/until) + RPC `bulk_update_product_prices`. **JANGAN gandakan** — **perluas**:
```sql
ALTER TABLE public.products
  ADD COLUMN price_semester numeric(18,2),   -- [BARU] boleh NULL
  ADD COLUMN price_tahunan  numeric(18,2),   -- [BARU] boleh NULL
  ADD COLUMN price_project  numeric(18,2);   -- [BARU] boleh NULL — 1 produk bisa cuma punya 1 dari 3
-- `default_price` [ADA] DIPERTAHANKAN sbg harga umum/fallback (ProductPicker non-SP, modul lain).
-- Riwayat per-kategori → PERLUAS product_price_history:
ALTER TABLE public.product_price_history
  ADD COLUMN price_category text;            -- [BARU] 'semester'|'tahunan'|'project'|'default'(existing rows)
-- RPC bulk_update_product_prices DIPERLUAS: terima p_category → UPDATE kolom yang benar + log dgn price_category.
```
**Rekomendasi: 3 kolom di `products` (bukan tabel `product_prices` terpisah).**
- **Alasan:** (1) snapshot cepat saat Input SP tanpa join (baca kolom sesuai kategori); (2) "boleh kosong" = NULL natural; (3) **reuse** infrastruktur harga yang sudah ada (`product_price_history` + trigger + RPC bulk) hanya dengan menambah tag `price_category`; (4) kategori tetap (3) → kolom cukup.
- **Alternatif (didokumentasikan, untuk skala besar):** tabel `product_prices(product_id, category, price, valid_from, valid_until, is_active)` — lebih fleksibel bila kategori bertambah / butuh periode berlaku tumpang tindih, tapi menambah join di jalur Input SP dan lebih banyak bagian bergerak. Tidak dipilih untuk MVP.
- **Validasi jual via SP:** produk bisa dipilih di Input SP hanya bila **≥1** dari 3 harga terisi (dropdown kategori menampilkan yang non-NULL saja).

### 2.8 Audit log SP — `sp_audit_log` **[BARU]** (keputusan #15 — mengaktifkan tab History)
```sql
CREATE TABLE public.sp_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id),
  sp_order_id      uuid NOT NULL REFERENCES sp_orders(id) ON DELETE CASCADE,     -- timeline per SP (tab History)
  sp_order_item_id uuid REFERENCES sp_order_items(id) ON DELETE SET NULL,        -- opsional (event level item)
  action           text NOT NULL,   -- 'created','status_changed','item_added','item_edited','item_removed',
                                     -- 'confirmed','picking_generated','dispatched','delivered','btb_added',
                                     -- 'invoice_issued','submitted','payment_added','cancelled','disputed', dst
  actor_id         uuid,            -- auth.uid()
  detail           jsonb,           -- {"field":...,"old":...,"new":...} mis. {"from":"CONFIRMED","to":"PICKING"}
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sp_audit_log_sp ON public.sp_audit_log (sp_order_id, created_at DESC);
```
**Mekanisme pengisian — REKOMENDASI hybrid, trigger-first (tahan bocor):**
- **Trigger DB** (leak-proof, menangkap SEMUA perubahan apa pun jalurnya):
  - `AFTER UPDATE OF status ON sp_orders` → `status_changed` `{from,to}` → **tiap transisi 12-tahap tercatat** (konsisten model status §1).
  - `AFTER UPDATE OF is_disputed ON sp_orders` → `disputed` `{value,reason}`.
  - `AFTER INSERT/UPDATE/DELETE ON sp_order_items` → `item_added/item_edited/item_removed` + diff jsonb.
- **Insert dari RPC** (untuk event lintas-tabel yang butuh konteks semantik): `dispatched` (di `dispatch_delivery`), `btb_added` (RPC BTB), `invoice_issued` (`create_invoice`), `payment_added` — ditulis eksplisit (`actor_id = auth.uid()`).
- **Alasan trigger-first:** perubahan status/field tetap tercatat walau ditulis dari jalur tak terduga (mis. SQL langsung / RPC lupa log). RPC-insert hanya melengkapi event yang tak terwakili oleh perubahan kolom tunggal.
- **Relasi ke `audit_logs` umum [ADA]:** `audit_logs` (lintas-modul, compliance) **tetap**; `sp_audit_log` khusus **timeline per-SP** (FK + index murah untuk tab History). Alternatif "pakai `audit_logs` entity_type='sp_order'" ditolak demi query History yang bersih & ber-FK.
- **RLS:** read company-scoped (operations+); tulis via SECURITY DEFINER (trigger/RPC).

---

## 3. RELASI & CONSTRAINT

### 3.1 FK menggantikan link teks
| Lama (teks) | Baru (FK) |
|---|---|
| `sp_items.sp_no` (ulang per baris) | `sp_order_items.sp_order_id → sp_orders.id` |
| `sp_items.dc` (teks bebas) | `sp_orders.dc_id → dc_master.id` |
| `picking_lists.sp_no` | `picking_lists.sp_order_id → sp_orders.id` |
| `delivery_notes.sp_no` | `delivery_notes.sp_order_id → sp_orders.id` |
| `delivery_note_items` → sp (via picking_list_item) | +`delivery_note_items.sp_order_item_id → sp_order_items.id` (langsung) |
| `sp_btbs.sp_no` | `sp_btb.sp_order_id → sp_orders.id` (+`delivery_note_id`) |
| `ar_ttfs.no_sp` | `ar_ttfs.sp_order_id → sp_orders.id` **(TTF dipertahankan)** |
| `ar_ttfs.no_inv` | `ar_ttfs.invoice_id → sp_invoices.id` |
| `ar_btbs.ttf_id` (+nilai) | `sp_invoice_lines.invoice_id` / `sp_payments.invoice_id` (ar_btbs deprecated) |

### 3.2 Unique constraint nomor SP & BTB — **TERKUNCI: per-customer** (keputusan #1)
```sql
-- SP:  UNIQUE (customer_id, sp_no)     -- nomor SP milik namespace customer (Indomarco)
-- BTB: UNIQUE (customer_id, btb_no)
-- DC:  UNIQUE (customer_id, nama)      -- dc_master
```
**Alasan:** nomor SP/BTB berasal dari **customer**, jadi keunikannya wajar per-customer (dua customer berbeda boleh kebetulan bernomor sama; global-unique justru bisa memblok input sah). Bila kelak butuh lebih ketat: `UNIQUE (company_id, customer_id, sp_no)`.

### 3.3 Diagram relasi (teks)
```
dc_master ─(dc_id)─┐
                   ▼
accounts(customer) ─1:N─► sp_orders ─1:N─► sp_order_items ──(FK)──┐
        │                    │  ▲ status (derived)                 │
        │                    ▼                                     │
        │            sp_btb (N per SP, qty saja)                   │
        │              │  └─FK─► delivery_notes (batch, N per SP)  │
        │              │              │ 1:N                        │
        │              │              ▼                            │
        │              │        delivery_note_items ─FK─► sp_order_items (shipped_qty bridge, dispatch)
        │              │              ▲                            │
        │       picking_lists ─1:N─► picking_list_items ─FK─► sp_order_items
        │              └─1:N─► picking_list_materials (stok material terpisah)
        │
        └───► sp_invoices (1:1 sp_order) ─1:N─► sp_invoice_lines ─FK─► sp_order_items / sp_btb
                    ▲     └─1:N─► sp_payments
                    │
              ar_ttfs (TTF transmittal, DIPERTAHANKAN) ──FK──► sp_orders + sp_invoices

sp_orders ─1:N─► sp_audit_log (timeline History: status_changed/dispatched/btb_added/invoice_issued/…)
products (price_semester|price_tahunan|price_project) ──snapshot saat create──► sp_order_items.unit_price (+price_category label)

stock_ledger (append-only) ──► stock_summary (VIEW: on_hand / reserved / available)
   ▲ reserved (generate picking) · unreserved (cancel/dispatch) · outbound (dispatch/material) · inbound (penerimaan/reversal)
```

---

## 4. JEMBATAN STOK & shipped_qty

### 4.1 Auto-isi `shipped_qty` — **TERKUNCI: RPC `dispatch_delivery`, titik naik = in_transit** (keputusan #11)
`shipped_qty` **hanya** naik dari tombol **Berangkatkan** (dispatch). Tidak dari form/manual, tidak dari trigger lain. Jalur FK sudah tersedia (`delivery_note_items.sp_order_item_id`).
```sql
-- USULAN tambahan di dalam dispatch_delivery(p_delivery_note_id), SETELAH insert outbound & set status='in_transit':
UPDATE sp_order_items s
   SET shipped_qty = s.shipped_qty + dni.qty, updated_at = now()
  FROM delivery_note_items dni
 WHERE dni.delivery_note_id = p_delivery_note_id
   AND dni.sp_order_item_id = s.id
   AND dni.qty > 0;
-- CHECK (shipped_qty <= qty) di tabel mencegah over-ship. Guard tambahan di RPC: qty <= outstanding sebelum posting.
PERFORM sp_recompute_status( (SELECT sp_order_id FROM delivery_notes WHERE id = p_delivery_note_id) );
```
Reversal: di `cancel_delivery` untuk DN in_transit/delivered → `shipped_qty = shipped_qty - dni.qty` + `sp_recompute_status`.
**Mekanisme final: RPC saja** (tersurat & mudah diaudit); tanpa trigger. `EditItemModal`/form **tak pernah** menulis `shipped_qty` (read-only).

### 4.2 Fungsi status recompute (headline 12-tahap dari fakta)
```sql
CREATE OR REPLACE FUNCTION sp_recompute_status(p_sp uuid) RETURNS void AS $$
DECLARE v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool;
        v_has_btb bool; v_has_invoice bool; v_submitted bool; v_paid bool;
BEGIN
  SELECT sum(qty), sum(shipped_qty) INTO v_ordered, v_shipped FROM sp_order_items WHERE sp_order_id=p_sp;
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE sp_order_id=p_sp AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE sp_order_id=p_sp AND status='delivered');
  v_has_btb       := EXISTS(SELECT 1 FROM sp_btb        WHERE sp_order_id=p_sp AND deleted_at IS NULL);
  v_has_invoice   := EXISTS(SELECT 1 FROM sp_invoices   WHERE sp_order_id=p_sp AND status <> 'void');
  v_submitted     := EXISTS(SELECT 1 FROM sp_invoices   WHERE sp_order_id=p_sp AND status='submitted');
  SELECT COALESCE(sum(p.amount),0) >= COALESCE(max(i.total_amount),0)
    INTO v_paid FROM sp_invoices i LEFT JOIN sp_payments p ON p.invoice_id=i.id WHERE i.sp_order_id=p_sp;

  UPDATE sp_orders SET status = CASE
     WHEN v_paid AND v_has_invoice THEN 'LUNAS'
     WHEN v_submitted              THEN 'SUBMITTED'
     WHEN v_has_invoice            THEN 'INVOICED'
     WHEN v_has_btb                THEN 'BTB_TERBIT'                        -- RANK TERTINGGI (di atas TERKIRIM_PENUH)
     WHEN v_ordered IS NOT NULL AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
     WHEN v_has_delivered          THEN 'SAMPAI'
     WHEN v_has_dispatch           THEN 'DIKIRIM'
     ELSE status END,               -- tahap ≤ PACKED dikelola RPC picking/confirm
     updated_at = now()
   WHERE id=p_sp AND status <> 'CANCELLED';
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```
(PACKED/PICKING/MENUNGGU_STOK di-set oleh RPC picking; CONFIRMED/CANCELLED/SUBMITTED manual; INVOICED/LUNAS via recompute setelah event invoice/payment.)

> **[IMPLEMENTED]** `sp_recompute_status` sudah LIVE (FASE 1-3) dengan **`BTB_TERBIT` sebagai cabang CASE paling atas** (rank tertinggi, mengalahkan `TERKIRIM_PENUH`). ⚠️ **Beda dari draf di atas:** versi live keyed **`(customer_id, sp_no)`** (bukan `p_sp uuid`), baca `sp_items.shipped_qty` (masa transisi dua generasi), dan **guard** `IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS')` (INVOICED/SUBMITTED/LUNAS = FASE 4-5, belum dibangun → cabang finance di draf ini masih rancangan). Signature persis: `docs/Governance/03_DATA_MODEL §5` + `schema_snapshot.sql`.

### 4.3 Perbaikan integritas stok (S-1, S-2)
- **Reserved nyangkut:** `cancel_delivery` untuk DN `draft` → lepaskan reservasi picking terkait (`unreserved`); tambah RPC `release_picking_reservation(picking_id)` untuk picking `done` yang diterlantarkan.
- **Guard negatif/over-deduct:** CHECK `shipped_qty <= qty` (§2.2) + validasi `qty <= outstanding` di `dispatch_delivery`; `SELECT … FOR UPDATE` baris stok saat reserve untuk cegah race.

---

## 5. RENCANA MIGRASI (non-destruktif, split header/items penuh SEKARANG — keputusan #2)

> Prinsip: **buat baru berdampingan → backfill → deploy kode baca-baru → tambah constraint setelah data bersih → drop lama paling akhir.** Jangan drop kolom sebelum kode berhenti membacanya (CLAUDE.md). **Tiap fase WAJIB diverifikasi ulang** (branch + staging). Data existing yang harus utuh: 708 baris `sp_items` Indomarco, picking/SJ/stok, `sp_btbs`, `ar_ttfs`/`ar_btbs`.

| Fase | Langkah | Risiko |
|---|---|---|
| M0 | Snapshot `pg_dump`; branch `feat/sp-schema`. | Rendah |
| **M1** | **`CREATE TABLE dc_master`** (+RLS+GRANT). **Backfill** dari `DISTINCT dc` di `sp_items` → 1 baris per DC; set `wilayah` dari mapping DC→wilayah yang sudah disepakati (5+Lainnya); `customer_id`=Indomarco utk DC Indomarco. | **Sedang** — nama DC bervariasi; mapping wilayah perlu dicek |
| M2 | `CREATE TABLE` tabel baru (`sp_orders` [dc_id nullable dulu], `sp_order_items`, `sp_btb`, `sp_invoices`, `sp_invoice_lines`, `sp_payments`) **tanpa** unique/FK strict; tambah kolom FK nullable di `picking_lists`/`delivery_notes`/`delivery_note_items`; tambah `ar_ttfs.sp_order_id`/`invoice_id`. (+RLS+GRANT tiap tabel.) | Rendah (aditif) |
| M3 | **Backfill header:** `INSERT INTO sp_orders` dari `DISTINCT sp_no` di `sp_items` (header dari baris pertama per sp_no; `company_id`=SOA; `customer_id`; **`dc_id`** di-resolve dari `dc_master` via teks dc). Map `sp_no → sp_orders.id`. | **Sedang** — sp_no dgn header beda antar baris & dc tak ter-mapping harus direkonsiliasi |
| M4 | **Backfill item:** `INSERT INTO sp_order_items` dari tiap baris `sp_items` (link `sp_order_id`); **bawa `shipped_qty` apa adanya**. Map `old sp_items.id → sp_order_items.id`. | Sedang |
| M5 | Repoint gudang: `UPDATE picking_lists.sp_order_id`, `delivery_notes.sp_order_id`, `picking_list_items.sp_item_id`→new, `delivery_note_items.sp_order_item_id` via map. | **Sedang** — map old→new harus lengkap |
| M6 | **Backfill BTB:** `INSERT INTO sp_btb` dari `sp_btbs` (sp_no→sp_order_id; `qty`=NULL utk historis; `customer_id` dari sp_orders). | Sedang (qty historis kosong) |
| M7 | **Backfill invoice/TTF/payment:** `ar_ttfs`→`sp_invoices` (via no_sp→sp_order_id, no_inv→invoice_no); `ar_btbs`(nilai)→`sp_invoice_lines`/`sp_payments`. **Set FK `ar_ttfs.sp_order_id`/`invoice_id`** (TTF **dipertahankan**, bukan di-drop). | Sedang |
| M8 | Map `status` lama→baru (`draft→DRAFT`,`confirmed→CONFIRMED`,`cancelled→CANCELLED`), lalu `sp_recompute_status` per SP untuk naik ke tahap sesuai fakta backfilled. | Sedang |
| M9 | **Deploy kode** baca tabel baru (UI + db.js); tulis-ganda ke lama bila perlu; verifikasi staging. | **Tinggi** (perilaku) |
| M10 | **Dedupe** `sp_no`/`btb_no`/`dc_master.nama` bentrok (peninggalan `Date.now()`/manual/import) + reconcile orphan (picking/DN/BTB/TTF tanpa parent, dc tak ter-mapping). | **TINGGI** — perlu keputusan bisnis utk duplikat |
| M11 | `ALTER TABLE … ADD CONSTRAINT` semua FK + UNIQUE + CHECK; jadikan `sp_orders.dc_id` **NOT NULL**; `shipped_qty<=qty`. | Tinggi (gagal bila data belum bersih) |
| M12 | Ganti RPC: `dispatch_delivery`(+bridge shipped_qty & recompute, titik in_transit), hapus guard "1 SJ aktif", `generate_delivery_from_picking`(partial qty di SJ), `create_invoice`(guard Σshipped=Σqty + generate invoice_no), `cancel_delivery`(release reservation). | Tinggi |
| M13 | Hentikan tulis ke lama; **drop** `exp_date`(twin), flag `inv/fp/submit/kirim/...`, tabel `sp_items`/`sp_btbs`/**`ar_btbs`** **paling akhir** setelah verifikasi produksi. **`ar_ttfs` TIDAK di-drop** (dipertahankan). | Tinggi (irreversible) |

**Fase tambahan (kebutuhan #13–16)** — slot di antara fase inti (tandai ⤷ posisi):
| Fase | Langkah | Slot | Risiko |
|---|---|---|---|
| P13 | `ALTER products ADD price_semester/tahunan/project` (nullable) + `product_price_history ADD price_category`; perluas RPC `bulk_update_product_prices` (param kategori + log). | ⤷ sekitar M2 (aditif) | Rendah |
| P14 | `ALTER sp_order_items ADD price_category`; backfill legacy = **NULL** (708 baris); `unit_price` tetap apa adanya (snapshot). | ⤷ setelah M4 | Rendah |
| P15 | `CREATE TABLE sp_audit_log` (+idx+RLS+GRANT) + **trigger** status/is_disputed/item + insert di RPC (dispatch/btb/invoice/payment). Opsional: seed 1 baris `migrated` per SP untuk baseline History. | ⤷ setelah tabel baru ada (M2) & saat swap RPC (M12) | **Sedang** — trigger + RPC harus lengkap agar log tak bocor |
| P16 | `delivery_notes`: **PASTIKAN** armada tetap nullable (JANGAN `ALTER … NOT NULL`); guard `driver`+`vehicle` hanya di RPC `dispatch_delivery` (bukan create SJ). | ⤷ bagian M12 | Rendah |

**RLS (WAJIB, diterapkan SEKARANG — keputusan #10):** tiap tabel baru & tabel alur diberi policy **company-scoped + role-aware** (bukan `USING(true)` — AUDIT_E2E T-1). **Tanpa role gudang**: aksi operasional (create SP, picking, surat jalan, BTB) di-gate ke role **`operations`** (+ manager/atas + `is_super_admin()` bypass); finance (invoice/payment/TTF) ke **`finance`/`finance_controller`**. Pola:
```sql
-- Contoh pola (USULAN) — company-scoped read, role-aware write:
ALTER TABLE public.sp_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_orders_read   ON public.sp_orders FOR SELECT USING (is_super_admin() OR company_id = get_user_company_id());
CREATE POLICY sp_orders_write  ON public.sp_orders FOR ALL
  USING      (is_super_admin() OR (company_id = get_user_company_id() AND has_role_in('operations','manager','gm','ceo','admin')))
  WITH CHECK (is_super_admin() OR (company_id = get_user_company_id() AND has_role_in('operations','manager','gm','ceo','admin')));
-- (finance tables: ganti daftar role ke 'finance','finance_controller', dst.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_orders TO authenticated;  -- CLI tak auto-grant (CLAUDE.md)
```
Verifikasi tiap `CREATE POLICY` (**"Success" tak menjamin policy terbuat**):
```sql
SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies
WHERE tablename IN ('dc_master','sp_orders','sp_order_items','sp_btb','sp_invoices','sp_invoice_lines','sp_payments','ar_ttfs','sp_audit_log');
SELECT tablename, count(*) FROM pg_policies GROUP BY tablename;   -- bandingkan dgn jumlah policy yg diharapkan per tabel
```

---

## 6. DAMPAK KE UI (dari AUDIT_UI.md)

| Komponen | Aksi |
|---|---|
| `InputSPPage` | **Pertahankan** → satu-satunya create; tulis `sp_orders`+`sp_order_items`; `sp_no` dari customer + **cek unique per-customer**; **`dc` WAJIB** (dropdown dari `dc_master`); **dropdown "Kategori Harga"** per item (hanya kategori yg harganya non-NULL di produk) → `unit_price` auto-snapshot + `price_category`; **tak ada input angka manual**. |
| `SalesOrderDetailPage` / `EditItemModal` | **Pertahankan** utk edit item; **buang** field `shipped_qty` (read-only, diisi dispatch) & toggle finance (pindah ke Invoice); tampilkan **label kategori harga** per item (badge semester/tahunan/project; "Legacy" bila NULL); **tab History AKTIF** dari `sp_audit_log` (timeline transisi status + event). |
| Bulk Edit Harga (`BulkEditPricePage`) | **Sesuaikan** → update **per kategori** (semester/tahunan/project), bukan hanya `default_price`; RPC `bulk_update_product_prices` diperluas (param kategori) + riwayat per kategori. |
| **`FormModal` (mega, App.jsx)** | **Pensiunkan** — hentikan create/edit; hilangkan `sp_no` manual & shipped_qty. |
| **`ShipmentModal` (App.jsx)** | **Pensiunkan** — `shipped_qty` tak lagi manual; ganti alur Surat Jalan (`delivery_notes`, N batch). |
| **`FinanceModal` (App.jsx)** | **Pensiunkan** — flag `inv/fp/submit/kirim` → entitas `sp_invoices`/`sp_payments`. |
| **`InputPage` + `ImportModal` (legacy)** | **Pensiunkan/refactor** — import CSV lewat validasi InputSPPage + resolusi `dc_id`. |
| `SalesOrderPage` (Manifest) | Status pill dari `sp_orders.status` (12 tahap); tab mengikuti status baru (+CONFIRMED/DIKIRIM). |
| Detail SP: tombol stub "Manifest"/"Shipment"/"Finance"/"+Tambah Shipment" | **Hapus** (sukses palsu — AUDIT_UI U-4). |
| BTB (Detail SP) | Ganti ke `sp_btb` (qty + batch + unique per-customer). |
| Picking / Surat Jalan | Ke `sp_order_id`/`sp_order_item_id`; picking all-or-nothing; Surat Jalan **N batch + qty parsial**; dispatch menaikkan `shipped_qty` & status. **Field armada opsional** saat buat SJ (driver/plat/koli/berat boleh kosong, isi belakangan); tombol **Berangkatkan** tetap minta driver+vehicle. |
| `ProductDetailPage` / master produk | Tambah input **3 kategori harga** (semester/tahunan/project, boleh kosong) + tampil riwayat per kategori. |
| **Halaman baru** | **Invoice** (1/SP, guard terkirim penuh, nomor auto) + **Payments** + **TTF** (transmittal, dipertahankan) + admin **Master DC** (`dc_master`, kelola wilayah). |
| `IndomarcoDashboardPage` (donut wilayah) | Ganti mapping `REGION_DC` hardcode → ambil `wilayah` dari `dc_master` (join via `dc_id`). |

---

## KEPUTUSAN FINAL (TERKUNCI)

| # | Keputusan | Konsekuensi desain |
|---|---|---|
| 1 | **Unik per-customer**: `UNIQUE(customer_id, sp_no)` & `UNIQUE(customer_id, btb_no)` | Namespace nomor milik customer; dedupe wajib sebelum constraint (M10). |
| 2 | **Split header/items SEKARANG** (`sp_orders`+`sp_order_items`) | Migrasi penuh M3–M5; tiap langkah **diverifikasi ulang saat eksekusi**. |
| 3 | **DISPUTE = flag overlay** (`is_disputed`) | Bukan nilai `status`; bisa menyala di tahap mana pun, tak menggeser tahap. |
| 4 | **Bridge shipped_qty hanya dari dispatch**, di RPC `dispatch_delivery`, titik **in_transit** | Form tak pernah tulis `shipped_qty` (read-only); reversal di cancel. Tanpa trigger. |
| 5 | **Status = text + CHECK** | Mudah di-ALTER; tanpa ENUM native / status_catalog. |
| 6 | **Nomor invoice digenerate sistem** (`INV/SOA/…`) | Pakai `increment_document_sequence`; **format wajib disepakati sekali dgn Finance/El** agar tak bentrok pelaporan pajak. |
| 7 | **BTB qty saja, tanpa nilai pajak** | DPP/PPN/PPh pindah ke `sp_invoice_lines`/`sp_payments`. |
| 8 | **Partial hanya di Surat Jalan**; picking all-or-nothing | 1 SP → N `delivery_notes`; guard "1 SJ aktif" dihapus; qty SJ ≤ outstanding. |
| 9 | **`dc` WAJIB + master `dc_master`** (dc_id FK) | dc teks → dc_id; donut wilayah Indomarco struktural (bukan hardcode FE). |
| 10 | **RLS company/role-aware SEKARANG; tanpa role gudang** | Semua tabel alur di-scope; operasional = role `operations`; verifikasi `pg_policies`. |
| 11 | **TTF (`ar_ttfs`) dipertahankan** sebagai transmittal | Repoint `no_sp`/`no_inv` → FK `sp_order_id`/`invoice_id`; **tidak di-drop**; `ar_btbs` di-pensiun (nilai pindah). |
| 12 | **`stock_summary` tetap VIEW** | Selalu konsisten; tanpa materialized/refresh. |
| 13 | **3 kategori harga** (`price_semester/tahunan/project`, NULL boleh) di `products` | Perluas `default_price`+`product_price_history`+RPC bulk (bukan tabel baru); ≥1 harga utk bisa dijual via SP. |
| 14 | **Input SP pilih kategori; `unit_price`=snapshot angka + `price_category`=label** | Harga AUTO dari kategori (tak manual); SP lama tak berubah walau master di-update; legacy `price_category`=NULL. |
| 15 | **Audit log SP dedicated `sp_audit_log`, via trigger (tahan bocor) + RPC** | Tab History aktif; tiap transisi status 12-tahap tercatat; koeksis dgn `audit_logs` umum. |
| 16 | **Field armada SJ opsional; guard driver+vehicle hanya saat DISPATCH** | `delivery_notes` armada tetap nullable; pembuatan SJ tak dipaksa; koli/berat/alamat tak jadi syarat. |

---

## RINGKASAN PERUBAHAN DARI DRAFT (akibat 12 keputusan)
- **BARU: tabel master DC `dc_master`** (+`wilayah`) dan **`sp_orders.dc_id` FK WAJIB** menggantikan `dc` teks bebas (keputusan #9) — plus fase migrasi M1 (create+backfill wilayah) dan dampak ke donut Indomarco (mapping struktural, bukan hardcode).
- **TTF `ar_ttfs` DIPERTAHANKAN** (keputusan #11): tidak lagi "DEPRECATED"; direvisi jadi dokumen transmittal ber-FK ke `sp_orders`+`sp_invoices`; hanya `ar_btbs` yang di-pensiun (nilai → invoice/payment). Migrasi M7 & M13 disesuaikan (TTF tak di-drop).
- **Semua bagian "KEPUTUSAN TERBUKA" dihapus** → diganti tabel **"KEPUTUSAN FINAL (TERKUNCI)"**; ketidakpastian di §3.2 (unik), §4.1 (bridge in_transit, RPC-only), §1.2 (text+CHECK) dikunci.
- **Nomor invoice = generate sistem** + catatan penyelarasan format dengan Finance/El (keputusan #6).
- **BTB qty-only** ditegaskan (keputusan #7); **partial hanya di SJ, picking all-or-nothing** ditegaskan (keputusan #8).
- **RLS diterapkan sekarang, tanpa role gudang** — ditambah pola policy company/role-scoped + verifikasi `pg_policies` (keputusan #10).
- Rencana migrasi bertambah jadi **M0–M13** (dc_master di depan; TTF repoint; dc_id NOT NULL saat constraint).

### Revisi 2 (kebutuhan #13–16) — yang berubah dari versi terkunci sebelumnya
- **Kategori harga produk (#13):** `products` **DIPERLUAS** dengan `price_semester/price_tahunan/price_project` (nullable) — bukan tabel baru; `default_price` [ADA] tetap; `product_price_history` +`price_category` dan RPC bulk diperluas. (Diverifikasi: kolom ini **belum ada** di schema — tak menggandakan.)
- **Snapshot harga di SP (#14):** `sp_order_items` +`price_category` (label); `unit_price` ditegaskan sebagai **snapshot angka permanen** (sumber kebenaran), harga AUTO dari kategori, tanpa input manual; legacy `price_category`=NULL.
- **Audit log (#15):** tabel **baru `sp_audit_log`** (FK `sp_order_id`, `action`, `actor_id`, `detail` jsonb) + mekanisme **trigger-first** (status/is_disputed/item) + RPC-insert (dispatch/btb/invoice/payment) → **tab History Detail SP aktif**; koeksis dgn `audit_logs` umum yang sudah ada.
- **Field SJ opsional (#16):** ditegaskan armada `delivery_notes` **tetap nullable** (tak ada `NOT NULL` baru); guard driver+vehicle **hanya syarat dispatch**, bukan pembuatan SJ.
- **Migrasi:** +fase **P13–P16** (kolom harga & history; `price_category`; `sp_audit_log`+trigger; penegasan SJ nullable) dengan slot & risiko.
- **Dampak UI:** Input SP (dropdown kategori harga tersedia), Detail SP (label kategori + tab History aktif), `BulkEditPricePage` (update per kategori), `ProductDetailPage` (3 kolom harga), Surat Jalan (armada opsional).

*Dokumen ini RANCANGAN FINAL TERKUNCI (rev.2) — semua SQL usulan; belum dijalankan. Siap dijadikan dasar penyusunan migration SQL final (per fase, di branch + staging).*
