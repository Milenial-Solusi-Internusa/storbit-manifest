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
| Live URL | `nexus.msigroup.co.id` (production; domain lama `nexus.dli.my.id` sempat jadi safety net, **dinonaktifkan 20 Jul 2026** via hapus DNS CNAME di Domainesia, tanpa redirect) |
| Repo | GitHub `Milenial-Solusi-Internusa/storbit-manifest` (pasca-migrasi org 10 Jul; ⚠️ masih PUBLIC), branch `main` = integrasi + production (solo dev; `fix/*` untuk hotfix) |
| Supabase project ref | `untmpqceexwxzuhlmyrg` (org "Milenial Solusi Internusa"; ref tak berubah pasca-migrasi) |
| DB pooler | `aws-1-ap-northeast-2.pooler.supabase.com:5432` (region Seoul) |
| Storage bucket publik | `assets` (logo MSI), `avatars` (foto profil) |

**Migrasi vs snapshot:** file di `supabase/migrations/` **berhenti 3 Jun 2026** (`...026_assets_kendaraan.sql`). Sumber kebenaran struktur DB terkini = **`supabase/schema_snapshot.sql`** (~~`pg_dump` full, 73 tabel~~ **[koreksi 5 Sep 2026, dihitung ulang doc-keeper via `grep -c "^CREATE TABLE public\."`]** **133 tabel `public`** = 123 tabel bisnis + 10 tabel backup menunggu drop-sekaligus). Banyak perubahan dilakukan via **SQL Editor** dan belum jadi migrasi formal.

---

## 2. Konvensi Kode

- **File komponen page:** `PascalCasePage.jsx` di `src/modules/<modul>/` atau `src/modules/<modul>/pages/`.
- **Hook:** `useXxx.js` di `src/hooks/`. Helper murni: `camelCase.js` (mis. `spCalc.js`, `bant.js`, `activityFeed.js`).
- **Komponen React:** PascalCase. **Handler:** `handleXxx`. **Boolean state:** `isXxx`/`showXxx`. **Setter:** `setXxx`.
- **Design tokens per modul:** objek `C` (CRM warm-beige), `D` (asset/dashboard), `S` (style tokens) — inline-style. Global app pakai `PASTEL`.
- **Import lokal** (relative path), bukan alias. Lucide untuk SEMUA ikon. **[21 Sep 2026, Batch FS Fase 2.5 G0]** Alias **`@/` → `src/`** kini ADA (`vite.config.js` regex `^@/` + `jsconfig.json`; Fase 0 §7) tapi **hanya untuk `src/routes/*` dulu** — file lain tetap impor relatif sampai giliran Batch FS-nya; ~~hari ini nol pemakai~~ **[22 Sep 2026, G1]** pemakai pertama = `src/routes/index.jsx` (`@/App.jsx`, `@/components/AuthGate.jsx`), `legacy.routes.jsx` (`@/App.jsx`), `LegacyMenuRedirect.jsx` (`@/contexts/useAppShell`); `App.jsx`/`main.jsx` tetap relatif. Jangan mulai mengganti impor relatif ke `@/` sepihak.
- **react-refresh:** file yang export komponen JANGAN sekaligus export hook/util non-komponen — pisah ke file `.js` (pola `bant.js` + `BantScoreBar.jsx`). Token plain → `.js`, komponen → `.jsx`.
- **Lint baseline:** repo punya error baseline yang ditoleransi (set-state-in-effect untuk fetch, memoization-skip). Target tiap task = **net-zero** (jumlah error sebelum == sesudah), bukan nol absolut. **[21 Sep 2026]** Gate-nya kini **mekanis**: `node scripts/qa/lint-baseline.mjs` membandingkan hasil eslint dengan `scripts/qa/lint-baseline.json` (~~138~~ **137 error / 21 warning / 58 file** sejak G1 22 Sep 2026 — `App.jsx` 6 → 5, `--update` sadar) dan GAGAL bila total ATAU angka per-file naik (penurunan di file lain tidak boleh menutupi regresi); dijalankan CI (`.github/workflows/ci.yml`) tiap push/PR ke `main`. Angka turun → perbarui baseline **sadar** dengan `--update` di commit yang sama; jangan diam-diam.

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
- **Trigger naming untuk ordering:** trigger `BEFORE` di tabel yang sama jalan **alfabetis**. Untuk memaksa urutan, pakai prefix — mis. `trg_z_gen_customer_code_upd` sengaja diberi prefix `trg_z_` supaya fire **setelah** `trg_set_customer_on_won` (kalau gen-code jalan duluan, `account_status` belum jadi `customer` → code tak ter-generate). *(Contohnya kini historis — `trg_set_customer_on_won` dicabut 18 Sep 2026 oleh `20260916000001`; konversi ke `customer` terjadi lewat `trg_set_customer_on_inquiry_won` di `inquiries`. Aturan urutan alfabetisnya tetap berlaku.)*
- **[7 Sep 2026] `CREATE TEMP TABLE` TIDAK bertahan lintas klik Run di Supabase SQL Editor** — tiap Run bisa membuka koneksi baru, dan temp table mati bersama koneksinya. Verifikasi sebelum-sesudah yang menyimpan keadaan awal ke temp table karenanya **gagal dengan cara yang menyesatkan**: tabelnya "hilang", bukan datanya salah. Dua jalan keluar: jalankan seluruh rangkaian **dalam satu Run**, **atau** — lebih baik — ganti dengan **perhitungan independen langsung dari tabel sumber**. Yang kedua lebih kuat secara logika: ia membuktikan angkanya **BENAR**, bukan sekadar **TIDAK BERUBAH** (sebelum-sesudah tetap lolos kalau kedua sisinya sama-sama salah).
- **[8 Sep 2026] Eksekusi produksi WAJIB memakai teks yang ADA di file migrasi — jangan pernah menyusun SQL di chat lalu menjalankannya.** Kalau saat eksekusi ada yang perlu diubah (kalimat COMMENT diperbaiki, klaim dicabut, angka dikoreksi): **ubah FILE-nya dulu, baru jalankan dari file itu.** Menyusunnya langsung di chat membuat **file berhenti jadi rekaman apa yang benar-benar jalan** — dan itu memutus asumsi yang dipakai SELURUH alur kerja ini, karena agen AI membaca file migrasi + `schema_snapshot.sql` sebagai sumber kebenaran (lihat butir 7 Sep di atas). ⚠️ **Gagalnya SENYAP dan LAMBAT:** tak ada yang error, tak ada yang kelihatan salah, dan divergensinya baru ketahuan **berhari-hari kemudian secara kebetulan** — saat seseorang membandingkan file dengan snapshot untuk urusan lain. Preseden nyata: TD-236 (COMMENT `accounts.lifecycle_stage`, ditulis di chat 7 Sep, ketahuan 8 Sep). Berlaku juga untuk `COMMENT ON` yang "cuma komentar" — komentar kolom adalah **rujukan permanen di skema produksi**, dan menimpanya butuh migrasi manual tersendiri.
- **[7 Sep 2026] Rapikan header migrasi + refresh snapshot SEGERA setelah eksekusi SQL, BUKAN di akhir sesi.** Agen AI membaca **header file migrasi** (`Status: LIVE`) dan **`schema_snapshot.sql`** sebagai sumber kebenaran tentang apa yang hidup di produksi. Menundanya membuat sesi berikutnya **berangkat dari peta yang salah** — dan itu kelas kekeliruan yang paling mahal, karena keputusan dibangun di atasnya sebelum ketahuan. ⚠️ **Ini terjadi DUA KALI dalam satu hari (7 Sep 2026).** Urutan yang benar: jalankan SQL → **langsung** ubah header jadi `Status: LIVE` + `pg_dump` → baru lanjut kerja berikutnya.
- **[17-18 Sep 2026] Menambah parameter ke RPC = membuat FUNGSI BARU, bukan mengganti yang lama.** `CREATE OR REPLACE FUNCTION f(uuid, date)` **tidak** menyentuh `f(uuid)`: hardening yang pernah mendarat di signature lama (guard role, `REVOKE … FROM PUBLIC`) **tidak diwarisi**, dan overload lama **tetap hidup** dengan ACL-nya sendiri. Kasus `mark_delivery_delivered` 17 Sep: versi 2-argumen lahir tanpa guard role + PUBLIC EXECUTE (ditutup hari yang sama), overload 1-argumen masih ada tanpa syarat `signed_date` (TD-263). **Wajib dalam satu migrasi:** (1) salin badan dari `pg_get_functiondef` versi LIVE, bukan dari file migrasi pertama; (2) `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE … TO authenticated` **untuk signature baru** (ACL per-signature); (3) putuskan nasib overload lama — `DROP` (setelah grep pemanggil `src/` + Edge Functions) atau minimal `REVOKE … FROM PUBLIC`; (4) FE selalu mengirim seluruh argumen bernama supaya PostgREST tidak ambigu. Detail: `03_DATA_MODEL.md` gotcha #37.
- **[18 Sep 2026] Kolom sumbu RLS BARU (`owner_id`/`created_by`/`company_id` pada tabel atau kolom yang lahir sesudah tanggal ini) WAJIB lahir bersama pengisi lapis DB** (`DEFAULT`/trigger `BEFORE INSERT` `COALESCE(NEW.x, …, auth.uid())`), bukan hanya payload FE — satu jalur INSERT yang lupa mengisinya menghasilkan backlog NULL yang **hilang dari pemiliknya** begitu RLS aktif (insiden `inquiries.owner_id` 121 baris, 7-17 Sep). Sebelum menjalankan migrasi RLS baru: `SELECT COUNT(*) … WHERE x IS NULL` dulu, dan pertahankan guard di BAGIAN 0 migrasi yang menolak jalan bila masih ada NULL (`20260830000003`). ⚠️ **TIDAK retroaktif:** kolom sumbu RLS yang SUDAH ADA (`inquiries.owner_id`) tidak otomatis wajib ditambal oleh aturan ini — perlu-tidaknya pengisi lapis DB di sana = **Keputusan Terbuka #58, tetap terbuka**. Detail: gotcha #38.
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
    --schema-only --schema=public \
    -f /tmp/snap.sql && mv /tmp/snap.sql supabase/schema_snapshot.sql
  ```
  (`pg_dump` langsung — `supabase db pull` butuh Docker yang belum terpasang.)

  ⛔ **JANGAN `supabase db dump`.** [7 Sep 2026] CLI itu **membuang seluruh baris
  komentar** dan **me-quote semua identifier**, sehingga hasilnya berbeda bentuk
  dari seluruh riwayat snapshot: diff-nya menjadi **RAKSASA dan PALSU** — ribuan
  baris berubah tanpa satu pun perubahan skema nyata, dan review-nya jadi mustahil.
  Pakai `pg_dump` persis seperti di atas.

  ⚠️ **TANPA `--no-owner` maupun `--no-privileges`.** Snapshot yang berlaku
  memang ber-ACL. Kedua flag itu akan MENGHAPUS-nya diam-diam — bukan "refresh",
  melainkan regresi. ACL-nya bukan kebetulan: tanpa itu, gap GRANT (mis.
  `DELETE ON sp_items` untuk `authenticated`) tak bisa diaudit dari repo sama
  sekali.

  `--schema=public` menjaga isinya tetap skema aplikasi saja; tanpa flag itu
  dump ikut membawa ~35 tabel skema sistem (`auth`/`storage`/`realtime`/`vault`)
  yang bukan milik proyek ini.

  ⚠️ **Snapshot SEBELUM 5 Sep 2026 dibuat tanpa `--schema=public`, jadi memuat
  ke-35 tabel sistem itu. Jumlah tabel `public` TETAP SAMA sebelum dan sesudah —
  NOL tabel bisnis hilang.** Dicatat eksplisit supaya orang yang membandingkan
  jumlah tabel/ukuran file antar-commit tidak salah membacanya sebagai kehilangan.

  ⚠️ **ALASAN UTAMA `--schema-only` adalah PRIVASI, bukan ukuran file.** Blok
  `COPY` memuat **data pribadi produksi** — nama, email, telepon, alamat, tanggal
  lahir, dan kontak darurat di `profiles` — yang begitu ter-commit **tersimpan
  permanen di riwayat Git**. Itu argumen yang berdiri sendiri, terlepas dari
  argumen ukuran/pemakaian di blok keputusan di bawah.

  Lewat `/tmp` lalu `mv` — supaya `schema_snapshot.sql` tidak pernah tertulis
  separuh kalau `pg_dump` gagal di tengah.

  **Verifikasi wajib sesudahnya.** Bandingkan dengan refresh SEBELUMNYA, bukan
  dengan angka mati. Kalau salah satu **TURUN** → JANGAN commit:
  ```bash
  grep -c "^CREATE TABLE public\."      supabase/schema_snapshot.sql   # 138 per 7 Sep 2026
  grep -c "^GRANT .* TO authenticated;" supabase/schema_snapshot.sql   # tak boleh turun
  ```
  Angka kedua sengaja tanpa patokan tetap — ia tumbuh tiap kali ada tabel/RPC
  baru. Yang dijaga adalah **tidak menyusut**: penyusutan berarti ACL raib, dan
  itu persis kegagalan senyap yang pernah jadi insiden produksi nyata (5 Agu
  2026 — GRANT tabel BNF kelewat, berujung 403 berulang).

  ⚠️ `grep -c "^COPY public\."` **BUKAN lagi verifikasi.** Snapshot ini
  schema-only, jadi angkanya memang **0**. Baris verifikasi lama yang mewajibkan
  `~133` sudah **DICABUT** — jangan dihidupkan lagi tanpa membaca keputusan di
  bawah.

  **[KEPUTUSAN 6 Sep 2026 — `schema_snapshot.sql` TETAP schema-only.]** Ditutup
  sesudah audit jejak read-only. Ringkasan alasannya dicatat di sini supaya tak
  perlu dibuka ulang dari nol:
  - **Snapshot lahir schema-only** (`74b0c1b`, 17 Jun 2026 — pesan commit-nya
    menyebut sendiri "pg_dump schema-only") dan bertahan begitu **119 commit
    refresh**.
  - **Data baru ikut 31 Agu 2026** (`0c736fb`) **tanpa keputusan tertulis**:
    pesan commit-nya cuma "refresh dari production", nol penyebutan data.
  - **Aturan yang mewajibkan data ditulis 2 Sep** (`83a6c26`) — **dua hari
    SESUDAHNYA**. Ia mendeskripsikan keadaan yang sudah terjadi, dan **alasan
    yang diberikannya hanya soal ACL, bukan data**. Bagian ACL itu benar dan
    **DIPERTAHANKAN** di atas; bagian datanya tak pernah punya alasan tertulis.
  - **Nol pemakaian.** Dari **680 rujukan** `schema_snapshot` di seluruh
    dokumentasi, **NOL** memakai bagian datanya. Dua dokumen malah menyatakan
    datanya di luar jangkauan lalu pergi ke SQL Editor: `03_DATA_MODEL.md:131`
    (`chart_of_accounts`) dan `docs/archive/audits/16_SP_TABLES_SYNC_AUDIT.md:107`
    (`sp_order_items`).
  - **Biayanya nyata.** Versi berdata memuat **385 alamat email unik**, **1.246
    baris `accounts`**, **1.004 `contacts`**, plus kolom `npwp`/`ktp_direktur`/
    `nib` — data pelanggan yang **tersimpan permanen di riwayat Git** tanpa satu
    pun pemakaian yang pernah tercatat. Ukuran **9,62 MB vs 704 KB**.

  ⚠️ Keputusan ini menghentikan PENAMBAHAN data, **tidak menghapus yang lampau**:
  commit `0c736fb`…`d10e09a` (31 Agu–5 Sep 2026) tetap memuat data itu di
  riwayat Git.

---

## 5. Brand & Design System — palet APLIKASI (keputusan Den 19 Sep 2026)

> ⛔ **STATUS: KEBIJAKAN SUDAH DIPUTUSKAN, KODE BELUM DIUBAH.** Seluruh isi §5 ini adalah **arah/kebijakan**; kode aplikasi hari ini masih memakai palet navy/oranye lama, dua tumpukan font legacy, Oswald `.kpi-value`, dan pengecualian KPI hero (inventaris lengkapnya: `docs/DESIGN_SYSTEM_REFERENCE.md`). **Implementasi (penyatuan kit tunggal + ganti warna/font + TD-269/TD-270) sengaja DITUNDA menunggu instruksi Den.** **[20 Sep 2026 malam — Batch DS 1 selesai: kit tunggal `src/kit/` (`tokens.js` sage + komponen) + `src/lib/entities.js` sudah ADA sebagai KODE MATI, nol halaman memakainya; kalimat "kode aplikasi masih navy/oranye" tetap benar untuk semua halaman; Batch DS 2–7 belum mulai — `docs/DESIGN_SYSTEM_REFERENCE.md` A.4.3.]** **[20 Sep 2026, sesi keenam: review Batch DS 1 DITUTUP Den — #62 dijawab (empat fg kelas STATUS `src/kit/tokens.js` digeser minimal ke AA; kode mati, nol halaman berubah) + #61 FINAL; Batch DS 2 belum mulai.]** **[20 Sep 2026 malam, sesi ketujuh: Batch DS 2 DIKERJAKAN di branch `feat/kit-ds2-adminkit`, ⏳ menunggu review Den — 22 halaman admin/Foundation + `main.jsx` memakai kit sage DI BRANCH ITU; kalimat "kode aplikasi masih navy/oranye" tetap benar untuk produksi dan untuk semua halaman di luar 22 itu; AdminKit tetap ada, nol pemakai di branch (dihapus Batch DS 7); Batch DS 3–7 belum mulai — DSR A.4.3.]** **[20 Sep 2026 malam, sesi kedelapan: revisi kebijakan — `Latar kartu` `#EEF3EA` → `#FFFFFF` (keputusan Den saat review Batch DS 2; tabel di bawah sudah disesuaikan, 8 token lain tetap). Di kode baru menyentuh `src/kit/tokens.js` + `kit.css` di branch Batch DS 2 (22 halaman ikut lewat token); status review Batch DS 2 tidak berubah; produksi tetap belum berubah.]** **[20 Sep 2026 malam, sesi kesembilan: review Batch DS 2 DITUTUP Den — Batch DS 2 ✅ SELESAI; 22 halaman admin/Foundation + `main.jsx` memakai kit sage DI `main` (tampilan produksi 22 halaman itu berubah begitu deploy `main` berikutnya); kalimat "kode aplikasi masih navy/oranye" kini berlaku untuk semua halaman DI LUAR 22 itu; AdminKit nol pemakai (kode mati s/d Batch DS 7); ⚠️ catatan terbuka BELUM LOLOS: alur simpan HRGA "Simpan Semua" belum pernah dites (→ Batch DS 6); Batch DS 3–7 belum mulai — DSR A.4.3.]** Jangan mengimplementasikannya sepihak (termasuk mengimpor `src/kit` ke halaman di luar giliran Batch DS-nya — #61 tetap berlaku, **FINAL**), dan jangan membaca dokumen ini sebagai "kode sudah sesuai".

**Palet resmi tampilan aplikasi internal Nexus — "sage":**

| Token | Hex | Pakai |
|-------|-----|-------|
| Latar halaman | `#F6F8F3` | background shell / halaman |
| Latar kartu | `#FFFFFF` | kartu, panel, surface — **direvisi Den 20 Sep 2026 malam (semula `#EEF3EA`)**: kartu **putih polos**; pemisah dari latar halaman cukup lewat **border**; sage tetap tampil lewat teks, ikon, dan aksen |
| Aksen utama | `#C3D9B8` | tombol utama, item aktif, highlight — **hover `#AFC9A0`** |
| Aksen kedua | `#D7C9B0` | aksi sekunder, penanda pendukung — **hover `#C9B896`** |
| Border | `#D8E0D2` | garis, pembatas, border kartu/input |
| Teks utama | `#33422B` | heading, body |
| Teks sekunder | `#5C6B52` | label, subtitle, teks redup |

- Palet sage **menggantikan seluruh navy dan oranye lama sebagai warna aplikasi** — tidak ada lagi navy/oranye "resmi" untuk UI. Warna di luar tujuh token ini tidak boleh dipakai di UI tanpa keputusan tercatat. Token **turunan** (hover/disabled/fokus/garis dalam kartu, dsb.) dihitung dari token di atas dengan rumus tercatat di `src/kit/tokens.js` — kalau satu token kebijakan berubah, turunannya dihitung ulang, bukan diputuskan terpisah (contoh: revisi `CARD` 20 Sep 2026 malam → `LINE_SOFT`/`HEAD_BG`/`DISABLED_BG` ikut berubah; angka: `docs/DESIGN_SYSTEM_REFERENCE.md` A.1 catatan revisi).
- ⚠️ **Palet sage KHUSUS tampilan aplikasi internal Nexus.** Dokumen yang dikirim ke customer — **Print kit** (`src/modules/logistics/printKit.jsx` + `printTokens.js`), **PDF Storbit** (Picking List, Surat Jalan, Invoice, Laporan Storbit), Quotation PDF — **tetap memakai warna brand entitas MSI/JCI/SOA yang asli, TIDAK ikut berubah, dan TIDAK disentuh keputusan ini.** Print kit juga **dikecualikan** dari penyatuan kit (`docs/DESIGN_SYSTEM_REFERENCE.md` §Arah Penyatuan).
- **Font resmi TIGA saja:** heading/display **`Montserrat`** · body **`Inter`** · angka & kode **`IBM Plex Mono`** (Google Fonts, di-load `index.html`). **Font lain apa pun tidak resmi** — termasuk font legacy yang hari ini masih dimuat oleh kode (`TD-70`, ditunda). **Satu-satunya pengecualian yang tercatat: Oswald `.kpi-value` (angka 4 KPI hero CRM Dashboard) DIPERTAHANKAN untuk saat ini** — keputusan sadar Den 20 Sep 2026 yang sengaja ditunda, **bukan kelupaan dan bukan pelanggaran** kebijakan tiga font; jangan dicatat sebagai pelanggaran saat audit ulang, dan jangan diperluas ke elemen lain (#60 c, `09_ROADMAP.md`). Cormorant Garamond/Lora yang dipakai dua halaman **web** Storbit (`SalesOrderDetailPage.jsx`, `StorbitDashboardPage.jsx`) **bukan** pengecualian: keduanya ikut penyatuan ke tiga font (#60 a, BELUM DIKERJAKAN). PDF: font milik masing-masing kit cetak (Helvetica built-in di Quotation; Lora + Cormorant Garamond di print kit Storbit) — di luar aturan ini.
- **Ikon:** **Lucide only**. Tidak ada inline-SVG icon ad-hoc untuk hal yang ada di Lucide.
- **LARANGAN:**
  - ❌ **No emoji** di UI.
  - ❌ **No dark green** — `#1a3a2a`, `#2d5a3d`, `#0F2A23`, `#173D34`, `#2F6B3F`, `#E7EFE2` semua deprecated (⚠️ `#2F6B3F`/`#E7EFE2` **masih hidup di 5 file** — `TD-269`, belum diperbaiki). Hijau-status lama (`#1F8B4D`, `#0F766E`) = keadaan kode, bukan bagian palet sage; nasibnya ikut penyatuan kit.
  - ❌ Font di luar tiga font resmi.
- **Warna status/data ≠ warna identitas aplikasi (keputusan Den 20 Sep 2026, #60 b).** Palet sage mengatur **identitas** aplikasi (latar, kartu, aksen, border, teks). **Warna status/data** — termasuk **5 warna 4 tile KPI hero CRM Dashboard** (`src/modules/crm/CRMDashboardPage.jsx` kelas `.kpi`: `#5C6070`/~~`#EE9A7E`~~ **`#EEAA8D`** *[koreksi doc-keeper 20 Sep 2026: kode `CRMDashboardPage.jsx:3548` memakai `#EEAA8D` sejak `a709bd5` 31 Agu 2026; `#EE9A7E` nol hit di `src/`]*/`#B4E0F2`/`#7FBBDA`/`#5A9CC3`) — **TETAP warna-warni dan TIDAK diseragamkan ke sage**: warna status harus tetap **kontras satu sama lain** (merah tetap beda dari hijau) supaya sinyalnya tidak kabur. Ini **bukan pengecualian yang lupa diseragamkan**, melainkan kelas warna yang memang tidak tunduk pada palet identitas — keputusan final, bukan pekerjaan tertunda. Scope KPI hero tetap komponen itu saja (jangan disalin sebagai palet umum). Hex konkret palet status di kit tunggal ditetapkan saat penyatuan. Detail implementasi CSS-nya: `06_UI_UX_FLOW.md §1`.
- **Halaman/fitur baru selama masa tunggu penyatuan (keputusan Den 20 Sep 2026, #61 — DISETUJUI):** ikut kit/token yang **sudah ada** (peta per modul: `docs/DESIGN_SYSTEM_REFERENCE.md` §0), **bukan langsung sage** — supaya tidak lahir palet kelima di kode. ~~Berlaku sampai `tokens.js` sage bersama + kit tunggal tersedia dan instruksi implementasi turun.~~ **FINAL (Den, 20 Sep 2026 sesi keenam):** kit tunggal yang sudah ada di `src/kit/` (Batch DS 1, kode mati) **TIDAK melonggarkannya** — `src/kit` hanya boleh diimpor sebuah halaman **pada giliran Batch DS halaman itu** (`docs/DESIGN_SYSTEM_REFERENCE.md` A.4.3); halaman/fitur baru yang lahir sebelum gilirannya tetap memakai kit/token tetangganya lalu ikut dimigrasi pada Batch DS modulnya; mengimpor `src/kit` di luar giliran = migrasi di luar rencana, ditolak saat review. Berhenti berlaku **per halaman** saat Batch DS-nya selesai, **sepenuhnya setelah Batch DS 7**.

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
| Tambah parameter RPC → salin badan LIVE + `REVOKE PUBLIC` signature baru + putuskan nasib overload lama dalam SATU migrasi | `CREATE OR REPLACE f(a, b)` lalu menganggap `f(a)` ikut terganti/ter-hardening |
| `npm run build` clean sebelum selesai | Push tanpa verifikasi build |
| Label PPN invoice dari `PPN_LABEL_PCT` (12); perhitungan dari `PPN_RATE` (0,11) **dan** literal `0.11` di `create_invoice` — dua keputusan terpisah (gotcha #32 `03_DATA_MODEL.md`) | "Menyamakan" `PPN_LABEL_PCT` ↔ `PPN_RATE` ke salah satu arah, atau menyentuh nominal `total_ppn` saat mengubah label (12% × DPP Nilai Lain 11/12 = 11% efektif — **keduanya benar**) |

---

## 7. Workflow Development

**Per task (urutan wajib):** Inspect (branch, git status, file terkait) → Plan (scope kecil) → Edit (hanya file yg perlu) → Verify (`npm run build`, lint net-zero — sejak 21 Sep 2026 lewat `node scripts/qa/lint-baseline.mjs`; bila menyentuh menu/route juga `node scripts/qa/check-menu-paths.mjs`; keduanya = isi CI. **Bila menyentuh routing/gate navigasi (sejak G1 22 Sep 2026):** jalankan sweep `scripts/qa/menu-sweep.mjs` 3 mode terhadap build yang diukur + DB staging dan bandingkan tiap mode ke baseline mode-nya sendiri — **`menu` ↔ `baseline/menu-sweep`, `restore` ↔ `baseline/menu-sweep-restore`, `path` ↔ `baseline/menu-sweep-path`** (ketiganya = hasil build G1 sejak 22 Sep 2026, keputusan Den; `--ignore` tidak wajib lagi — hanya bila sengaja mengecualikan field); perbedaan yang diharapkan saat baseline diganti wajib disebut eksplisit di `PROGRESS.md`, selain itu = regresi — aturan lengkap `scripts/qa/README.md`. **Bila menambah/memindahkan rute DETAIL ber-`:id` (sejak G2 22 Sep 2026):** sweep tidak cukup — ia hanya membuka tujuan MENU, cold load; jalankan juga `node scripts/qa/detail-routes.mjs --suite <modul>` yang menguji checklist butir 2 (refresh di detail → konteks bertahan) & butir 4 (deep-link id tak sah → keadaan wajar, bukan layar putih) + klik baris/tombol kembali/Back-Forward) → Summarize (Summary / Files changed / Verification / Risk / Not changed / Next step).

**DB change flow:**
1. State: tabel apa, kenapa, data/query terdampak. **Tunggu approval eksplisit.**
2. Eksekusi (SQL Editor / migration) → **refresh `schema_snapshot.sql`** via `pg_dump`.
3. Untuk drop kolom: deploy code yang berhenti baca/tulis kolom + verifikasi production **dulu**, baru drop (staged tahap — lihat penghapusan `profiles.role`).

**Audit-before-fix:** untuk bug non-trivial / lintas-komponen, jalankan AUDIT read-only dulu (laporan file:line + akar masalah + dugaan fix), baru EKSEKUSI. Banyak task sesi ini berpasangan AUDIT → EKSEKUSI.

**Periksa PENYEBAB yang disebut dalam perintah perbaikan sebelum menjalankannya [aturan 11 Sep 2026]:** kalau instruksi menyebut *penyebab* ("hapus placeholder X", "Y bergeser dari Z"), cocokkan dulu ke kode/render — **kalau kode tidak sesuai deskripsi, laporkan selisihnya SEBELUM mengubah apa pun**, jangan dijalankan apa adanya. Diagnosis dari deskripsi layar/foto bisa menyesatkan, dan perbaikan atas penyebab yang salah menambah masalah baru tanpa menyentuh yang lama. Jejak: 11 Sep 2026, blok tanda tangan invoice — dua perintah lahir dari pembacaan **gambar contoh**, bukan PDF: (a) "hapus placeholder Stamp/Signature" padahal placeholder itu **tidak pernah ada** di PDF (coretan di gambar); (b) "Account Dept bergeser dari PT STUJA di atasnya" padahal **ketiga baris rata kiri** di tepi kotak yang sama. Kode diperiksa dulu, keduanya terhindar (`PROGRESS.md` 2026-09-11, tindak lanjut kedua).

**Session relay pattern:** tiap task = sesi fokus. `CLAUDE.md` "Current Phase & Recent Changes" + `PROGRESS.md` di-update tiap akhir task (build status, lint delta, "Belum: tes manual runtime"). Tes manual runtime sering **belum** dijalankan — selalu tandai eksplisit.

**Push/deploy:** HANYA bila diinstruksikan eksplisit. `main` = production (Vercel auto-deploy). Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Tugas dokumentasi:** update `docs/` saat fitur/aturan/keputusan berubah; update `CLAUDE.md` saat ada standing rule baru.

---

## 8. QA Checklist

> Checklist manual sebelum deploy/push (belum ada test otomatis — TD-07; **sejak 21 Sep 2026 ada CI** `.github/workflows/ci.yml` = build + lint-baseline + kontrak URL — gate regresi, BUKAN unit test — plus sweep runtime lokal `scripts/qa/menu-sweep.mjs` — 3 mode `menu`/`restore`/`path` dengan baseline per mode di `scripts/qa/baseline/` (hasil build G1 sejak 22 Sep 2026) — dengan checklist manual per giliran Batch FS di `scripts/qa/README.md`). **Pre-deploy & DB-change checklist = lihat §4 (Pola Wajib Database), §6 (Do/Don't), §7 (Workflow Development)** — tak diulang di sini. Bagian ini fokus ke checklist per-modul + PDF quotation.

### Per-Modul (fitur kritis + edge case pernah kena bug)

**CRM** — Fitur kritis tiap deploy: Pipeline drag stage (NEW→…→WON/LOST; WON → account jadi `customer` & muncul di Master Customer; soft-gate PROPOSAL/WON muncul); visibility per role (super_admin lintas entitas, manager se-entitas, sales hanya miliknya — jangan bocor lintas role/entity); Quotation simpan (create + edit via RPC) benar saat reload (bukan basi/duplikat) + total/subtotal/VAT/grand benar + PDF generate; Activities create/done/cancel/edit → muncul di Activity Log feed + dropdown sales termuat; Dashboard KPI & chart terisi per-role. Edge case pernah kena bug: Quotation edit kedua "tidak ngefek" (state basi / RLS update silent / policy DELETE hilang); Dropdown sales kosong untuk manager (RLS `user_roles_read` `is_admin_or_above`); Currency dropdown / VAT rate per service_type; CRM Dashboard chart kosong (`useWidth` race).

**Foundation** — User Access (Add User via create-user EF → user+role+company benar; Edit permission diff-save; avatar upload; deactivate/delete super_admin; Ubah Password); Positions compact (1 baris per code, badge entitas, edit checkbox reactivate bukan duplicate vs `UNIQUE(company_id,code)`); Org Structure (tree dari `reports_to`); Master data CRUD soft-delete + scope company. Edge case: trigger `trg_z_gen_customer_code_upd` (jangan generate code saat soft-delete → dulu "duplicate key accounts_code_unique"); `profiles` pakai `active` (bukan deleted_at/is_active).

**Service Management (HRGA / Asset)** — HRGA submit request → nomor HRG ter-generate + approval matrix per company + status lifecycle; Asset list per kategori + detail tab + inline-edit IT (3 tabel) + Health Score (save Add Asset wizard masih dummy — jangan klaim persist). Edge case: `hrga_approval_configs` query WAJIB filter `company_id` (kalau tidak → `.single()` coerce error); tabel CLI butuh GRANT manual.

### PDF Checklist (Quotation)

- [ ] Klik Download PDF → file `.pdf` ter-download (bukan error).
- [ ] **Teks selectable** (vektor `@react-pdf`, bukan raster image).
- [ ] **9 section muncul** & urut: header → customer details → item tables → grand summary → notes → terms → signatures → divider → footer.
- [ ] **Tabel item tidak kepotong di tengah baris** (page break otomatis, `wrap={false}`).
- [ ] **Footer muncul di setiap halaman** (`fixed`); divider nempel di atas footer.
- [ ] **Grand total benar**; PPN label dynamic ("PPN 1,1%"/"PPN 11%"); baris VAT hilang kalau 0%.
- [ ] **Internal data TIDAK muncul:** `cost_price`, `margin`, `internal_notes` (customer-facing only).
- [ ] "Customer Representative" + nama customer center; on-screen detail tetap normal.
- [ ] Filename `${quotation_no}_rev${revision??1}.pdf`.
