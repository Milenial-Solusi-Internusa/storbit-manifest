# AUDIT + RANCANGAN — Pindah Reader Status SP ke `sp_orders.status` (satu sumber)

> **Mode:** AUDIT + RANCANGAN read-only. Tidak ada file kode/DB diubah. Satu-satunya file dibuat: dokumen ini.
> **Tanggal:** 2026-07-07 · **Branch:** `feat/sp-schema` · **Sumber DB:** `supabase/schema_snapshot.sql`.
> **Rujukan:** `AUDIT_MESIN_STATUS.md` (strategi transisi 3 tahap) · `AUDIT_STATUS_PENOMORAN.md` (sumber status).

---

## RINGKASAN

Status SP sekarang **campur 3 sumber** yang saling bertumpuk di UI: (a) `sp_items.sp_status` (draft/confirmed/cancelled, lifecycle) · (b) **fulfillment** Open/Partial/Closed yang dihitung FE dari `qty` vs `shipped_qty` ([spCalc.js:26-28](src/lib/spCalc.js:26)) · (c) `sp_orders.status` (12-tahap FASE 1, live) yang baru dibaca **hanya** di badge "Tahap:" Detail SP. Pill/tab/filter/tombol list masih pakai `toDesignStatus(g)` yang menggabung (a)+(b) → hasilnya **kontradiktif** (mis. pill "Confirmed" berdampingan badge "Tahap: PACKED", tombol "Generate Picking" muncul di SP yang sudah PACKED). **"Proper" = `sp_orders.status` jadi SATU-SATUNYA sumber status SP-level** yang dibaca pill/tab/filter/tombol; `sp_items.sp_status` & fulfillment berhenti menjadi sumber tampilan status SP (fulfillment tetap relevan sebagai *axis pengiriman* per-item, tapi bukan status headline). **Caveat FASE 1:** `sp_orders.status` belum memuat tahap pengiriman (DIKIRIM+) karena `shipped_qty` belum dijembatani — jadi setelah pindah, SP historis yang dulu "Closed" (fully shipped) akan tampil sampai PACKED saja sampai FASE 2; ini **kehilangan info kecil** tapi **menghapus kontradiksi** (jauh lebih baik dari sekarang).

---

## PETA READER STATUS

| # | Reader | file:line | Baca dari SEKARANG | Jadi baca (usul) |
|---|--------|-----------|--------------------|------------------|
| R1 | **Fulfillment per-item** (`Open/Partial/Closed`) | `spCalc.js:26-28` (`calcItem`) | `qty` vs `shipped_qty` | **TETAP** (axis pengiriman per-item, bukan status headline) |
| R2 | **`groupBySP` agregasi** `g.status` (Open/Partial/Closed) + `g.spStatus` | `App.jsx:160-213` (`spStatus` :176; agregasi :205-206) | `sp_items` (fulfillment + sp_status) | **+`g.orderStatus`/`g.hadCancelledPicking`** dari `sp_orders` (merge by `uid`) |
| R3 | **`toDesignStatus(g)`** → dstatus (OPEN/CONFIRMED/MANIFEST/CLOSED/CANCELLED) | `SalesOrderPage.jsx:72-78` | gabung `g.spStatus` + `g.status` | **ganti** → langsung `g.orderStatus` (12-tahap) |
| R4 | **Pill list** `<Pill st={g.dstatus}/>` + `STATUS_META` | `SalesOrderPage.jsx:80-87`, `:89-97`, dipakai `:673` | dstatus | `g.orderStatus` (STATUS_META di-redefinisi 12-tahap) |
| R5 | **Tabs** (Semua/Pending Konfirmasi/Manifest/History) | `SalesOrderPage.jsx:549-553` (array); filter `:353-368` | dstatus (OPEN/MANIFEST/CLOSED/CANCELLED) | grup 12-tahap (lihat §Filter&Tab) |
| R6 | **Filter status dropdown** (`statusOptions`) | `SalesOrderPage.jsx:359-360`, `:383`, `:526-528` | dstatus | 12-tahap hadir di data |
| R7 | **Tombol list** (Konfirmasi/Tolak/Manifest) `AksiCell` | `SalesOrderPage.jsx:155-169`, wired `:686-690` | dstatus (OPEN→Konfirmasi, MANIFEST→Manifest) | kondisi 12-tahap (lihat §Tombol) |
| R8 | **`handleManifest`** (tombol Manifest) | `SalesOrderPage.jsx:466-467` | **toast palsu** (tak menulis) | **hapus** (stub, tak ada makna di model baru) |
| R9 | **Detail `headerStatus`** (Cancelled/Closed/Partial/Confirmed/Open) | `SalesOrderDetailPage.jsx:747-755` | `group.spStatus` + `group.status` | `spOrder.status` (12-tahap) |
| R10 | **Detail badge "Tahap:"** + flag | `SalesOrderDetailPage.jsx:790-799` | `sp_orders` (sudah!) | **konsolidasi jadi headerStatus** (hapus duplikasi) |
| R11 | **Detail tombol Generate Picking** | `SalesOrderDetailPage.jsx:818` (`group?.spStatus === 'confirmed'`) | `sp_items.sp_status` | `spOrder.status IN ('CONFIRMED','MENUNGGU_STOK')` |
| R12 | **Detail indikator stok** (stok cukup/kurang) | `SalesOrderDetailPage.jsx:812` (`spStatus==='confirmed'`) | `sp_items.sp_status` | `spOrder.status IN ('CONFIRMED','MENUNGGU_STOK')` (atau tetap) |
| R13 | **Detail generate item-level** | `SalesOrderDetailPage.jsx:1079` (`group?.spStatus==='confirmed'`) | `sp_items.sp_status` | selaras R11 |
| R14 | **Dashboard stats** (open/partial/closed/overdue counts) | `App.jsx:1949-1958`, dipakai `:2576` | fulfillment `g.status` | **redefinisi** ke 12-tahap (atau pisah metrik pengiriman) |
| R15 | **ShipmentPage** pending = `r.status !== 'Closed'` + `StatusBadge` | `App.jsx:3719` (fn ShipmentPage), badge `:3766` | fulfillment per-item | **TETAP** (operasional pengiriman; axis berbeda) — dicatat |
| R16 | **FinancePage / OutstandingPage** | `App.jsx` (fn FinancePage/OutstandingPage) | fulfillment `r.status` | **TETAP** (axis finance/fulfillment) — dicatat |
| R17 | **exportCSV** kolom STATUS | `App.jsx:2104` (`r.status`) | fulfillment per-item | tambah kolom `sp_orders.status`? (opsional) |
| R18 | **`StatusBadge`** komponen | `App.jsx:3369` | fulfillment | dipakai R15/R16 → tetap |
| R19 | **`filteredSP`** (App.jsx, "potential reuse") | `App.jsx:1914-1943` (`filterStatus` on `g.status` :1927) | fulfillment | **cek mati/hidup**; kemungkinan dead (SalesOrderPage handle sendiri) |
| R20 | **Komponen `Manifest`** (dead) | `App.jsx:3494`, filter Open/Partial/Closed `:3570` | fulfillment | **dead** (tak dirender) — abaikan/cleanup |

**Catatan sumbu:** ada **DUA sumbu berbeda** — **status SP headline** (lifecycle+tahap, R2-R14) yang harus pindah ke `sp_orders.status`, dan **fulfillment pengiriman per-item** (R1/R15-R18) yang mengukur `shipped_qty` (operasional Shipment/Finance). Task ini soal **sumbu pertama**. Sumbu kedua tetap sampai FASE 2 menjembatani `shipped_qty` → tahap DIKIRIM+ (lalu bisa dikonsolidasi). Memaksa keduanya jadi satu sekarang = salah (sp_orders FASE 1 tak punya data pengiriman).

---

## PEMETAAN STATUS LAMA → 12 TAHAP

| Lama (dstatus / sumber) | Kondisi lama | → 12 tahap `sp_orders.status` | Catatan |
|---|---|---|---|
| **OPEN** (spStatus=draft) | belum dikonfirmasi | **DRAFT** | 1:1 |
| **CONFIRMED** (spStatus=confirmed, fulfillment Open) | dikonfirmasi | **CONFIRMED / MENUNGGU_STOK / PICKING / PACKED** | **1→banyak** — recompute FASE 1 memecah "Confirmed" jadi 4 tahap sesuai fakta |
| **MANIFEST** (fulfillment=Partial) | sebagian terkirim | **DIKIRIM** (parsial) | ⚠ **belum ada di FASE 1** (shipped_qty tak dijembatani) → tak muncul utk data baru; data historis parsial tampil ≤PACKED sampai FASE 2 |
| **CLOSED** (fulfillment=Closed) | semua terkirim | **TERKIRIM_PENUH → …→ LUNAS** | ⚠ **belum ada di FASE 1** → SP historis "Closed" tampil ≤PACKED sampai FASE 2 |
| **CANCELLED** (spStatus=cancelled) | dibatalkan | **CANCELLED** | 1:1 |
| — | — | **BTB_TERBIT / INVOICED / SUBMITTED / LUNAS** | belum ada infra (FASE 3-5); tampil apa adanya bila kelak ter-set |

**Penanganan tahap yang belum tercapai (DIKIRIM+):** UI **tampilkan apa adanya `sp_orders.status`** — untuk FASE 1 nilai maksimal = PACKED. Tak ada baris yang "berbohong": bila belum DIKIRIM, memang belum tampil DIKIRIM. Yang hilang sementara = kemampuan menandai "sudah terkirim/lunas" di pill (pindah ke FASE 2+). **Fulfillment lama (R15/R16) tetap** menampilkan progres pengiriman per-item sebagai jembatan sampai FASE 2 — jadi info pengiriman tak benar-benar hilang, hanya tak lagi jadi *status headline SP*.

---

## LOGIKA TOMBOL PER STATUS (usul)

| Tombol | Muncul saat (`sp_orders.status`) | Hilang saat | file:line sekarang |
|--------|----------------------------------|-------------|--------------------|
| **Konfirmasi / Tolak** | `DRAFT` | selain DRAFT | `SalesOrderPage.jsx:156-160` (kini `dstatus==='OPEN'`) |
| **Generate Picking List** | `CONFIRMED`, `MENUNGGU_STOK` | `PICKING`,`PACKED`,DIKIRIM+ ,DRAFT,CANCELLED | `SalesOrderDetailPage.jsx:818` (kini `spStatus==='confirmed'`) |
| **Indikator stok cukup/kurang** | `CONFIRMED`,`MENUNGGU_STOK` | selainnya | `SalesOrderDetailPage.jsx:812` |
| **Manifest** (list) | — **HAPUS** | — | `SalesOrderPage.jsx:162-165` + `handleManifest` `:466` (stub toast) |
| **(FASE 2) Lihat/Buat Surat Jalan** | `PACKED` (+DIKIRIM) | — | belum ada |
| **(nanti) Invoice/Submit/Bayar** | `TERKIRIM_PENUH`/`INVOICED`/`SUBMITTED` | — | belum ada |

**Bug yang diperbaiki:** "Generate Picking" saat PACKED → kondisi baru `IN ('CONFIRMED','MENUNGGU_STOK')` menutupnya. RPC `generate_picking_from_sp` juga sudah menolak dobel (guard "picking sudah ada"), jadi ini murni kerapian UI.

---

## DAMPAK FILTER & TAB

**Tabs sekarang** (`SalesOrderPage.jsx:549-553`): Semua · Pending Konfirmasi (OPEN) · Manifest (Partial) · History (Closed/Cancelled). **Manifest & History berbasis fulfillment** → praktis kosong di model baru FASE 1 (tak ada DIKIRIM+/Closed di sp_orders). **Perlu redefinisi** ke grup 12-tahap:

| Tab (usul) | Isi `sp_orders.status` |
|---|---|
| **Semua** | semua |
| **Pending Konfirmasi** | `DRAFT` |
| **Diproses Gudang** | `CONFIRMED`, `MENUNGGU_STOK`, `PICKING`, `PACKED` |
| **Pengiriman & Selesai** | `DIKIRIM`, `SAMPAI`, `BTB_TERBIT`, `TERKIRIM_PENUH`, `INVOICED`, `SUBMITTED`, `LUNAS` |
| **Dibatalkan** | `CANCELLED` |

(FASE 1: tab "Pengiriman & Selesai" masih kosong sampai FASE 2 — wajar; bisa disembunyikan bila kosong, atau dibiarkan sebagai kerangka.)

**Filter status dropdown** (`statusOptions` `:359`): ganti dari 5 dstatus → **12 tahap yang HADIR di data** (`new Set(g.orderStatus)`), label Indonesia per tahap. Chip filter `:383` bandingkan `g.orderStatus`. `STATUS_META` (`:80`) di-redefinisi jadi 12 entri (warna per tahap; jaga brand navy/orange/kalem, no dark green — hindari hijau pekat).

---

## FLAG `had_cancelled_picking`

- **Sekarang:** hanya di Detail SP badge (`SalesOrderDetailPage.jsx:795`).
- **Usul konsisten:** juga di **list** — marker kecil di baris SP (mis. ikon ⚠ kecil di sel Status/No SP) supaya operator tahu SP ini pernah batal picking tanpa buka detail. Sumber: `g.hadCancelledPicking` (dari merge `sp_orders`, R2). Overlay — **tak menggantikan** tahap, muncul di tahap mana pun (mirip `is_disputed`).

---

## RENCANA PEMINDAHAN BERTAHAP (JANGAN eksekusi — usulan)

Prinsip: **plumbing dulu (additive, nol perubahan tampilan) → tukar sumber → rapikan tombol/tab → bersih-bersih**. Bisa **dipecah per langkah + verifikasi**; TIDAK harus sekaligus.

**LANGKAH 0 — Plumbing (additive, risiko rendah).** Fetch `sp_orders (status, had_cancelled_picking)` untuk semua SP tampil, merge ke `groupedSP` sebagai `g.orderStatus` + `g.hadCancelledPicking` (kunci `uid = customerId|spNo`, sudah ada dari BAGIAN B). Belum ubah tampilan. **Cara fetch:** satu query `sp_orders` scoped (RLS) → map by uid, atau perluas `useSpItems`/tambah hook. **Risiko:** rendah (nol perubahan visual); verifikasi `g.orderStatus` terisi benar untuk sampel SP.
> Titik plumbing paling berisiko: `groupBySP` di `App.jsx` dipakai **list, Dashboard stats, detail group** → merge harus konsisten. Verifikasi ketiganya dapat `orderStatus`.

**LANGKAH 1 — Pill list + STATUS_META (risiko sedang).** `toDesignStatus` diganti → `g.orderStatus`; `STATUS_META` jadi 12 tahap; `<Pill>` baca `g.orderStatus`. **Efek:** kontradiksi pill-vs-badge di detail belum, tapi list langsung akurat. **Risiko:** warna/label 12 tahap; SP tanpa `orderStatus` (belum ter-recompute / legacy tanpa sp_orders) → fallback (mis. tampil dari sp_items map lama) supaya tak "undefined".

**LANGKAH 2 — Tabs + filter (risiko sedang).** Redefinisi tabs & `statusOptions` ke grup 12-tahap; `tabFiltered`/`filterStatus` bandingkan `g.orderStatus`. **Risiko:** tab lama (Manifest/History) hilang/berubah makna — pastikan tak ada kode lain bergantung nilai tab lama.

**LANGKAH 3 — Tombol list + Detail (risiko sedang).** AksiCell: Konfirmasi/Tolak hanya `DRAFT`; **hapus tombol Manifest** + `handleManifest`. Detail: `headerStatus` → `spOrder.status` (hapus duplikasi badge "Tahap:"); Generate Picking → `IN ('CONFIRMED','MENUNGGU_STOK')`; indikator stok idem. **Risiko:** menghapus stub Manifest aman (tak menulis data); pastikan `onConfirm/onReject` (yang panggil `set_sp_status`) tetap jalan.

**LANGKAH 4 — Dashboard stats (risiko sedang).** `stats` (open/partial/closed) → hitung dari `g.orderStatus` (mis. Draft/Diproses/Terkirim/Batal), atau pisah jadi 2 blok (status SP vs progres pengiriman). **Risiko:** komponen `Dashboard` mengharap bentuk `stats` tertentu — cek `modules/dashboard/Dashboard.jsx` sebelum ubah bentuk.

**LANGKAH 5 — Flag di list + polish (risiko rendah).** Marker `had_cancelled_picking` di baris list. Kosmetik.

**LANGKAH 6 — Bersih-bersih (risiko rendah, opsional).** Hapus `filteredSP`/`Manifest` dead bila terbukti mati; fulfillment R15/R16 **DIBIARKAN** (axis pengiriman, dikonsolidasi di FASE 2).

**Rekomendasi:** **bertahap** (Langkah 0 → verifikasi → 1-3 sebagai satu rilis "tukar sumber" → 4-5 → 6). Langkah 0 wajib terpisah & terverifikasi dulu (plumbing) karena semua langkah lain bergantung `g.orderStatus` terisi benar. **Jangan sekaligus** — pill/tab/tombol/dashboard semua bergantung sumber yang sama; memisah memudahkan lokalisasi bila ada SP yang `orderStatus`-nya tak sinkron.

**Risiko lintas-langkah (WAJIB ditangani):**
1. **SP tanpa `sp_orders`** (bila ada SP legacy hanya di `sp_items`, atau baru dibuat tapi dual-write gagal) → `g.orderStatus` undefined. Butuh **fallback** eksplisit (peta lama sp_items→tahap, atau label "—/Tak tersinkron") supaya list tak kosong/undefined.
2. **Desync residual:** `sp_orders.status` hanya bergerak lewat RPC FASE 1 (confirm/picking/cancel-picking/complete). SP yang datanya diubah lewat jalur lain (mis. edit item, shipment manual) **tak** memicu recompute → bisa stale. Untuk FASE 1 dampak kecil (tahap darat), tapi dicatat: pindah reader mengekspos ke-stale-an bila ada.
3. **Fulfillment tak lagi jadi status** → Shipment/Finance page tetap pakai fulfillment (benar), tapi pastikan tak ada pengguna yang mengira pill SP = status pengiriman sampai FASE 2.
4. **Verifikasi tiap langkah:** `npm run build` + lint 223 + cek visual (pill 12-tahap; tombol muncul sesuai tahap; tab menyaring benar; tak ada "Confirmed + PACKED" bersamaan).

---

## Ringkas rekomendasi
Pindahkan reader **bertahap**, mulai **Langkah 0 (plumbing `g.orderStatus`)** terverifikasi, lalu tukar sumber pill/tab/tombol/detail (Langkah 1-3), lalu Dashboard + flag. `sp_orders.status` jadi satu sumber **status SP headline**; **fulfillment per-item (Shipment/Finance) dibiarkan** sebagai axis pengiriman sampai FASE 2 menjembatani `shipped_qty` → DIKIRIM+. Sediakan **fallback** untuk SP tanpa `orderStatus`, dan hapus stub Manifest.
