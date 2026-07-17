# QA CHECKLIST — Nexus by MSI

> Checklist sebelum deploy / push. Sumber: `docs/02_RULES_GOVERNANCE.md`, field notes, phase notes. ⚠️ Belum ada test otomatis (TECH_DEBT TD-07) — QA = manual + build.

---

## Pre-Deploy Checklist (setiap push)

- [ ] **`npm run build` clean** — catat `N modules transformed` + waktu di laporan.
- [ ] **Lint net-zero** — jumlah error sebelum == sesudah (baseline ditoleransi: set-state-in-effect untuk fetch, memoization-skip). Tidak ada error baru.
- [ ] **Tidak ada `console.error`/`console.log` baru** yang mem-leak data (cek AuthContext, page yang diubah). Fire-and-forget log boleh `console.error`.
- [ ] **Tidak ada file yang tak sengaja keubah** — `git status --short`; pastikan hanya file dalam scope task.
- [ ] **Tidak ada secret / service-role key** masuk ke kode frontend.
- [ ] **Test manual fitur yang diubah** end-to-end (lihat Per-Modul + checklist spesifik). ⚠️ Sering ter-skip — tandai eksplisit "belum tes runtime" di PROGRESS bila belum.
- [ ] **Snapshot di-refresh** kalau ada DB change (`pg_dump` → `supabase/schema_snapshot.sql`).
- [ ] **CLAUDE.md + PROGRESS.md di-update** (current phase, recent changes, "Belum: tes manual").
- [ ] **Commit message** deskriptif + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push HANYA bila diinstruksikan (main = production, Vercel auto-deploy).

---

## Per-Modul Checklist

### CRM
Fitur kritis tiap deploy:
- [ ] Pipeline: drag stage (NEW→…→WON/LOST); WON → account jadi `customer` & muncul di Master Customer; soft-gate PROPOSAL/WON muncul.
- [ ] Visibility per role: super_admin lintas entitas; manager se-entitas; sales hanya miliknya (jangan bocor lintas role/entity).
- [ ] Quotation: simpan (create + edit via RPC) tersimpan benar saat reload (bukan basi/duplikat); total/subtotal/VAT/grand total benar; PDF generate (lihat PDF Checklist).
- [ ] Activities: create/done/cancel/edit → muncul di Activity Log feed; dropdown sales termuat (manager se-entitas).
- [ ] Dashboard: KPI & chart terisi (bukan kosong/0); per-role (sales personal vs manager tim).

Edge case pernah kena bug:
- Quotation edit kedua "tidak ngefek" (state basi / RLS update silent / policy DELETE hilang).
- Dropdown sales kosong untuk manager (RLS `user_roles_read` `is_admin_or_above`).
- Currency dropdown / VAT rate per service_type; CRM Dashboard chart kosong (`useWidth` race).

### Foundation
- [ ] User Access: Add User (create-user EF) → user + role + company benar; Edit (permission matrix diff-save); avatar upload; deactivate/delete (super_admin); Ubah Password.
- [ ] Positions compact: 1 baris per code, badge entitas, edit checkbox (reactivate bukan duplicate vs `UNIQUE(company_id,code)`).
- [ ] Org Structure: tree dari `reports_to`; ganti atasan save & re-fetch; warna per-level.
- [ ] Master data CRUD (Companies/Branches/Departments/Products/dll) — soft delete, scope company.

Edge case:
- Trigger `trg_z_gen_customer_code_upd` (jangan generate code saat soft-delete → dulu "duplicate key accounts_code_unique").
- `profiles` pakai `active` (bukan deleted_at/is_active).

### Service Management (HRGA / Asset)
- [ ] HRGA: submit request → nomor HRG ter-generate; approval matrix per company; status lifecycle.
- [ ] Asset: list per kategori, detail tab, inline-edit IT (3 tabel), Health Score. (Save Add Asset wizard masih dummy — jangan klaim persist.)

Edge case:
- `hrga_approval_configs` query WAJIB filter `company_id` (kalau tidak → `.single()` coerce error).
- Tabel CLI butuh GRANT manual (permission denied).

---

## DB Change Checklist

1. [ ] **State dulu** (tunggu approval eksplisit): tabel apa, kenapa, data/query terdampak.
2. [ ] Eksekusi via SQL Editor (atau migration).
3. [ ] **GRANT setelah CREATE** tabel (CLI tak auto-grant): `GRANT SELECT, INSERT, UPDATE ON <t> TO authenticated;` (INSERT-only untuk audit immutable).
4. [ ] **RLS:** tiap tabel business punya policy company- + role-scoped; super-admin bypass top-level `OR is_super_admin()` (jangan nest). Tambah policy DELETE bila pakai delete-then-insert.
5. [ ] **Test RLS di sesi browser** (bukan SQL Editor — `auth.uid()` null di sana): temporary `console.debug` `is_super_admin()`/`get_user_company_id()` di komponen page.
6. [ ] **Verifikasi policy aktif:** `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='<t>';` — pastikan `is_super_admin()` outermost.
7. [ ] **Trigger ordering** bila perlu (prefix `trg_z_`).
8. [ ] **Refresh snapshot** (`pg_dump` → `schema_snapshot.sql`).
9. [ ] **Untuk drop kolom:** deploy code yang berhenti baca/tulis kolom + verifikasi production DULU, baru drop.

---

## PDF Checklist (Quotation)

- [ ] Klik Download PDF → file `.pdf` ter-download (bukan error).
- [ ] **Teks selectable** (vektor `@react-pdf`, bukan raster image).
- [ ] **9 section muncul** & urut: header → customer details → item tables → grand summary → notes → terms → signatures → divider → footer.
- [ ] **Tabel item tidak kepotong di tengah baris** (page break otomatis, `wrap={false}`).
- [ ] **Footer muncul di setiap halaman** (`fixed`); divider nempel di atas footer.
- [ ] **Grand total benar**; PPN label dynamic ("PPN 1,1%"/"PPN 11%"); baris VAT hilang kalau 0%.
- [ ] **Internal data TIDAK muncul:** `cost_price`, `margin`, `internal_notes` (customer-facing only).
- [ ] "Customer Representative" + nama customer center; on-screen detail tetap normal.
- [ ] Filename `${quotation_no}_rev${revision??1}.pdf`.
