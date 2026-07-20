# AUDIT_DOMAIN_SWEEP.md — Inventaris Migrasi Domain

> **Peran:** Auditor (inventarisasi saja, tanpa perubahan kode/dokumen).
> **Tanggal audit:** 2026-07-20
> **Migrasi:** `nexus.dli.my.id` (lama, akan dimatikan) → `nexus.msigroup.co.id` (baru).
> **Scope:** seluruh repo (kode, config, SQL, env example, docs), kecuali `node_modules` & `.git`.
> **Metode:** `grep -rniI` / `git grep` case-insensitive untuk 8 kategori pola yang diminta.

---

## RINGKASAN

**Total temuan domain/URL relevan: 14 baris** (belum termasuk env var Supabase yang tak terpengaruh).

Pecahan per kategori:

| Kategori pencarian | Jumlah temuan | Di kode? |
|---|---|---|
| 1. `dli.my.id` / `nexus.dli` (domain LAMA) | **8** | ❌ 0 kode — **semua di dokumentasi/markdown** |
| 2. `msigroup.co.id` / `nexus.msigroup` (domain BARU) | **3** benar + **2** varian salah (`.msigroup.id` tanpa `.co`) | ❌ 0 kode — semua docs |
| 3. Env/konstanta base URL app (`VITE_APP_URL`, `SITE_URL`, `BASE_URL`, `REDIRECT_URL`, dll) | **0 (tidak ditemukan)** | — |
| 4. Supabase redirect (`redirectTo`, `emailRedirectTo`, `resetPasswordForEmail`) | **0 (tidak ditemukan)** | — |
| 5. `window.location.origin` / `.host` untuk URL keluar | **0 (tidak ditemukan)** | — |
| 6. CORS/whitelist origin di Edge Function | **4** (semua `'*'` wildcard, tak menyebut domain) | ✅ kode, tapi aman |
| 7. Absolute URL app di email/notif/PDF | **0 domain app** (+2 domain infra pihak-3 tak-terkait: `nexus-msi.id`) | ✅ placeholder dummy |
| 8. File config (`vercel.json`, `.env.example`, README, CI) | `vercel.json` **tidak ada**; CI **tidak ada**; `.env.example` **tanpa** app URL; README **2 baris** domain lama | campur |

**Penilaian risiko — RENDAH dari sisi repo.** Mematikan domain lama **tidak akan** merusak login maupun reset password berdasarkan isi repo, karena: (a) **tidak ada satu pun kode** yang meng-hardcode base URL aplikasi; (b) **tidak ada** pemanggilan auth dengan `redirectTo`/`emailRedirectTo` — alur reset password memakai `auth.admin.updateUserById()` (admin set password langsung, tanpa email link berdomain), dan create-user memakai `email_confirm:true` (tanpa magic link); (c) CORS Edge Function memakai wildcard `'*'`, bukan whitelist berdomain; (d) tidak ada `window.location.origin` yang menyusun URL keluar. **Semua 8 penyebutan domain lama murni dokumentasi** — mematikannya tidak menyentuh runtime. **Satu-satunya titik yang benar-benar berisiko ada di LUAR repo** (Supabase Auth Site URL/Redirect URLs, konfigurasi domain Vercel, DNS) — lihat bagian "Titik Paling Berisiko" dan "Hal di Luar Repo". Selain itu ada **2 inkonsistensi dokumentasi** yang perlu diputuskan: `docs/operations/deployment-strategy.md` menulis `nexus.msigroup.id` **tanpa `.co`** (beda dari domain resmi `nexus.msigroup.co.id`).

---

## TABEL TEMUAN

> Urutan: **kode → config → dokumentasi**. Kolom "Ubah bila domain lama mati?".

### A. KODE

| # | file:line | Baris (≤1) | Kategori | Ubah? | Usulan |
|---|---|---|---|---|---|
| A1 | `supabase/functions/reset-password/index.ts:22` | `'Access-Control-Allow-Origin': '*',` | DINAMIS (aman) — CORS wildcard | **TIDAK** | Wildcard tak menyebut domain; alur reset = `updateUserById` (tanpa redirect berdomain). Aman. |
| A2 | `supabase/functions/create-user/index.ts:30` | `'Access-Control-Allow-Origin': '*',` | DINAMIS (aman) — CORS wildcard | **TIDAK** | create-user `email_confirm:true`, tanpa invite-link berdomain. Aman. |
| A3 | `supabase/functions/delete-user/index.ts:24` | `'Access-Control-Allow-Origin': '*',` | DINAMIS (aman) — CORS wildcard | **TIDAK** | Tak menyebut domain. |
| A4 | `supabase/functions/manage-schema/index.ts:34` | `'Access-Control-Allow-Origin': '*'` | DINAMIS (aman) — CORS wildcard | **TIDAK** | Tak menyebut domain. |
| A5 | `src/lib/supabase.js:6` | `const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;` | DINAMIS (aman) — URL **Supabase**, bukan URL app | **TIDAK** | Supabase ref tak berubah pasca-migrasi (per CLAUDE.md). Tak terkait domain app. |
| A6 | `src/modules/admin/pages/SchemaManagerPage.jsx:183` | `` fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-schema`` | DINAMIS (aman) — Supabase functions URL | **TIDAK** | Dari env Supabase, bukan domain app. |
| A7 | `src/pages/foundation/admin-settings/IntegrationsPage.jsx:130` | `url: "https://waha.nexus-msi.id", ...` | HARDCODED (domain pihak-3, **BUKAN** app) | **PERLU DIPUTUSKAN** | Placeholder default state WA gateway di domain **`nexus-msi.id`** (domain ke-3, bukan `dli.my.id`/`msigroup.co.id`). Di-overwrite `app_settings` DB (per fase 2.11K). Bukan bagian migrasi ini — tapi konfirmasi apakah `nexus-msi.id` masih dipakai. |
| A8 | `src/pages/foundation/admin-settings/IntegrationsPage.jsx:140` | `url: "https://n8n.nexus-msi.id/webhook/crm-events", ...` | HARDCODED (domain pihak-3 n8n webhook, **BUKAN** app) | **PERLU DIPUTUSKAN** | Sama seperti A7 — infra n8n di `nexus-msi.id`. Placeholder, di-overwrite DB. Tak memengaruhi login/reset. |

> **Catatan kode:** Kategori 3 (base-URL app), 4 (redirect auth), 5 (`window.location.origin`) → **tidak ditemukan sama sekali** di `src/` maupun `supabase/`. Alur auth (`AuthContext.jsx:165` `signInWithPassword`, `MyProfilePage.jsx:532` `updateUser({password})`, edge `reset-password`/`create-user`) **tidak pernah** mengirim redirect/link berdomain.

### B. CONFIG

| # | file:line | Baris (≤1) | Kategori | Ubah? | Usulan |
|---|---|---|---|---|---|
| B1 | `.env.example` (seluruh file) | `VITE_SUPABASE_URL=` / `VITE_APP_ENV=` / `VITE_SENTRY_DSN=` | KONFIG — **tanpa** app base URL | **TIDAK** | Tak ada var URL aplikasi. Tak perlu diubah. |
| B2 | `vercel.json` | — | KONFIG — **file tidak ada** | — | Tidak ada `vercel.json` di repo (rewrites/alias/domain diatur di dashboard Vercel). |
| B3 | `.github/workflows/` | — | KONFIG — **tidak ada CI** | — | Tak ada workflow file. Deploy via Vercel auto (bukan GitHub Actions). |
| B4 | `README.md:97` | `VITE_SUPABASE_URL=https://your-project.supabase.co` | KONFIG (contoh) — Supabase, bukan app | **TIDAK** | Placeholder Supabase; tak terkait domain app. |
| B5 | `index.html` | `<title>Nexus by MSI</title>` + preconnect fonts.googleapis | DINAMIS (aman) | **TIDAK** | Tak ada absolute self-URL / canonical / og:url berdomain app. |

> **Catatan config (untracked, di luar scope commit — tetap dicatat untuk cek manual):** `.env.local`, `.env.staging`, `.env`, `.vercel/`, `backup_full_*.sql` semuanya **gitignored** (`.gitignore` baris `.env.*` + `!.env.example`, `.vercel`, `backup_full_*.sql`). Hasil grep pola-domain (bukan dump secret): **tidak ada** `dli.my`/`msigroup`/`APP_URL`/`SITE_URL`/`REDIRECT` di `.env.local` maupun `.env.staging`. `.vercel/repo.json` hanya berisi `"name": "nexus"` (tak ada domain). `backup_full_20260709.sql` tak memuat referensi domain lama.

### C. DOKUMENTASI

| # | file:line | Baris (≤1) | Kategori | Ubah? | Usulan |
|---|---|---|---|---|---|
| C1 | `PROJECT_CONTEXT.md:8` | `Deploy nexus.dli.my.id via Vercel (auto-deploy dari branch main).` | DOKUMENTASI — **HARDCODED LAMA** | **YA** | Ganti → `nexus.msigroup.co.id`. |
| C2 | `README.md:39` | `\| Hosting \| Vercel — auto-deploy from `main` → `nexus.dli.my.id` \|` | DOKUMENTASI — **HARDCODED LAMA** | **YA** | Ganti → `nexus.msigroup.co.id`. |
| C3 | `AGENTS.md:77` | `- Vercel — auto-deploys from `main` → production at `nexus.dli.my.id`` | DOKUMENTASI — **HARDCODED LAMA** | **YA** | Ganti → `nexus.msigroup.co.id`. ⚠️ CLAUDE.md melarang mengubah AGENTS.md ("jangan diubah") — perubahan doc ini perlu keputusan Den, bukan otomatis. |
| C4 | `docs/Governance/01_PRD_NEXUS.md:60` | `... production `nexus.dli.my.id`. Dev/staging/prod terpisah ...` | DOKUMENTASI — **HARDCODED LAMA** | **YA** | Ganti → `nexus.msigroup.co.id`. |
| C5 | `docs/Governance/00_INDEX_README.md:69` | `- **Live URL** sudah dikonfirmasi `nexus.dli.my.id` (resolved).` | DOKUMENTASI — **HARDCODED LAMA** | **YA** | Ganti → `nexus.msigroup.co.id`. |
| C6 | `PROGRESS.md:374` | `... `nexus.dli.my.id` sengaja dibiarkan hidup (safety net; hapus ~1 minggu ...)` | DOKUMENTASI — **HARDCODED LAMA (kontekstual/historis)** | **PERLU DIPUTUSKAN** | Ini catatan histori "safety net". Boleh dibiarkan sbg jejak, atau tambah catatan "sudah dimatikan tgl X". Jangan sekadar hapus konteks. |
| C7 | `CLAUDE.md:9` | `**lama `nexus.dli.my.id` sengaja dibiarkan hidup** sbg safety net ...` | DOKUMENTASI — **campur LAMA+BARU (kontekstual)** | **PERLU DIPUTUSKAN** | Baris ini sudah menyebut domain BARU sbg live + LAMA sbg safety-net. Saat domain lama mati, update jadi "lama sudah dinonaktifkan". |
| C8 | `docs/Governance/02_RULES_GOVERNANCE.md:15` | `Live URL \| `nexus.msigroup.co.id` (production; lama `nexus.dli.my.id` dibiarkan hidup ...)` | DOKUMENTASI — **campur LAMA+BARU (kontekstual)** | **PERLU DIPUTUSKAN** | Sama seperti C7 — perbarui status "lama" saat dimatikan. |
| C9 | `PROGRESS.md:373` | `... domain prod → `nexus.msigroup.co.id` (CNAME Domainesia) ...` | DOKUMENTASI — **HARDCODED BARU (benar)** | **TIDAK** | Sudah benar. |
| C10 | `docs/operations/deployment-strategy.md:64` | `\| Production \| `main` \| `nexus.msigroup.id` (future) \| ...` | DOKUMENTASI — **VARIAN SALAH** (`.msigroup.id` tanpa `.co`) | **YA** | Domain resmi = `nexus.msigroup.co.id`. Perbaiki `nexus.msigroup.id` → `nexus.msigroup.co.id` (atau konfirmasi apakah `.msigroup.id` sengaja). |
| C11 | `docs/operations/deployment-strategy.md:65` | `\| Staging \| `staging` \| `staging.nexus.msigroup.id` \| ...` | DOKUMENTASI — **VARIAN SALAH** (staging, tanpa `.co`) | **PERLU DIPUTUSKAN** | Konfirmasi domain staging sebenarnya. Kemungkinan harus `staging.nexus.msigroup.co.id`. Tak memblok mematikan domain lama. |

---

## TITIK PALING BERISIKO

**Poin utama: risiko login/reset password TIDAK bersumber dari repo — bersumber dari konfigurasi Supabase Auth di dashboard.**

1. **Supabase Auth → Site URL & Redirect URLs (DI LUAR REPO — paling kritis).**
   Kode **sama sekali tidak** menyetel `redirectTo`/`emailRedirectTo` (Kategori 4 & 5 = 0 temuan). Artinya, jika suatu saat email konfirmasi / magic link / recovery diaktifkan, tautannya akan dibangun dari **"Site URL" yang tersimpan di dashboard Supabase**, bukan dari repo. CLAUDE.md sendiri mencatat kondisi bermasalah: *"Supabase Auth Site URL masih `localhost:3000` + Redirect URLs kosong (rapikan)"*. Jika Site URL masih `localhost:3000` atau menunjuk `nexus.dli.my.id`, maka setelah domain lama mati, alur email-based (bila dipakai) bisa mengarah ke domain mati. **Untuk alur saat ini (admin set password langsung via edge function), ini TIDAK memblok** — tapi wajib dibereskan sebelum mengandalkan email auth.

2. **Konfigurasi Domain/Alias di Vercel (DI LUAR REPO).**
   Tak ada `vercel.json`, jadi mapping domain → project sepenuhnya di dashboard Vercel. Jika `nexus.dli.my.id` masih terpasang sebagai domain di project Vercel (lama maupun baru) dan menjadi target CNAME, mematikannya perlu dipastikan **tidak** menghapus domain baru `nexus.msigroup.co.id` yang jadi alias production aktif.

3. **DNS / CNAME (Domainesia, DI LUAR REPO).**
   `nexus.msigroup.co.id` CNAME via Domainesia (per CLAUDE.md). Pastikan record domain baru sudah propagate & serving sebelum melepas record domain lama.

> **Yang justru AMAN (tidak berisiko):** semua Edge Function CORS `'*'` (tak akan menolak origin baru), tidak ada hardcoded app URL di kode, tidak ada `window.location.origin` untuk link keluar, reset-password = admin `updateUserById` (tanpa email berdomain), create-user = `email_confirm:true` (tanpa invite link). Jadi **fungsi login & reset password yang berjalan sekarang tidak akan rusak** hanya karena domain lama dimatikan.

---

## HAL DI LUAR REPO YANG PERLU AKU CEK MANUAL

Repo tidak bisa melihat konfigurasi runtime berikut — kemungkinan besar masih menyimpan/menunjuk domain lama:

1. **Supabase Dashboard → Authentication → URL Configuration**
   - Menu: `Authentication` → `URL Configuration` (atau `Settings` → `Auth`).
   - Cek **Site URL** (CLAUDE.md bilang masih `localhost:3000`) → set ke `https://nexus.msigroup.co.id`.
   - Cek **Redirect URLs** (allow-list) → tambahkan `https://nexus.msigroup.co.id/**`, hapus entri `nexus.dli.my.id` bila ada.

2. **Vercel Dashboard → Project `nexus` (team "MSI Group") → Settings → Domains**
   - Pastikan `nexus.msigroup.co.id` terpasang & Production. Hapus/lepas `nexus.dli.my.id` **hanya setelah** domain baru terverifikasi.
   - Cek juga **project Vercel lama** (akun pribadi Hobby, `storbit-manifest`) — CLAUDE.md sebut masih hidup sbg safety net; kemungkinan domain lama masih menempel di sana.

3. **Vercel → Project → Settings → Environment Variables**
   - Cari `VITE_APP_ENV` dan var lain. Repo **tidak** punya var app-URL, tapi konfirmasi tak ada `VITE_*_URL` app-level yang ditambahkan langsung di Vercel (di luar `.env.example`).

4. **DNS di Domainesia (registrar `msigroup.co.id`) + registrar `dli.my.id`**
   - Konfirmasi CNAME `nexus.msigroup.co.id` → target Vercel sudah aktif.
   - Rencanakan pelepasan record `nexus.dli.my.id`.

5. **Supabase → Auth → Email Templates** (bila email auth dipakai)
   - Cek `Confirm signup` / `Reset password` / `Magic link` templates — apakah ada absolute URL / `{{ .SiteURL }}` yang terikat domain lama.

6. **Infra pihak-3 `nexus-msi.id`** (temuan A7/A8 — di luar migrasi ini, tapi catat)
   - WA gateway `waha.nexus-msi.id` & n8n `n8n.nexus-msi.id`. Bukan domain app, tapi jika `nexus-msi.id` juga dipensiun, integrasi WA/webhook terdampak. Konfirmasi status `nexus-msi.id`.

---

## USULAN URUTAN EKSEKUSI

Diurutkan agar login/reset tak pernah putus di masa transisi:

1. **(LUAR REPO, dulu) Pastikan domain baru serving penuh.** Verifikasi `nexus.msigroup.co.id` sudah live di Vercel + DNS propagate. Jangan sentuh domain lama dulu. *(Alasan: domain baru harus terbukti jalan sebelum apa pun dilepas.)*

2. **(LUAR REPO) Perbaiki Supabase Auth Site URL + Redirect URLs** ke domain baru (hapus referensi domain lama/localhost). *(Alasan: satu-satunya jalur runtime yang bisa merusak email-auth; harus benar sebelum domain lama mati.)*

3. **(LUAR REPO) Pindahkan/lepas domain lama di Vercel & DNS**, dengan urutan: lepas dari project → hapus CNAME `nexus.dli.my.id`. *(Alasan: setelah langkah 1–2 aman, domain lama boleh dimatikan.)*

4. **(REPO — docs, aman kapan saja) Perbaiki 6 penyebutan domain lama murni** (C1, C2, C4, C5 = ganti ke domain baru; C3/AGENTS.md butuh persetujuan Den karena file "jangan diubah"). *(Alasan: dokumentasi, tak memengaruhi runtime — boleh paralel/kapan saja.)*

5. **(REPO — docs) Perbaiki inkonsistensi `nexus.msigroup.id` → `nexus.msigroup.co.id`** di `docs/operations/deployment-strategy.md:64,65` (C10, C11) — setelah konfirmasi domain staging. *(Alasan: cegah dokumen menyesatkan; C11 staging perlu konfirmasi dulu.)*

6. **(REPO — docs kontekstual) Update status "safety net"** di C6/C7/C8 (`PROGRESS.md:374`, `CLAUDE.md:9`, `02_RULES_GOVERNANCE.md:15`) menjadi "domain lama dinonaktifkan tgl X" **setelah** langkah 3 selesai. *(Alasan: catat fakta setelah aksi, bukan sebelum.)*

7. **(OPSIONAL, terpisah) Putuskan nasib `nexus-msi.id`** (A7/A8 IntegrationsPage + infra WA/n8n) — di luar migrasi domain app, jangan dicampur ke batch ini.

> **Catatan penutup:** langkah 1–3 (luar repo) adalah yang menentukan apakah login/reset selamat. Langkah 4–6 (dalam repo) murni kebersihan dokumentasi dan tidak punya efek runtime.
