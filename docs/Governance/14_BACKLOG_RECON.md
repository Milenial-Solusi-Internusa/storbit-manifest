# BACKLOG RECON — pencocokan 20 item vs dokumen

> **Sifat:** rekonsiliasi read-only. Mencocokkan 20 item lapangan dengan yang SUDAH tercatat di `08_TECH_DEBT.md`, `10_TASK_BREAKDOWN.md`, `09_ROADMAP.md`, `CRM_FLOW_AUDIT.md`. Bukan mengerjakan, bukan menilai.
> **Klasifikasi:** SUDAH (tercatat, ada ID) · SEBAGIAN (terkait/tak persis) · BELUM (tak ada jejak) · BUKAN TASK (keputusan strategis/produk).
> **⚠️ Tidak menjalankan app.** Murni pencocokan dokumen + peek kode seperlunya (item 5 & 15 diverifikasi ke kode).

---

## Tabel Rekonsiliasi

| No | Item (ringkas) | Status | Sumber / ID bukti | Catatan |
|----|----------------|--------|-------------------|---------|
| **A1** | Dashboard boleh diberikan ke customer eksternal? Tujuan & batasan | **BUKAN TASK** | CLAUDE.md (IndomarcoDashboard ditandai **INTERNAL**, "framing customer-facing tapi halaman internal") | Keputusan produk. Framing internal SUDAH ada di kode, tapi **keputusan "boleh dibagi ke customer eksternal?"** tak terdokumentasi. Tempatkan di `09_ROADMAP` (keputusan produk). |
| **A2** | Email SP tak diterima MSI → automasi email konfirmasi ATAU API ke Indomarco | **BUKAN TASK** (+jejak tipis) | Tak ada entri persis. Terkait longgar: TD-43 (verifikasi email SMTP/n8n) | Item minta **justifikasi solusi MSI vs Indomarco** = keputusan strategis. TD-43 hanya soal verifikasi integrasi email generik, bukan intake SP dari Indomarco. Perlu keputusan + desain integrasi. |
| **A3** | Kontrak 20 DC vs aktual 44 DC — bikin akun Nexus per DC? | **BUKAN TASK** | Tak ada. CLAUDE.md/`03_DATA_MODEL` punya `dc_master` (45 DC, 36 Indomarco ter-mapping) sbg data, bukan keputusan | Pertanyaan strategis penomoran/akun. Tak ada jejak keputusan. Tempatkan di roadmap/keputusan produk. |
| **B4** | Ubah mekanisme email → email group | **BELUM** | Tak ada di dokumen mana pun | Terkait longgar TD-43 (integrasi email) tapi "email group" tak disebut. Perubahan konfigurasi/proses. |
| **B5** | Rename tombol "Tambah Deal" → "Tambah Leads" | **BELUM** | Tak ada di TD/breakdown/roadmap. **Verifikasi kode:** label ada di `PipelineKanbanPage.jsx:899` | Perubahan UI satu baris, actionable. Belum tercatat sbagai task. |
| **B6** | Tambah field currency di quotation (utk pemanggilan harga) | **SUDAH** (field) / **SEBAGIAN** (pemanggilan harga) | `09_ROADMAP:34` Quotation currency ✅ (2.10C/H/I); `quotations.currency_code` + per-baris `quotation_items.currency`/`exchange_rate` (schema) | Field currency **sudah ada**. Tapi "dipakai untuk pemanggilan harga" (auto lookup) **tidak** — harga quotation diketik manual (`CRM_FLOW_AUDIT §4.3 C2`). |
| **B7** | Diskon 5% yang boleh dilakukan sales | **SEBAGIAN** | **TD-38** (HIGH) + **H3** (10_TASK_BREAKDOWN); `09_ROADMAP:34,157` | Field diskon + **matriks otoritas diskon** (`pricingAuthority`) ADA tapi **display-only, tak nge-block** (TD-38). Enforcement batas diskon sales = belum (H3). |
| **B8** | Tambah template note di quotation | **BELUM** | Tak ada di dokumen | `quotations.notes`/`terms` ada sbg field bebas, tapi "template note" (preset) tak tercatat. |
| **B9** | Ada field belum muncul di PDF download Inquiry | **BELUM** | Tak ada di TD. `CRM_FLOW_AUDIT §3` catat Inquiry PDF ada, tak flag field hilang | Dugaan bug field-mapping PDF. **Perlu verifikasi kode** (field mana). Kandidat entri bug. |
| **B10** | Bug: Dashboard>Calendar ≠ Report Visit (dugaan field meeting/catatan `activities`) | **BELUM** | Tak ada di TD. `CRM_FLOW_AUDIT §3` catat MOM/visit di `activities.details` jsonb, tapi tak flag mismatch ini | Dugaan bug. **Perlu verifikasi runtime + kode.** Kandidat entri bug baru. |
| **C11** | Ambil sebagian data Inquiry utk PRF; sederhanakan Inquiry→PRF | **SEBAGIAN** | **`CRM_FLOW_AUDIT §4.3 C1` + tabel GAP** (Inquiry→PRF manual, hanya salin `account_id`, tak salin service/route/cargo) | Kondisi nyata **terdokumentasi di CRM_FLOW_AUDIT**, TAPI **tak ada task** utk implementasi penyalinan data di TD/breakdown. **Kandidat tech-debt baru.** |
| **C12** | Hilangkan approval Lead Pool — cukup justifikasi/remarks WAJIB | **BUKAN TASK** | Kondisi sekarang: `CRM_FLOW_AUDIT §1.4 + §4.1 A2` (justifikasi ≥20 char sudah wajib; approval manager). Terkait: TD-58/TD-61 (lifecycle lead) | Keputusan **proses/produk** (buang approval). Mekanisme sekarang terdokumentasi; perubahannya belum jadi task. Tempatkan di roadmap. |
| **C13** | Buat SO dgn detail packing list, JO, PRF, dll | **SEBAGIAN** | Gap WON→SO/fulfillment **PUTUS** di `CRM_FLOW_AUDIT §4.3 C3 + tabel GAP`. Packing list SUDAH ada (SP module, CLAUDE). JO = 📋 planned (`09_ROADMAP`/CLAUDE 3.0B "Freight→Job Order" soon) | Sebagian komponen ada (packing/SP), tapi **alur SO terintegrasi (SO+JO+PRF) bukan task** di TD/breakdown. Kandidat. |
| **C14** | Aktifkan modul Shipment utk mengaktifkan form Handover (Koh Deny) | **PERLU KONFIRMASI** | Handover form **sudah ada & ter-wire** ke WON (`CRM_FLOW_AUDIT §2 [6a/6b], §4.1 A4`); ShipmentPage ada (SP module) | Ambigu: handover **sudah aktif** (dipicu saat WON, gate nilai Rp100jt). Relasi "Shipment mengaktifkan Handover" tak terdokumentasi → perlu klarifikasi maksud. |
| **C15** | Assess apakah TOP bisa diimplementasi | **SUDAH** | `CRM_FLOW_AUDIT §2 [6c]`; `TOPRequestModal.jsx` → `top_requests` (schema); tombol "Ajukan TOP Request" `CustomerDetailPage.jsx:707`; CLAUDE 2.11V/2.15 | **Sudah diimplementasi** (FE + insert `top_requests`, auto-fill). Approval finance downstream = di luar FE (`05_WORKFLOW_MAP:72`). Assess terjawab: bisa & sudah ada. |
| **C16** | MOU di-upload ke Nexus | **BELUM** | Tak ada. `CRM_FLOW_AUDIT §3`: **nol** `storage.upload` di CRM (tak ada file upload) | Butuh Supabase Storage + kolom/tabel MOU — belum ada. `deal_handovers.msa_status` hanya text. |
| **C17** | Modul Aktivitas menarik info apakah MOU & TOP sudah ada/belum | **BELUM** | Tak ada. Modul Activities ada (ActivitiesPage) tapi tak tarik status MOU/TOP | Fitur baru. Bergantung C16 (MOU belum ada); data TOP ada (`top_requests`). Belum tercatat. |
| **C18** | Ringkas menu CRM biar tak redundant (popup/dropdown) | **SEBAGIAN** | Redundansi **dua blok render menu** dicatat di `CRM_FLOW_AUDIT §4.2 + §6.6`. Terkait tapi beda: TD-45 (granularitas gate), TD-68 (ComingSoon catch-all) | Redundansi terdokumentasi di CRM_FLOW_AUDIT, **tapi tak ada task konsolidasi menu CRM** di TD/breakdown. Kandidat. |
| **D19** | Fitur perencanaan alokasi barang/inventory ke client | **BELUM** | Tak ada. `09_ROADMAP:46-49` Inventory: hanya Stok/Penerimaan/Dashboard ✅ + Documents/WO/Routes 📋 | Fitur baru inventory. Tak tercatat. |
| **D20** | Stock monitoring: barang tiba, lama diam (aging), turnover | **BELUM** | Tak ada. Inventory Dashboard ada (movement trend, low-stock) tapi **aging/turnover tak dibangun** | Fitur baru. `stock_ledger` bisa jadi basis data, tapi KPI aging/turnover belum ada + belum tercatat. |

---

## Ringkasan Hitung

| Status | Jumlah | Item |
|--------|--------|------|
| **SUDAH** | 1 | C15 (TOP) — (+ B6 field currency SUDAH untuk field-nya) |
| **SEBAGIAN** | 5 | B6 (currency vs pemanggilan harga), B7 (diskon), C11 (Inquiry→PRF), C13 (SO+JO+PRF), C18 (ringkas menu) |
| **BELUM** | 8 | B4, B5, B8, B9, B10, C16, C17, D19, D20 |
| **BUKAN TASK** | 4 | A1, A2, A3, C12 |
| **PERLU KONFIRMASI** | 1 | C14 (Shipment→Handover, ambigu) |

*(B6 dihitung utama di SEBAGIAN karena "pemanggilan harga" belum otomatis; field-nya sendiri SUDAH.)*

---

## ⚠️ Sudah kesinggung di CRM_FLOW_AUDIT tapi BELUM masuk 08_TECH_DEBT — KANDIDAT tech-debt baru

Item berikut kondisinya **sudah dipetakan di `CRM_FLOW_AUDIT.md`** tapi **belum ada TD-xx** yang mencatatnya sebagai utang/task:

| Kandidat | Dari CRM_FLOW_AUDIT | Kenapa layak jadi TD baru |
|----------|---------------------|----------------------------|
| **C11 — Inquiry→PRF tak salin data** | §4.3 C1 + tabel GAP | Handoff RFQ→PRF manual; hanya `account_id` disalin, service/route/cargo diketik ulang. Pemborosan + rawan salah ketik. |
| **C13 — WON→SO/Fulfillment PUTUS** | §4.3 C3 + tabel GAP | `deal_handovers` = dead-end tanpa trigger/RPC; SP dibuat manual dari PO customer, nol FK ke deal/quotation/handover. **Gap arsitektural terbesar** — belum ada TD. |
| **C18 — Dua blok render menu CRM (redundant)** | §4.2 + §6.6 | Peran efektif = interseksi dua blok menu + permission data-driven → sumber miskomunikasi. Belum ada TD (beda dari TD-45/TD-68). |
| **(bonus) Celah RLS `pull_status`** | §4.1 A2 + §6.2 | `prospects_update` tak column-guard `pull_status` → approval Lead Pool hanya di-enforce client-side (relevan ke item C12). Belum ada TD spesifik (TD-39 umum). |

*(Catatan: B9 & B10 adalah dugaan bug yang bahkan belum masuk CRM_FLOW_AUDIT maupun TD → kalau terkonfirmasi runtime, keduanya juga kandidat entri bug baru.)*

---

## Catatan Wajib

Rekonsiliasi ini **tidak menjalankan app** — murni pencocokan dokumen (`08_TECH_DEBT`, `10_TASK_BREAKDOWN`, `09_ROADMAP`, `CRM_FLOW_AUDIT`) + peek kode singkat (item **B5** label tombol `PipelineKanbanPage.jsx:899`, item **C15** TOP di `CustomerDetailPage.jsx:707`/`TOPRequestModal.jsx`). Item yang **butuh verifikasi kode/runtime lebih dalam** sebelum ditindak: **B9** (field Inquiry PDF hilang — cek mapping), **B10** (mismatch Calendar vs Riwayat Visit — cek runtime + query `activities`), **C14** (maksud "Shipment mengaktifkan Handover" — klarifikasi ke pengaju). Semua klasifikasi mencerminkan isi dokumen per commit `dbfd868`.
