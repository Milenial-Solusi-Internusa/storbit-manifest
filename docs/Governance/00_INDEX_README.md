# NEXUS BY MSI — Documentation Index

> Master index seluruh dokumentasi. Mulai dari sini. Untuk konteks coding cepat → `CLAUDE.md` (lean entry point). Identitas produk + safety rules → `AGENTS.md`.

---

## Quick Start untuk Claude Code

Urutan baca yang direkomendasikan **sebelum mulai task apa pun:**

1. **`CLAUDE.md`** — lean entry point (stack, quick ref, aturan 1-liner, current phase, known issues). WAJIB.
2. **`AGENTS.md`** — identitas produk, prinsip engineering, **15 safety rules**, workflow per tipe task.
3. **`docs/02_RULES_GOVERNANCE.md`** — konvensi kode + pola wajib frontend/DB + Do/Don't.

Lalu sesuai tipe task (lihat "Cara Pakai" di bawah).

---

## Daftar Dokumen

| File | Deskripsi | Update terakhir |
|------|-----------|-----------------|
| `CLAUDE.md` | Lean entry point — quick ref, aturan, current phase, known issues | 2026-06-22 |
| `AGENTS.md` | Identitas produk, prinsip, 15 safety rules, workflow per task | 2026-06-14 |
| `PROGRESS.md` (root) | Dev log kronologis per-tanggal | tiap session |
| `docs/00_INDEX_README.md` | **(file ini)** Master index dokumentasi | 2026-06-22 |
| `docs/00_DEV_JOURNEY.md` | **DEV JOURNEY** — timeline kronologis + inventaris fitur LIVE per domain + arsip fase verbatim (eks `00_ARCHIVE_PHASES`) | 2026-07-08 |
| `docs/01_PRD_NEXUS.md` | Product Requirements — vision, entitas, modul, NFR, out of scope | 2026-06-22 |
| `docs/02_RULES_GOVERNANCE.md` | Konvensi kode, pola wajib FE/DB, brand, Do/Don't, workflow | 2026-06-22 |
| `docs/03_DATA_MODEL.md` | Referensi DB: 73 tabel per modul, entity UUID, RLS, RPC, gotchas | 2026-06-22 |
| `docs/04_ROLE_PERMISSION_MATRIX.md` | RBAC: 13 role, hierarki, permission matrix, RLS functions, gaps | 2026-06-22 |
| `docs/05_WORKFLOW_MAP.md` | Alur bisnis per modul (CRM/Foundation/Service/Logistics/Inventory) | 2026-06-22 |
| `docs/06_UI_UX_FLOW.md` | Design system: brand tokens, layout, komponen, larangan, pola PDF, responsive | 2026-06-22 |
| `docs/07_API_REPOSITORY.md` | Supabase patterns, RPC, Edge Functions, query patterns, error handling | 2026-06-22 |
| `docs/08_TECH_DEBT.md` | Daftar tech debt (TD-01…TD-31) + prioritas fix | 2026-06-22 |
| `docs/09_ROADMAP.md` | Status modul, milestone, next up | 2026-06-22 |
| `docs/10_TASK_BREAKDOWN.md` | Task aktif & backlog konkret + template task baru | 2026-06-22 |
| `docs/architecture/`, `docs/database/`, `docs/security/`, `docs/workflow/`, `docs/integration/`, `docs/performance/`, `docs/operations/`, `docs/modules/` | (pre-existing, Fase 0.1) blueprint, baseline, dll — lihat "Required Reading" di `AGENTS.md` | [TODO: verifikasi keberadaan/isi tiap file referenced di AGENTS.md] |

> **Dokumen 11-18 sudah diserap ke canon 00-10 lalu diarsipkan** ke `docs/archive/audits/` (konsolidasi governance, 17 Jul 2026): **11**→`02 §8` (QA Checklist), **12**→`10` (Template Change Request) + rollback CR-002 di `08` TD-01, **13-18** (audit CRM/SP/input/pending)→diserap jadi TD di `08` / task di `10` / keputusan di `09`. File aslinya tetap bisa dibaca di `docs/archive/audits/` sebagai rekaman historis.

---

## Cara Pakai Dokumentasi Ini

| Skenario | Baca |
|----------|------|
| **Onboarding (baru kenal proyek)** | `CLAUDE.md` → `AGENTS.md` → `docs/01_PRD_NEXUS.md` → `docs/09_ROADMAP.md` → `docs/03_DATA_MODEL.md` |
| **Mulai task fitur baru** | `CLAUDE.md` → `docs/02_RULES_GOVERNANCE.md` → `docs/10_TASK_BREAKDOWN.md` → `docs/05_WORKFLOW_MAP.md` (modul terkait) → `docs/06_UI_UX_FLOW.md` |
| **Task bug/audit** | `CLAUDE.md` → `docs/08_TECH_DEBT.md` → `docs/03_DATA_MODEL.md` (gotchas) → `docs/07_API_REPOSITORY.md` (error patterns) |
| **DB / schema / RLS change** | `docs/02_RULES_GOVERNANCE.md §4` → `docs/03_DATA_MODEL.md` → `docs/04_ROLE_PERMISSION_MATRIX.md` → `docs/02_RULES_GOVERNANCE.md §4` + `§7` (DB Change Checklist) → `docs/10_TASK_BREAKDOWN.md` (Template Change Request) |
| **Kerja UI / styling / PDF** | `docs/06_UI_UX_FLOW.md` → `docs/02_RULES_GOVERNANCE.md §5` |
| **Sebelum push/deploy** | `docs/02_RULES_GOVERNANCE.md §8` (QA Checklist) |
| **Cari histori implementasi fase lama** | `docs/00_DEV_JOURNEY.md` (Bagian 3 arsip) + git history `CLAUDE.md` + `PROGRESS.md` |

**Prinsip:** saat dokumen & `CLAUDE.md` berbeda, **defer ke `CLAUDE.md`** (paling dinamis). Untuk struktur DB, sumber kebenaran = `supabase/schema_snapshot.sql`. Untuk safety rules, sumber = `AGENTS.md`.

---

## Status Dokumentasi

| Dokumen | Status |
|---------|--------|
| 02, 03, 08, 09 (Fase 1) | ✅ Complete |
| 00_DEV_JOURNEY, 01, 04, 05, 06, 07, 10 (Fase 2) | ✅ Complete |
| CLAUDE.md (lean) | ✅ Complete |

**`[TODO]` yang perlu diisi manual (tersebar di docs):**
- **Live URL** sudah dikonfirmasi `nexus.msigroup.co.id` (resolved).
- **04_ROLE_PERMISSION_MATRIX §3** — tabel granular VIEW/CREATE/EDIT/DELETE/APPROVE/EXPORT/PRINT per menu (data RBAC tidak ada di schema-only snapshot — perlu query data DB).
- **04 §1** — status role `sales_head` (aktif vs sisa migrasi).
- **01 §4** — status implementasi MFA, setup staging environment.
- **05** — detail status lifecycle SP/AR (INV/FP/SUB/KRM), modul Finance/Procurement/Approval engine (belum dibangun).
- **07 §2** — SECURITY DEFINER/INVOKER `save_quotation`.
- **08 TD-02 / TD-23** — verifikasi `has_permission()` seed + deactivate-revoke-session.
- **00 (file ini)** — verifikasi keberadaan/isi subfolder `docs/*/` (Fase 0.1) yang direferensikan AGENTS.md. *(`docs/progress.md` & `docs/project-audit.md` sudah dihapus — superseded oleh root `PROGRESS.md` + `08_TECH_DEBT`/`09_ROADMAP`.)*
