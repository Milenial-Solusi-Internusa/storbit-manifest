# RULES & GOVERNANCE — Nexus by MSI

> Konvensi & aturan wajib untuk semua development di Nexus. Sumber: `CLAUDE.md`, `AGENTS.md`, dan field notes dari sesi debugging nyata. Saat ragu, defer ke `CLAUDE.md`.

---

## 1. Stack & Environment

| Item | Nilai |
|------|-------|
| Frontend | React 19 + Vite 8 |
| Styling | TailwindCSS 3 + inline-style tokens (`PASTEL` / per-modul `C`/`D`/`S`) |
| Backend | Supabase — PostgreSQL + Auth + RLS + Edge Functions (Deno) + Storage |
| Deploy | Vercel — auto-deploy dari branch `main` → production |
| Live URL | `nexus.msigroup.co.id` (production; lama `nexus.dli.my.id` dibiarkan hidup sementara sbg safety net) |
| Repo | GitHub `Milenial-Solusi-Internusa/storbit-manifest` (pasca-migrasi org 10 Jul; ⚠️ masih PUBLIC), branch `main` = integrasi + production (solo dev; `fix/*` untuk hotfix) |
| Supabase project ref | `untmpqceexwxzuhlmyrg` (org "Milenial Solusi Internusa"; ref tak berubah pasca-migrasi) |
| DB pooler | `aws-1-ap-northeast-2.pooler.supabase.com:5432` (region Seoul) |
| Storage bucket publik | `assets` (logo MSI), `avatars` (foto profil) |

**Migrasi vs snapshot:** file di `supabase/migrations/` **berhenti 3 Jun 2026** (`...026_assets_kendaraan.sql`). Sumber kebenaran struktur DB terkini = **`supabase/schema_snapshot.sql`** (`pg_dump` full, 73 tabel). Banyak perubahan dilakukan via **SQL Editor** dan belum jadi migrasi formal.

---

## 2. Konvensi Kode

- **File komponen page:** `PascalCasePage.jsx` di `src/modules/<modul>/` atau `src/modules/<modul>/pages/`.
- **Hook:** `useXxx.js` di `src/hooks/`. Helper murni: `camelCase.js` (mis. `spCalc.js`, `bant.js`, `activityFeed.js`).
- **Komponen React:** PascalCase. **Handler:** `handleXxx`. **Boolean state:** `isXxx`/`showXxx`. **Setter:** `setXxx`.
- **Design tokens per modul:** objek `C` (CRM warm-beige), `D` (asset/dashboard), `S` (style tokens) — inline-style. Global app pakai `PASTEL`.
- **Import lokal** (relative path), bukan alias. Lucide untuk SEMUA ikon.
- **react-refresh:** file yang export komponen JANGAN sekaligus export hook/util non-komponen — pisah ke file `.js` (pola `bant.js` + `BantScoreBar.jsx`). Token plain → `.js`, komponen → `.jsx`.
- **Lint baseline:** repo punya error baseline yang ditoleransi (set-state-in-effect untuk fetch, memoization-skip). Target tiap task = **net-zero** (jumlah error sebelum == sesudah), bukan nol absolut.

---

## 3. Pola Wajib Frontend

- **Fetch Supabase:**
  - SELESAIKAN di event handler / `useCallback`, jangan synchronous `setState` di body effect (lint `set-state-in-effect`). Pola hook: semua `setState` di dalam `.then()`.
  - **Selalu `.limit(1000)`** (atau server-side `.range()`) — default PostgREST hanya **10 baris**, silent.
  - Select kolom eksplisit, hindari `SELECT *` untuk list besar.
  - Tambah `.is('deleted_at', null)` untuk tabel business (kecuali tabel tanpa kolom itu — lihat §4).
  - Scope `company_id` + role (lihat pola role-aware di bawah).
- **Role-aware scope (pola CRM):**
  ```js
  const isAllEntities = ['super_admin'].includes(erpRole);   // admin = single-entity (selaras RLS)
  const isSalesOnly   = ['sales','operations'].includes(erpRole);
  if (!isAllEntities) query = query.eq('company_id', profile.company_id);
  if (isSalesOnly)    query = query.or(`assigned_to.eq.${uid},created_by.eq.${uid}`);
  ```
- **Form:** state lokal `useState`; reset modal via `key` prop (remount), bukan effect; validasi client-side sebelum submit.
- **Error handling + toast:** `showToast?.(message, type)` — **urutan `(message, type)`**, `type` = `'success'` (default) / `'error'`. Optional-chaining `?.`. Jangan toast untuk fire-and-forget log (cukup `console.error`).
- **Soft delete:** set `deleted_at` (atau `is_active=false` untuk tabel yang pakai flag itu). JANGAN hard-delete data business.
- **Lazy load** modul besar via `React.lazy()`; bungkus page di `ErrorBoundary` + `Suspense`.
- **Pagination** client-side `PAGE_SIZE` untuk list ≤ ~500 row; server-side `.range()` untuk tabel besar.

---

## 4. Pola Wajib Database

- **Dollar-quoting fungsi:** pakai tag `$fn$ … $fn$` (atau `$$`) konsisten; hati-hati nested.
- **`.limit(1000)`** — default PostgREST 10 row (lihat §3).
- **GRANT setelah CREATE:** tabel yang dibuat via Supabase CLI **tidak** auto-grant ke role `authenticated`. Wajib `GRANT SELECT, INSERT, UPDATE ON <table> TO authenticated;` segera setelah `ENABLE ROW LEVEL SECURITY`, sebelum policy. (INSERT-only untuk tabel audit immutable.)
- **Trigger naming untuk ordering:** trigger `BEFORE` di tabel yang sama jalan **alfabetis**. Untuk memaksa urutan, pakai prefix — mis. `trg_z_gen_customer_code_upd` sengaja diberi prefix `trg_z_` supaya fire **setelah** `trg_set_customer_on_won` (kalau gen-code jalan duluan, `account_status` belum jadi `customer` → code tak ter-generate).
- **`auth.uid()` NULL di SQL Editor:** SQL Editor jalan sebagai service role, bukan user. `is_super_admin()`, `get_user_company_id()`, `auth.uid()` SELALU null/false di sana. **Test RLS hanya via sesi browser** (temporary `console.debug` di komponen page), bukan SQL Editor.
- **Same-id migration pattern:** untuk konversi tabel (mis. `prospects`→`accounts`), pertahankan `id` row + nama constraint FK lama; embed PostgREST pakai alias (lihat §6 Known Issues di `03_DATA_MODEL.md`).
- **RLS wajib:** tiap tabel business harus punya RLS company-scoped + role-aware. Super-admin bypass = top-level `OR is_super_admin()`, **JANGAN** nested di dalam filter `company_id`.
- **Verifikasi policy aktif sebelum debug frontend:** `SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='<t>' AND cmd='SELECT';`
- **`profiles` tidak punya `deleted_at`** — pakai kolom `active` (boolean). Query: `.eq('active', true)`. (Bukan `is_active`.)
- **`hrga_approval_configs` selalu filter `company_id`** (di-seed per company; tanpa filter → multi-row → `.single()` error).
- **Document number:** via RPC `increment_document_sequence(company_id, document_type, department_code, year, month)` (SECURITY DEFINER, atomik). Jangan generate nomor non-sekuensial / timestamp fallback.
- **Refresh snapshot** setelah perubahan SQL Editor:
  ```bash
  pg_dump "postgresql://postgres.untmpqceexwxzuhlmyrg@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" \
    --schema-only --schema=public --no-owner --no-privileges > supabase/schema_snapshot.sql
  ```
  (`pg_dump` langsung — `supabase db pull` butuh Docker yang belum terpasang.)

---

## 5. Brand & Design System (MSI Brand Guideline v1.0)

| Token | Hex | Pakai |
|-------|-----|-------|
| MSI Navy | `#144682` | Sidebar, header chart, dominan |
| Navy Dark | `#0f3366` | Hover navy, gradient end |
| MSI Orange | `#E85A1E` | Accent, CTA, active item |
| Orange Dark | `#c44d18` | Hover orange |
| Coral | `#F08C7D` | Header tabel quotation, badge SOA |
| Cream | `#F6EFE3` | (legacy surface; app shell kini `#ffffff` sejak 2.10F) |
| accentSoft | `#FEF2EC` | Icon container, hover highlight |

- **Font:** heading `Montserrat`, body/UI `Inter` (Google Fonts). PDF: Helvetica built-in (Montserrat upgrade pending).
- **Ikon:** **Lucide only**. Tidak ada inline-SVG icon ad-hoc untuk hal yang ada di Lucide.
- **LARANGAN:**
  - ❌ **No emoji** di UI.
  - ❌ **No dark green** — `#1a3a2a`, `#2d5a3d`, `#0F2A23`, `#173D34`, `#2F6B3F`, `#E7EFE2` semua deprecated. (Teal/hijau-status tertentu mis. `#1F8B4D` WON, `#0F766E` Head boleh.)
  - ❌ `Plus Jakarta Sans` (diganti Inter+Montserrat).

---

## 6. Do / Don't

| ✅ DO | ❌ DON'T |
|-------|----------|
| `.limit(1000)` di semua query list | Andalkan default PostgREST (10 row) |
| Soft delete (`deleted_at` / `is_active=false`) | Hard-delete data business |
| `.eq('active', true)` untuk `profiles` | `.eq('is_active', …)` / `deleted_at` di profiles |
| `showToast?.(message, type)` | `showToast('type', message)` (kebalik) |
| Test RLS via sesi browser | Test RLS di SQL Editor (`auth.uid()` null) |
| Super-admin bypass top-level `OR is_super_admin()` | Nest `is_super_admin()` di dalam filter `company_id` |
| Refresh `schema_snapshot.sql` setelah SQL Editor | Hanya andalkan `migrations/` (berhenti 3 Jun) |
| Deploy code yang stop-baca-kolom DULU, baru drop kolom | Drop kolom sebelum code di-deploy |
| Embed alias saat constraint repointed (`customers:accounts!sp_items_customer_id_fkey`) | Ubah mapper consumer tanpa perlu |
| Lucide icon + brand color | Emoji / dark green / inline-SVG ad-hoc |
| Edit incremental, scope kecil, satu concern | Big-bang rewrite / rewrite App.jsx sekaligus |
| GRANT setelah CREATE tabel CLI | Asumsikan auto-grant |
| `npm run build` clean sebelum selesai | Push tanpa verifikasi build |

---

## 7. Workflow Development

**Per task (urutan wajib):** Inspect (branch, git status, file terkait) → Plan (scope kecil) → Edit (hanya file yg perlu) → Verify (`npm run build`, lint net-zero) → Summarize (Summary / Files changed / Verification / Risk / Not changed / Next step).

**DB change flow:**
1. State: tabel apa, kenapa, data/query terdampak. **Tunggu approval eksplisit.**
2. Eksekusi (SQL Editor / migration) → **refresh `schema_snapshot.sql`** via `pg_dump`.
3. Untuk drop kolom: deploy code yang berhenti baca/tulis kolom + verifikasi production **dulu**, baru drop (staged tahap — lihat penghapusan `profiles.role`).

**Audit-before-fix:** untuk bug non-trivial / lintas-komponen, jalankan AUDIT read-only dulu (laporan file:line + akar masalah + dugaan fix), baru EKSEKUSI. Banyak task sesi ini berpasangan AUDIT → EKSEKUSI.

**Session relay pattern:** tiap task = sesi fokus. `CLAUDE.md` "Current Phase & Recent Changes" + `PROGRESS.md` di-update tiap akhir task (build status, lint delta, "Belum: tes manual runtime"). Tes manual runtime sering **belum** dijalankan — selalu tandai eksplisit.

**Push/deploy:** HANYA bila diinstruksikan eksplisit. `main` = production (Vercel auto-deploy). Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Tugas dokumentasi:** update `docs/` saat fitur/aturan/keputusan berubah; update `CLAUDE.md` saat ada standing rule baru.
