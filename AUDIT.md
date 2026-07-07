# AUDIT — Status & Logika Halaman SP Manifest (Sales Order / SP)

> Scope: halaman list SP (`src/modules/logistics/SalesOrderPage.jsx`), sumber data
> `sp_items` via `App.jsx groupBySP` + `src/lib/spCalc.js calcItem` + `src/lib/db.js`.
> Murni laporan (read-only). Tidak ada kode/DB/CLAUDE.md yang diubah; hanya dokumen ini
> ditulis (menimpa isi lama). DB dibaca dari `supabase/schema_snapshot.sql`.

Rantai render: `App.jsx:1476 useSpItems` → `db.js:284 listSpItems` (`select('*, customers:accounts!sp_items_customer_id_fkey(name)')`, **tanpa filter apa pun**) → `App.jsx:1889 groupedSP = groupBySP(rows)` → `App.jsx:2634 <SalesOrderPage groupedSP=… onRefresh={refreshSp} />` → `SalesOrderPage:345 toDesignStatus`.

---

## RINGKASAN

**Status SP di halaman ini HYBRID: sebagian MANUAL (DB), sebagian AUTO (dihitung di frontend), digabung jadi satu pill.** Tidak ada satu sumber kebenaran.

- **Manual (DB):** kolom `sp_items.sp_status` (`draft` / `confirmed` / `cancelled`). Hanya berubah saat user klik **Konfirmasi/Tolak** → RPC `set_sp_status` (`db.js:330`, fungsi DB `schema:900`). **Tidak ada trigger DB** yang menyentuh status — satu-satunya trigger di `sp_items` adalah `trg_sp_items_updated_at` untuk `updated_at` (`schema:6636`).
- **Auto (dihitung FE, bukan DB):** status fulfillment `Open` / `Partial` / `Closed` dihitung dari `qty` vs `shipped_qty` di `spCalc.js:26-28`, di-agregasi per-SP di `App.jsx:200-206`. Ini BUKAN kolom DB — tak pernah tersimpan.
- **Penggabungan:** `toDesignStatus` (`SalesOrderPage:72-78`) memilih SATU label dengan precedence `cancelled` > `Closed` > `Partial(=Manifest)` > `confirmed` > `Open`. **Status fulfillment (Closed/Partial) menimpa `sp_status`** — akar beberapa risiko di bawah.

Alur singkat 1 SP: input (`draft`) → **Konfirmasi** (manual → `confirmed`, `confirmed_at/by` diisi) → *(idealnya)* manifest/kirim. Tapi tahap "kirim" tak punya workflow yang menulis `shipped_qty` selain edit manual, dan tombol **Manifest** hanya toast kosong (`SalesOrderPage:465-468`). "Expired"/overdue murni **visual**, tak pernah mengubah status.

---

## PETA STATUS

### A. `sp_status` — status lifecycle (MANUAL, tersimpan di DB)
| Nilai | Definisi | Yang men-set | Kapan |
|---|---|---|---|
| `draft` | kolom `sp_items.sp_status DEFAULT 'draft'`, CHECK `('draft','confirmed','cancelled')` (tabel `sp_items`) | Default insert (`spToDb` **tidak** mengirim `sp_status` → DB pakai default) | Saat SP dibuat/import |
| `confirmed` | idem | RPC `set_sp_status` via tombol **Konfirmasi** (`SalesOrderPage:447,450` → `db.js:330` → `schema:900-925`) | Klik Konfirmasi → `sp_status='confirmed'`, `confirmed_at=now()`, `confirmed_by=auth.uid()` (`schema:913-915`) |
| `cancelled` | idem | RPC `set_sp_status` via tombol **Tolak** | Klik Tolak → `cancelled_at/by`, `cancel_reason` (`schema:916-918`) |

Dibaca FE `db.js:46` `spStatus: row.sp_status || 'draft'`; dipakai `groupBySP` `App.jsx:173`.
**Tidak ada auto-transition di DB** — `set_sp_status` hanya dipicu manual; tak ada trigger/cron.

### B. Status fulfillment `Open` / `Partial` / `Closed` (AUTO, dihitung FE — TIDAK tersimpan)
- Per item (`spCalc.js:24-28`): `outstandingQty = qty − shippedQty`; `Closed` bila `outstandingQty===0 && qty>0`; `Partial` bila `shippedQty>0 && outstandingQty>0`; selain itu `Open`.
- Per SP (`App.jsx:200-206`): `Closed` bila semua item Closed; `Open` bila semua item Open; selain itu `Partial`.
- `shipped_qty` editable manual (`App.jsx:4371`, `:4514`) tapi **read-only** di Detail SP (`SalesOrderDetailPage:343`). Tak ada workflow otomatis pengisi.

### C. Label pill (dstatus) — hasil merge B menimpa A (`SalesOrderPage:72-86`)
| dstatus | Kondisi (`toDesignStatus`) | Pill |
|---|---|---|
| `CANCELLED` | `spStatus==='cancelled'` | Cancelled (merah) |
| `CLOSED` | `status==='Closed'` | Closed (hijau) |
| `MANIFEST` | `status==='Partial'` | Manifest (indigo) |
| `CONFIRMED` | `spStatus==='confirmed'` | Confirmed (navy) |
| `OPEN` | selain di atas | Open (amber) |

**Semua kemungkinan nilai:** DB `sp_status`={draft,confirmed,cancelled}; fulfillment FE={Open,Partial,Closed}; pill={OPEN,CONFIRMED,MANIFEST,CLOSED,CANCELLED} (`STATUS_ORDER` `SalesOrderPage:87`). **Tidak ada** nilai "Expired"/"Terkirim" sebagai status — "Expired" hanya flag visual `isOverdue`.

### D. Flag boolean terpisah (tak masuk pill)
`inv`, `fp`, `submit`, `kirim` (boolean di `sp_items`; editable `App.jsx:4407-4410`) → hanya untuk `financePct` (`App.jsx:210-212`). Kolom Finance Progress sudah dibuang dari list → flag ini **tak terlihat** & **tak sinkron** dengan pill.

---

## LOGIKA TAB

Sumber: `SalesOrderPage:351-356` (counts) & `:365-370` (filter). Semua **client-side** atas `augmented` (= `groupedSP` + `dstatus`).

| Tab | Definisi tepat | Angka |
|---|---|---|
| **Semua SP** | `augmented.length` = jumlah SP unik (distinct `sp_no`) dari SELURUH baris `sp_items` yang ter-fetch | **437** |
| **Pending Konfirmasi** | `dstatus === 'OPEN'` → praktis `sp_status='draft'` **dan** semua item belum dikirim | **2** |
| **Manifest** | `dstatus === 'MANIFEST'` → `status==='Partial'` (ada item terkirim sebagian) | **0** |
| **History** | `dstatus === 'CLOSED' \|\| 'CANCELLED'` | **346** |

**Aritmetika sisa:** 437 − 2 − 0 − 346 = **89 SP ber-dstatus `CONFIRMED`** yang **tidak punya tab** (hanya di "Semua SP" atau via dropdown filter Status).

### Kenapa Manifest = 0 (padahal Semua SP = 437)?
**Bukan acak — kondisi filter yang praktis tak pernah terpenuhi.** `MANIFEST` menuntut `status==='Partial'` = SP dengan pengiriman **parsial** (`0 < shipped_qty < qty`) atau campuran item Open+Closed. Padahal:
1. Import mengisi `shipped_qty` hanya **0 (Open)** atau **=qty (Closed)** (CLAUDE.md: "shipped_qty Closed→qty & TROLLY→qty") → hampir tak ada parsial.
2. Tak ada workflow penghasil pengiriman parsial: tombol **Manifest** hanya `showToast(... 'dibuat ✓')` tanpa sentuh DB (`SalesOrderPage:465-468`); `shipped_qty` read-only di Detail (`SalesOrderDetailPage:343`).

→ Manifest=0 **wajar secara data, tapi menyesatkan secara workflow**: 89 SP `CONFIRMED` yang menunggu diproses tak muncul di tab manapun kecuali "Semua SP" (lihat H-2/H-3). Tab ini efektif mati.

### Apakah 437 = semua customer?
**Ya.** `listSpItems` (`db.js:284-289`) `select('*, …')` **tanpa** `.eq('customer_id',…)`, tanpa `company_id` (kolom tak ada), tanpa `deleted_at` (kolom tak ada). RLS `sp_items_read = USING(true)` (`schema:10932`) → tiap user authenticated baca SELURUH `sp_items` lintas customer. Jadi 437 = distinct `sp_no` semua customer (bandingkan dashboard Indomarco = 425). Tak ada penyaringan entitas/customer di halaman ini.

---

## KOLOM TURUNAN

### Outstanding (`SalesOrderPage:668-670`, sumber `g.totalOutstanding`)
- `outstandingQty = qty − shipped_qty` per item (`spCalc.js:24`) → `g.totalOutstanding = Σ` (`App.jsx:187`).
- Warna **merah HANYA bila `g.isOverdue`** (`SalesOrderPage:668`), bukan sekadar `>0`.

### Expired (`SalesOrderPage:676-678`)
- Menampilkan `g.expired_date || g.deadline`, keduanya dari kolom **`sp_items.expired_date`** (`db.js:27-28` `expired_date`/`deadline` = `row.expired_date`; `App.jsx:174-175`).
- **Dua kolom tanggal di `sp_items`: `exp_date` & `expired_date`.**
  - **`expired_date` = DIPAKAI** untuk kolom Expired **dan** `isOverdue`.
  - **`exp_date` = TIDAK dipakai** untuk status/overdue/Expired. Di-map ke `expDate` (`db.js:26`), hanya jadi field input "EXP Date" (`App.jsx:4378`, `InputSPPage:726`, `SalesOrderDetailPage:353`) + kolom CSV (`App.jsx:2130`). **Deprecated untuk logika status** (di import keduanya diisi nilai sama — CLAUDE.md).

### Overdue (checkbox "Overdue only", `SalesOrderPage:384`, sumber `g.isOverdue`)
- Per item (`spCalc.js:30-36`): `deadlineField = item.expired_date || item.deadline` (= `expired_date`); overdue bila ada **dan** `status !== 'Closed'` **dan** `new Date(deadlineField) < today`.
- Per SP (`App.jsx:207`): `isOverdue = g.items.some(i => i.isOverdue)`.
- Memakai **`expired_date`**, bukan `exp_date`. `today = new Date()` (dengan jam) dibanding tanggal tengah-malam → SP expired **hari ini** langsung overdue (edge, LOW).

---

## TEMUAN & RISIKO

### H-1 (HIGH) — Fulfillment menimpa `sp_status`; pill bisa berbohong soal lifecycle
`toDesignStatus` cek `Closed`/`Partial` **sebelum** `confirmed` (`SalesOrderPage:74-76`).
- **Dampak:** SP `sp_status='draft'` (belum pernah dikonfirmasi) tapi semua item `shipped_qty=qty` → pill **CLOSED** & masuk **History**, seolah selesai/di-approve. SP `confirmed` yang closed juga kehilangan jejak "confirmed" di pill.
- **Rekomendasi:** pisah dua dimensi (lifecycle vs fulfillment) jadi dua badge/kolom, atau precedence yang tak menyembunyikan `draft` di balik `Closed`.

### H-2 (HIGH) — Tab "Manifest" praktis selalu 0 & tak cermin pekerjaan nyata
`MANIFEST=status==='Partial'` (`SalesOrderPage:367`), sedang data tak pernah parsial (import 0/penuh; tombol Manifest no-op; `shipped_qty` read-only di Detail).
- **Dampak:** "Manifest (0)" bikin user kira tak ada yang perlu di-manifest, padahal 89 SP `CONFIRMED` menunggu.
- **Bukti:** `SalesOrderPage:354,367` + `:465-468` + `SalesOrderDetailPage:343`.
- **Rekomendasi:** basis tab Manifest = `CONFIRMED` (siap manifest), atau nonaktifkan sampai workflow pengiriman parsial nyata (Picking/Surat Jalan) ada.

### H-3 (HIGH) — SP `CONFIRMED` hilang dari alur ber-tab
Setelah dikonfirmasi, SP → `CONFIRMED`, keluar dari Pending, tak masuk Manifest (butuh Partial) / History (butuh Closed/Cancelled). 89 SP hanya di "Semua SP".
- **Dampak:** habis klik Konfirmasi, SP seakan "menghilang" dari papan kerja.
- **Bukti:** counts `SalesOrderPage:351-356` tak memuat CONFIRMED.
- **Rekomendasi:** tambah tab/segmen "Confirmed / Siap Manifest".

### H-4 (HIGH) — Tombol "Manifest" memberi SUKSES PALSU
`handleManifest` (`SalesOrderPage:465-468`) `showToast('Manifest … dibuat ✓','success')` **tanpa** perubahan DB (komentar `// TODO`).
- **Dampak:** user yakin manifest dibuat padahal tak ada yang tersimpan — menyesatkan operasional.
- **Rekomendasi:** disable / arahkan ke Picking/Surat Jalan; jangan toast sukses untuk aksi kosong.

### H-5 (HIGH) — Tak ada single source of truth; 3 dimensi status bisa desync
(A) `sp_status` DB, (B) fulfillment FE dari `shipped_qty`, (C) flag `inv/fp/submit/kirim` — independen, tanpa penjaga konsistensi. Pill menggabungkan A+B (B menimpa A); C tak tampil sama sekali (kolom Finance Progress dibuang).
- **Contoh desync:** `sp_status='confirmed'` tapi semua `kirim=true`; atau `submit=false` padahal fulfillment Closed — tak ada yang menjaga/menampilkan.
- **Bukti:** A `db.js:46`; B `spCalc.js:26-28`; C `App.jsx:191-194,210-212` + `App.jsx:4407-4410`.
- **Rekomendasi:** satu state machine (lifecycle) sebagai sumber kebenaran; fulfillment & finance jadi atribut, bukan status saingan.

### H-6 (HIGH) — `set_sp_status` & RLS tanpa otorisasi role/customer
`set_sp_status` (`schema:900-925`, SECURITY DEFINER) tak cek role/kepemilikan; RLS `sp_items` **`USING(true)`** untuk SELECT/INSERT/UPDATE/DELETE (`schema:10918-10939`).
- **Dampak:** tiap user authenticated bisa baca/Konfirmasi/Tolak/hapus SP customer mana pun lintas entitas; gating hanya di visibilitas menu FE. Bertentangan dengan AGENTS.md (RLS wajib company/role-scoped) — status bisa diubah pihak tak berwenang.
- **Rekomendasi:** otorisasi di RPC + perketat RLS (perlu approval; di luar eksekusi audit).

### M-1 (MEDIUM) — `SELECT *` + fetch semua baris tanpa pagination server
`db.js:284-289` menarik seluruh `sp_items` (semua customer) `select('*')`, agregasi/pagination di client (`SalesOrderPage`).
- **Dampak:** melanggar aturan performa AGENTS.md ("no SELECT *, server-side pagination"); beban naik seiring data; penyebab langsung "437 = semua customer".
- **Rekomendasi:** kolom eksplisit + pagination/scope server-side.

### M-2 (MEDIUM) — `exp_date` vs `expired_date` rawan salah edit
Field "EXP Date" menulis `exp_date` (`App.jsx:4378` → `db.js:70`), tapi overdue/Expired baca `expired_date` (`spCalc.js:32`).
- **Dampak:** user edit "EXP Date" berharap Expired/overdue berubah — tak terjadi. Dua kolom kembar, hanya satu berlogika.
- **Rekomendasi:** satukan/labeli jelas; tandai `exp_date` deprecated atau hubungkan ke logika.

### L-1 (LOW) — Simbol "✓" pada toast
`SalesOrderPage:460` (`dikonfirmasi ✓`) & `:467` (`dibuat ✓`). Brand "no emoji"; ✓ simbol Unicode, kosmetik.

### L-2 (LOW) — Overdue timezone/off-by-one
`spCalc.js:30,35` bandingkan `new Date(date)` (tengah malam) `< new Date()` (dengan jam) → expired hari-ini langsung overdue.

---

## DIAGRAM ALUR (teks) — perjalanan satu SP

```
[INPUT SP]  (Input SP / import)
  DB: sp_status = 'draft' (default),  shipped_qty = 0
  FE: fulfillment = Open  →  dstatus = OPEN (amber)
  Tab: PENDING KONFIRMASI            ← "2" = 2 SP draft & belum dikirim
        │
        │  user klik KONFIRMASI  [MANUAL]  (RPC set_sp_status → 'confirmed',
        │                                    confirmed_at/by diisi)
        ▼
[CONFIRMED]
  DB: sp_status = 'confirmed',  shipped_qty masih 0
  FE: fulfillment = Open  →  precedence: confirmed  →  dstatus = CONFIRMED (navy)
  Tab: (TIDAK ADA)  → hanya "Semua SP"       ← "89" SP nyangkut di sini
        │
        │  (idealnya) pengiriman menaikkan shipped_qty
        │  ⚠ tombol "Manifest" = toast kosong; shipped_qty read-only di Detail;
        │    satu-satunya jalan = edit manual "Shipped QTY" (App.jsx:4371)
        ▼
[SEBAGIAN TERKIRIM]   (0 < shipped_qty < qty — jarang terjadi)
  FE: fulfillment = Partial  →  dstatus = MANIFEST (indigo)  [AUTO dari FE]
  Tab: MANIFEST                      ← "0" karena data tak pernah parsial
        │
        │  shipped_qty = qty  (semua item)
        ▼
[SELESAI]
  FE: fulfillment = Closed  →  dstatus = CLOSED (hijau)  [AUTO, menimpa sp_status]
  Tab: HISTORY                       ← bagian dari "346"

[JALUR TOLAK]  dari OPEN:
  user klik TOLAK (wajib alasan) → RPC set_sp_status → 'cancelled'
  (cancelled_at/by/cancel_reason diisi)  →  dstatus = CANCELLED (merah, precedence tertinggi)
  Tab: HISTORY                       ← bagian dari "346"

[OVERLAY: EXPIRED / OVERDUE]  — VISUAL saja, TIDAK mengubah status:
  bila expired_date < hari ini  &&  fulfillment != Closed
    → isOverdue = true → Outstanding merah + tanggal Expired amber + lolos "Overdue only".
    sp_status & pill TIDAK berubah (tak ada status "Expired").
```

**Konsistensi:** `sp_status` (draft/confirmed/cancelled) hanya berubah **manual** via `set_sp_status`. Fulfillment (Open/Partial/Closed) berubah **otomatis di FE** mengikuti `shipped_qty` dan **menimpa** tampilan `sp_status`. Karena penulisan `shipped_qty` tak punya workflow (selain edit manual), transisi CONFIRMED→MANIFEST→CLOSED praktis macet kecuali diedit tangan. **Tidak ada trigger/cron DB** yang menggerakkan status.
