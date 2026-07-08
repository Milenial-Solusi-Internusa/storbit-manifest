# STATUS PROYEK — Nexus by MSI (Storbit MVP)

> Ringkasan status untuk pemilik proyek. **Detail JANGAN dicari di sini** — status modul: **`docs/Governance/09_ROADMAP.md`** · sejarah pembangunan: **`docs/Governance/00_DEV_JOURNEY.md`** · utang teknis: **`docs/Governance/08_TECH_DEBT.md`**.
> Tanggal rekap: **2026-07-08** · Branch: **`feat/sp-schema`** (FASE 0-3). Status merge ke `main`/production = **perlu konfirmasi**.
> Catatan: DB dijalankan manual via SQL Editor (rekaman `supabase/migrations/`). Sebagian fitur "build clean, belum tes runtime penuh" (perlu login).

## SUDAH SELESAI

### Mesin status SP end-to-end (FASE 0-3) — LIVE s/d BTB_TERBIT
| Fase | Ringkas | Status |
|---|---|---|
| **FASE 0** | Skema baru `sp_orders`/`sp_order_items`/`sp_btb`/`dc_master` + harga kategori produk (`price_semester/tahunan/project`) + RLS + backfill (lama=baru) + dual-write InputSPPage | ✅ LIVE & terverifikasi |
| **FASE 1** | `sp_recompute_status` (fact-derived) + tahap DRAFT→CONFIRMED→MENUNGGU_STOK→PICKING→PACKED + RPC picking (generate/complete/cancel) | ✅ LIVE |
| **FASE 2** | Jembatan `shipped_qty` (dispatch/cancel) + tahap DIKIRIM/SAMPAI/TERKIRIM_PENUH + `mark_delivery_delivered` + reader status list → `sp_orders.status` (2E) | ✅ LIVE |
| **FASE 3** | BTB via `sp_issue_btb`/`sp_delete_btb` → `sp_btb`; **BTB_TERBIT = rank tertinggi** (puncak sebelum invoice); kartu BTB di Detail SP; migrasi `sp_btbs`→`sp_btb` (186→205) | ✅ LIVE & terverifikasi |

Mesin status 12 tahap: `DRAFT → CONFIRMED → MENUNGGU_STOK → PICKING → PACKED → DIKIRIM → SAMPAI → TERKIRIM_PENUH → BTB_TERBIT` (**LIVE**) → INVOICED / SUBMITTED / LUNAS (**FASE 4-5, planned**) + terminal `CANCELLED`. Detail: `09_ROADMAP` / `03_DATA_MODEL` / `05_WORKFLOW_MAP`.

### Fondasi & modul lain (fase 2.x / pra-FASE — LIVE)
Import data produksi (720 baris / 435 SP, entitas SOA) · picking / surat jalan / stok / material packing · lokasi rak · riwayat harga (kontrak/PKS) · BulkEditPrice · ProductPicker dropdown-only · modul CRM / Quotation / Rate Sheet / MOM / Asset / HRGA / Reporting · RBAC + navigasi 2-level + HomeDashboard. Sebagian belum tes runtime penuh. **Detail per-fase: `00_DEV_JOURNEY` + `PROGRESS.md`.**

## BELUM DIKERJAKAN / NEXT

| Item | Catatan |
|---|---|
| **FASE 4 — INVOICED** (modul invoice baru) | 📋 planned — mulai dari AUDIT + DESAIN (`09_ROADMAP` Next Up · `10_TASK_BREAKDOWN` H1) |
| **FASE 5 — LUNAS** (modul payment) | 📋 planned (setelah FASE 4) |
| Tech debt prioritas | enforce margin floor (**TD-38**), RLS hardening ~48 `USING(true)` (**TD-39**), drop `sp_btbs` + dead code (**TD-41**) — detail `08_TECH_DEBT` |
| Smoke test UI menyeluruh | banyak fitur belum tes runtime (perlu login berbagai role) |
| Merge `feat/sp-schema` → `main` | perlu konfirmasi status |
| Pembeda visual Inventory: produk dagang vs operasional (`inventory_class`) | TODO UI |
| Konsolidasi 3 form input produk SP | utang teknis |

## PERLU KONFIRMASI

| Hal | Status |
|---|---|
| Selisih SP 431 vs 435 (Gigih) | Menunggu; data sistem konsisten (435) |
| Mapping 30 item kontrak PKS Indomarco | Belum diverifikasi |
| Status merge `feat/sp-schema` → `main` | Perlu konfirmasi (`schema_snapshot.sql` sudah di-refresh memuat FASE 0-3) |
