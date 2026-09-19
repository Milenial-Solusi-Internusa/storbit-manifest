# NEXUS BY MSI — Documentation Index

> Master index seluruh dokumentasi. Mulai dari sini. Untuk konteks coding cepat → `CLAUDE.md` (lean entry point). Identitas produk + safety rules → `AGENTS.md`.

---

## Quick Start untuk Claude Code

Urutan baca yang direkomendasikan **sebelum mulai task apa pun:**

1. **`CLAUDE.md`** — lean entry point (stack, quick ref, aturan 1-liner, current phase, known issues). WAJIB.
2. **`AGENTS.md`** — identitas produk, prinsip engineering, **15 safety rules**, workflow per tipe task.
3. **`docs/Governance/02_RULES_GOVERNANCE.md`** — konvensi kode + pola wajib frontend/DB + Do/Don't.

Lalu sesuai tipe task (lihat "Cara Pakai" di bawah).

---

## Daftar Dokumen — 18 acuan tetap (rumah resmi tabel ini; `CLAUDE.md` & `PROJECT_CONTEXT.md` hanya menunjuk ke sini)

> Tiga kolom: **isinya apa · buat siapa · kapan dibuka**. Tanggal pembaruan **tidak** dicatat di sini — `git log -1 -- <file>` adalah sumber tanggal. Ukuran/angka di kolom "Isinya apa" diukur 20 Sep 2026.

| File | Isinya apa | Buat siapa | Kapan dibuka |
|---|---|---|---|
| `CLAUDE.md` (root) | Lean entry point: stack, quick-ref, aturan wajib 1-baris, current phase, **Recent** (log padat terbaru→lama), Known Issues; sumber paling dinamis — kalau bertentangan dengan dokumen lain, ini yang menang | Claude Code/AI di tiap sesi; Den untuk gambaran cepat | Wajib di awal **setiap** sesi/task |
| `AGENTS.md` (root) | Identitas produk, arah jangka panjang, prinsip engineering, **15 safety rules**, workflow per tipe task; kontrak Codex — struktur/kebijakan tidak diubah, hanya koreksi fakta terverifikasi | AI agent (Claude Code/Codex) | Awal sesi bersama `CLAUDE.md`; sebelum task tipe baru |
| `PROGRESS.md` (root) | Dev log kronologis per tanggal: apa yang dikerjakan, keputusan + alasannya, tes runtime, langkah manual DB yang belum jalan; jejak — entri lama tidak pernah ditulis ulang | Den & doc-keeper (menulis); AI (membaca konteks sesi lalu) | Saat perlu tahu "apa yang terjadi tanggal X" atau detail di balik entri Recent `CLAUDE.md` |
| `supabase/schema_snapshot.sql` | Potret **produksi** schema-only via `pg_dump --schema=public` (ACL ikut, nol data): 141 tabel `public`, 106 fungsi, 374 policy; sumber kebenaran struktur DB — bukan `supabase/migrations/` (berhenti 3 Jun 2026) | AI sebelum menyentuh query/RLS/RPC; Den saat audit | Setiap task yang menyentuh DB; ⚠️ "tidak ada di snapshot" ≠ "tidak ada di DB" — bandingkan tanggal refresh vs SQL manual terakhir |
| `docs/Governance/00_INDEX_README.md` | **(file ini)** master index: urutan baca, tabel 18 dokumen, skenario "Cara Pakai", status `[TODO]` | Siapa pun yang baru masuk | Onboarding; saat mencari dokumen mana yang relevan |
| `docs/Governance/00_DEV_JOURNEY.md` | Tiga lapis: timeline kronologis (Bagian 1), inventaris fitur LIVE per domain (Bagian 2), arsip fase verbatim eks-`CLAUDE.md` (Bagian 3 — "tidak diubah sebaris pun") | AI/Den yang perlu sejarah atau daftar fitur hidup | Cari "fitur apa yang sudah jalan" atau histori fase lama |
| `docs/Governance/01_PRD_NEXUS.md` | PRD ringkas: vision, entitas & scope, modul & fitur, NFR, out-of-scope | Stakeholder / onboarding | Onboarding; saat menimbang apakah fitur masuk scope |
| `docs/Governance/02_RULES_GOVERNANCE.md` | Konvensi kode, pola wajib FE (`.limit(1000)`, `showToast`, soft delete) & DB (GRANT, trigger, RLS, migrasi), **brand & design system §5** (palet sage, tiga font), Do/Don't, DB change checklist, QA checklist | AI sebelum menulis kode | Setiap task kode; §4 sebelum SQL; §5 sebelum UI |
| `docs/Governance/03_DATA_MODEL.md` | Referensi DB per modul, entity UUID, pola RLS & fungsi, RPC, **gotchas** (mesin status SP 12 tahap, overload RPC, dsb.) | AI sebelum query/migrasi; Den saat merancang SQL | Task DB/RLS/RPC; saat error "senyap" (0 baris tanpa error) |
| `docs/Governance/04_ROLE_PERMISSION_MATRIX.md` | Daftar role & hierarki, matrix izin per modul, fungsi RLS, known gaps — ⚠️ sebagian basi sejak `roles.level` + 11 role pilot (11–13 Sep 2026), belum diaudit ulang | AI/Den saat menyentuh akses, gate menu, RLS | Task role/permission/RBAC; sebelum mengubah policy |
| `docs/Governance/05_WORKFLOW_MAP.md` | Alur bisnis per modul dengan pelaku **[role]** & trigger ⚙: CRM, aging pipeline, Foundation, Storbit SP 12 tahap, Inventory, PRF, SO, BNF/Briefing/MOM | AI sebelum mengubah alur/status; Den saat menjelaskan proses | Task yang mengubah status dokumen atau alur approval |
| `docs/Governance/06_UI_UX_FLOW.md` | Design system **lama** (token per kode saat ini, berbanner "keadaan kode, palet lama"), pola layout/komponen, larangan UI, pola PDF Quotation, responsif | AI saat kerja UI | Task UI, bersama `02 §5` dan `DESIGN_SYSTEM_REFERENCE.md` |
| `docs/Governance/07_API_REPOSITORY.md` | Pola client Supabase, RPC, Edge Functions, contoh query, error handling — tipis (96 baris), kemungkinan tertinggal dari RPC yang lahir Agu–Sep 2026 | AI saat menulis fetch/RPC baru | Task integrasi/Edge Function; saat butuh contoh pola |
| `docs/Governance/08_TECH_DEBT.md` | Register **TD-01…TD-270** (OPEN/PARTIAL/RESOLVED) + banner "Diperbarui" per sesi; tiap TD = deskripsi, lokasi, status, rencana | AI sebelum "memperbaiki" sesuatu (cek sudah tercatat / disengaja); Den saat memilih prioritas | Task bug/audit; sebelum menyentuh area yang punya TD |
| `docs/Governance/09_ROADMAP.md` | Status modul, next up, keputusan struktur (Finance, Design System D1–D7), **Keputusan Terbuka #1–#61** (yang perlu keputusan Den) | Den (memutuskan); AI (tahu apa yang belum diputuskan) | Sebelum memulai fitur; saat menemukan hal yang butuh keputusan |
| `docs/Governance/10_TASK_BREAKDOWN.md` | Pecahan task aktif/backlog + template task & change request; berbanner "BASI — cek sumbernya dulu" sejak 7 Sep 2026 | Den/AI menyusun task | Jarang — hanya untuk template; jangan dipakai sebagai daftar kerja tanpa cek `09`/`08` |
| `docs/Governance/11_FINANCE_ACCOUNTING_BLUEPRINT.md` | Cetak biru Finance & Accounting v1.0 (9 Sep 2026): prinsip (invoice = anak BTB), diagnosa D-01…D-12, model data, aturan tanggal, jurnal, matriks role, menu, rencana migrasi F1–F7 | Den & AI saat membangun modul Finance | Task Finance/invoice/jurnal; sebelum menyentuh `sp_invoices`/`ar_btbs` |
| `docs/DESIGN_SYSTEM_REFERENCE.md` | Kebijakan palet **sage** + tiga font + arah kit tunggal (Bagian A, termasuk **rencana Batch DS 1–7 di A.4 — belum dimulai**) + inventaris & angka kit/token yang ada di kode (§0–§18) + checklist menerjemahkan mockup AI | AI/desainer saat implementasi UI atau menerjemahkan mockup | Task UI; sebelum memakai komponen kit; selama penyatuan kit berjalan |

Di luar 18 acuan tetap: `docs/architecture/`, `docs/database/`, `docs/security/`, `docs/workflow/`, `docs/integration/`, `docs/performance/`, `docs/operations/`, `docs/modules/` (pre-existing, Fase 0.1 — blueprint & baseline, lihat "Required Reading" di `AGENTS.md`; `[TODO]` verifikasi keberadaan/isi tiap file yang dirujuk) dan `docs/archive/` (rekaman historis).

> **Dokumen 11-18 lama sudah diserap ke canon 00-10 lalu diarsipkan** ke `docs/archive/audits/` (konsolidasi governance, 17 Jul 2026): **11**→`02 §8` (QA Checklist), **12**→`10` (Template Change Request) + rollback CR-002 di `08` TD-01, **13-18** (audit CRM/SP/input/pending)→diserap jadi TD di `08` / task di `10` / keputusan di `09`. File aslinya tetap bisa dibaca di `docs/archive/audits/` sebagai rekaman historis. (Nomor **11** kini dipakai ulang oleh `11_FINANCE_ACCOUNTING_BLUEPRINT.md`, dokumen baru 9 Sep 2026 — bukan dokumen 11 lama.)

---

## Cara Pakai Dokumentasi Ini

| Skenario | Baca |
|----------|------|
| **Onboarding (baru kenal proyek)** | `CLAUDE.md` → `AGENTS.md` → `docs/Governance/01_PRD_NEXUS.md` → `docs/Governance/09_ROADMAP.md` → `docs/Governance/03_DATA_MODEL.md` |
| **Mulai task fitur baru** | `CLAUDE.md` → `docs/Governance/02_RULES_GOVERNANCE.md` → `docs/Governance/10_TASK_BREAKDOWN.md` → `docs/Governance/05_WORKFLOW_MAP.md` (modul terkait) → `docs/Governance/06_UI_UX_FLOW.md` |
| **Task bug/audit** | `CLAUDE.md` → `docs/Governance/08_TECH_DEBT.md` → `docs/Governance/03_DATA_MODEL.md` (gotchas) → `docs/Governance/07_API_REPOSITORY.md` (error patterns) |
| **DB / schema / RLS change** | `docs/Governance/02_RULES_GOVERNANCE.md §4` → `docs/Governance/03_DATA_MODEL.md` → `docs/Governance/04_ROLE_PERMISSION_MATRIX.md` → `docs/Governance/02_RULES_GOVERNANCE.md §4` + `§7` (DB Change Checklist) → `docs/Governance/10_TASK_BREAKDOWN.md` (Template Change Request) |
| **Kerja UI / styling / PDF** | `docs/Governance/06_UI_UX_FLOW.md` → `docs/Governance/02_RULES_GOVERNANCE.md §5` → `docs/DESIGN_SYSTEM_REFERENCE.md` (kit mana yang berlaku + angka persisnya; ⚠️ kebijakan sage BELUM di kode — ikuti tabel §0 sampai ada instruksi) |
| **Sebelum push/deploy** | `docs/Governance/02_RULES_GOVERNANCE.md §8` (QA Checklist) |
| **Cari histori implementasi fase lama** | `docs/Governance/00_DEV_JOURNEY.md` (Bagian 3 arsip) + git history `CLAUDE.md` + `PROGRESS.md` |

**Prinsip:** saat dokumen & `CLAUDE.md` berbeda, **defer ke `CLAUDE.md`** (paling dinamis). Untuk struktur DB, sumber kebenaran = `supabase/schema_snapshot.sql`. Untuk safety rules, sumber = `AGENTS.md`.

---

## Status Dokumentasi

> Potret per konsolidasi governance 17 Jul 2026; daftar `[TODO]` di bawah belum ditinjau ulang sejak itu — pakai `git log` + `08_TECH_DEBT.md` untuk keadaan terkini.

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
