# CLAUDE.md — Nexus by MSI

> Lean entry point untuk Claude Code. Detail lengkap ada di `docs/` (lihat tabel di bawah). `AGENTS.md` = identitas produk + safety rules — struktur/kebijakan/prinsip JANGAN diubah (kontrak Codex, lihat `.codex/agents/*.toml`); koreksi angka/fakta yang TERVERIFIKASI basi (mis. line-count, nama domain) BOLEH, syarat diff sekecil mungkin + commit message eksplisit sebut "koreksi fakta" (pola commit `c5476ae`). `PROGRESS.md` = dev log per-tanggal.

## Quick Reference

- **Stack:** React 19 + Vite 8 · TailwindCSS 3 · Supabase (PostgreSQL + Auth + RLS + Edge Functions + Storage) · Vercel auto-deploy dari `main` (= production).
- **Supabase ref:** `untmpqceexwxzuhlmyrg` (org "Milenial Solusi Internusa", project `nexus-msi`; ref TIDAK berubah pasca-migrasi) · pooler/`pg_dump` host **`aws-1-ap-northeast-2.pooler.supabase.com:5432`** (region Seoul — ⚠️ BUKAN `ap-southeast-1`; catatan lama yang salah menyebabkan gagal koneksi backup).
- **Live URL:** `nexus.msigroup.co.id` (production, CNAME via Domainesia) — satu-satunya domain resmi · **lama `nexus.dli.my.id` sempat dibiarkan hidup sbg safety net, kini SUDAH DINONAKTIFKAN (20 Jul 2026):** DNS record CNAME `nexus` di zona `dli.my.id` (Domainesia) dihapus, tanpa redirect.
- **Repo:** GitHub `Milenial-Solusi-Internusa/storbit-manifest`, branch `main` (solo dev; `fix/*` hotfix). ⚠️ **repo masih PUBLIC** (backlog keamanan — kode ERP 3 entitas + schema terbuka).
- **Deploy:** Vercel team "MSI Group" (Hobby), project `nexus` · project Vercel lama (akun pribadi Hobby, `storbit-manifest`) dibiarkan hidup sementara (safety net).
- **Migrasi kepemilikan (9-10 Jul 2026):** Supabase/GitHub/Vercel/domain dipindah dari akun pribadi ke org MSI. Backup penuh (schema+data, 3.5 MB, 96 tabel) diambil sebelum migrasi. **Backlog keamanan (belum dikerjakan):** repo PUBLIC → private; 2FA 2 Owner org GitHub (mhmmdjaelaniii, msigroup-sys); Vercel Hobby → paid (pemakaian komersial); Supabase Auth Site URL masih `localhost:3000` + Redirect URLs kosong (rapikan); rename repo→`nexus` (opsional).
- **Entity UUID:** MSI `0e1840d8-e6fb-4190-bd09-88338e68b492` · JCI `42569e7c-531b-4d2b-832a-d5a7268c455b` · SOA `d2e5e565-5f67-4954-b8d9-5979a2a0c697`.
- **Sumber kebenaran DB:** `supabase/schema_snapshot.sql` (**110 tabel, 10 di antaranya tabel backup** — BUKAN `migrations/`, yang berhenti 3 Jun 2026). Status freshness lengkap (riwayat stale/segar 10 Jul–27 Jul + aturan baca snapshot): `03_DATA_MODEL.md` **gotcha #10**.
- **Brand:** navy `#144682` · orange `#E85A1E` · coral `#F08C7D` · app shell putih `#ffffff` · Montserrat (heading) + Inter (body) · Lucide icons · **no emoji, no dark green**.

## Aturan Wajib (ringkasan — detail: `docs/Governance/02_RULES_GOVERNANCE.md`)

- **Fetch:** selalu `.limit(1000)` (default PostgREST 10) · `.is('deleted_at', null)` · scope `company_id` + role-aware (`isAllEntities=['super_admin']`, `isSalesOnly=['sales','operations']`).
- **`profiles`** pakai kolom **`active`** (TIDAK ada `deleted_at`). · **`showToast?.(message, type)`** (urutan message dulu).
- **Soft delete** (`deleted_at`/`is_active=false`), jangan hard-delete data business.
- **DB:** GRANT setelah CREATE (tabel CLI tak auto-grant) · trigger ordering pakai prefix `trg_z_` · `auth.uid()` NULL di SQL Editor (test RLS di browser) · super-admin bypass = top-level `OR is_super_admin()`.
- **Embed alias** saat constraint FK belum di-rename (`customers:accounts!sp_items_customer_id_fkey(name)`).
- **Deploy code yang berhenti baca kolom DULU, baru drop kolom.** · Refresh `schema_snapshot.sql` via `pg_dump` setelah perubahan SQL Editor.
- **Workflow:** Inspect → Plan → Edit (scope kecil, hindari big-bang & rewrite App.jsx sekaligus) → Verify (`npm run build` clean, lint net-zero) → Summarize. Push HANYA bila diinstruksikan. Audit-before-fix untuk bug non-trivial.
- **Status commit/merge/branch: JANGAN ditulis ke `CLAUDE.md`/`PROGRESS.md`** (berlaku juga untuk doc-keeper). Git satu-satunya sumber kebenaran (`git log`, `git branch --merged`) — menyalinnya ke dokumen = dua sumber yang pasti melenceng (terbukti 19 Jul 2026: 9 entri harus dikoreksi). Yang TETAP dicatat karena git tak tahu: keputusan desain + alasannya, langkah manual DB belum jalan (mis. refresh `pg_dump`, RPC dibuat manual), pertanyaan terbuka, status tes runtime, tech debt. Nama branch boleh disebut sebagai KONTEKS ("dikerjakan di branch X"), tapi JANGAN nyatakan sudah/belum merge.
- **Safety rules lengkap:** lihat `AGENTS.md` (15 non-negotiable).

## Dokumentasi Lengkap

| File | Isi |
|------|-----|
| `AGENTS.md` | Identitas produk, prinsip engineering, 15 safety rules, workflow per tipe task |
| `docs/Governance/02_RULES_GOVERNANCE.md` | Konvensi kode, pola wajib frontend/DB, brand, Do/Don't, workflow |
| `docs/Governance/03_DATA_MODEL.md` | Referensi DB per modul, entity UUID, RLS patterns, RPC, gotchas (incl. mesin status SP 12-tahap) |
| `docs/Governance/08_TECH_DEBT.md` | Daftar tech debt (TD-01…TD-44) + prioritas fix |
| `docs/Governance/09_ROADMAP.md` | Status modul, milestone, next up |
| `PROGRESS.md` | Dev log kronologis per-tanggal (jangan dihapus) |
| `docs/architecture/`, `docs/security/`, `docs/database/`, dll | Blueprint, baseline keamanan/performa, dll (lihat AGENTS.md "Required Reading") |

## Current Phase & Recent Changes

**Current phase: MVP Storbit end-to-end — chain SP → Picking → Surat Jalan LENGKAP + master-data tooling (dikerjakan di branch `restruktur-nexus`)** ✅ Selesai di branch: Slice 0.1 (status SP) · Fase 2 (Picking List + Cancel) · Import Data Produksi (720 baris/435 SP, terverifikasi SQL) · Fase 0.2 (product_id backfill) · Fase 0.3 (SP external_url) · Fase 3 (Packing & Surat Jalan/delivery notes) · Fase 1 (cek stok & reservasi otomatis) · Material Packing + PickingListPDF (Fase 3.x) · Lokasi Rak + Riwayat Harga produk (kontrak/PKS) · BulkEditPricePage (update harga massal, picker role-aware lintas entitas) · ProductPicker dropdown-only di InputSPPage/FormModal/EditItemModal + prefill harga snapshot · fix mapping `is_active` (dropdown customer). **Smoke test UI belum penuh** (banyak fitur "build clean, belum tes runtime" — perlu login). **PERLU KONFIRMASI:** selisih SP 431 vs 435 (Gigih) · mapping 30 item kontrak PKS Indomarco. Detail granular: `PROGRESS.md` + `STATUS.md`. **➕ FASE 0 skema SP baru** (`dc_master`/`sp_orders`/`sp_order_items`/`sp_btb` + 3 harga kategori + repoint FK gudang + constraint) **SELESAI & terverifikasi di branch `feat/sp-schema`** — **DB-only, non-destruktif** (tabel lama utuh), **belum frontend, belum refresh snapshot**; **sudah merge ke `main`**. Lihat entri Recent teratas + `PROGRESS.md` 2026-07-06 + `DESIGN_SP_SCHEMA.md`.

Recent (terbaru → lama; detail granular di git history & `PROGRESS.md`):
- **3 fix kecil FE turunan audit `OVERDUE_STATUS_AUDIT.md`: badge "Overdue" Kanban Pipeline disinkronkan ke Edge Function `aging-pipeline`** — `AGING_LIMITS` (`PipelineKanbanPage.jsx`) disamakan ulang dgn `AGING_RULES` backend (drift sejak `proposal`/`negotiation` dicabut 24 Jul; stage `new` sebelumnya tanpa badge sama sekali) + badge digate ke `companies.aging_enabled` (keterbatasan disengaja: satu nilai per papan, bukan per-kartu — lihat TD-168) + notifikasi "Prospect Masuk Lead Pool" kini bisa diklik-tembus ke Lead Pool (`App.jsx`). **Terpisah, sesi sama:** koreksi klaim salah trigger `track_stage_change()` di `03_DATA_MODEL.md`/`05_WORKFLOW_MAP.md` — trigger itu HANYA menstempel `stage_changed_at`, tak pernah menulis ke `activity_logs`. +TD-168/TD-169 (baru, RESOLVED kode). Lihat `PROGRESS.md` 2026-08-06.
- **Insiden produksi pasca-BNF: GRANT tabel baru kelewat (403 berulang, 517 error identik) memicu loop render/refetch dari `showToast` non-`useCallback` di `App.jsx` + `CRMDashboardPage.jsx`** — semua sudah diperbaiki; kelas kerapuhan `showToast` dicatat 1 entri gabungan **TD-165**, pola GRANT-hilang **TD-166** (kemunculan kedua setelah TD-163), gap notifikasi Edit BNF **TD-167** (baru, ditemukan doc-keeper). Lihat `PROGRESS.md` 2026-08-05.
- **Modul BNF (Bad News First) baru — 7 fase (A-G): fondasi DB (org roles + trigger 4-tier), submit+admin UI, edit/hapus laporan, notifikasi eskalasi Direktur Divisi/CEO, reminder overdue otomatis (cron), Divisi/Dept Irisan multi-select** (branch `feat/bnf-module`; migrasi dari app Google Apps Script lama, data lama TAK dipindah; Governance docs 03/04/05 belum diperbarui utk modul ini — di luar scope sesi dok. 6 Agu). Lihat `PROGRESS.md` 2026-08-04 & 2026-08-05.
- **Notifikasi email saat di-tag di komentar Chatter — Edge Function baru `send-email` (relay generik ke Resend API)**, jadi fondasi yang lalu dipakai ulang modul BNF di atas. Lihat `PROGRESS.md` 2026-08-03.
- **Redesign `DealDetailPage` — 4-tab restructure + field link-able (nama sales/akun, `ProfileMiniView.jsx`) + Chatter (komentar+@mention+notifikasi, `InquiryChatter.jsx`)** (3 commit berurutan; 2 tabel baru `inquiry_comments`/`inquiry_comment_mentions` belum direkam migrasi, snapshot kini memuatnya — TD-163 PARTIAL; Chatter tanpa `showToast` — TD-164). Lihat `PROGRESS.md` 2026-07-31.
- **Fix PRF prefill dari inquiry (kehilangan `inquiry_no`) + `InquiryPicker` tampilkan nama+tipe akun + nomor Quotation/PRF jadi link**. Lihat `PROGRESS.md` 2026-07-31.
- **Tab "BANT & Pipeline" (Detail Account) — edit inline 4 dimensi BANT + fix silent-fail RLS di `saveDealUpdate`** (berdampak retroaktif ke Pindah Stage/Edit Deal juga; TD-161). Lihat `PROGRESS.md` 2026-07-30.
- **PRF: draft bisa diedit (TD-76) + redesign Detail PRF jadi 9 section bernomor + rename "Cetak PRF"→"Buat PRF"** (TD-93/148/149). Lihat `PROGRESS.md` 2026-07-29.
- **Gerbang "Buat Quotation" terima jalur penawaran vendor + fix gate "Cetak PRF" baca seluruh role aktif** (dua batch independen; TD-90/105/157/158). Lihat `PROGRESS.md` 2026-07-28.
- **Modul "Penawaran Vendor" PRF — fondasi s/d Batch 3C** (klaim/lepas PRF, tambah/edit/hapus penawaran vendor, RPC `prf_mark_quoted`/`prf_select_offer`) **+ 2 fix kecil independen** (dropdown Inquiry di Quotation, nama sales di Detail PRF). Lihat `PROGRESS.md` 2026-07-27 (2 entri tanggal ini).

> ⚠️ Banyak fase "build clean, **belum tes manual runtime**" — selalu cek sebelum anggap fitur jalan. Update bagian ini + `PROGRESS.md` tiap akhir task. Histori lengkap sebelum 26 Jul 2026 (143 entri, dipangkas 31 Jul 2026 setelah diverifikasi satu-per-satu tersalin ke `PROGRESS.md` — 19 entri kecil yang ternyata belum tercatat dipindah ke section "Catatan Susulan" di puncak `PROGRESS.md` sebelum dihapus dari sini) ada di git history file ini + `PROGRESS.md`.

## Known Issues (Quick Ref — detail: `docs/Governance/08_TECH_DEBT.md`)

- **CRITICAL** — Migrasi RLS RBAC-driven belum jalan; ~51 policy pakai `is_admin_or_above()` (tak kenal manager/ceo) → bug akses (TD-01, **PARTIAL**: 3 oversight-read sudah +`is_manager_or_above`+STABLE). `has_permission()` flagged broken/unseeded (TD-02).
- **HIGH** — Audit CRUD/DELETE policy semua tabel (silent 0-row; TD-03, **PARTIAL**: 4 tabel transaksional sudah dpt DELETE policy). Write non-atomik ar_btbs/permission-diff (TD-33). `profiles_read = USING(true)` stopgap CEO (perketat saat HRIS; TD-04). Edge Functions delete-user/reset-password belum di-deploy (TD-21). Belum ada audit logging / test / Sentry (TD-05/07/08).
- **MEDIUM/LOW** — Dua sistem permission belum sinkron (TD-06); tabel dormant `sales_calls`/`sales_visits`/`customers` + kolom `profiles.role` belum di-drop (TD-18/19/20); App.jsx god-file 5.274 baris (pecah setelah ada test; TD-12).
- **FLAG (RBAC — JANGAN diperbaiki sekarang; perlu bahas terpisah)** — Menu `input` (Input SP) di-gate `module:'logistics'` → `hasPermission('logistics','view')`, dan role-def-nya masih meng-include `sales`. Konsekuensi: kalau RBAC grant `logistics.view` ke role **sales**, sales bisa lihat "Input SP" (sidebar) + "Buat SP" (home) → mungkin **tak diinginkan** (sales harusnya tak bikin SP). **Ini isu konfig data-permission/RLS (di luar scope FE)**, bukan bug home-gating (home 3.0C sudah konsisten dgn sidebar). Perbaikan = ubah role-def/permission `logistics.view` utk sales, berisiko → tunda sampai dibahas. Selain itu halaman `InputPage`/`InputSPPage` **tak punya page-level guard** (hanya `canAccessActiveMenu` yg kasar) → idealnya tambah guard halaman saat RBAC dirapikan.
