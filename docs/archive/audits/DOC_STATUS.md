# DOC_STATUS.md — Peta Kondisi Dokumen `.md` di Root

> **Audit dokumentasi**, dibuat 2026-07-08. Tujuan: petakan apakah tiap dokumen `.md` di root
> mencerminkan kondisi terkini setelah **mesin status SP FASE 1-2-3 selesai & live**
> (DRAFT→…→TERKIRIM_PENUH→**BTB_TERBIT**; tersisa INVOICED/SUBMITTED/LUNAS = FASE 4-5).
> **Ini pemetaan saja — tidak ada dokumen lain yang diubah di task ini.**
>
> Legenda **kondisi**:
> - **MATCHING** — dokumen hidup (acuan aktif) yang sudah mencerminkan kondisi sekarang.
> - **OUTDATED** — dokumen hidup tapi isinya usang → perlu update.
> - **ARSIP-historis** — audit/rancangan lama = jejak proses yang **sudah dieksekusi**; sehat
>   dibiarkan sebagai arsip (TIDAK perlu update konten), tapi jangan dibaca sebagai desain kini.

---

## A. Dokumen meta / index (hidup)

| dokumen | tujuan singkat | kondisi | apa yang usang | rekomendasi |
|---|---|---|---|---|
| **CLAUDE.md** | Entry point + changelog "Recent" + aturan | **MATCHING** | Header "Current Phase" masih membingkai MVP `restruktur-nexus`, tak menyebut branch `feat/sp-schema` / FASE 1-3; **doc-table menunjuk `docs/02_...` padahal path asli `docs/Governance/02_...`** | Update ringan (opsional): sebut FASE 3 di header + betulkan path tabel dokumen |
| **PROGRESS.md** | Dev log kronologis per-tanggal | **MATCHING** | — (FASE 3 total sudah di puncak 2026-07-08) | Biarkan; lanjut append per task |
| **AGENTS.md** | Identitas produk + 15 safety rules | **MATCHING** | Baris "Current phase 2.5A" agak lama, tapi **kebijakan: AGENTS.md jangan diubah** | Biarkan (safety rules stabil) |
| **README.md** | Overview, stack, arsitektur, setup | **MATCHING** (minor) | "Current Phase — Phase 2.5A ✅ Complete" (`:228`) usang, tapi eksplisit menunjuk CLAUDE.md sbg otoritatif fase | Update 1 baris "Current Phase" atau biarkan |
| **STATUS.md** | Ringkasan status untuk pemilik proyek | **OUTDATED** | Tertanggal **2026-07-03**, branch **`restruktur-nexus`**, berhenti sebelum FASE 0-3; catatan snapshot `5a8fba2` usang; tak ada sebaran status BTB_TERBIT | **UPDATE** (ke kondisi + sebaran FASE 3) **atau** arsipkan bertanggal + buat baru |
| **TECH_DEBT.md** (root) | Audit tech-debt menyeluruh (17 Jun) | **ARSIP-historis** | Di-supersede oleh **`docs/Governance/08_TECH_DEBT.md`** (yang dirujuk CLAUDE & lebih baru); domain lain (bukan SP) | Tandai sbg arsip / tunjuk ke Governance; jangan dijadikan backlog utama |
| **DOC_STATUS.md** | (file ini) index kondisi dokumen | **MATCHING** | — | Jaga tetap sinkron saat dokumen di-update/diarsipkan |

---

## B. Cluster mesin status SP (rancangan/audit yang MENGARAH ke FASE 1-3 — kini executed)

| dokumen | tujuan singkat | kondisi | apa yang usang | rekomendasi |
|---|---|---|---|---|
| **DESIGN_SP_SCHEMA.md** | **Design spec** skema SP 12-tahap + invoice/audit | **OUTDATED** ⚠️ | **Satu-satunya doc HIDUP yang perlu update konten.** Enum `:42` + transisi `:56` menaruh **BTB_TERBIT di BAWAH TERKIRIM_PENUH** — bertentangan **keputusan baru: BTB_TERBIT = rank TERTINGGI (puncak sebelum invoice)**. Juga: `sp_btbs` "deprecated→drop" (`:184`) sudah sebagian dieksekusi; shipped_qty sudah dijembatani | **UPDATE**: flip urutan rank BTB_TERBIT↑ (§1.2/§1.3/§4.2), tandai bagian yang sudah executed |
| **AUDIT_MESIN_STATUS.md** | Audit + roadmap 6 fase mesin status | **ARSIP-historis** | Klaim "shipped_qty tak pernah naik / dispatch tak bridge" (`:29`) & "penulis `sp_btb` belum ada" (`:28`) kini **SALAH** (FASE 2A/3 live). Roadmap FASE 4-5 masih informatif | Biarkan arsip; boleh tandai FASE 1-3 **DONE**. Rujukan roadmap FASE 4-5 |
| **AUDIT_FASE2_PENGIRIMAN.md** | Rancangan FASE 2 (bridge shipped_qty) | **ARSIP-historis** | Ditulis prospektif ("butuh jembatan…", `:11`) — kini **live** (dispatch_delivery + cancel_delivery menulis shipped_qty) | Biarkan arsip (executed) |
| **AUDIT_FASE3_BTB.md** | Audit + rancangan FASE 3 BTB | **ARSIP-historis** | ⚠️ **§5.2 merekomendasikan interpretasi (a) "BTB di BAWAH TERKIRIM_PENUH"**, TAPI keputusan final = **(b) BTB tertinggi**. Jangan baca §5.2 sbg desain sekarang | Biarkan arsip **+ catatan bahwa rank di-flip** ke (b) |
| **AUDIT_SHIPPED.md** | Audit aliran `shipped_qty` | **ARSIP-historis** | Temuan utama "shipped_qty tanpa DB writer, hanya form manual" (`:12`,`:47`,`:100`) kini **SALAH** — dijembatani FASE 2A | Biarkan arsip / kandidat hapus (temuan sudah dieksekusi) |
| **AUDIT_STATUS_PENOMORAN.md** | Audit status hybrid + penomoran SP | **ARSIP-historis** | Penomoran manual (BAGIAN A) + identitas komposit `(customer_id,sp_no)` (BAGIAN B) **sudah dieksekusi**; klaim "`sp_orders.status` tak dibaca UI" (`:40`) usang | Biarkan arsip (executed) |
| **AUDIT_PINDAH_READER_STATUS.md** | Rencana pindah reader → `sp_orders.status` | **ARSIP-historis** | Rencana ini = **2E LANGKAH 0-6 SELESAI** (reader list kini baca `sp_orders.status`) | Biarkan arsip (executed) |
| **AUDIT_REDUNDANSI_SP.md** | Audit jalur create/edit SP redundant | **ARSIP-historis** | Pemensiunan jalur input SP legacy (FormModal/Import/side-panel) **sudah dieksekusi**; kini single-door InputSPPage | Biarkan arsip (executed) |

---

## C. Fondasi FASE 0 / MVP Storbit (pra-skema — semua executed)

| dokumen | tujuan singkat | kondisi | apa yang usang | rekomendasi |
|---|---|---|---|---|
| **AUDIT_E2E.md** | Audit end-to-end status + lineage (6 audit fondasi FASE 0) | **ARSIP-historis** | Temuan inti "rantai gudang **terputus** dari SP, `sp_items` tak tersentuh" (T-2) kini **DIPERBAIKI** (FASE 2A + recompute). Snapshot 2026-07-01 | Biarkan arsip; residual (RLS T-1, penomoran) sudah tercatat di tech-debt |
| **AUDIT_FINANCE.md** | Audit BTB/Invoice/AR | **ARSIP-historis** | `sp_btbs` (ops) yang diaudit kini **bermigrasi ke `sp_btb`**; invoice belum dibangun (FASE 4) | Biarkan arsip (informasi awal FASE 4) |
| **AUDIT_GUDANG.md** | Audit rantai gudang (picking→SJ→stok) | **ARSIP-historis** | G-1 "tak ada penulis balik `shipped_qty`" kini **FIXED**; residual partial/N-batch masih open | Biarkan arsip |
| **AUDIT_STOK.md** | Audit stock_ledger/summary | **ARSIP-historis** | Snapshot 2026-07-01; alur stok SP kini lengkap. Bagian SQL verifikasi masih berguna | Biarkan arsip (SQL verifikasi reusable) |
| **AUDIT_UI.md** | Audit redundansi UI penulis `sp_items` | **ARSIP-historis** | Premis "**dua generasi UI SP**" (FormModal legacy) kini **SALAH** — legacy sudah dihapus (pemensiunan) | Biarkan arsip (executed) |
| **MVP_STORBIT_RANCANGAN.md** | Rencana master 6 fase (1770 baris) | **ARSIP-historis** | Di-supersede oleh **DESIGN_SP_SCHEMA.md** (skema) + fase-fase yang sudah executed; framing masih "tanpa eksekusi" (`:3`) | Biarkan arsip (rencana awal) |
| **MVP_STORBIT_AUDIT.md** | Audit kesiapan flow 18 langkah (07-01) | **ARSIP-historis** | "Fulfillment gudang = 0 fitur" kini **SALAH** (picking/SJ live); "fix #1 status" sudah DONE | Biarkan arsip (snapshot pra-launch) |
| **MVP_STORBIT_IMPORT_AUDIT.md** | Checklist pra-import 720 baris | **ARSIP-historis** | Import **sudah dieksekusi** (720/435 SP); doc mengasumsikan "belum import" (`:123`) | Biarkan arsip (pra-import) |

---

## D. Domain lain (independen dari mesin status SP)

| dokumen | tujuan singkat | kondisi | apa yang usang | rekomendasi |
|---|---|---|---|---|
| **CRM_FLOW.md** | Peta alur CRM (Lead→…→Customer) | **MATCHING** | Independen; temuan 6 titik-putus masih relevan | Biarkan (rujukan CRM) |
| **AUDIT_CRM.md** | Audit modul CRM (scorecard + temuan) | **MATCHING** (living backlog) | Independen; mayoritas temuan (token dup, non-atomik, audit trail) masih OPEN di tech-debt | Biarkan (rujukan refactor CRM) |
| **RBAC_AUDIT.md** | Audit RBAC/akses menyeluruh | **MATCHING** (living backlog) | Independen; temuan F1/F2 (RLS `USING(true)`, sales over-permission) masih OPEN (TD-01/06) | Biarkan (rujukan hardening) |
| **AUDIT_ACCOUNTS_RLS.md** | Incident: dropdown Customer kosong utk role `operations` | **MATCHING** (living backlog) ⚠️ | Diagnosis valid (RLS `prospects_read` + `is_manager_or_above` mengecualikan operations). **PERLU VERIFIKASI apakah fix Opsi A′ sudah live** | Biarkan (rujukan TD-01); **cek status fix** |
| **ACTIVITY_UI_MAP.md** | Rencana migrasi Call/Visit → `activities` | **ARSIP-historis** / OUTDATED | Klaim "**0 file FE menyentuh `activities`**" (`:7-8`) usang — cutover `activities`/`activity_logs` (2.9D) sudah jalan (TD-18) | Biarkan arsip (migrasi executed) atau update header status |
| **AUDIT.md** | Audit logic halaman status SP (scratch, 2026-06) | **ARSIP-historis** | Count & sebagian temuan usang; kontradiksi fulfillment vs `sp_status` kini terkonsolidasi via 2E | Biarkan arsip (snapshot lama) |

---

## Ringkasan tindakan (prioritas)

**Perlu update (dokumen HIDUP yang usang):**
1. **DESIGN_SP_SCHEMA.md** — ⚠️ prioritas: flip rank **BTB_TERBIT ke TERTINGGI** (di atas TERKIRIM_PENUH), tandai bagian yang sudah executed. Ini satu-satunya *design doc* aktif yang isinya kontradiktif dengan keputusan bisnis baru.
2. **STATUS.md** — refresh ke kondisi terkini (branch, FASE 1-3, sebaran status) atau arsipkan bertanggal.
3. **CLAUDE.md** (opsional, ringan) — sebut FASE 3 di header "Current Phase" + betulkan path tabel dokumen (`docs/Governance/…`).
4. **README.md** (opsional, ringan) — baris "Current Phase".

**Cukup jadi ARSIP (jejak proses sudah dieksekusi — jangan buang waktu meng-update):**
- Cluster SP: AUDIT_MESIN_STATUS, AUDIT_FASE2_PENGIRIMAN, AUDIT_FASE3_BTB, AUDIT_SHIPPED, AUDIT_STATUS_PENOMORAN, AUDIT_PINDAH_READER_STATUS, AUDIT_REDUNDANSI_SP.
- Fondasi FASE 0/MVP: AUDIT_E2E, AUDIT_FINANCE, AUDIT_GUDANG, AUDIT_STOK, AUDIT_UI, MVP_STORBIT_RANCANGAN, MVP_STORBIT_AUDIT, MVP_STORBIT_IMPORT_AUDIT.
- Lain: ACTIVITY_UI_MAP, AUDIT.md, TECH_DEBT.md (root).
- **Saran opsional:** pindahkan file ARSIP-historis ke `docs/archive/` agar root tak ramai (16 dari 28 file = jejak proses). Bukan keharusan.

**Living backlog domain lain (biarkan sbg rujukan, temuan masih open):** CRM_FLOW, AUDIT_CRM, RBAC_AUDIT, AUDIT_ACCOUNTS_RLS.

**Catatan lintas-dokumen:**
- Banyak doc lama membawa TODO "⚠️ refresh `schema_snapshot.sql`" — **kini sudah di-refresh (termasuk FASE 3)**, jadi TODO itu resolved; abaikan di doc lama.
- ⚠️ **AUDIT_FASE3_BTB.md §5.2** dan **DESIGN_SP_SCHEMA.md enum** sama-sama memuat urutan rank BTB **LAMA** (di bawah TERKIRIM_PENUH). Keputusan final = **BTB tertinggi**. DESIGN perlu diperbaiki; AUDIT_FASE3 cukup ditandai arsip.
- Root **TECH_DEBT.md** dan **docs/Governance/08_TECH_DEBT.md** duplikatif — Governance yang dirujuk CLAUDE = otoritatif.
