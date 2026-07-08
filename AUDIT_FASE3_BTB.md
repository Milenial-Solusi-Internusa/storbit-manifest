# AUDIT + RANCANGAN — FASE 3: BTB_TERBIT (Bukti Terima Barang)

> Mode: **AUDIT + RANCANGAN, BUKAN EKSEKUSI.** Tidak ada file kode/DB yang diubah. Semua draf SQL di bawah **usulan**, belum final, belum dijalankan.
> Sumber kebenaran DB: `supabase/schema_snapshot.sql` (snapshot terbaru di repo). Bukti dikutip `file:line`.
> Tanggal audit: 2026-07-08. Acuan: `DESIGN_SP_SCHEMA.md`, `AUDIT_MESIN_STATUS.md`, `AUDIT_FASE2_PENGIRIMAN.md`.

---

## RINGKASAN

Kondisi BTB **terbelah dua generasi**: tabel **`sp_btbs` (legacy)** — tipis (`sp_no`/`btb_no`/`remarks`), RLS permisif `USING(true)`, dan **satu-satunya yang HIDUP** (ditulis dari InputSPPage `bulkInsertSpBtbs` + dibaca/kelola dari Detail SP "BTB Numbers"); sedangkan tabel **`sp_btb` (Fase 0, baru)** — entitas benar (FK `sp_order_id`/`delivery_note_id`/`customer_id`, `qty`, `btb_date`, RLS company/role-scoped, `UNIQUE(customer_id,btb_no)`) — **terisi backfill 186 baris tapi DORMANT**: **nol penulis live, nol pembaca FE** (`grep from('sp_btb')` di `src/` = 0). Di mesin status, `sp_orders.status` CHECK sudah punya `BTB_TERBIT` ([schema:4085](supabase/schema_snapshot.sql#L4085)) dan `sp_recompute_status` **membekukan** BTB_TERBIT di guard-nya ([schema:1094](supabase/schema_snapshot.sql#L1094)) **tetapi CASE recompute tak pernah MEN-SET BTB_TERBIT** ([schema:1109-1117](supabase/schema_snapshot.sql#L1109)) — jadi tahap ini **mustahil tercapai** sekarang; persis yang ditandai "butuh penulis baru" di `AUDIT_MESIN_STATUS.md:28`. Menurut DESIGN, BTB_TERBIT duduk **antara SAMPAI dan TERKIRIM_PENUH** (enum rank 8 < 9), dipicu AUTO oleh "ada `sp_btb` non-deleted". **FASE 3 = tiga hal:** (1) alihkan pembuatan BTB baru dari `sp_btbs` → `sp_btb` (via RPC `sp_issue_btb` yang isi fakta + panggil recompute), (2) perluas `sp_recompute_status` mengenali fakta `sp_btb`, (3) UI Detail SP menulis/membaca `sp_btb`. Yang **sudah ada**: tabel `sp_btb` lengkap + RLS + `v_id` (sp_order_id) sudah tersedia di dalam recompute. Yang **belum**: penulis live, cabang CASE recompute, penyesuaian guard, dan keputusan pensiun `sp_btbs`.

---

## KONDISI BTB SEKARANG

### 1.1 Tiga tabel bernama "btb" — jangan tertukar

| Tabel | Peran | Status |
|---|---|---|
| **`sp_btbs`** (jamak) | BTB per-SP untuk Storbit — LEGACY | **HIDUP** (ditulis & dibaca FE) |
| **`sp_btb`** (tunggal) | BTB entitas Fase 0 (target FASE 3) | **Backfill 186 baris, DORMANT** (tak ada penulis/pembaca live) |
| **`ar_btbs`** | Baris BTB di **AR Tracker TTF** (modul finance MSI, `ar_ttfs` parent) — **domain lain**, bukan BTB Storbit | Hidup di modul AR TTF; di luar scope FASE 3 |

⚠️ `ar_btbs` sering muncul di grep tapi **TIDAK RELEVAN** untuk FASE 3 — itu baris DPP/PPN/PPh di TTF ([schema:1558](supabase/schema_snapshot.sql#L1558), reader `App.jsx:225/4440`, writer `db.js:693-738`). DESIGN memang berencana memindahkan nilainya ke `sp_invoice_lines`/`sp_payments` (finance, FASE 4), bukan ke `sp_btb`.

### 1.2 Struktur `sp_btbs` (legacy — HIDUP)

[schema:3945-3951](supabase/schema_snapshot.sql#L3945):
```
sp_btbs(id uuid pk, sp_no text NOT NULL, btb_no text NOT NULL, created_at timestamptz, remarks text)
```
- **Kunci relasi:** hanya `sp_no` (text). **TIDAK ada** `customer_id`, `sp_order_id`, `delivery_note_id`, `qty`, `btb_date`, `deleted_at`.
- **Konsekuensi identitas komposit:** karena hanya `sp_no`, tabel ini **tak bisa membedakan SP bernomor sama antar customer** — persis kelemahan yang sudah ditutup di jalur lain oleh BAGIAN B (identitas `(customer_id, sp_no)`). BTB legacy = titik buta yang tersisa.
- **RLS PERMISIF:** `sp_btbs_read USING(true)` ([schema:11430](supabase/schema_snapshot.sql#L11430)), insert `auth.uid() IS NOT NULL` ([schema:11423](supabase/schema_snapshot.sql#L11423)), update/delete `USING(true)`/`auth.uid()` ([schema:11416/11437](supabase/schema_snapshot.sql#L11416)). Tidak company/role-scoped.
- **Backfill count:** 187 baris (CLAUDE.md FASE 0). Tak ada UNIQUE constraint → `btb_no` boleh duplikat.

### 1.3 Struktur `sp_btb` (Fase 0 — DORMANT)

[schema:3923-3938](supabase/schema_snapshot.sql#L3923):
```
sp_btb(
  id uuid pk, company_id uuid NOT NULL, sp_order_id uuid NOT NULL,
  delivery_note_id uuid NULL, customer_id uuid NOT NULL,
  btb_no text NOT NULL, btb_date date, qty integer,
  received_at timestamptz, received_by uuid, remarks text,
  created_at timestamptz, deleted_at timestamptz,
  CHECK (qty IS NULL OR qty >= 0))
```
- **FK:** `company_id→companies`, `customer_id→accounts`, `sp_order_id→sp_orders`, `delivery_note_id→delivery_notes` (nullable) — [schema:8855-8883](supabase/schema_snapshot.sql#L8855).
- **UNIQUE:** `(customer_id, btb_no)` ([schema:5417](supabase/schema_snapshot.sql#L5417)) — sesuai keputusan #1 DESIGN.
- **RLS company/role-scoped 4 policy** ([schema:11376-11403](supabase/schema_snapshot.sql#L11376)): read = super OR same-company; insert/update = super OR (same-company AND (manager+ OR `has_role('operations')`)); delete = super only. **Ini pola RLS yang benar** — sudah siap dipakai.
- **Backfill count:** 186 baris (CLAUDE.md FASE 0; "1 BTB salah-input dihapus"). Historis → `qty=NULL`, `delivery_note_id=NULL`, `sp_order_id` di-map dari `sp_no`.
- ⚠️ **`grep` GRANT/INDEX `sp_btb` = kosong.** Tak ada indeks pada `sp_btb` di snapshot (selain PK & UNIQUE) — perlu cek apakah GRANT sudah dijalankan manual (CLAUDE.md klaim "GRANT tiap tabel" tapi snapshot tak menampilkannya). **Temuan: verifikasi GRANT `sp_btb` ke `authenticated` sebelum FE menyentuhnya** (aturan wajib: CLI tak auto-grant).

### 1.4 Jalur pembuatan BTB sekarang (UI → tabel apa)

**Penulis #1 — InputSPPage (create SP):**
- [InputSPPage.jsx:162](src/modules/logistics/InputSPPage.jsx#L162) state `btbRows`, kartu "BTB Numbers" [:461-465](src/modules/logistics/InputSPPage.jsx#L461).
- [InputSPPage.jsx:294 & :299](src/modules/logistics/InputSPPage.jsx#L294) `await bulkInsertSpBtbs(spNoValue, btbRows)` → **menulis `sp_btbs`** ([db.js:829-838](src/lib/db.js#L829)). (Dipanggil 2× — draft path & submit path.)

**Penulis #2 & pembaca — SalesOrderDetailPage (Detail SP, "BTB Numbers" card):**
- Reader: [SalesOrderDetailPage.jsx:642](src/modules/logistics/SalesOrderDetailPage.jsx#L642) `listSpBtbs(spNo)` → **baca `sp_btbs`** ([db.js:798-804](src/lib/db.js#L798)).
- Add: [:680](src/modules/logistics/SalesOrderDetailPage.jsx#L680) `addSpBtb(spNo, btbInput, btbRemarks)` → **insert `sp_btbs`** ([db.js:808-816](src/lib/db.js#L808)).
- Delete: [:689](src/modules/logistics/SalesOrderDetailPage.jsx#L689) `deleteSpBtb(id)` → **delete `sp_btbs`** ([db.js:820-825](src/lib/db.js#L820)).

**Helper db.js untuk `sp_btbs`:** `listSpBtbs`/`addSpBtb`/`deleteSpBtb`/`bulkInsertSpBtbs` ([db.js:793-839](src/lib/db.js#L793)). Semua target `sp_btbs`. **Nol helper untuk `sp_btb`.**

### 1.5 RPC BTB?

**Tidak ada.** Tak ada `sp_issue_btb`/`create_btb`/`add_btb`/sejenis di snapshot (grep FUNCTION = 0). BTB legacy ditulis via `.insert()` PostgREST langsung, tanpa recompute, tanpa fakta batch.

### 1.6 Verdict kondisi

`sp_btbs` = **hidup tapi buta identitas** (sp_no only, RLS lemah, tanpa qty/batch/recompute). `sp_btb` = **benar tapi mati** (schema lengkap, backfill ada, tanpa penulis/pembaca/recompute). FASE 3 = menyeberangkan jalur hidup dari tabel buta ke tabel benar + menghidupkan fakta di recompute.

---

## RELASI BTB → SP / PENGIRIMAN

### 2.1 Sekarang (`sp_btbs`)
- Nyambung ke SP **hanya lewat `sp_no`** (text). Tak ada link ke customer maupun ke surat jalan (`delivery_notes`).
- **1 SP → N BTB** (banyak baris `sp_btbs` sama `sp_no`). Ini per-SP, **bukan** per-pengiriman (tak ada `delivery_note_id`).

### 2.2 Target (`sp_btb`)
- **Ke SP:** `sp_order_id → sp_orders.id` (FK wajib). Plus `customer_id` (denormal, untuk UNIQUE & RLS).
- **Ke pengiriman:** `delivery_note_id → delivery_notes.id` (**nullable**) → BTB **boleh** dipetakan ke batch surat jalan tertentu, atau dibiarkan null (belum dipetakan / BTB level-SP).
- **Kardinalitas:** DESIGN `DESIGN_SP_SCHEMA.md:318` "`sp_btb` (N per SP, qty saja)". Jadi **1 SP → N BTB**, dan **secara desain BTB bisa per-batch** (via `delivery_note_id`). Karena satu SP praktis 1 picking → 1 DN (FASE 2 catatan 5, `AUDIT_FASE2_PENGIRIMAN.md:223`), umumnya **1 BTB per SP** untuk alur normal; N-batch/partial adalah kasus lanjutan.

### 2.3 Jalur identitas untuk RPC baru
`delivery_notes` punya `sp_no`, `customer_id`, `sp_order_id` ([schema delivery_notes](supabase/schema_snapshot.sql#L~) — kolom `sp_order_id` ada, `customer_id` ada). Jadi RPC BTB yang menerima `p_delivery_note_id` bisa **resolve `sp_order_id`+`customer_id`+`sp_no`** dari DN itu (pola persis `mark_delivery_delivered` [schema:868](supabase/schema_snapshot.sql#L868)). Bila BTB dibuat tanpa DN (level-SP), RPC terima `p_sp_order_id` langsung dan `delivery_note_id=NULL`.

⚠️ **Catatan backfill:** 186 baris `sp_btb` historis punya `sp_order_id` terisi tapi `delivery_note_id=NULL` dan `qty=NULL`. Reader/recompute FASE 3 harus toleran terhadap `qty NULL` & `delivery_note_id NULL`.

---

## POSISI BTB_TERBIT DI STATE MACHINE + CARA RECOMPUTE MENGENALINYA

### 3.1 Posisi menurut DESIGN

Enum `sp_orders.status` CHECK ([schema:4085](supabase/schema_snapshot.sql#L4085)):
```
DRAFT, CONFIRMED, MENUNGGU_STOK, PICKING, PACKED, DIKIRIM, SAMPAI,
BTB_TERBIT(8), TERKIRIM_PENUH(9), INVOICED, SUBMITTED, LUNAS, CANCELLED
```
State machine `DESIGN_SP_SCHEMA.md:54-57`:
```
DIKIRIM ──(SJ delivered)──► SAMPAI
SAMPAI  ──(BTB batch terbit)──► BTB_TERBIT
BTB_TERBIT / DIKIRIM ──(Σshipped = Σqty)──► TERKIRIM_PENUH
TERKIRIM_PENUH ──(invoice; hanya saat Σshipped=Σqty)──► INVOICED
```
→ **BTB_TERBIT duduk di antara SAMPAI dan TERKIRIM_PENUH.** Rank BTB_TERBIT (8) **di BAWAH** TERKIRIM_PENUH (9). Bukan overlay — ini tahap linear (DISPUTE-lah yang overlay via `is_disputed`, `DESIGN:33`).

Recompute ideal DESIGN (`DESIGN_SP_SCHEMA.md:378-380`) & AUDIT_MESIN_STATUS (`:108-109`):
```
WHEN shipped>=ordered THEN TERKIRIM_PENUH   ← dicek DULU (rank tertinggi)
WHEN has_btb          THEN BTB_TERBIT
WHEN has_delivered    THEN SAMPAI
```
Pemicu AUTO: **`has_btb = ∃ sp_btb WHERE deleted_at IS NULL`** (`AUDIT_MESIN_STATUS.md:53`, `DESIGN:368`).

### 3.2 Kondisi recompute LIVE (snapshot)

`sp_recompute_status(p_customer_id, p_sp_no)` ([schema:1081-1121](supabase/schema_snapshot.sql#L1081)):
- **Guard baris 1094:** `IF v_status IN ('CANCELLED','BTB_TERBIT','INVOICED','SUBMITTED','LUNAS') THEN RETURN` → **BTB_TERBIT dibekukan** (kalau sudah di situ, recompute pulang).
- **CASE baris 1109-1117:** tahap tertinggi = `TERKIRIM_PENUH` → `SAMPAI` → `DIKIRIM` → `PACKED` → `PICKING` → `MENUNGGU_STOK` → `CONFIRMED` → `DRAFT`. **TIDAK ADA cabang `BTB_TERBIT`.**
- `v_id` = `sp_orders.id` sudah di-fetch di baris 1091 → **`sp_order_id` tersedia** untuk query `sp_btb`.

**Kesimpulan:** recompute live **membekukan** BTB_TERBIT tapi **tak pernah bisa mencapainya**. BTB_TERBIT = tahap yatim: ada di enum, ada di guard, tak ada di CASE, tak ada penulis. Persis "❌ BELUM (penulis)" `AUDIT_MESIN_STATUS.md:28`.

### 3.3 Cara recompute FASE 3 mengenali BTB_TERBIT (usulan)

Karena `v_id` (sp_order_id) sudah ada di fungsi, cukup tambah satu fakta + satu cabang CASE:
```sql
-- fakta baru (setelah v_has_delivered):
v_has_btb := EXISTS(SELECT 1 FROM sp_btb WHERE sp_order_id = v_id AND deleted_at IS NULL);

-- CASE (sisip di antara TERKIRIM_PENUH dan SAMPAI):
WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
WHEN v_has_btb                                THEN 'BTB_TERBIT'   -- BARU
WHEN v_has_delivered                          THEN 'SAMPAI'
WHEN v_has_dispatch                           THEN 'DIKIRIM'
...
```
→ Sesuai rank DESIGN: fully-shipped mengalahkan BTB; BTB mengalahkan SAMPAI/DIKIRIM. Query pakai `sp_order_id=v_id` (bukan sp_no) karena `sp_btb` **tak punya `sp_no`** — ia link via `sp_order_id`.

⚠️ **Guard harus dilonggarkan** (lihat §5.3): membekukan BTB_TERBIT akan **menahan** SP naik ke TERKIRIM_PENUH saat batch sisanya terkirim penuh.

---

## RANCANGAN FASE 3

### 4.1 Peta: SUDAH ADA vs BELUM

| Komponen | Status | Bukti |
|---|---|---|
| Enum `BTB_TERBIT` di CHECK | ✅ ADA | [schema:4085](supabase/schema_snapshot.sql#L4085) |
| Tabel `sp_btb` (schema+FK+UNIQUE) | ✅ ADA | [schema:3923](supabase/schema_snapshot.sql#L3923) |
| RLS `sp_btb` company/role-scoped | ✅ ADA | [schema:11376-11403](supabase/schema_snapshot.sql#L11376) |
| Backfill 186 baris historis | ✅ ADA (dormant) | CLAUDE.md FASE 0 |
| GRANT `sp_btb` ke authenticated | ⚠️ VERIFIKASI | tak tampil di snapshot |
| `v_id` (sp_order_id) di recompute | ✅ ADA | [schema:1091](supabase/schema_snapshot.sql#L1091) |
| Cabang CASE `BTB_TERBIT` di recompute | ❌ BELUM | [schema:1109-1117](supabase/schema_snapshot.sql#L1109) |
| Guard recompute yang benar (drop BTB_TERBIT dari freeze) | ❌ BELUM | [schema:1094](supabase/schema_snapshot.sql#L1094) |
| RPC penulis `sp_btb` (`sp_issue_btb`) | ❌ BELUM | grep=0 |
| Helper db.js untuk `sp_btb` | ❌ BELUM | [db.js:793](src/lib/db.js#L793) semua `sp_btbs` |
| UI Detail SP baca/tulis `sp_btb` | ❌ BELUM | [SalesOrderDetailPage.jsx:642-692](src/modules/logistics/SalesOrderDetailPage.jsx#L642) `sp_btbs` |
| Keputusan pensiun/migrasi `sp_btbs` | ❌ BELUM (keputusan bisnis) | — |
| `sp_audit_log` (`btb_added`) | ❌ BELUM (DESIGN §2.6, di luar scope minimal) | grep=0 |

### 4.2 Draf SQL usulan (BELUM FINAL, JANGAN JALANKAN)

**(A) RPC `sp_issue_btb` — penulis live** (SECURITY DEFINER, pola `mark_delivery_delivered`):
```sql
CREATE OR REPLACE FUNCTION public.sp_issue_btb(
  p_sp_order_id      uuid,
  p_btb_no           text,
  p_delivery_note_id uuid DEFAULT NULL,
  p_btb_date         date DEFAULT NULL,
  p_qty              integer DEFAULT NULL,
  p_remarks          text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_company uuid; v_customer uuid; v_sp_no text; v_uid uuid := auth.uid();
  v_btb_id uuid;
BEGIN
  -- resolve konteks dari sp_orders (sumber kebenaran identitas komposit)
  SELECT company_id, customer_id, sp_no INTO v_company, v_customer, v_sp_no
    FROM sp_orders WHERE id = p_sp_order_id AND deleted_at IS NULL;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'SP tidak ditemukan (%).', p_sp_order_id; END IF;
  IF btrim(COALESCE(p_btb_no,'')) = '' THEN RAISE EXCEPTION 'Nomor BTB wajib.'; END IF;

  -- (opsional) validasi DN milik SP yang sama
  IF p_delivery_note_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM delivery_notes
        WHERE id = p_delivery_note_id AND sp_no = v_sp_no AND customer_id = v_customer)
  THEN RAISE EXCEPTION 'Surat jalan bukan milik SP ini.'; END IF;

  INSERT INTO sp_btb (company_id, sp_order_id, delivery_note_id, customer_id,
                      btb_no, btb_date, qty, received_at, received_by, remarks)
  VALUES (v_company, p_sp_order_id, p_delivery_note_id, v_customer,
          btrim(p_btb_no), p_btb_date, p_qty, now(), v_uid, p_remarks)
  RETURNING id INTO v_btb_id;
  -- UNIQUE(customer_id,btb_no) akan RAISE unique_violation kalau nomor dobel per-customer

  PERFORM sp_recompute_status(v_customer, v_sp_no);   -- → BTB_TERBIT (bila belum TERKIRIM_PENUH)
  RETURN v_btb_id;
END; $$;
-- GRANT EXECUTE ON FUNCTION public.sp_issue_btb(...) TO authenticated;
```
Dan pasangannya **`sp_delete_btb(p_btb_id uuid)`** (soft-delete `deleted_at=now()` + recompute → mundur bila tak ada BTB lain), supaya hapus BTB juga menggerakkan status.

**(B) Perluas `sp_recompute_status`** — tambah `v_has_btb` + cabang CASE (§3.3) + **ganti guard** (§5.3). `CREATE OR REPLACE`, signature tetap `(uuid,text)` → semua 5 pemanggil existing ([schema:215/254/508/874/1050](supabase/schema_snapshot.sql#L215)) tak pecah.

**(C) GRANT** (bila §4.1 verifikasi menemukan belum ada): `GRANT SELECT,INSERT,UPDATE ON public.sp_btb TO authenticated;` (DELETE via RPC/soft-delete saja; RLS tetap gerbang efektif).

### 4.3 Draf FE usulan (BELUM FINAL)

- **db.js:** +`issueSpBtb({spOrderId,btbNo,deliveryNoteId,btbDate,qty,remarks})` → `rpc('sp_issue_btb',…)`; +`listSpBtbNew(spOrderId)` → `from('sp_btb').select().eq('sp_order_id',…).is('deleted_at',null)`; +`deleteSpBtbNew(id)` → `rpc('sp_delete_btb',…)`. **Helper `sp_btbs` lama DITAHAN** selama masa transisi (jangan langsung hapus — pola "berhenti baca dulu, drop belakangan").
- **SalesOrderDetailPage BTB card:** alihkan reader/add/delete dari `sp_btbs` (`spNo`) → `sp_btb` (`spOrderId` dari `spOrder.id`; sudah di-fetch via `getSpOrderStatus` [SalesOrderDetailPage.jsx:650](src/modules/logistics/SalesOrderDetailPage.jsx#L650) — perlu pastikan `spOrder` mengembalikan `id`). Tambah field opsional `btb_date`/`qty`/pilih DN.
- **InputSPPage:** **tunda.** Saat create, `sp_order_id` baru saja dibuat via `createSpOrderDual` — bisa diteruskan ke `sp_issue_btb`, tapi input BTB saat create SP jarang (BTB terbit setelah barang sampai). **Rekomendasi:** pindahkan penerbitan BTB **sepenuhnya ke Detail SP** (post-delivery), dan **hentikan** tulis `bulkInsertSpBtbs` di create (BTB bukan data create-time). Perlu konfirmasi bisnis.

---

## INTERAKSI DENGAN TERKIRIM_PENUH (rank/urutan)

### 5.1 Fakta rank
Enum: `... SAMPAI(7) < BTB_TERBIT(8) < TERKIRIM_PENUH(9) < INVOICED(10) ...`. Recompute memilih **tahap tertinggi yang faktanya benar** → dalam CASE, `TERKIRIM_PENUH` dicek **sebelum** `BTB_TERBIT`. Artinya:
- **BTB terbit + belum penuh (partial):** `has_btb=true`, `shipped<ordered` → headline **BTB_TERBIT**.
- **BTB terbit + sudah penuh:** `shipped>=ordered` → **TERKIRIM_PENUH** (BTB "tersubsumsi", tak terlihat di headline; detail BTB tetap di kartu).
- **Penuh tanpa BTB:** langsung **TERKIRIM_PENUH** (skip BTB_TERBIT) — sah menurut DESIGN, karena gate invoice = TERKIRIM_PENUH, **bukan** BTB (`DESIGN:57`).

Jadi BTB_TERBIT dalam model ini = **penanda "barang diterima (BTB) tapi belum semua qty terkirim"** — visible hanya saat partial. Itu konsisten dengan `sp_btb` sebagai dokumen per-batch.

### 5.2 ⚠️ Tension desain yang WAJIB dikonfirmasi (jangan diasumsikan)
Ada **dua interpretasi bisnis** yang berbeda, dan enum saat ini mengunci interpretasi (a):

- **(a) BTB < TERKIRIM_PENUH (posisi enum sekarang):** BTB = milestone antara; penuh mengalahkan BTB; invoice dipicu oleh "terkirim penuh". Cocok bila secara bisnis MSI menagih atas dasar *seluruh qty terkirim*.
- **(b) BTB > TERKIRIM_PENUH (praktik lazim Indomarco):** invoice ditagihkan atas dasar **BTB bertandatangan** dari customer (bukti terima), sehingga BTB adalah gerbang MENUJU invoice → BTB harusnya **di atas** TERKIRIM_PENUH. Ini **bertentangan** dengan urutan enum sekarang.

**Temuan:** DESIGN memilih (a) (enum + `DESIGN:57` gate invoice = TERKIRIM_PENUH). Tapi flow AR/TTF legacy (`ar_ttfs` = transmittal faktur+BTB, `DESIGN:237`) mengesankan BTB adalah syarat serah-faktur → nuansa (b). **Keputusan ini menentukan rank & gate FASE 4 (INVOICED)** — harus diputuskan user sebelum FASE 3 dikunci. Rekomendasi audit: **ikuti (a)** (sesuai enum & DESIGN, perubahan minimal); bila bisnis menuntut (b), itu **revisi enum/gate** terpisah, bukan tambal di recompute.

### 5.3 ⚠️ Guard freeze BTB_TERBIT = risiko status macet
Guard live baris 1094 mem-freeze BTB_TERBIT. Dengan interpretasi (a), sebuah SP partial yang sudah **BTB_TERBIT** lalu batch sisanya terkirim penuh **seharusnya naik** ke TERKIRIM_PENUH — tapi guard akan **RETURN lebih dulu** → status **macet di BTB_TERBIT**. Karena itu FASE 3 **wajib** mengubah guard:
```
-- dari:
IF v_status IN ('CANCELLED','BTB_TERBIT','INVOICED','SUBMITTED','LUNAS') THEN RETURN;
-- menjadi (band aktif meluas s/d TERKIRIM_PENUH; hanya finance+cancel yang beku):
IF v_status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS') THEN RETURN;
```
Ini **persis** yang direncanakan `AUDIT_FASE2_PENGIRIMAN.md:162` (guard jadi `IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS')`). **Konsekuensi:** BTB_TERBIT jadi *fact-derived* penuh — bisa naik (batch penuh → TERKIRIM_PENUH) **dan turun** (BTB dihapus/DN dibatalkan → mundur ke SAMPAI/DIKIRIM). Itu perilaku yang diinginkan.

### 5.4 ⚠️ Prasyarat TERKIRIM_PENUH belum benar-benar hidup untuk SP baru (discrepancy)
`sp_recompute_status` menghitung `v_shipped` dari `sp_items.shipped_qty` ([schema:1105](supabase/schema_snapshot.sql#L1105)), **tapi tak ada satu pun fungsi yang MEN-UPDATE `shipped_qty`** di snapshot (grep `SET shipped_qty` = 0; `dispatch_delivery` [schema:328-354](supabase/schema_snapshot.sql#L328) tak menyentuhnya). Ini **bertentangan** dengan commit `dc98978` ("FASE 2 2A+2B jembatan pengiriman: shipped_qty") dan rancangan `AUDIT_FASE2_PENGIRIMAN.md:49-96`.
→ **Kemungkinan:** (i) bridge FASE 2A dijalankan di DB tapi snapshot belum di-refresh untuk 2A, atau (ii) belum dijalankan. **JANGAN diasumsikan.** Dampak ke FASE 3: TERKIRIM_PENUH untuk SP **baru** hanya tercapai bila bridge shipped_qty benar-benar live; untuk SP **historis** (shipped di-backfill) sudah tercapai. **Verifikasi ke DB live** apakah `dispatch_delivery` sudah punya bridge sebelum menganggap rank BTB↔TERKIRIM_PENUH teruji. (Sekaligus: refresh `schema_snapshot.sql` via `pg_dump` — snapshot tampak stale terhadap FASE 2.)

### 5.5 ⚠️ 186 backfill `sp_btb` akan "menyala" saat recompute mengenali has_btb
Begitu cabang `v_has_btb` aktif, **186 baris `sp_btb` historis** (sudah punya `sp_order_id`) menjadi fakta true. Untuk SP historis yang sudah TERKIRIM_PENUH (mayoritas — shipped backfilled), rank (a) menjaga mereka tetap TERKIRIM_PENUH. Tapi SP historis yang **belum penuh + punya BTB backfill** akan **turun ke BTB_TERBIT** saat recompute pertama menyentuhnya. Ini **pergeseran status massal** yang harus disadari.
→ **Opsi mitigasi (pilih saat eksekusi):** (i) terima rekonsiliasi (fact-derived memang begitu); (ii) batasi has_btb ke BTB "nyata" (mis. `qty IS NOT NULL` atau `received_at IS NOT NULL`) agar backfill qty-NULL tak memicu; (iii) recompute massal terkendali + verifikasi count sebelum/sesudah. **Rekomendasi:** opsi (i) + verifikasi hitungan, karena membedakan backfill vs live via qty rapuh.

---

## RENCANA BERTAHAP + VERIFIKASI (JANGAN EKSEKUSI)

Prinsip (CLAUDE.md): buat berdampingan → deploy kode baca-baru → hentikan tulis lama → drop paling akhir. Tiap langkah **diverifikasi user** sebelum lanjut. Prasyarat lintas-fase: **FASE 1 & 2 live & terverifikasi** (khususnya §5.4).

### LANGKAH 0 — Verifikasi prasyarat *(murni cek, tanpa perubahan)*
- **Aksi:** (a) cek DB live: apakah `dispatch_delivery` sudah punya bridge `shipped_qty` (§5.4)? apakah GRANT `sp_btb` sudah ada (§1.3)? apakah `sp_btb` benar 186 baris; berapa yang `qty NULL`/`delivery_note_id NULL`. (b) cek `sp_btbs` 187 baris: adakah `btb_no` duplikat per-customer (calon bentrok UNIQUE saat migrasi)?
- **Verifikasi:** SQL read-only (`SELECT count`, `SELECT ... GROUP BY btb_no HAVING count>1`). Refresh `schema_snapshot.sql` bila stale.
- **Tipe:** DB (read-only).

### LANGKAH 1 — Keputusan bisnis *(tanpa kode)*
- **Aksi:** kunci 3 keputusan: (1) rank BTB vs TERKIRIM_PENUH → interpretasi (a) atau (b) (§5.2); (2) pensiun `sp_btbs` vs dual-write sementara (`AUDIT_MESIN_STATUS.md:202`); (3) BTB dibuat di Detail SP saja atau juga saat create (§4.3).
- **Verifikasi:** tertulis di PROGRESS/rancangan. Tanpa keputusan ini, langkah berikut ambigu.
- **Tipe:** keputusan.

### LANGKAH 2 — RPC penulis `sp_issue_btb` + `sp_delete_btb` *(DB)*
- **Aksi:** jalankan draf §4.2 (A) + GRANT. **Belum sentuh recompute** (BTB masuk `sp_btb` tapi status belum bergerak — aman, additive).
- **Verifikasi:** panggil RPC manual di SQL Editor untuk 1 SP uji → baris `sp_btb` muncul (`sp_order_id`/`customer_id`/`btb_no` benar); nomor dobel per-customer → `unique_violation`; DN bukan milik SP → RAISE. `sp_orders.status` **belum** berubah (recompute belum tahu BTB).
- **Tipe:** DB.

### LANGKAH 3 — Perluas recompute + longgarkan guard *(DB)*
- **Aksi:** `CREATE OR REPLACE sp_recompute_status` dengan `v_has_btb` + cabang CASE (§3.3) + guard baru (§5.3). Signature tetap.
- **Verifikasi (per skenario, 1 SP uji):**
  1. SP di SAMPAI, terbitkan BTB → recompute → **BTB_TERBIT**.
  2. SP di BTB_TERBIT, batch terkirim penuh (shipped≥qty) → recompute → **TERKIRIM_PENUH** (bukti guard sudah dilonggarkan).
  3. Hapus BTB (`sp_delete_btb`) saat belum penuh → recompute → **mundur ke SAMPAI/DIKIRIM**.
  4. SP penuh + BTB → tetap **TERKIRIM_PENUH** (rank a).
  5. **Cek pergeseran massal** (§5.5): hitung `sp_orders` per status sebelum/sesudah recompute historis; pastikan SP finance (INVOICED+) & CANCELLED **tak tersentuh** (guard).
- **Catatan:** recompute massal historis sebaiknya dilakukan terkendali (loop per SP) + snapshot count.
- **Tipe:** DB.

### LANGKAH 4 — Helper db.js `sp_btb` *(FE, additive)*
- **Aksi:** +`issueSpBtb`/`listSpBtbNew`/`deleteSpBtbNew` (§4.3). Helper `sp_btbs` lama **ditahan**.
- **Verifikasi:** `npm run build` clean, lint net-zero. Belum dipakai UI → nol perubahan tampilan.
- **Tipe:** FE.

### LANGKAH 5 — Alihkan reader/writer Detail SP ke `sp_btb` *(FE)*
- **Aksi:** kartu "BTB Numbers" `SalesOrderDetailPage` baca/tulis `sp_btb` via helper baru (pakai `spOrder.id`), tambah field opsional `btb_date`/`qty`/pilih DN. Pastikan `getSpOrderStatus`/`spOrder` menyediakan `id`.
- **Verifikasi (perlu login):** buka Detail SP → terbitkan BTB → baris muncul di kartu; **badge headline naik ke BTB_TERBIT**; hapus → mundur; pill list (`SalesOrderPage`, reader `sp_orders.status` pasca-2E) ikut. Build clean, lint net-zero.
- **Tipe:** FE (+DB sudah dari L2/L3).

### LANGKAH 6 — Hentikan tulis `sp_btbs` legacy *(FE)*
- **Aksi:** sesuai keputusan L1: hentikan `bulkInsertSpBtbs` di InputSPPage (dan/atau dual-write sementara). BTB baru **hanya** ke `sp_btb`.
- **Verifikasi:** buat SP baru → `sp_btbs` **tak** bertambah; BTB dari Detail SP → `sp_btb` bertambah. Tak ada jalur yang masih menulis `sp_btbs`.
- **Tipe:** FE.

### LANGKAH 7 — (Opsional, nanti) migrasi sisa `sp_btbs` → `sp_btb` + pensiun *(DB, paling akhir)*
- **Aksi:** untuk `sp_btbs` legacy yang belum ada padanan di `sp_btb`, INSERT ke `sp_btb` (resolve `sp_order_id`/`customer_id` via `sp_orders` by `sp_no`; `qty=NULL`), tangani duplikat (L0). Setelah reader/writer 100% pindah & verifikasi produksi → **drop `sp_btbs`** (DESIGN M13).
- **Verifikasi:** count `sp_btb` ≥ union unik; nol pembaca `sp_btbs` di `src/` (grep). Drop hanya setelah semua di atas hijau.
- **Tipe:** DB.

### Di luar scope minimal FASE 3 (dicatat)
- **`sp_audit_log` (`btb_added`)** (DESIGN §2.6, `:281`) — insert eksplisit di `sp_issue_btb`. Bisa disusulkan bersama modul History; tak menghalangi BTB_TERBIT hidup.
- **N-batch/partial-lanjutan** (picking kedua) — dibatasi guard "1 picking per SP" (`AUDIT_FASE2:186`); BTB per-DN penuh bermakna hanya setelah partial-lanjutan dibuka. FASE 3 cukup dukung **1 BTB per SP + delivery_note_id opsional**.
- **FASE 4 (INVOICED+)** — gate invoice (TERKIRIM_PENUH vs BTB) bergantung keputusan §5.2.

---

### Lampiran — daftar bukti utama
- `sp_btb` def: [schema:3923](supabase/schema_snapshot.sql#L3923) · UNIQUE [5417](supabase/schema_snapshot.sql#L5417) · FK [8855-8883](supabase/schema_snapshot.sql#L8855) · RLS [11376-11403](supabase/schema_snapshot.sql#L11376)
- `sp_btbs` def: [schema:3945](supabase/schema_snapshot.sql#L3945) · RLS permisif [11410-11437](supabase/schema_snapshot.sql#L11410)
- recompute: [schema:1081-1121](supabase/schema_snapshot.sql#L1081) (guard 1094, CASE 1109, v_id 1091)
- enum status: [schema:4085](supabase/schema_snapshot.sql#L4085) · `sp_orders` def [3999+](supabase/schema_snapshot.sql)
- writer legacy: [InputSPPage.jsx:294/299](src/modules/logistics/InputSPPage.jsx#L294) · [db.js:829](src/lib/db.js#L829)
- reader/manager legacy: [SalesOrderDetailPage.jsx:642/680/689](src/modules/logistics/SalesOrderDetailPage.jsx#L642) · [db.js:798-825](src/lib/db.js#L798)
- shipped_qty tanpa writer: grep `SET shipped_qty`=0 · `dispatch_delivery` [schema:328](supabase/schema_snapshot.sql#L328)
- DESIGN state machine: `DESIGN_SP_SCHEMA.md:54-57,166-184,368-380` · AUDIT: `AUDIT_MESIN_STATUS.md:28,53,200-203`
