# AUDIT + RANCANGAN — FASE 2: Jembatan Pengiriman (shipped_qty → DIKIRIM/SAMPAI/TERKIRIM_PENUH)

> **Mode:** AUDIT + RANCANGAN read-only. Tidak ada file kode/DB diubah. Satu-satunya file dibuat: dokumen ini.
> **Tanggal:** 2026-07-07 · **Branch:** `feat/sp-schema` · **Sumber DB:** `supabase/schema_snapshot.sql`.
> **Rujukan:** `AUDIT_MESIN_STATUS.md` (roadmap) · `AUDIT_SHIPPED.md`/`AUDIT_GUDANG.md` (G-1) · `DESIGN_SP_SCHEMA.md` §4.

---

## RINGKASAN

`dispatch_delivery` (`schema:328`) memberangkatkan surat jalan (set `delivery_notes.status='in_transit'` + post `stock_ledger` unreserve+outbound) **TAPI tidak pernah menulis `shipped_qty`** → fulfillment (`qty - shipped_qty`) beku di Open, dan `sp_recompute_status` (FASE 1) mentok di PACKED. **FASE 2 = jembatan:** saat dispatch, tambah `sp_items.shipped_qty += qty terkirim` (akumulatif, idempoten karena dispatch hanya jalan sekali per DN via guard `status='draft'`), jalur identitas **`delivery_note_items → picking_list_items.sp_item_id → sp_items`** (bukan `sp_order_item_id` yang belum di-set); lalu perluas `sp_recompute_status` mengenali **TERKIRIM_PENUH** (Σshipped≥Σqty), **SAMPAI** (DN delivered), **DIKIRIM** (DN in_transit/delivered) di atas band DRAFT..PACKED. Reversal wajib disambung di `cancel_delivery` (kurangi `shipped_qty` + recompute) supaya status/fulfillment tak korup, dan transisi **delivered** perlu RPC baru (`mark_delivery_delivered`) karena sekarang plain `.update` tanpa hook recompute.

---

## ALUR PENGIRIMAN SEKARANG

| Langkah | Pemicu (FE) | RPC/fungsi | Tabel ditulis | shipped_qty? |
|---|---|---|---|---|
| Picking selesai | tombol Selesai | `complete_picking` (FASE 1) | `picking_lists.status='done'` + recompute→PACKED | — |
| Buat Surat Jalan | `handleCreateDelivery` `App.jsx:1870` | `generate_delivery_from_picking` `schema:407` | `delivery_notes` (draft) + `delivery_note_items` (dari `picking_list_items`, `qty=qty_picked`, **`sp_order_item_id` TAK di-set**) | — |
| **Berangkatkan (dispatch)** | `handleStatus('in_transit')` `DeliveryNoteDetailPage.jsx:341` → `setDeliveryStatus` `db.js` | **`dispatch_delivery`** `schema:328` | `stock_ledger` (unreserve picking + **outbound** delivery) + `delivery_notes.status='in_transit'`, `dispatched_at` | **❌ TIDAK** — di sinilah seharusnya diisi (G-1) |
| Tandai Terkirim (delivered) | `handleStatus('delivered')` `DeliveryNoteDetailPage.jsx:348` → `setDeliveryStatus` | **plain `.update`** (bukan RPC) `db.js` (`patch.delivered_at`) | `delivery_notes.status='delivered'`, `delivered_at` | ❌ tidak (dan **tak ada hook recompute**) |
| Batal Surat Jalan | `cancelDelivery` | `cancel_delivery` `schema:173` | reversal `stock_ledger` (inbound utk in_transit/delivered) + `delivery_notes.status='cancelled'` | ❌ tak balikin shipped_qty (belum ada) |

**Bukti G-1 (shipped_qty tak diisi):** `dispatch_delivery` (`schema:328-352`) — hanya `INSERT stock_ledger` (unreserved + outbound) + `UPDATE delivery_notes SET status='in_transit'`. **Nol** sentuhan `sp_items`/`sp_order_items.shipped_qty`. → fulfillment (`spCalc.js:24-28`) & recompute FASE 1 tak pernah lihat pengiriman.

**Titik "dikirim":** DIKIRIM = `delivery_notes.status='in_transit'` (dispatch). SAMPAI = `delivery_notes.status='delivered'`. CHECK status = draft/in_transit/delivered/cancelled (`schema` delivery_notes). `delivery_notes` punya `customer_id` (di-set generate_delivery pasca-BAGIAN B) + `sp_no` → **kunci komposit tersedia** untuk recompute.

---

## RANCANGAN JEMBATAN shipped_qty

### Sumber fakta & identitas (KRUSIAL)
`shipped_qty` per item bertambah = qty yang diberangkatkan di DN itu. Jalur identitas yang **benar & tersedia**:
```
delivery_note_items.picking_list_item_id → picking_list_items.sp_item_id → sp_items.id
                          (qty)                    (link)                    (target +=)
```
- `delivery_note_items`: `picking_list_item_id`, `qty` (=`qty_picked` saat generate), `product_id`, **`sp_order_item_id` NULL** (tak di-set `generate_delivery_from_picking` `schema:407` — INSERT-nya hanya `delivery_note_id, picking_list_item_id, product_id, product_name, sku, qty`). → **JANGAN pakai `sp_order_item_id`** (DESIGN §4.1 keliru di titik ini untuk DN baru).
- `picking_list_items`: `sp_item_id` (di-set `generate_picking_from_sp`) → `sp_items.id`.
- **Agregasi per `sp_item_id`** (bukan per product_id) → hindari kontaminasi antar-item produk sama.
- **`sp_order_items.shipped_qty`** (kanonik) di-update paralel via `sp_order_items.legacy_sp_item_id = sp_items.id` (map 1:1 dari backfill/dual-write), **guard CHECK `shipped_qty<=qty`**.

**Reader mana yang digerakkan:** fulfillment/list/recompute FASE 1 baca **`sp_items.shipped_qty`** → itu yang WAJIB di-update. `sp_order_items.shipped_qty` di-update juga (kanonik, untuk saat reader migrasi) — opsional tapi disarankan agar dua generasi konsisten.

### Idempotensi
Dispatch hanya bisa jalan **sekali** per DN (guard `IF v_status <> 'draft' THEN RAISE`). Jadi `+= qty` terjadi tepat sekali per DN → **idempoten tanpa flag tambahan**. Partial/N-batch = akumulatif antar-DN (tiap DN sekali).

### Draf SQL — `dispatch_delivery` (reproduksi body existing + TAMBAH jembatan; logika `stock_ledger` TAK diubah)
```sql
CREATE OR REPLACE FUNCTION public.dispatch_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
        v_status text; v_pick uuid; v_wh uuid; v_no text; v_uid uuid := auth.uid();
        v_cust uuid; v_sp text;
BEGIN
  SELECT status, picking_list_id, do_no, customer_id, sp_no
    INTO v_status, v_pick, v_no, v_cust, v_sp
    FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Hanya surat jalan draft yang bisa diberangkatkan (status=%)', v_status; END IF;
  SELECT warehouse_id INTO v_wh FROM picking_lists WHERE id=v_pick;
  v_wh := COALESCE(v_wh, '303c3d4c-570e-40a1-b738-6b0ed1cb5078');

  -- (unreserve picking + outbound delivery — TAK DIUBAH) --
  INSERT INTO stock_ledger (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT company_id, warehouse_id, product_id, 'unreserved', qty, 'picking', reference_id, reference_no, v_uid
  FROM stock_ledger WHERE reference_type='picking' AND reference_id=v_pick AND movement_type='reserved';
  INSERT INTO stock_ledger (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
  SELECT v_company, v_wh, dni.product_id, 'outbound', -abs(dni.qty), 'delivery', p_delivery_note_id, v_no, v_uid
  FROM delivery_note_items dni
  WHERE dni.delivery_note_id=p_delivery_note_id AND dni.product_id IS NOT NULL AND COALESCE(dni.qty,0) > 0;

  UPDATE delivery_notes SET status='in_transit', dispatched_at=now() WHERE id=p_delivery_note_id;

  -- ===== FASE 2: jembatan shipped_qty (akumulatif, per sp_item_id) =====
  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_items si SET shipped_qty = si.shipped_qty + agg.qty, updated_at = now()
  FROM agg WHERE si.id = agg.sp_item_id;

  -- sp_order_items (kanonik) via legacy map — guard CHECK shipped_qty<=qty
  WITH agg AS (
    SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
    FROM delivery_note_items dni
    JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
    WHERE dni.delivery_note_id = p_delivery_note_id AND COALESCE(dni.qty,0) > 0 AND pli.sp_item_id IS NOT NULL
    GROUP BY pli.sp_item_id
  )
  UPDATE sp_order_items soi SET shipped_qty = soi.shipped_qty + agg.qty, updated_at = now()
  FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id AND soi.shipped_qty + agg.qty <= soi.qty;

  PERFORM sp_recompute_status(v_cust, v_sp);
END; $fn$;
```
> **Invariant:** `qty_picked ≤ qty - shipped_qty` (picking `req = qty - shipped`), jadi `shipped_qty + qty ≤ qty` — tak over-ship. Guard `≤ soi.qty` di sp_order_items sebagai jaring pengaman CHECK.

---

## PERLUASAN `sp_recompute_status` (tahap pengiriman)

### Pembeda fakta (tinggi → rendah)
| Tahap | Fakta |
|---|---|
| **TERKIRIM_PENUH** | `Σshipped_qty ≥ Σqty` (item confirmed), Σqty>0 |
| **BTB_TERBIT** | `sp_btb` non-deleted (kerangka — belum ada penulis live, selalu false di FASE 2) |
| **SAMPAI** | ada `delivery_notes.status='delivered'` |
| **DIKIRIM** | ada `delivery_notes.status IN ('in_transit','delivered')` |
| PACKED/PICKING/MENUNGGU_STOK/CONFIRMED/DRAFT | (band FASE 1, tak berubah) |

### Integrasi ke fungsi FASE 1 (band diperluas DRAFT..TERKIRIM_PENUH; guard hanya keluar untuk INVOICED+/CANCELLED)
```sql
CREATE OR REPLACE FUNCTION public.sp_recompute_status(p_customer_id uuid, p_sp_no text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_company uuid := 'd2e5e565-5f67-4954-b8d9-5979a2a0c697';
  v_id uuid; v_status text; v_new text;
  v_confirmed bool; v_has_done bool; v_has_active bool; v_short bool;
  v_ordered int; v_shipped int; v_has_dispatch bool; v_has_delivered bool; v_has_btb bool := false;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM sp_orders WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND deleted_at IS NULL;
  IF v_id IS NULL THEN RETURN; END IF;
  IF v_status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS') THEN RETURN; END IF; -- FASE 4-5/terminal

  v_confirmed  := EXISTS(SELECT 1 FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed');
  v_has_active := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('pending','in_progress'));
  v_has_done   := EXISTS(SELECT 1 FROM picking_lists WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='done');
  v_short := EXISTS(
    SELECT 1 FROM sp_items si WHERE si.customer_id=p_customer_id AND si.sp_no=p_sp_no
       AND si.sp_status='confirmed' AND (si.qty - si.shipped_qty) > 0
       AND (si.qty - si.shipped_qty) > COALESCE(
             (SELECT SUM(ss.available) FROM stock_summary ss WHERE ss.company_id=v_company AND ss.product_id=si.product_id),0));
  -- FASE 2
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(shipped_qty),0) INTO v_ordered, v_shipped
    FROM sp_items WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND sp_status='confirmed';
  v_has_dispatch  := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status IN ('in_transit','delivered'));
  v_has_delivered := EXISTS(SELECT 1 FROM delivery_notes WHERE customer_id=p_customer_id AND sp_no=p_sp_no AND status='delivered');
  -- v_has_btb := EXISTS(... sp_btb ...);  -- FASE 3

  v_new := CASE
    WHEN v_ordered > 0 AND v_shipped >= v_ordered THEN 'TERKIRIM_PENUH'
    WHEN v_has_btb                                THEN 'BTB_TERBIT'
    WHEN v_has_delivered                          THEN 'SAMPAI'
    WHEN v_has_dispatch                           THEN 'DIKIRIM'
    WHEN v_has_done                               THEN 'PACKED'
    WHEN v_has_active                             THEN 'PICKING'
    WHEN v_confirmed AND v_short                  THEN 'MENUNGGU_STOK'
    WHEN v_confirmed                              THEN 'CONFIRMED'
    ELSE 'DRAFT' END;

  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE sp_orders SET status=v_new, updated_at=now() WHERE id=v_id AND status <> 'CANCELLED';
  END IF;
END; $fn$;
```
**Catatan:** guard FASE 1 (`NOT IN band DRAFT..PACKED → RETURN`) **diganti** jadi `IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS') → RETURN`, karena band kini meluas ke TERKIRIM_PENUH. Fact-derived → tetap bisa naik & turun (reversal). `Σshipped/Σqty` dari **`sp_items`** (sumber reader) — konsisten dengan fulfillment list.

### RPC baru untuk transisi delivered (agar SAMPAI tergerak)
`delivered` sekarang plain `.update` tanpa recompute (`db.js:setDeliveryStatus`). Perlu RPC:
```sql
CREATE OR REPLACE FUNCTION public.mark_delivery_delivered(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_status text; v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM delivery_notes WHERE id=p_delivery_note_id;
  IF v_sp IS NULL THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status <> 'in_transit' THEN RAISE EXCEPTION 'Hanya surat jalan in_transit yang bisa ditandai terkirim (status=%)', v_status; END IF;
  UPDATE delivery_notes SET status='delivered', delivered_at=now() WHERE id=p_delivery_note_id;
  PERFORM sp_recompute_status(v_cust, v_sp);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.mark_delivery_delivered(uuid) TO authenticated;
```
FE (`db.js:setDeliveryStatus`): cabang `delivered` → `rpc('mark_delivery_delivered', {p_delivery_note_id})` (ganti plain update).

---

## IDEMPOTENSI & EDGE CASE

1. **Dispatch ulang:** MUSTAHIL — `dispatch_delivery` guard `status='draft'`; DN yang sudah in_transit → RAISE. Jadi `shipped_qty += qty` sekali saja. ✅
2. **Partial (short pick):** `qty_picked < qty` → DN qty = qty_picked → `shipped += qty_picked` (< ordered) → recompute = **DIKIRIM** (bukan TERKIRIM_PENUH). ⚠ **Limitasi:** SP tak bisa generate picking kedua (guard "picking sudah ada" di `generate_picking_from_sp`), jadi sisa outstanding **mentok di DIKIRIM** — N-batch/partial-lanjutan = di luar FASE 2 (butuh relaksasi guard picking, dicatat sebagai FASE 2.x).
3. **Batal surat jalan (in_transit/delivered):** `cancel_delivery` HARUS mengembalikan `shipped_qty` + recompute, kalau tidak status/fulfillment korup (tetap TERKIRIM_PENUH padahal dibatalkan). Draf:
```sql
CREATE OR REPLACE FUNCTION public.cancel_delivery(p_delivery_note_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_status text; v_uid uuid := auth.uid(); v_cust uuid; v_sp text;
BEGIN
  SELECT status, customer_id, sp_no INTO v_status, v_cust, v_sp FROM delivery_notes WHERE id=p_delivery_note_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Surat jalan tidak ditemukan'; END IF;
  IF v_status='cancelled' THEN RAISE EXCEPTION 'Surat jalan sudah dibatalkan'; END IF;
  IF v_status IN ('in_transit','delivered') THEN
    -- (inbound reversal stock_ledger — TAK DIUBAH) --
    INSERT INTO stock_ledger (company_id, warehouse_id, product_id, movement_type, qty, reference_type, reference_id, reference_no, created_by)
    SELECT company_id, warehouse_id, product_id, 'inbound', abs(qty), 'delivery_cancel', reference_id, reference_no, v_uid
    FROM stock_ledger WHERE reference_type='delivery' AND reference_id=p_delivery_note_id AND movement_type='outbound';
    -- FASE 2: balikin shipped_qty
    WITH agg AS (
      SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
      FROM delivery_note_items dni JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
      WHERE dni.delivery_note_id=p_delivery_note_id AND COALESCE(dni.qty,0)>0 AND pli.sp_item_id IS NOT NULL
      GROUP BY pli.sp_item_id)
    UPDATE sp_items si SET shipped_qty = GREATEST(si.shipped_qty - agg.qty, 0), updated_at=now()
    FROM agg WHERE si.id = agg.sp_item_id;
    WITH agg AS ( /* sama */ SELECT pli.sp_item_id AS sp_item_id, SUM(dni.qty) AS qty
      FROM delivery_note_items dni JOIN picking_list_items pli ON pli.id = dni.picking_list_item_id
      WHERE dni.delivery_note_id=p_delivery_note_id AND COALESCE(dni.qty,0)>0 AND pli.sp_item_id IS NOT NULL
      GROUP BY pli.sp_item_id)
    UPDATE sp_order_items soi SET shipped_qty = GREATEST(soi.shipped_qty - agg.qty, 0), updated_at=now()
    FROM agg WHERE soi.legacy_sp_item_id = agg.sp_item_id;
  END IF;
  UPDATE delivery_notes SET status='cancelled', cancelled_at=now() WHERE id=p_delivery_note_id;
  IF v_cust IS NOT NULL AND v_sp IS NOT NULL THEN PERFORM sp_recompute_status(v_cust, v_sp); END IF;
END; $fn$;
```
   - `GREATEST(...-agg.qty, 0)` cegah negatif. Setelah cancel: shipped turun → recompute → jatuh ke PACKED (picking masih done) atau lebih rendah. ✅
   - **Draft DN cancel:** tak ada shipped_qty (belum dispatch) → hanya set cancelled (blok `IF in_transit/delivered` di-skip). ✅ Tak perlu recompute? Boleh panggil (harmless) — draf tetap PERFORM (status tak berubah).
4. **DN tanpa picking link** (`picking_list_item_id` NULL): agg meng-skip (`pli.sp_item_id IS NOT NULL`) → item itu tak menambah shipped_qty. Semua DN baru punya link (dari generate_delivery), jadi aman; hanya DN manual/anomali yang ter-skip (dicatat).
5. **Race dispatch 2 DN paralel 1 SP:** guard "1 DN non-cancelled per picking" + "1 picking per SP" → praktis 1 DN per SP → tak ada race multi-DN di FASE 2.

---

## DAMPAK outstanding & reader lain

`outstanding = qty - shipped_qty` dipakai:
- **Fulfillment** `calcItem` (`spCalc.js:24-28`) → status Open/Partial/Closed + `outstandingQty`. Setelah shipped_qty terisi: item bergerak Open→Partial→Closed (BENAR).
- **`groupBySP`** `totalOutstanding`, agregasi status (`App.jsx`).
- **List** kolom Outstanding (`SalesOrderPage`) + overdue.
- **`generate_picking_from_sp`** guard `(qty - shipped_qty) > 0` + `req` (`schema`): SP fully-shipped → 0 outstanding → generate picking RAISE "tak punya item outstanding". ✅ (konsisten — tak bisa re-pick yang sudah terkirim).
- **recompute** stock-short `(qty-shipped_qty) > available`.
- **ShipmentPage/FinancePage/OutstandingPage** `r.status !== 'Closed'` (`App.jsx:3719` dst) → daftar "pending" menyusut saat terkirim.

**Yang WAJIB ditahan:**
- **Logika `stock_ledger`** di dispatch/cancel (unreserve/outbound/inbound) — **JANGAN diubah** (hanya TAMBAH blok shipped_qty).
- **`generate_delivery_from_picking`** — tak disentuh (qty di DN = qty_picked).
- **Guard-guard** DN/picking (draft-only dispatch, 1-DN-per-picking) — dipertahankan (basis idempotensi).
- **Reader `sp_items`** (belum dipindah ke sp_orders) — shipped_qty di sp_items yang menggerakkannya.
- **`createSpOrderDual`/dual-write** — tak disentuh.

---

## RENCANA BERTAHAP + VERIFIKASI (JANGAN eksekusi)

> Prinsip: increment & reversal **harus sepaket** (kalau tidak, cancel meninggalkan shipped_qty menggelembung). Recompute-tier menyusul.

**LANGKAH 2A — Bridge shipped_qty (dispatch + cancel sepaket).** `CREATE OR REPLACE dispatch_delivery` (+blok shipped_qty +PERFORM recompute) **dan** `cancel_delivery` (+reversal shipped_qty +recompute). Recompute masih FASE 1 (mentok PACKED) → status belum ke DIKIRIM, TAPI **fulfillment/Outstanding mulai bergerak**. **Risiko:** sedang (nulis shipped_qty; identitas via picking link). **Verifikasi SQL:**
```sql
-- setelah dispatch 1 DN: shipped_qty naik sesuai qty DN, per item benar
SELECT si.sp_no, si.product_name, si.qty, si.shipped_qty
FROM sp_items si WHERE si.customer_id=:cust AND si.sp_no=:sp ORDER BY 2;
-- Σshipped sp_items == Σqty delivery_note_items DN itu
SELECT (SELECT COALESCE(SUM(shipped_qty),0) FROM sp_items WHERE customer_id=:cust AND sp_no=:sp) AS sp_items_shipped,
       (SELECT COALESCE(SUM(dni.qty),0) FROM delivery_note_items dni JOIN delivery_notes dn ON dn.id=dni.delivery_note_id
         WHERE dn.customer_id=:cust AND dn.sp_no=:sp AND dn.status IN ('in_transit','delivered')) AS dn_shipped;
-- batal DN → shipped_qty balik (tak negatif)
```

**LANGKAH 2B — Perluas recompute (DIKIRIM/SAMPAI/TERKIRIM_PENUH) + guard band.** `CREATE OR REPLACE sp_recompute_status` (versi FASE 2). Setelah ini dispatch→recompute→DIKIRIM/TERKIRIM_PENUH. **Risiko:** sedang (guard band berubah; pastikan tak menyentuh INVOICED+). **Verifikasi:**
```sql
-- dispatch penuh → TERKIRIM_PENUH; dispatch parsial → DIKIRIM
SELECT status FROM sp_orders WHERE customer_id=:cust AND sp_no=:sp;
-- one-shot recompute massal (opsional, seperti FASE 1 438 SP) untuk data historis ber-DN
```

**LANGKAH 2C — RPC delivered + FE.** `CREATE mark_delivery_delivered` + GRANT; `db.js:setDeliveryStatus` cabang `delivered` → rpc. **Risiko:** rendah. **Verifikasi:** DN in_transit→delivered → `sp_orders.status` = SAMPAI (bila belum TERKIRIM_PENUH) atau tetap TERKIRIM_PENUH (bila penuh).

**LANGKAH 2D — (opsional) verifikasi kanonik sp_order_items.** Pastikan `sp_order_items.shipped_qty` ikut naik/turun (via legacy map) & CHECK tak dilanggar:
```sql
SELECT soi.legacy_sp_item_id, soi.qty, soi.shipped_qty FROM sp_order_items soi
JOIN sp_orders o ON o.id=soi.sp_order_id WHERE o.customer_id=:cust AND o.sp_no=:sp;
```

**LANGKAH 2E — (prasyarat pindah reader)** setelah 2A-2C stabil, barulah aman menjalankan pemindahan reader list ke `sp_orders.status` (`AUDIT_PINDAH_READER_STATUS.md`) tanpa "info pengiriman mundur".

**Rekomendasi urutan:** **2A (sepaket dispatch+cancel) → verifikasi → 2B → 2C → 2D → baru pindah reader (2E).** Jangan gabung 2A tanpa cancel-reversal. FE hanya berubah di 2C (`setDeliveryStatus` delivered→rpc); 2A/2B murni DB (RPC replace, signature tetap → tanpa isu koeksistensi).

**Yang belum & di luar FASE 2:** partial/N-batch lanjutan (relaksasi guard picking), BTB_TERBIT (penulis `sp_btb` live), INVOICED→LUNAS (modul invoice/payment). `sp_recompute_status` sudah menyediakan kerangka `v_has_btb` (dimatikan) untuk FASE 3.
