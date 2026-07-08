# AUDIT + RANCANGAN — Mesin Status SP (hidup DRAFT → LUNAS)

> **Mode:** AUDIT + RANCANGAN read-only. Tidak ada file kode/DB diubah. Satu-satunya file dibuat: dokumen ini.
> **Tanggal:** 2026-07-07 · **Branch:** `feat/sp-schema` · **Sumber DB:** `supabase/schema_snapshot.sql` (sudah memuat identitas komposit).
> **Rujukan target:** `DESIGN_SP_SCHEMA.md` §1.2/§1.3/§4.2 · **Rujukan masalah:** `AUDIT_STATUS_PENOMORAN.md`.

---

## RINGKASAN

Status SP saat ini **mati**: UI membaca `sp_items.sp_status` (hanya 3 nilai draft/confirmed/cancelled, diubah manual via `set_sp_status`), sementara `sp_orders.status` (12-tahap, sudah ada + CHECK) **diam di `DRAFT`** — tak ada `sp_recompute_status` (grep: **0**), tak ada trigger, tak dibaca UI, dan dual-write menuliskannya `DRAFT` saat create lalu tak pernah digerakkan lagi → **desync**: `set_sp_status` (4-arg scoped) hanya menyentuh `sp_items`, `sp_orders.status` tetap `DRAFT`. Fakta lapangan yang menggerakkan status juga terputus: `dispatch_delivery` **tidak** menaikkan `shipped_qty` (grep di fungsi: 0), create picking/delivery **tidak** mengisi `sp_orders.status`/`sp_order_id`, `sp_btb` (tabel baru) **tanpa penulis live** (BTB baru ditulis ke `sp_btbs` legacy), dan entitas finance (`sp_invoices`/`sp_invoice_lines`/`sp_payments`) + `sp_audit_log` **belum ada** (grep: 0). **Verdict jarak ke "hidup sampai LUNAS":** tahap **DRAFT→CONFIRMED→(MENUNGGU_STOK)→PICKING→PACKED** bisa dihidupkan **sekarang** (infra ada, hanya perlu fungsi recompute + wiring status di RPC yang sudah ada); **DIKIRIM→SAMPAI→TERKIRIM_PENUH** butuh **jembatan dispatch→`shipped_qty` + isi `sp_order_id`** (kecil–sedang, tabel sudah ada); **BTB_TERBIT** butuh penulis `sp_btb` live; **INVOICED→SUBMITTED→LUNAS** butuh **modul baru invoice + payment** (belum ada sama sekali). Jadi ~5 tahap siap, ~3 tahap jembatan tipis, ~4 tahap butuh modul finance.

---

## PETA TAHAP → EVENT → FAKTA → INFRA

Legenda infra: **✅ ADA** (bisa disambung sekarang) · **🟡 SEBAGIAN** · **❌ BELUM** (butuh modul/penulis baru).

| # | Status | Event pemicu | Fakta dibaca dari | AUTO/MANUAL | Infra sekarang |
|---|--------|--------------|-------------------|-------------|----------------|
| 1 | **DRAFT** | SP dibuat | inisial (`createSpOrderDual` set `'DRAFT'`) | AUTO (awal) | ✅ ADA — `db.js:createSpOrderDual`; `sp_orders.status DEFAULT 'DRAFT'` |
| 2 | **CONFIRMED** | Operator klik Konfirmasi | `sp_items.sp_status='confirmed'` (kini) → harus set `sp_orders.status` | **MANUAL** | 🟡 SEBAGIAN — RPC `set_sp_status` (4-arg, `schema:901`) update **`sp_items` saja**; **tak** sentuh `sp_orders.status` (desync) |
| 3 | **MENUNGGU_STOK** | Konfirmasi tapi stok kurang | `stock_summary.available` vs Σ outstanding | AUTO | 🟡 SEBAGIAN — `generate_picking_from_sp` sudah hitung `qty_short` dari `stock_summary` (`schema:391`), tapi **tak set status**; belum ada jalur "confirmed + stok kurang → MENUNGGU_STOK" sebelum picking |
| 4 | **PICKING** | Generate picking (stok cukup) | ada `picking_lists` non-cancelled | AUTO | ✅ ADA — `generate_picking_from_sp` (RPC) tinggal set status |
| 5 | **PACKED** | Picking `done` + material packed | `picking_lists.status='done'` + `picking_list_materials` | AUTO | 🟡 SEBAGIAN — `completePicking` (`db.js:454`) set `picking_lists.status='done'`; `picking_list_materials` ada; **tak set status**, definisi "packed" (perlu material?) perlu dikunci |
| 6 | **DIKIRIM** | SJ pertama dispatch (in_transit) | `delivery_notes.status IN ('in_transit','delivered')` **by `sp_order_id`** | AUTO | 🟡 SEBAGIAN — `dispatch_delivery` (`schema:263`) set `delivery_notes.status='in_transit'` **TAPI** (a) **tak isi `shipped_qty`**, (b) `generate_delivery_from_picking` **tak isi `delivery_notes.sp_order_id`** → recompute by sp_order_id tak lihat DN baru |
| 7 | **SAMPAI** | SJ delivered | `delivery_notes.status='delivered'` | AUTO | 🟡 SEBAGIAN — `setDeliveryStatus('delivered')` (`db.js`) ada; sama: butuh `sp_order_id` terisi |
| 8 | **BTB_TERBIT** | BTB batch terbit | `sp_btb` (non-deleted) by `sp_order_id` | AUTO | ❌ BELUM (penulis) — tabel `sp_btb` ADA (`schema`, Fase 0) tapi **tak ada penulis live**; BTB baru dari InputSPPage → `bulkInsertSpBtbs` menulis **`sp_btbs` LEGACY**, bukan `sp_btb` |
| 9 | **TERKIRIM_PENUH** | Σshipped = Σqty | `sp_order_items.shipped_qty` vs `qty` | AUTO | ❌ BELUM (jembatan) — `shipped_qty` **tak pernah naik** (dispatch tak bridge, grep=0) → kondisi mustahil tercapai utk SP baru |
| 10 | **INVOICED** | Invoice terbit (Σshipped=Σqty) | `sp_invoices` (status≠void) | AUTO | ❌ BELUM (modul) — tabel `sp_invoices`/`sp_invoice_lines` **tak ada** (grep=0). Legacy `ar_ttfs`/`ar_btbs` ada tapi bukan entitas invoice ter-link `sp_orders` |
| 11 | **SUBMITTED** | Submit ke Indomarco | `sp_invoices.status='submitted'` | **MANUAL** | ❌ BELUM (modul) — butuh `sp_invoices` |
| 12 | **LUNAS** | Σpayment ≥ total | `sp_payments.amount` vs `sp_invoices.total_amount` | AUTO | ❌ BELUM (modul) — tabel `sp_payments` **tak ada** |
| — | **CANCELLED** | Tolak/batal | `sp_items.sp_status='cancelled'` → set `sp_orders.status` | **MANUAL** (terminal) | 🟡 SEBAGIAN — `set_sp_status` update `sp_items` saja (desync sama spt CONFIRMED) |
| — | **is_disputed** (overlay) | Set/clear dispute | `sp_orders.is_disputed` | MANUAL overlay | 🟡 kolom ADA (`sp_orders.is_disputed`+dispute_*), **tak ada RPC set/clear** |

**Ringkas ketersediaan:** siap-sekarang = 1,2,4 (+3,5 tinggal wiring). Jembatan tipis = 6,7,9 (shipped_qty + sp_order_id). Penulis baru = 8. Modul baru = 10,11,12.

---

## RANCANGAN `sp_recompute_status` (pseudocode + draf SQL USULAN — untuk direview, BUKAN final)

**Prinsip:** fungsi memeriksa fakta dari **tahap tertinggi → terendah**, mengambil tahap tertinggi yang faktanya terpenuhi. Tahap yang infranya belum ada (`sp_invoices`/`sp_payments`/penulis `sp_btb`/`shipped_qty`) **tak akan pernah true** sampai infra tersambung → aman dikenali sekarang. Tahap **≤ PACKED** TIDAK ditentukan recompute (di-set eksplisit oleh RPC confirm/picking/complete), karena tak punya "fakta agregat" yang membedakannya — recompute hanya **menaikkan** dari DIKIRIM ke atas. DISPUTE tak ikut (`is_disputed` overlay terpisah). CANCELLED terminal — recompute tak menyentuhnya.

### Pseudocode
```
FUNC sp_recompute_status(p_sp_order_id):
  order = sp_orders[p_sp_order_id]
  IF order.status == 'CANCELLED': RETURN            # terminal, jangan geser
  ordered  = Σ sp_order_items.qty         WHERE sp_order_id=p_sp
  shipped  = Σ sp_order_items.shipped_qty WHERE sp_order_id=p_sp
  has_dispatch  = ∃ delivery_notes(status IN in_transit|delivered)
  has_delivered = ∃ delivery_notes(status = delivered)
  has_btb       = ∃ sp_btb(deleted_at IS NULL)
  has_invoice   = ∃ sp_invoices(status ≠ void)         # tabel belum ada → selalu false
  submitted     = ∃ sp_invoices(status = submitted)     # → false
  paid          = Σ sp_payments.amount ≥ invoice.total  # → false

  # tahap tertinggi yang faktanya terpenuhi (turun dari LUNAS):
  new_high =
     paid & has_invoice                     → LUNAS
     submitted                              → SUBMITTED
     has_invoice                            → INVOICED
     ordered>0 & shipped>=ordered           → TERKIRIM_PENUH
     has_btb                                → BTB_TERBIT
     has_delivered                          → SAMPAI
     has_dispatch                           → DIKIRIM
     else                                   → NULL   # tak ada fakta tahap tinggi

  # Recompute hanya MENAIKKAN dari tahap yang di-set RPC (≤PACKED) ke fakta tinggi.
  # Jangan menurunkan tahap manual (CONFIRMED) tanpa fakta.
  IF new_high != NULL AND rank(new_high) > rank(order.status):
     order.status = new_high
  # (opsi ketat: selalu set = new_high bila new_high!=NULL, untuk reversal shipped_qty
  #  saat cancel_delivery menurunkan tahap — lihat catatan reversal di bawah)
```

### Draf SQL usulan
```sql
-- USULAN — bukan untuk dijalankan. Adaptasi DESIGN §4.2 dgn guard rank + basis fakta live.
CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_sp_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text; v_ordered int; v_shipped int;
  v_has_dispatch bool; v_has_delivered bool; v_has_btb bool;
  v_has_invoice bool := false; v_submitted bool := false; v_paid bool := false;
  v_new text;
  -- peringkat tahap utk cegah penurunan tak sengaja
  v_rank_old int; v_rank_new int;
BEGIN
  SELECT status INTO v_status FROM sp_orders WHERE id = p_sp_order_id;
  IF v_status IS NULL OR v_status = 'CANCELLED' THEN RETURN; END IF;

  SELECT COALESCE(sum(qty),0), COALESCE(sum(shipped_qty),0)
    INTO v_ordered, v_shipped FROM sp_order_items WHERE sp_order_id = p_sp_order_id;
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE sp_order_id=p_sp_order_id AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE sp_order_id=p_sp_order_id AND status='delivered');
  v_has_btb       := EXISTS(SELECT 1 FROM sp_btb WHERE sp_order_id=p_sp_order_id AND deleted_at IS NULL);
  -- Finance: guarded — tabel belum ada saat ini. Saat sp_invoices/sp_payments dibuat, buka blok ini.
  -- v_has_invoice := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=p_sp_order_id AND status<>'void');
  -- v_submitted   := EXISTS(SELECT 1 FROM sp_invoices WHERE sp_order_id=p_sp_order_id AND status='submitted');
  -- SELECT COALESCE(sum(p.amount),0) >= COALESCE(max(i.total_amount),0) INTO v_paid
  --   FROM sp_invoices i LEFT JOIN sp_payments p ON p.invoice_id=i.id WHERE i.sp_order_id=p_sp_order_id;

  v_new := CASE
    WHEN v_paid AND v_has_invoice                      THEN 'LUNAS'
    WHEN v_submitted                                   THEN 'SUBMITTED'
    WHEN v_has_invoice                                 THEN 'INVOICED'
    WHEN v_ordered > 0 AND v_shipped >= v_ordered      THEN 'TERKIRIM_PENUH'
    WHEN v_has_btb                                     THEN 'BTB_TERBIT'
    WHEN v_has_delivered                               THEN 'SAMPAI'
    WHEN v_has_dispatch                                THEN 'DIKIRIM'
    ELSE NULL END;

  IF v_new IS NULL THEN RETURN; END IF;   -- tak ada fakta tahap-tinggi → biarkan tahap RPC (≤PACKED)

  -- rank 12 tahap; hanya naikkan (kecuali reversal shipped_qty menurunkan TERKIRIM_PENUH)
  v_rank_old := array_position(ARRAY['DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED',
     'DIKIRIM','SAMPAI','BTB_TERBIT','TERKIRIM_PENUH','INVOICED','SUBMITTED','LUNAS'], v_status);
  v_rank_new := array_position(ARRAY['DRAFT','CONFIRMED','MENUNGGU_STOK','PICKING','PACKED',
     'DIKIRIM','SAMPAI','BTB_TERBIT','TERKIRIM_PENUH','INVOICED','SUBMITTED','LUNAS'], v_new);

  IF v_rank_new IS DISTINCT FROM v_rank_old THEN
    UPDATE sp_orders SET status = v_new, updated_at = now()
    WHERE id = p_sp_order_id AND status <> 'CANCELLED';
  END IF;
END; $$;
```
**Catatan rancangan:**
- **Partial:** `status` = tahap paling maju **relevan**. `DIKIRIM` menyala begitu ada 1 SJ in_transit (walau belum semua qty); `TERKIRIM_PENUH` hanya saat `Σshipped ≥ Σqty`. Detail per-batch tetap di `delivery_notes`/`sp_btb`.
- **DISPUTE:** tidak disentuh fungsi ini — `is_disputed` overlay via RPC terpisah (`sp_set_dispute`), tak menggeser `status`.
- **Reversal (cancel_delivery):** saat `shipped_qty` turun / DN dibatalkan, `v_new` bisa lebih rendah dari `status` sekarang → butuh opsi "set = v_new walau turun" tapi **hanya dalam rentang fakta** (jangan turunkan di bawah PACKED yang dikelola RPC). Rekomendasi: fungsi menerima parameter `p_allow_downgrade bool DEFAULT false`; `cancel_delivery` memanggil dengan `true`. (Perlu keputusan — dicatat.)
- **`sp_order_id` sebagai kunci:** fungsi baca `delivery_notes`/`sp_btb` **by `sp_order_id`**. ⚠️ **Prasyarat kritis:** create picking/delivery HARUS mengisi `sp_order_id` (lihat Titik Panggil). Alternatif: kunci `(customer_id, sp_no)` — tapi `sp_order_id` (FK tunggal) lebih bersih & sesuai DESIGN.

---

## TITIK PANGGIL + PERBAIKAN DESYNC

### Titik panggil `sp_recompute_status(sp_order_id)`
| Dipanggil dari | Kapan | Status ditetapkan | Ada sekarang? |
|---|---|---|---|
| `set_sp_status` (confirm/cancel) | manual | set `sp_orders.status` = DRAFT/CONFIRMED/CANCELLED **langsung** (tahap ≤ CONFIRMED, bukan via recompute) | perlu tambah UPDATE `sp_orders` |
| `generate_picking_from_sp` | setelah insert picking | set `PICKING` (atau `MENUNGGU_STOK` bila `qty_short>0` di semua item) **langsung** | RPC ada, tinggal +UPDATE |
| `completePicking` | picking→done (+material) | set `PACKED` **langsung** | `db.js:454` (perlu jadi RPC/tambah UPDATE) |
| `dispatch_delivery` | setelah in_transit + bridge `shipped_qty` | `PERFORM sp_recompute_status(sp_order_id)` → DIKIRIM/TERKIRIM_PENUH | **butuh** isi `shipped_qty` + `sp_order_id` |
| `setDeliveryStatus('delivered')` | DN delivered | `sp_recompute_status` → SAMPAI | perlu jadi RPC + recompute |
| `cancel_delivery` | DN dibatalkan | reversal `shipped_qty` + `sp_recompute_status(…, downgrade)` | perlu |
| (nanti) `create_invoice` / `submit_invoice` / `record_payment` | event finance | `sp_recompute_status` → INVOICED/SUBMITTED/LUNAS | modul belum ada |

### Perbaikan DESYNC `sp_orders.status` vs `sp_items` (SEKARANG)
Akar: `set_sp_status` (`schema:901`) hanya `UPDATE sp_items … sp_status`. `createSpOrderDual` set `sp_orders.status='DRAFT'` lalu tak ada yang menggerakkan.
**Usulan minimal (fase awal):** perluas `set_sp_status` agar **juga** `UPDATE sp_orders SET status = map(p_status)` untuk baris `(customer_id, sp_no)` yang sama:
```sql
-- di dalam set_sp_status, SETELAH update sp_items:
UPDATE public.sp_orders
   SET status = CASE p_status WHEN 'confirmed' THEN 'CONFIRMED'
                              WHEN 'cancelled' THEN 'CANCELLED'
                              ELSE 'DRAFT' END,
       confirmed_at = CASE WHEN p_status='confirmed' THEN now() ELSE confirmed_at END,
       cancelled_at = CASE WHEN p_status='cancelled' THEN now() ELSE cancelled_at END,
       updated_at = now()
 WHERE customer_id = p_customer_id AND sp_no = p_sp_no
   AND status NOT IN ('CANCELLED');   -- jangan hidupkan yg sudah batal
```
Ini menutup desync untuk 3 tahap dasar tanpa menunggu modul finance. **Guard:** jangan menurunkan SP yang sudah > CONFIRMED oleh recompute (mis. sudah DIKIRIM) saat "confirm" dipanggil ulang — tambah `AND status IN ('DRAFT','CONFIRMED','MENUNGGU_STOK')` pada branch confirm. (Perlu keputusan — dicatat.)

---

## STRATEGI SUMBER KEBENARAN STATUS (sp_orders vs sp_items + transisi UI)

**Rancangan sumber kebenaran:**
- **`sp_orders.status` = TUAN** (headline 12-tahap, di-recompute dari fakta). Ini tujuan akhir.
- **`sp_items.sp_status` = lifecycle dasar** (draft/confirmed/cancelled) — **tetap ditulis** selama transisi karena **semua reader UI membaca `sp_items`** (`spFromDb`, `groupBySP`, SalesOrderPage/Detail, Shipment/Finance). Menjadikan `sp_orders` tuan **tanpa** memindahkan reader akan memecah UI.

**Masalah transisi:** UI headline pill sekarang dihitung FE dari `sp_items` (`toDesignStatus`: gabung `sp_status` + fulfillment Open/Partial/Closed). 12-tahap `sp_orders.status` lebih kaya. Memindahkan pill ke 12-tahap = perubahan tampilan besar + semua konsumen `groupBySP`.

**Usulan strategi bertahap (aman, tak memecah reader lama):**
1. **Tahap A — jaga konsistensi ganda:** RPC (`set_sp_status`/picking/dll) menulis **kedua**: `sp_items.sp_status` (lifecycle dasar, reader lama tetap jalan) **dan** `sp_orders.status` (recompute). Desync hilang; UI belum berubah.
2. **Tahap B — ekspos `sp_orders.status` ke FE tanpa mengganti pill:** `groupBySP`/`spFromDb` ikut ambil `sp_orders.status` (join per `(customer_id, sp_no)` atau via `sp_order_id`) sebagai field baru `headlineStatus`; tampilkan sebagai **badge tambahan** (mis. di Detail SP "Tahap: DIKIRIM") **berdampingan** pill lama. Tak ada reader yang pecah.
3. **Tahap C — pindahkan pill list ke 12-tahap** setelah `headlineStatus` terbukti akurat; pensiunkan `toDesignStatus` bertahap; `sp_items.sp_status` jadi internal (akhirnya di-drop bersama `sp_items` di M13 DESIGN).

**Rekomendasi:** jangan jadikan `sp_orders` tuan yang dibaca UI sebelum Tahap A (konsistensi ganda) hidup dan terverifikasi. Reader baru = **additive** (badge), bukan pengganti, sampai akurasi terbukti.

---

## ROADMAP BERTAHAP MENUJU LUNAS

> Prinsip: hidupkan tahap yang infranya ADA lebih dulu (nilai langsung, risiko rendah); tahap yang butuh modul dijadwalkan setelah modulnya. Tiap fase: **prasyarat · ukuran · risiko.**

### FASE 1 — Fondasi recompute + tahap darat bawah (DRAFT→CONFIRMED→PICKING→PACKED) + fix desync — **BISA SEKARANG**
- **Isi:** buat `sp_recompute_status` (kenal 12 tahap, blok finance di-comment). Wiring status langsung di RPC yang sudah ada: `set_sp_status` +update `sp_orders` (fix desync, DRAFT/CONFIRMED/CANCELLED); `generate_picking_from_sp` set PICKING/MENUNGGU_STOK; `completePicking` set PACKED. **Isi `sp_order_id`** di `generate_picking_from_sp` (picking_lists) & `generate_delivery_from_picking` (delivery_notes) — prasyarat recompute.
- **Prasyarat:** tak ada modul baru; `sp_orders`/`picking_lists`/`sp_order_items` sudah ada. FE Tahap A/B (badge headline).
- **Ukuran:** Sedang (3 RPC diubah + 1 fungsi baru + FE badge). DB-only via SQL manual + FE additive.
- **Risiko:** Sedang — menyentuh RPC pengubah data (pola sama Bagian B). Guard downgrade + CANCELLED harus benar.

### FASE 2 — Jembatan pengiriman (DIKIRIM→SAMPAI→TERKIRIM_PENUH) — **BISA SEKARANG (tabel ada)**
- **Isi:** `dispatch_delivery` +bridge `shipped_qty += dni.qty` (DESIGN §4.1) + `sp_recompute_status`; `setDeliveryStatus('delivered')` jadi RPC + recompute; `cancel_delivery` reversal `shipped_qty` + recompute(downgrade). Buka `TERKIRIM_PENUH` (Σshipped≥Σqty). Jadikan `shipped_qty` read-only di semua editor (Shipment/Edit modal) — kini bisa diketik manual (isu `AUDIT_STATUS_PENOMORAN`).
- **Prasyarat:** FASE 1 (recompute + sp_order_id terisi). `delivery_note_items.sp_order_item_id` (ada, Fase 0).
- **Ukuran:** Sedang. Risiko: **Tinggi** — mengubah makna `shipped_qty` (sumber fulfillment); guard over-ship (`CHECK shipped_qty<=qty` ada) + validasi outstanding; reversal harus simetris. Perlu tes stok/ledger.

### FASE 3 — BTB_TERBIT — **kecil, butuh penulis live**
- **Isi:** arahkan pembuatan BTB baru ke tabel `sp_btb` (bukan `sp_btbs` legacy) dengan `sp_order_id`/`customer_id` terisi; atau RPC `sp_issue_btb`. Recompute mengangkat ke BTB_TERBIT.
- **Prasyarat:** FASE 1. Keputusan: pensiun `sp_btbs` legacy vs dual-write.
- **Ukuran:** Kecil–Sedang. Risiko: Sedang (dua generasi BTB seperti dulu sp_items).

### FASE 4 — Modul Invoice (INVOICED→SUBMITTED) — **butuh modul baru**
- **Isi:** `CREATE TABLE sp_invoices` (+`sp_invoice_lines`) +RLS+GRANT (DESIGN §2.x); RPC `create_invoice` (guard Σshipped=Σqty + `increment_document_sequence` nomor invoice) + `submit_invoice` (manual→SUBMITTED); migrasi/relink `ar_ttfs`→`sp_invoices` (M7). Recompute buka INVOICED/SUBMITTED.
- **Prasyarat:** FASE 2 (TERKIRIM_PENUH sebagai gate invoice). Keputusan pemetaan finance legacy (`ar_ttfs`/`ar_btbs`/flag `inv/fp/submit/kirim`).
- **Ukuran:** Besar (tabel + RPC + UI finance + migrasi). Risiko: **Tinggi** — sentuh finance/AR yang dipakai.

### FASE 5 — Modul Payment (LUNAS) — **butuh modul baru**
- **Isi:** `CREATE TABLE sp_payments` +RLS+GRANT; RPC `record_payment` + recompute (Σpayment≥total→LUNAS). UI pembayaran.
- **Prasyarat:** FASE 4 (invoice sebagai target payment).
- **Ukuran:** Sedang–Besar. Risiko: Tinggi (uang; rekonsiliasi partial payment).

### FASE 6 — Overlay & audit (paralel) — **pendukung**
- **Isi:** RPC `sp_set_dispute(set/clear)`; `CREATE TABLE sp_audit_log` + trigger status/is_disputed/item (DESIGN §2.8/P15) → tab History; pindahkan pill UI ke 12-tahap (Tahap C).
- **Ukuran:** Sedang. Risiko: Sedang.

---

## REKOMENDASI FASE PERTAMA (paling aman & berdampak sekarang)

**Kerjakan FASE 1** — `sp_recompute_status` + wiring status di RPC yang sudah ada + **fix desync** `set_sp_status`, dengan FE **additive** (badge headline `sp_orders.status`, tanpa mengganti pill lama). Alasan:
- **Aman:** semua infra sudah ada (`sp_orders`, `picking_lists`, `sp_order_items`, RPC picking/confirm) — tak ada tabel/modul baru; reader lama tak dipecah (badge additive).
- **Berdampak:** langsung mematikan desync (`sp_orders.status` mulai hidup & benar untuk DRAFT/CONFIRMED/PICKING/PACKED), dan menegakkan pola recompute yang dipakai semua fase berikut.
- **Prasyarat murah:** cukup **isi `sp_order_id`** di 2 RPC create (picking/delivery) + tambah `UPDATE sp_orders` di 3 RPC + 1 fungsi baru. Semua DB via SQL manual + FE additive kecil.
- **Urutan dalam FASE 1:** (1) buat `sp_recompute_status` (finance di-comment); (2) `generate_picking_from_sp`/`generate_delivery_from_picking` isi `sp_order_id`; (3) `set_sp_status` +update `sp_orders` (fix desync, dgn guard downgrade/CANCELLED); (4) `generate_picking`/`completePicking` set PICKING/MENUNGGU_STOK/PACKED; (5) FE ambil `sp_orders.status` sebagai `headlineStatus` → badge di Detail SP.

**Keputusan yang perlu kamu ambil sebelum FASE 1 (dicatat, jangan diasumsikan):**
1. Definisi **PACKED** = picking `done` saja, atau `done` + minimal 1 `picking_list_materials`? (memengaruhi `completePicking`).
2. **MENUNGGU_STOK**: dihitung saat confirm (butuh cek stok di `set_sp_status`) atau hanya saat generate picking gagal stok? (DESIGN: MENUNGGU_STOK sebelum PICKING).
3. **Guard downgrade** recompute (reversal cancel_delivery) — parameter `p_allow_downgrade`? Batas bawah penurunan (jangan di bawah PACKED)?
4. **`sp_order_id` sebagai kunci recompute** (rekomendasi) vs `(customer_id, sp_no)` — konfirmasi kunci.
