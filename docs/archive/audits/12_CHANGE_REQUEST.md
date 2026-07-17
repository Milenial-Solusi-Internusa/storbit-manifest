# CHANGE REQUEST TEMPLATE — Nexus by MSI

> Template standar untuk perubahan besar (DB change, migrasi modul, refactor lintas-file, RLS). Untuk task kecil/rutin cukup pakai `docs/10_TASK_BREAKDOWN.md`. Perubahan DB/RLS **wajib approval eksplisit** sebelum eksekusi.

---

## Template

### CR-[NOMOR]: [JUDUL]

**Tanggal:** YYYY-MM-DD
**Diajukan oleh:** [nama]
**Prioritas:** Critical / High / Medium / Low

**Deskripsi perubahan:**
(apa yang berubah & kenapa; link ke TECH_DEBT TD-xx / ROADMAP)

**Modul yang terdampak:**
(CRM / Foundation / Finance / … + file/komponen kunci)

**DB changes diperlukan:** Ya / Tidak
(kalau ya, SQL lengkap:)
```sql
-- DDL/DML di sini
```

**Risiko:**
(apa yang bisa rusak; lintas-modul? RLS? data loss? backward-compat?)

**Rollback plan:**
(cara balikin: revert commit, restore kolom, re-deploy versi lama, dll)

**Definition of Done:**
- [ ] npm run build clean
- [ ] Lint net-zero
- [ ] Tes manual (langkah spesifik)
- [ ] Snapshot di-refresh (kalau DB change)
- [ ] Deploy code stop-baca-kolom DULU sebelum drop (kalau drop kolom)
- [ ] Docs + CLAUDE.md + PROGRESS.md di-update

**Status:** Draft / Approved / In Progress / Done

---

## Contoh CR

### CR-001: Migrasi Quotation PDF — html2canvas+jsPDF → @react-pdf/renderer
**Tanggal:** 2026-06-22 · **Prioritas:** Medium · **Status:** Done (fase 2.10A–C)

**Deskripsi:** PDF quotation sebelumnya = screenshot DOM (html2canvas) → JPEG → jsPDF (raster, tidak selectable, page-break manual). Ganti ke `@react-pdf/renderer` (vektor/text, pagination otomatis).

**Modul terdampak:** CRM — `src/modules/crm/QuotationPDF.jsx` (baru), `QuotationDetailPage.jsx` (`handleDownloadPDF`), `package.json`.

**DB changes:** Tidak. (Belakangan ditambah `quotations.vat_rate` di CR terpisah untuk PPN dynamic.)

**Risiko:** `@react-pdf` tak dukung sebagian CSS (`filter`, `linear-gradient`, `<table>`) → layout harus dibangun ulang dengan View; remote image (logo) async bisa gagal; new dependency (perlu approval). Off-screen `#quotation-print-area` dibiarkan (dead DOM).

**Rollback plan:** revert commit; re-install `html2canvas`+`jspdf`; restore `handleDownloadPDF` lama (masih di git history).

**Definition of Done:** ✅ build clean (2550 modules) · ✅ 9 section + footer fixed + wrap no-break · ✅ internal data (cost/margin/internal_notes) tak muncul · ⬜ tes manual runtime (teks selectable, tabel tak kepotong).

---

### CR-002: Migrasi RLS RBAC-driven (4-fase)
**Tanggal:** [TODO] · **Prioritas:** Critical · **Status:** Draft (TECH_DEBT TD-01)

**Deskripsi:** RLS saat ini pakai cek role hardcode (`is_admin_or_above()` ~51 policy) yang tak sinkron dengan RBAC granular UI (modules→menus→actions→`user_menu_permissions`) dan tak kenal sebagian role (mis. `ceo`). Migrasi ke RLS RBAC-driven.

**Modul terdampak:** seluruh DB RLS (182 policy); AuthContext (`hasPermission`/`hasMenuPermission`); semua page yang andalkan scope role.

**DB changes:** Ya (besar).
```sql
-- Fase 1: perbaiki/relink has_permission() ke tabel RBAC yang benar
-- Fase 2: ganti is_admin_or_above() (~51 policy) → cek RBAC granular + entity boundary
-- Fase 3: verifikasi cross-entity (is_cross_entity) per role/menu
-- Fase 4: test lintas role (super/ceo/gm/manager/sales/finance/hrga)
-- [TODO: SQL detail per fase]
```

**Risiko:** SANGAT tinggi — salah policy bisa expose/blokir data lintas-entitas. Prasyarat HRIS. `has_permission()` saat ini broken/unseeded (TD-02) harus dibereskan dulu.

**Rollback plan:** simpan dump policy lama (`pg_policies`) sebelum ubah; per-fase reversible; test di staging sebelum produksi.

**Definition of Done:** [ ] `has_permission()` benar & ter-seed · [ ] semua policy `is_admin_or_above` diganti & ter-test · [ ] cross-entity benar per role · [ ] test 7 role lulus · [ ] `profiles_read` diperketat (TD-04) · [ ] snapshot refresh.

**Catatan:** **Eksekusi sesi fresh, jangan disambi.** Audit-before-execute. Lihat `docs/00_DEV_JOURNEY.md` "Backlog — Migrasi RLS Proper" (Bagian 3 arsip).
