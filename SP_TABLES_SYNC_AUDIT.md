# SP TABLES SYNC AUDIT — `sp_items` (legacy) ↔ `sp_orders`/`sp_order_items` (kanonik)

> Investigasi read-only hubungan tabel SP lama & baru. Sumber: `supabase/schema_snapshot.sql` + `src/lib/db.js` + `src/modules/logistics/InputSPPage.jsx`.
> **⚠️ Tidak menjalankan app/DB.** Isi function/trigger dikutip dari `schema_snapshot.sql`; bila DB live lebih baru dari snapshot, **perlu cek `pg_proc` manual di SQL Editor** (ditandai di bawah).

---

## Kesimpulan singkat: **(d) LAINNYA — dual-write HANYA saat CREATE; `sp_items` = sumber kebenaran tunggal; `sp_order_items` = mirror write-once yang tak pernah dibaca**

- **Tak ada trigger/DB-sync** yang menjaga dua tabel tetap sinkron. Satu-satunya trigger di `sp_items` = `trg_sp_items_updated_at` (hanya `updated_at`). `sp_orders`/`sp_order_items` **tak punya trigger sama sekali**.
- **CREATE** = dual-write manual di kode (sp_items **lalu** sp_orders+sp_order_items via RPC `create_sp_order_dual`), ditautkan `legacy_sp_item_id` (arah **baru→lama**).
- **EDIT** = tulis **`sp_items` saja**; `sp_order_items` **tidak** ikut diperbarui → jadi **basi** setelah edit.
- **BACA** (list/detail/edit modal) = `sp_items`. **`sp_order_items` tak pernah dibaca FE maupun oleh function DB mana pun.**
- **Status headline** (`sp_orders.status`) = **fact-derived dari `sp_items`** via `sp_recompute_status` (bukan dari `sp_order_items`).

**Sumber kebenaran SP baru saat ini = `sp_items`** (untuk item) + **`sp_orders.status`** (untuk tahap status, diturunkan dari fakta `sp_items`). `sp_order_items` **bukan** sumber kebenaran meskipun diniatkan "kanonik".

---

## 1. Trigger & Function sync

| Objek | Lokasi | Fungsi | Arah |
|---|---|---|---|
| `trg_sp_items_updated_at` (TRIGGER) | `schema:7285`, `BEFORE UPDATE ON sp_items` → `set_updated_at()` | Hanya set `updated_at`. **Bukan sync antar-tabel.** | — |
| `create_sp_order_dual(...)` (FUNCTION) | `schema:277-313` | INSERT `sp_orders` (header) + INSERT `sp_order_items` dari `p_items` jsonb; isi `legacy_sp_item_id`; `shipped_qty` **hardcode 0** (`:300`); `EXCEPTION unique_violation` untuk duplikat `(customer_id, sp_no)` | menulis tabel **baru** (dipanggil setelah sp_items ditulis) |
| `sp_recompute_status(customer_id, sp_no)` (FUNCTION) | `schema:1252`; baca `sp_items` (`sp_status`/`qty`/`shipped_qty`, `:1267/1277/1278`), `picking_lists`, `stock_summary`, `delivery_notes`, `sp_btb` | Hitung `sp_orders.status` (12 tahap) **dari fakta `sp_items`**; **tak menyentuh `sp_order_items`** | fakta `sp_items` → `sp_orders.status` |
| `set_sp_status(sp_no,status,reason,customer_id)` | `schema:1138` | Set `sp_orders.status`/cancel; PERFORM recompute | tulis `sp_orders` |
| `delete_sp_dual(...)` | `db.js:328` (komentar); RPC | Hapus `sp_orders` (+`sp_order_items` via **FK CASCADE**) **DAN** `sp_items`, dikunci komposit | hapus **dua** tabel |
| `sp_issue_btb`/`sp_delete_btb` | `schema:1215`/`1196` | Kelola `sp_btb` + recompute | — |

**TIDAK ADA** function bernama `sync_*`/`mirror_*`/`migrate_*`/`backfill_*` untuk sp_items↔sp_order_items di snapshot. **⚠️ Perlu cek `pg_proc` manual** untuk memastikan tak ada trigger/function sync yang dibuat di DB live setelah snapshot terakhir.

---

## 2. Kolom jembatan — `sp_order_items.legacy_sp_item_id`

- Definisi: `legacy_sp_item_id uuid` (`schema:4339`) di tabel `sp_order_items`. **TANPA FK.** FK `sp_order_items` hanya: `company_id`→companies (`:9291`), `product_id`→products (`:9299`), `sp_order_id`→sp_orders `ON DELETE CASCADE` (`:9307`). **Tidak ada** FK `legacy_sp_item_id → sp_items`.
- Pengisi: **hanya** `create_sp_order_dual` (`schema:304`): `NULLIF(e->>'legacy_sp_item_id','')::uuid` — nilai datang dari payload yang dikirim FE saat create.
- **Arah mirroring = BARU→LAMA**: baris `sp_order_items` menyimpan pointer (lunak) ke baris `sp_items` yang bersesuaian. Dipakai sebagai **peta audit/rollback** (per komentar `db.js:890-894`), bukan FK yang di-enforce. Tak ada kode yang MEMBACA `legacy_sp_item_id` untuk sinkronisasi balik.

---

## 3. Jalur TULIS (kode)

| Jalur | Fungsi | Tabel ditulis | Bukti |
|---|---|---|---|
| **CREATE (Input SP)** | `bulkInsertSpItems(items)` **lalu** `createSpOrderDual({...})` | **DUAL**: `sp_items` (INSERT) **+** `sp_orders`+`sp_order_items` (via RPC) | `db.js:302` (`from('sp_items')`), `db.js:895` (`rpc('create_sp_order_dual')`); dipanggil di `InputSPPage.jsx:262` ("Dual-write (D2-A)") |
| **EDIT item (Detail SP)** | `updateSpItem(id, item)` | **`sp_items` SAJA** | `db.js:311-318` (`from('sp_items').update(...)`). **Tak ada** update `sp_order_items`. |
| **Hapus 1 item** | `deleteSpItem(id)` | `sp_items` saja | `db.js:323` |
| **Hapus SP penuh** | `deleteSpDual` (RPC `delete_sp_dual`) | `sp_orders`+`sp_order_items` (CASCADE) **+** `sp_items` | `db.js:328` |
| **Status** | `setSpStatus` (RPC `set_sp_status`) | `sp_orders.status` (+recompute) | `db.js` |

**`spToDb(item)`** (`db.js:58`) = mapper untuk baris **`sp_items`** (bukan sp_order_items). Payload `create_sp_order_dual` dibangun terpisah di `InputSPPage`.

**Poin kritis:** dual-write **hanya di CREATE**. Edit/hapus-1-item menyentuh `sp_items` saja → `sp_order_items` **divergen/basi** setelah SP diedit (qty/harga berubah di `sp_items`, tidak di `sp_order_items`; `shipped_qty` di `sp_order_items` tetap 0 selamanya). Ini yang dicatat **TD-49** (removeRow item tak sentuh sp_order_items) & **TD-40** (shipped_qty kanonik tak di-sync).

---

## 4. Jalur BACA (kode)

| Tampilan | Baca dari | Bukti |
|---|---|---|
| List SP + Detail + Edit modal (item) | **`sp_items`** (via `spFromDb`) | `spFromDb(row)` `db.js:14` memetakan baris `sp_items`; semua fetch item lewat `from('sp_items')` (`db.js:286/295/305/314/352/405`) |
| Badge/headline status | **`sp_orders.status`** | `getSpOrderStatus` / `listSpOrderStatuses` (`db.js:~475/488`, `from('sp_orders')`) |
| **`sp_order_items`** | **TAK PERNAH DIBACA** | grep `src/` → `sp_order_items` hanya muncul di **komentar** (`useSpItems.js:118`, `db.js:328/889`, `InputSPPage.jsx:262`); **0** query `.from('sp_order_items')`. Di schema, satu-satunya statement DML = `INSERT` di `create_sp_order_dual` (`:291`) — **tak ada** SELECT/UPDATE `sp_order_items` di function mana pun. |

---

## 5. View / RPC gabungan

- **Tak ada view** yang menggabungkan `sp_items` + `sp_order_items`. Satu-satunya view di schema = `stock_summary` (`:4461`, security_invoker) — soal stok, tak terkait SP items.
- **Tak ada RPC** yang menyajikan gabungan dua tabel. RPC SP yang ada (`create_sp_order_dual`, `set_sp_status`, `sp_recompute_status`, `generate_picking_from_sp`, dll) semua bekerja pada `sp_items`/`sp_orders`/`picking`/`delivery`/`sp_btb` — **bukan** `sp_order_items` (kecuali INSERT sekali di create).

---

## Diagram hubungan (apa adanya)

```
                    ┌─────────────────────────────────────────────┐
   CREATE (InputSP) │  bulkInsertSpItems ──► sp_items  ◄───────────┼── SUMBER KEBENARAN
        dual-write  │        (lalu)                    │ (dibaca semua: list/detail/edit)
                    │  createSpOrderDual ──► sp_orders (header)     │
                    │        (RPC)      └─► sp_order_items          │
                    └───────────────────────────│─────────────────┘
                                                 │ legacy_sp_item_id (uuid, TANPA FK)
                                                 ▼  arah pointer: sp_order_items ──► sp_items (baru→lama)
                                       [ write-once; TAK PERNAH dibaca; basi setelah edit ]

   EDIT item ─────► updateSpItem ──► sp_items SAJA        (sp_order_items TIDAK ikut → divergen)

   STATUS ────────► sp_recompute_status  ── baca FAKTA dari sp_items ──►  set sp_orders.status
                    (sp_order_items TIDAK dipakai untuk status)
```

**Arah sync efektif:** hanya **satu momen** (CREATE) menyalin old+new bersamaan; setelah itu **`sp_items` hidup sendiri** sebagai sumber kebenaran, `sp_orders.status` mengikutinya via recompute, dan **`sp_order_items` menjadi cabang mati** (write-once mirror).

---

## Hal yang perlu verifikasi runtime / cek `pg_proc` manual

1. **Snapshot mungkin stale** — `CLAUDE.md`/PROGRESS berkali-kali mencatat `schema_snapshot.sql` belum di-refresh via `pg_dump` setelah RPC dibuat manual. **Cek `pg_proc` di SQL Editor** untuk memastikan: (a) tak ada trigger/function sync sp_items↔sp_order_items yang lebih baru dari snapshot; (b) body `create_sp_order_dual`/`sp_recompute_status` live = versi yang dikutip di sini.
2. **Isi `sp_order_items` live** — apakah benar `shipped_qty` semuanya 0 & `qty`/`unit_price` divergen dari `sp_items` untuk SP yang pernah diedit (butuh query DB: bandingkan `sp_order_items` vs `sp_items` via `legacy_sp_item_id`).
3. **`delete_sp_dual`** — body-nya ada di komentar `db.js` tapi belum tentu di snapshot (per CLAUDE "belum live/dijalankan manual"). Konfirmasi keberadaannya di `pg_proc`.

## Catatan Wajib

Audit ini **tidak menjalankan app/DB**. Semua dari pembacaan `schema_snapshot.sql` + `src/`. Function yang dikutip (`create_sp_order_dual`, `sp_recompute_status`) memang ada di snapshot; namun kebenaran versi LIVE + isi data `sp_order_items` **perlu dikonfirmasi via SQL Editor** (ditandai di atas).
