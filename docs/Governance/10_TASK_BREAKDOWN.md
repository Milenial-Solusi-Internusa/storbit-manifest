# TASK BREAKDOWN — Nexus by MSI

> Breakdown task aktif & backlog jadi unit yang bisa langsung dikerjakan Claude Code. Sumber: `docs/09_ROADMAP.md` (Next Up), `docs/08_TECH_DEBT.md`. Update saat task selesai / prioritas berubah.
>
> **Diperbarui 2026-07-18 (Cetak PRF dari inquiry — mandat MI): +F11** (lanjutan PRF — TD-79 sebagian tertutup + TD-76 dapat nuansa list read-only, inti tetap OPEN karena form create-only; +TD-89 LOW incoterms). NOL perubahan DB. Sebelumnya **2026-07-17 (rekam migrasi kurs + refresh snapshot) — F10 menyempit:** migrasi `quotations.exchange_rates` + `save_quotation` **sudah direkam** (`20260717000000_…`, `20260717000001_…`) dan **`pg_dump` sudah dijalankan** → snapshot stale TD-74(b) **dan** TD-72(b) **BERES sekaligus** (`schema_snapshot.sql:4044`/`:1013`/`:4295-4296`); **jangan dump ulang**. Sisa F10 = keputusan desain TD-74(c)/(d). Sebelumnya 2026-07-17 — **+F10** (TD-74); **+F9** (sisa TD-64: `supervisor` + `sales_spv`; `gm_bd` sudah beres).** Sebelumnya 2026-07-08 — +section H (FASE 4-5 + tech debt FASE 0-3); +Completed FASE 0-3; E1 (audit logging) DONE. Catatan kejujuran: task A–G lain (CRM/RBAC/foundation) **tidak** disentuh FASE 0-3 → tetap OPEN.
>
> ℹ️ **Audit sumber 13-18** (`13_CRM_FLOW_AUDIT`, `14_BACKLOG_RECON`, `15_INPUT_CONTROL_AUDIT`, `16_SP_TABLES_SYNC_AUDIT`, `17_ZERO_INPUT_AUDIT`, `18_CRM_SALES_PRF_PENDING_AUDIT`) **kini diarsipkan di `docs/archive/audits/`**. Tag `(dari NN_…)` di bawah = atribusi historis (bukan tautan hidup).

---

## Active / Next Up

> Dari ROADMAP "Next Up" — dipecah jadi task konkret. Banyak fitur berstatus "build clean, **belum tes manual runtime**".

### A. Runtime verification (staging) — tidak ubah kode, validasi saja
- [ ] **A1.** Verifikasi migrasi `accounts` di staging: Pipeline drag→WON jadi `customer` & muncul di Master Customer; tambah customer → `account_status='customer'` + `owner_company_id`; Dashboard/Inquiry/Quotation/Lead Pool tampil benar per role.
- [ ] **A2.** Verifikasi cutover Activity: log call/visit, mark-done/cancel/edit → muncul di Activity Log feed dengan judul benar (Aktivitas baru/selesai/dibatalkan/diubah); nama user & subtitle benar; tak ada duplikat.
- [ ] **A3.** Verifikasi Quotation: currency dropdown (EUR/SGD/JPY/MYR/USD/IDR), VAT auto per service_type (customs=11%), override tersimpan & reload benar, PDF teks selectable + 9 section + footer tiap halaman + internal data tak muncul, quote lama (vat_rate null) → fallback 1,1%.
- [ ] **A4.** Verifikasi dropdown sales (Activities/Dashboard) se-entitas untuk manager (pasca RLS); Positions compact (Manager 1 baris badge MSI+JCI+SOA, edit pre-checked, reactivate bukan duplicate).

### B. Deploy Edge Functions (TD-21/22)
- [ ] **B1.** `supabase functions deploy delete-user reset-password` + smoke test (hapus user dummy super_admin only; reset password).
- [ ] **B2.** Re-deploy `manage-schema` + `create-user` (pasca pembersihan `profiles.role` 2.3G); pastikan `SUPABASE_ANON_KEY` di env manage-schema.

### C. Drop tabel/kolom dormant (setelah verifikasi)
- [ ] **C1.** Drop `sales_calls`, `sales_visits`, `sales_visit_logs` (TD-18) — setelah A2 lulus. Data sudah dimigrasi.
- [ ] **C2.** Drop tabel `customers` (TD-19) — setelah konfirmasi 0 ref di kode live + approval.
- [ ] **C3.** Drop kolom `profiles.role` + enum `user_role_legacy` (TD-20) — setelah verifikasi semua super_admin ada di `user_roles` + approval.
- [ ] **C4.** Migrasi data `activities.type='prospecting'` → `whatsapp`/`followup` (TD-25). Refresh snapshot tiap drop.

### D. Keamanan / RLS (CRITICAL — sesi fresh)
- [ ] **D1.** Verifikasi `has_permission()` + apakah `permissions`/`role_permissions` ter-seed (TD-02).
- [ ] **D2.** Audit CRUD/DELETE policy SEMUA tabel — sisir UPDATE "admin-only" & DELETE policy hilang (TD-03).
- [ ] **D3.** Migrasi RLS RBAC-driven (4-fase, TD-01) — **prasyarat HRIS, sesi fresh, risiko tinggi**. Perketat `profiles_read` (TD-04) bersamaan modul HRIS.

### E. Foundation reliability
- [x] **E1.** ~~Implement `audit_logs` + `logAudit()`~~ **DONE (2.11J)** — tabel `audit_logs` + `src/lib/auditLogger.js` live, ~19 event di-wire (TD-05 DONE). Switch sumber `AuditLogPage` (`user_login_logs`→`audit_logs`) **sudah termasuk di 2.11J** (`7e40149`) → `AuditLogPage.jsx:103` kini `.from("audit_logs")`, **TD-37 DONE**. Sisa: **diff viewer `old_data`/`new_data`** (opsional, bukan blocker) — kolom sudah ditulis `auditLogger.js:92-93`, belum dirender (`AuditLogPage.jsx:9-10,104`).
- [ ] **E2.** Setup Vitest + RTL mulai dari util murni (`spCalc`, `bant`, format) (TD-07) — prasyarat pecah App.jsx.
- [ ] **E3.** Pasang Sentry + ErrorBoundary report (TD-08).

### F. Tech debt cleanup (open — dari audit 23 Jun 2026)
- [ ] **F1.** Bungkus write non-atomik dlm RPC/transaksi: `ar_btbs` (`db.js:371`), permission diff-save (`RolesPage.jsx:201`, `UserEditPage.jsx:355`) (TD-33).
- [ ] **F2.** Hapus / gate `import.meta.env.DEV` sisa **~65 `console.*`** noise di produksi (TD-32; AuthContext + ProductsPage sudah selesai).
- [ ] **F3.** `.single()` → `.maybeSingle()` sisa **~33 lokasi** (TD-10).
- [ ] **F4.** Tambah `.limit()`/`.range()` ke **~97 query** tanpa limit (TD-11).
- [ ] **F5.** Pecah file >800 baris (setelah test): `CRMDashboardPage` (~1.996), `AssetDetailITPage`, `AssetDetailPage` (~1.094), `SalesOrderDetailPage` (TD-13) + tier 800–1.000: `MyProfilePage` (~870), `QuotationFormPage` (~847), `ProductDetailPage` (~832), `QuotationDetailPage` (~824), `CustomerDetailPage` (~812) (TD-34).
- [ ] **F6.** Hapus dead code `*.legacy.jsx` (~1.206 baris: `CustomerMasterPage.legacy.jsx`, `UserManagement.legacy.jsx`) setelah konfirmasi 0 ref (TD-15).
- [ ] **F7.** Seragamkan loading/empty/error state lintas list page (TD-35).
- [ ] **F8.** Lanjutkan audit RLS: ganti `is_admin_or_above`→`is_manager_or_above` Bucket B (master config, butuh keputusan bisnis) + audit DELETE policy tabel ber-`deleted_at` (TD-01/TD-03; oversight read & 4 DELETE policy sudah selesai).
- [ ] **F10.** **TD-74** — ✅ **bagian mekanis SELESAI 2026-07-17:** migrasi sudah direkam (`supabase/migrations/20260717000000_quotations_exchange_rates.sql` + `20260717000001_save_quotation_exchange_rates.sql`, byte-exact + banner "BUKAN untuk dijalankan lagi") **dan** `pg_dump` sudah dijalankan → snapshot segar untuk `quotations.exchange_rates` (`schema_snapshot.sql:4044`) + body baru `save_quotation` (`:1013`) **dan** `sp_items.price_category`/`review_status` (`:4295-4296`, TD-72b). **Jangan dump ulang untuk ini.** **Sisa F10 = keputusan Den (jangan dikerjakan buta):** nasib tabel dorman `public.exchange_rates` (master FX, 0 query — hidupkan/rename/drop?) + kapan `quotations.usd_rate` (vestigial) di-drop (**deploy kode yang berhenti menulis DULU, baru drop**). Detail & bukti: TD-74(c)/(d).
- [ ] **F9.** Sisa **TD-64** (= **D-01** di `18_CRM_SALES_PRF_PENDING_AUDIT.md`, P0): map `supervisor` ke `PERMISSIONS`/`ROLES` + putuskan nasib `sales_spv` (phantom role id di `QuotationFormPage.jsx:41-44`). `gm_bd` **sudah** beres (17 Jul, `App.jsx:289`, identik `sales` — sudah di-commit (`0d9f26f`), belum tes runtime). **Butuh keputusan Den:** `supervisor` mirror `manager` atau `sales`? Detail & bukti: TD-64.
- [ ] **F11.** Lanjutan PRF pasca "Cetak PRF dari inquiry" (18 Jul 2026, mandat MI — sudah menutup **sebagian** TD-79 + memberi nuansa TD-76; belum tes runtime). Sisa: **(a)** **TD-76** inti tetap OPEN — form PRF masih **create-only** → **draft tak bisa dibuka-ulang** (list read-only sudah ada di Forwarding-MSI + panel per-inquiry, tapi bukan reopen); **(b)** known limitation RLS `prf_select` → sales hanya lihat PRF miliknya di list/panel (perbaikannya butuh melonggarkan RLS — perlu keputusan Den); **(c)** **TD-79** lanjutan opsional — prefill weight/volume/dimension (belum di v1); **(d)** **TD-89** (LOW) — mapping vocab incoterms inquiry↔PRF. Detail: TD-76/TD-79/TD-89 + `05_WORKFLOW_MAP` §Procurement.

> Prioritas tech-debt aktif: **F2** (~65 `console.*`), **F3** (~33 `.single()`), **F4** (~97 `.limit()`), **F5** (file >800 baris), **F6** (dead code `*.legacy.jsx`), **F9** (TD-64 sisa — murah, P0). **F10** (TD-74): bagian mekanis **sudah beres 17 Jul** (migrasi direkam + snapshot ter-refresh) → sisanya keputusan desain, bukan antrean kerja.

### G. Topbar & Dropdown lanjutan
- [ ] **G1.** **Migrasi `SERVICE_TYPE_LABELS` (display map)** di `QuotationDetailPage.jsx`, `InquiryListPage.jsx`, `QuotationListPage.jsx` → ambil label dari `dropdown_options` (`service_type`) via `useDropdownOptions` (bikin helper value→label). Lanjutan 2.11E (form sudah DB-driven; label display belum).
- [ ] **G2.** **Entity switcher navbar** — Step 3 dari 4 fitur topbar (setelah notification bell + pending approval badge). Switch entity aktif MSI/JCI/SOA dari topbar.
- [ ] **G3.** **Search bar navbar** — Step 4 topbar. Global search (debounce ≥300ms; scope per modul/role).
- [ ] **G4.** **Seed status/stage CRM ke `status_catalog`** (pipeline/inquiry/quotation/activity/hrga status) + konsumsi via fetch. Tabel `status_catalog` sudah ada (generic, `applicable_modules` jsonb). Lanjutan migrasi dropdown hardcoded.

### H. Storbit SP — FASE 4-5 + tech debt FASE 0-3 (aktif/next)
> Kondisi: FASE 0-3 (mesin status s/d BTB_TERBIT) LIVE. Detail: `03_DATA_MODEL`/`05_WORKFLOW_MAP`/`09_ROADMAP`.
- [ ] **H1. FASE 4 — invoice (AUDIT + DESAIN dulu, bukan wiring).** Bangun ENTITAS baru: tabel invoice + line (nilai/pajak), penomoran via `increment_document_sequence`, relasi `sp_order_id`/`sp_btb`, gate SP TERKIRIM_PENUH/BTB_TERBIT → status INVOICED. Mulai dari audit alur finance + desain skema (pola FASE 0). *(planned)*
- [ ] **H2. FASE 5 — payment/LUNAS** (setelah H1): modul pembayaran → status LUNAS. *(planned)*
- [ ] **H3. Enforce margin floor** (TD-38, HIGH) — blok/warn save quotation bila margin < `margin_floor` (idealnya server-side di RPC `save_quotation`). Approval diskon downstream: **perlu konfirmasi**.
- [ ] **H4. RLS proper (company-scoped)** (TD-39, HIGH) — perketat ~48 policy `USING(true)`; prioritas SP/gudang (`sp_items`/`picking_lists`/`delivery_notes`/`stock_ledger`). Superset TD-04.
- [ ] **H5. Drop `sp_btbs` + dead code SP** (TD-41) — hapus 4 helper legacy `db.js` (0 caller: `listSpBtbs`/`addSpBtb`/`deleteSpBtb`/`bulkInsertSpBtbs`) + drop tabel `sp_btbs` (data sudah migrasi) + hapus `AppLauncher.jsx`. (`*.legacy.jsx` = **F6**/TD-15.)
- [ ] **H6. Loose ends FASE 0-3** — sync `sp_order_items.shipped_qty` kanonik dari dispatch (TD-40, low); update `DESIGN_SP_SCHEMA.md` rank BTB (TD-42); dokumentasi Edge Functions (TD-44); verifikasi integrasi email/n8n (TD-43).
- [ ] **H7. Level 2 — Kunci Harga Edit Item SP (🟡 SEBAGIAN DIEKSEKUSI — belum tuntas).** Hasil sesi perancangan; **1 sub-item UI sudah dikerjakan** (harga read-only di EditItemModal — branch `fix/lock-price-edit-item`, **sudah merge (`595ab51`), belum tes runtime**). Backfill/RLS/dropdown kategori/migrasi **belum jalan** (kecuali 1 ALTER TABLE, lihat status). Direkam agar konteks tak hilang antar-sesi.
  - **Tujuan/keputusan desain (final):** Di **EditItemModal** (`SalesOrderDetailPage.jsx`) kolom harga `unit_price` jadi **READ-ONLY, autofill dari Master Product sesuai kategori**. Operations hanya bisa ganti **KATEGORI**, tak bisa ketik harga manual. **Shipping price TIDAK dikunci** (tetap editable).
  - **Sifat harga:** **snapshot di `sp_items`** (terverifikasi: tak ada trigger sync antar-tabel; `sp_order_items` = cabang mati write-once — lihat `16_SP_TABLES_SYNC_AUDIT.md` + **TD-49**/**TD-40**). Referensi audit kesiapan: `15_INPUT_CONTROL_AUDIT.md` (Misi 1) + `16_SP_TABLES_SYNC_AUDIT.md`.
  - **Role yang boleh ganti kategori:** **Super Admin + Operations** (perluasan dari rencana awal "super admin saja"). **Enforcement sampai RLS** (bukan client-only). RBAC company-scoped 3 entitas (MSI/JCI/SOA) — role diduplikat per company (by design) → RLS harus **company-aware** (contoh nyata: **Gigih Rizky = Operations @ PT Stuja Orbit Abadi / SOA**).
  - **Dependency (sudah ada, tinggal di-port):** mekanisme kategori sudah jalan di **Input SP** (`CAT_DEFS`/`availCatsOf`, per `15_INPUT_CONTROL_AUDIT.md`) — tinggal di-port ke EditItemModal.
  - **Aturan bisnis (konfirmasi tim operational — konteks desain):**
    - **Kategori harga ditentukan MANUAL per PKS** (Perjanjian Kerja Sama), **tidak bisa diturunkan otomatis**. Alasan: ada anomali **SP dibuat Juni tapi rilis Juli memakai harga lama** → tanggal/periode SP bukan penentu kategori yang andal. Konsekuensi desain: dropdown kategori (lihat "BELUM dikerjakan") = **input manusia**, jangan di-auto-select dari tanggal/periode.
    - **Harga SP lama TIDAK berubah walau Master Product di-update**, kecuali ada **koreksi khusus**. → Ini **mengukuhkan sifat snapshot `sp_items.unit_price`** (lihat "Sifat harga" di atas + `16_SP_TABLES_SYNC_AUDIT.md`) sebagai **keputusan bisnis yang disengaja**, bukan sekadar keterbatasan teknis.
    - **Menjawab pertanyaan terbuka `15_INPUT_CONTROL_AUDIT.md` (Misi 1) "snapshot vs re-derive dari master": jawabannya SNAPSHOT (tetap) — re-derive DITOLAK.** Autofill kategori (lihat "BELUM dikerjakan") karenanya hanya berlaku **saat kategori diganti** (menulis snapshot baru), **bukan** re-derive harga tiap render/simpan.
  - **STATUS EKSEKUSI:**
    - ✅ **UI — `unit_price` di EditItemModal SUDAH `readOnly`** (branch `fix/lock-price-edit-item`, **sudah merge ke `main` (`595ab51`)**; belum tes manual runtime). 1 file, +4/−2: `SalesOrderDetailPage.jsx:403-411` — `onChange` dibuang, styling terkunci (`C.surface2`/`C.inkSoft`/`cursor:not-allowed`, pola `ModalInp`), hint "Terkunci — ubah lewat Master Product", `onWheel={blurOnWheel}` (TD-71) dipertahankan. **Tak seorang pun bisa ketik harga** (termasuk super admin). Build clean (2585 modules, 1.42s); **belum tes manual runtime**.
      - ⚠️ **Beda dari desain:** yang jalan baru **read-only**, **BUKAN "autofill dari Master Product sesuai kategori"** — harga **tetap snapshot tersimpan** (`draft.unitPrice`), tak di-re-derive. Autofill menyusul bareng dropdown kategori (lihat "BELUM dikerjakan").
      - Sengaja TIDAK disentuh: **Shipping Price tetap editable** (`SalesOrderDetailPage.jsx:412-418`, keputusan bisnis); qty/SLA/tanggal/field lain; logika simpan/DB.
    - ✅ Kolom **`price_category` SUDAH ditambah ke `sp_items`** (ALTER manual) + **sudah masuk `schema_snapshot.sql`** (`:4295`, dump 17 Jul). Domain nilai (`default`/`semester`/`legacy` …) **berbeda** dari CHECK `sp_order_items.price_category` (`semester/tahunan/project`) → **perlu konfirmasi user**, jangan diputuskan sepihak — **ini satu-satunya sisa TD-72**.
    - ✅ **Kolom `review_status` ditambah + labeling rekonsiliasi SELESAI (2026-07-16, dijalankan manual di produksi).** Kolom **SEMENTARA** penanda rekonsiliasi SP lama: `review_default` = `unit_price` cocok `products.default_price` · `perlu_review` = beda → **cek kontrak/PKS manual**. **Hasil: 587 `perlu_review` + 140 `review_default` = 727 baris (0 NULL)** → peta rekonsiliasi terbentuk, tinggal ditelusuri manual. **`unit_price` TIDAK diubah** (konsisten keputusan bisnis "harga SP = snapshot"). Kolom ini **bisa DI-DROP setelah rekonsiliasi selesai**.
      - **Relasi ke angka preview lama** ("727 → 142 match / 585 tak match"): **140 `review_default`** = 140 baris `'default'` yang cocok; **587 `perlu_review`** = 585 tak-match **+ 2 `'semester'`** (kedua baris `semester` `unit_price`-nya ≠ `default_price`, jadi ikut masuk `perlu_review` — kriteria labeling hanya membandingkan `unit_price` vs `default_price`, tak mengenal kategori). ⚠️ **PERLU KONFIRMASI USER:** rekonsiliasi 140+587 vs 142+585 ini **belum diverifikasi baris-per-baris** — angkanya konsisten secara aritmetika, tapi asumsi "2 `semester` pindah ke `perlu_review`" belum dibuktikan dengan query.
    - ✅ **ALTER kedua kolom SUDAH direkam migrasi (2026-07-16)** → `supabase/migrations/20260716000000_sp_items_price_category_review_status.sql` (rekaman byte-exact + banner "BUKAN untuk dijalankan lagi"). Sub-item "rekam migrasi" di TD-72 **beres**.
  - **BELUM dikerjakan (sesi berikutnya):**
    - [ ] **Backfill `price_category` beneran (UPDATE) — MASIH PENDING.** ⚠️ Yang sudah jalan 2026-07-16 **baru labeling `review_status`**, **BUKAN** pengisian `price_category` — kolom `price_category` **masih kosong/NULL** untuk SP lama. Perlu SQL + preview per baris, mengacu peta `review_status` di atas + keputusan: yang tak match ditandai **`'legacy'`**, `unit_price` **TIDAK diubah**.
    - [ ] RLS company-aware "hanya Super Admin + Operations boleh ubah `price_category`".
    - [x] ✅ **Refresh `schema_snapshot.sql` — BERES (2026-07-17).** `pg_dump` sudah dijalankan user: `price_category` + `review_status` kini termuat (`schema_snapshot.sql:4295-4296`); dump yang sama juga menutup **TD-74(b)** (`quotations.exchange_rates` `:4044` + body baru `save_quotation` `:1013`). **Tak perlu dump ulang.** Sisa utang TD-72 tinggal **domain nilai `price_category`** (keputusan user).
    - [ ] Putuskan kapan **`review_status` di-drop** (setelah rekonsiliasi 587 `perlu_review` selesai ditelusuri) — drop-nya wajib direkam migrasi + refresh snapshot lagi.
    - [ ] UI: **dropdown kategori** di EditItemModal (`SalesOrderDetailPage.jsx`) — port `CAT_DEFS`/`availCatsOf` dari Input SP + **autofill harga dari Master Product sesuai kategori** (bagian read-only sudah jalan, lihat STATUS EKSEKUSI).
    - [ ] 🔴 **BLOCKED — "beku saat LUNAS": harga & kategori tak bisa diubah lagi begitu SP LUNAS** (aturan bisnis, konfirmasi tim operational). Gate perlu di **UI + RLS** (bukan client-only, sama seperti gate kategori di atas).
      - **Fakta terverifikasi (JANGAN tulis "status lunas belum ada di database"):**
        - **`LUNAS` SUDAH ADA** sebagai nilai CHECK `sp_orders.status` — `schema_snapshot.sql:4376` (`DRAFT`…`INVOICED`,`SUBMITTED`,`LUNAS`,`CANCELLED`).
        - **Guard beku SUDAH aktif di mesin status:** `sp_recompute_status` (`schema_snapshot.sql:1266`) → `IF v_status IN ('CANCELLED','INVOICED','SUBMITTED','LUNAS') THEN RETURN;`. **TAPI** guard ini hanya membekukan **mesin status**, **BUKAN** field harga/kategori di UI → H7 **tetap butuh gate sendiri**.
      - **Blocker sebenarnya: belum ada mekanisme yang MENYETEL `sp_orders.status='LUNAS'`.** Tak ada kode/RPC penulis INVOICED/SUBMITTED/LUNAS (di `src/` nilai-nilai itu hanya **label display**: `SalesOrderPage.jsx:82-93`, `SalesOrderDetailPage.jsx:136-138`). Penulisnya = **FASE 4-5 / H1-H2** (*planned*) → **hari ini LUNAS tak terjangkau**, gate tak bisa dites end-to-end.
      - **Sinyal pelunasan lain yang ADA (domain terpisah):** `ar_ttfs.tgl_pembayaran` (`schema_snapshot.sql:1856`, COMMENT: "NULL = not yet paid… calcAR() … Lunas / Partial / Belum Bayar"). Ini **domain AR/finance/penagihan**, yang per `05_WORKFLOW_MAP` **BUKAN** status SP.
      - **PERLU KONFIRMASI (jangan diputuskan sepihak) — sinyal mana yang jadi acuan "lunas" untuk gate H7:** **(a)** `sp_orders.status='LUNAS'` via FASE 4-5 (H1/H2) · **(b)** `ar_ttfs.tgl_pembayaran` (domain AR, lintas-domain) · **(c)** kolom status pelunasan **baru** yang diisi manual tim. User semula menyebut *"diisi manual oleh tim nanti"* → **mungkin** maksudnya **(c)**, tapi **(c) bentrok dgn FASE 4-5** yang sudah direncanakan (dua sumber kebenaran pelunasan) → **konfirmasi dulu**.

### I. Perubahan kecil CRM (dari 14_BACKLOG_RECON)
- [ ] **I1. Rename tombol "Tambah Deal" → "Tambah Leads"** — 1 baris FE, `PipelineKanbanPage.jsx:899` (label terverifikasi). (dari 14_BACKLOG_RECON.md B5)
- [ ] **I2. Template note (preset) di quotation** — sekarang `quotations.notes`/`terms` = field bebas, tak ada preset (terverifikasi nol preset). Perlu desain kecil (daftar preset + picker). (dari 14_BACKLOG_RECON.md B8)
- [ ] **I3. Mekanisme email → email group** — ubah konfigurasi/proses notifikasi ke email group. **Perlu keputusan Den** (konfigurasi, bukan murni kode; kerabat TD-43). (dari 14_BACKLOG_RECON.md B4)

---

## Completed (FASE 0-3 — Storbit SP mesin status, ~Jul 2026)

> Detail: `PROGRESS.md` (2026-07-06…08) + `09_ROADMAP`. Rekaman SQL: `supabase/migrations/20260706*…20260708000002`.

- [x] **FASE 0** — skema baru `sp_orders`/`sp_order_items`/`sp_btb`/`dc_master` + harga kategori produk + RLS + backfill (lama=baru) + dual-write InputSPPage.
- [x] **FASE 1** — `sp_recompute_status` (fact-derived) + DRAFT→…→PACKED + RPC picking (generate/complete/cancel) + fix desync.
- [x] **FASE 2** — jembatan `sp_items.shipped_qty` (dispatch/cancel) + DIKIRIM/SAMPAI/TERKIRIM_PENUH + `mark_delivery_delivered` + reader status list → `sp_orders.status` (2E).
- [x] **FASE 3** — RPC `sp_issue_btb`/`sp_delete_btb` → `sp_btb`; **BTB_TERBIT rank tertinggi**; kartu BTB pindah ke Detail SP; migrasi `sp_btbs`→`sp_btb` (186→205).

> ⚠️ Sebagian "terverifikasi user" (2C, 3 Step E/G); sisanya "belum tes runtime penuh". Debt: `08_TECH_DEBT` TD-38…TD-44.

---

## Completed (24 Jun 2026 — malam, 2.11C–E)

> Dropdown DB-driven end-to-end. Detail di `CLAUDE.md` Recent Changes (2.11C–E).

**Dropdown Management (2.11C–E):**
- [x] **Dropdown Management page** — port Lovable → CC, lalu jadi **Tab 2 di General Preferences** (2.11C–D).
- [x] **`dropdown_options` table + seed (12 list)** — service_type, unit_label, lead_source, lost_reason, activity_type, customer_type, customer_tier, shipment_mode, container_type, incoterm, leave_type, allowance_type (global; RLS write super_admin-only). *(DB — di luar repo)*
- [x] **Full DB-driven CRUD** — `dropdown_options` INSERT/UPDATE/soft-DELETE/toggle/reorder (persist + re-fetch); `currencies`+`payment_terms` toggle-only. Toast sukses/error asli.
- [x] **`useDropdownOptions` hook** — `src/hooks/useDropdownOptions.js` (fetch 1 list_key, fallback array).
- [x] **QuotationForm** — `service_type` + `unit_label` via hook; VAT dari `taxes` (union dgn fallback).
- [x] **InquiryForm** — `service_type` via hook.
- [x] **`taxes` cleanup** — 6 baris duplikat soft-deleted (PPN11/VAT_0 × 3 entitas). *(SQL Editor — di luar repo)*

> ⚠️ 2.11C–E **belum tes manual runtime**. Const lama dipertahankan sbg `*_FALLBACK`. Writes super_admin-only (RLS).

---

## Completed (24 Jun 2026)

> Detail di `CLAUDE.md` Recent Changes (2.11A) + `08_TECH_DEBT.md` (TD-36/TD-37).

**Admin Settings — 4 page baru (port Lovable, 2.11A):**
- [x] **Security Policy** — password/sesi/login-protection/2FA per-role (localStorage `security_policy_*`).
- [x] **Audit Log** — fetch real `user_login_logs` + join `profiles`; filter/pagination/CSV (login-only sampai `audit_logs` — TD-37). ⚠️ **Kondisi 2.11A ini kini sudah TIDAK berlaku** — sumbernya diganti ke `audit_logs` di **hari yang sama** oleh 2.11J (`7e40149`); **TD-37 ditutup DONE 17 Jul 2026**.
- [x] **General Preferences** — lokalisasi/format/tampilan per entitas (localStorage `general_prefs_*`; EntitySwitcher default `useAuth`).
- [x] **Integrations** — WhatsApp/SMTP/n8n/API keys (localStorage `integrations_*`; ⚠️ credentials belum secure — TD-36).
- [x] **`kit.jsx` extended** — +13 ikon lucide + `KitSelect`; hub group "Roadmap"→"Keamanan & Sistem"; 4 route `admin-settings-*` di App.jsx (state-swap). Reuse kit existing, tanpa `adminKit.js`.

> ⚠️ Semua **belum tes manual runtime**. Tanpa ubah DB/RLS, tanpa package baru.

---

## Completed (23 Jun 2026)

> Selesai hari ini. Detail di `CLAUDE.md` Recent Changes + `08_TECH_DEBT.md`.

**Fitur:**
- [x] **CRM Report page** — KPI, trend chart, per-sales breakdown, activity detail, Supabase real data, sidebar menu Report (2.10L–M). *(belum tes manual runtime)*
- [x] **Notification bell** — badge, dropdown, mark-as-read, 4 producers: activity assign/done, HRGA submit/approve (2.10K). *(belum tes manual runtime)*
- [x] **Pending Approval badge** — HRGA pending count, auto-refresh 60s (2.10J). *(belum tes manual runtime)*
- [x] **Quotation** — currency EUR/SGD/JPY/MYR + VAT rate dropdown + kurs per-baris (2.10C/H/I).

**Tech debt:**
- [x] **`console.*` leak** — `AuthContext` 6 dihapus (1 warn + 5 error), `ProductsPage` sudah bersih duluan (TD-32 PARTIAL — sisa ~65 di F2).
- [x] **RLS oversight read** — 3 policy +`is_manager_or_above` (`hrga_requests_read_own`, `hrga_notification_queue_read`, `approval_delegations_read`) + `is_manager_or_above()` +STABLE. Bucket A/B sengaja tak diubah (TD-01 PARTIAL).
- [x] **DELETE policy** — 4 tabel transaksional: `notifications`, `hrga_request_items`, `hrga_offboarding_items`, `sp_btbs` (TD-03 PARTIAL).
- [x] **Quotation save atomik** — RPC `save_quotation` (sejak 2.9C, finalized 2.9O) (TD-09 — sisa FE-calc).

> ⚠️ Perubahan RLS/DELETE: refresh `schema_snapshot.sql` via `pg_dump` bila sudah live di DB (snapshot saat ini mungkin belum mencerminkannya).

---

## Backlog

> Sudah teridentifikasi, belum scheduled. Sumber TECH_DEBT + ROADMAP.

**Maintainability (low-risk, oportunistik):**
- Ekstrak `PASTEL` → `src/lib/tokens.js`, `ENTITY_IDS` → `config/entities.js`, helper `isSuperAdmin()` (TD-14).
- Hapus dead code `*.legacy.jsx` (~1.206 baris) setelah konfirmasi 0 ref (TD-15).
- Ganti 5 hijau terlarang + emoji sisa → token brand + Lucide (TD-17).
- Hapus dead DOM `#quotation-print-area` (TD-16).
- `.single()`→`.maybeSingle()` sisa (TD-10); tambah `.limit()` ke ~97 query (TD-11).
- React warning input read-only (TD-27).

**Refactor besar (SETELAH ada test):**
- Pecah `App.jsx` (~4.667 baris god-file; TD-12) — urutan: konstanta → presentasional → modul Storbit → layout → routing registry. JANGAN big-bang.
- Pecah file >1.000 baris: `CRMDashboardPage` (~1.996), `AssetDetailITPage`, `SalesOrderDetailPage` (TD-13).
- Ekstrak shared: `useRoleScopedQuery`, `DataTablePage`, `Badge`, `Modal`, `lib/format.js`.
- Satukan paradigma styling (inline vs Tailwind).

**Fitur planned (ROADMAP 📋):**
- Modul Finance transaksi (Billing/Invoice, AR Collection, AP, Cash/Bank, Accounting).
- Procurement / PO / Vendor Management.
- Approval engine runtime (eksekusi workflow).
- IT Service Management (ticketing).
- Asset: tabel `asset_documents`/`asset_work_orders`/`asset_routes` + wire tab Maintenance kendaraan; save Add Asset wizard (kini dummy); inline-edit Software & Maintenance (TD-26).
- HRGA Offboarding UI.
- Field Registry Level 1 (custom field JSONB) — nunggu 4 keputusan desain (TD-31).
- CI pipeline (build+lint+test gate; TD-29).
- Total quotation via DB trigger (TD-09).
- Mobile polish per-halaman <1024px (TD-28).

**Data cleanup (bukan kode):**
- Office "Semper" 2 branch duplikat JCI — dedup + ownership (TD-30).
- 24 laptop MSI `assigned_to` kosong — isi setelah re-audit.
- Quotation Hisaka `QUO/MSI/2026/004` — input ulang item.

---

## Template Task Baru

```markdown
### [ID] — [Judul singkat]
**Modul:** (CRM / Foundation / Finance / …)
**Severity/Prioritas:** Critical / High / Medium / Low
**Tipe:** Feature / Bugfix / Refactor / Docs / DB change

**Konteks/Masalah:**
(akar masalah / kebutuhan; link ke TECH_DEBT TD-xx atau ROADMAP)

**Scope (file yang disentuh):**
- src/…

**DB change diperlukan:** Ya/Tidak (kalau ya → ikuti DB Change Checklist + approval)

**Definition of Done:**
- [ ] npm run build clean (catat modules + waktu)
- [ ] Lint net-zero
- [ ] Tidak ubah file di luar scope
- [ ] Tes manual: (sebutkan langkah)
- [ ] Update CLAUDE.md + PROGRESS.md

**Catatan:** (audit-before-fix? dependency ke task lain?)
```

---

## Template Change Request (perubahan besar)

> Untuk perubahan besar (DB change, migrasi modul, refactor lintas-file, RLS) — task kecil/rutin cukup Template Task Baru di atas. Perubahan DB/RLS WAJIB approval eksplisit sebelum eksekusi.

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

> Contoh historis: CR-001 (migrasi PDF `@react-pdf`) = `09_ROADMAP` §Quotation + fase 2.10A; CR-002 (migrasi RLS RBAC-driven) = TD-01 (`08_TECH_DEBT`).
